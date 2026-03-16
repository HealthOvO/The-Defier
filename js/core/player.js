/**
 * The Defier - 玩家系统
 */

class Player {
    constructor() {
        this.reset();
    }

    reset(characterId = 'linFeng') {
        const charData = CHARACTERS[characterId] || CHARACTERS['linFeng'];
        this.characterId = characterId;

        // 基础属性
        this.maxHp = charData.stats.maxHp;
        this.currentHp = this.maxHp;
        this.block = 0;
        this.gold = charData.stats.gold;
        this.heavenlyInsight = 1;
        this.karma = 0;
        this.shopRumors = {
            rewardRareCharges: 0,
            rewardRareBonus: 0,
            treasureCharges: 0,
            treasureChanceBonus: 0,
            nextRealmMapShift: null,
            nextRealmLabel: '',
            nextRealmTarget: null,
            history: []
        };

        // 战斗属性
        this.baseEnergy = charData.stats.energy;
        this.currentEnergy = this.baseEnergy;
        this.drawCount = 5;

        // 奶糖 (Milk Candy) - 抽牌资源
        this.milkCandy = 0;
        this.maxMilkCandy = 3; // 初始上限
        this.ringResonanceSkillDrawUsedThisTurn = false;
        this.relicSkillDrawUsedThisTurn = false;
        this.ringConvergenceAttackBoostUsedThisTurn = false;
        this.relicAttackEnergyUsedThisTurn = false;
        this.pathDoctrineSkillChainCountThisTurn = 0;
        this.pathDoctrineSkillChainDrawUsedThisTurn = false;

        // 主动技能
        this.activeSkill = null;
        this.skillLevel = 0; // 0=Locked, 1=Unlocked, 2=Upgraded, 3=Max
        this.skillCooldown = 0;
        this.maxCooldown = 0;

        if (charData.activeSkillId && typeof SKILLS !== 'undefined' && SKILLS[charData.activeSkillId]) {
            this.activeSkill = SKILLS[charData.activeSkillId];
            this.skillLevel = 0; // Default Locked
            this.maxCooldown = this.activeSkill.cooldown;

            // Debug: If realm is already high (e.g. loaded game), check unlock immediately
            // But reset happens before load. Load will overwrite this.
        }

        // 牌组
        this.deck = [];
        this.hand = [];
        this.drawPile = [];
        this.discardPile = [];
        this.exhaustPile = [];

        // Map Persistence (Per-Realm State)
        this.realmMaps = {};

        // 状态
        this.buffs = {};
        this.stance = 'neutral';

        // 永久属性加成 (来自事件)
        this.permaBuffs = {
            maxHp: 0,
            energy: 0,
            draw: 0,
            strength: 0,
            defense: 0
        };
        this.legacyBonuses = {
            startMaxHp: 0,
            startGold: 0,
            startDraw: 0,
            firstTurnDrawBonus: 0,
            forgeCostDiscount: 0
        };
        this.legacyRunDoctrine = {
            presetId: null,
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
        this.legacyRunMission = null;
        this.adventureBuffs = {
            firstTurnDrawBoostBattles: 0,
            openingBlockBoostBattles: 0,
            victoryGoldBoostBattles: 0,
            firstTurnEnergyBoostBattles: 0,
            ringExpBoostBattles: 0,
            victoryHealBoostBattles: 0
        };
        this.runPath = null;
        this.runPathProgress = null;
        this.runPathMutationState = null;
        this.runPathBattleState = {
            firstAttackBonusUsed: false,
            firstSkillDrawUsedThisTurn: false
        };
        this.runDestiny = null;
        this.runDestinyBattleState = {
            firstAttackBonusUsed: false,
            firstSkillDrawUsedThisTurn: false,
            firstBlockBonusUsed: false,
            firstTurnBonusApplied: false
        };
        this.runVows = [];
        this.runVowBattleState = {
            firstAttackBonusUsed: false,
            firstTurnBonusApplied: false,
            firstExhaustDrawUsedThisTurn: false
        };
        this.spiritCompanion = null;
        this.spiritCompanionBattleState = {
            charge: 0,
            firstSkillDrawUsedThisTurn: false,
            firstBlockBonusUsedThisTurn: false,
            onLoseHpPulseUsedThisTurn: false,
            nthCardPassiveProcCount: 0
        };

        // 遗物
        this.relic = charData.relic;

        // 法宝
        // 法宝
        this.collectedTreasures = []; // 所有拥有的法宝
        this.equippedTreasures = [];  // 当前装备的法宝
        this.treasures = this.equippedTreasures; // 兼容旧引用的Alias

        this.timeStopTriggered = false; // Reset time stop cheat death per battle (via reset)
        this.resurrectCount = 0;
        this.maxRealmReached = 1; // Track highest realm reached

        // 命环
        if (typeof MutatedRing !== 'undefined' && characterId === 'linFeng') {
            this.fateRing = new MutatedRing(this);
        } else if (typeof SealedRing !== 'undefined' && characterId === 'xiangYe') {
            this.fateRing = new SealedRing(this);
        } else if (typeof KarmaRing !== 'undefined' && characterId === 'wuYu') {
            this.fateRing = new KarmaRing(this);
        } else if (typeof AnalysisRing !== 'undefined' && characterId === 'yanHan') {
            this.fateRing = new AnalysisRing(this);
        } else if (typeof FateRing !== 'undefined') {
            this.fateRing = new FateRing(this);
        } else {
            // Fallback if class not loaded yet
            this.fateRing = {
                level: 0,
                name: '残缺印记',
                exp: 0,
                slots: 0,
                loadedLaws: [],
                path: 'crippled',
                unlockedPaths: ['crippled']
            };
        }

        // 收集的法则
        this.collectedLaws = [];

        // 激活的共鸣
        this.activeResonances = [];
        this.archetypeResonance = null;

        // 游戏进度
        this.realm = 1;
        this.floor = 0;
        this.enemiesDefeated = 0;
        this.lawsCollected = 0;

        // 初始化牌组
        this.initializeDeck(charData.deck);

        // 初始化技能
        if (charData.activeSkillId) {
            this.initSkill(charData.activeSkillId);
        }
    }

    normalizeRunDestiny(runDestiny = this.runDestiny) {
        if (!runDestiny || typeof runDestiny !== 'object') {
            this.runDestiny = null;
            return null;
        }
        const id = typeof runDestiny.id === 'string' ? runDestiny.id : '';
        const catalog = (typeof RUN_DESTINIES !== 'undefined' && RUN_DESTINIES && typeof RUN_DESTINIES === 'object')
            ? RUN_DESTINIES
            : null;
        if (!catalog || !catalog[id]) {
            this.runDestiny = null;
            return null;
        }
        const tier = Math.max(1, Math.floor(Number(runDestiny.tier) || 1));
        this.runDestiny = { id, tier };
        return this.runDestiny;
    }

    setRunDestiny(destinyId, tier = 1) {
        const id = typeof destinyId === 'string' ? destinyId : '';
        const catalog = (typeof RUN_DESTINIES !== 'undefined' && RUN_DESTINIES && typeof RUN_DESTINIES === 'object')
            ? RUN_DESTINIES
            : null;
        if (!catalog || !catalog[id]) {
            this.runDestiny = null;
            return null;
        }
        this.runDestiny = {
            id,
            tier: Math.max(1, Math.floor(Number(tier) || 1))
        };
        return this.getRunDestinyMeta();
    }

    normalizeRunPath(runPath = this.runPath) {
        const catalog = (typeof RUN_PATHS !== 'undefined' && RUN_PATHS && typeof RUN_PATHS === 'object')
            ? RUN_PATHS
            : null;
        if (!catalog || !runPath || typeof runPath !== 'object') {
            this.runPath = null;
            this.runPathProgress = null;
            this.runPathMutationState = null;
            return null;
        }
        const id = typeof runPath.id === 'string' ? runPath.id : '';
        if (!catalog[id]) {
            this.runPath = null;
            this.runPathProgress = null;
            this.runPathMutationState = null;
            return null;
        }
        this.runPath = { id };
        return this.runPath;
    }

    setRunPath(pathId) {
        const id = typeof pathId === 'string' ? pathId : '';
        const catalog = (typeof RUN_PATHS !== 'undefined' && RUN_PATHS && typeof RUN_PATHS === 'object')
            ? RUN_PATHS
            : null;
        if (!catalog || !catalog[id]) {
            this.runPath = null;
            this.runPathProgress = null;
            this.runPathMutationState = null;
            return null;
        }
        this.runPath = { id };
        this.runPathProgress = {
            pathId: id,
            currentPhaseIndex: 0,
            phaseProgress: 0,
            completedPhases: [],
            rewardHistory: [],
            completed: false,
            lastRewardText: ''
        };
        this.runPathMutationState = null;
        return this.getRunPathMeta();
    }

    normalizeRunPathMutationState(runPathMutationState = this.runPathMutationState) {
        const runPath = this.normalizeRunPath(this.runPath);
        const base = runPath && typeof RUN_PATHS !== 'undefined' && RUN_PATHS
            ? RUN_PATHS[runPath.id] || null
            : null;
        const mutations = base && base.mutations && typeof base.mutations === 'object'
            ? base.mutations
            : null;
        if (!runPath || !mutations || !runPathMutationState || typeof runPathMutationState !== 'object') {
            this.runPathMutationState = null;
            return null;
        }
        const mutationId = typeof runPathMutationState.mutationId === 'string'
            ? runPathMutationState.mutationId
            : '';
        if (!mutationId || !mutations[mutationId]) {
            this.runPathMutationState = null;
            return null;
        }
        this.runPathMutationState = {
            pathId: runPath.id,
            mutationId,
            offeredAtRealm: Math.max(0, Math.floor(Number(runPathMutationState.offeredAtRealm) || 0)),
            chosenAt: Math.max(0, Math.floor(Number(runPathMutationState.chosenAt) || 0))
        };
        return this.runPathMutationState;
    }

    getRunPathMutationMeta() {
        const runPath = this.normalizeRunPath(this.runPath);
        const mutationState = this.normalizeRunPathMutationState();
        if (!runPath || !mutationState || mutationState.pathId !== runPath.id) return null;
        const base = (typeof RUN_PATHS !== 'undefined' && RUN_PATHS && RUN_PATHS[runPath.id]) ? RUN_PATHS[runPath.id] : null;
        const mutation = base && base.mutations && mutationState.mutationId ? base.mutations[mutationState.mutationId] : null;
        if (!mutation) return null;
        return {
            id: mutation.id || mutationState.mutationId,
            mutationId: mutationState.mutationId,
            pathId: runPath.id,
            branchLabel: mutation.branchLabel || '裂变',
            name: mutation.name || mutationState.mutationId,
            icon: mutation.icon || '✦',
            summary: mutation.summary || '',
            risk: mutation.risk || '',
            routeHint: mutation.routeHint || '',
            playstyle: mutation.playstyle || '',
            trackerNote: mutation.trackerNote || '',
            mutationEventPool: Array.isArray(mutation.mutationEventPool)
                ? mutation.mutationEventPool.map((eventId) => String(eventId || '').trim()).filter(Boolean).slice(0, 3)
                : [],
            effects: mutation.effects && typeof mutation.effects === 'object'
                ? JSON.parse(JSON.stringify(mutation.effects))
                : {},
            immediate: mutation.immediate && typeof mutation.immediate === 'object'
                ? JSON.parse(JSON.stringify(mutation.immediate))
                : {},
            treasureSynergy: mutation.treasureSynergy && typeof mutation.treasureSynergy === 'object'
                ? JSON.parse(JSON.stringify(mutation.treasureSynergy))
                : null,
            offeredAtRealm: mutationState.offeredAtRealm,
            chosenAt: mutationState.chosenAt
        };
    }

    ensureRunPathProgress() {
        const runPath = this.normalizeRunPath();
        if (!runPath) {
            this.runPathProgress = null;
            return null;
        }
        const base = (typeof RUN_PATHS !== 'undefined' && RUN_PATHS && RUN_PATHS[runPath.id]) ? RUN_PATHS[runPath.id] : null;
        if (!base) {
            this.runPathProgress = null;
            return null;
        }
        const phaseCount = Array.isArray(base.phases) ? base.phases.length : 0;
        const progress = this.runPathProgress && typeof this.runPathProgress === 'object'
            ? this.runPathProgress
            : {};
        const normalized = {
            pathId: runPath.id,
            currentPhaseIndex: Math.max(0, Math.min(Math.max(phaseCount - 1, 0), Math.floor(Number(progress.currentPhaseIndex) || 0))),
            phaseProgress: Math.max(0, Math.floor(Number(progress.phaseProgress) || 0)),
            completedPhases: Array.isArray(progress.completedPhases)
                ? progress.completedPhases.map((entry) => String(entry || '')).filter(Boolean)
                : [],
            rewardHistory: Array.isArray(progress.rewardHistory)
                ? progress.rewardHistory.map((entry) => String(entry || '')).filter(Boolean).slice(0, 12)
                : [],
            completed: !!progress.completed,
            lastRewardText: String(progress.lastRewardText || '')
        };
        if (phaseCount <= 0) {
            normalized.currentPhaseIndex = 0;
            normalized.phaseProgress = 0;
            normalized.completed = true;
        } else if (normalized.completedPhases.length >= phaseCount) {
            normalized.completed = true;
            normalized.currentPhaseIndex = phaseCount - 1;
        }
        this.runPathProgress = normalized;
        return this.runPathProgress;
    }

    getRunPathMeta() {
        const runPath = this.normalizeRunPath();
        if (!runPath) return null;
        const base = (typeof RUN_PATHS !== 'undefined' && RUN_PATHS && RUN_PATHS[runPath.id]) ? RUN_PATHS[runPath.id] : null;
        if (!base) return null;
        const progress = this.ensureRunPathProgress();
        const mutationMeta = this.getRunPathMutationMeta();
        const phases = Array.isArray(base.phases) ? base.phases : [];
        const phaseIndex = Math.max(0, Math.min(Math.max(phases.length - 1, 0), Math.floor(Number(progress?.currentPhaseIndex) || 0)));
        const currentPhase = phases[phaseIndex] || null;
        const baseTreasureSynergy = base.treasureSynergy && typeof base.treasureSynergy === 'object'
            ? JSON.parse(JSON.stringify(base.treasureSynergy))
            : null;
        const mergedTreasureSynergy = baseTreasureSynergy
            ? {
                ...baseTreasureSynergy,
                favoredSets: Array.from(new Set([
                    ...(Array.isArray(baseTreasureSynergy.favoredSets) ? baseTreasureSynergy.favoredSets : []),
                    ...(Array.isArray(mutationMeta?.treasureSynergy?.favoredSets) ? mutationMeta.treasureSynergy.favoredSets : [])
                ])).slice(0, 4)
            }
            : (mutationMeta?.treasureSynergy ? JSON.parse(JSON.stringify(mutationMeta.treasureSynergy)) : null);
        if (mergedTreasureSynergy && mutationMeta?.treasureSynergy?.summary) {
            mergedTreasureSynergy.summary = mutationMeta.treasureSynergy.summary;
        }
        const mergedEffects = {
            ...(base.effects && typeof base.effects === 'object' ? JSON.parse(JSON.stringify(base.effects)) : {})
        };
        const mutationEffects = mutationMeta?.effects && typeof mutationMeta.effects === 'object'
            ? mutationMeta.effects
            : {};
        ['openingBlock', 'firstAttackBonusPerBattle', 'firstSkillDrawPerTurn'].forEach((key) => {
            mergedEffects[key] = Math.max(0, Number(mergedEffects[key] || 0) + Number(mutationEffects[key] || 0));
        });
        mergedEffects.mapWeightShift = {
            ...(mergedEffects.mapWeightShift && typeof mergedEffects.mapWeightShift === 'object' ? mergedEffects.mapWeightShift : {})
        };
        if (mutationEffects.mapWeightShift && typeof mutationEffects.mapWeightShift === 'object') {
            Object.keys(mutationEffects.mapWeightShift).forEach((key) => {
                const delta = Number(mutationEffects.mapWeightShift[key]);
                if (!Number.isFinite(delta)) return;
                mergedEffects.mapWeightShift[key] = Number(mergedEffects.mapWeightShift[key] || 0) + delta;
            });
        }
        const baseEventPool = Array.isArray(base.eventPool) ? base.eventPool.slice() : [];
        const mutationEventPool = Array.isArray(mutationMeta?.mutationEventPool)
            ? mutationMeta.mutationEventPool.map((eventId) => String(eventId || '').trim()).filter(Boolean).slice(0, 3)
            : [];
        const mergedEventPool = Array.from(new Set([
            ...baseEventPool,
            ...mutationEventPool
        ]));
        return {
            id: base.id,
            name: base.name || base.id,
            icon: base.icon || '✦',
            category: base.category || '命途',
            description: base.description || '',
            playstyle: mutationMeta?.playstyle || base.playstyle || '',
            routeHint: mutationMeta?.routeHint || base.routeHint || '',
            affinities: Array.isArray(base.affinities) ? base.affinities.slice() : [],
            eventPool: mergedEventPool,
            mutationEventPool,
            shopBias: base.shopBias && typeof base.shopBias === 'object'
                ? JSON.parse(JSON.stringify(base.shopBias))
                : null,
            treasureSynergy: mergedTreasureSynergy,
            bossCounterplay: base.bossCounterplay && typeof base.bossCounterplay === 'object'
                ? { ...base.bossCounterplay }
                : null,
            bossMatchups: base.bossMatchups && typeof base.bossMatchups === 'object'
                ? JSON.parse(JSON.stringify(base.bossMatchups))
                : null,
            mutations: base.mutations && typeof base.mutations === 'object'
                ? JSON.parse(JSON.stringify(base.mutations))
                : null,
            mutation: mutationMeta,
            completionRecord: base.completionRecord && typeof base.completionRecord === 'object'
                ? { ...base.completionRecord }
                : null,
            effects: mergedEffects,
            phases: phases.map((phase) => ({
                ...(phase || {}),
                rewards: Array.isArray(phase?.rewards) ? phase.rewards.map((reward) => ({ ...(reward || {}) })) : []
            })),
            phaseIndex,
            phaseCount: phases.length,
            currentPhase: currentPhase
                ? {
                    ...(currentPhase || {}),
                    rewards: Array.isArray(currentPhase.rewards) ? currentPhase.rewards.map((reward) => ({ ...(reward || {}) })) : []
                }
                : null,
            trackerNote: mutationMeta?.trackerNote || '',
            progress: progress ? {
                currentPhaseIndex: progress.currentPhaseIndex,
                phaseProgress: progress.phaseProgress,
                completedPhases: progress.completedPhases.slice(),
                rewardHistory: progress.rewardHistory.slice(),
                completed: !!progress.completed,
                lastRewardText: progress.lastRewardText || ''
            } : null
        };
    }

    getRunPathEffects() {
        const meta = this.getRunPathMeta();
        const effects = meta && meta.effects ? meta.effects : {};
        const result = {
            openingBlock: Math.max(0, Math.floor(Number(effects.openingBlock) || 0)),
            firstAttackBonusPerBattle: Math.max(0, Math.floor(Number(effects.firstAttackBonusPerBattle) || 0)),
            firstSkillDrawPerTurn: Math.max(0, Math.floor(Number(effects.firstSkillDrawPerTurn) || 0)),
            mapWeightShift: {}
        };
        if (effects.mapWeightShift && typeof effects.mapWeightShift === 'object') {
            Object.keys(effects.mapWeightShift).forEach((key) => {
                const delta = Number(effects.mapWeightShift[key]);
                if (!Number.isFinite(delta)) return;
                result.mapWeightShift[key] = delta;
            });
        }
        return result;
    }

    resetRunPathBattleState() {
        this.runPathBattleState = {
            firstAttackBonusUsed: false,
            firstSkillDrawUsedThisTurn: false
        };
        return this.runPathBattleState;
    }

    getRunDestinyMeta() {
        const runDestiny = this.normalizeRunDestiny();
        if (!runDestiny) return null;
        const base = RUN_DESTINIES[runDestiny.id];
        if (!base) return null;
        const tiers = Array.isArray(base.tiers) ? base.tiers : [];
        const tierIndex = Math.max(0, Math.min(tiers.length - 1, runDestiny.tier - 1));
        const tierMeta = tiers[tierIndex] || tiers[0] || {};
        return {
            id: base.id,
            name: base.name,
            icon: base.icon || '✦',
            category: base.category || '命格',
            description: base.description || '',
            playstyle: base.playstyle || '',
            affinities: Array.isArray(base.affinities) ? base.affinities.slice() : [],
            tier: Math.max(1, Math.floor(Number(runDestiny.tier) || 1)),
            tierLabel: tierMeta.label || `第 ${Math.max(1, Math.floor(Number(runDestiny.tier) || 1))} 阶`,
            summary: tierMeta.summary || base.description || '',
            effects: tierMeta.effects && typeof tierMeta.effects === 'object'
                ? { ...tierMeta.effects }
                : {}
        };
    }

    getRunDestinyEffects() {
        const meta = this.getRunDestinyMeta();
        return meta && meta.effects ? meta.effects : {};
    }

    resetRunDestinyBattleState() {
        this.runDestinyBattleState = {
            firstAttackBonusUsed: false,
            firstSkillDrawUsedThisTurn: false,
            firstBlockBonusUsed: false,
            firstTurnBonusApplied: false
        };
        return this.runDestinyBattleState;
    }

    normalizeRunVows(runVows = this.runVows) {
        const catalog = (typeof RUN_VOWS !== 'undefined' && RUN_VOWS && typeof RUN_VOWS === 'object')
            ? RUN_VOWS
            : null;
        if (!catalog || !Array.isArray(runVows)) {
            this.runVows = [];
            return [];
        }

        const deduped = new Map();
        runVows.forEach((entry) => {
            if (!entry || typeof entry !== 'object') return;
            const id = typeof entry.id === 'string' ? entry.id : '';
            const base = catalog[id];
            if (!id || !base) return;
            const maxTier = Math.max(1, Array.isArray(base.tiers) ? base.tiers.length : 1);
            const tier = Math.max(1, Math.min(maxTier, Math.floor(Number(entry.tier) || 1)));
            const previous = deduped.get(id);
            if (!previous || tier > previous.tier) {
                deduped.set(id, { id, tier });
            }
        });

        this.runVows = Array.from(deduped.values()).slice(0, 2);
        return this.runVows;
    }

    setRunVows(runVows = []) {
        this.runVows = Array.isArray(runVows)
            ? runVows.map((entry) => ({ ...(entry || {}) }))
            : [];
        return this.normalizeRunVows();
    }

    getRunVowMeta(vowId, tier = 1) {
        if (typeof vowId !== 'string' || !vowId || typeof RUN_VOWS === 'undefined' || !RUN_VOWS[vowId]) {
            return null;
        }
        const base = RUN_VOWS[vowId];
        const tiers = Array.isArray(base.tiers) ? base.tiers : [];
        const maxTier = Math.max(1, tiers.length || 1);
        const safeTier = Math.max(1, Math.min(maxTier, Math.floor(Number(tier) || 1)));
        const tierMeta = tiers[safeTier - 1] || tiers[0] || {};
        return {
            id: base.id,
            name: base.name,
            icon: base.icon || '✧',
            category: base.category || '誓约',
            description: base.description || '',
            playstyle: base.playstyle || '',
            routeHint: base.routeHint || '',
            affinities: Array.isArray(base.affinities) ? base.affinities.slice() : [],
            tier: safeTier,
            maxTier,
            tierLabel: tierMeta.label || `第 ${safeTier} 阶`,
            summary: tierMeta.summary || base.description || '',
            risk: tierMeta.risk || '',
            effects: tierMeta.effects && typeof tierMeta.effects === 'object'
                ? { ...tierMeta.effects }
                : {}
        };
    }

    getRunVowMetas() {
        return this.normalizeRunVows()
            .map((entry) => this.getRunVowMeta(entry.id, entry.tier))
            .filter(Boolean);
    }

    getRunVowEffects() {
        const result = {
            openingBlock: 0,
            firstTurnDraw: 0,
            firstTurnEnergy: 0,
            firstAttackBonusPerBattle: 0,
            onKillHeal: 0,
            battleStartHpLoss: 0,
            rewardRareChance: 0,
            battleCommandPointCapBonus: 0,
            initialCommandPointsBonus: 0,
            commandCostDiscount: 0,
            maxHandSizeOffset: 0,
            firstExhaustDrawPerTurn: 0,
            blockGainMultiplier: 0,
            healMultiplier: 1,
            shopPriceMul: 1,
            lowHpThreshold: 0,
            lowHpDamageBonusPct: 0,
            mapWeightShift: {}
        };

        this.getRunVowMetas().forEach((meta) => {
            const effects = meta && meta.effects ? meta.effects : {};
            result.openingBlock += Math.max(0, Math.floor(Number(effects.openingBlock) || 0));
            result.firstTurnDraw += Math.max(0, Math.floor(Number(effects.firstTurnDraw) || 0));
            result.firstTurnEnergy += Math.max(0, Math.floor(Number(effects.firstTurnEnergy) || 0));
            result.firstAttackBonusPerBattle += Math.max(0, Math.floor(Number(effects.firstAttackBonusPerBattle) || 0));
            result.onKillHeal += Math.max(0, Math.floor(Number(effects.onKillHeal) || 0));
            result.battleStartHpLoss += Math.max(0, Math.floor(Number(effects.battleStartHpLoss) || 0));
            result.rewardRareChance += Math.max(0, Number(effects.rewardRareChance) || 0);
            result.battleCommandPointCapBonus += Math.max(0, Math.floor(Number(effects.battleCommandPointCapBonus) || 0));
            result.initialCommandPointsBonus += Math.max(0, Math.floor(Number(effects.initialCommandPointsBonus) || 0));
            result.commandCostDiscount += Math.max(0, Math.floor(Number(effects.commandCostDiscount) || 0));
            result.maxHandSizeOffset += Math.floor(Number(effects.maxHandSizeOffset) || 0);
            result.firstExhaustDrawPerTurn += Math.max(0, Math.floor(Number(effects.firstExhaustDrawPerTurn) || 0));
            result.blockGainMultiplier += Math.max(0, Number(effects.blockGainMultiplier) || 0);
            if (Number.isFinite(Number(effects.healMultiplier)) && Number(effects.healMultiplier) > 0) {
                result.healMultiplier *= Math.max(0.2, Number(effects.healMultiplier) || 1);
            }
            if (Number.isFinite(Number(effects.shopPriceMul)) && Number(effects.shopPriceMul) > 0) {
                result.shopPriceMul *= Math.max(0.6, Number(effects.shopPriceMul) || 1);
            }
            if (Number.isFinite(Number(effects.lowHpDamageBonusPct)) && Number(effects.lowHpDamageBonusPct) > 0) {
                result.lowHpDamageBonusPct += Math.max(0, Number(effects.lowHpDamageBonusPct) || 0);
            }
            if (Number.isFinite(Number(effects.lowHpThreshold)) && Number(effects.lowHpThreshold) > 0) {
                result.lowHpThreshold = Math.max(result.lowHpThreshold, Number(effects.lowHpThreshold) || 0);
            }
            if (effects.mapWeightShift && typeof effects.mapWeightShift === 'object') {
                Object.keys(effects.mapWeightShift).forEach((key) => {
                    const delta = Number(effects.mapWeightShift[key]);
                    if (!Number.isFinite(delta)) return;
                    result.mapWeightShift[key] = (result.mapWeightShift[key] || 0) + delta;
                });
            }
        });

        result.healMultiplier = Math.max(0.2, Math.min(1.5, result.healMultiplier));
        result.shopPriceMul = Math.max(0.6, Math.min(2, result.shopPriceMul));
        return result;
    }

    resetRunVowBattleState() {
        this.runVowBattleState = {
            firstAttackBonusUsed: false,
            firstTurnBonusApplied: false,
            firstExhaustDrawUsedThisTurn: false
        };
        return this.runVowBattleState;
    }

    normalizeSpiritCompanion(spiritCompanion = this.spiritCompanion) {
        const catalog = (typeof SPIRIT_COMPANIONS !== 'undefined' && SPIRIT_COMPANIONS && typeof SPIRIT_COMPANIONS === 'object')
            ? SPIRIT_COMPANIONS
            : null;
        if (!catalog || !spiritCompanion || typeof spiritCompanion !== 'object') {
            this.spiritCompanion = null;
            return null;
        }
        const id = typeof spiritCompanion.id === 'string' ? spiritCompanion.id : '';
        const base = catalog[id];
        if (!id || !base) {
            this.spiritCompanion = null;
            return null;
        }
        const maxTier = Math.max(1, Array.isArray(base.tiers) ? base.tiers.length : 1);
        const tier = Math.max(1, Math.min(maxTier, Math.floor(Number(spiritCompanion.tier) || 1)));
        this.spiritCompanion = { id, tier };
        return this.spiritCompanion;
    }

    setSpiritCompanion(spiritId, tier = 1) {
        const id = typeof spiritId === 'string' ? spiritId : '';
        const catalog = (typeof SPIRIT_COMPANIONS !== 'undefined' && SPIRIT_COMPANIONS && typeof SPIRIT_COMPANIONS === 'object')
            ? SPIRIT_COMPANIONS
            : null;
        if (!catalog || !catalog[id]) {
            this.spiritCompanion = null;
            return null;
        }
        this.spiritCompanion = {
            id,
            tier: Math.max(1, Math.floor(Number(tier) || 1))
        };
        return this.getSpiritCompanionMeta();
    }

    getSpiritCompanionMeta() {
        const entry = this.normalizeSpiritCompanion();
        if (!entry || typeof SPIRIT_COMPANIONS === 'undefined' || !SPIRIT_COMPANIONS[entry.id]) {
            return null;
        }
        const base = SPIRIT_COMPANIONS[entry.id];
        const tiers = Array.isArray(base.tiers) ? base.tiers : [];
        const safeTier = Math.max(1, Math.min(tiers.length || 1, Math.floor(Number(entry.tier) || 1)));
        const tierMeta = tiers[safeTier - 1] || tiers[0] || {};
        return {
            id: base.id,
            name: base.name,
            icon: base.icon || '✦',
            title: base.title || '',
            category: '灵契',
            description: base.description || '',
            playstyle: base.playstyle || '',
            story: base.story || '',
            affinities: Array.isArray(base.affinities) ? base.affinities.slice() : [],
            tier: safeTier,
            maxTier: Math.max(1, tiers.length || 1),
            tierLabel: tierMeta.label || `第 ${safeTier} 阶`,
            summary: tierMeta.summary || base.description || '',
            passiveLabel: tierMeta.passiveLabel || '灵契被动',
            passiveDesc: tierMeta.passiveDesc || '',
            activeLabel: tierMeta.activeLabel || '灵契主动',
            activeDesc: tierMeta.activeDesc || '',
            chargeMax: Math.max(1, Math.floor(Number(tierMeta.chargeMax) || 5)),
            passive: tierMeta.passive && typeof tierMeta.passive === 'object'
                ? { ...tierMeta.passive }
                : {},
            active: tierMeta.active && typeof tierMeta.active === 'object'
                ? { ...tierMeta.active }
                : {}
        };
    }

    getSpiritCompanionEffects() {
        const meta = this.getSpiritCompanionMeta();
        if (!meta) {
            return { passive: {}, active: {}, chargeMax: 0 };
        }
        return {
            passive: meta.passive || {},
            active: meta.active || {},
            chargeMax: Math.max(1, Math.floor(Number(meta.chargeMax) || 1))
        };
    }

    ensureSpiritCompanionBattleState() {
        if (!this.spiritCompanionBattleState || typeof this.spiritCompanionBattleState !== 'object') {
            return this.resetSpiritCompanionBattleState();
        }
        const effects = this.getSpiritCompanionEffects();
        const chargeMax = Math.max(0, Math.floor(Number(effects.chargeMax) || 0));
        this.spiritCompanionBattleState.charge = Math.max(0, Math.min(
            chargeMax,
            Math.floor(Number(this.spiritCompanionBattleState.charge) || 0)
        ));
        this.spiritCompanionBattleState.firstSkillDrawUsedThisTurn = !!this.spiritCompanionBattleState.firstSkillDrawUsedThisTurn;
        this.spiritCompanionBattleState.firstBlockBonusUsedThisTurn = !!this.spiritCompanionBattleState.firstBlockBonusUsedThisTurn;
        this.spiritCompanionBattleState.onLoseHpPulseUsedThisTurn = !!this.spiritCompanionBattleState.onLoseHpPulseUsedThisTurn;
        this.spiritCompanionBattleState.nthCardPassiveProcCount = Math.max(0, Math.floor(Number(this.spiritCompanionBattleState.nthCardPassiveProcCount) || 0));
        return this.spiritCompanionBattleState;
    }

    resetSpiritCompanionBattleState() {
        this.spiritCompanionBattleState = {
            charge: 0,
            firstSkillDrawUsedThisTurn: false,
            firstBlockBonusUsedThisTurn: false,
            onLoseHpPulseUsedThisTurn: false,
            nthCardPassiveProcCount: 0
        };
        return this.ensureSpiritCompanionBattleState();
    }

    gainSpiritCharge(amount = 1) {
        const effects = this.getSpiritCompanionEffects();
        const chargeMax = Math.max(0, Math.floor(Number(effects.chargeMax) || 0));
        const gain = Math.max(0, Math.floor(Number(amount) || 0));
        if (chargeMax <= 0 || gain <= 0) {
            return { before: 0, after: 0, gained: 0, chargeMax: 0, becameReady: false };
        }
        const state = this.ensureSpiritCompanionBattleState();
        const before = Math.max(0, Math.floor(Number(state.charge) || 0));
        state.charge = Math.max(0, Math.min(chargeMax, before + gain));
        return {
            before,
            after: state.charge,
            gained: Math.max(0, state.charge - before),
            chargeMax,
            becameReady: before < chargeMax && state.charge >= chargeMax
        };
    }

    spendSpiritCharge(amount = null) {
        const effects = this.getSpiritCompanionEffects();
        const chargeMax = Math.max(0, Math.floor(Number(effects.chargeMax) || 0));
        const cost = amount == null
            ? chargeMax
            : Math.max(0, Math.floor(Number(amount) || 0));
        const state = this.ensureSpiritCompanionBattleState();
        if (cost <= 0 || state.charge < cost) return false;
        state.charge -= cost;
        return true;
    }

    applyRunVowConsequences(vowId, previousTier = 0, nextTier = 1) {
        const previousMeta = previousTier > 0 ? this.getRunVowMeta(vowId, previousTier) : null;
        const nextMeta = this.getRunVowMeta(vowId, nextTier);
        if (!nextMeta) return null;

        const previousEffects = previousMeta && previousMeta.effects ? previousMeta.effects : {};
        const nextEffects = nextMeta.effects || {};
        const previousPenalty = Math.max(0, Math.floor(Number(previousEffects.maxHpPenalty) || 0));
        const nextPenalty = Math.max(0, Math.floor(Number(nextEffects.maxHpPenalty) || 0));
        const penaltyDelta = Math.max(0, nextPenalty - previousPenalty);

        if (penaltyDelta > 0) {
            const prevMaxHp = this.maxHp;
            this.maxHp = Math.max(18, this.maxHp - penaltyDelta);
            const actualLoss = Math.max(0, prevMaxHp - this.maxHp);
            if (actualLoss > 0) {
                this.currentHp = Math.min(this.currentHp, this.maxHp);
                if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
                    Utils.showBattleLog(`誓约【${nextMeta.name}】代价深化：最大生命 -${actualLoss}`);
                }
            }
        }

        return nextMeta;
    }

