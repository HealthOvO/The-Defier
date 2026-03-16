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

function buildRunPathMeta(catalog, runPath, progress) {
  if (!runPath || !catalog[runPath.id]) return null;
  const base = catalog[runPath.id];
  const phases = Array.isArray(base.phases) ? base.phases : [];
  const phaseIndex = Math.max(0, Math.min(phases.length - 1, Number(progress.currentPhaseIndex) || 0));
  return {
    ...base,
    currentPhase: phases[phaseIndex] || null,
    phaseIndex,
    phaseCount: phases.length,
    progress
  };
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const storage = new Map();
  const logs = [];
  const ctx = vm.createContext({
    console,
    window: {},
    Math,
    JSON,
    Date,
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value))
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    Utils: {
      shuffle: (arr) => arr.slice(),
      showBattleLog: (text) => logs.push(String(text || ''))
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  [
    'js/data/characters.js',
    'js/data/run_destinies.js',
    'js/data/run_paths.js',
    'js/data/spirit_companions.js',
    'js/data/run_vows.js',
    'js/data/narrative_templates.js',
    'js/game.js',
    'js/core/collection_hub.js'
  ].forEach((file) => loadFile(ctx, path.join(root, file)));

  const Game = vm.runInContext('Game', ctx);
  const RUN_PATHS = vm.runInContext('RUN_PATHS', ctx);

  const game = Object.create(Game.prototype);
  game.shuffleList = (arr) => arr.slice();
  game.pendingRunPathDrafts = {};
  game.pendingRunDestinyDrafts = { linFeng: ['foldedEdge', 'rebelScale', 'emberHeart'] };
  game.pendingSpiritCompanionDrafts = { linFeng: ['swordWraith', 'spiritApe', 'starFox'] };
  game.selectedCharacterId = 'linFeng';
  game.selectedRunDestinyId = 'foldedEdge';
  game.selectedSpiritCompanionId = 'swordWraith';
  game.selectedRunPathId = 'shatter';
  game.currentScreen = 'character-selection-screen';
  game.map = null;
  game.ensureEndlessState = () => null;
  game.getEndlessPhaseProfile = () => null;
  game.getEndlessCycleThemeProfile = () => null;
  game.ensureEncounterState = () => ({});
  game.legacyProgress = {};
  game.getLegacyUnspentEssence = () => 0;
  game.refreshLegacyMissionTrackers = () => {};
  game.autoSave = () => {};
  game.showScreen = (screen) => {
    game.currentScreen = screen;
  };
  game.dismissRunPathMapFeedback = Game.prototype.dismissRunPathMapFeedback;

  const linFengDraft = game.draftRunPathsForCharacter('linFeng');
  const wuYuDraft = game.draftRunPathsForCharacter('wuYu');
  assert(Array.isArray(linFengDraft) && linFengDraft.length === 3, 'linFeng should draft 3 run paths');
  assert(Array.isArray(wuYuDraft) && wuYuDraft.length === 3, 'wuYu should draft 3 run paths');
  assert(linFengDraft[0] === 'shatter', `linFeng should prefer shatter path, got ${linFengDraft[0]}`);
  assert(wuYuDraft[0] === 'bulwark', `wuYu should prefer bulwark path, got ${wuYuDraft[0]}`);

  const fakePlayer = {
    currentHp: 80,
    maxHp: 80,
    block: 0,
    currentEnergy: 3,
    baseEnergy: 3,
    characterId: 'linFeng',
    realm: 6,
    hand: [],
    drawPile: [],
    discardPile: [],
    archetypeResonance: null,
    adventureBuffs: {},
    runDestiny: null,
    runVows: [],
    spiritCompanion: null,
    runPath: { id: 'shatter' },
    runPathProgress: {
      pathId: 'shatter',
      currentPhaseIndex: 0,
      phaseProgress: 0,
      completedPhases: [],
      rewardHistory: [],
      completed: false,
      lastRewardText: ''
    },
    getRunDestinyMeta: () => null,
    getRunVowMetas: () => [],
    getSpiritCompanionMeta: () => null,
    getTreasureWorkshopSnapshot: () => [],
    getTreasureWorkshopResearchOverview: () => null,
    fateRing: {
      exp: 0,
      gainExp(amount) {
        this.exp += Math.max(0, Math.floor(Number(amount) || 0));
      }
    },
    grantAdventureBuff(id, charges = 1) {
      this.adventureBuffs[id] = (this.adventureBuffs[id] || 0) + Math.max(1, Math.floor(Number(charges) || 1));
      return true;
    },
    ensureRunPathProgress() {
      return this.runPathProgress;
    },
    getRunPathMeta() {
      return buildRunPathMeta(RUN_PATHS, this.runPath, this.runPathProgress);
    },
    getRunPathEffects() {
      const meta = this.getRunPathMeta();
      return meta ? { ...(meta.effects || {}) } : {};
    }
  };

  game.player = fakePlayer;
  game.currentScreen = 'battle-screen';

  assert(game.handleRunPathProgress('playAttackCard', 3), 'attack progress should apply');
  assert(fakePlayer.runPathProgress.phaseProgress === 3, `attack phase should be at 3, got ${fakePlayer.runPathProgress.phaseProgress}`);

  assert(game.handleRunPathProgress('playAttackCard', 3), 'attack phase should finish');
  assert(fakePlayer.gold === 60, `phase 1 should grant gold, got ${fakePlayer.gold}`);
  assert(fakePlayer.adventureBuffs.firstTurnEnergyBoostBattles === 1, 'phase 1 should grant energy buff');
  assert(fakePlayer.runPathProgress.currentPhaseIndex === 1, `should advance to phase 2, got ${fakePlayer.runPathProgress.currentPhaseIndex}`);
  assert(fakePlayer.runPathProgress.phaseProgress === 0, 'new phase progress should reset');
  assert(game.lastRunPathRewardMeta && game.lastRunPathRewardMeta.entries.length === 1, 'phase 1 should create reward-screen meta');
  assert(game.lastRunPathRewardMeta.entries[0].phaseId === 'shatter_opening', `phase 1 reward meta should point to shatter_opening, got ${game.lastRunPathRewardMeta.entries[0].phaseId}`);
  assert(/灵石 \+60/.test(game.lastRunPathRewardMeta.entries[0].rewardText), `phase 1 reward text should be preserved, got ${game.lastRunPathRewardMeta.entries[0].rewardText}`);

  assert(!game.handleRunPathProgress('battleWin', 1, { nodeType: 'enemy' }), 'wrong event type should not progress elite phase');
  assert(game.handleRunPathProgress('eliteOrTrialWin', 1, { nodeType: 'elite' }), 'elite phase should accept elite win');
  assert(game.handleRunPathProgress('eliteOrTrialWin', 1, { nodeType: 'trial' }), 'elite phase should accept trial win');
  assert(fakePlayer.fateRing.exp === 36, `phase 2 should grant ring exp, got ${fakePlayer.fateRing.exp}`);
  assert(fakePlayer.adventureBuffs.victoryGoldBoostBattles === 1, 'phase 2 should grant gold buff');
  assert(fakePlayer.runPathProgress.currentPhaseIndex === 2, `should advance to final phase, got ${fakePlayer.runPathProgress.currentPhaseIndex}`);
  assert(game.lastRunPathRewardMeta && game.lastRunPathRewardMeta.entries.length === 2, 'phase 2 should append another reward-screen meta entry');
  assert(game.lastRunPathRewardMeta.entries[1].phaseId === 'shatter_mid', `phase 2 reward meta should point to shatter_mid, got ${game.lastRunPathRewardMeta.entries[1].phaseId}`);
  assert(game.lastRunPathRewardMeta.entries[1].nextPhaseTitle === '断命问锋', `phase 2 reward meta should preview final phase, got ${game.lastRunPathRewardMeta.entries[1].nextPhaseTitle}`);

  assert(game.handleRunPathProgress('bossWin', 1, { nodeType: 'boss' }), 'boss phase should complete');
  assert(fakePlayer.heavenlyInsight === 1, `final phase should grant insight, got ${fakePlayer.heavenlyInsight}`);
  assert(fakePlayer.gold === 180, `final phase should stack gold reward, got ${fakePlayer.gold}`);
  assert(fakePlayer.runPathProgress.completed === true, 'run path should mark completed');
  assert(logs.some((line) => line.includes('命途阶段完成')), 'battle log should announce path completion');
  assert(game.lastRunPathRewardMeta && game.lastRunPathRewardMeta.completed === true, 'final phase should mark reward meta completed');
  assert(game.lastRunPathRewardMeta.entries.length === 3, `final phase should keep all reward entries, got ${game.lastRunPathRewardMeta.entries.length}`);
  assert(game.lastRunPathRewardMeta.entries[2].completed === true, 'final reward entry should be marked completed');
  assert(game.lastRunPathRewardMeta.archive && game.lastRunPathRewardMeta.archive.recordName === '断命战录', `final reward meta should expose archive feedback, got ${JSON.stringify(game.lastRunPathRewardMeta.archive)}`);

  const runPathRecord = typeof game.getRunPathRecord === 'function' ? game.getRunPathRecord('shatter') : null;
  assert(runPathRecord && runPathRecord.clears === 1, `run path record should persist first clear, got ${JSON.stringify(runPathRecord)}`);
  assert(runPathRecord && runPathRecord.firstClearAt > 0 && runPathRecord.lastCompletedAt > 0, 'run path record should stamp clear times');
  const latestUnlock = typeof game.getCollectionUnlockHistory === 'function' ? game.getCollectionUnlockHistory(1)[0] : null;
  assert(latestUnlock && latestUnlock.type === 'run_path', `latest unlock should be run_path archive, got ${JSON.stringify(latestUnlock)}`);
  assert(latestUnlock && /命途碑廊/.test(latestUnlock.note || ''), `latest unlock note should mention sanctum archive, got ${latestUnlock && latestUnlock.note}`);

  game.currentScreen = 'character-selection-screen';
  const payload = JSON.parse(game.renderGameToText());
  assert(payload.player.runPath && payload.player.runPath.id === 'shatter', 'render_game_to_text should expose player run path');
  assert(payload.draft && Array.isArray(payload.draft.runPaths) && payload.draft.runPaths.length === 3, 'draft should expose run path ids');
  assert(payload.draft.selectedRunPathId === 'shatter', 'draft should expose selected run path id');

  game.currentScreen = 'reward-screen';
  const rewardPayload = JSON.parse(game.renderGameToText());
  assert(rewardPayload.reward && rewardPayload.reward.runPath && rewardPayload.reward.runPath.entryCount === 3, 'reward render_game_to_text should expose run path settlement summary');
  assert(rewardPayload.reward.runPath.archive && rewardPayload.reward.runPath.archive.recordName === '断命战录', `reward render_game_to_text should expose archive feedback, got ${JSON.stringify(rewardPayload.reward.runPath.archive)}`);

  game.currentBattleNode = { id: 1, type: 'boss' };
  game.rewardCardSelected = true;
  game.continueAfterReward();
  assert(game.lastRunPathRewardMeta === null, 'continueAfterReward should clear run path reward meta');
  assert(game.currentScreen === 'map-screen', `continueAfterReward should return to map-screen, got ${game.currentScreen}`);

  game.lastRunPathRewardMeta = null;
  game.currentScreen = 'map-screen';
  fakePlayer.runPath = { id: 'insight' };
  fakePlayer.runPathProgress = {
    pathId: 'insight',
    currentPhaseIndex: 1,
    phaseProgress: 1,
    completedPhases: ['insight_opening'],
    rewardHistory: [],
    completed: false,
    lastRewardText: ''
  };
  assert(game.handleRunPathProgress('strategicNodeVisit', 1, { nodeType: 'observatory' }), 'map strategic node should still progress run path');
  assert(game.lastRunPathRewardMeta === null, 'non-battle path completion should not leak into reward-screen meta');
  assert(game.lastRunPathMapFeedback && game.lastRunPathMapFeedback.pathId === 'insight', 'map completion should create map-side run path feedback');
  assert(game.lastRunPathMapFeedback.phaseId === 'insight_mid', `map feedback should point to insight_mid, got ${game.lastRunPathMapFeedback.phaseId}`);
  assert(game.lastRunPathMapFeedback.nextPhaseTitle === '命盘问真', `map feedback should preview final phase, got ${game.lastRunPathMapFeedback.nextPhaseTitle}`);

  game.dismissRunPathMapFeedback();
  assert(game.lastRunPathMapFeedback === null, 'dismissRunPathMapFeedback should clear map feedback');

  console.log('Run path system checks passed.');
})();
