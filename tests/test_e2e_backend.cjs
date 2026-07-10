const fs = require('fs');
const nodeCrypto = require('crypto');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const { TextEncoder } = require('util');

const originalReadFileSync = fs.readFileSync;
fs.readFileSync = function(p, enc) {
    let c = originalReadFileSync(p, enc);
    if (enc === 'utf8' && p.endsWith('.js')) {
        c = c.replace(/^export\s+(const|let|var|class|function|default)/gm, '$1');
        c = c.replace(/^export\s+\{.*?\};?/gm, '');
        c = c.replace(/^import\s+.*?;/gm, '');
    }
    return c;
};

const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = Number(process.env.BACKEND_E2E_PORT || 9012);
const BASE_URL = (process.env.BACKEND_E2E_BASE_URL || `http://127.0.0.1:${PORT}`).replace(/\/+$/, '');
const JWT_SECRET = process.env.BACKEND_E2E_JWT_SECRET || 'integration-jwt-secret-32-characters';
const HMAC_SECRET = process.env.BACKEND_E2E_HMAC_SECRET || 'integration-hmac-secret-32-characters';
const SHOULD_START_SERVER = process.env.BACKEND_E2E_EXTERNAL !== '1';
const DB_PATH = process.env.BACKEND_E2E_DB_PATH || path.join(os.tmpdir(), `the-defier-backend-e2e-${process.pid}.sqlite`);

const configCode = fs.readFileSync(path.resolve(__dirname, '../js/config/bmob.config.js'), 'utf8');
const backendClientCode = fs.readFileSync(path.resolve(__dirname, '../js/services/backend-client.js'), 'utf8');
const authServiceCode = fs.readFileSync(path.resolve(__dirname, '../js/services/authService.js'), 'utf8');

const store = new Map();
const mockFetch = async (url, options) => {
    const http = url.startsWith('https') ? require('https') : require('http');
    const urlObj = new URL(url.replace('https', 'http'));
    return new Promise((resolve, reject) => {
        const req = http.request(urlObj, {
            method: options.method || 'GET',
            headers: options.headers || {}
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    json: async () => JSON.parse(data),
                    text: async () => data
                });
            });
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
};

async function requestHealth(pathname = '/health', baseUrl = BASE_URL) {
    const res = await fetch(`${baseUrl}${pathname}`);
    if (res.status !== 200) {
        throw new Error(`${pathname} returned HTTP ${res.status}`);
    }
    const payload = await res.json().catch(() => null);
    if (!payload || payload.status !== 'ok') {
        throw new Error(`${pathname} returned invalid payload: ${JSON.stringify(payload)}`);
    }
}

