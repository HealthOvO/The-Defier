import { CHALLENGE_RULES } from "../data/challenge_rules.js";
import { PVPService } from "../services/pvp-service.js";
import { ProgressionService } from "../services/progression-service.js";
import { GameMap } from "./map.js";
import { Utils } from "./utils.js";
import { CHARACTERS } from "../data/index.js";
import { registerHubController } from "../runtime/hub-registry.js";
const ChallengeHubModule = (() => {
const challengeHubMethods = Object.create(null);
  const CHALLENGE_PROGRESS_KEY = 'theDefierChallengeProgressV1';
  const ACTIVE_CHALLENGE_RUN_KEY = 'theDefierActiveChallengeRunV1';
  const CHALLENGE_HUB_STATE_KEY = 'theDefierChallengeHubStateV1';
  const OBSERVATORY_ARCHIVE_KEY = 'theDefierObservatoryArchiveV1';
  const OBSERVATORY_GUIDE_STATE_KEY = 'theDefierObservatoryGuideStateV1';
  const HUB_META = {
    daily: {
      title: '观星台 · 今日天机',
      subtitle: '固定命盘会沉淀成观星样本，可回放、复盘，并继续设为远征线索。',
      label: '今日天机',
      accentClass: 'daily'
    },
    weekly: {
      title: '观星台 · 七日劫数',
      subtitle: '围绕同一套命盘反复冲分，把高分答卷压成观星档案。',
      label: '七日劫数',
      accentClass: 'weekly'
    },
    global: {
      title: '观星台 · 众生试炼',
      subtitle: '在统一规则下积累跨周样本，争夺本周最高试炼分与档案席位。',
      label: '众生试炼',
      accentClass: 'global'
    }
  };
  let originalShowScreen = null;
  let originalShowCharacterSelection = null;
  let originalRenderRunDestinySelection = null;
  let originalRenderSpiritCompanionSelection = null;
  let originalSelectCharacter = null;
  let originalSelectRunDestiny = null;
  let originalSelectSpiritCompanion = null;
  let originalStartNewGame = null;
  let originalStartBattle = null;
  let originalOnBattleWon = null;
  let originalOnBattleLost = null;
  let originalOnRealmComplete = null;
  let originalSaveGame = null;
  let originalLoadGame = null;
  let originalClearSave = null;
  let originalRenderGameToText = null;
  let originalGetSanctumOverviewData = null;
  let originalFinishStrategicNode = null;
  const safeNumber = (value, fallback = 0) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };
  const clampInt = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    const num = Math.floor(safeNumber(value, min));
    return Math.max(min, Math.min(max, num));
  };
  const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const clone = value => {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value && typeof value === 'object' ? {
        ...value
      } : value;
    }
  };
  const hashString = (value = '') => {
    const text = String(value || '');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = hash * 31 + text.charCodeAt(i) >>> 0;
    }
    return hash >>> 0;
  };
  const pad2 = value => String(value).padStart(2, '0');
  const getDayKey = (date = new Date()) => {
    const year = date.getFullYear();
    const month = pad2(date.getMonth() + 1);
    const day = pad2(date.getDate());
    return `${year}-${month}-${day}`;
  };
  const getISOWeekInfo = (date = new Date()) => {
    const target = new Date(date.getTime());
    target.setHours(0, 0, 0, 0);
    target.setDate(target.getDate() + 3 - (target.getDay() + 6) % 7);
    const week1 = new Date(target.getFullYear(), 0, 4);
    const week = 1 + Math.round(((target.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return {
      year: target.getFullYear(),
      week: Math.max(1, week)
    };
  };
  const getWeekKey = (date = new Date()) => {
    const info = getISOWeekInfo(date);
    return `${info.year}-W${pad2(info.week)}`;
  };
  const formatDateLabel = (mode = 'daily', key = '') => {
    if (mode === 'daily') {
      const [year, month, day] = String(key || '').split('-');
      if (year && month && day) return `${year}.${month}.${day}`;
      return '今日轮换';
    }
    if (mode === 'weekly' || mode === 'global') {
      const match = String(key || '').match(/^(\d+)-W(\d+)$/);
      if (match) return `${match[1]} · 第 ${Number(match[2])} 周`;
      return '本周轮换';
    }
    return key || '当前轮换';
  };
  const createProgressEntry = () => ({
    attempts: 0,
    completions: 0,
    bestScore: 0,
    totalScore: 0,
    claimedRewards: {},
    records: [],
    lastResult: null
  });
  const normalizeChallengeRuleSnapshot = (source = null) => {
    const rule = source && typeof source === 'object' ? source : {};
    return {
      id: String(rule.id || ''),
      name: String(rule.name || ''),
      icon: String(rule.icon || '✦'),
      intro: String(rule.intro || ''),
      objective: String(rule.objective || ''),
      targetChapter: String(rule.targetChapter || ''),
      goalRealm: clampInt(rule.goalRealm, 1, 18),
      characterId: String(rule.characterId || ''),
      runDestinyId: String(rule.runDestinyId || ''),
      spiritCompanionId: String(rule.spiritCompanionId || ''),
      vowIds: Array.isArray(rule.vowIds) ? rule.vowIds.map(id => String(id || '')).filter(Boolean).slice(0, 2) : [],
      tags: Array.isArray(rule.tags) ? rule.tags.map(item => String(item || '')).filter(Boolean).slice(0, 6) : [],
      scoreWeights: rule.scoreWeights && typeof rule.scoreWeights === 'object' ? clone(rule.scoreWeights) : {},
      battleModifiers: rule.battleModifiers && typeof rule.battleModifiers === 'object' ? clone(rule.battleModifiers) : {}
    };
  };
  const createObservatoryArchiveState = () => ({
    records: []
  });
  const createObservatoryGuideState = () => ({
    selectedRecordId: '',
    trainingFocus: null,
    updatedAt: 0
  });
  const CHALLENGE_ARCHIVE_SCOPE_META = {
    rotation: {
      label: '本轮'
    },
    mode: {
      label: '同赛道'
    },
    all: {
      label: '跨赛道'
    }
  };
  const CHALLENGE_ARCHIVE_TRACK_META = {
    playable: {
      label: '可回放'
    },
    challenge: {
      label: '挑战成绩'
    },
    replay: {
      label: '回放记录'
    },
    omen: {
      label: '观星预兆'
    },
    all: {
      label: '全部留痕'
    }
  };
  const CHALLENGE_ARCHIVE_OUTCOME_META = {
    all: {
      label: '全部结果'
    },
    completed: {
      label: '完成答卷'
    },
    failed: {
      label: '失手答卷'
    }
  };
  const CHALLENGE_ARCHIVE_SORT_META = {
    recent: {
      label: '最新留痕'
    },
    score_desc: {
      label: '高分优先'
    }
  };
  const SEASON_VERIFICATION_ARCHIVE_SOURCE_MODE_META = {
    all: {
      label: '全部来源'
    }
  };
  const SEASON_VERIFICATION_ARCHIVE_RESULT_META = {
    all: {
      label: '全部判定'
    },
    verified: {
      label: '通过'
    },
    failed: {
      label: '失利'
    },
    deferred: {
      label: '延期'
    },
    pending: {
      label: '待验证'
    }
  };
  const SEASON_VERIFICATION_ARCHIVE_ROLE_META = {
    all: {
      label: '全部角色'
    },
    primary: {
      label: '主验证'
    },
    side: {
      label: '旁验证'
    }
  };
  const SEASON_VERIFICATION_ARCHIVE_SORT_META = {
    recent: {
      label: '最新归档'
    },
    oldest: {
      label: '最早归档'
    }
  };
  const SEASON_VERIFICATION_ARCHIVE_TRAJECTORY_META = {
    all: {
      label: '全部去向'
    },
    carry_forward: {
      label: '转入下周'
    },
    'debt:cleared': {
      label: '债账已清'
    },
    'debt:degraded': {
      label: '债账降级'
    }
  };
  const createChallengeArchiveFilterState = () => ({
    scope: 'mode',
    track: 'playable',
    outcome: 'all',
    themeKey: 'all',
    sortBy: 'recent'
  });
  const createSeasonVerificationArchiveFilterState = () => ({
    sourceMode: 'all',
    resultStatus: 'all',
    phaseKey: 'all',
    trajectoryKey: 'all',
    role: 'all',
    sortBy: 'recent'
  });
  const normalizeChallengeArchiveFilterState = (rawState = null) => {
    const source = rawState && typeof rawState === 'object' ? rawState : {};
    return {
      scope: ['rotation', 'mode', 'all'].includes(source.scope) ? source.scope : 'mode',
      track: ['playable', 'challenge', 'replay', 'omen', 'all'].includes(source.track) ? source.track : 'playable',
      outcome: ['all', 'completed', 'failed'].includes(source.outcome) ? source.outcome : 'all',
      themeKey: String(source.themeKey || 'all') || 'all',
      sortBy: ['recent', 'score_desc'].includes(source.sortBy) ? source.sortBy : 'recent'
    };
  };
  const normalizeSeasonVerificationArchiveFilterState = (rawState = null) => {
    const source = rawState && typeof rawState === 'object' ? rawState : {};
    return {
      sourceMode: String(source.sourceMode || 'all').trim() || 'all',
      resultStatus: ['all', 'verified', 'failed', 'deferred', 'pending'].includes(source.resultStatus) ? source.resultStatus : 'all',
      phaseKey: String(source.phaseKey || 'all').trim() || 'all',
      trajectoryKey: String(source.trajectoryKey || 'all').trim() || 'all',
      role: ['all', 'primary', 'side'].includes(source.role) ? source.role : 'all',
      sortBy: ['recent', 'oldest'].includes(source.sortBy) ? source.sortBy : 'recent'
    };
  };
  const normalizeChallengeArchivePresetEntry = (rawEntry = null) => {
    if (!rawEntry || typeof rawEntry !== 'object') return null;
    return {
      state: normalizeChallengeArchiveFilterState(rawEntry.state),
      updatedAt: clampInt(rawEntry.updatedAt, 0)
    };
  };
  const normalizeChallengeArchivePresetSlots = (rawSlots = null) => {
    const source = Array.isArray(rawSlots) ? rawSlots : [];
    const next = source.slice(0, 2).map(entry => normalizeChallengeArchivePresetEntry(entry));
    while (next.length < 2) next.push(null);
    return next;
  };
  const createChallengeHubState = () => ({
    tab: 'daily',
    archiveFilters: {
      daily: createChallengeArchiveFilterState(),
      weekly: createChallengeArchiveFilterState(),
      global: createChallengeArchiveFilterState()
    },
    verificationArchiveFilters: {
      weekly: createSeasonVerificationArchiveFilterState()
    },
    archivePresets: {
      daily: normalizeChallengeArchivePresetSlots(),
      weekly: normalizeChallengeArchivePresetSlots(),
      global: normalizeChallengeArchivePresetSlots()
    },
    pvpLivePracticeReturn: null
  });
  const normalizePvpLiveDrillSource = (source = null) => {
    const src = source && typeof source === 'object' ? source : {};
    const sourceMatchId = String(src.sourceMatchId || '').trim();
    if (!sourceMatchId) return null;
    const sourceRunId = String(src.sourceRunId || `pvp_live:${sourceMatchId}`).trim();
    const result = ['win', 'loss', 'draw'].includes(String(src.result || '')) ? String(src.result || '') : 'finished';
    const finishReason = String(src.finishReason || '').trim();
    return {
      sourceMatchId,
      sourceRunId: sourceRunId || `pvp_live:${sourceMatchId}`,
      result,
      finishReason,
      recommendedLoadoutId: String(src.recommendedLoadoutId || '').trim(),
      recommendedLoadoutLabel: String(src.recommendedLoadoutLabel || '推荐斗法谱').trim() || '推荐斗法谱',
      themeKey: String(src.themeKey || '').trim(),
      themeLabel: String(src.themeLabel || '').trim(),
      trainingAdvice: String(src.trainingAdvice || '').trim(),
      drillObjective: String(src.drillObjective || '').trim(),
      trainingTags: Array.isArray(src.trainingTags) ? src.trainingTags.map(tag => String(tag || '').trim()).filter(Boolean).slice(0, 4) : []
    };
  };
  const normalizePvpLivePracticeReturnReceipt = (source = null) => {
    const src = source && typeof source === 'object' ? source : {};
    const sourceMatchId = String(src.sourceMatchId || '').trim();
    if (!sourceMatchId) return null;
    const completed = !!src.completed;
    const recommendedLoadoutLabel = String(src.recommendedLoadoutLabel || '推荐斗法谱').trim() || '推荐斗法谱';
    return {
      reportVersion: 'pvp-live-practice-return-v1',
      sourceMatchId,
      sourceRunId: String(src.sourceRunId || `pvp_live:${sourceMatchId}`).trim() || `pvp_live:${sourceMatchId}`,
      completed,
      reason: String(src.reason || '').trim(),
      result: ['win', 'loss', 'draw', 'finished'].includes(String(src.result || '')) ? String(src.result || '') : 'finished',
      finishReason: String(src.finishReason || '').trim(),
      recommendedLoadoutId: String(src.recommendedLoadoutId || '').trim(),
      recommendedLoadoutLabel,
      themeKey: String(src.themeKey || '').trim(),
      themeLabel: String(src.themeLabel || '').trim(),
      trainingAdvice: String(src.trainingAdvice || '').trim(),
      drillObjective: String(src.drillObjective || '').trim(),
      trainingTags: Array.isArray(src.trainingTags) ? src.trainingTags.map(tag => String(tag || '').trim()).filter(Boolean).slice(0, 4) : [],
      rankedImpact: 'none',
      usesHiddenInformation: false,
      nextActionType: 'pvp_live',
      actionValue: 'live',
      ctaLabel: '继续真人排位',
      summaryLine: completed
        ? `真人 PVP 练习已完成，可带着${recommendedLoadoutLabel}回到 live 队列。`
        : `真人 PVP 练习已中断，可先调整${recommendedLoadoutLabel}再回到 live 队列。`,
      updatedAt: clampInt(src.updatedAt, 0)
    };
  };
  const normalizeChallengeHubState = (rawState = null) => {
    const source = rawState && typeof rawState === 'object' ? rawState : {};
    const archiveFilters = source.archiveFilters && typeof source.archiveFilters === 'object' ? source.archiveFilters : {};
    const verificationArchiveFilters = source.verificationArchiveFilters && typeof source.verificationArchiveFilters === 'object' ? source.verificationArchiveFilters : {};
    const archivePresets = source.archivePresets && typeof source.archivePresets === 'object' ? source.archivePresets : {};
    return {
      tab: ['daily', 'weekly', 'global'].includes(source.tab) ? source.tab : 'daily',
      archiveFilters: {
        daily: normalizeChallengeArchiveFilterState(archiveFilters.daily),
        weekly: normalizeChallengeArchiveFilterState(archiveFilters.weekly),
        global: normalizeChallengeArchiveFilterState(archiveFilters.global)
      },
      verificationArchiveFilters: {
        weekly: normalizeSeasonVerificationArchiveFilterState(verificationArchiveFilters.weekly)
      },
      archivePresets: {
        daily: normalizeChallengeArchivePresetSlots(archivePresets.daily),
        weekly: normalizeChallengeArchivePresetSlots(archivePresets.weekly),
        global: normalizeChallengeArchivePresetSlots(archivePresets.global)
      },
      pvpLivePracticeReturn: normalizePvpLivePracticeReturnReceipt(source.pvpLivePracticeReturn)
    };
  };
  const serializeChallengeArchiveFilterState = (state = null) => JSON.stringify(normalizeChallengeArchiveFilterState(state || createChallengeArchiveFilterState()));
  const serializeSeasonVerificationArchiveFilterState = (state = null) => JSON.stringify(normalizeSeasonVerificationArchiveFilterState(state || createSeasonVerificationArchiveFilterState()));
  const resolveSeasonVerificationArchiveTrajectoryMeta = (entry = null) => {
    const source = entry && typeof entry === 'object' ? entry : {};
    if (source.carryIntoNextWeek || String(source.carryIntoWeekTag || '').trim()) {
      return {
        key: 'carry_forward',
        label: SEASON_VERIFICATION_ARCHIVE_TRAJECTORY_META.carry_forward.label
      };
    }
    const debtStatus = String(source.debtStatus || '').trim();
    if (debtStatus === 'cleared') {
      return {
        key: 'debt:cleared',
        label: SEASON_VERIFICATION_ARCHIVE_TRAJECTORY_META['debt:cleared'].label
      };
    }
    if (debtStatus === 'degraded') {
      return {
        key: 'debt:degraded',
        label: SEASON_VERIFICATION_ARCHIVE_TRAJECTORY_META['debt:degraded'].label
      };
    }
    if (debtStatus) {
      return {
        key: `debt:${debtStatus}`,
        label: `债账·${debtStatus}`
      };
    }
    const settlementOutcomeId = String(source.settlementOutcomeId || '').trim();
    const settlementOutcomeLabel = String(source.settlementOutcomeLabel || '').trim();
    if (settlementOutcomeId || settlementOutcomeLabel) {
      return {
        key: `settlement:${settlementOutcomeId || settlementOutcomeLabel}`,
        label: settlementOutcomeLabel || `结算·${settlementOutcomeId}`
      };
    }
    const writebackMode = String(source.writebackMode || '').trim();
    const writebackLabelMap = {
      clear_debt: '清账回写',
      upgrade_verdict: '正卷回写',
      boost_recommendation: '旁证强化',
      degrade: '反证回写',
      carry_forward: '延账顺延',
      pending: '待回写'
    };
    if (writebackMode) {
      return {
        key: `writeback:${writebackMode}`,
        label: writebackLabelMap[writebackMode] || `回写·${writebackMode}`
      };
    }
    return {
      key: 'all',
      label: SEASON_VERIFICATION_ARCHIVE_TRAJECTORY_META.all.label
    };
  };
  const sortObservatoryArchiveEntries = (entries = [], sortBy = 'recent') => {
    const safeSortBy = ['recent', 'score_desc'].includes(sortBy) ? sortBy : 'recent';
    return (Array.isArray(entries) ? entries : []).slice().sort((a, b) => {
      if (safeSortBy === 'score_desc') {
        return clampInt(b?.score, 0) - clampInt(a?.score, 0) || clampInt(b?.at, 0) - clampInt(a?.at, 0);
      }
      return clampInt(b?.at, 0) - clampInt(a?.at, 0) || clampInt(b?.score, 0) - clampInt(a?.score, 0);
    });
  };
  const normalizeTagList = (source = [], limit = 4) => {
    const seen = new Set();
    return (Array.isArray(source) ? source : []).map(item => String(item || '').trim()).filter(Boolean).filter(item => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, Math.max(0, limit));
  };
  const normalizeObservatoryTrainingFocus = (focus = null) => {
    const source = focus && typeof focus === 'object' ? focus : null;
    if (!source) return null;
    const trainingAdvice = String(source.trainingAdvice || '').trim();
    if (!trainingAdvice) return null;
    const themeLabel = String(source.themeLabel || '').trim();
    const themeKey = String(source.themeKey || '').trim() || Object.values(CHALLENGE_THEME_LIBRARY || {}).find(entry => String(entry?.label || '').trim() === themeLabel || String(entry?.signatureTag || '').trim() === themeLabel)?.key || '';
    return {
      sourceRunId: String(source.sourceRunId || source.id || ''),
      chapterName: String(source.chapterName || ''),
      sourceTitle: String(source.sourceTitle || ''),
      guideRecordId: String(source.guideRecordId || source.sourceRecordId || ''),
      themeKey,
      themeLabel,
      ratingLabel: String(source.ratingLabel || ''),
      ratingTone: ['completed', 'selected', 'suggested', 'idle'].includes(String(source.ratingTone || '')) ? String(source.ratingTone) : 'selected',
      trainingAdvice,
      highlightLine: String(source.highlightLine || ''),
      branchName: String(source.branchName || ''),
      routeFocusLine: String(source.routeFocusLine || ''),
      compareHint: String(source.compareHint || ''),
      trainingTags: normalizeTagList(source.trainingTags, 4),
      goalHighlights: (Array.isArray(source.goalHighlights) ? source.goalHighlights : []).map(line => String(line || '').trim()).filter(Boolean).slice(0, 3),
      updatedAt: clampInt(source.updatedAt, 0) || Date.now()
    };
  };
  const CHALLENGE_THEME_LIBRARY = {
    assault: {
      key: 'assault',
      label: '前压爆发',
      signatureTag: '前压爆发',
      compareHint: '对比先手压制、收头效率与能否稳定抢下前段节拍。',
      expeditionNote: '优先战斗稠密路线，把先手优势换成远征的开局节奏。',
      preferredNodes: ['enemy', 'elite', 'trial']
    },
    bulwark: {
      key: 'bulwark',
      label: '稳守续航',
      signatureTag: '稳守续航',
      compareHint: '对比护阵、稳血与长线容错是否真正撑起了收官。',
      expeditionNote: '优先营地、商店与观星路线，把恢复和容错做厚。',
      preferredNodes: ['rest', 'shop', 'observatory']
    },
    forge: {
      key: 'forge',
      label: '法宝共振',
      signatureTag: '法宝共振',
      compareHint: '对比法宝补件速度、经济换强度效率与器灵协同质量。',
      expeditionNote: '优先锻炉、商店与高价值战斗路线，尽快补齐关键部件。',
      preferredNodes: ['forge', 'shop', 'elite']
    },
    oracle: {
      key: 'oracle',
      label: '推演控场',
      signatureTag: '推演控场',
      compareHint: '对比观测收益、读图质量与控场链条的稳定度。',
      expeditionNote: '优先观星、事件与记忆裂隙路线，把信息差换成更稳的决策。',
      preferredNodes: ['observatory', 'event', 'memory_rift']
    },
    tempo: {
      key: 'tempo',
      label: '连携节拍',
      signatureTag: '连携节拍',
      compareHint: '对比连段衔接、中盘滚动速度与资源衰减点。',
      expeditionNote: '优先灵契、事件与普通战路线，把节拍链尽快滚起来。',
      preferredNodes: ['spirit_grotto', 'event', 'enemy']
    },
    marathon: {
      key: 'marathon',
      label: '跨章耐压',
      signatureTag: '跨章耐压',
      compareHint: '对比跨章承压、终盘效率与高压路段的答卷完整度。',
      expeditionNote: '优先精英、试炼与观星路线，让长线答卷更完整。',
      preferredNodes: ['elite', 'trial', 'observatory']
    }
  };
  const CHALLENGE_NODE_LABELS = {
    enemy: '常规战',
    elite: '精英',
    trial: '试炼',
    rest: '营地',
    shop: '商店',
    observatory: '观星台',
    forge: '炼器台',
    event: '事件',
    memory_rift: '记忆裂隙',
    spirit_grotto: '灵契窟',
    forbidden_altar: '禁术坛'
  };
  const CHALLENGE_REASON_LIBRARY = {
    goal_reached: {
      label: '完成线达成'
    },
    battle_lost: {
      label: '战斗失手'
    },
    interrupted: {
      label: '中途收束'
    }
  };
  const CHALLENGE_DANGER_AXIS_LIBRARY = {
    burst: {
      id: 'burst',
      label: '先手爆发',
      summary: '第一拍与瞬时爆发惩罚偏高，若起手没稳住会迅速掉血。',
      counterplay: '优先留开场护盾、首拍减伤与速杀手段，别让第一轮失血滚雪球。',
      reserveGuidance: '首章前建议至少保留 1 次硬减伤、护盾翻盘点或低费止损牌。'
    },
    attrition: {
      id: 'attrition',
      label: '拉锯压强',
      summary: '敌方血量、护盾或跨章耐压更高，越拖越容易被资源税反超。',
      counterplay: '把恢复、补件与法宝节奏提早，避免在中盘因资源税断档。',
      reserveGuidance: '建议每重结束时都保留恢复与补件预算，不要把灵石和补件机会花空。'
    },
    control: {
      id: 'control',
      label: '控场税负',
      summary: '弱化、易伤与压制会持续放大失误成本，容错窗口更窄。',
      counterplay: '预留净化、免控或稳态护盾，避免在 debuff 回合里空过关键输出窗。',
      reserveGuidance: '建议保留净化、低费防御或灵契主动来专门吃掉压制回合。'
    },
    execution: {
      id: 'execution',
      label: '执行门槛',
      summary: '固定命盘、双誓约与跨章目标提高了路线与节拍执行要求。',
      counterplay: '优先按指定命盘完成章节目标，再追求额外分数，不要过早偏离样本。',
      reserveGuidance: '建议先完成指定章节线，再去贪高压战和额外资源点。'
    }
  };
  const resolveChallengeThemeMeta = (rule = null, mode = 'daily') => {
    const source = rule && typeof rule === 'object' ? rule : {};
    const searchText = [source.name, source.intro, source.objective, ...(Array.isArray(source.tags) ? source.tags : [])].join(' ').trim();
    let key = 'assault';
    if (mode === 'global' || /跨章|冲榜|统一规则|长线|众生试炼/.test(searchText)) {
      key = 'marathon';
    } else if (/法宝|器灵|炼器|封炉|锻|炉|法器/.test(searchText)) {
      key = 'forge';
    } else if (/观星|推演|预判|预案|手牌|星录|读图|控场|天机|法则/.test(searchText)) {
      key = 'oracle';
    } else if (/连携|节拍|回响|连段|调度|链/.test(searchText)) {
      key = 'tempo';
    } else if (/护盾|守|稳|医|疗|续航|回生|守阵|反击/.test(searchText)) {
      key = 'bulwark';
    } else if (/爆发|前压|压制|收头|强袭|快攻|冲分|猎首/.test(searchText)) {
      key = 'assault';
    }
    return clone(CHALLENGE_THEME_LIBRARY[key] || CHALLENGE_THEME_LIBRARY.assault);
  };
  const normalizeChallengeMetricSnapshot = (source = null) => {
    const metrics = source && typeof source === 'object' ? source : {};
    return {
      hpRatio: Math.max(0, Math.min(1, safeNumber(metrics.hpRatio, 0))),
      lawGains: clampInt(metrics.lawGains, 0, 99),
      treasureGains: clampInt(metrics.treasureGains, 0, 99),
      battleWins: clampInt(metrics.battleWins, 0, 99),
      eliteWins: clampInt(metrics.eliteWins, 0, 99),
      bossWins: clampInt(metrics.bossWins, 0, 99),
      realmClears: clampInt(metrics.realmClears, 0, 99)
    };
  };
  const normalizeChallengeDangerProfile = (profile = null) => {
    const source = profile && typeof profile === 'object' ? profile : {};
    const axes = Array.isArray(source.axes) ? source.axes : [];
    return {
      index: clampInt(source.index, 0, 100),
      tierId: String(source.tierId || 'controlled'),
      tierLabel: String(source.tierLabel || '可控'),
      dominantAxisId: String(source.dominantAxisId || 'burst'),
      dominantAxisLabel: String(source.dominantAxisLabel || CHALLENGE_DANGER_AXIS_LIBRARY.burst.label),
      summary: String(source.summary || ''),
      counterplay: String(source.counterplay || ''),
      reserveGuidance: String(source.reserveGuidance || ''),
      line: String(source.line || ''),
      axes: axes.filter(axis => axis && typeof axis === 'object').slice(0, 4).map(axis => ({
        id: String(axis.id || ''),
        label: String(axis.label || ''),
        value: clampInt(axis.value, 0, 100)
      }))
    };
  };
  const normalizeChallengeArchiveInsight = (insight = null) => {
    const source = insight && typeof insight === 'object' ? insight : {};
    return {
      title: String(source.title || ''),
      summary: String(source.summary || ''),
      focusLines: normalizeTagList(Array.isArray(source.focusLines) ? source.focusLines : [], 3),
      preferredNodeLine: String(source.preferredNodeLine || ''),
      reasonLabel: String(source.reasonLabel || ''),
      trainingTags: normalizeTagList(Array.isArray(source.trainingTags) ? source.trainingTags : [], 3),
      coachBrief: String(source.coachBrief || ''),
      drillObjective: String(source.drillObjective || '')
    };
  };
  const hasChallengeArchiveInsight = (insight = null) => {
    const normalized = normalizeChallengeArchiveInsight(insight);
    return !!(normalized.title || normalized.summary || normalized.focusLines.length > 0);
  };
  const serializeChallengeDangerProfile = (profile = null) => {
    const normalized = normalizeChallengeDangerProfile(profile);
    return {
      index: normalized.index,
      tierId: normalized.tierId,
      tierLabel: normalized.tierLabel,
      dominantAxisId: normalized.dominantAxisId,
      dominantAxisLabel: normalized.dominantAxisLabel,
      summary: normalized.summary,
      counterplay: normalized.counterplay,
      reserveGuidance: normalized.reserveGuidance,
      line: normalized.line,
      axes: normalized.axes.map(axis => ({
        id: axis.id,
        label: axis.label,
        value: axis.value
      }))
    };
  };
  const serializeChallengeArchiveInsight = (insight = null) => {
    const normalized = normalizeChallengeArchiveInsight(insight);
    if (!normalized.title && !normalized.summary && normalized.focusLines.length === 0 && normalized.trainingTags.length === 0 && !normalized.drillObjective) return null;
    return {
      title: normalized.title,
      summary: normalized.summary,
      focusLines: normalized.focusLines.slice(0, 3),
      preferredNodeLine: normalized.preferredNodeLine,
      reasonLabel: normalized.reasonLabel,
      trainingTags: normalized.trainingTags.slice(0, 3),
      coachBrief: normalized.coachBrief,
      drillObjective: normalized.drillObjective
    };
  };
  const buildChallengeFeaturedTier = (run = null, metrics = null, options = {}) => {
    const sourceRun = run && typeof run === 'object' ? run : {};
    const snapshot = normalizeChallengeMetricSnapshot(metrics);
    const completed = !!options.completed;
    const replayOnly = !!sourceRun.replayOnly;
    const score = clampInt(sourceRun.finalScore, 0);
    const goalRealm = clampInt(sourceRun.goalRealm, 1, 18);
    const benchmark = goalRealm * 42;
    if (!completed) return replayOnly ? '回放留痕' : '中断留痕';
    if (score >= benchmark + 120 || snapshot.hpRatio >= 0.86 || snapshot.eliteWins + snapshot.bossWins >= 2) {
      return replayOnly ? '回放标杆' : '标杆命盘';
    }
    return replayOnly ? '回放样本' : '精选命盘';
  };
  const buildChallengeFeaturedTags = (rule = null, run = null, metrics = null, themeMeta = null, options = {}) => {
    const sourceRule = rule && typeof rule === 'object' ? rule : {};
    const sourceRun = run && typeof run === 'object' ? run : {};
    const snapshot = normalizeChallengeMetricSnapshot(metrics);
    const meta = themeMeta || resolveChallengeThemeMeta(sourceRule, sourceRun.mode || options.mode || 'daily');
    const tags = [];
    if (meta.signatureTag) tags.push(meta.signatureTag);
    if (options.completed && snapshot.realmClears >= clampInt(sourceRun.goalRealm, 1, 18)) {
      tags.push(clampInt(sourceRun.goalRealm, 1, 18) >= 6 ? '跨章冲线' : '准时冲线');
    }
    if (options.completed && snapshot.hpRatio >= 0.78) tags.push('稳血收官');
    if (snapshot.lawGains >= 2) tags.push('法则补全');
    if (snapshot.treasureGains >= 1) tags.push('法宝补件');
    if (snapshot.eliteWins + snapshot.bossWins >= 2) tags.push('高压过线');
    if (sourceRun.replayOnly) tags.push(options.completed ? '回放复刻' : '回放试错');
    if (!options.completed) tags.push(snapshot.hpRatio >= 0.45 ? '中盘止损' : '高压折返');
    normalizeTagList(sourceRule.tags, 2).forEach(tag => tags.push(tag));
    return normalizeTagList(tags, 4);
  };
  const formatChallengeMetricLine = (metrics = null) => {
    const snapshot = normalizeChallengeMetricSnapshot(metrics);
    const parts = [`血线 ${Math.round(snapshot.hpRatio * 100)}%`];
    if (snapshot.lawGains > 0) parts.push(`法则 +${snapshot.lawGains}`);
    if (snapshot.treasureGains > 0) parts.push(`法宝 +${snapshot.treasureGains}`);
    if (snapshot.eliteWins + snapshot.bossWins > 0) parts.push(`高压战 ${snapshot.eliteWins + snapshot.bossWins}`);
    return parts.join(' · ');
  };
  const formatChallengePreferredNodes = (preferredNodes = []) => normalizeTagList(preferredNodes.map(nodeId => CHALLENGE_NODE_LABELS[nodeId] || String(nodeId || '').trim()).filter(Boolean), 3);
  const buildChallengePreferredNodeLine = (preferredNodes = []) => {
    const labels = formatChallengePreferredNodes(preferredNodes);
    return labels.length > 0 ? `优先节点：${labels.join(' / ')}` : '';
  };
  const buildChallengeTrainingTags = (entry = {}, themeMeta = null) => {
    const source = entry && typeof entry === 'object' ? entry : {};
    const metrics = normalizeChallengeMetricSnapshot(source.metrics);
    const meta = themeMeta || resolveChallengeThemeMeta(source.rule, source.mode || 'daily');
    const highPressureCount = clampInt(metrics.eliteWins + metrics.bossWins, 0, 99);
    const resourceCount = clampInt(metrics.lawGains + metrics.treasureGains, 0, 99);
    const tags = [];
    if (metrics.hpRatio >= 0.78) {
      tags.push('稳血收官');
    } else if (!source.completed && metrics.hpRatio < 0.45) {
      tags.push('血线修复');
    }
    if (highPressureCount >= 2) {
      tags.push('高压过线');
    } else if (!source.completed && highPressureCount >= 1) {
      tags.push('高压纠偏');
    }
    if (resourceCount >= 3) {
      tags.push('补件成型');
    } else if (resourceCount === 0) {
      tags.push(source.completed ? '极简过线' : '补件断档');
    }
    if (metrics.realmClears >= clampInt(source.rule?.goalRealm || source.goalRealm, 1, 18)) {
      tags.push(clampInt(source.rule?.goalRealm || source.goalRealm, 1, 18) >= 6 ? '跨章耐压' : '准时冲线');
    } else if (!source.completed && metrics.realmClears <= 1) {
      tags.push('前段补课');
    }
    if (meta.key === 'oracle' && metrics.lawGains >= 1) tags.push('读图控场');
    if (meta.key === 'assault' && highPressureCount >= 1) tags.push('前段抢拍');
    return normalizeTagList(tags, 3);
  };
  const buildChallengeCoachBrief = (entry = {}, themeMeta = null) => {
    const source = entry && typeof entry === 'object' ? entry : {};
    const metrics = normalizeChallengeMetricSnapshot(source.metrics);
    const meta = themeMeta || resolveChallengeThemeMeta(source.rule, source.mode || 'daily');
    const preferredNodes = Array.isArray(source.preferredNodes) && source.preferredNodes.length > 0 ? source.preferredNodes : meta.preferredNodes;
    const preferredNodeLine = buildChallengePreferredNodeLine(preferredNodes);
    const hpPercent = clampInt(Math.round(metrics.hpRatio * 100), 0, 100);
    const highPressureCount = clampInt(metrics.eliteWins + metrics.bossWins, 0, 99);
    const resourceCount = clampInt(metrics.lawGains + metrics.treasureGains, 0, 99);
    if (source.completed) {
      if (highPressureCount >= 2) {
        return `${preferredNodeLine || '先沿主题关键节点走'}，并把爆发与兜底留到高压段再交。`;
      }
      if (hpPercent >= 78) {
        return `${preferredNodeLine || '先沿主题关键节点走'}，把血线稳到收官再提速冲线。`;
      }
      if (resourceCount > 0) {
        return `${preferredNodeLine || '先沿主题关键节点走'}，用现成补件把主题答卷压实。`;
      }
      return `${preferredNodeLine || '沿主题关键节点走'}，按这份命盘的节奏稳稳过线。`;
    }
    if (hpPercent < 45) {
      return '先补恢复、护盾或减伤，把血线修回安全区后再接高压战。';
    }
    if (resourceCount === 0) {
      return `${preferredNodeLine || '先沿主题关键节点走'}，先补 1 组关键件再继续冲线。`;
    }
    if (highPressureCount === 0) {
      return `${preferredNodeLine || '先沿主题关键节点走'}，先补信息与资源，再去接第一场高压战。`;
    }
    return '把关键爆发与保命手段留到下一场高压战，先修正失手点再复刻。';
  };
  const buildChallengeDrillObjective = (entry = {}, themeMeta = null) => {
    const source = entry && typeof entry === 'object' ? entry : {};
    const metrics = normalizeChallengeMetricSnapshot(source.metrics);
    const meta = themeMeta || resolveChallengeThemeMeta(source.rule, source.mode || 'daily');
    const preferredNodes = Array.isArray(source.preferredNodes) && source.preferredNodes.length > 0 ? source.preferredNodes : meta.preferredNodes;
    const preferredNodeLabels = formatChallengePreferredNodes(preferredNodes);
    const preferredNodeText = preferredNodeLabels.length > 0 ? preferredNodeLabels.join(' / ') : '主题关键节点';
    const hpPercent = clampInt(Math.round(metrics.hpRatio * 100), 0, 100);
    const highPressureCount = clampInt(metrics.eliteWins + metrics.bossWins, 0, 99);
    const resourceCount = clampInt(metrics.lawGains + metrics.treasureGains, 0, 99);
    const goalRealm = clampInt(source.rule?.goalRealm || source.goalRealm, 1, 18);
    if (source.completed) {
      if (highPressureCount >= 2) {
        return `在第 ${goalRealm} 重前保留一段爆发或兜底，按原顺序处理 ${highPressureCount} 场高压战。`;
      }
      if (hpPercent >= 78) {
        return `沿 ${preferredNodeText} 线推进，把血线维持在 ${Math.max(60, hpPercent - 10)}% 以上进入收官。`;
      }
      if (resourceCount > 0) {
        return `先补齐当前样本里的法则 / 法宝关键件，再按 ${preferredNodeText} 线完成冲线。`;
      }
      return `沿 ${preferredNodeText} 线复刻这份命盘的推进顺序，稳定完成第 ${goalRealm} 重。`;
    }
    if (hpPercent < 45) {
      return '先补恢复或护盾，把血线稳定到 55% 以上后再回到高压战。';
    }
    if (highPressureCount === 0) {
      return `先踩 ${preferredNodeText} 补信息与资源，再去接第一场高压战。`;
    }
    if (resourceCount === 0) {
      return '先补 1 组法则或法宝关键件，再回到当前主题路线继续推进。';
    }
    return `保留关键资源穿过下一场高压战，并把血线带进第 ${Math.max(1, metrics.realmClears + 1)} 重。`;
  };
  const formatChallengeComparisonDelta = (current, benchmark, unit = '') => {
    const delta = clampInt(current - benchmark, -999, 999);
    if (delta === 0) return '与主题标杆持平';
    const amount = Math.abs(delta);
    return delta > 0 ? `高于主题标杆 ${amount}${unit}` : `低于主题标杆 ${amount}${unit}`;
  };
  const formatChallengeComparisonHpLine = (label, current, benchmark, isBenchmark) => `${label}：${current}% · ${isBenchmark ? '当前主题标杆' : formatChallengeComparisonDelta(current, benchmark, '%')}`;
  const formatChallengeComparisonPressureLine = (label, current, benchmark, isBenchmark) => `${label}：${current} 场 · ${isBenchmark ? '当前主题标杆' : formatChallengeComparisonDelta(current, benchmark, ' 场')}`;
  const formatChallengeComparisonScoreLine = (label, current, benchmark, isBenchmark) => `${label}：${current} 分 · ${isBenchmark ? '当前主题标杆' : formatChallengeComparisonDelta(current, benchmark, ' 分')}`;
  const formatChallengeComparisonProgressLine = (label, current, benchmark, target, isBenchmark) => {
    if (isBenchmark) return `${label}：第 ${current} 重 / 完成线 ${target} 重 · 当前主题标杆`;
    return `${label}：第 ${current} 重 / 完成线 ${target} 重 · ${current === benchmark ? '与主题标杆同段' : formatChallengeComparisonDelta(current, benchmark, ' 重')}`;
  };
  const formatChallengeComparisonResourceLine = (label, currentText, currentCount, benchmarkText, benchmarkCount, isBenchmark) => `${label}：${currentText}${isBenchmark ? ' · 当前主题标杆' : ` · ${currentCount === benchmarkCount ? `与标杆同档（${benchmarkText}）` : formatChallengeComparisonDelta(currentCount, benchmarkCount, ' 项')}`}`;
  const formatChallengeComparisonRouteLine = (label, preferredNodeLine, compareHint) => `${label}：${preferredNodeLine || compareHint || '按主题关键节点推进'}`;
  const buildChallengeComparisonAxes = (entry = {}, benchmarkEntry = null, themeMeta = null) => {
    const metrics = normalizeChallengeMetricSnapshot(entry.metrics);
    const benchmarkMetrics = normalizeChallengeMetricSnapshot(benchmarkEntry?.metrics);
    const meta = themeMeta || resolveChallengeThemeMeta(entry.rule, entry.mode || 'daily');
    const hpPercent = clampInt(Math.round(metrics.hpRatio * 100), 0, 100);
    const benchmarkHpPercent = clampInt(Math.round(benchmarkMetrics.hpRatio * 100), 0, 100);
    const highPressureCount = clampInt(metrics.eliteWins + metrics.bossWins, 0, 99);
    const benchmarkHighPressureCount = clampInt(benchmarkMetrics.eliteWins + benchmarkMetrics.bossWins, 0, 99);
    const resourceCount = clampInt(metrics.lawGains + metrics.treasureGains, 0, 99);
    const benchmarkResourceCount = clampInt(benchmarkMetrics.lawGains + benchmarkMetrics.treasureGains, 0, 99);
    const score = clampInt(entry.score, 0, 9999);
    const benchmarkScore = clampInt(benchmarkEntry?.score, 0, 9999);
    const goalRealm = clampInt(entry.rule?.goalRealm || entry.goalRealm, 1, 18);
    const realmClears = clampInt(metrics.realmClears, 0, goalRealm);
    const benchmarkRealmClears = clampInt(benchmarkMetrics.realmClears, 0, goalRealm);
    const resourceText = resourceCount > 0 ? `法则 +${metrics.lawGains} / 法宝 +${metrics.treasureGains}` : '尚未形成补件';
    const benchmarkResourceText = benchmarkResourceCount > 0 ? `法则 +${benchmarkMetrics.lawGains} / 法宝 +${benchmarkMetrics.treasureGains}` : '尚未形成补件';
    const preferredNodes = Array.isArray(entry.preferredNodes) && entry.preferredNodes.length > 0 ? entry.preferredNodes : meta.preferredNodes;
    const preferredNodeLine = buildChallengePreferredNodeLine(preferredNodes);
    const isBenchmark = !!benchmarkEntry && entry.id === benchmarkEntry.id;
    switch (meta.key) {
      case 'assault':
        return [{
          key: 'tempo',
          label: '前段节拍',
          line: formatChallengeComparisonScoreLine('前段节拍', score, benchmarkScore, isBenchmark)
        }, {
          key: 'finish',
          label: '收头效率',
          line: formatChallengeComparisonProgressLine('收头效率', realmClears, benchmarkRealmClears, goalRealm, isBenchmark)
        }, {
          key: 'pressure',
          label: '高压接战',
          line: formatChallengeComparisonPressureLine('高压接战', highPressureCount, benchmarkHighPressureCount, isBenchmark)
        }];
      case 'bulwark':
        return [{
          key: 'stability',
          label: '血线稳定',
          line: formatChallengeComparisonHpLine('血线稳定', hpPercent, benchmarkHpPercent, isBenchmark)
        }, {
          key: 'guard',
          label: '守阵容错',
          line: formatChallengeComparisonRouteLine('守阵容错', preferredNodeLine, meta.compareHint)
        }, {
          key: 'sustain',
          label: '续航补件',
          line: formatChallengeComparisonResourceLine('续航补件', resourceText, resourceCount, benchmarkResourceText, benchmarkResourceCount, isBenchmark)
        }];
      case 'forge':
        return [{
          key: 'assembly',
          label: '补件速度',
          line: formatChallengeComparisonResourceLine('补件速度', resourceText, resourceCount, benchmarkResourceText, benchmarkResourceCount, isBenchmark)
        }, {
          key: 'conversion',
          label: '器灵换强',
          line: formatChallengeComparisonScoreLine('器灵换强', score, benchmarkScore, isBenchmark)
        }, {
          key: 'pressure',
          label: '高压兑现',
          line: formatChallengeComparisonPressureLine('高压兑现', highPressureCount, benchmarkHighPressureCount, isBenchmark)
        }];
      case 'oracle':
        return [{
          key: 'reading',
          label: '观测收益',
          line: formatChallengeComparisonResourceLine('观测收益', resourceText, resourceCount, benchmarkResourceText, benchmarkResourceCount, isBenchmark)
        }, {
          key: 'route',
          label: '路线贴合',
          line: formatChallengeComparisonRouteLine('路线贴合', preferredNodeLine, meta.compareHint)
        }, {
          key: 'control',
          label: '控场稳定',
          line: formatChallengeComparisonHpLine('控场稳定', hpPercent, benchmarkHpPercent, isBenchmark)
        }];
      case 'tempo':
        return [{
          key: 'chain',
          label: '连段续速',
          line: formatChallengeComparisonScoreLine('连段续速', score, benchmarkScore, isBenchmark)
        }, {
          key: 'midgame',
          label: '中盘滚动',
          line: formatChallengeComparisonProgressLine('中盘滚动', realmClears, benchmarkRealmClears, goalRealm, isBenchmark)
        }, {
          key: 'erosion',
          label: '资源衰减',
          line: formatChallengeComparisonHpLine('资源衰减', hpPercent, benchmarkHpPercent, isBenchmark)
        }];
      case 'marathon':
        return [{
          key: 'endurance',
          label: '跨章耐压',
          line: formatChallengeComparisonProgressLine('跨章耐压', realmClears, benchmarkRealmClears, goalRealm, isBenchmark)
        }, {
          key: 'finish',
          label: '终盘完整度',
          line: formatChallengeComparisonHpLine('终盘完整度', hpPercent, benchmarkHpPercent, isBenchmark)
        }, {
          key: 'pressure',
          label: '高压答卷',
          line: formatChallengeComparisonPressureLine('高压答卷', highPressureCount, benchmarkHighPressureCount, isBenchmark)
        }];
      default:
        break;
    }
    return [{
      key: 'stability',
      label: '血线稳定',
      line: formatChallengeComparisonHpLine('血线稳定', hpPercent, benchmarkHpPercent, isBenchmark)
    }, {
      key: 'pressure',
      label: '高压处理',
      line: formatChallengeComparisonPressureLine('高压处理', highPressureCount, benchmarkHighPressureCount, isBenchmark)
    }, {
      key: 'assembly',
      label: '补件效率',
      line: formatChallengeComparisonResourceLine('补件效率', resourceText, resourceCount, benchmarkResourceText, benchmarkResourceCount, isBenchmark)
    }];
  };
  const buildChallengeArchiveInsight = (entry = {}, themeMeta = null) => {
    const source = entry && typeof entry === 'object' ? entry : {};
    const metrics = normalizeChallengeMetricSnapshot(source.metrics);
    const meta = themeMeta || resolveChallengeThemeMeta(source.rule, source.mode || 'daily');
    const preferredNodeLabels = formatChallengePreferredNodes(Array.isArray(source.preferredNodes) && source.preferredNodes.length > 0 ? source.preferredNodes : meta.preferredNodes);
    const preferredNodeLine = buildChallengePreferredNodeLine(Array.isArray(source.preferredNodes) && source.preferredNodes.length > 0 ? source.preferredNodes : meta.preferredNodes);
    const hpPercent = clampInt(Math.round(metrics.hpRatio * 100), 0, 100);
    const highPressureCount = clampInt(metrics.eliteWins + metrics.bossWins, 0, 99);
    const resourceParts = [];
    if (metrics.lawGains > 0) resourceParts.push(`法则 +${metrics.lawGains}`);
    if (metrics.treasureGains > 0) resourceParts.push(`法宝 +${metrics.treasureGains}`);
    const reasonLabel = CHALLENGE_REASON_LIBRARY[source.reason]?.label || '本轮留痕';
    const focusLines = [];
    const trainingTags = buildChallengeTrainingTags(source, meta);
    const coachBrief = buildChallengeCoachBrief(source, meta);
    const drillObjective = buildChallengeDrillObjective(source, meta);
    let title = source.replayOnly ? '回放样本' : '挑战留痕';
    let summary = `${meta.label} 主题已写入观察站，可继续拿来复盘。`;
    if (source.completed) {
      title = source.replayOnly ? '回放复刻' : '复刻重点';
      const keyword = hpPercent >= 78 ? '稳血收官' : highPressureCount >= 2 ? '高压过线' : metrics.lawGains >= 2 ? '法则补全' : reasonLabel;
      summary = `${keyword}：${meta.label} 样本保住了 ${hpPercent}% 血线${highPressureCount > 0 ? `，并处理了 ${highPressureCount} 场高压战` : ''}。`;
      if (preferredNodeLine) focusLines.push(preferredNodeLine);
      focusLines.push(highPressureCount >= 2 ? '复刻建议：高压战前先预留护盾、减伤或控场，再按这套命盘推进。' : `复刻建议：优先沿主题节点走，尽量把血线维持在 ${Math.max(55, Math.min(90, hpPercent || 65))}% 左右进入收官。`);
      if (resourceParts.length > 0) {
        focusLines.push(`资源抓手：${resourceParts.join(' / ')}。`);
      } else if (meta.expeditionNote) {
        focusLines.push(`路线提示：${meta.expeditionNote}`);
      }
    } else {
      title = source.replayOnly ? '回放试错' : '失手剖面';
      const failKeyword = hpPercent < 35 ? '血线失守' : highPressureCount >= 1 ? '高压段断档' : resourceParts.length === 0 ? '补件断档' : reasonLabel;
      summary = `${failKeyword}：这份${source.replayOnly ? '回放样本' : '挑战留痕'}停在 ${hpPercent}% 血线${highPressureCount > 0 ? `，已吃下 ${highPressureCount} 场高压战` : ''}。`;
      if (preferredNodeLine) focusLines.push(preferredNodeLine);
      if (hpPercent < 45) {
        focusLines.push('补救建议：下次先把恢复、护盾或减伤做厚，再回到高压节点。');
      } else if (highPressureCount === 0) {
        focusLines.push('补救建议：先按主题优先节点补信息与资源，再去打第一场高压战。');
      } else {
        focusLines.push('补救建议：进入高压战前留住爆发与兜底，不要把关键资源耗在前段。');
      }
      if (resourceParts.length === 0) {
        focusLines.push('资源缺口：本轮没有形成法则/法宝补件，建议先补一组关键件再复刻。');
      } else {
        focusLines.push(`本轮抓到：${resourceParts.join(' / ')}，可以保留这部分路线，再修正失手点。`);
      }
    }
    return {
      title,
      summary,
      focusLines: normalizeTagList(focusLines, 3),
      preferredNodeLine,
      reasonLabel,
      trainingTags,
      coachBrief,
      drillObjective
    };
  };
  const renderChallengeInsightMarkup = (insight = null, options = {}) => {
    if (!insight || typeof insight !== 'object') return '';
    const compact = !!options.compact;
    const trainingTags = normalizeTagList(Array.isArray(insight.trainingTags) ? insight.trainingTags : [], compact ? 2 : 3);
    const lines = Array.isArray(insight.focusLines) ? insight.focusLines.filter(Boolean).slice(0, compact ? 2 : 3) : [];
    const detailLines = insight.drillObjective ? [...lines, `演练目标：${insight.drillObjective}`].slice(0, compact ? 3 : 4) : lines;
    if (!insight.title && !insight.summary && detailLines.length === 0 && trainingTags.length === 0) return '';
    return `
            <div class="challenge-record-insight${compact ? ' compact' : ''}">
                ${insight.title ? `<strong>${escapeHtml(insight.title)}</strong>` : ''}
                ${insight.summary ? `<p>${escapeHtml(insight.summary)}</p>` : ''}
                ${trainingTags.length > 0 ? `<div class="challenge-record-tags">${trainingTags.map(tag => `<span class="challenge-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
                ${detailLines.length > 0 ? `<div class="challenge-record-insight-lines">${detailLines.map(line => `<span class="challenge-record-insight-line">${escapeHtml(line)}</span>`).join('')}</div>` : ''}
            </div>
        `;
  };
  const renderPvpLivePracticeSelectionPlanMarkup = (plan = null) => {
    const src = plan && typeof plan === 'object' ? plan : null;
    if (!src || src.reportVersion !== 'pvp-live-practice-plan-v1') return '';
    if (src.sourceVisibility !== 'public_events' || src.usesHiddenInformation !== false || src.rankedImpact !== 'none') return '';
    const tempoScript = Array.isArray(src.tempoScript) ? src.tempoScript.slice(0, 3).filter(item => item && item.id && item.label && item.lesson) : [];
    const fairnessFocus = Array.isArray(src.fairnessFocus) ? src.fairnessFocus.slice(0, 3).filter(item => item && item.id && item.label && item.detail) : [];
    if (tempoScript.length === 0 && fairnessFocus.length === 0) return '';
    return `
            <div class="challenge-selection-practice-plan"
                role="region"
                aria-label="真人练习计划"
                data-pvp-live-practice-selection-plan="true"
                data-pvp-live-practice-plan-source="${escapeHtml(src.sourceVisibility)}"
                data-pvp-live-practice-plan-hidden="${escapeHtml(String(src.usesHiddenInformation))}"
                data-pvp-live-practice-plan-impact="${escapeHtml(src.rankedImpact)}">
                <div class="challenge-selection-practice-head">
                    <span>真人练习计划</span>
                    <strong>${escapeHtml(src.objectiveLine || '按公开关键回合复刻节奏，不写正式积分。')}</strong>
                </div>
                ${src.coachLine ? `<p>${escapeHtml(src.coachLine)}</p>` : ''}
                <div class="challenge-selection-practice-grid">
                    ${tempoScript.length ? `<section>
                        <h4>关键回合</h4>
                        ${tempoScript.map(item => `
                            <div class="challenge-selection-practice-row" data-pvp-live-practice-plan-turn="${escapeHtml(item.id)}">
                                <strong>${escapeHtml(item.label)}</strong>
                                <span>${escapeHtml(`#${item.sequence !== null && typeof item.sequence !== 'undefined' ? item.sequence : '-'} · ${item.eventType || '公开事件'}${item.actingSeat ? ` · ${item.actingSeat}` : ''}`)}</span>
                                <p>${escapeHtml(item.lesson)}</p>
                                ${item.drillPrompt ? `<em>${escapeHtml(item.drillPrompt)}</em>` : ''}
                            </div>
                        `).join('')}
                    </section>` : ''}
                    ${fairnessFocus.length ? `<section>
                        <h4>体验复查</h4>
                        ${fairnessFocus.map(item => `
                            <div class="challenge-selection-practice-row" data-pvp-live-practice-plan-focus="${escapeHtml(item.id)}">
                                <strong>${escapeHtml(item.label)}</strong>
                                <span>${escapeHtml(item.status || 'watch')}</span>
                                <p>${escapeHtml(item.detail)}</p>
                            </div>
                        `).join('')}
                    </section>` : ''}
                </div>
                <div class="challenge-selection-practice-guard">公平护栏：${escapeHtml(src.guardrailLine || '训练计划只读公开事件，不读取隐藏信息，不写正式积分。')}</div>
            </div>
        `;
  };
  challengeHubMethods.ensureChallengeHubBootState = function () {
    if (!this.challengeHubState || typeof this.challengeHubState !== 'object') {
      this.challengeHubState = this.loadChallengeHubState();
    } else {
      this.challengeHubState = normalizeChallengeHubState(this.challengeHubState);
    }
    if (!this.challengeProgressState || typeof this.challengeProgressState !== 'object') {
      this.challengeProgressState = this.loadChallengeProgressState();
    }
    if (typeof this.pendingChallengeStart === 'undefined') {
      this.pendingChallengeStart = null;
    }
    if (typeof this.activeChallengeRun === 'undefined') {
      this.activeChallengeRun = this.restoreActiveChallengeRun();
    }
    if (!this.observatoryArchiveState || typeof this.observatoryArchiveState !== 'object') {
      this.observatoryArchiveState = this.loadObservatoryArchiveState();
    }
    if (!this.observatoryGuideState || typeof this.observatoryGuideState !== 'object') {
      this.observatoryGuideState = this.loadObservatoryGuideState();
    }
  };
  challengeHubMethods.loadChallengeHubState = function () {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CHALLENGE_HUB_STATE_KEY) : null;
      return normalizeChallengeHubState(raw ? JSON.parse(raw) : createChallengeHubState());
    } catch (error) {
      return normalizeChallengeHubState(createChallengeHubState());
    }
  };
  challengeHubMethods.persistChallengeHubState = function () {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(CHALLENGE_HUB_STATE_KEY, JSON.stringify(normalizeChallengeHubState(this.challengeHubState || createChallengeHubState())));
    } catch (error) {
      console.warn('Persist challenge hub state failed:', error);
    }
  };
  challengeHubMethods.normalizeObservatoryArchiveState = function (rawState = null) {
    const source = rawState && typeof rawState === 'object' ? rawState : {};
    const records = Array.isArray(source.records) ? source.records : [];
    return {
      records: records.filter(item => item && typeof item === 'object').slice(0, 24).map(item => {
        const rule = normalizeChallengeRuleSnapshot(item.rule);
        const mode = ['daily', 'weekly', 'global'].includes(item.mode) ? item.mode : 'daily';
        const replayOnly = !!item.replayOnly;
        const type = ['challenge', 'replay', 'omen'].includes(item.type) ? item.type : replayOnly ? 'replay' : 'omen';
        const themeMeta = resolveChallengeThemeMeta(rule, mode);
        const metrics = normalizeChallengeMetricSnapshot(item.metrics);
        const completed = !!item.completed;
        const featured = type !== 'omen' && completed;
        const featuredTier = String(item.featuredTier || buildChallengeFeaturedTier({
          goalRealm: rule.goalRealm,
          replayOnly,
          finalScore: item.score
        }, metrics, {
          completed
        }));
        const featuredTags = normalizeTagList(item.featuredTags && Array.isArray(item.featuredTags) ? item.featuredTags : buildChallengeFeaturedTags(rule, {
          goalRealm: rule.goalRealm,
          replayOnly,
          finalScore: item.score,
          mode
        }, metrics, themeMeta, {
          completed,
          mode
        }), 4);
        const preferredNodes = Array.isArray(item.preferredNodes) ? item.preferredNodes.map(entry => String(entry || '')).filter(Boolean).slice(0, 4) : themeMeta.preferredNodes.slice(0, 4);
        const insight = normalizeChallengeArchiveInsight(item.insight || buildChallengeArchiveInsight({
          rule,
          mode,
          replayOnly,
          completed,
          metrics,
          preferredNodes,
          reason: String(item.reason || '')
        }, themeMeta));
        return {
          id: String(item.id || ''),
          type,
          mode,
          modeLabel: String(item.modeLabel || (replayOnly ? '观星回放' : HUB_META[mode]?.label || '观星留痕')),
          rotationKey: String(item.rotationKey || ''),
          rotationLabel: String(item.rotationLabel || formatDateLabel(mode, item.rotationKey || '')),
          seedSignature: String(item.seedSignature || ''),
          title: String(item.title || rule.name || '观星留痕'),
          note: String(item.note || ''),
          icon: String(item.icon || rule.icon || '🔭'),
          score: clampInt(item.score, 0),
          completed,
          at: clampInt(item.at, 0),
          reason: String(item.reason || ''),
          replayOnly,
          replayable: !!(rule.id && rule.characterId && rule.runDestinyId && rule.spiritCompanionId),
          archiveEntryId: String(item.archiveEntryId || ''),
          originLabel: String(item.originLabel || ''),
          themeKey: String(item.themeKey || themeMeta.key || 'assault'),
          themeLabel: String(item.themeLabel || themeMeta.label || '前压爆发'),
          featured,
          featuredTier,
          featuredTags,
          metrics,
          preferredNodes,
          insight: hasChallengeArchiveInsight(insight) ? insight : null,
          rule
        };
      }).sort((a, b) => clampInt(b.at, 0) - clampInt(a.at, 0))
    };
  };
  challengeHubMethods.loadObservatoryArchiveState = function () {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(OBSERVATORY_ARCHIVE_KEY) : null;
      return this.normalizeObservatoryArchiveState(raw ? JSON.parse(raw) : createObservatoryArchiveState());
    } catch (error) {
      return this.normalizeObservatoryArchiveState(createObservatoryArchiveState());
    }
  };
  challengeHubMethods.persistObservatoryArchiveState = function () {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(OBSERVATORY_ARCHIVE_KEY, JSON.stringify(this.observatoryArchiveState || createObservatoryArchiveState()));
    } catch (error) {
      console.warn('Persist observatory archive failed:', error);
    }
  };
  challengeHubMethods.normalizeObservatoryGuideState = function (rawState = null) {
    const source = rawState && typeof rawState === 'object' ? rawState : {};
    return {
      selectedRecordId: String(source.selectedRecordId || ''),
      trainingFocus: normalizeObservatoryTrainingFocus(source.trainingFocus),
      updatedAt: clampInt(source.updatedAt, 0)
    };
  };
  challengeHubMethods.loadObservatoryGuideState = function () {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(OBSERVATORY_GUIDE_STATE_KEY) : null;
      return this.normalizeObservatoryGuideState(raw ? JSON.parse(raw) : createObservatoryGuideState());
    } catch (error) {
      return this.normalizeObservatoryGuideState(createObservatoryGuideState());
    }
  };
  challengeHubMethods.persistObservatoryGuideState = function () {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(OBSERVATORY_GUIDE_STATE_KEY, JSON.stringify(this.observatoryGuideState || createObservatoryGuideState()));
    } catch (error) {
      console.warn('Persist observatory guide failed:', error);
    }
  };
  challengeHubMethods.buildChallengeSeedSignature = function (mode = 'daily', rotationKey = '', rule = null) {
    const safeMode = ['daily', 'weekly', 'global'].includes(mode) ? mode : 'daily';
    const snapshot = normalizeChallengeRuleSnapshot(rule);
    const seedSource = [safeMode, String(rotationKey || ''), snapshot.id, snapshot.characterId, snapshot.runDestinyId, snapshot.spiritCompanionId, snapshot.goalRealm, snapshot.vowIds.join(','), JSON.stringify(snapshot.battleModifiers || {})].join('|');
    const digest = hashString(seedSource).toString(16).toUpperCase().padStart(8, '0');
    const prefixMap = {
      daily: 'D',
      weekly: 'W',
      global: 'G'
    };
    const keyPart = String(rotationKey || 'ARCH').replace(/[^0-9A-Z]/gi, '').slice(-6) || 'ARCH';
    return `${prefixMap[safeMode] || 'O'}-${keyPart}-${digest.slice(0, 4)}`;
  };
  challengeHubMethods.recordObservatoryArchiveEntry = function (payload = {}) {
    this.ensureChallengeHubBootState();
    const state = this.observatoryArchiveState && typeof this.observatoryArchiveState === 'object' ? this.observatoryArchiveState : createObservatoryArchiveState();
    const normalized = this.normalizeObservatoryArchiveState({
      records: [{
        id: String(payload.id || `${Date.now()}:${hashString(JSON.stringify(payload || {}))}`),
        type: payload.type || 'omen',
        mode: payload.mode || 'daily',
        modeLabel: payload.modeLabel || '',
        rotationKey: payload.rotationKey || '',
        rotationLabel: payload.rotationLabel || '',
        seedSignature: payload.seedSignature || '',
        title: payload.title || '',
        note: payload.note || '',
        icon: payload.icon || '🔭',
        score: payload.score || 0,
        completed: payload.completed,
        at: payload.at || Date.now(),
        reason: payload.reason || '',
        replayOnly: payload.replayOnly,
        archiveEntryId: payload.archiveEntryId || '',
        originLabel: payload.originLabel || '',
        themeKey: payload.themeKey || '',
        themeLabel: payload.themeLabel || '',
        featuredTier: payload.featuredTier || '',
        featuredTags: payload.featuredTags || [],
        metrics: payload.metrics || null,
        preferredNodes: payload.preferredNodes || [],
        insight: payload.insight || null,
        rule: payload.rule || null
      }, ...(Array.isArray(state.records) ? state.records : [])].slice(0, 24)
    });
    this.observatoryArchiveState = normalized;
    this.persistObservatoryArchiveState();
    this.syncObservatoryGuideSelection();
    return normalized.records[0] || null;
  };
  challengeHubMethods.getObservatoryArchiveEntries = function (options = {}) {
    this.ensureChallengeHubBootState();
    const source = Array.isArray(this.observatoryArchiveState?.records) ? this.observatoryArchiveState.records : [];
    const limit = clampInt(options.limit, 0, 24) || 6;
    const mode = ['daily', 'weekly', 'global'].includes(options.mode) ? options.mode : '';
    const rotationKey = String(options.rotationKey || '');
    const types = Array.isArray(options.types) ? options.types.map(item => String(item || '')).filter(Boolean) : null;
    const replayableOnly = !!options.replayableOnly;
    const featuredOnly = !!options.featuredOnly;
    const completedOnly = !!options.completedOnly && !options.failedOnly;
    const failedOnly = !!options.failedOnly && !options.completedOnly;
    const replayOnly = typeof options.replayOnly === 'boolean' ? options.replayOnly : null;
    const themeKey = String(options.themeKey || '').trim();
    const sortBy = ['recent', 'score_desc'].includes(options.sortBy) ? options.sortBy : 'recent';
    return sortObservatoryArchiveEntries(source.filter(entry => {
      if (!entry) return false;
      if (mode && entry.mode !== mode) return false;
      if (rotationKey && entry.rotationKey !== rotationKey) return false;
      if (types && types.length > 0 && !types.includes(entry.type)) return false;
      if (replayableOnly && !entry.replayable) return false;
      if (featuredOnly && !entry.featured) return false;
      if (completedOnly && !entry.completed) return false;
      if (failedOnly && entry.completed) return false;
      if (replayOnly !== null && !!entry.replayOnly !== replayOnly) return false;
      if (themeKey && themeKey !== 'all') {
        if (!entry.rule?.id) return false;
        if (entry.themeKey !== themeKey) return false;
      }
      return true;
    }), sortBy).slice(0, limit);
  };
  challengeHubMethods.getObservatoryArchiveSummary = function () {
    const records = this.getObservatoryArchiveEntries({
      limit: 24
    });
    const selectedGuide = this.getSelectedObservatoryExpeditionGuide({
      silentSync: true
    });
    return {
      totalRecords: records.length,
      replayCount: records.filter(item => item.type === 'replay').length,
      challengeCount: records.filter(item => item.type === 'challenge').length,
      omenCount: records.filter(item => item.type === 'omen').length,
      replayableCount: records.filter(item => item.replayable).length,
      featuredCount: records.filter(item => item.featured).length,
      latest: records[0] || null,
      selectedGuideId: selectedGuide?.id || '',
      selectedGuideTitle: selectedGuide?.title || '',
      selectedGuideThemeLabel: selectedGuide?.themeLabel || ''
    };
  };
  challengeHubMethods.getChallengeArchiveFilterState = function (tab = '') {
    this.ensureChallengeHubBootState();
    const safeTab = ['daily', 'weekly', 'global'].includes(tab) ? tab : this.challengeHubState.tab || 'daily';
    const next = normalizeChallengeArchiveFilterState(this.challengeHubState.archiveFilters?.[safeTab]);
    this.challengeHubState.archiveFilters[safeTab] = next;
    return {
      ...next
    };
  };
  challengeHubMethods.getChallengeArchivePresetSlots = function (tab = '') {
    this.ensureChallengeHubBootState();
    const safeTab = ['daily', 'weekly', 'global'].includes(tab) ? tab : this.challengeHubState.tab || 'daily';
    const next = normalizeChallengeArchivePresetSlots(this.challengeHubState.archivePresets?.[safeTab]);
    this.challengeHubState.archivePresets[safeTab] = next;
    return next.map(entry => entry ? {
      state: normalizeChallengeArchiveFilterState(entry.state),
      updatedAt: clampInt(entry.updatedAt, 0)
    } : null);
  };
  challengeHubMethods.getChallengeArchivePresetSummary = function (state = null) {
    const resolved = normalizeChallengeArchiveFilterState(state || createChallengeArchiveFilterState());
    const labels = [CHALLENGE_ARCHIVE_SCOPE_META[resolved.scope]?.label || CHALLENGE_ARCHIVE_SCOPE_META.mode.label, CHALLENGE_ARCHIVE_TRACK_META[resolved.track]?.label || CHALLENGE_ARCHIVE_TRACK_META.playable.label];
    if (resolved.outcome !== 'all') {
      labels.push(CHALLENGE_ARCHIVE_OUTCOME_META[resolved.outcome]?.label || resolved.outcome);
    }
    if (resolved.themeKey && resolved.themeKey !== 'all') {
      labels.push(CHALLENGE_THEME_LIBRARY[resolved.themeKey]?.label || resolved.themeKey);
    }
    if (resolved.sortBy !== 'recent') {
      labels.push(CHALLENGE_ARCHIVE_SORT_META[resolved.sortBy]?.label || resolved.sortBy);
    }
    return labels.join(' / ') || '默认视角';
  };
  challengeHubMethods.getChallengeArchivePresetLabel = function (slot = 0, tab = '') {
    const index = clampInt(slot, 0, 1);
    const preset = this.getChallengeArchivePresetSlots(tab)[index];
    if (!preset?.state) return `预设 ${index + 1}（空）`;
    return `预设 ${index + 1} · ${this.getChallengeArchivePresetSummary(preset.state)}`;
  };
  challengeHubMethods.isChallengeArchivePresetActive = function (slot = 0, tab = '') {
    const index = clampInt(slot, 0, 1);
    const preset = this.getChallengeArchivePresetSlots(tab)[index];
    if (!preset?.state) return false;
    return serializeChallengeArchiveFilterState(preset.state) === serializeChallengeArchiveFilterState(this.getChallengeArchiveFilterState(tab));
  };
  challengeHubMethods.saveChallengeArchivePreset = function (slot = 0, tab = '') {
    this.ensureChallengeHubBootState();
    const safeTab = ['daily', 'weekly', 'global'].includes(tab) ? tab : this.challengeHubState.tab || 'daily';
    const index = clampInt(slot, 0, 1);
    const slots = this.getChallengeArchivePresetSlots(safeTab);
    slots[index] = {
      state: normalizeChallengeArchiveFilterState(this.getChallengeArchiveFilterState(safeTab)),
      updatedAt: Date.now()
    };
    this.challengeHubState.archivePresets[safeTab] = normalizeChallengeArchivePresetSlots(slots);
    this.persistChallengeHubState();
    if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(`已保存观星筛面预设 ${index + 1}`);
    }
    if (this.currentScreen === 'challenge-screen') {
      this.initChallengeHub();
    }
    return true;
  };
  challengeHubMethods.applyChallengeArchivePreset = function (slot = 0, tab = '') {
    this.ensureChallengeHubBootState();
    const safeTab = ['daily', 'weekly', 'global'].includes(tab) ? tab : this.challengeHubState.tab || 'daily';
    const index = clampInt(slot, 0, 1);
    const preset = this.getChallengeArchivePresetSlots(safeTab)[index];
    if (!preset?.state) {
      if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
        Utils.showBattleLog(`观星筛面预设 ${index + 1} 为空`);
      }
      return false;
    }
    this.challengeHubState.archiveFilters[safeTab] = normalizeChallengeArchiveFilterState(preset.state);
    this.persistChallengeHubState();
    if (this.currentScreen === 'challenge-screen') {
      this.initChallengeHub();
    }
    return true;
  };
  challengeHubMethods.setChallengeArchiveFilter = function (key = '', value = '', tab = '') {
    this.ensureChallengeHubBootState();
    const safeTab = ['daily', 'weekly', 'global'].includes(tab) ? tab : this.challengeHubState.tab || 'daily';
    if (!['scope', 'track', 'outcome', 'themeKey', 'sortBy'].includes(key)) {
      return this.getChallengeArchiveFilterState(safeTab);
    }
    const next = normalizeChallengeArchiveFilterState({
      ...this.getChallengeArchiveFilterState(safeTab),
      [key]: value
    });
    this.challengeHubState.archiveFilters[safeTab] = next;
    this.persistChallengeHubState();
    if (this.currentScreen === 'challenge-screen') {
      this.initChallengeHub();
    }
    return {
      ...next
    };
  };
  challengeHubMethods.resetChallengeArchiveFilters = function (tab = '') {
    this.ensureChallengeHubBootState();
    const safeTab = ['daily', 'weekly', 'global'].includes(tab) ? tab : this.challengeHubState.tab || 'daily';
    const next = createChallengeArchiveFilterState();
    this.challengeHubState.archiveFilters[safeTab] = next;
    this.persistChallengeHubState();
    if (this.currentScreen === 'challenge-screen') {
      this.initChallengeHub();
    }
    return {
      ...next
    };
  };
  challengeHubMethods.getSeasonVerificationArchiveFilterState = function (tab = 'weekly') {
    this.ensureChallengeHubBootState();
    const safeTab = tab === 'weekly' ? 'weekly' : 'weekly';
    const next = normalizeSeasonVerificationArchiveFilterState(this.challengeHubState.verificationArchiveFilters?.[safeTab]);
    this.challengeHubState.verificationArchiveFilters[safeTab] = next;
    return {
      ...next
    };
  };
  challengeHubMethods.setSeasonVerificationArchiveFilter = function (key = '', value = '', tab = 'weekly') {
    this.ensureChallengeHubBootState();
    const safeTab = tab === 'weekly' ? 'weekly' : 'weekly';
    if (!['sourceMode', 'resultStatus', 'phaseKey', 'trajectoryKey', 'role', 'sortBy'].includes(key)) {
      return this.getSeasonVerificationArchiveFilterState(safeTab);
    }
    const next = normalizeSeasonVerificationArchiveFilterState({
      ...this.getSeasonVerificationArchiveFilterState(safeTab),
      [key]: value
    });
    this.challengeHubState.verificationArchiveFilters[safeTab] = next;
    this.persistChallengeHubState();
    if (this.currentScreen === 'challenge-screen') {
      this.initChallengeHub();
    }
    return {
      ...next
    };
  };
  challengeHubMethods.resetSeasonVerificationArchiveFilters = function (tab = 'weekly') {
    this.ensureChallengeHubBootState();
    const safeTab = tab === 'weekly' ? 'weekly' : 'weekly';
    const next = createSeasonVerificationArchiveFilterState();
    this.challengeHubState.verificationArchiveFilters[safeTab] = next;
    this.persistChallengeHubState();
    if (this.currentScreen === 'challenge-screen') {
      this.initChallengeHub();
    }
    return {
      ...next
    };
  };
  challengeHubMethods.buildSeasonVerificationArchiveFilterBundle = function (archive = null, options = {}) {
    this.ensureChallengeHubBootState();
    const safeTab = options.tab === 'weekly' ? 'weekly' : 'weekly';
    const state = this.getSeasonVerificationArchiveFilterState(safeTab);
    const sourceArchive = archive && typeof archive === 'object' ? archive : typeof this.getSeasonVerificationArchiveSnapshot === 'function' ? this.getSeasonVerificationArchiveSnapshot(options) : null;
    const entries = Array.isArray(sourceArchive?.entries) ? sourceArchive.entries.filter(entry => entry && typeof entry === 'object') : [];
    const sourceModeLabels = new Map();
    const phaseLabels = new Map();
    const trajectoryLabels = new Map();
    entries.forEach(entry => {
      const sourceMode = String(entry.sourceMode || '').trim();
      if (!sourceMode || sourceModeLabels.has(sourceMode)) return;
      const label = String(entry.sourceModeLabel || entry.sourceLabel || SEASON_VERIFICATION_ARCHIVE_SOURCE_MODE_META[sourceMode]?.label || sourceMode).trim();
      if (label) {
        sourceModeLabels.set(sourceMode, label);
      }
    });
    entries.forEach(entry => {
      const phaseKey = String(entry.phaseId || '').trim();
      if (!phaseKey || phaseLabels.has(phaseKey)) return;
      const label = String(entry.phaseLabel || phaseKey).trim();
      if (label) {
        phaseLabels.set(phaseKey, label);
      }
    });
    entries.forEach(entry => {
      const trajectoryMeta = resolveSeasonVerificationArchiveTrajectoryMeta(entry);
      if (!trajectoryMeta.key || trajectoryMeta.key === 'all' || trajectoryLabels.has(trajectoryMeta.key)) return;
      trajectoryLabels.set(trajectoryMeta.key, trajectoryMeta.label);
    });
    const normalizedState = normalizeSeasonVerificationArchiveFilterState({
      ...state,
      sourceMode: state.sourceMode !== 'all' && !sourceModeLabels.has(state.sourceMode) ? 'all' : state.sourceMode,
      phaseKey: state.phaseKey !== 'all' && !phaseLabels.has(state.phaseKey) ? 'all' : state.phaseKey,
      trajectoryKey: state.trajectoryKey !== 'all' && !trajectoryLabels.has(state.trajectoryKey) ? 'all' : state.trajectoryKey
    });
    if (serializeSeasonVerificationArchiveFilterState(normalizedState) !== serializeSeasonVerificationArchiveFilterState(state)) {
      this.challengeHubState.verificationArchiveFilters[safeTab] = normalizedState;
      this.persistChallengeHubState();
    }
    const filteredEntries = entries.filter(entry => normalizedState.sourceMode === 'all' || entry.sourceMode === normalizedState.sourceMode).filter(entry => normalizedState.resultStatus === 'all' || entry.resultStatus === normalizedState.resultStatus).filter(entry => normalizedState.phaseKey === 'all' || entry.phaseId === normalizedState.phaseKey).filter(entry => {
      if (normalizedState.trajectoryKey === 'all') return true;
      return resolveSeasonVerificationArchiveTrajectoryMeta(entry).key === normalizedState.trajectoryKey;
    }).filter(entry => normalizedState.role === 'all' || entry.role === normalizedState.role).slice().sort((a, b) => {
      const aAt = clampInt(a?.updatedAt || a?.createdAt, 0);
      const bAt = clampInt(b?.updatedAt || b?.createdAt, 0);
      if (normalizedState.sortBy === 'oldest') {
        return aAt - bAt || clampInt(a?.createdAt, 0) - clampInt(b?.createdAt, 0);
      }
      return bAt - aAt || clampInt(b?.createdAt, 0) - clampInt(a?.createdAt, 0);
    });
    const buildCountMap = (targetEntries = []) => targetEntries.reduce((acc, entry) => {
      const resultStatus = ['verified', 'failed', 'deferred', 'pending'].includes(entry?.resultStatus) ? entry.resultStatus : 'pending';
      acc[resultStatus] += 1;
      return acc;
    }, {
      verified: 0,
      failed: 0,
      deferred: 0,
      pending: 0
    });
    const statusCounts = buildCountMap(filteredEntries);
    const sourceModeOptions = [{
      value: 'all',
      label: SEASON_VERIFICATION_ARCHIVE_SOURCE_MODE_META.all.label
    }];
    sourceModeLabels.forEach((label, value) => {
      sourceModeOptions.push({
        value,
        label
      });
    });
    if (normalizedState.sourceMode !== 'all' && !sourceModeLabels.has(normalizedState.sourceMode)) {
      sourceModeOptions.push({
        value: normalizedState.sourceMode,
        label: normalizedState.sourceMode
      });
    }
    const phaseOptions = [{
      value: 'all',
      label: '全部阶段'
    }];
    phaseLabels.forEach((label, value) => {
      phaseOptions.push({
        value,
        label
      });
    });
    if (normalizedState.phaseKey !== 'all' && !phaseLabels.has(normalizedState.phaseKey)) {
      phaseOptions.push({
        value: normalizedState.phaseKey,
        label: normalizedState.phaseKey
      });
    }
    const trajectoryOptions = [{
      value: 'all',
      label: SEASON_VERIFICATION_ARCHIVE_TRAJECTORY_META.all.label
    }];
    trajectoryLabels.forEach((label, value) => {
      trajectoryOptions.push({
        value,
        label
      });
    });
    if (normalizedState.trajectoryKey !== 'all' && !trajectoryLabels.has(normalizedState.trajectoryKey)) {
      trajectoryOptions.push({
        value: normalizedState.trajectoryKey,
        label: normalizedState.trajectoryKey
      });
    }
    const sourceModeLabel = normalizedState.sourceMode === 'all' ? SEASON_VERIFICATION_ARCHIVE_SOURCE_MODE_META.all.label : sourceModeOptions.find(item => item.value === normalizedState.sourceMode)?.label || normalizedState.sourceMode;
    const resultStatusLabel = SEASON_VERIFICATION_ARCHIVE_RESULT_META[normalizedState.resultStatus]?.label || SEASON_VERIFICATION_ARCHIVE_RESULT_META.all.label;
    const phaseLabel = normalizedState.phaseKey === 'all' ? '全部阶段' : phaseOptions.find(item => item.value === normalizedState.phaseKey)?.label || normalizedState.phaseKey;
    const trajectoryLabel = normalizedState.trajectoryKey === 'all' ? SEASON_VERIFICATION_ARCHIVE_TRAJECTORY_META.all.label : trajectoryOptions.find(item => item.value === normalizedState.trajectoryKey)?.label || normalizedState.trajectoryKey;
    const roleLabel = SEASON_VERIFICATION_ARCHIVE_ROLE_META[normalizedState.role]?.label || SEASON_VERIFICATION_ARCHIVE_ROLE_META.all.label;
    const sortLabel = SEASON_VERIFICATION_ARCHIVE_SORT_META[normalizedState.sortBy]?.label || SEASON_VERIFICATION_ARCHIVE_SORT_META.recent.label;
    const defaultState = createSeasonVerificationArchiveFilterState();
    const isDefault = serializeSeasonVerificationArchiveFilterState(normalizedState) === serializeSeasonVerificationArchiveFilterState(defaultState);
    return {
      state: normalizedState,
      entries: filteredEntries,
      sourceModeOptions,
      resultOptions: ['all', 'verified', 'failed', 'deferred', 'pending'].map(value => ({
        value,
        label: SEASON_VERIFICATION_ARCHIVE_RESULT_META[value]?.label || value
      })),
      phaseOptions,
      trajectoryOptions,
      roleOptions: ['all', 'primary', 'side'].map(value => ({
        value,
        label: SEASON_VERIFICATION_ARCHIVE_ROLE_META[value]?.label || value
      })),
      sortOptions: ['recent', 'oldest'].map(value => ({
        value,
        label: SEASON_VERIFICATION_ARCHIVE_SORT_META[value]?.label || value
      })),
      sourceModeLabel,
      resultStatusLabel,
      phaseLabel,
      trajectoryLabel,
      roleLabel,
      sortLabel,
      filterSummary: `${sourceModeLabel} · ${resultStatusLabel} · ${phaseLabel} · ${trajectoryLabel} · ${roleLabel}`,
      viewSummary: `${sourceModeLabel} · ${resultStatusLabel} · ${phaseLabel} · ${trajectoryLabel} · ${roleLabel} · ${sortLabel}`,
      matchedCount: filteredEntries.length,
      totalCount: entries.length,
      verifiedCount: statusCounts.verified,
      failedCount: statusCounts.failed,
      deferredCount: statusCounts.deferred,
      pendingCount: statusCounts.pending,
      isDefault,
      emptyText: isDefault ? '当前轮换还没有更多可复核的周判记录，先去补一张真正落档的主验证或旁验证。' : '当前筛面下没有命中周判记录，试试放宽来源、判定或角色条件。'
    };
  };
  challengeHubMethods.buildChallengeArchiveFilterQuery = function (filterState = null, bundle = null, options = {}) {
    this.ensureChallengeHubBootState();
    const safeTab = ['daily', 'weekly', 'global'].includes(bundle?.mode) ? bundle.mode : ['daily', 'weekly', 'global'].includes(options.tab) ? options.tab : this.challengeHubState.tab || 'daily';
    const state = normalizeChallengeArchiveFilterState(filterState || this.getChallengeArchiveFilterState(safeTab));
    const query = {
      limit: clampInt(options.limit, 0, 24) || 24
    };
    if (state.scope === 'rotation') {
      query.mode = safeTab;
      query.rotationKey = String(bundle?.rotationKey || '');
    } else if (state.scope === 'mode') {
      query.mode = safeTab;
    }
    if (state.track === 'playable') {
      query.types = ['challenge', 'replay'];
      query.replayableOnly = true;
    } else if (state.track === 'challenge') {
      query.types = ['challenge'];
    } else if (state.track === 'replay') {
      query.types = ['replay'];
    } else if (state.track === 'omen') {
      query.types = ['omen'];
    }
    if (state.outcome === 'completed') {
      query.completedOnly = true;
    } else if (state.outcome === 'failed') {
      query.failedOnly = true;
    }
    if (state.themeKey && state.themeKey !== 'all') {
      query.themeKey = state.themeKey;
    }
    query.sortBy = state.sortBy;
    return query;
  };
  challengeHubMethods.buildChallengeArchiveFilterBundle = function (bundle = null) {
    this.ensureChallengeHubBootState();
    const safeTab = ['daily', 'weekly', 'global'].includes(bundle?.mode) ? bundle.mode : this.challengeHubState.tab || 'daily';
    const state = this.getChallengeArchiveFilterState(safeTab);
    const themeMeta = bundle?.themeMeta || (bundle?.rule ? this.getChallengeThemeMeta(bundle.rule, safeTab) : null) || CHALLENGE_THEME_LIBRARY.assault;
    const scopeEntries = this.getObservatoryArchiveEntries(this.buildChallengeArchiveFilterQuery({
      scope: state.scope,
      track: 'all',
      outcome: 'all',
      themeKey: 'all'
    }, bundle, {
      limit: 24,
      tab: safeTab
    }));
    const entriesBeforeTheme = this.getObservatoryArchiveEntries(this.buildChallengeArchiveFilterQuery({
      ...state,
      themeKey: 'all'
    }, bundle, {
      limit: 24,
      tab: safeTab
    }));
    const entries = this.getObservatoryArchiveEntries(this.buildChallengeArchiveFilterQuery(state, bundle, {
      limit: 24,
      tab: safeTab
    }));
    const themeOptions = [{
      value: 'all',
      label: '全部主题'
    }];
    const themeLabels = new Map();
    const currentThemeKey = String(themeMeta?.key || '');
    const currentThemeLabel = String(themeMeta?.label || '当前主题');
    if (currentThemeKey) {
      themeLabels.set(currentThemeKey, `当前主题 · ${currentThemeLabel}`);
    }
    Object.values(CHALLENGE_THEME_LIBRARY || {}).forEach(themeEntry => {
      const key = String(themeEntry?.key || '').trim();
      if (!key || themeLabels.has(key)) return;
      themeLabels.set(key, String(themeEntry?.label || key));
    });
    entriesBeforeTheme.filter(entry => entry && entry.rule?.id && entry.type !== 'omen' && entry.themeKey).forEach(entry => {
      if (!themeLabels.has(entry.themeKey)) {
        themeLabels.set(entry.themeKey, entry.themeLabel || CHALLENGE_THEME_LIBRARY[entry.themeKey]?.label || entry.themeKey);
      }
    });
    themeLabels.forEach((label, key) => {
      themeOptions.push({
        value: key,
        label
      });
    });
    if (state.themeKey !== 'all' && !themeLabels.has(state.themeKey)) {
      themeOptions.push({
        value: state.themeKey,
        label: CHALLENGE_THEME_LIBRARY[state.themeKey]?.label || state.themeKey
      });
    }
    const defaultState = createChallengeArchiveFilterState();
    const scopeLabel = CHALLENGE_ARCHIVE_SCOPE_META[state.scope]?.label || CHALLENGE_ARCHIVE_SCOPE_META.mode.label;
    const trackLabel = CHALLENGE_ARCHIVE_TRACK_META[state.track]?.label || CHALLENGE_ARCHIVE_TRACK_META.playable.label;
    const outcomeLabel = CHALLENGE_ARCHIVE_OUTCOME_META[state.outcome]?.label || CHALLENGE_ARCHIVE_OUTCOME_META.all.label;
    const themeLabel = state.themeKey === 'all' ? '全部主题' : themeOptions.find(item => item.value === state.themeKey)?.label || CHALLENGE_THEME_LIBRARY[state.themeKey]?.label || state.themeKey;
    const sortLabel = CHALLENGE_ARCHIVE_SORT_META[state.sortBy]?.label || CHALLENGE_ARCHIVE_SORT_META.recent.label;
    const isDefault = state.scope === defaultState.scope && state.track === defaultState.track && state.outcome === defaultState.outcome && state.themeKey === defaultState.themeKey && state.sortBy === defaultState.sortBy;
    const presetSlots = this.getChallengeArchivePresetSlots(safeTab).map((preset, index) => ({
      slot: index,
      label: this.getChallengeArchivePresetLabel(index, safeTab),
      empty: !preset?.state,
      active: this.isChallengeArchivePresetActive(index, safeTab),
      updatedAt: preset?.updatedAt || 0
    }));
    return {
      state,
      entries,
      scopeOptions: ['rotation', 'mode', 'all'].map(value => ({
        value,
        label: CHALLENGE_ARCHIVE_SCOPE_META[value]?.label || value
      })),
      trackOptions: ['playable', 'challenge', 'replay', 'omen', 'all'].map(value => ({
        value,
        label: CHALLENGE_ARCHIVE_TRACK_META[value]?.label || value
      })),
      outcomeOptions: ['all', 'completed', 'failed'].map(value => ({
        value,
        label: CHALLENGE_ARCHIVE_OUTCOME_META[value]?.label || value
      })),
      sortOptions: ['recent', 'score_desc'].map(value => ({
        value,
        label: CHALLENGE_ARCHIVE_SORT_META[value]?.label || value
      })),
      themeOptions,
      scopeLabel,
      trackLabel,
      outcomeLabel,
      themeLabel,
      sortLabel,
      filterSummary: `${scopeLabel} · ${trackLabel} · ${outcomeLabel} · ${themeLabel}`,
      viewSummary: `${scopeLabel} · ${trackLabel} · ${outcomeLabel} · ${themeLabel} · ${sortLabel}`,
      matchedCount: entries.length,
      scopeTotalCount: scopeEntries.length,
      replayableCount: entries.filter(entry => entry.replayable).length,
      featuredCount: entries.filter(entry => entry.featured).length,
      completedCount: entries.filter(entry => entry.completed).length,
      failedCount: entries.filter(entry => entry.type !== 'omen' && !entry.completed).length,
      isDefault,
      presetSlots,
      emptyText: isDefault ? '观星留痕还没有更多可检索样本，先完成一轮挑战、回放或观星推演。' : '当前筛面暂无留痕，试试还原筛面或切到跨赛道查看更久以前的样本。'
    };
  };
  challengeHubMethods.getChallengeThemeMeta = function (rule = null, mode = 'daily') {
    return resolveChallengeThemeMeta(rule, mode);
  };
  challengeHubMethods.isObservatoryEntryExpeditionEligible = function (entry = null) {
    return !!entry && entry.type !== 'omen' && !!entry.completed && !!entry.replayable && !!entry.featured;
  };
  challengeHubMethods.syncObservatoryGuideSelection = function () {
    this.ensureChallengeHubBootState();
    const state = this.normalizeObservatoryGuideState(this.observatoryGuideState || createObservatoryGuideState());
    const eligible = this.getObservatoryArchiveEntries({
      limit: 24,
      featuredOnly: true
    }).filter(entry => this.isObservatoryEntryExpeditionEligible(entry));
    const hasSelected = !!state.selectedRecordId && eligible.some(entry => entry.id === state.selectedRecordId);
    const nextSelected = hasSelected ? state.selectedRecordId : eligible[0]?.id || '';
    if (nextSelected !== state.selectedRecordId) {
      this.observatoryGuideState = this.normalizeObservatoryGuideState({
        ...state,
        selectedRecordId: nextSelected,
        updatedAt: nextSelected ? Date.now() : 0
      });
      this.persistObservatoryGuideState();
    } else {
      this.observatoryGuideState = state;
    }
    return this.observatoryGuideState.selectedRecordId || '';
  };
  challengeHubMethods.getObservatoryTrainingFocus = function () {
    this.ensureChallengeHubBootState();
    const next = normalizeObservatoryTrainingFocus(this.observatoryGuideState?.trainingFocus);
    this.observatoryGuideState.trainingFocus = next;
    return next ? {
      ...next,
      trainingTags: normalizeTagList(next.trainingTags, 4),
      goalHighlights: (Array.isArray(next.goalHighlights) ? next.goalHighlights : []).map(line => String(line || '').trim()).filter(Boolean).slice(0, 3)
    } : null;
  };
  challengeHubMethods.setObservatoryTrainingFocus = function (focus = null, options = {}) {
    this.ensureChallengeHubBootState();
    const nextFocus = normalizeObservatoryTrainingFocus(focus);
    this.observatoryGuideState = this.normalizeObservatoryGuideState({
      ...(this.observatoryGuideState || createObservatoryGuideState()),
      trainingFocus: nextFocus,
      updatedAt: Date.now()
    });
    this.persistObservatoryGuideState();
    if (!options.silent && nextFocus && typeof Utils !== 'undefined' && Utils?.showBattleLog) {
      Utils.showBattleLog(`观星台已记下【${nextFocus.chapterName || '最新章节'}】的主练建议。`, {
        category: 'system',
        duration: 2400
      });
    }
    return nextFocus;
  };
  challengeHubMethods.applyObservatoryTrainingFocus = function (tab = '') {
    this.ensureChallengeHubBootState();
    const focus = this.getObservatoryTrainingFocus();
    if (!focus?.themeKey) return false;
    const safeTab = ['daily', 'weekly', 'global'].includes(tab) ? tab : this.challengeHubState.tab || 'daily';
    this.challengeHubState.archiveFilters[safeTab] = normalizeChallengeArchiveFilterState({
      scope: 'all',
      track: 'playable',
      outcome: 'all',
      themeKey: focus.themeKey,
      sortBy: 'score_desc'
    });
    this.persistChallengeHubState();
    if (typeof Utils !== 'undefined' && Utils?.showBattleLog) {
      Utils.showBattleLog(`已切到【${focus.themeLabel || '当前主练'}】训练视角。`, {
        category: 'system',
        duration: 2400
      });
    }
    if (this.currentScreen === 'challenge-screen') {
      this.initChallengeHub();
    }
    return true;
  };
  challengeHubMethods.getSelectedObservatoryExpeditionGuide = function (options = {}) {
    this.ensureChallengeHubBootState();
    if (!options.silentSync) {
      this.syncObservatoryGuideSelection();
    }
    const guideState = this.observatoryGuideState || createObservatoryGuideState();
    const eligible = this.getObservatoryArchiveEntries({
      limit: 24,
      featuredOnly: true
    }).filter(entry => this.isObservatoryEntryExpeditionEligible(entry));
    const entry = eligible.find(item => item.id === guideState.selectedRecordId) || eligible[0] || null;
    if (!entry) {
      return typeof this.getFallbackObservatoryExpeditionGuide === 'function'
        ? this.getFallbackObservatoryExpeditionGuide({
            realm: clampInt(this.player?.realm, 1, 99) || 1
          })
        : null;
    }
    const themeMeta = resolveChallengeThemeMeta(entry.rule, entry.mode);
    const preferredNodes = Array.isArray(entry.preferredNodes) && entry.preferredNodes.length > 0 ? entry.preferredNodes.slice(0, 4) : themeMeta.preferredNodes.slice(0, 4);
    const routeFocusLine = buildChallengePreferredNodeLine(preferredNodes);
    const insight = entry.insight && hasChallengeArchiveInsight(entry.insight) ? normalizeChallengeArchiveInsight(entry.insight) : null;
    return {
      id: entry.id,
      title: entry.title,
      score: entry.score,
      note: entry.note,
      icon: entry.icon,
      type: entry.type,
      mode: entry.mode,
      modeLabel: entry.modeLabel,
      seedSignature: entry.seedSignature,
      themeKey: entry.themeKey || themeMeta.key,
      themeLabel: entry.themeLabel || themeMeta.label,
      featuredTier: entry.featuredTier,
      featuredTags: normalizeTagList(entry.featuredTags, 4),
      metricLine: formatChallengeMetricLine(entry.metrics),
      preferredNodes,
      routeFocusLine,
      insight,
      trainingTags: insight ? normalizeTagList(insight.trainingTags, 3) : [],
      coachBrief: insight?.coachBrief || '',
      drillObjective: insight?.drillObjective || '',
      expeditionNote: themeMeta.expeditionNote,
      compareHint: themeMeta.compareHint
    };
  };
  challengeHubMethods.selectObservatoryExpeditionGuide = function (recordId = '', options = {}) {
    this.ensureChallengeHubBootState();
    const entry = this.getObservatoryArchiveEntries({
      limit: 24,
      featuredOnly: true
    }).find(item => item.id === String(recordId || ''));
    if (!this.isObservatoryEntryExpeditionEligible(entry)) return false;
    this.observatoryGuideState = this.normalizeObservatoryGuideState({
      ...(this.observatoryGuideState || createObservatoryGuideState()),
      selectedRecordId: entry.id,
      updatedAt: Date.now()
    });
    this.persistObservatoryGuideState();
    if (!options.silent && typeof Utils !== 'undefined' && Utils?.showBattleLog) {
      Utils.showBattleLog(`观星台已把【${entry.title}】设为远征线索。接下来裂界远征会读取这份精选命盘。`, {
        category: 'system',
        duration: 2800
      });
    }
    if (this.currentScreen === 'challenge-screen') {
      this.initChallengeHub();
    }
    return true;
  };
  challengeHubMethods.buildObservatoryThemeComparison = function (options = {}) {
    this.ensureChallengeHubBootState();
    const focusRule = options.rule && typeof options.rule === 'object' ? options.rule : null;
    const focusMode = ['daily', 'weekly', 'global'].includes(options.mode) ? options.mode : 'daily';
    const selectedGuide = this.getSelectedObservatoryExpeditionGuide({
      silentSync: true
    });
    const fallbackMeta = focusRule ? resolveChallengeThemeMeta(focusRule, focusMode) : selectedGuide || {
      themeKey: 'assault',
      themeLabel: '前压爆发',
      compareHint: CHALLENGE_THEME_LIBRARY.assault.compareHint
    };
    const focusThemeKey = String(options.themeKey || fallbackMeta.themeKey || fallbackMeta.key || 'assault');
    const focusThemeLabel = String(options.themeLabel || fallbackMeta.themeLabel || fallbackMeta.label || '前压爆发');
    const compareHint = String(options.compareHint || fallbackMeta.compareHint || CHALLENGE_THEME_LIBRARY.assault.compareHint);
    const selectedGuideId = this.syncObservatoryGuideSelection();
    const sourceEntries = this.getObservatoryArchiveEntries({
      limit: 24,
      types: ['challenge', 'replay']
    });
    let resolvedThemeKey = focusThemeKey;
    let resolvedThemeLabel = focusThemeLabel;
    let entries = sourceEntries.filter(entry => entry.themeKey === resolvedThemeKey).sort((a, b) => clampInt(b.score, 0) - clampInt(a.score, 0) || clampInt(b.at, 0) - clampInt(a.at, 0)).slice(0, 3);
    if (entries.length === 0 && selectedGuide?.themeKey && selectedGuide.themeKey !== resolvedThemeKey) {
      resolvedThemeKey = selectedGuide.themeKey;
      resolvedThemeLabel = selectedGuide.themeLabel || resolvedThemeLabel;
      entries = sourceEntries.filter(entry => entry.themeKey === resolvedThemeKey).sort((a, b) => clampInt(b.score, 0) - clampInt(a.score, 0) || clampInt(b.at, 0) - clampInt(a.at, 0)).slice(0, 3);
    }
    entries = entries.map((entry, index, source) => {
      const topScore = clampInt(source[0]?.score, 0);
      const benchmarkEntry = source[0] || entry;
      const delta = topScore - clampInt(entry.score, 0);
      const themeMeta = resolveChallengeThemeMeta(entry.rule, entry.mode);
      const preferredNodes = Array.isArray(entry.preferredNodes) && entry.preferredNodes.length > 0 ? entry.preferredNodes.slice(0, 4) : themeMeta.preferredNodes.slice(0, 4);
      const insight = entry.insight && hasChallengeArchiveInsight(entry.insight) ? normalizeChallengeArchiveInsight(entry.insight) : null;
      return {
        id: entry.id,
        title: entry.title,
        score: clampInt(entry.score, 0),
        completed: !!entry.completed,
        replayOnly: !!entry.replayOnly,
        seedSignature: entry.seedSignature,
        modeLabel: entry.modeLabel,
        featuredTier: entry.featuredTier,
        featuredTags: normalizeTagList(entry.featuredTags, 4),
        metricLine: formatChallengeMetricLine(entry.metrics),
        deltaText: delta > 0 ? `距主题最高分 ${delta}` : '当前主题最高分',
        selected: selectedGuideId === entry.id,
        expeditionEligible: this.isObservatoryEntryExpeditionEligible(entry),
        replayable: !!entry.replayable,
        note: entry.note || '',
        preferredNodes,
        routeFocusLine: buildChallengePreferredNodeLine(preferredNodes),
        compareAxes: buildChallengeComparisonAxes(entry, benchmarkEntry, themeMeta),
        insight,
        trainingTags: insight ? normalizeTagList(insight.trainingTags, 3) : [],
        coachBrief: insight?.coachBrief || '',
        drillObjective: insight?.drillObjective || ''
      };
    });
    return {
      themeKey: resolvedThemeKey,
      themeLabel: resolvedThemeLabel,
      compareHint,
      entries,
      emptyText: `当前还没有「${resolvedThemeLabel}」主题的观星样本。先完成一轮同主题挑战，把打法差异压进观察站。`
    };
  };
  challengeHubMethods.normalizeChallengeProgressState = function (rawState = null) {
    const source = rawState && typeof rawState === 'object' ? rawState : {};
    const sessions = source.sessions && typeof source.sessions === 'object' ? source.sessions : {};
    const normalizeBucket = bucketName => {
      const bucket = sessions[bucketName] && typeof sessions[bucketName] === 'object' ? sessions[bucketName] : {};
      const next = {};
      Object.keys(bucket).forEach(key => {
        const entry = bucket[key] && typeof bucket[key] === 'object' ? bucket[key] : {};
        next[key] = {
          attempts: clampInt(entry.attempts, 0),
          completions: clampInt(entry.completions, 0),
          bestScore: clampInt(entry.bestScore, 0),
          totalScore: clampInt(entry.totalScore, 0),
          claimedRewards: entry.claimedRewards && typeof entry.claimedRewards === 'object' ? {
            ...entry.claimedRewards
          } : {},
          records: Array.isArray(entry.records) ? entry.records.filter(item => item && typeof item === 'object').slice(0, 8).map(item => ({
            score: clampInt(item.score, 0),
            completed: !!item.completed,
            at: clampInt(item.at, 0),
            ruleId: String(item.ruleId || ''),
            ruleName: String(item.ruleName || ''),
            reason: String(item.reason || ''),
            modeLabel: String(item.modeLabel || ''),
            icon: String(item.icon || '✦'),
            themeLabel: String(item.themeLabel || ''),
            featuredTier: String(item.featuredTier || ''),
            featuredTags: normalizeTagList(item.featuredTags, 4)
          })) : [],
          lastResult: entry.lastResult && typeof entry.lastResult === 'object' ? {
            score: clampInt(entry.lastResult.score, 0),
            completed: !!entry.lastResult.completed,
            at: clampInt(entry.lastResult.at, 0),
            ruleId: String(entry.lastResult.ruleId || ''),
            ruleName: String(entry.lastResult.ruleName || ''),
            reason: String(entry.lastResult.reason || ''),
            themeLabel: String(entry.lastResult.themeLabel || ''),
            featuredTier: String(entry.lastResult.featuredTier || '')
          } : null
        };
      });
      return next;
    };
    return {
      sessions: {
        daily: normalizeBucket('daily'),
        weekly: normalizeBucket('weekly'),
        global: normalizeBucket('global')
      },
      recentResults: Array.isArray(source.recentResults) ? source.recentResults.filter(item => item && typeof item === 'object').slice(0, 12).map(item => ({
        mode: ['daily', 'weekly', 'global'].includes(item.mode) ? item.mode : 'daily',
        score: clampInt(item.score, 0),
        completed: !!item.completed,
        at: clampInt(item.at, 0),
        ruleName: String(item.ruleName || ''),
        icon: String(item.icon || '✦'),
        reason: String(item.reason || ''),
        themeLabel: String(item.themeLabel || ''),
        featuredTier: String(item.featuredTier || ''),
        featuredTags: normalizeTagList(item.featuredTags, 4)
      })) : []
    };
  };
  challengeHubMethods.loadChallengeProgressState = function () {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CHALLENGE_PROGRESS_KEY) : null;
      return this.normalizeChallengeProgressState(raw ? JSON.parse(raw) : null);
    } catch (error) {
      return this.normalizeChallengeProgressState();
    }
  };
  challengeHubMethods.saveChallengeProgressState = function () {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(CHALLENGE_PROGRESS_KEY, JSON.stringify(this.challengeProgressState || this.normalizeChallengeProgressState()));
    } catch (error) {
      console.warn('Save challenge progress failed:', error);
    }
  };
  challengeHubMethods.getChallengeProgressEntry = function (mode = 'daily', rotationKey = '', create = false) {
    this.ensureChallengeHubBootState();
    const bucket = this.challengeProgressState.sessions[mode];
    if (!bucket[rotationKey] && create) {
      bucket[rotationKey] = createProgressEntry();
    }
    return bucket[rotationKey] || null;
  };
  challengeHubMethods.getChallengeRuleCatalog = function (mode = 'daily') {
    const rules = typeof CHALLENGE_RULES !== 'undefined' && CHALLENGE_RULES && Array.isArray(CHALLENGE_RULES[mode]) ? CHALLENGE_RULES[mode] : [];
    return rules.map(item => clone(item)).filter(Boolean);
  };
  challengeHubMethods.getChallengeRotationKey = function (mode = 'daily', date = new Date()) {
    return mode === 'daily' ? getDayKey(date) : getWeekKey(date);
  };
  challengeHubMethods.pickChallengeRule = function (mode = 'daily', rotationKey = '') {
    const catalog = this.getChallengeRuleCatalog(mode);
    if (catalog.length === 0) return null;
    const index = hashString(`${mode}:${rotationKey}`) % catalog.length;
    return clone(catalog[index]);
  };
  challengeHubMethods.getChallengeScoreDefaults = function () {
    const base = typeof CHALLENGE_RULES !== 'undefined' && CHALLENGE_RULES && CHALLENGE_RULES.scoreDefaults ? CHALLENGE_RULES.scoreDefaults : {};
    return {
      battleWin: clampInt(base.battleWin, 0),
      eliteWin: clampInt(base.eliteWin, 0),
      bossWin: clampInt(base.bossWin, 0),
      realmClear: clampInt(base.realmClear, 0),
      lawDiscover: clampInt(base.lawDiscover, 0),
      treasureDiscover: clampInt(base.treasureDiscover, 0),
      hpBonus: clampInt(base.hpBonus, 0),
      completeBonus: clampInt(base.completeBonus, 0)
    };
  };
  challengeHubMethods.buildChallengeDangerProfile = function (rule = null, mode = 'daily', themeMeta = null) {
    const source = rule && typeof rule === 'object' ? rule : {};
    const safeMode = ['daily', 'weekly', 'global'].includes(mode) ? mode : 'daily';
    const meta = themeMeta || resolveChallengeThemeMeta(source, safeMode);
    const modifiers = source.battleModifiers && typeof source.battleModifiers === 'object' ? source.battleModifiers : {};
    const enemyHpMul = Math.max(1, safeNumber(modifiers.enemyHpMul, 1));
    const enemyAtkMul = Math.max(1, safeNumber(modifiers.enemyAtkMul, 1));
    const openingBlock = clampInt(modifiers.enemyOpeningBlock, 0, 12);
    const debuffValue = clampInt(modifiers.enemyDebuff?.value, 0, 4);
    const goalRealm = clampInt(source.goalRealm, 1, 18);
    const vowCount = Array.isArray(source.vowIds) ? source.vowIds.filter(Boolean).length : 0;
    const searchText = [source.name, source.intro, source.objective, ...(Array.isArray(source.tags) ? source.tags : [])].join(' ');
    const modeBase = safeMode === 'daily' ? 28 : safeMode === 'weekly' ? 42 : 58;
    const burstTags = /爆发|前压|压制|收头|强袭|快攻|猎首|抢拍|先手/;
    const attritionTags = /长线|守|稳|续航|护盾|跨章|冲榜|法宝|炼器|守阵|耐压/;
    const controlTags = /控场|推演|预判|手牌|弱化|易伤|天机|法则|读图|星录/;
    const executionTags = /双誓|连携|节拍|统一规则|固定命盘|冲分|命盘|试炼|复刻/;
    const burstValue = clampInt(12 + Math.round((enemyAtkMul - 1) * 120) + (/vulnerable|weak/.test(String(modifiers.enemyDebuff?.type || '')) ? 9 + debuffValue * 3 : 0) + (burstTags.test(searchText) ? 8 : 0) + (safeMode === 'global' ? 6 : 0), 0, 100);
    const attritionValue = clampInt(14 + Math.round((enemyHpMul - 1) * 110) + openingBlock * 3 + Math.max(0, goalRealm - 3) * 2 + (attritionTags.test(searchText) ? 8 : 0), 0, 100);
    const controlValue = clampInt(10 + (modifiers.enemyDebuff?.type ? 10 + debuffValue * 5 : 0) + (controlTags.test(searchText) ? 8 : 0) + (meta?.key === 'oracle' ? 6 : 0), 0, 100);
    const executionValue = clampInt(12 + Math.max(0, goalRealm - 3) * 5 + vowCount * 6 + (executionTags.test(searchText) ? 8 : 0) + (safeMode === 'global' ? 10 : safeMode === 'weekly' ? 4 : 0), 0, 100);
    const axes = [{
      ...CHALLENGE_DANGER_AXIS_LIBRARY.burst,
      value: burstValue
    }, {
      ...CHALLENGE_DANGER_AXIS_LIBRARY.attrition,
      value: attritionValue
    }, {
      ...CHALLENGE_DANGER_AXIS_LIBRARY.control,
      value: controlValue
    }, {
      ...CHALLENGE_DANGER_AXIS_LIBRARY.execution,
      value: executionValue
    }];
    const dominantAxis = axes.reduce((best, axis) => axis.value > best.value ? axis : best, axes[0]);
    const axisAverage = axes.reduce((sum, axis) => sum + axis.value, 0) / Math.max(1, axes.length);
    const index = clampInt(modeBase + axisAverage * 0.55 + dominantAxis.value * 0.12 + Math.max(0, goalRealm - 3) * 0.8, 0, 100);
    let tierId = 'controlled';
    let tierLabel = '可控';
    if (index >= 75) {
      tierId = 'extreme';
      tierLabel = '极限';
    } else if (index >= 60) {
      tierId = 'high';
      tierLabel = '高压';
    } else if (index >= 42) {
      tierId = 'medium';
      tierLabel = '中压';
    }
    return normalizeChallengeDangerProfile({
      index,
      tierId,
      tierLabel,
      dominantAxisId: dominantAxis.id,
      dominantAxisLabel: dominantAxis.label,
      summary: `${dominantAxis.label}偏高：${dominantAxis.summary}`,
      counterplay: dominantAxis.counterplay,
      reserveGuidance: dominantAxis.reserveGuidance,
      line: `试炼压强 DRI ${index} / 100 · ${tierLabel} · 主轴 ${dominantAxis.label}`,
      axes: axes.map(axis => ({
        id: axis.id,
        label: axis.label,
        value: axis.value
      }))
    });
  };
  challengeHubMethods.buildChallengeBundle = function (mode = 'daily', date = new Date()) {
    this.ensureChallengeHubBootState();
    const safeMode = ['daily', 'weekly', 'global'].includes(mode) ? mode : 'daily';
    const rotationKey = this.getChallengeRotationKey(safeMode, date);
    const meta = HUB_META[safeMode] || HUB_META.daily;
    const rule = this.pickChallengeRule(safeMode, rotationKey);
    const seedSignature = this.buildChallengeSeedSignature(safeMode, rotationKey, rule);
    const entry = this.getChallengeProgressEntry(safeMode, rotationKey, false) || createProgressEntry();
    const themeMeta = this.getChallengeThemeMeta(rule, safeMode);
    const dangerProfile = this.buildChallengeDangerProfile(rule, safeMode, themeMeta);
    const currentValue = safeMode === 'daily' ? clampInt(entry.completions, 0) : safeMode === 'weekly' ? clampInt(entry.totalScore, 0) : clampInt(entry.bestScore, 0);
    const rewards = Array.isArray(rule?.rewardTrack) ? rule.rewardTrack.map(reward => {
      const target = clampInt(reward.target, 0);
      const claimed = !!entry.claimedRewards[reward.id];
      return {
        ...clone(reward),
        target,
        claimed,
        currentValue,
        ready: !claimed && currentValue >= target,
        progressText: safeMode === 'daily' ? `${Math.min(target || 1, currentValue)}/${Math.max(1, target || 1)}` : `${currentValue}/${target}`
      };
    }) : [];
    const records = Array.isArray(entry.records) ? entry.records.slice(0, 5) : [];
    return {
      mode: safeMode,
      rotationKey,
      rotationLabel: formatDateLabel(safeMode, rotationKey),
      meta,
      rule,
      themeMeta,
      dangerProfile,
      seedSignature,
      progress: {
        attempts: clampInt(entry.attempts, 0),
        completions: clampInt(entry.completions, 0),
        bestScore: clampInt(entry.bestScore, 0),
        totalScore: clampInt(entry.totalScore, 0),
        currentValue
      },
      rewards,
      records,
      leaderboard: safeMode === 'global' ? this.buildChallengeLeaderboard(rotationKey, entry) : []
    };
  };
  challengeHubMethods.buildReplayBundleFromArchiveEntry = function (recordId = '') {
    const entry = this.getObservatoryArchiveEntries({
      limit: 24
    }).find(item => item && item.id === String(recordId || ''));
    if (!entry || !entry.replayable || !entry.rule?.id) return null;
    const safeMode = ['daily', 'weekly', 'global'].includes(entry.mode) ? entry.mode : 'daily';
    const themeMeta = this.getChallengeThemeMeta(entry.rule, safeMode);
    const archiveInsight = normalizeChallengeArchiveInsight(buildChallengeArchiveInsight({
      ...entry,
      replayOnly: true
    }, themeMeta));
    return {
      mode: safeMode,
      rotationKey: entry.rotationKey || `archive-${entry.id}`,
      rotationLabel: entry.rotationLabel || formatDateLabel(safeMode, entry.rotationKey || ''),
      meta: {
        title: '观星台 · 命盘回放',
        subtitle: '按历史命盘重开，不计入当前轮换奖励，只保留观星留痕与回放得分。',
        label: '观星回放',
        accentClass: HUB_META[safeMode]?.accentClass || 'daily'
      },
      rule: clone(entry.rule),
      themeMeta,
      dangerProfile: this.buildChallengeDangerProfile(entry.rule, safeMode, themeMeta),
      seedSignature: entry.seedSignature || this.buildChallengeSeedSignature(safeMode, entry.rotationKey || entry.id, entry.rule),
      archiveInsight: hasChallengeArchiveInsight(archiveInsight) ? archiveInsight : null,
      progress: createProgressEntry(),
      rewards: [],
      records: [],
      leaderboard: [],
      replayOnly: true,
      archiveEntryId: entry.id
    };
  };
  challengeHubMethods.buildPvpLiveDrillBundle = function (scenario = null) {
    this.ensureChallengeHubBootState();
    const source = scenario && typeof scenario === 'object' ? scenario : null;
    if (!source || source.reportVersion !== 'pvp-live-drill-scenario-v1') return null;
    if (source.sourceVisibility !== 'replay_self' || source.usesHiddenInformation !== false || source.rankedImpact !== 'none') return null;
    const matchId = String(source.sourceMatchId || '').trim();
    if (!matchId) return null;
    const normalizePracticePlan = (plan = null) => {
      const src = plan && typeof plan === 'object' ? plan : null;
      if (!src || src.reportVersion !== 'pvp-live-practice-plan-v1') return null;
      if (src.sourceVisibility !== 'public_events' || src.usesHiddenInformation !== false || src.rankedImpact !== 'none') return null;
      const tempoScript = Array.isArray(src.tempoScript) ? src.tempoScript.slice(0, 3).map(item => ({
        id: String(item && item.id || ''),
        label: String(item && item.label || ''),
        sequence: Number.isFinite(Number(item && item.sequence)) ? Math.floor(Number(item.sequence)) : null,
        eventType: String(item && item.eventType || ''),
        actingSeat: String(item && item.actingSeat || ''),
        severity: String(item && item.severity || 'tempo'),
        lesson: String(item && item.lesson || ''),
        drillPrompt: String(item && item.drillPrompt || '')
      })).filter(item => item.id && item.label && item.eventType && item.lesson) : [];
      const fairnessFocus = Array.isArray(src.fairnessFocus) ? src.fairnessFocus.slice(0, 3).map(item => ({
        id: String(item && item.id || ''),
        label: String(item && item.label || ''),
        status: String(item && item.status || 'watch'),
        detail: String(item && item.detail || '')
      })).filter(item => item.id && item.label && item.detail) : [];
      if (tempoScript.length === 0 && fairnessFocus.length === 0) return null;
      return {
        reportVersion: 'pvp-live-practice-plan-v1',
        sourceVisibility: 'public_events',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        objectiveLine: String(src.objectiveLine || '按公开关键回合复刻节奏，不写正式积分。'),
        coachLine: String(src.coachLine || '先复刻公开关键窗口，再回真人排位验证。'),
        guardrailLine: String(src.guardrailLine || '训练计划只读公开事件，不读取隐藏手牌或牌库。'),
        tempoScript,
        fairnessFocus
      };
    };
    const hasPracticePlan = Object.prototype.hasOwnProperty.call(source, 'practicePlan');
    const practicePlan = hasPracticePlan ? normalizePracticePlan(source.practicePlan) : null;
    if (hasPracticePlan && !practicePlan) return null;
    const themeKey = ['assault', 'bulwark', 'oracle', 'tempo'].includes(source.themeKey) ? source.themeKey : 'bulwark';
    const themeRuleMap = {
      assault: 'daily_ember_break',
      bulwark: 'daily_bastion_vow',
      oracle: 'daily_star_script',
      tempo: 'daily_frost_clinic'
    };
    const dailyRules = typeof CHALLENGE_RULES !== 'undefined' && CHALLENGE_RULES && Array.isArray(CHALLENGE_RULES.daily) ? CHALLENGE_RULES.daily : [];
    const baseRule = dailyRules.find(rule => rule && rule.id === themeRuleMap[themeKey]) || this.pickChallengeRule('daily', matchId);
    const shortHash = hashString(`pvp-live-drill:${matchId}:${themeKey}:${source.finishReason || ''}`).toString(36).toUpperCase();
    const trainingTags = normalizeTagList(Array.isArray(source.trainingTags) ? source.trainingTags : [], 4);
    const publicEventTypes = normalizeTagList(Array.isArray(source.publicEventTypes) ? source.publicEventTypes : [], 4);
    const eventLine = publicEventTypes.length ? publicEventTypes.join(' / ') : '公开事件';
    const resultLabel = source.result === 'loss' ? '首败' : source.result === 'win' ? '胜局' : '终局';
    const tempoLine = practicePlan && practicePlan.tempoScript.length
      ? `节奏脚本：${practicePlan.tempoScript.map(item => `${item.label}#${item.sequence !== null ? item.sequence : '-'}`).join(' / ')}`
      : '';
    const focusLine = practicePlan && practicePlan.fairnessFocus.length
      ? `体验复查：${practicePlan.fairnessFocus.map(item => `${item.label}·${item.status}`).join(' / ')}`
      : '';
    const rule = normalizeChallengeRuleSnapshot({
      ...clone(baseRule),
      id: `pvp_live_drill_${shortHash.toLowerCase()}`,
      icon: '⚔️',
      name: `真人复盘 · ${source.themeLabel || '问道练习'}`,
      intro: String(source.trainingAdvice || `真人 PVP ${resultLabel}复盘练习。`),
      objective: String(source.drillObjective || '按公开事件复刻本局失误窗口，不写正式积分。'),
      targetChapter: `真人 PVP ${resultLabel}复盘`,
      goalRealm: 3,
      tags: normalizeTagList(['真人 PVP', '问道练习', '不计奖励', ...trainingTags], 6)
    });
    const themeMeta = this.getChallengeThemeMeta(rule, 'daily');
    const archiveInsight = normalizeChallengeArchiveInsight({
      title: `真人 PVP ${resultLabel}练习`,
      summary: String(source.trainingAdvice || '从赛后公开复盘生成的问道练习。'),
      focusLines: [
        String(source.drillObjective || '按公开事件复刻本局失误窗口。'),
        `公开事件：${eventLine}`,
        tempoLine,
        focusLine,
        '不写正式积分，不读取隐藏手牌或牌库。'
      ].filter(Boolean),
      preferredNodeLine: themeMeta?.preferredNodes?.length ? buildChallengePreferredNodeLine(themeMeta.preferredNodes) : '',
      reasonLabel: '真人 PVP 赛后',
      trainingTags: normalizeTagList(trainingTags.length ? trainingTags : ['真人 PVP', '问道练习'], 3),
      coachBrief: practicePlan?.coachLine || '先按公开轨迹复盘关键窗口，再用观星回放开一局不计奖励的练习。',
      drillObjective: practicePlan?.objectiveLine || String(source.drillObjective || '复刻公开失误窗口，不写正式积分。')
    });
    const rotationKey = `pvp-live-drill-${shortHash.toLowerCase()}`;
    return {
      mode: 'daily',
      rotationKey,
      rotationLabel: '真人 PVP 练习',
      meta: {
        title: '真人 PVP · 问道练习',
        subtitle: '基于赛后公开事件生成的无奖励练习命盘，不读取隐藏信息，不写正式积分。',
        label: '真人练习',
        accentClass: 'daily',
        ...(practicePlan ? { practicePlan: clone(practicePlan) } : {})
      },
      rule,
      themeMeta,
      dangerProfile: this.buildChallengeDangerProfile(rule, 'daily', themeMeta),
      seedSignature: `PVP-${shortHash}`,
      archiveInsight: hasChallengeArchiveInsight(archiveInsight) ? archiveInsight : null,
      progress: createProgressEntry(),
      rewards: [],
      records: [],
      leaderboard: [],
      replayOnly: true,
      practiceOnly: true,
      archiveEntryId: `pvp_live:${matchId}`,
      pvpLiveDrillSource: normalizePvpLiveDrillSource({
        sourceMatchId: matchId,
        sourceRunId: `pvp_live:${matchId}`,
        result: source.result,
        finishReason: source.finishReason,
        recommendedLoadoutId: source.recommendedLoadoutId,
        recommendedLoadoutLabel: source.recommendedLoadoutLabel,
        themeKey: source.themeKey,
        themeLabel: source.themeLabel,
        trainingAdvice: source.trainingAdvice,
        drillObjective: source.drillObjective,
        trainingTags
      })
    };
  };
  challengeHubMethods.beginPvpLiveDrillScenario = function (scenario = null) {
    this.ensureChallengeHubBootState();
    const bundle = this.buildPvpLiveDrillBundle(scenario);
    if (!bundle || !bundle.rule) return false;
    if (this.activeChallengeRun && !this.activeChallengeRun.resolved && this.activeChallengeRun.replayOnly && this.activeChallengeRun.archiveEntryId === bundle.archiveEntryId) {
      this.showScreen('map-screen');
      return true;
    }
    this.pendingChallengeStart = {
      mode: bundle.mode,
      rotationKey: bundle.rotationKey,
      rule: clone(bundle.rule),
      modeLabel: bundle.meta.label,
      bundleSnapshot: clone(bundle),
      replayOnly: true,
      practiceOnly: true,
      seedSignature: bundle.seedSignature || '',
      archiveEntryId: bundle.archiveEntryId || '',
      archiveInsight: bundle.archiveInsight && hasChallengeArchiveInsight(bundle.archiveInsight) ? normalizeChallengeArchiveInsight(bundle.archiveInsight) : null
    };
    if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(`真人 PVP 问道练习已锁定【${bundle.rule.name}】。本轮只记录留痕，不计奖励或正式积分。`, {
        category: 'system',
        duration: 3000
      });
    }
    if (typeof this.showCharacterSelection === 'function') {
      this.showCharacterSelection();
    } else if (typeof this.openSaveSlotsWithSync === 'function') {
      this.openSaveSlotsWithSync();
    }
    return true;
  };
  challengeHubMethods.buildChallengeLeaderboard = function (rotationKey = '', entry = null) {
    const baseNames = ['丹渊', '孤衡', '南烛', '玄泠', '照川', '寂河', '停云', '白述'];
    const scores = [];
    const seed = hashString(`leaderboard:${rotationKey}`);
    for (let i = 0; i < baseNames.length; i += 1) {
      const wobble = (seed >> i % 8 & 31) - 15;
      scores.push({
        name: baseNames[i],
        score: 1280 - i * 58 + wobble,
        highlight: false
      });
    }
    if (entry && clampInt(entry.bestScore, 0) > 0) {
      scores.push({
        name: '你',
        score: clampInt(entry.bestScore, 0),
        highlight: true
      });
    } else {
      scores.push({
        name: '你',
        score: 0,
        highlight: true
      });
    }
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, 8).map((item, index) => ({
      rank: index + 1,
      name: item.name,
      score: clampInt(item.score, 0),
      highlight: !!item.highlight
    }));
  };
  challengeHubMethods.getSanctumOverviewData = function () {
    const data = typeof originalGetSanctumOverviewData === 'function' ? originalGetSanctumOverviewData.call(this) : null;
    if (!data || !Array.isArray(data.rooms)) return data;
    const archive = this.getObservatoryArchiveSummary();
    data.rooms = data.rooms.map(room => {
      if (room && room.id === 'observatory') {
        return {
          ...room,
          focus: '周挑战 / 章节预兆 / 观星留痕',
          note: archive.totalRecords > 0 ? `已留下 ${archive.totalRecords} 条观星留痕，其中 ${archive.replayCount} 次为命盘回放，可继续复盘旧命盘。` : '今日天机、七日劫数与众生试炼已经接入观星台，可直接从洞府切到本周轮换。',
          actionLabel: archive.totalRecords > 0 ? '查看观星台' : '查看周挑战',
          actionType: 'challenge',
          actionValue: 'daily'
        };
      }
      return room;
    });
    data.progress = {
      ...(data.progress || {}),
      observatoryTraces: archive.totalRecords,
      observatoryReplays: archive.replayCount
    };
    if (Array.isArray(data.researches) && !data.researches.some(item => item && item.id === 'observatory_archive')) {
      data.researches.push({
        id: 'observatory_archive',
        room: '观星台',
        name: '命盘留痕库',
        progress: archive.totalRecords > 0 ? 1 : 0,
        goal: 1,
        reward: '观星台会沉淀命盘签、挑战留痕与回放入口，让旧命盘可直接重开。',
        section: 'sanctum',
        actionType: 'challenge',
        actionValue: 'daily',
        ready: archive.totalRecords > 0,
        progressText: `${archive.totalRecords > 0 ? 1 : 0}/1`
      });
    }
    return data;
  };
  challengeHubMethods.showChallengeHub = function (tab = 'daily') {
    this.ensureChallengeHubBootState();
    this.challengeHubState.tab = ['daily', 'weekly', 'global'].includes(tab) ? tab : 'daily';
    this.persistChallengeHubState();
    this.showScreen('challenge-screen');
    this.initChallengeHub();
  };
  challengeHubMethods.switchChallengeTab = function (tab = 'daily') {
    this.ensureChallengeHubBootState();
    this.challengeHubState.tab = ['daily', 'weekly', 'global'].includes(tab) ? tab : 'daily';
    this.persistChallengeHubState();
    if (this.currentScreen !== 'challenge-screen') {
      this.showChallengeHub(this.challengeHubState.tab);
      return;
    }
    this.initChallengeHub();
  };
  challengeHubMethods.initChallengeHub = function () {
    if (typeof document === 'undefined') return;
    this.ensureChallengeHubBootState();
    const tab = this.challengeHubState.tab || 'daily';
    const bundle = this.buildChallengeBundle(tab);
    if (!bundle || !bundle.rule) return;
    const titleEl = document.getElementById('challenge-hub-title');
    const subtitleEl = document.getElementById('challenge-hub-subtitle');
    const summaryEl = document.getElementById('challenge-hub-summary');
    const rulesEl = document.getElementById('challenge-hub-rules');
    const rewardsEl = document.getElementById('challenge-hub-rewards');
    const recordsEl = document.getElementById('challenge-hub-records');
    const sideEl = document.getElementById('challenge-hub-side');
    const rankingEl = document.getElementById('challenge-hub-ranking');
    const launchEl = document.getElementById('challenge-hub-launch');
    if (titleEl) titleEl.textContent = bundle.meta.title;
    if (subtitleEl) subtitleEl.textContent = bundle.meta.subtitle;
    document.querySelectorAll('#challenge-screen [data-challenge-tab]').forEach(button => {
      button.classList.toggle('active', button.dataset.challengeTab === tab);
    });
    const run = this.activeChallengeRun;
    const isCurrentRun = !!run && !run.resolved && run.mode === bundle.mode && run.rotationKey === bundle.rotationKey;
    const archiveSummary = this.getObservatoryArchiveSummary();
    const themeMeta = bundle.themeMeta || this.getChallengeThemeMeta(bundle.rule, bundle.mode);
    const dangerProfile = bundle.dangerProfile || this.buildChallengeDangerProfile(bundle.rule, bundle.mode, themeMeta);
    const selectedGuide = this.getSelectedObservatoryExpeditionGuide({
      silentSync: true
    });
    const trainingFocus = this.getObservatoryTrainingFocus();
    const pvpLivePracticeReturn = this.getPvpLivePracticeReturnReceipt();
    const archiveFilters = this.buildChallengeArchiveFilterBundle(bundle);
    const comparison = this.buildObservatoryThemeComparison({
      mode: bundle.mode,
      rule: bundle.rule,
      themeKey: themeMeta.key,
      themeLabel: themeMeta.label,
      compareHint: themeMeta.compareHint
    });
    const archiveEntries = archiveFilters.entries;
    const seasonVerificationArchive = bundle.mode === 'weekly' && typeof this.getSeasonVerificationArchiveSnapshot === 'function' ? this.getSeasonVerificationArchiveSnapshot() : null;
    const seasonVerificationArchiveFilters = bundle.mode === 'weekly' ? this.buildSeasonVerificationArchiveFilterBundle(seasonVerificationArchive, {
      tab: 'weekly'
    }) : null;
    const seasonVerificationArchiveEntries = seasonVerificationArchiveFilters?.entries || [];
    const trainingFocusViewActive = !!trainingFocus?.themeKey && archiveFilters.state.scope === 'all' && archiveFilters.state.track === 'playable' && archiveFilters.state.outcome === 'all' && archiveFilters.state.themeKey === trainingFocus.themeKey && archiveFilters.state.sortBy === 'score_desc';
    const renderArchiveSelectOptions = (options = [], currentValue = '') => options.map(item => `
            <option value="${escapeHtml(item.value)}"${item.value === currentValue ? ' selected' : ''}>${escapeHtml(item.label)}</option>
        `).join('');
    const describeArchiveEntryLead = entry => {
      if (!entry) return '观星留痕';
      if (entry.type === 'omen') return '观星预兆';
      return entry.replayOnly ? '命盘回放' : '观星留痕';
    };
    const describeArchiveEntrySummary = entry => {
      const lead = describeArchiveEntryLead(entry);
      if (entry?.type === 'omen') {
        return `${lead} · ${entry.originLabel || '观星台'}${entry.note ? ` · ${entry.note}` : ''}`;
      }
      return `${lead} · ${entry?.completed ? '完成' : '中断'} · 得分 ${clampInt(entry?.score, 0)}${entry?.themeLabel ? ` · ${entry.themeLabel}` : ''}`;
    };
    if (summaryEl) {
      const tags = normalizeTagList([themeMeta.signatureTag, ...(Array.isArray(bundle.rule.tags) ? bundle.rule.tags : [])], 4);
      summaryEl.innerHTML = `
                <article class="challenge-focus-card ${escapeHtml(bundle.meta.accentClass)}">
                    <div class="challenge-focus-head">
                        <span class="challenge-focus-icon">${escapeHtml(bundle.rule.icon || '✦')}</span>
                        <div>
                            <span class="challenge-kicker">${escapeHtml(bundle.meta.label)} · ${escapeHtml(bundle.rotationLabel)}</span>
                            <h3>${escapeHtml(bundle.rule.name || '未知试炼')}</h3>
                        </div>
                    </div>
                    <p class="challenge-focus-intro">${escapeHtml(bundle.rule.intro || bundle.rule.objective || '观星台正在推演当前试炼。')}</p>
                    <div class="challenge-focus-meta">
                        <div class="challenge-meta-chip"><strong>${escapeHtml(bundle.rule.targetChapter || '未知章节')}</strong><span>目标章节</span></div>
                        <div class="challenge-meta-chip"><strong>第 ${clampInt(bundle.rule.goalRealm, 1, 18)} 重</strong><span>完成线</span></div>
                        <div class="challenge-meta-chip"><strong>${clampInt(bundle.progress.bestScore, 0)}</strong><span>${bundle.mode === 'weekly' ? '历史最高单次' : '当前最高得分'}</span></div>
                        <div class="challenge-meta-chip"><strong>${bundle.mode === 'weekly' ? clampInt(bundle.progress.totalScore, 0) : clampInt(bundle.progress.completions, 0)}</strong><span>${bundle.mode === 'weekly' ? '周累计积分' : '完成次数'}</span></div>
                    </div>
                    <div class="challenge-tag-strip">
                        ${tags.map(tag => `<span class="challenge-tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                    <div class="challenge-seed-line">
                        <span class="challenge-seed-chip">命盘签 ${escapeHtml(bundle.seedSignature)}</span>
                        <span>完成后会沉淀为命盘档案，可回放、复盘，并继续设为远征线索。</span>
                    </div>
                    <div class="challenge-theme-note">
                        <strong>${escapeHtml(themeMeta.label)}</strong>
                        <span>${escapeHtml(comparison.compareHint)}</span>
                    </div>
                    <div class="challenge-danger-band">
                        <div class="challenge-danger-head">
                            <strong>试炼压强</strong>
                            <span>DRI ${dangerProfile.index} / 100 · ${escapeHtml(dangerProfile.tierLabel)}</span>
                        </div>
                        <p class="challenge-danger-summary">${escapeHtml(dangerProfile.summary)}</p>
                        <div class="challenge-danger-grid">
                            ${dangerProfile.axes.map(axis => `
                                <div class="challenge-danger-chip">
                                    <strong>${clampInt(axis.value, 0)}</strong>
                                    <span>${escapeHtml(axis.label)}</span>
                                </div>
                            `).join('')}
                        </div>
                        <div class="challenge-danger-foot">
                            <span>主轴：${escapeHtml(dangerProfile.dominantAxisLabel)}</span>
                            <span>对策：${escapeHtml(dangerProfile.counterplay)}</span>
                        </div>
                    </div>
                    ${selectedGuide ? `<div class="challenge-inline-note">当前远征线索：${escapeHtml(selectedGuide.title)} · ${escapeHtml(selectedGuide.themeLabel)}。</div>` : '<div class="challenge-inline-note">当前还没有精选命盘线索，先完成一轮挑战，把最佳答卷压进观察站。</div>'}
                    ${isCurrentRun ? `<div class="challenge-inline-note">当前已有进行中的 ${escapeHtml(bundle.meta.label)}，回地图即可继续冲线。</div>` : ''}
                </article>
            `;
    }
    if (rulesEl) {
      const scoreDefaults = this.getChallengeScoreDefaults();
      const rules = [`指定角色：${this.getCharacterDisplayName(bundle.rule.characterId)}`, `开局命格：${this.getChallengeMetaName('destiny', bundle.rule.runDestinyId)}`, `同行灵契：${this.getChallengeMetaName('spirit', bundle.rule.spiritCompanionId)}`, Array.isArray(bundle.rule.vowIds) && bundle.rule.vowIds.length > 0 ? `固定誓约：${bundle.rule.vowIds.map(id => this.getChallengeMetaName('vow', id)).join(' / ')}` : '固定誓约：无', bundle.rule.battleModifiers?.enemyOpeningBlock > 0 ? `敌方开场护盾 +${clampInt(bundle.rule.battleModifiers.enemyOpeningBlock, 0)}` : null, Number(bundle.rule.battleModifiers?.enemyHpMul || 1) > 1 ? `敌方生命 x${safeNumber(bundle.rule.battleModifiers.enemyHpMul, 1).toFixed(2)}` : null, Number(bundle.rule.battleModifiers?.enemyAtkMul || 1) > 1 ? `敌方伤害 x${safeNumber(bundle.rule.battleModifiers.enemyAtkMul, 1).toFixed(2)}` : null, bundle.rule.battleModifiers?.enemyDebuff?.type ? `额外压制：${bundle.rule.battleModifiers.enemyDebuff.type} ${clampInt(bundle.rule.battleModifiers.enemyDebuff.value, 0)}` : null, `基础计分：普通战 +${scoreDefaults.battleWin} / 精英 +${scoreDefaults.eliteWin} / Boss +${scoreDefaults.bossWin}`, `章节推进：每破一重 +${scoreDefaults.realmClear}，完成线 +${scoreDefaults.completeBonus}`].filter(Boolean);
      rulesEl.innerHTML = rules.map(line => `
                <article class="challenge-rule-card">
                    <span class="challenge-rule-bullet">✦</span>
                    <p>${escapeHtml(line)}</p>
                </article>
            `).join('');
    }
    if (rewardsEl) {
      rewardsEl.innerHTML = bundle.rewards.map(reward => `
                <article class="challenge-reward-card ${reward.claimed ? 'claimed' : reward.ready ? 'ready' : 'locked'}">
                    <div class="challenge-reward-top">
                        <div>
                            <strong>${escapeHtml(reward.label)}</strong>
                            <p>${escapeHtml(reward.rewardText || '完成后可领取奖励。')}</p>
                        </div>
                        <span class="challenge-reward-progress">${escapeHtml(reward.progressText)}</span>
                    </div>
                    <button type="button" class="collection-inline-btn"
                        data-challenge-action="claim-milestone"
                        data-challenge-mode="${escapeHtml(bundle.mode)}"
                        data-reward-id="${escapeHtml(reward.id)}"
                        ${reward.ready && !reward.claimed ? '' : 'disabled'}>${reward.claimed ? '已领取' : reward.ready ? '领取奖励' : '未达成'}</button>
                </article>
            `).join('');
    }
    if (recordsEl) {
      const source = bundle.records.length > 0 ? bundle.records : Array.isArray(this.challengeProgressState?.recentResults) ? this.challengeProgressState.recentResults.filter(item => item.mode === bundle.mode).slice(0, 4) : [];
      const currentRecordsMarkup = source.length > 0 ? source.map(record => `
                    <article class="challenge-record-item">
                        <div>
                            <strong>${escapeHtml(record.ruleName || bundle.rule.name || '试炼记录')}</strong>
                            <p>${record.completed ? '完成试炼' : '试炼中断'} · 得分 ${clampInt(record.score, 0)}${record.themeLabel ? ` · ${escapeHtml(record.themeLabel)}` : ''}</p>
                            ${Array.isArray(record.featuredTags) && record.featuredTags.length > 0 ? `<div class="challenge-record-tags">${record.featuredTags.map(tag => `<span class="challenge-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
                        </div>
                        <span>${escapeHtml(this.formatCollectionTimestamp ? this.formatCollectionTimestamp(record.at) : formatDateLabel(bundle.mode, bundle.rotationKey))}</span>
                    </article>
                `).join('') : '<div class="codex-empty-state">当前轮换还没有留痕，去跑一局把分数打出来。</div>';
      const archiveMarkup = archiveEntries.length > 0 ? archiveEntries.map(entry => `
                    <article class="challenge-record-item replayable">
                        <div>
                            <strong>${escapeHtml(entry.title || bundle.rule.name || '观星留痕')}</strong>
                            <p>${escapeHtml(describeArchiveEntrySummary(entry))}</p>
                            <div class="challenge-record-subline">
                                ${entry.seedSignature ? `<span class="challenge-seed-chip">${escapeHtml(entry.seedSignature)}</span>` : `<span>${escapeHtml(entry.originLabel || '观星台')}</span>`}
                                <span>${escapeHtml(entry.rotationLabel || formatDateLabel(entry.mode, entry.rotationKey))}</span>
                                <span>${escapeHtml(entry.type === 'omen' ? '路线留痕' : entry.featuredTier || '留痕')}</span>
                            </div>
                            ${entry.featuredTags.length > 0 ? `<div class="challenge-record-tags">${entry.featuredTags.map(tag => `<span class="challenge-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
                            ${renderChallengeInsightMarkup(entry.insight)}
                        </div>
                        <div class="challenge-record-actions">
                            <span>${escapeHtml(this.formatCollectionTimestamp ? this.formatCollectionTimestamp(entry.at) : formatDateLabel(entry.mode, entry.rotationKey))}</span>
                            ${entry.replayable ? `<button type="button" class="collection-inline-btn secondary"
                                data-challenge-action="begin-replay"
                                data-replay-record-id="${escapeHtml(entry.id)}"
                                data-record-id="${escapeHtml(entry.id)}">复盘命盘</button>` : ''}
                            ${entry.featured ? `<button type="button" class="collection-inline-btn ${selectedGuide?.id === entry.id ? 'secondary' : ''}"
                                data-challenge-action="select-guide"
                                data-guide-record-id="${escapeHtml(entry.id)}"
                                data-record-id="${escapeHtml(entry.id)}"
                                ${selectedGuide?.id === entry.id ? 'disabled' : ''}
                                >${selectedGuide?.id === entry.id ? '当前远征线索' : '设为远征线索'}</button>` : ''}
                        </div>
                    </article>
                `).join('') : `<div class="codex-empty-state">${escapeHtml(archiveFilters.emptyText)}</div>`;
      const verificationArchiveMarkup = seasonVerificationArchiveEntries.length > 0 ? seasonVerificationArchiveEntries.map(entry => `
                    <article class="challenge-record-item replayable"
                        data-season-verification-archive-entry="true"
                        data-season-verification-record-id="${escapeHtml(entry.recordId || '')}"
                        data-season-verification-anchor="${escapeHtml(entry.anchorSection || '')}"
                        data-season-verification-source-mode="${escapeHtml(entry.sourceMode || '')}"
                        data-season-verification-result-status="${escapeHtml(entry.resultStatus || '')}"
                        data-season-verification-trajectory-key="${escapeHtml(resolveSeasonVerificationArchiveTrajectoryMeta(entry).key || 'all')}"
                        data-season-verification-role="${escapeHtml(entry.role || '')}">
                        <div>
                            <strong>${escapeHtml(entry.kicker || `${entry.weekLabel || entry.weekTag || '本周轮转'} · ${entry.roleLabel || '周判记录'}`)}</strong>
                            <p>${escapeHtml(entry.noteLine || entry.summaryLine || entry.writebackLine || entry.detailLine || '周判记录已归档。')}</p>
                            <div class="challenge-record-subline">
                                ${[entry.sourceModeLabel || entry.roleLabel || '验证', entry.phaseLabel || '', entry.settlementOutcomeLabel || '', entry.lineageStyle || ''].filter(Boolean).map(line => `<span>${escapeHtml(line)}</span>`).join('')}
                            </div>
                        </div>
                        <div class="challenge-record-actions">
                            <span>${escapeHtml(entry.resultLabel || entry.writebackLabel || '已归档')}</span>
                            <button type="button" class="collection-inline-btn secondary"
                                data-season-verification-archive-action="true"
                                data-challenge-action="follow-season-verification-record"
                                data-record-id="${escapeHtml(entry.recordId || '')}">${escapeHtml(entry.ctaLabel || '沿此复核')}</button>
                        </div>
                    </article>
                `).join('') : `<div class="codex-empty-state">${escapeHtml(seasonVerificationArchiveFilters?.emptyText || '当前轮换还没有周判记录，先去补一张真正落档的主验证或旁验证。')}</div>`;
      const comparisonMarkup = comparison.entries.length > 0 ? comparison.entries.map(entry => `
                    <article class="challenge-compare-card ${entry.selected ? 'selected' : ''}" data-record-id="${escapeHtml(entry.id)}">
                        <div class="challenge-compare-head">
                            <div>
                                <strong>${escapeHtml(entry.title)}</strong>
                                <p>${escapeHtml(entry.note || entry.metricLine)}</p>
                            </div>
                            <span class="challenge-compare-score">${clampInt(entry.score, 0)} 分</span>
                        </div>
                        <div class="challenge-record-subline">
                            <span class="challenge-seed-chip">${escapeHtml(entry.seedSignature || '命盘签未定')}</span>
                            <span>${escapeHtml(entry.featuredTier || '留痕')}</span>
                            <span>${escapeHtml(entry.deltaText)}</span>
                        </div>
                        <div class="challenge-record-tags">
                            ${entry.featuredTags.map(tag => `<span class="challenge-tag">${escapeHtml(tag)}</span>`).join('')}
                        </div>
                        ${entry.compareAxes?.length ? `<div class="challenge-record-insight-lines">${entry.compareAxes.map(axis => `<span class="challenge-record-insight-line">${escapeHtml(axis.line)}</span>`).join('')}</div>` : ''}
                        ${entry.routeFocusLine ? `<div class="challenge-compare-meta"><span>${escapeHtml(entry.routeFocusLine)}</span></div>` : ''}
                        ${renderChallengeInsightMarkup(entry.insight, {
        compact: true
      })}
                        <div class="challenge-compare-meta">
                            <span>${escapeHtml(entry.modeLabel)}</span>
                            <span>${escapeHtml(entry.metricLine)}</span>
                        </div>
                        <div class="challenge-compare-actions">
                            ${entry.expeditionEligible ? `<button type="button" class="collection-inline-btn ${entry.selected ? 'secondary' : ''}"
                                data-challenge-action="select-guide"
                                data-guide-record-id="${escapeHtml(entry.id)}"
                                data-record-id="${escapeHtml(entry.id)}"
                                ${entry.selected ? 'disabled' : ''}
                                >${entry.selected ? '当前远征线索' : '设为远征线索'}</button>` : ''}
                            ${entry.replayable ? `<button type="button" class="collection-inline-btn secondary"
                                data-challenge-action="begin-replay"
                                data-replay-record-id="${escapeHtml(entry.id)}"
                                data-record-id="${escapeHtml(entry.id)}">复盘命盘</button>` : ''}
                        </div>
                    </article>
                `).join('') : `<div class="codex-empty-state">${escapeHtml(comparison.emptyText)}</div>`;
      recordsEl.innerHTML = `
                <section class="challenge-record-section">
                    <div class="challenge-record-section-head">
                        <strong>当前轮换记录</strong>
                        <span>${escapeHtml(bundle.rotationLabel)}</span>
                    </div>
                    ${currentRecordsMarkup}
                </section>
                ${bundle.mode === 'weekly' ? `
                    <section class="challenge-record-section"
                        data-season-verification-archive="true"
                        data-season-verification-total="${escapeHtml(String(seasonVerificationArchive?.totalRecords || 0))}"
                        data-season-verification-filtered="${escapeHtml(String(seasonVerificationArchiveFilters?.matchedCount || 0))}">
                        <div class="challenge-record-section-head">
                            <strong>周判记录</strong>
                            <span>${escapeHtml(`${seasonVerificationArchiveFilters?.matchedCount || 0} / ${seasonVerificationArchive?.totalRecords || 0} 条命中`)}</span>
                        </div>
                        <p class="challenge-compare-note">${escapeHtml(seasonVerificationArchive?.summaryLine || '把每周主验证、旁验证与清账回写压成同一层长期周判记录。')}</p>
                        <div class="challenge-archive-toolbar" data-season-verification-toolbar="true">
                            <div class="challenge-archive-toolbar-head">
                                <p class="challenge-compare-note">${escapeHtml(seasonVerificationArchive?.detailLine || '把周挑战、天道榜与地图清账回写压成同一层长期周判记录，按来源、判定与角色快速复核。')}</p>
                                <button type="button" class="collection-inline-btn secondary"
                                    data-reset-season-verification-filters="true"
                                    data-challenge-action="reset-season-verification-filters"
                                    data-challenge-mode="weekly"
                                    ${seasonVerificationArchiveFilters?.isDefault ? 'disabled' : ''}
                                    >还原周判筛面</button>
                            </div>
                            <div class="challenge-archive-filter-grid">
                                <label class="challenge-archive-filter">
                                    <span>来源</span>
                                    <select data-season-verification-filter="sourceMode"
                                        data-challenge-mode="weekly">${renderArchiveSelectOptions(seasonVerificationArchiveFilters?.sourceModeOptions || [], seasonVerificationArchiveFilters?.state?.sourceMode || 'all')}</select>
                                </label>
                                <label class="challenge-archive-filter">
                                    <span>判定</span>
                                    <select data-season-verification-filter="resultStatus"
                                        data-challenge-mode="weekly">${renderArchiveSelectOptions(seasonVerificationArchiveFilters?.resultOptions || [], seasonVerificationArchiveFilters?.state?.resultStatus || 'all')}</select>
                                </label>
                                <label class="challenge-archive-filter">
                                    <span>阶段</span>
                                    <select data-season-verification-filter="phaseKey"
                                        data-challenge-mode="weekly">${renderArchiveSelectOptions(seasonVerificationArchiveFilters?.phaseOptions || [], seasonVerificationArchiveFilters?.state?.phaseKey || 'all')}</select>
                                </label>
                                <label class="challenge-archive-filter">
                                    <span>去向</span>
                                    <select data-season-verification-filter="trajectoryKey"
                                        data-challenge-mode="weekly">${renderArchiveSelectOptions(seasonVerificationArchiveFilters?.trajectoryOptions || [], seasonVerificationArchiveFilters?.state?.trajectoryKey || 'all')}</select>
                                </label>
                                <label class="challenge-archive-filter">
                                    <span>角色</span>
                                    <select data-season-verification-filter="role"
                                        data-challenge-mode="weekly">${renderArchiveSelectOptions(seasonVerificationArchiveFilters?.roleOptions || [], seasonVerificationArchiveFilters?.state?.role || 'all')}</select>
                                </label>
                                <label class="challenge-archive-filter">
                                    <span>排序</span>
                                    <select data-season-verification-filter="sortBy"
                                        data-challenge-mode="weekly">${renderArchiveSelectOptions(seasonVerificationArchiveFilters?.sortOptions || [], seasonVerificationArchiveFilters?.state?.sortBy || 'recent')}</select>
                                </label>
                            </div>
                            <div class="challenge-record-tags challenge-archive-summary-tags">
                                <span class="challenge-tag">来源：${escapeHtml(seasonVerificationArchiveFilters?.sourceModeLabel || '全部来源')}</span>
                                <span class="challenge-tag">判定：${escapeHtml(seasonVerificationArchiveFilters?.resultStatusLabel || '全部判定')}</span>
                                <span class="challenge-tag">阶段：${escapeHtml(seasonVerificationArchiveFilters?.phaseLabel || '全部阶段')}</span>
                                <span class="challenge-tag">去向：${escapeHtml(seasonVerificationArchiveFilters?.trajectoryLabel || '全部去向')}</span>
                                <span class="challenge-tag">角色：${escapeHtml(seasonVerificationArchiveFilters?.roleLabel || '全部角色')}</span>
                                <span class="challenge-tag">排序：${escapeHtml(seasonVerificationArchiveFilters?.sortLabel || '最新归档')}</span>
                                <span class="challenge-tag">命中 ${clampInt(seasonVerificationArchiveFilters?.matchedCount, 0)} 条</span>
                                <span class="challenge-tag">通过 ${clampInt(seasonVerificationArchiveFilters?.verifiedCount, 0)}</span>
                                <span class="challenge-tag">失利 ${clampInt(seasonVerificationArchiveFilters?.failedCount, 0)}</span>
                                <span class="challenge-tag">延期 ${clampInt(seasonVerificationArchiveFilters?.deferredCount, 0)}</span>
                                <span class="challenge-tag">待验证 ${clampInt(seasonVerificationArchiveFilters?.pendingCount, 0)}</span>
                            </div>
                        </div>
                        ${verificationArchiveMarkup}
                    </section>
                ` : ''}
                <section class="challenge-record-section">
                    <div class="challenge-record-section-head">
                        <strong>观星留痕</strong>
                        <span>${escapeHtml(`${archiveFilters.matchedCount} 条命中`)}</span>
                    </div>
                    <div class="challenge-archive-toolbar">
                        <div class="challenge-archive-toolbar-head">
                            <p class="challenge-compare-note">把可回放命盘、回放失手与观星预兆压成长期样本层，可按窗口、样本层、结果与主题检索。</p>
                            <button type="button" class="collection-inline-btn secondary"
                                data-reset-archive-filters="true"
                                data-challenge-action="reset-archive-filters"
                                data-challenge-mode="${escapeHtml(bundle.mode)}"
                                ${archiveFilters.isDefault ? 'disabled' : ''}
                                >还原筛面</button>
                        </div>
                        <div class="challenge-archive-filter-grid">
                            <label class="challenge-archive-filter">
                                <span>窗口</span>
                                <select data-archive-filter="scope"
                                    data-challenge-mode="${escapeHtml(bundle.mode)}">${renderArchiveSelectOptions(archiveFilters.scopeOptions, archiveFilters.state.scope)}</select>
                            </label>
                            <label class="challenge-archive-filter">
                                <span>样本层</span>
                                <select data-archive-filter="track"
                                    data-challenge-mode="${escapeHtml(bundle.mode)}">${renderArchiveSelectOptions(archiveFilters.trackOptions, archiveFilters.state.track)}</select>
                            </label>
                            <label class="challenge-archive-filter">
                                <span>结果</span>
                                <select data-archive-filter="outcome"
                                    data-challenge-mode="${escapeHtml(bundle.mode)}">${renderArchiveSelectOptions(archiveFilters.outcomeOptions, archiveFilters.state.outcome)}</select>
                            </label>
                            <label class="challenge-archive-filter">
                                <span>主题</span>
                                <select data-archive-filter="theme"
                                    data-challenge-mode="${escapeHtml(bundle.mode)}">${renderArchiveSelectOptions(archiveFilters.themeOptions, archiveFilters.state.themeKey)}</select>
                            </label>
                            <label class="challenge-archive-filter">
                                <span>排序</span>
                                <select data-archive-filter="sort"
                                    data-challenge-mode="${escapeHtml(bundle.mode)}">${renderArchiveSelectOptions(archiveFilters.sortOptions, archiveFilters.state.sortBy)}</select>
                            </label>
                        </div>
                        <div class="challenge-record-tags challenge-archive-summary-tags">
                            <span class="challenge-tag">窗口：${escapeHtml(archiveFilters.scopeLabel)}</span>
                            <span class="challenge-tag">样本层：${escapeHtml(archiveFilters.trackLabel)}</span>
                            <span class="challenge-tag">结果：${escapeHtml(archiveFilters.outcomeLabel)}</span>
                            <span class="challenge-tag">主题：${escapeHtml(archiveFilters.themeLabel)}</span>
                            <span class="challenge-tag">排序：${escapeHtml(archiveFilters.sortLabel)}</span>
                            <span class="challenge-tag">命中 ${clampInt(archiveFilters.matchedCount, 0)} 条</span>
                            <span class="challenge-tag">精选 ${clampInt(archiveFilters.featuredCount, 0)} 条</span>
                        </div>
                        <div class="challenge-archive-preset-bar compendium-preset-bar">
                            <p class="collection-muted">训练预设会保存当前筛面与排序，方便快速切回常用训练视角。</p>
                            <div class="compendium-preset-slots challenge-archive-preset-slots">
                                ${archiveFilters.presetSlots.map(preset => `
                                    <div class="compendium-preset-slot challenge-archive-preset-slot">
                                        <button type="button" class="collection-inline-btn challenge-archive-preset-btn ${preset.active ? 'active secondary' : ''}"
                                            data-challenge-action="apply-archive-preset"
                                            data-archive-preset-slot="${preset.slot}"
                                            data-challenge-mode="${escapeHtml(bundle.mode)}"
                                            title="${escapeHtml(preset.label)}"
                                            >${escapeHtml(preset.label)}</button>
                                        <button type="button" class="collection-inline-btn secondary compact"
                                            data-challenge-action="save-archive-preset"
                                            data-save-archive-preset-slot="${preset.slot}"
                                            data-challenge-mode="${escapeHtml(bundle.mode)}"
                                            title="保存到${preset.slot + 1}号预设"
                                            >存</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                    ${archiveMarkup}
                </section>
                <section class="challenge-record-section">
                    <div class="challenge-record-section-head">
                        <strong>同主题对比</strong>
                        <span>${escapeHtml(`${comparison.themeLabel} · ${comparison.entries.length} 份样本`)}</span>
                    </div>
                    <p class="challenge-compare-note">${escapeHtml(comparison.compareHint)}</p>
                    ${comparisonMarkup}
                </section>
            `;
    }
    if (sideEl) {
      const nextReward = bundle.rewards.find(item => !item.claimed) || null;
      sideEl.innerHTML = `
                <section class="codex-side-card">
                    <span class="codex-side-kicker">难度同轴</span>
                    <h3>试炼压强 DRI ${dangerProfile.index}</h3>
                    <div class="codex-summary-grid two-cols">
                        ${dangerProfile.axes.map(axis => `
                            <div class="codex-summary-chip">
                                <strong>${clampInt(axis.value, 0)}</strong>
                                <span>${escapeHtml(axis.label)}</span>
                            </div>
                        `).join('')}
                    </div>
                    <p>${escapeHtml(`${dangerProfile.tierLabel} · ${dangerProfile.summary}`)}</p>
                    <p class="collection-muted">${escapeHtml(dangerProfile.reserveGuidance)}</p>
                </section>
                <section class="codex-side-card">
                    <span class="codex-side-kicker">观星总览</span>
                    <h3>${escapeHtml(bundle.meta.label)}进度</h3>
                    <div class="codex-summary-grid two-cols">
                        <div class="codex-summary-chip"><strong>${clampInt(bundle.progress.attempts, 0)}</strong><span>挑战次数</span></div>
                        <div class="codex-summary-chip"><strong>${clampInt(bundle.progress.completions, 0)}</strong><span>完成次数</span></div>
                        <div class="codex-summary-chip"><strong>${clampInt(bundle.progress.bestScore, 0)}</strong><span>最高得分</span></div>
                        <div class="codex-summary-chip"><strong>${bundle.mode === 'weekly' ? clampInt(bundle.progress.totalScore, 0) : clampInt(bundle.rewards.filter(item => item.claimed).length, 0)}</strong><span>${bundle.mode === 'weekly' ? '累计积分' : '已领奖励'}</span></div>
                    </div>
                    <p>${escapeHtml(bundle.rule.objective || '观星台正在推演这一轮的试炼目标。')}</p>
                    <p class="collection-muted">当前命盘签：${escapeHtml(bundle.seedSignature)}</p>
                </section>
                <section class="codex-side-card">
                    <span class="codex-side-kicker">下一目标</span>
                    <h3>${escapeHtml(nextReward ? nextReward.label : '当前轮换已清空奖励')}</h3>
                    <p>${escapeHtml(nextReward ? nextReward.rewardText : '本轮奖励已全部领取，可以继续冲更高分。')}</p>
                </section>
                <section class="codex-side-card">
                    <span class="codex-side-kicker">当前主练</span>
                    <h3>${escapeHtml(trainingFocus ? `${trainingFocus.chapterName || '最新章节'} · ${trainingFocus.themeLabel || '训练建议'}` : '尚未生成主练建议')}</h3>
                    <p data-observatory-training-focus="true">${escapeHtml(trainingFocus?.trainingAdvice || '完成一章裂界远征后，观星台会把训练建议沉淀到这里，方便下一轮先找对应样本。')}</p>
                    ${trainingFocus?.highlightLine ? `<p class="collection-muted">${escapeHtml(trainingFocus.highlightLine)}</p>` : ''}
                    ${trainingFocus?.routeFocusLine ? `<p class="collection-muted">${escapeHtml(trainingFocus.routeFocusLine)}</p>` : ''}
                    ${trainingFocus?.goalHighlights?.length ? `<div class="challenge-record-insight compact">
                            ${trainingFocus.goalHighlights.map(line => `<div class="challenge-record-insight-line">${escapeHtml(line)}</div>`).join('')}
                        </div>` : ''}
                    ${trainingFocus?.trainingTags?.length ? `<div class="challenge-record-tags">${trainingFocus.trainingTags.map(tag => `<span class="challenge-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
                    <button type="button" class="collection-inline-btn ${trainingFocusViewActive ? 'secondary' : ''}"
                        data-challenge-action="apply-training-focus"
                        data-apply-training-focus="true"
                        data-challenge-mode="${escapeHtml(bundle.mode)}"
                        ${!trainingFocus?.themeKey || trainingFocusViewActive ? 'disabled' : ''}
                        >${trainingFocusViewActive ? '当前训练视角' : '按建议筛留痕'}</button>
                </section>
                ${pvpLivePracticeReturn ? `<section class="codex-side-card" data-pvp-live-practice-return>
                    <span class="codex-side-kicker">真人 PVP 回流</span>
                    <h3>${escapeHtml(pvpLivePracticeReturn.completed ? '练习完成，回到 live 队列' : '练习中断，可回真人队列')}</h3>
                    <p>${escapeHtml(pvpLivePracticeReturn.summaryLine)}</p>
                    <p class="collection-muted">${escapeHtml(`来源战局：${pvpLivePracticeReturn.sourceMatchId} · 推荐谱：${pvpLivePracticeReturn.recommendedLoadoutLabel} · 正式积分不变`)}</p>
                    <button type="button" class="collection-inline-btn"
                        data-challenge-action="open-pvp-live-practice-return"
                        data-pvp-live-practice-return-action="true"
                        >${escapeHtml(pvpLivePracticeReturn.ctaLabel || '继续真人排位')}</button>
                </section>` : ''}
                <section class="codex-side-card">
                    <span class="codex-side-kicker">观星留痕</span>
                    <h3>回放档案</h3>
                    <div class="codex-summary-grid two-cols">
                        <div class="codex-summary-chip"><strong>${archiveSummary.totalRecords}</strong><span>总留痕</span></div>
                        <div class="codex-summary-chip"><strong>${archiveSummary.replayCount}</strong><span>命盘回放</span></div>
                        <div class="codex-summary-chip"><strong>${archiveSummary.replayableCount}</strong><span>可回放命盘</span></div>
                        <div class="codex-summary-chip"><strong>${archiveSummary.featuredCount}</strong><span>精选命盘</span></div>
                    </div>
                    <p>${escapeHtml(archiveSummary.latest?.title ? `最近归档：${archiveSummary.latest.title}。` : '完成任意观星挑战后，命盘签、成绩与复盘提示都会沉淀成命盘档案。')}</p>
                    <p class="collection-muted">${escapeHtml(`当前筛面：${archiveFilters.filterSummary} · 排序：${archiveFilters.sortLabel} · 命中 ${archiveFilters.matchedCount} 条 / 范围内共 ${archiveFilters.scopeTotalCount} 条。`)}</p>
                    ${renderChallengeInsightMarkup(archiveSummary.latest?.insight, {
        compact: true
      })}
                </section>
                <section class="codex-side-card">
                    <span class="codex-side-kicker">远征线索</span>
                    <h3>${escapeHtml(selectedGuide?.title || '尚未锁定精选命盘')}</h3>
                    <div class="codex-summary-grid two-cols">
                        <div class="codex-summary-chip"><strong>${escapeHtml(selectedGuide?.themeLabel || themeMeta.label)}</strong><span>样本主题</span></div>
                        <div class="codex-summary-chip"><strong>${escapeHtml(selectedGuide?.featuredTier || '待精选')}</strong><span>命盘评级</span></div>
                        <div class="codex-summary-chip"><strong>${escapeHtml(selectedGuide?.seedSignature || '待生成')}</strong><span>命盘签</span></div>
                        <div class="codex-summary-chip"><strong>${clampInt(selectedGuide?.score || 0)}</strong><span>参考得分</span></div>
                    </div>
                    <p>${escapeHtml(selectedGuide?.expeditionNote || '远征入口会读取这里选中的精选命盘，并生成小幅 bonus 选项。')}</p>
                    ${selectedGuide?.routeFocusLine ? `<p class="collection-muted">${escapeHtml(selectedGuide.routeFocusLine)}</p>` : ''}
                    ${selectedGuide?.compareHint ? `<p class="collection-muted">${escapeHtml(`对比抓手：${selectedGuide.compareHint}`)}</p>` : ''}
                    ${selectedGuide?.featuredTags?.length ? `<div class="challenge-record-tags">${selectedGuide.featuredTags.map(tag => `<span class="challenge-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
                    ${selectedGuide?.trainingTags?.length ? `<div class="challenge-record-tags">${selectedGuide.trainingTags.map(tag => `<span class="challenge-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
                    ${renderChallengeInsightMarkup(selectedGuide?.insight, {
        compact: true
      })}
                </section>
            `;
    }
    if (rankingEl) {
      rankingEl.innerHTML = bundle.mode === 'global' ? `
                    <section class="codex-side-card">
                        <span class="codex-side-kicker">众生榜</span>
                        <h3>本周统一排行</h3>
                        <div class="challenge-leaderboard">
                            ${bundle.leaderboard.map(item => `
                                <div class="challenge-rank-row ${item.highlight ? 'highlight' : ''}">
                                    <span>#${item.rank}</span>
                                    <strong>${escapeHtml(item.name)}</strong>
                                    <span>${clampInt(item.score, 0)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </section>
                ` : `
                    <section class="codex-side-card">
                        <span class="codex-side-kicker">冲分建议</span>
                        <h3>怎样把分打高</h3>
                        <p>优先保证章节推进，再补法则与法宝发现。血量越健康，结算奖励越容易再抬一档。</p>
                    </section>
                `;
    }
    if (launchEl) {
      launchEl.innerHTML = `
                <button type="button" class="menu-btn primary challenge-launch-btn"
                    data-challenge-action="begin-challenge"
                    data-challenge-mode="${escapeHtml(bundle.mode)}">${isCurrentRun ? '继续当前挑战' : `开启${escapeHtml(bundle.meta.label)}`}</button>
                <p class="collection-muted">${escapeHtml(isCurrentRun ? '当前轮换已在进行中，继续推进地图即可累计分数。' : '将固定角色、命格、灵契与章节目标，并直接开始新的挑战轮回。')}</p>
            `;
    }
    this.bindChallengeHubDelegates({
      rewardsEl,
      recordsEl,
      sideEl,
      launchEl
    });
    this.renderMainMenuChallengeSummary();
    this.renderChallengeRunBanner();
  };
  challengeHubMethods.getCharacterDisplayName = function (characterId = '') {
    if (typeof CHARACTERS !== 'undefined' && CHARACTERS && CHARACTERS[characterId]) {
      return CHARACTERS[characterId].name || characterId;
    }
    return characterId || '未知角色';
  };
  challengeHubMethods.getChallengeMetaName = function (type = 'destiny', itemId = '') {
    if (!itemId) return '未指定';
    if (type === 'destiny' && typeof this.getRunDestinyMetaById === 'function') {
      return this.getRunDestinyMetaById(itemId, 1)?.name || itemId;
    }
    if (type === 'spirit' && typeof this.getSpiritCompanionMetaById === 'function') {
      return this.getSpiritCompanionMetaById(itemId, 1)?.name || itemId;
    }
    if (type === 'vow' && typeof this.getRunVowMetaById === 'function') {
      return this.getRunVowMetaById(itemId, 1)?.name || itemId;
    }
    return itemId;
  };
  challengeHubMethods.renderMainMenuChallengeSummary = function () {
    if (typeof document === 'undefined') return;
    this.ensureChallengeHubBootState();
    const dailyEl = document.getElementById('menu-daily-omen-card');
    const weeklyEl = document.getElementById('menu-weekly-ordeal-card');
    const unlockEl = document.getElementById('menu-unlock-focus-card');
    if (!dailyEl || !weeklyEl || !unlockEl) return;
    const daily = this.buildChallengeBundle('daily');
    const weekly = this.buildChallengeBundle('weekly');
    const nextWeeklyReward = weekly.rewards.find(item => !item.claimed);
    const latestUnlock = typeof this.getCollectionUnlockHistory === 'function' ? this.getCollectionUnlockHistory(1)[0] || null : null;
    dailyEl.innerHTML = `
            <span class="menu-oracle-kicker">今日天机</span>
            <h4>${escapeHtml(daily.rule?.name || '未解出')}</h4>
            <p>${escapeHtml(daily.rule?.objective || '观星台正在推演今日轮换。')}</p>
            <div class="menu-oracle-meta">
                <span>${escapeHtml(daily.rule?.targetChapter || '未知章节')}</span>
                <strong>${clampInt(daily.progress.completions, 0)} 次完成</strong>
            </div>
            <button type="button" class="collection-inline-btn" data-challenge-menu-action="show-challenge-hub" data-challenge-mode="daily">查看今日天机</button>
        `;
    weeklyEl.innerHTML = `
            <span class="menu-oracle-kicker">七日劫数</span>
            <h4>${escapeHtml(weekly.rule?.name || '未解出')}</h4>
            <p>${escapeHtml(nextWeeklyReward ? `下一奖励：${nextWeeklyReward.label}` : '本周奖励已清空，可继续冲更高分。')}</p>
            <div class="menu-oracle-meta">
                <span>${escapeHtml(weekly.rotationLabel)}</span>
                <strong>${clampInt(weekly.progress.totalScore, 0)} 分</strong>
            </div>
            <button type="button" class="collection-inline-btn" data-challenge-menu-action="show-challenge-hub" data-challenge-mode="weekly">查看周积分</button>
        `;
    unlockEl.innerHTML = latestUnlock ? `
                <span class="menu-oracle-kicker">最近解锁</span>
                <h4>${escapeHtml(latestUnlock.name || '藏经阁更新')}</h4>
                <p>${escapeHtml(latestUnlock.note || '藏经阁有新的研究记录。')}</p>
                <div class="menu-oracle-meta">
                    <span>${escapeHtml(this.formatCollectionTimestamp ? this.formatCollectionTimestamp(latestUnlock.timestamp) : '最近')}</span>
                    <strong>洞府可复盘</strong>
                </div>
                <button type="button" class="collection-inline-btn" data-challenge-menu-action="show-collection" data-collection-section="sanctum">查看洞府</button>
            ` : `
                <span class="menu-oracle-kicker">最近解锁</span>
                <h4>洞府新线索</h4>
                <p>去打一局、补一条法则或灵契研究，主菜单会在这里持续更新。</p>
                <div class="menu-oracle-meta">
                    <span>藏经阁</span>
                    <strong>等待入档</strong>
                </div>
                <button type="button" class="collection-inline-btn" data-challenge-menu-action="show-collection" data-collection-section="sanctum">打开洞府</button>
            `;
    this.bindChallengeMenuDelegates({
      dailyEl,
      weeklyEl,
      unlockEl
    });
  };
  challengeHubMethods.bindChallengeHubDelegates = function ({
    rewardsEl = null,
    recordsEl = null,
    sideEl = null,
    launchEl = null
  } = {}) {
    const bindRootClick = (root, handler, flag) => {
      if (!root || root[flag]) return;
      root.addEventListener('click', event => {
        const target = event.target;
        if (!target || typeof target.closest !== 'function') return;
        const button = target.closest('button');
        if (!button || button.disabled || !root.contains(button)) return;
        handler(button);
      });
      root[flag] = true;
    };
    const bindRootChange = (root, handler, flag) => {
      if (!root || root[flag]) return;
      root.addEventListener('change', event => {
        const target = event.target;
        if (!target || !root.contains(target)) return;
        handler(target);
      });
      root[flag] = true;
    };
    bindRootClick(rewardsEl, button => {
      if (button.dataset.challengeAction !== 'claim-milestone') return;
      const mode = String(button.dataset.challengeMode || '');
      const rewardId = String(button.dataset.rewardId || '');
      if (mode && rewardId) {
        this.claimChallengeMilestone(mode, rewardId);
      }
    }, '__challengeRewardDelegatesBound');
    bindRootClick(recordsEl, button => {
      const action = String(button.dataset.challengeAction || '');
      if (action === 'begin-replay') {
        const recordId = String(button.dataset.recordId || button.dataset.replayRecordId || '');
        if (recordId) {
          this.beginObservatoryReplay(recordId);
        }
        return;
      }
      if (action === 'select-guide') {
        const recordId = String(button.dataset.recordId || button.dataset.guideRecordId || '');
        if (recordId) {
          this.selectObservatoryExpeditionGuide(recordId);
        }
        return;
      }
      if (action === 'follow-season-verification-record') {
        const recordId = String(button.dataset.recordId || button.closest('[data-season-verification-record-id]')?.dataset.seasonVerificationRecordId || '');
        if (recordId) {
          this.followSeasonVerificationRecord(recordId);
        }
        return;
      }
      if (action === 'reset-season-verification-filters') {
        this.resetSeasonVerificationArchiveFilters(String(button.dataset.challengeMode || 'weekly'));
        return;
      }
      if (action === 'reset-archive-filters') {
        const mode = String(button.dataset.challengeMode || '');
        if (mode) {
          this.resetChallengeArchiveFilters(mode);
        }
        return;
      }
      if (action === 'apply-archive-preset') {
        const slot = Number(button.dataset.archivePresetSlot);
        const mode = String(button.dataset.challengeMode || '');
        if (Number.isFinite(slot) && mode) {
          this.applyChallengeArchivePreset(slot, mode);
        }
        return;
      }
      if (action === 'save-archive-preset') {
        const slot = Number(button.dataset.saveArchivePresetSlot);
        const mode = String(button.dataset.challengeMode || '');
        if (Number.isFinite(slot) && mode) {
          this.saveChallengeArchivePreset(slot, mode);
        }
      }
    }, '__challengeRecordClickDelegatesBound');
    bindRootChange(recordsEl, target => {
      if (target instanceof HTMLSelectElement) {
        const verificationKey = String(target.dataset.seasonVerificationFilter || '');
        if (verificationKey) {
          this.setSeasonVerificationArchiveFilter(verificationKey, target.value, String(target.dataset.challengeMode || 'weekly'));
          return;
        }
        const archiveKey = String(target.dataset.archiveFilter || '');
        if (archiveKey) {
          const normalizedKey = archiveKey === 'theme' ? 'themeKey' : archiveKey === 'sort' ? 'sortBy' : archiveKey;
          this.setChallengeArchiveFilter(normalizedKey, target.value, String(target.dataset.challengeMode || this.challengeHubState?.tab || 'daily'));
        }
      }
    }, '__challengeRecordChangeDelegatesBound');
    bindRootClick(sideEl, button => {
      const action = String(button.dataset.challengeAction || '');
      if (action === 'apply-training-focus') {
        const mode = String(button.dataset.challengeMode || '');
        if (mode) {
          this.applyObservatoryTrainingFocus(mode);
        }
        return;
      }
      if (action === 'open-pvp-live-practice-return') {
        this.openPvpLivePracticeReturn();
      }
    }, '__challengeSideDelegatesBound');
    bindRootClick(launchEl, button => {
      if (button.dataset.challengeAction !== 'begin-challenge') return;
      const mode = String(button.dataset.challengeMode || '');
      if (mode) {
        this.beginChallengeStart(mode);
      }
    }, '__challengeLaunchDelegatesBound');
  };
  challengeHubMethods.bindChallengeMenuDelegates = function ({
    dailyEl = null,
    weeklyEl = null,
    unlockEl = null
  } = {}) {
    const bindMenuRoot = root => {
      if (!root || root.__challengeMenuDelegatesBound) return;
      root.addEventListener('click', event => {
        const target = event.target;
        if (!target || typeof target.closest !== 'function') return;
        const button = target.closest('button[data-challenge-menu-action]');
        if (!button || button.disabled || !root.contains(button)) return;
        const action = String(button.dataset.challengeMenuAction || '');
        if (action === 'show-challenge-hub') {
          const mode = String(button.dataset.challengeMode || 'daily');
          this.showChallengeHub(mode);
          return;
        }
        if (action === 'show-collection') {
          const section = String(button.dataset.collectionSection || '');
          if (section) {
            this.showCollection(section);
          }
        }
      });
      root.__challengeMenuDelegatesBound = true;
    };
    bindMenuRoot(dailyEl);
    bindMenuRoot(weeklyEl);
    bindMenuRoot(unlockEl);
  };
  challengeHubMethods.beginChallengeStart = function (mode = 'daily') {
    this.ensureChallengeHubBootState();
    const bundle = this.buildChallengeBundle(mode);
    if (!bundle || !bundle.rule) return false;
    if (this.activeChallengeRun && !this.activeChallengeRun.resolved && this.activeChallengeRun.mode === bundle.mode && this.activeChallengeRun.rotationKey === bundle.rotationKey) {
      this.showScreen('map-screen');
      return true;
    }
    this.pendingChallengeStart = {
      mode: bundle.mode,
      rotationKey: bundle.rotationKey,
      rule: clone(bundle.rule),
      modeLabel: bundle.meta.label,
      bundleSnapshot: clone(bundle),
      replayOnly: false,
      seedSignature: bundle.seedSignature || '',
      archiveInsight: bundle.archiveInsight && hasChallengeArchiveInsight(bundle.archiveInsight) ? normalizeChallengeArchiveInsight(bundle.archiveInsight) : null
    };
    if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(`观星台已锁定【${bundle.rule.name}】。接下来会以固定命盘开启新一轮挑战。`, {
        category: 'system',
        duration: 2600
      });
    }
    if (typeof this.openSaveSlotsWithSync === 'function') {
      this.openSaveSlotsWithSync();
    } else if (typeof this.showCharacterSelection === 'function') {
      this.showCharacterSelection();
    }
    return true;
  };
  challengeHubMethods.beginObservatoryReplay = function (recordId = '') {
    this.ensureChallengeHubBootState();
    const bundle = this.buildReplayBundleFromArchiveEntry(recordId);
    if (!bundle || !bundle.rule) return false;
    if (this.activeChallengeRun && !this.activeChallengeRun.resolved && this.activeChallengeRun.replayOnly && this.activeChallengeRun.archiveEntryId === bundle.archiveEntryId) {
      this.showScreen('map-screen');
      return true;
    }
    this.pendingChallengeStart = {
      mode: bundle.mode,
      rotationKey: bundle.rotationKey,
      rule: clone(bundle.rule),
      modeLabel: bundle.meta.label,
      bundleSnapshot: clone(bundle),
      replayOnly: true,
      seedSignature: bundle.seedSignature || '',
      archiveEntryId: bundle.archiveEntryId || '',
      archiveInsight: bundle.archiveInsight && hasChallengeArchiveInsight(bundle.archiveInsight) ? normalizeChallengeArchiveInsight(bundle.archiveInsight) : null
    };
    if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(`观星台开始回放【${bundle.rule.name}】。本轮只记录留痕，不计入当前轮换奖励。`, {
        category: 'system',
        duration: 2800
      });
    }
    if (typeof this.openSaveSlotsWithSync === 'function') {
      this.openSaveSlotsWithSync();
    } else if (typeof this.showCharacterSelection === 'function') {
      this.showCharacterSelection();
    }
    return true;
  };
  challengeHubMethods.clearPendingChallengeStart = function () {
    this.pendingChallengeStart = null;
  };
  challengeHubMethods.normalizeActiveChallengeRun = function (rawRun = null) {
    const source = rawRun && typeof rawRun === 'object' ? rawRun : null;
    if (!source || !source.ruleId || !source.mode || !source.rotationKey) return null;
    const runId = typeof this.normalizeProgressionSafeId === 'function' ? this.normalizeProgressionSafeId(source.runId) : String(source.runId || '').trim();
    const ownerUserId = Object.prototype.hasOwnProperty.call(source, 'ownerUserId')
      ? String(source.ownerUserId || '').trim()
      : typeof this.getCurrentProgressionUserId === 'function'
        ? this.getCurrentProgressionUserId()
        : '';
    const saveSlot = Number.isInteger(source.saveSlot) ? source.saveSlot : Number.isInteger(this.currentSaveSlot) ? this.currentSaveSlot : null;
    return {
      mode: ['daily', 'weekly', 'global'].includes(source.mode) ? source.mode : 'daily',
      modeLabel: String(source.modeLabel || HUB_META[source.mode]?.label || HUB_META.daily.label),
      rotationKey: String(source.rotationKey || ''),
      rotationLabel: String(source.rotationLabel || formatDateLabel(source.mode, source.rotationKey)),
      ruleId: String(source.ruleId || ''),
      ruleName: String(source.ruleName || ''),
      icon: String(source.icon || '✦'),
      intro: String(source.intro || ''),
      objective: String(source.objective || ''),
      goalRealm: clampInt(source.goalRealm, 1, 18),
      targetChapter: String(source.targetChapter || ''),
      characterId: String(source.characterId || ''),
      runDestinyId: String(source.runDestinyId || ''),
      spiritCompanionId: String(source.spiritCompanionId || ''),
      vowIds: Array.isArray(source.vowIds) ? source.vowIds.map(id => String(id || '')).filter(Boolean).slice(0, 2) : [],
      tags: Array.isArray(source.tags) ? source.tags.map(item => String(item || '')).filter(Boolean).slice(0, 6) : [],
      battleModifiers: source.battleModifiers && typeof source.battleModifiers === 'object' ? clone(source.battleModifiers) : {},
      scoreWeights: source.scoreWeights && typeof source.scoreWeights === 'object' ? {
        ...this.getChallengeScoreDefaults(),
        ...clone(source.scoreWeights)
      } : this.getChallengeScoreDefaults(),
      runId: runId || (typeof this.createProgressionSafeId === 'function' ? this.createProgressionSafeId('challenge-run') : `challenge-run-${Date.now()}`),
      ownerUserId,
      saveSlot,
      startedAt: clampInt(source.startedAt, 0),
      resolved: !!source.resolved,
      completed: !!source.completed,
      finalScore: clampInt(source.finalScore, 0),
      seedSignature: String(source.seedSignature || ''),
      replayOnly: !!source.replayOnly,
      practiceOnly: !!source.practiceOnly,
      archiveEntryId: String(source.archiveEntryId || ''),
      pvpLiveDrillSource: normalizePvpLiveDrillSource(source.pvpLiveDrillSource),
      archiveInsight: source.archiveInsight && hasChallengeArchiveInsight(source.archiveInsight) ? normalizeChallengeArchiveInsight(source.archiveInsight) : null,
      progress: {
        battleWins: clampInt(source.progress?.battleWins, 0),
        eliteWins: clampInt(source.progress?.eliteWins, 0),
        bossWins: clampInt(source.progress?.bossWins, 0),
        realmClears: clampInt(source.progress?.realmClears, 0),
        startLawCount: clampInt(source.progress?.startLawCount, 0),
        startTreasureCount: clampInt(source.progress?.startTreasureCount, 0),
        currentScore: clampInt(source.progress?.currentScore, 0)
      }
    };
  };
  challengeHubMethods.createActiveChallengeRun = function (bundle) {
    const defaults = this.getChallengeScoreDefaults();
    return this.normalizeActiveChallengeRun({
      mode: bundle.mode,
      modeLabel: bundle.meta.label,
      rotationKey: bundle.rotationKey,
      rotationLabel: bundle.rotationLabel,
      ruleId: bundle.rule.id,
      ruleName: bundle.rule.name,
      icon: bundle.rule.icon || '✦',
      intro: bundle.rule.intro || '',
      objective: bundle.rule.objective || '',
      goalRealm: bundle.rule.goalRealm || 3,
      targetChapter: bundle.rule.targetChapter || '',
      characterId: bundle.rule.characterId || '',
      runDestinyId: bundle.rule.runDestinyId || '',
      spiritCompanionId: bundle.rule.spiritCompanionId || '',
      vowIds: Array.isArray(bundle.rule.vowIds) ? bundle.rule.vowIds.slice(0, 2) : [],
      tags: Array.isArray(bundle.rule.tags) ? bundle.rule.tags.slice(0, 6) : [],
      battleModifiers: bundle.rule.battleModifiers || {},
      scoreWeights: {
        ...defaults,
        ...(bundle.rule.scoreWeights || {})
      },
      runId: typeof this.createProgressionSafeId === 'function' ? this.createProgressionSafeId('challenge-run') : `challenge-run-${Date.now()}`,
      ownerUserId: typeof this.getCurrentProgressionUserId === 'function' ? this.getCurrentProgressionUserId() : '',
      saveSlot: Number.isInteger(this.currentSaveSlot) ? this.currentSaveSlot : null,
      startedAt: Date.now(),
      seedSignature: String(bundle.seedSignature || this.buildChallengeSeedSignature(bundle.mode, bundle.rotationKey, bundle.rule)),
      replayOnly: !!bundle.replayOnly,
      practiceOnly: !!bundle.practiceOnly,
      archiveEntryId: String(bundle.archiveEntryId || ''),
      pvpLiveDrillSource: normalizePvpLiveDrillSource(bundle.pvpLiveDrillSource),
      archiveInsight: bundle.archiveInsight && hasChallengeArchiveInsight(bundle.archiveInsight) ? normalizeChallengeArchiveInsight(bundle.archiveInsight) : null,
      progress: {
        battleWins: 0,
        eliteWins: 0,
        bossWins: 0,
        realmClears: 0,
        startLawCount: Array.isArray(this.player?.collectedLaws) ? this.player.collectedLaws.length : 0,
        startTreasureCount: Array.isArray(this.player?.collectedTreasures) ? this.player.collectedTreasures.length : 0,
        currentScore: 0
      }
    });
  };
  challengeHubMethods.persistActiveChallengeRun = function () {
    try {
      if (typeof localStorage === 'undefined') return;
      if (!this.activeChallengeRun) {
        localStorage.removeItem(ACTIVE_CHALLENGE_RUN_KEY);
        return;
      }
      localStorage.setItem(ACTIVE_CHALLENGE_RUN_KEY, JSON.stringify({
        currentSaveSlot: this.currentSaveSlot,
        activeRun: this.activeChallengeRun
      }));
    } catch (error) {
      console.warn('Persist active challenge run failed:', error);
    }
  };
  challengeHubMethods.restoreActiveChallengeRun = function () {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(ACTIVE_CHALLENGE_RUN_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const savedSlot = parsed && parsed.currentSaveSlot !== undefined ? parsed.currentSaveSlot : null;
      if (savedSlot !== null && this.currentSaveSlot !== null && this.currentSaveSlot !== undefined && clampInt(savedSlot, -1) !== clampInt(this.currentSaveSlot, -2)) {
        return null;
      }
      const rawRun = parsed ? parsed.activeRun : null;
      const storedOwnerUserId = rawRun && Object.prototype.hasOwnProperty.call(rawRun, 'ownerUserId')
        ? String(rawRun.ownerUserId || '').trim()
        : '';
      const ownerCompatible = typeof this.isProgressionOwnerCompatible === 'function'
        ? this.isProgressionOwnerCompatible(storedOwnerUserId)
        : typeof this.getCurrentProgressionUserId !== 'function'
          || !this.getCurrentProgressionUserId()
          || storedOwnerUserId === this.getCurrentProgressionUserId();
      if (!ownerCompatible) return null;
      return this.normalizeActiveChallengeRun(rawRun);
    } catch (error) {
      return null;
    }
  };
  challengeHubMethods.clearActiveChallengeRun = function () {
    this.activeChallengeRun = null;
    this.persistActiveChallengeRun();
    this.renderChallengeRunBanner();
  };
  challengeHubMethods.computeActiveChallengeScore = function (run = null) {
    const source = run || this.activeChallengeRun;
    if (!source) return 0;
    const weights = source.scoreWeights || this.getChallengeScoreDefaults();
    const currentLawCount = Array.isArray(this.player?.collectedLaws) ? this.player.collectedLaws.length : 0;
    const currentTreasureCount = Array.isArray(this.player?.collectedTreasures) ? this.player.collectedTreasures.length : 0;
    const lawGains = Math.max(0, currentLawCount - clampInt(source.progress?.startLawCount, 0));
    const treasureGains = Math.max(0, currentTreasureCount - clampInt(source.progress?.startTreasureCount, 0));
    const hpRatio = this.player && this.player.maxHp > 0 ? Math.max(0, Math.min(1, safeNumber(this.player.currentHp, 0) / safeNumber(this.player.maxHp, 1))) : 0;
    return clampInt(clampInt(source.progress?.battleWins, 0) * clampInt(weights.battleWin, 0) + clampInt(source.progress?.eliteWins, 0) * clampInt(weights.eliteWin, 0) + clampInt(source.progress?.bossWins, 0) * clampInt(weights.bossWin, 0) + clampInt(source.progress?.realmClears, 0) * clampInt(weights.realmClear, 0) + lawGains * clampInt(weights.lawDiscover, 0) + treasureGains * clampInt(weights.treasureDiscover, 0) + Math.floor(hpRatio * clampInt(weights.hpBonus, 0)) + (source.completed ? clampInt(weights.completeBonus, 0) : 0), 0);
  };
  challengeHubMethods.refreshActiveChallengeScore = function (shouldRender = true) {
    if (!this.activeChallengeRun) return 0;
    this.activeChallengeRun.progress.currentScore = this.computeActiveChallengeScore(this.activeChallengeRun);
    this.persistActiveChallengeRun();
    if (shouldRender) this.renderChallengeRunBanner();
    return this.activeChallengeRun.progress.currentScore;
  };
  challengeHubMethods.buildChallengeArchiveProfile = function (run, options = {}) {
    const sourceRun = run && typeof run === 'object' ? run : {};
    const rule = normalizeChallengeRuleSnapshot({
      id: sourceRun.ruleId,
      name: sourceRun.ruleName,
      icon: sourceRun.icon,
      intro: sourceRun.intro,
      objective: sourceRun.objective,
      targetChapter: sourceRun.targetChapter,
      goalRealm: sourceRun.goalRealm,
      characterId: sourceRun.characterId,
      runDestinyId: sourceRun.runDestinyId,
      spiritCompanionId: sourceRun.spiritCompanionId,
      vowIds: sourceRun.vowIds,
      tags: sourceRun.tags,
      scoreWeights: sourceRun.scoreWeights,
      battleModifiers: sourceRun.battleModifiers
    });
    const currentLawCount = Array.isArray(this.player?.collectedLaws) ? this.player.collectedLaws.length : 0;
    const currentTreasureCount = Array.isArray(this.player?.collectedTreasures) ? this.player.collectedTreasures.length : 0;
    const metrics = normalizeChallengeMetricSnapshot({
      hpRatio: this.player && this.player.maxHp > 0 ? Math.max(0, Math.min(1, safeNumber(this.player.currentHp, 0) / safeNumber(this.player.maxHp, 1))) : 0,
      lawGains: Math.max(0, currentLawCount - clampInt(sourceRun.progress?.startLawCount, 0)),
      treasureGains: Math.max(0, currentTreasureCount - clampInt(sourceRun.progress?.startTreasureCount, 0)),
      battleWins: clampInt(sourceRun.progress?.battleWins, 0),
      eliteWins: clampInt(sourceRun.progress?.eliteWins, 0),
      bossWins: clampInt(sourceRun.progress?.bossWins, 0),
      realmClears: clampInt(sourceRun.progress?.realmClears, 0)
    });
    const themeMeta = resolveChallengeThemeMeta(rule, sourceRun.mode);
    const preferredNodes = themeMeta.preferredNodes.slice(0, 4);
    const insight = normalizeChallengeArchiveInsight(buildChallengeArchiveInsight({
      rule,
      mode: sourceRun.mode,
      replayOnly: !!sourceRun.replayOnly,
      completed: !!options.completed,
      metrics,
      preferredNodes,
      reason: String(options.reason || '')
    }, themeMeta));
    return {
      rule,
      metrics,
      themeKey: themeMeta.key,
      themeLabel: themeMeta.label,
      featuredTier: buildChallengeFeaturedTier(sourceRun, metrics, options),
      featuredTags: buildChallengeFeaturedTags(rule, sourceRun, metrics, themeMeta, options),
      preferredNodes,
      metricLine: formatChallengeMetricLine(metrics),
      insight: hasChallengeArchiveInsight(insight) ? insight : null,
      compareHint: themeMeta.compareHint,
      expeditionNote: themeMeta.expeditionNote
    };
  };
  challengeHubMethods.recordChallengeCompletion = function (run, options = {}) {
    const entry = this.getChallengeProgressEntry(run.mode, run.rotationKey, true);
    const profile = options.featuredProfile || this.buildChallengeArchiveProfile(run, options);
    entry.attempts += 1;
    entry.completions += options.completed ? 1 : 0;
    entry.bestScore = Math.max(clampInt(entry.bestScore, 0), clampInt(run.finalScore, 0));
    if (run.mode === 'weekly') {
      entry.totalScore = clampInt(entry.totalScore, 0) + clampInt(run.finalScore, 0);
    }
    const record = {
      score: clampInt(run.finalScore, 0),
      completed: !!options.completed,
      at: Date.now(),
      ruleId: run.ruleId,
      ruleName: run.ruleName,
      reason: String(options.reason || ''),
      modeLabel: run.modeLabel,
      icon: run.icon,
      themeLabel: profile.themeLabel || '',
      featuredTier: profile.featuredTier || '',
      featuredTags: normalizeTagList(profile.featuredTags, 4)
    };
    entry.records = [record, ...(Array.isArray(entry.records) ? entry.records : [])].slice(0, 8);
    entry.lastResult = {
      score: clampInt(run.finalScore, 0),
      completed: !!options.completed,
      at: record.at,
      ruleId: run.ruleId,
      ruleName: run.ruleName,
      reason: String(options.reason || ''),
      themeLabel: profile.themeLabel || '',
      featuredTier: profile.featuredTier || ''
    };
    this.challengeProgressState.recentResults = [{
      mode: run.mode,
      score: clampInt(run.finalScore, 0),
      completed: !!options.completed,
      at: record.at,
      ruleName: run.ruleName,
      icon: run.icon,
      reason: String(options.reason || ''),
      themeLabel: profile.themeLabel || '',
      featuredTier: profile.featuredTier || '',
      featuredTags: normalizeTagList(profile.featuredTags, 4)
    }, ...(Array.isArray(this.challengeProgressState.recentResults) ? this.challengeProgressState.recentResults : [])].slice(0, 12);
    this.saveChallengeProgressState();
  };
  challengeHubMethods.recordChallengeArchiveResult = function (run, options = {}) {
    if (!run) return null;
    if (run.practiceOnly) return null;
    const profile = options.featuredProfile || this.buildChallengeArchiveProfile(run, options);
    const rule = profile.rule;
    const statusLabel = options.completed ? '完成' : '中断';
    const replayNote = run.replayOnly ? ' · 回放不计奖励' : '';
    const tagNote = profile.featuredTags.length > 0 ? ` · ${profile.featuredTags.join(' / ')}` : '';
    const note = `${statusLabel} · 得分 ${clampInt(run.finalScore, 0)}${replayNote}${tagNote}`;
    const entry = this.recordObservatoryArchiveEntry({
      id: `${run.replayOnly ? 'replay' : 'challenge'}:${run.mode}:${run.rotationKey}:${run.ruleId}:${clampInt(run.finalScore, 0)}:${hashString(JSON.stringify(run.progress || {}))}:${Date.now()}`,
      type: run.replayOnly ? 'replay' : 'challenge',
      mode: run.mode,
      modeLabel: run.replayOnly ? '观星回放' : run.modeLabel,
      rotationKey: run.rotationKey,
      rotationLabel: run.rotationLabel || formatDateLabel(run.mode, run.rotationKey),
      seedSignature: run.seedSignature || this.buildChallengeSeedSignature(run.mode, run.rotationKey, rule),
      title: run.ruleName,
      note,
      icon: run.icon || '🔭',
      score: run.finalScore,
      completed: !!options.completed,
      at: Date.now(),
      reason: String(options.reason || ''),
      replayOnly: !!run.replayOnly,
      archiveEntryId: run.archiveEntryId || '',
      originLabel: run.replayOnly ? '观星回放' : '观星留痕',
      themeKey: profile.themeKey,
      themeLabel: profile.themeLabel,
      featuredTier: profile.featuredTier,
      featuredTags: profile.featuredTags,
      metrics: profile.metrics,
      preferredNodes: profile.preferredNodes,
      insight: profile.insight,
      rule
    });
    if (typeof this.recordCollectionUnlock === 'function') {
      this.recordCollectionUnlock('observatory', {
        id: entry?.id || `${run.mode}:${run.rotationKey}:${run.ruleId}`,
        name: `${run.replayOnly ? '命盘回放' : '观星留痕'}·${run.ruleName}`,
        icon: run.icon || '🔭',
        note
      });
    }
    return entry;
  };
  challengeHubMethods.setPvpLivePracticeReturnReceipt = function (run = null, options = {}) {
    const source = normalizePvpLiveDrillSource(run?.pvpLiveDrillSource);
    const fallbackMatchId = String(run?.archiveEntryId || '').replace(/^pvp_live:/, '').trim();
    const sourceMatchId = source?.sourceMatchId || fallbackMatchId;
    if (!run?.practiceOnly || !sourceMatchId || !String(run?.archiveEntryId || '').startsWith('pvp_live:')) return null;
    this.ensureChallengeHubBootState();
    const receipt = normalizePvpLivePracticeReturnReceipt({
      ...(source || {}),
      sourceMatchId,
      sourceRunId: source?.sourceRunId || `pvp_live:${sourceMatchId}`,
      completed: !!options.completed,
      reason: String(options.reason || ''),
      updatedAt: Date.now()
    });
    if (!receipt) return null;
    this.challengeHubState.pvpLivePracticeReturn = receipt;
    this.persistChallengeHubState();
    return receipt;
  };
  challengeHubMethods.getPvpLivePracticeReturnReceipt = function () {
    this.ensureChallengeHubBootState();
    const receipt = normalizePvpLivePracticeReturnReceipt(this.challengeHubState?.pvpLivePracticeReturn);
    if (!receipt) return null;
    this.challengeHubState.pvpLivePracticeReturn = receipt;
    return receipt;
  };
  challengeHubMethods.openPvpLivePracticeReturn = function () {
    const receipt = this.getPvpLivePracticeReturnReceipt();
    if (!receipt) return false;
    if (typeof this.showScreen === 'function') {
      this.showScreen('pvp-screen');
    }
    const scene = typeof PVPScene !== 'undefined' && PVPScene ? PVPScene : typeof window !== 'undefined' && window.PVPScene ? window.PVPScene : null;
    if (scene && typeof scene.switchTab === 'function') {
      scene.switchTab('live', { skipLoad: true });
    }
    if (scene) {
      const loadoutId = String(receipt.recommendedLoadoutId || '').trim();
      if (loadoutId && typeof scene.setLiveLoadoutPreset === 'function') {
        scene.setLiveLoadoutPreset(loadoutId);
      } else if (loadoutId) {
        scene.liveSelectedLoadoutPreset = loadoutId;
      }
      const label = String(receipt.recommendedLoadoutLabel || '推荐斗法谱').trim();
      scene.liveInlineHint = `已带着${label}回到真人排位候选；不会自动入队，请手动点击继续真人排位。`;
      if (typeof scene.renderLiveLoadoutPresets === 'function') {
        scene.renderLiveLoadoutPresets('idle');
      }
      if (typeof scene.renderLivePanel === 'function') {
        scene.renderLivePanel();
      }
    }
    if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(`${receipt.summaryLine} 本次训练不写正式积分；回排不会自动入队。`);
    }
    return true;
  };
  challengeHubMethods.finalizeActiveChallengeRun = function (options = {}) {
    if (!this.activeChallengeRun) return null;
    const run = this.activeChallengeRun;
    run.completed = !!options.completed;
    run.resolved = true;
    run.finalScore = this.computeActiveChallengeScore(run);
    run.progress.currentScore = run.finalScore;
    const featuredProfile = this.buildChallengeArchiveProfile(run, options);
    if (!run.replayOnly && !run.practiceOnly) {
      this.recordChallengeCompletion(run, {
        ...options,
        featuredProfile
      });
    }
    if (!run.practiceOnly) {
      this.recordChallengeArchiveResult(run, {
        ...options,
        featuredProfile
      });
    }
    if (!run.replayOnly && !run.practiceOnly && options.completed && run.mode === 'weekly' && typeof this.recordSeasonVerificationResult === 'function') {
      this.recordSeasonVerificationResult({
        recordId: `season_verification_${String(run.rotationKey || 'current').trim()}_side_challenge`,
        weekTag: String(run.rotationKey || '').trim(),
        weekLabel: String(run.rotationLabel || '').trim(),
        role: 'side',
        sourceMode: 'challenge',
        sourceModeLabel: '七日劫数',
        sourceLabel: String(run.ruleName || run.modeLabel || '七日劫数').trim(),
        label: '七日劫数旁证',
        resultStatus: 'verified',
        writebackMode: 'boost_recommendation',
        writebackLine: '周挑战旁证已经回写，季盘会更偏向当前主修并给出更稳的复盘建议。',
        resolvedRunId: `challenge:${run.mode}:${run.rotationKey}:${run.ruleId}`,
        chapterIndex: clampInt(run.goalRealm, 0, 999),
        proofQuality: clampInt(run.finalScore, 0) >= 480 ? 'solid' : 'thin',
        lineageStyle: String(featuredProfile?.themeLabel || '').trim(),
        summaryLine: clampInt(run.finalScore, 0) >= 360 ? '七日劫数已经补上一张稳定旁证，这周主练不再只靠单一路线说话。' : '七日劫数已留下旁证样本，足够给本周主练多一层不同节奏的证明。',
        detailLine: [String(run.ruleName || '').trim(), `得分 ${clampInt(run.finalScore, 0)}`, Array.isArray(featuredProfile?.featuredTags) && featuredProfile.featuredTags.length > 0 ? featuredProfile.featuredTags.slice(0, 2).join(' / ') : ''].filter(Boolean).join('｜'),
        statusLine: `七日劫数 · 已归档 ${clampInt(run.finalScore, 0)} 分`,
        anchorSection: 'challenge',
        priority: 2
      });
    }
    if (run.practiceOnly) {
      this.setPvpLivePracticeReturnReceipt(run, options);
    }
    if (!run.replayOnly && !run.practiceOnly && options.completed && typeof this.recordCollectionUnlock === 'function') {
      this.recordCollectionUnlock('challenge', {
        id: `challenge:${run.mode}:${run.rotationKey}:${run.ruleId}`,
        name: `${run.modeLabel}·${run.ruleName}`,
        icon: run.icon || '🜂',
        note: `本轮得分 ${run.finalScore}，可回观星台领取对应奖励。`
      });
    }
    if (!run.replayOnly && !run.practiceOnly && options.completed && typeof ProgressionService !== 'undefined' && ProgressionService && typeof ProgressionService.recordActivityCompleted === 'function') {
      const safeRunId = typeof this.normalizeProgressionSafeId === 'function' ? this.normalizeProgressionSafeId(run.runId) : String(run.runId || '').trim();
      const goalRealm = clampInt(run.goalRealm, 1, 999);
      const sourceRef = typeof this.createProgressionSourceRef === 'function'
        ? this.createProgressionSourceRef({
            runId: safeRunId,
            eventType: 'activity_completed',
            realm: goalRealm,
            checkpointKey: `challenge:${run.mode}:${run.rotationKey}:${run.ruleId}:completion`
          })
        : `challenge:${safeRunId}:${run.rotationKey}:${run.ruleId}:completion`;
      ProgressionService.recordActivityCompleted({
        mode: 'challenge',
        runId: safeRunId,
        ownerUserId: String(run.ownerUserId || '').trim(),
        sourceRef,
        verificationContext: typeof this.buildProgressionVerificationContext === 'function'
          ? this.buildProgressionVerificationContext({
              mode: 'challenge',
              challengeMode: String(run.mode || ''),
              rotationKey: String(run.rotationKey || ''),
              ruleId: String(run.ruleId || ''),
              goalRealm,
              saveSlot: Number.isInteger(run.saveSlot) ? run.saveSlot : Number.isInteger(this.currentSaveSlot) ? this.currentSaveSlot : null,
              seedSignature: String(run.seedSignature || '')
            })
          : {
              mode: String(run.mode || ''),
              rotationKey: String(run.rotationKey || ''),
              ruleId: String(run.ruleId || ''),
              goalRealm,
              saveSlot: Number.isInteger(run.saveSlot) ? run.saveSlot : null,
              seedSignature: String(run.seedSignature || '')
            },
        proof: {
          challengeMode: ['daily', 'weekly', 'global'].includes(String(run.mode || '')) ? String(run.mode) : undefined,
          rotationKey: String(run.rotationKey || ''),
          ruleId: String(run.ruleId || ''),
          realm: goalRealm,
          runId: safeRunId
        }
      });
      if (typeof ProgressionService.flush === 'function') {
        Promise.resolve().then(() => ProgressionService.flush()).catch(() => {});
      }
    }
    if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(run.practiceOnly
        ? `【${run.modeLabel}】${options.completed ? '完成' : '中断'}：${run.ruleName}，练习不计分、不入档。`
        : `【${run.modeLabel}】${options.completed ? '完成' : '中断'}：${run.ruleName}，得分 ${run.finalScore}${run.replayOnly ? '（不计奖励）' : ''}`);
    }
    this.clearActiveChallengeRun();
    this.renderMainMenuChallengeSummary();
    if (this.currentScreen === 'challenge-screen') {
      this.initChallengeHub();
    }
    return run;
  };
  challengeHubMethods.grantChallengePvpCoins = function (amount = 0) {
    const delta = clampInt(amount, 0);
    if (delta <= 0 || typeof PVPService === 'undefined' || !PVPService) return false;
    if (typeof PVPService.loadEconomyState !== 'function' || typeof PVPService.saveEconomyState !== 'function') return false;
    const current = PVPService.loadEconomyState();
    let next = PVPService.normalizeEconomyState({
      ...current,
      coins: clampInt(current.coins, 0) + delta,
      totalEarned: clampInt(current.totalEarned, 0) + delta
    });
    if (typeof PVPService.appendEconomyLog === 'function') {
      next = PVPService.appendEconomyLog(next, {
        type: 'challenge_reward',
        coins: delta,
        detail: '周挑战奖励'
      });
    }
    PVPService.saveEconomyState(next);
    return true;
  };
  challengeHubMethods.grantChallengePvpItem = function (itemId = '', fallbackCoins = 0) {
    if (!itemId || typeof PVPService === 'undefined' || !PVPService) {
      return this.grantChallengePvpCoins(fallbackCoins);
    }
    if (typeof PVPService.getShopItemById !== 'function' || typeof PVPService.loadEconomyState !== 'function' || typeof PVPService.saveEconomyState !== 'function') {
      return this.grantChallengePvpCoins(fallbackCoins);
    }
    const item = PVPService.getShopItemById(itemId);
    if (!item) {
      return this.grantChallengePvpCoins(fallbackCoins);
    }
    const current = PVPService.loadEconomyState();
    if (current.ownedItems && current.ownedItems[item.id]) {
      return this.grantChallengePvpCoins(fallbackCoins);
    }
    let next = PVPService.normalizeEconomyState({
      ...current,
      ownedItems: {
        ...(current.ownedItems || {}),
        [item.id]: true
      },
      ...(item.type === 'skin' && !current.equippedSkinId ? {
        equippedSkinId: item.id
      } : {}),
      ...(item.type === 'title' && !current.equippedTitleId ? {
        equippedTitleId: item.id
      } : {})
    });
    if (typeof PVPService.appendEconomyLog === 'function') {
      next = PVPService.appendEconomyLog(next, {
        type: 'challenge_reward',
        itemId: item.id,
        itemName: item.name || null,
        detail: '周挑战解锁'
      });
    }
    PVPService.saveEconomyState(next);
    return true;
  };
  challengeHubMethods.claimChallengeMilestone = function (mode = 'daily', rewardId = '') {
    this.ensureChallengeHubBootState();
    const bundle = this.buildChallengeBundle(mode);
    if (!bundle || !bundle.rule || !rewardId) return false;
    const reward = bundle.rewards.find(item => item.id === rewardId);
    if (!reward || reward.claimed || !reward.ready) return false;
    const entry = this.getChallengeProgressEntry(bundle.mode, bundle.rotationKey, true);
    entry.claimedRewards[rewardId] = true;
    const logs = [];
    (reward.rewards || []).forEach(grant => {
      if (!grant || !grant.kind) return;
      if (grant.kind === 'pvpCoins') {
        if (this.grantChallengePvpCoins(grant.amount)) logs.push(`天道币 +${clampInt(grant.amount, 0)}`);
      } else if (grant.kind === 'legacyEssence') {
        if (typeof this.awardLegacyEssence === 'function') {
          this.awardLegacyEssence(clampInt(grant.amount, 0), '周挑战奖励', {
            silent: true
          });
          logs.push(`传承精魄 +${clampInt(grant.amount, 0)}`);
        }
      } else if (grant.kind === 'pvpItem') {
        const ok = this.grantChallengePvpItem(grant.itemId, grant.fallbackCoins);
        if (ok) {
          const fallbackItem = typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getShopItemById === 'function' ? PVPService.getShopItemById(grant.itemId) : null;
          logs.push(fallbackItem ? `解锁 ${fallbackItem.name}` : '已发放周挑战外观奖励');
        }
      } else if (grant.kind === 'codexRecord') {
        if (typeof this.recordCollectionUnlock === 'function') {
          this.recordCollectionUnlock('challenge', {
            id: grant.id || `${bundle.mode}:${rewardId}`,
            name: grant.name || reward.label,
            icon: grant.icon || bundle.rule.icon || '✦',
            note: grant.note || reward.rewardText || '周挑战奖励已入档。'
          });
          logs.push(grant.name || '观星记录已入档');
        }
      }
    });
    this.saveChallengeProgressState();
    if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(`观星台奖励已领取：${logs.join(' / ') || reward.rewardText}`);
    }
    this.initChallengeHub();
    this.renderMainMenuChallengeSummary();
    return true;
  };
  challengeHubMethods.renderChallengeRunBanner = function () {
    if (typeof document === 'undefined') return;
    const banner = this.ensureChallengeRunBannerHost();
    if (!banner) return;
    const run = this.activeChallengeRun;
    const visible = !!run && !run.resolved && this.currentScreen === 'map-screen';
    banner.style.display = visible ? 'flex' : 'none';
    if (!visible) {
      banner.innerHTML = '';
      return;
    }
    const score = this.computeActiveChallengeScore(run);
    run.progress.currentScore = score;
    this.persistActiveChallengeRun();
    const replayFocus = run.replayOnly && run.archiveInsight ? (() => {
      const insight = normalizeChallengeArchiveInsight(run.archiveInsight);
      return insight.drillObjective || insight.focusLines[0] || insight.summary || insight.title || '';
    })() : '';
    banner.innerHTML = `
            <span class="challenge-run-chip">${escapeHtml(run.modeLabel)}</span>
            <div class="challenge-run-text">
                <strong>${escapeHtml(run.ruleName)}</strong>
                <span>${escapeHtml(run.targetChapter || `目标至第 ${run.goalRealm} 重`)}${run.seedSignature ? ` · 命盘签 ${run.seedSignature}` : ''}${(() => {
      const dangerProfile = this.buildChallengeDangerProfile(run, run.mode);
      return dangerProfile.index > 0 ? ` · DRI ${dangerProfile.index} · ${dangerProfile.tierLabel}` : '';
    })()}</span>
                ${replayFocus ? `<span class="challenge-run-focus">训练重点：${escapeHtml(replayFocus)}</span>` : ''}
            </div>
            <div class="challenge-run-stats">
                <span>${run.practiceOnly ? '真人练习 · 不计奖励' : run.replayOnly ? '观星回放 · 不计奖励' : `完成线 第 ${run.goalRealm} 重`}</span>
                <strong>${run.practiceOnly ? '练习不计分' : `${score} 分`}</strong>
            </div>
        `;
  };
  challengeHubMethods.ensureChallengeRunBannerHost = function () {
    if (typeof document === 'undefined') return null;
    const existing = document.getElementById('challenge-run-banner');
    if (existing) return existing;
    const mapScreen = document.getElementById('map-screen');
    if (!mapScreen) return null;
    const banner = document.createElement('div');
    banner.id = 'challenge-run-banner';
    banner.className = 'challenge-run-banner';
    banner.style.display = 'none';
    const modernMapShell = mapScreen.querySelector('.map-screen-v3');
    if (modernMapShell) {
      const anchor = modernMapShell.querySelector('.map-scroll-container');
      if (anchor && anchor.parentNode === modernMapShell) {
        modernMapShell.insertBefore(banner, anchor);
      } else {
        modernMapShell.appendChild(banner);
      }
      return banner;
    }
    const legacyAnchor = mapScreen.querySelector('.map-container, .map-footer');
    if (legacyAnchor && legacyAnchor.parentNode === mapScreen) {
      mapScreen.insertBefore(banner, legacyAnchor);
    } else {
      mapScreen.appendChild(banner);
    }
    return banner;
  };
  challengeHubMethods.renderChallengeLockedSelection = function (type = 'destiny') {
    const pending = this.pendingChallengeStart;
    if (!pending || !pending.rule) return false;
    const host = document.getElementById(type === 'destiny' ? 'run-destiny-selection' : 'spirit-companion-selection');
    const summary = document.getElementById(type === 'destiny' ? 'run-destiny-summary' : 'spirit-companion-summary');
    if (!host) return false;
    const meta = type === 'destiny' ? this.getRunDestinyMetaById(pending.rule.runDestinyId, 1) : this.getSpiritCompanionMetaById(pending.rule.spiritCompanionId, 1);
    if (!meta) return false;
    host.innerHTML = `
            <div class="run-destiny-card selected challenge-locked-card ${type === 'spirit' ? 'run-spirit-card' : ''}">
                <div class="run-destiny-head">
                    <span class="run-destiny-icon">${escapeHtml(meta.icon || '✦')}</span>
                    <div class="run-destiny-title-group">
                        <span class="run-destiny-name">${escapeHtml(meta.name || '未知条目')}</span>
                        <span class="run-destiny-tier">${escapeHtml(type === 'destiny' ? `${meta.category || '命格'} · ${meta.tierLabel || '初印'}` : meta.title || `${meta.category || '灵契'} · ${meta.tierLabel || '初契'}`)}</span>
                    </div>
                    <span class="challenge-lock-pill">挑战锁定</span>
                </div>
                <div class="run-destiny-desc">${escapeHtml(meta.description || '')}</div>
                <div class="run-destiny-summary">${escapeHtml(type === 'destiny' ? meta.summary || meta.playstyle || meta.description || '' : `${meta.passiveDesc || ''} ${meta.activeDesc || ''}`.trim())}</div>
            </div>
        `;
    if (summary) {
      summary.textContent = type === 'destiny' ? `${pending.replayOnly ? '本次回放' : '本轮挑战'}固定命格「${meta.name}」，用于稳定这套轮换的开局节奏。` : `${pending.replayOnly ? '本次回放' : '本轮挑战'}固定灵契「${meta.name}」，用于锁定当前观星台的测试方向。`;
    }
    return true;
  };
  challengeHubMethods.decorateCharacterSelectionForChallenge = function () {
    const pending = this.pendingChallengeStart;
    if (!pending || !pending.rule || typeof document === 'undefined') return;
    const container = document.getElementById('character-selection-container');
    const confirmBtn = document.getElementById('confirm-character-btn');
    if (!container) return;
    const dangerProfile = this.buildChallengeDangerProfile(pending.rule, pending.mode);
    const archiveInsight = pending.archiveInsight && hasChallengeArchiveInsight(pending.archiveInsight) ? normalizeChallengeArchiveInsight(pending.archiveInsight) : null;
    const practicePlanMarkup = pending.practiceOnly
      ? renderPvpLivePracticeSelectionPlanMarkup(pending.bundleSnapshot?.meta?.practicePlan)
      : '';
    let banner = document.getElementById('challenge-selection-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'challenge-selection-banner';
      banner.className = 'challenge-selection-banner';
      container.prepend(banner);
    }
    banner.innerHTML = `
            <div class="challenge-selection-head">
                <span class="challenge-run-chip">${escapeHtml(pending.modeLabel || HUB_META[pending.mode]?.label || '周挑战')}</span>
                <strong>${escapeHtml(pending.rule.name || '挑战轮换')}</strong>
            </div>
            <p>${escapeHtml(pending.rule.objective || '本轮将使用固定命盘直接开局。')}</p>
            <div class="challenge-selection-meta">
                <span>角色：${escapeHtml(this.getCharacterDisplayName(pending.rule.characterId))}</span>
                <span>章节：${escapeHtml(pending.rule.targetChapter || `完成至第 ${pending.rule.goalRealm} 重`)}</span>
                <span>压强：DRI ${dangerProfile.index} · ${escapeHtml(dangerProfile.tierLabel)}</span>
                <span>主轴：${escapeHtml(dangerProfile.dominantAxisLabel)}</span>
            </div>
            ${renderChallengeInsightMarkup(archiveInsight, {
      compact: true
    })}
            ${practicePlanMarkup}
        `;
    document.querySelectorAll('.character-card').forEach(card => {
      const locked = card.dataset.id !== pending.rule.characterId;
      card.classList.toggle('challenge-card-locked', locked);
      if (locked) {
        card.style.pointerEvents = 'none';
      }
    });
    this.selectedCharacterId = pending.rule.characterId;
    this.selectedRunDestinyId = pending.rule.runDestinyId;
    this.selectedSpiritCompanionId = pending.rule.spiritCompanionId;
    if (typeof originalSelectCharacter === 'function') {
      originalSelectCharacter.call(this, pending.rule.characterId);
    }
    this.renderChallengeLockedSelection('destiny');
    this.renderChallengeLockedSelection('spirit');
    this.updateCharacterSelectionConfirmState();
    if (confirmBtn) {
      confirmBtn.querySelector('.btn-text').textContent = pending.replayOnly ? '以回放命盘开局' : '以挑战命盘开局';
    }
  };
  challengeHubMethods.applyChallengeRunStart = function (bundle) {
    const run = this.createActiveChallengeRun(bundle);
    this.activeChallengeRun = run;
    this.persistActiveChallengeRun();
    if (Array.isArray(bundle.rule.vowIds) && this.player && typeof this.player.applyRunVow === 'function') {
      bundle.rule.vowIds.slice(0, 2).forEach(vowId => {
        try {
          this.player.applyRunVow(vowId);
        } catch (error) {
          console.warn('Apply challenge vow failed:', vowId, error);
        }
      });
    }
    if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(`【${bundle.meta.label}】${bundle.rule.name} 已开始，完成线：第 ${bundle.rule.goalRealm} 重。${bundle.replayOnly ? '本轮只记录留痕。' : ''}`);
    }
    this.renderMainMenuChallengeSummary();
    this.renderChallengeRunBanner();
  };
  challengeHubMethods.applyChallengeModifiersToEnemies = function (enemies = []) {
    const run = this.activeChallengeRun;
    if (!run || run.resolved) return Array.isArray(enemies) ? enemies : [enemies];
    return (Array.isArray(enemies) ? enemies : [enemies]).filter(Boolean).map(enemy => {
      const next = clone(enemy) || {};
      const hpMul = Math.max(1, safeNumber(run.battleModifiers.enemyHpMul, 1));
      const atkMul = Math.max(1, safeNumber(run.battleModifiers.enemyAtkMul, 1));
      const openingBlock = clampInt(run.battleModifiers.enemyOpeningBlock, 0);
      const enemyDebuff = run.battleModifiers.enemyDebuff;
      next.hp = Math.max(1, Math.floor(safeNumber(next.hp || next.maxHp, 1) * hpMul));
      next.maxHp = Math.max(next.hp, Math.floor(safeNumber(next.maxHp || next.hp, 1) * hpMul));
      next.block = clampInt(next.block, 0) + openingBlock;
      next.patterns = Array.isArray(next.patterns) ? next.patterns.map(pattern => {
        const copied = {
          ...(pattern || {})
        };
        if (copied.type === 'attack' || copied.type === 'multiAttack') {
          copied.value = Math.max(1, Math.floor(safeNumber(copied.value, 0) * atkMul));
        }
        return copied;
      }) : [];
      if (enemyDebuff && enemyDebuff.type && clampInt(enemyDebuff.value, 0) > 0) {
        next.patterns.unshift({
          type: 'debuff',
          buffType: enemyDebuff.type,
          value: clampInt(enemyDebuff.value, 0),
          intent: enemyDebuff.intent || '周挑战词缀'
        });
      }
      next.challengeMarked = true;
      return next;
    });
  };
  challengeHubMethods.registerChallengeBattleResult = function (nodeType = 'enemy') {
    if (!this.activeChallengeRun || this.activeChallengeRun.resolved) return;
    if (nodeType === 'boss') {
      this.activeChallengeRun.progress.bossWins += 1;
    } else if (nodeType === 'elite' || nodeType === 'trial') {
      this.activeChallengeRun.progress.eliteWins += 1;
    } else {
      this.activeChallengeRun.progress.battleWins += 1;
    }
    const score = this.refreshActiveChallengeScore();
    if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog(`【${this.activeChallengeRun.modeLabel}】当前得分 ${score}`);
    }
  };
  challengeHubMethods.getChallengeHubPayload = function () {
    this.ensureChallengeHubBootState();
    const tab = this.challengeHubState.tab || 'daily';
    const liveBundle = this.currentScreen === 'challenge-screen' ? this.buildChallengeBundle(tab) : null;
    const archive = this.getObservatoryArchiveSummary();
    const selectedGuide = this.getSelectedObservatoryExpeditionGuide({
      silentSync: true
    });
    const trainingFocus = this.getObservatoryTrainingFocus();
    const pendingDangerProfile = this.pendingChallengeStart?.rule ? this.buildChallengeDangerProfile(this.pendingChallengeStart.rule, this.pendingChallengeStart.mode) : null;
    const pendingArchiveInsight = this.pendingChallengeStart?.archiveInsight || this.pendingChallengeStart?.bundleSnapshot?.archiveInsight || null;
    const hubBundle = this.pendingChallengeStart && this.pendingChallengeStart.rule && this.pendingChallengeStart.mode === tab ? {
      mode: this.pendingChallengeStart.mode,
      rule: this.pendingChallengeStart.rule,
      rewards: Array.isArray(this.pendingChallengeStart.bundleSnapshot?.rewards) ? this.pendingChallengeStart.bundleSnapshot.rewards : liveBundle?.rewards || [],
      progress: liveBundle?.progress || {
        bestScore: 0,
        totalScore: 0
      },
      seedSignature: String(this.pendingChallengeStart.seedSignature || this.pendingChallengeStart.bundleSnapshot?.seedSignature || liveBundle?.seedSignature || ''),
      dangerProfile: pendingDangerProfile,
      archiveInsight: pendingArchiveInsight
    } : liveBundle;
    const comparison = hubBundle ? this.buildObservatoryThemeComparison({
      mode: hubBundle.mode,
      rule: hubBundle.rule,
      themeKey: this.getChallengeThemeMeta(hubBundle.rule, hubBundle.mode).key,
      themeLabel: this.getChallengeThemeMeta(hubBundle.rule, hubBundle.mode).label
    }) : null;
    const archiveFilters = this.buildChallengeArchiveFilterBundle(liveBundle || hubBundle || null);
    const seasonVerificationArchive = typeof this.getSeasonVerificationArchiveSnapshot === 'function' ? this.getSeasonVerificationArchiveSnapshot() : null;
    const seasonVerificationArchiveFilters = this.buildSeasonVerificationArchiveFilterBundle(seasonVerificationArchive, {
      tab: 'weekly'
    });
    const activeRunDangerProfile = this.activeChallengeRun ? this.buildChallengeDangerProfile(this.activeChallengeRun, this.activeChallengeRun.mode) : null;
    const activeRunArchiveInsight = this.activeChallengeRun?.archiveInsight || null;
    return {
      pending: this.pendingChallengeStart ? {
        mode: this.pendingChallengeStart.mode,
        ruleId: this.pendingChallengeStart.rule?.id || '',
        characterId: this.pendingChallengeStart.rule?.characterId || '',
        replayOnly: !!this.pendingChallengeStart.replayOnly,
        practiceOnly: !!this.pendingChallengeStart.practiceOnly,
        seedSignature: String(this.pendingChallengeStart.seedSignature || ''),
        dangerProfile: serializeChallengeDangerProfile(pendingDangerProfile),
        archiveInsight: serializeChallengeArchiveInsight(pendingArchiveInsight)
      } : null,
      activeRun: this.activeChallengeRun ? {
        mode: this.activeChallengeRun.mode,
        modeLabel: this.activeChallengeRun.modeLabel,
        ruleId: this.activeChallengeRun.ruleId,
        ruleName: this.activeChallengeRun.ruleName,
        goalRealm: this.activeChallengeRun.goalRealm,
        currentScore: this.activeChallengeRun.practiceOnly ? 0 : clampInt(this.activeChallengeRun.progress?.currentScore, 0),
        resolved: !!this.activeChallengeRun.resolved,
        replayOnly: !!this.activeChallengeRun.replayOnly,
        practiceOnly: !!this.activeChallengeRun.practiceOnly,
        seedSignature: String(this.activeChallengeRun.seedSignature || ''),
        dangerProfile: serializeChallengeDangerProfile(activeRunDangerProfile),
        archiveInsight: serializeChallengeArchiveInsight(activeRunArchiveInsight)
      } : null,
      pvpLivePracticeReturn: this.getPvpLivePracticeReturnReceipt(),
      hub: hubBundle ? {
        activeTab: tab,
        ruleName: hubBundle.rule?.name || '',
        targetChapter: hubBundle.rule?.targetChapter || '',
        rewardCount: hubBundle.rewards.length,
        bestScore: clampInt(hubBundle.progress.bestScore, 0),
        totalScore: clampInt(hubBundle.progress.totalScore, 0),
        seedSignature: hubBundle.seedSignature || '',
        comparisonThemeLabel: comparison?.themeLabel || '',
        comparisonCount: comparison?.entries?.length || 0,
        dangerProfile: serializeChallengeDangerProfile(hubBundle.dangerProfile)
      } : null,
      archive: {
        totalRecords: archive.totalRecords,
        replayCount: archive.replayCount,
        replayableCount: archive.replayableCount,
        featuredCount: archive.featuredCount,
        filterState: archiveFilters.state,
        filterSummary: archiveFilters.filterSummary,
        sortLabel: archiveFilters.sortLabel,
        filteredCount: archiveFilters.matchedCount,
        filteredReplayableCount: archiveFilters.replayableCount,
        filteredFeaturedCount: archiveFilters.featuredCount,
        filteredCompletedCount: archiveFilters.completedCount,
        filteredFailedCount: archiveFilters.failedCount,
        scopeTotalCount: archiveFilters.scopeTotalCount,
        filteredScopeLabel: archiveFilters.scopeLabel,
        filteredTrackLabel: archiveFilters.trackLabel,
        filteredOutcomeLabel: archiveFilters.outcomeLabel,
        filteredThemeLabel: archiveFilters.themeLabel,
        activePresetSlots: archiveFilters.presetSlots.filter(item => item.active).map(item => item.slot),
        presetLabels: archiveFilters.presetSlots.map(item => item.label),
        latestTitle: archive.latest?.title || '',
        latestSeedSignature: archive.latest?.seedSignature || '',
        latestInsightTitle: archive.latest?.insight?.title || '',
        latestInsight: serializeChallengeArchiveInsight(archive.latest?.insight),
        selectedGuideId: selectedGuide?.id || '',
        selectedGuideTitle: selectedGuide?.title || '',
        selectedGuideThemeLabel: selectedGuide?.themeLabel || '',
        trainingFocusAdvice: trainingFocus?.trainingAdvice || '',
        trainingFocusThemeLabel: trainingFocus?.themeLabel || ''
      },
      verificationArchive: seasonVerificationArchive ? {
        available: !!seasonVerificationArchive.available,
        totalRecords: clampInt(seasonVerificationArchive.totalRecords, 0),
        verifiedCount: clampInt(seasonVerificationArchive.verifiedCount, 0),
        failedCount: clampInt(seasonVerificationArchive.failedCount, 0),
        deferredCount: clampInt(seasonVerificationArchive.deferredCount, 0),
        pendingCount: clampInt(seasonVerificationArchive.pendingCount, 0),
        summaryLine: seasonVerificationArchive.summaryLine || '',
        detailLine: seasonVerificationArchive.detailLine || '',
        progressText: seasonVerificationArchive.progressText || '',
        filterState: seasonVerificationArchiveFilters.state,
        filterSummary: seasonVerificationArchiveFilters.filterSummary,
        sourceModeLabel: seasonVerificationArchiveFilters.sourceModeLabel,
        resultStatusLabel: seasonVerificationArchiveFilters.resultStatusLabel,
        phaseLabel: seasonVerificationArchiveFilters.phaseLabel,
        trajectoryLabel: seasonVerificationArchiveFilters.trajectoryLabel,
        roleLabel: seasonVerificationArchiveFilters.roleLabel,
        sortLabel: seasonVerificationArchiveFilters.sortLabel,
        filteredCount: seasonVerificationArchiveFilters.matchedCount,
        filteredVerifiedCount: seasonVerificationArchiveFilters.verifiedCount,
        filteredFailedCount: seasonVerificationArchiveFilters.failedCount,
        filteredDeferredCount: seasonVerificationArchiveFilters.deferredCount,
        filteredPendingCount: seasonVerificationArchiveFilters.pendingCount,
        totalShownCount: seasonVerificationArchiveFilters.totalCount,
        filteredPhaseLabel: seasonVerificationArchiveFilters.phaseLabel,
        filteredTrajectoryLabel: seasonVerificationArchiveFilters.trajectoryLabel,
        latestRecordId: seasonVerificationArchive.latestEntry?.recordId || '',
        latestAnchorSection: seasonVerificationArchive.latestEntry?.anchorSection || '',
        latestActionType: seasonVerificationArchive.latestEntry?.actionType || '',
        latestActionValue: seasonVerificationArchive.latestEntry?.actionValue || '',
        latestCtaLabel: seasonVerificationArchive.latestEntry?.ctaLabel || '',
        latestSourceMode: seasonVerificationArchive.latestEntry?.sourceMode || '',
        latestResultStatus: seasonVerificationArchive.latestEntry?.resultStatus || '',
        latestRole: seasonVerificationArchive.latestEntry?.role || '',
        latestTrajectoryKey: resolveSeasonVerificationArchiveTrajectoryMeta(seasonVerificationArchive.latestEntry).key,
        latestTrajectoryLabel: resolveSeasonVerificationArchiveTrajectoryMeta(seasonVerificationArchive.latestEntry).label,
        entryAnchors: seasonVerificationArchiveFilters.entries.map(entry => entry.anchorSection || ''),
        latestEntry: seasonVerificationArchive.latestEntry ? {
          recordId: seasonVerificationArchive.latestEntry.recordId || '',
          sourceMode: seasonVerificationArchive.latestEntry.sourceMode || '',
          resultStatus: seasonVerificationArchive.latestEntry.resultStatus || '',
          role: seasonVerificationArchive.latestEntry.role || '',
          trajectoryKey: resolveSeasonVerificationArchiveTrajectoryMeta(seasonVerificationArchive.latestEntry).key,
          trajectoryLabel: resolveSeasonVerificationArchiveTrajectoryMeta(seasonVerificationArchive.latestEntry).label,
          anchorSection: seasonVerificationArchive.latestEntry.anchorSection || '',
          actionType: seasonVerificationArchive.latestEntry.actionType || '',
          actionValue: seasonVerificationArchive.latestEntry.actionValue || '',
          ctaLabel: seasonVerificationArchive.latestEntry.ctaLabel || ''
        } : null
      } : null,
      observatoryGuide: selectedGuide ? {
        id: selectedGuide.id,
        title: selectedGuide.title,
        themeLabel: selectedGuide.themeLabel,
        featuredTier: selectedGuide.featuredTier,
        featuredTags: normalizeTagList(selectedGuide.featuredTags, 4),
        seedSignature: selectedGuide.seedSignature || '',
        preferredNodes: Array.isArray(selectedGuide.preferredNodes) ? selectedGuide.preferredNodes.slice(0, 4) : [],
        routeFocusLine: selectedGuide.routeFocusLine || '',
        compareHint: selectedGuide.compareHint || '',
        expeditionNote: selectedGuide.expeditionNote || '',
        trainingTags: normalizeTagList(selectedGuide.trainingTags, 3),
        coachBrief: selectedGuide.coachBrief || '',
        drillObjective: selectedGuide.drillObjective || '',
        insight: serializeChallengeArchiveInsight(selectedGuide.insight)
      } : null,
      trainingFocus: trainingFocus ? {
        sourceRunId: trainingFocus.sourceRunId || '',
        chapterName: trainingFocus.chapterName || '',
        sourceTitle: trainingFocus.sourceTitle || '',
        guideRecordId: trainingFocus.guideRecordId || '',
        themeKey: trainingFocus.themeKey || '',
        themeLabel: trainingFocus.themeLabel || '',
        ratingLabel: trainingFocus.ratingLabel || '',
        ratingTone: trainingFocus.ratingTone || 'selected',
        trainingAdvice: trainingFocus.trainingAdvice || '',
        highlightLine: trainingFocus.highlightLine || '',
        branchName: trainingFocus.branchName || '',
        routeFocusLine: trainingFocus.routeFocusLine || '',
        compareHint: trainingFocus.compareHint || '',
        trainingTags: normalizeTagList(trainingFocus.trainingTags, 4),
        goalHighlights: (Array.isArray(trainingFocus.goalHighlights) ? trainingFocus.goalHighlights : []).map(line => String(line || '')).filter(Boolean)
      } : null
    };
  };
  challengeHubMethods.showScreen = function (screenId) {
    const prevScreen = this.currentScreen;
    const result = typeof originalShowScreen === 'function' ? originalShowScreen.call(this, screenId) : undefined;
    if (screenId === 'main-menu') {
      if (prevScreen === 'character-selection-screen' && this.pendingChallengeStart && !this.activeChallengeRun) {
        this.clearPendingChallengeStart();
      }
      this.renderMainMenuChallengeSummary();
    } else if (screenId === 'challenge-screen') {
      this.initChallengeHub();
    } else if (screenId === 'map-screen') {
      this.renderChallengeRunBanner();
    } else {
      this.renderChallengeRunBanner();
    }
    return result;
  };
  challengeHubMethods.showCharacterSelection = function () {
    const result = typeof originalShowCharacterSelection === 'function' ? originalShowCharacterSelection.call(this) : undefined;
    this.decorateCharacterSelectionForChallenge();
    return result;
  };
  challengeHubMethods.renderRunDestinySelection = function (characterId) {
    if (this.pendingChallengeStart && this.renderChallengeLockedSelection('destiny')) {
      this.updateCharacterSelectionConfirmState();
      return;
    }
    if (typeof originalRenderRunDestinySelection === 'function') {
      return originalRenderRunDestinySelection.call(this, characterId);
    }
    return undefined;
  };
  challengeHubMethods.renderSpiritCompanionSelection = function (characterId) {
    if (this.pendingChallengeStart && this.renderChallengeLockedSelection('spirit')) {
      this.updateCharacterSelectionConfirmState();
      return;
    }
    if (typeof originalRenderSpiritCompanionSelection === 'function') {
      return originalRenderSpiritCompanionSelection.call(this, characterId);
    }
    return undefined;
  };
  challengeHubMethods.selectCharacter = function (charId) {
    if (this.pendingChallengeStart && this.pendingChallengeStart.rule && charId !== this.pendingChallengeStart.rule.characterId) {
      if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
        Utils.showBattleLog(`${this.pendingChallengeStart.replayOnly ? '观星回放' : '观星挑战'}已锁定当前角色，需按观星台给出的命盘开局。`);
      }
      return;
    }
    if (typeof originalSelectCharacter === 'function') {
      return originalSelectCharacter.call(this, charId);
    }
    return undefined;
  };
  challengeHubMethods.selectRunDestiny = function (destinyId) {
    if (this.pendingChallengeStart && destinyId !== this.pendingChallengeStart.rule?.runDestinyId) return;
    if (typeof originalSelectRunDestiny === 'function') {
      return originalSelectRunDestiny.call(this, destinyId);
    }
    return undefined;
  };
  challengeHubMethods.selectSpiritCompanion = function (spiritId) {
    if (this.pendingChallengeStart && spiritId !== this.pendingChallengeStart.rule?.spiritCompanionId) return;
    if (typeof originalSelectSpiritCompanion === 'function') {
      return originalSelectSpiritCompanion.call(this, spiritId);
    }
    return undefined;
  };
  challengeHubMethods.startNewGame = function (characterId = 'linFeng', options = {}) {
    const pending = this.pendingChallengeStart;
    const bundle = pending?.bundleSnapshot ? clone(pending.bundleSnapshot) : pending ? this.buildChallengeBundle(pending.mode) : null;
    const isMatchingPending = !!bundle && !!bundle.rule && (!!pending?.bundleSnapshot || bundle.rotationKey === pending.rotationKey && bundle.rule.id === pending.rule.id);
    if (!isMatchingPending) {
      this.clearPendingChallengeStart();
      this.clearActiveChallengeRun();
      return typeof originalStartNewGame === 'function' ? originalStartNewGame.call(this, characterId, options) : undefined;
    }
    const lockedOptions = {
      ...(options && typeof options === 'object' ? options : {}),
      runDestinyId: bundle.rule.runDestinyId,
      spiritCompanionId: bundle.rule.spiritCompanionId
    };
    const result = typeof originalStartNewGame === 'function' ? originalStartNewGame.call(this, bundle.rule.characterId, lockedOptions) : undefined;
    this.applyChallengeRunStart(bundle);
    this.clearPendingChallengeStart();
    if (typeof this.startRealm === 'function') {
      this.startRealm(1, false);
      this.renderChallengeRunBanner();
    }
    return result;
  };
  challengeHubMethods.startBattle = function (enemies, node = null) {
    const prepared = this.activeChallengeRun && !this.activeChallengeRun.resolved ? this.applyChallengeModifiersToEnemies(enemies) : enemies;
    return typeof originalStartBattle === 'function' ? originalStartBattle.call(this, prepared, node) : undefined;
  };
  challengeHubMethods.onBattleWon = async function (enemies) {
    const nodeType = this.currentBattleNode && this.currentBattleNode.type ? this.currentBattleNode.type : 'enemy';
    if (this.activeChallengeRun && !this.activeChallengeRun.resolved) {
      this.registerChallengeBattleResult(nodeType);
    }
    const result = typeof originalOnBattleWon === 'function' ? await originalOnBattleWon.call(this, enemies) : undefined;
    return result;
  };
  challengeHubMethods.onBattleLost = async function () {
    if (this.activeChallengeRun && !this.activeChallengeRun.resolved) {
      this.finalizeActiveChallengeRun({
        completed: false,
        reason: 'battle_lost'
      });
    }
    return typeof originalOnBattleLost === 'function' ? originalOnBattleLost.call(this) : undefined;
  };
  challengeHubMethods.onRealmComplete = function () {
    const currentRealm = this.player && this.player.realm ? this.player.realm : 1;
    const shouldSuppressPveCompletion = !!(this.activeChallengeRun && !this.activeChallengeRun.resolved);
    if (this.activeChallengeRun && !this.activeChallengeRun.resolved) {
      this.activeChallengeRun.progress.realmClears += 1;
      if (currentRealm >= this.activeChallengeRun.goalRealm) {
        this.finalizeActiveChallengeRun({
          completed: true,
          reason: 'goal_reached'
        });
      } else {
        this.refreshActiveChallengeScore();
      }
    }
    const previousSuppression = this.progressionSuppressPveRealmCompletion;
    if (shouldSuppressPveCompletion) {
      this.progressionSuppressPveRealmCompletion = true;
    }
    try {
      return typeof originalOnRealmComplete === 'function' ? originalOnRealmComplete.call(this) : undefined;
    } finally {
      this.progressionSuppressPveRealmCompletion = previousSuppression;
    }
  };
  challengeHubMethods.finishStrategicNode = function (node, title, message, icon = '✨') {
    const result = typeof originalFinishStrategicNode === 'function' ? originalFinishStrategicNode.call(this, node, title, message, icon) : undefined;
    if (node && node.type === 'observatory' && !this.activeChallengeRun?.practiceOnly) {
      const note = String(message || '').split('\n').map(line => line.trim()).filter(Boolean).slice(0, 2).join(' / ');
      const entry = this.recordObservatoryArchiveEntry({
        id: `omen:${Date.now()}:${hashString(`${title}:${message}`)}`,
        type: 'omen',
        mode: 'daily',
        modeLabel: '观星留痕',
        rotationKey: getDayKey(new Date()),
        rotationLabel: formatDateLabel('daily', getDayKey(new Date())),
        title: String(title || '观星留痕'),
        note,
        icon: String(icon || '🔭'),
        at: Date.now(),
        completed: true,
        replayOnly: false,
        originLabel: '观星台'
      });
      if (typeof this.recordCollectionUnlock === 'function') {
        this.recordCollectionUnlock('observatory', {
          id: entry?.id || `omen:${Date.now()}`,
          name: `观星留痕·${String(title || '星轨已定')}`,
          icon: String(icon || '🔭'),
          note: note || '观星台已留下新的留痕。'
        });
      }
    }
    return result;
  };
  challengeHubMethods.saveGame = function () {
    const result = typeof originalSaveGame === 'function' ? originalSaveGame.call(this) : undefined;
    this.persistActiveChallengeRun();
    return result;
  };
  challengeHubMethods.loadGame = function () {
    const result = typeof originalLoadGame === 'function' ? originalLoadGame.call(this) : undefined;
    this.ensureChallengeHubBootState();
    const restored = this.restoreActiveChallengeRun();
    if (restored) {
      this.activeChallengeRun = restored;
      this.refreshActiveChallengeScore();
    }
    return result;
  };
  challengeHubMethods.clearSave = function (options = {}) {
    const result = typeof originalClearSave === 'function' ? originalClearSave.call(this, options) : undefined;
    this.clearActiveChallengeRun();
    return result;
  };
  challengeHubMethods.renderGameToText = function () {
    const raw = typeof originalRenderGameToText === 'function' ? originalRenderGameToText.call(this) : '{}';
    try {
      const payload = JSON.parse(raw);
      payload.challenge = this.getChallengeHubPayload();
      return JSON.stringify(payload);
    } catch (error) {
      return raw;
    }
  };

const rebindChallengeHubOriginals = game => {
  if (game && typeof game.showScreen === 'function') originalShowScreen = game.showScreen;
  if (game && typeof game.showCharacterSelection === 'function') originalShowCharacterSelection = game.showCharacterSelection;
  if (game && typeof game.renderRunDestinySelection === 'function') originalRenderRunDestinySelection = game.renderRunDestinySelection;
  if (game && typeof game.renderSpiritCompanionSelection === 'function') originalRenderSpiritCompanionSelection = game.renderSpiritCompanionSelection;
  if (game && typeof game.selectCharacter === 'function') originalSelectCharacter = game.selectCharacter;
  if (game && typeof game.selectRunDestiny === 'function') originalSelectRunDestiny = game.selectRunDestiny;
  if (game && typeof game.selectSpiritCompanion === 'function') originalSelectSpiritCompanion = game.selectSpiritCompanion;
  if (game && typeof game.startNewGame === 'function') originalStartNewGame = game.startNewGame;
  if (game && typeof game.startBattle === 'function') originalStartBattle = game.startBattle;
  if (game && typeof game.onBattleWon === 'function') originalOnBattleWon = game.onBattleWon;
  if (game && typeof game.onBattleLost === 'function') originalOnBattleLost = game.onBattleLost;
  if (game && typeof game.onRealmComplete === 'function') originalOnRealmComplete = game.onRealmComplete;
  if (game && typeof game.saveGame === 'function') originalSaveGame = game.saveGame;
  if (game && typeof game.loadGame === 'function') originalLoadGame = game.loadGame;
  if (game && typeof game.clearSave === 'function') originalClearSave = game.clearSave;
  if (game && typeof game.renderGameToText === 'function') originalRenderGameToText = game.renderGameToText;
  if (game && typeof game.getSanctumOverviewData === 'function') originalGetSanctumOverviewData = game.getSanctumOverviewData;
  if (game && typeof game.finishStrategicNode === 'function') originalFinishStrategicNode = game.finishStrategicNode;
};
const bindChallengeHubFacade = (controller, game) => {
  Object.entries(challengeHubMethods).forEach(([name, fn]) => {
    const bound = (...args) => fn.apply(game, args);
    controller[name] = bound;
    game[name] = bound;
  });
  return controller;
};
const registerChallengeHubMapHooks = (controller, game) => {
  if (!game?.map || typeof game.map.registerHook !== 'function' || controller._challengeMapHooksRegistered) return;
  controller._challengeAfterRenderHook = () => {
    if (game && typeof game.renderChallengeRunBanner === 'function') {
      game.renderChallengeRunBanner();
    }
  };
  game.map.registerHook('afterRender', controller._challengeAfterRenderHook);
  controller._challengeMapHooksRegistered = true;
};
class ChallengeHubController {
  constructor(game) {
    this.game = game;
    rebindChallengeHubOriginals(game);
    bindChallengeHubFacade(this, game);
    registerChallengeHubMapHooks(this, game);
  }
}
function attachChallengeHubController(game) {
  if (game.challengeHub instanceof ChallengeHubController) return game.challengeHub;
  game.challengeHub = new ChallengeHubController(game);
  return game.challengeHub;
}
if (typeof registerHubController === 'function') {
  registerHubController('challenge', attachChallengeHubController);
}
const challengeHubGlobal = typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof globalThis !== 'undefined' ? globalThis : null;
if (challengeHubGlobal) {
  challengeHubGlobal.__attachChallengeHubController = attachChallengeHubController;
}
return {
  ChallengeHubController,
  attachChallengeHubController
};
})();
export const ChallengeHubController = ChallengeHubModule.ChallengeHubController;
export const attachChallengeHubController = ChallengeHubModule.attachChallengeHubController;
