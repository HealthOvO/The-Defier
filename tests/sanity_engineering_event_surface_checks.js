const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadFile(ctx, filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, ctx, { filename: filePath });
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

function createEventContext() {
  const mathObj = Object.create(Math);
  const ctx = vm.createContext({
    console,
    Math: mathObj,
    JSON,
    Date,
    window: {},
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    Utils: {
      random: (min) => min,
      shuffle: (arr) => arr.slice(),
      showBattleLog: () => {}
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;
  return ctx;
}

function createGameContext() {
  const elements = {
    'event-modal': {
      dataset: { eventTone: 'chapter' },
      classList: {
        add() {},
        remove() {},
        contains(value) {
          return value === 'active';
        }
      }
    },
    'event-title': { textContent: '灰契账页' },
    'event-atmosphere': { textContent: '裂隙账页正在重写这次抉择的回报。' },
    'event-system-summary': { textContent: '工程：🪞 裂隙工程 II阶 · 偏置命中' }
  };

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
      getElementById: (id) => elements[id] || null,
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
  return ctx;
}

function sumChoiceEffect(choice, effectType) {
  return (choice?.effects || []).reduce((total, effect) => (
    effect.type === effectType ? total + (Number(effect.value) || 0) : total
  ), 0);
}

(function run() {
  const root = path.resolve(__dirname, '..');

  {
    const ctx = createEventContext();
    loadFile(ctx, path.join(root, 'js/data/events.js'));
    const getRandomEvent = vm.runInContext('getRandomEvent', ctx);

    ctx.window.game = {
      player: { deck: [] },
      getStrategicEngineeringSnapshot: () => ({
        focusTrack: {
          trackId: 'memory_rift',
          tier: 2,
          tierLabel: 'II阶',
          name: '裂隙工程',
          icon: '🪞',
          effectSummary: '裂隙工程已经与当前路线并轨'
        },
        activeTracks: [
          {
            trackId: 'memory_rift',
            tier: 2,
            tierLabel: 'II阶',
            name: '裂隙工程',
            icon: '🪞',
            effectSummary: '裂隙工程已经与当前路线并轨'
          }
        ],
        summary: '裂隙工程 II阶'
      })
    };
    ctx.window.__ALLOW_DEBUG_EVENT_HOOKS__ = true;

    const eventChecks = [
      {
        eventId: 'ashLedgerTrial',
        assertEvent(evt) {
          assert(
            evt.choices[0].effects.some((effect) => effect.type === 'ringExp' && Number(effect.value) >= 12)
              && evt.choices[0].effects.some((effect) => effect.type === 'gold' && Number(effect.value) >= 8),
            `ashLedgerTrial cash-out should gain ringExp + gold, got ${JSON.stringify(evt.choices[0].effects)}`
          );
          assert(
            sumChoiceEffect(evt.choices[1], 'ringExp') > 45
              && evt.choices[1].effects.some((effect) => effect.type === 'adventureBuff' && effect.buffId === 'ringExpBoostBattles'),
            `ashLedgerTrial steady note should gain extra ringExp + ringExp buff, got ${JSON.stringify(evt.choices[1].effects)}`
          );
        }
      },
      {
        eventId: 'convergenceRitual',
        assertEvent(evt) {
          assert(
            evt.choices[0].effects.some((effect) => effect.type === 'ringExp' && Number(effect.value) >= 12)
              && evt.choices[0].effects.some((effect) => effect.type === 'gold' && Number(effect.value) >= 6),
            `convergenceRitual converge option should gain ringExp + gold, got ${JSON.stringify(evt.choices[0].effects)}`
          );
          assert(
            sumChoiceEffect(evt.choices[1], 'ringExp') > 45
              && sumChoiceEffect(evt.choices[1], 'gold') > 90,
            `convergenceRitual dismantle option should gain extra ringExp + gold, got ${JSON.stringify(evt.choices[1].effects)}`
          );
        }
      },
      {
        eventId: 'frontierContractBoard',
        assertEvent(evt) {
          assert(
            evt.choices[0].effects.some((effect) => effect.type === 'gold' && Number(effect.value) >= 8)
              && evt.choices[0].effects.some((effect) => effect.type === 'adventureBuff' && effect.buffId === 'ringExpBoostBattles'),
            `frontierContractBoard contract option should gain gold + ringExp buff, got ${JSON.stringify(evt.choices[0].effects)}`
          );
          assert(
            sumChoiceEffect(evt.choices[1], 'gold') > 20
              && sumChoiceEffect(evt.choices[1], 'ringExp') > 15,
            `frontierContractBoard observe option should gain extra gold + ringExp, got ${JSON.stringify(evt.choices[1].effects)}`
          );
        }
      }
    ];

    eventChecks.forEach((check) => {
      ctx.window.__debugEventQueue = [check.eventId];
      const evt = getRandomEvent();
      assert(evt && evt.id === check.eventId, `expected forced event ${check.eventId}, got ${evt ? evt.id : 'null'}`);
      assert(
        evt.engineeringEventMeta
          && evt.engineeringEventMeta.trackId === 'memory_rift'
          && evt.engineeringEventMeta.selectedByEngineeringBias === false,
        `forced ${check.eventId} should still expose memory_rift engineering meta, got ${JSON.stringify(evt && evt.engineeringEventMeta)}`
      );
      check.assertEvent(evt);
    });
  }

  {
    const ctx = createGameContext();
    loadFile(ctx, path.join(root, 'js/game.js'));
    const Game = vm.runInContext('Game', ctx);

    const game = Object.create(Game.prototype);
    [
      'getStrategicEngineeringCatalog',
      'createDefaultStrategicEngineeringState',
      'resolveStrategicEngineeringTier',
      'normalizeStrategicEngineering',
      'ensureStrategicEngineeringState',
      'getStrategicEngineeringTrackSnapshot',
      'getStrategicEngineeringSnapshot',
      'getStrategicEngineeringEventBiasProfile',
      'buildEventChoiceEffectSummary',
      'getEventNarrativePresentation',
      'renderGameToText'
    ].forEach((name) => {
      game[name] = Game.prototype[name];
    });

    game.currentScreen = 'map-screen';
    game.player = {
      realm: 4,
      currentHp: 88,
      maxHp: 110,
      block: 0,
      currentEnergy: 3,
      baseEnergy: 3,
      hand: [],
      drawPile: [],
      discardPile: [],
      stance: 'neutral',
      strategicEngineering: {
        version: 1,
        lastAdvancedTrackId: 'memory_rift',
        history: ['🪞 裂隙工程推进至 II阶'],
        tracks: {
          observatory: { progress: 0, tier: 0, lastRealm: 0 },
          spirit_grotto: { progress: 0, tier: 0, lastRealm: 0 },
          forbidden_altar: { progress: 0, tier: 0, lastRealm: 0 },
          memory_rift: { progress: 2, tier: 2, lastRealm: 4 }
        }
      }
    };
    game.map = {
      getAccessibleNodeRiskForecast: () => ({ topRisk: null }),
      getAccessibleNodes: () => []
    };
    game.currentBattleNode = null;
    game.currentEvent = {
      engineeringEventMeta: {
        trackId: 'memory_rift',
        name: '裂隙工程',
        icon: '🪞',
        tier: 2,
        tierLabel: 'II阶',
        summary: '裂隙工程已经与当前路线并轨，改写构筑与裂隙补给收益进一步抬升。',
        effectSummary: '改写构筑与裂隙补给收益进一步抬升。',
        source: 'engineering-bias',
        selectedByEngineeringBias: true
      }
    };
    game.getChapterDisplaySnapshot = () => ({
      chapterIndex: 2,
      name: '碎誓外域',
      stageLabel: '第二段',
      dangerProfile: null,
      nemesis: null,
      skyOmen: null,
      leyline: null
    });
    game.getChapterEventLedgerSnapshot = () => ({
      totalEntries: 0,
      entries: [],
      counters: {},
      recentTags: []
    });
    game.getLegacyUnspentEssence = () => 0;
    game.legacyProgress = { essence: 0, upgrades: {} };

    const payload = JSON.parse(game.renderGameToText());
    assert(
      payload.map
        && payload.map.chapter
        && payload.map.chapter.engineeringEventBias
        && payload.map.chapter.engineeringEventBias.trackId === 'memory_rift',
      `render_game_to_text should expose engineering event bias profile, got ${JSON.stringify(payload.map && payload.map.chapter)}`
    );
    assert(
      Array.isArray(payload.map.chapter.engineeringEventBias.eventIds)
        && payload.map.chapter.engineeringEventBias.eventIds.includes('ashLedgerTrial')
        && payload.map.chapter.engineeringEventBias.eventIds.includes('frontierContractBoard'),
      `engineering event bias profile should expose expanded memory_rift event ids, got ${JSON.stringify(payload.map.chapter.engineeringEventBias)}`
    );
    assert(
      payload.eventModal
        && payload.eventModal.engineeringEventMeta
        && payload.eventModal.engineeringEventMeta.trackId === 'memory_rift'
        && payload.eventModal.engineeringEventMeta.selectedByEngineeringBias === true,
      `eventModal payload should mirror engineering event meta, got ${JSON.stringify(payload.eventModal)}`
    );

    const presentation = game.getEventNarrativePresentation(
      {
        id: 'ashLedgerTrial',
        summary: '裂隙账页',
        description: '账页正在预支收益。',
        engineeringEventMeta: game.currentEvent.engineeringEventMeta,
        choices: [{ effects: [{ type: 'ringExp', value: 47 }] }]
      },
      { type: 'event' }
    );
    assert(
      Array.isArray(presentation.summaryItems)
        && presentation.summaryItems.some((item) => /工程：/.test(item))
        && presentation.summaryItems.some((item) => /联动：/.test(item)),
      `event narrative presentation should surface engineering lines, got ${JSON.stringify(presentation)}`
    );
  }

  console.log('Engineering event surface checks passed.');
})();