    applyRunVow(vowId) {
        if (typeof vowId !== 'string' || !vowId || typeof RUN_VOWS === 'undefined' || !RUN_VOWS[vowId]) {
            return null;
        }

        const normalized = this.normalizeRunVows();
        const existing = normalized.find((entry) => entry.id === vowId) || null;
        const maxTier = Math.max(1, Array.isArray(RUN_VOWS[vowId].tiers) ? RUN_VOWS[vowId].tiers.length : 1);
        const previousTier = existing ? existing.tier : 0;
        const nextTier = existing ? Math.min(maxTier, existing.tier + 1) : 1;

        if (!existing && normalized.length >= 2) return null;
        if (existing && nextTier === previousTier) {
            return {
                type: 'locked',
                previousTier,
                nextTier,
                meta: this.getRunVowMeta(vowId, nextTier)
            };
        }

        if (existing) {
            existing.tier = nextTier;
        } else {
            normalized.push({ id: vowId, tier: nextTier });
        }
        this.runVows = normalized;
        this.normalizeRunVows();
        const meta = this.applyRunVowConsequences(vowId, previousTier, nextTier);
        return {
            type: previousTier > 0 ? 'upgrade' : 'new',
            previousTier,
            nextTier,
            meta
        };
    }

    initSkill(skillId) {
        if (!SKILLS[skillId]) return;
        this.activeSkill = { ...SKILLS[skillId] };
        this.maxCooldown = this.activeSkill.cooldown;
        this.skillCooldown = 0;
    }

    ensureAdventureBuffs() {
        const defaults = {
            firstTurnDrawBoostBattles: 0,
            openingBlockBoostBattles: 0,
            victoryGoldBoostBattles: 0,
            firstTurnEnergyBoostBattles: 0,
            ringExpBoostBattles: 0,
            victoryHealBoostBattles: 0
        };

        if (!this.adventureBuffs || typeof this.adventureBuffs !== 'object') {
            this.adventureBuffs = { ...defaults };
            return this.adventureBuffs;
        }

        Object.keys(defaults).forEach((key) => {
            const value = Math.max(0, Math.floor(Number(this.adventureBuffs[key]) || 0));
            this.adventureBuffs[key] = value;
        });
        return this.adventureBuffs;
    }

    grantAdventureBuff(buffId, charges = 1) {
        const buffs = this.ensureAdventureBuffs();
        if (!Object.prototype.hasOwnProperty.call(buffs, buffId)) return false;
        const add = Math.max(0, Math.floor(Number(charges) || 0));
        if (add <= 0) return false;
        buffs[buffId] += add;
        return true;
    }

    consumeAdventureBuff(buffId, amount = 1) {
        const buffs = this.ensureAdventureBuffs();
        if (!Object.prototype.hasOwnProperty.call(buffs, buffId)) return false;
        const cost = Math.max(1, Math.floor(Number(amount) || 1));
        if (buffs[buffId] < cost) return false;
        buffs[buffId] -= cost;
        return true;
    }

    consumeAdventureVictoryGoldBoost(baseGold) {
        const base = Math.max(0, Math.floor(Number(baseGold) || 0));
        if (base <= 0) return 0;
        if (!this.consumeAdventureBuff('victoryGoldBoostBattles', 1)) return 0;
        return Math.max(1, Math.floor(base * 0.5));
    }

    consumeAdventureRingExpBoost(baseExp) {
        const base = Math.max(0, Math.floor(Number(baseExp) || 0));
        if (base <= 0) return 0;
        if (!this.consumeAdventureBuff('ringExpBoostBattles', 1)) return 0;
        return Math.max(1, Math.floor(base * 0.3));
    }

    consumeAdventureVictoryHealBoost(baseHp) {
        const base = Math.max(0, Math.floor(Number(baseHp) || 0));
        if (base <= 0) return 0;
        if (!this.consumeAdventureBuff('victoryHealBoostBattles', 1)) return 0;
        return Math.max(6, Math.floor(base * 0.12));
    }

    unlockUltimate(level) {
        if (level > this.skillLevel) {
            this.skillLevel = level;
            // FIX: Safely log only if Utils and UI are ready. 
            // This prevents crashes during loadGame if DOM isn't ready.
            if (typeof Utils !== 'undefined' && document.getElementById('battle-log')) {
                Utils.showBattleLog(`境界突破！主动技能等级提升至 Lv.${level}`);
            }
            // May reduce cooldown or enhance effect in future
        }
    }

    activateSkill(battle) {
        if (!this.activeSkill || this.skillLevel <= 0) {
            Utils.showBattleLog('尚未解锁主动技能！');
            return false;
        }
        if (this.skillCooldown > 0) {
            Utils.showBattleLog(`技能冷却中... (${this.skillCooldown})`);
            return false;
        }

        const success = this.activeSkill.effect(this, battle);
        if (success) {
            this.skillCooldown = this.maxCooldown;
            // Level bonus: Lv 2 -> Cooldown -1, Lv 3 -> Cooldown -2?
            // Simple implementation for now.
            if (this.skillLevel >= 2) this.skillCooldown = Math.max(1, this.maxCooldown - 1);
            if (this.skillLevel >= 3) this.skillCooldown = Math.max(1, this.maxCooldown - 2);

            Utils.showBattleLog(`释放终极技能：${this.activeSkill.name}！`);
            return true;
        }
        return false;
    }

    initializeDeck(deckList) {
        const list = deckList || STARTER_DECK;
        this.deck = list.map(cardId => {
            const card = CARDS[cardId];
            // Fix: Use deep copy to prevent shared state between same cards
            if (!card) return null;
            const newCard = JSON.parse(JSON.stringify(card));
            newCard.instanceId = this.generateCardId();
            return newCard;
        }).filter(Boolean);
    }

    generateCardId() {
        return 'card_' + Math.random().toString(36).substr(2, 9);
    }

    // 重新计算属性
    recalculateStats() {
        // 检查共鸣状态
        this.checkResonances();

        const charData = CHARACTERS[this.characterId || 'linFeng'];
        if (!charData) return;

        // 安全检查：如果等级>=1但路径仍为crippled，强制觉醒
        // 这是为了修复旧存档可能存在的状态不一致问题
        if (this.fateRing.level >= 1 && this.fateRing.path === 'crippled') {
            this.fateRing.path = 'awakened';
            // 可能需要通知用户或log，但recalculateStats调用频繁，保持静默
        }

        // 1. 基础属性
        let newMaxHp = charData.stats.maxHp;
        let newBaseEnergy = charData.stats.energy;
        let newDrawCount = 5;

        // 2. 命环等级及镶嵌加成
        if (this.fateRing && this.fateRing.getStatsBonus) {
            const ringBonus = this.fateRing.getStatsBonus();
            newMaxHp += ringBonus.maxHp;
            newBaseEnergy += ringBonus.energy;
            newDrawCount += ringBonus.draw;
        } else {
            // 旧逻辑完全保留作为Fallback，但在新类生效时应该不会走这里
            const levelData = FATE_RING.levels[this.fateRing.level];
            if (levelData && levelData.bonus) {
                if (levelData.bonus.maxHp) newMaxHp += levelData.bonus.maxHp;
                if (levelData.bonus.energy) newBaseEnergy += levelData.bonus.energy;
                if (levelData.bonus.draw) newDrawCount += levelData.bonus.draw;
            }
        }

        // 3. 命环路径加成
        if (this.fateRing.path && FATE_RING.paths[this.fateRing.path]) {
            const path = FATE_RING.paths[this.fateRing.path];
            if (path.bonus) {
                if (path.bonus.type === 'hpBonus') newMaxHp += path.bonus.value;
                if (path.bonus.type === 'energyBonus') newBaseEnergy += path.bonus.value;
                if (path.bonus.type === 'drawBonus') newDrawCount += path.bonus.value;

                // 复合加成
                if (path.bonus.type === 'ultimate') {
                    // 真·逆天之环并没有直接属性加成，主要是机制加成，但如果有可以在这里加
                }
            }
        }

        // 4. 永久属性加成 (Perma Buffs)
        if (this.permaBuffs) {
            newMaxHp += (this.permaBuffs.maxHp || 0);
            newBaseEnergy += (this.permaBuffs.energy || 0);
            newDrawCount += (this.permaBuffs.draw || 0);
        }

        // 4.5 局外传承加成
        if (this.legacyBonuses) {
            newMaxHp += (this.legacyBonuses.startMaxHp || 0);
            newDrawCount += (this.legacyBonuses.startDraw || 0);
        }

        // 5. 天域环境影响
        // Realm 10: 大地束缚 - 灵力上限-1
        if (this.realm === 10) {
            newBaseEnergy = Math.max(1, newBaseEnergy - 1);
        }
        // Realm 15: 大道独行 - 最大生命值减半
        if (this.realm === 15) {
            newMaxHp = Math.floor(newMaxHp * 0.7);
        }
        // Realm 18: 混沌终焉 - 所有属性减半
        // Fix: Explicitly EXCLUDE skill cooldown from reduction.
        if (this.realm === 18) {
            newMaxHp = Math.floor(newMaxHp * 0.5);
            newBaseEnergy = Math.max(1, Math.floor(newBaseEnergy * 0.5));
            newDrawCount = Math.max(1, Math.floor(newDrawCount * 0.5));
            // Ensure cooldown is NOT halved (Safety check)
            // this.maxCooldown remains unchanged
        }

        // 更新属性 (保持当前生命值比例或数值？通常保持当前数值，除非超过最大值)
        // Update attributes
        this.maxHp = newMaxHp;
        this.baseEnergy = newBaseEnergy;
        this.drawCount = newDrawCount;
        this.currentHp = Math.min(this.currentHp, this.maxHp);

        // 动态计算奶糖上限 (每5层增加1个)
        // 1-5: 3, 6-10: 4, 11-15: 5, 16+: 6
        this.maxMilkCandy = 3 + Math.floor((Math.max(1, this.realm) - 1) / 5);
    }

    // 获取五行法则计数
    getElementalCounts() {
        const counts = { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 };
        if (this.collectedLaws) {
            this.collectedLaws.forEach(law => {
                const element = Utils.getCanonicalElement(law.element);
                if (counts[element] !== undefined) {
                    counts[element]++;
                }
            });
        }
        return counts;
    }

    // 检查共鸣状态
    checkResonances() {
        if (typeof LAW_RESONANCES === 'undefined') return;

        this.activeResonances = [];
        const loadedLaws = this.fateRing.getSocketedLaws ? this.fateRing.getSocketedLaws() : [];

        for (const key in LAW_RESONANCES) {
            const resonance = LAW_RESONANCES[key];
            const hasAllLaws = resonance.laws.every(lawId => loadedLaws.includes(lawId));

            if (hasAllLaws) {
                this.activeResonances.push(resonance);
                // Utils.showBattleLog(`法则共鸣激活：${resonance.name}`); // 避免刷屏，仅在变化时提示更好
            }
        }
    }

    getPathDoctrineTier() {
        const level = Math.max(0, Math.floor(Number(this.fateRing?.level) || 0));
        if (level >= 10) return 3;
        if (level >= 7) return 2;
        if (level >= 4) return 1;
        return 0;
    }

    getPathDoctrineProfile(pathId = null) {
        const path = String(pathId || this.fateRing?.path || '');
        const tier = this.getPathDoctrineTier();
        const profile = {
            path,
            tier,
            commandCostDiscount: 0,
            commandGainBonus: 0,
            skillChainBlock: 0,
            skillChainDraw: 0,
            lowBlockDamageBonus: 0,
            healEfficiency: 1,
            shopOfferBonus: 0,
            shopPriceMultiplier: 1
        };
        if (tier <= 0) return profile;

        if (path === 'convergence') {
            profile.commandCostDiscount = tier >= 2 ? 1 : 0;
            profile.commandGainBonus = tier >= 3 ? 2 : 1;
            return profile;
        }

        if (path === 'resonance') {
            profile.skillChainBlock = 2 + tier;
            profile.skillChainDraw = tier >= 2 ? 1 : 0;
            profile.commandGainBonus = tier >= 3 ? 1 : 0;
            return profile;
        }

        if (path === 'destruction') {
            profile.lowBlockDamageBonus = 0.08 + tier * 0.03;
            profile.healEfficiency = [1, 0.92, 0.86, 0.8][tier] || 0.8;
            profile.commandCostDiscount = tier >= 2 ? 1 : 0;
            return profile;
        }

        if (path === 'wisdom') {
            profile.commandCostDiscount = tier >= 3 ? 1 : 0;
            profile.shopOfferBonus = tier >= 2 ? 1 : 0;
            profile.shopPriceMultiplier = Math.max(0.78, 1 - tier * 0.04);
            return profile;
        }

        return profile;
    }

