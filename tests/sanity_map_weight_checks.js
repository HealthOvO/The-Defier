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
    canUpgradeCard: (card) => !!card && !card.upgraded
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/core/map.js'));
  const GameMap = vm.runInContext('GameMap', ctx);

  function createMapForPlayer(playerOverrides = {}) {
    const player = Object.assign({
      realm: 1,
      gold: 120,
      maxRealmReached: 1,
      deck: [{ upgraded: false }, { upgraded: false }, { upgraded: false }]
    }, playerOverrides);

    const game = {
      player,
      startBattle: () => {},
      showEventModal: () => {},
      showShop: () => {},
      showCampfire: () => {}
    };
    return new GameMap(game);
  }

  const totalRows = 8;
  const realm = 3;

  // 1) 权重归一化与键完整性
  const mapBase = createMapForPlayer();
  const early = mapBase.getDynamicNodeWeights(1, totalRows, realm);
  const late = mapBase.getDynamicNodeWeights(6, totalRows, realm);

  const keys = ['enemy', 'elite', 'event', 'shop', 'trial', 'forge', 'rest'];
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

  console.log('Map weight sanity checks passed.');
})();
