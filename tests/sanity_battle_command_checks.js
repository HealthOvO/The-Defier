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

function makeEnemy(id, hp = 120) {
  return {
    id,
    name: `测试敌人-${id}`,
    currentHp: hp,
    maxHp: hp,
    block: 6,
    buffs: {},
    patterns: [{ type: 'attack', value: 10, intent: '⚔️' }],
    currentPatternIndex: 0
  };
}

function makePlayer() {
  return {
    realm: 10,
    currentHp: 90,
    maxHp: 120,
    block: 0,
    currentEnergy: 3,
    maxMilkCandy: 6,
    milkCandy: 1,
    buffs: {},
    hand: [],
    drawPile: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }],
    discardPile: [],
    activeResonances: [],
    runDestiny: { id: 'audit_destiny', tier: 2 },
    runVows: [{ id: 'audit_vow', tier: 1 }],
    spiritCompanion: { id: 'audit_spirit', tier: 1 },
    spiritCompanionBattleState: { charge: 3 },
    equippedTreasures: [
      { id: 'audit_treasure_1', setTag: 'xuanjia' },
      { id: 'audit_treasure_2', setTag: 'xuanjia' }
    ],
    collectedLaws: [],
    fateRing: {
      path: 'resonance',
      getSocketedLaws() {
        return ['thunderLaw', 'flameTruth'];
      }
    },
    getRunDestinyMeta() {
      return {
        id: 'audit_destiny',
        name: '试作命格',
        icon: '✦',
        tier: 2,
        tierLabel: '第二阶',
        category: '构筑',
        summary: '首击获得额外爆发。'
      };
    },
    getRunVowMetas() {
      return [
        {
          id: 'audit_vow',
          name: '破界誓',
          icon: '✧',
          tier: 1,
          tierLabel: '第一阶',
          category: '风险',
          summary: '以风险换高压收益。'
        }
      ];
    },
    getSpiritCompanionMeta() {
      return {
        id: 'audit_spirit',
        name: '霜螭',
        icon: '🐉',
        title: '护道之灵',
        summary: '先控场再稳住护盾。',
        passiveLabel: '霜鳞凝息',
        passiveDesc: '战斗开始时，全体敌人获得 1 层虚弱。',
        activeLabel: '寒潮护道',
        activeDesc: '蓄能满后：全体敌人虚弱 +2，自身获得 8 护盾。',
        chargeMax: 5
      };
    },
    ensureSpiritCompanionBattleState() {
      return this.spiritCompanionBattleState;
    },
    getEquippedTreasureSetCounts() {
      return { xuanjia: 2 };
    },
    getTreasureSetLabel(setTag) {
      return setTag === 'xuanjia' ? '玄甲' : setTag;
    },
    getTreasureSetMeta(setTag) {
      if (setTag !== 'xuanjia') return null;
      return { icon: '🛡️', theme: '护阵 / 反制 / 拉长回合' };
    },
    addBlock(amount) {
      this.block = Math.max(0, this.block + Math.floor(Number(amount) || 0));
    },
    drawCards(count) {
      const n = Math.max(0, Math.floor(Number(count) || 0));
      for (let i = 0; i < n; i += 1) {
        if (this.drawPile.length <= 0) break;
        this.hand.push(this.drawPile.shift());
      }
    },
    takeDamage(amount) {
      const dmg = Math.max(0, Math.floor(Number(amount) || 0));
      this.currentHp = Math.max(0, this.currentHp - dmg);
      return { damage: dmg, dodged: false, thorns: 0 };
    },
    isAlive() {
      return this.currentHp > 0;
    }
  };
}

