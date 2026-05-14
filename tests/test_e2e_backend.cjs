const fs = require('fs');
const path = require('path');
const vm = require('vm');

const configCode = fs.readFileSync(path.resolve(__dirname, '../js/config/bmob.config.local.js'), 'utf8');
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
    console.log('--- 开始 E2E 测试 (前端服务层 -> Node API) ---');
    
    AuthService.init();
    if (!AuthService.isInitialized) {
        console.error('初始化失败:', AuthService.initError);
        process.exit(1);
    }
    console.log('1. 初始化成功，模式:', ctx.BackendClient.provider);

    const testUser = 'e2e_user_' + Date.now();
    const testPass = 'pwd123';

    const regRes = await AuthService.register(testUser, testPass);
    console.log('2. 注册:', regRes.success ? '成功' : '失败');

    const loginRes = await AuthService.login(testUser, testPass);
    console.log('3. 登录:', loginRes.success ? '成功' : '失败');

    const saveRes = await AuthService.saveCloudData({ level: 10, hp: 100 }, 0);
    console.log('4. 上传存档:', saveRes.success ? '成功' : '失败');

    const getRes = await AuthService.getCloudData();
    console.log('5. 读取存档:', getRes.success && getRes.slots[0] && getRes.slots[0].level === 10 ? '成功' : '失败', getRes);

    const ghostRes = await AuthService.uploadGhostData({ characterId: 'Hero', currentHp: 500 }, 3);
    console.log('6. 上传残影:', ghostRes.success ? '成功' : '失败');

    const fetchGhostRes = await AuthService.fetchRandomGhost(3);
    console.log('7. 随机拉取残影:', fetchGhostRes.success ? '成功' : '失败');

    console.log('--- E2E 测试结束 ---');
};

runE2E().catch(console.error);
