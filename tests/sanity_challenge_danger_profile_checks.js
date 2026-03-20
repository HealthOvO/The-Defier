const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
        currentHp: 72,
        maxHp: 80,
        collectedLaws: [{ id: 'lawA' }],
        collectedTreasures: [],
        applyRunVow: () => true
      };
      this.currentScreen = 'main-menu';
      this.currentSaveSlot = 0;
      this.challengeProgressState = null;
      this.challengeHubState = null;
      this.pendingChallengeStart = null;
      this.activeChallengeRun = null;
      this.observatoryArchiveState = null;
      this.observatoryGuideState = null;
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
    return { id, name: `命格-${id}` };
  };
  ctx.Game.prototype.getSpiritCompanionMetaById = function (id) {
    return { id, name: `灵契-${id}` };
  };
  ctx.Game.prototype.getRunVowMetaById = function (id) {
    return { id, name: `誓约-${id}` };
  };
  ctx.Game.prototype.recordCollectionUnlock = function () {
    return true;
  };
  ctx.Game.prototype.getCollectionUnlockHistory = function () {
    return [];
  };

  loadFile(ctx, path.join(root, 'js/data/challenge_rules.js'));
  loadFile(ctx, path.join(root, 'js/core/challenge_hub.js'));

  const Game = vm.runInContext('Game', ctx);
  const game = new Game();

  const dailyBundle = game.buildChallengeBundle('daily', new Date('2026-03-18T08:00:00'));
  const weeklyBundle = game.buildChallengeBundle('weekly', new Date('2026-03-18T08:00:00'));
  const globalBundle = game.buildChallengeBundle('global', new Date('2026-03-18T08:00:00'));

  [dailyBundle, weeklyBundle, globalBundle].forEach((bundle) => {
    assert(bundle && bundle.dangerProfile, `bundle should expose dangerProfile, got ${JSON.stringify(bundle)}`);
    assert(bundle.dangerProfile.index >= 1, `dangerProfile should have positive index, got ${JSON.stringify(bundle.dangerProfile)}`);
    assert(Array.isArray(bundle.dangerProfile.axes) && bundle.dangerProfile.axes.length === 4, `danger axes should expose 4 entries, got ${JSON.stringify(bundle.dangerProfile)}`);
    assert(bundle.dangerProfile.axes.every((axis) => axis && axis.label && typeof axis.value === 'number'), `danger axes should include labels/values, got ${JSON.stringify(bundle.dangerProfile.axes)}`);
    assert(bundle.dangerProfile.dominantAxisLabel && bundle.dangerProfile.summary && bundle.dangerProfile.counterplay, `danger profile should expose summary fields, got ${JSON.stringify(bundle.dangerProfile)}`);
  });

  assert(
    globalBundle.dangerProfile.index > dailyBundle.dangerProfile.index,
    `global danger should exceed daily danger, got daily=${dailyBundle.dangerProfile.index}, global=${globalBundle.dangerProfile.index}`
  );
  assert(
    weeklyBundle.dangerProfile.index >= dailyBundle.dangerProfile.index,
    `weekly danger should not be lower than daily danger, got daily=${dailyBundle.dangerProfile.index}, weekly=${weeklyBundle.dangerProfile.index}`
  );

  game.currentScreen = 'challenge-screen';
  game.challengeHubState = { tab: 'daily' };
  game.pendingChallengeStart = {
    mode: dailyBundle.mode,
    modeLabel: dailyBundle.meta.label,
    rotationKey: dailyBundle.rotationKey,
    rule: dailyBundle.rule,
    seedSignature: dailyBundle.seedSignature,
    replayOnly: false
  };
  const pendingPayload = game.getChallengeHubPayload();
  assert(
    pendingPayload.pending && pendingPayload.pending.dangerProfile && pendingPayload.pending.dangerProfile.index === dailyBundle.dangerProfile.index,
    `pending payload should expose same danger profile, got ${JSON.stringify(pendingPayload.pending)}`
  );
  assert(
    pendingPayload.hub && pendingPayload.hub.dangerProfile && pendingPayload.hub.dangerProfile.index === dailyBundle.dangerProfile.index,
    `hub payload should expose current daily danger profile, got ${JSON.stringify(pendingPayload.hub)}`
  );

  game.player.collectedLaws = [{ id: 'lawA' }, { id: 'lawB' }];
  game.applyChallengeRunStart(dailyBundle);
  const activePayload = game.getChallengeHubPayload();
  assert(
    activePayload.activeRun && activePayload.activeRun.dangerProfile && activePayload.activeRun.dangerProfile.index === dailyBundle.dangerProfile.index,
    `active run payload should expose danger profile, got ${JSON.stringify(activePayload.activeRun)}`
  );

  console.log('Challenge danger profile checks passed.');
})();
