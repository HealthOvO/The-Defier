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
    setTimeout: (fn) => {
      if (typeof fn === 'function') fn();
      return 0;
    },
    clearTimeout: () => {},
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: () => null
    },
    Utils: {
      showBattleLog: () => {},
      shuffle: (arr) => arr.slice()
    },
    getRandomCard: (rarity = 'common') => ({
      id: `mock_${rarity}_${Math.floor(Math.random() * 1000)}`,
      name: `Mock ${rarity}`,
      rarity,
      type: 'attack',
      cost: 1
    })
  });
  ctx.window = ctx;
  ctx.global = ctx;

  vm.runInContext(code, ctx, { filename: 'game.js' });
  const Game = vm.runInContext('Game', ctx);
  assert(typeof Game === 'function', 'Game class should exist');

  const calls = {
    rewardModal: 0,
    blessingDraft: 0
  };

  const harness = {
    featureFlags: { endlessModeV1: true },
    unlockedRealms: [1, 2, 3, 4, 5, 6, 7, 8],
    endlessState: null,
    player: {
      maxRealmReached: 8,
      realm: 8,
      maxHp: 120,
      currentHp: 90,
      gold: 1200,
      characterId: 'linFeng',
      adventureBuffs: {},
      fateRing: {
        exp: 0
      },
      heal(amount) {
        this.currentHp = Math.min(this.maxHp, this.currentHp + Math.max(0, Math.floor(amount || 0)));
      },
      addCardToDeck(card) {
        this.deck = Array.isArray(this.deck) ? this.deck : [];
        this.deck.push(card);
      },
      grantAdventureBuff(buffId, charges = 1) {
        this.adventureBuffs = this.adventureBuffs || {};
        this.adventureBuffs[buffId] = Math.max(0, Math.floor(this.adventureBuffs[buffId] || 0)) + Math.max(1, Math.floor(charges || 1));
        return true;
      },
      checkFateRingLevelUp() {}
    },
    showRewardModal() {
      calls.rewardModal += 1;
    },
    showShopEndlessBlessingSelection() {
      calls.blessingDraft += 1;
    }
  };

  [
    'createDefaultEndlessState',
    'normalizeEndlessState',
    'ensureEndlessState',
    'isEndlessUnlocked',
    'isEndlessActive',
    'getEndlessMutatorPool',
    'rollNextEndlessMutator',
    'getEndlessBoonPool',
    'getEndlessBoonChoices',
    'applyEndlessBoon',
    'getEndlessPhaseProfile',
    'getEndlessCycleThemeProfile',
    'getEndlessSeasonCatalog',
    'getEndlessWeekMeta',
    'getEndlessSeasonProfile',
    'syncEndlessSeasonState',
    'getEndlessModifiers',
    'getEndlessEventTuning',
    'getTemporaryEventShopOffers',
    'applyTemporaryEventShopOffer',
    'applyServiceEffect'
  ].forEach((name) => {
    harness[name] = Game.prototype[name];
  });

  harness.endlessState = harness.createDefaultEndlessState();
  harness.endlessState.unlocked = true;
  harness.endlessState.active = true;
  harness.endlessState.currentCycle = 8;
  harness.endlessState.pressure = 6;
  harness.endlessState.activeMutators = ['war_market', 'void_tax', 'trial_inferno'];
  const seasonSeed = harness.syncEndlessSeasonState({
    cycleOverride: harness.endlessState.currentCycle,
    dateOverride: '2026-03-16T00:00:00.000Z'
  });
  assert(seasonSeed && seasonSeed.id, 'season state should seed successfully for shop checks');
  const endlessMods = harness.getEndlessModifiers();
  assert(endlessMods.endlessSeason && endlessMods.endlessSeason.directiveId, 'shop checks should run with season directive metadata');

  // 1) 无尽词缀应影响临时商会货架（更多选项 + 无尽专属货品 + 救援券）
  const offers = harness.getTemporaryEventShopOffers({ offerCount: 3 });
  assert(Array.isArray(offers) && offers.length >= 4, `expected >=4 offers, got ${offers ? offers.length : 'null'}`);
  assert(offers.some((offer) => offer && offer.id === 'temp_relief'), 'void_tax should force relief offer in temporary shop');
  assert(
    offers.some((offer) => offer && (offer.id === 'temp_refit' || offer.id === 'temp_boon')),
    'endless temporary shop should include at least one endless-exclusive offer'
  );

  // 2) 临时商会无尽重配应可生效
  const refitText = harness.applyTemporaryEventShopOffer({ id: 'temp_refit' });
  const afterMutators = harness.ensureEndlessState().activeMutators.slice();
  assert(/重配/.test(refitText), `temp_refit should return refit message, got: ${refitText}`);
  assert(afterMutators.length > 0 && afterMutators.length <= 3, 'temp_refit should keep active mutator list in valid range');
  assert(typeof harness.ensureEndlessState().lastMutatorId === 'string', 'temp_refit should refresh lastMutatorId');

  // 3) 临时商会无尽祷札应落地赐福
  const beforeHistory = harness.ensureEndlessState().boonHistory.length;
  const boonText = harness.applyTemporaryEventShopOffer({ id: 'temp_boon' });
  const afterHistory = harness.ensureEndlessState().boonHistory.length;
  assert(/赐福/.test(boonText), `temp_boon should apply a boon, got: ${boonText}`);
  assert(afterHistory === beforeHistory + 1, 'temp_boon should append boon history');

  // 4) 商店轮回祷告改为“策略选择”（延迟结算）
  const blessingResult = harness.applyServiceEffect({
    id: 'endlessBlessing',
    type: 'service',
    name: '轮回祷告',
    price: 210
  });
  assert(blessingResult === 'deferred', `endlessBlessing service should be deferred, got ${blessingResult}`);
  assert(calls.blessingDraft === 1, 'endlessBlessing should open blessing selection flow once');

  // 5) 商店相位校准应仍可执行且反馈弹窗生效
  const refitServiceResult = harness.applyServiceEffect({
    id: 'endlessRefit',
    type: 'service',
    name: '相位校准',
    price: 170
  });
  assert(refitServiceResult === true, 'endlessRefit service should succeed in endless mode');
  assert(calls.rewardModal >= 1, 'endlessRefit should trigger reward modal feedback');

  // 6) 新增稳压服务应能降低压力并恢复
  const beforePressure = harness.ensureEndlessState().pressure;
  const beforeHp = harness.player.currentHp;
  const stabilizerResult = harness.applyServiceEffect({
    id: 'endlessStabilizer',
    type: 'service',
    name: '轮回稳压',
    price: 160
  });
  const afterPressure = harness.ensureEndlessState().pressure;
  assert(stabilizerResult === true, 'endlessStabilizer should succeed in endless mode');
  assert(afterPressure <= Math.max(0, beforePressure - 1), 'endlessStabilizer should reduce pressure');
  assert(harness.player.currentHp >= beforeHp, 'endlessStabilizer should heal player');

  // 7) 新增过载服务应提高压力并注入赐福
  harness.endlessState.pressure = 2;
  const overclockBeforePressure = harness.ensureEndlessState().pressure;
  const overclockBeforeHistory = harness.ensureEndlessState().boonHistory.length;
  const overclockResult = harness.applyServiceEffect({
    id: 'endlessOverclock',
    type: 'service',
    name: '轮回过载',
    price: 188
  });
  const overclockAfterPressure = harness.ensureEndlessState().pressure;
  const overclockAfterHistory = harness.ensureEndlessState().boonHistory.length;
  assert(overclockResult === true, 'endlessOverclock should succeed in endless mode');
  assert(overclockAfterPressure >= Math.min(9, overclockBeforePressure + 1), 'endlessOverclock should increase pressure');
  assert(overclockAfterHistory === overclockBeforeHistory + 1, 'endlessOverclock should append boon history');

  // 8) 智慧教义应降低商会价格并提高“秘法现货”出现稳定性
  harness.player.getPathDoctrineProfile = () => ({
    path: 'wisdom',
    tier: 3,
    shopOfferBonus: 1,
    shopPriceMultiplier: 0.88
  });
  const offersWithWisdom = harness.getTemporaryEventShopOffers({ offerCount: 3, forceRelief: false });
  assert(
    offersWithWisdom.some((offer) => offer && offer.id === 'temp_card'),
    'wisdom doctrine should enforce temp_card availability in temporary shop'
  );
  const cardPrice = offersWithWisdom.find((offer) => offer && offer.id === 'temp_card')?.price || 9999;
  delete harness.player.getPathDoctrineProfile;
  const offersWithoutWisdom = harness.getTemporaryEventShopOffers({ offerCount: 3, forceRelief: false });
  const fallbackCardOffer = offersWithoutWisdom.find((offer) => offer && offer.id === 'temp_card');
  if (fallbackCardOffer) {
    assert(cardPrice <= fallbackCardOffer.price, 'wisdom doctrine should not increase temp_card price');
  }

  console.log('Endless shop service checks passed.');
})();
