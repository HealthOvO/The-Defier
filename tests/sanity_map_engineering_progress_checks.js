const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const code = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');
  const localStorage = createStorage();
  const sessionStorage = createStorage();

  const ctx = vm.createContext({
    console,
    Math,
    JSON,
    Date,
    window: {},
    localStorage,
    sessionStorage,
    setTimeout: () => 0,
    clearTimeout: () => {},
    alert: () => {},
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({
        style: {},
        dataset: {},
        classList: { add() {}, remove() {}, contains() { return false; } },
        appendChild() {},
        querySelector: () => null,
        querySelectorAll: () => [],
        setAttribute() {},
        addEventListener() {},
        innerHTML: '',
        textContent: ''
      }),
      body: {
        prepend() {}
      }
    },
    Utils: {
      showBattleLog: () => {}
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  vm.runInContext(code, ctx, { filename: 'game.js' });
  const Game = vm.runInContext('Game', ctx);

  const game = Object.create(Game.prototype);
  game.player = {
    realm: 3,
    heavenlyInsight: 0,
    karma: 0,
    currentHp: 82,
    maxHp: 110,
    fateRing: {
      exp: 0,
      checkFateRingLevelUp() {}
    },
    adventureBuffs: {},
    ensureAdventureBuffs() {
      const defaults = {
        firstTurnDrawBoostBattles: 0,
        openingBlockBoostBattles: 0,
        victoryGoldBoostBattles: 0,
        firstTurnEnergyBoostBattles: 0,
        ringExpBoostBattles: 0,
        victoryHealBoostBattles: 0
      };
      this.adventureBuffs = Object.assign({}, defaults, this.adventureBuffs || {});
      return this.adventureBuffs;
    },
    grantAdventureBuff(buffId, charges = 1) {
      const buffs = this.ensureAdventureBuffs();
      if (!Object.prototype.hasOwnProperty.call(buffs, buffId)) return false;
      buffs[buffId] += Math.max(0, Math.floor(Number(charges) || 0));
      return true;
    }
  };

  const defaults = game.createDefaultStrategicEngineeringState();
  assert(defaults.version === 1, `engineering default version should be 1, got ${defaults.version}`);
  assert(defaults.tracks.observatory.progress === 0, `observatory progress should default to 0, got ${defaults.tracks.observatory.progress}`);
  assert(defaults.tracks.memory_rift.tier === 0, `memory rift tier should default to 0, got ${defaults.tracks.memory_rift.tier}`);

  game.player.strategicEngineering = {
    tracks: {
      observatory: { progress: 2 },
      forbidden_altar: { progress: 1 }
    }
  };
  const normalized = game.ensureStrategicEngineeringState();
  assert(normalized.tracks.observatory.tier === 2, `observatory tier should derive from progress=2, got ${normalized.tracks.observatory.tier}`);
  assert(normalized.tracks.forbidden_altar.tier === 1, `forbidden tier should derive from progress=1, got ${normalized.tracks.forbidden_altar.tier}`);
  assert(normalized.tracks.spirit_grotto.progress === 0, 'missing spirit track should be backfilled to zero state');

  game.player.strategicEngineering = game.createDefaultStrategicEngineeringState();

  const observatoryAdvance = game.recordStrategicNodeEngineering('observatory', { realm: 3 });
  assert(observatoryAdvance && observatoryAdvance.advanced === true, 'first observatory visit should advance engineering tier');
  assert(observatoryAdvance.after.tier === 1, `observatory should reach tier 1 after first visit, got ${observatoryAdvance.after.tier}`);
  assert(game.player.heavenlyInsight === 1, `observatory milestone should grant 1 insight, got ${game.player.heavenlyInsight}`);

  const observatorySecond = game.recordStrategicNodeEngineering('observatory', { realm: 3 });
  assert(observatorySecond.after.tier === 2, `second observatory visit should reach tier 2, got ${observatorySecond.after.tier}`);
  const snapshot = game.getStrategicEngineeringSnapshot();
  assert(snapshot.focusTrack && snapshot.focusTrack.trackId === 'observatory', `focus track should lock to observatory, got ${JSON.stringify(snapshot.focusTrack)}`);
  assert(/观星工程/.test(snapshot.summary || ''), `snapshot summary should mention observatory engineering, got ${snapshot.summary}`);
  const observatoryBias = game.getStrategicEngineeringEventBiasProfile();
  assert(observatoryBias && observatoryBias.trackId === 'observatory', `engineering event bias should focus observatory, got ${JSON.stringify(observatoryBias)}`);
  assert(Array.isArray(observatoryBias.eventIds) && observatoryBias.eventIds.includes('starObservation'), `observatory bias should expose starObservation pool entry, got ${JSON.stringify(observatoryBias && observatoryBias.eventIds)}`);
  assert(Number(observatoryBias.biasChance || 0) >= 0.3, `observatory tier 2 bias chance should be >= 0.3, got ${observatoryBias && observatoryBias.biasChance}`);
  assert(/额外货位/.test(observatoryBias.bonusPreview || ''), `observatory event bias should expose preview copy, got ${observatoryBias && observatoryBias.bonusPreview}`);
  const shift = game.getStrategicEngineeringWeightShift();
  assert(Number(shift.observatory || 0) > 0, `engineering weight shift should buff observatory nodes, got ${JSON.stringify(shift)}`);
  assert(Number(shift.event || 0) > 0, `engineering weight shift should buff event nodes, got ${JSON.stringify(shift)}`);

  const forbiddenAdvance = game.recordStrategicNodeEngineering('forbidden_altar', { realm: 3 });
  assert(forbiddenAdvance.after.tier === 1, `first forbidden visit should reach tier 1, got ${forbiddenAdvance.after.tier}`);
  assert(game.player.karma === 1, `forbidden milestone should grant 1 karma, got ${game.player.karma}`);

  const ringExpBeforeRiftAdvance = game.player.fateRing.exp;
  const riftAdvance = game.recordStrategicNodeEngineering('memory_rift', { realm: 4 });
  assert(riftAdvance.after.tier === 1, `first rift visit should reach tier 1, got ${riftAdvance.after.tier}`);
  assert(game.player.fateRing.exp === ringExpBeforeRiftAdvance + 18, `rift milestone should grant 18 ring exp, got ${game.player.fateRing.exp}`);
  const memoryBias = game.getStrategicEngineeringEventBiasProfile();
  assert(memoryBias && memoryBias.trackId === 'memory_rift', `latest advanced engineering should switch event bias focus to memory_rift, got ${JSON.stringify(memoryBias)}`);
  assert(Array.isArray(memoryBias.eventIds) && memoryBias.eventIds.includes('voidRift') && memoryBias.eventIds.includes('floatingMarketRift'), `memory_rift bias should expose rift event pool, got ${JSON.stringify(memoryBias && memoryBias.eventIds)}`);

  const spiritAdvance = game.recordStrategicNodeEngineering('spirit_grotto', { realm: 4 });
  assert(spiritAdvance.after.tier === 1, `first spirit grotto visit should reach tier 1, got ${spiritAdvance.after.tier}`);
  assert(game.player.adventureBuffs.firstTurnDrawBoostBattles === 1, `spirit milestone should grant draw buff, got ${JSON.stringify(game.player.adventureBuffs)}`);

  assert(Array.isArray(game.player.strategicEngineering.history) && game.player.strategicEngineering.history.length >= 4, 'engineering history should record recent advances');
  assert(game.recordStrategicNodeEngineering('enemy', { realm: 4 }) === null, 'non-engineering node types should be ignored');

  console.log('Map engineering progress checks passed.');
})();
