import { PVPService } from "../services/pvp-service.js";
export class MetaProgressionManager {
  constructor(gameInstance) {
    this.game = gameInstance;
  }
  getStrategicEngineeringCatalog() {
    return {
      observatory: {
        id: 'observatory',
        nodeType: 'observatory',
        icon: '🔭',
        name: '观星工程',
        nodeLabel: '观星台',
        tierLabels: ['未成形', 'I阶', 'II阶', 'III阶'],
        thresholds: [1, 2, 4],
        effectByTier: ['尚未形成稳定观测网。', '下重更偏向观星与事件，先把情报线立起来。', '观星、事件与裂隙联动抬升，常规战斗略降。', '形成跨章观测网，功能节点更稳定，追路更可控。'],
        shiftByTier: [{}, {
          observatory: 0.018,
          event: 0.014,
          enemy: -0.01
        }, {
          observatory: 0.026,
          event: 0.02,
          memory_rift: 0.014,
          enemy: -0.016,
          elite: -0.004
        }, {
          observatory: 0.032,
          event: 0.022,
          memory_rift: 0.02,
          shop: 0.006,
          enemy: -0.02,
          elite: -0.006
        }],
        reward: {
          insight: 1
        }
      },
      spirit_grotto: {
        id: 'spirit_grotto',
        nodeType: 'spirit_grotto',
        icon: '🪷',
        name: '灵契工程',
        nodeLabel: '灵契窟',
        tierLabels: ['未成形', 'I阶', 'II阶', 'III阶'],
        thresholds: [1, 2, 4],
        effectByTier: ['尚未形成稳定护道链。', '下重更偏向灵契与修整节点，先把护道线接起来。', '灵契、营地与观星协同补强，推进更稳。', '护道网络成形，恢复与补强节点会更连续。'],
        shiftByTier: [{}, {
          spirit_grotto: 0.018,
          rest: 0.012,
          observatory: 0.008
        }, {
          spirit_grotto: 0.026,
          rest: 0.016,
          observatory: 0.012,
          shop: 0.006,
          enemy: -0.01
        }, {
          spirit_grotto: 0.03,
          rest: 0.02,
          observatory: 0.014,
          shop: 0.01,
          enemy: -0.014,
          forbidden_altar: -0.006
        }],
        reward: {
          buffId: 'firstTurnDrawBoostBattles',
          buffAmount: 1,
          buffLabel: '首回合抽牌增益'
        }
      },
      forbidden_altar: {
        id: 'forbidden_altar',
        nodeType: 'forbidden_altar',
        icon: '🩸',
        name: '禁术工程',
        nodeLabel: '禁术坛',
        tierLabels: ['未成形', 'I阶', 'II阶', 'III阶'],
        thresholds: [1, 2, 4],
        effectByTier: ['尚未形成禁术推进链。', '下重更偏向禁术与试炼节点，收益与代价会同步放大。', '禁术、试炼与锻炉形成加速链，路线更偏冒险爆发。', '血契链路成形，高压节点更集中，适合搏命滚雪球。'],
        shiftByTier: [{}, {
          forbidden_altar: 0.018,
          trial: 0.012,
          rest: -0.008
        }, {
          forbidden_altar: 0.024,
          trial: 0.018,
          elite: 0.01,
          forge: 0.008,
          rest: -0.012,
          shop: -0.006
        }, {
          forbidden_altar: 0.03,
          trial: 0.022,
          elite: 0.014,
          forge: 0.012,
          enemy: -0.01,
          rest: -0.016,
          shop: -0.008
        }],
        reward: {
          karma: 1
        }
      },
      memory_rift: {
        id: 'memory_rift',
        nodeType: 'memory_rift',
        icon: '🪞',
        name: '裂隙工程',
        nodeLabel: '记忆裂隙',
        tierLabels: ['未成形', 'I阶', 'II阶', 'III阶'],
        thresholds: [1, 2, 4],
        effectByTier: ['尚未形成稳定裂隙回响。', '下重更偏向裂隙与事件节点，先把改写构筑的窗口拉出来。', '裂隙、事件与观星联动抬升，构筑改写会更连续。', '裂隙回响网成形，信息线与构筑线会同步加速。'],
        shiftByTier: [{}, {
          memory_rift: 0.018,
          event: 0.012,
          observatory: 0.008
        }, {
          memory_rift: 0.026,
          event: 0.018,
          observatory: 0.012,
          spirit_grotto: 0.006,
          enemy: -0.01
        }, {
          memory_rift: 0.032,
          event: 0.02,
          observatory: 0.016,
          spirit_grotto: 0.01,
          enemy: -0.014,
          elite: -0.004
        }],
        reward: {
          ringExp: 18
        }
      }
    };
  }
  createDefaultStrategicEngineeringState() {
    const catalog = this.getStrategicEngineeringCatalog();
    const tracks = {};
    Object.keys(catalog).forEach(id => {
      tracks[id] = {
        progress: 0,
        tier: 0,
        lastRealm: 0
      };
    });
    return {
      version: 1,
      lastAdvancedTrackId: '',
      history: [],
      tracks
    };
  }
  resolveStrategicEngineeringTier(progress = 0, thresholds = []) {
    const normalizedProgress = Math.max(0, Math.floor(Number(progress) || 0));
    const marks = Array.isArray(thresholds) ? thresholds : [];
    let tier = 0;
    marks.forEach((threshold, index) => {
      if (normalizedProgress >= Math.max(1, Math.floor(Number(threshold) || 0))) {
        tier = index + 1;
      }
    });
    return tier;
  }
  normalizeStrategicEngineering(source = null) {
    const catalog = this.getStrategicEngineeringCatalog();
    const defaults = this.createDefaultStrategicEngineeringState();
    const root = source && typeof source === 'object' ? source : {};
    const tracksSource = root.tracks && typeof root.tracks === 'object' ? root.tracks : {};
    const history = Array.isArray(root.history) ? root.history.filter(entry => typeof entry === 'string' && entry.trim()).slice(-8) : [];
    const normalized = {
      version: Math.max(1, Math.floor(Number(root.version) || defaults.version)),
      lastAdvancedTrackId: typeof root.lastAdvancedTrackId === 'string' && catalog[root.lastAdvancedTrackId] ? root.lastAdvancedTrackId : '',
      history,
      tracks: {}
    };
    Object.keys(catalog).forEach(id => {
      const entry = tracksSource[id] && typeof tracksSource[id] === 'object' ? tracksSource[id] : {};
      const progress = Math.max(0, Math.floor(Number(entry.progress) || 0));
      const tier = this.resolveStrategicEngineeringTier(progress, catalog[id].thresholds);
      normalized.tracks[id] = {
        progress,
        tier,
        lastRealm: Number.isFinite(Number(entry.lastRealm)) ? Math.max(0, Math.floor(Number(entry.lastRealm))) : 0
      };
    });
    return normalized;
  }
  ensureStrategicEngineeringState() {
    if (!this.game.player) {
      return this.createDefaultStrategicEngineeringState();
    }
    this.game.player.strategicEngineering = this.normalizeStrategicEngineering(this.game.player.strategicEngineering);
    return this.game.player.strategicEngineering;
  }
  getStrategicEngineeringTrackSnapshot(trackId = '', sourceState = null) {
    const catalog = this.getStrategicEngineeringCatalog();
    const meta = catalog[trackId];
    if (!meta) return null;
    const state = sourceState && typeof sourceState === 'object' ? this.normalizeStrategicEngineering(sourceState) : this.ensureStrategicEngineeringState();
    const trackState = state.tracks && state.tracks[trackId] ? state.tracks[trackId] : {
      progress: 0,
      tier: 0,
      lastRealm: 0
    };
    const progress = Math.max(0, Math.floor(Number(trackState.progress) || 0));
    const tier = this.resolveStrategicEngineeringTier(progress, meta.thresholds);
    const maxTier = Array.isArray(meta.thresholds) ? meta.thresholds.length : 0;
    const nextTarget = tier < maxTier ? meta.thresholds[tier] : null;
    const remaining = nextTarget == null ? 0 : Math.max(0, Math.floor(Number(nextTarget) || 0) - progress);
    const tierLabels = Array.isArray(meta.tierLabels) ? meta.tierLabels : [];
    const effectByTier = Array.isArray(meta.effectByTier) ? meta.effectByTier : [];
    const shiftByTier = Array.isArray(meta.shiftByTier) ? meta.shiftByTier : [];
    const weightShift = shiftByTier[Math.min(tier, Math.max(0, shiftByTier.length - 1))] || {};
    return {
      ...meta,
      trackId,
      progress,
      tier,
      maxTier,
      lastRealm: Math.max(0, Math.floor(Number(trackState.lastRealm) || 0)),
      tierLabel: tierLabels[tier] || `T${tier}`,
      nextTierLabel: nextTarget == null ? '封顶' : tierLabels[tier + 1] || `T${tier + 1}`,
      nextTarget,
      remaining,
      active: progress > 0,
      effectSummary: effectByTier[tier] || effectByTier[0] || '暂无额外变化。',
      nextEffectSummary: nextTarget == null ? '当前已达到最高阶。' : effectByTier[tier + 1] || '下一阶效果待推演。',
      weightShift: {
        ...weightShift
      }
    };
  }
  getStrategicEngineeringSnapshot() {
    const state = this.ensureStrategicEngineeringState();
    const allTracks = Object.keys(this.getStrategicEngineeringCatalog()).map(id => this.getStrategicEngineeringTrackSnapshot(id, state)).filter(Boolean).sort((a, b) => {
      if (b.tier !== a.tier) return b.tier - a.tier;
      if (b.progress !== a.progress) return b.progress - a.progress;
      return String(a.trackId || '').localeCompare(String(b.trackId || ''));
    });
    const activeTracks = allTracks.filter(entry => entry.active);
    const focusTrack = activeTracks.find(entry => entry.trackId === state.lastAdvancedTrackId) || activeTracks[0] || null;
    const sideTracks = focusTrack ? activeTracks.filter(entry => entry.trackId !== focusTrack.trackId).slice(0, 2) : [];
    const summary = focusTrack ? `${focusTrack.icon} ${focusTrack.name} ${focusTrack.tierLabel} · ${focusTrack.effectSummary}${focusTrack.nextTarget != null ? ` · 距${focusTrack.nextTierLabel}还需 ${focusTrack.remaining} 次${focusTrack.nodeLabel}` : ' · 已达当前最高工事阶'}` : '尚未形成跨章工程，优先在观星、禁术、裂隙或灵契节点里选出一条主轴。';
    const posture = focusTrack ? `主轴 ${focusTrack.name} ${focusTrack.tierLabel}${sideTracks.length > 0 ? ` · 副轴 ${sideTracks.map(entry => `${entry.name} ${entry.tierLabel}`).join(' / ')}` : ''}` : '当前还没有明确的跨章工程主轴。';
    return {
      focusTrack,
      activeTracks,
      allTracks,
      lastAdvancedTrackId: state.lastAdvancedTrackId || '',
      history: Array.isArray(state.history) ? state.history.slice() : [],
      summary,
      posture
    };
  }
  getStrategicEngineeringWeightShift() {
    const snapshot = this.getStrategicEngineeringSnapshot();
    const merged = {};
    snapshot.activeTracks.forEach(track => {
      Object.keys(track.weightShift || {}).forEach(key => {
        const delta = Number(track.weightShift[key]);
        if (!Number.isFinite(delta)) return;
        merged[key] = (merged[key] || 0) + delta;
      });
    });
    return merged;
  }
  createDefaultHeavenlyMandateState() {
    return {
      version: 1,
      weekTag: '',
      weekLabel: '',
      themeId: '',
      themeLabel: '',
      themeIcon: '',
      themeKicker: '',
      summaryLine: '',
      lanes: [],
      completedTaskCount: 0,
      totalTaskCount: 0,
      history: [],
      lastSyncedAt: 0
    };
  }
  normalizeHeavenlyMandateTask(source = null, index = 0, laneId = 'expedition') {
    const root = source && typeof source === 'object' ? source : {};
    const safeTarget = Math.max(1, Math.floor(Number(root.target) || 1));
    const rawProgress = Math.max(0, Math.floor(Number(root.progress) || 0));
    const completed = !!root.completed || rawProgress >= safeTarget;
    const progress = Math.min(Math.max(rawProgress, completed ? safeTarget : 0), safeTarget);
    const fallbackId = `${laneId}_task_${index + 1}`;
    const fallbackLabel = `敕令任务 ${index + 1}`;
    const progressText = String(root.progressText || `${progress}/${safeTarget}`).trim().slice(0, 80) || `${progress}/${safeTarget}`;
    const anchorSection = String(root.anchorSection || root.section || '').trim().slice(0, 24);
    const actionMeta = typeof this.getSeasonVerificationActionMeta === 'function' ? this.getSeasonVerificationActionMeta(anchorSection || '', {
      fallbackSection: 'sanctum'
    }) : {
      actionType: 'collection',
      actionValue: anchorSection || 'sanctum',
      ctaLabel: '前往推进'
    };
    const fallbackCtaLabel = actionMeta.ctaLabel === '沿此复核' ? completed ? '沿此复核' : '前往推进' : actionMeta.ctaLabel || (completed ? '沿此复核' : '前往推进');
    return {
      id: String(root.id || fallbackId).trim().slice(0, 64) || fallbackId,
      label: String(root.label || fallbackLabel).trim().slice(0, 80) || fallbackLabel,
      icon: String(root.icon || '✦').trim().slice(0, 4) || '✦',
      progress,
      target: safeTarget,
      completed,
      progressText,
      hintLine: String(root.hintLine || root.noteLine || '').trim().slice(0, 220),
      statusLine: String(root.statusLine || '').trim().slice(0, 180),
      anchorSection,
      actionType: String(root.actionType || actionMeta.actionType || '').trim().slice(0, 24) || actionMeta.actionType,
      actionValue: String(root.actionValue || actionMeta.actionValue || '').trim().slice(0, 40) || actionMeta.actionValue,
      ctaLabel: String(root.ctaLabel || fallbackCtaLabel).trim().slice(0, 24) || fallbackCtaLabel,
      source: String(root.source || root.sourceType || '').trim().slice(0, 40),
      sourceId: String(root.sourceId || '').trim().slice(0, 96),
      isPlaceholder: !!root.isPlaceholder,
      occupiesStrongSlot: !!root.occupiesStrongSlot
    };
  }
  normalizeHeavenlyMandateFocusTask(source = null) {
    const root = source && typeof source === 'object' ? source : null;
    if (!root) return null;
    const baseTask = this.normalizeHeavenlyMandateTask(root, 0, 'focus');
    if (!baseTask) return null;
    const next = {
      ...baseTask,
      progressText: String(root.progressText || baseTask.progressText || '').trim().slice(0, 80) || baseTask.progressText,
      actionType: String(root.actionType || baseTask.actionType || '').trim().slice(0, 24) || baseTask.actionType,
      actionValue: String(root.actionValue || baseTask.actionValue || '').trim().slice(0, 40) || baseTask.actionValue,
      ctaLabel: String(root.ctaLabel || baseTask.ctaLabel || '').trim().slice(0, 24) || baseTask.ctaLabel,
      source: String(root.source || root.sourceType || '').trim().slice(0, 40),
      sourceId: String(root.sourceId || '').trim().slice(0, 96),
      isPlaceholder: !!root.isPlaceholder,
      occupiesStrongSlot: !!root.occupiesStrongSlot
    };
    return Object.values(next).some(value => value !== '' && value !== 0 && value !== false) ? next : null;
  }
  buildHeavenlyMandateDebtFocusTask(debtPack = null) {
    const safeDebtPack = debtPack && typeof debtPack === 'object' ? debtPack : null;
    if (!safeDebtPack || !safeDebtPack.occupiesStrongSlot) return null;
    return this.normalizeHeavenlyMandateFocusTask({
      id: safeDebtPack.occupiedMandateTaskId || `season_debt_focus_${safeDebtPack.id || 'current'}`,
      label: safeDebtPack.status === 'deferred' ? '优先清掉跨周欠卷' : '优先清掉本周欠卷',
      icon: '📚',
      progress: 0,
      target: 1,
      progressText: safeDebtPack.status === 'deferred' ? `已拖延 ${Math.max(1, Math.floor(Number(safeDebtPack.deferCount) || 1))} 周` : safeDebtPack.progressText || safeDebtPack.settleWindowText || '本周内优先清账',
      completed: false,
      hintLine: safeDebtPack.guideLine || safeDebtPack.detailLine || safeDebtPack.summaryLine || '先清账，再继续本周的定榜节奏。',
      statusLine: [safeDebtPack.statusLine || '', safeDebtPack.status === 'deferred' && safeDebtPack.carryIntoWeekTag ? `已带入 ${safeDebtPack.carryIntoWeekTag}` : ''].filter(Boolean).join(' · '),
      anchorSection: safeDebtPack.recommendedAnchorSection || 'sanctum',
      source: 'seasonDebtPack',
      sourceId: safeDebtPack.id || '',
      isPlaceholder: false,
      occupiesStrongSlot: true
    });
  }
  normalizeHeavenlyMandateLane(source = null, index = 0) {
    const root = source && typeof source === 'object' ? source : {};
    const laneId = String(root.id || `lane_${index + 1}`).trim().slice(0, 32) || `lane_${index + 1}`;
    const tasks = Array.isArray(root.tasks) ? root.tasks.map((task, taskIndex) => this.normalizeHeavenlyMandateTask(task, taskIndex, laneId)).slice(0, 4) : [];
    return {
      id: laneId,
      label: String(root.label || `玩法线 ${index + 1}`).trim().slice(0, 32) || `玩法线 ${index + 1}`,
      icon: String(root.icon || '✦').trim().slice(0, 4) || '✦',
      summaryLine: String(root.summaryLine || root.noteLine || '').trim().slice(0, 200),
      completedCount: tasks.filter(task => task.completed).length,
      totalCount: tasks.length,
      tasks
    };
  }
  normalizeHeavenlyMandateHistoryEntry(source = null, index = 0) {
    const root = source && typeof source === 'object' ? source : {};
    const fallbackWeekTag = `week_${index + 1}`;
    const completedTaskCount = Math.max(0, Math.floor(Number(root.completedTaskCount) || 0));
    const totalTaskCount = Math.max(completedTaskCount, Math.floor(Number(root.totalTaskCount) || 0));
    return {
      weekTag: String(root.weekTag || fallbackWeekTag).trim().slice(0, 24) || fallbackWeekTag,
      weekLabel: String(root.weekLabel || '').trim().slice(0, 32),
      themeId: String(root.themeId || '').trim().slice(0, 32),
      themeLabel: String(root.themeLabel || '').trim().slice(0, 48),
      summaryLine: String(root.summaryLine || '').trim().slice(0, 180),
      completedTaskCount,
      totalTaskCount,
      completed: !!root.completed || totalTaskCount > 0 && completedTaskCount >= totalTaskCount,
      at: Math.max(0, Math.floor(Number(root.at ?? root.lastSyncedAt) || 0))
    };
  }
  normalizeHeavenlyMandateState(source = null) {
    const defaults = this.createDefaultHeavenlyMandateState();
    const root = source && typeof source === 'object' ? source : {};
    const lanes = Array.isArray(root.lanes) ? root.lanes.map((lane, index) => this.normalizeHeavenlyMandateLane(lane, index)).slice(0, 3) : [];
    const completedTaskCount = lanes.reduce((sum, lane) => sum + lane.completedCount, 0);
    const totalTaskCount = lanes.reduce((sum, lane) => sum + lane.totalCount, 0);
    const history = Array.isArray(root.history) ? root.history.map((entry, index) => this.normalizeHeavenlyMandateHistoryEntry(entry, index)).filter(entry => entry.weekTag).slice(0, 6) : [];
    return {
      version: Math.max(1, Math.floor(Number(root.version) || defaults.version)),
      weekTag: String(root.weekTag || '').trim().slice(0, 24),
      weekLabel: String(root.weekLabel || '').trim().slice(0, 32),
      themeId: String(root.themeId || '').trim().slice(0, 32),
      themeLabel: String(root.themeLabel || '').trim().slice(0, 48),
      themeIcon: String(root.themeIcon || '').trim().slice(0, 4),
      themeKicker: String(root.themeKicker || '').trim().slice(0, 24),
      summaryLine: String(root.summaryLine || '').trim().slice(0, 220),
      lanes,
      completedTaskCount: Math.max(completedTaskCount, Math.floor(Number(root.completedTaskCount) || 0)),
      totalTaskCount: Math.max(totalTaskCount, Math.floor(Number(root.totalTaskCount) || 0)),
      history,
      lastSyncedAt: Math.max(0, Math.floor(Number(root.lastSyncedAt) || 0))
    };
  }
  ensureHeavenlyMandateState() {
    this.game.heavenlyMandateState = this.normalizeHeavenlyMandateState(this.game.heavenlyMandateState);
    return this.game.heavenlyMandateState;
  }
  createDefaultSeasonVerificationState() {
    return {
      version: 1,
      weekTag: '',
      weekLabel: '',
      records: [],
      history: [],
      lastResolved: null,
      claimedLaneRewards: {}
    };
  }
  normalizeSeasonVerificationRecord(source = null, index = 0) {
    const root = source && typeof source === 'object' ? source : {};
    const sanitizeText = (value = '', limit = 180) => String(value || '').trim().slice(0, limit);
    const role = ['primary', 'side'].includes(String(root.role || '').trim()) ? String(root.role || '').trim() : index === 0 ? 'primary' : 'side';
    const sourceMode = ['pvp', 'endless', 'challenge', 'sanctum', 'hybrid', 'manual'].includes(String(root.sourceMode || '').trim()) ? String(root.sourceMode || '').trim() : ['pvp', 'endless', 'challenge', 'sanctum'].includes(String(root.anchorSection || '').trim()) ? String(root.anchorSection || '').trim() : role === 'side' ? 'challenge' : 'manual';
    const resultStatus = ['verified', 'failed', 'deferred', 'pending'].includes(String(root.resultStatus || '').trim()) ? String(root.resultStatus || '').trim() : 'pending';
    const writebackMode = ['clear_debt', 'upgrade_verdict', 'boost_recommendation', 'degrade', 'carry_forward', 'pending'].includes(String(root.writebackMode || '').trim()) ? String(root.writebackMode || '').trim() : role === 'side' ? 'boost_recommendation' : resultStatus === 'failed' ? 'degrade' : 'upgrade_verdict';
    const proofQuality = ['thin', 'solid', 'decisive'].includes(String(root.proofQuality || '').trim()) ? String(root.proofQuality || '').trim() : resultStatus === 'verified' ? role === 'primary' ? 'solid' : 'thin' : '';
    const sourceModeLabelMap = {
      pvp: '天道榜',
      endless: '无尽轮回',
      challenge: '七日劫数',
      sanctum: '洞府锁线',
      hybrid: '跨模验算',
      manual: role === 'side' ? '旁验证' : '主验证'
    };
    const proofQualityLabelMap = {
      thin: '薄证',
      solid: '实证',
      decisive: '铁证'
    };
    const resultStatusLabelMap = {
      verified: '通过',
      failed: '失利',
      deferred: '延期',
      pending: '待验证'
    };
    const sourceModeLabel = sanitizeText(root.sourceModeLabel || sourceModeLabelMap[sourceMode] || '验证', 32) || sourceModeLabelMap[sourceMode] || '验证';
    const anchorSection = sanitizeText(root.anchorSection || (sourceMode === 'pvp' ? 'pvp' : sourceMode === 'endless' ? 'endless' : sourceMode === 'challenge' ? 'challenge' : 'sanctum'), 24);
    const weekTag = sanitizeText(root.weekTag || root.seasonWeekTag || '', 24);
    const weekLabel = sanitizeText(root.weekLabel || '', 32);
    const createdAt = Math.max(0, Math.floor(Number(root.createdAt || root.updatedAt || root.resolvedAt || Date.now()) || 0));
    const updatedAt = Math.max(createdAt, Math.floor(Number(root.updatedAt || root.resolvedAt || root.createdAt || createdAt) || 0));
    const fallbackId = sanitizeText(root.recordId || root.id || `season_verification_${weekTag || 'current'}_${role}_${sourceMode}_${index + 1}`, 96) || `season_verification_${role}_${index + 1}`;
    const record = {
      recordId: fallbackId,
      recordKind: sanitizeText(root.recordKind || (root.frontierResolutionChoiceId || root.frontierResolutionId ? 'frontier_resolution' : ''), 40),
      weekTag,
      weekLabel,
      role,
      sourceMode,
      sourceModeLabel,
      sourceLabel: sanitizeText(root.sourceLabel || root.sourceName || '', 64),
      label: sanitizeText(root.label || '', 64),
      resultStatus,
      writebackMode,
      phaseId: sanitizeText(root.phaseId || '', 32),
      phaseLabel: sanitizeText(root.phaseLabel || '', 24),
      settlementId: sanitizeText(root.settlementId || '', 96),
      settlementOutcomeId: sanitizeText(root.settlementOutcomeId || '', 32),
      settlementOutcomeLabel: sanitizeText(root.settlementOutcomeLabel || '', 24),
      settlementSource: sanitizeText(root.settlementSource || '', 24),
      ledgerId: sanitizeText(root.ledgerId || root.weekVerdictLedgerId || '', 96),
      debtPackId: sanitizeText(root.debtPackId || '', 96),
      debtStatus: sanitizeText(root.debtStatus || '', 24),
      deferCount: Math.max(0, Math.floor(Number(root.deferCount) || 0)),
      carryIntoWeekTag: sanitizeText(root.carryIntoWeekTag || '', 24),
      writebackLine: sanitizeText(root.writebackLine || '', 220),
      resolvedRunId: sanitizeText(root.resolvedRunId || root.sourceRunId || '', 80),
      chapterIndex: Math.max(0, Math.floor(Number(root.chapterIndex ?? root.boundChapterIndex) || 0)),
      proofQuality,
      lineageStyle: sanitizeText(root.lineageStyle || '', 48),
      summaryLine: sanitizeText(root.summaryLine || '', 220),
      detailLine: sanitizeText(root.detailLine || root.hintLine || '', 240),
      statusLine: sanitizeText(root.statusLine || '', 160),
      anchorSection,
      priority: Math.max(1, Math.min(9, Math.floor(Number(root.priority) || (role === 'primary' ? 1 : 2)))),
      frontierResolutionId: sanitizeText(root.frontierResolutionId || '', 96),
      frontierResolutionChoiceId: sanitizeText(root.frontierResolutionChoiceId || root.resolutionChoiceId || root.choiceId || '', 32),
      frontierResolutionLabel: sanitizeText(root.frontierResolutionLabel || root.choiceLabel || '', 32),
      frontierResolutionStance: sanitizeText(root.frontierResolutionStance || '', 48),
      frontierResolutionSupportLaneId: sanitizeText(root.frontierResolutionSupportLaneId || root.supportLaneId || '', 32),
      frontierResolutionSupportLaneLabel: sanitizeText(root.frontierResolutionSupportLaneLabel || root.supportLaneLabel || '', 24),
      frontierResolutionSummaryLine: sanitizeText(root.frontierResolutionSummaryLine || '', 220),
      chronicleSealStatus: sanitizeText(root.chronicleSealStatus || '', 24),
      chronicleSealLine: sanitizeText(root.chronicleSealLine || '', 220),
      councilResolutionLine: sanitizeText(root.councilResolutionLine || '', 220),
      frontierResolutionSubmittedAt: Math.max(0, Math.floor(Number(root.frontierResolutionSubmittedAt || root.resolutionSubmittedAt || 0) || 0)),
      carryIntoNextWeek: !!root.carryIntoNextWeek,
      createdAt,
      updatedAt
    };
    const defaultLabel = (() => {
      if (record.label) return record.label;
      if (record.sourceMode === 'challenge') return '七日劫数旁证';
      if (record.sourceMode === 'endless') return record.resultStatus === 'failed' ? '无尽反证' : '无尽高压验证';
      if (record.sourceMode === 'pvp') return record.resultStatus === 'failed' ? '天道榜反证' : '天道榜账本验证';
      return role === 'side' ? '赛季旁验证' : '赛季主验证';
    })();
    record.label = sanitizeText(defaultLabel, 64) || defaultLabel;
    if (!record.summaryLine) {
      if (record.resultStatus === 'verified') {
        record.summaryLine = record.role === 'primary' ? `${record.sourceModeLabel}已给本周主轴留下${proofQualityLabelMap[record.proofQuality] || '有效'}证明。` : `${record.sourceModeLabel}补上了一张不同节奏的旁验证。`;
      } else if (record.resultStatus === 'failed') {
        record.summaryLine = `${record.sourceModeLabel}给出了反证，这条主轴暂时不能直接定榜。`;
      } else if (record.resultStatus === 'deferred') {
        record.summaryLine = `${record.sourceModeLabel}尚未形成有效回写，本周先保留为待复核样本。`;
      } else {
        record.summaryLine = `${record.sourceModeLabel}验证状已挂起，等待真正落地后再回写季盘。`;
      }
    }
    if (!record.writebackLine) {
      if (record.writebackMode === 'clear_debt') {
        record.writebackLine = '主验证已清掉欠卷，天命强目标会重新释放给定榜推进。';
      } else if (record.writebackMode === 'upgrade_verdict') {
        record.writebackLine = '主验证通过，本周押卷可以从险卷升级为正卷。';
      } else if (record.writebackMode === 'boost_recommendation') {
        record.writebackLine = '旁验证已补上第二份证明，季盘推荐会更偏向当前主修。';
      } else if (record.writebackMode === 'degrade') {
        record.writebackLine = '主验证给出反证，本周押卷会转入反证/险卷处理。';
      } else if (record.writebackMode === 'carry_forward') {
        record.writebackLine = '这条验证仍未完成，会继续带入后续周转。';
      }
    }
    if (!record.detailLine) {
      record.detailLine = [record.sourceLabel ? `样本：${record.sourceLabel}` : '', record.writebackLine || '', record.lineageStyle ? `谱系偏向：${record.lineageStyle}` : ''].filter(Boolean).slice(0, 2).join('｜');
    }
    if (!record.statusLine) {
      record.statusLine = [role === 'primary' ? '主验证' : '旁验证', record.sourceModeLabel, resultStatusLabelMap[record.resultStatus] || '待验证', proofQualityLabelMap[record.proofQuality] || ''].filter(Boolean).join(' · ');
    }
    return record;
  }
  normalizeSeasonVerificationState(source = null) {
    const defaults = this.createDefaultSeasonVerificationState();
    const root = source && typeof source === 'object' ? source : {};
    const normalizeList = (value, limit = 8) => {
      const seen = new Set();
      return (Array.isArray(value) ? value : []).map((entry, index) => this.normalizeSeasonVerificationRecord(entry, index)).filter(entry => {
        if (!entry.recordId || seen.has(entry.recordId)) return false;
        seen.add(entry.recordId);
        return true;
      }).sort((a, b) => {
        if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
        return b.createdAt - a.createdAt;
      }).slice(0, limit);
    };
    const records = normalizeList(root.records, 6);
    const history = normalizeList([...(Array.isArray(root.history) ? root.history : []), ...(Array.isArray(root.records) ? root.records : [])], 18);
    const lastResolved = root.lastResolved && typeof root.lastResolved === 'object' ? this.normalizeSeasonVerificationRecord(root.lastResolved) : history[0] || null;
    const claimedLaneRewards = typeof this.game.normalizeSeasonBoardClaimedLaneRewards === 'function' ? this.game.normalizeSeasonBoardClaimedLaneRewards(root.claimedLaneRewards) : {};
    return {
      version: Math.max(1, Math.floor(Number(root.version) || defaults.version)),
      weekTag: String(root.weekTag || '').trim().slice(0, 24),
      weekLabel: String(root.weekLabel || '').trim().slice(0, 32),
      records,
      history,
      lastResolved: lastResolved && lastResolved.recordId ? lastResolved : null,
      claimedLaneRewards
    };
  }
  ensureSeasonVerificationState(options = {}) {
    const state = this.normalizeSeasonVerificationState(this.game.seasonVerificationState);
    const weekMeta = options.weekTag || options.weekLabel ? {
      weekTag: String(options.weekTag || '').trim(),
      weekLabel: String(options.weekLabel || '').trim()
    } : typeof this.getHeavenlyMandateWeekMeta === 'function' ? this.getHeavenlyMandateWeekMeta(options.dateOverride || null) : null;
    const targetWeekTag = String(weekMeta?.weekTag || state.weekTag || '').trim();
    const targetWeekLabel = String(weekMeta?.weekLabel || state.weekLabel || '').trim();
    let records = Array.isArray(state.records) ? state.records.slice() : [];
    let history = Array.isArray(state.history) ? state.history.slice() : [];
    if (targetWeekTag) {
      const carryRecords = [];
      const nextRecords = [];
      records.forEach(entry => {
        if (entry && entry.weekTag && entry.weekTag !== targetWeekTag) {
          carryRecords.push(entry);
        } else if (entry) {
          nextRecords.push(entry);
        }
      });
      carryRecords.forEach(entry => {
        const exists = history.findIndex(item => item.recordId === entry.recordId);
        if (exists >= 0) history.splice(exists, 1);
        history.unshift(entry);
      });
      history = history.slice(0, 18);
      records = nextRecords.slice(0, 6);
    }
    this.game.seasonVerificationState = this.normalizeSeasonVerificationState({
      ...state,
      weekTag: targetWeekTag || state.weekTag,
      weekLabel: targetWeekLabel || state.weekLabel,
      records,
      history
    });
    return this.game.seasonVerificationState;
  }
  getSeasonVerificationSaveState() {
    return this.ensureSeasonVerificationState();
  }
  recordSeasonVerificationResult(source = null) {
    const root = source && typeof source === 'object' ? source : null;
    if (!root) return null;
    const effectiveAt = Math.max(0, Math.floor(Number(root.updatedAt || root.createdAt || root.resolvedAt || Date.now()) || 0));
    const weekMeta = root.weekTag || root.weekLabel ? {
      weekTag: String(root.weekTag || '').trim(),
      weekLabel: String(root.weekLabel || '').trim()
    } : typeof this.getHeavenlyMandateWeekMeta === 'function' ? this.getHeavenlyMandateWeekMeta(effectiveAt || null) : null;
    const state = this.ensureSeasonVerificationState({
      weekTag: weekMeta?.weekTag || '',
      weekLabel: weekMeta?.weekLabel || '',
      dateOverride: effectiveAt || null
    });
    const boardContext = root.seasonBoard && typeof root.seasonBoard === 'object' ? root.seasonBoard : typeof this.game.getSeasonBoardSnapshot === 'function' ? this.game.getSeasonBoardSnapshot() : null;
    const boardSettlement = boardContext?.settlement && typeof boardContext.settlement === 'object' ? boardContext.settlement : null;
    const boardDebtPack = boardContext?.debtPack && typeof boardContext.debtPack === 'object' ? boardContext.debtPack : null;
    const boardWeekVerdict = boardContext?.weekVerdictLedger?.current && typeof boardContext.weekVerdictLedger.current === 'object' ? boardContext.weekVerdictLedger.current : null;
    const record = this.normalizeSeasonVerificationRecord({
      ...root,
      weekTag: String(root.weekTag || weekMeta?.weekTag || state.weekTag || '').trim(),
      weekLabel: String(root.weekLabel || weekMeta?.weekLabel || state.weekLabel || boardContext?.weekLabel || '').trim(),
      phaseId: String(root.phaseId || boardContext?.phaseId || boardWeekVerdict?.phaseId || '').trim(),
      phaseLabel: String(root.phaseLabel || boardContext?.phaseLabel || boardWeekVerdict?.phaseLabel || '').trim(),
      settlementId: String(root.settlementId || boardSettlement?.id || boardWeekVerdict?.settlementId || '').trim(),
      settlementOutcomeId: String(root.settlementOutcomeId || boardSettlement?.outcomeId || boardWeekVerdict?.settlementOutcomeId || '').trim(),
      settlementOutcomeLabel: String(root.settlementOutcomeLabel || boardSettlement?.outcomeLabel || boardWeekVerdict?.settlementOutcomeLabel || '').trim(),
      settlementSource: String(root.settlementSource || boardSettlement?.settlementSource || boardWeekVerdict?.settlementSource || '').trim(),
      ledgerId: String(root.ledgerId || boardWeekVerdict?.ledgerId || '').trim(),
      debtPackId: String(root.debtPackId || boardDebtPack?.id || boardWeekVerdict?.debtPackId || '').trim(),
      debtStatus: String(root.debtStatus || boardDebtPack?.status || boardWeekVerdict?.debtStatus || '').trim(),
      deferCount: Math.max(0, Math.floor(Number(root.deferCount ?? boardDebtPack?.deferCount ?? boardWeekVerdict?.deferCount ?? 0) || 0)),
      carryIntoWeekTag: String(root.carryIntoWeekTag || boardDebtPack?.carryIntoWeekTag || boardWeekVerdict?.carryIntoWeekTag || '').trim(),
      carryIntoNextWeek: root.carryIntoNextWeek !== undefined ? !!root.carryIntoNextWeek : !!boardDebtPack?.carryIntoWeekTag || !!boardWeekVerdict?.carryIntoNextWeek,
      updatedAt: effectiveAt || Date.now(),
      createdAt: Math.max(0, Math.floor(Number(root.createdAt || effectiveAt || Date.now()) || 0))
    });
    if (!record.recordId) return null;
    let records = Array.isArray(state.records) ? state.records.slice() : [];
    const existingIndex = records.findIndex(entry => entry.recordId === record.recordId || entry.weekTag === record.weekTag && entry.role === record.role && entry.sourceMode === record.sourceMode);
    if (existingIndex >= 0) records.splice(existingIndex, 1);
    records.unshift(record);
    records = records.sort((a, b) => {
      if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
      return b.createdAt - a.createdAt;
    }).slice(0, 6);
    let history = Array.isArray(state.history) ? state.history.slice() : [];
    const historyIndex = history.findIndex(entry => entry.recordId === record.recordId);
    if (historyIndex >= 0) history.splice(historyIndex, 1);
    history.unshift(record);
    history = history.slice(0, 18);
    const nextState = this.normalizeSeasonVerificationState({
      ...state,
      weekTag: record.weekTag || state.weekTag,
      weekLabel: record.weekLabel || state.weekLabel,
      records,
      history,
      lastResolved: ['verified', 'failed', 'deferred'].includes(record.resultStatus) ? record : state.lastResolved
    });
    this.game.seasonVerificationState = nextState;
    const resolvedBoardContext = root.seasonBoardAfter && typeof root.seasonBoardAfter === 'object' ? root.seasonBoardAfter : typeof this.game.getSeasonBoardSnapshot === 'function' ? this.game.getSeasonBoardSnapshot() : null;
    const resolvedSettlement = resolvedBoardContext?.settlement && typeof resolvedBoardContext.settlement === 'object' ? resolvedBoardContext.settlement : null;
    const resolvedDebtPack = resolvedBoardContext?.debtPack && typeof resolvedBoardContext.debtPack === 'object' ? resolvedBoardContext.debtPack : null;
    const resolvedWeekVerdict = resolvedBoardContext?.weekVerdictLedger?.current && typeof resolvedBoardContext.weekVerdictLedger.current === 'object' ? resolvedBoardContext.weekVerdictLedger.current : null;
    const enrichedRecord = this.normalizeSeasonVerificationRecord({
      ...record,
      phaseId: String(root.phaseId || resolvedBoardContext?.phaseId || record.phaseId || resolvedWeekVerdict?.phaseId || '').trim(),
      phaseLabel: String(root.phaseLabel || resolvedBoardContext?.phaseLabel || record.phaseLabel || resolvedWeekVerdict?.phaseLabel || '').trim(),
      settlementId: String(root.settlementId || resolvedSettlement?.id || record.settlementId || resolvedWeekVerdict?.settlementId || '').trim(),
      settlementOutcomeId: String(root.settlementOutcomeId || resolvedSettlement?.outcomeId || record.settlementOutcomeId || resolvedWeekVerdict?.settlementOutcomeId || '').trim(),
      settlementOutcomeLabel: String(root.settlementOutcomeLabel || resolvedSettlement?.outcomeLabel || record.settlementOutcomeLabel || resolvedWeekVerdict?.settlementOutcomeLabel || '').trim(),
      settlementSource: String(root.settlementSource || resolvedSettlement?.settlementSource || record.settlementSource || resolvedWeekVerdict?.settlementSource || '').trim(),
      ledgerId: String(root.ledgerId || resolvedWeekVerdict?.ledgerId || record.ledgerId || '').trim(),
      debtPackId: String(root.debtPackId || resolvedDebtPack?.id || record.debtPackId || resolvedWeekVerdict?.debtPackId || '').trim(),
      debtStatus: String(root.debtStatus || resolvedDebtPack?.status || record.debtStatus || resolvedWeekVerdict?.debtStatus || '').trim(),
      deferCount: Math.max(0, Math.floor(Number(root.deferCount ?? resolvedDebtPack?.deferCount ?? record.deferCount ?? resolvedWeekVerdict?.deferCount ?? 0) || 0)),
      carryIntoWeekTag: String(root.carryIntoWeekTag || resolvedDebtPack?.carryIntoWeekTag || record.carryIntoWeekTag || resolvedWeekVerdict?.carryIntoWeekTag || '').trim(),
      carryIntoNextWeek: root.carryIntoNextWeek !== undefined ? !!root.carryIntoNextWeek : !!record.carryIntoNextWeek || !!resolvedDebtPack?.carryIntoWeekTag || !!resolvedWeekVerdict?.carryIntoNextWeek
    });
    const rewriteList = (sourceList = []) => sourceList.map(entry => entry && entry.recordId === enrichedRecord.recordId ? enrichedRecord : entry);
    this.game.seasonVerificationState = this.normalizeSeasonVerificationState({
      ...nextState,
      records: rewriteList(nextState.records),
      history: rewriteList(nextState.history),
      lastResolved: nextState.lastResolved?.recordId === enrichedRecord.recordId ? enrichedRecord : nextState.lastResolved
    });
    return enrichedRecord;
  }
  getSeasonVerificationSnapshot(options = {}) {
    const weekMeta = options.weekTag || options.weekLabel ? {
      weekTag: String(options.weekTag || '').trim(),
      weekLabel: String(options.weekLabel || '').trim()
    } : typeof this.getHeavenlyMandateWeekMeta === 'function' ? this.getHeavenlyMandateWeekMeta(options.dateOverride || null) : null;
    const state = this.ensureSeasonVerificationState({
      weekTag: weekMeta?.weekTag || '',
      weekLabel: weekMeta?.weekLabel || '',
      dateOverride: options.dateOverride || null
    });
    const weekTag = String(weekMeta?.weekTag || state.weekTag || '').trim();
    const weekLabel = String(weekMeta?.weekLabel || state.weekLabel || '').trim();
    const currentRecords = (Array.isArray(state.records) ? state.records : []).filter(entry => !weekTag || !entry.weekTag || entry.weekTag === weekTag).sort((a, b) => {
      if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
      return b.createdAt - a.createdAt;
    });
    const isFrontierResolutionRecord = entry => String(entry?.recordKind || '').trim() === 'frontier_resolution' || !!entry?.frontierResolutionChoiceId || !!entry?.frontierResolutionId;
    const verificationRecords = currentRecords.filter(entry => !isFrontierResolutionRecord(entry));
    const verificationHistory = (Array.isArray(state.history) ? state.history : []).filter(entry => !isFrontierResolutionRecord(entry));
    const selectLatestRoleRecord = role => verificationRecords.find(entry => entry.role === role) || null;
    const primary = selectLatestRoleRecord('primary');
    const side = selectLatestRoleRecord('side');
    const verifiedCount = verificationRecords.filter(entry => entry.resultStatus === 'verified').length;
    const failedCount = verificationRecords.filter(entry => entry.resultStatus === 'failed').length;
    const pendingCount = verificationRecords.filter(entry => ['pending', 'deferred'].includes(entry.resultStatus)).length;
    const lastResolved = state.lastResolved && typeof state.lastResolved === 'object' ? this.normalizeSeasonVerificationRecord(state.lastResolved) : null;
    const effectiveLastResolved = lastResolved && lastResolved.recordId && !isFrontierResolutionRecord(lastResolved) ? lastResolved : verificationRecords[0] || null;
    return {
      version: state.version,
      available: verificationRecords.length > 0 || verificationHistory.length > 0,
      weekTag,
      weekLabel,
      recordCount: verificationRecords.length,
      verifiedCount,
      failedCount,
      pendingCount,
      primary,
      side,
      records: verificationRecords.slice(0, 4),
      history: verificationHistory.slice(0, 6),
      lastResolved: effectiveLastResolved
    };
  }
  getSeasonVerificationActionMeta(anchorSection = '', options = {}) {
    const normalizedAnchor = String(anchorSection || '').trim();
    const collectionTargetLabelMap = {
      laws: '法则图鉴',
      spirits: '灵契图鉴',
      chapters: '章节档案',
      enemies: '敌影档案',
      bosses: 'Boss 档案',
      builds: '构筑快照',
      slates: '归卷书架',
      sanctum: '洞府'
    };
    const collectionAction = (value, ctaLabel) => ({
      actionType: 'collection',
      actionValue: String(value || 'sanctum').trim() || 'sanctum',
      ctaLabel,
      targetLabel: collectionTargetLabelMap[String(value || '').trim()] || '当前主线'
    });
    switch (normalizedAnchor) {
      case 'challenge':
        return {
          actionType: 'challenge',
          actionValue: 'weekly',
          ctaLabel: '前往周挑战',
          targetLabel: '周挑战'
        };
      case 'pvp':
        return {
          actionType: 'screen',
          actionValue: 'pvp-screen',
          ctaLabel: '前往天道榜',
          targetLabel: '天道榜'
        };
      case 'endless':
        return {
          actionType: 'screen',
          actionValue: 'map-screen',
          ctaLabel: '重返无尽',
          targetLabel: '无尽轮回'
        };
      case 'map':
        return {
          actionType: 'screen',
          actionValue: 'map-screen',
          ctaLabel: '返回地图',
          targetLabel: '地图'
        };
      case 'builds':
        return collectionAction('builds', '查看谱系');
      case 'slates':
        return collectionAction('slates', '查看归卷');
      case 'chapters':
        return collectionAction('chapters', '查看章节');
      case 'sanctum':
        return collectionAction('sanctum', '回看洞府');
      default:
        return collectionAction(normalizedAnchor || 'sanctum', '沿此复核');
    }
  }
  normalizeSeasonVerificationArchiveEntry(source = null, index = 0) {
    const root = source && typeof source === 'object' ? source : {};
    const resultStatus = String(root.resultStatus || '').trim();
    const actionMeta = this.getSeasonVerificationActionMeta(root.anchorSection || root.actionValue || '', root);
    const role = ['primary', 'side'].includes(String(root.role || '').trim()) ? String(root.role || '').trim() : index === 0 ? 'primary' : 'side';
    const roleLabelMap = {
      primary: '主验证',
      side: '旁验证'
    };
    const resultLabelMap = {
      verified: '通过',
      failed: '失利',
      deferred: '延期',
      pending: '待验证'
    };
    const writebackLabelMap = {
      clear_debt: '清账回写',
      upgrade_verdict: '正卷回写',
      boost_recommendation: '旁证强化',
      degrade: '反证回写',
      carry_forward: '延账顺延',
      pending: '待回写'
    };
    return {
      recordId: String(root.recordId || root.id || `season_verification_archive_${index + 1}`).trim().slice(0, 96) || `season_verification_archive_${index + 1}`,
      weekTag: String(root.weekTag || '').trim().slice(0, 24),
      weekLabel: String(root.weekLabel || '').trim().slice(0, 32),
      role,
      roleLabel: String(root.roleLabel || roleLabelMap[role] || '验证').trim().slice(0, 16) || '验证',
      sourceMode: String(root.sourceMode || '').trim().slice(0, 24),
      sourceModeLabel: String(root.sourceModeLabel || root.sourceLabel || '').trim().slice(0, 40),
      resultStatus,
      resultLabel: String(root.resultLabel || resultLabelMap[resultStatus] || '待验证').trim().slice(0, 16) || '待验证',
      writebackMode: String(root.writebackMode || '').trim().slice(0, 32),
      writebackLabel: String(root.writebackLabel || writebackLabelMap[String(root.writebackMode || '').trim()] || '').trim().slice(0, 20),
      phaseId: String(root.phaseId || '').trim().slice(0, 32),
      phaseLabel: String(root.phaseLabel || '').trim().slice(0, 24),
      settlementId: String(root.settlementId || '').trim().slice(0, 96),
      settlementOutcomeId: String(root.settlementOutcomeId || '').trim().slice(0, 32),
      settlementOutcomeLabel: String(root.settlementOutcomeLabel || '').trim().slice(0, 24),
      settlementSource: String(root.settlementSource || '').trim().slice(0, 24),
      ledgerId: String(root.ledgerId || '').trim().slice(0, 96),
      debtPackId: String(root.debtPackId || '').trim().slice(0, 96),
      debtStatus: String(root.debtStatus || '').trim().slice(0, 24),
      deferCount: Math.max(0, Math.floor(Number(root.deferCount) || 0)),
      carryIntoWeekTag: String(root.carryIntoWeekTag || '').trim().slice(0, 24),
      carryIntoNextWeek: !!root.carryIntoNextWeek,
      summaryLine: String(root.summaryLine || '').trim().slice(0, 220),
      detailLine: String(root.detailLine || '').trim().slice(0, 240),
      writebackLine: String(root.writebackLine || '').trim().slice(0, 220),
      statusLine: String(root.statusLine || '').trim().slice(0, 160),
      noteLine: String(root.noteLine || '').trim().slice(0, 260),
      kicker: String(root.kicker || '').trim().slice(0, 120),
      tagLine: String(root.tagLine || '').trim().slice(0, 120),
      lineageStyle: String(root.lineageStyle || '').trim().slice(0, 48),
      chapterIndex: Math.max(0, Math.floor(Number(root.chapterIndex) || 0)),
      anchorSection: String(root.anchorSection || '').trim().slice(0, 24),
      actionType: actionMeta.actionType,
      actionValue: actionMeta.actionValue,
      ctaLabel: String(root.ctaLabel || actionMeta.ctaLabel || '沿此复核').trim().slice(0, 24) || '沿此复核',
      createdAt: Math.max(0, Math.floor(Number(root.createdAt) || 0)),
      updatedAt: Math.max(Math.floor(Number(root.createdAt) || 0), Math.floor(Number(root.updatedAt || root.createdAt) || 0))
    };
  }
  normalizeSeasonVerificationArchiveSnapshot(source = null) {
    const root = source && typeof source === 'object' ? source : {};
    const entries = (Array.isArray(root.entries) ? root.entries : []).map((entry, index) => this.normalizeSeasonVerificationArchiveEntry(entry, index)).filter(entry => !!entry.recordId).sort((a, b) => {
      if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
      return b.createdAt - a.createdAt;
    }).slice(0, 8);
    const statusCounts = entries.reduce((acc, entry) => {
      const key = ['verified', 'failed', 'deferred', 'pending'].includes(entry.resultStatus) ? entry.resultStatus : 'pending';
      acc[key] += 1;
      return acc;
    }, {
      verified: 0,
      failed: 0,
      deferred: 0,
      pending: 0
    });
    const latestEntry = entries[0] || null;
    return {
      available: !!root.available || entries.length > 0 || !!latestEntry,
      weekTag: String(root.weekTag || latestEntry?.weekTag || '').trim().slice(0, 24),
      weekLabel: String(root.weekLabel || latestEntry?.weekLabel || '').trim().slice(0, 32),
      totalRecords: Math.max(entries.length, Math.floor(Number(root.totalRecords) || 0)),
      verifiedCount: Math.max(statusCounts.verified, Math.floor(Number(root.verifiedCount) || 0)),
      failedCount: Math.max(statusCounts.failed, Math.floor(Number(root.failedCount) || 0)),
      deferredCount: Math.max(statusCounts.deferred, Math.floor(Number(root.deferredCount) || 0)),
      pendingCount: Math.max(statusCounts.pending, Math.floor(Number(root.pendingCount) || 0)),
      summaryLine: String(root.summaryLine || '').trim().slice(0, 220),
      detailLine: String(root.detailLine || '').trim().slice(0, 240),
      progressText: String(root.progressText || '').trim().slice(0, 48),
      latestEntry,
      entries
    };
  }
  buildSeasonVerificationArchiveSnapshot(options = {}) {
    const seasonVerification = options.seasonVerification && typeof options.seasonVerification === 'object' ? options.seasonVerification : this.getSeasonVerificationSnapshot(options);
    const phase = options.phase && typeof options.phase === 'object' ? options.phase : null;
    const settlement = options.settlement && typeof options.settlement === 'object' ? options.settlement : null;
    const debtPack = options.debtPack && typeof options.debtPack === 'object' ? options.debtPack : null;
    const weekVerdictCurrent = options.weekVerdictLedger?.current && typeof options.weekVerdictLedger.current === 'object' ? options.weekVerdictLedger.current : null;
    const currentWeekTag = String(options.weekTag || seasonVerification?.weekTag || weekVerdictCurrent?.weekTag || '').trim();
    const currentWeekLabel = String(options.weekLabel || seasonVerification?.weekLabel || weekVerdictCurrent?.weekLabel || '').trim();
    const resultLabelMap = {
      verified: '通过',
      failed: '失利',
      deferred: '延期',
      pending: '待验证'
    };
    const isFrontierResolutionRecord = entry => String(entry?.recordKind || '').trim() === 'frontier_resolution' || !!entry?.frontierResolutionChoiceId || !!entry?.frontierResolutionId;
    const source = Array.isArray(seasonVerification?.history) ? seasonVerification.history : [];
    const entries = source.filter(rawEntry => !isFrontierResolutionRecord(rawEntry)).map((rawEntry, index) => {
      const record = this.normalizeSeasonVerificationRecord(rawEntry, index);
      const matchesCurrentWeek = !!currentWeekTag && String(record.weekTag || '').trim() === currentWeekTag;
      const effectivePhaseId = String(record.phaseId || (matchesCurrentWeek ? phase?.id : '') || '').trim();
      const effectivePhaseLabel = String(record.phaseLabel || (matchesCurrentWeek ? phase?.label : '') || '').trim();
      const effectiveSettlementId = String(record.settlementId || (matchesCurrentWeek ? settlement?.id : '') || '').trim();
      const effectiveSettlementOutcomeId = String(record.settlementOutcomeId || (matchesCurrentWeek ? settlement?.outcomeId : '') || (matchesCurrentWeek ? weekVerdictCurrent?.settlementOutcomeId : '') || '').trim();
      const effectiveSettlementOutcomeLabel = String(record.settlementOutcomeLabel || (matchesCurrentWeek ? settlement?.outcomeLabel : '') || (matchesCurrentWeek ? weekVerdictCurrent?.settlementOutcomeLabel : '') || '').trim();
      const effectiveSettlementSource = String(record.settlementSource || (matchesCurrentWeek ? settlement?.settlementSource : '') || (matchesCurrentWeek ? weekVerdictCurrent?.settlementSource : '') || '').trim();
      const effectiveLedgerId = String(record.ledgerId || (matchesCurrentWeek ? weekVerdictCurrent?.ledgerId : '') || '').trim();
      const effectiveDebtPackId = String(record.debtPackId || (matchesCurrentWeek ? debtPack?.id : '') || '').trim();
      const effectiveDebtStatus = String(record.debtStatus || (matchesCurrentWeek ? debtPack?.status : '') || (matchesCurrentWeek ? weekVerdictCurrent?.debtStatus : '') || '').trim();
      const effectiveDeferCount = Math.max(Math.floor(Number(record.deferCount) || 0), matchesCurrentWeek ? Math.floor(Number(debtPack?.deferCount || weekVerdictCurrent?.deferCount) || 0) : 0);
      const effectiveCarryIntoWeekTag = String(record.carryIntoWeekTag || (matchesCurrentWeek ? debtPack?.carryIntoWeekTag : '') || (matchesCurrentWeek ? weekVerdictCurrent?.carryIntoWeekTag : '') || '').trim();
      const kicker = [record.weekLabel || record.weekTag || currentWeekLabel || '本周轮转', effectivePhaseLabel || '', record.role === 'primary' ? '主验证' : '旁验证', effectiveSettlementOutcomeLabel || resultLabelMap[record.resultStatus] || ''].filter(Boolean).slice(0, 3).join(' · ');
      const noteLine = [record.summaryLine || '', record.writebackLine || record.detailLine || '', effectiveCarryIntoWeekTag ? `转入 ${effectiveCarryIntoWeekTag}` : '', effectiveDeferCount > 0 ? `拖延 ${effectiveDeferCount} 周` : ''].filter(Boolean).slice(0, 2).join('｜');
      const tagLine = [record.sourceModeLabel || '', effectivePhaseLabel || '', record.lineageStyle || ''].filter(Boolean).slice(0, 3).join(' · ');
      return this.normalizeSeasonVerificationArchiveEntry({
        ...record,
        weekTag: record.weekTag || currentWeekTag,
        weekLabel: record.weekLabel || currentWeekLabel,
        phaseId: effectivePhaseId,
        phaseLabel: effectivePhaseLabel,
        settlementId: effectiveSettlementId,
        settlementOutcomeId: effectiveSettlementOutcomeId,
        settlementOutcomeLabel: effectiveSettlementOutcomeLabel,
        settlementSource: effectiveSettlementSource,
        ledgerId: effectiveLedgerId,
        debtPackId: effectiveDebtPackId,
        debtStatus: effectiveDebtStatus,
        deferCount: effectiveDeferCount,
        carryIntoWeekTag: effectiveCarryIntoWeekTag,
        kicker,
        noteLine,
        tagLine
      }, index);
    }).filter(entry => !!entry.recordId);
    const latestEntry = entries[0] || null;
    const verifiedCount = entries.filter(entry => entry.resultStatus === 'verified').length;
    const failedCount = entries.filter(entry => entry.resultStatus === 'failed').length;
    const deferredCount = entries.filter(entry => entry.resultStatus === 'deferred').length;
    const pendingCount = entries.filter(entry => entry.resultStatus === 'pending').length;
    const summaryLine = latestEntry ? `最近一笔周判来自【${latestEntry.sourceModeLabel || latestEntry.roleLabel}】，当前记为${latestEntry.resultLabel}${latestEntry.settlementOutcomeLabel ? ` · ${latestEntry.settlementOutcomeLabel}` : ''}。` : '周判记录会把每周主验证、旁验证与清账回写压成长期归档。';
    const detailLine = latestEntry ? latestEntry.noteLine || latestEntry.detailLine || latestEntry.writebackLine || latestEntry.statusLine || '' : '先打出 1 条真正落档的主验证或旁验证，周判记录才会开始累计。';
    const progressText = entries.length > 0 ? `已归档 ${entries.length} 条` : '等待首条周判';
    return this.normalizeSeasonVerificationArchiveSnapshot({
      available: entries.length > 0 || Array.isArray(seasonVerification?.records) && seasonVerification.records.some(entry => !isFrontierResolutionRecord(entry)),
      weekTag: currentWeekTag,
      weekLabel: currentWeekLabel,
      totalRecords: entries.length,
      verifiedCount,
      failedCount,
      deferredCount,
      pendingCount,
      summaryLine,
      detailLine,
      progressText,
      latestEntry,
      entries
    });
  }
  getSeasonVerificationArchiveSnapshot(options = {}) {
    const seasonBoard = this.game.getSeasonBoardSnapshot(options);
    return this.normalizeSeasonVerificationArchiveSnapshot(seasonBoard?.verificationArchive);
  }
  jumpToSeasonVerificationAnchor(anchorSection = '', options = {}) {
    const normalizedAnchor = String(anchorSection || '').trim();
    if (normalizedAnchor === 'challenge') {
      this.game.showChallengeHub('weekly');
      return true;
    }
    if (normalizedAnchor === 'pvp') {
      if (typeof this.game.showPvpScreen === 'function') this.game.showPvpScreen();
      else this.game.showScreen('pvp-screen');
      return true;
    }
    if (normalizedAnchor === 'endless') {
      if (typeof this.game.isEndlessActive === 'function' && this.game.isEndlessActive()) {
        this.game.showScreen('map-screen');
      } else if (typeof this.game.startEndlessMode === 'function') {
        this.game.startEndlessMode();
      } else {
        this.game.showScreen('map-screen');
      }
      return true;
    }
    if (normalizedAnchor === 'map') {
      this.game.showScreen('map-screen');
      return true;
    }
    this.game.switchCollectionSection(normalizedAnchor || String(options.fallbackSection || 'sanctum').trim() || 'sanctum');
    return true;
  }
  followSeasonVerificationRecord(recordId = '') {
    const archive = this.getSeasonVerificationArchiveSnapshot();
    const targetRecordId = String(recordId || '').trim();
    const entry = archive.entries.find(item => item.recordId === targetRecordId) || archive.latestEntry || null;
    if (!entry) return false;
    return this.jumpToSeasonVerificationAnchor(entry.anchorSection || '', {
      fallbackSection: 'sanctum',
      recordId: entry.recordId
    });
  }
  jumpToHeavenlyMandateAnchor(anchorSection = '', options = {}) {
    return this.jumpToSeasonVerificationAnchor(anchorSection, {
      fallbackSection: String(options.fallbackSection || 'sanctum').trim() || 'sanctum',
      taskId: String(options.taskId || '').trim()
    });
  }
  followHeavenlyMandateTask(taskId = '') {
    const mandate = typeof this.getHeavenlyMandateExpeditionSnapshot === 'function' ? this.getHeavenlyMandateExpeditionSnapshot() : null;
    if (!mandate || typeof mandate !== 'object') return false;
    const tasks = [];
    if (mandate.focusTask && typeof mandate.focusTask === 'object') {
      tasks.push(mandate.focusTask);
    }
    if (Array.isArray(mandate.lanes)) {
      mandate.lanes.forEach(lane => {
        if (!Array.isArray(lane?.tasks)) return;
        lane.tasks.forEach(task => {
          if (task && typeof task === 'object') tasks.push(task);
        });
      });
    }
    const targetTaskId = String(taskId || '').trim();
    const targetTask = tasks.find(entry => entry.id === targetTaskId) || (mandate.focusTask && typeof mandate.focusTask === 'object' ? mandate.focusTask : null) || tasks.find(entry => !entry.completed) || tasks[0] || null;
    if (!targetTask) return false;
    return this.jumpToHeavenlyMandateAnchor(targetTask.anchorSection || targetTask.actionValue || '', {
      fallbackSection: 'sanctum',
      taskId: targetTask.id || ''
    });
  }
  createDefaultFateAftereffectState() {
    return {
      version: 1,
      records: [],
      history: [],
      lastResolved: null
    };
  }
  normalizeFateAftereffectRecord(source = null, index = 0) {
    const root = source && typeof source === 'object' ? source : {};
    const sanitizeText = (value = '', limit = 180) => String(value || '').trim().slice(0, limit);
    const templateId = ['route_bias', 'risk_bias', 'archive_bias'].includes(String(root.templateId || '').trim()) ? String(root.templateId || '').trim() : 'route_bias';
    const outcomeId = ['contract_success', 'contract_miss', 'recovery', 'stabilized'].includes(String(root.outcomeId || '').trim()) ? String(root.outcomeId || '').trim() : 'stabilized';
    const templateLabelMap = {
      route_bias: '路线偏置',
      risk_bias: '敌情偏置',
      archive_bias: '归卷偏置'
    };
    const templateIconMap = {
      route_bias: '🧭',
      risk_bias: '🩸',
      archive_bias: '🪞'
    };
    const outcomeLabelMap = {
      contract_success: '契约兑现',
      contract_miss: '契约未兑现',
      recovery: '残卷回收',
      stabilized: '界痕留痕'
    };
    const fallbackId = `aftereffect_${index + 1}`;
    const record = {
      recordId: sanitizeText(root.recordId || root.id || fallbackId, 80) || fallbackId,
      icon: sanitizeText(root.icon || templateIconMap[templateId] || '🧭', 8) || '🧭',
      name: sanitizeText(root.name || '', 60),
      sourceRunId: sanitizeText(root.sourceRunId || '', 80),
      sourceAgendaId: sanitizeText(root.sourceAgendaId || root.agendaId || '', 40),
      sourceLabel: sanitizeText(root.sourceLabel || '', 80),
      sourceLine: sanitizeText(root.sourceLine || '', 180),
      sourceContractLabel: sanitizeText(root.sourceContractLabel || root.selectedContractLabel || '', 60),
      sourceDecisionLabel: sanitizeText(root.sourceDecisionLabel || root.selectedDecisionLabel || '', 60),
      templateId,
      templateLabel: sanitizeText(root.templateLabel || templateLabelMap[templateId], 40) || templateLabelMap[templateId],
      outcomeId,
      outcomeLabel: sanitizeText(root.outcomeLabel || outcomeLabelMap[outcomeId], 40) || outcomeLabelMap[outcomeId],
      chapterIndex: Math.max(0, Math.floor(Number(root.chapterIndex ?? root.boundChapterIndex) || 0)),
      chapterName: sanitizeText(root.chapterName || root.boundChapterName || '', 60),
      durationChapters: Math.max(1, Math.min(3, Math.floor(Number(root.durationChapters || root.duration || 1)))),
      positiveLine: sanitizeText(root.positiveLine || '', 180),
      negativeLine: sanitizeText(root.negativeLine || '', 180),
      summaryLine: sanitizeText(root.summaryLine || '', 200),
      detailLine: sanitizeText(root.detailLine || '', 220),
      statusHintLine: sanitizeText(root.statusHintLine || '', 160),
      weightShift: this.game.sanitizeSanctumAgendaWeightShift(root.weightShift),
      createdAt: Math.max(0, Math.floor(Number(root.createdAt || root.updatedAt || 0) || 0))
    };
    if (!record.name) {
      record.name = `${record.templateLabel} · ${record.outcomeLabel}`;
    }
    if (!record.sourceLine) {
      record.sourceLine = [record.sourceLabel, record.sourceContractLabel ? `契约「${record.sourceContractLabel}」` : '', !record.sourceContractLabel && record.sourceDecisionLabel ? `处置「${record.sourceDecisionLabel}」` : '', record.chapterName].filter(Boolean).join(' · ');
    }
    if (!record.summaryLine) {
      record.summaryLine = `${record.name}：${record.positiveLine || '已留下跨章后效。'}`;
    }
    if (!record.detailLine) {
      record.detailLine = [record.positiveLine ? `正向：${record.positiveLine}` : '', record.negativeLine ? `代价：${record.negativeLine}` : ''].filter(Boolean).join('｜');
    }
    return record;
  }
  normalizeFateAftereffectState(source = null) {
    const defaults = this.createDefaultFateAftereffectState();
    const root = source && typeof source === 'object' ? source : {};
    const records = Array.isArray(root.records) ? root.records.map((entry, index) => this.normalizeFateAftereffectRecord(entry, index)).filter(entry => entry.recordId).slice(-6) : [];
    const history = Array.isArray(root.history) ? root.history.map((entry, index) => this.normalizeFateAftereffectRecord(entry, index)).filter(entry => entry.recordId).slice(-10) : [];
    const lastResolved = root.lastResolved && typeof root.lastResolved === 'object' ? this.normalizeFateAftereffectRecord(root.lastResolved) : null;
    return {
      version: Math.max(1, Math.floor(Number(root.version) || defaults.version)),
      records,
      history,
      lastResolved: lastResolved && lastResolved.recordId ? lastResolved : null
    };
  }
  ensureFateAftereffectState(options = {}) {
    const pruneExpired = !!options.pruneExpired;
    const state = this.normalizeFateAftereffectState(this.game.fateAftereffectState);
    if (pruneExpired && Array.isArray(state.records) && state.records.length > 0) {
      const currentChapterIndex = this.getFateAftereffectCurrentChapterIndex(options);
      if (currentChapterIndex > 0) {
        const activeRecords = [];
        const expiredMap = new Map((Array.isArray(state.history) ? state.history : []).map(entry => {
          const normalized = this.normalizeFateAftereffectRecord(entry);
          return [normalized.recordId, normalized];
        }));
        state.records.forEach(entry => {
          const runtime = this.getFateAftereffectRuntimeRecord(entry, {
            currentChapterIndex
          });
          if (runtime?.isExpired) {
            expiredMap.set(runtime.recordId, this.normalizeFateAftereffectRecord(runtime));
          } else if (runtime) {
            activeRecords.push(this.normalizeFateAftereffectRecord(runtime));
          }
        });
        state.records = activeRecords.slice(-6);
        state.history = Array.from(expiredMap.values()).slice(-10);
      }
    }
    this.game.fateAftereffectState = state;
    return state;
  }
  getFateAftereffectSaveState() {
    return this.ensureFateAftereffectState({
      pruneExpired: true
    });
  }
  getFateAftereffectCurrentChapterIndex(context = {}) {
    const direct = Math.max(0, Math.floor(Number(context.currentChapterIndex) || 0));
    if (direct > 0) return direct;
    const expeditionState = context.expeditionState && typeof context.expeditionState === 'object' ? context.expeditionState : typeof this.game.getExpeditionState === 'function' ? this.game.getExpeditionState() : null;
    const expeditionChapter = Math.max(0, Math.floor(Number(expeditionState?.chapterIndex) || 0));
    if (expeditionChapter > 0) return expeditionChapter;
    const playerChapter = Math.max(0, Math.floor(Number(this.game.player?.realm) || 0));
    const latestSlate = context.latestSlate && typeof context.latestSlate === 'object' ? context.latestSlate : typeof this.game.getLatestRunSlate === 'function' ? this.game.getLatestRunSlate() : null;
    const slateChapter = Math.max(0, Math.floor(Number(latestSlate?.chapterIndex) || 0));
    if (slateChapter > 0 || playerChapter > 0) return Math.max(slateChapter, playerChapter);
    return 0;
  }
  getFateAftereffectRuntimeRecord(source = null, context = {}) {
    const record = this.normalizeFateAftereffectRecord(source);
    if (!record.recordId) return null;
    const currentChapterIndex = this.getFateAftereffectCurrentChapterIndex(context);
    const activationChapterIndex = Math.max(1, record.chapterIndex + 1);
    let status = 'pending';
    let statusLabel = '待生效';
    let remainingChapters = record.durationChapters;
    if (currentChapterIndex >= activationChapterIndex) {
      const chaptersElapsed = currentChapterIndex - activationChapterIndex;
      remainingChapters = Math.max(0, record.durationChapters - chaptersElapsed);
      if (remainingChapters <= 0) {
        status = 'expired';
        statusLabel = '已收口';
      } else {
        status = 'active';
        statusLabel = '生效中';
      }
    }
    const statusLine = status === 'pending' ? `第 ${activationChapterIndex} 章起生效 · 持续 ${record.durationChapters} 章` : status === 'active' ? `当前生效 · 剩余 ${remainingChapters} 章` : '已完成跨章收口';
    return {
      ...record,
      currentChapterIndex,
      activationChapterIndex,
      remainingChapters,
      status,
      statusLabel,
      statusLine,
      appliesNow: status === 'active',
      isExpired: status === 'expired'
    };
  }
  getFateAftereffectSnapshot(context = {}) {
    const currentChapterIndex = this.getFateAftereffectCurrentChapterIndex(context);
    const state = this.ensureFateAftereffectState({
      pruneExpired: true,
      currentChapterIndex
    });
    const records = Array.isArray(state.records) ? state.records.map(entry => this.getFateAftereffectRuntimeRecord(entry, {
      currentChapterIndex
    })).filter(Boolean).sort((a, b) => {
      const order = {
        active: 0,
        pending: 1,
        expired: 2
      };
      const delta = (order[a.status] ?? 9) - (order[b.status] ?? 9);
      return delta !== 0 ? delta : (b.createdAt || 0) - (a.createdAt || 0);
    }) : [];
    const history = Array.isArray(state.history) ? state.history.map(entry => this.getFateAftereffectRuntimeRecord(entry, {
      currentChapterIndex
    })).filter(Boolean).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)) : [];
    const latestRunId = String(context.latestRunId || '').trim();
    const visibleRecords = latestRunId ? records.filter(entry => entry.sourceRunId === latestRunId) : records;
    const historyRecords = latestRunId ? history.filter(entry => entry.sourceRunId === latestRunId) : history;
    const runtimeLastResolved = state.lastResolved ? this.getFateAftereffectRuntimeRecord(state.lastResolved, {
      currentChapterIndex
    }) : null;
    const lastResolved = latestRunId ? runtimeLastResolved && runtimeLastResolved.sourceRunId === latestRunId ? runtimeLastResolved : historyRecords[0] || null : runtimeLastResolved;
    const selectedRecords = visibleRecords.length > 0 ? visibleRecords : historyRecords.length > 0 ? historyRecords : records;
    const primary = selectedRecords[0] || lastResolved || history[0] || null;
    if (!primary) return null;
    const activeCount = records.filter(entry => entry.status === 'active').length;
    const pendingCount = records.filter(entry => entry.status === 'pending').length;
    const guideLine = primary.status === 'active' ? `当前后效【${primary.name}】仍在生效，优先利用「${primary.positiveLine || '正向收益'}」，并提防「${primary.negativeLine || '负向代价'}」。` : primary.status === 'pending' ? `后效【${primary.name}】会从第 ${primary.activationChapterIndex} 章开始生效，持续 ${primary.durationChapters} 章。` : `最近一条后效【${primary.name}】已经收口。`;
    return {
      available: true,
      title: '界痕抉择',
      icon: primary.icon || '🧭',
      actionValue: 'sanctum',
      currentChapterIndex,
      activeCount,
      pendingCount,
      recordCount: records.length,
      summaryLine: primary.summaryLine || `${primary.name}：${primary.positiveLine || '已留下后效。'}`,
      detailLine: primary.detailLine || primary.sourceLine || '',
      guideLine,
      currentStatusLine: primary.statusLine || '',
      primary,
      lastResolved,
      records: selectedRecords.slice(0, 3)
    };
  }
  getFateAftereffectWeightShift() {
    const snapshot = this.getFateAftereffectSnapshot();
    if (!snapshot || !Array.isArray(snapshot.records) || snapshot.records.length <= 0) return null;
    const activeShifts = snapshot.records.filter(entry => entry.appliesNow).map(entry => entry.weightShift).filter(entry => entry && typeof entry === 'object');
    if (activeShifts.length <= 0) return null;
    return this.game.mergeSanctumAgendaWeightShifts(...activeShifts);
  }
  getHeavenlyMandateWeekMeta(dateOverride = null) {
    const toDate = value => {
      if (value instanceof Date) return new Date(value.getTime());
      const candidate = value === null || value === undefined ? new Date() : new Date(value);
      if (Number.isFinite(candidate.getTime())) return candidate;
      return new Date();
    };
    const dateRef = toDate(dateOverride);
    const endlessMeta = typeof this.game.getEndlessWeekMeta === 'function' ? this.game.getEndlessWeekMeta(dateRef) : null;
    const challengeWeekTag = typeof this.game.getChallengeRotationKey === 'function' ? String(this.game.getChallengeRotationKey('weekly', dateRef) || '').trim() : '';
    const fallbackWeekTag = String(endlessMeta?.weekTag || '').trim();
    const weekTag = challengeWeekTag || fallbackWeekTag;
    const weekMatch = weekTag.match(/^(\d+)-W(\d+)$/);
    return {
      year: weekMatch ? Number(weekMatch[1]) : Math.max(1970, Math.floor(Number(endlessMeta?.year) || dateRef.getUTCFullYear())),
      weekNo: weekMatch ? Number(weekMatch[2]) : Math.max(1, Math.floor(Number(endlessMeta?.weekNo) || 1)),
      weekTag: weekTag || '1970-W01',
      weekIndex: Math.max(0, Math.floor(Number(endlessMeta?.weekIndex) || 0)),
      weekLabel: weekMatch ? `${weekMatch[1]} · 第 ${Number(weekMatch[2])} 周` : '本周',
      endlessWeekTag: fallbackWeekTag,
      challengeWeekTag,
      dateRef
    };
  }
  getHeavenlyMandateSignalSnapshot(options = {}) {
    const weekMeta = this.getHeavenlyMandateWeekMeta(options.dateOverride || null);
    const latestSlate = typeof this.game.getLatestRunSlate === 'function' ? this.game.getLatestRunSlate() : null;
    const validWeekTags = new Set([String(weekMeta.weekTag || '').trim(), String(weekMeta.endlessWeekTag || '').trim(), String(weekMeta.challengeWeekTag || '').trim()].filter(Boolean));
    const latestSlateAt = Math.max(0, Math.floor(Number(latestSlate?.timestamp ?? latestSlate?.completedAt ?? latestSlate?.at ?? latestSlate?.createdAt ?? 0) || 0));
    const latestSlateWeekMeta = latestSlateAt > 0 ? this.getHeavenlyMandateWeekMeta(latestSlateAt) : null;
    const latestSlateWeekTag = String(latestSlateWeekMeta?.weekTag || '').trim();
    const weeklyLatestSlate = latestSlate && latestSlateWeekTag ? validWeekTags.size > 0 ? validWeekTags.has(latestSlateWeekTag) ? latestSlate : null : latestSlate : null;
    const expeditionState = typeof this.game.getExpeditionState === 'function' ? this.game.getExpeditionState() : null;
    const answerSheet = expeditionState && typeof this.game.getExpeditionAnswerSheet === 'function' ? this.game.getExpeditionAnswerSheet(expeditionState) : null;
    const trainingFocus = typeof this.game.getObservatoryTrainingFocus === 'function' ? this.game.getObservatoryTrainingFocus() : null;
    const selectedGuideCandidate = typeof this.game.getSelectedObservatoryExpeditionGuide === 'function' ? this.game.getSelectedObservatoryExpeditionGuide({
      silentSync: true
    }) : null;
    const selectedGuide = selectedGuideCandidate && !selectedGuideCandidate.isFallback ? selectedGuideCandidate : null;
    const weeklyBundle = typeof this.game.buildChallengeBundle === 'function' ? this.game.buildChallengeBundle('weekly', weekMeta.dateRef) : null;
    const weeklyArchiveEntries = typeof this.game.getObservatoryArchiveEntries === 'function' ? this.game.getObservatoryArchiveEntries({
      mode: 'weekly',
      rotationKey: weekMeta.challengeWeekTag || weekMeta.weekTag,
      limit: 12
    }) : [];
    const agendaSnapshot = typeof this.game.getSanctumAgendaExpeditionSnapshot === 'function' ? this.game.getSanctumAgendaExpeditionSnapshot({
      latestRunId: String((weeklyLatestSlate || latestSlate)?.id || '')
    }) : null;
    const endlessState = typeof this.game.ensureEndlessState === 'function' ? this.game.ensureEndlessState() : this.game.endlessState && typeof this.game.endlessState === 'object' ? this.game.endlessState : null;
    const endlessSeason = typeof this.game.getEndlessSeasonProfile === 'function' ? this.game.getEndlessSeasonProfile(endlessState && typeof endlessState === 'object' ? endlessState.currentCycle : null, weekMeta.dateRef) : null;
    let pvpSeason = null;
    let pvpHistory = [];
    if (typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getCurrentSeasonMeta === 'function') {
      try {
        pvpSeason = PVPService.getCurrentSeasonMeta();
      } catch (error) {
        pvpSeason = null;
      }
    }
    if (typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getRecentMatchHistory === 'function') {
      try {
        pvpHistory = PVPService.getRecentMatchHistory(24) || [];
      } catch (error) {
        pvpHistory = [];
      }
    }
    const pvpSeasonId = String(pvpSeason?.id || '').trim();
    const pvpSeasonMatches = Array.isArray(pvpHistory) ? pvpHistory.filter(entry => {
      if (!entry || typeof entry !== 'object') return false;
      if (!pvpSeasonId) return true;
      return !entry.seasonId || entry.seasonId === pvpSeasonId;
    }) : [];
    const currentEndlessWeekTag = String(endlessState?.seasonWeekTag || '').trim();
    const endlessMatchesWeek = validWeekTags.size > 0 ? validWeekTags.has(currentEndlessWeekTag) : currentEndlessWeekTag.length > 0;
    return {
      weekTag: weekMeta.weekTag,
      weekLabel: weekMeta.weekLabel,
      weekIndex: weekMeta.weekIndex,
      latestSlate: weeklyLatestSlate,
      latestSlateWeekTag,
      answerSheet,
      trainingFocus,
      selectedGuide,
      weeklyBundle,
      weeklyScore: Math.max(0, Math.floor(Number(weeklyBundle?.progress?.totalScore) || 0)),
      weeklyArchiveCount: Array.isArray(weeklyArchiveEntries) ? weeklyArchiveEntries.length : 0,
      agendaSnapshot,
      activeAgenda: agendaSnapshot?.active || null,
      lastAgenda: agendaSnapshot?.lastResolved || null,
      endlessSeason,
      endlessClears: endlessMatchesWeek ? Math.max(0, Math.floor(Number(endlessState?.seasonCycleClears) || 0)) : 0,
      endlessScore: endlessMatchesWeek ? Math.max(0, Math.floor(Number(endlessState?.seasonScore) || 0)) : 0,
      pvpSeason,
      pvpSeasonName: String(pvpSeason?.name || '').trim(),
      pvpSeasonMatchCount: pvpSeasonMatches.length,
      pvpRecentOpponentName: String(pvpSeasonMatches[0]?.opponentName || '').trim()
    };
  }
  getHeavenlyMandateThemeMeta(snapshot = null) {
    const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const catalog = {
      star_reading: {
        id: 'star_reading',
        label: '观星校卷',
        icon: '🔭',
        kicker: '本周天道敕令',
        summaryLine: '先读题，再把样本压成能兑现的主卷。'
      },
      seal_commitment: {
        id: 'seal_commitment',
        label: '押卷锁线',
        icon: '📜',
        kicker: '本周天道敕令',
        summaryLine: '围绕洞府承诺推进章节，要求本周真正见到结题推进。'
      },
      mirror_trial: {
        id: 'mirror_trial',
        label: '镜战验算',
        icon: '⚔️',
        kicker: '本周天道敕令',
        summaryLine: '把本周主练送去周挑战、无尽与天道榜做交叉验证。'
      }
    };
    const fallbackOrder = ['star_reading', 'seal_commitment', 'mirror_trial'];
    let themeId = fallbackOrder[Math.max(0, Math.floor(Number(source.weekIndex) || 0)) % fallbackOrder.length];
    if ((source.pvpSeasonMatchCount || 0) > 0 || (source.endlessClears || 0) > 0) {
      themeId = 'mirror_trial';
    } else if (source.activeAgenda || source.latestSlate) {
      themeId = 'seal_commitment';
    }
    const theme = catalog[themeId] || catalog.star_reading;
    let summaryLine = theme.summaryLine;
    if (themeId === 'star_reading' && source.selectedGuide?.title) {
      summaryLine = `本周先围绕【${source.selectedGuide.title}】校卷，再把训练建议写回远征。`;
    } else if (themeId === 'seal_commitment' && source.activeAgenda?.name) {
      summaryLine = `本周核心是把【${source.activeAgenda.name}】推进成卷，再把洞府承诺带去章节结算。`;
    } else if (themeId === 'mirror_trial' && source.pvpSeasonName) {
      summaryLine = `本周主练要拿去【${source.pvpSeasonName}】与无尽轮回做交叉验算，确认打法不是只在单章成立。`;
    }
    return {
      ...theme,
      summaryLine
    };
  }
  buildHeavenlyMandateBoard(options = {}) {
    const signals = this.getHeavenlyMandateSignalSnapshot(options);
    const theme = this.getHeavenlyMandateThemeMeta(signals);
    const activeAgenda = signals.activeAgenda;
    const lastAgenda = signals.lastAgenda;
    const latestSlate = signals.latestSlate;
    const selectedGuide = signals.selectedGuide;
    const trainingFocus = signals.trainingFocus;
    const weeklyBundle = signals.weeklyBundle;
    const weeklyScoreTarget = theme.id === 'mirror_trial' ? 620 : 360;
    const expeditionLane = {
      id: 'expedition',
      label: '远征线',
      icon: '🧭',
      summaryLine: activeAgenda ? `当前正围绕【${activeAgenda.name}】压卷，章节内要继续沿 ${activeAgenda.focusNodeLine || '主轴'} 推进。` : latestSlate ? `本周已有一张章节答卷入档，下一步要把归卷样本继续压成洞府承诺。` : '先打一章远征留下本周第一张命盘答卷，再决定洞府押注。',
      tasks: [{
        id: 'weekly_run_slate',
        label: latestSlate ? '本周答卷已入档' : '留下本周第一张答卷',
        icon: '🧭',
        progress: latestSlate ? 1 : 0,
        target: 1,
        hintLine: latestSlate ? `最新归卷：${latestSlate.chapterName || '章节'} · ${latestSlate.endingName || '已收卷'}${latestSlate.score ? ` · 评分 ${latestSlate.score}` : ''}` : '推进任意一章裂界远征，先把本周主练压成第一张命盘答卷。',
        statusLine: latestSlate?.ratingLabel || '',
        anchorSection: 'slates'
      }, {
        id: 'weekly_sanctum_commitment',
        label: activeAgenda ? `推进 ${activeAgenda.name}` : lastAgenda ? `复核 ${lastAgenda.name}` : '立下一道洞府承诺',
        icon: '📜',
        progress: activeAgenda ? Math.max(0, Math.floor(Number(activeAgenda.progress) || 0)) : lastAgenda?.outcome === 'success' ? 1 : 0,
        target: activeAgenda ? Math.max(1, Math.floor(Number(activeAgenda.target) || 1)) : 1,
        hintLine: activeAgenda ? activeAgenda.phaseLine || activeAgenda.focusNodeLine || activeAgenda.summaryLine || '本轮承诺正在推进。' : lastAgenda ? lastAgenda.recoveryLine || lastAgenda.grantedLine || lastAgenda.reasonLine || '上一道洞府承诺已经留下结果。' : '从归卷书架挑一份样本，立为本周要兑现的洞府承诺。',
        statusLine: activeAgenda?.phaseLabel || lastAgenda?.outcomeLabel || '',
        anchorSection: 'sanctum'
      }]
    };
    const trainingLane = {
      id: 'training',
      label: '训练线',
      icon: '🔭',
      summaryLine: selectedGuide?.title ? `当前主练线索已锁定为【${selectedGuide.title}】，接下来要把它推成真正可复用的周训练样本。` : trainingFocus?.trainingAdvice ? `当前已有主练建议，但还没有明确精选命盘，最好补一份更稳定的观星线索。` : '本周先在观星台锁定一份可复用主练，再去冲七日劫数。',
      tasks: [{
        id: 'weekly_training_focus',
        label: selectedGuide || trainingFocus ? '主练线索已锁定' : '锁定本周主练线索',
        icon: '🔭',
        progress: selectedGuide || trainingFocus ? 1 : 0,
        target: 1,
        hintLine: selectedGuide ? `当前精选命盘：${selectedGuide.title} · ${selectedGuide.themeLabel || '观星样本'}` : trainingFocus ? `当前主练：${trainingFocus.chapterName || '最近归卷'} · ${trainingFocus.trainingAdvice || trainingFocus.sourceTitle || '已给出训练建议'}` : '去观星台筛一份精选命盘，或先完成一轮周挑战补出主练建议。',
        statusLine: selectedGuide?.themeLabel || trainingFocus?.themeLabel || '',
        anchorSection: 'chapters'
      }, {
        id: 'weekly_challenge_score',
        label: `七日劫数累计 ${weeklyScoreTarget} 分`,
        icon: '🜁',
        progress: Math.min(Math.max(0, Math.floor(Number(signals.weeklyScore) || 0)), weeklyScoreTarget),
        target: weeklyScoreTarget,
        hintLine: weeklyBundle ? `${weeklyBundle.rule?.name || '本周轮换'} · 当前 ${Math.max(0, Math.floor(Number(signals.weeklyScore) || 0))} 分${signals.weeklyArchiveCount > 0 ? ` · 已归档 ${signals.weeklyArchiveCount} 份样本` : ''}` : '本周还没有周挑战记录，先去观星台跑一局七日劫数。',
        statusLine: weeklyBundle?.rotationLabel || signals.weekLabel || '',
        anchorSection: 'challenge'
      }]
    };
    const versusLane = {
      id: 'versus',
      label: '对抗线',
      icon: '⚔️',
      summaryLine: (signals.endlessClears || 0) > 0 || (signals.pvpSeasonMatchCount || 0) > 0 ? '本周已经开始做跨模式验算，继续把主练送进高压场验证稳定性。' : '用无尽与天道榜验证这周主练不是只在单章里成立的幻觉。',
      tasks: [{
        id: 'weekly_endless_clear',
        label: '无尽轮回通关 1 轮',
        icon: '∞',
        progress: Math.min(Math.max(0, Math.floor(Number(signals.endlessClears) || 0)), 1),
        target: 1,
        hintLine: signals.endlessSeason ? `${signals.endlessSeason.name || '当前赛季'} · 已清 ${Math.max(0, Math.floor(Number(signals.endlessClears) || 0))} 轮 / 赛季积分 ${Math.max(0, Math.floor(Number(signals.endlessScore) || 0))}` : '进入无尽轮回后，会开始记录本周赛季推进与压强验证结果。',
        statusLine: signals.endlessSeason?.directiveName || '',
        anchorSection: 'endless'
      }, {
        id: 'weekly_pvp_ledger',
        label: '天道榜留下 2 场账本',
        icon: '⚔️',
        progress: Math.min(Math.max(0, Math.floor(Number(signals.pvpSeasonMatchCount) || 0)), 2),
        target: 2,
        hintLine: signals.pvpSeasonName ? `${signals.pvpSeasonName} · 已记 ${Math.max(0, Math.floor(Number(signals.pvpSeasonMatchCount) || 0))} 场${signals.pvpRecentOpponentName ? ` · 最近对手 ${signals.pvpRecentOpponentName}` : ''}` : 'PVP 账本会记录本季真实对局，至少打一场先建立首条样本。',
        statusLine: signals.pvpSeasonName || '',
        anchorSection: 'pvp'
      }]
    };
    const rawLanes = [expeditionLane, trainingLane, versusLane];
    const seasonSignals = typeof this.game.getSeasonBoardSignalSnapshot === 'function' ? this.game.getSeasonBoardSignalSnapshot({
      ...options,
      latestSlate
    }) : null;
    const seasonPhase = seasonSignals && typeof this.game.getSeasonBoardPhaseMeta === 'function' ? this.game.getSeasonBoardPhaseMeta(seasonSignals) : null;
    const seasonSettlementState = seasonSignals && typeof this.game.buildSeasonBoardSettlementState === 'function' ? this.game.buildSeasonBoardSettlementState(seasonSignals, seasonPhase) : null;
    const mandateDebtPack = seasonSettlementState?.debtPack && typeof seasonSettlementState.debtPack === 'object' ? seasonSettlementState.debtPack : null;
    const debtFocusTask = typeof this.buildHeavenlyMandateDebtFocusTask === 'function' ? this.buildHeavenlyMandateDebtFocusTask(mandateDebtPack) : null;
    if (debtFocusTask) {
      const laneIdByAnchorSection = {
        slates: 'expedition',
        sanctum: 'expedition',
        chapters: 'training',
        challenge: 'training',
        endless: 'versus',
        pvp: 'versus'
      };
      const targetLaneId = laneIdByAnchorSection[debtFocusTask.anchorSection] || 'versus';
      const laneIndex = rawLanes.findIndex(lane => lane.id === targetLaneId);
      if (laneIndex >= 0) {
        const targetLane = rawLanes[laneIndex];
        const nextTasks = Array.isArray(targetLane.tasks) ? targetLane.tasks.slice() : [];
        let replaceIndex = nextTasks.findIndex(task => String(task?.anchorSection || '').trim() === debtFocusTask.anchorSection);
        if (replaceIndex < 0) {
          replaceIndex = nextTasks.findIndex(task => !task?.completed);
        }
        if (replaceIndex < 0) replaceIndex = 0;
        const nextTask = {
          ...(nextTasks[replaceIndex] || {}),
          ...debtFocusTask,
          id: debtFocusTask.id,
          label: debtFocusTask.label,
          icon: debtFocusTask.icon,
          progress: debtFocusTask.progress,
          target: debtFocusTask.target,
          completed: debtFocusTask.completed,
          progressText: debtFocusTask.progressText,
          hintLine: debtFocusTask.hintLine,
          statusLine: debtFocusTask.statusLine,
          anchorSection: debtFocusTask.anchorSection,
          source: debtFocusTask.source,
          sourceId: debtFocusTask.sourceId,
          isPlaceholder: debtFocusTask.isPlaceholder,
          occupiesStrongSlot: debtFocusTask.occupiesStrongSlot
        };
        if (nextTasks.length <= 0) {
          nextTasks.push(nextTask);
        } else {
          nextTasks[replaceIndex] = nextTask;
        }
        rawLanes[laneIndex] = {
          ...targetLane,
          summaryLine: [mandateDebtPack?.status === 'deferred' ? '旧周欠卷已挤入本周强目标位，先清账再谈其他高压推进。' : '本周欠卷已经占住一个强目标位，主验证优先级被提前。', targetLane.summaryLine].filter(Boolean).slice(0, 2).join('｜'),
          tasks: nextTasks
        };
      }
    }
    const lanes = rawLanes.map((lane, index) => this.normalizeHeavenlyMandateLane(lane, index));
    const completedTaskCount = lanes.reduce((sum, lane) => sum + lane.completedCount, 0);
    const totalTaskCount = lanes.reduce((sum, lane) => sum + lane.totalCount, 0);
    return {
      version: 1,
      weekTag: signals.weekTag,
      weekLabel: signals.weekLabel,
      themeId: theme.id,
      themeLabel: theme.label,
      themeIcon: theme.icon,
      themeKicker: theme.kicker,
      summaryLine: theme.summaryLine,
      lanes,
      completedTaskCount,
      totalTaskCount
    };
  }
  syncHeavenlyMandateState(options = {}) {
    const state = this.ensureHeavenlyMandateState();
    const board = this.buildHeavenlyMandateBoard(options);
    let history = Array.isArray(state.history) ? state.history.slice() : [];
    if (state.weekTag && state.weekTag !== board.weekTag && state.totalTaskCount > 0) {
      const previousEntry = this.normalizeHeavenlyMandateHistoryEntry({
        weekTag: state.weekTag,
        weekLabel: state.weekLabel,
        themeId: state.themeId,
        themeLabel: state.themeLabel,
        summaryLine: state.summaryLine,
        completedTaskCount: state.completedTaskCount,
        totalTaskCount: state.totalTaskCount,
        completed: state.completedTaskCount >= state.totalTaskCount && state.totalTaskCount > 0,
        at: state.lastSyncedAt || Date.now()
      });
      history = [previousEntry, ...history.filter(entry => entry.weekTag !== previousEntry.weekTag)].slice(0, 6);
    }
    this.game.heavenlyMandateState = this.normalizeHeavenlyMandateState({
      ...state,
      ...board,
      history,
      lastSyncedAt: Date.now()
    });
    return this.game.heavenlyMandateState;
  }
  getHeavenlyMandateSaveState() {
    return this.syncHeavenlyMandateState();
  }
  getHeavenlyMandateExpeditionSnapshot(options = {}) {
    const state = this.syncHeavenlyMandateState(options);
    if (!state.weekTag || state.lanes.length <= 0) return null;
    const seasonBoard = typeof this.game.getSeasonBoardSnapshot === 'function' ? this.game.getSeasonBoardSnapshot(options.latestSlate ? {
      latestSlate: options.latestSlate
    } : {}) : null;
    const debtPack = seasonBoard?.debtPack && typeof seasonBoard.debtPack === 'object' ? seasonBoard.debtPack : null;
    const laneTasks = state.lanes.flatMap(lane => Array.isArray(lane?.tasks) ? lane.tasks : []).filter(task => task && typeof task === 'object');
    const occupiedLaneTask = debtPack?.occupiesStrongSlot && debtPack?.occupiedMandateTaskId ? laneTasks.find(task => task.id === debtPack.occupiedMandateTaskId) || null : null;
    const defaultFocusTask = laneTasks.find(task => !task.completed) || null;
    const focusTask = debtPack?.occupiesStrongSlot ? this.normalizeHeavenlyMandateFocusTask(occupiedLaneTask ? {
      ...occupiedLaneTask,
      source: 'seasonDebtPack',
      sourceId: debtPack.id || '',
      isPlaceholder: false,
      occupiesStrongSlot: true
    } : typeof this.buildHeavenlyMandateDebtFocusTask === 'function' ? this.buildHeavenlyMandateDebtFocusTask(debtPack) : null) : this.normalizeHeavenlyMandateFocusTask(defaultFocusTask ? {
      ...defaultFocusTask,
      source: defaultFocusTask.source || 'heavenlyMandateTask',
      sourceId: defaultFocusTask.sourceId || defaultFocusTask.id || '',
      isPlaceholder: !!defaultFocusTask.isPlaceholder,
      occupiesStrongSlot: !!defaultFocusTask.occupiesStrongSlot
    } : null);
    const actionMeta = focusTask && typeof focusTask === 'object' ? {
      actionType: focusTask.actionType || 'collection',
      actionValue: focusTask.actionValue || 'sanctum',
      ctaLabel: focusTask.ctaLabel || '前往推进'
    } : typeof this.getSeasonVerificationActionMeta === 'function' ? this.getSeasonVerificationActionMeta('sanctum') : {
      actionType: 'collection',
      actionValue: 'sanctum',
      ctaLabel: '回看洞府'
    };
    return {
      weekTag: state.weekTag,
      weekLabel: state.weekLabel,
      themeId: state.themeId,
      themeLabel: state.themeLabel,
      themeIcon: state.themeIcon,
      themeKicker: state.themeKicker,
      summaryLine: state.summaryLine,
      completedTaskCount: state.completedTaskCount,
      totalTaskCount: state.totalTaskCount,
      actionType: actionMeta.actionType,
      actionValue: actionMeta.actionValue,
      ctaLabel: actionMeta.ctaLabel,
      focusTask,
      nextTask: focusTask ? {
        ...focusTask
      } : null,
      lanes: state.lanes.map(lane => ({
        id: lane.id,
        label: lane.label,
        icon: lane.icon,
        summaryLine: lane.summaryLine,
        completedCount: lane.completedCount,
        totalCount: lane.totalCount,
        tasks: lane.tasks.map(task => ({
          id: task.id,
          label: task.label,
          icon: task.icon,
          progress: task.progress,
          target: task.target,
          progressText: task.progressText,
          completed: task.completed,
          hintLine: task.hintLine,
          statusLine: task.statusLine,
          anchorSection: task.anchorSection,
          actionType: task.actionType || '',
          actionValue: task.actionValue || '',
          ctaLabel: task.ctaLabel || '',
          source: task.source || '',
          sourceId: task.sourceId || '',
          isPlaceholder: !!task.isPlaceholder,
          occupiesStrongSlot: !!task.occupiesStrongSlot
        }))
      })),
      history: state.history.map(entry => ({
        weekTag: entry.weekTag,
        weekLabel: entry.weekLabel,
        themeId: entry.themeId,
        themeLabel: entry.themeLabel,
        summaryLine: entry.summaryLine,
        completedTaskCount: entry.completedTaskCount,
        totalTaskCount: entry.totalTaskCount,
        completed: entry.completed,
        at: entry.at
      }))
    };
  }
  applyStrategicEngineeringMilestoneReward(track = null) {
    if (!track || !track.reward || !this.game.player) return '';
    const reward = track.reward;
    const details = [];
    const insight = Math.max(0, Math.floor(Number(reward.insight) || 0));
    if (insight > 0) {
      this.game.player.heavenlyInsight = this.game.getStrategicCurrencyAmount('insight') + insight;
      details.push(`天机 +${insight}`);
    }
    const karma = Math.max(0, Math.floor(Number(reward.karma) || 0));
    if (karma > 0) {
      this.game.player.karma = this.game.getStrategicCurrencyAmount('karma') + karma;
      details.push(`业果 +${karma}`);
    }
    const ringExp = Math.max(0, Math.floor(Number(reward.ringExp) || 0));
    if (ringExp > 0) {
      const gained = this.game.grantFateRingExp(ringExp);
      if (gained > 0) details.push(`命环经验 +${gained}`);
    }
    if (reward.buffId && this.game.player && typeof this.game.player.grantAdventureBuff === 'function') {
      const buffAmount = Math.max(1, Math.floor(Number(reward.buffAmount) || 1));
      if (this.game.player.grantAdventureBuff(reward.buffId, buffAmount)) {
        details.push(`${reward.buffLabel || '战术增益'} +${buffAmount} 场`);
      }
    }
    return details.join('，');
  }
}
if (typeof window !== 'undefined') {}