(async function run() {
  const root = path.resolve(__dirname, '..');
  const mathObj = Object.create(Math);
  mathObj.random = () => 0.41;

  const ctx = vm.createContext({
    console,
    window: {},
    Math: mathObj,
    JSON,
    Date,
    CARDS: { heartDemon: { id: 'heartDemon', name: '心魔' } },
    LAWS: {
      thunderLaw: { id: 'thunderLaw', name: '雷法残章', icon: '⚡', description: '雷火编织前件。' },
      flameTruth: { id: 'flameTruth', name: '火焰真意', icon: '🔥', description: '雷火编织后件。' }
    },
    LAW_RESONANCES: {
      plasmaOverload: {
        id: 'plasmaOverload',
        name: '雷火崩坏',
        laws: ['thunderLaw', 'flameTruth'],
        description: '雷引火爆。'
      }
    },
    FATE_RING: {
      paths: {
        resonance: {
          id: 'resonance',
          name: '回响之环',
          icon: '🎼'
        }
      }
    },
    document: {
      querySelector: () => null,
      getElementById: () => null,
      querySelectorAll: () => [],
      createElement: () => ({
        className: '',
        style: {},
        innerHTML: '',
        parentElement: null
      })
    },
    Utils: {
      showBattleLog: () => {},
      sleep: () => Promise.resolve(),
      addShakeEffect: () => {},
      showFloatingNumber: () => {},
      createFloatingText: () => {},
      addFlashEffect: () => {},
      getCanonicalElement: (value) => String(value || 'none'),
      shuffle: (arr) => Array.isArray(arr) ? arr.slice() : []
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/core/battle.js'));
  const Battle = vm.runInContext('Battle', ctx);
  assert(typeof Battle === 'function', 'Battle class should be defined');

  const game = {
    mode: 'pve',
    player: makePlayer(),
    currentBattleNode: { id: 7001, type: 'enemy', row: 1, col: 1 },
    onBattleWon: () => {},
    onBattleLost: () => {}
  };
  const battle = new Battle(game);
  battle.enemies = [makeEnemy('alpha'), makeEnemy('beta')];

  battle.initializeBattleCommandSystem();
  assert(battle.commandState && battle.commandState.enabled, 'battle command system should be enabled in pve');
  assert(Array.isArray(battle.commandState.commands) && battle.commandState.commands.length === 3, 'battle command loadout should contain 3 commands');
  assert((battle.commandState.points || 0) >= 3, 'battle command should have opening points');

  battle.commandState.points = 0;
  battle.cardsPlayedThisTurn = 1;
  battle.emit('cardPlayed', {
    card: { id: 'cmdTestAttack', type: 'attack' },
    cardsPlayedThisTurn: 1
  });
  assert((battle.commandState.points || 0) >= 2, 'attack card play should charge command points');

  battle.onBattleCommandTurnStart();
  const turnStartPoints = battle.commandState.points || 0;
  assert(turnStartPoints >= 3, 'turn start should grant command point gain');

  const command = battle.commandState.commands[0];
  const commandId = command.id;
  battle.commandState.points = battle.commandState.maxPoints;
  command.cooldownRemaining = 0;
  const hpBefore = battle.enemies.reduce((sum, enemy) => sum + (enemy.currentHp || 0), 0);
  const blockBefore = battle.player.block || 0;
  const handBefore = battle.player.hand.length;
  const energyBefore = battle.player.currentEnergy;
  const pointsBefore = battle.commandState.points;

  const used = await battle.activateBattleCommand(commandId);
  assert(used === true, 'battle command activation should succeed when resource is enough');
  assert((battle.commandState.points || 0) < pointsBefore, 'battle command activation should spend points');
  assert((command.cooldownRemaining || 0) >= 1, 'used command should enter cooldown');
  assert((battle.commandState.totalCommandsUsed || 0) >= 1, 'total command usage should be tracked');

  const hpAfter = battle.enemies.reduce((sum, enemy) => sum + (enemy.currentHp || 0), 0);
  const blockAfter = battle.player.block || 0;
  const handAfter = battle.player.hand.length;
  const energyAfter = battle.player.currentEnergy;
  const commandChanged =
    hpAfter < hpBefore ||
    blockAfter > blockBefore ||
    handAfter > handBefore ||
    energyAfter > energyBefore;
  assert(commandChanged, 'battle command should create at least one gameplay state change');

  const cdBefore = command.cooldownRemaining;
  battle.onBattleCommandTurnStart();
  assert(command.cooldownRemaining === Math.max(0, cdBefore - 1), 'turn start should reduce command cooldown');

  battle.commandState.points = 0;
  const failUse = await battle.activateBattleCommand(commandId);
  assert(failUse === false, 'battle command should fail when points are insufficient');

  const pointsBeforeKill = battle.commandState.points;
  battle.onBattleCommandEnemyKilled({ isBoss: false });
  assert((battle.commandState.points || 0) >= pointsBeforeKill + 2, 'enemy kill should grant command points');

  const snapshot = battle.getBattleCommandSnapshot();
  assert(snapshot && snapshot.enabled === true, 'command snapshot should expose enabled state');
  assert(snapshot.commandCount === 3, 'command snapshot should keep loadout size');

  const systemState = battle.getBattleSystemDisplayState();
  assert(systemState && Array.isArray(systemState.stripItems), 'battle system state should expose strip items');
  assert(systemState.stripItems.length >= 6, 'battle system state should include all readability system entries');
  assert(systemState.destiny && systemState.destiny.name === '试作命格', 'battle system state should expose current destiny');
  assert(systemState.vows && systemState.vows.count === 1, 'battle system state should expose current vows');
  assert(systemState.spirit && systemState.spirit.name === '霜螭', 'battle system state should expose current spirit');
  assert(systemState.chapter && typeof systemState.chapter === 'object', 'battle system state should expose chapter wrapper');
  assert(systemState.lawWeave && systemState.lawWeave.comboLabel === '雷火崩坏', 'battle system state should resolve current law weave combo');
  assert(systemState.treasureSets && systemState.treasureSets.activeCount === 1, 'battle system state should expose active treasure set count');

  const pvpGame = {
    mode: 'pvp',
    player: makePlayer(),
    currentBattleNode: { id: 7002, type: 'enemy', row: 1, col: 2 },
    onBattleWon: () => {},
    onBattleLost: () => {}
  };
  const pvpBattle = new Battle(pvpGame);
  pvpBattle.enemies = [makeEnemy('pvp')];
  pvpBattle.initializeBattleCommandSystem();
  assert(!pvpBattle.commandState.enabled, 'battle command should be disabled for pvp mode');

  console.log('Battle command checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
