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
  const storage = () => {
    const map = new Map();
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: (key) => map.delete(key)
    };
  };

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
    localStorage: storage(),
    sessionStorage: storage(),
    setTimeout: (fn) => {
      if (typeof fn === 'function') fn();
      return 0;
    },
    clearTimeout: () => {},
    CHARACTERS: {
      linFeng: {
        name: '林枫',
        title: '逆命剑徒',
        stats: { maxHp: 80, gold: 100, energy: 3 },
        relic: null,
        keywords: ['连击', '爆发'],
        deck: ['strike', 'strike', 'defend', 'defend', 'quickDraw', 'spiritBoost']
      },
      yanHan: {
        name: '严寒',
        title: '析命策士',
        stats: { maxHp: 76, gold: 105, energy: 3 },
        relic: null,
        keywords: ['调序', '控场'],
        deck: ['strike', 'defend', 'quickDraw', 'analysis', 'quickDraw', 'spiritBoost']
      }
    },
    SKILLS: {},
    STARTER_DECK: ['strike', 'strike', 'defend', 'defend', 'quickDraw', 'spiritBoost'],
    Utils: {
      shuffle: (arr) => arr.slice(),
      showBattleLog: () => {},
      random: (min) => min,
      sleep: () => Promise.resolve(),
      addShakeEffect: () => {},
      showFloatingNumber: () => {},
      createFloatingText: () => {},
      addFlashEffect: () => {},
      getCanonicalElement: (value) => String(value || 'none'),
      getElementIcon: () => '✦',
      upgradeCard: (card) => ({ ...card, upgraded: true })
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  [
    'js/data/cards.js',
    'js/data/run_destinies.js',
    'js/data/run_paths.js',
    'js/data/run_vows.js',
    'js/data/spirit_companions.js',
    'js/data/fate_ring.js',
    'js/core/fateRing.js',
    'js/core/player.js',
    'js/game.js'
  ].forEach((file) => loadFile(ctx, path.join(root, file)));

  const Game = vm.runInContext('Game', ctx);
  const Player = vm.runInContext('Player', ctx);

  const game = Object.create(Game.prototype);
  const player = new Player('yanHan');
  player.game = game;
  player.setRunPath('insight');
  player.realm = 6;
  game.player = player;
  game.currentScreen = 'map-screen';
  let trackerRefreshes = 0;
  let autoSaves = 0;
  game.map = {
    updateLegacyMissionTracker() {
      trackerRefreshes += 1;
    }
  };
  game.autoSave = () => {
    autoSaves += 1;
  };

  const choices = game.getRunPathMutationChoices('insight');
  assert(Array.isArray(choices) && choices.length === 3, `insight should expose 3 mutation choices, got ${JSON.stringify(choices)}`);
  const pivotChoice = choices.find((item) => item.id === 'pivot');
  assert(pivotChoice && Array.isArray(pivotChoice.mutationEventPool) && pivotChoice.mutationEventPool.includes('runPathInsightPivotGambit'), `pivot mutation should expose dedicated event pool, got ${JSON.stringify(pivotChoice)}`);
  assert(game.shouldOfferRunPathMutationAfterRealm(6) === true, 'realm 6 should offer run path mutation before it is chosen');

  const applied = game.applyRunPathMutationSelection('pivot', 6);
  assert(applied && applied.meta && applied.meta.name === '借势落子', `pivot mutation should apply, got ${JSON.stringify(applied)}`);
  assert(player.runPathMutationState && player.runPathMutationState.mutationId === 'pivot', `player should persist mutation state, got ${JSON.stringify(player.runPathMutationState)}`);
  assert(trackerRefreshes >= 1, 'applying mutation on map should refresh tracker');
  assert(autoSaves >= 1, 'applying mutation should autosave');

  const mergedMeta = player.getRunPathMeta();
  assert(mergedMeta && mergedMeta.mutation && mergedMeta.mutation.name === '借势落子', `run path meta should expose active mutation, got ${JSON.stringify(mergedMeta && mergedMeta.mutation)}`);
  assert(mergedMeta.effects.firstSkillDrawPerTurn === 2, `pivot insight should add one extra first skill draw, got ${mergedMeta.effects.firstSkillDrawPerTurn}`);
  assert(mergedMeta.effects.firstAttackBonusPerBattle === 2, `pivot insight should add first attack bonus, got ${mergedMeta.effects.firstAttackBonusPerBattle}`);
  assert((mergedMeta.routeHint || '').includes('精英') || (mergedMeta.routeHint || '').includes('观星台'), `mutation should overwrite route hint, got ${mergedMeta.routeHint}`);
  assert(Array.isArray(mergedMeta.treasureSynergy?.favoredSets) && mergedMeta.treasureSynergy.favoredSets.includes('liemai'), `mutation should expand favored treasure sets, got ${JSON.stringify(mergedMeta.treasureSynergy)}`);
  assert(Array.isArray(mergedMeta.mutationEventPool) && mergedMeta.mutationEventPool.includes('runPathInsightPivotGambit'), `run path meta should expose mutation event pool, got ${JSON.stringify(mergedMeta.mutationEventPool)}`);
  assert(Array.isArray(mergedMeta.eventPool) && mergedMeta.eventPool.includes('runPathInsightPivotGambit'), `run path event pool should merge mutation events, got ${JSON.stringify(mergedMeta.eventPool)}`);

  const tracker = game.getRunPathTrackerState();
  assert(tracker && /落子|借势/.test(tracker.desc || ''), `tracker should include mutation note, got ${JSON.stringify(tracker)}`);

  const payload = JSON.parse(game.renderGameToText());
  assert(payload.player.runPath && payload.player.runPath.mutation && payload.player.runPath.mutation.name === '借势落子', `render_game_to_text should expose run path mutation, got ${JSON.stringify(payload.player.runPath)}`);

  const fallbackGame = Object.create(Game.prototype);
  const fallbackPlayer = new Player('linFeng');
  fallbackPlayer.game = fallbackGame;
  fallbackPlayer.setRunPath('shatter');
  fallbackPlayer.realm = 6;
  fallbackGame.player = fallbackPlayer;
  fallbackGame.map = null;
  fallbackGame.autoSave = () => {};
  let fallbackApplied = null;
  fallbackGame.showRunPathMutationSelection(6, (result) => {
    fallbackApplied = result;
  });
  assert(fallbackApplied && fallbackApplied.meta && fallbackApplied.meta.id === 'polarize', `missing modal should fall back to first mutation choice, got ${JSON.stringify(fallbackApplied)}`);
  assert(fallbackPlayer.runPathMutationState && fallbackPlayer.runPathMutationState.mutationId === 'polarize', 'fallback selection should still persist mutation state');

  console.log('Run path mutation checks passed.');
})();
