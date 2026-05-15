const fs = require('fs');

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

const path = require('path');
const vm = require('vm');

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

const ctx = vm.createContext({
    console,
    window: {},
    localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k)
    },
    fetch: mockFetch,
    setTimeout,
    clearTimeout
});
ctx.window = ctx;
ctx.global = ctx;
ctx.globalThis = ctx;

vm.runInContext(configCode, ctx);
vm.runInContext('window.__THE_DEFIER_CONFIG__.server.baseUrl = "http://127.0.0.1:9000";', ctx);
vm.runInContext(backendClientCode, ctx);
vm.runInContext(authServiceCode, ctx);

const runE2E = async () => {
    const AuthService = vm.runInContext('AuthService', ctx);
    const assertStep = (condition, message, detail = '') => {
        if (!condition) {
            throw new Error(`${message}${detail ? `: ${detail}` : ''}`);
        }
    };
    console.log('--- 开始 E2E 测试 (前端服务层 -> Node API) ---');
    
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

    const getRes = await AuthService.getCloudData();
    console.log('5. 读取存档:', getRes.success && getRes.slots[0] && getRes.slots[0].level === 10 ? '成功' : '失败', getRes);
    assertStep(getRes.success && getRes.slots[0] && getRes.slots[0].level === 10, '读取存档失败', JSON.stringify(getRes));

    const ghostRes = await AuthService.uploadGhostData({ name: 'Hero', hp: 500, maxHp: 1000, deck: [{ id: 'audit_strike' }] }, 3);
    console.log('6. 上传残影:', ghostRes.success ? '成功' : '失败', ghostRes.message || '');
    assertStep(ghostRes.success, '上传残影失败', ghostRes.message || JSON.stringify(ghostRes));

    const opponentUser = `${testUser}_opponent`;
    const opponentRegRes = await AuthService.register(opponentUser, testPass);
    assertStep(opponentRegRes.success, '注册对手用户失败', opponentRegRes.message || JSON.stringify(opponentRegRes));
    const opponentLoginRes = await AuthService.login(opponentUser, testPass);
    assertStep(opponentLoginRes.success, '登录对手用户失败', opponentLoginRes.message || JSON.stringify(opponentLoginRes));
    const opponentGhostRes = await AuthService.uploadGhostData({ name: 'Rival', hp: 520, maxHp: 1000, deck: [{ id: 'audit_guard' }] }, 3);
    assertStep(opponentGhostRes.success, '上传对手残影失败', opponentGhostRes.message || JSON.stringify(opponentGhostRes));

    const fetchGhostRes = await AuthService.fetchRandomGhost(3);
    console.log('7. 随机拉取残影:', fetchGhostRes.success ? '成功' : '失败', fetchGhostRes.message || '');
    assertStep(fetchGhostRes.success, '随机拉取残影失败', fetchGhostRes.message || JSON.stringify(fetchGhostRes));

    console.log('--- E2E 测试结束 ---');
};

runE2E().catch((error) => {
    console.error(error);
    process.exit(1);
});
