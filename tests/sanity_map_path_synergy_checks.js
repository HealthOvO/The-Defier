const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const code = fs.readFileSync(path.join(root, 'js/core/map.js'), 'utf8');

  const logs = [];
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
      showBattleLog: (msg) => logs.push(String(msg || ''))
    },
    ResizeObserver: function ResizeObserver() {
      this.observe = () => {};
      this.disconnect = () => {};
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  vm.runInContext(code, ctx, { filename: 'map.js' });
  const GameMap = vm.runInContext('GameMap', ctx);

  function createHarness(pathId, nodeType, overrides = {}) {
    const buffs = {
      firstTurnDrawBoostBattles: 0,
      openingBlockBoostBattles: 0,
      victoryGoldBoostBattles: 0,
      firstTurnEnergyBoostBattles: 0,
      ringExpBoostBattles: 0,
      victoryHealBoostBattles: 0
    };

    const player = Object.assign({
      realm: 3,
      gold: 100,
      currentHp: 60,
      maxHp: 100,
      realmMaps: {},
      adventureBuffs: buffs,
      fateRing: { path: pathId, exp: 0 },
      grantAdventureBuff(buffId, stacks = 1) {
        if (!Object.prototype.hasOwnProperty.call(this.adventureBuffs, buffId)) return false;
        this.adventureBuffs[buffId] += Math.max(0, Math.floor(Number(stacks) || 0));
        return true;
      },
      checkFateRingLevelUpCalls: 0,
      checkFateRingLevelUp() {
        this.checkFateRingLevelUpCalls += 1;
      }
    }, overrides);

    const game = {
      player,
      realmCompleteCalls: 0,
      onRealmComplete() {
        this.realmCompleteCalls += 1;
      },
      getMapCacheKey: () => `realm:${player.realm}`
    };

    const map = new GameMap(game);
    map.render = () => {};

    const node = {
      id: 1,
      row: 0,
      type: nodeType,
      completed: false,
      accessible: true
    };
    const nextNode = {
      id: 2,
      row: 1,
      type: 'enemy',
      completed: false,
      accessible: false
    };

    map.nodes = [[node], [nextNode]];
    map.completedNodes = [];
    return { map, game, player, node, nextNode };
  }

  // 1) convergence 命中事件应给命环经验 + 首回合灵力增益
  logs.length = 0;
  const caseA = createHarness('convergence', 'event');
  caseA.map.completeNode(caseA.node);
  assert(caseA.player.fateRing.exp >= 12, `convergence event should grant ring exp, got ${caseA.player.fateRing.exp}`);
  assert(
    caseA.player.adventureBuffs.firstTurnEnergyBoostBattles >= 1,
    `convergence event should grant firstTurnEnergy buff, got ${caseA.player.adventureBuffs.firstTurnEnergyBoostBattles}`
  );
  assert(caseA.nextNode.accessible === true, 'next row should become accessible after completion');

  const expAfterFirstComplete = caseA.player.fateRing.exp;
  caseA.map.completeNode(caseA.node);
  assert(caseA.player.fateRing.exp === expAfterFirstComplete, 'duplicate complete should not re-apply path reward');

  // 1.1) convergence 连击档位：第2次与第4次命中应触发额外奖励并在4层后重置计数
  const caseACombo = createHarness('convergence', 'event');
  caseACombo.map.applyPathNodeSynergyReward({ type: 'event' });
  caseACombo.map.applyPathNodeSynergyReward({ type: 'event' });
  assert(caseACombo.player.fateRing.exp >= 34, `convergence combo stage-1 should add extra ring exp, got ${caseACombo.player.fateRing.exp}`);
  assert(
    caseACombo.player.adventureBuffs.firstTurnDrawBoostBattles >= 1,
    `convergence combo stage-1 should grant draw buff, got ${caseACombo.player.adventureBuffs.firstTurnDrawBoostBattles}`
  );
  caseACombo.map.applyPathNodeSynergyReward({ type: 'event' });
  caseACombo.map.applyPathNodeSynergyReward({ type: 'event' });
  assert(caseACombo.player.fateRing.exp >= 74, `convergence combo stage-2 should further add ring exp, got ${caseACombo.player.fateRing.exp}`);
  assert(
    caseACombo.player.adventureBuffs.firstTurnEnergyBoostBattles >= 5,
    `convergence combo stage-2 should grant additional energy buff, got ${caseACombo.player.adventureBuffs.firstTurnEnergyBoostBattles}`
  );
  assert(
    (caseACombo.player.pathSynergyState?.streak || 0) === 0,
    `combo streak should reset after stage-2 trigger, got ${caseACombo.player.pathSynergyState?.streak}`
  );

  // 2) resonance 命中营地应回血 + 开场护盾增益
  logs.length = 0;
  const caseB = createHarness('resonance', 'rest', { currentHp: 42, maxHp: 90 });
  caseB.map.completeNode(caseB.node);
  assert(caseB.player.currentHp > 42, `resonance rest should heal player, got ${caseB.player.currentHp}`);
  assert(
    caseB.player.adventureBuffs.openingBlockBoostBattles >= 1,
    `resonance rest should grant opening block buff, got ${caseB.player.adventureBuffs.openingBlockBoostBattles}`
  );

  // 3) destruction 命中精英应给胜利灵石增益 + 额外灵石
  logs.length = 0;
  const caseC = createHarness('destruction', 'elite', { gold: 50 });
  caseC.map.completeNode(caseC.node);
  assert(
    caseC.player.adventureBuffs.victoryGoldBoostBattles >= 1,
    `destruction elite should grant victory gold buff, got ${caseC.player.adventureBuffs.victoryGoldBoostBattles}`
  );
  assert(caseC.player.gold >= 62, `destruction elite should grant extra gold, got ${caseC.player.gold}`);

  // 4) boss 节点不应触发路径奖励，但应触发 realm complete
  logs.length = 0;
  const caseD = createHarness('convergence', 'boss', { gold: 80 });
  caseD.map.completeNode(caseD.node);
  assert(caseD.game.realmCompleteCalls === 1, 'boss completion should trigger realm complete');
  assert(caseD.player.fateRing.exp === 0, 'boss completion should not grant path ring exp reward');

  console.log('Map path synergy checks passed.');
})();
