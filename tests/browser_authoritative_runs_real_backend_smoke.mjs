import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

const require = createRequire(import.meta.url);
const sqlite3 = require('../server/node_modules/sqlite3').verbose();

const appUrl = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/browser-authoritative-runs-real-backend-smoke';
const reportPath = path.join(outDir, 'report.json');
const dbPath = process.env.BROWSER_AUTHORITATIVE_RUNS_DB_PATH
  || path.join(os.tmpdir(), `the-defier-authoritative-runs-${process.pid}.sqlite`);
const requestedPort = Number(process.env.BROWSER_AUTHORITATIVE_RUNS_PORT || 0);
const opsToken = 'authoritative-runs-browser-ops-token';
const unique = `${Date.now().toString(36)}${process.pid.toString(36)}`.slice(-12);
const username = `ars102${unique}`.slice(0, 20);
const password = `pwd_${unique}_authoritative`;
const findings = [];
const consoleErrors = [];
let browser = null;
let backend = null;
let port = 0;
let apiUrl = '';

fs.mkdirSync(outDir, { recursive: true });
fs.rmSync(reportPath, { force: true });

function add(name, pass, detail = '') {
  findings.push({ name, pass: !!pass, detail: String(detail || '') });
}

function recordConsoleError(value) {
  const message = String(value || '');
  if (/favicon|ERR_CONNECTION_(CLOSED|RESET)|404 \(Not Found\)/i.test(message)) return;
  consoleErrors.push(message);
}

function removeDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
}

function dbGet(sql, params = []) {
  const db = new sqlite3.Database(dbPath);
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      db.close();
      if (error) reject(error);
      else resolve(row || null);
    });
  });
}

async function reservePort(preferred = 0) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: preferred }, resolve);
  });
  const address = server.address();
  const selected = typeof address === 'object' && address ? address.port : preferred;
  await new Promise(resolve => server.close(resolve));
  return selected;
}

