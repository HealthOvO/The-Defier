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
      random: (min, max) => min,
      shuffle: (arr) => arr.slice(),
      showBattleLog: () => {}
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/data/cards.js'));
  loadFile(ctx, path.join(root, 'js/data/events.js'));

  const CARDS = vm.runInContext('CARDS', ctx);
  const EVENTS = vm.runInContext('EVENTS', ctx);
  const EVENT_POOL = vm.runInContext('EVENT_POOL', ctx);
  const ARCHETYPE_EVENT_POOLS = vm.runInContext('ARCHETYPE_EVENT_POOLS', ctx);
  const ARCHETYPE_PACKS = vm.runInContext('ARCHETYPE_PACKS', ctx);
  const getArchetypePack = vm.runInContext('getArchetypePack', ctx);
  const getRandomArchetypeCard = vm.runInContext('getRandomArchetypeCard', ctx);
  const getRewardCards = vm.runInContext('getRewardCards', ctx);
  const getRandomEvent = vm.runInContext('getRandomEvent', ctx);

  // 1) 流派包完整性
  ['hemorrhage', 'precision', 'entropy', 'bulwark'].forEach((id) => {
    const pack = ARCHETYPE_PACKS[id];
    assert(pack, `missing archetype pack: ${id}`);
    assert(Array.isArray(pack.cards) && pack.cards.length >= 15, `${id} should have at least 15 cards`);
    pack.cards.forEach((cardId) => {
      assert(!!CARDS[cardId], `${id} contains missing card: ${cardId}`);
    });

    const rarityCount = { common: 0, uncommon: 0, rare: 0 };
    pack.cards.forEach((cardId) => {
      const rarity = CARDS[cardId].rarity;
      if (rarityCount[rarity] !== undefined) rarityCount[rarity] += 1;
    });
    assert(rarityCount.common > 0, `${id} should include common cards`);
    assert(rarityCount.uncommon > 0, `${id} should include uncommon cards`);
    assert(rarityCount.rare > 0, `${id} should include rare cards`);
  });

  // 2) 流派 API 基本可用
  const hemorrhagePack = getArchetypePack('hemorrhage');
  assert(hemorrhagePack && hemorrhagePack.id === 'hemorrhage', 'getArchetypePack should return hemorrhage pack');
  const rareHemorrhage = getRandomArchetypeCard('hemorrhage', 'rare', null);
  assert(rareHemorrhage && rareHemorrhage.rarity === 'rare', 'rare hemorrhage card should be retrievable');
  const entropyPack = getArchetypePack('entropy');
  assert(entropyPack && entropyPack.id === 'entropy', 'getArchetypePack should return entropy pack');
  const rareEntropy = getRandomArchetypeCard('entropy', 'rare', null);
  assert(rareEntropy && rareEntropy.rarity === 'rare', 'rare entropy card should be retrievable');
  const bulwarkPack = getArchetypePack('bulwark');
  assert(bulwarkPack && bulwarkPack.id === 'bulwark', 'getArchetypePack should return bulwark pack');
  const rareBulwark = getRandomArchetypeCard('bulwark', 'rare', null);
  assert(rareBulwark && rareBulwark.rarity === 'rare', 'rare bulwark card should be retrievable');

  // 3) 奖励偏置：牌组明显偏向时，奖励应显著命中对应流派
  const precisionDeck = ARCHETYPE_PACKS.precision.cards.slice(0, 10).map((id) => ({ ...CARDS[id] }));
  const oldRandom = ctx.Math.random;
  const seq = [0.2, 0.1, 0.3, 0.15, 0.25, 0.05, 0.4, 0.12];
  let idx = 0;
  ctx.Math.random = () => {
    const val = seq[idx % seq.length];
    idx += 1;
    return val;
  };
  const rewards = getRewardCards(6, null, precisionDeck);
  ctx.Math.random = oldRandom;
  const precisionSet = new Set(ARCHETYPE_PACKS.precision.cards);
  const hitCount = rewards.filter((c) => precisionSet.has(c.id)).length;
  assert(hitCount >= 4, `expected reward bias to precision, got ${hitCount}/6`);

  // 4) 新事件挂载与引用完整性
  const newEvents = [
    'bloodForgeCovenant', 'mirrorNeedleDojo', 'shatteredCompass', 'debtboundAnvil',
    'voidBookkeeper', 'ashLedgerTrial', 'convergenceRitual',
    'shieldRelayBeacon', 'ironCitadelPact', 'aegisTribunal'
  ];
  newEvents.forEach((eventId) => {
    assert(!!EVENTS[eventId], `missing event definition: ${eventId}`);
    assert(Array.isArray(EVENTS[eventId].choices) && EVENTS[eventId].choices.length >= 2, `event should have >=2 choices: ${eventId}`);
  });
  assert(EVENT_POOL.common.includes('mirrorNeedleDojo'), 'mirrorNeedleDojo should be in common pool');
  assert(EVENT_POOL.uncommon.includes('bloodForgeCovenant'), 'bloodForgeCovenant should be in uncommon pool');
  assert(EVENT_POOL.uncommon.includes('shatteredCompass'), 'shatteredCompass should be in uncommon pool');
  assert(EVENT_POOL.rare.includes('debtboundAnvil'), 'debtboundAnvil should be in rare pool');
  assert(EVENT_POOL.common.includes('voidBookkeeper'), 'voidBookkeeper should be in common pool');
  assert(EVENT_POOL.common.includes('shieldRelayBeacon'), 'shieldRelayBeacon should be in common pool');
  assert(EVENT_POOL.uncommon.includes('ashLedgerTrial'), 'ashLedgerTrial should be in uncommon pool');
  assert(EVENT_POOL.uncommon.includes('ironCitadelPact'), 'ironCitadelPact should be in uncommon pool');
  assert(EVENT_POOL.rare.includes('convergenceRitual'), 'convergenceRitual should be in rare pool');
  assert(EVENT_POOL.rare.includes('aegisTribunal'), 'aegisTribunal should be in rare pool');

  newEvents.forEach((eventId) => {
    EVENTS[eventId].choices.forEach((choice) => {
      (choice.effects || []).forEach((effect) => {
        if (effect.type === 'card' && effect.cardId) {
          assert(!!CARDS[effect.cardId], `${eventId} references unknown cardId: ${effect.cardId}`);
        }
      });
    });
  });

  // 5) 事件偏置池完整性 + 四流派偏置命中
  const expectedEventPools = {
    hemorrhage: ['bloodForgeCovenant', 'shatteredCompass', 'debtboundAnvil'],
    precision: ['mirrorNeedleDojo', 'shatteredCompass', 'bloodForgeCovenant'],
    entropy: ['voidBookkeeper', 'ashLedgerTrial', 'convergenceRitual'],
    bulwark: ['shieldRelayBeacon', 'ironCitadelPact', 'aegisTribunal']
  };
  Object.entries(expectedEventPools).forEach(([archetypeId, expectedIds]) => {
    const actual = ARCHETYPE_EVENT_POOLS[archetypeId];
    assert(Array.isArray(actual), `missing event pool for archetype: ${archetypeId}`);
    expectedIds.forEach((eventId) => {
      assert(actual.includes(eventId), `${archetypeId} event pool should include ${eventId}`);
    });
  });

  Object.entries(expectedEventPools).forEach(([archetypeId, eventIds]) => {
    const deck = ARCHETYPE_PACKS[archetypeId].cards.slice(0, 10).map((id) => ({ ...CARDS[id] }));
    ctx.window.game = { player: { deck } };
    const oldRandom2 = ctx.Math.random;
    const seq2 = [0.2, 0.1]; // 触发偏置 + 在偏置池内选中第一个
    let idx2 = 0;
    ctx.Math.random = () => {
      const val = seq2[idx2 % seq2.length];
      idx2 += 1;
      return val;
    };
    const boostedEvent = getRandomEvent();
    ctx.Math.random = oldRandom2;
    const expectedSet = new Set(eventIds);
    assert(
      boostedEvent && expectedSet.has(boostedEvent.id),
      `expected ${archetypeId} event bias hit, got ${boostedEvent ? boostedEvent.id : 'null'}`
    );
  });

  console.log('Content archetype checks passed.');
})();
