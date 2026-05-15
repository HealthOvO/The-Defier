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

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
    Math,
    JSON,
    Date,
    window: {},
    document: {
      querySelector: () => null,
      createElement: () => ({ style: {}, innerHTML: '', querySelector: () => null, insertAdjacentElement: () => {} })
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    Utils: {
      showBattleLog: () => {}
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  const bootstrapCode = `
    class Game {
      constructor() {
        this.visitLog = [];
      }
      recordExpeditionNodeVisit(node) {
        this.visitLog.push(String(node && node.id || ''));
      }
    }

    class GameMap {
      constructor(game) {
        this.game = game;
        this.nodes = [[{ id: 'observatory_1', row: 0, type: 'observatory', accessible: true, completed: false }]];
      }
      onNodeClick(node) {
        return node && node.id;
      }
      completeNode(node) {
        const target = this.nodes[0][0];
        if (!target || target.id !== node.id) return false;
        if (target.completed) return false;
        target.completed = true;
        return true;
      }
      updateMapState() {
        return true;
      }
      render() {
        return true;
      }
    }

    this.Game = Game;
    this.GameMap = GameMap;
  `;

  vm.runInContext(bootstrapCode, ctx, { filename: 'expedition_completion_gate_bootstrap.js' });
  loadFile(ctx, path.join(root, 'js/data/expedition_systems.js'));
  loadFile(ctx, path.join(root, 'js/core/expedition_hub.js'));

  const Game = vm.runInContext('Game', ctx);
  const GameMap = vm.runInContext('GameMap', ctx);const game = new Game();

  if (typeof ctx.__attachExpeditionHubController === 'function') ctx.__attachExpeditionHubController(game);
  game.recordExpeditionNodeVisit = (node) => {
    game.visitLog.push(String(node && node.id || ''));
  };
  const map = new GameMap(game);
  game.map = map;
  if (typeof ctx.__attachExpeditionHubController === 'function') ctx.__attachExpeditionHubController(game);
  const node = map.nodes[0][0];

  const clickResult = map.onNodeClick(node);
  assert(clickResult === 'observatory_1', `wrapped onNodeClick should still delegate to original handler, got ${clickResult}`);
  assert(game.visitLog.length === 0, `clicking node should not record expedition visit before completion, got ${JSON.stringify(game.visitLog)}`);

  const firstComplete = map.completeNode(node);
  assert(firstComplete === true, `first completeNode should succeed, got ${firstComplete}`);
  assert(game.visitLog.length === 1 && game.visitLog[0] === 'observatory_1', `visit should record exactly once after node completion, got ${JSON.stringify(game.visitLog)}`);

  const secondComplete = map.completeNode(node);
  assert(secondComplete === false, `second completeNode should be rejected for completed node, got ${secondComplete}`);
  assert(game.visitLog.length === 1, `repeat completion should not double-record expedition visit, got ${JSON.stringify(game.visitLog)}`);

  console.log('Expedition completion gate checks passed.');
})();
