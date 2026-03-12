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
  const storage = {};
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
      getItem: (key) => (Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null),
      setItem: (key, value) => {
        storage[key] = String(value);
      }
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    Utils: {
      showBattleLog: () => {},
      createCardElement: () => ({ classList: { add: () => {} }, addEventListener: () => {} }),
      showCardDetail: () => {}
    },
    LAWS: {
      thunderLaw: { id: 'thunderLaw', name: '雷律', rarity: 'rare', element: 'thunder', description: '雷霆之律' },
      flameTruth: { id: 'flameTruth', name: '火理', rarity: 'rare', element: 'fire', description: '火焰真理' },
      iceFreeze: { id: 'iceFreeze', name: '霜凝', rarity: 'rare', element: 'ice', description: '冰霜之律' }
    },
    LAW_RESONANCES: {
      plasmaOverload: {
        id: 'plasmaOverload',
        name: '雷火崩坏',
        laws: ['thunderLaw', 'flameTruth'],
        description: 'test'
      },
      extremeTemp: {
        id: 'extremeTemp',
        name: '极温爆裂',
        laws: ['flameTruth', 'iceFreeze'],
        description: 'test'
      }
    },
    TREASURE_CONFIG: { unlockRealm: { vitality_stone: 1, soul_banner: 2, heaven_shard: 17 } },
    TREASURES: {
      vitality_stone: { id: 'vitality_stone', name: '生机石', rarity: 'common' },
      soul_banner: { id: 'soul_banner', name: '魂幡', rarity: 'rare' },
      heaven_shard: { id: 'heaven_shard', name: '天道碎片', rarity: 'mythic' }
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/game.js'));
  const Game = vm.runInContext('Game', ctx);
  assert(typeof Game === 'function', 'Game should exist');

  const harness = {
    player: {
      currentHp: 18,
      maxHp: 60,
      gold: 180,
      heavenlyInsight: 3,
      karma: 2,
      deck: [
        { id: 'a1', type: 'attack', cost: 1 },
        { id: 'a2', type: 'attack', cost: 1 },
        { id: 'a3', type: 'attack', cost: 2 },
        { id: 'd1', type: 'defense', cost: 1 }
      ],
      collectedLaws: [{ id: 'thunderLaw' }, { id: 'flameTruth' }],
      fateRing: {
        getSocketedLaws: () => ['thunderLaw', 'flameTruth']
      }
    },
    shopNode: { id: 'shop_1', row: 2, type: 'shop' },
    map: {
      getAccessibleNodes: () => [{ id: 'elite_1', row: 3, type: 'elite' }, { id: 'event_1', row: 3, type: 'event' }]
    },
    shopItems: [
      { type: 'card', sold: false, price: 65, currency: 'gold', card: { id: 'new_attack', name: '雷闪', type: 'attack', cost: 1 } }
    ],
    shopServices: [
      { id: 'heal', type: 'service', name: '灵丹妙药', price: 30, currency: 'gold', sold: false },
      { id: 'remove', type: 'service', name: '净化仪式', price: 75, currency: 'gold', sold: false }
    ],
    treasureCompendiumFilterState: { status: 'all', rarities: [], sources: [] },
    treasureCompendiumFilter: 'all',
    treasureCompendiumSort: 'rarity_desc',
    treasureCompendiumPresetStorageKey: 'theDefierTreasureCompendiumPresetsV1',
    treasureCompendiumPresetCache: null,
    showTreasureCompendium: () => {}
  };

  [
    'getLawRelatedResonances',
    'getLawResonanceAvailability',
    'getLawReadinessActions',
    'normalizeTreasureCompendiumFilterState',
    'getTreasureCompendiumFilterState',
    'getTreasureSource',
    'getTreasureSourceTags',
    'getTreasureCompendiumQuickFilterValue',
    'getTreasureCompendiumFilterLabels',
    'getTreasureCompendiumPresetStorageKey',
    'serializeTreasureCompendiumFilterState',
    'getTreasureCompendiumPresets',
    'persistTreasureCompendiumPresets',
    'getTreasureCompendiumPresetSummary',
    'saveTreasureCompendiumPreset',
    'applyTreasureCompendiumPreset',
    'clearTreasureCompendiumFilters',
    'isTreasureCompendiumPresetActive',
    'getTreasureCompendiumPresetLabel',
    'toggleTreasureCompendiumFilterChip',
    'passesTreasureCompendiumFilter',
    'buildPlayerDeckProfile',
    'getStrategicCurrencyAmount',
    'getStrategicCurrencyLabel',
    'canAffordShopItem',
    'evaluateShopCardDeckFit',
    'evaluateShopServiceFit',
    'getMapNodeTypeLabel',
    'getShopNextNodeForecast',
    'buildShopSpendRecommendation'
  ].forEach((name) => {
    harness[name] = Game.prototype[name];
  });

  const resonanceState = harness.getLawResonanceAvailability({ id: 'thunderLaw' });
  assert(Array.isArray(resonanceState) && resonanceState[0].state === 'active', `expected active resonance, got ${JSON.stringify(resonanceState)}`);
  const readinessActions = harness.getLawReadinessActions({
    resonance: ctx.LAW_RESONANCES.extremeTemp,
    state: 'near',
    missingCollected: ['iceFreeze'],
    missingSocketed: ['iceFreeze']
  });
  assert(readinessActions.some((action) => action.type === 'law' && action.lawId === 'iceFreeze'), 'readiness actions should expose missing law jump');

  harness.toggleTreasureCompendiumFilterChip('status', 'owned');
  harness.toggleTreasureCompendiumFilterChip('rarity', 'rare');
  harness.toggleTreasureCompendiumFilterChip('source', 'shop');
  const filterState = harness.getTreasureCompendiumFilterState();
  assert(filterState.status === 'owned', `expected owned status, got ${filterState.status}`);
  assert(filterState.rarities.includes('rare'), `expected rare rarity filter, got ${JSON.stringify(filterState.rarities)}`);
  assert(filterState.sources.includes('shop'), `expected shop source filter, got ${JSON.stringify(filterState.sources)}`);
  assert(
    harness.passesTreasureCompendiumFilter({ id: 'soul_banner', data: ctx.TREASURES.soul_banner, isOwned: true }) === true,
    'rare owned shop treasure should pass combined filter'
  );
  assert(
    harness.passesTreasureCompendiumFilter({ id: 'heaven_shard', data: ctx.TREASURES.heaven_shard, isOwned: true }) === false,
    'mythic boss-only treasure should fail rare+shop filter'
  );

  harness.saveTreasureCompendiumPreset(0);
  harness.clearTreasureCompendiumFilters();
  assert(harness.treasureCompendiumFilter === 'all', 'clearTreasureCompendiumFilters should reset quick filter');
  assert(harness.applyTreasureCompendiumPreset(0) === true, 'saved preset should be loadable');
  assert(harness.getTreasureCompendiumFilterState().rarities.includes('rare'), 'preset should restore rarity filter');
  assert(harness.isTreasureCompendiumPresetActive(0) === true, 'restored preset should become active');
  assert(/预设 1/.test(harness.getTreasureCompendiumPresetLabel(0)), 'preset label should be generated');

  const eliteForecast = harness.getShopNextNodeForecast();
  assert(eliteForecast && eliteForecast.primaryType === 'elite', `expected elite forecast, got ${JSON.stringify(eliteForecast)}`);

  const lowHpAdvice = harness.buildShopSpendRecommendation();
  assert(lowHpAdvice.action === '更适合买服务', `expected service advice at low hp, got ${JSON.stringify(lowHpAdvice)}`);
  assert(/下一批节点/.test(lowHpAdvice.reason), 'service advice should include node forecast hint');

  harness.player.currentHp = 56;
  harness.map.getAccessibleNodes = () => [{ id: 'rest_1', row: 3, type: 'rest' }, { id: 'event_1', row: 3, type: 'event' }];
  const highHpAdvice = harness.buildShopSpendRecommendation();
  assert(highHpAdvice.action === '更适合买卡', `expected card advice at high hp, got ${JSON.stringify(highHpAdvice)}`);

  harness.player.gold = 50;
  harness.map.getAccessibleNodes = () => [{ id: 'boss_1', row: 3, type: 'boss' }];
  const saveAdvice = harness.buildShopSpendRecommendation();
  assert(saveAdvice.action === '建议留钱', `expected save advice before boss with tight gold, got ${JSON.stringify(saveAdvice)}`);

  console.log('Planning todo checks passed.');
})();
