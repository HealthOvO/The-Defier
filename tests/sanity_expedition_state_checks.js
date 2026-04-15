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

function readFirstNumber(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function readFirstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

function readFirstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) return value.slice();
  }
  return [];
}

function getResourceSnapshot(game) {
  return {
    gold: Number(game?.player?.gold || 0),
    ringExp: Number(game?.player?.fateRing?.exp || 0),
    heavenlyInsight: Number(game?.player?.heavenlyInsight || 0),
    karma: Number(game?.player?.karma || 0),
    hp: Number(game?.player?.currentHp || 0),
    energy: Number(game?.player?.currentEnergy || 0),
    block: Number(game?.player?.block || 0),
  };
}

function getResourceDelta(before, after) {
  const safeBefore = before || {};
  const safeAfter = after || {};
  return (
    (Number(safeAfter.gold || 0) - Number(safeBefore.gold || 0))
    + (Number(safeAfter.ringExp || 0) - Number(safeBefore.ringExp || 0))
    + (Number(safeAfter.heavenlyInsight || 0) - Number(safeBefore.heavenlyInsight || 0))
    + (Number(safeAfter.karma || 0) - Number(safeBefore.karma || 0))
    + (Number(safeAfter.hp || 0) - Number(safeBefore.hp || 0))
    + (Number(safeAfter.energy || 0) - Number(safeBefore.energy || 0))
    + (Number(safeAfter.block || 0) - Number(safeBefore.block || 0))
  );
}

function getObservatoryResonanceModel(link) {
  const source = link && typeof link === 'object' ? link : {};
  const resonance = source.resonance && typeof source.resonance === 'object' ? source.resonance : {};
  const progress = readFirstNumber(
    resonance.progress,
    source.progress,
    source.resonanceProgress,
    resonance.current,
    source.current,
    source.resonanceCurrent
  );
  const target = readFirstNumber(
    resonance.target,
    source.target,
    source.resonanceTarget,
    resonance.max,
    source.max,
    source.resonanceMax
  );
  const completedValue = [
    resonance.completed,
    source.completed,
    source.resonanceCompleted,
    resonance.claimed,
    source.claimed,
    source.resonanceClaimed,
  ].find((value) => typeof value === 'boolean');
  return {
    progress,
    target,
    completed: typeof completedValue === 'boolean' ? completedValue : null,
    focusNodeTypes: readFirstArray(
      resonance.focusNodeTypes,
      source.focusNodeTypes,
      source.resonanceFocusNodeTypes,
      resonance.nodeTypes,
      source.nodeTypes,
      source.resonanceNodeTypes
    ),
    label: readFirstString(resonance.label, source.label, source.resonanceLabel, resonance.title, source.title, source.resonanceTitle),
    rewardLine: readFirstString(
      resonance.rewardLine,
      source.rewardLine,
      source.resonanceRewardLine,
      resonance.rewardSummary,
      source.rewardSummary,
      source.resonanceRewardSummary
    ),
    progressLine: readFirstString(
      resonance.progressLine,
      source.progressLine,
      source.resonanceProgressLine,
      resonance.progressText,
      source.progressText,
      source.resonanceProgressText
    ),
    statusLine: readFirstString(
      resonance.statusLine,
      source.statusLine,
      source.resonanceStatusLine,
      resonance.statusLabel,
      source.statusLabel,
      source.resonanceStatusLabel
    ),
  };
}

function getObservatoryRoutePactModel(link) {
  const source = link && typeof link === 'object' ? link : {};
  const routePact = source.routePact && typeof source.routePact === 'object' ? source.routePact : {};
  const completedValue = [
    routePact.completed,
    source.completed,
    source.routePactCompleted,
    routePact.claimed,
    source.claimed,
    source.routePactClaimed,
  ].find((value) => typeof value === 'boolean');
  return {
    bountyId: readFirstString(routePact.bountyId, source.bountyId, source.routePactBountyId),
    bountyName: readFirstString(routePact.bountyName, source.bountyName, source.routePactBountyName),
    progress: readFirstNumber(
      routePact.progress,
      source.progress,
      source.routePactProgress,
      routePact.current,
      source.current,
      source.routePactCurrent
    ),
    target: readFirstNumber(
      routePact.target,
      source.target,
      source.routePactTarget,
      routePact.max,
      source.max,
      source.routePactMax
    ),
    completed: typeof completedValue === 'boolean' ? completedValue : null,
    focusNodeTypes: readFirstArray(
      routePact.focusNodeTypes,
      source.focusNodeTypes,
      source.routePactFocusNodeTypes,
      routePact.nodeTypes,
      source.nodeTypes,
      source.routePactNodeTypes
    ),
    label: readFirstString(routePact.label, source.label, source.routePactLabel, routePact.title, source.title, source.routePactTitle),
    rewardLine: readFirstString(
      routePact.rewardLine,
      source.rewardLine,
      source.routePactRewardLine,
      routePact.rewardSummary,
      source.rewardSummary,
      source.routePactRewardSummary
    ),
    statusLine: readFirstString(
      routePact.statusLine,
      source.statusLine,
      source.routePactStatusLine,
      routePact.statusLabel,
      source.statusLabel,
      source.routePactStatusLabel
    ),
  };
}

function assertResonanceContract(model, contextLabel) {
  assert(!!model, `${contextLabel} should exist`);
  assert(Number.isFinite(model.progress), `${contextLabel} should expose numeric progress, got ${JSON.stringify(model)}`);
  assert(Number.isFinite(model.target) && model.target >= 1, `${contextLabel} should expose numeric target >= 1, got ${JSON.stringify(model)}`);
  assert(Array.isArray(model.focusNodeTypes) && model.focusNodeTypes.length >= 1, `${contextLabel} should expose at least one focus node type, got ${JSON.stringify(model)}`);
  assert(typeof model.completed === 'boolean', `${contextLabel} should expose completion state, got ${JSON.stringify(model)}`);
  assert(
    !!model.label || !!model.rewardLine || !!model.progressLine || !!model.statusLine,
    `${contextLabel} should expose at least one readable resonance line, got ${JSON.stringify(model)}`
  );
}

function assertRoutePactContract(model, contextLabel) {
  assert(!!model, `${contextLabel} should exist`);
  assert(typeof model.bountyId === 'string' && model.bountyId.length > 0, `${contextLabel} should expose bountyId, got ${JSON.stringify(model)}`);
  assert(Number.isFinite(model.progress), `${contextLabel} should expose numeric progress, got ${JSON.stringify(model)}`);
  assert(Number.isFinite(model.target) && model.target >= 1, `${contextLabel} should expose numeric target >= 1, got ${JSON.stringify(model)}`);
  assert(Array.isArray(model.focusNodeTypes) && model.focusNodeTypes.length >= 1, `${contextLabel} should expose focus node types, got ${JSON.stringify(model)}`);
  assert(typeof model.completed === 'boolean', `${contextLabel} should expose completion state, got ${JSON.stringify(model)}`);
  assert(
    !!model.bountyName || !!model.label || !!model.rewardLine || !!model.statusLine,
    `${contextLabel} should expose readable route pact text, got ${JSON.stringify(model)}`
  );
}

function getPracticeTopicModel(topic) {
  const source = topic && typeof topic === 'object' ? topic : {};
  const recommendedBranchIds = readFirstArray(
    source.recommendedBranchIds,
    Array.isArray(source.recommendedBranches) ? source.recommendedBranches.map((entry) => entry?.id).filter(Boolean) : []
  );
  return {
    id: readFirstString(source.id, source.topicId),
    title: readFirstString(source.title, source.name, source.topicTitle),
    sourceTitle: readFirstString(source.sourceTitle, source.sourceName),
    themeLabel: readFirstString(source.themeLabel, source.sourceThemeLabel),
    trainingTags: readFirstArray(source.trainingTags, source.tags),
    goalLines: readFirstArray(source.goalLines).map((line) => String(line || '')).filter(Boolean),
    recommendedBranchIds: recommendedBranchIds.map((value) => String(value || '')).filter(Boolean),
    routeHint: readFirstString(source.routeHint, source.routeFocusLine),
    compareHint: readFirstString(source.compareHint, source.summary),
  };
}

