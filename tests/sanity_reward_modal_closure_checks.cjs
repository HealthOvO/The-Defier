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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createModal(id) {
  const state = new Set(['active']);
  return {
    id,
    onCloseCallback: null,
    classList: {
      contains(name) {
        return state.has(name);
      },
      add(name) {
        state.add(name);
      },
      remove(name) {
        state.delete(name);
      }
    }
  };
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
  const rewardModal = createModal('reward-modal');
  const genericModal = createModal('generic-confirm-modal');

  const ctx = vm.createContext({
    console,
    Math,
    JSON,
    Date,
    window: {},
    document: {
      addEventListener: () => {},
      getElementById: (id) => {
        if (id === 'reward-modal') return rewardModal;
        if (id === 'generic-confirm-modal') return genericModal;
        if (id === 'purification-modal') return null;
        return null;
      },
      querySelector: () => null,
      querySelectorAll: (selector) => {
        if (selector === '.modal') return [rewardModal, genericModal];
        return [];
      },
      createElement: () => ({ classList: { add: () => {} }, appendChild: () => {} })
    },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => {},
    alert: () => {},
    Utils: {
      showBattleLog: () => {},
      random: (min) => min,
      shuffle: (arr) => arr.slice(),
      getCanonicalElement: () => 'none'
    },
    CHARACTERS: { linFeng: { name: 'linFeng', deck: [] } },
    SKILLS: {},
    STARTER_DECK: [],
    LAWS: {},
    TREASURES: {},
    ENEMIES: {},
    BOSS_MECHANICS: {},
    ACHIEVEMENTS: {},
    RUN_PATHS: {},
    RUN_DESTINIES: {},
    RUN_VOWS: {},
    SPIRIT_COMPANIONS: {},
    FATE_RING: {},
    EXPEDITION_SYSTEMS: {},
    CHALLENGE_RULES: {},
    PVPService: {}
  });
  ctx.window = ctx;
  ctx.global = ctx;

  [
    'js/data/cards.js',
    'js/data/laws.js',
    'js/data/treasures.js',
    'js/data/enemies.js',
    'js/data/boss_mechanics.js',
    'js/data/achievements.js',
    'js/data/run_paths.js',
    'js/data/run_destinies.js',
    'js/data/run_vows.js',
    'js/data/spirit_companions.js',
    'js/data/fate_ring.js',
    'js/data/challenge_rules.js',
    'js/data/expedition_systems.js',
    'js/core/fateRing.js',
    'js/core/player.js',
    'js/managers/EventManager.js',
    'js/managers/MetaProgressionManager.js',
    'js/managers/EndlessManager.js',
    'js/managers/RunManager.js',
    'js/managers/SeasonBoardManager.js',
    'js/managers/SanctumAgendaManager.js',
    'js/managers/ShopManager.js',
    'js/managers/SaveManager.js',
    'js/core/map.js',
    'js/core/events.js',
    'js/core/achievements.js',
    'js/ui/battle-hud.js',
    'js/ui/battle-feedback.js',
    'js/views/EventView.js',
    'js/views/RewardView.js',
    'js/game.js',
    'js/core/challenge_hub.js',
    'js/core/expedition_hub.js',
    'js/core/collection_hub.js'
  ].forEach((file) => loadFile(ctx, path.join(root, file)));

  const Game = vm.runInContext('Game', ctx);
  const EventView = vm.runInContext('EventView', ctx);
  const RewardView = vm.runInContext('RewardView', ctx);const game = Object.create(Game.prototype);

  if (typeof game.attachHubControllers === 'function') game.attachHubControllers();
  try { game.eventView = new EventView(game); } catch(e){}
  try { game.rewardView = new RewardView(game); } catch(e){}

  let rewardClosed = 0;
  rewardModal.onCloseCallback = () => {
    rewardClosed += 1;
  };

  game.closeModal();
  assert(rewardClosed === 1, `closing active reward modal should invoke callback exactly once, got ${rewardClosed}`);
  assert(!rewardModal.classList.contains('active'), 'reward modal should become inactive after closeModal');
  assert(!genericModal.classList.contains('active'), 'generic modal should also close through closeModal');

  game.closeModal();
  assert(rewardClosed === 1, 'reward modal callback should not fire again after it was already consumed');

  console.log('Reward modal closure checks passed.');
})();
