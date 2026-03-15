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

  const ctx = vm.createContext({
    console,
    window: {},
    Math,
    JSON,
    Date,
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
    Game: function Game() {
      this.player = {
        realm: 2,
        maxRealmReached: 2,
        currentHp: 70,
        maxHp: 80,
        gold: 120,
        collectedLaws: [],
        collectedTreasures: [],
        getSpiritCompanionMeta: () => null
      };
      this.unlockedRealms = [1, 2];
      this.achievementSystem = {
        stats: { realmCleared: 1 },
        unlockedAchievements: [],
        claimedAchievements: []
      };
      this.currentScreen = 'map-screen';
    },
    CHARACTERS: {},
    SPIRIT_COMPANIONS: {},
    TREASURES: {},
    ACHIEVEMENTS: {},
    LAWS: {
      thunderLaw: { id: 'thunderLaw', name: '雷法残章' }
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  ctx.Game.prototype.showCollection = function () {};
  ctx.Game.prototype.initCollection = function () {};
  ctx.Game.prototype.startBattle = function (enemies, node) {
    this.startedBattle = {
      enemies: Array.isArray(enemies) ? enemies.slice() : [enemies],
      node
    };
    return this.startedBattle;
  };
  ctx.Game.prototype.handleBossDefeated = async function () {
    return true;
  };
  ctx.Game.prototype.onRealmComplete = function () {
    return true;
  };
  ctx.Game.prototype.getLawElementLabel = function (element) {
    const map = {
      thunder: '雷',
      fire: '火',
      wood: '木',
      earth: '土',
      metal: '金'
    };
    return map[element] || element || '未知';
  };
  ctx.Game.prototype.getChapterProfileCatalog = function () {
    return {
      1: { id: 'chapter_1' },
      2: { id: 'chapter_2' }
    };
  };
  ctx.Game.prototype.getChapterProfileForRealm = function (realm) {
    const chapterIndex = Math.max(1, Math.floor((Math.max(1, Number(realm) || 1) - 1) / 3) + 1);
    return {
      id: `chapter_${chapterIndex}`,
      name: chapterIndex === 1 ? '碎誓外域' : '炉海天阙',
      fullName: `第${chapterIndex}章·${chapterIndex === 1 ? '碎誓外域' : '炉海天阙'}`,
      icon: chapterIndex === 1 ? '🜂' : '🔥',
      stageLabel: chapterIndex === 1 ? '前段·示章' : '中段·炼潮',
      mechanic: '章节机制测试',
      mood: '高压',
      skyOmen: { name: '裂誓流火', desc: '开局抢拍与首击伤害更容易滚成优势。' },
      leyline: { name: '逆誓余烬', desc: '低血与处决收益会被放大。' },
      focusTags: chapterIndex === 1 ? ['风险试探', '先手斩杀'] : ['灼烧压制', '资源换血'],
      routePrompt: '优先沿着顺势节点压缩风险。',
      bossPrompt: '主宰会继续放大本章的世界规则。',
      recommendedDestinies: [],
      recommendedSpirits: [],
      recommendedVows: []
    };
  };

  loadFile(ctx, path.join(root, 'js/data/enemies.js'));
  loadFile(ctx, path.join(root, 'js/core/collection_hub.js'));

  const Game = vm.runInContext('Game', ctx);
  const game = new Game();

  game.startBattle([
    {
      id: 'graveRaven',
      name: '墓羽鸦',
      icon: '🐦‍⬛',
      realm: 1,
      patterns: [
        { type: 'debuff', buffType: 'weak', value: 1, intent: '🪶噪鸣' }
      ]
    }
  ], { type: 'enemy' });

  const history = game.getCollectionUnlockHistory(6);
  assert(history.some((entry) => entry.type === 'enemy' && entry.itemId === 'graveRaven'), 'startBattle should record enemy unlock history');

  const entries = game.getEnemyCodexEntries();
  const raven = entries.find((entry) => entry.id === 'graveRaven');
  const thunderBeast = entries.find((entry) => entry.id === 'thunderBeast');
  assert(raven, 'graveRaven should exist in enemy codex');
  assert(thunderBeast, 'thunderBeast should exist in enemy codex');
  assert(raven.roleLabel === '控场型', `graveRaven should be control, got ${raven.roleLabel}`);
  assert(raven.threatTags.includes('状态压制'), `graveRaven should expose debuff threat, got ${JSON.stringify(raven.threatTags)}`);
  assert(raven.patternPreview.some((line) => /施加/.test(line)), `graveRaven preview should summarize debuff pattern, got ${JSON.stringify(raven.patternPreview)}`);
  assert(/雷/.test(thunderBeast.elementLabel || ''), `thunderBeast element should resolve label, got ${thunderBeast.elementLabel}`);
  assert(thunderBeast.resistTags.some((tag) => /抗雷|抗/.test(tag)), `thunderBeast resist tags should be readable, got ${JSON.stringify(thunderBeast.resistTags)}`);

  game.setEnemyCodexSearchQuery('雷兽');
  game.setEnemyCodexFocusFilter('scouted');
  const scouted = game.getEnemyCodexEntries().filter((entry) => game.passesEnemyCodexFilter(entry));
  assert(scouted.some((entry) => entry.id === 'thunderBeast'), 'searching 雷兽 with scouted filter should keep thunderBeast');
  assert(scouted.every((entry) => entry.isScouted), 'scouted filter should only keep encountered enemies');

  game.setEnemyCodexSearchQuery('');
  game.setEnemyCodexFocusFilter('upcoming');
  const upcoming = game.getEnemyCodexEntries().filter((entry) => game.passesEnemyCodexFilter(entry));
  assert(upcoming.length > 0, 'upcoming filter should retain unseen enemies');
  assert(upcoming.every((entry) => entry.isUpcoming), 'upcoming filter should only keep future enemies');

  const sanctum = game.getSanctumOverviewData();
  const demonPlatform = sanctum.rooms.find((room) => room.id === 'demon_platform');
  assert(demonPlatform && demonPlatform.actionValue === 'enemies', 'demon platform should now route to enemy codex');
  assert(sanctum.researches.some((research) => research.id === 'enemy_ledger' && research.section === 'enemies'), 'sanctum should expose enemy ledger research');

  const progress = game.getCollectionProgressSnapshot();
  assert(progress.totalEnemies >= entries.length, `enemy progress total should cover codex entries, got ${progress.totalEnemies}`);
  assert(progress.seenEnemies >= 1, `seen enemy progress should be positive, got ${progress.seenEnemies}`);

  console.log('Enemy codex checks passed.');
})();