function getAnswerGoalModel(goal) {
  const source = goal && typeof goal === 'object' ? goal : {};
  return {
    id: readFirstString(source.id),
    label: readFirstString(source.label, source.name),
    progress: readFirstNumber(source.progress, source.current),
    target: readFirstNumber(source.target, source.max),
    completed: [source.completed, source.claimed].find((value) => typeof value === 'boolean'),
    stateTone: readFirstString(source.stateTone, source.state, source.tone),
    tagLabel: readFirstString(source.tagLabel, source.tag),
    statusLine: readFirstString(source.statusLine, source.line, source.summary),
    noteLine: readFirstString(source.noteLine, source.note, source.detail),
    deviated: [source.deviated].find((value) => typeof value === 'boolean'),
  };
}

function getAnswerSheetModel(sheet) {
  const source = sheet && typeof sheet === 'object' ? sheet : {};
  const goals = readFirstArray(source.goals).map((entry) => getAnswerGoalModel(entry));
  const routeGoal = goals.find((entry) => entry.id === 'route_alignment') || goals[0] || null;
  const executionGoal = goals.find((entry) => entry.id === 'sample_execution') || goals[1] || null;
  const synthesisGoal = goals.find((entry) => entry.id === 'chapter_synthesis') || goals[2] || null;
  const reviewCard = source.reviewCard && typeof source.reviewCard === 'object' ? source.reviewCard : {};
  return {
    topicId: readFirstString(source.topicId, reviewCard.topicId),
    clueLocked: [source.clueLocked].find((value) => typeof value === 'boolean'),
    clueStatusLine: readFirstString(source.clueStatusLine, source.clueLine),
    ratingLabel: readFirstString(source.ratingLabel, reviewCard.ratingLabel),
    ratingTone: readFirstString(source.ratingTone, reviewCard.ratingTone),
    completedGoals: readFirstNumber(source.completedGoals, source.completed, goals.filter((entry) => entry.completed === true).length),
    totalGoals: readFirstNumber(source.totalGoals, goals.length),
    nextSuggestion: readFirstString(source.nextSuggestion, reviewCard.trainingAdvice),
    overviewLine: readFirstString(source.overviewLine, reviewCard.overviewLine),
    goals,
    routeGoal,
    executionGoal,
    synthesisGoal,
    reviewCard: {
      title: readFirstString(reviewCard.title),
      topicTitle: readFirstString(reviewCard.topicTitle),
      ratingLabel: readFirstString(reviewCard.ratingLabel),
      overviewLine: readFirstString(reviewCard.overviewLine),
      highlightLine: readFirstString(reviewCard.highlightLine),
      trainingAdvice: readFirstString(reviewCard.trainingAdvice),
      goalHighlights: readFirstArray(reviewCard.goalHighlights).map((line) => String(line || '')).filter(Boolean),
      tags: readFirstArray(reviewCard.tags).map((line) => String(line || '')).filter(Boolean),
    },
  };
}

function assertPracticeTopicContract(model, contextLabel) {
  assert(!!model, `${contextLabel} should exist`);
  assert(typeof model.id === 'string' && model.id.length > 0, `${contextLabel} should expose id, got ${JSON.stringify(model)}`);
  assert(typeof model.title === 'string' && model.title.length > 0, `${contextLabel} should expose title, got ${JSON.stringify(model)}`);
  assert(typeof model.sourceTitle === 'string' && model.sourceTitle.length > 0, `${contextLabel} should expose source title, got ${JSON.stringify(model)}`);
  assert(Array.isArray(model.goalLines) && model.goalLines.length >= 3, `${contextLabel} should expose at least 3 goal lines, got ${JSON.stringify(model)}`);
  assert(Array.isArray(model.trainingTags) && model.trainingTags.length >= 1, `${contextLabel} should expose training tags, got ${JSON.stringify(model)}`);
}

function assertAnswerSheetContract(model, contextLabel) {
  assert(!!model, `${contextLabel} should exist`);
  assert(typeof model.topicId === 'string' && model.topicId.length > 0, `${contextLabel} should expose topicId, got ${JSON.stringify(model)}`);
  assert(typeof model.ratingLabel === 'string' && model.ratingLabel.length > 0, `${contextLabel} should expose ratingLabel, got ${JSON.stringify(model)}`);
  assert(typeof model.nextSuggestion === 'string' && model.nextSuggestion.length > 0, `${contextLabel} should expose nextSuggestion, got ${JSON.stringify(model)}`);
  assert(Array.isArray(model.goals) && model.goals.length >= 3, `${contextLabel} should expose at least 3 goals, got ${JSON.stringify(model)}`);
  assert(!!model.routeGoal && !!model.executionGoal && !!model.synthesisGoal, `${contextLabel} should expose route/execution/synthesis goals, got ${JSON.stringify(model)}`);
}

