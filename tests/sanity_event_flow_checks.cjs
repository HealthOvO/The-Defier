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

  const ctx = vm.createContext({
    console,
    Math,
    JSON,
    Date,
    setTimeout: (fn) => {
      fn();
      return 0;
    },
    clearTimeout: () => {},
    window: {},
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    Utils: {
      showBattleLog: () => {}
    },
    ENEMIES: {
      bandit: { id: 'bandit', hp: 10, patterns: [] }
    },
    TREASURES: {
      t1: { id: 't1', name: 'Treasure1' },
      t2: { id: 't2', name: 'Treasure2' }
    },
    LAWS: {
      law1: { id: 'law1', name: 'Law1' }
    },
    CARDS: {
      strike: { id: 'strike', name: 'Strike' }
    },
    getRandomEnemy: () => ({ id: 'bandit', hp: 10, patterns: [] }),
    getRandomCard: () => ({ id: 'strike', name: 'Strike' }),
    FATE_RING: { levels: { 1: { slots: 2, exp: 0 } } }
  });

  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/managers/EventManager.js'));
  loadFile(ctx, path.join(root, 'js/managers/MetaProgressionManager.js'));
    loadFile(ctx, path.join(root, 'js/managers/EndlessManager.js'));
    loadFile(ctx, path.join(root, 'js/managers/RunManager.js'));
    loadFile(ctx, path.join(root, 'js/managers/SeasonBoardManager.js'));
    loadFile(ctx, path.join(root, 'js/managers/SanctumAgendaManager.js'));
    loadFile(ctx, path.join(root, 'js/managers/ShopManager.js'));
    loadFile(ctx, path.join(root, 'js/managers/SaveManager.js'));
    loadFile(ctx, path.join(root, 'js/core/player.js'));
    loadFile(ctx, path.join(root, 'js/core/map.js'));
    loadFile(ctx, path.join(root, 'js/core/events.js'));
    loadFile(ctx, path.join(root, 'js/core/achievements.js'));
    loadFile(ctx, path.join(root, 'js/core/fateRing.js'));
    loadFile(ctx, path.join(root, 'js/game.js'));
  loadFile(ctx, path.join(root, 'js/views/EventView.js'));
  loadFile(ctx, path.join(root, 'js/views/RewardView.js'));

  const Game = vm.runInContext('Game', ctx);

  const state = {
    player: {
      gold: 100,
      heavenlyInsight: 0,
      maxHp: 20,
      currentHp: 20,
      deck: [{ id: 'strike', name: 'Strike', type: 'attack', upgraded: false }],
      fateRing: { exp: 0, level: 0, name: '', path: '', initSlots() {} },
      permaBuffs: { strength: 0, defense: 0, energy: 0, maxHp: 0, draw: 0 },
      takeDamage(v) {
        this.currentHp -= v;
      },
      heal(v) {
        this.currentHp += v;
      },
      addTreasure(t) {
        this._lastTreasure = t;
      },
      addPermaBuff(stat, val) {
        this.permaBuffs[stat] = (this.permaBuffs[stat] || 0) + val;
      },
      addCardToDeck(card) {
        this.deck.push(card);
      },
      addTreasure(id) {
        this._lastTreasure = id;
        return true;
      },
      hasTreasure(id) {
        return id === 't1';
      },
      collectLaw() {
        return true;
      },
      checkFateRingLevelUp() {}
    },
    eventView: {
      showEventUpgradeCard: () => {
        state.upgradedCalled = true;
        state.closeModalCalled = true;
      }
    },
    eventResults: [],
    closeModalCalled: false,
    upgradedCalled: false,
    startedBattle: null,
    trialMode: null,
    currentScreen: 'map-screen',
    closeModal() {
      this.closeModalCalled = true;
    },
    showEventUpgradeCard() {
      this.upgradedCalled = true;
    },
    startBattle(enemies, node) {
      this.startedBattle = { enemies, node };
    },
    handleRunPathProgress(eventType, amount, context) {
      this.lastRunPathProgressCall = { eventType, amount, context };
      return true;
    },
    currentBattleNode: { id: 1 },
    achievementSystem: { updateStat: () => {} }
  };

  state.executeEventEffect = (effect) => Game.prototype.executeEventEffect.call(state, effect);

  let interrupted = state.executeEventEffect({ type: 'permaBuff', stat: 'strength', value: 2 });
  assert(interrupted === false, 'permaBuff should not interrupt flow');
  assert(state.player.permaBuffs.strength === 2, 'permaBuff should apply');

  state.eventResults = [];
  interrupted = state.executeEventEffect({ type: 'treasure', random: true });
  assert(interrupted === false, 'treasure should not interrupt flow');
  assert(state.player._lastTreasure === 't2', 'treasure random should pick unowned treasure and call addTreasure');

  interrupted = state.executeEventEffect({ type: 'upgradeCard' });
  assert(interrupted === true, 'upgradeCard should interrupt flow');
  assert(state.closeModalCalled === true, 'upgradeCard should close modal');
  assert(state.upgradedCalled === true, 'upgradeCard should open upgrade UI');

  interrupted = state.executeEventEffect({ type: 'trial', trialType: 'speedKill' });
  assert(interrupted === true, 'trial should interrupt flow');
  assert(state.startedBattle && Array.isArray(state.startedBattle.enemies), 'trial should start battle with enemy array');

  state.startedBattle = null;
  interrupted = state.executeEventEffect({
    type: 'random',
    options: [{ type: 'battle', enemyId: 'bandit', chance: 1 }]
  });
  assert(interrupted === true, 'random battle should propagate interrupt');
  assert(state.startedBattle && state.startedBattle.enemies && state.startedBattle.enemies.id === 'bandit', 'random battle should start target enemy');

  state.eventResults = [];
  interrupted = state.executeEventEffect({ type: 'heavenlyInsight', value: 2 });
  assert(interrupted === false, 'heavenlyInsight should not interrupt flow');
  assert(state.player.heavenlyInsight === 2, `heavenlyInsight should apply, got ${state.player.heavenlyInsight}`);

  state.eventResults = [];
  state.player.getRunPathMeta = () => ({
    id: 'insight',
    name: '窥命流',
    currentPhase: { eventType: 'playSkillCard' }
  });
  interrupted = state.executeEventEffect({ type: 'runPathProgress', amount: 1 });
  assert(interrupted === false, 'runPathProgress should not interrupt flow');
  assert(state.lastRunPathProgressCall && state.lastRunPathProgressCall.eventType === 'playSkillCard', `runPathProgress should forward current phase event type, got ${JSON.stringify(state.lastRunPathProgressCall)}`);
  assert(state.lastRunPathProgressCall && state.lastRunPathProgressCall.context && state.lastRunPathProgressCall.context.force === true, 'runPathProgress should force event-side progression');
  assert(state.eventResults.some((line) => line.includes('命途推进')), `runPathProgress should append event result, got ${JSON.stringify(state.eventResults)}`);

  console.log('Event flow checks passed.');
})();
