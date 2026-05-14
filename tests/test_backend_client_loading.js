const fs = require('fs');
const path = require('path');
const vm = require('vm');
const backendCode = fs.readFileSync(path.resolve(__dirname, '../js/services/backend-client.js'), 'utf8');
const authCode = fs.readFileSync(path.resolve(__dirname, '../js/services/authService.js'), 'utf8');

const ctx = vm.createContext({
  console,
  window: {},
  localStorage: { getItem: () => null, setItem: () => {} },
  Bmob: { initialize: () => {}, User: { current: () => null } }
});
ctx.window = ctx;
ctx.global = ctx;
ctx.globalThis = ctx;

vm.runInContext(backendCode, ctx);
vm.runInContext(authCode, ctx);
const AuthService = vm.runInContext('AuthService', ctx);
AuthService.init();
console.log('Is cloud enabled:', AuthService.isCloudEnabled());