    getArchetypeResonanceConfig(archetypeId, matchCount) {
        if (!archetypeId || matchCount < 8) return null;
        const tier = matchCount >= 12 ? 2 : 1;

        if (archetypeId === 'hemorrhage') {
            return {
                id: 'hemorrhage',
                name: '血蚀连斩',
                tier,
                matchCount,
                applyBleedBonus: tier,
                applyMarkBonus: 0,
                firstMarkHitDraw: 0,
                openingBlock: tier * 3,
                procUsedThisTurn: false
            };
        }

        if (archetypeId === 'precision') {
            return {
                id: 'precision',
                name: '破绽心眼',
                tier,
                matchCount,
                applyBleedBonus: 0,
                applyMarkBonus: tier,
                firstMarkHitDraw: tier,
                openingBlock: 0,
                procUsedThisTurn: false
            };
        }

        if (archetypeId === 'entropy') {
            return {
                id: 'entropy',
                name: '虚账收束',
                tier,
                matchCount,
                applyBleedBonus: 0,
                applyMarkBonus: 0,
                firstMarkHitDraw: 0,
                firstDiscardDraw: tier,
                discardDamage: 2 + tier,
                openingBlock: tier * 2,
                procUsedThisTurn: false
            };
        }

        if (archetypeId === 'stormcraft') {
            return {
                id: 'stormcraft',
                name: '雷策连锁',
                tier,
                matchCount,
                applyBleedBonus: 0,
                applyMarkBonus: tier,
                firstMarkHitDraw: 0,
                firstVulnerableHitDraw: tier,
                vulnerableBonusDamage: 2 + tier,
                openingBlock: tier,
                procUsedThisTurn: false
            };
        }

        if (archetypeId === 'vitalweave') {
            return {
                id: 'vitalweave',
                name: '回生织脉',
                tier,
                matchCount,
                applyBleedBonus: 0,
                applyMarkBonus: 0,
                firstMarkHitDraw: 0,
                firstHealDraw: tier >= 2 ? 1 : 0,
                firstHealBlockRatio: tier >= 2 ? 0.75 : 0.6,
                healBurstDamage: 2 + tier,
                openingBlock: tier * 2,
                procUsedThisTurn: false
            };
        }

        if (archetypeId === 'bulwark') {
            return {
                id: 'bulwark',
                name: '玄甲反击',
                tier,
                matchCount,
                applyBleedBonus: 0,
                applyMarkBonus: 0,
                firstMarkHitDraw: 0,
                openingBlock: tier * 4,
                firstBlockDraw: tier,
                blockCounterDamage: 2 + tier,
                procUsedThisTurn: false
            };
        }

        if (archetypeId === 'cursebound') {
            return {
                id: 'cursebound',
                name: '咒契裁断',
                tier,
                matchCount,
                applyBleedBonus: 0,
                applyMarkBonus: 0,
                firstMarkHitDraw: 0,
                openingBlock: tier,
                firstSelfDamageDraw: tier,
                selfDamagePulseBlock: 3 + tier * 2,
                selfDamagePulseDamage: 2 + tier,
                procUsedThisTurn: false
            };
        }

        if (archetypeId === 'soulforge') {
            return {
                id: 'soulforge',
                name: '灵傀锻阵',
                tier,
                matchCount,
                applyBleedBonus: 0,
                applyMarkBonus: 0,
                firstMarkHitDraw: 0,
                openingBlock: tier * 2,
                firstForgeDraw: tier,
                forgePulseBlock: 4 + tier * 2,
                forgePulseDamage: 2 + tier,
                procUsedThisTurn: false
            };
        }

        return null;
    }

    resolveArchetypeResonance() {
        if (!Array.isArray(this.deck) || this.deck.length === 0) {
            this.archetypeResonance = null;
            return null;
        }

        let archetypeId = null;
        if (typeof inferDeckArchetype === 'function') {
            archetypeId = inferDeckArchetype(this.deck);
        }

        if (!archetypeId) {
            this.archetypeResonance = null;
            return null;
        }

        let matchCount = 0;
        this.deck.forEach(card => {
            if (!card) return;
            if (archetypeId === 'hemorrhage') {
                const isHemorrhage = card.synergyGroup === 'hemorrhage' ||
                    (Array.isArray(card.keywords) && card.keywords.includes('bleed'));
                if (isHemorrhage) matchCount += 1;
            } else if (archetypeId === 'precision') {
                const isPrecision = card.synergyGroup === 'precision' ||
                    card.synergyGroup === 'stance' ||
                    (Array.isArray(card.keywords) && (card.keywords.includes('mark') || card.keywords.includes('stance')));
                if (isPrecision) matchCount += 1;
            } else if (archetypeId === 'entropy') {
                const isEntropy = card.synergyGroup === 'entropy' ||
                    (Array.isArray(card.keywords) && (card.keywords.includes('discard') || card.keywords.includes('mulligan')));
                if (isEntropy) matchCount += 1;
            } else if (archetypeId === 'stormcraft') {
                const isStormcraft = card.synergyGroup === 'stormcraft' ||
                    (Array.isArray(card.keywords) &&
                        (card.keywords.includes('storm') || card.keywords.includes('vulnerable') || card.keywords.includes('chain')));
                if (isStormcraft) matchCount += 1;
            } else if (archetypeId === 'vitalweave') {
                const isVitalweave = card.synergyGroup === 'vitalweave' ||
                    (Array.isArray(card.keywords) &&
                        (card.keywords.includes('vital') || card.keywords.includes('heal') || card.keywords.includes('sustain')));
                if (isVitalweave) matchCount += 1;
            } else if (archetypeId === 'bulwark') {
                const isBulwark = card.synergyGroup === 'bulwark' ||
                    (Array.isArray(card.keywords) && (card.keywords.includes('guard') || card.keywords.includes('retain')));
                if (isBulwark) matchCount += 1;
            } else if (archetypeId === 'cursebound') {
                const isCursebound = card.synergyGroup === 'cursebound' ||
                    (Array.isArray(card.keywords) &&
                        (card.keywords.includes('curse') || card.keywords.includes('selfharm') || card.keywords.includes('contract')));
                if (isCursebound) matchCount += 1;
            } else if (archetypeId === 'soulforge') {
                const isSoulforge = card.synergyGroup === 'soulforge' ||
                    (Array.isArray(card.keywords) &&
                        (card.keywords.includes('forge') || card.keywords.includes('construct') || card.keywords.includes('array')));
                if (isSoulforge) matchCount += 1;
            }
        });

        this.archetypeResonance = this.getArchetypeResonanceConfig(archetypeId, matchCount);
        return this.archetypeResonance;
    }

    triggerArchetypeDiscardProc(discardedCount = 0) {
        const count = Math.max(0, Number(discardedCount) || 0);
        if (count <= 0) return;

        const resonance = this.archetypeResonance;
        const doctrine = this.legacyRunDoctrine && typeof this.legacyRunDoctrine === 'object'
            ? this.legacyRunDoctrine
            : null;
        const hasEntropyResonance = !!(resonance && resonance.id === 'entropy');
        const hasLegacyEntropy = !!(doctrine && doctrine.entropyLegacyProcEnabled);
        if (!hasEntropyResonance && !hasLegacyEntropy) return;

        if (hasEntropyResonance && resonance.procUsedThisTurn) return;
        if (hasLegacyEntropy && doctrine.entropyProcUsedThisTurn) return;

        if (hasEntropyResonance) resonance.procUsedThisTurn = true;
        if (hasLegacyEntropy) doctrine.entropyProcUsedThisTurn = true;

        const drawCount = Math.max(
            hasEntropyResonance ? (resonance.firstDiscardDraw || 0) : 0,
            hasLegacyEntropy ? (doctrine.entropyLegacyDraw || 0) : 0
        );
        if (drawCount > 0) this.drawCards(drawCount);
        let bonusEnergy = 0;
        if (hasLegacyEntropy && !doctrine.entropyBonusEnergyUsed && doctrine.entropyBonusEnergyOnce > 0) {
            bonusEnergy = Math.max(0, Number(doctrine.entropyBonusEnergyOnce) || 0);
            if (bonusEnergy > 0) {
                this.gainEnergy(bonusEnergy);
                doctrine.entropyBonusEnergyUsed = true;
            }
        }

        if (this.game && typeof this.game.handleLegacyMissionProgress === 'function' && hasLegacyEntropy) {
            this.game.handleLegacyMissionProgress('entropyDiscardProc', 1);
        }

        const battle = (this.game && this.game.battle) ? this.game.battle : null;
        if (!battle || !Array.isArray(battle.enemies)) {
            const energyText = bonusEnergy > 0 ? `，回灵 +${bonusEnergy}` : '';
            Utils.showBattleLog(`【虚账收束】弃牌触发：抽牌 +${drawCount}${energyText}`);
            return;
        }

        const aliveEnemies = battle.enemies.filter(e => e && e.currentHp > 0);
        if (aliveEnemies.length === 0) {
            const energyText = bonusEnergy > 0 ? `，回灵 +${bonusEnergy}` : '';
            Utils.showBattleLog(`【虚账收束】弃牌触发：抽牌 +${drawCount}${energyText}`);
            return;
        }

        const target = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
        const bonus = Math.min(2, Math.max(0, count - 1));
        const baseDamage = Math.max(
            hasEntropyResonance ? (resonance.discardDamage || 0) : 0,
            hasLegacyEntropy ? (doctrine.entropyLegacyDiscardDamage || 0) : 0
        );
        const damage = Math.max(1, baseDamage + bonus);
        const dealt = battle.dealDamageToEnemy(target, damage);
        const energyText = bonusEnergy > 0 ? `，回灵 +${bonusEnergy}` : '';
        Utils.showBattleLog(`【虚账收束】弃牌触发：抽牌 +${drawCount}${energyText}，并对 ${target.name} 造成 ${dealt} 伤害`);
        if (typeof battle.markUIDirty === 'function') battle.markUIDirty('hand', 'piles', 'enemies');
    }

    triggerArchetypeBlockProc(blockGained = 0) {
        const gained = Math.max(0, Number(blockGained) || 0);
        if (gained <= 0) return;
        if (this.turnNumber <= 0) return; // 仅在正式回合内触发，避免开场护盾抢占

        const resonance = this.archetypeResonance;
        const doctrine = this.legacyRunDoctrine && typeof this.legacyRunDoctrine === 'object'
            ? this.legacyRunDoctrine
            : null;
        const hasBulwarkResonance = !!(resonance && resonance.id === 'bulwark');
        const hasLegacyBulwark = !!(doctrine && doctrine.bulwarkLegacyProcEnabled);
        if (!hasBulwarkResonance && !hasLegacyBulwark) return;

        if (hasBulwarkResonance && resonance.procUsedThisTurn) return;
        if (hasLegacyBulwark && doctrine.bulwarkProcUsedThisTurn) return;

        if (hasBulwarkResonance) resonance.procUsedThisTurn = true;
        if (hasLegacyBulwark) doctrine.bulwarkProcUsedThisTurn = true;

        const drawCount = Math.max(
            hasBulwarkResonance ? (resonance.firstBlockDraw || 0) : 0,
            hasLegacyBulwark ? (doctrine.bulwarkLegacyDraw || 0) : 0
        );
        if (drawCount > 0) this.drawCards(drawCount);

        if (this.game && typeof this.game.handleLegacyMissionProgress === 'function' && hasLegacyBulwark) {
            this.game.handleLegacyMissionProgress('bulwarkBlockProc', 1);
        }

        const battle = this.game && this.game.battle ? this.game.battle : null;
        if (!battle || !Array.isArray(battle.enemies)) {
            Utils.showBattleLog(`【玄甲反击】护势触发：抽牌 +${drawCount}`);
            return;
        }

        const aliveEnemies = battle.enemies.filter(e => e && e.currentHp > 0);
        if (aliveEnemies.length === 0) {
            Utils.showBattleLog(`【玄甲反击】护势触发：抽牌 +${drawCount}`);
            return;
        }

        const target = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
        const damage = Math.max(
            hasBulwarkResonance ? (Number(resonance.blockCounterDamage) || 0) : 0,
            hasLegacyBulwark ? (Number(doctrine.bulwarkLegacyCounterDamage) || 0) : 0,
            1
        );
        const dealt = battle.dealDamageToEnemy(target, damage);
        Utils.showBattleLog(`【玄甲反击】护势触发：抽牌 +${drawCount}，并对 ${target.name} 造成 ${dealt} 伤害`);
        if (typeof battle.markUIDirty === 'function') battle.markUIDirty('hand', 'piles', 'enemies');
    }

    triggerArchetypeHealProc(actualHeal = 0) {
        const healed = Math.max(0, Math.floor(Number(actualHeal) || 0));
        if (healed <= 0) return;
        if (this.turnNumber <= 0) return;

        const resonance = this.archetypeResonance;
        const doctrine = this.legacyRunDoctrine && typeof this.legacyRunDoctrine === 'object'
            ? this.legacyRunDoctrine
            : null;
        const hasVitalResonance = !!(resonance && resonance.id === 'vitalweave');
        const hasLegacyVitalweave = !!(doctrine && doctrine.vitalweaveLegacyProcEnabled);
        if (!hasVitalResonance && !hasLegacyVitalweave) return;

        if (hasVitalResonance && resonance.procUsedThisTurn) return;
        if (hasLegacyVitalweave && doctrine.vitalweaveProcUsedThisTurn) return;

        if (hasVitalResonance) resonance.procUsedThisTurn = true;
        if (hasLegacyVitalweave) doctrine.vitalweaveProcUsedThisTurn = true;

        const ratio = Math.max(
            hasVitalResonance ? (Number(resonance.firstHealBlockRatio) || 0) : 0,
            hasLegacyVitalweave ? (Number(doctrine.vitalweaveLegacyBlockRatio) || 0) : 0
        );
        const bonusBlock = Math.max(1, Math.floor(healed * ratio));
        const drawCount = Math.max(
            hasVitalResonance ? (Math.floor(Number(resonance.firstHealDraw) || 0)) : 0,
            hasLegacyVitalweave ? (Math.floor(Number(doctrine.vitalweaveLegacyDraw) || 0)) : 0
        );
        const burstBase = Math.max(
            hasVitalResonance ? (Math.floor(Number(resonance.healBurstDamage) || 0)) : 0,
            hasLegacyVitalweave ? (Math.floor(Number(doctrine.vitalweaveLegacyBurstDamage) || 0)) : 0
        );
        const burstDamage = Math.max(1, burstBase + Math.floor(healed / 4));
        this.addBlock(bonusBlock);
        if (drawCount > 0) this.drawCards(drawCount);
        if (this.game && typeof this.game.handleLegacyMissionProgress === 'function' && hasLegacyVitalweave) {
            this.game.handleLegacyMissionProgress('vitalweaveHealProc', 1);
        }

        const battle = this.game && this.game.battle ? this.game.battle : null;
        if (!battle || !Array.isArray(battle.enemies)) {
            Utils.showBattleLog(`【回生织脉】回生触发：护盾 +${bonusBlock}${drawCount > 0 ? `，抽牌 +${drawCount}` : ''}`);
            return;
        }

        const aliveEnemies = battle.enemies.filter(e => e && e.currentHp > 0);
        if (aliveEnemies.length === 0) {
            Utils.showBattleLog(`【回生织脉】回生触发：护盾 +${bonusBlock}${drawCount > 0 ? `，抽牌 +${drawCount}` : ''}`);
            return;
        }

        const target = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
        const dealt = battle.dealDamageToEnemy(target, burstDamage);
        Utils.showBattleLog(
            `【回生织脉】回生触发：护盾 +${bonusBlock}${drawCount > 0 ? `，抽牌 +${drawCount}` : ''}` +
            `，并对 ${target.name} 造成 ${dealt} 伤害`
        );
        if (typeof battle.markUIDirty === 'function') battle.markUIDirty('player', 'hand', 'piles', 'enemies');
    }

    triggerArchetypeSelfDamageProc(actualDamage = 0) {
        const damage = Math.max(0, Math.floor(Number(actualDamage) || 0));
        if (damage <= 0) return;
        if (this.turnNumber <= 0) return;

        const resonance = this.archetypeResonance;
        if (!(resonance && resonance.id === 'cursebound')) return;
        if (resonance.procUsedThisTurn) return;
        resonance.procUsedThisTurn = true;

        const drawCount = Math.max(0, Math.floor(Number(resonance.firstSelfDamageDraw) || 0));
        const blockAmount = Math.max(0, Math.floor(Number(resonance.selfDamagePulseBlock) || 0));
        const damageAmount = Math.max(1, Math.floor(Number(resonance.selfDamagePulseDamage) || 0));
        if (drawCount > 0) this.drawCards(drawCount);
        if (blockAmount > 0) this.addBlock(blockAmount);

        const battle = this.game && this.game.battle ? this.game.battle : null;
        if (!battle || !Array.isArray(battle.enemies)) {
            Utils.showBattleLog(`【咒契裁断】逆价清算：抽牌 +${drawCount}，护盾 +${blockAmount}`);
            return;
        }

        const aliveEnemies = battle.enemies.filter(e => e && e.currentHp > 0);
        if (aliveEnemies.length === 0) {
            Utils.showBattleLog(`【咒契裁断】逆价清算：抽牌 +${drawCount}，护盾 +${blockAmount}`);
            return;
        }

        const target = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
        const dealt = battle.dealDamageToEnemy(target, damageAmount);
        Utils.showBattleLog(`【咒契裁断】逆价清算：抽牌 +${drawCount}，护盾 +${blockAmount}，并对 ${target.name} 造成 ${dealt} 伤害`);
        if (typeof battle.markUIDirty === 'function') battle.markUIDirty('player', 'hand', 'piles', 'enemies');
    }

    triggerArchetypeForgeProc(createdCards = []) {
        const cards = Array.isArray(createdCards) ? createdCards.filter(Boolean) : [];
        if (cards.length === 0) return;
        if (this.turnNumber <= 0) return;

        const resonance = this.archetypeResonance;
        if (!(resonance && resonance.id === 'soulforge')) return;
        if (resonance.procUsedThisTurn) return;

        const forgeCount = cards.filter(card => (
            card.synergyGroup === 'soulforge'
            || (Array.isArray(card.keywords) &&
                (card.keywords.includes('forge') || card.keywords.includes('construct') || card.keywords.includes('array')))
        )).length;
        if (forgeCount <= 0) return;

        resonance.procUsedThisTurn = true;
        const drawCount = Math.max(0, Math.floor(Number(resonance.firstForgeDraw) || 0));
        const blockAmount = Math.max(0, Math.floor(Number(resonance.forgePulseBlock) || 0));
        const damageAmount = Math.max(1, Math.floor(Number(resonance.forgePulseDamage) || 0));
        if (drawCount > 0) this.drawCards(drawCount);
        if (blockAmount > 0) this.addBlock(blockAmount);

        const battle = this.game && this.game.battle ? this.game.battle : null;
        if (!battle || !Array.isArray(battle.enemies)) {
            Utils.showBattleLog(`【灵傀锻阵】炉阵共振：抽牌 +${drawCount}，护盾 +${blockAmount}`);
            return;
        }

        const aliveEnemies = battle.enemies.filter(e => e && e.currentHp > 0);
        if (aliveEnemies.length === 0) {
            Utils.showBattleLog(`【灵傀锻阵】炉阵共振：抽牌 +${drawCount}，护盾 +${blockAmount}`);
            return;
        }

        const target = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
        const dealt = battle.dealDamageToEnemy(target, damageAmount);
        Utils.showBattleLog(`【灵傀锻阵】炉阵共振：抽牌 +${drawCount}，护盾 +${blockAmount}，并对 ${target.name} 造成 ${dealt} 伤害`);
        if (typeof battle.markUIDirty === 'function') battle.markUIDirty('player', 'hand', 'piles', 'enemies');
    }

    // 准备战斗
    // 修复牌组数据（每次战斗前重置，防止费用永久变更）
    sanitizeDeck() {
        if (!this.deck || this.deck.length === 0) return;

        this.deck = this.deck.map(card => {
            if (!card || !card.id || !CARDS[card.id]) return card;

            // 基于原始数据重建卡牌
            let freshCard = JSON.parse(JSON.stringify(CARDS[card.id])); // 深拷贝原始数据

            // 如果已升级，应用升级效果
            if (card.upgraded) {
                // upgradeCard 返回新对象，优先使用 cards.js 中的详细逻辑
                if (typeof upgradeCard === 'function') {
                    freshCard = upgradeCard(freshCard);
                } else if (typeof Utils.upgradeCard === 'function') {
                    freshCard = Utils.upgradeCard(freshCard);
                } else {
                    freshCard.upgraded = true; // Fallback
                    freshCard.name += '+'; // Visual
                }
            }

            // 保留实例ID (如果存在)
            if (card.instanceId) freshCard.instanceId = card.instanceId;
            else freshCard.instanceId = this.generateCardId();

            return freshCard;
        });
    }

    // 添加卡牌到弃牌堆 (用于状态牌等)
    addCardToDiscard(cardId) {
        const cardDef = CARDS[cardId];
        if (!cardDef) return;

        const newCard = JSON.parse(JSON.stringify(cardDef));
        newCard.instanceId = this.generateCardId();
        this.discardPile.push(newCard);

        Utils.showBattleLog(`获得卡牌：${newCard.name}`);
    }

    // 重置战斗临时状态 (用于离开战斗或切换场景)
    resetBattleState() {
        this.block = 0;
        this.buffs = {}; // Clear temp buffs
        this.hand = [];
        this.drawPile = [];
        this.discardPile = [];
        this.exhaustPile = [];
        this.currentEnergy = this.baseEnergy;
        this.skillCooldown = 0;
        this.ringResonanceSkillDrawUsedThisTurn = false;
        this.relicSkillDrawUsedThisTurn = false;
        this.ringConvergenceAttackBoostUsedThisTurn = false;
        this.relicAttackEnergyUsedThisTurn = false;
        this.pathDoctrineSkillChainCountThisTurn = 0;
        this.pathDoctrineSkillChainDrawUsedThisTurn = false;
        if (this.legacyRunDoctrine && typeof this.legacyRunDoctrine === 'object') {
            this.legacyRunDoctrine.entropyProcUsedThisTurn = false;
            this.legacyRunDoctrine.entropyBonusEnergyUsed = false;
            this.legacyRunDoctrine.bulwarkProcUsedThisTurn = false;
            this.legacyRunDoctrine.stormcraftProcUsedThisTurn = false;
            this.legacyRunDoctrine.vitalweaveProcUsedThisTurn = false;
        }
        this.normalizeRunVows();
        this.resetRunVowBattleState();
    }

