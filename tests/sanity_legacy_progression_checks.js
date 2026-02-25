const fs = require('fs');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(function run() {
  const code = fs.readFileSync('/Users/health/workspace/The Defier/js/game.js', 'utf8');
  const storage = {};

  const ctx = vm.createContext({
    console,
    window: {},
    document: {
      addEventListener: () => {},
      querySelectorAll: () => [],
      getElementById: () => null
    },
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null),
      setItem: (k, v) => {
        storage[k] = String(v);
      }
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
    Utils: {
      showBattleLog: () => {}
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  vm.runInContext(code, ctx, { filename: 'game.js' });
  const Game = vm.runInContext('Game', ctx);

  // 1) Save migration should attach legacyProgress
  const migrated = Game.prototype.migrateSaveData.call({
    featureFlags: {
      combatDepthV2: true,
      pvpRuleSyncV2: true,
      mapNodeTrialForge: true
    }
  }, {
    version: '5.0.0',
    player: { currentHp: 50, deck: [{ id: 'strike' }] },
    map: { nodes: [], currentNodeIndex: -1, completedNodes: [] }
  });

  assert(migrated.legacyProgress && migrated.legacyProgress.essence === 0, 'migration should create legacyProgress');
  assert(migrated.legacyProgress.spent === 0, 'migration should initialize legacy spent');

  // 2) Normalize should clamp invalid values
  const normalizeHost = {
    getLegacyDefaults: Game.prototype.getLegacyDefaults,
    legacyUpgradeCatalog: Game.prototype.getLegacyUpgradeCatalog.call({})
  };
  const normalized = Game.prototype.normalizeLegacyProgress.call(normalizeHost, {
    essence: 10,
    spent: 99,
    upgrades: { vitalitySeed: 99 }
  });
  assert(normalized.spent === 10, 'normalize should clamp spent <= essence');
  assert(normalized.upgrades.vitalitySeed === 3, 'normalize should clamp upgrade level');

  // 3) Bonus aggregation should respect selected levels
  const bonusHost = {
    legacyUpgradeCatalog: normalizeHost.legacyUpgradeCatalog,
    legacyProgress: {
      essence: 30,
      spent: 18,
      upgrades: {
        vitalitySeed: 2,
        spiritPouch: 1,
        battleInsight: 1,
        forgemind: 2,
        mindLibrary: 1
      }
    },
    getLegacyUpgradeLevel(upgradeId) {
      return Game.prototype.getLegacyUpgradeLevel.call(this, upgradeId);
    }
  };
  const bonuses = Game.prototype.getLegacyBonuses.call(bonusHost);
  assert(bonuses.startMaxHp === 12, 'vitality bonus mismatch');
  assert(bonuses.startGold === 30, 'gold bonus mismatch');
  assert(bonuses.firstTurnDrawBonus === 1, 'first-turn draw bonus mismatch');
  assert(Math.abs(bonuses.forgeCostDiscount - 0.12) < 0.0001, 'forge discount bonus mismatch');
  assert(bonuses.startDraw === 1, 'start draw bonus mismatch');

  // 4) Purchase flow should consume unspent essence and level up
  const buyHost = {
    legacyStorageKey: 'theDefierLegacyV1',
    legacyUpgradeCatalog: normalizeHost.legacyUpgradeCatalog,
    legacyProgress: { essence: 20, spent: 0, upgrades: {} },
    getLegacyDefaults: Game.prototype.getLegacyDefaults,
    normalizeLegacyProgress: Game.prototype.normalizeLegacyProgress,
    getLegacyUpgradeById(upgradeId) {
      return Game.prototype.getLegacyUpgradeById.call(this, upgradeId);
    },
    getLegacyUpgradeLevel(upgradeId) {
      return Game.prototype.getLegacyUpgradeLevel.call(this, upgradeId);
    },
    getLegacyUpgradeCost(upgradeId, targetLevel = null) {
      return Game.prototype.getLegacyUpgradeCost.call(this, upgradeId, targetLevel);
    },
    getLegacyUnspentEssence() {
      return Game.prototype.getLegacyUnspentEssence.call(this);
    },
    saveLegacyProgress() {
      return Game.prototype.saveLegacyProgress.call(this);
    }
  };
  const bought = Game.prototype.buyLegacyUpgrade.call(buyHost, 'vitalitySeed');
  assert(bought === true, 'buy should succeed when enough essence');
  assert(buyHost.legacyProgress.upgrades.vitalitySeed === 1, 'buy should increase level');
  assert(buyHost.legacyProgress.spent === 4, 'buy should consume correct essence');

  // 4.5) Preset flow should auto-allocate and persist last preset
  const presetHost = {
    legacyStorageKey: 'theDefierLegacyV1',
    legacyUpgradeCatalog: normalizeHost.legacyUpgradeCatalog,
    legacyProgress: { essence: 40, spent: 0, upgrades: {}, lastPreset: null },
    getLegacyDefaults: Game.prototype.getLegacyDefaults,
    normalizeLegacyProgress: Game.prototype.normalizeLegacyProgress,
    getLegacyPresetCatalog() {
      return Game.prototype.getLegacyPresetCatalog.call(this);
    },
    getLegacyUpgradeById(upgradeId) {
      return Game.prototype.getLegacyUpgradeById.call(this, upgradeId);
    },
    getLegacyUpgradeLevel(upgradeId) {
      return Game.prototype.getLegacyUpgradeLevel.call(this, upgradeId);
    },
    getLegacyUpgradeCost(upgradeId, targetLevel = null) {
      return Game.prototype.getLegacyUpgradeCost.call(this, upgradeId, targetLevel);
    },
    getLegacyUnspentEssence() {
      return Game.prototype.getLegacyUnspentEssence.call(this);
    },
    saveLegacyProgress() {
      return Game.prototype.saveLegacyProgress.call(this);
    },
    buyLegacyUpgrade(upgradeId, options = {}) {
      return Game.prototype.buyLegacyUpgrade.call(this, upgradeId, options);
    }
  };
  const presetResult = Game.prototype.applyLegacyPreset.call(presetHost, 'smith', { resetFirst: true });
  assert(presetResult.success === true, 'preset apply should succeed');
  assert(presetHost.legacyProgress.lastPreset === 'smith', 'preset apply should persist last preset id');
  assert(presetHost.legacyProgress.spent > 0, 'preset apply should spend essence');
  assert((presetHost.legacyProgress.upgrades.forgemind || 0) > 0, 'smith preset should allocate forge upgrade');

  // 4.6) Run doctrine mapping should match preset identity
  const doctrineHost = {};
  const doctrineSmith = Game.prototype.getLegacyRunDoctrineForPreset.call(doctrineHost, 'smith');
  const doctrineTempo = Game.prototype.getLegacyRunDoctrineForPreset.call(doctrineHost, 'tempo');
  assert(doctrineSmith.firstForgeExtraUpgradeOnce === 1, 'smith doctrine should grant first forge boost');
  assert(doctrineTempo.firstAttackBonusPerBattle === 3, 'tempo doctrine should grant first attack bonus');

  const doctrineApplyHost = {
    getLegacyRunDoctrineForPreset(presetId) {
      return Game.prototype.getLegacyRunDoctrineForPreset.call(this, presetId);
    }
  };
  const doctrinePlayer = {};
  Game.prototype.applyLegacyRunDoctrine.call(doctrineApplyHost, doctrinePlayer, 'survivor');
  assert(doctrinePlayer.legacyRunDoctrine.openingBattleBlockBonus === 4, 'applyLegacyRunDoctrine should write survivor opening block');

  // 4.7) Run mission mapping/progress should reward essence once
  const missionHost = {};
  const missionSmith = Game.prototype.getLegacyMissionForPreset.call(missionHost, 'smith');
  assert(missionSmith && missionSmith.eventType === 'forgeComplete', 'smith mission should track forge completion');

  const missionApplyHost = {
    getLegacyMissionForPreset(presetId) {
      return Game.prototype.getLegacyMissionForPreset.call(this, presetId);
    }
  };
  const missionPlayer = {};
  Game.prototype.applyLegacyRunMission.call(missionApplyHost, missionPlayer, 'tempo');
  assert(missionPlayer.legacyRunMission.eventType === 'tempoFirstStrike', 'applyLegacyRunMission should write tempo mission');

  const progressHost = {
    player: {
      legacyRunMission: {
        ...missionSmith
      }
    },
    rewardTotal: 0,
    awardLegacyEssence(amount) {
      this.rewardTotal += amount;
      return amount;
    }
  };
  const progressed = Game.prototype.handleLegacyMissionProgress.call(progressHost, 'forgeComplete', 1);
  assert(progressed === true, 'mission progress should accept matching event');
  assert(progressHost.player.legacyRunMission.completed === true, 'mission should mark completed at target');
  assert(progressHost.player.legacyRunMission.rewardGranted === true, 'mission should mark reward granted');
  assert(progressHost.rewardTotal === missionSmith.rewardEssence, 'mission should award configured essence exactly once');

  // 5) Reset should fully refund spent points
  const resetHost = {
    legacyProgress: {
      essence: 20,
      spent: 9,
      upgrades: { spiritPouch: 1 }
    },
    saveLegacyProgressCalled: false,
    saveLegacyProgress() {
      this.saveLegacyProgressCalled = true;
    },
    initInheritanceScreen: () => {},
    showConfirmModal(_msg, onConfirm) {
      onConfirm();
    }
  };
  Game.prototype.resetLegacyUpgrades.call(resetHost);
  assert(resetHost.legacyProgress.spent === 0, 'reset should clear spent');
  assert(Object.keys(resetHost.legacyProgress.upgrades).length === 0, 'reset should clear levels');
  assert(resetHost.saveLegacyProgressCalled === true, 'reset should persist progress');

  // 6) Applying bonuses should write to player and grant starting gold
  let recalcTriggered = false;
  const applyHost = {
    getLegacyBonuses: () => ({ startMaxHp: 12, startGold: 30, startDraw: 1, firstTurnDrawBonus: 1, forgeCostDiscount: 0.12 })
  };
  const player = {
    gold: 100,
    maxHp: 80,
    currentHp: 40,
    recalculateStats: () => {
      recalcTriggered = true;
      player.maxHp = 92;
    }
  };
  Game.prototype.applyLegacyBonusesToPlayer.call(applyHost, player);
  assert(recalcTriggered === true, 'apply bonuses should trigger stat recalculation');
  assert(player.gold === 130, 'apply bonuses should grant start gold');
  assert(player.currentHp === 92, 'apply bonuses should refill hp after recalculation');

  console.log('Legacy progression sanity checks passed.');
})();
