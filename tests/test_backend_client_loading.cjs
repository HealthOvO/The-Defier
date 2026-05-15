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
