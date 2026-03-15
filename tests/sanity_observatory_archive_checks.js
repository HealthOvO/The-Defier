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
    Game: function Game() {
      this.player = {
        currentHp: 56,
        maxHp: 80,
        collectedLaws: [{ id: 'lawA' }, { id: 'lawB' }],
        collectedTreasures: [{ id: 'treasureA' }],
        applyRunVow: () => true
      };
      this.currentScreen = 'main-menu';
      this.currentSaveSlot = 0;
      this.challengeProgressState = null;
      this.challengeHubState = null;
      this.pendingChallengeStart = null;
      this.activeChallengeRun = null;
      this.observatoryArchiveState = null;
      this.startedRealm = 0;
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
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  ctx.Game.prototype.getRunDestinyMetaById = function (id) {
    return { id, name: `命格-${id}`, category: '测试', tierLabel: '初印', icon: '✦' };
  };
  ctx.Game.prototype.getSpiritCompanionMetaById = function (id) {
    return { id, name: `灵契-${id}`, title: '测试灵契', category: '灵契', tierLabel: '初契', icon: '🪷', passiveDesc: '被动', activeDesc: '主动' };
  };
  ctx.Game.prototype.getRunVowMetaById = function (id) {
    return { id, name: `誓约-${id}` };
  };
  ctx.Game.prototype.recordCollectionUnlock = function (type, payload) {
    this.unlocks.push({ type, ...payload });
    return true;
  };
  ctx.Game.prototype.getCollectionUnlockHistory = function () {
    return this.unlocks.slice().reverse();
  };
  ctx.Game.prototype.formatCollectionTimestamp = function () {
    return '最近';
  };
  ctx.Game.prototype.startRealm = function (realm) {
    this.startedRealm = realm;
  };

  loadFile(ctx, path.join(root, 'js/data/challenge_rules.js'));
  loadFile(ctx, path.join(root, 'js/core/challenge_hub.js'));

  const Game = vm.runInContext('Game', ctx);
  const game = new Game();

  const bundle = game.buildChallengeBundle('daily', new Date('2026-03-14T08:00:00'));
  assert(bundle && bundle.rule, 'daily bundle should exist');
  assert(/^D-/.test(bundle.seedSignature || ''), `seed signature should be generated, got ${bundle.seedSignature}`);

  game.finishStrategicNode(
    { id: 101, type: 'observatory' },
    '福缘星轨已定',
    '第 2 重路线趋向：机缘补给线。\n天机 +1。',
    '🔭'
  );
  const omenSummary = game.getObservatoryArchiveSummary();
  assert(omenSummary.totalRecords === 1, `observatory omen should create one archive entry, got ${omenSummary.totalRecords}`);
  assert(omenSummary.latest && omenSummary.latest.type === 'omen', `latest observatory archive should be omen, got ${JSON.stringify(omenSummary.latest)}`);
  assert(game.unlocks.some((entry) => entry.type === 'observatory' && /观星留痕/.test(entry.name || '')), 'observatory omen should also enter unlock feed');

  game.applyChallengeRunStart(bundle);
  game.activeChallengeRun.progress.battleWins = 2;
  game.activeChallengeRun.progress.realmClears = 1;
  game.player.currentHp = 60;
  const completed = game.finalizeActiveChallengeRun({ completed: true, reason: 'goal_reached' });
  const progressEntry = game.getChallengeProgressEntry('daily', bundle.rotationKey, false);
  assert(completed && completed.completed === true, 'completed challenge run should finalize');
  assert(progressEntry && progressEntry.completions === 1, `official challenge progress should increment once, got ${progressEntry && progressEntry.completions}`);

  const challengeArchive = game.getObservatoryArchiveEntries({ types: ['challenge'], replayableOnly: true, limit: 1 })[0];
  assert(challengeArchive && challengeArchive.seedSignature === bundle.seedSignature, 'completed challenge should create replayable archive record with same seed signature');

  const replayStarted = game.beginObservatoryReplay(challengeArchive.id);
  assert(replayStarted === true, 'beginObservatoryReplay should start a pending replay');
  assert(game.pendingChallengeStart && game.pendingChallengeStart.replayOnly === true, 'pending replay should mark replayOnly');
  assert(game.pendingChallengeStart.bundleSnapshot && game.pendingChallengeStart.bundleSnapshot.replayOnly === true, 'pending replay should carry replay bundle snapshot');

  const completionsBeforeReplay = progressEntry.completions;
  game.startNewGame('linFeng');
  assert(game.activeChallengeRun && game.activeChallengeRun.replayOnly === true, 'replay start should create replayOnly active run');
  assert(game.activeChallengeRun.archiveEntryId === challengeArchive.id, `replay run should remember source archive id, got ${game.activeChallengeRun.archiveEntryId}`);
  assert(game.startedRealm === 1, `replay start should enter realm 1, got ${game.startedRealm}`);

  game.activeChallengeRun.progress.battleWins = 1;
  game.player.currentHp = 50;
  const replayResult = game.finalizeActiveChallengeRun({ completed: false, reason: 'battle_lost' });
  const progressAfterReplay = game.getChallengeProgressEntry('daily', bundle.rotationKey, false);
  assert(replayResult && replayResult.replayOnly === true, 'replay finalize should return replay run');
  assert(progressAfterReplay && progressAfterReplay.completions === completionsBeforeReplay, 'replay finalize must not mutate official completion totals');

  const latestArchive = game.getObservatoryArchiveEntries({ limit: 1 })[0];
  assert(latestArchive && latestArchive.type === 'replay', `latest archive should be replay result, got ${JSON.stringify(latestArchive)}`);
  assert(/回放不计奖励/.test(latestArchive.note || ''), `replay note should mention non-reward replay, got ${latestArchive.note}`);
  assert(game.unlocks.some((entry) => /命盘回放/.test(entry.name || '')), 'replay result should also appear in unlock feed');

  game.currentScreen = 'challenge-screen';
  game.challengeHubState = { tab: 'daily' };
  const liveHubBundle = game.buildChallengeBundle('daily');
  const payload = game.getChallengeHubPayload();
  assert(payload.archive && payload.archive.totalRecords >= 3, `payload should expose archive summary, got ${JSON.stringify(payload.archive)}`);
  assert(payload.hub && payload.hub.seedSignature === liveHubBundle.seedSignature, `hub payload should expose live seed signature, got ${JSON.stringify(payload.hub)}`);

  console.log('Observatory archive checks passed.');
})();
