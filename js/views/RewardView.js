import { Utils } from "../core/utils.js";
import { getCounterTreasures, TREASURES } from "../data/treasures.js";
import { BOSS_MECHANICS } from "../data/boss_mechanics.js";
import { LAWS } from "../data/laws.js";
import { particles } from "../core/particles.js";
import { CARDS } from "../data/index.js";
import { audioManager } from "../core/audio.js";
import { buildDataAttributes, escapeHtml } from "../ui/render-safe.js";
import { buildRewardBattleMetaMarkup } from "../ui/battle-feedback.js";
/**
 * RewardView
 * Handles rendering and interaction for the Reward screen after battles.
 */

export class RewardView {
  constructor(gameInstance) {
    this.game = gameInstance;
    this.game.rewardCardSelected = false;
    this.game.stealableLaws = [];
  }
  generateRewards(enemies, ringExp) {
    let totalGold = 0;
    let canSteal = false;
    let stealEnemy = null;
    for (const enemy of enemies) {
      if (enemy.gold && typeof enemy.gold.min === 'number') {
        totalGold += Utils.random(enemy.gold.min, enemy.gold.max);
      }
      if (enemy.stealLaw && enemy.stealChance > 0) {
        canSteal = true;
        stealEnemy = enemy;
      }
    }

    // 重玩或重修收益减半
    if (this.game.player.isReplay || this.game.player.isRecultivation) {
      totalGold = Math.floor(totalGold * 0.5);
    }

    // Hardcore: 全局战斗灵石收益降低
    totalGold = Math.floor(totalGold * 0.75);
    if (this.game.isEndlessActive && this.game.isEndlessActive() && this.game.currentBattleNode && this.game.currentBattleNode.type === 'enemy') {
      const paranoiaEffects = this.game.getEndlessParanoiaEffects ? this.game.getEndlessParanoiaEffects() : null;
      const rewardMul = Math.max(0.35, Number(paranoiaEffects?.normalBattleRewardMul) || 1);
      if (rewardMul < 1) {
        totalGold = Math.floor(totalGold * rewardMul);
        Utils.showBattleLog('轮回偏执：普通战灵石掉落减少。');
      }
    }
    const nodeType = this.game.currentBattleNode && this.game.currentBattleNode.type ? this.game.currentBattleNode.type : '';
    const strategicGain = this.game.grantStrategicCurrencies(this.game.getBattleStrategicCurrencyRewards(nodeType), nodeType === 'boss' ? '击破章节主宰' : '高压战利');
    this.game.player.gold += totalGold;
    this.game.achievementSystem.updateStat('totalGold', totalGold);
    this.game.achievementSystem.updateStat('enemiesDefeated', enemies.length);
    if (this.game.player.realm) {
      this.game.achievementSystem.updateStat('realmCleared', this.game.player.realm, 'max');
    }

    // 显示奖励界面
    this.showRewardScreen(totalGold, canSteal, stealEnemy, ringExp, strategicGain);
  }
  setRewardScreenState(state = 'hidden') {
    const rewardScreen = document.getElementById('reward-screen');
    if (rewardScreen) {
      rewardScreen.dataset.stealState = state;
    }
  }
  getRewardExpeditionMeta() {
    const source = this.game.lastExpeditionRewardMeta && typeof this.game.lastExpeditionRewardMeta === 'object' ? this.game.lastExpeditionRewardMeta : null;
    if (!source || !source.id) return null;
    const toTextArray = (value, limit = 6) => Array.isArray(value) ? value.map(entry => String(entry == null ? '' : entry).trim()).filter(Boolean).slice(0, limit) : [];
    const pickTextArray = (primary, fallback, limit = 6) => {
      const primaryLines = toTextArray(primary, limit);
      return primaryLines.length > 0 ? primaryLines : toTextArray(fallback, limit);
    };
    const ratingTone = ['completed', 'selected', 'suggested', 'idle'].includes(String(source.ratingTone || '')) ? String(source.ratingTone) : 'idle';
    const score = Math.max(0, Math.floor(Number(source.score) || 0));
    const lineage = (() => {
      if (!source.lineage || typeof source.lineage !== 'object') return null;
      const next = {
        summaryLine: String(source.lineage.summaryLine || '').trim(),
        detailLine: String(source.lineage.detailLine || '').trim(),
        currentFocusLine: String(source.lineage.currentFocusLine || '').trim(),
        styleLabel: String(source.lineage.styleLabel || '').trim(),
        characterLabel: String(source.lineage.characterLabel || '').trim(),
        nodeLabel: String(source.lineage.nodeLabel || '').trim(),
        researchLabel: String(source.lineage.researchLabel || '').trim()
      };
      return Object.values(next).some(Boolean) ? next : null;
    })();
    const normalizeAftereffectRecord = (entry = null) => {
      if (!entry || typeof entry !== 'object') return null;
      const next = {
        recordId: String(entry.recordId || entry.id || '').trim(),
        icon: String(entry.icon || '').trim(),
        name: String(entry.name || '').trim(),
        templateId: String(entry.templateId || '').trim(),
        templateLabel: String(entry.templateLabel || '').trim(),
        outcomeId: String(entry.outcomeId || '').trim(),
        outcomeLabel: String(entry.outcomeLabel || '').trim(),
        sourceLine: String(entry.sourceLine || '').trim(),
        positiveLine: String(entry.positiveLine || '').trim(),
        negativeLine: String(entry.negativeLine || '').trim(),
        summaryLine: String(entry.summaryLine || '').trim(),
        detailLine: String(entry.detailLine || '').trim(),
        status: String(entry.status || '').trim(),
        statusLabel: String(entry.statusLabel || '').trim(),
        statusLine: String(entry.statusLine || '').trim(),
        remainingChapters: Math.max(0, Math.floor(Number(entry.remainingChapters) || 0)),
        durationChapters: Math.max(1, Math.floor(Number(entry.durationChapters || entry.duration) || 1)),
        activationChapterIndex: Math.max(0, Math.floor(Number(entry.activationChapterIndex) || 0))
      };
      return Object.values(next).some(value => value !== '' && value !== 0) ? next : null;
    };
    const aftereffects = (() => {
      if (!source.aftereffects || typeof source.aftereffects !== 'object') return null;
      const primary = normalizeAftereffectRecord(source.aftereffects.primary);
      const records = Array.isArray(source.aftereffects.records) ? source.aftereffects.records.map(entry => normalizeAftereffectRecord(entry)).filter(Boolean).slice(0, 3) : [];
      const next = {
        summaryLine: String(source.aftereffects.summaryLine || '').trim(),
        detailLine: String(source.aftereffects.detailLine || '').trim(),
        guideLine: String(source.aftereffects.guideLine || '').trim(),
        currentStatusLine: String(source.aftereffects.currentStatusLine || '').trim(),
        activeCount: Math.max(0, Math.floor(Number(source.aftereffects.activeCount) || 0)),
        pendingCount: Math.max(0, Math.floor(Number(source.aftereffects.pendingCount) || 0)),
        primary: primary || records[0] || null,
        records
      };
      return next.primary || next.summaryLine || next.detailLine || next.records.length > 0 ? next : null;
    })();
    const seasonBoard = (() => {
      const boardSource = source.seasonBoard && typeof source.seasonBoard === 'object' ? source.seasonBoard : typeof this.game.getSeasonBoardSnapshot === 'function' ? this.game.getSeasonBoardSnapshot({
        latestSlate: source
      }) : null;
      if (!boardSource || typeof this.game.normalizeSeasonBoardSnapshot !== 'function') return null;
      return this.game.normalizeSeasonBoardSnapshot(boardSource);
    })();
    return {
      id: String(source.id || ''),
      chapterName: String(source.chapterName || ''),
      endingName: String(source.endingName || '章节归卷'),
      endingIcon: String(source.endingIcon || '🧭'),
      score,
      scoreLabel: String(source.scoreLabel || `命盘评分 ${score}`),
      ratingLabel: String(source.ratingLabel || ''),
      ratingTone,
      highlightLine: String(source.highlightLine || ''),
      trainingAdvice: String(source.trainingAdvice || ''),
      branchName: String(source.branchName || ''),
      branchLine: String(source.branchLine || ''),
      nemesisLine: String(source.nemesisLine || ''),
      focusLines: pickTextArray(source.focusLines, source.goalHighlights, 4),
      breakdown: pickTextArray(source.breakdown, source.scoreBreakdown, 4),
      tags: toTextArray(source.tags, 6),
      seasonBoard,
      lineage,
      aftereffects,
      agenda: source.agenda && typeof source.agenda === 'object' ? {
        agendaId: String(source.agenda.agendaId || ''),
        icon: String(source.agenda.icon || ''),
        name: String(source.agenda.name || ''),
        outcome: String(source.agenda.outcome || ''),
        outcomeLabel: String(source.agenda.outcomeLabel || ''),
        outcomeTone: String(source.agenda.outcomeTone || ''),
        progress: Math.max(0, Math.floor(Number(source.agenda.progress) || 0)),
        target: Math.max(0, Math.floor(Number(source.agenda.target) || 0)),
        ratingLabel: String(source.agenda.ratingLabel || ''),
        summaryLine: String(source.agenda.summaryLine || ''),
        reasonLine: String(source.agenda.reasonLine || ''),
        grantedLine: String(source.agenda.grantedLine || ''),
        selectedDecisionLabel: String(source.agenda.selectedDecisionLabel || ''),
        selectedContractLabel: String(source.agenda.selectedContractLabel || ''),
        contractSuccess: !!source.agenda.contractSuccess,
        contractResolutionLine: String(source.agenda.contractResolutionLine || ''),
        recoveryEligible: !!source.agenda.recoveryEligible,
        recoveryLabel: String(source.agenda.recoveryLabel || ''),
        recoveryTier: String(source.agenda.recoveryTier || ''),
        recoveryTierLabel: String(source.agenda.recoveryTierLabel || ''),
        recoveryLine: String(source.agenda.recoveryLine || ''),
        recoveryHintLine: String(source.agenda.recoveryHintLine || ''),
        recoveryReward: source.agenda.recoveryReward && typeof source.agenda.recoveryReward === 'object' ? {
          insight: Math.max(0, Math.floor(Number(source.agenda.recoveryReward.insight) || 0)),
          karma: Math.max(0, Math.floor(Number(source.agenda.recoveryReward.karma) || 0)),
          ringExp: Math.max(0, Math.floor(Number(source.agenda.recoveryReward.ringExp) || 0))
        } : null,
        rewardTrackId: String(source.agenda.rewardTrackId || ''),
        rewardTrackName: String(source.agenda.rewardTrackName || ''),
        rewardTrackIcon: String(source.agenda.rewardTrackIcon || '')
      } : null
    };
  }
  getRewardNarrativeBriefMeta() {
    const expeditionMeta = this.getRewardExpeditionMeta();
    if (expeditionMeta) {
      const agenda = expeditionMeta.agenda && typeof expeditionMeta.agenda === 'object' ? expeditionMeta.agenda : null;
      const seasonBoard = expeditionMeta.seasonBoard && typeof expeditionMeta.seasonBoard === 'object' ? expeditionMeta.seasonBoard : null;
      const seasonSettlement = seasonBoard?.settlement && typeof seasonBoard.settlement === 'object' ? seasonBoard.settlement : null;
      const seasonDebtPack = seasonBoard?.debtPack && typeof seasonBoard.debtPack === 'object' ? seasonBoard.debtPack : null;
      const seasonVerificationOrders = Array.isArray(seasonBoard?.verificationOrders) ? seasonBoard.verificationOrders.filter(entry => entry && typeof entry === 'object') : [];
      const seasonNextTask = seasonBoard?.nextTask && typeof seasonBoard.nextTask === 'object' ? seasonBoard.nextTask : null;
      const lineage = expeditionMeta.lineage && typeof expeditionMeta.lineage === 'object' ? expeditionMeta.lineage : null;
      const aftereffects = expeditionMeta.aftereffects && typeof expeditionMeta.aftereffects === 'object' ? expeditionMeta.aftereffects : null;
      const seasonSettlementOutcomeId = String(seasonSettlement?.outcomeId || '').trim();
      const shouldSurfaceSeasonVerification = seasonBoard?.phaseId === 'ranking' || ['positive_sheet', 'risky_sheet', 'debt_sheet'].includes(seasonSettlementOutcomeId);
      const visibleSeasonVerificationOrders = shouldSurfaceSeasonVerification ? seasonVerificationOrders : [];
      const primarySeasonVerification = visibleSeasonVerificationOrders.find(entry => String(entry?.role || '').trim() === 'primary') || visibleSeasonVerificationOrders[0] || null;
      const preferAftereffectFoot = ['sampling_sheet'].includes(seasonSettlementOutcomeId);
      const actionSurfaceOutcomes = ['positive_sheet', 'risky_sheet', 'debt_sheet', 'locking_sheet'];
      const resolveAnchorLabel = (anchorSection = '') => {
        const labelMap = {
          sanctum: '洞府',
          endless: '无尽轮回',
          pvp: '天道榜',
          challenge: '七日劫数',
          observatory: '命盘档案室',
          map: '章节地图'
        };
        return labelMap[String(anchorSection || '').trim()] || '';
      };
      const rewardActionBody = (() => {
        switch (seasonSettlementOutcomeId) {
          case 'debt_sheet':
            return seasonDebtPack?.guideLine || primarySeasonVerification?.summaryLine || primarySeasonVerification?.hintLine || seasonSettlement?.summaryLine || seasonBoard?.summaryLine || '';
          case 'risky_sheet':
            return primarySeasonVerification?.summaryLine || primarySeasonVerification?.hintLine || seasonSettlement?.guideLine || seasonSettlement?.summaryLine || seasonBoard?.summaryLine || '';
          case 'positive_sheet':
            return primarySeasonVerification?.summaryLine || primarySeasonVerification?.hintLine || seasonNextTask?.hintLine || seasonSettlement?.summaryLine || seasonBoard?.summaryLine || '';
          case 'locking_sheet':
            return seasonNextTask?.hintLine || (seasonNextTask?.label ? `当前押卷行动：${seasonNextTask.label}` : '') || seasonSettlement?.summaryLine || seasonBoard?.summaryLine || '';
          case 'sampling_sheet':
            return seasonNextTask?.hintLine || seasonSettlement?.summaryLine || seasonBoard?.summaryLine || '';
          default:
            return seasonBoard?.summaryLine || '';
        }
      })();
      const rewardActionFoot = (() => {
        const verificationAnchorLabel = resolveAnchorLabel(primarySeasonVerification?.anchorSection);
        const debtAnchorLabel = resolveAnchorLabel(seasonDebtPack?.recommendedAnchorSection || primarySeasonVerification?.anchorSection);
        const nextTaskAnchorLabel = resolveAnchorLabel(seasonNextTask?.anchorSection);
        switch (seasonSettlementOutcomeId) {
          case 'debt_sheet':
            return [seasonDebtPack?.settleWindowText ? `清账窗口 ${seasonDebtPack.settleWindowText}` : '', seasonDebtPack?.progressText || seasonDebtPack?.statusLine || primarySeasonVerification?.statusLine || '', debtAnchorLabel ? `建议前往 ${debtAnchorLabel}` : ''].filter(Boolean).join(' · ');
          case 'risky_sheet':
            return [primarySeasonVerification?.statusLine || (seasonBoard?.progress?.progressText ? `验证进度 ${seasonBoard.progress.progressText}` : '') || seasonBoard?.statusLine || '', verificationAnchorLabel ? `建议前往 ${verificationAnchorLabel}` : ''].filter(Boolean).join(' · ');
          case 'positive_sheet':
            return [primarySeasonVerification?.statusLine || seasonSettlement?.statusLine || seasonBoard?.statusLine || '', verificationAnchorLabel ? `继续去 ${verificationAnchorLabel}` : ''].filter(Boolean).join(' · ');
          case 'locking_sheet':
            return [seasonNextTask?.progressText ? `${seasonNextTask.laneLabel || '当前任务'} ${seasonNextTask.progressText}` : '', seasonNextTask?.statusLine || seasonSettlement?.statusLine || seasonBoard?.statusLine || '', aftereffects?.currentStatusLine || aftereffects?.summaryLine || '', nextTaskAnchorLabel ? `从 ${nextTaskAnchorLabel} 继续` : ''].filter(Boolean).join(' · ');
          case 'sampling_sheet':
            return [seasonNextTask?.progressText ? `${seasonNextTask.laneLabel || '当前任务'} ${seasonNextTask.progressText}` : '', seasonNextTask?.statusLine || seasonBoard?.statusLine || '', nextTaskAnchorLabel ? `建议前往 ${nextTaskAnchorLabel}` : ''].filter(Boolean).join(' · ');
          default:
            return '';
        }
      })();
      let expeditionFoot = rewardActionFoot;
      if (!expeditionFoot) {
        if (seasonBoard?.statusLine) {
          expeditionFoot = preferAftereffectFoot ? aftereffects?.currentStatusLine || aftereffects?.summaryLine || seasonBoard?.statusLine || seasonBoard?.guideLine : seasonBoard?.statusLine;
        } else {
          expeditionFoot = seasonBoard?.guideLine || agenda?.grantedLine || aftereffects?.currentStatusLine || aftereffects?.summaryLine || '';
        }
      }
      if (!expeditionFoot) {
        expeditionFoot = agenda?.grantedLine || aftereffects?.currentStatusLine || aftereffects?.summaryLine || (lineage?.currentFocusLine ? `谱系校准：${lineage.currentFocusLine}` : expeditionMeta.trainingAdvice ? `训练建议：${expeditionMeta.trainingAdvice}` : agenda?.reasonLine || expeditionMeta.branchLine || expeditionMeta.nemesisLine || '可回命盘档案室继续复盘本章答卷。');
      }
      return {
        surface: 'expedition',
        state: actionSurfaceOutcomes.includes(seasonSettlementOutcomeId) ? 'tracking' : expeditionMeta.ratingTone === 'completed' ? 'archived' : 'tracking',
        kicker: actionSurfaceOutcomes.includes(seasonSettlementOutcomeId) ? '赛季裁定' : '章节归卷',
        title: [expeditionMeta.chapterName, seasonSettlement?.outcomeLabel || expeditionMeta.endingName].filter(Boolean).join(' · ') || '本章归卷已完成',
        body: rewardActionBody || expeditionMeta.highlightLine || lineage?.summaryLine || agenda?.summaryLine || (expeditionMeta.ratingLabel ? `答卷评级：${expeditionMeta.ratingLabel}` : '这章的观星答卷已经归卷，可直接查看评级、偏题诊断与主线留痕。'),
        foot: expeditionFoot
      };
    }
    const runPathMeta = this.game.lastRunPathRewardMeta && typeof this.game.lastRunPathRewardMeta === 'object' ? this.game.lastRunPathRewardMeta : null;
    const currentRunPath = this.game.player && typeof this.game.player.getRunPathMeta === 'function' ? this.game.player.getRunPathMeta() : null;
    const pathName = String(runPathMeta?.name || currentRunPath?.name || '').trim();
    const entries = Array.isArray(runPathMeta?.entries) ? runPathMeta.entries.filter(entry => entry && typeof entry === 'object') : [];
    const latestEntry = entries.length > 0 ? entries[entries.length - 1] : null;
    const archive = runPathMeta?.archive && typeof runPathMeta.archive === 'object' ? runPathMeta.archive : null;
    if (archive && runPathMeta?.completed) {
      const recordName = String(archive.recordName || archive.name || '命途战录').trim() || '命途战录';
      const clears = Math.max(1, Math.floor(Number(archive.clears) || 1));
      return {
        surface: 'runPath',
        state: 'archived',
        kicker: '命盘档案',
        title: `洞府已收录 · ${recordName}`,
        body: String(archive.note || `${pathName || '这条命途'}的圆满战录已收入洞府与构筑记录，可继续复盘下一轮路线。`),
        foot: archive.firstClear ? '首次收录 · 可回藏经阁继续复盘' : `累计收录 ${clears} 次 · 可回藏经阁继续复盘`
      };
    }
    if (latestEntry) {
      const phaseLabel = [latestEntry.phaseLabel, latestEntry.title].filter(Boolean).join(' · ');
      const nextLabel = [latestEntry.nextPhaseLabel, latestEntry.nextPhaseTitle].filter(Boolean).join(' · ');
      return {
        surface: 'runPath',
        state: runPathMeta?.completed ? 'completed' : 'tracking',
        kicker: '命盘档案',
        title: phaseLabel ? `${pathName || '命途战录'} · ${phaseLabel}` : `${pathName || '命途战录'} · 本场战绩已记下`,
        body: nextLabel ? `下一段会追到 ${nextLabel}，现在可以按这份战录决定继续补件、改线或预留资源。` : '本场战利已记入命盘战录，可回藏经阁复盘这条路线的稳定解法。',
        foot: String(latestEntry.rewardText || '圆满后会收入洞府与构筑记录。')
      };
    }
    if (currentRunPath) {
      return {
        surface: 'runPath',
        state: 'tracking',
        kicker: '命盘档案',
        title: `${currentRunPath.name || '当前命途'} · 战录持续推进中`,
        body: '本场战利会记入命盘战录；三段目标圆满后，会收入洞府与构筑记录。',
        foot: '去挑战或藏经阁继续复盘，把这条路线磨成稳定解法。'
      };
    }
    return null;
  }
  getRewardSeasonBoardHandoffTarget(sourceKey = 'primary') {
    const expeditionMeta = typeof this.getRewardExpeditionMeta === 'function' ? this.getRewardExpeditionMeta() : null;
    const seasonBoard = expeditionMeta?.seasonBoard && typeof expeditionMeta.seasonBoard === 'object' ? expeditionMeta.seasonBoard : null;
    if (!seasonBoard) return null;
    const normalizedSourceKey = String(sourceKey || 'primary').trim() || 'primary';
    const nextWeekGoal = seasonBoard.nextWeekGoal && typeof seasonBoard.nextWeekGoal === 'object' ? seasonBoard.nextWeekGoal : null;
    const nextTask = seasonBoard.nextTask && typeof seasonBoard.nextTask === 'object' ? seasonBoard.nextTask : null;
    const chapterArc = seasonBoard.chapterArc && typeof seasonBoard.chapterArc === 'object' ? seasonBoard.chapterArc : null;
    const debtPack = seasonBoard.debtPack && typeof seasonBoard.debtPack === 'object' ? seasonBoard.debtPack : null;
    const verificationOrders = Array.isArray(seasonBoard.verificationOrders) ? seasonBoard.verificationOrders.filter(entry => entry && typeof entry === 'object') : [];
    const primaryVerification = verificationOrders.find(entry => String(entry.role || '').trim() === 'primary') || verificationOrders[0] || null;
    const secondaryVerification = verificationOrders.find(entry => entry !== primaryVerification && String(entry.role || '').trim() === 'side') || verificationOrders.find(entry => entry !== primaryVerification) || null;
    const resolveAnchorAction = (anchorSection = '', fallback = 'sanctum') => {
      const anchor = String(anchorSection || '').trim();
      switch (anchor) {
        case 'challenge':
          return {
            action: 'challenge',
            value: 'weekly'
          };
        case 'pvp':
          return {
            action: 'screen',
            value: 'pvp-screen'
          };
        case 'endless':
        case 'map':
          return {
            action: 'screen',
            value: 'map-screen'
          };
        default:
          return {
            action: 'collection',
            value: anchor || fallback || 'sanctum'
          };
      }
    };
    const normalizeTarget = (target = null, fallback = {}) => {
      const source = target && typeof target === 'object' ? target : {};
      const fallbackSource = fallback && typeof fallback === 'object' ? fallback : {};
      const anchorSection = String(source.anchorSection || fallbackSource.anchorSection || '').trim();
      const anchorAction = resolveAnchorAction(anchorSection, String(fallbackSource.fallbackSection || 'sanctum').trim() || 'sanctum');
      const action = String(source.action || source.actionType || fallbackSource.action || fallbackSource.actionType || anchorAction.action).trim();
      const value = String(source.value || source.actionValue || fallbackSource.value || fallbackSource.actionValue || anchorAction.value).trim();
      const taskId = String(source.taskId || fallbackSource.taskId || fallbackSource.id || '').trim();
      const laneId = String(source.laneId || fallbackSource.laneId || '').trim();
      const sourceType = String(source.source || fallbackSource.source || '').trim();
      const sourceId = String(source.sourceId || fallbackSource.sourceId || fallbackSource.id || '').trim();
      const taskSource = String(source.taskSource || fallbackSource.taskSource || '').trim();
      const taskSourceId = String(source.taskSourceId || fallbackSource.taskSourceId || '').trim();
      const title = String(source.title || source.label || source.name || fallbackSource.title || fallbackSource.label || fallbackSource.name || '').trim();
      const note = String(source.note || source.hintLine || source.statusLine || source.summaryLine || fallbackSource.note || fallbackSource.hintLine || fallbackSource.statusLine || fallbackSource.summaryLine || '').trim();
      const buttonLabel = String(source.buttonLabel || source.ctaLabel || fallbackSource.buttonLabel || fallbackSource.ctaLabel || '前往推进').trim() || '前往推进';
      if (!action && !value) return null;
      return {
        sourceKey: normalizedSourceKey,
        action: action || anchorAction.action,
        value: value || anchorAction.value,
        buttonLabel,
        source: sourceType,
        sourceId,
        taskSource,
        taskSourceId,
        taskId,
        laneId,
        anchorSection,
        title,
        note
      };
    };
    const goalMatches = (expectedSource = '', expectedId = '') => {
      if (!nextWeekGoal) return false;
      const goalSource = String(nextWeekGoal.source || '').trim();
      const goalSourceId = String(nextWeekGoal.sourceId || '').trim();
      const goalTaskId = String(nextWeekGoal.taskId || nextWeekGoal.taskSourceId || '').trim();
      return !!expectedSource && goalSource === expectedSource || !!expectedId && (goalSourceId === expectedId || goalTaskId === expectedId);
    };
    const goalTarget = () => normalizeTarget(nextWeekGoal, nextTask || {});
    switch (normalizedSourceKey) {
      case 'debtPack':
      case 'debt_pack':
        if (goalMatches('debt_pack', debtPack?.id)) return goalTarget();
        return debtPack ? normalizeTarget(null, {
          id: debtPack.id,
          source: 'debt_pack',
          sourceId: debtPack.id,
          anchorSection: debtPack.recommendedAnchorSection || primaryVerification?.anchorSection || 'sanctum',
          buttonLabel: debtPack.recommendedValidationLabel || '前往清账'
        }) : null;
      case 'verification':
      case 'primaryVerification':
        if (goalMatches('verification', primaryVerification?.id)) return goalTarget();
        return primaryVerification ? normalizeTarget(null, {
          id: primaryVerification.id,
          source: 'verification',
          sourceId: primaryVerification.id,
          anchorSection: primaryVerification.anchorSection || 'sanctum',
          buttonLabel: primaryVerification.ctaLabel || '前往验证'
        }) : null;
      case 'sideVerification':
        return secondaryVerification ? normalizeTarget(null, {
          id: secondaryVerification.id,
          source: 'verification',
          sourceId: secondaryVerification.id,
          anchorSection: secondaryVerification.anchorSection || 'challenge',
          buttonLabel: secondaryVerification.ctaLabel || '前往旁证'
        }) : null;
      case 'nextTask':
        if (goalMatches('settlement', nextTask?.id) || goalMatches('lane', nextTask?.id) || goalMatches('', nextTask?.id)) return goalTarget();
        return nextTask ? normalizeTarget(null, {
          ...nextTask,
          action: nextTask.actionType,
          value: nextTask.actionValue,
          buttonLabel: nextTask.ctaLabel || '前往推进'
        }) : null;
      case 'chapterArc':
      case 'chapter_arc':
        return chapterArc ? normalizeTarget(null, {
          id: chapterArc.id,
          source: 'chapter_arc',
          sourceId: chapterArc.id,
          action: 'collection',
          value: 'chapters',
          anchorSection: 'chapters',
          fallbackSection: 'chapters',
          buttonLabel: '查看章节档案',
          title: chapterArc.arcLabel || chapterArc.chapterLabel || '三周一章',
          note: chapterArc.objective?.summaryLine || chapterArc.feedbackLine || chapterArc.statusLine || chapterArc.summaryLine || ''
        }) : null;
      case 'primary':
      case 'nextWeekGoal':
      default:
        if (nextWeekGoal) return goalTarget();
        if (debtPack) return this.getRewardSeasonBoardHandoffTarget('debtPack');
        if (primaryVerification) return this.getRewardSeasonBoardHandoffTarget('verification');
        if (nextTask) return this.getRewardSeasonBoardHandoffTarget('nextTask');
        return null;
    }
  }
  getRewardChapterArcDrillTarget(mode = 'weekly') {
    const expeditionMeta = typeof this.getRewardExpeditionMeta === 'function' ? this.getRewardExpeditionMeta() : null;
    const seasonBoard = expeditionMeta?.seasonBoard && typeof expeditionMeta.seasonBoard === 'object' ? expeditionMeta.seasonBoard : null;
    const chapterArc = seasonBoard?.chapterArc && typeof seasonBoard.chapterArc === 'object' ? seasonBoard.chapterArc : null;
    if (!chapterArc) return null;
    const safeMode = ['daily', 'weekly', 'global'].includes(String(mode || '')) ? String(mode) : 'weekly';
    const drillModeMeta = typeof this.game.getChapterCodexDrillModes === 'function'
      ? this.game.getChapterCodexDrillModes().find(entry => entry?.mode === safeMode)
      : null;
    const modeLabelMap = {
      daily: '今日天机章节演练',
      weekly: '七日劫数章节演练',
      global: '众生试炼章节演练'
    };
    const entries = typeof this.game.getChapterCodexEntries === 'function' ? this.game.getChapterCodexEntries() : [];
    if (!Array.isArray(entries) || entries.length === 0) return null;
    const clampChapterIndex = (value) => {
      const normalized = Math.floor(Number(value) || 0);
      return normalized > 0 ? Math.max(1, Math.min(6, normalized)) : 0;
    };
    // chapterArc labels are season arc numbers, so use combat chapter signals for codex mapping.
    const chapterIndexes = [
      seasonBoard.settlement?.chapterIndex,
      expeditionMeta.chapterIndex,
      this.game.player?.realm ? Math.floor((Math.max(1, Math.floor(Number(this.game.player.realm) || 1)) - 1) / 3) + 1 : 0
    ].map(clampChapterIndex).filter(Boolean);
    const nameHints = [
      chapterArc.chapterLabel,
      chapterArc.arcLabel
    ].map(item => String(item || '').trim()).filter(Boolean);
    let chapter = null;
    for (const chapterIndex of chapterIndexes) {
      chapter = entries.find(entry => Math.floor(Number(entry?.chapterIndex) || 0) === chapterIndex) || null;
      if (chapter) break;
    }
    if (!chapter && nameHints.length > 0) {
      chapter = entries.find(entry => {
        const names = [entry?.fullName, entry?.name].map(item => String(item || '').trim()).filter(Boolean);
        return names.some(name => nameHints.some(hint => hint.includes(name) || name.includes(hint)));
      }) || null;
    }
    if (!chapter) {
      chapter = entries.find(entry => entry?.isCurrent) || entries[0] || null;
    }
    const chapterId = String(chapter?.id || '').trim();
    if (!chapterId) return null;
    const focusId = `chapter_codex:${chapterId}`;
    return {
      sourceKey: 'chapterArcDrill',
      action: 'challenge',
      value: safeMode,
      mode: safeMode,
      buttonLabel: `设为${drillModeMeta?.label || modeLabelMap[safeMode] || '章节演练'}`,
      source: 'chapter_arc',
      sourceId: String(chapterArc.id || '').trim(),
      taskSource: 'chapter_codex',
      taskSourceId: chapterId,
      taskId: chapterId,
      chapterId,
      focusId,
      anchorSection: 'challenge',
      title: chapter.fullName || chapter.name || chapterArc.arcLabel || '三周一章',
      note: chapterArc.objective?.summaryLine || chapterArc.feedbackLine || chapterArc.statusLine || chapterArc.summaryLine || ''
    };
  }
  getRewardSkipCost() {
    const realm = Math.max(1, Math.floor(Number(this.game.player?.realm) || 1));
    return 50 * realm;
  }
  syncRewardSeasonBoardHandoffState(handoffNotice = null) {
    const nextNotice = handoffNotice && typeof handoffNotice === 'object' ? {
      ...handoffNotice
    } : null;
    this.lastRewardSeasonBoardHandoff = nextNotice ? {
      ...nextNotice
    } : null;
    this.pendingRewardSeasonBoardHandoffNotice = nextNotice ? {
      ...nextNotice
    } : null;
    this.game.lastRewardSeasonBoardHandoff = nextNotice ? {
      ...nextNotice
    } : null;
    this.game.pendingRewardSeasonBoardHandoffNotice = nextNotice ? {
      ...nextNotice
    } : null;
  }
  switchCollectionSection(section = 'sanctum') {
    const targetSection = String(section || 'sanctum').trim() || 'sanctum';
    if (typeof this.game.switchCollectionSection === 'function') {
      this.game.switchCollectionSection(targetSection);
      return true;
    }
    if (typeof this.game.showCollection === 'function') {
      this.game.showCollection(targetSection);
      return true;
    }
    if (typeof this.game.showScreen === 'function') {
      this.game.showScreen('collection');
      return true;
    }
    return false;
  }
  followRewardSeasonBoardHandoff(sourceKey = 'primary') {
    const target = this.getRewardSeasonBoardHandoffTarget(sourceKey);
    if (!target) return false;
    const handoffNotice = {
      ...target,
      createdAt: Date.now()
    };
    this.syncRewardSeasonBoardHandoffState(handoffNotice);
    const action = String(target.action || '').trim();
    const value = String(target.value || '').trim();
    if (action === 'challenge') {
      this.game.showChallengeHub(value || 'weekly');
      return true;
    }
    if (action === 'screen') {
      if (value === 'pvp-screen' && typeof this.game.showPvpScreen === 'function') {
        this.game.showPvpScreen();
        return true;
      }
      this.game.showScreen(value || 'map-screen');
      return true;
    }
    if (action === 'treasure') {
      if (typeof this.game.showTreasureCompendium === 'function') {
        this.game.showTreasureCompendium();
      } else {
        this.game.showScreen('treasure-compendium');
      }
      return true;
    }
    if (action === 'collection') {
      const section = value || target.anchorSection || 'sanctum';
      this.switchCollectionSection(section);
      if (typeof this.game.renderRewardSeasonBoardHandoffArrival === 'function') {
        this.game.renderRewardSeasonBoardHandoffArrival(section);
      }
      return true;
    }
    if (target.anchorSection && typeof this.jumpToSeasonVerificationAnchor === 'function') {
      return this.jumpToSeasonVerificationAnchor(target.anchorSection);
    }
    return false;
  }
  followRewardChapterArcDrill(chapterId = '', mode = 'weekly') {
    const target = this.getRewardChapterArcDrillTarget(mode);
    const selectedChapterId = String(chapterId || target?.chapterId || '').trim();
    if (!target || !selectedChapterId || typeof this.game.applyChapterCodexDrillFocus !== 'function') return false;
    const handoffNotice = {
      ...target,
      chapterId: selectedChapterId,
      focusId: `chapter_codex:${selectedChapterId}`,
      taskSourceId: selectedChapterId,
      taskId: selectedChapterId,
      createdAt: Date.now()
    };
    this.syncRewardSeasonBoardHandoffState(handoffNotice);
    return this.game.applyChapterCodexDrillFocus(selectedChapterId, target.mode || target.value || 'weekly');
  }
  updateRewardHeaderCopy() {
    if (typeof document === 'undefined') return;
    const screenEl = document.getElementById('reward-screen');
    const titleEl = document.querySelector('#reward-screen .reward-title');
    const subtitleEl = document.querySelector('#reward-screen .reward-subtitle');
    const narrative = this.getRewardNarrativeBriefMeta();
    const expeditionMeta = narrative?.surface === 'expedition' ? this.getRewardExpeditionMeta() : null;
    const seasonBoard = expeditionMeta?.seasonBoard && typeof expeditionMeta.seasonBoard === 'object' ? expeditionMeta.seasonBoard : null;
    const seasonSettlement = seasonBoard?.settlement && typeof seasonBoard.settlement === 'object' ? seasonBoard.settlement : null;
    const seasonDebtPack = seasonBoard?.debtPack && typeof seasonBoard.debtPack === 'object' ? seasonBoard.debtPack : null;
    const seasonNextTask = seasonBoard?.nextTask && typeof seasonBoard.nextTask === 'object' ? seasonBoard.nextTask : null;
    const seasonSettlementOutcomeId = String(seasonSettlement?.outcomeId || '').trim();
    const shouldSurfaceSeasonVerification = seasonBoard?.phaseId === 'ranking' || ['positive_sheet', 'risky_sheet', 'debt_sheet'].includes(seasonSettlementOutcomeId);
    const seasonVerificationOrders = shouldSurfaceSeasonVerification && Array.isArray(seasonBoard?.verificationOrders) ? seasonBoard.verificationOrders.filter(entry => entry && typeof entry === 'object') : [];
    const primarySeasonVerification = seasonVerificationOrders.find(entry => String(entry?.role || '').trim() === 'primary') || seasonVerificationOrders[0] || null;
    const headerActionSource = (() => {
      if (seasonSettlementOutcomeId === 'debt_sheet' && seasonDebtPack) return 'debtPack';
      if (['positive_sheet', 'risky_sheet'].includes(seasonSettlementOutcomeId) && primarySeasonVerification) return 'verification';
      if (['locking_sheet', 'sampling_sheet'].includes(seasonSettlementOutcomeId) && seasonNextTask) return 'nextTask';
      if (primarySeasonVerification) return 'verification';
      if (seasonNextTask) return 'nextTask';
      if (seasonBoard?.guideLine) return 'guide';
      return narrative?.surface === 'expedition' ? 'training' : '';
    })();
    const expeditionSubtitle = (() => {
      switch (seasonSettlementOutcomeId) {
        case 'debt_sheet':
          return '先整理本场战利，再根据赛季裁定确认清账回流，决定先补哪条外场验证。';
        case 'risky_sheet':
          return '先整理本场战利，再把这一章的险卷送去补一条外场验证，别让主轴只停在章节内。';
        case 'positive_sheet':
          return '先整理本场战利，再决定这张正卷要继续巩固战绩、冲榜，还是补更高压证明。';
        case 'locking_sheet':
          return '先整理本场战利，再沿押卷承诺继续锁线，把下一章行动写成可兑现的主轴。';
        case 'sampling_sheet':
          return '先整理本场战利，再把这章战果定成可押卷的主练方向。';
        default:
          return '先整理本场战利，再确认这一章的答卷评级、偏题诊断与训练建议，决定下一章继续补哪条主线。';
      }
    })();
    if (screenEl) {
      screenEl.dataset.rewardHeaderSurface = narrative?.surface || '';
      screenEl.dataset.rewardHeaderState = narrative?.state || '';
      screenEl.dataset.rewardHeaderOutcome = seasonSettlementOutcomeId;
      screenEl.dataset.rewardNextActionSource = headerActionSource;
    }
    if (titleEl) {
      titleEl.textContent = narrative?.surface === 'expedition' ? seasonSettlementOutcomeId ? '战斗胜利 · 赛季裁定' : '战斗胜利 · 章节归卷' : narrative?.state === 'archived' ? '战斗胜利 · 命途圆满' : narrative ? '战斗胜利 · 战录更新' : '战斗胜利！';
      titleEl.dataset.rewardHeaderOutcome = seasonSettlementOutcomeId;
    }
    if (subtitleEl) {
      subtitleEl.textContent = narrative?.surface === 'expedition' ? expeditionSubtitle : narrative?.state === 'archived' ? '先整理本场战利，再把这份圆满战录收入命盘，决定下一轮继续追哪条修行线。' : narrative ? '先整理法则余烬，再确认这份战录将如何影响下一阶段推进。' : '先整理法则余烬，再把本场战利与关键留痕收成命盘线索，决定下一段推进节奏。';
      subtitleEl.dataset.rewardNextActionSource = headerActionSource;
    }
  }
  renderRewardNarrativeBrief() {
    const panel = document.getElementById('reward-narrative-brief');
    if (!panel) return;
    const brief = this.getRewardNarrativeBriefMeta();
    if (!brief) {
      panel.style.display = 'none';
      panel.classList.remove('is-archived');
      panel.innerHTML = '';
      return;
    }
    const escape = escapeHtml;
    panel.setAttribute('aria-live', 'polite');
    panel.style.display = 'block';
    panel.classList.toggle('is-archived', brief.state === 'archived');
    panel.innerHTML = `
            <div class="reward-narrative-kicker">${escape(brief.kicker || '命盘档案')}</div>
            <div class="reward-narrative-title">${escape(brief.title || '本场战录已更新')}</div>
            <div class="reward-narrative-body">${escape(brief.body || '')}</div>
            ${brief.foot ? `<div class="reward-narrative-foot">${escape(brief.foot)}</div>` : ''}
        `;
  }
  renderRewardBattleMeta() {
    const panel = document.getElementById('reward-battle-meta');
    if (!panel) return;
    panel.dataset.renderer = 'battle-feedback';
    const meta = this.game.lastBattleRewardMeta;
    if (!meta || typeof meta !== 'object' || !meta.encounter && !meta.squad) {
      panel.style.display = 'none';
      panel.innerHTML = '';
      return;
    }
    panel.setAttribute('aria-live', 'polite');
    const markup = buildRewardBattleMetaMarkup(meta);
    if (!markup) {
      panel.style.display = 'none';
      panel.innerHTML = '';
      return;
    }
    panel.style.display = 'block';
    panel.innerHTML = markup;
  }
  renderRewardExpeditionMeta() {
    const panel = document.getElementById('reward-expedition-meta');
    if (!panel) return;
    const meta = this.getRewardExpeditionMeta();
    if (!meta) {
      panel.style.display = 'none';
      panel.classList.remove('is-complete');
      panel.dataset.tone = 'idle';
      panel.innerHTML = '';
      return;
    }
    const escape = escapeHtml;
    const titleText = [meta.endingName || '章节归卷', meta.ratingLabel ? `答卷 ${meta.ratingLabel}` : ''].filter(Boolean).join(' · ');
    const diagnosticLines = meta.focusLines.length > 0 ? meta.focusLines : meta.breakdown.slice(0, 3);
    const lineage = meta.lineage && typeof meta.lineage === 'object' ? meta.lineage : null;
    const aftereffects = meta.aftereffects && typeof meta.aftereffects === 'object' ? meta.aftereffects : null;
    const seasonBoard = meta.seasonBoard && typeof meta.seasonBoard === 'object' ? meta.seasonBoard : null;
    const seasonBoardSettlement = seasonBoard?.settlement && typeof seasonBoard.settlement === 'object' ? seasonBoard.settlement : null;
    const seasonBoardOutcomeId = String(seasonBoardSettlement?.outcomeId || '').trim();
    const seasonBoardDebtPack = seasonBoard?.debtPack && typeof seasonBoard.debtPack === 'object' ? seasonBoard.debtPack : null;
    const seasonBoardFrontier = seasonBoard?.frontier && typeof seasonBoard.frontier === 'object' ? seasonBoard.frontier : null;
    const seasonBoardFrontierDecree = seasonBoardFrontier?.decree && typeof seasonBoardFrontier.decree === 'object' ? seasonBoardFrontier.decree : null;
    const seasonBoardFrontierChronicle = seasonBoardFrontier?.chronicle && typeof seasonBoardFrontier.chronicle === 'object' ? seasonBoardFrontier.chronicle : null;
    const seasonBoardFrontierChronicleArchive = seasonBoardFrontier?.chronicleArchive && typeof seasonBoardFrontier.chronicleArchive === 'object' ? seasonBoardFrontier.chronicleArchive : null;
    const seasonBoardFrontierCouncil = seasonBoardFrontier?.council && typeof seasonBoardFrontier.council === 'object' ? seasonBoardFrontier.council : null;
    const seasonBoardChapterArc = seasonBoard?.chapterArc && typeof seasonBoard.chapterArc === 'object' ? seasonBoard.chapterArc : null;
    const seasonBoardChapterArcRescue = seasonBoardChapterArc?.rescueWindow && typeof seasonBoardChapterArc.rescueWindow === 'object' ? seasonBoardChapterArc.rescueWindow : null;
    const seasonBoardChapterArcPressureWindow = seasonBoardChapterArc?.pressureWindow && typeof seasonBoardChapterArc.pressureWindow === 'object' ? seasonBoardChapterArc.pressureWindow : null;
    const seasonBoardChapterArcReview = seasonBoardChapterArc?.review && typeof seasonBoardChapterArc.review === 'object' ? seasonBoardChapterArc.review : null;
    const seasonBoardChapterArcObjective = seasonBoardChapterArc?.objective && typeof seasonBoardChapterArc.objective === 'object' ? seasonBoardChapterArc.objective : null;
    const rawSeasonBoardVerificationOrders = Array.isArray(seasonBoard?.verificationOrders) ? seasonBoard.verificationOrders.filter(entry => entry && typeof entry === 'object') : [];
    const shouldSurfaceSeasonVerification = seasonBoard?.phaseId === 'ranking' || ['positive_sheet', 'risky_sheet', 'debt_sheet'].includes(seasonBoardOutcomeId);
    const seasonBoardVerificationOrders = shouldSurfaceSeasonVerification ? rawSeasonBoardVerificationOrders : [];
    const primarySeasonVerification = seasonBoardVerificationOrders[0] || null;
    const secondarySeasonVerification = seasonBoardVerificationOrders[1] || null;
    const seasonBoardNextTask = seasonBoard?.nextTask && typeof seasonBoard.nextTask === 'object' ? seasonBoard.nextTask : null;
    const seasonBoardLaneRewards = Array.isArray(seasonBoard?.laneRewards) ? seasonBoard.laneRewards.filter(entry => entry && typeof entry === 'object') : [];
    const seasonBoardClaimableLaneRewards = seasonBoardLaneRewards.filter(entry => entry.claimable);
    const resolveAnchorLabel = (anchorSection = '') => {
      const labelMap = {
        sanctum: '洞府',
        endless: '无尽轮回',
        pvp: '天道榜',
        challenge: '七日劫数',
        observatory: '命盘档案室',
        map: '章节地图'
      };
      return labelMap[String(anchorSection || '').trim()] || '';
    };
    const primaryActionSource = (() => {
      if (seasonBoardOutcomeId === 'debt_sheet' && seasonBoardDebtPack) return 'debtPack';
      if (['positive_sheet', 'risky_sheet'].includes(seasonBoardOutcomeId) && primarySeasonVerification) return 'verification';
      if (['locking_sheet', 'sampling_sheet'].includes(seasonBoardOutcomeId) && seasonBoardNextTask) return 'nextTask';
      if (primarySeasonVerification) return 'verification';
      if (seasonBoardDebtPack) return 'debtPack';
      if (seasonBoardNextTask) return 'nextTask';
      if (seasonBoard?.guideLine) return 'guide';
      return '';
    })();
    const buildDataAttrs = (entries = {}) => buildDataAttributes(entries);
    const getHandoffAction = (sourceKey = 'primary') => typeof this.getRewardSeasonBoardHandoffTarget === 'function' ? this.getRewardSeasonBoardHandoffTarget(sourceKey) : null;
    const chapterArcDrillModes = (() => {
      const modes = typeof this.game.getChapterCodexDrillModes === 'function'
        ? this.game.getChapterCodexDrillModes().map(entry => entry?.mode).filter(Boolean)
        : ['daily', 'weekly', 'global'];
      const safeModes = modes.filter(mode => ['daily', 'weekly', 'global'].includes(String(mode || '')));
      return [...new Set(safeModes)].sort((a, b) => ['daily', 'weekly', 'global'].indexOf(a) - ['daily', 'weekly', 'global'].indexOf(b));
    })();
    const chapterArcDrillActions = typeof this.getRewardChapterArcDrillTarget === 'function'
      ? chapterArcDrillModes.map(mode => this.getRewardChapterArcDrillTarget(mode)).filter(Boolean)
      : [];
    const buildActionCard = ({
      tone = 'tracking',
      dataAttrs = {},
      kicker = '',
      body = '',
      detail = '',
      metaLines = [],
      action = null,
      extraActions = []
    }) => {
      const summaryLine = String(body || '').trim();
      const detailLine = String(detail || '').trim();
      const compactMeta = metaLines.map(line => String(line || '').trim()).filter(Boolean).join(' · ');
      const handoff = action && typeof action === 'object' ? action : null;
      const handoffAttrs = handoff ? buildDataAttrs({
        'data-season-board-handoff-cta': 'true',
        'data-season-board-handoff-source-key': handoff.sourceKey || '',
        'data-season-board-handoff-action': handoff.action || '',
        'data-season-board-handoff-value': handoff.value || '',
        'data-season-board-handoff-source': handoff.source || '',
        'data-season-board-handoff-source-id': handoff.sourceId || '',
        'data-season-board-handoff-task-source': handoff.taskSource || '',
        'data-season-board-handoff-task-source-id': handoff.taskSourceId || '',
        'data-season-board-handoff-task-id': handoff.taskId || '',
        'data-season-board-handoff-lane-id': handoff.laneId || '',
        'data-season-board-handoff-anchor': handoff.anchorSection || ''
      }) : '';
      const secondaryButtons = (Array.isArray(extraActions) ? extraActions : []).map(extraAction => {
        if (!extraAction || typeof extraAction !== 'object') return '';
        const attrs = buildDataAttrs(extraAction.dataAttrs || {});
        return `<button type="button" class="reward-expedition-handoff-btn"${attrs}>${escape(extraAction.buttonLabel || '前往推进')}</button>`;
      }).filter(Boolean).join('');
      if (!kicker && !summaryLine && !detailLine && !compactMeta) return '';
      return `
                <div class="reward-expedition-line reward-expedition-callout is-${tone}"${buildDataAttrs(dataAttrs)}>
                    ${kicker ? `<div class="reward-expedition-callout-kicker">${escape(kicker)}</div>` : ''}
                    ${summaryLine ? `<div class="reward-expedition-callout-body">${escape(summaryLine)}</div>` : ''}
                    ${detailLine ? `<div class="reward-expedition-callout-detail">${escape(detailLine)}</div>` : ''}
                    ${compactMeta ? `<div class="reward-expedition-callout-meta">${escape(compactMeta)}</div>` : ''}
                    ${handoff ? `<button type="button" class="reward-expedition-handoff-btn"${handoffAttrs}>${escape(handoff.buttonLabel || '前往推进')}</button>` : ''}
                    ${secondaryButtons}
                </div>
            `;
    };
    const lineageLines = lineage ? [String(lineage.summaryLine || '').trim(), String(lineage.detailLine || '').trim(), lineage.currentFocusLine ? `谱系校准：${String(lineage.currentFocusLine || '').trim()}` : ''].filter(Boolean) : [];
    const aftereffectLines = aftereffects ? [String(aftereffects.summaryLine || '').trim(), String(aftereffects.currentStatusLine || '').trim(), String(aftereffects.detailLine || '').trim()].filter(Boolean) : [];
    const seasonBoardSummaryLine = String(seasonBoard?.summaryLine || '').trim();
    const seasonBoardDetailLine = String(seasonBoard?.detailLine || seasonBoard?.rewardLine || seasonBoard?.statusLine || '').trim();
    const seasonBoardGuideLine = String(seasonBoard?.guideLine || seasonBoard?.crossModeSummary || '').trim();
    const seasonBoardSummaryIntro = seasonBoardSummaryLine && seasonBoardSummaryLine !== seasonBoardSettlement?.summaryLine ? seasonBoardSummaryLine : '';
    const seasonBoardDetailIntro = seasonBoardDetailLine && seasonBoardDetailLine !== seasonBoardSettlement?.detailLine && seasonBoardDetailLine !== seasonBoardDebtPack?.detailLine ? seasonBoardDetailLine : '';
    const seasonBoardSettlementCard = seasonBoardSettlement ? buildActionCard({
      tone: seasonBoardOutcomeId === 'debt_sheet' ? 'warning' : 'focus',
      dataAttrs: {
        'data-season-board-settlement-reward': 'true',
        'data-season-board-outcome': seasonBoardOutcomeId
      },
      kicker: `本章裁定 · ${seasonBoardSettlement.outcomeLabel || '待押卷'}`,
      body: seasonBoardSettlement.summaryLine || seasonBoardSummaryLine,
      detail: seasonBoardSettlement.detailLine || '',
      metaLines: [seasonBoard.phaseLabel || '', seasonBoard.progress?.progressText ? `赛季 ${seasonBoard.progress.progressText}` : '', seasonBoardSettlement.progressText || seasonBoardSettlement.statusLine || '']
    }) : '';
    const seasonBoardDebtCard = seasonBoardDebtPack ? buildActionCard({
      tone: 'warning',
      dataAttrs: {
        'data-season-board-debt-reward': 'true',
        'data-season-board-action-reward': primaryActionSource === 'debtPack' ? 'true' : '',
        'data-season-board-action-source': primaryActionSource === 'debtPack' ? 'debtPack' : ''
      },
      kicker: seasonBoardDebtPack.recommendedValidationLabel || '债账回流',
      body: seasonBoardDebtPack.summaryLine || seasonBoardDebtPack.guideLine || seasonBoardDebtPack.progressText,
      detail: seasonBoardDebtPack.guideLine || seasonBoardDebtPack.detailLine || '',
      metaLines: [seasonBoardDebtPack.settleWindowText ? `窗口 ${seasonBoardDebtPack.settleWindowText}` : '', seasonBoardDebtPack.progressText || seasonBoardDebtPack.statusLine || '', resolveAnchorLabel(seasonBoardDebtPack.recommendedAnchorSection) ? `建议前往 ${resolveAnchorLabel(seasonBoardDebtPack.recommendedAnchorSection)}` : ''],
      action: getHandoffAction('debtPack')
    }) : '';
    const seasonBoardVerificationCard = primarySeasonVerification ? buildActionCard({
      tone: 'tracking',
      dataAttrs: {
        'data-season-board-verification-reward': 'true',
        'data-season-board-action-reward': primaryActionSource === 'verification' ? 'true' : '',
        'data-season-board-action-source': primaryActionSource === 'verification' ? 'verification' : ''
      },
      kicker: `下一步验证 · ${primarySeasonVerification.label || '待验证'}`,
      body: primarySeasonVerification.summaryLine || primarySeasonVerification.hintLine || primarySeasonVerification.statusLine,
      detail: primarySeasonVerification.hintLine && primarySeasonVerification.hintLine !== primarySeasonVerification.summaryLine ? primarySeasonVerification.hintLine : '',
      metaLines: [primarySeasonVerification.statusLine || '', resolveAnchorLabel(primarySeasonVerification.anchorSection) ? `建议前往 ${resolveAnchorLabel(primarySeasonVerification.anchorSection)}` : ''],
      action: getHandoffAction('verification')
    }) : '';
    const seasonBoardNextTaskCard = seasonBoardNextTask ? buildActionCard({
      tone: 'tracking',
      dataAttrs: {
        'data-season-board-next-task-reward': 'true',
        'data-season-board-action-reward': primaryActionSource === 'nextTask' ? 'true' : '',
        'data-season-board-action-source': primaryActionSource === 'nextTask' ? 'nextTask' : ''
      },
      kicker: seasonBoardNextTask.laneLabel || '下一步行动',
      body: seasonBoardNextTask.label || seasonBoardNextTask.hintLine || '等待下一步行动',
      detail: seasonBoardNextTask.hintLine || '',
      metaLines: [seasonBoardNextTask.progressText ? `当前进度 ${seasonBoardNextTask.progressText}` : '', seasonBoardNextTask.statusLine || '', resolveAnchorLabel(seasonBoardNextTask.anchorSection) ? `建议前往 ${resolveAnchorLabel(seasonBoardNextTask.anchorSection)}` : ''],
      action: getHandoffAction('nextTask')
    }) : '';
    const seasonBoardLaneRewardCards = seasonBoardLaneRewards.length > 0 ? seasonBoardLaneRewards.map(reward => {
      const claimable = !!reward.claimable;
      const tone = reward.claimed ? 'complete' : claimable ? 'focus' : 'tracking';
      const statusLabel = reward.statusLabel || (reward.claimed ? '已领取' : claimable ? '可领取' : '未结题');
      return `
                    <div class="reward-expedition-line reward-expedition-callout is-${tone}"${buildDataAttrs({
        'data-season-board-lane-reward': 'true',
        'data-season-board-lane-reward-lane-id': reward.laneId || '',
        'data-season-board-lane-reward-status': reward.status || '',
        'data-season-board-lane-reward-week': reward.weekTag || ''
      })}>
                        <div class="reward-expedition-callout-kicker">${escape(`${reward.laneLabel || reward.label || '分线'} · ${statusLabel}`)}</div>
                        <div class="reward-expedition-callout-body">${escape(reward.summaryLine || reward.rewardLine || '完成分线后可领取结题赏。')}</div>
                        <div class="reward-expedition-callout-detail">${escape([reward.rewardLine || '', reward.detailLine || ''].filter(Boolean).join(' · '))}</div>
                        <button type="button" class="reward-expedition-handoff-btn"
                            data-season-board-lane-reward-claim="true"
                            data-season-board-lane-reward-lane-id="${escape(reward.laneId || '')}"
                            data-season-board-lane-reward-claimable="${claimable ? 'true' : 'false'}"
                            ${claimable ? '' : 'disabled'}
                            >${escape(reward.buttonLabel || (claimable ? '领取结题赏' : statusLabel))}</button>
                    </div>
                `;
    }).join('') : '';
    const secondaryVerificationLine = secondarySeasonVerification ? buildActionCard({
      tone: 'tracking',
      dataAttrs: {
        'data-season-board-verification-followup': 'true',
        'data-season-board-verification-id': secondarySeasonVerification.id || '',
        'data-season-board-action-source': 'sideVerification'
      },
      kicker: `后续验证 · ${secondarySeasonVerification.label || '验证状'}`,
      body: secondarySeasonVerification.summaryLine || secondarySeasonVerification.hintLine || secondarySeasonVerification.statusLine || '待同步',
      detail: secondarySeasonVerification.hintLine && secondarySeasonVerification.hintLine !== secondarySeasonVerification.summaryLine ? secondarySeasonVerification.hintLine : '',
      metaLines: [secondarySeasonVerification.statusLine || '', resolveAnchorLabel(secondarySeasonVerification.anchorSection) ? `建议前往 ${resolveAnchorLabel(secondarySeasonVerification.anchorSection)}` : ''],
      action: getHandoffAction('sideVerification')
    }) : '';
    const seasonBoardChapterArcCard = seasonBoardChapterArc ? buildActionCard({
      tone: seasonBoardChapterArcRescue?.open ? 'warning' : 'tracking',
      dataAttrs: {
        'data-season-board-chapter-arc-reward': 'true',
        'data-season-board-chapter-arc-id': seasonBoardChapterArc.id || '',
        'data-season-board-chapter-arc-week-slot': seasonBoardChapterArc.weekSlot || '',
        'data-season-board-chapter-arc-open': seasonBoardChapterArcRescue?.open ? 'true' : 'false',
        'data-season-board-chapter-arc-pressure-open': seasonBoardChapterArcPressureWindow?.open ? 'true' : 'false',
        'data-season-board-chapter-arc-pressure-status': seasonBoardChapterArcPressureWindow?.statusId || '',
        'data-season-board-chapter-arc-objective-id': seasonBoardChapterArcObjective?.id || '',
        'data-season-board-chapter-arc-objective-status': seasonBoardChapterArcObjective?.statusId || ''
      },
      kicker: `三周一章 · ${seasonBoardChapterArc.arcLabel || seasonBoardChapterArc.chapterLabel || '当前章程'}`,
      body: seasonBoardChapterArc.summaryLine || seasonBoardChapterArc.statusLine || `第 ${seasonBoardChapterArc.weekSlot || 1}/${seasonBoardChapterArc.targetWeeks || 3} 周章程待同步`,
      detail: [seasonBoardChapterArcPressureWindow?.reasonLine || seasonBoardChapterArcPressureWindow?.shortLine || '', seasonBoardChapterArcObjective?.summaryLine || '', seasonBoardChapterArc.feedbackLine || '', seasonBoardChapterArcRescue?.open ? seasonBoardChapterArcRescue.guideLine || seasonBoardChapterArcRescue.reasonLine || seasonBoardChapterArcRescue.statusLabel || '' : seasonBoardChapterArcReview?.summaryLine || seasonBoardChapterArcReview?.endingPreviewLine || seasonBoardChapterArc.goalLine || '', seasonBoardChapterArc.goalLine || ''].filter(Boolean).join(' · '),
      metaLines: [seasonBoardChapterArc.windowLabel || '', `第 ${seasonBoardChapterArc.weekSlot || 1}/${seasonBoardChapterArc.targetWeeks || 3} 周`, seasonBoardChapterArcPressureWindow?.shortLine || '', seasonBoardChapterArcObjective?.shortLine || '', seasonBoardChapterArc.progressText ? `归卷 ${seasonBoardChapterArc.progressText}` : '', seasonBoardChapterArcRescue?.statusLabel || seasonBoardChapterArcReview?.statusLabel || ''],
      action: getHandoffAction('chapterArc'),
      extraActions: chapterArcDrillActions.map(chapterArcDrillAction => ({
        buttonLabel: chapterArcDrillAction.buttonLabel,
        dataAttrs: {
          'data-season-board-chapter-drill-cta': 'true',
          'data-season-board-chapter-drill-source-key': chapterArcDrillAction.sourceKey,
          'data-season-board-chapter-drill-source': chapterArcDrillAction.source,
          'data-season-board-chapter-drill-source-id': chapterArcDrillAction.sourceId,
          'data-season-board-chapter-drill-chapter-id': chapterArcDrillAction.chapterId,
          'data-season-board-chapter-drill-focus-id': chapterArcDrillAction.focusId,
          'data-season-board-chapter-drill-mode': chapterArcDrillAction.mode,
          'data-season-board-chapter-drill-action': chapterArcDrillAction.action,
          'data-season-board-chapter-drill-value': chapterArcDrillAction.value
        }
      }))
    }) : '';
    const chips = [];
    const lineageChips = [];
    const aftereffectChips = [];
    const seasonBoardChips = [];
    if (meta.ratingLabel) chips.push(`<span class="reward-expedition-chip focus">${escape(`评级 · ${meta.ratingLabel}`)}</span>`);
    if (meta.branchName) chips.push(`<span class="reward-expedition-chip">${escape(`主线 · ${meta.branchName}`)}</span>`);
    if (meta.nemesisLine) chips.push(`<span class="reward-expedition-chip">${escape(meta.nemesisLine)}</span>`);
    meta.tags.forEach(tag => {
      chips.push(`<span class="reward-expedition-chip">${escape(tag)}</span>`);
    });
    if (lineage?.characterLabel) {
      lineageChips.push(`<span class="reward-expedition-chip" data-fate-lineage-reward-chip="character">${escape(`角色 · ${lineage.characterLabel}`)}</span>`);
    }
    if (lineage?.styleLabel) {
      lineageChips.push(`<span class="reward-expedition-chip" data-fate-lineage-reward-chip="style">${escape(`流派 · ${lineage.styleLabel}`)}</span>`);
    }
    if (lineage?.nodeLabel) {
      lineageChips.push(`<span class="reward-expedition-chip" data-fate-lineage-reward-chip="node">${escape(`节点 · ${lineage.nodeLabel}`)}</span>`);
    }
    if (lineage?.researchLabel) {
      lineageChips.push(`<span class="reward-expedition-chip" data-fate-lineage-reward-chip="research">${escape(`研究 · ${lineage.researchLabel}`)}</span>`);
    }
    if (aftereffects?.primary?.templateLabel) {
      aftereffectChips.push(`<span class="reward-expedition-chip" data-fate-aftereffect-reward-chip="template">${escape(`后效 · ${aftereffects.primary.templateLabel}`)}</span>`);
    }
    if (aftereffects?.primary?.statusLabel) {
      aftereffectChips.push(`<span class="reward-expedition-chip" data-fate-aftereffect-reward-chip="status">${escape(`状态 · ${aftereffects.primary.statusLabel}`)}</span>`);
    }
    if (aftereffects?.activeCount > 0 || aftereffects?.pendingCount > 0) {
      aftereffectChips.push(`<span class="reward-expedition-chip" data-fate-aftereffect-reward-chip="count">${escape(`生效 ${aftereffects.activeCount || 0} / 待生效 ${aftereffects.pendingCount || 0}`)}</span>`);
    }
    if (seasonBoard?.phaseLabel) {
      seasonBoardChips.push(`<span class="reward-expedition-chip" data-season-board-chip="phase">${escape(`阶段 · ${seasonBoard.phaseLabel}`)}</span>`);
    }
    if (seasonBoard?.themeLabel) {
      seasonBoardChips.push(`<span class="reward-expedition-chip" data-season-board-chip="theme">${escape(`主轴 · ${seasonBoard.themeLabel}`)}</span>`);
    }
    if (seasonBoard?.progress?.progressText) {
      seasonBoardChips.push(`<span class="reward-expedition-chip" data-season-board-chip="status">${escape(`进度 · ${seasonBoard.progress.progressText}`)}</span>`);
    }
    if (seasonBoardSettlement?.outcomeLabel) {
      seasonBoardChips.push(`<span class="reward-expedition-chip" data-season-board-chip="settlement">${escape(`押卷 · ${seasonBoardSettlement.outcomeLabel}`)}</span>`);
    }
    if (seasonBoardDebtPack?.settleWindowText || seasonBoardDebtPack?.progressText) {
      seasonBoardChips.push(`<span class="reward-expedition-chip" data-season-board-chip="debt">${escape(`债账 · ${seasonBoardDebtPack.settleWindowText || seasonBoardDebtPack.progressText}`)}</span>`);
    }
    if (seasonBoardFrontier?.primaryFrontLabel) {
      seasonBoardChips.push(`<span class="reward-expedition-chip" data-season-board-chip="frontier" data-season-board-frontier-chip="true">${escape(`战线 · ${seasonBoardFrontier.primaryFrontShortLabel || seasonBoardFrontier.primaryFrontLabel} · ${seasonBoardFrontier.pressureLabel || seasonBoardFrontier.statusLabel || '稳态'}`)}</span>`);
    }
    if (seasonBoardFrontierDecree?.title) {
      seasonBoardChips.push(`<span class="reward-expedition-chip" data-season-board-chip="frontier-decree" data-season-board-frontier-decree-chip="true">${escape(`法旨 · ${seasonBoardFrontierDecree.laneLabel || seasonBoardFrontier.primaryFrontShortLabel || '主战线'} · ${seasonBoardFrontierDecree.toneLabel || '本周'}`)}</span>`);
    }
    if (seasonBoardFrontierChronicle?.title) {
      seasonBoardChips.push(`<span class="reward-expedition-chip" data-season-board-chip="frontier-chronicle" data-season-board-frontier-chronicle-chip="true">${escape(`史卷 · ${seasonBoardFrontierChronicle.laneLabel || seasonBoardFrontier.primaryFrontShortLabel || '主战线'} · ${seasonBoardFrontierChronicle.phaseLabel || '本周'}`)}</span>`);
    }
    if (seasonBoardFrontierChronicleArchive?.available) {
      seasonBoardChips.push(`<span class="reward-expedition-chip" data-season-board-chip="frontier-chronicle-archive" data-season-board-frontier-chronicle-archive-chip="true">${escape(`史卷回看 · ${seasonBoardFrontierChronicleArchive.dominantStanceLabel || '待沉淀'} · ${seasonBoardFrontierChronicleArchive.progressText || `${seasonBoardFrontierChronicleArchive.totalRecords || 0} 条`}`)}</span>`);
    }
    if (seasonBoardFrontierCouncil?.title) {
      seasonBoardChips.push(`<span class="reward-expedition-chip" data-season-board-chip="frontier-council" data-season-board-frontier-council-chip="true">${escape(`会审 · ${seasonBoardFrontierCouncil.laneLabel || seasonBoardFrontier.primaryFrontShortLabel || '主战线'} · ${seasonBoardFrontierCouncil.phaseLabel || '本周'}`)}</span>`);
    }
    if (seasonBoardChapterArc?.available) {
      seasonBoardChips.push(`<span class="reward-expedition-chip" data-season-board-chip="chapter-arc">${escape(`章程 · ${seasonBoardChapterArc.arcLabel || seasonBoardChapterArc.chapterLabel || '当前章程'} · 第 ${seasonBoardChapterArc.weekSlot || 1}/${seasonBoardChapterArc.targetWeeks || 3} 周`)}</span>`);
    }
    if (seasonBoardChapterArcPressureWindow?.available) {
      seasonBoardChips.push(`<span class="reward-expedition-chip" data-season-board-chip="chapter-arc-pressure">${escape(`章势 · ${seasonBoardChapterArcPressureWindow.statusLabel || '章势压强'} · ${seasonBoardChapterArcPressureWindow.open ? '需关注' : '稳步推进'}`)}</span>`);
    }
    if (seasonBoardChapterArcObjective?.available) {
      seasonBoardChips.push(`<span class="reward-expedition-chip" data-season-board-chip="chapter-arc-objective">${escape(`章目标 · ${seasonBoardChapterArcObjective.statusLabel || seasonBoardChapterArcObjective.label || '经营目标'} · ${seasonBoardChapterArcObjective.focusLaneLabel || '本周主线'}`)}</span>`);
    }
    if (primarySeasonVerification?.label) {
      seasonBoardChips.push(`<span class="reward-expedition-chip" data-season-board-chip="verification">${escape(`验证 · ${primarySeasonVerification.label}`)}</span>`);
    }
    if (seasonBoardLaneRewards.length > 0) {
      seasonBoardChips.push(`<span class="reward-expedition-chip" data-season-board-chip="lane-reward">${escape(`分线结题赏 · 可领 ${seasonBoardClaimableLaneRewards.length}/${seasonBoardLaneRewards.length}`)}</span>`);
    }
    if (seasonBoardNextTask?.label && ['sampling_sheet', 'locking_sheet'].includes(seasonBoardOutcomeId)) {
      seasonBoardChips.push(`<span class="reward-expedition-chip" data-season-board-chip="next">${escape(`行动 · ${seasonBoardNextTask.label}`)}</span>`);
    }
    panel.setAttribute('aria-live', 'polite');
    panel.style.display = 'block';
    panel.classList.toggle('is-complete', meta.ratingTone === 'completed');
    panel.dataset.tone = meta.ratingTone || 'idle';
    panel.dataset.seasonBoardOutcome = seasonBoardOutcomeId;
    panel.dataset.seasonBoardActionSource = primaryActionSource;
    panel.dataset.seasonBoardVerificationVisible = shouldSurfaceSeasonVerification ? 'true' : 'false';
    panel.dataset.seasonBoardLaneRewardClaimableCount = String(seasonBoardClaimableLaneRewards.length);
    panel.dataset.seasonBoardFrontier = seasonBoardFrontier?.primaryFrontId || '';
    panel.dataset.seasonBoardFrontierPressure = seasonBoardFrontier?.statusId || '';
    panel.dataset.seasonBoardFrontierDecree = seasonBoardFrontierDecree?.id || '';
    panel.dataset.seasonBoardFrontierChronicle = seasonBoardFrontierChronicle?.id || '';
    panel.dataset.seasonBoardFrontierCouncil = seasonBoardFrontierCouncil?.id || '';
    panel.dataset.seasonBoardChapterArc = seasonBoardChapterArc?.id || '';
    panel.open = typeof window === 'undefined' || !window.matchMedia('(max-width: 840px)').matches;
    panel.innerHTML = `
            <summary class="reward-disclosure-summary">
                <span>
                    <span class="reward-expedition-kicker">观星回响总结</span>
                    <strong>${escape(meta.endingIcon || '🧭')} ${escape(meta.chapterName || '章节归卷')}</strong>
                </span>
                <span class="reward-expedition-score">${escape(meta.scoreLabel || `命盘评分 ${meta.score}`)}</span>
            </summary>
            <div class="reward-disclosure-body">
            <div class="reward-expedition-title">${escape(titleText || '章节归卷已整理')}</div>
            ${meta.highlightLine ? `<div class="reward-expedition-summary">${escape(meta.highlightLine)}</div>` : ''}
            ${diagnosticLines.length > 0 ? `
                <div class="reward-expedition-section">
                    <div class="reward-expedition-section-title">作答诊断</div>
                    <div class="reward-expedition-list">
                        ${diagnosticLines.map(line => `<div class="reward-expedition-line">${escape(line)}</div>`).join('')}
                    </div>
                </div>
            ` : ''}
            ${meta.trainingAdvice ? `
                <div class="reward-expedition-advice">
                    <span class="reward-expedition-advice-label">训练建议</span>
                    <span>${escape(meta.trainingAdvice)}</span>
                </div>
            ` : ''}
            ${seasonBoard ? `
                <div class="reward-expedition-section" data-season-board-reward="true">
                    <div class="reward-expedition-section-title">赛季天道盘</div>
                    ${seasonBoardSummaryIntro ? `<div class="reward-expedition-summary" data-season-board-summary="true">${escape(seasonBoardSummaryIntro)}</div>` : ''}
                    ${seasonBoardSettlementCard}
                    ${seasonBoardDebtCard}
                    ${seasonBoardVerificationCard}
                    ${secondaryVerificationLine}
                    ${seasonBoardNextTaskCard}
                    ${seasonBoardLaneRewardCards}
                    ${seasonBoardChapterArcCard}
                    ${seasonBoardFrontier ? `<div class="reward-expedition-line muted" data-season-board-frontier-reward="true" data-season-board-frontier-id="${escape(seasonBoardFrontier.primaryFrontId || '')}" data-season-board-frontier-pressure="${escape(seasonBoardFrontier.statusId || '')}">${escape(seasonBoardFrontier.summaryLine || seasonBoardFrontier.guideLine || `诸界战线：${seasonBoardFrontier.primaryFrontLabel || '主战线'}`)}</div>` : ''}
                    ${seasonBoardFrontierDecree ? `<div class="reward-expedition-line muted" data-season-board-frontier-decree-reward="true" data-season-board-frontier-decree-id="${escape(seasonBoardFrontierDecree.id || '')}" data-season-board-frontier-decree-lane-id="${escape(seasonBoardFrontierDecree.laneId || '')}" data-season-board-frontier-decree-target="${escape(seasonBoardFrontierDecree.actionTargetLabel || '')}">${escape([seasonBoardFrontierDecree.summaryLine || seasonBoardFrontierDecree.title || '', seasonBoardFrontierDecree.constraintLine || ''].filter(Boolean).join(' · '))}</div>` : ''}
                    ${seasonBoardFrontierChronicle ? `<div class="reward-expedition-line muted" data-season-board-frontier-chronicle-reward="true" data-season-board-frontier-chronicle-id="${escape(seasonBoardFrontierChronicle.id || '')}" data-season-board-frontier-chronicle-lane-id="${escape(seasonBoardFrontierChronicle.laneId || '')}" data-season-board-frontier-chronicle-target="${escape(seasonBoardFrontierChronicle.actionTargetLabel || '')}">${escape([seasonBoardFrontierChronicle.summaryLine || seasonBoardFrontierChronicle.title || '', seasonBoardFrontierChronicle.progressLine || ''].filter(Boolean).join(' · '))}</div>` : ''}
                    ${seasonBoardFrontierCouncil ? `<div class="reward-expedition-line muted" data-season-board-frontier-council-reward="true" data-season-board-frontier-council-id="${escape(seasonBoardFrontierCouncil.id || '')}" data-season-board-frontier-council-lane-id="${escape(seasonBoardFrontierCouncil.laneId || '')}">${escape([seasonBoardFrontierCouncil.summaryLine || seasonBoardFrontierCouncil.title || '', seasonBoardFrontierCouncil.verdictLine || ''].filter(Boolean).join(' · '))}</div>` : ''}
                    ${seasonBoardDetailIntro ? `<div class="reward-expedition-line muted" data-season-board-detail="true">${escape(seasonBoardDetailIntro)}</div>` : ''}
                    ${seasonBoard?.progress?.progressText ? `<div class="reward-expedition-line muted" data-season-board-progress-row="true">${escape(`${seasonBoard.phaseLabel || '当前阶段'} · 赛季进度 ${seasonBoard.progress.progressText}`)}</div>` : ''}
                    ${seasonBoardGuideLine ? `<div class="reward-expedition-line muted" data-season-board-guide="overview">${escape(seasonBoardGuideLine)}</div>` : ''}
                    ${seasonBoardChips.length > 0 ? `<div class="reward-expedition-chip-row">${seasonBoardChips.join('')}</div>` : ''}
                </div>
            ` : ''}
            ${lineageLines.length > 0 ? `
                <div class="reward-expedition-section" data-fate-lineage-reward="true">
                    <div class="reward-expedition-section-title">命盘谱系</div>
                    <div class="reward-expedition-list">
                        ${lineageLines.map(line => `<div class="reward-expedition-line">${escape(line)}</div>`).join('')}
                    </div>
                    ${lineageChips.length > 0 ? `<div class="reward-expedition-chip-row">${lineageChips.join('')}</div>` : ''}
                </div>
            ` : ''}
            ${aftereffectLines.length > 0 ? `
                <div class="reward-expedition-section" data-fate-aftereffect-reward="true">
                    <div class="reward-expedition-section-title">界痕后效</div>
                    <div class="reward-expedition-list">
                        ${aftereffectLines.map(line => `<div class="reward-expedition-line" data-fate-aftereffect-reward-line="true">${escape(line)}</div>`).join('')}
                    </div>
                    ${aftereffectChips.length > 0 ? `<div class="reward-expedition-chip-row">${aftereffectChips.join('')}</div>` : ''}
                </div>
            ` : ''}
            ${meta.breakdown.length > 0 ? `
                <div class="reward-expedition-section compact">
                    <div class="reward-expedition-section-title">归卷留痕</div>
                    <div class="reward-expedition-list">
                        ${meta.breakdown.map(line => `<div class="reward-expedition-line muted">${escape(line)}</div>`).join('')}
                    </div>
                </div>
            ` : ''}
            ${chips.length > 0 ? `<div class="reward-expedition-chip-row">${chips.join('')}</div>` : ''}
            </div>
        `;
  }
  renderRewardRunPathMeta() {
    const panel = document.getElementById('reward-run-path-meta');
    if (!panel) return;
    const meta = this.game.lastRunPathRewardMeta;
    if (!meta || !Array.isArray(meta.entries) || meta.entries.length === 0) {
      panel.style.display = 'none';
      panel.classList.remove('is-complete');
      panel.innerHTML = '';
      return;
    }
    const escape = escapeHtml;
    const statusText = meta.completed ? '命途圆满' : `本场推进 ${meta.entries.length} 个阶段`;
    const finaleMarkup = meta.completed ? `
            <div class="reward-run-path-finale">
                <div class="reward-run-path-crest">✦ 圆满徽记已铭刻</div>
                <div class="reward-run-path-finale-copy">
                    这条命途的三段目标已全部兑现，本轮构筑会带着这枚收官印记继续推进。
                </div>
            </div>
        ` : '';
    const archiveMarkup = meta.completed && meta.archive ? `
            <div class="reward-run-path-archive">
                <div class="reward-run-path-archive-title">已收入洞府 · ${escape(meta.archive.recordName || meta.archive.name || '命途战录')}</div>
                <div class="reward-run-path-archive-copy">${escape(meta.archive.note || '圆满战录已收入洞府，可在藏经阁继续复盘。')}</div>
                <div class="reward-run-path-archive-meta">
                    ${escape(meta.archive.firstClear ? '首次收录' : `累计收录 ${meta.archive.clears || 1} 次`)}
                    ${meta.archive.lastCharacterName ? ` · 最近行者 ${escape(meta.archive.lastCharacterName)}` : ''}
                    ${meta.archive.lastRealm ? ` · 完成重数 ${escape(meta.archive.lastRealm)}` : ''}
                </div>
            </div>
        ` : '';
    const entryMarkup = meta.entries.map(entry => {
      const phaseLabel = [entry.phaseLabel, entry.title].filter(Boolean).join(' · ');
      const nextText = entry.completed ? '主线已圆满，本轮命途奖励全部兑现。' : entry.nextPhaseTitle ? `下一阶段：${[entry.nextPhaseLabel, entry.nextPhaseTitle].filter(Boolean).join(' · ')}` : '下一阶段已就绪。';
      return `
                <div class="reward-run-path-entry ${entry.completed ? 'completed' : ''}">
                    <div class="reward-run-path-phase">${escape(phaseLabel || '命途阶段')}</div>
                    ${entry.desc ? `<div class="reward-run-path-desc">${escape(entry.desc)}</div>` : ''}
                    <div class="reward-run-path-reward">${escape(entry.rewardText || '奖励已结算')}</div>
                    <div class="reward-run-path-next">${escape(nextText)}</div>
                </div>
            `;
    }).join('');
    panel.setAttribute('aria-live', 'polite');
    panel.style.display = 'block';
    panel.classList.toggle('is-complete', !!meta.completed);
    panel.open = typeof window === 'undefined' || !window.matchMedia('(max-width: 840px)').matches;
    panel.innerHTML = `
            <summary class="reward-disclosure-summary">
                <span>
                    <span class="reward-run-path-kicker">命途结算回响</span>
                    <strong>${escape(meta.icon || '✦')} ${escape(meta.name || '未知道途')}</strong>
                </span>
                <span class="reward-run-path-status ${meta.completed ? 'is-complete' : ''}">${escape(statusText)}</span>
            </summary>
            <div class="reward-disclosure-body">
            ${finaleMarkup}
            ${archiveMarkup}
            <div class="reward-run-path-entries">${entryMarkup}</div>
            </div>
        `;
  }
  updateRewardNextStepCard(state = 'pending', detail = '') {
    const card = document.getElementById('reward-next-step-card');
    if (!card) return;
    const normalized = ['pending', 'ready', 'required', 'blocked'].includes(String(state || '')) ? String(state) : 'pending';
    const copy = {
      pending: {
        kicker: '下一步',
        title: '先选牌或付费跳过',
        body: '完成本次战利取舍后，继续回章节地图选择下一处节点。'
      },
      ready: {
        kicker: '已就绪',
        title: '已选定奖励，可继续回章节地图',
        body: '继续前进会保存本场结算，并恢复地图上的关卡情报与节点选择。'
      },
      required: {
        kicker: '尚未完成',
        title: '请先选择一张卡牌奖励',
        body: detail || '选择一张卡牌，或支付灵石跳过本次卡牌后，才能继续回章节地图。'
      },
      blocked: {
        kicker: '暂不可跳过',
        title: '灵石不足，无法跳过',
        body: detail || '请选择一张奖励卡牌，或积累足够灵石后再跳过。'
      }
    }[normalized];
    card.dataset.rewardNextState = normalized;
    card.innerHTML = `
            <span class="reward-next-step-kicker">${escapeHtml(copy.kicker)}</span>
            <strong>${escapeHtml(copy.title)}</strong>
            <span>${escapeHtml(copy.body)}</span>
        `;
  }
  showRewardScreen(gold, canSteal, stealEnemy, ringExp = 0, strategicGain = null) {
    this.game.rewardCardSelected = false; // 重置选牌状态

    const stealSection = document.getElementById('steal-section');
    const stealBtn = document.getElementById('steal-btn');
    const stealText = document.getElementById('steal-text');
    const rewardGold = document.getElementById('reward-gold');
    const rewardCards = document.getElementById('reward-cards');

    // 关键修复：初始时禁用“继续前进”按钮，强制玩家选择或跳过
    const continueBtn = document.getElementById('continue-reward-btn');
    if (continueBtn) {
      continueBtn.disabled = true;
      continueBtn.textContent = '请选择奖励';
    }
    this.updateRewardNextStepCard('pending');
    this.setRewardScreenState('hidden');
    const bonusParts = [];
    const gainPayload = strategicGain && typeof strategicGain === 'object' ? strategicGain : {};
    if (Number(gainPayload.insight) > 0) bonusParts.push(`天机 +${Math.floor(Number(gainPayload.insight) || 0)}`);
    if (Number(gainPayload.karma) > 0) bonusParts.push(`业果 +${Math.floor(Number(gainPayload.karma) || 0)}`);
    rewardGold.textContent = `+${gold} 灵石 | 命环经验 +${ringExp}${bonusParts.length > 0 ? ' | ' + bonusParts.join(' | ') : ''}`;
    this.updateRewardHeaderCopy();
    this.renderRewardBattleMeta();
    this.renderRewardNarrativeBrief();
    this.renderRewardExpeditionMeta();
    this.renderRewardRunPathMeta();

    // 法宝掉落判定
    const resourceContainer = document.querySelector('.reward-resources');
    // 清理旧的掉落显示
    if (resourceContainer) {
      const existingTreasures = resourceContainer.querySelectorAll('.reward-treasure-item, .reward-strategy-item');
      existingTreasures.forEach(el => el.remove());
      if (Number(gainPayload.insight) > 0) {
        const insightItem = document.createElement('div');
        insightItem.className = 'reward-item reward-strategy-item';
        insightItem.innerHTML = `<span class="icon">🔮</span> <span>获得天机：+${Math.floor(Number(gainPayload.insight) || 0)}</span>`;
        resourceContainer.appendChild(insightItem);
      }
      if (Number(gainPayload.karma) > 0) {
        const karmaItem = document.createElement('div');
        karmaItem.className = 'reward-item reward-strategy-item';
        karmaItem.innerHTML = `<span class="icon">🜂</span> <span>获得业果：+${Math.floor(Number(gainPayload.karma) || 0)}</span>`;
        resourceContainer.appendChild(karmaItem);
      }
    }
    let dropChance = 0.08; // Hardcore: 普通8%
    if (this.game.currentBattleNode && this.game.currentBattleNode.type === 'elite') dropChance = 0.25; // Hardcore: 精英25%
    if (this.game.currentBattleNode && this.game.currentBattleNode.type === 'boss') dropChance = 0.60; // Hardcore: Boss 60%
    if (this.game.currentBattleNode && this.game.currentBattleNode.type === 'ghost_duel') dropChance = 0.3;
    dropChance += Math.max(0, this.game.consumeTreasureRumorBoost(this.game.currentBattleNode?.type || ''));
    if (Math.random() < dropChance) {
      let droppedTreasure = null;

      // Boss特定掉落逻辑：检查击败的敌人是否有克制法宝
      if (this.game.currentBattleNode && this.game.currentBattleNode.type === 'boss' && this.game.battle && this.game.battle.enemies) {
        const bossEnemy = this.game.battle.enemies.find(e => e.isBoss);
        if (bossEnemy) {
          // 获取原始ID (去除 _A, _B 后缀)
          const originalId = bossEnemy.id.replace(/_[AB]$/, '');

          // 获取克制该Boss的法宝
          let counterTreasures = [];
          if (typeof getCounterTreasures === 'function') {
            counterTreasures = getCounterTreasures(originalId);
          } else if (typeof BOSS_MECHANICS !== 'undefined' && BOSS_MECHANICS[originalId]) {
            counterTreasures = BOSS_MECHANICS[originalId].countersBy || [];
            // Convert string IDs to treasure objects if needed, but logic below expects IDs or Objects?
            // BOSS_MECHANICS uses string IDs.
            // map to objects if needed? No, logic uses t.id check below.
            // But BOSS_MECHANICS.countersBy is array of strings usually?
            // Let's check BOSS_MECHANICS definition (Step 22).
            // countersBy: ['pressure_talisman'] -> Strings.
            // Logic below: filter(t => !player.hasTreasure(t.id)) implies t is Object!
            // So we must map string IDs to Treasure Objects.
            if (counterTreasures.length > 0 && typeof counterTreasures[0] === 'string') {
              if (typeof TREASURES !== 'undefined') {
                counterTreasures = counterTreasures.map(id => TREASURES[id]).filter(Boolean);
              }
            }
          }

          // 过滤玩家未拥有的
          const unownedCounters = counterTreasures.filter(t => !this.game.player.hasTreasure(t.id));

          // 50%概率掉落克制法宝，50%概率随机
          if (unownedCounters.length > 0 && Math.random() < 0.5) {
            droppedTreasure = unownedCounters[Math.floor(Math.random() * unownedCounters.length)];
            Utils.showBattleLog(`【Boss战利品】获得克制法宝！`);
          }
        }
      }

      // 如果没有特定掉落，使用权重随机
      if (!droppedTreasure) {
        droppedTreasure = this.game.getWeightedRandomTreasure();
      }
      if (droppedTreasure) {
        // 自动获取
        this.game.player.addTreasure(droppedTreasure.id);
        const tItem = document.createElement('div');
        tItem.className = 'reward-item reward-treasure-item';
        tItem.style.color = 'var(--accent-gold)';
        tItem.style.cursor = 'help';
        tItem.title = droppedTreasure.description;
        const label = this.game.getRarityLabel ? this.game.getRarityLabel(droppedTreasure.rarity) : '';
        const icon = droppedTreasure.icon || '📦';
        tItem.innerHTML = `<span class="icon">${icon}</span> <span>获得法宝：${droppedTreasure.name} ${label}</span>`;
        resourceContainer.appendChild(tItem);
        Utils.showBattleLog(`战斗胜利！获得法宝: ${droppedTreasure.name}`);
      }
    }

    // 法则盗取部分
    if (canSteal && stealEnemy && !this.game.stealAttempted) {
      stealSection.style.display = 'grid';
      const lawName = LAWS[stealEnemy.stealLaw]?.name || '神秘法则';
      stealText.textContent = `你感受到敌人体内残留的${lawName}力量...`;
      stealBtn.disabled = false;
      stealBtn.dataset.lawId = stealEnemy.stealLaw;
      stealBtn.dataset.chance = stealEnemy.stealChance;
      this.setRewardScreenState('ready');
    } else {
      stealSection.style.display = 'none';
      this.setRewardScreenState('hidden');
    }

    // 卡牌奖励
    rewardCards.innerHTML = '';
    const rewardCardCount = this.game.currentBattleNode && this.game.currentBattleNode.type === 'trial' ? 3 : 2;
    const cards = this.game.getRewardCardsForCurrentRun(rewardCardCount);
    cards.forEach((card, index) => {
      const cardEl = Utils.createCardElement(card, index);
      const rewardCardId = `${String(card?.id || 'reward-card')}-${index}`;
      const rewardCardLabel = this.buildRewardCardAriaLabel(card);
      cardEl.classList.add('reward-card');
      cardEl.classList.add(`rarity-${card.rarity || 'common'}`);
      cardEl.dataset.rewardCardId = rewardCardId;
      cardEl.dataset.rewardCardLabel = rewardCardLabel;
      cardEl.setAttribute('role', 'button');
      cardEl.setAttribute('tabindex', '0');
      cardEl.setAttribute('aria-pressed', 'false');
      cardEl.setAttribute('aria-disabled', 'false');
      cardEl.setAttribute('aria-label', rewardCardLabel);
      cardEl.addEventListener('click', () => {
        this.handleRewardCardSelection(card, cardEl, rewardCards);
      });
      cardEl.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
        event.preventDefault();
        cardEl.click();
      });
      rewardCards.appendChild(cardEl);
    });

    // 动态更新跳过按钮文本
    const skipBtn = this.game.currentScreenElement ? this.game.currentScreenElement.querySelector('.skip-reward-btn') : document.querySelector('.skip-reward-btn');
    if (skipBtn) {
      const skipCost = this.getRewardSkipCost();
      skipBtn.textContent = `跳过卡牌 (扣${skipCost}灵石)`;
      // Visual indicator if affordable
      if (this.game.player.gold < skipCost) {
        skipBtn.style.opacity = '0.6';
        skipBtn.style.cursor = 'not-allowed';
        skipBtn.title = '灵石不足';
      } else {
        skipBtn.style.opacity = '1';
        skipBtn.style.cursor = 'pointer';
        skipBtn.title = '';
      }
    }
    this.game.showScreen('reward-screen');
  }
  buildRewardCardAriaLabel(card) {
    const name = String(card?.name || '未知卡牌').trim() || '未知卡牌';
    const rarity = Utils.getCardRarityName(card?.rarity || 'common');
    const type = Utils.getCardTypeName(card?.type || '');
    return [`选择奖励卡牌`, name, rarity ? `${rarity}品质` : '', type ? `${type}牌` : ''].filter(Boolean).join('，');
  }
  syncRewardCardSelectionState(selectedRewardCardId = '') {
    const selectedId = String(selectedRewardCardId || '');
    document.querySelectorAll('#reward-cards .reward-card').forEach((rewardCardEl) => {
      const isSelected = selectedId !== '' && rewardCardEl.dataset.rewardCardId === selectedId;
      rewardCardEl.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      rewardCardEl.setAttribute('tabindex', isSelected ? '0' : '-1');
      rewardCardEl.setAttribute('aria-disabled', selectedId ? 'true' : 'false');
      const baseLabel = rewardCardEl.dataset.rewardCardLabel || '选择奖励卡牌';
      rewardCardEl.setAttribute('aria-label', isSelected ? `已选择，${baseLabel}` : baseLabel);
    });
  }
  handleRewardCardSelection(card, cardEl, rewardCards) {
    if (this.game.rewardCardSelected) return;
    this.game.rewardCardSelected = true;
    this.selectRewardCard(card);
    this.syncRewardCardSelectionState(cardEl?.dataset?.rewardCardId || card?.id || '');

    // 禁用其他卡牌
    rewardCards.querySelectorAll('.card').forEach(c => {
      if (c !== cardEl) {
        c.style.opacity = '0.3';
        c.style.pointerEvents = 'none';
      }
    });
    if (cardEl) {
      cardEl.style.border = '3px solid var(--accent-gold)';
      cardEl.style.transform = 'scale(1.1)';
      if (typeof cardEl.focus === 'function') {
        cardEl.focus({ preventScroll: true });
      }
    }
  }
  selectRewardCard(card) {
    this.game.rewardCardSelected = true;
    this.game.player.addCardToDeck(card);
    Utils.showBattleLog(`获得卡牌: ${card.name}`);

    // 更新成就 - 收集新卡牌
    this.game.achievementSystem.updateStat('uniqueCards', card.id);

    // 启用继续按钮
    const continueBtn = document.getElementById('continue-reward-btn');
    if (continueBtn) {
      continueBtn.disabled = false;
      continueBtn.textContent = '继续前进';
    }
    this.updateRewardNextStepCard('ready');
  }
  skipRewardCard() {
    const cost = this.getRewardSkipCost();
    if (this.game.player.gold >= cost) {
      this.game.player.gold -= cost;
      Utils.showBattleLog(`跳过卡牌奖励，扣除 ${cost} 灵石`);

      // 跳过视为已选择，且直接继续
      this.game.rewardCardSelected = true;
      this.continueAfterReward();
    } else {
      Utils.showBattleLog(`灵石不足！需要 ${cost} 灵石才能跳过`);
      this.updateRewardNextStepCard('blocked', `跳过本次卡牌需要 ${cost} 灵石；当前灵石不足，请选择一张奖励。`);
      // 不启用继续按钮
    }
  }
  attemptSteal() {
    const stealBtn = document.getElementById('steal-btn');
    const stealText = document.getElementById('steal-text');
    const lawId = stealBtn.dataset.lawId;
    const baseChance = parseFloat(stealBtn.dataset.chance);
    this.game.stealAttempted = true;
    stealBtn.disabled = true;
    const totalChance = baseChance + this.game.player.getStealBonus();
    const success = Math.random() < totalChance;
    if (success && LAWS[lawId]) {
      const law = {
        ...LAWS[lawId]
      };
      const added = this.game.player.collectLaw(law);
      if (added) {
        stealText.innerHTML = `<span style="color: var(--accent-gold)">✨ 盗取成功！获得【${law.name}】！</span>`;

        // 粒子特效
        if (typeof particles !== 'undefined') {
          particles.stealSuccessEffect(stealBtn);
        }

        // 更新成就
        this.game.achievementSystem.updateStat('lawsCollected', 1);
        if (!this.game.achievementSystem.stats.firstStealSuccess) {
          this.game.achievementSystem.updateStat('firstStealSuccess', true, 'set');
        }

        // 命环经验额外奖励
        this.game.player.fateRing.exp += 50;
        this.game.player.checkFateRingLevelUp();
        if (law.unlockCards && law.unlockCards.length > 0) {
          const cardName = CARDS[law.unlockCards[0]]?.name || '神秘卡牌';
          stealText.innerHTML += `<br><span style="color: var(--accent-purple)">解锁法则牌：${cardName}</span>`;
        }
        this.setRewardScreenState('success');
      } else {
        // 补偿机制
        let compensationMsg = `<span style="color: var(--text-secondary)">你已经掌握了这个法则</span>`;

        // 给予补偿：50灵石 + 20命环经验
        this.game.player.gold += 50;
        this.game.player.fateRing.exp += 20;
        this.game.player.checkFateRingLevelUp();
        compensationMsg += `<br><span style="color: var(--accent-gold)">获得补偿：50灵石，20命环经验</span>`;
        stealText.innerHTML = compensationMsg;
        this.setRewardScreenState('success');

        // 更新UI
        this.game.updatePlayerDisplay();
      }
    } else {
      stealText.innerHTML = `<span style="color: var(--text-muted)">盗取失败……法则残留消散了</span>`;
      this.setRewardScreenState('failed');
    }
  }
  continueAfterReward() {
    // 双重保险：必须已选择卡牌（包括跳过）
    if (!this.game.rewardCardSelected) {
      Utils.showBattleLog('请先选择一张卡牌奖励，或支付灵石跳过');
      this.updateRewardNextStepCard('required');
      return;
    }

    // 使用保存的当前战斗节点
    // FIX: 在 onBattleWon 中已经调用过 completeNode。
    //这里再次调用会导致Boss关卡重复结算（因为新地图生成后ID冲突），造成跳关。
    // if (this.game.currentBattleNode) {
    //    this.game.map.completeNode(this.game.currentBattleNode);
    //    this.game.currentBattleNode = null;
    // }

    // 确保清除当前节点引用
    this.game.currentBattleNode = null;
    this.game.lastExpeditionRewardMeta = null;
    this.game.lastRunPathRewardMeta = null;
    this.game.dismissRunPathMapFeedback();
    this.game.autoSave();
    this.game.showScreen('map-screen');
  }
  showRewardModal(title, message, icon = '🎁', onClose = null) {
    let modal = document.getElementById('reward-modal');

    // 动态创建模态框
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'reward-modal';
      modal.className = 'modal';
      modal.style.zIndex = '10001'; // 比通用高一点
      modal.innerHTML = `
                <div class="modal-content reward-popup-content">
                    <div id="reward-icon" style="font-size: 4rem; margin-bottom: 20px; animation: bounce 1s infinite;">🎁</div>
                    <h3 id="reward-title" style="color: var(--accent-gold); margin-bottom: 15px; font-size: 1.5rem;">获得奖励</h3>
                    <p id="reward-message" style="color: #fff; margin-bottom: 30px; line-height: 1.6; font-size: 1.1rem; white-space: pre-line;"></p>
                    <button id="reward-confirm-btn" class="menu-btn primary">收下</button>
                </div>
            `;
      document.body.appendChild(modal);

      // 绑定事件
      const btn = modal.querySelector('#reward-confirm-btn');
      btn.onclick = () => {
        this.game.closeRewardModal({
          invokeCallback: true
        });
        if (typeof audioManager !== 'undefined') audioManager.playSFX('click');
      };
    }

    // 更新内容
    modal.querySelector('#reward-title').textContent = title;
    modal.querySelector('#reward-message').textContent = message;
    modal.querySelector('#reward-icon').textContent = icon;
    modal.onCloseCallback = onClose;

    // 显示
    modal.classList.add('active');
    if (typeof audioManager !== 'undefined') audioManager.playSFX('buff'); // 使用buff音效作为奖励音效
  }
}
// Temporary export mechanism
if (typeof window !== 'undefined') {}
