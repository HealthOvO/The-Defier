/**
 * The Defier 4.2 - 逆命者
 * 主游戏控制器（修复版）
 */

class Game {
    constructor() {
        this.player = new Player();
        this.player.game = this; // 供 player.js 安全访问当前游戏实例，避免依赖全局变量
        this.battle = new Battle(this);
        this.map = new GameMap(this);
        this.eventSystem = new EventSystem(this);
        this.achievementSystem = new AchievementSystem(this);
        this.currentScreen = 'main-menu';
        this.currentEnemies = [];
        this.currentBattleNode = null; // 记录当前战斗节点
        this.mode = 'pve';
        this.pvpOpponentRank = null;
        this.pvpMatchTicket = null;
        this.stealAttempted = false;
        this.rewardCardSelected = false; // 防止重复选牌
        this.lastBattleRewardMeta = null;
        this.comboCount = 0;
        this.lastCardType = null;
        this.runStartTime = null;
        this.currentSaveSlot = null; // Default to null (unknown), NOT 0 (Slot 1)
        this.cachedSlots = [null, null, null, null]; // Cache for slots
        this.guestMode = false;
        this.guideState = this.loadGuideState();
        this.legacyStorageKey = 'theDefierLegacyV1';
        this.legacyUpgradeCatalog = this.getLegacyUpgradeCatalog();
        this.legacyProgress = this.loadLegacyProgress();
        this.featureFlags = {
            combatDepthV2: true,
            pvpRuleSyncV2: true,
            mapNodeTrialForge: true,
            endlessModeV1: true
        };
        this.endlessState = this.createDefaultEndlessState();
        this.encounterState = this.createDefaultEncounterState();
        this.treasureCompendiumFilter = 'all';
        this.treasureCompendiumSort = 'rarity_desc';
        this.treasureCompendiumFilterState = {
            status: 'all',
            rarities: [],
            sources: []
        };
        this.treasureCompendiumPresetStorageKey = 'theDefierTreasureCompendiumPresetsV1';
        this.treasureCompendiumPresetCache = null;
        this.lastLegacyGain = 0;
        this.debugMode = localStorage.getItem('theDefierDebug') === 'true';
        this.boundGlobalEvents = false;
        this.isAuthBusy = false;
        this.isSyncingSlots = false;
        setTimeout(() => this.updateDebugUI(), 0);

        // Restore slot from session if exists
        const savedSlot = sessionStorage.getItem('currentSaveSlot');
        if (savedSlot !== null) this.currentSaveSlot = parseInt(savedSlot);

        this.init();
    }

    // 初始化
    init() {
        this.bindGlobalEvents();
        this.initRuntimeHooks();
        // Initialize Auth
        if (typeof AuthService !== 'undefined') {
            AuthService.init();
            this.checkLoginStatus();
        }
        this.initCollection();
        this.initDynamicBackground();
        this.loadGameResult = this.loadGame();

        // 恢复当前的存档位索引 (修复刷新后无法同步到正确槽位的问题)
        // 恢复当前的存档位索引 (修复刷新后无法同步到正确槽位的问题)
        let savedSlotIndex = sessionStorage.getItem('currentSaveSlot');

        // 关键修复：如果会话均无，尝试从本地持久化存储恢复
        if (savedSlotIndex === null) {
            savedSlotIndex = localStorage.getItem('lastSaveSlot');
        }

        if (savedSlotIndex !== null) {
            this.currentSaveSlot = parseInt(savedSlotIndex);
            console.log(`已恢复存档位: Slot ${this.currentSaveSlot + 1}`);
        }

        // 检查是否有存档，更新按钮状态
        const continueBtn = document.getElementById('continue-game-btn');
        const newGameBtn = document.getElementById('new-game-btn');

        // 默认显示“新的轮回”
        if (newGameBtn) newGameBtn.style.display = 'flex';

        if (this.loadGameResult && this.player.currentHp > 0) {
            if (continueBtn) {
                continueBtn.style.display = 'flex';
                // 当有存档时，新游戏按钮改为“次级”样式或保持原样，但必须显示
                // 这里我们确保它就在那里，并且文字清晰
                // 这里我们确保它就在那里，而且文字清晰
            }
        } else {
            if (continueBtn) continueBtn.style.display = 'none';
        }

        // 默认总是留在主菜单，除非特定场景（比如移动端恢复？）
        // 这里我们强制让用户选择，解决了刷新后乱入的问题
        this.showScreen('main-menu');

        // 安全检查：如果已登录但没有选中存档位（例如新标签页打开），强制显示存档选择，防止数据错乱
        if (typeof AuthService !== 'undefined' && AuthService.isLoggedIn() && this.currentSaveSlot === null) {
            console.log('Logged in but slot unknown. Prompting selection.');
            // 延迟一点以免与主菜单动画冲突
            setTimeout(() => this.openSaveSlotsWithSync(), 800);
        }

        console.log('The Defier 2.1 初始化完成！');
    }

    initRuntimeHooks() {
        // Deterministic-ish stepping hook for automation.
        window.advanceTime = (ms = 16) => {
            const delta = Math.max(0, Number(ms) || 0);
            if (this.battle && this.currentScreen === 'battle-screen' && typeof this.battle.advanceTime === 'function') {
                this.battle.advanceTime(delta);
                return;
            }
            if (this.battle && this.currentScreen === 'battle-screen' && typeof this.battle.updateBattleUI === 'function') {
                this.battle.updateBattleUI();
            }
        };

        window.render_game_to_text = () => this.renderGameToText();
    }

    renderGameToText() {
        const mode = this.currentScreen || 'unknown';
        const isBattleMode = mode === 'battle-screen';
        const payload = {
            coordSystem: 'ui-screen-space, origin top-left, +x right, +y down',
            mode,
            player: {
                hp: this.player?.currentHp ?? 0,
                maxHp: this.player?.maxHp ?? 0,
                block: this.player?.block ?? 0,
                energy: this.player?.currentEnergy ?? 0,
                maxEnergy: this.player?.baseEnergy ?? 0,
                hand: Array.isArray(this.player?.hand) ? this.player.hand.length : 0,
                drawPile: Array.isArray(this.player?.drawPile) ? this.player.drawPile.length : 0,
                discardPile: Array.isArray(this.player?.discardPile) ? this.player.discardPile.length : 0,
                stance: this.player?.stance || 'neutral',
                archetypeResonance: this.player?.archetypeResonance
                    ? {
                        id: this.player.archetypeResonance.id,
                        tier: this.player.archetypeResonance.tier
                    }
                    : null,
                adventureBuffs: this.player?.adventureBuffs || null
            },
            battle: (isBattleMode && this.battle) ? {
                turn: this.battle.turnNumber || 0,
                currentTurn: this.battle.currentTurn || 'none',
                encounterTheme: this.battle.activeEncounterTheme
                    ? {
                        id: this.battle.activeEncounterTheme.id,
                        name: this.battle.activeEncounterTheme.name,
                        tierStage: this.battle.activeEncounterTheme.tierStage || 1
                    }
                    : null,
                squadEcology: this.battle.activeSquadEcology
                    ? {
                        id: this.battle.activeSquadEcology.id,
                        name: this.battle.activeSquadEcology.name,
                        tag: this.battle.activeSquadEcology.tag,
                        count: this.battle.activeSquadEcology.count || 0
                    }
                    : null,
                battleCommand: (typeof this.battle.getBattleCommandSnapshot === 'function')
                    ? this.battle.getBattleCommandSnapshot()
                    : null,
                enemies: (this.battle.enemies || []).filter(e => e.currentHp > 0).map((e, idx) => ({
                    i: idx,
                    id: e.id,
                    name: e.name,
                    hp: e.currentHp,
                    maxHp: e.maxHp,
                    block: e.block || 0,
                    buffs: e.buffs || {},
                    phase: e.currentPhase || 0,
                    tactic: e.tacticalPlanLabel || null
                }))
            } : null,
            map: this.map ? {
                realm: this.player?.realm || 1,
                activeNodes: typeof this.map.getAccessibleNodes === 'function'
                    ? this.map.getAccessibleNodes().map(n => ({ id: n.id, row: n.row, type: n.type }))
                    : []
            } : null,
            legacy: {
                essence: this.legacyProgress?.essence || 0,
                unspent: this.getLegacyUnspentEssence(),
                upgrades: this.legacyProgress?.upgrades || {},
                lastPreset: this.legacyProgress?.lastPreset || null,
                secondaryPreset: this.legacyProgress?.secondaryPreset || null,
                doctrine: this.player?.legacyRunDoctrine || null,
                mission: this.player?.legacyRunMission || null
            },
            endless: this.ensureEndlessState(),
            endlessPhase: this.getEndlessPhaseProfile(),
            endlessTheme: this.getEndlessCycleThemeProfile(),
            encounter: this.ensureEncounterState(),
            perf: this.performanceStats
        };

        return JSON.stringify(payload);
    }

    shouldForceCloudLogin() {
        if (this.guestMode) return false;
        if (typeof AuthService === 'undefined') return false;
        if (!AuthService.isCloudEnabled || !AuthService.isCloudEnabled()) return false;
        return !AuthService.isLoggedIn();
    }

    loadGuideState() {
        const defaults = {
            mainMenuIntroSeen: false,
            firstBattleGuideSeen: false,
            battleLogHintSeen: false
        };
        if (typeof localStorage === 'undefined') return defaults;
        try {
            const raw = localStorage.getItem('theDefierGuideStateV1');
            if (!raw) return defaults;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return defaults;
            return { ...defaults, ...parsed };
        } catch (e) {
            console.warn('Guide state parse failed, fallback to defaults.', e);
            return defaults;
        }
    }

    saveGuideState() {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem('theDefierGuideStateV1', JSON.stringify(this.guideState || {}));
        } catch (e) {
            console.warn('Guide state save failed.', e);
        }
    }

    markGuideSeen(key) {
        if (!this.guideState) this.guideState = this.loadGuideState();
        if (!Object.prototype.hasOwnProperty.call(this.guideState, key) || this.guideState[key]) return;
        this.guideState[key] = true;
        this.saveGuideState();
    }

    getLegacyDefaults() {
        return {
            essence: 0,
            spent: 0,
            upgrades: {},
            lastPreset: null,
            secondaryPreset: null
        };
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

    createDefaultEncounterState() {
        return {
            battles: 0,
            wins: 0,
            currentStreakId: null,
            currentStreak: 0,
            maxStreak: 0,
            recentThemes: [],
            themeStats: {},
            totalBonusGold: 0,
            totalBonusExp: 0
        };
    }

    normalizeEncounterState(rawState = null) {
        const defaults = this.createDefaultEncounterState();
        const source = rawState && typeof rawState === 'object' ? rawState : {};
        const toInt = (value, fallback = 0) => {
            const num = Number(value);
            if (!Number.isFinite(num)) return fallback;
            return Math.max(0, Math.floor(num));
        };

        const themeStats = {};
        const rawThemeStats = source.themeStats && typeof source.themeStats === 'object'
            ? source.themeStats
            : {};
        Object.keys(rawThemeStats).forEach((themeId) => {
            if (typeof themeId !== 'string' || !themeId) return;
            const entry = rawThemeStats[themeId];
            const winCount = toInt(entry && entry.wins, 0);
            const seenCount = toInt(entry && entry.seen, 0);
            if (winCount <= 0 && seenCount <= 0) return;
            themeStats[themeId] = {
                seen: Math.max(seenCount, winCount),
                wins: Math.min(winCount, Math.max(seenCount, winCount)),
                bestTier: Math.max(1, Math.min(3, toInt(entry && entry.bestTier, 1) || 1))
            };
        });

        const currentStreak = toInt(source.currentStreak, 0);
        const normalized = {
            ...defaults,
            battles: toInt(source.battles, 0),
            wins: toInt(source.wins, 0),
            currentStreakId: typeof source.currentStreakId === 'string' && source.currentStreakId ? source.currentStreakId : null,
            currentStreak,
            maxStreak: Math.max(currentStreak, toInt(source.maxStreak, currentStreak)),
            recentThemes: Array.isArray(source.recentThemes)
                ? source.recentThemes.filter((id) => typeof id === 'string' && id).slice(-10)
                : [],
            themeStats,
            totalBonusGold: toInt(source.totalBonusGold, 0),
            totalBonusExp: toInt(source.totalBonusExp, 0)
        };

        if (normalized.currentStreak <= 0) {
            normalized.currentStreak = 0;
            normalized.currentStreakId = null;
        }
        return normalized;
    }

    ensureEncounterState() {
        this.encounterState = this.normalizeEncounterState(this.encounterState);
        return this.encounterState;
    }

    registerEncounterThemeStart(themeId) {
        const state = this.ensureEncounterState();
        const id = typeof themeId === 'string' ? themeId : '';
        if (!id) return 1;

        state.battles += 1;
        if (state.currentStreakId === id) {
            state.currentStreak += 1;
        } else {
            state.currentStreakId = id;
            state.currentStreak = 1;
        }
        state.maxStreak = Math.max(state.maxStreak, state.currentStreak);
        state.recentThemes.push(id);
        if (state.recentThemes.length > 10) state.recentThemes.shift();

        const stats = state.themeStats[id] || { seen: 0, wins: 0, bestTier: 1 };
        stats.seen = Math.max(0, Number(stats.seen) || 0) + 1;
        const stage = state.currentStreak >= 4 ? 3 : state.currentStreak >= 2 ? 2 : 1;
        stats.bestTier = Math.max(stats.bestTier || 1, stage);
        state.themeStats[id] = stats;
        return stage;
    }

    recordEncounterThemeVictory(summary) {
        if (!summary || typeof summary !== 'object') return;
        const state = this.ensureEncounterState();
        state.wins += 1;

        const id = typeof summary.themeId === 'string' ? summary.themeId : '';
        if (id) {
            const stats = state.themeStats[id] || { seen: 0, wins: 0, bestTier: 1 };
            stats.wins = Math.max(0, Number(stats.wins) || 0) + 1;
            stats.seen = Math.max(stats.seen || 0, stats.wins);
            stats.bestTier = Math.max(
                stats.bestTier || 1,
                Math.max(1, Math.min(3, Math.floor(Number(summary.tierStage) || 1)))
            );
            state.themeStats[id] = stats;
        }

        state.totalBonusGold += Math.max(0, Math.floor(Number(summary.goldBonus) || 0));
        state.totalBonusExp += Math.max(0, Math.floor(Number(summary.ringExpBonus) || 0));
    }

    normalizeEndlessState(rawState = null) {
        const defaults = this.createDefaultEndlessState();
        const source = rawState && typeof rawState === 'object' ? rawState : {};
        const progressionRealm = Math.max(
            Number(this.player?.maxRealmReached) || 1,
            Math.max(...((Array.isArray(this.unlockedRealms) && this.unlockedRealms.length > 0) ? this.unlockedRealms : [1]))
        );

        const normalizeInt = (value, fallback = 0) => {
            const num = Number(value);
            if (!Number.isFinite(num)) return fallback;
            return Math.max(0, Math.floor(num));
        };
        const sanitizeRate = (value) => {
            const num = Number(value);
            if (!Number.isFinite(num)) return 0;
            return Math.max(0, Math.min(0.9, num));
        };

        const boonStatsRaw = source.boonStats && typeof source.boonStats === 'object'
            ? source.boonStats
            : {};
        const boonStats = {
            rewardGoldMul: sanitizeRate(boonStatsRaw.rewardGoldMul),
            rewardExpMul: sanitizeRate(boonStatsRaw.rewardExpMul),
            shopDiscountMul: sanitizeRate(boonStatsRaw.shopDiscountMul),
            healMul: sanitizeRate(boonStatsRaw.healMul),
            battleFirstTurnDraw: normalizeInt(boonStatsRaw.battleFirstTurnDraw),
            battleOpeningBlock: normalizeInt(boonStatsRaw.battleOpeningBlock),
            battleFirstTurnEnergy: normalizeInt(boonStatsRaw.battleFirstTurnEnergy)
        };

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
            activeMutators: Array.isArray(source.activeMutators)
                ? source.activeMutators.filter((id) => typeof id === 'string').slice(-3)
                : [],
            lastMutatorId: typeof source.lastMutatorId === 'string' ? source.lastMutatorId : null,
            lastPhaseId: typeof source.lastPhaseId === 'string' ? source.lastPhaseId : null,
            lastThemeId: typeof source.lastThemeId === 'string' ? source.lastThemeId : null,
            phaseHistory: Array.isArray(source.phaseHistory)
                ? source.phaseHistory
                    .filter((entry) => entry && typeof entry.id === 'string' && Number.isFinite(Number(entry.cycle)))
                    .map((entry) => ({
                        id: entry.id,
                        cycle: Math.max(0, Math.floor(Number(entry.cycle) || 0))
                    }))
                    .slice(-20)
                : [],
            themeHistory: Array.isArray(source.themeHistory)
                ? source.themeHistory
                    .filter((entry) => entry && typeof entry.id === 'string' && Number.isFinite(Number(entry.cycle)))
                    .map((entry) => ({
                        id: entry.id,
                        cycle: Math.max(0, Math.floor(Number(entry.cycle) || 0)),
                        segment: Math.max(1, Math.min(5, Math.floor(Number(entry.segment) || 1)))
                    }))
                    .slice(-20)
                : [],
            boonHistory: Array.isArray(source.boonHistory)
                ? source.boonHistory.filter((id) => typeof id === 'string').slice(-20)
                : [],
            paranoiaLevel: normalizeInt(source.paranoiaLevel),
            activeParanoiaBurdens: Array.isArray(source.activeParanoiaBurdens)
                ? source.activeParanoiaBurdens.filter((id) => typeof id === 'string').slice(-8)
                : [],
            activeParanoiaBoons: Array.isArray(source.activeParanoiaBoons)
                ? source.activeParanoiaBoons.filter((id) => typeof id === 'string').slice(-8)
                : [],
            paranoiaHistory: Array.isArray(source.paranoiaHistory)
                ? source.paranoiaHistory
                    .filter((entry) => entry && typeof entry.burdenId === 'string' && typeof entry.boonId === 'string')
                    .map((entry) => ({
                        burdenId: entry.burdenId,
                        boonId: entry.boonId,
                        cycle: Math.max(0, Math.floor(Number(entry.cycle) || 0))
                    }))
                    .slice(-12)
                : [],
            lastParanoiaCycle: Math.max(-1, Math.floor(Number(source.lastParanoiaCycle) || -1)),
            boonRarePity: normalizeInt(source.boonRarePity),
            boonRareGuaranteedEvery: Math.max(2, Math.min(6, normalizeInt(source.boonRareGuaranteedEvery, 3) || 3)),
            barterHeat: Math.max(0, Math.min(9, normalizeInt(source.barterHeat, 0))),
            boonStats
        };

        return normalized;
    }

    ensureEndlessState() {
        this.endlessState = this.normalizeEndlessState(this.endlessState);
        return this.endlessState;
    }

    isEndlessUnlocked() {
        const state = this.ensureEndlessState();
        if (state.unlocked) return true;

        const progressionRealm = Math.max(
            Number(this.player?.maxRealmReached) || 1,
            Math.max(...((Array.isArray(this.unlockedRealms) && this.unlockedRealms.length > 0) ? this.unlockedRealms : [1]))
        );
        if (progressionRealm >= 6) {
            state.unlocked = true;
        }
        return !!state.unlocked;
    }

    isEndlessActive() {
        if (!this.featureFlags || !this.featureFlags.endlessModeV1) return false;
        const state = this.ensureEndlessState();
        return !!state.active && this.isEndlessUnlocked();
    }

    getMapCacheKey(realm) {
        if (this.isEndlessActive()) {
            const state = this.ensureEndlessState();
            return `endless:${state.currentCycle}:realm:${realm}`;
        }
        return `realm:${realm}`;
    }

    getEndlessRealmForCycle(cycle = 0) {
        const sequence = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
        const safeCycle = Math.max(0, Math.floor(Number(cycle) || 0));
        return sequence[safeCycle % sequence.length];
    }

    getDisplayRealmName(realm) {
        const fallbackName = this.map && typeof this.map.getRealmName === 'function'
            ? this.map.getRealmName(realm)
            : `第${realm}重天`;
        if (!this.isEndlessActive()) return fallbackName;
        const state = this.ensureEndlessState();
        return `无尽轮回·第${state.currentCycle + 1}轮｜${fallbackName}`;
    }

    getEndlessMutatorPool() {
        return [
            {
                id: 'iron_wall',
                name: '铁幕甲壳',
                desc: '敌人生命提升，奖励略增。',
                mods: { enemyHpMul: 1.22, rewardGoldMul: 1.08, rewardExpMul: 1.06 }
            },
            {
                id: 'berserker_tide',
                name: '狂潮杀意',
                desc: '敌人攻击提升，收益同步提升。',
                mods: { enemyAtkMul: 1.2, rewardGoldMul: 1.12, rewardExpMul: 1.1 }
            },
            {
                id: 'void_tax',
                name: '虚空税契',
                desc: '治疗效率下降，但事件更易出现。',
                mods: {
                    healMul: 0.82,
                    rewardGoldMul: 1.14,
                    mapWeightShift: { event: 0.04, rest: -0.02 }
                }
            },
            {
                id: 'war_market',
                name: '战时供给',
                desc: '商店更贵，但商店节点显著增加。',
                mods: {
                    shopPriceMul: 1.2,
                    mapWeightShift: { shop: 0.08, event: -0.03, enemy: -0.02 }
                }
            },
            {
                id: 'trial_inferno',
                name: '焚心试炼',
                desc: '试炼和精英更多，回报更高。',
                mods: {
                    rewardGoldMul: 1.12,
                    rewardExpMul: 1.16,
                    mapWeightShift: { trial: 0.06, elite: 0.04, rest: -0.03, shop: -0.02 }
                }
            },
            {
                id: 'ashen_camp',
                name: '焦土行军',
                desc: '营地更稀少，但金币与经验提升。',
                mods: {
                    rewardGoldMul: 1.15,
                    rewardExpMul: 1.08,
                    mapWeightShift: { rest: -0.05, enemy: 0.03, elite: 0.02 }
                }
            }
        ];
    }

    rollNextEndlessMutator() {
        const state = this.ensureEndlessState();
        const pool = this.getEndlessMutatorPool();
        if (!Array.isArray(pool) || pool.length === 0) return null;

        const activeSet = new Set(state.activeMutators || []);
        const candidates = pool.filter((m) => m && m.id && !activeSet.has(m.id));
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
        return [
            {
                id: 'cramped_hand',
                name: '紧箍识海',
                shortLabel: '手牌上限 -1',
                desc: '每个大轮回后，手牌上限永久 -1。',
                mods: { handLimitOffset: -1 }
            },
            {
                id: 'elite_echo',
                name: '精英回响',
                shortLabel: '精英额外词缀',
                desc: '无尽中的精英战会额外叠加 1 条临时轮回词缀。',
                mods: { eliteExtraMutator: true }
            },
            {
                id: 'withered_mend',
                name: '枯脉疗蚀',
                shortLabel: '治疗衰减',
                desc: '所有恢复效果进一步衰减。',
                mods: { healMul: 0.82 }
            },
            {
                id: 'thin_harvest',
                name: '薄获税印',
                shortLabel: '普通战掉落减少',
                desc: '普通战的灵石与命环经验收益下降。',
                mods: { normalBattleRewardMul: 0.78, normalBattleExpMul: 0.84 }
            }
        ];
    }

    getEndlessParanoiaBoonPool() {
        return [
            {
                id: 'rare_surge',
                name: '稀曜偏振',
                shortLabel: '稀有奖励提升',
                desc: '战后卡牌奖励更容易出现稀有牌。',
                mods: { rewardRareChance: 0.24 }
            },
            {
                id: 'vault_slot',
                name: '宝匣扩容',
                shortLabel: '法宝槽位 +1',
                desc: '额外获得 1 个法宝装备槽位。',
                mods: { extraTreasureSlots: 1 }
            },
            {
                id: 'fate_spark',
                name: '命格跃迁',
                shortLabel: '命环额外升级',
                desc: '立即获得一次接近完整等级的命环跃迁。',
                immediate: 'ringLevelUp'
            }
        ];
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
        if (!this.isEndlessActive() && !this.endlessState) return result;

        const state = this.ensureEndlessState();
        const burdenMap = new Map(this.getEndlessParanoiaBurdenPool().map((item) => [item.id, item]));
        const boonMap = new Map(this.getEndlessParanoiaBoonPool().map((item) => [item.id, item]));
        const burdenIds = Array.isArray(state.activeParanoiaBurdens) ? state.activeParanoiaBurdens : [];
        const boonIds = Array.isArray(state.activeParanoiaBoons) ? state.activeParanoiaBoons : [];

        burdenIds.forEach((id) => {
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

        boonIds.forEach((id) => {
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
        const safePool = pool.filter((item) => item && item.id !== 'war_market');
        const pickPool = safePool.length > 0 ? safePool : pool;
        const pick = pickPool[cycle % pickPool.length];
        return pick && pick.id ? pick.id : null;
    }

    getEndlessActiveMutatorIds() {
        const state = this.ensureEndlessState();
        const activeIds = Array.isArray(state.activeMutators) ? state.activeMutators.filter((id) => typeof id === 'string' && id) : [];
        const effects = this.getEndlessParanoiaEffects();
        if (
            effects.eliteExtraMutator &&
            this.currentBattleNode &&
            this.currentBattleNode.type === 'elite'
        ) {
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
        const burdenPool = burdens.filter((item) => item && item.id && !activeBurdenIds.has(item.id));
        const boonPool = boons.filter((item) => item && item.id && !activeBoonIds.has(item.id));
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
        if (!boon || typeof boon !== 'object' || !this.player) return null;
        if (boon.immediate === 'ringLevelUp' && this.player.fateRing && typeof this.player.fateRing.gainExp === 'function') {
            const ring = this.player.fateRing;
            let nextTarget = null;
            if (typeof FATE_RING !== 'undefined' && FATE_RING.levels) {
                Object.keys(FATE_RING.levels).forEach((key) => {
                    const level = Math.max(0, Math.floor(Number(key) || 0));
                    const meta = FATE_RING.levels[key];
                    const expNeed = Math.max(0, Math.floor(Number(meta && meta.exp) || 0));
                    if (level > (ring.level || 0) && (nextTarget === null || expNeed < nextTarget)) {
                        nextTarget = expNeed;
                    }
                });
            }
            const missingExp = nextTarget === null
                ? 320
                : Math.max(60, nextTarget - Math.max(0, Math.floor(Number(ring.exp) || 0)));
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
            picked = choices.find((item) => item && item.id === choice) || null;
        } else if (choice && typeof choice === 'object') {
            if (choice.burden && choice.boon) {
                picked = choice;
            } else if (choice.burdenId && choice.boonId) {
                const burden = this.getEndlessParanoiaBurdenPool().find((item) => item.id === choice.burdenId) || null;
                const boon = this.getEndlessParanoiaBoonPool().find((item) => item.id === choice.boonId) || null;
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

    showEndlessParanoiaSelection(cycleOverride = null, onDone = null) {
        const choices = this.getEndlessParanoiaChoices();
        if (!choices || choices.length === 0) {
            if (typeof onDone === 'function') onDone();
            return;
        }

        const modal = document.getElementById('event-modal');
        const titleEl = document.getElementById('event-title');
        const iconEl = document.getElementById('event-icon');
        const descEl = document.getElementById('event-desc');
        const choicesEl = document.getElementById('event-choices');
        if (!modal || !titleEl || !iconEl || !descEl || !choicesEl) {
            this.applyEndlessParanoiaChoice(choices[0], cycleOverride);
            if (typeof onDone === 'function') onDone();
            return;
        }

        titleEl.textContent = '轮回偏执';
        iconEl.textContent = '🜂';
        descEl.innerHTML = '大轮回正在重写规则。你必须接纳一条负面法则，并领取一份超规格补偿。';
        choicesEl.innerHTML = '';

        choices.forEach((choice) => {
            const btn = document.createElement('button');
            btn.className = 'event-choice endless-paranoia-choice';
            btn.innerHTML = `
                <div><span style="color:#ff9d7a;">【负】${choice.burden.name}</span> + <span style="color:#9de7ff;">【偿】${choice.boon.name}</span></div>
                <div class="choice-effect">${choice.burden.desc}<br>${choice.boon.desc}</div>
            `;
            btn.onclick = () => {
                const applied = this.applyEndlessParanoiaChoice(choice, cycleOverride);
                modal.classList.remove('active');
                if (applied) {
                    Utils.showBattleLog(`轮回偏执：接纳【${applied.burden.name}】并获得【${applied.boon.name}】`);
                    if (applied.immediate && applied.immediate.detail) {
                        Utils.showBattleLog(`轮回补偿：${applied.immediate.detail}`);
                    }
                }
                if (typeof onDone === 'function') onDone(applied);
            };
            choicesEl.appendChild(btn);
        });

        modal.classList.add('active');    }


    getEndlessPhaseProfile(cycleOverride = null) {
        const state = this.ensureEndlessState();
        const rawCycle = cycleOverride === null || cycleOverride === undefined
            ? state.currentCycle
            : cycleOverride;
        const cycle = Math.max(0, Math.floor(Number(rawCycle) || 0));
        const loopIndex = (cycle % 13) + 1;

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
        const rawCycle = cycleOverride === null || cycleOverride === undefined
            ? state.currentCycle
            : cycleOverride;
        const cycle = Math.max(0, Math.floor(Number(rawCycle) || 0));
        const segmentIndex = (cycle % 5) + 1;

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
                mapWeightShift: { elite: 0.02, trial: 0.02, rest: -0.02 },
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
                mapWeightShift: { enemy: 0.04, elite: 0.01, rest: -0.02 },
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
                mapWeightShift: { event: 0.02, trial: 0.02, rest: -0.02 },
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
                mapWeightShift: { elite: 0.03, enemy: 0.03, rest: -0.03 },
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
                mapWeightShift: { rest: 0.04, shop: 0.03, elite: -0.02 },
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

    getEndlessModifiers() {
        if (!this.isEndlessActive()) {
            return {
                enemyHpMul: 1,
                enemyAtkMul: 1,
                rewardGoldMul: 1,
                rewardExpMul: 1,
                shopPriceMul: 1,
                healMul: 1,
                mapWeightShift: {},
                cycleTheme: null
            };
        }

        const state = this.ensureEndlessState();
        const cycle = Math.max(0, Math.floor(Number(state.currentCycle) || 0));
        const loopTier = Math.floor(cycle / 13);
        const pressure = Math.max(0, Math.min(9, Math.floor(Number(state.pressure) || 0)));
        const phaseProfile = this.getEndlessPhaseProfile(cycle);
        const cycleTheme = this.getEndlessCycleThemeProfile(cycle);

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
            }
        };

        const mutatorMap = new Map(this.getEndlessMutatorPool().map((item) => [item.id, item]));
        const activeMutatorIds = typeof this.getEndlessActiveMutatorIds === 'function'
            ? this.getEndlessActiveMutatorIds()
            : (Array.isArray(state.activeMutators) ? state.activeMutators : []);
        activeMutatorIds.forEach((mutatorId) => {
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
                Object.keys(mods.mapWeightShift).forEach((key) => {
                    const delta = Number(mods.mapWeightShift[key]);
                    if (!Number.isFinite(delta)) return;
                    result.mapWeightShift[key] = (result.mapWeightShift[key] || 0) + delta;
                });
            }
        });

        const boonStats = state.boonStats || {};
        result.rewardGoldMul *= (1 + (Number(boonStats.rewardGoldMul) || 0));
        result.rewardExpMul *= (1 + (Number(boonStats.rewardExpMul) || 0));
        result.shopPriceMul *= Math.max(0.35, 1 - (Number(boonStats.shopDiscountMul) || 0));
        result.healMul *= (1 + (Number(boonStats.healMul) || 0));

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
                Object.keys(cycleTheme.mapWeightShift).forEach((key) => {
                    const delta = Number(cycleTheme.mapWeightShift[key]);
                    if (!Number.isFinite(delta)) return;
                    result.mapWeightShift[key] = (result.mapWeightShift[key] || 0) + delta;
                });
            }
        }

        const paranoia = typeof this.getEndlessParanoiaEffects === 'function'
            ? this.getEndlessParanoiaEffects()
            : {
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

    getEndlessPressureBehaviorProfile() {
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
        const pressure = Math.max(0, Math.min(9, Math.floor(Number(state?.pressure) || 0)));
        const phaseProfile = this.getEndlessPhaseProfile(state.currentCycle);
        const cycleTheme = this.getEndlessCycleThemeProfile(state.currentCycle);
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
        return profile;
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
        const eventBias = (mods.mapWeightShift && Number(mods.mapWeightShift.event)) || 0;
        const trialBias = (mods.mapWeightShift && Number(mods.mapWeightShift.trial)) || 0;

        const nodesSequence = [];
        for (let row = 0; row < rows - 1; row += 1) {
            let count = 2;
            if ((row + cycle) % 3 === 1) count += 1;
            if (row > rows * 0.55 && (row + cycle) % 4 === 0) count += 1;
            if (eventBias > 0.05 && row % 3 === 0) count += 1;
            if (trialBias > 0.05 && row >= rows - 3) count += 1;
            nodesSequence.push(Math.max(2, Math.min(4, count)));
        }

        return { realm, rows, nodesSequence };
    }

    getEndlessBoonPool() {
        return [
            { id: 'golden_ledger', name: '金账符印', rarity: 'common', desc: '所有战斗灵石奖励 +12%。', effect: { rewardGoldMul: 0.12 } },
            { id: 'insight_torch', name: '悟火灯芯', rarity: 'common', desc: '所有战斗命环经验 +10%。', effect: { rewardExpMul: 0.1 } },
            { id: 'merchant_seal', name: '商盟玉符', rarity: 'common', desc: '商店价格 -8%。', effect: { shopDiscountMul: 0.08 } },
            { id: 'renewal_prayer', name: '回春祷言', rarity: 'common', desc: '所有治疗效果 +12%。', effect: { healMul: 0.12 } },
            { id: 'warding_banner', name: '护阵军旗', rarity: 'common', desc: '每场战斗额外获得 1 层开场护盾增益。', effect: { battleOpeningBlock: 1 } },
            { id: 'swift_page', name: '迅思残页', rarity: 'common', desc: '每场战斗额外获得 1 层首回合抽牌增益。', effect: { battleFirstTurnDraw: 1 } },
            { id: 'pulse_core', name: '灵息核', rarity: 'common', desc: '每场战斗额外获得 1 层首回合灵力增益。', effect: { battleFirstTurnEnergy: 1 } },
            { id: 'vitality_root', name: '命元根', rarity: 'common', desc: '最大生命 +10，并立即恢复 20% 最大生命。', immediate: 'maxHpBoost' },
            { id: 'fortune_cache', name: '应急粮仓', rarity: 'common', desc: '立即获得一笔灵石补给。', immediate: 'goldBurst' },
            { id: 'arcane_draft', name: '秘卷补录', rarity: 'common', desc: '立即获得 1 张稀有卡牌。', immediate: 'cardDraft' },
            { id: 'astral_tithe', name: '星税契', rarity: 'rare', desc: '所有战斗灵石奖励 +22%，命环经验 +12%。', effect: { rewardGoldMul: 0.22, rewardExpMul: 0.12 } },
            { id: 'eternal_aegis', name: '永恒壁垒', rarity: 'rare', desc: '治疗 +15%，每场战斗额外获得 2 层开场护盾。', effect: { healMul: 0.15, battleOpeningBlock: 2 } },
            { id: 'genesis_spark', name: '原初火花', rarity: 'rare', desc: '每场战斗额外获得 1 层首回合灵力与抽牌增益。', effect: { battleFirstTurnEnergy: 1, battleFirstTurnDraw: 1 } },
            { id: 'void_codex', name: '虚空圣典', rarity: 'rare', desc: '立即获得 1 张史诗卡牌，并提高命环经验收益。', immediate: 'epicCardDraft', effect: { rewardExpMul: 0.1 } }
        ];
    }

    getEndlessBoonChoices() {
        const pool = this.getEndlessBoonPool();
        if (!Array.isArray(pool) || pool.length <= 3) return pool.slice(0, 3);

        const state = this.ensureEndlessState();
        const tuning = this.isEndlessActive() ? this.getEndlessEventTuning() : null;
        const recent = new Set((state.boonHistory || []).slice(-4));
        const preferred = pool.filter((boon) => boon && boon.id && !recent.has(boon.id));
        const source = preferred.length >= 3 ? preferred : pool.slice();
        const rarePool = source.filter((boon) => boon.rarity === 'rare');
        const commonPool = source.filter((boon) => boon.rarity !== 'rare');
        const picks = [];
        const limit = Math.max(2, Math.floor(Number(state.boonRareGuaranteedEvery) || 3));
        const shouldGuaranteeRare = rarePool.length > 0 && (Number(state.boonRarePity) || 0) >= (limit - 1);
        const shouldForceRare = rarePool.length > 0 && !!tuning?.forceRareBoonChoice;
        const rareChance = Math.min(0.72, 0.28 + (Number(tuning?.boonRareBonusRate) || 0));

        const pickUniqueFrom = (arr) => {
            const available = arr.filter((boon) => boon && boon.id && !picks.some((picked) => picked.id === boon.id));
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
        const boon = pool.find((item) => item && item.id === boonId);
        if (!boon) return null;

        const state = this.ensureEndlessState();
        if (!state.boonStats || typeof state.boonStats !== 'object') {
            state.boonStats = { ...this.createDefaultEndlessState().boonStats };
        }

        if (boon.effect && typeof boon.effect === 'object') {
            Object.keys(boon.effect).forEach((key) => {
                const value = Number(boon.effect[key]) || 0;
                if (value === 0) return;
                const current = Number(state.boonStats[key]) || 0;
                state.boonStats[key] = Math.max(0, current + value);
            });
        }

        if (boon.immediate === 'maxHpBoost') {
            this.player.maxHp += 10;
            const healAmount = Math.max(8, Math.floor(this.player.maxHp * 0.2));
            this.player.heal(healAmount);
        } else if (boon.immediate === 'goldBurst') {
            const goldGain = 140 + this.ensureEndlessState().currentCycle * 20;
            this.player.gold += goldGain;
            Utils.showBattleLog(`无尽祝福：获得 ${goldGain} 灵石补给`);
        } else if (boon.immediate === 'cardDraft') {
            const card = getRandomCard('rare', this.player.characterId);
            if (card) {
                this.player.addCardToDeck(card);
                Utils.showBattleLog(`无尽祝福：获得卡牌【${card.name}】`);
            }
        } else if (boon.immediate === 'epicCardDraft') {
            const card = getRandomCard('epic', this.player.characterId);
            if (card) {
                this.player.addCardToDeck(card);
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

    showEndlessBoonSelection(onDone = null) {
        const choices = this.getEndlessBoonChoices();
        if (!choices || choices.length === 0) {
            if (typeof onDone === 'function') onDone();
            return;
        }

        const modal = document.getElementById('event-modal');
        const titleEl = document.getElementById('event-title');
        const iconEl = document.getElementById('event-icon');
        const descEl = document.getElementById('event-desc');
        const choicesEl = document.getElementById('event-choices');
        if (!modal || !titleEl || !iconEl || !descEl || !choicesEl) {
            this.applyEndlessBoon(choices[0].id);
            if (typeof onDone === 'function') onDone();
            return;
        }

        titleEl.textContent = '无尽赐福';
        iconEl.textContent = '♾️';
        descEl.innerHTML = '你突破了本轮天劫，命环共鸣为你显化三道赐福。<br>请选择其一并继续前进。';
        choicesEl.innerHTML = '';

        choices.forEach((boon) => {
            const btn = document.createElement('button');
            btn.className = 'event-choice';
            const rarityTag = boon.rarity === 'rare'
                ? '<span style="color:#ffb866;">【稀有】</span> '
                : '';
            btn.innerHTML = `
                <div>${rarityTag}${boon.name}</div>
                <div class="choice-effect">${boon.desc}</div>
            `;
            btn.onclick = () => {
                const applied = this.applyEndlessBoon(boon.id);
                modal.classList.remove('active');
                if (applied) {
                    Utils.showBattleLog(`无尽赐福已生效：${applied.name}`);
                }
                if (typeof onDone === 'function') onDone();
            };
            choicesEl.appendChild(btn);
        });

        modal.classList.add('active');
    }

    applyEndlessPreBattleBonuses() {
        if (!this.isEndlessActive() || !this.player || typeof this.player.grantAdventureBuff !== 'function') return;
        const state = this.ensureEndlessState();
        const boonStats = state.boonStats || {};
        const drawStacks = Math.max(0, Math.floor(Number(boonStats.battleFirstTurnDraw) || 0));
        const blockStacks = Math.max(0, Math.floor(Number(boonStats.battleOpeningBlock) || 0));
        const energyStacks = Math.max(0, Math.floor(Number(boonStats.battleFirstTurnEnergy) || 0));
        if (drawStacks > 0) this.player.grantAdventureBuff('firstTurnDrawBoostBattles', drawStacks);
        if (blockStacks > 0) this.player.grantAdventureBuff('openingBlockBoostBattles', blockStacks);
        if (energyStacks > 0) this.player.grantAdventureBuff('firstTurnEnergyBoostBattles', energyStacks);
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

        this.player.isReplay = false;
        this.player.isRecultivation = false;
        this.player.floor = 0;
        this.player.realm = this.getEndlessRealmForCycle(state.currentCycle);
        this.player.currentHp = this.player.maxHp;
        this.currentBattleNode = null;

        this.map.generate(this.player.realm);
        this.showScreen('map-screen');
        this.autoSave();
        Utils.showBattleLog(`无尽轮回开启：第 ${state.currentCycle + 1} 轮`);
        return true;
    }

    handleEndlessRealmComplete() {
        if (!this.isEndlessActive()) return;
        const state = this.ensureEndlessState();
        const prevPressure = Math.max(0, Math.min(9, Math.floor(Number(state.pressure) || 0)));
        const prevBarterHeat = Math.max(0, Math.min(9, Math.floor(Number(state.barterHeat) || 0)));
        state.totalBossDefeated += 1;
        state.clearedCycles += 1;
        state.pressure = Math.max(0, Math.min(9, prevPressure + 1));
        state.barterHeat = Math.max(0, prevBarterHeat - 1);

        const mods = this.getEndlessModifiers();
        const cycleGold = Math.max(60, Math.floor((140 + state.currentCycle * 25) * mods.rewardGoldMul));
        this.player.gold += cycleGold;
        const healAmount = Math.max(10, Math.floor(this.player.maxHp * 0.2 * mods.healMul));
        this.player.heal(healAmount);
        const cycleScore = Math.max(100, Math.floor((100 + state.currentCycle * 38) * (mods.enemyHpMul * 0.55 + mods.enemyAtkMul * 0.45)));
        state.totalEndlessScore = Math.max(0, Math.floor(Number(state.totalEndlessScore) || 0)) + cycleScore;

        const essenceGain = Math.max(1, Math.floor((state.currentCycle + 2) / 3));
        this.awardLegacyEssence(essenceGain, '无尽感悟', { silent: true });
        Utils.showBattleLog(`无尽突破：灵石 +${cycleGold}，恢复 ${healAmount} 生命，轮回精粹 +${essenceGain}，无尽积分 +${cycleScore}，轮回压力 ${prevPressure}→${state.pressure}`);

        const rolledMutator = this.rollNextEndlessMutator();
        if (rolledMutator) {
            Utils.showBattleLog(`轮回异变：${rolledMutator.name}（${rolledMutator.desc}）`);
        }

        const nextCycle = state.currentCycle + 1;
        const enteringNewLoop = nextCycle > 0 && nextCycle % 13 === 0;
        const nextPhase = this.getEndlessPhaseProfile(nextCycle);
        const nextTheme = this.getEndlessCycleThemeProfile(nextCycle);
        if (nextPhase && nextPhase.active) {
            state.lastPhaseId = nextPhase.id;
            state.phaseHistory = Array.isArray(state.phaseHistory) ? state.phaseHistory : [];
            state.phaseHistory.push({ id: nextPhase.id, cycle: nextCycle });
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
            this.player.realm = this.getEndlessRealmForCycle(latestState.currentCycle);
            this.player.floor = 0;
            this.currentBattleNode = null;
            this.player.checkSkillUnlock();
            this.map.generate(this.player.realm);
            this.renderTreasures('map-treasures');
            this.showScreen('map-screen');
            this.autoSave();
        };

        const afterBoonSelection = () => {
            const latestState = this.ensureEndlessState();
            if (enteringNewLoop && Number(latestState.lastParanoiaCycle) !== nextCycle) {
                this.showEndlessParanoiaSelection(nextCycle, finalizeAdvance);
                return;
            }
            finalizeAdvance();
        };

        this.showEndlessBoonSelection(afterBoonSelection);
    }

    getLegacyUpgradeCatalog() {
        return [
            {
                id: 'vitalitySeed',
                name: '命元传承',
                icon: '❤️',
                maxLevel: 3,
                costs: [4, 8, 12],
                desc: '每级使开局最大生命 +6',
                effects: { startMaxHp: 6 }
            },
            {
                id: 'spiritPouch',
                name: '灵石囊',
                icon: '💰',
                maxLevel: 3,
                costs: [3, 6, 9],
                desc: '每级使开局灵石 +30',
                effects: { startGold: 30 }
            },
            {
                id: 'battleInsight',
                name: '先天悟性',
                icon: '⚡',
                maxLevel: 2,
                costs: [7, 11],
                desc: '每级首回合额外抽 1 张牌',
                effects: { firstTurnDrawBonus: 1 }
            },
            {
                id: 'forgemind',
                name: '锻意共鸣',
                icon: '⚒️',
                maxLevel: 3,
                costs: [5, 9, 13],
                desc: '每级使锻炉消耗降低 6%',
                effects: { forgeCostDiscount: 0.06 }
            },
            {
                id: 'mindLibrary',
                name: '识海扩容',
                icon: '📖',
                maxLevel: 2,
                costs: [8, 12],
                desc: '每级使战斗抽牌基数 +1',
                effects: { startDraw: 1 }
            }
        ];
    }

    getLegacyPresetCatalog() {
        return [
            {
                id: 'survivor',
                name: '稳健守成',
                icon: '🛡️',
                desc: '优先血量与经济，保证开局容错。',
                priority: ['vitalitySeed', 'spiritPouch', 'mindLibrary', 'forgemind', 'battleInsight']
            },
            {
                id: 'smith',
                name: '锻造流',
                icon: '⚒️',
                desc: '优先锻炉折扣与资源，强化中期成长。',
                priority: ['forgemind', 'spiritPouch', 'vitalitySeed', 'mindLibrary', 'battleInsight']
            },
            {
                id: 'tempo',
                name: '速攻流',
                icon: '⚡',
                desc: '优先首回合节奏与抽牌压制。',
                priority: ['battleInsight', 'mindLibrary', 'spiritPouch', 'forgemind', 'vitalitySeed']
            },
            {
                id: 'entropy',
                name: '湮律流',
                icon: '🌀',
                desc: '围绕弃牌触发与随机压制展开节奏。',
                priority: ['mindLibrary', 'battleInsight', 'forgemind', 'spiritPouch', 'vitalitySeed']
            },
            {
                id: 'bulwark',
                name: '玄甲流',
                icon: '🛡️',
                desc: '通过护势共鸣滚动优势，稳态反击压垮对手。',
                priority: ['vitalitySeed', 'mindLibrary', 'battleInsight', 'forgemind', 'spiritPouch']
            },
            {
                id: 'stormcraft',
                name: '霆策流',
                icon: '⚡',
                desc: '围绕易伤破窗与连锁追击展开爆发。',
                priority: ['battleInsight', 'mindLibrary', 'forgemind', 'spiritPouch', 'vitalitySeed']
            },
            {
                id: 'vitalweave',
                name: '回脉流',
                icon: '💚',
                desc: '围绕治疗转化护阵与反击，构建持续战线。',
                priority: ['vitalitySeed', 'mindLibrary', 'spiritPouch', 'forgemind', 'battleInsight']
            }
        ];
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

    getLegacyMissionForPreset(presetId) {
        if (presetId === 'survivor') {
            return {
                presetId,
                id: 'survivor_guard',
                name: '守成试炼',
                desc: '本轮累计获得 40 点护盾',
                eventType: 'gainBlock',
                target: 40,
                progress: 0,
                completed: false,
                rewardEssence: 6,
                rewardGranted: false
            };
        }

        if (presetId === 'smith') {
            return {
                presetId,
                id: 'smith_forge',
                name: '锻意试炼',
                desc: '完成 1 次锻炉抉择',
                eventType: 'forgeComplete',
                target: 1,
                progress: 0,
                completed: false,
                rewardEssence: 6,
                rewardGranted: false
            };
        }

        if (presetId === 'tempo') {
            return {
                presetId,
                id: 'tempo_strike',
                name: '疾势试炼',
                desc: '触发 3 次首击增伤',
                eventType: 'tempoFirstStrike',
                target: 3,
                progress: 0,
                completed: false,
                rewardEssence: 6,
                rewardGranted: false
            };
        }

        if (presetId === 'entropy') {
            return {
                presetId,
                id: 'entropy_flux',
                name: '湮律试炼',
                desc: '触发 4 次弃牌共鸣',
                eventType: 'entropyDiscardProc',
                target: 4,
                progress: 0,
                completed: false,
                rewardEssence: 6,
                rewardGranted: false
            };
        }

        if (presetId === 'bulwark') {
            return {
                presetId,
                id: 'bulwark_guard',
                name: '玄甲试炼',
                desc: '触发 4 次护势共鸣',
                eventType: 'bulwarkBlockProc',
                target: 4,
                progress: 0,
                completed: false,
                rewardEssence: 6,
                rewardGranted: false
            };
        }

        if (presetId === 'stormcraft') {
            return {
                presetId,
                id: 'stormcraft_chain',
                name: '霆策试炼',
                desc: '触发 4 次易伤破窗追击',
                eventType: 'stormcraftVulnerableProc',
                target: 4,
                progress: 0,
                completed: false,
                rewardEssence: 6,
                rewardGranted: false
            };
        }

        if (presetId === 'vitalweave') {
            return {
                presetId,
                id: 'vitalweave_mend',
                name: '回脉试炼',
                desc: '触发 4 次回生织脉',
                eventType: 'vitalweaveHealProc',
                target: 4,
                progress: 0,
                completed: false,
                rewardEssence: 6,
                rewardGranted: false
            };
        }

        return null;
    }

    normalizeLegacyProgress(raw) {
        const defaults = this.getLegacyDefaults();
        const source = raw && typeof raw === 'object' ? raw : {};
        const normalized = {
            essence: Math.max(0, Math.floor(Number(source.essence) || 0)),
            spent: Math.max(0, Math.floor(Number(source.spent) || 0)),
            upgrades: {},
            lastPreset: null,
            secondaryPreset: null
        };

        const inputUpgrades = source.upgrades && typeof source.upgrades === 'object' ? source.upgrades : {};
        (this.legacyUpgradeCatalog || []).forEach(def => {
            const level = Math.max(0, Math.floor(Number(inputUpgrades[def.id]) || 0));
            normalized.upgrades[def.id] = Math.min(def.maxLevel, level);
        });

        if (normalized.spent > normalized.essence) {
            normalized.spent = normalized.essence;
        }

        const validPresetIds = (this.getLegacyPresetCatalog ? this.getLegacyPresetCatalog() : [])
            .map(p => p.id);
        if (typeof source.lastPreset === 'string' && validPresetIds.includes(source.lastPreset)) {
            normalized.lastPreset = source.lastPreset;
        }
        if (
            typeof source.secondaryPreset === 'string' &&
            validPresetIds.includes(source.secondaryPreset) &&
            source.secondaryPreset !== normalized.lastPreset
        ) {
            normalized.secondaryPreset = source.secondaryPreset;
        }

        return { ...defaults, ...normalized };
    }

    loadLegacyProgress() {
        const defaults = this.getLegacyDefaults();
        if (typeof localStorage === 'undefined') return defaults;
        try {
            const raw = localStorage.getItem(this.legacyStorageKey);
            if (!raw) return defaults;
            return this.normalizeLegacyProgress(JSON.parse(raw));
        } catch (e) {
            console.warn('Legacy progress parse failed.', e);
            return defaults;
        }
    }

    saveLegacyProgress() {
        if (!this.legacyProgress) this.legacyProgress = this.getLegacyDefaults();
        this.legacyProgress = this.normalizeLegacyProgress(this.legacyProgress);
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem(this.legacyStorageKey, JSON.stringify(this.legacyProgress));
        } catch (e) {
            console.warn('Legacy progress save failed.', e);
        }
    }

    getLegacyUpgradeById(upgradeId) {
        if (!Array.isArray(this.legacyUpgradeCatalog)) return null;
        return this.legacyUpgradeCatalog.find(u => u.id === upgradeId) || null;
    }

    getLegacyUpgradeLevel(upgradeId) {
        if (!this.legacyProgress || !this.legacyProgress.upgrades) return 0;
        return Math.max(0, Math.floor(Number(this.legacyProgress.upgrades[upgradeId]) || 0));
    }

    getLegacyUpgradeCost(upgradeId, targetLevel = null) {
        const def = this.getLegacyUpgradeById(upgradeId);
        if (!def) return 0;
        const currentLevel = this.getLegacyUpgradeLevel(upgradeId);
        const level = targetLevel === null ? currentLevel + 1 : targetLevel;
        if (level < 1 || level > def.maxLevel) return 0;
        return def.costs[level - 1] || 0;
    }

    getLegacyUnspentEssence() {
        if (!this.legacyProgress) return 0;
        return Math.max(0, (this.legacyProgress.essence || 0) - (this.legacyProgress.spent || 0));
    }

    getLegacyBonuses() {
        const bonuses = {
            startMaxHp: 0,
            startGold: 0,
            startDraw: 0,
            firstTurnDrawBonus: 0,
            forgeCostDiscount: 0
        };

        (this.legacyUpgradeCatalog || []).forEach(def => {
            const level = this.getLegacyUpgradeLevel(def.id);
            if (!level || !def.effects) return;
            Object.keys(def.effects).forEach(key => {
                bonuses[key] = (bonuses[key] || 0) + (def.effects[key] * level);
            });
        });

        bonuses.forgeCostDiscount = Math.min(0.35, bonuses.forgeCostDiscount);
        return bonuses;
    }

    applyLegacyRunDoctrine(player, presetId = null, secondaryPresetId = null) {
        if (!player) return;

        const p1Id = presetId || this.legacyProgress?.lastPreset || null;
        const p2Id = secondaryPresetId !== undefined && secondaryPresetId !== null
            ? secondaryPresetId
            : (this.legacyProgress?.secondaryPreset || null);

        const d1 = this.getLegacyRunDoctrineForPreset(p1Id);
        const d2 = this.getLegacyRunDoctrineForPreset(p2Id);

        const merged = { ...d1 };
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
        const mission = this.getLegacyMissionForPreset(presetId);
        player.legacyRunMission = mission ? { ...mission } : null;
    }

    handleLegacyMissionProgress(eventType, amount = 1) {
        if (!this.player || !this.player.legacyRunMission) return false;
        const mission = this.player.legacyRunMission;
        if (mission.completed) return false;
        if (mission.eventType !== eventType) return false;

        const delta = Math.max(0, Number(amount) || 0);
        if (delta <= 0) return false;
        const beforeProgress = Math.max(0, Number(mission.progress) || 0);
        mission.progress = Math.min(mission.target, beforeProgress + delta);

        const target = Math.max(1, Number(mission.target) || 1);
        const checkpoints = [0.25, 0.5, 0.75];
        const beforeRatio = beforeProgress / target;
        const afterRatio = mission.progress / target;

        const shouldBroadcastProgress =
            target <= 5 ||
            checkpoints.some(cp => beforeRatio < cp && afterRatio >= cp);
        if (shouldBroadcastProgress && !mission.completed && typeof Utils !== 'undefined' && Utils.showBattleLog) {
            Utils.showBattleLog(`传承试炼进度：${mission.name} ${mission.progress}/${mission.target}`);
        }

        if (mission.progress >= mission.target) {
            mission.completed = true;
            if (!mission.rewardGranted) {
                mission.rewardGranted = true;
                this.awardLegacyEssence(
                    mission.rewardEssence || 0,
                    `完成传承试炼：${mission.name}`
                );
                if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
                    Utils.showBattleLog(`传承试炼达成：${mission.name}`);
                }
            }
        }

        if (typeof this.refreshLegacyMissionTrackers === 'function') {
            this.refreshLegacyMissionTrackers();
        }
        return true;
    }

    refreshLegacyMissionTrackers() {
        if (this.battle && this.currentScreen === 'battle-screen' && typeof this.battle.updateLegacyMissionTracker === 'function') {
            this.battle.updateLegacyMissionTracker();
        }
        if (this.map && this.currentScreen === 'map-screen' && typeof this.map.updateLegacyMissionTracker === 'function') {
            this.map.updateLegacyMissionTracker();
        }
    }

    applyLegacyBonusesToPlayer(player, bonuses = null) {
        if (!player) return;
        const finalBonuses = bonuses || this.getLegacyBonuses();
        player.legacyBonuses = { ...finalBonuses };

        if (typeof player.recalculateStats === 'function') {
            player.recalculateStats();
        }

        if (finalBonuses.startGold > 0) {
            player.gold += finalBonuses.startGold;
        }
        if (finalBonuses.startMaxHp > 0) {
            player.currentHp = player.maxHp;
        }
    }

    awardLegacyEssence(amount, reason = '轮回感悟', options = {}) {
        const gain = Math.max(0, Math.floor(Number(amount) || 0));
        if (gain <= 0) return 0;
        if (!this.legacyProgress) this.legacyProgress = this.getLegacyDefaults();

        this.legacyProgress.essence = (this.legacyProgress.essence || 0) + gain;
        this.lastLegacyGain = gain;
        this.saveLegacyProgress();

        if (!options.silent && typeof Utils !== 'undefined' && Utils.showBattleLog) {
            Utils.showBattleLog(`【传承】${reason}：轮回精粹 +${gain}`);
        }

        return gain;
    }

    buyLegacyUpgrade(upgradeId, options = {}) {
        if (!this.legacyProgress || typeof this.legacyProgress !== 'object') {
            this.legacyProgress = this.getLegacyDefaults();
        }
        if (!this.legacyProgress.upgrades || typeof this.legacyProgress.upgrades !== 'object') {
            this.legacyProgress.upgrades = {};
        }

        const def = this.getLegacyUpgradeById(upgradeId);
        if (!def) return false;

        const currentLevel = this.getLegacyUpgradeLevel(upgradeId);
        if (currentLevel >= def.maxLevel) return false;

        const cost = this.getLegacyUpgradeCost(upgradeId, currentLevel + 1);
        if (this.getLegacyUnspentEssence() < cost) return false;

        this.legacyProgress.upgrades[upgradeId] = currentLevel + 1;
        this.legacyProgress.spent = (this.legacyProgress.spent || 0) + cost;
        this.saveLegacyProgress();

        if (!options.silent && typeof Utils !== 'undefined' && Utils.showBattleLog) {
            Utils.showBattleLog(`传承提升：${def.name} Lv.${currentLevel + 1}`);
        }
        return true;
    }

    applyLegacyPreset(presetId, options = {}) {
        if (!this.legacyProgress || typeof this.legacyProgress !== 'object') {
            this.legacyProgress = this.getLegacyDefaults();
        }
        if (!this.legacyProgress.upgrades || typeof this.legacyProgress.upgrades !== 'object') {
            this.legacyProgress.upgrades = {};
        }

        const presets = this.getLegacyPresetCatalog();
        const preset = presets.find(p => p.id === presetId);
        if (!preset && presetId !== null) return { success: false, reason: 'preset_not_found', allocated: 0 };

        const isSecondary = options.isSecondary;

        if (presetId === null) {
            if (isSecondary) this.legacyProgress.secondaryPreset = null;
            else this.legacyProgress.lastPreset = null;
        } else {
            if (isSecondary) {
                if (this.legacyProgress.lastPreset === preset.id) {
                    this.legacyProgress.lastPreset = null; // Cannot be both
                }
                this.legacyProgress.secondaryPreset = preset.id;
            } else {
                if (this.legacyProgress.secondaryPreset === preset.id) {
                    this.legacyProgress.secondaryPreset = null;
                }
                this.legacyProgress.lastPreset = preset.id;
            }
        }

        // P1 重构：根据主副道统重新分配精粹
        this.legacyProgress.spent = 0;
        this.legacyProgress.upgrades = {};

        const beforeSpent = 0;
        let changed = true;

        // 1. 先满足主道统
        const p1 = presets.find(p => p.id === this.legacyProgress.lastPreset);
        if (p1) {
            changed = true;
            while (changed) {
                changed = false;
                for (const upgradeId of p1.priority) {
                    if (this.buyLegacyUpgrade(upgradeId, { silent: true })) changed = true;
                }
            }
        }

        // 2. 再满足副道统 (使用剩余精粹)
        const p2 = presets.find(p => p.id === this.legacyProgress.secondaryPreset);
        if (p2) {
            changed = true;
            while (changed) {
                changed = false;
                for (const upgradeId of p2.priority) {
                    if (this.buyLegacyUpgrade(upgradeId, { silent: true })) changed = true;
                }
            }
        }

        this.saveLegacyProgress();
        const allocated = this.legacyProgress.spent || 0;

        if (typeof Utils !== 'undefined' && Utils.showBattleLog && preset) {
            Utils.showBattleLog(`已装备道统【${preset.name}】(${isSecondary ? '副' : '主'})，共投入 ${allocated} 精粹`);
        }
        return { success: true, allocated, preset };
    }

    resetLegacyUpgrades() {
        if (!this.legacyProgress || (this.legacyProgress.spent || 0) <= 0) return;

        this.showConfirmModal(
            '重置传承将返还全部已投入精粹，是否继续？',
            () => {
                this.legacyProgress.spent = 0;
                this.legacyProgress.upgrades = {};
                this.saveLegacyProgress();
                this.initInheritanceScreen();
                if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
                    Utils.showBattleLog('传承已重置，全部精粹已返还。');
                }
            }
        );
    }

    showLegacyScreen() {
        this.showScreen('inheritance-screen');
    }

    initInheritanceScreen() {
        if (!this.legacyProgress || typeof this.legacyProgress !== 'object') {
            this.legacyProgress = this.loadLegacyProgress();
        }
        this.legacyProgress = this.normalizeLegacyProgress(this.legacyProgress);

        const summary = document.getElementById('inheritance-summary');
        const presetsEl = document.getElementById('inheritance-presets');
        const grid = document.getElementById('inheritance-upgrade-grid');
        const note = document.getElementById('inheritance-run-note');
        if (!summary || !grid) return;

        const total = this.legacyProgress?.essence || 0;
        const spent = this.legacyProgress?.spent || 0;
        const unspent = this.getLegacyUnspentEssence();
        const bonuses = this.getLegacyBonuses();

        summary.innerHTML = `
            <div class="inheritance-stat">
                <span class="label">轮回精粹</span>
                <span class="value">${total}</span>
            </div>
            <div class="inheritance-stat">
                <span class="label">可分配</span>
                <span class="value highlight">${unspent}</span>
            </div>
            <div class="inheritance-stat">
                <span class="label">已投入</span>
                <span class="value">${spent}</span>
            </div>
        `;

        const activePresetId = this.legacyProgress?.lastPreset || null;
        const secondaryPresetId = this.legacyProgress?.secondaryPreset || null;
        const presetDefs = this.getLegacyPresetCatalog();
        const activePreset = presetDefs.find(p => p.id === activePresetId);
        const secondaryPreset = presetDefs.find(p => p.id === secondaryPresetId);
        if (note) {
            const presetText = activePreset ? `｜主道统：${activePreset.name}` : '';
            const secText = secondaryPreset ? `｜副道统：${secondaryPreset.name} (50%效能)` : '';
            const mission = this.getLegacyMissionForPreset(activePresetId);
            const missionText = mission ? `｜本轮试炼：${mission.desc}` : '';
            note.textContent = `当前加成：开局HP +${bonuses.startMaxHp}｜开局灵石 +${bonuses.startGold}｜抽牌 +${bonuses.startDraw}｜首回合额外抽牌 +${bonuses.firstTurnDrawBonus}｜锻炉减耗 ${Math.round((bonuses.forgeCostDiscount || 0) * 100)}%${presetText}${secText}${missionText}｜提示：右键可将道统装备为副道统`;
        }

        if (presetsEl) {
            presetsEl.innerHTML = '';
            presetDefs.forEach(preset => {
                const btn = document.createElement('button');
                const isPrimary = activePresetId === preset.id;
                const isSecondary = secondaryPresetId === preset.id;
                let activeClass = '';
                if (isPrimary) activeClass = 'active';
                if (isSecondary) activeClass = 'active secondary';

                btn.className = `inheritance-preset-btn ${activeClass}`;
                btn.innerHTML = `
                    <span class="icon">${preset.icon}</span>
                    <span class="name">${preset.name} ${isPrimary ? '(主)' : isSecondary ? '(副)' : ''}</span>
                    <span class="desc">${preset.desc}</span>
                `;
                btn.onclick = () => {
                    this.showConfirmModal(
                        `装备【${preset.name}】为主道统将重配当前传承投入，是否继续？`,
                        () => {
                            this.applyLegacyPreset(preset.id, { isSecondary: false });
                            this.initInheritanceScreen();
                        }
                    );
                };
                btn.oncontextmenu = (event) => {
                    event.preventDefault();
                    this.showConfirmModal(
                        `装备【${preset.name}】为副道统（50%效能）将重配当前传承投入，是否继续？`,
                        () => {
                            this.applyLegacyPreset(preset.id, { isSecondary: true });
                            this.initInheritanceScreen();
                        }
                    );
                };
                presetsEl.appendChild(btn);
            });
        }

        grid.innerHTML = '';
        (this.legacyUpgradeCatalog || []).forEach(def => {
            const level = this.getLegacyUpgradeLevel(def.id);
            const canLevel = level < def.maxLevel;
            const nextCost = this.getLegacyUpgradeCost(def.id, level + 1);
            const affordable = canLevel && unspent >= nextCost;

            const card = document.createElement('div');
            card.className = `inheritance-card ${canLevel ? '' : 'maxed'}`;
            card.innerHTML = `
                <div class="inheritance-card-header">
                    <div class="icon">${def.icon}</div>
                    <div class="meta">
                        <div class="name">${def.name}</div>
                        <div class="level">Lv.${level}/${def.maxLevel}</div>
                    </div>
                </div>
                <div class="inheritance-desc">${def.desc}</div>
                <div class="inheritance-card-footer">
                    <span class="cost">${canLevel ? `消耗 ${nextCost}` : '已满级'}</span>
                    <button class="menu-btn small ${affordable ? 'primary' : ''}" ${canLevel ? '' : 'disabled'}>
                        ${canLevel ? '投入精粹' : '已圆满'}
                    </button>
                </div>
            `;

            const btn = card.querySelector('button');
            if (btn && canLevel) {
                if (affordable) {
                    btn.onclick = () => {
                        if (this.buyLegacyUpgrade(def.id)) {
                            this.initInheritanceScreen();
                        }
                    };
                } else {
                    btn.disabled = true;
                }
            }

            grid.appendChild(card);
        });
    }

    tryShowMainMenuGuide() {
        if (!this.guideState || this.guideState.mainMenuIntroSeen) return;
        this.markGuideSeen('mainMenuIntroSeen');
        setTimeout(() => {
            Utils.showBattleLog('新手提示：先点“新的轮回”进入选角，游客模式也可直接开局。', {
                category: 'system',
                duration: 3400
            });
        }, 400);
    }

    showFirstBattleGuide() {
        if (!this.guideState || this.guideState.firstBattleGuideSeen) return;
        this.markGuideSeen('firstBattleGuideSeen');

        const tips = [
            '新手提示：先看敌方意图，再决定是进攻还是防御。',
            '新手提示：打完牌后，点击“结束回合”推进战斗。',
            '新手提示：按 L 可以打开战斗记录，复盘每次触发。'
        ];
        tips.forEach((msg, idx) => {
            setTimeout(() => {
                Utils.showBattleLog(msg, { category: 'system', duration: 2800 });
            }, idx * 1700);
        });
    }

    // 继续游戏
    continueGame() {
        console.log('[Debug] continueGame called');
        // 云功能可用时才强制登录
        if (typeof AuthService === 'undefined') {
            console.error('[Debug] AuthService missing');
            alert('登录系统未就绪，请刷新重试！(AuthService missing)');
            return;
        }
        if (AuthService.isCloudEnabled && AuthService.isCloudEnabled() && !AuthService.isLoggedIn()) {
            console.log('[Debug] Not logged in, showing modal');
            this.showLoginModal();
            return;
        }

        console.log('[Debug] Logged in. loadGameResult:', this.loadGameResult);
        if (this.loadGameResult) {
            console.log('[Debug] Calling showScreen("map-screen")');
            this.showScreen('map-screen');
        } else {
            // 如果加载失败（比如存档被手动删了），刷新页面或提示
            console.warn('[Debug] loadGameResult false, reloading');
            window.location.reload();
        }
    }



    // 绑定全局事件
    bindGlobalEvents() {
        if (this.boundGlobalEvents) return;
        this.boundGlobalEvents = true;

        // ESC关闭模态框
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                if (typeof Utils !== 'undefined' && Utils.toggleBattleLogPanel) {
                    Utils.toggleBattleLogPanel(false);
                }
                return;
            }

            const activeTag = document.activeElement ? document.activeElement.tagName : '';
            if (
                this.currentScreen === 'battle-screen'
                && (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA' && activeTag !== 'SELECT')
                && this.battle
                && typeof this.battle.handleTacticalAdvisorHotkey === 'function'
            ) {
                const consumed = this.battle.handleTacticalAdvisorHotkey(e.key);
                if (consumed) {
                    e.preventDefault();
                    return;
                }
            }

            if ((e.key === 'l' || e.key === 'L') && typeof Utils !== 'undefined' && Utils.toggleBattleLogPanel) {
                if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
                e.preventDefault();
                Utils.toggleBattleLogPanel();
            }
        });

        // 全局点击音效
        document.addEventListener('click', (e) => {
            // 如果点击的是按钮或包含在按钮内，或者是卡牌、菜单按钮、收藏项、角色卡片、关卡卡片
            if (e.target.closest('button') || e.target.closest('.card') || e.target.closest('.menu-btn') || e.target.closest('.collection-item') || e.target.closest('.character-card') || e.target.closest('.realm-card')) {
                // 如果没有被阻止传播
                if (typeof audioManager !== 'undefined') {
                    // 重要按钮播放确认音效
                    const targetBtn = e.target.closest('button');
                    const targetRealm = e.target.closest('.realm-card');

                    if ((targetBtn && (
                        targetBtn.id === 'new-game-btn' ||
                        targetBtn.id === 'confirm-character-btn' ||
                        targetBtn.id === 'end-turn-btn' ||
                        targetBtn.id === 'continue-game-btn' ||
                        targetBtn.classList.contains('primary')
                    )) || targetRealm) {
                        audioManager.playSFX('confirm');
                    } else {
                        // 普通点击
                        audioManager.playSFX('click');
                    }
                }
            }
        });

        // 点击模态框背景关闭
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    // FIX: 禁止点击没景关闭事件弹窗，防止无限刷经验
                    if (modal.id === 'event-modal') return;
                    this.closeModal();
                }
            });
        });

        // 牌堆点击
        document.getElementById('deck-pile')?.addEventListener('click', () => {
            this.showDeckModal('draw');
        });

        document.getElementById('discard-pile')?.addEventListener('click', () => {
            this.showDeckModal('discard');
        });
    }

    // 初始化动态背景
    initDynamicBackground() {
        // 如果存在当前背景图，使用图片背景
        this.updateRealmBackground(this.player.realm || 1);
    }

    // 更新天域背景
    updateRealmBackground(realm) {
        // 确保 default 为 1
        realm = realm || 1;

        // 查找是否有对应的背景图
        // 映射规则：1-3重天有专属图
        let bgImage = '';
        if (realm === 1) bgImage = 'assets/images/realms/realm_bg_1.webp';
        else if (realm === 2) bgImage = 'assets/images/realms/realm_bg_2.webp';
        else if (realm === 3) bgImage = 'assets/images/realms/realm_bg_3.webp';
        else if (realm === 7) bgImage = 'assets/images/bg_realm_7.png';
        else if (realm === 8) bgImage = 'assets/images/bg_realm_8.png';
        else if (realm === 9) bgImage = 'assets/images/bg_realm_9.png';
        else if (realm === 10) bgImage = 'assets/images/bg_realm_10.png';
        else if (realm === 11) bgImage = 'assets/images/bg_realm_11.png';
        else if (realm === 12) bgImage = 'assets/images/bg_realm_12.png';
        else if (realm === 13) bgImage = 'assets/images/bg_realm_13.png';
        else if (realm === 14) bgImage = 'assets/images/bg_realm_14.png';
        else if (realm === 15) bgImage = 'assets/images/bg_realm_15.png';
        else if (realm === 16) bgImage = 'assets/images/bg_realm_16.png';
        else if (realm === 17) bgImage = 'assets/images/bg_realm_17.png';
        else if (realm === 18) bgImage = 'assets/images/bg_realm_18.png';

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

    // 保存游戏
    // 保存游戏
    saveGame() {
        try {
            const pvpEconomySnapshot = (typeof PVPService !== 'undefined'
                && PVPService
                && typeof PVPService.getEconomySnapshot === 'function')
                ? PVPService.getEconomySnapshot()
                : null;
            const gameState = {
                version: '5.1.0',
                player: this.player.getState(),
                map: {
                    nodes: this.map.nodes,
                    currentNodeIndex: this.map.currentNodeIndex,
                    completedNodes: this.map.completedNodes
                },
                unlockedRealms: this.unlockedRealms || [1],
                currentScreen: this.currentScreen,
                saveSlot: this.currentSaveSlot, // Persist the slot ID
                combatMeta: {
                    stance: this.player.stance || 'neutral',
                    ruleVersion: 'combat-v2',
                    battleUIUpdates: (this.performanceStats && this.performanceStats.battleUIUpdates) || 0
                },
                pvpMeta: {
                    ruleVersion: 'pvp-v2',
                    lastKnownDivision: (typeof PVPService !== 'undefined' && PVPService.currentRankData) ? PVPService.currentRankData.division : null,
                    economy: pvpEconomySnapshot
                },
                legacyProgress: this.legacyProgress,
                featureFlags: { ...this.featureFlags },
                endlessMeta: this.ensureEndlessState(),
                encounterMeta: this.ensureEncounterState(),
                schemaMigratedAt: Date.now(),
                timestamp: Date.now()
            };
            localStorage.setItem('theDefierSave', JSON.stringify(gameState));
            console.log('游戏已保存 (本地)');

            // 如果已登录，且知道当前的存档槽位，自动同步到云端
            // 防止 unset slot 默认为 0 覆盖了 Slot 1
            const targetSlot = this.currentSaveSlot;
            if (AuthService.isLoggedIn() && targetSlot !== null && targetSlot !== undefined) {
                AuthService.saveCloudData(gameState, targetSlot).then(res => {
                    if (res.success) {
                        console.log(`游戏已同步 (云端 Slot ${targetSlot})`);
                        // Update cache
                        this.cachedSlots[targetSlot] = gameState;
                        Utils.showBattleLog('游戏进度已保存到云端');
                    } else {
                        console.warn('云端同步失败', res);
                        Utils.showBattleLog('云端同步失败，仅保存本地');
                    }
                }).catch(err => {
                    console.error('Cloud save error:', err);
                });
            } else {
                // Local only warning if not logged in? No, silent is fine.
            }
        } catch (e) {
            console.error('Save Game Error:', e);
            Utils.showBattleLog('严重错误：存档失败！请检查存储空间');
        }
    }

    migrateSaveData(rawSave) {
        const migrated = rawSave && typeof rawSave === 'object' ? rawSave : {};
        const buildDefaultEndless = () => {
            if (typeof this.createDefaultEndlessState === 'function') {
                return this.createDefaultEndlessState();
            }
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
        };
        const buildDefaultEncounter = () => {
            if (typeof this.createDefaultEncounterState === 'function') {
                return this.createDefaultEncounterState();
            }
            return {
                battles: 0,
                wins: 0,
                currentStreakId: null,
                currentStreak: 0,
                maxStreak: 0,
                recentThemes: [],
                themeStats: {},
                totalBonusGold: 0,
                totalBonusExp: 0
            };
        };
        const normalizeLegacy = (source) => {
            const progress = source && typeof source === 'object' ? source : {};
            const essence = Math.max(0, Math.floor(Number(progress.essence) || 0));
            const spent = Math.max(0, Math.floor(Number(progress.spent) || 0));
            const upgrades = progress.upgrades && typeof progress.upgrades === 'object' ? progress.upgrades : {};
            return {
                essence,
                spent: Math.min(spent, essence),
                upgrades
            };
        };
        if (!migrated.version) {
            migrated.version = '5.0.0';
        }

        const isLegacy = migrated.version < '5.1.0';
        if (isLegacy) {
            migrated.combatMeta = migrated.combatMeta || {
                stance: migrated.player && migrated.player.stance ? migrated.player.stance : 'neutral',
                ruleVersion: 'combat-v2',
                battleUIUpdates: 0
            };
            migrated.pvpMeta = migrated.pvpMeta || {
                ruleVersion: 'pvp-v2',
                lastKnownDivision: null,
                economy: null
            };
            migrated.legacyProgress = normalizeLegacy(migrated.legacyProgress);
            migrated.featureFlags = { ...(this.featureFlags || {}), ...(migrated.featureFlags || {}) };
            migrated.endlessMeta = migrated.endlessMeta || buildDefaultEndless();
            migrated.encounterMeta = migrated.encounterMeta || buildDefaultEncounter();
            migrated.schemaMigratedAt = Date.now();
            migrated.version = '5.1.0';
        } else {
            migrated.combatMeta = migrated.combatMeta || {};
            migrated.pvpMeta = migrated.pvpMeta || {};
            if (!Object.prototype.hasOwnProperty.call(migrated.pvpMeta, 'economy')) {
                migrated.pvpMeta.economy = null;
            }
            migrated.legacyProgress = normalizeLegacy(migrated.legacyProgress);
            migrated.featureFlags = { ...(this.featureFlags || {}), ...(migrated.featureFlags || {}) };
            migrated.endlessMeta = migrated.endlessMeta || buildDefaultEndless();
            migrated.encounterMeta = migrated.encounterMeta || buildDefaultEncounter();
            migrated.schemaMigratedAt = migrated.schemaMigratedAt || Date.now();
        }

        if (typeof this.normalizeEndlessState === 'function') {
            migrated.endlessMeta = this.normalizeEndlessState(migrated.endlessMeta);
        }
        if (typeof this.normalizeEncounterState === 'function') {
            migrated.encounterMeta = this.normalizeEncounterState(migrated.encounterMeta);
        }

        return migrated;
    }

    // 加载游戏
    loadGame() {
        const savedData = localStorage.getItem('theDefierSave');
        if (!savedData) return false;

        try {
            let gameState = JSON.parse(savedData);
            gameState = this.migrateSaveData(gameState);
            this.legacyProgress = this.normalizeLegacyProgress(gameState.legacyProgress || this.legacyProgress);
            this.saveLegacyProgress();

            // 版本检查
            const currentVersion = '5.1.0';
            if (!gameState.version || gameState.version < '2.2.0') { // 兼容2.2.0存档
                console.log('检测到旧版本存档，已清除');
                this.clearSave();
                return false;
            }

            // 检查生命值，如果是0或更低，说明是死亡存档，直接清除
            if (!gameState.player || gameState.player.currentHp <= 0) {
                console.log('检测到死亡存档，已清除');
                this.clearSave();
                return false;
            }

            // 验证牌组数据
            if (!gameState.player.deck || !Array.isArray(gameState.player.deck) || gameState.player.deck.length < 5) {
                console.log('存档牌组数据无效，已清除存档');
                this.clearSave();
                return false;
            }

            // === 兼容性迁移 ===
            // 修复：无欲角色的 'goldenBell' 曾与通用卡牌ID冲突，现更名为 'goldenBellSkill'
            if (gameState.player.characterId === 'wuYu') {
                gameState.player.deck.forEach(card => {
                    if (card.id === 'goldenBell') {
                        card.id = 'goldenBellSkill';
                        console.log('Migration: Renamed Wu Yu goldenBell -> goldenBellSkill');
                    }
                });
            }

            // 恢复玩家状态
            Object.assign(this.player, gameState.player);
            // 存档防篡改与边界修正：关键数值统一钳制
            const clampInt = (value, min, max, fallback = min) => {
                const num = Number(value);
                if (!Number.isFinite(num)) return fallback;
                return Math.max(min, Math.min(max, Math.floor(num)));
            };
            this.player.maxHp = clampInt(this.player.maxHp, 1, 999999, 100);
            this.player.currentHp = clampInt(this.player.currentHp, 1, this.player.maxHp, this.player.maxHp);
            this.player.maxEnergy = clampInt(this.player.maxEnergy, 1, 99, 3);
            this.player.currentEnergy = clampInt(this.player.currentEnergy, 0, this.player.maxEnergy, this.player.maxEnergy);
            this.player.gold = clampInt(this.player.gold, 0, 999999999, 0);
            this.player.heavenlyInsight = clampInt(this.player.heavenlyInsight, 0, 999, 1);
            this.player.karma = clampInt(this.player.karma, 0, 999, 0);
            this.player.realm = clampInt(this.player.realm, 1, 18, 1);
            this.player.shopRumors = this.normalizeShopRumors(this.player.shopRumors);
            if (!this.player.buffs || typeof this.player.buffs !== 'object') this.player.buffs = {};
            if (!Array.isArray(this.player.deck)) this.player.deck = [];
            if (!Array.isArray(this.player.hand)) this.player.hand = [];
            if (!Array.isArray(this.player.drawPile)) this.player.drawPile = [];
            if (!Array.isArray(this.player.discardPile)) this.player.discardPile = [];

            if (!this.player.legacyBonuses || typeof this.player.legacyBonuses !== 'object') {
                this.player.legacyBonuses = {
                    startMaxHp: 0,
                    startGold: 0,
                    startDraw: 0,
                    firstTurnDrawBonus: 0,
                    forgeCostDiscount: 0
                };
            }
            if (!this.player.legacyRunDoctrine || typeof this.player.legacyRunDoctrine !== 'object') {
                this.applyLegacyRunDoctrine(
                    this.player,
                    this.legacyProgress?.lastPreset || null,
                    this.legacyProgress?.secondaryPreset || null
                );
            } else {
                this.applyLegacyRunDoctrine(
                    this.player,
                    this.player.legacyRunDoctrine.presetId || this.legacyProgress?.lastPreset || null,
                    this.legacyProgress?.secondaryPreset || null
                );
                const normalizedDoctrine = this.player.legacyRunDoctrine || {};
                const mergedDoctrine = {
                    ...normalizedDoctrine,
                    ...this.player.legacyRunDoctrine,
                    firstForgeBoostUsed: !!this.player.legacyRunDoctrine.firstForgeBoostUsed
                };
                mergedDoctrine.entropyLegacyProcEnabled = !!mergedDoctrine.entropyLegacyProcEnabled;
                mergedDoctrine.entropyProcUsedThisTurn = !!mergedDoctrine.entropyProcUsedThisTurn;
                mergedDoctrine.entropyBonusEnergyUsed = !!mergedDoctrine.entropyBonusEnergyUsed;
                mergedDoctrine.entropyLegacyDraw = Math.max(0, Math.floor(Number(mergedDoctrine.entropyLegacyDraw) || 0));
                mergedDoctrine.entropyLegacyDiscardDamage = Math.max(0, Math.floor(Number(mergedDoctrine.entropyLegacyDiscardDamage) || 0));
                mergedDoctrine.entropyBonusEnergyOnce = Math.max(0, Math.floor(Number(mergedDoctrine.entropyBonusEnergyOnce) || 0));
                mergedDoctrine.bulwarkLegacyProcEnabled = !!mergedDoctrine.bulwarkLegacyProcEnabled;
                mergedDoctrine.bulwarkProcUsedThisTurn = !!mergedDoctrine.bulwarkProcUsedThisTurn;
                mergedDoctrine.bulwarkLegacyDraw = Math.max(0, Math.floor(Number(mergedDoctrine.bulwarkLegacyDraw) || 0));
                mergedDoctrine.bulwarkLegacyCounterDamage = Math.max(0, Math.floor(Number(mergedDoctrine.bulwarkLegacyCounterDamage) || 0));
                mergedDoctrine.stormcraftLegacyProcEnabled = !!mergedDoctrine.stormcraftLegacyProcEnabled;
                mergedDoctrine.stormcraftProcUsedThisTurn = !!mergedDoctrine.stormcraftProcUsedThisTurn;
                mergedDoctrine.stormcraftLegacyBonusDamage = Math.max(0, Math.floor(Number(mergedDoctrine.stormcraftLegacyBonusDamage) || 0));
                mergedDoctrine.stormcraftLegacyDraw = Math.max(0, Math.floor(Number(mergedDoctrine.stormcraftLegacyDraw) || 0));
                mergedDoctrine.vitalweaveLegacyProcEnabled = !!mergedDoctrine.vitalweaveLegacyProcEnabled;
                mergedDoctrine.vitalweaveProcUsedThisTurn = !!mergedDoctrine.vitalweaveProcUsedThisTurn;
                mergedDoctrine.vitalweaveLegacyBlockRatio = Math.max(0, Math.min(2, Number(mergedDoctrine.vitalweaveLegacyBlockRatio) || 0));
                mergedDoctrine.vitalweaveLegacyBurstDamage = Math.max(0, Math.floor(Number(mergedDoctrine.vitalweaveLegacyBurstDamage) || 0));
                mergedDoctrine.vitalweaveLegacyDraw = Math.max(0, Math.floor(Number(mergedDoctrine.vitalweaveLegacyDraw) || 0));
                this.player.legacyRunDoctrine = mergedDoctrine;
            }
            if (!this.player.legacyRunMission || typeof this.player.legacyRunMission !== 'object') {
                this.applyLegacyRunMission(this.player, this.player.legacyRunDoctrine?.presetId || this.legacyProgress?.lastPreset || null);
            } else {
                const normalizedMission = this.getLegacyMissionForPreset(
                    this.player.legacyRunMission.presetId || this.player.legacyRunDoctrine?.presetId || this.legacyProgress?.lastPreset || null
                );
                if (normalizedMission) {
                    this.player.legacyRunMission = {
                        ...normalizedMission,
                        ...this.player.legacyRunMission,
                        progress: Math.max(0, Math.min(
                            normalizedMission.target,
                            Number(this.player.legacyRunMission.progress) || 0
                        )),
                        completed: !!this.player.legacyRunMission.completed,
                        rewardGranted: !!this.player.legacyRunMission.rewardGranted
                    };
                } else {
                    this.player.legacyRunMission = null;
                }
            }

            // 重新计算属性，确保版本更新后的加成生效
            // 并且防止旧存档中可能存在的错误叠加
            if (this.player.recalculateStats) {
                this.player.recalculateStats();
            }

            // 兼容性修复：确保法宝列表已初始化
            if (!this.player.treasures) {
                this.player.treasures = [];
            }
            if (!this.player.collectedLaws) {
                this.player.collectedLaws = [];
            } else {
                this.player.collectedLaws = this.player.collectedLaws.filter(Boolean);
            }

            // 数据修复
            if (isNaN(this.player.gold)) {
                this.player.gold = 100;
            }
            if (isNaN(this.player.currentHp) || this.player.currentHp <= 0) {
                this.player.currentHp = Math.floor(this.player.maxHp * 0.5);
            }

            // 恢复命环对象引用
            if (gameState.player.fateRing) {
                // Determine class based on type or character
                let RingClass = FateRing;
                if (gameState.player.fateRing.type === 'mutated') RingClass = MutatedRing;

                // ... logic handled by assign generally, but methods are lost.
                // ideally we re-instantiate, but for now assuming data structure is enough
                // as methods are on prototype. 
                // Wait, assign doesn't restore prototype. 
                // Currently code relies on this.player having methods, and we assign properties TO it.
                // So prototype methods are safe.


                // === 关键修复：数据解压与重建 (Rehydration) ===

                // 1. 重建卡牌 (Deck, Hand, Draw, Discard)
                const rebuildCard = (savedCard) => {
                    if (!savedCard || typeof savedCard !== 'object') return null;
                    const cardId = typeof savedCard.id === 'string' ? savedCard.id : null;
                    const baseCard = cardId ? CARDS[cardId] : null;
                    if (!baseCard) {
                        console.warn('Dropped unknown card from save:', savedCard.id);
                        return null;
                    }

                    const deepClone = (value) => JSON.parse(JSON.stringify(value));
                    let card = deepClone(baseCard);
                    const upgraded = !!savedCard.upgraded;
                    if (upgraded) {
                        if (typeof Utils.upgradeCard === 'function') {
                            card = Utils.upgradeCard(deepClone(baseCard));
                        } else if (typeof upgradeCard === 'function') {
                            card = upgradeCard(deepClone(baseCard));
                        } else {
                            card.upgraded = true;
                        }
                    }

                    // 仅恢复运行时安全字段，避免被存档注入任意卡牌数据
                    if (savedCard.instanceId !== undefined && savedCard.instanceId !== null) {
                        card.instanceId = savedCard.instanceId;
                    }
                    if (savedCard.retain === true) card.retain = true;
                    if (savedCard.exhaust === true) card.exhaust = true;
                    if (savedCard.isTemp === true) card.isTemp = true;
                    if (savedCard.ethereal === true) card.ethereal = true;

                    const safeCost = Number(savedCard.cost);
                    if (Number.isFinite(safeCost)) {
                        card.cost = Math.max(0, Math.min(10, Math.floor(safeCost)));
                    }
                    const safeBaseCost = Number(savedCard.baseCost);
                    if (Number.isFinite(safeBaseCost)) {
                        card.baseCost = Math.max(0, Math.min(10, Math.floor(safeBaseCost)));
                    }
                    if (card.instanceId === undefined || card.instanceId === null) {
                        card.instanceId = this.player.generateCardId
                            ? this.player.generateCardId()
                            : `${card.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    }
                    return card;
                };

                const hydrateCards = (list) => {
                    if (!Array.isArray(list)) return [];
                    return list.map(rebuildCard).filter(Boolean);
                };

                this.player.deck = hydrateCards(this.player.deck);
                this.player.hand = hydrateCards(this.player.hand);
                this.player.drawPile = hydrateCards(this.player.drawPile);
                this.player.discardPile = hydrateCards(this.player.discardPile);
                if (this.player.deck.length < 5) {
                    throw new Error('存档卡组校验失败：有效卡牌不足');
                }

                // 2. 重建法宝
                if (this.player.treasures) {
                    this.player.treasures = this.player.treasures.map(t => {
                        if (t.name) return t; // Old format
                        const baseT = TREASURES[t.id];
                        if (!baseT) return t;
                        return { ...baseT, ...t };
                    });
                }

                // 3. 重建法则
                if (this.player.collectedLaws) {
                    this.player.collectedLaws = this.player.collectedLaws.map(l => {
                        if (l.name) return l; // Old format
                        const baseL = LAWS[l.id];
                        return baseL || l;
                    });
                }
                if (gameState.player.fateRing.type === 'sealed') RingClass = SealedRing;
                if (gameState.player.fateRing.type === 'karma') RingClass = KarmaRing;
                if (gameState.player.fateRing.type === 'analysis') RingClass = AnalysisRing;

                // Migration: Fix permBuffs typo from old saves
                if (gameState.player.permBuffs && !gameState.player.permaBuffs) {
                    this.player.permaBuffs = gameState.player.permBuffs;
                }

                // Re-instantiate
                this.player.fateRing = new RingClass(this.player);
                this.player.fateRing.loadFromJSON(gameState.player.fateRing);

                // Check level up or initialization
                if (this.player.fateRing.checkLevelUp) {
                    this.player.fateRing.checkLevelUp();
                }

                // === 4. 重建法宝系统 (New System) ===
                // 初始化数组
                this.player.collectedTreasures = [];
                this.player.equippedTreasures = [];

                // 恢复收集库 (Collected)
                const hydrateTreasure = (savedT) => {
                    const baseT = TREASURES[savedT.id];
                    if (!baseT) {
                        console.warn('Unknown treasure:', savedT.id);
                        return savedT; // 未知法宝，保留原样
                    }
                    // 基础数据优先，只保留存档中的运行时数据
                    return {
                        ...baseT,           // 基础定义（icon, name, description, callbacks等）
                        id: savedT.id,
                        obtainedAt: savedT.obtainedAt || Date.now(),
                        data: savedT.data || (baseT.data ? { ...baseT.data } : {})
                    };
                };

                if (gameState.player.collectedTreasures) {
                    const hydrated = gameState.player.collectedTreasures.map(hydrateTreasure);
                    // 去重：保留最后获得的或者是第一个？应该根据ID去重
                    const uniqueMap = new Map();
                    hydrated.forEach(t => {
                        if (!uniqueMap.has(t.id)) {
                            uniqueMap.set(t.id, t);
                        } else {
                            // 如果已存在，可以检查是否需要合并数据的逻辑，但目前法宝没有复杂数据
                            // 简单的保留第一个即可
                            console.log(`Removed duplicate treasure: ${t.id}`);
                        }
                    });
                    this.player.collectedTreasures = Array.from(uniqueMap.values());
                } else if (gameState.player.treasures) {
                    // 兼容旧存档：旧treasures视为"已收集且已装备"
                    const hydrated = gameState.player.treasures.map(hydrateTreasure);
                    // 同样去重
                    const uniqueMap = new Map();
                    hydrated.forEach(t => {
                        if (!uniqueMap.has(t.id)) uniqueMap.set(t.id, t);
                    });
                    this.player.collectedTreasures = Array.from(uniqueMap.values());
                }

                // 恢复已装备 (Equipped)
                if (gameState.player.equippedTreasures) {
                    // 新存档: 存储的是ID列表
                    const uniqueEquippedIds = new Set(gameState.player.equippedTreasures);
                    uniqueEquippedIds.forEach(tid => {
                        // 兼容性：如果碰巧存的是对象（极其罕见），尝试取id
                        const id = (typeof tid === 'object' && tid.id) ? tid.id : tid;
                        const t = this.player.collectedTreasures.find(ct => ct.id === id);
                        if (t) this.player.equippedTreasures.push(t);
                    });
                } else if (gameState.player.treasures) {
                    // 兼容旧存档：将所有法宝放入收集库，只装备前N个
                    this.player.equippedTreasures = [...this.player.collectedTreasures];
                }

                // 修复：确保装备数量不超过槽位上限
                const maxSlots = this.player.getMaxTreasureSlots();
                if (this.player.equippedTreasures.length > maxSlots) {
                    console.log(`载入存档：装备法宝超限 (${this.player.equippedTreasures.length}/${maxSlots})，已自动调整`);
                    // 超出部分移回仓库（仍在 collectedTreasures 中，只是不在 equippedTreasures 中）
                    this.player.equippedTreasures = this.player.equippedTreasures.slice(0, maxSlots);
                }

                // Sync references
                this.player.treasures = this.player.equippedTreasures;

                // Fix: Robust Max Realm Logic - Prevent Regression
                const savedMax = gameState.player.maxRealmReached || 1;
                const derivedMax = Math.max(...(gameState.unlockedRealms || [1]), 1);
                // Always take the HIGHER value to prevent progress loss
                this.player.maxRealmReached = Math.max(savedMax, derivedMax, this.player.maxRealmReached || 1);
            }

            // Retroactive Skill Unlock (Fix for existing saves)
            // 确保旧存档中通过了天劫的玩家能解锁对应技能
            if (this.player.realm >= 5) this.player.unlockUltimate(1);
            if (this.player.realm >= 10) this.player.unlockUltimate(2);
            if (this.player.realm >= 15) this.player.unlockUltimate(3);
            if (this.player.realm >= 18) this.player.unlockUltimate(4);

            // Fix: Global Force Sync for Card Data Persistence
            // 强制同步卡牌数据：使用最新代码中的数值覆盖存档中的旧数据，解决旧存档数值不更新的问题
            if (this.player.deck) {
                this.player.deck = this.player.deck.map(savedCard => {
                    // 在最新卡牌库中查找定义
                    // 如果是初始数据中不存在的卡牌（生成的？），CARDS中可能找不到
                    const originalDef = CARDS[savedCard.id];

                    // 如果找不到（可能是移除的卡牌或特殊卡牌），则保持原样
                    if (!originalDef) return savedCard;

                    // 创建新副本
                    let newCard = JSON.parse(JSON.stringify(originalDef));

                    // 恢复状态: 升级
                    if (savedCard.upgraded) {
                        try {
                            // 重新执行升级逻辑，获取最新数值
                            if (typeof Utils.upgradeCard === 'function') {
                                newCard = Utils.upgradeCard(newCard);
                            } else if (typeof upgradeCard === 'function') {
                                newCard = upgradeCard(newCard);
                            } else {
                                newCard.upgraded = true;
                            }
                        } catch (e) {
                            console.warn(`Card upgrade sync failed for ${savedCard.name}:`, e);
                            return savedCard; // 出错则回退
                        }
                    }

                    // 理论上如果后续有其他动态属性（如“临时卡牌”标记等），应在此处合并
                    // 目前主要关注静态数值和升级状态

                    return newCard;
                });
            }

            // 恢复地图状态
            this.map.nodes = gameState.map.nodes;
            this.map.currentNodeIndex = gameState.map.currentNodeIndex;
            this.map.completedNodes = gameState.map.completedNodes;

            // 恢复当前的存档位索引 (修复刷新后无法同步到正确槽位的问题)
            if (this.currentSaveSlot === null && gameState.saveSlot !== undefined) {
                this.currentSaveSlot = gameState.saveSlot;
                console.log(`Recovered Save Slot ID from save file: ${this.currentSaveSlot}`);
                // Re-persist for session
                sessionStorage.setItem('currentSaveSlot', this.currentSaveSlot);
                localStorage.setItem('lastSaveSlot', this.currentSaveSlot);
            }

            this.unlockedRealms = gameState.unlockedRealms || [1];

            // 恢复界面：如果是战斗或奖励界面，因为临时数据未保存，强制回退到地图
            let savedScreen = gameState.currentScreen || 'map-screen';
            if (['battle-screen', 'reward-screen', 'game-over-screen'].includes(savedScreen)) {
                savedScreen = 'map-screen';
            }
            this.savedScreen = savedScreen;
            if (gameState.combatMeta && gameState.combatMeta.stance) {
                this.player.stance = gameState.combatMeta.stance;
            } else {
                this.player.stance = this.player.stance || 'neutral';
            }
            if (
                gameState.pvpMeta
                && gameState.pvpMeta.economy
                && typeof PVPService !== 'undefined'
                && PVPService
                && typeof PVPService.setEconomySnapshot === 'function'
            ) {
                PVPService.setEconomySnapshot(gameState.pvpMeta.economy);
            }
            this.featureFlags = { ...this.featureFlags, ...(gameState.featureFlags || {}) };
            this.endlessState = this.normalizeEndlessState(gameState.endlessMeta || this.endlessState);
            this.encounterState = this.normalizeEncounterState(gameState.encounterMeta || this.encounterState);
            if (this.player && typeof this.player.ensureAdventureBuffs === 'function') {
                this.player.ensureAdventureBuffs();
            }

            console.log('游戏已加载');
            return true;
        } catch (e) {
            console.error('加载存档失败:', e);
            this.clearSave();
            return false;
        }
    }

    // 清除存档
    clearSave() {
        localStorage.removeItem('theDefierSave');
    }

    // 自动保存
    autoSave() {
        this.saveGame();
    }

    // 初始化图鉴
    initCollection() {
        const lawGrid = document.getElementById('law-archive-grid');
        const resonanceList = document.getElementById('resonance-manual-list');
        const summaryEl = document.getElementById('law-codex-summary');
        const resonanceSummaryEl = document.getElementById('law-codex-resonance-summary');

        // 确保容器存在
        if (!lawGrid || !resonanceList) {
            console.warn('New Codex UI structure not found.');
            return;
        }

        const allLawIds = Object.keys(LAWS || {});
        const totalLawCount = allLawIds.length;
        const collectedLawCount = allLawIds.filter((lawId) => this.player.collectedLaws.some((law) => law.id === lawId)).length;
        const totalResonanceCount = (typeof LAW_RESONANCES !== 'undefined' && LAW_RESONANCES)
            ? Object.keys(LAW_RESONANCES).length
            : 0;
        const activeResonanceCount = Array.isArray(this.player.activeResonances) ? this.player.activeResonances.length : 0;
        const lawProgress = totalLawCount > 0 ? Math.round((collectedLawCount / totalLawCount) * 100) : 0;

        if (summaryEl) {
            summaryEl.innerHTML = [
                '<span class="codex-side-kicker">收集总览</span>',
                '<h3>法则收藏进度</h3>',
                `<div class="codex-summary-metric"><strong>${collectedLawCount}</strong><span>/ ${totalLawCount} 已收录</span></div>`,
                `<div class="codex-progress-track"><div class="codex-progress-fill" style="width:${lawProgress}%"></div></div>`,
                '<ul class="codex-side-list compact">',
                `<li>完成度 ${lawProgress}% · 越接近满库，共鸣路线越完整。</li>`,
                '<li>未收录法则会保留在主区，便于直观看到缺口。</li>',
                '</ul>'
            ].join('');
        }

        if (resonanceSummaryEl) {
            resonanceSummaryEl.innerHTML = [
                '<span class="codex-side-kicker">当前共鸣</span>',
                '<h3>羁绊装配</h3>',
                '<div class="codex-summary-grid two-cols">',
                `<div class="codex-summary-chip"><strong>${activeResonanceCount}</strong><span>激活中</span></div>`,
                `<div class="codex-summary-chip"><strong>${totalResonanceCount}</strong><span>总条目</span></div>`,
                '</div>',
                '<p class="codex-side-note">优先补齐同元素法则，可更快点亮主力共鸣链。</p>'
            ].join('');
        }

        // --- 1. 渲染法则库 (Jade Slips) ---
        lawGrid.innerHTML = '';

        for (const lawId in LAWS) {
            const law = LAWS[lawId];
            const collected = this.player.collectedLaws.some(l => l.id === lawId);

            const item = document.createElement('div');
            item.className = `law-item ${collected ? '' : 'locked'}`;

            // 构建内容
            let contentHtml = '';

            // Dao Type Mapping based on Rarity
            let daoType = '小道';
            if (law.rarity === 'legendary') daoType = '无上大道';
            else if (law.rarity === 'epic') daoType = '三千大道';
            else daoType = '旁门小道';

            // 密封层 (Locked)
            if (!collected) {
                contentHtml += `<div class="law-seal-overlay">封</div>`;
            }

            contentHtml += `
                <div class="law-icon-wrapper">${collected ? law.icon : '?'}</div>
                <div class="law-name">${collected ? law.name : '？？？'}</div>
                <div class="law-type-tag ${law.rarity}">${daoType}</div>
            `;

            item.innerHTML = contentHtml;

            if (collected) {
                // 点击查看详情
                item.addEventListener('click', () => {
                    // 尝试获取被动效果描述
                    let passiveText = '';
                    if (typeof getLawPassiveDescription === 'function') {
                        passiveText = getLawPassiveDescription(law);
                    } else if (law.passive) {
                        passiveText = `被动: ${law.passive.type} ${law.passive.value}`;
                    }

                    let detailMsg = `${law.description}`;
                    if (passiveText) {
                        detailMsg += `\n\n🔎 被动效果:\n${passiveText}`;
                    }
                    this.showLawDetail(law, true);
                });
            } else {
                item.addEventListener('click', () => {
                    this.showLawDetail(law, false);
                });
            }

            lawGrid.appendChild(item);
        }

        // --- 2. 渲染共鸣手册 (Bamboo Scrolls) ---
        resonanceList.innerHTML = '';

        if (typeof LAW_RESONANCES === 'undefined') {
            resonanceList.innerHTML = '<div style="padding:20px; color:#666;">暂无记载</div>';
            return;
        }

        for (const resKey in LAW_RESONANCES) {
            const res = LAW_RESONANCES[resKey];

            const isActive = this.player.activeResonances && this.player.activeResonances.some(r => r.id === res.id);

            const resScroll = document.createElement('div');
            resScroll.className = `resonance-item ${isActive ? 'active' : ''}`;

            // 构建法则组件图标 + 名称列表
            let componentsHtml = '';
            let reqNames = [];

            if (res.laws) {
                componentsHtml = res.laws.map(lawId => {
                    const l = LAWS[lawId];
                    // 在图鉴中，如果玩家收集过该法则，则点亮该组件
                    const hasLaw = this.player.collectedLaws.some(cl => cl.id === lawId);

                    if (l) reqNames.push(l.name);

                    return `
                        <div class="res-component-icon ${hasLaw ? 'has-law' : ''}" title="${l ? l.name : lawId}">
                            ${l ? l.icon : '?'}
                        </div>
                    `;
                }).join('');
            }

            resScroll.innerHTML = `
                <div class="resonance-info">
                    <div class="resonance-title">
                        ${res.name}
                        ${isActive ? '<span style="color:var(--accent-gold); font-size:1rem; margin-left:10px;">(当前激活)</span>' : ''}
                    </div>
                    <div class="resonance-reqs">
                        <span style="color:#666; font-size:0.9rem;">所需法则: </span>
                        <span style="color:var(--accent-gold); font-size:0.9rem;">${reqNames.join(' + ')}</span>
                    </div>
                    <div class="resonance-desc">${res.description}</div>
                    <div class="resonance-effect">📜 效果: ${this.formattingResonanceEffect(res.effect)}</div>
                </div>
                <div class="resonance-components">
                    ${componentsHtml}
                </div>
            `;

            resonanceList.appendChild(resScroll);
        }
    }

    getLawElementLabel(element) {
        const map = { thunder: '雷', fire: '火', sword: '剑', space: '空间', time: '时间', void: '虚空', chaos: '混沌', blood: '血', earth: '土', wind: '风', ice: '冰', life: '生命', metal: '金', karma: '因果', reversal: '逆转', wood: '木' };
        return map[element] || (element || '未知');
    }

    getLawRarityText(rarity) {
        const map = { common: '凡品法则', rare: '灵品法则', epic: '神品法则', legendary: '仙品法则', mythic: '无上法则' };
        return map[rarity] || '未知品级';
    }

    getLawSource(law) {
        const rarity = law?.rarity || 'rare';
        switch (rarity) {
            case 'common': return '战斗结算中的法则盗取 · 低阶试炼敌人残响';
            case 'rare': return '战斗结算中的法则盗取 · 精英敌人与遭遇词缀更易携带';
            case 'epic': return '高阶战斗结算中的法则盗取 · 精英/Boss 残响更容易显化';
            case 'legendary':
            case 'mythic': return '高压战局中的法则盗取 · 需围绕强敌或特殊轮段反复尝试';
            default: return '战斗结算中的法则盗取';
        }
    }

    getLawRelatedResonances(law) {
        if (!law || typeof LAW_RESONANCES === 'undefined' || !LAW_RESONANCES) return [];
        return Object.values(LAW_RESONANCES).filter((resonance) => Array.isArray(resonance.laws) && resonance.laws.includes(law.id));
    }

    getLawResonanceAvailability(law) {
        const relatedResonances = this.getLawRelatedResonances(law);
        const collectedIds = new Set(
            Array.isArray(this.player?.collectedLaws)
                ? this.player.collectedLaws.map((entry) => entry?.id).filter(Boolean)
                : []
        );
        const socketedIds = new Set(
            this.player?.fateRing && typeof this.player.fateRing.getSocketedLaws === 'function'
                ? this.player.fateRing.getSocketedLaws().filter(Boolean)
                : []
        );

        return relatedResonances.map((resonance) => {
            const requiredLaws = Array.isArray(resonance?.laws) ? resonance.laws.filter(Boolean) : [];
            const missingCollected = requiredLaws.filter((lawId) => !collectedIds.has(lawId));
            const missingSocketed = requiredLaws.filter((lawId) => !socketedIds.has(lawId));
            let state = 'locked';
            let label = '未成型';
            let detail = '当前尚未收齐共鸣所需法则。';

            if (missingSocketed.length === 0 && requiredLaws.length > 0) {
                state = 'active';
                label = '已激活';
                detail = '当前命环已装配完整组件，可直接享受这条共鸣。';
            } else if (missingCollected.length === 0 && requiredLaws.length > 0) {
                state = 'ready';
                label = '待装配';
                detail = missingSocketed.length === 1
                    ? '已收齐共鸣组件，只差 1 枚法则装入命环。'
                    : `已收齐共鸣组件，仍有 ${missingSocketed.length} 枚法则未装入命环。`;
            } else if (missingCollected.length === 1) {
                state = 'near';
                label = '差 1 枚';
                detail = `只差 ${LAWS?.[missingCollected[0]]?.name || missingCollected[0]}，即可形成完整共鸣。`;
            } else if (missingCollected.length > 1) {
                label = `差 ${missingCollected.length} 枚`;
                detail = `仍需补齐 ${missingCollected.map((lawId) => LAWS?.[lawId]?.name || lawId).join('、')}。`;
            }

            return {
                resonance,
                requiredLaws,
                missingCollected,
                missingSocketed,
                state,
                label,
                detail
            };
        });
    }


    getLawReadinessActions(entry) {
        if (!entry || !entry.resonance) return [];
        const actions = [];
        if (entry.state === 'active' || entry.state === 'ready') {
            actions.push({
                type: 'ring',
                resonanceId: entry.resonance.id,
                label: entry.state === 'active' ? '定位命环共鸣' : '前往命环装配'
            });
        }
        entry.missingCollected.forEach((lawId) => {
            actions.push({
                type: 'law',
                lawId,
                label: `查看${LAWS?.[lawId]?.name || lawId}`
            });
        });
        return actions;
    }

    handleLawReadinessAction(actionType, resonanceId = '', lawId = '') {
        if (actionType === 'law' && lawId && typeof LAWS !== 'undefined' && LAWS?.[lawId]) {
            const law = LAWS[lawId];
            const collected = Array.isArray(this.player?.collectedLaws)
                ? this.player.collectedLaws.some((entry) => entry?.id === lawId)
                : false;
            this.showLawDetail(law, collected);
            return;
        }
        if (actionType === 'ring' && resonanceId) {
            this.closeModal();
            this.showFateRing();
            this.focusRingResonance(resonanceId);
        }
    }

    focusRingResonance(resonanceId = '') {
        if (!resonanceId || typeof LAW_RESONANCES === 'undefined' || !LAW_RESONANCES?.[resonanceId]) return false;
        const resonance = LAW_RESONANCES[resonanceId];
        const modal = document.getElementById('ring-modal');
        if (!modal) return false;
        const resonanceTab = modal.querySelector('.panel-tabs .tab:nth-child(2)');
        if (resonanceTab) {
            this.switchRingTab(resonanceTab, 'resonance');
        }
        document.querySelectorAll('.resonance-card.focus-target').forEach((card) => card.classList.remove('focus-target'));
        const targetCard = document.querySelector(`.resonance-card[data-resonance-id="${resonanceId}"]`);
        if (targetCard) {
            targetCard.classList.add('focus-target');
            targetCard.scrollIntoView({ block: 'center', behavior: 'auto' });
        }

        document.querySelectorAll('.ring-slot-3d.focus-target, .law-item-row.focus-target').forEach((el) => el.classList.remove('focus-target'));
        const ring = this.player?.fateRing;
        if (!ring || !Array.isArray(ring.slots)) return true;
        const socketed = typeof ring.getSocketedLaws === 'function' ? ring.getSocketedLaws() : [];
        const missingSocketed = (resonance.laws || []).filter((lawId) => !socketed.includes(lawId));
        let targetSlotIndex = -1;
        if (missingSocketed.length > 0) {
            targetSlotIndex = ring.slots.findIndex((slot) => slot?.unlocked && !slot?.law);
        }
        if (targetSlotIndex === -1) {
            targetSlotIndex = ring.slots.findIndex((slot) => resonance.laws.includes(slot?.law));
        }
        if (targetSlotIndex >= 0) {
            this.selectedRingSlot = targetSlotIndex;
            this.updateUIState(ring);
            const slotEl = document.getElementById(`ring-slot-${targetSlotIndex}`);
            if (slotEl) {
                slotEl.classList.add('focus-target');
                slotEl.scrollIntoView({ block: 'center', behavior: 'auto' });
            }
        }
        return true;
    }

    showLawDetail(law, isCollected = false) {
        const modal = document.getElementById('law-detail-modal');
        if (!modal || !law) return;
        const iconEl = document.getElementById('law-detail-icon');
        const captionEl = document.getElementById('law-detail-caption');
        const nameEl = document.getElementById('law-detail-name');
        const rarityEl = document.getElementById('law-detail-rarity');
        const descEl = document.getElementById('law-detail-desc');
        const passiveEl = document.getElementById('law-detail-passive');
        const linksEl = document.getElementById('law-detail-links');
        const sourceEl = document.getElementById('law-detail-source');
        const chipsEl = document.getElementById('law-detail-chips');
        const noteEl = document.getElementById('law-detail-note');
        const headerEl = document.getElementById('law-detail-header');
        const stageEl = document.getElementById('law-detail-stage');
        const readinessEl = document.getElementById('law-detail-readiness');
        if (!iconEl || !nameEl || !headerEl || !chipsEl) return;

        const rarity = law.rarity || 'rare';
        const passiveText = typeof getLawPassiveDescription === 'function' ? getLawPassiveDescription(law) : (law.description || '未知效果');
        const relatedResonances = this.getLawRelatedResonances(law);
        const readinessList = this.getLawResonanceAvailability(law);
        const unlockCards = Array.isArray(law.unlockCards) ? law.unlockCards.filter(Boolean) : [];
        const activeResonanceCount = readinessList.filter((entry) => entry.state === 'active').length;
        const readyResonanceCount = readinessList.filter((entry) => entry.state === 'ready').length;

        headerEl.className = 'detail-header';
        headerEl.classList.add(`rarity-${rarity}`);
        stageEl.classList.toggle('locked', !isCollected);
        iconEl.textContent = isCollected ? (law.icon || '📜') : '❔';
        nameEl.textContent = isCollected ? law.name : '未解法则';
        rarityEl.textContent = this.getLawRarityText(rarity);
        captionEl.textContent = isCollected ? `${this.getLawElementLabel(law.element)}属性残响已被识别` : '法则仍被迷雾遮蔽，需要先在战斗中盗取';
        descEl.innerHTML = isCollected ? law.description : '你只能感知到一缕残响。完成战斗并触发法则盗取，才能彻底辨识它的结构。';
        passiveEl.textContent = isCollected ? passiveText : '尚未掌握，无法完整解析其被动结构。';
        sourceEl.textContent = this.getLawSource(law);
        chipsEl.innerHTML = [
            `<span class="detail-status-chip ${isCollected ? 'owned' : 'locked'}">${isCollected ? '已掌握' : '未掌握'}</span>`,
            `<span class="detail-status-chip">${this.getLawElementLabel(law.element)}属性</span>`,
            `<span class="detail-status-chip rarity-chip rarity-${rarity}">${this.getLawRarityText(rarity)}</span>`
        ].join('');
        if (activeResonanceCount > 0) {
            noteEl.textContent = '当前命环已点亮相关共鸣，可直接围绕主区被动与解锁内容继续构筑。';
        } else if (readyResonanceCount > 0) {
            noteEl.textContent = '你已收齐相关组件，只差把法则装入命环；可优先调整命环再看牌组联动。';
        } else {
            noteEl.textContent = isCollected
                ? '先看右侧状态与元素，再回到主区确认被动和可解锁内容。'
                : '当前更重要的是获取路径，掌握后再决定是否围绕它补共鸣。';
        }

        const relatedText = [];
        if (relatedResonances.length > 0) {
            relatedText.push(`关联共鸣：${relatedResonances.map((res) => res.name).join(' ｜ ')}`);
        }
        if (unlockCards.length > 0) {
            relatedText.push(`解锁卡牌：${unlockCards.join(' ｜ ')}`);
        }
        if (relatedText.length === 0) {
            relatedText.push(isCollected ? '当前未记录到额外共鸣或解锁卡牌。' : '掌握后可查看它能点亮的共鸣与卡牌。');
        }
        linksEl.innerHTML = relatedText.map((line) => `<p>${line}</p>`).join('');
        if (readinessEl) {
            readinessEl.innerHTML = readinessList.length > 0
                ? readinessList.map((entry) => {
                    const actions = this.getLawReadinessActions(entry);
                    return `
                    <div class="law-readiness-item ${entry.state}">
                        <div class="law-readiness-title-row">
                            <strong>${entry.resonance.name}</strong>
                            <span class="law-readiness-chip ${entry.state}">${entry.label}</span>
                        </div>
                        <div class="law-readiness-desc">${entry.detail}</div>
                        ${actions.length > 0 ? `<div class="law-readiness-actions">${actions.map((action) => `<button type="button" class="law-readiness-btn" onclick="game.handleLawReadinessAction('${action.type}', '${action.resonanceId || ''}', '${action.lawId || ''}')">${action.label}</button>`).join('')}</div>` : ''}
                    </div>
                `;
                }).join('')
                : '<div class="law-readiness-empty">暂无登记在册的关联共鸣，可先关注其被动与解锁卡牌。</div>';
        }
        modal.classList.add('active');
        if (typeof audioManager !== 'undefined') audioManager.playSFX('click');
    }

    setTreasureCompendiumFilter(value = 'all') {
        const nextValue = String(value || 'all');
        const state = this.getTreasureCompendiumFilterState();
        if (nextValue === 'custom') {
            this.treasureCompendiumFilter = this.getTreasureCompendiumQuickFilterValue();
            this.showTreasureCompendium();
            return;
        }
        state.status = 'all';
        state.rarities = [];
        state.sources = [];

        if (['owned', 'unowned'].includes(nextValue)) {
            state.status = nextValue;
        } else if (['common', 'rare', 'legendary', 'mythic'].includes(nextValue)) {
            state.rarities = [nextValue];
        } else if (['shop', 'elite', 'boss', 'event', 'camp', 'challenge'].includes(nextValue)) {
            state.sources = [nextValue];
        }

        this.treasureCompendiumFilterState = state;
        this.treasureCompendiumFilter = nextValue;
        this.showTreasureCompendium();
    }

    setTreasureCompendiumSort(value = 'rarity_desc') {
        this.treasureCompendiumSort = String(value || 'rarity_desc');
        this.showTreasureCompendium();
    }


    getTreasureCompendiumPresetStorageKey() {
        return this.treasureCompendiumPresetStorageKey || 'theDefierTreasureCompendiumPresetsV1';
    }

    serializeTreasureCompendiumFilterState(state = null, sort = null) {
        return JSON.stringify({
            state: this.normalizeTreasureCompendiumFilterState(state || this.getTreasureCompendiumFilterState()),
            sort: String(sort || this.treasureCompendiumSort || 'rarity_desc')
        });
    }

    getTreasureCompendiumPresets() {
        if (Array.isArray(this.treasureCompendiumPresetCache)) return this.treasureCompendiumPresetCache;
        const fallback = [null, null, null];
        try {
            const raw = localStorage.getItem(this.getTreasureCompendiumPresetStorageKey());
            const parsed = raw ? JSON.parse(raw) : fallback;
            this.treasureCompendiumPresetCache = Array.isArray(parsed)
                ? parsed.slice(0, 3).map((entry) => entry && typeof entry === 'object'
                    ? {
                        state: this.normalizeTreasureCompendiumFilterState(entry.state),
                        sort: String(entry.sort || 'rarity_desc'),
                        savedAt: Number(entry.savedAt) || 0
                    }
                    : null)
                : fallback;
        } catch (error) {
            this.treasureCompendiumPresetCache = fallback;
        }
        while (this.treasureCompendiumPresetCache.length < 3) this.treasureCompendiumPresetCache.push(null);
        return this.treasureCompendiumPresetCache;
    }

    persistTreasureCompendiumPresets() {
        try {
            localStorage.setItem(this.getTreasureCompendiumPresetStorageKey(), JSON.stringify(this.getTreasureCompendiumPresets()));
        } catch (error) {
            console.warn('Persist treasure compendium presets failed:', error);
        }
    }

    getTreasureCompendiumPresetSummary(state = null) {
        const labels = this.getTreasureCompendiumFilterLabels(state || this.getTreasureCompendiumFilterState());
        return labels.length > 0 ? labels.join(' / ') : '全部法宝';
    }

    saveTreasureCompendiumPreset(slot = 0) {
        const index = Math.max(0, Math.min(2, Number(slot) || 0));
        const presets = this.getTreasureCompendiumPresets();
        presets[index] = {
            state: this.normalizeTreasureCompendiumFilterState(this.getTreasureCompendiumFilterState()),
            sort: String(this.treasureCompendiumSort || 'rarity_desc'),
            savedAt: Date.now()
        };
        this.persistTreasureCompendiumPresets();
        if (typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
            Utils.showBattleLog(`已保存图鉴筛选预设 ${index + 1}`);
        }
        this.showTreasureCompendium();
    }

    applyTreasureCompendiumPreset(slot = 0) {
        const index = Math.max(0, Math.min(2, Number(slot) || 0));
        const preset = this.getTreasureCompendiumPresets()[index];
        if (!preset?.state) {
            if (typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
                Utils.showBattleLog(`预设 ${index + 1} 为空`);
            }
            return false;
        }
        this.treasureCompendiumFilterState = this.normalizeTreasureCompendiumFilterState(preset.state);
        this.treasureCompendiumSort = String(preset.sort || 'rarity_desc');
        this.treasureCompendiumFilter = this.getTreasureCompendiumQuickFilterValue();
        this.showTreasureCompendium();
        return true;
    }

    clearTreasureCompendiumFilters() {
        this.treasureCompendiumFilterState = this.normalizeTreasureCompendiumFilterState();
        this.treasureCompendiumFilter = 'all';
        this.treasureCompendiumSort = 'rarity_desc';
        this.showTreasureCompendium();
    }

    isTreasureCompendiumPresetActive(slot = 0) {
        const preset = this.getTreasureCompendiumPresets()[slot];
        if (!preset?.state) return false;
        return this.serializeTreasureCompendiumFilterState(preset.state, preset.sort) === this.serializeTreasureCompendiumFilterState();
    }

    getTreasureCompendiumPresetLabel(slot = 0) {
        const preset = this.getTreasureCompendiumPresets()[slot];
        if (!preset?.state) return `预设 ${slot + 1}（空）`;
        return `预设 ${slot + 1} · ${this.getTreasureCompendiumPresetSummary(preset.state)}`;
    }

    normalizeTreasureCompendiumFilterState(rawState = null) {
        const source = rawState && typeof rawState === 'object' ? rawState : {};
        const normalizeList = (value, allowed) => {
            const items = Array.isArray(value) ? value.map((entry) => String(entry || '')).filter(Boolean) : [];
            return [...new Set(items)].filter((entry) => allowed.includes(entry));
        };

        return {
            status: ['all', 'owned', 'unowned'].includes(source.status) ? source.status : 'all',
            rarities: normalizeList(source.rarities, ['common', 'rare', 'legendary', 'mythic']),
            sources: normalizeList(source.sources, ['shop', 'elite', 'boss', 'event', 'camp', 'challenge'])
        };
    }

    getTreasureCompendiumFilterState() {
        this.treasureCompendiumFilterState = this.normalizeTreasureCompendiumFilterState(this.treasureCompendiumFilterState);
        return this.treasureCompendiumFilterState;
    }

    getTreasureSourceTags(treasure) {
        const sourceText = this.getTreasureSource(treasure || {});
        const tags = new Set();
        if (/商店/.test(sourceText)) tags.add('shop');
        if (/精英/.test(sourceText)) tags.add('elite');
        if (/Boss|首杀|裁决者|天道终焉|丹尊|三首金龙|虚空吞噬者|合体天尊|大乘至尊|飞升主宰|混沌之眼|五行长老|上古遗灵|仙门长老|妖狼王|山寨头目/.test(sourceText)) tags.add('boss');
        if (/奇遇|事件|雷劫|剑冢/.test(sourceText)) tags.add('event');
        if (/营地|供奉|锻炉/.test(sourceText)) tags.add('camp');
        if (/挑战|试炼|成就/.test(sourceText)) tags.add('challenge');
        return Array.from(tags);
    }

    getTreasureCompendiumQuickFilterValue() {
        const state = this.getTreasureCompendiumFilterState();
        if (state.status !== 'all' && state.rarities.length === 0 && state.sources.length === 0) return state.status;
        if (state.status === 'all' && state.rarities.length === 1 && state.sources.length === 0) return state.rarities[0];
        if (state.status === 'all' && state.rarities.length === 0 && state.sources.length === 1) return state.sources[0];
        if (state.status === 'all' && state.rarities.length === 0 && state.sources.length === 0) return 'all';
        return 'custom';
    }

    getTreasureCompendiumFilterLabels(state = null) {
        state = this.normalizeTreasureCompendiumFilterState(state || this.getTreasureCompendiumFilterState());
        const labels = [];
        const statusMap = { owned: '已收录', unowned: '未收录' };
        const rarityMap = { common: '凡品', rare: '灵品', legendary: '神品', mythic: '仙品' };
        const sourceMap = { shop: '商店', elite: '精英', boss: '首领', event: '事件', camp: '营地', challenge: '挑战' };
        if (state.status !== 'all') labels.push(statusMap[state.status] || state.status);
        state.rarities.forEach((value) => labels.push(rarityMap[value] || value));
        state.sources.forEach((value) => labels.push(sourceMap[value] || value));
        return labels;
    }

    toggleTreasureCompendiumFilterChip(group, value) {
        const state = this.getTreasureCompendiumFilterState();
        if (group === 'status') {
            state.status = state.status === value ? 'all' : value;
        } else if (group === 'rarity' || group === 'source') {
            const key = group === 'rarity' ? 'rarities' : 'sources';
            const next = new Set(Array.isArray(state[key]) ? state[key] : []);
            if (next.has(value)) next.delete(value);
            else next.add(value);
            state[key] = Array.from(next);
        }
        this.treasureCompendiumFilterState = this.normalizeTreasureCompendiumFilterState(state);
        this.treasureCompendiumFilter = this.getTreasureCompendiumQuickFilterValue();
        this.showTreasureCompendium();
    }

    passesTreasureCompendiumFilter(item) {
        const state = this.getTreasureCompendiumFilterState();
        const rarity = item?.data?.rarity || 'common';
        const sourceTags = this.getTreasureSourceTags(item?.data || {});
        if (state.status === 'owned' && !item?.isOwned) return false;
        if (state.status === 'unowned' && item?.isOwned) return false;
        if (state.rarities.length > 0 && !state.rarities.includes(rarity)) return false;
        if (state.sources.length > 0 && !state.sources.some((tag) => sourceTags.includes(tag))) return false;
        return true;
    }

    sortTreasureCompendiumItems(items) {
        const list = Array.isArray(items) ? [...items] : [];
        const sortMode = this.treasureCompendiumSort || 'rarity_desc';
        const rarityScore = { mythic: 4, legendary: 3, rare: 2, common: 1 };
        return list.sort((a, b) => {
            const realmA = TREASURE_CONFIG?.unlockRealm?.[a.id] || 1;
            const realmB = TREASURE_CONFIG?.unlockRealm?.[b.id] || 1;
            if (sortMode === 'name_asc') return String(a.data?.name || '').localeCompare(String(b.data?.name || ''));
            if (sortMode === 'owned_first' && a.isOwned !== b.isOwned) return Number(b.isOwned) - Number(a.isOwned);
            if (sortMode === 'realm_asc' && realmA !== realmB) return realmA - realmB;
            const rarityA = rarityScore[a.data?.rarity || 'common'] || 1;
            const rarityB = rarityScore[b.data?.rarity || 'common'] || 1;
            if (rarityA !== rarityB) return rarityB - rarityA;
            if (sortMode === 'owned_first' && realmA !== realmB) return realmA - realmB;
            return String(a.id || '').localeCompare(String(b.id || ''));
        });
    }

    buildPlayerDeckProfile() {
        const deck = Array.isArray(this.player?.deck) ? this.player.deck : [];
        const counts = { attack: 0, defense: 0, law: 0, chance: 0, energy: 0, other: 0 };
        const lawTypeCounts = {};
        let totalCost = 0;
        deck.forEach((card) => {
            const type = counts[card?.type] !== undefined ? card.type : 'other';
            counts[type] += 1;
            totalCost += Number(card?.cost) || 0;
            if (card?.lawType) lawTypeCounts[card.lawType] = (lawTypeCounts[card.lawType] || 0) + 1;
        });
        const dominantType = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'other';
        const dominantLawType = Object.entries(lawTypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
        return {
            size: deck.length,
            counts,
            lawTypeCounts,
            dominantType,
            dominantLawType,
            avgCost: deck.length > 0 ? totalCost / deck.length : 0,
            ratio(type) { return deck.length > 0 ? (counts[type] || 0) / deck.length : 0; }
        };
    }

    evaluateShopCardDeckFit(card) {
        const profile = this.buildPlayerDeckProfile();
        const reasons = [];
        let score = 0;
        if (!card) return { label: '适配未知', reason: '无法解析当前卡牌。', summaryRows: [], score: 0 };
        if (card.type === 'attack') {
            const ratio = profile.ratio('attack');
            if (ratio >= 0.34) { score += 2.2; reasons.push('当前牌组攻击占比高，新增攻击牌更容易形成连段。'); }
            else if (ratio >= 0.2) { score += 1.1; reasons.push('攻击轴已有基础，可作为补强。'); }
        } else if (card.type === 'defense') {
            const ratio = profile.ratio('defense');
            if (ratio >= 0.28) { score += 2; reasons.push('防御牌占比稳定，这张牌容易融入护盾节奏。'); }
            else { score += 0.8; reasons.push('当前防御牌偏少，可作为补位工具。'); }
        } else if (card.type === 'law') {
            const ratio = profile.ratio('law');
            if (ratio >= 0.2) { score += 2.2; reasons.push('法则牌比重较高，继续叠法则轴收益明显。'); }
            if (card.lawType && profile.lawTypeCounts[card.lawType]) { score += 1.4; reasons.push(`牌组已存在 ${card.lawType} 法则链，可直接衔接。`); }
        } else if (card.type === 'energy') {
            if (profile.avgCost >= 1.7) { score += 2.1; reasons.push('当前牌组平均费用偏高，灵力牌更能稳节奏。'); }
            else { score += 1.2; reasons.push('即使平均费用不高，灵力牌也能提升转场稳定性。'); }
        } else if (card.type === 'chance') {
            score += 1.0; reasons.push('机缘牌更依赖局面，适合作为弹性补件。');
        }
        if ((Number(card.cost) || 0) <= 1) { score += 0.5; reasons.push('低费用意味着更容易塞入现有曲线。'); }
        if ((Number(card.cost) || 0) >= 3 && profile.avgCost >= 1.8) { score += 0.6; reasons.push('当前曲线允许更高费用的爆发牌。'); }
        if (profile.size <= 12) { score += 0.4; reasons.push('牌组规模还不大，新牌更容易被尽快抽到。'); }
        const label = score >= 3.2 ? '高适配' : (score >= 1.7 ? '中适配' : '低适配');
        const reason = reasons[0] || '这张牌更偏通用补件，需结合当前流派自行判断。';
        return {
            label,
            reason,
            score,
            summaryRows: [
                { label: '适配度', value: label },
                { label: '牌组重心', value: `${profile.dominantType}轴 · 均费 ${profile.avgCost.toFixed(1)}` },
                { label: '牌组规模', value: `${profile.size} 张` }
            ]
        };
    }

    evaluateShopServiceFit(service) {
        const profile = this.buildPlayerDeckProfile();
        const hpRatio = this.player?.maxHp > 0 ? (this.player.currentHp / this.player.maxHp) : 1;
        const currency = service?.currency || 'gold';
        const currentBudget = typeof this.getStrategicCurrencyAmount === 'function'
            ? this.getStrategicCurrencyAmount(currency)
            : Number(this.player?.gold) || 0;
        const price = Math.max(0, Number(service?.price) || 0);
        const reasons = [];
        let score = 0;

        if (!service) return { label: '适配未知', reason: '无法解析当前服务。', summaryRows: [], score: 0 };

        switch (service.id) {
            case 'heal':
            case 'campRation':
            case 'fieldMedic':
            case 'endlessStabilizer':
                if (hpRatio <= 0.45) {
                    score += 4.0;
                    reasons.push('当前血线偏低，先补生存比继续扩牌更稳。');
                } else if (hpRatio <= 0.7) {
                    score += 1.8;
                    reasons.push('生命有明显折损，补给类服务能提升容错。');
                } else {
                    score += 0.6;
                    reasons.push('当前血线健康，补给收益偏向稳态。');
                }
                break;
            case 'remove':
                if (profile.size >= 14) {
                    score += 3.1;
                    reasons.push('当前牌组偏厚，净化能直接提高抽到核心牌的频率。');
                } else if (profile.size >= 11) {
                    score += 2.0;
                    reasons.push('移除冗余牌能继续收束曲线。');
                } else {
                    score += 0.7;
                    reasons.push('当前牌组较薄，净化收益更偏长期优化。');
                }
                break;
            case 'exp':
            case 'fateLedger':
            case 'insightIncense':
                score += 1.8;
                reasons.push('命环成长服务偏向中长期增益，适合提前投资后续强度。');
                break;
            case 'tacticalPlan':
            case 'pulseCatalyst':
            case 'wardSigil':
                score += profile.dominantType === 'attack' || profile.avgCost >= 1.8 ? 2.2 : 1.2;
                reasons.push('战前增益服务能放大现有节奏轴，尤其适合已经成型的牌组。');
                break;
            case 'bountyContract':
            case 'scoutPack':
            case 'rumorRareDraft':
            case 'rumorTreasureTrail':
            case 'rumorUtilityRoute':
            case 'rumorTrialRoute':
                score += 1.4;
                reasons.push('这类交易更偏投资未来收益，适合资源宽裕时滚雪球。');
                break;
            case 'endlessRefit':
            case 'endlessOverclock':
            case 'endlessBlessing':
                score += this.isEndlessActive && this.isEndlessActive() ? 2.4 : 0.2;
                reasons.push(this.isEndlessActive && this.isEndlessActive()
                    ? '当前处于无尽轮回，轮回服务会直接影响压力与赐福。'
                    : '轮回类服务仅在无尽模式下有较高收益。');
                break;
            default:
                score += 1.0;
                reasons.push('这是泛用型服务，价值取决于你当前缺口。');
                break;
        }

        if (price > currentBudget) {
            score -= 1.8;
            reasons.push('当前资源不足，先保留余钱更稳。');
        } else if (currency === 'gold' && currentBudget - price < 45) {
            score -= 0.5;
            reasons.push('买完后灵石结余偏低，要注意下一次商店与事件缓冲。');
        }

        const label = score >= 3.0 ? '高适配' : (score >= 1.7 ? '中适配' : '低适配');
        return {
            label,
            reason: reasons[0] || '当前局势下属于通用型服务。',
            score,
            summaryRows: [
                { label: '服务适配', value: label },
                { label: '结余预估', value: `${Math.max(0, currentBudget - price)} ${this.getStrategicCurrencyLabel ? this.getStrategicCurrencyLabel(currency) : currency}` },
                { label: '当前血线', value: `${Math.round(hpRatio * 100)}%` }
            ]
        };
    }

    getMapNodeTypeLabel(type = '') {
        const map = {
            enemy: '普通战',
            elite: '精英战',
            boss: 'Boss 战',
            rest: '营地',
            event: '事件',
            shop: '商店',
            trial: '试炼',
            forge: '锻炉',
            ghost_duel: '幻影决斗'
        };
        return map[type] || (type || '未知节点');
    }

    getShopNextNodeForecast() {
        if (!this.map || typeof this.map.getAccessibleNodes !== 'function') return null;
        const accessible = this.map.getAccessibleNodes().filter((node) => node && node.id !== this.shopNode?.id);
        if (accessible.length === 0) return null;
        const shopRow = Number(this.shopNode?.row);
        const futureNodes = Number.isFinite(shopRow)
            ? accessible.filter((node) => Number(node?.row) > shopRow)
            : accessible;
        const pool = futureNodes.length > 0 ? futureNodes : accessible;
        const minRow = Math.min(...pool.map((node) => Number(node?.row) || 0));
        const frontier = pool.filter((node) => (Number(node?.row) || 0) === minRow);
        const rank = { boss: 6, elite: 5, ghost_duel: 4, trial: 4, enemy: 3, forge: 2, event: 2, rest: 1, shop: 1 };
        const sortedTypes = [...new Set(frontier.map((node) => node.type))].sort((a, b) => (rank[b] || 0) - (rank[a] || 0));
        const primaryType = sortedTypes[0] || frontier[0]?.type || 'enemy';
        const labels = sortedTypes.map((type) => this.getMapNodeTypeLabel(type));
        const danger = ['boss', 'elite', 'ghost_duel', 'trial'].includes(primaryType) ? 'high' : (primaryType === 'enemy' ? 'medium' : 'low');
        return {
            row: minRow,
            nodes: frontier,
            primaryType,
            primaryLabel: this.getMapNodeTypeLabel(primaryType),
            labels,
            summary: labels.length > 0 ? `下一批节点：${labels.join(' / ')}` : '下一批节点未明',
            danger
        };
    }

    buildShopSpendRecommendation() {
        const availableCards = Array.isArray(this.shopItems) ? this.shopItems.filter((item) => item && !item.sold) : [];
        const availableServices = Array.isArray(this.shopServices) ? this.shopServices.filter((item) => item && !item.sold) : [];
        const affordableCards = availableCards
            .filter((item) => this.canAffordShopItem(item))
            .map((item) => ({ item, fit: this.evaluateShopCardDeckFit(item.card) }))
            .sort((a, b) => (b.fit?.score || 0) - (a.fit?.score || 0));
        const affordableServices = availableServices
            .filter((item) => this.canAffordShopItem(item))
            .map((item) => ({ item, fit: this.evaluateShopServiceFit(item) }))
            .sort((a, b) => (b.fit?.score || 0) - (a.fit?.score || 0));

        const bestCard = affordableCards[0] || null;
        const bestService = affordableServices[0] || null;
        const goldBudget = typeof this.getStrategicCurrencyAmount === 'function' ? this.getStrategicCurrencyAmount('gold') : (Number(this.player?.gold) || 0);
        const hpRatio = this.player?.maxHp > 0 ? (this.player.currentHp / this.player.maxHp) : 1;
        const forecast = this.getShopNextNodeForecast();
        let bestCardScore = bestCard?.fit?.score || 0;
        let bestServiceScore = bestService?.fit?.score || 0;

        if (forecast?.danger === 'high') {
            bestServiceScore += hpRatio <= 0.7 ? 1.2 : 0.55;
            bestCardScore -= hpRatio <= 0.55 ? 0.55 : 0.15;
        } else if (forecast?.primaryType === 'rest') {
            bestCardScore += 0.45;
        } else if (forecast?.primaryType === 'event' || forecast?.primaryType === 'shop') {
            bestCardScore += 0.25;
            bestServiceScore -= 0.1;
        }

        const forecastHint = forecast?.summary ? ` ${forecast.summary}。` : '';

        if (!bestCard && !bestService) {
            return {
                action: '建议留钱',
                tone: 'save',
                reason: (goldBudget <= 40 ? '当前资源太紧，先留钱应对后续恢复与关键节点。' : '本页暂无高适配且可负担的选项，先观察下一次货架更稳。') + forecastHint,
                bestCard: null,
                bestService: null,
                forecast
            };
        }

        if (forecast?.danger === 'high' && hpRatio <= 0.55 && bestService) {
            return {
                action: '更适合买服务',
                tone: 'service',
                reason: `${bestService.item.name}：${bestService.fit.reason}${forecastHint}`,
                bestCard,
                bestService,
                forecast
            };
        }

        if (forecast?.danger === 'high' && goldBudget < 65) {
            return {
                action: '建议留钱',
                tone: 'save',
                reason: `下一批更接近${forecast.primaryLabel}，当前灵石偏紧，先保留恢复或应急资金更稳。`,
                bestCard,
                bestService,
                forecast
            };
        }

        if (bestService && (!bestCard || bestServiceScore >= bestCardScore + 0.45)) {
            return {
                action: '更适合买服务',
                tone: 'service',
                reason: `${bestService.item.name}：${bestService.fit.reason}${forecastHint}`,
                bestCard,
                bestService,
                forecast
            };
        }

        if (bestCard && (!bestService || bestCardScore >= bestServiceScore - 0.25)) {
            return {
                action: '更适合买卡',
                tone: 'card',
                reason: `${bestCard.item.card.name}：${bestCard.fit.reason}${forecastHint}`,
                bestCard,
                bestService,
                forecast
            };
        }

        return {
            action: '建议留钱',
            tone: 'save',
            reason: `当前买卡与买服务的收益接近，若资源吃紧可先保留弹性。${forecastHint}`,
            bestCard,
            bestService,
            forecast
        };
    }
    // 辅助：格式化共鸣效果描述
    formattingResonanceEffect(effect) {
        if (!effect) return '';

        const terms = {
            'burn': '灼烧', 'weak': '虚弱', 'vulnerable': '易伤', 'poison': '中毒',
            'stun': '眩晕', 'freeze': '冰冻', 'slow': '减速', 'random': '随机效果',
            'thunder': '雷', 'fire': '火', 'ice': '冰', 'wind': '风', 'earth': '土',
            'costReduce': '减费', 'draw': '抽牌'
        };
        const t = (k) => terms[k] || k;

        switch (effect.type) {
            case 'damageBoostVsDebuff': return `对[${t(effect.debuff)}]敌人伤害+${Math.floor(effect.percent * 100)}%`;
            case 'dodgeDraw': return `闪避时抽${effect.value}张牌`;
            case 'stunDebuff': return `眩晕时施加${effect.value}层${t(effect.buffType)}`;
            case 'shieldHeal': return `回合结束若有护盾，恢复护盾值${Math.floor(effect.percent * 100)}%的生命`;
            case 'penetrateBonus': return `穿透伤害+${Math.floor(effect.percent * 100)}%`;
            case 'shuffleDamage': return `洗牌造成${effect.value}伤害+${t(effect.debuff)}`;
            case 'elementalReaction': return `${t(effect.trigger)}伤触发${Math.floor(effect.damagePercent * 100)}%生命爆炸`;
            case 'cardPlayTrigger': return `每${effect.count}张牌触发${effect.damage}点${t(effect.element)}伤`;
            case 'turnStartGamble': return `回合开始：50%几率随机3张牌耗能-1，或抽2张牌`;
            case 'healOverlowDamage': return `溢出治疗转伤害 (+${Math.floor(effect.healBonus * 100)}%治疗)`;
            case 'resurrect': return `死亡复活 (${Math.floor(effect.percent * 100)}%血)`;
            case 'persistentBlock': return `护盾不消失`;
            case 'penetrateParalysis': return `穿透施加${effect.value}层麻痹`;
            default: return '特殊效果';
        }
    }

    // 初始化成就界面
    initAchievements() {
        const container = document.getElementById('achievements-container');
        if (!container) return;

        container.innerHTML = '';

        const achievements = this.achievementSystem.getAchievementsList();
        const categories = {};

        // 按分类分组
        for (const achievement of achievements) {
            const cat = achievement.category;
            if (!categories[cat]) {
                categories[cat] = [];
            }
            categories[cat].push(achievement);
        }

        // 1. 渲染进度部分 (Cultivation Progress)
        const progress = this.achievementSystem.getProgress();
        const progressPercent = Math.floor((progress.completed / progress.total) * 100);

        const progressSection = document.createElement('div');
        progressSection.className = 'achievements-header-stats';
        progressSection.innerHTML = `
            <div class="achievement-progress-card">
                <div class="progress-label">修行进度</div>
                <div class="progress-track">
                    <div class="progress-fill" style="width: ${progressPercent}%"></div>
                </div>
                <div class="progress-text">${progressPercent}%</div>
            </div>
        `;
        container.appendChild(progressSection);

        // 2. 渲染每个分类
        for (const catId in categories) {
            const catInfo = ACHIEVEMENT_CATEGORIES[catId];
            const catAchievements = categories[catId];

            const catEl = document.createElement('div');
            catEl.className = 'achievement-category';
            catEl.innerHTML = `
                <div class="category-header">
                    <h3>${catInfo.icon} ${catInfo.name}</h3>
                    <div class="ink-decoration"></div>
                </div>
                <div class="achievement-grid">
                    ${catAchievements.map(a => {
                const statusClass = a.unlocked ? 'unlocked' : 'locked';
                const rewardText = getAchievementRewardText(a);

                // Condition Met but Reward Not Claimed
                const canClaim = a.unlocked && !a.claimed;
                const isClaimed = a.claimed;

                let actionHtml = '';
                if (canClaim) {
                    actionHtml = `
                                <button class="claim-btn pulse" onclick="game.claimAchievement('${a.id}')">
                                    <span class="btn-text">领取奖励</span>
                                </button>
                            `;
                } else if (isClaimed) {
                    actionHtml = `<div class="claimed-badge">已领取</div>`;
                }

                return `
                        <div class="achievement-card ${statusClass} ${isClaimed ? 'claimed' : ''}">
                            ${isClaimed ? '<div class="achievement-status-icon">✓</div>' : ''}
                            <div class="achievement-icon-wrapper">
                                ${a.icon}
                            </div>
                            <div class="achievement-content">
                                <div class="achievement-title">${a.name}</div>
                                <div class="achievement-desc">${a.description}</div>
                                ${a.unlocked ? `<div class="achievement-reward-tag">${rewardText}</div>` : ''}
                                ${actionHtml}
                            </div>
                        </div>
                        `;
            }).join('')}
                </div>
            `;

            container.appendChild(catEl);
        }
    }

    // Claim Achievement Wrapper
    claimAchievement(id) {
        const result = this.achievementSystem.claimReward(id);
        if (result.success) {
            // Re-render UI to show "Claimed" status
            this.initAchievements();
            // Optional: Play Sound
            // this.audio.play('success');

            // Show toast or something?
            // The AchievementSystem already queues a popup for "Claimed" if we want,
            // or we can implement a specific visual here.
            this.achievementSystem.queuePopup(ACHIEVEMENTS[id], 'claimed');
        } else {
            console.warn('Cannot claim:', result.reason);
        }
    }

    // 显示成就界面
    showAchievements() {
        this.initAchievements();
        this.showScreen('achievements-screen');
    }

    // 渲染法宝
    renderTreasures(containerId = 'map-treasures') {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';

        if (this.player.treasures) {
            this.player.treasures.forEach(t => {
                const el = document.createElement('div');
                el.className = `treasure-item rarity-${t.rarity || 'common'}`;
                el.innerHTML = t.icon || '📦';

                // 获取动态描述
                const desc = (t.getDesc && this.player) ? t.getDesc(this.player) : t.description;

                el.title = `${t.name}\n${desc}`;

                // 点击查看详情
                el.addEventListener('click', () => {
                    this.showAlertModal(desc, t.name);
                });

                container.appendChild(el);
            });
        }
    }

    // 初始化关卡选择界面 (Refactored for Ink & Gold UI)
    // 初始化关卡选择界面 (Refactored for Ink & Gold UI - Spirit Tablets)
    initRealmSelect() {
        const listContainer = document.getElementById('realm-list-container');
        if (!listContainer) return;

        listContainer.innerHTML = '';
        this.selectedRealmId = null;

        // Visual Themes for each Realm
        const REALM_THEMES = {
            1: { icon: '🛖', color: '#B0BEC5', bg: 'linear-gradient(135deg, #263238 0%, #102027 100%)', bgImage: 'assets/images/realms/realm_bg_1.webp' }, // Mortal Dust
            2: { icon: '🌬️', color: '#81D4FA', bg: 'linear-gradient(135deg, #01579B 0%, #002f6c 100%)', bgImage: 'assets/images/realms/realm_bg_2.webp' }, // Qi Flow
            3: { icon: '🧱', color: '#BCAAA4', bg: 'linear-gradient(135deg, #4E342E 0%, #261a17 100%)', bgImage: 'assets/images/realms/realm_bg_3.webp' }, // Foundation
            4: { icon: '🌕', color: '#FFD54F', bg: 'linear-gradient(135deg, #FF6F00 0%, #8f3e00 100%)', bgImage: 'assets/images/realms/realm-4-bg.png' }, // Golden Core
            5: { icon: '👶', color: '#FFAB91', bg: 'linear-gradient(135deg, #BF360C 0%, #5f1a05 100%)', bgImage: 'assets/images/realms/realm-5-bg.png' }, // Nascent Soul
            6: { icon: '🧘', color: '#CE93D8', bg: 'linear-gradient(135deg, #4A148C 0%, #220542 100%)', bgImage: 'assets/images/realms/realm-6-bg.png' }, // Divine Spirit
            7: { icon: '🔗', color: '#80CBC4', bg: 'linear-gradient(135deg, #004D40 0%, #00251f 100%)', bgImage: 'assets/images/bg_realm_7.png' }, // Integration
            8: { icon: '🚤', color: '#FFE082', bg: 'linear-gradient(135deg, #FF8F00 0%, #8f5000 100%)', bgImage: 'assets/images/bg_realm_8.png' }, // Great Vehicle
            9: { icon: '☁️', color: '#B3E5FC', bg: 'linear-gradient(135deg, #0277BD 0%, #003c5f 100%)', bgImage: 'assets/images/bg_realm_9.png' }, // Ascension
            10: { icon: '⛰️', color: '#A5D6A7', bg: 'linear-gradient(135deg, #1B5E20 0%, #0a290d 100%)', bgImage: 'assets/images/bg_realm_10.png' }, // Earthly Immortal
            11: { icon: '🕊️', color: '#F48FB1', bg: 'linear-gradient(135deg, #880E4F 0%, #440727 100%)', bgImage: 'assets/images/bg_realm_11.png' }, // Heavenly Peace
            12: { icon: '✨', color: '#FFF59D', bg: 'linear-gradient(135deg, #F9A825 0%, #7e520b 100%)', bgImage: 'assets/images/bg_realm_12.png' }, // Golden Immortal
            13: { icon: '🌌', color: '#9575CD', bg: 'linear-gradient(135deg, #311B92 0%, #150a42 100%)', bgImage: 'assets/images/bg_realm_13.png' }, // Great Luo
            14: { icon: '🌀', color: '#90A4AE', bg: 'linear-gradient(135deg, #263238 0%, #0f1619 100%)', bgImage: 'assets/images/bg_realm_14.png' }, // Chaos Origin
            15: { icon: '👑', color: '#EF9A9A', bg: 'linear-gradient(135deg, #B71C1C 0%, #520909 100%)', bgImage: 'assets/images/bg_realm_15.png' }, // Supreme
            16: { icon: '☯️', color: '#E0E0E0', bg: 'linear-gradient(135deg, #212121 0%, #000000 100%)', bgImage: 'assets/images/bg_realm_16.png' }, // Taiyi
            17: { icon: '🌳', color: '#C5E1A5', bg: 'linear-gradient(135deg, #33691E 0%, #163009 100%)', bgImage: 'assets/images/bg_realm_17.png' }, // Bodhi
            18: { icon: '🌑', color: '#757575', bg: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)', bgImage: 'assets/images/bg_realm_18.png' }  // Chaos Void
        };

        // 生成18重天卡片
        for (let i = 1; i <= 18; i++) {
            const isUnlocked = this.unlockedRealms && this.unlockedRealms.includes(i);
            const isCompleted = isUnlocked && this.unlockedRealms.includes(i + 1);

            const realmCard = document.createElement('div');
            // Add 'spirit-tablet' class conceptually, actual styling via .realm-card
            realmCard.className = `realm-card ${isUnlocked ? '' : 'locked'}`;
            realmCard.dataset.id = i;
            realmCard.style.animationDelay = `${i * 0.05}s`; // Staggered entrance

            const realmName = this.map.getRealmName(i);
            const env = this.map.getRealmEnvironment(i);
            const theme = REALM_THEMES[i] || { icon: '❓', color: '#fff', bg: '#222' };

            // Apply Theme
            // 设计要求：未解锁重天也展示背景图，仅通过遮罩和锁定标识区分状态。
            try {
                if (theme.bgImage) {
                    const overlay = isUnlocked
                        ? 'linear-gradient(to bottom, rgba(0,0,0,0) 30%, rgba(0,0,0,0.95) 100%)'
                        : 'linear-gradient(to bottom, rgba(0,0,0,0.35) 20%, rgba(0,0,0,0.92) 100%)';
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
            const iconStyle = ((isUnlocked && theme.bgImage) || !icon) ? 'display:none' : `text-shadow: 0 0 15px ${theme.color}40`;

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

        if (this.isEndlessUnlocked()) {
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
                if (this.selectedRealmId !== null && this.selectedRealmId !== undefined) {
                    if (this.selectedRealmId === 'endless') {
                        this.startEndlessMode();
                        return;
                    }
                    const isCompleted = this.unlockedRealms && this.unlockedRealms.includes(this.selectedRealmId + 1);
                    this.startRealm(this.selectedRealmId, isCompleted);
                }
            };
        }

        // Auto-select logic
        let targetRealm = 1;
        const unlockedRealms = Array.isArray(this.unlockedRealms) && this.unlockedRealms.length > 0
            ? this.unlockedRealms
            : [1];
        if (unlockedRealms.length > 0) {
            targetRealm = Math.max(...unlockedRealms);
        }
        if (this.lastSelectedRealmId && unlockedRealms.includes(this.lastSelectedRealmId)) {
            targetRealm = this.lastSelectedRealmId;
        }
        if (this.isEndlessActive() && this.isEndlessUnlocked()) {
            targetRealm = 'endless';
        }
        if (this.lastSelectedRealmId === 'endless' && this.isEndlessUnlocked()) {
            targetRealm = 'endless';
        }

        this.selectRealm(targetRealm);
    }

    // 选择天域
    selectRealm(realmId) {
        if (this.selectedRealmId === realmId) return;
        this.selectedRealmId = realmId;
        this.lastSelectedRealmId = realmId;

        // 1. Highlight UI
        document.querySelectorAll('.realm-card').forEach(card => {
            const cardId = card.dataset.id === 'endless' ? 'endless' : parseInt(card.dataset.id, 10);
            if (cardId === realmId) {
                card.classList.add('active');
                card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
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
                const unlocked = Array.isArray(this.unlockedRealms) ? this.unlockedRealms : [1];
                const isCompleted = unlocked.includes(realmId + 1);
                if (isCompleted) {
                    enterBtn.textContent = '重修此界';
                } else {
                    enterBtn.textContent = '踏入天域';
                }
            }
        }
    }

    // 更新预览面板 (Cloud Mirror)
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
            const state = this.ensureEndlessState();
            const modifiers = this.getEndlessModifiers();
            const phaseProfile = this.getEndlessPhaseProfile(state.currentCycle);
            const cycleTheme = this.getEndlessCycleThemeProfile(state.currentCycle);
            const realm = this.getEndlessRealmForCycle(state.currentCycle);
            const realmName = this.map.getRealmName(realm);
            const activeMutators = (state.activeMutators || [])
                .map((id) => this.getEndlessMutatorPool().find((m) => m.id === id))
                .filter(Boolean);

            const titleEl = document.getElementById('preview-title');
            if (titleEl) titleEl.textContent = `无尽轮回 · 第 ${state.currentCycle + 1} 轮`;

            const iconEl = document.getElementById('preview-icon');
            if (iconEl) iconEl.textContent = '♾️';

            const envEl = document.getElementById('preview-env');
            if (envEl) {
                const phaseText = phaseProfile && phaseProfile.active
                    ? `<br><span style="color:#ffd48a;">阶段挑战：${phaseProfile.name}（第${phaseProfile.checkpoint}轮）</span>`
                    : '<br><span style="color:#7fb5c8;">阶段挑战：稳态区间</span>';
                const themeText = cycleTheme && cycleTheme.name
                    ? `<br><span style="color:#9ceeff;">轮段主题：${cycleTheme.name}（第${cycleTheme.segmentIndex}段）</span><br><span style="color:#bdefff;opacity:0.9;">${cycleTheme.desc || ''}</span>`
                    : '<br><span style="color:#9ceeff;">轮段主题：稳衡</span>';
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
                    </div>
                `;
            }

            const bossEl = document.getElementById('preview-boss');
            if (bossEl) {
                if (activeMutators.length > 0) {
                    bossEl.innerHTML = activeMutators.map((mutator) => `
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
        const realmName = this.map.getRealmName(realmId);
        const env = this.map.getRealmEnvironment(realmId);

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
        const unlocked = Array.isArray(this.unlockedRealms) ? this.unlockedRealms : [1];
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

    // 获取天域Boss信息
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
            return { bossName: null, mechDesc: '', counterTreasure: '' };
        }

        const boss = BOSS_MECHANICS[bossId];
        const mechDesc = boss.mechanics?.description || '未知机制';

        // 获取克制法宝名称
        let counterNames = [];
        if (boss.countersBy && typeof TREASURES !== 'undefined') {
            counterNames = boss.countersBy
                .map(tid => TREASURES[tid]?.name || tid)
                .slice(0, 2); // 最多显示2个
        }

        return {
            bossName: boss.name,
            mechDesc: mechDesc,
            counterTreasure: counterNames.length > 0 ? counterNames.join(' / ') : '',
            logo: (typeof ENEMIES !== 'undefined' && ENEMIES[bossId]) ? ENEMIES[bossId].logo : null
        };
    }

    // 开始指定关卡
    startRealm(realmLevel, isReplay = false) {
        const targetRealm = Math.max(1, Math.min(18, Math.floor(Number(realmLevel) || 1)));
        // 如果点击的是当前正在进行的关卡，且并未死亡，则直接返回地图
        if (!this.isEndlessActive() && this.player.realm === targetRealm && this.map.nodes.length > 0 && this.player.currentHp > 0) {
            this.showScreen('map-screen');
            return;
        }

        const endlessState = this.ensureEndlessState();
        endlessState.active = false;

        this.player.realm = targetRealm;
        this.player.floor = 0;
        // 标记是否为重玩 (已通关)
        this.player.isReplay = isReplay;
        // 新的开始（非原地复活）重置重修标记
        this.player.isRecultivation = false;

        this.player.resetBattleState(); // hypothetical helper, or manual reset

        this.map.generate(this.player.realm);
        this.showScreen('map-screen');
        this.autoSave();
    }

    // 显示界面
    showScreen(screenId) {
        console.log(`[Debug] showScreen called for: ${screenId}`);
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        const screen = document.getElementById(screenId);
        if (screen) {

            // Safety: Ensure screen is visible before running logic that might crash
            screen.classList.add('active');
            this.currentScreen = screenId;
            console.log(`[Debug] Screen ${screenId} set to active class.`);

            // Use Try-Catch to prevent logical errors from blocking UI rendering (Black Screen Fix)
            try {
                // Particle Control
                if (typeof particles !== 'undefined') {
                    if (screenId === 'main-menu') {
                        particles.startMainMenuParticles();
                        this.tryShowMainMenuGuide();
                    } else {
                        particles.stopMainMenuParticles();
                    }
                }

                // 特殊处理
                if (screenId === 'map-screen') {
                    console.log('[Debug] Initializing map-screen logic');
                    if (this.map) {
                        console.log('[Debug] Calling this.map.render()');
                        this.map.render();
                    } else {
                        console.error('[Debug] this.map is undefined!');
                    }
                    console.log('[Debug] Calling updatePlayerDisplay()');
                    this.updatePlayerDisplay();
                    this.refreshLegacyMissionTrackers();

                    // DEBUG: Check DOM state after render
                    setTimeout(() => {
                        const mapScreen = document.getElementById('map-screen');
                        if (mapScreen) {
                            const style = window.getComputedStyle(mapScreen);
                            console.log(`[Debug] #map-screen style: display=${style.display}, visibility=${style.visibility}, opacity=${style.opacity}, height=${style.height}, width=${style.width}, z-index=${style.zIndex}`);
                            console.log(`[Debug] #map-screen Parent: <${mapScreen.parentNode.tagName} id="${mapScreen.parentNode.id}" class="${mapScreen.parentNode.className}">`);
                            console.log(`[Debug] #map-screen innerHTML length: ${mapScreen.innerHTML.length}`);

                            // Audit body children for overlays
                            console.log('[Debug] Auditing Body Children for Overlays:');
                            Array.from(document.body.children).forEach(child => {
                                const s = window.getComputedStyle(child);
                                if (s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0) {
                                    console.log(`[Debug] Visible Child: <${child.tagName} id="${child.id}" class="${child.className}"> Z=${s.zIndex} Pos=${s.position} Rect=${child.getBoundingClientRect().height}x${child.getBoundingClientRect().width}`);
                                }
                            });
                        }
                    }, 500); // Delayed check

                } else if (screenId === 'battle-screen') {
                    console.log('[Debug] Initializing battle-screen logic');
                    this.updatePlayerDisplay();
                    this.refreshLegacyMissionTrackers();
                    if (!this.guideState.battleLogHintSeen) {
                        this.markGuideSeen('battleLogHintSeen');
                        setTimeout(() => {
                            Utils.showBattleLog('提示：按 L 可查看战斗记录面板。', {
                                category: 'system',
                                duration: 2600
                            });
                        }, 350);
                    }
                } else if (screenId === 'collection') {
                    this.initCollection();
                } else if (screenId === 'achievements-screen') {
                    this.initAchievements();
                } else if (screenId === 'inheritance-screen') {
                    this.initInheritanceScreen();
                } else if (screenId === 'character-select') {
                    this.updateCharacterInfo();
                } else if (screenId === 'realm-select-screen') {
                    this.initRealmSelect();
                }
                console.log(`[Debug] showScreen logic for ${screenId} completed successfully.`);
            } catch (e) {
                console.error(`Error initializing screen ${screenId}:`, e);
                // Try to show error safely
                if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
                    Utils.showBattleLog('界面加载异常: ' + e.message);
                }
            }
        } else {
            console.error(`[Debug] Screen element #${screenId} NOT FOUND in DOM!`);
        }
    }

    // 更新角色信息界面
    updateCharacterInfo() {
        document.getElementById('char-hp').textContent = this.player.maxHp;
        document.getElementById('char-energy').textContent = this.player.baseEnergy;
        document.getElementById('char-draw').textContent = this.player.drawCount;
        const charId = this.player.characterId || 'linFeng';
        const char = (typeof CHARACTERS !== 'undefined' && CHARACTERS[charId]) ? CHARACTERS[charId] : { avatar: '👤' };
        const cosmetic = this.getEquippedCosmeticsProfile();
        const titleEl = document.getElementById('info-char-title');
        const avatarEl = document.getElementById('info-char-avatar');
        const descEl = document.getElementById('info-char-desc');
        if (titleEl) {
            if (cosmetic && cosmetic.title && cosmetic.title.name) {
                const titleName = String(cosmetic.title.name).replace(/^称号·/, '');
                titleEl.textContent = `称号·${titleName}`;
            } else {
                titleEl.textContent = '逆命印记';
            }
            titleEl.className = 'imprint-badge';
        }
        if (avatarEl) {
            const skinIcon = cosmetic && cosmetic.skin ? (cosmetic.skin.icon || '👘') : null;
            avatarEl.textContent = skinIcon || char.avatar || '👤';
            avatarEl.classList.toggle('pvp-skin-avatar', !!skinIcon);
        }
        if (descEl) {
            const baseDesc = char.description || descEl.textContent || '';
            if (cosmetic && cosmetic.skin && cosmetic.skin.name) {
                const skinName = String(cosmetic.skin.name).replace(/^法相·/, '');
                descEl.textContent = `${baseDesc}（当前法相：${skinName}）`;
            } else {
                descEl.textContent = baseDesc.replace(/（当前法相：.*?）$/, '');
            }
        }

        // 显示力量 (永久)
        const permaStrength = (this.player.permaBuffs && this.player.permaBuffs.strength) ? this.player.permaBuffs.strength : 0;
        const charStrEl = document.getElementById('char-strength');
        if (charStrEl) charStrEl.textContent = permaStrength;
        const ringName = this.player.fateRing.name;
        // Fix: ID mismatch, HTML uses 'ring-level'
        const ringLevelEl = document.getElementById('ring-level');
        if (ringLevelEl) ringLevelEl.textContent = ringName;

        let loadedCount = 0;
        let totalSlots = 0;

        // different logic for Class instance vs simple object (fallback/legacy)
        if (typeof this.player.fateRing.getSocketedLaws === 'function') {
            loadedCount = this.player.fateRing.getSocketedLaws().length;
            totalSlots = this.player.fateRing.maxSlots;
        } else {
            loadedCount = this.player.fateRing.loadedLaws ? this.player.fateRing.loadedLaws.length : 0;
            totalSlots = this.player.fateRing.slots;
        }

        const loadedLawsSpan = document.getElementById('loaded-laws');
        if (loadedLawsSpan) loadedLawsSpan.textContent = `${loadedCount}/${totalSlots}`;
    }

    getEquippedCosmeticsProfile() {
        if (
            typeof PVPService !== 'undefined'
            && PVPService
            && typeof PVPService.getEquippedCosmetics === 'function'
        ) {
            try {
                return PVPService.getEquippedCosmetics();
            } catch (e) {
                console.warn('Read equipped cosmetics failed:', e);
            }
        }
        return { skin: null, title: null };
    }

    // 显示角色选择界面
    showCharacterSelection() {
        this.selectedCharacterId = null;
        const container = document.getElementById('character-selection-container');
        if (container) {
            container.innerHTML = '';

            // 剧情背景
            const introDiv = document.createElement('div');
            introDiv.className = 'story-intro';

            introDiv.innerHTML = `
                <p><strong>背景设定：</strong></p>
                <p>“命环”，乃天道为万物众生设下的枷锁，意在限制潜力，维持统治。</p>
                <p>然而天道亦有善恶，善念留下一线生机，即为“逆命者”。</p>
                <p>恶念化身天道之主，对此大为震怒，封印善念，并派遣“天罚者”猎杀逆命之人。</p>
                <p>如今，你作为新的逆命者觉醒，需在天罚者的追猎下不断突破命环，最终斩杀恶道，解放众生。</p>
            `;
            container.appendChild(introDiv);

            const cardsContainer = document.createElement('div');
            cardsContainer.className = 'character-cards-wrapper';


            for (const charId in CHARACTERS) {
                const char = CHARACTERS[charId];

                // Check if character is locked
                let locked = false;
                let lockReason = '';
                // Simple unlock logic (example)
                if (charId !== 'linFeng' && charId !== 'xiangYe' && charId !== 'yanHan' && charId !== 'wuYu') {
                    // locked = true; // Default lock logic if needed
                }

                const card = document.createElement('div');
                card.className = `character-card ${locked ? 'locked' : ''}`;
                card.dataset.id = charId;

                // Image handling
                let avatarHtml = '';
                if (char.image) {
                    avatarHtml = `<img src="${char.image}" class="char-avatar-img" alt="${char.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                                  <span class="char-avatar-emoji" style="display:none">${char.avatar}</span>`;
                } else if (char.portrait) {
                    avatarHtml = `<img src="${char.portrait}" class="char-avatar-img" alt="${char.name}">`;
                } else if (char.avatar && (char.avatar.includes('/') || char.avatar.includes('.'))) {
                    avatarHtml = `<img src="${char.avatar}" class="char-avatar-img" alt="${char.name}">`;
                } else {
                    avatarHtml = `<span class="char-avatar-emoji">${char.avatar}</span>`;
                }

                card.innerHTML = `
                    <div class="selected-mark">✔</div>
                    <div class="card-inner">
                        <div class="char-header">
                            <div class="char-ink-bg">✦</div>
                            <div class="char-avatar-wrapper">
                                ${avatarHtml}
                            </div>
                        </div>
                        <div class="char-body">
                            <div class="char-name">${char.name}</div>
                            <div class="char-title">${char.title}</div>
                            <div class="char-desc">${char.description}</div>
                            
                            <div class="char-relic-info">
                                <div class="relic-name"><span>🔮</span> ${char.relic.name}</div>
                                <div class="relic-desc">${char.relic.desc}</div>
                            </div>
                            
                            <div class="char-stats-preview">
                                <div class="stat-item">
                                    <span class="stat-value">${char.stats.maxHp}</span>
                                    <span class="stat-label">HP</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">${char.stats.energy}</span>
                                    <span class="stat-label">灵力</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">${char.stats.draw || 5}</span>
                                    <span class="stat-label">抽牌</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                if (!locked) {
                    card.addEventListener('click', () => {
                        this.selectCharacter(charId);
                    });
                }

                cardsContainer.appendChild(card);
            }
            container.appendChild(cardsContainer);
        }

        const confirmBtn = document.getElementById('confirm-character-btn');
        if (confirmBtn) confirmBtn.disabled = true;

        this.showScreen('character-selection-screen');
    }

    // 选择角色
    selectCharacter(charId) {
        this.selectedCharacterId = charId;
        const cards = document.querySelectorAll('.character-card');
        cards.forEach(c => {
            if (c.dataset.id === charId) c.classList.add('selected');
            else c.classList.remove('selected');
        });
        const confirmBtn = document.getElementById('confirm-character-btn');
        if (confirmBtn) confirmBtn.disabled = false;
    }

    // 确认选择
    confirmCharacterSelection() {
        if (!this.selectedCharacterId) return;

        // 云功能可用时才强制登录
        if (this.shouldForceCloudLogin()) {
            this.showLoginModal();
            return;
        }

        // 清除旧存档，开始新游戏
        this.clearSave();
        this.startNewGame(this.selectedCharacterId);
    }

    // 开始新游戏
    startNewGame(characterId = 'linFeng') {
        // 游客模式下允许离线开始，不强制登录
        if (this.shouldForceCloudLogin()) {
            this.showLoginModal();
            return;
        }

        this.player.reset(characterId);
        this.player.realm = 1;
        this.player.floor = 0;
        this.comboCount = 0;
        this.lastCardType = null;
        this.runStartTime = Date.now();
        this.currentBattleNode = null;
        this.rewardCardSelected = false;
        this.encounterState = this.createDefaultEncounterState();

        // 恢复解锁进度（如果从旧存档继承）
        if (this.tempPreservedRealms && Array.isArray(this.tempPreservedRealms)) {
            this.unlockedRealms = this.tempPreservedRealms;
            this.tempPreservedRealms = null; // Consume
            console.log('Restored unlocked realms from previous save:', this.unlockedRealms);
        } else {
            // 否则初始为1
            this.unlockedRealms = [1];
        }

        // Initialize Registration Time if new run
        if (!this.player.registerTime) {
            this.player.registerTime = Date.now();
        }

        // 应用局外传承加成（仅影响新的一轮）
        const legacyBonuses = this.getLegacyBonuses();
        this.applyLegacyBonusesToPlayer(this.player, legacyBonuses);
        this.applyLegacyRunDoctrine(
            this.player,
            this.legacyProgress?.lastPreset || null,
            this.legacyProgress?.secondaryPreset || null
        );
        this.applyLegacyRunMission(this.player, this.legacyProgress?.lastPreset || null);

        // 应用永久起始加成
        const bonuses = this.achievementSystem.loadStartBonuses();
        if (bonuses.maxHp) {
            this.player.maxHp += bonuses.maxHp;
            this.player.currentHp = this.player.maxHp;
        }
        if (bonuses.strength) this.player.buffs.strength = bonuses.strength;
        if (bonuses.gold) this.player.gold += bonuses.gold;
        if (bonuses.draw) this.player.drawCount += bonuses.draw;

        // 清空地图数据，确保startRealm不会误判为继续游戏
        if (this.map) {
            this.map.nodes = [];
            this.map.bossNode = null;
        }

        // 不直接生成地图，而是去选关界面
        this.showScreen('realm-select-screen');
        this.autoSave();
    }

    // 显示角色详情（主菜单）
    showPlayerInfo() {
        // 优先显示当前玩家对象的角色，没有则默认为林风
        const charId = (this.player && this.player.characterId) ? this.player.characterId : 'linFeng';

        const char = CHARACTERS[charId];
        if (!char) return;

        // 更新界面
        const avatarEl = document.getElementById('info-char-avatar');
        const nameEl = document.getElementById('info-char-name');
        const titleEl = document.getElementById('info-char-title');
        const descEl = document.getElementById('info-char-desc');
        const hpEl = document.getElementById('char-hp');
        const energyEl = document.getElementById('char-energy');
        const cosmetic = this.getEquippedCosmeticsProfile();
        const equippedTitle = cosmetic && cosmetic.title ? cosmetic.title.name : null;
        const equippedSkin = cosmetic && cosmetic.skin ? cosmetic.skin : null;

        if (avatarEl) {
            avatarEl.textContent = equippedSkin ? (equippedSkin.icon || '👘') : char.avatar;
            avatarEl.classList.toggle('pvp-skin-avatar', !!equippedSkin);
        }
        if (nameEl) nameEl.textContent = `${char.name} · ${char.title}`;
        if (titleEl) {
            if (equippedTitle) {
                const titleName = String(equippedTitle).replace(/^称号·/, '');
                titleEl.textContent = `称号·${titleName}`;
            } else {
                titleEl.textContent = '逆命印记';
            }
            titleEl.className = 'imprint-badge';
        }
        if (descEl) descEl.textContent = char.description;
        if (hpEl) hpEl.textContent = char.stats.maxHp;
        if (energyEl) energyEl.textContent = char.stats.energy;

        this.showScreen('character-select');
    }

    // 更新界面上的玩家显示（名字、头像等）
    updatePlayerDisplay() {
        if (!this.player) return;

        const charId = this.player.characterId || 'linFeng';
        // Add Fallback for missing character data
        const char = (typeof CHARACTERS !== 'undefined' && CHARACTERS[charId]) ? CHARACTERS[charId] : { name: '未知修士' };
        const cosmetic = this.getEquippedCosmeticsProfile();
        const equippedSkin = cosmetic && cosmetic.skin ? cosmetic.skin : null;

        const battleNameEl = document.getElementById('player-name-display');
        if (battleNameEl) {
            battleNameEl.textContent = char.name;
        }

        // Update Avatar (Image or Emoji)
        const faceEl = document.getElementById('player-face-display');
        if (faceEl) {
            // Reset styles
            faceEl.style.backgroundImage = '';
            faceEl.textContent = '';
            faceEl.className = 'player-face-visual';
            faceEl.removeAttribute('title');

            // Resolve Image Path: Check .image, .portrait (WuYu), or .avatar (Yan Han if path)
            const imagePath = char.image || char.portrait || (char.avatar && char.avatar.includes('/') ? char.avatar : null);

            if (imagePath) {
                faceEl.style.backgroundImage = `url('${imagePath}')`;
                faceEl.classList.add('is-image');
                if (equippedSkin) {
                    faceEl.classList.add('skin-equipped');
                    faceEl.title = `已激活法相：${equippedSkin.name || '未知法相'}`;
                }
            } else {
                faceEl.textContent = equippedSkin ? (equippedSkin.icon || '👘') : (char.avatar || '👤');
                if (equippedSkin) {
                    faceEl.classList.add('skin-equipped');
                    faceEl.title = `已激活法相：${equippedSkin.name || '未知法相'}`;
                }
            }

            const avatarWrap = faceEl.closest('.player-avatar');
            if (avatarWrap) {
                avatarWrap.classList.toggle('skin-equipped', !!equippedSkin);
                let badge = avatarWrap.querySelector('.player-skin-badge');
                if (equippedSkin) {
                    if (!badge) {
                        badge = document.createElement('div');
                        badge.className = 'player-skin-badge';
                        avatarWrap.appendChild(badge);
                    }
                    const skinName = String(equippedSkin.name || '法相').replace(/^法相·/, '');
                    badge.textContent = `${equippedSkin.icon || '👘'} ${skinName}`;
                } else if (badge) {
                    badge.remove();
                }
            }
        }

        // 更新属性显示
        const strengthEl = document.getElementById('char-strength');
        // 检查永久Buff中的力量
        let strength = 0;
        if (this.player.permaBuffs && this.player.permaBuffs.strength) {
            strength = this.player.permaBuffs.strength;
        }
        // 如果在战斗中，加上临时Buff
        if (this.player.buffs && this.player.buffs.strength) {
            strength = this.player.buffs.strength; // buffs usually formatted as total value? check addBuff
            // addBuff accumulates: this.buffs[type] += value
            // Since prepareBattle calls addBuff for permBuffs, this.buffs.strength ALREADY includes permBuffs during battle.
            // But checking this.player.buffs.strength is safer if we are in battle.
            // If NOT in battle, use permBuffs.
        }

        // Better logic:
        let displayStrength = 0;
        if (this.battle && !this.battle.battleEnded && this.player.buffs.strength) {
            displayStrength = this.player.buffs.strength;
        } else if (this.player.permaBuffs && this.player.permaBuffs.strength) {
            displayStrength = this.player.permaBuffs.strength;
        }

        if (strengthEl) {
            strengthEl.textContent = displayStrength > 0 ? displayStrength : '-';
            strengthEl.parentElement.style.display = displayStrength > 0 ? 'flex' : 'none';
        }
    }

    prepareEnemyForEndlessBattle(enemy, modifiers) {
        if (!enemy || typeof enemy !== 'object') return enemy;
        let cloned = null;
        try {
            cloned = JSON.parse(JSON.stringify(enemy));
        } catch (e) {
            cloned = { ...enemy };
            if (Array.isArray(enemy.patterns)) {
                cloned.patterns = enemy.patterns.map((pattern) => ({ ...pattern }));
            }
            if (enemy.gold && typeof enemy.gold === 'object') {
                cloned.gold = { ...enemy.gold };
            }
        }

        if (!cloned.buffs || typeof cloned.buffs !== 'object') {
            cloned.buffs = {};
        }

        const hpMul = Math.max(1, Number(modifiers.enemyHpMul) || 1);
        const atkMul = Math.max(1, Number(modifiers.enemyAtkMul) || 1);
        const goldMul = Math.max(1, Number(modifiers.rewardGoldMul) || 1);
        const pressureProfile = (typeof this.getEndlessPressureBehaviorProfile === 'function')
            ? this.getEndlessPressureBehaviorProfile()
            : null;
        const phaseProfile = (typeof this.getEndlessPhaseProfile === 'function')
            ? this.getEndlessPhaseProfile()
            : null;
        const cycleTheme = (typeof this.getEndlessCycleThemeProfile === 'function')
            ? this.getEndlessCycleThemeProfile()
            : null;

        const baseHp = Number(cloned.maxHp || cloned.hp || cloned.currentHp || 1);
        const nextHp = Math.max(1, Math.floor(baseHp * hpMul));
        cloned.maxHp = nextHp;
        cloned.hp = nextHp;
        cloned.currentHp = nextHp;

        if (Array.isArray(cloned.patterns)) {
            cloned.patterns = cloned.patterns.map((pattern) => {
                if (!pattern || typeof pattern !== 'object') return pattern;
                const next = { ...pattern };
                if ((next.type === 'attack' || next.type === 'multiAttack' || next.type === 'executeDamage')
                    && Number.isFinite(next.value)) {
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
            const attackPatterns = cloned.patterns.filter((pattern) =>
                pattern &&
                typeof pattern === 'object' &&
                (pattern.type === 'attack' || pattern.type === 'multiAttack' || pattern.type === 'executeDamage') &&
                Number.isFinite(Number(pattern.value))
            );

            if (attackPatterns.length > 0 && pressureProfile.extraAttackPatterns > 0) {
                const sortedAttackPatterns = attackPatterns
                    .slice()
                    .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));

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
            const attackPatterns = cloned.patterns.filter((pattern) =>
                pattern &&
                typeof pattern === 'object' &&
                (pattern.type === 'attack' || pattern.type === 'multiAttack' || pattern.type === 'executeDamage') &&
                Number.isFinite(Number(pattern.value))
            );
            const defendPatterns = cloned.patterns.filter((pattern) =>
                pattern &&
                typeof pattern === 'object' &&
                (pattern.type === 'defend' || pattern.type === 'heal')
            );
            const hasDebuffPattern = cloned.patterns.some((pattern) =>
                pattern &&
                typeof pattern === 'object' &&
                (pattern.type === 'debuff' || pattern.type === 'addStatus')
            );
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
                const multi = cloned.patterns.find((pattern) => pattern && pattern.type === 'multiAttack');
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
                cloned.__endlessAntiBurst = Math.max(
                    Math.floor(Number(cloned.__endlessAntiBurst) || 0),
                    1
                );
            } else if (directive === 'frenzy') {
                if (attackPatterns.length > 0) {
                    const burst = attackPatterns
                        .slice()
                        .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))[0];
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
                } else if (!cloned.patterns.some((pattern) => pattern && pattern.type === 'heal')) {
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
            enemy.patterns.push({ ...picked.appendPattern });
        }
    }

    // 开始战斗 - 保存当前节点
    startBattle(enemies, node = null) {
        const rawEnemyList = Array.isArray(enemies) ? enemies : [enemies];
        const enemyList = rawEnemyList.filter(Boolean);
        const isPvpBattle = enemyList.some(e => e && e.isGhost);
        this.mode = isPvpBattle ? 'pvp' : 'pve';
        if (!isPvpBattle) {
            this.pvpOpponentRank = null;
            this.pvpMatchTicket = null;
            if (typeof PVPService !== 'undefined' && typeof PVPService.clearActiveMatch === 'function') {
                PVPService.clearActiveMatch();
            }
        }

        let battleEnemies = enemyList;
        if (!isPvpBattle && this.isEndlessActive()) {
            const mods = this.getEndlessModifiers();
            battleEnemies = enemyList.map((enemy) => this.prepareEnemyForEndlessBattle(enemy, mods));
            this.applyEndlessPreBattleBonuses();
        }

        this.currentEnemies = battleEnemies;
        this.currentBattleNode = node;
        this.stealAttempted = false;
        this.rewardCardSelected = false;
        this.comboCount = 0;
        this.lastCardType = null;

        this.showScreen('battle-screen');
        this.battle.init(battleEnemies);

        // 隐藏连击显示
        this.hideCombo();
    }

    // 处理连击
    handleCombo(cardType) {
        if (cardType === 'attack') {
            if (this.lastCardType === 'attack') {
                this.comboCount++;
                this.showCombo();
            } else {
                this.comboCount = 1;
                this.hideCombo();
            }
        } else {
            this.comboCount = 0;
            this.hideCombo();
        }
        this.lastCardType = cardType;

        // 更新成就统计
        this.achievementSystem.updateStat('maxCombo', this.comboCount, 'max');
    }

    // 获取连击加成
    getComboBonus() {
        if (this.comboCount < 2) return 0;
        if (this.comboCount === 2) return 0.1;
        if (this.comboCount === 3) return 0.25;
        return 0.5;
    }

    // 显示连击
    showCombo() {
        if (this.comboCount < 2) return;

        const display = document.getElementById('combo-display');
        const countEl = document.getElementById('combo-count');
        const bonusEl = document.getElementById('combo-bonus');

        if (display && countEl && bonusEl) {
            countEl.textContent = this.comboCount;
            const bonus = Math.floor(this.getComboBonus() * 100);
            bonusEl.textContent = `伤害+${bonus}%`;

            // 设置等级
            display.className = 'combo-display show';
            if (this.comboCount >= 4) display.classList.add('level-4');
            else if (this.comboCount >= 3) display.classList.add('level-3');
            else display.classList.add('level-2');
        }
    }

    // 隐藏连击
    hideCombo() {
        const display = document.getElementById('combo-display');
        if (display) {
            display.classList.remove('show');
        }
    }

    // 战斗胜利
    async onBattleWon(enemies) {
        if (this.mode === 'pvp') {
            await this.handlePVPVictory();
            return;
        }

        this.lastBattleRewardMeta = null;

        const enemyList = Array.isArray(enemies) ? enemies.filter(Boolean) : [enemies].filter(Boolean);
        const isBossBattle = enemyList.some((enemy) => !!enemy && !!enemy.isBoss);
        const endlessMods = this.isEndlessActive() ? this.getEndlessModifiers() : null;
        this.player.enemiesDefeated += enemyList.length;

        // 命环获得经验
        let ringExp = enemyList.reduce((sum, e) => sum + (e.ringExp || 10), 0);

        // 重玩收益减半
        if (this.player.isReplay) {
            ringExp = Math.floor(ringExp * 0.5);
        }

        const paranoiaEffects = this.isEndlessActive() ? this.getEndlessParanoiaEffects() : null;
        if (
            paranoiaEffects &&
            this.currentBattleNode &&
            this.currentBattleNode.type === 'enemy' &&
            Number(paranoiaEffects.normalBattleExpMul || 1) < 1
        ) {
            ringExp = Math.max(1, Math.floor(ringExp * Math.max(0.35, Number(paranoiaEffects.normalBattleExpMul) || 1)));
            Utils.showBattleLog('轮回偏执：普通战命环经验受到压制。');
        }

        // 遗物：逆命之环（额外获得25%经验）
        if (this.player.relic && this.player.relic.id === 'fateRing') {
            ringExp = Math.floor(ringExp * 1.10);
        }

        // 新节点：试炼节点额外收益
        if (this.currentBattleNode && this.currentBattleNode.type === 'trial') {
            ringExp = Math.floor(ringExp * 1.5);
            const trialGoldMultiplier = endlessMods ? Math.max(1, endlessMods.rewardGoldMul) : 1;
            const trialGold = Math.floor((80 + this.player.realm * 15) * trialGoldMultiplier);
            this.player.gold += trialGold;
            Utils.showBattleLog(`试炼胜利！额外获得 ${trialGold} 灵石`);
        }

        // 试炼挑战检测 (Trial Challenge)
        if (this.activeTrial) {
            let trialSuccess = false;
            // 获取回合数 (assuming battle object exists and persists turnNumber)
            // this.battle 应该是当前战斗实例

            if (this.activeTrial === 'speedKill') {
                const limit = (this.trialData && this.trialData.rounds) ? this.trialData.rounds : 3;
                if (this.battle && this.battle.turnNumber <= limit) {
                    trialSuccess = true;
                }
            } else if (this.activeTrial === 'noDamage') {
                if (this.battle && !this.battle.playerTookDamage) {
                    trialSuccess = true;
                }
            }

            if (trialSuccess) {
                Utils.showBattleLog('⚡ 试炼完成！获得额外奖励！');

                if (this.trialData.rewardMultiplier) {
                    ringExp = Math.floor(ringExp * this.trialData.rewardMultiplier);
                    this.player.gold += 50;
                    Utils.showBattleLog(`奖励翻倍！获得额外 50 灵石`);
                }
                if (this.trialData.reward === 'law') {
                    // 奖励一张随机法则牌
                    const randomLawKey = Object.keys(LAWS)[Math.floor(Math.random() * Object.keys(LAWS).length)];
                    const law = LAWS[randomLawKey];
                    // 只是获得卡牌还是获得法则? "reward: law" usually implies getting the law power or card.
                    // Description says "obtain rare law".
                    // Let's force add law to player (if not duplicate)
                    if (this.player.collectLaw(law)) {
                        Utils.showBattleLog(`领悟法则：${law.name}`);
                        this.achievementSystem.updateStat('lawsCollected', 1); // Update Achievement
                    } else {
                        // Fallback if already exists
                        this.player.gold += 100;
                        Utils.showBattleLog(`法则已存在，转化为 100 灵石`);
                    }
                }
            } else {
                Utils.showBattleLog('试炼失败...');
            }
            // Clear trial state
            this.activeTrial = null;
            this.trialData = null;
        }

        if (endlessMods) {
            const prevExp = ringExp;
            ringExp = Math.max(1, Math.floor(ringExp * Math.max(1, endlessMods.rewardExpMul)));
            if (ringExp > prevExp) {
                Utils.showBattleLog(`无尽轮回：命环经验倍率生效（x${endlessMods.rewardExpMul.toFixed(2)}）`);
            }
        }

        const rewardMeta = {
            encounter: null,
            squad: null
        };

        const encounterVictory = (this.battle && typeof this.battle.consumeEncounterVictoryBonusSummary === 'function')
            ? this.battle.consumeEncounterVictoryBonusSummary()
            : null;
        if (encounterVictory) {
            const bonusGold = Math.max(0, Math.floor(Number(encounterVictory.goldBonus) || 0));
            const bonusExp = Math.max(0, Math.floor(Number(encounterVictory.ringExpBonus) || 0));
            if (bonusGold > 0) {
                this.player.gold += bonusGold;
                Utils.showBattleLog(`遭遇战利·${encounterVictory.themeName}：额外获得 ${bonusGold} 灵石`);
            }
            if (bonusExp > 0) {
                ringExp += bonusExp;
                Utils.showBattleLog(`遭遇战利·${encounterVictory.themeName}：命环经验 +${bonusExp}`);
            }
            if (Array.isArray(encounterVictory.adventureBuffRewards) && this.player && typeof this.player.grantAdventureBuff === 'function') {
                encounterVictory.adventureBuffRewards.forEach((item) => {
                    if (!item || !item.id) return;
                    const ok = this.player.grantAdventureBuff(item.id, item.charges || 1);
                    if (ok) {
                        const shownCharges = Math.max(1, Math.floor(Number(item.charges) || 1));
                        Utils.showBattleLog(`遭遇馈赠：${item.label || item.id} x${shownCharges}`);
                    }
                });
            }
            if (typeof this.recordEncounterThemeVictory === 'function') {
                this.recordEncounterThemeVictory(encounterVictory);
            }
            rewardMeta.encounter = {
                themeId: encounterVictory.themeId || 'encounter',
                themeName: encounterVictory.themeName || '遭遇奖励',
                tierStage: Math.max(1, Math.min(3, Math.floor(Number(encounterVictory.tierStage) || 1))),
                goldBonus: bonusGold,
                ringExpBonus: bonusExp
            };
        }

        const squadVictory = (this.battle && typeof this.battle.consumeSquadEcologyVictoryBonusSummary === 'function')
            ? this.battle.consumeSquadEcologyVictoryBonusSummary()
            : null;
        if (squadVictory) {
            const bonusGold = Math.max(0, Math.floor(Number(squadVictory.goldBonus) || 0));
            const bonusExp = Math.max(0, Math.floor(Number(squadVictory.ringExpBonus) || 0));
            if (bonusGold > 0) {
                this.player.gold += bonusGold;
                Utils.showBattleLog(`敌阵战利·${squadVictory.squadName}：额外获得 ${bonusGold} 灵石`);
            }
            if (bonusExp > 0) {
                ringExp += bonusExp;
                Utils.showBattleLog(`敌阵战利·${squadVictory.squadName}：命环经验 +${bonusExp}`);
            }
            if (Array.isArray(squadVictory.adventureBuffRewards) && this.player && typeof this.player.grantAdventureBuff === 'function') {
                squadVictory.adventureBuffRewards.forEach((item) => {
                    if (!item || !item.id) return;
                    const ok = this.player.grantAdventureBuff(item.id, item.charges || 1);
                    if (ok) {
                        const shownCharges = Math.max(1, Math.floor(Number(item.charges) || 1));
                        Utils.showBattleLog(`编队启示：${item.label || item.id} x${shownCharges}`);
                    }
                });
            }
            if (squadVictory.synergy && squadVictory.synergy.themeName) {
                Utils.showBattleLog(`轮段协同：${squadVictory.synergy.themeName} 与敌阵共振，战利额外提升`);
            }
            rewardMeta.squad = {
                squadId: squadVictory.squadId || 'squad',
                squadName: squadVictory.squadName || '敌阵战利',
                goldBonus: bonusGold,
                ringExpBonus: bonusExp,
                synergyThemeName: squadVictory.synergy && squadVictory.synergy.themeName
                    ? squadVictory.synergy.themeName
                    : ''
            };
        }
        if (rewardMeta.encounter || rewardMeta.squad) {
            this.lastBattleRewardMeta = rewardMeta;
        }

        const adventureGoldBonus = (this.player && typeof this.player.consumeAdventureVictoryGoldBoost === 'function')
            ? this.player.consumeAdventureVictoryGoldBoost(40 + this.player.realm * 12)
            : 0;
        if (adventureGoldBonus > 0) {
            this.player.gold += adventureGoldBonus;
            Utils.showBattleLog(`悬赏契约：额外获得 ${adventureGoldBonus} 灵石`);
        }

        const adventureExpBonus = (this.player && typeof this.player.consumeAdventureRingExpBoost === 'function')
            ? this.player.consumeAdventureRingExpBoost(ringExp)
            : 0;
        if (adventureExpBonus > 0) {
            ringExp += adventureExpBonus;
            Utils.showBattleLog(`行旅悟境：本场命环经验额外 +${adventureExpBonus}`);
        }

        if (this.player.currentHp < this.player.maxHp) {
            const adventureHealBonus = (this.player && typeof this.player.consumeAdventureVictoryHealBoost === 'function')
                ? this.player.consumeAdventureVictoryHealBoost(this.player.maxHp)
                : 0;
            if (adventureHealBonus > 0) {
                const hpBefore = this.player.currentHp;
                this.player.heal(adventureHealBonus);
                const restored = this.player.currentHp - hpBefore;
                if (restored > 0) {
                    Utils.showBattleLog(`战地医护：战后恢复 ${restored} 生命`);
                }
            }
        }

        this.player.fateRing.exp += ringExp;
        const levelUp = this.player.checkFateRingLevelUp();

        if (levelUp) {
            // 命环升级触发微弱的法则波动，虽然现在还不足以引来天罚者，但随着等级提升...
            Utils.showBattleLog("命环突破！法则波动引起了未知的注视...");
            // 将来可以在这里根据level触发特定事件或对话
        }

        // 非Boss节点即时完成；Boss改由 handleBossDefeated 统一处理，避免双重结算。
        if (this.currentBattleNode && !isBossBattle) {
            this.map.completeNode(this.currentBattleNode);
        }

        if (!isBossBattle) {
            // 自动保存
            this.autoSave();
        }

        // 更新成就统计
        this.achievementSystem.updateStat('enemiesDefeated', enemyList.length);

        if (isBossBattle) {
            const bossEnemy = enemyList.find((enemy) => enemy && enemy.isBoss) || enemyList[0] || null;
            await this.handleBossDefeated(bossEnemy, enemyList, ringExp);
            return;
        }

        // 正常显示奖励
        this.showScreen('reward-screen');
        this.generateRewards(enemyList, ringExp);
    }

    async handleBossDefeated(bossEnemy = null, enemyList = [], ringExp = 0) {
        const bossName = bossEnemy && bossEnemy.name ? bossEnemy.name : '天劫主宰';
        if (ringExp > 0) {
            Utils.showBattleLog(`击破 ${bossName}，命环经验 +${ringExp}`);
        } else {
            Utils.showBattleLog(`击破 ${bossName}！`);
        }

        const node = this.currentBattleNode;
        if (node && !node.completed) {
            this.map.completeNode(node);
        } else if (!node) {
            // 兜底：若节点丢失则仍推进关卡，避免卡死在战斗界面
            this.onRealmComplete();
        }
        this.currentBattleNode = null;

        if (!this.isEndlessActive()) {
            this.autoSave();
        }
    }

    // === PVP Result Handlers ===

    async handlePVPVictory() {
        console.log('PVP Victory!');
        const overlay = document.getElementById('pvp-result-overlay');
        const title = document.getElementById('pvp-result-title');
        const scoreVal = document.getElementById('pvp-current-score');
        const deltaVal = document.getElementById('pvp-score-delta');
        const oppName = document.getElementById('pvp-result-opponent');
        const oppScore = document.getElementById('pvp-result-opp-score');

        // Report
        let result = {
            newRating: (typeof PVPService !== 'undefined' && PVPService.currentRankData) ? (PVPService.currentRankData.score || 1000) : 1000,
            delta: 0,
            coinsAwarded: 0
        };
        try {
            if (typeof PVPService !== 'undefined') {
                result = await PVPService.reportMatchResult(true, this.pvpOpponentRank, this.pvpMatchTicket);
            }
        } catch (e) {
            console.error('PVP Report Failed:', e);
        } finally {
            this.pvpMatchTicket = null;
        }

        // Update UI
        if (overlay) {
            overlay.className = 'screen pvp-result-overlay victory'; // Add victory class
            overlay.style.display = 'flex';

            title.textContent = '问道成功';
            scoreVal.textContent = result.newRating;
            // Fix: EloCalculator returns 'delta', not 'ratingChange'
            const change = result.delta !== undefined ? result.delta : (result.ratingChange || 0);
            deltaVal.textContent = change >= 0 ? `+${change}` : `${change}`;

            if (this.pvpOpponentRank && this.pvpOpponentRank.user) {
                oppName.textContent = this.pvpOpponentRank.user.username || '未知对手';
                oppScore.textContent = this.pvpOpponentRank.score || 1000;
            }
        }
        if (result && Number(result.coinsAwarded) > 0) {
            Utils.showBattleLog(`天道币 +${Math.floor(Number(result.coinsAwarded))}`);
        }
        if (result && result.rejected) {
            Utils.showBattleLog('PVP 结算校验未通过，本场积分未变动。');
        }
        this.autoSave();
    }

    async handlePVPDefeat() {
        console.log('PVP Defeat...');
        const overlay = document.getElementById('pvp-result-overlay');
        const title = document.getElementById('pvp-result-title');
        const scoreVal = document.getElementById('pvp-current-score');
        const deltaVal = document.getElementById('pvp-score-delta');
        const oppName = document.getElementById('pvp-result-opponent');
        const oppScore = document.getElementById('pvp-result-opp-score');

        // Report
        let result = {
            newRating: (typeof PVPService !== 'undefined' && PVPService.currentRankData) ? (PVPService.currentRankData.score || 1000) : 1000,
            delta: 0,
            coinsAwarded: 0
        };
        try {
            if (typeof PVPService !== 'undefined') {
                result = await PVPService.reportMatchResult(false, this.pvpOpponentRank, this.pvpMatchTicket);
            }
        } catch (e) {
            console.error('PVP Report Failed:', e);
        } finally {
            this.pvpMatchTicket = null;
        }

        // Update UI
        if (overlay) {
            overlay.className = 'screen pvp-result-overlay defeat'; // Add defeat class
            overlay.style.display = 'flex';

            title.textContent = '道心受损';
            scoreVal.textContent = result.newRating;
            const change = result.delta !== undefined ? result.delta : (result.ratingChange || 0);
            deltaVal.textContent = `${change}`; // Usually negative

            if (this.pvpOpponentRank && this.pvpOpponentRank.user) {
                oppName.textContent = this.pvpOpponentRank.user.username || '未知对手';
                oppScore.textContent = this.pvpOpponentRank.score || 1000;
            }
        }
        if (result && Number(result.coinsAwarded) > 0) {
            Utils.showBattleLog(`天道币 +${Math.floor(Number(result.coinsAwarded))}`);
        }
        if (result && result.rejected) {
            Utils.showBattleLog('PVP 结算校验未通过，本场积分未变动。');
        }
        this.autoSave();
    }

    closePVPResult() {
        const overlay = document.getElementById('pvp-result-overlay');
        if (overlay) overlay.style.display = 'none';
        this.mode = 'pve';
        this.pvpMatchTicket = null;
        this.pvpOpponentRank = null;
        if (typeof PVPService !== 'undefined' && typeof PVPService.clearActiveMatch === 'function') {
            PVPService.clearActiveMatch();
        }

        // Return to PVP Screen
        this.showScreen('pvp-screen');
        // Refresh Rank
        if (window.PVPScene && typeof PVPScene.loadRankings === 'function') {
            PVPScene.loadRankings();
        } else if (window.PVPScene && typeof PVPScene.loadRanking === 'function') {
            // Fallback/Correction just in case
            PVPScene.loadRanking();
        } else {
            // Direct call if available globally or assume standard name
            if (typeof PVPScene !== 'undefined') PVPScene.loadRankings();
        }
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
        if (this.player.isReplay || this.player.isRecultivation) {
            totalGold = Math.floor(totalGold * 0.5);
        }

        // Hardcore: 全局战斗灵石收益降低
        totalGold = Math.floor(totalGold * 0.75);

        if (
            this.isEndlessActive && this.isEndlessActive() &&
            this.currentBattleNode &&
            this.currentBattleNode.type === 'enemy'
        ) {
            const paranoiaEffects = this.getEndlessParanoiaEffects ? this.getEndlessParanoiaEffects() : null;
            const rewardMul = Math.max(0.35, Number(paranoiaEffects?.normalBattleRewardMul) || 1);
            if (rewardMul < 1) {
                totalGold = Math.floor(totalGold * rewardMul);
                Utils.showBattleLog('轮回偏执：普通战灵石掉落减少。');
            }
        }

        const nodeType = this.currentBattleNode && this.currentBattleNode.type ? this.currentBattleNode.type : '';
        const strategicGain = this.grantStrategicCurrencies(
            this.getBattleStrategicCurrencyRewards(nodeType),
            nodeType === 'boss' ? '击破章节主宰' : '高压战利'
        );

        this.player.gold += totalGold;
        this.achievementSystem.updateStat('totalGold', totalGold);
        this.achievementSystem.updateStat('enemiesDefeated', enemies.length);
        if (this.player.realm) {
            this.achievementSystem.updateStat('realmCleared', this.player.realm, 'max');
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

    renderRewardBattleMeta() {
        const panel = document.getElementById('reward-battle-meta');
        if (!panel) return;
        const meta = this.lastBattleRewardMeta;
        if (!meta || (typeof meta !== 'object') || (!meta.encounter && !meta.squad)) {
            panel.style.display = 'none';
            panel.innerHTML = '';
            return;
        }

        const chips = [];
        if (meta.encounter) {
            chips.push(
                `<span class="reward-meta-chip chip-encounter">遭遇战利：${meta.encounter.themeName}（${'I'.repeat(Math.max(1, Math.min(3, Number(meta.encounter.tierStage) || 1)))}阶）</span>`,
                `<span class="reward-meta-chip chip-gold">遭遇灵石 +${Math.max(0, Math.floor(Number(meta.encounter.goldBonus) || 0))}</span>`,
                `<span class="reward-meta-chip chip-exp">遭遇命环经验 +${Math.max(0, Math.floor(Number(meta.encounter.ringExpBonus) || 0))}</span>`
            );
        }
        if (meta.squad) {
            chips.push(
                `<span class="reward-meta-chip chip-squad">敌阵战利：${meta.squad.squadName}</span>`,
                `<span class="reward-meta-chip chip-gold">编队灵石 +${Math.max(0, Math.floor(Number(meta.squad.goldBonus) || 0))}</span>`,
                `<span class="reward-meta-chip chip-exp">编队命环经验 +${Math.max(0, Math.floor(Number(meta.squad.ringExpBonus) || 0))}</span>`
            );
            if (meta.squad.synergyThemeName) {
                chips.push(`<span class="reward-meta-chip chip-synergy">轮段协同：${meta.squad.synergyThemeName}</span>`);
            }
        }

        panel.style.display = 'block';
        panel.innerHTML = `
            <div class="reward-meta-title">本场战利来源</div>
            <div class="reward-meta-chips">${chips.join('')}</div>
        `;
    }

    // 显示奖励界面
    getRewardCardsForCurrentRun(count = 2) {
        const safeCount = Math.max(1, Math.floor(Number(count) || 2));
        if (!this.player) return getRewardCards(safeCount, null, []);
        const endlessMods = this.isEndlessActive() ? this.getEndlessModifiers() : null;
        const rumorRareBonus = this.consumeRewardRumorBoost();
        const rareBonus = Math.max(0, Number(endlessMods?.rewardRareChance) || 0) + Math.max(0, rumorRareBonus);
        if (rareBonus <= 0) {
            return getRewardCards(safeCount, this.player.characterId, this.player.deck);
        }

        const picked = [];
        const seen = new Set();
        const archetype = typeof inferDeckArchetype === 'function' ? inferDeckArchetype(this.player.deck) : null;
        for (let i = 0; i < safeCount; i += 1) {
            let card = null;
            for (let attempt = 0; attempt < 10; attempt += 1) {
                const forceRare = Math.random() < Math.min(0.86, 0.18 + rareBonus);
                const forceEpic = forceRare && Math.random() < 0.18;
                if (forceRare) {
                    card = getRandomCard(forceEpic ? 'epic' : 'rare', this.player.characterId);
                } else if (archetype && typeof getRandomArchetypeCard === 'function' && Math.random() < 0.55) {
                    card = getRandomArchetypeCard(archetype, null, this.player.characterId);
                } else {
                    card = getRandomCard(null, this.player.characterId);
                }
                if (!card) continue;
                if (seen.has(card.id) && attempt < 9) continue;
                break;
            }
            if (!card) {
                const fallback = getRewardCards(1, this.player.characterId, this.player.deck);
                card = Array.isArray(fallback) ? fallback[0] : null;
            }
            if (card) {
                picked.push(card);
                seen.add(card.id);
            }
        }
        return picked;
    }


    showRewardScreen(gold, canSteal, stealEnemy, ringExp = 0, strategicGain = null) {
        this.rewardCardSelected = false; // 重置选牌状态

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
        this.setRewardScreenState('hidden');

        const bonusParts = [];
        const gainPayload = strategicGain && typeof strategicGain === 'object' ? strategicGain : {};
        if (Number(gainPayload.insight) > 0) bonusParts.push(`天机 +${Math.floor(Number(gainPayload.insight) || 0)}`);
        if (Number(gainPayload.karma) > 0) bonusParts.push(`业果 +${Math.floor(Number(gainPayload.karma) || 0)}`);
        rewardGold.textContent = `+${gold} 灵石 | 命环经验 +${ringExp}${bonusParts.length > 0 ? ' | ' + bonusParts.join(' | ') : ''}`;
        this.renderRewardBattleMeta();

        // 法宝掉落判定
        const resourceContainer = document.querySelector('.reward-resources');
        // 清理旧的掉落显示
        const existingTreasures = resourceContainer.querySelectorAll('.reward-treasure-item, .reward-strategy-item');
        existingTreasures.forEach(el => el.remove());

        if (resourceContainer) {
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
        if (this.currentBattleNode && this.currentBattleNode.type === 'elite') dropChance = 0.25; // Hardcore: 精英25%
        if (this.currentBattleNode && this.currentBattleNode.type === 'boss') dropChance = 0.60; // Hardcore: Boss 60%
        if (this.currentBattleNode && this.currentBattleNode.type === 'ghost_duel') dropChance = 0.3;
        dropChance += Math.max(0, this.consumeTreasureRumorBoost(this.currentBattleNode?.type || ''));

        if (Math.random() < dropChance) {
            let droppedTreasure = null;

            // Boss特定掉落逻辑：检查击败的敌人是否有克制法宝
            if (this.currentBattleNode && this.currentBattleNode.type === 'boss' && this.battle && this.battle.enemies) {
                const bossEnemy = this.battle.enemies.find(e => e.isBoss);
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
                    const unownedCounters = counterTreasures.filter(t => !this.player.hasTreasure(t.id));

                    // 50%概率掉落克制法宝，50%概率随机
                    if (unownedCounters.length > 0 && Math.random() < 0.5) {
                        droppedTreasure = unownedCounters[Math.floor(Math.random() * unownedCounters.length)];
                        Utils.showBattleLog(`【Boss战利品】获得克制法宝！`);
                    }
                }
            }

            // 如果没有特定掉落，使用权重随机
            if (!droppedTreasure) {
                droppedTreasure = this.getWeightedRandomTreasure();
            }

            if (droppedTreasure) {
                // 自动获取
                this.player.addTreasure(droppedTreasure.id);

                const tItem = document.createElement('div');
                tItem.className = 'reward-item reward-treasure-item';
                tItem.style.color = 'var(--accent-gold)';
                tItem.style.cursor = 'help';
                tItem.title = droppedTreasure.description;
                const label = this.getRarityLabel ? this.getRarityLabel(droppedTreasure.rarity) : '';
                const icon = droppedTreasure.icon || '📦';
                tItem.innerHTML = `<span class="icon">${icon}</span> <span>获得法宝：${droppedTreasure.name} ${label}</span>`;
                resourceContainer.appendChild(tItem);

                Utils.showBattleLog(`战斗胜利！获得法宝: ${droppedTreasure.name}`);
            }
        }

        // 法则盗取部分
        if (canSteal && stealEnemy && !this.stealAttempted) {
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
        const rewardCardCount = (this.currentBattleNode && this.currentBattleNode.type === 'trial') ? 3 : 2;
        const cards = this.getRewardCardsForCurrentRun(rewardCardCount);

        cards.forEach((card, index) => {
            const cardEl = Utils.createCardElement(card, index);
            cardEl.classList.add('reward-card');
            cardEl.classList.add(`rarity-${card.rarity || 'common'}`);

            cardEl.addEventListener('click', () => {
                // 防止重复选择
                if (this.rewardCardSelected) return;
                this.rewardCardSelected = true;

                this.selectRewardCard(card);

                // 禁用其他卡牌
                rewardCards.querySelectorAll('.card').forEach(c => {
                    if (c !== cardEl) {
                        c.style.opacity = '0.3';
                        c.style.pointerEvents = 'none';
                    }
                });
                cardEl.style.border = '3px solid var(--accent-gold)';
                cardEl.style.transform = 'scale(1.1)';
            });
            rewardCards.appendChild(cardEl);
        });

        // 动态更新跳过按钮文本
        const skipBtn = this.currentScreenElement ? this.currentScreenElement.querySelector('.skip-reward-btn') : document.querySelector('.skip-reward-btn');
        if (skipBtn) {
            const skipCost = 80 * this.player.realm;
            skipBtn.textContent = `跳过卡牌 (扣${skipCost}灵石)`;
            // Visual indicator if affordable
            if (this.player.gold < skipCost) {
                skipBtn.style.opacity = '0.6';
                skipBtn.style.cursor = 'not-allowed';
                skipBtn.title = '灵石不足';
            } else {
                skipBtn.style.opacity = '1';
                skipBtn.style.cursor = 'pointer';
                skipBtn.title = '';
            }
        }

        this.showScreen('reward-screen');
    }

    // 选择奖励卡牌
    selectRewardCard(card) {
        this.player.addCardToDeck(card);
        Utils.showBattleLog(`获得卡牌: ${card.name}`);

        // 更新成就 - 收集新卡牌
        this.achievementSystem.updateStat('uniqueCards', card.id);

        // 启用继续按钮
        const continueBtn = document.getElementById('continue-reward-btn');
        if (continueBtn) {
            continueBtn.disabled = false;
            continueBtn.textContent = '继续前进';
        }
    }

    // 跳过奖励卡牌（扣除灵石）
    skipRewardCard() {
        const cost = 50 * this.player.realm;
        if (this.player.gold >= cost) {
            this.player.gold -= cost;
            Utils.showBattleLog(`跳过卡牌奖励，扣除 ${cost} 灵石`);

            // 跳过视为已选择，且直接继续
            this.rewardCardSelected = true;
            this.continueAfterReward();
        } else {
            Utils.showBattleLog(`灵石不足！需要 ${cost} 灵石才能跳过`);
            // 不启用继续按钮
        }
    }

    // 尝试盗取法则
    attemptSteal() {
        const stealBtn = document.getElementById('steal-btn');
        const stealText = document.getElementById('steal-text');
        const lawId = stealBtn.dataset.lawId;
        const baseChance = parseFloat(stealBtn.dataset.chance);

        this.stealAttempted = true;
        stealBtn.disabled = true;

        const totalChance = baseChance + this.player.getStealBonus();
        const success = Math.random() < totalChance;

        if (success && LAWS[lawId]) {
            const law = { ...LAWS[lawId] };
            const added = this.player.collectLaw(law);

            if (added) {
                stealText.innerHTML = `<span style="color: var(--accent-gold)">✨ 盗取成功！获得【${law.name}】！</span>`;

                // 粒子特效
                if (typeof particles !== 'undefined') {
                    particles.stealSuccessEffect(stealBtn);
                }

                // 更新成就
                this.achievementSystem.updateStat('lawsCollected', 1);
                if (!this.achievementSystem.stats.firstStealSuccess) {
                    this.achievementSystem.updateStat('firstStealSuccess', true, 'set');
                }

                // 命环经验额外奖励
                this.player.fateRing.exp += 50;
                this.player.checkFateRingLevelUp();

                if (law.unlockCards && law.unlockCards.length > 0) {
                    const cardName = CARDS[law.unlockCards[0]]?.name || '神秘卡牌';
                    stealText.innerHTML += `<br><span style="color: var(--accent-purple)">解锁法则牌：${cardName}</span>`;
                }
                this.setRewardScreenState('success');
            } else {
                // 补偿机制
                let compensationMsg = `<span style="color: var(--text-secondary)">你已经掌握了这个法则</span>`;

                // 给予补偿：50灵石 + 20命环经验
                this.player.gold += 50;
                this.player.fateRing.exp += 20;
                this.player.checkFateRingLevelUp();

                compensationMsg += `<br><span style="color: var(--accent-gold)">获得补偿：50灵石，20命环经验</span>`;
                stealText.innerHTML = compensationMsg;
                this.setRewardScreenState('success');

                // 更新UI
                this.updatePlayerDisplay();
            }
        } else {
            stealText.innerHTML = `<span style="color: var(--text-muted)">盗取失败……法则残留消散了</span>`;
            this.setRewardScreenState('failed');
        }
    }

    // 奖励后继续 - 修复关卡推进bug
    continueAfterReward() {
        // 双重保险：必须已选择卡牌（包括跳过）
        if (!this.rewardCardSelected) {
            Utils.showBattleLog('请先选择一张卡牌奖励，或支付灵石跳过');
            return;
        }

        // 使用保存的当前战斗节点
        // FIX: 在 onBattleWon 中已经调用过 completeNode。
        //这里再次调用会导致Boss关卡重复结算（因为新地图生成后ID冲突），造成跳关。
        // if (this.currentBattleNode) {
        //    this.map.completeNode(this.currentBattleNode);
        //    this.currentBattleNode = null;
        // }

        // 确保清除当前节点引用
        this.currentBattleNode = null;

        this.autoSave();
        this.showScreen('map-screen');
    }

    // 显示事件弹窗
    showEventModal(event, node) {
        this.currentBattleNode = node;
        this.currentEvent = event;

        const modal = document.getElementById('event-modal');
        document.getElementById('event-icon').textContent = event.icon || '❓';
        document.getElementById('event-title').textContent = event.name || '神秘事件';

        // 显示描述或对话
        const descEl = document.getElementById('event-desc');
        if (event.speaker) {
            descEl.innerHTML = `<span style="color: var(--accent-gold)">${event.speaker.icon}</span> ${event.speaker.dialogue}`;
        } else {
            descEl.textContent = event.description || '发生了一些事情...';
        }

        // 生成选项
        const choicesEl = document.getElementById('event-choices');
        choicesEl.innerHTML = '';

        event.choices.forEach((choice, index) => {
            // 检查条件
            let canChoose = true;
            let conditionText = '';

            if (choice.condition) {
                switch (choice.condition.type) {
                    case 'hp':
                        canChoose = this.player.currentHp >= choice.condition.min;
                        if (!canChoose) conditionText = `(需要 ${choice.condition.min} HP)`;
                        break;
                    case 'gold':
                        canChoose = this.player.gold >= choice.condition.min;
                        if (!canChoose) conditionText = `(需要 ${choice.condition.min} 灵石)`;
                        break;
                    case 'deckSize':
                        canChoose = this.player.deck.length >= choice.condition.min;
                        if (!canChoose) conditionText = `(需要 ${choice.condition.min} 张卡牌)`;
                        break;
                }
            }

            const btn = document.createElement('button');
            btn.className = 'event-choice';
            if (!canChoose) btn.classList.add('disabled');
            btn.innerHTML = `
                <div>${choice.icon || '▶'} ${choice.text} ${conditionText}</div>
                <div class="choice-effect">${choice.result || ''}</div>
            `;

            if (canChoose) {
                btn.onclick = () => this.selectEventChoice(index);
            } else {
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            }

            choicesEl.appendChild(btn);
        });

        modal.classList.add('active');
    }

    showForgeChoiceModal(node, costs = {}) {
        this.currentBattleNode = node;

        const forgeCost = costs.forgeCost || (55 + this.player.realm * 9);
        const premiumCost = costs.premiumCost || (forgeCost + 50);
        const temperCost = costs.temperCost || Math.max(30, Math.floor(forgeCost * 0.6));
        const upgradableCount = Array.isArray(this.player.deck)
            ? this.player.deck.filter(c => typeof canUpgradeCard === 'function' && canUpgradeCard(c)).length
            : 0;

        const modal = document.getElementById('event-modal');
        document.getElementById('event-icon').textContent = '⚒️';
        document.getElementById('event-title').textContent = '天工锻炉';

        const descEl = document.getElementById('event-desc');
        descEl.innerHTML = `
            炉火正旺，你可以选择不同锻法。<br>
            当前可强化卡牌：<span style="color:var(--accent-gold)">${upgradableCount}</span> 张
        `;

        const options = [
            {
                id: 'steady',
                icon: '🔧',
                text: `精锻（-${forgeCost} 灵石）`,
                result: '稳定强化 1 张卡牌',
                canChoose: this.player.gold >= forgeCost
            },
            {
                id: 'overload',
                icon: '🔥',
                text: `过载锻造（-${premiumCost} 灵石）`,
                result: '强化 2 张卡牌并获得命环经验',
                canChoose: this.player.gold >= premiumCost
            },
            {
                id: 'temper',
                icon: '📜',
                text: `淬灵拓印（-${temperCost} 灵石）`,
                result: '获得 1 张非传说卡并获得命环经验',
                canChoose: this.player.gold >= temperCost
            },
            {
                id: 'leave',
                icon: '🚶',
                text: '暂离锻炉',
                result: '保留资源，继续前进',
                canChoose: true
            }
        ];

        const choicesEl = document.getElementById('event-choices');
        choicesEl.innerHTML = '';
        options.forEach(option => {
            const btn = document.createElement('button');
            btn.className = 'event-choice';
            if (!option.canChoose) btn.classList.add('disabled');
            btn.innerHTML = `
                <div>${option.icon} ${option.text}</div>
                <div class="choice-effect">${option.result}</div>
            `;

            if (option.canChoose) {
                btn.onclick = () => {
                    modal.classList.remove('active');
                    if (this.map && typeof this.map.applyForgeChoice === 'function') {
                        this.map.applyForgeChoice(node, option.id, { forgeCost, premiumCost, temperCost });
                    }
                    this.autoSave();
                };
            } else {
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            }

            choicesEl.appendChild(btn);
        });

        modal.classList.add('active');
    }

    // 选择事件选项
    selectEventChoice(choiceIndex) {
        const choice = this.currentEvent.choices[choiceIndex];
        if (!choice) return;

        // 收集效果结果用于显示
        this.eventResults = [];
        let flowInterrupted = false;

        // 执行效果
        if (choice.effects && choice.effects.length > 0) {
            for (const effect of choice.effects) {
                if (this.executeEventEffect(effect)) {
                    flowInterrupted = true;
                    break;
                }
            }
        }

        // 某些效果（如战斗/试炼/升级界面）会切换流程，不再渲染“继续”按钮
        if (flowInterrupted) {
            return;
        }

        // 在弹窗中显示结果
        const descEl = document.getElementById('event-desc');
        const choicesEl = document.getElementById('event-choices');

        if (this.eventResults.length > 0) {
            descEl.innerHTML = `<div style="color: var(--accent-gold); font-size: 1.1rem;">✨ 结果</div>`;
            descEl.innerHTML += this.eventResults.map(r => `<div style="margin-top: 8px;">${r}</div>`).join('');
        } else if (choice.effects && choice.effects.length === 0) {
            descEl.innerHTML = `<div style="color: var(--text-muted);">你转身离开了...</div>`;
        }

        // 隐藏选项，显示继续按钮
        choicesEl.innerHTML = '';
        const continueBtn = document.createElement('button');
        continueBtn.className = 'event-choice';
        continueBtn.innerHTML = '<div>▶ 继续</div>';
        continueBtn.onclick = () => {
            document.getElementById('event-modal').classList.remove('active');
            this.onEventComplete();
        };
        choicesEl.appendChild(continueBtn);
    }

    // 执行事件效果
    executeEventEffect(effect) {
        const endlessActive = typeof this.isEndlessActive === 'function' && this.isEndlessActive();
        const getEventTuning = () => {
            if (!endlessActive || typeof this.getEndlessEventTuning !== 'function') return null;
            return this.getEndlessEventTuning();
        };
        const getEventHealMultiplier = () => {
            if (typeof this.getEndlessHealingMultiplier === 'function') {
                return this.getEndlessHealingMultiplier();
            }
            return 1;
        };
        switch (effect.type) {
            case 'gold':
            {
                const endlessTuning = getEventTuning();
                const scalePositiveGold = (value) => {
                    const base = Math.max(0, Math.floor(Number(value) || 0));
                    if (!endlessTuning || base <= 0) return base;
                    return Math.max(base, Math.floor(base * (Number(endlessTuning.goldGainMul) || 1)));
                };
                if (effect.percent) {
                    const amount = Math.floor(this.player.gold * (Math.abs(effect.percent) / 100));
                    if (effect.percent < 0) {
                        this.player.gold -= amount;
                        this.eventResults.push(`💰 灵石 -${amount} (${Math.abs(effect.percent)}%)`);
                    } else {
                        const scaled = scalePositiveGold(amount);
                        this.player.gold += scaled;
                        this.eventResults.push(`💰 灵石 +${scaled} (${effect.percent}%)`);
                        if (scaled > amount) {
                            this.eventResults.push(`♾️ 无尽词缀联动：额外获得 ${scaled - amount} 灵石`);
                        }
                    }
                } else {
                    const raw = Math.floor(Number(effect.value) || 0);
                    if (raw > 0) {
                        const scaled = scalePositiveGold(raw);
                        this.player.gold += scaled;
                        this.eventResults.push(`💰 灵石 +${scaled}`);
                        if (scaled > raw) {
                            this.eventResults.push(`♾️ 无尽词缀联动：额外获得 ${scaled - raw} 灵石`);
                        }
                    } else {
                        this.player.gold += raw;
                        this.eventResults.push(`💰 灵石 ${raw}`);
                    }
                }
                break;
            }

            case 'randomGold':
                const goldAmount = Math.floor(Math.random() * (effect.max - effect.min + 1)) + effect.min;
                this.player.gold += goldAmount;
                this.eventResults.push(`💰 获得 ${goldAmount} 灵石`);
                break;

            case 'heal':
                {
                    const baseHeal = Math.max(1, Math.floor(Number(effect.value) || 0));
                    const healMultiplier = getEventHealMultiplier();
                    const finalHeal = Math.max(1, Math.floor(baseHeal * healMultiplier));
                    this.player.heal(finalHeal);
                    if (endlessActive && finalHeal !== baseHeal) {
                        this.eventResults.push(`💚 恢复 ${finalHeal} HP（无尽修正 x${healMultiplier.toFixed(2)}）`);
                    } else {
                        this.eventResults.push(`💚 恢复 ${finalHeal} HP`);
                    }
                }
                break;

            case 'maxHp':
                this.player.maxHp += effect.value;
                this.player.currentHp = Math.min(this.player.currentHp, this.player.maxHp);
                if (effect.value > 0) {
                    this.player.heal(effect.value); // Usually MaxHP+ also heals that amount?
                }
                this.eventResults.push(`❤️ 最大HP ${effect.value > 0 ? '+' : ''}${effect.value}`);
                break;

            case 'permaBuff':
                if (this.player.addPermaBuff) {
                    this.player.addPermaBuff(effect.stat, effect.value);
                } else if (this.player.addPermBuff) {
                    this.player.addPermBuff(effect.stat, effect.value);
                } else {
                    this.player.permaBuffs = this.player.permaBuffs || {};
                    this.player.permaBuffs[effect.stat] = (this.player.permaBuffs[effect.stat] || 0) + effect.value;
                    if (this.player.recalculateStats) this.player.recalculateStats();
                }
                {
                    const statMap = { strength: '力量', defense: '防御', energy: '灵力', maxHp: '生命', draw: '抽牌' };
                    this.eventResults.push(`💪 永久${statMap[effect.stat] || effect.stat} ${effect.value > 0 ? '+' : ''}${effect.value}`);
                }
                break;

            case 'adventureBuff': {
                const buffId = effect.buffId || '';
                const baseCharges = Math.max(1, Math.floor(Number(effect.charges) || 1));
                const endlessTuning = getEventTuning();
                const extraCharges = endlessTuning
                    ? Math.max(0, Math.floor(Number(endlessTuning.bonusAdventureBuffCharges) || 0))
                    : 0;
                const charges = Math.max(1, Math.min(5, baseCharges + extraCharges));
                let applied = false;
                if (this.player && typeof this.player.grantAdventureBuff === 'function') {
                    applied = this.player.grantAdventureBuff(buffId, charges);
                }
                const buffTextMap = {
                    firstTurnDrawBoostBattles: '首回合额外抽牌',
                    openingBlockBoostBattles: '开场护盾强化',
                    victoryGoldBoostBattles: '胜利额外灵石',
                    firstTurnEnergyBoostBattles: '首回合灵力强化',
                    ringExpBoostBattles: '命环经验倍率',
                    victoryHealBoostBattles: '战后恢复生命'
                };
                if (applied) {
                    this.eventResults.push(`🧭 获得行旅增益：${buffTextMap[buffId] || '未知增益'} (${charges} 场)`);
                    if (charges > baseCharges) {
                        this.eventResults.push(`♾️ 无尽词缀联动：额外层数 +${charges - baseCharges}`);
                    }
                } else {
                    this.eventResults.push('⚠️ 未能获得行旅增益');
                }
                break;
            }

            case 'openTemporaryShop':
                {
                const tunedEffect = { ...(effect || {}) };
                if (endlessActive) {
                    const endlessTuning = getEventTuning() || { forceRelief: false, tempShopPriceMul: 1 };
                    tunedEffect.forceRelief = !!tunedEffect.forceRelief || !!endlessTuning.forceRelief;
                }
                this.closeModal();
                setTimeout(() => {
                        this.showTemporaryEventShop(tunedEffect);
                }, 120);
                return true;
                }

            case 'openCampfire':
                this.closeModal();
                setTimeout(() => {
                    const node = this.currentBattleNode || { id: `event-camp-${Date.now()}`, row: 0, type: 'event' };
                    this.showCampfire(node);
                }, 120);
                return true;

            case 'damage':
                this.player.takeDamage(effect.value);
                this.eventResults.push(`💔 失去 ${effect.value} HP`);
                break;

            case 'removeCardType':
                let removedCount = 0;
                const toRemove = [];
                // Find cards matching criteria
                this.player.deck.forEach((card, index) => {
                    // Check if card matches criteria (e.g. cardId or cardType)
                    // If cardType is 'strike', remove any card with id/name containing strike? 
                    // Or check type property.
                    let match = false;
                    if (effect.cardId && card.id === effect.cardId) match = true;
                    if (effect.cardType && card.type === effect.cardType) match = true;
                    // Special case for 'strike' in data sometimes maps to 'attack' type, detailed check needed?
                    // Let's assume strict type match first.

                    if (match && removedCount < (effect.count || 1)) {
                        toRemove.push(index);
                        removedCount++;
                    }
                });

                // Remove from back to front to avoid index shift
                toRemove.sort((a, b) => b - a).forEach(idx => {
                    const removed = this.player.deck.splice(idx, 1)[0];
                    if (removed) this.eventResults.push(`🗑️ 移除: ${removed.name}`);
                });
                if (removedCount === 0) {
                    this.eventResults.push(`⚠️ 没有符合条件的卡牌可移除`);
                }
                break;

            case 'upgradeCard':
                // 进入专用升级选择界面，切换流程
                this.closeModal();
                setTimeout(() => {
                    this.showEventUpgradeCard();
                }, 100);
                return true;

            case 'treasure':
                if (effect.treasureId) {
                    if (this.player.addTreasure && this.player.addTreasure(effect.treasureId)) {
                        this.eventResults.push(`🏺 获得法宝: ${TREASURES[effect.treasureId].name}`);
                    } else {
                        this.eventResults.push(`已拥有该法宝，获得替代奖励`);
                    }
                } else if (effect.random && typeof TREASURES !== 'undefined') {
                    const tKeys = Object.keys(TREASURES);
                    const unowned = tKeys.filter(k => !this.player.hasTreasure || !this.player.hasTreasure(k));
                    if (unowned.length > 0) {
                        const tid = unowned[Math.floor(Math.random() * unowned.length)];
                        if (this.player.addTreasure) this.player.addTreasure(tid);
                        this.eventResults.push(`🏺 获得随机法宝: ${TREASURES[tid].name}`);
                    } else {
                        this.player.gold += 100;
                        this.eventResults.push(`法宝已收集齐，获得 100 灵石`);
                    }
                }
                break;

            case 'trial':
                // 试炼模式 - 设置特殊战斗规则并立即进入战斗
                {
                let rewardMultiplier = Number(effect.rewardMultiplier) || 1;
                if (endlessActive) {
                    const endlessTuning = getEventTuning() || { trialRewardMul: 1 };
                    rewardMultiplier *= Math.max(1, Number(endlessTuning.trialRewardMul) || 1);
                    if (rewardMultiplier > (Number(effect.rewardMultiplier) || 1)) {
                        Utils.showBattleLog(`无尽词缀联动：试炼奖励倍率提升至 x${rewardMultiplier.toFixed(2)}`);
                    }
                }
                this.trialMode = {
                    type: effect.trialType,
                    rounds: effect.rounds,
                        rewardMultiplier,
                    reward: effect.reward
                };
                Utils.showBattleLog(`进入试炼模式: ${effect.trialType}`);
                const trialEnemy = getRandomEnemy(this.player.realm);
                if (trialEnemy) {
                    this.closeModal();
                    setTimeout(() => {
                        this.startBattle([trialEnemy], this.currentBattleNode);
                    }, 300);
                    return true;
                }
                this.eventResults.push('⚠️ 试炼开启失败：未找到试炼目标');
                break;
                }

            case 'ringExp':
                {
                const baseExp = Math.max(0, Math.floor(Number(effect.value) || 0));
                let finalExp = baseExp;
                if (baseExp > 0 && endlessActive) {
                    const endlessTuning = getEventTuning() || { ringExpFlat: 0 };
                    finalExp += Math.max(0, Math.floor(Number(endlessTuning.ringExpFlat) || 0));
                }
                this.player.fateRing.exp += finalExp;
                this.player.checkFateRingLevelUp();
                this.eventResults.push(`🔮 命环经验 +${finalExp}`);
                if (finalExp > baseExp) {
                    this.eventResults.push(`♾️ 无尽词缀联动：额外命环经验 +${finalExp - baseExp}`);
                }
                // 如果导致升级，checkFateRingLevelUp 内部会处理并可能弹窗，但这里我们主要关注数值
                break;
                }

            case 'endlessPressure': {
                if (typeof this.ensureEndlessState !== 'function') {
                    this.eventResults.push('⚠️ 轮回压力系统不可用');
                    break;
                }
                const state = this.ensureEndlessState();
                const before = Math.max(0, Math.min(9, Math.floor(Number(state.pressure) || 0)));
                const delta = Math.floor(Number(effect.value) || 0);
                state.pressure = Math.max(0, Math.min(9, before + delta));
                const prefix = delta >= 0 ? '+' : '';
                this.eventResults.push(`♨️ 轮回压力 ${before} → ${state.pressure}（${prefix}${delta}）`);
                break;
            }

            case 'card':
                let card = null;
                if (effect.cardId && CARDS[effect.cardId]) {
                    card = { ...CARDS[effect.cardId] };
                } else if (effect.rarity) {
                    card = getRandomCard(effect.rarity);
                } else {
                    card = getRandomCard();
                }
                if (card) {
                    this.player.addCardToDeck(card);
                    this.eventResults.push(`🃏 获得卡牌: ${card.name}`);
                }
                break;

            case 'law':
                if (effect.random) {
                    const lawKeys = Object.keys(LAWS);
                    const randomLaw = LAWS[lawKeys[Math.floor(Math.random() * lawKeys.length)]];
                    if (randomLaw && this.player.collectLaw({ ...randomLaw })) {
                        this.eventResults.push(`✨ 获得法则: ${randomLaw.name}`);
                        this.achievementSystem.updateStat('lawsCollected', 1);
                    }
                }
                break;

            case 'random':
                if (effect.options) {
                    const roll = Math.random();
                    let cumulative = 0;
                    for (const option of effect.options) {
                        cumulative += option.chance;
                        if (roll < cumulative) {
                            if (option.type !== 'nothing') {
                                return this.executeEventEffect(option);
                            }
                            break;
                        }
                    }
                }
                break;

            case 'battle':
                // 触发战斗
                if (effect.enemyId && ENEMIES[effect.enemyId]) {
                    const enemy = JSON.parse(JSON.stringify(ENEMIES[effect.enemyId]));
                    this.closeModal();
                    setTimeout(() => {
                        this.startBattle(enemy, this.currentBattleNode);
                    }, 300);
                    return true;
                }
                this.eventResults.push('⚠️ 战斗触发失败：目标敌人不存在');
                break;

            case 'awakenRing':
                // 觉醒命环
                if (this.player.fateRing.level === 0) {
                    const ring = this.player.fateRing;
                    ring.level = 1;
                    ring.name = '一阶·觉醒';
                    ring.path = 'awakened';

                    // 同步槽位结构（避免 slots 变成数字）
                    const levelData = (typeof FATE_RING !== 'undefined' && FATE_RING.levels) ? FATE_RING.levels[1] : null;
                    if (levelData && ring.type !== 'sealed') {
                        ring.maxSlots = levelData.slots;
                        ring.exp = Math.max(ring.exp || 0, levelData.exp || 0);
                    }
                    if (ring.initSlots) ring.initSlots();
                    Utils.showBattleLog('命环觉醒！逆命之路开启！');
                }
                break;

            default:
                // 未处理的效果类型
                console.log('未处理的事件效果:', effect.type);
        }
        return false;
    }

    getTemporaryEventShopOffers(effect = {}) {
        const realm = this.player?.realm || 1;
        const endlessTuning = this.isEndlessActive() ? this.getEndlessEventTuning() : null;
        const pathDoctrineProfile = (this.player && typeof this.player.getPathDoctrineProfile === 'function')
            ? this.player.getPathDoctrineProfile()
            : null;
        const wisdomTier = (pathDoctrineProfile && pathDoctrineProfile.path === 'wisdom')
            ? Math.max(0, Math.floor(Number(pathDoctrineProfile.tier) || 0))
            : 0;
        const wisdomPriceMultiplier = wisdomTier > 0
            ? Math.max(0.78, Number(pathDoctrineProfile.shopPriceMultiplier) || 1)
            : 1;
        const injectedPriceMultiplier = Number(effect.priceMultiplier);
        const combinedPriceMultiplier = (
            (1 + (realm - 1) * 0.08) *
            (Number.isFinite(injectedPriceMultiplier) ? injectedPriceMultiplier : 1) *
            (endlessTuning ? (Number(endlessTuning.tempShopPriceMul) || 1) : 1) *
            wisdomPriceMultiplier
        );
        const priceMul = Math.max(0.65, combinedPriceMultiplier);
        const baseOffers = [
            {
                id: 'temp_draw',
                icon: '📘',
                name: '战术补给',
                price: Math.floor(60 * priceMul),
                desc: '接下来 2 场战斗：首回合额外抽 1 张牌'
            },
            {
                id: 'temp_block',
                icon: '🧿',
                name: '护阵折符',
                price: Math.floor(75 * priceMul),
                desc: '接下来 2 场战斗：开场获得 10 护盾'
            },
            {
                id: 'temp_bounty',
                icon: '📜',
                name: '悬赏短契',
                price: Math.floor(85 * priceMul),
                desc: '接下来 2 场战斗：胜利额外获得灵石'
            },
            {
                id: 'temp_energy',
                icon: '⚡',
                name: '灵息导体',
                price: Math.floor(92 * priceMul),
                desc: '接下来 2 场战斗：首回合灵力 +1'
            },
            {
                id: 'temp_expboost',
                icon: '🕯️',
                name: '悟境熏香',
                price: Math.floor(98 * priceMul),
                desc: '接下来 2 场战斗：命环经验额外 +30%'
            },
            {
                id: 'temp_medic',
                icon: '🩹',
                name: '野战医包',
                price: Math.floor(96 * priceMul),
                desc: '接下来 2 场战斗：胜利后恢复生命'
            },
            {
                id: 'temp_card',
                icon: '🃏',
                name: '秘法现货',
                price: Math.floor(95 * priceMul),
                desc: '获得 1 张随机稀有卡牌'
            }
        ];
        const endlessExclusiveOffers = this.isEndlessActive()
            ? [
                {
                    id: 'temp_refit',
                    icon: '🧬',
                    name: '轮回重配包',
                    price: Math.floor(122 * priceMul),
                    desc: '重配 1 个无尽词缀，并返还少量灵石'
                },
                {
                    id: 'temp_boon',
                    icon: '🕯️',
                    name: '轮回祷札',
                    price: Math.floor(138 * priceMul),
                    desc: '从 2 个无尽赐福中随机获得其一'
                }
            ]
            : [];
        const reliefOffer = {
            id: 'temp_relief',
            icon: '🧰',
            name: '应急补给券',
            price: Math.max(18, Math.floor(24 * priceMul)),
            desc: '立即恢复生命，并获得 1 层战后医护增益'
        };

        const preferredArchetype = (() => {
            try {
                if (typeof inferDeckArchetype === 'function') {
                    return inferDeckArchetype(this.player?.deck || []);
                }
            } catch (e) {
                return null;
            }
            return null;
        })();

        const archetypeExtras = {
            precision: {
                id: 'temp_precision',
                icon: '🎯',
                name: '镜针校准包',
                price: Math.floor(108 * priceMul),
                desc: '获得 1 张稀有/史诗攻击牌，并获得 1 层首回合灵力增益'
            },
            entropy: {
                id: 'temp_entropy',
                icon: '🌀',
                name: '湮流应急包',
                price: Math.floor(106 * priceMul),
                desc: '获得 1 层首回合抽牌增益 + 1 层胜利悬赏增益'
            },
            bulwark: {
                id: 'temp_bulwark',
                icon: '🛡️',
                name: '玄甲防线包',
                price: Math.floor(104 * priceMul),
                desc: '获得 2 层开场护盾增益并恢复少量生命'
            },
            stormcraft: {
                id: 'temp_stormcraft',
                icon: '⚡',
                name: '霆策脉冲包',
                price: Math.floor(109 * priceMul),
                desc: '获得 1 张连锁攻势卡，并获得 1 层首回合灵力与抽牌增益'
            },
            vitalweave: {
                id: 'temp_vitalweave',
                icon: '💚',
                name: '回脉救援包',
                price: Math.floor(107 * priceMul),
                desc: '立即恢复生命，并获得开场护盾与战后医护增益'
            },
            hemorrhage: {
                id: 'temp_hemorrhage',
                icon: '🩸',
                name: '血炉突击包',
                price: Math.floor(102 * priceMul),
                desc: '获得 1 张进攻牌，并获得 1 层胜利悬赏增益'
            }
        };

        const offers = baseOffers.slice();
        if (preferredArchetype && archetypeExtras[preferredArchetype]) {
            offers.push(archetypeExtras[preferredArchetype]);
        }
        if (endlessExclusiveOffers.length > 0) {
            offers.push(...endlessExclusiveOffers);
        }

        const playerGold = Math.max(0, Math.floor(Number(this.player?.gold) || 0));
        const lowGoldThreshold = Math.floor(90 * priceMul);
        const shouldForceRelief = !!effect.forceRelief || !!endlessTuning?.forceRelief || playerGold < lowGoldThreshold;
        if (shouldForceRelief) {
            offers.push(reliefOffer);
        }

        const baseCount = Math.max(2, Math.min(4, Math.floor(Number(effect.offerCount) || 3)));
        const wisdomOfferBonus = wisdomTier > 0
            ? Math.max(0, Math.floor(Number(pathDoctrineProfile?.shopOfferBonus) || 0))
            : 0;
        const count = Math.max(
            2,
            Math.min(
                5,
                baseCount +
                (endlessTuning ? Math.max(0, Math.floor(Number(endlessTuning.tempShopOfferBonus) || 0)) : 0) +
                wisdomOfferBonus
            )
        );
        const shuffled = (typeof Utils !== 'undefined' && Utils.shuffle)
            ? Utils.shuffle(offers.slice())
            : offers.slice().sort(() => Math.random() - 0.5);
        const picked = shuffled.slice(0, count);
        if (endlessExclusiveOffers.length > 0 && !picked.some((offer) => offer && (offer.id === 'temp_refit' || offer.id === 'temp_boon'))) {
            const endlessOffer = endlessExclusiveOffers[Math.floor(Math.random() * endlessExclusiveOffers.length)];
            if (endlessOffer) {
                let replaceIndex = picked.length - 1;
                if (shouldForceRelief && picked.length > 1 && picked[replaceIndex]?.id === 'temp_relief') {
                    replaceIndex = picked[0]?.id === 'temp_relief' ? 1 : 0;
                }
                if (picked.length === 0) {
                    picked.push(endlessOffer);
                } else {
                    picked[replaceIndex] = endlessOffer;
                }
            }
        }
        if (shouldForceRelief && !picked.some((offer) => offer && offer.id === 'temp_relief')) {
            let replaceIndex = picked.length - 1;
            if (picked.length > 1) {
                const nonEndlessIndex = picked.findIndex(
                    (offer) => !(offer && (offer.id === 'temp_refit' || offer.id === 'temp_boon'))
                );
                if (nonEndlessIndex >= 0) replaceIndex = nonEndlessIndex;
            }
            picked[replaceIndex] = reliefOffer;
        }

        const resolveReplaceIndex = () => {
            if (picked.length <= 1) return Math.max(0, picked.length - 1);
            const index = picked.findIndex((offer) => {
                if (!offer) return true;
                if (offer.id === 'temp_refit' || offer.id === 'temp_boon') return false;
                if (shouldForceRelief && offer.id === 'temp_relief') return false;
                return true;
            });
            return index >= 0 ? index : Math.max(0, picked.length - 1);
        };

        if (wisdomTier >= 1 && !picked.some((offer) => offer && offer.id === 'temp_card')) {
            const cardOffer = baseOffers.find((offer) => offer && offer.id === 'temp_card');
            if (cardOffer) {
                if (picked.length === 0) picked.push(cardOffer);
                else picked[resolveReplaceIndex()] = cardOffer;
            }
        }
        if (
            wisdomTier >= 2 &&
            preferredArchetype &&
            archetypeExtras[preferredArchetype] &&
            !picked.some((offer) => offer && offer.id === archetypeExtras[preferredArchetype].id)
        ) {
            const biasOffer = archetypeExtras[preferredArchetype];
            if (picked.length === 0) picked.push(biasOffer);
            else picked[resolveReplaceIndex()] = biasOffer;
        }
        return picked;
    }

    applyTemporaryEventShopOffer(offer) {
        if (!offer || typeof offer !== 'object') return '交易失败';
        switch (offer.id) {
            case 'temp_draw':
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('firstTurnDrawBoostBattles', 2);
                }
                return '获得行旅增益：首回合额外抽牌（2 场）';
            case 'temp_block':
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('openingBlockBoostBattles', 2);
                }
                return '获得行旅增益：开场护盾强化（2 场）';
            case 'temp_bounty':
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('victoryGoldBoostBattles', 2);
                }
                return '获得行旅增益：胜利悬赏（2 场）';
            case 'temp_energy':
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('firstTurnEnergyBoostBattles', 2);
                }
                return '获得行旅增益：首回合灵力强化（2 场）';
            case 'temp_expboost':
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('ringExpBoostBattles', 2);
                }
                return '获得行旅增益：命环经验倍率（2 场）';
            case 'temp_medic':
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('victoryHealBoostBattles', 2);
                }
                return '获得行旅增益：战后恢复生命（2 场）';
            case 'temp_card': {
                const rarity = Math.random() < 0.7 ? 'rare' : 'epic';
                const card = getRandomCard(rarity, this.player?.characterId || null);
                if (!card) return '货品短缺，交易作废';
                this.player.addCardToDeck(card);
                return `获得卡牌：${card.name}`;
            }
            case 'temp_relief': {
                const healAmount = Math.max(10, Math.floor((this.player?.maxHp || 80) * 0.12));
                this.player.heal(healAmount);
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('victoryHealBoostBattles', 1);
                }
                return `补给完成：恢复 ${healAmount} 生命，并获得 1 层战后医护增益`;
            }
            case 'temp_precision': {
                const rarity = Math.random() < 0.6 ? 'rare' : 'epic';
                const card = getRandomCard(rarity, this.player?.characterId || null);
                if (card) this.player.addCardToDeck(card);
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('firstTurnEnergyBoostBattles', 1);
                }
                return `获得战术卡${card ? `：${card.name}` : ''}，并获得 1 层首回合灵力增益`;
            }
            case 'temp_entropy':
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('firstTurnDrawBoostBattles', 1);
                    this.player.grantAdventureBuff('victoryGoldBoostBattles', 1);
                }
                return '获得湮流增益：首回合抽牌 +1 与胜利悬赏（各 1 场）';
            case 'temp_bulwark':
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('openingBlockBoostBattles', 2);
                }
                this.player.heal(8);
                return '获得玄甲增益：开场护盾强化（2 场）并恢复 8 生命';
            case 'temp_stormcraft': {
                const rarity = Math.random() < 0.6 ? 'rare' : 'epic';
                const card = getRandomCard(rarity, this.player?.characterId || null);
                if (card) this.player.addCardToDeck(card);
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('firstTurnEnergyBoostBattles', 1);
                    this.player.grantAdventureBuff('firstTurnDrawBoostBattles', 1);
                }
                return `获得霆策卡${card ? `：${card.name}` : ''}，并获得 1 层首回合灵力与抽牌增益`;
            }
            case 'temp_vitalweave': {
                const healAmount = Math.max(9, Math.floor((this.player?.maxHp || 80) * 0.1));
                this.player.heal(healAmount);
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('openingBlockBoostBattles', 1);
                    this.player.grantAdventureBuff('victoryHealBoostBattles', 1);
                }
                return `获得回脉补给：恢复 ${healAmount} 生命，并获得开场护盾与战后医护增益`;
            }
            case 'temp_hemorrhage': {
                const rarity = Math.random() < 0.7 ? 'uncommon' : 'rare';
                const card = getRandomCard(rarity, this.player?.characterId || null);
                if (card) this.player.addCardToDeck(card);
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('victoryGoldBoostBattles', 1);
                }
                return `获得突击卡${card ? `：${card.name}` : ''}，并获得 1 层胜利悬赏增益`;
            }
            case 'temp_refit': {
                if (!this.isEndlessActive()) return '当前并非无尽轮回，重配失败';
                const state = this.ensureEndlessState();
                if (!Array.isArray(state.activeMutators)) state.activeMutators = [];
                if (state.activeMutators.length > 0) state.activeMutators.pop();
                const rolled = this.rollNextEndlessMutator();
                if (!rolled) return '重配失败：未找到可接入的词缀';
                const goldRefund = Math.max(8, Math.floor((this.player?.realm || 1) * 4));
                this.player.gold += goldRefund;
                return `重配完成：接入【${rolled.name}】，返还 ${goldRefund} 灵石`;
            }
            case 'temp_boon': {
                if (!this.isEndlessActive()) return '当前并非无尽轮回，无法祷告';
                const choices = this.getEndlessBoonChoices();
                const picks = Array.isArray(choices) ? choices.slice(0, 2) : [];
                if (picks.length === 0) return '祷告失败：暂无可用赐福';
                const fallbackPool = this.getEndlessBoonPool().filter((boon) => boon && boon.id);
                const candidateIds = [
                    ...picks.map((boon) => boon && boon.id).filter((id) => typeof id === 'string'),
                    ...fallbackPool.map((boon) => boon.id).filter((id) => typeof id === 'string')
                ];
                let applied = null;
                while (candidateIds.length > 0 && !applied) {
                    const idx = Math.floor(Math.random() * candidateIds.length);
                    const [boonId] = candidateIds.splice(idx, 1);
                    applied = boonId ? this.applyEndlessBoon(boonId) : null;
                }
                if (!applied) return '祷告失败：赐福未生效';
                const rarityText = applied.rarity === 'rare' ? '【稀有】' : '';
                return `获得无尽赐福：${rarityText}${applied.name}`;
            }
            default:
                return '交易完成';
        }
    }

    showTemporaryEventShop(effect = {}) {
        const modal = document.getElementById('event-modal');
        const titleEl = document.getElementById('event-title');
        const iconEl = document.getElementById('event-icon');
        const descEl = document.getElementById('event-desc');
        const choicesEl = document.getElementById('event-choices');
        if (!modal || !titleEl || !iconEl || !descEl || !choicesEl) return;

        const offers = this.getTemporaryEventShopOffers(effect);
        const continueFromMarket = () => {
            modal.classList.remove('active');
            this.onEventComplete();
        };

        titleEl.textContent = effect.title || '裂隙行商';
        iconEl.textContent = effect.icon || '🛒';
        descEl.textContent = effect.desc || '行商从裂隙中取出几件短期军需，你只能带走其中一件。';
        choicesEl.innerHTML = '';

        offers.forEach((offer) => {
            const canBuy = this.player.gold >= offer.price;
            const btn = document.createElement('button');
            btn.className = 'event-choice';
            if (!canBuy) btn.classList.add('disabled');
            btn.innerHTML = `
                <div>${offer.icon} ${offer.name}（-${offer.price} 灵石）</div>
                <div class="choice-effect">${offer.desc}</div>
            `;

            if (canBuy) {
                btn.onclick = () => {
                    this.player.gold -= offer.price;
                    const resultText = this.applyTemporaryEventShopOffer(offer);
                    this.updatePlayerDisplay();
                    this.autoSave();
                    descEl.innerHTML = `
                        <div style=\"color:var(--accent-gold);\">交易完成</div>
                        <div style=\"margin-top:8px;\">${resultText}</div>
                    `;
                    choicesEl.innerHTML = '';
                    const doneBtn = document.createElement('button');
                    doneBtn.className = 'event-choice';
                    doneBtn.innerHTML = '<div>▶ 继续前进</div>';
                    doneBtn.onclick = continueFromMarket;
                    choicesEl.appendChild(doneBtn);
                };
            } else {
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            }
            choicesEl.appendChild(btn);
        });

        const leaveBtn = document.createElement('button');
        leaveBtn.className = 'event-choice';
        leaveBtn.innerHTML = `
            <div>🚶 不做交易</div>
            <div class="choice-effect">保持资源，继续前进</div>
        `;
        leaveBtn.onclick = continueFromMarket;
        choicesEl.appendChild(leaveBtn);

        modal.classList.add('active');
    }

    // 事件中升级卡牌 (Revised with Preview)
    showEventUpgradeCard() {
        const modal = document.getElementById('deck-modal');
        const container = document.getElementById('deck-view-cards');
        // Clear previous content
        container.innerHTML = '';
        container.style.display = 'flex';
        container.style.flexDirection = 'row'; // Ensure row layout for split view

        // Create Split Layout
        const listContainer = document.createElement('div');
        listContainer.style.flex = '1';
        listContainer.style.display = 'flex';
        listContainer.style.flexWrap = 'wrap';
        listContainer.style.justifyContent = 'center';
        listContainer.style.alignContent = 'flex-start';
        listContainer.style.overflowY = 'auto';
        listContainer.style.maxHeight = '60vh';

        const previewContainer = document.createElement('div');
        previewContainer.style.width = '300px';
        previewContainer.style.borderLeft = '1px solid rgba(255,255,255,0.1)';
        previewContainer.style.padding = '10px';
        previewContainer.style.display = 'flex';
        previewContainer.style.flexDirection = 'column';
        previewContainer.style.alignItems = 'center';

        container.appendChild(listContainer);
        container.appendChild(previewContainer);

        // Preview UI Elements
        previewContainer.innerHTML = `
            <h3 style="color:var(--accent-gold);margin-top:0;">升级预览</h3>
            <div id="upgrade-preview-placeholder" style="color:#666;margin-top:50px;">
                鼠标悬浮或点击卡牌<br>查看升级效果
            </div>
            <div id="upgrade-preview-card" style="display:none; transform:scale(1.1); margin: 20px 0;"></div>
            <div id="upgrade-diff-text" style="width:100%; font-size:0.9rem; color:#ddd; margin: 10px 0; background:rgba(0,0,0,0.3); padding:8px; border-radius:4px; display:none;"></div>
            <button id="confirm-upgrade-btn" class="menu-btn" style="margin-top:auto; width:100%;" disabled>确认升级</button>
        `;

        const confirmBtn = previewContainer.querySelector('#confirm-upgrade-btn');
        const previewCardDiv = previewContainer.querySelector('#upgrade-preview-card');
        const previewTextDiv = previewContainer.querySelector('#upgrade-diff-text');
        const placeholder = previewContainer.querySelector('#upgrade-preview-placeholder');

        let selectedIndex = -1;

        const upgradableCards = this.player.deck.filter(c => canUpgradeCard(c));
        if (upgradableCards.length === 0) {
            listContainer.innerHTML = '<p style="text-align:center;color:var(--text-muted);width:100%;">没有可升级的卡牌</p>';
            setTimeout(() => {
                this.closeModal();
                this.onEventComplete();
            }, 1500);
            return;
        }

        // Render Cards
        this.player.deck.forEach((card, index) => {
            if (!canUpgradeCard(card)) return;

            const cardEl = Utils.createCardElement(card, index);
            cardEl.classList.add(`rarity-${card.rarity || 'common'}`);
            cardEl.style.cursor = 'pointer';
            cardEl.dataset.index = index;

            // Interaction Logic
            const showPreview = () => {
                const upgraded = upgradeCard(card);
                placeholder.style.display = 'none';
                previewCardDiv.style.display = 'flex';
                previewTextDiv.style.display = 'block';

                // Clear and render upgraded card
                previewCardDiv.innerHTML = '';
                const upgradedEl = Utils.createCardElement(upgraded, 999); // Dummy index
                upgradedEl.classList.add(`rarity-${upgraded.rarity || 'common'}`);
                previewCardDiv.appendChild(upgradedEl);

                // Show basic info text
                previewTextDiv.innerHTML = `
                    <p style="margin:0;color:var(--accent-green);font-weight:bold;">${card.name} ➤ ${upgraded.name}</p>
                    <p style="margin:4px 0 0 0;font-size:0.8rem;">${upgraded.description}</p>
                `;
            };

            // Hover: Show preview (but don't select if not clicked)
            cardEl.addEventListener('mouseenter', () => {
                if (selectedIndex === -1) showPreview();
            });

            // Click: Select and Enable Confirm
            cardEl.addEventListener('click', () => {
                // Deselect others
                listContainer.querySelectorAll('.card').forEach(c => c.style.border = '');
                // Select this
                cardEl.style.border = '3px solid var(--accent-gold)';
                selectedIndex = index;
                showPreview(); // Force show this preview
                confirmBtn.disabled = false;
                confirmBtn.classList.remove('disabled');
            });

            listContainer.appendChild(cardEl);
        });

        // Confirm Action
        confirmBtn.onclick = () => {
            if (selectedIndex === -1) return;
            const card = this.player.deck[selectedIndex];
            const upgraded = upgradeCard(card);
            this.player.deck[selectedIndex] = upgraded;
            Utils.showBattleLog(`${card.name} 升级为 ${upgraded.name}！`);

            // Clean up styles
            container.style.display = '';
            container.style.flexDirection = '';

            this.closeModal();
            this.onEventComplete();
        };

        modal.classList.add('active');
    }

    // 事件完成
    onEventComplete() {
        this.achievementSystem.updateStat('eventsCompleted', 1);

        if (this.currentBattleNode) {
            this.map.completeNode(this.currentBattleNode);
            this.currentBattleNode = null;
        }

        this.autoSave();
        this.showScreen('map-screen');
    }

    // 战斗失败
    async onBattleLost() {
        if (this.mode === 'pvp') {
            await this.handlePVPDefeat();
            return;
        }

        const encounterState = this.ensureEncounterState();
        encounterState.currentStreak = 0;
        encounterState.currentStreakId = null;

        if (this.isEndlessActive()) {
            const state = this.ensureEndlessState();
            state.active = false;
            Utils.showBattleLog(`无尽轮回中断：已坚持到第 ${state.currentCycle + 1} 轮。`);
        }

        const reachRealm = this.player && this.player.realm ? this.player.realm : 1;
        const lossEssence = this.awardLegacyEssence(
            Math.max(1, Math.floor((reachRealm - 1) / 2)),
            '败中悟道',
            { silent: true }
        );

        // 清除存档，防止死亡后还能继续
        // this.clearSave(); // 改为仅在选择重新开始或退出时清除？或者保留存档但标记为已死亡
        // 为了支持重修此界，我们暂时保留内存中的数据，但清除硬盘上的进度以防刷新作弊
        // 只有当玩家选择“重修此界”时，才会重新写入存档（扣钱后的）
        this.clearSave();

        // 标记玩家已死亡，即使被非法恢复，也会在加载时被拦截
        this.player.currentHp = 0;

        // --- P1: 异步 PVP 残影上传 ---
        if (typeof AuthService !== 'undefined' && AuthService.uploadGhostData) {
            // 将最后一刻的残影数据上传
            AuthService.uploadGhostData(this.player, this.player.realm).catch(e => console.error(e));
        }

        document.getElementById('game-over-title').textContent = '陨落...';
        document.getElementById('game-over-title').classList.remove('victory');
        document.getElementById('game-over-text').textContent = '逆命之路，暂时中断';

        document.getElementById('stat-floor').textContent = this.map.getRealmName(this.player.realm);
        document.getElementById('stat-enemies').textContent = this.player.enemiesDefeated;
        document.getElementById('stat-laws').textContent = this.player.collectedLaws.length;
        const legacyStat = document.getElementById('stat-legacy');
        if (legacyStat) {
            legacyStat.textContent = `+${lossEssence}（库存 ${this.legacyProgress.essence}）`;
        }

        // 显示重修此界按钮 (仅在非第一层或有一定进度时？为了体验，总是显示)
        const restartBtn = document.getElementById('restart-realm-btn');
        if (restartBtn) {
            restartBtn.style.display = 'inline-block';
            restartBtn.title = '保留当前属性和牌组，重新挑战本重天域';
        }

        this.showScreen('game-over-screen');
    }

    // 重修此界 (Restart Realm)
    restartRealm() {
        if (!this.player) return;

        // 增加复活代价：收益减半 (不再扣除灵石)
        this.player.isRecultivation = true;
        // const reviveCost = Math.floor(this.player.gold * 0.5); // 扣除50%灵石
        // this.player.gold -= reviveCost;

        // 恢复生命值
        this.player.currentHp = this.player.maxHp;

        // 重置层数
        this.player.floor = 0;

        // 重新生成地图
        this.map.generate(this.player.realm);

        // Check Skill Unlock status (e.g. if restarting at Realm 5+, unlock skill)
        this.player.checkSkillUnlock();

        // 自动保存
        // 关键修复：保存必须在所有状态重置（扣钱、恢复HP、重置层数）之后立即进行
        // 这样如果用户在点击“重修此界”后刷新，加载的存档已经是扣过钱并重置进度的状态
        this.autoSave();

        Utils.showBattleLog(`时光倒流... 重修 ${this.map.getRealmName(this.player.realm)} (此界收益减半)`);

        // 进入地图界面
        this.showScreen('map-screen');
    }

    // 天域完成
    onRealmComplete() {
        if (this.isEndlessActive()) {
            this.handleEndlessRealmComplete();
            return;
        }

        // --- P1: 异步 PVP 残影上传 ---
        if (typeof AuthService !== 'undefined' && AuthService.uploadGhostData) {
            AuthService.uploadGhostData(this.player, this.player.realm).catch(e => console.error(e));
        }

        const currentRealm = this.player.realm;
        const clearEssence = this.awardLegacyEssence(2 + Math.floor(currentRealm / 2), '破境夺天', { silent: true });

        // 更新成就
        this.achievementSystem.updateStat('realmCleared', this.player.realm, 'max');

        // 检查速通
        if (this.runStartTime) {
            const runTime = (Date.now() - this.runStartTime) / 1000;
            this.achievementSystem.updateStat('speedClear', runTime, 'min');
        }

        // 检查牌组大小
        this.achievementSystem.updateStat('minDeckClear', this.player.deck.length, 'min');

        // 解锁下一重天
        if (!this.unlockedRealms) this.unlockedRealms = [1];
        if (!this.unlockedRealms.includes(this.player.realm + 1)) {
            this.unlockedRealms.push(this.player.realm + 1);
        }

        // Update max realm reached (Next unlocked)
        if (this.player.realm + 1 > this.player.maxRealmReached) {
            this.player.maxRealmReached = this.player.realm + 1;
        }

        // 检查是否通关所有天域 (现在是18重)
        if (this.player.realm >= 18) {
            const finalEssence = this.awardLegacyEssence(18, '逆天终局', { silent: true });
            this.lastLegacyGain = clearEssence + finalEssence;
            this.showVictoryScreen();
            return;
        }

        // 允许玩家选择继续或回城
        // 这里暂时保持自动推进，但增加保存
        this.player.realm++;
        this.player.floor = 0;
        this.currentBattleNode = null; // 关键修复：防止奖励结算再次触发节点完成

        // 成功突破天域，清除重修惩罚
        this.player.isRecultivation = false;
        // 进入下一层肯定不是重玩（除非本来就是全通关后的无限模式？暂时假设突破即解除）
        this.player.isReplay = false;

        // 检查技能解锁 (Level up skill upon entering specific realms)
        this.player.checkSkillUnlock();

        // 关键修复：立即保存并强制同步
        this.autoSave();
        if (typeof AuthService !== 'undefined' && AuthService.isLoggedIn()) {
            // Force sync log
            console.log('Realm Complete: Forcing Cloud Sync');
            // autoSave calls saveGame which handles sync, but logging here helps debug
        }

        // 治疗玩家 (小幅回复，而不是回满)
        const healAmount = Math.floor(this.player.maxHp * 0.2);
        this.player.heal(healAmount);
        Utils.showBattleLog(`进入下一重天域，恢复 ${healAmount} HP，轮回精粹 +${clearEssence}`);

        this.map.generate(this.player.realm);
        this.renderTreasures('map-treasures');
        this.showScreen('map-screen');
    }

    // 显示胜利界面
    showVictoryScreen() {
        document.getElementById('game-over-title').textContent = '逆天成功！';
        document.getElementById('game-over-title').classList.add('victory');
        document.getElementById('game-over-text').textContent = '你打破了命运的枷锁，成为了真正的逆命者！';

        document.getElementById('stat-floor').textContent = this.map.getRealmName(this.player.realm);
        document.getElementById('stat-enemies').textContent = this.player.enemiesDefeated;
        document.getElementById('stat-laws').textContent = this.player.collectedLaws.length;
        const legacyStat = document.getElementById('stat-legacy');
        if (legacyStat) {
            legacyStat.textContent = `+${this.lastLegacyGain || 0}（库存 ${this.legacyProgress.essence}）`;
        }

        this.showScreen('game-over-screen');
    }

    // 显示牌组
    showDeck() {
        this.showDeckModal('deck');
    }

    // 显示牌组模态框
    showDeckModal(type) {
        const modal = document.getElementById('deck-modal');
        const modalContent = modal.querySelector('.modal-content');

        // Ensure Header Structure
        let header = modalContent.querySelector('.deck-view-header');
        let contentContainer = modalContent.querySelector('.deck-view-content');

        if (!header || !contentContainer) {
            const closeBtn = modalContent.querySelector('.modal-close');
            const oldCloseBtnHtml = closeBtn ? closeBtn.outerHTML : '<button class="modal-close" onclick="game.closeModal()">×</button>';

            modalContent.innerHTML = `
                ${oldCloseBtnHtml}
                <div class="deck-view-header">
                    <h2>当前牌组</h2>
                </div>
                <!-- Add a container for the scene perspective if needed, or keep relying on content -->
                <div class="deck-view-content" id="deck-view-cards"></div>
            `;
            header = modalContent.querySelector('.deck-view-header');
            contentContainer = document.getElementById('deck-view-cards');
        }

        const title = header.querySelector('h2');
        contentContainer.innerHTML = '';

        let cards = [];
        let deckName = '';

        switch (type) {
            case 'deck': cards = this.player.deck; deckName = '当前牌组'; break;
            case 'draw': cards = this.player.drawPile; deckName = '识海'; break;
            case 'discard': cards = this.player.discardPile; deckName = '轮回'; break;
        }

        title.textContent = `${deckName} · ${cards.length}`;

        // === Group by Rarity (High -> Low) ===
        const rarityOrder = ['legendary', 'epic', 'rare', 'uncommon', 'common', 'basic'];
        const groups = {
            'legendary': { name: '传说 · Legendary', cards: [], color: '#ffeb3b', icon: '👑' },
            'epic': { name: '史诗 · Epic', cards: [], color: '#d500f9', icon: '🔮' },
            'rare': { name: '稀有 · Rare', cards: [], color: '#00e5ff', icon: '💎' },
            'uncommon': { name: '优秀 · Uncommon', cards: [], color: '#76ff03', icon: '🌿' },
            'common': { name: '普通 · Common', cards: [], color: '#bdbdbd', icon: '📄' },
            'basic': { name: '基础 · Basic', cards: [], color: '#795548', icon: '🪵' }
        };

        // Helper to count duplicates
        const cardCounts = {};

        cards.forEach(card => {
            if (!card || !card.id) return;
            const key = card.upgraded ? `${card.id}_upgraded` : card.id;
            if (!cardCounts[key]) cardCounts[key] = 0;
            cardCounts[key]++;
        });

        // Add unique instances to groups
        const processedKeys = new Set();

        cards.forEach(card => {
            if (!card || !card.id) return;
            const key = card.upgraded ? `${card.id}_upgraded` : card.id;

            if (processedKeys.has(key)) return;
            processedKeys.add(key);

            let rarity = (card.rarity || 'common').toLowerCase();
            if (!groups[rarity]) rarity = 'common';

            card._tempCount = cardCounts[key];
            groups[rarity].cards.push(card);
        });

        // Render Groups in Order
        rarityOrder.forEach((rarityKey, groupIndex) => {
            const group = groups[rarityKey];
            if (group.cards.length === 0) return;

            // Sort within rarity: Type (Attack > Skill) then ID
            group.cards.sort((a, b) => {
                const typeOrder = { attack: 1, skill: 2, power: 3, defense: 4 }; // Custom type priority
                const tA = typeOrder[a.type] || 99;
                const tB = typeOrder[b.type] || 99;
                if (tA !== tB) return tA - tB;
                return a.id.localeCompare(b.id);
            });

            const groupEl = document.createElement('div');
            groupEl.className = `deck-category rarity-${rarityKey}`;
            groupEl.style.animationDelay = `${groupIndex * 0.15}s`;

            // Enhanced Group Header
            groupEl.innerHTML = `
                <h3 style="border-color: ${group.color}; background: linear-gradient(90deg, ${group.color}15 0%, transparent 100%);">
                    <span style="font-size:1.2em; margin-right:5px; filter: drop-shadow(0 0 5px ${group.color});">${group.icon}</span>
                    <span style="color:${group.color}; text-shadow: 0 0 10px ${group.color}40;">${group.name}</span>
                    <span class="category-count" style="border: 1px solid ${group.color}50;">${group.cards.reduce((sum, c) => sum + c._tempCount, 0)}</span>
                </h3>
                <div class="deck-grid"></div>
            `;

            const grid = groupEl.querySelector('.deck-grid');

            group.cards.forEach((card, i) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'deck-card-wrapper';
                // Randomize float delay for natural look
                wrapper.style.animationDelay = `${Math.random() * 2}s`;
                wrapper.style.setProperty('--delay', `${i * 0.05}s`);

                const cardEl = Utils.createCardElement(card);

                if (card._tempCount > 1) {
                    const badge = document.createElement('div');
                    badge.className = 'card-count-badge';
                    badge.textContent = `x${card._tempCount}`;
                    cardEl.appendChild(badge);
                }

                wrapper.appendChild(cardEl);
                grid.appendChild(wrapper);
            });

            contentContainer.appendChild(groupEl);
        });

        modal.classList.add('active');
    }

    // 渲染法宝栏
    renderTreasures() {
        if (!this.player || !this.player.treasures) return;

        const containers = [
            document.getElementById('map-treasures'),
            document.getElementById('battle-treasures'),
            document.getElementById('treasures-container') // 顶部栏 (如有)
        ];

        // 构建 HTML
        const html = this.player.treasures.map(treasure => {
            const rarityClass = treasure.rarity || 'common';
            return `
                <div class="treasure-icon ${rarityClass}">
                    ${treasure.icon}
                    <div class="treasure-tooltip">
                        <h4>${treasure.name}</h4>
                        <p>${treasure.description}</p>
                    </div>
                </div>
            `;
        }).join('');

        // 更新所有容器
        containers.forEach(container => {
            if (container) {
                container.innerHTML = html;
            }
        });
    }

    // 调试模式开关
    toggleDebug() {
        this.debugMode = !this.debugMode;
        localStorage.setItem('theDefierDebug', this.debugMode);
        this.updateDebugUI();
        console.log(`Debug Mode: ${this.debugMode ? 'ON' : 'OFF'}`);
        return this.debugMode ? 'Debug ON' : 'Debug OFF';
    }

    updateDebugUI() {
        const btns = document.querySelectorAll('.cheat-btn');
        btns.forEach(btn => {
            btn.style.display = this.debugMode ? 'inline-block' : 'none';
        });

        // 可以在这里控制其他调试元素的显隐
    }

    // 显示命环
    // 作弊功能
    cheat() {
        this.showConfirmModal(
            '确定要启用作弊模式吗？\n这是测试功能，可能会破坏游戏体验。',
            () => this._performCheat()
        );
    }

    _performCheat() {
        // 1. 暴富
        this.player.gold += 10000000;

        // 2. 命环满级
        if (typeof FATE_RING !== 'undefined') {
            const maxLevel = 10;
            this.player.fateRing.level = maxLevel;
            this.player.fateRing.exp = 999999; // 确保是满经验

            // 确保槽位解锁
            if (this.player.fateRing.type === 'sealed') {
                this.player.fateRing.maxSlots = 12;
            } else if (this.player.fateRing.type === 'mutated') {
                this.player.fateRing.maxSlots = 4;
                if (FATE_RING.levels[10]) this.player.fateRing.maxSlots = FATE_RING.levels[10].slots;
            } else {
                if (FATE_RING.levels[10]) this.player.fateRing.maxSlots = FATE_RING.levels[10].slots;
            }

            if (this.player.fateRing.initSlots) {
                this.player.fateRing.initSlots();
            }
        }

        // 3. 获得所有法则
        if (typeof LAWS !== 'undefined') {
            this.player.collectedLaws = [];
            for (const key in LAWS) {
                this.player.collectedLaws.push(JSON.parse(JSON.stringify(LAWS[key])));
            }
            this.player.lawsCollected = this.player.collectedLaws.length;
        }

        // 4. 获得所有法宝
        if (typeof TREASURES !== 'undefined') {
            // 清空并重新收集所有法宝
            this.player.collectedTreasures = [];
            this.player.equippedTreasures = [];

            for (const key in TREASURES) {
                const treasure = TREASURES[key];
                // 深拷贝法宝数据
                const treasureCopy = JSON.parse(JSON.stringify(treasure));
                // 确保图标等属性被复制
                treasureCopy.icon = treasure.icon;
                treasureCopy.callbacks = treasure.callbacks;
                treasureCopy.getDesc = treasure.getDesc;

                this.player.collectedTreasures.push(treasureCopy);
            }

            Utils.showBattleLog(`【天道馈赠】获得所有 ${this.player.collectedTreasures.length} 个法宝！`);
        }

        // 5. 解锁所有技能（如果有冷却重置）
        if (this.player.skillCooldown !== undefined) {
            this.player.skillCooldown = 0;
        }

        // 6. 解锁所有关卡
        this.player.maxRealm = 14;
        if (typeof RealmManager !== 'undefined') {
            RealmManager.unlockAll();
        }

        // 7. 打开怪物调试面板
        this.showCheatMonsterSelector();

        this.updateUI();
        Utils.showBattleLog('【作弊生效】富可敌国，神功大成，万界通行！');
    }

    // 作弊：怪物选择器
    showCheatMonsterSelector() {
        const modalId = 'cheat-monster-selector';
        let modal = document.getElementById(modalId);

        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.85); z-index: 10000; display: flex;
                flex-direction: column; padding: 20px; overflow-y: auto;
                color: #fff; font-family: sans-serif;
            `;
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:20px; border-bottom:1px solid #444; padding-bottom:10px;">
                <h2 style="margin:0; color:gold;">⚔️ 试炼场 (Debug)</h2>
                <button onclick="document.getElementById('${modalId}').style.display='none'" style="padding:5px 15px;">关闭</button>
            </div>
            <div id="cheat-realm-list" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap:15px;"></div>
        `;

        const list = modal.querySelector('#cheat-realm-list');

        // 遍历所有境界 (1-14)
        for (let r = 1; r <= 14; r++) {
            const realmData = REALM_ENVIRONMENTS[r] || { name: `第${r}重天` };
            const card = document.createElement('div');
            card.style.cssText = `
                background: #222; border: 1px solid #555; padding: 10px; border-radius: 4px;
            `;

            // 添加两个通用测试按钮
            const btnStyle = "display:block; width:100%; margin:5px 0; padding:8px; background:#333; color:#eee; border:none; cursor:pointer; text-align:left;";

            card.innerHTML = `<h3 style="margin-top:0; color:#ddd;">${r}. ${realmData.name}</h3>`;

            // 1. 生成普通测试怪
            const normalBtn = document.createElement('button');
            normalBtn.style.cssText = btnStyle;
            normalBtn.textContent = "👊 生成随机小怪 (Random)";
            normalBtn.onclick = () => {
                this.startDebugBattle(r, 'normal');
                modal.style.display = 'none';
            };
            card.appendChild(normalBtn);

            // 2. 生成 Boss
            const bossBtn = document.createElement('button');
            bossBtn.style.cssText = btnStyle;
            bossBtn.textContent = "💀 生成 Boss";
            bossBtn.onclick = () => {
                this.startDebugBattle(r, 'boss');
                modal.style.display = 'none';
            };
            card.appendChild(bossBtn);

            list.appendChild(card);
        }

        modal.style.display = 'flex';
    }

    startDebugBattle(realm, type) {
        // 1. 切换环境
        this.player.realm = realm;
        this.updateRealmBackground(); // 确保背景切换

        // 2. 获取敌人数据
        let enemyData;
        if (type === 'boss') {
            // 尝试查找特定境界 Boss，找不到则随机
            const bosses = Object.values(ENEMIES).filter(e => e.isBoss && (e.realm === realm || !e.realm));
            enemyData = bosses.length > 0 ? Utils.deepClone(bosses[0]) : Utils.deepClone(ENEMIES.boss_generic || ENEMIES.boss_1);
            // 强制修正名字以显示测试
            enemyData.name = `(Test) ${enemyData.name}`;
        } else {
            // 随机小怪
            const minions = Object.values(ENEMIES).filter(e => !e.isBoss && (e.realm === realm || !e.realm));
            enemyData = minions.length > 0 ? Utils.deepClone(minions[Math.floor(Math.random() * minions.length)]) : Utils.deepClone(ENEMIES.basic_soldier);
        }

        // 3. 开始战斗
        this.showScreen('battle-screen');
        if (this.battle) {
            this.battle.init([enemyData]);
        }

        // 6. 恢复满血
        this.player.currentHp = this.player.maxHp;

        // 7. 更新UI
        this.player.recalculateStats();
        if (this.currentScreen === 'map-screen' && this.map) {
            this.map.updateStatusBar();
        }

        const lawCount = this.player.collectedLaws ? this.player.collectedLaws.length : 0;
        const treasureCount = this.player.collectedTreasures ? this.player.collectedTreasures.length : 0;

        Utils.showBattleLog(`【天道崩塌】作弊成功！已获得：千万灵石、满级命环、${lawCount}个法则、${treasureCount}个法宝！`);

        // 自动保存并同步云端
        this.saveGame();
    }

    showFateRing() {
        const modal = document.getElementById('ring-modal');
        const ring = this.player.fateRing;
        const ringSystem = document.getElementById('ring-system-3d');

        // Data Initialization
        if (!ring.slots || ring.slots.length === 0) {
            if (ring.initSlots) ring.initSlots();
        }
        if (!ring.unlockedPaths) ring.unlockedPaths = ['awakened'];
        if (!ring.path) ring.path = 'awakened';

        // --- Render 3D Scene (Initialize Only Once) ---
        if (ringSystem.children.length === 0) {
            ringSystem.innerHTML = ''; // Clear comments/whitespace
            // 1. Add Decorative Rings with Ink & Gold Styles
            const layers = ['core', 'inner', 'middle', 'outer'];
            layers.forEach(layer => {
                const el = document.createElement('div');
                el.className = `fate-ring-layer ring-layer-${layer}`;
                // Add runes
                if (layer !== 'core') {
                    for (let i = 0; i < 8; i++) {
                        const rune = document.createElement('div');
                        rune.className = 'ring-rune';
                        rune.innerText = this.getRandomRune();
                        rune.style.transform = `rotate(${i * 45}deg) translateY(-${(layer === 'inner' ? 120 : (layer === 'middle' ? 200 : 280))}px)`;
                        el.appendChild(rune);
                    }
                }
                ringSystem.appendChild(el);
            });

            // 2. Add Slots (3D Positioned)
            const radius = 220;
            const slotsCount = ring.slots.length;

            ring.slots.forEach((slot, index) => {
                const angleDeg = (index / slotsCount) * 360 - 90;
                const angleRad = angleDeg * (Math.PI / 180);
                const x = Math.cos(angleRad) * radius;
                const y = Math.sin(angleRad) * radius;

                const slotEl = document.createElement('div');
                slotEl.className = `ring-slot-3d`;
                slotEl.id = `ring-slot-${index}`; // Add ID for easier updates

                // Drag & Drop Attributes
                slotEl.classList.add('droppable');
                slotEl.setAttribute('data-slot-index', index);

                slotEl.style.transform = `translate(${x}px, ${y}px)`;

                // Content Placeholder
                slotEl.innerHTML = '';

                // Force high z-index interaction
                slotEl.style.zIndex = '2000';

                // Click Interaction
                slotEl.onclick = (e) => this.handleSlotClick(index, e);

                ringSystem.appendChild(slotEl);
            });

            // Bind Drag Events (Removed)
        }

        // --- Update Dynamic Content ---
        this.updateUIState(ring);

        // --- Render 2D UI Overlay ---

        // 1. Basic Info
        document.getElementById('modal-ring-name').innerText = ring.name;
        document.getElementById('modal-ring-level').innerText = `等级 ${ring.level}`;

        // EXP (Polished)
        const nextLevelExp = FATE_RING.levels[ring.level + 1]?.exp || 9999;
        const expPercent = Math.min(100, (ring.exp / nextLevelExp) * 100);
        const isMax = ring.level >= 10;

        const expBar = document.getElementById('modal-ring-exp-bar');
        expBar.style.width = `${expPercent}%`;
        if (isMax) expBar.classList.add('max');
        else expBar.classList.remove('max');

        const expText = document.getElementById('modal-ring-exp-text');
        expText.innerHTML = isMax ? '<span class="value max">MAX</span>' : `<span class="value">${ring.exp}</span> / ${nextLevelExp}`;

        // 2. Bonus Info
        const statsList = document.getElementById('modal-ring-stats');
        statsList.innerHTML = '';
        const bonus = ring.getStatsBonus();
        if (bonus.maxHp) statsList.innerHTML += this.createStatRow('生命上限', `+${bonus.maxHp}`, '❤️');
        if (bonus.energy) statsList.innerHTML += this.createStatRow('基础灵力', `+${bonus.energy}`, '⚡');
        if (bonus.draw) statsList.innerHTML += this.createStatRow('每回合抽牌', `+${bonus.draw}`, '🎴');

        // Character Specifics
        document.getElementById('modal-ring-path').innerHTML = this.renderCurrentPathInfo(ring) + this.renderCharacterSpecifics(ring);

        // 3. Right Panel (Tabbed Refactor)
        const rightPanel = document.querySelector('.ring-ui-panel.right');
        // Check if structure exists, if not recreate (safe to overwrite)
        rightPanel.innerHTML = `
            <div class="panel-tabs">
                <div class="tab active" onclick="game.switchRingTab(this, 'library')">法则库 (${this.player.collectedLaws.length})</div>
                <div class="tab" onclick="game.switchRingTab(this, 'resonance')">法则共鸣</div>
            </div>
            <div class="panel-content-area">
                <div id="tab-content-library" class="tab-content active">
                     ${this.renderLawLibrary(ring)}
                </div>
                <div id="tab-content-resonance" class="tab-content">
                     ${this.renderResonances(ring)}
                </div>
            </div>
            <div class="ring-ui-footer" id="ring-ui-footer">
                <p class="instruction-text">点击空槽位，再选择法则库中的法则进行装配</p>
            </div>
        `;

        // Bind Events (Library needs re-binding on update, Drag only on init - handled above)
        this.bindLibraryEvents();

        modal.classList.add('active');
    }

    // Optimized UI Updater (Full State Refresh without Re-render)
    updateUIState(ring) {
        // 1. Update Slots
        ring.slots.forEach((slot, index) => {
            const slotEl = document.getElementById(`ring-slot-${index}`);
            if (!slotEl) return;

            // Update Classes
            slotEl.className = `ring-slot-3d ${!slot.unlocked ? 'locked' : ''} ${this.selectedRingSlot === index ? 'active' : ''}`;

            // Update Content
            const law = slot.law ? LAWS[slot.law] : null;
            const subLaw = slot.subLaw ? LAWS[slot.subLaw] : null;

            let content = '';
            if (law) {
                if (subLaw) {
                    content = `
                        <div class="slot-inner-icon main">${law.icon}</div>
                        <div class="slot-fusion-icon" style="position:absolute; bottom:-10px; right:-10px; font-size:1rem; background:#000; border-radius:50%; border:1px solid gold; width:25px; height:25px; display:flex; justify-content:center; align-items:center;">${subLaw.icon}</div>
                     `;
                } else {
                    content = `<div class="slot-inner-icon">${law.icon}</div>`;
                }
            } else if (!slot.unlocked) {
                content = `<div class="slot-inner-icon" style="font-size:1.2rem; filter: grayscale(1);">🔒</div>`;
            } else {
                content = `<div class="slot-inner-icon" style="opacity:0.2; font-size: 2rem;">+</div>`;
            }

            if (slotEl.innerHTML !== content) slotEl.innerHTML = content;
        });

        // 2. Update Library Items
        const equippedLaws = ring.getSocketedLaws();
        const libraryItems = document.querySelectorAll('.law-item-row');
        libraryItems.forEach(item => {
            const lawId = item.dataset.id;
            const isEquipped = equippedLaws.includes(lawId);
            const statusIcon = item.querySelector('.law-status-icon');

            if (isEquipped) {
                item.classList.add('equipped');
                // statusIcon content managed via CSS 'content' but we can safeguard here or leave it generic
            } else {
                item.classList.remove('equipped');
            }
        });

        // 3. Update Stats (Left Panel) - Lightweight enough to re-render
        const statsList = document.getElementById('modal-ring-stats');
        if (statsList) {
            statsList.innerHTML = '';
            const bonus = ring.getStatsBonus();
            if (bonus.maxHp) statsList.innerHTML += this.createStatRow('生命上限', `+${bonus.maxHp}`, '❤️');
            if (bonus.energy) statsList.innerHTML += this.createStatRow('基础灵力', `+${bonus.energy}`, '⚡');
            if (bonus.draw) statsList.innerHTML += this.createStatRow('每回合抽牌', `+${bonus.draw}`, '🎴');
        }
    }

    // Tab Switcher
    switchRingTab(tabEl, tabName) {
        document.querySelectorAll('.panel-tabs .tab').forEach(t => t.classList.remove('active'));
        tabEl.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-content-${tabName}`).classList.add('active');
    }

    getRandomRune() {
        const runes = ['⚡', '🔥', '❄️', '🌪️', '👁️', '⚔️', '🛡️', '🔮', '🌙', '☀️', '☯️', '📜'];
        return runes[Math.floor(Math.random() * runes.length)];
    }

    createStatRow(label, value, icon) {
        return `
            <div class="stat-row-3d">
                <span style="color:#aaa"><span style="margin-right:5px">${icon}</span>${label}</span>
                <span style="color:#fff; font-weight:bold">${value}</span>
            </div>
        `;
    }

    handleSlotClick(index, e) {
        e.stopPropagation();
        const ring = this.player.fateRing;
        const slotData = ring.slots[index];

        if (!slotData.unlocked) {
            if (ring.type === 'sealed' && ring.canUnseal && ring.canUnseal(index)) {
                this.showConfirmModal(
                    `该槽位被【逆生咒】封印。\n强制血契解封将永久扣除当前最大生命值的30%！\n是否解封并获得灵力与抽牌增益？`,
                    () => {
                        if (ring.sacrificeUnseal) {
                            const success = ring.sacrificeUnseal(index);
                            if (success) {
                                this.showFateRing(); // Structure change needs full refresh
                                this.autoSave();
                            }
                        } else {
                            ring.unseal(index);
                            this.showFateRing();
                            this.autoSave();
                        }
                    }
                );
            } else {
                Utils.showBattleLog('该槽位尚未解锁');
            }
            return;
        }

        // Click Logic:
        // 1. If slot has law -> Unload it
        // 2. If slot empty -> Select it
        if (slotData.law) {
            // Mutated Ring Special: If fusion, remove subLaw first?
            if (ring.type === 'mutated' && slotData.subLaw) {
                slotData.subLaw = null;
                Utils.showBattleLog('融合法则已移除');
            } else {
                ring.socketLaw(index, null);
                Utils.showBattleLog('法则已卸载');
            }
            this.player.recalculateStats();
            this.updateUIState(ring); // Optimized update
            this.autoSave();
        } else {
            this.selectedRingSlot = (this.selectedRingSlot === index) ? undefined : index;
            this.updateUIState(ring); // Optimized update
        }
    }

    // Removed bindRingDragEvents (Interaction removed per user request)

    // Updated bindLibraryEvents for optimized updates
    bindLibraryEvents() {
        // Selector matches new structure
        const items = document.querySelectorAll('.law-item-row');
        items.forEach(item => {
            // Remove 'equipped' check to allow selecting equipped items if we want to show info, 
            // but for equipping logic, we check inside.

            item.onclick = () => {
                const lawId = item.dataset.id;
                const ring = this.player.fateRing;
                // Safe lookup
                const equippedSlotIndex = ring.slots.findIndex(slot => slot.law === lawId);

                // 1. If already equipped -> Unequip
                if (equippedSlotIndex !== -1) {
                    ring.socketLaw(equippedSlotIndex, null);
                    Utils.showBattleLog('法则已卸载');
                    this.updateUIState(ring);
                    this.autoSave();
                    return;
                }

                // 2. Equip Logic
                if (item.classList.contains('equipped')) return; // Should be redundant now but safe

                let targetSlot = this.selectedRingSlot;

                if (targetSlot === undefined) {
                    // Find first empty
                    for (let i = 0; i < ring.slots.length; i++) {
                        if (ring.slots[i].unlocked && !ring.slots[i].law) {
                            targetSlot = i;
                            break;
                        }
                    }
                }

                if (targetSlot !== undefined && targetSlot >= 0) {
                    if (ring.socketLaw(targetSlot, lawId)) {
                        Utils.showBattleLog(`已装填法则`);
                        this.selectedRingSlot = undefined;
                        this.updateUIState(ring); // Optimized update
                        this.autoSave();
                    } else {
                        Utils.showBattleLog('装填失败');
                    }
                } else {
                    Utils.showBattleLog('请先选择一个空槽位');
                }
            };
        });
    }

    // 渲染当前路径信息
    renderCurrentPathInfo(ring) {
        if (!ring.path) return '';

        const path = FATE_RING.paths[ring.path];
        if (!path) return ''; // Guard against invalid path keys (e.g. 'undefined' string)
        return `
            <div class="ring-path-info">
                <div style="font-weight: bold; color: var(--accent-purple); margin-bottom: 5px;">
                    ${path.icon || '✨'} ${path.name}
                </div>
                <div style="font-size: 0.8rem; line-height: 1.4;">
                    ${path.description}
                </div>
                ${this.renderEvolveButton(ring)}
            </div>
        `;
    }

    // 渲染角色专属面板
    renderCharacterSpecifics(ring) {
        if (ring.type === 'karma' && ring.getKarmaStatus) {
            const status = ring.getKarmaStatus();
            const meritPercent = (status.merit / status.max) * 100;
            const sinPercent = (status.sin / status.max) * 100;
            return `
                <div class="ring-specifics-panel" style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                    <h4 style="color: var(--accent-gold); margin: 0 0 10px 0;">功德金轮</h4>
                    
                    <div style="margin-bottom: 8px;">
                        <div style="font-size: 0.8rem; display: flex; justify-content: space-between;">
                            <span>功德 (防御)</span>
                            <span>${status.merit}/${status.max}</span>
                        </div>
                        <div style="background: rgba(0,0,0,0.3); height: 6px; border-radius: 3px; overflow: hidden;">
                            <div style="width: ${meritPercent}%; background: #ffd700; height: 100%;"></div>
                        </div>
                    </div>
                    
                    <div>
                        <div style="font-size: 0.8rem; display: flex; justify-content: space-between;">
                            <span>业力 (攻击)</span>
                            <span>${status.sin}/${status.max}</span>
                        </div>
                        <div style="background: rgba(0,0,0,0.3); height: 6px; border-radius: 3px; overflow: hidden;">
                            <div style="width: ${sinPercent}%; background: #ff4d4d; height: 100%;"></div>
                        </div>
                    </div>
                    <div style="font-size: 0.7rem; color: #888; margin-top: 5px;">
                        满值触发【金刚法相】或【明王之怒】
                    </div>
                </div>
            `;
        }

        if (ring.type === 'analysis' && ring.analyzedTypes) {
            return `
                <div class="ring-specifics-panel" style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                    <h4 style="color: var(--accent-blue); margin: 0 0 10px 0;">真理解析</h4>
                    <div style="font-size: 0.8rem; color: #ddd;">
                        已解析物种: <span style="color: var(--accent-gold);">${ring.analyzedTypes.length}</span>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px;">
                        ${ring.analyzedTypes.map(t => `<span style="background: rgba(255,255,255,0.1); padding: 2px 4px; border-radius: 2px; font-size: 0.7rem;">${t}</span>`).join('')}
                    </div>
                    ${ring.tacticalConfig && ring.tacticalConfig.damageVsType ? `
                        <div style="margin-top: 8px; font-size: 0.8rem; color: var(--accent-green);">
                            当前针对: <strong>${ring.tacticalConfig.damageVsType}</strong>
                            <br>(伤害 +${(ring.tacticalConfig.damageBonus * 100).toFixed(0)}%)
                        </div>
                    ` : '<div style="margin-top: 5px; font-size: 0.7rem; color: #666;">暂无针对目标</div>'}
                </div>
            `;
        }

        if (ring.type === 'sealed') {
            // 简单的状态提示
            const unlockedCount = ring.slots.filter(s => s.unlocked).length;
            return `
                <div class="ring-specifics-panel" style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                    <h4 style="color: var(--accent-purple); margin: 0 0 5px 0;">逆生咒印</h4>
                    <div style="font-size: 0.8rem;">
                        解封进度: <span style="color: ${unlockedCount > 1 ? 'var(--accent-red)' : '#888'}">${unlockedCount}/12</span>
                    </div>
                    <div style="font-size: 0.7rem; color: #888; margin-top: 5px;">
                        点击锁定槽位以解除封印（需付出代价）
                    </div>
                </div>
             `;
        }

        return '';
    }

    // 渲染进化按钮（如果有）
    renderEvolveButton(ring) {
        const available = getAvailablePaths(ring);
        if (available.length > 0 && ring.level > 0) {
            return `
                <button onclick="game.showEvolveOptions()" 
                    style="width: 100%; margin-top: 10px; padding: 5px; background: rgba(255,215,0,0.2); border: 1px solid var(--accent-gold); color: var(--accent-gold); border-radius: 4px; cursor: pointer;">
                    🌟 命环进化
                </button>
            `;
        }
        return '';
    }



    // 渲染法则库列表 (Redesigned)
    renderLawLibrary(ring) {
        if (this.player.collectedLaws.length === 0) {
            return '<div style="padding: 20px; text-align: center; color: #666;">暂无法则</div>';
        }

        return `
            <div class="library-list-container">
            ${this.player.collectedLaws.map(law => {
            const isEquipped = ring.getSocketedLaws().includes(law.id);
            return `
                    <div class="law-item-row ${isEquipped ? 'equipped' : ''}" data-id="${law.id}">
                        <div class="law-icon-box">${law.icon}</div>
                        <div class="law-info">
                            <div class="law-name">${law.name}</div>
                            <div class="law-desc-mini">${(typeof getLawPassiveDescription === 'function' ? getLawPassiveDescription(law) : '') || law.description || '效果未知'}</div>
                        </div>
                        <div class="law-status-icon"></div>
                    </div>
                `;
        }).join('')}
            </div>
        `;
    }

    // 渲染法则共鸣 (Redesigned)
    renderResonances(ring) {
        if (!typeof LAW_RESONANCES === 'object') return '';

        let activeResonances = [];
        let html = '';

        html += `<div class="section-label">共鸣检测</div>`;

        for (const key in LAW_RESONANCES) {
            const resonance = LAW_RESONANCES[key];
            const equippedLaws = ring.getSocketedLaws();
            const hasAllLaws = resonance.laws.every(lawId => equippedLaws.includes(lawId));

            // Calculate progress
            const matchCount = resonance.laws.filter(lawId => equippedLaws.includes(lawId)).length;
            const totalCount = resonance.laws.length;
            const progress = (matchCount / totalCount) * 100;

            if (matchCount > 0) { // Only show relevant ones
                html += `
                    <div class="resonance-card ${hasAllLaws ? 'active' : ''}" data-resonance-id="${resonance.id}">
                        <div class="resonance-header">
                            <span class="resonance-name">${resonance.name}</span>
                            <span style="font-size:0.8rem; color:${hasAllLaws ? 'var(--accent-gold)' : '#666'}">${matchCount}/${totalCount}</span>
                        </div>
                        <div style="font-size:0.8rem; color:#ccc; margin-bottom:5px;">${resonance.description}</div>
                        <div class="resonance-bar">
                            <div class="resonance-progress" style="width: ${progress}%"></div>
                        </div>
                    </div>
                `;
            }
        }

        if (html === `<div class="section-label">共鸣检测</div>`) {
            return `<div class="section-label">共鸣检测</div><div style="text-align:center; color:#666; font-size:0.8rem; padding:10px;">暂无共鸣迹象</div>`;
        }

        return html;
    }

    // 绑定命环界面事件
    bindRingEvents() {
        const modal = document.getElementById('ring-modal');

        // 绑定槽位点击
        modal.querySelectorAll('.law-slot-node').forEach(slot => {
            slot.addEventListener('click', (e) => {
                const index = parseInt(slot.dataset.index);
                const ring = this.player.fateRing;
                const slotData = ring.slots[index];

                if (!slotData.unlocked) {
                    // Check for SealedRing unseal interaction
                    if (ring.type === 'sealed' && ring.canUnseal && ring.canUnseal(index)) {
                        this.showConfirmModal(
                            `该槽位被【逆生咒】封印。\n强制解除将永久损耗生命上限。\n是否解除？`,
                            () => {
                                ring.unseal(index);
                                this.showFateRing();
                                this.autoSave();
                            }
                        );
                    } else {
                        Utils.showBattleLog('该槽位尚未解锁');
                    }
                    return;
                }

                // 如果该槽位有法则，点击卸载
                if (slotData.law) {
                    ring.socketLaw(index, null); // Unload
                    Utils.showBattleLog('法则已卸载');
                    this.showFateRing(); // 刷新
                    this.autoSave();
                } else {
                    // 如果是空槽位，选中它
                    if (this.selectedRingSlot === index) {
                        this.selectedRingSlot = undefined; // 取消选中
                    } else {
                        this.selectedRingSlot = index;
                    }
                    this.showFateRing();
                }
            });
        });

        // 绑定法则库点击
        modal.querySelectorAll('.library-item').forEach(item => {
            if (item.classList.contains('equipped')) return;

            item.addEventListener('click', () => {
                const lawId = item.dataset.id;
                let targetSlot = this.selectedRingSlot;

                // 如果没选中槽位，找第一个空的
                if (targetSlot === undefined) {
                    for (let i = 0; i < this.player.fateRing.slots.length; i++) {
                        if (this.player.fateRing.slots[i].unlocked && !this.player.fateRing.slots[i].law) {
                            targetSlot = i;
                            break;
                        }
                    }
                }

                if (targetSlot !== undefined && targetSlot >= 0) {
                    if (this.player.fateRing.socketLaw(targetSlot, lawId)) {
                        const lawName = LAWS[lawId]?.name || '法则';
                        Utils.showBattleLog(`已装填法则【${lawName}】`);
                        this.selectedRingSlot = undefined; // 重置选中
                        this.showFateRing();
                        this.autoSave();
                    } else {
                        Utils.showBattleLog('装填失败：槽位未解锁或无效');
                    }
                } else {
                    Utils.showBattleLog('请先选择一个空槽位');
                }
            });
        });
    }

    // 显示进化选项（为了复用之前的逻辑，这里把之前的 showFateRing 里的进化部分提出来）
    showEvolveOptions() {
        const modal = document.getElementById('ring-modal'); // 复用同一个modal，或者创建一个临时的覆盖层
        // 这里简单起见，我们直接在模态框里替换内容显示进化选项，或者弹出一个 alert/confirm 风格的选择

        const ring = this.player.fateRing;
        const availablePaths = getAvailablePaths(ring);

        if (availablePaths.length === 0) return;

        const slotsContainer = document.querySelector('.fate-ring-body');
        slotsContainer.innerHTML = `
            <div class="evolution-view">
                <h2 class="evolution-title">选择进化路径</h2>
                <div class="evolution-options-container">
                    ${availablePaths.map(path => `
                        <div class="evolution-path-card" onclick="game.evolveFateRing('${path.id}')">
                            <div class="path-icon">${path.icon}</div>
                            <h3 class="path-name">${path.name}</h3>
                            <p class="path-desc">${path.description}</p>
                            <div class="path-select-hint">点击选择</div>
                        </div>
                    `).join('')}
                </div>
                <button class="evolution-back-btn" onclick="game.showFateRing()">返回</button>
            </div>
         `;
    }


    // 进化命环
    evolveFateRing(pathId) {
        const path = FATE_RING.paths[pathId];
        if (!path) return;

        // 记录之前的路径
        if (!this.player.fateRing.unlockedPaths) {
            this.player.fateRing.unlockedPaths = [];
        }
        if (this.player.fateRing.path && this.player.fateRing.path !== 'crippled') {
            this.player.fateRing.unlockedPaths.push(this.player.fateRing.path);
        }

        // 设置新路径
        this.player.fateRing.path = pathId;

        // 应用路径加成
        this.applyPathBonus(path);

        Utils.showBattleLog(`命环进化！获得【${path.name}】！`);

        // 关闭并重新打开以刷新UI
        this.closeModal();
        setTimeout(() => this.showFateRing(), 100);

        this.autoSave();
    }

    // 应用路径加成
    applyPathBonus(path) {
        if (!path.bonus) return;

        switch (path.bonus.type) {
            case 'hpBonus':
                this.player.maxHp += path.bonus.value;
                this.player.currentHp += path.bonus.value;
                break;
            case 'energyBonus':
                this.player.baseEnergy += path.bonus.value;
                break;
            case 'drawBonus':
                this.player.drawCount += path.bonus.value;
                break;
            case 'damageBonus':
                // Store permanent damage bonus from Fate Ring
                this.player.fateRingDamageBonus = (this.player.fateRingDamageBonus || 0) + path.bonus.value;
                break;
            case 'ultimate':
                // Defiance: 免疫一次致死
                if (this.player.fateRing) {
                    this.player.fateRing.deathImmunityCount = (this.player.fateRing.deathImmunityCount || 0) + 1;
                }
                break;
        }
    }

    // 显示游戏介绍 (v5.1)
    // 切换游戏介绍标签页
    switchIntroTab(tabId) {
        const nextTab = ['overview', 'mechanics', 'controls', 'updates'].includes(tabId) ? tabId : 'overview';

        document.querySelectorAll('.intro-tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tab === nextTab) btn.classList.add('active');
        });

        const contentPanel = document.getElementById('intro-tab-content');
        if (contentPanel) {
            contentPanel.innerHTML = (this.introTabContent && this.introTabContent[nextTab]) || '';
            contentPanel.dataset.activeTab = nextTab;
            contentPanel.classList.add('active');
        }

        const scrollArea = document.querySelector('.intro-content-area');
        if (scrollArea) {
            scrollArea.scrollTop = 0;
        }
    }

    showGameIntro() {
        const modal = document.getElementById('settings-modal');
        // 确保模态框存在
        if (!modal) {
            console.error('Settings modal not found!');
            return;
        }

        const settingsContainer = document.getElementById('settings-options');
        if (!settingsContainer) return;

        // Content for specific tabs
        // Tab 1: Overview
        const overviewContent = `
            <div class="intro-section">
                <h3><span style="font-size:1.5rem; margin-right:10px;">☯</span> 游戏定位</h3>
                <p class="intro-text">
                    《逆命者 The Defier》是一款东方仙侠题材的卡牌 Roguelike。你将在随机地图中构筑卡组、收集法宝、推进命环成长，
                    在不断变化的战斗与事件中完成“逆天改命”。
                </p>
                <ul class="intro-list">
                    <li><strong>主线挑战</strong>：闯过 18 层天域，击败镇守强敌。</li>
                    <li><strong>长线玩法</strong>：无尽轮回高压成长，挑战更高轮次。</li>
                    <li><strong>对抗玩法</strong>：PVP 天道榜，镜像对战与赛季奖励并行。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>🚀 30秒上手</h3>
                <ul class="intro-list">
                    <li>点击「新的轮回」进入选角，游客模式可直接开局。</li>
                    <li>进入战斗后先看敌方意图，再决定攻防节奏。</li>
                    <li>优先围绕 1-2 套核心机制构筑，不要平均拿牌。</li>
                    <li>打完牌后点击「结束回合」，逐步滚起资源优势。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>👥 可选角色（6位）</h3>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div class="char-highlight" style="border-color: var(--accent-gold);">
                        <strong style="color: var(--accent-gold);">🤺 林风 · 逆命者</strong>
                        <p style="font-size: 0.85rem; margin-top: 6px;">命环成长收益高，后期上限强。</p>
                    </div>
                    <div class="char-highlight" style="border-color: var(--accent-green);">
                        <strong style="color: var(--accent-green);">🌿 香叶 · 被诅咒的医者</strong>
                        <p style="font-size: 0.85rem; margin-top: 6px;">治疗与持续压制并存，续航稳定。</p>
                    </div>
                    <div class="char-highlight" style="border-color: var(--accent-red);">
                        <strong style="color: var(--accent-red);">📿 无欲 · 苦行僧</strong>
                        <p style="font-size: 0.85rem; margin-top: 6px;">功德/业力双资源，攻守切换明显。</p>
                    </div>
                    <div class="char-highlight" style="border-color: #2196F3;">
                        <strong style="color: #2196F3;">📚 严寒 · 命环学者</strong>
                        <p style="font-size: 0.85rem; margin-top: 6px;">解析与技能联动，节奏控制强。</p>
                    </div>
                    <div class="char-highlight" style="border-color: #8aa4ff;">
                        <strong style="color: #8aa4ff;">🌠 墨尘 · 星律巡使</strong>
                        <p style="font-size: 0.85rem; margin-top: 6px;">围绕命环节奏与标记链条展开。</p>
                    </div>
                    <div class="char-highlight" style="border-color: #4ecdc4;">
                        <strong style="color: #4ecdc4;">🪬 宁玄 · 灵器行者</strong>
                        <p style="font-size: 0.85rem; margin-top: 6px;">法宝与攻防同频，回合质量高。</p>
                    </div>
                </div>
            </div>
        `;

        // Tab 2: Mechanics
        const mechanicsContent = `
            <div class="intro-section">
                <h3>⚔️ 战斗资源与回合节奏</h3>
                <ul class="intro-list">
                    <li><strong>灵力</strong>：决定当回合可打出的卡牌总费用。</li>
                    <li><strong>奶糖</strong>：用于特定卡牌与无尽指令交易，属于关键节奏资源。</li>
                    <li><strong>战场指令</strong>：中后期核心资源，可在关键回合完成“稳压/破阵/斩杀”反转。</li>
                    <li><strong>敌方意图</strong>：先看意图再出牌，能显著降低无效损失。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>⭕ 命环系统与路径</h3>
                <ul class="intro-list">
                    <li>命环升级可提升基础属性并解锁更多法则槽位。</li>
                    <li>不同路径决定你的战斗身份与长期收益。</li>
                    <li>命环、法则、法宝、构筑流派会形成联动增益。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>🌌 五行法则与共鸣</h3>
                <p class="intro-text">金→木→土→水→火→金。属性克制是前中期最稳定的增伤来源之一。</p>
                <ul class="intro-list">
                    <li><strong>克制</strong>：伤害显著提高。</li>
                    <li><strong>被克</strong>：伤害明显衰减。</li>
                    <li><strong>法则共鸣</strong>：同系法则与套装协同可触发额外效果。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>♾️ 无尽与 🏆 PVP</h3>
                <ul class="intro-list">
                    <li><strong>无尽轮回</strong>：以压力系统驱动高压成长，强调稳压与爆发平衡。</li>
                    <li><strong>天道榜（PVP）</strong>：镜像对战、段位奖励、商店外观与经济循环。</li>
                    <li><strong>传承系统</strong>：局外成长可强化下一轮开局强度与构筑容错。</li>
                </ul>
            </div>
        `;

        // Tab 3: Controls & Tips
        const controlsContent = `
            <div class="intro-section">
                <h3>🎮 操作指南</h3>
                <ul class="intro-list">
                    <li><strong>出牌</strong>：拖拽卡牌到敌人或目标区域。</li>
                    <li><strong>结束回合</strong>：点击右侧按钮推进回合。</li>
                    <li><strong>目标切换</strong>：优先处理高威胁意图目标。</li>
                    <li><strong>详情查看</strong>：悬停卡牌/图标查看完整说明。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>⌨️ 常用快捷键</h3>
                <ul class="intro-list">
                    <li><strong>L</strong>：打开/关闭战斗日志面板。</li>
                    <li><strong>F</strong>：切换全屏模式。</li>
                    <li><strong>Esc</strong>：退出全屏或关闭当前弹窗。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>💾 存档与同步</h3>
                <ul class="intro-list">
                    <li><strong>本地存档</strong>：自动保存，离线可玩。</li>
                    <li><strong>云存档</strong>：登录后可跨设备同步。</li>
                    <li><strong>冲突处理</strong>：系统会在冲突时提示保留版本。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>💡 实战建议</h3>
                <ul class="intro-list">
                    <li><strong>先保命后爆发</strong>：面对高威胁回合优先防守与净化。</li>
                    <li><strong>集中构筑</strong>：围绕单一核心机制拿牌，避免功能分散。</li>
                    <li><strong>关注资源峰值</strong>：灵力、奶糖、指令槽留给关键回合。</li>
                </ul>
            </div>
        `;

        // Tab 4: Updates
        const updatesContent = `
            <div class="intro-section">
                <h3>📜 内容总览（当前版本）</h3>
                <ul class="intro-list">
                    <li>6 位角色，差异化开局与专属遗物。</li>
                    <li>18 层天域 + 无尽轮回，支持长期刷构筑。</li>
                    <li>300+ 卡牌、50+ 法宝、30+ 法则与多套流派。</li>
                    <li>战场指令、遭遇主题、地图事件与营地联动强化可玩性。</li>
                    <li>PVP 天道榜 + 商店经济 + 外观佩戴系统。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>🧭 版本方向</h3>
                <ul class="intro-list">
                    <li><strong>稳定性优先</strong>：持续回归测试，减少版本回退风险。</li>
                    <li><strong>玩法扩展</strong>：强化流派差异、事件分支与无尽中后期深度。</li>
                    <li><strong>可读性优化</strong>：提升战斗提示、指令反馈和新手引导体验。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>👨‍💻 项目与反馈</h3>
                <p class="intro-text">
                    Designed & Developed by <strong>HealthOvO</strong> Team.
                </p>
                <p class="intro-text" style="font-size: 0.9rem;">
                    若你遇到问题或有玩法建议，欢迎在仓库提交 issue/讨论。
                </p>
                <div style="margin-top:20px; text-align:center;">
                    <a href="https://github.com/HealthOvO/The-Defier" target="_blank" style="color:var(--accent-cyan); text-decoration:none; border-bottom:1px dashed var(--accent-cyan);">GitHub Repository</a>
                </div>
            </div>
        `;


        this.introTabContent = {
            overview: overviewContent,
            mechanics: mechanicsContent,
            controls: controlsContent,
            updates: updatesContent
        };
        settingsContainer.innerHTML = `
        <div class="game-intro-container">
            <div class="intro-header">
                <h2>📖 逆命者指南</h2>
                <div class="subtitle">The Defier's Handbook</div>
            </div>

            <nav class="intro-tabs">
                <button class="intro-tab-btn active" data-tab="overview" onclick="game.switchIntroTab('overview')">综述</button>
                <button class="intro-tab-btn" data-tab="mechanics" onclick="game.switchIntroTab('mechanics')">机制</button>
                <button class="intro-tab-btn" data-tab="controls" onclick="game.switchIntroTab('controls')">操作</button>
                <button class="intro-tab-btn" data-tab="updates" onclick="game.switchIntroTab('updates')">更新</button>
            </nav>

            <div class="intro-content-area">
                <div id="intro-tab-content" class="intro-tab-panel active" data-active-tab="overview">
                    ${overviewContent}
                </div>
            </div>

            <div style="text-align: center; margin-top: auto; font-size: 0.8rem; color: rgba(255,255,255,0.2); padding-top: 10px;">
                v5.1 介绍更新 | Breaking Fate since 2024
            </div>
        </div>
        `;

        modal.classList.add('active');
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => this.switchIntroTab('overview'));
        } else {
            this.switchIntroTab('overview');
        }
    }

    // 卡牌使用效果
    playCardEffect(targetEl, cardType) {
        if (typeof particles !== 'undefined') {
            particles.playCardEffect(targetEl, cardType);
        }
    }

    // 关闭模态框
    closeModal() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
            modal.classList.remove('upgrade-mode'); // Clean up upgrade UI overrides
        });

        // Specific Modals (lacking generic class)
        const purification = document.getElementById('purification-modal');
        if (purification) purification.classList.remove('active');
    }

    // ========== 商店功能 ==========

    shopNode = null;
    shopItems = []; // 卡牌商品
    shopServices = []; // 特殊服务/道具

    // 显示商店
    showShop(node) {
        this.shopNode = node;
        this.shopCatalog = this.generateShopCatalog();
        this.shopActiveTab = this.shopActiveTab || 'base';
        this.syncActiveShopTab();
        this.renderShop();
        this.showScreen('shop-screen');
    }

    // 生成商店数据
    generateShopData() {
        const items = [];
        const services = [];
        const realm = this.player.realm || 1;
        const endlessMods = this.isEndlessActive() ? this.getEndlessModifiers() : null;
        // Hardcore: 价格随天域层数上涨，每重天+15%
        let priceMult = 1 + (realm - 1) * 0.15;
        if (endlessMods) {
            priceMult *= Math.max(0.75, Number(endlessMods.shopPriceMul) || 1);
        }

        // 1. 生成卡牌 (使用新方法)
        const newCards = this.generateShopCards(5);
        items.push(...newCards);

        // 2. 固定服务
        // 治疗
        services.push({
            id: 'heal',
            type: 'service',
            name: '灵丹妙药',
            icon: '💖',
            desc: `恢复 ${Math.floor(this.player.maxHp * 0.5)} 点生命`, // 30% -> 50%
            price: Math.floor(30 * priceMult), // 30
            sold: false
        });

        // 移除卡牌 - base price increased
        services.push({
            id: 'remove',
            type: 'service',
            name: '净化仪式',
            icon: '🗑️',
            desc: '移除一张牌',
            price: Math.floor(75 * (1 + (this.player.removeCount || 0) * 0.5) * priceMult), // 50 -> 75
            sold: false
        });

        // 命环经验 - base price increased
        services.push({
            id: 'exp',
            type: 'service',
            name: '命环充能',
            icon: '⬆️',
            desc: '命环经验 +100', // 100
            price: Math.floor(80 * priceMult), // 50 -> 80
            sold: false
        });

        services.push({
            id: 'tacticalPlan',
            type: 'service',
            name: '战术推演',
            icon: '📘',
            desc: '接下来 2 场战斗：首回合额外抽 1 张牌',
            price: Math.floor(95 * priceMult),
            sold: false
        });

        services.push({
            id: 'wardSigil',
            type: 'service',
            name: '护阵符',
            icon: '🧿',
            desc: '接下来 2 场战斗：开场获得 10 护盾',
            price: Math.floor(110 * priceMult),
            sold: false
        });

        services.push({
            id: 'bountyContract',
            type: 'service',
            name: '悬赏契约',
            icon: '📜',
            desc: '接下来 2 场战斗：胜利时额外获得灵石',
            price: Math.floor(125 * priceMult),
            sold: false
        });

        services.push({
            id: 'scoutPack',
            type: 'service',
            name: '侦巡补给包',
            icon: '🎒',
            desc: '支付灵石后，从 3 张随机卡牌中选择 1 张',
            price: Math.floor(105 * priceMult),
            sold: false
        });

        services.push({
            id: 'campRation',
            type: 'service',
            name: '行军口粮',
            icon: '🥣',
            desc: '恢复生命并获得 1 层开场护盾增益',
            price: Math.floor(85 * priceMult),
            sold: false
        });

        services.push({
            id: 'fateLedger',
            type: 'service',
            name: '命轨账簿',
            icon: '📚',
            desc: '命环经验 +45，并获得 1 层胜利悬赏增益',
            price: Math.floor(115 * priceMult),
            sold: false
        });

        services.push({
            id: 'pulseCatalyst',
            type: 'service',
            name: '灵息催化剂',
            icon: '⚡',
            desc: '接下来 2 场战斗：首回合灵力 +1',
            price: Math.floor(118 * priceMult),
            sold: false
        });

        services.push({
            id: 'insightIncense',
            type: 'service',
            name: '悟境香',
            icon: '🕯️',
            desc: '接下来 2 场战斗：命环经验额外 +30%',
            price: Math.floor(128 * priceMult),
            sold: false
        });

        services.push({
            id: 'fieldMedic',
            type: 'service',
            name: '战地医师签约',
            icon: '🩹',
            desc: '接下来 2 场战斗：胜利后恢复生命',
            price: Math.floor(112 * priceMult),
            sold: false
        });

        if (this.isEndlessActive()) {
            services.push({
                id: 'endlessRefit',
                type: 'service',
                name: '相位校准',
                icon: '🧬',
                desc: '替换一个当前无尽词缀',
                price: Math.floor(170 * priceMult),
                sold: false
            });
            services.push({
                id: 'endlessStabilizer',
                type: 'service',
                name: '轮回稳压',
                icon: '🧯',
                desc: '轮回压力 -2，并恢复生命',
                price: Math.floor(160 * priceMult),
                sold: false
            });
            services.push({
                id: 'endlessOverclock',
                type: 'service',
                name: '轮回过载',
                icon: '🔥',
                desc: '轮回压力 +2，立即获得稀有赐福与额外灵石',
                price: Math.floor(188 * priceMult),
                sold: false
            });
            services.push({
                id: 'endlessBlessing',
                type: 'service',
                name: '轮回祷告',
                icon: '🕯️',
                desc: '从 2 项无尽赐福中选择 1 项',
                price: Math.floor(210 * priceMult),
                sold: false
            });
        }

        // 3. 随机商品 (由原来的随机服务改为固定商品位 + 概率位)

        // --- 有概率刷出一个法宝 (如果有未拥有的) ---
        // 使用加权随机逻辑
        const treasure = this.getWeightedRandomTreasure();

        if (treasure && Math.random() < 0.5) {
            // 计算价格：基础价格 * (1 + 0.1 * (层数-1))
            let finalPrice = Math.floor((treasure.price || 150) * priceMult);

            services.push({
                id: treasure.id,
                type: 'treasure',
                name: treasure.name,
                icon: treasure.icon || '🏺',
                desc: treasure.description,
                price: finalPrice,
                sold: false,
                rarity: treasure.rarity
            });
        }

        // 4. 概率商品 (法则/药水/额外法宝)
        // 降低概率，因为已经必出法宝了
        if (Math.random() < 0.25) {
            const lawKeys = Object.keys(LAWS);
            const uncollected = lawKeys.filter(k => !this.player.collectedLaws.some(l => l.id === k));
            if (uncollected.length > 0) {
                const randomLawId = uncollected[Math.floor(Math.random() * uncollected.length)];
                const law = LAWS[randomLawId];
                services.push({
                    id: 'law',
                    type: 'item',
                    name: '法则残卷',
                    icon: '📜',
                    desc: `获得: ${law.name} `,
                    price: Math.floor(250 * priceMult),
                    sold: false,
                    data: law
                });
            }
        }

        if (Math.random() < 0.2) {
            services.push({
                id: 'maxHp',
                type: 'item',
                name: '淬体金丹',
                icon: '💊',
                desc: '最大生命上限 +5',
                price: Math.floor(120 * priceMult),
                sold: false
            });
        }

        // 极小概率刷出永久力量
        if (Math.random() < 0.05) {
            services.push({
                id: 'strength',
                type: 'item',
                name: '龙血草',
                icon: '💪',
                desc: '永久力量 +1',
                price: Math.floor(300 * priceMult),
                sold: false
            });
        }

        // 5. 更多服务
        // 刷新商店
        services.push({
            id: 'refresh',
            type: 'service',
            name: '重新进货',
            icon: '🔄',
            desc: '刷新所有卡牌商品',
            price: Math.floor(50 * priceMult),
            sold: false
        });

        // 赌博：神秘盒子
        services.push({
            id: 'gamble',
            type: 'service',
            name: '神秘盲盒',
            icon: '🎁',
            desc: '可能获得灵石、卡牌或...空气？',
            price: Math.floor(30 * priceMult),
            sold: false
        });

        return { items, services };
    }

    // 获取加权随机法宝
    getWeightedRandomTreasure() {
        if (typeof TREASURES === 'undefined') return null;

        const unowned = Object.values(TREASURES).filter(t => !this.player.hasTreasure(t.id));
        if (unowned.length === 0) return null;

        // Weights
        const weights = {
            common: 60,
            uncommon: 30,
            rare: 10,
            epic: 5,
            legendary: 2
        };

        const totalWeight = unowned.reduce((sum, t) => sum + (weights[t.rarity] || 10), 0);
        let roll = Math.random() * totalWeight;

        for (const t of unowned) {
            roll -= (weights[t.rarity] || 10);
            if (roll <= 0) return t;
        }
        return unowned[0];
    }

    // 生成商店卡牌 (封装以便刷新使用)
    generateShopCards(count = 5) {
        const items = [];
        // 商店刷新的卡牌价格不随层数膨胀太厉害，主要还是原价打折
        const realm = this.player.realm || 1;
        const endlessMods = this.isEndlessActive() ? this.getEndlessModifiers() : null;
        // 卡牌本身价格固定，这里Multiplier主要影响折扣力度? 不，这里影响最终售价
        // 卡牌基础价值较低，这里只微调
        let priceMult = 1 + (realm - 1) * 0.05;
        if (endlessMods) {
            priceMult *= Math.max(0.75, Number(endlessMods.shopPriceMul) || 1);
        }

        for (let i = 0; i < count; i++) {
            // 随层数提升稀有度
            let rarity = 'common';
            const roll = Math.random();
            if (realm >= 3) {
                // Hardcore: 2% legendary, 6% epic, 18% rare, 34% uncommon, 40% common
                if (roll < 0.02) rarity = 'legendary';
                else if (roll < 0.08) rarity = 'epic';
                else if (roll < 0.26) rarity = 'rare';
                else if (roll < 0.60) rarity = 'uncommon';
                else rarity = 'common';
            } else {
                if (roll < 0.05) rarity = 'legendary';
                else if (roll < 0.2) rarity = 'rare';
                else if (roll < 0.5) rarity = 'uncommon';
            }

            const card = getRandomCard(rarity, this.player.characterId);

            if (!card) continue;

            // Hardcore: 移除折扣，仅按难度系数
            const basePrice = this.getCardPrice(card);
            const price = Math.floor(basePrice * 1.0 * priceMult);

            items.push({
                type: 'card',
                card: card,
                price: price,
                sold: false
            });
        }
        return items;
    }

    // 更新UI
    updateUI() {
        if (this.currentScreen === 'map-screen') {
            this.map.render();
            this.updatePlayerDisplay();
        } else if (this.currentScreen === 'battle-screen') {
            this.updatePlayerDisplay();
            if (this.battle) {
                this.battle.updateBattleUI();
                this.updateActiveSkillUI();
            }
        }
    }

    // 更新主动技能UI
    updateActiveSkillUI() {
        const btn = document.getElementById('active-skill-btn');
        if (!btn) return;

        const skill = this.player.activeSkill;
        if (!skill || this.player.skillLevel === 0) {
            btn.style.display = 'none';
            return;
        }

        btn.style.display = 'flex';

        // Icon
        const iconEl = btn.querySelector('.skill-icon');
        if (iconEl) iconEl.textContent = skill.icon;

        // Tooltip
        const nameEl = btn.querySelector('.skill-name');
        const descEl = btn.querySelector('.skill-desc');
        if (nameEl) nameEl.textContent = skill.name + (this.player.skillLevel > 1 ? ` Lv.${this.player.skillLevel} ` : '');
        if (descEl) {
            if (skill.getDescription) {
                descEl.textContent = skill.getDescription(this.player.skillLevel);
            } else {
                descEl.textContent = skill.description;
            }
        }

        // Cooldown - Color Recovery Progress
        const overlay = btn.querySelector('.skill-cooldown-overlay');
        const text = btn.querySelector('.skill-cooldown-text');
        const loreEl = btn.querySelector('.skill-lore');

        if (this.player.skillCooldown > 0) {
            // 计算恢复进度 (0-1，0表示完全冷却，1表示即将可用)
            const progress = 1 - (this.player.skillCooldown / this.player.maxCooldown);

            // 不显示CD文本
            text.textContent = '';
            text.style.display = 'none';

            // 通过颜色恢复表示进度
            // 灰度从100%逐渐降低到0%
            const grayscale = (1 - progress) * 100;
            // 透明度从0.5逐渐增加到1
            const opacity = 0.5 + progress * 0.5;

            btn.style.filter = `grayscale(${grayscale}%)`;
            btn.style.opacity = opacity;

            // Overlay不再使用，设为0
            overlay.style.height = '0%';

            btn.classList.add('cooldown');
            btn.classList.remove('ready');

            // 在lore位置显示CD信息（仅tooltip可见）
            if (loreEl) {
                loreEl.textContent = `冷却中: ${this.player.skillCooldown} 回合`;
            }
        } else {
            overlay.style.height = '0%';
            text.textContent = '';
            text.style.display = 'none';
            btn.style.filter = 'none';
            btn.style.opacity = '1';
            btn.classList.remove('cooldown');
            btn.classList.add('ready');

            // 恢复lore文本
            if (loreEl) {
                loreEl.textContent = '"逆乱阴阳，颠倒乾坤。"';
            }
        }


    }

    // 激活主动技能 - 点击按钮触发
    // 激活主动技能 - 点击按钮触发
    activatePlayerSkill() {
        if (this.currentScreen !== 'battle-screen') return;
        if (this.battle.currentTurn !== 'player') {
            Utils.showBattleLog('现在不是你的回合！');
            return;
        }

        // 预检查：是否冷却中
        if (this.player.skillCooldown > 0) {
            Utils.showBattleLog(`技能冷却中(${this.player.skillCooldown})`);
            return;
        }

        // 直接通过验证，执行技能
        if (this.player.activateSkill(this.battle)) {
            this.updateActiveSkillUI();
            this.battle.updateBattleUI();
            // 增强反馈
            const btn = document.getElementById('active-skill-btn');
            if (btn) {
                Utils.addShakeEffect(btn);
                btn.classList.remove('ready');

                // Add particle effect customization here if needed
            }

            // Visual Flash
            const flash = document.createElement('div');
            flash.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(255,255,255,0.3);pointer-events:none;z-index:9999;transition:opacity 0.5s;';
            document.body.appendChild(flash);
            setTimeout(() => {
                flash.style.opacity = '0';
                setTimeout(() => flash.remove(), 500);
            }, 50);

            if (typeof audioManager !== 'undefined') audioManager.playSFX('buff');
        }
    }

    // 显示技能确认弹窗
    showSkillConfirmModal() {
        const modal = document.getElementById('skill-confirm-modal');
        const titleEl = document.getElementById('skill-confirm-title');
        const iconEl = document.getElementById('skill-confirm-icon');
        const descEl = document.getElementById('skill-confirm-desc');

        if (this.player.activeSkill) {
            titleEl.textContent = `${this.player.activeSkill.name} `;
            iconEl.textContent = this.player.activeSkill.icon || '⚡';

            if (this.player.activeSkill.getDescription) {
                descEl.textContent = this.player.activeSkill.getDescription(this.player.skillLevel);
            } else {
                descEl.textContent = this.player.activeSkill.description;
            }
        }

        modal.classList.add('active');
    }

    // 确认释放技能
    confirmActivateSkill() {
        this.closeModal(); // 关闭弹窗

        if (this.player.activateSkill(this.battle)) {
            this.updateActiveSkillUI();
            this.battle.updateBattleUI();
            // 增强反馈
            const btn = document.getElementById('active-skill-btn');
            if (btn) {
                Utils.addShakeEffect(btn);
                btn.classList.remove('ready');

                // Add particle effect logic if present, omitted for brevity/safety
                if (typeof particles !== 'undefined') {
                    // particles.createBurst(btn);
                }
            }

            // Visual Flash
            const flash = document.createElement('div');
            flash.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(255,255,255,0.3);pointer-events:none;z-index:9999;transition:opacity 0.5s;';
            document.body.appendChild(flash);
            setTimeout(() => {
                flash.style.opacity = '0';
                setTimeout(() => flash.remove(), 500);
            }, 50);

            if (typeof audioManager !== 'undefined') audioManager.playSFX('buff');
        }
    }

    // 显示奖励弹窗
    showRewardModal(title, message, icon = '🎁', onClose = null) {
        let modal = document.getElementById('reward-modal');

        // 动态创建模态框
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'reward-modal';
            modal.className = 'modal';
            modal.style.zIndex = '10001'; // 比通用高一点
            modal.innerHTML = `
                <div class="modal-content" style="text-align: center; max-width: 360px; padding: 40px; border: 2px solid var(--accent-gold); box-shadow: 0 0 50px rgba(255, 215, 0, 0.2);">
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
                modal.classList.remove('active');
                if (modal.onCloseCallback) modal.onCloseCallback();
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

    // 显示通用确认弹窗
    showConfirmModal(message, onConfirm, onCancel = null) {
        let modal = document.getElementById('generic-confirm-modal');

        // 动态创建模态框
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'generic-confirm-modal';
            modal.className = 'modal';
            modal.style.zIndex = '10000'; // 确保在最上层
            modal.innerHTML = `
                <div class="modal-content" style="text-align: center; max-width: 400px; padding: 30px;">
                    <h3 id="generic-confirm-title" style="color: var(--accent-gold); margin-bottom: 20px;">提示</h3>
                    <p id="generic-confirm-message" style="color: #ccc; margin-bottom: 30px; line-height: 1.6; font-size: 1.1rem; white-space: pre-line;"></p>
                    <div style="display: flex; justify-content: center; gap: 20px;">
                        <button id="generic-confirm-btn" class="menu-btn primary small">确定</button>
                        <button id="generic-cancel-btn" class="menu-btn small">取消</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // 绑定通用关闭
            const closeBtn = document.createElement('button');
            closeBtn.className = 'modal-close';
            closeBtn.innerHTML = '×';
            closeBtn.onclick = () => modal.classList.remove('active');
            modal.querySelector('.modal-content').appendChild(closeBtn);
        }

        // 更新内容
        const msgEl = document.getElementById('generic-confirm-message');
        const confirmBtn = document.getElementById('generic-confirm-btn');
        const cancelBtn = document.getElementById('generic-cancel-btn');

        if (msgEl) msgEl.textContent = message;

        // 绑定事件 (使用 onclick 覆盖之前的绑定，防止多次触发)
        if (confirmBtn) {
            confirmBtn.onclick = () => {
                modal.classList.remove('active');
                if (typeof onConfirm === 'function') onConfirm();
            };
        }

        if (cancelBtn) {
            cancelBtn.onclick = () => {
                modal.classList.remove('active');
                if (typeof onCancel === 'function') onCancel();
            };
        }

        // 显示
        modal.classList.add('active');
    }

    // 显示通用提示弹窗 (Alert)
    showAlertModal(message, title = '提示', onOk = null) {
        let modal = document.getElementById('generic-alert-modal');

        // 动态创建模态框
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'generic-alert-modal';
            modal.className = 'modal';
            modal.style.zIndex = '10001'; // 比Confirm更高
            modal.innerHTML = `
                <div class="modal-content" style="text-align: center; max-width: 400px; padding: 30px;">
                    <h3 id="generic-alert-title" style="color: var(--accent-gold); margin-bottom: 20px;">提示</h3>
                    <p id="generic-alert-message" style="color: #ccc; margin-bottom: 30px; line-height: 1.6; font-size: 1.1rem; white-space: pre-line;"></p>
                    <div style="display: flex; justify-content: center;">
                        <button id="generic-alert-btn" class="menu-btn primary small" style="min-width: 100px;">确定</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // 绑定通用关闭
            const closeBtn = document.createElement('button');
            closeBtn.className = 'modal-close';
            closeBtn.innerHTML = '×';
            closeBtn.onclick = () => modal.classList.remove('active');
            modal.querySelector('.modal-content').appendChild(closeBtn);
        }

        // 更新内容
        const msgEl = document.getElementById('generic-alert-message');
        const titleEl = document.getElementById('generic-alert-title');
        if (msgEl) msgEl.innerHTML = message.replace(/\n/g, '<br>');
        if (titleEl) titleEl.textContent = title;

        // 按钮事件
        const okBtn = document.getElementById('generic-alert-btn');
        if (okBtn) {
            okBtn.onclick = () => {
                if (onOk) onOk();
                modal.classList.remove('active');
            };
        }

        modal.classList.add('active');
    }

    // 获取卡牌基础价格
    getCardPrice(card) {
        const rarityPrices = {
            basic: 0,
            common: 60,
            uncommon: 100,
            rare: 180,
            epic: 300,
            legendary: 500
        };
        return rarityPrices[card.rarity] || 60;
    }

    getCardRarityLabel(rarity = 'common') {
        const normalized = String(rarity || 'common').toLowerCase();
        const map = {
            basic: '基础',
            common: '普通',
            uncommon: '优秀',
            rare: '稀有',
            epic: '史诗',
            legendary: '传说'
        };
        return map[normalized] || map.common;
    }

    normalizeShopRumors(rumors = null) {
        const source = rumors && typeof rumors === 'object' ? rumors : {};
        const history = Array.isArray(source.history)
            ? source.history.filter((entry) => typeof entry === 'string').slice(-6)
            : [];
        const shift = source.nextRealmMapShift && typeof source.nextRealmMapShift === 'object'
            ? { ...source.nextRealmMapShift }
            : null;
        return {
            rewardRareCharges: Math.max(0, Math.floor(Number(source.rewardRareCharges) || 0)),
            rewardRareBonus: Math.max(0, Number(source.rewardRareBonus) || 0),
            treasureCharges: Math.max(0, Math.floor(Number(source.treasureCharges) || 0)),
            treasureChanceBonus: Math.max(0, Number(source.treasureChanceBonus) || 0),
            nextRealmMapShift: shift,
            nextRealmLabel: typeof source.nextRealmLabel === 'string' ? source.nextRealmLabel : '',
            nextRealmTarget: Number.isFinite(Number(source.nextRealmTarget)) ? Math.max(1, Math.floor(Number(source.nextRealmTarget))) : null,
            history
        };
    }

    ensureShopRumors() {
        if (!this.player) {
            return this.normalizeShopRumors();
        }
        this.player.shopRumors = this.normalizeShopRumors(this.player.shopRumors);
        return this.player.shopRumors;
    }

    pushShopRumorHistory(entry) {
        if (typeof entry !== 'string' || !entry.trim()) return;
        const rumors = this.ensureShopRumors();
        rumors.history.push(entry.trim());
        rumors.history = rumors.history.slice(-6);
    }

    getStrategicCurrencyAmount(currency = 'gold') {
        if (!this.player) return 0;
        switch (currency) {
            case 'insight':
                return Math.max(0, Math.floor(Number(this.player.heavenlyInsight) || 0));
            case 'karma':
                return Math.max(0, Math.floor(Number(this.player.karma) || 0));
            case 'gold':
            default:
                return Math.max(0, Math.floor(Number(this.player.gold) || 0));
        }
    }

    getStrategicCurrencyLabel(currency = 'gold') {
        switch (currency) {
            case 'insight': return '天机';
            case 'karma': return '业果';
            case 'gold':
            default: return '灵石';
        }
    }

    getStrategicCurrencyIcon(currency = 'gold') {
        switch (currency) {
            case 'insight': return '🔮';
            case 'karma': return '🜂';
            case 'gold':
            default: return '💰';
        }
    }

    formatShopPrice(item = null) {
        if (!item) return '';
        const currency = item.currency || 'gold';
        const icon = this.getStrategicCurrencyIcon(currency);
        const label = this.getStrategicCurrencyLabel(currency);
        return `${icon} ${Math.max(0, Math.floor(Number(item.price) || 0))} ${label}`;
    }

    canAffordShopItem(item = null) {
        if (!item) return false;
        const price = Math.max(0, Math.floor(Number(item.price) || 0));
        return this.getStrategicCurrencyAmount(item.currency || 'gold') >= price;
    }

    spendShopPrice(item = null) {
        if (!item) return false;
        const price = Math.max(0, Math.floor(Number(item.price) || 0));
        const currency = item.currency || 'gold';
        if (this.getStrategicCurrencyAmount(currency) < price) return false;
        if (currency === 'insight') {
            this.player.heavenlyInsight -= price;
        } else if (currency === 'karma') {
            this.player.karma -= price;
        } else {
            this.player.gold -= price;
        }
        return true;
    }

    updateShopCurrencyDisplays() {
        const goldEl = document.getElementById('shop-gold-display');
        if (goldEl) goldEl.textContent = this.getStrategicCurrencyAmount('gold');
        const insightEl = document.getElementById('shop-insight-display');
        if (insightEl) insightEl.textContent = this.getStrategicCurrencyAmount('insight');
        const karmaEl = document.getElementById('shop-karma-display');
        if (karmaEl) karmaEl.textContent = this.getStrategicCurrencyAmount('karma');
        const subtitleEl = document.getElementById('shop-header-subtitle');
        if (subtitleEl) {
            const activeRumorText = this.getShopRumorSummaryText();
            subtitleEl.textContent = activeRumorText || '商贩会根据你的命途，拿出不同层级的交易。';
        }
    }

    getShopPriceMultiplier(scalePerRealm = 0.15) {
        const realm = this.player?.realm || 1;
        const endlessMods = this.isEndlessActive() ? this.getEndlessModifiers() : null;
        let priceMult = 1 + Math.max(0, realm - 1) * scalePerRealm;
        if (endlessMods) {
            priceMult *= Math.max(0.75, Number(endlessMods.shopPriceMul) || 1);
        }
        return priceMult;
    }

    generateContractShopServices() {
        const priceMult = this.getShopPriceMultiplier(0.04);
        return [
            {
                id: 'forbiddenDraft',
                type: 'service',
                name: '逆命血契',
                icon: '🩸',
                desc: '失去 6 点生命上限，从 3 张稀有/史诗禁术卡中选择 1 张。',
                price: Math.max(1, Math.floor(1 * priceMult)),
                currency: 'karma',
                sold: false,
                riskLabel: '伤根基',
                tagLabel: '爆发成型'
            },
            {
                id: 'soulMortgage',
                type: 'service',
                name: '蚀寿抵押',
                icon: '⛓️',
                desc: '当前生命降至至多 70%，换取 3 场首回合灵力 +1、命环经验提升与灵石补给。',
                price: Math.max(1, Math.floor(1 * priceMult)),
                currency: 'karma',
                sold: false,
                riskLabel: '搏命加速',
                tagLabel: '滚雪球'
            },
            {
                id: 'doomIdol',
                type: 'service',
                name: '灾像供契',
                icon: '🗿',
                desc: '向牌组加入【心魔·疑心】，立即获得一件随机法宝与 80 灵石。',
                price: Math.max(1, Math.floor(2 * priceMult)),
                currency: 'karma',
                sold: false,
                riskLabel: '牌组污染',
                tagLabel: '法宝跃迁'
            }
        ];
    }

    generateRumorShopServices() {
        const priceMult = this.getShopPriceMultiplier(0.02);
        return [
            {
                id: 'rumorRareDraft',
                type: 'service',
                name: '稀曜签',
                icon: '📎',
                desc: '接下来 2 次战后卡牌奖励显著偏向稀有/史诗。',
                price: Math.max(1, Math.floor(1 * priceMult)),
                currency: 'insight',
                sold: false,
                tagLabel: '未来奖励'
            },
            {
                id: 'rumorTreasureTrail',
                type: 'service',
                name: '宝踪风声',
                icon: '🏺',
                desc: '接下来 2 次精英/Boss 结算提升法宝掉落概率。',
                price: Math.max(1, Math.floor(2 * priceMult)),
                currency: 'insight',
                sold: false,
                tagLabel: '战利强化'
            },
            {
                id: 'rumorUtilityRoute',
                type: 'service',
                name: '商路星引',
                icon: '🗺️',
                desc: '下一重天地图更偏向事件、商店与营地，适合稳定修整。',
                price: Math.max(1, Math.floor(2 * priceMult)),
                currency: 'insight',
                sold: false,
                tagLabel: '路线倾向'
            },
            {
                id: 'rumorTrialRoute',
                type: 'service',
                name: '锋路谶语',
                icon: '⚔️',
                desc: '下一重天地图更偏向试炼、精英与锻炉，适合冒险爆发。',
                price: Math.max(1, Math.floor(2 * priceMult)),
                currency: 'insight',
                sold: false,
                tagLabel: '高压路线'
            }
        ];
    }

    generateShopCatalog() {
        const base = this.generateShopData();
        const rumors = this.ensureShopRumors();
        return {
            base: {
                id: 'base',
                icon: '🪙',
                label: '基础页',
                summary: '常规补给，使用灵石进行构筑修整。',
                cardTitle: '📜 卡牌出售',
                serviceTitle: '✨ 特殊服务',
                items: Array.isArray(base.items) ? base.items : [],
                services: Array.isArray(base.services) ? base.services : []
            },
            contract: {
                id: 'contract',
                icon: '🩸',
                label: '契约页',
                summary: `以业果换取高波动收益。当前业果：${this.getStrategicCurrencyAmount('karma')}。`,
                cardTitle: '🕯️ 禁术契据',
                serviceTitle: '🩸 高风险交易',
                items: [],
                services: this.generateContractShopServices()
            },
            rumor: {
                id: 'rumor',
                icon: '🔮',
                label: '传闻页',
                summary: rumors.nextRealmLabel
                    ? `已锁定下一重天路线：${rumors.nextRealmLabel}`
                    : '花费天机锁定未来奖励与下一重天路线倾向。',
                cardTitle: '🔍 情报锁定',
                serviceTitle: '📡 未来倾向',
                items: [],
                services: this.generateRumorShopServices()
            }
        };
    }

    syncActiveShopTab() {
        const catalog = this.shopCatalog && typeof this.shopCatalog === 'object' ? this.shopCatalog : this.generateShopCatalog();
        this.shopCatalog = catalog;
        const tabId = catalog[this.shopActiveTab] ? this.shopActiveTab : 'base';
        this.shopActiveTab = tabId;
        const tab = catalog[tabId];
        this.shopItems = Array.isArray(tab.items) ? tab.items : [];
        this.shopServices = Array.isArray(tab.services) ? tab.services : [];
        return tab;
    }

    switchShopTab(tabId = 'base') {
        if (!this.shopCatalog || !this.shopCatalog[tabId]) return;
        this.shopActiveTab = tabId;
        this.syncActiveShopTab();
        this.renderShop();
    }

    getShopRumorSummaryText() {
        const rumors = this.ensureShopRumors();
        const parts = [];
        if (rumors.rewardRareCharges > 0) {
            parts.push(`稀曜签剩余 ${rumors.rewardRareCharges} 次`);
        }
        if (rumors.treasureCharges > 0) {
            parts.push(`宝踪风声剩余 ${rumors.treasureCharges} 次`);
        }
        if (rumors.nextRealmLabel && rumors.nextRealmTarget) {
            parts.push(`第 ${rumors.nextRealmTarget} 重：${rumors.nextRealmLabel}`);
        }
        return parts.join(' ｜ ');
    }

    grantStrategicCurrencies(gains = {}, reason = '') {
        if (!this.player) return { insight: 0, karma: 0 };
        const insight = Math.max(0, Math.floor(Number(gains.insight) || 0));
        const karma = Math.max(0, Math.floor(Number(gains.karma) || 0));
        if (insight > 0) {
            this.player.heavenlyInsight = this.getStrategicCurrencyAmount('insight') + insight;
        }
        if (karma > 0) {
            this.player.karma = this.getStrategicCurrencyAmount('karma') + karma;
        }
        if ((insight > 0 || karma > 0) && reason) {
            const detail = [];
            if (insight > 0) detail.push(`天机 +${insight}`);
            if (karma > 0) detail.push(`业果 +${karma}`);
            Utils.showBattleLog(`${reason}：${detail.join('，')}`);
        }
        return { insight, karma };
    }

    getBattleStrategicCurrencyRewards(nodeType = '') {
        const normalized = String(nodeType || '').toLowerCase();
        const result = { insight: 0, karma: 0 };
        if (normalized === 'elite') {
            result.insight += 1;
            result.karma += 1;
        } else if (normalized === 'boss') {
            result.insight += 2;
            result.karma += 1;
        } else if (normalized === 'trial') {
            result.insight += 1;
        } else if (normalized === 'ghost_duel') {
            result.insight += 1;
            result.karma += 1;
        }
        if (this.player && this.player.maxHp > 0 && this.player.currentHp <= this.player.maxHp * 0.4 && ['elite', 'boss', 'ghost_duel'].includes(normalized)) {
            result.karma += 1;
        }
        return result;
    }

    consumeRewardRumorBoost() {
        const rumors = this.ensureShopRumors();
        if (rumors.rewardRareCharges <= 0 || rumors.rewardRareBonus <= 0) return 0;
        rumors.rewardRareCharges = Math.max(0, rumors.rewardRareCharges - 1);
        if (rumors.rewardRareCharges === 0) rumors.rewardRareBonus = 0;
        return Number(rumors.rewardRareBonus) || 0;
    }

    consumeTreasureRumorBoost(nodeType = '') {
        const normalized = String(nodeType || '').toLowerCase();
        const rumors = this.ensureShopRumors();
        if (!['elite', 'boss', 'ghost_duel'].includes(normalized)) return 0;
        if (rumors.treasureCharges <= 0 || rumors.treasureChanceBonus <= 0) return 0;
        rumors.treasureCharges = Math.max(0, rumors.treasureCharges - 1);
        if (rumors.treasureCharges === 0) rumors.treasureChanceBonus = 0;
        return Number(rumors.treasureChanceBonus) || 0;
    }

    setNextRealmMapRumor(shift, label = '') {
        const rumors = this.ensureShopRumors();
        rumors.nextRealmMapShift = shift && typeof shift === 'object' ? { ...shift } : null;
        rumors.nextRealmLabel = typeof label === 'string' ? label : '';
        rumors.nextRealmTarget = this.player ? Math.max(1, (this.player.realm || 1) + 1) : null;
        if (rumors.nextRealmLabel) {
            this.pushShopRumorHistory(`已锁定第 ${rumors.nextRealmTarget} 重：${rumors.nextRealmLabel}`);
        }
    }

    getPendingRouteRumorProfile(realm = null) {
        const rumors = this.ensureShopRumors();
        const target = realm == null ? rumors.nextRealmTarget : Math.max(1, Math.floor(Number(realm) || 1));
        if (!rumors.nextRealmMapShift || !rumors.nextRealmTarget || target !== rumors.nextRealmTarget) return null;
        return {
            shift: { ...rumors.nextRealmMapShift },
            label: rumors.nextRealmLabel || '未知倾向',
            target: rumors.nextRealmTarget
        };
    }

    consumePendingRouteRumorProfile(realm = null) {
        const rumors = this.ensureShopRumors();
        const target = realm == null ? rumors.nextRealmTarget : Math.max(1, Math.floor(Number(realm) || 1));
        if (!rumors.nextRealmTarget || target !== rumors.nextRealmTarget) return;
        rumors.nextRealmMapShift = null;
        rumors.nextRealmLabel = '';
        rumors.nextRealmTarget = null;
    }

    // 渲染商店
    renderShop() {
        const activeTab = this.syncActiveShopTab();
        this.updateShopCurrencyDisplays();

        const tabBar = document.getElementById('shop-tab-bar');
        if (tabBar) {
            tabBar.innerHTML = '';
            Object.values(this.shopCatalog || {}).forEach((tab) => {
                const btn = document.createElement('button');
                btn.className = `shop-tab-btn ${tab.id === this.shopActiveTab ? 'active' : ''}`;
                btn.type = 'button';
                btn.innerHTML = `<span class="tab-icon">${tab.icon}</span><span>${tab.label}</span>`;
                btn.onclick = () => this.switchShopTab(tab.id);
                tabBar.appendChild(btn);
            });
        }

        const summaryEl = document.getElementById('shop-tab-summary');
        if (summaryEl) {
            const rumors = this.ensureShopRumors();
            const advice = this.buildShopSpendRecommendation();
            let summaryText = activeTab?.summary || '暂无摘要。';
            if (this.shopActiveTab === 'contract') {
                summaryText = `以业果换取高波动收益。当前业果：${this.getStrategicCurrencyAmount('karma')}。`;
            } else if (this.shopActiveTab === 'rumor') {
                summaryText = rumors.nextRealmLabel
                    ? `已锁定第 ${rumors.nextRealmTarget || '?'} 重路线：${rumors.nextRealmLabel}`
                    : '花费天机锁定未来奖励与下一重天路线倾向。';
            }
            const history = Array.isArray(rumors.history) && rumors.history.length > 0
                ? `<div class="shop-summary-history">最近锁定：${rumors.history.slice(-2).join(' ｜ ')}</div>`
                : '';
            summaryEl.innerHTML = `
                <div class="shop-summary-title">${activeTab?.icon || '🏪'} ${activeTab?.label || '基础页'}</div>
                <div class="shop-summary-text">${summaryText}</div>
                <div class="shop-spend-advice tone-${advice.tone || 'save'}">
                    <span class="shop-advice-badge">${advice.action}</span>
                    <div class="shop-advice-text">${advice.reason}</div>
                    ${advice.forecast?.summary ? `<div class="shop-advice-forecast ${advice.forecast.danger || 'low'}">${advice.forecast.summary}</div>` : ''}
                    <div class="shop-advice-meta">
                        <span>最佳卡牌：${advice.bestCard?.item?.card?.name || '暂无'}</span>
                        <span>最佳服务：${advice.bestService?.item?.name || '暂无'}</span>
                    </div>
                </div>
                ${history}
            `;
        }

        const cardSection = document.getElementById('shop-card-section');
        const cardTitle = document.getElementById('shop-card-section-title');
        const cardContainer = document.getElementById('shop-cards');
        if (cardTitle) cardTitle.textContent = activeTab?.cardTitle || '📜 卡牌出售';
        if (cardSection) cardSection.style.display = this.shopActiveTab === 'base' ? 'block' : 'none';
        if (cardContainer) {
            cardContainer.innerHTML = '';
            this.shopItems.forEach((item, index) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'shop-card-wrapper';

                const cardEl = Utils.createCardElement(item.card, index);
                cardEl.classList.add(`rarity-${item.card.rarity || 'common'}`);
                if (item.sold) cardEl.classList.add('sold');
                cardEl.style.cursor = 'zoom-in';
                cardEl.addEventListener('click', () => {
                    const fit = this.evaluateShopCardDeckFit(item.card);
                    Utils.showCardDetail(item.card, {
                        sectionLabel: '商店详情',
                        sourceLabel: activeTab?.label || '基础页',
                        priceText: item.sold ? '已售出' : this.formatShopPrice(item),
                        availabilityText: item.sold ? '已售出' : (this.canAffordShopItem(item) ? '可购买' : '资源不足'),
                        usageHint: fit.reason,
                        extraSummaryRows: fit.summaryRows,
                        closeLabel: '返回商店'
                    });
                });

                const priceBtn = document.createElement('div');
                priceBtn.className = `card-price ${(this.canAffordShopItem(item) && !item.sold) ? '' : 'cannot-afford'}`.trim();
                priceBtn.innerHTML = item.sold ? '已售出' : this.formatShopPrice(item);

                if (!item.sold) {
                    priceBtn.addEventListener('click', () => this.buyItem('card', index));
                    priceBtn.style.cursor = 'pointer';
                }

                wrapper.appendChild(cardEl);
                wrapper.appendChild(priceBtn);
                cardContainer.appendChild(wrapper);
            });
        }

        const serviceTitle = document.getElementById('shop-service-section-title');
        if (serviceTitle) serviceTitle.textContent = activeTab?.serviceTitle || '✨ 特殊服务';
        const serviceContainer = document.getElementById('shop-services-container');
        if (!serviceContainer) return;
        serviceContainer.innerHTML = '';

        if (!Array.isArray(this.shopServices) || this.shopServices.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'shop-empty-state';
            emptyState.textContent = '此页暂无可交易项目。';
            serviceContainer.appendChild(emptyState);
            return;
        }

        this.shopServices.forEach((service, index) => {
            const el = document.createElement('div');
            const currency = service.currency || 'gold';
            const isAffordable = this.canAffordShopItem(service);
            const fit = this.evaluateShopServiceFit(service);
            el.className = `shop-service currency-${currency}${service.riskLabel ? ' is-risky' : ''}`;
            el.id = `service-${service.id}`;
            if (service.sold) el.style.opacity = '0.5';

            const tags = [
                service.tagLabel ? { value: service.tagLabel, className: '' } : null,
                service.riskLabel ? { value: service.riskLabel, className: '' } : null,
                fit?.label ? { value: fit.label, className: `fit-${fit.label === '高适配' ? 'high' : fit.label === '中适配' ? 'mid' : 'low'}` } : null
            ]
                .filter(Boolean)
                .map((entry) => `<span class="shop-service-tag ${entry.className}">${entry.value}</span>`)
                .join('');

            el.innerHTML = `
                <div class="service-icon">${service.icon}</div>
                <div class="service-info">
                    <div class="service-name-row">
                        <div class="service-name">${service.name}</div>
                        <div class="service-tags">${tags}</div>
                    </div>
                    <div class="service-desc">${service.desc}</div>
                    <div class="service-fit-note">${fit.reason}</div>
                </div>
                <button class="buy-btn ${(isAffordable && !service.sold) ? '' : 'disabled'}">
                    <span class="price">${service.sold ? '已售出' : this.formatShopPrice(service)}</span>
                </button>
            `;

            if (!service.sold) {
                const btn = el.querySelector('.buy-btn');
                btn.addEventListener('click', () => this.buyItem('service', index));
            }

            serviceContainer.appendChild(el);
        });
    }

    // 统一购买逻辑
    buyItem(type, index) {
        const item = type === 'card' ? this.shopItems[index] : this.shopServices[index];
        if (!item || item.sold) return;
        if (!this.canAffordShopItem(item)) {
            Utils.showBattleLog(`${this.getStrategicCurrencyLabel(item.currency || 'gold')}不足！`);
            return;
        }

        if (type === 'card') {
            this.player.addCardToDeck(item.card);
            Utils.showBattleLog(`购买了 ${item.card.name}`);
            if (!this.spendShopPrice(item)) return;
            item.sold = true;
        } else {
            const result = this.applyServiceEffect(item);
            if (!result) return;
            if (result === 'deferred') return;
            if (!this.spendShopPrice(item)) {
                Utils.showBattleLog(`${this.getStrategicCurrencyLabel(item.currency || 'gold')}结算失败。`);
                return;
            }
            if (result !== 'repeatable') {
                item.sold = true;
            }
        }

        this.updateShopCurrencyDisplays();
        this.renderShop();
        this.saveGame();
    }

    // 显示命环进化选择
    showEvolutionSelection(targetTier) {
        const modal = document.getElementById('event-modal');
        const titleEl = document.getElementById('event-title');
        const iconEl = document.getElementById('event-icon');
        const descEl = document.getElementById('event-desc');
        const choicesEl = document.getElementById('event-choices');

        titleEl.textContent = '命环进化';
        iconEl.textContent = '🧬';
        descEl.textContent = '你的命环因力量满盈而震颤，显化出数条进化的可能...';
        choicesEl.innerHTML = '';

        // 筛选可用路径
        const availablePaths = Object.values(FATE_RING.paths).filter(path =>
            path.tier === targetTier &&
            (!path.requires || path.requires.includes(this.player.fateRing.path))
        );

        // 如果是 Tier 3 (逆天之环)，特殊处理 requiresAny
        if (targetTier === 3) {
            const ultimatePath = FATE_RING.paths['defiance'];
            if (ultimatePath) availablePaths.push(ultimatePath);
        }

        availablePaths.forEach(path => {
            const btn = document.createElement('button');
            btn.className = 'event-choice';
            btn.innerHTML = `
    <div class="choice-icon">${path.icon || '✨'}</div>
        <div class="choice-content">
            <div class="choice-text">进化：${path.name}</div>
            <div class="choice-result">${path.description}</div>
        </div>
`;

            btn.onclick = () => {
                this.player.evolveFateRing(path.id);
                Utils.showBattleLog(`命环进化为：${path.name} `);
                modal.classList.remove('active');

                // 刷新UI
                if (document.getElementById('ring-modal').classList.contains('active')) {
                    this.showFateRing();
                }
            };

            choicesEl.appendChild(btn);
        });

        modal.classList.add('active');
    }

    // 应用服务效果
    applyServiceEffect(service) {
        // 法宝购买逻辑
        if (service.type === 'treasure') {
            if (this.player.addTreasure(service.id)) {
                Utils.showBattleLog(`获得法宝：${service.name} `);
                return true;
            }
            return false;
        }

        switch (service.id) {
            case 'heal':
                if (this.player.currentHp >= this.player.maxHp) {
                    Utils.showBattleLog('生命值已满！');
                    this.showRewardModal('状态完美', '你的生命值已满，无需治疗。\n保持最佳状态去战斗吧！', '💪');
                    return false;
                }
                const healAmount = Math.max(1, Math.floor(this.player.maxHp * 0.3 * this.getEndlessHealingMultiplier()));
                this.player.heal(healAmount);
                Utils.showBattleLog(`恢复了 ${healAmount} 点生命`);

                // 增强反馈
                this.showRewardModal('治疗成功', `生命值恢复了 ${healAmount} 点！\n当前状态极佳。`, '💖');
                return true;

            case 'remove':
                this.showRemoveCard(service);
                return 'deferred';

            case 'exp':
                this.player.fateRing.exp += 50;
                this.player.checkFateRingLevelUp();
                Utils.showBattleLog('命环经验 +50');
                this.showRewardModal('命环充能', `命环经验 + 50！\n距离下一级更近了。`, '⬆️');
                return true;

            case 'tacticalPlan':
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('firstTurnDrawBoostBattles', 2);
                }
                Utils.showBattleLog('获得行旅增益：接下来 2 场战斗首回合额外抽牌');
                this.showRewardModal('战术推演完成', '接下来 2 场战斗：\n首回合额外抽 1 张牌。', '📘');
                return true;

            case 'wardSigil':
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('openingBlockBoostBattles', 2);
                }
                Utils.showBattleLog('获得行旅增益：接下来 2 场战斗开场护盾 +10');
                this.showRewardModal('护阵符生效', '接下来 2 场战斗：\n开场获得 10 护盾。', '🧿');
                return true;

            case 'bountyContract':
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('victoryGoldBoostBattles', 2);
                }
                Utils.showBattleLog('获得行旅增益：接下来 2 场战斗胜利额外灵石');
                this.showRewardModal('悬赏契约签订', '接下来 2 场战斗：\n胜利额外获得灵石。', '📜');
                return true;

            case 'scoutPack':
                this.showShopCardDraft(service);
                return 'deferred';

            case 'campRation': {
                const healAmount = Math.max(8, Math.floor(this.player.maxHp * 0.18 * this.getEndlessHealingMultiplier()));
                this.player.heal(healAmount);
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('openingBlockBoostBattles', 1);
                }
                Utils.showBattleLog(`行军口粮：恢复 ${healAmount} 生命，并获得 1 层开场护盾增益`);
                this.showRewardModal('补给完成', `恢复 ${healAmount} 生命。\n接下来 1 场战斗开场获得护盾。`, '🥣');
                return true;
            }

            case 'fateLedger':
                this.player.fateRing.exp += 45;
                this.player.checkFateRingLevelUp();
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('victoryGoldBoostBattles', 1);
                }
                Utils.showBattleLog('命轨账簿：命环经验 +45，并获得 1 层悬赏增益');
                this.showRewardModal('账簿校准', '命环经验 +45。\n接下来 1 场战斗胜利额外获得灵石。', '📚');
                return true;

            case 'pulseCatalyst':
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('firstTurnEnergyBoostBattles', 2);
                }
                Utils.showBattleLog('灵息催化剂：接下来 2 场战斗首回合灵力 +1');
                this.showRewardModal('灵息回路稳定', '接下来 2 场战斗：\n首回合灵力 +1。', '⚡');
                return true;

            case 'insightIncense':
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('ringExpBoostBattles', 2);
                }
                Utils.showBattleLog('悟境香：接下来 2 场战斗命环经验额外提升');
                this.showRewardModal('悟境加持', '接下来 2 场战斗：\n命环经验额外 +30%。', '🕯️');
                return true;

            case 'fieldMedic':
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('victoryHealBoostBattles', 2);
                }
                Utils.showBattleLog('战地医师签约完成：接下来 2 场战斗胜利后恢复生命');
                this.showRewardModal('医护协议生效', '接下来 2 场战斗：\n胜利后恢复生命。', '🩹');
                return true;

            case 'forbiddenDraft':
                if (this.player.maxHp <= 18) {
                    Utils.showBattleLog('根基过于虚弱，无法继续签订血契。');
                    return false;
                }
                this.showShopForbiddenDraft(service);
                return 'deferred';

            case 'soulMortgage': {
                const beforeHp = this.player.currentHp;
                const hpCap = Math.max(1, Math.floor(this.player.maxHp * 0.7));
                this.player.currentHp = Math.max(1, Math.min(this.player.currentHp, hpCap));
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('firstTurnEnergyBoostBattles', 3);
                    this.player.grantAdventureBuff('ringExpBoostBattles', 3);
                    this.player.grantAdventureBuff('victoryGoldBoostBattles', 2);
                }
                const payout = 90 + Math.max(0, this.player.realm || 1) * 12;
                this.player.gold += payout;
                Utils.showBattleLog(`蚀寿抵押：生命 ${beforeHp}→${this.player.currentHp}，灵石 +${payout}`);
                this.showRewardModal(
                    '蚀寿抵押完成',
                    `当前生命压至 ${this.player.currentHp}。
接下来 3 场战斗：首回合灵力 +1、命环经验提升。
额外获得 ${payout} 灵石。`,
                    '⛓️'
                );
                return true;
            }

            case 'doomIdol': {
                const curseCard = typeof cloneCardTemplate === 'function'
                    ? cloneCardTemplate('demonDoubt')
                    : (typeof CARDS !== 'undefined' && CARDS.demonDoubt ? JSON.parse(JSON.stringify(CARDS.demonDoubt)) : null);
                if (curseCard) {
                    this.player.addCardToDeck(curseCard);
                }
                const treasure = this.getWeightedRandomTreasure ? this.getWeightedRandomTreasure() : null;
                if (treasure && treasure.id) {
                    this.player.addTreasure(treasure.id);
                }
                this.player.gold += 80;
                Utils.showBattleLog(`灾像供契：牌组混入【心魔·疑心】${treasure ? `，并获得法宝【${treasure.name}】` : ''}`);
                this.showRewardModal(
                    '灾像供契完成',
                    `牌组加入【心魔·疑心】。
${treasure ? `获得法宝：${treasure.name}
` : ''}额外获得 80 灵石。`,
                    '🗿'
                );
                return true;
            }

            case 'rumorRareDraft': {
                const rumors = this.ensureShopRumors();
                rumors.rewardRareCharges += 2;
                rumors.rewardRareBonus = Math.max(Number(rumors.rewardRareBonus) || 0, 0.3);
                this.pushShopRumorHistory('稀曜签：未来两次卡牌奖励稀有化');
                Utils.showBattleLog('传闻锁定：接下来 2 次战后奖励更偏向稀有/史诗');
                this.showRewardModal('稀曜签锁定', '未来 2 次战后卡牌奖励将显著偏向稀有/史诗。', '📎');
                return true;
            }

            case 'rumorTreasureTrail': {
                const rumors = this.ensureShopRumors();
                rumors.treasureCharges += 2;
                rumors.treasureChanceBonus = Math.max(Number(rumors.treasureChanceBonus) || 0, 0.22);
                this.pushShopRumorHistory('宝踪风声：精英/Boss 战利强化');
                Utils.showBattleLog('传闻锁定：接下来 2 次精英/Boss 战更易掉落法宝');
                this.showRewardModal('宝踪风声锁定', '接下来 2 次精英/Boss 结算将提升法宝掉落率。', '🏺');
                return true;
            }

            case 'rumorUtilityRoute':
                this.setNextRealmMapRumor({ event: 0.05, shop: 0.04, rest: 0.02, enemy: -0.06, elite: -0.03 }, '机缘补给线');
                Utils.showBattleLog(`传闻锁定：第 ${this.player.realm + 1} 重更偏向事件、商店与营地。`);
                this.showRewardModal('商路星引生效', `第 ${this.player.realm + 1} 重地图将更偏向事件、商店与营地。`, '🗺️');
                return true;

            case 'rumorTrialRoute':
                this.setNextRealmMapRumor({ trial: 0.06, elite: 0.03, forge: 0.025, enemy: -0.05, rest: -0.02, shop: -0.015 }, '试炼锋路');
                Utils.showBattleLog(`传闻锁定：第 ${this.player.realm + 1} 重更偏向试炼、精英与锻炉。`);
                this.showRewardModal('锋路谶语生效', `第 ${this.player.realm + 1} 重地图将更偏向试炼、精英与锻炉。`, '⚔️');
                return true;

            case 'endlessStabilizer': {
                if (!this.isEndlessActive()) {
                    Utils.showBattleLog('当前并非无尽轮回，无法执行轮回稳压。');
                    return false;
                }
                const state = this.ensureEndlessState();
                const before = Math.max(0, Math.min(9, Math.floor(Number(state.pressure) || 0)));
                state.pressure = Math.max(0, before - 2);
                const healAmount = Math.max(8, Math.floor(this.player.maxHp * 0.14));
                this.player.heal(healAmount);
                if (typeof this.player.grantAdventureBuff === 'function') {
                    this.player.grantAdventureBuff('openingBlockBoostBattles', 1);
                }
                Utils.showBattleLog(`轮回稳压完成：压力 ${before}→${state.pressure}，恢复 ${healAmount} 生命`);
                this.showRewardModal(
                    '轮回稳压完成',
                    `轮回压力：${before} → ${state.pressure}\n恢复 ${healAmount} 生命，并获得 1 层开场护盾增益。`,
                    '🧯'
                );
                return true;
            }

            case 'endlessOverclock': {
                if (!this.isEndlessActive()) {
                    Utils.showBattleLog('当前并非无尽轮回，无法执行轮回过载。');
                    return false;
                }
                const state = this.ensureEndlessState();
                const beforePressure = Math.max(0, Math.min(9, Math.floor(Number(state.pressure) || 0)));
                state.pressure = Math.max(0, Math.min(9, beforePressure + 2));

                const rarePool = this.getEndlessBoonPool().filter((boon) => boon && boon.rarity === 'rare');
                let applied = null;
                if (rarePool.length > 0) {
                    const pick = rarePool[Math.floor(Math.random() * rarePool.length)];
                    applied = pick ? this.applyEndlessBoon(pick.id) : null;
                }
                if (!applied) {
                    const fallback = this.getEndlessBoonChoices();
                    const pick = Array.isArray(fallback) ? fallback[0] : null;
                    applied = pick ? this.applyEndlessBoon(pick.id) : null;
                }

                const overclockGold = Math.max(60, 80 + beforePressure * 12);
                this.player.gold += overclockGold;
                Utils.showBattleLog(
                    `轮回过载启动：压力 ${beforePressure}→${state.pressure}，额外灵石 +${overclockGold}` +
                    `${applied ? `，获得赐福【${applied.name}】` : ''}`
                );
                this.showRewardModal(
                    '轮回过载完成',
                    `轮回压力：${beforePressure} → ${state.pressure}\n` +
                    `额外获得灵石：${overclockGold}\n` +
                    `${applied ? `赐福：${applied.name}\n${applied.desc}` : '赐福接入失败（已记录）。'}`,
                    '🔥'
                );
                return true;
            }

            case 'endlessRefit': {
                if (!this.isEndlessActive()) {
                    Utils.showBattleLog('当前并非无尽轮回，无法执行相位校准。');
                    return false;
                }
                const state = this.ensureEndlessState();
                if (!Array.isArray(state.activeMutators)) state.activeMutators = [];
                const beforeIds = state.activeMutators.slice();
                if (state.activeMutators.length > 0) state.activeMutators.pop();
                const mutator = this.rollNextEndlessMutator();
                if (mutator) {
                    const mutatorMap = new Map(this.getEndlessMutatorPool().map((item) => [item.id, item]));
                    const beforeNames = beforeIds
                        .map((id) => mutatorMap.get(id))
                        .filter((item) => !!item)
                        .map((item) => item.name);
                    const afterNames = (state.activeMutators || [])
                        .map((id) => mutatorMap.get(id))
                        .filter((item) => !!item)
                        .map((item) => item.name);
                    Utils.showBattleLog(`相位校准完成：新词缀【${mutator.name}】已接入。`);
                    this.showRewardModal(
                        '相位校准完成',
                        `重配前：${beforeNames.length > 0 ? beforeNames.join('、') : '无'}\n` +
                        `重配后：${afterNames.length > 0 ? afterNames.join('、') : '无'}\n` +
                        `新接入词缀：${mutator.name}\n${mutator.desc}`,
                        '🧬'
                    );
                    return true;
                }
                Utils.showBattleLog('相位校准失败：未生成新词缀。');
                return false;
            }

            case 'endlessBlessing': {
                if (!this.isEndlessActive()) {
                    Utils.showBattleLog('当前并非无尽轮回，无法执行轮回祷告。');
                    return false;
                }
                this.showShopEndlessBlessingSelection(service);
                return 'deferred';
            }

            case 'law':
                if (service.data) {
                    this.player.collectLaw(service.data);
                    Utils.showBattleLog(`习得法则：${service.data.name} `);
                    this.showRewardModal('习得法则', `你领悟了新的法则：\n【${service.data.name}】`, '📜');
                    return true;
                }
                return false;

            case 'maxHp':
                this.player.addPermaBuff('maxHp', 5);
                this.player.currentHp += 5;
                Utils.showBattleLog('最大生命 +5');
                this.showRewardModal('体质增强', `最大生命值上限 + 5！`, '💊');
                return true;

            case 'strength':
                this.player.addPermBuff('strength', 1);
                Utils.showBattleLog('永久力量 +1');
                this.showRewardModal('力量觉醒', `永久力量 + 1！\n你的攻击将更加致命。`, '💪');
                return true;

            case 'refresh':
                // 刷新卡牌
                this.shopItems = this.generateShopCards(5);
                Utils.showBattleLog('商店货物已刷新');
                this.showRewardModal('进货完成', `商店货物已刷新！\n快来看看有什么新宝贝。`, '🔄');
                return 'repeatable';

            case 'gamble':
                const roll = Math.random();
                let rewardText = '';
                let rewardIcon = '🎁';
                let rewardTitle = '盲盒开启';

                if (roll < 0.5) { // 50% 亏本/保本
                    const goldBack = Utils.random(10, 30);
                    this.player.gold += goldBack;
                    Utils.showBattleLog(`盲盒：获得 ${goldBack} 灵石（亏了...）`);
                    rewardIcon = '💸';
                    rewardTitle = '运气平平';
                    rewardText = `你打开盲盒，里面只有一些碎银子...\n获得 ${goldBack} 灵石。`;
                } else if (roll < 0.85) { // 35% 获得随机卡牌
                    const randCard = getRandomCard(this.player.realm > 2 ? 'uncommon' : 'common');
                    this.player.addCardToDeck(randCard);
                    Utils.showBattleLog(`盲盒：获得卡牌【${randCard.name}】！`);
                    rewardIcon = '🎴';
                    rewardTitle = '获得卡牌';
                    rewardText = `你获得了一张卡牌：\n【${randCard.name}】`;
                } else if (roll < 0.98) { // 13% 小奖 (稀有卡或大量金币)
                    if (Math.random() < 0.5) {
                        const rareCard = getRandomCard('rare');
                        this.player.addCardToDeck(rareCard);
                        Utils.showBattleLog(`盲盒：大奖！获得稀有卡牌【${rareCard.name}】！`);
                        rewardIcon = '🌟';
                        rewardTitle = '稀有大奖！';
                        rewardText = `运气爆棚！你获得了一张稀有卡牌：\n【${rareCard.name}】`;
                    } else {
                        const bigGold = Utils.random(80, 150);
                        this.player.gold += bigGold;
                        Utils.showBattleLog(`盲盒：手气不错！获得 ${bigGold} 灵石！`);
                        rewardIcon = '💰';
                        rewardTitle = '发财了！';
                        rewardText = `盒子底部铺满了闪闪发光的灵石！\n获得 ${bigGold} 灵石！`;
                    }
                } else { // 2% 传说/法宝奖
                    const jackpot = Math.random();
                    if (jackpot < 0.5) {
                        const legCard = getRandomCard('legendary');
                        this.player.addCardToDeck(legCard);
                        Utils.showBattleLog(`盲盒：传说大奖！！获得【${legCard.name}】！`);
                        rewardIcon = '👑';
                        rewardTitle = '传说降世！';
                        rewardText = `金光乍现！你获得了传说卡牌：\n【${legCard.name}】`;
                    } else {
                        // 尝试给法宝
                        const treasureKeys = Object.keys(TREASURES);
                        const unowned = treasureKeys.filter(k => !this.player.hasTreasure(k));
                        if (unowned.length > 0) {
                            const tid = unowned[Math.floor(Math.random() * unowned.length)];
                            this.player.addTreasure(tid);
                            Utils.showBattleLog(`盲盒：鸿运当头！获得法宝【${TREASURES[tid].name}】！`);
                            rewardIcon = '🏺';
                            rewardTitle = '法宝现世！';
                            rewardText = `极其罕见！你获得了法宝：\n【${TREASURES[tid].name}】`;
                        } else {
                            this.player.gold += 300;
                            Utils.showBattleLog(`盲盒：传说大奖！获得 300 灵石！`);
                            rewardIcon = '💎';
                            rewardTitle = '巨额财富';
                            rewardText = `虽然没有法宝，但这里有一大笔钱！\n获得 300 灵石！`;
                        }
                    }
                }

                this.showRewardModal(rewardTitle, rewardText, rewardIcon);

                // 盲盒涨价逻辑
                service.price = Math.floor(service.price * 1.5);
                service.name = '神秘盲盒 (涨价了)';
                return 'repeatable';

            default:
                return false;
        }
    }

    showShopEndlessBlessingSelection(serviceItem) {
        if (!serviceItem) return;
        if (!this.isEndlessActive()) {
            Utils.showBattleLog('当前并非无尽轮回，无法执行轮回祷告。');
            return;
        }
        if (!this.canAffordShopItem(serviceItem)) {
            Utils.showBattleLog(`${this.getStrategicCurrencyLabel(serviceItem.currency || 'gold')}不足！`);
            return;
        }

        const choices = this.getEndlessBoonChoices();
        const picks = Array.isArray(choices) ? choices.slice(0, 2) : [];
        if (picks.length < 2) {
            const fallbackPool = this.getEndlessBoonPool();
            for (let i = 0; i < fallbackPool.length && picks.length < 2; i += 1) {
                const boon = fallbackPool[i];
                if (!boon || picks.some((item) => item.id === boon.id)) continue;
                picks.push(boon);
            }
        }
        if (picks.length === 0) {
            Utils.showBattleLog('轮回祷告失败：暂无可用赐福。');
            return;
        }

        const modal = document.getElementById('event-modal');
        const titleEl = document.getElementById('event-title');
        const iconEl = document.getElementById('event-icon');
        const descEl = document.getElementById('event-desc');
        const choicesEl = document.getElementById('event-choices');
        if (!modal || !titleEl || !iconEl || !descEl || !choicesEl) {
            const fallback = picks[0];
            const applied = fallback ? this.applyEndlessBoon(fallback.id) : null;
            if (!applied) return;
            if (!this.spendShopPrice(serviceItem)) return;
            serviceItem.sold = true;
            this.updateShopCurrencyDisplays();
            this.renderShop();
            this.saveGame();
            return;
        }

        titleEl.textContent = '轮回祷告';
        iconEl.textContent = '🕯️';
        descEl.innerHTML = `支付 <span style=\"color:var(--accent-gold)\">${this.formatShopPrice(serviceItem)}</span>，从 2 项赐福中选择 1 项。`;
        choicesEl.innerHTML = '';

        picks.slice(0, 2).forEach((boon) => {
            const rarityTag = boon.rarity === 'rare' ? '<span style="color:#ffb866;">【稀有】</span> ' : '';
            const btn = document.createElement('button');
            btn.className = 'event-choice';
            btn.innerHTML = `
                <div>${rarityTag}${boon.name}</div>
                <div class="choice-effect">${boon.desc}</div>
            `;
            btn.onclick = () => {
                const applied = this.applyEndlessBoon(boon.id);
                if (!applied) return;
                this.player.gold -= serviceItem.price;
                serviceItem.sold = true;
                this.closeModal();
                Utils.showBattleLog(`轮回祷告：获得赐福【${applied.name}】`);
                this.showRewardModal('轮回祷告成功', `你获得了赐福：${applied.name}\n${applied.desc}`, '🕯️');
                const goldEl = document.getElementById('shop-gold-display');
                if (goldEl) goldEl.textContent = this.player.gold;
                this.renderShop();
                this.saveGame();
            };
            choicesEl.appendChild(btn);
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'event-choice';
        cancelBtn.innerHTML = `
            <div>🚶 取消祷告</div>
            <div class="choice-effect">保留灵石，返回商店</div>
        `;
        cancelBtn.onclick = () => this.closeModal();
        choicesEl.appendChild(cancelBtn);

        modal.classList.add('active');
    }

    showShopCardDraft(serviceItem) {
        if (!serviceItem) return;
        if (!this.canAffordShopItem(serviceItem)) {
            Utils.showBattleLog(`${this.getStrategicCurrencyLabel(serviceItem.currency || 'gold')}不足！`);
            return;
        }

        const rarityPool = ['common', 'uncommon', 'uncommon', 'rare'];
        const cards = [];
        for (let i = 0; i < 3; i += 1) {
            const rarity = rarityPool[Math.floor(Math.random() * rarityPool.length)];
            const card = getRandomCard(rarity, this.player.characterId);
            if (card) cards.push(card);
        }
        if (cards.length === 0) {
            Utils.showBattleLog('补给包空空如也，交易取消。');
            return;
        }

        const modal = document.getElementById('event-modal');
        const titleEl = document.getElementById('event-title');
        const iconEl = document.getElementById('event-icon');
        const descEl = document.getElementById('event-desc');
        const choicesEl = document.getElementById('event-choices');

        titleEl.textContent = '侦巡补给包';
        iconEl.textContent = '🎒';
        descEl.innerHTML = `支付 <span style=\"color:var(--accent-gold)\">${this.formatShopPrice(serviceItem)}</span>，选择 1 张补给卡牌。`;
        choicesEl.innerHTML = '';

        cards.forEach((card) => {
            const rarityKey = String(card.rarity || 'common').toLowerCase();
            const rarityLabel = this.getCardRarityLabel(rarityKey);
            const btn = document.createElement('button');
            btn.className = 'event-choice';
            btn.innerHTML = `
                <div class="choice-title">
                    <span class="choice-name">${card.icon || '🃏'} ${card.name}</span>
                    <span class="choice-rarity rarity-${rarityKey}">【${rarityLabel}】</span>
                </div>
                <div class="choice-effect">${card.description || '获得这张卡牌'}</div>
            `;
            btn.onclick = () => {
                if (!this.spendShopPrice(serviceItem)) return;
                this.player.addCardToDeck(card);
                serviceItem.sold = true;
                this.closeModal();
                Utils.showBattleLog(`补给采购完成：获得【${card.name}】`);
                this.updateShopCurrencyDisplays();
                this.renderShop();
                this.saveGame();
            };
            choicesEl.appendChild(btn);
        });

        const leaveBtn = document.createElement('button');
        leaveBtn.className = 'event-choice';
        leaveBtn.innerHTML = `
            <div>🚶 取消采购</div>
            <div class="choice-effect">保留灵石，返回商店</div>
        `;
        leaveBtn.onclick = () => this.closeModal();
        choicesEl.appendChild(leaveBtn);

        modal.classList.add('active');
    }

    showShopForbiddenDraft(serviceItem) {
        if (!serviceItem) return;
        if (!this.canAffordShopItem(serviceItem)) {
            Utils.showBattleLog(`${this.getStrategicCurrencyLabel(serviceItem.currency || 'gold')}不足！`);
            return;
        }
        if (this.player.maxHp <= 18) {
            Utils.showBattleLog('根基过于虚弱，无法承受禁术血契。');
            return;
        }

        const rarityPool = ['rare', 'rare', 'epic'];
        const cards = [];
        for (let i = 0; i < 3; i += 1) {
            const rarity = rarityPool[Math.floor(Math.random() * rarityPool.length)];
            const card = getRandomCard(rarity, this.player.characterId);
            if (card) cards.push(card);
        }
        if (cards.length === 0) {
            Utils.showBattleLog('禁术卷轴暂未显化，交易取消。');
            return;
        }

        const modal = document.getElementById('event-modal');
        const titleEl = document.getElementById('event-title');
        const iconEl = document.getElementById('event-icon');
        const descEl = document.getElementById('event-desc');
        const choicesEl = document.getElementById('event-choices');
        if (!modal || !titleEl || !iconEl || !descEl || !choicesEl) return;

        titleEl.textContent = '逆命血契';
        iconEl.textContent = '🩸';
        descEl.innerHTML = `支付 <span style="color:var(--accent-gold)">${this.formatShopPrice(serviceItem)}</span>，并永久失去 6 点生命上限，从 3 张禁术卡中选择 1 张。`;
        choicesEl.innerHTML = '';

        cards.forEach((card) => {
            const rarityKey = String(card.rarity || 'rare').toLowerCase();
            const rarityLabel = this.getCardRarityLabel(rarityKey);
            const btn = document.createElement('button');
            btn.className = 'event-choice';
            btn.innerHTML = `
                <div class="choice-title">
                    <span class="choice-name">${card.icon || '🃏'} ${card.name}</span>
                    <span class="choice-rarity rarity-${rarityKey}">【${rarityLabel}】</span>
                </div>
                <div class="choice-effect">${card.description || '获得这张卡牌'}</div>
            `;
            btn.onclick = () => {
                if (!this.spendShopPrice(serviceItem)) return;
                this.player.maxHp = Math.max(16, this.player.maxHp - 6);
                this.player.currentHp = Math.min(this.player.currentHp, this.player.maxHp);
                this.player.addCardToDeck(card);
                serviceItem.sold = true;
                this.closeModal();
                Utils.showBattleLog(`逆命血契：获得【${card.name}】，最大生命降至 ${this.player.maxHp}`);
                this.showRewardModal('逆命血契完成', `获得卡牌：${card.name}
最大生命降至 ${this.player.maxHp}。`, '🩸');
                this.updateShopCurrencyDisplays();
                this.renderShop();
                this.saveGame();
            };
            choicesEl.appendChild(btn);
        });

        const leaveBtn = document.createElement('button');
        leaveBtn.className = 'event-choice';
        leaveBtn.innerHTML = `
            <div>🚶 暂缓血契</div>
            <div class="choice-effect">保留业果，返回商店</div>
        `;
        leaveBtn.onclick = () => this.closeModal();
        choicesEl.appendChild(leaveBtn);
        modal.classList.add('active');
    }

    // 显示移除卡牌界面 (Refactored: Ink & Gold Purification UI)
    showRemoveCard(serviceItem) {
        if (!this.canAffordShopItem(serviceItem)) {
            Utils.showBattleLog(`${this.getStrategicCurrencyLabel(serviceItem.currency || 'gold')}不足！`);
            return;
        }

        // Close other modals
        this.closeModal();

        const modal = document.getElementById('purification-modal');
        const grid = document.getElementById('purification-grid');
        const costDisplay = document.getElementById('purification-cost-display');
        const confirmBtn = document.getElementById('purification-confirm-btn');

        if (!modal || !grid) {
            console.error('Purification UI elements missing!');
            return;
        }

        // Reset State
        grid.innerHTML = '';
        modal.classList.add('active');
        costDisplay.textContent = `消耗: ${this.formatShopPrice(serviceItem)}`;
        confirmBtn.disabled = true;
        confirmBtn.onclick = null; // Clear previous listeners

        let selectedIndex = -1;

        // Render Cards
        this.player.deck.forEach((card, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'purification-card-wrapper';

            // Create standard card element
            const cardEl = Utils.createCardElement(card, index);
            // Disable default hover/click behaviors if they conflict, though CSS handles most
            wrapper.appendChild(cardEl);

            // Delete Intent Overlay (Visual)
            const overlay = document.createElement('div');
            overlay.className = 'delete-intent-overlay';
            overlay.innerHTML = '<span class="delete-icon">🔥</span>';
            wrapper.appendChild(overlay);

            // Selection Logic
            wrapper.addEventListener('click', () => {
                // Deselect others
                document.querySelectorAll('.purification-card-wrapper').forEach(el => el.classList.remove('selected'));

                if (selectedIndex === index) {
                    // Deselect if clicking same
                    selectedIndex = -1;
                    confirmBtn.disabled = true;
                    confirmBtn.textContent = '确认移除 (Confirm)';
                } else {
                    // Select new
                    selectedIndex = index;
                    wrapper.classList.add('selected');
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = `确认焚毁 (Burn)`;

                    // Sound effect if available
                    if (typeof audioManager !== 'undefined') {
                        audioManager.playSFX('click');
                    }
                }
            });

            grid.appendChild(wrapper);
        });

        // Confirm Action
        confirmBtn.onclick = () => {
            if (selectedIndex === -1) return;

            const cardName = this.player.deck[selectedIndex].name;
            const targetWrapper = grid.children[selectedIndex];

            // Visual Burn Effect
            const burn = document.createElement('div');
            burn.className = 'card-burn-effect';
            targetWrapper.appendChild(burn);

            // Audio
            if (typeof audioManager !== 'undefined') {
                audioManager.playSFX('fire'); // Assuming 'fire' exists, or 'buff'
            }

            // Delay actual removal for animation
            setTimeout(() => {
                // Remove from deck
                if (!this.spendShopPrice(serviceItem)) return;
                this.player.deck.splice(selectedIndex, 1);

                // Update Logic
                this.player.removeCount = (this.player.removeCount || 0) + 1;
                serviceItem.sold = true;

                // Close UI
                modal.classList.remove('active');

                // Feedback
                Utils.showBattleLog(`【${cardName}】已化为灰烬...`);

                // Refresh shop UI to show sold status
                this.updateShopCurrencyDisplays();
                this.renderShop();

            }, 800);
        };
    }



    // 剩下的 buyRingExp 等旧方法可以删除，因为已经集成到 applyServiceEffect 中了

    // 关闭商店
    closeShop() {
        if (this.shopNode) {
            this.map.completeNode(this.shopNode);
            this.shopNode = null;
        }
        this.autoSave();
        this.showScreen('map-screen');
    }

    // ========== 营地功能 ==========

    campfireNode = null;

    // 显示营地选项
    showCampfire(node) {
        this.campfireNode = node;

        // 使用事件弹窗显示营地选项
        const modal = document.getElementById('event-modal');
        document.getElementById('event-icon').textContent = '🏕️';
        document.getElementById('event-title').textContent = '野外营地';
        document.getElementById('event-desc').textContent = '你找到了一个安全的休息地点，可以在这里恢复精力或磨练技艺...';

        const choicesEl = document.getElementById('event-choices');
        choicesEl.innerHTML = '';

        // 选项1: 休息恢复HP
        const healAmount = Math.floor(this.player.maxHp * 0.2);
        const restBtn = document.createElement('button');
        restBtn.className = 'event-choice';
        restBtn.innerHTML = `
            <div>💤 休息(恢复 ${healAmount} HP)</div>
            <div class="choice-effect">当前HP: ${this.player.currentHp}/${this.player.maxHp}</div>
        `;
        restBtn.onclick = () => this.campfireRest();
        choicesEl.appendChild(restBtn);

        // 选项2: 升级卡牌
        const upgradableCount = this.player.deck.filter(c => canUpgradeCard(c)).length;
        const upgradeBtn = document.createElement('button');
        upgradeBtn.className = 'event-choice';
        upgradeBtn.innerHTML = `
            <div>⬆️ 升级卡牌</div>
            <div class="choice-effect">可升级: ${upgradableCount} 张</div>
        `;
        if (upgradableCount > 0) {
            upgradeBtn.onclick = () => this.showCampfireUpgrade();
        } else {
            upgradeBtn.classList.add('disabled');
            upgradeBtn.style.opacity = '0.5';
            upgradeBtn.style.cursor = 'not-allowed';
        }
        choicesEl.appendChild(upgradeBtn);

        // 选项3: 战术演练（未来两战首回合额外抽牌）
        const drillBtn = document.createElement('button');
        drillBtn.className = 'event-choice';
        drillBtn.innerHTML = `
            <div>📘 战术演练</div>
            <div class="choice-effect">接下来 2 场战斗：首回合额外抽 1 张牌，并获得命环经验</div>
        `;
        drillBtn.onclick = () => this.campfireDrill();
        choicesEl.appendChild(drillBtn);

        // 选项4: 布设结界（未来两战开场护盾）
        const wardBtn = document.createElement('button');
        wardBtn.className = 'event-choice';
        wardBtn.innerHTML = `
            <div>🧿 布设结界</div>
            <div class="choice-effect">接下来 2 场战斗：开场获得 10 护盾</div>
        `;
        wardBtn.onclick = () => this.campfireWard();
        choicesEl.appendChild(wardBtn);

        const bountyBtn = document.createElement('button');
        bountyBtn.className = 'event-choice';
        bountyBtn.innerHTML = `
            <div>📜 悬赏部署</div>
            <div class="choice-effect">接下来 2 场战斗：胜利额外获得灵石</div>
        `;
        bountyBtn.onclick = () => this.campfireBounty();
        choicesEl.appendChild(bountyBtn);

        const pulseBtn = document.createElement('button');
        pulseBtn.className = 'event-choice';
        pulseBtn.innerHTML = `
            <div>⚡ 灵息调和</div>
            <div class="choice-effect">接下来 2 场战斗：首回合灵力 +1</div>
        `;
        pulseBtn.onclick = () => this.campfirePulse();
        choicesEl.appendChild(pulseBtn);

        const medicBtn = document.createElement('button');
        medicBtn.className = 'event-choice';
        medicBtn.innerHTML = `
            <div>🩹 战地整备</div>
            <div class="choice-effect">接下来 2 场战斗：胜利后恢复生命</div>
        `;
        medicBtn.onclick = () => this.campfireMedic();
        choicesEl.appendChild(medicBtn);

        const insightCostHp = Math.max(6, Math.floor(this.player.maxHp * 0.1));
        const insightBtn = document.createElement('button');
        insightBtn.className = 'event-choice';
        insightBtn.innerHTML = `
            <div>🕯️ 逆炼冥想（-${insightCostHp} HP）</div>
            <div class="choice-effect">接下来 3 场战斗：命环经验额外 +30%</div>
        `;
        if (this.player.currentHp > insightCostHp + 1) {
            insightBtn.onclick = () => this.campfireInsight(insightCostHp);
        } else {
            insightBtn.classList.add('disabled');
            insightBtn.style.opacity = '0.5';
            insightBtn.style.cursor = 'not-allowed';
        }
        choicesEl.appendChild(insightBtn);

        // 选项5: 移除卡牌（如果牌组足够大）
        if (this.player.deck.length > 5) {
            const removeBtn = document.createElement('button');
            removeBtn.className = 'event-choice';
            removeBtn.innerHTML = `
                <div>🗑️ 净化(移除一张牌)</div>
                <div class="choice-effect">精简牌组，提升效率</div>
            `;
            removeBtn.onclick = () => this.showCampfireRemove();
            choicesEl.appendChild(removeBtn);
        }

        modal.classList.add('active');
    }

    // 营地休息
    campfireRest() {
        const healAmount = Math.max(1, Math.floor(this.player.maxHp * 0.2 * this.getEndlessHealingMultiplier()));
        this.player.heal(healAmount);
        Utils.showBattleLog(`休息恢复 ${healAmount} 点生命！`);

        this.closeModal();
        this.completeCampfire();
    }

    campfireDrill() {
        if (typeof this.player.grantAdventureBuff === 'function') {
            this.player.grantAdventureBuff('firstTurnDrawBoostBattles', 2);
        }
        this.player.fateRing.exp += 20;
        this.player.checkFateRingLevelUp();
        Utils.showBattleLog('营地演练完成：接下来 2 场战斗首回合额外抽牌，命环经验 +20');
        this.closeModal();
        this.completeCampfire();
    }

    campfireWard() {
        if (typeof this.player.grantAdventureBuff === 'function') {
            this.player.grantAdventureBuff('openingBlockBoostBattles', 2);
        }
        Utils.showBattleLog('营地结界生效：接下来 2 场战斗开场护盾 +10');
        this.closeModal();
        this.completeCampfire();
    }

    campfireBounty() {
        if (typeof this.player.grantAdventureBuff === 'function') {
            this.player.grantAdventureBuff('victoryGoldBoostBattles', 2);
        }
        this.player.fateRing.exp += 12;
        this.player.checkFateRingLevelUp();
        Utils.showBattleLog('悬赏部署完成：接下来 2 场战斗胜利额外灵石，命环经验 +12');
        this.closeModal();
        this.completeCampfire();
    }

    campfirePulse() {
        if (typeof this.player.grantAdventureBuff === 'function') {
            this.player.grantAdventureBuff('firstTurnEnergyBoostBattles', 2);
        }
        Utils.showBattleLog('灵息调和完成：接下来 2 场战斗首回合灵力 +1');
        this.closeModal();
        this.completeCampfire();
    }

    campfireMedic() {
        if (typeof this.player.grantAdventureBuff === 'function') {
            this.player.grantAdventureBuff('victoryHealBoostBattles', 2);
        }
        this.player.fateRing.exp += 10;
        this.player.checkFateRingLevelUp();
        Utils.showBattleLog('战地整备完成：接下来 2 场战斗胜利后恢复生命，命环经验 +10');
        this.closeModal();
        this.completeCampfire();
    }

    campfireInsight(costHp = 8) {
        const hpCost = Math.max(1, Math.floor(Number(costHp) || 8));
        this.player.currentHp = Math.max(1, this.player.currentHp - hpCost);
        if (typeof this.player.grantAdventureBuff === 'function') {
            this.player.grantAdventureBuff('ringExpBoostBattles', 3);
        }
        Utils.showBattleLog(`逆炼冥想成功：失去 ${hpCost} 生命，接下来 3 场战斗命环经验额外提升`);
        this.closeModal();
        this.completeCampfire();
    }

    // 显示升级卡牌界面 (Refactored: Ink & Gold Edition)
    showCampfireUpgrade() {
        this.closeModal();

        const modal = document.getElementById('deck-modal');
        // Add specific class for styling override (no scroll on parent)
        modal.classList.add('upgrade-mode');

        // Ensure we remove this class when modal closes (simple patch: override the close button or handle in general close)
        // For now, let's attach a one-time listener to the close button to remove the class
        const closeBtn = modal.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                modal.classList.remove('upgrade-mode');
                this.closeModal();
            };
        }
        const container = document.getElementById('deck-view-cards');

        // Reset Modal State
        container.innerHTML = '';
        container.style.display = 'block'; // Reset flex styles from previous usage

        // --- 1. Main Layout Container ---
        const layout = document.createElement('div');
        layout.className = 'upgrade-modal-layout';

        // --- 2. Left: Card Grid ---
        const cardGrid = document.createElement('div');
        cardGrid.className = 'upgrade-card-grid';

        // --- 3. Right: Preview Panel ---
        const previewPanel = document.createElement('div');
        previewPanel.className = 'upgrade-preview-panel';
        previewPanel.innerHTML = `
            <div class="preview-title">悟道演练</div>
            <div class="preview-placeholder" id="ug-preview-placeholder">
                <span style="font-size:3rem; display:block; margin-bottom:20px; opacity:0.3">👆</span>
                点击左侧卡牌<br>推演进阶效果
            </div>
            
            <div id="ug-preview-content" style="display:none; width:100%; flex-direction:column; align-items:center;">
                <div class="preview-card-container" id="ug-preview-card"></div>
                
                <div class="preview-diff-box" id="ug-diff-box">
                    <!-- Dynamic Rows -->
                </div>

                <button class="confirm-upgrade-btn" id="ug-confirm-btn" disabled>
                    <span class="btn-text">注灵进阶</span>
                </button>
            </div>
        `;

        layout.appendChild(cardGrid);
        layout.appendChild(previewPanel);
        container.appendChild(layout);

        // --- 4. Logic & Interaction ---
        const placeholder = previewPanel.querySelector('#ug-preview-placeholder');
        const contentArea = previewPanel.querySelector('#ug-preview-content');
        const cardContainer = previewPanel.querySelector('#ug-preview-card');
        const diffBox = previewPanel.querySelector('#ug-diff-box');
        const confirmBtn = previewPanel.querySelector('#ug-confirm-btn');

        let selectedIndex = -1;
        let selectedCard = null;

        // Render Cards
        this.player.deck.forEach((card, index) => {
            if (!canUpgradeCard(card)) return; // Only show upgradable

            // Create standard card
            const cardEl = Utils.createCardElement(card, index);

            // Interaction
            cardEl.addEventListener('click', () => {
                // Audio
                if (typeof audioManager !== 'undefined') audioManager.playSFX('click');

                // Highlight Selection
                cardGrid.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
                cardEl.classList.add('selected');

                selectedIndex = index;
                selectedCard = card;

                // Show Preview
                this.updateUpgradePreview(card, placeholder, contentArea, cardContainer, diffBox, confirmBtn);
            });

            cardGrid.appendChild(cardEl);
        });

        // Bind Confirm
        confirmBtn.onclick = () => {
            if (selectedIndex === -1) return;

            // Audio
            if (typeof audioManager !== 'undefined') audioManager.playSFX('powerup'); // Or 'upgrade'

            // Visual Effect
            const overlay = document.createElement('div');
            overlay.className = 'upgrade-flash-overlay';
            container.appendChild(overlay);

            // Execute Logic
            setTimeout(() => {
                const upgradedCard = upgradeCard(selectedCard);
                // Replace in deck (must handle reference carefully or splice)
                // Assuming deck is array of objects
                this.player.deck[selectedIndex] = upgradedCard;

                this.closeModal();
                this.completeCampfire();
            }, 500);
        };

        modal.classList.add('active');

        // Update Title (Optional override)
        const title = modal.querySelector('h2');
        if (title) title.textContent = '🔥 营地 | 悟道进阶';
    }

    // Helper: Update Preview Panel
    updateUpgradePreview(card, placeholder, contentArea, cardContainer, diffBox, confirmBtn) {
        placeholder.style.display = 'none';
        contentArea.style.display = 'flex';
        confirmBtn.disabled = false;

        // Generate Upgraded Version
        const upgraded = upgradeCard(card);

        // 1. Render Card Visual
        cardContainer.innerHTML = '';
        const upgradedEl = Utils.createCardElement(upgraded, 999);
        // Remove hover effects on preview card to keep it static
        upgradedEl.style.transform = 'none';
        upgradedEl.style.pointerEvents = 'none';
        cardContainer.appendChild(upgradedEl);

        // 2. Diff Logic
        let diffHtml = '';

        // Name Diff (if changed)
        if (card.name !== upgraded.name) {
            diffHtml += `
                <div class="diff-row">
                    <span class="diff-label">名讳</span>
                    <div>
                        <span class="diff-val-old">${card.name}</span>
                        <span class="diff-val-new"> ➤ ${upgraded.name}</span>
                    </div>
                </div>`;
        }

        // Damage Diff
        if (card.damage !== upgraded.damage && upgraded.damage) {
            diffHtml += `
                <div class="diff-row">
                    <span class="diff-label">威力</span>
                    <div>
                        <span class="diff-val-old">${card.damage || 0}</span>
                        <span class="diff-val-new"> ➤ ${upgraded.damage}</span>
                    </div>
                </div>`;
        }

        // Block Diff
        if (card.block !== upgraded.block && upgraded.block) {
            diffHtml += `
                <div class="diff-row">
                    <span class="diff-label">护盾</span>
                    <div>
                        <span class="diff-val-old">${card.block || 0}</span>
                        <span class="diff-val-new"> ➤ ${upgraded.block}</span>
                    </div>
                </div>`;
        }

        // Cost Diff
        if (card.cost !== upgraded.cost) {
            diffHtml += `
                <div class="diff-row">
                    <span class="diff-label">消耗</span>
                    <div>
                        <span class="diff-val-old">${card.cost}</span>
                        <span class="diff-val-new"> ➤ ${upgraded.cost}</span>
                    </div>
                </div>`;
        }

        // Description Diff (Always show as summary)
        diffHtml += `
            <div class="diff-row" style="flex-direction:column; border:none; margin-top:5px;">
                <span class="diff-label" style="margin-bottom:2px;">效果演变</span>
                <span class="diff-val-new" style="font-size:0.85rem; line-height:1.4">${upgraded.description}</span>
            </div>
        `;

        diffBox.innerHTML = diffHtml;
    }


    // 升级选中的卡牌
    campfireUpgradeCard(index) {
        const card = this.player.deck[index];
        if (!canUpgradeCard(card)) return;

        const upgraded = upgradeCard(card);
        this.player.deck[index] = upgraded;

        Utils.showBattleLog(`${card.name} 升级为 ${upgraded.name}！`);

        this.closeModal();
        this.completeCampfire();
    }

    // 显示移除卡牌界面（营地版 - Ink & Gold Refactor）
    showCampfireRemove() {
        this.closeModal();

        const modal = document.getElementById('purification-modal');
        const grid = document.getElementById('purification-grid');
        const costDisplay = document.getElementById('purification-cost-display');
        const confirmBtn = document.getElementById('purification-confirm-btn');

        if (!modal || !grid) {
            console.error('Purification UI elements missing!');
            return;
        }

        // Reset State
        grid.innerHTML = '';
        modal.classList.add('active');

        // Campfire specific adjustments
        costDisplay.innerHTML = '<span style="color: var(--accent-green); font-size: 1.1em;">✨ 净化心灵</span>';

        confirmBtn.disabled = true;
        confirmBtn.onclick = null; // Clear listeners

        let selectedIndex = -1;

        // Render Cards
        this.player.deck.forEach((card, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'purification-card-wrapper';

            // Create standard card element
            const cardEl = Utils.createCardElement(card, index);
            wrapper.appendChild(cardEl);

            // Delete Intent Overlay (Visual)
            const overlay = document.createElement('div');
            overlay.className = 'delete-intent-overlay';
            overlay.innerHTML = '<span class="delete-icon">🔥</span>';
            wrapper.appendChild(overlay);

            // Selection Logic
            wrapper.addEventListener('click', () => {
                // Deselect others
                document.querySelectorAll('.purification-card-wrapper').forEach(el => el.classList.remove('selected'));

                if (selectedIndex === index) {
                    // Deselect
                    selectedIndex = -1;
                    confirmBtn.disabled = true;
                    confirmBtn.textContent = '选择移除对象';
                } else {
                    // Select
                    selectedIndex = index;
                    wrapper.classList.add('selected');
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = `确认焚毁 (Burn)`;

                    if (typeof audioManager !== 'undefined') audioManager.playSFX('click');
                }
            });

            grid.appendChild(wrapper);
        });

        // Confirm Action
        confirmBtn.onclick = () => {
            if (selectedIndex === -1) return;

            const cardName = this.player.deck[selectedIndex].name;
            const targetWrapper = grid.children[selectedIndex];

            // Visual Burn Effect
            const burn = document.createElement('div');
            burn.className = 'card-burn-effect';
            targetWrapper.appendChild(burn);

            if (typeof audioManager !== 'undefined') audioManager.playSFX('fire');

            // Delay actual removal
            setTimeout(() => {
                this.campfireRemoveCard(selectedIndex);

                // Close UI manually here since campfireRemoveCard might need to handle logic differently if we didn't pass params
                // Actually campfireRemoveCard calls closeModal/completeCampfire, so we are good.
            }, 800);
        };
    }

    // 移除选中的卡牌（营地版 - 逻辑处理）
    campfireRemoveCard(index) {
        const card = this.player.deck[index];
        this.player.deck.splice(index, 1);

        // Removed tracking count logic if specific to shop, or keep it if global? 
        // Let's increment global remove count just in case
        this.player.removeCount = (this.player.removeCount || 0) + 1;

        Utils.showBattleLog(`【${card.name}】已化为灰烬...`);
        this.closeModal();
        this.completeCampfire();
    }

    // 完成营地
    completeCampfire() {
        if (this.campfireNode) {
            this.map.completeNode(this.campfireNode);
            this.campfireNode = null;
        }
        this.autoSave();
        this.showScreen('map-screen');
    }
    // --- Auth System ---
    showLoginModal() {
        if (
            typeof AuthService !== 'undefined' &&
            AuthService.isCloudEnabled &&
            !AuthService.isCloudEnabled()
        ) {
            const modalMsg = document.getElementById('auth-message');
            if (modalMsg) modalMsg.innerText = '云存档未配置，当前仅可离线游玩';
            Utils.showBattleLog('云存档未配置，已切换为离线模式');
            return;
        }

        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.classList.add('active');
            // Clear inputs
            const u = document.getElementById('auth-username');
            const p = document.getElementById('auth-password');
            const m = document.getElementById('auth-message');
            if (u) u.value = '';
            if (p) p.value = '';
            if (m) m.innerText = '';
        }
    }

    async handleLogin() {
        const usernameInput = document.getElementById('auth-username');
        const passwordInput = document.getElementById('auth-password');
        const messageEl = document.getElementById('auth-message');

        if (!usernameInput || !passwordInput || !messageEl) return;
        if (this.isAuthBusy) return;

        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username || !password) {
            messageEl.innerText = '请输入账号和密码';
            return;
        }

        messageEl.innerText = '登录中...';
        this.isAuthBusy = true;
        try {
            const result = await AuthService.login(username, password);
            if (result.success) {
                await this.onLoginSuccess(messageEl, '登录成功！');
            } else {
                messageEl.innerText = result.message || '登录失败';
                messageEl.style.color = '#ff6b6b';
            }
        } catch (error) {
            console.error('handleLogin failed:', error);
            messageEl.innerText = '登录失败，请稍后再试';
            messageEl.style.color = '#ff6b6b';
        } finally {
            this.isAuthBusy = false;
        }
    }

    // 打开存档选择界面 (同步云端)
    async openSaveSlotsWithSync() {
        if (this.isSyncingSlots) return;
        if (!AuthService.isLoggedIn()) {
            this.showConfirmModal(
                '尚未登录，是否先登录以同步云端存档？',
                () => {
                    this.guestMode = false;
                    this.showLoginModal();
                },
                () => {
                    // Guest mode
                    this.guestMode = true;
                    this.showCharacterSelection();
                }
            );
            return;
        }

        this.guestMode = false;

        const msgBtn = document.getElementById('new-game-btn');
        const originalText = msgBtn ? msgBtn.innerHTML : '';
        if (msgBtn) msgBtn.innerText = '同步中...';

        this.isSyncingSlots = true;
        try {
            const res = await AuthService.getCloudData();
            if (msgBtn) msgBtn.innerHTML = originalText;

            let slots = [null, null, null, null];
            if (res.success && res.slots) {
                slots = res.slots;
            } else if (res.isLegacy && res.slots) {
                slots = res.slots;
                // Auto-migrate legacy if needed? Already returned as slot 0 format
            }

            // Update cache
            this.cachedSlots = slots;
            this.renderSaveSlots(slots);
        } catch (e) {
            console.error('Sync failed', e);
            if (msgBtn) msgBtn.innerHTML = originalText;
            alert('获取云端存档失败，请检查网络');
        } finally {
            this.isSyncingSlots = false;
        }
    }

    // 统一的登录成功逻辑
    async onLoginSuccess(messageEl, successMsg) {
        messageEl.innerText = successMsg;
        messageEl.style.color = '#4ff';
        this.guestMode = false;
        setTimeout(async () => {
            this.closeModal();
            this.checkLoginStatus();

            // 登录成功后，获取云端存档列表并展示选择界面
            let res = { success: false, slots: [null, null, null, null], isEmpty: true };
            try {
                res = await AuthService.getCloudData();
            } catch (error) {
                console.error('Fetch cloud data after login failed:', error);
            }

            // 检查本地旧存档
            const localSave = localStorage.getItem('theDefierSave');
            let localData = null;
            if (localSave) { try { localData = JSON.parse(localSave); } catch (e) { } }

            let slots = [null, null, null, null];

            if (res.success && res.slots) {
                slots = res.slots;
            }

            // 修正：如果云端虽然返回成功，但存档全空（新注册账号），也应该尝试绑定旧存档
            const isCloudEmpty = res.isEmpty || (slots && slots.every(s => s === null));

            if (isCloudEmpty && localData) {
                // 如果云端是新的（空），但本地有数据，自动帮用户填入 Slot 0
                slots[0] = localData;
                AuthService.saveCloudData(localData, 0).catch(err => {
                    console.warn('Auto bind local save failed:', err);
                });
                Utils.showBattleLog('检测到旧存档，已自动绑定至 存档 1');
            }

            this.cachedSlots = slots;
            this.renderSaveSlots(slots);

        }, 500);
    }

    // 显示存档位选择模态框 (Spirit Tablet Style)
    renderSaveSlots(slots) {
        const modal = document.getElementById('save-slots-modal');
        const container = document.getElementById('slots-container');
        if (!modal || !container) return;

        container.innerHTML = '';

        slots.forEach((slotData, index) => {
            const slotEl = document.createElement('div');
            const isEmpty = !slotData;
            slotEl.className = `save-slot ${isEmpty ? 'empty' : ''}`;

            const slotName = `命 牌 · ${['一', '二', '三', '四'][index] || (index + 1)}`;

            let contentHtml = '';
            if (isEmpty) {
                contentHtml = `
                    <div class="slot-visual" style="border-color: #555; opacity: 0.5;">?</div>
                    <div class="slot-empty-text">虚位以待</div>
                `;
            } else {
                let date = new Date(slotData.timestamp).toLocaleDateString();
                let dateLabel = "更新";
                if (slotData.player && slotData.player.registerTime) {
                    date = new Date(slotData.player.registerTime).toLocaleDateString();
                    dateLabel = "注册";
                }
                const realm = (slotData.player && slotData.player.realm) ? slotData.player.realm : 1;
                const hp = (slotData.player && slotData.player.currentHp) ? slotData.player.currentHp : '?';
                const roleId = (slotData.player && slotData.player.characterId);

                let roleName = '未知角色';
                let roleIcon = '👤';
                if (roleId && typeof CHARACTERS !== 'undefined' && CHARACTERS[roleId]) {
                    const c = CHARACTERS[roleId];
                    roleName = c.name;
                    // Resolve Image Path: Check .image, .portrait, or .avatar (if path)
                    const imagePath = c.image || c.portrait || (c.avatar && c.avatar.includes('/') ? c.avatar : null);

                    if (imagePath) {
                        // Use image
                        roleIcon = ''; // Clear text icon
                        // We'll handle image via style in the HTML construction loop below
                    } else {
                        roleIcon = c.avatar || '👤';
                    }

                    // Store for use below
                    slotData._tempImage = imagePath;
                }

                let maxRealm = 1;
                if (slotData.unlockedRealms && Array.isArray(slotData.unlockedRealms)) {
                    maxRealm = Math.max(...slotData.unlockedRealms);
                } else if (slotData.player && slotData.player.realm) {
                    maxRealm = slotData.player.realm;
                }

                let realmDisplay = `第${maxRealm}重天`;
                if (maxRealm > 18) {
                    realmDisplay = `<span style="color:var(--accent-gold); font-weight:bold;">已通关</span>`;
                }

                contentHtml = `
                    <div class="slot-visual ${slotData._tempImage ? 'is-image' : ''}" 
                         style="${slotData._tempImage ? `background-image: url('${slotData._tempImage}');` : ''}">
                        ${slotData._tempImage ? '' : roleIcon}
                    </div>
                
                    <div class="slot-info-primary">${roleName} <span style="font-size:0.8em; opacity:0.7">| ${realmDisplay}</span></div>
                    <div class="slot-info-secondary">❤️ ${hp}  📅 ${dateLabel}: ${date}</div>
                `;
            }

            const actionsHtml = isEmpty ?
                `<button class="talisman-btn small" onclick="game.selectSlot(${index}, 'new')">
                    <div class="talisman-paper"></div>
                    <div class="talisman-content">
                        <span class="btn-text">开启轮回</span>
                    </div>
                </button>` :
                `<button class="talisman-btn small primary" onclick="game.selectSlot(${index}, 'load')">
                    <div class="talisman-paper"></div>
                    <div class="talisman-content">
                        <span class="btn-text">继续</span>
                    </div>
                </button>
                <button class="talisman-btn small" onclick="game.selectSlot(${index}, 'overwrite')" style="margin-top:5px; transform:scale(0.9);">
                    <div class="talisman-paper" style="border-color:var(--accent-red);"></div>
                    <div class="talisman-content">
                        <span class="btn-text" style="color:var(--accent-red);">覆盖</span>
                    </div>
                </button>`;

            slotEl.innerHTML = `
                <div class="slot-header">${slotName}</div>
                <div class="slot-content">
                    ${contentHtml}
                </div>
                <div class="slot-actions">
                    ${actionsHtml}
                </div>
            `;

            container.appendChild(slotEl);
        });

        modal.classList.add('active');
    }

    // 选择存档位操作
    selectSlot(index, mode) {
        this.currentSaveSlot = index;
        // 持久化存储，防止刷新丢失
        sessionStorage.setItem('currentSaveSlot', index);

        const modal = document.getElementById('save-slots-modal');

        if (mode === 'load') {
            const cloudData = this.cachedSlots[index];
            if (cloudData) {
                // 移除冲突检测，直接加载选中的存档
                // 用户要求点击继续时不跳出提醒

                const doLoad = () => {
                    try {
                        localStorage.setItem('theDefierSave', JSON.stringify(cloudData));
                        sessionStorage.setItem('justLoadedSave', 'true'); // Prevent loop

                        Utils.showBattleLog(`已加载 存档 ${index + 1} `);
                        modal.classList.remove('active');
                        setTimeout(() => window.location.reload(), 500);
                    } catch (e) {
                        console.error('Load Save Failed:', e);
                        alert('加载存档失败：本地存储可能已满，请清理浏览器缓存后重试。');
                    }
                };

                doLoad();
            }
        } else if (mode === 'new' || mode === 'overwrite') {
            const doOverwrite = () => {
                this.tempPreservedRealms = null;

                localStorage.removeItem('theDefierSave');
                this.currentSaveSlot = index;
                modal.classList.remove('active');

                // If we treat "New Game" as "Go to Character Select":
                this.showCharacterSelection();
                sessionStorage.setItem('currentSaveSlot', index);
            };

            if (mode === 'overwrite') {
                this.showConfirmModal(
                    '确定要覆盖此存档吗？旧进度将丢失！',
                    doOverwrite
                );
            } else {
                doOverwrite();
            }
        }
    }

    async handleRegister() {
        const username = document.getElementById('auth-username').value;
        const password = document.getElementById('auth-password').value;
        const msg = document.getElementById('auth-message');
        if (!msg) return;
        if (this.isAuthBusy) return;

        if (!username || !password) {
            msg.innerText = '请输入账号和密码';
            return;
        }

        msg.innerText = '注册中...';
        this.isAuthBusy = true;
        try {
            const result = await AuthService.register(username, password);
            if (result.success) {
                // Auto login logic reuse
                const loginRes = await AuthService.login(username, password);
                if (loginRes.success) {
                    // 使用统一的成功处理逻辑，这会自动将本地旧存档上传到新注册的空账号中
                    await this.onLoginSuccess(msg, '注册成功！已绑定旧存档');
                }
            } else {
                if (result.error && result.error.code === 202) {
                    msg.innerText = '该用户名已被使用，请换一个';
                } else {
                    msg.innerText = result.message || '注册失败';
                }
            }
        } finally {
            this.isAuthBusy = false;
        }
    }

    checkLoginStatus() {
        const btn = document.getElementById('login-btn');
        if (!btn) return;

        const cloudEnabled = !(AuthService.isCloudEnabled) || AuthService.isCloudEnabled();

        if (cloudEnabled && AuthService.isLoggedIn()) {
            const user = AuthService.getCurrentUser();
            // Change button to show name or Logout
            const username = user && user.username ? user.username : '已登录';
            btn.innerHTML = `
                <div class="talisman-paper"></div>
                <div class="talisman-content">
                    <span class="btn-icon">👤</span>
                    <span class="btn-text" style="font-size:0.8rem">${username}</span>
                </div>
            `;
            btn.onclick = () => {
                // Muted/Audio handling (delayed slightly for feel)
                setTimeout(() => {
                    this.showConfirmModal(
                        '确定要退出登录吗？\n(退出前将自动上传当前进度)',
                        async () => {
                            // 退出前强制尝试上传一次本地存档
                            const localSave = localStorage.getItem('theDefierSave');
                            // Fix: Check if we have a valid slot before syncing
                            if (localSave && this.currentSaveSlot !== null && this.currentSaveSlot !== undefined) {
                                try {
                                    const data = JSON.parse(localSave);
                                    await AuthService.saveCloudData(data, this.currentSaveSlot);
                                    console.log('Logout sync complete');
                                } catch (e) {
                                    console.error('Logout sync failed', e);
                                }
                            }

                            AuthService.logout();
                            this.checkLoginStatus();
                            location.reload();
                        }
                    );
                }, 50);
            };
        } else {
            btn.innerHTML = `
                    <div class="talisman-paper"></div>
                    <div class="talisman-content">
                        <span class="btn-icon">☁️</span>
                        <span class="btn-text">登入轮回</span>
                    </div>
                `;
            btn.onclick = () => this.showLoginModal();
            if (!cloudEnabled) {
                btn.innerHTML = `
                    <div class="talisman-paper"></div>
                    <div class="talisman-content">
                        <span class="btn-icon">☁️</span>
                        <span class="btn-text">离线模式</span>
                    </div>
                `;
                btn.onclick = () => {
                    Utils.showBattleLog('云存档未配置，当前为离线模式');
                };
            }
        }
    }

    async checkForCloudSave() {
        // 如果是刚刚手动加载的存档，跳过冲突检测，并清除标记
        if (sessionStorage.getItem('justLoadedSave') === 'true') {
            sessionStorage.removeItem('justLoadedSave');
            console.log('Skipping conflict check (Manual load)');
            return;
        }

        // This is now handled within handleLogin's flow logic, but kept as fallback or for manual checks
        const res = await AuthService.getCloudData();
        if (res.success && Array.isArray(res.slots)) {
            const cloudData = res.slots[this.currentSaveSlot || 0];
            const cloudTime = res.serverTime ? new Date(res.serverTime).toLocaleString() : '未知时间';
            // If we are strictly checking, we might want to show the full modal
            const localSave = localStorage.getItem('theDefierSave');
            let localData = null;
            if (localSave) { try { localData = JSON.parse(localSave); } catch (e) { } }

            this.showSaveConflictModal(localData, cloudData, res.serverTime);
        }
    }

    // 显示存档冲突弹窗
    showSaveConflictModal(localData, cloudData, cloudTime) {
        const modal = document.getElementById('save-conflict-modal');
        if (!modal) return;

        // Populate Info
        const localInfo = document.getElementById('local-save-info');
        const cloudInfo = document.getElementById('cloud-save-info');

        const formatInfo = (data, time) => {
            if (!data) return '无数据';
            const date = time ? new Date(time).toLocaleString() : (data.timestamp ? new Date(data.timestamp).toLocaleString() : '未知时间');
            const realm = (data.player && data.player.realm) ? data.player.realm : '?';
            const hp = (data.player && data.player.currentHp) ? data.player.currentHp : '?';
            const gold = (data.player && data.player.gold) ? data.player.gold : '?';
            return `
                    <div style="margin-bottom:4px">📅 ${date}</div>
                <div style="margin-bottom:4px">🏔️ 第 ${realm} 重天</div>
                <div>❤️ ${hp} | 💰 ${gold}</div>
                `;
        };

        if (localInfo) localInfo.innerHTML = formatInfo(localData, localData ? localData.timestamp : null);
        if (cloudInfo) cloudInfo.innerHTML = formatInfo(cloudData, cloudTime);

        // Store temp data
        this.tempCloudData = cloudData;

        modal.classList.add('active');
    }

    // 解决存档冲突
    resolveSaveConflict(choice) {
        const modal = document.getElementById('save-conflict-modal');
        if (choice === 'local') {
            // Keep Local -> Upload to Cloud
            const localSave = localStorage.getItem('theDefierSave');
            if (localSave) {
                try {
                    const data = JSON.parse(localSave);
                    const targetSlot = Number.isInteger(this.currentSaveSlot) ? this.currentSaveSlot : 0;

                    if (targetSlot === undefined || targetSlot === null) {
                        alert('错误：无法确定存档位，请先进入游戏选择存档位后再尝试同步。');
                        return;
                    }

                    AuthService.saveCloudData(data, targetSlot).then(res => {
                        if (res.success) {
                            Utils.showBattleLog(`本地存档已覆盖云端！(Slot ${targetSlot + 1})`);
                            modal.classList.remove('active');
                            // Update cache
                            if (this.cachedSlots) this.cachedSlots[targetSlot] = data;
                        } else {
                            alert('云端同步失败：' + (res.message || '未知错误'));
                        }
                    });
                } catch (e) {
                    console.error('Resolve conflict error:', e);
                    alert('存档数据异常，无法上传');
                }
            }
        } else if (choice === 'cloud') {
            // Keep Cloud -> Overwrite Local
            if (this.tempCloudData) {
                localStorage.setItem('theDefierSave', JSON.stringify(this.tempCloudData));
                alert('已从云端恢复存档！');
                modal.classList.remove('active');
                window.location.reload(); // Reload to apply
            } else {
                alert('云端数据读取异常');
            }
        }
    }

    // 加载云端存档 (无本地时)
    // 加载云端存档 (Legacy -> Redirect to Slots)
    loadCloudGame() {
        AuthService.getCloudData().then(res => {
            const slot = Number.isInteger(this.currentSaveSlot) ? this.currentSaveSlot : 0;
            if (res.success && Array.isArray(res.slots) && res.slots[slot]) {
                localStorage.setItem('theDefierSave', JSON.stringify(res.slots[slot]));
                Utils.showBattleLog('已拉取云端存档');
                setTimeout(() => window.location.reload(), 500);
            }
        });
    }

    // 打开法宝囊
    showTreasureBag() {
        // 创建或获取法宝囊模态框
        let modal = document.getElementById('treasure-bag-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'treasure-bag-modal';
            modal.className = 'modal treasure-bag-modal';
            modal.innerHTML = `
            <div class="modal-content large-modal">
                    <span class="close-btn">&times;</span>
                    <h2>🎒 法宝囊</h2>
                    
                    <div class="treasure-bag-layout">
                        <!-- 左侧：已装备 -->
                        <div class="equipped-section">
                            <h3>已装备法宝 <span id="equipped-count">0/2</span></h3>
                            <div class="equipped-grid" id="equipped-grid"></div>
                            <div class="slot-info">突破境界可解锁更多槽位</div>
                        </div>

                        <!-- 右侧：仓库 -->
                        <div class="inventory-section">
                            <h3>法宝仓库</h3>
                            <div class="inventory-grid" id="inventory-grid"></div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // 绑定关闭
            const closeBtn = modal.querySelector('.close-btn');
            closeBtn.onclick = () => {
                modal.style.display = 'none';
                if (this.currentScreen === 'map-screen') {
                    this.updateMapUI(); // 刷新地图上的法宝显示
                }
            };

            // 点击背景关闭
            modal.onclick = (e) => {
                if (e.target === modal) modal.style.display = 'none';
            };
        }

        modal.style.display = 'flex';
        this.updateTreasureBagUI();
    }

    // 更新法宝囊界面
    updateTreasureBagUI() {
        const modal = document.getElementById('treasure-bag-modal');
        if (!modal || modal.style.display === 'none') return;

        const maxSlots = this.player.getMaxTreasureSlots();
        const equippedCountObj = document.getElementById('equipped-count');
        if (equippedCountObj) {
            equippedCountObj.innerText = `${this.player.equippedTreasures.length}/${maxSlots}`;
        }

        const equippedGrid = document.getElementById('equipped-grid');
        const inventoryGrid = document.getElementById('inventory-grid');

        equippedGrid.innerHTML = '';
        inventoryGrid.innerHTML = '';

        // 渲染装备槽
        for (let i = 0; i < maxSlots; i++) {
            const treasure = this.player.equippedTreasures[i];
            const slot = document.createElement('div');
            slot.className = 'treasure-slot';

            if (treasure) {
                const icon = treasure.icon || '📦';
                const name = treasure.name || treasure.id;
                const desc = treasure.description || (treasure.getDesc ? treasure.getDesc(this.player) : '');
                const shortDesc = desc.length > 25 ? desc.substring(0, 25) + '...' : desc;
                const rarityLabel = this.getRarityLabel(treasure.rarity || 'common');

                slot.className += ' filled rarity-' + (treasure.rarity || 'common');
                slot.innerHTML = `
                    <div class="t-icon">${icon}</div>
                    <div class="t-name">${name}</div>
                    <div class="t-rarity" style="font-size:0.7rem; margin-bottom:2px;">${rarityLabel}</div>
                    <div class="t-effect">${shortDesc}</div>
                    <button class="unequip-btn">卸下</button>
                `;

                // Click to view, btn to unequip
                slot.onclick = (e) => {
                    if (e.target.className === 'unequip-btn') {
                        e.stopPropagation();
                        this.player.unequipTreasure(treasure.id);
                        if (typeof audioManager !== 'undefined') audioManager.playSFX('click');
                        this.updateTreasureBagUI();
                    } else {
                        // Show full info
                        this.showAlertModal(desc, name);
                    }
                };

                // Add right-click to view details
                slot.oncontextmenu = (e) => {
                    e.preventDefault();
                    this.showAlertModal(desc, name);
                };
            } else {
                slot.className += ' empty';
                slot.innerHTML = '<div class="empty-text">空闲槽位</div>';
            }
            equippedGrid.appendChild(slot);
        }

        // 渲染仓库
        // 过滤掉已装备的
        let inventory = this.player.collectedTreasures.filter(t => !this.player.isTreasureEquipped(t.id));

        // 排序：按品质高到低 (仙品 > 神品 > 灵品 > 凡品)
        const rarityWeights = { 'mythic': 4, 'legendary': 3, 'rare': 2, 'common': 1 };
        inventory.sort((a, b) => {
            const wA = rarityWeights[a.rarity || 'common'] || 1;
            const wB = rarityWeights[b.rarity || 'common'] || 1;
            return wB - wA;
        });

        if (inventory.length === 0) {
            inventoryGrid.innerHTML = '<div class="empty-inventory">暂无闲置法宝</div>';
        } else {
            inventory.forEach(t => {
                // 确保图标存在，如果不存在则使用默认
                const icon = t.icon || '📦';
                const name = t.name || t.id;
                const desc = t.description || (t.getDesc ? t.getDesc(this.player) : '未知效果');
                const rarityLabel = this.getRarityLabel(t.rarity || 'common');

                const el = document.createElement('div');
                el.className = `inventory-item rarity-${t.rarity || 'common'}`;
                el.innerHTML = `
                    <div class="t-icon">${icon}</div>
                    <div class="t-name">${name}</div>
                    <div class="t-rarity" style="font-size:0.7rem; margin-bottom:2px;">${rarityLabel}</div>
                    <div class="t-effect">${desc}</div>
                `;
                el.title = `${name}: ${desc}`;

                el.onclick = (e) => {
                    // Left click to equip
                    if (this.player.equipTreasure(t.id)) {
                        if (typeof audioManager !== 'undefined') audioManager.playSFX('equip');
                        this.updateTreasureBagUI();
                    } else {
                        // 装备失败（满）
                        if (this.player.equippedTreasures.length >= maxSlots) {
                            this.showAlertModal(`⚠️ 法宝槽位已满！请先卸下其他法宝。`, '无法装备');
                        }
                    }
                };

                // Right click to view details - 使用 addEventListener 确保绑定成功
                el.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation(); // 防止冒泡
                    this.showAlertModal(desc, name);
                    return false;
                });

                inventoryGrid.appendChild(el);
            });
        }
    }

    // 获取法宝获取途径
    getTreasureSource(t) {
        // 特殊法宝的详细来源
        const specificSources = {
            // 普通法宝
            'vitality_stone': '商店购买 (第1重起) · 精英敌人掉落',
            'sharp_whetstone': '商店购买 (第1重起) · 普通敌人掉落',
            'pressure_talisman': '商店购买 (第1重起) · 击败山寨头目掉落',
            'soul_jade': '商店购买 (第1重起) · 击败妖狼王掉落',
            'qi_gourd': '商店购买 (第1重起) · 奇遇事件奖励',
            'spirit_stone': '商店购买 (第1重起) · 营地供奉获得',
            'blood_orb': '商店购买 (第2重起) · 精英敌人掉落',
            'iron_talisman': '商店购买 (第1重起) · 普通敌人掉落',

            // 稀有法宝
            'soul_banner': '商店购买 (第2重起) · 精英敌人掉落',
            'spirit_bead': '商店购买 (第2重起) · 奇遇事件奖励',
            'ice_spirit_bead': '第3重商店解锁 · 击败丹尊掉落 · 第10重Boss掉落',
            'heart_mirror': '商店购买 (第2重起) · 击败仙门长老掉落',
            'seal_soul_bead': '第4重商店解锁 · 击败上古遗灵掉落',
            'space_anchor': '第5重商店解锁 · 击败化神大能掉落',
            'wind_bead': '第10重商店解锁 · 击败风暴唤灵者掉落',
            'ward_jade': '商店购买 (第2重起) · 精英毒蛇敌人掉落',
            'diamond_amulet': '第3重商店解锁 · 奇遇事件奖励',
            'phoenix_feather': '第3重商店解锁 · 火焰地带奇遇',
            'tortoise_shell': '第4重商店解锁 · 击败精英敌人',

            // 传说法宝
            'flying_dagger': '第5重商店解锁 · Boss首杀奖励',
            'yin_yang_mirror': '第6重商店解锁 · 奇遇事件奖励',
            'void_mirror': '第11重商店解锁 · 击败三首金龙掉落',
            'soul_severing_blade': '第14重商店解锁 · 击败虚空吞噬者掉落',
            'spirit_turtle_shell': '第6重商店解锁 · 击败合体天尊掉落',
            'cloud_boots': '第7重商店解锁 · 击败大乘至尊掉落',
            'thunder_ward': '第8重商店解锁 · 击败飞升主宰掉落 · 雷劫奇遇',
            'truth_mirror': '第12重商店解锁 · 击败心魔镜像掉落',
            'clarity_bead': '第13重商店解锁 · 击败混沌之眼掉落',
            'nine_sword_case': '第9重商店解锁 · 剑冢奇遇事件',

            // 神话法宝
            'stabilizer_pin': '第16重商店解锁 · 击败因果裁决者掉落 · 隐藏成就奖励',
            'five_element_bead': '第15重商店解锁 · 击败五行长老掉落',
            'karma_wheel': '第16重商店解锁 · 击败因果裁决者掉落',
            'heaven_shard': '仅第17-18重 · 击败天道终焉掉落 · 终极挑战奖励'
        };

        if (specificSources[t.id]) {
            return specificSources[t.id];
        }

        // 通用稀有度判断（fallback）
        const unlockRealm = TREASURE_CONFIG?.unlockRealm?.[t.id] || 1;
        switch (t.rarity) {
            case 'common': return `商店购买 (第${unlockRealm}重起) · 普通/精英敌人掉落`;
            case 'rare': return `商店购买 (第${unlockRealm}重起) · 精英/Boss敌人掉落`;
            case 'legendary': return `第${unlockRealm}重商店解锁 · Boss首杀奖励 · 奇遇事件`;
            case 'mythic': return `第${unlockRealm}重解锁 · Boss掉落 · 隐藏挑战奖励`;
            default: return '未知来源';
        }
    }

    // --- 新增：加权随机获取未拥有法宝 ---
    getWeightedRandomTreasure() {
        // 1. 确定当前层级的稀有度权重
        const realm = this.player.realm || 1;
        let weights = { common: 100, rare: 0, legendary: 0, mythic: 0 };

        if (realm <= 3) {
            weights = { common: 90, rare: 9, legendary: 1, mythic: 0 };
        } else if (realm <= 6) {
            weights = { common: 60, rare: 35, legendary: 5, mythic: 0 };
        } else if (realm <= 10) {
            weights = { common: 30, rare: 50, legendary: 19, mythic: 1 };
        } else {
            weights = { common: 10, rare: 40, legendary: 45, mythic: 5 };
        }

        // 2. 筛选未拥有的法宝
        const unowned = Object.keys(TREASURES)
            .map(k => TREASURES[k])
            .filter(t => !this.player.hasTreasure(t.id));

        if (unowned.length === 0) return null;

        // 3. 尝试按权重抽取稀有度
        const roll = Math.random() * 100;
        let targetRarity = 'common';
        let cumulative = 0;

        if ((cumulative += weights.common) > roll) targetRarity = 'common';
        else if ((cumulative += weights.rare) > roll) targetRarity = 'rare';
        else if ((cumulative += weights.legendary) > roll) targetRarity = 'legendary';
        else targetRarity = 'mythic';

        // 4. 在该稀有度中随机选择
        let candidates = unowned.filter(t => (t.rarity || 'common') === targetRarity);

        // 如果该稀有度没有未获得的（或者根本没定义该稀有度的法宝），回退到全局随机
        if (candidates.length === 0) {
            return unowned[Math.floor(Math.random() * unowned.length)];
        }

        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    // 辅助：获取品质名称和颜色
    getRarityLabel(rarity) {
        switch (rarity) {
            case 'common': return '<span style="color:#9e9e9e">【凡品】</span>';
            case 'rare': return '<span style="color:#4fc3f7">【灵品】</span>';
            case 'legendary': return '<span style="color:#e040fb">【神品】</span>'; // Legendary -> Mythic (Purple)
            case 'mythic': return '<span style="color:#ffab00">【仙品】</span>';    // Mythic -> Immortal (Orange)
            default: return '<span style="color:#9e9e9e">【凡品】</span>';
        }
    }

    // 显示法宝图鉴 (重构版)
    showTreasureCompendium() {
        this.showScreen('treasure-compendium');

        const grid = document.getElementById('treasure-compendium-grid');
        const statsEl = document.getElementById('treasure-compendium-stats');
        const filterSelect = document.getElementById('treasure-filter-select');
        const sortSelect = document.getElementById('treasure-sort-select');
        if (!grid) return;

        const filterState = this.getTreasureCompendiumFilterState();
        this.treasureCompendiumFilter = this.getTreasureCompendiumQuickFilterValue();
        this.treasureCompendiumSort = this.treasureCompendiumSort || 'rarity_desc';
        if (filterSelect) filterSelect.value = this.treasureCompendiumFilter;
        if (sortSelect) sortSelect.value = this.treasureCompendiumSort;
        [0, 1, 2].forEach((slot) => {
            const applyBtn = document.getElementById(`treasure-preset-slot-${slot}`);
            const saveBtn = document.getElementById(`treasure-preset-save-${slot}`);
            if (applyBtn) {
                applyBtn.textContent = this.getTreasureCompendiumPresetLabel(slot);
                applyBtn.classList.toggle('active', this.isTreasureCompendiumPresetActive(slot));
                applyBtn.title = this.getTreasureCompendiumPresetLabel(slot);
            }
            if (saveBtn) saveBtn.title = `保存到${slot + 1}号预设`;
        });

        document.querySelectorAll('#treasure-compendium [data-filter-chip-group]').forEach((chip) => {
            const group = chip.dataset.filterChipGroup;
            const value = chip.dataset.filterChipValue;
            const active = group === 'status'
                ? filterState.status === value
                : (group === 'rarity'
                    ? filterState.rarities.includes(value)
                    : filterState.sources.includes(value));
            chip.classList.toggle('active', active);
        });

        grid.innerHTML = '';
        if (statsEl) statsEl.innerHTML = '';

        let allTreasures = [];
        let ownedCount = 0;

        for (const tid in TREASURES) {
            const t = TREASURES[tid];
            const isOwned = this.player.hasTreasure(tid);
            if (isOwned) ownedCount++;
            allTreasures.push({ id: tid, data: t, isOwned });
        }

        const filteredTreasures = this.sortTreasureCompendiumItems(allTreasures.filter((item) => this.passesTreasureCompendiumFilter(item)));

        filteredTreasures.forEach((item) => {
            const t = item.data;
            const isOwned = item.isOwned;
            const rarity = t.rarity || 'common';
            const el = document.createElement('div');
            el.className = `compendium-item rarity-${rarity} ${isOwned ? 'unlocked' : 'locked'}`;
            const icon = t.icon || '📦';
            const name = t.name;
            el.innerHTML = `
                <div class="compendium-item-inner">
                    <div class="compendium-icon ${isOwned ? '' : 'locked'}">${icon}</div>
                    <div class="compendium-name ${isOwned ? '' : 'locked'}">${name}</div>
                </div>
            `;
            el.onclick = () => { this.showTreasureDetail(t, isOwned); };
            grid.appendChild(el);
        });

        if (statsEl) {
            statsEl.innerHTML = `
                <span class="stat-icon">🎒</span>
                <span class="stat-text">法宝收藏进度: <span style="color:var(--accent-gold); font-weight:bold;">${ownedCount}</span> / ${allTreasures.length}</span>
            `;
        }

        const summaryEl = document.getElementById('treasure-compendium-summary');
        const rarityEl = document.getElementById('treasure-compendium-rarity');
        const progress = allTreasures.length > 0 ? Math.round((ownedCount / allTreasures.length) * 100) : 0;
        const rarityOrder = ['common', 'rare', 'legendary', 'mythic'];
        const rarityNameMap = { common: '凡品', rare: '灵品', legendary: '神品', mythic: '仙品' };
        const sortLabelMap = { rarity_desc: '品质优先', owned_first: '已收录优先', realm_asc: '解锁层数优先', name_asc: '名称排序' };
        const activeFilterLabels = this.getTreasureCompendiumFilterLabels();
        const rarityCounts = rarityOrder.map((rarity) => {
            const total = allTreasures.filter((item) => (item.data.rarity || 'common') === rarity).length;
            const owned = allTreasures.filter((item) => (item.data.rarity || 'common') === rarity && item.isOwned).length;
            return { rarity, total, owned };
        });

        if (summaryEl) {
            summaryEl.innerHTML = [
                '<span class="codex-side-kicker">藏品总览</span>',
                '<h3>法宝收藏进度</h3>',
                `<div class="codex-summary-metric"><strong>${ownedCount}</strong><span>/ ${allTreasures.length} 已收录</span></div>`,
                `<div class="codex-progress-track"><div class="codex-progress-fill" style="width:${progress}%"></div></div>`,
                '<ul class="codex-side-list compact">',
                `<li>当前筛选结果 ${filteredTreasures.length} 件 · 条件 ${activeFilterLabels.length > 0 ? activeFilterLabels.join(' / ') : '全部法宝'} / 排序 ${sortLabelMap[this.treasureCompendiumSort] || this.treasureCompendiumSort}。</li>`,
                '<li>点击主区任意法宝即可查看来源、逸闻与持有状态。</li>',
                '</ul>'
            ].join('');
        }

        if (rarityEl) {
            rarityEl.innerHTML = [
                '<span class="codex-side-kicker">稀有度分布</span>',
                '<h3>稀有度概览</h3>',
                '<div class="codex-summary-grid">',
                ...rarityCounts.map((entry) => `<div class="codex-summary-chip rarity-${entry.rarity}"><strong>${entry.owned}/${entry.total}</strong><span>${rarityNameMap[entry.rarity]}</span></div>`),
                '</div>',
                '<p class="codex-side-note">顶部 quick filter 可快速切换，下面多选 chip 可叠加来源与稀有度条件。</p>'
            ].join('');
        }
    }

    // 显示法宝详情 (新版)
    showTreasureDetail(treasure, isUnlocked) {
        const modal = document.getElementById('treasure-detail-modal');
        if (!modal) return;

        const elIcon = document.getElementById('detail-icon');
        const elName = document.getElementById('detail-name');
        const elRarity = document.getElementById('detail-rarity');
        const elDesc = document.getElementById('detail-desc');
        const elLore = document.getElementById('detail-lore');
        const elSource = document.getElementById('detail-source');
        const elOwnedState = document.getElementById('detail-owned-state');
        const header = modal.querySelector('.detail-header');

        if (!elIcon || !elName) return;

        header.className = 'detail-header';
        if (elOwnedState) elOwnedState.className = 'detail-status-chip';

        const rarity = treasure.rarity || 'common';
        const rarityLabel = this.getRarityLabel(rarity);

        header.classList.add(`rarity-${rarity}`);
        elIcon.textContent = treasure.icon || '📦';
        elName.textContent = treasure.name;
        elRarity.innerHTML = rarityLabel;

        let desc = treasure.description;
        try {
            if (treasure.getDesc) desc = treasure.getDesc(this.player);
        } catch (e) {
            console.warn('Desc gen failed', e);
        }
        desc = desc.replace(/([\d.]+|[+\-]\d+%?)/g, '<span style="color:#ffb74d;">$1</span>');
        elDesc.innerHTML = desc;

        elLore.textContent = treasure.lore || '（此物似乎蕴含着某种未知的力量...）';
        elLore.style.visibility = 'visible';

        const source = this.getTreasureSource(treasure);
        elSource.innerHTML = source;

        if (!isUnlocked) {
            elIcon.style.filter = 'grayscale(1) brightness(0.7)';
            elName.style.color = '#888';
            elRarity.innerHTML += ' <span style="font-size:0.8em; color:#666">(未获取)</span>';
            if (elOwnedState) {
                elOwnedState.textContent = '未收录';
                elOwnedState.classList.add('locked');
            }
        } else {
            elIcon.style.filter = '';
            elName.style.color = '';
            if (elOwnedState) {
                elOwnedState.textContent = '已收录';
                elOwnedState.classList.add('owned');
            }
        }

        modal.classList.add('active');

        if (typeof audioManager !== 'undefined') {
            audioManager.playSFX('click');
        }
    }
}

// 全局游戏实例
window.game = null;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('Initializing Game...');
        if (window.game) {
            console.warn('Game instance already exists, skip duplicate init.');
            return;
        }
        window.game = new Game();
        console.log('Game Initialized:', window.game);
    } catch (error) {
        console.error('Game Initialization Failed:', error);
        Utils.showBattleLog('游戏初始化失败，请检查控制台');
        alert('游戏初始化失败: ' + error.message);
    }
});