function startBackend() {
  const child = spawn(process.execPath, ['server/app.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      JWT_SECRET: 'authoritative-runs-browser-jwt-secret-32',
      DEFIER_HMAC_SECRET: 'authoritative-runs-browser-hmac-secret-32',
      DEFIER_INTEGRITY_REQUIRED: '1',
      DEFIER_OPS_TOKEN: opsToken,
      DEFIER_DB_PATH: dbPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  return { child, getOutput: () => output };
}

async function stopBackend() {
  if (!backend || backend.child.killed || backend.child.exitCode !== null) return;
  backend.child.kill('SIGTERM');
  await new Promise(resolve => {
    const timer = setTimeout(resolve, 2500);
    backend.child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitForHealth() {
  const deadline = Date.now() + 15000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (backend.child.exitCode !== null) {
      throw new Error(`backend exited before health check: ${backend.child.exitCode}\n${backend.getOutput()}`);
    }
    try {
      const response = await fetch(`${apiUrl}/api/health`);
      const payload = await response.json();
      if (response.ok && payload.status === 'ok') return payload;
      lastError = new Error(`health ${response.status}: ${JSON.stringify(payload)}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`backend health timeout: ${lastError?.message || 'unknown'}\n${backend.getOutput()}`);
}

function cssValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function readPanel(page) {
  return page.evaluate(() => {
    const panel = window.game?.seasonOpsView?.authoritativeRunPanel;
    const projection = panel?.getCurrentProjection?.() || null;
    const challengeLadderState = panel?.challengeLadderService?.getState?.()
      || panel?.challengeLadderState
      || null;
    return {
      projection,
      status: panel?.getStatus?.() || '',
      runMeta: panel?.lastRunMeta || null,
      receipt: panel?.lastReceipt || null,
      busy: panel?.isBusy?.() || false,
      error: panel?.serviceState?.lastError || null,
      currentMode: panel?.getCurrentMode?.() || '',
      challengeLadderState,
    };
  });
}

async function waitForPanel(page, predicate, argument, timeout = 15000) {
  await page.waitForFunction(predicate, argument, { timeout });
  return readPanel(page);
}

async function openAuthoritativeTab(page) {
  await page.evaluate(async () => {
    await window.game.showSeasonOps('authoritative');
    for (const id of ['save-slots-modal', 'auth-modal', 'generic-confirm-modal', 'save-conflict-modal']) {
      document.getElementById(id)?.classList.remove('active');
    }
  });
  await page.waitForSelector('#season-ops-screen.active .season-ops-authoritative-panel');
}

async function selectAuthoritativeMode(page, mode) {
  await page.locator(`[data-season-ops-action="authoritative-select-mode"][data-mode="${cssValue(mode)}"]`).click({ force: true });
  return waitForPanel(
    page,
    expectedMode => {
      const panel = window.game?.seasonOpsView?.authoritativeRunPanel;
      return panel?.getCurrentMode?.() === expectedMode && !panel?.isBusy?.();
    },
    mode,
  );
}

async function readChallengeHub(page) {
  return page.evaluate(() => ({
    currentScreen: window.game?.currentScreen || '',
    activeTab: window.game?.challengeHubState?.tab || '',
    title: document.getElementById('challenge-hub-title')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    subtitle: document.getElementById('challenge-hub-subtitle')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    summaryText: document.getElementById('challenge-hub-summary')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    rulesText: document.getElementById('challenge-hub-rules')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    rewardsText: document.getElementById('challenge-hub-rewards')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    rankingText: document.getElementById('challenge-hub-ranking')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    launchText: document.getElementById('challenge-hub-launch')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    rankRowCount: document.querySelectorAll('[data-challenge-ladder-rank]').length,
    authoritativeRewardCount: document.querySelectorAll('#challenge-hub-rewards [data-authoritative-milestone]').length,
    legacyClaimCount: document.querySelectorAll('#challenge-hub-rewards [data-challenge-action="claim-milestone"]').length,
    launchCta: document.querySelector('[data-challenge-action="open-authoritative-ladder"]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
  }));
}

async function openChallengeHubGlobal(page, expectedRemainingAttempts = null) {
  await page.evaluate(() => {
    for (const id of ['save-slots-modal', 'auth-modal', 'generic-confirm-modal', 'save-conflict-modal']) {
      document.getElementById(id)?.classList.remove('active');
    }
    window.game?.showChallengeHub?.('global');
  });
  await page.waitForSelector('#challenge-screen.active #challenge-hub-ranking', { timeout: 15000 });
  await page.waitForFunction(
    expected => {
      const tab = window.game?.challengeHubState?.tab || '';
      const rankingText = document.getElementById('challenge-hub-ranking')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const launchText = document.getElementById('challenge-hub-launch')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (window.game?.currentScreen !== 'challenge-screen' || tab !== 'global') return false;
      if (!/权威众生榜/.test(rankingText) || !/权威众生试炼|离线练习/.test(launchText)) return false;
      if (expected === null) return /正式次数/.test(rankingText);
      return rankingText.includes(`正式次数 ${expected}/3`);
    },
    expectedRemainingAttempts,
    { timeout: 20000 },
  );
  await page.waitForTimeout(400);
  return readChallengeHub(page);
}

async function openLadderFromChallengeHub(page) {
  await page.locator('[data-challenge-action="open-authoritative-ladder"]').click({ force: true });
  await page.waitForSelector('#season-ops-screen.active .season-ops-authoritative-panel', { timeout: 15000 });
  return waitForPanel(
    page,
    () => {
      const panel = window.game?.seasonOpsView?.authoritativeRunPanel;
      const state = panel?.challengeLadderService?.getState?.() || panel?.challengeLadderState || {};
      return panel?.getCurrentMode?.() === 'challenge_ladder'
        && !!state?.current
        && !panel?.isBusy?.();
    },
    null,
    20000,
  );
}

async function prepareLoggedInPage(page) {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => !!window.game && !!window.__THE_DEFIER_SERVICES__?.BackendClient && !!window.__THE_DEFIER_SERVICES__?.AuthService,
    null,
    { timeout: 30000 },
  );
  const login = await page.evaluate(async ({ username, password }) => {
    const { BackendClient, AuthService } = window.__THE_DEFIER_SERVICES__;
    BackendClient.REQUEST_TIMEOUT_MS = 10000;
    BackendClient.NETWORK_RETRY = 0;
    BackendClient.clearServerSession();
    const initialized = BackendClient.init();
    if (!initialized?.success) return { success: false, stage: 'init', initialized };
    const registered = await AuthService.register(username, password);
    if (!registered?.success) return { success: false, stage: 'register', registered };
    const authenticated = await AuthService.login(username, password);
    return { success: !!authenticated?.success, stage: 'login', authenticated, user: AuthService.getCurrentUser() };
  }, { username, password });
  add('real backend account registration and login', login.success, JSON.stringify({
    success: login.success,
    stage: login.stage,
    userId: login.user?.objectId || login.user?.id || '',
    username: login.user?.username || '',
  }));
  if (!login.success) throw new Error(`real backend login failed: ${JSON.stringify(login)}`);
  await openAuthoritativeTab(page);
}

function chooseDecision(projection) {
  if (!projection) return null;
  if (projection.phase === 'route') {
    const choice = projection.route?.choices?.[0];
    return choice ? {
      command: 'select_node',
      selector: `[data-season-ops-action="authoritative-select-node"][data-node-id="${cssValue(choice.nodeId)}"]`,
    } : null;
  }
  if (projection.phase === 'reward') {
    const choices = Array.isArray(projection.reward?.choices) ? projection.reward.choices : [];
    const choice = (Number(projection.player?.hp || 0) < 22
      ? choices.find(entry => entry.kind === 'heal')
      : choices.find(entry => entry.kind === 'card')) || choices[0];
    return choice ? {
      command: 'choose_reward',
      selector: `[data-season-ops-action="authoritative-choose-reward"][data-reward-id="${cssValue(choice.rewardId)}"]`,
    } : null;
  }
  if (projection.phase !== 'battle') return null;
  const incoming = Number(projection.battle?.enemy?.intent?.amount || 0);
  const playerBlock = Number(projection.player?.block || 0);
  const energy = Number(projection.player?.energy || 0);
  const blockCards = new Set(['guard', 'iron_mandate']);
  const cards = [...(projection.player?.hand || [])].sort((left, right) => {
    const leftBlocks = blockCards.has(left.cardId) ? 1 : 0;
    const rightBlocks = blockCards.has(right.cardId) ? 1 : 0;
    const defenseOrder = incoming > playerBlock ? rightBlocks - leftBlocks : leftBlocks - rightBlocks;
    return defenseOrder || Number(right.cost || 0) - Number(left.cost || 0)
      || String(left.instanceId).localeCompare(String(right.instanceId));
  });
  const card = cards.find(entry => Number(entry.cost || 0) <= energy);
  return card ? {
    command: 'play_card',
    selector: `[data-season-ops-action="authoritative-play-card"][data-card-instance-id="${cssValue(card.instanceId)}"]`,
  } : {
    command: 'end_turn',
    selector: '[data-season-ops-action="authoritative-end-turn"]',
  };
}

async function clickDecision(page, decision, before) {
  await page.evaluate(() => {
    for (const id of ['save-slots-modal', 'auth-modal', 'generic-confirm-modal', 'save-conflict-modal']) {
      document.getElementById(id)?.classList.remove('active');
    }
  });
  const target = page.locator(decision.selector).first();
  await target.waitFor({ state: 'visible', timeout: 10000 });
  await target.scrollIntoViewIfNeeded();
  await target.click({ force: true });
  return waitForPanel(
    page,
    ({ runId, version }) => {
      const panel = window.game?.seasonOpsView?.authoritativeRunPanel;
      const projection = panel?.getCurrentProjection?.();
      return !!projection
        && projection.runId === runId
        && Number(projection.version) > Number(version)
        && !panel?.isBusy?.();
    },
    { runId: before.projection.runId, version: before.projection.version },
  );
}

async function readLayout(page) {
  return page.evaluate(() => {
    const root = document.getElementById('season-ops-screen');
    const visibleButtons = [...root.querySelectorAll('button')].filter(button => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    return {
      viewportWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      rootClientWidth: root.clientWidth,
      rootScrollWidth: root.scrollWidth,
      undersized: visibleButtons.map(button => {
        const rect = button.getBoundingClientRect();
        return { text: button.textContent.trim().slice(0, 40), width: rect.width, height: rect.height };
      }).filter(entry => entry.width < 40 || entry.height < 40),
    };
  });
}

async function completeAdditionalMode(page, mode, maxAttempts = 3) {
  await selectAuthoritativeMode(page, mode);
  await page.waitForSelector('[data-season-ops-action="authoritative-begin"]');
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const beginSelector = attempt === 1
      ? '[data-season-ops-action="authoritative-begin"]'
      : '[data-season-ops-action="authoritative-begin-new"]';
    await page.locator(beginSelector).click({ force: true });
    let panel = await waitForPanel(
      page,
      expectedMode => {
        const projection = window.game?.seasonOpsView?.authoritativeRunPanel?.getCurrentProjection?.();
        return projection?.mode === expectedMode && projection?.phase === 'route';
      },
      mode,
    );
    const runId = panel.projection.runId;
    let actionCount = 0;
    while (!['completed', 'defeated', 'abandoned'].includes(panel.projection?.phase) && actionCount < 128) {
      const decision = chooseDecision(panel.projection);
      if (!decision) throw new Error(`${mode} has no playable UI command: ${JSON.stringify(panel)}`);
      panel = await clickDecision(page, decision, panel);
      actionCount += 1;
    }
    if (panel.projection?.phase === 'defeated' && attempt < maxAttempts) continue;
    if (panel.projection?.phase !== 'completed') {
      throw new Error(`${mode} did not complete after ${attempt} attempt(s): ${JSON.stringify(panel)}`);
    }
    await page.locator('[data-season-ops-action="authoritative-settle"]').click({ force: true });
    panel = await waitForPanel(
      page,
      expectedRunId => {
        const candidate = window.game?.seasonOpsView?.authoritativeRunPanel;
        return candidate?.lastRunMeta?.runId === expectedRunId
          && candidate?.lastRunMeta?.status === 'settled'
          && candidate?.lastReceipt?.integrity?.fullReplayPassed === true
          && !candidate?.isBusy?.();
      },
      runId,
      20000,
    );
    const replay = await page.evaluate(async targetRunId => {
      const { BackendClient } = window.__THE_DEFIER_SERVICES__;
      const user = BackendClient.getCurrentUser();
      return BackendClient.getAuthoritativeRunReplay(targetRunId, { expectedUserId: user?.objectId || user?.id || '' });
    }, runId);
    if (!replay?.success || replay?.replay?.verified !== true || replay?.replay?.finalState?.phase !== 'completed') {
      throw new Error(`${mode} verified replay missing: ${JSON.stringify(replay)}`);
    }
    return { mode, runId, actionCount, attempt, replayActionCount: replay.replay.actionCount };
  }
  throw new Error(`${mode} exhausted authoritative attempts`);
}

try {
  removeDbFiles();
  port = await reservePort(requestedPort);
  apiUrl = `http://127.0.0.1:${port}`;
  backend = startBackend();
  const health = await waitForHealth();
  add('real backend boots schema V7', health?.schema?.version === 7 && health?.schema?.currentMigrationId === '0007_authoritative_challenge_ladder', JSON.stringify(health?.schema || {}));

  const launchArgs = [];
  if (new URL(appUrl).protocol === 'https:') {
    launchArgs.push(
      '--disable-web-security',
      '--allow-running-insecure-content',
      '--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults',
    );
  }
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    args: launchArgs,
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.addInitScript(targetApiUrl => {
    localStorage.setItem('theDefierDebug', 'true');
    localStorage.setItem('theDefierServerConfig', JSON.stringify({ baseUrl: targetApiUrl }));
    window.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.dataset.authoritativeRunsSmoke = 'hide-save-slot-modal';
      style.textContent = '#save-slots-modal { display: none !important; pointer-events: none !important; }';
      document.head.appendChild(style);
    });
  }, apiUrl);
  const page = await context.newPage();
  page.on('console', message => {
    if (message.type() === 'error') recordConsoleError(message.text());
  });
  page.on('pageerror', error => recordConsoleError(error));
  await prepareLoggedInPage(page);

  const ladderCurrentBefore = await page.evaluate(async () => {
    const { BackendClient } = window.__THE_DEFIER_SERVICES__;
    const user = BackendClient.getCurrentUser();
    return BackendClient.getChallengeLadderCurrent({
      expectedUserId: user?.objectId || user?.id || '',
    });
  });
  add('challenge ladder GET current returns initial allowance before any formal run', ladderCurrentBefore?.success === true
    && ladderCurrentBefore?.protocolVersion === 'authoritative-challenge-ladder-v1'
    && Number(ladderCurrentBefore?.allowance?.attemptLimit) === 3
    && Number(ladderCurrentBefore?.allowance?.usedAttempts) === 0
    && Number(ladderCurrentBefore?.allowance?.remainingAttempts) === 3
    && !ladderCurrentBefore?.personalBest
    && Array.isArray(ladderCurrentBefore?.leaderboard?.entries)
    && ladderCurrentBefore.leaderboard.entries.length === 0, JSON.stringify(ladderCurrentBefore));

  const challengeHubBefore = await openChallengeHubGlobal(page, 3);
  add('challenge hub global UI shows formal attempts and official ladder copy before submission', challengeHubBefore.currentScreen === 'challenge-screen'
    && challengeHubBefore.activeTab === 'global'
    && /众生试炼/.test(challengeHubBefore.title)
    && /权威众生榜/.test(challengeHubBefore.rankingText)
    && /正式次数 3\/3/.test(challengeHubBefore.rankingText)
    && /server_authoritative/.test(challengeHubBefore.rankingText)
    && challengeHubBefore.summaryText.includes(ladderCurrentBefore.rotation.title)
    && challengeHubBefore.rulesText.includes(ladderCurrentBefore.rotation.scoring.formulaText)
    && challengeHubBefore.authoritativeRewardCount === ladderCurrentBefore.milestones.length
    && challengeHubBefore.legacyClaimCount === 0
    && /荣誉/.test(challengeHubBefore.rewardsText)
    && /本周尚无正式成绩/.test(challengeHubBefore.rankingText)
    && /进入权威众生试炼/.test(challengeHubBefore.launchText), JSON.stringify(challengeHubBefore));
  add('global formal surface uses the server rotation and excludes legacy local rewards', challengeHubBefore.summaryText.includes(ladderCurrentBefore.rotation.title)
    && challengeHubBefore.rulesText.includes(ladderCurrentBefore.rotation.scoring.formulaText)
    && challengeHubBefore.authoritativeRewardCount === ladderCurrentBefore.milestones.length
    && challengeHubBefore.legacyClaimCount === 0, JSON.stringify(challengeHubBefore));
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-ladder-hub-before.png'), 'browser_authoritative_runs_real_backend_smoke', { timeout: 9000 });

  let panel = await openLadderFromChallengeHub(page);
  add('challenge hub CTA opens the authoritative challenge ladder mode', panel.currentMode === 'challenge_ladder'
    && !panel.projection
    && Number(panel.challengeLadderState?.current?.allowance?.remainingAttempts) === 3, JSON.stringify({
      currentMode: panel.currentMode,
      ladderState: panel.challengeLadderState?.current ? {
        remainingAttempts: panel.challengeLadderState.current.allowance?.remainingAttempts,
        attemptLimit: panel.challengeLadderState.current.allowance?.attemptLimit,
      } : null,
    }));
  add('authoritative ladder panel renders real attempt chips and no-score state', Number(panel.challengeLadderState?.current?.allowance?.attemptLimit) === 3
    && Number(panel.challengeLadderState?.current?.allowance?.remainingAttempts) === 3
    && !panel.challengeLadderState?.current?.personalBest, JSON.stringify(panel.challengeLadderState?.current || null));

  await page.waitForSelector('[data-season-ops-action="authoritative-begin"]');
  await page.locator('[data-season-ops-action="authoritative-begin"]').click();
  panel = await waitForPanel(
    page,
    () => {
      const candidate = window.game?.seasonOpsView?.authoritativeRunPanel;
      const projection = candidate?.getCurrentProjection?.();
      return candidate?.getCurrentMode?.() === 'challenge_ladder'
        && projection?.mode === 'challenge_ladder'
        && projection?.phase === 'route';
    },
  );
  const runId = panel.projection.runId;
  add('formal challenge ladder attempt binds a server-authoritative run', /^arun-/.test(runId)
    && panel.currentMode === 'challenge_ladder'
    && panel.projection?.mode === 'challenge_ladder'
    && panel.runMeta?.trustTier === 'server_authoritative'
    && panel.challengeLadderState?.attempt?.runId === runId
    && Number(panel.challengeLadderState?.attempt?.attemptIndex) === 1
    && Number(panel.challengeLadderState?.attempt?.seedSlot) === 1, JSON.stringify({
      runMeta: panel.runMeta,
      attempt: panel.challengeLadderState?.attempt,
    }));
  const publicProjectionJson = JSON.stringify(panel.projection);
  add('public projection hides seed and ordered draw pile', !/"(?:seed|rng|drawPile)"/.test(publicProjectionJson));
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-ladder-route-desktop.png'), 'browser_authoritative_runs_real_backend_smoke', { timeout: 9000 });

  let actionCount = 0;
  let reloadChecked = false;
  let refreshChecked = false;
  let openingFairnessChecked = false;
  while (!['completed', 'defeated', 'abandoned'].includes(panel.projection?.phase) && actionCount < 128) {
    const before = panel;
    const decision = chooseDecision(before.projection);
    if (!decision) throw new Error(`no playable UI command: ${JSON.stringify(before)}`);
    panel = await clickDecision(page, decision, before);
    actionCount += 1;

    if (!openingFairnessChecked && panel.projection.phase === 'battle') {
      const intent = Number(panel.projection.battle?.enemy?.intent?.amount || 0);
      const maxHp = Number(panel.projection.player?.maxHp || 0);
      openingFairnessChecked = true;
      add('opening enemy intent cannot one-shot full health', intent >= 0 && maxHp > 0 && intent < maxHp, `${intent}/${maxHp}`);
      await safeAuditScreenshot(page, path.join(outDir, 'challenge-ladder-battle-desktop.png'), 'browser_authoritative_runs_real_backend_smoke', { timeout: 9000 });
    }

    if (!refreshChecked && panel.projection.phase === 'battle') {
      const versionBeforeRefresh = panel.projection.version;
      await page.locator('[data-season-ops-action="authoritative-refresh"]').first().click();
      panel = await waitForPanel(
        page,
        expected => {
          const candidate = window.game?.seasonOpsView?.authoritativeRunPanel;
          const projection = candidate?.getCurrentProjection?.();
          return projection?.runId === expected.runId && Number(projection.version) === expected.version && !candidate?.isBusy?.();
        },
        { runId, version: versionBeforeRefresh },
      );
      refreshChecked = true;
      add('explicit server refresh preserves confirmed projection', panel.projection.version === versionBeforeRefresh);
    }

    if (!reloadChecked && actionCount >= 10 && !['completed', 'defeated', 'abandoned'].includes(panel.projection.phase)) {
      const versionBeforeReload = panel.projection.version;
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(
        () => !!window.game && !!window.__THE_DEFIER_SERVICES__?.BackendClient?.getCurrentUser?.(),
        null,
        { timeout: 30000 },
      );
      await openAuthoritativeTab(page);
      await selectAuthoritativeMode(page, 'challenge_ladder');
      panel = await waitForPanel(
        page,
        expected => {
          const candidate = window.game?.seasonOpsView?.authoritativeRunPanel;
          const projection = candidate?.getCurrentProjection?.();
          return candidate?.getCurrentMode?.() === 'challenge_ladder'
            && projection?.runId === expected.runId
            && Number(projection.version) === expected.version
            && !candidate?.isBusy?.();
        },
        { runId, version: versionBeforeReload },
        20000,
      );
      reloadChecked = true;
      add('full browser reload resumes the same server run', panel.projection.runId === runId && panel.projection.version === versionBeforeReload);
      await safeAuditScreenshot(page, path.join(outDir, 'challenge-ladder-resumed-desktop.png'), 'browser_authoritative_runs_real_backend_smoke', { timeout: 9000 });
    }
  }

  add('real browser strategy completes the formal challenge ladder run without client simulation', panel.projection?.phase === 'completed', `${panel.projection?.phase || 'missing'} after ${actionCount} actions`);
  if (panel.projection?.phase !== 'completed') throw new Error(`challenge ladder run did not complete: ${JSON.stringify(panel)}`);
  await page.locator('[data-season-ops-action="authoritative-settle"]').click();
  panel = await waitForPanel(
    page,
    expectedRunId => {
      const candidate = window.game?.seasonOpsView?.authoritativeRunPanel;
      const ladderState = candidate?.challengeLadderService?.getState?.() || candidate?.challengeLadderState || {};
      return candidate?.lastRunMeta?.runId === expectedRunId
        && candidate?.lastRunMeta?.status === 'settled'
        && candidate?.lastReceipt?.integrity?.fullReplayPassed === true
        && ladderState?.lastResult?.runId === expectedRunId
        && Number(ladderState?.current?.allowance?.usedAttempts) >= 1
        && Number(ladderState?.current?.allowance?.remainingAttempts) === 2
        && !candidate?.isBusy?.();
    },
    runId,
    25000,
  );
  add('settlement auto-submits the challenge ladder result with a full replay receipt', panel.status === 'settled'
    && panel.receipt?.integrity?.fullReplayPassed === true
    && panel.challengeLadderState?.lastResult?.runId === runId, JSON.stringify({
      receipt: panel.receipt,
      lastResult: panel.challengeLadderState?.lastResult,
    }));
  add('settlement receipt confirms full genesis replay', panel.receipt?.integrity?.fullReplayPassed === true, JSON.stringify(panel.receipt));
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-ladder-settled-desktop.png'), 'browser_authoritative_runs_real_backend_smoke', { timeout: 9000 });

  const replay = await page.evaluate(async targetRunId => {
    const { BackendClient } = window.__THE_DEFIER_SERVICES__;
    const user = BackendClient.getCurrentUser();
    return BackendClient.getAuthoritativeRunReplay(targetRunId, { expectedUserId: user?.objectId || user?.id || '' });
  }, runId);
  const replayJson = JSON.stringify(replay);
  add('real replay returns a verified contiguous journal', replay?.success === true
    && replay?.replay?.verified === true
    && replay?.replay?.actionCount === actionCount
    && replay?.replay?.actions?.every((entry, index) => entry.sequence === index + 1), JSON.stringify(replay?.replay && { actionCount: replay.replay.actionCount, phase: replay.replay.finalState?.phase }));
  add('public replay contains no secret RNG material', !/"(?:seed|rng|drawPile)"/.test(replayJson));

  const ladderCurrentAfter = await page.evaluate(async () => {
    const { BackendClient } = window.__THE_DEFIER_SERVICES__;
    const user = BackendClient.getCurrentUser();
    return BackendClient.getChallengeLadderCurrent({
      expectedUserId: user?.objectId || user?.id || '',
    });
  });
  add('challenge ladder GET current after submission returns personal best leaderboard and my rank', ladderCurrentAfter?.success === true
    && ladderCurrentAfter?.personalBest?.runId === runId
    && Number(ladderCurrentAfter?.allowance?.usedAttempts) === 1
    && Number(ladderCurrentAfter?.allowance?.remainingAttempts) === 2
    && Array.isArray(ladderCurrentAfter?.leaderboard?.entries)
    && ladderCurrentAfter.leaderboard.entries.length >= 1
    && Number(ladderCurrentAfter?.leaderboard?.myRank?.rank || 0) >= 1, JSON.stringify(ladderCurrentAfter));

  const persisted = await dbGet(
    `SELECT ar.status AS run_status,
            ar.activity_mode,
            ar.state_version,
            ar.action_count,
            a.status AS attempt_status,
            a.attempt_index,
            a.seed_slot,
            r.result_id,
            r.official_score,
            e.best_result_id,
            e.official_score AS leaderboard_score,
            (SELECT COUNT(*) FROM progression_authoritative_run_receipts WHERE run_id = ?) AS receipt_count,
            (SELECT COUNT(*) FROM progression_events WHERE source_ref = ? AND trust_tier = 'server_authoritative') AS event_count,
            (SELECT COUNT(*) FROM challenge_ladder_mutations WHERE user_id = a.user_id AND request_type = 'submit') AS submit_mutation_count
     FROM progression_authoritative_runs ar
     JOIN challenge_ladder_attempts a ON a.run_id = ar.run_id
     LEFT JOIN challenge_ladder_results r ON r.run_id = ar.run_id
     LEFT JOIN challenge_ladder_entries e ON e.rotation_id = a.rotation_id AND e.user_id = a.user_id
     WHERE ar.run_id = ?`,
    [runId, `authoritative:${runId}`, runId],
  );
  add('database persists settled authoritative receipt plus ladder result and leaderboard entry', persisted?.run_status === 'settled'
    && persisted?.activity_mode === 'challenge_ladder'
    && persisted?.attempt_status === 'submitted'
    && Number(persisted.attempt_index) === 1
    && Number(persisted.seed_slot) === 1
    && Number(persisted.state_version) === actionCount
    && Number(persisted.action_count) === actionCount
    && !!persisted?.result_id
    && persisted?.best_result_id === persisted?.result_id
    && Number(persisted.leaderboard_score) === Number(persisted.official_score)
    && Number(persisted.receipt_count) === 1
    && Number(persisted.event_count) === 1
    && Number(persisted.submit_mutation_count) === 1, JSON.stringify(persisted));

  const challengeHubAfter = await openChallengeHubGlobal(page, 2);
  add('challenge hub global UI refreshes to the real ladder result after submit', challengeHubAfter.currentScreen === 'challenge-screen'
    && challengeHubAfter.activeTab === 'global'
    && /权威众生榜/.test(challengeHubAfter.rankingText)
    && /正式次数 2\/3/.test(challengeHubAfter.rankingText)
    && /server_authoritative/.test(challengeHubAfter.rankingText)
    && challengeHubAfter.summaryText.includes('个人正式最高分')
    && challengeHubAfter.summaryText.includes('938')
    && challengeHubAfter.legacyClaimCount === 0
    && challengeHubAfter.authoritativeRewardCount >= 1
    && challengeHubAfter.rankRowCount >= 1
    && challengeHubAfter.rankingText.includes(username)
    && /继续权威众生试炼|进入权威众生试炼/.test(challengeHubAfter.launchText), JSON.stringify(challengeHubAfter));
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-ladder-hub-after.png'), 'browser_authoritative_runs_real_backend_smoke', { timeout: 9000 });

  await openLadderFromChallengeHub(page);
  const pveResult = await completeAdditionalMode(page, 'pve');
  const challengeResult = await completeAdditionalMode(page, 'challenge');
  const expeditionResult = await completeAdditionalMode(page, 'expedition');
  add('real UI completes and settles all three base authoritative modes alongside challenge ladder', pveResult.replayActionCount === pveResult.actionCount
    && challengeResult.replayActionCount === challengeResult.actionCount
    && expeditionResult.replayActionCount === expeditionResult.actionCount, JSON.stringify({ pveResult, challengeResult, expeditionResult }));

  const aggregate = await dbGet(
    `SELECT
        (SELECT COUNT(*) FROM progression_authoritative_run_receipts) AS receipt_count,
        (SELECT COUNT(*) FROM progression_events WHERE source_kind = 'authoritative_run_settlement' AND trust_tier = 'server_authoritative') AS event_count,
        (SELECT COUNT(*) FROM progression_authoritative_runs WHERE activity_mode = 'pve' AND status = 'settled') AS pve_settled,
        (SELECT COUNT(*) FROM progression_authoritative_runs WHERE activity_mode = 'challenge' AND status = 'settled') AS challenge_settled,
        (SELECT COUNT(*) FROM progression_authoritative_runs WHERE activity_mode = 'expedition' AND status = 'settled') AS expedition_settled,
        (SELECT COUNT(*) FROM progression_authoritative_runs WHERE activity_mode = 'challenge_ladder' AND status = 'settled') AS ladder_settled`,
  );
  add('all base modes and challenge ladder mint exactly one receipt and event per settled run', Number(aggregate?.receipt_count) === 4
    && Number(aggregate?.event_count) === 4
    && Number(aggregate?.pve_settled) === 1
    && Number(aggregate?.challenge_settled) === 1
    && Number(aggregate?.expedition_settled) === 1
    && Number(aggregate?.ladder_settled) === 1, JSON.stringify(aggregate));

  const opsResponse = await fetch(`${apiUrl}/api/progression/ops/authoritative-runs`, {
    headers: { 'x-defier-ops-token': opsToken },
  });
  const ops = await opsResponse.json();
  const opsJson = JSON.stringify(ops);
  add('ops overview reports settlement through redacted references', opsResponse.ok
    && ops?.success === true
    && ops?.totals?.receipts === 4
    && ops?.byStatus?.settled === 4
    && ops?.byMode?.pve >= 1
    && ops?.byMode?.challenge >= 1
    && ops?.byMode?.expedition >= 1
    && ops?.byMode?.challenge_ladder >= 1
    && !opsJson.includes(username)
    && !opsJson.includes(runId), JSON.stringify(ops));

  const sessionToken = await page.evaluate(() => window.__THE_DEFIER_SERVICES__?.BackendClient?.loadServerSession?.()?.token || '');
  const ladderOpsResponse = await fetch(`${apiUrl}/api/challenge-ladder/ops/overview`, {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      'x-defier-ops-token': opsToken,
    },
  });
  const ladderOps = await ladderOpsResponse.json();
  const ladderOpsJson = JSON.stringify(ladderOps);
  add('challenge ladder ops overview reports redacted attempt result and claim aggregates', ladderOpsResponse.ok
    && ladderOps?.success === true
    && Number(ladderOps?.totals?.attempts) === 1
    && Number(ladderOps?.totals?.results) === 1
    && Number(ladderOps?.attemptStates?.submitted) === 1
    && !ladderOpsJson.includes(username)
    && !ladderOpsJson.includes(runId), JSON.stringify(ladderOps));

  await openChallengeHubGlobal(page, 2);
  await openLadderFromChallengeHub(page);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLayout = await readLayout(page);
  add('real settled mobile view has no horizontal overflow', mobileLayout.documentScrollWidth === 390
    && mobileLayout.rootScrollWidth === mobileLayout.rootClientWidth, JSON.stringify(mobileLayout));
  add('real settled mobile controls meet touch target', mobileLayout.undersized.length === 0, JSON.stringify(mobileLayout.undersized));
  await page.locator('[data-season-ops-action="authoritative-begin"]').scrollIntoViewIfNeeded();
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-ladder-settled-mobile.png'), 'browser_authoritative_runs_real_backend_smoke', { timeout: 9000 });
  add('real browser console errors are empty', consoleErrors.length === 0, consoleErrors.join('\n'));
} catch (error) {
  add('authoritative real-backend browser runtime', false, error?.stack || error);
} finally {
  if (browser) await browser.close();
  await stopBackend();
  removeDbFiles();
}

const failed = findings.filter(finding => !finding.pass);
const report = {
  url: appUrl,
  apiUrl,
  generatedAt: new Date().toISOString(),
  summary: {
    total: findings.length,
    failed: failed.length,
    consoleErrors,
  },
  findings,
  consoleErrors,
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0 || consoleErrors.length > 0) process.exit(1);
