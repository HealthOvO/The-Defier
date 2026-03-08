const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async function run() {
  const code = fs.readFileSync(path.resolve(__dirname, '../js/core/map.js'), 'utf8');

  const ctx = vm.createContext({
    console,
    window: {},
    Utils: {
      showBattleLog: () => {}
    },
    setTimeout: (fn) => {
      fn();
      return 0;
    },
    clearTimeout: () => {}
  });
  ctx.window = ctx;
  ctx.global = ctx;

  vm.runInContext(code, ctx, { filename: 'map.js' });
  const GameMap = vm.runInContext('GameMap', ctx);

  // 1) 成功拉取残影时，应进入 ghost 战斗
  const gameA = {
    player: { realm: 6, gold: 100 },
    currentBattleNode: null,
    startBattleCalls: [],
    startBattle(enemies, node) {
      this.startBattleCalls.push({ enemies, node });
    }
  };
  const mapA = new GameMap(gameA);
  mapA.completeNode = () => {};

  ctx.AuthService = {
    fetchRandomGhost: async () => ({
      success: true,
      data: {
        get(key) {
          if (key === 'ghostData') {
            return { maxHp: 180, deck: [{ id: 'strike', upgraded: true }] };
          }
          if (key === 'userName') return '镜像修士';
          return null;
        }
      }
    })
  };

  const nodeA = { id: 101, type: 'ghost_duel' };
  await mapA.startGhostDuel(nodeA);
  assert(gameA.startBattleCalls.length === 1, 'ghost duel should start one battle');
  assert(gameA.currentBattleNode === nodeA, 'ghost duel should set current battle node');
  const ghostEnemy = gameA.startBattleCalls[0].enemies[0];
  assert(ghostEnemy && ghostEnemy.id === 'ghost_demon', 'ghost duel should create ghost_demon enemy');
  assert(/镜像修士/.test(ghostEnemy.name), 'ghost duel enemy name should include remote user name');
  assert(ghostEnemy.icon === '👻', 'ghost duel enemy should use ghost icon');

  // 2) 未拉取到残影时，应给补偿并完成节点
  const gameB = {
    player: { realm: 6, gold: 50 },
    startBattle() {
      throw new Error('fallback path should not start battle');
    }
  };
  const mapB = new GameMap(gameB);
  let completed = false;
  mapB.completeNode = () => {
    completed = true;
  };
  ctx.AuthService = {
    fetchRandomGhost: async () => ({ success: false, message: 'not found' })
  };
  const nodeB = { id: 102, type: 'ghost_duel' };
  await mapB.startGhostDuel(nodeB);
  assert(gameB.player.gold === 150, 'ghost duel fallback should grant compensation gold');
  assert(completed === true, 'ghost duel fallback should complete node');

  console.log('Map ghost duel checks passed.');
})();
