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

function createEngineeringSnapshot(trackId) {
  const catalog = {
    observatory: {
      name: '观星工程',
      icon: '🔭',
      effectSummary: '观星、事件与裂隙联动抬升，常规战斗略降。'
    },
    spirit_grotto: {
      name: '灵契工程',
      icon: '🪷',
      effectSummary: '灵契、营地与观星协同补强，推进更稳。'
    },
    forbidden_altar: {
      name: '禁术工程',
      icon: '🩸',
      effectSummary: '禁术、试炼与锻炉形成加速链，路线更偏冒险爆发。'
    },
    memory_rift: {
      name: '裂隙工程',
      icon: '🪞',
      effectSummary: '裂隙、事件与观星联动抬升，构筑改写会更连续。'
    }
  };
  const meta = catalog[trackId];
  if (!meta) return null;
  return {
    focusTrack: {
      trackId,
      tier: 2,
      tierLabel: 'II阶',
      name: meta.name,
      icon: meta.icon,
      effectSummary: meta.effectSummary
    }
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
    Game.prototype.getSelectedObservatoryExpeditionGuide = function () {
      return {
        id: 'guide_ember_break',
        title: '观星精选·焚脉试锋',
        score: 228,
        seedSignature: 'D-TEST-7A1C',
        themeKey: 'assault',
        themeLabel: '前压爆发',
        featuredTier: '精选命盘',
        featuredTags: ['前压爆发', '准时冲线', '稳血收官'],
        preferredNodes: ['enemy', 'elite', 'trial'],
        expeditionNote: '优先战斗稠密路线，把先手优势换成远征开局节奏。'
      };
    };

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
  assert(initialState.observatoryLink && initialState.observatoryLink.sourceRecordId === 'guide_ember_break', `expedition should read observatory guide into chapter state, got ${JSON.stringify(initialState.observatoryLink)}`);
  assert(initialState.observatoryLink.bonusOptions.length === 2, `observatory link should expose 2 bonus options, got ${JSON.stringify(initialState.observatoryLink)}`);
  assert(initialState.observatoryLink.recommendedBranches.length >= 1, `observatory link should suggest branches, got ${JSON.stringify(initialState.observatoryLink.recommendedBranches)}`);

  const observatoryBonus = initialState.observatoryLink.bonusOptions.find((entry) => entry.triggerType === 'node_visit') || initialState.observatoryLink.bonusOptions[0];
  const observatorySelected = game.selectExpeditionObservatoryBonus(observatoryBonus.id);
  assert(observatorySelected === true, 'observatory bonus selection should succeed once per chapter');
  const observatoryState = game.getExpeditionState();
  assert(observatoryState.observatoryLink.selectedBonusId === observatoryBonus.id, `selected observatory bonus should persist, got ${observatoryState.observatoryLink.selectedBonusId}`);
  const observatoryResourceBefore = {
    gold: game.player.gold,
    ringExp: game.player.fateRing.exp,
    heavenlyInsight: game.player.heavenlyInsight
  };
  game.recordExpeditionNodeVisit({ type: observatoryBonus.nodeTypes[0], accessible: true, completed: false });
  const observatoryTriggeredState = game.getExpeditionState();
  assert(
    observatoryTriggeredState.observatoryLink.bonusOptions.some((entry) => entry.id === observatoryBonus.id && entry.consumed === true),
    `selected observatory bonus should consume on matching node visit, got ${JSON.stringify(observatoryTriggeredState.observatoryLink)}`
  );
  assert(
    game.player.gold > observatoryResourceBefore.gold
      || game.player.fateRing.exp > observatoryResourceBefore.ringExp
      || game.player.heavenlyInsight > observatoryResourceBefore.heavenlyInsight,
    'observatory bonus trigger should improve at least one resource'
  );

  const branchSelected = game.selectExpeditionBranch(initialState.branchOptions[0].id);
  const afterBranch = game.getExpeditionState();
  assert(branchSelected === true, 'branch selection should succeed');
  assert(afterBranch.selectedBranchId === initialState.branchOptions[0].id, 'selected branch should persist');
  assert(afterBranch.branchSelectionLocked === true, 'branch selection should lock after first choice');

  const factionLogTarget = afterBranch.factions[0];
  const factionShifted = game.applyExpeditionFactionShift(factionLogTarget.id, 1, '审计：势力日志校验。', { silent: true });
  const factionLogPayload = game.getExpeditionPayload();
  assert(!!factionShifted, 'manual faction shift should succeed for history coverage');
  assert(
    factionLogPayload.factions.some((entry) => entry.id === factionLogTarget.id && /审计：势力日志校验/.test(entry.lastReason || '')),
    `payload factions should expose updated lastReason, got ${JSON.stringify(factionLogPayload.factions)}`
  );
  assert(
    Array.isArray(factionLogPayload.recentFactionLogs)
      && factionLogPayload.recentFactionLogs.length >= 1
      && factionLogPayload.recentFactionLogs.some((entry) => entry.factionId === factionLogTarget.id && /审计：势力日志校验/.test(entry.reason || '')),
    `payload should expose recent faction logs, got ${JSON.stringify(factionLogPayload.recentFactionLogs)}`
  );

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
  const conflictState = game.getExpeditionState();
  const conflictFaction = conflictState.factions[0];
  conflictFaction.stance = -2;
  conflictFaction.lastReason = '审计：该路线会继续刺激对立势力。';
  conflictFaction.likes = [routeBounty.condition.nodeType];
  conflictFaction.dislikes = [routeBounty.condition.nodeType];
  conflictFaction.pressureNodeTypes = [routeBounty.condition.nodeType];
  game.expeditionState = conflictState;
  game.persistActiveExpeditionState();
  const conflictPayload = game.getExpeditionPayload();
  const routeDraftPayload = conflictPayload.bountyDraft.find((entry) => entry.id === routeBounty.id);
  const routeActivePayload = conflictPayload.activeBounties.find((entry) => entry.id === routeBounty.id);
  assert(
    routeDraftPayload && Array.isArray(routeDraftPayload.conflictWarnings) && routeDraftPayload.conflictWarnings.length >= 1,
    `bounty draft payload should expose conflict warnings, got ${JSON.stringify(routeDraftPayload)}`
  );
  assert(
    routeActivePayload && typeof routeActivePayload.signalLine === 'string' && routeActivePayload.signalLine.length > 0,
    `active bounty payload should expose signal summary, got ${JSON.stringify(routeActivePayload)}`
  );
  assert(
    Array.isArray(conflictPayload.bountyConflictWarnings)
      && conflictPayload.bountyConflictWarnings.some((entry) => entry.bountyId === routeBounty.id && /势力牵制|关系反噬/.test(entry.label || '')),
    `payload should expose active bounty conflict warnings, got ${JSON.stringify(conflictPayload.bountyConflictWarnings)}`
  );
  assert(
    conflictPayload.nemesisForecast
      && typeof conflictPayload.nemesisForecast.pressureIndex === 'number'
      && typeof conflictPayload.nemesisForecast.line === 'string'
      && conflictPayload.nemesisForecast.line.length > 0,
    `payload should expose nemesis forecast, got ${JSON.stringify(conflictPayload.nemesisForecast)}`
  );
  assert(
    Array.isArray(conflictPayload.recentNemesisLogs),
    `payload should expose recent nemesis logs array, got ${JSON.stringify(conflictPayload.recentNemesisLogs)}`
  );

  game.getStrategicEngineeringSnapshot = () => createEngineeringSnapshot('forbidden_altar');
  const engineeringPayload = game.getExpeditionPayload();
  const engineeringDraftPayload = engineeringPayload.bountyDraft.find((entry) => entry.id === routeBounty.id);
  const engineeringRender = JSON.parse(game.renderGameToText());
  assert(
    engineeringPayload.engineeringLink && engineeringPayload.engineeringLink.trackId === 'forbidden_altar',
    `payload should expose engineering link summary, got ${JSON.stringify(engineeringPayload.engineeringLink)}`
  );
  assert(
    engineeringPayload.branchOptions.some((entry) => entry.engineeringTrackId === 'forbidden_altar' && entry.pressureBias),
    `branch payload should expose engineering route bias, got ${JSON.stringify(engineeringPayload.branchOptions)}`
  );
  assert(
    engineeringDraftPayload
      && engineeringDraftPayload.engineeringTrackId === 'forbidden_altar'
      && typeof engineeringDraftPayload.engineeringNote === 'string'
      && engineeringDraftPayload.engineeringNote.length > 0
      && typeof engineeringDraftPayload.pressureBias === 'string'
      && engineeringDraftPayload.pressureBias.length > 0,
    `bounty payload should expose engineering signal details, got ${JSON.stringify(engineeringDraftPayload)}`
  );
  assert(
    Array.isArray(engineeringPayload.bountyConflictWarnings)
      && engineeringPayload.bountyConflictWarnings.some((entry) => entry.engineeringTrackId === 'forbidden_altar'),
    `active bounty conflicts should retain engineering source, got ${JSON.stringify(engineeringPayload.bountyConflictWarnings)}`
  );
  assert(
    engineeringPayload.nemesisForecast
      && engineeringPayload.nemesisForecast.engineeringTrackId === 'forbidden_altar'
      && engineeringPayload.nemesisForecast.engineeringModifier === '血契增压'
      && /禁术工程/.test(engineeringPayload.nemesisForecast.engineeringNote || ''),
    `nemesis forecast should expose engineering pursuit modifier, got ${JSON.stringify(engineeringPayload.nemesisForecast)}`
  );
  assert(
    engineeringPayload.observatoryLink
      && typeof engineeringPayload.observatoryLink.huntIntel === 'string'
      && engineeringPayload.observatoryLink.huntIntel.length > 0
      && typeof engineeringPayload.observatoryLink.conflictPreview === 'string'
      && engineeringPayload.observatoryLink.conflictPreview.length > 0,
    `observatory payload should expose engineering intel, got ${JSON.stringify(engineeringPayload.observatoryLink)}`
  );
  assert(
    engineeringRender.expedition
      && engineeringRender.expedition.engineeringLink
      && engineeringRender.expedition.engineeringLink.trackId === 'forbidden_altar',
    `render_game_to_text should mirror expedition engineering link, got ${JSON.stringify(engineeringRender)}`
  );

  const observatoryPayload = game.getExpeditionPayload().observatoryLink;
  assert(observatoryPayload && observatoryPayload.sourceTitle === '观星精选·焚脉试锋', `expedition payload should expose observatory link, got ${JSON.stringify(observatoryPayload)}`);
  assert(observatoryPayload.selectedBonusId === observatoryBonus.id, `payload should expose selected observatory bonus, got ${JSON.stringify(observatoryPayload)}`);
  assert(observatoryPayload.bonusOptions.some((entry) => entry.id === observatoryBonus.id && entry.consumed === true), `selected observatory bonus should be consumed after matching node visit, got ${JSON.stringify(observatoryPayload)}`);
  assert(game.getBuildSnapshotData().strengths.some((line) => /观星线索/.test(line)), 'build snapshot should mention observatory link guidance');

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
  const encounterPayload = game.getExpeditionPayload();
  assert(
    Array.isArray(encounterPayload.recentNemesisLogs)
      && encounterPayload.recentNemesisLogs.some((entry) => /线索显露|追猎压制|现身/.test(`${entry.title || ''} ${entry.detail || ''}`)),
    `nemesis encounter should append readable history, got ${JSON.stringify(encounterPayload.recentNemesisLogs)}`
  );

  game.recordExpeditionBattleVictory({ type: nemesisNodeType }, buffedEnemies);
  const nemesisState = game.getExpeditionState();
  assert(nemesisState.activeNemesis.status === 'defeated', `nemesis should be defeated after tagged victory, got ${nemesisState.activeNemesis.status}`);
  const nemesisPayload = game.getExpeditionPayload();
  assert(
    nemesisPayload.nemesisForecast && nemesisPayload.nemesisForecast.status === 'defeated',
    `nemesis forecast should sync to defeated outcome, got ${JSON.stringify(nemesisPayload.nemesisForecast)}`
  );
  assert(
    Array.isArray(nemesisPayload.recentNemesisLogs)
      && nemesisPayload.recentNemesisLogs.some((entry) => entry.status === 'defeated'),
    `nemesis payload should retain defeated history log, got ${JSON.stringify(nemesisPayload.recentNemesisLogs)}`
  );
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