    // 准备战斗
    prepareBattle() {
        this.ensureAdventureBuffs();
        this.normalizeRunPath();
        this.ensureRunPathProgress();
        this.normalizeRunDestiny();
        this.normalizeRunVows();
        this.normalizeSpiritCompanion();
        this.resetRunPathBattleState();
        this.resetRunDestinyBattleState();
        this.resetRunVowBattleState();
        this.resetSpiritCompanionBattleState();
        // 关键修复：战斗前净化牌组，修复潜在的费用错误
        this.sanitizeDeck();

        this.hand = [];
        // 关键修复：战斗牌堆必须是深拷贝，防止战斗中修改污染原牌组（如费用变化）
        this.drawPile = Utils.shuffle(JSON.parse(JSON.stringify(this.deck)));
        this.discardPile = [];
        this.exhaustPile = [];
        this.block = 0;

        // 战斗开始重置奶糖
        this.milkCandy = this.maxMilkCandy;
        this.ringResonanceSkillDrawUsedThisTurn = false;
        this.relicSkillDrawUsedThisTurn = false;
        this.ringConvergenceAttackBoostUsedThisTurn = false;
        this.relicAttackEnergyUsedThisTurn = false;
        this.pathDoctrineSkillChainCountThisTurn = 0;
        this.pathDoctrineSkillChainDrawUsedThisTurn = false;

        this.turnNumber = 0; // 初始化回合数
        this.skillCooldown = 0; // 进入战斗时重置技能冷却

        // 确保战斗前属性是最新的
        this.recalculateStats();

        // 注入【心魔】卡 (根据用户需求，渡劫后的层数都会携带心魔)
        // 5-9: 1张, 10-14: 2张, 15+: 3张, 18: 2张
        let heartDemonCount = 0;
        if (this.realm === 18) heartDemonCount = 2; // 第十八重特殊处理
        else if (this.realm >= 15) heartDemonCount = 3;
        else if (this.realm >= 10) heartDemonCount = 2;
        else if (this.realm >= 5) heartDemonCount = 1;

        if (heartDemonCount > 0 && CARDS['heartDemon']) {
            for (let i = 0; i < heartDemonCount; i++) {
                const demonCard = JSON.parse(JSON.stringify(CARDS['heartDemon']));
                demonCard.instanceId = this.generateCardId();
                // 插入抽牌堆并打乱
                this.drawPile.push(demonCard);
            }
            // 重新打乱以确保随机分布
            this.drawPile = Utils.shuffle(this.drawPile);
            Utils.showBattleLog(`【心魔来袭】似乎有 ${heartDemonCount} 个不祥的影子混入了牌组...`);
        }

        this.currentEnergy = this.baseEnergy;
        this.buffs = {};
        this.resolveArchetypeResonance();
        if (this.legacyRunDoctrine && typeof this.legacyRunDoctrine === 'object') {
            this.legacyRunDoctrine.entropyProcUsedThisTurn = false;
            this.legacyRunDoctrine.entropyBonusEnergyUsed = false;
            this.legacyRunDoctrine.bulwarkProcUsedThisTurn = false;
            this.legacyRunDoctrine.stormcraftProcUsedThisTurn = false;
            this.legacyRunDoctrine.vitalweaveProcUsedThisTurn = false;
        }

        // 应用永久力量加成
        if (this.permaBuffs && this.permaBuffs.strength) {
            this.addBuff('strength', this.permaBuffs.strength);
        }

        // 命环路径：敏捷之环 - 闪避率 +10%
        if (this.fateRing && this.fateRing.path === 'agility') {
            this.addBuff('dodgeChance', 0.1);
        }
        // 命环路径：回响之环 - 开场获得上限外奶糖
        if (this.fateRing && this.fateRing.path === 'resonance') {
            this.milkCandy = Math.min(this.maxMilkCandy + 2, this.milkCandy + 1);
            Utils.showBattleLog('回响之环：开场奶糖 +1');
        }
        if (this.fateRing && this.fateRing.path === 'convergence') {
            this.gainEnergy(1);
            Utils.showBattleLog('汇流之环：开场灵力 +1');
        }

        // 遗物效果：金刚法相 (无欲)
        if (this.relic && this.relic.id === 'vajraBody') {
            const level = this.fateRing ? this.fateRing.level : 0;
            const blockAmt = 6 + level;
            this.block += blockAmt;
            Utils.showBattleLog(`金刚法相：获得 ${blockAmt} 护盾`);
        }

        // 遗物效果：真理之镜 (严寒)
        if (this.relic && this.relic.id === 'scholarLens') {
            const level = this.fateRing ? this.fateRing.level : 0;
            const count = level >= 5 ? 2 : 1; // 5级后给2张

            // 随机获得技能牌（0费，临时）
            const skills = ['meditation', 'spiritBoost', 'quickDraw', 'concentration', 'powerUp', 'divineShield', 'fateTwist'];

            for (let i = 0; i < count; i++) {
                const randomSkill = skills[Math.floor(Math.random() * skills.length)];
                const card = CARDS[randomSkill];
                if (card) {
                    this.hand.push({ ...card, instanceId: this.generateCardId(), isTemp: true });
                }
            }
            Utils.showBattleLog(`真理之镜：获得 ${count} 张临时技能牌`);
        }
        if (this.relic && this.relic.id === 'starsealCompass') {
            this.milkCandy = Math.min(this.maxMilkCandy + 2, this.milkCandy + 1);
            Utils.showBattleLog('星封罗盘：开场奶糖 +1');
        }
        if (this.relic && this.relic.id === 'artifactPulse') {
            this.addBlock(6);
            Utils.showBattleLog('灵器脉印：开场护盾 +6');
        }

        // 命环路径：智慧之环 (额外获得2张随机技能牌)
        if (this.fateRing.path === 'wisdom') {
            const skills = ['meditation', 'spiritBoost', 'quickDraw', 'concentration', 'powerUp', 'analysis'];
            for (let i = 0; i < 2; i++) {
                const randomSkill = skills[Math.floor(Math.random() * skills.length)];
                const card = CARDS[randomSkill];
                if (card) {
                    this.hand.push({ ...card, instanceId: this.generateCardId(), isTemp: true });
                }
            }
            Utils.showBattleLog('智慧之环：获得额外技能牌');
        }

        if (this.archetypeResonance && this.archetypeResonance.openingBlock > 0) {
            this.addBlock(this.archetypeResonance.openingBlock);
        }

        // 局外传承预设：每场战斗开场额外护盾
        if (this.legacyRunDoctrine && this.legacyRunDoctrine.openingBattleBlockBonus > 0) {
            this.addBlock(this.legacyRunDoctrine.openingBattleBlockBonus);
            Utils.showBattleLog(`传承道统：开场护盾 +${this.legacyRunDoctrine.openingBattleBlockBonus}`);
        }

        if (this.consumeAdventureBuff('openingBlockBoostBattles', 1)) {
            this.addBlock(10);
            Utils.showBattleLog('行旅增益：结界余韵生效，开场护盾 +10');
        }

        const runPathMeta = this.getRunPathMeta();
        const runPathEffects = this.getRunPathEffects();
        if (runPathMeta && Number(runPathEffects.openingBlock) > 0) {
            const blockGain = Math.max(0, Math.floor(Number(runPathEffects.openingBlock) || 0));
            if (blockGain > 0) {
                this.addBlock(blockGain);
                Utils.showBattleLog(`命途【${runPathMeta.name}】开场护盾 +${blockGain}`);
            }
        }

        const destinyMeta = this.getRunDestinyMeta();
        const destinyEffects = destinyMeta ? destinyMeta.effects : null;
        if (destinyMeta && destinyEffects && Number(destinyEffects.openingBlock) > 0) {
            const blockGain = Math.max(0, Math.floor(Number(destinyEffects.openingBlock) || 0));
            if (blockGain > 0) {
                this.addBlock(blockGain);
                Utils.showBattleLog(`命格【${destinyMeta.name}】开场护盾 +${blockGain}`);
            }
        }

        const vowEffects = this.getRunVowEffects();
        if (Number(vowEffects.openingBlock) > 0) {
            const blockGain = Math.max(0, Math.floor(Number(vowEffects.openingBlock) || 0));
            if (blockGain > 0) {
                this.addBlock(blockGain);
                Utils.showBattleLog(`誓约加持：开场护盾 +${blockGain}`);
            }
        }
        if (Number(vowEffects.battleStartHpLoss) > 0) {
            const hpLoss = Math.min(
                Math.max(0, Math.floor(Number(vowEffects.battleStartHpLoss) || 0)),
                Math.max(0, this.currentHp - 1)
            );
            if (hpLoss > 0) {
                this.currentHp -= hpLoss;
                Utils.showBattleLog(`誓约代价：开场失去 ${hpLoss} 点生命`);
            }
        }
    }

    // 应用命环加成 - 已废弃，由recalculateStats替代
    // applyFateRingBonuses() { ... }

    // 开始回合
    startTurn() {
        this.ensureAdventureBuffs();
        this.normalizeRunPath();
        this.ensureRunPathProgress();
        this.normalizeRunDestiny();
        this.normalizeRunVows();
        this.normalizeSpiritCompanion();
        if (this.skillCooldown > 0) {
            this.skillCooldown--;
        }

        this.turnNumber++; // 增加回合计数
        this.currentEnergy = this.baseEnergy;
        if (this.archetypeResonance) {
            this.archetypeResonance.procUsedThisTurn = false;
        }
        this.ringResonanceSkillDrawUsedThisTurn = false;
        this.relicSkillDrawUsedThisTurn = false;
        this.ringConvergenceAttackBoostUsedThisTurn = false;
        this.relicAttackEnergyUsedThisTurn = false;
        this.pathDoctrineSkillChainCountThisTurn = 0;
        this.pathDoctrineSkillChainDrawUsedThisTurn = false;
        if (!this.runPathBattleState || typeof this.runPathBattleState !== 'object') {
            this.resetRunPathBattleState();
        }
        this.runPathBattleState.firstSkillDrawUsedThisTurn = false;
        if (!this.runDestinyBattleState || typeof this.runDestinyBattleState !== 'object') {
            this.resetRunDestinyBattleState();
        }
        this.runDestinyBattleState.firstSkillDrawUsedThisTurn = false;
        if (!this.runVowBattleState || typeof this.runVowBattleState !== 'object') {
            this.resetRunVowBattleState();
        }
        this.runVowBattleState.firstExhaustDrawUsedThisTurn = false;
        if (!this.spiritCompanionBattleState || typeof this.spiritCompanionBattleState !== 'object') {
            this.resetSpiritCompanionBattleState();
        }
        this.spiritCompanionBattleState.firstSkillDrawUsedThisTurn = false;
        this.spiritCompanionBattleState.firstBlockBonusUsedThisTurn = false;
        this.spiritCompanionBattleState.onLoseHpPulseUsedThisTurn = false;
        this.spiritCompanionBattleState.nthCardPassiveProcCount = 0;
        if (this.legacyRunDoctrine && typeof this.legacyRunDoctrine === 'object') {
            this.legacyRunDoctrine.entropyProcUsedThisTurn = false;
            this.legacyRunDoctrine.bulwarkProcUsedThisTurn = false;
            this.legacyRunDoctrine.stormcraftProcUsedThisTurn = false;
            this.legacyRunDoctrine.vitalweaveProcUsedThisTurn = false;
        }

        const destinyMeta = this.getRunDestinyMeta();
        const destinyEffects = destinyMeta ? destinyMeta.effects : null;
        if (
            destinyMeta
            && destinyEffects
            && !this.runDestinyBattleState.firstTurnBonusApplied
            && this.turnNumber === 1
        ) {
            const drawBonus = Math.max(0, Math.floor(Number(destinyEffects.firstTurnDraw) || 0));
            const energyBonus = Math.max(0, Math.floor(Number(destinyEffects.firstTurnEnergy) || 0));
            if (drawBonus > 0) {
                this.drawCards(drawBonus);
                Utils.showBattleLog(`命格【${destinyMeta.name}】首回合抽牌 +${drawBonus}`);
            }
            if (energyBonus > 0) {
                this.gainEnergy(energyBonus);
                Utils.showBattleLog(`命格【${destinyMeta.name}】首回合灵力 +${energyBonus}`);
            }
            this.runDestinyBattleState.firstTurnBonusApplied = true;
        }

        const vowEffects = this.getRunVowEffects();
        if (
            this.runVowBattleState
            && !this.runVowBattleState.firstTurnBonusApplied
            && this.turnNumber === 1
        ) {
            const drawBonus = Math.max(0, Math.floor(Number(vowEffects.firstTurnDraw) || 0));
            const energyBonus = Math.max(0, Math.floor(Number(vowEffects.firstTurnEnergy) || 0));
            if (drawBonus > 0) {
                this.drawCards(drawBonus);
                Utils.showBattleLog(`誓约之力：首回合抽牌 +${drawBonus}`);
            }
            if (energyBonus > 0) {
                this.gainEnergy(energyBonus);
                Utils.showBattleLog(`誓约之力：首回合灵力 +${energyBonus}`);
            }
            this.runVowBattleState.firstTurnBonusApplied = true;
        }

        if (destinyMeta && destinyEffects) {
            const healThreshold = Number(destinyEffects.turnStartHealBelowPct);
            const healAmount = Math.max(0, Math.floor(Number(destinyEffects.turnStartHealAmount) || 0));
            if (
                Number.isFinite(healThreshold)
                && healThreshold > 0
                && healAmount > 0
                && this.maxHp > 0
                && this.currentHp / this.maxHp <= healThreshold
            ) {
                this.heal(healAmount);
                Utils.showBattleLog(`命格【${destinyMeta.name}】回合回复 ${healAmount} 点生命`);
            }
        }

        // 1. 灵气稀薄 (realm 1) - 改为护盾效果-20%，更友好的新手体验
        // 效果在addBlock方法中处理

        // 护盾每回合清零 (除非拥有'retainBlock'效果)
        let keepBlock = false;

        // Fix: Damage Reduction expires at start of next turn (ensures it lasts through control/skips)
        if (this.buffs.damageReduction) {
            delete this.buffs.damageReduction;
            // Utils.showBattleLog('减伤效果已消散');
        }

        try {
            keepBlock = this.hasBuff('retainBlock') ||
                (this.collectedLaws && this.collectedLaws.some(l => l && l.passive && l.passive.type === 'retainBlock')) ||
                (this.activeResonances && this.activeResonances.some(r => r.effect && (r.effect.type === 'persistentBlock' || r.effect.type === 'retainBlock')));
        } catch (e) {
            console.warn('Error checking block retention:', e);
        }

        if (!keepBlock) {
            this.block = 0;
        } else {
            // Decrement retainBlock buff if it was the reason for keeping block
            if (this.hasBuff('retainBlock')) {
                this.buffs.retainBlock--;
            }
        }

        // 触发法宝回合开始效果
        this.triggerTreasureEffect('onTurnStart');

        // 遗物效果：治愈之血 (香叶)
        if (this.relic && this.relic.id === 'healingBlood') {
            const level = this.fateRing ? this.fateRing.level : 0;
            const healAmt = 2 + Math.floor(level / 3);
            this.heal(healAmt);
            Utils.showBattleLog(`治愈之血：回复 ${healAmt} 生命`);
        }

        // ... 其他代码 ...

        // 3. 重力压制 (realm 3) - 仅首回合抽牌-1
        let drawAmount = this.drawCount;
        if (this.realm === 3 && this.turnNumber === 1) {
            drawAmount = Math.max(0, drawAmount - 1);
            Utils.showBattleLog('重力压制：首回合抽牌-1');
        }

        // 局外传承：首回合额外抽牌
        if (this.turnNumber === 1 && this.legacyBonuses && this.legacyBonuses.firstTurnDrawBonus > 0) {
            drawAmount += this.legacyBonuses.firstTurnDrawBonus;
            Utils.showBattleLog(`传承启示：首回合额外抽 ${this.legacyBonuses.firstTurnDrawBonus} 张牌`);
        }
        if (this.turnNumber === 1 && this.consumeAdventureBuff('firstTurnDrawBoostBattles', 1)) {
            drawAmount += 1;
            Utils.showBattleLog('行旅增益：战术推演生效，首回合额外抽 1 张牌');
        }
        if (this.turnNumber === 1 && this.consumeAdventureBuff('firstTurnEnergyBoostBattles', 1)) {
            this.currentEnergy += 1;
            Utils.showBattleLog('行旅增益：灵息协同生效，首回合灵力 +1');
        }

        // 敏捷之环 - 额外抽牌
        if (this.fateRing.path === 'agility') {
            drawAmount += 1;
        }

        // 疾风之势法则
        const windLaw = this.collectedLaws.find(l => l.id === 'windSpeed');
        if (windLaw) {
            drawAmount += windLaw.passive.value;
        }

        // 检查心魔卡 (占据抽牌位)
        // 这些卡因为 'retain' 属性而留在手中，在此处计算并减少抽牌量
        const occupiedSlots = this.hand.filter(c => c.occupiesDrawSlot).length;
        if (occupiedSlots > 0) {
            drawAmount = Math.max(0, drawAmount - occupiedSlots);
            Utils.showBattleLog(`心魔作祟：抽牌数 -${occupiedSlots}`);
        }

        this.drawCards(drawAmount);

        // --- P0 机制：地图污染 (Map Pollution) 首回合消耗一张手牌 ---
        const battleNode = this.game && this.game.currentBattleNode ? this.game.currentBattleNode : null;
        if (battleNode && battleNode.polluted && this.turnNumber === 1 && this.hand.length > 0) {
            const randomIdx = Math.floor(Math.random() * this.hand.length);
            const exCard = this.hand.splice(randomIdx, 1)[0];
            if (!this.exhaustPile) this.exhaustPile = [];
            this.exhaustPile.push(exCard);
            const cardName = exCard && exCard.name ? exCard.name : '未知卡牌';
            Utils.showBattleLog(`【煞气侵蚀】灵气紊乱，你的 [${cardName}] 意外消散了！`, 'danger');
        }

        // 2. 雷霆淬体 (realm 2)
        if (this.realm === 2) {
            this.takeDamage(3);
            Utils.showBattleLog('雷霆淬体：受到3点雷伤');
        }

        // 7. 虚空吞噬 (realm 7)
        if (this.realm === 7) {
            const drain = Math.floor(this.maxHp * 0.05);
            this.takeDamage(drain);
            Utils.showBattleLog(`虚空吞噬：失去 ${drain} 点生命`);
        }

        // 处理回合开始的buff
        this.processBuffsOnTurnStart();

        // 共鸣：混沌风暴
        const chaoticStorm = this.activeResonances.find(r => r.id === 'chaoticStorm');
        if (chaoticStorm) {
            const dmg = Utils.random(chaoticStorm.effect.min, chaoticStorm.effect.max);
            // 假设game.battle存在且能访问enemies
            if (this.game && this.game.battle && this.game.battle.enemies) {
                const enemies = this.game.battle.enemies.filter(e => e.currentHp > 0);
                if (enemies.length > 0) {
                    const target = enemies[Math.floor(Math.random() * enemies.length)];
                    this.game.battle.dealDamageToEnemy(target, dmg);
                    Utils.showBattleLog(`混沌风暴轰击！造成 ${dmg} 点雷伤`);
                }
            }
        }

        // 治愈法则 (Healing Law)
        const healingLaw = this.collectedLaws.find(l => l.id === 'healingLaw');
        if (healingLaw) {
            this.heal(healingLaw.passive.value);
            Utils.showBattleLog(`治愈法则：恢复 ${healingLaw.passive.value} 生命`);
        }

        // 混沌法则 (Chaos Law): 随机Buff/Debuff
        const chaosLaw = this.collectedLaws.find(l => l.id === 'chaosLaw');
        if (chaosLaw) {
            const isGood = Math.random() < 0.5;
            if (isGood) {
                const buffs = ['strength', 'blockOnAttack', 'energyOnVulnerable', 'nextAttackBonus'];
                const buff = buffs[Math.floor(Math.random() * buffs.length)];
                this.addBuff(buff, chaosLaw.passive.value);
                Utils.showBattleLog(`混沌之触：获得随机强化！`);
            } else {
                if (this.game && this.game.battle && this.game.battle.enemies) {
                    const enemies = this.game.battle.enemies.filter(e => e.currentHp > 0);
                    if (enemies.length > 0) {
                        const target = enemies[Math.floor(Math.random() * enemies.length)];
                        const debuffs = ['vulnerable', 'weak', 'burn', 'poison'];
                        const debuff = debuffs[Math.floor(Math.random() * debuffs.length)];
                        target.buffs[debuff] = (target.buffs[debuff] || 0) + chaosLaw.passive.value;
                        Utils.showBattleLog(`混沌之触：给予敌人随机诅咒！`);
                        if (this.game.battle.updateBattleUI) this.game.battle.updateBattleUI();
                    }
                }
            }
        }

        // 共鸣：维度打击 (Dimension Strike)
        const dimStrike = this.activeResonances.find(r => r.id === 'dimensionStrike');
        if (dimStrike) {
            if (Math.random() < dimStrike.effect.chance) {
                // 选项1: 手牌中随机3张耗能-1
                const candidates = this.hand.filter(c => c.cost > 0 && !c.isTemp); // 排除0费和临时卡? 临时卡usually cost 0? 
                // 只是简单的 c.cost > 0 即可

                // Shuffle candidates indices or pick random
                // Fisher-Yates like select
                const targets = [];
                const costCards = this.hand.filter(c => c.cost > 0);

                if (costCards.length > 0) {
                    const count = Math.min(dimStrike.effect.count || 3, costCards.length);
                    // Shuffle costCards to pick random ones
                    const shuffled = Utils.shuffle([...costCards]);
                    const selected = shuffled.slice(0, count);

                    selected.forEach(card => {
                        card.cost = Math.max(0, card.cost - 1);
                    });

                    Utils.showBattleLog(`维度打击：${count} 张手牌耗能 -1！`);
                } else {
                    Utils.showBattleLog('维度打击：无牌可减费！');
                }
            } else {
                // 选项2: 抽2张牌
                this.drawCards(2);
                Utils.showBattleLog('维度打击：额外抽2张牌！');
            }
        }

        // 五行共鸣：4件套 回合开始特效
        const elCounts = this.getElementalCounts();

        // Fire (4): 烈焰焚天 - 对所有敌人施加2层灼烧
        if (elCounts.fire >= 4) {
            if (this.game && this.game.battle && this.game.battle.enemies) {
                this.game.battle.enemies.forEach(e => {
                    if (e.isAlive()) {
                        e.buffs.burn = (e.buffs.burn || 0) + 2;
                    }
                });
                Utils.showBattleLog('【火之共鸣】烈焰缭绕，灼烧全场！');
            }
        }

        // Water (4): 柔水滋养 - 恢复3生命，获得3护盾
        if (elCounts.water >= 4) {
            this.heal(3);
            this.addBlock(3);
            Utils.showBattleLog('【水之共鸣】流水不腐，生生不息！');
        }

        // Wood (4): 生机勃勃 - 恢复6生命
        if (elCounts.wood >= 4) {
            this.heal(6);
            Utils.showBattleLog('【木之共鸣】万物生长！');
        }

        // Metal (4): 锋芒毕露 - 获得2力量
        if (elCounts.metal >= 4) {
            this.addBuff('strength', 2);
            Utils.showBattleLog('【金之共鸣】如封似闭，锋芒毕露！');
        }

        // Earth (4): 不动如山 - 获得10护盾
        if (elCounts.earth >= 4) {
            this.addBlock(10);
            Utils.showBattleLog('【土之共鸣】大地守护！');
        }
    }

    // 应用法则被动
    applyLawPassives() {
        // ... (existing code)
        const chaosLaw = this.collectedLaws.find(l => l.id === 'chaosLaw');
        if (chaosLaw) {
            this.addBuff('chaosAura', 1);
        }
    }

    // 添加永久属性加成
    addPermaBuff(type, value) {
        if (this.permaBuffs[type] !== undefined) {
            this.permaBuffs[type] += value;
            this.recalculateStats();
        } else {
            // Handle stats that are not directly stored in permaBuffs object structure if needed? 
            // For now assuming types match keys.
            this.permaBuffs[type] = (this.permaBuffs[type] || 0) + value;
            this.recalculateStats();
        }
    }

