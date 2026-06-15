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
      adventureBuffs: {},
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
      grantAdventureBuff(buffId, charges = 1) {
        this.adventureBuffs[buffId] = (this.adventureBuffs[buffId] || 0) + Math.max(1, Math.floor(Number(charges) || 1));
        return true;
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

  state.eventResults = [];
  state.player.fateRing.path = 'resonance';
  state.player.fateRing.level = 7;
  const echoBeforeExp = state.player.fateRing.exp;
  interrupted = state.executeEventEffect({ type: 'fateRingEcho', exp: 18, charges: 1 });
  assert(interrupted === false, 'fateRingEcho should not interrupt flow');
  assert(state.player.fateRing.exp >= echoBeforeExp + 18, `fateRingEcho should grant ring exp, got ${state.player.fateRing.exp - echoBeforeExp}`);
  assert(state.player.adventureBuffs.openingBlockBoostBattles >= 1, `resonance fateRingEcho should grant opening block buff, got ${JSON.stringify(state.player.adventureBuffs)}`);
  assert(state.eventResults.some((line) => /命环回执/.test(line) && /回响之环/.test(line) && /开场护盾/.test(line)), `fateRingEcho should append readable resonance result, got ${JSON.stringify(state.eventResults)}`);

  state.eventResults = [];
  state.isEndlessActive = () => true;
  state.endlessManager = {
    getEndlessEventTuning: () => ({
      ringExpFlat: 8,
      bonusAdventureBuffCharges: 2
    })
  };
  state.player.fateRing.path = 'wisdom';
  const wisdomBeforeExp = state.player.fateRing.exp;
  const wisdomBeforeDraw = state.player.adventureBuffs.firstTurnDrawBoostBattles || 0;
  interrupted = state.executeEventEffect({ type: 'fateRingEcho', exp: 18, charges: 1 });
  assert(interrupted === false, 'endless wisdom fateRingEcho should not interrupt flow');
  assert(state.player.fateRing.exp >= wisdomBeforeExp + 26, `endless fateRingEcho should include ringExpFlat, got ${state.player.fateRing.exp - wisdomBeforeExp}`);
  assert((state.player.adventureBuffs.firstTurnDrawBoostBattles || 0) >= wisdomBeforeDraw + 3, `endless wisdom fateRingEcho should include extra buff charges, got ${JSON.stringify(state.player.adventureBuffs)}`);
  assert(state.eventResults.some((line) => /智慧之环/.test(line) && /首回合抽牌 \+3 场/.test(line)), `wisdom fateRingEcho should append tuned draw result, got ${JSON.stringify(state.eventResults)}`);
  assert(state.eventResults.some((line) => /额外命环经验 \+8/.test(line)), `endless fateRingEcho should append ring exp tuning result, got ${JSON.stringify(state.eventResults)}`);
  assert(state.eventResults.some((line) => /额外层数 \+2/.test(line)), `endless fateRingEcho should append buff charge tuning result, got ${JSON.stringify(state.eventResults)}`);

  state.eventResults = [];
  state.isEndlessActive = () => false;
  state.endlessManager = null;
  state.player.fateRing.path = 'defiance';
  interrupted = state.executeEventEffect({ type: 'fateRingEcho', exp: 5, charges: 1 });
  assert(interrupted === false, 'defiance fateRingEcho should not interrupt flow');
  assert(state.eventResults.some((line) => /逆天之环/.test(line) && /首回合灵力/.test(line)), `defiance fateRingEcho should use defiance profile, got ${JSON.stringify(state.eventResults)}`);
  assert(!state.eventResults.some((line) => /觉醒命环/.test(line)), `defiance fateRingEcho should not fall back to awakened copy, got ${JSON.stringify(state.eventResults)}`);

  console.log('Event flow checks passed.');
})();
