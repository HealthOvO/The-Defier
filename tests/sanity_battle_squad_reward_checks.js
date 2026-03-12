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

function createHarness(gameOverrides = {}) {
  const root = path.resolve(__dirname, '..');
  const ctx = vm.createContext({
    console,
    window: {},
    Math,
    JSON,
    Date,
    document: {
      querySelector: () => null,
      getElementById: () => null,
      querySelectorAll: () => []
    },
    Utils: {
      showBattleLog: () => {},
      sleep: () => Promise.resolve(),
      addShakeEffect: () => {},
      showFloatingNumber: () => {},
      createFloatingText: () => {}
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;
  loadFile(ctx, path.join(root, 'js/core/battle.js'));
  const Battle = vm.runInContext('Battle', ctx);
  assert(typeof Battle === 'function', 'Battle class should be defined');

  const game = {
    player: {
      realm: 12,
      buffs: {},
      activeResonances: [],
      collectedLaws: []
    },
    currentBattleNode: {
      type: 'enemy',
      id: 'reward_probe_node',
      row: 1,
      col: 1
    },
    isEndlessActive: () => false,
    getEndlessCycleThemeProfile: () => ({
      id: 'theme_balanced_band',
      name: '轮段·稳衡',
      enemyDirective: 'balanced'
    }),
    ...gameOverrides
  };

  return {
    battle: new Battle(game),
    game
  };
}

(function run() {
  // 1) 基础编队奖励（普通节点）
  {
    const { battle } = createHarness();
    battle.activeSquadEcology = {
      id: 'squad_bulwark_web',
      name: '壁垒联阵',
      tag: '壁垒',
      desc: '测试编队',
      count: 3
    };
    const summary = battle.consumeSquadEcologyVictoryBonusSummary();
    assert(!!summary, 'squad reward summary should exist');
    assert(summary.squadId === 'squad_bulwark_web', `unexpected squad id: ${summary.squadId}`);
    assert(summary.goldBonus === 12, `expected normal-node gold bonus 12, got ${summary.goldBonus}`);
    assert(summary.ringExpBonus === 9, `expected normal-node exp bonus 9, got ${summary.ringExpBonus}`);
    assert(Array.isArray(summary.adventureBuffRewards) && summary.adventureBuffRewards.length >= 1, 'expected adventure buff rewards');
    assert(!summary.synergy, 'base summary should not include synergy');
  }

  // 2) 一次性消费语义
  {
    const { battle } = createHarness();
    battle.activeSquadEcology = {
      id: 'squad_relay_cascade',
      name: '潮汐接力',
      tag: '接力',
      desc: '测试编队',
      count: 2
    };
    const first = battle.consumeSquadEcologyVictoryBonusSummary();
    const second = battle.consumeSquadEcologyVictoryBonusSummary();
    assert(!!first, 'first squad summary should exist');
    assert(second === null, 'squad summary should be consumable only once');
  }

  // 3) 无尽轮段协同加成（精英节点 + 指令匹配）
  {
    const { battle, game } = createHarness({
      currentBattleNode: {
        type: 'elite',
        id: 'reward_probe_elite',
        row: 2,
        col: 0
      },
      isEndlessActive: () => true,
      getEndlessCycleThemeProfile: () => ({
        id: 'theme_flux_forge',
        name: '轮段·压能锻潮',
        enemyDirective: 'forge'
      })
    });

    battle.activeSquadEcology = {
      id: 'squad_pincer_hunt',
      name: '钳袭编队',
      tag: '钳袭',
      desc: '测试编队',
      count: 4
    };

    const summary = battle.consumeSquadEcologyVictoryBonusSummary();
    assert(!!summary, 'synergy summary should exist');
    assert(summary.nodeType === 'elite', `expected elite node, got ${summary.nodeType}`);
    assert(!!summary.synergy, 'expected endless synergy metadata');
    assert(summary.synergy.themeName === '轮段·压能锻潮', `unexpected synergy theme name: ${summary.synergy.themeName}`);
    assert(summary.goldBonus === 25, `expected synergy gold bonus 25, got ${summary.goldBonus}`);
    assert(summary.ringExpBonus === 13, `expected synergy exp bonus 13, got ${summary.ringExpBonus}`);
    assert(
      Array.isArray(summary.adventureBuffRewards) &&
      Number(summary.adventureBuffRewards[0]?.charges || 0) === 2,
      'synergy should increase primary adventure buff charges'
    );
    assert(game.isEndlessActive(), 'endless flag should stay active in harness');
  }

  console.log('Battle squad reward checks passed.');
})();
