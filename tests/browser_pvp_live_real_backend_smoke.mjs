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
const outDir = process.argv[3] || 'output/browser-pvp-live-real-backend-smoke';
const requestedPort = Number(process.env.BROWSER_PVP_LIVE_REAL_PORT || 0);
const dbPath = process.env.BROWSER_PVP_LIVE_REAL_DB_PATH
  || path.join(os.tmpdir(), `the-defier-pvp-live-real-${process.pid}.sqlite`);
const viewportMode = String(process.env.BROWSER_PVP_LIVE_REAL_VIEWPORT || 'desktop').trim().toLowerCase();
const isMobileViewport = viewportMode === 'mobile';
const requireMobileViewport = process.env.BROWSER_PVP_LIVE_REAL_REQUIRE_MOBILE === '1';
const runId = `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
const password = `pwd_${runId}`;
const TEST_MATCH_SCOPE = `real_backend_smoke_${runId}`.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();

if (requireMobileViewport && !isMobileViewport) {
  throw new Error('BROWSER_PVP_LIVE_REAL_REQUIRE_MOBILE requires BROWSER_PVP_LIVE_REAL_VIEWPORT=mobile');
}

fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];
let port = 0;
let apiUrl = '';

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

function cssAttributeValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function liveCardSelector(cardInstanceId) {
  return `[data-live-card="${cssAttributeValue(cardInstanceId)}"]`;
}

function otherSeatId(seatId) {
  return seatId === 'A' ? 'B' : 'A';
}

function seatSlug(seatId) {
  return `seat-${String(seatId || '').toLowerCase()}`;
}

function recordConsoleError(text) {
  const message = String(text || '');
  if (/ERR_CONNECTION_(CLOSED|RESET)/.test(message)) return;
  if (/Failed to load resource: net::ERR_FILE_NOT_FOUND/.test(message)) return;
  if (/Failed to load resource: the server responded with a status of 404 \(Not Found\)/.test(message)) return;
  consoleErrors.push(message);
}

async function reserveAvailablePort(preferredPort = 0) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: preferredPort }, resolve);
  });
  const address = server.address();
  const selectedPort = typeof address === 'object' && address ? address.port : preferredPort;
  await new Promise(resolve => server.close(resolve));
  return selectedPort;
}

function removeDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

function dbRun(sql, params = []) {
  const db = new sqlite3.Database(dbPath);
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      db.close();
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  const db = new sqlite3.Database(dbPath);
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      db.close();
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

async function seedRankedHistory(username, score = 1000, rankedGames = 6) {
  const user = await dbGet('SELECT id, username FROM users WHERE username = ?', [username]);
  if (!user || !user.id) throw new Error(`cannot seed rank for missing user: ${username}`);
  const now = Date.now();
  const games = Math.max(0, Math.floor(Number(rankedGames) || 0));
  await dbRun(
    `INSERT INTO pvp_ranks
      (id, user_id, user_name, score, wins, losses, realm, division, season_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, 1, '玄阶', 's1-genesis', ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
      user_name = excluded.user_name,
      score = excluded.score,
      wins = excluded.wins,
      losses = excluded.losses,
      division = excluded.division,
      updated_at = excluded.updated_at`,
    [`rank-${user.id}`, user.id, user.username || username, score, games, now, now],
  );
}

function startBackend() {
  const child = spawn(process.execPath, ['server/app.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      JWT_SECRET: 'integration-jwt-secret-32-characters',
      DEFIER_HMAC_SECRET: 'integration-hmac-secret-32-characters',
      DEFIER_INTEGRITY_REQUIRED: '1',
      DEFIER_PVP_TEST_MODE: '1',
      DEFIER_DB_PATH: dbPath,
      PVP_LIVE_SETUP_READY_TIMEOUT_MS: '10000',
      PVP_LIVE_LONG_WAIT_THRESHOLD_MS: '1000',
      PVP_LIVE_HEARTBEAT_INTERVAL_MS: '1000',
      PVP_LIVE_HEARTBEAT_STALE_MS: '1000',
      PVP_LIVE_RECONNECT_GRACE_MS: '60000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  return { child, getOutput: () => output };
}

async function stopBackend(server) {
  if (!server || server.child.killed || server.child.exitCode !== null) return;
  server.child.kill('SIGTERM');
  await new Promise(resolve => {
    const timer = setTimeout(resolve, 2000);
    server.child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitForHealth(server) {
  const deadline = Date.now() + 10000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (server?.child?.exitCode !== null) {
      throw new Error(`backend exited before health check: code=${server.child.exitCode}\n${server.getOutput()}`);
    }
    try {
      const res = await fetch(`${apiUrl}/api/health`);
      const payload = await res.json();
      if (res.status === 200 && payload?.status === 'ok') return;
      lastError = new Error(`health returned ${res.status}: ${JSON.stringify(payload)}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`backend health check timed out: ${lastError?.message || 'unknown'}\n${server.getOutput()}`);
}

function makeLoadout(identitySlot, pattern) {
  const deck = [];
  for (let index = 0; index < 20; index += 1) {
    deck.push({ id: pattern[index % pattern.length], upgraded: false });
  }
  return {
    identitySlot,
    label: `${identitySlot}-browser-real`,
    deck,
  };
}

async function preparePage(browser, username, displayName) {
  const context = await browser.newContext(isMobileViewport
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
    : { viewport: { width: 1366, height: 860 } });
  await context.addInitScript((targetApiUrl) => {
    try {
      localStorage.setItem('theDefierDebug', 'true');
      localStorage.setItem('theDefierServerConfig', JSON.stringify({ baseUrl: targetApiUrl }));
    } catch {}
  }, apiUrl);
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') recordConsoleError(`[${displayName}] ${msg.text()}`);
  });
  page.on('pageerror', err => recordConsoleError(`[${displayName}] ${String(err)}`));
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => !!window.game
      && !!window.__THE_DEFIER_SERVICES__?.BackendClient
      && !!window.__THE_DEFIER_SERVICES__?.AuthService
      && !!window.PVPService
      && !!window.PVPScene,
    null,
    { timeout: 15000 },
  );
  await page.evaluate(async ({ username, password, testMatchScope }) => {
    const services = window.__THE_DEFIER_SERVICES__;
    const BackendClient = services.BackendClient;
    const AuthService = services.AuthService;
    BackendClient.REQUEST_TIMEOUT_MS = 8000;
    BackendClient.NETWORK_RETRY = 0;
    BackendClient.clearServerSession();
    const init = BackendClient.init();
    if (!init?.success) throw new Error(`BackendClient init failed: ${init?.message || BackendClient.initError || 'unknown'}`);
    const reg = await AuthService.register(username, password);
    if (!reg?.success) throw new Error(`register failed: ${JSON.stringify(reg)}`);
    const login = await AuthService.login(username, password);
    if (!login?.success) throw new Error(`login failed: ${JSON.stringify(login)}`);
    window.PVPService.currentRankData = null;
    window.PVPService.clearActiveMatch?.();
    window.__DEFIER_PVP_REAL_TEST_SCOPE = testMatchScope;
    if (!window.PVPScene.__realSmokeOriginalJoinLiveQueue) {
      window.PVPScene.__realSmokeOriginalJoinLiveQueue = window.PVPScene.joinLiveQueue.bind(window.PVPScene);
      window.PVPScene.joinLiveQueue = async function scopedRealSmokeJoinLiveQueue(options = {}) {
        return await window.PVPScene.__realSmokeOriginalJoinLiveQueue({
          ...options,
          testMatchScope: window.__DEFIER_PVP_REAL_TEST_SCOPE
        });
      };
    }
    window.game.showScreen('pvp-screen');
  }, { username, password, testMatchScope: TEST_MATCH_SCOPE });
  return { context, page, username, displayName };
}

async function getLiveSnapshot(page) {
  return page.evaluate(() => window.PVPScene.getLiveSnapshot());
}

async function getLiveSessionProbe(page) {
  return page.evaluate(() => {
    const sessionState = window.PVPScene?.getLiveSession?.()?.getState?.() || {};
    const snapshot = window.PVPScene?.getLiveSnapshot?.() || {};
    return {
      phase: snapshot.phase || '',
      matchId: snapshot.matchId || '',
      seatId: snapshot.seatId || '',
      stateVersion: snapshot.stateVersion || 0,
      selfReady: !!(snapshot.self && snapshot.self.ready),
      opponentReady: !!(snapshot.opponent && snapshot.opponent.ready),
      realtimeStatus: sessionState.realtimeStatus || '',
      lastRealtimeConnectionId: sessionState.lastRealtimeConnectionId || '',
      lastRealtimeSyncMatchId: sessionState.lastRealtimeSyncMatchId || '',
      lastRealtimeSyncAt: sessionState.lastRealtimeSyncAt || 0,
      lastError: sessionState.lastError || null,
      stateViewVersion: sessionState.stateView?.stateVersion || 0,
      stateViewStatus: sessionState.stateView?.status || '',
      stateViewSelfReady: !!(sessionState.stateView?.self && sessionState.stateView.self.ready),
      stateViewOpponentReady: !!(sessionState.stateView?.opponent && sessionState.stateView.opponent.ready),
    };
  });
}

async function dismissBlockingModals(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.classList.remove('active');
      modal.style.removeProperty('display');
    });
    ['auth-modal', 'save-slots-modal', 'generic-confirm-modal', 'save-conflict-modal'].forEach(id => {
      const modal = document.getElementById(id);
      if (!modal) return;
      modal.classList.remove('active');
      modal.style.removeProperty('display');
    });
  });
}

async function reloadAndOpenLivePanel(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => !!window.game && !!window.PVPScene && typeof window.render_game_to_text === 'function',
    null,
    { timeout: 15000 },
  );
  await page.evaluate(async (testMatchScope) => {
    window.__DEFIER_PVP_REAL_TEST_SCOPE = testMatchScope;
    if (!window.PVPScene.__realSmokeOriginalJoinLiveQueue) {
      window.PVPScene.__realSmokeOriginalJoinLiveQueue = window.PVPScene.joinLiveQueue.bind(window.PVPScene);
      window.PVPScene.joinLiveQueue = async function scopedRealSmokeJoinLiveQueue(options = {}) {
        return await window.PVPScene.__realSmokeOriginalJoinLiveQueue({
          ...options,
          testMatchScope: window.__DEFIER_PVP_REAL_TEST_SCOPE
        });
      };
    }
    window.game.showScreen('pvp-screen');
    window.PVPScene.activeTab = 'live';
    document.querySelectorAll('.rune-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.rune-tab[onclick*="live"]')?.classList.add('active');
    document.querySelectorAll('.pvp-tab-pane').forEach(el => {
      el.classList.remove('active');
      el.style.display = '';
    });
    document.getElementById('tab-live')?.classList.add('active');
    await window.PVPScene.loadLivePanel();
  }, TEST_MATCH_SCOPE);
  await dismissBlockingModals(page);
}

async function waitForLivePhase(page, phase, timeoutMs = 10000) {
  await page.waitForFunction(
    expected => window.PVPScene?.getLiveSnapshot?.()?.phase === expected,
    phase,
    { timeout: timeoutMs },
  );
  return getLiveSnapshot(page);
}

async function waitForLiveSnapshot(page, predicate, arg = null, timeoutMs = 10000) {
  await page.waitForFunction(predicate, arg, { timeout: timeoutMs });
  return getLiveSnapshot(page);
}

async function ensureLiveRealtime(page, timeoutMs = 10000) {
  const matchId = await page.evaluate(() => {
    const session = window.PVPScene?.getLiveSession?.();
    const state = session?.getState?.();
    if (state?.matchId) {
      window.PVPScene.startLiveRealtime(state);
      return state.matchId;
    }
    return '';
  });
  if (!matchId) throw new Error('live realtime requires an active match id');
  await page.waitForFunction(
    () => window.PVPScene?.getLiveSession?.()?.getState?.()?.realtimeStatus === 'connected',
    null,
    { timeout: timeoutMs },
  );
  await page.evaluate((targetMatchId) => {
    const session = window.PVPScene?.getLiveSession?.();
    const state = session?.getState?.();
    if (session && state?.matchId === targetMatchId) {
      session.joinRealtimeMatch(targetMatchId, {
        lastSeenRevision: window.PVPScene.getLiveLastSeenEventRevision(state),
      });
    }
  }, matchId);
  await page.waitForFunction(
    targetMatchId => {
      const state = window.PVPScene?.getLiveSession?.()?.getState?.();
      return state?.realtimeStatus === 'connected'
        && state?.lastRealtimeSyncMatchId === targetMatchId
        && state?.stateView?.matchId === targetMatchId;
    },
    matchId,
    { timeout: timeoutMs },
  );
  return getLiveSnapshot(page);
}

async function assertMobileActionable(page, selector, label) {
  if (!isMobileViewport) return null;
  return await page.evaluate(({ targetSelector, targetLabel }) => {
    const targets = Array.from(document.querySelectorAll(targetSelector));
    if (targets.length === 0) {
      return { ok: false, label: targetLabel, selector: targetSelector, reason: 'missing' };
    }
    let fallback = null;
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
      const rect = target.getBoundingClientRect();
      const x = Math.min(window.innerWidth - 1, Math.max(1, rect.left + rect.width / 2));
      const y = Math.min(window.innerHeight - 1, Math.max(1, rect.top + rect.height / 2));
      const hit = document.elementFromPoint(x, y);
      const ok = !target.disabled
        && rect.width > 0
        && rect.height >= 32
        && rect.left >= 0
        && rect.right <= window.innerWidth + 2
        && rect.top >= 0
        && rect.bottom <= window.innerHeight + 2
        && (hit === target || target.contains(hit));
      const report = {
        ok,
        label: targetLabel,
        selector: targetSelector,
        candidateIndex: index,
        candidateCount: targets.length,
        disabled: !!target.disabled,
        rect: {
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        tapPoint: { x: Math.round(x), y: Math.round(y) },
        hitTag: hit?.tagName || '',
        hitText: hit?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 60) || '',
      };
      if (ok) return report;
      if (!fallback) fallback = report;
    }
    return fallback;
  }, { targetSelector: selector, targetLabel: label });
}

async function clickLiveControl(page, selector, label) {
  await page.waitForSelector(selector, { timeout: 5000 });
  const waitForActionableControl = async () => {
    const deadline = Date.now() + 5000;
    let actionability = null;
    do {
      actionability = await page.evaluate(({ targetSelector, targetLabel }) => {
        document.querySelectorAll('.modal').forEach(modal => {
          modal.classList.remove('active');
          modal.style.removeProperty('display');
        });
        const targets = Array.from(document.querySelectorAll(targetSelector));
        if (targets.length === 0) {
          return { ok: false, label: targetLabel, selector: targetSelector, reason: 'missing' };
        }
        let fallback = null;
        for (let index = 0; index < targets.length; index += 1) {
          const target = targets[index];
          const scrollBlocks = ['nearest', 'start', 'center', 'end'];
          for (const scrollBlock of scrollBlocks) {
            target.scrollIntoView({ block: scrollBlock, inline: 'nearest' });
            const rect = target.getBoundingClientRect();
            const style = window.getComputedStyle(target);
            const visibleBox = !target.disabled
              && style.visibility !== 'hidden'
              && style.display !== 'none'
              && rect.width > 0
              && rect.height >= (window.innerWidth <= 480 ? 32 : 1)
              && rect.left >= 0
              && rect.right <= window.innerWidth + 2
              && rect.top >= 0
              && rect.bottom <= window.innerHeight + 2;
            const tapCandidates = [
              { label: 'center', xRatio: 0.5, yRatio: 0.5 },
              { label: 'left-center', xRatio: 0.18, yRatio: 0.5 },
              { label: 'right-center', xRatio: 0.82, yRatio: 0.5 },
              { label: 'upper-center', xRatio: 0.5, yRatio: 0.25 },
              { label: 'lower-center', xRatio: 0.5, yRatio: 0.75 },
            ];
            for (const point of tapCandidates) {
              const x = Math.min(window.innerWidth - 1, Math.max(1, rect.left + rect.width * point.xRatio));
              const y = Math.min(window.innerHeight - 1, Math.max(1, rect.top + rect.height * point.yRatio));
              const hit = document.elementFromPoint(x, y);
              const ok = visibleBox && (hit === target || target.contains(hit));
              const report = {
                ok,
                label: targetLabel,
                selector: targetSelector,
                candidateIndex: index,
                candidateCount: targets.length,
                disabled: !!target.disabled,
                pointLabel: point.label,
                scrollBlock,
                rect: {
                  left: Math.round(rect.left),
                  right: Math.round(rect.right),
                  top: Math.round(rect.top),
                  bottom: Math.round(rect.bottom),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                },
                viewport: { width: window.innerWidth, height: window.innerHeight },
                tapPoint: { x: Math.round(x), y: Math.round(y) },
                hitTag: hit?.tagName || '',
                hitText: hit?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 60) || '',
              };
              if (ok) return report;
              if (!fallback) fallback = report;
            }
          }
        }
        return fallback;
      }, { targetSelector: selector, targetLabel: label });
      if (actionability.ok) break;
      await page.waitForTimeout(100);
    } while (Date.now() < deadline);
    if (!actionability.ok) {
      throw new Error(`live control is not actionable: ${JSON.stringify(actionability)}`);
    }
    return actionability;
  };
  const actionability = await waitForActionableControl();
  if (isMobileViewport) {
    await page.waitForTimeout(80);
    await page.touchscreen.tap(actionability.tapPoint.x, actionability.tapPoint.y);
    return actionability;
  }
  await page.mouse.click(actionability.tapPoint.x, actionability.tapPoint.y);
  return null;
}