    // 添加护盾
    addBlock(amount) {
        if (typeof amount !== 'number' || isNaN(amount)) {
            console.error('addBlock received invalid amount', amount);
            return;
        }

        // 环境：古战场 - 无法获得护盾
        try {
            const activeBattle = (typeof window !== 'undefined' && window.game && window.game.battle) ? window.game.battle : null;
            if (activeBattle && activeBattle.environmentState && activeBattle.environmentState.noBlock) {
                Utils.showBattleLog('古战场：无法获得护盾！');
                return;
            }
        } catch (e) {
            // Ignore environment check errors
        }

        const destinyMeta = this.getRunDestinyMeta();
        const destinyEffects = destinyMeta ? destinyMeta.effects : null;
        if (
            destinyMeta
            && destinyEffects
            && Number(destinyEffects.firstBlockGainBonusPct) > 0
            && this.runDestinyBattleState
            && !this.runDestinyBattleState.firstBlockBonusUsed
        ) {
            const bonusPct = Math.max(0, Number(destinyEffects.firstBlockGainBonusPct) || 0);
            const bonusValue = Math.floor(amount * bonusPct);
            if (bonusValue > 0) {
                amount += bonusValue;
                this.runDestinyBattleState.firstBlockBonusUsed = true;
                Utils.showBattleLog(`命格【${destinyMeta.name}】首段护盾强化 +${bonusValue}`);
            }
        }

        const vowEffects = this.getRunVowEffects();
        if (Number(vowEffects.blockGainMultiplier) > 0) {
            const bonusPct = Math.max(0, Number(vowEffects.blockGainMultiplier) || 0);
            const bonusValue = Math.floor(amount * bonusPct);
            if (bonusValue > 0) {
                amount += bonusValue;
                Utils.showBattleLog(`誓约之力：护势加深 +${bonusValue}`);
            }
        }

        const spiritMeta = this.getSpiritCompanionMeta();
        const spiritEffects = this.getSpiritCompanionEffects().passive || {};
        if (
            spiritMeta
            && Number(spiritEffects.firstBlockBonusPerTurn) > 0
            && Math.max(0, Math.floor(Number(this.turnNumber) || 0)) > 0
            && this.ensureSpiritCompanionBattleState()
            && !this.spiritCompanionBattleState.firstBlockBonusUsedThisTurn
        ) {
            const bonus = Math.max(0, Math.floor(Number(spiritEffects.firstBlockBonusPerTurn) || 0));
            if (bonus > 0) {
                amount += bonus;
                this.spiritCompanionBattleState.firstBlockBonusUsedThisTurn = true;
                Utils.showBattleLog(`灵契【${spiritMeta.name}】厚甲护道 +${bonus}`);
            }
        }

        // 1. 灵气稀薄 (realm 1) - 护盾效果-20%
        if (this.realm === 1) {
            amount = Math.floor(amount * 0.8);
        }

        // 命环路径护盾加成/减益
        const path = this.fateRing.path;
        if (path === 'toughness') amount = Math.floor(amount * 1.3); // 坚韧: +30%
        if (path === 'destruction') amount = Math.floor(amount * 0.8); // 毁灭: -20%

        // 大地护盾法则
        const earthLaw = this.collectedLaws.find(l => l.id === 'earthShield');
        if (earthLaw) {
            amount += earthLaw.passive.value;
        }

        // 金属法则 (Metal Body)
        const metalLaw = this.collectedLaws.find(l => l.id === 'metalBody');
        if (metalLaw) {
            amount = Math.floor(amount * (1 + metalLaw.passive.value)); // +25%
        }

        // 法宝：护盾获得前修正（如铁壁符）
        if (this.triggerTreasureValueEffect) {
            amount = this.triggerTreasureValueEffect('onGainBlock', amount);
        }

        if (typeof amount !== 'number' || isNaN(amount)) return;
        amount = Math.floor(amount);
        if (amount <= 0) return;

        this.block += amount;
        this.triggerArchetypeBlockProc(amount);

        if (this.game && typeof this.game.handleLegacyMissionProgress === 'function') {
            this.game.handleLegacyMissionProgress('gainBlock', amount);
        }
        if (this.game && typeof this.game.handleRunPathProgress === 'function') {
            this.game.handleRunPathProgress('gainBlock', amount);
        }
    }

    // 治疗
    heal(amount) {
        // --- P0 机制：地图路线污染 (Map Route Pollution) ---
        const battleNode = this.game ? this.game.currentBattleNode : null;
        if (battleNode && battleNode.polluted) {
            Utils.showBattleLog('【煞气侵蚀】灵脉污染，无法恢复生命！', 'danger');
            return;
        }

        if (typeof amount !== 'number' || isNaN(amount)) {
            console.error('heal received invalid amount', amount);
            return;
        }
        const destinyMeta = this.getRunDestinyMeta();
        const destinyEffects = destinyMeta ? destinyMeta.effects : null;
        const vowEffects = this.getRunVowEffects();
        const doctrineProfile = this.getPathDoctrineProfile();
        if (doctrineProfile.path === 'destruction' && doctrineProfile.tier > 0) {
            const adjusted = Math.max(0, Math.floor(amount * doctrineProfile.healEfficiency));
            if (adjusted < amount) {
                Utils.showBattleLog(`毁灭教义：治疗效率降低至 ${Math.round(doctrineProfile.healEfficiency * 100)}%`);
            }
            amount = adjusted;
        }
        if (
            Number.isFinite(Number(vowEffects.healMultiplier))
            && Number(vowEffects.healMultiplier) > 0
            && Number(vowEffects.healMultiplier) < 1
        ) {
            const adjusted = Math.max(0, Math.floor(amount * Number(vowEffects.healMultiplier)));
            if (adjusted < amount) {
                Utils.showBattleLog(`誓约代价：治疗效率降低至 ${Math.round(Number(vowEffects.healMultiplier) * 100)}%`);
            }
            amount = adjusted;
        }

        const oldHp = this.currentHp;
        this.currentHp = Math.min(this.maxHp, this.currentHp + amount);
        let finalActualHeal = this.currentHp - oldHp;

        // 共鸣：神魔一念 (GodDemon) - 溢出治疗转伤害
        if (this.activeResonances) {
            const godDemon = this.activeResonances.find(r => r.id === 'godDemon');
            if (godDemon) {
                // 1. 治疗加成 50% (已经包含在传入amount里？不，这里effect says bonus 50%)
                // 如果我们要实现bonus，应该在入口加。
                // 但为了避免递归或复杂，假设传入前未加成？或者在这里加成？
                // 更好的方式：heal(amount) 是基础方法。
                // 让我们修改amount。
                const bonusAmount = Math.floor(amount * godDemon.effect.healBonus); // +50%
                // 重新计算
                const potentialTotal = amount + bonusAmount;
                this.currentHp = Math.min(this.maxHp, oldHp + potentialTotal);
                const newActualHeal = this.currentHp - oldHp;
                finalActualHeal = newActualHeal;

                const overflow = potentialTotal - newActualHeal;

                if (overflow > 0 && this.game && this.game.battle && this.game.battle.enemies) {
                    const enemies = this.game.battle.enemies.filter(e => e.currentHp > 0);
                    if (enemies.length > 0) {
                        const target = enemies[Math.floor(Math.random() * enemies.length)];
                        // 真实伤害
                        target.currentHp -= overflow;
                        Utils.showBattleLog(`神魔一念：${overflow} 点溢出治疗化为真实伤害！`);
                        const enemyEl = document.querySelector(`.enemy[data-index="${this.game.battle.enemies.indexOf(target)}"]`);
                        if (enemyEl) Utils.showFloatingNumber(enemyEl, overflow, 'damage');
                    }
                }

            }
        }
        if (destinyMeta && destinyEffects && Number(destinyEffects.overhealToBlockRatio) > 0) {
            const ratio = Math.max(0, Number(destinyEffects.overhealToBlockRatio) || 0);
            const overflow = Math.max(0, Math.floor(amount - finalActualHeal));
            if (overflow > 0) {
                const shield = Math.max(0, Math.floor(overflow * ratio));
                if (shield > 0) {
                    this.addBlock(shield);
                    Utils.showBattleLog(`命格【${destinyMeta.name}】溢疗转护盾 +${shield}`);
                }
            }
        }
        this.triggerArchetypeHealProc(finalActualHeal);
        return finalActualHeal;
    }

    // 恢复灵力
    gainEnergy(amount) {
        this.currentEnergy += amount;
        // 也可以选择在这里限制不超过 baseEnergy，或者允许溢出
        // 通常Roguelike里回合内加费可以溢出? 暂时不做上限限制以防万一
        // 但重置回合时会重置为 baseEnergy
    }

    // 受到伤害
    takeDamage(amount) {
        if (typeof amount !== 'number' || isNaN(amount)) {
            console.error('takeDamage received invalid amount', amount);
            amount = 0;
        }

        // 战斗新机制：架势影响承伤
        if (this.stance === 'aggressive') {
            amount = Math.floor(amount * 1.1);
        } else if (this.stance === 'defensive') {
            amount = Math.floor(amount * 0.85);
        }

        // 检查金刚法相（无欲 - 功德满值触发）
        if (this.buffs.impervious && this.buffs.impervious > 0) {
            this.buffs.impervious--;
            Utils.showBattleLog('💫 金刚法相庇护！完全免疫伤害！');
            return { dodged: true, damage: 0, impervious: true };
        }

        // 触发法宝回调 (onBeforeTakeDamage)
        // 例如：阴阳镜 (Yin Yang Mirror) - 几率转化伤害为治疗
        const context = { preventDamage: false };
        if (this.treasures) {
            amount = this.triggerTreasureValueEffect('onBeforeTakeDamage', amount, context);
        }

        if (context.preventDamage) {
            return { dodged: true, damage: 0 }; // Treated as dodge/prevented
        }
        if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
            return { dodged: true, damage: 0 };
        }

        // 共鸣：风空遁 (Astral Shift) - 闪避抽牌
        const astralShift = this.activeResonances.find(r => r.id === 'astralShift');

        // 0. 检查闪避率 (Dodge Chance) - 新增机制
        if (this.buffs.dodgeChance && this.buffs.dodgeChance > 0) {
            if (Math.random() < this.buffs.dodgeChance) {
                Utils.showBattleLog(`${this.name} 闪避了攻击！(几率: ${Math.floor(this.buffs.dodgeChance * 100)}%)`);
                return { dodged: true, damage: 0 };
            }
        }

        // 1. 检查绝对闪避
        if (this.buffs.dodge && this.buffs.dodge > 0) {
            // Realm 10: 大地束缚 - 20%几率闪避失败
            if (this.realm === 10 && Math.random() < 0.2) {
                Utils.showBattleLog(`大地束缚：闪避失效！`);
                // 继续受到伤害，不消耗闪避层数（或者消耗？通常失效也会消耗，这里假设失效不消耗还是消耗？）
                // 为了惩罚，让它失效但消耗层数可能太狠，或者失效但不消耗？
                // 这里选择：闪避失效，必须硬抗，层数保留或消耗？
                // 如果保留，下次还能闪，但这次被打。如果消耗，就是纯亏。
                // 既然是“闪避率降低”，那意味着这次尝试闪避失败了。
                this.buffs.dodge--;
            } else {
                this.buffs.dodge--;
                if (astralShift) {
                    this.drawCards(astralShift.effect.value);
                    Utils.showBattleLog(`风空遁触发！闪避并抽牌`);
                }
                return { dodged: true, damage: 0 };
            }
        }

        // 空间裂隙法则 - 随机闪避
        const spaceLaw = this.collectedLaws.find(l => l.id === 'spaceRift');
        const spaceDodgeChance = spaceLaw ? (spaceLaw.passive.dodgeChance ?? spaceLaw.passive.value ?? 0) : 0;
        if (spaceLaw && Math.random() < spaceDodgeChance) {
            if (astralShift) {
                this.drawCards(astralShift.effect.value);
                Utils.showBattleLog(`风空遁触发！闪避并抽牌`);
            }
            return { dodged: true, damage: 0 };
        }

        // 混沌法则 - 扭曲现实（10%几率让伤害归零）
        const chaosLaw = this.collectedLaws.find(l => l.id === 'chaosLaw');
        if (chaosLaw && Math.random() < 0.1) {
            Utils.showBattleLog('混沌之力扭曲了现实，伤害无效！');
            if (astralShift) {
                this.drawCards(astralShift.effect.value);
                Utils.showBattleLog(`风空遁触发！闪避并抽牌`);
            }
            return { dodged: true, damage: 0 };
        }

        // 检查易伤 (Vulnerable)
        if (this.buffs.vulnerable && this.buffs.vulnerable > 0) {
            amount = Math.floor(amount * 1.5);
        }

        if (this.buffs.mark && this.buffs.mark > 0) {
            amount += this.buffs.mark;
            Utils.showBattleLog(`你被抓到破绽！额外受到 ${this.buffs.mark} 伤害`);
            delete this.buffs.mark;
        }

        // 检查减伤 Buff (天地同寿等)
        if (this.buffs.damageReduction && this.buffs.damageReduction > 0) {
            // FIX: Cap reduction at 90% to prevent immunity
            const reduction = Math.min(90, this.buffs.damageReduction);
            amount = Math.floor(amount * (100 - reduction) / 100);

            Utils.showBattleLog(`减伤生效！抵消了 ${reduction}% 伤害`);
        }

        // 五行共鸣：3件套减伤 15%
        const elCounts = this.getElementalCounts();
        // Check if ANY element has >= 3
        const hasResonanceDefense = Object.values(elCounts).some(c => c >= 3);
        if (hasResonanceDefense) {
            const reduction = Math.floor(amount * 0.15);
            amount -= reduction;
            // Utils.showBattleLog(`五行护体！减免 ${reduction} 伤害`);
        }



        // 伤害保护机制 (One-shot Protection)
        // 单次伤害超过最大生命值 35% 的部分，减免 20% (受到的伤害为 80%)
        const damageCapThreshold = Math.floor(this.maxHp * 0.35);
        if (amount > damageCapThreshold) {
            const excess = amount - damageCapThreshold;
            const reducedExcess = Math.floor(excess * 0.8);
            amount = damageCapThreshold + reducedExcess;
            Utils.showBattleLog('触发伤害保护！');
        }

        // 先扣护盾
        let remainingDamage = amount;
        if (this.block > 0) {
            const blockAbsorbed = Math.min(this.block, remainingDamage);
            this.block -= blockAbsorbed;
            remainingDamage -= blockAbsorbed;
        }

        // 扣血
        if (remainingDamage > 0) {
            this.currentHp -= remainingDamage;
        }

        if (this.currentHp <= 0) {
            // 法宝：致死前拦截（如定海神针）
            if (this.triggerTreasureEffect) {
                const prevented = this.triggerTreasureEffect('onBeforeDeath');
                if (prevented === true && this.currentHp > 0) {
                    return { dodged: false, damage: amount - remainingDamage, prevented: true };
                }
            }

            // 命环路径：逆天之环 - 免疫一次致死伤害
            if (this.fateRing && this.fateRing.deathImmunityCount && this.fateRing.deathImmunityCount > 0) {
                this.fateRing.deathImmunityCount--;
                this.currentHp = 1;
                Utils.showBattleLog('逆天之环：免疫致死伤害！');
                return { dodged: false, damage: amount - remainingDamage };
            }

            // 共鸣：生命轮回 (Life Reincarnation) - 复活 (每场战斗1次)
            // 修改为 100% 血量复活
            const reincarnation = this.activeResonances.find(r => r.effect && r.effect.type === 'resurrect');
            if (reincarnation && (!this.resurrectCount || this.resurrectCount < (reincarnation.effect.value || 1))) {
                const healPercent = reincarnation.effect.percent || 1.0; // Default 100%
                this.currentHp = Math.floor(this.maxHp * healPercent);
                this.resurrectCount = (this.resurrectCount || 0) + 1;
                Utils.showBattleLog(`生命轮回：涅槃重生！恢复 ${Math.floor(healPercent * 100)}% 生命！`);
                return { dodged: false, damage: amount - remainingDamage }; // Stop death
            }

            // 时间静止 (Time Stop) - 免疫致死并结束回合
            const timeLaw = this.collectedLaws.find(l => l.id === 'timeStop');
            if (timeLaw && !this.timeStopTriggered) {
                this.currentHp = 1; // 保留1血
                this.timeStopTriggered = true;
                Utils.showBattleLog('时间静止！免疫了致死伤害！');

                // 强制结束回合 (如果是在敌人回合，应该让敌人停止行动？)
                // 通过抛出异常或设置标志位？
                // battle.js checkBattleEnd 会检查。
                // 我们可以设置一个 flag 让 battle.js 知道要中断。
                if (this.game && this.game.battle) {
                    this.game.battle.forceEndEnemyTurn = true;
                }

                return { dodged: false, damage: amount - remainingDamage };
            }

            // 9. 生死轮回 (realm 9)
            if (this.realm === 9 && !this.hasRebirthed && Math.random() < 0.5) {
                this.currentHp = this.maxHp;
                this.hasRebirthed = true;
                Utils.showBattleLog('生死轮回：逆天改命，满血复活！');
                return { dodged: false, damage: amount - remainingDamage };
            }

            this.currentHp = 0;
            // 触发死亡事件
        }

        // 因果法则 & 逆转法则 Handler
        const actualDamageTaken = amount - remainingDamage; // This logic seems flawed locally, let's look at `remainingDamage` usage.
        // `remainingDamage` is what hits HP. Block absorbed `amount - remainingDamage`.
        // So HP damage is `remainingDamage`.
        const hpDamage = remainingDamage > 0 ? remainingDamage : 0;

        if (hpDamage > 0) {
            // 逆转法则 (Reversal)
            const reversalLaw = this.collectedLaws.find(l => l.id === 'reversalLaw');
            if (reversalLaw && Math.random() < reversalLaw.passive.value) {
                this.heal(hpDamage * 2);
                Utils.showBattleLog(`逆转法则：伤害转化为治疗！`);
            }

            // 因果法则 (Karma)
            const karmaLaw = this.collectedLaws.find(l => l.id === 'karmaLaw');
            if (karmaLaw) {
                const reflectDmg = Math.floor(hpDamage * karmaLaw.passive.value);
                if (reflectDmg > 0 && this.game && this.game.battle && this.game.battle.enemies) {
                    const enemies = this.game.battle.enemies.filter(e => e.currentHp > 0);
                    if (enemies.length > 0) {
                        const target = enemies[Math.floor(Math.random() * enemies.length)];
                        this.game.battle.dealDamageToEnemy(target, reflectDmg);
                        Utils.showBattleLog(`因果法则：反弹 ${reflectDmg} 点伤害！`);
                    }
                }
            }

            if (
                this.game
                && this.game.battle
                && typeof this.game.battle.handleSpiritCompanionPlayerDamaged === 'function'
            ) {
                this.game.battle.handleSpiritCompanionPlayerDamaged(hpDamage);
            }
        }

