import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

const appUrl = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/browser-backend-client-smoke';
const port = Number(process.env.BROWSER_BACKEND_SMOKE_PORT || 9021);
const apiUrl = `http://127.0.0.1:${port}`;
const runId = `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
const password = `pwd_${runId}`;
const realm = Math.max(1, Math.min(18, Math.floor(Number(process.env.BROWSER_BACKEND_SMOKE_REALM || 6) || 6)));
const dbPath = process.env.BROWSER_BACKEND_SMOKE_DB_PATH || path.join(os.tmpdir(), `the-defier-browser-backend-${process.pid}.sqlite`);
const navigationTimeoutMs = Math.max(30000, Math.floor(Number(process.env.BROWSER_BACKEND_SMOKE_NAVIGATION_TIMEOUT_MS) || 60000));

fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function usesHttpsAppWithLoopbackApi(targetApiUrl = apiUrl) {
  try {
    const app = new URL(appUrl);
    const api = new URL(targetApiUrl);
    return app.protocol === 'https:'
      && api.protocol === 'http:'
      && ['127.0.0.1', 'localhost', '::1'].includes(api.hostname);
  } catch {
    return false;
  }
}

function chromiumLaunchArgsForLocalApi(targetApiUrl = apiUrl, extraArgs = []) {
  const args = [...extraArgs];
  if (usesHttpsAppWithLoopbackApi(targetApiUrl)) {
    args.push(
      '--disable-web-security',
      '--allow-running-insecure-content',
      '--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults',
    );
  }
  return args;
}

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

function recordConsoleError(text) {
  const message = String(text || '');
  if (/ERR_CONNECTION_(CLOSED|RESET)/.test(message)) return;
  if (/ERR_NETWORK_CHANGED/.test(message)) return;
  if (/Failed to load resource: net::ERR_FILE_NOT_FOUND/.test(message)) return;
  consoleErrors.push(message);
}

function startBackend(options = {}) {
  const backendPort = Number(options.port || port);
  const backendDbPath = options.dbPath || dbPath;
  const allowClientResult = options.allowClientResult === true;
  const child = spawn(process.execPath, ['server/app.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(backendPort),
      JWT_SECRET: 'integration-jwt-secret-32-characters',
      DEFIER_HMAC_SECRET: 'integration-hmac-secret-32-characters',
      DEFIER_INTEGRITY_REQUIRED: '1',
      DEFIER_PVP_ALLOW_CLIENT_REPORTED_RESULT: allowClientResult ? '1' : '',
      DEFIER_PVP_TEST_MODE: allowClientResult ? '1' : '',
      DEFIER_DB_PATH: backendDbPath,
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

async function waitForHealth(server, targetApiUrl = apiUrl) {
  const deadline = Date.now() + 10000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${targetApiUrl}/api/health`);
      const payload = await res.json();
      if (res.status === 200 && payload?.status === 'ok') return;
      lastError = new Error(`health returned ${res.status}: ${JSON.stringify(payload)}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  const output = server ? `\nServer output:\n${server.getOutput()}` : '';
  throw new Error(`backend health check timed out: ${lastError?.message || 'unknown'}${output}`);
}

function writeReport() {
  const report = {
    url: appUrl,
    apiUrl,
    localLoopbackApiFromHttpsApp: usesHttpsAppWithLoopbackApi(),
    generatedAt: new Date().toISOString(),
    summary: {
      total: findings.length,
      failed: findings.filter(item => item.pass === false).length,
      consoleErrors: consoleErrors.length,
    },
    findings,
    consoleErrors,
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
}

async function runBrowserSmoke(page, targetApiUrl = apiUrl) {
  await page.addInitScript((targetApiUrl) => {
    try {
      localStorage.setItem('theDefierDebug', 'true');
      localStorage.setItem('theDefierServerConfig', JSON.stringify({ baseUrl: targetApiUrl }));
      localStorage.removeItem('theDefierServerSession');
      localStorage.removeItem('theDefierSave');
      localStorage.removeItem('theDefierPvpLocalRankV1');
      localStorage.removeItem('theDefierPvpLocalSnapshotV1');
      localStorage.removeItem('theDefierPvpPracticeSeedV1');
      localStorage.removeItem('theDefierPvpActiveMatchV1');
      Object.keys(localStorage)
        .filter(key => key.startsWith('theDefierPvpEconomyV1:'))
        .forEach(key => localStorage.removeItem(key));
      sessionStorage.removeItem('currentSaveSlot');
      sessionStorage.removeItem('theDefierPvpActiveMatchV1');
    } catch {}
  }, targetApiUrl);

  await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs });
  await page.waitForFunction(
    () => !!window.game && !!window.__THE_DEFIER_SERVICES__?.BackendClient && !!window.PVPService,
    null,
    { timeout: 12000 }
  );

  const result = await page.evaluate(async ({ runId, password, realm }) => {
    const services = window.__THE_DEFIER_SERVICES__;
    const BackendClient = services?.BackendClient;
    const AuthService = services?.AuthService;
    if (!BackendClient) throw new Error('BackendClient service was not exposed in debug mode');

    BackendClient.REQUEST_TIMEOUT_MS = 8000;
    BackendClient.NETWORK_RETRY = 0;
    BackendClient.clearServerSession();
    const init = BackendClient.init();
    if (!init?.success) throw new Error(`BackendClient init failed: ${init?.message || BackendClient.initError || 'unknown'}`);

    const assertStep = (condition, message, detail = null) => {
      if (!condition) {
        throw new Error(`${message}${detail ? `: ${JSON.stringify(detail)}` : ''}`);
      }
    };
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const mainName = `browser_${runId}`;
    const opponentName = `browser_opp_${runId}`;
    const pvpDeck = [
      'strike',
      'heavyStrike',
      'quickSlash',
      'defend',
      'ironWill',
      'shieldBash',
      'spiritBoost',
      'meditation',
    ];
    const mainPvpBattleData = {
      me: {
        maxHp: 360,
        energy: 4,
        currEnergy: 4,
      },
      deck: pvpDeck.map(id => ({ id })),
      aiProfile: 'balanced',
      deckArchetype: 'balanced',
      ruleVersion: 'browser-smoke-pvp',
    };
    const opponentPvpBattleData = {
      me: {
        maxHp: 420,
        energy: 5,
        currEnergy: 5,
      },
      deck: ['mirrorWall', 'ironBreath', 'reboundingShell', 'bastionStudy', 'wardingSweep', 'defend', 'ironWill', 'shieldBash']
        .map(id => ({ id })),
      aiProfile: 'fortified',
      deckArchetype: 'fortified',
      ruleVersion: 'browser-smoke-pvp',
      personalityRules: {
        damageMul: 0.92,
        takenMul: 0.85,
        regenEnergyPerTurn: 1,
        hpMul: 1.08,
      },
    };
    const mainReg = await BackendClient.register(mainName, password);
    assertStep(mainReg.success, 'main registration failed', mainReg);
    const mainLogin = await BackendClient.login(mainName, password);
    assertStep(mainLogin.success, 'main login failed', mainLogin);
    assertStep(AuthService && typeof AuthService.saveCloudData === 'function', 'AuthService service was not exposed in debug mode');
    AuthService.init?.();
    const PVPService = window.PVPService || services?.PVPService;
    assertStep(PVPService && typeof PVPService.syncRank === 'function', 'PVPService service was not exposed in debug mode');
    PVPService.context = {
      ...(PVPService.context || {}),
      authService: AuthService,
    };
    PVPService.currentRankData = null;
    PVPService.clearActiveMatch?.();
    PVPService.loadEconomyState?.();
    const mainInitialRank = await PVPService.syncRank();
    assertStep(PVPService.isServerPvpAvailable?.(), 'PVPService did not detect Node backend availability');
    assertStep(mainInitialRank?.isServer === true && mainInitialRank?.user?.username === mainName, 'main PVP rank did not come from Node backend', mainInitialRank);
    const mainPvpUpload = await PVPService.uploadSnapshot({
      realm,
      powerScore: 1480,
      data: mainPvpBattleData,
      personality: 'balanced',
      guardianFormation: true,
    });
    assertStep(mainPvpUpload.success && mainPvpUpload.server === true, 'main PVP defense upload did not use Node backend', mainPvpUpload);
    const mainPvpDefenseDirect = await BackendClient.getPvpDefenseSnapshot();
    assertStep(mainPvpDefenseDirect.success && mainPvpDefenseDirect.snapshot?.isServer === true, 'main PVP defense direct backend read failed', mainPvpDefenseDirect);
    const mainPvpDefenseDirectDeck = Array.isArray(mainPvpDefenseDirect.snapshot?.battleData?.deck)
      ? mainPvpDefenseDirect.snapshot.battleData.deck
      : [];
    assertStep(mainPvpDefenseDirectDeck.some(card => card?.id === 'heavyStrike'), 'main PVP direct backend defense deck did not preserve real card data', mainPvpDefenseDirectDeck);
    localStorage.removeItem(PVPService.localSnapshotStorageKey || 'theDefierPvpLocalSnapshotV1');
    const mainPvpDefense = await PVPService.getMyDefenseSnapshot();
    const mainPvpDefenseDeck = typeof mainPvpDefense?.data === 'string'
      ? JSON.parse(mainPvpDefense.data).deck
      : mainPvpDefense?.battleData?.deck || mainPvpDefense?.data?.deck || [];
    assertStep(mainPvpDefense?.isServer === true, 'main PVPService defense snapshot was not read from Node backend after cache clear', mainPvpDefense);
    assertStep(Array.isArray(mainPvpDefenseDeck) && mainPvpDefenseDeck.some(card => card?.id === 'heavyStrike'), 'main PVPService defense deck did not preserve real card data after cache clear', mainPvpDefenseDeck);

    const savePayload = {
      marker: runId,
      timestamp: Date.now(),
      player: {
        characterId: 'linFeng',
        realm: 2,
        currentHp: 88,
        maxHp: 120,
      },
      currentScreen: 'map-screen',
    };
    const saveWrite = await BackendClient.saveCloudData(savePayload, 0);
    assertStep(saveWrite.success && saveWrite.skipped === false, 'cloud save write failed', saveWrite);
    assertStep(saveWrite.saveTime === savePayload.timestamp, 'cloud save did not expose server save time', saveWrite);
    const saveRead = await BackendClient.getCloudData();
    assertStep(saveRead.success && saveRead.slots?.[0]?.marker === runId, 'cloud save read did not return browser payload', saveRead);

    const futureSavePayload = {
      marker: `future_${runId}`,
      timestamp: Date.now() + 6 * 24 * 60 * 60 * 1000,
      player: { characterId: 'linFeng', realm: 2, currentHp: 90, maxHp: 120 },
      currentScreen: 'map-screen',
    };
    const futureSaveWrite = await BackendClient.saveCloudData(futureSavePayload, 1);
    assertStep(futureSaveWrite.success && futureSaveWrite.skipped === false, 'future cloud save write failed', futureSaveWrite);
    assertStep(futureSaveWrite.saveTime < futureSavePayload.timestamp, 'future cloud save timestamp was not canonicalized', futureSaveWrite);
    await delay(20);
    const normalAfterFutureSavePayload = {
      marker: `normal_after_future_${runId}`,
      timestamp: Date.now(),
      player: { characterId: 'linFeng', realm: 2, currentHp: 92, maxHp: 120 },
      currentScreen: 'map-screen',
    };
    const normalAfterFutureSave = await BackendClient.saveCloudData(normalAfterFutureSavePayload, 1, {
      baseRevisionId: futureSaveWrite.revisionId,
    });
    assertStep(normalAfterFutureSave.success && normalAfterFutureSave.skipped === false, 'normal cloud save after future timestamp was skipped', normalAfterFutureSave);
    assertStep(normalAfterFutureSave.revisionNumber === futureSaveWrite.revisionNumber + 1, 'normal cloud save did not advance from the future-write revision', normalAfterFutureSave);
    const saveReadAfterFuture = await BackendClient.getCloudData();
    assertStep(saveReadAfterFuture.success && saveReadAfterFuture.slots?.[1]?.marker === normalAfterFutureSavePayload.marker, 'future timestamp prevented the next CAS write', saveReadAfterFuture);

    AuthService.latestSaveTimeBySlot = {};
    AuthService.saveQueueBySlot = {};
    const authFuturePayload = {
      marker: `auth_future_${runId}`,
      timestamp: Date.now() + 6 * 24 * 60 * 60 * 1000,
      player: { characterId: 'linFeng', realm: 2, currentHp: 94, maxHp: 120 },
      currentScreen: 'map-screen',
    };
    const authFutureWrite = await AuthService.saveCloudData(authFuturePayload, 2);
    assertStep(authFutureWrite.success && authFutureWrite.skipped === false, 'AuthService future save failed', authFutureWrite);
    assertStep(authFutureWrite.saveTime < authFuturePayload.timestamp, 'AuthService did not expose canonical save time', authFutureWrite);
    await delay(20);
    const authNormalPayload = {
      marker: `auth_normal_${runId}`,
      timestamp: Date.now(),
      player: { characterId: 'linFeng', realm: 2, currentHp: 96, maxHp: 120 },
      currentScreen: 'map-screen',
    };
    const authNormalWrite = await AuthService.saveCloudData(authNormalPayload, 2);
    assertStep(authNormalWrite.success && authNormalWrite.skipped === false, 'AuthService normal save after canonicalized future timestamp was locally skipped', authNormalWrite);

    const globalPayload = {
      marker: runId,
      achievements: { browserBackendSmoke: true },
      updatedAt: Date.now(),
    };
    const globalWrite = await BackendClient.saveGlobalData(globalPayload);
    assertStep(globalWrite.success && globalWrite.skipped === false, 'global data write failed', globalWrite);
    assertStep(globalWrite.globalUpdatedAt === globalPayload.updatedAt, 'global write did not expose server timestamp', globalWrite);
    const globalRead = await BackendClient.getGlobalData();
    assertStep(globalRead.success && globalRead.data?.marker === runId, 'global data read did not return browser payload', globalRead);

    const futureGlobalPayload = {
      marker: `future_global_${runId}`,
      achievements: { browserFutureGlobal: true },
      updatedAt: Date.now() + 6 * 24 * 60 * 60 * 1000,
    };
    const futureGlobalWrite = await BackendClient.saveGlobalData(futureGlobalPayload, {
      baseRevisionId: globalWrite.revisionId,
    });
    assertStep(futureGlobalWrite.success && futureGlobalWrite.skipped === false, 'future global data write failed', futureGlobalWrite);
    assertStep(futureGlobalWrite.globalUpdatedAt < futureGlobalPayload.updatedAt, 'future global timestamp was not canonicalized', futureGlobalWrite);
    await delay(20);
    const normalAfterFutureGlobalPayload = {
      marker: `normal_after_future_global_${runId}`,
      achievements: { browserNormalAfterFutureGlobal: true },
      updatedAt: Date.now(),
    };
    const normalAfterFutureGlobal = await BackendClient.saveGlobalData(normalAfterFutureGlobalPayload, {
      baseRevisionId: futureGlobalWrite.revisionId,
    });
    assertStep(normalAfterFutureGlobal.success && normalAfterFutureGlobal.skipped === false, 'normal global write after future timestamp was skipped', normalAfterFutureGlobal);
    assertStep(normalAfterFutureGlobal.revisionNumber === futureGlobalWrite.revisionNumber + 1, 'normal global write did not advance from the future-write revision', normalAfterFutureGlobal);
    const globalReadAfterFuture = await BackendClient.getGlobalData();
    assertStep(globalReadAfterFuture.success && globalReadAfterFuture.data?.marker === normalAfterFutureGlobalPayload.marker, 'future timestamp prevented the next global CAS write', globalReadAfterFuture);

    const mainGhostPlayer = {
      characterId: mainName,
      currentHp: 500,
      maxHp: 1000,
      deck: [{ id: 'audit_strike' }],
      treasures: [],
      collectedLaws: [],
    };
    const mainGhost = await BackendClient.uploadGhostData(mainGhostPlayer, realm);
    assertStep(mainGhost.success && mainGhost.skipped === false, 'main ghost upload failed', mainGhost);
    assertStep(Number.isFinite(mainGhost.uploadTime), 'main ghost upload did not expose server timestamp', mainGhost);

    const opponentReg = await BackendClient.register(opponentName, password);
    assertStep(opponentReg.success, 'opponent registration failed', opponentReg);
    const opponentInitialRank = await PVPService.syncRank();
    assertStep(opponentInitialRank?.isServer === true && opponentInitialRank?.user?.username === opponentName, 'opponent PVP rank did not come from Node backend', opponentInitialRank);
    const opponentPvpUpload = await PVPService.uploadSnapshot({
      realm,
      powerScore: 1730,
      data: opponentPvpBattleData,
      personality: 'fortified',
      guardianFormation: false,
    });
    assertStep(opponentPvpUpload.success && opponentPvpUpload.server === true, 'opponent PVP defense upload did not use Node backend', opponentPvpUpload);
    const opponentRankRead = await BackendClient.getPvpRank();
    assertStep(opponentRankRead.success && opponentRankRead.rank?.user?.username === opponentName, 'opponent PVP rank read failed', opponentRankRead);
    const opponentDefenseRead = await BackendClient.getPvpDefenseSnapshot();
    assertStep(opponentDefenseRead.success && opponentDefenseRead.snapshot?.isServer === true, 'opponent PVP defense read failed', opponentDefenseRead);
    const opponentGhostPlayer = {
      characterId: opponentName,
      currentHp: 520,
      maxHp: 1000,
      deck: [{ id: 'audit_guard' }],
      treasures: [],
      collectedLaws: [],
    };
    const opponentGhost = await BackendClient.uploadGhostData(opponentGhostPlayer, realm);
    assertStep(opponentGhost.success && opponentGhost.skipped === false, 'opponent ghost upload failed', opponentGhost);
    assertStep(Number.isFinite(opponentGhost.uploadTime), 'opponent ghost upload did not expose server timestamp', opponentGhost);

    const reloginMain = await BackendClient.login(mainName, password);
    assertStep(reloginMain.success, 'main relogin failed', reloginMain);
    PVPService.clearActiveMatch?.();
    const mainRankBeforeMatch = await PVPService.syncRank();
    assertStep(mainRankBeforeMatch?.isServer === true && mainRankBeforeMatch?.user?.username === mainName, 'main PVP rank after relogin did not come from Node backend', mainRankBeforeMatch);
    const pvpLeaderboard = await PVPService.getLeaderboard();
    const pvpLeaderboardOpponent = Array.isArray(pvpLeaderboard)
      ? pvpLeaderboard.find(item => item?.user?.username === opponentName)
      : null;
    assertStep(pvpLeaderboardOpponent?.hasDefenseSnapshot === true, 'PVP leaderboard did not include opponent server defense marker', pvpLeaderboard);
    const pvpMatch = await PVPService.findOpponent(mainRankBeforeMatch.score, realm, {
      preferredRank: opponentRankRead.rank,
      allowPractice: false,
    });
    assertStep(pvpMatch.success && pvpMatch.opponent?.rank?.user?.username === opponentName, 'PVP server matchmaking did not return the requested opponent', pvpMatch);
    const pvpActiveMatch = PVPService.activeMatch || null;
    const pvpMatchTicket = pvpMatch.opponent?.matchTicket || '';
    const pvpOpponentDeck = Array.isArray(pvpMatch.opponent?.battleData?.deck) ? pvpMatch.opponent.battleData.deck : [];
    assertStep(pvpActiveMatch?.serverMatch === true && pvpActiveMatch?.localPractice !== true, 'PVP active match was not marked as a server match', pvpActiveMatch);
    assertStep(pvpMatchTicket && !pvpMatchTicket.startsWith('practice:'), 'PVP matchmaking returned a practice ticket', { pvpMatchTicket });
    assertStep(pvpOpponentDeck.some(card => card?.id === 'mirrorWall'), 'PVP matchmaking did not return opponent server battle data', pvpOpponentDeck);
    const serverRankBeforeSettlement = await BackendClient.getPvpRank();
    assertStep(serverRankBeforeSettlement.success, 'PVP server rank read before settlement failed', serverRankBeforeSettlement);
    const pvpSettlement = await PVPService.reportMatchResult(true, pvpMatch.opponent.rank, pvpMatchTicket);
    assertStep(pvpSettlement && pvpSettlement.rejected !== true && Number(pvpSettlement.coinsAwarded) > 0, 'PVP local settlement fallback failed under default server authority gate', pvpSettlement);
    assertStep(
      pvpSettlement.settlementSource === 'local_authority_gate'
        && /本地演武回执/.test(pvpSettlement.settlementLine || '')
        && /服务端权威结算未启用/.test(pvpSettlement.settlementLine || ''),
      'PVP default authority-gate fallback should expose exact local authority receipt',
      pvpSettlement
    );
    const serverRankAfterSettlement = await BackendClient.getPvpRank();
    assertStep(serverRankAfterSettlement.success, 'PVP server rank read after settlement failed', serverRankAfterSettlement);
    assertStep(
      serverRankAfterSettlement.rank?.score === serverRankBeforeSettlement.rank?.score
        && serverRankAfterSettlement.rank?.wins === serverRankBeforeSettlement.rank?.wins
        && serverRankAfterSettlement.rank?.losses === serverRankBeforeSettlement.rank?.losses,
      'default PVP client-reported settlement changed server rank',
      { serverRankBeforeSettlement, serverRankAfterSettlement, pvpSettlement }
    );
    const randomGhost = await BackendClient.fetchRandomGhost(realm);
    assertStep(randomGhost.success, 'random ghost fetch failed', randomGhost);
    const fetchedGhostUser = String(randomGhost.data?.userName || '');
    const fetchedGhostPayloadName = String(randomGhost.data?.ghostData?.name || '');
    assertStep(fetchedGhostUser !== mainName, 'random ghost fetch returned current user', {
      mainName,
      opponentName,
      randomGhost
    });
    assertStep(fetchedGhostPayloadName === opponentName, 'random ghost payload did not match opponent', {
      mainName,
      opponentName,
      fetchedGhostUser,
      fetchedGhostPayloadName,
      randomGhost
    });

    return {
      mainName,
      opponentName,
      realm,
      saveTime: saveWrite.saveTime,
      globalUpdatedAt: globalWrite.globalUpdatedAt,
      mainGhostUploadTime: mainGhost.uploadTime,
      opponentGhostUploadTime: opponentGhost.uploadTime,
      fetchedGhostUser,
      fetchedGhostPayloadName,
      pvpProbe: {
        mainRankUser: mainInitialRank.user?.username || '',
        mainRankServer: mainInitialRank.isServer === true,
        mainDefenseDirectServer: mainPvpDefenseDirect.snapshot?.isServer === true,
        mainDefenseServiceServerAfterCacheClear: mainPvpDefense.isServer === true,
        mainDefenseServer: mainPvpDefenseDirect.snapshot?.isServer === true && mainPvpDefense.isServer === true,
        mainDefenseDirectDeckIds: mainPvpDefenseDirectDeck.map(card => card?.id || ''),
        mainDefenseDeckIds: mainPvpDefenseDeck.map(card => card?.id || ''),
        opponentRankUser: opponentInitialRank.user?.username || '',
        opponentRankServer: opponentInitialRank.isServer === true,
        opponentDefenseServer: opponentDefenseRead.snapshot?.isServer === true,
        leaderboardHasOpponent: !!pvpLeaderboardOpponent,
        leaderboardOpponentHasDefense: pvpLeaderboardOpponent?.hasDefenseSnapshot === true,
        matchedOpponentName: pvpMatch.opponent?.rank?.user?.username || '',
        serverMatch: pvpActiveMatch?.serverMatch === true,
        localPractice: pvpActiveMatch?.localPractice === true,
        matchTicket: pvpMatchTicket,
        opponentDeckIds: pvpOpponentDeck.map(card => card?.id || ''),
        settlementFallbackLocal: pvpSettlement.rejected !== true && Number(pvpSettlement.coinsAwarded) > 0,
        settlementSource: pvpSettlement.settlementSource || '',
        settlementLine: pvpSettlement.settlementLine || '',
        serverScoreBeforeSettlement: serverRankBeforeSettlement.rank?.score,
        serverScoreAfterSettlement: serverRankAfterSettlement.rank?.score,
        serverWinsBeforeSettlement: serverRankBeforeSettlement.rank?.wins,
        serverWinsAfterSettlement: serverRankAfterSettlement.rank?.wins,
        serverLossesBeforeSettlement: serverRankBeforeSettlement.rank?.losses,
        serverLossesAfterSettlement: serverRankAfterSettlement.rank?.losses,
      },
    };
  }, { runId, password, realm });

  const ghostMapSetup = await page.evaluate(async ({ realm }) => {
    const game = window.game;
    if (!game) throw new Error('game instance is not available for ghost duel UI probe');
    game.startNewGame('linFeng', {
      runDestinyId: 'foldedEdge',
      spiritCompanionId: 'swordWraith',
      runPathId: 'insight',
    });
    game.startRealm(realm, false);
    const nodes = Array.isArray(game.map?.nodes) ? game.map.nodes.flat() : [];
    const node = nodes.find(item => item && item.accessible && !item.completed);
    if (!node) throw new Error('no accessible map node available for ghost duel UI probe');
    node.type = 'ghost_duel';
    node.icon = typeof game.map.getNodeIcon === 'function' ? game.map.getNodeIcon('ghost_duel') : '👻';
    node.accessible = true;
    node.completed = false;
    node.polluted = false;
    if (typeof game.map.render === 'function') game.map.render();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      nodeId: node.id,
      goldBefore: game.player?.gold ?? null,
      currentScreen: game.currentScreen || '',
      realm: game.player?.realm ?? null,
    };
  }, { realm });
  const ghostNodeSelector = `#map-screen .map-node-v3.ghost_duel.current[data-node-id="${ghostMapSetup.nodeId}"]`;
  await page.waitForSelector(ghostNodeSelector, { timeout: 12000 });
  await safeAuditScreenshot(page, path.join(outDir, 'browser-backend-ghost-duel-map.png'), 'browser_backend_client_ghost_duel_map', {
    fullPage: false,
    timeout: 8000,
  });
  const ghostClickPoint = await page.evaluate((selector) => {
    const nodeEl = document.querySelector(selector);
    if (!nodeEl) return null;
    nodeEl.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = nodeEl.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const topEl = document.elementFromPoint(x, y);
    return {
      x,
      y,
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
      topClass: topEl?.className || '',
      topTag: topEl?.tagName || '',
    };
  }, ghostNodeSelector);
  if (!ghostClickPoint) {
    throw new Error(`ghost duel node was not found for click: ${ghostNodeSelector}`);
  }
  await page.mouse.click(ghostClickPoint.x, ghostClickPoint.y);
  await page.waitForFunction(
    ({ nodeId, opponentName, goldBefore }) => {
      const game = window.game;
      const enemy = game?.currentEnemies?.[0] || null;
      const enemyNameText = document.querySelector('#enemy-container .enemy-name')?.textContent || '';
      return game?.currentScreen === 'battle-screen'
        && document.body?.dataset?.currentScreen === 'battle-screen'
        && !!document.querySelector('#battle-screen.active')
        && game?.currentBattleNode?.id === nodeId
        && game?.currentBattleNode?.type === 'ghost_duel'
        && enemy?.id === 'ghost_demon'
        && enemy?.icon === '👻'
        && enemy?.ghostPayload?.name === opponentName
        && game?.player?.gold === goldBefore
        && enemyNameText.includes(`【心魔】${opponentName}`);
    },
    {
      nodeId: ghostMapSetup.nodeId,
      opponentName: result.opponentName,
      goldBefore: ghostMapSetup.goldBefore,
    },
    { timeout: 12000 }
  );
  const ghostBattleProbe = await page.evaluate(({ nodeId, opponentName, goldBefore }) => {
    const game = window.game;
    const enemy = game?.currentEnemies?.[0] || null;
    const enemyNameText = document.querySelector('#enemy-container .enemy-name')?.textContent || '';
    return {
      nodeId,
      opponentName,
      currentScreen: game?.currentScreen || '',
      bodyScreen: document.body?.dataset?.currentScreen || '',
      battleScreenActive: !!document.querySelector('#battle-screen.active'),
      currentBattleNodeId: game?.currentBattleNode?.id ?? null,
      currentBattleNodeType: game?.currentBattleNode?.type || '',
      enemyId: enemy?.id || '',
      enemyName: enemy?.name || '',
      enemyNameText,
      enemyIcon: enemy?.icon || '',
      ghostPayloadName: enemy?.ghostPayload?.name || '',
      ghostPayloadDeckIds: Array.isArray(enemy?.ghostPayload?.deck) ? enemy.ghostPayload.deck.map(card => card?.id || '') : [],
      goldBefore,
      goldAfter: game?.player?.gold ?? null,
      fallbackCompensationAvoided: game?.player?.gold === goldBefore,
      opponentGhostMatched: enemy?.ghostPayload?.name === opponentName,
      enemyNameRendered: enemyNameText.includes(`【心魔】${opponentName}`),
    };
  }, {
    nodeId: ghostMapSetup.nodeId,
    opponentName: result.opponentName,
    goldBefore: ghostMapSetup.goldBefore,
  });
  await safeAuditScreenshot(page, path.join(outDir, 'browser-backend-ghost-duel-battle.png'), 'browser_backend_client_ghost_duel_battle', {
    fullPage: false,
    timeout: 8000,
  });

  await safeAuditScreenshot(page, path.join(outDir, 'browser-backend-client-smoke.png'), 'browser_backend_client_smoke', {
    fullPage: false,
    timeout: 8000,
  });

  return {
    ...result,
    ghostMapSetup,
    ghostClickPoint,
    ghostBattleProbe,
  };
}

