const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(function run() {
  const code = fs.readFileSync(path.resolve(__dirname, '../js/game.js'), 'utf8');
  const ctx = vm.createContext({
    console,
    window: {},
    Math,
    JSON,
    Date,
    setTimeout: () => 0,
    clearTimeout: () => {},
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: () => null
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  vm.runInContext(code, ctx, { filename: 'game.js' });
  const Game = vm.runInContext('Game', ctx);
  assert(typeof Game === 'function', 'Game class should exist');

  const harness = {
    featureFlags: { endlessModeV1: true },
    unlockedRealms: [1, 2, 3, 4, 5, 6, 7, 8],
    player: {
      maxRealmReached: 8
    },
    endlessState: null
  };
  [
    'createDefaultEndlessState',
    'normalizeEndlessState',
    'ensureEndlessState',
    'isEndlessUnlocked',
    'isEndlessActive',
    'getEndlessMutatorPool',
    'getEndlessPhaseProfile',
    'getEndlessCycleThemeProfile',
    'getEndlessModifiers',
    'getEndlessPressureBehaviorProfile'
  ].forEach((name) => {
    harness[name] = Game.prototype[name];
  });

  harness.endlessState = harness.createDefaultEndlessState();
  harness.endlessState.unlocked = true;
  harness.endlessState.active = true;
  harness.endlessState.currentCycle = 9;
  harness.endlessState.activeMutators = [];

  let last = null;
  for (let pressure = 0; pressure <= 9; pressure += 1) {
    harness.endlessState.pressure = pressure;
    const mods = harness.getEndlessModifiers();
    const profile = harness.getEndlessPressureBehaviorProfile();

    assert(mods.enemyHpMul >= 1, `enemyHpMul should be valid at pressure=${pressure}`);
    assert(mods.enemyAtkMul >= 1, `enemyAtkMul should be valid at pressure=${pressure}`);
    assert(mods.rewardGoldMul >= 1, `rewardGoldMul should be valid at pressure=${pressure}`);
    assert(mods.healMul >= 0.45 && mods.healMul <= 1.35, `healMul should remain clamped at pressure=${pressure}`);
    assert(mods.cycleTheme && mods.cycleTheme.id, `cycle theme metadata should exist at pressure=${pressure}`);

    if (last) {
      assert(mods.enemyHpMul >= last.mods.enemyHpMul, `enemyHpMul should be non-decreasing (${last.pressure} -> ${pressure})`);
      assert(mods.enemyAtkMul >= last.mods.enemyAtkMul, `enemyAtkMul should be non-decreasing (${last.pressure} -> ${pressure})`);
      assert(mods.rewardGoldMul >= last.mods.rewardGoldMul, `rewardGoldMul should be non-decreasing (${last.pressure} -> ${pressure})`);
      assert(mods.healMul <= last.mods.healMul, `healMul should be non-increasing (${last.pressure} -> ${pressure})`);

      assert(
        profile.enemyOpeningBlock >= last.profile.enemyOpeningBlock,
        `opening block should be non-decreasing (${last.pressure} -> ${pressure})`
      );
      assert(
        profile.enemyOpeningStrength >= last.profile.enemyOpeningStrength,
        `opening strength should be non-decreasing (${last.pressure} -> ${pressure})`
      );
      assert(
        profile.extraAttackPatterns >= last.profile.extraAttackPatterns,
        `extra attack patterns should be non-decreasing (${last.pressure} -> ${pressure})`
      );
    }

    if (pressure <= 2) {
      assert(profile.tierId === 'calm', `pressure ${pressure} should map to calm tier`);
    } else if (pressure <= 5) {
      assert(profile.tierId === 'tense', `pressure ${pressure} should map to tense tier`);
    } else if (pressure <= 7) {
      assert(profile.tierId === 'hazard', `pressure ${pressure} should map to hazard tier`);
    } else {
      assert(profile.tierId === 'cataclysm', `pressure ${pressure} should map to cataclysm tier`);
    }
    assert(profile.themeId && profile.themeSegmentIndex >= 1, `pressure profile should expose theme metadata at pressure=${pressure}`);

    last = { pressure, mods, profile };
  }

  console.log('Endless pressure curve checks passed.');
})();