async function waitForHealth() {
    const deadline = Date.now() + 10000;
    let lastError = null;
    while (Date.now() < deadline) {
        try {
            await requestHealth();
            return;
        } catch (error) {
            lastError = error;
        }
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw lastError || new Error('backend health check timed out');
}

function startServer(options = {}) {
    const port = options.port || PORT;
    const dbPath = options.dbPath || DB_PATH;
    const allowClientResult = Object.prototype.hasOwnProperty.call(options, 'allowClientResult')
        ? options.allowClientResult
        : (process.env.BACKEND_E2E_ALLOW_CLIENT_PVP_RESULT || '1');
    const child = spawn(process.execPath, ['server/app.js'], {
        cwd: ROOT_DIR,
        env: {
            ...process.env,
            PORT: String(port),
            ...(options.nodeEnv ? { NODE_ENV: options.nodeEnv } : {}),
            JWT_SECRET,
            DEFIER_HMAC_SECRET: HMAC_SECRET,
            DEFIER_INTEGRITY_REQUIRED: process.env.BACKEND_E2E_INTEGRITY_REQUIRED || '1',
            DEFIER_PVP_ALLOW_CLIENT_REPORTED_RESULT: allowClientResult,
            DEFIER_PVP_TEST_MODE: allowClientResult ? '1' : '',
            DEFIER_DB_PATH: dbPath
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', chunk => output += chunk.toString());
    child.stderr.on('data', chunk => output += chunk.toString());
    return {
        child,
        getOutput: () => output
    };
}

function readRuntimeConfigForHost(hostname, origin) {
    const configCtx = vm.createContext({
        window: {
            location: {
                hostname,
                origin
            }
        }
    });
    vm.runInContext(configCode, configCtx);
    return configCtx.window.__THE_DEFIER_CONFIG__;
}

async function stopServer(server) {
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

async function rawApiRequest(pathname, {
    method = 'GET',
    data,
    token = null,
    baseUrl = BASE_URL
} = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers,
        body: data === undefined ? undefined : JSON.stringify(data)
    });
    const text = await res.text();
    let payload = null;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch (error) {
        payload = { raw: text };
    }
    return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        payload
    };
}

async function waitForHealthAt(baseUrl) {
    const deadline = Date.now() + 10000;
    let lastError = null;
    while (Date.now() < deadline) {
        try {
            await requestHealth('/health', baseUrl);
            return;
        } catch (error) {
            lastError = error;
        }
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw lastError || new Error(`backend health check timed out: ${baseUrl}`);
}

function createSessionIntegrityFields(data, token) {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    const salt = `session-test-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
    const signature = nodeCrypto.createHmac('sha256', token)
        .update('session-v1', 'utf8')
        .update('\n', 'utf8')
        .update(salt, 'utf8')
        .update('\n', 'utf8')
        .update(dataStr, 'utf8')
        .digest('hex');
    return {
        salt,
        signature,
        signatureMode: 'session'
    };
}

async function runPvpSettlementGateCheck(assertStep, options = {}) {
    const suffix = options.suffix || 'default';
    const gatePort = options.port || PORT + 37;
    const gateBaseUrl = `http://127.0.0.1:${gatePort}`;
    const gateDbPath = path.join(os.tmpdir(), `the-defier-pvp-gate-${suffix}-${process.pid}.sqlite`);
    const gateServer = startServer({
        port: gatePort,
        dbPath: gateDbPath,
        allowClientResult: options.allowClientResult || '',
        nodeEnv: options.nodeEnv || ''
    });
    try {
        await waitForHealthAt(gateBaseUrl);
        const username = `pvp_gate_${Date.now()}`;
        const reg = await rawApiRequest('/api/auth/register', {
            baseUrl: gateBaseUrl,
            method: 'POST',
            data: {
                username,
                password: 'pwd123'
            }
        });
        const token = reg.payload?.token || reg.payload?.sessionToken || reg.payload?.user?.sessionToken;
        assertStep(reg.ok && token, `${options.label || '默认'}结算门禁测试注册失败`, JSON.stringify(reg));
        const rankBefore = await rawApiRequest('/api/pvp/rank', {
            baseUrl: gateBaseUrl,
            token
        });
        assertStep(rankBefore.ok && rankBefore.payload?.success && rankBefore.payload?.rank?.score === 1000, `${options.label || '默认'}结算门禁测试读取段位失败`, JSON.stringify(rankBefore));
        const report = {
            matchTicket: 'fake-ticket-with-valid-session-signature',
            didWin: true
        };
        const settle = await rawApiRequest('/api/pvp/match/result', {
            baseUrl: gateBaseUrl,
            method: 'POST',
            token,
            data: {
                report,
                ...createSessionIntegrityFields(report, token)
            }
        });
        assertStep(settle.ok && settle.payload?.success === false && settle.payload?.reason === 'server_authority_unavailable', `${options.label || '默认'}环境不应接受客户端 PVP 胜负上报`, JSON.stringify(settle));
        const rankAfter = await rawApiRequest('/api/pvp/rank', {
            baseUrl: gateBaseUrl,
            token
        });
        assertStep(rankAfter.ok && rankAfter.payload?.rank?.score === rankBefore.payload.rank.score && rankAfter.payload?.wallet?.coins === rankBefore.payload.wallet.coins, `${options.label || '默认'}禁用客户端结算后仍改变了积分或钱包`, JSON.stringify({ before: rankBefore, after: rankAfter, settle }));
    } finally {
        await stopServer(gateServer);
    }
}

const ctx = vm.createContext({
    console,
    window: {},
    localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k)
    },
    fetch: mockFetch,
    crypto: nodeCrypto.webcrypto,
    TextEncoder,
    URLSearchParams,
    setTimeout,
    clearTimeout
});
ctx.window = ctx;
ctx.global = ctx;
ctx.globalThis = ctx;

vm.runInContext(configCode, ctx);
vm.runInContext(`window.__THE_DEFIER_CONFIG__.server.baseUrl = ${JSON.stringify(BASE_URL)};`, ctx);
vm.runInContext(backendClientCode, ctx);
vm.runInContext(authServiceCode, ctx);

const runE2E = async () => {
    const AuthService = vm.runInContext('AuthService', ctx);
    const BackendClient = vm.runInContext('BackendClient', ctx);
    const getSession = () => {
        const raw = store.get('theDefierServerSession');
        return raw ? JSON.parse(raw) : null;
    };
    const assertStep = (condition, message, detail = '') => {
        if (!condition) {
            throw new Error(`${message}${detail ? `: ${detail}` : ''}`);
        }
    };
    console.log('--- 开始 E2E 测试 (前端服务层 -> Node API) ---');

    const productionConfig = readRuntimeConfigForHost('080305.xyz', 'https://080305.xyz');
    assertStep(productionConfig.server.baseUrl === 'https://080305.xyz', '生产域名未自动启用同源 API', JSON.stringify(productionConfig.server));
    assertStep(productionConfig.backend.provider === 'server', '生产域名未默认使用 server provider', JSON.stringify(productionConfig.backend));
    console.log('0. 生产域名同源 API 配置: 成功');
    
    AuthService.init();
    assertStep(AuthService.isInitialized, '初始化失败', AuthService.initError);
    console.log('1. 初始化成功，模式:', vm.runInContext('BackendClient.provider', ctx));

    const testUser = 'e2e_user_' + Date.now();
    const testPass = 'pwd123';

    const regRes = await AuthService.register(testUser, testPass);
    console.log('2. 注册:', regRes.success ? '成功' : '失败', regRes.message || '');
    assertStep(regRes.success, '注册失败', regRes.message || JSON.stringify(regRes));

    const loginRes = await AuthService.login(testUser, testPass);
    console.log('3. 登录:', loginRes.success ? '成功' : '失败', loginRes.message || '');
    assertStep(loginRes.success, '登录失败', loginRes.message || JSON.stringify(loginRes));

    const saveRes = await AuthService.saveCloudData({ level: 10, hp: 100 }, 0);
    console.log('4. 上传存档:', saveRes.success ? '成功' : '失败');
    assertStep(saveRes.success, '上传存档失败', saveRes.message || JSON.stringify(saveRes));
    const firstAccountSaveTime = Number(saveRes.saveTime);
    assertStep(Number.isFinite(firstAccountSaveTime), '服务端未返回可用的 canonical saveTime', JSON.stringify(saveRes));

    const getRes = await AuthService.getCloudData();
    console.log('5. 读取存档:', getRes.success && getRes.slots[0] && getRes.slots[0].level === 10 ? '成功' : '失败', getRes);
    assertStep(getRes.success && getRes.slots[0] && getRes.slots[0].level === 10, '读取存档失败', JSON.stringify(getRes));

    const globalPayload = { achievements: { firstWin: true }, updatedAt: Date.now() };
    const globalSaveRes = await AuthService.saveGlobalData(globalPayload);
    console.log('6. 上传全局数据:', globalSaveRes.success ? '成功' : '失败');
    assertStep(globalSaveRes.success, '上传全局数据失败', globalSaveRes.message || JSON.stringify(globalSaveRes));

    const globalGetRes = await AuthService.getGlobalData();
    console.log('7. 读取全局数据:', globalGetRes.success && globalGetRes.data?.achievements?.firstWin ? '成功' : '失败');
    assertStep(globalGetRes.success && globalGetRes.data?.achievements?.firstWin === true, '读取全局数据失败', JSON.stringify(globalGetRes));

    const progressionInitial = await BackendClient.getProgressionStatus();
    assertStep(progressionInitial.success && progressionInitial.reportVersion === 'account-progression-status-v1', '读取长期进度失败', JSON.stringify(progressionInitial));
    const progressionRunId = `e2e-run-${Date.now()}`;
    const progressionEvents = [0, 1, 2].map(index => ({
        eventId: `e2e-progression-event-${Date.now()}-${index}`,
        eventType: 'battle_won',
        mode: index === 1 ? 'challenge' : index === 2 ? 'expedition' : 'pve',
        sourceRef: `${progressionRunId}-node-${index}`,
        proof: {
            nodeType: index === 0 ? 'boss' : 'enemy',
            realm: 3,
            runId: progressionRunId
        }
    }));
    const progressionSubmit = await BackendClient.submitProgressionEvents(progressionEvents);
    assertStep(progressionSubmit.success && progressionSubmit.accepted?.length === 3, '提交长期进度事件失败', JSON.stringify(progressionSubmit));
    const progressionStatus = await BackendClient.getProgressionStatus();
    const dailyBattleObjective = progressionStatus.objectives?.find(entry => entry.objectiveId === 'daily_battle_wins');
    assertStep(dailyBattleObjective?.claimable === true && dailyBattleObjective.current === 3, '长期进度目标未按事件推进', JSON.stringify(progressionStatus));
    const progressionClaim = await BackendClient.claimProgressionReward(dailyBattleObjective.objectiveId, dailyBattleObjective.cycleId);
    assertStep(progressionClaim.success && progressionClaim.alreadyClaimed === false && progressionClaim.balance?.balance > 0, '领取长期进度奖励失败', JSON.stringify(progressionClaim));
    const progressionLedger = await BackendClient.getProgressionLedger({ limit: 10 });
    assertStep(progressionLedger.success && progressionLedger.entries?.length === 1, '读取长期进度流水失败', JSON.stringify(progressionLedger));
    console.log('8. 长期进度事件/领奖/流水: 成功');

    const verifiedUserId = String(getSession()?.user?.objectId || getSession()?.user?.id || '');
    assertStep(verifiedUserId, '验证跑图未取得当前账号标识', JSON.stringify(getSession()));
    const verifiedRunId = `e2e-verified-run-${Date.now()}`;
    const verifiedBattleSource = `${verifiedRunId}:r3:battle_won:boss`;
    const verifiedCompletionSource = `${verifiedRunId}:r3:activity_completed`;
    const verifiedObserved = await BackendClient.submitProgressionEvents([
        {
            eventId: `${verifiedRunId}-observed-battle`,
            eventType: 'battle_won',
            mode: 'pve',
            sourceRef: verifiedBattleSource,
            proof: { nodeType: 'boss', realm: 3, runId: verifiedRunId }
        },
        {
            eventId: `${verifiedRunId}-observed-completion`,
            eventType: 'activity_completed',
            mode: 'pve',
            sourceRef: verifiedCompletionSource,
            proof: { realm: 3, reason: 'realm_clear', runId: verifiedRunId }
        }
    ], { expectedUserId: verifiedUserId });
    assertStep(verifiedObserved.success && verifiedObserved.accepted?.length === 2, '验证跑图的观察事件预写入失败', JSON.stringify(verifiedObserved));
    const verifiedTicketResult = await BackendClient.startVerifiedProgressionRun({
        clientRunId: verifiedRunId,
        mode: 'pve',
        contentVersion: 'verified-run-v1',
        context: {
            saveSlot: 0,
            realm: 3,
            characterId: 'Hero',
            runPathId: 'e2e-path',
            runDestinyId: 'e2e-destiny',
            spiritCompanionId: 'e2e-companion',
            mapSnapshotHash: 'map-e2e-verified-0001'
        }
    }, { expectedUserId: verifiedUserId });
    const verifiedTicket = verifiedTicketResult.ticket;
    assertStep(verifiedTicketResult.success && verifiedTicket?.ticketId && verifiedTicket?.settlementNonce, '验证跑图签票失败', JSON.stringify(verifiedTicketResult));
    const verifiedCheckpoint = await BackendClient.submitVerifiedRunCheckpoint(verifiedTicket.ticketId, {
        ticketId: verifiedTicket.ticketId,
        sourceRef: verifiedBattleSource,
        eventType: 'battle_won',
        proof: { nodeType: 'boss', realm: 3, runId: verifiedRunId }
    }, { expectedUserId: verifiedUserId });
    assertStep(
        verifiedCheckpoint.success
            && verifiedCheckpoint.checkpoint?.sequence === 1
            && verifiedCheckpoint.checkpoint?.trustTier === 'server_verified'
            && verifiedCheckpoint.checkpoint?.upgradedObservedEvent === true,
        '验证跑图 checkpoint 未升级观察事件',
        JSON.stringify(verifiedCheckpoint)
    );
    const verifiedSettlementPayload = {
        ticketId: verifiedTicket.ticketId,
        sourceRef: verifiedCompletionSource,
        outcome: 'completed',
        settlementNonce: verifiedTicket.settlementNonce,
        proof: { realm: 3, reason: 'realm_clear', runId: verifiedRunId }
    };
    const verifiedSettlement = await BackendClient.settleVerifiedProgressionRun(
        verifiedTicket.ticketId,
        verifiedSettlementPayload,
        { expectedUserId: verifiedUserId }
    );
    assertStep(
        verifiedSettlement.success
            && verifiedSettlement.receipt?.trustTier === 'server_verified'
            && verifiedSettlement.receipt?.authorityLevel === 'verified_envelope'
            && verifiedSettlement.receipt?.upgradedObservedEvent === true,
        '验证跑图结算未原子升级观察事件',
        JSON.stringify(verifiedSettlement)
    );
    const verifiedReplay = await BackendClient.settleVerifiedProgressionRun(
        verifiedTicket.ticketId,
        verifiedSettlementPayload,
        { expectedUserId: verifiedUserId }
    );
    assertStep(
        verifiedReplay.success
            && verifiedReplay.receipt?.receiptId === verifiedSettlement.receipt?.receiptId
            && verifiedReplay.receipt?.idempotent === true,
        '验证跑图重放未返回同一收据',
        JSON.stringify(verifiedReplay)
    );
    console.log('8. 验证跑图签票/checkpoint/幂等结算: 成功');

    const auditRealm = 10000 + Math.floor(Date.now() % 1000000);
    const ghostRes = await AuthService.uploadGhostData({ characterId: 'Hero', currentHp: 500, maxHp: 1000, deck: [{ id: 'audit_strike' }] }, auditRealm);
    console.log('8. 上传残影:', ghostRes.success ? '成功' : '失败', ghostRes.message || '');
    assertStep(ghostRes.success, '上传残影失败', ghostRes.message || JSON.stringify(ghostRes));
    const pvpRankRes = await BackendClient.getPvpRank();
    assertStep(pvpRankRes.success && pvpRankRes.rank?.score === 1000, '初始化 PVP 段位失败', JSON.stringify(pvpRankRes));
    const pvpDefenseRes = await BackendClient.uploadPvpDefenseSnapshot({
        realm: auditRealm,
        powerScore: 888,
        battleData: {
            me: { maxHp: 900, energy: 3, currEnergy: 3 },
            deck: [{ id: 'audit_strike' }, { id: 'defend' }, { id: 'quickSlash' }, { id: 'meditation' }, { id: 'spiritBoost' }, { id: 'powerUp' }, { id: 'shieldWall' }, { id: 'heavyStrike' }],
            aiProfile: 'aggressive',
            deckArchetype: 'aggressive',
            ruleVersion: 'pvp-v2'
        },
        config: { personality: 'aggressive', guardianFormation: true }
    });
    assertStep(pvpDefenseRes.success && pvpDefenseRes.snapshot?.battleData?.deck?.some(card => card.id === 'audit_strike'), '上传 PVP 防御快照失败', JSON.stringify(pvpDefenseRes));
    const myDefenseReadRes = await BackendClient.getPvpDefenseSnapshot();
    assertStep(myDefenseReadRes.success && myDefenseReadRes.snapshot?.battleData?.deck?.some(card => card.id === 'audit_strike'), '读取自己的 PVP 防御快照失败', JSON.stringify(myDefenseReadRes));
    const mainSession = getSession();
    assertStep(mainSession?.token, '未取得主账号 session token', JSON.stringify(mainSession));
    const unauthPvpRankRes = await rawApiRequest('/api/pvp/rank');
    assertStep(unauthPvpRankRes.status === 401 || unauthPvpRankRes.status === 403, 'PVP 未鉴权 rank 请求没有被拒绝', JSON.stringify(unauthPvpRankRes));
    const unsignedDefenseRes = await rawApiRequest('/api/pvp/defense', {
        method: 'POST',
        token: mainSession.token,
        data: {
            realm: auditRealm,
            powerScore: 321,
            battleData: {
                me: { maxHp: 600, energy: 3, currEnergy: 3 },
                deck: [{ id: 'audit_strike' }, { id: 'defend' }, { id: 'quickSlash' }, { id: 'meditation' }, { id: 'spiritBoost' }, { id: 'powerUp' }, { id: 'shieldWall' }, { id: 'heavyStrike' }]
            },
            config: { personality: 'balanced', guardianFormation: false },
            snapshotTime: Date.now()
        }
    });
    assertStep(unsignedDefenseRes.status === 400, 'PVP defense 缺签名没有被拒绝', JSON.stringify(unsignedDefenseRes));
    const defenseTamperBase = {
        realm: auditRealm,
        powerScore: 333,
        battleData: {
            me: { maxHp: 610, energy: 3, currEnergy: 3 },
            deck: [{ id: 'audit_strike' }, { id: 'defend' }, { id: 'quickSlash' }, { id: 'meditation' }, { id: 'spiritBoost' }, { id: 'powerUp' }, { id: 'shieldWall' }, { id: 'heavyStrike' }]
        },
        config: { personality: 'balanced', guardianFormation: false },
        snapshotTime: Date.now()
    };
    const defenseTamperIntegrity = await BackendClient.createSessionIntegrityFields(defenseTamperBase);
    const tamperedDefenseRes = await rawApiRequest('/api/pvp/defense', {
        method: 'POST',
        token: mainSession.token,
        data: {
            ...defenseTamperBase,
            powerScore: 999999,
            config: { personality: 'aggressive', guardianFormation: true },
            ...defenseTamperIntegrity
        }
    });
    assertStep(tamperedDefenseRes.status === 403, 'PVP defense 元数据篡改没有触发签名拒绝', JSON.stringify(tamperedDefenseRes));

    const opponentUser = `${testUser}_opponent`;
    AuthService.logout();
    const opponentRegRes = await AuthService.register(opponentUser, testPass);
    assertStep(opponentRegRes.success, '注册对手用户失败', opponentRegRes.message || JSON.stringify(opponentRegRes));
    const opponentLoginRes = await AuthService.login(opponentUser, testPass);
    assertStep(opponentLoginRes.success, '登录对手用户失败', opponentLoginRes.message || JSON.stringify(opponentLoginRes));
    const opponentMarker = `opponent_cross_account_${Date.now()}`;
    const opponentSaveRes = await AuthService.saveCloudData({
        level: 20,
        hp: 90,
        marker: opponentMarker,
        timestamp: firstAccountSaveTime - 1
    }, 0);
    assertStep(opponentSaveRes.success, '跨账号存档上传失败', opponentSaveRes.message || JSON.stringify(opponentSaveRes));
    assertStep(!opponentSaveRes.skipped, '跨账号存档被上一账号 stale gate 误跳过', JSON.stringify(opponentSaveRes));
    const opponentCloudRes = await AuthService.getCloudData();
    assertStep(opponentCloudRes.success && opponentCloudRes.slots[0]?.marker === opponentMarker, '跨账号存档没有写入当前账号云槽位', JSON.stringify(opponentCloudRes));
    const opponentGhostRes = await AuthService.uploadGhostData({ characterId: 'Rival', currentHp: 520, maxHp: 1000, deck: [{ id: 'audit_guard' }] }, auditRealm);
    assertStep(opponentGhostRes.success, '上传对手残影失败', opponentGhostRes.message || JSON.stringify(opponentGhostRes));
    const opponentRankRes = await BackendClient.getPvpRank();
    assertStep(opponentRankRes.success && opponentRankRes.rank?.user?.username === opponentUser, '初始化对手 PVP 段位失败', JSON.stringify(opponentRankRes));
    const opponentPvpDefenseRes = await BackendClient.uploadPvpDefenseSnapshot({
        realm: auditRealm,
        powerScore: 777,
        battleData: {
            me: { maxHp: 820, energy: 4, currEnergy: 4 },
            deck: [{ id: 'audit_guard' }, { id: 'defend' }, { id: 'shieldWall' }, { id: 'meditation' }, { id: 'spiritBoost' }, { id: 'powerUp' }, { id: 'quickSlash' }, { id: 'heavyStrike' }],
            aiProfile: 'fortified',
            deckArchetype: 'fortified',
            ruleVersion: 'pvp-v2'
        },
        config: { personality: 'fortified', guardianFormation: false }
    });
    assertStep(opponentPvpDefenseRes.success && opponentPvpDefenseRes.snapshot?.battleData?.deck?.some(card => card.id === 'audit_guard'), '上传对手 PVP 防御快照失败', JSON.stringify(opponentPvpDefenseRes));

    const fetchGhostRes = await AuthService.fetchRandomGhost(auditRealm);
    console.log('9. 随机拉取残影:', fetchGhostRes.success ? '成功' : '失败', fetchGhostRes.message || '');
    assertStep(fetchGhostRes.success, '随机拉取残影失败', fetchGhostRes.message || JSON.stringify(fetchGhostRes));
    assertStep(fetchGhostRes.data?.userName === testUser, '残影拉取未排除当前登录用户', JSON.stringify(fetchGhostRes));
    assertStep(fetchGhostRes.data?.ghostData?.name === 'Hero', '残影 payload 身份不正确', JSON.stringify(fetchGhostRes));

    const reloginRes = await AuthService.login(testUser, testPass);
    assertStep(reloginRes.success, '重新登录主账号失败', reloginRes.message || JSON.stringify(reloginRes));
    const leaderboardRes = await BackendClient.getPvpLeaderboard();
    assertStep(leaderboardRes.success && leaderboardRes.data.some(rank => rank.user?.username === opponentUser), 'PVP 排行榜未包含对手', JSON.stringify(leaderboardRes));
    const pvpMatchRes = await BackendClient.findPvpOpponent({
        myScore: pvpRankRes.rank.score,
        myRealm: auditRealm,
        preferredRankId: opponentRankRes.rank.objectId,
        allowPractice: false
    });
    console.log('10. PVP 后端匹配:', pvpMatchRes.success ? '成功' : '失败', pvpMatchRes.message || '');
    assertStep(pvpMatchRes.success && pvpMatchRes.matchTicket, 'PVP 后端匹配失败', JSON.stringify(pvpMatchRes));
    assertStep(pvpMatchRes.opponent?.rank?.user?.username === opponentUser, 'PVP 匹配没有锁定目标对手', JSON.stringify(pvpMatchRes));
    assertStep(pvpMatchRes.opponent?.battleData?.deck?.some(card => card.id === 'audit_guard'), 'PVP 匹配未返回对手战斗牌组', JSON.stringify(pvpMatchRes));
    const unsignedMatchRes = await rawApiRequest('/api/pvp/match', {
        method: 'POST',
        token: mainSession.token,
        data: {
            myScore: pvpRankRes.rank.score,
            myRealm: auditRealm,
            preferredRankId: opponentRankRes.rank.objectId,
            allowPractice: false
        }
    });
    assertStep(unsignedMatchRes.status === 400, 'PVP match 缺签名没有被拒绝', JSON.stringify(unsignedMatchRes));
    const pvpSettleRes = await BackendClient.reportPvpMatchResult({
        matchTicket: pvpMatchRes.matchTicket,
        didWin: true
    });
    console.log('11. PVP 后端结算:', pvpSettleRes.success ? '成功' : '失败', pvpSettleRes.message || '');
    assertStep(pvpSettleRes.success, 'PVP 后端结算失败', JSON.stringify(pvpSettleRes));
    assertStep(pvpSettleRes.newRating > pvpRankRes.rank.score && pvpSettleRes.delta > 0, 'PVP 胜场没有提升积分', JSON.stringify(pvpSettleRes));
    assertStep(pvpSettleRes.coinsAwarded > 0 && pvpSettleRes.wallet?.coins > 1200, 'PVP 胜场没有发放钱包奖励', JSON.stringify(pvpSettleRes));
    const pvpEconomyAfterSettle = await BackendClient.getPvpEconomy();
    assertStep(pvpEconomyAfterSettle.success && pvpEconomyAfterSettle.wallet?.coins === pvpSettleRes.wallet.coins, 'PVP 钱包读取和结算返回不一致', JSON.stringify({ pvpEconomyAfterSettle, pvpSettleRes }));
    const rankBeforeReplay = await BackendClient.getPvpRank();
    assertStep(rankBeforeReplay.success, '重复结算前读取段位失败', JSON.stringify(rankBeforeReplay));
    const pvpReplayRes = await BackendClient.reportPvpMatchResult({
        matchTicket: pvpMatchRes.matchTicket,
        didWin: true
    });
    assertStep(!pvpReplayRes.success, 'PVP 重复结算未被拒绝', JSON.stringify(pvpReplayRes));
    const rankAfterReplay = await BackendClient.getPvpRank();
    assertStep(rankAfterReplay.success && rankAfterReplay.rank?.score === rankBeforeReplay.rank?.score && rankAfterReplay.wallet?.coins === rankBeforeReplay.wallet?.coins, 'PVP 重复结算改变了积分或钱包', JSON.stringify({ before: rankBeforeReplay, after: rankAfterReplay, replay: pvpReplayRes }));
    const tamperedShopRes = await BackendClient.purchasePvpShopItem({
        itemId: 'secret_manual_2',
        itemName: '伪造零价外观',
        price: 0,
        itemType: 'skin'
    });
    assertStep(tamperedShopRes.success && tamperedShopRes.coinsSpent === 300, 'PVP 商店没有使用服务端目录定价', JSON.stringify(tamperedShopRes));
    assertStep(tamperedShopRes.wallet?.coins === rankAfterReplay.wallet.coins - 300, 'PVP 商店扣币金额不正确', JSON.stringify({ tamperedShopRes, rankAfterReplay }));
    const shopTamperBase = { itemId: 'secret_manual_1' };
    const currentMainSession = getSession();
    assertStep(currentMainSession?.token, 'PVP 商店篡改测试未取得当前主账号 session token', JSON.stringify(currentMainSession));
    const shopTamperIntegrity = createSessionIntegrityFields(shopTamperBase, currentMainSession.token);
    const itemIdTamperedShopRes = await rawApiRequest('/api/pvp/shop/purchase', {
        method: 'POST',
        token: currentMainSession.token,
        data: {
            itemId: 'title_supreme',
            ...shopTamperIntegrity
        }
    });
    assertStep(itemIdTamperedShopRes.status === 403, 'PVP 商店核心 itemId 篡改没有触发签名拒绝', JSON.stringify(itemIdTamperedShopRes));
    const directTamperedShopRes = await rawApiRequest('/api/pvp/shop/purchase', {
        method: 'POST',
        token: currentMainSession.token,
        data: {
            ...shopTamperBase,
            itemName: '伪造零价皮肤',
            price: 0,
            itemType: 'skin',
            ...shopTamperIntegrity
        }
    });
    assertStep(directTamperedShopRes.ok && directTamperedShopRes.payload?.coinsSpent === 500, 'PVP 商店直接篡改请求没有使用服务端目录', JSON.stringify(directTamperedShopRes));

    await runPvpSettlementGateCheck(assertStep, {
        suffix: 'default',
        port: PORT + 37,
        label: '默认'
    });
    await runPvpSettlementGateCheck(assertStep, {
        suffix: 'production',
        port: PORT + 38,
        label: 'production',
        allowClientResult: '1',
        nodeEnv: 'production'
    });

    console.log('--- E2E 测试结束 ---');
};

async function main() {
    let server = null;
    if (SHOULD_START_SERVER) {
        server = startServer();
    }
    try {
        await waitForHealth();
        await requestHealth('/api/health');
        await runE2E();
    } catch (error) {
        if (server) {
            error.message = `${error.message}\nServer output:\n${server.getOutput()}`;
        }
        throw error;
    } finally {
        await stopServer(server);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
