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

(function run() {
  const code = fs.readFileSync(path.resolve(__dirname, '../js/managers/EventManager.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(__dirname, '../js/managers/MetaProgressionManager.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(__dirname, '../js/managers/EndlessManager.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(__dirname, '../js/managers/RunManager.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(__dirname, '../js/managers/SeasonBoardManager.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(__dirname, '../js/managers/SanctumAgendaManager.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(__dirname, '../js/managers/ShopManager.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(__dirname, '../js/managers/SaveManager.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(__dirname, '../js/core/player.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(__dirname, '../js/core/map.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(__dirname, '../js/core/events.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(__dirname, '../js/core/achievements.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(__dirname, '../js/core/fateRing.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(__dirname, '../js/game.js'), 'utf8');

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
