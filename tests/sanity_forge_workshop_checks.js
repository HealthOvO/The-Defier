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
    document: {
      querySelector: () => null,
      getElementById: () => null,
      querySelectorAll: () => []
    },
    CHARACTERS: {
      linFeng: {
        stats: { maxHp: 90, gold: 100, energy: 3 },
        relic: null,
        deck: []
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
  loadFile(ctx, path.join(root, 'js/data/spirit_companions.js'));
  loadFile(ctx, path.join(root, 'js/data/treasures.js'));
  loadFile(ctx, path.join(root, 'js/core/player.js'));

  const Player = vm.runInContext('Player', ctx);

  // 1) 法宝重铸：玄甲法宝应改成护势重铸，并在开场提供额外护盾
  {
    const player = new Player();
    player.realm = 8;
    player.maxRealmReached = 8;
    player.addTreasure('iron_talisman');

    const reforge = player.applyTreasureReforge('iron_talisman');
    assert(reforge && reforge.mode === 'bulwark', `expected bulwark reforge, got ${reforge && reforge.mode}`);

    const beforeBlock = player.block;
    player.triggerTreasureEffect('onBattleStart');
    assert(player.block >= beforeBlock + 4, `bulwark reforge should add opening block, got ${player.block - beforeBlock}`);
  }

  // 2) 法宝重铸：裂脉法宝应改成裂脉重铸，对带减益敌人造成额外伤害
  {
    const player = new Player();
    player.realm = 8;
    player.maxRealmReached = 8;
    player.addTreasure('soul_banner');

    const reforge = player.applyTreasureReforge('soul_banner');
    assert(reforge && reforge.mode === 'rend', `expected rend reforge, got ${reforge && reforge.mode}`);

    const plain = player.triggerTreasureValueEffect('onBeforeDealDamage', 10, { target: { buffs: {} } });
    const debuffed = player.triggerTreasureValueEffect('onBeforeDealDamage', 10, { target: { buffs: { weak: 1 } } });
    assert(plain === 10, `plain damage should stay 10 without debuff, got ${plain}`);
    assert(debuffed >= 13, `rend reforge should add +3 against debuffed target, got ${debuffed}`);
  }

  // 3) 器灵灌注：匹配当前灵契时，开场应获得额外灵契蓄能
  {
    const player = new Player();
    player.realm = 8;
    player.maxRealmReached = 8;
    player.addTreasure('iron_talisman');
    player.setSpiritCompanion('frostChi', 1);
    player.resetSpiritCompanionBattleState();

    const infused = player.applyTreasureSpiritInfusion('iron_talisman', 'frostChi');
    assert(infused && infused.spiritId === 'frostChi', 'spirit infusion should bind frostChi');

    const beforeCharge = player.ensureSpiritCompanionBattleState().charge;
    player.triggerTreasureEffect('onBattleStart');
    const afterCharge = player.ensureSpiritCompanionBattleState().charge;
    assert(afterCharge >= beforeCharge + 1, `matching infusion should grant opening spirit charge, got ${beforeCharge} -> ${afterCharge}`);
  }

  // 4) 套装修正：两件玄甲经修正后应视作三件并触发三件套收益
  {
    const player = new Player();
    player.realm = 12;
    player.maxRealmReached = 12;
    player.addTreasure('vitality_stone');
    player.addTreasure('iron_talisman');

    const calibrated = player.applyTreasureSetCalibration('vitality_stone');
    assert(calibrated && calibrated.setTag === 'xuanjia', 'set calibration should bind xuanjia treasure');
    assert(player.getTreasureSetPieces('xuanjia') >= 3, `calibration should make xuanjia count as 3, got ${player.getTreasureSetPieces('xuanjia')}`);

    player.triggerTreasureEffect('onTurnStart');
    assert((player.buffs.retainBlock || 0) >= 1, 'calibrated xuanjia should grant retainBlock as 3-piece');
    assert((player.buffs.thorns || 0) >= 1, 'calibrated xuanjia should grant thorns as 3-piece');
  }

  // 5) 工坊快照：应输出当前已激活的重铸 / 灌注 / 修正状态
  {
    const player = new Player();
    player.realm = 12;
    player.maxRealmReached = 12;
    player.addTreasure('astral_forge_core');
    player.setSpiritCompanion('starFox', 1);
    player.applyTreasureReforge('astral_forge_core');
    player.applyTreasureSpiritInfusion('astral_forge_core', 'starFox');
    player.applyTreasureSetCalibration('astral_forge_core');

    const snapshot = player.getTreasureWorkshopSnapshot('equipped');
    assert(Array.isArray(snapshot) && snapshot.length === 1, `expected single workshop snapshot, got ${snapshot && snapshot.length}`);
    assert(snapshot[0].reforge && snapshot[0].reforge.mode === 'tempo', `expected tempo reforge in snapshot, got ${JSON.stringify(snapshot[0].reforge)}`);
    assert(snapshot[0].spiritBond === 'starFox', `expected spirit bond starFox, got ${snapshot[0].spiritBond}`);
    assert(snapshot[0].setEcho === true, 'expected setEcho flag in snapshot');
    assert(snapshot[0].researchLabel === '核心件', `expected astral_forge_core to be a core treasure, got ${snapshot[0].researchLabel}`);
    assert(snapshot[0].infusionEligible === true, 'astral_forge_core should be eligible for spirit infusion');
  }

  // 6) 器灵灌注限制：只有核心件可灌注，过渡件不应进入器灵位
  {
    const player = new Player();
    player.realm = 8;
    player.maxRealmReached = 8;
    player.addTreasure('vitality_stone');
    player.setSpiritCompanion('frostChi', 1);
    player.resetSpiritCompanionBattleState();

    const infused = player.applyTreasureSpiritInfusion('vitality_stone', 'frostChi');
    assert(infused === null, 'non-core treasure should not accept spirit infusion');
    assert(player.isTreasureSpiritInfusionEligible('iron_talisman') === true, 'iron_talisman should be marked as an infusion core');
    assert(player.isTreasureSpiritInfusionEligible('vitality_stone') === false, 'vitality_stone should stay outside the infusion whitelist');
  }

  // 7) 五行重铸：五行套法宝应进入 harmony 模式，并在回合开始净化 1 层减益
  {
    const player = new Player();
    player.realm = 10;
    player.maxRealmReached = 10;
    player.addTreasure('waterCrystal');

    const reforge = player.applyTreasureReforge('waterCrystal');
    assert(reforge && reforge.mode === 'harmony', `expected harmony reforge, got ${reforge && reforge.mode}`);

    player.buffs.weak = 1;
    player.triggerTreasureEffect('onTurnStart');
    assert(!player.buffs.weak, 'harmony reforge should cleanse one debuff on turn start');
  }

  // 8) 五行三件套：无减益时应转成护盾与灵力，形成调序型收益
  {
    const player = new Player();
    player.realm = 10;
    player.maxRealmReached = 10;
    player.addTreasure('metalEssence');
    player.addTreasure('waterCrystal');
    player.addTreasure('thickEarthShield');

    assert(player.getTreasureSetPieces('wuxing') >= 3, `expected wuxing set to reach 3 pieces, got ${player.getTreasureSetPieces('wuxing')}`);

    const beforeBlock = player.block;
    const beforeEnergy = player.currentEnergy;
    player.triggerTreasureEffect('onTurnStart');
    assert(player.block >= beforeBlock + 3, `wuxing 2-piece should add 3 block without debuffs, got ${player.block - beforeBlock}`);
    assert(player.currentEnergy >= beforeEnergy + 1, `wuxing 3-piece should add 1 energy without debuffs, got ${beforeEnergy} -> ${player.currentEnergy}`);
  }

  // 9) 炼器研究总览：应统计核心件、形态件与套装共鸣进度
  {
    const player = new Player();
    player.realm = 12;
    player.maxRealmReached = 12;
    player.addTreasure('iron_talisman');
    player.addTreasure('vitality_stone');
    player.addTreasure('waterCrystal');
    player.applyTreasureReforge('waterCrystal');

    const overview = player.getTreasureWorkshopResearchOverview();
    assert(overview.coreTotal >= 6, `research overview should expose multiple core treasures, got ${overview.coreTotal}`);
    assert(overview.formTotal >= 8, `research overview should expose multiple form treasures, got ${overview.formTotal}`);
    assert(overview.activeReforges >= 1, `research overview should count active reforges, got ${overview.activeReforges}`);
    assert(overview.setProgress.some((entry) => entry.id === 'wuxing' && entry.total >= 5), 'wuxing should now appear as a tracked treasure set');
  }

  console.log('Forge workshop checks passed.');
})();