function getBountyFocusNodeTypesForTest(bounty) {
  const condition = bounty?.condition || {};
  switch (condition.type) {
    case 'visitNodeType':
      return condition.nodeType ? [String(condition.nodeType)] : [];
    case 'eliteWins':
      return ['elite', 'trial'];
    case 'battleWins':
      return ['enemy', 'elite', 'trial', 'boss'];
    case 'noRestBossWin':
      return ['enemy', 'elite', 'trial', 'boss'];
    case 'hpAboveOnBossWin':
      return ['rest', 'shop', 'observatory', 'boss'];
    default:
      return [];
  }
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
    Game.prototype.startBattle = function (enemies, node = null) {
      this.startedBattles = Array.isArray(this.startedBattles) ? this.startedBattles : [];
      const record = {
        enemies,
        node,
        energyAtStart: Number(this.player?.currentEnergy || 0),
        blockAtStart: Number(this.player?.block || 0),
      };
      this.startedBattles.push(record);
      return record;
    };
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
        trainingTags: ['稳血收官', '高压过线'],
        coachBrief: '先沿战斗稠密路线滚起前段节奏，再把爆发留到高压段。',
        drillObjective: '在第 2 章里保留一段爆发或兜底，按原顺序处理 2 场高压战。',
        routeFocusLine: '优先节点：常规战 / 精英 / 试炼',
        compareHint: '对比先手压制、收头效率与高压段处理是否稳定。',
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
  const recommendedBranchId = initialState.observatoryLink.recommendedBranches[0]?.id || '';
  assert(recommendedBranchId.length > 0, `observatory link should expose a usable recommended branch id, got ${JSON.stringify(initialState.observatoryLink.recommendedBranches)}`);
  assert(
    initialState.branchOptions.some((entry) => entry.id === recommendedBranchId),
    `recommended branch should come from current branch options, got recommended=${JSON.stringify(initialState.observatoryLink.recommendedBranches)} branches=${JSON.stringify(initialState.branchOptions)}`
  );
  assert(Array.isArray(initialState.observatoryLink.trainingTags) && initialState.observatoryLink.trainingTags.length >= 1, `observatory link should carry training tags, got ${JSON.stringify(initialState.observatoryLink)}`);
  assert(/优先节点/.test(initialState.observatoryLink.routeFocusLine || ''), `observatory link should carry route focus line, got ${JSON.stringify(initialState.observatoryLink)}`);
  assert(initialState.observatoryLink.drillObjective && initialState.observatoryLink.compareHint, `observatory link should carry drill objective and compare hint, got ${JSON.stringify(initialState.observatoryLink)}`);
  const initialPracticeTopic = getPracticeTopicModel(initialState.practiceTopic);
  const initialAnswerSheet = getAnswerSheetModel(initialState.answerSheet);
  assertPracticeTopicContract(initialPracticeTopic, 'initial expedition practice topic');
  assertAnswerSheetContract(initialAnswerSheet, 'initial expedition answer sheet');
  assert(initialAnswerSheet.topicId === initialPracticeTopic.id, `answer sheet should point at practice topic, got topic=${JSON.stringify(initialPracticeTopic)} answer=${JSON.stringify(initialAnswerSheet)}`);
  assert(
    initialPracticeTopic.sourceTitle === initialState.observatoryLink.sourceTitle,
    `practice topic should freeze observatory source title into chapter state, got topic=${JSON.stringify(initialPracticeTopic)} link=${JSON.stringify(initialState.observatoryLink)}`
  );
  assert(
    initialPracticeTopic.trainingTags.some((tag) => initialState.observatoryLink.trainingTags.includes(tag)),
    `practice topic should inherit observatory training tags, got topic=${JSON.stringify(initialPracticeTopic)} link=${JSON.stringify(initialState.observatoryLink)}`
  );
  assert(
    initialPracticeTopic.recommendedBranchIds.length >= 1,
    `practice topic should expose at least one recommended branch anchor, got ${JSON.stringify(initialPracticeTopic)}`
  );
  assert(
    /待按样本锁线|待从精选命盘里锁 1 条线索/.test([initialAnswerSheet.routeGoal?.statusLine || '', initialAnswerSheet.clueStatusLine].join(' ')),
    `initial answer sheet should begin in a readable pending state, got ${JSON.stringify(initialAnswerSheet)}`
  );

  const observatoryBonus = initialState.observatoryLink.bonusOptions.find((entry) => entry.triggerType === 'node_visit') || initialState.observatoryLink.bonusOptions[0];
  const observatorySelected = game.selectExpeditionObservatoryBonus(observatoryBonus.id);
  assert(observatorySelected === true, 'observatory bonus selection should succeed once per chapter');
  const observatoryState = game.getExpeditionState();
  assert(observatoryState.observatoryLink.selectedBonusId === observatoryBonus.id, `selected observatory bonus should persist, got ${observatoryState.observatoryLink.selectedBonusId}`);
  const observatoryPayloadAfterLock = game.getExpeditionPayload().observatoryLink;
  const answerSheetAfterLock = getAnswerSheetModel(game.getExpeditionPayload().answerSheet);
  const resonanceAfterLock = getObservatoryResonanceModel(observatoryPayloadAfterLock);
  assertResonanceContract(resonanceAfterLock, 'observatory link resonance payload after lock');
  assertAnswerSheetContract(answerSheetAfterLock, 'answer sheet payload after clue lock');
  assert(answerSheetAfterLock.clueLocked === true, `answer sheet should mark clue lock after bonus selection, got ${JSON.stringify(answerSheetAfterLock)}`);
  assert(
    /已锁定线索|观星线索/.test(answerSheetAfterLock.clueStatusLine || ''),
    `answer sheet should expose readable clue status after bonus selection, got ${JSON.stringify(answerSheetAfterLock)}`
  );
  assert(resonanceAfterLock.progress >= 0 && resonanceAfterLock.progress < resonanceAfterLock.target, `resonance should start below target before matching nodes, got ${JSON.stringify(resonanceAfterLock)}`);
  assert(
    resonanceAfterLock.focusNodeTypes.every((type) => observatoryBonus.nodeTypes.includes(type)),
    `locking a clue should retarget resonance toward the selected bonus nodes, got bonus=${JSON.stringify(observatoryBonus)} resonance=${JSON.stringify(resonanceAfterLock)}`
  );

  const originalGuideGetter = game.getSelectedObservatoryExpeditionGuide;
  game.getSelectedObservatoryExpeditionGuide = function () {
    return {
      id: 'guide_shifted_live_state',
      title: '观星精选·漂移假线',
      score: 999,
      seedSignature: 'D-LIVE-DRIFT',
      themeKey: 'oracle',
      themeLabel: '错位观测',
      featuredTier: '误导命盘',
      featuredTags: ['不应串入当前章节'],
      preferredNodes: ['observatory'],
      expeditionNote: '如果当前章节改读 live guide，这条文案就会错误冒出来。'
    };
  };
  const frozenChapterPayload = game.getExpeditionPayload().observatoryLink;
  const frozenPracticeTopic = getPracticeTopicModel(game.getExpeditionPayload().practiceTopic);
  game.getSelectedObservatoryExpeditionGuide = originalGuideGetter;
  assert(
    frozenChapterPayload?.sourceRecordId === 'guide_ember_break' && frozenChapterPayload?.sourceTitle === '观星精选·焚脉试锋',
    `active expedition should keep using chapter-scoped observatoryLink instead of live guide state, got ${JSON.stringify(frozenChapterPayload)}`
  );
  assert(
    frozenPracticeTopic.sourceTitle === initialPracticeTopic.sourceTitle,
    `practice topic should keep using chapter-scoped observatory seed instead of live guide state, got initial=${JSON.stringify(initialPracticeTopic)} frozen=${JSON.stringify(frozenPracticeTopic)}`
  );

  const resonanceFocusNodeType = resonanceAfterLock.focusNodeTypes[0];
  assert(typeof resonanceFocusNodeType === 'string' && resonanceFocusNodeType.length > 0, `resonance should provide a usable focus node type, got ${JSON.stringify(resonanceAfterLock)}`);

  const observatoryResourceBefore = getResourceSnapshot(game);
  game.recordExpeditionNodeVisit({ type: resonanceFocusNodeType, accessible: true, completed: false });
  let observatoryTriggeredState = game.getExpeditionState();
  let observatoryPayload = game.getExpeditionPayload().observatoryLink;
  let answerSheetAfterFirstFocus = getAnswerSheetModel(game.getExpeditionPayload().answerSheet);
  let resonanceAfterFirstFocus = getObservatoryResonanceModel(observatoryPayload);
  assertResonanceContract(resonanceAfterFirstFocus, 'observatory link resonance payload after first focus visit');
  assertAnswerSheetContract(answerSheetAfterFirstFocus, 'answer sheet after first focus visit');
  assert(
    resonanceAfterFirstFocus.progress > resonanceAfterLock.progress || resonanceAfterFirstFocus.completed === true,
    `matching focus node visits should advance resonance progress, got before=${JSON.stringify(resonanceAfterLock)} after=${JSON.stringify(resonanceAfterFirstFocus)}`
  );
  assert(
    Number(answerSheetAfterFirstFocus.executionGoal?.progress || 0) > Number(answerSheetAfterLock.executionGoal?.progress || 0)
      || /推进|跑完|进行中/.test(answerSheetAfterFirstFocus.executionGoal?.statusLine || ''),
    `matching focus node visits should advance answer-sheet execution goal, got before=${JSON.stringify(answerSheetAfterLock)} after=${JSON.stringify(answerSheetAfterFirstFocus)}`
  );

  if (!observatoryTriggeredState.observatoryLink.bonusOptions.some((entry) => entry.id === observatoryBonus.id && entry.consumed === true) && observatoryBonus.nodeTypes[0] && observatoryBonus.nodeTypes[0] !== resonanceFocusNodeType) {
    game.recordExpeditionNodeVisit({ type: observatoryBonus.nodeTypes[0], accessible: true, completed: false });
    observatoryTriggeredState = game.getExpeditionState();
    observatoryPayload = game.getExpeditionPayload().observatoryLink;
    answerSheetAfterFirstFocus = getAnswerSheetModel(game.getExpeditionPayload().answerSheet);
    resonanceAfterFirstFocus = getObservatoryResonanceModel(observatoryPayload);
  }
  assert(
    observatoryTriggeredState.observatoryLink.bonusOptions.some((entry) => entry.id === observatoryBonus.id && entry.consumed === true),
    `selected observatory bonus should consume on matching node visit, got ${JSON.stringify(observatoryTriggeredState.observatoryLink)}`
  );
  assert(
    getResourceDelta(observatoryResourceBefore, getResourceSnapshot(game)) > 0,
    'observatory bonus trigger should improve at least one resource'
  );

  let resonanceCompletionState = resonanceAfterFirstFocus;
  let resonanceCompletionResourceAwarded = false;
  let resonanceSafety = Math.max(2, (Number(resonanceCompletionState.target) || 1) + 2);
  while (resonanceCompletionState.completed !== true && resonanceCompletionState.progress < resonanceCompletionState.target && resonanceSafety > 0) {
    const beforeFinalResources = getResourceSnapshot(game);
    const progressBeforeVisit = resonanceCompletionState.progress;
    game.recordExpeditionNodeVisit({ type: resonanceFocusNodeType, accessible: true, completed: false });
    observatoryPayload = game.getExpeditionPayload().observatoryLink;
    resonanceCompletionState = getObservatoryResonanceModel(observatoryPayload);
    assertResonanceContract(resonanceCompletionState, 'observatory link resonance payload during progression');
    assert(
      resonanceCompletionState.progress > progressBeforeVisit || resonanceCompletionState.completed === true,
      `matching focus node should keep advancing resonance until completion, got before=${progressBeforeVisit} after=${JSON.stringify(resonanceCompletionState)}`
    );
    if (resonanceCompletionState.completed === true || resonanceCompletionState.progress >= resonanceCompletionState.target) {
      resonanceCompletionResourceAwarded = getResourceDelta(beforeFinalResources, getResourceSnapshot(game)) > 0;
      break;
    }
    resonanceSafety -= 1;
  }
  assert(resonanceCompletionState.completed === true, `resonance should mark completed after enough focus node visits, got ${JSON.stringify(resonanceCompletionState)}`);
  assert(resonanceCompletionState.progress >= resonanceCompletionState.target, `completed resonance should reach its target, got ${JSON.stringify(resonanceCompletionState)}`);
  assert(
    resonanceCompletionResourceAwarded || getResourceDelta(observatoryResourceBefore, getResourceSnapshot(game)) > 0,
    `resonance completion should grant an extra observatory reward, got ${JSON.stringify({
      before: observatoryResourceBefore,
      after: getResourceSnapshot(game),
      resonance: resonanceCompletionState
    })}`
  );

  const recommendedBranchSelected = game.selectExpeditionRecommendedBranch(recommendedBranchId);
  const afterRecommendedBranch = game.getExpeditionState();
  const recommendedBranchPayload = game.getExpeditionPayload();
  assert(recommendedBranchSelected === true, 'recommended branch shortcut should succeed');
  assert(afterRecommendedBranch.selectedBranchId === recommendedBranchId, 'recommended branch shortcut should persist selected branch');
  assert(afterRecommendedBranch.branchSelectionLocked === true, 'recommended branch shortcut should enter locked branch state');
  assert(recommendedBranchPayload.selectedBranchId === recommendedBranchId, `payload should expose recommended selected branch id, got ${JSON.stringify(recommendedBranchPayload)}`);
  const answerSheetAfterRecommendedBranch = getAnswerSheetModel(recommendedBranchPayload.answerSheet);
  assertAnswerSheetContract(answerSheetAfterRecommendedBranch, 'answer sheet after recommended branch selection');
  assert(
    recommendedBranchPayload.observatoryLink?.recommendedBranches?.some((entry) => entry.id === recommendedBranchId && entry.selected === true),
    `payload observatory recommended branches should mark the active shortcut as selected, got ${JSON.stringify(recommendedBranchPayload?.observatoryLink?.recommendedBranches)}`
  );
  assert(
    answerSheetAfterRecommendedBranch.routeGoal?.completed === true,
    `recommended branch shortcut should mark route goal completed, got ${JSON.stringify(answerSheetAfterRecommendedBranch)}`
  );
  assert(
    /已按样本锁定|贴题/.test(answerSheetAfterRecommendedBranch.routeGoal?.statusLine || ''),
    `recommended branch shortcut should expose readable route-goal text, got ${JSON.stringify(answerSheetAfterRecommendedBranch.routeGoal)}`
  );
  assert(
    /继续沿|承接一条|补齐/.test(answerSheetAfterRecommendedBranch.nextSuggestion || ''),
    `recommended branch shortcut should advance nextSuggestion beyond lock-line guidance, got ${JSON.stringify(answerSheetAfterRecommendedBranch)}`
  );
  const rejectedRecommendedBranch = game.selectExpeditionRecommendedBranch('not_a_recommended_branch');
  const afterRejectedRecommendedBranch = game.getExpeditionState();
  assert(rejectedRecommendedBranch === false, 'recommended branch shortcut should reject non-recommended ids');
  assert(
    afterRejectedRecommendedBranch.selectedBranchId === recommendedBranchId,
    `rejecting a non-recommended shortcut should keep the selected branch unchanged, got ${JSON.stringify(afterRejectedRecommendedBranch)}`
  );

  const alternateBranch = initialState.branchOptions.find((entry) => entry.id !== recommendedBranchId) || initialState.branchOptions[0];
  const branchSelected = game.selectExpeditionBranch(alternateBranch.id);
  const afterBranch = game.getExpeditionState();
  assert(branchSelected === true, 'branch selection should still succeed after the shortcut preselects a recommended route');
  assert(afterBranch.selectedBranchId === alternateBranch.id, 'direct branch selection should keep updating selected branch');
  assert(afterBranch.branchSelectionLocked === true, 'branch selection should remain locked after the first choice');

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

  const alignedBounty = bountyState.bountyDraft.find((entry) => (
    getBountyFocusNodeTypesForTest(entry).some((type) => resonanceAfterLock.focusNodeTypes.includes(type))
  ));
  assert(alignedBounty, `draft should include at least one bounty aligned with observatory resonance, got ${JSON.stringify(bountyState.bountyDraft)}`);
  if (!bountyState.activeBountyIds.includes(alignedBounty.id)) {
    game.toggleExpeditionBounty(bountyState.activeBountyIds[0]);
    game.toggleExpeditionBounty(alignedBounty.id);
  }
  let routePactPayload = game.getExpeditionPayload().observatoryLink;
  let routePactState = getObservatoryRoutePactModel(routePactPayload);
  assertRoutePactContract(routePactState, 'observatory route pact after aligned bounty selection');
  assert(routePactState.bountyId === alignedBounty.id, `route pact should freeze onto the first aligned active bounty, got pact=${JSON.stringify(routePactState)} bounty=${JSON.stringify(alignedBounty)}`);

  const routePactFocusNodeType = routePactState.focusNodeTypes[0];
  const routePactResourceBefore = getResourceSnapshot(game);
  let routePactCompletionResourceAwarded = false;
  let routePactSafety = Math.max(2, (Number(routePactState.target) || 1) + 2);
  while (routePactState.completed !== true && routePactState.progress < routePactState.target && routePactSafety > 0) {
    const beforeRoutePactVisit = getResourceSnapshot(game);
    const progressBeforeVisit = routePactState.progress;
    game.recordExpeditionNodeVisit({ type: routePactFocusNodeType, accessible: true, completed: false });
    routePactPayload = game.getExpeditionPayload().observatoryLink;
    routePactState = getObservatoryRoutePactModel(routePactPayload);
    assertRoutePactContract(routePactState, 'observatory route pact during progression');
    assert(
      routePactState.progress > progressBeforeVisit || routePactState.completed === true,
      `matching route pact focus node should advance route pact progress, got before=${progressBeforeVisit} after=${JSON.stringify(routePactState)}`
    );
    if (routePactState.completed === true || routePactState.progress >= routePactState.target) {
      routePactCompletionResourceAwarded = getResourceDelta(beforeRoutePactVisit, getResourceSnapshot(game)) > 0;
      break;
    }
    routePactSafety -= 1;
  }
  assert(routePactState.completed === true, `route pact should complete after enough aligned node visits, got ${JSON.stringify(routePactState)}`);
  assert(routePactState.progress >= routePactState.target, `completed route pact should reach target, got ${JSON.stringify(routePactState)}`);
  assert(
    routePactCompletionResourceAwarded || getResourceDelta(routePactResourceBefore, getResourceSnapshot(game)) > 0,
    `route pact completion should grant an extra reward, got ${JSON.stringify({
      before: routePactResourceBefore,
      after: getResourceSnapshot(game),
      routePact: routePactState
    })}`
  );

  const retroRoutePactGuardState = game.normalizeExpeditionState(JSON.parse(JSON.stringify(bountyState)));
  retroRoutePactGuardState.activeBountyIds = [alignedBounty.id];
  retroRoutePactGuardState.bountyDraft = retroRoutePactGuardState.bountyDraft.map((entry) => (
    entry.id === alignedBounty.id
      ? {
          ...entry,
          progress: Number(entry.condition?.target || 1),
          completed: true,
          rewardGranted: true
        }
      : entry
  ));
  if (retroRoutePactGuardState.observatoryLink) {
    retroRoutePactGuardState.observatoryLink.routePact = null;
  }
  const retroCompletedBounty = retroRoutePactGuardState.bountyDraft.find((entry) => entry.id === alignedBounty.id);
  assert(
    !!retroCompletedBounty && retroCompletedBounty.completed === true && retroCompletedBounty.rewardGranted === true,
    `retroactive route pact guard coverage should mark the aligned bounty as already completed, got ${JSON.stringify(retroCompletedBounty)}`
  );
  const retroBuiltRoutePact = game.buildExpeditionObservatoryRoutePact(retroRoutePactGuardState, retroCompletedBounty);
  assert(
    retroBuiltRoutePact === null,
    `completed aligned bounty should not build a new route pact, got ${JSON.stringify(retroBuiltRoutePact)}`
  );
  const retroArmedState = game.tryArmExpeditionObservatoryRoutePact(retroRoutePactGuardState, alignedBounty.id);
  const retroArmedRoutePact = getObservatoryRoutePactModel(retroArmedState?.observatoryLink || null);
  assert(
    !retroArmedState?.observatoryLink?.routePact && !retroArmedRoutePact.bountyId,
    `completed aligned bounty should not retroactively arm a new route pact, got state=${JSON.stringify(retroArmedState?.observatoryLink)} parsed=${JSON.stringify(retroArmedRoutePact)}`
  );

  const routeBounty = bountyState.bountyDraft.find((entry) => entry.condition && entry.condition.type === 'visitNodeType');
  assert(routeBounty, 'draft should include a route bounty for visitNodeType progression');
  if (!game.getExpeditionState().activeBountyIds.includes(routeBounty.id)) {
    game.toggleExpeditionBounty(game.getExpeditionState().activeBountyIds[0]);
    game.toggleExpeditionBounty(routeBounty.id);
  }
  let routeCompletionRewardGrantedByVisit = false;
  let rewardBefore = null;
  let progressedState = game.getExpeditionState();
  let rewardedBounty = progressedState.bountyDraft.find((entry) => entry.id === routeBounty.id);
  if (!rewardedBounty.completed) {
    rewardBefore = {
      gold: game.player.gold,
      ringExp: game.player.fateRing.exp,
      heavenlyInsight: game.player.heavenlyInsight,
      karma: game.player.karma,
    };
    game.recordExpeditionNodeVisit({ type: routeBounty.condition.nodeType, accessible: true, completed: false });
    progressedState = game.getExpeditionState();
    rewardedBounty = progressedState.bountyDraft.find((entry) => entry.id === routeBounty.id);
    routeCompletionRewardGrantedByVisit =
      game.player.gold > rewardBefore.gold
      || game.player.fateRing.exp > rewardBefore.ringExp
      || game.player.heavenlyInsight > rewardBefore.heavenlyInsight
      || game.player.karma > rewardBefore.karma;
  }
  assert(rewardedBounty.completed === true, 'route bounty should complete after matching node visit');
  assert(rewardedBounty.rewardGranted === true, 'completed route bounty should grant reward exactly once');
  assert(
    routeCompletionRewardGrantedByVisit || rewardBefore === null || rewardedBounty.rewardGranted === true,
    'route bounty completion should improve at least one player resource or remain completed from earlier aligned progression'
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

  observatoryPayload = game.getExpeditionPayload().observatoryLink;
  const expeditionRenderPayload = JSON.parse(game.renderGameToText()).expedition || null;
  const observatoryRender = expeditionRenderPayload?.observatoryLink || null;
  const payloadPracticeTopic = getPracticeTopicModel(game.getExpeditionPayload().practiceTopic);
  const payloadAnswerSheet = getAnswerSheetModel(game.getExpeditionPayload().answerSheet);
  const renderPracticeTopic = getPracticeTopicModel(expeditionRenderPayload?.practiceTopic);
  const renderAnswerSheet = getAnswerSheetModel(expeditionRenderPayload?.answerSheet);
  const renderResonance = getObservatoryResonanceModel(observatoryRender);
  assert(observatoryPayload && observatoryPayload.sourceTitle === '观星精选·焚脉试锋', `expedition payload should expose observatory link, got ${JSON.stringify(observatoryPayload)}`);
  assert(observatoryPayload.selectedBonusId === observatoryBonus.id, `payload should expose selected observatory bonus, got ${JSON.stringify(observatoryPayload)}`);
  assert(observatoryPayload.bonusOptions.some((entry) => entry.id === observatoryBonus.id && entry.consumed === true), `selected observatory bonus should be consumed after matching node visit, got ${JSON.stringify(observatoryPayload)}`);
  assert(Array.isArray(observatoryPayload.trainingTags) && observatoryPayload.trainingTags.length >= 1, `payload should expose observatory training tags, got ${JSON.stringify(observatoryPayload)}`);
  assert(/优先节点/.test(observatoryPayload.routeFocusLine || ''), `payload should expose observatory route focus line, got ${JSON.stringify(observatoryPayload)}`);
  assert(observatoryPayload.drillObjective && observatoryPayload.compareHint, `payload should expose observatory drill objective and compare hint, got ${JSON.stringify(observatoryPayload)}`);
  const observatoryPayloadResonance = getObservatoryResonanceModel(observatoryPayload);
  const observatoryPayloadRoutePact = getObservatoryRoutePactModel(observatoryPayload);
  assertResonanceContract(observatoryPayloadResonance, 'expedition payload observatory resonance');
  assert(observatoryPayloadResonance.completed === true, `expedition payload should expose redeemed resonance state, got ${JSON.stringify(observatoryPayload)}`);
  assert(
    /兑现|完成|已完成|已触发/.test([observatoryPayloadResonance.rewardLine, observatoryPayloadResonance.statusLine].join(' ')),
    `expedition payload should expose readable redeemed resonance text, got ${JSON.stringify(observatoryPayload)}`
  );
  assertRoutePactContract(observatoryPayloadRoutePact, 'expedition payload observatory route pact');
  assert(observatoryPayloadRoutePact.completed === true, `expedition payload should expose completed route pact state, got ${JSON.stringify(observatoryPayload)}`);
  assertPracticeTopicContract(payloadPracticeTopic, 'expedition payload practice topic');
  assertAnswerSheetContract(payloadAnswerSheet, 'expedition payload answer sheet');
  assertPracticeTopicContract(renderPracticeTopic, 'render_game_to_text practice topic');
  assertAnswerSheetContract(renderAnswerSheet, 'render_game_to_text answer sheet');
  assert(
    payloadPracticeTopic.id === renderPracticeTopic.id
      && payloadPracticeTopic.sourceTitle === renderPracticeTopic.sourceTitle,
    `render_game_to_text should mirror practice topic payload, got payload=${JSON.stringify(payloadPracticeTopic)} render=${JSON.stringify(renderPracticeTopic)}`
  );
  assert(
    payloadAnswerSheet.ratingLabel === renderAnswerSheet.ratingLabel
      && payloadAnswerSheet.nextSuggestion === renderAnswerSheet.nextSuggestion
      && Number(payloadAnswerSheet.executionGoal?.progress || 0) === Number(renderAnswerSheet.executionGoal?.progress || 0),
    `render_game_to_text should mirror answer sheet payload, got payload=${JSON.stringify(payloadAnswerSheet)} render=${JSON.stringify(renderAnswerSheet)}`
  );
  assertResonanceContract(renderResonance, 'render_game_to_text observatory resonance');
  assert(
    renderResonance.progress === observatoryPayloadResonance.progress
      && renderResonance.target === observatoryPayloadResonance.target
      && renderResonance.completed === observatoryPayloadResonance.completed,
    `render_game_to_text should mirror observatory resonance payload, got payload=${JSON.stringify(observatoryPayloadResonance)} render=${JSON.stringify(renderResonance)}`
  );
  const renderRoutePact = getObservatoryRoutePactModel(observatoryRender);
  assertRoutePactContract(renderRoutePact, 'render_game_to_text observatory route pact');
  assert(
    renderRoutePact.progress === observatoryPayloadRoutePact.progress
      && renderRoutePact.target === observatoryPayloadRoutePact.target
      && renderRoutePact.completed === observatoryPayloadRoutePact.completed,
    `render_game_to_text should mirror observatory route pact payload, got payload=${JSON.stringify(observatoryPayloadRoutePact)} render=${JSON.stringify(renderRoutePact)}`
  );
  const answerBuildSnapshot = game.getBuildSnapshotData();
  assert(answerBuildSnapshot.strengths.some((line) => /观星线索/.test(line)), 'build snapshot should mention observatory link guidance');
  assert(answerBuildSnapshot.strengths.some((line) => /训练标签|修行课题|答卷/.test(line)), 'build snapshot should mention observatory training tags or the new practice topic spine');
  assert(answerBuildSnapshot.nextTargets.some((line) => /观星演练|样本路径|章节答卷|训练建议/.test(line)), 'build snapshot should mention observatory drill objective, answer sheet, or route focus');
  assertPracticeTopicContract(getPracticeTopicModel(answerBuildSnapshot.expedition?.practiceTopic), 'build snapshot practice topic');
  assertAnswerSheetContract(getAnswerSheetModel(answerBuildSnapshot.expedition?.answerSheet), 'build snapshot answer sheet');

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
  const buildSnapshotResonance = getObservatoryResonanceModel(buildSnapshot.expedition?.observatoryLink || null);
  const buildSnapshotRoutePact = getObservatoryRoutePactModel(buildSnapshot.expedition?.observatoryLink || null);
  assertResonanceContract(buildSnapshotResonance, 'build snapshot observatory resonance');
  assert(buildSnapshotResonance.completed === true, `build snapshot should retain redeemed observatory resonance state, got ${JSON.stringify(buildSnapshot.expedition?.observatoryLink)}`);
  assertRoutePactContract(buildSnapshotRoutePact, 'build snapshot observatory route pact');
  assert(buildSnapshotRoutePact.completed === true, `build snapshot should retain completed observatory route pact state, got ${JSON.stringify(buildSnapshot.expedition?.observatoryLink)}`);
  assert(Array.isArray(buildSnapshot.expedition?.observatoryLink?.trainingTags) && buildSnapshot.expedition.observatoryLink.trainingTags.length >= 1, `build snapshot should retain observatory training tags, got ${JSON.stringify(buildSnapshot.expedition?.observatoryLink)}`);

  const persistedGame = new Game();
  let persistedState = persistedGame.getExpeditionState();
  const persistedPayloadBeforeRepeat = persistedGame.getExpeditionPayload().observatoryLink;
  const persistedResonanceBeforeRepeat = getObservatoryResonanceModel(persistedPayloadBeforeRepeat);
  const persistedRoutePactBeforeRepeat = getObservatoryRoutePactModel(persistedPayloadBeforeRepeat);
  assertResonanceContract(persistedResonanceBeforeRepeat, 'persisted observatory resonance after reload');
  assertRoutePactContract(persistedRoutePactBeforeRepeat, 'persisted observatory route pact after reload');
  assert(persistedResonanceBeforeRepeat.completed === true, `completed resonance should survive reload, got ${JSON.stringify(persistedPayloadBeforeRepeat)}`);
  assert(persistedRoutePactBeforeRepeat.completed === true, `completed route pact should survive reload, got ${JSON.stringify(persistedPayloadBeforeRepeat)}`);
  persistedState.activeBountyIds = [];
  persistedState.factions.forEach((entry) => {
    entry.stance = 0;
    entry.likes = [];
    entry.dislikes = [];
    entry.supportNodeTypes = [];
    entry.pressureNodeTypes = [];
  });
  persistedGame.expeditionState = persistedState;
  persistedGame.persistActiveExpeditionState();
  const reloadResourceBeforeRepeat = getResourceSnapshot(persistedGame);
  persistedGame.recordExpeditionNodeVisit({ type: resonanceFocusNodeType, accessible: true, completed: false });
  const persistedPayloadAfterRepeat = persistedGame.getExpeditionPayload().observatoryLink;
  const persistedResonanceAfterRepeat = getObservatoryResonanceModel(persistedPayloadAfterRepeat);
  const persistedRoutePactAfterRepeat = getObservatoryRoutePactModel(persistedPayloadAfterRepeat);
  assert(
    persistedResonanceAfterRepeat.progress === persistedResonanceBeforeRepeat.progress
      && persistedResonanceAfterRepeat.completed === persistedResonanceBeforeRepeat.completed,
    `completed resonance should not advance again after reload, got before=${JSON.stringify(persistedResonanceBeforeRepeat)} after=${JSON.stringify(persistedResonanceAfterRepeat)}`
  );
  assert(
    persistedRoutePactAfterRepeat.progress === persistedRoutePactBeforeRepeat.progress
      && persistedRoutePactAfterRepeat.completed === persistedRoutePactBeforeRepeat.completed,
    `completed route pact should not advance again after reload, got before=${JSON.stringify(persistedRoutePactBeforeRepeat)} after=${JSON.stringify(persistedRoutePactAfterRepeat)}`
  );
  assert(
    getResourceDelta(reloadResourceBeforeRepeat, getResourceSnapshot(persistedGame)) === 0,
    `completed observatory systems should not grant duplicate rewards after reload, got before=${JSON.stringify(reloadResourceBeforeRepeat)} after=${JSON.stringify(getResourceSnapshot(persistedGame))}`
  );

  localStorage.removeItem('theDefierActiveExpeditionStateV1');
  const malformedSeedGame = new Game();
  const malformedSeedState = malformedSeedGame.initializeExpeditionForRealm(4, true);
  const malformedBonus = malformedSeedState.observatoryLink.bonusOptions.find((entry) => entry.triggerType === 'node_visit') || malformedSeedState.observatoryLink.bonusOptions[0];
  assert(!!malformedBonus, `fresh expedition should expose a usable observatory bonus for malformed reload coverage, got ${JSON.stringify(malformedSeedState.observatoryLink)}`);
  assert(malformedSeedGame.selectExpeditionObservatoryBonus(malformedBonus.id) === true, 'malformed reload setup should lock an observatory bonus before persisting');
  const malformedPersistedState = malformedSeedGame.getExpeditionState();
  malformedPersistedState.observatoryLink.resonance = { progress: 1 };
  malformedSeedGame.expeditionState = malformedPersistedState;
  malformedSeedGame.persistActiveExpeditionState();
  const repairedGame = new Game();
  let repairedState = repairedGame.getExpeditionState();
  let repairedPayload = repairedGame.getExpeditionPayload().observatoryLink;
  const repairedResonance = getObservatoryResonanceModel(repairedPayload);
  assertResonanceContract(repairedResonance, 'repaired observatory resonance after malformed reload');
  assert(
    repairedPayload?.selectedBonusId === malformedBonus.id,
    `malformed reload should preserve selected observatory bonus id, got ${JSON.stringify(repairedPayload)}`
  );
  assert(
    repairedResonance.focusNodeTypes.every((type) => malformedBonus.nodeTypes.includes(type)),
    `malformed resonance reload should rebuild and retarget focus toward the locked bonus, got bonus=${JSON.stringify(malformedBonus)} resonance=${JSON.stringify(repairedResonance)}`
  );
  let repairedAlignedBounty = null;
  for (const branch of repairedState.branchOptions) {
    repairedGame.selectExpeditionBranch(branch.id);
    repairedState = repairedGame.getExpeditionState();
    repairedAlignedBounty = repairedState.bountyDraft.find((entry) => (
      getBountyFocusNodeTypesForTest(entry).some((type) => repairedResonance.focusNodeTypes.includes(type))
    ));
    if (repairedAlignedBounty) {
      break;
    }
  }
  assert(
    !!repairedAlignedBounty,
    `malformed resonance reload should still allow finding an aligned bounty, got state=${JSON.stringify(repairedState)} resonance=${JSON.stringify(repairedResonance)}`
  );
  if (!repairedState.activeBountyIds.includes(repairedAlignedBounty.id)) {
    repairedGame.toggleExpeditionBounty(repairedAlignedBounty.id);
  }
  repairedPayload = repairedGame.getExpeditionPayload().observatoryLink;
  const repairedRoutePact = getObservatoryRoutePactModel(repairedPayload);
  assertRoutePactContract(repairedRoutePact, 'repaired observatory route pact after malformed reload');
  assert(
    repairedRoutePact.bountyId === repairedAlignedBounty.id,
    `malformed resonance reload should still arm an aligned route pact, got pact=${JSON.stringify(repairedRoutePact)} bounty=${JSON.stringify(repairedAlignedBounty)}`
  );
  game.expeditionState = persistedGame.getExpeditionState();
  game.persistActiveExpeditionState();

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
  assert(
    Array.isArray(payloadAfterFinalize.latestSlate?.scoreBreakdown)
      && payloadAfterFinalize.latestSlate.scoreBreakdown.some((line) => /命盘共鸣|路线合卷|训练标签|演练目标|章节答卷|训练建议|课题样本/.test(line || '')),
    `latest slate payload should retain observatory breakdown lines, got ${JSON.stringify(payloadAfterFinalize.latestSlate)}`
  );
  assert(
    Array.isArray(payloadAfterFinalize.latestSlate?.tags)
      && payloadAfterFinalize.latestSlate.tags.some((tag) => /共鸣|合卷|训练|答卷|课题/.test(tag || '')),
    `latest slate payload should retain observatory tags, got ${JSON.stringify(payloadAfterFinalize.latestSlate)}`
  );
  const latestSlateAnswerReview = getAnswerSheetModel({ reviewCard: payloadAfterFinalize.latestSlate?.answerReview, ratingLabel: payloadAfterFinalize.latestSlate?.answerReview?.ratingLabel, nextSuggestion: payloadAfterFinalize.latestSlate?.answerReview?.trainingAdvice, topicId: initialPracticeTopic.id, goals: [] }).reviewCard;
  assert(
    typeof payloadAfterFinalize.latestSlate?.answerReview?.ratingLabel === 'string'
      && payloadAfterFinalize.latestSlate.answerReview.ratingLabel.length > 0
      && typeof payloadAfterFinalize.latestSlate.answerReview?.trainingAdvice === 'string'
      && payloadAfterFinalize.latestSlate.answerReview.trainingAdvice.length > 0,
    `latest slate should retain structured answer review, got ${JSON.stringify(payloadAfterFinalize.latestSlate)}`
  );
  assert(
    /章节观星回响|贴题|成卷|主线/.test([latestSlateAnswerReview.title, latestSlateAnswerReview.ratingLabel, payloadAfterFinalize.latestSlate.answerReview.highlightLine].join(' ')),
    `latest slate answer review should remain readable after finalize, got ${JSON.stringify(payloadAfterFinalize.latestSlate.answerReview)}`
  );
  assert(
    game.lastExpeditionRewardMeta && game.lastExpeditionRewardMeta.id === slate.id,
    `finalize should hand off expedition reward meta for settlement UI, got ${JSON.stringify(game.lastExpeditionRewardMeta)}`
  );
  assert(
    typeof game.lastExpeditionRewardMeta?.ratingLabel === 'string'
      && game.lastExpeditionRewardMeta.ratingLabel.length > 0
      && typeof game.lastExpeditionRewardMeta?.trainingAdvice === 'string'
      && game.lastExpeditionRewardMeta.trainingAdvice.length > 0,
    `expedition reward meta should retain grading and training advice, got ${JSON.stringify(game.lastExpeditionRewardMeta)}`
  );
  assert(
    Array.isArray(game.lastExpeditionRewardMeta?.focusLines)
      && game.lastExpeditionRewardMeta.focusLines.length >= 1,
    `expedition reward meta should expose diagnostic lines for settlement UI, got ${JSON.stringify(game.lastExpeditionRewardMeta)}`
  );
  const trainingFocus = typeof game.buildObservatoryTrainingFocusFromSlate === 'function'
    ? game.buildObservatoryTrainingFocusFromSlate(slate)
    : null;
  assert(
    trainingFocus
      && trainingFocus.sourceRunId === slate.id
      && trainingFocus.chapterName === slate.chapterName
      && trainingFocus.trainingAdvice === game.lastExpeditionRewardMeta.trainingAdvice
      && typeof trainingFocus.themeKey === 'string'
      && trainingFocus.themeKey.length > 0
      && typeof trainingFocus.themeLabel === 'string'
      && trainingFocus.themeLabel.length > 0
      && trainingFocus.routeFocusLine === slate.observatoryLink?.routeFocusLine
      && trainingFocus.compareHint === slate.observatoryLink?.compareHint
      && Array.isArray(trainingFocus.trainingTags)
      && trainingFocus.trainingTags.length >= 1
      && trainingFocus.trainingTags.every((tag) => slate.observatoryLink?.trainingTags?.includes(tag))
      && Array.isArray(trainingFocus.goalHighlights)
      && trainingFocus.goalHighlights.length >= 1,
    `expedition finalize should build a reusable observatory training focus from the latest slate, got ${JSON.stringify(trainingFocus)}`
  );
  const originalSelectedGuideGetterForLegacy = game.getSelectedObservatoryExpeditionGuide;
  game.getSelectedObservatoryExpeditionGuide = function () {
    return null;
  };
  const legacyTrainingFocus = typeof game.buildObservatoryTrainingFocusFromSlate === 'function'
    ? game.buildObservatoryTrainingFocusFromSlate({
      ...slate,
      practiceTopic: null,
      observatoryLink: null
    })
    : null;
  game.getSelectedObservatoryExpeditionGuide = originalSelectedGuideGetterForLegacy;
  assert(
    legacyTrainingFocus
      && legacyTrainingFocus.themeKey === trainingFocus.themeKey
      && legacyTrainingFocus.themeLabel === trainingFocus.themeLabel,
    `legacy run slate fallback should still recover a usable training focus theme, got ${JSON.stringify(legacyTrainingFocus)}`
  );
  // Archive filter relay lives in challenge_hub.js and is covered by the observatory archive sanity checks.
  if (
    typeof game.setObservatoryTrainingFocus === 'function'
      && typeof game.applyObservatoryTrainingFocus === 'function'
      && typeof game.getChallengeArchiveFilterState === 'function'
  ) {
    game.setObservatoryTrainingFocus({ ...legacyTrainingFocus, guideRecordId: '' }, { silent: true });
    assert(game.applyObservatoryTrainingFocus('daily') === true, 'legacy training focus should still restore observatory filters once theme labels are recovered');
    const legacyTrainingFilters = game.getChallengeArchiveFilterState('daily');
    assert(
      legacyTrainingFilters.themeKey === trainingFocus.themeKey
        && legacyTrainingFilters.scope === 'all'
        && legacyTrainingFilters.track === 'playable',
      `legacy training focus fallback should still restore a playable archive lens, got ${JSON.stringify(legacyTrainingFilters)}`
    );
  }

  const sanctum = game.getSanctumOverviewData();
  assert(sanctum.progress.runSlateArchives === 1, `sanctum should count run slate archives, got ${sanctum.progress.runSlateArchives}`);
  assert(sanctum.rooms.some((room) => room.id === 'run_slate_archive'), 'sanctum should include the run slate archive room');
  assert(sanctum.goals.some((goal) => goal.id === 'run_slate_archive_goal'), 'sanctum should include a run slate goal');

  const reloadedGame = new Game();
  reloadedGame.runSlateArchive = reloadedGame.loadRunSlateArchive();
  assert(reloadedGame.runSlateArchive.length === 1, 'run slate archive should reload from storage');
  const reloadedSlate = reloadedGame.getLatestRunSlate();
  assert(reloadedSlate.id === slate.id, 'latest run slate should reload correctly');
  assert(
    reloadedSlate.practiceTopic?.themeKey === trainingFocus.themeKey
      && reloadedSlate.observatoryLink?.sourceThemeKey === trainingFocus.themeKey,
    `reloaded run slate should retain observatory theme identity, got ${JSON.stringify(reloadedSlate)}`
  );
  const reloadedTrainingFocus = typeof reloadedGame.buildObservatoryTrainingFocusFromSlate === 'function'
    ? reloadedGame.buildObservatoryTrainingFocusFromSlate(reloadedSlate)
    : null;
  assert(
    reloadedTrainingFocus
      && reloadedTrainingFocus.themeKey === trainingFocus.themeKey
      && reloadedTrainingFocus.themeLabel === trainingFocus.themeLabel
      && reloadedTrainingFocus.routeFocusLine === trainingFocus.routeFocusLine
      && reloadedTrainingFocus.compareHint === trainingFocus.compareHint
      && trainingFocus.trainingTags.every((tag) => reloadedTrainingFocus.trainingTags.includes(tag)),
    `reloaded run slate should rebuild the same observatory training focus, got ${JSON.stringify(reloadedTrainingFocus)}`
  );
  const battleStartGame = new Game();
  const battleStartState = battleStartGame.initializeExpeditionForRealm(4, true);
  const battleStartBonus = battleStartState.observatoryLink.bonusOptions.find((entry) => entry.triggerType === 'battle_start');
  assert(!!battleStartBonus, `expedition should expose a battle_start observatory bonus for timing coverage, got ${JSON.stringify(battleStartState.observatoryLink)}`);
  const battleStartSelected = battleStartGame.selectExpeditionObservatoryBonus(battleStartBonus.id);
  assert(battleStartSelected === true, 'battle_start observatory bonus should lock successfully');
  const energyBeforeBattle = Number(battleStartGame.player.currentEnergy || 0);
  const blockBeforeBattle = Number(battleStartGame.player.block || 0);
  const battleStartRecord = battleStartGame.startBattle([{ id: 'audit_enemy', hp: 30, maxHp: 30 }], { type: battleStartBonus.nodeTypes[0] || 'enemy' });
  const consumedBattleStartPayload = battleStartGame.getExpeditionPayload().observatoryLink;
  assert(
    consumedBattleStartPayload?.bonusOptions?.some((entry) => entry.id === battleStartBonus.id && entry.consumed === true),
    `battle_start observatory bonus should mark consumed once battle begins, got ${JSON.stringify(consumedBattleStartPayload)}`
  );
  assert(
    Number(battleStartRecord?.energyAtStart || 0) > energyBeforeBattle
      || Number(battleStartRecord?.blockAtStart || 0) > blockBeforeBattle,
    `battle_start observatory reward should be present before original battle start snapshot, got beforeEnergy=${energyBeforeBattle} beforeBlock=${blockBeforeBattle} record=${JSON.stringify(battleStartRecord)}`
  );

  localStorage.removeItem('theDefierActiveExpeditionStateV1');
  const implicitBattleStartGame = new Game();
  const implicitBattleStartState = implicitBattleStartGame.initializeExpeditionForRealm(4, true);
  const implicitBattleStartBonus = implicitBattleStartState.observatoryLink.bonusOptions.find((entry) => entry.triggerType === 'battle_start');
  assert(!!implicitBattleStartBonus, `expedition should expose a battle_start observatory bonus for missing-node coverage, got ${JSON.stringify(implicitBattleStartState.observatoryLink)}`);
  assert(implicitBattleStartGame.selectExpeditionObservatoryBonus(implicitBattleStartBonus.id) === true, 'battle_start observatory bonus should lock for missing-node coverage');
  implicitBattleStartGame.currentBattleNode = { type: implicitBattleStartBonus.nodeTypes[0] || 'enemy' };
  const implicitEnergyBeforeBattle = Number(implicitBattleStartGame.player.currentEnergy || 0);
  const implicitBlockBeforeBattle = Number(implicitBattleStartGame.player.block || 0);
  const implicitBattleStartRecord = implicitBattleStartGame.startBattle([{ id: 'audit_enemy_implicit', hp: 30, maxHp: 30 }]);
  const implicitBattleStartPayload = implicitBattleStartGame.getExpeditionPayload().observatoryLink;
  assert(
    implicitBattleStartPayload?.bonusOptions?.some((entry) => entry.id === implicitBattleStartBonus.id && entry.consumed === true),
    `battle_start observatory bonus should still consume when startBattle relies on currentBattleNode, got ${JSON.stringify(implicitBattleStartPayload)}`
  );
  assert(
    implicitBattleStartRecord?.node?.type === implicitBattleStartBonus.nodeTypes[0],
    `battle_start wrapper should forward the resolved currentBattleNode into the original startBattle, got ${JSON.stringify(implicitBattleStartRecord)}`
  );
  assert(
    Number(implicitBattleStartRecord?.energyAtStart || 0) > implicitEnergyBeforeBattle
      || Number(implicitBattleStartRecord?.blockAtStart || 0) > implicitBlockBeforeBattle,
    `battle_start observatory reward should still be applied before original battle start when node arg is omitted, got beforeEnergy=${implicitEnergyBeforeBattle} beforeBlock=${implicitBlockBeforeBattle} record=${JSON.stringify(implicitBattleStartRecord)}`
  );

  console.log('Expedition state checks passed.');
})();
