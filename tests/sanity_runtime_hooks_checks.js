const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(function run() {
  const code = fs.readFileSync(path.resolve(__dirname, '../js/game.js'), 'utf8');

  const ctx = vm.createContext({
    console,
    window: {},
    document: {
      addEventListener: () => {},
      querySelectorAll: () => [],
      getElementById: () => null
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    setTimeout: () => 0,
    clearTimeout: () => {}
  });

  ctx.window = ctx;
  ctx.global = ctx;

  vm.runInContext(code, ctx, { filename: 'game.js' });

  const Game = vm.runInContext('Game', ctx);
  assert(typeof Game === 'function', 'Game class should be defined');
  assert(typeof Game.prototype.initRuntimeHooks === 'function', 'initRuntimeHooks should exist');
  assert(typeof Game.prototype.renderGameToText === 'function', 'renderGameToText should exist');

  console.log('Runtime hooks sanity checks passed.');
})();
