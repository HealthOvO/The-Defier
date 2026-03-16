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

  const eventCtx = vm.createContext({
    console,
    Math: Object.create(Math),
    JSON,
    Date,
    window: {},
    document: {},
    Utils: {}
  });
  eventCtx.window = eventCtx;
  eventCtx.global = eventCtx;
  eventCtx.Math.random = () => 0;
  loadFile(eventCtx, path.join(root, 'js/data/events.js'));
  const getRandomEvent = vm.runInContext('getRandomEvent', eventCtx);
  eventCtx.game = {
    player: {
      getRunPathMeta() {
        return {
          id: 'insight',
          phaseIndex: 1,
          progress: { completedPhases: ['insight_opening'], completed: false },
          eventPool: ['runPathInsightAstrolabe', 'ancientLibrary', 'starObservation']
        };
      }
    }
  };
  const event = getRandomEvent();
  assert(event && event.id === 'runPathInsightAstrolabe', `run path event bias should prefer dedicated insight event first, got ${event && event.id}`);
  eventCtx.game.player.getRunPathMeta = () => ({
    id: 'insight',
    phaseIndex: 1,
    progress: { completedPhases: ['insight_opening'], completed: false },
    eventPool: ['runPathInsightAstrolabe', 'ancientLibrary'],
    mutationEventPool: ['runPathInsightPivotGambit']
  });
  const mutationEvent = getRandomEvent();
  assert(mutationEvent && mutationEvent.id === 'runPathInsightPivotGambit', `mutation run path bias should prefer mutation event first, got ${mutationEvent && mutationEvent.id}`);

  const EVENTS = vm.runInContext('EVENTS', eventCtx);
  [
    'runPathShatterBounty',
    'runPathBulwarkSanctuary',
    'runPathInsightAstrolabe',
    'runPathShatterPolarizeEdict',
    'runPathShatterPivotLedger',
    'runPathShatterSacrificePyre',
    'runPathBulwarkPolarizeBastion',
    'runPathBulwarkPivotDrill',
    'runPathBulwarkSacrificeAnvil',
    'runPathInsightPolarizeAtlas',
    'runPathInsightPivotGambit',
    'runPathInsightSacrificeOracle'
  ].forEach((eventId) => {
    const eventMeta = EVENTS[eventId];
    assert(eventMeta, `missing dedicated run path event: ${eventId}`);
    assert(Array.isArray(eventMeta.choices) && eventMeta.choices.length >= 2, `run path event should expose choices: ${eventId}`);
    assert(
      eventMeta.choices.some((choice) => Array.isArray(choice.effects) && choice.effects.some((effect) => effect.type === 'runPathProgress')),
      `run path event should include path progression effect: ${eventId}`
    );
  });

  const gameCtx = vm.createContext({
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
    }
  });
  gameCtx.window = gameCtx;
  gameCtx.global = gameCtx;
  [
    'js/data/run_paths.js',
    'js/game.js'
  ].forEach((file) => loadFile(gameCtx, path.join(root, file)));
  const Game = vm.runInContext('Game', gameCtx);
  const game = Object.create(Game.prototype);
  game.player = {
    gold: 500,
    heavenlyInsight: 6,
    karma: 2,
    realm: 3,
    maxHp: 90,
    currentHp: 62,
    characterId: 'linFeng',
    removeCount: 0,
    deck: [],
    fateRing: { exp: 0 },
    shopRumors: null,
    getRunPathMeta() {
      return game.getRunPathMetaById('insight');
    },
    getTreasureResearchEntry() {
      return {
        role: { tier: 'core', label: '核心件', summary: '承担套装上限或器灵灌注位。' },
        setMeta: { id: 'xingheng', label: '星衡', icon: '✨', theme: '节奏 / 回能 / 命环联动', twoPiece: '', threePiece: '' },
        setLabel: '星衡',
        setPieces: 2,
        focusTags: ['回能调度', '法则编织'],
        workshopLines: ['重铸方向：继续提高过牌与回能的容错。'],
        infusionNote: '适合把器灵效果挂在回能轴上。',
        infusionEligible: true
      };
    },
    getTreasureWorkshopResearchOverview() {
      return {
        setProgress: [
          { id: 'xingheng', label: '星衡', icon: '✨', owned: 2, total: 3, pieces: 2, resonanceStage: 'resonant', resonanceLabel: '2件已成型' },
          { id: 'wuxing', label: '五行', icon: '☯️', owned: 1, total: 3, pieces: 1, resonanceStage: 'forming', resonanceLabel: '待成型' }
        ],
        coreOwned: 1,
        coreTotal: 4,
        formOwned: 2,
        formTotal: 5,
        activeReforges: 1,
        activeInfusions: 1,
        activeSetEchoes: 0,
        activeWorkshops: 2,
        resonantSets: 1,
        fullSets: 0,
        readyInfusions: ['星衡']
      };
    },
    getTreasureSetLabel(setId) {
      return { xingheng: '星衡', wuxing: '五行' }[setId] || setId;
    }
  };
  game.getTreasureSource = () => '商店 / 精英';
  game.generateShopData = () => ({
    items: [],
    services: [{ id: 'heal', type: 'service', name: '灵丹妙药', price: 30, sold: false }]
  });
  game.isEndlessActive = () => false;
  game.getEndlessModifiers = () => ({ shopPriceMul: 1 });
  game.getRunPathMetaById = Game.prototype.getRunPathMetaById;
  game.getRunPathShopProfile = Game.prototype.getRunPathShopProfile;
  game.injectRunPathShopServices = Game.prototype.injectRunPathShopServices;
  game.normalizeShopRumors = Game.prototype.normalizeShopRumors;
  game.ensureShopRumors = Game.prototype.ensureShopRumors;
  game.getShopPriceMultiplier = Game.prototype.getShopPriceMultiplier;
  game.generateRumorShopServices = Game.prototype.generateRumorShopServices;
  game.generateContractShopServices = Game.prototype.generateContractShopServices;
  game.getStrategicCurrencyAmount = Game.prototype.getStrategicCurrencyAmount;

  const catalog = Game.prototype.generateShopCatalog.call(game);
  assert(catalog.base.services.some((service) => service.id === 'runPathInsightAtlas'), 'shop catalog should inject insight-exclusive base service');
  assert(catalog.rumor.services.some((service) => service.id === 'runPathInsightRumor'), 'shop catalog should inject insight-exclusive rumor service');
  const insightPool = game.getRunPathMetaById('insight');
  assert(Array.isArray(insightPool.eventPool) && insightPool.eventPool[0] === 'runPathInsightAstrolabe', `insight event pool should start with dedicated event, got ${JSON.stringify(insightPool.eventPool)}`);
  assert(insightPool.bossMatchups && insightPool.bossMatchups.bosses?.banditLeader?.fitLabel === '观符下刀', `insight run path should carry boss matchup data, got ${JSON.stringify(insightPool.bossMatchups)}`);
  const shatterPool = game.getRunPathMetaById('shatter');
  assert(Array.isArray(shatterPool.eventPool) && shatterPool.eventPool[0] === 'runPathShatterBounty', `shatter event pool should start with dedicated event, got ${JSON.stringify(shatterPool.eventPool)}`);
  const bulwarkPool = game.getRunPathMetaById('bulwark');
  assert(Array.isArray(bulwarkPool.eventPool) && bulwarkPool.eventPool[0] === 'runPathBulwarkSanctuary', `bulwark event pool should start with dedicated event, got ${JSON.stringify(bulwarkPool.eventPool)}`);
  assert(Array.isArray(insightPool.mutations?.pivot?.mutationEventPool) && insightPool.mutations.pivot.mutationEventPool.includes('runPathInsightPivotGambit'), `insight pivot mutation should expose dedicated event id, got ${JSON.stringify(insightPool.mutations?.pivot)}`);

  const research = Game.prototype.getTreasureResearchData.call(game, {
    id: 'astral_forge_core',
    name: '星衡炉心',
    description: '回合开始获得灵力并抽牌',
    rarity: 'legendary',
    setTag: 'xingheng'
  });
  assert(research.runPathSynergy && research.runPathSynergy.active === true, 'treasure research should mark favored set as active run path synergy');
  assert(/窥命流/.test(research.buildFitText), `treasure research should mention current run path, got ${research.buildFitText}`);

  const overview = Game.prototype.getTreasureResearchOverviewData.call(game);
  assert(Array.isArray(overview.spotlight) && overview.spotlight.some((line) => /当前命途推荐/.test(line)), 'treasure overview should surface run path recommendation');

  const battleCtx = vm.createContext({
    console,
    Math,
    JSON,
    Date,
    performance: { now: () => 0 },
    setTimeout: (fn) => {
      if (typeof fn === 'function') fn();
      return 1;
    },
    clearTimeout: () => {},
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      createElement: () => ({
        style: {},
        className: '',
        appendChild: () => {},
        remove: () => {},
        set innerHTML(v) { this._html = v; },
        get innerHTML() { return this._html || ''; }
      }),
      body: { appendChild: () => {} }
    },
    window: {},
    global: {},
    BOSS_MECHANICS: {
      banditLeader: { mechanics: { description: '试炼封签会持续锁住你的节奏。' }, countersBy: ['mirrorShield'] }
    },
    TREASURES: {
      mirrorShield: { name: '照影镜盾' }
    },
    Utils: {
      showBattleLog: () => {},
      addShakeEffect: () => {},
      addFlashEffect: () => {},
      createFloatingText: () => {}
    }
  });
  battleCtx.window = battleCtx;
  battleCtx.global = battleCtx;
  loadFile(battleCtx, path.join(root, 'js/core/battle.js'));
  const Battle = vm.runInContext('Battle', battleCtx);
  const battle = new Battle({
    player: {
      getRunPathMeta() {
        return {
          id: 'insight',
          name: '窥命流',
          icon: '🔮',
          bossCounterplay: {
            chipLabel: '命途·先看后打',
            focus: '先看清记忆点，再决定把高价值牌放在哪个回合。',
            counter: '尽量把调序、抽牌与回复留到能避开 Boss 复诵或封锁的窗口。',
            reward: '只要牌序不被 Boss 牵着走，三幕机制会被你拆成可控样本。'
          },
          bossMatchups: {
            mechanics: {
              summon: {
                fit: 'pivot',
                fitLabel: '先读后清',
                focus: '窥命流不怕多信息，但怕被召唤物拖慢本体处理节奏。',
                counter: '先确认召唤节拍，再决定是拆小怪还是继续压本体。',
                reward: '读清召唤周期后，你能把每个窗口都打得更干净。'
              }
            },
            chapters: {
              final_court: {
                fit: 'advantage',
                fitLabel: '终章排式',
                focus: '终焉命庭会把多轴联动一起拉上台面，而窥命流最擅长的正是先排好整道终章答卷。',
                counter: '先确认命格、誓约、法则和法宝哪一轴还没接上，再用调序把终末牌序排成真正的标准答案。',
                reward: '当终章顺着你的牌序出题时，天道级 Boss 也会被拆成可读的分段题。'
              }
            },
            memories: {
              seal_card: {
                fit: 'advantage',
                fitLabel: '顺势控样',
                focus: '封签题正适合窥命流，先确认谁会吃封锁，再安排真正的高价值牌。',
                counter: '用边角牌承接封签，把抽牌、回复和启动牌留到安全回合。',
                reward: '只要封签顺着你的计划落下，它反而会暴露 Boss 的节拍。'
              }
            },
            bosses: {
              banditLeader: {
                fit: 'advantage',
                fitLabel: '观符下刀',
                focus: '山寨头目的封签更像一道牌序题，只要先看清谁会吃印，就能顺势拆掉。',
                counter: '别急着交高价值技能，先用低价值牌试探，再在安全回合打满收益。',
                reward: '当封签落在杂牌上时，这位 Boss 的整套题会瞬间变浅。'
              }
            }
          }
        };
      }
    },
    getChapterDisplaySnapshot() {
      return {
        id: 'final_court',
        name: '终焉命庭',
        fullName: '第6章·终焉命庭',
        skyOmen: {
          name: '终焉问命',
          desc: '命格、誓约、法则与法宝的联动会被同时拉到台前。'
        },
        leyline: {
          name: '编庭法脉',
          desc: '多系统协同越完整，终章给出的答卷空间越大。'
        }
      };
    }
  });
  const state = battle.createBossThreeActState({
    id: 'banditLeader',
    name: '封签试体',
    isBoss: true,
    maxHp: 100,
    patterns: [{ type: 'attack', value: 10, intent: '⚔️' }],
    phaseConfig: []
  });
  const chips = battle.resolveBossActCounterChips({
    state,
    act: state.acts[0]
  });
  assert(state.runPathCounterplay && /观符下刀/.test(state.runPathCounterplay.fitLabel || ''), `boss three-act state should resolve boss-specific fit label, got ${JSON.stringify(state.runPathCounterplay)}`);
  assert(state.runPathCounterplay && /终焉命庭/.test(state.runPathCounterplay.chapterCue || ''), `boss three-act state should include chapter cue, got ${JSON.stringify(state.runPathCounterplay)}`);
  assert(state.runPathCounterplay && /多轴|终章/.test(state.runPathCounterplay.chapterFocus || ''), `boss three-act state should include chapter environment focus, got ${JSON.stringify(state.runPathCounterplay)}`);
  assert(state.runPathCounterplay && /山寨头目|封签/.test(state.runPathCounterplay.focus), 'boss three-act state should resolve boss-specific counterplay focus');
  assert(chips.some((chip) => /命途/.test(chip.label) && /章节场域|章节补题/.test(chip.tip || '')), `boss counter chips should include chapter-enhanced run path hint, got ${JSON.stringify(chips)}`);

  console.log('Run path content hook checks passed.');
})();
