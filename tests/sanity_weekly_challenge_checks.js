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
  const storage = new Map();
  const pvpState = {
    coins: 0,
    totalEarned: 0,
    ownedItems: {},
    equippedSkinId: null,
    equippedTitleId: null
  };

  function normalizeEconomyState(raw = {}) {
    return {
      coins: Math.max(0, Math.floor(Number(raw.coins) || 0)),
      totalEarned: Math.max(0, Math.floor(Number(raw.totalEarned) || 0)),
      ownedItems: raw.ownedItems && typeof raw.ownedItems === 'object' ? { ...raw.ownedItems } : {},
      equippedSkinId: raw.equippedSkinId || null,
      equippedTitleId: raw.equippedTitleId || null,
      transactionLog: Array.isArray(raw.transactionLog) ? raw.transactionLog.slice() : []
    };
  }

  const ctx = vm.createContext({
    console,
    window: {},
    Math,
    JSON,
    Date,
    Game: function Game() {
      this.player = {
        currentHp: 52,
        maxHp: 80,
        collectedLaws: [],
        collectedTreasures: [],
        applyRunVow: () => true
      };
      this.currentScreen = 'main-menu';
      this.currentSaveSlot = 0;
      this.challengeProgressState = null;
      this.challengeHubState = null;
      this.pendingChallengeStart = null;
      this.activeChallengeRun = null;
      this.legacyGranted = 0;
      this.unlocks = [];
    },
    document: {
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: () => null
    },
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key)
    },
    Utils: {
      showBattleLog: () => {}
    },
    CHARACTERS: {
      linFeng: { name: '林风' },
      xiangYe: { name: '香叶' },
      wuYu: { name: '无欲' },
      yanHan: { name: '严寒' },
      moChen: { name: '墨尘' },
      ningXuan: { name: '宁玄' }
    },
    PVPService: {
      getShopItemById(itemId) {
        if (itemId === 'title_supreme') return { id: itemId, type: 'title', name: '称号·独断万古' };
        if (itemId === 'skin_void_walker') return { id: itemId, type: 'skin', name: '法相·虚空行者' };
        return null;
      },
      loadEconomyState() {
        return normalizeEconomyState(pvpState);
      },
      normalizeEconomyState,
      appendEconomyLog(state, entry) {
        const next = normalizeEconomyState(state);
        next.transactionLog.push({
          type: entry.type || 'misc',
          itemId: entry.itemId || null,
          itemName: entry.itemName || null,
          coins: Math.floor(Number(entry.coins) || 0),
          detail: entry.detail || ''
        });
        return next;
      },
      saveEconomyState(next) {
        Object.assign(pvpState, normalizeEconomyState(next));
      }
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  ctx.Game.prototype.getRunDestinyMetaById = function (id) {
    return { id, name: `命格-${id}`, category: '测试', tierLabel: '初印', icon: '✦' };
  };
  ctx.Game.prototype.getSpiritCompanionMetaById = function (id) {
    return { id, name: `灵契-${id}`, title: '测试灵契', category: '灵契', tierLabel: '初契', icon: '🪷' };
  };
  ctx.Game.prototype.getRunVowMetaById = function (id) {
    return { id, name: `誓约-${id}` };
  };
  ctx.Game.prototype.getCollectionUnlockHistory = function () {
    return this.unlocks.slice().reverse();
  };
  ctx.Game.prototype.formatCollectionTimestamp = function () {
    return '最近';
  };
  ctx.Game.prototype.recordCollectionUnlock = function (type, payload) {
    this.unlocks.push({ type, ...payload });
    return true;
  };
  ctx.Game.prototype.awardLegacyEssence = function (amount) {
    this.legacyGranted += Math.max(0, Math.floor(Number(amount) || 0));
    return this.legacyGranted;
  };
  ctx.Game.prototype.getSanctumOverviewData = function () {
    return {
      rooms: [
        {
          id: 'observatory',
          focus: '章节预兆 / 遭遇档案 / 周挑战预留',
          note: '章节天象与地脉已经入档。',
          actionLabel: '查看章节档案',
          actionType: 'collection',
          actionValue: 'chapters'
        }
      ]
    };
  };

  loadFile(ctx, path.join(root, 'js/data/challenge_rules.js'));
  loadFile(ctx, path.join(root, 'js/core/challenge_hub.js'));

  const Game = vm.runInContext('Game', ctx);
  const game = new Game();

  const dailyBundle = game.buildChallengeBundle('daily', new Date('2026-03-14T08:00:00'));
  assert(dailyBundle && dailyBundle.rule && dailyBundle.rewards.length === 1, 'daily bundle should expose a rule and reward track');
  assert(dailyBundle.rotationKey === '2026-03-14', `unexpected daily rotation key: ${dailyBundle.rotationKey}`);

  game.activeChallengeRun = game.createActiveChallengeRun(dailyBundle);
  game.activeChallengeRun.progress.battleWins = 2;
  game.activeChallengeRun.progress.realmClears = 1;
  game.player.currentHp = 60;
  game.player.maxHp = 80;
  game.player.collectedLaws = [{ id: 'lawA' }, { id: 'lawB' }];
  game.player.collectedTreasures = [{ id: 'treasureA' }];
  const score = game.computeActiveChallengeScore();
  assert(score > 0, `challenge score should be positive, got ${score}`);

  const enemies = game.applyChallengeModifiersToEnemies([
    { id: 'enemyA', hp: 100, maxHp: 100, block: 0, patterns: [{ type: 'attack', value: 10 }] }
  ]);
  assert(enemies[0].hp > 100, `challenge enemy hp should be scaled, got ${enemies[0].hp}`);
  assert(
    enemies[0].patterns.some((pattern) => pattern.type === 'attack' && pattern.value >= 10),
    `challenge enemy attack should remain valid, got ${JSON.stringify(enemies[0].patterns)}`
  );

  const finalized = game.finalizeActiveChallengeRun({ completed: true, reason: 'goal_reached' });
  const dailyEntry = game.getChallengeProgressEntry('daily', dailyBundle.rotationKey, false);
  assert(finalized && finalized.completed, 'finalize should return a completed run');
  assert(dailyEntry && dailyEntry.completions === 1, `daily completions should be 1, got ${dailyEntry && dailyEntry.completions}`);
  assert(game.unlocks.some((entry) => entry.type === 'challenge' && /今日天机/.test(entry.name || '')), 'completed run should add a challenge unlock record');

  const weeklyBundle = game.buildChallengeBundle('weekly', new Date('2026-03-14T08:00:00'));
  const weeklyEntry = game.getChallengeProgressEntry('weekly', weeklyBundle.rotationKey, true);
  weeklyEntry.totalScore = 900;
  const liveWeeklyBundle = game.buildChallengeBundle('weekly', new Date());
  const liveWeeklyEntry = game.getChallengeProgressEntry('weekly', liveWeeklyBundle.rotationKey, true);
  liveWeeklyEntry.totalScore = 900;
  game.saveChallengeProgressState();
  const claimed = game.claimChallengeMilestone('weekly', 'weekly_score_860');
  assert(claimed === true, 'weekly milestone should be claimable once totalScore is high enough');
  assert(liveWeeklyEntry.claimedRewards.weekly_score_860 === true, 'weekly milestone should persist as claimed');
  assert(pvpState.ownedItems.title_supreme === true, 'weekly high score reward should unlock title_supreme');

  const globalBundle = game.buildChallengeBundle('global', new Date('2026-03-14T08:00:00'));
  const globalEntry = game.getChallengeProgressEntry('global', globalBundle.rotationKey, true);
  globalEntry.bestScore = 1260;
  const leaderboard = game.buildChallengeBundle('global', new Date('2026-03-14T08:00:00')).leaderboard;
  assert(leaderboard.some((row) => row.highlight && row.score === 1260), 'global leaderboard should inject the player row when bestScore exists');

  const sanctum = game.getSanctumOverviewData();
  const observatory = sanctum.rooms.find((room) => room.id === 'observatory');
  assert(observatory && observatory.actionType === 'challenge', 'sanctum observatory should now link to challenge hub');
  assert(observatory.actionValue === 'daily', `unexpected observatory action value: ${observatory && observatory.actionValue}`);

  console.log('Weekly challenge checks passed.');
})();