async function runAuthoritativePvpSettlementSmoke(browser) {
  const authorityPort = Number(process.env.BROWSER_BACKEND_AUTHORITY_SMOKE_PORT || port + 1);
  const authorityApiUrl = `http://127.0.0.1:${authorityPort}`;
  const authorityDbPath = path.join(os.tmpdir(), `the-defier-browser-backend-authority-${process.pid}.sqlite`);
  const authorityRunId = `authority_${runId}`;
  const server = startBackend({
    port: authorityPort,
    dbPath: authorityDbPath,
    allowClientResult: true,
  });
  let page = null;
  try {
    await waitForHealth(server, authorityApiUrl);
    page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    page.on('console', (msg) => {
      if (msg.type() === 'error') recordConsoleError(msg.text());
    });
    page.on('pageerror', err => recordConsoleError(String(err)));
    await page.addInitScript((targetApiUrl) => {
      try {
        localStorage.setItem('theDefierDebug', 'true');
        localStorage.setItem('theDefierServerConfig', JSON.stringify({ baseUrl: targetApiUrl }));
        localStorage.removeItem('theDefierServerSession');
        localStorage.removeItem('theDefierSave');
        localStorage.removeItem('theDefierPvpLocalRankV1');
        localStorage.removeItem('theDefierPvpLocalSnapshotV1');
        localStorage.removeItem('theDefierPvpPracticeSeedV1');
        localStorage.removeItem('theDefierPvpActiveMatchV1');
        Object.keys(localStorage)
          .filter(key => key.startsWith('theDefierPvpEconomyV1:'))
          .forEach(key => localStorage.removeItem(key));
        sessionStorage.removeItem('currentSaveSlot');
        sessionStorage.removeItem('theDefierPvpActiveMatchV1');
      } catch {}
    }, authorityApiUrl);
    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs });
    await page.waitForFunction(
      () => !!window.game && !!window.__THE_DEFIER_SERVICES__?.BackendClient && !!window.PVPService,
      null,
      { timeout: 12000 }
    );

    const result = await page.evaluate(async ({ runId, password, realm }) => {
      const services = window.__THE_DEFIER_SERVICES__;
      const BackendClient = services?.BackendClient;
      const AuthService = services?.AuthService;
      const PVPService = window.PVPService || services?.PVPService;
      if (!BackendClient) throw new Error('BackendClient service was not exposed in authority smoke');
      if (!AuthService) throw new Error('AuthService service was not exposed in authority smoke');
      if (!PVPService) throw new Error('PVPService service was not exposed in authority smoke');

      const assertStep = (condition, message, detail = null) => {
        if (!condition) {
          throw new Error(`${message}${detail ? `: ${JSON.stringify(detail)}` : ''}`);
        }
      };
      const mainName = `browser_auth_${runId}`;
      const opponentName = `browser_auth_opp_${runId}`;
      const mainDeck = ['strike', 'heavyStrike', 'quickSlash', 'defend', 'ironWill', 'shieldBash', 'spiritBoost', 'meditation'];
      const opponentDeck = ['mirrorWall', 'ironBreath', 'reboundingShell', 'bastionStudy', 'wardingSweep', 'defend', 'ironWill', 'shieldBash'];

      BackendClient.REQUEST_TIMEOUT_MS = 8000;
      BackendClient.NETWORK_RETRY = 0;
      BackendClient.clearServerSession();
      const init = BackendClient.init();
      assertStep(init?.success, 'BackendClient init failed for authority smoke', init);
      AuthService.init?.();
      PVPService.context = {
        ...(PVPService.context || {}),
        authService: AuthService,
      };

      const mainReg = await BackendClient.register(mainName, password);
      assertStep(mainReg.success, 'authority main registration failed', mainReg);
      const mainLogin = await BackendClient.login(mainName, password);
      assertStep(mainLogin.success, 'authority main login failed', mainLogin);
      PVPService.currentRankData = null;
      PVPService.clearActiveMatch?.();
      const mainInitialRank = await PVPService.syncRank();
      assertStep(mainInitialRank?.isServer === true && mainInitialRank?.user?.username === mainName, 'authority main rank did not come from Node backend', mainInitialRank);
      const mainUpload = await PVPService.uploadSnapshot({
        realm,
        powerScore: 1500,
        data: {
          me: { maxHp: 360, energy: 4, currEnergy: 4 },
          deck: mainDeck.map(id => ({ id })),
          aiProfile: 'balanced',
          deckArchetype: 'balanced',
          ruleVersion: 'browser-authority-pvp',
        },
        personality: 'balanced',
      });
      assertStep(mainUpload.success && mainUpload.server === true, 'authority main defense upload failed', mainUpload);

      const opponentReg = await BackendClient.register(opponentName, password);
      assertStep(opponentReg.success, 'authority opponent registration failed', opponentReg);
      const opponentLogin = await BackendClient.login(opponentName, password);
      assertStep(opponentLogin.success, 'authority opponent login failed', opponentLogin);
      PVPService.currentRankData = null;
      PVPService.clearActiveMatch?.();
      const opponentRank = await PVPService.syncRank();
      assertStep(opponentRank?.isServer === true && opponentRank?.user?.username === opponentName, 'authority opponent rank did not come from Node backend', opponentRank);
      const opponentUpload = await PVPService.uploadSnapshot({
        realm,
        powerScore: 1740,
        data: {
          me: { maxHp: 420, energy: 5, currEnergy: 5 },
          deck: opponentDeck.map(id => ({ id })),
          aiProfile: 'fortified',
          deckArchetype: 'fortified',
          ruleVersion: 'browser-authority-pvp',
        },
        personality: 'fortified',
      });
      assertStep(opponentUpload.success && opponentUpload.server === true, 'authority opponent defense upload failed', opponentUpload);

      const reloginMain = await BackendClient.login(mainName, password);
      assertStep(reloginMain.success, 'authority main relogin failed', reloginMain);
      PVPService.currentRankData = null;
      PVPService.clearActiveMatch?.();
      PVPService.loadEconomyState?.();
      const mainRankBefore = await PVPService.syncRank();
      const economyBefore = await BackendClient.getPvpEconomy();
      assertStep(mainRankBefore?.isServer === true && mainRankBefore?.user?.username === mainName, 'authority main rank before match failed', mainRankBefore);
      assertStep(economyBefore.success && Number.isFinite(Number(economyBefore.wallet?.coins)), 'authority economy before match failed', economyBefore);
      const match = await PVPService.findOpponent(mainRankBefore.score, realm, {
        preferredRank: opponentRank,
        allowPractice: false,
      });
      const ticket = match?.opponent?.matchTicket || '';
      const opponentDeckIds = Array.isArray(match?.opponent?.battleData?.deck)
        ? match.opponent.battleData.deck.map(card => card?.id || '')
        : [];
      assertStep(match?.success && match?.opponent?.rank?.user?.username === opponentName, 'authority server matchmaking did not return requested opponent', match);
      assertStep(PVPService.activeMatch?.serverMatch === true && PVPService.activeMatch?.localPractice !== true, 'authority active match was not a server match', PVPService.activeMatch);
      assertStep(ticket && !ticket.startsWith('practice:'), 'authority matchmaking returned a practice ticket', { ticket });
      assertStep(opponentDeckIds.includes('mirrorWall'), 'authority matchmaking did not return opponent battle data', opponentDeckIds);

      const settlement = await PVPService.reportMatchResult(true, match.opponent.rank, ticket);
      assertStep(settlement && settlement.rejected !== true && Number(settlement.delta) > 0 && Number(settlement.coinsAwarded) > 0, 'authority PVPService server settlement failed', settlement);
      assertStep(
        settlement.settlementSource === 'server_authoritative'
          && /服务端|权威/.test(settlement.settlementLine || '')
          && /Node/.test(settlement.settlementLine || ''),
        'authority PVPService settlement should expose a server-authoritative receipt',
        settlement
      );
      const rankAfter = await BackendClient.getPvpRank();
      const economyAfter = await BackendClient.getPvpEconomy();
      const localWallet = PVPService.getWalletSummary?.();
      assertStep(rankAfter.success && rankAfter.rank?.score === settlement.newRating && rankAfter.rank?.wins === (mainRankBefore.wins || 0) + 1, 'authority server rank did not match PVPService settlement', { rankAfter, settlement, mainRankBefore });
      assertStep(economyAfter.success && economyAfter.wallet?.coins === settlement.wallet?.coins, 'authority economy read did not match settlement wallet', { economyAfter, settlement });
      assertStep(localWallet?.coins === economyAfter.wallet?.coins, 'authority local PVP economy snapshot diverged from server wallet', { localWallet, economyAfter });
      assertStep(economyAfter.wallet.coins === economyBefore.wallet.coins + settlement.coinsAwarded, 'authority settlement appears to have double-awarded or missed coins', { economyBefore, economyAfter, settlement });

      if (typeof window.game?.showScreen === 'function') {
        window.game.showScreen('pvp-screen');
      }
      if (typeof window.PVPScene?.switchTab === 'function') {
        window.PVPScene.switchTab('ranking');
      }
      return {
        mainName,
        opponentName,
        realm,
        matchedOpponentName: match.opponent.rank.user.username,
        serverMatch: PVPService.activeMatch == null,
        matchTicket: ticket,
        opponentDeckIds,
        scoreBefore: mainRankBefore.score,
        scoreAfter: rankAfter.rank.score,
        winsBefore: mainRankBefore.wins || 0,
        winsAfter: rankAfter.rank.wins,
        coinsBefore: economyBefore.wallet.coins,
        coinsAfter: economyAfter.wallet.coins,
        coinsAwarded: settlement.coinsAwarded,
        localWalletCoins: localWallet?.coins,
        settlementSource: settlement.settlementSource || '',
        settlementLine: settlement.settlementLine || '',
        settlement,
      };
    }, { runId: authorityRunId, password, realm });

    await page.waitForFunction(
      ({ opponentName }) => {
        const payload = typeof window.render_game_to_text === 'function' ? JSON.parse(window.render_game_to_text()) : {};
        const rows = Array.from(document.querySelectorAll('#ranking-list .jade-slip-row'));
        return payload.mode === 'pvp-screen'
          && rows.some(row => (row.textContent || '').includes(opponentName))
          && !!document.querySelector('#tab-ranking .challenge-btn');
      },
      { opponentName: result.opponentName },
      { timeout: 12000 }
    );
    const uiSettlement = await page.evaluate(async ({ opponentName }) => {
      const assertStep = (condition, message, detail = null) => {
        if (!condition) {
          throw new Error(`${message}${detail ? `: ${JSON.stringify(detail)}` : ''}`);
        }
      };
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      const BackendClient = window.__THE_DEFIER_SERVICES__?.BackendClient;
      const PVPService = window.PVPService || window.__THE_DEFIER_SERVICES__?.PVPService;
      const PVPScene = window.PVPScene;
      assertStep(BackendClient && PVPService && PVPScene && window.game, 'authority UI smoke services missing');
      const rankBefore = await BackendClient.getPvpRank();
      const economyBefore = await BackendClient.getPvpEconomy();
      assertStep(rankBefore.success && economyBefore.success, 'authority UI pre-settlement backend reads failed', { rankBefore, economyBefore });
      const rows = Array.from(document.querySelectorAll('#ranking-list .jade-slip-row'));
      const targetRow = rows.find(row => (row.textContent || '').includes(opponentName));
      assertStep(targetRow, 'authority UI opponent row missing', rows.map(row => row.textContent || ''));
      targetRow.click();
      await delay(250);
      const focusPayload = JSON.parse(window.render_game_to_text());
      assertStep(focusPayload.pvp?.rankingFocus?.rank?.user?.username === opponentName, 'authority UI focus did not select opponent', focusPayload.pvp?.rankingFocus);
      const challengeBtn = document.querySelector('#tab-ranking .challenge-btn');
      assertStep(challengeBtn, 'authority UI challenge button missing');
      challengeBtn.click();
      const deadline = Date.now() + 12000;
      let battlePayload = null;
      while (Date.now() < deadline) {
        await delay(100);
        battlePayload = JSON.parse(window.render_game_to_text());
        if (battlePayload.mode === 'battle-screen' && battlePayload.pvp?.activeMatch?.ticket && PVPService.activeMatch?.serverMatch === true) break;
      }
      assertStep(
        battlePayload?.mode === 'battle-screen'
          && battlePayload.pvp?.activeMatch?.ticket
          && !String(battlePayload.pvp.activeMatch.ticket).startsWith('practice:')
          && PVPService.activeMatch?.serverMatch === true,
        'authority UI challenge did not enter a server PVP battle',
        { battlePayload, activeMatch: PVPService.activeMatch }
      );
      const enemies = window.game?.battle?.enemies || [];
      assertStep(Array.isArray(enemies) && enemies.length > 0, 'authority UI battle enemies missing');
      enemies.forEach(enemy => { enemy.currentHp = 0; });
      if (typeof window.game.battle.checkBattleEnd === 'function') {
        window.game.battle.checkBattleEnd();
      }
      let resultPayload = null;
      while (Date.now() < deadline + 12000) {
        await delay(150);
        resultPayload = JSON.parse(window.render_game_to_text());
        if (resultPayload.pvp?.resultOverlay?.settlementSource === 'server_authoritative') break;
      }
      const overlay = document.getElementById('pvp-result-overlay');
      const rankAfter = await BackendClient.getPvpRank();
      const economyAfter = await BackendClient.getPvpEconomy();
      const localWallet = PVPService.getWalletSummary?.();
      return {
        ok:
          !!overlay
          && overlay.style.display !== 'none'
          && resultPayload?.pvp?.resultOverlay?.settlementSource === 'server_authoritative'
          && /Node|服务端|权威/.test(resultPayload?.pvp?.resultOverlay?.settlementLine || '')
          && rankAfter.success
          && economyAfter.success
          && Number(rankAfter.rank?.wins) === Number(rankBefore.rank?.wins || 0) + 1
          && Number(rankAfter.rank?.score) > Number(rankBefore.rank?.score || 0)
          && Number(economyAfter.wallet?.coins) > Number(economyBefore.wallet?.coins || 0)
          && Number(localWallet?.coins) === Number(economyAfter.wallet?.coins),
        rankBefore: rankBefore.rank,
        rankAfter: rankAfter.rank,
        economyBefore: economyBefore.wallet,
        economyAfter: economyAfter.wallet,
        localWallet,
        resultOverlay: resultPayload?.pvp?.resultOverlay || null,
        overlayVisible: !!overlay && overlay.style.display !== 'none',
        activeMatchAfter: PVPService.activeMatch || null
      };
    }, { opponentName: result.opponentName });
    add(
      'browser online pvp screen drives authoritative settlement end-to-end',
      !!uiSettlement?.ok,
      JSON.stringify(uiSettlement || null)
    );

    await safeAuditScreenshot(page, path.join(outDir, 'browser-backend-pvp-authoritative-smoke.png'), 'browser_backend_pvp_authoritative_smoke', {
      fullPage: false,
      timeout: 8000,
    });
    return {
      authorityApiUrl,
      ...result,
    };
  } finally {
    if (page) await page.close().catch(() => {});
    await stopBackend(server);
  }
}

