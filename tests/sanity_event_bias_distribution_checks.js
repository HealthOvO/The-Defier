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

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const mathObj = Object.create(Math);

  const ctx = vm.createContext({
    console,
    Math: mathObj,
    JSON,
    Date,
    window: {},
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    Utils: {
      random: (min) => min,
      shuffle: (arr) => arr.slice(),
      showBattleLog: () => {}
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/data/cards.js'));
  loadFile(ctx, path.join(root, 'js/data/events.js'));

  const CARDS = vm.runInContext('CARDS', ctx);
  const ARCHETYPE_PACKS = vm.runInContext('ARCHETYPE_PACKS', ctx);
  const ARCHETYPE_EVENT_POOLS = vm.runInContext('ARCHETYPE_EVENT_POOLS', ctx);
  const getRandomEvent = vm.runInContext('getRandomEvent', ctx);

  const samples = 1200;
  const minHitRate = 0.3;
  const results = [];

  Object.keys(ARCHETYPE_EVENT_POOLS).forEach((archetypeId, index) => {
    const pack = ARCHETYPE_PACKS[archetypeId];
    assert(pack && Array.isArray(pack.cards) && pack.cards.length > 0, `invalid archetype pack: ${archetypeId}`);

    const eventPool = ARCHETYPE_EVENT_POOLS[archetypeId];
    assert(Array.isArray(eventPool) && eventPool.length > 0, `invalid archetype event pool: ${archetypeId}`);

    const deck = pack.cards.slice(0, 10).map((id) => ({ ...CARDS[id] }));
    ctx.window.game = { player: { deck } };

    ctx.Math.random = createSeededRandom(9001 + index * 37);
    let hits = 0;
    for (let i = 0; i < samples; i += 1) {
      const event = getRandomEvent();
      if (event && eventPool.includes(event.id)) hits += 1;
    }
    const hitRate = hits / samples;
    results.push({ archetypeId, hitRate });
    assert(
      hitRate >= minHitRate,
      `${archetypeId} event bias too weak: hitRate=${hitRate.toFixed(3)}, expected >= ${minHitRate}`
    );
  });

  console.log(`Event bias distribution checks passed: ${JSON.stringify(results)}`);
})();
