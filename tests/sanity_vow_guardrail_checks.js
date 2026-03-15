const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function loadFile(ctx, filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, ctx, { filename: filePath });
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const ctx = vm.createContext({
    console,
    window: {},
    Math,
    JSON,
    Date,
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    localStorage: { getItem: () => null, setItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    Utils: {
      shuffle: (arr) => arr.slice(),
      showBattleLog: () => {}
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  ['js/data/run_vows.js', 'js/game.js'].forEach((file) => loadFile(ctx, path.join(root, file)));

  const Game = vm.runInContext('Game', ctx);
  const RUN_VOWS = vm.runInContext('RUN_VOWS', ctx);
  const game = Object.create(Game.prototype);

  const vowIds = Object.keys(RUN_VOWS);
  assert(vowIds.length >= 6, `expected 6+ vows, got ${vowIds.length}`);

  vowIds.forEach((vowId) => {
    const raw = RUN_VOWS[vowId];
    const meta = game.getRunVowMetaById(vowId, 1);
    assert(meta && meta.id === vowId, `${vowId} should resolve in getRunVowMetaById`);
    assert(Array.isArray(raw.tags) && raw.tags.length >= 3, `${vowId} should expose guardrail tags`);
    assert(typeof raw.buildFit === 'string' && raw.buildFit.length >= 12, `${vowId} should describe build fit`);
    assert(typeof raw.counterplay === 'string' && raw.counterplay.length >= 12, `${vowId} should describe natural weakness`);
    assert(typeof raw.source === 'string' && raw.source.length >= 8, `${vowId} should expose source`);
    assert(raw.uiMeta && typeof raw.uiMeta.readableCue === 'string' && raw.uiMeta.readableCue.length >= 12, `${vowId} should expose readable cue`);
    assert(raw.unlockRules && Array.isArray(raw.unlockRules.chapterRealms) && raw.unlockRules.chapterRealms.length === 3, `${vowId} should expose unlock rules`);
    assert(typeof meta.routeHint === 'string' && meta.routeHint.length > 0, `${vowId} should expose route hint`);
    assert(typeof meta.buildFit === 'string' && meta.buildFit.length > 0, `${vowId} meta should carry buildFit`);
    assert(typeof meta.counterplay === 'string' && meta.counterplay.length > 0, `${vowId} meta should carry counterplay`);
    assert(meta.uiMeta && typeof meta.uiMeta.readableCue === 'string' && meta.uiMeta.readableCue.length > 0, `${vowId} meta should carry readable cue`);
    assert(Array.isArray(raw.tiers) && raw.tiers.length >= 2, `${vowId} should define at least 2 tiers`);
    raw.tiers.forEach((tier, index) => {
      assert(typeof tier.summary === 'string' && tier.summary.length >= 10, `${vowId} tier ${index + 1} should expose summary`);
      assert(typeof tier.risk === 'string' && tier.risk.length >= 8, `${vowId} tier ${index + 1} should expose risk`);
      assert(tier.effects && typeof tier.effects === 'object' && Object.keys(tier.effects).length >= 2, `${vowId} tier ${index + 1} should expose meaningful effects`);
    });
  });

  console.log('Vow guardrail checks passed.');
})();
