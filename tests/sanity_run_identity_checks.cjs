const fs = require('fs');

const originalReadFileSync = fs.readFileSync;
fs.readFileSync = function(p, enc) {
    let c = originalReadFileSync(p, enc);
    if (enc === 'utf8' && p.endsWith('.js')) {
        c = c.replace(/^export\s+(const|let|var|class|function|default)/gm, '$1');
        c = c.replace(/^export\s+\{.*?\};?/gm, '');
        c = c.replace(/^import\s+.*?;/gm, '');
    }
    return c;
};

const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function loadFile(ctx, filePath) {
  let code = fs.readFileSync(filePath, 'utf8');
  code = code.replace(/^export\s+(const|let|var|class|function|default)/gm, '$1');
  code = code.replace(/^export\s+\{.*?\};?/gm, '');
  code = code.replace(/^import\s+.*?;/gm, '');
  vm.runInContext(code, ctx, { filename: filePath });
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const storage = new Map();
  let currentProgressionUserId = 'progression-account-b';
  let generatedProgressionRun = 0;
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
      showBattleLog: () => {}
    },
    ProgressionService: {
      getCurrentUserId: () => currentProgressionUserId,
      normalizeSafeId: (value) => /^[A-Za-z0-9._:-]{8,128}$/.test(String(value || '').trim()) ? String(value).trim() : '',
      createSafeId: (prefix = 'run') => `${prefix}-account-fork-${++generatedProgressionRun}`
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  [
    'js/data/characters.js',
    'js/data/run_destinies.js',
    'js/data/spirit_companions.js',
    'js/data/run_vows.js',
    'js/data/narrative_templates.js',
    'js/managers/EventManager.js',
    'js/managers/MetaProgressionManager.js',
    'js/managers/EndlessManager.js',
    'js/managers/RunManager.js',
    'js/managers/SeasonBoardManager.js',
    'js/managers/SanctumAgendaManager.js',
    'js/managers/ShopManager.js',
    'js/managers/SaveManager.js',
    'js/core/player.js',
    'js/core/map.js',
    'js/core/events.js',
    'js/core/achievements.js',
    'js/core/fateRing.js',
    'js/views/EventView.js',
    'js/views/RewardView.js',
    'js/game.js'
  ].forEach((file) => loadFile(ctx, path.join(root, file)));

  const Game = vm.runInContext('Game', ctx);
  const CHARACTERS = vm.runInContext('CHARACTERS', ctx);

  const EventView = vm.runInContext('EventView', ctx);
  const RewardView = vm.runInContext('RewardView', ctx);const game = Object.create(Game.prototype);

  if (typeof game.attachHubControllers === 'function') game.attachHubControllers();
  try { game.eventView = new EventView(game); } catch(e){}
  try { game.rewardView = new RewardView(game); } catch(e){}
  game.player = {
    currentHp: 80,
    maxHp: 80,
    block: 0,
    currentEnergy: 3,
    baseEnergy: 3,
    hand: [],
    drawPile: [],
    discardPile: [],
    archetypeResonance: null,
    getRunDestinyMeta: () => null,
    getRunVowMetas: () => [],
    getSpiritCompanionMeta: () => null,
    getTreasureWorkshopSnapshot: () => [],
    getTreasureWorkshopResearchOverview: () => null,
    adventureBuffs: null
  };
  game.currentScreen = 'character-selection-screen';
  game.selectedCharacterId = 'linFeng';
  game.selectedRunDestinyId = 'foldedEdge';
  game.selectedSpiritCompanionId = 'swordWraith';
  game.pendingRunDestinyDrafts = { linFeng: ['foldedEdge', 'rebelScale', 'emberHeart'] };
  game.pendingSpiritCompanionDrafts = { linFeng: ['swordWraith', 'spiritApe', 'starFox'] };
  game.ensureEndlessState = () => null;
  game.getEndlessPhaseProfile = () => null;
  game.getEndlessCycleThemeProfile = () => null;
  game.ensureEncounterState = () => ({});
  game.map = null;
  game.legacyProgress = {};
  game.getLegacyUnspentEssence = () => 0;

  game.progressionRunId = 'run-account-a-existing';
  game.progressionRunOwnerUserId = 'progression-account-a';
  game.runStartTime = 1000;
  const forkedRun = game.restoreProgressionRunIdentity({
    runId: 'run-account-a-existing',
    ownerUserId: 'progression-account-a',
    startedAt: 1000
  }, 1000);
  assert(forkedRun.ownerUserId === currentProgressionUserId, 'cross-account save restore should bind a fresh run to the current account');
  assert(forkedRun.runId !== 'run-account-a-existing', 'cross-account save restore must not reuse the previous account run id');
  const retainedRun = game.restoreProgressionRunIdentity({
    runId: forkedRun.runId,
    ownerUserId: currentProgressionUserId,
    startedAt: forkedRun.startedAt
  }, forkedRun.startedAt);
  assert(retainedRun.runId === forkedRun.runId, 'same-account save restore should retain the stable run id');

  Object.keys(CHARACTERS).forEach((charId) => {
    const profile = game.getCharacterIdentityProfile(charId);
    assert(profile && profile.id === charId, `identity profile should exist for ${charId}`);
    assert(typeof profile.unlockLabel === 'string' && profile.unlockLabel.length > 0, `${charId} should expose unlockLabel`);
    assert(typeof profile.unlockHint === 'string' && profile.unlockHint.length > 0, `${charId} should expose unlockHint`);
    assert(typeof profile.synopsis === 'string' && profile.synopsis.length >= 12, `${charId} should expose synopsis`);
    assert(typeof profile.identityHook === 'string' && profile.identityHook.length >= 12, `${charId} should expose identityHook`);
    assert(Array.isArray(profile.keywords) && profile.keywords.length >= 3, `${charId} should expose 3+ keywords`);
    assert(Array.isArray(profile.recommendedDestinies) && profile.recommendedDestinies.length >= 1, `${charId} should expose recommended destinies`);
    assert(Array.isArray(profile.recommendedSpirits) && profile.recommendedSpirits.length >= 1, `${charId} should expose recommended spirits`);
    assert(profile.exclusiveLine && profile.exclusiveLine.summary.length >= 12, `${charId} should expose exclusive line summary`);
  });

  const payload = JSON.parse(game.renderGameToText());
  assert(payload.mode === 'character-selection-screen', `render_game_to_text should preserve character-selection-screen, got ${payload.mode}`);
  assert(payload.draft && payload.draft.characterIdentity && payload.draft.characterIdentity.id === 'linFeng', 'draft should expose selected character identity');
  assert(payload.draft.characterIdentity.keywords.length >= 3, 'draft character identity should include keywords');
  assert(payload.draft.runDestinies.length === 3, 'draft should expose pending destiny ids');
  assert(payload.draft.spiritCompanions.length === 3, 'draft should expose pending spirit ids');

  console.log('Run identity checks passed.');
})();
