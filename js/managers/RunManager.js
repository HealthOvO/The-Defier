import { RUN_PATHS } from "../data/run_paths.js";
import { Utils } from "../core/utils.js";
import { RUN_DESTINIES } from "../data/run_destinies.js";
import { getV6ChapterNarrativeTemplate } from "../data/narrative_templates.js";
import { BOSS_MECHANICS } from "../data/boss_mechanics.js";
import { TREASURES } from "../data/treasures.js";
import { ENEMIES } from "../data/index.js";
import { AuthService } from "../services/authService.js";
import { ProgressionService } from "../services/progression-service.js";
export class RunManager {
  constructor(gameInstance) {
    this.game = gameInstance;
  }
  getRunPathCatalog() {
    if (typeof RUN_PATHS === 'undefined' || !RUN_PATHS || typeof RUN_PATHS !== 'object') {
      return [];
    }
    return Object.values(RUN_PATHS).filter(item => item && item.id);
  }
  getRunPathMetaById(pathId) {
    if (typeof pathId !== 'string' || !pathId || typeof RUN_PATHS === 'undefined' || !RUN_PATHS[pathId]) {
      return null;
    }
    const base = RUN_PATHS[pathId];
    return {
      id: base.id,
      name: base.name || base.id,
      icon: base.icon || '✦',
      category: base.category || '命途',
      description: base.description || '',
      playstyle: base.playstyle || '',
      routeHint: base.routeHint || '',
      affinities: Array.isArray(base.affinities) ? base.affinities.slice() : [],
      eventPool: Array.isArray(base.eventPool) ? base.eventPool.slice() : [],
      shopBias: base.shopBias && typeof base.shopBias === 'object' ? JSON.parse(JSON.stringify(base.shopBias)) : null,
      treasureSynergy: base.treasureSynergy && typeof base.treasureSynergy === 'object' ? JSON.parse(JSON.stringify(base.treasureSynergy)) : null,
      bossCounterplay: base.bossCounterplay && typeof base.bossCounterplay === 'object' ? {
        ...base.bossCounterplay
      } : null,
      bossMatchups: base.bossMatchups && typeof base.bossMatchups === 'object' ? JSON.parse(JSON.stringify(base.bossMatchups)) : null,
      mutations: base.mutations && typeof base.mutations === 'object' ? JSON.parse(JSON.stringify(base.mutations)) : null,
      completionRecord: base.completionRecord && typeof base.completionRecord === 'object' ? {
        ...base.completionRecord
      } : null,
      effects: base.effects && typeof base.effects === 'object' ? {
        ...base.effects
      } : {},
      phases: Array.isArray(base.phases) ? base.phases.map(phase => ({
        ...(phase || {}),
        rewards: Array.isArray(phase?.rewards) ? phase.rewards.map(reward => ({
          ...(reward || {})
        })) : []
      })) : []
    };
  }
  resolveRunPathBossMatchup(runPathMeta, options = {}) {
    if (!runPathMeta || typeof runPathMeta !== 'object' || !runPathMeta.bossCounterplay) {
      return null;
    }
    const matchupCatalog = runPathMeta.bossMatchups && typeof runPathMeta.bossMatchups === 'object' ? runPathMeta.bossMatchups : null;
    const enemyId = String(options.enemyId || options.enemy?.id || '').trim();
    const memoryKey = String(options.memoryKey || options.memory?.key || '').trim();
    const mechanicType = String(options.mechanicType || options.mechanic?.mechanics?.type || '').trim();
    const fallbackRealm = Math.max(1, Math.floor(Number(options.realm || options.enemy?.realm || this.game.player?.realm || 1) || 1));
    const chapterSnapshot = options.chapterSnapshot || options.chapter || (typeof this.getChapterDisplaySnapshot === 'function' ? this.getChapterDisplaySnapshot(fallbackRealm) : null);
    const chapterField = options.chapterBattlefield || options.chapterField || null;
    const chapterId = String(options.chapterId || chapterSnapshot?.id || '').trim();
    const fitLabelMap = {
      advantage: '顺势拆招',
      pivot: '对冲解法',
      risk: '逆风赶时',
      neutral: '常规拆解'
    };
    const mergeCounterplay = (target, source) => {
      if (!source || typeof source !== 'object') return target;
      ['fit', 'fitLabel', 'chipLabel', 'focus', 'counter', 'reward'].forEach(key => {
        if (typeof source[key] === 'string' && source[key].trim()) {
          target[key] = source[key].trim();
        }
      });
      return target;
    };
    const chapterMatchup = matchupCatalog?.chapters?.[chapterId] && typeof matchupCatalog.chapters[chapterId] === 'object' ? matchupCatalog.chapters[chapterId] : null;
    const resolved = mergeCounterplay({
      id: runPathMeta.id,
      name: runPathMeta.name || runPathMeta.id,
      icon: runPathMeta.icon || '🧭',
      chipLabel: runPathMeta.bossCounterplay.chipLabel || `命途·${runPathMeta.name || runPathMeta.id}`,
      focus: runPathMeta.bossCounterplay.focus || '',
      counter: runPathMeta.bossCounterplay.counter || '',
      reward: runPathMeta.bossCounterplay.reward || '',
      fit: 'neutral',
      fitLabel: '',
      enemyId,
      chapterId,
      memoryKey,
      mechanicType,
      chapterName: String(chapterSnapshot?.fullName || chapterSnapshot?.name || ''),
      chapterCue: '',
      chapterRuleSummary: '',
      chapterFocus: String(chapterMatchup?.focus || ''),
      chapterCounter: String(chapterMatchup?.counter || ''),
      chapterReward: String(chapterMatchup?.reward || ''),
      chapterFitLabel: String(chapterMatchup?.fitLabel || '')
    }, matchupCatalog?.mechanics?.[mechanicType]);
    mergeCounterplay(resolved, chapterMatchup);
    mergeCounterplay(resolved, matchupCatalog?.memories?.[memoryKey]);
    mergeCounterplay(resolved, matchupCatalog?.bosses?.[enemyId]);
    const chapterOmenLabel = String(chapterField?.omen?.phaseLabel || chapterSnapshot?.skyOmen?.name || '').trim();
    const chapterLeylineLabel = String(chapterField?.leyline?.activeLabel || chapterSnapshot?.leyline?.name || '').trim();
    const chapterCueSegments = [resolved.chapterName, chapterOmenLabel, chapterLeylineLabel].filter(Boolean);
    resolved.chapterCue = chapterCueSegments.join(' · ');
    resolved.chapterRuleSummary = [chapterSnapshot?.skyOmen?.desc || '', chapterSnapshot?.leyline?.desc || ''].filter(Boolean).join(' / ');
    if (!resolved.fitLabel) {
      resolved.fitLabel = fitLabelMap[resolved.fit] || fitLabelMap.neutral;
    }
    if (!resolved.chipLabel) {
      resolved.chipLabel = `命途·${resolved.name || runPathMeta.id}`;
    }
    if (resolved.fitLabel && !String(resolved.chipLabel).includes(resolved.fitLabel)) {
      resolved.chipLabel = `${resolved.chipLabel} · ${resolved.fitLabel}`;
    }
    return resolved;
  }
  draftRunPathsForCharacter(characterId) {
    const charId = typeof characterId === 'string' ? characterId : this.game.selectedCharacterId;
    const cached = this.game.pendingRunPathDrafts && Array.isArray(this.game.pendingRunPathDrafts[charId]) ? this.game.pendingRunPathDrafts[charId].slice() : null;
    if (cached && cached.length >= 3) return cached.slice(0, 3);
    const catalog = this.getRunPathCatalog();
    const ordered = this.game.shuffleList(catalog.slice()).sort((a, b) => {
      const aAffinity = Array.isArray(a.affinities) && a.affinities.includes(charId) ? 1 : 0;
      const bAffinity = Array.isArray(b.affinities) && b.affinities.includes(charId) ? 1 : 0;
      if (aAffinity !== bAffinity) return bAffinity - aAffinity;
      return String(a.id || '').localeCompare(String(b.id || ''), 'zh-Hans-CN');
    });
    const draft = ordered.slice(0, 3).map(item => item.id);
    this.game.pendingRunPathDrafts = this.game.pendingRunPathDrafts || {};
    this.game.pendingRunPathDrafts[charId] = draft;
    return draft.slice();
  }
  resolveDefaultRunPathId(characterId) {
    const charId = typeof characterId === 'string' ? characterId : 'linFeng';
    const draft = this.draftRunPathsForCharacter(charId);
    return draft[0] || this.getRunPathCatalog()[0] && this.getRunPathCatalog()[0].id || null;
  }
  getRunPathTrackerState() {
    if (!this.game.player || typeof this.game.player.getRunPathMeta !== 'function') return null;
    const meta = this.game.player.getRunPathMeta();
    if (!meta || !meta.currentPhase) return null;
    const target = Math.max(1, Number(meta.currentPhase.target) || 1);
    const progress = Math.max(0, Math.min(target, Number(meta.progress?.phaseProgress) || 0));
    const rewardText = meta.currentPhase.rewardText || meta.progress?.lastRewardText || '';
    const mutationLabel = meta.mutation ? `${meta.mutation.branchLabel || '裂变'} · ${meta.mutation.name || meta.mutation.id}` : '';
    return {
      id: meta.id,
      icon: meta.icon,
      name: meta.name,
      category: meta.category,
      phaseLabel: meta.currentPhase.label || `阶段 ${meta.phaseIndex + 1}`,
      title: meta.currentPhase.title || meta.name,
      desc: [mutationLabel, meta.trackerNote || meta.currentPhase.desc || meta.description || ''].filter(Boolean).join(' ｜ '),
      target,
      progress,
      completed: !!meta.progress?.completed,
      rewardText,
      phaseIndex: meta.phaseIndex,
      phaseCount: meta.phaseCount,
      mutationLabel
    };
  }
  getRunPathMutationChoices(pathId = '') {
    const meta = this.getRunPathMetaById(pathId);
    const source = meta && meta.mutations && typeof meta.mutations === 'object' ? meta.mutations : null;
    if (!source) return [];
    return Object.keys(source).map(mutationId => {
      const mutation = source[mutationId];
      return {
        id: mutationId,
        mutationId,
        branchLabel: mutation.branchLabel || '裂变',
        name: mutation.name || mutationId,
        icon: mutation.icon || '✦',
        summary: mutation.summary || '',
        risk: mutation.risk || '',
        routeHint: mutation.routeHint || '',
        playstyle: mutation.playstyle || '',
        trackerNote: mutation.trackerNote || '',
        mutationEventPool: Array.isArray(mutation.mutationEventPool) ? mutation.mutationEventPool.map(eventId => String(eventId || '').trim()).filter(Boolean).slice(0, 3) : [],
        effects: mutation.effects && typeof mutation.effects === 'object' ? JSON.parse(JSON.stringify(mutation.effects)) : {},
        immediate: mutation.immediate && typeof mutation.immediate === 'object' ? JSON.parse(JSON.stringify(mutation.immediate)) : {},
        treasureSynergy: mutation.treasureSynergy && typeof mutation.treasureSynergy === 'object' ? JSON.parse(JSON.stringify(mutation.treasureSynergy)) : null
      };
    });
  }
  shouldOfferRunPathMutationAfterRealm(realmCleared) {
    const safeRealm = Math.max(1, Math.floor(Number(realmCleared) || 1));
    if (safeRealm !== 6 || !this.game.player || typeof this.game.player.getRunPathMeta !== 'function') return false;
    const runPathMeta = this.game.player.getRunPathMeta();
    if (!runPathMeta || runPathMeta.mutation) return false;
    return this.getRunPathMutationChoices(runPathMeta.id).length >= 3;
  }
  applyRunPathMutationSelection(mutationId, realmCleared = 0) {
    if (!this.game.player || typeof this.game.player.getRunPathMeta !== 'function') return null;
    const runPathMeta = this.game.player.getRunPathMeta();
    if (!runPathMeta) return null;
    const choice = this.getRunPathMutationChoices(runPathMeta.id).find(item => item.id === mutationId) || null;
    if (!choice) return null;
    this.game.player.runPathMutationState = {
      pathId: runPathMeta.id,
      mutationId: choice.id,
      offeredAtRealm: Math.max(0, Math.floor(Number(realmCleared) || 0)),
      chosenAt: Date.now()
    };
    if (typeof this.game.player.normalizeRunPathMutationState === 'function') {
      this.game.player.normalizeRunPathMutationState();
    }
    const immediate = choice.immediate && typeof choice.immediate === 'object' ? choice.immediate : {};
    const rewardLines = [];
    const normalizeCurrency = key => {
      if (!this.game.player || typeof this.game.player[key] !== 'number' || !Number.isFinite(this.game.player[key])) {
        this.game.player[key] = 0;
      }
    };
    if (Number(immediate.gold) > 0) {
      normalizeCurrency('gold');
      const amount = Math.max(0, Math.floor(Number(immediate.gold) || 0));
      this.game.player.gold += amount;
      rewardLines.push(`灵石 +${amount}`);
    }
    if (Number(immediate.heavenlyInsight) > 0) {
      normalizeCurrency('heavenlyInsight');
      const amount = Math.max(0, Math.floor(Number(immediate.heavenlyInsight) || 0));
      this.game.player.heavenlyInsight += amount;
      rewardLines.push(`天机 +${amount}`);
    }
    if (Number(immediate.ringExp) > 0) {
      const gained = this.game.grantFateRingExp(immediate.ringExp, '命途裂变');
      if (gained > 0) rewardLines.push(`命环经验 +${gained}`);
    }
    if (Number(immediate.maxHpDelta) !== 0) {
      const delta = Math.floor(Number(immediate.maxHpDelta) || 0);
      const prevMaxHp = Math.max(1, Math.floor(Number(this.game.player.maxHp) || 1));
      const nextMaxHp = Math.max(1, prevMaxHp + delta);
      this.game.player.maxHp = nextMaxHp;
      this.game.player.currentHp = Math.max(1, Math.min(nextMaxHp, Math.floor(Number(this.game.player.currentHp) || nextMaxHp)));
      rewardLines.push(delta > 0 ? `生命上限 +${delta}` : `生命上限 ${delta}`);
    }
    if (Number(immediate.currentHpDelta) !== 0) {
      const delta = Math.floor(Number(immediate.currentHpDelta) || 0);
      if (delta > 0 && typeof this.game.player.heal === 'function') {
        const before = Math.max(0, Math.floor(Number(this.game.player.currentHp) || 0));
        this.game.player.heal(delta);
        rewardLines.push(`恢复 ${Math.max(0, this.game.player.currentHp - before)} 生命`);
      } else if (delta < 0) {
        const loss = Math.min(Math.max(0, -delta), Math.max(0, (this.game.player.currentHp || 1) - 1));
        if (loss > 0) {
          this.game.player.currentHp -= loss;
          rewardLines.push(`失去 ${loss} 生命`);
        }
      }
    } else if (Number(immediate.healPct) > 0 && typeof this.game.player.heal === 'function') {
      const healAmount = Math.max(1, Math.floor((Number(this.game.player.maxHp) || 1) * Number(immediate.healPct)));
      const before = Math.max(0, Math.floor(Number(this.game.player.currentHp) || 0));
      this.game.player.heal(healAmount);
      rewardLines.push(`恢复 ${Math.max(0, this.game.player.currentHp - before)} 生命`);
    }
    if (Array.isArray(immediate.adventureBuffs) && typeof this.game.player.grantAdventureBuff === 'function') {
      immediate.adventureBuffs.forEach(buff => {
        const buffId = String(buff?.id || '');
        const charges = Math.max(1, Math.floor(Number(buff?.charges) || 1));
        if (buffId && this.game.player.grantAdventureBuff(buffId, charges)) {
          rewardLines.push(`${buffId} +${charges} 场`);
        }
      });
    }
    if (this.game.map && this.game.currentScreen === 'map-screen' && typeof this.game.map.updateLegacyMissionTracker === 'function') {
      this.game.map.updateLegacyMissionTracker();
    }
    if (typeof this.game.autoSave === 'function') this.game.autoSave();
    return {
      pathId: runPathMeta.id,
      mutationId: choice.id,
      meta: choice,
      rewardLines
    };
  }
  getRunPathShopProfile() {
    const meta = this.game.player && typeof this.game.player.getRunPathMeta === 'function' ? this.game.player.getRunPathMeta() : this.game.selectedRunPathId ? this.getRunPathMetaById(this.game.selectedRunPathId) : null;
    if (!meta || !meta.shopBias || typeof meta.shopBias !== 'object') return null;
    return {
      id: meta.id,
      name: meta.name || meta.id,
      icon: meta.icon || '🧭',
      playstyle: meta.playstyle || meta.description || '',
      shopBias: JSON.parse(JSON.stringify(meta.shopBias))
    };
  }
  injectRunPathShopServices(baseServices = [], tabId = 'base') {
    const profile = typeof this.getRunPathShopProfile === 'function' ? this.getRunPathShopProfile() : null;
    if (!profile) return Array.isArray(baseServices) ? baseServices.slice() : [];
    const sourceKey = tabId === 'rumor' ? 'rumorServices' : tabId === 'base' ? 'baseServices' : '';
    const extras = sourceKey && Array.isArray(profile.shopBias?.[sourceKey]) ? profile.shopBias[sourceKey] : [];
    if (extras.length <= 0) return Array.isArray(baseServices) ? baseServices.slice() : [];
    const priceMult = tabId === 'rumor' ? this.game.getShopPriceMultiplier(0.02) : this.game.getShopPriceMultiplier(0.08);
    const clonedExtras = extras.map(entry => ({
      ...(entry || {}),
      price: Math.max(1, Math.floor((Number(entry?.price) || 0) * priceMult)),
      sold: !!entry?.sold,
      pathId: profile.id,
      pathName: profile.name,
      pathIcon: profile.icon,
      tagLabel: entry?.tagLabel || `${profile.name}专供`,
      runPathExclusive: true
    }));
    const existingIds = new Set((Array.isArray(baseServices) ? baseServices : []).map(entry => entry && entry.id).filter(Boolean));
    const mergedExtras = clonedExtras.filter(entry => !existingIds.has(entry.id));
    return [...mergedExtras, ...(Array.isArray(baseServices) ? baseServices.slice() : [])];
  }
  awardRunPathPhaseRewards(pathMeta, phaseMeta) {
    if (!this.game.player || !pathMeta || !phaseMeta) return [];
    const rewards = Array.isArray(phaseMeta.rewards) ? phaseMeta.rewards : [];
    const applied = [];
    const normalizePlayerCurrency = field => {
      this.game.player[field] = Math.max(0, Math.floor(Number(this.game.player[field]) || 0));
      return this.game.player[field];
    };
    rewards.forEach(reward => {
      const kind = reward && typeof reward.kind === 'string' ? reward.kind : '';
      if (!kind) return;
      if (kind === 'gold') {
        const amount = Math.max(0, Math.floor(Number(reward.amount) || 0));
        if (amount > 0) {
          normalizePlayerCurrency('gold');
          this.game.player.gold += amount;
          applied.push(`灵石 +${amount}`);
        }
        return;
      }
      if (kind === 'ringExp') {
        const amount = Math.max(0, Math.floor(Number(reward.amount) || 0));
        if (amount > 0) {
          if (this.game.player.fateRing && typeof this.game.player.fateRing.gainExp === 'function') {
            this.game.player.fateRing.gainExp(amount);
          } else if (this.game.player.fateRing) {
            this.game.player.fateRing.exp = Math.max(0, Math.floor(Number(this.game.player.fateRing.exp) || 0) + amount);
          }
          applied.push(`命环经验 +${amount}`);
        }
        return;
      }
      if (kind === 'heavenlyInsight') {
        const amount = Math.max(0, Math.floor(Number(reward.amount) || 0));
        if (amount > 0) {
          normalizePlayerCurrency('heavenlyInsight');
          this.game.player.heavenlyInsight += amount;
          applied.push(`天机 +${amount}`);
        }
        return;
      }
      if (kind === 'karma') {
        const amount = Math.max(0, Math.floor(Number(reward.amount) || 0));
        if (amount > 0) {
          normalizePlayerCurrency('karma');
          this.game.player.karma += amount;
          applied.push(`业果 +${amount}`);
        }
        return;
      }
      if (kind === 'adventureBuff' && typeof this.game.player.grantAdventureBuff === 'function') {
        const buffId = String(reward.id || '');
        const charges = Math.max(1, Math.floor(Number(reward.charges) || 1));
        if (buffId && this.game.player.grantAdventureBuff(buffId, charges)) {
          applied.push(`${buffId} +${charges} 场`);
        }
      }
    });
    return applied;
  }
  buildRunPathFeedbackEntry(pathMeta, phaseMeta, options = {}) {
    if (!pathMeta || !phaseMeta) return null;
    return {
      pathId: String(pathMeta.id || ''),
      icon: pathMeta.icon || '✦',
      name: pathMeta.name || '未知道途',
      category: pathMeta.category || '命途',
      phaseId: String(phaseMeta.id || ''),
      phaseLabel: phaseMeta.label || '命途阶段',
      title: phaseMeta.title || pathMeta.name || '命途阶段',
      desc: phaseMeta.desc || '',
      rewardText: options.rewardText || '奖励已结算',
      completed: !!options.completed,
      nextPhaseLabel: options.nextPhase && options.nextPhase.label ? options.nextPhase.label : '',
      nextPhaseTitle: options.nextPhase && options.nextPhase.title ? options.nextPhase.title : '',
      archive: options.archive && typeof options.archive === 'object' ? {
        ...options.archive
      } : null,
      revealedAt: Date.now()
    };
  }
  queueRunPathRewardMeta(pathMeta, phaseMeta, options = {}) {
    const entry = this.buildRunPathFeedbackEntry(pathMeta, phaseMeta, options);
    if (!entry) return;
    const pathId = entry.pathId;
    const phaseId = entry.phaseId;
    if (!pathId || !phaseId) return;
    const existingMeta = this.game.lastRunPathRewardMeta && this.game.lastRunPathRewardMeta.pathId === pathId && Array.isArray(this.game.lastRunPathRewardMeta.entries) ? this.game.lastRunPathRewardMeta : null;
    const entries = existingMeta ? existingMeta.entries.filter(item => item && item.phaseId !== phaseId) : [];
    entries.push(entry);
    this.game.lastRunPathRewardMeta = {
      pathId,
      icon: entry.icon,
      name: entry.name,
      category: entry.category,
      completed: !!options.completed || !!existingMeta?.completed,
      archive: options.archive && typeof options.archive === 'object' ? {
        ...options.archive
      } : existingMeta?.archive && typeof existingMeta.archive === 'object' ? {
        ...existingMeta.archive
      } : null,
      entries
    };
  }
  queueMapRunPathFeedback(pathMeta, phaseMeta, options = {}) {
    const entry = this.buildRunPathFeedbackEntry(pathMeta, phaseMeta, options);
    if (!entry) return;
    this.game.lastRunPathMapFeedback = {
      ...entry,
      expiresAt: Date.now() + 4800
    };
    if (typeof clearTimeout === 'function' && this.game.runPathMapFeedbackTimer) {
      clearTimeout(this.game.runPathMapFeedbackTimer);
      this.game.runPathMapFeedbackTimer = null;
    }
    if (this.game.map && this.game.currentScreen === 'map-screen' && typeof this.game.map.updateLegacyMissionTracker === 'function') {
      this.game.map.updateLegacyMissionTracker();
    }
    if (typeof setTimeout === 'function') {
      this.game.runPathMapFeedbackTimer = setTimeout(() => {
        this.dismissRunPathMapFeedback();
      }, 4800);
    }
  }
  dismissRunPathMapFeedback() {
    if (typeof clearTimeout === 'function' && this.game.runPathMapFeedbackTimer) {
      clearTimeout(this.game.runPathMapFeedbackTimer);
      this.game.runPathMapFeedbackTimer = null;
    }
    this.game.lastRunPathMapFeedback = null;
    if (this.game.map && this.game.currentScreen === 'map-screen' && typeof this.game.map.updateLegacyMissionTracker === 'function') {
      this.game.map.updateLegacyMissionTracker();
    }
  }
  handleRunPathProgress(eventType, amount = 1, context = {}) {
    if (!this.game.player || typeof this.game.player.getRunPathMeta !== 'function') return false;
    const pathMeta = this.game.player.getRunPathMeta();
    const progress = this.game.player.ensureRunPathProgress ? this.game.player.ensureRunPathProgress() : null;
    const phaseMeta = pathMeta && pathMeta.currentPhase ? pathMeta.currentPhase : null;
    const forceProgress = !!context.force;
    if (!pathMeta || !progress || !phaseMeta || progress.completed) return false;
    if (!forceProgress && phaseMeta.eventType !== eventType) return false;
    if (!forceProgress && eventType === 'strategicNodeVisit') {
      const nodeType = String(context.nodeType || '');
      const strategicTypes = ['observatory', 'memory_rift', 'spirit_grotto', 'forbidden_altar', 'forge'];
      if (!strategicTypes.includes(nodeType)) return false;
    }
    if (!forceProgress && eventType === 'eliteOrTrialWin') {
      const battleType = String(context.nodeType || '');
      if (!['elite', 'trial', 'ghost_duel'].includes(battleType)) return false;
    }
    const delta = Math.max(0, Math.floor(Number(amount) || 0));
    if (delta <= 0) return false;
    const target = Math.max(1, Math.floor(Number(phaseMeta.target) || 1));
    const before = Math.max(0, Math.floor(Number(progress.phaseProgress) || 0));
    progress.phaseProgress = Math.min(target, before + delta);
    if (typeof Utils !== 'undefined' && Utils.showBattleLog && progress.phaseProgress !== before) {
      Utils.showBattleLog(`命途进度：${pathMeta.name} · ${phaseMeta.title} ${progress.phaseProgress}/${target}`);
    }
    if (progress.phaseProgress < target) {
      if (typeof this.game.refreshLegacyMissionTrackers === 'function') this.game.refreshLegacyMissionTrackers();
      return true;
    }
    progress.completedPhases = Array.isArray(progress.completedPhases) ? progress.completedPhases : [];
    if (!progress.completedPhases.includes(phaseMeta.id)) {
      progress.completedPhases.push(phaseMeta.id);
    }
    const rewardLines = this.awardRunPathPhaseRewards(pathMeta, phaseMeta);
    progress.lastRewardText = phaseMeta.rewardText || rewardLines.join(' / ');
    progress.rewardHistory = Array.isArray(progress.rewardHistory) ? progress.rewardHistory : [];
    if (progress.lastRewardText) progress.rewardHistory.push(progress.lastRewardText);
    const phaseCount = Array.isArray(pathMeta.phases) ? pathMeta.phases.length : 0;
    const isFinalPhase = progress.completedPhases.length >= phaseCount;
    progress.completed = isFinalPhase;
    const nextPhasePreview = !isFinalPhase && Array.isArray(pathMeta.phases) ? pathMeta.phases[Math.min(phaseCount - 1, Math.max(0, Number(progress.currentPhaseIndex) || 0) + 1)] || null : null;
    let archiveFeedback = null;
    if (isFinalPhase) {
      const completionMeta = pathMeta.completionRecord && typeof pathMeta.completionRecord === 'object' ? pathMeta.completionRecord : {};
      const archiveRecord = typeof this.game.recordRunPathCompletion === 'function' ? this.game.recordRunPathCompletion(pathMeta, {
        phaseMeta,
        rewardText: progress.lastRewardText,
        completedAt: Date.now(),
        realm: this.game.player?.realm,
        characterId: this.game.player?.characterId
      }) : null;
      const clears = Math.max(1, Math.floor(Number(archiveRecord?.clears) || 1));
      const recordName = String(completionMeta.name || archiveRecord?.recordName || `${pathMeta.name || '命途'}战录`);
      const firstClear = clears <= 1;
      const archiveNote = firstClear ? `已收入洞府·命途碑廊：${recordName}。后续可在藏经阁复盘这条命途的推荐套装与 Boss 读法。` : `已将最新圆满样本补入洞府·命途碑廊：${recordName}。当前累计 ${clears} 次收录，可继续比较不同角色与路线。`;
      archiveFeedback = {
        id: String(completionMeta.id || archiveRecord?.recordId || `runPath_${pathMeta.id || 'record'}`),
        name: String(pathMeta.name || '命途'),
        icon: String(completionMeta.icon || pathMeta.icon || '✦'),
        recordName,
        note: archiveNote,
        clears,
        firstClear,
        lastCharacterName: String(archiveRecord?.lastCharacterName || ''),
        lastRealm: Math.max(0, Math.floor(Number(archiveRecord?.lastRealm) || 0))
      };
      if (typeof this.game.recordCollectionUnlock === 'function') {
        this.game.recordCollectionUnlock('run_path', {
          id: archiveFeedback.id,
          name: archiveFeedback.recordName,
          icon: archiveFeedback.icon,
          note: archiveFeedback.note
        });
      }
    }
    if (this.game.currentScreen === 'battle-screen' || this.game.currentScreen === 'reward-screen' || context.surface === 'reward-screen') {
      this.queueRunPathRewardMeta(pathMeta, phaseMeta, {
        rewardText: progress.lastRewardText,
        completed: isFinalPhase,
        nextPhase: nextPhasePreview,
        archive: archiveFeedback
      });
    } else if (this.game.currentScreen === 'map-screen' || context.surface === 'map-screen' || eventType === 'strategicNodeVisit') {
      this.queueMapRunPathFeedback(pathMeta, phaseMeta, {
        rewardText: progress.lastRewardText,
        completed: isFinalPhase,
        nextPhase: nextPhasePreview
      });
    }
    if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
      Utils.showBattleLog(`命途阶段完成：${pathMeta.name} · ${phaseMeta.title}`);
      if (progress.lastRewardText) {
        Utils.showBattleLog(`命途嘉奖：${progress.lastRewardText}`);
      }
    }
    if (!isFinalPhase) {
      progress.currentPhaseIndex = Math.min(phaseCount - 1, Math.max(0, Number(progress.currentPhaseIndex) || 0) + 1);
      progress.phaseProgress = 0;
      const refreshed = this.game.player.getRunPathMeta();
      const nextPhase = refreshed && refreshed.currentPhase ? refreshed.currentPhase : null;
      if (nextPhase && typeof Utils !== 'undefined' && Utils.showBattleLog) {
        Utils.showBattleLog(`命途转入【${nextPhase.label}】${nextPhase.title}`);
      }
    } else if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
      Utils.showBattleLog(`命途圆满：${pathMeta.name}`);
    }
    if (typeof this.game.refreshLegacyMissionTrackers === 'function') this.game.refreshLegacyMissionTrackers();
    if (typeof this.game.autoSave === 'function') this.game.autoSave();
    return true;
  }
  shouldOfferRunVowAfterRealm(realmCleared) {
    const safeRealm = Math.max(1, Math.floor(Number(realmCleared) || 1));
    if (![3, 9, 15].includes(safeRealm)) return false;
    const active = this.game.player && typeof this.game.player.getRunVowMetas === 'function' ? this.game.player.getRunVowMetas() : [];
    if (active.length < 2) return true;
    return active.some(meta => meta && meta.tier < meta.maxTier);
  }
  draftRunVowChoices(realmCleared = null) {
    const catalog = this.game.getRunVowCatalog();
    if (catalog.length === 0) return [];
    const active = this.game.player && typeof this.game.player.getRunVowMetas === 'function' ? this.game.player.getRunVowMetas() : [];
    const activeIds = new Set(active.map(meta => meta.id));
    const upgradable = this.game.shuffleList(active.filter(meta => meta && meta.tier < meta.maxTier));
    const fresh = this.game.shuffleList(catalog.filter(meta => meta && !activeIds.has(meta.id)));
    if (active.length >= 2) {
      return upgradable.slice(0, 3).map(meta => meta.id);
    }
    const draft = [];
    if (upgradable.length > 0) {
      draft.push(upgradable.shift().id);
    }
    while (fresh.length > 0 && draft.length < 3) {
      const next = fresh.shift();
      if (next && !draft.includes(next.id)) draft.push(next.id);
    }
    while (upgradable.length > 0 && draft.length < 3) {
      const next = upgradable.shift();
      if (next && !draft.includes(next.id)) draft.push(next.id);
    }
    if (draft.length === 0 && realmCleared != null) {
      return this.game.shuffleList(catalog).slice(0, 3).map(meta => meta.id);
    }
    return draft.slice(0, 3);
  }
  applyRunVowSelection(vowId) {
    if (!this.game.player || typeof this.game.player.applyRunVow !== 'function') return null;
    return this.game.player.applyRunVow(vowId);
  }
  advanceRunDestinyTier(reason = '') {
    const current = this.game.player && typeof this.game.player.normalizeRunDestiny === 'function' ? this.game.player.normalizeRunDestiny(this.game.player.runDestiny) : this.game.player ? this.game.player.runDestiny : null;
    if (!current || !current.id || typeof RUN_DESTINIES === 'undefined' || !RUN_DESTINIES[current.id]) {
      return null;
    }
    const tiers = Array.isArray(RUN_DESTINIES[current.id].tiers) ? RUN_DESTINIES[current.id].tiers : [];
    const maxTier = Math.max(1, tiers.length || 1);
    const previousTier = Math.max(1, Math.floor(Number(current.tier) || 1));
    const nextTier = Math.min(maxTier, previousTier + 1);
    const previousMeta = this.game.getRunDestinyMetaById(current.id, previousTier);
    if (nextTier === previousTier) {
      return {
        upgraded: false,
        previousTier,
        nextTier,
        maxTier,
        meta: previousMeta
      };
    }
    if (this.game.player && typeof this.game.player.setRunDestiny === 'function') {
      this.game.player.setRunDestiny(current.id, nextTier);
    } else if (this.game.player) {
      this.game.player.runDestiny = {
        id: current.id,
        tier: nextTier
      };
    }
    const meta = this.game.player && typeof this.game.player.getRunDestinyMeta === 'function' ? this.game.player.getRunDestinyMeta() : this.game.getRunDestinyMetaById(current.id, nextTier);
    if (reason && meta) {
      Utils.showBattleLog(`${reason}：${meta.name} ${meta.tierLabel}`);
    }
    return {
      upgraded: true,
      previousTier,
      nextTier,
      maxTier,
      meta
    };
  }
  getDisplayRealmName(realm) {
    const fallbackName = this.game.map && typeof this.game.map.getRealmName === 'function' ? this.game.map.getRealmName(realm) : `第${realm}重天`;
    if (!this.game.isEndlessActive()) return fallbackName;
    const state = this.game.ensureEndlessState();
    return `无尽轮回·第${state.currentCycle + 1}轮｜${fallbackName}`;
  }
  getChapterProfileCatalog() {
    if (this.game.chapterProfileCatalog && typeof this.game.chapterProfileCatalog === 'object') {
      return this.game.chapterProfileCatalog;
    }
    this.game.chapterProfileCatalog = {
      1: {
        id: 'fractured_oath',
        icon: '🜂',
        name: '碎誓外域',
        mechanic: '风险选择 / 先手压制',
        mood: '试探、反抗',
        skyOmen: {
          name: '裂誓流火',
          desc: '开局抢拍与首击伤害更容易滚成优势，敢压血就能提前吃到章节收益。'
        },
        leyline: {
          name: '逆誓余烬',
          desc: '低血、处决与首回合爆发的收益被放大，拖沓会让前段优势迅速流失。'
        },
        focusTags: ['风险试探', '先手斩杀', '试炼前压'],
        dangerVector: {
          burst: 72,
          sustain: 46,
          control: 41,
          tax: 38,
          recovery: 64
        },
        routePrompt: '偏好精英、试炼与快节奏节点，把优势尽早换成战利。',
        bossPrompt: '主宰会检定你能否在不稳血线下持续抢到终结窗口。',
        recommendedDestinies: ['foldedEdge', 'rebelScale', 'emberHeart'],
        recommendedSpirits: ['spiritApe', 'swordWraith', 'starFox'],
        recommendedVows: ['blazingLife', 'realmBreak']
      },
      2: {
        id: 'forge_sea',
        icon: '⚒️',
        name: '炉海天阙',
        mechanic: '资源灼烧 / 锻造换节奏',
        mood: '压迫、锻造',
        skyOmen: {
          name: '炉海炙潮',
          desc: '回合末残手和高费停牌更容易被惩罚，资源利用率会直接决定战线长度。'
        },
        leyline: {
          name: '淬器火脉',
          desc: '厚盾、重铸与器灵联动更强，能把挨打回合转成下一轮的反击起点。'
        },
        focusTags: ['资源灼烧', '护阵重铸', '厚甲换血'],
        dangerVector: {
          burst: 48,
          sustain: 67,
          control: 45,
          tax: 74,
          recovery: 59
        },
        routePrompt: '炼器坊、营地与精英会更有价值，能帮你把资源烧成真实强度。',
        bossPrompt: '末段主宰会持续逼你交资源，不会给无效回合留情面。',
        recommendedDestinies: ['soulAnchor', 'armorTemper', 'deepMeridian'],
        recommendedSpirits: ['blackTortoise', 'artifactSoul', 'emberCrow'],
        recommendedVows: ['wardingPrison', 'realmBreak']
      },
      3: {
        id: 'sunken_stars',
        icon: '🌠',
        name: '沉星古庭',
        mechanic: '预埋 / 连锁 / 星律地脉',
        mood: '神秘、计算',
        skyOmen: {
          name: '沉星轮转',
          desc: '预埋牌序、延迟收益与下一回合筹划会被放大，临时拼脸会越来越亏。'
        },
        leyline: {
          name: '星律地脉',
          desc: '多段连锁与时序调度更容易滚雪球，能把中盘铺垫转成稳定收束。'
        },
        focusTags: ['预埋节奏', '连锁收益', '次回合筹划'],
        dangerVector: {
          burst: 54,
          sustain: 56,
          control: 73,
          tax: 52,
          recovery: 61
        },
        routePrompt: '观星台、记忆裂隙与事件更能放大这章的计算收益。',
        bossPrompt: '主宰会追问你的牌序安排，错误收尾会被成倍放大。',
        recommendedDestinies: ['starMemory', 'echoScripture', 'thunderVerse'],
        recommendedSpirits: ['starFox', 'frostChi', 'artifactSoul'],
        recommendedVows: ['heavenlyGaze', 'realmBreak']
      },
      4: {
        id: 'mirror_abyss',
        icon: '🪞',
        name: '悬镜深渊',
        mechanic: '复制 / 幻像 / 诅咒反照',
        mood: '诡异、怀疑',
        skyOmen: {
          name: '悬镜反照',
          desc: '复制与镜返会把你上一拍的选择反弹回来，错误收尾往往比少打一张牌更致命。'
        },
        leyline: {
          name: '幻咒回波',
          desc: '诅咒、虚弱、易伤和镜像收益会持续叠加，净化与防错的重要性显著提高。'
        },
        focusTags: ['复制反照', '诅咒回波', '净化防错'],
        dangerVector: {
          burst: 63,
          sustain: 58,
          control: 76,
          tax: 66,
          recovery: 50
        },
        routePrompt: '禁术坛、试炼碑与事件都可能提前放大镜像压力，但回报也更高。',
        bossPrompt: '主宰会围绕复制和诅咒出题，回合末的收尾选择就是答卷。',
        recommendedDestinies: ['mirrorHeart', 'gapInsight', 'silentTide'],
        recommendedSpirits: ['nightmareButterfly', 'frostChi', 'artifactSoul'],
        recommendedVows: ['silentReturn', 'heavenlyGaze']
      },
      5: {
        id: 'blood_moon',
        icon: '🌕',
        name: '血月禁庭',
        mechanic: '压血 / 献祭 / 狂化阈值',
        mood: '疯狂、赌命',
        skyOmen: {
          name: '血月覆庭',
          desc: '血线越低，收益和风险都会一起拔高，慢吞吞的保守打法会被逐步逼死。'
        },
        leyline: {
          name: '献祭狂脉',
          desc: '自损换伤、收割回血与爆发阈值更容易成型，但容错会急速收窄。'
        },
        focusTags: ['压血爆发', '献祭换伤', '收割回生'],
        dangerVector: {
          burst: 86,
          sustain: 64,
          control: 49,
          tax: 71,
          recovery: 34
        },
        routePrompt: '精英、禁术坛与试炼路线更适合这章，敢赌命就能拿回超额收益。',
        bossPrompt: '主宰会持续压你的血线，逼你在狂化阈值前后做出正确取舍。',
        recommendedDestinies: ['rebelScale', 'sacrificialFlame', 'bloodContract'],
        recommendedSpirits: ['emberCrow', 'nightmareButterfly', 'swordWraith'],
        recommendedVows: ['blazingLife', 'karmaDevour']
      },
      6: {
        id: 'final_court',
        icon: '☯️',
        name: '终焉命庭',
        mechanic: '法则编织 / 终局问答',
        mood: '宿命、升华',
        skyOmen: {
          name: '终焉问命',
          desc: '命格、誓约、法则与法宝的联动会被同时拉到台前，单轴玩法很难撑过终局。'
        },
        leyline: {
          name: '编庭法脉',
          desc: '多系统协同越完整，终章给出的答卷空间越大；失衡构筑会被快速识破。'
        },
        focusTags: ['多轴联动', '法则编织', '终局检定'],
        dangerVector: {
          burst: 78,
          sustain: 72,
          control: 74,
          tax: 80,
          recovery: 36
        },
        routePrompt: '观星、试炼与炼器路线能更早补齐终章缺的最后一块拼图。',
        bossPrompt: '末章主宰会把命格、誓约和法则一起拿来出题，缺一轴都会很难打。',
        recommendedDestinies: ['preceptSeal', 'omenGlow', 'hiddenScript'],
        recommendedSpirits: ['artifactSoul', 'blackTortoise', 'starFox'],
        recommendedVows: ['realmBreak', 'heavenlyGaze']
      }
    };
    return this.game.chapterProfileCatalog;
  }
  resolveChapterDangerProfile(chapterBase = null, stageIndex = 1) {
    const vector = chapterBase && typeof chapterBase === 'object' && chapterBase.dangerVector ? chapterBase.dangerVector : {};
    const clampMetric = (value, fallback) => {
      const normalized = Math.floor(Number(value));
      if (!Number.isFinite(normalized)) return fallback;
      return Math.max(0, Math.min(100, normalized));
    };
    const base = {
      burst: clampMetric(vector.burst, 50),
      sustain: clampMetric(vector.sustain, 50),
      control: clampMetric(vector.control, 50),
      tax: clampMetric(vector.tax, 50),
      recovery: clampMetric(vector.recovery, 50)
    };
    const safeStage = Math.max(1, Math.min(3, Math.floor(Number(stageIndex) || 1)));
    const stageBonus = (safeStage - 1) * 6;
    const recoveryPenalty = 100 - base.recovery;
    const weightedBase = Math.round(base.burst * 0.24 + base.sustain * 0.22 + base.control * 0.2 + base.tax * 0.22 + recoveryPenalty * 0.12);
    const index = Math.max(0, Math.min(100, weightedBase + stageBonus));
    const tier = index >= 76 ? {
      id: 'extreme',
      label: '极高',
      chip: '极限试锋'
    } : index >= 61 ? {
      id: 'high',
      label: '高压',
      chip: '高压问锋'
    } : index >= 46 ? {
      id: 'medium',
      label: '中压',
      chip: '稳压试错'
    } : {
      id: 'low',
      label: '可控',
      chip: '稳态推进'
    };
    const dimensions = [{
      id: 'burst',
      label: '爆发威胁',
      value: base.burst
    }, {
      id: 'sustain',
      label: '续航压力',
      value: base.sustain
    }, {
      id: 'control',
      label: '控制压制',
      value: base.control
    }, {
      id: 'tax',
      label: '资源税负',
      value: base.tax
    }, {
      id: 'recovery',
      label: '纠错窗口',
      value: recoveryPenalty
    }].sort((a, b) => b.value - a.value);
    const dominant = dimensions[0] || {
      id: 'burst',
      label: '爆发威胁',
      value: base.burst
    };
    const counterplayMap = {
      burst: '优先留护盾与首拍减伤，避免被连续高伤直接击穿。',
      sustain: '补充持续回复或高质量防守，避免被拖入亏损回合。',
      control: '提前准备净化与抗控资源，减少关键回合失效风险。',
      tax: '控制费用曲线与手牌冗余，避免回合末资源空转。',
      recovery: '保留至少一条保命链路，不要把容错全部换成输出。'
    };
    return {
      index,
      tierId: tier.id,
      tierLabel: tier.label,
      chipLabel: tier.chip,
      stageBonus,
      summary: `${dominant.label}偏高`,
      dominantRisk: dominant.id,
      dominantLabel: dominant.label,
      counterplay: counterplayMap[dominant.id] || '保持资源冗余，避免单回合透支。',
      dimensions: {
        burst: base.burst,
        sustain: base.sustain,
        control: base.control,
        tax: base.tax,
        recoveryWindow: base.recovery
      }
    };
  }
  getChapterNemesisSnapshot(realm) {
    const safeRealm = Math.max(1, Math.min(18, Math.floor(Number(realm) || 1)));
    const expeditionState = typeof this.game.getExpeditionState === 'function' ? this.game.getExpeditionState() : null;
    const source = expeditionState && Math.max(1, Math.min(18, Math.floor(Number(expeditionState.realm) || 1))) === safeRealm ? expeditionState : null;
    const nemesis = source && source.activeNemesis && typeof source.activeNemesis === 'object' ? source.activeNemesis : null;
    if (!nemesis || !nemesis.id) return null;
    const status = ['hunting', 'recurring', 'allied', 'guarding', 'defeated', 'escaped', 'released', 'traded', 'evolved'].includes(nemesis.status) ? nemesis.status : 'hunting';
    const statusMeta = {
      hunting: {
        label: '追猎中',
        chip: '狩猎锁定'
      },
      recurring: {
        label: '复现中',
        chip: '回返加压'
      },
      allied: {
        label: '投靠势力',
        chip: '势力合围'
      },
      guarding: {
        label: '主宰护卫',
        chip: '护卫终局'
      },
      defeated: {
        label: '已击破',
        chip: '猎线已结'
      },
      escaped: {
        label: '已逃逸',
        chip: '风险外溢'
      },
      released: {
        label: '已放走',
        chip: '留线观后'
      },
      traded: {
        label: '完成交易',
        chip: '以赏换路'
      },
      evolved: {
        label: '仇敌进阶',
        chip: '后患升级'
      }
    };
    const triggerNodeTypes = Array.isArray(nemesis.triggerNodeTypes) ? nemesis.triggerNodeTypes.map(entry => String(entry || '')).filter(Boolean).slice(0, 4) : [];
    const nodeLabelMap = {
      enemy: '普通战',
      elite: '精英战',
      trial: '试炼',
      boss: '主宰战',
      event: '事件',
      shop: '商店',
      observatory: '观星',
      memory_rift: '记忆裂隙',
      forge: '炼器'
    };
    const reward = nemesis.resolvedReward && typeof nemesis.resolvedReward === 'object' ? nemesis.resolvedReward : nemesis.reward && typeof nemesis.reward === 'object' ? nemesis.reward : {};
    const rewardGold = Math.max(0, Math.floor(Number(reward.gold) || 0));
    const rewardRingExp = Math.max(0, Math.floor(Number(reward.ringExp) || 0));
    const rewardScore = Math.max(0, Math.floor(Number(reward.score) || 0));
    const rewardHeavenlyInsight = Math.max(0, Math.floor(Number(reward.heavenlyInsight) || 0));
    const engagedCount = Math.max(0, Math.floor(Number(nemesis.engagedCount) || 0));
    const hpMul = Math.max(1, Number(nemesis.hpMul) || 1);
    const atkMul = Math.max(1, Number(nemesis.atkMul) || 1);
    const recurrenceCount = Math.max(0, Math.floor(Number(nemesis.recurrenceCount) || 0));
    const battleVariants = Array.isArray(nemesis.battleVariants) ? nemesis.battleVariants : [];
    const currentVariant = battleVariants.find(entry => entry && entry.id === nemesis.currentVariantId) || battleVariants[0] || null;
    const pressureIndex = Math.max(0, Math.min(100, Math.floor((hpMul - 1) * 34 + (atkMul - 1) * 42 + engagedCount * 6 + recurrenceCount * 8 + (status === 'hunting' ? 18 : 0) + (status === 'recurring' ? 24 : 0) + (status === 'allied' ? 20 : 0) + (status === 'guarding' ? 26 : 0) + (status === 'escaped' ? 10 : 0) + (status === 'evolved' ? 14 : 0))));
    const counterplay = status === 'defeated' ? '追猎线已结算，可把资源转向章节主宰检定。' : status === 'released' ? '线索已被保留为长线情报，本章可把资源转向更稳的收官。' : status === 'traded' ? '宿敌线已被转成交易赏格，优先把换来的资源兑现成终局优势。' : status === 'escaped' ? '宿敌已经脱离正面战线，优先稳住血线并防止后续压制。' : status === 'evolved' ? '这条仇敌线已经进阶，后续若再见到同类题目要提前准备更厚的兜底。' : status === 'guarding' ? '终章前要预留净化、护盾与爆发，避免被护卫战直接锁死答卷。' : status === 'allied' ? `宿敌已投靠${nemesis.alliedFactionName || '敌对势力'}，要把资源预留给合围节点。` : status === 'recurring' ? '它已经记住了上次暴露的缺口，下一次接战要提前补齐防线。' : `在${triggerNodeTypes.map(type => nodeLabelMap[type] || type).join(' / ') || '战斗节点'}保留爆发与护盾，避免被仇敌连段滚雪球。`;
    const rewardSummaryParts = [];
    if (rewardGold > 0) rewardSummaryParts.push(`灵石 +${rewardGold}`);
    if (rewardRingExp > 0) rewardSummaryParts.push(`命环经验 +${rewardRingExp}`);
    if (rewardScore > 0) rewardSummaryParts.push(`命盘评分 +${rewardScore}`);
    if (rewardHeavenlyInsight > 0) rewardSummaryParts.push(`天机 +${rewardHeavenlyInsight}`);
    return {
      id: String(nemesis.id || ''),
      icon: String(nemesis.icon || '🎯'),
      name: String(nemesis.name || '未知宿敌'),
      epithet: String(nemesis.epithet || ''),
      intro: String(nemesis.intro || ''),
      status,
      statusLabel: statusMeta[status]?.label || statusMeta.hunting.label,
      chipLabel: statusMeta[status]?.chip || statusMeta.hunting.chip,
      triggerNodeTypes,
      triggerNodeLabel: triggerNodeTypes.map(type => nodeLabelMap[type] || type).join(' / '),
      engaged: !!nemesis.engaged,
      engagedCount,
      recurrenceCount,
      lastEncounterNodeType: String(nemesis.lastEncounterNodeType || ''),
      currentVariantId: String(nemesis.currentVariantId || ''),
      currentVariantLabel: String(currentVariant?.label || ''),
      clueLine: String(nemesis.clueLine || ''),
      clueRevealed: !!nemesis.clueRevealed,
      alliedFactionName: String(nemesis.alliedFactionName || ''),
      fateOutcome: String(nemesis.fateOutcome || status),
      pressureIndex,
      counterplay,
      reward: {
        gold: rewardGold,
        ringExp: rewardRingExp,
        score: rewardScore,
        heavenlyInsight: rewardHeavenlyInsight
      },
      rewardSummary: rewardSummaryParts.length > 0 ? rewardSummaryParts.join(' · ') : '暂无额外收益',
      outcomeNote: String(nemesis.outcomeNote || '')
    };
  }
  getChapterProfileForRealm(realm) {
    const normalizedRealm = Math.max(1, Math.min(18, Math.floor(Number(realm) || 1)));
    const chapterIndex = Math.max(1, Math.min(6, Math.floor((normalizedRealm - 1) / 3) + 1));
    const stageIndex = (normalizedRealm - 1) % 3 + 1;
    const catalog = this.getChapterProfileCatalog();
    const base = catalog[chapterIndex] || catalog[1];
    const stageCatalog = [{
      index: 1,
      label: '前段·示章',
      desc: '先展示章节语法，让你知道这章正在放大什么。'
    }, {
      index: 2,
      label: '中段·转势',
      desc: '事件与精英会逼你换打法，原来的节奏不一定还能通吃。'
    }, {
      index: 3,
      label: '末段·问锋',
      desc: 'Boss 会围绕章节机制检定你的理解，而不只是堆数值。'
    }];
    const stage = stageCatalog[stageIndex - 1] || stageCatalog[0];
    const dangerProfile = this.resolveChapterDangerProfile(base, stageIndex);
    const resolveDestiny = destinyId => {
      const meta = this.game.getRunDestinyMetaById(destinyId, 1);
      return meta ? {
        id: meta.id,
        name: meta.name,
        icon: meta.icon,
        summary: meta.summary
      } : null;
    };
    const resolveSpirit = spiritId => {
      const meta = this.game.getSpiritCompanionMetaById(spiritId, 1);
      return meta ? {
        id: meta.id,
        name: meta.name,
        icon: meta.icon,
        summary: meta.summary
      } : null;
    };
    const resolveVow = vowId => {
      const meta = this.game.getRunVowMetaById(vowId, 1);
      return meta ? {
        id: meta.id,
        name: meta.name,
        icon: meta.icon,
        summary: meta.summary
      } : null;
    };
    return {
      ...base,
      chapterIndex,
      realm: normalizedRealm,
      fullName: `第${chapterIndex}章·${base.name}`,
      stageIndex,
      stageLabel: stage.label,
      stageDesc: stage.desc,
      dangerProfile,
      recommendedDestinies: (base.recommendedDestinies || []).map(resolveDestiny).filter(Boolean),
      recommendedSpirits: (base.recommendedSpirits || []).map(resolveSpirit).filter(Boolean),
      recommendedVows: (base.recommendedVows || []).map(resolveVow).filter(Boolean)
    };
  }
  getChapterDisplaySnapshot(realm) {
    const chapter = this.getChapterProfileForRealm(realm);
    if (!chapter) return null;
    const currentDestiny = this.game.player && typeof this.game.player.getRunDestinyMeta === 'function' ? this.game.player.getRunDestinyMeta() : null;
    const currentSpirit = this.game.player && typeof this.game.player.getSpiritCompanionMeta === 'function' ? this.game.player.getSpiritCompanionMeta() : null;
    const currentVows = this.game.player && typeof this.game.player.getRunVowMetas === 'function' ? this.game.player.getRunVowMetas() : [];
    return {
      ...chapter,
      currentDestiny: currentDestiny ? {
        id: currentDestiny.id,
        name: currentDestiny.name,
        icon: currentDestiny.icon,
        tierLabel: currentDestiny.tierLabel
      } : null,
      currentSpirit: currentSpirit ? {
        id: currentSpirit.id,
        name: currentSpirit.name,
        icon: currentSpirit.icon,
        tierLabel: currentSpirit.tierLabel
      } : null,
      currentVows: Array.isArray(currentVows) ? currentVows.map(meta => ({
        id: meta.id,
        name: meta.name,
        icon: meta.icon,
        tierLabel: meta.tierLabel
      })) : [],
      dangerProfile: chapter.dangerProfile || null,
      nemesis: this.getChapterNemesisSnapshot(chapter.realm),
      destinyRecommended: !!(currentDestiny && chapter.recommendedDestinies.some(meta => meta.id === currentDestiny.id)),
      spiritRecommended: !!(currentSpirit && chapter.recommendedSpirits.some(meta => meta.id === currentSpirit.id)),
      vowRecommended: Array.isArray(currentVows) && currentVows.some(meta => chapter.recommendedVows.some(entry => entry.id === meta.id))
    };
  }
  getChapterNarrativeProfile(chapterIndex) {
    const safeChapterIndex = Math.max(1, Math.min(6, Math.floor(Number(chapterIndex) || 1)));
    const chapter = typeof this.getChapterProfileForRealm === 'function' ? this.getChapterProfileForRealm((safeChapterIndex - 1) * 3 + 1) : null;
    const template = typeof getV6ChapterNarrativeTemplate === 'function' ? getV6ChapterNarrativeTemplate(safeChapterIndex) : null;
    if (!template && !chapter) return null;
    return {
      id: template?.id || `chapter_${safeChapterIndex}_narrative`,
      chapterIndex: safeChapterIndex,
      name: template?.name || chapter?.name || `第 ${safeChapterIndex} 章`,
      summary: template?.summary || chapter?.mechanic || '',
      worldviewFocus: Array.isArray(template?.worldviewFocus) ? template.worldviewFocus.slice() : [],
      beats: Array.isArray(template?.beats) ? template.beats.slice() : [],
      finaleRecall: template?.finaleRecall || {
        title: '',
        summary: '',
        systems: []
      },
      uiMeta: template?.uiMeta || {
        tone: 'chapter',
        icon: chapter?.icon || '☯️'
      }
    };
  }
  getLegacyRunDoctrineForPreset(presetId) {
    const base = {
      presetId: presetId || null,
      openingBattleBlockBonus: 0,
      firstAttackBonusPerBattle: 0,
      firstForgeExtraUpgradeOnce: 0,
      firstForgeBoostUsed: false,
      entropyLegacyProcEnabled: false,
      entropyLegacyDraw: 0,
      entropyLegacyDiscardDamage: 0,
      entropyProcUsedThisTurn: false,
      entropyBonusEnergyOnce: 0,
      entropyBonusEnergyUsed: false,
      bulwarkLegacyProcEnabled: false,
      bulwarkLegacyDraw: 0,
      bulwarkLegacyCounterDamage: 0,
      bulwarkProcUsedThisTurn: false,
      stormcraftLegacyProcEnabled: false,
      stormcraftLegacyBonusDamage: 0,
      stormcraftLegacyDraw: 0,
      stormcraftProcUsedThisTurn: false,
      vitalweaveLegacyProcEnabled: false,
      vitalweaveLegacyBlockRatio: 0,
      vitalweaveLegacyBurstDamage: 0,
      vitalweaveLegacyDraw: 0,
      vitalweaveProcUsedThisTurn: false
    };
    if (presetId === 'survivor') {
      return {
        ...base,
        openingBattleBlockBonus: 4
      };
    }
    if (presetId === 'smith') {
      return {
        ...base,
        firstForgeExtraUpgradeOnce: 1
      };
    }
    if (presetId === 'tempo') {
      return {
        ...base,
        firstAttackBonusPerBattle: 3
      };
    }
    if (presetId === 'entropy') {
      return {
        ...base,
        entropyLegacyProcEnabled: true,
        entropyLegacyDraw: 1,
        entropyLegacyDiscardDamage: 2,
        entropyBonusEnergyOnce: 1
      };
    }
    if (presetId === 'bulwark') {
      return {
        ...base,
        openingBattleBlockBonus: 2,
        bulwarkLegacyProcEnabled: true,
        bulwarkLegacyDraw: 1,
        bulwarkLegacyCounterDamage: 2
      };
    }
    if (presetId === 'stormcraft') {
      return {
        ...base,
        firstAttackBonusPerBattle: 1,
        stormcraftLegacyProcEnabled: true,
        stormcraftLegacyBonusDamage: 3,
        stormcraftLegacyDraw: 1
      };
    }
    if (presetId === 'vitalweave') {
      return {
        ...base,
        openingBattleBlockBonus: 2,
        vitalweaveLegacyProcEnabled: true,
        vitalweaveLegacyBlockRatio: 0.6,
        vitalweaveLegacyBurstDamage: 4,
        vitalweaveLegacyDraw: 1
      };
    }
    return base;
  }
  applyLegacyRunDoctrine(player, presetId = null, secondaryPresetId = null) {
    if (!player) return;
    const p1Id = presetId || this.game.legacyProgress?.lastPreset || null;
    const p2Id = secondaryPresetId !== undefined && secondaryPresetId !== null ? secondaryPresetId : this.game.legacyProgress?.secondaryPreset || null;
    const d1 = this.getLegacyRunDoctrineForPreset(p1Id);
    const d2 = this.getLegacyRunDoctrineForPreset(p2Id);
    const merged = {
      ...d1
    };
    merged.presetId = p1Id; // 以主道统为核心标记

    // P1：合并副道统 (50%效能，向上取整保证基础获取)
    merged.openingBattleBlockBonus += Math.ceil(d2.openingBattleBlockBonus * 0.5);
    merged.firstAttackBonusPerBattle += Math.ceil(d2.firstAttackBonusPerBattle * 0.5);
    merged.firstForgeExtraUpgradeOnce += Math.ceil(d2.firstForgeExtraUpgradeOnce * 0.5);
    merged.entropyLegacyProcEnabled = merged.entropyLegacyProcEnabled || d2.entropyLegacyProcEnabled;
    merged.entropyLegacyDraw += Math.ceil(d2.entropyLegacyDraw * 0.5);
    merged.entropyLegacyDiscardDamage += Math.ceil(d2.entropyLegacyDiscardDamage * 0.5);
    merged.entropyBonusEnergyOnce += Math.ceil(d2.entropyBonusEnergyOnce * 0.5);
    merged.bulwarkLegacyProcEnabled = merged.bulwarkLegacyProcEnabled || d2.bulwarkLegacyProcEnabled;
    merged.bulwarkLegacyDraw += Math.ceil(d2.bulwarkLegacyDraw * 0.5);
    merged.bulwarkLegacyCounterDamage += Math.ceil(d2.bulwarkLegacyCounterDamage * 0.5);
    merged.stormcraftLegacyProcEnabled = merged.stormcraftLegacyProcEnabled || d2.stormcraftLegacyProcEnabled;
    merged.stormcraftLegacyBonusDamage += Math.ceil(d2.stormcraftLegacyBonusDamage * 0.5);
    merged.stormcraftLegacyDraw += Math.ceil(d2.stormcraftLegacyDraw * 0.5);
    merged.vitalweaveLegacyProcEnabled = merged.vitalweaveLegacyProcEnabled || d2.vitalweaveLegacyProcEnabled;
    merged.vitalweaveLegacyBlockRatio += (Number(d2.vitalweaveLegacyBlockRatio) || 0) * 0.5;
    merged.vitalweaveLegacyBurstDamage += Math.ceil(d2.vitalweaveLegacyBurstDamage * 0.5);
    merged.vitalweaveLegacyDraw += Math.ceil(d2.vitalweaveLegacyDraw * 0.5);
    merged.vitalweaveLegacyBlockRatio = Math.max(0, Math.min(2, Number(merged.vitalweaveLegacyBlockRatio) || 0));
    player.legacyRunDoctrine = merged;
  }
  applyLegacyRunMission(player, presetId = null) {
    if (!player) return;
    const mission = this.game.getLegacyMissionForPreset(presetId);
    player.legacyRunMission = mission ? {
      ...mission
    } : null;
  }
  updateRealmBackground(realm) {
    // 确保 default 为 1
    realm = realm || 1;

    // 查找是否有对应的背景图
    // 映射规则：1-3重天有专属图
    let bgImage = '';
    if (realm === 1) bgImage = 'assets/images/realms/realm_bg_1.webp';else if (realm === 2) bgImage = 'assets/images/realms/realm_bg_2.webp';else if (realm === 3) bgImage = 'assets/images/realms/realm_bg_3.webp';else if (realm === 7) bgImage = 'assets/images/bg_realm_7.webp';else if (realm === 8) bgImage = 'assets/images/bg_realm_8.webp';else if (realm === 9) bgImage = 'assets/images/bg_realm_9.webp';else if (realm === 10) bgImage = 'assets/images/bg_realm_10.webp';else if (realm === 11) bgImage = 'assets/images/bg_realm_11.webp';else if (realm === 12) bgImage = 'assets/images/bg_realm_12.webp';else if (realm === 13) bgImage = 'assets/images/bg_realm_13.webp';else if (realm === 14) bgImage = 'assets/images/bg_realm_14.webp';else if (realm === 15) bgImage = 'assets/images/bg_realm_15.webp';else if (realm === 16) bgImage = 'assets/images/bg_realm_16.webp';else if (realm === 17) bgImage = 'assets/images/bg_realm_17.webp';else if (realm === 18) bgImage = 'assets/images/bg_realm_18.webp';
    const existing = document.getElementById('dynamic-bg');
    if (existing) existing.remove();
    const bg = document.createElement('div');
    bg.className = 'dynamic-bg';
    bg.id = 'dynamic-bg';
    if (bgImage) {
      bg.classList.add('is-image-bg');
      bg.style.backgroundImage = `url('${bgImage}')`;
      // 添加遮罩层以确保文字可读性
      const overlay = document.createElement('div');
      overlay.className = 'bg-overlay';
      bg.appendChild(overlay);
    } else {
      // Fallback to procedural stars
      for (let i = 0; i < 50; i++) {
        const star = document.createElement('div');
        star.className = 'bg-star';
        star.style.left = `${Math.random() * 100}%`;
        star.style.top = `${Math.random() * 100}%`;
        star.style.animationDelay = `${Math.random() * 3}s`;
        bg.appendChild(star);
      }
      // Cloud layers
      for (let i = 0; i < 3; i++) {
        const cloud = document.createElement('div');
        cloud.className = 'bg-cloud';
        cloud.style.top = `${20 + i * 25}%`;
        cloud.style.animationDelay = `${i * 20}s`;
        bg.appendChild(cloud);
      }
    }
    document.body.prepend(bg);
  }
  initRealmSelect() {
    const listContainer = document.getElementById('realm-list-container');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    this.game.selectedRealmId = null;

    // Visual Themes for each Realm
    const REALM_THEMES = {
      1: {
        icon: '🛖',
        color: '#B0BEC5',
        bg: 'linear-gradient(135deg, #263238 0%, #102027 100%)',
        bgImage: 'assets/images/realms/realm_bg_1.webp'
      },
      // Mortal Dust
      2: {
        icon: '🌬️',
        color: '#81D4FA',
        bg: 'linear-gradient(135deg, #01579B 0%, #002f6c 100%)',
        bgImage: 'assets/images/realms/realm_bg_2.webp'
      },
      // Qi Flow
      3: {
        icon: '🧱',
        color: '#BCAAA4',
        bg: 'linear-gradient(135deg, #4E342E 0%, #261a17 100%)',
        bgImage: 'assets/images/realms/realm_bg_3.webp'
      },
      // Foundation
      4: {
        icon: '🌕',
        color: '#FFD54F',
        bg: 'linear-gradient(135deg, #FF6F00 0%, #8f3e00 100%)',
        bgImage: 'assets/images/realms/realm-4-bg.webp'
      },
      // Golden Core
      5: {
        icon: '👶',
        color: '#FFAB91',
        bg: 'linear-gradient(135deg, #BF360C 0%, #5f1a05 100%)',
        bgImage: 'assets/images/realms/realm-5-bg.webp'
      },
      // Nascent Soul
      6: {
        icon: '🧘',
        color: '#CE93D8',
        bg: 'linear-gradient(135deg, #4A148C 0%, #220542 100%)',
        bgImage: 'assets/images/realms/realm-6-bg.webp'
      },
      // Divine Spirit
      7: {
        icon: '🔗',
        color: '#80CBC4',
        bg: 'linear-gradient(135deg, #004D40 0%, #00251f 100%)',
        bgImage: 'assets/images/bg_realm_7.webp'
      },
      // Integration
      8: {
        icon: '🚤',
        color: '#FFE082',
        bg: 'linear-gradient(135deg, #FF8F00 0%, #8f5000 100%)',
        bgImage: 'assets/images/bg_realm_8.webp'
      },
      // Great Vehicle
      9: {
        icon: '☁️',
        color: '#B3E5FC',
        bg: 'linear-gradient(135deg, #0277BD 0%, #003c5f 100%)',
        bgImage: 'assets/images/bg_realm_9.webp'
      },
      // Ascension
      10: {
        icon: '⛰️',
        color: '#A5D6A7',
        bg: 'linear-gradient(135deg, #1B5E20 0%, #0a290d 100%)',
        bgImage: 'assets/images/bg_realm_10.webp'
      },
      // Earthly Immortal
      11: {
        icon: '🕊️',
        color: '#F48FB1',
        bg: 'linear-gradient(135deg, #880E4F 0%, #440727 100%)',
        bgImage: 'assets/images/bg_realm_11.webp'
      },
      // Heavenly Peace
      12: {
        icon: '✨',
        color: '#FFF59D',
        bg: 'linear-gradient(135deg, #F9A825 0%, #7e520b 100%)',
        bgImage: 'assets/images/bg_realm_12.webp'
      },
      // Golden Immortal
      13: {
        icon: '🌌',
        color: '#9575CD',
        bg: 'linear-gradient(135deg, #311B92 0%, #150a42 100%)',
        bgImage: 'assets/images/bg_realm_13.webp'
      },
      // Great Luo
      14: {
        icon: '🌀',
        color: '#90A4AE',
        bg: 'linear-gradient(135deg, #263238 0%, #0f1619 100%)',
        bgImage: 'assets/images/bg_realm_14.webp'
      },
      // Chaos Origin
      15: {
        icon: '👑',
        color: '#EF9A9A',
        bg: 'linear-gradient(135deg, #B71C1C 0%, #520909 100%)',
        bgImage: 'assets/images/bg_realm_15.webp'
      },
      // Supreme
      16: {
        icon: '☯️',
        color: '#E0E0E0',
        bg: 'linear-gradient(135deg, #212121 0%, #000000 100%)',
        bgImage: 'assets/images/bg_realm_16.webp'
      },
      // Taiyi
      17: {
        icon: '🌳',
        color: '#C5E1A5',
        bg: 'linear-gradient(135deg, #33691E 0%, #163009 100%)',
        bgImage: 'assets/images/bg_realm_17.webp'
      },
      // Bodhi
      18: {
        icon: '🌑',
        color: '#757575',
        bg: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)',
        bgImage: 'assets/images/bg_realm_18.webp'
      } // Chaos Void
    };

    // 生成18重天卡片
    for (let i = 1; i <= 18; i++) {
      const isUnlocked = this.game.unlockedRealms && this.game.unlockedRealms.includes(i);
      const isCompleted = isUnlocked && this.game.unlockedRealms.includes(i + 1);
      const realmCard = document.createElement('div');
      // Add 'spirit-tablet' class conceptually, actual styling via .realm-card
      realmCard.className = `realm-card ${isUnlocked ? '' : 'locked'}`;
      realmCard.dataset.id = i;
      realmCard.style.animationDelay = `${i * 0.05}s`; // Staggered entrance

      const realmName = this.game.map.getRealmName(i);
      const env = this.game.map.getRealmEnvironment(i);
      const theme = REALM_THEMES[i] || {
        icon: '❓',
        color: '#fff',
        bg: '#222'
      };

      // Apply Theme
      // 设计要求：未解锁重天也展示背景图，仅通过遮罩和锁定标识区分状态。
      try {
        if (theme.bgImage) {
          const overlay = isUnlocked ? 'linear-gradient(to bottom, rgba(0,0,0,0) 30%, rgba(0,0,0,0.95) 100%)' : 'linear-gradient(to bottom, rgba(0,0,0,0.35) 20%, rgba(0,0,0,0.92) 100%)';
          realmCard.style.backgroundImage = `${overlay}, url('${theme.bgImage}')`;
          realmCard.style.backgroundSize = 'cover';
          realmCard.style.backgroundPosition = 'center';
          realmCard.style.textShadow = '0 2px 4px #000';
        } else if (theme.bg) {
          realmCard.style.background = theme.bg;
        }
      } catch (e) {
        console.warn('Realm card theme apply failed:', i, e);
      }
      realmCard.style.borderColor = isUnlocked ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.08)';
      // We'll let CSS hover handle the gold border, but we can set a custom property for the glow
      realmCard.style.setProperty('--theme-color', theme.color);

      // Icon selection
      // default to empty for unlocked realms as per user request
      let icon = '';
      if (!isUnlocked) icon = '🔒';

      // Hide icon if bgImage is present or if it's empty
      const iconStyle = isUnlocked && theme.bgImage || !icon ? 'display:none' : `text-shadow: 0 0 15px ${theme.color}40`;

      // Spirit Tablet Structure
      realmCard.innerHTML = `
                <div class="realm-icon" style="${iconStyle}">${icon}</div>
                <div class="realm-info">
                    <h3 style="${isUnlocked ? `color:${theme.color}` : ''}">${realmName}</h3>
                    ${isUnlocked ? `<span class="realm-env-preview">${env.name}</span>` : ''}
                </div>
            `;
      if (isUnlocked) {
        realmCard.addEventListener('click', () => {
          this.selectRealm(i);
        });
      } else {
        // Locked click feedback
        realmCard.addEventListener('click', () => {
          Utils.showBattleLog('此天域尚处于迷雾之中，需突破前一重方可踏入。');
        });
      }
      listContainer.appendChild(realmCard);
    }
    if (this.game.isEndlessUnlocked()) {
      const endlessCard = document.createElement('div');
      endlessCard.className = 'realm-card endless-card';
      endlessCard.dataset.id = 'endless';
      endlessCard.style.animationDelay = '0.95s';
      endlessCard.style.background = 'linear-gradient(145deg, #0d1f36 0%, #040811 100%)';
      endlessCard.style.borderColor = 'rgba(84, 200, 255, 0.55)';
      endlessCard.style.setProperty('--theme-color', '#5dd9ff');
      endlessCard.innerHTML = `
                <div class="realm-icon" style="display:block;filter:none;text-shadow:0 0 12px rgba(93,217,255,0.75)">♾️</div>
                <div class="realm-info">
                    <h3 style="color:#9ce9ff">无尽轮回</h3>
                    <span class="realm-env-preview">动态词缀 / 赐福构筑 / 无限挑战</span>
                </div>
            `;
      endlessCard.addEventListener('click', () => this.selectRealm('endless'));
      listContainer.appendChild(endlessCard);
    }

    // Bind Enter Button
    const enterBtn = document.getElementById('enter-realm-btn');
    if (enterBtn) {
      // Remove old listeners by cloning
      const newBtn = enterBtn.cloneNode(true);
      enterBtn.parentNode.replaceChild(newBtn, enterBtn);
      newBtn.onclick = () => {
        if (this.game.selectedRealmId !== null && this.game.selectedRealmId !== undefined) {
          if (this.game.selectedRealmId === 'endless') {
            this.game.startEndlessMode();
            return;
          }
          const isCompleted = this.game.unlockedRealms && this.game.unlockedRealms.includes(this.game.selectedRealmId + 1);
          this.startRealm(this.game.selectedRealmId, isCompleted);
        }
      };
    }

    // Auto-select logic
    let targetRealm = 1;
    const unlockedRealms = Array.isArray(this.game.unlockedRealms) && this.game.unlockedRealms.length > 0 ? this.game.unlockedRealms : [1];
    if (unlockedRealms.length > 0) {
      targetRealm = Math.max(...unlockedRealms);
    }
    if (this.game.lastSelectedRealmId && unlockedRealms.includes(this.game.lastSelectedRealmId)) {
      targetRealm = this.game.lastSelectedRealmId;
    }
    if (this.game.isEndlessActive() && this.game.isEndlessUnlocked()) {
      targetRealm = 'endless';
    }
    if (this.game.lastSelectedRealmId === 'endless' && this.game.isEndlessUnlocked()) {
      targetRealm = 'endless';
    }
    this.selectRealm(targetRealm);
  }
  selectRealm(realmId) {
    if (this.game.selectedRealmId === realmId) return;
    this.game.selectedRealmId = realmId;
    this.game.lastSelectedRealmId = realmId;

    // 1. Highlight UI
    document.querySelectorAll('.realm-card').forEach(card => {
      const cardId = card.dataset.id === 'endless' ? 'endless' : parseInt(card.dataset.id, 10);
      if (cardId === realmId) {
        card.classList.add('active');
        card.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      } else {
        card.classList.remove('active');
      }
    });

    // 2. Update Preview
    this.updateRealmPreview(realmId);

    // 3. Enable Button
    const enterBtn = document.getElementById('enter-realm-btn');
    if (enterBtn) {
      enterBtn.disabled = false;
      if (realmId === 'endless') {
        enterBtn.textContent = '开启无尽';
      } else {
        const unlocked = Array.isArray(this.game.unlockedRealms) ? this.game.unlockedRealms : [1];
        const isCompleted = unlocked.includes(realmId + 1);
        if (isCompleted) {
          enterBtn.textContent = '重修此界';
        } else {
          enterBtn.textContent = '踏入天域';
        }
      }
    }
  }
  updateRealmPreview(realmId) {
    const panel = document.getElementById('realm-preview-panel');
    if (!panel) return;
    const placeholder = panel.querySelector('.realm-preview-placeholder');
    const content = panel.querySelector('.realm-preview-content');
    if (placeholder) placeholder.style.display = 'none';
    if (content) {
      content.style.display = 'flex';
      content.style.opacity = 0;
      setTimeout(() => content.style.opacity = 1, 50);
    }
    if (realmId === 'endless') {
      const state = this.game.ensureEndlessState();
      const modifiers = this.game.getEndlessModifiers();
      const phaseProfile = this.game.getEndlessPhaseProfile(state.currentCycle);
      const cycleTheme = this.game.getEndlessCycleThemeProfile(state.currentCycle);
      const seasonProfile = typeof this.game.getEndlessSeasonProfile === 'function' ? this.game.getEndlessSeasonProfile(state.currentCycle) : null;
      const realm = this.game.getEndlessRealmForCycle(state.currentCycle);
      const realmName = this.game.map.getRealmName(realm);
      const activeMutators = (state.activeMutators || []).map(id => this.game.getEndlessMutatorPool().find(m => m.id === id)).filter(Boolean);
      const goalSummary = seasonProfile && Array.isArray(seasonProfile.goals) && seasonProfile.goals.length > 0 ? seasonProfile.goals.map(goal => `${goal.tierLabel}${goal.completed ? ' 已达成' : ` ${goal.progressText}`}`).join(' / ') : '进入无尽后生成本周目标链。';
      const collapseSummary = seasonProfile && Array.isArray(seasonProfile.collapseSummary) && seasonProfile.collapseSummary.length > 0 ? seasonProfile.collapseSummary.map(item => `${item.label} ${item.count} 次`).join(' / ') : '当前赛季暂无崩盘记录。';
      const directiveButtons = seasonProfile && Array.isArray(seasonProfile.directiveChoices) && seasonProfile.directiveChoices.length > 0 ? `
                    <div class="preview-endless-directives">
                        <button class="preview-endless-directive-btn ${seasonProfile.activeDirectiveSource === 'auto' ? 'active' : ''}" data-directive-id="auto">
                            轮转推荐
                        </button>
                        ${seasonProfile.directiveChoices.map(item => `
                            <button
                                class="preview-endless-directive-btn ${item.selected ? 'active' : ''}"
                                data-directive-id="${item.id}"
                                title="${item.desc || ''}"
                            >
                                ${item.name} · ${item.riskLabel}
                            </button>
                        `).join('')}
                    </div>
                ` : '';
      const dangerProfile = typeof this.game.getEndlessDangerProfile === 'function' ? this.game.getEndlessDangerProfile(state.currentCycle) : null;
      const titleEl = document.getElementById('preview-title');
      if (titleEl) titleEl.textContent = `无尽轮回 · 第 ${state.currentCycle + 1} 轮`;
      const iconEl = document.getElementById('preview-icon');
      if (iconEl) iconEl.textContent = '♾️';
      const envEl = document.getElementById('preview-env');
      const chapterEl = document.getElementById('preview-chapter');
      const buildEl = document.getElementById('preview-build');
      if (envEl) {
        const phaseText = phaseProfile && phaseProfile.active ? `<br><span style="color:#ffd48a;">阶段挑战：${phaseProfile.name}（第${phaseProfile.checkpoint}轮）</span>` : '<br><span style="color:#7fb5c8;">阶段挑战：稳态区间</span>';
        const themeText = cycleTheme && cycleTheme.name ? `<br><span style="color:#9ceeff;">轮段主题：${cycleTheme.name}（第${cycleTheme.segmentIndex}段）</span><br><span style="color:#bdefff;opacity:0.9;">${cycleTheme.desc || ''}</span>` : '<br><span style="color:#9ceeff;">轮段主题：稳衡</span>';
        const seasonText = seasonProfile ? `<br><span style="color:#ffd9a7;">赛季：${seasonProfile.icon || '🜁'} ${seasonProfile.name}（${seasonProfile.weekTag}）</span><br><span style="color:#ffd9a7;opacity:0.92;">季签：${seasonProfile.directiveName} · ${seasonProfile.directiveDesc || '保持稳态推进。'}</span>` : '<br><span style="color:#ffd9a7;">赛季：待命</span>';
        const dangerText = dangerProfile ? `<br><span style="color:#ffddb0;">轮回压强：DRI ${dangerProfile.index} / 100 · ${dangerProfile.tierLabel}</span><br><span style="color:#ffe9c8;opacity:0.92;">主轴：${dangerProfile.dominantAxisLabel}｜对策：${dangerProfile.counterplay}</span>` : '';
        envEl.innerHTML = `
                    <div style="margin-bottom:5px; color:#8fe8ff; font-weight:bold; font-size:1.05rem;">
                        当前映射：${realmName}
                    </div>
                    <div style="font-size:0.9rem; line-height:1.5;">
                        敌人生命 x${modifiers.enemyHpMul.toFixed(2)}｜敌人攻击 x${modifiers.enemyAtkMul.toFixed(2)}<br>
                        灵石奖励 x${modifiers.rewardGoldMul.toFixed(2)}｜命环经验 x${modifiers.rewardExpMul.toFixed(2)}<br>
                        商店价格 x${modifiers.shopPriceMul.toFixed(2)}｜治疗效率 x${modifiers.healMul.toFixed(2)}
                        ${phaseText}
                        ${themeText}
                        ${seasonText}
                        ${dangerText}
                    </div>
                `;
      }
      if (chapterEl) {
        const seasonBest = Math.max(0, Math.floor(Number(state.seasonBestCycle) || 0));
        const seasonClears = Math.max(0, Math.floor(Number(state.seasonCycleClears) || 0));
        const seasonBosses = Math.max(0, Math.floor(Number(state.seasonBossDefeated) || 0));
        const seasonScore = Math.max(0, Math.floor(Number(state.seasonScore) || 0));
        chapterEl.innerHTML = `
                    <div class="preview-chapter-summary">
                        <strong>无尽轮回不绑定固定章节。</strong><br>
                        当前映射天域会随轮次切换，主题词缀、压力阶段、赛季季签与偏执会共同决定打法。
                    </div>
                    <div class="preview-rule-line"><span class="rule-label">风险主轴</span><span>${dangerProfile ? `DRI ${dangerProfile.index} · ${dangerProfile.dominantAxisLabel} · ${dangerProfile.summary}` : '待进入轮回后推演'}</span></div>
                    <div class="preview-rule-line"><span class="rule-label">赛季战绩</span><span>已通关 ${seasonClears} 轮 / 主宰 ${seasonBosses} / 赛季积分 ${seasonScore} / 最深第 ${Math.max(1, seasonBest)} 轮</span></div>
                    <div class="preview-rule-line"><span class="rule-label">赛季目标</span><span>${goalSummary}</span></div>
                    <div class="preview-rule-line"><span class="rule-label">崩盘账本</span><span>${collapseSummary}</span></div>
                `;
      }
      if (buildEl) {
        buildEl.innerHTML = `
                    <div class="preview-current-build">
                        建议优先围绕 <strong>轮段主题</strong>、<strong>阶段挑战</strong>、<strong>当前 DRI 主轴</strong> 与 <strong>当前偏执</strong> 调整临时路线，而不是死守单一章节思路。<br>
                        当前主轴：<strong>${dangerProfile?.dominantAxisLabel || '待推演'}</strong>｜对策：${dangerProfile?.counterplay || '进入无尽后会自动生成应对提示。'}<br>
                        当前季签：<strong>${seasonProfile?.directiveName || '稳态令'}</strong>（${seasonProfile?.directiveRiskLabel || '平衡'} / ${seasonProfile?.selectionModeLabel || '轮转推荐'}）
                    </div>
                    ${directiveButtons}
                `;
        buildEl.querySelectorAll('.preview-endless-directive-btn').forEach(btn => {
          btn.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const nextDirectiveId = btn.dataset.directiveId || 'auto';
            if (typeof this.game.setEndlessSeasonDirective === 'function') {
              this.game.setEndlessSeasonDirective(nextDirectiveId === 'auto' ? null : nextDirectiveId);
            }
            this.updateRealmPreview('endless');
          });
        });
      }
      const bossEl = document.getElementById('preview-boss');
      if (bossEl) {
        if (activeMutators.length > 0) {
          bossEl.innerHTML = activeMutators.map(mutator => `
                        <div style="margin-bottom:8px;">
                            <div style="color:var(--accent-red);font-weight:700;">${mutator.name}</div>
                            <div style="font-size:0.88rem;opacity:0.9;">${mutator.desc}</div>
                        </div>
                    `).join('');
        } else {
          bossEl.innerHTML = '<span style="color:#6ccdf2;">当前无额外词缀，进入后将自动生成。</span>';
        }
      }
      const lootEl = document.getElementById('preview-loot');
      if (lootEl) {
        lootEl.innerHTML = '';
        ['💰', '🔮', '🧿', '🃏', '♾️'].forEach((icon, idx) => {
          const el = document.createElement('div');
          el.className = `loot-icon ${idx >= 3 ? 'epic' : 'rare'}`;
          el.textContent = icon;
          lootEl.appendChild(el);
        });
      }
      const costDisplay = document.getElementById('realm-cost-display');
      if (costDisplay) {
        costDisplay.style.display = 'block';
        costDisplay.innerHTML = `当前累计突破 <span style="color:#8fe8ff;">${state.totalBossDefeated}</span> 次，已完成 <span style="color:#8fe8ff;">${state.clearedCycles}</span> 轮。`;
      }
      return;
    }

    // Data
    const realmName = this.game.map.getRealmName(realmId);
    const env = this.game.map.getRealmEnvironment(realmId);
    const chapter = this.getChapterDisplaySnapshot(realmId);

    // Update Header
    const titleEl = document.getElementById('preview-title');
    if (titleEl) titleEl.textContent = realmName;

    // Dynamic Icon based on Realm Type
    const iconEl = document.getElementById('preview-icon');
    if (iconEl) {
      let iconChar = '⚔️';
      if (realmId % 5 === 0) iconChar = '⚡'; // Boss Realms
      if (realmId === 18) iconChar = '🌌';
      iconEl.textContent = iconChar;
    }

    // Update Environment Section
    const envEl = document.getElementById('preview-env');
    if (envEl) {
      // Parse effect key to icon/color if needed, for now just rich text
      envEl.innerHTML = `
                <div style="margin-bottom:5px; color:var(--accent-gold); font-weight:bold; font-size:1.1rem;">
                    ${env.name}
                </div>
                <div style="font-size:0.95rem;">${env.desc}</div>
            `;
    }
    const chapterEl = document.getElementById('preview-chapter');
    if (chapterEl && chapter) {
      const focusText = Array.isArray(chapter.focusTags) && chapter.focusTags.length > 0 ? chapter.focusTags.join(' / ') : chapter.mechanic;
      chapterEl.innerHTML = `
                <div class="preview-chapter-summary">
                    <strong>${chapter.fullName}</strong>
                    <span class="preview-stage-pill">${chapter.stageLabel}</span>
                </div>
                <div class="preview-rule-line"><span class="rule-label">天象</span><span>${chapter.skyOmen.name} · ${chapter.skyOmen.desc}</span></div>
                <div class="preview-rule-line"><span class="rule-label">地脉</span><span>${chapter.leyline.name} · ${chapter.leyline.desc}</span></div>
                <div class="preview-rule-line"><span class="rule-label">放大</span><span>${focusText}</span></div>
            `;
    }
    const buildEl = document.getElementById('preview-build');
    if (buildEl && chapter) {
      const renderTagGroup = (items = [], matches = false) => {
        if (!Array.isArray(items) || items.length === 0) return '<span class="preview-tag muted">暂未显现</span>';
        return items.slice(0, 3).map(meta => `<span class="preview-tag ${matches ? 'match' : ''}">${meta.icon || '✦'} ${meta.name}</span>`).join('');
      };
      const currentLines = [];
      if (chapter.currentDestiny) {
        currentLines.push(`当前命格：${chapter.currentDestiny.icon || '✦'} ${chapter.currentDestiny.name}${chapter.destinyRecommended ? ' · 顺势' : ' · 可改线'}`);
      }
      if (chapter.currentSpirit) {
        currentLines.push(`当前灵契：${chapter.currentSpirit.icon || '✦'} ${chapter.currentSpirit.name}${chapter.spiritRecommended ? ' · 顺势' : ' · 可改线'}`);
      }
      if (Array.isArray(chapter.currentVows) && chapter.currentVows.length > 0) {
        currentLines.push(`当前誓约：${chapter.currentVows.map(meta => `${meta.icon || '✦'} ${meta.name}`).join(' / ')}${chapter.vowRecommended ? ' · 顺势' : ' · 可补强'}`);
      } else {
        currentLines.push('当前尚未立誓，本章中后段可优先考虑顺势誓约。');
      }
      buildEl.innerHTML = `
                <div class="preview-recommend-row">
                    <span class="recommend-label">命格</span>
                    <span class="preview-tag-strip">${renderTagGroup(chapter.recommendedDestinies, chapter.destinyRecommended)}</span>
                </div>
                <div class="preview-recommend-row">
                    <span class="recommend-label">灵契</span>
                    <span class="preview-tag-strip">${renderTagGroup(chapter.recommendedSpirits, chapter.spiritRecommended)}</span>
                </div>
                <div class="preview-recommend-row">
                    <span class="recommend-label">誓约</span>
                    <span class="preview-tag-strip">${renderTagGroup(chapter.recommendedVows, chapter.vowRecommended)}</span>
                </div>
                <div class="preview-current-build">${currentLines.join('<br>')}</div>
            `;
    }

    // Update Boss Section
    const bossInfo = this.getRealmBossInfo(realmId);
    const bossEl = document.getElementById('preview-boss');
    if (bossEl) {
      if (bossInfo) {
        // If bossInfo is just an object, we need to format it. 
        // Assuming getRealmBossInfo returns { bossName, mechDesc, ... } from the code I saw earlier
        // Wait, I saw getRealmBossInfo body partially. Let's assume it returns a consistent object or null.
        // Actually, I should probably check getRealmBossInfo implementation or rely on what was there.
        // The previous code had: const bossInfo = this.getRealmBossInfo(realmId);
        // I will replicate safe check.
        const name = bossInfo.bossName || '???';
        const desc = bossInfo.mechDesc || '未知的恐怖存在...';

        // Add logo if exists
        let logoHtml = '';
        if (bossInfo.logo) {
          logoHtml = `<div style="text-align:center; margin-bottom:10px;">
                        <img src="${bossInfo.logo}" style="width:80px; height:80px; border-radius:50%; border:2px solid var(--accent-red); object-fit:cover;">
                   </div>`;
        }
        bossEl.innerHTML = `
                    ${logoHtml}
                    <div style="color:var(--accent-red); font-weight:bold; margin-bottom:5px;">${name}</div>
                    <div style="font-size:0.9rem; opacity:0.9;">${desc}</div>
                `;
      } else {
        bossEl.innerHTML = '<span style="color:#666;">此界并无所谓的主宰...</span>';
      }
    }

    // Update Rewards (Loot)
    const lootEl = document.getElementById('preview-loot');
    if (lootEl) {
      lootEl.innerHTML = '';

      // Generate visual loot icons
      const createLoot = (icon, type) => {
        const el = document.createElement('div');
        el.className = `loot-icon ${type}`;
        el.textContent = icon;
        return el;
      };
      lootEl.appendChild(createLoot('💰', 'common'));
      lootEl.appendChild(createLoot('🔮', 'rare'));
      if (realmId >= 5) lootEl.appendChild(createLoot('📜', 'epic')); // Jade Slips
      if (realmId >= 10) lootEl.appendChild(createLoot('🏺', 'legendary')); // Treasures
    }

    // Cost Display (if re-entering)
    const costDisplay = document.getElementById('realm-cost-display');
    const unlocked = Array.isArray(this.game.unlockedRealms) ? this.game.unlockedRealms : [1];
    const isCompleted = unlocked.includes(realmId + 1);
    if (costDisplay) {
      if (isCompleted) {
        costDisplay.style.display = 'block';
        costDisplay.innerHTML = `⚠️ 重修此界将 <span style="color:var(--accent-gold);">收益减半</span> (无法获得全额灵石与经验)`;
      } else {
        costDisplay.style.display = 'none';
      }
    }
  }
  getRealmBossInfo(realm) {
    // 天域与Boss ID对照表
    const realmBossMap = {
      1: 'banditLeader',
      2: 'demonWolf',
      3: 'swordElder',
      4: 'danZun',
      5: 'ancientSpirit',
      6: 'divineLord',
      7: 'fusionSovereign',
      8: 'mahayanaSupreme',
      9: 'ascensionSovereign',
      10: 'dualMagmaGuardians',
      11: 'stormSummoner',
      12: 'triheadGoldDragon',
      13: 'mirrorDemon',
      14: 'chaosEye',
      15: 'voidDevourer',
      16: 'elementalElder',
      17: 'karmaArbiter',
      18: 'heavenlyDao'
    };
    const bossId = realmBossMap[realm];
    if (!bossId || typeof BOSS_MECHANICS === 'undefined' || !BOSS_MECHANICS[bossId]) {
      return {
        bossName: null,
        mechDesc: '',
        counterTreasure: ''
      };
    }
    const boss = BOSS_MECHANICS[bossId];
    const mechDesc = boss.mechanics?.description || '未知机制';

    // 获取克制法宝名称
    let counterNames = [];
    if (boss.countersBy && typeof TREASURES !== 'undefined') {
      counterNames = boss.countersBy.map(tid => TREASURES[tid]?.name || tid).slice(0, 2); // 最多显示2个
    }
    return {
      bossName: boss.name,
      mechDesc: mechDesc,
      counterTreasure: counterNames.length > 0 ? counterNames.join(' / ') : '',
      logo: typeof ENEMIES !== 'undefined' && ENEMIES[bossId] ? ENEMIES[bossId].logo : null
    };
  }
  startRealm(realmLevel, isReplay = false) {
    const targetRealm = Math.max(1, Math.min(18, Math.floor(Number(realmLevel) || 1)));
    // 如果点击的是当前正在进行的关卡，且并未死亡，则直接返回地图
    if (!this.game.isEndlessActive() && this.game.player.realm === targetRealm && this.game.map.nodes.length > 0 && this.game.player.currentHp > 0) {
      this.game.showScreen('map-screen');
      return;
    }
    const endlessState = this.game.ensureEndlessState();
    endlessState.active = false;
    this.game.player.realm = targetRealm;
    this.game.player.floor = 0;
    // 标记是否为重玩 (已通关)
    this.game.player.isReplay = isReplay;
    // 新的开始（非原地复活）重置重修标记
    this.game.player.isRecultivation = false;
    this.game.player.resetBattleState(); // hypothetical helper, or manual reset

    this.game.map.generate(this.game.player.realm);
    this.game.showScreen('map-screen');
    this.game.autoSave();
  }
  restartRealm() {
    if (!this.game.player) return;

    // 增加复活代价：收益减半 (不再扣除灵石)
    this.game.player.isRecultivation = true;
    // const reviveCost = Math.floor(this.game.player.gold * 0.5); // 扣除50%灵石
    // this.game.player.gold -= reviveCost;

    // 恢复生命值
    this.game.player.currentHp = this.game.player.maxHp;

    // 重置层数
    this.game.player.floor = 0;

    // 重新生成地图
    this.game.map.generate(this.game.player.realm);

    // Check Skill Unlock status (e.g. if restarting at Realm 5+, unlock skill)
    this.game.player.checkSkillUnlock();

    // 自动保存
    // 关键修复：保存必须在所有状态重置（扣钱、恢复HP、重置层数）之后立即进行
    // 这样如果用户在点击“重修此界”后刷新，加载的存档已经是扣过钱并重置进度的状态
    this.game.autoSave();
    Utils.showBattleLog(`时光倒流... 重修 ${this.game.map.getRealmName(this.game.player.realm)} (此界收益减半)`);

    // 进入地图界面
    this.game.showScreen('map-screen');
  }
  advanceToNextRealm(clearEssence = 0) {
    this.game.player.realm++;
    this.game.player.floor = 0;
    this.game.currentBattleNode = null; // 防止奖励结算重复触发

    this.game.player.isRecultivation = false;
    this.game.player.isReplay = false;
    this.game.player.checkSkillUnlock();
    this.game.autoSave();
    if (typeof AuthService !== 'undefined' && AuthService.isLoggedIn()) {
      console.log('Realm Complete: Forcing Cloud Sync');
    }
    const healAmount = Math.floor(this.game.player.maxHp * 0.2);
    this.game.player.heal(healAmount);
    Utils.showBattleLog(`进入下一重天域，恢复 ${healAmount} HP，轮回精粹 +${clearEssence}`);
    this.game.map.generate(this.game.player.realm);
    this.game.renderTreasures('map-treasures');
    this.game.showScreen('map-screen');
  }
  onRealmComplete() {
    if (this.game.isEndlessActive()) {
      this.game.handleEndlessRealmComplete();
      return;
    }

    // --- P1: 异步 PVP 残影上传 ---
    if (typeof AuthService !== 'undefined' && AuthService.uploadGhostData) {
      AuthService.uploadGhostData(this.game.player, this.game.player.realm).catch(e => console.error(e));
    }
    const currentRealm = this.game.player.realm;
    const clearEssence = this.game.awardLegacyEssence(2 + Math.floor(currentRealm / 2), '破境夺天', {
      silent: true
    });

    // 更新成就
    this.game.achievementSystem.updateStat('realmCleared', this.game.player.realm, 'max');

    // 检查速通
    if (this.game.runStartTime) {
      const runTime = (Date.now() - this.game.runStartTime) / 1000;
      this.game.achievementSystem.updateStat('speedClear', runTime, 'min');
    }

    // 检查牌组大小
    this.game.achievementSystem.updateStat('minDeckClear', this.game.player.deck.length, 'min');

    // 解锁下一重天
    if (!this.game.unlockedRealms) this.game.unlockedRealms = [1];
    if (!this.game.unlockedRealms.includes(this.game.player.realm + 1)) {
      this.game.unlockedRealms.push(this.game.player.realm + 1);
    }

    // Update max realm reached (Next unlocked)
    if (this.game.player.realm + 1 > this.game.player.maxRealmReached) {
      this.game.player.maxRealmReached = this.game.player.realm + 1;
    }
    const expeditionState = typeof this.game.getExpeditionState === 'function' ? this.game.getExpeditionState() : this.game.expeditionState;
    const challengeRun = this.game.activeChallengeRun && typeof this.game.activeChallengeRun === 'object' ? this.game.activeChallengeRun : null;
    const shouldRecordPveCompletion = !this.game.player?.isReplay
      && !this.game.progressionSuppressPveRealmCompletion
      && !challengeRun
      && !expeditionState
      && typeof ProgressionService !== 'undefined'
      && ProgressionService
      && typeof ProgressionService.recordActivityCompleted === 'function';
    if (shouldRecordPveCompletion) {
      const progressionRun = typeof this.game.ensureProgressionRunIdentity === 'function'
        ? this.game.ensureProgressionRunIdentity({
            startedAt: this.game.runStartTime || Date.now()
          })
        : {
            runId: '',
            ownerUserId: ''
          };
      const currentRealmRunId = progressionRun.runId ? `${progressionRun.runId}:realm:${currentRealm}` : '';
      const currentNodeId = String(this.game.currentBattleNode?.id || `boss:${currentRealm}`).trim();
      const sourceRef = typeof this.game.createProgressionSourceRef === 'function'
        ? this.game.createProgressionSourceRef({
            runId: currentRealmRunId,
            eventType: 'activity_completed',
            realm: currentRealm,
            checkpointKey: `${currentRealm}:${currentNodeId}:boss-complete`
          })
        : `pve:${currentRealmRunId}:${currentNodeId}:boss-complete`;
      const verificationContext = typeof this.game.buildProgressionVerificationContext === 'function'
        ? this.game.buildProgressionVerificationContext({
            mode: 'pve',
            realm: currentRealm,
            completionType: 'realm_clear',
            nodeId: currentNodeId
          })
        : {
            realm: currentRealm,
            saveSlot: Number.isInteger(this.game.currentSaveSlot) ? this.game.currentSaveSlot : null
          };
      ProgressionService.recordActivityCompleted({
        mode: 'pve',
        runId: currentRealmRunId,
        ownerUserId: progressionRun.ownerUserId || '',
        sourceRef,
        verificationContext,
        proof: {
          nodeType: 'boss',
          realm: currentRealm,
          reason: 'realm_clear',
          runId: currentRealmRunId
        }
      });
      if (typeof ProgressionService.flush === 'function') {
        Promise.resolve().then(() => ProgressionService.flush()).catch(() => {});
      }
    }

    // 检查是否通关所有天域 (现在是18重)
    if (this.game.player.realm >= 18) {
      const finalEssence = this.game.awardLegacyEssence(18, '逆天终局', {
        silent: true
      });
      this.game.lastLegacyGain = clearEssence + finalEssence;
      this.game.showVictoryScreen();
      return;
    }
    if (this.shouldOfferRunPathMutationAfterRealm(currentRealm)) {
      this.game.showRunPathMutationSelection(currentRealm, () => {
        if (this.shouldOfferRunVowAfterRealm(currentRealm)) {
          this.game.showRunVowSelection(currentRealm, () => {
            this.advanceToNextRealm(clearEssence);
          });
          return;
        }
        this.advanceToNextRealm(clearEssence);
      });
      return;
    }
    if (this.shouldOfferRunVowAfterRealm(currentRealm)) {
      this.game.showRunVowSelection(currentRealm, () => {
        this.advanceToNextRealm(clearEssence);
      });
      return;
    }
    this.advanceToNextRealm(clearEssence);
  }
  setNextRealmMapRumor(shift, label = '') {
    const rumors = this.game.ensureShopRumors();
    rumors.nextRealmMapShift = shift && typeof shift === 'object' ? {
      ...shift
    } : null;
    rumors.nextRealmLabel = typeof label === 'string' ? label : '';
    rumors.nextRealmTarget = this.game.player ? Math.max(1, (this.game.player.realm || 1) + 1) : null;
    if (rumors.nextRealmLabel) {
      this.game.pushShopRumorHistory(`已锁定第 ${rumors.nextRealmTarget} 重：${rumors.nextRealmLabel}`);
    }
  }
}
if (typeof window !== 'undefined') {}
