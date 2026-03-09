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

function makeEnemy(id = 'encounter_target') {
  return {
    id,
    name: '试炼靶机',
    currentHp: 80,
    maxHp: 80,
    block: 0,
    buffs: {},
    patterns: [{ type: 'attack', value: 10, intent: '⚔️' }],
    currentPatternIndex: 0
  };
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const mathObj = Object.create(Math);
  mathObj.random = () => 0.35;

  const ctx = vm.createContext({
    console,
    window: {},
    Math: mathObj,
    JSON,
    Date,
    CARDS: { heartDemon: { id: 'heartDemon', name: '心魔' } },
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

  const player = {
    realm: 11,
    block: 0,
    buffs: {},
    activeResonances: [],
    collectedLaws: [],
    addBlock(amount) {
      this.block = Math.max(0, (this.block || 0) + Math.floor(Number(amount) || 0));
    }
  };

  const game = {
    mode: 'pve',
    player,
    currentBattleNode: { id: 8112, row: 3, col: 1, type: 'enemy' },
    isEndlessActive: () => false,
    _encounterState: {
      currentStreakId: null,
      currentStreak: 0,
      themeStats: {}
    },
    ensureEncounterState() {
      return this._encounterState;
    },
    registerEncounterThemeStart(themeId) {
      const state = this.ensureEncounterState();
      if (state.currentStreakId === themeId) {
        state.currentStreak += 1;
      } else {
        state.currentStreakId = themeId;
        state.currentStreak = 1;
      }
      const stage = state.currentStreak >= 4 ? 3 : state.currentStreak >= 2 ? 2 : 1;
      const stats = state.themeStats[themeId] || { seen: 0, wins: 0, bestTier: 1 };
      stats.seen += 1;
      stats.bestTier = Math.max(stats.bestTier, stage);
      state.themeStats[themeId] = stats;
      return stage;
    }
  };

  const battle = new Battle(game);

  // 1) 普通战斗应解析出遭遇主题并写回敌人
  battle.enemies = [makeEnemy('theme_enemy_1')];
  const theme = battle.resolveEncounterThemeProfile();
  assert(theme && typeof theme === 'object', 'encounter theme should be resolved for normal pve battle');
  const baseAttack = battle.enemies[0].patterns[0].value;
  battle.applyEncounterThemeProfile(theme);

  const themedEnemy = battle.enemies[0];
  assert(battle.activeEncounterTheme && battle.activeEncounterTheme.id === theme.id, 'active encounter theme should be stored');
  assert(Number(battle.activeEncounterTheme.tierStage || 0) === 1, 'first repeated encounter stage should be I');
  assert(typeof themedEnemy.encounterThemeTag === 'string' && themedEnemy.encounterThemeTag.length > 0, 'enemy should receive encounter tag');
  assert((themedEnemy.block || 0) >= Math.max(0, Number(theme.openingBlock) || 0), 'enemy opening block should be applied');

  if (Number(theme.attackMul || 1) > 1) {
    assert(themedEnemy.patterns[0].value >= baseAttack, 'attack pattern should not decrease when attackMul is active');
  }
  if (theme.injectDebuffType) {
    const hasDebuffPattern = themedEnemy.patterns.some((pattern) => pattern && pattern.type === 'debuff');
    assert(hasDebuffPattern, 'theme with injectDebuffType should add a debuff pattern when absent');
  }
  assert((player.block || 0) >= Math.max(0, Number(theme.playerOpeningBlock) || 0), 'player opening block should be granted');

  // 2) 同主题连战应进入 II 阶，并产生额外奖励摘要
  const previousStageAttack = Number(themedEnemy.patterns[0].value || 0);
  player.block = 0;
  battle.enemies = [makeEnemy('theme_enemy_1b')];
  battle.applyEncounterThemeProfile(theme);
  assert(Number(battle.activeEncounterTheme.tierStage || 0) === 2, 'second same encounter should enter tier II');
  assert(Number(battle.enemies[0].patterns[0].value || 0) >= previousStageAttack, 'tier II should not reduce attack pressure');

  const rewardSummary = battle.consumeEncounterVictoryBonusSummary();
  assert(rewardSummary && typeof rewardSummary === 'object', 'encounter reward summary should be produced once');
  assert(Number(rewardSummary.goldBonus || 0) > 0, 'encounter reward should grant gold bonus');
  assert(Number(rewardSummary.ringExpBonus || 0) > 0, 'encounter reward should grant ring exp bonus');
  assert(Array.isArray(rewardSummary.adventureBuffRewards), 'encounter reward should carry buff rewards list');
  assert(battle.consumeEncounterVictoryBonusSummary() === null, 'encounter reward summary should be consumable only once');

  // 3) 试炼节点更偏向带减益主题（若候选中存在）
  player.block = 0;
  game.currentBattleNode = { id: 8113, row: 4, col: 2, type: 'trial' };
  battle.encounterRewardConsumed = false;
  battle.enemies = [makeEnemy('theme_enemy_2')];
  const trialTheme = battle.resolveEncounterThemeProfile();
  assert(trialTheme && typeof trialTheme === 'object', 'trial node should still resolve encounter theme');
  assert(Number(trialTheme.injectDebuffValue || 0) > 0, 'trial node should prioritize debuff-oriented encounter themes');

  // 4) 高重天遭遇应挂载专属词缀标签
  player.realm = 14;
  game.currentBattleNode = { id: 9201, row: 5, col: 1, type: 'enemy' };
  battle.encounterRewardConsumed = false;
  battle.enemies = [makeEnemy('theme_enemy_affix')];
  const highTheme = {
    id: 'thunder_vanguard',
    name: '雷锋突进',
    shortTag: '雷锋',
    icon: '⛈️',
    description: '敌方攻击倍率上浮，需提前规划防御节奏。',
    tier: 'mid',
    nodeType: 'enemy',
    attackMul: 1.08,
    openingBlock: 2,
    playerOpeningBlock: 6
  };
  battle.applyEncounterThemeProfile(highTheme);
  const affixEnemy = battle.enemies[0];
  assert(typeof affixEnemy.encounterAffixTag === 'string' && affixEnemy.encounterAffixTag.length > 0, 'high-realm encounter should attach signature affix');

  // 5) PVP / endless / boss 场景应跳过遭遇主题
  game.mode = 'pvp';
  battle.enemies = [makeEnemy('theme_enemy_3')];
  assert(battle.resolveEncounterThemeProfile() === null, 'pvp battles should skip encounter themes');

  game.mode = 'pve';
  game.isEndlessActive = () => true;
  assert(battle.resolveEncounterThemeProfile() === null, 'endless battles should skip encounter themes');

  game.isEndlessActive = () => false;
  battle.enemies = [{ ...makeEnemy('boss_target'), isBoss: true }];
  assert(battle.resolveEncounterThemeProfile() === null, 'boss battles should skip encounter themes');

  console.log('Battle encounter theme checks passed.');
})();
