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
  const FATE_PATH_EVENT_POOLS = vm.runInContext('FATE_PATH_EVENT_POOLS', ctx);
  const STRATEGIC_ENGINEERING_EVENT_POOLS = vm.runInContext('STRATEGIC_ENGINEERING_EVENT_POOLS', ctx);
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

  const engineeringCases = [
    {
      trackId: 'observatory',
      tier: 2,
      seed: 12001,
      minHitRate: 0.22
    },
    {
      trackId: 'memory_rift',
      tier: 2,
      seed: 12079,
      minHitRate: 0.22
    }
  ];

  engineeringCases.forEach(({ trackId, tier, seed, minHitRate: minTrackHitRate }) => {
    const eventPool = STRATEGIC_ENGINEERING_EVENT_POOLS[trackId];
    assert(Array.isArray(eventPool) && eventPool.length > 0, `invalid engineering event pool: ${trackId}`);

    ctx.window.game = {
      player: { deck: [] },
      getStrategicEngineeringEventBiasProfile: () => ({
        trackId,
        name: trackId,
        icon: trackId === 'observatory' ? '🔭' : '🪞',
        tier,
        tierLabel: `T${tier}`,
        eventIds: eventPool,
        biasChance: trackId === 'observatory' ? 0.34 : 0.32,
        signal: 'engineering bias test'
      })
    };

    ctx.Math.random = createSeededRandom(seed);
    let hits = 0;
    let resonanceHits = 0;
    for (let i = 0; i < samples; i += 1) {
      const event = getRandomEvent();
      if (event && eventPool.includes(event.id)) hits += 1;
      if (event && event.engineeringResonance && event.engineeringResonance.trackId === trackId) resonanceHits += 1;
    }
    const hitRate = hits / samples;
    const resonanceRate = resonanceHits / samples;
    results.push({ trackId, hitRate, resonanceRate });
    assert(
      hitRate >= minTrackHitRate,
      `${trackId} engineering event bias too weak: hitRate=${hitRate.toFixed(3)}, expected >= ${minTrackHitRate}`
    );
    assert(
      resonanceRate >= 0.16,
      `${trackId} engineering resonance too weak: resonanceRate=${resonanceRate.toFixed(3)}, expected >= 0.16`
    );
  });

  [
    { pathId: 'resonance', seed: 13103, minEchoRate: 0.07 },
    { pathId: 'wisdom', seed: 13217, minEchoRate: 0.07 }
  ].forEach(({ pathId, seed, minEchoRate }) => {
    const eventPool = FATE_PATH_EVENT_POOLS[pathId];
    assert(Array.isArray(eventPool) && eventPool.includes('fateRingEchoShrine'), `${pathId} fate-path pool should include fateRingEchoShrine`);

    ctx.window.game = {
      player: {
        deck: [],
        fateRing: { path: pathId },
        getPathDoctrineProfile: () => ({ path: pathId, tier: 3 })
      }
    };

    ctx.Math.random = createSeededRandom(seed);
    let hits = 0;
    let echoHits = 0;
    for (let i = 0; i < samples; i += 1) {
      const event = getRandomEvent();
      if (event && eventPool.includes(event.id)) hits += 1;
      if (event && event.id === 'fateRingEchoShrine') echoHits += 1;
    }
    const hitRate = hits / samples;
    const echoRate = echoHits / samples;
    results.push({ pathId, hitRate, echoRate });
    assert(
      hitRate >= 0.28,
      `${pathId} fate-path event bias too weak: hitRate=${hitRate.toFixed(3)}, expected >= 0.28`
    );
    assert(
      echoRate >= minEchoRate,
      `${pathId} fateRingEchoShrine bias too weak: echoRate=${echoRate.toFixed(3)}, expected >= ${minEchoRate}`
    );
  });

  [
    { pathId: 'destruction', seed: 13331, targetEventId: 'ruinBountyWrit', minTargetRate: 0.06 },
    { pathId: 'convergence', seed: 13411, targetEventId: 'convergenceMatrixAccord', minTargetRate: 0.05 },
    { pathId: 'wisdom', seed: 13523, targetEventId: 'wisdomStarScriptorium', minTargetRate: 0.05 },
    { pathId: 'resonance', seed: 13637, targetEventId: 'resonanceWardCanticle', minTargetRate: 0.05 }
  ].forEach(({ pathId, seed, targetEventId, minTargetRate }) => {
    const eventPool = FATE_PATH_EVENT_POOLS[pathId];
    assert(Array.isArray(eventPool) && eventPool.includes(targetEventId), `${pathId} fate-path pool should include ${targetEventId}`);

    ctx.window.game = {
      player: {
        deck: [],
        fateRing: { path: pathId },
        getPathDoctrineProfile: () => ({ path: pathId, tier: 3 })
      }
    };

    ctx.Math.random = createSeededRandom(seed);
    let hits = 0;
    let targetHits = 0;
    for (let i = 0; i < samples; i += 1) {
      const event = getRandomEvent();
      if (event && eventPool.includes(event.id)) hits += 1;
      if (event && event.id === targetEventId) targetHits += 1;
    }
    const hitRate = hits / samples;
    const targetRate = targetHits / samples;
    results.push({ pathId, hitRate, targetEventId, targetRate });
    assert(
      hitRate >= 0.28,
      `${pathId} fate-path event bias too weak: hitRate=${hitRate.toFixed(3)}, expected >= 0.28`
    );
    assert(
      targetRate >= minTargetRate,
      `${pathId} ${targetEventId} bias too weak: targetRate=${targetRate.toFixed(3)}, expected >= ${minTargetRate}`
    );
  });

  console.log(`Event bias distribution checks passed: ${JSON.stringify(results)}`);
})();