async function clickLiveEndTurnUntilSeat(page, expectedNextSeat, label, maxTouches = 3) {
  const touches = [];
  let probe = null;
  for (let attempt = 1; attempt <= maxTouches; attempt += 1) {
    await waitForLiveActionUnlocked(page, `${label}-attempt-${attempt}`);
    touches.push(await clickLiveControl(page, '[data-live-action="end-turn"]', `${label}-touch-${attempt}`));
    await page.waitForTimeout(250);
    probe = await page.evaluate(({ expectedNextSeat }) => {
      const scene = window.PVPScene;
      const session = scene?.getLiveSession?.();
      const state = session?.getState?.();
      const snapshot = scene?.getLiveSnapshot?.() || null;
      return {
        snapshot,
        reached: snapshot?.currentSeat === expectedNextSeat,
        confirmArmed: !!scene?.isLiveOpeningActionConfirmArmed?.(state, 'end_turn', {}),
        hint: document.querySelector('[data-live-last-error]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        buttonText: document.querySelector('[data-live-action="end-turn"]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      };
    }, { expectedNextSeat });
    if (probe.reached) break;
  }
  return { touches, probe };
}

async function waitForLiveActionUnlocked(page, label, timeoutMs = 10000) {
  try {
    await page.waitForFunction(() => {
      const scene = window.PVPScene;
      const session = scene?.getLiveSession?.();
      const state = session?.getState?.();
      return !!scene && !scene.isLiveIntentInFlight?.(state, 'action');
    }, null, { timeout: timeoutMs });
  } catch (error) {
    const detail = await page.evaluate(() => {
      const scene = window.PVPScene;
      const session = scene?.getLiveSession?.();
      const state = session?.getState?.();
      return {
        snapshot: scene?.getLiveSnapshot?.() || null,
        lockState: scene?.getLiveIntentLockState?.(state) || null,
        inFlight: scene?.liveIntentInFlight || null,
        hint: document.querySelector('[data-live-last-error]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        endTurnDisabled: document.querySelector('[data-live-action="end-turn"]')?.disabled ?? null,
        endTurnText: document.querySelector('[data-live-action="end-turn"]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      };
    });
    throw new Error(`${label}: live action lock did not release: ${JSON.stringify(detail)}; ${error.message}`);
  }
}

async function readyLiveSetupSeat(page, label, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let lastProbe = null;
  while (Date.now() < deadline) {
    lastProbe = await page.evaluate(async () => {
      await window.PVPScene.refreshLiveMatch();
      const before = window.PVPScene.getLiveSnapshot();
      if (before?.phase === 'active') {
        return { done: true, before, after: before, lastError: null };
      }
      if (before?.phase !== 'setup') {
        return {
          done: false,
          before,
          after: before,
          lastError: window.PVPScene.getLiveSession().getState()?.lastError || null,
        };
      }
      if (before?.self?.ready === true) {
        return { done: true, before, after: before, lastError: null };
      }
      await window.PVPScene.readyLiveMatch();
      await window.PVPScene.refreshLiveMatch();
      const after = window.PVPScene.getLiveSnapshot();
      return {
        done: after?.phase === 'active' || after?.self?.ready === true,
        before,
        after,
        lastError: window.PVPScene.getLiveSession().getState()?.lastError || null,
      };
    });
    if (lastProbe?.done) return lastProbe;
    await page.waitForTimeout(250);
  }
  throw new Error(`timed out readying live setup seat ${label}: ${JSON.stringify(lastProbe)}`);
}

async function joinLiveQueueWithLoadout(page, displayName, loadout, testMatchScope = TEST_MATCH_SCOPE) {
  return await page.evaluate(async ({ displayName, loadout, testMatchScope }) => {
    window.__DEFIER_PVP_REAL_TEST_SCOPE = testMatchScope;
    window.game.player.name = displayName;
    window.PVPScene.switchTab('live');
    const presetId = `real_smoke_${String(loadout.identitySlot || 'custom').replace(/[^a-z0-9_-]/gi, '_').toLowerCase()}`;
    if (!window.PVPScene.__realSmokeOriginalGetLiveLoadoutPresets) {
      window.PVPScene.__realSmokeOriginalGetLiveLoadoutPresets = window.PVPScene.getLiveLoadoutPresets.bind(window.PVPScene);
    }
    const originalGetPresets = window.PVPScene.__realSmokeOriginalGetLiveLoadoutPresets;
    const testPreset = {
      id: presetId,
      identitySlot: String(loadout.identitySlot || 'real_smoke_custom'),
      label: String(loadout.label || '真实测试斗法谱'),
      summary: '真实后端 smoke 测试谱',
      pattern: Array.isArray(loadout.deck) ? loadout.deck.map(entry => String(entry && entry.id || '')).filter(Boolean) : [],
    };
    window.PVPScene.getLiveLoadoutPresets = function getLiveLoadoutPresetsWithRealSmokePreset() {
      return [testPreset, ...originalGetPresets()];
    };
    window.PVPScene.liveSelectedLoadoutPreset = presetId;
    await window.PVPScene.joinLiveQueue({
      loadoutPresetId: presetId,
      testMatchScope,
    });
    const result = window.PVPScene.getLiveSession().getState();
    return {
      result,
      snapshot: window.PVPScene.getLiveSnapshot(),
    };
  }, { displayName, loadout, testMatchScope });
}

async function getLiveHandoffRiskReceiptProbe(page) {
  return await page.evaluate(() => {
    if (window.PVPScene && typeof window.PVPScene.renderLivePanel === 'function') {
      window.PVPScene.renderLivePanel();
    }
    const snapshot = window.PVPScene.getLiveSnapshot();
    const textPayload = JSON.parse(window.render_game_to_text()).pvp?.live || null;
    const receiptEl = document.querySelector('[data-live-action-receipt]');
    const riskEl = receiptEl?.querySelector('[data-live-action-handoff-risk="status_response_handoff"]') || null;
    return {
      snapshot,
      text: receiptEl?.textContent?.replace(/\s+/g, ' ').trim() || '',
      typeAttr: receiptEl?.getAttribute('data-live-action-receipt-type') || '',
      actorAttr: receiptEl?.getAttribute('data-live-action-receipt-acting') || '',
      nextSeatAttr: receiptEl?.getAttribute('data-live-action-receipt-next-seat') || '',
      sourceAttr: receiptEl?.getAttribute('data-live-action-receipt-source') || '',
      hiddenAttr: receiptEl?.getAttribute('data-live-action-receipt-hidden') || '',
      seqAttr: receiptEl?.getAttribute('data-live-action-receipt-seq') || '',
      riskAttr: riskEl?.getAttribute('data-live-action-handoff-risk') || '',
      riskState: riskEl?.getAttribute('data-live-action-handoff-risk-state') || '',
      riskSource: riskEl?.getAttribute('data-live-action-handoff-risk-source') || '',
      riskHidden: riskEl?.getAttribute('data-live-action-handoff-risk-hidden') || '',
      riskImpact: riskEl?.getAttribute('data-live-action-handoff-risk-impact') || '',
      riskStatusCount: riskEl?.getAttribute('data-live-action-handoff-risk-status-count') || '',
      riskSafeguard: riskEl?.getAttribute('data-live-action-handoff-risk-safeguard') || '',
      payload: snapshot?.actionReceiptReport || null,
      textPayload: textPayload?.actionReceiptReport || null,
    };
  });
}

async function getLiveStatusPayoffReceiptProbe(page) {
  return await page.evaluate(() => {
    if (window.PVPScene && typeof window.PVPScene.renderLivePanel === 'function') {
      window.PVPScene.renderLivePanel();
    }
    const snapshot = window.PVPScene.getLiveSnapshot();
    const textPayload = JSON.parse(window.render_game_to_text()).pvp?.live || null;
    const receiptEl = document.querySelector('[data-live-action-receipt]');
    const payoffEl = receiptEl?.querySelector('[data-live-action-status-payoff="vulnerable_mark"]') || null;
    return {
      snapshot,
      text: receiptEl?.textContent?.replace(/\s+/g, ' ').trim() || '',
      typeAttr: receiptEl?.getAttribute('data-live-action-receipt-type') || '',
      actorAttr: receiptEl?.getAttribute('data-live-action-receipt-acting') || '',
      nextSeatAttr: receiptEl?.getAttribute('data-live-action-receipt-next-seat') || '',
      sourceAttr: receiptEl?.getAttribute('data-live-action-receipt-source') || '',
      hiddenAttr: receiptEl?.getAttribute('data-live-action-receipt-hidden') || '',
      seqAttr: receiptEl?.getAttribute('data-live-action-receipt-seq') || '',
      payoffAttr: payoffEl?.getAttribute('data-live-action-status-payoff') || '',
      payoffState: payoffEl?.getAttribute('data-live-action-status-payoff-state') || '',
      payoffSource: payoffEl?.getAttribute('data-live-action-status-payoff-source') || '',
      payoffHidden: payoffEl?.getAttribute('data-live-action-status-payoff-hidden') || '',
      payoffImpact: payoffEl?.getAttribute('data-live-action-status-payoff-impact') || '',
      payoffBonus: payoffEl?.getAttribute('data-live-action-status-payoff-bonus') || '',
      payoffSafeguard: payoffEl?.getAttribute('data-live-action-status-payoff-safeguard') || '',
      payload: snapshot?.actionReceiptReport || null,
      textPayload: textPayload?.actionReceiptReport || null,
      lastEvents: snapshot?.lastEvents || [],
      recentEvents: snapshot?.recentEvents || [],
    };
  });
}

async function refreshUntilLivePhase(page, phase, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastSnapshot = null;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      lastSnapshot = await getLiveSnapshot(page);
      if (lastSnapshot?.phase === phase) return lastSnapshot;
      await page.evaluate(async () => {
        if (window.PVPScene && typeof window.PVPScene.refreshLiveMatch === 'function') {
          await window.PVPScene.refreshLiveMatch();
        }
      });
      lastSnapshot = await getLiveSnapshot(page);
      if (lastSnapshot?.phase === phase) return lastSnapshot;
    } catch (error) {
      lastError = error;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`timed out waiting for live phase ${phase}; last=${JSON.stringify(lastSnapshot)}; error=${lastError?.message || ''}`);
}

async function refreshUntilLiveSnapshot(page, predicate, arg = null, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastSnapshot = null;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await page.evaluate(async () => {
        if (window.PVPScene && typeof window.PVPScene.refreshLiveMatch === 'function') {
          await window.PVPScene.refreshLiveMatch();
        }
      });
      await page.waitForFunction(predicate, arg, { timeout: 1000 });
      lastSnapshot = await getLiveSnapshot(page);
      return lastSnapshot;
    } catch (error) {
      lastError = error;
      lastSnapshot = await getLiveSnapshot(page).catch(() => lastSnapshot);
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`timed out refreshing live snapshot; last=${JSON.stringify(lastSnapshot)}; error=${lastError?.message || ''}`);
}

async function requestLivePvpReplay(page, matchId, options = {}) {
  return await page.evaluate(async ({ targetMatchId, replayOptions }) => {
    return await window.PVPService.live.getReplay(targetMatchId, replayOptions);
  }, { targetMatchId: matchId, replayOptions: options });
}

async function writeReport() {
  const report = {
    url: appUrl,
    apiUrl,
    viewportMode,
    generatedAt: new Date().toISOString(),
    summary: {
      total: findings.length,
      passed: findings.filter(item => item.pass).length,
      failed: findings.filter(item => item.pass === false).length,
      consoleErrors: consoleErrors.length,
    },
    findings,
    consoleErrors,
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

(async () => {
  port = await reserveAvailablePort(requestedPort);
  apiUrl = `http://127.0.0.1:${port}`;
  removeDbFiles();
  const backend = startBackend();
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });
  let seatA = null;
  let seatB = null;
  try {
    await waitForHealth(backend);
    seatA = await preparePage(browser, `live_real_a_${runId}`, '甲');
    seatB = await preparePage(browser, `live_real_b_${runId}`, '乙');
    await seedRankedHistory(seatA.username, 1000, 6);
    await seedRankedHistory(seatB.username, 1000, 6);
    const longWaitSeat = await preparePage(browser, `live_real_wait_${runId}`, '候');
    await longWaitSeat.page.evaluate(() => {
      window.game.player.name = '候';
      window.PVPScene.switchTab('live');
    });
    await longWaitSeat.page.waitForSelector('[data-live-action="join-queue"]', { timeout: 5000 });
    const longWaitJoinActionable = await clickLiveControl(longWaitSeat.page, '[data-live-action="join-queue"]', 'long-wait-join-queue');
    const longWaitJoin = await waitForLivePhase(longWaitSeat.page, 'waiting');
    await longWaitSeat.page.waitForTimeout(1250);
    await longWaitSeat.page.evaluate(async () => {
      await window.PVPScene.refreshLiveMatch();
    });
    const longWaitProbe = await longWaitSeat.page.evaluate(() => {
      const snapshot = window.PVPScene.getLiveSnapshot();
      const textPayload = JSON.parse(window.render_game_to_text()).pvp?.live || null;
      return {
        phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
        waitingText: document.querySelector('[data-live-waiting-report]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        hint: document.querySelector('[data-live-last-error]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        practiceDisabled: !!document.querySelector('[data-live-action="practice-live"]')?.disabled,
        cancelDisabled: !!document.querySelector('[data-live-action="cancel-queue"]')?.disabled,
        snapshot,
        textPayload,
      };
    });
    add(
      'real browser long-wait waiting report exposes no-ghost no-score practice options',
      longWaitJoin.phase === 'waiting'
        && longWaitProbe.phase === 'waiting'
        && longWaitProbe.snapshot?.waitingReport?.longWait === true
        && longWaitProbe.snapshot?.waitingReport?.longWaitThresholdMs === 1000
        && longWaitProbe.textPayload?.waitingReport?.longWait === true
        && /1 秒无真人/.test(longWaitProbe.waitingText)
        && /无真人|继续等待/.test(longWaitProbe.waitingText)
        && /不会自动切残影/.test(longWaitProbe.waitingText)
        && /问道练习|不写正式积分/.test(longWaitProbe.waitingText)
        && longWaitProbe.practiceDisabled === false
        && longWaitProbe.cancelDisabled === false
        && (!isMobileViewport || longWaitJoinActionable?.ok === true),
      JSON.stringify({ longWaitJoin, longWaitProbe, longWaitJoinActionable }),
    );
    const longWaitPracticeActionable = await clickLiveControl(longWaitSeat.page, '[data-live-action="practice-live"]', 'long-wait-practice-live');
    await longWaitSeat.page.waitForTimeout(650);
    const longWaitPracticeProbe = await longWaitSeat.page.evaluate(() => {
      const payload = JSON.parse(window.render_game_to_text());
      return {
        currentScreen: window.game?.currentScreen || '',
        pending: payload?.challenge?.pending || null,
        focus: payload?.challenge?.trainingFocus || null,
        drillScenario: payload?.pvp?.live?.drillScenario || window.PVPScene.getLiveSnapshot()?.drillScenario || null,
        livePhase: window.PVPScene.getLiveSnapshot()?.phase || '',
      };
    });
    add(
      'real browser long-wait practice opens no-score drill after cancelling queue',
      longWaitPracticeProbe.currentScreen === 'character-selection-screen'
        && longWaitPracticeProbe.pending?.replayOnly === true
        && longWaitPracticeProbe.pending?.practiceOnly === true
        && /^pvp_live_drill_/.test(longWaitPracticeProbe.pending?.ruleId || '')
        && longWaitPracticeProbe.focus?.sourceRunId === `pvp_live:waiting:${longWaitJoin.queueTicket}`
        && longWaitPracticeProbe.drillScenario?.reportVersion === 'pvp-live-drill-scenario-v1'
        && longWaitPracticeProbe.drillScenario?.sourceMatchId === `waiting:${longWaitJoin.queueTicket}`
        && longWaitPracticeProbe.drillScenario?.sourceVisibility === 'replay_self'
        && longWaitPracticeProbe.drillScenario?.usesHiddenInformation === false
        && longWaitPracticeProbe.drillScenario?.rankedImpact === 'none'
        && !Object.prototype.hasOwnProperty.call(longWaitPracticeProbe.drillScenario || {}, 'practicePlan')
        && longWaitPracticeProbe.drillScenario?.waitingReport?.longWait === true
        && (longWaitPracticeProbe.drillScenario?.trainingTags || []).includes('长等待练习')
        && !/reward|rating|elo/i.test(JSON.stringify(longWaitPracticeProbe.drillScenario || {}))
        && (!isMobileViewport || longWaitPracticeActionable?.ok === true),
      JSON.stringify({ longWaitPracticeProbe, longWaitPracticeActionable }),
    );

    const inviteCancelHost = await preparePage(browser, `live_real_invite_cancel_host_${runId}`, '消甲');
    const inviteCancelGuest = await preparePage(browser, `live_real_invite_cancel_guest_${runId}`, '消乙');
    await reloadAndOpenLivePanel(inviteCancelGuest.page);
    const realInviteCancelGuestIdleProbe = await inviteCancelGuest.page.evaluate(() => ({
      phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
      inboxText: document.querySelector('[data-live-invite-inbox]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      snapshot: window.PVPScene.getLiveSnapshot(),
    }));
    await inviteCancelHost.page.evaluate(({ targetUsername }) => {
      window.game.player.name = '消甲';
      window.PVPScene.switchTab('live');
      const targetInput = document.querySelector('[data-live-target-username]');
      if (targetInput) {
        targetInput.value = targetUsername;
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, { targetUsername: inviteCancelGuest.username });
    const realInviteCancelCreateActionable = await clickLiveControl(inviteCancelHost.page, '[data-live-action="create-invite"]', 'real-invite-cancel-create');
    const realInviteCancelCreated = await waitForLivePhase(inviteCancelHost.page, 'waiting_invite');
    const realInviteCancelCode = String(realInviteCancelCreated.inviteCode || '').trim();
    await inviteCancelGuest.page.waitForFunction(
      (expectedInviteCode) => {
        const snapshot = window.PVPScene?.getLiveSnapshot?.() || {};
        return snapshot.phase === 'idle'
          && (snapshot.inviteInbox || []).some(invite => invite && invite.inviteCode === expectedInviteCode);
      },
      realInviteCancelCode,
      { timeout: 8000 },
    );
    const realInviteCancelGuestBeforeProbe = await inviteCancelGuest.page.evaluate((beforeProbe) => ({
      phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
      inboxText: document.querySelector('[data-live-invite-inbox]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      inboxButtons: Array.from(document.querySelectorAll('[data-live-inbox-join]')).map(button => button.getAttribute('data-live-inbox-join')),
      openedBeforeInvite: beforeProbe?.phase === 'idle'
        && beforeProbe?.snapshot?.phase === 'idle'
        && beforeProbe?.snapshot?.queueTicket === ''
        && beforeProbe?.snapshot?.matchId === ''
        && (beforeProbe?.snapshot?.inviteInbox || []).length === 0,
      beforeProbe,
      snapshot: window.PVPScene.getLiveSnapshot(),
    }), realInviteCancelGuestIdleProbe);
    await reloadAndOpenLivePanel(inviteCancelHost.page);
    const realInviteCancelResume = await waitForLivePhase(inviteCancelHost.page, 'waiting_invite');
    const realInviteCancelActionable = await clickLiveControl(inviteCancelHost.page, '[data-live-action="cancel-invite"]', 'real-invite-cancel');
    const realInviteCancelledHost = await waitForLivePhase(inviteCancelHost.page, 'idle');
    const realInviteCancelProbe = await inviteCancelHost.page.evaluate(() => ({
      phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
      inviteCodeText: document.querySelector('[data-live-invite-code]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      inviteReportText: document.querySelector('[data-live-invite-report]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      lastErrorText: document.querySelector('[data-live-last-error]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      snapshot: window.PVPScene.getLiveSnapshot(),
    }));
    add(
      'real browser host cancels recovered targeted invite without entering public queue',
      !!realInviteCancelCode
        && realInviteCancelResume.phase === 'waiting_invite'
        && realInviteCancelResume.inviteCode === realInviteCancelCode
        && realInviteCancelledHost.phase === 'idle'
        && realInviteCancelProbe.phase === 'idle'
        && realInviteCancelProbe.snapshot?.phase === 'idle'
        && realInviteCancelProbe.snapshot?.inviteCode === ''
        && realInviteCancelProbe.snapshot?.queueTicket === ''
        && realInviteCancelProbe.snapshot?.matchId === ''
        && realInviteCancelProbe.snapshot?.inviteReport == null
        && realInviteCancelProbe.snapshot?.lastError?.reason === 'invite_cancelled'
        && /--/.test(realInviteCancelProbe.inviteCodeText)
        && /已取消|约战/.test(realInviteCancelProbe.lastErrorText)
        && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket|"rating":|"elo":|"score":/i.test(JSON.stringify(realInviteCancelProbe))
        && (!isMobileViewport || realInviteCancelCreateActionable?.ok === true)
        && (!isMobileViewport || realInviteCancelActionable?.ok === true),
      JSON.stringify({ realInviteCancelCode, realInviteCancelCreated, realInviteCancelGuestBeforeProbe, realInviteCancelResume, realInviteCancelledHost, realInviteCancelProbe, realInviteCancelCreateActionable, realInviteCancelActionable }),
    );
    await inviteCancelGuest.page.waitForFunction(
      (expectedInviteCode) => {
        const snapshot = window.PVPScene?.getLiveSnapshot?.() || {};
        const inbox = snapshot.inviteInbox || [];
        const inboxText = document.querySelector('[data-live-invite-inbox]')?.textContent || '';
        return snapshot.phase === 'idle'
          && !inbox.some(invite => invite && invite.inviteCode === expectedInviteCode)
          && /暂无/.test(inboxText);
      },
      realInviteCancelCode,
      { timeout: 8000 },
    );
    const realInviteCancelledInboxProbe = await inviteCancelGuest.page.evaluate(({ beforeProbe, expectedInviteCode }) => ({
      phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
      inboxText: document.querySelector('[data-live-invite-inbox]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      inboxButtons: Array.from(document.querySelectorAll('[data-live-inbox-join]')).map(button => button.getAttribute('data-live-inbox-join')),
      openedBeforeCancel: beforeProbe?.openedBeforeInvite === true
        && (beforeProbe?.snapshot?.inviteInbox || []).some(invite => invite && invite.inviteCode === expectedInviteCode),
      beforeProbe,
      snapshot: window.PVPScene.getLiveSnapshot(),
    }), { beforeProbe: realInviteCancelGuestBeforeProbe, expectedInviteCode: realInviteCancelCode });
    add(
      'real browser recipient clears cancelled backend invite through idle polling',
      realInviteCancelledInboxProbe.openedBeforeCancel === true
        && realInviteCancelledInboxProbe.phase === 'idle'
        && realInviteCancelledInboxProbe.snapshot?.phase === 'idle'
        && realInviteCancelledInboxProbe.snapshot?.queueTicket === ''
        && realInviteCancelledInboxProbe.snapshot?.matchId === ''
        && realInviteCancelledInboxProbe.snapshot?.inviteInbox?.length === 0
        && /暂无/.test(realInviteCancelledInboxProbe.inboxText)
        && !realInviteCancelledInboxProbe.inboxButtons.includes(realInviteCancelCode)
        && !new RegExp(realInviteCancelCode).test(realInviteCancelledInboxProbe.inboxText)
        && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket|"rating":|"elo":|"score":/i.test(JSON.stringify(realInviteCancelledInboxProbe)),
      JSON.stringify({ realInviteCancelCode, realInviteCancelledInboxProbe }),
    );
    await inviteCancelHost.context.close().catch(() => {});
    await inviteCancelGuest.context.close().catch(() => {});

    const inviteHost = await preparePage(browser, `live_real_invite_host_${runId}`, '邀甲');
    const inviteGuest = await preparePage(browser, `live_real_invite_guest_${runId}`, '邀乙');
    await reloadAndOpenLivePanel(inviteGuest.page);
    const realInviteIdleBeforeProbe = await inviteGuest.page.evaluate(() => ({
      phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
      inboxText: document.querySelector('[data-live-invite-inbox]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      snapshot: window.PVPScene.getLiveSnapshot(),
    }));
    await inviteHost.page.evaluate(({ targetUsername }) => {
      window.game.player.name = '邀甲';
      window.PVPScene.switchTab('live');
      const targetInput = document.querySelector('[data-live-target-username]');
      if (targetInput) {
        targetInput.value = targetUsername;
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, { targetUsername: inviteGuest.username });
    const realInviteCreateActionable = await clickLiveControl(inviteHost.page, '[data-live-action="create-invite"]', 'real-invite-create');
    const realInviteCreated = await waitForLivePhase(inviteHost.page, 'waiting_invite');
    const realInviteCreateProbe = await inviteHost.page.evaluate(() => ({
      phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
      inviteCodeText: document.querySelector('[data-live-invite-code]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      inviteReportText: document.querySelector('[data-live-invite-report]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      snapshot: window.PVPScene.getLiveSnapshot(),
    }));
    const realInviteCode = String(realInviteCreated.inviteCode || realInviteCreateProbe.snapshot?.inviteCode || '').trim();
    add(
      'real browser creates targeted live invite through backend without entering public queue',
      realInviteCreated.phase === 'waiting_invite'
        && realInviteCreateProbe.phase === 'waiting_invite'
        && !!realInviteCode
        && realInviteCreateProbe.inviteCodeText.includes(realInviteCode)
        && /好友约战|邀请|约战/.test(realInviteCreateProbe.inviteReportText)
        && /指定/.test(realInviteCreateProbe.inviteReportText)
        && /不写正式积分/.test(realInviteCreateProbe.inviteReportText)
        && realInviteCreateProbe.snapshot?.inviteReport?.reportVersion === 'pvp-live-invite-v1'
        && realInviteCreateProbe.snapshot?.inviteReport?.rankedImpact === 'none'
        && (realInviteCreateProbe.snapshot?.inviteReport?.safeguards || []).includes('targeted_invite_only')
        && realInviteCreateProbe.snapshot?.queueTicket === ''
        && realInviteCreateProbe.snapshot?.matchId === ''
        && (!isMobileViewport || realInviteCreateActionable?.ok === true),
      JSON.stringify({ realInviteCreated, realInviteCreateProbe, realInviteCreateActionable }),
    );

    await reloadAndOpenLivePanel(inviteHost.page);
    const realInviteResumeSnapshot = await waitForLivePhase(inviteHost.page, 'waiting_invite');
    const realInviteResumeProbe = await inviteHost.page.evaluate(() => {
      const cancelButton = document.querySelector('[data-live-action="cancel-invite"]');
      return {
        phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
        inviteCodeText: document.querySelector('[data-live-invite-code]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        inviteReportText: document.querySelector('[data-live-invite-report]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        cancelActionable: !!cancelButton && !cancelButton.disabled && cancelButton.offsetParent !== null,
        snapshot: window.PVPScene.getLiveSnapshot(),
      };
    });
    add(
      'real browser host recovers targeted invite after reopening live panel',
      realInviteResumeSnapshot.phase === 'waiting_invite'
        && realInviteResumeProbe.phase === 'waiting_invite'
        && realInviteResumeProbe.snapshot?.phase === 'waiting_invite'
        && realInviteResumeProbe.snapshot?.inviteCode === realInviteCode
        && realInviteResumeProbe.inviteCodeText.includes(realInviteCode)
        && /已恢复等待中的好友约战|等待好友加入|约战/.test(realInviteResumeProbe.inviteReportText)
        && /不写正式积分/.test(realInviteResumeProbe.inviteReportText)
        && realInviteResumeProbe.snapshot?.inviteReport?.reportVersion === 'pvp-live-invite-v1'
        && realInviteResumeProbe.snapshot?.inviteReport?.rankedImpact === 'none'
        && (realInviteResumeProbe.snapshot?.inviteReport?.safeguards || []).includes('targeted_invite_only')
        && realInviteResumeProbe.snapshot?.queueTicket === ''
        && realInviteResumeProbe.snapshot?.matchId === ''
        && realInviteResumeProbe.cancelActionable === true,
      JSON.stringify({ realInviteCode, realInviteResumeSnapshot, realInviteResumeProbe }),
    );

    await inviteGuest.page.waitForFunction(
      (expectedInviteCode) => {
        const snapshot = window.PVPScene?.getLiveSnapshot?.() || {};
        return snapshot.phase === 'idle'
          && (snapshot.inviteInbox || []).some(invite => invite && invite.inviteCode === expectedInviteCode);
      },
      realInviteCode,
      { timeout: 8000 },
    );
    const realInviteIdlePollProbe = await inviteGuest.page.evaluate((beforeProbe) => ({
      phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
      inboxText: document.querySelector('[data-live-invite-inbox]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      inboxButtons: Array.from(document.querySelectorAll('[data-live-inbox-join]')).map(button => button.getAttribute('data-live-inbox-join')),
      openedBeforeInvite: beforeProbe?.phase === 'idle'
        && beforeProbe?.snapshot?.phase === 'idle'
        && beforeProbe?.snapshot?.queueTicket === ''
        && beforeProbe?.snapshot?.matchId === ''
        && (beforeProbe?.snapshot?.inviteInbox || []).length === 0,
      beforeProbe,
      snapshot: window.PVPScene.getLiveSnapshot(),
    }), realInviteIdleBeforeProbe);
    const realInvitePassiveInboxProbe = realInviteIdlePollProbe;
    const realInviteInboxProbe = realInvitePassiveInboxProbe;
    add(
      'real browser targeted invite recipient sees backend inbox without manual code',
      realInviteInboxProbe.phase === 'idle'
        && realInviteInboxProbe.snapshot?.inviteInbox?.length === 1
        && realInviteInboxProbe.snapshot.inviteInbox[0]?.inviteCode === realInviteCode
        && realInviteInboxProbe.inboxText.includes(realInviteCode)
        && /邀甲/.test(realInviteInboxProbe.inboxText)
        && /不写正式积分/.test(realInviteInboxProbe.inboxText)
        && realInviteInboxProbe.inboxButtons.includes(realInviteCode)
        && (realInviteInboxProbe.snapshot.inviteInbox[0]?.inviteReport?.safeguards || []).includes('targeted_invite_only')
        && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket|rating|elo/i.test(JSON.stringify(realInviteInboxProbe)),
      JSON.stringify({ realInviteCode, realInviteInboxProbe }),
    );
    add(
      'real browser already-open invite recipient receives backend inbox through idle polling',
      realInviteIdlePollProbe.openedBeforeInvite === true
        && realInviteIdlePollProbe.phase === 'idle'
        && realInviteIdlePollProbe.snapshot?.phase === 'idle'
        && realInviteIdlePollProbe.snapshot?.queueTicket === ''
        && realInviteIdlePollProbe.snapshot?.matchId === ''
        && realInviteIdlePollProbe.snapshot?.inviteInbox?.length === 1
        && realInviteIdlePollProbe.snapshot.inviteInbox[0]?.inviteCode === realInviteCode
        && realInviteIdlePollProbe.inboxText.includes(realInviteCode)
        && /邀甲/.test(realInviteIdlePollProbe.inboxText)
        && /不写正式积分/.test(realInviteIdlePollProbe.inboxText)
        && realInviteIdlePollProbe.inboxButtons.includes(realInviteCode)
        && (realInviteIdlePollProbe.snapshot.inviteInbox[0]?.inviteReport?.safeguards || []).includes('targeted_invite_only')
        && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket|rating|elo/i.test(JSON.stringify(realInviteIdlePollProbe)),
      JSON.stringify({ realInviteCode, realInviteIdlePollProbe }),
    );
    add(
      'real browser invite recipient sees backend inbox through idle panel refresh',
      realInvitePassiveInboxProbe.phase === 'idle'
        && realInvitePassiveInboxProbe.snapshot?.phase === 'idle'
        && realInvitePassiveInboxProbe.snapshot?.queueTicket === ''
        && realInvitePassiveInboxProbe.snapshot?.matchId === ''
        && realInvitePassiveInboxProbe.snapshot?.inviteInbox?.length === 1
        && realInvitePassiveInboxProbe.snapshot.inviteInbox[0]?.inviteCode === realInviteCode
        && realInvitePassiveInboxProbe.inboxText.includes(realInviteCode)
        && /邀甲/.test(realInvitePassiveInboxProbe.inboxText)
        && /不写正式积分/.test(realInvitePassiveInboxProbe.inboxText)
        && realInvitePassiveInboxProbe.inboxButtons.includes(realInviteCode)
        && (realInvitePassiveInboxProbe.snapshot.inviteInbox[0]?.inviteReport?.safeguards || []).includes('targeted_invite_only')
        && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket|rating|elo/i.test(JSON.stringify(realInvitePassiveInboxProbe)),
      JSON.stringify({ realInviteCode, realInvitePassiveInboxProbe }),
    );

    const escapedInviteCode = cssAttributeValue(realInviteCode);
    await dismissBlockingModals(inviteGuest.page);
    const realInviteInboxJoinActionable = await clickLiveControl(inviteGuest.page, `[data-live-invite-inbox] [data-live-inbox-join="${escapedInviteCode}"]`, 'real-invite-inbox-join');
    const realInviteJoined = await waitForLivePhase(inviteGuest.page, 'setup');
    const realInviteHostSetup = await refreshUntilLivePhase(inviteHost.page, 'setup');
    const realInvitePassiveJoinProbe = await inviteGuest.page.evaluate(() => ({
      phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
      summary: document.querySelector('[data-live-summary]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      inviteCodeText: document.querySelector('[data-live-invite-code]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      inboxText: document.querySelector('[data-live-invite-inbox]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      snapshot: window.PVPScene.getLiveSnapshot(),
    }));
    const realInviteJoinProbe = realInvitePassiveJoinProbe;
    add(
      'real browser targeted invite recipient joins backend friendly setup from inbox',
      realInviteJoined.phase === 'setup'
        && realInviteHostSetup.phase === 'setup'
        && realInviteJoined.matchId === realInviteHostSetup.matchId
        && realInviteJoinProbe.phase === 'setup'
        && realInviteJoinProbe.snapshot?.mode === 'friendly'
        && realInviteJoinProbe.snapshot?.status === 'setup'
        && realInviteJoinProbe.snapshot?.matchQuality?.expansionStage === 'friend_invite'
        && (realInviteJoinProbe.snapshot?.matchQuality?.safeguards || []).includes('invite_only_match')
        && (realInviteJoinProbe.snapshot?.matchQuality?.safeguards || []).includes('friendly_no_ranked_impact')
        && realInviteJoinProbe.snapshot?.inviteInbox?.length === 0
        && realInviteJoinProbe.snapshot?.postMatchReview == null
        && /友谊再战|准备阶段/.test(realInviteJoinProbe.summary)
        && /--/.test(realInviteJoinProbe.inviteCodeText)
        && !/settlementReport|findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket|"rating":|"elo":|"score":/i.test(JSON.stringify(realInviteJoinProbe))
        && (!isMobileViewport || realInviteInboxJoinActionable?.ok === true),
      JSON.stringify({ realInviteCode, realInviteJoined, realInviteHostSetup, realInviteJoinProbe, realInviteInboxJoinActionable }),
    );
    add(
      'real browser recipient joins refreshed inbox invite into friendly setup',
      realInviteJoined.phase === 'setup'
        && realInviteHostSetup.phase === 'setup'
        && realInviteJoined.matchId === realInviteHostSetup.matchId
        && realInvitePassiveJoinProbe.phase === 'setup'
        && realInvitePassiveJoinProbe.snapshot?.mode === 'friendly'
        && realInvitePassiveJoinProbe.snapshot?.status === 'setup'
        && realInvitePassiveJoinProbe.snapshot?.matchQuality?.expansionStage === 'friend_invite'
        && (realInvitePassiveJoinProbe.snapshot?.matchQuality?.safeguards || []).includes('invite_only_match')
        && (realInvitePassiveJoinProbe.snapshot?.matchQuality?.safeguards || []).includes('friendly_no_ranked_impact')
        && realInvitePassiveJoinProbe.snapshot?.inviteInbox?.length === 0
        && realInvitePassiveJoinProbe.snapshot?.postMatchReview == null
        && /友谊再战|准备阶段/.test(realInvitePassiveJoinProbe.summary)
        && /--/.test(realInvitePassiveJoinProbe.inviteCodeText)
        && !/settlementReport|findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket|"rating":|"elo":|"score":/i.test(JSON.stringify(realInvitePassiveJoinProbe))
        && (!isMobileViewport || realInviteInboxJoinActionable?.ok === true),
      JSON.stringify({ realInviteCode, realInviteJoined, realInviteHostSetup, realInvitePassiveJoinProbe, realInviteInboxJoinActionable }),
    );
    await inviteHost.context.close().catch(() => {});
    await inviteGuest.context.close().catch(() => {});

    let statusPayoffHost = null;
    let statusPayoffGuest = null;
    try {
      const statusPayoffTestScope = `${TEST_MATCH_SCOPE}_status_payoff`;
      statusPayoffHost = await preparePage(browser, `live_real_status_payoff_host_${runId}`, '破甲');
      statusPayoffGuest = await preparePage(browser, `live_real_status_payoff_guest_${runId}`, '承伤');
      await seedRankedHistory(statusPayoffHost.username, 1000, 6);
      await seedRankedHistory(statusPayoffGuest.username, 1000, 6);
      const statusPayoffAttackerLoadout = makeLoadout('status_payoff_attacker', ['exposedCircuit', 'pvp_strike', 'pvp_guard', 'surgeStep', 'forkedNeedle']);
      const statusPayoffDefenderLoadout = makeLoadout('status_payoff_defender', ['exposedCircuit', 'pvp_guard', 'pvp_strike', 'surgeStep', 'stormWard', 'forkedNeedle']);
      const statusPayoffJoinHost = await joinLiveQueueWithLoadout(statusPayoffHost.page, '破甲', statusPayoffAttackerLoadout, statusPayoffTestScope);
      if (statusPayoffJoinHost.snapshot?.phase !== 'waiting') {
        throw new Error(`status payoff host did not enter waiting: ${JSON.stringify(statusPayoffJoinHost)}`);
      }
      const statusPayoffWaitingHost = statusPayoffJoinHost.snapshot;
      const statusPayoffJoinGuest = await joinLiveQueueWithLoadout(statusPayoffGuest.page, '承伤', statusPayoffDefenderLoadout, statusPayoffTestScope);
      const statusPayoffSetupGuest = await waitForLivePhase(statusPayoffGuest.page, 'setup');
      const statusPayoffSetupHost = await statusPayoffHost.page.evaluate(async () => {
        const session = window.PVPScene.getLiveSession();
        session.reset();
        await session.resumeCurrentMatch();
        window.PVPScene.renderLivePanel();
        return window.PVPScene.getLiveSnapshot();
      });
      if (statusPayoffSetupHost.phase !== 'setup') {
        throw new Error(`status payoff host did not resume setup after guest join: ${JSON.stringify({ statusPayoffJoinHost, statusPayoffJoinGuest, statusPayoffSetupGuest, statusPayoffSetupHost })}`);
      }
      await ensureLiveRealtime(statusPayoffHost.page);
      await ensureLiveRealtime(statusPayoffGuest.page);
      const statusPayoffReadyHost = await readyLiveSetupSeat(statusPayoffHost.page, 'status-payoff-host');
      const statusPayoffReadyGuest = await readyLiveSetupSeat(statusPayoffGuest.page, 'status-payoff-guest');
      const statusPayoffActiveHost = await waitForLivePhase(statusPayoffHost.page, 'active');
      const statusPayoffActiveGuest = await waitForLivePhase(statusPayoffGuest.page, 'active');
      const statusPayoffFirstSeat = statusPayoffActiveHost.openerAssignment?.firstSeat
        || statusPayoffActiveHost.setup?.firstSeat
        || statusPayoffActiveHost.currentSeat;
      const statusPayoffSecondSeat = otherSeatId(statusPayoffFirstSeat);
      const statusPayoffClientBySeat = {
        [statusPayoffActiveHost.seatId]: statusPayoffHost,
        [statusPayoffActiveGuest.seatId]: statusPayoffGuest,
      };
      const statusPayoffSnapshotBySeat = {
        [statusPayoffActiveHost.seatId]: statusPayoffActiveHost,
        [statusPayoffActiveGuest.seatId]: statusPayoffActiveGuest,
      };
      const statusPayoffAttackerClient = statusPayoffClientBySeat[statusPayoffFirstSeat];
      const statusPayoffDefenderClient = statusPayoffClientBySeat[statusPayoffSecondSeat];
      const statusPayoffAttackerStart = statusPayoffSnapshotBySeat[statusPayoffFirstSeat];
      if (!statusPayoffAttackerClient || !statusPayoffDefenderClient || !statusPayoffAttackerStart) {
        throw new Error(`invalid status payoff opener assignment: ${JSON.stringify({ statusPayoffFirstSeat, statusPayoffSecondSeat, statusPayoffActiveHost, statusPayoffActiveGuest })}`);
      }

      const statusPayoffInitialEndTurn = await clickLiveEndTurnUntilSeat(
        statusPayoffAttackerClient.page,
        statusPayoffSecondSeat,
        `${seatSlug(statusPayoffFirstSeat)}-status-payoff-initial-end-turn`,
      );
      const statusPayoffInitialEndTurnActionable = statusPayoffInitialEndTurn.touches[0] || null;
      const statusPayoffInitialEndTurnSubmitActionable = statusPayoffInitialEndTurn.touches[1] || null;
      const statusPayoffInitialEndTurnThirdTouchActionable = statusPayoffInitialEndTurn.touches[2] || null;
      const statusPayoffInitialEndTurnConfirmProbe = statusPayoffInitialEndTurn.probe || {};
      const statusPayoffDefenderTurn = await refreshUntilLiveSnapshot(
        statusPayoffDefenderClient.page,
        ({ expectedSeat, previousVersion }) => {
          const snapshot = window.PVPScene?.getLiveSnapshot?.();
          return snapshot?.currentSeat === expectedSeat && Number(snapshot?.stateVersion || 0) > Number(previousVersion || 0);
        },
        { expectedSeat: statusPayoffSecondSeat, previousVersion: statusPayoffAttackerStart.stateVersion },
        10000,
      );
      const statusPayoffSetupProbe = await statusPayoffDefenderClient.page.evaluate(async ({ markedSeat, sourceSeat, testMatchScope }) => {
        window.__DEFIER_PVP_REAL_TEST_SCOPE = testMatchScope;
        const BackendClient = window.__THE_DEFIER_SERVICES__?.BackendClient;
        const before = window.PVPScene.getLiveSnapshot();
        const response = await BackendClient.requestServer(`/api/pvp/live/test/matches/${before.matchId}/seats/${markedSeat}`, {
          method: 'POST',
          data: {
            publicStatus: {
              statusId: 'vulnerable_mark',
              label: '破绽',
              sourceSeat,
              responseWindow: 'defender_turn_before_payoff',
              payload: { hand: ['hidden-card'], deck: ['hidden-deck'] },
              cardInstanceId: 'hidden-card-instance',
              sourceCardId: 'hidden-source-card',
              token: 'hidden-token',
            },
            testMatchScope,
          },
        });
        await window.PVPScene.refreshLiveMatch();
        window.PVPScene.renderLivePanel();
        const after = window.PVPScene.getLiveSnapshot();
        const sameMatchMitigationCards = Array.isArray(after?.actionPreviewReport?.playableCards)
          ? after.actionPreviewReport.playableCards.filter(card => card?.publicStatusMitigation?.statusId === 'vulnerable_mark')
          : [];
        const mitigationPreview = document.querySelector('[data-live-card-status-mitigation="vulnerable_mark"]');
        const cardEl = mitigationPreview?.closest('[data-live-card]') || null;
        return {
          before,
          response,
          after,
          sameMatchMitigationCards,
          sameMatchMitigationAttr: mitigationPreview?.getAttribute('data-live-card-status-mitigation') || '',
          sameMatchMitigationResponseWindow: mitigationPreview?.getAttribute('data-live-card-status-response-window') || '',
          sameMatchMitigationPreviewSource: mitigationPreview?.getAttribute('data-live-card-preview-source') || '',
          sameMatchMitigationPreviewHidden: mitigationPreview?.getAttribute('data-live-card-preview-hidden') || '',
          sameMatchMitigationPreviewImpact: mitigationPreview?.getAttribute('data-live-card-preview-impact') || '',
          sameMatchMitigationCardInstanceId: cardEl?.getAttribute('data-live-card') || '',
          sameMatchMitigationPreviewText: mitigationPreview?.textContent?.replace(/\s+/g, ' ').trim() || '',
          sameMatchMitigationCardText: cardEl?.textContent?.replace(/\s+/g, ' ').trim() || '',
          statusText: document.querySelector('[data-live-self-statuses]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          momentumText: document.querySelector('[data-live-duel-momentum]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        };
      }, { markedSeat: statusPayoffSecondSeat, sourceSeat: statusPayoffFirstSeat, testMatchScope: statusPayoffTestScope });

      const statusPayoffHiddenLeakPattern = /payload|cardInstanceId|sourceCardId|cardId|instanceId|\bhand\b|hand":\[|deck|loadoutSnapshot|reward|rating|elo|token|opponentHand|opponentDeck/i;
      add(
        'real browser defender sees same-match response card before intentionally missing status window',
        statusPayoffSetupProbe.before?.currentSeat === statusPayoffSecondSeat
          && statusPayoffSetupProbe.response?.success === true
          && statusPayoffSetupProbe.response?.stateView?.self?.publicStatuses?.some(status => status.statusId === 'vulnerable_mark' && status.seatId === statusPayoffSecondSeat && status.sourceSeat === statusPayoffFirstSeat)
          && statusPayoffSetupProbe.after?.currentSeat === statusPayoffSecondSeat
          && statusPayoffSetupProbe.after?.self?.publicStatuses?.some(status => status.statusId === 'vulnerable_mark' && status.sourceSeat === statusPayoffFirstSeat)
          && statusPayoffSetupProbe.sameMatchMitigationCards?.some(card => card?.publicStatusMitigation?.statusId === 'vulnerable_mark' && card.publicStatusMitigation?.responseWindow === 'defender_turn_before_payoff')
          && statusPayoffSetupProbe.sameMatchMitigationAttr === 'vulnerable_mark'
          && statusPayoffSetupProbe.sameMatchMitigationResponseWindow === 'defender_turn_before_payoff'
          && statusPayoffSetupProbe.sameMatchMitigationPreviewSource === 'viewer_public_state'
          && statusPayoffSetupProbe.sameMatchMitigationPreviewHidden === 'false'
          && statusPayoffSetupProbe.sameMatchMitigationPreviewImpact === 'none'
          && statusPayoffSetupProbe.sameMatchMitigationCardInstanceId
          && /响应牌|清除破绽|处理破绽/.test(`${statusPayoffSetupProbe.sameMatchMitigationPreviewText} ${statusPayoffSetupProbe.sameMatchMitigationCardText}`)
          && !statusPayoffHiddenLeakPattern.test(`${statusPayoffSetupProbe.sameMatchMitigationPreviewText} ${statusPayoffSetupProbe.sameMatchMitigationCardText} ${JSON.stringify(statusPayoffSetupProbe.after?.self?.publicStatuses || [])}`),
        JSON.stringify({
          statusPayoffFirstSeat,
          statusPayoffSecondSeat,
          statusPayoffTestScope,
          statusPayoffSetupProbe,
        }),
      );

      const statusPayoffHandoffEndTurn = await clickLiveEndTurnUntilSeat(
        statusPayoffDefenderClient.page,
        statusPayoffFirstSeat,
        `${seatSlug(statusPayoffSecondSeat)}-status-payoff-handoff-end-turn`,
      );
      const statusPayoffHandoffFirstTouchActionable = statusPayoffHandoffEndTurn.touches[0] || null;
      const statusPayoffHandoffSecondTouchActionable = statusPayoffHandoffEndTurn.touches[1] || null;
      const statusPayoffHandoffThirdTouchActionable = statusPayoffHandoffEndTurn.touches[2] || null;
      const statusPayoffHandoffConfirmProbe = statusPayoffHandoffEndTurn.probe || {};
      const statusPayoffHandoffDefenderAfter = await refreshUntilLiveSnapshot(
        statusPayoffDefenderClient.page,
        ({ expectedSeat, previousVersion }) => {
          const snapshot = window.PVPScene?.getLiveSnapshot?.();
          return snapshot?.currentSeat === expectedSeat && Number(snapshot?.stateVersion || 0) > Number(previousVersion || 0);
        },
        { expectedSeat: statusPayoffFirstSeat, previousVersion: statusPayoffSetupProbe.after?.stateVersion || statusPayoffDefenderTurn.stateVersion },
        10000,
      );
      const statusPayoffHandoffAttackerAfter = await refreshUntilLiveSnapshot(
        statusPayoffAttackerClient.page,
        ({ expectedSeat, previousVersion }) => {
          const snapshot = window.PVPScene?.getLiveSnapshot?.();
          return snapshot?.currentSeat === expectedSeat && Number(snapshot?.stateVersion || 0) > Number(previousVersion || 0);
        },
        { expectedSeat: statusPayoffFirstSeat, previousVersion: statusPayoffDefenderTurn.stateVersion },
        10000,
      );
      const statusPayoffDefenderHandoffProbe = await getLiveHandoffRiskReceiptProbe(statusPayoffDefenderClient.page);
      add(
        'real browser defender end turn exposes authoritative handoff risk after leaving public status unresolved',
        statusPayoffJoinHost.snapshot?.phase === 'waiting'
          && statusPayoffJoinGuest.snapshot?.phase === 'setup'
          && statusPayoffWaitingHost.phase === 'waiting'
          && statusPayoffSetupHost.phase === 'setup'
          && statusPayoffSetupGuest.phase === 'setup'
          && statusPayoffReadyHost.done === true
          && statusPayoffReadyGuest.done === true
          && statusPayoffDefenderTurn.currentSeat === statusPayoffSecondSeat
          && statusPayoffSetupProbe.before?.currentSeat === statusPayoffSecondSeat
          && statusPayoffSetupProbe.response?.success === true
          && statusPayoffSetupProbe.response?.stateView?.self?.publicStatuses?.some(status => status.statusId === 'vulnerable_mark' && status.seatId === statusPayoffSecondSeat && status.sourceSeat === statusPayoffFirstSeat)
          && statusPayoffSetupProbe.response?.stateView?.recentEvents?.some(event => event.eventType === 'test_state_forced' && (event.publicData?.fields || []).includes('publicStatus') && event.publicData?.scope === statusPayoffTestScope)
          && statusPayoffSetupProbe.after?.self?.publicStatuses?.some(status => status.statusId === 'vulnerable_mark' && status.sourceSeat === statusPayoffFirstSeat)
          && statusPayoffHandoffDefenderAfter.currentSeat === statusPayoffFirstSeat
          && statusPayoffHandoffAttackerAfter.currentSeat === statusPayoffFirstSeat
          && statusPayoffDefenderHandoffProbe.typeAttr === 'end_turn'
          && statusPayoffDefenderHandoffProbe.actorAttr === statusPayoffSecondSeat
          && statusPayoffDefenderHandoffProbe.nextSeatAttr === statusPayoffFirstSeat
          && statusPayoffDefenderHandoffProbe.sourceAttr === 'authoritative_public_projection'
          && statusPayoffDefenderHandoffProbe.hiddenAttr === 'false'
          && statusPayoffDefenderHandoffProbe.payload?.viewerSeat === statusPayoffSecondSeat
          && statusPayoffDefenderHandoffProbe.payload?.actingSeat === statusPayoffSecondSeat
          && statusPayoffDefenderHandoffProbe.payload?.actionType === 'end_turn'
          && statusPayoffDefenderHandoffProbe.payload?.nextSeat === statusPayoffFirstSeat
          && statusPayoffDefenderHandoffProbe.payload?.handoffRisk?.active === true
          && statusPayoffDefenderHandoffProbe.payload?.handoffRisk?.riskState === 'status_response_handoff'
          && statusPayoffDefenderHandoffProbe.payload?.handoffRisk?.statusCount === 1
          && statusPayoffDefenderHandoffProbe.payload?.handoffRisk?.statuses?.some(status => status.statusId === 'vulnerable_mark' && status.label === '破绽' && status.seatId === statusPayoffSecondSeat && status.sourceSeat === statusPayoffFirstSeat && status.responseWindow === 'defender_turn_before_payoff')
          && (statusPayoffDefenderHandoffProbe.payload?.safeguards || []).includes('public_status_handoff_risk')
          && statusPayoffDefenderHandoffProbe.riskAttr === 'status_response_handoff'
          && statusPayoffDefenderHandoffProbe.riskState === 'status_response_handoff'
          && statusPayoffDefenderHandoffProbe.riskSource === 'authoritative_public_projection'
          && statusPayoffDefenderHandoffProbe.riskHidden === 'false'
          && statusPayoffDefenderHandoffProbe.riskImpact === 'none'
          && statusPayoffDefenderHandoffProbe.riskStatusCount === '1'
          && statusPayoffDefenderHandoffProbe.riskSafeguard === 'public_status_handoff_risk'
          && /交权风险/.test(statusPayoffDefenderHandoffProbe.text)
          && /破绽/.test(statusPayoffDefenderHandoffProbe.text)
          && /下一轮可能兑现|后续兑现/.test(statusPayoffDefenderHandoffProbe.text)
          && statusPayoffDefenderHandoffProbe.textPayload?.summaryLine === statusPayoffDefenderHandoffProbe.payload?.summaryLine
          && (!isMobileViewport || [
            statusPayoffInitialEndTurnActionable,
            statusPayoffInitialEndTurnSubmitActionable,
            statusPayoffInitialEndTurnThirdTouchActionable,
            statusPayoffHandoffFirstTouchActionable,
            statusPayoffHandoffSecondTouchActionable,
            statusPayoffHandoffThirdTouchActionable,
          ].filter(Boolean).every(item => item?.ok === true))
          && !statusPayoffHiddenLeakPattern.test(`${statusPayoffDefenderHandoffProbe.text} ${JSON.stringify(statusPayoffDefenderHandoffProbe.payload || {})} ${JSON.stringify(statusPayoffDefenderHandoffProbe.textPayload || {})} ${JSON.stringify(statusPayoffSetupProbe.after?.self?.publicStatuses || [])}`),
        JSON.stringify({
          statusPayoffFirstSeat,
          statusPayoffSecondSeat,
          statusPayoffTestScope,
          statusPayoffJoinHost,
          statusPayoffJoinGuest,
          statusPayoffWaitingHost,
          statusPayoffSetupHost,
          statusPayoffSetupGuest,
          statusPayoffReadyHost,
          statusPayoffReadyGuest,
          statusPayoffInitialEndTurnConfirmProbe,
          statusPayoffDefenderTurn,
          statusPayoffSetupProbe,
          statusPayoffHandoffConfirmProbe,
          statusPayoffHandoffDefenderAfter,
          statusPayoffHandoffAttackerAfter,
          statusPayoffDefenderHandoffProbe,
          statusPayoffInitialEndTurnActionable,
          statusPayoffInitialEndTurnSubmitActionable,
          statusPayoffInitialEndTurnThirdTouchActionable,
          statusPayoffHandoffFirstTouchActionable,
          statusPayoffHandoffSecondTouchActionable,
          statusPayoffHandoffThirdTouchActionable,
        }),
      );

      const statusPayoffCardBeforeProbe = await statusPayoffAttackerClient.page.evaluate(({ targetSeat }) => {
        const before = window.PVPScene.getLiveSnapshot();
        const sessionState = window.PVPScene.getLiveSession().getState();
        const hand = Array.isArray(sessionState.stateView?.self?.hand) ? sessionState.stateView.self.hand : [];
        const previews = Array.isArray(before?.actionPreviewReport?.playableCards) ? before.actionPreviewReport.playableCards : [];
        const card = hand.find(item => item?.cardId === 'exposedCircuit' && item?.instanceId) || null;
        const preview = previews.find(item => item?.cardInstanceId && item.cardInstanceId === card?.instanceId) || null;
        return {
          before,
          card,
          preview,
          handCount: hand.length,
          targetSeat,
        };
      }, { targetSeat: statusPayoffSecondSeat });
      if (!statusPayoffCardBeforeProbe.card?.instanceId) {
        throw new Error(`missing exposedCircuit in status payoff attacker hand: ${JSON.stringify({ statusPayoffFirstSeat, statusPayoffSecondSeat, statusPayoffCardBeforeProbe })}`);
      }
      const statusPayoffCardSelector = liveCardSelector(statusPayoffCardBeforeProbe.card.instanceId);
      const statusPayoffCardFirstTouchActionable = await clickLiveControl(statusPayoffAttackerClient.page, statusPayoffCardSelector, `${seatSlug(statusPayoffFirstSeat)}-status-payoff-card-confirm`);
      await statusPayoffAttackerClient.page.waitForTimeout(250);
      const statusPayoffCardConfirmProbe = await statusPayoffAttackerClient.page.evaluate(({ before, cardSelector }) => {
        const after = window.PVPScene.getLiveSnapshot();
        const selectedCard = document.querySelector(cardSelector);
        const confirmingCard = document.querySelector('.pvp-live-card.confirming');
        return {
          before,
          after,
          hint: document.querySelector('[data-live-last-error]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          selectedCardInstanceId: selectedCard?.getAttribute('data-live-card') || '',
          confirmingCardInstanceId: confirmingCard?.getAttribute('data-live-card') || '',
          cardText: selectedCard?.textContent?.replace(/\s+/g, ' ').trim() || '',
        };
      }, { before: statusPayoffCardBeforeProbe.before, cardSelector: statusPayoffCardSelector });
      let statusPayoffCardSecondTouchActionable = null;
      if (statusPayoffCardConfirmProbe.after?.stateVersion === statusPayoffCardBeforeProbe.before?.stateVersion) {
        statusPayoffCardSecondTouchActionable = await clickLiveControl(statusPayoffAttackerClient.page, statusPayoffCardSelector, `${seatSlug(statusPayoffFirstSeat)}-status-payoff-card-submit`);
      }
      const statusPayoffAttackerAfter = await waitForLiveSnapshot(
        statusPayoffAttackerClient.page,
        previousVersion => {
          const snapshot = window.PVPScene?.getLiveSnapshot?.();
          return Number(snapshot?.stateVersion || 0) > Number(previousVersion || 0)
            && snapshot?.actionReceiptReport?.statusEffects?.consumed?.some(status => status.statusId === 'vulnerable_mark');
        },
        statusPayoffCardBeforeProbe.before?.stateVersion,
        10000,
      );
      const statusPayoffAttackerProbe = await getLiveStatusPayoffReceiptProbe(statusPayoffAttackerClient.page);
      const statusPayoffConsumed = statusPayoffAttackerProbe.payload?.statusEffects?.consumed?.find(status => status.statusId === 'vulnerable_mark') || null;
      add(
        'real browser attacker sees authoritative public status payoff after defender passes response window',
        statusPayoffCardBeforeProbe.before?.currentSeat === statusPayoffFirstSeat
          && statusPayoffCardBeforeProbe.preview?.cardInstanceId === statusPayoffCardBeforeProbe.card?.instanceId
          && statusPayoffCardBeforeProbe.preview?.targetSeat === statusPayoffSecondSeat
          && (/再次点击确认出牌/.test(statusPayoffCardConfirmProbe.hint)
            || Number(statusPayoffCardConfirmProbe.after?.stateVersion || 0) > Number(statusPayoffCardBeforeProbe.before?.stateVersion || 0))
          && statusPayoffAttackerAfter.stateVersion > statusPayoffCardBeforeProbe.before?.stateVersion
          && statusPayoffAttackerProbe.typeAttr === 'play_card'
          && statusPayoffAttackerProbe.actorAttr === statusPayoffFirstSeat
          && statusPayoffAttackerProbe.sourceAttr === 'authoritative_public_projection'
          && statusPayoffAttackerProbe.hiddenAttr === 'false'
          && statusPayoffAttackerProbe.payload?.viewerSeat === statusPayoffFirstSeat
          && statusPayoffAttackerProbe.payload?.actingSeat === statusPayoffFirstSeat
          && statusPayoffAttackerProbe.payload?.actionType === 'play_card'
          && statusPayoffAttackerProbe.payload?.sourceVisibility === 'authoritative_public_projection'
          && statusPayoffAttackerProbe.payload?.usesHiddenInformation === false
          && statusPayoffAttackerProbe.payload?.rankedImpact === 'none'
          && statusPayoffConsumed?.seatId === statusPayoffSecondSeat
          && statusPayoffConsumed?.sourceSeat === statusPayoffFirstSeat
          && statusPayoffConsumed?.label === '破绽'
          && Number(statusPayoffConsumed?.damageBonus || 0) > 0
          && Number.isFinite(statusPayoffConsumed?.consumedTurnIndex)
          && statusPayoffAttackerProbe.payload?.damage?.targetSeat === statusPayoffSecondSeat
          && statusPayoffAttackerProbe.payload?.damage?.hpDamage > 0
          && (statusPayoffAttackerProbe.payload?.safeguards || []).includes('public_status_consumed')
          && [...(statusPayoffAttackerProbe.lastEvents || []), ...(statusPayoffAttackerProbe.recentEvents || [])].some(event => event.eventType === 'status_consumed' && Number.isFinite(Number(event.sequence)))
          && statusPayoffAttackerProbe.payoffAttr === 'vulnerable_mark'
          && statusPayoffAttackerProbe.payoffState === 'public_status_consumed'
          && statusPayoffAttackerProbe.payoffSource === 'authoritative_public_projection'
          && statusPayoffAttackerProbe.payoffHidden === 'false'
          && statusPayoffAttackerProbe.payoffImpact === 'none'
          && statusPayoffAttackerProbe.payoffBonus === String(statusPayoffConsumed?.damageBonus || '')
          && statusPayoffAttackerProbe.payoffSafeguard === 'public_status_consumed'
          && /公开兑现|破绽|额外/.test(statusPayoffAttackerProbe.text)
          && statusPayoffAttackerProbe.textPayload?.summaryLine === statusPayoffAttackerProbe.payload?.summaryLine
          && (!isMobileViewport || [
            statusPayoffCardFirstTouchActionable,
            statusPayoffCardSecondTouchActionable,
          ].filter(Boolean).every(item => item?.ok === true))
          && !statusPayoffHiddenLeakPattern.test(`${statusPayoffAttackerProbe.text} ${JSON.stringify(statusPayoffAttackerProbe.payload || {})} ${JSON.stringify(statusPayoffAttackerProbe.textPayload || {})}`),
        JSON.stringify({
          statusPayoffFirstSeat,
          statusPayoffSecondSeat,
          statusPayoffCardBeforeProbe,
          statusPayoffCardConfirmProbe,
          statusPayoffAttackerAfter,
          statusPayoffAttackerProbe,
          statusPayoffCardFirstTouchActionable,
          statusPayoffCardSecondTouchActionable,
        }),
      );

      await refreshUntilLiveSnapshot(
        statusPayoffDefenderClient.page,
        ({ expectedSequence, previousVersion }) => {
          const snapshot = window.PVPScene?.getLiveSnapshot?.();
          return Number(snapshot?.stateVersion || 0) > Number(previousVersion || 0)
            && snapshot?.actionReceiptReport?.latestSequence === expectedSequence
            && snapshot?.actionReceiptReport?.statusEffects?.consumed?.some(status => status.statusId === 'vulnerable_mark');
        },
        { expectedSequence: statusPayoffAttackerProbe.payload?.latestSequence, previousVersion: statusPayoffHandoffDefenderAfter.stateVersion },
        10000,
      );
      const statusPayoffDefenderProbe = await getLiveStatusPayoffReceiptProbe(statusPayoffDefenderClient.page);
      const statusPayoffDefenderConsumed = statusPayoffDefenderProbe.payload?.statusEffects?.consumed?.find(status => status.statusId === 'vulnerable_mark') || null;
      add(
        'real browser defender also sees the same public status payoff without hidden payloads',
        statusPayoffDefenderProbe.typeAttr === 'play_card'
          && statusPayoffDefenderProbe.actorAttr === statusPayoffFirstSeat
          && statusPayoffDefenderProbe.sourceAttr === 'authoritative_public_projection'
          && statusPayoffDefenderProbe.hiddenAttr === 'false'
          && statusPayoffDefenderProbe.payload?.viewerSeat === statusPayoffSecondSeat
          && statusPayoffDefenderProbe.payload?.actingSeat === statusPayoffFirstSeat
          && statusPayoffDefenderProbe.payload?.actionType === 'play_card'
          && statusPayoffDefenderProbe.payload?.latestSequence === statusPayoffAttackerProbe.payload?.latestSequence
          && statusPayoffDefenderProbe.payload?.sourceVisibility === 'authoritative_public_projection'
          && statusPayoffDefenderProbe.payload?.usesHiddenInformation === false
          && statusPayoffDefenderProbe.payload?.rankedImpact === 'none'
          && statusPayoffDefenderConsumed?.seatId === statusPayoffSecondSeat
          && statusPayoffDefenderConsumed?.sourceSeat === statusPayoffFirstSeat
          && statusPayoffDefenderConsumed?.label === '破绽'
          && statusPayoffDefenderConsumed?.damageBonus === statusPayoffConsumed?.damageBonus
          && (statusPayoffDefenderProbe.payload?.safeguards || []).includes('public_status_consumed')
          && statusPayoffDefenderProbe.payoffAttr === 'vulnerable_mark'
          && statusPayoffDefenderProbe.payoffState === 'public_status_consumed'
          && statusPayoffDefenderProbe.payoffSource === 'authoritative_public_projection'
          && statusPayoffDefenderProbe.payoffHidden === 'false'
          && statusPayoffDefenderProbe.payoffImpact === 'none'
          && statusPayoffDefenderProbe.payoffBonus === String(statusPayoffConsumed?.damageBonus || '')
          && statusPayoffDefenderProbe.payoffSafeguard === 'public_status_consumed'
          && /公开兑现|破绽|额外/.test(statusPayoffDefenderProbe.text)
          && statusPayoffDefenderProbe.textPayload?.summaryLine === statusPayoffDefenderProbe.payload?.summaryLine
          && statusPayoffDefenderProbe.textPayload?.summaryLine === statusPayoffAttackerProbe.textPayload?.summaryLine
          && !statusPayoffHiddenLeakPattern.test(`${statusPayoffDefenderProbe.text} ${JSON.stringify(statusPayoffDefenderProbe.payload || {})} ${JSON.stringify(statusPayoffDefenderProbe.textPayload || {})}`),
        JSON.stringify({
          statusPayoffFirstSeat,
          statusPayoffSecondSeat,
          statusPayoffAttackerProbe,
          statusPayoffDefenderProbe,
        }),
      );
    } finally {
      await statusPayoffHost?.context?.close?.().catch(() => {});
      await statusPayoffGuest?.context?.close?.().catch(() => {});
    }

    const changedLoadoutA = makeLoadout('curse', ['pvp_guard', 'pvp_guard', 'pvp_strike', 'pvp_burst']);

    await seatA.page.evaluate(() => {
      window.game.player.name = '甲';
      window.PVPScene.switchTab('live');
    });
    await seatA.page.waitForSelector('[data-live-loadout-preset="sword"]', { timeout: 5000 });
    const seatALoadoutActionable = await clickLiveControl(seatA.page, '[data-live-loadout-preset="sword"]', 'seat-a-sword-loadout');
    const selectedA = await seatA.page.evaluate(() => ({
      preset: document.querySelector('[data-live-loadout-preset].selected')?.getAttribute('data-live-loadout-preset') || '',
      label: document.querySelector('[data-live-selected-loadout]')?.textContent || '',
      candidate: window.PVPScene.getLiveQueueLoadoutCandidate(window.PVPScene.getLiveSelectedLoadoutPreset().id),
    }));
    const seatAJoinActionable = await clickLiveControl(seatA.page, '[data-live-action="join-queue"]', 'seat-a-join-queue');
    const joinA = await waitForLivePhase(seatA.page, 'waiting');
    add(
      'real browser user A joins live queue with locked loadout',
      joinA.phase === 'waiting' && !!joinA.queueTicket,
      JSON.stringify(joinA),
    );
    add(
      'real browser user A selects live loadout preset through UI',
      selectedA.preset === 'sword'
        && /破阵斗法谱/.test(selectedA.label)
        && selectedA.candidate?.identitySlot === 'sword'
        && selectedA.candidate?.deck?.length === 20
        && (!isMobileViewport || (seatALoadoutActionable?.ok === true && seatAJoinActionable?.ok === true)),
      JSON.stringify({ selectedA, seatALoadoutActionable, seatAJoinActionable }),
    );

    const rejoinAChanged = await seatA.page.evaluate(async ({ displayName, loadout }) => {
      return await window.PVPService.live.joinQueue({
        displayName,
        loadout,
        testMatchScope: window.__DEFIER_PVP_REAL_TEST_SCOPE
      });
    }, { displayName: '甲', loadout: changedLoadoutA });
    add(
      'real browser repeated join cannot overwrite locked loadout hash',
      rejoinAChanged.success === true
        && rejoinAChanged.status === 'waiting'
        && rejoinAChanged.queueTicket === joinA.queueTicket
        && !!rejoinAChanged.loadoutHash
        && rejoinAChanged.loadoutSummary?.identitySlot === 'sword',
      JSON.stringify({ joinA, rejoinAChanged }),
    );

    await seatB.page.evaluate(() => {
      window.game.player.name = '乙';
      window.PVPScene.switchTab('live');
    });
    await seatB.page.waitForSelector('[data-live-loadout-preset="shield"]', { timeout: 5000 });
    const seatBLoadoutActionable = await clickLiveControl(seatB.page, '[data-live-loadout-preset="shield"]', 'seat-b-shield-loadout');
    const selectedB = await seatB.page.evaluate(() => ({
      preset: document.querySelector('[data-live-loadout-preset].selected')?.getAttribute('data-live-loadout-preset') || '',
      label: document.querySelector('[data-live-selected-loadout]')?.textContent || '',
      candidate: window.PVPScene.getLiveQueueLoadoutCandidate(window.PVPScene.getLiveSelectedLoadoutPreset().id),
    }));
    const seatBJoinActionable = await clickLiveControl(seatB.page, '[data-live-action="join-queue"]', 'seat-b-join-queue');
    const joinB = await waitForLivePhase(seatB.page, 'setup');
    add(
      'real browser user B selects live loadout preset through UI',
      selectedB.preset === 'shield'
        && /守势斗法谱/.test(selectedB.label)
        && selectedB.candidate?.identitySlot === 'shield'
        && selectedB.candidate?.deck?.length === 20
        && (!isMobileViewport || (seatBLoadoutActionable?.ok === true && seatBJoinActionable?.ok === true)),
      JSON.stringify({ selectedB, seatBLoadoutActionable, seatBJoinActionable }),
    );
    add(
      'real browser user B joins and receives matched setup state',
      joinB.phase === 'setup'
        && !!joinB.matchId
        && joinB.seatId === 'B'
        && joinB.self?.loadout?.identitySlot === 'shield'
        && joinB.opponent?.publicProfile?.reportVersion === 'pvp-live-ranked-opponent-profile-v1'
        && !Object.prototype.hasOwnProperty.call(joinB.opponent || {}, 'loadout')
        && joinB.matchQuality?.reportVersion === 'pvp-live-match-quality-v1'
        && joinB.matchQuality?.tag === 'good'
        && !joinB.opponent?.loadoutSnapshot,
      JSON.stringify(joinB),
    );

    const matchedA = await refreshUntilLivePhase(seatA.page, 'setup');
    const matchedB = await getLiveSnapshot(seatB.page);
    add(
      'real browser both seats agree on match id while ranked opponent build stays hidden',
      matchedA.matchId === matchedB.matchId
        && matchedA.self?.loadout?.identitySlot === 'sword'
        && matchedB.self?.loadout?.identitySlot === 'shield'
        && matchedA.opponent?.publicProfile?.reportVersion === 'pvp-live-ranked-opponent-profile-v1'
        && matchedB.opponent?.publicProfile?.reportVersion === 'pvp-live-ranked-opponent-profile-v1'
        && !Object.prototype.hasOwnProperty.call(matchedA.opponent || {}, 'loadout')
        && !Object.prototype.hasOwnProperty.call(matchedB.opponent || {}, 'loadout')
        && matchedA.matchQuality?.tag === matchedB.matchQuality?.tag
        && matchedA.matchQuality?.ratingDeltaBucket === 'near_0_99',
      JSON.stringify({ matchedA, matchedB }),
    );

    add(
      'real browser live match exposes public match quality report',
      matchedA.matchQuality?.reportVersion === 'pvp-live-match-quality-v1'
        && matchedA.matchQuality?.tag === 'good'
        && matchedA.matchQuality?.expansionStage === 'strict_rating'
        && matchedA.matchQuality?.ratingDeltaBucket === 'near_0_99'
        && matchedA.matchQuality?.connectionHealth === 'pass'
        && matchedA.matchQuality?.connectionHealthSummary?.sampleTag === 'client_preflight'
        && (matchedA.matchQuality?.safeguards || []).includes('connection_health_gate')
        && !/rating":|score":|elo/i.test(JSON.stringify(matchedA.matchQuality || {})),
      JSON.stringify(matchedA.matchQuality),
    );

    const setupTimerProbe = await seatA.page.evaluate(() => ({
      text: document.querySelector('[data-live-turn-timer]')?.textContent || '',
      payload: window.PVPScene.getLiveSnapshot()?.turnTimer || null,
      textPayload: JSON.parse(window.render_game_to_text()).pvp?.live?.turnTimer || null,
    }));
    add(
      'real browser live match renders authoritative setup countdown',
      /准备倒计时/.test(setupTimerProbe.text)
        && setupTimerProbe.payload?.reportVersion === 'pvp-live-turn-timer-v1'
        && setupTimerProbe.payload?.phase === 'setup'
        && setupTimerProbe.payload?.remainingMs >= 0
        && setupTimerProbe.textPayload?.reportVersion === 'pvp-live-turn-timer-v1',
      JSON.stringify(setupTimerProbe),
    );

    const setupConnectionProbe = await seatA.page.evaluate(() => ({
      text: document.querySelector('[data-live-connection-status]')?.textContent || '',
      payload: window.PVPScene.getLiveSnapshot()?.connectionReport || null,
      textPayload: JSON.parse(window.render_game_to_text()).pvp?.live?.connectionReport || null,
    }));
    add(
      'real browser live match exposes authoritative connection report',
      /连接：/.test(setupConnectionProbe.text)
        && setupConnectionProbe.payload?.reportVersion === 'pvp-live-connection-v1'
        && ['online', 'grace', 'disconnected'].includes(setupConnectionProbe.payload?.opponent?.status)
        && setupConnectionProbe.textPayload?.reportVersion === 'pvp-live-connection-v1',
      JSON.stringify(setupConnectionProbe),
    );

    await seatB.page.evaluate(async () => {
      await window.PVPScene.sendLiveHeartbeat();
      window.PVPScene.stopLiveHeartbeat();
    });
    await seatA.page.waitForTimeout(1250);
    await seatA.page.evaluate(async () => {
      await window.PVPScene.sendLiveHeartbeat();
    });
    await waitForLiveSnapshot(seatA.page, () => {
      const report = window.PVPScene?.getLiveSnapshot?.()?.connectionReport || null;
      return report?.opponent?.status === 'grace' || report?.opponent?.status === 'online';
    });
    const graceProbe = await seatA.page.evaluate(() => ({
      text: document.querySelector('[data-live-connection-status]')?.textContent || '',
      timer: document.querySelector('[data-live-turn-timer]')?.textContent || '',
      payload: window.PVPScene.getLiveSnapshot()?.connectionReport || null,
    }));
    add(
      'real browser opponent connection report stays readable without ending setup',
      /对方(在线|重连宽限)/.test(graceProbe.text)
        && /准备倒计时/.test(graceProbe.timer)
        && ['online', 'grace'].includes(graceProbe.payload?.opponent?.status),
      JSON.stringify(graceProbe),
    );
    await seatB.page.evaluate(async () => {
      await window.PVPScene.sendLiveHeartbeat();
    });
    await waitForLiveSnapshot(seatA.page, () => {
      const report = window.PVPScene?.getLiveSnapshot?.()?.connectionReport || null;
      return report?.opponent?.status === 'online';
    });
    const recoveredConnectionProbe = await seatA.page.evaluate(() => ({
      text: document.querySelector('[data-live-connection-status]')?.textContent || '',
      payload: window.PVPScene.getLiveSnapshot()?.connectionReport || null,
    }));
    add(
      'real browser opponent heartbeat recovers reconnect grace to online',
      /对方在线/.test(recoveredConnectionProbe.text)
        && recoveredConnectionProbe.payload?.opponent?.status === 'online',
      JSON.stringify(recoveredConnectionProbe),
    );

    await seatA.page.evaluate(() => {
      window.PVPScene.stopLiveHeartbeat();
      window.PVPScene.__realSmokeStartLiveHeartbeat = window.PVPScene.startLiveHeartbeat;
      window.PVPScene.startLiveHeartbeat = () => {};
    });
    let localGraceProbe = null;
    try {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await seatA.page.waitForTimeout(attempt === 0 ? 1100 : 250);
        await seatA.page.evaluate(async () => {
          await window.PVPScene.getLiveSession().refreshMatch();
          window.PVPScene.renderLivePanel();
        });
        localGraceProbe = await seatA.page.evaluate(() => ({
          text: document.querySelector('[data-live-connection-status]')?.textContent || '',
          timer: document.querySelector('[data-live-turn-timer]')?.textContent || '',
          payload: window.PVPScene.getLiveSnapshot()?.connectionReport || null,
        }));
        if (localGraceProbe.payload?.viewer?.status === 'grace') break;
      }
      add(
        'real browser local reconnect grace shows resume guidance before timeout',
        /我方重连宽限/.test(localGraceProbe?.text || '')
          && /恢复|切回页面/.test(localGraceProbe?.text || '')
          && /准备倒计时/.test(localGraceProbe?.timer || '')
          && localGraceProbe?.payload?.viewer?.status === 'grace'
          && localGraceProbe?.payload?.viewer?.remainingGraceMs > 0,
        JSON.stringify(localGraceProbe),
      );
    } finally {
      await seatA.page.evaluate(() => {
        if (window.PVPScene.__realSmokeStartLiveHeartbeat) {
          window.PVPScene.startLiveHeartbeat = window.PVPScene.__realSmokeStartLiveHeartbeat;
          delete window.PVPScene.__realSmokeStartLiveHeartbeat;
        }
      });
    }
    await seatA.page.evaluate(async () => {
      window.PVPScene.activeTab = 'live';
      await window.PVPScene.handleLiveForegroundResume();
    });
    await waitForLiveSnapshot(seatA.page, () => {
      const report = window.PVPScene?.getLiveSnapshot?.()?.connectionReport || null;
      return report?.viewer?.status === 'online';
    });
    const localRecoveredProbe = await seatA.page.evaluate(() => ({
      text: document.querySelector('[data-live-connection-status]')?.textContent || '',
      payload: window.PVPScene.getLiveSnapshot()?.connectionReport || null,
    }));
    add(
      'real browser foreground resume recovers local reconnect grace to online',
      /我方在线/.test(localRecoveredProbe.text)
        && localRecoveredProbe.payload?.viewer?.status === 'online',
      JSON.stringify(localRecoveredProbe),
    );

    const matchedGuideProbe = await seatA.page.evaluate(() => ({
      text: document.querySelector('[data-live-first-guide]')?.textContent || '',
      payload: window.PVPScene.getLiveSnapshot()?.firstMatchGuide || null,
      textPayload: JSON.parse(window.render_game_to_text()).pvp?.live?.firstMatchGuide || null,
    }));
    add(
      'real browser live match exposes and renders first-match guide report',
      /首战简报/.test(matchedGuideProbe.text)
        && /调息/.test(matchedGuideProbe.text)
        && /护体/.test(matchedGuideProbe.text)
        && /默认斗法谱/.test(matchedGuideProbe.text)
        && /弱点/.test(matchedGuideProbe.text)
        && matchedGuideProbe.payload?.reportVersion === 'pvp-live-first-match-guide-v1'
        && matchedGuideProbe.payload?.safeguards?.includes('opening_protection')
        && matchedGuideProbe.payload?.recommendedLoadouts?.length === 3
        && matchedGuideProbe.payload?.exceptionBranches?.some(item => item.id === 'ready_timeout')
        && matchedGuideProbe.payload?.reviewActions?.length >= 3
        && matchedGuideProbe.textPayload?.reportVersion === 'pvp-live-first-match-guide-v1'
        && !/reward|rating|elo/i.test(`${matchedGuideProbe.text} ${JSON.stringify(matchedGuideProbe.payload || {})}`),
      JSON.stringify(matchedGuideProbe),
    );
    add(
      'real browser render_game_to_text exposes first-match guide report',
      matchedGuideProbe.textPayload?.reportVersion === 'pvp-live-first-match-guide-v1'
        && matchedGuideProbe.textPayload?.nextAction === matchedGuideProbe.payload?.nextAction
        && matchedGuideProbe.textPayload?.recommendedLoadouts?.length === 3
        && matchedGuideProbe.textPayload?.exceptionBranches?.some(item => item.id === 'ready_timeout')
        && matchedGuideProbe.textPayload?.reviewActions?.length >= 3
        && !/reward|rating|elo/i.test(JSON.stringify(matchedGuideProbe.textPayload || {})),
      JSON.stringify(matchedGuideProbe.textPayload),
    );

    const visibilityProbe = await seatA.page.evaluate(() => {
      const state = window.PVPScene.getLiveSession().getState();
      const view = state.stateView || {};
      return {
        hasSnapshotLocked: Array.isArray(view.recentEvents) && view.recentEvents.some(event => event.eventType === 'snapshot_locked'),
        opponentHasSnapshot: !!(view.opponent && view.opponent.loadoutSnapshot),
        opponentHandArray: Array.isArray(view.opponent && view.opponent.hand),
        renderedOpponentLoadout: document.querySelector('[data-live-opponent-loadout]')?.textContent || '',
      };
    });
    add(
      'real browser state exposes snapshot_locked without leaking opponent hidden data',
      visibilityProbe.hasSnapshotLocked
        && !visibilityProbe.opponentHasSnapshot
        && !visibilityProbe.opponentHandArray
        && /公开画像/.test(visibilityProbe.renderedOpponentLoadout)
        && /构筑隐藏/.test(visibilityProbe.renderedOpponentLoadout)
        && !/shield|hash|斗法谱/.test(visibilityProbe.renderedOpponentLoadout),
      JSON.stringify(visibilityProbe),
    );

    await ensureLiveRealtime(seatA.page);
    await ensureLiveRealtime(seatB.page);
    const readyRealtimeBefore = {
      A: await getLiveSessionProbe(seatA.page),
      B: await getLiveSessionProbe(seatB.page),
    };
    const seatAReadyTouchActionable = await clickLiveControl(seatA.page, '[data-live-action="ready"]', 'seat-a-ready-live');
    try {
      await waitForLiveSnapshot(seatB.page, () => {
        const snapshot = window.PVPScene?.getLiveSnapshot?.();
        return snapshot?.phase === 'setup' && snapshot?.opponent?.ready === true;
      });
    } catch (error) {
      add(
        'real browser realtime ready diagnostic captures failed auto-push state',
        false,
        JSON.stringify({
          before: readyRealtimeBefore,
          after: {
            A: await getLiveSessionProbe(seatA.page),
            B: await getLiveSessionProbe(seatB.page),
          },
          error: error && error.message || String(error),
        }),
      );
      throw error;
    }
    const setupReloadBefore = await seatB.page.evaluate(() => {
      const payload = window.PVPScene.getLiveSnapshot() || null;
      const textPayload = JSON.parse(window.render_game_to_text()).pvp?.live || null;
      return {
        phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
        timerText: document.querySelector('[data-live-turn-timer]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        readyButtonDisabled: document.querySelector('[data-live-action="ready"]')?.disabled === true,
        mulliganButtonDisabled: document.querySelector('[data-live-action="confirm-mulligan"]')?.disabled === true,
        matchId: payload?.matchId || '',
        seatId: payload?.seatId || '',
        currentSeat: payload?.currentSeat || '',
        stateVersion: payload?.stateVersion || 0,
        turnTimer: payload?.turnTimer || null,
        setup: payload?.stateView?.setup || null,
        selfReady: payload?.self?.ready === true,
        opponentReady: payload?.opponent?.ready === true,
        payload,
        textPayload,
      };
    });
    const setupReloadPage = await seatB.context.newPage();
    setupReloadPage.on('console', msg => {
      if (msg.type() === 'error') recordConsoleError(msg.text());
    });
    setupReloadPage.on('pageerror', error => recordConsoleError(error.message || String(error)));
    await setupReloadPage.goto(appUrl, { waitUntil: 'domcontentloaded' });
    await reloadAndOpenLivePanel(setupReloadPage);
    const setupReloadRestored = await waitForLivePhase(setupReloadPage, 'setup', 15000);
    const setupReloadProbe = await setupReloadPage.evaluate(() => {
      const payload = window.PVPScene.getLiveSnapshot() || null;
      const textPayload = JSON.parse(window.render_game_to_text()).pvp?.live || null;
      return {
        phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
        summaryText: document.querySelector('[data-live-summary]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        timerText: document.querySelector('[data-live-turn-timer]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        connectionText: document.querySelector('[data-live-connection-status]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        selfStatsText: document.querySelector('[data-live-self-stats]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        opponentStatsText: document.querySelector('[data-live-opponent-stats]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        lastErrorText: document.querySelector('[data-live-last-error]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        readyButtonDisabled: document.querySelector('[data-live-action="ready"]')?.disabled === true,
        mulliganButtonDisabled: document.querySelector('[data-live-action="confirm-mulligan"]')?.disabled === true,
        liveTabActive: document.getElementById('tab-live')?.classList.contains('active') === true,
        opponentHandArray: Array.isArray(payload?.opponent?.hand),
        payload,
        textPayload,
      };
    });
    const setupReloadVisibleText = [
      setupReloadProbe.summaryText,
      setupReloadProbe.timerText,
      setupReloadProbe.connectionText,
      setupReloadProbe.selfStatsText,
      setupReloadProbe.opponentStatsText,
      setupReloadProbe.lastErrorText,
    ].join(' ');
    await setupReloadPage.close();
    add(
      'real browser setup match survives full page refresh before both seats ready',
      setupReloadRestored.phase === 'setup'
        && setupReloadBefore.phase === 'setup'
        && setupReloadBefore.opponentReady === true
        && setupReloadBefore.selfReady === false
        && setupReloadProbe.phase === 'setup'
        && setupReloadProbe.liveTabActive === true
        && setupReloadProbe.payload?.phase === 'setup'
        && setupReloadProbe.payload?.matchId === setupReloadBefore.matchId
        && setupReloadProbe.payload?.seatId === setupReloadBefore.seatId
        && setupReloadProbe.payload?.currentSeat === setupReloadBefore.currentSeat
        && setupReloadProbe.payload?.turnTimer?.deadlineAt === setupReloadBefore.turnTimer?.deadlineAt
        && setupReloadProbe.payload?.stateView?.setup?.readyDeadlineAt === setupReloadBefore.setup?.readyDeadlineAt
        && setupReloadProbe.textPayload?.matchId === setupReloadBefore.matchId
        && setupReloadProbe.textPayload?.turnTimer?.deadlineAt === setupReloadBefore.turnTimer?.deadlineAt
        && setupReloadProbe.payload?.opponent?.ready === true
        && setupReloadProbe.payload?.self?.ready === false
        && setupReloadProbe.readyButtonDisabled === false
        && setupReloadProbe.mulliganButtonDisabled === false
        && /准备倒计时/.test(setupReloadProbe.timerText)
        && /准备阶段/.test(setupReloadProbe.summaryText)
        && /已准备/.test(setupReloadProbe.opponentStatsText)
        && /未准备/.test(setupReloadProbe.selfStatsText)
        && /准备阶段/.test(setupReloadProbe.lastErrorText)
        && /连接：/.test(setupReloadProbe.connectionText)
        && setupReloadProbe.payload?.postMatchReview == null
        && setupReloadProbe.textPayload?.postMatchReview == null
        && setupReloadProbe.opponentHandArray === false
        && !/didWin|matchTicket|GhostEnemy|reportMatchResult|rating|elo|settlementReport/i.test(setupReloadVisibleText),
      JSON.stringify({ setupReloadBefore, setupReloadRestored, setupReloadProbe }),
    );
    const seatBReadyTouchActionable = await clickLiveControl(seatB.page, '[data-live-action="ready"]', 'seat-b-ready-live');
    const activeA = await waitForLivePhase(seatA.page, 'active');
    const activeB = await waitForLivePhase(seatB.page, 'active');
    const activeFirstSeat = activeA.openerAssignment?.firstSeat || activeA.setup?.firstSeat || activeA.currentSeat;
    const activeSecondSeat = activeA.openerAssignment?.secondSeat || otherSeatId(activeFirstSeat);
    const seatById = { A: seatA, B: seatB };
    const activeById = { A: activeA, B: activeB };
    const firstSeatClient = seatById[activeFirstSeat];
    const secondSeatClient = seatById[activeSecondSeat];
    const activeFirstSnapshot = activeById[activeFirstSeat];
    const activeSecondSnapshot = activeById[activeSecondSeat];
    if (!firstSeatClient || !secondSeatClient || !['A', 'B'].includes(activeFirstSeat) || !['A', 'B'].includes(activeSecondSeat)) {
      throw new Error(`invalid authoritative opener assignment: ${JSON.stringify({ activeFirstSeat, activeSecondSeat, activeA, activeB })}`);
    }
    add(
      'real browser setup ready flow reaches active on both seats',
      activeA.phase === 'active'
        && activeB.phase === 'active'
        && activeA.currentSeat === activeFirstSeat
        && activeB.currentSeat === activeFirstSeat
        && activeA.openerAssignment?.reportVersion === 'pvp-live-opener-assignment-v1'
        && activeA.openerAssignment?.firstSeat === activeFirstSeat
        && activeA.openerAssignment?.secondSeat === activeSecondSeat
        && activeA.openerAssignment?.queueOrderBinding === false
        && activeA.openerAssignment?.hostBinding === false
        && activeB.openerAssignment?.firstSeat === activeFirstSeat
        && activeB.openerAssignment?.secondSeat === activeSecondSeat,
      JSON.stringify({ activeFirstSeat, activeSecondSeat, activeA, activeB, seatAReadyTouchActionable, seatBReadyTouchActionable }),
    );
    const activeReloadBefore = {
      matchId: activeFirstSnapshot.matchId,
      seatId: activeFirstSnapshot.seatId,
      currentSeat: activeFirstSnapshot.currentSeat,
      turnTimer: activeFirstSnapshot.turnTimer || null,
    };
    const activeReloadPage = await firstSeatClient.context.newPage();
    activeReloadPage.on('console', msg => {
      if (msg.type() === 'error') recordConsoleError(msg.text());
    });
    activeReloadPage.on('pageerror', error => recordConsoleError(error.message || String(error)));
    await activeReloadPage.goto(appUrl, { waitUntil: 'domcontentloaded' });
    await reloadAndOpenLivePanel(activeReloadPage);
    const activeReloadRestored = await waitForLivePhase(activeReloadPage, 'active', 15000);
    const activeReloadProbe = await activeReloadPage.evaluate(() => {
      const payload = window.PVPScene.getLiveSnapshot() || null;
      const textPayload = JSON.parse(window.render_game_to_text()).pvp?.live || null;
      return {
        phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
        timerText: document.querySelector('[data-live-turn-timer]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        connectionText: document.querySelector('[data-live-connection-status]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        reviewText: document.querySelector('[data-live-post-match-review]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        liveTabActive: document.getElementById('tab-live')?.classList.contains('active') === true,
        opponentHandArray: Array.isArray(payload?.opponent?.hand),
        payload,
        textPayload,
      };
    });
    await activeReloadPage.close();
    const reloadProbe = activeReloadProbe;
    add(
      'real browser active match survives full page refresh through current match recovery',
      activeReloadRestored.phase === 'active'
        && reloadProbe.phase === 'active'
        && reloadProbe.liveTabActive === true
        && reloadProbe.payload?.phase === 'active'
        && reloadProbe.payload?.matchId === activeReloadBefore.matchId
        && reloadProbe.payload?.seatId === activeReloadBefore.seatId
        && reloadProbe.payload?.currentSeat === activeReloadBefore.currentSeat
        && reloadProbe.payload?.turnTimer?.startedAt === activeReloadBefore.turnTimer?.startedAt
        && reloadProbe.payload?.turnTimer?.deadlineAt === activeReloadBefore.turnTimer?.deadlineAt
        && reloadProbe.textPayload?.matchId === activeReloadBefore.matchId
        && reloadProbe.textPayload?.turnTimer?.startedAt === activeReloadBefore.turnTimer?.startedAt
        && /行动倒计时/.test(reloadProbe.timerText)
        && /连接：/.test(reloadProbe.connectionText)
        && ['online', 'grace'].includes(reloadProbe.payload?.connectionReport?.viewer?.status)
        && reloadProbe.payload?.postMatchReview == null
        && reloadProbe.textPayload?.postMatchReview == null
        && reloadProbe.opponentHandArray === false,
      JSON.stringify({ activeReloadBefore, activeReloadRestored, activeReloadProbe }),
    );
    const openerAssignmentProbe = await firstSeatClient.page.evaluate(() => {
      const textPayload = JSON.parse(window.render_game_to_text()).pvp?.live || null;
      return {
        text: document.querySelector('[data-live-opener-assignment]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        payload: window.PVPScene.getLiveSnapshot()?.openerAssignment || null,
        textPayload: textPayload?.openerAssignment || null,
      };
    });
    add(
      'real browser exposes server-authoritative opener assignment without queue or host binding',
      /我方先手|对方先手/.test(openerAssignmentProbe.text)
        && /服务端种子/.test(openerAssignmentProbe.text)
        && /不绑定排队|不绑定房主/.test(openerAssignmentProbe.text)
        && openerAssignmentProbe.payload?.reportVersion === 'pvp-live-opener-assignment-v1'
        && openerAssignmentProbe.payload?.sourceVisibility === 'server_authoritative_public_seed'
        && openerAssignmentProbe.payload?.firstSeat === activeFirstSeat
        && openerAssignmentProbe.payload?.secondSeat === activeSecondSeat
        && openerAssignmentProbe.payload?.queueOrderBinding === false
        && openerAssignmentProbe.payload?.hostBinding === false
        && openerAssignmentProbe.payload?.usesHiddenInformation === false
        && openerAssignmentProbe.textPayload?.reportVersion === 'pvp-live-opener-assignment-v1'
        && !/userId|hand|deck|loadoutSnapshot|rating|elo/i.test(JSON.stringify(openerAssignmentProbe)),
      JSON.stringify({ activeFirstSeat, activeSecondSeat, openerAssignmentProbe }),
    );
    const mirroredOpenerAssignmentProbe = await secondSeatClient.page.evaluate(() => {
      const textPayload = JSON.parse(window.render_game_to_text()).pvp?.live || null;
      return {
        text: document.querySelector('[data-live-opener-assignment]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        payload: window.PVPScene.getLiveSnapshot()?.openerAssignment || null,
        textPayload: textPayload?.openerAssignment || null,
      };
    });
    add(
      'real browser mirrors opener assignment on the second seat without queue or host binding',
      /我方先手|对方先手/.test(mirroredOpenerAssignmentProbe.text)
        && /服务端种子/.test(mirroredOpenerAssignmentProbe.text)
        && /不绑定排队|不绑定房主/.test(mirroredOpenerAssignmentProbe.text)
        && mirroredOpenerAssignmentProbe.payload?.reportVersion === 'pvp-live-opener-assignment-v1'
        && mirroredOpenerAssignmentProbe.payload?.sourceVisibility === 'server_authoritative_public_seed'
        && mirroredOpenerAssignmentProbe.payload?.firstSeat === activeFirstSeat
        && mirroredOpenerAssignmentProbe.payload?.secondSeat === activeSecondSeat
        && mirroredOpenerAssignmentProbe.payload?.viewerSeat === activeSecondSeat
        && mirroredOpenerAssignmentProbe.payload?.viewerStarts === (activeSecondSeat === activeFirstSeat)
        && mirroredOpenerAssignmentProbe.payload?.queueOrderBinding === false
        && mirroredOpenerAssignmentProbe.payload?.hostBinding === false
        && mirroredOpenerAssignmentProbe.payload?.usesHiddenInformation === false
        && mirroredOpenerAssignmentProbe.textPayload?.reportVersion === 'pvp-live-opener-assignment-v1'
        && !/userId|hand|deck|loadoutSnapshot|rating|elo/i.test(JSON.stringify(mirroredOpenerAssignmentProbe)),
      JSON.stringify({ activeFirstSeat, activeSecondSeat, mirroredOpenerAssignmentProbe }),
    );
    add(
      'real mobile browser setup ready uses touch-tap controls before active phase',
      !isMobileViewport
        || (seatAReadyTouchActionable?.ok === true
          && seatBReadyTouchActionable?.ok === true
          && activeA.phase === 'active'
          && activeB.phase === 'active'),
      JSON.stringify({ seatAReadyTouchActionable, seatBReadyTouchActionable, activeA, activeB }),
    );
    await waitForLiveSnapshot(firstSeatClient.page, expectedSeat => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.();
      const text = document.querySelector('[data-live-turn-timer]')?.textContent || '';
      return snapshot?.turnTimer?.phase === 'active'
        && snapshot?.turnTimer?.currentSeat === expectedSeat
        && /行动倒计时/.test(text)
        && new RegExp(expectedSeat).test(text);
    }, activeFirstSeat);
    const activeTimerProbe = await firstSeatClient.page.evaluate(() => ({
      text: document.querySelector('[data-live-turn-timer]')?.textContent || '',
      payload: window.PVPScene.getLiveSnapshot()?.turnTimer || null,
    }));
    add(
      'real browser live match renders authoritative active action countdown',
      /行动倒计时/.test(activeTimerProbe.text)
        && new RegExp(activeFirstSeat).test(activeTimerProbe.text)
        && activeTimerProbe.payload?.reportVersion === 'pvp-live-turn-timer-v1'
        && activeTimerProbe.payload?.phase === 'active'
        && activeTimerProbe.payload?.currentSeat === activeFirstSeat
        && activeTimerProbe.payload?.isViewerTurn === true,
      JSON.stringify({ activeFirstSeat, activeTimerProbe }),
    );
    let protectedOpeningSecond = activeSecondSnapshot;
    await secondSeatClient.page.evaluate(() => {
      window.PVPScene.__realSmokeStartLiveHeartbeat = window.PVPScene.startLiveHeartbeat;
      window.PVPScene.__realSmokeSendLiveHeartbeat = window.PVPScene.sendLiveHeartbeat;
      window.PVPScene.startLiveHeartbeat = () => {};
      window.PVPScene.sendLiveHeartbeat = async () => {};
      window.PVPScene.stopLiveHeartbeat();
      window.PVPScene.stopLiveRealtime();
    });
    try {
      await secondSeatClient.page.waitForTimeout(500);
      const activeNonTurnDisconnectProbe = await firstSeatClient.page.evaluate(async secondSeat => {
        const BackendClient = window.__THE_DEFIER_SERVICES__?.BackendClient;
        const before = window.PVPScene.getLiveSnapshot();
        const heartbeatElapsedMs = Math.max(0, Number(before?.connectionReport?.heartbeatStaleMs || 1000))
          + Math.max(0, Number(before?.connectionReport?.graceMs || 60000))
          + 1000;
        const response = await BackendClient.requestServer(`/api/pvp/live/test/matches/${before.matchId}/seats/${secondSeat}`, {
          method: 'POST',
          data: { heartbeatElapsedMs, testMatchScope: window.__DEFIER_PVP_REAL_TEST_SCOPE }
        });
        await window.PVPScene.refreshLiveMatch();
        await new Promise(resolve => setTimeout(resolve, 300));
        const snapshot = window.PVPScene.getLiveSnapshot();
        const textPayload = JSON.parse(window.render_game_to_text()).pvp?.live || null;
        const tempoEl = document.querySelector('[data-live-connection-tempo]');
        return {
          before,
          response,
          snapshot,
          connectionText: document.querySelector('[data-live-connection-status]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          connectionTempo: tempoEl?.textContent?.replace(/\s+/g, ' ').trim() || '',
          connectionTempoState: tempoEl?.getAttribute('data-live-connection-tempo-state') || '',
          connectionTempoActor: tempoEl?.getAttribute('data-live-connection-tempo-actor') || '',
          connectionTempoSeverity: tempoEl?.getAttribute('data-live-connection-tempo-severity') || '',
          connectionTempoCta: tempoEl?.querySelector('[data-live-action="refresh-match"]')?.textContent?.trim() || '',
          timerText: document.querySelector('[data-live-turn-timer]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          heartbeatElapsedMs,
          textConnectionTempo: textPayload?.connectionTempoReport || null,
        };
      }, activeSecondSeat);
      add(
        'real browser active non-turn opponent disconnect keeps current actor actionable',
        activeNonTurnDisconnectProbe.response?.success === true
          && activeNonTurnDisconnectProbe.response?.stateView?.status === 'active'
          && activeNonTurnDisconnectProbe.response?.stateView?.currentSeat === activeFirstSeat
          && activeNonTurnDisconnectProbe.response?.stateView?.connectionReport?.opponent?.status === 'disconnected'
          && activeNonTurnDisconnectProbe.response?.stateView?.recentEvents?.some(event => event.eventType === 'test_state_forced' && (event.publicData?.fields || []).includes('heartbeatElapsedMs') && event.publicData?.scope === TEST_MATCH_SCOPE)
          && activeNonTurnDisconnectProbe.snapshot?.status === 'active'
          && activeNonTurnDisconnectProbe.snapshot?.currentSeat === activeFirstSeat
          && activeNonTurnDisconnectProbe.snapshot?.connectionReport?.opponent?.status === 'disconnected'
          && activeNonTurnDisconnectProbe.snapshot?.connectionTempoReport?.reportVersion === 'pvp-live-connection-tempo-v1'
          && activeNonTurnDisconnectProbe.snapshot?.connectionTempoReport?.tempoState === 'opponent_non_turn_disconnected'
          && activeNonTurnDisconnectProbe.snapshot?.connectionTempoReport?.affectedSeat === activeSecondSeat
          && activeNonTurnDisconnectProbe.snapshot?.connectionTempoReport?.usesHiddenInformation === false
          && activeNonTurnDisconnectProbe.textConnectionTempo?.tempoState === 'opponent_non_turn_disconnected'
          && /对方断线/.test(activeNonTurnDisconnectProbe.connectionText)
          && /对局继续|当前行动仍可提交|轮到对手/.test(`${activeNonTurnDisconnectProbe.connectionText} ${activeNonTurnDisconnectProbe.connectionTempo}`)
          && !/connection_timeout|turn_timeout/.test(`${activeNonTurnDisconnectProbe.connectionText} ${activeNonTurnDisconnectProbe.connectionTempo}`)
          && !/等待权威超时结算/.test(`${activeNonTurnDisconnectProbe.connectionText} ${activeNonTurnDisconnectProbe.connectionTempo}`)
          && activeNonTurnDisconnectProbe.connectionTempoState === 'opponent_non_turn_disconnected'
          && activeNonTurnDisconnectProbe.connectionTempoActor === activeSecondSeat
          && !activeNonTurnDisconnectProbe.connectionTempoCta
          && /行动倒计时/.test(activeNonTurnDisconnectProbe.timerText),
        JSON.stringify({ activeFirstSeat, activeSecondSeat, activeNonTurnDisconnectProbe }),
      );
      const forceOpeningProtectionProbe = await firstSeatClient.page.evaluate(async secondSeat => {
        const BackendClient = window.__THE_DEFIER_SERVICES__?.BackendClient;
        const before = window.PVPScene.getLiveSnapshot();
        const response = await BackendClient.requestServer(`/api/pvp/live/test/matches/${before.matchId}/seats/${secondSeat}`, {
          method: 'POST',
          data: { hp: 10, heartbeatElapsedMs: 0, testMatchScope: window.__DEFIER_PVP_REAL_TEST_SCOPE }
        });
        await window.PVPScene.refreshLiveMatch();
        await new Promise(resolve => setTimeout(resolve, 300));
        return {
          response,
          snapshot: window.PVPScene.getLiveSnapshot(),
        };
      }, activeSecondSeat);
      await secondSeatClient.page.evaluate(async () => {
        await window.PVPScene.refreshLiveMatch();
      });
      await secondSeatClient.page.waitForTimeout(300);
      protectedOpeningSecond = await getLiveSnapshot(secondSeatClient.page);
      add(
        'real browser test-mode match can enter protected lethal opening state',
        forceOpeningProtectionProbe.response?.success === true
          && forceOpeningProtectionProbe.response?.stateView?.opponent?.hp === 10
          && forceOpeningProtectionProbe.response?.stateView?.connectionReport?.opponent?.status === 'online'
          && forceOpeningProtectionProbe.response?.stateView?.recentEvents?.some(event => event.eventType === 'test_state_forced' && event.publicData?.scope === TEST_MATCH_SCOPE)
          && forceOpeningProtectionProbe.snapshot?.opponent?.hp === 10
          && forceOpeningProtectionProbe.snapshot?.connectionReport?.opponent?.status === 'online'
          && protectedOpeningSecond?.self?.hp === 10,
        JSON.stringify({ activeFirstSeat, activeSecondSeat, forceOpeningProtectionProbe, protectedOpeningSecond }),
      );
    } finally {
      await secondSeatClient.page.evaluate(async () => {
        if (window.PVPScene.__realSmokeStartLiveHeartbeat) {
          window.PVPScene.startLiveHeartbeat = window.PVPScene.__realSmokeStartLiveHeartbeat;
          delete window.PVPScene.__realSmokeStartLiveHeartbeat;
        }
        if (window.PVPScene.__realSmokeSendLiveHeartbeat) {
          window.PVPScene.sendLiveHeartbeat = window.PVPScene.__realSmokeSendLiveHeartbeat;
          delete window.PVPScene.__realSmokeSendLiveHeartbeat;
        }
        window.PVPScene.activeTab = 'live';
        window.PVPScene.startLiveHeartbeat();
        await window.PVPScene.handleLiveForegroundResume();
        await window.PVPScene.refreshLiveMatch();
      });
      await ensureLiveRealtime(secondSeatClient.page);
    }
    const activeOpeningPreviewProbe = await firstSeatClient.page.evaluate(() => {
      const snapshot = window.PVPScene.getLiveSnapshot();
      const textPayload = JSON.parse(window.render_game_to_text()).pvp?.live || null;
      return {
        openingText: document.querySelector('[data-live-opening-safeguard]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        actionPreview: snapshot?.actionPreviewReport || null,
        textActionPreview: textPayload?.actionPreviewReport || null,
      };
    });
    const activeOpeningCardPreview = activeOpeningPreviewProbe.actionPreview?.playableCards?.find(card => card.targetHpAfter === 1 && card.openingProtection?.willTrigger === true);
    add(
      'real browser live match previews protected lethal opening without hidden opponent payloads',
      /首动预算/.test(activeOpeningPreviewProbe.openingText)
        && new RegExp(`当前\\s*${activeFirstSeat}`).test(activeOpeningPreviewProbe.openingText)
        && /后手护盾/.test(activeOpeningPreviewProbe.openingText)
        && new RegExp(`${activeSecondSeat}\\s*\\+3`).test(activeOpeningPreviewProbe.openingText)
        && activeOpeningPreviewProbe.actionPreview?.reportVersion === 'pvp-live-action-preview-v1'
        && activeOpeningPreviewProbe.actionPreview?.sourceVisibility === 'viewer_public_state'
        && activeOpeningPreviewProbe.actionPreview?.usesHiddenInformation === false
        && activeOpeningPreviewProbe.actionPreview?.rankedImpact === 'none'
        && activeOpeningCardPreview?.damageBudget === 18
        && activeOpeningCardPreview?.blockedDamage === 3
        && activeOpeningCardPreview?.hpDamage === 9
        && activeOpeningCardPreview?.openingProtection?.minimumHp === 1
        && activeOpeningCardPreview?.openingProtection?.preventedDamage === 6
        && activeOpeningPreviewProbe.textActionPreview?.reportVersion === 'pvp-live-action-preview-v1'
        && !/deck|loadoutSnapshot|reward|rating|elo|opponentHand|opponentDeck/i.test(JSON.stringify(activeOpeningPreviewProbe.actionPreview || {})),
      JSON.stringify({ activeFirstSeat, activeSecondSeat, activeOpeningPreviewProbe }),
    );
    const nonActingActionPreviewProbe = await secondSeatClient.page.evaluate(() => {
      const snapshot = window.PVPScene.getLiveSnapshot();
      const textPayload = JSON.parse(window.render_game_to_text()).pvp?.live || null;
      return {
        actionPreview: snapshot?.actionPreviewReport || null,
        textActionPreview: textPayload?.actionPreviewReport || null,
      };
    });
    add(
      'real browser non-acting seat receives no playable action preview payload',
      nonActingActionPreviewProbe.actionPreview?.reportVersion === 'pvp-live-action-preview-v1'
        && nonActingActionPreviewProbe.actionPreview?.viewerSeat === activeSecondSeat
        && nonActingActionPreviewProbe.actionPreview?.currentSeat === activeFirstSeat
        && nonActingActionPreviewProbe.actionPreview?.isViewerTurn === false
        && Array.isArray(nonActingActionPreviewProbe.actionPreview?.playableCards)
        && nonActingActionPreviewProbe.actionPreview.playableCards.length === 0
        && nonActingActionPreviewProbe.actionPreview?.endTurn === null
        && nonActingActionPreviewProbe.textActionPreview?.reportVersion === 'pvp-live-action-preview-v1'
        && nonActingActionPreviewProbe.textActionPreview?.playableCards?.length === 0
        && !/cardInstanceId|cardName|rawDamage|budgetedDamage|opponentHand|opponentDeck|deck|loadoutSnapshot|reward|rating|elo/i.test(JSON.stringify(nonActingActionPreviewProbe.actionPreview || {})),
      JSON.stringify({ activeFirstSeat, activeSecondSeat, nonActingActionPreviewProbe }),
    );
    const activeMomentumProbe = await firstSeatClient.page.evaluate(() => ({
      text: document.querySelector('[data-live-duel-momentum]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      state: document.querySelector('[data-live-duel-momentum]')?.getAttribute('data-live-duel-momentum-state') || '',
      source: document.querySelector('[data-live-duel-momentum]')?.getAttribute('data-live-duel-momentum-source') || '',
      hidden: document.querySelector('[data-live-duel-momentum]')?.getAttribute('data-live-duel-momentum-hidden') || '',
      payload: window.PVPScene.getLiveSnapshot()?.duelMomentumReport || null,
      textPayload: JSON.parse(window.render_game_to_text()).pvp?.live?.duelMomentumReport || null,
    }));
    add(
      'real browser live match renders active duel momentum report',
      /局势/.test(activeMomentumProbe.text)
        && /开局护体|行动窗口/.test(activeMomentumProbe.text)
        && /反打窗口|行动窗口/.test(activeMomentumProbe.text)
        && activeMomentumProbe.state === 'opening_window'
        && activeMomentumProbe.source === 'public_state'
        && activeMomentumProbe.hidden === 'false'
        && activeMomentumProbe.payload?.reportVersion === 'pvp-live-duel-momentum-v1'
        && activeMomentumProbe.payload?.sourceVisibility === 'public_state'
        && activeMomentumProbe.payload?.usesHiddenInformation === false
        && activeMomentumProbe.payload?.rankedImpact === 'none'
        && activeMomentumProbe.textPayload?.reportVersion === 'pvp-live-duel-momentum-v1'
        && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(`${activeMomentumProbe.text} ${JSON.stringify(activeMomentumProbe.payload || {})}`),
      JSON.stringify(activeMomentumProbe),
    );
    const activeGuideProbe = await firstSeatClient.page.evaluate(() => ({
      text: document.querySelector('[data-live-first-guide]')?.textContent || '',
      payload: window.PVPScene.getLiveSnapshot()?.firstMatchGuide || null,
    }));
    add(
      'real browser live match updates first-match guide after setup',
      /按当前行动席位出牌/.test(activeGuideProbe.text)
        && activeGuideProbe.payload?.nextAction === '按当前行动席位出牌，留意权威事件。',
      JSON.stringify(activeGuideProbe),
    );

    const realOpeningEndTurnBefore = await getLiveSnapshot(firstSeatClient.page);
    const openingEndTurnTouchActionable = await clickLiveControl(firstSeatClient.page, '[data-live-action="end-turn"]', `${seatSlug(activeFirstSeat)}-opening-end-turn-confirm`);
    await firstSeatClient.page.waitForTimeout(300);
    const realOpeningEndTurnConfirmProbe = await firstSeatClient.page.evaluate(before => {
      const after = window.PVPScene.getLiveSnapshot();
      return {
        before,
        after,
        hint: document.querySelector('[data-live-last-error]')?.textContent || '',
        endTurnText: document.querySelector('[data-live-action="end-turn"]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      };
    }, realOpeningEndTurnBefore);
    add(
      'real browser opening-window end turn confirmation blocks authoritative submit until second click',
      realOpeningEndTurnConfirmProbe.before?.phase === 'active'
        && realOpeningEndTurnConfirmProbe.after?.phase === 'active'
        && realOpeningEndTurnConfirmProbe.after?.currentSeat === realOpeningEndTurnConfirmProbe.before?.currentSeat
        && realOpeningEndTurnConfirmProbe.after?.stateVersion === realOpeningEndTurnConfirmProbe.before?.stateVersion
        && /再次点击确认结束回合/.test(realOpeningEndTurnConfirmProbe.hint)
        && new RegExp(`交给\\s*${activeSecondSeat}`).test(realOpeningEndTurnConfirmProbe.hint)
        && /首动预算\s*18/.test(realOpeningEndTurnConfirmProbe.hint)
        && new RegExp(`后手护盾\\s*${activeSecondSeat}\\s*\\+3`).test(realOpeningEndTurnConfirmProbe.hint)
        && /反打缓冲\s*\+8/.test(realOpeningEndTurnConfirmProbe.hint)
        && /确认结束/.test(realOpeningEndTurnConfirmProbe.endTurnText),
      JSON.stringify({ activeFirstSeat, activeSecondSeat, realOpeningEndTurnConfirmProbe, openingEndTurnTouchActionable }),
    );

    await seatB.page.evaluate(async () => {
      await window.PVPScene.submitLiveEmote('thinking');
    });
    await seatB.page.waitForFunction(
      () => {
        const state = window.PVPScene.getLiveSession().getState();
        const ack = state.lastRealtimeIntentResult || null;
        const events = document.querySelector('[data-live-event-log]')?.textContent || '';
        return (ack?.result === 'accepted' && /emote/i.test(String(ack.intentId || '')))
          || /B · (思考|thinking)/.test(events);
      },
      null,
      { timeout: 5000 },
    );
    const realSocialSubmitProbe = await seatB.page.evaluate(() => {
      const state = window.PVPScene.getLiveSession().getState();
      return {
        snapshot: window.PVPScene.getLiveSnapshot(),
        lastError: state.lastError || null,
        lastRealtimeIntentResult: state.lastRealtimeIntentResult || null,
        eventLog: document.querySelector('[data-live-event-log]')?.textContent || '',
      };
    });
    let realSocialUnmutedProbe = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await seatA.page.evaluate(async () => {
        await window.PVPScene.refreshLiveMatch();
      });
      await seatA.page.waitForTimeout(250);
      realSocialUnmutedProbe = await seatA.page.evaluate(() => ({
        events: document.querySelector('[data-live-event-log]')?.textContent || '',
        status: document.querySelector('[data-live-social-status]')?.textContent || '',
        payload: window.PVPScene.getLiveSnapshot()?.social || null,
        snapshot: window.PVPScene.getLiveSnapshot() || null,
        sessionState: window.PVPScene.getLiveSession().getState(),
      }));
      if (/B · (思考|thinking)/.test(realSocialUnmutedProbe.events || '')) break;
    }
    const socialMuteTouchActionable = await clickLiveControl(seatA.page, '[data-live-action="toggle-social-mute"]', 'seat-a-toggle-social-mute');
    await seatA.page.waitForFunction(
      () => /已静音/.test(document.querySelector('[data-live-social-status]')?.textContent || ''),
      null,
      { timeout: 5000 },
    );
    const realSocialMutedProbe = await seatA.page.evaluate(() => {
      const storageKey = 'the-defier:pvp-live-social-preferences:v1';
      const storage = window.localStorage.getItem(storageKey) || '';
      window.PVPScene.liveSocialMuted = false;
      window.PVPScene.liveSocialPreferencesLoaded = false;
      window.PVPScene.loadLiveSocialPreferences();
      window.PVPScene.renderLivePanel();
      return {
        events: document.querySelector('[data-live-event-log]')?.textContent || '',
        status: document.querySelector('[data-live-social-status]')?.textContent || '',
        payload: window.PVPScene.getLiveSnapshot()?.social || null,
        storage,
        liveSocialMuted: window.PVPScene.liveSocialMuted,
        textPayload: JSON.parse(window.render_game_to_text()).pvp?.live?.social || null,
      };
    });
    add(
      'real browser persists local social mute without ranked impact',
      realSocialSubmitProbe.lastRealtimeIntentResult?.result === 'accepted'
        && !/sync_required|conflicting_state_version/i.test(JSON.stringify(realSocialSubmitProbe))
        && /B · (思考|thinking)/.test(realSocialUnmutedProbe.events)
        && /已静音/.test(realSocialMutedProbe.status)
        && /本地偏好/.test(realSocialMutedProbe.status)
        && !/B · (思考|thinking)/.test(realSocialMutedProbe.events)
        && /"socialMuted":true/.test(realSocialMutedProbe.storage)
        && realSocialMutedProbe.liveSocialMuted === true
        && realSocialMutedProbe.payload?.muted === true
        && realSocialMutedProbe.payload?.preferenceScope === 'local_only'
        && realSocialMutedProbe.payload?.sourceVisibility === 'local_preference'
        && realSocialMutedProbe.payload?.rankedImpact === 'none'
        && realSocialMutedProbe.payload?.persistence === 'local_storage'
        && realSocialMutedProbe.textPayload?.rankedImpact === 'none'
        && !/reward|rating|elo|settlement|matchTicket/i.test(JSON.stringify(realSocialMutedProbe)),
      JSON.stringify({ realSocialSubmitProbe, realSocialUnmutedProbe, realSocialMutedProbe, socialMuteTouchActionable }),
    );

    const openingCardBeforeProbe = await firstSeatClient.page.evaluate(() => {
      const before = window.PVPScene.getLiveSnapshot();
      const state = window.PVPScene.getLiveSession().getState();
      const hand = Array.isArray(state.stateView?.self?.hand) ? state.stateView.self.hand : [];
      const previews = Array.isArray(before?.actionPreviewReport?.playableCards) ? before.actionPreviewReport.playableCards : [];
      const preview = previews.find(item => item?.openingProtection?.willTrigger)
        || previews.find(item => Number(item?.hpDamage || 0) > 0)
        || previews[0]
        || null;
      const card = hand.find(item => item?.instanceId && item.instanceId === preview?.cardInstanceId) || hand[0];
      if (!card?.instanceId) throw new Error('acting seat has no playable card');
      return { before, card, preview };
    });
    const openingCardSelector = liveCardSelector(openingCardBeforeProbe.card.instanceId);
    const openingCardConfirmTouchActionable = await clickLiveControl(firstSeatClient.page, openingCardSelector, `${seatSlug(activeFirstSeat)}-opening-card-confirm`);
    await firstSeatClient.page.waitForTimeout(300);
    const realOpeningCardConfirmProbe = await firstSeatClient.page.evaluate(({ before, card, preview, cardSelector }) => {
      const after = window.PVPScene.getLiveSnapshot();
      const selectedCard = document.querySelector(cardSelector);
      const confirmingCard = document.querySelector('.pvp-live-card.confirming');
      return {
        before,
        after,
        card,
        preview,
        hint: document.querySelector('[data-live-last-error]')?.textContent || '',
        selectedCardInstanceId: selectedCard?.getAttribute('data-live-card') || '',
        confirmingCardInstanceId: confirmingCard?.getAttribute('data-live-card') || '',
        cardClass: selectedCard?.className || '',
        cardText: selectedCard?.textContent?.replace(/\s+/g, ' ').trim() || '',
      };
    }, { ...openingCardBeforeProbe, cardSelector: openingCardSelector });
    const confirmedCardPreview = realOpeningCardConfirmProbe.preview || {};
    const confirmedHint = realOpeningCardConfirmProbe.hint || '';
    add(
      'real browser opening-window card confirmation blocks authoritative submit until second click',
      realOpeningCardConfirmProbe.before?.phase === 'active'
        && realOpeningCardConfirmProbe.after?.phase === 'active'
        && realOpeningCardConfirmProbe.after?.currentSeat === realOpeningCardConfirmProbe.before?.currentSeat
        && realOpeningCardConfirmProbe.after?.stateVersion === realOpeningCardConfirmProbe.before?.stateVersion
        && realOpeningCardConfirmProbe.after?.opponent?.hp === realOpeningCardConfirmProbe.before?.opponent?.hp
        && confirmedCardPreview.cardInstanceId === realOpeningCardConfirmProbe.card?.instanceId
        && confirmedCardPreview.damageBudget === 18
        && Number.isFinite(confirmedCardPreview.budgetedDamage)
        && Number.isFinite(confirmedCardPreview.blockedDamage)
        && Number.isFinite(confirmedCardPreview.hpDamage)
        && Number.isFinite(confirmedCardPreview.targetHpAfter)
        && /再次点击确认出牌/.test(realOpeningCardConfirmProbe.hint)
        && /首动预算\s*18/.test(realOpeningCardConfirmProbe.hint)
        && /保底\s*1\s*血/.test(realOpeningCardConfirmProbe.hint)
        && new RegExp(`后手护盾\\s*${activeSecondSeat}\\s*\\+3`).test(realOpeningCardConfirmProbe.hint)
        && /反打缓冲\s*\+8/.test(realOpeningCardConfirmProbe.hint)
        && new RegExp(`预算后\\s*${confirmedCardPreview.budgetedDamage}`).test(confirmedHint)
        && new RegExp(`破盾\\s*${confirmedCardPreview.blockedDamage}`).test(confirmedHint)
        && new RegExp(`生命伤害\\s*${confirmedCardPreview.hpDamage}`).test(confirmedHint)
        && new RegExp(`${confirmedCardPreview.targetSeat}\\s*预计\\s*${confirmedCardPreview.targetHpAfter}\\s*血`).test(confirmedHint)
        && realOpeningCardConfirmProbe.selectedCardInstanceId === realOpeningCardConfirmProbe.card?.instanceId
        && realOpeningCardConfirmProbe.confirmingCardInstanceId === realOpeningCardConfirmProbe.card?.instanceId
        && /confirming/.test(realOpeningCardConfirmProbe.cardClass)
        && /确认/.test(realOpeningCardConfirmProbe.cardText),
      JSON.stringify({ activeFirstSeat, activeSecondSeat, realOpeningCardConfirmProbe, openingCardConfirmTouchActionable }),
    );

    const acceptedCardTouchActionable = await clickLiveControl(firstSeatClient.page, openingCardSelector, `${seatSlug(activeFirstSeat)}-opening-card-submit`);
    const playFirst = await waitForLiveSnapshot(firstSeatClient.page, expectedVersion => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.();
      return Number(snapshot?.stateVersion || 0) > expectedVersion;
    }, activeFirstSnapshot.stateVersion);
    const afterPlaySecond = await waitForLiveSnapshot(secondSeatClient.page, previousVersion => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.();
      return snapshot?.self?.hp <= 1 && Number(snapshot?.stateVersion || 0) > Number(previousVersion || 0);
    }, protectedOpeningSecond.stateVersion);
    add(
      'real browser accepted card intent auto-pushes opponent state without manual refresh',
      playFirst.stateVersion > activeFirstSnapshot.stateVersion
        && afterPlaySecond.self?.hp < activeSecondSnapshot.self?.hp
        && afterPlaySecond.opponent?.handCount >= 0,
      JSON.stringify({ activeFirstSeat, activeSecondSeat, playFirst, afterPlaySecond, acceptedCardTouchActionable }),
    );
    const afterPlayReceiptProbe = await secondSeatClient.page.evaluate(() => {
      const snapshot = window.PVPScene.getLiveSnapshot();
      const textPayload = JSON.parse(window.render_game_to_text()).pvp?.live || null;
      return {
        text: document.querySelector('[data-live-action-receipt]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        sourceAttr: document.querySelector('[data-live-action-receipt]')?.getAttribute('data-live-action-receipt-source') || '',
        hiddenAttr: document.querySelector('[data-live-action-receipt]')?.getAttribute('data-live-action-receipt-hidden') || '',
        seqAttr: document.querySelector('[data-live-action-receipt]')?.getAttribute('data-live-action-receipt-seq') || '',
        payload: snapshot?.actionReceiptReport || null,
        textPayload: textPayload?.actionReceiptReport || null,
      };
    });
    add(
      'real browser opponent sees authoritative action receipt after accepted card',
      /行动回执/.test(afterPlayReceiptProbe.text)
        && /预算后/.test(afterPlayReceiptProbe.text)
        && /破盾/.test(afterPlayReceiptProbe.text)
        && /生命伤害/.test(afterPlayReceiptProbe.text)
        && /护体/.test(afterPlayReceiptProbe.text)
        && afterPlayReceiptProbe.sourceAttr === 'authoritative_public_projection'
        && afterPlayReceiptProbe.hiddenAttr === 'false'
        && afterPlayReceiptProbe.payload?.reportVersion === 'pvp-live-action-receipt-v1'
        && afterPlayReceiptProbe.payload?.sourceVisibility === 'authoritative_public_projection'
        && afterPlayReceiptProbe.payload?.usesHiddenInformation === false
        && afterPlayReceiptProbe.payload?.rankedImpact === 'none'
        && Number(afterPlayReceiptProbe.seqAttr) === afterPlayReceiptProbe.payload?.latestSequence
        && Number.isFinite(afterPlayReceiptProbe.payload?.latestSequence)
        && afterPlayReceiptProbe.payload.latestSequence > 0
        && afterPlayReceiptProbe.payload?.viewerSeat === activeSecondSeat
        && afterPlayReceiptProbe.payload?.actingSeat === activeFirstSeat
        && afterPlayReceiptProbe.payload?.actionType === 'play_card'
        && Number.isFinite(afterPlayReceiptProbe.payload?.damage?.hpDamage)
        && afterPlayReceiptProbe.payload.damage.hpDamage > 0
        && afterPlayReceiptProbe.payload?.damage?.targetSeat === activeSecondSeat
        && afterPlayReceiptProbe.payload?.damage?.targetHpAfter === 1
        && afterPlayReceiptProbe.payload?.openingProtection?.triggered === true
        && afterPlayReceiptProbe.payload?.openingProtection?.protectedSeat === activeSecondSeat
        && afterPlayReceiptProbe.payload?.openingProtection?.minimumHp === 1
        && afterPlayReceiptProbe.payload?.openingProtection?.preventedDamage === 6
        && afterPlayReceiptProbe.textPayload?.reportVersion === 'pvp-live-action-receipt-v1'
        && afterPlayReceiptProbe.textPayload?.sourceVisibility === afterPlayReceiptProbe.payload?.sourceVisibility
        && afterPlayReceiptProbe.textPayload?.latestSequence === afterPlayReceiptProbe.payload?.latestSequence
        && afterPlayReceiptProbe.textPayload?.summaryLine === afterPlayReceiptProbe.payload?.summaryLine
        && !/\bhand\b|hand":\[|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo|opponentHand|opponentDeck/i.test(`${afterPlayReceiptProbe.text} ${JSON.stringify(afterPlayReceiptProbe.payload || {})}`),
      JSON.stringify({ activeFirstSeat, activeSecondSeat, afterPlayReceiptProbe }),
    );
    const afterPlayMomentumProbe = await secondSeatClient.page.evaluate(() => ({
      text: document.querySelector('[data-live-duel-momentum]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      state: document.querySelector('[data-live-duel-momentum]')?.getAttribute('data-live-duel-momentum-state') || '',
      payload: window.PVPScene.getLiveSnapshot()?.duelMomentumReport || null,
    }));
    add(
      'real browser accepted card intent keeps public duel momentum readable without refresh',
      /局势/.test(afterPlayMomentumProbe.text)
        && /行动窗口|反打窗口|护体/.test(afterPlayMomentumProbe.text)
        && afterPlayMomentumProbe.payload?.reportVersion === 'pvp-live-duel-momentum-v1'
        && afterPlayMomentumProbe.payload?.viewerSeat === activeSecondSeat
        && afterPlayMomentumProbe.payload?.sourceVisibility === 'public_state'
        && afterPlayMomentumProbe.payload?.usesHiddenInformation === false
        && afterPlayMomentumProbe.payload?.rankedImpact === 'none'
        && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(`${afterPlayMomentumProbe.text} ${JSON.stringify(afterPlayMomentumProbe.payload || {})}`),
      JSON.stringify({ activeFirstSeat, activeSecondSeat, afterPlayMomentumProbe }),
    );

    await waitForLiveActionUnlocked(firstSeatClient.page, `${seatSlug(activeFirstSeat)}-after-play-before-end-turn`);
    const endTurnAfterPlayTouchActionable = await clickLiveControl(firstSeatClient.page, '[data-live-action="end-turn"]', `${seatSlug(activeFirstSeat)}-end-turn-after-play`);
    await firstSeatClient.page.waitForTimeout(300);
    const endTurnAfterPlayConfirmProbe = await firstSeatClient.page.evaluate(() => {
      return {
        snapshot: window.PVPScene.getLiveSnapshot(),
        hint: document.querySelector('[data-live-last-error]')?.textContent || '',
        endTurnText: document.querySelector('[data-live-action="end-turn"]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      };
    });
    let endTurnAfterPlaySecondTouchActionable = null;
    if (endTurnAfterPlayConfirmProbe.snapshot?.currentSeat !== activeSecondSeat) {
      endTurnAfterPlaySecondTouchActionable = await clickLiveControl(firstSeatClient.page, '[data-live-action="end-turn"]', `${seatSlug(activeFirstSeat)}-end-turn-after-play-submit`);
    }
    const waitForEndTurnSecondPredicate = ({ expectedSeat, expectedVersion }) => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.();
      return snapshot?.currentSeat === expectedSeat && Number(snapshot?.stateVersion || 0) > Number(expectedVersion || 0);
    };
    let afterEndTurnSecond = null;
    try {
      // release marker: waitForLiveSnapshot(secondSeatClient.page, ({ expectedSeat, expectedVersion })
      afterEndTurnSecond = await waitForLiveSnapshot(
        secondSeatClient.page,
        waitForEndTurnSecondPredicate,
        { expectedSeat: activeSecondSeat, expectedVersion: afterPlaySecond.stateVersion || activeSecondSnapshot.stateVersion },
        6000,
      );
    } catch (error) {
      afterEndTurnSecond = await refreshUntilLiveSnapshot(
        secondSeatClient.page,
        waitForEndTurnSecondPredicate,
        { expectedSeat: activeSecondSeat, expectedVersion: afterPlaySecond.stateVersion || activeSecondSnapshot.stateVersion },
        10000,
      );
    }
    await waitForLiveSnapshot(secondSeatClient.page, expectedSeat => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.();
      const text = document.querySelector('[data-live-turn-timer]')?.textContent || '';
      return snapshot?.turnTimer?.phase === 'active'
        && snapshot?.turnTimer?.currentSeat === expectedSeat
        && /行动倒计时/.test(text)
        && new RegExp(expectedSeat).test(text);
    }, activeSecondSeat);
    const secondSeatTimerProbe = await secondSeatClient.page.evaluate(() => ({
      text: document.querySelector('[data-live-turn-timer]')?.textContent || '',
      payload: window.PVPScene.getLiveSnapshot()?.turnTimer || null,
    }));
    const afterEndTurnReceiptProbe = await secondSeatClient.page.evaluate(() => {
      const snapshot = window.PVPScene.getLiveSnapshot();
      const textPayload = JSON.parse(window.render_game_to_text()).pvp?.live || null;
      const receiptEl = document.querySelector('[data-live-action-receipt]');
      return {
        text: receiptEl?.textContent?.replace(/\s+/g, ' ').trim() || '',
        typeAttr: receiptEl?.getAttribute('data-live-action-receipt-type') || '',
        actorAttr: receiptEl?.getAttribute('data-live-action-receipt-acting') || '',
        nextSeatAttr: receiptEl?.getAttribute('data-live-action-receipt-next-seat') || '',
        sourceAttr: receiptEl?.getAttribute('data-live-action-receipt-source') || '',
        hiddenAttr: receiptEl?.getAttribute('data-live-action-receipt-hidden') || '',
        seqAttr: receiptEl?.getAttribute('data-live-action-receipt-seq') || '',
        payload: snapshot?.actionReceiptReport || null,
        textPayload: textPayload?.actionReceiptReport || null,
      };
    });
    add(
      'real browser end turn switches authoritative action countdown to opponent',
      afterEndTurnSecond.currentSeat === activeSecondSeat
        && /行动倒计时/.test(secondSeatTimerProbe.text)
        && new RegExp(activeSecondSeat).test(secondSeatTimerProbe.text)
        && secondSeatTimerProbe.payload?.currentSeat === activeSecondSeat
        && secondSeatTimerProbe.payload?.isViewerTurn === true,
      JSON.stringify({ activeFirstSeat, activeSecondSeat, endTurnAfterPlayConfirmProbe, afterEndTurnSecond, secondSeatTimerProbe, endTurnAfterPlayTouchActionable, endTurnAfterPlaySecondTouchActionable }),
    );
    add(
      'real browser end turn renders authoritative handoff receipt',
      /交权回执/.test(afterEndTurnReceiptProbe.text)
        && new RegExp(`行动权交给\\s*${activeSecondSeat}`).test(afterEndTurnReceiptProbe.text)
        && /抽\s*\d+\s*张/.test(afterEndTurnReceiptProbe.text)
        && afterEndTurnReceiptProbe.typeAttr === 'end_turn'
        && afterEndTurnReceiptProbe.actorAttr === activeFirstSeat
        && afterEndTurnReceiptProbe.nextSeatAttr === activeSecondSeat
        && afterEndTurnReceiptProbe.sourceAttr === 'authoritative_public_projection'
        && afterEndTurnReceiptProbe.hiddenAttr === 'false'
        && afterEndTurnReceiptProbe.payload?.reportVersion === 'pvp-live-action-receipt-v1'
        && afterEndTurnReceiptProbe.payload?.sourceVisibility === 'authoritative_public_projection'
        && afterEndTurnReceiptProbe.payload?.usesHiddenInformation === false
        && afterEndTurnReceiptProbe.payload?.rankedImpact === 'none'
        && afterEndTurnReceiptProbe.payload?.viewerSeat === activeSecondSeat
        && afterEndTurnReceiptProbe.payload?.actingSeat === activeFirstSeat
        && afterEndTurnReceiptProbe.payload?.actionType === 'end_turn'
        && afterEndTurnReceiptProbe.payload?.nextSeat === activeSecondSeat
        && afterEndTurnReceiptProbe.payload?.counterplay?.granted === true
        && afterEndTurnReceiptProbe.payload?.counterplay?.seatId === activeSecondSeat
        && afterEndTurnReceiptProbe.payload?.counterplay?.block === 8
        && /反打缓冲\s*\+8/.test(afterEndTurnReceiptProbe.text)
        && Number(afterEndTurnReceiptProbe.seqAttr) === afterEndTurnReceiptProbe.payload?.latestSequence
        && Number.isFinite(afterEndTurnReceiptProbe.payload?.latestSequence)
        && afterEndTurnReceiptProbe.payload.latestSequence > 0
        && Number.isFinite(afterEndTurnReceiptProbe.payload?.draw?.count)
        && afterEndTurnReceiptProbe.textPayload?.reportVersion === 'pvp-live-action-receipt-v1'
        && afterEndTurnReceiptProbe.textPayload?.actionType === 'end_turn'
        && afterEndTurnReceiptProbe.textPayload?.latestSequence === afterEndTurnReceiptProbe.payload?.latestSequence
        && afterEndTurnReceiptProbe.textPayload?.summaryLine === afterEndTurnReceiptProbe.payload?.summaryLine
        && !/\bhand\b|hand":\[|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo|opponentHand|opponentDeck/i.test(`${afterEndTurnReceiptProbe.text} ${JSON.stringify(afterEndTurnReceiptProbe.payload || {})}`),
      JSON.stringify({ activeFirstSeat, activeSecondSeat, afterEndTurnReceiptProbe }),
    );
    const statusResponseSetupProbe = await secondSeatClient.page.evaluate(async ({ markedSeat, sourceSeat }) => {
      const BackendClient = window.__THE_DEFIER_SERVICES__?.BackendClient;
      const before = window.PVPScene.getLiveSnapshot();
      const response = await BackendClient.requestServer(`/api/pvp/live/test/matches/${before.matchId}/seats/${markedSeat}`, {
        method: 'POST',
        data: {
          publicStatus: {
            statusId: 'vulnerable_mark',
            label: '破绽',
            sourceSeat,
            responseWindow: 'defender_turn_before_payoff',
            payload: { hand: ['hidden-card'], deck: ['hidden-deck'] },
            cardInstanceId: 'hidden-card-instance',
            sourceCardId: 'hidden-source-card',
            token: 'hidden-token',
          },
          testMatchScope: window.__DEFIER_PVP_REAL_TEST_SCOPE,
        },
      });
      await window.PVPScene.refreshLiveMatch();
      await new Promise(resolve => setTimeout(resolve, 300));
      const after = window.PVPScene.getLiveSnapshot();
      const mitigationPreview = document.querySelector('[data-live-card-status-mitigation="vulnerable_mark"]');
      const cardEl = mitigationPreview?.closest('[data-live-card]') || null;
      return {
        before,
        response,
        after,
        previewText: mitigationPreview?.textContent?.replace(/\s+/g, ' ').trim() || '',
        responseWindow: mitigationPreview?.getAttribute('data-live-card-status-response-window') || '',
        previewSource: mitigationPreview?.getAttribute('data-live-card-preview-source') || '',
        previewHidden: mitigationPreview?.getAttribute('data-live-card-preview-hidden') || '',
        previewImpact: mitigationPreview?.getAttribute('data-live-card-preview-impact') || '',
        cardInstanceId: cardEl?.getAttribute('data-live-card') || '',
        cardText: cardEl?.textContent?.replace(/\s+/g, ' ').trim() || '',
        eventText: document.querySelector('[data-live-event-log]')?.textContent || '',
      };
    }, { markedSeat: activeSecondSeat, sourceSeat: activeFirstSeat });
    add(
      'real browser status-response window marks a real mitigation card before click',
      statusResponseSetupProbe.response?.success === true
        && statusResponseSetupProbe.response?.stateView?.self?.publicStatuses?.some(status => status.statusId === 'vulnerable_mark' && status.seatId === activeSecondSeat && status.sourceSeat === activeFirstSeat)
        && statusResponseSetupProbe.response?.stateView?.recentEvents?.some(event => event.eventType === 'test_state_forced' && (event.publicData?.fields || []).includes('publicStatus') && event.publicData?.scope === TEST_MATCH_SCOPE)
        && statusResponseSetupProbe.after?.currentSeat === activeSecondSeat
        && statusResponseSetupProbe.after?.self?.publicStatuses?.some(status => status.statusId === 'vulnerable_mark' && status.sourceSeat === activeFirstSeat)
        && statusResponseSetupProbe.after?.actionPreviewReport?.playableCards?.some(card => card.publicStatusMitigation?.statusId === 'vulnerable_mark')
        && statusResponseSetupProbe.cardInstanceId
        && /响应牌|清除破绽/.test(`${statusResponseSetupProbe.previewText} ${statusResponseSetupProbe.cardText}`)
        && statusResponseSetupProbe.responseWindow === 'defender_turn_before_payoff'
        && statusResponseSetupProbe.previewHidden === 'false'
        && statusResponseSetupProbe.previewImpact === 'none'
        && !/payload|cardInstanceId|sourceCardId|\bhand\b|hand":\[|deck|loadoutSnapshot|reward|rating|elo|token/i.test(`${statusResponseSetupProbe.previewText} ${statusResponseSetupProbe.cardText} ${JSON.stringify(statusResponseSetupProbe.after?.self?.publicStatuses || [])}`),
      JSON.stringify({ activeFirstSeat, activeSecondSeat, statusResponseSetupProbe }),
    );
    const protectedCounterplayBeforeProbe = await secondSeatClient.page.evaluate(() => {
      const before = window.PVPScene.getLiveSnapshot();
      const sessionState = window.PVPScene.getLiveSession().getState();
      const playableCards = Array.isArray(before?.actionPreviewReport?.playableCards)
        ? before.actionPreviewReport.playableCards
        : [];
      const playable = playableCards.find(card => card?.publicStatusMitigation?.statusId === 'vulnerable_mark')
        || playableCards[0]
        || null;
      const fallbackCard = sessionState.stateView?.self?.hand?.[0] || null;
      const cardInstanceId = playable?.cardInstanceId || fallbackCard?.instanceId || '';
      if (!cardInstanceId) {
        return {
          before,
          playable,
          fallbackCard,
          error: 'missing_playable_card'
        };
      }
      return { before, playable, fallbackCard, cardInstanceId, error: '' };
    });
    if (protectedCounterplayBeforeProbe.error) {
      throw new Error(`missing protected counterplay card: ${JSON.stringify(protectedCounterplayBeforeProbe)}`);
    }
    const protectedCounterplaySelector = liveCardSelector(protectedCounterplayBeforeProbe.cardInstanceId);
    const protectedCounterplayFirstTouchActionable = await clickLiveControl(secondSeatClient.page, protectedCounterplaySelector, `${seatSlug(activeSecondSeat)}-protected-counterplay-card-confirm`);
    await secondSeatClient.page.waitForTimeout(250);
    const protectedCounterplayConfirming = await getLiveSnapshot(secondSeatClient.page);
    let protectedCounterplaySecondTouchActionable = null;
    if (protectedCounterplayConfirming?.stateVersion === protectedCounterplayBeforeProbe.before?.stateVersion) {
      protectedCounterplaySecondTouchActionable = await clickLiveControl(secondSeatClient.page, protectedCounterplaySelector, `${seatSlug(activeSecondSeat)}-protected-counterplay-card-submit`);
    }
    await secondSeatClient.page.waitForTimeout(500);
    const protectedCounterplayActionProbe = await secondSeatClient.page.evaluate(({ before, playable, fallbackCard, cardInstanceId, confirming }) => {
      const after = window.PVPScene.getLiveSnapshot();
      const receiptEl = document.querySelector('[data-live-action-receipt]');
      return {
        before,
        after,
        playable,
        fallbackCard,
        cardInstanceId,
        confirming,
        hint: document.querySelector('[data-live-last-error]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        receiptText: receiptEl?.textContent?.replace(/\s+/g, ' ').trim() || '',
        receiptType: receiptEl?.getAttribute('data-live-action-receipt-type') || '',
        mitigationAttr: receiptEl?.querySelector('[data-live-action-status-mitigation="vulnerable_mark"]')?.getAttribute('data-live-action-status-mitigation') || '',
        mitigationState: receiptEl?.querySelector('[data-live-action-status-mitigation="vulnerable_mark"]')?.getAttribute('data-live-action-status-mitigation-state') || '',
        mitigationTarget: receiptEl?.querySelector('[data-live-action-status-mitigation="vulnerable_mark"]')?.getAttribute('data-live-action-status-mitigation-target') || '',
        mitigationBy: receiptEl?.querySelector('[data-live-action-status-mitigation="vulnerable_mark"]')?.getAttribute('data-live-action-status-mitigation-by') || '',
        mitigationResponseWindow: receiptEl?.querySelector('[data-live-action-status-mitigation="vulnerable_mark"]')?.getAttribute('data-live-action-status-mitigation-response-window') || '',
        mitigationHidden: receiptEl?.querySelector('[data-live-action-status-mitigation="vulnerable_mark"]')?.getAttribute('data-live-action-status-mitigation-hidden') || '',
        mitigationImpact: receiptEl?.querySelector('[data-live-action-status-mitigation="vulnerable_mark"]')?.getAttribute('data-live-action-status-mitigation-impact') || '',
        momentumText: document.querySelector('[data-live-duel-momentum]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        events: document.querySelector('[data-live-event-log]')?.textContent || '',
      };
    }, {
      before: protectedCounterplayBeforeProbe.before,
      playable: protectedCounterplayBeforeProbe.playable,
      fallbackCard: protectedCounterplayBeforeProbe.fallbackCard,
      cardInstanceId: protectedCounterplayBeforeProbe.cardInstanceId,
      confirming: protectedCounterplayConfirming,
    });
    const waitForProtectedCounterplayFirstPredicate = expectedVersion => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.();
      return Number(snapshot?.stateVersion || 0) > expectedVersion;
    };
    let afterProtectedCounterplayFirst = null;
    try {
      afterProtectedCounterplayFirst = await waitForLiveSnapshot(
        firstSeatClient.page,
        waitForProtectedCounterplayFirstPredicate,
        afterEndTurnSecond.stateVersion,
        6000,
      );
    } catch (error) {
      afterProtectedCounterplayFirst = await refreshUntilLiveSnapshot(
        firstSeatClient.page,
        waitForProtectedCounterplayFirstPredicate,
        afterEndTurnSecond.stateVersion,
        10000,
      );
    }
    add(
      'real browser protected defender can spend the +8 counterplay window on a real action',
      protectedCounterplayActionProbe.before?.currentSeat === activeSecondSeat
        && protectedCounterplayActionProbe.before?.self?.hp === 1
        && protectedCounterplayActionProbe.before?.self?.block >= 8
        && ['reversal_window', 'status_response_window'].includes(protectedCounterplayActionProbe.before?.duelMomentumReport?.pressureState)
        && protectedCounterplayActionProbe.before?.duelMomentumReport?.isViewerTurn === true
        && /你的反打窗口|反打窗口/.test(protectedCounterplayActionProbe.momentumText)
        && !!protectedCounterplayActionProbe.cardInstanceId
        && !protectedCounterplayActionProbe.error
        && protectedCounterplayActionProbe.after?.stateVersion > protectedCounterplayActionProbe.before?.stateVersion
        && protectedCounterplayActionProbe.after?.actionReceiptReport?.actingSeat === activeSecondSeat
        && protectedCounterplayActionProbe.after?.actionReceiptReport?.actionType === 'play_card'
        && protectedCounterplayActionProbe.after?.actionReceiptReport?.statusEffects?.mitigated?.some(status => status.statusId === 'vulnerable_mark' && status.seatId === activeSecondSeat && status.mitigatedBySeat === activeSecondSeat)
        && !protectedCounterplayActionProbe.after?.self?.publicStatuses?.some(status => status.statusId === 'vulnerable_mark')
        && protectedCounterplayActionProbe.after?.lastEvents?.some(event => event.eventType === 'status_mitigated')
        && !protectedCounterplayActionProbe.after?.lastEvents?.some(event => event.eventType === 'status_consumed')
        && protectedCounterplayActionProbe.receiptType === 'play_card'
        && protectedCounterplayActionProbe.mitigationAttr === 'vulnerable_mark'
        && protectedCounterplayActionProbe.mitigationState === 'public_status_mitigated'
        && protectedCounterplayActionProbe.mitigationTarget === activeSecondSeat
        && protectedCounterplayActionProbe.mitigationBy === activeSecondSeat
        && protectedCounterplayActionProbe.mitigationResponseWindow === 'defender_turn_before_payoff'
        && protectedCounterplayActionProbe.mitigationHidden === 'false'
        && protectedCounterplayActionProbe.mitigationImpact === 'none'
        && /稳住回执|稳住破绽|阻止后续兑现/.test(protectedCounterplayActionProbe.receiptText)
        && afterProtectedCounterplayFirst.stateVersion === protectedCounterplayActionProbe.after?.stateVersion
        && afterProtectedCounterplayFirst.currentSeat === protectedCounterplayActionProbe.after?.currentSeat
        && !/\bhand\b|hand":\[|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo|token|opponentHand|opponentDeck/i.test(`${protectedCounterplayActionProbe.receiptText} ${protectedCounterplayActionProbe.momentumText} ${JSON.stringify(protectedCounterplayActionProbe.after?.actionReceiptReport || {})}`),
      JSON.stringify({
        activeFirstSeat,
        activeSecondSeat,
        protectedCounterplayActionProbe,
        afterProtectedCounterplayFirst,
        protectedCounterplayFirstTouchActionable,
        protectedCounterplaySecondTouchActionable,
      }),
    );

    const surrenderTouchActionable = await clickLiveControl(secondSeatClient.page, '[data-live-action="surrender"]', `${seatSlug(activeSecondSeat)}-surrender-confirm`);
    await secondSeatClient.page.waitForTimeout(200);
    const realSurrenderConfirmProbe = await secondSeatClient.page.evaluate(() => {
      return {
        phase: window.PVPScene.getLiveSnapshot()?.phase || '',
        hint: document.querySelector('[data-live-last-error]')?.textContent || '',
        buttonText: document.querySelector('[data-live-action="surrender"]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        postReviewText: document.querySelector('[data-live-post-match-review]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      };
    });
    add(
      'real browser surrender confirmation blocks terminal submit until second click',
      realSurrenderConfirmProbe.phase === 'active'
        && /再次点击确认认输/.test(realSurrenderConfirmProbe.hint)
        && /确认认输/.test(realSurrenderConfirmProbe.buttonText)
        && !/首败复盘|认输结束|正式积分/.test(realSurrenderConfirmProbe.postReviewText || ''),
      JSON.stringify({ realSurrenderConfirmProbe, surrenderTouchActionable }),
    );
    add(
      'real mobile browser protected counterplay battle controls use touch-tap chain',
      !isMobileViewport
        || [
          seatAReadyTouchActionable,
          seatBReadyTouchActionable,
          openingEndTurnTouchActionable,
          openingCardConfirmTouchActionable,
          acceptedCardTouchActionable,
          endTurnAfterPlayTouchActionable,
          protectedCounterplayFirstTouchActionable,
          protectedCounterplaySecondTouchActionable,
          surrenderTouchActionable,
        ].every(item => item?.ok === true),
      JSON.stringify({
        seatAReadyTouchActionable,
        seatBReadyTouchActionable,
        openingEndTurnTouchActionable,
        openingCardConfirmTouchActionable,
        acceptedCardTouchActionable,
        endTurnAfterPlayTouchActionable,
        endTurnAfterPlaySecondTouchActionable,
        protectedCounterplayFirstTouchActionable,
        protectedCounterplaySecondTouchActionable,
        surrenderTouchActionable,
      }),
    );
    const lethalSetupProbe = await secondSeatClient.page.evaluate(async ({ targetSeat, actingSeat }) => {
      const BackendClient = window.__THE_DEFIER_SERVICES__?.BackendClient;
      const before = window.PVPScene.getLiveSnapshot();
      const matchId = before?.matchId || '';
      const targetResponse = await BackendClient.requestServer(`/api/pvp/live/test/matches/${matchId}/seats/${targetSeat}`, {
        method: 'POST',
        data: { hp: 1, block: 0, testMatchScope: window.__DEFIER_PVP_REAL_TEST_SCOPE }
      });
      const actorResponse = await BackendClient.requestServer(`/api/pvp/live/test/matches/${matchId}/seats/${actingSeat}`, {
        method: 'POST',
        data: { energy: 3, testMatchScope: window.__DEFIER_PVP_REAL_TEST_SCOPE }
      });
      await window.PVPScene.refreshLiveMatch();
      await new Promise(resolve => setTimeout(resolve, 300));
      const after = window.PVPScene.getLiveSnapshot();
      const sessionState = window.PVPScene.getLiveSession().getState();
      const hand = Array.isArray(sessionState.stateView?.self?.hand) ? sessionState.stateView.self.hand : [];
      const previews = Array.isArray(after?.actionPreviewReport?.playableCards)
        ? after.actionPreviewReport.playableCards
        : [];
      const lethalPreview = previews.find(card => (
        card?.targetSeat === targetSeat
        && Number(card?.hpDamage || 0) > 0
        && Number(card?.targetHpAfter || 0) <= 0
      )) || previews.find(card => card?.targetSeat === targetSeat && Number(card?.hpDamage || 0) > 0) || null;
      const lethalCard = hand.find(card => card?.instanceId && card.instanceId === lethalPreview?.cardInstanceId) || null;
      return {
        before,
        targetResponse,
        actorResponse,
        after,
        previews,
        lethalPreview,
        lethalCard,
        handCount: hand.length,
      };
    }, { targetSeat: activeFirstSeat, actingSeat: activeSecondSeat });
    if (!lethalSetupProbe.lethalCard?.instanceId) {
      throw new Error(`missing real lethal card after counterplay setup: ${JSON.stringify({ activeFirstSeat, activeSecondSeat, lethalSetupProbe })}`);
    }
    const lethalCardSelector = liveCardSelector(lethalSetupProbe.lethalCard.instanceId);
    const lethalFirstTouchActionable = await clickLiveControl(secondSeatClient.page, lethalCardSelector, `${seatSlug(activeSecondSeat)}-real-lethal-card-confirm`);
    await secondSeatClient.page.waitForTimeout(250);
    const lethalConfirmProbe = await secondSeatClient.page.evaluate(({ before, cardSelector }) => {
      const after = window.PVPScene.getLiveSnapshot();
      const selectedCard = document.querySelector(cardSelector);
      const confirmingCard = document.querySelector('.pvp-live-card.confirming');
      return {
        before,
        after,
        hint: document.querySelector('[data-live-last-error]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        selectedCardInstanceId: selectedCard?.getAttribute('data-live-card') || '',
        confirmingCardInstanceId: confirmingCard?.getAttribute('data-live-card') || '',
        cardText: selectedCard?.textContent?.replace(/\s+/g, ' ').trim() || '',
      };
    }, { before: lethalSetupProbe.after, cardSelector: lethalCardSelector });
    let lethalSecondTouchActionable = null;
    if (lethalConfirmProbe.after?.phase !== 'finished') {
      lethalSecondTouchActionable = await clickLiveControl(secondSeatClient.page, lethalCardSelector, `${seatSlug(activeSecondSeat)}-real-lethal-card-submit`);
    }
    const loserClient = firstSeatClient;
    const winnerClient = secondSeatClient;
    const loserSeat = activeFirstSeat;
    const winnerSeat = activeSecondSeat;
    const finishedLoser = await waitForLivePhase(loserClient.page, 'finished');
    const finishedWinner = await waitForLivePhase(winnerClient.page, 'finished');
    try {
      await winnerClient.page.waitForFunction(() => {
        const chip = document.querySelector('[data-live-action-terminal="public_terminal_damage"]');
        const snapshot = window.PVPScene?.getLiveSnapshot?.();
        return !!chip && snapshot?.phase === 'finished';
      }, null, { timeout: 5000 });
    } catch (error) {
      // Keep the finding diagnostic instead of aborting the whole smoke run.
    }
    const lethalFinishProbe = await winnerClient.page.evaluate(() => {
      const snapshot = window.PVPScene.getLiveSnapshot();
      const receiptEl = document.querySelector('[data-live-action-receipt]');
      const terminalEl = document.querySelector('[data-live-action-terminal]');
      return {
        snapshot,
        receiptText: receiptEl?.textContent?.replace(/\s+/g, ' ').trim() || '',
        receiptType: receiptEl?.getAttribute('data-live-action-receipt-type') || '',
        terminalText: terminalEl?.textContent?.replace(/\s+/g, ' ').trim() || '',
        terminalAttr: terminalEl?.getAttribute('data-live-action-terminal') || '',
        terminalTarget: terminalEl?.getAttribute('data-live-action-terminal-target') || '',
        terminalHpAfter: terminalEl?.getAttribute('data-live-action-terminal-hp-after') || '',
        terminalSource: terminalEl?.getAttribute('data-live-action-terminal-source') || '',
        terminalHidden: terminalEl?.getAttribute('data-live-action-terminal-hidden') || '',
        terminalImpact: terminalEl?.getAttribute('data-live-action-terminal-impact') || '',
        events: document.querySelector('[data-live-event-log]')?.textContent || '',
      };
    });
    const lethalLoserReceiptProbe = await loserClient.page.evaluate(() => {
      const snapshot = window.PVPScene.getLiveSnapshot();
      const terminalEl = document.querySelector('[data-live-action-terminal]');
      return {
        actionReceiptReport: snapshot?.actionReceiptReport || null,
        terminalText: terminalEl?.textContent?.replace(/\s+/g, ' ').trim() || '',
        terminalAttr: terminalEl?.getAttribute('data-live-action-terminal') || '',
        terminalTarget: terminalEl?.getAttribute('data-live-action-terminal-target') || '',
        terminalHpAfter: terminalEl?.getAttribute('data-live-action-terminal-hp-after') || '',
        terminalSource: terminalEl?.getAttribute('data-live-action-terminal-source') || '',
        terminalHidden: terminalEl?.getAttribute('data-live-action-terminal-hidden') || '',
        terminalImpact: terminalEl?.getAttribute('data-live-action-terminal-impact') || '',
      };
    });
    add(
      'real browser protected defender ends the match with a real lethal card after counterplay',
      lethalSetupProbe.before?.currentSeat === activeSecondSeat
        && lethalSetupProbe.targetResponse?.success === true
        && lethalSetupProbe.actorResponse?.success === true
        && lethalSetupProbe.after?.currentSeat === activeSecondSeat
        && lethalSetupProbe.after?.opponent?.hp === 1
        && lethalSetupProbe.after?.opponent?.block === 0
        && lethalSetupProbe.after?.self?.energy >= 1
        && lethalSetupProbe.lethalPreview?.targetSeat === activeFirstSeat
        && Number(lethalSetupProbe.lethalPreview?.hpDamage || 0) > 0
        && Number(lethalSetupProbe.lethalPreview?.targetHpAfter || 0) <= 0
        && lethalConfirmProbe.before?.phase === 'active'
        && (!isMobileViewport || lethalFirstTouchActionable?.ok === true)
        && (!isMobileViewport || !lethalSecondTouchActionable || lethalSecondTouchActionable.ok === true)
        && finishedWinner.phase === 'finished'
        && finishedLoser.phase === 'finished'
        && lethalFinishProbe.snapshot?.postMatchReview?.finishReason === 'lethal'
        && lethalFinishProbe.snapshot?.postMatchReview?.result === 'win'
        && lethalFinishProbe.snapshot?.postMatchReview?.winnerSeat === winnerSeat
        && lethalFinishProbe.snapshot?.postMatchReview?.loserSeat === loserSeat
        && lethalFinishProbe.snapshot?.postMatchReview?.evidence?.some(event => event.eventType === 'damage_applied')
        && lethalFinishProbe.snapshot?.postMatchReview?.evidence?.some(event => event.eventType === 'match_finished')
        && lethalFinishProbe.snapshot?.actionReceiptReport?.damage?.hasTargetHpAfter === true
        && lethalFinishProbe.snapshot?.actionReceiptReport?.damage?.targetSeat === loserSeat
        && lethalFinishProbe.snapshot?.actionReceiptReport?.damage?.targetHpAfter === 0
        && !/player_surrendered|认输/.test(`${lethalFinishProbe.events} ${lethalFinishProbe.snapshot?.postMatchReview?.summary || ''}`),
      JSON.stringify({
        activeFirstSeat,
        activeSecondSeat,
        lethalSetupProbe,
        lethalConfirmProbe,
        lethalFirstTouchActionable,
        lethalSecondTouchActionable,
        finishedWinner,
        finishedLoser,
        lethalFinishProbe,
        lethalLoserReceiptProbe,
      }),
    );
    add(
      'real browser winner sees public terminal damage receipt after real lethal',
      lethalFinishProbe.terminalAttr === 'public_terminal_damage'
        && lethalFinishProbe.terminalTarget === loserSeat
        && lethalFinishProbe.terminalHpAfter === '0'
        && lethalFinishProbe.terminalSource === 'authoritative_public_projection'
        && lethalFinishProbe.terminalHidden === 'false'
        && lethalFinishProbe.terminalImpact === 'none'
        && /终局回执/.test(lethalFinishProbe.terminalText)
        && new RegExp(`${loserSeat}\\s*归零`).test(lethalFinishProbe.terminalText)
        && /公开伤害结算结束本局/.test(lethalFinishProbe.terminalText)
        && !/payload|cardInstanceId|sourceCardId|cardId|instanceId|\bhand\b|hand":\[|deck|loadoutSnapshot|reward|rating|elo|token/i.test(`${lethalFinishProbe.terminalText} ${JSON.stringify(lethalFinishProbe.snapshot?.actionReceiptReport || {})}`),
      JSON.stringify({ loserSeat, winnerSeat, lethalFinishProbe }),
    );
    add(
      'real browser loser sees public terminal damage receipt after real lethal',
      lethalLoserReceiptProbe.actionReceiptReport?.viewerSeat === loserSeat
        && lethalLoserReceiptProbe.actionReceiptReport?.actingSeat === winnerSeat
        && lethalLoserReceiptProbe.actionReceiptReport?.damage?.hasTargetHpAfter === true
        && lethalLoserReceiptProbe.actionReceiptReport?.damage?.targetSeat === loserSeat
        && lethalLoserReceiptProbe.actionReceiptReport?.damage?.targetHpAfter === 0
        && lethalLoserReceiptProbe.terminalAttr === 'public_terminal_damage'
        && lethalLoserReceiptProbe.terminalTarget === loserSeat
        && lethalLoserReceiptProbe.terminalHpAfter === '0'
        && lethalLoserReceiptProbe.terminalSource === 'authoritative_public_projection'
        && lethalLoserReceiptProbe.terminalHidden === 'false'
        && lethalLoserReceiptProbe.terminalImpact === 'none'
        && /终局回执/.test(lethalLoserReceiptProbe.terminalText)
        && new RegExp(`${loserSeat}\\s*归零`).test(lethalLoserReceiptProbe.terminalText)
        && /公开伤害结算结束本局/.test(lethalLoserReceiptProbe.terminalText)
        && !/payload|cardInstanceId|sourceCardId|cardId|instanceId|\bhand\b|hand":\[|deck|loadoutSnapshot|reward|rating|elo|token/i.test(`${lethalLoserReceiptProbe.terminalText} ${JSON.stringify(lethalLoserReceiptProbe.actionReceiptReport || {})}`),
      JSON.stringify({ loserSeat, winnerSeat, lethalLoserReceiptProbe }),
    );
    const postMatchProbe = await loserClient.page.evaluate(() => ({
      text: document.querySelector('[data-live-post-match-review]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      keyTurnText: document.querySelector('[data-live-key-turn-replay]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      keyTurnSource: document.querySelector('[data-live-key-turn-replay]')?.getAttribute('data-live-key-turn-source') || '',
      keyTurnHidden: document.querySelector('[data-live-key-turn-replay]')?.getAttribute('data-live-key-turn-hidden') || '',
      keyTurnCount: document.querySelectorAll('[data-live-key-turn]').length,
      experienceText: document.querySelector('[data-live-experience-report]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      experienceSource: document.querySelector('[data-live-experience-report]')?.getAttribute('data-live-experience-source') || '',
      experienceHidden: document.querySelector('[data-live-experience-report]')?.getAttribute('data-live-experience-hidden') || '',
      effectiveActionProof: document.querySelector('[data-live-effective-action-proof]')?.getAttribute('data-live-effective-action-proof') || '',
      effectiveActionKind: document.querySelector('[data-live-effective-action-proof]')?.getAttribute('data-live-effective-action-kind') || '',
      experienceCheckIds: Array.from(document.querySelectorAll('[data-live-experience-check]')).map(item => item.getAttribute('data-live-experience-check')),
      fairnessText: document.querySelector('[data-live-fairness-receipt]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      fairnessSource: document.querySelector('[data-live-fairness-receipt]')?.getAttribute('data-live-fairness-source') || '',
      fairnessHidden: document.querySelector('[data-live-fairness-receipt]')?.getAttribute('data-live-fairness-hidden') || '',
      fairnessState: document.querySelector('[data-live-fairness-receipt]')?.getAttribute('data-live-fairness-state') || '',
      settlementText: document.querySelector('[data-live-settlement-report]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      settlementSource: document.querySelector('[data-live-settlement-report]')?.getAttribute('data-live-settlement-source') || '',
      settlementHidden: document.querySelector('[data-live-settlement-report]')?.getAttribute('data-live-settlement-hidden') || '',
      seasonHonorText: document.querySelector('[data-live-season-honor]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      seasonHonorPower: document.querySelector('[data-live-season-honor]')?.getAttribute('data-live-season-honor-power') || '',
      seasonHonorRewardText: document.querySelector('[data-live-season-honor-reward]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      seasonHonorRewardImpact: document.querySelector('[data-live-season-honor-reward]')?.getAttribute('data-live-season-honor-reward-impact') || '',
      seasonHonorRewardState: document.querySelector('[data-live-season-honor-reward]')?.getAttribute('data-live-season-honor-reward-state') || '',
      seasonHonorRewardCollection: document.querySelector('[data-live-season-honor-reward]')?.getAttribute('data-live-season-honor-reward-collection') || '',
      reviewActionIds: Array.from(document.querySelectorAll('[data-live-post-review-action]')).map(button => button.getAttribute('data-live-post-review-action')),
      payload: window.PVPScene.getLiveSnapshot()?.postMatchReview || null,
      textPayload: JSON.parse(window.render_game_to_text()).pvp?.live?.postMatchReview || null,
    }));
    const postMatchParity = postMatchProbe.payload && postMatchProbe.textPayload ? {
      result: postMatchProbe.payload.result === postMatchProbe.textPayload.result,
      finishReason: postMatchProbe.payload.finishReason === postMatchProbe.textPayload.finishReason,
      evidence: JSON.stringify((postMatchProbe.payload.evidence || []).map(event => event.eventType)) === JSON.stringify((postMatchProbe.textPayload.evidence || []).map(event => event.eventType)),
      nextActions: JSON.stringify((postMatchProbe.payload.nextActions || []).map(action => action.id)) === JSON.stringify((postMatchProbe.textPayload.nextActions || []).map(action => action.id)),
      keyTurns: JSON.stringify((postMatchProbe.payload.keyTurnReplay?.turns || []).map(event => event.eventType)) === JSON.stringify((postMatchProbe.textPayload.keyTurnReplay?.turns || []).map(event => event.eventType)),
      experienceChecks: JSON.stringify((postMatchProbe.payload.experienceReport?.fairnessChecks || []).map(item => item.id)) === JSON.stringify((postMatchProbe.textPayload.experienceReport?.fairnessChecks || []).map(item => item.id)),
      fairnessReceipt: JSON.stringify((postMatchProbe.payload.fairnessReceipt?.evidenceSummary || []).map(item => item.id)) === JSON.stringify((postMatchProbe.textPayload.fairnessReceipt?.evidenceSummary || []).map(item => item.id)),
    } : null;
    add(
      'real browser live match renders public post-match review after real lethal',
      finishedLoser.phase === 'finished'
        && finishedWinner.phase === 'finished'
        && /复盘/.test(postMatchProbe.text)
        && /正常终局|正常伤害|开局护体后/.test(postMatchProbe.text)
        && /查看权威事件/.test(postMatchProbe.text)
        && postMatchProbe.reviewActionIds.includes('review_key_turns')
        && postMatchProbe.reviewActionIds.includes('friendly_rematch')
        && postMatchProbe.payload?.reportVersion === 'pvp-live-post-match-review-v1'
        && postMatchProbe.payload?.result === 'loss'
        && postMatchProbe.payload?.finishReason === 'lethal'
        && postMatchProbe.payload?.loserSeat === loserSeat
        && postMatchProbe.payload?.winnerSeat === winnerSeat
        && postMatchProbe.payload?.evidence?.some(event => event.eventType === 'damage_applied')
        && postMatchProbe.textPayload?.reportVersion === 'pvp-live-post-match-review-v1'
        && postMatchParity?.result === true
        && postMatchParity?.finishReason === true
        && postMatchParity?.evidence === true
        && postMatchParity?.nextActions === true
        && /正式积分/.test(postMatchProbe.settlementText)
        && /天道币/.test(postMatchProbe.settlementText)
        && postMatchProbe.settlementSource === 'server_authoritative_settlement'
        && postMatchProbe.settlementHidden === 'false'
        && postMatchProbe.payload?.settlementReport?.reportVersion === 'pvp-live-settlement-report-v1'
        && postMatchProbe.payload?.settlementReport?.result === 'loss'
        && postMatchProbe.payload?.settlementReport?.ratingDelta < 0
        && postMatchProbe.payload?.settlementReport?.coinsAwarded > 0
        && postMatchProbe.textPayload?.settlementReport?.reportVersion === 'pvp-live-settlement-report-v1'
        && /赛季荣誉/.test(postMatchProbe.seasonHonorText)
        && /不改变生命、伤害、抽牌、灵力、起手或匹配/.test(postMatchProbe.seasonHonorText)
        && postMatchProbe.seasonHonorPower === 'none'
        && /外观目标/.test(postMatchProbe.seasonHonorRewardText)
        && /收藏状态/.test(postMatchProbe.seasonHonorRewardText)
        && /不授予卡牌、属性、资源、起手、匹配或战斗效果/.test(postMatchProbe.seasonHonorRewardText)
        && postMatchProbe.seasonHonorRewardImpact === 'cosmetic_only'
        && postMatchProbe.seasonHonorRewardState === 'earned'
        && postMatchProbe.seasonHonorRewardCollection === 'newly_unlocked'
        && postMatchProbe.payload?.settlementReport?.seasonHonorReport?.reportVersion === 'pvp-live-season-honor-v1'
        && postMatchProbe.payload?.settlementReport?.seasonHonorReport?.powerImpact === 'none'
        && postMatchProbe.payload?.settlementReport?.seasonHonorReport?.cosmeticReward?.reportVersion === 'pvp-live-season-honor-reward-v1'
        && postMatchProbe.payload?.settlementReport?.seasonHonorReport?.cosmeticReward?.rewardImpact === 'cosmetic_only'
        && postMatchProbe.payload?.settlementReport?.seasonHonorReport?.cosmeticReward?.powerImpact === 'none'
        && postMatchProbe.payload?.settlementReport?.seasonHonorReport?.cosmeticReward?.collectionState === 'newly_unlocked'
        && postMatchProbe.payload?.settlementReport?.seasonHonorReport?.cosmeticReward?.collectionReport?.reportVersion === 'pvp-live-season-honor-collection-v1'
        && postMatchProbe.textPayload?.settlementReport?.seasonHonorReport?.reportVersion === 'pvp-live-season-honor-v1'
        && postMatchProbe.textPayload?.settlementReport?.seasonHonorReport?.cosmeticReward?.reportVersion === 'pvp-live-season-honor-reward-v1',
      JSON.stringify({ winnerSeat, loserSeat, finishedWinner, finishedLoser, postMatchProbe, postMatchParity }),
    );
    if (isMobileViewport) {
      await loserClient.page.evaluate(() => {
        document.querySelector('[data-live-post-match-review]')?.scrollIntoView({ block: 'start', inline: 'nearest' });
      });
      await loserClient.page.waitForTimeout(180);
      const mobileRealLayoutProbe = await loserClient.page.evaluate(() => {
        const toRect = (el) => {
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return {
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        };
        const toBoxMetrics = (el) => {
          if (!el) return null;
          return {
            scrollWidth: Math.round(el.scrollWidth || 0),
            clientWidth: Math.round(el.clientWidth || 0),
            scrollHeight: Math.round(el.scrollHeight || 0),
            clientHeight: Math.round(el.clientHeight || 0),
          };
        };
        const horizontallyInside = (rect) => !!rect
          && rect.width > 0
          && rect.left >= 0
          && rect.right <= window.innerWidth + 2;
        const root = document.querySelector('[data-live-pvp-root]');
        const review = document.querySelector('[data-live-post-match-review]');
        const fairness = document.querySelector('[data-live-fairness-receipt]');
        const settlement = document.querySelector('[data-live-settlement-report]');
        const honor = document.querySelector('[data-live-season-honor]');
        const honorReward = document.querySelector('[data-live-season-honor-reward]');
        const actionButtons = Array.from(document.querySelectorAll('[data-live-post-review-action]'));
        const textBlocks = Array.from(document.querySelectorAll([
          '[data-live-fairness-receipt]',
          '[data-live-settlement-report]',
          '[data-live-season-honor]',
          '[data-live-season-honor-reward]',
          '.pvp-live-season-honor-reward-collection',
          '.pvp-live-season-honor-reward-progress',
          '.pvp-live-season-honor-reward-next',
          '.pvp-live-season-honor-reward-boundary',
        ].join(',')));
        const buttonHitChecks = actionButtons.map((button) => {
          button.scrollIntoView({ block: 'center', inline: 'nearest' });
          const rect = button.getBoundingClientRect();
          const x = Math.min(window.innerWidth - 1, Math.max(1, rect.left + rect.width / 2));
          const y = Math.min(window.innerHeight - 1, Math.max(1, rect.top + rect.height / 2));
          const hit = document.elementFromPoint(x, y);
          return {
            id: button.getAttribute('data-live-post-review-action') || '',
            rect: toRect(button),
            topHit: hit === button || button.contains(hit),
            hitTag: hit?.tagName || '',
            hitText: hit?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 40) || '',
          };
        });
        const allLiveRects = Array.from(document.querySelectorAll('[data-live-post-match-review], [data-live-fairness-receipt], [data-live-settlement-report], [data-live-season-honor], [data-live-season-honor-reward], [data-live-key-turn-replay], [data-live-experience-report], [data-live-post-review-action]'))
          .map((el) => ({ marker: el.getAttribute('data-live-post-review-action') || el.getAttribute('class') || el.tagName, rect: toRect(el) }));
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          root: toRect(root),
          review: toRect(review),
          fairness: toRect(fairness),
          settlement: toRect(settlement),
          honor: toRect(honor),
          honorReward: toRect(honorReward),
          bodyScrollWidth: document.scrollingElement?.scrollWidth || document.documentElement.scrollWidth || 0,
          reviewText: review?.textContent?.replace(/\s+/g, ' ').trim() || '',
          fairnessText: fairness?.textContent?.replace(/\s+/g, ' ').trim() || '',
          settlementText: settlement?.textContent?.replace(/\s+/g, ' ').trim() || '',
          honorText: honor?.textContent?.replace(/\s+/g, ' ').trim() || '',
          honorRewardText: honorReward?.textContent?.replace(/\s+/g, ' ').trim() || '',
          actionIds: actionButtons.map(button => button.getAttribute('data-live-post-review-action') || ''),
          reviewBox: toBoxMetrics(review),
          textBlockBoxes: textBlocks.map(el => ({
            marker: el.getAttribute('data-live-post-review-action') || el.getAttribute('class') || el.tagName,
            rect: toRect(el),
            box: toBoxMetrics(el),
          })),
          buttonHitChecks,
          horizontallyInside: {
            root: horizontallyInside(toRect(root)),
            review: horizontallyInside(toRect(review)),
            fairness: horizontallyInside(toRect(fairness)),
            settlement: horizontallyInside(toRect(settlement)),
            honor: horizontallyInside(toRect(honor)),
            honorReward: horizontallyInside(toRect(honorReward)),
            allLiveRects: allLiveRects.every(item => horizontallyInside(item.rect)),
          },
          noVerticalClip: !!review && review.scrollHeight <= review.clientHeight + 1,
          textBlocksDoNotOverflow: textBlocks.every(el => (el.scrollWidth || 0) <= (el.clientWidth || 0) + 1),
          allLiveRects,
        };
      });
      add(
        'real mobile browser live post-match settlement and honor collection stay readable and tappable',
        mobileRealLayoutProbe.viewport?.width === 390
          && mobileRealLayoutProbe.bodyScrollWidth <= mobileRealLayoutProbe.viewport.width + 2
          && mobileRealLayoutProbe.horizontallyInside?.root === true
          && mobileRealLayoutProbe.horizontallyInside?.review === true
          && mobileRealLayoutProbe.horizontallyInside?.fairness === true
          && mobileRealLayoutProbe.horizontallyInside?.settlement === true
          && mobileRealLayoutProbe.horizontallyInside?.honor === true
          && mobileRealLayoutProbe.horizontallyInside?.honorReward === true
          && mobileRealLayoutProbe.horizontallyInside?.allLiveRects === true
          && mobileRealLayoutProbe.noVerticalClip === true
          && mobileRealLayoutProbe.textBlocksDoNotOverflow === true
          && /复盘/.test(mobileRealLayoutProbe.reviewText)
          && /公平回执|首动预算/.test(mobileRealLayoutProbe.fairnessText)
          && /正式积分/.test(mobileRealLayoutProbe.settlementText)
          && /赛季荣誉/.test(mobileRealLayoutProbe.honorText)
          && /收藏状态/.test(mobileRealLayoutProbe.honorRewardText)
          && mobileRealLayoutProbe.actionIds.includes('review_key_turns')
          && mobileRealLayoutProbe.actionIds.includes('friendly_rematch')
          && mobileRealLayoutProbe.buttonHitChecks.length >= 3
          && mobileRealLayoutProbe.buttonHitChecks.every(item => item.topHit === true && item.rect?.left >= 0 && item.rect?.right <= mobileRealLayoutProbe.viewport.width + 2),
        JSON.stringify(mobileRealLayoutProbe),
      );
    }
    const publicReplayProbe = await requestLivePvpReplay(loserClient.page, finishedLoser.matchId, { visibility: 'replay_public' });
    publicReplayProbe.hasForbiddenReport = /postMatchReview|fairnessReceipt|settlementReport|seasonHonorReport|cosmeticReward|seasonHonorCollection|collectionState|viewerSeat/.test(JSON.stringify(publicReplayProbe.replay || {}));
    const auditSafeReplayProbe = await requestLivePvpReplay(loserClient.page, finishedLoser.matchId, { visibility: 'audit_safe' });
    auditSafeReplayProbe.hasForbiddenReport = /postMatchReview|fairnessReceipt|settlementReport|seasonHonorReport|cosmeticReward|seasonHonorCollection|collectionState|viewerSeat/.test(JSON.stringify(auditSafeReplayProbe.replay || {}));
    add(
      'real browser replay_public hides seat-specific settlement and season honor reports',
      publicReplayProbe?.success === true
        && publicReplayProbe.replay?.visibilityLayer === 'replay_public'
        && publicReplayProbe.replay?.publicSummary?.finishReason === 'lethal'
        && publicReplayProbe.replay?.hiddenScan?.forbiddenTokenCount === 0
        && !publicReplayProbe.replay?.postMatchReview
        && !publicReplayProbe.replay?.fairnessReceipt
        && !publicReplayProbe.replay?.settlementReport
        && !publicReplayProbe.replay?.seasonHonorReport
        && !publicReplayProbe.replay?.cosmeticReward
        && !publicReplayProbe.replay?.seasonHonorCollection
        && !publicReplayProbe.replay?.viewerSeat
        && publicReplayProbe.hasForbiddenReport === false,
      JSON.stringify(publicReplayProbe),
    );
    add(
      'real browser audit_safe replay hides seat-specific settlement and season honor reports',
      auditSafeReplayProbe?.success === true
        && auditSafeReplayProbe.replay?.visibilityLayer === 'audit_safe'
        && auditSafeReplayProbe.replay?.sourceVisibilityLayer === 'replay_public'
        && auditSafeReplayProbe.replay?.publicSummary?.finishReason === 'lethal'
        && auditSafeReplayProbe.replay?.hiddenScan?.forbiddenTokenCount === 0
        && Array.isArray(auditSafeReplayProbe.replay?.fieldPaths)
        && auditSafeReplayProbe.replay?.fieldPaths.length > 0
        && !auditSafeReplayProbe.replay?.postMatchReview
        && !auditSafeReplayProbe.replay?.fairnessReceipt
        && !auditSafeReplayProbe.replay?.settlementReport
        && !auditSafeReplayProbe.replay?.seasonHonorReport
        && !auditSafeReplayProbe.replay?.cosmeticReward
        && !auditSafeReplayProbe.replay?.seasonHonorCollection
        && !auditSafeReplayProbe.replay?.viewerSeat
        && auditSafeReplayProbe.hasForbiddenReport === false,
      JSON.stringify(auditSafeReplayProbe),
    );
    add(
      'real browser live match renders fairness receipt from public post-match checks',
      /公平回执|先手秒杀|首动预算|行动窗口|反打|有效行动/.test(postMatchProbe.fairnessText)
        && postMatchProbe.fairnessSource === 'public_events'
        && postMatchProbe.fairnessHidden === 'false'
        && ['accepted', 'watch'].includes(postMatchProbe.fairnessState)
        && postMatchProbe.payload?.fairnessReceipt?.reportVersion === 'pvp-live-fairness-receipt-v1'
        && postMatchProbe.payload?.fairnessReceipt?.sourceVisibility === 'public_events'
        && postMatchProbe.payload?.fairnessReceipt?.usesHiddenInformation === false
        && postMatchProbe.payload?.fairnessReceipt?.rankedImpact === 'none'
        && postMatchProbe.payload?.fairnessReceipt?.result === 'loss'
        && postMatchProbe.payload?.fairnessReceipt?.finishReason === 'lethal'
        && /有效行动|稳住破绽/.test(postMatchProbe.payload?.fairnessReceipt?.effectiveActionVerdict || '')
        && /稳住破绽/.test(postMatchProbe.payload?.fairnessReceipt?.effectiveActionVerdict || '')
        && (postMatchProbe.payload?.fairnessReceipt?.evidenceSummary || []).length >= 3
        && (postMatchProbe.payload?.fairnessReceipt?.evidenceSummary || []).some(item => item.id === 'second_seat_effective_action')
        && postMatchParity?.fairnessReceipt === true
        && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(`${postMatchProbe.fairnessText} ${JSON.stringify(postMatchProbe.payload?.fairnessReceipt || {})}`),
      JSON.stringify({ winnerSeat, loserSeat, finishedWinner, finishedLoser, postMatchProbe, postMatchParity }),
    );
    add(
      'real browser live match renders key-turn replay from public post-match events',
      /关键回合|开战窗口|终局选择/.test(postMatchProbe.keyTurnText)
        && postMatchProbe.keyTurnSource === 'public_events'
        && postMatchProbe.keyTurnHidden === 'false'
        && postMatchProbe.keyTurnCount >= 2
        && postMatchProbe.payload?.keyTurnReplay?.reportVersion === 'pvp-live-key-turn-replay-v1'
        && postMatchProbe.payload?.keyTurnReplay?.sourceVisibility === 'public_events'
        && postMatchProbe.payload?.keyTurnReplay?.usesHiddenInformation === false
        && postMatchProbe.payload?.keyTurnReplay?.rankedImpact === 'none'
        && (postMatchProbe.payload?.keyTurnReplay?.turns || []).some(turn => turn.eventType === 'battle_started')
        && (postMatchProbe.payload?.keyTurnReplay?.turns || []).some(turn => turn.eventType === 'match_finished' || turn.eventType === 'player_surrendered')
        && postMatchParity?.keyTurns === true
        && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot/i.test(JSON.stringify(postMatchProbe.payload?.keyTurnReplay || {})),
      JSON.stringify({ winnerSeat, loserSeat, finishedWinner, finishedLoser, postMatchProbe, postMatchParity }),
    );
    add(
      'real browser live match renders experience report from public post-match events',
      /双方体验诊断|公开|窗口|稳住破绽/.test(postMatchProbe.experienceText)
        && postMatchProbe.experienceSource === 'public_events'
        && postMatchProbe.experienceHidden === 'false'
        && postMatchProbe.effectiveActionProof === 'status_mitigated'
        && postMatchProbe.effectiveActionKind === 'status_mitigated'
        && ['setup_ready_required', 'first_action_budget', 'opening_protection', 'decision_windows', 'second_seat_effective_action'].every(id => postMatchProbe.experienceCheckIds.includes(id))
        && postMatchProbe.payload?.experienceReport?.reportVersion === 'pvp-live-experience-report-v1'
        && postMatchProbe.payload?.experienceReport?.sourceVisibility === 'public_events'
        && postMatchProbe.payload?.experienceReport?.usesHiddenInformation === false
        && postMatchProbe.payload?.experienceReport?.rankedImpact === 'none'
        && ['low', 'watch'].includes(postMatchProbe.payload?.experienceReport?.nonGameRisk)
        && postMatchProbe.payload?.experienceReport?.decisionWindowCount >= 1
        && postMatchProbe.payload?.experienceReport?.seatWindowSummary?.firstSeat
        && postMatchProbe.payload?.experienceReport?.effectiveActionReport?.reportVersion === 'pvp-live-effective-action-report-v1'
        && ['confirmed', 'watch', 'missing_window'].includes(postMatchProbe.payload?.experienceReport?.effectiveActionReport?.secondSeatState)
        && postMatchProbe.payload?.experienceReport?.effectiveActionReport?.observedActionKinds?.includes('status_mitigated')
        && /稳住破绽/.test(postMatchProbe.payload?.experienceReport?.effectiveActionReport?.primaryActionLabel || '')
        && ['confirmed', 'watch', 'missing_window'].includes(postMatchProbe.payload?.experienceReport?.safeguardSummary?.effectiveAction)
        && postMatchProbe.payload?.experienceReport?.safeguardSummary?.setupReady === 'confirmed'
        && (postMatchProbe.payload?.experienceReport?.fairnessChecks || []).every(item => Array.isArray(item.linkedEvidence) && item.linkedEvidence.length >= 1)
        && postMatchParity?.experienceChecks === true
        && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(JSON.stringify(postMatchProbe.payload?.experienceReport || {})),
      JSON.stringify({ winnerSeat, loserSeat, finishedWinner, finishedLoser, postMatchProbe, postMatchParity }),
    );

    const postActionProbe = await loserClient.page.evaluate(async () => {
      document.querySelector('[data-live-experience-check="decision_windows"]')?.click();
      await new Promise(resolve => setTimeout(resolve, 100));
      const experienceFocus = {
        hint: document.querySelector('[data-live-last-error]')?.textContent || '',
        eventsPanelFocused: document.querySelector('[data-live-event-panel]')?.getAttribute('data-live-review-focus') || '',
        checkFocused: document.querySelector('[data-live-experience-check="decision_windows"]')?.getAttribute('data-live-review-focus') || '',
        focusedEvents: document.querySelector('[data-live-event-log]')?.textContent || '',
        eventTypes: Array.from(document.querySelectorAll('[data-live-event-type]')).map(item => item.getAttribute('data-live-event-type')),
        payload: window.PVPScene.getLiveSnapshot()?.postMatchReview?.experienceReport || null,
      };
      document.querySelector('[data-live-post-review-action="review_key_turns"]')?.click();
      await new Promise(resolve => setTimeout(resolve, 100));
      const keyTurnFocus = {
        hint: document.querySelector('[data-live-last-error]')?.textContent || '',
        eventsPanelFocused: document.querySelector('[data-live-event-panel]')?.getAttribute('data-live-review-focus') || '',
        keyTurnFocused: document.querySelector('[data-live-key-turn-replay]')?.getAttribute('data-live-review-focus') || '',
        focusedEvents: document.querySelector('[data-live-event-log]')?.textContent || '',
        payload: window.PVPScene.getLiveSnapshot()?.postMatchReview?.keyTurnReplay || null,
      };
      document.querySelector('[data-live-post-review-action="review_events"]')?.click();
      document.querySelector('[data-live-post-review-action="adjust_loadout"]')?.click();
      document.querySelector('[data-live-loadout-preset="balanced"]')?.click();
      const queueLoadoutResolution = window.PVPScene.resolveLivePostReviewLoadoutPreset('queue_again');
      const rematchLoadoutResolution = window.PVPScene.resolveLivePostReviewLoadoutPreset('friendly_rematch');
      const practiceLoadoutResolution = window.PVPScene.resolveLivePostReviewLoadoutPreset('practice');
      document.querySelector('[data-live-post-review-action="practice"]')?.click();
      await new Promise(resolve => setTimeout(resolve, 450));
      const payload = typeof window.render_game_to_text === 'function'
        ? JSON.parse(window.render_game_to_text())
        : null;
      return {
        currentScreen: window.game?.currentScreen || '',
        tab: window.game?.challengeHubState?.tab || '',
        pending: payload?.challenge?.pending || null,
        phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
        hint: document.querySelector('[data-live-last-error]')?.textContent || '',
        eventsPanelFocused: document.querySelector('[data-live-event-panel]')?.getAttribute('data-live-review-focus') || '',
        focusedEvents: document.querySelector('[data-live-event-log]')?.textContent || '',
        selectedLoadout: document.querySelector('[data-live-selected-loadout]')?.textContent || '',
        loadoutDisabled: Array.from(document.querySelectorAll('[data-live-loadout-preset]')).map(button => button.disabled),
        focus: payload?.challenge?.trainingFocus || null,
        bannerText: document.getElementById('challenge-selection-banner')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        insightText: document.querySelector('#challenge-selection-banner .challenge-record-insight')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        confirmText: document.querySelector('#confirm-character-btn .btn-text')?.textContent?.trim() || '',
        drillScenario: payload?.pvp?.live?.drillScenario || window.PVPScene.getLiveSnapshot()?.drillScenario || null,
        queueLoadoutResolution,
        rematchLoadoutResolution,
        practiceLoadoutResolution,
        experienceFocus,
        keyTurnFocus,
      };
    });
    add(
      'real browser experience check focuses linked public evidence without hidden payloads',
      postActionProbe.experienceFocus?.eventsPanelFocused === 'experience_check:decision_windows'
        && postActionProbe.experienceFocus?.checkFocused === 'experience_check:decision_windows'
        && /体验诊断证据/.test(postActionProbe.experienceFocus?.hint || '')
        && /开战/.test(postActionProbe.experienceFocus?.focusedEvents || '')
        && (postActionProbe.experienceFocus?.eventTypes || []).includes('battle_started')
        && (postActionProbe.experienceFocus?.payload?.fairnessChecks || []).some(item => item.id === 'decision_windows' && (item.linkedEvidence || []).some(event => event.eventType === 'battle_started'))
        && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(JSON.stringify(postActionProbe.experienceFocus?.payload || {})),
      JSON.stringify(postActionProbe.experienceFocus),
    );
    add(
      'real browser post-match loadout resolution keeps manual formal candidate while practice uses public recommendation',
      postActionProbe.queueLoadoutResolution?.reportVersion === 'pvp-live-post-review-loadout-resolution-v1'
        && postActionProbe.queueLoadoutResolution?.presetId === 'balanced'
        && postActionProbe.queueLoadoutResolution?.source === 'manual_candidate_override'
        && postActionProbe.queueLoadoutResolution?.sourceVisibility === 'local_candidate'
        && postActionProbe.queueLoadoutResolution?.recommendationVisibility === 'public_events_and_public_content'
        && postActionProbe.queueLoadoutResolution?.rankedImpact === 'candidate_only'
        && postActionProbe.rematchLoadoutResolution?.presetId === 'balanced'
        && postActionProbe.rematchLoadoutResolution?.source === 'manual_candidate_override'
        && postActionProbe.rematchLoadoutResolution?.sourceVisibility === 'local_candidate'
        && postActionProbe.rematchLoadoutResolution?.rankedImpact === 'candidate_only'
        && postActionProbe.practiceLoadoutResolution?.presetId === 'shield'
        && postActionProbe.practiceLoadoutResolution?.source === 'public_recommendation_practice'
        && postActionProbe.practiceLoadoutResolution?.sourceVisibility === 'public_events_and_public_content'
        && postActionProbe.practiceLoadoutResolution?.rankedImpact === 'none'
        && postActionProbe.drillScenario?.recommendedLoadoutId === postActionProbe.practiceLoadoutResolution?.presetId
        && [postActionProbe.queueLoadoutResolution, postActionProbe.rematchLoadoutResolution, postActionProbe.practiceLoadoutResolution].every(item => item?.usesHiddenInformation === false)
        && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(JSON.stringify({
          queue: postActionProbe.queueLoadoutResolution,
          rematch: postActionProbe.rematchLoadoutResolution,
          practice: postActionProbe.practiceLoadoutResolution,
        })),
      JSON.stringify({
        queueLoadoutResolution: postActionProbe.queueLoadoutResolution,
        rematchLoadoutResolution: postActionProbe.rematchLoadoutResolution,
        practiceLoadoutResolution: postActionProbe.practiceLoadoutResolution,
        drillScenario: postActionProbe.drillScenario,
      }),
    );
    add(
      'real browser post-match review actions focus events, unlock loadout, and create replay-only no-score drill handoff',
      postActionProbe.phase === 'finished'
        && postActionProbe.currentScreen === 'character-selection-screen'
        && postActionProbe.pending?.replayOnly === true
        && postActionProbe.pending?.practiceOnly === true
        && /^pvp_live_drill_/.test(postActionProbe.pending?.ruleId || '')
        && /^PVP-/.test(postActionProbe.pending?.seedSignature || '')
        && /events/.test(postActionProbe.eventsPanelFocused)
        && /开战/.test(postActionProbe.focusedEvents)
        && /对局结束/.test(postActionProbe.focusedEvents)
        && /默认斗法谱/.test(postActionProbe.selectedLoadout)
        && postActionProbe.loadoutDisabled.every(value => value === false)
        && postActionProbe.focus?.sourceRunId === `pvp_live:${finishedLoser.matchId}`
        && /真人 PVP|首败|复盘/.test(postActionProbe.focus?.trainingAdvice || '')
        && /真人 PVP|问道练习|不计/.test(postActionProbe.bannerText || '')
        && /公开事件|不写正式积分|隐藏/.test(postActionProbe.insightText || '')
        && /回放命盘/.test(postActionProbe.confirmText || '')
        && postActionProbe.drillScenario?.reportVersion === 'pvp-live-drill-scenario-v1'
        && postActionProbe.drillScenario?.sourceMatchId === finishedLoser.matchId
        && postActionProbe.drillScenario?.sourceVisibility === 'replay_self'
        && postActionProbe.drillScenario?.usesHiddenInformation === false
        && postActionProbe.drillScenario?.rankedImpact === 'none'
        && postActionProbe.drillScenario?.practicePlan?.reportVersion === 'pvp-live-practice-plan-v1'
        && postActionProbe.drillScenario?.practicePlan?.sourceVisibility === 'public_events'
        && postActionProbe.drillScenario?.practicePlan?.usesHiddenInformation === false
        && postActionProbe.drillScenario?.practicePlan?.rankedImpact === 'none'
        && !/payload|hand|deck|cardId|instanceId|cardInstanceId|loadoutSnapshot|rawPayload|token/i.test(JSON.stringify(postActionProbe.drillScenario?.practicePlan || {}))
        && /关键回合/.test(postActionProbe.keyTurnFocus?.hint || '')
        && postActionProbe.keyTurnFocus?.eventsPanelFocused === 'key_turns'
        && postActionProbe.keyTurnFocus?.keyTurnFocused === 'key_turns'
        && /开战|伤害|护体|对局结束/.test(postActionProbe.keyTurnFocus?.focusedEvents || '')
        && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot/i.test(JSON.stringify(postActionProbe.keyTurnFocus?.payload || {})),
      JSON.stringify(postActionProbe),
    );

    await loserClient.page.reload({ waitUntil: 'domcontentloaded' });
    await loserClient.page.waitForFunction(
      () => !!window.game && !!window.PVPScene && typeof window.render_game_to_text === 'function',
      null,
      { timeout: 15000 },
    );
    await loserClient.page.evaluate(async () => {
      window.game.showScreen('pvp-screen');
      window.PVPScene.activeTab = 'live';
      document.querySelectorAll('.rune-tab').forEach(btn => btn.classList.remove('active'));
      document.querySelector('.rune-tab[onclick*="live"]')?.classList.add('active');
      document.querySelectorAll('.pvp-tab-pane').forEach(el => {
        el.classList.remove('active');
        el.style.display = '';
      });
      document.getElementById('tab-live')?.classList.add('active');
      await window.PVPScene.loadLivePanel();
    });
    await dismissBlockingModals(loserClient.page);
    const restoredPostMatch = await waitForLivePhase(loserClient.page, 'finished');
    const reloadPostMatchProbe = await loserClient.page.evaluate(() => ({
      phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
      reviewText: document.querySelector('[data-live-post-match-review]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      payload: window.PVPScene.getLiveSnapshot()?.postMatchReview || null,
      textPayload: JSON.parse(window.render_game_to_text()).pvp?.live?.postMatchReview || null,
      storedMatchIds: Object.keys(localStorage)
        .filter(key => key === 'theDefierPvpLiveLastTerminalMatchV1' || key.startsWith('theDefierPvpLiveLastTerminalMatchV1:'))
        .map(key => localStorage.getItem(key) || ''),
    }));
    add(
      'real browser post-match review survives full page refresh through stored terminal match id',
      restoredPostMatch.phase === 'finished'
        && restoredPostMatch.matchId === finishedLoser.matchId
        && reloadPostMatchProbe.phase === 'finished'
        && reloadPostMatchProbe.storedMatchIds.includes(finishedLoser.matchId)
        && /复盘/.test(reloadPostMatchProbe.reviewText)
        && /查看权威事件/.test(reloadPostMatchProbe.reviewText)
        && reloadPostMatchProbe.payload?.reportVersion === 'pvp-live-post-match-review-v1'
        && reloadPostMatchProbe.textPayload?.reportVersion === 'pvp-live-post-match-review-v1',
      JSON.stringify({ restoredPostMatch, reloadPostMatchProbe }),
    );

    const loserFriendlyRematchActionable = await clickLiveControl(loserClient.page, '[data-live-post-review-action="friendly_rematch"]', `${seatSlug(loserSeat)}-friendly-rematch`);
    await loserClient.page.waitForTimeout(200);
    const friendlyRematchProbe = await loserClient.page.evaluate(() => ({
      phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
      hint: document.querySelector('[data-live-last-error]')?.textContent || '',
      friendlyText: document.querySelector('[data-live-friendly-series]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      snapshot: window.PVPScene.getLiveSnapshot()?.friendlySeries || null,
    }));
    add(
      'real browser post-match friendly rematch waits for same opponent without formal settlement',
      friendlyRematchProbe.phase === 'waiting_rematch'
        && /等待本局对手确认/.test(friendlyRematchProbe.hint)
        && /换边再战/.test(friendlyRematchProbe.friendlyText)
        && /不写正式积分/.test(friendlyRematchProbe.friendlyText)
        && friendlyRematchProbe.snapshot?.reportVersion === 'pvp-live-friendly-series-v1'
        && friendlyRematchProbe.snapshot?.sourceMatchId === finishedLoser.matchId
        && (!isMobileViewport || loserFriendlyRematchActionable?.ok === true)
        && friendlyRematchProbe.snapshot?.rankedImpact === 'none',
      JSON.stringify({ friendlyRematchProbe, loserFriendlyRematchActionable }),
    );
    const waitingRematchReloadPage = await loserClient.context.newPage();
    waitingRematchReloadPage.on('console', msg => {
      if (msg.type() === 'error') recordConsoleError(msg.text());
    });
    waitingRematchReloadPage.on('pageerror', error => recordConsoleError(error.message || String(error)));
    await waitingRematchReloadPage.goto(appUrl, { waitUntil: 'domcontentloaded' });
    await reloadAndOpenLivePanel(waitingRematchReloadPage);
    await waitForLiveSnapshot(waitingRematchReloadPage, () => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.() || null;
      return snapshot?.phase === 'waiting_rematch';
    }, null, 15000);
    const waitingRematchReloadProbe = await waitingRematchReloadPage.evaluate(() => {
      const series = document.querySelector('[data-live-friendly-series]');
      const actions = Object.fromEntries(Array.from(document.querySelectorAll('[data-live-post-review-action]')).map(button => [button.getAttribute('data-live-post-review-action'), button.disabled]));
      const snapshot = window.PVPScene.getLiveSnapshot() || null;
      const textPayload = JSON.parse(window.render_game_to_text()).pvp?.live || null;
      return {
        phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
        hint: document.querySelector('[data-live-last-error]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        friendlyText: series?.textContent?.replace(/\s+/g, ' ').trim() || '',
        status: series?.getAttribute('data-live-friendly-series-status') || '',
        sourceMatch: series?.getAttribute('data-live-friendly-series-source-match') || '',
        confirmationCount: series?.getAttribute('data-live-friendly-series-confirmations') || '',
        cancelVisible: !!document.querySelector('[data-live-action="cancel-rematch"]:not([hidden])'),
        actions,
        snapshot,
        textPayload,
      };
    });
    await waitingRematchReloadPage.close();
    const waitingRematchReloadVisiblePayload = JSON.stringify({
      phase: waitingRematchReloadProbe.phase,
      hint: waitingRematchReloadProbe.hint,
      friendlyText: waitingRematchReloadProbe.friendlyText,
      status: waitingRematchReloadProbe.status,
      sourceMatch: waitingRematchReloadProbe.sourceMatch,
      confirmationCount: waitingRematchReloadProbe.confirmationCount,
      actions: waitingRematchReloadProbe.actions,
      textPhase: waitingRematchReloadProbe.textPayload?.phase || '',
      textFriendlySeries: waitingRematchReloadProbe.textPayload?.friendlySeries || null,
    });
    add(
      'real browser waiting friendly rematch survives full page refresh before opponent accepts',
      waitingRematchReloadProbe.phase === 'waiting_rematch'
        && waitingRematchReloadProbe.snapshot?.phase === 'waiting_rematch'
        && waitingRematchReloadProbe.snapshot?.matchId === finishedLoser.matchId
        && waitingRematchReloadProbe.snapshot?.friendlySeries?.reportVersion === 'pvp-live-friendly-series-v1'
        && waitingRematchReloadProbe.snapshot?.friendlySeries?.sourceMatchId === finishedLoser.matchId
        && waitingRematchReloadProbe.snapshot?.friendlySeries?.rankedImpact === 'none'
        && waitingRematchReloadProbe.status === 'waiting_rematch'
        && waitingRematchReloadProbe.sourceMatch === finishedLoser.matchId
        && waitingRematchReloadProbe.confirmationCount === '1'
        && waitingRematchReloadProbe.cancelVisible === true
        && waitingRematchReloadProbe.actions?.queue_again === true
        && waitingRematchReloadProbe.actions?.practice === true
        && waitingRematchReloadProbe.actions?.friendly_rematch === true
        && /等待本局对手确认/.test(waitingRematchReloadProbe.hint)
        && /换边再战/.test(waitingRematchReloadProbe.friendlyText)
        && /不写正式积分/.test(waitingRematchReloadProbe.friendlyText)
        && waitingRematchReloadProbe.textPayload?.phase === 'waiting_rematch'
        && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket|"rating":|"elo":/i.test(waitingRematchReloadVisiblePayload),
      JSON.stringify({ friendlyRematchProbe, waitingRematchReloadProbe }),
    );
    await dismissBlockingModals(loserClient.page);
    const loserCancelRematchActionable = await clickLiveControl(loserClient.page, '[data-live-action="cancel-rematch"]:not([hidden])', `${seatSlug(loserSeat)}-cancel-friendly-rematch`);
    await loserClient.page.waitForTimeout(300);
    await loserClient.page.evaluate(async () => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.() || null;
      const cancelButtonVisible = !!document.querySelector('[data-live-action="cancel-rematch"]:not([hidden])');
      if (snapshot?.phase === 'waiting_rematch' && cancelButtonVisible && typeof window.PVPScene?.cancelLiveRematch === 'function') {
        await window.PVPScene.cancelLiveRematch();
      }
    });
    await waitForLiveSnapshot(loserClient.page, () => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.() || null;
      const rootPhase = document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '';
      const series = document.querySelector('[data-live-friendly-series]');
      return snapshot?.phase === 'finished'
        && rootPhase === 'finished'
        && series?.getAttribute('data-live-friendly-series-status') === 'cancelled'
        && !document.querySelector('[data-live-action="cancel-rematch"]:not([hidden])');
    }, null, 15000);
    const cancelledRematchProbe = await loserClient.page.evaluate(() => {
      const series = document.querySelector('[data-live-friendly-series]');
      const actions = Object.fromEntries(Array.from(document.querySelectorAll('[data-live-post-review-action]')).map(button => [button.getAttribute('data-live-post-review-action'), button.disabled]));
      return {
        phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
        hint: document.querySelector('[data-live-last-error]')?.textContent || '',
        reviewText: document.querySelector('[data-live-post-match-review]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        status: series?.getAttribute('data-live-friendly-series-status') || '',
        seriesText: series?.textContent?.replace(/\s+/g, ' ').trim() || '',
        cancelVisible: !!document.querySelector('[data-live-action="cancel-rematch"]:not([hidden])'),
        actions,
        snapshot: window.PVPScene?.getLiveSnapshot?.()?.friendlySeries || null,
      };
    });
    add(
      'real browser waiting friendly rematch requester can cancel and restore finished review',
      cancelledRematchProbe.phase === 'finished'
        && /已取消低压力再战|rematch_cancelled/.test(cancelledRematchProbe.hint)
        && /复盘/.test(cancelledRematchProbe.reviewText)
        && cancelledRematchProbe.status === 'cancelled'
        && /等待已取消/.test(cancelledRematchProbe.seriesText)
        && !/系列进行中/.test(cancelledRematchProbe.seriesText)
        && cancelledRematchProbe.cancelVisible === false
        && cancelledRematchProbe.actions?.friendly_rematch === false
        && cancelledRematchProbe.actions?.queue_again === false
        && cancelledRematchProbe.snapshot?.rankedImpact === 'none'
        && (!isMobileViewport || loserCancelRematchActionable?.ok === true),
      JSON.stringify({ cancelledRematchProbe, loserCancelRematchActionable }),
    );

    await dismissBlockingModals(loserClient.page);
    const loserRematchAfterCancelActionable = await clickLiveControl(loserClient.page, '[data-live-post-review-action="friendly_rematch"]', `${seatSlug(loserSeat)}-friendly-rematch-after-cancel`);
    await loserClient.page.waitForTimeout(500);
    const rematchRetryProbe = await loserClient.page.evaluate(() => {
      const sessionState = window.PVPScene?.getLiveSession?.()?.getState?.() || null;
      const snapshot = window.PVPScene?.getLiveSnapshot?.() || null;
      const series = document.querySelector('[data-live-friendly-series]');
      return {
        phase: snapshot?.phase || '',
        sessionPhase: sessionState?.phase || '',
        hint: document.querySelector('[data-live-last-error]')?.textContent || '',
        rootPhase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
        status: series?.getAttribute('data-live-friendly-series-status') || '',
        confirmationCount: series?.getAttribute('data-live-friendly-series-confirmations') || '',
        snapshot: snapshot?.friendlySeries || null,
        lastError: sessionState?.lastError || null,
        actionDisabled: document.querySelector('[data-live-post-review-action="friendly_rematch"]')?.disabled ?? null,
      };
    });
    add(
      'real browser cancelled friendly rematch can be requested again through UI',
      rematchRetryProbe.phase === 'waiting_rematch'
        && rematchRetryProbe.sessionPhase === 'waiting_rematch'
        && rematchRetryProbe.rootPhase === 'waiting_rematch'
        && rematchRetryProbe.status === 'waiting_rematch'
        && rematchRetryProbe.confirmationCount === '1'
        && /等待本局对手确认/.test(rematchRetryProbe.hint)
        && (!isMobileViewport || loserRematchAfterCancelActionable?.ok === true),
      JSON.stringify({ rematchRetryProbe, loserRematchAfterCancelActionable }),
    );
    if (rematchRetryProbe.phase !== 'waiting_rematch') {
      throw new Error(`friendly rematch retry did not enter waiting_rematch: ${JSON.stringify(rematchRetryProbe)}`);
    }
    await clickLiveControl(winnerClient.page, '[data-live-post-review-action="friendly_rematch"]', `${seatSlug(winnerSeat)}-friendly-rematch`);
    await loserClient.page.waitForFunction(() => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.();
      return snapshot?.phase === 'setup' && snapshot?.mode === 'friendly';
    }, null, { timeout: 8000 });
    await winnerClient.page.waitForFunction(() => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.();
      return snapshot?.phase === 'setup' && snapshot?.mode === 'friendly';
    }, null, { timeout: 8000 });
    const friendlyAcceptedProbe = {
      requester: await getLiveSnapshot(loserClient.page),
      accepter: await getLiveSnapshot(winnerClient.page),
      requesterDom: await loserClient.page.evaluate(() => ({
        phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
        matchId: document.querySelector('[data-live-match-id]')?.textContent || '',
        summary: document.querySelector('[data-live-summary]')?.textContent || '',
        friendlyText: document.querySelector('[data-live-friendly-series]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      })),
    };
    add(
      'real browser waiting friendly rematch auto-enters accepted friendly setup for requester',
      friendlyAcceptedProbe.requester.phase === 'setup'
        && friendlyAcceptedProbe.requester.mode === 'friendly'
        && friendlyAcceptedProbe.accepter.phase === 'setup'
        && friendlyAcceptedProbe.accepter.mode === 'friendly'
        && friendlyAcceptedProbe.requester.matchId === friendlyAcceptedProbe.accepter.matchId
        && friendlyAcceptedProbe.requester.matchId !== finishedLoser.matchId
        && friendlyAcceptedProbe.requester.friendlySeries?.sourceMatchId === finishedLoser.matchId
        && friendlyAcceptedProbe.requester.friendlySeries?.rankedImpact === 'none'
        && /友谊再战/.test(friendlyAcceptedProbe.requesterDom.summary)
        && /换边再战/.test(friendlyAcceptedProbe.requesterDom.friendlyText),
      JSON.stringify(friendlyAcceptedProbe),
    );

    const friendlyWinnerReadyProbe = await readyLiveSetupSeat(winnerClient.page, `${seatSlug(winnerSeat)}-friendly-setup-ready`);
    const friendlyLoserReadyProbe = await readyLiveSetupSeat(loserClient.page, `${seatSlug(loserSeat)}-friendly-setup-ready`);
    await refreshUntilLivePhase(winnerClient.page, 'active', 10000);
    await refreshUntilLivePhase(loserClient.page, 'active', 10000);
    await clickLiveControl(loserClient.page, '[data-live-action="surrender"]', `${seatSlug(loserSeat)}-friendly-surrender-confirm`);
    await loserClient.page.waitForTimeout(250);
    await clickLiveControl(loserClient.page, '[data-live-action="surrender"]', `${seatSlug(loserSeat)}-friendly-surrender-submit`);
    await refreshUntilLivePhase(loserClient.page, 'finished', 15000);
    await refreshUntilLivePhase(winnerClient.page, 'finished', 10000);

    await loserClient.page.evaluate(async () => {
      await window.PVPScene.handleLivePostReviewAction('queue_again');
    });
    await loserClient.page.waitForFunction(() => window.PVPScene.getLiveSnapshot()?.phase === 'waiting', null, { timeout: 8000 });
    const postRequeueProbe = await loserClient.page.evaluate(() => ({
      phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
      ticket: document.querySelector('[data-live-queue-ticket]')?.textContent || '',
      reviewHidden: document.querySelector('[data-live-post-match-review]')?.hidden ?? false,
      selectedLoadout: document.querySelector('[data-live-selected-loadout]')?.textContent || '',
      payload: window.PVPScene.getLiveSnapshot(),
    }));
    add(
      'real browser post-match queue again re-enters real live waiting queue',
      postRequeueProbe.phase === 'waiting'
        && /^pvplq-/.test(postRequeueProbe.ticket)
        && postRequeueProbe.reviewHidden === true
        && /默认斗法谱/.test(postRequeueProbe.selectedLoadout)
        && postRequeueProbe.payload?.phase === 'waiting',
      JSON.stringify(postRequeueProbe),
    );

    await loserClient.page.evaluate(async () => {
      await window.PVPScene.cancelLiveQueue();
    });
    await waitForLivePhase(loserClient.page, 'idle', 8000);

    const seatC = await preparePage(browser, `live_real_c_${runId}`, '丙');
    const seatD = await preparePage(browser, `live_real_d_${runId}`, '丁');
    await seedRankedHistory(seatC.username, 1000, 6);
    await seedRankedHistory(seatD.username, 1000, 6);
    await seatC.page.evaluate(() => {
      window.game.player.name = '丙';
      window.PVPScene.switchTab('live');
    });
    await seatD.page.evaluate(() => {
      window.game.player.name = '丁';
      window.PVPScene.switchTab('live');
    });
    await seatC.page.waitForFunction(() => window.PVPScene?.getLiveSnapshot?.()?.phase === 'idle', null, { timeout: 8000 });
    await seatD.page.waitForFunction(() => window.PVPScene?.getLiveSnapshot?.()?.phase === 'idle', null, { timeout: 8000 });
    const seatCJoinActionable = await clickLiveControl(seatC.page, '[data-live-action="join-queue"]', 'seat-c-join-queue');
    const timeoutJoinC = await waitForLivePhase(seatC.page, 'waiting');
    const seatDJoinActionable = await clickLiveControl(seatD.page, '[data-live-action="join-queue"]', 'seat-d-join-queue');
    const timeoutJoinD = await waitForLivePhase(seatD.page, 'setup');
    const timeoutSetupC = await refreshUntilLivePhase(seatC.page, 'setup');
    await seatC.page.waitForTimeout(10600);
    await seatC.page.evaluate(async () => {
      await window.PVPScene.refreshLiveMatch();
    });
    const invalidatedC = await waitForLivePhase(seatC.page, 'invalidated', 12000);
    const invalidatedNoSeasonHonorProbe = await seatC.page.evaluate(async () => {
      const snapshot = window.PVPScene.getLiveSnapshot();
      const matchRead = await window.PVPService.live.getMatch(snapshot?.matchId || '');
      const textPayload = JSON.parse(window.render_game_to_text()).pvp?.live || null;
      return {
        phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
        summary: document.querySelector('[data-live-summary]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        hint: document.querySelector('[data-live-last-error]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        eventTypes: Array.from(document.querySelectorAll('[data-live-event-type]')).map(item => item.getAttribute('data-live-event-type')),
        postReviewHidden: document.querySelector('[data-live-post-match-review]')?.hidden ?? false,
        postReviewText: document.querySelector('[data-live-post-match-review]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        settlementText: document.querySelector('[data-live-settlement-report]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        seasonHonorText: document.querySelector('[data-live-season-honor]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        seasonHonorRewardText: document.querySelector('[data-live-season-honor-reward]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        seasonHonorRewardPresent: !!document.querySelector('[data-live-season-honor-reward]'),
        snapshot,
        textPayload,
        matchRead,
      };
    });
    add(
      'real browser ready timeout invalidated terminal state does not expose settlement or season honor',
      timeoutJoinC.phase === 'waiting'
        && timeoutJoinD.phase === 'setup'
        && (!isMobileViewport || (seatCJoinActionable?.ok === true && seatDJoinActionable?.ok === true))
        && timeoutSetupC.phase === 'setup'
        && invalidatedC.phase === 'invalidated'
        && invalidatedNoSeasonHonorProbe.phase === 'invalidated'
        && /准备超时|无效局/.test(invalidatedNoSeasonHonorProbe.summary)
        && /不写正式积分|不计正式积分/.test(invalidatedNoSeasonHonorProbe.hint)
        && invalidatedNoSeasonHonorProbe.eventTypes.includes('ready_timeout')
        && invalidatedNoSeasonHonorProbe.eventTypes.includes('match_invalidated')
        && invalidatedNoSeasonHonorProbe.postReviewHidden === true
        && !/正式积分|天道币|赛季荣誉/.test(`${invalidatedNoSeasonHonorProbe.postReviewText} ${invalidatedNoSeasonHonorProbe.settlementText} ${invalidatedNoSeasonHonorProbe.seasonHonorText}`)
        && invalidatedNoSeasonHonorProbe.seasonHonorRewardText === ''
        && !invalidatedNoSeasonHonorProbe.seasonHonorRewardPresent
        && invalidatedNoSeasonHonorProbe.snapshot?.phase === 'invalidated'
        && !invalidatedNoSeasonHonorProbe.snapshot?.postMatchReview
        && invalidatedNoSeasonHonorProbe.textPayload?.phase === 'invalidated'
        && !invalidatedNoSeasonHonorProbe.textPayload?.postMatchReview
        && invalidatedNoSeasonHonorProbe.matchRead?.success === true
        && invalidatedNoSeasonHonorProbe.matchRead?.stateView?.status === 'invalidated'
        && !invalidatedNoSeasonHonorProbe.matchRead?.stateView?.postMatchReview,
      JSON.stringify({ timeoutJoinC, timeoutJoinD, timeoutSetupC, invalidatedC, invalidatedNoSeasonHonorProbe, seatCJoinActionable, seatDJoinActionable }),
    );

    const seatE = await preparePage(browser, `live_real_timeout_e_${runId}`, '戊');
    const seatF = await preparePage(browser, `live_real_timeout_f_${runId}`, '己');
    await seedRankedHistory(seatE.username, 1000, 6);
    await seedRankedHistory(seatF.username, 1000, 6);
    await seatE.page.evaluate(() => {
      window.game.player.name = '戊';
      window.PVPScene.switchTab('live');
    });
    await seatF.page.evaluate(() => {
      window.game.player.name = '己';
      window.PVPScene.switchTab('live');
    });
    await seatE.page.waitForFunction(() => window.PVPScene?.getLiveSnapshot?.()?.phase === 'idle', null, { timeout: 8000 });
    await seatF.page.waitForFunction(() => window.PVPScene?.getLiveSnapshot?.()?.phase === 'idle', null, { timeout: 8000 });
    const seatEJoinActionable = await clickLiveControl(seatE.page, '[data-live-action="join-queue"]', 'seat-e-join-queue');
    const disconnectJoinE = await waitForLivePhase(seatE.page, 'waiting');
    const seatFJoinActionable = await clickLiveControl(seatF.page, '[data-live-action="join-queue"]', 'seat-f-join-queue');
    const disconnectSetupF = await waitForLivePhase(seatF.page, 'setup');
    const disconnectSetupE = await refreshUntilLivePhase(seatE.page, 'setup');
    const disconnectReadyEActionable = await clickLiveControl(seatE.page, '[data-live-action="ready"]', 'seat-e-ready-live');
    await refreshUntilLiveSnapshot(seatF.page, () => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.();
      return snapshot?.phase === 'setup' && snapshot?.opponent?.ready === true;
    }, null, 8000);
    const disconnectReadyFActionable = await clickLiveControl(seatF.page, '[data-live-action="ready"]', 'seat-f-ready-live');
    const disconnectActiveE = await waitForLivePhase(seatE.page, 'active', 10000);
    const disconnectActiveF = await waitForLivePhase(seatF.page, 'active', 10000);
    const disconnectActorSeat = disconnectActiveE.currentSeat;
    const disconnectObserverSeat = otherSeatId(disconnectActorSeat);
    const disconnectActorClient = disconnectActorSeat === disconnectActiveE.seatId ? seatE : seatF;
    const disconnectObserverClient = disconnectObserverSeat === disconnectActiveE.seatId ? seatE : seatF;
    await disconnectActorClient.page.evaluate(() => {
      window.PVPScene.__realSmokeStartLiveHeartbeat = window.PVPScene.startLiveHeartbeat;
      window.PVPScene.__realSmokeSendLiveHeartbeat = window.PVPScene.sendLiveHeartbeat;
      window.PVPScene.startLiveHeartbeat = () => {};
      window.PVPScene.sendLiveHeartbeat = async () => {};
      window.PVPScene.stopLiveHeartbeat();
      window.PVPScene.stopLiveRealtime();
    });
    const currentActionDisconnectPendingProbe = await disconnectObserverClient.page.evaluate(async actorSeat => {
      const BackendClient = window.__THE_DEFIER_SERVICES__?.BackendClient;
      const before = window.PVPScene.getLiveSnapshot();
      const heartbeatElapsedMs = Math.max(0, Number(before?.connectionReport?.heartbeatStaleMs || 1000))
        + Math.max(0, Number(before?.connectionReport?.graceMs || 60000))
        + 1000;
      const response = await BackendClient.requestServer(`/api/pvp/live/test/matches/${before.matchId}/seats/${actorSeat}`, {
        method: 'POST',
        data: { heartbeatElapsedMs, testMatchScope: window.__DEFIER_PVP_REAL_TEST_SCOPE }
      });
      const tempoEl = document.querySelector('[data-live-connection-tempo]');
      return {
        before,
        response,
        snapshot: window.PVPScene.getLiveSnapshot(),
        connectionText: document.querySelector('[data-live-connection-status]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        connectionTempo: tempoEl?.textContent?.replace(/\s+/g, ' ').trim() || '',
        connectionTempoState: tempoEl?.getAttribute('data-live-connection-tempo-state') || '',
        eventLogText: document.querySelector('[data-live-event-log]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        responseStatusLine: response?.stateView?.connectionTempoReport?.statusLine || '',
        responseDetailLine: response?.stateView?.connectionTempoReport?.detailLine || '',
        heartbeatElapsedMs,
      };
    }, disconnectActorSeat);
    const currentActionFinishedObserver = await refreshUntilLivePhase(disconnectObserverClient.page, 'finished', 10000);
    const currentActionFinishedActor = await refreshUntilLivePhase(disconnectActorClient.page, 'finished', 10000);
    const currentActionDisconnectReviewProbe = await disconnectObserverClient.page.evaluate(() => {
      const snapshot = window.PVPScene.getLiveSnapshot();
      const textPayload = JSON.parse(window.render_game_to_text()).pvp?.live || null;
      return {
        phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
        summary: document.querySelector('[data-live-summary]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        reviewText: document.querySelector('[data-live-post-match-review]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        eventText: document.querySelector('[data-live-event-log]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        connectionText: document.querySelector('[data-live-connection-status]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        snapshot,
        textPayload,
      };
    });
    const currentActionDisconnectReloadPage = await disconnectObserverClient.context.newPage();
    currentActionDisconnectReloadPage.on('console', msg => {
      if (msg.type() === 'error') recordConsoleError(msg.text());
    });
    currentActionDisconnectReloadPage.on('pageerror', error => recordConsoleError(error.message || String(error)));
    await currentActionDisconnectReloadPage.goto(appUrl, { waitUntil: 'domcontentloaded' });
    await reloadAndOpenLivePanel(currentActionDisconnectReloadPage);
    const currentActionDisconnectReloaded = await waitForLivePhase(currentActionDisconnectReloadPage, 'finished', 15000);
    const currentActionDisconnectReloadProbe = await currentActionDisconnectReloadPage.evaluate(() => ({
      phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
      reviewText: document.querySelector('[data-live-post-match-review]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      snapshot: window.PVPScene.getLiveSnapshot(),
      textPayload: JSON.parse(window.render_game_to_text()).pvp?.live || null,
    }));
    await currentActionDisconnectReloadPage.close();
    const currentActionDisconnectVisibleText = [
      currentActionDisconnectPendingProbe.connectionText,
      currentActionDisconnectPendingProbe.connectionTempo,
      currentActionDisconnectPendingProbe.eventLogText,
      currentActionDisconnectPendingProbe.responseStatusLine,
      currentActionDisconnectPendingProbe.responseDetailLine,
      currentActionDisconnectReviewProbe.summary,
      currentActionDisconnectReviewProbe.reviewText,
      currentActionDisconnectReviewProbe.eventText,
      currentActionDisconnectReviewProbe.connectionText,
      currentActionDisconnectReloadProbe.reviewText,
    ].join(' ');
    add(
      'real browser current action disconnect resolves to authoritative connection-timeout review',
      disconnectJoinE.phase === 'waiting'
        && disconnectSetupF.phase === 'setup'
        && disconnectSetupE.phase === 'setup'
        && (!isMobileViewport || (seatEJoinActionable?.ok === true && seatFJoinActionable?.ok === true && disconnectReadyEActionable?.ok === true && disconnectReadyFActionable?.ok === true))
        && currentActionDisconnectPendingProbe.response?.success === true
        && currentActionDisconnectPendingProbe.response?.stateView?.status === 'active'
        && currentActionDisconnectPendingProbe.snapshot?.phase === 'active'
        && currentActionDisconnectPendingProbe.response?.stateView?.connectionTempoReport?.tempoState === 'opponent_action_timeout_pending'
        && currentActionDisconnectPendingProbe.response?.stateView?.connectionTempoReport?.affectedSeat === disconnectActorSeat
        && /等待连接超时权威结算|连接超时/.test(`${currentActionDisconnectPendingProbe.responseStatusLine} ${currentActionDisconnectPendingProbe.responseDetailLine}`)
        && currentActionFinishedObserver.phase === 'finished'
        && currentActionFinishedActor.phase === 'finished'
        && currentActionFinishedObserver.matchId === currentActionFinishedActor.matchId
        && currentActionFinishedObserver.matchId === currentActionDisconnectPendingProbe.before?.matchId
        && currentActionFinishedObserver.postMatchReview?.finishReason === 'connection_timeout'
        && currentActionFinishedActor.postMatchReview?.finishReason === 'connection_timeout'
        && currentActionFinishedObserver.postMatchReview?.result === 'win'
        && currentActionFinishedActor.postMatchReview?.result === 'loss'
        && currentActionDisconnectReviewProbe.phase === 'finished'
        && currentActionDisconnectReviewProbe.snapshot?.postMatchReview?.finishReason === 'connection_timeout'
        && currentActionDisconnectReviewProbe.textPayload?.postMatchReview?.finishReason === 'connection_timeout'
        && /连接超时|重连宽限结束|行动超时/.test(currentActionDisconnectReviewProbe.reviewText)
        && /行动超时|对局结束/.test(currentActionDisconnectReviewProbe.eventText)
        && currentActionDisconnectReloaded.phase === 'finished'
        && currentActionDisconnectReloaded.matchId === currentActionFinishedObserver.matchId
        && currentActionDisconnectReloadProbe.phase === 'finished'
        && currentActionDisconnectReloadProbe.snapshot?.postMatchReview?.finishReason === 'connection_timeout'
        && currentActionDisconnectReloadProbe.textPayload?.postMatchReview?.finishReason === 'connection_timeout'
        && !/connection_timeout|turn_timeout|ready_timeout|ranked_authoritative|swap_sides|forfeit_disconnect/.test(currentActionDisconnectVisibleText),
      JSON.stringify({
        disconnectJoinE,
        disconnectSetupF,
        disconnectSetupE,
        disconnectActiveE,
        disconnectActiveF,
        disconnectActorSeat,
        disconnectObserverSeat,
        currentActionDisconnectPendingProbe,
        currentActionFinishedObserver,
        currentActionFinishedActor,
        currentActionDisconnectReviewProbe,
        currentActionDisconnectReloaded,
        currentActionDisconnectReloadProbe,
        seatEJoinActionable,
        seatFJoinActionable,
        disconnectReadyEActionable,
        disconnectReadyFActionable,
      }),
    );
    await seatE.context.close().catch(() => {});
    await seatF.context.close().catch(() => {});

    await safeAuditScreenshot(seatA.page, path.join(outDir, 'seat-a-live-real.png'), 'pvp_live_real_seat_a', {
      fullPage: false,
      timeout: 8000,
    });
    await safeAuditScreenshot(seatB.page, path.join(outDir, 'seat-b-live-real.png'), 'pvp_live_real_seat_b', {
      fullPage: false,
      timeout: 8000,
    });

    add('real browser live PVP smoke has no console errors', consoleErrors.length === 0, JSON.stringify(consoleErrors));
  } catch (error) {
    add('real browser live PVP smoke threw', false, error?.stack || error?.message || String(error));
  } finally {
    await browser.close().catch(() => {});
    await stopBackend(backend);
    await writeReport();
  }

  const failed = findings.some(item => item.pass === false);
  if (failed || consoleErrors.length > 0) {
    process.exit(1);
  }
})().catch(async (error) => {
  add('real browser live PVP smoke crashed', false, error?.stack || error?.message || String(error));
  await writeReport();
  process.exit(1);
});