        return { dodged: false, damage: hpDamage };
    }

    // 弃掉所有手牌
    discardHand() {
        const count = this.hand.length;
        while (this.hand.length > 0) {
            this.discardPile.push(this.hand.pop());
        }
        return count;
    }

    // 使用卡牌
    playCard(cardIndex, target, options = {}) {
        const card = this.hand[cardIndex];
        if (!card) return false;

        // Check if unplayable
        if (card.unplayable) {
            Utils.showBattleLog('此牌无法打出！');
            return false;
        }



        // 检查奶糖消耗
        // 规则: 明确标记 consumeCandy 的卡牌消耗奶糖，或者为了兼容性保留抽牌卡判定（但要小心）
        // 新规则: 优先使用 consumeCandy 属性。如果未设置，暂不消耗奶糖（除非为了向后兼容）
        // 鉴于我们已经修复了 cards.js，我们可以严格检查 consumeCandy

        // 计算消耗
        let energyCost = (options && typeof options.energyCostOverride === 'number') ? options.energyCostOverride : card.cost;
        let candyCost = 0;

        if (card.consumeCandy) {
            candyCost = 1; // 固定消耗1奶糖
            energyCost = 0; // 消耗奶糖的卡牌不需要消耗灵力
            // 注意: cards.js 中 consumeCandy 的卡牌 cost 通常设为 0
        }

        // Removed legacy fallback: "else if (card.effects.some...)"
        // We now enforce strict 'consumeCandy' property usage.

        // 检查灵力
        if (energyCost > 0 && this.currentEnergy < energyCost) {
            Utils.showBattleLog('灵力不足！');
            return false;
        }

        // 检查奶糖
        if (candyCost > 0 && this.milkCandy < candyCost) {
            Utils.showBattleLog('奶糖不足！无法发动抽牌');
            return false;
        }

        const prevEnergy = this.currentEnergy;
        const prevCandy = this.milkCandy;
        let cardRemovedFromHand = false;

        try {
            // 消耗资源
            if (energyCost > 0) this.currentEnergy -= energyCost;
            if (candyCost > 0) {
                this.milkCandy -= candyCost;
                // Update UI for candy? (Will be handled in Game/Battle updateUI)
            }

            // 苦行 (Asceticism) - 回合结束若有保留手牌，获得功德
            if (this.buffs.meritOnRetain) {
                const retainedCount = this.hand.filter(c => c.retain).length;
                if (retainedCount > 0) {
                    const meritGain = retainedCount * this.buffs.meritOnRetain;
                    if (this.fateRing && this.fateRing.gainMerit) {
                        this.fateRing.gainMerit(meritGain);
                        Utils.showBattleLog(`苦行：保留 ${retainedCount} 张牌，功德 +${meritGain}`);
                    }
                }
            }

            // 舍弃手牌（除非有保留效果）
            this.hand.splice(cardIndex, 1);
            cardRemovedFromHand = true;

            if (card.type === 'skill') {
                const runPathMeta = this.getRunPathMeta();
                const runPathEffects = this.getRunPathEffects();
                if (
                    runPathMeta
                    && Number(runPathEffects.firstSkillDrawPerTurn) > 0
                    && this.runPathBattleState
                    && !this.runPathBattleState.firstSkillDrawUsedThisTurn
                ) {
                    const drawAmount = Math.max(0, Math.floor(Number(runPathEffects.firstSkillDrawPerTurn) || 0));
                    if (drawAmount > 0) {
                        this.drawCards(drawAmount);
                        this.runPathBattleState.firstSkillDrawUsedThisTurn = true;
                        Utils.showBattleLog(`命途【${runPathMeta.name}】首个技能抽牌 +${drawAmount}`);
                    }
                }
                const destinyMeta = this.getRunDestinyMeta();
                const destinyEffects = destinyMeta ? destinyMeta.effects : null;
                if (
                    destinyMeta
                    && destinyEffects
                    && Number(destinyEffects.firstSkillDrawPerTurn) > 0
                    && this.runDestinyBattleState
                    && !this.runDestinyBattleState.firstSkillDrawUsedThisTurn
                ) {
                    const drawAmount = Math.max(0, Math.floor(Number(destinyEffects.firstSkillDrawPerTurn) || 0));
                    if (drawAmount > 0) {
                        this.drawCards(drawAmount);
                        this.runDestinyBattleState.firstSkillDrawUsedThisTurn = true;
                        Utils.showBattleLog(`命格【${destinyMeta.name}】首个技能抽牌 +${drawAmount}`);
                    }
                }
                const spiritMeta = this.getSpiritCompanionMeta();
                const spiritPassive = this.getSpiritCompanionEffects().passive || {};
                if (
                    spiritMeta
                    && Number(spiritPassive.firstSkillDrawPerTurn) > 0
                    && this.ensureSpiritCompanionBattleState()
                    && !this.spiritCompanionBattleState.firstSkillDrawUsedThisTurn
                ) {
                    const drawAmount = Math.max(0, Math.floor(Number(spiritPassive.firstSkillDrawPerTurn) || 0));
                    if (drawAmount > 0) {
                        this.drawCards(drawAmount);
                        this.spiritCompanionBattleState.firstSkillDrawUsedThisTurn = true;
                        Utils.showBattleLog(`灵契【${spiritMeta.name}】引牌 +${drawAmount}`);
                    }
                    const chargeAmount = Math.max(0, Math.floor(Number(spiritPassive.firstSkillChargePerTurn) || 0));
                    if (chargeAmount > 0) {
                        this.gainSpiritCharge(chargeAmount);
                    }
                }
                if (this.fateRing && this.fateRing.path === 'resonance' && !this.ringResonanceSkillDrawUsedThisTurn) {
                    this.drawCards(1);
                    this.ringResonanceSkillDrawUsedThisTurn = true;
                    Utils.showBattleLog('回响之环：首次技能额外抽 1');
                }
                if (this.relic && this.relic.id === 'starsealCompass' && !this.relicSkillDrawUsedThisTurn) {
                    this.drawCards(1);
                    this.relicSkillDrawUsedThisTurn = true;
                    Utils.showBattleLog('星封罗盘：首次技能额外抽 1');
                }
                const doctrineProfile = this.getPathDoctrineProfile();
                if (doctrineProfile.path === 'resonance' && doctrineProfile.tier > 0) {
                    this.pathDoctrineSkillChainCountThisTurn = Math.max(0, Math.floor(Number(this.pathDoctrineSkillChainCountThisTurn) || 0)) + 1;
                    const chainLimit = doctrineProfile.tier >= 3 ? 2 : 1;
                    if (this.pathDoctrineSkillChainCountThisTurn <= chainLimit) {
                        this.addBlock(doctrineProfile.skillChainBlock);
                        Utils.showBattleLog(`回响教义：技能连锁护阵 +${doctrineProfile.skillChainBlock}`);
                    }
                    if (
                        doctrineProfile.skillChainDraw > 0 &&
                        this.pathDoctrineSkillChainCountThisTurn >= 2 &&
                        !this.pathDoctrineSkillChainDrawUsedThisTurn
                    ) {
                        this.drawCards(doctrineProfile.skillChainDraw);
                        this.pathDoctrineSkillChainDrawUsedThisTurn = true;
                        Utils.showBattleLog(`回响教义：技能连锁抽牌 +${doctrineProfile.skillChainDraw}`);
                    }
                }
                if (this.game && typeof this.game.handleRunPathProgress === 'function') {
                    this.game.handleRunPathProgress('playSkillCard', 1);
                }
            }
            if (card.type === 'attack') {
                if (this.game && typeof this.game.handleRunPathProgress === 'function') {
                    this.game.handleRunPathProgress('playAttackCard', 1);
                }
                if (this.relic && this.relic.id === 'artifactPulse' && !this.relicAttackEnergyUsedThisTurn) {
                    this.gainEnergy(1);
                    this.relicAttackEnergyUsedThisTurn = true;
                    Utils.showBattleLog('灵器脉印：首次攻击回灵 +1');
                }
            }

            // 播放卡牌特效
            const activeGame = this.game || (typeof game !== 'undefined' ? game : null);
            if (activeGame && activeGame.playCardEffect) {
                activeGame.playCardEffect(null, card.type);
            }

            // 触发法宝回调 (onCardPlay)
            const context = { damageModifier: 0 };
            if (card.type === 'attack' && this.fateRing && this.fateRing.path === 'convergence' && !this.ringConvergenceAttackBoostUsedThisTurn) {
                context.damageModifier += 4;
                this.ringConvergenceAttackBoostUsedThisTurn = true;
                Utils.showBattleLog('汇流之环：首次攻击伤害 +4');
            }
            if (this.treasures) {
                this.triggerTreasureEffect('onCardPlay', card, context);
            }

            // 执行卡牌效果
            const results = this.executeCardEffects(card, target, context);

            // 临时卡 (isTemp) -> 消耗 (Exhaust) 而非弃牌
            // 且需要确认临时卡是否本来就是消耗属性 (exhaust: true). 
            // 用户要求: "Temporary cards ... use and delete".
            if (card.isTemp || card.exhaust) {
                this.exhaustPile.push(card);
                Utils.showBattleLog('卡牌已消耗');
                const vowEffects = this.getRunVowEffects();
                if (
                    Number(vowEffects.firstExhaustDrawPerTurn) > 0
                    && this.runVowBattleState
                    && !this.runVowBattleState.firstExhaustDrawUsedThisTurn
                ) {
                    const drawAmount = Math.max(0, Math.floor(Number(vowEffects.firstExhaustDrawPerTurn) || 0));
                    if (drawAmount > 0) {
                        this.drawCards(drawAmount);
                        this.runVowBattleState.firstExhaustDrawUsedThisTurn = true;
                        Utils.showBattleLog(`誓约之力：消耗回牌 +${drawAmount}`);
                    }
                }
            } else {
                // 加入弃牌堆
                this.discardPile.push(card);
            }

            this.gainSpiritCharge(1);

            return results;
        } catch (error) {
            // 中文注释：卡牌流程中途异常时回滚资源与手牌，避免出现“扣费但未出牌”的脏状态
            console.error('playCard failed:', error);
            this.currentEnergy = prevEnergy;
            this.milkCandy = prevCandy;
            if (cardRemovedFromHand) {
                this.hand.splice(Math.min(cardIndex, this.hand.length), 0, card);
            }
            Utils.showBattleLog('卡牌结算异常，已回滚本次操作');
            return false;
        }
    }

    // 执行卡牌效果
    // 执行卡牌效果
    executeCardEffects(card, target, context = {}) {
        const results = [];
        if (!card.effects || !Array.isArray(card.effects)) {
            console.warn('Card has no effects:', card);
            return results;
        }

        // Keep card reference in context for downstream effects (e.g., environment bonuses)
        context.card = card;

        for (const effect of card.effects) {
            const result = this.executeEffect(effect, target, context);
            if (result !== undefined && result !== null) {
                results.push(result);
            }
        }
        return results;
    }

    // 执行单个效果
    executeEffect(effect, target, context = {}) {
        if (!effect || typeof effect !== 'object') return null;
        let value = effect.value || 0;

        // 应用法宝/Buff上下文加成 (Context Modifiers)
        if ((effect.type === 'damage' || effect.type === 'damageAll' || effect.type === 'penetrate') && context.damageModifier) {
            value += context.damageModifier;
        }

        // 8. 天道压制 (realm 8)
        if (this.realm === 8 && (typeof value === 'number')) {
            value = Math.floor(value * 0.8);
        }

        // 命环路径伤害加成
        if (effect.type === 'damage' || effect.type === 'penetrate' || effect.type === 'damageAll') {
            const path = this.fateRing ? this.fateRing.path : null;
            if (path === 'destruction') value = Math.floor(value * 1.3); // 毁灭: +30%
            if (path === 'insight') value = Math.floor(value * 1.2);    // 洞察: +20%
            if (path === 'defiance') value = Math.floor(value * 1.5);   // 逆天: +50%
            const doctrineProfile = this.getPathDoctrineProfile(path);
            if (
                doctrineProfile.path === 'destruction' &&
                doctrineProfile.tier > 0 &&
                Math.max(0, Math.floor(Number(this.block) || 0)) <= 5
            ) {
                value = Math.floor(value * (1 + doctrineProfile.lowBlockDamageBonus));
            }
        }

        // 15. 大道独行 (realm 15) - 伤害提升50%
        if (this.realm === 15 && (effect.type === 'damage' || effect.type === 'penetrate' || effect.type === 'damageAll')) {
            value = Math.floor(value * 1.5);
        }

        // 12. 古战场环境 (realm 12) - 攻击伤害 +20%
        if (effect.type === 'damage' || effect.type === 'penetrate' || effect.type === 'damageAll') {
            try {
                const battle = (typeof window !== 'undefined' && window.game && window.game.battle) ? window.game.battle : null;
                const envBonus = battle && battle.environmentState ? battle.environmentState.damageBonus : 0;
                if (envBonus && context && context.card && context.card.type === 'attack') {
                    value = Math.floor(value * (1 + envBonus));
                }
            } catch (e) {
                // Ignore environment check errors
            }
        }

        // 共鸣：虚空斩 (Void Slash) - 穿透加成
        if (effect.type === 'penetrate') {
            const voidSlash = this.activeResonances.find(r => r.id === 'voidSlash');
            if (voidSlash) {
                value = Math.floor(value * (1 + voidSlash.effect.percent));
                // Utils.showBattleLog('虚空斩：穿透伤害提升！'); // 频繁提示可能烦人
            }
        }

        // 应用法则加成 (New Implementation)
        if (this.applyLawBonuses) {
            value = this.applyLawBonuses(effect.type, value);
        }

        switch (effect.type) {
            case 'gainSin':
                if (this.fateRing && this.fateRing.gainSin) {
                    this.fateRing.gainSin(value);
                }
                return { type: 'gainSin', value };

            case 'gainMerit':
                if (this.fateRing && this.fateRing.gainMerit) {
                    this.fateRing.gainMerit(value);
                }
                return { type: 'gainMerit', value };

            case 'setStance': {
                const next = effect.stance || effect.value || 'neutral';
                const stance = ['neutral', 'aggressive', 'defensive'].includes(next) ? next : 'neutral';
                this.stance = stance;
                const stanceText = stance === 'aggressive' ? '进攻' : (stance === 'defensive' ? '守势' : '中和');
                return { type: 'stance', value: stanceText };
            }

            case 'discardHand':
                const discardedCount = this.hand.length;
                while (this.hand.length > 0) {
                    this.discardPile.push(this.hand.pop());
                }
                this.lastDiscardedCount = discardedCount; // Store for chained effects
                this.triggerArchetypeDiscardProc(discardedCount);
                return { type: 'discardHand', value: discardedCount };

            case 'discardRandom':
                return { type: 'discardRandom', value: effect.value || 1, trigger: effect.trigger };

            case 'addStatus':
            case 'createCard': {
                const cardId = effect.cardId;
                const count = Math.max(1, Math.floor(Number(effect.count) || 1));
                const zone = effect.zone === 'hand' ? 'hand' : (effect.zone === 'draw' ? 'draw' : 'discard');
                const createdCards = [];

                for (let i = 0; i < count; i++) {
                    let template = null;
                    if (typeof cloneCardTemplate === 'function') {
                        template = cloneCardTemplate(cardId);
                    } else if (typeof CARDS !== 'undefined' && CARDS[cardId]) {
                        template = JSON.parse(JSON.stringify(CARDS[cardId]));
                    }
                    if (!template) continue;

                    template.instanceId = this.generateCardId();
                    if (effect.costOverride !== undefined && effect.costOverride !== null) {
                        const forcedCost = Math.max(0, Math.floor(Number(effect.costOverride) || 0));
                        template.cost = forcedCost;
                        template.baseCost = forcedCost;
                    }
                    if (effect.temporary) template.isTemp = true;

                    if (zone === 'hand') this.hand.push(template);
                    else if (zone === 'draw') this.drawPile.push(template);
                    else this.discardPile.push(template);

                    createdCards.push(template);
                }

                if (effect.type === 'createCard' && createdCards.length > 0) {
                    this.triggerArchetypeForgeProc(createdCards);
                }

                return { type: effect.type, zone, cards: createdCards, count: createdCards.length };
            }

            case 'drawCalculated': {
                const base = effect.base || 0;
                const perDiscard = effect.perDiscard || 0;
                const count = base + (this.lastDiscardedCount || 0) * perDiscard;
                this.lastDiscardedCount = 0; // Reset
                if (count > 0) this.drawCards(count);
                return { type: 'draw', value: count };
            }

            case 'conditionalDamage':
                let dmgValue = 0;
                let conditionMet = false;

                if (effect.condition === 'lowHp') {
                    if (this.currentHp / this.maxHp < (effect.threshold || 0.5)) {
                        conditionMet = true;
                    }
                } else if (effect.condition === 'marked') {
                    if (target && target.buffs && target.buffs.mark && target.buffs.mark > 0) {
                        conditionMet = true;
                    }
                } else if (effect.condition === 'sealed') {
                    if (this.fateRing && this.fateRing.type === 'sealed' && this.fateRing.slots.some(s => !s.unlocked)) {
                        conditionMet = true;
                    }
                } else {
                    // Default level check (legacy)
                    if (this.fateRing && this.fateRing.level >= (effect.minLevel || 0)) {
                        conditionMet = true;
                    }
                }

                if (conditionMet) {
                    if (effect.multiplier) {
                        dmgValue = Math.floor((effect.value || 0) * effect.multiplier);
                    } else if (effect.bonusDamage) {
                        dmgValue = (effect.value || 0) + effect.bonusDamage;
                    } else {
                        dmgValue = effect.value || 0;
                    }
                } else {
                    dmgValue = effect.value || 0;
                }

                if (conditionMet) {
                    if (effect.multiplier) value = Math.floor(value * effect.multiplier);
                    if (effect.bonusDamage) value += effect.bonusDamage;
                }

                return { type: 'damage', value: value, target: effect.target };

            case 'damage':
                let dmg = value;
                return { type: 'damage', value: dmg, target: effect.target };

            case 'penetrate':
                return { type: 'penetrate', value, target: effect.target };

            case 'block':
                this.addBlock(value);
                return { type: 'block', value };

            case 'heal':
                this.heal(value);
                return { type: 'heal', value };

            case 'energy':
                this.currentEnergy += value;
                return { type: 'energy', value };

            case 'energyLoss':
                return { type: 'energyLoss', value: effect.value || 1, trigger: effect.trigger };

            case 'draw':
                this.drawCards(value);
                return { type: 'draw', value };

            case 'buff':
                this.addBuff(effect.buffType, effect.value);
                return { type: 'buff', buffType: effect.buffType, value: effect.value };

            case 'debuff':
                return { type: 'debuff', buffType: effect.buffType, value: effect.value, target: effect.target };

            case 'applyBleed':
                return {
                    type: 'bleed',
                    value: Math.max(1, effect.value || 1) + (this.archetypeResonance ? (this.archetypeResonance.applyBleedBonus || 0) : 0),
                    target: effect.target
                };

            case 'applyMark':
                return {
                    type: 'mark',
                    value: Math.max(1, effect.value || 1) + (this.archetypeResonance ? (this.archetypeResonance.applyMarkBonus || 0) : 0),
                    target: effect.target
                };

            case 'randomDamage':
                const randValue = Utils.random(effect.minValue, effect.maxValue);
                return { type: 'damage', value: randValue, target: effect.target };

            case 'execute':
                return { type: 'execute', value: effect.value, target: effect.target };

            case 'percentDamage':
                if (!target) return { type: 'error', message: '需要目标' };
                // 造成目标最大生命值一定百分比的伤害
                const maxHp = target.maxHp || target.hp || 1;
                const pDamage = Math.floor(maxHp * effect.value);
                return { type: 'damage', value: pDamage, target: effect.target };

            case 'swapHpPercent':
                if (!target) return { type: 'error', message: '需要目标' };
                const playerPercent = this.currentHp / this.maxHp;
                // 确保百分比不为0，至少保留1%
                // 实际上如果玩家只有1HP，百分比极低，交换给满血敌人会造成巨大伤害
                // 但如果敌人满血(100%)，交换给玩家，玩家应该满血

                // 关键修正：获取百分比时，保留足够精度，并确保不会导致生命值归零
                const targetMaxHp = target.maxHp || target.hp;
                const enemyPercent = Math.max(0.01, target.currentHp / targetMaxHp); // 敌人至少保留1%
                const safePlayerPercent = Math.max(0.01, this.currentHp / this.maxHp); // 玩家至少保留1%

                const newPlayerHp = Math.floor(this.maxHp * enemyPercent);
                const newEnemyHp = Math.floor(targetMaxHp * safePlayerPercent);

                const finalPlayerHp = Math.max(1, newPlayerHp);
                const finalEnemyHp = Math.max(1, newEnemyHp);

                const playerDiff = finalPlayerHp - this.currentHp;
                const enemyDiff = finalEnemyHp - target.currentHp;

                this.currentHp = finalPlayerHp;
                target.currentHp = finalEnemyHp;

                Utils.showBattleLog(`逆转乾坤！生命比率互换！`);
                return { type: 'swapHpPercent', playerDiff, enemyDiff, target };

            case 'damageAll':
                return { type: 'damageAll', value, target: 'allEnemies' };

            case 'removeBlock':
                return { type: 'removeBlock', target: effect.target };

            case 'selfDamage':
                {
                    const beforeHp = Math.max(1, Math.floor(Number(this.currentHp) || 1));
                    this.currentHp = Math.max(1, beforeHp - value);
                    const actualDamage = Math.max(0, beforeHp - this.currentHp);
                    this.triggerArchetypeSelfDamageProc(actualDamage);
                    return { type: 'selfDamage', value: actualDamage };
                }

            case 'maxHpOnKill':
                return { type: 'maxHpOnKill', value, target: effect.target };

            case 'mulligan':
                const handSize = this.hand.length; // 当前手牌（不包括打出的这张）
                // 将手牌全部丢弃
                while (this.hand.length > 0) {
                    this.discardPile.push(this.hand.pop());
                }
                this.lastDiscardedCount = handSize;
                this.triggerArchetypeDiscardProc(handSize);
                // 抽取相同数量
                this.drawCards(handSize);
                return { type: 'mulligan', value: handSize };

            case 'blockFromEnergy':
                const blockVal = this.currentEnergy * effect.multiplier;
                this.addBlock(blockVal);
                return { type: 'block', value: blockVal };

            case 'damagePerCard':
                const cardsCount = this.hand.length;
                const dmgVal = cardsCount * value;
                return { type: 'damage', value: dmgVal, target: effect.target };

            case 'blockBurst': {
                const ratio = Math.max(0, Number(effect.ratio) || 1);
                const minDamage = Math.max(0, Math.floor(Number(effect.minDamage) || 0));
                const maxConsume = effect.maxConsume !== undefined && effect.maxConsume !== null
                    ? Math.max(0, Math.floor(Number(effect.maxConsume) || 0))
                    : null;
                const currentBlock = Math.max(0, Math.floor(Number(this.block) || 0));
                const consumedBlock = maxConsume === null ? currentBlock : Math.min(currentBlock, maxConsume);
                const baseDamage = Math.floor(consumedBlock * ratio);
                const totalDamage = Math.max(minDamage, baseDamage);
                this.block = Math.max(0, this.block - consumedBlock);
                return { type: 'blockBurst', value: totalDamage, consumedBlock, target: effect.target };
            }

            case 'lifeSteal':
                // Ensure value is a number
                return { type: 'lifeSteal', value: value || 0 };

            case 'conditionalDraw':
                // 实现条件抽牌
                let triggered = false;
                const threshold = effect.threshold || 0.5;
                if (effect.condition === 'lowHp') {
                    if (this.currentHp / this.maxHp < threshold) {
                        triggered = true;
                    }
                }

                if (triggered) {
                    if (effect.drawValue) this.drawCards(effect.drawValue);
                    if (effect.energyValue) {
                        this.currentEnergy += effect.energyValue;
                        // 触发UI更新（虽然通常在playCard后会统一更新，但能量变化需要及时反映）
                    }
                    Utils.showBattleLog(`绝处逢生生效！抽${effect.drawValue}牌，回${effect.energyValue}灵力`);
                    return { type: 'conditionalDraw', triggered: true };
                } else {
                    Utils.showBattleLog(`条件未满足（生命需低于${Math.floor(threshold * 100)}%）`);
                    return { type: 'conditionalDraw', triggered: false };
                }

            case 'bonusGold':
                this.pendingBonusGold = (this.pendingBonusGold || 0) + Utils.random(effect.min, effect.max);
                return { type: 'bonusGold' };

            case 'ringExp':
                if (this.fateRing) {
                    this.fateRing.exp += effect.value;
                    if (this.checkFateRingLevelUp) this.checkFateRingLevelUp();
                }
                return { type: 'ringExp', value: effect.value };

            case 'consumeAllEnergy':
                const energy = this.currentEnergy;
                this.currentEnergy = 0;
                return { type: 'damage', value: energy * (effect.damagePerEnergy || 6), target: effect.target };

            case 'randomCards':
                const count = Utils.random(effect.minValue, effect.maxValue);
                const addedCards = [];
                for (let i = 0; i < count; i++) {
                    const randomCard = getRandomCard(); // 假设此函数全局可用，或需要从cards.js导入
                    if (randomCard) {
                        const tempCard = JSON.parse(JSON.stringify(randomCard));
                        tempCard.instanceId = this.generateCardId();
                        tempCard.isTemp = true;
                        tempCard.cost = 0;
                        this.hand.push(tempCard);
                        addedCards.push(tempCard);
                    }
                }
                return { type: 'draw', value: count, cards: addedCards };

            case 'blockFromStrength':
                const strength = this.buffs.strength || 0;
                const blockAmount = Math.max(effect.minimum || 0, strength * (effect.multiplier || 1));
                this.addBlock(blockAmount);
                return { type: 'block', value: blockAmount };

            case 'reshuffleDiscard':
                if (this.discardPile.length > 0) {
                    this.drawPile.push(...this.discardPile);
                    this.discardPile = [];
                    this.drawPile = Utils.shuffle(this.drawPile);
                    return { type: 'reshuffle', value: this.drawPile.length };
                }
                return { type: 'reshuffle', value: 0 };

            case 'executeDamage':
                return { type: 'executeDamage', value: effect.value, threshold: effect.threshold, target: effect.target };



            case 'damagePerLaw':
                // 根据装载法则数量造成伤害（林风：命环共振）
                let loadedLawCount = 0;
                if (this.fateRing) {
                    if (Array.isArray(this.fateRing.loadedLaws)) {
                        loadedLawCount = this.fateRing.loadedLaws.filter(Boolean).length;
                    } else if (typeof this.fateRing.getSocketedLaws === 'function') {
                        loadedLawCount = this.fateRing.getSocketedLaws().filter(Boolean).length;
                    } else if (Array.isArray(this.fateRing.slots)) {
                        loadedLawCount = this.fateRing.slots.filter(s => s && s.law).length;
                    }
                }
                const totalDamage = effect.baseDamage + (loadedLawCount * effect.damagePerLaw);
                return { type: 'damage', value: totalDamage, target: effect.target };

            case 'cleanse':
                // 净化负面效果（香叶：治愈之触）
                const debuffTypes = ['weak', 'vulnerable', 'poison', 'burn', 'paralysis'];
                let cleansed = 0;
                for (const debuff of debuffTypes) {
                    if (this.buffs[debuff] && cleansed < effect.value) {
                        delete this.buffs[debuff];
                        cleansed++;
                        Utils.showBattleLog(`净化了 ${debuff} 效果`);
                    }
                }
                return { type: 'cleanse', value: cleansed };

            case 'blockFromLostHp':
                // 根据已损失生命获得护盾（香叶：生命涌动）
                const lostHp = this.maxHp - this.currentHp;
                const shieldFromHp = Math.floor(lostHp * effect.percent);
                this.addBlock(shieldFromHp);
                return { type: 'block', value: shieldFromHp };

            case 'debuffAll':
                // 群体debuff（无欲：普渡众生）
                return { type: 'debuffAll', buffType: effect.buffType, value: effect.value, target: 'allEnemies' };

            default:
                return { type: 'unknown' };
        }
    }


    // 添加Buff
    addBuff(type, value) {
        if (value <= 0) return; // 忽略无效buff

        // 11. 天人五衰 (realm 11) - 负面状态持续时间+1
        const isDebuff = ['weak', 'vulnerable', 'poison', 'burn', 'paralysis', 'stun'].includes(type);
        if (this.realm === 11 && isDebuff) {
            value += 1;
        }

        // Fix: Damage Reduction Multiplicative Stacking (避免100%免伤)
        if (type === 'damageReduction') {
            const current = this.buffs[type] || 0;
            // Formula: New = Current + (Remaining * Added%)
            // e.g. 50% + 50% = 50 + (50 * 0.5) = 75%
            const newVal = current + (100 - current) * (value / 100);
            this.buffs[type] = Math.min(95, Math.floor(newVal)); // Cap at 95% to be safe, or just floor
            Utils.showBattleLog(`减伤效果提升至 ${this.buffs[type]}%`);
            return;
        }

        if (this.buffs[type]) {
            this.buffs[type] += value;
        } else {
            this.buffs[type] = value;
        }

        // 获取Buff名称
        let buffName = type;
        const buffNames = {
            strength: '力量',
            weak: '虚弱',
            vulnerable: '易伤',
            poison: '中毒',
            bleed: '流血',
            mark: '破绽',
            burn: '灼烧',
            thorns: '荆棘',
            dodge: '闪避',
            dodgeChance: '闪避率',
            block: '护盾',
            nextTurnBlock: '固守',
            retainBlock: '护盾留存',
            paralysis: '麻痹',
            stun: '眩晕',
            nextAttackBonus: '聚气',
            damageReduction: '减伤',
            chaosAura: '混乱光环',
            impervious: '金刚法相',
            wrath: '明王之怒'
        };
        if (buffNames[type]) buffName = buffNames[type];
        else if (typeof GameData !== 'undefined' && GameData.getBuffName) buffName = GameData.getBuffName(type);

        Utils.showBattleLog(`获得了 ${buffName} x${value}`);

        // 触发buff获得时的回调（如果有）
        if (type === 'strength') {
            // Strength logic handled dynamically
        }
    }

    // 添加Debuff（供Boss机制与外部系统调用）
    addDebuff(type, value) {
        if (!type || typeof value !== 'number' || isNaN(value) || value <= 0) return 0;

        // 通用免疫判定
        const immunityMap = {
            burn: 'immunity_burn',
            poison: 'immunity_poison',
            weak: 'immunity_weak',
            vulnerable: 'immunity_vulnerable',
            paralysis: 'immunity_paralysis',
            slow: 'immunity_slow',
            stun: 'immunity_stun',
            discard: 'immunity_discard'
        };
        const immunityBuff = immunityMap[type];
        if (immunityBuff && this.hasBuff(immunityBuff)) {
            return 0;
        }

        let finalValue = value;
        if (type === 'weak' && this.hasBuff('weak_resist')) {
            finalValue = Math.max(0, Math.floor(value * (1 - this.buffs.weak_resist)));
        }
        if (finalValue <= 0) return 0;

        // 天人五衰：负面状态持续额外+1
        if (this.realm === 11) {
            finalValue += 1;
        }

        this.buffs[type] = (this.buffs[type] || 0) + finalValue;

        const debuffNames = {
            weak: '虚弱',
            vulnerable: '易伤',
            poison: '中毒',
            bleed: '流血',
            mark: '破绽',
            burn: '灼烧',
            paralysis: '麻痹',
            stun: '眩晕',
            healing_corrupt: '禁疗'
        };
        Utils.showBattleLog(`受到${debuffNames[type] || type} x${finalValue}`);
        return finalValue;
    }

    // 添加永久属性加成
    addPermBuff(stat, value) {
        if (!this.permaBuffs) this.permaBuffs = {};
        this.permaBuffs[stat] = (this.permaBuffs[stat] || 0) + value;

        // 如果是基础属性，立即重新计算
        if (['maxHp', 'energy', 'draw'].includes(stat)) {
            this.recalculateStats();
        }
    }

    // 回合开始时处理Buff
    processBuffsOnTurnStart() {
        // 中毒伤害结算在EnemyTurn，但如果玩家中毒？
        if (this.buffs.poison) {
            this.takeDamage(this.buffs.poison);
            this.buffs.poison--;
            if (this.buffs.poison <= 0) delete this.buffs.poison;
            Utils.showBattleLog(`受到中毒伤害！剩余 ${this.buffs.poison || 0} 层`);
        }

        if (this.buffs.bleed) {
            this.takeDamage(this.buffs.bleed);
            this.buffs.bleed = Math.max(0, this.buffs.bleed - 1);
            if (this.buffs.bleed <= 0) delete this.buffs.bleed;
            Utils.showBattleLog(`流血发作！`);
        }

        // 铁布衫：下回合获得护盾
        if (this.buffs.nextTurnBlock) {
            this.addBlock(this.buffs.nextTurnBlock);
            Utils.showBattleLog(`铁布衫生效！获得 ${this.buffs.nextTurnBlock} 点护盾`);
            delete this.buffs.nextTurnBlock;
        }

        // 再生 (Regen)
        if (this.buffs.regen) {
            this.heal(this.buffs.regen);
            Utils.showBattleLog(`再生生效！恢复 ${this.buffs.regen} 点生命`);
        }
        // The instruction contained a malformed line and an extra brace here.
        // To maintain syntactic correctness, only the intended change (comment update) is applied.

        // 自动格挡/反伤等逻辑...
    }

    // 抽牌
    drawCards(count) {
        for (let i = 0; i < count; i++) {
            if (this.drawPile.length === 0) {
                if (this.discardPile.length === 0) break;
                this.drawPile = Utils.shuffle([...this.discardPile]);
                this.discardPile = [];

                // 共鸣：混沌终焉 (Chaotic Storm) - 洗牌触发
                if (this.activeResonances) {
                    const storm = this.activeResonances.find(r => r.id === 'chaoticStorm');
                    if (storm && this.game && this.game.battle) {
                        const dmg = storm.effect.value;
                        const enemies = this.game.battle.enemies.filter(e => e.currentHp > 0);
                        let hitSomething = false;
                        enemies.forEach(e => {
                            this.game.battle.dealDamageToEnemy(e, dmg);
                            // 随机Debuff
                            const debuffs = ['vulnerable', 'weak', 'burn', 'poison'];
                            const debuff = debuffs[Math.floor(Math.random() * debuffs.length)];
                            e.buffs[debuff] = (e.buffs[debuff] || 0) + 1;
                            hitSomething = true;
                        });
                        if (hitSomething) {
                            Utils.showBattleLog(`混沌终焉：洗牌引发风暴！(伤害+诅咒)`);
                            if (this.game.battle.updateBattleUI) this.game.battle.updateBattleUI();
                        }
                    }
                }
            }

            const card = this.drawPile.pop();
            if (card) {
                // 6. 法则混乱 (realm 6) 或 混乱状态 (Confuse)
                if (this.realm === 6 || (this.buffs.confuse && this.buffs.confuse > 0)) {
                    // Fix: Prevent cumulative drift by using a base cost
                    if (card.baseCost === undefined) card.baseCost = card.cost;

                    if (this.buffs.confuse) {
                        // Confuse: Random cost 0-3
                        card.cost = Math.floor(Math.random() * 4);
                    } else {
                        // Realm 6: -1 to +1 (Weighted: 20% -1, 30% 0, 50% +1)
                        const r = Math.random();
                        let change = 0;
                        if (r < 0.2) change = -1;
                        else if (r < 0.5) change = 0;
                        else change = 1;
                        card.cost = Math.max(0, card.baseCost + change);
                    }
                } else {
                    // 正常情况
                    if (card.baseCost === undefined) card.baseCost = card.cost; // Ensure baseCost

                    // 确保 consumeCandy 的卡牌 cost 保持为 0 (或 baseCost)
                    card.cost = card.baseCost;
                }
                const handLimit = this.getMaxHandSize();
                if (this.hand.length >= handLimit) {
                    this.discardPile.push(card);
                    Utils.showBattleLog(`手牌已满（上限 ${handLimit}），【${card.name}】被置入弃牌堆`);
                } else {
                    this.hand.push(card);
                }

            }
        }
    }

    // 结束回合
    endTurn() {
        // 4. 丹火焚心 (realm 4)
        if (this.realm === 4 && this.hand.length > 0) {
            const burnDamage = this.hand.length * 2;
            this.takeDamage(burnDamage);
            Utils.showBattleLog(`丹火焚心：受到 ${burnDamage} 点伤害`);
        }

        // 共鸣：大地恩赐 (Gaia's Blessing) - 护盾回血
        if (this.block > 0) {
            const gaiaBlessing = this.activeResonances.find(r => r.id === 'gaiaBlessing');
            if (gaiaBlessing) {
                const healAmount = Math.floor(this.block * gaiaBlessing.effect.percent);
                if (healAmount > 0) {
                    this.heal(healAmount);
                    Utils.showBattleLog(`大地恩赐：恢复 ${healAmount} 点生命`);
                }
            }
        }

        // 弃掉所有手牌 (保留带有 retain 属性的卡牌，如心魔)
        const cardsToDiscard = [];
        const cardsToRetain = [];

        for (const card of this.hand) {
            // 检查卡牌静态定义或动态属性是否包含 retain
            if (card.retain) {
                cardsToRetain.push(card);
            } else {
                cardsToDiscard.push(card);
            }
        }

        this.discardPile.push(...cardsToDiscard);
        this.hand = cardsToRetain;

        if (this.hand.length > 0) {
            Utils.showBattleLog(`保留了 ${this.hand.length} 张手牌`);

            // 苦行 (Asceticism) - 回合结束若有保留手牌，获得功德
            if (this.buffs.meritOnRetain) {
                const retainedCount = this.hand.filter(c => c.retain).length; // Only count actual retained cards? 
                // Description says "If you have retained cards". 
                // Logic above: `this.hand` IS `cardsToRetain` now.
                // So use `this.hand.length`.
                const gain = this.hand.length * this.buffs.meritOnRetain;
                if (gain > 0) {
                    if (this.fateRing && this.fateRing.gainMerit) {
                        this.fateRing.gainMerit(gain);
                        Utils.showBattleLog(`苦行：保留手牌，功德 +${gain}`);
                    }
                }
            }
        }

        // 处理回合结束的buff
        this.processBuffsOnTurnEnd();
    }

    // ...

    // 处理回合结束buff
    processBuffsOnTurnEnd() {
        // 遗物效果：治愈之血
        if (this.relic && this.relic.id === 'healingBlood') {
            this.heal(2);
            // 简单反馈，实际UI反馈在Battle.js中处理可能更好，但这里改动最小
        }

        // 自然生长 (Nature Growth) - 回合结束获得护盾
        if (this.buffs.regenBlock) {
            this.addBlock(this.buffs.regenBlock);
            Utils.showBattleLog(`自然生长：获得 ${this.buffs.regenBlock} 点护盾`);
        }

        // 力量buff持续
        // 反伤消失
        delete this.buffs.thorns;
    }

    // 添加卡牌到牌组
    addCardToDeck(card) {
        // Fix: Use deep copy to isolate instances (avoids "averaged cost" bug)
        if (!card) return;
        const newCard = JSON.parse(JSON.stringify(card));
        newCard.instanceId = this.generateCardId();
        this.deck.push(newCard);
    }

    // 收集法则
    collectLaw(law) {
        if (this.collectedLaws.find(l => l.id === law.id)) {
            return false; // 已经收集过了
        }

        this.collectedLaws.push(law);
        this.lawsCollected++;
        this.fateRing.exp += 100; // 增加命环经验

        // 解锁法则对应的卡牌
        if (law.unlockCards) {
            for (const cardId of law.unlockCards) {
                if (CARDS[cardId]) {
                    this.addCardToDeck(CARDS[cardId]);
                }
            }
        }

        // 检查命环升级
        this.checkFateRingLevelUp();

        return true;
    }

    // 获取当前槽位的法则
    getLawInSlot(index) {
        let lawId = null;
        if (this.fateRing && Array.isArray(this.fateRing.slots) && this.fateRing.slots[index]) {
            lawId = this.fateRing.slots[index].law || null;
        } else if (this.fateRing && Array.isArray(this.fateRing.loadedLaws)) {
            lawId = this.fateRing.loadedLaws[index];
        }
        return lawId ? LAWS[lawId] : null;
    }

    // 检查是否升级 (Delegated to FateRing class)
    checkFateRingLevelUp() {
        if (this.fateRing && this.fateRing.checkLevelUp) {
            const prevLevel = this.fateRing.level;
            this.fateRing.checkLevelUp();
            return this.fateRing.level > prevLevel;
        }
        return false;
    }

    // 检查是否触发进化
    checkEvolution() {
        // Delegate to FateRing logic or keep simple check here
        // The FateRing class handles level up, but UI for evolution selection might still belong here or in Game

        const level = this.fateRing.level;
        // Use global FATE_RING to check path tier
        if (typeof FATE_RING === 'undefined') return;

        const currentPath = FATE_RING.paths[this.fateRing.path];
        const currentTier = currentPath ? currentPath.tier : 0;

        // Lv 1: 自动觉醒 (Tier 0 -> Tier 1)
        if (level >= 1 && currentTier < 1) {
            this.evolveFateRing('awakened');
            Utils.showBattleLog(`命环觉醒！无法则之力已激活。`);
        }

        // Lv 3: 第一次分支进化 (Tier 1 -> Tier 2)
        if (level >= 3 && currentTier < 2) {
            if (this.game && this.game.showEvolutionSelection) {
                this.game.showEvolutionSelection(2);
            }
        }

        // Lv 7: 高阶进化 (Tier 2 -> Tier 3)
        if (level >= 7 && currentTier < 3) {
            if (this.game && this.game.showEvolutionSelection) {
                this.game.showEvolutionSelection(3);
            }
        }
    }

    // Check Skill Unlock based on Realm
    checkSkillUnlock() {
        if (!this.activeSkill) return;

        let newLevel = this.skillLevel;
        const realm = this.realm;

        // Realm 18+ -> Lv4
        if (realm >= 18) newLevel = 4;
        // Realm 15+ -> Lv3
        else if (realm >= 15) newLevel = 3;
        // Realm 10+ -> Lv2
        else if (realm >= 10) newLevel = 2;
        // Realm 5+ -> Lv1
        else if (realm >= 5) newLevel = 1;

        // If upgraded
        if (newLevel > this.skillLevel) {
            const oldLevel = this.skillLevel;
            this.skillLevel = newLevel;

            if (oldLevel === 0) {
                Utils.showBattleLog(`【逆命觉醒】主动技能已解锁！(Lv${newLevel})`);
            } else {
                Utils.showBattleLog(`【境界突破】主动技能升级！(Lv${newLevel})`);
            }

            // Refresh UI if Game exists
            if (this.game && this.game.updateActiveSkillUI) {
                this.game.updateActiveSkillUI();
            }
        }
    }

    // 觉醒命环 (用于事件)
    awakenFateRing() {
        if (!this.fateRing) return false;
        if (this.fateRing.path !== 'crippled') return false; // 已经觉醒

        this.evolveFateRing('awakened');
        // 额外奖励？事件描述说 "修复残缺印记"
        return true;
    }

    // 进化命环
    evolveFateRing(pathId) {
        if (!this.fateRing) return;
        this.fateRing.path = pathId;
        this.recalculateStats();
    }

    // applyPathBonus removed, logic moved to recalculateStats and FateRing.getStatsBonus

    // 选择命环进化路径
    chooseFateRingPath(pathName) {
        const path = FATE_RING.paths[pathName];
        if (!path) return false;
        if (path.requires) {
            for (const req of path.requires) {
                const unlocked = this.fateRing.unlockedPaths || [];
                if (this.fateRing.path !== req && !unlocked.includes(req)) {
                    return false;
                }
            }
        }
        this.fateRing.path = pathName;

        // 立即应用新路径的加成
        this.recalculateStats();

        return true;
    }

    // 获取盗取几率加成
    getStealBonus() {
        let bonus = 0;
        // 逆天之环加成
        if (this.fateRing.path === 'defiance') {
            bonus += 0.5;
        }

        return bonus;
    }

    // 是否存活
    isAlive() {
        return this.currentHp > 0;
    }

    // 获取状态 (压缩版)
    getState() {
        return {
            characterId: this.characterId,
            maxHp: this.maxHp,
            currentHp: this.currentHp,
            block: this.block,
            gold: this.gold,
            heavenlyInsight: this.heavenlyInsight,
            karma: this.karma,
            shopRumors: this.shopRumors,
            currentEnergy: this.currentEnergy,
            baseEnergy: this.baseEnergy,
            // 压缩卡牌数据：只保存关键属性
            hand: this.compressCardList(this.hand),
            drawPile: this.compressCardList(this.drawPile),
            discardPile: this.compressCardList(this.discardPile),
            deck: this.compressCardList(this.deck),

            buffs: this.buffs,
            stance: this.stance || 'neutral',
            fateRing: this.fateRing, // FateRing needs its own compression ideally, but it's small usually
            // 压缩法则列表
            collectedLaws: this.collectedLaws.map(l => ({ id: l.id })),

            // V4.2 Persistence: Save per-realm map states
            realmMaps: this.realmMaps,

            realm: this.realm,
            floor: this.floor,
            enemiesDefeated: this.enemiesDefeated,
            // 压缩法宝
            collectedTreasures: (this.collectedTreasures || []).map(t => ({
                id: t.id,
                obtainedAt: t.obtainedAt,
                data: t.data
            })),
            equippedTreasures: (this.equippedTreasures || []).map(t => t.id), // 只存ID即可
            permaBuffs: this.permaBuffs,
            legacyBonuses: this.legacyBonuses,
            legacyRunDoctrine: this.legacyRunDoctrine,
            legacyRunMission: this.legacyRunMission,
            adventureBuffs: this.ensureAdventureBuffs(),
            maxRealmReached: this.maxRealmReached || 1,
            runPath: this.normalizeRunPath(),
            runPathProgress: this.ensureRunPathProgress(),
            runPathMutationState: this.normalizeRunPathMutationState(),
            runPathBattleState: this.runPathBattleState ? { ...this.runPathBattleState } : this.resetRunPathBattleState(),
            runDestiny: this.normalizeRunDestiny(),
            runVows: this.normalizeRunVows(),
            spiritCompanion: this.normalizeSpiritCompanion(),
            spiritCompanionBattleState: this.ensureSpiritCompanionBattleState()
        };
    }

    // 辅助：压缩卡牌列表
    compressCardList(list) {
        return list.map(c => ({
            id: c.id,
            instanceId: c.instanceId,
            upgraded: c.upgraded,
            cost: c.cost, // Preserve current cost (e.g. randomized)
            isTemp: c.isTemp
        }));
    }

    // === 法宝系统 ===

    getEquippedTreasureSetCounts() {
        const counts = {};
        const equipped = Array.isArray(this.equippedTreasures) ? this.equippedTreasures : [];
        equipped.forEach((treasure) => {
            const setTag = treasure && typeof treasure.setTag === 'string'
                ? treasure.setTag.trim()
                : '';
            if (!setTag) return;
            const setEcho = treasure && treasure.data && treasure.data.workshopSetEcho ? 1 : 0;
            counts[setTag] = (counts[setTag] || 0) + 1 + setEcho;
        });
        return counts;
    }

    getTreasureSetPieces(setTag) {
        if (!setTag || typeof setTag !== 'string') return 0;
        const counts = this.getEquippedTreasureSetCounts();
        return Math.max(0, Math.floor(Number(counts[setTag]) || 0));
    }

    getTreasureById(treasureId, options = {}) {
        if (!treasureId || typeof treasureId !== 'string') return null;
        const source = options && options.equippedOnly
            ? this.equippedTreasures
            : this.collectedTreasures;
        if (!Array.isArray(source)) return null;
        return source.find((treasure) => treasure && treasure.id === treasureId) || null;
    }

    getTreasureSetLabel(setTag = '') {
        const labels = {
            xuanjia: '玄甲',
            liemai: '裂脉',
            xingheng: '星衡',
            wuxing: '五行'
        };
        return labels[setTag] || '散修';
    }

    getTreasureSetMeta(setTag = '') {
        const metas = {
            xuanjia: {
                id: 'xuanjia',
                label: '玄甲',
                icon: '🛡️',
                theme: '护阵 / 反制 / 拉长回合',
                twoPiece: '获得护盾时额外提高 20%，把防守牌真正转成续航资本。',
                threePiece: '回合开始获得护盾留存与荆棘，且承受伤害时额外 -1。'
            },
            liemai: {
                id: 'liemai',
                label: '裂脉',
                icon: '🩸',
                theme: '斩杀 / 压血线 / 滚雪球',
                twoPiece: '击杀回复生命，对流血目标追加伤害，鼓励连续收割。',
                threePiece: '面对高层流血目标时追加最大生命比例斩击，用于压垮精英与 Boss。'
            },
            xingheng: {
                id: 'xingheng',
                label: '星衡',
                icon: '✨',
                theme: '节奏 / 回能 / 命环联动',
                twoPiece: '回合开始根据灵力状态补 1 灵力或抽 1 张牌，维持行动链不断。',
                threePiece: '开场额外抽牌，满灵力出手时再补伤害，把节奏优势转成爆发窗口。'
            },
            wuxing: {
                id: 'wuxing',
                label: '五行',
                icon: '☯️',
                theme: '净化 / 调序 / 元素容错',
                twoPiece: '回合开始净化 1 层减益；若无减益则获得 3 护盾，提升环境适应力。',
                threePiece: '若本回合完成净化则抽 1 张牌，否则获得 1 灵力，让调序也能反哺节奏。'
            }
        };
        return metas[setTag] || null;
    }

    getTreasureResearchRoleMeta(treasureId = '') {
        const id = String(treasureId || '');
        const coreTreasureIds = new Set([
            'iron_talisman',
            'soul_banner',
            'spirit_turtle_shell',
            'astral_forge_core',
            'fate_lotus_seal',
            'ringweaver_anvil',
            'five_element_bead'
        ]);
        const formTreasureIds = new Set([
            'metalEssence',
            'woodSpiritRoot',
            'waterCrystal',
            'firePhoenixFeather',
            'thickEarthShield',
            'vitality_stone',
            'blood_orb',
            'ring_echo_compass',
            'moonblade_sheath',
            'hunter_contract',
            'matrix_resonator'
        ]);

        if (coreTreasureIds.has(id)) {
            return {
                tier: 'core',
                label: '核心件',
                summary: '承担套装上限或器灵灌注位，优先围绕其规划路线和后续补件。'
            };
        }
        if (formTreasureIds.has(id)) {
            return {
                tier: 'form',
                label: '形态件',
                summary: '负责改写回合节奏或触发方式，是把体系从“能用”推到“会转”的关键齿轮。'
            };
        }
        return {
            tier: 'base',
            label: '基础件',
            summary: '更适合作为前期补强或过渡件，先提供稳定价值，再决定是否继续投入研究。'
        };
    }

    getTreasureResearchArchetypeTags(treasure = null) {
        const tags = new Set();
        const setTag = treasure && typeof treasure.setTag === 'string'
            ? treasure.setTag.trim()
            : '';
        const description = String(treasure?.description || '').toLowerCase();
        const rarity = String(treasure?.rarity || 'common').toLowerCase();

        if (setTag === 'xuanjia') {
            tags.add('护阵拖线');
            tags.add('反击续航');
        } else if (setTag === 'liemai') {
            tags.add('攻势抢拍');
            tags.add('斩杀号转');
        } else if (setTag === 'xingheng') {
            tags.add('回能调度');
            tags.add('法则编织');
        } else if (setTag === 'wuxing') {
            tags.add('元素适配');
            tags.add('净域调序');
        }

        if (/护盾|减伤|免疫/.test(description)) tags.add('护阵拖线');
        if (/击杀|流血|重伤|伤害/.test(description)) tags.add('攻势抢拍');
        if (/灵力|抽|命环/.test(description)) tags.add('回能调度');
        if (/元素|火|冰|雷|土|木/.test(description)) tags.add('元素适配');
        if (rarity === 'legendary' || rarity === 'mythic') tags.add('Boss 对策');

        return Array.from(tags).slice(0, 4);
    }

    isTreasureSpiritInfusionEligible(treasure = null) {
        const treasureId = typeof treasure === 'string'
            ? treasure
            : treasure?.id || '';
        return this.getTreasureResearchRoleMeta(treasureId).tier === 'core';
    }

    getTreasureSpiritBondLabel(spiritId = '') {
        const safeId = String(spiritId || '');
        if (!safeId) return '器灵';
        const spiritMeta = typeof SPIRIT_COMPANIONS !== 'undefined' && SPIRIT_COMPANIONS
            ? SPIRIT_COMPANIONS[safeId] || null
            : null;
        if (!spiritMeta) return `器灵·${safeId}`;
        return `${spiritMeta.icon || '✦'} ${spiritMeta.name}`;
    }

    getTreasureSpiritInfusionNote(treasure = null) {
        const roleMeta = this.getTreasureResearchRoleMeta(typeof treasure === 'string' ? treasure : treasure?.id || '');
        if (this.isTreasureSpiritInfusionEligible(treasure)) {
            return `${roleMeta.label}，可承接器灵灌注，把灵契护道能力并入法宝轴心。`;
        }
        return `${roleMeta.label}，当前不开放器灵灌注，避免把器灵价值分散到过渡件上。`;
    }

    describeTreasureWorkshopStatus(treasure = null) {
        if (!treasure || !treasure.data || typeof treasure.data !== 'object') return '';
        const tags = [];
        if (treasure.data.workshopReforge) {
            tags.push(this.getTreasureWorkshopReforgeLabel(treasure.data.workshopReforge));
        }
        if (treasure.data.workshopSpiritBond) {
            tags.push(this.getTreasureSpiritBondLabel(treasure.data.workshopSpiritBond));
        }
        if (treasure.data.workshopSetEcho) {
            tags.push('套装修正');
        }
        return tags.join(' / ');
    }

    getTreasureWorkshopStatusLines(treasure = null) {
        const lines = [];
        if (!treasure || !treasure.data || typeof treasure.data !== 'object') {
            return ['尚未进行炼器改造，可从重铸、器灵或套装修正中挑一条深入。'];
        }
        if (treasure.data.workshopReforge) {
            lines.push(`重铸：${this.getTreasureWorkshopReforgeLabel(treasure.data.workshopReforge)} · ${this.getTreasureWorkshopReforgeSummary(treasure.data.workshopReforge)}`);
        }
        if (treasure.data.workshopSpiritBond) {
            lines.push(`器灵：已与 ${this.getTreasureSpiritBondLabel(treasure.data.workshopSpiritBond)} 建立回响，开场可额外蓄能。`);
        }
        if (treasure.data.workshopSetEcho) {
            lines.push(`套装修正：当前会额外视作 1 件同套，用于补齐共鸣阈值。`);
        }
        if (lines.length === 0) {
            lines.push('尚未进行炼器改造，可从重铸、器灵或套装修正中挑一条深入。');
        }
        return lines;
    }

    getTreasureResearchEntry(treasure = null) {
        const resolvedTreasure = typeof treasure === 'string'
            ? (this.getTreasureById(treasure) || (typeof TREASURES !== 'undefined' && TREASURES ? TREASURES[treasure] || null : null))
            : treasure;
        if (!resolvedTreasure) return null;

        const setTag = typeof resolvedTreasure.setTag === 'string'
            ? resolvedTreasure.setTag.trim()
            : '';
        const setMeta = this.getTreasureSetMeta(setTag);
        const role = this.getTreasureResearchRoleMeta(resolvedTreasure.id);
        const equipped = this.isTreasureEquipped(resolvedTreasure.id);
        const totalSetCount = setTag && typeof TREASURES !== 'undefined' && TREASURES
            ? Object.values(TREASURES).filter((item) => item && item.setTag === setTag).length
            : 0;

        return {
            id: resolvedTreasure.id || '',
            name: resolvedTreasure.name || '',
            icon: resolvedTreasure.icon || '✦',
            rarity: resolvedTreasure.rarity || 'common',
            equipped,
            setTag,
            setLabel: setMeta?.label || this.getTreasureSetLabel(setTag),
            setMeta,
            setPieces: setTag ? this.getTreasureSetPieces(setTag) : 0,
            totalSetCount,
            role,
            focusTags: this.getTreasureResearchArchetypeTags(resolvedTreasure),
            infusionEligible: this.isTreasureSpiritInfusionEligible(resolvedTreasure),
            infusionNote: this.getTreasureSpiritInfusionNote(resolvedTreasure),
            workshopStatus: this.describeTreasureWorkshopStatus(resolvedTreasure),
            workshopLines: this.getTreasureWorkshopStatusLines(resolvedTreasure),
            reforgeMode: resolvedTreasure?.data?.workshopReforge || '',
            spiritBond: resolvedTreasure?.data?.workshopSpiritBond || '',
            setEcho: !!resolvedTreasure?.data?.workshopSetEcho
        };
    }

    getTreasureWorkshopResearchOverview() {
        const catalog = typeof TREASURES !== 'undefined' && TREASURES
            ? Object.values(TREASURES).filter(Boolean)
            : [];
        const collected = Array.isArray(this.collectedTreasures) ? this.collectedTreasures : [];
        const equipped = Array.isArray(this.equippedTreasures) ? this.equippedTreasures : [];
        const setIds = ['xuanjia', 'liemai', 'xingheng', 'wuxing'];
        const setProgress = setIds.map((setTag) => {
            const meta = this.getTreasureSetMeta(setTag);
            const owned = collected.filter((treasure) => treasure && treasure.setTag === setTag).length;
            const equippedCount = equipped.filter((treasure) => treasure && treasure.setTag === setTag).length;
            const total = catalog.filter((treasure) => treasure && treasure.setTag === setTag).length;
            const pieces = this.getTreasureSetPieces(setTag);
            const resonanceStage = pieces >= 3
                ? 'full'
                : pieces >= 2
                    ? 'active'
                    : owned > 0
                        ? 'forming'
                        : 'empty';
            const resonanceLabel = resonanceStage === 'full'
                ? '三段共鸣'
                : resonanceStage === 'active'
                    ? '二段共鸣'
                    : resonanceStage === 'forming'
                        ? '待收集'
                        : '未起步';
            return {
                id: setTag,
                label: meta?.label || this.getTreasureSetLabel(setTag),
                icon: meta?.icon || '✦',
                theme: meta?.theme || '',
                twoPiece: meta?.twoPiece || '',
                threePiece: meta?.threePiece || '',
                owned,
                equipped: equippedCount,
                total,
                pieces,
                resonanceStage,
                resonanceLabel
            };
        });

        const roleTotal = catalog.reduce((accumulator, treasure) => {
            const tier = this.getTreasureResearchRoleMeta(treasure?.id || '').tier;
            accumulator[tier] = (accumulator[tier] || 0) + 1;
            return accumulator;
        }, { core: 0, form: 0, base: 0 });
        const roleOwned = collected.reduce((accumulator, treasure) => {
            const tier = this.getTreasureResearchRoleMeta(treasure?.id || '').tier;
            accumulator[tier] = (accumulator[tier] || 0) + 1;
            return accumulator;
        }, { core: 0, form: 0, base: 0 });

        const activeReforges = collected.filter((treasure) => treasure?.data?.workshopReforge).length;
        const activeInfusions = collected.filter((treasure) => treasure?.data?.workshopSpiritBond).length;
        const activeSetEchoes = collected.filter((treasure) => treasure?.data?.workshopSetEcho).length;
        const readyInfusions = equipped
            .filter((treasure) => this.isTreasureSpiritInfusionEligible(treasure) && !treasure?.data?.workshopSpiritBond)
            .map((treasure) => treasure?.name || treasure?.id || '未知法宝');

        return {
            setProgress,
            coreOwned: roleOwned.core || 0,
            coreTotal: roleTotal.core || 0,
            formOwned: roleOwned.form || 0,
            formTotal: roleTotal.form || 0,
            baseOwned: roleOwned.base || 0,
            baseTotal: roleTotal.base || 0,
            activeReforges,
            activeInfusions,
            activeSetEchoes,
            activeWorkshops: activeReforges + activeInfusions + activeSetEchoes,
            resonantSets: setProgress.filter((item) => item.pieces >= 2).length,
            fullSets: setProgress.filter((item) => item.pieces >= 3).length,
            readyInfusions
        };
    }

    getTreasureWorkshopReforgeMode(treasure = null) {
        const setTag = treasure && typeof treasure.setTag === 'string'
            ? treasure.setTag.trim()
            : '';
        if (setTag === 'xuanjia') return 'bulwark';
        if (setTag === 'liemai') return 'rend';
        if (setTag === 'xingheng') return 'tempo';
        if (setTag === 'wuxing') return 'harmony';

        const rarity = treasure && typeof treasure.rarity === 'string'
            ? treasure.rarity.toLowerCase()
            : 'common';
        if (rarity === 'legendary' || rarity === 'mythic') return 'tempo';
        if (rarity === 'rare') return 'rend';
        return 'bulwark';
    }

    getTreasureWorkshopReforgeLabel(mode = '') {
        const labels = {
            bulwark: '护势重铸',
            rend: '裂脉重铸',
            tempo: '星衡重铸',
            harmony: '五行重铸'
        };
        return labels[mode] || '灵纹重铸';
    }

    getTreasureWorkshopReforgeSummary(mode = '') {
        const summaries = {
            bulwark: '战斗开始时额外获得 4 护盾。',
            rend: '对带减益的敌人造成伤害时额外 +3。',
            tempo: '战斗开始时额外抽 1 张牌。',
            harmony: '回合开始时净化 1 层减益；若无减益则获得 3 护盾。'
        };
        return summaries[mode] || '炼器纹路正在稳定回响。';
    }

    getTreasureWorkshopSnapshot(scope = 'equipped') {
        const source = scope === 'all'
            ? (Array.isArray(this.collectedTreasures) ? this.collectedTreasures : [])
            : (Array.isArray(this.equippedTreasures) ? this.equippedTreasures : []);
        return source.map((treasure) => {
            const mode = treasure && treasure.data ? treasure.data.workshopReforge : '';
            const researchEntry = this.getTreasureResearchEntry(treasure);
            return {
                id: treasure?.id || '',
                name: treasure?.name || '',
                icon: treasure?.icon || '✦',
                setTag: treasure?.setTag || '',
                setLabel: this.getTreasureSetLabel(treasure?.setTag || ''),
                equipped: this.isTreasureEquipped(treasure?.id),
                setTheme: researchEntry?.setMeta?.theme || '',
                setPieces: researchEntry?.setPieces || 0,
                researchTier: researchEntry?.role?.tier || 'base',
                researchLabel: researchEntry?.role?.label || '基础件',
                focusTags: Array.isArray(researchEntry?.focusTags) ? researchEntry.focusTags : [],
                infusionEligible: !!researchEntry?.infusionEligible,
                reforge: mode
                    ? {
                        mode,
                        label: this.getTreasureWorkshopReforgeLabel(mode),
                        summary: this.getTreasureWorkshopReforgeSummary(mode)
                    }
                    : null,
                spiritBond: treasure?.data?.workshopSpiritBond || null,
                setEcho: !!treasure?.data?.workshopSetEcho,
                workshopStatus: researchEntry?.workshopStatus || ''
            };
        });
    }

    applyTreasureReforge(treasureId) {
        const treasure = this.getTreasureById(treasureId);
        if (!treasure) return null;
        if (!treasure.data || typeof treasure.data !== 'object') treasure.data = {};

        (Array.isArray(this.collectedTreasures) ? this.collectedTreasures : []).forEach((entry) => {
            if (!entry) return;
            if (!entry.data || typeof entry.data !== 'object') entry.data = {};
            delete entry.data.workshopReforge;
        });

        const mode = this.getTreasureWorkshopReforgeMode(treasure);
        treasure.data.workshopReforge = mode;
        return {
            id: treasure.id,
            name: treasure.name,
            icon: treasure.icon || '✦',
            setTag: treasure.setTag || '',
            setLabel: this.getTreasureSetLabel(treasure.setTag || ''),
            mode,
            label: this.getTreasureWorkshopReforgeLabel(mode),
            summary: this.getTreasureWorkshopReforgeSummary(mode)
        };
    }

    applyTreasureSpiritInfusion(treasureId, spiritId = '') {
        const treasure = this.getTreasureById(treasureId);
        const spiritMeta = this.getSpiritCompanionMeta();
        const resolvedSpiritId = typeof spiritId === 'string' && spiritId
            ? spiritId
            : (spiritMeta ? spiritMeta.id : '');
        if (!treasure || !resolvedSpiritId || !spiritMeta || !this.isTreasureSpiritInfusionEligible(treasure)) return null;
        if (!treasure.data || typeof treasure.data !== 'object') treasure.data = {};

        (Array.isArray(this.collectedTreasures) ? this.collectedTreasures : []).forEach((entry) => {
            if (!entry) return;
            if (!entry.data || typeof entry.data !== 'object') entry.data = {};
            delete entry.data.workshopSpiritBond;
        });

        treasure.data.workshopSpiritBond = resolvedSpiritId;
        return {
            id: treasure.id,
            name: treasure.name,
            icon: treasure.icon || '✦',
            spiritId: spiritMeta.id,
            spiritName: spiritMeta.name,
            spiritIcon: spiritMeta.icon || '✦',
            summary: '战斗开始时，若当前同行灵契匹配，则灵契蓄能 +1。'
        };
    }

    applyTreasureSetCalibration(treasureId) {
        const treasure = this.getTreasureById(treasureId);
        const setTag = treasure && typeof treasure.setTag === 'string'
            ? treasure.setTag.trim()
            : '';
        if (!treasure || !setTag) return null;
        if (!treasure.data || typeof treasure.data !== 'object') treasure.data = {};

        (Array.isArray(this.collectedTreasures) ? this.collectedTreasures : []).forEach((entry) => {
            if (!entry) return;
            if (!entry.data || typeof entry.data !== 'object') entry.data = {};
            delete entry.data.workshopSetEcho;
        });

        treasure.data.workshopSetEcho = true;
        return {
            id: treasure.id,
            name: treasure.name,
            icon: treasure.icon || '✦',
            setTag,
            setLabel: this.getTreasureSetLabel(setTag),
            pieces: this.getTreasureSetPieces(setTag),
            summary: '该法宝额外视作 1 件同套装法宝，用于补齐套装共鸣阈值。'
        };
    }

    // 获得法宝
    addTreasure(treasureId) {
        // 如果已拥有，补偿金币
        if (this.hasTreasure(treasureId)) {
            // 已有，补偿金币
            this.gold += 50;
            Utils.showBattleLog(`已拥有该法宝，转化为50灵石`);
            return false;
        }

        const treasureData = TREASURES[treasureId];
        if (!treasureData) return false;

        // 深拷贝并初始化
        const treasure = {
            ...treasureData,
            obtainedAt: Date.now(),
            data: treasureData.data ? { ...treasureData.data } : {} // 运行时数据
        };

        // 存入收集库
        this.collectedTreasures = this.collectedTreasures || [];
        this.collectedTreasures.push(treasure);

        // 为了兼容性，this.treasures指向已装备的法宝，或者我们修改逻辑
        // 方案：this.treasures 改为 this.equippedTreasures 别名，保持旧代码兼容？
        // 不，最好显式区分。旧代码使用 this.treasures 遍历生效。
        // 所以我们让 this.treasures 指向 this.equippedTreasures。
        // 但为了存储，我们需要分开。

        // 自动装备逻辑：如果有空位，自动装备
        if (this.equippedTreasures.length < this.getMaxTreasureSlots()) {
            this.equipTreasure(treasureId);
        } else {
            Utils.showBattleLog(`获得法宝【${treasure.name}】，已放入法宝囊`);
        }

        // 触发获取回调
        if (treasure.callbacks && treasure.callbacks.onObtain) {
            treasure.callbacks.onObtain(this, treasure);
        }

        return true;
    }

    // 是否拥有法宝 (检查收集库)
    hasTreasure(treasureId) {
        return (this.collectedTreasures || []).some(t => t.id === treasureId);
    }

    // 是否装备法宝 (检查装备栏)
    isTreasureEquipped(treasureId) {
        return this.equippedTreasures.some(t => t.id === treasureId);
    }

    getMaxHandSize() {
        let limit = Math.max(1, Math.floor(Number(this.maxHandSize) || 10));
        const vowEffects = this.getRunVowEffects();
        limit += Math.floor(Number(vowEffects.maxHandSizeOffset) || 0);
        if (this.game && typeof this.game.getEndlessParanoiaHandLimitPenalty === 'function') {
            limit += Math.floor(Number(this.game.getEndlessParanoiaHandLimitPenalty()) || 0);
        }
        return Math.max(1, limit);
    }

    // 获取最大法宝槽位
    getMaxTreasureSlots() {
        let slots = 2; // 初始
        const r = Math.max(this.realm, this.maxRealmReached || 1);
        if (r >= 5) slots++;
        if (r >= 10) slots++;
        if (r >= 12) slots++;
        if (r >= 15) slots++;
        if (this.game && typeof this.game.getEndlessParanoiaTreasureSlotBonus === 'function') {
            slots += Math.max(0, Math.floor(Number(this.game.getEndlessParanoiaTreasureSlotBonus()) || 0));
        }

        // Fix: Slot count should not decrease when returning to earlier realms
        if (!this._maxTreasureSlots || slots > this._maxTreasureSlots) {
            this._maxTreasureSlots = slots;
        }
        return this._maxTreasureSlots;
    }

    // 装备法宝
    equipTreasure(treasureId) {
        if (!this.hasTreasure(treasureId)) return false;
        if (this.isTreasureEquipped(treasureId)) return false;
        if (this.equippedTreasures.length >= this.getMaxTreasureSlots()) {
            Utils.showBattleLog('法宝槽位已满！');
            return false;
        }

        const treasure = this.collectedTreasures.find(t => t.id === treasureId);
        if (treasure) {
            this.equippedTreasures.push(treasure);
            // 同步旧属性以保证兼容
            this.treasures = this.equippedTreasures;
            Utils.showBattleLog(`已装备法宝：${treasure.name}`);
            return true;
        }
        return false;
    }

    // 卸下法宝
    unequipTreasure(treasureId) {
        const index = this.equippedTreasures.findIndex(t => t.id === treasureId);
        if (index > -1) {
            const t = this.equippedTreasures[index];
            this.equippedTreasures.splice(index, 1);
            // 同步
            this.treasures = this.equippedTreasures;
            Utils.showBattleLog(`已卸下法宝：${t.name}`);
            return true;
        }
        return false;
    }

    cleanseTreasureDebuffs(limit = 1) {
        if (!this.buffs || typeof this.buffs !== 'object') this.buffs = {};
        const debuffTypes = ['weak', 'vulnerable', 'poison', 'burn', 'paralysis', 'stun', 'freeze', 'slow'];
        const removed = [];
        for (const debuffType of debuffTypes) {
            if (removed.length >= limit) break;
            if (Math.max(0, Math.floor(Number(this.buffs[debuffType]) || 0)) > 0) {
                delete this.buffs[debuffType];
                removed.push(debuffType);
            }
        }
        return {
            cleansed: removed.length,
            removed
        };
    }

    // 触发法宝效果 (只触发装备的)
    // 支持返回值修改（例如伤害减免）
    triggerTreasureEffect(triggerType, ...args) {
        let result = null;
        this.equippedTreasures.forEach(treasure => {
            if (treasure.callbacks && treasure.callbacks[triggerType]) {
                const callbackResult = treasure.callbacks[triggerType](this, ...args, treasure);
                // 某些回调可能返回修改后的值
                if (callbackResult !== undefined) {
                    if (callbackResult === true) {
                        result = true;
                    } else if (result !== true) {
                        result = callbackResult;
                    }
                }
            }
        });

        if (triggerType === 'onBattleStart') {
            const workshopLogs = [];
            this.equippedTreasures.forEach((treasure) => {
                const data = treasure && treasure.data && typeof treasure.data === 'object'
                    ? treasure.data
                    : null;
                if (!data) return;
                if (data.workshopReforge === 'bulwark') {
                    this.addBlock(4);
                    workshopLogs.push(`${treasure.name} 护盾 +4`);
                } else if (data.workshopReforge === 'tempo') {
                    this.drawCards(1);
                    workshopLogs.push(`${treasure.name} 抽牌 +1`);
                }
            });

            const spiritMeta = this.getSpiritCompanionMeta();
            const infusedTreasure = this.equippedTreasures.find((treasure) => (
                treasure
                && treasure.data
                && typeof treasure.data.workshopSpiritBond === 'string'
                && treasure.data.workshopSpiritBond.length > 0
            ));
            if (
                infusedTreasure
                && spiritMeta
                && infusedTreasure.data.workshopSpiritBond === spiritMeta.id
                && typeof this.gainSpiritCharge === 'function'
            ) {
                const chargeResult = this.gainSpiritCharge(1);
                if (chargeResult.gained > 0) {
                    workshopLogs.push(`${infusedTreasure.name} 为 ${spiritMeta.name} 蓄能 +${chargeResult.gained}`);
                }
            }

            if (workshopLogs.length > 0 && typeof Utils !== 'undefined' && Utils.showBattleLog) {
                Utils.showBattleLog(`【炼器坊】${workshopLogs.join('；')}`);
            }
        }

        if (triggerType === 'onTurnStart') {
            const workshopLogs = [];
            this.equippedTreasures.forEach((treasure) => {
                const data = treasure && treasure.data && typeof treasure.data === 'object'
                    ? treasure.data
                    : null;
                if (!data || data.workshopReforge !== 'harmony') return;

                const cleanseResult = this.cleanseTreasureDebuffs(1);
                if (cleanseResult.cleansed > 0) {
                    workshopLogs.push(`${treasure.name} 净化 ${cleanseResult.removed.join(' / ')}`);
                } else {
                    this.addBlock(3);
                    workshopLogs.push(`${treasure.name} 护盾 +3`);
                }
            });

            if (workshopLogs.length > 0 && typeof Utils !== 'undefined' && Utils.showBattleLog) {
                Utils.showBattleLog(`【炼器坊】${workshopLogs.join('；')}`);
            }
        }

        const setCounts = this.getEquippedTreasureSetCounts();
        const xuanjiaPieces = Math.max(0, Math.floor(Number(setCounts.xuanjia) || 0));
        const liemaiPieces = Math.max(0, Math.floor(Number(setCounts.liemai) || 0));
        const xinghengPieces = Math.max(0, Math.floor(Number(setCounts.xingheng) || 0));
        const wuxingPieces = Math.max(0, Math.floor(Number(setCounts.wuxing) || 0));

        if (triggerType === 'onBattleStart') {
            if (xinghengPieces >= 3) {
                this.drawCards(1);
                Utils.showBattleLog('【星衡套·3】开场校准：抽牌 +1');
            }
        } else if (triggerType === 'onTurnStart') {
            if (xuanjiaPieces >= 3) {
                this.addBuff('retainBlock', 1);
                this.addBuff('thorns', 1);
                Utils.showBattleLog('【玄甲套·3】护势整备：获得护盾留存与反击荆棘');
            }

            if (xinghengPieces >= 2) {
                if ((this.currentEnergy || 0) <= Math.max(0, (this.baseEnergy || 0) - 1)) {
                    this.gainEnergy(1);
                    Utils.showBattleLog('【星衡套·2】节奏回补：灵力 +1');
                } else {
                    this.drawCards(1);
                    Utils.showBattleLog('【星衡套·2】节奏前推：抽牌 +1');
                }
            }

            if (wuxingPieces >= 2) {
                const cleanseResult = this.cleanseTreasureDebuffs(1);
                if (cleanseResult.cleansed > 0) {
                    Utils.showBattleLog(`【五行套·2】调序净化：移除 ${cleanseResult.removed.join(' / ')}`);
                    if (wuxingPieces >= 3) {
                        this.drawCards(1);
                        Utils.showBattleLog('【五行套·3】轮转回响：抽牌 +1');
                    }
                } else {
                    this.addBlock(3);
                    Utils.showBattleLog('【五行套·2】调序护体：获得 3 护盾');
                    if (wuxingPieces >= 3) {
                        this.gainEnergy(1);
                        Utils.showBattleLog('【五行套·3】轮转回响：灵力 +1');
                    }
                }
            }
        } else if (triggerType === 'onKill') {
            if (liemaiPieces >= 2) {
                this.heal(2);
                Utils.showBattleLog('【裂脉套·2】斩获回生：恢复 2 生命');
            }
        }

        return result;
    }

    // 触发法宝效果并返回修改的数值（用于伤害计算等）
    triggerTreasureValueEffect(triggerType, value, ...args) {
        let modifiedValue = value;
        this.equippedTreasures.forEach(treasure => {
            if (treasure.callbacks && treasure.callbacks[triggerType]) {
                const result = treasure.callbacks[triggerType](this, modifiedValue, ...args, treasure);
                if (typeof result === 'number') {
                    modifiedValue = result;
                }
            }
        });

        const setCounts = this.getEquippedTreasureSetCounts();
        const xuanjiaPieces = Math.max(0, Math.floor(Number(setCounts.xuanjia) || 0));
        const liemaiPieces = Math.max(0, Math.floor(Number(setCounts.liemai) || 0));
        const xinghengPieces = Math.max(0, Math.floor(Number(setCounts.xingheng) || 0));

        if (triggerType === 'onGainBlock' && xuanjiaPieces >= 2) {
            modifiedValue = Math.max(0, Math.floor(Number(modifiedValue || 0) * 1.2));
        }

        if (triggerType === 'onBeforeTakeDamage' && xuanjiaPieces >= 3) {
            modifiedValue = Math.max(0, Math.floor(Number(modifiedValue || 0)) - 1);
        }

        if (triggerType === 'onBeforeDealDamage') {
            const context = args && args[0] && typeof args[0] === 'object' ? args[0] : null;
            const target = context && context.target && typeof context.target === 'object'
                ? context.target
                : null;
            const bleedStacks = target && target.buffs
                ? Math.max(0, Math.floor(Number(target.buffs.bleed) || 0))
                : 0;

            if (liemaiPieces >= 2 && bleedStacks > 0) {
                let bonus = Math.max(1, Math.floor(bleedStacks * 0.5));
                if (liemaiPieces >= 3 && bleedStacks >= 6) {
                    const maxHp = Math.max(1, Math.floor(Number(target?.maxHp || target?.hp || 1)));
                    bonus += Math.max(2, Math.floor(maxHp * 0.06));
                }
                modifiedValue = Math.max(0, Math.floor(Number(modifiedValue) || 0) + bonus);
            }

            if (xinghengPieces >= 3 && Math.floor(Number(this.currentEnergy) || 0) === Math.floor(Number(this.baseEnergy) || 0)) {
                modifiedValue = Math.max(0, Math.floor(Number(modifiedValue) || 0) + 2);
            }

            const hasDebuff = target && target.buffs && Object.values(target.buffs).some((value) => (
                Math.max(0, Math.floor(Number(value) || 0)) > 0
            ));
            const reforgeTreasure = this.equippedTreasures.find((treasure) => (
                treasure
                && treasure.data
                && treasure.data.workshopReforge === 'rend'
            ));
            if (reforgeTreasure && hasDebuff) {
                modifiedValue = Math.max(0, Math.floor(Number(modifiedValue) || 0) + 3);
            }
        }

        return modifiedValue;
    }

    // 检查Buff
    hasBuff(type) {
        return this.buffs && this.buffs[type] && this.buffs[type] > 0;
    }

    // 移除Buff
    removeBuff(type, value = 0) {
        if (!this.hasBuff(type)) return;

        if (value <= 0 || value >= this.buffs[type]) {
            delete this.buffs[type];
        } else {
            this.buffs[type] -= value;
        }
    }
}
