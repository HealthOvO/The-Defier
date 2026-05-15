import { FATE_RING } from "../data/fate_ring.js";
import { Utils } from "../core/utils.js";
import { getRandomCard } from "../data/cards.js";
export class EndlessManager {
  constructor(gameInstance) {
    this.game = gameInstance;
  }
  createDefaultEndlessState() {
    return {
      unlocked: false,
      active: false,
      currentCycle: 0,
      clearedCycles: 0,
      pressure: 0,
      totalBossDefeated: 0,
      totalEndlessScore: 0,
      activeMutators: [],
      lastMutatorId: null,
      lastPhaseId: null,
      lastThemeId: null,
      phaseHistory: [],
      themeHistory: [],
      boonHistory: [],
      paranoiaLevel: 0,
      activeParanoiaBurdens: [],
      activeParanoiaBoons: [],
      paranoiaHistory: [],
      lastParanoiaCycle: -1,
      boonRarePity: 0,
      boonRareGuaranteedEvery: 3,
      barterHeat: 0,
      seasonId: null,
      seasonWeekTag: '',
      seasonName: '',
      seasonIcon: '',
      lastSeasonDirectiveId: null,
      seasonBestCycle: 0,
      seasonCycleClears: 0,
      seasonBossDefeated: 0,
      seasonScore: 0,
      seasonArchive: {},
      seasonDirectiveSelection: {
        seasonId: null,
        weekTag: '',
        directiveId: null,
        source: 'auto'
      },
      seasonDirectiveClearCounts: {},
      seasonCollapseStats: {},
      lastSeasonCollapse: null,
      boonStats: {
        rewardGoldMul: 0,
        rewardExpMul: 0,
        shopDiscountMul: 0,
        healMul: 0,
        battleFirstTurnDraw: 0,
        battleOpeningBlock: 0,
        battleFirstTurnEnergy: 0
      }
    };
  }
  normalizeEndlessState(rawState = null) {
    const defaults = this.createDefaultEndlessState();
    const source = rawState && typeof rawState === 'object' ? rawState : {};
    const progressionRealm = Math.max(Number(this.game.player?.maxRealmReached) || 1, Math.max(...(Array.isArray(this.game.unlockedRealms) && this.game.unlockedRealms.length > 0 ? this.game.unlockedRealms : [1])));
    const normalizeInt = (value, fallback = 0) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return fallback;
      return Math.max(0, Math.floor(num));
    };
    const normalizeString = (value, maxLen = 64) => {
      if (typeof value !== 'string') return '';
      return value.trim().slice(0, Math.max(0, Math.floor(Number(maxLen) || 0)));
    };
    const sanitizeRate = value => {
      const num = Number(value);
      if (!Number.isFinite(num)) return 0;
      return Math.max(0, Math.min(0.9, num));
    };
    const normalizeStatMap = (value, maxEntries = 16) => {
      const sourceMap = value && typeof value === 'object' ? value : {};
      const normalizedMap = {};
      Object.keys(sourceMap).filter(key => typeof key === 'string' && key).slice(0, Math.max(0, Math.floor(Number(maxEntries) || 0))).forEach(key => {
        normalizedMap[key.slice(0, 48)] = normalizeInt(sourceMap[key], 0);
      });
      return normalizedMap;
    };
    const boonStatsRaw = source.boonStats && typeof source.boonStats === 'object' ? source.boonStats : {};
    const boonStats = {
      rewardGoldMul: sanitizeRate(boonStatsRaw.rewardGoldMul),
      rewardExpMul: sanitizeRate(boonStatsRaw.rewardExpMul),
      shopDiscountMul: sanitizeRate(boonStatsRaw.shopDiscountMul),
      healMul: sanitizeRate(boonStatsRaw.healMul),
      battleFirstTurnDraw: normalizeInt(boonStatsRaw.battleFirstTurnDraw),
      battleOpeningBlock: normalizeInt(boonStatsRaw.battleOpeningBlock),
      battleFirstTurnEnergy: normalizeInt(boonStatsRaw.battleFirstTurnEnergy)
    };
    const seasonArchiveRaw = source.seasonArchive && typeof source.seasonArchive === 'object' ? source.seasonArchive : {};
    const seasonArchive = {};
    Object.keys(seasonArchiveRaw).forEach(key => {
      if (typeof key !== 'string' || !key) return;
      const entry = seasonArchiveRaw[key];
      if (!entry || typeof entry !== 'object') return;
      const safeKey = key.slice(0, 96);
      seasonArchive[safeKey] = {
        seasonId: normalizeString(entry.seasonId, 32) || normalizeString(safeKey.split(':')[0], 32) || null,
        weekTag: normalizeString(entry.weekTag, 24),
        seasonName: normalizeString(entry.seasonName, 32),
        icon: normalizeString(entry.icon, 4),
        bestCycle: normalizeInt(entry.bestCycle),
        clears: normalizeInt(entry.clears),
        bosses: normalizeInt(entry.bosses),
        score: normalizeInt(entry.score),
        lastDirectiveId: normalizeString(entry.lastDirectiveId, 40) || null,
        directiveClearCounts: normalizeStatMap(entry.directiveClearCounts, 12),
        collapseStats: normalizeStatMap(entry.collapseStats, 12),
        lastCollapseReasonId: normalizeString(entry.lastCollapseReasonId, 48) || null,
        lastCollapseLabel: normalizeString(entry.lastCollapseLabel, 32),
        updatedAt: Math.max(0, Math.floor(Number(entry.updatedAt) || 0))
      };
    });
    const trimmedSeasonArchive = {};
    Object.keys(seasonArchive).sort((a, b) => (seasonArchive[b]?.updatedAt || 0) - (seasonArchive[a]?.updatedAt || 0)).slice(0, 16).forEach(key => {
      trimmedSeasonArchive[key] = seasonArchive[key];
    });
    const unlockedByProgress = progressionRealm >= 6;
    const sourceUnlocked = !!source.unlocked;
    const unlocked = sourceUnlocked || unlockedByProgress;
    const cycle = normalizeInt(source.currentCycle);
    const normalized = {
      ...defaults,
      ...source,
      unlocked,
      active: !!source.active && unlocked,
      currentCycle: cycle,
      clearedCycles: normalizeInt(source.clearedCycles, cycle),
      pressure: Math.max(0, Math.min(9, normalizeInt(source.pressure))),
      totalBossDefeated: normalizeInt(source.totalBossDefeated, cycle),
      totalEndlessScore: normalizeInt(source.totalEndlessScore),
      activeMutators: Array.isArray(source.activeMutators) ? source.activeMutators.filter(id => typeof id === 'string').slice(-3) : [],
      lastMutatorId: typeof source.lastMutatorId === 'string' ? source.lastMutatorId : null,
      lastPhaseId: typeof source.lastPhaseId === 'string' ? source.lastPhaseId : null,
      lastThemeId: typeof source.lastThemeId === 'string' ? source.lastThemeId : null,
      phaseHistory: Array.isArray(source.phaseHistory) ? source.phaseHistory.filter(entry => entry && typeof entry.id === 'string' && Number.isFinite(Number(entry.cycle))).map(entry => ({
        id: entry.id,
        cycle: Math.max(0, Math.floor(Number(entry.cycle) || 0))
      })).slice(-20) : [],
      themeHistory: Array.isArray(source.themeHistory) ? source.themeHistory.filter(entry => entry && typeof entry.id === 'string' && Number.isFinite(Number(entry.cycle))).map(entry => ({
        id: entry.id,
        cycle: Math.max(0, Math.floor(Number(entry.cycle) || 0)),
        segment: Math.max(1, Math.min(5, Math.floor(Number(entry.segment) || 1)))
      })).slice(-20) : [],
      boonHistory: Array.isArray(source.boonHistory) ? source.boonHistory.filter(id => typeof id === 'string').slice(-20) : [],
      paranoiaLevel: normalizeInt(source.paranoiaLevel),
      activeParanoiaBurdens: Array.isArray(source.activeParanoiaBurdens) ? source.activeParanoiaBurdens.filter(id => typeof id === 'string').slice(-8) : [],
      activeParanoiaBoons: Array.isArray(source.activeParanoiaBoons) ? source.activeParanoiaBoons.filter(id => typeof id === 'string').slice(-8) : [],
      paranoiaHistory: Array.isArray(source.paranoiaHistory) ? source.paranoiaHistory.filter(entry => entry && typeof entry.burdenId === 'string' && typeof entry.boonId === 'string').map(entry => ({
        burdenId: entry.burdenId,
        boonId: entry.boonId,
        cycle: Math.max(0, Math.floor(Number(entry.cycle) || 0))
      })).slice(-12) : [],
      lastParanoiaCycle: Math.max(-1, Math.floor(Number(source.lastParanoiaCycle) || -1)),
      boonRarePity: normalizeInt(source.boonRarePity),
      boonRareGuaranteedEvery: Math.max(2, Math.min(6, normalizeInt(source.boonRareGuaranteedEvery, 3) || 3)),
      barterHeat: Math.max(0, Math.min(9, normalizeInt(source.barterHeat, 0))),
      seasonId: normalizeString(source.seasonId, 32) || null,
      seasonWeekTag: normalizeString(source.seasonWeekTag, 24),
      seasonName: normalizeString(source.seasonName, 32),
      seasonIcon: normalizeString(source.seasonIcon, 4),
      lastSeasonDirectiveId: normalizeString(source.lastSeasonDirectiveId, 40) || null,
      seasonBestCycle: normalizeInt(source.seasonBestCycle),
      seasonCycleClears: normalizeInt(source.seasonCycleClears),
      seasonBossDefeated: normalizeInt(source.seasonBossDefeated),
      seasonScore: normalizeInt(source.seasonScore),
      seasonArchive: trimmedSeasonArchive,
      seasonDirectiveSelection: (() => {
        const selection = source.seasonDirectiveSelection && typeof source.seasonDirectiveSelection === 'object' ? source.seasonDirectiveSelection : {};
        return {
          seasonId: normalizeString(selection.seasonId, 32) || null,
          weekTag: normalizeString(selection.weekTag, 24),
          directiveId: normalizeString(selection.directiveId, 48) || null,
          source: selection.source === 'player' ? 'player' : 'auto'
        };
      })(),
      seasonDirectiveClearCounts: normalizeStatMap(source.seasonDirectiveClearCounts, 12),
      seasonCollapseStats: normalizeStatMap(source.seasonCollapseStats, 12),
      lastSeasonCollapse: (() => {
        const collapse = source.lastSeasonCollapse && typeof source.lastSeasonCollapse === 'object' ? source.lastSeasonCollapse : null;
        if (!collapse) return null;
        const collapseId = normalizeString(collapse.id, 48);
        const collapseLabel = normalizeString(collapse.label, 32);
        if (!collapseId || !collapseLabel) return null;
        return {
          id: collapseId,
          label: collapseLabel,
          desc: normalizeString(collapse.desc, 160),
          cycle: normalizeInt(collapse.cycle),
          pressure: Math.max(0, Math.min(9, normalizeInt(collapse.pressure))),
          directiveId: normalizeString(collapse.directiveId, 48) || null,
          recordedAt: Math.max(0, Math.floor(Number(collapse.recordedAt) || 0))
        };
      })(),
      boonStats
    };
    return normalized;
  }
  ensureEndlessState() {
    this.game.endlessState = this.normalizeEndlessState(this.game.endlessState);
    return this.game.endlessState;
  }
  isEndlessUnlocked() {
    const state = this.ensureEndlessState();
    if (state.unlocked) return true;
    const progressionRealm = Math.max(Number(this.game.player?.maxRealmReached) || 1, Math.max(...(Array.isArray(this.game.unlockedRealms) && this.game.unlockedRealms.length > 0 ? this.game.unlockedRealms : [1])));
    if (progressionRealm >= 6) {
      state.unlocked = true;
    }
    return !!state.unlocked;
  }
  isEndlessActive() {
    if (!this.game.featureFlags || !this.game.featureFlags.endlessModeV1) return false;
    const state = this.ensureEndlessState();
    return !!state.active && this.isEndlessUnlocked();
  }
  getEndlessRealmForCycle(cycle = 0) {
    const sequence = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
    const safeCycle = Math.max(0, Math.floor(Number(cycle) || 0));
    return sequence[safeCycle % sequence.length];
  }
  getEndlessMutatorPool() {
    return [{
      id: 'iron_wall',
      name: '铁幕甲壳',
      desc: '敌人生命提升，奖励略增。',
      mods: {
        enemyHpMul: 1.22,
        rewardGoldMul: 1.08,
        rewardExpMul: 1.06
      }
    }, {
      id: 'berserker_tide',
      name: '狂潮杀意',
      desc: '敌人攻击提升，收益同步提升。',
      mods: {
        enemyAtkMul: 1.2,
        rewardGoldMul: 1.12,
        rewardExpMul: 1.1
      }
    }, {
      id: 'void_tax',
      name: '虚空税契',
      desc: '治疗效率下降，但事件更易出现。',
      mods: {
        healMul: 0.82,
        rewardGoldMul: 1.14,
        mapWeightShift: {
          event: 0.04,
          rest: -0.02
        }
      }
    }, {
      id: 'war_market',
      name: '战时供给',
      desc: '商店更贵，但商店节点显著增加。',
      mods: {
        shopPriceMul: 1.2,
        mapWeightShift: {
          shop: 0.08,
          event: -0.03,
          enemy: -0.02
        }
      }
    }, {
      id: 'trial_inferno',
      name: '焚心试炼',
      desc: '试炼和精英更多，回报更高。',
      mods: {
        rewardGoldMul: 1.12,
        rewardExpMul: 1.16,
        mapWeightShift: {
          trial: 0.06,
          elite: 0.04,
          rest: -0.03,
          shop: -0.02
        }
      }
    }, {
      id: 'ashen_camp',
      name: '焦土行军',
      desc: '营地更稀少，但金币与经验提升。',
      mods: {
        rewardGoldMul: 1.15,
        rewardExpMul: 1.08,
        mapWeightShift: {
          rest: -0.05,
          enemy: 0.03,
          elite: 0.02
        }
      }
    }];
  }
  rollNextEndlessMutator() {
    const state = this.ensureEndlessState();
    const pool = this.getEndlessMutatorPool();
    if (!Array.isArray(pool) || pool.length === 0) return null;
    const activeSet = new Set(state.activeMutators || []);
    const candidates = pool.filter(m => m && m.id && !activeSet.has(m.id));
    const rollPool = candidates.length > 0 ? candidates : pool;
    const pick = rollPool[Math.floor(Math.random() * rollPool.length)];
    if (!pick || !pick.id) return null;
    state.activeMutators = Array.isArray(state.activeMutators) ? state.activeMutators : [];
    state.activeMutators.push(pick.id);
    if (state.activeMutators.length > 3) {
      state.activeMutators = state.activeMutators.slice(state.activeMutators.length - 3);
    }
    state.lastMutatorId = pick.id;
    return pick;
  }
  getEndlessParanoiaBurdenPool() {
    return [{
      id: 'cramped_hand',
      name: '紧箍识海',
      shortLabel: '手牌上限 -1',
      desc: '每个大轮回后，手牌上限永久 -1。',
      mods: {
        handLimitOffset: -1
      }
    }, {
      id: 'elite_echo',
      name: '精英回响',
      shortLabel: '精英额外词缀',
      desc: '无尽中的精英战会额外叠加 1 条临时轮回词缀。',
      mods: {
        eliteExtraMutator: true
      }
    }, {
      id: 'withered_mend',
      name: '枯脉疗蚀',
      shortLabel: '治疗衰减',
      desc: '所有恢复效果进一步衰减。',
      mods: {
        healMul: 0.82
      }
    }, {
      id: 'thin_harvest',
      name: '薄获税印',
      shortLabel: '普通战掉落减少',
      desc: '普通战的灵石与命环经验收益下降。',
      mods: {
        normalBattleRewardMul: 0.78,
        normalBattleExpMul: 0.84
      }
    }];
  }
  getEndlessParanoiaBoonPool() {
    return [{
      id: 'rare_surge',
      name: '稀曜偏振',
      shortLabel: '稀有奖励提升',
      desc: '战后卡牌奖励更容易出现稀有牌。',
      mods: {
        rewardRareChance: 0.24
      }
    }, {
      id: 'vault_slot',
      name: '宝匣扩容',
      shortLabel: '法宝槽位 +1',
      desc: '额外获得 1 个法宝装备槽位。',
      mods: {
        extraTreasureSlots: 1
      }
    }, {
      id: 'fate_spark',
      name: '命格跃迁',
      shortLabel: '命环额外升级',
      desc: '立即获得一次接近完整等级的命环跃迁。',
      immediate: 'ringLevelUp'
    }];
  }
  getEndlessParanoiaEffects() {
    const result = {
      handLimitOffset: 0,
      eliteExtraMutator: false,
      healMul: 1,
      normalBattleRewardMul: 1,
      normalBattleExpMul: 1,
      rewardRareChance: 0,
      extraTreasureSlots: 0,
      activeBurdenIds: [],
      activeBoonIds: [],
      latestBurden: null,
      latestBoon: null
    };
    if (!this.isEndlessActive() && !this.game.endlessState) return result;
    const state = this.ensureEndlessState();
    const burdenPool = typeof this.getEndlessParanoiaBurdenPool === 'function' ? this.getEndlessParanoiaBurdenPool() : [];
    const boonPool = typeof this.getEndlessParanoiaBoonPool === 'function' ? this.getEndlessParanoiaBoonPool() : [];
    const burdenMap = new Map(burdenPool.map(item => [item.id, item]));
    const boonMap = new Map(boonPool.map(item => [item.id, item]));
    const burdenIds = Array.isArray(state.activeParanoiaBurdens) ? state.activeParanoiaBurdens : [];
    const boonIds = Array.isArray(state.activeParanoiaBoons) ? state.activeParanoiaBoons : [];
    burdenIds.forEach(id => {
      const burden = burdenMap.get(id);
      if (!burden || !burden.mods) return;
      result.activeBurdenIds.push(id);
      if (Number.isFinite(Number(burden.mods.handLimitOffset))) {
        result.handLimitOffset += Number(burden.mods.handLimitOffset) || 0;
      }
      if (burden.mods.eliteExtraMutator) result.eliteExtraMutator = true;
      if (Number.isFinite(Number(burden.mods.healMul))) {
        result.healMul *= Math.max(0.35, Number(burden.mods.healMul) || 1);
      }
      if (Number.isFinite(Number(burden.mods.normalBattleRewardMul))) {
        result.normalBattleRewardMul *= Math.max(0.35, Number(burden.mods.normalBattleRewardMul) || 1);
      }
      if (Number.isFinite(Number(burden.mods.normalBattleExpMul))) {
        result.normalBattleExpMul *= Math.max(0.35, Number(burden.mods.normalBattleExpMul) || 1);
      }
      result.latestBurden = burden;
    });
    boonIds.forEach(id => {
      const boon = boonMap.get(id);
      if (!boon) return;
      result.activeBoonIds.push(id);
      if (boon.mods && Number.isFinite(Number(boon.mods.rewardRareChance))) {
        result.rewardRareChance += Math.max(0, Number(boon.mods.rewardRareChance) || 0);
      }
      if (boon.mods && Number.isFinite(Number(boon.mods.extraTreasureSlots))) {
        result.extraTreasureSlots += Math.max(0, Math.floor(Number(boon.mods.extraTreasureSlots) || 0));
      }
      result.latestBoon = boon;
    });
    return result;
  }
  getEndlessParanoiaTreasureSlotBonus() {
    const effects = this.getEndlessParanoiaEffects();
    return Math.max(0, Math.floor(Number(effects.extraTreasureSlots) || 0));
  }
  getEndlessParanoiaHandLimitPenalty() {
    const effects = this.getEndlessParanoiaEffects();
    return Math.min(0, Math.floor(Number(effects.handLimitOffset) || 0));
  }
  getEndlessParanoiaEliteMutatorId(cycleOverride = null) {
    const pool = this.getEndlessMutatorPool();
    if (!Array.isArray(pool) || pool.length === 0) return null;
    const state = this.ensureEndlessState();
    const cycle = Math.max(0, Math.floor(Number(cycleOverride === null || cycleOverride === undefined ? state.currentCycle : cycleOverride) || 0));
    const safePool = pool.filter(item => item && item.id !== 'war_market');
    const pickPool = safePool.length > 0 ? safePool : pool;
    const pick = pickPool[cycle % pickPool.length];
    return pick && pick.id ? pick.id : null;
  }
  getEndlessActiveMutatorIds() {
    const state = this.ensureEndlessState();
    const activeIds = Array.isArray(state.activeMutators) ? state.activeMutators.filter(id => typeof id === 'string' && id) : [];
    const effects = this.getEndlessParanoiaEffects();
    if (effects.eliteExtraMutator && this.game.currentBattleNode && this.game.currentBattleNode.type === 'elite') {
      const extraId = this.getEndlessParanoiaEliteMutatorId();
      if (extraId && !activeIds.includes(extraId)) {
        activeIds.push(extraId);
      }
    }
    return activeIds.slice(-4);
  }
  getEndlessParanoiaChoices() {
    const state = this.ensureEndlessState();
    const burdens = this.getEndlessParanoiaBurdenPool();
    const boons = this.getEndlessParanoiaBoonPool();
    if (!burdens.length || !boons.length) return [];
    const activeBurdenIds = new Set(Array.isArray(state.activeParanoiaBurdens) ? state.activeParanoiaBurdens : []);
    const activeBoonIds = new Set(Array.isArray(state.activeParanoiaBoons) ? state.activeParanoiaBoons : []);
    const burdenPool = burdens.filter(item => item && item.id && !activeBurdenIds.has(item.id));
    const boonPool = boons.filter(item => item && item.id && !activeBoonIds.has(item.id));
    const pickedBurdens = burdenPool.length >= 3 ? burdenPool : burdens;
    const pickedBoons = boonPool.length >= 3 ? boonPool : boons;
    const burdenOffset = Math.max(0, Math.floor(Number(state.paranoiaLevel) || 0)) % pickedBurdens.length;
    const boonOffset = Math.max(0, Math.floor((Number(state.paranoiaLevel) || 0) * 2)) % pickedBoons.length;
    const choices = [];
    for (let i = 0; i < 3; i += 1) {
      const burden = pickedBurdens[(burdenOffset + i) % pickedBurdens.length];
      const boon = pickedBoons[(boonOffset + i) % pickedBoons.length];
      if (!burden || !boon) continue;
      choices.push({
        id: `${burden.id}__${boon.id}`,
        burdenId: burden.id,
        boonId: boon.id,
        burden,
        boon,
        name: `${boon.name} · ${burden.name}`,
        desc: `负面法则：${burden.shortLabel || burden.name}｜补偿：${boon.shortLabel || boon.name}`
      });
    }
    return choices;
  }
  grantEndlessParanoiaBoonImmediate(boon) {
    if (!boon || typeof boon !== 'object' || !this.game.player) return null;
    if (boon.immediate === 'ringLevelUp' && this.game.player.fateRing && typeof this.game.player.fateRing.gainExp === 'function') {
      const ring = this.game.player.fateRing;
      let nextTarget = null;
      if (typeof FATE_RING !== 'undefined' && FATE_RING.levels) {
        Object.keys(FATE_RING.levels).forEach(key => {
          const level = Math.max(0, Math.floor(Number(key) || 0));
          const meta = FATE_RING.levels[key];
          const expNeed = Math.max(0, Math.floor(Number(meta && meta.exp) || 0));
          if (level > (ring.level || 0) && (nextTarget === null || expNeed < nextTarget)) {
            nextTarget = expNeed;
          }
        });
      }
      const missingExp = nextTarget === null ? 320 : Math.max(60, nextTarget - Math.max(0, Math.floor(Number(ring.exp) || 0)));
      ring.gainExp(missingExp);
      return {
        title: '命格跃迁',
        detail: `命环获得 ${missingExp} 点跃迁经验。`
      };
    }
    return null;
  }
  applyEndlessParanoiaChoice(choice, cycleOverride = null) {
    const choices = this.getEndlessParanoiaChoices();
    const state = this.ensureEndlessState();
    let picked = null;
    if (typeof choice === 'string') {
      picked = choices.find(item => item && item.id === choice) || null;
    } else if (choice && typeof choice === 'object') {
      if (choice.burden && choice.boon) {
        picked = choice;
      } else if (choice.burdenId && choice.boonId) {
        const burden = this.getEndlessParanoiaBurdenPool().find(item => item.id === choice.burdenId) || null;
        const boon = this.getEndlessParanoiaBoonPool().find(item => item.id === choice.boonId) || null;
        if (burden && boon) {
          picked = {
            id: `${burden.id}__${boon.id}`,
            burdenId: burden.id,
            boonId: boon.id,
            burden,
            boon,
            name: `${boon.name} · ${burden.name}`
          };
        }
      }
    }
    if (!picked) picked = choices[0] || null;
    if (!picked || !picked.burden || !picked.boon) return null;
    state.activeParanoiaBurdens = Array.isArray(state.activeParanoiaBurdens) ? state.activeParanoiaBurdens : [];
    state.activeParanoiaBoons = Array.isArray(state.activeParanoiaBoons) ? state.activeParanoiaBoons : [];
    if (!state.activeParanoiaBurdens.includes(picked.burden.id)) state.activeParanoiaBurdens.push(picked.burden.id);
    if (!state.activeParanoiaBoons.includes(picked.boon.id)) state.activeParanoiaBoons.push(picked.boon.id);
    state.paranoiaHistory = Array.isArray(state.paranoiaHistory) ? state.paranoiaHistory : [];
    const cycle = Math.max(0, Math.floor(Number(cycleOverride === null || cycleOverride === undefined ? state.currentCycle : cycleOverride) || 0));
    state.paranoiaHistory.push({
      burdenId: picked.burden.id,
      boonId: picked.boon.id,
      cycle
    });
    if (state.paranoiaHistory.length > 12) {
      state.paranoiaHistory = state.paranoiaHistory.slice(state.paranoiaHistory.length - 12);
    }
    state.paranoiaLevel = state.paranoiaHistory.length;
    state.lastParanoiaCycle = cycle;
    const immediate = this.grantEndlessParanoiaBoonImmediate(picked.boon);
    return {
      ...picked,
      cycle,
      immediate
    };
  }
  getEndlessPhaseProfile(cycleOverride = null) {
    const state = this.ensureEndlessState();
    const rawCycle = cycleOverride === null || cycleOverride === undefined ? state.currentCycle : cycleOverride;
    const cycle = Math.max(0, Math.floor(Number(rawCycle) || 0));
    const loopIndex = cycle % 13 + 1;
    const fallback = {
      id: 'stabilize',
      name: '稳态区间',
      active: false,
      cycle,
      loopIndex,
      checkpoint: 0,
      desc: '当前轮回处于稳态区间。',
      enemyHpMul: 1,
      enemyAtkMul: 1,
      rewardGoldMul: 1,
      rewardExpMul: 1,
      shopPriceMul: 1,
      enemyOpeningBlock: 0,
      enemyOpeningStrength: 0,
      extraAttackPatterns: 0,
      attackBoostMul: 1,
      injectDebuffPattern: false,
      boonRareBonusRate: 0,
      bossAffix: null
    };
    const phaseMap = {
      3: {
        id: 'phase_surge',
        name: '相位·突流',
        checkpoint: 3,
        desc: '敌方进攻节奏加快，适合作战试探与资源试压。',
        enemyHpMul: 1.06,
        enemyAtkMul: 1.1,
        rewardGoldMul: 1.06,
        rewardExpMul: 1.06,
        shopPriceMul: 0.98,
        enemyOpeningBlock: 2,
        enemyOpeningStrength: 0,
        extraAttackPatterns: 1,
        attackBoostMul: 1.04,
        injectDebuffPattern: false,
        boonRareBonusRate: 0.02,
        bossAffix: 'surge'
      },
      6: {
        id: 'phase_siege',
        name: '相位·围压',
        checkpoint: 6,
        desc: '敌方获得护势强化并穿插减益动作，压制持久战。',
        enemyHpMul: 1.12,
        enemyAtkMul: 1.14,
        rewardGoldMul: 1.08,
        rewardExpMul: 1.1,
        shopPriceMul: 0.96,
        enemyOpeningBlock: 4,
        enemyOpeningStrength: 1,
        extraAttackPatterns: 1,
        attackBoostMul: 1.08,
        injectDebuffPattern: true,
        boonRareBonusRate: 0.04,
        bossAffix: 'siege'
      },
      9: {
        id: 'phase_rift',
        name: '相位·裂潮',
        checkpoint: 9,
        desc: '敌方伤害结构更激进，收益同步提升，考验爆发与续航平衡。',
        enemyHpMul: 1.18,
        enemyAtkMul: 1.18,
        rewardGoldMul: 1.12,
        rewardExpMul: 1.14,
        shopPriceMul: 1.02,
        enemyOpeningBlock: 5,
        enemyOpeningStrength: 1,
        extraAttackPatterns: 2,
        attackBoostMul: 1.11,
        injectDebuffPattern: true,
        boonRareBonusRate: 0.06,
        bossAffix: 'rift'
      },
      12: {
        id: 'phase_apex',
        name: '相位·终压',
        checkpoint: 12,
        desc: '轮回高压峰值，Boss 获得专属终压词缀，奖励显著提高。',
        enemyHpMul: 1.25,
        enemyAtkMul: 1.22,
        rewardGoldMul: 1.16,
        rewardExpMul: 1.18,
        shopPriceMul: 1.08,
        enemyOpeningBlock: 6,
        enemyOpeningStrength: 2,
        extraAttackPatterns: 2,
        attackBoostMul: 1.14,
        injectDebuffPattern: true,
        boonRareBonusRate: 0.1,
        bossAffix: 'apex'
      }
    };
    const active = phaseMap[loopIndex];
    if (!active) return fallback;
    return {
      ...fallback,
      ...active,
      active: true,
      cycle,
      loopIndex,
      checkpoint: loopIndex
    };
  }
  getEndlessCycleThemeProfile(cycleOverride = null) {
    const state = this.ensureEndlessState();
    const rawCycle = cycleOverride === null || cycleOverride === undefined ? state.currentCycle : cycleOverride;
    const cycle = Math.max(0, Math.floor(Number(rawCycle) || 0));
    const segmentIndex = cycle % 5 + 1;
    const fallback = {
      id: 'theme_balanced_band',
      name: '轮段·稳衡',
      shortName: '稳衡',
      icon: '⚙️',
      desc: '轮段稳定，敌方与收益维持均衡节奏。',
      cycle,
      segmentIndex,
      enemyHpMul: 1,
      enemyAtkMul: 1,
      rewardGoldMul: 1,
      rewardExpMul: 1,
      shopPriceMul: 1,
      healMul: 1,
      mapWeightShift: {},
      pressureOpeningBlock: 0,
      pressureOpeningStrength: 0,
      pressureExtraAttackPatterns: 0,
      pressureAttackBoostMul: 1,
      pressureInjectDebuffPattern: false,
      eventGoldGainMul: 1,
      eventRingExpFlat: 0,
      eventTrialRewardMul: 1,
      eventTempShopOfferBonus: 0,
      eventTempShopPriceMul: 1,
      eventBoonRareBonusRate: 0,
      eventBonusAdventureBuffCharges: 0,
      eventForceRelief: false,
      eventForceRareBoonChoice: false,
      enemyDirective: 'balanced',
      enemyDirectiveHint: '均衡轮转'
    };
    const segmentMap = {
      1: {
        id: 'theme_flux_forge',
        name: '轮段·压能锻潮',
        shortName: '压能',
        icon: '⚒️',
        desc: '敌方以压能快攻试探防线，战局更偏主动换血。',
        enemyHpMul: 1.04,
        enemyAtkMul: 1.06,
        rewardGoldMul: 1.03,
        rewardExpMul: 1.02,
        shopPriceMul: 1,
        healMul: 0.98,
        mapWeightShift: {
          elite: 0.02,
          trial: 0.02,
          rest: -0.02
        },
        pressureOpeningBlock: 2,
        pressureOpeningStrength: 0,
        pressureExtraAttackPatterns: 1,
        pressureAttackBoostMul: 1.05,
        pressureInjectDebuffPattern: false,
        eventGoldGainMul: 1.02,
        eventRingExpFlat: 6,
        eventTrialRewardMul: 1.06,
        eventTempShopOfferBonus: 0,
        eventTempShopPriceMul: 1,
        eventBoonRareBonusRate: 0.03,
        eventBonusAdventureBuffCharges: 0,
        eventForceRelief: false,
        eventForceRareBoonChoice: false,
        enemyDirective: 'forge',
        enemyDirectiveHint: '前压锻潮'
      },
      2: {
        id: 'theme_swarm_call',
        name: '轮段·召潮群猎',
        shortName: '召潮',
        icon: '🐾',
        desc: '敌方更偏连段围猎，持续动作明显增加。',
        enemyHpMul: 1.08,
        enemyAtkMul: 1.03,
        rewardGoldMul: 1.04,
        rewardExpMul: 1.04,
        shopPriceMul: 0.97,
        healMul: 0.96,
        mapWeightShift: {
          enemy: 0.04,
          elite: 0.01,
          rest: -0.02
        },
        pressureOpeningBlock: 1,
        pressureOpeningStrength: 1,
        pressureExtraAttackPatterns: 1,
        pressureAttackBoostMul: 1.04,
        pressureInjectDebuffPattern: false,
        eventGoldGainMul: 1.03,
        eventRingExpFlat: 8,
        eventTrialRewardMul: 1.04,
        eventTempShopOfferBonus: 1,
        eventTempShopPriceMul: 0.95,
        eventBoonRareBonusRate: 0.03,
        eventBonusAdventureBuffCharges: 0,
        eventForceRelief: false,
        eventForceRareBoonChoice: false,
        enemyDirective: 'swarm',
        enemyDirectiveHint: '连段围猎'
      },
      3: {
        id: 'theme_counter_lattice',
        name: '轮段·反制晶格',
        shortName: '反制',
        icon: '🧿',
        desc: '敌方强化减益与反制段，迫使你更频繁切换节奏。',
        enemyHpMul: 1.02,
        enemyAtkMul: 1.07,
        rewardGoldMul: 1.05,
        rewardExpMul: 1.05,
        shopPriceMul: 1.02,
        healMul: 0.94,
        mapWeightShift: {
          event: 0.02,
          trial: 0.02,
          rest: -0.02
        },
        pressureOpeningBlock: 2,
        pressureOpeningStrength: 0,
        pressureExtraAttackPatterns: 0,
        pressureAttackBoostMul: 1.03,
        pressureInjectDebuffPattern: true,
        eventGoldGainMul: 1.06,
        eventRingExpFlat: 10,
        eventTrialRewardMul: 1.06,
        eventTempShopOfferBonus: 0,
        eventTempShopPriceMul: 1,
        eventBoonRareBonusRate: 0.07,
        eventBonusAdventureBuffCharges: 1,
        eventForceRelief: true,
        eventForceRareBoonChoice: false,
        enemyDirective: 'counter',
        enemyDirectiveHint: '反制压场'
      },
      4: {
        id: 'theme_rift_frenzy',
        name: '轮段·狂潮裂斩',
        shortName: '狂潮',
        icon: '🌪️',
        desc: '敌方进入高爆发轮换，战斗更强调抢回合。',
        enemyHpMul: 1.05,
        enemyAtkMul: 1.1,
        rewardGoldMul: 1.08,
        rewardExpMul: 1.07,
        shopPriceMul: 1.04,
        healMul: 0.9,
        mapWeightShift: {
          elite: 0.03,
          enemy: 0.03,
          rest: -0.03
        },
        pressureOpeningBlock: 0,
        pressureOpeningStrength: 1,
        pressureExtraAttackPatterns: 1,
        pressureAttackBoostMul: 1.08,
        pressureInjectDebuffPattern: true,
        eventGoldGainMul: 1.08,
        eventRingExpFlat: 12,
        eventTrialRewardMul: 1.08,
        eventTempShopOfferBonus: 0,
        eventTempShopPriceMul: 1,
        eventBoonRareBonusRate: 0.08,
        eventBonusAdventureBuffCharges: 0,
        eventForceRelief: false,
        eventForceRareBoonChoice: false,
        enemyDirective: 'frenzy',
        enemyDirectiveHint: '裂斩突压'
      },
      5: {
        id: 'theme_bastion_tide',
        name: '轮段·垒潮回稳',
        shortName: '垒潮',
        icon: '🏰',
        desc: '敌方防守与续航增强，但你可获得更多调整空间。',
        enemyHpMul: 1.1,
        enemyAtkMul: 1,
        rewardGoldMul: 1.02,
        rewardExpMul: 1.06,
        shopPriceMul: 0.92,
        healMul: 1.08,
        mapWeightShift: {
          rest: 0.04,
          shop: 0.03,
          elite: -0.02
        },
        pressureOpeningBlock: 3,
        pressureOpeningStrength: 0,
        pressureExtraAttackPatterns: 0,
        pressureAttackBoostMul: 1,
        pressureInjectDebuffPattern: false,
        eventGoldGainMul: 1.02,
        eventRingExpFlat: 14,
        eventTrialRewardMul: 1.03,
        eventTempShopOfferBonus: 1,
        eventTempShopPriceMul: 0.9,
        eventBoonRareBonusRate: 0.04,
        eventBonusAdventureBuffCharges: 1,
        eventForceRelief: true,
        eventForceRareBoonChoice: false,
        enemyDirective: 'bastion',
        enemyDirectiveHint: '垒潮拉扯'
      }
    };
    const picked = segmentMap[segmentIndex];
    if (!picked) return fallback;
    return {
      ...fallback,
      ...picked,
      cycle,
      segmentIndex
    };
  }
  getEndlessSeasonCatalog() {
    return [{
      id: 'forge_tide',
      name: '锻潮赛季',
      icon: '⚒️',
      desc: '锻潮赛季鼓励试炼推进与锻线运营，适合靠节奏压住前中盘。',
      mods: {
        enemyHpMul: 1.01,
        rewardGoldMul: 1.04,
        rewardExpMul: 1.03,
        shopPriceMul: 0.97
      },
      eventMods: {
        trialRewardMul: 1.06,
        ringExpFlat: 6,
        tempShopOfferBonus: 1
      },
      directives: [{
        id: 'frontline_contract',
        name: '前压契令',
        desc: '精英与试炼节点更活跃，适合抢拍滚资源。',
        mods: {
          enemyAtkMul: 1.02,
          mapWeightShift: {
            elite: 0.02,
            trial: 0.02,
            rest: -0.01
          }
        },
        eventMods: {
          goldGainMul: 1.03
        }
      }, {
        id: 'calibrated_market',
        name: '校准商契',
        desc: '临时商会成本更柔和，利于中盘补件。',
        mods: {
          rewardGoldMul: 1.02,
          shopPriceMul: 0.95
        },
        eventMods: {
          tempShopPriceMul: 0.9,
          tempShopOfferBonus: 1
        }
      }, {
        id: 'tempered_guard',
        name: '守势锻脉',
        desc: '换血容错提升，适合在高压轮段稳线。',
        mods: {
          enemyAtkMul: 0.99,
          healMul: 1.04
        },
        eventMods: {
          bonusAdventureBuffCharges: 1
        }
      }]
    }, {
      id: 'mirror_verdict',
      name: '镜裁赛季',
      icon: '🪞',
      desc: '镜裁赛季强调读题与防错，回合末决策收益更高但容错更低。',
      mods: {
        enemyHpMul: 1.02,
        enemyAtkMul: 1.03,
        rewardExpMul: 1.06
      },
      eventMods: {
        boonRareBonusRate: 0.04,
        ringExpFlat: 8
      },
      directives: [{
        id: 'cleanse_window',
        name: '净界窗',
        desc: '鼓励净化与调序，避免镜返压垮手牌。',
        mods: {
          mapWeightShift: {
            event: 0.02,
            memory_rift: 0.02,
            enemy: -0.01
          }
        },
        eventMods: {
          forceRelief: true,
          bonusAdventureBuffCharges: 1
        }
      }, {
        id: 'mirror_tax',
        name: '映照税',
        desc: '敌方节奏更紧，回报同步上调。',
        mods: {
          enemyAtkMul: 1.03,
          rewardGoldMul: 1.04
        },
        eventMods: {
          goldGainMul: 1.04,
          trialRewardMul: 1.04
        }
      }, {
        id: 'echo_archive',
        name: '留痕档案',
        desc: '命环经验与稀有奖励倾向进一步提高。',
        mods: {
          rewardExpMul: 1.03
        },
        eventMods: {
          ringExpFlat: 10,
          boonRareBonusRate: 0.05
        }
      }]
    }, {
      id: 'blood_oath',
      name: '血誓赛季',
      icon: '🌕',
      desc: '血誓赛季鼓励高风险换收益，适合爆发和斩杀路线。',
      mods: {
        enemyAtkMul: 1.05,
        rewardGoldMul: 1.08,
        healMul: 0.96
      },
      eventMods: {
        goldGainMul: 1.05,
        boonRareBonusRate: 0.05
      },
      directives: [{
        id: 'razor_threshold',
        name: '阈值锋线',
        desc: '高压轮段收益更高，商会补给更紧凑。',
        mods: {
          enemyAtkMul: 1.03,
          rewardGoldMul: 1.04,
          mapWeightShift: {
            elite: 0.02,
            rest: -0.02
          }
        },
        eventMods: {
          tempShopPriceMul: 0.93
        }
      }, {
        id: 'bounty_sprint',
        name: '悬赏冲刺',
        desc: '强化悬赏与推进节奏，鼓励更快收官。',
        mods: {
          rewardGoldMul: 1.05,
          rewardExpMul: 1.02
        },
        eventMods: {
          trialRewardMul: 1.05,
          goldGainMul: 1.03
        }
      }, {
        id: 'ashen_relief',
        name: '余烬补给',
        desc: '在高压中给予有限舒压窗口，避免断档。',
        mods: {
          healMul: 1.05,
          shopPriceMul: 0.96
        },
        eventMods: {
          forceRelief: true,
          tempShopOfferBonus: 1
        }
      }]
    }, {
      id: 'court_weave',
      name: '编庭赛季',
      icon: '☯️',
      desc: '编庭赛季强调多轴协同，法则、法宝与命格联动收益更稳定。',
      mods: {
        enemyHpMul: 1.04,
        rewardExpMul: 1.08,
        shopPriceMul: 1.01
      },
      eventMods: {
        ringExpFlat: 12,
        trialRewardMul: 1.05
      },
      directives: [{
        id: 'axis_alignment',
        name: '多轴校准',
        desc: '法则与套装补件效率提升，适合补齐终章答卷。',
        mods: {
          rewardExpMul: 1.04,
          mapWeightShift: {
            observatory: 0.02,
            spirit_grotto: 0.02,
            enemy: -0.01
          }
        },
        eventMods: {
          ringExpFlat: 8,
          boonRareBonusRate: 0.04
        }
      }, {
        id: 'verdict_shift',
        name: '终裁轮转',
        desc: '敌方更重检定节奏，但奖励同步拉高。',
        mods: {
          enemyHpMul: 1.03,
          enemyAtkMul: 1.02,
          rewardGoldMul: 1.03
        },
        eventMods: {
          goldGainMul: 1.03,
          trialRewardMul: 1.04
        }
      }, {
        id: 'codex_fund',
        name: '藏经补助',
        desc: '临时商会和命环收益加强，便于补齐关键缺件。',
        mods: {
          shopPriceMul: 0.97
        },
        eventMods: {
          tempShopOfferBonus: 1,
          tempShopPriceMul: 0.92,
          ringExpFlat: 6
        }
      }]
    }];
  }
  getEndlessSeasonCollapseCatalog() {
    return {
      pressure_overload: {
        id: 'pressure_overload',
        label: '压力失控',
        shortLabel: '压溃',
        desc: '轮回压力堆到临界点后，被连续压迫节奏击穿。'
      },
      sustain_break: {
        id: 'sustain_break',
        label: '续航崩线',
        shortLabel: '续航',
        desc: '治疗倍率和生命缓冲不足，持续作战能力被拖垮。'
      },
      mechanic_check: {
        id: 'mechanic_check',
        label: '机制检定失手',
        shortLabel: '机制',
        desc: '在精英、首领或试炼节点没答对当前轮段题目。'
      },
      supply_crack: {
        id: 'supply_crack',
        label: '补给断档',
        shortLabel: '补给',
        desc: '资源与商会节奏断层，导致中盘无法顺利补件。'
      },
      tempo_loss: {
        id: 'tempo_loss',
        label: '节奏失守',
        shortLabel: '节奏',
        desc: '攻防节拍被敌方夺走，构筑未能及时接上当前轮段。'
      }
    };
  }
  getEndlessSeasonDirectiveRiskScore(directive = null) {
    if (!directive || typeof directive !== 'object') return 0;
    const mods = directive.mods && typeof directive.mods === 'object' ? directive.mods : {};
    const eventMods = directive.eventMods && typeof directive.eventMods === 'object' ? directive.eventMods : {};
    const mapShift = mods.mapWeightShift && typeof mods.mapWeightShift === 'object' ? mods.mapWeightShift : {};
    let score = 0;
    score += Math.max(0, (Number(mods.enemyAtkMul) || 1) - 1) * 220;
    score += Math.max(0, (Number(mods.enemyHpMul) || 1) - 1) * 180;
    score += Math.max(0, (Number(mods.shopPriceMul) || 1) - 1) * 140;
    score += Math.max(0, 1 - (Number(mods.healMul) || 1)) * 200;
    score += Math.max(0, Number(mapShift.elite) || 0) * 180;
    score += Math.max(0, Number(mapShift.trial) || 0) * 160;
    score += Math.max(0, -Number(mapShift.rest) || 0) * 150;
    score -= Math.max(0, 1 - (Number(mods.shopPriceMul) || 1)) * 120;
    score -= Math.max(0, (Number(mods.healMul) || 1) - 1) * 160;
    score -= Math.max(0, Number(mapShift.event) || 0) * 90;
    score -= Math.max(0, Number(mapShift.observatory) || 0) * 80;
    score -= Math.max(0, Number(mapShift.memory_rift) || 0) * 70;
    score -= Math.max(0, Number(mapShift.spirit_grotto) || 0) * 70;
    score += Math.max(0, (Number(eventMods.goldGainMul) || 1) - 1) * 75;
    score += Math.max(0, (Number(eventMods.trialRewardMul) || 1) - 1) * 88;
    score += Math.max(0, Number(eventMods.boonRareBonusRate) || 0) * 120;
    score += eventMods.forceRareBoonChoice ? 10 : 0;
    score -= Math.max(0, 1 - (Number(eventMods.tempShopPriceMul) || 1)) * 110;
    score -= Math.max(0, Number(eventMods.tempShopOfferBonus) || 0) * 8;
    score -= Math.max(0, Number(eventMods.bonusAdventureBuffCharges) || 0) * 9;
    score -= eventMods.forceRelief ? 18 : 0;
    return Number(score.toFixed(2));
  }
  getEndlessSeasonProgressSnapshot(seasonProfile = null) {
    const state = typeof this.ensureEndlessState === 'function' ? this.ensureEndlessState() : null;
    if (!state || !seasonProfile || typeof seasonProfile !== 'object') {
      return {
        clears: 0,
        bosses: 0,
        score: 0,
        bestCycle: 0,
        directiveClearCounts: {},
        collapseStats: {},
        lastCollapse: null
      };
    }
    const seasonId = typeof seasonProfile.id === 'string' ? seasonProfile.id : null;
    const weekTag = typeof seasonProfile.weekTag === 'string' ? seasonProfile.weekTag : '';
    const archiveKey = seasonId && weekTag ? `${seasonId}:${weekTag}`.slice(0, 96) : '';
    const archiveEntry = archiveKey && state.seasonArchive && typeof state.seasonArchive === 'object' ? state.seasonArchive[archiveKey] : null;
    const isCurrentSeason = state.seasonId === seasonId && state.seasonWeekTag === weekTag;
    const source = isCurrentSeason ? state : archiveEntry && typeof archiveEntry === 'object' ? archiveEntry : {};
    const directiveClearCounts = isCurrentSeason ? state.seasonDirectiveClearCounts && typeof state.seasonDirectiveClearCounts === 'object' ? state.seasonDirectiveClearCounts : {} : source.directiveClearCounts && typeof source.directiveClearCounts === 'object' ? source.directiveClearCounts : {};
    const collapseStats = isCurrentSeason ? state.seasonCollapseStats && typeof state.seasonCollapseStats === 'object' ? state.seasonCollapseStats : {} : source.collapseStats && typeof source.collapseStats === 'object' ? source.collapseStats : {};
    const currentCollapse = isCurrentSeason && state.lastSeasonCollapse && typeof state.lastSeasonCollapse === 'object' ? state.lastSeasonCollapse : null;
    const archivedCollapse = !currentCollapse && source.lastCollapseReasonId ? {
      id: source.lastCollapseReasonId,
      label: source.lastCollapseLabel || source.lastCollapseReasonId,
      desc: '',
      cycle: 0,
      pressure: 0,
      directiveId: source.lastDirectiveId || null,
      recordedAt: Math.max(0, Math.floor(Number(source.updatedAt) || 0))
    } : null;
    return {
      clears: Math.max(0, Math.floor(Number(source.clears ?? source.seasonCycleClears) || 0)),
      bosses: Math.max(0, Math.floor(Number(source.bosses ?? source.seasonBossDefeated) || 0)),
      score: Math.max(0, Math.floor(Number(source.score ?? source.seasonScore) || 0)),
      bestCycle: Math.max(0, Math.floor(Number(source.bestCycle ?? source.seasonBestCycle) || 0)),
      directiveClearCounts: {
        ...directiveClearCounts
      },
      collapseStats: {
        ...collapseStats
      },
      lastCollapse: currentCollapse || archivedCollapse || null
    };
  }
  getEndlessSeasonGoals(seasonProfile = null) {
    if (!seasonProfile || typeof seasonProfile !== 'object') return [];
    const stats = seasonProfile.stats && typeof seasonProfile.stats === 'object' ? seasonProfile.stats : this.getEndlessSeasonProgressSnapshot(seasonProfile);
    const directiveChoices = Array.isArray(seasonProfile.directiveChoices) ? seasonProfile.directiveChoices : [];
    const highRiskDirectiveIds = directiveChoices.filter(item => item && item.riskTier === 'volatile').map(item => item.id);
    const riskyClears = highRiskDirectiveIds.reduce((sum, directiveId) => {
      return sum + Math.max(0, Math.floor(Number(stats.directiveClearCounts?.[directiveId]) || 0));
    }, 0);
    const goalTable = {
      forge_tide: {
        basic: {
          title: '稳步开锻',
          desc: '先用轮次和积分把本周锻潮节奏拉起来。',
          clears: 3,
          score: 420
        },
        advanced: {
          title: '连锻成势',
          desc: '把锻线推进到中高轮，验证中盘资源调度。',
          bestCycle: 8,
          bosses: 3
        },
        extreme: {
          title: '熔峰冲榜',
          desc: '至少两轮用激进季签破圈，证明高压也能稳住。',
          bestCycle: 12,
          score: 1800,
          riskyClears: 2
        }
      },
      mirror_verdict: {
        basic: {
          title: '镜面热身',
          desc: '用基础轮次和积分摸清镜裁赛季的读题方向。',
          clears: 3,
          score: 480
        },
        advanced: {
          title: '照裁校题',
          desc: '在中高轮保持首领通过率，说明检定节奏没偏。',
          bestCycle: 9,
          bosses: 3
        },
        extreme: {
          title: '镜极审判',
          desc: '带着高风险季签冲到深轮，证明不是靠稳态拖过。',
          bestCycle: 12,
          score: 1900,
          riskyClears: 2
        }
      },
      blood_oath: {
        basic: {
          title: '血誓试锋',
          desc: '把高风险赛季先跑通，确认能承受前中盘税负。',
          clears: 4,
          score: 520
        },
        advanced: {
          title: '誓线成环',
          desc: '在更高伤害环境里保持推进与收官效率。',
          bestCycle: 9,
          bosses: 4
        },
        extreme: {
          title: '赤月封喉',
          desc: '至少三轮用激进季签取胜，并把积分冲上高压档。',
          bestCycle: 13,
          score: 2100,
          riskyClears: 3
        }
      },
      court_weave: {
        basic: {
          title: '编庭定稿',
          desc: '先把多轴协同跑顺，形成完整账本底样。',
          clears: 3,
          score: 460
        },
        advanced: {
          title: '轴线合拍',
          desc: '推进更深轮次，同时保持首领节点处理稳定。',
          bestCycle: 10,
          bosses: 3
        },
        extreme: {
          title: '裁庭完卷',
          desc: '带着高风险季签完成深轮冲榜，证明构筑联动真正成型。',
          bestCycle: 12,
          score: 2000,
          riskyClears: 2
        }
      }
    };
    const config = goalTable[seasonProfile.id] || goalTable.forge_tide;
    const buildGoal = (tierId, tierLabel, configEntry) => {
      const requirements = [];
      if (Number.isFinite(Number(configEntry.clears))) {
        requirements.push({
          id: 'clears',
          label: '通关',
          current: Math.max(0, Math.floor(Number(stats.clears) || 0)),
          target: Math.max(1, Math.floor(Number(configEntry.clears) || 1)),
          suffix: '轮'
        });
      }
      if (Number.isFinite(Number(configEntry.score))) {
        requirements.push({
          id: 'score',
          label: '积分',
          current: Math.max(0, Math.floor(Number(stats.score) || 0)),
          target: Math.max(100, Math.floor(Number(configEntry.score) || 100)),
          suffix: ''
        });
      }
      if (Number.isFinite(Number(configEntry.bestCycle))) {
        requirements.push({
          id: 'bestCycle',
          label: '最深',
          current: Math.max(0, Math.floor(Number(stats.bestCycle) || 0)),
          target: Math.max(1, Math.floor(Number(configEntry.bestCycle) || 1)),
          suffix: '轮'
        });
      }
      if (Number.isFinite(Number(configEntry.bosses))) {
        requirements.push({
          id: 'bosses',
          label: '主宰',
          current: Math.max(0, Math.floor(Number(stats.bosses) || 0)),
          target: Math.max(1, Math.floor(Number(configEntry.bosses) || 1)),
          suffix: '次'
        });
      }
      if (Number.isFinite(Number(configEntry.riskyClears))) {
        requirements.push({
          id: 'riskyClears',
          label: '激进季签',
          current: Math.max(0, Math.floor(Number(riskyClears) || 0)),
          target: Math.max(1, Math.floor(Number(configEntry.riskyClears) || 1)),
          suffix: '轮'
        });
      }
      const completed = requirements.length > 0 && requirements.every(item => item.current >= item.target);
      const progressText = requirements.map(item => `${item.label} ${Math.min(item.current, item.target)}/${item.target}${item.suffix}`).join(' · ');
      return {
        id: `${seasonProfile.id}_${tierId}`,
        tier: tierId,
        tierLabel,
        title: configEntry.title,
        desc: configEntry.desc,
        completed,
        progressText,
        requirements
      };
    };
    return [buildGoal('basic', '基础', config.basic), buildGoal('advanced', '进阶', config.advanced), buildGoal('extreme', '极限', config.extreme)];
  }
  persistEndlessSeasonLedger() {
    if (!this.game.legacyProgress || typeof this.game.saveLegacyProgress !== 'function') return null;
    const state = typeof this.ensureEndlessState === 'function' ? this.ensureEndlessState() : this.game.endlessState;
    if (!state || typeof state !== 'object') return null;
    this.game.legacyProgress.endlessSeasonLedger = {
      seasonId: state.seasonId || null,
      seasonWeekTag: state.seasonWeekTag || '',
      seasonName: state.seasonName || '',
      seasonIcon: state.seasonIcon || '',
      lastSeasonDirectiveId: state.lastSeasonDirectiveId || null,
      seasonBestCycle: Math.max(0, Math.floor(Number(state.seasonBestCycle) || 0)),
      seasonCycleClears: Math.max(0, Math.floor(Number(state.seasonCycleClears) || 0)),
      seasonBossDefeated: Math.max(0, Math.floor(Number(state.seasonBossDefeated) || 0)),
      seasonScore: Math.max(0, Math.floor(Number(state.seasonScore) || 0)),
      seasonArchive: JSON.parse(JSON.stringify(state.seasonArchive || {})),
      seasonDirectiveSelection: JSON.parse(JSON.stringify(state.seasonDirectiveSelection || {
        seasonId: null,
        weekTag: '',
        directiveId: null,
        source: 'auto'
      })),
      seasonDirectiveClearCounts: {
        ...(state.seasonDirectiveClearCounts || {})
      },
      seasonCollapseStats: {
        ...(state.seasonCollapseStats || {})
      },
      lastSeasonCollapse: state.lastSeasonCollapse ? {
        ...state.lastSeasonCollapse
      } : null
    };
    this.game.saveLegacyProgress();
    return this.game.legacyProgress.endlessSeasonLedger;
  }
  getEndlessWeekMeta(dateOverride = null) {
    const toDate = value => {
      if (value instanceof Date) return new Date(value.getTime());
      const candidate = value === null || value === undefined ? new Date() : new Date(value);
      if (Number.isFinite(candidate.getTime())) return candidate;
      return new Date();
    };
    const raw = toDate(dateOverride);
    const utcDate = new Date(Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()));
    const isoRef = new Date(utcDate.getTime());
    const day = isoRef.getUTCDay() || 7;
    isoRef.setUTCDate(isoRef.getUTCDate() + 4 - day);
    const isoYear = isoRef.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const weekNo = Math.max(1, Math.ceil(((isoRef - yearStart) / 86400000 + 1) / 7));
    const weekTag = `${isoYear}-W${String(weekNo).padStart(2, '0')}`;
    const weekIndex = Math.max(0, Math.floor(utcDate.getTime() / 604800000));
    return {
      year: isoYear,
      weekNo,
      weekTag,
      weekIndex
    };
  }
  getEndlessSeasonProfile(cycleOverride = null, dateOverride = null) {
    const catalog = this.getEndlessSeasonCatalog();
    if (!Array.isArray(catalog) || catalog.length === 0) return null;
    const state = typeof this.ensureEndlessState === 'function' ? this.ensureEndlessState() : null;
    const stateCycle = state && typeof state === 'object' ? state.currentCycle : 0;
    const rawCycle = cycleOverride === null || cycleOverride === undefined ? stateCycle : cycleOverride;
    const cycle = Math.max(0, Math.floor(Number(rawCycle) || 0));
    const weekMeta = this.getEndlessWeekMeta(dateOverride);
    const season = catalog[weekMeta.weekIndex % catalog.length] || catalog[0];
    const directives = Array.isArray(season.directives) && season.directives.length > 0 ? season.directives : [{
      id: `${season.id}_default`,
      name: '稳态令',
      desc: season.desc || '当前赛季处于稳态指令。'
    }];
    const autoDirective = directives[(weekMeta.weekIndex + cycle) % directives.length] || directives[0];
    const selection = state && state.seasonDirectiveSelection && typeof state.seasonDirectiveSelection === 'object' ? state.seasonDirectiveSelection : null;
    const selectedDirective = selection && selection.source === 'player' && selection.seasonId === season.id && selection.weekTag === weekMeta.weekTag ? directives.find(item => item && item.id === selection.directiveId) || null : null;
    const directive = selectedDirective || autoDirective;
    const toMultiplier = value => {
      const num = Number(value);
      if (!Number.isFinite(num)) return 1;
      return Math.max(0.7, Math.min(1.4, num));
    };
    const sanitizeMapShift = rawShift => {
      if (!rawShift || typeof rawShift !== 'object') return {};
      const cleaned = {};
      Object.keys(rawShift).forEach(key => {
        const delta = Number(rawShift[key]);
        if (!Number.isFinite(delta)) return;
        cleaned[key] = Math.max(-0.15, Math.min(0.15, delta));
      });
      return cleaned;
    };
    const sanitizeMods = mods => {
      const source = mods && typeof mods === 'object' ? mods : {};
      return {
        enemyHpMul: toMultiplier(source.enemyHpMul),
        enemyAtkMul: toMultiplier(source.enemyAtkMul),
        rewardGoldMul: toMultiplier(source.rewardGoldMul),
        rewardExpMul: toMultiplier(source.rewardExpMul),
        shopPriceMul: toMultiplier(source.shopPriceMul),
        healMul: toMultiplier(source.healMul),
        mapWeightShift: sanitizeMapShift(source.mapWeightShift)
      };
    };
    const sanitizeEventMods = mods => {
      const source = mods && typeof mods === 'object' ? mods : {};
      return {
        goldGainMul: toMultiplier(source.goldGainMul),
        ringExpFlat: Math.max(0, Math.min(40, Math.floor(Number(source.ringExpFlat) || 0))),
        trialRewardMul: toMultiplier(source.trialRewardMul),
        tempShopOfferBonus: Math.max(0, Math.min(2, Math.floor(Number(source.tempShopOfferBonus) || 0))),
        tempShopPriceMul: toMultiplier(source.tempShopPriceMul),
        boonRareBonusRate: Math.max(0, Math.min(0.16, Number(source.boonRareBonusRate) || 0)),
        bonusAdventureBuffCharges: Math.max(0, Math.min(2, Math.floor(Number(source.bonusAdventureBuffCharges) || 0))),
        forceRelief: !!source.forceRelief,
        forceRareBoonChoice: !!source.forceRareBoonChoice
      };
    };
    const rankedDirectives = directives.map((item, index) => ({
      ...item,
      index,
      riskScore: this.getEndlessSeasonDirectiveRiskScore(item)
    })).sort((a, b) => {
      if (a.riskScore !== b.riskScore) return a.riskScore - b.riskScore;
      return a.index - b.index;
    });
    const riskMetaById = new Map();
    rankedDirectives.forEach((item, index) => {
      let riskTier = 'balanced';
      if (rankedDirectives.length > 1) {
        if (index === 0) riskTier = 'steady';else if (index === rankedDirectives.length - 1) riskTier = 'volatile';
      }
      const riskLabel = riskTier === 'steady' ? '稳进' : riskTier === 'volatile' ? '激进' : '平衡';
      const riskHint = riskTier === 'steady' ? '容错更高，适合保线与补件。' : riskTier === 'volatile' ? '收益更高，但会把检定压力一并抬升。' : '收益与风险保持折中，适合常规滚分。';
      riskMetaById.set(item.id, {
        rank: index + 1,
        tier: riskTier,
        label: riskLabel,
        score: item.riskScore,
        hint: riskHint
      });
    });
    const directiveChoices = directives.map(item => {
      const riskMeta = riskMetaById.get(item.id) || {
        rank: 1,
        tier: 'balanced',
        label: '平衡',
        score: 0,
        hint: '收益与风险保持折中，适合常规滚分。'
      };
      return {
        id: item.id,
        name: item.name || '稳态令',
        desc: item.desc || '',
        riskRank: riskMeta.rank,
        riskTier: riskMeta.tier,
        riskLabel: riskMeta.label,
        riskScore: riskMeta.score,
        riskHint: riskMeta.hint,
        selected: directive.id === item.id,
        autoRecommended: autoDirective.id === item.id,
        mods: sanitizeMods(item.mods),
        eventMods: sanitizeEventMods(item.eventMods)
      };
    });
    const seasonProfileBase = {
      id: season.id,
      weekTag: weekMeta.weekTag
    };
    const progressSnapshot = this.getEndlessSeasonProgressSnapshot({
      ...seasonProfileBase,
      weekTag: weekMeta.weekTag
    });
    const activeRiskMeta = riskMetaById.get(directive.id) || {
      tier: 'balanced',
      label: '平衡',
      score: 0,
      hint: '收益与风险保持折中，适合常规滚分。'
    };
    const collapseCatalog = this.getEndlessSeasonCollapseCatalog();
    const collapseSummary = Object.entries(progressSnapshot.collapseStats || {}).map(([id, count]) => {
      const meta = collapseCatalog[id] || {
        label: id,
        shortLabel: id
      };
      return {
        id,
        label: meta.label,
        shortLabel: meta.shortLabel || meta.label,
        count: Math.max(0, Math.floor(Number(count) || 0))
      };
    }).filter(item => item.count > 0).sort((a, b) => b.count - a.count).slice(0, 3);
    const goals = this.getEndlessSeasonGoals({
      id: season.id,
      name: season.name,
      weekTag: weekMeta.weekTag,
      directiveChoices,
      stats: progressSnapshot
    });
    const completedGoal = [...goals].reverse().find(item => item && item.completed) || null;
    return {
      id: season.id,
      name: season.name,
      icon: season.icon || '🜁',
      desc: season.desc || '',
      weekTag: weekMeta.weekTag,
      weekNo: weekMeta.weekNo,
      year: weekMeta.year,
      weekIndex: weekMeta.weekIndex,
      directiveId: directive.id,
      directiveName: directive.name || '稳态令',
      directiveDesc: directive.desc || '',
      directiveRiskTier: activeRiskMeta.tier,
      directiveRiskLabel: activeRiskMeta.label,
      directiveRiskScore: activeRiskMeta.score,
      directiveRiskHint: activeRiskMeta.hint,
      activeDirectiveSource: selectedDirective ? 'player' : 'auto',
      selectionModeLabel: selectedDirective ? '玩家钦定' : '轮转推荐',
      autoDirectiveId: autoDirective.id,
      autoDirectiveName: autoDirective.name || '稳态令',
      autoDirectiveRiskLabel: (riskMetaById.get(autoDirective.id) || activeRiskMeta).label,
      directiveChoices,
      mods: sanitizeMods(season.mods),
      directiveMods: sanitizeMods(directive.mods),
      eventMods: sanitizeEventMods(season.eventMods),
      directiveEventMods: sanitizeEventMods(directive.eventMods),
      stats: progressSnapshot,
      collapseStats: {
        ...(progressSnapshot.collapseStats || {})
      },
      collapseSummary,
      lastCollapse: progressSnapshot.lastCollapse,
      goals,
      seasonGoals: goals,
      goalTierReached: completedGoal ? completedGoal.tier : 'none',
      goalTierLabel: completedGoal ? completedGoal.tierLabel : '未达成',
      signature: `${season.id}:${weekMeta.weekTag}:${directive.id}`
    };
  }
  syncEndlessSeasonState(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const seedState = this.ensureEndlessState();
    const cycleOverride = Object.prototype.hasOwnProperty.call(opts, 'cycleOverride') ? opts.cycleOverride : seedState.currentCycle;
    const season = this.getEndlessSeasonProfile(cycleOverride, opts.dateOverride);
    if (!season) return null;
    const state = this.ensureEndlessState();
    state.seasonArchive = state.seasonArchive && typeof state.seasonArchive === 'object' ? state.seasonArchive : {};
    state.seasonDirectiveClearCounts = state.seasonDirectiveClearCounts && typeof state.seasonDirectiveClearCounts === 'object' ? state.seasonDirectiveClearCounts : {};
    state.seasonCollapseStats = state.seasonCollapseStats && typeof state.seasonCollapseStats === 'object' ? state.seasonCollapseStats : {};
    state.seasonDirectiveSelection = state.seasonDirectiveSelection && typeof state.seasonDirectiveSelection === 'object' ? state.seasonDirectiveSelection : {
      seasonId: null,
      weekTag: '',
      directiveId: null,
      source: 'auto'
    };
    const archiveSnapshot = (seasonId, weekTag, snapshot) => {
      if (typeof seasonId !== 'string' || !seasonId || typeof weekTag !== 'string' || !weekTag) return;
      const key = `${seasonId}:${weekTag}`.slice(0, 96);
      const base = state.seasonArchive[key] && typeof state.seasonArchive[key] === 'object' ? state.seasonArchive[key] : {};
      state.seasonArchive[key] = {
        seasonId,
        weekTag,
        seasonName: typeof snapshot.seasonName === 'string' ? snapshot.seasonName : '',
        icon: typeof snapshot.icon === 'string' ? snapshot.icon : '',
        bestCycle: Math.max(0, Math.floor(Number(snapshot.bestCycle) || 0)),
        clears: Math.max(0, Math.floor(Number(snapshot.clears) || 0)),
        bosses: Math.max(0, Math.floor(Number(snapshot.bosses) || 0)),
        score: Math.max(0, Math.floor(Number(snapshot.score) || 0)),
        lastDirectiveId: typeof snapshot.lastDirectiveId === 'string' && snapshot.lastDirectiveId ? snapshot.lastDirectiveId : base.lastDirectiveId || null,
        directiveClearCounts: snapshot.directiveClearCounts && typeof snapshot.directiveClearCounts === 'object' ? {
          ...snapshot.directiveClearCounts
        } : {
          ...(base.directiveClearCounts || {})
        },
        collapseStats: snapshot.collapseStats && typeof snapshot.collapseStats === 'object' ? {
          ...snapshot.collapseStats
        } : {
          ...(base.collapseStats || {})
        },
        lastCollapseReasonId: typeof snapshot.lastCollapseReasonId === 'string' && snapshot.lastCollapseReasonId ? snapshot.lastCollapseReasonId : base.lastCollapseReasonId || null,
        lastCollapseLabel: typeof snapshot.lastCollapseLabel === 'string' ? snapshot.lastCollapseLabel : base.lastCollapseLabel || '',
        updatedAt: Date.now()
      };
    };
    const prevSeasonId = typeof state.seasonId === 'string' ? state.seasonId : null;
    const prevWeekTag = typeof state.seasonWeekTag === 'string' ? state.seasonWeekTag : '';
    const seasonChanged = prevSeasonId !== season.id || prevWeekTag !== season.weekTag;
    if (seasonChanged && prevSeasonId && prevWeekTag) {
      archiveSnapshot(prevSeasonId, prevWeekTag, {
        seasonName: state.seasonName || '',
        icon: state.seasonIcon || '',
        bestCycle: state.seasonBestCycle,
        clears: state.seasonCycleClears,
        bosses: state.seasonBossDefeated,
        score: state.seasonScore,
        lastDirectiveId: state.lastSeasonDirectiveId,
        directiveClearCounts: state.seasonDirectiveClearCounts,
        collapseStats: state.seasonCollapseStats,
        lastCollapseReasonId: state.lastSeasonCollapse?.id || null,
        lastCollapseLabel: state.lastSeasonCollapse?.label || ''
      });
      state.seasonBestCycle = 0;
      state.seasonCycleClears = 0;
      state.seasonBossDefeated = 0;
      state.seasonScore = 0;
      state.seasonDirectiveClearCounts = {};
      state.seasonCollapseStats = {};
      state.lastSeasonCollapse = null;
    }
    state.seasonId = season.id;
    state.seasonWeekTag = season.weekTag;
    state.seasonName = season.name || '';
    state.seasonIcon = season.icon || '';
    state.lastSeasonDirectiveId = season.directiveId || null;
    if (state.seasonDirectiveSelection.seasonId !== season.id || state.seasonDirectiveSelection.weekTag !== season.weekTag) {
      state.seasonDirectiveSelection = {
        seasonId: season.id,
        weekTag: season.weekTag,
        directiveId: state.seasonDirectiveSelection.source === 'player' ? state.seasonDirectiveSelection.directiveId : null,
        source: state.seasonDirectiveSelection.source === 'player' ? 'player' : 'auto'
      };
      if (state.seasonDirectiveSelection.source === 'player') {
        const validDirective = Array.isArray(season.directiveChoices) ? season.directiveChoices.some(item => item.id === state.seasonDirectiveSelection.directiveId) : false;
        if (!validDirective) {
          state.seasonDirectiveSelection.directiveId = null;
          state.seasonDirectiveSelection.source = 'auto';
        }
      }
    }
    const cycleDelta = Math.max(0, Math.floor(Number(opts.cycleDelta) || 0));
    const bossDelta = Math.max(0, Math.floor(Number(opts.bossDelta) || 0));
    const scoreDelta = Math.max(0, Math.floor(Number(opts.scoreDelta) || 0));
    const directiveClearId = typeof opts.directiveClearId === 'string' && opts.directiveClearId ? opts.directiveClearId : season.directiveId || null;
    const collapseReasonId = typeof opts.collapseReasonId === 'string' && opts.collapseReasonId ? opts.collapseReasonId : null;
    const collapseLabel = typeof opts.collapseLabel === 'string' ? opts.collapseLabel : '';
    const collapseDesc = typeof opts.collapseDesc === 'string' ? opts.collapseDesc : '';
    const bestCycleCandidate = Math.max(Math.max(0, Math.floor(Number(opts.bestCycle) || 0)), Math.max(0, Math.floor(Number(state.currentCycle) || 0) + 1));
    state.seasonCycleClears = Math.max(0, Math.floor(Number(state.seasonCycleClears) || 0)) + cycleDelta;
    state.seasonBossDefeated = Math.max(0, Math.floor(Number(state.seasonBossDefeated) || 0)) + bossDelta;
    state.seasonScore = Math.max(0, Math.floor(Number(state.seasonScore) || 0)) + scoreDelta;
    state.seasonBestCycle = Math.max(Math.max(0, Math.floor(Number(state.seasonBestCycle) || 0)), bestCycleCandidate);
    if (cycleDelta > 0 && directiveClearId) {
      state.seasonDirectiveClearCounts[directiveClearId] = Math.max(0, Math.floor(Number(state.seasonDirectiveClearCounts[directiveClearId]) || 0)) + cycleDelta;
    }
    if (collapseReasonId) {
      state.seasonCollapseStats[collapseReasonId] = Math.max(0, Math.floor(Number(state.seasonCollapseStats[collapseReasonId]) || 0)) + 1;
      state.lastSeasonCollapse = {
        id: collapseReasonId,
        label: collapseLabel || collapseReasonId,
        desc: collapseDesc || '',
        cycle: Math.max(0, Math.floor(Number(state.currentCycle) || 0)),
        pressure: Math.max(0, Math.min(9, Math.floor(Number(state.pressure) || 0))),
        directiveId: directiveClearId || season.directiveId || null,
        recordedAt: Date.now()
      };
    }
    archiveSnapshot(season.id, season.weekTag, {
      seasonName: season.name || '',
      icon: season.icon || '',
      bestCycle: state.seasonBestCycle,
      clears: state.seasonCycleClears,
      bosses: state.seasonBossDefeated,
      score: state.seasonScore,
      lastDirectiveId: season.directiveId || null,
      directiveClearCounts: state.seasonDirectiveClearCounts,
      collapseStats: state.seasonCollapseStats,
      lastCollapseReasonId: state.lastSeasonCollapse?.id || null,
      lastCollapseLabel: state.lastSeasonCollapse?.label || ''
    });
    const archiveKeys = Object.keys(state.seasonArchive).sort((a, b) => (state.seasonArchive[b]?.updatedAt || 0) - (state.seasonArchive[a]?.updatedAt || 0)).slice(0, 16);
    const trimmed = {};
    archiveKeys.forEach(key => {
      trimmed[key] = state.seasonArchive[key];
    });
    state.seasonArchive = trimmed;
    if (typeof this.persistEndlessSeasonLedger === 'function') {
      this.persistEndlessSeasonLedger();
    }
    return season;
  }
  setEndlessSeasonDirective(directiveId = null) {
    const state = this.ensureEndlessState();
    const seasonProfile = this.getEndlessSeasonProfile(state.currentCycle);
    if (!seasonProfile) return null;
    const resetToAuto = directiveId === null || directiveId === undefined || directiveId === '' || directiveId === 'auto';
    let nextSelection = null;
    if (resetToAuto) {
      nextSelection = {
        seasonId: seasonProfile.id,
        weekTag: seasonProfile.weekTag,
        directiveId: null,
        source: 'auto'
      };
    } else {
      const matched = Array.isArray(seasonProfile.directiveChoices) ? seasonProfile.directiveChoices.find(item => item && item.id === directiveId) : null;
      if (!matched) return null;
      nextSelection = {
        seasonId: seasonProfile.id,
        weekTag: seasonProfile.weekTag,
        directiveId: matched.id,
        source: 'player'
      };
    }
    this.game.endlessState = {
      ...state,
      seasonDirectiveSelection: nextSelection
    };
    const nextProfile = this.syncEndlessSeasonState({
      cycleOverride: state.currentCycle
    }) || this.getEndlessSeasonProfile(state.currentCycle);
    if (this.isEndlessActive && this.isEndlessActive()) {
      this.game.autoSave?.();
    } else if (typeof this.persistEndlessSeasonLedger === 'function') {
      this.persistEndlessSeasonLedger();
    }
    if (typeof Utils !== 'undefined' && Utils.showBattleLog && nextProfile) {
      const hint = resetToAuto ? `已恢复轮转推荐：${nextProfile.directiveName}（${nextProfile.directiveRiskLabel}）` : `已锁定季签：${nextProfile.directiveName}（${nextProfile.directiveRiskLabel}）`;
      Utils.showBattleLog(`赛季令签调整：${hint}`);
    }
    return nextProfile;
  }
  getEndlessCollapseAnalysis() {
    const state = this.ensureEndlessState();
    const collapseCatalog = this.getEndlessSeasonCollapseCatalog();
    const mods = typeof this.getEndlessModifiers === 'function' ? this.getEndlessModifiers() : null;
    const seasonProfile = typeof this.getEndlessSeasonProfile === 'function' ? this.getEndlessSeasonProfile(state.currentCycle) : null;
    const pressure = Math.max(0, Math.min(9, Math.floor(Number(state?.pressure) || 0)));
    const hpRatio = this.game.player && Number(this.game.player.maxHp) > 0 ? Math.max(0, Number(this.game.player.currentHp) || 0) / Math.max(1, Number(this.game.player.maxHp) || 1) : 0;
    const nodeType = this.game.currentBattleNode && typeof this.game.currentBattleNode.type === 'string' ? this.game.currentBattleNode.type : 'enemy';
    const gold = Math.max(0, Math.floor(Number(this.game.player?.gold) || 0));
    const healMul = Math.max(0.45, Number(mods?.healMul) || 1);
    let reasonId = 'tempo_loss';
    let desc = '当前构筑没能在这个轮段及时接上攻防节奏。';
    if (pressure >= 8) {
      reasonId = 'pressure_overload';
      desc = `轮回压力已到 ${pressure}/9，敌方连续压迫节奏把战线直接顶穿。`;
    } else if (hpRatio <= 0.18 && healMul <= 0.86) {
      reasonId = 'sustain_break';
      desc = `当前治疗效率仅 x${healMul.toFixed(2)}，生命缓冲和回补窗口不足。`;
    } else if (['elite', 'boss', 'trial'].includes(nodeType)) {
      reasonId = 'mechanic_check';
      const nodeLabel = nodeType === 'elite' ? '精英' : nodeType === 'boss' ? '首领' : '试炼';
      desc = `${nodeLabel}节点的机制检定没有答对，当前季签 ${seasonProfile?.directiveName || '稳态令'} 也放大了错题代价。`;
    } else if (gold < (this.isEndlessActive && this.isEndlessActive() ? 54 : 36) && (Number(mods?.shopPriceMul) || 1) >= 1) {
      reasonId = 'supply_crack';
      desc = `灵石储备只有 ${gold}，补件窗口断档，无法继续修正当前构筑。`;
    }
    const meta = collapseCatalog[reasonId] || collapseCatalog.tempo_loss;
    return {
      id: meta.id,
      label: meta.label,
      desc: desc || meta.desc || ''
    };
  }
  recordEndlessSeasonCollapse() {
    const state = this.ensureEndlessState();
    const seasonProfile = this.getEndlessSeasonProfile(state.currentCycle);
    if (!seasonProfile) return null;
    const collapse = this.getEndlessCollapseAnalysis();
    this.syncEndlessSeasonState({
      cycleOverride: state.currentCycle,
      collapseReasonId: collapse.id,
      collapseLabel: collapse.label,
      collapseDesc: collapse.desc
    });
    if (typeof this.game.recordSeasonVerificationResult === 'function') {
      this.game.recordSeasonVerificationResult({
        recordId: `season_verification_${seasonProfile.weekTag || 'current'}_primary_endless`,
        weekTag: seasonProfile.weekTag || '',
        role: 'primary',
        sourceMode: 'endless',
        sourceModeLabel: '无尽轮回',
        sourceLabel: `${seasonProfile.name || '无尽轮回'}${seasonProfile.directiveName ? ` · ${seasonProfile.directiveName}` : ''}`,
        label: '无尽反证',
        resultStatus: 'failed',
        writebackMode: 'degrade',
        writebackLine: '无尽轮回给出反证，本周押卷会先转入险卷/反例处理。',
        resolvedRunId: seasonProfile.id || '',
        chapterIndex: Math.max(0, Math.floor(Number(state.currentCycle) || 0) + 1),
        proofQuality: 'thin',
        lineageStyle: '长压试炼',
        summaryLine: `${collapse.label}：${collapse.desc}`,
        detailLine: `${seasonProfile.directiveName || '当前季签'} 没能撑住长压题面，先回收错题再扩主轴。`,
        statusLine: '无尽轮回 · 反证已入账',
        anchorSection: 'endless',
        priority: 1
      });
    }
    return collapse;
  }
  getEndlessModifiers(cycleOverride = null) {
    if (!this.isEndlessActive()) {
      return {
        enemyHpMul: 1,
        enemyAtkMul: 1,
        rewardGoldMul: 1,
        rewardExpMul: 1,
        shopPriceMul: 1,
        healMul: 1,
        mapWeightShift: {},
        cycleTheme: null,
        endlessSeason: null
      };
    }
    const state = this.ensureEndlessState();
    const rawCycle = cycleOverride === null || cycleOverride === undefined ? state.currentCycle : cycleOverride;
    const cycle = Math.max(0, Math.floor(Number(rawCycle) || 0));
    const loopTier = Math.floor(cycle / 13);
    const pressure = Math.max(0, Math.min(9, Math.floor(Number(state.pressure) || 0)));
    const phaseProfile = this.getEndlessPhaseProfile(cycle);
    const cycleTheme = this.getEndlessCycleThemeProfile(cycle);
    const seasonProfile = typeof this.getEndlessSeasonProfile === 'function' ? this.getEndlessSeasonProfile(cycle) : null;
    const result = {
      enemyHpMul: 1 + cycle * 0.12 + loopTier * 0.08 + pressure * 0.025,
      enemyAtkMul: 1 + cycle * 0.08 + loopTier * 0.05 + pressure * 0.02,
      rewardGoldMul: 1 + cycle * 0.09 + pressure * 0.014,
      rewardExpMul: 1 + cycle * 0.07 + pressure * 0.012,
      shopPriceMul: 1 + cycle * 0.04,
      healMul: Math.max(0.58, 1 - cycle * 0.03 - pressure * 0.015),
      mapWeightShift: {
        elite: Math.min(0.14, cycle * 0.008),
        trial: Math.min(0.12, cycle * 0.007),
        rest: -Math.min(0.08, cycle * 0.006)
      },
      cycleTheme: {
        id: cycleTheme.id,
        name: cycleTheme.name,
        shortName: cycleTheme.shortName,
        segmentIndex: cycleTheme.segmentIndex
      },
      endlessSeason: seasonProfile ? {
        id: seasonProfile.id || null,
        name: seasonProfile.name || '',
        icon: seasonProfile.icon || '',
        weekTag: seasonProfile.weekTag || '',
        directiveId: seasonProfile.directiveId || null,
        directiveName: seasonProfile.directiveName || ''
      } : null
    };
    const applyModifierPack = mods => {
      if (!mods || typeof mods !== 'object') return;
      if (Number.isFinite(Number(mods.enemyHpMul))) result.enemyHpMul *= Math.max(0.7, Number(mods.enemyHpMul) || 1);
      if (Number.isFinite(Number(mods.enemyAtkMul))) result.enemyAtkMul *= Math.max(0.7, Number(mods.enemyAtkMul) || 1);
      if (Number.isFinite(Number(mods.rewardGoldMul))) result.rewardGoldMul *= Math.max(0.7, Number(mods.rewardGoldMul) || 1);
      if (Number.isFinite(Number(mods.rewardExpMul))) result.rewardExpMul *= Math.max(0.7, Number(mods.rewardExpMul) || 1);
      if (Number.isFinite(Number(mods.shopPriceMul))) result.shopPriceMul *= Math.max(0.7, Number(mods.shopPriceMul) || 1);
      if (Number.isFinite(Number(mods.healMul))) result.healMul *= Math.max(0.7, Number(mods.healMul) || 1);
      if (mods.mapWeightShift && typeof mods.mapWeightShift === 'object') {
        Object.keys(mods.mapWeightShift).forEach(key => {
          const delta = Number(mods.mapWeightShift[key]);
          if (!Number.isFinite(delta)) return;
          result.mapWeightShift[key] = (result.mapWeightShift[key] || 0) + delta;
        });
      }
    };
    const mutatorMap = new Map(this.getEndlessMutatorPool().map(item => [item.id, item]));
    const activeMutatorIds = typeof this.getEndlessActiveMutatorIds === 'function' ? this.getEndlessActiveMutatorIds() : Array.isArray(state.activeMutators) ? state.activeMutators : [];
    activeMutatorIds.forEach(mutatorId => {
      const mutator = mutatorMap.get(mutatorId);
      if (!mutator || !mutator.mods) return;
      const mods = mutator.mods;
      if (Number.isFinite(mods.enemyHpMul)) result.enemyHpMul *= mods.enemyHpMul;
      if (Number.isFinite(mods.enemyAtkMul)) result.enemyAtkMul *= mods.enemyAtkMul;
      if (Number.isFinite(mods.rewardGoldMul)) result.rewardGoldMul *= mods.rewardGoldMul;
      if (Number.isFinite(mods.rewardExpMul)) result.rewardExpMul *= mods.rewardExpMul;
      if (Number.isFinite(mods.shopPriceMul)) result.shopPriceMul *= mods.shopPriceMul;
      if (Number.isFinite(mods.healMul)) result.healMul *= mods.healMul;
      if (mods.mapWeightShift && typeof mods.mapWeightShift === 'object') {
        Object.keys(mods.mapWeightShift).forEach(key => {
          const delta = Number(mods.mapWeightShift[key]);
          if (!Number.isFinite(delta)) return;
          result.mapWeightShift[key] = (result.mapWeightShift[key] || 0) + delta;
        });
      }
    });
    const boonStats = state.boonStats || {};
    result.rewardGoldMul *= 1 + (Number(boonStats.rewardGoldMul) || 0);
    result.rewardExpMul *= 1 + (Number(boonStats.rewardExpMul) || 0);
    result.shopPriceMul *= Math.max(0.35, 1 - (Number(boonStats.shopDiscountMul) || 0));
    result.healMul *= 1 + (Number(boonStats.healMul) || 0);
    if (phaseProfile && phaseProfile.active) {
      result.enemyHpMul *= Math.max(1, Number(phaseProfile.enemyHpMul) || 1);
      result.enemyAtkMul *= Math.max(1, Number(phaseProfile.enemyAtkMul) || 1);
      result.rewardGoldMul *= Math.max(1, Number(phaseProfile.rewardGoldMul) || 1);
      result.rewardExpMul *= Math.max(1, Number(phaseProfile.rewardExpMul) || 1);
      result.shopPriceMul *= Math.max(0.75, Number(phaseProfile.shopPriceMul) || 1);
      result.mapWeightShift.elite = (result.mapWeightShift.elite || 0) + 0.02;
      result.mapWeightShift.trial = (result.mapWeightShift.trial || 0) + 0.02;
    }
    if (cycleTheme && typeof cycleTheme === 'object') {
      result.enemyHpMul *= Math.max(1, Number(cycleTheme.enemyHpMul) || 1);
      result.enemyAtkMul *= Math.max(1, Number(cycleTheme.enemyAtkMul) || 1);
      result.rewardGoldMul *= Math.max(1, Number(cycleTheme.rewardGoldMul) || 1);
      result.rewardExpMul *= Math.max(1, Number(cycleTheme.rewardExpMul) || 1);
      result.shopPriceMul *= Math.max(0.7, Number(cycleTheme.shopPriceMul) || 1);
      result.healMul *= Math.max(0.8, Number(cycleTheme.healMul) || 1);
      if (cycleTheme.mapWeightShift && typeof cycleTheme.mapWeightShift === 'object') {
        Object.keys(cycleTheme.mapWeightShift).forEach(key => {
          const delta = Number(cycleTheme.mapWeightShift[key]);
          if (!Number.isFinite(delta)) return;
          result.mapWeightShift[key] = (result.mapWeightShift[key] || 0) + delta;
        });
      }
    }
    if (seasonProfile && typeof seasonProfile === 'object') {
      applyModifierPack(seasonProfile.mods);
      applyModifierPack(seasonProfile.directiveMods);
    }
    const paranoia = typeof this.getEndlessParanoiaEffects === 'function' ? this.getEndlessParanoiaEffects() : {
      handLimitOffset: 0,
      eliteExtraMutator: false,
      healMul: 1,
      normalBattleRewardMul: 1,
      normalBattleExpMul: 1,
      rewardRareChance: 0,
      extraTreasureSlots: 0
    };
    if (Number.isFinite(Number(paranoia.healMul))) {
      result.healMul *= Math.max(0.35, Number(paranoia.healMul) || 1);
    }
    result.normalBattleRewardMul = Math.max(0.35, Number(paranoia.normalBattleRewardMul) || 1);
    result.normalBattleExpMul = Math.max(0.35, Number(paranoia.normalBattleExpMul) || 1);
    result.rewardRareChance = Math.max(0, Number(paranoia.rewardRareChance) || 0);
    result.handLimitOffset = Math.floor(Number(paranoia.handLimitOffset) || 0);
    result.extraTreasureSlots = Math.max(0, Math.floor(Number(paranoia.extraTreasureSlots) || 0));
    result.eliteExtraMutator = !!paranoia.eliteExtraMutator;
    result.paranoiaEffects = paranoia;
    result.enemyHpMul = Math.max(1, result.enemyHpMul);
    result.enemyAtkMul = Math.max(1, result.enemyAtkMul);
    result.rewardGoldMul = Math.max(1, result.rewardGoldMul);
    result.rewardExpMul = Math.max(1, result.rewardExpMul);
    result.shopPriceMul = Math.max(0.75, result.shopPriceMul);
    result.healMul = Math.max(0.45, Math.min(1.35, result.healMul));
    return result;
  }
  getEndlessHealingMultiplier() {
    if (!this.isEndlessActive()) return 1;
    const mods = this.getEndlessModifiers();
    return Math.max(0.45, Math.min(1.35, Number(mods.healMul) || 1));
  }
  getEndlessEventTuning() {
    const tuning = {
      goldGainMul: 1,
      ringExpFlat: 0,
      trialRewardMul: 1,
      tempShopOfferBonus: 0,
      tempShopPriceMul: 1,
      forceRelief: false,
      bonusAdventureBuffCharges: 0,
      boonRareBonusRate: 0,
      forceRareBoonChoice: false
    };
    if (!this.isEndlessActive()) return tuning;
    const state = this.ensureEndlessState();
    const activeMutators = new Set(Array.isArray(state?.activeMutators) ? state.activeMutators : []);
    const pressure = Math.max(0, Math.min(9, Math.floor(Number(state?.pressure) || 0)));
    const phaseProfile = this.getEndlessPhaseProfile(state.currentCycle);
    const cycleTheme = this.getEndlessCycleThemeProfile(state.currentCycle);
    const seasonProfile = typeof this.getEndlessSeasonProfile === 'function' ? this.getEndlessSeasonProfile(state.currentCycle) : null;
    const applyEventModifierPack = mods => {
      if (!mods || typeof mods !== 'object') return;
      if (Number.isFinite(Number(mods.goldGainMul))) tuning.goldGainMul *= Math.max(0.7, Number(mods.goldGainMul) || 1);
      if (Number.isFinite(Number(mods.ringExpFlat))) tuning.ringExpFlat += Math.max(0, Math.floor(Number(mods.ringExpFlat) || 0));
      if (Number.isFinite(Number(mods.trialRewardMul))) tuning.trialRewardMul *= Math.max(0.7, Number(mods.trialRewardMul) || 1);
      if (Number.isFinite(Number(mods.tempShopOfferBonus))) tuning.tempShopOfferBonus += Math.max(0, Math.floor(Number(mods.tempShopOfferBonus) || 0));
      if (Number.isFinite(Number(mods.tempShopPriceMul))) tuning.tempShopPriceMul *= Math.max(0.65, Number(mods.tempShopPriceMul) || 1);
      if (Number.isFinite(Number(mods.boonRareBonusRate))) tuning.boonRareBonusRate += Math.max(0, Number(mods.boonRareBonusRate) || 0);
      if (Number.isFinite(Number(mods.bonusAdventureBuffCharges))) {
        tuning.bonusAdventureBuffCharges += Math.max(0, Math.floor(Number(mods.bonusAdventureBuffCharges) || 0));
      }
      tuning.forceRelief = tuning.forceRelief || !!mods.forceRelief;
      tuning.forceRareBoonChoice = tuning.forceRareBoonChoice || !!mods.forceRareBoonChoice;
    };
    if (activeMutators.has('war_market')) {
      tuning.tempShopOfferBonus += 1;
      tuning.tempShopPriceMul *= 0.88;
    }
    if (activeMutators.has('trial_inferno')) {
      tuning.tempShopOfferBonus += 1;
      tuning.trialRewardMul *= 1.22;
      tuning.ringExpFlat += 18;
    }
    if (activeMutators.has('void_tax')) {
      tuning.forceRelief = true;
      tuning.goldGainMul *= 1.08;
    }
    if (activeMutators.has('berserker_tide')) {
      tuning.goldGainMul *= 1.12;
      tuning.boonRareBonusRate += 0.06;
    }
    if (activeMutators.has('ashen_camp')) {
      tuning.bonusAdventureBuffCharges += 1;
    }
    if (activeMutators.has('iron_wall')) {
      tuning.bonusAdventureBuffCharges += 1;
    }
    if (activeMutators.has('trial_inferno')) {
      tuning.boonRareBonusRate += 0.08;
    }
    if (pressure >= 3) {
      tuning.forceRelief = true;
      tuning.tempShopOfferBonus += 1;
    }
    if (pressure >= 6) {
      tuning.tempShopPriceMul *= 0.92;
      tuning.ringExpFlat += 12;
      tuning.boonRareBonusRate += 0.08;
    }
    if (pressure >= 8) {
      tuning.goldGainMul *= 1.05;
      tuning.bonusAdventureBuffCharges += 1;
      tuning.boonRareBonusRate += 0.1;
      tuning.forceRareBoonChoice = true;
    }
    if (phaseProfile && phaseProfile.active) {
      tuning.trialRewardMul *= 1.06;
      tuning.boonRareBonusRate += Math.max(0, Number(phaseProfile.boonRareBonusRate) || 0);
      if (phaseProfile.checkpoint >= 9) {
        tuning.tempShopOfferBonus += 1;
      }
      if (phaseProfile.checkpoint >= 12) {
        tuning.forceRareBoonChoice = true;
      }
    }
    if (cycleTheme && typeof cycleTheme === 'object') {
      tuning.goldGainMul *= Math.max(1, Number(cycleTheme.eventGoldGainMul) || 1);
      tuning.ringExpFlat += Math.max(0, Math.floor(Number(cycleTheme.eventRingExpFlat) || 0));
      tuning.trialRewardMul *= Math.max(1, Number(cycleTheme.eventTrialRewardMul) || 1);
      tuning.tempShopOfferBonus += Math.max(0, Math.floor(Number(cycleTheme.eventTempShopOfferBonus) || 0));
      tuning.tempShopPriceMul *= Math.max(0.65, Number(cycleTheme.eventTempShopPriceMul) || 1);
      tuning.boonRareBonusRate += Math.max(0, Number(cycleTheme.eventBoonRareBonusRate) || 0);
      tuning.bonusAdventureBuffCharges += Math.max(0, Math.floor(Number(cycleTheme.eventBonusAdventureBuffCharges) || 0));
      tuning.forceRelief = tuning.forceRelief || !!cycleTheme.eventForceRelief;
      tuning.forceRareBoonChoice = tuning.forceRareBoonChoice || !!cycleTheme.eventForceRareBoonChoice;
    }
    if (seasonProfile && typeof seasonProfile === 'object') {
      applyEventModifierPack(seasonProfile.eventMods);
      applyEventModifierPack(seasonProfile.directiveEventMods);
    }
    tuning.tempShopOfferBonus = Math.max(0, Math.min(2, Math.floor(Number(tuning.tempShopOfferBonus) || 0)));
    tuning.bonusAdventureBuffCharges = Math.max(0, Math.min(2, Math.floor(Number(tuning.bonusAdventureBuffCharges) || 0)));
    tuning.tempShopPriceMul = Math.max(0.65, Math.min(1.05, Number(tuning.tempShopPriceMul) || 1));
    tuning.goldGainMul = Math.max(1, Math.min(1.5, Number(tuning.goldGainMul) || 1));
    tuning.trialRewardMul = Math.max(1, Math.min(2.4, Number(tuning.trialRewardMul) || 1));
    tuning.ringExpFlat = Math.max(0, Math.min(120, Math.floor(Number(tuning.ringExpFlat) || 0)));
    tuning.boonRareBonusRate = Math.max(0, Math.min(0.5, Number(tuning.boonRareBonusRate) || 0));
    tuning.forceRareBoonChoice = !!tuning.forceRareBoonChoice;
    return tuning;
  }
  getEndlessPressureBehaviorProfile(cycleOverride = null) {
    const fallback = {
      pressure: 0,
      tierId: 'calm',
      tierName: '常压',
      enemyOpeningBlock: 0,
      enemyOpeningStrength: 0,
      extraAttackPatterns: 0,
      attackBoostMul: 1,
      injectDebuffPattern: false,
      summary: '敌方行动维持常态'
    };
    if (!this.isEndlessActive()) return fallback;
    const state = this.ensureEndlessState();
    const rawCycle = cycleOverride === null || cycleOverride === undefined ? state.currentCycle : cycleOverride;
    const cycle = Math.max(0, Math.floor(Number(rawCycle) || 0));
    const pressure = Math.max(0, Math.min(9, Math.floor(Number(state?.pressure) || 0)));
    const phaseProfile = this.getEndlessPhaseProfile(cycle);
    const cycleTheme = this.getEndlessCycleThemeProfile(cycle);
    const seasonProfile = typeof this.getEndlessSeasonProfile === 'function' ? this.getEndlessSeasonProfile(cycle) : null;
    const profile = {
      ...fallback,
      pressure
    };
    if (pressure >= 3) {
      profile.tierId = 'tense';
      profile.tierName = '紧绷';
      profile.enemyOpeningBlock = 6;
      profile.extraAttackPatterns = 1;
      profile.attackBoostMul = 1.08;
      profile.summary = '敌方会追加 1 段压迫攻击';
    }
    if (pressure >= 6) {
      profile.tierId = 'hazard';
      profile.tierName = '高压';
      profile.enemyOpeningBlock = 10;
      profile.enemyOpeningStrength = 1;
      profile.extraAttackPatterns = 1;
      profile.attackBoostMul = 1.12;
      profile.injectDebuffPattern = true;
      profile.summary = '敌方开场强化并附带压制咒印';
    }
    if (pressure >= 8) {
      profile.tierId = 'cataclysm';
      profile.tierName = '灾厄';
      profile.enemyOpeningBlock = 14;
      profile.enemyOpeningStrength = 2;
      profile.extraAttackPatterns = 2;
      profile.attackBoostMul = 1.16;
      profile.injectDebuffPattern = true;
      profile.summary = '敌方将连续压迫并施加重压减益';
    }
    if (phaseProfile && phaseProfile.active) {
      profile.enemyOpeningBlock += Math.max(0, Math.floor(Number(phaseProfile.enemyOpeningBlock) || 0));
      profile.enemyOpeningStrength += Math.max(0, Math.floor(Number(phaseProfile.enemyOpeningStrength) || 0));
      profile.extraAttackPatterns += Math.max(0, Math.floor(Number(phaseProfile.extraAttackPatterns) || 0));
      profile.attackBoostMul *= Math.max(1, Number(phaseProfile.attackBoostMul) || 1);
      profile.injectDebuffPattern = profile.injectDebuffPattern || !!phaseProfile.injectDebuffPattern;
      profile.summary += `｜阶段挑战：${phaseProfile.name}`;
    }
    if (cycleTheme && typeof cycleTheme === 'object') {
      profile.enemyOpeningBlock += Math.max(0, Math.floor(Number(cycleTheme.pressureOpeningBlock) || 0));
      profile.enemyOpeningStrength += Math.max(0, Math.floor(Number(cycleTheme.pressureOpeningStrength) || 0));
      profile.extraAttackPatterns += Math.max(0, Math.floor(Number(cycleTheme.pressureExtraAttackPatterns) || 0));
      profile.attackBoostMul *= Math.max(1, Number(cycleTheme.pressureAttackBoostMul) || 1);
      profile.injectDebuffPattern = profile.injectDebuffPattern || !!cycleTheme.pressureInjectDebuffPattern;
      profile.summary += `｜轮段策略：${cycleTheme.name}`;
    }
    if (seasonProfile && typeof seasonProfile === 'object' && seasonProfile.directiveName) {
      profile.summary += `｜赛季令签：${seasonProfile.directiveName}`;
    }
    profile.enemyOpeningBlock = Math.max(0, Math.floor(Number(profile.enemyOpeningBlock) || 0));
    profile.enemyOpeningStrength = Math.max(0, Math.floor(Number(profile.enemyOpeningStrength) || 0));
    profile.extraAttackPatterns = Math.max(0, Math.min(4, Math.floor(Number(profile.extraAttackPatterns) || 0)));
    profile.attackBoostMul = Math.max(1, Math.min(1.4, Number(profile.attackBoostMul) || 1));
    profile.injectDebuffPattern = !!profile.injectDebuffPattern;
    if (phaseProfile && phaseProfile.active) {
      profile.phaseId = phaseProfile.id;
      profile.phaseName = phaseProfile.name;
      profile.phaseCheckpoint = phaseProfile.checkpoint;
    } else {
      profile.phaseId = null;
      profile.phaseName = null;
      profile.phaseCheckpoint = 0;
    }
    if (cycleTheme && typeof cycleTheme === 'object') {
      profile.themeId = cycleTheme.id;
      profile.themeName = cycleTheme.name;
      profile.themeSegmentIndex = cycleTheme.segmentIndex;
      profile.themeDirective = cycleTheme.enemyDirective;
    } else {
      profile.themeId = null;
      profile.themeName = null;
      profile.themeSegmentIndex = 0;
      profile.themeDirective = 'balanced';
    }
    if (seasonProfile && typeof seasonProfile === 'object') {
      profile.seasonId = seasonProfile.id || null;
      profile.seasonName = seasonProfile.name || '';
      profile.seasonWeekTag = seasonProfile.weekTag || '';
      profile.seasonDirectiveId = seasonProfile.directiveId || null;
      profile.seasonDirectiveName = seasonProfile.directiveName || '';
    } else {
      profile.seasonId = null;
      profile.seasonName = '';
      profile.seasonWeekTag = '';
      profile.seasonDirectiveId = null;
      profile.seasonDirectiveName = '';
    }
    return profile;
  }
  getEndlessDangerProfile(cycleOverride = null) {
    const axisLibrary = typeof this.game.getSharedDangerAxisLibrary === 'function' ? this.game.getSharedDangerAxisLibrary() : {
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
        summary: '固定季签、偏执抉择与深轮检定提高了路线与节拍执行要求。',
        counterplay: '优先按当前季签与轮段题面完成主轴，再追求额外收益，不要过早偏离样本。',
        reserveGuidance: '建议先把本轮主轴打稳，再去贪高压战、额外分数和高波动交易。'
      }
    };
    const fallbackAxes = [{
      id: axisLibrary.burst.id,
      label: axisLibrary.burst.label,
      value: 0
    }, {
      id: axisLibrary.attrition.id,
      label: axisLibrary.attrition.label,
      value: 0
    }, {
      id: axisLibrary.control.id,
      label: axisLibrary.control.label,
      value: 0
    }, {
      id: axisLibrary.execution.id,
      label: axisLibrary.execution.label,
      value: 0
    }];
    const fallback = {
      index: 0,
      tierId: 'controlled',
      tierLabel: '可控',
      dominantAxisId: axisLibrary.burst.id,
      dominantAxisLabel: axisLibrary.burst.label,
      summary: axisLibrary.burst.summary,
      counterplay: axisLibrary.burst.counterplay,
      reserveGuidance: axisLibrary.burst.reserveGuidance,
      line: '轮回压强 DRI 0 / 100 · 可控 · 主轴 先手爆发',
      axes: fallbackAxes
    };
    if (!this.isEndlessActive()) return fallback;
    const clampInt = (value, min = 0, max = 100, fallbackValue = min) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return fallbackValue;
      return Math.max(min, Math.min(max, Math.round(num)));
    };
    const clampRate = (value, min = 0, max = 1, fallbackValue = min) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return fallbackValue;
      return Math.max(min, Math.min(max, num));
    };
    const state = this.ensureEndlessState();
    const rawCycle = cycleOverride === null || cycleOverride === undefined ? state.currentCycle : cycleOverride;
    const cycle = Math.max(0, Math.floor(Number(rawCycle) || 0));
    const pressure = Math.max(0, Math.min(9, Math.floor(Number(state.pressure) || 0)));
    const mods = typeof this.getEndlessModifiers === 'function' ? this.getEndlessModifiers(cycle) : {
      enemyHpMul: 1,
      healMul: 1
    };
    const pressureProfile = typeof this.getEndlessPressureBehaviorProfile === 'function' ? this.getEndlessPressureBehaviorProfile(cycle) : null;
    const cycleTheme = typeof this.getEndlessCycleThemeProfile === 'function' ? this.getEndlessCycleThemeProfile(cycle) : null;
    const seasonProfile = typeof this.getEndlessSeasonProfile === 'function' ? this.getEndlessSeasonProfile(cycle) : null;
    const paranoia = typeof this.getEndlessParanoiaEffects === 'function' ? this.getEndlessParanoiaEffects() : null;
    const collapseStats = seasonProfile && seasonProfile.collapseStats && typeof seasonProfile.collapseStats === 'object' ? seasonProfile.collapseStats : {};
    const directiveRiskScore = Math.max(0, Number(seasonProfile?.directiveRiskScore) || 0);
    const directiveRiskTier = seasonProfile?.directiveRiskTier || 'balanced';
    const paranoiaLevel = Math.max(0, Math.floor(Number(state.paranoiaLevel) || 0));
    const cycleThemeText = [cycleTheme?.name || '', cycleTheme?.desc || '', cycleTheme?.enemyDirective || ''].join(' ');
    const controlThemeSignal = /控场|压制|封|弱化|易伤|手牌|镜|审|净化|读题|tax|control/i.test(cycleThemeText);
    const attritionThemeSignal = /耐压|守势|拖|续航|熔|锻|补给|商会|长线/i.test(cycleThemeText);
    const burstThemeSignal = /爆发|前压|连斩|速攻|骤压|冲刺/i.test(cycleThemeText);
    const burstValue = clampInt(12 + pressure * 4.2 + (pressureProfile?.enemyOpeningBlock || 0) * 1.9 + (pressureProfile?.enemyOpeningStrength || 0) * 13 + (pressureProfile?.extraAttackPatterns || 0) * 10 + Math.max(0, ((Number(pressureProfile?.attackBoostMul) || 1) - 1) * 150) + (pressureProfile?.injectDebuffPattern || burstThemeSignal ? 6 : 0) + (directiveRiskTier === 'volatile' ? 4 : 0), 0, 100);
    const attritionValue = clampInt(14 + pressure * 4.6 + cycle * 1.9 + Math.max(0, ((Number(mods.enemyHpMul) || 1) - 1) * 24) + Math.max(0, (1 - clampRate(mods.healMul, 0.45, 1.35, 1)) * 54) + clampInt(collapseStats.sustain_break, 0, 12, 0) * 6 + clampInt(collapseStats.supply_crack, 0, 12, 0) * 5 + (attritionThemeSignal ? 7 : 0), 0, 100);
    const controlValue = clampInt(10 + pressure * 3.1 + (pressureProfile?.injectDebuffPattern || false ? 18 : 0) + (controlThemeSignal ? 8 : 0) + (seasonProfile?.id === 'mirror_verdict' ? 8 : 0) + clampInt(collapseStats.pressure_overload, 0, 12, 0) * 4 + clampInt(collapseStats.mechanic_check, 0, 12, 0) * 6 + (Number(paranoia?.handLimitOffset) < 0 ? Math.abs(Number(paranoia.handLimitOffset) || 0) * 5 : 0), 0, 100);
    const executionValue = clampInt(12 + pressure * 2.4 + cycle * 1.2 + directiveRiskScore * 0.12 + paranoiaLevel * 10 + clampInt(collapseStats.tempo_loss, 0, 12, 0) * 5 + clampInt(collapseStats.mechanic_check, 0, 12, 0) * 3 + (seasonProfile?.activeDirectiveSource === 'player' ? 4 : 0), 0, 100);
    const axes = [{
      ...axisLibrary.burst,
      value: burstValue
    }, {
      ...axisLibrary.attrition,
      value: attritionValue
    }, {
      ...axisLibrary.control,
      value: controlValue
    }, {
      ...axisLibrary.execution,
      value: executionValue
    }];
    const dominantAxis = axes.reduce((best, axis) => axis.value > best.value ? axis : best, axes[0]);
    const axisAverage = axes.reduce((sum, axis) => sum + axis.value, 0) / Math.max(1, axes.length);
    const index = clampInt(18 + axisAverage * 0.54 + dominantAxis.value * 0.14 + pressure * 1.6 + cycle * 0.35 + directiveRiskScore * 0.04 + paranoiaLevel * 1.8, 0, 100);
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
    const contextParts = [];
    if (cycleTheme?.shortName || cycleTheme?.name) {
      contextParts.push(`轮段 ${cycleTheme.shortName || cycleTheme.name}`);
    }
    if (seasonProfile?.directiveName) {
      contextParts.push(`季签 ${seasonProfile.directiveName}`);
    }
    if (paranoiaLevel > 0) {
      contextParts.push(`偏执 ${paranoiaLevel} 层`);
    }
    const summary = `${dominantAxis.label}偏高：${dominantAxis.summary}${contextParts.length > 0 ? ` 当前受${contextParts.join(' / ')}牵引。` : ''}`;
    let counterplay = dominantAxis.counterplay;
    if (dominantAxis.id === 'control' && pressureProfile?.injectDebuffPattern) {
      counterplay += ' 本轮敌方会附带压制咒印，净化与低费护盾的优先级更高。';
    } else if (dominantAxis.id === 'execution' && seasonProfile?.directiveName) {
      counterplay += ` 当前季签「${seasonProfile.directiveName}」更适合先把题面答稳，再吃额外收益。`;
    } else if (dominantAxis.id === 'attrition' && Number(mods.healMul || 1) < 0.95) {
      counterplay += ` 当前治疗效率仅 x${Number(mods.healMul || 1).toFixed(2)}，更要提前规划补给与恢复节点。`;
    } else if (dominantAxis.id === 'burst' && pressure >= 6) {
      counterplay += ' 深轮前两拍容错更低，首轮别把硬减伤和止损点打空。';
    }
    let reserveGuidance = dominantAxis.reserveGuidance;
    if (paranoiaLevel >= 2) {
      reserveGuidance += ' 偏执层数较高时，额外预留一条手牌修正或保底收益线。';
    } else if (directiveRiskTier === 'volatile') {
      reserveGuidance += ' 当前为激进季签，建议把补件与应急资源预算留得更厚。';
    }
    return {
      index,
      tierId,
      tierLabel,
      dominantAxisId: dominantAxis.id,
      dominantAxisLabel: dominantAxis.label,
      summary,
      counterplay,
      reserveGuidance,
      line: `轮回压强 DRI ${index} / 100 · ${tierLabel} · 主轴 ${dominantAxis.label}`,
      axes: axes.map(axis => ({
        id: axis.id,
        label: axis.label,
        value: clampInt(axis.value, 0, 100, 0)
      }))
    };
  }
  buildEndlessPressurePatternVariant(pattern, profile, variantIndex = 0) {
    if (!pattern || typeof pattern !== 'object' || !profile || typeof profile !== 'object') return null;
    const pressure = Math.max(0, Math.min(9, Math.floor(Number(profile.pressure) || 0)));
    const scale = Math.max(1, Number(profile.attackBoostMul) || 1);
    const extraCount = pressure >= 8 ? 1 : 0;
    const loopBoost = Math.max(0, Math.floor(Number(variantIndex) || 0));
    if (pattern.type === 'multiAttack' && Number.isFinite(Number(pattern.value))) {
      const baseCount = Math.max(1, Math.floor(Number(pattern.count) || 2));
      return {
        type: 'multiAttack',
        value: Math.max(1, Math.floor(Number(pattern.value) * scale)),
        count: Math.min(5, baseCount + extraCount + Math.min(1, loopBoost)),
        intent: pressure >= 8 ? '🩸连环压制' : '⚔️压迫连击'
      };
    }
    if ((pattern.type === 'attack' || pattern.type === 'executeDamage') && Number.isFinite(Number(pattern.value))) {
      const baseValue = Math.max(1, Math.floor(Number(pattern.value) * scale));
      if (pressure >= 8) {
        return {
          type: 'multiAttack',
          value: Math.max(1, Math.floor(baseValue * 0.7)),
          count: Math.min(4, 2 + Math.min(1, loopBoost)),
          intent: '🩸骤压连斩'
        };
      }
      return {
        type: 'attack',
        value: baseValue,
        intent: '⚔️压迫斩击'
      };
    }
    return null;
  }
  getEndlessMapConfig(realm) {
    const state = this.ensureEndlessState();
    const cycle = Math.max(0, Math.floor(Number(state.currentCycle) || 0));
    const rows = Math.max(8, Math.min(12, 8 + Math.floor(cycle / 2)));
    const mods = this.getEndlessModifiers();
    const eventBias = mods.mapWeightShift && Number(mods.mapWeightShift.event) || 0;
    const trialBias = mods.mapWeightShift && Number(mods.mapWeightShift.trial) || 0;
    const nodesSequence = [];
    for (let row = 0; row < rows - 1; row += 1) {
      let count = 2;
      if ((row + cycle) % 3 === 1) count += 1;
      if (row > rows * 0.55 && (row + cycle) % 4 === 0) count += 1;
      if (eventBias > 0.05 && row % 3 === 0) count += 1;
      if (trialBias > 0.05 && row >= rows - 3) count += 1;
      nodesSequence.push(Math.max(2, Math.min(4, count)));
    }
    return {
      realm,
      rows,
      nodesSequence
    };
  }
  getEndlessBoonPool() {
    return [{
      id: 'golden_ledger',
      name: '金账符印',
      rarity: 'common',
      desc: '所有战斗灵石奖励 +12%。',
      effect: {
        rewardGoldMul: 0.12
      }
    }, {
      id: 'insight_torch',
      name: '悟火灯芯',
      rarity: 'common',
      desc: '所有战斗命环经验 +10%。',
      effect: {
        rewardExpMul: 0.1
      }
    }, {
      id: 'merchant_seal',
      name: '商盟玉符',
      rarity: 'common',
      desc: '商店价格 -8%。',
      effect: {
        shopDiscountMul: 0.08
      }
    }, {
      id: 'renewal_prayer',
      name: '回春祷言',
      rarity: 'common',
      desc: '所有治疗效果 +12%。',
      effect: {
        healMul: 0.12
      }
    }, {
      id: 'warding_banner',
      name: '护阵军旗',
      rarity: 'common',
      desc: '每场战斗额外获得 1 层开场护盾增益。',
      effect: {
        battleOpeningBlock: 1
      }
    }, {
      id: 'swift_page',
      name: '迅思残页',
      rarity: 'common',
      desc: '每场战斗额外获得 1 层首回合抽牌增益。',
      effect: {
        battleFirstTurnDraw: 1
      }
    }, {
      id: 'pulse_core',
      name: '灵息核',
      rarity: 'common',
      desc: '每场战斗额外获得 1 层首回合灵力增益。',
      effect: {
        battleFirstTurnEnergy: 1
      }
    }, {
      id: 'vitality_root',
      name: '命元根',
      rarity: 'common',
      desc: '最大生命 +10，并立即恢复 20% 最大生命。',
      immediate: 'maxHpBoost'
    }, {
      id: 'fortune_cache',
      name: '应急粮仓',
      rarity: 'common',
      desc: '立即获得一笔灵石补给。',
      immediate: 'goldBurst'
    }, {
      id: 'arcane_draft',
      name: '秘卷补录',
      rarity: 'common',
      desc: '立即获得 1 张稀有卡牌。',
      immediate: 'cardDraft'
    }, {
      id: 'astral_tithe',
      name: '星税契',
      rarity: 'rare',
      desc: '所有战斗灵石奖励 +22%，命环经验 +12%。',
      effect: {
        rewardGoldMul: 0.22,
        rewardExpMul: 0.12
      }
    }, {
      id: 'eternal_aegis',
      name: '永恒壁垒',
      rarity: 'rare',
      desc: '治疗 +15%，每场战斗额外获得 2 层开场护盾。',
      effect: {
        healMul: 0.15,
        battleOpeningBlock: 2
      }
    }, {
      id: 'genesis_spark',
      name: '原初火花',
      rarity: 'rare',
      desc: '每场战斗额外获得 1 层首回合灵力与抽牌增益。',
      effect: {
        battleFirstTurnEnergy: 1,
        battleFirstTurnDraw: 1
      }
    }, {
      id: 'void_codex',
      name: '虚空圣典',
      rarity: 'rare',
      desc: '立即获得 1 张史诗卡牌，并提高命环经验收益。',
      immediate: 'epicCardDraft',
      effect: {
        rewardExpMul: 0.1
      }
    }];
  }
  getEndlessBoonChoices() {
    const pool = this.getEndlessBoonPool();
    if (!Array.isArray(pool) || pool.length <= 3) return pool.slice(0, 3);
    const state = this.ensureEndlessState();
    const tuning = this.isEndlessActive() ? this.getEndlessEventTuning() : null;
    const recent = new Set((state.boonHistory || []).slice(-4));
    const preferred = pool.filter(boon => boon && boon.id && !recent.has(boon.id));
    const source = preferred.length >= 3 ? preferred : pool.slice();
    const rarePool = source.filter(boon => boon.rarity === 'rare');
    const commonPool = source.filter(boon => boon.rarity !== 'rare');
    const picks = [];
    const limit = Math.max(2, Math.floor(Number(state.boonRareGuaranteedEvery) || 3));
    const shouldGuaranteeRare = rarePool.length > 0 && (Number(state.boonRarePity) || 0) >= limit - 1;
    const shouldForceRare = rarePool.length > 0 && !!tuning?.forceRareBoonChoice;
    const rareChance = Math.min(0.72, 0.28 + (Number(tuning?.boonRareBonusRate) || 0));
    const pickUniqueFrom = arr => {
      const available = arr.filter(boon => boon && boon.id && !picks.some(picked => picked.id === boon.id));
      if (available.length === 0) return null;
      return available[Math.floor(Math.random() * available.length)];
    };
    if (shouldGuaranteeRare || shouldForceRare) {
      const guaranteed = pickUniqueFrom(rarePool);
      if (guaranteed) picks.push(guaranteed);
    } else if (rarePool.length > 0 && Math.random() < rareChance) {
      const rare = pickUniqueFrom(rarePool);
      if (rare) picks.push(rare);
    }
    while (picks.length < 3) {
      const preferCommon = commonPool.length > 0 && Math.random() < 0.78;
      const picked = pickUniqueFrom(preferCommon ? commonPool : source) || pickUniqueFrom(source);
      if (!picked) break;
      picks.push(picked);
    }
    return picks.slice(0, 3);
  }
  applyEndlessBoon(boonId) {
    const pool = this.getEndlessBoonPool();
    const boon = pool.find(item => item && item.id === boonId);
    if (!boon) return null;
    const state = this.ensureEndlessState();
    if (!state.boonStats || typeof state.boonStats !== 'object') {
      state.boonStats = {
        ...this.createDefaultEndlessState().boonStats
      };
    }
    if (boon.effect && typeof boon.effect === 'object') {
      Object.keys(boon.effect).forEach(key => {
        const value = Number(boon.effect[key]) || 0;
        if (value === 0) return;
        const current = Number(state.boonStats[key]) || 0;
        state.boonStats[key] = Math.max(0, current + value);
      });
    }
    if (boon.immediate === 'maxHpBoost') {
      this.game.player.maxHp += 10;
      const healAmount = Math.max(8, Math.floor(this.game.player.maxHp * 0.2));
      this.game.player.heal(healAmount);
    } else if (boon.immediate === 'goldBurst') {
      const goldGain = 140 + Math.max(0, Math.floor(Number(state.currentCycle) || 0)) * 20;
      this.game.player.gold += goldGain;
      Utils.showBattleLog(`无尽祝福：获得 ${goldGain} 灵石补给`);
    } else if (boon.immediate === 'cardDraft') {
      const card = getRandomCard('rare', this.game.player.characterId);
      if (card) {
        this.game.player.addCardToDeck(card);
        Utils.showBattleLog(`无尽祝福：获得卡牌【${card.name}】`);
      }
    } else if (boon.immediate === 'epicCardDraft') {
      const card = getRandomCard('epic', this.game.player.characterId);
      if (card) {
        this.game.player.addCardToDeck(card);
        Utils.showBattleLog(`无尽祝福：获得史诗卡牌【${card.name}】`);
      }
    }
    state.boonHistory = Array.isArray(state.boonHistory) ? state.boonHistory : [];
    state.boonHistory.push(boon.id);
    if (state.boonHistory.length > 20) {
      state.boonHistory = state.boonHistory.slice(state.boonHistory.length - 20);
    }
    if (boon.rarity === 'rare') {
      state.boonRarePity = 0;
    } else {
      state.boonRarePity = Math.min(99, Math.max(0, Number(state.boonRarePity) || 0) + 1);
    }
    return boon;
  }
  applyEndlessPreBattleBonuses() {
    if (!this.isEndlessActive() || !this.game.player || typeof this.game.player.grantAdventureBuff !== 'function') return;
    const state = this.ensureEndlessState();
    const boonStats = state.boonStats || {};
    const drawStacks = Math.max(0, Math.floor(Number(boonStats.battleFirstTurnDraw) || 0));
    const blockStacks = Math.max(0, Math.floor(Number(boonStats.battleOpeningBlock) || 0));
    const energyStacks = Math.max(0, Math.floor(Number(boonStats.battleFirstTurnEnergy) || 0));
    if (drawStacks > 0) this.game.player.grantAdventureBuff('firstTurnDrawBoostBattles', drawStacks);
    if (blockStacks > 0) this.game.player.grantAdventureBuff('openingBlockBoostBattles', blockStacks);
    if (energyStacks > 0) this.game.player.grantAdventureBuff('firstTurnEnergyBoostBattles', energyStacks);
  }
  startEndlessMode() {
    if (!this.isEndlessUnlocked()) {
      Utils.showBattleLog('无尽轮回尚未解锁：至少突破至第六重天后开启。');
      return false;
    }
    const state = this.ensureEndlessState();
    state.unlocked = true;
    state.active = true;
    if (!Array.isArray(state.activeMutators) || state.activeMutators.length === 0) {
      this.rollNextEndlessMutator();
    }
    const themeProfile = this.getEndlessCycleThemeProfile(state.currentCycle);
    if (themeProfile && themeProfile.id) {
      state.lastThemeId = themeProfile.id;
    }
    const seasonProfile = this.syncEndlessSeasonState({
      bestCycle: state.currentCycle + 1
    });
    this.game.player.isReplay = false;
    this.game.player.isRecultivation = false;
    this.game.player.floor = 0;
    this.game.player.realm = this.getEndlessRealmForCycle(state.currentCycle);
    this.game.player.currentHp = this.game.player.maxHp;
    this.game.currentBattleNode = null;
    this.game.map.generate(this.game.player.realm);
    this.game.showScreen('map-screen');
    this.game.autoSave();
    Utils.showBattleLog(`无尽轮回开启：第 ${state.currentCycle + 1} 轮`);
    if (seasonProfile) {
      Utils.showBattleLog(`本周赛季：${seasonProfile.icon || '🜁'} ${seasonProfile.name}（${seasonProfile.weekTag}）` + `｜季签：${seasonProfile.directiveName}（${seasonProfile.directiveRiskLabel} / ${seasonProfile.selectionModeLabel}）`);
    }
    return true;
  }
  handleEndlessRealmComplete() {
    if (!this.isEndlessActive()) return;
    let state = this.ensureEndlessState();
    let seasonProfile = this.syncEndlessSeasonState();
    const boardBeforeVerification = typeof this.game.getSeasonBoardSnapshot === 'function' ? this.game.getSeasonBoardSnapshot() : null;
    state = this.ensureEndlessState();
    const prevPressure = Math.max(0, Math.min(9, Math.floor(Number(state.pressure) || 0)));
    const prevBarterHeat = Math.max(0, Math.min(9, Math.floor(Number(state.barterHeat) || 0)));
    state.totalBossDefeated += 1;
    state.clearedCycles += 1;
    state.pressure = Math.max(0, Math.min(9, prevPressure + 1));
    state.barterHeat = Math.max(0, prevBarterHeat - 1);
    const mods = this.getEndlessModifiers();
    const cycleGold = Math.max(60, Math.floor((140 + state.currentCycle * 25) * mods.rewardGoldMul));
    this.game.player.gold += cycleGold;
    const healAmount = Math.max(10, Math.floor(this.game.player.maxHp * 0.2 * mods.healMul));
    this.game.player.heal(healAmount);
    const cycleScore = Math.max(100, Math.floor((100 + state.currentCycle * 38) * (mods.enemyHpMul * 0.55 + mods.enemyAtkMul * 0.45)));
    state.totalEndlessScore = Math.max(0, Math.floor(Number(state.totalEndlessScore) || 0)) + cycleScore;
    const essenceGain = Math.max(1, Math.floor((state.currentCycle + 2) / 3));
    this.game.awardLegacyEssence(essenceGain, '无尽感悟', {
      silent: true
    });
    const nextCycle = state.currentCycle + 1;
    seasonProfile = this.syncEndlessSeasonState({
      cycleDelta: 1,
      bossDelta: 1,
      scoreDelta: cycleScore,
      bestCycle: nextCycle + 1,
      directiveClearId: seasonProfile?.directiveId || null
    }) || seasonProfile;
    state = this.ensureEndlessState();
    if (typeof this.game.recordSeasonVerificationResult === 'function') {
      const pendingDebt = ['open', 'deferred'].includes(String(boardBeforeVerification?.debtPack?.status || '').trim());
      this.game.recordSeasonVerificationResult({
        recordId: `season_verification_${seasonProfile?.weekTag || 'current'}_primary_endless`,
        weekTag: seasonProfile?.weekTag || '',
        role: 'primary',
        sourceMode: 'endless',
        sourceModeLabel: '无尽轮回',
        sourceLabel: `${seasonProfile?.name || '无尽轮回'}${seasonProfile?.directiveName ? ` · ${seasonProfile.directiveName}` : ''}`,
        label: '无尽高压验证',
        resultStatus: 'verified',
        writebackMode: pendingDebt ? 'clear_debt' : 'upgrade_verdict',
        writebackLine: pendingDebt ? '无尽轮回主验证通过，欠卷会被清账并释放天命强目标。' : '无尽轮回主验证通过，本周押卷会升级为正卷。',
        resolvedRunId: seasonProfile?.id || '',
        chapterIndex: Math.max(0, nextCycle + 1),
        proofQuality: nextCycle >= 4 ? 'decisive' : 'solid',
        lineageStyle: '长压试炼',
        summaryLine: pendingDebt ? '无尽通关已补齐主验证，这笔欠卷可以在季盘上清账。' : '无尽通关证明这条主轴在长压环境下依然成立。',
        detailLine: `${seasonProfile?.directiveName || '当前季签'} · 赛季积分 ${Math.max(0, Math.floor(Number(state.seasonScore) || 0))} · 已清 ${Math.max(0, Math.floor(Number(state.seasonCycleClears) || 0))} 轮`,
        statusLine: `无尽轮回 · 通过${seasonProfile?.directiveName ? ` · ${seasonProfile.directiveName}` : ''}`,
        anchorSection: 'endless',
        priority: 1
      });
    }
    const seasonProgressText = seasonProfile ? `，赛季进度 ${state.seasonCycleClears} 轮 / 主宰 ${state.seasonBossDefeated} / 赛季积分 ${state.seasonScore} / 目标 ${seasonProfile.goalTierLabel}` : '';
    Utils.showBattleLog(`无尽突破：灵石 +${cycleGold}，恢复 ${healAmount} 生命，轮回精粹 +${essenceGain}，无尽积分 +${cycleScore}，轮回压力 ${prevPressure}→${state.pressure}${seasonProgressText}`);
    const rolledMutator = this.rollNextEndlessMutator();
    if (rolledMutator) {
      Utils.showBattleLog(`轮回异变：${rolledMutator.name}（${rolledMutator.desc}）`);
    }
    const enteringNewLoop = nextCycle > 0 && nextCycle % 13 === 0;
    const nextPhase = this.getEndlessPhaseProfile(nextCycle);
    const nextTheme = this.getEndlessCycleThemeProfile(nextCycle);
    if (nextPhase && nextPhase.active) {
      state.lastPhaseId = nextPhase.id;
      state.phaseHistory = Array.isArray(state.phaseHistory) ? state.phaseHistory : [];
      state.phaseHistory.push({
        id: nextPhase.id,
        cycle: nextCycle
      });
      if (state.phaseHistory.length > 20) {
        state.phaseHistory = state.phaseHistory.slice(state.phaseHistory.length - 20);
      }
      Utils.showBattleLog(`阶段挑战启动：${nextPhase.name}（第 ${nextCycle + 1} 轮）`);
    }
    if (nextTheme && nextTheme.id) {
      state.lastThemeId = nextTheme.id;
      state.themeHistory = Array.isArray(state.themeHistory) ? state.themeHistory : [];
      state.themeHistory.push({
        id: nextTheme.id,
        cycle: nextCycle,
        segment: nextTheme.segmentIndex
      });
      if (state.themeHistory.length > 20) {
        state.themeHistory = state.themeHistory.slice(state.themeHistory.length - 20);
      }
      Utils.showBattleLog(`轮段战场切换：${nextTheme.name}（第 ${nextCycle + 1} 轮）`);
    }
    const finalizeAdvance = () => {
      const latestState = this.ensureEndlessState();
      latestState.currentCycle = nextCycle;
      this.game.player.realm = this.getEndlessRealmForCycle(latestState.currentCycle);
      this.game.player.floor = 0;
      this.game.currentBattleNode = null;
      this.game.player.checkSkillUnlock();
      this.game.map.generate(this.game.player.realm);
      this.game.renderTreasures('map-treasures');
      this.game.showScreen('map-screen');
      this.game.autoSave();
    };
    const afterBoonSelection = () => {
      const latestState = this.ensureEndlessState();
      if (enteringNewLoop && Number(latestState.lastParanoiaCycle) !== nextCycle) {
        this.game.showEndlessParanoiaSelection(nextCycle, finalizeAdvance);
        return;
      }
      finalizeAdvance();
    };
    this.game.showEndlessBoonSelection(afterBoonSelection);
  }
  prepareEnemyForEndlessBattle(enemy, modifiers) {
    if (!enemy || typeof enemy !== 'object') return enemy;
    let cloned = null;
    try {
      cloned = JSON.parse(JSON.stringify(enemy));
    } catch (e) {
      cloned = {
        ...enemy
      };
      if (Array.isArray(enemy.patterns)) {
        cloned.patterns = enemy.patterns.map(pattern => ({
          ...pattern
        }));
      }
      if (enemy.gold && typeof enemy.gold === 'object') {
        cloned.gold = {
          ...enemy.gold
        };
      }
    }
    if (!cloned.buffs || typeof cloned.buffs !== 'object') {
      cloned.buffs = {};
    }
    const hpMul = Math.max(1, Number(modifiers.enemyHpMul) || 1);
    const atkMul = Math.max(1, Number(modifiers.enemyAtkMul) || 1);
    const goldMul = Math.max(1, Number(modifiers.rewardGoldMul) || 1);
    const pressureProfile = typeof this.getEndlessPressureBehaviorProfile === 'function' ? this.getEndlessPressureBehaviorProfile() : null;
    const phaseProfile = typeof this.getEndlessPhaseProfile === 'function' ? this.getEndlessPhaseProfile() : null;
    const cycleTheme = typeof this.getEndlessCycleThemeProfile === 'function' ? this.getEndlessCycleThemeProfile() : null;
    const baseHp = Number(cloned.maxHp || cloned.hp || cloned.currentHp || 1);
    const nextHp = Math.max(1, Math.floor(baseHp * hpMul));
    cloned.maxHp = nextHp;
    cloned.hp = nextHp;
    cloned.currentHp = nextHp;
    if (Array.isArray(cloned.patterns)) {
      cloned.patterns = cloned.patterns.map(pattern => {
        if (!pattern || typeof pattern !== 'object') return pattern;
        const next = {
          ...pattern
        };
        if ((next.type === 'attack' || next.type === 'multiAttack' || next.type === 'executeDamage') && Number.isFinite(next.value)) {
          next.value = Math.max(1, Math.floor(next.value * atkMul));
        }
        return next;
      });
    }
    if (pressureProfile && pressureProfile.enemyOpeningBlock > 0) {
      const currentBlock = Math.max(0, Math.floor(Number(cloned.block) || 0));
      cloned.block = Math.max(currentBlock, pressureProfile.enemyOpeningBlock);
    }
    if (pressureProfile && pressureProfile.enemyOpeningStrength > 0) {
      const currentStrength = Math.max(0, Math.floor(Number(cloned.buffs.strength) || 0));
      cloned.buffs.strength = currentStrength + pressureProfile.enemyOpeningStrength;
    }
    if (pressureProfile && Array.isArray(cloned.patterns) && cloned.patterns.length > 0) {
      const attackPatterns = cloned.patterns.filter(pattern => pattern && typeof pattern === 'object' && (pattern.type === 'attack' || pattern.type === 'multiAttack' || pattern.type === 'executeDamage') && Number.isFinite(Number(pattern.value)));
      if (attackPatterns.length > 0 && pressureProfile.extraAttackPatterns > 0) {
        const sortedAttackPatterns = attackPatterns.slice().sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
        for (let i = 0; i < pressureProfile.extraAttackPatterns; i += 1) {
          const seed = sortedAttackPatterns[i % sortedAttackPatterns.length];
          const variant = this.buildEndlessPressurePatternVariant(seed, pressureProfile, i);
          if (variant) cloned.patterns.push(variant);
        }
      }
      if (pressureProfile.injectDebuffPattern) {
        cloned.patterns.push({
          type: 'debuff',
          buffType: pressureProfile.pressure >= 8 ? 'vulnerable' : 'weak',
          value: 1,
          intent: pressureProfile.pressure >= 8 ? '🩸重压咒印' : '🌀压制咒印'
        });
      }
    }
    if (cycleTheme && Array.isArray(cloned.patterns) && cloned.patterns.length > 0) {
      const attackPatterns = cloned.patterns.filter(pattern => pattern && typeof pattern === 'object' && (pattern.type === 'attack' || pattern.type === 'multiAttack' || pattern.type === 'executeDamage') && Number.isFinite(Number(pattern.value)));
      const defendPatterns = cloned.patterns.filter(pattern => pattern && typeof pattern === 'object' && (pattern.type === 'defend' || pattern.type === 'heal'));
      const hasDebuffPattern = cloned.patterns.some(pattern => pattern && typeof pattern === 'object' && (pattern.type === 'debuff' || pattern.type === 'addStatus'));
      const baseStrike = Math.max(7, Math.floor(9 * atkMul));
      const directive = String(cycleTheme.enemyDirective || 'balanced');
      if (directive === 'forge') {
        if (attackPatterns.length > 0) {
          const leadAttack = attackPatterns[0];
          leadAttack.value = Math.max(1, Math.floor(Number(leadAttack.value) * 1.08));
        }
        if (defendPatterns.length === 0) {
          cloned.patterns.push({
            type: 'defend',
            value: Math.max(6, Math.floor(baseStrike * 0.72)),
            intent: '⚒️锻潮护势'
          });
        }
      } else if (directive === 'swarm') {
        const multi = cloned.patterns.find(pattern => pattern && pattern.type === 'multiAttack');
        if (multi) {
          multi.count = Math.max(2, Math.min(5, Math.floor(Number(multi.count) || 2) + 1));
        } else if (attackPatterns.length > 0) {
          const source = attackPatterns[0];
          cloned.patterns.push({
            type: 'multiAttack',
            value: Math.max(4, Math.floor(Number(source.value) * 0.66)),
            count: 2,
            intent: '🐾群猎连袭'
          });
        }
      } else if (directive === 'counter') {
        if (!hasDebuffPattern) {
          cloned.patterns.push({
            type: 'debuff',
            buffType: 'weak',
            value: 1,
            intent: '🧿反制晶印'
          });
        } else {
          cloned.block = Math.max(0, Math.floor(Number(cloned.block) || 0)) + 3;
        }
        cloned.__endlessAntiBurst = Math.max(Math.floor(Number(cloned.__endlessAntiBurst) || 0), 1);
      } else if (directive === 'frenzy') {
        if (attackPatterns.length > 0) {
          const burst = attackPatterns.slice().sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))[0];
          if (burst) {
            cloned.patterns.push({
              type: 'executeDamage',
              value: Math.max(8, Math.floor(Number(burst.value) * 0.92)),
              threshold: 0.5,
              intent: '🌪️裂斩追命'
            });
          }
        }
      } else if (directive === 'bastion') {
        cloned.block = Math.max(0, Math.floor(Number(cloned.block) || 0)) + 5;
        if (defendPatterns.length <= 0) {
          cloned.patterns.push({
            type: 'defend',
            value: Math.max(8, Math.floor(baseStrike * 0.95)),
            intent: '🏰垒潮回护'
          });
        } else if (!cloned.patterns.some(pattern => pattern && pattern.type === 'heal')) {
          cloned.patterns.push({
            type: 'heal',
            value: Math.max(8, Math.floor(cloned.maxHp * 0.06)),
            intent: '🏰潮汐回息'
          });
        }
      }
      if (cloned.isBoss) {
        if (directive === 'frenzy') {
          cloned.patterns.push({
            type: 'multiAttack',
            value: Math.max(7, Math.floor(baseStrike * 0.75)),
            count: 2,
            intent: '🌪️狂潮压阵'
          });
        } else if (directive === 'bastion') {
          cloned.buffs.regen = Math.max(0, Math.floor(Number(cloned.buffs.regen) || 0)) + 2;
        } else if (directive === 'counter') {
          cloned.patterns.push({
            type: 'debuff',
            buffType: 'vulnerable',
            value: 1,
            intent: '🧿晶格锁压'
          });
        }
      }
    }
    if (phaseProfile && phaseProfile.active && cloned.isBoss && Array.isArray(cloned.patterns)) {
      const baseStrike = Math.max(8, Math.floor(10 * atkMul));
      if (phaseProfile.bossAffix === 'surge') {
        cloned.patterns.push({
          type: 'multiAttack',
          value: Math.max(6, Math.floor(baseStrike * 0.75)),
          count: 2,
          intent: '⚡相位突流'
        });
      } else if (phaseProfile.bossAffix === 'siege') {
        cloned.patterns.push({
          type: 'defend',
          value: Math.max(10, Math.floor(baseStrike * 0.9)),
          intent: '🛡️相位围压'
        });
        cloned.buffs.thorns = Math.max(0, Math.floor(Number(cloned.buffs.thorns) || 0)) + 1;
      } else if (phaseProfile.bossAffix === 'rift') {
        cloned.patterns.push({
          type: 'executeDamage',
          value: Math.max(12, Math.floor(baseStrike * 1.1)),
          threshold: 0.45,
          intent: '🌊相位裂潮'
        });
      } else if (phaseProfile.bossAffix === 'apex') {
        cloned.patterns.push({
          type: 'multiAttack',
          value: Math.max(8, Math.floor(baseStrike * 0.8)),
          count: 3,
          intent: '☄️终压连斩'
        });
        cloned.patterns.push({
          type: 'debuff',
          buffType: 'vulnerable',
          value: 2,
          intent: '☄️终压咒印'
        });
      }
      cloned.__endlessBossAffix = phaseProfile.bossAffix;
    }
    if (typeof this.applyEndlessCounterplayAffix === 'function') {
      this.applyEndlessCounterplayAffix(cloned, pressureProfile);
    }
    if (cloned.gold && typeof cloned.gold === 'object') {
      const min = Number(cloned.gold.min);
      const max = Number(cloned.gold.max);
      if (Number.isFinite(min) && Number.isFinite(max)) {
        cloned.gold = {
          min: Math.max(0, Math.floor(min * goldMul)),
          max: Math.max(0, Math.floor(max * goldMul))
        };
      }
    } else if (Number.isFinite(Number(cloned.gold))) {
      cloned.gold = Math.max(0, Math.floor(Number(cloned.gold) * goldMul));
    }
    cloned.__endlessScaled = true;
    if (pressureProfile) {
      cloned.__endlessPressureProfile = {
        pressure: pressureProfile.pressure,
        tierId: pressureProfile.tierId,
        tierName: pressureProfile.tierName
      };
    }
    if (phaseProfile && phaseProfile.active) {
      cloned.__endlessPhaseProfile = {
        id: phaseProfile.id,
        name: phaseProfile.name,
        checkpoint: phaseProfile.checkpoint
      };
    }
    if (cycleTheme && cycleTheme.id) {
      cloned.__endlessCycleTheme = {
        id: cycleTheme.id,
        name: cycleTheme.name,
        segmentIndex: cycleTheme.segmentIndex,
        directive: cycleTheme.enemyDirective
      };
    }
    return cloned;
  }
  applyEndlessCounterplayAffix(enemy, pressureProfile = null) {
    if (!enemy || typeof enemy !== 'object' || enemy.isBoss || !Array.isArray(enemy.patterns)) return;
    const state = this.ensureEndlessState();
    const heat = Math.max(0, Math.min(9, Math.floor(Number(state?.barterHeat) || 0)));
    const pressure = Math.max(0, Math.min(9, Math.floor(Number(pressureProfile?.pressure) || 0)));
    if (pressure < 6 || heat < 2) return;
    const pool = [];
    if (heat >= 2) {
      pool.push({
        id: 'counter_candy_drain',
        tag: '戒糖枷',
        desc: '界隙交易将被抑制奶糖转化效率，稳压阈值更难达成。',
        antiCandy: 1,
        appendPattern: {
          type: 'debuff',
          buffType: 'weak',
          value: 1,
          intent: '🍬戒糖封脉'
        }
      });
    }
    if (heat >= 3) {
      pool.push({
        id: 'counter_draw_tithe',
        tag: '抽税',
        desc: '过牌收益被抽税，拖慢指令节奏迭代。',
        antiDraw: 1,
        appendPattern: {
          type: 'addStatus',
          cardId: 'heartDemon',
          count: 1,
          intent: '📜抽税侵识'
        }
      });
    }
    if (heat >= 4) {
      pool.push({
        id: 'counter_pressure_anchor',
        tag: '稳压锚',
        desc: '敌方将锁定稳压窗口，界隙交易难以直接降低压力。',
        antiStabilize: 1,
        openingBlock: 5 + Math.floor((pressure - 5) * 1.5),
        appendPattern: {
          type: 'defend',
          value: 8 + Math.max(0, pressure - 5) * 2,
          intent: '⚓稳压封锁'
        }
      });
    }
    if (heat >= 5) {
      pool.push({
        id: 'counter_energy_choke',
        tag: '断流闸',
        desc: '敌方会切断能量回流，指令回能效率显著下滑。',
        antiEnergy: 1,
        appendPattern: {
          type: 'debuff',
          buffType: pressure >= 8 ? 'weak' : 'vulnerable',
          value: 1,
          intent: '⚡断流封识'
        }
      });
    }
    if (heat >= 6) {
      pool.push({
        id: 'counter_refund_lock',
        tag: '回收锁',
        desc: '敌方回收干扰生效，指令槽返还会被截断。',
        antiRefund: 1,
        openingBlock: 4 + Math.max(0, pressure - 6),
        appendPattern: {
          type: 'defend',
          value: 7 + Math.max(0, pressure - 5),
          intent: '🧷回收封锁'
        }
      });
    }
    if (heat >= 7) {
      pool.push({
        id: 'counter_burst_damp',
        tag: '爆发阻尼',
        desc: '敌方爆发阻尼场会压低高爆发输出，迫使你改走循环战。',
        antiBurst: 1,
        appendPattern: {
          type: 'multiAttack',
          value: 6 + Math.max(0, pressure - 7),
          count: 2,
          intent: '🌫️阻尼压击'
        }
      });
    }
    if (pool.length <= 0) return;
    const seedSource = `${enemy.id || enemy.name || 'enemy'}:${state.currentCycle || 0}:${pressure}:${heat}`;
    let seed = 0;
    for (let i = 0; i < seedSource.length; i += 1) {
      seed = (seed * 31 + seedSource.charCodeAt(i)) % 2147483647;
    }
    const picked = pool[seed % pool.length];
    if (!picked) return;
    enemy.__endlessCounterAffixId = picked.id;
    enemy.__endlessAntiCandy = Math.max(0, Math.floor(Number(picked.antiCandy) || 0));
    enemy.__endlessAntiDraw = Math.max(0, Math.floor(Number(picked.antiDraw) || 0));
    enemy.__endlessAntiStabilize = Math.max(0, Math.floor(Number(picked.antiStabilize) || 0));
    enemy.__endlessAntiEnergy = Math.max(0, Math.floor(Number(picked.antiEnergy) || 0));
    enemy.__endlessAntiRefund = Math.max(0, Math.floor(Number(picked.antiRefund) || 0));
    enemy.__endlessAntiBurst = Math.max(0, Math.floor(Number(picked.antiBurst) || 0));
    enemy.encounterAffixTag = picked.tag;
    enemy.encounterAffixDesc = picked.desc;
    if (Number.isFinite(Number(picked.openingBlock)) && Number(picked.openingBlock) > 0) {
      const block = Math.max(0, Math.floor(Number(picked.openingBlock) || 0));
      enemy.block = Math.max(0, Math.floor(Number(enemy.block) || 0)) + block;
    }
    if (picked.appendPattern && typeof picked.appendPattern === 'object') {
      enemy.patterns.push({
        ...picked.appendPattern
      });
    }
  }
}
if (typeof window !== 'undefined') {}