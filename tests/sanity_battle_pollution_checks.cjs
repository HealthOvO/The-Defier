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

function loadFile(ctx, filePath) {
  let code = fs.readFileSync(filePath, 'utf8');
  code = code.replace(/^export\s+(const|let|var|class|function|default)/gm, '$1');
  code = code.replace(/^export\s+\{.*?\};?/gm, '');
  code = code.replace(/^import\s+.*?;/gm, '');
  vm.runInContext(code, ctx, { filename: filePath });
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const ctx = vm.createContext({
    console,
    window: {},
    document: {
      querySelector: () => null,
      getElementById: () => null,
      querySelectorAll: () => []
    },
    CHARACTERS: {
      linFeng: {
        stats: { maxHp: 80, gold: 100, energy: 3 },
        relic: null
      }
    },
    SKILLS: {},
    STARTER_DECK: [],
    Utils: {
      shuffle: (arr) => arr.slice(),
      showBattleLog: () => {},
      random: (min) => min
    },
    Math,
    JSON,
    Date
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/data/cards.js'));
  loadFile(ctx, path.join(root, 'js/core/player.js'));
  loadFile(ctx, path.join(root, 'js/core/battle.js'));

  const Player = vm.runInContext('Player', ctx);
  const Battle = vm.runInContext('Battle', ctx);

  const player = new Player();
  const game = {
    player,
    currentBattleNode: { polluted: true },
    achievementSystem: { updateStat: () => {} }
  };
  player.game = game;

  const battle = new Battle(game);

  const pollutedCost = battle.getEffectiveCardCost({ id: 'strike', cost: 2, consumeCandy: false });
  assert(pollutedCost === 3, `polluted node should add +1 card cost, got ${pollutedCost}`);

  player.turnNumber = 0;
  player.drawCount = 0;
  player.hand = [{ id: 'strike', name: '斩击' }];
  player.drawPile = [];
  player.discardPile = [];
  player.exhaustPile = [];
  player.collectedLaws = [];
  player.activeResonances = [];
  player.startTurn();

  assert(player.exhaustPile.length === 1, 'polluted first turn should exhaust one hand card');
  assert(player.hand.length === 0, 'polluted first turn should remove card from hand');

  console.log('Battle pollution checks passed.');
})();
