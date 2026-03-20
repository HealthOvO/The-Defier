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
    Math,
    JSON,
    Date,
    window: {},
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    Utils: {
      showBattleLog: () => {}
    },
    canUpgradeCard: (card) => !!card && !card.upgraded,
    inferDeckArchetype: (deck = []) => {
      if (!Array.isArray(deck) || deck.length === 0) return null;
      const first = deck[0];
      return first && typeof first.archetypeHint === 'string' ? first.archetypeHint : null;
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/core/map.js'));
  const GameMap = vm.runInContext('GameMap', ctx);

  function createMapForPlayer(playerOverrides = {}, gameOverrides = {}) {
    const player = Object.assign({
      realm: 1,
      gold: 120,
      maxRealmReached: 1,
      deck: [{ upgraded: false }, { upgraded: false }, { upgraded: false }]
    }, playerOverrides);

    const game = Object.assign({
      player,
      startBattle: () => {},
      showEventModal: () => {},
      showShop: () => {},
      showCampfire: () => {}
    }, gameOverrides);
    return new GameMap(game);
  }

  const totalRows = 8;
  const realm = 3;

  // 1) 权重归一化与键完整性
  const mapBase = createMapForPlayer();
  const early = mapBase.getDynamicNodeWeights(1, totalRows, realm);
  const late = mapBase.getDynamicNodeWeights(6, totalRows, realm);

  const keys = ['enemy', 'elite', 'event', 'shop', 'trial', 'forge', 'rest', 'observatory', 'spirit_grotto', 'forbidden_altar', 'memory_rift'];
  keys.forEach((k) => {
    assert(typeof early[k] === 'number', `missing early weight: ${k}`);
    assert(typeof late[k] === 'number', `missing late weight: ${k}`);
    assert(early[k] >= 0 && late[k] >= 0, `weights must be non-negative: ${k}`);
  });

  const earlySum = keys.reduce((s, k) => s + early[k], 0);
  const lateSum = keys.reduce((s, k) => s + late[k], 0);
  assert(Math.abs(earlySum - 1) < 1e-6, `early weights should sum to 1, got ${earlySum}`);
  assert(Math.abs(lateSum - 1) < 1e-6, `late weights should sum to 1, got ${lateSum}`);

  // 2) 中后段试炼/锻炉权重应提升
  assert(late.trial > early.trial, `late trial weight should increase (${early.trial} -> ${late.trial})`);
  assert(late.forge > early.forge, `late forge weight should increase (${early.forge} -> ${late.forge})`);

  // 3) 低金币时锻炉概率应下降
  const mapHighGold = createMapForPlayer({ gold: 500 });
  const mapLowGold = createMapForPlayer({ gold: 10 });
  const highGoldW = mapHighGold.getDynamicNodeWeights(4, totalRows, realm);
  const lowGoldW = mapLowGold.getDynamicNodeWeights(4, totalRows, realm);
  assert(lowGoldW.forge < highGoldW.forge, `low-gold forge should be lower (${highGoldW.forge} -> ${lowGoldW.forge})`);

  // 4) 可升级牌多时锻炉概率应上升
  const mapFewUpgradable = createMapForPlayer({
    deck: [{ upgraded: true }, { upgraded: true }, { upgraded: true }]
  });
  const mapManyUpgradable = createMapForPlayer({
    deck: [
      { upgraded: false }, { upgraded: false }, { upgraded: false },
      { upgraded: false }, { upgraded: false }, { upgraded: false }
    ]
  });
  const fewW = mapFewUpgradable.getDynamicNodeWeights(4, totalRows, realm);
  const manyW = mapManyUpgradable.getDynamicNodeWeights(4, totalRows, realm);
  assert(manyW.forge > fewW.forge, `forge should increase with upgradable cards (${fewW.forge} -> ${manyW.forge})`);

  // 5) 采样模拟：后段 trial+forge 实际命中率应显著高于前段
  function sampleRate(weights, iterations = 8000) {
    const map = createMapForPlayer();
    let hit = 0;
    for (let i = 0; i < iterations; i += 1) {
      const node = map.rollNodeByWeights(weights);
      if (node === 'trial' || node === 'forge') hit += 1;
    }
    return hit / iterations;
  }
  const earlyRate = sampleRate(early);
  const lateRate = sampleRate(late);
  assert(lateRate > earlyRate + 0.02, `late trial+forge rate should be higher (${earlyRate} -> ${lateRate})`);

  // 6) 流派成型时，地图事件节点权重应提高（双层偏置中的节点层）
  const mapNoArchetype = createMapForPlayer({
    deck: [{ upgraded: false }, { upgraded: false }, { upgraded: false }]
  });
  const mapEntropyArchetype = createMapForPlayer({
    deck: [{ upgraded: false, archetypeHint: 'entropy' }, { upgraded: false }, { upgraded: false }]
  });
  const noArchetypeW = mapNoArchetype.getDynamicNodeWeights(4, totalRows, realm);
  const entropyW = mapEntropyArchetype.getDynamicNodeWeights(4, totalRows, realm);
  assert(entropyW.event > noArchetypeW.event, `archetype map bias should raise event weight (${noArchetypeW.event} -> ${entropyW.event})`);

  // 7) 采样模拟：流派成型后，事件节点命中率应可观提升
  function sampleEventRate(weights, iterations = 8000) {
    const map = createMapForPlayer();
    let hit = 0;
    for (let i = 0; i < iterations; i += 1) {
      const node = map.rollNodeByWeights(weights);
      if (node === 'event') hit += 1;
    }
    return hit / iterations;
  }
  const eventRateBase = sampleEventRate(noArchetypeW);
  const eventRateEntropy = sampleEventRate(entropyW);
  assert(eventRateEntropy > eventRateBase + 0.01, `archetype event rate should increase (${eventRateBase} -> ${eventRateEntropy})`);

  // 8) 工程推进偏置应真实进入节点权重层
  const mapEngineeringNeutral = createMapForPlayer();
  const mapEngineeringBiased = createMapForPlayer({}, {
    getStrategicEngineeringWeightShift: () => ({
      observatory: 0.05,
      event: 0.035,
      enemy: -0.04
    })
  });
  const engineeringNeutralW = mapEngineeringNeutral.getDynamicNodeWeights(4, totalRows, realm);
  const engineeringBiasedW = mapEngineeringBiased.getDynamicNodeWeights(4, totalRows, realm);
  assert(
    engineeringBiasedW.observatory > engineeringNeutralW.observatory,
    `engineering shift should raise observatory weight (${engineeringNeutralW.observatory} -> ${engineeringBiasedW.observatory})`
  );
  assert(
    engineeringBiasedW.event > engineeringNeutralW.event,
    `engineering shift should raise event weight (${engineeringNeutralW.event} -> ${engineeringBiasedW.event})`
  );
  assert(
    engineeringBiasedW.enemy < engineeringNeutralW.enemy,
    `engineering shift should lower enemy weight when the shift says so (${engineeringNeutralW.enemy} -> ${engineeringBiasedW.enemy})`
  );

  // 9) 命环路径应在节点层面形成差异化路线
  const mapConvergencePath = createMapForPlayer({
    fateRing: { path: 'convergence' }
  });
  const mapResonancePath = createMapForPlayer({
    fateRing: { path: 'resonance' }
  });
  const mapNeutralPath = createMapForPlayer({
    fateRing: { path: 'crippled' }
  });
  const neutralPathW = mapNeutralPath.getDynamicNodeWeights(4, totalRows, realm);
  const convergencePathW = mapConvergencePath.getDynamicNodeWeights(4, totalRows, realm);
  const resonancePathW = mapResonancePath.getDynamicNodeWeights(4, totalRows, realm);
  assert(
    convergencePathW.event > neutralPathW.event,
    `convergence path should raise event weight (${neutralPathW.event} -> ${convergencePathW.event})`
  );
  assert(
    resonancePathW.rest > neutralPathW.rest && resonancePathW.trial > neutralPathW.trial,
    `resonance path should raise rest/trial (${neutralPathW.rest}, ${neutralPathW.trial}) -> (${resonancePathW.rest}, ${resonancePathW.trial})`
  );

  // 10) 相邻层同质化压力：连续战斗倾向后应降低敌人权重并抬升功能节点
  const mapDiversity = createMapForPlayer();
  const baselineW = mapDiversity.getDynamicNodeWeights(4, totalRows, realm);
  const pressuredW = mapDiversity.getDynamicNodeWeights(4, totalRows, realm, {
    previousRowNodes: [{ type: 'enemy' }, { type: 'enemy' }, { type: 'elite' }],
    previousTwoRowNodes: [{ type: 'enemy' }, { type: 'enemy' }],
    currentRowNodes: []
  });
  assert(
    pressuredW.enemy < baselineW.enemy,
    `diversity pressure should lower enemy weight (${baselineW.enemy} -> ${pressuredW.enemy})`
  );
  assert(
    pressuredW.event > baselineW.event && pressuredW.trial > baselineW.trial,
    `diversity pressure should raise event/trial (${baselineW.event}, ${baselineW.trial}) -> (${pressuredW.event}, ${pressuredW.trial})`
  );

  // 11) 同一行已出现节点类型后，下一个节点应倾向不同类型
  const inRowBaselineW = mapDiversity.getDynamicNodeWeights(4, totalRows, realm, {
    previousRowNodes: [],
    previousTwoRowNodes: [],
    currentRowNodes: []
  });
  const inRowPressuredW = mapDiversity.getDynamicNodeWeights(4, totalRows, realm, {
    previousRowNodes: [],
    previousTwoRowNodes: [],
    currentRowNodes: [{ type: 'enemy' }]
  });
  assert(
    inRowPressuredW.enemy < inRowBaselineW.enemy,
    `in-row pressure should lower repeated enemy pick weight (${inRowBaselineW.enemy} -> ${inRowPressuredW.enemy})`
  );
  assert(
    inRowPressuredW.shop > inRowBaselineW.shop || inRowPressuredW.event > inRowBaselineW.event,
    `in-row pressure should increase non-combat options (shop ${inRowBaselineW.shop} -> ${inRowPressuredW.shop}, event ${inRowBaselineW.event} -> ${inRowPressuredW.event})`
  );

  // 12) 长程记忆去重：最近多层长期偏向同类型时，后续应抑制该类型
  mapDiversity.nodes = [
    [{ type: 'enemy' }, { type: 'elite' }, { type: 'enemy' }],
    [{ type: 'enemy' }, { type: 'enemy' }],
    [{ type: 'elite' }, { type: 'enemy' }],
    [{ type: 'enemy' }, { type: 'event' }]
  ];
  const longMemoryNeutralW = mapDiversity.getDynamicNodeWeights(4, totalRows, realm, {
    previousRowNodes: [],
    previousTwoRowNodes: [],
    currentRowNodes: []
  });
  const longMemoryPressuredW = mapDiversity.getDynamicNodeWeights(5, totalRows, realm, {
    previousRowNodes: [{ type: 'enemy' }, { type: 'enemy' }],
    previousTwoRowNodes: [{ type: 'enemy' }, { type: 'elite' }],
    currentRowNodes: []
  });
  assert(
    longMemoryPressuredW.enemy < longMemoryNeutralW.enemy,
    `long-term pressure should reduce dominant enemy weight (${longMemoryNeutralW.enemy} -> ${longMemoryPressuredW.enemy})`
  );
  assert(
    longMemoryPressuredW.trial > longMemoryNeutralW.trial || longMemoryPressuredW.event > longMemoryNeutralW.event,
    `long-term pressure should push utility nodes (trial ${longMemoryNeutralW.trial} -> ${longMemoryPressuredW.trial}, event ${longMemoryNeutralW.event} -> ${longMemoryPressuredW.event})`
  );

  // 12) 稀有节点保底：连续多层未出现事件/商店时应抬升对应权重
  const pityBaseW = mapDiversity.getDynamicNodeWeights(5, totalRows, realm, {
    historyRows: [
      [{ type: 'enemy' }, { type: 'event' }],
      [{ type: 'elite' }, { type: 'shop' }],
      [{ type: 'trial' }, { type: 'enemy' }],
      [{ type: 'forge' }, { type: 'rest' }]
    ],
    currentRowNodes: []
  });
  const pityBoostW = mapDiversity.getDynamicNodeWeights(5, totalRows, realm, {
    historyRows: [
      [{ type: 'enemy' }, { type: 'elite' }],
      [{ type: 'enemy' }, { type: 'trial' }],
      [{ type: 'elite' }, { type: 'forge' }],
      [{ type: 'enemy' }, { type: 'trial' }]
    ],
    currentRowNodes: []
  });
  assert(
    pityBoostW.event > pityBaseW.event,
    `event pity should boost event weight (${pityBaseW.event} -> ${pityBoostW.event})`
  );
  assert(
    pityBoostW.shop > pityBaseW.shop,
    `shop pity should boost shop weight (${pityBaseW.shop} -> ${pityBoostW.shop})`
  );
  assert(
    pityBoostW.observatory > pityBaseW.observatory
      || pityBoostW.spirit_grotto > pityBaseW.spirit_grotto
      || pityBoostW.memory_rift > pityBaseW.memory_rift,
    `strategic pity should boost observatory, spirit grotto, or memory rift (${pityBaseW.observatory}, ${pityBaseW.spirit_grotto}, ${pityBaseW.memory_rift}) -> (${pityBoostW.observatory}, ${pityBoostW.spirit_grotto}, ${pityBoostW.memory_rift})`
  );

  console.log('Map weight sanity checks passed.');
})();
