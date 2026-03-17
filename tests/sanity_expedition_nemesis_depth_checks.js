const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    }
  };
}

function loadFile(ctx, filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, ctx, { filename: filePath });
}

function createFaction(game, id, stance = 0, lastReason = '测试态势') {
  const source = game.getExpeditionFactionPool().find((entry) => entry.id === id);
  assert(source, `missing faction profile: ${id}`);
  return {
    ...source,
    stance,
    lastReason
  };
}

function createBattleEnemy() {
  return {
    id: 'depth_target',
    name: '深度校验敌影',
    hp: 84,
    maxHp: 84,
    patterns: [{ type: 'attack', value: 11, intent: '压测' }]
  };
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const localStorage = createStorage();

  const ctx = vm.createContext({
    console,
    window: {},
    document: {
      querySelector: () => null,
      createElement: () => ({
        style: {},
        innerHTML: '',
        querySelector: () => null,
        insertAdjacentElement: () => {},
      }),
    },
    localStorage,
    Date,
    Math,
    JSON,
    Utils: {
      showBattleLog: () => {},
    },
  });
  ctx.window = ctx;
  ctx.global = ctx;

  const bootstrapCode = `
    class Game {
      constructor() {
        this.collectionUnlocks = [];
        this.mode = 'map-screen';
        this.player = {
          realm: 1,
          currentHp: 100,
          maxHp: 100,
          gold: 120,
          heavenlyInsight: 0,
          karma: 0,
          currentEnergy: 3,
          addBlock(value) {
            this.block = (this.block || 0) + value;
          },
          heal(value) {
            this.currentHp = Math.min(this.maxHp, this.currentHp + value);
          },
          fateRing: {
            exp: 0,
            checkFateRingLevelUp() {},
          },
        };
        this.selectedCharacterId = 'linFeng';
        this.selectedRunDestinyId = 'rebelScale';
        this.selectedSpiritCompanionId = 'emberCrow';
      }
    }
    Game.prototype.getChapterDisplaySnapshot = function (realm) {
      const chapterIndex = Math.max(1, Math.min(6, Math.floor((Math.max(1, realm) - 1) / 3) + 1));
      return {
        name: '第' + chapterIndex + '章',
        fullName: '第' + chapterIndex + '章·裂界试炼',
      };
    };
    Game.prototype.recordCollectionUnlock = function (type, payload) {
      this.collectionUnlocks.push({ type, payload });
    };
    Game.prototype.updatePlayerDisplay = function () {};
    Game.prototype.isEndlessActive = function () { return false; };

    class GameMap {}

    this.Game = Game;
    this.GameMap = GameMap;
  `;
  vm.runInContext(bootstrapCode, ctx, { filename: 'expedition_nemesis_depth_bootstrap.js' });

  loadFile(ctx, path.join(root, 'js/data/expedition_systems.js'));
  loadFile(ctx, path.join(root, 'js/core/expedition_hub.js'));

  const profiles = vm.runInContext('EXPEDITION_NEMESIS_PROFILES', ctx);
  const flatProfiles = Object.values(profiles).flat();
  assert(flatProfiles.length >= 8 && flatProfiles.length <= 12, `nemesis profile count should stay within 8-12, got ${flatProfiles.length}`);
  flatProfiles.forEach((profile) => {
    assert(Array.isArray(profile.battleVariants) && profile.battleVariants.length >= 2, `nemesis ${profile.id} should expose at least two battle variants`);
    assert(typeof profile.clueLine === 'string' && profile.clueLine.length > 0, `nemesis ${profile.id} should expose a clue line`);
  });

  const Game = vm.runInContext('Game', ctx);

  const releaseGame = new Game();
  let releaseState = releaseGame.initializeExpeditionForRealm(1, true);
  releaseState.factions = [
    createFaction(releaseGame, 'star_seers', 2, '主动提供观星掩护。'),
    createFaction(releaseGame, 'caravan_union', 0),
    createFaction(releaseGame, 'wild_hunt', 0)
  ];
  releaseState.selectedBranchId = 'watch_spire';
  releaseState.branchSelectionLocked = true;
  releaseState.stats.selectedBranchName = '裂誓望台';
  releaseGame.expeditionState = releaseState;
  releaseGame.recordExpeditionNodeVisit({ type: 'event', accessible: true, completed: false });
  releaseState = releaseGame.getExpeditionState();
  assert(releaseState.activeNemesis.clueRevealed === true, 'event node should reveal the nemesis clue');
  assert(releaseState.activeNemesis.status === 'released', `star seers branch should allow release outcome, got ${releaseState.activeNemesis.status}`);
  assert(releaseState.activeNemesis.rewardGranted === true, 'release outcome should grant its resolved reward once');
  assert(releaseGame.player.heavenlyInsight >= 2, `release outcome should grant heavenly insight, got ${releaseGame.player.heavenlyInsight}`);
  assert(releaseGame.getExpeditionPayload().activeNemesis.statusLabel === '已放走', 'payload should expose release status label');

  const tradeGame = new Game();
  let tradeState = tradeGame.initializeExpeditionForRealm(1, true);
  tradeState.factions = [
    createFaction(tradeGame, 'caravan_union', 2, '商路已经彻底站队。'),
    createFaction(tradeGame, 'wild_hunt', 0),
    createFaction(tradeGame, 'frontier_bureau', 0)
  ];
  tradeState.selectedBranchId = 'rift_market';
  tradeState.branchSelectionLocked = true;
  tradeState.stats.selectedBranchName = '裂口浮市';
  tradeGame.expeditionState = tradeState;
  const goldBeforeTrade = tradeGame.player.gold;
  tradeGame.recordExpeditionNodeVisit({ type: 'shop', accessible: true, completed: false });
  tradeState = tradeGame.getExpeditionState();
  assert(tradeState.activeNemesis.status === 'traded', `market route should allow trade outcome, got ${tradeState.activeNemesis.status}`);
  assert(tradeState.activeNemesis.rewardGranted === true, 'trade outcome should grant reward once');
  assert(tradeGame.player.gold > goldBeforeTrade, 'trade outcome should grant gold');

  const evolveGame = new Game();
  let evolveState = evolveGame.initializeExpeditionForRealm(1, true);
  evolveState.factions = [
    createFaction(evolveGame, 'wild_hunt', -2, '主动协助宿敌合围。'),
    createFaction(evolveGame, 'caravan_union', 0),
    createFaction(evolveGame, 'frontier_bureau', 0)
  ];
  evolveState.selectedBranchId = 'ember_mines';
  evolveState.branchSelectionLocked = true;
  evolveState.stats.selectedBranchName = '焚骨矿场';
  evolveState.activeNemesis = {
    ...evolveState.activeNemesis,
    triggerNodeTypes: ['enemy', 'boss'],
    recursOnVictoryNodeTypes: ['enemy'],
    currentVariantId: 'hunt',
    status: 'hunting',
    fateOutcome: 'hunting',
    engaged: false,
    engagedCount: 0,
    recurrenceCount: 0,
    clueRevealed: false,
    rewardGranted: false,
    alliedFactionId: '',
    alliedFactionName: ''
  };
  evolveGame.expeditionState = evolveState;
  const firstEncounter = evolveGame.applyExpeditionBattleModifiers([createBattleEnemy()], { type: 'enemy' });
  evolveGame.recordExpeditionBattleVictory({ type: 'enemy' }, firstEncounter);
  evolveState = evolveGame.getExpeditionState();
  assert(evolveState.activeNemesis.status === 'recurring', `enemy-line victory should allow recurrence, got ${evolveState.activeNemesis.status}`);
  assert(evolveState.activeNemesis.recurrenceCount === 1, `recurrence count should increment, got ${evolveState.activeNemesis.recurrenceCount}`);
  evolveGame.recordExpeditionNodeVisit({ type: 'boss', accessible: true, completed: false });
  evolveState = evolveGame.getExpeditionState();
  assert(evolveState.activeNemesis.status === 'guarding', `boss approach after recurrence should promote guarding, got ${evolveState.activeNemesis.status}`);
  const evolvedSlate = evolveGame.finalizeExpeditionChapter('battle_lost');
  assert(evolvedSlate.nemesisStatus === 'evolved', `failed guarded pursuit should evolve the nemesis, got ${evolvedSlate.nemesisStatus}`);
  assert(/仇敌进阶/.test(evolvedSlate.scoreBreakdown.join(' | ')), `slate should record evolved outcome, got ${JSON.stringify(evolvedSlate.scoreBreakdown)}`);

  console.log('Expedition nemesis depth checks passed.');
})();
