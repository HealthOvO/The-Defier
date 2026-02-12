const fs = require('fs');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async function run() {
  const code = fs.readFileSync('/Users/health/workspace/The Defier/js/services/authService.js', 'utf8');

  let initArgs = null;
  const store = new Map();

  const ctx = vm.createContext({
    console,
    window: {},
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    Bmob: {
      initialize: (...args) => { initArgs = args; },
      User: {
        current: () => null,
        login: async () => ({ objectId: 'u1' }),
        register: async () => ({ objectId: 'u1' }),
        logout: () => {}
      },
      Query: () => ({ find: async () => [], set() {}, save: async () => ({}), get: async () => ({}) }),
      Pointer: () => ({ set: (id) => id })
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  vm.runInContext(code, ctx, { filename: 'authService.js' });
  const AuthService = vm.runInContext('AuthService', ctx);

  // 1) Missing config should disable cloud
  AuthService.init();
  assert(AuthService.isCloudEnabled() === false, 'cloud should be disabled without config');
  const loginWithoutConfig = await AuthService.login('u', 'p');
  assert(loginWithoutConfig.success === false, 'login should fail when config missing');

  // 2) Config should initialize SDK with 2 args (no master key)
  ctx.window.__THE_DEFIER_CONFIG__ = {
    bmob: {
      secretKey: 'secret_x',
      securityCode: 'safe_y',
      masterKey: 'master_z'
    }
  };

  AuthService.init();
  assert(AuthService.isCloudEnabled() === true, 'cloud should be enabled with config');
  assert(Array.isArray(initArgs) && initArgs.length === 2, 'Bmob.initialize should not use master key in browser');
  assert(initArgs[0] === 'secret_x' && initArgs[1] === 'safe_y', 'Bmob.initialize should use runtime config');

  console.log('Auth config sanity checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

