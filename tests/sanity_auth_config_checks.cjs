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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function loadScript(p) {
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace(/^export\s+(const|let|var|class|function|default)/gm, '$1');
  c = c.replace(/^export\s+\{.*?\};?/gm, '');
  c = c.replace(/^import\s+.*?;/gm, '');
  return c;
}

(async function run() {
  const configCode = loadScript(path.resolve(__dirname, '../js/config/bmob.config.js'));
  const code = loadScript(path.resolve(__dirname, '../js/services/authService.js'));
  const backendCode = loadScript(path.resolve(__dirname, '../js/services/backend-client.js'));

  const store = new Map();

  const ctx = vm.createContext({
    console,
    window: {},
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;
  ctx.globalThis = ctx;

  vm.runInContext(configCode, ctx, { filename: 'bmob.config.js' });
  vm.runInContext(backendCode, ctx, { filename: 'backend-client.js' });
  vm.runInContext(code, ctx, { filename: 'authService.js' });
  const AuthService = vm.runInContext('AuthService', ctx);
  const BackendClient = vm.runInContext('BackendClient', ctx);

  // 1) Deploy-safe defaults should not contain secrets or a hardcoded server URL.
  const defaultConfig = vm.runInContext('window.__THE_DEFIER_CONFIG__', ctx);
  assert(defaultConfig.server.baseUrl === '', 'default server baseUrl should be empty');
  assert(defaultConfig.bmob.secretKey === '', 'default Bmob secretKey should be empty');
  assert(defaultConfig.bmob.securityCode === '', 'default Bmob securityCode should be empty');
  assert(defaultConfig.server.authPathPrefix === '/api/auth', 'default auth prefix should use /api/auth');
  assert(defaultConfig.server.savePathPrefix === '/api/saves', 'default save prefix should use /api/saves');
  assert(defaultConfig.server.userPathPrefix === '/api/user', 'default user prefix should use /api/user');
  assert(defaultConfig.server.ghostPathPrefix === '/api/ghosts', 'default ghost prefix should use /api/ghosts');

  // 2) Missing baseUrl should disable cloud without throwing.
  AuthService.init();
  assert(AuthService.isCloudEnabled() === false, 'cloud should be disabled without config');
  const loginWithoutConfig = await AuthService.login('u', 'p');
  assert(loginWithoutConfig.success === false, 'login should fail when config missing');

  // 3) Runtime localStorage override should take priority over the empty default.
  store.set('theDefierServerConfig', JSON.stringify({
    baseUrl: 'http://127.0.0.1:9000',
    authPathPrefix: '/api/auth',
    savePathPrefix: '/api/saves',
    userPathPrefix: '/api/user',
    ghostPathPrefix: '/api/ghosts'
  }));

  AuthService.init();
  assert(AuthService.isCloudEnabled() === true, 'cloud should be enabled with config');
  const resolvedConfig = BackendClient.getServerConfig();
  assert(resolvedConfig.baseUrl === 'http://127.0.0.1:9000', 'localStorage baseUrl override should be used');
  assert(resolvedConfig.authPathPrefix === '/api/auth', 'auth prefix should resolve to /api/auth');

  console.log('Auth config sanity checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
