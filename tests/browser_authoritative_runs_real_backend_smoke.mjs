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
const switchUsername = `ars104b${unique}`.slice(0, 20);
const switchPassword = `pwd_${unique}_rift_switch`;
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
    const worldRiftState = panel?.worldRiftService?.getState?.()
      || panel?.worldRiftState
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
      worldRiftState,
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
    worldRiftRankRowCount: document.querySelectorAll('[data-world-rift-rank]').length,
    worldRiftRewardCount: document.querySelectorAll('#challenge-hub-rewards [data-world-rift-milestone]').length,
    worldRiftStateVersion: Number(document.querySelector('[data-world-rift-summary]')?.dataset.worldRiftStateVersion || 0),
    worldRiftLaunchCta: document.querySelector('[data-challenge-action="open-authoritative-world-rift"]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
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

async function openChallengeHubRift(page, expectedRemainingAttempts = null) {
  await page.evaluate(() => {
    for (const id of ['save-slots-modal', 'auth-modal', 'generic-confirm-modal', 'save-conflict-modal']) {
      document.getElementById(id)?.classList.remove('active');
    }
    window.game?.showChallengeHub?.('rift');
  });
  await page.waitForSelector('#challenge-screen.active [data-world-rift-summary]', { timeout: 15000 });
  await page.waitForFunction(
    expected => {
      const tab = window.game?.challengeHubState?.tab || '';
      const summaryText = document.getElementById('challenge-hub-summary')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const rankingText = document.getElementById('challenge-hub-ranking')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const launchText = document.getElementById('challenge-hub-launch')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (window.game?.currentScreen !== 'challenge-screen' || tab !== 'rift') return false;
      if (!/真实共斗榜/.test(rankingText) || !/权威共斗|裂隙出征|裂隙余响/.test(launchText)) return false;
      if (expected === null) return /剩余正式次数/.test(summaryText);
      return summaryText.includes(`${expected}/5`);
    },
    expectedRemainingAttempts,
    { timeout: 20000 },
  );
  await page.waitForTimeout(400);
  return readChallengeHub(page);
}

async function openRiftFromChallengeHub(page) {
  await page.locator('[data-challenge-action="open-authoritative-world-rift"]').click({ force: true });
  await page.waitForSelector('#season-ops-screen.active .season-ops-authoritative-panel', { timeout: 15000 });
  return waitForPanel(
    page,
    () => {
      const panel = window.game?.seasonOpsView?.authoritativeRunPanel;
      const state = panel?.worldRiftService?.getState?.() || panel?.worldRiftState || {};
      return panel?.getCurrentMode?.() === 'world_rift'
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

async function exerciseWorldRiftAccountSwitch(page, { runId, version }) {
  const routePattern = '**/api/world-rift/current';
  let held = false;
  let resolveIntercepted;
  let releaseHeld;
  const intercepted = new Promise(resolve => { resolveIntercepted = resolve; });
  const releaseGate = new Promise(resolve => { releaseHeld = resolve; });
  const routeHandler = async route => {
    if (!held) {
      held = true;
      resolveIntercepted();
      await releaseGate;
    }
    await route.continue();
  };
  await page.route(routePattern, routeHandler);
  let staleRefresh = null;
  try {
    staleRefresh = page.evaluate(() => window.game?.seasonOpsView?.authoritativeRunPanel?.refreshProjection?.());
    await Promise.race([
      intercepted,
      new Promise((_, reject) => setTimeout(() => reject(new Error('world-rift current interception timed out')), 10000)),
    ]);
    const switched = await page.evaluate(async credentials => {
      const { AuthService, BackendClient } = window.__THE_DEFIER_SERVICES__;
      const registered = await AuthService.register(credentials.username, credentials.password);
      await window.game?.seasonOpsView?.handleAuthStateChanged?.();
      const user = BackendClient.getCurrentUser();
      return {
        success: registered?.success === true,
        userId: user?.objectId || user?.id || '',
        username: user?.username || '',
      };
    }, { username: switchUsername, password: switchPassword });
    releaseHeld();
    const staleResult = await staleRefresh;
    await page.waitForFunction(
      ({ expectedUsername, oldRunId }) => {
        const { BackendClient } = window.__THE_DEFIER_SERVICES__ || {};
        const user = BackendClient?.getCurrentUser?.();
        const panel = window.game?.seasonOpsView?.authoritativeRunPanel;
        return user?.username === expectedUsername
          && !panel?.getCurrentProjection?.()
          && !JSON.stringify(panel?.worldRiftService?.getState?.() || {}).includes(oldRunId)
          && !panel?.isBusy?.();
      },
      { expectedUsername: switchUsername, oldRunId: runId },
      { timeout: 20000 },
    );
    const switchedPanel = await readPanel(page);
    const restored = await page.evaluate(async credentials => {
      const { AuthService, BackendClient } = window.__THE_DEFIER_SERVICES__;
      const authenticated = await AuthService.login(credentials.username, credentials.password);
      await window.game?.seasonOpsView?.handleAuthStateChanged?.();
      const user = BackendClient.getCurrentUser();
      return {
        success: authenticated?.success === true,
        userId: user?.objectId || user?.id || '',
        username: user?.username || '',
      };
    }, { username, password });
    const resumedPanel = await waitForPanel(
      page,
      expected => {
        const candidate = window.game?.seasonOpsView?.authoritativeRunPanel;
        const projection = candidate?.getCurrentProjection?.();
        return candidate?.getCurrentMode?.() === 'world_rift'
          && projection?.runId === expected.runId
          && Number(projection.version) === expected.version
          && !candidate?.isBusy?.();
      },
      { runId, version },
      25000,
    );
    return { switched, restored, staleResult, switchedPanel, resumedPanel };
  } finally {
    if (releaseHeld) releaseHeld();
    await page.unroute(routePattern, routeHandler);
  }
}

function chooseDecision(projection, { routePolicy = 'safe' } = {}) {
  if (!projection) return null;
  if (projection.phase === 'route') {
    const choices = [...(projection.route?.choices || [])].sort((left, right) => (
      Number(left.routeContract?.difficultyRating || 0) - Number(right.routeContract?.difficultyRating || 0)
    ));
    const choice = routePolicy === 'risky' ? choices.at(-1) : choices[0];
    return choice ? {
      command: 'select_node',
      selector: `[data-season-ops-action="authoritative-select-node"][data-node-id="${cssValue(choice.nodeId)}"]`,
      nodeId: choice.nodeId,
      routeContract: choice.routeContract || null,
    } : null;
  }
  if (projection.phase === 'reward') {
    const choices = Array.isArray(projection.reward?.choices) ? projection.reward.choices : [];
    const hp = Number(projection.player?.hp || 0);
    const maxHp = Math.max(1, Number(projection.player?.maxHp || 1));
    const stage = Number(projection.route?.stage || 0);
    const preferredKind = hp / maxHp < 0.35
      ? 'heal'
      : stage === 1
        ? 'upgrade_card'
        : stage === 2
          ? 'remove_card'
          : 'card';
    const choice = choices.find(entry => entry.kind === preferredKind)
      || choices.find(entry => entry.kind === 'card')
      || choices[0];
    return choice ? {
      command: 'choose_reward',
      selector: `[data-season-ops-action="authoritative-choose-reward"][data-reward-id="${cssValue(choice.rewardId)}"]`,
      rewardKind: choice.kind,
      targetCardInstanceId: choice.targetCardInstanceId || '',
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

async function readRewardDecisionUi(page, decision) {
  if (decision?.command !== 'choose_reward') return null;
  const target = page.locator(decision.selector).first();
  await target.waitFor({ state: 'visible', timeout: 10000 });
  return target.evaluate(element => ({
    text: element.textContent?.replace(/\s+/g, ' ').trim() || '',
    rewardKind: element.getAttribute('data-reward-kind') || '',
    targetCardInstanceId: element.getAttribute('data-target-card-instance-id') || '',
  }));
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
  if (decision.command === 'select_node') {
    await target.evaluate(element => {
      const root = element.closest('#season-ops-screen');
      element.focus({ preventScroll: true });
      if (root) root.scrollTop = 0;
      element.click();
    });
  } else {
    await target.click({ force: true });
  }
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
    const root = document.querySelector('#season-ops-screen.active, #challenge-screen.active')
      || document.getElementById('season-ops-screen');
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

async function completeAdditionalMode(page, mode, { maxAttempts = 3, routePolicy = 'safe' } = {}) {
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
    const rewardKinds = [];
    const rewardUi = [];
    const routeContracts = [];
    const rewardContracts = [];
    let perilousBattleCaptured = false;
    let perilousRewardCaptured = false;
    while (!['completed', 'defeated', 'abandoned'].includes(panel.projection?.phase) && actionCount < 256) {
      const decision = chooseDecision(panel.projection, { routePolicy });
      if (!decision) throw new Error(`${mode} has no playable UI command: ${JSON.stringify(panel)}`);
      if (decision.command === 'select_node' && decision.routeContract) {
        routeContracts.push(decision.routeContract);
      }
      if (decision.command === 'choose_reward') {
        rewardKinds.push(decision.rewardKind);
        rewardUi.push(await readRewardDecisionUi(page, decision));
        const rewardContract = panel.projection?.reward?.routeContract || null;
        const rewardText = await page.locator('.season-ops-authoritative-panel').innerText();
        rewardContracts.push({
          contract: rewardContract,
          choiceCount: panel.projection?.reward?.choices?.length || 0,
          text: rewardText,
        });
        if (rewardContract?.contractId === 'perilous' && !perilousRewardCaptured) {
          perilousRewardCaptured = true;
          await safeAuditScreenshot(page, path.join(outDir, `${mode}-perilous-reward-desktop.png`), 'browser_authoritative_runs_real_backend_smoke', { timeout: 9000 });
        }
      }
      panel = await clickDecision(page, decision, panel);
      actionCount += 1;
      if (panel.projection?.phase === 'battle'
        && panel.projection?.battle?.routeContract?.contractId === 'perilous'
        && !perilousBattleCaptured) {
        perilousBattleCaptured = true;
        await safeAuditScreenshot(page, path.join(outDir, `${mode}-perilous-battle-desktop.png`), 'browser_authoritative_runs_real_backend_smoke', { timeout: 9000 });
      }
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
    return {
      mode,
      runId,
      actionCount,
      attempt,
      replayActionCount: replay.replay.actionCount,
      rewardKinds,
      rewardUi,
      routeContracts,
      rewardContracts,
      stats: replay.replay.finalState.stats,
      summary: replay.replay.finalState.summary,
    };
  }
  throw new Error(`${mode} exhausted authoritative attempts`);
}

try {
  removeDbFiles();
  port = await reservePort(requestedPort);
  apiUrl = `http://127.0.0.1:${port}`;
  backend = startBackend();
  const health = await waitForHealth();
  add('real backend boots schema V11', health?.schema?.version === 11 && health?.schema?.currentMigrationId === '0011_authoritative_fate_chronicle', JSON.stringify(health?.schema || {}));

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
    && /天道裁定/.test(challengeHubBefore.rankingText)
    && challengeHubBefore.summaryText.includes(ladderCurrentBefore.rotation.title)
    && /正式得分按基础表现结算/.test(challengeHubBefore.rulesText)
    && challengeHubBefore.authoritativeRewardCount === ladderCurrentBefore.milestones.length
    && challengeHubBefore.legacyClaimCount === 0
    && /荣誉/.test(challengeHubBefore.rewardsText)
    && /本周尚无正式成绩/.test(challengeHubBefore.rankingText)
    && /进入权威众生试炼/.test(challengeHubBefore.launchText), JSON.stringify(challengeHubBefore));
  add('global formal surface uses the server rotation and excludes legacy local rewards', challengeHubBefore.summaryText.includes(ladderCurrentBefore.rotation.title)
    && /均衡计分/.test(challengeHubBefore.summaryText)
    && /正式得分按基础表现结算/.test(challengeHubBefore.rulesText)
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
  const routeContracts = panel.projection?.route?.choices?.map(choice => choice.routeContract) || [];
  const routePlayerCopy = await page.locator('.season-ops-authoritative-panel').innerText();
  add('v5 route projection exposes two readable contracts without private coefficients', panel.projection?.contentVersion === 'authoritative-trials-v5'
    && Number(panel.projection?.route?.contractVersion) === 1
    && routeContracts.length === 2
    && routeContracts.every(contract => Number(contract?.version) === 1
      && !!contract?.label
      && !!contract?.riskLabel
      && !!contract?.difficultyLabel
      && Number(contract?.difficultyRating) > 0
      && !!contract?.rewardLabel
      && !!contract?.difficultySummary
      && !!contract?.rewardSummary)
    && !/enemyAdjustments|rewardAdjustments/.test(publicProjectionJson), JSON.stringify(routeContracts));
  add('desktop route UI renders the offered risk pressure reward and score contract', /路线合同/.test(routePlayerCopy)
    && routeContracts.every(contract => routePlayerCopy.includes(contract.label)
      && routePlayerCopy.includes(contract.riskLabel)
      && routePlayerCopy.includes(contract.difficultySummary)
      && routePlayerCopy.includes(contract.rewardSummary))
    && !/contractId|enemyAdjustments|rewardAdjustments|scenarioMultiplierBps/.test(routePlayerCopy), routePlayerCopy);
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-ladder-route-desktop.png'), 'browser_authoritative_runs_real_backend_smoke', { timeout: 9000 });

  let actionCount = 0;
  let reloadChecked = false;
  let refreshChecked = false;
  let openingFairnessChecked = false;
  let routeContractRewardChecked = false;
  const ladderRewardKinds = [];
  const ladderRewardUi = [];
  while (!['completed', 'defeated', 'abandoned'].includes(panel.projection?.phase) && actionCount < 256) {
    const before = panel;
    const decision = chooseDecision(before.projection);
    if (!decision) throw new Error(`no playable UI command: ${JSON.stringify(before)}`);
    if (decision.command === 'choose_reward') {
      const firstOfKind = !ladderRewardKinds.includes(decision.rewardKind);
      ladderRewardKinds.push(decision.rewardKind);
      ladderRewardUi.push(await readRewardDecisionUi(page, decision));
      if (!routeContractRewardChecked) {
        const rewardContract = before.projection?.reward?.routeContract;
        const rewardPlayerCopy = await page.locator('.season-ops-authoritative-panel').innerText();
        routeContractRewardChecked = true;
        add('reward projection and UI retain the server-selected route contract', !!rewardContract?.label
          && /已选路线合同/.test(rewardPlayerCopy)
          && rewardPlayerCopy.includes(rewardContract.label)
          && rewardPlayerCopy.includes(rewardContract.rewardSummary)
          && !/enemyAdjustments|rewardAdjustments/.test(JSON.stringify(before.projection?.reward || null)), rewardPlayerCopy);
      }
      if (firstOfKind && ['upgrade_card', 'remove_card'].includes(decision.rewardKind)) {
        const screenshotName = decision.rewardKind === 'upgrade_card'
          ? 'challenge-ladder-reward-upgrade-desktop.png'
          : 'challenge-ladder-reward-trim-desktop.png';
        await safeAuditScreenshot(
          page,
          path.join(outDir, screenshotName),
          'browser_authoritative_runs_real_backend_smoke',
          { timeout: 9000 },
        );
      }
    }
    panel = await clickDecision(page, decision, before);
    actionCount += 1;

    if (!openingFairnessChecked && panel.projection.phase === 'battle') {
      const intent = Number(panel.projection.battle?.enemy?.intent?.amount || 0);
      const maxHp = Number(panel.projection.player?.maxHp || 0);
      openingFairnessChecked = true;
      add('opening enemy intent cannot one-shot full health', intent >= 0 && maxHp > 0 && intent < maxHp, `${intent}/${maxHp}`);
      const battleContract = panel.projection.battle?.routeContract;
      const battlePlayerCopy = await page.locator('.season-ops-authoritative-panel').innerText();
      add('battle projection and UI retain the selected route contract', !!battleContract?.label
        && /已选路线合同/.test(battlePlayerCopy)
        && battlePlayerCopy.includes(battleContract.label)
        && battlePlayerCopy.includes(battleContract.difficultySummary)
        && !/enemyAdjustments|rewardAdjustments/.test(JSON.stringify(panel.projection?.battle || null)), battlePlayerCopy);
      const battlePhaseLayout = await page.locator('[data-authoritative-phase="battle"]').evaluate(element => {
        const root = element.closest('#season-ops-screen');
        const rootRect = root?.getBoundingClientRect();
        const phaseRect = element.getBoundingClientRect();
        return {
          rootTop: rootRect?.top ?? 0,
          rootHeight: rootRect?.height ?? 0,
          phaseTop: phaseRect.top,
          phaseHeight: phaseRect.height,
          scrollTop: root?.scrollTop ?? 0,
          activePhase: document.activeElement?.getAttribute('data-authoritative-phase') || '',
        };
      });
      add('route transition reveals the battle phase instead of leaving a blank viewport', battlePhaseLayout.phaseHeight > 0
        && battlePhaseLayout.scrollTop > 0
        && battlePhaseLayout.activePhase === 'battle'
        && battlePhaseLayout.phaseTop >= battlePhaseLayout.rootTop - 1
        && battlePhaseLayout.phaseTop <= battlePhaseLayout.rootTop + Math.max(80, battlePhaseLayout.rootHeight * 0.25), JSON.stringify(battlePhaseLayout));
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
  add('terminal projection carries additive route score and per-stage resolution', Number(panel.projection?.summary?.scoreBreakdown?.finalScore) === Number(panel.projection?.summary?.score)
    && Number(panel.projection?.summary?.scoreBreakdown?.routeBonus) === Number(panel.projection?.summary?.routeResolution?.totalBonus)
    && panel.projection?.summary?.routeResolution?.selections?.length === panel.projection?.route?.totalStages, JSON.stringify(panel.projection?.summary));
  add('challenge ladder real UI exercises targeted upgrade and bounded trim', Number(panel.projection?.stats?.cardsUpgraded) >= 1
    && Number(panel.projection?.stats?.cardsRemoved) === 1
    && Number(panel.projection?.summary?.upgradedCards) >= 1
    && Number(panel.projection?.summary?.cardsRemoved) === 1
    && ladderRewardKinds.includes('upgrade_card')
    && ladderRewardKinds.includes('remove_card')
    && ladderRewardUi.some(entry => entry?.rewardKind === 'upgrade_card'
      && !!entry.targetCardInstanceId
      && /精修卡牌|精修目标|精修这张牌/.test(entry.text))
    && ladderRewardUi.some(entry => entry?.rewardKind === 'remove_card'
      && !!entry.targetCardInstanceId
      && /裁去卡牌|裁牌目标|裁去这张牌/.test(entry.text)), JSON.stringify({
      stats: panel.projection?.stats,
      summary: panel.projection?.summary,
      rewardKinds: ladderRewardKinds,
      rewardUi: ladderRewardUi,
    }));
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
  const settledPlayerCopy = await page.locator('.season-ops-authoritative-panel').innerText();
  add('settled challenge UI hides implementation ids enums hashes and route coefficients', !/\barun-|\barreceipt-|authoritative-(?:run|trials)|server_authoritative|state-hash|chain-head|ink_scout|trial_adjudicator|play_card|choose_reward|contractId|enemyAdjustments|rewardAdjustments|scenarioMultiplierBps/.test(settledPlayerCopy), settledPlayerCopy);
  add('settled challenge UI presents localized route history and verification', /试炼战 · /.test(settledPlayerCopy)
    && /首领战 · /.test(settledPlayerCopy)
    && /路线分拆解/.test(settledPlayerCopy)
    && /路线总分/.test(settledPlayerCopy)
    && /路线留痕/.test(settledPlayerCopy)
    && /全程校验/.test(settledPlayerCopy)
    && /天道校验/.test(settledPlayerCopy), settledPlayerCopy);
  add('settled challenge UI preserves the deck-crafting payoff', /终局牌组 9 张/.test(settledPlayerCopy)
    && /精修 1 张/.test(settledPlayerCopy)
    && /裁牌 1 张/.test(settledPlayerCopy), settledPlayerCopy);

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
  const expectedLadderBestScore = Number(ladderCurrentAfter?.personalBest?.officialScore || 0);
  add('challenge hub global UI refreshes to the real ladder result after submit', challengeHubAfter.currentScreen === 'challenge-screen'
    && challengeHubAfter.activeTab === 'global'
    && /权威众生榜/.test(challengeHubAfter.rankingText)
    && /正式次数 2\/3/.test(challengeHubAfter.rankingText)
    && /天道裁定/.test(challengeHubAfter.rankingText)
    && challengeHubAfter.summaryText.includes('个人正式最高分')
    && expectedLadderBestScore > 0
    && challengeHubAfter.summaryText.includes(String(expectedLadderBestScore))
    && challengeHubAfter.legacyClaimCount === 0
    && challengeHubAfter.authoritativeRewardCount >= 1
    && challengeHubAfter.rankRowCount >= 1
    && challengeHubAfter.rankingText.includes(username)
    && /继续权威众生试炼|进入权威众生试炼/.test(challengeHubAfter.launchText), JSON.stringify(challengeHubAfter));
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-ladder-hub-after.png'), 'browser_authoritative_runs_real_backend_smoke', { timeout: 9000 });

  const riftCurrentBefore = await page.evaluate(async () => {
    const { BackendClient } = window.__THE_DEFIER_SERVICES__;
    const user = BackendClient.getCurrentUser();
    return BackendClient.getWorldRiftCurrent({
      expectedUserId: user?.objectId || user?.id || '',
    });
  });
  add('world rift GET current returns shared boss and five formal attempts', riftCurrentBefore?.success === true
    && riftCurrentBefore?.protocolVersion === 'authoritative-world-rift-v1'
    && Number(riftCurrentBefore?.allowance?.attemptLimit) === 5
    && Number(riftCurrentBefore?.allowance?.usedAttempts) === 0
    && Number(riftCurrentBefore?.allowance?.remainingAttempts) === 5
    && Number(riftCurrentBefore?.world?.totalHp) === 10000
    && Number(riftCurrentBefore?.world?.appliedDamage) === 0
    && Array.isArray(riftCurrentBefore?.leaderboard?.entries)
    && riftCurrentBefore.leaderboard.entries.length === 0, JSON.stringify(riftCurrentBefore));

  const riftHubBefore = await openChallengeHubRift(page, 5);
  add('world rift hub renders real shared state without simulated participants', riftHubBefore.currentScreen === 'challenge-screen'
    && riftHubBefore.activeTab === 'rift'
    && /天穹裂隙/.test(riftHubBefore.title)
    && /真实共斗榜/.test(riftHubBefore.rankingText)
    && /5\/5/.test(riftHubBefore.summaryText)
    && /10000\/10000/.test(riftHubBefore.summaryText)
    && /无末刀奖励/.test(riftHubBefore.summaryText)
    && /固定牌组与统一种子/.test(riftHubBefore.summaryText)
    && riftHubBefore.worldRiftRewardCount === riftCurrentBefore.milestones.length
    && riftHubBefore.worldRiftRankRowCount === 0
    && /进入权威共斗/.test(riftHubBefore.launchText), JSON.stringify(riftHubBefore));
  await safeAuditScreenshot(page, path.join(outDir, 'world-rift-hub-before.png'), 'browser_authoritative_runs_real_backend_smoke', { timeout: 9000 });

  panel = await openRiftFromChallengeHub(page);
  add('world rift CTA opens the bound authoritative mode', panel.currentMode === 'world_rift'
    && !panel.projection
    && Number(panel.worldRiftState?.current?.allowance?.remainingAttempts) === 5, JSON.stringify({
      currentMode: panel.currentMode,
      worldRiftState: panel.worldRiftState?.current || null,
    }));

  await page.waitForSelector('[data-season-ops-action="authoritative-begin"]');
  await page.locator('[data-season-ops-action="authoritative-begin"]').click();
  panel = await waitForPanel(
    page,
    () => {
      const candidate = window.game?.seasonOpsView?.authoritativeRunPanel;
      const projection = candidate?.getCurrentProjection?.();
      return candidate?.getCurrentMode?.() === 'world_rift'
        && projection?.mode === 'world_rift'
        && projection?.phase === 'route';
    },
  );
  const riftRunId = panel.projection.runId;
  add('formal world rift attempt binds a server-authoritative shared seed', /^arun-/.test(riftRunId)
    && panel.runMeta?.trustTier === 'server_authoritative'
    && panel.worldRiftState?.attempt?.runId === riftRunId
    && Number(panel.worldRiftState?.attempt?.attemptIndex) === 1
    && Number(panel.worldRiftState?.attempt?.seedSlot) === 1
    && !/"(?:seed|rng|drawPile)"/.test(JSON.stringify(panel.projection)), JSON.stringify({
      runMeta: panel.runMeta,
      attempt: panel.worldRiftState?.attempt,
    }));
  await safeAuditScreenshot(page, path.join(outDir, 'world-rift-route-desktop.png'), 'browser_authoritative_runs_real_backend_smoke', { timeout: 9000 });

  let riftActionCount = 0;
  let riftReloadChecked = false;
  let riftAccountSwitchChecked = false;
  const riftRewardKinds = [];
  while (!['completed', 'defeated', 'abandoned'].includes(panel.projection?.phase) && riftActionCount < 256) {
    const before = panel;
    const decision = chooseDecision(before.projection);
    if (!decision) throw new Error(`no playable world-rift command: ${JSON.stringify(before)}`);
    if (decision.command === 'choose_reward') riftRewardKinds.push(decision.rewardKind);
    panel = await clickDecision(page, decision, before);
    riftActionCount += 1;

    if (!riftReloadChecked && riftActionCount >= 8 && !['completed', 'defeated', 'abandoned'].includes(panel.projection.phase)) {
      const versionBeforeReload = panel.projection.version;
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(
        () => !!window.game && !!window.__THE_DEFIER_SERVICES__?.BackendClient?.getCurrentUser?.(),
        null,
        { timeout: 30000 },
      );
      await openAuthoritativeTab(page);
      await selectAuthoritativeMode(page, 'world_rift');
      panel = await waitForPanel(
        page,
        expected => {
          const candidate = window.game?.seasonOpsView?.authoritativeRunPanel;
          const projection = candidate?.getCurrentProjection?.();
          return candidate?.getCurrentMode?.() === 'world_rift'
            && projection?.runId === expected.runId
            && Number(projection.version) === expected.version
            && !candidate?.isBusy?.();
        },
        { runId: riftRunId, version: versionBeforeReload },
        20000,
      );
      riftReloadChecked = true;
      add('full browser reload resumes the same world rift server run', panel.projection.runId === riftRunId
        && Number(panel.projection.version) === Number(versionBeforeReload));
      await safeAuditScreenshot(page, path.join(outDir, 'world-rift-resumed-desktop.png'), 'browser_authoritative_runs_real_backend_smoke', { timeout: 9000 });
    }

    if (riftReloadChecked && !riftAccountSwitchChecked && riftActionCount >= 12
      && !['completed', 'defeated', 'abandoned'].includes(panel.projection.phase)) {
      const versionBeforeSwitch = panel.projection.version;
      const accountSwitch = await exerciseWorldRiftAccountSwitch(page, {
        runId: riftRunId,
        version: versionBeforeSwitch,
      });
      const switchedStateJson = JSON.stringify(accountSwitch.switchedPanel || {});
      add('world rift account switch discards an in-flight old-account refresh', accountSwitch.switched?.success === true
        && accountSwitch.switched?.username === switchUsername
        && !accountSwitch.switchedPanel?.projection
        && accountSwitch.switchedPanel?.worldRiftState?.expectedUserId === accountSwitch.switched?.userId
        && !switchedStateJson.includes(riftRunId), JSON.stringify({
          switched: accountSwitch.switched,
          staleResult: accountSwitch.staleResult,
          switchedPanel: accountSwitch.switchedPanel,
        }));
      panel = accountSwitch.resumedPanel;
      add('switching back resumes the same world rift server run', accountSwitch.restored?.success === true
        && accountSwitch.restored?.username === username
        && panel.projection?.runId === riftRunId
        && Number(panel.projection?.version) === Number(versionBeforeSwitch), JSON.stringify({
          restored: accountSwitch.restored,
          projection: panel.projection,
        }));
      riftAccountSwitchChecked = true;
    }
  }
  add('real browser strategy completes the formal world rift run', panel.projection?.phase === 'completed', `${panel.projection?.phase || 'missing'} after ${riftActionCount} actions`);
  if (panel.projection?.phase !== 'completed') throw new Error(`world rift run did not complete: ${JSON.stringify(panel)}`);
  add('world rift real UI carries deck crafting through account switch and reload', Number(panel.projection?.stats?.cardsUpgraded) >= 1
    && Number(panel.projection?.stats?.cardsRemoved) === 1
    && riftRewardKinds.includes('upgrade_card')
    && riftRewardKinds.includes('remove_card'), JSON.stringify({
      stats: panel.projection?.stats,
      rewardKinds: riftRewardKinds,
    }));
  await page.locator('[data-season-ops-action="authoritative-settle"]').click();
  panel = await waitForPanel(
    page,
    expectedRunId => {
      const candidate = window.game?.seasonOpsView?.authoritativeRunPanel;
      const state = candidate?.worldRiftService?.getState?.() || candidate?.worldRiftState || {};
      return candidate?.lastRunMeta?.runId === expectedRunId
        && candidate?.lastRunMeta?.status === 'settled'
        && candidate?.lastReceipt?.integrity?.fullReplayPassed === true
        && state?.contribution?.runId === expectedRunId
        && Number(state?.current?.allowance?.usedAttempts) >= 1
        && Number(state?.current?.allowance?.remainingAttempts) === 4
        && Number(state?.world?.stateVersion || state?.current?.world?.stateVersion) >= 1
        && !candidate?.isBusy?.();
    },
    riftRunId,
    25000,
  );
  add('settlement atomically projects world rift contribution and shared state', panel.status === 'settled'
    && panel.receipt?.integrity?.fullReplayPassed === true
    && panel.worldRiftState?.contribution?.runId === riftRunId
    && Number(panel.worldRiftState?.contribution?.contribution) > 0
    && Number(panel.worldRiftState?.contribution?.appliedDamage) > 0
    && Number(panel.worldRiftState?.world?.stateVersion || panel.worldRiftState?.current?.world?.stateVersion) === 1, JSON.stringify({
      contribution: panel.worldRiftState?.contribution,
      world: panel.worldRiftState?.world || panel.worldRiftState?.current?.world,
    }));
  await safeAuditScreenshot(page, path.join(outDir, 'world-rift-settled-desktop.png'), 'browser_authoritative_runs_real_backend_smoke', { timeout: 9000 });

  const riftCurrentAfter = await page.evaluate(async () => {
    const { BackendClient } = window.__THE_DEFIER_SERVICES__;
    const user = BackendClient.getCurrentUser();
    return BackendClient.getWorldRiftCurrent({
      expectedUserId: user?.objectId || user?.id || '',
    });
  });
  const riftHubAfter = await openChallengeHubRift(page, 4);
  add('world rift current and hub refresh after contribution', riftCurrentAfter?.success === true
    && Number(riftCurrentAfter?.allowance?.usedAttempts) === 1
    && Number(riftCurrentAfter?.allowance?.remainingAttempts) === 4
    && Number(riftCurrentAfter?.world?.appliedDamage) > 0
    && Number(riftCurrentAfter?.world?.stateVersion) === 1
    && Number(riftCurrentAfter?.personal?.completedAttempts) === 1
    && Array.isArray(riftCurrentAfter?.leaderboard?.entries)
    && riftCurrentAfter.leaderboard.entries.length === 1
    && riftHubAfter.worldRiftRankRowCount === 1
    && riftHubAfter.rankingText.includes(username)
    && /4\/5/.test(riftHubAfter.summaryText), JSON.stringify({ riftCurrentAfter, riftHubAfter }));
  await safeAuditScreenshot(page, path.join(outDir, 'world-rift-hub-after.png'), 'browser_authoritative_runs_real_backend_smoke', { timeout: 9000 });

  const persistedRift = await dbGet(
    `SELECT ar.status AS run_status,
            ar.activity_mode,
            a.status AS attempt_status,
            a.attempt_index,
            a.seed_slot,
            c.contribution_id,
            c.contribution,
            c.applied_damage,
            c.state_version,
            e.ranked_contribution,
            e.completed_attempts,
            s.applied_damage AS world_applied_damage,
            s.total_contribution AS world_total_contribution,
            s.state_version AS world_state_version,
            (SELECT COUNT(*) FROM progression_authoritative_run_receipts WHERE run_id = ?) AS receipt_count,
            (SELECT COUNT(*) FROM world_rift_mutations WHERE user_id = a.user_id AND request_type = 'submit') AS submit_mutation_count
     FROM progression_authoritative_runs ar
     JOIN world_rift_attempts a ON a.run_id = ar.run_id
     JOIN world_rift_contributions c ON c.run_id = ar.run_id
     JOIN world_rift_entries e ON e.rotation_id = a.rotation_id AND e.user_id = a.user_id
     JOIN world_rift_states s ON s.rotation_id = a.rotation_id
     WHERE ar.run_id = ?`,
    [riftRunId, riftRunId],
  );
  add('database persists one world-rift contribution and shared-state increment', persistedRift?.run_status === 'settled'
    && persistedRift?.activity_mode === 'world_rift'
    && persistedRift?.attempt_status === 'submitted'
    && Number(persistedRift?.attempt_index) === 1
    && Number(persistedRift?.seed_slot) === 1
    && !!persistedRift?.contribution_id
    && Number(persistedRift?.contribution) > 0
    && Number(persistedRift?.applied_damage) === Number(persistedRift?.world_applied_damage)
    && Number(persistedRift?.contribution) === Number(persistedRift?.world_total_contribution)
    && Number(persistedRift?.state_version) === 1
    && Number(persistedRift?.world_state_version) === 1
    && Number(persistedRift?.ranked_contribution) === Number(persistedRift?.contribution)
    && Number(persistedRift?.completed_attempts) === 1
    && Number(persistedRift?.receipt_count) === 1
    && Number(persistedRift?.submit_mutation_count) === 1, JSON.stringify(persistedRift));

  await openAuthoritativeTab(page);
  const pveResult = await completeAdditionalMode(page, 'pve', { routePolicy: 'risky' });
  const challengeResult = await completeAdditionalMode(page, 'challenge');
  const expeditionResult = await completeAdditionalMode(page, 'expedition');
  add('real UI completes and settles all three base authoritative modes alongside challenge ladder and world rift', pveResult.replayActionCount === pveResult.actionCount
    && challengeResult.replayActionCount === challengeResult.actionCount
    && expeditionResult.replayActionCount === expeditionResult.actionCount, JSON.stringify({ pveResult, challengeResult, expeditionResult }));
  const baseModeResults = [pveResult, challengeResult, expeditionResult];
  add('all base-mode replays preserve additive route resolution', baseModeResults.every(result => (
    Number(result.summary?.scoreBreakdown?.finalScore) === Number(result.summary?.score)
      && Number(result.summary?.scoreBreakdown?.routeBonus) === Number(result.summary?.routeResolution?.totalBonus)
      && result.summary?.routeResolution?.selections?.length >= 3
  )), JSON.stringify(baseModeResults.map(result => ({ mode: result.mode, summary: result.summary }))));
  const perilousReward = pveResult.rewardContracts.find(entry => entry.contract?.contractId === 'perilous');
  const perilousResolution = pveResult.summary?.routeResolution?.selections?.filter(entry => entry.contractId === 'perilous') || [];
  add('real PVE browser path exercises perilous pressure premium rewards and final route scoring', pveResult.routeContracts.some(contract => contract?.contractId === 'perilous'
    && contract?.riskTier === 'high'
    && contract?.rewardTier === 'premium')
    && perilousReward?.choiceCount >= 4
    && perilousReward?.text.includes(perilousReward.contract.rewardSummary)
    && !/enemyAdjustments|rewardAdjustments/.test(JSON.stringify(perilousReward))
    && perilousResolution.length >= 1
    && Number(pveResult.summary?.scoreBreakdown?.routeBonus) === Number(pveResult.summary?.routeResolution?.totalBonus)
    && Number(pveResult.summary?.routeResolution?.totalBonus) >= 55, JSON.stringify({
      routeContracts: pveResult.routeContracts,
      perilousReward,
      summary: pveResult.summary,
    }));
  add('all base-mode real UI runs execute exact-target upgrade and one legal trim', baseModeResults.every(result => Number(result.stats?.cardsUpgraded) >= 1
    && Number(result.stats?.cardsRemoved) === 1
    && Number(result.summary?.upgradedCards) >= 1
    && Number(result.summary?.cardsRemoved) === 1
    && result.rewardKinds.includes('upgrade_card')
    && result.rewardKinds.includes('remove_card')
    && result.rewardUi.some(entry => entry?.rewardKind === 'upgrade_card' && !!entry.targetCardInstanceId)
    && result.rewardUi.some(entry => entry?.rewardKind === 'remove_card' && !!entry.targetCardInstanceId)), JSON.stringify(baseModeResults));

  const aggregate = await dbGet(
    `SELECT
        (SELECT COUNT(*) FROM progression_authoritative_run_receipts) AS receipt_count,
        (SELECT COUNT(*) FROM progression_events WHERE source_kind = 'authoritative_run_settlement' AND trust_tier = 'server_authoritative') AS event_count,
        (SELECT COUNT(*) FROM progression_authoritative_runs WHERE activity_mode = 'pve' AND status = 'settled') AS pve_settled,
        (SELECT COUNT(*) FROM progression_authoritative_runs WHERE activity_mode = 'challenge' AND status = 'settled') AS challenge_settled,
        (SELECT COUNT(*) FROM progression_authoritative_runs WHERE activity_mode = 'expedition' AND status = 'settled') AS expedition_settled,
        (SELECT COUNT(*) FROM progression_authoritative_runs WHERE activity_mode = 'challenge_ladder' AND status = 'settled') AS ladder_settled,
        (SELECT COUNT(*) FROM progression_authoritative_runs WHERE activity_mode = 'world_rift' AND status = 'settled') AS world_rift_settled`,
  );
  add('all base modes challenge ladder and world rift mint exactly one receipt and event per settled run', Number(aggregate?.receipt_count) === 5
    && Number(aggregate?.event_count) === 5
    && Number(aggregate?.pve_settled) === 1
    && Number(aggregate?.challenge_settled) === 1
    && Number(aggregate?.expedition_settled) === 1
    && Number(aggregate?.ladder_settled) === 1
    && Number(aggregate?.world_rift_settled) === 1, JSON.stringify(aggregate));

  const opsResponse = await fetch(`${apiUrl}/api/progression/ops/authoritative-runs`, {
    headers: { 'x-defier-ops-token': opsToken },
  });
  const ops = await opsResponse.json();
  const opsJson = JSON.stringify(ops);
  add('ops overview reports settlement through redacted references', opsResponse.ok
    && ops?.success === true
    && ops?.totals?.receipts === 5
    && ops?.byStatus?.settled === 5
    && ops?.byMode?.pve >= 1
    && ops?.byMode?.challenge >= 1
    && ops?.byMode?.expedition >= 1
    && ops?.byMode?.challenge_ladder >= 1
    && ops?.byMode?.world_rift >= 1
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

  const worldRiftOpsResponse = await fetch(`${apiUrl}/api/world-rift/ops/overview`, {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      'x-defier-ops-token': opsToken,
    },
  });
  const worldRiftOps = await worldRiftOpsResponse.json();
  const worldRiftOpsJson = JSON.stringify(worldRiftOps);
  add('world rift ops overview is redacted', worldRiftOpsResponse.ok
    && worldRiftOps?.success === true
    && Number(worldRiftOps?.totals?.attempts) === 1
    && Number(worldRiftOps?.totals?.contributions) === 1
    && Number(worldRiftOps?.attemptStates?.submitted) === 1
    && Number(worldRiftOps?.currentWorld?.stateVersion) === 1
    && !worldRiftOpsJson.includes(username)
    && !worldRiftOpsJson.includes(riftRunId), JSON.stringify(worldRiftOps));

  await openChallengeHubGlobal(page, 2);
  await openLadderFromChallengeHub(page);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLayout = await readLayout(page);
  add('real settled mobile view has no horizontal overflow', mobileLayout.documentScrollWidth === 390
    && mobileLayout.rootScrollWidth === mobileLayout.rootClientWidth, JSON.stringify(mobileLayout));
  add('real settled mobile controls meet touch target', mobileLayout.undersized.length === 0, JSON.stringify(mobileLayout.undersized));
  await page.locator('[data-season-ops-action="authoritative-begin-new"]').scrollIntoViewIfNeeded();
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-ladder-settled-mobile.png'), 'browser_authoritative_runs_real_backend_smoke', { timeout: 9000 });
  const mobileSettledCopy = await page.locator('.season-ops-authoritative-panel').innerText();
  add('real settled mobile UI keeps route resolution readable and internal identifiers out of player copy', /路线分拆解/.test(mobileSettledCopy)
    && /路线留痕/.test(mobileSettledCopy)
    && !/\barun-|\barreceipt-|authoritative-(?:run|trials)|server_authoritative|state-hash|chain-head|ink_scout|trial_adjudicator|contractId|enemyAdjustments|rewardAdjustments|scenarioMultiplierBps/.test(mobileSettledCopy), mobileSettledCopy);
  const riftMobileHub = await openChallengeHubRift(page, 4);
  const riftMobileLayout = await readLayout(page);
  add('real world rift mobile view has no horizontal overflow', riftMobileHub.activeTab === 'rift'
    && riftMobileLayout.documentScrollWidth === 390
    && riftMobileLayout.rootScrollWidth === riftMobileLayout.rootClientWidth, JSON.stringify(riftMobileLayout));
  add('real world rift mobile controls meet touch target', riftMobileLayout.undersized.length === 0, JSON.stringify(riftMobileLayout.undersized));
  await safeAuditScreenshot(page, path.join(outDir, 'world-rift-hub-mobile.png'), 'browser_authoritative_runs_real_backend_smoke', { timeout: 9000 });
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
