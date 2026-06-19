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
const runId = `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
const password = `pwd_${runId}`;

fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];
let port = 0;
let apiUrl = '';

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
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
      DEFIER_DB_PATH: dbPath,
      PVP_LIVE_HEARTBEAT_INTERVAL_MS: '1000',
      PVP_LIVE_HEARTBEAT_STALE_MS: '1000',
      PVP_LIVE_RECONNECT_GRACE_MS: '30000',
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
  const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
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
  await page.evaluate(async ({ username, password }) => {
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
    window.game.showScreen('pvp-screen');
  }, { username, password });
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

async function writeReport() {
  const report = {
    url: appUrl,
    apiUrl,
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

    const changedLoadoutA = makeLoadout('curse', ['pvp_guard', 'pvp_guard', 'pvp_strike', 'pvp_burst']);

    await seatA.page.evaluate(() => {
      window.game.player.name = '甲';
      window.PVPScene.switchTab('live');
    });
    await seatA.page.waitForSelector('[data-live-loadout-preset="sword"]', { timeout: 5000 });
    await seatA.page.click('[data-live-loadout-preset="sword"]', { timeout: 5000, force: true });
    const selectedA = await seatA.page.evaluate(() => ({
      preset: document.querySelector('[data-live-loadout-preset].selected')?.getAttribute('data-live-loadout-preset') || '',
      label: document.querySelector('[data-live-selected-loadout]')?.textContent || '',
      candidate: window.PVPScene.getLiveQueueLoadoutCandidate(window.PVPScene.getLiveSelectedLoadoutPreset().id),
    }));
    await seatA.page.click('[data-live-action="join-queue"]', { timeout: 5000, force: true });
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
        && selectedA.candidate?.deck?.length === 20,
      JSON.stringify(selectedA),
    );

    const rejoinAChanged = await seatA.page.evaluate(async ({ displayName, loadout }) => {
      return await window.PVPService.live.joinQueue({ displayName, loadout });
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
    await seatB.page.click('[data-live-loadout-preset="shield"]', { timeout: 5000, force: true });
    const selectedB = await seatB.page.evaluate(() => ({
      preset: document.querySelector('[data-live-loadout-preset].selected')?.getAttribute('data-live-loadout-preset') || '',
      label: document.querySelector('[data-live-selected-loadout]')?.textContent || '',
      candidate: window.PVPScene.getLiveQueueLoadoutCandidate(window.PVPScene.getLiveSelectedLoadoutPreset().id),
    }));
    await seatB.page.click('[data-live-action="join-queue"]', { timeout: 5000, force: true });
    const joinB = await waitForLivePhase(seatB.page, 'setup');
    add(
      'real browser user B selects live loadout preset through UI',
      selectedB.preset === 'shield'
        && /守势斗法谱/.test(selectedB.label)
        && selectedB.candidate?.identitySlot === 'shield'
        && selectedB.candidate?.deck?.length === 20,
      JSON.stringify(selectedB),
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
    await seatA.page.evaluate(async () => {
      await window.PVPScene.readyLiveMatch();
    });
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
    await seatB.page.evaluate(async () => {
      await window.PVPScene.readyLiveMatch();
    });
    const activeA = await waitForLivePhase(seatA.page, 'active');
    const activeB = await waitForLivePhase(seatB.page, 'active');
    add(
      'real browser setup ready flow reaches active on both seats',
      activeA.phase === 'active'
        && activeB.phase === 'active'
        && activeA.currentSeat === 'A'
        && activeB.currentSeat === 'A',
      JSON.stringify({ activeA, activeB }),
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

    await seatA.page.evaluate(async () => {
      const state = window.PVPScene.getLiveSession().getState();
      const card = state.stateView?.self?.hand?.[0];
      if (!card?.instanceId) throw new Error('seat A has no playable card');
      await window.PVPScene.submitLiveCard(card.instanceId);
    });
    const playA = await waitForLiveSnapshot(seatA.page, expectedVersion => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.();
      return Number(snapshot?.stateVersion || 0) > expectedVersion;
    }, activeA.stateVersion);
    const afterPlayB = await waitForLiveSnapshot(seatB.page, previousHp => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.();
      return snapshot?.self?.hp < previousHp && Number(snapshot?.stateVersion || 0) > 0;
    }, activeB.self?.hp);
    add(
      'real browser accepted card intent auto-pushes opponent state without manual refresh',
      playA.stateVersion > activeA.stateVersion
        && afterPlayB.self?.hp < activeB.self?.hp
        && afterPlayB.opponent?.handCount >= 0,
      JSON.stringify({ playA, afterPlayB }),
    );

    await seatA.page.evaluate(async () => {
      await window.PVPScene.endLiveTurn();
    });
    const afterEndTurnB = await waitForLiveSnapshot(seatB.page, expectedVersion => {
      const snapshot = window.PVPScene?.getLiveSnapshot?.();
      return snapshot?.currentSeat === 'B' && Number(snapshot?.stateVersion || 0) > expectedVersion;
    }, afterPlayB.stateVersion || activeB.stateVersion);
    const seatBTimerProbe = await seatB.page.evaluate(() => ({
      text: document.querySelector('[data-live-turn-timer]')?.textContent || '',
      payload: window.PVPScene.getLiveSnapshot()?.turnTimer || null,
    }));
    add(
      'real browser end turn switches authoritative action countdown to opponent',
      afterEndTurnB.currentSeat === 'B'
        && /行动倒计时/.test(seatBTimerProbe.text)
        && /B/.test(seatBTimerProbe.text)
        && seatBTimerProbe.payload?.currentSeat === 'B'
        && seatBTimerProbe.payload?.isViewerTurn === true,
      JSON.stringify({ afterEndTurnB, seatBTimerProbe }),
    );

    await seatB.page.evaluate(async () => {
      await window.PVPScene.surrenderLiveMatch();
    });
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
      settlementText: document.querySelector('[data-live-settlement-report]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      settlementSource: document.querySelector('[data-live-settlement-report]')?.getAttribute('data-live-settlement-source') || '',
      settlementHidden: document.querySelector('[data-live-settlement-report]')?.getAttribute('data-live-settlement-hidden') || '',
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
        && postMatchProbe.textPayload?.settlementReport?.reportVersion === 'pvp-live-settlement-report-v1',
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

    await seatB.page.click('[data-live-post-review-action="friendly_rematch"]', { timeout: 5000, force: true });
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
        && friendlyRematchProbe.snapshot?.rankedImpact === 'none',
      JSON.stringify(friendlyRematchProbe),
    );
    await seatA.page.click('[data-live-post-review-action="friendly_rematch"]', { timeout: 5000, force: true });
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
