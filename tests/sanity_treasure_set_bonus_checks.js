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
  loadFile(ctx, path.join(root, 'js/data/treasures.js'));
  loadFile(ctx, path.join(root, 'js/core/player.js'));

  const Player = vm.runInContext('Player', ctx);
  const CARDS = vm.runInContext('CARDS', ctx);

  // 1) 玄甲套：2件提升护盾，3件回合开始提供留盾+反击
  {
    const player = new Player();
    player.realm = 12;
    player.maxRealmReached = 12;
    player.addTreasure('vitality_stone');
    player.addTreasure('iron_talisman');

    const boosted = player.triggerTreasureValueEffect('onGainBlock', 10);
    assert(boosted >= 12, `xuanjia 2-piece should boost gain block, got ${boosted}`);

    player.addTreasure('tortoise_shell');
    player.triggerTreasureEffect('onTurnStart');
    assert((player.buffs.retainBlock || 0) >= 1, 'xuanjia 3-piece should grant retainBlock');
    assert((player.buffs.thorns || 0) >= 1, 'xuanjia 3-piece should grant thorns');
  }

  // 2) 裂脉套：2件将流血转化伤害，3件提升斩杀阈值伤害
  {
    const player = new Player();
    player.realm = 12;
    player.maxRealmReached = 12;
    player.addTreasure('soul_banner');
    player.addTreasure('hunter_contract');
    const target2 = { maxHp: 100, hp: 100, buffs: { bleed: 4 } };
    const dmg2 = player.triggerTreasureValueEffect('onBeforeDealDamage', 10, { target: target2 });
    assert(dmg2 >= 12, `liemai 2-piece should convert bleed to bonus damage, got ${dmg2}`);

    player.addTreasure('fate_lotus_seal');
    const target3 = { maxHp: 100, hp: 100, buffs: { bleed: 6 } };
    const dmg3 = player.triggerTreasureValueEffect('onBeforeDealDamage', 10, { target: target3 });
    assert(dmg3 >= 18, `liemai 3-piece should further increase bleed conversion damage, got ${dmg3}`);
  }

  // 3) 星衡套：2件回合节奏收益，3件开场额外抽牌并获得平衡增伤
  {
    const player = new Player();
    player.realm = 12;
    player.maxRealmReached = 12;
    player.baseEnergy = 3;
    player.currentEnergy = 1;
    player.hand = [];
    player.drawPile = [
      { ...CARDS.strike, instanceId: 'xh_draw_1' },
      { ...CARDS.defend, instanceId: 'xh_draw_2' }
    ];
    player.addTreasure('ring_echo_compass');
    player.addTreasure('moonblade_sheath');

    player.triggerTreasureEffect('onTurnStart');
    assert(player.currentEnergy >= 2, `xingheng 2-piece should recover energy when low, got ${player.currentEnergy}`);

    player.addTreasure('ringweaver_anvil');
    const beforeHand = player.hand.length;
    player.triggerTreasureEffect('onBattleStart');
    assert(player.hand.length >= beforeHand + 1, 'xingheng 3-piece should draw on battle start');

    player.currentEnergy = player.baseEnergy;
    const dmg = player.triggerTreasureValueEffect('onBeforeDealDamage', 10, { target: { buffs: {} } });
    assert(dmg >= 12, `xingheng 3-piece should add balance damage bonus, got ${dmg}`);
  }

  console.log('Treasure set bonus checks passed.');
})();
