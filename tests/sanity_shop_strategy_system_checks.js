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
  const ctx = vm.createContext({
    console,
    window: {},
    Math,
    JSON,
    Date,
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    Utils: {
      showBattleLog: () => {},
      createCardElement: () => ({ classList: { add: () => {} }, addEventListener: () => {} })
    },
    TREASURES: {
      mock_treasure: { id: 'mock_treasure', name: '试炼古印', icon: '🏺', description: '测试法宝', rarity: 'rare' }
    },
    CARDS: {
      demonDoubt: { id: 'demonDoubt', name: '心魔·疑心', rarity: 'special', type: 'status', cost: -1, description: '测试诅咒' }
    },
    cloneCardTemplate: (id) => ({ id, name: id === 'demonDoubt' ? '心魔·疑心' : id, rarity: 'rare', type: 'status', cost: -1 }),
    getRandomCard: (rarity = 'common') => ({
      id: `mock_${rarity}_${Math.floor(Math.random() * 10000)}`,
      name: `Mock ${rarity}`,
      rarity,
      type: 'attack',
      cost: 1,
      description: `mock ${rarity}`
    }),
    canUpgradeCard: () => false
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/game.js'));
  loadFile(ctx, path.join(root, 'js/core/map.js'));

  const Game = vm.runInContext('Game', ctx);
  const GameMap = vm.runInContext('GameMap', ctx);
  assert(typeof Game === 'function', 'Game should exist');
  assert(typeof GameMap === 'function', 'GameMap should exist');

  const harness = {
    player: {
      gold: 500,
      heavenlyInsight: 4,
      karma: 3,
      realm: 4,
      maxHp: 72,
      currentHp: 54,
      characterId: 'linFeng',
      deck: [],
      collectedTreasures: [],
      addCardToDeck(card) {
        this.deck.push(card);
      },
      addTreasure(id) {
        this.collectedTreasures.push({ id, name: '试炼古印' });
        return true;
      },
      grantAdventureBuff(buffId, charges = 1) {
        this.adventureBuffs = this.adventureBuffs || {};
        this.adventureBuffs[buffId] = (this.adventureBuffs[buffId] || 0) + charges;
      }
    },
    shopCatalog: null,
    shopActiveTab: 'base',
    shopItems: [],
    shopServices: [],
    showRewardModal: () => {},
    showShopForbiddenDraft: () => {},
    generateShopData() {
      return {
        items: [{ type: 'card', card: { id: 'mock_common', name: 'Mock Common', rarity: 'common' }, price: 60, sold: false }],
        services: [{ id: 'heal', type: 'service', name: '灵丹妙药', price: 30, sold: false }]
      };
    },
    isEndlessActive: () => false,
    getEndlessModifiers: () => ({ shopPriceMul: 1, rewardRareChance: 0 }),
    getWeightedRandomTreasure: () => ({ id: 'mock_treasure', name: '试炼古印', rarity: 'rare' }),
    renderShop: () => {}
  };

  [
    'normalizeShopRumors',
    'ensureShopRumors',
    'pushShopRumorHistory',
    'getStrategicCurrencyAmount',
    'getStrategicCurrencyLabel',
    'getStrategicCurrencyIcon',
    'formatShopPrice',
    'canAffordShopItem',
    'spendShopPrice',
    'getShopPriceMultiplier',
    'generateContractShopServices',
    'generateRumorShopServices',
    'generateShopCatalog',
    'syncActiveShopTab',
    'getShopRumorSummaryText',
    'grantStrategicCurrencies',
    'getBattleStrategicCurrencyRewards',
    'consumeRewardRumorBoost',
    'consumeTreasureRumorBoost',
    'setNextRealmMapRumor',
    'getPendingRouteRumorProfile',
    'consumePendingRouteRumorProfile',
    'applyServiceEffect'
  ].forEach((name) => {
    harness[name] = Game.prototype[name];
  });

  harness.player.shopRumors = harness.normalizeShopRumors();

  const catalog = harness.generateShopCatalog();
  assert(!!catalog.base && !!catalog.contract && !!catalog.rumor, 'shop catalog should expose three tabs');
  assert(catalog.contract.services.some((service) => service.id === 'doomIdol'), 'contract tab should contain doomIdol');
  assert(catalog.rumor.services.some((service) => service.id === 'rumorRareDraft'), 'rumor tab should contain rumorRareDraft');

  harness.shopCatalog = catalog;
  harness.shopActiveTab = 'contract';
  const activeContractTab = harness.syncActiveShopTab();
  assert(activeContractTab.id === 'contract', 'syncActiveShopTab should activate contract tab');
  assert(Array.isArray(harness.shopServices) && harness.shopServices.length >= 3, 'contract tab should expose services');

  const rumorPriceOk = harness.canAffordShopItem({ price: 2, currency: 'insight' });
  const karmaPriceOk = harness.canAffordShopItem({ price: 2, currency: 'karma' });
  assert(rumorPriceOk && karmaPriceOk, 'multi-currency affordability should work');
  harness.spendShopPrice({ price: 1, currency: 'insight' });
  harness.spendShopPrice({ price: 1, currency: 'karma' });
  assert(harness.player.heavenlyInsight === 3, `expected insight 3, got ${harness.player.heavenlyInsight}`);
  assert(harness.player.karma === 2, `expected karma 2, got ${harness.player.karma}`);

  const rareRumorResult = harness.applyServiceEffect({ id: 'rumorRareDraft', type: 'service', price: 1, currency: 'insight' });
  assert(rareRumorResult === true, 'rumorRareDraft should resolve immediately');
  assert(harness.player.shopRumors.rewardRareCharges >= 2, 'rumorRareDraft should add rare reward charges');
  const rumorBonus = harness.consumeRewardRumorBoost();
  assert(rumorBonus >= 0.3, `expected rare rumor bonus >=0.3, got ${rumorBonus}`);
  assert(harness.player.shopRumors.rewardRareCharges >= 1, 'consumeRewardRumorBoost should decrement charges');

  const treasureRumorResult = harness.applyServiceEffect({ id: 'rumorTreasureTrail', type: 'service', price: 2, currency: 'insight' });
  assert(treasureRumorResult === true, 'rumorTreasureTrail should resolve immediately');
  const treasureBonus = harness.consumeTreasureRumorBoost('elite');
  assert(treasureBonus >= 0.22, `expected treasure rumor bonus >=0.22, got ${treasureBonus}`);

  const routeRumorResult = harness.applyServiceEffect({ id: 'rumorUtilityRoute', type: 'service', price: 2, currency: 'insight' });
  assert(routeRumorResult === true, 'rumorUtilityRoute should resolve immediately');
  const pendingRoute = harness.getPendingRouteRumorProfile(5);
  assert(!!pendingRoute && pendingRoute.label.includes('机缘'), 'route rumor should target next realm with label');

  const doomIdolResult = harness.applyServiceEffect({ id: 'doomIdol', type: 'service', price: 2, currency: 'karma' });
  assert(doomIdolResult === true, 'doomIdol should resolve immediately');
  assert(harness.player.deck.some((card) => card && card.id === 'demonDoubt'), 'doomIdol should add demonDoubt to deck');
  assert(harness.player.collectedTreasures.length >= 1, 'doomIdol should grant a treasure');

  const battleRewards = harness.getBattleStrategicCurrencyRewards('elite');
  assert(battleRewards.insight >= 1 && battleRewards.karma >= 1, 'elite battles should award insight and karma');
  const granted = harness.grantStrategicCurrencies(battleRewards, '测试战利');
  assert(granted.insight >= 1 && granted.karma >= 1, 'grantStrategicCurrencies should apply battle rewards');

  const mapHarness = {
    game: harness,
    getPreferredArchetypeId: () => null,
    getFateRingPath: () => null,
    applyFatePathNodeBias: () => {},
    applyRouteDiversityPressure: () => {},
    applyLongTermDiversityPressure: () => {},
    applyNodePityPressure: () => {},
    normalizeNodeWeights: GameMap.prototype.normalizeNodeWeights
  };
  const weightsWithRumor = GameMap.prototype.getDynamicNodeWeights.call(mapHarness, 2, 8, 5, {
    currentRowNodes: [],
    previousRowNodes: [],
    previousTwoRowNodes: []
  });
  harness.consumePendingRouteRumorProfile(5);
  const weightsWithoutRumor = GameMap.prototype.getDynamicNodeWeights.call(mapHarness, 2, 8, 5, {
    currentRowNodes: [],
    previousRowNodes: [],
    previousTwoRowNodes: []
  });
  assert(weightsWithRumor.event > weightsWithoutRumor.event, 'utility route rumor should increase event weight for target realm');
  assert(weightsWithRumor.shop > weightsWithoutRumor.shop, 'utility route rumor should increase shop weight for target realm');

  console.log('Shop strategy system checks passed.');
})();