let server = null;
let browser = null;
try {
  server = startBackend();
  await waitForHealth(server);
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    args: chromiumLaunchArgsForLocalApi(apiUrl, ['--use-gl=angle', '--use-angle=swiftshader']),
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') recordConsoleError(msg.text());
  });
  page.on('pageerror', err => recordConsoleError(String(err)));

  const result = await runBrowserSmoke(page);
  const authorityResult = await runAuthoritativePvpSettlementSmoke(browser);
  add(
    'browser BackendClient register/login/save/global/ghost/fetch chain reaches ghost duel battle UI',
    !!result.ghostBattleProbe?.battleScreenActive
      && result.ghostBattleProbe.currentScreen === 'battle-screen'
      && result.ghostBattleProbe.bodyScreen === 'battle-screen'
      && result.ghostBattleProbe.currentBattleNodeType === 'ghost_duel'
      && result.ghostBattleProbe.enemyId === 'ghost_demon'
      && result.ghostBattleProbe.opponentGhostMatched
      && result.ghostBattleProbe.enemyNameRendered
      && result.ghostBattleProbe.fallbackCompensationAvoided,
    JSON.stringify(result)
  );
  add(
    'browser PVPService uses Node backend rank defense matchmaking and local authority-gate settlement fallback',
    result.pvpProbe?.mainRankServer === true
      && result.pvpProbe?.mainRankUser === result.mainName
      && result.pvpProbe?.mainDefenseDirectServer === true
      && result.pvpProbe?.mainDefenseServiceServerAfterCacheClear === true
      && result.pvpProbe?.mainDefenseServer === true
      && Array.isArray(result.pvpProbe?.mainDefenseDirectDeckIds)
      && result.pvpProbe.mainDefenseDirectDeckIds.includes('heavyStrike')
      && Array.isArray(result.pvpProbe?.mainDefenseDeckIds)
      && result.pvpProbe.mainDefenseDeckIds.includes('heavyStrike')
      && result.pvpProbe?.opponentRankServer === true
      && result.pvpProbe?.opponentRankUser === result.opponentName
      && result.pvpProbe?.opponentDefenseServer === true
      && result.pvpProbe?.leaderboardHasOpponent === true
      && result.pvpProbe?.leaderboardOpponentHasDefense === true
      && result.pvpProbe?.matchedOpponentName === result.opponentName
      && result.pvpProbe?.serverMatch === true
      && result.pvpProbe?.localPractice === false
      && typeof result.pvpProbe?.matchTicket === 'string'
      && result.pvpProbe.matchTicket.length > 0
      && !result.pvpProbe.matchTicket.startsWith('practice:')
      && Array.isArray(result.pvpProbe?.opponentDeckIds)
      && result.pvpProbe.opponentDeckIds.includes('mirrorWall')
      && result.pvpProbe?.settlementFallbackLocal === true
      && result.pvpProbe?.settlementSource === 'local_authority_gate'
      && /服务端权威结算未启用/.test(result.pvpProbe?.settlementLine || '')
      && result.pvpProbe?.serverScoreBeforeSettlement === result.pvpProbe?.serverScoreAfterSettlement
      && result.pvpProbe?.serverWinsBeforeSettlement === result.pvpProbe?.serverWinsAfterSettlement
      && result.pvpProbe?.serverLossesBeforeSettlement === result.pvpProbe?.serverLossesAfterSettlement,
    JSON.stringify(result.pvpProbe || null)
  );
  add(
    'browser PVPService completes authoritative Node settlement when local test server allows client result',
    authorityResult?.matchedOpponentName === authorityResult?.opponentName
      && authorityResult?.matchTicket
      && !authorityResult.matchTicket.startsWith('practice:')
      && Array.isArray(authorityResult?.opponentDeckIds)
      && authorityResult.opponentDeckIds.includes('mirrorWall')
      && Number(authorityResult?.scoreAfter) > Number(authorityResult?.scoreBefore)
      && Number(authorityResult?.winsAfter) === Number(authorityResult?.winsBefore) + 1
      && Number(authorityResult?.coinsAwarded) > 0
      && Number(authorityResult?.coinsAfter) === Number(authorityResult?.coinsBefore) + Number(authorityResult?.coinsAwarded)
      && Number(authorityResult?.localWalletCoins) === Number(authorityResult?.coinsAfter)
      && authorityResult?.settlementSource === 'server_authoritative'
      && /服务端|权威/.test(authorityResult?.settlementLine || ''),
    JSON.stringify(authorityResult || null)
  );
} catch (error) {
  add('browser BackendClient register/login/save/global/ghost/fetch chain reaches ghost duel battle UI', false, error?.message || String(error));
  add('browser PVPService uses Node backend rank defense matchmaking and local authority-gate settlement fallback', false, error?.message || String(error));
  add('browser PVPService completes authoritative Node settlement when local test server allows client result', false, error?.message || String(error));
} finally {
  if (browser) await browser.close().catch(() => {});
  await stopBackend(server);
  writeReport();
}

const failed = findings.filter(item => item.pass === false);
if (failed.length > 0 || consoleErrors.length > 0) {
  console.error(JSON.stringify({ failed, consoleErrors }, null, 2));
  process.exit(1);
}

console.log('browser_backend_client_smoke passed');
