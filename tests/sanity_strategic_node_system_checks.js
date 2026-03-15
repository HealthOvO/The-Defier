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

  const storage = () => {
    const map = new Map();
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: (key) => map.delete(key)
    };
  };

  const ctx = vm.createContext({
    console,
    Math,
    JSON,
    Date,
    window: {},
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      body: null
    },
    localStorage: storage(),
    sessionStorage: storage(),
    setTimeout: (fn) => {
      if (typeof fn === 'function') fn();
      return 0;
    },
    clearTimeout: () => {},
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    alert: () => {},
    Utils: {
      showBattleLog: () => {},
      shuffle: (arr) => arr.slice(),
      random: (min) => min
    },
    CHARACTERS: {
      linFeng: {
        stats: { maxHp: 80, gold: 100, energy: 3 },
        relic: null,
        deck: ['strike', 'defend', 'quickDraw', 'defend', 'strike']
      }
    },
    SKILLS: {},
    STARTER_DECK: ['strike', 'defend', 'quickDraw', 'defend', 'strike']
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/data/cards.js'));
  loadFile(ctx, path.join(root, 'js/data/run_destinies.js'));
  loadFile(ctx, path.join(root, 'js/data/run_vows.js'));
  loadFile(ctx, path.join(root, 'js/data/spirit_companions.js'));
  loadFile(ctx, path.join(root, 'js/data/fate_ring.js'));
  loadFile(ctx, path.join(root, 'js/core/player.js'));
  loadFile(ctx, path.join(root, 'js/core/map.js'));
  loadFile(ctx, path.join(root, 'js/game.js'));

  const Player = vm.runInContext('Player', ctx);
  const GameMap = vm.runInContext('GameMap', ctx);
  const Game = vm.runInContext('Game', ctx);
  const RUN_DESTINIES = vm.runInContext('RUN_DESTINIES', ctx);

  // 1) 新战略节点应具备图标与说明
  {
    const map = new GameMap({ player: {} });
    ['observatory', 'spirit_grotto', 'forbidden_altar', 'memory_rift'].forEach((type) => {
      const icon = map.getNodeIcon(type);
      const tip = map.getNodeTooltip(type);
      assert(icon && icon !== '❓', `${type} should expose dedicated icon, got ${icon}`);
      assert(typeof tip === 'string' && tip.length > 4, `${type} should expose readable tooltip`);
    });
  }

  // 2) 地图点击派发应能进入新节点流程
  {
    const hits = [];
    const map = new GameMap({
      player: {},
      showObservatoryNode: () => hits.push('observatory'),
      showSpiritGrottoNode: () => hits.push('spirit_grotto'),
      showForbiddenAltarNode: () => hits.push('forbidden_altar'),
      showMemoryRiftNode: () => hits.push('memory_rift')
    });
    map.onNodeClick({ id: 1, type: 'observatory', completed: false, accessible: true });
    map.onNodeClick({ id: 2, type: 'spirit_grotto', completed: false, accessible: true });
    map.onNodeClick({ id: 3, type: 'forbidden_altar', completed: false, accessible: true });
    map.onNodeClick({ id: 4, type: 'memory_rift', completed: false, accessible: true });
    assert(hits.includes('observatory'), 'observatory click should dispatch to game.showObservatoryNode');
    assert(hits.includes('spirit_grotto'), 'spirit grotto click should dispatch to game.showSpiritGrottoNode');
    assert(hits.includes('forbidden_altar'), 'forbidden altar click should dispatch to game.showForbiddenAltarNode');
    assert(hits.includes('memory_rift'), 'memory rift click should dispatch to game.showMemoryRiftNode');
  }

  // 3) 权重采样应允许新战略节点实际被掷出
  {
    const map = new GameMap({ player: {} });
    assert(map.rollNodeByWeights({ observatory: 1 }) === 'observatory', 'observatory should be rollable');
    assert(map.rollNodeByWeights({ spirit_grotto: 1 }) === 'spirit_grotto', 'spirit grotto should be rollable');
    assert(map.rollNodeByWeights({ forbidden_altar: 1 }) === 'forbidden_altar', 'forbidden altar should be rollable');
    assert(map.rollNodeByWeights({ memory_rift: 1 }) === 'memory_rift', 'memory rift should be rollable');
  }

  // 4) 战略路线谶语应包含新节点偏置，并能写入 shop rumor 状态
  {
    const player = new Player();
    player.realm = 4;
    const game = Object.create(Game.prototype);
    game.player = player;
    game.normalizeShopRumors = Game.prototype.normalizeShopRumors;
    game.ensureShopRumors = Game.prototype.ensureShopRumors;
    game.setNextRealmMapRumor = Game.prototype.setNextRealmMapRumor;
    game.getPendingRouteRumorProfile = Game.prototype.getPendingRouteRumorProfile;
    game.getStrategicRouteForecasts = Game.prototype.getStrategicRouteForecasts;
    game.getStrategicRouteForecast = Game.prototype.getStrategicRouteForecast;
    game.applyStrategicRouteForecast = Game.prototype.applyStrategicRouteForecast;

    const utility = game.getStrategicRouteForecast('utility');
    const rift = game.getStrategicRouteForecast('rift');
    assert(utility.shift.observatory > 0, 'utility route should bias observatory');
    assert(rift.shift.memory_rift > 0, 'rift route should bias memory rift');

    game.applyStrategicRouteForecast('rift');
    const pending = game.getPendingRouteRumorProfile(5);
    assert(!!pending, 'applying rift forecast should create pending rumor profile');
    assert(pending.label === '裂隙回响线', `rift forecast should set correct label, got ${pending.label}`);
    assert((pending.shift.memory_rift || 0) > 0, 'rift forecast should store memory rift weight shift');
  }

  // 5) 记忆裂隙所需的命格升阶 helper 应能真实提升命格阶位
  {
    const player = new Player();
    const upgradeable = Object.values(RUN_DESTINIES).find((item) => item && Array.isArray(item.tiers) && item.tiers.length > 1);
    assert(!!upgradeable, 'expected an upgradeable run destiny in catalog');
    player.setRunDestiny(upgradeable.id, 1);

    const game = Object.create(Game.prototype);
    game.player = player;
    game.getRunDestinyMetaById = Game.prototype.getRunDestinyMetaById;
    game.advanceRunDestinyTier = Game.prototype.advanceRunDestinyTier;

    const result = game.advanceRunDestinyTier();
    assert(result && result.upgraded === true, 'advanceRunDestinyTier should upgrade tier-1 destiny');
    assert(player.runDestiny.tier === 2, `run destiny should advance to tier 2, got ${player.runDestiny.tier}`);
    assert(result.meta && result.meta.tier === 2, 'advanceRunDestinyTier should return tier-2 meta');
  }

  // 6) 灵契窟所需的灵契升阶 helper 应能真实提升灵契阶位
  {
    const player = new Player();
    player.setSpiritCompanion('frostChi', 1);

    const game = Object.create(Game.prototype);
    game.player = player;
    game.getSpiritCompanionMetaById = Game.prototype.getSpiritCompanionMetaById;
    game.advanceSpiritCompanionTier = Game.prototype.advanceSpiritCompanionTier;

    const result = game.advanceSpiritCompanionTier();
    assert(result && result.upgraded === true, 'advanceSpiritCompanionTier should upgrade tier-1 spirit');
    assert(player.spiritCompanion.tier === 2, `spirit companion should advance to tier 2, got ${player.spiritCompanion.tier}`);
    assert(result.meta && result.meta.tier === 2, 'advanceSpiritCompanionTier should return tier-2 meta');
  }

  console.log('Strategic node system checks passed.');
})();
