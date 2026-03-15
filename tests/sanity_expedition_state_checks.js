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
          realm: 4,
          currentHp: 90,
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
  vm.runInContext(bootstrapCode, ctx, { filename: 'expedition_test_bootstrap.js' });

  loadFile(ctx, path.join(root, 'js/data/expedition_systems.js'));
  loadFile(ctx, path.join(root, 'js/core/expedition_hub.js'));

  const Game = vm.runInContext('Game', ctx);
  const game = new Game();

  const initialState = game.initializeExpeditionForRealm(4, true);
  assert(initialState.chapterIndex === 2, `realm 4 should map to chapter 2, got ${initialState.chapterIndex}`);
  assert(initialState.branchOptions.length === 3, `expedition should offer 3 branch choices, got ${initialState.branchOptions.length}`);
  assert(initialState.bountyDraft.length === 3, `expedition should draft 3 bounties, got ${initialState.bountyDraft.length}`);
  assert(initialState.factions.length === 3, `expedition should track 3 factions, got ${initialState.factions.length}`);
  assert(initialState.activeNemesis && initialState.activeNemesis.id, 'expedition should generate an active nemesis');

  const branchSelected = game.selectExpeditionBranch(initialState.branchOptions[0].id);
  const afterBranch = game.getExpeditionState();
  assert(branchSelected === true, 'branch selection should succeed');
  assert(afterBranch.selectedBranchId === initialState.branchOptions[0].id, 'selected branch should persist');
  assert(afterBranch.branchSelectionLocked === true, 'branch selection should lock after first choice');

  const firstToggle = game.toggleExpeditionBounty(afterBranch.bountyDraft[0].id);
  const secondToggle = game.toggleExpeditionBounty(afterBranch.bountyDraft[1].id);
  const thirdToggle = game.toggleExpeditionBounty(afterBranch.bountyDraft[2].id);
  const bountyState = game.getExpeditionState();
  assert(firstToggle === true && secondToggle === true, 'first two bounty toggles should succeed');
  assert(thirdToggle === false, 'third bounty toggle should be rejected by active cap');
  assert(bountyState.activeBountyIds.length === 2, `active bounty cap should remain 2, got ${bountyState.activeBountyIds.length}`);

  const routeBounty = bountyState.bountyDraft.find((entry) => entry.condition && entry.condition.type === 'visitNodeType');
  assert(routeBounty, 'draft should include a route bounty for visitNodeType progression');
  if (!bountyState.activeBountyIds.includes(routeBounty.id)) {
    game.toggleExpeditionBounty(bountyState.activeBountyIds[0]);
    game.toggleExpeditionBounty(routeBounty.id);
  }
  const rewardBefore = {
    gold: game.player.gold,
    ringExp: game.player.fateRing.exp,
    heavenlyInsight: game.player.heavenlyInsight,
    karma: game.player.karma,
  };
  game.recordExpeditionNodeVisit({ type: routeBounty.condition.nodeType, accessible: true, completed: false });
  const progressedState = game.getExpeditionState();
  const rewardedBounty = progressedState.bountyDraft.find((entry) => entry.id === routeBounty.id);
  assert(rewardedBounty.completed === true, 'route bounty should complete after matching node visit');
  assert(rewardedBounty.rewardGranted === true, 'completed route bounty should grant reward exactly once');
  assert(
    game.player.gold > rewardBefore.gold
      || game.player.fateRing.exp > rewardBefore.ringExp
      || game.player.heavenlyInsight > rewardBefore.heavenlyInsight
      || game.player.karma > rewardBefore.karma,
    'route bounty completion should improve at least one player resource'
  );

  const nemesisNodeType = progressedState.activeNemesis.triggerNodeTypes[0];
  const buffedEnemies = game.applyExpeditionBattleModifiers([
    {
      id: 'rift_wolf',
      name: '裂影狼',
      hp: 80,
      maxHp: 80,
      patterns: [{ type: 'attack', value: 12, intent: '突袭' }],
    }
  ], { type: nemesisNodeType });
  assert(Array.isArray(buffedEnemies) && buffedEnemies.length === 1, 'battle modifiers should return enemy list');
  assert(/^nemesis_/.test(buffedEnemies[0].id), `nemesis encounter should stamp enemy id, got ${buffedEnemies[0].id}`);
  assert(/仇敌/.test(buffedEnemies[0].name), `nemesis encounter should rename enemy, got ${buffedEnemies[0].name}`);

  game.recordExpeditionBattleVictory({ type: nemesisNodeType }, buffedEnemies);
  const nemesisState = game.getExpeditionState();
  assert(nemesisState.activeNemesis.status === 'defeated', `nemesis should be defeated after tagged victory, got ${nemesisState.activeNemesis.status}`);
  assert(
    game.collectionUnlocks.some((entry) => entry.type === 'nemesis'),
    'defeating a nemesis should record a collection unlock'
  );

  const buildSnapshot = game.getBuildSnapshotData();
  assert(buildSnapshot.expedition && buildSnapshot.expedition.chapterIndex === 2, 'build snapshot should expose expedition payload');
  assert(buildSnapshot.strengths.length >= 1 || buildSnapshot.gaps.length >= 1, 'build snapshot should add expedition guidance');

  const slate = game.finalizeExpeditionChapter('realm_clear');
  assert(!!slate, 'finalizing expedition chapter should create a run slate');
  assert(game.expeditionState === null, 'active expedition state should clear after finalization');
  assert(Array.isArray(game.runSlateArchive) && game.runSlateArchive.length === 1, 'run slate archive should store latest slate');
  assert(
    localStorage.getItem('theDefierRunSlateArchiveV1') && !localStorage.getItem('theDefierActiveExpeditionStateV1'),
    'run slate archive should persist while active expedition state is removed'
  );

  const payloadAfterFinalize = game.getExpeditionPayload();
  assert(payloadAfterFinalize && payloadAfterFinalize.latestSlate && payloadAfterFinalize.latestSlate.id === slate.id, 'payload should fall back to latest run slate after finalization');

  const sanctum = game.getSanctumOverviewData();
  assert(sanctum.progress.runSlateArchives === 1, `sanctum should count run slate archives, got ${sanctum.progress.runSlateArchives}`);
  assert(sanctum.rooms.some((room) => room.id === 'run_slate_archive'), 'sanctum should include the run slate archive room');
  assert(sanctum.goals.some((goal) => goal.id === 'run_slate_archive_goal'), 'sanctum should include a run slate goal');

  const reloadedGame = new Game();
  reloadedGame.runSlateArchive = reloadedGame.loadRunSlateArchive();
  assert(reloadedGame.runSlateArchive.length === 1, 'run slate archive should reload from storage');
  assert(reloadedGame.getLatestRunSlate().id === slate.id, 'latest run slate should reload correctly');

  console.log('Expedition state checks passed.');
})();
