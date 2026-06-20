import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

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
    ['auth-modal', 'save-slots-modal', 'generic-confirm-modal', 'save-conflict-modal'].forEach(id => {
      document.getElementById(id)?.classList.remove('active');
    });
  });
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
        const targets = Array.from(document.querySelectorAll(targetSelector));
        if (targets.length === 0) {
          return { ok: false, label: targetLabel, selector: targetSelector, reason: 'missing' };
        }
        let fallback = null;
        for (let index = 0; index < targets.length; index += 1) {
          const target = targets[index];
          target.scrollIntoView({ block: 'center', inline: 'nearest' });
          const rect = target.getBoundingClientRect();
          const style = window.getComputedStyle(target);
          const x = Math.min(window.innerWidth - 1, Math.max(1, rect.left + rect.width / 2));
          const y = Math.min(window.innerHeight - 1, Math.max(1, rect.top + rect.height / 2));
          const hit = document.elementFromPoint(x, y);
          const ok = !target.disabled
            && style.visibility !== 'hidden'
            && style.display !== 'none'
            && rect.width > 0
            && rect.height >= (window.innerWidth <= 480 ? 32 : 1)
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
        && joinB.opponent?.loadout?.loadoutHash === rejoinAChanged.loadoutHash
        && joinB.matchQuality?.reportVersion === 'pvp-live-match-quality-v1'
        && joinB.matchQuality?.tag === 'good'
        && !joinB.opponent?.loadoutSnapshot,
      JSON.stringify(joinB),
    );

    const matchedA = await refreshUntilLivePhase(seatA.page, 'setup');
    const matchedB = await getLiveSnapshot(seatB.page);
    add(
      'real browser both seats agree on match id and public loadout hashes',
      matchedA.matchId === matchedB.matchId
        && matchedA.self?.loadout?.loadoutHash === matchedB.opponent?.loadout?.loadoutHash
        && matchedB.self?.loadout?.loadoutHash === matchedA.opponent?.loadout?.loadoutHash
        && matchedA.self?.loadout?.identitySlot === 'sword'
        && matchedB.self?.loadout?.identitySlot === 'shield'
        && matchedA.matchQuality?.tag === matchedB.matchQuality?.tag
        && matchedA.matchQuality?.ratingDeltaBucket === 'unrated_mvp',
      JSON.stringify({ matchedA, matchedB }),
    );

    add(
      'real browser live match exposes public match quality report',
      matchedA.matchQuality?.reportVersion === 'pvp-live-match-quality-v1'
        && matchedA.matchQuality?.tag === 'good'
        && matchedA.matchQuality?.expansionStage === 'mvp_open_pool'
        && matchedA.matchQuality?.ratingDeltaBucket === 'unrated_mvp'
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
        && /shield/.test(visibilityProbe.renderedOpponentLoadout),
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
    const seatBReadyTouchActionable = await clickLiveControl(seatB.page, '[data-live-action="ready"]', 'seat-b-ready-live');
    const activeA = await waitForLivePhase(seatA.page, 'active');
    const activeB = await waitForLivePhase(seatB.page, 'active');
    add(
      'real browser setup ready flow reaches active on both seats',
      activeA.phase === 'active'
        && activeB.phase === 'active'
        && activeA.currentSeat === 'A'
        && activeB.currentSeat === 'A',
      JSON.stringify({ activeA, activeB, seatAReadyTouchActionable, seatBReadyTouchActionable }),
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
    const activeTimerProbe = await seatA.page.evaluate(() => ({
      text: document.querySelector('[data-live-turn-timer]')?.textContent || '',
      payload: window.PVPScene.getLiveSnapshot()?.turnTimer || null,
    }));
    add(
      'real browser live match renders authoritative active action countdown',
      /行动倒计时/.test(activeTimerProbe.text)
        && /A/.test(activeTimerProbe.text)
        && activeTimerProbe.payload?.reportVersion === 'pvp-live-turn-timer-v1'
        && activeTimerProbe.payload?.phase === 'active'
        && activeTimerProbe.payload?.currentSeat === 'A'
        && activeTimerProbe.payload?.isViewerTurn === true,
      JSON.stringify(activeTimerProbe),
    );
    const forceOpeningProtectionProbe = await seatA.page.evaluate(async () => {
      const BackendClient = window.__THE_DEFIER_SERVICES__?.BackendClient;
      const before = window.PVPScene.getLiveSnapshot();
      const response = await BackendClient.requestServer(`/api/pvp/live/test/matches/${before.matchId}/seats/B`, {
        method: 'POST',
        data: { hp: 10, testMatchScope: window.__DEFIER_PVP_REAL_TEST_SCOPE }
      });
      await window.PVPScene.refreshLiveMatch();
      await new Promise(resolve => setTimeout(resolve, 300));
      return {
        response,
        snapshot: window.PVPScene.getLiveSnapshot(),
      };
    });
    await seatB.page.evaluate(async () => {
      await window.PVPScene.refreshLiveMatch();
    });
    await seatB.page.waitForTimeout(300);
    const protectedOpeningB = await getLiveSnapshot(seatB.page);
    add(
      'real browser test-mode match can enter protected lethal opening state',
      forceOpeningProtectionProbe.response?.success === true
        && forceOpeningProtectionProbe.response?.stateView?.opponent?.hp === 10
        && forceOpeningProtectionProbe.response?.stateView?.recentEvents?.some(event => event.eventType === 'test_state_forced' && event.publicData?.scope === TEST_MATCH_SCOPE)
        && forceOpeningProtectionProbe.snapshot?.opponent?.hp === 10
        && protectedOpeningB?.self?.hp === 10,
      JSON.stringify({ forceOpeningProtectionProbe, protectedOpeningB }),
    );
    const activeOpeningPreviewProbe = await seatA.page.evaluate(() => {
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
        && /当前 A/.test(activeOpeningPreviewProbe.openingText)
        && /后手护盾/.test(activeOpeningPreviewProbe.openingText)
        && /B \+3/.test(activeOpeningPreviewProbe.openingText)
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
      JSON.stringify(activeOpeningPreviewProbe),
    );
    const nonActingActionPreviewProbe = await seatB.page.evaluate(() => {
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
        && nonActingActionPreviewProbe.actionPreview?.viewerSeat === 'B'
        && nonActingActionPreviewProbe.actionPreview?.currentSeat === 'A'
        && nonActingActionPreviewProbe.actionPreview?.isViewerTurn === false
        && Array.isArray(nonActingActionPreviewProbe.actionPreview?.playableCards)
        && nonActingActionPreviewProbe.actionPreview.playableCards.length === 0
        && nonActingActionPreviewProbe.actionPreview?.endTurn === null
        && nonActingActionPreviewProbe.textActionPreview?.reportVersion === 'pvp-live-action-preview-v1'
        && nonActingActionPreviewProbe.textActionPreview?.playableCards?.length === 0
        && !/cardInstanceId|cardName|rawDamage|budgetedDamage|opponentHand|opponentDeck|deck|loadoutSnapshot|reward|rating|elo/i.test(JSON.stringify(nonActingActionPreviewProbe.actionPreview || {})),
      JSON.stringify(nonActingActionPreviewProbe),
    );
    const activeMomentumProbe = await seatA.page.evaluate(() => ({
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
    const activeGuideProbe = await seatA.page.evaluate(() => ({
      text: document.querySelector('[data-live-first-guide]')?.textContent || '',
      payload: window.PVPScene.getLiveSnapshot()?.firstMatchGuide || null,
    }));
    add(
      'real browser live match updates first-match guide after setup',
      /按当前行动席位出牌/.test(activeGuideProbe.text)
        && activeGuideProbe.payload?.nextAction === '按当前行动席位出牌，留意权威事件。',
      JSON.stringify(activeGuideProbe),
    );

    const realOpeningEndTurnBefore = await getLiveSnapshot(seatA.page);
    const openingEndTurnTouchActionable = await clickLiveControl(seatA.page, '[data-live-action="end-turn"]', 'seat-a-opening-end-turn-confirm');
    await seatA.page.waitForTimeout(300);
    const realOpeningEndTurnConfirmProbe = await seatA.page.evaluate(before => {
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
        && /交给\s*B/.test(realOpeningEndTurnConfirmProbe.hint)
        && /首动预算\s*18/.test(realOpeningEndTurnConfirmProbe.hint)
        && /后手护盾\s*B\s*\+3/.test(realOpeningEndTurnConfirmProbe.hint)
        && /反打缓冲\s*\+8/.test(realOpeningEndTurnConfirmProbe.hint)
        && /确认结束/.test(realOpeningEndTurnConfirmProbe.endTurnText),
      JSON.stringify({ realOpeningEndTurnConfirmProbe, openingEndTurnTouchActionable }),
    );

    const realSocialSubmitProbe = await seatB.page.evaluate(async () => {
      await window.PVPScene.submitLiveEmote('thinking');
      await new Promise(resolve => setTimeout(resolve, 300));
      const state = window.PVPScene.getLiveSession().getState();
      return {
        snapshot: window.PVPScene.getLiveSnapshot(),
        lastError: state.lastError || null,
        lastRealtimeIntentResult: state.lastRealtimeIntentResult || null,
        eventLog: document.querySelector('[data-live-event-log]')?.textContent || '',
      };
    });
    await seatA.page.evaluate(async () => {
      await window.PVPScene.refreshLiveMatch();
    });
    await seatA.page.waitForTimeout(300);
    const realSocialUnmutedProbe = await seatA.page.evaluate(() => ({
      events: document.querySelector('[data-live-event-log]')?.textContent || '',
      status: document.querySelector('[data-live-social-status]')?.textContent || '',
      payload: window.PVPScene.getLiveSnapshot()?.social || null,
      snapshot: window.PVPScene.getLiveSnapshot() || null,
      sessionState: window.PVPScene.getLiveSession().getState(),
    }));
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

    const openingCardBeforeProbe = await seatA.page.evaluate(() => {
      const before = window.PVPScene.getLiveSnapshot();
      const state = window.PVPScene.getLiveSession().getState();
      const card = state.stateView?.self?.hand?.[0];
      if (!card?.instanceId) throw new Error('seat A has no playable card');
      const preview = before?.actionPreviewReport?.playableCards?.find(item => item.cardInstanceId === card.instanceId) || null;
      return { before, card, preview };
    });
    const openingCardSelector = liveCardSelector(openingCardBeforeProbe.card.instanceId);
    const openingCardConfirmTouchActionable = await clickLiveControl(seatA.page, openingCardSelector, 'seat-a-opening-card-confirm');
    await seatA.page.waitForTimeout(300);
    const realOpeningCardConfirmProbe = await seatA.page.evaluate(({ before, card, preview }) => {
      const after = window.PVPScene.getLiveSnapshot();
      return {
        before,
        after,
        card,
        preview,
        hint: document.querySelector('[data-live-last-error]')?.textContent || '',
        cardClass: document.querySelector('[data-live-card]')?.className || '',
        cardText: document.querySelector('[data-live-card]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      };
    }, openingCardBeforeProbe);
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
        && /后手护盾\s*B\s*\+3/.test(realOpeningCardConfirmProbe.hint)
        && /反打缓冲\s*\+8/.test(realOpeningCardConfirmProbe.hint)
        && new RegExp(`预算后\\s*${confirmedCardPreview.budgetedDamage}`).test(confirmedHint)
        && new RegExp(`破盾\\s*${confirmedCardPreview.blockedDamage}`).test(confirmedHint)
        && new RegExp(`生命伤害\\s*${confirmedCardPreview.hpDamage}`).test(confirmedHint)
        && new RegExp(`${confirmedCardPreview.targetSeat}\\s*预计\\s*${confirmedCardPreview.targetHpAfter}\\s*血`).test(confirmedHint)
        && /confirming/.test(realOpeningCardConfirmProbe.cardClass)
        && /确认/.test(realOpeningCardConfirmProbe.cardText),
      JSON.stringify({ realOpeningCardConfirmProbe, openingCardConfirmTouchActionable }),
    );

    const acceptedCardTouchActionable = await clickLiveControl(seatA.page, openingCardSelector, 'seat-a-opening-card-submit');
    const playA = await waitForLiveSnapshot(seatA.page, expectedVersion => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.();
      return Number(snapshot?.stateVersion || 0) > expectedVersion;
    }, activeA.stateVersion);
    const afterPlayB = await waitForLiveSnapshot(seatB.page, previousHp => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.();
      return snapshot?.self?.hp <= 1 && Number(snapshot?.stateVersion || 0) > Number(previousHp || 0);
    }, protectedOpeningB.stateVersion);
    add(
      'real browser accepted card intent auto-pushes opponent state without manual refresh',
      playA.stateVersion > activeA.stateVersion
        && afterPlayB.self?.hp < activeB.self?.hp
        && afterPlayB.opponent?.handCount >= 0,
      JSON.stringify({ playA, afterPlayB, acceptedCardTouchActionable }),
    );
    const afterPlayReceiptProbe = await seatB.page.evaluate(() => {
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
        && afterPlayReceiptProbe.payload?.viewerSeat === 'B'
        && afterPlayReceiptProbe.payload?.actingSeat === 'A'
        && afterPlayReceiptProbe.payload?.actionType === 'play_card'
        && Number.isFinite(afterPlayReceiptProbe.payload?.damage?.hpDamage)
        && afterPlayReceiptProbe.payload.damage.hpDamage > 0
        && afterPlayReceiptProbe.payload?.damage?.targetSeat === 'B'
        && afterPlayReceiptProbe.payload?.damage?.targetHpAfter === 1
        && afterPlayReceiptProbe.payload?.openingProtection?.triggered === true
        && afterPlayReceiptProbe.payload?.openingProtection?.protectedSeat === 'B'
        && afterPlayReceiptProbe.payload?.openingProtection?.minimumHp === 1
        && afterPlayReceiptProbe.payload?.openingProtection?.preventedDamage === 6
        && afterPlayReceiptProbe.textPayload?.reportVersion === 'pvp-live-action-receipt-v1'
        && afterPlayReceiptProbe.textPayload?.sourceVisibility === afterPlayReceiptProbe.payload?.sourceVisibility
        && afterPlayReceiptProbe.textPayload?.latestSequence === afterPlayReceiptProbe.payload?.latestSequence
        && afterPlayReceiptProbe.textPayload?.summaryLine === afterPlayReceiptProbe.payload?.summaryLine
        && !/hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo|opponentHand|opponentDeck/i.test(`${afterPlayReceiptProbe.text} ${JSON.stringify(afterPlayReceiptProbe.payload || {})}`),
      JSON.stringify(afterPlayReceiptProbe),
    );
    const afterPlayMomentumProbe = await seatB.page.evaluate(() => ({
      text: document.querySelector('[data-live-duel-momentum]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      state: document.querySelector('[data-live-duel-momentum]')?.getAttribute('data-live-duel-momentum-state') || '',
      payload: window.PVPScene.getLiveSnapshot()?.duelMomentumReport || null,
    }));
    add(
      'real browser accepted card intent keeps public duel momentum readable without refresh',
      /局势/.test(afterPlayMomentumProbe.text)
        && /行动窗口|反打窗口|护体/.test(afterPlayMomentumProbe.text)
        && afterPlayMomentumProbe.payload?.reportVersion === 'pvp-live-duel-momentum-v1'
        && afterPlayMomentumProbe.payload?.viewerSeat === 'B'
        && afterPlayMomentumProbe.payload?.sourceVisibility === 'public_state'
        && afterPlayMomentumProbe.payload?.usesHiddenInformation === false
        && afterPlayMomentumProbe.payload?.rankedImpact === 'none'
        && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(`${afterPlayMomentumProbe.text} ${JSON.stringify(afterPlayMomentumProbe.payload || {})}`),
      JSON.stringify(afterPlayMomentumProbe),
    );

    await waitForLiveActionUnlocked(seatA.page, 'seat-a-after-play-before-end-turn');
    const endTurnAfterPlayTouchActionable = await clickLiveControl(seatA.page, '[data-live-action="end-turn"]', 'seat-a-end-turn-after-play');
    await seatA.page.waitForTimeout(300);
    const endTurnAfterPlayConfirmProbe = await seatA.page.evaluate(() => {
      return {
        snapshot: window.PVPScene.getLiveSnapshot(),
        hint: document.querySelector('[data-live-last-error]')?.textContent || '',
        endTurnText: document.querySelector('[data-live-action="end-turn"]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      };
    });
    let endTurnAfterPlaySecondTouchActionable = null;
    if (endTurnAfterPlayConfirmProbe.snapshot?.currentSeat !== 'B') {
      endTurnAfterPlaySecondTouchActionable = await clickLiveControl(seatA.page, '[data-live-action="end-turn"]', 'seat-a-end-turn-after-play-submit');
    }
    const afterEndTurnB = await waitForLiveSnapshot(seatB.page, expectedVersion => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.();
      return snapshot?.currentSeat === 'B' && Number(snapshot?.stateVersion || 0) > expectedVersion;
    }, afterPlayB.stateVersion || activeB.stateVersion);
    const seatBTimerProbe = await seatB.page.evaluate(() => ({
      text: document.querySelector('[data-live-turn-timer]')?.textContent || '',
      payload: window.PVPScene.getLiveSnapshot()?.turnTimer || null,
    }));
    const afterEndTurnReceiptProbe = await seatB.page.evaluate(() => {
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
      afterEndTurnB.currentSeat === 'B'
        && /行动倒计时/.test(seatBTimerProbe.text)
        && /B/.test(seatBTimerProbe.text)
        && seatBTimerProbe.payload?.currentSeat === 'B'
        && seatBTimerProbe.payload?.isViewerTurn === true,
      JSON.stringify({ endTurnAfterPlayConfirmProbe, afterEndTurnB, seatBTimerProbe, endTurnAfterPlayTouchActionable, endTurnAfterPlaySecondTouchActionable }),
    );
    add(
      'real browser end turn renders authoritative handoff receipt',
      /交权回执/.test(afterEndTurnReceiptProbe.text)
        && /行动权交给\s*B/.test(afterEndTurnReceiptProbe.text)
        && /抽\s*\d+\s*张/.test(afterEndTurnReceiptProbe.text)
        && afterEndTurnReceiptProbe.typeAttr === 'end_turn'
        && afterEndTurnReceiptProbe.actorAttr === 'A'
        && afterEndTurnReceiptProbe.nextSeatAttr === 'B'
        && afterEndTurnReceiptProbe.sourceAttr === 'authoritative_public_projection'
        && afterEndTurnReceiptProbe.hiddenAttr === 'false'
        && afterEndTurnReceiptProbe.payload?.reportVersion === 'pvp-live-action-receipt-v1'
        && afterEndTurnReceiptProbe.payload?.sourceVisibility === 'authoritative_public_projection'
        && afterEndTurnReceiptProbe.payload?.usesHiddenInformation === false
        && afterEndTurnReceiptProbe.payload?.rankedImpact === 'none'
        && afterEndTurnReceiptProbe.payload?.viewerSeat === 'B'
        && afterEndTurnReceiptProbe.payload?.actingSeat === 'A'
        && afterEndTurnReceiptProbe.payload?.actionType === 'end_turn'
        && afterEndTurnReceiptProbe.payload?.nextSeat === 'B'
        && afterEndTurnReceiptProbe.payload?.counterplay?.granted === true
        && afterEndTurnReceiptProbe.payload?.counterplay?.seatId === 'B'
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
        && !/hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo|opponentHand|opponentDeck/i.test(`${afterEndTurnReceiptProbe.text} ${JSON.stringify(afterEndTurnReceiptProbe.payload || {})}`),
      JSON.stringify(afterEndTurnReceiptProbe),
    );
    const protectedCounterplayBeforeProbe = await seatB.page.evaluate(() => {
      const before = window.PVPScene.getLiveSnapshot();
      const sessionState = window.PVPScene.getLiveSession().getState();
      const playable = before?.actionPreviewReport?.playableCards?.[0] || null;
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
    const protectedCounterplayFirstTouchActionable = await clickLiveControl(seatB.page, protectedCounterplaySelector, 'seat-b-protected-counterplay-card-confirm');
    await seatB.page.waitForTimeout(250);
    const protectedCounterplayConfirming = await getLiveSnapshot(seatB.page);
    let protectedCounterplaySecondTouchActionable = null;
    if (protectedCounterplayConfirming?.stateVersion === protectedCounterplayBeforeProbe.before?.stateVersion) {
      protectedCounterplaySecondTouchActionable = await clickLiveControl(seatB.page, protectedCounterplaySelector, 'seat-b-protected-counterplay-card-submit');
    }
    await seatB.page.waitForTimeout(500);
    const protectedCounterplayActionProbe = await seatB.page.evaluate(({ before, playable, fallbackCard, cardInstanceId, confirming }) => {
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
    const afterProtectedCounterplayA = await waitForLiveSnapshot(seatA.page, expectedVersion => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.();
      return Number(snapshot?.stateVersion || 0) > expectedVersion;
    }, afterEndTurnB.stateVersion);
    add(
      'real browser protected defender can spend the +8 counterplay window on a real action',
      protectedCounterplayActionProbe.before?.currentSeat === 'B'
        && protectedCounterplayActionProbe.before?.self?.hp === 1
        && protectedCounterplayActionProbe.before?.self?.block >= 8
        && protectedCounterplayActionProbe.before?.duelMomentumReport?.pressureState === 'reversal_window'
        && protectedCounterplayActionProbe.before?.duelMomentumReport?.isViewerTurn === true
        && /你的反打窗口|反打窗口/.test(protectedCounterplayActionProbe.momentumText)
        && !!protectedCounterplayActionProbe.cardInstanceId
        && !protectedCounterplayActionProbe.error
        && protectedCounterplayActionProbe.after?.stateVersion > protectedCounterplayActionProbe.before?.stateVersion
        && protectedCounterplayActionProbe.after?.actionReceiptReport?.actingSeat === 'B'
        && protectedCounterplayActionProbe.after?.actionReceiptReport?.actionType === 'play_card'
        && protectedCounterplayActionProbe.receiptType === 'play_card'
        && afterProtectedCounterplayA.stateVersion === protectedCounterplayActionProbe.after?.stateVersion
        && afterProtectedCounterplayA.currentSeat === protectedCounterplayActionProbe.after?.currentSeat
        && !/hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo|opponentHand|opponentDeck/i.test(`${protectedCounterplayActionProbe.receiptText} ${protectedCounterplayActionProbe.momentumText} ${JSON.stringify(protectedCounterplayActionProbe.after?.actionReceiptReport || {})}`),
      JSON.stringify({
        protectedCounterplayActionProbe,
        afterProtectedCounterplayA,
        protectedCounterplayFirstTouchActionable,
        protectedCounterplaySecondTouchActionable,
      }),
    );

    const surrenderTouchActionable = await clickLiveControl(seatB.page, '[data-live-action="surrender"]', 'seat-b-surrender-confirm');
    await seatB.page.waitForTimeout(200);
    const realSurrenderConfirmProbe = await seatB.page.evaluate(() => {
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
    await clickLiveControl(seatB.page, '[data-live-action="surrender"]', 'seat-b-surrender-submit');
    const finishedB = await waitForLivePhase(seatB.page, 'finished');
    const finishedA = await waitForLivePhase(seatA.page, 'finished');
    const postMatchProbe = await seatB.page.evaluate(() => ({
      text: document.querySelector('[data-live-post-match-review]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      keyTurnText: document.querySelector('[data-live-key-turn-replay]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      keyTurnSource: document.querySelector('[data-live-key-turn-replay]')?.getAttribute('data-live-key-turn-source') || '',
      keyTurnHidden: document.querySelector('[data-live-key-turn-replay]')?.getAttribute('data-live-key-turn-hidden') || '',
      keyTurnCount: document.querySelectorAll('[data-live-key-turn]').length,
      experienceText: document.querySelector('[data-live-experience-report]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      experienceSource: document.querySelector('[data-live-experience-report]')?.getAttribute('data-live-experience-source') || '',
      experienceHidden: document.querySelector('[data-live-experience-report]')?.getAttribute('data-live-experience-hidden') || '',
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
      'real browser live match renders public post-match review after surrender',
      finishedB.phase === 'finished'
        && finishedA.phase === 'finished'
        && /复盘/.test(postMatchProbe.text)
        && /认输/.test(postMatchProbe.text)
        && /查看权威事件/.test(postMatchProbe.text)
        && postMatchProbe.reviewActionIds.includes('review_key_turns')
        && postMatchProbe.reviewActionIds.includes('friendly_rematch')
        && postMatchProbe.payload?.reportVersion === 'pvp-live-post-match-review-v1'
        && postMatchProbe.payload?.result === 'loss'
        && postMatchProbe.payload?.finishReason === 'surrender'
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
      JSON.stringify({ finishedA, finishedB, postMatchProbe, postMatchParity }),
    );
    if (isMobileViewport) {
      await seatB.page.evaluate(() => {
        document.querySelector('[data-live-post-match-review]')?.scrollIntoView({ block: 'start', inline: 'nearest' });
      });
      await seatB.page.waitForTimeout(180);
      const mobileRealLayoutProbe = await seatB.page.evaluate(() => {
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
    const publicReplayProbe = await requestLivePvpReplay(seatB.page, finishedB.matchId, { visibility: 'replay_public' });
    publicReplayProbe.hasForbiddenReport = /postMatchReview|fairnessReceipt|settlementReport|seasonHonorReport|cosmeticReward|seasonHonorCollection|collectionState|viewerSeat/.test(JSON.stringify(publicReplayProbe.replay || {}));
    const auditSafeReplayProbe = await requestLivePvpReplay(seatB.page, finishedB.matchId, { visibility: 'audit_safe' });
    auditSafeReplayProbe.hasForbiddenReport = /postMatchReview|fairnessReceipt|settlementReport|seasonHonorReport|cosmeticReward|seasonHonorCollection|collectionState|viewerSeat/.test(JSON.stringify(auditSafeReplayProbe.replay || {}));
    add(
      'real browser replay_public hides seat-specific settlement and season honor reports',
      publicReplayProbe?.success === true
        && publicReplayProbe.replay?.visibilityLayer === 'replay_public'
        && publicReplayProbe.replay?.publicSummary?.finishReason === 'surrender'
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
        && auditSafeReplayProbe.replay?.publicSummary?.finishReason === 'surrender'
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
      /公平回执|先手秒杀|首动预算|行动窗口|反打/.test(postMatchProbe.fairnessText)
        && postMatchProbe.fairnessSource === 'public_events'
        && postMatchProbe.fairnessHidden === 'false'
        && ['accepted', 'watch'].includes(postMatchProbe.fairnessState)
        && postMatchProbe.payload?.fairnessReceipt?.reportVersion === 'pvp-live-fairness-receipt-v1'
        && postMatchProbe.payload?.fairnessReceipt?.sourceVisibility === 'public_events'
        && postMatchProbe.payload?.fairnessReceipt?.usesHiddenInformation === false
        && postMatchProbe.payload?.fairnessReceipt?.rankedImpact === 'none'
        && postMatchProbe.payload?.fairnessReceipt?.result === 'loss'
        && postMatchProbe.payload?.fairnessReceipt?.finishReason === 'surrender'
        && (postMatchProbe.payload?.fairnessReceipt?.evidenceSummary || []).length >= 3
        && postMatchParity?.fairnessReceipt === true
        && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(`${postMatchProbe.fairnessText} ${JSON.stringify(postMatchProbe.payload?.fairnessReceipt || {})}`),
      JSON.stringify({ finishedA, finishedB, postMatchProbe, postMatchParity }),
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
      JSON.stringify({ finishedA, finishedB, postMatchProbe, postMatchParity }),
    );
    add(
      'real browser live match renders experience report from public post-match events',
      /双方体验诊断|公开|窗口/.test(postMatchProbe.experienceText)
        && postMatchProbe.experienceSource === 'public_events'
        && postMatchProbe.experienceHidden === 'false'
        && ['setup_ready_required', 'first_action_budget', 'opening_protection', 'decision_windows'].every(id => postMatchProbe.experienceCheckIds.includes(id))
        && postMatchProbe.payload?.experienceReport?.reportVersion === 'pvp-live-experience-report-v1'
        && postMatchProbe.payload?.experienceReport?.sourceVisibility === 'public_events'
        && postMatchProbe.payload?.experienceReport?.usesHiddenInformation === false
        && postMatchProbe.payload?.experienceReport?.rankedImpact === 'none'
        && ['low', 'watch'].includes(postMatchProbe.payload?.experienceReport?.nonGameRisk)
        && postMatchProbe.payload?.experienceReport?.decisionWindowCount >= 1
        && postMatchProbe.payload?.experienceReport?.seatWindowSummary?.firstSeat
        && postMatchProbe.payload?.experienceReport?.safeguardSummary?.setupReady === 'confirmed'
        && (postMatchProbe.payload?.experienceReport?.fairnessChecks || []).every(item => Array.isArray(item.linkedEvidence) && item.linkedEvidence.length >= 1)
        && postMatchParity?.experienceChecks === true
        && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(JSON.stringify(postMatchProbe.payload?.experienceReport || {})),
      JSON.stringify({ finishedA, finishedB, postMatchProbe, postMatchParity }),
    );

    const postActionProbe = await seatB.page.evaluate(async () => {
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
        && postActionProbe.focus?.sourceRunId === `pvp_live:${finishedB.matchId}`
        && /真人 PVP|首败|复盘/.test(postActionProbe.focus?.trainingAdvice || '')
        && /真人 PVP|问道练习|不计/.test(postActionProbe.bannerText || '')
        && /公开事件|不写正式积分|隐藏/.test(postActionProbe.insightText || '')
        && /回放命盘/.test(postActionProbe.confirmText || '')
        && postActionProbe.drillScenario?.reportVersion === 'pvp-live-drill-scenario-v1'
        && postActionProbe.drillScenario?.sourceMatchId === finishedB.matchId
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
        && /开战|认输|对局结束/.test(postActionProbe.keyTurnFocus?.focusedEvents || '')
        && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot/i.test(JSON.stringify(postActionProbe.keyTurnFocus?.payload || {})),
      JSON.stringify(postActionProbe),
    );

    await seatB.page.reload({ waitUntil: 'domcontentloaded' });
    await seatB.page.waitForFunction(
      () => !!window.game && !!window.PVPScene && typeof window.render_game_to_text === 'function',
      null,
      { timeout: 15000 },
    );
    await seatB.page.evaluate(async () => {
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
    await dismissBlockingModals(seatB.page);
    const restoredPostMatch = await waitForLivePhase(seatB.page, 'finished');
    const reloadPostMatchProbe = await seatB.page.evaluate(() => ({
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
        && restoredPostMatch.matchId === finishedB.matchId
        && reloadPostMatchProbe.phase === 'finished'
        && reloadPostMatchProbe.storedMatchIds.includes(finishedB.matchId)
        && /复盘/.test(reloadPostMatchProbe.reviewText)
        && /查看权威事件/.test(reloadPostMatchProbe.reviewText)
        && reloadPostMatchProbe.payload?.reportVersion === 'pvp-live-post-match-review-v1'
        && reloadPostMatchProbe.textPayload?.reportVersion === 'pvp-live-post-match-review-v1',
      JSON.stringify({ restoredPostMatch, reloadPostMatchProbe }),
    );

    const seatBFriendlyRematchActionable = await clickLiveControl(seatB.page, '[data-live-post-review-action="friendly_rematch"]', 'seat-b-friendly-rematch');
    await seatB.page.waitForTimeout(200);
    const friendlyRematchProbe = await seatB.page.evaluate(() => ({
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
        && friendlyRematchProbe.snapshot?.sourceMatchId === finishedB.matchId
        && (!isMobileViewport || seatBFriendlyRematchActionable?.ok === true)
        && friendlyRematchProbe.snapshot?.rankedImpact === 'none',
      JSON.stringify({ friendlyRematchProbe, seatBFriendlyRematchActionable }),
    );
    const seatBCancelRematchActionable = await clickLiveControl(seatB.page, '[data-live-action="cancel-rematch"]', 'seat-b-cancel-friendly-rematch');
    await seatB.page.waitForTimeout(200);
    const cancelledRematchProbe = await seatB.page.evaluate(() => {
      const series = document.querySelector('[data-live-friendly-series]');
      const actions = Object.fromEntries(Array.from(document.querySelectorAll('[data-live-post-review-action]')).map(button => [button.getAttribute('data-live-post-review-action'), button.disabled]));
      return {
        phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
        hint: document.querySelector('[data-live-last-error]')?.textContent || '',
        reviewText: document.querySelector('[data-live-post-match-review]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        status: series?.getAttribute('data-live-friendly-series-status') || '',
        seriesText: series?.textContent?.replace(/\s+/g, ' ').trim() || '',
        cancelVisible: !!document.querySelector('[data-live-action="cancel-rematch"]'),
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
        && (!isMobileViewport || seatBCancelRematchActionable?.ok === true),
      JSON.stringify({ cancelledRematchProbe, seatBCancelRematchActionable }),
    );

    await dismissBlockingModals(seatB.page);
    const seatBRematchAfterCancelActionable = await clickLiveControl(seatB.page, '[data-live-post-review-action="friendly_rematch"]', 'seat-b-friendly-rematch-after-cancel');
    await seatB.page.waitForTimeout(500);
    const rematchRetryProbe = await seatB.page.evaluate(() => {
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
        && (!isMobileViewport || seatBRematchAfterCancelActionable?.ok === true),
      JSON.stringify({ rematchRetryProbe, seatBRematchAfterCancelActionable }),
    );
    if (rematchRetryProbe.phase !== 'waiting_rematch') {
      throw new Error(`friendly rematch retry did not enter waiting_rematch: ${JSON.stringify(rematchRetryProbe)}`);
    }
    await clickLiveControl(seatA.page, '[data-live-post-review-action="friendly_rematch"]', 'seat-a-friendly-rematch');
    await seatB.page.waitForFunction(() => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.();
      return snapshot?.phase === 'setup' && snapshot?.mode === 'friendly';
    }, null, { timeout: 8000 });
    await seatA.page.waitForFunction(() => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.();
      return snapshot?.phase === 'setup' && snapshot?.mode === 'friendly';
    }, null, { timeout: 8000 });
    const friendlyAcceptedProbe = {
      requester: await getLiveSnapshot(seatB.page),
      accepter: await getLiveSnapshot(seatA.page),
      requesterDom: await seatB.page.evaluate(() => ({
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
        && friendlyAcceptedProbe.requester.matchId !== finishedB.matchId
        && friendlyAcceptedProbe.requester.friendlySeries?.sourceMatchId === finishedB.matchId
        && friendlyAcceptedProbe.requester.friendlySeries?.rankedImpact === 'none'
        && /友谊再战/.test(friendlyAcceptedProbe.requesterDom.summary)
        && /换边再战/.test(friendlyAcceptedProbe.requesterDom.friendlyText),
      JSON.stringify(friendlyAcceptedProbe),
    );

    await ensureLiveRealtime(seatA.page);
    await ensureLiveRealtime(seatB.page);
    await seatA.page.evaluate(async () => {
      await window.PVPScene.readyLiveMatch();
    });
    await waitForLiveSnapshot(seatB.page, () => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.();
      return snapshot?.phase === 'setup' && snapshot?.opponent?.ready === true;
    });
    await seatB.page.evaluate(async () => {
      await window.PVPScene.readyLiveMatch();
    });
    await waitForLivePhase(seatA.page, 'active');
    await waitForLivePhase(seatB.page, 'active');
    await seatB.page.evaluate(async () => {
      await window.PVPScene.surrenderLiveMatch();
      await window.PVPScene.surrenderLiveMatch();
    });
    await waitForLivePhase(seatB.page, 'finished');
    await waitForLivePhase(seatA.page, 'finished');

    await seatB.page.evaluate(async () => {
      await window.PVPScene.handleLivePostReviewAction('queue_again');
    });
    await seatB.page.waitForFunction(() => window.PVPScene.getLiveSnapshot()?.phase === 'waiting', null, { timeout: 8000 });
    const postRequeueProbe = await seatB.page.evaluate(() => ({
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

    await seatB.page.evaluate(async () => {
      await window.PVPScene.cancelLiveQueue();
    });
    await waitForLivePhase(seatB.page, 'idle', 8000);

    const seatC = await preparePage(browser, `live_real_c_${runId}`, '丙');
    const seatD = await preparePage(browser, `live_real_d_${runId}`, '丁');
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
