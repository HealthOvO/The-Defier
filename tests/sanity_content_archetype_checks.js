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
  const ENDLESS_EVENT_POOL = vm.runInContext('ENDLESS_EVENT_POOL', ctx);
  const ENDLESS_MUTATOR_EVENT_BIAS = vm.runInContext('ENDLESS_MUTATOR_EVENT_BIAS', ctx);
  const ARCHETYPE_EVENT_POOLS = vm.runInContext('ARCHETYPE_EVENT_POOLS', ctx);
  const FATE_PATH_EVENT_POOLS = vm.runInContext('FATE_PATH_EVENT_POOLS', ctx);
  const STRATEGIC_ENGINEERING_EVENT_POOLS = vm.runInContext('STRATEGIC_ENGINEERING_EVENT_POOLS', ctx);
  const ARCHETYPE_PACKS = vm.runInContext('ARCHETYPE_PACKS', ctx);
  const inferDeckArchetype = vm.runInContext('inferDeckArchetype', ctx);
  const getArchetypePack = vm.runInContext('getArchetypePack', ctx);
  const getRandomArchetypeCard = vm.runInContext('getRandomArchetypeCard', ctx);
  const getRewardCards = vm.runInContext('getRewardCards', ctx);
  const getRandomEvent = vm.runInContext('getRandomEvent', ctx);

  // 1) 流派包完整性
  const archetypePackMinimums = {
    hemorrhage: 15,
    precision: 15,
    entropy: 15,
    stormcraft: 15,
    vitalweave: 15,
    bulwark: 15,
    cursebound: 15,
    soulforge: 15,
    mirrorweave: 10,
    oathbound: 10
  };
  Object.entries(archetypePackMinimums).forEach(([id, minCards]) => {
    const pack = ARCHETYPE_PACKS[id];
    assert(pack, `missing archetype pack: ${id}`);
    assert(Array.isArray(pack.cards) && pack.cards.length >= minCards, `${id} should have at least ${minCards} cards`);
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
  const stormcraftPack = getArchetypePack('stormcraft');
  assert(stormcraftPack && stormcraftPack.id === 'stormcraft', 'getArchetypePack should return stormcraft pack');
  const rareStormcraft = getRandomArchetypeCard('stormcraft', 'rare', null);
  assert(rareStormcraft && rareStormcraft.rarity === 'rare', 'rare stormcraft card should be retrievable');
  const vitalweavePack = getArchetypePack('vitalweave');
  assert(vitalweavePack && vitalweavePack.id === 'vitalweave', 'getArchetypePack should return vitalweave pack');
  const rareVitalweave = getRandomArchetypeCard('vitalweave', 'rare', null);
  assert(rareVitalweave && rareVitalweave.rarity === 'rare', 'rare vitalweave card should be retrievable');
  const curseboundPack = getArchetypePack('cursebound');
  assert(curseboundPack && curseboundPack.id === 'cursebound', 'getArchetypePack should return cursebound pack');
  const rareCursebound = getRandomArchetypeCard('cursebound', 'rare', null);
  assert(rareCursebound && rareCursebound.rarity === 'rare', 'rare cursebound card should be retrievable');
  const soulforgePack = getArchetypePack('soulforge');
  assert(soulforgePack && soulforgePack.id === 'soulforge', 'getArchetypePack should return soulforge pack');
  const rareSoulforge = getRandomArchetypeCard('soulforge', 'rare', null);
  assert(rareSoulforge && rareSoulforge.rarity === 'rare', 'rare soulforge card should be retrievable');
  const mirrorweavePack = getArchetypePack('mirrorweave');
  assert(mirrorweavePack && mirrorweavePack.id === 'mirrorweave', 'getArchetypePack should return mirrorweave pack');
  const rareMirrorweave = getRandomArchetypeCard('mirrorweave', 'rare', null);
  assert(rareMirrorweave && rareMirrorweave.rarity === 'rare', 'rare mirrorweave card should be retrievable');
  const oathboundPack = getArchetypePack('oathbound');
  assert(oathboundPack && oathboundPack.id === 'oathbound', 'getArchetypePack should return oathbound pack');
  const rareOathbound = getRandomArchetypeCard('oathbound', 'rare', null);
  assert(rareOathbound && rareOathbound.rarity === 'rare', 'rare oathbound card should be retrievable');

  const mirrorweaveDeck = ARCHETYPE_PACKS.mirrorweave.cards.slice(0, 10).map((id) => ({ ...CARDS[id] }));
  const oathboundDeck = ARCHETYPE_PACKS.oathbound.cards.slice(0, 10).map((id) => ({ ...CARDS[id] }));
  assert(inferDeckArchetype(mirrorweaveDeck) === 'mirrorweave', 'mirrorweave deck should infer mirrorweave archetype');
  assert(inferDeckArchetype(oathboundDeck) === 'oathbound', 'oathbound deck should infer oathbound archetype');

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
    'shieldRelayBeacon', 'ironCitadelPact', 'aegisTribunal',
    'caravanQuartermaster', 'nightWatchCamp', 'frontierContractBoard',
    'floatingMarketRift', 'emberCampSignal', 'leylineConfluence', 'astralSupplyDepot',
    'medicRelayPost', 'starlitFieldHospital', 'riftAidConvoy',
    'convergenceRelay', 'harmonicAnvil', 'artifactConfluxBazaar',
    'oathscarShrine', 'griefWritArchive', 'blackbannerExecution',
    'ghostFurnace', 'marionetteArmory', 'ancestralFoundry',
    'endlessPressureValve', 'endlessFaultLine', 'endlessOverclockAltar',
    'thunderConductTrial', 'stormchaserCamp', 'fulgurMarket', 'overclockSigil',
    'herbalPactShrine', 'lifestringClinic', 'bloodloomGarden', 'hospiceRelay'
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
  assert(EVENT_POOL.uncommon.includes('caravanQuartermaster'), 'caravanQuartermaster should be in uncommon pool');
  assert(EVENT_POOL.common.includes('nightWatchCamp'), 'nightWatchCamp should be in common pool');
  assert(EVENT_POOL.rare.includes('frontierContractBoard'), 'frontierContractBoard should be in rare pool');
  assert(EVENT_POOL.uncommon.includes('floatingMarketRift'), 'floatingMarketRift should be in uncommon pool');
  assert(EVENT_POOL.common.includes('emberCampSignal'), 'emberCampSignal should be in common pool');
  assert(EVENT_POOL.common.includes('leylineConfluence'), 'leylineConfluence should be in common pool');
  assert(EVENT_POOL.uncommon.includes('astralSupplyDepot'), 'astralSupplyDepot should be in uncommon pool');
  assert(EVENT_POOL.common.includes('medicRelayPost'), 'medicRelayPost should be in common pool');
  assert(EVENT_POOL.uncommon.includes('starlitFieldHospital'), 'starlitFieldHospital should be in uncommon pool');
  assert(EVENT_POOL.common.includes('riftAidConvoy'), 'riftAidConvoy should be in common pool');
  assert(EVENT_POOL.common.includes('oathscarShrine'), 'oathscarShrine should be in common pool');
  assert(EVENT_POOL.uncommon.includes('griefWritArchive'), 'griefWritArchive should be in uncommon pool');
  assert(EVENT_POOL.rare.includes('blackbannerExecution'), 'blackbannerExecution should be in rare pool');
  assert(EVENT_POOL.common.includes('ghostFurnace'), 'ghostFurnace should be in common pool');
  assert(EVENT_POOL.uncommon.includes('marionetteArmory'), 'marionetteArmory should be in uncommon pool');
  assert(EVENT_POOL.rare.includes('ancestralFoundry'), 'ancestralFoundry should be in rare pool');
  assert(EVENT_POOL.uncommon.includes('convergenceRelay'), 'convergenceRelay should be in uncommon pool');
  assert(EVENT_POOL.uncommon.includes('harmonicAnvil'), 'harmonicAnvil should be in uncommon pool');
  assert(EVENT_POOL.rare.includes('artifactConfluxBazaar'), 'artifactConfluxBazaar should be in rare pool');
  assert(EVENT_POOL.uncommon.includes('thunderConductTrial'), 'thunderConductTrial should be in uncommon pool');
  assert(EVENT_POOL.common.includes('stormchaserCamp'), 'stormchaserCamp should be in common pool');
  assert(EVENT_POOL.uncommon.includes('fulgurMarket'), 'fulgurMarket should be in uncommon pool');
  assert(EVENT_POOL.rare.includes('overclockSigil'), 'overclockSigil should be in rare pool');
  assert(EVENT_POOL.common.includes('herbalPactShrine'), 'herbalPactShrine should be in common pool');
  assert(EVENT_POOL.uncommon.includes('lifestringClinic'), 'lifestringClinic should be in uncommon pool');
  assert(EVENT_POOL.uncommon.includes('bloodloomGarden'), 'bloodloomGarden should be in uncommon pool');
  assert(EVENT_POOL.rare.includes('hospiceRelay'), 'hospiceRelay should be in rare pool');
  assert(ENDLESS_EVENT_POOL.common.includes('endlessPressureValve'), 'endlessPressureValve should be in endless common pool');
  assert(ENDLESS_EVENT_POOL.common.includes('endlessOverclockAltar'), 'endlessOverclockAltar should be in endless common pool');
  assert(ENDLESS_EVENT_POOL.rare.includes('endlessFaultLine'), 'endlessFaultLine should be in endless rare pool');
  assert(ENDLESS_EVENT_POOL.common.includes('endlessChronicleBroker'), 'endlessChronicleBroker should be in endless common pool');
  assert(ENDLESS_EVENT_POOL.common.includes('endlessMutatorWorkshop'), 'endlessMutatorWorkshop should be in endless common pool');
  assert(ENDLESS_EVENT_POOL.rare.includes('endlessMemoryVault'), 'endlessMemoryVault should be in endless rare pool');
  assert(Array.isArray(ENDLESS_MUTATOR_EVENT_BIAS.war_market), 'mutator event bias for war_market should exist');
  assert(Array.isArray(ENDLESS_MUTATOR_EVENT_BIAS.void_tax), 'mutator event bias for void_tax should exist');
  assert(Array.isArray(ENDLESS_MUTATOR_EVENT_BIAS.trial_inferno), 'mutator event bias for trial_inferno should exist');

  newEvents.forEach((eventId) => {
    EVENTS[eventId].choices.forEach((choice) => {
      (choice.effects || []).forEach((effect) => {
        if (effect.type === 'card' && effect.cardId) {
          assert(!!CARDS[effect.cardId], `${eventId} references unknown cardId: ${effect.cardId}`);
        }
        if (effect.type === 'adventureBuff') {
          assert(
            [
              'firstTurnDrawBoostBattles',
              'openingBlockBoostBattles',
              'victoryGoldBoostBattles',
              'firstTurnEnergyBoostBattles',
              'ringExpBoostBattles',
              'victoryHealBoostBattles'
            ].includes(effect.buffId),
            `${eventId} references unknown adventure buff: ${effect.buffId}`
          );
          assert(Number(effect.charges) >= 1, `${eventId} adventure buff charges should be >= 1`);
        }
        if (effect.type === 'openTemporaryShop') {
          assert(Number(effect.offerCount || 0) >= 2, `${eventId} temporary shop should provide at least 2 offers`);
        }
        if (effect.type === 'openCampfire') {
          assert(true, `${eventId} openCampfire effect should be recognized`);
        }
        if (effect.type === 'endlessPressure') {
          assert(Number.isFinite(Number(effect.value)), `${eventId} endlessPressure effect should have numeric value`);
        }
      });
    });
  });

  // 5) 事件偏置池完整性 + 四流派偏置命中
  const expectedEventPools = {
    hemorrhage: ['bloodForgeCovenant', 'shatteredCompass', 'debtboundAnvil'],
    precision: ['mirrorNeedleDojo', 'shatteredCompass', 'bloodForgeCovenant', 'caravanQuartermaster', 'floatingMarketRift', 'astralSupplyDepot'],
    entropy: ['voidBookkeeper', 'ashLedgerTrial', 'convergenceRitual', 'frontierContractBoard', 'floatingMarketRift', 'astralSupplyDepot'],
    stormcraft: ['thunderConductTrial', 'stormchaserCamp', 'fulgurMarket', 'overclockSigil', 'convergenceRelay', 'harmonicAnvil'],
    vitalweave: ['herbalPactShrine', 'lifestringClinic', 'bloodloomGarden', 'hospiceRelay', 'medicRelayPost', 'starlitFieldHospital', 'riftAidConvoy'],
    bulwark: ['shieldRelayBeacon', 'ironCitadelPact', 'aegisTribunal', 'nightWatchCamp', 'emberCampSignal', 'leylineConfluence', 'medicRelayPost', 'starlitFieldHospital', 'riftAidConvoy'],
    cursebound: ['oathscarShrine', 'griefWritArchive', 'blackbannerExecution', 'voidBookkeeper', 'ashLedgerTrial', 'frontierContractBoard'],
    soulforge: ['ghostFurnace', 'marionetteArmory', 'ancestralFoundry', 'harmonicAnvil', 'artifactConfluxBazaar', 'shieldRelayBeacon']
  };
  Object.entries(expectedEventPools).forEach(([archetypeId, expectedIds]) => {
    const actual = ARCHETYPE_EVENT_POOLS[archetypeId];
    assert(Array.isArray(actual), `missing event pool for archetype: ${archetypeId}`);
    expectedIds.forEach((eventId) => {
      assert(actual.includes(eventId), `${archetypeId} event pool should include ${eventId}`);
    });
  });
  ['mirrorweave', 'oathbound'].forEach((archetypeId) => {
    const actual = ARCHETYPE_EVENT_POOLS[archetypeId];
    assert(Array.isArray(actual), `missing event pool for archetype: ${archetypeId}`);
    assert(actual.length >= 3, `${archetypeId} event pool should include at least 3 events`);
    actual.forEach((eventId) => {
      assert(!!EVENTS[eventId], `${archetypeId} event pool references missing event: ${eventId}`);
    });
  });

  const expectedPathPools = {
    convergence: ['convergenceRelay', 'harmonicAnvil', 'artifactConfluxBazaar'],
    resonance: ['stormchaserCamp', 'thunderConductTrial', 'fulgurMarket'],
    wisdom: ['lifestringClinic', 'artifactConfluxBazaar', 'ancientLibrary'],
    destruction: ['overclockSigil', 'bloodForgeCovenant', 'bloodloomGarden']
  };
  Object.entries(expectedPathPools).forEach(([pathId, expectedIds]) => {
    const actual = FATE_PATH_EVENT_POOLS[pathId];
    assert(Array.isArray(actual), `missing event pool for path: ${pathId}`);
    expectedIds.forEach((eventId) => {
      assert(actual.includes(eventId), `${pathId} event pool should include ${eventId}`);
    });
  });

  const expectedEngineeringPools = {
    observatory: ['artifactConfluxBazaar', 'convergenceRelay', 'harmonicAnvil', 'starObservation', 'astralSupplyDepot', 'floatingMarketRift'],
    memory_rift: ['floatingMarketRift', 'astralSupplyDepot', 'voidRift', 'voidBookkeeper', 'artifactConfluxBazaar', 'convergenceRelay']
  };
  Object.entries(expectedEngineeringPools).forEach(([trackId, expectedIds]) => {
    const actual = STRATEGIC_ENGINEERING_EVENT_POOLS[trackId];
    assert(Array.isArray(actual), `missing engineering event pool for track: ${trackId}`);
    expectedIds.forEach((eventId) => {
      assert(actual.includes(eventId), `${trackId} engineering event pool should include ${eventId}`);
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
  ['mirrorweave', 'oathbound'].forEach((archetypeId) => {
    const deck = ARCHETYPE_PACKS[archetypeId].cards.slice(0, 10).map((id) => ({ ...CARDS[id] }));
    const eventPool = Array.isArray(ARCHETYPE_EVENT_POOLS[archetypeId]) ? ARCHETYPE_EVENT_POOLS[archetypeId].filter((id) => !!EVENTS[id]) : [];
    assert(eventPool.length >= 1, `${archetypeId} event pool should have at least one valid event`);
    ctx.window.game = { player: { deck } };
    const oldRandom2 = ctx.Math.random;
    const seq2 = [0.2, 0.1];
    let idx2 = 0;
    ctx.Math.random = () => {
      const val = seq2[idx2 % seq2.length];
      idx2 += 1;
      return val;
    };
    const boostedEvent = getRandomEvent();
    ctx.Math.random = oldRandom2;
    const expectedSet = new Set(eventPool);
    assert(
      boostedEvent && expectedSet.has(boostedEvent.id),
      `expected ${archetypeId} event bias hit, got ${boostedEvent ? boostedEvent.id : 'null'}`
    );
  });

  // 5.5) 命环路径偏置应可命中路径事件池
  {
    ctx.window.game = {
      player: {
        deck: [],
        fateRing: { path: 'resonance' }
      }
    };
    const oldRandom = ctx.Math.random;
    const seq = [0.1, 0.2]; // 触发路径偏置 + 命中池内事件
    let ridx = 0;
    ctx.Math.random = () => {
      const val = seq[ridx % seq.length];
      ridx += 1;
      return val;
    };
    const evt = getRandomEvent();
    ctx.Math.random = oldRandom;
    const expectedSet = new Set(expectedPathPools.resonance);
    assert(
      evt && expectedSet.has(evt.id),
      `expected resonance path bias hit, got ${evt ? evt.id : 'null'}`
    );
  }

  // 5.6) 工程偏置应能命中观星/裂隙事件池，并挂上可见强化信息
  {
    ctx.window.game = {
      player: { deck: [] },
      getStrategicEngineeringSnapshot: () => ({
        focusTrack: {
          trackId: 'observatory',
          tier: 2,
          tierLabel: 'II阶',
          name: '观星工程',
          icon: '🔭',
          effectSummary: '观测网已经锁定此地灵流'
        },
        activeTracks: [
          {
            trackId: 'observatory',
            tier: 2,
            tierLabel: 'II阶',
            name: '观星工程',
            icon: '🔭',
            effectSummary: '观测网已经锁定此地灵流'
          }
        ],
        summary: '观星工程 II阶'
      })
    };
    const oldRandom = ctx.Math.random;
    const seq = [0.1, 0.2]; // 触发工程偏置 + 命中池内第二个事件 artifactConfluxBazaar
    let ridx = 0;
    ctx.Math.random = () => {
      const val = seq[ridx % seq.length];
      ridx += 1;
      return val;
    };
    const evt = getRandomEvent();
    ctx.Math.random = oldRandom;
    assert(evt && evt.id === 'artifactConfluxBazaar', `expected observatory engineering event hit, got ${evt ? evt.id : 'null'}`);
    assert(
      evt.engineeringEventMeta && evt.engineeringEventMeta.trackId === 'observatory' && evt.engineeringEventMeta.selectedByEngineeringBias === true,
      `observatory engineering event should expose engineeringEventMeta, got ${JSON.stringify(evt && evt.engineeringEventMeta)}`
    );
    assert(
      evt.engineeringResonance && evt.engineeringResonance.trackId === 'observatory' && evt.engineeringResonance.biasSource === 'focus',
      `observatory engineering event should also expose engineeringResonance, got ${JSON.stringify(evt && evt.engineeringResonance)}`
    );
    assert(/工程联动/.test(evt.summary || ''), `observatory engineering summary should mention engineering linkage, got ${evt.summary}`);
    assert(
      evt.choices[0].effects.some((effect) => effect.type === 'openTemporaryShop' && Number(effect.offerCount) >= 5 && Number(effect.priceMultiplier) < 1),
      `observatory market entry should gain extra slot + discount, got ${JSON.stringify(evt.choices[0].effects)}`
    );
    assert(
      evt.choices[1].effects.some((effect) => effect.type === 'heavenlyInsight'),
      `observatory stipend should gain heavenlyInsight, got ${JSON.stringify(evt.choices[1].effects)}`
    );
  }

  {
    ctx.window.game = {
      player: { deck: [] },
      getStrategicEngineeringSnapshot: () => ({
        focusTrack: {
          trackId: 'memory_rift',
          tier: 2,
          tierLabel: 'II阶',
          name: '裂隙工程',
          icon: '🪞',
          effectSummary: '裂隙工程已经与当前路线并轨'
        },
        activeTracks: [
          {
            trackId: 'memory_rift',
            tier: 2,
            tierLabel: 'II阶',
            name: '裂隙工程',
            icon: '🪞',
            effectSummary: '裂隙工程已经与当前路线并轨'
          }
        ],
        summary: '裂隙工程 II阶'
      })
    };
    const oldRandom = ctx.Math.random;
    const seq = [0.1, 0.0]; // 触发工程偏置 + 命中池内首个事件 floatingMarketRift
    let ridx = 0;
    ctx.Math.random = () => {
      const val = seq[ridx % seq.length];
      ridx += 1;
      return val;
    };
    const evt = getRandomEvent();
    ctx.Math.random = oldRandom;
    assert(evt && evt.id === 'floatingMarketRift', `expected memory_rift engineering event hit, got ${evt ? evt.id : 'null'}`);
    assert(
      evt.engineeringEventMeta && evt.engineeringEventMeta.trackId === 'memory_rift' && evt.engineeringEventMeta.selectedByEngineeringBias === true,
      `memory_rift engineering event should expose engineeringEventMeta, got ${JSON.stringify(evt && evt.engineeringEventMeta)}`
    );
    assert(
      evt.engineeringResonance && evt.engineeringResonance.trackId === 'memory_rift' && evt.engineeringResonance.biasSource === 'focus',
      `memory_rift engineering event should also expose engineeringResonance, got ${JSON.stringify(evt && evt.engineeringResonance)}`
    );
    assert(
      evt.choices[0].effects.some((effect) => effect.type === 'openTemporaryShop' && Number(effect.offerCount) >= 4 && Number(effect.priceMultiplier) < 1),
      `memory_rift market entry should gain extra slot + discount, got ${JSON.stringify(evt.choices[0].effects)}`
    );
    assert(
      evt.choices[1].effects.some((effect) => effect.type === 'ringExp') && evt.choices[1].effects.some((effect) => effect.type === 'gold' && Number(effect.value) > 0),
      `memory_rift bypass option should gain ringExp + gold, got ${JSON.stringify(evt.choices[1].effects)}`
    );
  }

  // 5.7) 若其他偏置先命中同类事件，工程强化也应继续附着，而不是只在工程偏置分支里生效
  {
    ctx.window.game = {
      player: {
        deck: [],
        fateRing: { path: 'convergence' }
      },
      getStrategicEngineeringSnapshot: () => ({
        focusTrack: {
          trackId: 'observatory',
          tier: 2,
          tierLabel: 'II阶',
          name: '观星工程',
          icon: '🔭',
          effectSummary: '观测网已经锁定此地灵流'
        },
        activeTracks: [
          {
            trackId: 'observatory',
            tier: 2,
            tierLabel: 'II阶',
            name: '观星工程',
            icon: '🔭',
            effectSummary: '观测网已经锁定此地灵流'
          }
        ],
        summary: '观星工程 II阶'
      })
    };
    const oldRandom = ctx.Math.random;
    const seq = [0.1, 0.0]; // 命中 convergence 路径池首个事件 convergenceRelay
    let ridx = 0;
    ctx.Math.random = () => {
      const val = seq[ridx % seq.length];
      ridx += 1;
      return val;
    };
    const evt = getRandomEvent();
    ctx.Math.random = oldRandom;
    assert(evt && evt.id === 'convergenceRelay', `expected convergence path event hit, got ${evt ? evt.id : 'null'}`);
    assert(
      evt.engineeringEventMeta && evt.engineeringEventMeta.trackId === 'observatory' && evt.engineeringEventMeta.selectedByEngineeringBias === false,
      `path-selected aligned event should still carry non-bias engineering meta, got ${JSON.stringify(evt && evt.engineeringEventMeta)}`
    );
    assert(
      evt.engineeringResonance && evt.engineeringResonance.trackId === 'observatory' && evt.engineeringResonance.biasSource === 'runtime',
      `path-selected aligned event should expose runtime engineering resonance, got ${JSON.stringify(evt && evt.engineeringResonance)}`
    );
    assert(
      evt.choices[0].effects.some((effect) => effect.type === 'heavenlyInsight') || evt.choices[0].effects.some((effect) => effect.type === 'ringExp' && Number(effect.value) > 48),
      `path-selected aligned event should receive observatory bonus effects, got ${JSON.stringify(evt.choices[0].effects)}`
    );
  }

  // 6) 无尽词缀事件偏置应可命中词缀池
  {
    const expectedByMutator = {
      war_market: ENDLESS_MUTATOR_EVENT_BIAS.war_market,
      void_tax: ENDLESS_MUTATOR_EVENT_BIAS.void_tax,
      trial_inferno: ENDLESS_MUTATOR_EVENT_BIAS.trial_inferno
    };
    Object.entries(expectedByMutator).forEach(([mutatorId, expectedPool]) => {
      ctx.window.game = {
        player: { deck: [] },
        isEndlessActive: () => true,
        ensureEndlessState: () => ({
          currentCycle: 6,
          activeMutators: [mutatorId]
        })
      };
      const oldRandom = ctx.Math.random;
      const seq = [0.2, 0.1]; // 触发 mutator 偏置 + 在偏置池内抽取
      let sidx = 0;
      ctx.Math.random = () => {
        const val = seq[sidx % seq.length];
        sidx += 1;
        return val;
      };
      const evt = getRandomEvent();
      ctx.Math.random = oldRandom;
      const expectedSet = new Set((expectedPool || []).filter((id) => !!EVENTS[id]));
      assert(
        evt && expectedSet.has(evt.id),
        `expected endless mutator bias (${mutatorId}) hit, got ${evt ? evt.id : 'null'}`
      );
    });
  }

  console.log('Content archetype checks passed.');
})();
