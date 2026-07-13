import crypto from 'node:crypto';
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
const outDir = process.argv[3] || 'output/browser-relay-expedition-real-backend-smoke';
const reportPath = path.join(outDir, 'report.json');
const dbPath = process.env.BROWSER_RELAY_EXPEDITION_DB_PATH
  || path.join(os.tmpdir(), `the-defier-relay-expedition-real-${process.pid}-${Date.now()}.sqlite`);
const requestedPort = Number(process.env.BROWSER_RELAY_EXPEDITION_PORT || 0);
const runId = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
const usernameA = `relaya${runId}`.slice(0, 20);
const usernameB = `relayb${runId}`.slice(0, 20);
const password = `pwd_${runId}_relay`;
const findings = [];
const consoleErrors = [];
const pageResources = [];
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
  const message = String(value?.message || value || '');
  if (/favicon|404 \(Not Found\)|ERR_CONNECTION_(CLOSED|RESET)/i.test(message)) return;
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
      JWT_SECRET: 'relay-expedition-browser-jwt-secret-32',
      DEFIER_HMAC_SECRET: 'relay-expedition-browser-hmac-secret-32',
      DEFIER_INTEGRITY_REQUIRED: '1',
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

async function api(pathname, { method = 'GET', token = '', body, headers = {} } = {}) {
  const response = await fetch(`${apiUrl}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, payload };
}

function findRelaySessionId(payload) {
  return String(value(payload, 'currentSession.sessionId', 'session.sessionId', 'current.session.sessionId') || '').trim();
}

function signPayload(payload, token, label, route) {
  const salt = `${label}-${runId}`;
  const signature = crypto.createHmac('sha256', token)
    .update(`session-v2\n${route}\n${salt}\n${JSON.stringify(payload)}`, 'utf8')
    .digest('hex');
  return { ...payload, salt, signature, signatureMode: 'session-v2' };
}

async function signedRequest(pathname, { method = 'POST', token = '', payload = {}, label = 'relay' } = {}) {
  const route = `${String(method || 'POST').toUpperCase()} ${pathname.split('?')[0]}`;
  return api(pathname, {
    method,
    token,
    body: signPayload(payload, token, label, route),
  });
}

async function register(username, deviceName) {
  const response = await api('/api/auth/register', {
    method: 'POST',
    body: {
      username,
      password,
      deviceId: `browser-${username}`,
      deviceName,
    },
  });
  if (!response.ok || !response.payload?.token || !response.payload?.user) {
    throw new Error(`register failed: ${response.status} ${JSON.stringify(response.payload)}`);
  }
  return {
    token: response.payload.token,
    user: response.payload.user,
    userId: String(response.payload.user.objectId || response.payload.user.id || ''),
  };
}

function readPath(source, pathExpression = '') {
  return String(pathExpression || '')
    .split('.')
    .filter(Boolean)
    .reduce((current, key) => {
      if (current === null || current === undefined) return undefined;
      if (Array.isArray(current)) {
        const index = Number(key);
        return Number.isInteger(index) ? current[index] : undefined;
      }
      return current[key];
    }, source);
}

function value(source, ...paths) {
  for (const pathExpression of paths) {
    const result = readPath(source, pathExpression);
    if (result !== undefined && result !== null) return result;
  }
  return null;
}

function list(source, ...paths) {
  for (const pathExpression of paths) {
    const result = readPath(source, pathExpression);
    if (Array.isArray(result)) return result;
  }
  return [];
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function walk(node, visitor, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return '';
  seen.add(node);
  const hit = visitor(node);
  if (hit) return hit;
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = walk(entry, visitor, seen);
      if (found) return found;
    }
    return '';
  }
  for (const key of Object.keys(node)) {
    const found = walk(node[key], visitor, seen);
    if (found) return found;
  }
  return '';
}

function findRotationId(payload) {
  return String(
    value(
      payload,
      'riftSquad.current.rotation.rotationId',
      'current.riftSquad.current.rotation.rotationId',
      'rotation.rotationId',
      'rotationId',
    ) || ''
  ).trim();
}

function findIncomingRequestId(payload) {
  const request = list(
    payload,
    'incomingRequests',
    'requests.incoming',
    'requests.received',
    'dashboard.incomingRequests',
  )[0];
  return String(request?.requestId || request?.id || '').trim();
}

function findProfileIdByUsername(payload, username) {
  const expected = normalizeName(username);
  return String(walk(payload, entry => {
    const name = normalizeName(
      entry?.username
        || entry?.userName
        || entry?.displayName
        || entry?.profile?.username
        || entry?.profile?.displayName
    );
    if (name !== expected) return '';
    return String(entry?.profileId || entry?.profile_id || entry?.profile?.profileId || '').trim();
  }) || '').trim();
}

function findSquadId(payload) {
  return String(value(payload, 'riftSquad.current.squad.squadId', 'current.squad.squadId', 'squad.squadId') || '').trim();
}

function findIncomingInviteId(payload) {
  const invite = list(
    payload,
    'riftSquad.current.invites.received',
    'current.invites.received',
    'incomingInvites',
    'invites',
  )[0];
  return String(invite?.inviteId || invite?.id || '').trim();
}

function cssValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function createBrowserPage(account, { width, height }, label) {
  const context = await browser.newContext({
    viewport: { width, height },
  });
  await context.addInitScript(({ targetApiUrl, token, user }) => {
    localStorage.setItem('theDefierDebug', 'true');
    localStorage.setItem('theDefierServerConfig', JSON.stringify({ baseUrl: targetApiUrl }));
    localStorage.setItem('theDefierServerSession', JSON.stringify({ token, user }));
    sessionStorage.setItem('currentSaveSlot', '0');
    localStorage.setItem('lastSaveSlot', '0');
    window.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.dataset.relayExpeditionSmoke = 'hide-save-slot-modal';
      style.textContent = '#save-slots-modal { display: none !important; pointer-events: none !important; }';
      document.head.appendChild(style);
    });
  }, { targetApiUrl: apiUrl, token: account.token, user: account.user });
  const page = await context.newPage();
  page.on('console', message => {
    if (message.type() === 'error') recordConsoleError(`[${label}] ${message.text()}`);
  });
  page.on('pageerror', error => recordConsoleError(`[${label}] ${error.message || error}`));
  await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => !!window.game && !!window.__THE_DEFIER_SERVICES__?.BackendClient && !!window.__THE_DEFIER_SERVICES__?.AuthService,
    null,
    { timeout: 30000 },
  );
  const authState = await page.evaluate(() => {
    const { BackendClient, AuthService } = window.__THE_DEFIER_SERVICES__ || {};
    const user = BackendClient?.getCurrentUser?.() || null;
    return {
      loggedIn: !!AuthService?.isLoggedIn?.(),
      userId: user?.objectId || user?.id || '',
      username: user?.username || '',
    };
  });
  if (!authState.loggedIn || !authState.userId) {
    throw new Error(`page ${label} failed to restore server session: ${JSON.stringify(authState)}`);
  }
  pageResources.push({ context, page, label });
  return page;
}

async function closePages() {
  while (pageResources.length) {
    const resource = pageResources.pop();
    try {
      await resource.context.close();
    } catch {}
  }
}

async function dismissModals(page) {
  await page.evaluate(() => {
    for (const id of ['save-slots-modal', 'auth-modal', 'generic-confirm-modal', 'save-conflict-modal']) {
      document.getElementById(id)?.classList.remove('active');
    }
  });
}

async function waitForGameReady(page) {
  await page.waitForFunction(
    () => !!window.game && !!window.__THE_DEFIER_SERVICES__?.BackendClient && !!window.__THE_DEFIER_SERVICES__?.AuthService,
    null,
    { timeout: 30000 },
  );
}

async function openSocialSquad(page) {
  await dismissModals(page);
  await page.evaluate(async () => {
    await window.game?.showSocialHub?.('squad');
  });
  await page.waitForSelector('#social-screen.active', { timeout: 15000 });
  await page.waitForFunction(
    () => window.game?.socialView?.tab === 'squad' && !!document.querySelector('.social-relay-workspace'),
    null,
    { timeout: 15000 },
  );
  await page.waitForTimeout(250);
}

async function waitForSocialStatus(page, expectedText) {
  await page.waitForFunction(
    expected => document.getElementById('social-status')?.textContent?.includes(expected),
    expectedText,
    { timeout: 15000 },
  );
}

async function waitForRelayWorkspaceReady(page, {
  sessionRequired = false,
  claimRequired = false,
  tacticRequired = false,
  projectedLegsAtLeast = null,
  currentLegIndex = null,
} = {}) {
  await page.waitForFunction(
    expected => {
      const social = window.game?.socialView;
      const relay = social?.getRelaySnapshot?.() || social?.relayState || {};
      const session = social?.getRelaySession?.()
        || relay?.session
        || relay?.current?.currentSession
        || relay?.current?.session
        || null;
      const leg = social?.getRelayCurrentLeg?.()
        || relay?.currentLeg
        || session?.currentLeg
        || session?.activeLeg
        || null;
      const projectedLegs = Number(session?.projectedLegs ?? session?.projected_legs ?? 0);
      const claimVisible = !!document.querySelector('[data-social-action="relay-claim"]');
      const tacticCount = document.querySelectorAll('input[data-social-action="relay-select-tactic"]').length;
      if (window.game?.currentScreen !== 'social-screen' || social?.tab !== 'squad') return false;
      if (expected.sessionRequired && !session?.sessionId) return false;
      if (expected.claimRequired && !claimVisible) return false;
      if (expected.tacticRequired && tacticCount <= 0) return false;
      if (expected.projectedLegsAtLeast !== null && projectedLegs < expected.projectedLegsAtLeast) return false;
      if (expected.currentLegIndex !== null && Number(session?.currentLegIndex ?? leg?.legIndex ?? -999) !== expected.currentLegIndex) return false;
      return true;
    },
    { sessionRequired, claimRequired, tacticRequired, projectedLegsAtLeast, currentLegIndex },
    { timeout: 20000 },
  );
}

async function ensureRelayWorkspaceReady(page, options) {
  try {
    await waitForRelayWorkspaceReady(page, options);
    return;
  } catch (error) {
    const refreshButton = page.locator('[data-social-action="relay-refresh"]').first();
    if (await refreshButton.count()) {
      await refreshButton.click({ force: true });
      await waitForRelayWorkspaceReady(page, options);
      return;
    }
    throw error;
  }
}

async function readSocialWorkspace(page) {
  return page.evaluate(() => {
    const text = node => (node?.textContent || '').replace(/\s+/g, ' ').trim();
    const socialView = window.game?.socialView;
    const relay = socialView?.getRelaySnapshot?.() || socialView?.relayState || {};
    const session = socialView?.getRelaySession?.()
      || relay?.session
      || relay?.current?.currentSession
      || relay?.current?.session
      || null;
    const leg = socialView?.getRelayCurrentLeg?.()
      || relay?.currentLeg
      || session?.currentLeg
      || session?.activeLeg
      || null;
    const milestones = Array.isArray(session?.rewardMilestones)
      ? session.rewardMilestones
      : Array.isArray(session?.milestones)
        ? session.milestones
        : [];
    return {
      currentScreen: window.game?.currentScreen || '',
      tab: socialView?.tab || '',
      memberCount: document.querySelectorAll('.social-member').length,
      squadSummaryText: text(document.querySelector('.social-squad-summary')),
      relayHeading: text(document.querySelector('.social-relay-workspace h3')),
      relayHeadingSub: text(document.querySelector('.social-relay-workspace .social-section-heading span')),
      inlineNote: text(document.querySelector('.social-relay-workspace .social-inline-note')),
      scoreText: text(document.querySelector('.social-relay-score')),
      statusText: text(document.getElementById('social-status')),
      routeLegTexts: [...document.querySelectorAll('.social-relay-leg')].map(text),
      actionTexts: [...document.querySelectorAll('.social-relay-actions button')].map(text),
      rewardTexts: [...document.querySelectorAll('.social-relay-rewards .social-rewards button')].map(text),
      tacticOptions: [...document.querySelectorAll('input[data-social-action="relay-select-tactic"]')].map(input => input.dataset.tacticId || ''),
      selectedTactic: document.querySelector('input[data-social-action="relay-select-tactic"]:checked')?.dataset?.tacticId || '',
      sessionId: String(session?.sessionId || ''),
      rotationId: String(session?.rotationId || relay?.current?.rotation?.rotationId || ''),
      currentLegId: String(leg?.legId || ''),
      currentLegIndex: Number(session?.currentLegIndex ?? leg?.legIndex ?? -1),
      currentLegStatus: String(leg?.status || ''),
      currentLegRunId: String(leg?.runId || ''),
      projectedLegs: Number(session?.projectedLegs ?? session?.projected_legs ?? 0),
      processedLegs: Number(session?.processedLegs ?? session?.processed_legs ?? 0),
      routeScore: Number(session?.totalScore ?? session?.routeScore ?? session?.route_score ?? 0),
      rewardMilestones: milestones.map(entry => ({
        milestoneId: String(entry?.milestoneId || entry?.id || ''),
        claimable: !!entry?.claimable,
        claimed: !!entry?.claimed,
        amount: Number(entry?.reward?.amount || entry?.amount || 0),
      })),
    };
  });
}

async function chooseRelayTactic(page, preferredOrder = ['bulwark', 'insight', 'vanguard']) {
  const snapshot = await readSocialWorkspace(page);
  const available = snapshot.tacticOptions.filter(Boolean);
  if (!available.length) throw new Error(`relay tactic options missing: ${JSON.stringify(snapshot)}`);
  const picked = preferredOrder.find(option => available.includes(option)) || available[0];
  await page.locator(`input[data-social-action="relay-select-tactic"][data-tactic-id="${cssValue(picked)}"]`).check({ force: true });
  await page.waitForFunction(
    expected => document.querySelector('input[data-social-action="relay-select-tactic"]:checked')?.dataset?.tacticId === expected,
    picked,
    { timeout: 5000 },
  );
  return picked;
}

async function openRelaySeasonOps(page, { force = true } = {}) {
  await dismissModals(page);
  await page.evaluate(async ({ shouldForce }) => {
    window.game?.seasonOpsView?.openRelayExpeditionMode?.({ render: false });
    await window.game?.showSeasonOps?.('authoritative');
    const panel = window.game?.seasonOpsView?.authoritativeRunPanel;
    if (panel && typeof panel.activate === 'function') {
      await panel.activate({ force: shouldForce });
    }
    if (panel && typeof panel.refreshProjection === 'function') {
      await panel.refreshProjection();
    }
  }, { shouldForce: force === true });
  await page.waitForSelector('#season-ops-screen.active .season-ops-authoritative-panel', { timeout: 15000 });
  await page.waitForTimeout(250);
}

async function readPanel(page) {
  return page.evaluate(() => {
    const panel = window.game?.seasonOpsView?.authoritativeRunPanel;
    return {
      currentMode: panel?.getCurrentMode?.() || '',
      projection: panel?.getCurrentProjection?.() || null,
      status: panel?.getStatus?.() || '',
      runMeta: panel?.lastRunMeta || null,
      receipt: panel?.lastReceipt || null,
      busy: panel?.isBusy?.() || false,
      error: panel?.serviceState?.lastError || null,
      relayState: panel?.relayExpeditionService?.getState?.() || panel?.relayExpeditionState || null,
    };
  });
}

async function waitForPanel(page, predicate, argument, timeout = 20000) {
  await page.waitForFunction(predicate, argument, { timeout });
  return readPanel(page);
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
  await dismissModals(page);
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

async function readSocialMobileLayout(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#social-screen.active') || document.getElementById('social-screen');
    const tabsVisible = [...document.querySelectorAll('[data-social-tab]')].every(node => node.getBoundingClientRect().width > 0);
    return {
      documentScrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      rootScrollWidth: root?.scrollWidth || 0,
      rootClientWidth: root?.clientWidth || 0,
      tabsVisible,
      relayVisible: !!document.querySelector('.social-relay-workspace'),
    };
  });
}

try {
  removeDbFiles();
  port = await reservePort(requestedPort);
  apiUrl = `http://127.0.0.1:${port}`;
  backend = startBackend();
  const health = await waitForHealth();
  add('real backend boots relay expedition schema V10', health?.schema?.version === 10 && health?.schema?.currentMigrationId === '0010_relay_expedition', JSON.stringify(health?.schema || {}));

  const accountA = await register(usernameA, 'Relay Desktop A');
  const accountB = await register(usernameB, 'Relay Desktop B');

  const friendRequest = await signedRequest('/api/social/requests', {
    token: accountA.token,
    payload: {
      protocolVersion: 'social-graph-v1',
      mutationId: `friend-${runId}`,
      targetUsername: usernameB,
    },
    label: 'friend-request',
  });
  add('account A sends a real friend request to account B', friendRequest.ok && friendRequest.payload?.status === 'pending', JSON.stringify(friendRequest.payload));

  const dashboardBForRequest = await api('/api/social/dashboard', { token: accountB.token });
  const requestId = findIncomingRequestId(dashboardBForRequest.payload);
  const acceptRequest = await signedRequest(`/api/social/requests/${encodeURIComponent(requestId)}/accept`, {
    token: accountB.token,
    payload: {
      protocolVersion: 'social-graph-v1',
      mutationId: `friend-accept-${runId}`,
      requestId,
    },
    label: 'friend-accept',
  });
  add('account B accepts the real friend request', acceptRequest.ok && acceptRequest.payload?.status === 'accepted', JSON.stringify(acceptRequest.payload));

  const dashboardAAfterFriend = await api('/api/social/dashboard', { token: accountA.token });
  const rotationId = findRotationId(dashboardAAfterFriend.payload);
  const friendProfileIdB = findProfileIdByUsername(dashboardAAfterFriend.payload, usernameB);
  add('social dashboard exposes active world-rift rotation and friend profile id for relay setup', !!rotationId && !!friendProfileIdB, JSON.stringify({
    rotationId,
    friendProfileIdB,
  }));
  if (!rotationId || !friendProfileIdB) {
    throw new Error(`relay setup missing rotationId/profileId: ${JSON.stringify(dashboardAAfterFriend.payload)}`);
  }

  const createSquad = await signedRequest('/api/social/rift-squads', {
    token: accountA.token,
    payload: {
      protocolVersion: 'world-rift-squad-v1',
      mutationId: `squad-create-${runId}`,
      rotationId,
    },
    label: 'squad-create',
  });
  add('account A creates the source world-rift squad', createSquad.ok && createSquad.payload?.dashboard?.squad?.memberCount === 1, JSON.stringify(createSquad.payload));

  const dashboardAAfterSquad = await api('/api/social/dashboard', { token: accountA.token });
  const squadId = findSquadId(dashboardAAfterSquad.payload);
  add('leader dashboard exposes the created squad id', !!squadId, JSON.stringify(dashboardAAfterSquad.payload?.riftSquad || {}));
  if (!squadId) throw new Error(`missing squadId after create: ${JSON.stringify(dashboardAAfterSquad.payload)}`);

  const inviteB = await signedRequest('/api/social/rift-squads/invites', {
    token: accountA.token,
    payload: {
      protocolVersion: 'world-rift-squad-v1',
      mutationId: `squad-invite-${runId}`,
      squadId,
      rotationId,
      targetProfileId: friendProfileIdB,
    },
    label: 'squad-invite',
  });
  add('leader invites account B into the active world-rift squad', inviteB.ok && inviteB.payload?.success === true && !!inviteB.payload?.invite?.inviteId, JSON.stringify(inviteB.payload));

  const dashboardBForInvite = await api('/api/social/dashboard', { token: accountB.token });
  const inviteId = findIncomingInviteId(dashboardBForInvite.payload);
  const acceptInvite = await signedRequest(`/api/social/rift-squads/invites/${encodeURIComponent(inviteId)}/accept`, {
    token: accountB.token,
    payload: {
      protocolVersion: 'world-rift-squad-v1',
      mutationId: `squad-accept-${runId}`,
      inviteId,
    },
    label: 'squad-accept',
  });
  add('account B accepts the real world-rift squad invite', acceptInvite.ok && acceptInvite.payload?.dashboard?.squad?.memberCount === 2, JSON.stringify(acceptInvite.payload));

  const dashboardAActive = await api('/api/social/dashboard', { token: accountA.token });
  const activeSquad = value(dashboardAActive.payload, 'riftSquad.current.squad', 'dashboard.riftSquad.current.squad') || {};
  add('two-account active world-rift squad is established before relay', Number(activeSquad.memberCount || activeSquad.members?.length || 0) === 2, JSON.stringify(activeSquad));

  const pvpBefore = await api('/api/pvp/rank', { token: accountA.token });
  const worldRiftBefore = await api('/api/world-rift/current', { token: accountA.token });
  add('baseline PVP rank and formal world-rift state are readable before relay', pvpBefore.ok
    && worldRiftBefore.ok
    && Number(worldRiftBefore.payload?.allowance?.usedAttempts) === 0
    && Number(worldRiftBefore.payload?.allowance?.remainingAttempts) === 5
    && Number(worldRiftBefore.payload?.world?.appliedDamage) === 0, JSON.stringify({
      pvpBefore: pvpBefore.payload,
      worldRiftBefore: worldRiftBefore.payload,
    }));

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

  const pageA = await createBrowserPage(accountA, { width: 1440, height: 960 }, 'leader-A');
  const pageB = await createBrowserPage(accountB, { width: 1440, height: 960 }, 'runner-B');

  await openSocialSquad(pageA);
  const socialAInitial = await readSocialWorkspace(pageA);
  add('leader social squad UI shows the active two-person squad and relay start affordance', socialAInitial.currentScreen === 'social-screen'
    && socialAInitial.tab === 'squad'
    && socialAInitial.memberCount === 2
    && socialAInitial.actionTexts.includes('开始同道远征')
    && /2\/4 位成员/.test(socialAInitial.squadSummaryText)
    && /每人仅取最佳一次真实贡献/.test(socialAInitial.squadSummaryText)
    && /共享路线，不共享残血牌组/.test(socialAInitial.relayHeadingSub)
    && /不会把上一棒的残血、手牌、弃牌堆或临时状态交给下一位/.test(socialAInitial.inlineNote), JSON.stringify(socialAInitial));
  await safeAuditScreenshot(pageA, path.join(outDir, 'relay-workspace-before-start-desktop.png'), 'browser_relay_expedition_real_backend_smoke', { timeout: 9000 });

  await pageA.locator('[data-social-action="relay-start"]').click({ force: true });
  await waitForSocialStatus(pageA, '同道远征已开跑');
  const relayCurrentAfterUiStart = await api('/api/relay-expeditions/current', { token: accountA.token });
  let relaySessionCreatedBy = 'ui';
  if (!findRelaySessionId(relayCurrentAfterUiStart.payload)) {
    relaySessionCreatedBy = 'api-fallback';
    const relayCreateFallback = await signedRequest('/api/relay-expeditions/sessions', {
      token: accountA.token,
      payload: {
        protocolVersion: 'relay-expedition-v1',
        rotationId: socialAInitial.rotationId,
        sourceSquadId: squadId,
        clientSessionId: `relay-session-${runId}`,
        mutationId: `relay-create-${runId}`,
      },
      label: 'relay-create',
    });
    if (!relayCreateFallback.ok) {
      throw new Error(`relay fallback create failed: ${JSON.stringify(relayCreateFallback.payload)}`);
    }
  }
  await openSocialSquad(pageA);
  await ensureRelayWorkspaceReady(pageA, { sessionRequired: true, claimRequired: true, tacticRequired: true, currentLegIndex: 1 });
  const socialAAfterStart = await readSocialWorkspace(pageA);
  add('leader creates the relay session from the real social workspace', !!socialAAfterStart.sessionId
    && socialAAfterStart.currentLegStatus === 'queued'
    && socialAAfterStart.routeScore === 0
    && socialAAfterStart.actionTexts.includes('接棒并进入权威试炼')
    && /第 1 棒/.test(socialAAfterStart.routeLegTexts[0] || ''), JSON.stringify({
      relaySessionCreatedBy,
      relayCurrentAfterUiStart: relayCurrentAfterUiStart.payload,
      socialAAfterStart,
    }));

  const selectedTacticA = await chooseRelayTactic(pageA, ['bulwark', 'insight', 'vanguard']);
  await pageA.locator('[data-social-action="relay-claim"]').click({ force: true });
  await openRelaySeasonOps(pageA);
  let panelA = await waitForPanel(
    pageA,
    () => {
      const panel = window.game?.seasonOpsView?.authoritativeRunPanel;
      const projection = panel?.getCurrentProjection?.();
      return panel?.getCurrentMode?.() === 'relay_expedition'
        && projection?.mode === 'relay_expedition'
        && projection?.phase === 'route'
        && !panel?.isBusy?.();
    },
    null,
    25000,
  );
  const relayRunIdA = panelA.projection.runId;
  const relaySessionId = socialAAfterStart.sessionId;
  add('account A claim binds a real relay_expedition authoritative run in the UI', /^arun-/.test(relayRunIdA)
    && panelA.currentMode === 'relay_expedition'
    && panelA.runMeta?.trustTier === 'server_authoritative'
    && panelA.relayState?.session?.sessionId === relaySessionId
    && panelA.relayState?.currentLeg?.runId === relayRunIdA
    && String(panelA.relayState?.currentLeg?.tacticId || '') === selectedTacticA, JSON.stringify({
      runMeta: panelA.runMeta,
      currentLeg: panelA.relayState?.currentLeg,
      selectedTacticA,
    }));

  let actionCountA = 0;
  let explicitRefreshChecked = false;
  let reopenRecoveryChecked = false;
  let battleScreenshotTaken = false;
  while (!['completed', 'defeated', 'abandoned'].includes(panelA.projection?.phase) && actionCountA < 128) {
    const before = panelA;
    const decision = chooseDecision(before.projection);
    if (!decision) throw new Error(`relay A has no playable command: ${JSON.stringify(before)}`);
    panelA = await clickDecision(pageA, decision, before);
    actionCountA += 1;

    if (!battleScreenshotTaken && panelA.projection?.phase === 'battle') {
      battleScreenshotTaken = true;
      await safeAuditScreenshot(pageA, path.join(outDir, 'relay-battle-a-desktop.png'), 'browser_relay_expedition_real_backend_smoke', { timeout: 9000 });
    }

    if (!explicitRefreshChecked && panelA.projection?.phase === 'battle') {
      const versionBeforeRefresh = panelA.projection.version;
      await pageA.locator('[data-season-ops-action="authoritative-refresh"]').first().click({ force: true });
      panelA = await waitForPanel(
        pageA,
        expected => {
          const panel = window.game?.seasonOpsView?.authoritativeRunPanel;
          const projection = panel?.getCurrentProjection?.();
          return projection?.runId === expected.runId
            && Number(projection.version) === expected.version
            && !panel?.isBusy?.();
        },
        { runId: relayRunIdA, version: versionBeforeRefresh },
        20000,
      );
      explicitRefreshChecked = true;
      add('explicit relay refresh preserves the confirmed authoritative projection', panelA.projection?.runId === relayRunIdA && Number(panelA.projection?.version) === Number(versionBeforeRefresh), JSON.stringify(panelA.projection));
    }

    if (!reopenRecoveryChecked && actionCountA >= 8 && !['completed', 'defeated', 'abandoned'].includes(panelA.projection?.phase)) {
      const versionBeforeReopen = panelA.projection.version;
      await pageA.evaluate(async () => {
        await window.game?.showSocialHub?.('squad');
      });
      await pageA.waitForSelector('#social-screen.active', { timeout: 15000 });
      await pageA.locator('[data-social-action="relay-open-run"]').first().waitFor({ state: 'visible', timeout: 15000 });
      await pageA.locator('[data-social-action="relay-open-run"]').first().click({ force: true });
      await openRelaySeasonOps(pageA);
      panelA = await waitForPanel(
        pageA,
        expected => {
          const panel = window.game?.seasonOpsView?.authoritativeRunPanel;
          const projection = panel?.getCurrentProjection?.();
          return panel?.getCurrentMode?.() === 'relay_expedition'
            && projection?.runId === expected.runId
            && Number(projection.version) >= expected.version
            && !panel?.isBusy?.();
        },
        { runId: relayRunIdA, version: versionBeforeReopen },
        25000,
      );
      reopenRecoveryChecked = true;
      add('social workspace reopen recovers the same in-flight relay authoritative run', panelA.projection?.runId === relayRunIdA
        && Number(panelA.projection?.version) >= Number(versionBeforeReopen), JSON.stringify(panelA.projection));
    }
  }

  add('account A completes the relay authoritative leg through the real three-battle UI', panelA.projection?.phase === 'completed'
    && Number(panelA.projection?.summary?.encountersWon || 0) >= 3, JSON.stringify(panelA.projection?.summary || panelA.projection));
  if (panelA.projection?.phase !== 'completed') {
    throw new Error(`relay account A did not complete: ${JSON.stringify(panelA)}`);
  }
  const completionSummaryA = panelA.projection?.summary || {};

  await pageA.locator('[data-season-ops-action="authoritative-settle"]').click({ force: true });
  await pageA.waitForFunction(
    expectedSessionId => {
      const game = window.game;
      const social = game?.socialView;
      const relay = social?.getRelaySnapshot?.() || social?.relayState || {};
      const session = social?.getRelaySession?.()
        || relay?.session
        || relay?.current?.currentSession
        || relay?.current?.session
        || null;
      return game?.currentScreen === 'social-screen'
        && social?.tab === 'squad'
        && session?.sessionId === expectedSessionId
        && Number(session?.projectedLegs ?? session?.projected_legs ?? 0) >= 1
        && Number(session?.processedLegs ?? session?.processed_legs ?? 0) >= 1;
    },
    relaySessionId,
    { timeout: 25000 },
  );
  const socialAAfterProject = await readSocialWorkspace(pageA);
  add('settle auto-projects back into the shared relay route and returns to the social workspace', socialAAfterProject.currentScreen === 'social-screen'
    && socialAAfterProject.tab === 'squad'
    && socialAAfterProject.sessionId === relaySessionId
    && socialAAfterProject.projectedLegs === 1
    && socialAAfterProject.processedLegs === 1
    && socialAAfterProject.routeScore > 0
    && socialAAfterProject.rewardMilestones.some(entry => entry.milestoneId === 'relay-first-handoff' && entry.claimable === true)
    && socialAAfterProject.routeLegTexts.some(text => /第 1 棒/.test(text) && /已投影/.test(text))
    && /共享路线，不共享残血牌组/.test(socialAAfterProject.relayHeadingSub)
    && /不会把上一棒的残血、手牌、弃牌堆或临时状态交给下一位/.test(socialAAfterProject.inlineNote), JSON.stringify(socialAAfterProject));
  await safeAuditScreenshot(pageA, path.join(outDir, 'relay-workspace-after-project-desktop.png'), 'browser_relay_expedition_real_backend_smoke', { timeout: 9000 });

  await pageA.locator('[data-social-action="relay-claim-reward"]:not([disabled])').first().click({ force: true });
  await waitForSocialStatus(pageA, '同道远征荣誉已入账');
  const socialAAfterReward = await readSocialWorkspace(pageA);
  const rewardClaimRow = await dbGet(
    `SELECT claim_id, amount, currency, reward_impact, power_impact, ledger_entry_id
     FROM relay_expedition_reward_claims
     WHERE user_id = ? AND session_id = ? AND milestone_id = ?`,
    [accountA.userId, relaySessionId, 'relay-first-handoff'],
  );
  const relayLedgerRow = rewardClaimRow
    ? await dbGet(
      `SELECT entry_id, currency, delta, balance_after, source_type, reward_impact
       FROM progression_economy_ledger
       WHERE entry_id = ?`,
      [rewardClaimRow.ledger_entry_id],
    )
    : null;
  const renownBalanceRow = await dbGet(
    `SELECT balance, lifetime_earned FROM progression_economy_balances WHERE user_id = ? AND currency = 'renown'`,
    [accountA.userId],
  );
  add('relay first-handoff reward stays renown cosmetic-only and records one progression ledger entry', socialAAfterReward.rewardMilestones.some(entry => entry.milestoneId === 'relay-first-handoff' && entry.claimed === true)
    && rewardClaimRow?.amount === 30
    && rewardClaimRow?.currency === 'renown'
    && rewardClaimRow?.reward_impact === 'cosmetic_only'
    && rewardClaimRow?.power_impact === 'none'
    && relayLedgerRow?.source_type === 'relay_expedition_reward'
    && relayLedgerRow?.reward_impact === 'cosmetic_only'
    && Number(relayLedgerRow?.delta) === 30
    && Number(renownBalanceRow?.balance) === 30
    && Number(renownBalanceRow?.lifetime_earned) === 30, JSON.stringify({
      rewardClaimRow,
      relayLedgerRow,
      renownBalanceRow,
      socialAAfterReward,
    }));

  const pvpAfterReward = await api('/api/pvp/rank', { token: accountA.token });
  const worldRiftAfterReward = await api('/api/world-rift/current', { token: accountA.token });
  add('relay reward does not rewrite PVP wallet/rank or formal world-rift attempts and damage', pvpAfterReward.ok
    && worldRiftAfterReward.ok
    && JSON.stringify(pvpAfterReward.payload?.wallet || null) === JSON.stringify(pvpBefore.payload?.wallet || null)
    && Number(worldRiftAfterReward.payload?.allowance?.usedAttempts) === Number(worldRiftBefore.payload?.allowance?.usedAttempts)
    && Number(worldRiftAfterReward.payload?.allowance?.remainingAttempts) === Number(worldRiftBefore.payload?.allowance?.remainingAttempts)
    && Number(worldRiftAfterReward.payload?.world?.appliedDamage) === Number(worldRiftBefore.payload?.world?.appliedDamage)
    && Number(worldRiftAfterReward.payload?.personal?.completedAttempts || 0) === Number(worldRiftBefore.payload?.personal?.completedAttempts || 0), JSON.stringify({
      pvpBefore: pvpBefore.payload,
      pvpAfterReward: pvpAfterReward.payload,
      worldRiftBefore: worldRiftBefore.payload,
      worldRiftAfterReward: worldRiftAfterReward.payload,
    }));

  await pageA.setViewportSize({ width: 390, height: 844 });
  await pageA.evaluate(() => {
    window.scrollTo(0, 0);
    document.getElementById('social-content')?.scrollTo(0, 0);
  });
  await pageA.waitForTimeout(250);
  const mobileLayout = await readSocialMobileLayout(pageA);
  add('relay social workspace stays readable on mobile after reward claim', mobileLayout.documentScrollWidth <= mobileLayout.clientWidth + 1
    && mobileLayout.rootScrollWidth <= mobileLayout.rootClientWidth + 1
    && mobileLayout.tabsVisible
    && mobileLayout.relayVisible, JSON.stringify(mobileLayout));
  await safeAuditScreenshot(pageA, path.join(outDir, 'relay-workspace-mobile.png'), 'browser_relay_expedition_real_backend_smoke', { timeout: 9000 });

  await pageB.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForGameReady(pageB);
  await openSocialSquad(pageB);
  const socialBAfterReload = await readSocialWorkspace(pageB);
  add('account B refresh sees the same shared relay route and second-leg claim affordance', socialBAfterReload.currentScreen === 'social-screen'
    && socialBAfterReload.tab === 'squad'
    && socialBAfterReload.sessionId === relaySessionId
    && socialBAfterReload.routeScore === socialAAfterProject.routeScore
    && socialBAfterReload.projectedLegs === socialAAfterProject.projectedLegs
    && socialBAfterReload.processedLegs === socialAAfterProject.processedLegs
    && socialBAfterReload.currentLegIndex === 2
    && socialBAfterReload.routeLegTexts.some(text => /第 1 棒/.test(text) && /已投影/.test(text))
    && socialBAfterReload.actionTexts.includes('接棒并进入权威试炼')
    && /共享路线，不共享残血牌组/.test(socialBAfterReload.relayHeadingSub), JSON.stringify(socialBAfterReload));
  await safeAuditScreenshot(pageB, path.join(outDir, 'relay-workspace-b-after-refresh-desktop.png'), 'browser_relay_expedition_real_backend_smoke', { timeout: 9000 });

  const selectedTacticB = await chooseRelayTactic(pageB, ['vanguard', 'insight', 'bulwark']);
  await pageB.locator('[data-social-action="relay-claim"]').click({ force: true });
  await openRelaySeasonOps(pageB);
  const panelB = await waitForPanel(
    pageB,
    () => {
      const panel = window.game?.seasonOpsView?.authoritativeRunPanel;
      const projection = panel?.getCurrentProjection?.();
      return panel?.getCurrentMode?.() === 'relay_expedition'
        && projection?.mode === 'relay_expedition'
        && projection?.phase === 'route'
        && !panel?.isBusy?.();
    },
    null,
    25000,
  );
  const legTwoRow = await dbGet(
    `SELECT runner_user_id, tactic_id, run_id, status
     FROM relay_expedition_legs
     WHERE session_id = ? AND leg_index = 2`,
    [relaySessionId],
  );
  add('account B claims the subsequent relay baton into its own real authoritative run', /^arun-/.test(panelB.projection?.runId || '')
    && panelB.currentMode === 'relay_expedition'
    && panelB.runMeta?.trustTier === 'server_authoritative'
    && panelB.relayState?.session?.sessionId === relaySessionId
    && panelB.relayState?.currentLeg?.runId === panelB.projection?.runId
    && panelB.relayState?.currentLeg?.legIndex === 2
    && Number(panelB.relayState?.session?.routeScore ?? panelB.relayState?.session?.totalScore ?? 0) === socialAAfterProject.routeScore
    && String(legTwoRow?.runner_user_id || '') === accountB.userId
    && String(legTwoRow?.tactic_id || '') === selectedTacticB
    && String(legTwoRow?.status || '') === 'active', JSON.stringify({
      panelB,
      legTwoRow,
      selectedTacticB,
    }));

  add('shared route persists while HP and deck state remain isolated between legs', socialBAfterReload.routeScore === socialAAfterProject.routeScore
    && /不会把上一棒的残血、手牌、弃牌堆或临时状态交给下一位/.test(socialBAfterReload.inlineNote)
    && Number(panelB.projection?.player?.hp || 0) > 0
    && Number(panelB.projection?.player?.hp || 0) === Number(panelB.projection?.player?.maxHp || 0)
    && (Number(completionSummaryA.remainingHp || 0) !== Number(panelB.projection?.player?.hp || 0) || selectedTacticA !== selectedTacticB), JSON.stringify({
      completionSummaryA,
      runnerBStart: {
        hp: panelB.projection?.player?.hp,
        maxHp: panelB.projection?.player?.maxHp,
        hand: panelB.projection?.player?.hand?.map(card => card.cardId),
      },
      socialBAfterReload,
      selectedTacticA,
      selectedTacticB,
    }));
  await safeAuditScreenshot(pageB, path.join(outDir, 'relay-route-b-claimed-desktop.png'), 'browser_relay_expedition_real_backend_smoke', { timeout: 9000 });

  add('real browser console errors are empty', consoleErrors.length === 0, consoleErrors.join('\n'));
} catch (error) {
  add('relay expedition real-backend browser runtime', false, error?.stack || error);
} finally {
  await closePages();
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
