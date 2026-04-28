/**
 * The Defier - 地图系统
 */

class GameMap {
    constructor(game) {
        this.game = game;
        this.nodes = [];
        this.currentNodeIndex = -1;
        this.completedNodes = [];
        this.lastEndlessPressure = null;
        this.endlessPressurePulseTimer = null;
    }

    // 生成地图
    generate(realm) {
        const cacheKey = (this.game && typeof this.game.getMapCacheKey === 'function')
            ? this.game.getMapCacheKey(realm)
            : `realm:${realm}`;
        const endlessActive = !!(this.game && typeof this.game.isEndlessActive === 'function' && this.game.isEndlessActive());
        const cachePool = (this.game && this.game.player && this.game.player.realmMaps) ? this.game.player.realmMaps : null;
        const cachedMap = cachePool
            ? (cachePool[cacheKey] || (!endlessActive ? cachePool[realm] : null))
            : null;

        // V4.2 Persistence: Check if we have a saved map for this realm
        if (cachedMap) {
            console.log(`Loading cached map for ${cacheKey}`);
            const cached = cachedMap;
            this.nodes = cached.nodes;
            this.completedNodes = cached.completedNodes || [];

            // Re-bind click events (functions are not saved in JSON)
            // Actually, renderV3Nodes re-binds them based on data.
            // But we need to ensure the data structure is valid.
            return this.nodes;
        }

        console.log(`Generating new map for Realm ${realm}`);
        this.nodes = [];
        this.currentNodeIndex = -1;
        this.completedNodes = [];

        // 获取层配置
        let config = window.LEVEL_CONFIG ? window.LEVEL_CONFIG.getRealmConfig(realm) : { rows: 8, nodesSequence: [] };
        if (this.game && typeof this.game.isEndlessActive === 'function' && this.game.isEndlessActive()) {
            if (typeof this.game.getEndlessMapConfig === 'function') {
                config = this.game.getEndlessMapConfig(realm) || config;
            }
        }
        const rows = config.rows;

        let nodeId = 0;

        // 1. 生成普通层
        for (let row = 0; row < rows - 1; row++) {
            const rowNodes = [];
            let nodeCount = 2;
            if (config.nodesSequence && config.nodesSequence[row]) {
                nodeCount = config.nodesSequence[row];
            } else {
                nodeCount = Math.random() > 0.5 ? 3 : 2;
            }

            for (let i = 0; i < nodeCount; i++) {
                const nodeType = this.getRandomNodeType(row, rows, realm, {
                    currentRowNodes: rowNodes,
                    previousRowNodes: row > 0 ? this.nodes[row - 1] : [],
                    previousTwoRowNodes: row > 1 ? this.nodes[row - 2] : []
                });
                // --- P0 机制：地图路线污染 (Route Pollution) ---
                // 非第一层、非BOSS层的节点，有15%概率被污染，且必须是可包含污染类型的战斗或精英节点(也可以是事件)
                const isPolluted = row > 0 && row < rows - 1 && Math.random() < 0.15 && ['enemy', 'elite', 'event'].includes(nodeType);

                // --- P1 机制：心魔对决 (Ghost Duel) ---
                // 有一定概率（比如根据玩家Karma或业力，这里给固定15%概率）将精英节点替换为残影挑战
                let finalNodeType = nodeType;
                if (nodeType === 'elite' && Math.random() < 0.15) {
                    finalNodeType = 'ghost_duel';
                }

                rowNodes.push({
                    id: nodeId++,
                    row: row,
                    type: finalNodeType,
                    icon: this.getNodeIcon(finalNodeType),
                    completed: false,
                    accessible: row === 0,
                    polluted: isPolluted
                });
            }
            this.nodes.push(rowNodes);
        }

        // 2. 生成BOSS层 (最后一行)
        this.nodes.push([{
            id: nodeId++,
            row: rows - 1,
            type: 'boss',
            icon: '👹',
            completed: false,
            accessible: false
        }]);

        // Save initial state to cache
        this.saveStateToCache(cacheKey);
        if (this.game && typeof this.game.consumePendingRouteRumorProfile === 'function') {
            this.game.consumePendingRouteRumorProfile(realm);
        }

        return this.nodes;
    }

    // Helper to save state
    saveStateToCache(cacheKey) {
        if (!this.game.player.realmMaps) this.game.player.realmMaps = {};
        const key = cacheKey || (this.game && typeof this.game.getMapCacheKey === 'function'
            ? this.game.getMapCacheKey(this.game.player.realm)
            : this.game.player.realm);
        this.game.player.realmMaps[key] = {
            nodes: this.nodes,
            completedNodes: this.completedNodes
        };
        // Auto-save game to persist this change immediately? 
        // Better to let local autosave handle it, or trigger it here if critical.
    }

    // 获取随机节点类型
    getRandomNodeType(row, totalRows, realm, context = null) {
        // 第一行必有战斗 (Hardcore: 60% enemy / 40% elite)
        if (row === 0) {
            return Math.random() < 0.6 ? 'enemy' : 'elite';
        }

        // 最后一行是BOSS
        if (row === totalRows - 1) {
            return 'boss';
        }

        // 检查是否通过改关卡 (Current Realm < Max Reached)
        const endlessActive = !!(this.game && typeof this.game.isEndlessActive === 'function' && this.game.isEndlessActive());
        const isPassed = !endlessActive && this.game.player.maxRealmReached > realm;

        if (isPassed) {
            // Only monsters (enemy/elite) and boss (handled above)
            // Hardcore ratio based on 50/20 normalized => ~71.4% enemy / 28.6% elite
            return Math.random() < (0.5 / 0.7) ? 'enemy' : 'elite';
        }

        const weights = this.getDynamicNodeWeights(row, totalRows, realm, context);
        return this.rollNodeByWeights(weights);
    }

    getDynamicNodeWeights(row, totalRows, realm, context = null) {
        const player = this.game && this.game.player ? this.game.player : {};
        const progress = row / Math.max(1, totalRows - 1);
        const weights = {
            enemy: 0.46,
            elite: 0.18,
            event: 0.08,
            shop: 0.07,
            trial: 0.05,
            forge: 0.03,
            rest: 0.02,
            observatory: 0.04,
            spirit_grotto: 0.03,
            forbidden_altar: 0.03,
            memory_rift: 0.04
        };

        // 中后段提升试炼、裂隙与禁术节点的出现率，强化构筑转折
        if (progress >= 0.45) {
            weights.trial += 0.025;
            weights.memory_rift += 0.012;
            weights.observatory += 0.006;
            weights.enemy -= 0.02;
            weights.event -= 0.012;
            weights.shop -= 0.011;
        }
        if (progress >= 0.72) {
            weights.trial += 0.015;
            weights.forbidden_altar += 0.014;
            weights.memory_rift += 0.008;
            weights.forge += 0.008;
            weights.enemy -= 0.018;
            weights.shop -= 0.014;
            weights.rest -= 0.013;
        }

        // 金币不足时，降低锻炉概率，避免“到点但用不起”的无效体验
        const forgeDiscount = player && player.legacyBonuses ? (player.legacyBonuses.forgeCostDiscount || 0) : 0;
        const expectedForgeCost = Math.floor((55 + realm * 9) * (1 - Math.min(0.35, forgeDiscount)));
        if ((player.gold || 0) < expectedForgeCost) {
            weights.forge -= 0.015;
            weights.observatory += 0.006;
            weights.memory_rift += 0.004;
            weights.event += 0.01;
            weights.rest += 0.01;
        }

        // 可升级牌较多时，略微提升锻炉价值
        const deck = Array.isArray(player.deck) ? player.deck : [];
        const upgradableCount = (typeof canUpgradeCard === 'function')
            ? deck.filter(card => canUpgradeCard(card)).length
            : 0;
        if (upgradableCount >= 4) {
            weights.forge += 0.02;
            weights.memory_rift += 0.006;
            weights.enemy -= 0.015;
            weights.event -= 0.005;
        } else if (upgradableCount <= 1) {
            weights.forge -= 0.015;
            weights.rest += 0.01;
            weights.event += 0.005;
        }

        // 流派成型后，地图层面轻度提升事件节点出现率（与事件池偏置形成双层引导）
        // 仅做温和调整，避免路线被单一节点类型挤占。
        const preferredArchetype = this.getPreferredArchetypeId(player);
        if (preferredArchetype && progress >= 0.2 && progress <= 0.9) {
            weights.event += 0.022;
            weights.memory_rift += 0.014;
            weights.observatory += 0.006;
            weights.enemy -= 0.018;
            weights.shop -= 0.01;
            weights.rest -= 0.008;
        }

        const fateRingPath = this.getFateRingPath(player);
        const pathDoctrineProfile = (player && typeof player.getPathDoctrineProfile === 'function')
            ? player.getPathDoctrineProfile()
            : null;
        this.applyFatePathNodeBias(weights, fateRingPath, progress, pathDoctrineProfile);

        if (this.game && typeof this.game.isEndlessActive === 'function' && this.game.isEndlessActive()) {
            const modifiers = (typeof this.game.getEndlessModifiers === 'function')
                ? this.game.getEndlessModifiers()
                : null;
            const shift = modifiers && modifiers.mapWeightShift && typeof modifiers.mapWeightShift === 'object'
                ? modifiers.mapWeightShift
                : {};
            Object.keys(shift).forEach((key) => {
                if (!Object.prototype.hasOwnProperty.call(weights, key)) return;
                const delta = Number(shift[key]);
                if (!Number.isFinite(delta)) return;
                weights[key] += delta;
            });
        }

        const rumorProfile = this.game && typeof this.game.getPendingRouteRumorProfile === 'function'
            ? this.game.getPendingRouteRumorProfile(realm)
            : null;
        const rumorShift = rumorProfile && rumorProfile.shift && typeof rumorProfile.shift === 'object'
            ? rumorProfile.shift
            : null;
        if (rumorShift) {
            Object.keys(rumorShift).forEach((key) => {
                if (!Object.prototype.hasOwnProperty.call(weights, key)) return;
                const delta = Number(rumorShift[key]);
                if (!Number.isFinite(delta)) return;
                weights[key] += delta;
            });
        }

        const vowEffects = player && typeof player.getRunVowEffects === 'function'
            ? player.getRunVowEffects()
            : null;
        const vowShift = vowEffects && vowEffects.mapWeightShift && typeof vowEffects.mapWeightShift === 'object'
            ? vowEffects.mapWeightShift
            : null;
        if (vowShift) {
            Object.keys(vowShift).forEach((key) => {
                if (!Object.prototype.hasOwnProperty.call(weights, key)) return;
                const delta = Number(vowShift[key]);
                if (!Number.isFinite(delta)) return;
                weights[key] += delta;
            });
        }

        const runPathEffects = player && typeof player.getRunPathEffects === 'function'
            ? player.getRunPathEffects()
            : null;
        const runPathShift = runPathEffects && runPathEffects.mapWeightShift && typeof runPathEffects.mapWeightShift === 'object'
            ? runPathEffects.mapWeightShift
            : null;
        if (runPathShift) {
            Object.keys(runPathShift).forEach((key) => {
                if (!Object.prototype.hasOwnProperty.call(weights, key)) return;
                const delta = Number(runPathShift[key]);
                if (!Number.isFinite(delta)) return;
                weights[key] += delta;
            });
        }

        const engineeringShift = this.game && typeof this.game.getStrategicEngineeringWeightShift === 'function'
            ? this.game.getStrategicEngineeringWeightShift()
            : null;
        if (engineeringShift && typeof engineeringShift === 'object') {
            Object.keys(engineeringShift).forEach((key) => {
                if (!Object.prototype.hasOwnProperty.call(weights, key)) return;
                const delta = Number(engineeringShift[key]);
                if (!Number.isFinite(delta)) return;
                weights[key] += delta;
            });
        }

        const agendaShift = this.game && typeof this.game.getSanctumAgendaWeightShift === 'function'
            ? this.game.getSanctumAgendaWeightShift()
            : null;
        if (agendaShift && typeof agendaShift === 'object') {
            Object.keys(agendaShift).forEach((key) => {
                if (!Object.prototype.hasOwnProperty.call(weights, key)) return;
                const delta = Number(agendaShift[key]);
                if (!Number.isFinite(delta)) return;
                weights[key] += delta;
            });
        }

        const aftereffectShift = this.game && typeof this.game.getFateAftereffectWeightShift === 'function'
            ? this.game.getFateAftereffectWeightShift()
            : null;
        if (aftereffectShift && typeof aftereffectShift === 'object') {
            Object.keys(aftereffectShift).forEach((key) => {
                if (!Object.prototype.hasOwnProperty.call(weights, key)) return;
                const delta = Number(aftereffectShift[key]);
                if (!Number.isFinite(delta)) return;
                weights[key] += delta;
            });
        }

        const seasonBoardShift = this.game && typeof this.game.getSeasonBoardWeightShift === 'function'
            ? this.game.getSeasonBoardWeightShift()
            : null;
        if (seasonBoardShift && typeof seasonBoardShift === 'object') {
            Object.keys(seasonBoardShift).forEach((key) => {
                if (!Object.prototype.hasOwnProperty.call(weights, key)) return;
                const delta = Number(seasonBoardShift[key]);
                if (!Number.isFinite(delta)) return;
                weights[key] += delta;
            });
        }

        this.applyStrategicNodeBias(weights, row, totalRows, realm, context);
        this.applyRouteDiversityPressure(weights, row, totalRows, context);
        this.applyLongTermDiversityPressure(weights, row, totalRows, context);
        this.applyNodePityPressure(weights, row, totalRows, context);

        return this.normalizeNodeWeights(weights);
    }

    getPreferredArchetypeId(player = null) {
        const source = player || (this.game && this.game.player ? this.game.player : null);
        if (!source) return null;

        const resonanceId = source.archetypeResonance && source.archetypeResonance.id;
        if (typeof resonanceId === 'string' && resonanceId.length > 0) {
            return resonanceId;
        }

        if (typeof inferDeckArchetype === 'function') {
            try {
                const inferred = inferDeckArchetype(Array.isArray(source.deck) ? source.deck : []);
                if (typeof inferred === 'string' && inferred.length > 0) {
                    return inferred;
                }
            } catch (e) {
                console.warn('Map archetype inference failed:', e);
            }
        }

        return null;
    }

    getFateRingPath(player = null) {
        const source = player || (this.game && this.game.player ? this.game.player : null);
        if (!source || !source.fateRing) return null;
        const path = source.fateRing.path;
        return (typeof path === 'string' && path.length > 0) ? path : null;
    }

    applyFatePathNodeBias(weights, path, progress = 0, doctrineProfile = null) {
        if (!path || typeof path !== 'string' || path === 'crippled') return;

        const pathShift = {
            convergence: { event: 0.018, trial: 0.012, observatory: 0.01, memory_rift: 0.008, enemy: -0.016, rest: -0.006, shop: -0.004, forge: -0.008 },
            resonance: { trial: 0.016, rest: 0.014, memory_rift: 0.006, enemy: -0.015, elite: -0.009, forge: -0.004, event: -0.004 },
            agility: { enemy: 0.018, elite: 0.012, event: -0.01, rest: -0.012, shop: -0.008 },
            wisdom: { event: 0.014, shop: 0.008, observatory: 0.012, memory_rift: 0.008, enemy: -0.012, elite: -0.006, rest: -0.004, trial: -0.006 },
            insight: { event: 0.012, trial: 0.012, observatory: 0.01, memory_rift: 0.012, enemy: -0.012, shop: -0.006, forge: -0.006, rest: -0.004 },
            destruction: { enemy: 0.02, elite: 0.014, forbidden_altar: 0.012, rest: -0.01, shop: -0.008, event: -0.008, trial: -0.008 },
            toughness: { rest: 0.016, forge: 0.01, event: 0.008, enemy: -0.012, elite: -0.008, trial: -0.006 }
        };

        const shift = pathShift[path];
        if (!shift || typeof shift !== 'object') return;

        Object.keys(shift).forEach((key) => {
            if (!Object.prototype.hasOwnProperty.call(weights, key)) return;
            const delta = Number(shift[key]);
            if (!Number.isFinite(delta)) return;
            weights[key] += delta;
        });

        if (path === 'convergence' && progress >= 0.45) {
            weights.trial += 0.008;
            weights.enemy -= 0.006;
            weights.shop -= 0.002;
        }

        if (path === 'resonance' && progress >= 0.6) {
            weights.rest += 0.008;
            weights.enemy -= 0.006;
            weights.elite -= 0.002;
        }

        const doctrineTier = (
            doctrineProfile &&
            doctrineProfile.path === path &&
            Number.isFinite(Number(doctrineProfile.tier))
        )
            ? Math.max(0, Math.floor(Number(doctrineProfile.tier) || 0))
            : 0;
        if (doctrineTier <= 0) return;

        if (path === 'wisdom') {
            // 智慧教义：提升功能节点出现，稳定形成事件/商店驱动路线
            const eventBoost = 0.006 + doctrineTier * 0.006;
            const shopBoost = 0.003 + doctrineTier * 0.004;
            const trialBoost = doctrineTier >= 2 ? 0.003 * (doctrineTier - 1) : 0;
            const observatoryBoost = 0.003 + doctrineTier * 0.003;
            const riftBoost = doctrineTier >= 2 ? 0.002 + doctrineTier * 0.002 : 0;
            weights.event += eventBoost;
            weights.shop += shopBoost;
            weights.trial += trialBoost;
            weights.observatory += observatoryBoost;
            weights.memory_rift += riftBoost;
            weights.enemy -= 0.007 + doctrineTier * 0.004;
            weights.elite -= 0.003 + doctrineTier * 0.002;
            weights.rest -= 0.0015 * doctrineTier;
            return;
        }

        if (path === 'convergence') {
            weights.trial += 0.002 + doctrineTier * 0.002;
            weights.forge += doctrineTier >= 2 ? 0.0015 * doctrineTier : 0;
            weights.memory_rift += doctrineTier >= 2 ? 0.001 * doctrineTier : 0;
            weights.enemy -= 0.002 + doctrineTier * 0.0015;
            return;
        }

        if (path === 'resonance') {
            weights.rest += 0.002 + doctrineTier * 0.002;
            weights.event += doctrineTier >= 2 ? 0.0015 * doctrineTier : 0;
            weights.memory_rift += doctrineTier >= 3 ? 0.0015 * doctrineTier : 0;
            weights.enemy -= 0.002 + doctrineTier * 0.0015;
            return;
        }
    }

    applyStrategicNodeBias(weights, row, totalRows, realm, context = null) {
        if (!weights || typeof weights !== 'object') return;
        const player = this.game && this.game.player ? this.game.player : null;
        if (!player) return;

        const progress = row / Math.max(1, totalRows - 1);
        const maxHp = Math.max(1, Number.isFinite(Number(player.maxHp)) ? Number(player.maxHp) : 80);
        const currentHp = Number.isFinite(Number(player.currentHp)) ? Number(player.currentHp) : maxHp;
        const hpRatio = Math.max(0, currentHp) / maxHp;
        const pendingRumor = this.game && typeof this.game.getPendingRouteRumorProfile === 'function'
            ? this.game.getPendingRouteRumorProfile(realm + 1)
            : null;
        const destiny = player && typeof player.getRunDestinyMeta === 'function'
            ? player.getRunDestinyMeta()
            : null;
        const destinyBase = destiny && typeof RUN_DESTINIES !== 'undefined' ? RUN_DESTINIES[destiny.id] : null;
        const destinyMaxTier = destinyBase && Array.isArray(destinyBase.tiers)
            ? Math.max(1, destinyBase.tiers.length)
            : 1;
        const vows = player && typeof player.getRunVowMetas === 'function'
            ? player.getRunVowMetas()
            : [];
        const vowCanGrow = vows.length < 2 || vows.some((meta) => meta && meta.tier < meta.maxTier);

        if (!pendingRumor && realm < 18 && progress >= 0.2) {
            weights.observatory += 0.01;
            weights.enemy -= 0.005;
            weights.shop -= 0.005;
        }

        const spirit = player && typeof player.getSpiritCompanionMeta === 'function'
            ? player.getSpiritCompanionMeta()
            : null;
        const spiritCanGrow = spirit && Number(spirit.tier) < Number(spirit.maxTier || spirit.tier || 1);
        if ((!spirit || spiritCanGrow) && progress >= 0.24) {
            weights.spirit_grotto += spirit ? 0.016 : 0.02;
            weights.enemy -= 0.008;
            weights.shop -= 0.006;
        }

        if (destiny && destiny.tier < destinyMaxTier) {
            weights.memory_rift += 0.014;
            weights.event -= 0.006;
            weights.enemy -= 0.008;
        }

        if (vowCanGrow && progress >= 0.42) {
            weights.forbidden_altar += 0.01;
            weights.enemy -= 0.005;
            weights.rest -= 0.005;
        }

        if ((Number(player.karma) || 0) >= 2 && hpRatio >= 0.55) {
            weights.forbidden_altar += 0.008;
            weights.shop -= 0.004;
            weights.event -= 0.004;
        }

        if (hpRatio <= 0.42 || maxHp <= 24) {
            weights.forbidden_altar -= 0.015;
            weights.rest += 0.009;
            weights.observatory += 0.006;
        }

        const recentRows = this.getRecentRowsForBias(row, 3, context);
        const hasStrategicNode = recentRows.some((rowNodes) => (
            this.rowContainsType(rowNodes, 'observatory')
            || this.rowContainsType(rowNodes, 'spirit_grotto')
            || this.rowContainsType(rowNodes, 'forbidden_altar')
            || this.rowContainsType(rowNodes, 'memory_rift')
        ));
        if (!hasStrategicNode && progress >= 0.28) {
            weights.observatory += 0.008;
            weights.spirit_grotto += 0.007;
            weights.memory_rift += 0.009;
            if (hpRatio >= 0.5) weights.forbidden_altar += 0.004;
            weights.enemy -= 0.011;
            weights.elite -= 0.006;
        }
    }

    normalizeNodeTypeForWeights(type) {
        if (type === 'ghost_duel') return 'elite';
        if (type === 'boss') return null;
        return type;
    }

    collectNodeTypeCounts(nodes = []) {
        const counts = {};
        if (!Array.isArray(nodes)) return counts;
        nodes.forEach((node) => {
            const rawType = (node && typeof node === 'object') ? node.type : node;
            if (typeof rawType !== 'string') return;
            const type = this.normalizeNodeTypeForWeights(rawType);
            if (!type || !Object.prototype.hasOwnProperty.call({
                enemy: true,
                elite: true,
                event: true,
                shop: true,
                trial: true,
                forge: true,
                rest: true,
                observatory: true,
                spirit_grotto: true,
                forbidden_altar: true,
                memory_rift: true
            }, type)) return;
            counts[type] = (counts[type] || 0) + 1;
        });
        return counts;
    }

    getDominantNodeType(nodes = []) {
        const counts = this.collectNodeTypeCounts(nodes);
        const entries = Object.entries(counts);
        if (entries.length === 0) return null;

        let dominantType = null;
        let dominantCount = 0;
        let total = 0;
        entries.forEach(([type, count]) => {
            total += count;
            if (count > dominantCount) {
                dominantCount = count;
                dominantType = type;
            }
        });

        if (!dominantType || dominantCount < 2) return null;
        if (dominantCount / Math.max(1, total) < 0.5) return null;
        return dominantType;
    }

    applyWeightPenaltyAndRedistribute(weights, targetType, penalty, boostPlan = []) {
        if (!weights || typeof weights !== 'object') return;
        if (!Object.prototype.hasOwnProperty.call(weights, targetType)) return;

        const current = Math.max(0, Number(weights[targetType]) || 0);
        if (current <= 0) return;

        const desiredPenalty = Math.max(0, Number(penalty) || 0);
        if (desiredPenalty <= 0) return;
        const actualPenalty = Math.min(desiredPenalty, current * 0.58);
        if (actualPenalty <= 0) return;

        weights[targetType] = current - actualPenalty;

        const validBoosts = Array.isArray(boostPlan)
            ? boostPlan.filter(([type, factor]) => (
                type !== targetType &&
                Object.prototype.hasOwnProperty.call(weights, type) &&
                Number.isFinite(Number(factor)) &&
                Number(factor) > 0
            ))
            : [];

        if (validBoosts.length === 0) {
            weights.event += actualPenalty * 0.4;
            weights.trial += actualPenalty * 0.25;
            weights.shop += actualPenalty * 0.2;
            weights.rest += actualPenalty * 0.15;
            return;
        }

        const sumFactor = validBoosts.reduce((sum, [, factor]) => sum + Number(factor), 0);
        validBoosts.forEach(([type, factor]) => {
            weights[type] += actualPenalty * (Number(factor) / Math.max(1e-6, sumFactor));
        });
    }

    applyRouteDiversityPressure(weights, row, totalRows, context = null) {
        if (!weights || typeof weights !== 'object') return;
        if (!context || typeof context !== 'object') return;
        if (row <= 0 || row >= totalRows - 1) return;

        const isCombat = (type) => type === 'enemy' || type === 'elite';
        const dominantToBoostPlan = (type) => {
            if (isCombat(type)) {
                return [
                    ['event', 0.22],
                    ['trial', 0.18],
                    ['shop', 0.14],
                    ['forge', 0.12],
                    ['observatory', 0.12],
                    ['spirit_grotto', 0.1],
                    ['memory_rift', 0.12],
                    ['forbidden_altar', 0.06],
                    ['rest', 0.04]
                ];
            }
            return [
                ['enemy', 0.24],
                ['elite', 0.14],
                ['event', 0.12],
                ['trial', 0.12],
                ['shop', 0.12],
                ['observatory', 0.1],
                ['spirit_grotto', 0.1],
                ['memory_rift', 0.1],
                ['forbidden_altar', 0.06]
            ];
        };

        const prevType = this.getDominantNodeType(context.previousRowNodes || []);
        const prev2Type = this.getDominantNodeType(context.previousTwoRowNodes || []);
        if (prevType) {
            this.applyWeightPenaltyAndRedistribute(weights, prevType, 0.045, dominantToBoostPlan(prevType));
        }
        if (prevType && prev2Type && prevType === prev2Type) {
            this.applyWeightPenaltyAndRedistribute(weights, prevType, 0.03, dominantToBoostPlan(prevType));
        }

        const currentCounts = this.collectNodeTypeCounts(context.currentRowNodes || []);
        Object.keys(currentCounts).forEach((type) => {
            const count = Math.max(0, Number(currentCounts[type]) || 0);
            if (count <= 0) return;

            const penalty = Math.min(0.07, 0.03 * count);
            const inRowBoostPlan = isCombat(type)
                ? [
                    ['event', 0.22],
                    ['trial', 0.18],
                    ['shop', 0.14],
                    ['forge', 0.1],
                    ['observatory', 0.14],
                    ['spirit_grotto', 0.12],
                    ['memory_rift', 0.14],
                    ['forbidden_altar', 0.06],
                    ['rest', 0.02]
                ]
                : [
                    ['enemy', 0.24],
                    ['elite', 0.16],
                    ['trial', 0.12],
                    ['event', 0.12],
                    ['shop', 0.1],
                    ['observatory', 0.1],
                    ['spirit_grotto', 0.1],
                    ['memory_rift', 0.1],
                    ['forbidden_altar', 0.06]
                ];
            this.applyWeightPenaltyAndRedistribute(weights, type, penalty, inRowBoostPlan);
        });
    }

    collectRecentTypeCounts(row, lookback = 4, context = null) {
        const rows = [];
        const requestedRows = Array.isArray(context?.historyRows)
            ? context.historyRows
            : null;

        if (requestedRows && requestedRows.length > 0) {
            requestedRows.forEach((historyRow) => {
                if (Array.isArray(historyRow) && historyRow.length > 0) rows.push(historyRow);
            });
        } else {
            const start = Math.max(0, row - Math.max(1, Math.floor(Number(lookback) || 4)));
            for (let r = start; r < row; r += 1) {
                const historyRow = this.nodes[r];
                if (Array.isArray(historyRow) && historyRow.length > 0) rows.push(historyRow);
            }
        }

        if (Array.isArray(context?.currentRowNodes) && context.currentRowNodes.length > 0) {
            rows.push(context.currentRowNodes);
        }

        const counts = {};
        let total = 0;
        rows.forEach((rowNodes) => {
            const part = this.collectNodeTypeCounts(rowNodes);
            Object.entries(part).forEach(([type, value]) => {
                const numeric = Math.max(0, Number(value) || 0);
                if (numeric <= 0) return;
                counts[type] = (counts[type] || 0) + numeric;
                total += numeric;
            });
        });
        return { counts, total };
    }

    applyLongTermDiversityPressure(weights, row, totalRows, context = null) {
        if (!weights || typeof weights !== 'object') return;
        if (row <= 1 || row >= totalRows - 1) return;

        const { counts, total } = this.collectRecentTypeCounts(row, 4, context);
        if (total < 6) return;

        const entries = Object.entries(counts).sort((a, b) => Number(b[1]) - Number(a[1]));
        if (entries.length === 0) return;

        const topRatio = Number(entries[0][1]) / Math.max(1, total);
        if (topRatio < 0.36) return;

        const isCombat = (type) => type === 'enemy' || type === 'elite';
        const planByType = (type) => {
            if (isCombat(type)) {
                return [
                    ['event', 0.2],
                    ['trial', 0.18],
                    ['forge', 0.12],
                    ['shop', 0.12],
                    ['observatory', 0.14],
                    ['spirit_grotto', 0.1],
                    ['memory_rift', 0.14],
                    ['forbidden_altar', 0.06],
                    ['rest', 0.04]
                ];
            }
            return [
                ['enemy', 0.24],
                ['elite', 0.16],
                ['trial', 0.12],
                ['event', 0.1],
                ['shop', 0.12],
                ['observatory', 0.1],
                ['spirit_grotto', 0.1],
                ['memory_rift', 0.1],
                ['forbidden_altar', 0.06]
            ];
        };

        const topType = entries[0][0];
        const topPenalty = topRatio >= 0.45 ? 0.04 : 0.025;
        this.applyWeightPenaltyAndRedistribute(weights, topType, topPenalty, planByType(topType));

        if (entries.length >= 2) {
            const secondType = entries[1][0];
            const secondRatio = Number(entries[1][1]) / Math.max(1, total);
            if (secondType !== topType && secondRatio >= 0.28) {
                this.applyWeightPenaltyAndRedistribute(weights, secondType, 0.015, planByType(secondType));
            }
        }
    }

    getRecentRowsForBias(row, lookback = 4, context = null) {
        const rows = [];
        const sourceNodes = Array.isArray(this.nodes) ? this.nodes : [];
        const requestedRows = Array.isArray(context?.historyRows) ? context.historyRows : null;
        if (requestedRows && requestedRows.length > 0) {
            requestedRows.forEach((historyRow) => {
                if (Array.isArray(historyRow) && historyRow.length > 0) rows.push(historyRow);
            });
            return rows;
        }

        const start = Math.max(0, row - Math.max(1, Math.floor(Number(lookback) || 4)));
        for (let r = start; r < row; r += 1) {
            if (Array.isArray(sourceNodes[r]) && sourceNodes[r].length > 0) {
                rows.push(sourceNodes[r]);
            }
        }
        if (Array.isArray(context?.currentRowNodes) && context.currentRowNodes.length > 0) {
            rows.push(context.currentRowNodes);
        }
        return rows;
    }

    rowContainsType(rowNodes = [], type) {
        if (!Array.isArray(rowNodes) || rowNodes.length === 0) return false;
        return rowNodes.some((node) => {
            const rawType = (node && typeof node === 'object') ? node.type : node;
            if (typeof rawType !== 'string') return false;
            return this.normalizeNodeTypeForWeights(rawType) === type;
        });
    }

    applyNodePityPressure(weights, row, totalRows, context = null) {
        if (!weights || typeof weights !== 'object') return;
        if (row <= 1 || row >= totalRows - 1) return;

        const recentRows = this.getRecentRowsForBias(row, 4, context);
        if (recentRows.length < 3) return;

        const containsEvent = recentRows.some((rowNodes) => this.rowContainsType(rowNodes, 'event'));
        const containsShop = recentRows.some((rowNodes) => this.rowContainsType(rowNodes, 'shop'));
        const containsRest = recentRows.some((rowNodes) => this.rowContainsType(rowNodes, 'rest'));
        const containsStrategic = recentRows.some((rowNodes) => (
            this.rowContainsType(rowNodes, 'observatory')
            || this.rowContainsType(rowNodes, 'forbidden_altar')
            || this.rowContainsType(rowNodes, 'memory_rift')
        ));
        const progress = row / Math.max(1, totalRows - 1);

        if (!containsEvent) {
            weights.event += 0.028;
            weights.enemy -= 0.012;
            weights.elite -= 0.006;
            weights.trial -= 0.006;
            weights.forge -= 0.004;
        }
        if (!containsShop) {
            weights.shop += 0.024;
            weights.enemy -= 0.01;
            weights.elite -= 0.006;
            weights.event -= 0.004;
            weights.rest -= 0.004;
        }
        if (!containsRest && progress >= 0.35) {
            weights.rest += 0.014;
            weights.enemy -= 0.007;
            weights.elite -= 0.004;
            weights.event -= 0.003;
        }
        if (!containsStrategic && progress >= 0.28) {
            weights.observatory += 0.012;
            weights.memory_rift += 0.014;
            if (progress >= 0.55) weights.forbidden_altar += 0.008;
            weights.enemy -= 0.012;
            weights.elite -= 0.006;
        }
    }

    ensurePathSynergyState(player) {
        if (!player || typeof player !== 'object') return {
            path: null,
            streak: 0,
            lastNodeType: null,
            lastGrantedStage: 0
        };

        if (!player.pathSynergyState || typeof player.pathSynergyState !== 'object') {
            player.pathSynergyState = {
                path: null,
                streak: 0,
                lastNodeType: null,
                lastGrantedStage: 0
            };
        }

        const state = player.pathSynergyState;
        state.path = typeof state.path === 'string' ? state.path : null;
        state.streak = Math.max(0, Math.floor(Number(state.streak) || 0));
        state.lastNodeType = typeof state.lastNodeType === 'string' ? state.lastNodeType : null;
        state.lastGrantedStage = Math.max(0, Math.floor(Number(state.lastGrantedStage) || 0));
        return state;
    }

    applyPathSynergyComboBonus(player, path, node, qualifiedHit) {
        if (!player || !path) return;
        const state = this.ensurePathSynergyState(player);

        if (state.path !== path) {
            state.path = path;
            state.streak = 0;
            state.lastNodeType = null;
            state.lastGrantedStage = 0;
        }

        const nodeType = node && typeof node.type === 'string' ? node.type : null;
        if (!qualifiedHit) {
            state.streak = Math.max(0, state.streak - 1);
            state.lastNodeType = nodeType;
            return;
        }

        state.streak += 1;
        state.lastNodeType = nodeType;

        const stage = state.streak >= 4 ? 2 : state.streak >= 2 ? 1 : 0;
        if (stage <= 0 || stage <= state.lastGrantedStage) return;

        const grantBuff = (buffId, stacks = 1, logText = '') => {
            if (typeof player.grantAdventureBuff !== 'function') return false;
            const ok = player.grantAdventureBuff(buffId, stacks);
            if (ok && logText && typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
                Utils.showBattleLog(logText);
            }
            return ok;
        };
        const gainRingExp = (amount, logText = '') => {
            const exp = Math.max(0, Math.floor(Number(amount) || 0));
            if (exp <= 0 || !player.fateRing) return;
            player.fateRing.exp = Math.max(0, Math.floor(Number(player.fateRing.exp) || 0)) + exp;
            if (typeof player.checkFateRingLevelUp === 'function') player.checkFateRingLevelUp();
            if (logText && typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
                Utils.showBattleLog(logText);
            }
        };
        const gainGold = (amount, logText = '') => {
            const gold = Math.max(0, Math.floor(Number(amount) || 0));
            if (gold <= 0) return;
            player.gold = Math.max(0, Math.floor(Number(player.gold) || 0)) + gold;
            if (logText && typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
                Utils.showBattleLog(logText);
            }
        };
        const healPlayer = (amount, logText = '') => {
            const heal = Math.max(0, Math.floor(Number(amount) || 0));
            if (heal <= 0) return;
            player.currentHp = Math.min(
                Math.max(1, Math.floor(Number(player.maxHp) || 1)),
                Math.max(0, Math.floor(Number(player.currentHp) || 0)) + heal
            );
            if (logText && typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
                Utils.showBattleLog(logText);
            }
        };

        const stageTag = stage === 1 ? '共鸣连携' : '共鸣连携·极';

        switch (path) {
            case 'convergence':
                if (stage === 1) {
                    gainRingExp(10, `${stageTag}：命环经验 +10`);
                    grantBuff('firstTurnDrawBoostBattles', 1, `${stageTag}：首回合抽牌 +1 层`);
                } else {
                    gainRingExp(16, `${stageTag}：命环经验 +16`);
                    grantBuff('firstTurnEnergyBoostBattles', 1, `${stageTag}：首回合灵力强化 +1 层`);
                }
                break;
            case 'resonance':
                if (stage === 1) {
                    grantBuff('openingBlockBoostBattles', 1, `${stageTag}：开场护盾强化 +1 层`);
                } else {
                    grantBuff('victoryHealBoostBattles', 1, `${stageTag}：战后医护 +1 层`);
                    healPlayer(Math.max(6, Math.floor((Number(player.maxHp) || 0) * 0.06)), `${stageTag}：即时调息恢复`);
                }
                break;
            case 'agility':
                if (stage === 1) {
                    gainGold(18, `${stageTag}：获得 18 灵石`);
                } else {
                    gainGold(30, `${stageTag}：获得 30 灵石`);
                    grantBuff('firstTurnEnergyBoostBattles', 1, `${stageTag}：首回合灵力强化 +1 层`);
                }
                break;
            case 'wisdom':
                if (stage === 1) {
                    gainRingExp(12, `${stageTag}：命环经验 +12`);
                } else {
                    gainRingExp(20, `${stageTag}：命环经验 +20`);
                    grantBuff('firstTurnDrawBoostBattles', 1, `${stageTag}：首回合抽牌 +1 层`);
                }
                break;
            case 'insight':
                if (stage === 1) {
                    grantBuff('ringExpBoostBattles', 1, `${stageTag}：命环经验倍率 +1 层`);
                } else {
                    gainRingExp(18, `${stageTag}：命环经验 +18`);
                    grantBuff('ringExpBoostBattles', 1, `${stageTag}：命环经验倍率 +1 层`);
                }
                break;
            case 'destruction':
                if (stage === 1) {
                    grantBuff('victoryGoldBoostBattles', 1, `${stageTag}：胜利额外灵石 +1 层`);
                } else {
                    grantBuff('victoryGoldBoostBattles', 1, `${stageTag}：胜利额外灵石 +1 层`);
                    gainGold(20, `${stageTag}：获得 20 灵石`);
                }
                break;
            case 'toughness':
                if (stage === 1) {
                    grantBuff('victoryHealBoostBattles', 1, `${stageTag}：战后医护 +1 层`);
                } else {
                    grantBuff('victoryHealBoostBattles', 1, `${stageTag}：战后医护 +1 层`);
                    grantBuff('openingBlockBoostBattles', 1, `${stageTag}：开场护盾强化 +1 层`);
                }
                break;
            default:
                break;
        }

        state.lastGrantedStage = stage;
        if (state.streak >= 4) {
            state.streak = 0;
            state.lastGrantedStage = 0;
            state.lastNodeType = null;
        }
    }

    applyPathNodeSynergyReward(node) {
        const player = this.game && this.game.player ? this.game.player : null;
        if (!player || !player.fateRing || !node || node.type === 'boss') return;

        const path = player.fateRing.path;
        if (!path || typeof path !== 'string' || path === 'crippled') return;

        const isCombatNode = ['enemy', 'elite', 'ghost_duel', 'trial'].includes(node.type);
        const grantBuff = (buffId, stacks, logText) => {
            if (typeof player.grantAdventureBuff !== 'function') return false;
            const ok = player.grantAdventureBuff(buffId, stacks);
            if (ok && logText && typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
                Utils.showBattleLog(logText);
            }
            return ok;
        };
        const gainRingExp = (amount, logText) => {
            const exp = Math.max(0, Math.floor(Number(amount) || 0));
            if (exp <= 0) return;
            if (player.fateRing) {
                player.fateRing.exp = Math.max(0, Math.floor(Number(player.fateRing.exp) || 0)) + exp;
                if (typeof player.checkFateRingLevelUp === 'function') player.checkFateRingLevelUp();
            }
            if (logText && typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
                Utils.showBattleLog(logText);
            }
        };
        const gainGold = (amount, logText) => {
            const gold = Math.max(0, Math.floor(Number(amount) || 0));
            if (gold <= 0) return;
            player.gold = Math.max(0, Math.floor(Number(player.gold) || 0)) + gold;
            if (logText && typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
                Utils.showBattleLog(logText);
            }
        };
        const healPlayer = (amount, logText) => {
            const heal = Math.max(0, Math.floor(Number(amount) || 0));
            if (heal <= 0) return;
            player.currentHp = Math.min(
                Math.max(1, Math.floor(Number(player.maxHp) || 1)),
                Math.max(0, Math.floor(Number(player.currentHp) || 0)) + heal
            );
            if (logText && typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
                Utils.showBattleLog(logText);
            }
        };

        let qualifiedHit = false;
        switch (path) {
            case 'convergence':
                if (node.type === 'event' || node.type === 'observatory') {
                    qualifiedHit = true;
                    gainRingExp(12, '汇流节点共鸣：命环经验 +12');
                    grantBuff('firstTurnEnergyBoostBattles', 1, '汇流增幅：首回合灵力强化 +1 层');
                } else if (node.type === 'trial' || node.type === 'forge' || node.type === 'memory_rift' || node.type === 'spirit_grotto') {
                    qualifiedHit = true;
                    gainRingExp(8, '汇流校准：命环经验 +8');
                }
                break;
            case 'resonance':
                if (node.type === 'rest') {
                    qualifiedHit = true;
                    const heal = Math.max(6, Math.floor((Number(player.maxHp) || 0) * 0.08));
                    healPlayer(heal, `共鸣回响：恢复 ${heal} 生命`);
                    grantBuff('openingBlockBoostBattles', 1, '共鸣护场：开场护盾强化 +1 层');
                } else if (node.type === 'trial') {
                    qualifiedHit = true;
                    grantBuff('firstTurnDrawBoostBattles', 1, '共鸣洞察：首回合抽牌 +1 层');
                } else if (node.type === 'spirit_grotto') {
                    qualifiedHit = true;
                    grantBuff('firstTurnDrawBoostBattles', 1, '灵契回响：首回合抽牌 +1 层');
                }
                break;
            case 'agility':
                if (isCombatNode) {
                    qualifiedHit = true;
                    gainGold(14, '迅捷猎获：获得 14 灵石');
                }
                break;
            case 'wisdom':
                if (node.type === 'event' || node.type === 'shop' || node.type === 'observatory' || node.type === 'memory_rift' || node.type === 'spirit_grotto') {
                    qualifiedHit = true;
                    gainRingExp(9, '悟境推演：命环经验 +9');
                }
                break;
            case 'insight':
                if (node.type === 'event' || node.type === 'trial' || node.type === 'observatory' || node.type === 'memory_rift' || node.type === 'spirit_grotto') {
                    qualifiedHit = true;
                    gainRingExp(10, '洞察归纳：命环经验 +10');
                    grantBuff('ringExpBoostBattles', 1, '洞察预热：命环经验倍率 +1 层');
                }
                break;
            case 'destruction':
                if (isCombatNode || node.type === 'forbidden_altar') {
                    qualifiedHit = true;
                    grantBuff('victoryGoldBoostBattles', 1, '毁灭掠夺：胜利额外灵石 +1 层');
                    if (node.type === 'elite' || node.type === 'trial' || node.type === 'forbidden_altar') {
                        gainGold(12, '毁灭追猎：额外获得 12 灵石');
                    }
                }
                break;
            case 'toughness':
                if (node.type === 'rest' || node.type === 'forge') {
                    qualifiedHit = true;
                    grantBuff('victoryHealBoostBattles', 1, '坚韧养势：战后医护 +1 层');
                    if (node.type === 'rest') {
                        const heal = Math.max(5, Math.floor((Number(player.maxHp) || 0) * 0.06));
                        healPlayer(heal, `坚韧调息：恢复 ${heal} 生命`);
                    }
                }
                break;
            default:
                break;
        }

        this.applyPathSynergyComboBonus(player, path, node, qualifiedHit);
    }

    normalizeNodeWeights(weights) {
        const normalized = {};
        let total = 0;
        Object.keys(weights).forEach(key => {
            const val = Math.max(0, weights[key] || 0);
            normalized[key] = val;
            total += val;
        });
        if (total <= 0) {
            return {
                enemy: 0.46,
                elite: 0.18,
                event: 0.08,
                shop: 0.07,
                trial: 0.05,
                forge: 0.03,
                rest: 0.02,
                observatory: 0.04,
                spirit_grotto: 0.03,
                forbidden_altar: 0.03,
                memory_rift: 0.04
            };
        }
        Object.keys(normalized).forEach(key => {
            normalized[key] = normalized[key] / total;
        });
        return normalized;
    }

    rollNodeByWeights(weights) {
        const roll = Math.random();
        let cumulative = 0;
        const order = ['enemy', 'elite', 'event', 'observatory', 'spirit_grotto', 'shop', 'trial', 'forge', 'memory_rift', 'forbidden_altar', 'rest'];
        for (const key of order) {
            cumulative += weights[key] || 0;
            if (roll <= cumulative) return key;
        }
        return 'rest';
    }

    // 获取节点图标
    getNodeIcon(type) {
        const icons = {
            enemy: '⚔️',
            elite: '💀',
            boss: '👹',
            ghost_duel: '👻',
            event: '❓',
            shop: '🏪',
            rest: '🏕️',
            trial: '⚖️',
            forge: '⚒️',
            observatory: '🔭',
            spirit_grotto: '🪷',
            forbidden_altar: '🩸',
            memory_rift: '🪞'
        };
        return icons[type] || '❓';
    }

    getNodeLayoutSignature() {
        if (!Array.isArray(this.nodes)) return 'empty';
        return this.nodes
            .map((row, rowIndex) => {
                if (!Array.isArray(row)) return `${rowIndex}:none`;
                return row
                    .map((node, nodeIndex) => {
                        const nodeId = node && node.id != null ? node.id : `row${rowIndex}-node${nodeIndex}`;
                        const nodeType = node && node.type ? node.type : 'unknown';
                        return `${nodeType}:${nodeId}`;
                    })
                    .join('|');
            })
            .join(' / ');
    }

    // 渲染地图 (V3 - Ascension Style + Flexbox Fix)
    render() {
        console.log('[Debug] Map.render called');
        const container = document.getElementById('map-screen');
        if (!container) {
            console.error('[Debug] #map-screen container missing!');
            return;
        }

        const currentRealm = this.game.player.realm;
        const mapKey = (this.game && typeof this.game.getMapCacheKey === 'function')
            ? this.game.getMapCacheKey(currentRealm)
            : String(currentRealm);
        const nodeLayoutSignature = this.getNodeLayoutSignature();
        const existingMap = container.querySelector('.map-screen-v3');

        // Smart Render Check: If map exists and the node layout is unchanged, update in-place.
        if (
            existingMap
            && existingMap.dataset.mapKey === mapKey
            && existingMap.dataset.nodeSignature === nodeLayoutSignature
        ) {
            console.log('[Debug] Updating existing map in-place');
            this.updateMapState();
            return;
        }

        console.log('[Debug] Full map rebuild for realm:', currentRealm);

        container.innerHTML = `
            <div class="map-screen-v3" data-realm="${currentRealm}" data-map-key="${mapKey}" data-node-signature="${nodeLayoutSignature}">
                <div class="map-bg-layer map-bg-stars"></div>
                <div class="map-bg-layer map-bg-mist"></div>
                
                <div class="map-v3-header">
                    <button class="back-btn" onclick="game.showScreen('realm-select-screen')">← 返回关卡</button>
                    <div class="map-header-right">
                        <div class="player-status-bar">
                            <div class="status-item hp">
                                <span class="icon">❤️</span>
                                <span id="map-hp">${this.game.player.currentHp}/${this.game.player.maxHp}</span>
                            </div>
                            <div class="status-item gold">
                                <span class="icon">💰</span>
                                <span id="map-gold">${this.game.player.gold}</span>
                            </div>
                            <div class="status-item floor">
                                <span class="icon">🏔️</span>
                                <span id="map-floor">${this.getRealmName(this.game.player.realm)}</span>
                            </div>
                        </div>
                        <div id="map-situation-overview" class="map-situation-overview" style="display:none;"></div>
                        <div id="map-chapter-risk-card" class="map-chapter-risk-card" style="display:none;"></div>
                        <div id="map-chapter-brief" class="map-chapter-brief" style="display:none;"></div>
                        <div id="map-adventure-buffs" class="map-adventure-buffs" style="display:none;"></div>
                        <div id="map-route-hints" class="map-route-hints" style="display:none;"></div>
                        <div id="map-endless-panel" class="map-endless-panel" style="display:none;"></div>
                        <div id="map-legacy-mission" class="map-legacy-mission" style="display:none;">
                            <div class="mission-title">传承试炼</div>
                            <div class="mission-desc">暂无进行中的试炼</div>
                            <div class="mission-track">
                                <div class="mission-fill"></div>
                            </div>
                            <div class="mission-progress">0/0</div>
                        </div>
                        <div id="map-run-path-mission" class="map-legacy-mission" style="display:none;">
                            <div class="mission-title">命途主线</div>
                            <div class="mission-desc">暂无进行中的命途</div>
                            <div class="mission-track">
                                <div class="mission-fill"></div>
                            </div>
                            <div class="mission-progress">0/0</div>
                        </div>
                        <div id="map-run-path-flash" class="map-run-path-flash" style="display:none;"></div>
                    </div>
                </div>

                <div class="map-scroll-container" id="map-scroll-container">
                    <div class="map-content-wrapper" id="map-content-wrapper">
                        <!-- SVG Layer -->
                        <svg class="map-connections-svg" id="map-svg-layer"></svg>
                    </div>
                </div>

                <div class="map-footer">
                    <button class="menu-btn small" onclick="game.showDeck()">查看牌组</button>
                    <button class="menu-btn small" onclick="game.showTreasureBag()">法宝囊</button>
                    <button class="menu-btn small" onclick="game.showFateRing()">命环</button>
                </div>
            </div>
        `;

        this.renderV3Nodes();
        this.updateStatusBar();
        this.updateLegacyMissionTracker();

        // Initial Auto-scroll (Only on full rebuild)
        setTimeout(() => {
            // Find the highest row index that has potential activity
            let targetRowIndex = 0;

            // Search from top down
            for (let r = this.nodes.length - 1; r >= 0; r--) {
                const row = this.nodes[r];
                const hasActive = row.some(n => n.accessible && !n.completed);
                if (hasActive) {
                    targetRowIndex = r;
                    break;
                }
                const hasCompleted = row.some(n => n.completed);
                if (hasCompleted && targetRowIndex === 0) {
                    targetRowIndex = r;
                }
            }

            // Target element in that row
            const targetRowEl = document.querySelector(`.node-row-v3[data-row-index="${targetRowIndex}"]`);
            if (targetRowEl) {
                targetRowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                const scrollContainer = document.getElementById('map-scroll-container');
                if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        }, 150);
    }

    // 更新地图状态 (In-Place Update)
    updateMapState() {
        this.updateStatusBar();
        this.updateLegacyMissionTracker();
        this.updateEndlessPanel();
        this.updateRouteHintPanel();
        const chapter = this.game && typeof this.game.getChapterDisplaySnapshot === 'function'
            ? this.game.getChapterDisplaySnapshot(this.game.player?.realm || 1)
            : null;

        // Update Node Classes
        this.nodes.forEach(row => {
            row.forEach(node => {
                const el = document.querySelector(`.map-node-v3[data-node-id="${node.id}"]`);
                if (el) {
                    const riskProfile = this.resolveNodeRiskProfile(node, chapter);
                    node.riskProfile = riskProfile;
                    el.dataset.riskTier = riskProfile?.tierId || 'none';
                    const tooltipEl = el.querySelector('.node-tooltip');
                    if (tooltipEl) tooltipEl.innerHTML = this.buildNodeTooltipHtml(node, chapter);
                    const existingBadge = el.querySelector('.node-risk-badge');
                    const shouldShowBadge = !!(riskProfile && ['high', 'extreme'].includes(riskProfile.tierId) && node.accessible && !node.completed);
                    if (existingBadge) existingBadge.remove();
                    if (shouldShowBadge) {
                        const badge = document.createElement('div');
                        badge.className = `node-risk-badge tier-${riskProfile.tierId}`;
                        badge.textContent = `DRI ${riskProfile.index}`;
                        el.appendChild(badge);
                    }
                    // Reset State Classes
                    el.classList.remove('completed', 'locked', 'current', 'accessible');

                    // Apply New State
                    if (node.completed) el.classList.add('completed');
                    else if (!node.accessible) el.classList.add('locked');
                    else {
                        el.classList.add('current');
                        // Ensure listener is still valid (it should be, we didn't replace element)
                        // But if we wanted to be safe we could re-add, but that risks duplication.
                        // Assuming click listener persists on DOM element.
                    }
                }
            });
        });

        // Re-draw connections to reflect state changes
        this.drawConnections();
    }

    renderV3Nodes() {
        const wrapper = document.getElementById('map-content-wrapper');
        const svgLayer = document.getElementById('map-svg-layer');
        if (!wrapper || !svgLayer) return;
        const chapter = this.game && typeof this.game.getChapterDisplaySnapshot === 'function'
            ? this.game.getChapterDisplaySnapshot(this.game.player?.realm || 1)
            : null;

        // V3 Flexbox Layout System (Centered & Robust)
        this.nodes.forEach((rowNodes, rowIndex) => {
            const rowEl = document.createElement('div');
            rowEl.className = 'node-row-v3';
            rowEl.dataset.rowIndex = rowIndex;
            // Flex layout handles positioning automatically via justify-content: center

            rowNodes.forEach((node, i) => {
                const nodeEl = document.createElement('div');
                const riskProfile = this.resolveNodeRiskProfile(node, chapter);
                node.riskProfile = riskProfile;
                nodeEl.className = `map-node-v3 ${node.type}`;
                nodeEl.dataset.nodeId = node.id;
                nodeEl.dataset.riskTier = riskProfile?.tierId || 'none';

                nodeEl.innerHTML = `
                    <div class="node-icon">${node.icon}</div>
                    ${node.polluted ? '<div class="pollution-mark">☠️</div>' : ''}
                    ${riskProfile && ['high', 'extreme'].includes(riskProfile.tierId) && node.accessible && !node.completed ? `<div class="node-risk-badge tier-${riskProfile.tierId}">DRI ${riskProfile.index}</div>` : ''}
                    <div class="node-tooltip">${this.buildNodeTooltipHtml(node, chapter)}</div>
                `;

                nodeEl.addEventListener('click', () => this.onNodeClick(node));

                if (node.completed) nodeEl.classList.add('completed');
                else if (!node.accessible) nodeEl.classList.add('locked');
                else {
                    nodeEl.classList.add('current');
                }

                // Just append, no manual positioning
                rowEl.appendChild(nodeEl);
            });

            wrapper.appendChild(rowEl);
        });

        // Draw Lines after DOM update and potential reflow
        // Use timeout to ensure geometry is final
        setTimeout(() => this.drawConnections(), 50);
        // Also redraw on resize
        if (!this._resizeObserver) {
            this._resizeObserver = new ResizeObserver(() => {
                // Throttle drawing
                if (this._resizeTimeout) clearTimeout(this._resizeTimeout);
                this._resizeTimeout = setTimeout(() => this.drawConnections(), 100);
            });
        }
        this._resizeObserver.disconnect();
        this._resizeObserver.observe(wrapper);
    }

    drawConnections() {
        const svg = document.getElementById('map-svg-layer');
        if (!svg) return;

        // Clear old
        svg.innerHTML = '';

        // Iterate Rows
        for (let r = 0; r < this.nodes.length - 1; r++) {
            const currentRow = this.nodes[r];
            const nextRow = this.nodes[r + 1];

            currentRow.forEach(sourceNode => {
                nextRow.forEach(targetNode => {
                    if (this.shouldConnect(sourceNode, targetNode)) {
                        this.createPath(svg, r, sourceNode, targetNode);
                    }
                });
            });
        }
    }

    shouldConnect(src, tgt) {
        // Special case: Boss connects to everything
        if (tgt.type === 'boss' || src.type === 'boss') return true;

        const srcRowNodes = this.nodes[src.row];
        const tgtRowNodes = this.nodes[tgt.row];

        // Single node rows connect to everything
        if (srcRowNodes.length === 1 || tgtRowNodes.length === 1) return true;

        const srcIndex = srcRowNodes.findIndex(n => n.id === src.id);
        const tgtIndex = tgtRowNodes.findIndex(n => n.id === tgt.id);

        const srcNorm = srcIndex / (srcRowNodes.length - 1 || 1);
        const tgtNorm = tgtIndex / (tgtRowNodes.length - 1 || 1);

        return Math.abs(srcNorm - tgtNorm) <= 0.6; // Allow diagonal connections
    }

    createPath(svg, rowIndex, src, tgt) {
        // Calculate Accurate Positions relative to Wrapper
        // We use DOM geometry instead of assumptions
        const wrapper = document.getElementById('map-content-wrapper');
        if (!wrapper) return;

        const srcEl = document.querySelector(`.map-node-v3[data-node-id="${src.id}"]`);
        const tgtEl = document.querySelector(`.map-node-v3[data-node-id="${tgt.id}"]`);

        if (!srcEl || !tgtEl) return;

        // Get Centers relative to viewport
        const srcRect = srcEl.getBoundingClientRect();
        const tgtRect = tgtEl.getBoundingClientRect();
        const wrapRect = wrapper.getBoundingClientRect();

        // Convert to Wrapper Coordinates
        // SVG is absolute 0,0 inside Wrapper.

        const srcX = srcRect.left - wrapRect.left + srcRect.width / 2;
        const srcY = srcRect.top - wrapRect.top + srcRect.height / 2;

        const tgtX = tgtRect.left - wrapRect.left + tgtRect.width / 2;
        const tgtY = tgtRect.top - wrapRect.top + tgtRect.height / 2;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const midY = (srcY + tgtY) / 2;

        // Standard Bezier
        const d = `M ${srcX} ${srcY} C ${srcX} ${midY}, ${tgtX} ${midY}, ${tgtX} ${tgtY}`;

        path.setAttribute('d', d);
        path.setAttribute('class', 'connection-path');

        if (src.completed && (tgt.completed || tgt.accessible)) {
            path.classList.add('completed');
        } else if (src.completed && tgt.accessible) {
            path.classList.add('active');
        }

        svg.appendChild(path);
    }

    getNodeTooltip(type) {
        const tips = {
            enemy: '普通敌人：只有战斗才能变强',
            elite: '精英敌人：高风险，高回报',
            boss: '天劫：突破境界的必经之路',
            ghost_duel: '心魔对决：挑战其他修士残影',
            event: '机缘：祸福相依',
            shop: '坊市：互通有无',
            rest: '洞府：休养生息',
            trial: '试炼碑：自选词缀难度，换高稀有奖励',
            forge: '炼器坊：锻牌、重铸法宝或器灵灌注',
            observatory: '观星台：预览下一重天并锁定路线',
            spirit_grotto: '灵契窟：更换、升阶或追索灵契回响',
            forbidden_altar: '禁术坛：以血换誓，赌高收益禁术',
            memory_rift: '记忆裂隙：回溯命格，撕取残章'
        };
        return tips[type] || '未知区域';
    }

    getNodeTypeLabel(type) {
        const labels = {
            enemy: '普通敌人',
            elite: '精英敌人',
            boss: '主宰天劫',
            ghost_duel: '心魔对决',
            event: '机缘事件',
            shop: '坊市商路',
            rest: '营地洞府',
            trial: '试炼碑',
            forge: '炼器坊',
            observatory: '观星台',
            spirit_grotto: '灵契窟',
            forbidden_altar: '禁术坛',
            memory_rift: '记忆裂隙'
        };
        return labels[type] || '未知区域';
    }

    // 获取天域名称
    getRealmName(realm) {
        const names = {
            1: '第一重·凡尘界',
            2: '第二重·练气天',
            3: '第三重·筑基天',
            4: '第四重·金丹天',
            5: '第五重·元婴天',
            6: '第六重·化神天',
            7: '第七重·合体天',
            8: '第八重·大乘天',
            9: '第九重·飞升天',
            10: '第十重·地仙界',
            11: '第十一重·天仙界',
            12: '第十二重·金仙界',
            13: '第十三重·大罗天',
            14: '第十四重·混元天',
            15: '第十五重·无上天',
            16: '第十六重·太乙天',
            17: '第十七重·菩提天',
            18: '第十八重·混沌天'
        };

        if (realm > 18) return '逆天改命·已通关';

        return names[realm] || `第${realm}重天`;
    }

    // 获取天域环境法则
    getRealmEnvironment(realm) {
        const envs = {
            1: { name: '灵气稀薄', desc: '护盾效果降低 20%', effect: 'shield_malus' },
            2: { name: '雷霆淬体', desc: '每回合受到3点雷属性伤害', effect: 'thunder_damage' },
            3: { name: '重力压制', desc: '抽牌数-1', effect: 'draw_malus' },
            4: { name: '丹火焚心', desc: '回合结束时若有手牌，受到等于手牌数x2的伤害', effect: 'burn_hand' },
            5: { name: '心魔滋生', desc: '敌人造成伤害+25%', effect: 'enemy_buff' },
            6: { name: '法则混乱', desc: '卡牌费用随机变化 (-1到+1)', effect: 'chaos_cost' },
            7: { name: '虚空吞噬', desc: '每回合失去 5% 最大生命值', effect: 'void_drain' },
            8: { name: '天道压制', desc: '所有卡牌效果降低 20%', effect: 'heaven_suppress' },
            9: { name: '生死轮回', desc: '受到致死伤害时有 50% 几率复活并回满血（限一次）', effect: 'rebirth' },
            10: { name: '大地束缚', desc: '灵力上限-1，且闪避率降低20%', effect: 'earth_bind' },
            11: { name: '天人五衰', desc: '所有负面状态持续时间+1回合', effect: 'decay' },
            12: { name: '金戈铁马', desc: '使用攻击牌时，需消耗当前生命值的5%', effect: 'blood_tax' },
            13: { name: '时光逆流', desc: '每3回合，敌人会额外行动一次', effect: 'time_warp' },
            14: { name: '混元无极', desc: '敌人对所有伤害拥有20%抗性，且有50%几率免疫眩晕', effect: 'chaos_immune' },
            15: { name: '大道独行', desc: '最大生命值降低 30%，但造成的伤害提升50%', effect: 'final_trial' },
            16: { name: '太乙神雷', desc: '敌人攻击自带20%吸血，且每回合获得攻击力+1', effect: 'vampire_scaling' },
            17: { name: '大罗法身', desc: '敌人免疫控制效果，且每回合回复 20% 最大生命', effect: 'immunity_regen' },
            18: { name: '混沌终焉', desc: '玩家所有属性减半，敌人全属性翻倍', effect: 'chaos_end' }
        };
        return envs[realm] || { name: '平稳', desc: '无特殊效果', effect: 'none' };
    }

    // 更新状态栏
    updateStatusBar() {
        const player = this.game.player;
        const hpEl = document.getElementById('map-hp');
        const goldEl = document.getElementById('map-gold');
        const floorEl = document.getElementById('map-floor');
        const displayRealmName = (this.game && typeof this.game.getDisplayRealmName === 'function')
            ? this.game.getDisplayRealmName(player.realm)
            : this.getRealmName(player.realm);
        if (hpEl) hpEl.textContent = `${player.currentHp}/${player.maxHp}`;
        if (goldEl) goldEl.textContent = player.gold;
        if (floorEl) floorEl.textContent = displayRealmName;
        const realmTitle = document.getElementById('realm-title');
        if (realmTitle) realmTitle.textContent = displayRealmName;

        // 更新环境法则显示
        const env = this.getRealmEnvironment(player.realm);
        const indicator = document.getElementById('realm-law-indicator');
        if (indicator) {
            indicator.querySelector('.law-text').textContent = `当前法则：${env.name} (${env.desc})`;
        }

        // 渲染法宝
        if (this.game.renderTreasures) {
            this.game.renderTreasures();
        }

        this.updateChapterBriefPanel();
        this.updateAdventureBuffPanel();
        this.updateRouteHintPanel();
        this.updateEndlessPanel();
    }

    escapeMapText(value = '') {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    formatTagLabel(label = '') {
        const text = String(label || '').trim();
        if (!text) return '';
        return text.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    formatPathLabel(pathId = '') {
        const labels = {
            convergence: '同调',
            resonance: '共振',
            destruction: '湮灭',
            agility: '迅捷',
            wisdom: '洞明',
            insight: '洞察',
            toughness: '坚韧'
        };
        if (labels[pathId]) return labels[pathId];
        return this.formatTagLabel(pathId);
    }

    getDangerTierMetaByIndex(index = 0) {
        const safeIndex = Math.max(0, Math.min(100, Math.floor(Number(index) || 0)));
        if (safeIndex >= 76) return { id: 'extreme', label: '极高' };
        if (safeIndex >= 61) return { id: 'high', label: '高压' };
        if (safeIndex >= 46) return { id: 'medium', label: '中压' };
        return { id: 'low', label: '可控' };
    }

    getNodeRiskBlueprint(type = '') {
        const catalog = {
            enemy: {
                baseIndex: 52,
                summary: '常规战会放大章节主轴压力。',
                counterplay: '优先确认首轮防守与输出顺序，别让节奏被白白换掉。',
                reserveHint: '入战前至少留 1 条护阵或过牌链。',
                category: 'combat'
            },
            elite: {
                baseIndex: 68,
                summary: '精英节点会把本章压力集中放大。',
                counterplay: '默认按小 Boss 对待，先规划减伤与收束窗口。',
                reserveHint: '生命与关键消耗都要按高压战标准准备。',
                category: 'combat'
            },
            boss: {
                baseIndex: 90,
                summary: '主宰战会同时检定章节机制与构筑成型度。',
                counterplay: '把净化、过牌、爆发窗口都预留好，再进终局检定。',
                reserveHint: '避免带着残血或空资源进场。',
                category: 'combat'
            },
            ghost_duel: {
                baseIndex: 64,
                summary: '残影战常带额外干扰与突发节奏改写。',
                counterplay: '把它视作偏控场的精英战，先稳住再换线。',
                reserveHint: '保留 1 轮能打断连携的手段。',
                category: 'combat'
            },
            event: {
                baseIndex: 38,
                summary: '事件节点更考验你对短期赚与长期亏的取舍。',
                counterplay: '先看当前血线与资源底线，再决定是否搏收益。',
                reserveHint: '避免在资源见底时再赌高波动选项。',
                category: 'utility'
            },
            shop: {
                baseIndex: 28,
                summary: '商路风险低，但会放大灵石分配失误。',
                counterplay: '优先买真正补短板的关键件，别把预算压空。',
                reserveHint: '保底留一笔战后机动资金。',
                category: 'utility'
            },
            rest: {
                baseIndex: 22,
                summary: '营地本身安全，但会影响后续节奏与路线价值。',
                counterplay: '把它当作修错窗口，而不是无脑补血按钮。',
                reserveHint: '若血线健康，可考虑为后段压力保留收益选择。',
                category: 'recovery'
            },
            trial: {
                baseIndex: 72,
                summary: '试炼碑会主动提高压强，换来更高质量回报。',
                counterplay: '只在当前构筑真能接住额外条件时再开试炼。',
                reserveHint: '入场前确认爆发、过牌与容错至少具备两项。',
                category: 'challenge'
            },
            forge: {
                baseIndex: 34,
                summary: '炼器坊主要吃经济与路线判断，风险来自投入顺序。',
                counterplay: '只做能立刻提升当前章胜率的强化。',
                reserveHint: '避免为了锻造把补给与商店预算榨干。',
                category: 'utility'
            },
            observatory: {
                baseIndex: 32,
                summary: '观星台风险不高，但会决定后续路线结构。',
                counterplay: '把它当成信息投资点，优先锁定能解释下一章的线索。',
                reserveHint: '若前路压力高，优先拿稳定路线情报。',
                category: 'utility'
            },
            spirit_grotto: {
                baseIndex: 36,
                summary: '灵契窟重在补战斗结构，风险来自机会成本。',
                counterplay: '优先补当前最缺的同行段位或触发轴。',
                reserveHint: '别在节奏未稳时把资源全砸向长线养成。',
                category: 'utility'
            },
            forbidden_altar: {
                baseIndex: 76,
                summary: '禁术坛会把血线与资源税负同时推高。',
                counterplay: '只有在能承受代价并吃满收益时再签誓。',
                reserveHint: '确认血线、减伤和回复链至少满足两项。',
                category: 'challenge'
            },
            memory_rift: {
                baseIndex: 58,
                summary: '记忆裂隙会改写命格与构筑，波动大于普通功能点。',
                counterplay: '先确认当前构筑缺口，再决定是否重写命格节奏。',
                reserveHint: '进入前预留至少一次后续补件机会。',
                category: 'challenge'
            }
        };
        return catalog[type] || {
            baseIndex: 40,
            summary: '前路信息尚不完整，建议按稳态路线推进。',
            counterplay: '先保留容错，再逐步摸清节点价值。',
            reserveHint: '为突发遭遇保留一轮机动资源。',
            category: 'utility'
        };
    }

    resolveNodeRiskDominantModifier(nodeType = '', dominantRisk = '') {
        const dominantModifiers = {
            burst: { enemy: 6, elite: 8, ghost_duel: 7, trial: 6, forbidden_altar: 4, boss: 10 },
            sustain: { enemy: 3, elite: 5, trial: 5, memory_rift: 4, shop: 2, rest: -3, boss: 6 },
            control: { elite: 6, ghost_duel: 8, trial: 6, observatory: 3, memory_rift: 4, boss: 7 },
            tax: { enemy: 2, trial: 7, forge: 5, shop: 4, forbidden_altar: 8, memory_rift: 4, boss: 5 },
            recovery: { enemy: 3, elite: 5, event: 2, rest: -4, shop: -2, boss: 6 }
        };
        return Math.max(
            -8,
            Math.min(
                12,
                Math.floor(Number(dominantModifiers[dominantRisk]?.[nodeType]) || 0)
            )
        );
    }

    resolveNodeRiskProfile(node, chapter = null) {
        if (!node || typeof node !== 'object') return null;

        const dangerProfile = chapter && chapter.dangerProfile ? chapter.dangerProfile : null;
        const nemesis = chapter && chapter.nemesis ? chapter.nemesis : null;
        const expeditionPayload = (this.game && typeof this.game.getExpeditionPayload === 'function')
            ? this.game.getExpeditionPayload()
            : null;
        const blueprint = this.getNodeRiskBlueprint(node.type);
        const rowCount = Math.max(1, (Array.isArray(this.nodes) ? this.nodes.length : 1) - 1);
        const rowProgress = Math.max(0, Math.min(1, Number(node.row) / rowCount));
        let index = Math.max(0, Math.min(100, Math.floor(Number(blueprint.baseIndex) || 0)));
        const modifiers = [];

        if (dangerProfile) {
            const dominantShift = this.resolveNodeRiskDominantModifier(node.type, dangerProfile.dominantRisk);
            if (dominantShift !== 0) {
                index += dominantShift;
                if (dominantShift > 0 && dangerProfile.dominantLabel) {
                    modifiers.push(`${dangerProfile.dominantLabel}会在此被进一步放大`);
                }
            }
            if (dangerProfile.tierId === 'high') index += 4;
            if (dangerProfile.tierId === 'extreme') index += 8;
            if (dangerProfile.tierId === 'medium') index += 2;
        }

        if (rowProgress >= 0.66 && ['combat', 'challenge'].includes(blueprint.category)) {
            index += 6;
            modifiers.push('章末节点容错更低');
        } else if (rowProgress >= 0.34 && blueprint.category === 'challenge') {
            index += 3;
            modifiers.push('中盘开始就会检定当前成型度');
        }

        if (node.polluted) {
            index += 12;
            modifiers.push('煞气激荡会压缩恢复与费用容错');
        }

        const hostileCount = Array.isArray(expeditionPayload?.factions)
            ? expeditionPayload.factions.filter((entry) => Number(entry?.stance) <= -2).length
            : 0;
        const alliedCount = Array.isArray(expeditionPayload?.factions)
            ? expeditionPayload.factions.filter((entry) => Number(entry?.stance) >= 2).length
            : 0;
        if (hostileCount >= 2 && ['combat', 'challenge'].includes(blueprint.category)) {
            index += 4;
            modifiers.push('当前势力敌意会抬高前线波动');
        }
        if (alliedCount >= 2 && ['utility', 'recovery'].includes(blueprint.category)) {
            index -= 3;
            modifiers.push('友方关系让功能节点更稳');
        }

        if (
            nemesis
            && ['hunting', 'recurring', 'guarding', 'allied'].includes(String(nemesis.status || ''))
            && Array.isArray(nemesis.triggerNodeTypes)
            && nemesis.triggerNodeTypes.includes(node.type)
        ) {
            index += 12;
            modifiers.push(`${nemesis.name} 可能在此现身`);
        }

        const activeBounties = Array.isArray(expeditionPayload?.activeBounties)
            ? expeditionPayload.activeBounties
            : [];
        const bountyHook = activeBounties.find((entry) => String(entry?.progressText || '').length > 0) || null;

        index = Math.max(0, Math.min(100, Math.round(index)));
        const tier = this.getDangerTierMetaByIndex(index);
        const summaryParts = [blueprint.summary];
        if (modifiers.length > 0) summaryParts.push(modifiers[0]);
        const counterplayParts = [blueprint.counterplay];
        if (dangerProfile?.counterplay && dangerProfile.counterplay !== blueprint.counterplay && tier.id !== 'low') {
            counterplayParts.push(dangerProfile.counterplay);
        }
        if (nemesis?.counterplay && modifiers.some((line) => /现身/.test(line))) {
            counterplayParts.push(nemesis.counterplay);
        }

        const reserveParts = [
            this.getChapterRiskResourceGuidance(dangerProfile, nemesis).replace(/[。！!]+$/g, ''),
            blueprint.reserveHint
        ];
        if (bountyHook && ['utility', 'challenge'].includes(blueprint.category)) {
            reserveParts.push(`若要兼顾悬赏，优先保证 ${bountyHook.name} 的推进节奏`);
        }

        return {
            nodeId: node.id,
            type: String(node.type || ''),
            label: this.getNodeTypeLabel(node.type),
            icon: String(node.icon || this.getNodeIcon(node.type) || '❓'),
            index,
            tierId: tier.id,
            tierLabel: tier.label,
            summary: this.joinDistinctMapLines(summaryParts),
            counterplay: this.joinDistinctMapLines(counterplayParts),
            reserveGuidance: this.joinDistinctMapLines(reserveParts, '。'),
            modifierLines: modifiers.slice(0, 3),
            polluted: !!node.polluted
        };
    }

    getAccessibleNodeRiskForecast(chapter = null) {
        const accessibleNodes = typeof this.getAccessibleNodes === 'function'
            ? this.getAccessibleNodes()
            : [];
        const nodeRisks = accessibleNodes
            .map((node) => this.resolveNodeRiskProfile(node, chapter))
            .filter(Boolean)
            .sort((a, b) => {
                if (b.index !== a.index) return b.index - a.index;
                return String(a.type || '').localeCompare(String(b.type || ''));
            });
        const topRisk = nodeRisks[0] || null;
        return {
            topRisk,
            nodeRisks,
            summary: topRisk
                ? `${topRisk.label} · DRI ${topRisk.index} · ${topRisk.summary}`
                : '当前暂无可选节点'
        };
    }

    buildNodeTooltipHtml(node, chapter = null) {
        const risk = this.resolveNodeRiskProfile(node, chapter);
        const engineeringLine = this.resolveNodeEngineeringHint(node);
        const pollutionLine = node && node.polluted
            ? '<div class="node-tooltip-risk danger">煞气激荡：此处灵脉受损，不可恢复生命，且能量消耗增加。</div>'
            : '';
        if (!risk) {
            return `
                <div class="node-tooltip-title">${this.escapeMapText(this.getNodeTypeLabel(node?.type || ''))}</div>
                <div class="node-tooltip-copy">${this.escapeMapText(this.getNodeTooltip(node?.type || ''))}</div>
                ${engineeringLine ? `<div class="node-tooltip-risk engineering">${this.escapeMapText(engineeringLine)}</div>` : ''}
                ${pollutionLine}
            `;
        }
        return `
            <div class="node-tooltip-title">${this.escapeMapText(`${risk.icon} ${risk.label} · DRI ${risk.index} · ${risk.tierLabel}`)}</div>
            <div class="node-tooltip-copy">${this.escapeMapText(this.getNodeTooltip(node?.type || ''))}</div>
            <div class="node-tooltip-risk">${this.escapeMapText(`前路主险：${risk.summary}`)}</div>
            <div class="node-tooltip-risk">${this.escapeMapText(`对策：${risk.counterplay}`)}</div>
            <div class="node-tooltip-risk">${this.escapeMapText(`预留：${risk.reserveGuidance}`)}</div>
            ${engineeringLine ? `<div class="node-tooltip-risk engineering">${this.escapeMapText(engineeringLine)}</div>` : ''}
            ${pollutionLine}
        `;
    }

    collectSpecialWarnings(limit = 3) {
        const accessibleNodes = typeof this.getAccessibleNodes === 'function'
            ? this.getAccessibleNodes()
            : [];
        const specialLabelMap = {
            observatory: '观星台',
            forge: '炼器坊',
            forbidden_altar: '禁术坛',
            spirit_grotto: '灵契窟',
            memory_rift: '记忆裂隙',
            trial: '试炼碑',
            shop: '商路',
            rest: '营地'
        };
        return Array.from(new Set(
            accessibleNodes
                .map((node) => specialLabelMap[node?.type] || null)
                .filter(Boolean)
        )).slice(0, Math.max(1, Math.floor(Number(limit) || 1)));
    }

    resolveFactionTendency(expeditionPayload = null) {
        const factions = Array.isArray(expeditionPayload?.factions)
            ? expeditionPayload.factions
            : [];
        if (factions.length === 0) {
            return '暂无势力情报';
        }

        const allied = factions.filter((entry) => Number(entry?.stance) >= 2).length;
        const hostile = factions.filter((entry) => Number(entry?.stance) <= -2).length;
        const dominant = [...factions]
            .sort((a, b) => Math.abs(Number(b?.stance) || 0) - Math.abs(Number(a?.stance) || 0))[0];
        const dominantLabel = dominant && dominant.name
            ? `${dominant.name}${Number(dominant.stance) > 0 ? '↑' : Number(dominant.stance) < 0 ? '↓' : '·'}`
            : '';
        return `盟友 ${allied} · 对立 ${hostile}${dominantLabel ? ` · 主轴 ${dominantLabel}` : ''}`;
    }

    resolveRecentFactionSignal(expeditionPayload = null) {
        const logs = Array.isArray(expeditionPayload?.recentFactionLogs)
            ? expeditionPayload.recentFactionLogs
            : [];
        if (logs.length === 0) {
            return '暂无新波动，当前势力还在试探你的路线。';
        }
        const lead = logs[0];
        if (!lead) return '暂无新波动，当前势力还在试探你的路线。';
        const name = String(lead.factionName || '未知势力');
        const direction = Number(lead.delta) > 0
            ? `↑${Math.abs(Number(lead.delta) || 0)}`
            : Number(lead.delta) < 0
                ? `↓${Math.abs(Number(lead.delta) || 0)}`
                : String(lead.stanceLabel || '变动');
        return `${name} ${direction} · ${String(lead.reason || lead.line || '局势刚刚发生了一次新的偏转。')}`;
    }

    resolveBountyProgress(expeditionPayload = null) {
        const activeBounties = Array.isArray(expeditionPayload?.activeBounties)
            ? expeditionPayload.activeBounties
            : [];
        if (activeBounties.length > 0) {
            const completedCount = activeBounties.filter((entry) => !!entry?.completed).length;
            const focusBounty = activeBounties.find((entry) => !entry?.completed) || activeBounties[0];
            const progressSuffix = focusBounty && focusBounty.progressText
                ? ` · ${focusBounty.name} ${focusBounty.progressText}`
                : '';
            return `${completedCount}/${activeBounties.length} 已完成${progressSuffix}`;
        }

        const bountyDraft = Array.isArray(expeditionPayload?.bountyDraft)
            ? expeditionPayload.bountyDraft
            : [];
        if (bountyDraft.length > 0) {
            const activeCount = bountyDraft.filter((entry) => !!entry?.active).length;
            const maxActive = Math.min(2, bountyDraft.length);
            return `${activeCount}/${maxActive} 已承接`;
        }

        return '暂无章节悬赏';
    }

    resolveBountyConflictSignal(expeditionPayload = null) {
        const warnings = Array.isArray(expeditionPayload?.bountyConflictWarnings)
            ? expeditionPayload.bountyConflictWarnings
            : [];
        if (warnings.length === 0) {
            const activeBounties = Array.isArray(expeditionPayload?.activeBounties)
                ? expeditionPayload.activeBounties
                : [];
            if (activeBounties.length > 0) {
                return '当前承接的赏单与路线暂未出现明显冲突。';
            }
            return '尚未承接悬赏，暂无冲突压力。';
        }
        const lead = warnings[0];
        if (!lead) return '当前承接的赏单与路线暂未出现明显冲突。';
        return `${String(lead.bountyName || '当前悬赏')} · ${String(lead.label || '冲突提示')}${lead.detail ? ` · ${String(lead.detail)}` : ''}`;
    }

    resolveNemesisForecastSignal(expeditionPayload = null) {
        const forecast = expeditionPayload?.nemesisForecast && typeof expeditionPayload.nemesisForecast === 'object'
            ? expeditionPayload.nemesisForecast
            : null;
        if (!forecast) {
            return '当前仇敌追猎线尚未形成明确压制窗口。';
        }
        if (forecast.line) {
            return `${forecast.pressureLabel ? `${String(forecast.pressureLabel)} · ` : ''}${String(forecast.line)}`;
        }
        const parts = [
            forecast.pressureLabel || '',
            forecast.windowLabel || ''
        ].filter(Boolean);
        return parts.join(' · ') || '当前仇敌追猎线尚未形成明确压制窗口。';
    }

    normalizeMapCopy(text = '') {
        return String(text || '')
            .replace(/\s+/g, ' ')
            .replace(/。{2,}/g, '。')
            .replace(/；{2,}/g, '；')
            .replace(/。；/g, '；')
            .replace(/；。/g, '；')
            .trim();
    }

    joinDistinctMapLines(lines = [], terminal = '') {
        const seen = new Set();
        const ordered = [];
        (Array.isArray(lines) ? lines : []).forEach((entry) => {
            const fragments = this.normalizeMapCopy(entry).split('；');
            fragments.forEach((fragment) => {
                const normalized = String(fragment || '').replace(/[；。]+$/g, '').trim();
                if (!normalized || seen.has(normalized)) return;
                seen.add(normalized);
                ordered.push(normalized);
            });
        });
        let result = ordered.join('；');
        if (result && terminal && !result.endsWith(terminal)) {
            result += terminal;
        }
        return result;
    }

    getStrategicEngineeringSnapshot() {
        return this.game && typeof this.game.getStrategicEngineeringSnapshot === 'function'
            ? this.game.getStrategicEngineeringSnapshot()
            : null;
    }

    resolveStrategicEngineeringFocusSignal() {
        const snapshot = this.getStrategicEngineeringSnapshot();
        const focus = snapshot && snapshot.focusTrack ? snapshot.focusTrack : null;
        if (!focus) {
            return '尚未形成跨章工程，优先在观星、禁术、裂隙或灵契节点里选出一条主轴。';
        }
        return `${focus.icon || '✦'} ${focus.name} ${focus.tierLabel} · ${focus.effectSummary}${focus.nextTarget != null ? ` · 距${focus.nextTierLabel}还需 ${focus.remaining} 次${focus.nodeLabel}` : ' · 已达当前最高工事阶'}`;
    }

    resolveStrategicEngineeringRiskSignal() {
        const snapshot = this.getStrategicEngineeringSnapshot();
        const focus = snapshot && snapshot.focusTrack ? snapshot.focusTrack : null;
        if (!focus) {
            return '当前还没有明确的跨章工程主轴。';
        }
        const sideTrack = Array.isArray(snapshot.activeTracks)
            ? snapshot.activeTracks.find((entry) => entry && entry.trackId !== focus.trackId)
            : null;
        return `主轴 ${focus.name} ${focus.tierLabel} · ${focus.effectSummary}${sideTrack ? ` · 副轴 ${sideTrack.name} ${sideTrack.tierLabel}` : ''}`;
    }

    resolveNodeEngineeringHint(node = null) {
        const nodeType = String(node?.type || '');
        if (!nodeType) return '';
        const snapshot = this.getStrategicEngineeringSnapshot();
        const track = snapshot && Array.isArray(snapshot.allTracks)
            ? snapshot.allTracks.find((entry) => entry && entry.trackId === nodeType)
            : null;
        if (!track) return '';
        if (track.nextTarget != null) {
            return `工程收益：推进${track.name}${track.active ? ` ${track.tierLabel}` : ''} · ${track.effectSummary} · 距${track.nextTierLabel}还需 ${track.remaining} 次${track.nodeLabel}`;
        }
        return `工程收益：推进${track.name}${track.active ? ` ${track.tierLabel}` : ''} · ${track.effectSummary} · 当前已达最高工事阶`;
    }

    getMapSituationOverviewModel(chapter = null) {
        const player = this.game && this.game.player ? this.game.player : null;
        const expeditionPayload = (this.game && typeof this.game.getExpeditionPayload === 'function')
            ? this.game.getExpeditionPayload()
            : null;
        const dangerProfile = chapter && chapter.dangerProfile ? chapter.dangerProfile : null;
        const frontierRisk = this.getAccessibleNodeRiskForecast(chapter).topRisk;

        const tags = [];
        (Array.isArray(chapter?.focusTags) ? chapter.focusTags : [])
            .slice(0, 2)
            .forEach((tag) => {
                const safeTag = this.formatTagLabel(tag);
                if (safeTag) tags.push(safeTag);
            });

        const fatePath = this.getFateRingPath(player);
        if (fatePath) {
            tags.push(`命途·${this.formatPathLabel(fatePath)}`);
        }
        const archetype = this.getPreferredArchetypeId(player);
        if (archetype) {
            tags.push(`构筑·${this.formatTagLabel(archetype)}`);
        }
        if (expeditionPayload?.selectedBranchName) {
            tags.push(`路线·${this.formatTagLabel(expeditionPayload.selectedBranchName)}`);
        }

        const coreTags = Array.from(new Set(tags.filter(Boolean))).slice(0, 4);
        if (coreTags.length === 0) coreTags.push('稳态推进');

        return {
            chapterName: chapter?.fullName || chapter?.name || '当前章节',
            coreTags,
            riskLevel: dangerProfile
                ? `DRI ${dangerProfile.index} / 100 · ${dangerProfile.tierLabel || '未定'}`
                : 'DRI 待推演 · 风险结构未定',
            riskTier: dangerProfile?.tierId || 'none',
            frontierRisk: frontierRisk
                ? `${frontierRisk.label} · DRI ${frontierRisk.index} · ${frontierRisk.tierLabel}${frontierRisk.modifierLines.length > 0 ? ` · ${frontierRisk.modifierLines[0]}` : ''}`
                : '暂无前路情报',
            engineeringFocus: this.resolveStrategicEngineeringFocusSignal(),
            bountyProgress: this.resolveBountyProgress(expeditionPayload),
            factionTendency: this.resolveFactionTendency(expeditionPayload),
            recentFactionSignal: this.resolveRecentFactionSignal(expeditionPayload),
            nemesisForecast: this.resolveNemesisForecastSignal(expeditionPayload)
        };
    }

    getChapterRiskResourceGuidance(dangerProfile = null, nemesis = null) {
        const reserveProfile = {
            low: { hpRate: 0.48, gold: 65 },
            medium: { hpRate: 0.58, gold: 95 },
            high: { hpRate: 0.66, gold: 125 },
            extreme: { hpRate: 0.74, gold: 160 },
            none: { hpRate: 0.54, gold: 80 }
        };
        const tierId = dangerProfile && reserveProfile[dangerProfile.tierId]
            ? dangerProfile.tierId
            : 'none';
        const profile = reserveProfile[tierId];
        const maxHp = Math.max(1, Math.floor(Number(this.game?.player?.maxHp) || 100));
        const hpTarget = Math.max(1, Math.ceil(maxHp * profile.hpRate));
        const notes = [
            `生命建议 ≥ ${hpTarget}`,
            `灵石预留 ≥ ${profile.gold}`
        ];
        if (nemesis && ['hunting', 'recurring', 'guarding', 'allied'].includes(nemesis.status)) {
            notes.push('保留 1 轮爆发或控制链');
        }
        const expeditionPayload = (this.game && typeof this.game.getExpeditionPayload === 'function')
            ? this.game.getExpeditionPayload()
            : null;
        const activeBountyCount = Array.isArray(expeditionPayload?.activeBounties)
            ? expeditionPayload.activeBounties.length
            : 0;
        if (activeBountyCount > 0) {
            notes.push(`在途悬赏 ${activeBountyCount} 条，预留 1 次补给机动`);
        }
        return this.joinDistinctMapLines(notes, '。');
    }

    updateMapSituationOverviewPanel(chapter = null) {
        const panel = document.getElementById('map-situation-overview');
        if (!panel) return;
        if (!chapter) {
            panel.style.display = 'none';
            panel.innerHTML = '';
            panel.dataset.riskTier = 'none';
            return;
        }

        const model = this.getMapSituationOverviewModel(chapter);
        panel.style.display = 'block';
        panel.dataset.riskTier = model.riskTier || 'none';
        panel.innerHTML = `
            <div class="map-overview-head">
                <span class="map-overview-kicker">局势总览</span>
                <span class="map-overview-chapter">${this.escapeMapText(model.chapterName)}</span>
            </div>
            <div class="map-overview-grid">
                <div class="map-overview-item">
                    <span class="map-overview-label">核心标签</span>
                    <span class="map-overview-value">${this.escapeMapText(model.coreTags.join(' / '))}</span>
                </div>
                <div class="map-overview-item">
                    <span class="map-overview-label">风险等级</span>
                    <span class="map-overview-value">${this.escapeMapText(model.riskLevel)}</span>
                </div>
                <div class="map-overview-item">
                    <span class="map-overview-label">前路主险</span>
                    <span class="map-overview-value">${this.escapeMapText(model.frontierRisk)}</span>
                </div>
                <div class="map-overview-item">
                    <span class="map-overview-label">工程推进</span>
                    <span class="map-overview-value">${this.escapeMapText(model.engineeringFocus)}</span>
                </div>
                <div class="map-overview-item">
                    <span class="map-overview-label">悬赏进度</span>
                    <span class="map-overview-value">${this.escapeMapText(model.bountyProgress)}</span>
                </div>
                <div class="map-overview-item">
                    <span class="map-overview-label">势力倾向</span>
                    <span class="map-overview-value">${this.escapeMapText(model.factionTendency)}</span>
                </div>
                <div class="map-overview-item">
                    <span class="map-overview-label">最近势力变化</span>
                    <span class="map-overview-value">${this.escapeMapText(model.recentFactionSignal)}</span>
                </div>
                <div class="map-overview-item">
                    <span class="map-overview-label">追猎预判</span>
                    <span class="map-overview-value">${this.escapeMapText(model.nemesisForecast)}</span>
                </div>
            </div>
        `;
    }

    updateChapterRiskCardPanel(chapter = null, specialWarnings = []) {
        const panel = document.getElementById('map-chapter-risk-card');
        if (!panel) return;
        if (!chapter) {
            panel.style.display = 'none';
            panel.innerHTML = '';
            panel.dataset.riskTier = 'none';
            return;
        }

        const dangerProfile = chapter && chapter.dangerProfile ? chapter.dangerProfile : null;
        const nemesis = chapter && chapter.nemesis ? chapter.nemesis : null;
        const frontierRisk = this.getAccessibleNodeRiskForecast(chapter).topRisk;
        const warningLine = Array.isArray(specialWarnings) && specialWarnings.length > 0
            ? `前路异象：${specialWarnings.join(' / ')}`
            : '前路异象：当前以常规战斗节点为主';
        const highRiskMechanic = dangerProfile
            ? this.normalizeMapCopy(`${dangerProfile.tierLabel || '风险未定'} · ${dangerProfile.summary || '高压机制正在形成'}`)
            : '风险结构待推演，先用稳态路线收集战场情报。';
        const frontierLine = frontierRisk
            ? this.normalizeMapCopy(`${frontierRisk.label} · DRI ${frontierRisk.index} · ${frontierRisk.summary}`)
            : '当前暂无可选节点，等待地图推进后再评估前线风险。';
        const expeditionPayload = (this.game && typeof this.game.getExpeditionPayload === 'function')
            ? this.game.getExpeditionPayload()
            : null;
        const bountyConflictLine = this.resolveBountyConflictSignal(expeditionPayload);
        const nemesisForecastLine = this.normalizeMapCopy(this.resolveNemesisForecastSignal(expeditionPayload));
        const engineeringLine = this.normalizeMapCopy(this.resolveStrategicEngineeringRiskSignal());
        const defenseStrategy = this.joinDistinctMapLines([
            dangerProfile?.counterplay || '',
            frontierRisk?.counterplay || '',
            nemesis?.counterplay || '',
            expeditionPayload?.nemesisForecast?.counterplay || ''
        ], '。') || '优先保留防御链与过牌，先稳住前两轮，再决定爆发窗口。';
        const reserveGuidance = this.normalizeMapCopy(frontierRisk?.reserveGuidance || this.getChapterRiskResourceGuidance(dangerProfile, nemesis));

        panel.style.display = 'block';
        panel.dataset.riskTier = dangerProfile?.tierId || 'none';
        panel.innerHTML = `
            <div class="map-risk-kicker">章节风险卡</div>
            <div class="map-risk-title">${this.escapeMapText((chapter.icon || '⚠️') + ' ' + (chapter.fullName || chapter.name || '当前章节'))}</div>
            <div class="map-risk-line">
                <span class="map-risk-label">高危机制</span>
                <span class="map-risk-value">${this.escapeMapText(highRiskMechanic)} · ${this.escapeMapText(warningLine)}</span>
            </div>
            <div class="map-risk-line">
                <span class="map-risk-label">节点预警</span>
                <span class="map-risk-value">${this.escapeMapText(frontierLine)}</span>
            </div>
            <div class="map-risk-line">
                <span class="map-risk-label">悬赏冲突</span>
                <span class="map-risk-value">${this.escapeMapText(bountyConflictLine)}</span>
            </div>
            <div class="map-risk-line">
                <span class="map-risk-label">追猎预判</span>
                <span class="map-risk-value">${this.escapeMapText(nemesisForecastLine)}</span>
            </div>
            <div class="map-risk-line">
                <span class="map-risk-label">工程态势</span>
                <span class="map-risk-value">${this.escapeMapText(engineeringLine)}</span>
            </div>
            <div class="map-risk-line">
                <span class="map-risk-label">防御策略</span>
                <span class="map-risk-value">${this.escapeMapText(defenseStrategy)}</span>
            </div>
            <div class="map-risk-line">
                <span class="map-risk-label">资源预留</span>
                <span class="map-risk-value">${this.escapeMapText(reserveGuidance)}</span>
            </div>
        `;
    }

    updateChapterBriefPanel() {
        const panel = document.getElementById('map-chapter-brief');
        if (!this.game || !this.game.player || typeof this.game.getChapterDisplaySnapshot !== 'function') {
            return;
        }

        const chapter = this.game.getChapterDisplaySnapshot(this.game.player.realm);
        if (!chapter) {
            if (panel) {
                panel.style.display = 'none';
                panel.innerHTML = '';
            }
            this.updateMapSituationOverviewPanel(null);
            this.updateChapterRiskCardPanel(null);
            return;
        }

        const specialWarnings = this.collectSpecialWarnings(3);
        const frontierRisk = this.getAccessibleNodeRiskForecast(chapter).topRisk;
        const expeditionPayload = (this.game && typeof this.game.getExpeditionPayload === 'function')
            ? this.game.getExpeditionPayload()
            : null;
        const seasonBoardFrontier = expeditionPayload?.seasonBoard?.frontier && typeof expeditionPayload.seasonBoard.frontier === 'object'
            ? expeditionPayload.seasonBoard.frontier
            : null;
        const seasonBoardFrontierDecree = seasonBoardFrontier?.decree && typeof seasonBoardFrontier.decree === 'object'
            ? seasonBoardFrontier.decree
            : null;
        const seasonBoardFrontierChronicle = seasonBoardFrontier?.chronicle && typeof seasonBoardFrontier.chronicle === 'object'
            ? seasonBoardFrontier.chronicle
            : null;
        const seasonBoardFrontierCouncil = seasonBoardFrontier?.council && typeof seasonBoardFrontier.council === 'object'
            ? seasonBoardFrontier.council
            : null;
        const seasonBoardFrontierLine = seasonBoardFrontier
            ? [
                seasonBoardFrontier.summaryLine
                    || `诸界战线：${seasonBoardFrontier.primaryFrontLabel || seasonBoardFrontier.primaryFrontShortLabel || '主战线'} · ${seasonBoardFrontier.pressureLabel || seasonBoardFrontier.statusLabel || '稳态'}`,
                seasonBoardFrontier.actionTargetLabel
                    ? `下一跳 ${seasonBoardFrontier.actionTargetLabel}`
                    : ''
            ].filter(Boolean).join(' · ')
            : '';
        const seasonBoardFrontierDecreeLine = seasonBoardFrontierDecree
            ? [
                seasonBoardFrontierDecree.summaryLine || seasonBoardFrontierDecree.title || '本周法旨',
                seasonBoardFrontierDecree.constraintLine || '',
                seasonBoardFrontierDecree.actionTargetLabel ? `下一跳 ${seasonBoardFrontierDecree.actionTargetLabel}` : ''
            ].filter(Boolean).join(' · ')
            : '';
        const seasonBoardFrontierChronicleLine = seasonBoardFrontierChronicle
            ? [
                seasonBoardFrontierChronicle.summaryLine || seasonBoardFrontierChronicle.title || '战役史卷',
                seasonBoardFrontierChronicle.progressLine || '',
                seasonBoardFrontierChronicle.actionTargetLabel ? `下一跳 ${seasonBoardFrontierChronicle.actionTargetLabel}` : ''
            ].filter(Boolean).join(' · ')
            : '';
        const seasonBoardFrontierCouncilLine = seasonBoardFrontierCouncil
            ? [
                seasonBoardFrontierCouncil.summaryLine || seasonBoardFrontierCouncil.title || '诸界会审',
                seasonBoardFrontierCouncil.verdictLine || '',
                seasonBoardFrontierCouncil.supportLine || ''
            ].filter(Boolean).join(' · ')
            : '';

        const bossInfo = this.game && typeof this.game.getRealmBossInfo === 'function'
            ? this.game.getRealmBossInfo(this.game.player.realm)
            : null;
        const bossLine = bossInfo && bossInfo.bossName
            ? `${bossInfo.bossName}${chapter.bossPrompt ? ` · ${chapter.bossPrompt}` : ''}`
            : (chapter.bossPrompt || '本章主宰尚未显形。');
        const dangerProfile = chapter && chapter.dangerProfile ? chapter.dangerProfile : null;
        const dangerLine = dangerProfile
            ? `DRI ${dangerProfile.index} · ${dangerProfile.tierLabel} · ${dangerProfile.summary || '风险结构已锁定'}`
            : 'DRI 待推演 · 风险结构尚未生成';
        const dangerCounterplay = dangerProfile && dangerProfile.counterplay
            ? dangerProfile.counterplay
            : '先以稳态路线探路，再根据战场反馈调整资源分配。';
        const nemesis = chapter && chapter.nemesis ? chapter.nemesis : null;
        const nemesisLine = nemesis
            ? `${nemesis.icon || '🎯'} ${nemesis.name} · ${nemesis.statusLabel || '追猎中'}${nemesis.currentVariantLabel ? ` · ${nemesis.currentVariantLabel}` : ''}${nemesis.triggerNodeLabel ? ` · 出没 ${nemesis.triggerNodeLabel}` : ''}${nemesis.alliedFactionName ? ` · 投靠 ${nemesis.alliedFactionName}` : ''}`
            : '暂无锁定宿敌，当前以章节规则压力为主。';
        const nemesisCounterplay = nemesis && nemesis.counterplay
            ? nemesis.counterplay
            : '优先确认高压节点的资源底线，避免被突发追击直接打乱节奏。';
        const nemesisClue = nemesis && nemesis.clueRevealed && nemesis.clueLine
            ? `线索：${nemesis.clueLine}`
            : '线索：尚未显露，优先在事件/观星/记忆裂隙里找追猎痕迹。';
        const nemesisForecast = expeditionPayload?.nemesisForecast && typeof expeditionPayload.nemesisForecast === 'object'
            ? expeditionPayload.nemesisForecast
            : null;
        const nemesisForecastLine = nemesisForecast
            ? `${nemesisForecast.pressureLabel || '追猎预判'} · ${nemesisForecast.line || (nemesisForecast.windowLabel || '继续观察仇敌链路。')}`
            : '预判：当前还没有足够线索锁定下一次追猎窗口。';
        const engineeringSnapshot = this.getStrategicEngineeringSnapshot();
        const engineeringFocus = engineeringSnapshot && engineeringSnapshot.focusTrack ? engineeringSnapshot.focusTrack : null;
        const engineeringLine = this.resolveStrategicEngineeringRiskSignal();

        this.updateMapSituationOverviewPanel(chapter);
        this.updateChapterRiskCardPanel(chapter, specialWarnings);

        if (panel) {
            panel.style.display = 'block';
            panel.innerHTML = `
            <div class="chapter-brief-kicker">章节世界规则</div>
            <div class="chapter-brief-header">
                <div class="chapter-brief-title">${chapter.icon || '☯️'} ${chapter.fullName}</div>
                <div class="chapter-brief-stage">${chapter.stageLabel}</div>
            </div>
            <div class="chapter-brief-line">
                <span class="chapter-line-label">天象</span>
                <span class="chapter-line-value">${chapter.skyOmen?.name || '未定'} · ${chapter.skyOmen?.desc || '暂无额外变化。'}</span>
            </div>
            <div class="chapter-brief-line">
                <span class="chapter-line-label">地脉</span>
                <span class="chapter-line-value">${chapter.leyline?.name || '未定'} · ${chapter.leyline?.desc || '暂无额外变化。'}</span>
            </div>
            <div class="chapter-brief-line compact">
                <span class="chapter-line-label">风险</span>
                <span class="chapter-line-value">${dangerLine}</span>
            </div>
            <div class="chapter-brief-line compact">
                <span class="chapter-line-label">对策</span>
                <span class="chapter-line-value">${dangerCounterplay}</span>
            </div>
            <div class="chapter-brief-line compact">
                <span class="chapter-line-label">工程</span>
                <span class="chapter-line-value">${engineeringLine}</span>
            </div>
            ${seasonBoardFrontier ? `<div class="chapter-brief-line compact"
                data-map-season-board-frontier="true"
                data-season-board-frontier-id="${this.escapeMapText(seasonBoardFrontier.primaryFrontId || '')}"
                data-season-board-frontier-pressure="${this.escapeMapText(seasonBoardFrontier.statusId || '')}"
                data-season-board-frontier-action-lane-id="${this.escapeMapText(seasonBoardFrontier.actionLaneId || '')}"
                data-season-board-frontier-action-target="${this.escapeMapText(seasonBoardFrontier.actionTargetLabel || '')}">
                <span class="chapter-line-label">战线</span>
                <span class="chapter-line-value">${this.escapeMapText(seasonBoardFrontierLine)}</span>
            </div>` : ''}
            ${seasonBoardFrontierDecree ? `<div class="chapter-brief-line compact"
                data-map-season-board-frontier-decree="true"
                data-season-board-frontier-decree-id="${this.escapeMapText(seasonBoardFrontierDecree.id || '')}"
                data-season-board-frontier-decree-lane-id="${this.escapeMapText(seasonBoardFrontierDecree.laneId || '')}"
                data-season-board-frontier-decree-action-target="${this.escapeMapText(seasonBoardFrontierDecree.actionTargetLabel || '')}">
                <span class="chapter-line-label">法旨</span>
                <span class="chapter-line-value">${this.escapeMapText(seasonBoardFrontierDecreeLine)}</span>
            </div>` : ''}
            ${seasonBoardFrontierChronicle ? `<div class="chapter-brief-line compact"
                data-map-season-board-frontier-chronicle="true"
                data-season-board-frontier-chronicle-id="${this.escapeMapText(seasonBoardFrontierChronicle.id || '')}"
                data-season-board-frontier-chronicle-lane-id="${this.escapeMapText(seasonBoardFrontierChronicle.laneId || '')}"
                data-season-board-frontier-chronicle-action-target="${this.escapeMapText(seasonBoardFrontierChronicle.actionTargetLabel || '')}">
                <span class="chapter-line-label">史卷</span>
                <span class="chapter-line-value">${this.escapeMapText(seasonBoardFrontierChronicleLine)}</span>
            </div>` : ''}
            ${seasonBoardFrontierCouncil ? `<div class="chapter-brief-line compact"
                data-map-season-board-frontier-council="true"
                data-season-board-frontier-council-id="${this.escapeMapText(seasonBoardFrontierCouncil.id || '')}"
                data-season-board-frontier-council-lane-id="${this.escapeMapText(seasonBoardFrontierCouncil.laneId || '')}">
                <span class="chapter-line-label">会审</span>
                <span class="chapter-line-value">${this.escapeMapText(seasonBoardFrontierCouncilLine)}</span>
            </div>` : ''}
            <div class="chapter-brief-line compact">
                <span class="chapter-line-label">宿敌</span>
                <span class="chapter-line-value">${nemesisLine}</span>
            </div>
            <div class="chapter-brief-line compact">
                <span class="chapter-line-label">追猎</span>
                <span class="chapter-line-value">${nemesisCounterplay}</span>
            </div>
            <div class="chapter-brief-line compact">
                <span class="chapter-line-label">线索</span>
                <span class="chapter-line-value">${nemesisClue}</span>
            </div>
            <div class="chapter-brief-line compact">
                <span class="chapter-line-label">预判</span>
                <span class="chapter-line-value">${nemesisForecastLine}</span>
            </div>
            <div class="chapter-brief-line compact">
                <span class="chapter-line-label">主宰</span>
                <span class="chapter-line-value">${bossLine}</span>
            </div>
            <div class="chapter-brief-chip-row">
                <span class="chapter-brief-chip dri ${dangerProfile ? `tier-${dangerProfile.tierId || 'medium'}` : 'tier-none'}">${dangerProfile ? `风险指数 · DRI ${dangerProfile.index} / 100` : '风险指数 · 待推演'}</span>
                <span class="chapter-brief-chip nemesis ${nemesis ? `status-${nemesis.status || 'hunting'}` : 'status-none'}">${nemesis ? `宿敌追猎 · ${nemesis.statusLabel} · 压力 ${nemesis.pressureIndex}` : '宿敌追猎 · 暂无目标'}</span>
                ${engineeringFocus ? `<span class="chapter-brief-chip engineering">${this.escapeMapText(`工程主轴 · ${engineeringFocus.name} ${engineeringFocus.tierLabel} · ${engineeringFocus.nextTarget != null ? `距${engineeringFocus.nextTierLabel}还需 ${engineeringFocus.remaining} 次${engineeringFocus.nodeLabel}` : '当前已达最高工事阶'}`)}</span>` : ''}
                ${nemesis ? `<span class="chapter-brief-chip nemesis-reward">追猎赏格 · ${nemesis.rewardSummary || '暂无额外收益'}</span>` : ''}
                ${nemesis && nemesis.currentVariantLabel ? `<span class="chapter-brief-chip nemesis-reward">${nemesis.currentVariantLabel}</span>` : ''}
                ${nemesisForecast ? `<span class="chapter-brief-chip nemesis-forecast ${this.escapeMapText(`tier-${nemesisForecast.pressureTier || 'medium'}`)}">${this.escapeMapText(`追猎预判 · ${nemesisForecast.pressureLabel || '拉扯'} · ${nemesisForecast.windowLabel || '窗口待定'}`)}</span>` : ''}
                ${frontierRisk ? `<span class="chapter-brief-chip warning">${this.escapeMapText(`前路主险 · ${frontierRisk.label} · DRI ${frontierRisk.index}`)}</span>` : ''}
                ${seasonBoardFrontier ? `<span class="chapter-brief-chip warning" data-map-season-board-chip="frontier">${this.escapeMapText(`诸界战线 · ${seasonBoardFrontier.primaryFrontShortLabel || seasonBoardFrontier.primaryFrontLabel || '主战线'} · ${seasonBoardFrontier.pressureLabel || seasonBoardFrontier.statusLabel || '稳态'}`)}</span>` : ''}
                ${seasonBoardFrontierDecree ? `<span class="chapter-brief-chip warning" data-map-season-board-chip="frontier-decree">${this.escapeMapText(`本周法旨 · ${seasonBoardFrontierDecree.laneLabel || seasonBoardFrontier.primaryFrontShortLabel || '主战线'} · ${seasonBoardFrontierDecree.toneLabel || '本周'}`)}</span>` : ''}
                ${seasonBoardFrontierChronicle ? `<span class="chapter-brief-chip warning" data-map-season-board-chip="frontier-chronicle">${this.escapeMapText(`战役史卷 · ${seasonBoardFrontierChronicle.laneLabel || seasonBoardFrontier.primaryFrontShortLabel || '主战线'} · ${seasonBoardFrontierChronicle.phaseLabel || '本周'}`)}</span>` : ''}
                ${seasonBoardFrontierCouncil ? `<span class="chapter-brief-chip warning" data-map-season-board-chip="frontier-council">${this.escapeMapText(`诸界会审 · ${seasonBoardFrontierCouncil.laneLabel || seasonBoardFrontier.primaryFrontShortLabel || '主战线'} · ${seasonBoardFrontierCouncil.phaseLabel || '本周'}`)}</span>` : ''}
                ${(Array.isArray(chapter.focusTags) ? chapter.focusTags : [])
                    .slice(0, 3)
                    .map((tag) => `<span class="chapter-brief-chip">${tag}</span>`)
                    .join('')}
                <span class="chapter-brief-chip warning">前路异象：${specialWarnings.length > 0 ? specialWarnings.join(' / ') : '常规战斗为主'}</span>
            </div>
        `;
            panel.title = [
                chapter.stageDesc || '',
                chapter.routePrompt || '',
                chapter.bossPrompt || '',
                nemesis && nemesis.intro ? `${nemesis.name}：${nemesis.intro}` : ''
            ].filter(Boolean).join(' ｜ ');
        }
    }

    updateAdventureBuffPanel() {
        const container = document.getElementById('map-adventure-buffs');
        if (!container) return;

        const buffs = (this.game.player && this.game.player.adventureBuffs && typeof this.game.player.adventureBuffs === 'object')
            ? this.game.player.adventureBuffs
            : {};
        const buffDefs = [
            { id: 'firstTurnDrawBoostBattles', icon: '📘', name: '首回合抽牌' },
            { id: 'openingBlockBoostBattles', icon: '🧿', name: '开场护盾' },
            { id: 'victoryGoldBoostBattles', icon: '📜', name: '胜利悬赏' },
            { id: 'firstTurnEnergyBoostBattles', icon: '⚡', name: '首回合灵力' },
            { id: 'ringExpBoostBattles', icon: '🕯️', name: '命环经验' },
            { id: 'victoryHealBoostBattles', icon: '🩹', name: '战后医护' }
        ];

        const active = buffDefs
            .map((def) => {
                const value = Math.max(0, Math.floor(Number(buffs[def.id]) || 0));
                return { ...def, value };
            })
            .filter((item) => item.value > 0);

        if (active.length === 0) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        container.style.display = 'flex';
        container.innerHTML = active
            .map((item) => `
                <div class="map-buff-chip" title="${item.name}">
                    <span class="map-buff-icon">${item.icon}</span>
                    <span class="map-buff-name">${item.name}</span>
                    <span class="map-buff-count">x${item.value}</span>
                </div>
            `)
            .join('');
    }

    getRouteHintProfile() {
        const rows = Array.isArray(this.nodes) ? this.nodes : [];
        if (rows.length === 0) return { chips: [] };

        let frontierRow = -1;
        rows.forEach((rowNodes, rowIndex) => {
            if (!Array.isArray(rowNodes)) return;
            const hasAccessible = rowNodes.some((node) => !!(node && node.accessible && !node.completed));
            if (hasAccessible) frontierRow = Math.max(frontierRow, rowIndex);
        });
        if (frontierRow < 0) {
            rows.forEach((rowNodes, rowIndex) => {
                if (!Array.isArray(rowNodes)) return;
                const hasCompleted = rowNodes.some((node) => !!(node && node.completed));
                if (hasCompleted) frontierRow = Math.max(frontierRow, rowIndex + 1);
            });
        }
        if (frontierRow < 0) frontierRow = Math.min(rows.length - 1, 1);

        const chips = [];
        const pendingRumor = this.game && typeof this.game.getPendingRouteRumorProfile === 'function'
            ? this.game.getPendingRouteRumorProfile()
            : null;
        if (pendingRumor && pendingRumor.target) {
            chips.push({
                id: 'rumor-route',
                icon: '🔮',
                label: `第${pendingRumor.target}重已锁定：${pendingRumor.label}`
            });
        }

        const activeVows = this.game && this.game.player && typeof this.game.player.getRunVowMetas === 'function'
            ? this.game.player.getRunVowMetas()
            : [];
        activeVows.forEach((vow) => {
            if (!vow || !vow.name) return;
            chips.push({
                id: 'vow-route',
                icon: vow.icon || '✧',
                label: `${vow.name}：${vow.routeHint || '偏好高风险节点'}`
            });
        });

        const start = Math.max(0, frontierRow - 4);
        const recentRows = rows.slice(start, frontierRow).filter((rowNodes) => Array.isArray(rowNodes) && rowNodes.length > 0);
        if (recentRows.length < 3) return { chips };

        const hasTypeInRows = (type) => recentRows.some((rowNodes) => this.rowContainsType(rowNodes, type));
        if (!hasTypeInRows('event')) {
            chips.push({
                id: 'event-pity',
                icon: '❓',
                label: '机缘保底已激活'
            });
        }
        if (!hasTypeInRows('shop')) {
            chips.push({
                id: 'shop-pity',
                icon: '🏪',
                label: '商路保底已激活'
            });
        }
        const progress = frontierRow / Math.max(1, rows.length - 1);
        if (!hasTypeInRows('rest') && progress >= 0.35) {
            chips.push({
                id: 'rest-pity',
                icon: '🏕️',
                label: '营地舒压权重上调'
            });
        }
        const hasStrategicInRows = recentRows.some((rowNodes) => (
            this.rowContainsType(rowNodes, 'observatory')
            || this.rowContainsType(rowNodes, 'spirit_grotto')
            || this.rowContainsType(rowNodes, 'forbidden_altar')
            || this.rowContainsType(rowNodes, 'memory_rift')
        ));
        if (!hasStrategicInRows && progress >= 0.28) {
            chips.push({
                id: 'strategic-pity',
                icon: '🧭',
                label: '谋略节点权重上调'
            });
        }

        const counts = this.collectRecentTypeCounts(frontierRow, 4, { historyRows: recentRows });
        const combatCount = Math.max(0, Number(counts.counts.enemy || 0) + Number(counts.counts.elite || 0));
        const combatRatio = counts.total > 0 ? combatCount / counts.total : 0;
        if (combatRatio >= 0.62) {
            chips.push({
                id: 'combat-dense',
                icon: '⚖️',
                label: '战斗稠密，功能节点补偿中'
            });
        }

        return { chips };
    }

    updateRouteHintPanel() {
        const panel = document.getElementById('map-route-hints');
        if (!panel) return;

        const profile = this.getRouteHintProfile();
        const chips = Array.isArray(profile?.chips) ? profile.chips : [];
        if (chips.length === 0) {
            panel.style.display = 'none';
            panel.innerHTML = '';
            return;
        }

        panel.style.display = 'flex';
        panel.innerHTML = chips.map((chip) => `
            <div class="map-route-chip route-${chip.id}" title="${chip.label}">
                <span class="route-icon">${chip.icon}</span>
                <span class="route-label">${chip.label}</span>
            </div>
        `).join('');
    }

    updateEndlessPanel() {
        const panel = document.getElementById('map-endless-panel');
        if (!panel) return;
        if (!this.game || typeof this.game.isEndlessActive !== 'function' || !this.game.isEndlessActive()) {
            panel.style.display = 'none';
            panel.innerHTML = '';
            panel.classList.remove('pressure-up', 'pressure-down');
            this.lastEndlessPressure = null;
            if (this.endlessPressurePulseTimer) {
                clearTimeout(this.endlessPressurePulseTimer);
                this.endlessPressurePulseTimer = null;
            }
            return;
        }

        const state = typeof this.game.ensureEndlessState === 'function'
            ? this.game.ensureEndlessState()
            : null;
        const mods = typeof this.game.getEndlessModifiers === 'function'
            ? this.game.getEndlessModifiers()
            : {
                enemyHpMul: 1,
                enemyAtkMul: 1,
                rewardGoldMul: 1,
                rewardExpMul: 1
            };
        const pressureProfile = (typeof this.game.getEndlessPressureBehaviorProfile === 'function')
            ? this.game.getEndlessPressureBehaviorProfile()
            : null;
        const dangerProfile = (typeof this.game.getEndlessDangerProfile === 'function')
            ? this.game.getEndlessDangerProfile(state?.currentCycle)
            : null;
        const cycleTheme = (typeof this.game.getEndlessCycleThemeProfile === 'function')
            ? this.game.getEndlessCycleThemeProfile()
            : null;
        const seasonProfile = (typeof this.game.getEndlessSeasonProfile === 'function')
            ? this.game.getEndlessSeasonProfile(state?.currentCycle)
            : null;

        const mutators = (state && Array.isArray(state.activeMutators) && typeof this.game.getEndlessMutatorPool === 'function')
            ? state.activeMutators
                .map((id) => this.game.getEndlessMutatorPool().find((item) => item.id === id))
                .filter(Boolean)
            : [];

        panel.style.display = 'block';
        const score = Math.max(0, Math.floor(Number(state?.totalEndlessScore) || 0));
        const pressure = Math.max(0, Math.min(9, Math.floor(Number(state?.pressure) || 0)));
        const pressureTier = pressure >= 8 ? '灾厄' : pressure >= 5 ? '高压' : pressure >= 2 ? '紧张' : '平稳';
        const rarePity = Math.max(0, Math.floor(Number(state?.boonRarePity) || 0));
        const rareEvery = Math.max(2, Math.floor(Number(state?.boonRareGuaranteedEvery) || 3));
        const behaviorTier = (pressureProfile && pressureProfile.tierId) ? pressureProfile.tierId : 'calm';
        const behaviorHint = (pressureProfile && pressureProfile.summary)
            ? pressureProfile.summary
            : '敌方行动维持常态';
        const themeChipClass = cycleTheme
            ? `segment-${Math.max(1, Math.min(5, Math.floor(Number(cycleTheme.segmentIndex) || 1)))}`
            : 'segment-0';
        const themeChipText = cycleTheme
            ? `轮段 ${cycleTheme.segmentIndex} · ${cycleTheme.shortName || cycleTheme.name || '稳衡'}`
            : '轮段 · 稳衡';
        const themeDesc = cycleTheme && cycleTheme.desc
            ? cycleTheme.desc
            : '轮段稳定，敌方与收益维持均衡节奏。';
        const seasonChipText = seasonProfile
            ? `${seasonProfile.icon || '🜁'} ${seasonProfile.name} · ${seasonProfile.weekTag}`
            : '🜁 赛季待命';
        const directiveChipText = seasonProfile && seasonProfile.directiveName
            ? seasonProfile.directiveName
            : '稳态季签';
        const seasonDesc = seasonProfile
            ? `${seasonProfile.desc || ''}｜季签：${seasonProfile.directiveName}（${seasonProfile.directiveRiskLabel || '平衡'} / ${seasonProfile.selectionModeLabel || '轮转推荐'}）· ${seasonProfile.directiveDesc || '保持稳态推进。'}`
            : '赛季尚未激活，等待进入无尽轮回后自动加载。';
        const dangerLine = dangerProfile && dangerProfile.line
            ? dangerProfile.line
            : '轮回压强 DRI 待推演 · 进入轮回后自动生成主轴';
        const dangerSummary = dangerProfile && dangerProfile.summary
            ? dangerProfile.summary
            : '等待压力、轮段与赛季数据收束后生成危险画像。';
        const dangerCounterplay = dangerProfile && dangerProfile.counterplay
            ? dangerProfile.counterplay
            : '先稳住资源底线，再根据本轮主轴调整路线。';
        const dangerReserve = dangerProfile && dangerProfile.reserveGuidance
            ? dangerProfile.reserveGuidance
            : '保留一条减伤、补件或净化线，避免深轮直接断档。';
        const dangerAxes = dangerProfile && Array.isArray(dangerProfile.axes)
            ? dangerProfile.axes
            : [];
        const seasonClears = Math.max(0, Math.floor(Number(state?.seasonCycleClears) || 0));
        const seasonBosses = Math.max(0, Math.floor(Number(state?.seasonBossDefeated) || 0));
        const seasonScore = Math.max(0, Math.floor(Number(state?.seasonScore) || 0));
        const seasonBestCycle = Math.max(1, Math.floor(Number(state?.seasonBestCycle) || 1));
        const seasonGoals = seasonProfile && Array.isArray(seasonProfile.goals)
            ? seasonProfile.goals
            : [];
        const collapseSummary = seasonProfile && Array.isArray(seasonProfile.collapseSummary)
            ? seasonProfile.collapseSummary
            : [];
        const lastCollapse = seasonProfile && seasonProfile.lastCollapse
            ? seasonProfile.lastCollapse
            : null;
        const paranoia = (typeof this.game.getEndlessParanoiaEffects === 'function')
            ? this.game.getEndlessParanoiaEffects()
            : null;
        const latestBurden = paranoia && paranoia.latestBurden ? paranoia.latestBurden : null;
        const latestBoon = paranoia && paranoia.latestBoon ? paranoia.latestBoon : null;
        const paranoiaLevel = Math.max(0, Math.floor(Number(state?.paranoiaLevel) || 0));
        const paranoiaSummary = latestBurden && latestBoon
            ? `偏执 ${paranoiaLevel} 层：${latestBurden.shortLabel || latestBurden.name} / ${latestBoon.shortLabel || latestBoon.name}`
            : '尚未触发轮回偏执';
        const paranoiaImpact = [];
        if (paranoia) {
            const handPenalty = Math.abs(Math.min(0, Math.floor(Number(paranoia.handLimitOffset) || 0)));
            if (handPenalty > 0) paranoiaImpact.push(`手牌上限 -${handPenalty}`);
            if (paranoia.eliteExtraMutator) paranoiaImpact.push('精英战额外词缀');
            if (Number(paranoia.rewardRareChance || 0) > 0) paranoiaImpact.push('稀有奖励倾向提升');
            if (Number(paranoia.extraTreasureSlots || 0) > 0) paranoiaImpact.push(`法宝槽位 +${Math.floor(Number(paranoia.extraTreasureSlots) || 0)}`);
        }
        panel.innerHTML = `
            <div class="endless-title">无尽轮回 · 第${(state?.currentCycle || 0) + 1}轮</div>
            <div class="endless-stats">
                <span>生命 x${(mods.enemyHpMul || 1).toFixed(2)}</span>
                <span>攻击 x${(mods.enemyAtkMul || 1).toFixed(2)}</span>
                <span>灵石 x${(mods.rewardGoldMul || 1).toFixed(2)}</span>
                <span>经验 x${(mods.rewardExpMul || 1).toFixed(2)}</span>
                <span>积分 ${score}</span>
                <span>压力 ${pressure}/9</span>
                <span>压阶 ${pressureTier}</span>
                <span>稀有保底 ${Math.max(0, rareEvery - 1 - rarePity)}/ ${Math.max(1, rareEvery - 1)}</span>
                <span class="endless-pressure-chip tier-${behaviorTier}">敌方节奏：${behaviorHint}</span>
                <span class="endless-theme-chip ${themeChipClass}" title="${themeDesc}">战场轮段：${themeChipText}</span>
                <span class="endless-season-chip" title="${seasonDesc}">赛季：${seasonChipText}</span>
                <span class="endless-directive-chip" title="${seasonDesc}">季签：${directiveChipText}</span>
                <span class="endless-paranoia-chip ${paranoiaLevel > 0 ? 'active' : 'idle'}" title="${paranoiaSummary}">轮回偏执：${paranoiaLevel > 0 ? `第 ${paranoiaLevel} 层` : '未激活'}</span>
            </div>
            <div class="endless-danger-band ${dangerProfile ? `tier-${dangerProfile.tierId || 'controlled'}` : 'tier-none'}">
                <div class="endless-danger-head">
                    <strong>${dangerLine}</strong>
                    <span>主轴：${dangerProfile?.dominantAxisLabel || '待推演'}</span>
                </div>
                <p class="endless-danger-summary">${dangerSummary}</p>
                <div class="endless-danger-grid">
                    ${dangerAxes.length > 0
                        ? dangerAxes.map((axis) => `
                            <div class="endless-danger-chip">
                                <strong>${axis.label}</strong>
                                <span>${Math.max(0, Math.floor(Number(axis.value) || 0))}</span>
                            </div>
                        `).join('')
                        : '<div class="endless-danger-chip idle"><strong>风险维度</strong><span>待推演</span></div>'}
                </div>
                <div class="endless-danger-foot">
                    <span class="endless-danger-counterplay" data-endless-counterplay>对策：${dangerCounterplay}</span>
                    <span class="endless-danger-reserve" data-endless-reserve>预留：${dangerReserve}</span>
                </div>
            </div>
            <div class="endless-theme-desc">${themeDesc}</div>
            <div class="endless-season-desc">${seasonDesc}</div>
            <div class="endless-season-ledger">赛季战绩：已通关 ${seasonClears} 轮 · 主宰 ${seasonBosses} · 赛季积分 ${seasonScore} · 最深第 ${seasonBestCycle} 轮</div>
            <div class="endless-directive-controls">
                <div class="endless-section-title">可控风险指令</div>
                <div class="endless-directive-options">
                    <button
                        type="button"
                        class="endless-directive-option ${seasonProfile?.activeDirectiveSource === 'auto' ? 'active' : ''}"
                        data-endless-directive="auto"
                    >
                        轮转推荐
                    </button>
                    ${(seasonProfile?.directiveChoices || []).map((item) => `
                        <button
                            type="button"
                            class="endless-directive-option risk-${item.riskTier || 'balanced'} ${item.selected ? 'active' : ''}"
                            data-endless-directive="${item.id}"
                            title="${item.desc || ''}"
                        >
                            <span class="directive-name">${item.name}</span>
                            <span class="directive-risk">${item.riskLabel || '平衡'}</span>
                        </button>
                    `).join('')}
                </div>
                <div class="endless-directive-note">
                    当前：${seasonProfile?.directiveName || '稳态令'}（${seasonProfile?.directiveRiskLabel || '平衡'}）｜${seasonProfile?.directiveRiskHint || '收益与风险保持折中，适合常规滚分。'}
                </div>
            </div>
            <div class="endless-season-goals">
                <div class="endless-section-title">赛季挑战链</div>
                <div class="endless-season-goal-grid">
                    ${seasonGoals.length > 0
                        ? seasonGoals.map((goal) => `
                            <div class="endless-season-goal ${goal.completed ? 'completed' : 'pending'}">
                                <div class="goal-tier">${goal.tierLabel}</div>
                                <div class="goal-title">${goal.title}</div>
                                <div class="goal-progress">${goal.completed ? '已达成' : (goal.progressText || '进行中')}</div>
                                <div class="goal-desc">${goal.desc || ''}</div>
                            </div>
                        `).join('')
                        : '<div class="endless-season-goal pending"><div class="goal-title">赛季目标待生成</div><div class="goal-desc">进入本周无尽后会自动生成目标链。</div></div>'}
                </div>
            </div>
            <div class="endless-collapse-ledger">
                <div class="endless-section-title">崩盘账本</div>
                <div class="endless-collapse-list">
                    ${collapseSummary.length > 0
                        ? collapseSummary.map((item) => `<span class="endless-collapse-chip">${item.label} ${item.count} 次</span>`).join('')
                        : '<span class="endless-collapse-chip idle">本周暂无崩盘记录</span>'}
                </div>
                <div class="endless-collapse-note">
                    ${lastCollapse && lastCollapse.label
                        ? `最近一次：${lastCollapse.label}${lastCollapse.desc ? `｜${lastCollapse.desc}` : ''}`
                        : '账本会在无尽失败后记录主因，方便复盘赛季失分点。'}
                </div>
            </div>
            <div class="endless-paranoia-summary">${paranoiaSummary}</div>
            <div class="endless-paranoia-effects">
                ${paranoiaImpact.length > 0
                    ? paranoiaImpact.map((item) => `<span class="endless-paranoia-effect">${item}</span>`).join('')
                    : '<span class="endless-paranoia-effect idle">等待下一次大轮回抉择</span>'}
            </div>
            <div class="endless-mutators">
                ${mutators.length > 0
                    ? mutators.map((item) => `<span class="endless-mutator-chip" title="${item.desc}">${item.name}</span>`).join('')
                    : '<span class="endless-mutator-chip">当前无词缀</span>'}
            </div>
        `;

        panel.dataset.pressure = String(pressure);
        panel.classList.remove('pressure-up', 'pressure-down');
        if (this.lastEndlessPressure !== null && this.lastEndlessPressure !== pressure) {
            panel.classList.add(pressure > this.lastEndlessPressure ? 'pressure-up' : 'pressure-down');
            if (this.endlessPressurePulseTimer) {
                clearTimeout(this.endlessPressurePulseTimer);
            }
            this.endlessPressurePulseTimer = setTimeout(() => {
                panel.classList.remove('pressure-up', 'pressure-down');
            }, 900);
        }
        this.lastEndlessPressure = pressure;

        panel.querySelectorAll('[data-endless-directive]').forEach((button) => {
            button.addEventListener('click', () => {
                const directiveId = button.getAttribute('data-endless-directive');
                if (!this.game || typeof this.game.setEndlessSeasonDirective !== 'function') return;
                this.game.setEndlessSeasonDirective(directiveId === 'auto' ? null : directiveId);
                this.updateEndlessPanel();
            });
        });
    }

    updateLegacyMissionTracker() {
        const updatePanel = (panelId, payload = null, titlePrefix = '') => {
            const panel = document.getElementById(panelId);
            if (!panel) return;
            if (!payload || !payload.target) {
                panel.style.display = 'none';
                return;
            }

            const target = Math.max(1, Number(payload.target) || 1);
            const progress = Math.max(0, Math.min(target, Number(payload.progress) || 0));
            const percent = Math.round((progress / target) * 100);
            const titleEl = panel.querySelector('.mission-title');
            const descEl = panel.querySelector('.mission-desc');
            const fillEl = panel.querySelector('.mission-fill');
            const progressEl = panel.querySelector('.mission-progress');

            panel.style.display = 'block';
            panel.classList.toggle('completed', !!payload.completed);
            if (titleEl) titleEl.textContent = `${titlePrefix}${payload.title || '未命名阶段'}`;
            if (descEl) descEl.textContent = payload.desc || '';
            if (fillEl) fillEl.style.width = `${percent}%`;
            if (progressEl) {
                progressEl.textContent = payload.completed
                    ? `已达成 ${target}/${target}`
                    : `${progress}/${target}`;
            }
        };

        const mission = this.game && this.game.player ? this.game.player.legacyRunMission : null;
        updatePanel('map-legacy-mission', mission ? {
            title: mission.name || '未命名试炼',
            desc: mission.desc || '',
            target: mission.target,
            progress: mission.progress,
            completed: mission.completed
        } : null, '传承试炼：');

        const runPathTracker = this.game && typeof this.game.getRunPathTrackerState === 'function'
            ? this.game.getRunPathTrackerState()
            : null;
        updatePanel('map-run-path-mission', runPathTracker ? {
            title: `${runPathTracker.name} · ${runPathTracker.phaseLabel} · ${runPathTracker.title}`,
            desc: runPathTracker.desc || runPathTracker.rewardText || '',
            target: runPathTracker.target,
            progress: runPathTracker.progress,
            completed: runPathTracker.completed
        } : null, '命途主线：');

        const flashPanel = document.getElementById('map-run-path-flash');
        const flash = this.game && this.game.lastRunPathMapFeedback ? this.game.lastRunPathMapFeedback : null;
        if (!flashPanel) return;

        const now = Date.now();
        const shouldShowFlash = !!flash && (!flash.expiresAt || flash.expiresAt > now);
        if (!shouldShowFlash) {
            flashPanel.style.display = 'none';
            flashPanel.innerHTML = '';
            flashPanel.classList.remove('completed');
            return;
        }

        const escape = (value) => String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        const nextText = flash.completed
            ? '命途主线已圆满，后续地图将按这条完成路线继续收束。'
            : (flash.nextPhaseTitle
                ? `下一阶段：${[flash.nextPhaseLabel, flash.nextPhaseTitle].filter(Boolean).join(' · ')}`
                : '下一阶段已就绪。');

        flashPanel.style.display = 'grid';
        flashPanel.classList.toggle('completed', !!flash.completed);
        flashPanel.innerHTML = `
            <div class="map-run-path-flash-head">
                <div class="map-run-path-flash-badge">${escape(flash.icon || '✦')} ${escape(flash.name || '命途')}</div>
                <div class="map-run-path-flash-status">${escape(flash.completed ? '命途圆满' : '阶段已完成')}</div>
            </div>
            <div class="map-run-path-flash-title">${escape([flash.phaseLabel, flash.title].filter(Boolean).join(' · '))}</div>
            <div class="map-run-path-flash-reward">${escape(flash.rewardText || '奖励已结算')}</div>
            <div class="map-run-path-flash-next">${escape(nextText)}</div>
        `;
    }

    // 节点点击
    onNodeClick(node) {
        if (node.completed || !node.accessible) return;

        this.currentNodeIndex = node.id;

        switch (node.type) {
            case 'enemy':
                this.startEnemyBattle(node);
                break;
            case 'elite':
                this.startEliteBattle(node);
                break;
            case 'boss':
                this.startBossBattle(node);
                break;
            case 'ghost_duel':
                this.startGhostDuel(node);
                break;
            case 'event':
                this.triggerEvent(node);
                break;
            case 'shop':
                this.openShop(node);
                break;
            case 'rest':
                this.restAtCamp(node);
                break;
            case 'trial':
                this.startTrialNode(node);
                break;
            case 'forge':
                this.openForgeNode(node);
                break;
            case 'observatory':
                this.openObservatoryNode(node);
                break;
            case 'spirit_grotto':
                this.openSpiritGrottoNode(node);
                break;
            case 'forbidden_altar':
                this.openForbiddenAltarNode(node);
                break;
            case 'memory_rift':
                this.openMemoryRiftNode(node);
                break;
        }
    }

    // 开始普通战斗
    startEnemyBattle(node) {
        const realm = this.game.player.realm;
        const enemy = getRandomEnemy(realm);

        if (!enemy) {
            console.error(`无法为第${realm}重生成敌人！`);
            Utils.showBattleLog(`此处空无一物... 你顺利通过了这个节点`);

            // 自动完成节点，避免卡死
            setTimeout(() => {
                this.completeNode(node);
            }, 1000);
            return;
        }

        enemy.ringExp = 8 + realm * 4; // Hardcore: lower exp gain
        this.game.currentBattleNode = node; // 保存节点
        this.game.startBattle([enemy], node);
    }

    // --- P1: 心魔对决 ---
    async startGhostDuel(node) {
        Utils.showBattleLog(`正在感知周遭残影...`, 'info');
        const realm = this.game.player.realm;

        let ghostData = null;
        if (typeof AuthService !== 'undefined' && AuthService.fetchRandomGhost) {
            try {
                const res = await AuthService.fetchRandomGhost(realm);
                if (res.success && res.data) {
                    ghostData = res.data;
                }
            } catch (error) {
                console.warn('fetchRandomGhost failed, fallback to compensation flow:', error);
            }
        }

        if (!ghostData) {
            Utils.showBattleLog(`这片虚空异常宁静，心魔已然散去...`);
            this.game.player.gold += 100; // 补偿
            setTimeout(() => this.completeNode(node), 1000);
            return;
        }

        // 构造幽灵Boss
        const readField = (obj, key, fallback = null) => {
            if (!obj) return fallback;
            if (obj[key] !== undefined) return obj[key];
            if (typeof obj.get === 'function') {
                const val = obj.get(key);
                return val !== undefined ? val : fallback;
            }
            return fallback;
        };

        const ghostPayload = readField(ghostData, 'ghostData', {}) || {};
        const ghostName = readField(ghostData, 'userName', '未知残影') || '未知残影';
        const ghostHp = ghostPayload.maxHp || 150;

        const ghostEnemy = {
            id: 'ghost_demon',
            name: `【心魔】${ghostName}`,
            maxHp: Math.floor(ghostHp * 1.5), // 作为心魔Boss略微强化血量
            hp: Math.floor(ghostHp * 1.5),
            type: 'elite', // 以精英或BOSS的强度对待
            ringExp: 50 + realm * 10,
            gold: 30 + realm * 10,
            icon: '👻',
            // 保留 ghostPayload 供 battle.js 解析残影动作
            ghostPayload: ghostPayload,
            // 基础初始库
            patterns: [
                { type: 'attack', value: 10 + realm * 2, weight: 1, intent: '剑意（攻击）' },
                { type: 'defend', value: 15 + realm * 2, weight: 1, intent: '罡气（护盾）' }
            ]
        };

        this.game.currentBattleNode = node;
        this.game.startBattle([ghostEnemy], node);
    }

    // 开始精英战斗
    startEliteBattle(node) {
        const realm = this.game.player.realm;
        const elite = createEliteEnemy(realm);

        if (!elite) {
            console.error(`无法为第${realm}重生成精英敌人！`);
            Utils.showBattleLog(`精英怪物已经提前逃走... 你获得了一些补偿`);

            // 给予补偿奖励
            this.game.player.gold += 50 + realm * 10;
            this.game.player.fateRing.exp += 20 + realm * 5;

            // 自动完成节点
            setTimeout(() => {
                this.completeNode(node);
            }, 1000);
            return;
        }

        elite.ringExp = 20 + realm * 8; // Hardcore: lower exp gain
        this.game.currentBattleNode = node;
        this.game.startBattle([elite], node);
    }

    // 试炼节点：先选词缀，再进入强化版精英战
    startTrialNode(node, trialConfig = null) {
        if (!trialConfig && this.game && typeof this.game.showTrialChallengeSelection === 'function') {
            this.game.showTrialChallengeSelection(node);
            return;
        }

        const realm = this.game.player.realm;
        const trialEnemy = createEliteEnemy(realm) || getRandomEnemy(realm);

        if (!trialEnemy) {
            this.completeNode(node);
            return;
        }

        const armedTrial = trialConfig && this.game && typeof this.game.armTrialChallenge === 'function'
            ? this.game.armTrialChallenge(trialConfig)
            : trialConfig;

        trialEnemy.name = `【试炼】${trialEnemy.name}`;
        const hpMul = Math.max(1, Number(armedTrial?.enemyHpMul) || 1);
        const atkMul = Math.max(1, Number(armedTrial?.enemyAtkMul) || 1);
        const openingBlock = Math.max(0, Math.floor(Number(armedTrial?.enemyOpeningBlock) || 0));
        const enemyDebuff = armedTrial && armedTrial.enemyDebuff && typeof armedTrial.enemyDebuff === 'object'
            ? armedTrial.enemyDebuff
            : null;

        trialEnemy.hp = Math.floor((trialEnemy.hp || trialEnemy.maxHp || 80) * 1.35 * hpMul);
        trialEnemy.maxHp = Math.max(trialEnemy.hp, Math.floor(Number(trialEnemy.maxHp || trialEnemy.hp || 80) * 1.35 * hpMul));
        trialEnemy.ringExp = Math.floor((trialEnemy.ringExp || (20 + realm * 6)) * 1.6);
        trialEnemy.block = Math.max(0, Math.floor(Number(trialEnemy.block) || 0)) + openingBlock;
        trialEnemy.patterns = (trialEnemy.patterns || []).map(pattern => {
            if (pattern.type === 'attack' || pattern.type === 'multiAttack') {
                return { ...pattern, value: Math.floor((pattern.value || 0) * 1.2 * atkMul) };
            }
            return { ...pattern };
        });
        if (enemyDebuff && enemyDebuff.type && enemyDebuff.value > 0) {
            trialEnemy.patterns.unshift({
                type: 'debuff',
                buffType: enemyDebuff.type,
                value: enemyDebuff.value,
                intent: '试炼词缀'
            });
        }

        this.game.currentBattleNode = node;
        if (armedTrial && armedTrial.name) {
            Utils.showBattleLog(`【试炼碑】已刻下【${armedTrial.name}】`);
            const conditionLines = [];
            if (Number(armedTrial?.conditions?.maxTurns || 0) > 0) {
                conditionLines.push(`${armedTrial.conditions.maxTurns} 回合内取胜`);
            }
            if (armedTrial?.conditions?.noDamage) {
                conditionLines.push('本场不可失去生命');
            }
            if (conditionLines.length > 0) {
                Utils.showBattleLog(`试炼条件：${conditionLines.join('｜')}`);
            }
        }
        this.game.startBattle([trialEnemy], node);
    }

    // 开始BOSS战斗
    startBossBattle(node) {
        const realm = this.game.player.realm;

        // 5-10-15 层天劫BOSS特殊处理
        if ([5, 10, 15].includes(realm)) {
            let tribId = 'tribulationCloud5';
            if (realm === 10) tribId = 'tribulationCloud10';
            if (realm === 15) tribId = 'tribulationCloud15';

            // Check if tribulation boss exists in definition
            // Assuming ENEMIES has these IDs. If not, fallback to normal boss.
            if (ENEMIES[tribId]) {
                const tBoss = JSON.parse(JSON.stringify(ENEMIES[tribId]));
                tBoss.isBoss = true;
                tBoss.isTribulation = true;
                tBoss.ringExp = 80 + realm * 16; // Hardcore: lower exp gain

                this.game.currentBattleNode = node;
                this.game.startBattle([tBoss], node);

                Utils.showBattleLog(`【天劫降临】渡过此劫，逆天改命！`);
                return;
            }
        }

        const boss = getBossForRealm(realm);
        if (boss) {
            const bossInstance = JSON.parse(JSON.stringify(boss));
            bossInstance.isBoss = true;
            bossInstance.name = `【天劫】${bossInstance.name}`; // 标记为天劫BOSS
            bossInstance.ringExp = 40 + realm * 16; // Hardcore: lower exp gain
            const baseHp = bossInstance.hp || bossInstance.maxHp || 0;

            // Dual Boss Logic (Realm 10+)
            const enemies = [];
            if (realm >= 10) {
                // Boss A
                const bossA = JSON.parse(JSON.stringify(bossInstance));
                bossA.id = (bossA.id || 'boss') + '_A';
                bossA.name += ' (阴)';
                bossA.hp = Math.floor(baseHp * 0.7); // 70% HP (battle scaling happens later)
                bossA.isDualBoss = true; // Mark for Twin Bonds logic
                enemies.push(bossA);

                // Boss B
                const bossB = JSON.parse(JSON.stringify(bossInstance));
                bossB.id = (bossB.id || 'boss') + '_B';
                bossB.name += ' (阳)';
                bossB.hp = Math.floor(baseHp * 0.7); // 70% HP (battle scaling happens later)
                bossB.isDualBoss = true;
                enemies.push(bossB);

                Utils.showBattleLog(`天劫异变！双子魔尊降临！`);
            } else {
                enemies.push(bossInstance);
                Utils.showBattleLog(`天劫降临！击败【${bossInstance.name}】以破境！`);
            }

            this.game.currentBattleNode = node;
            this.game.startBattle(enemies, node);
        }
    }

    // 触发事件
    triggerEvent(node) {
        // 确保 getRandomEvent 可用
        if (typeof getRandomEvent !== 'function') {
            console.error('getRandomEvent not found');
            this.completeNode(node);
            return;
        }

        const event = typeof getRandomEvent === 'function' ? getRandomEvent() : null;
        console.log('Triggering event:', event);

        if (event) {
            this.game.showEventModal(event, node);
        } else {
            // 后备处理：如果随机池为空或出错
            console.warn('No event returned from pool');
            this.game.player.gold += 30;
            this.game.player.fateRing.exp += 15;
            Utils.showBattleLog('遭遇神秘迷雾... 捡到 30 灵石');

            if (this.game.showRewardModal) {
                this.game.showRewardModal(
                    '神秘迷雾',
                    '迷雾散去，你在地上发现了一些东西...\n获得 30 灵石\n获得 15 命环经验',
                    '🌫️',
                    () => {
                        this.completeNode(node);
                    }
                );
            } else {
                this.completeNode(node);
            }
        }
    }

    // 显示事件弹窗 - 由game.js处理
    showEventModal(event, node) {
        this.game.showEventModal(event, node);
    }

    // 事件奖励
    eventReward(type) {
        this.game.player.gold += 50;
        Utils.showBattleLog('获得 50 灵石！');
    }

    // 事件治疗NPC
    eventHealNpc(node) {
        this.game.player.currentHp = Math.max(1, this.game.player.currentHp - 10);
        this.game.player.gold += 80;
        Utils.showBattleLog('修士感谢你的帮助，赠送 80 灵石');
        this.completeNode(node);
    }

    // 事件祭坛
    eventAltar(node) {
        this.game.player.currentHp = Math.max(1, this.game.player.currentHp - 10);
        this.game.player.fateRing.exp += 30;
        Utils.showBattleLog('命环获得神秘力量，经验+30');
        this.completeNode(node);
    }

    // 打开商店
    openShop(node) {
        this.game.currentBattleNode = node;
        this.game.showShop(node);
    }

    // 锻造节点：消耗灵石强化构筑
    openForgeNode(node) {
        const player = this.game.player;
        const forgeDiscount = player && player.legacyBonuses ? (player.legacyBonuses.forgeCostDiscount || 0) : 0;
        const discountMul = 1 - Math.min(0.35, forgeDiscount);
        const forgeCost = Math.max(20, Math.floor((55 + player.realm * 9) * discountMul));
        const premiumCost = forgeCost + 50;
        const temperCost = Math.max(30, Math.floor(forgeCost * 0.6));

        if (this.game && typeof this.game.handleRunPathProgress === 'function') {
            this.game.handleRunPathProgress('strategicNodeVisit', 1, { nodeType: 'forge' });
        }

        if (this.game && typeof this.game.showForgeChoiceModal === 'function') {
            this.game.showForgeChoiceModal(node, { forgeCost, premiumCost, temperCost });
            return;
        }

        // Fallback: if modal API missing, use balanced default choice.
        this.applyForgeChoice(node, 'steady', { forgeCost, premiumCost, temperCost });
    }

    openObservatoryNode(node) {
        this.game.currentBattleNode = node;
        if (this.game && typeof this.game.handleRunPathProgress === 'function') {
            this.game.handleRunPathProgress('strategicNodeVisit', 1, { nodeType: 'observatory' });
        }
        if (this.game && typeof this.game.showObservatoryNode === 'function') {
            this.game.showObservatoryNode(node);
            return;
        }
        this.completeNode(node);
    }

    openSpiritGrottoNode(node) {
        this.game.currentBattleNode = node;
        if (this.game && typeof this.game.handleRunPathProgress === 'function') {
            this.game.handleRunPathProgress('strategicNodeVisit', 1, { nodeType: 'spirit_grotto' });
        }
        if (this.game && typeof this.game.showSpiritGrottoNode === 'function') {
            this.game.showSpiritGrottoNode(node);
            return;
        }
        this.completeNode(node);
    }

    openForbiddenAltarNode(node) {
        this.game.currentBattleNode = node;
        if (this.game && typeof this.game.handleRunPathProgress === 'function') {
            this.game.handleRunPathProgress('strategicNodeVisit', 1, { nodeType: 'forbidden_altar' });
        }
        if (this.game && typeof this.game.showForbiddenAltarNode === 'function') {
            this.game.showForbiddenAltarNode(node);
            return;
        }
        this.completeNode(node);
    }

    openMemoryRiftNode(node) {
        this.game.currentBattleNode = node;
        if (this.game && typeof this.game.handleRunPathProgress === 'function') {
            this.game.handleRunPathProgress('strategicNodeVisit', 1, { nodeType: 'memory_rift' });
        }
        if (this.game && typeof this.game.showMemoryRiftNode === 'function') {
            this.game.showMemoryRiftNode(node);
            return;
        }
        this.completeNode(node);
    }

    pickAndUpgradeCards(count = 1) {
        const deck = this.game && this.game.player ? this.game.player.deck : [];
        const indexed = [];
        deck.forEach((card, index) => {
            if (typeof canUpgradeCard === 'function' && canUpgradeCard(card)) {
                indexed.push({ card, index });
            }
        });
        if (indexed.length === 0) return [];

        const shuffled = typeof Utils !== 'undefined' && Utils.shuffle
            ? Utils.shuffle(indexed.slice())
            : indexed.slice().sort(() => Math.random() - 0.5);
        const picked = shuffled.slice(0, Math.min(count, shuffled.length));
        const upgradedNames = [];

        picked.forEach(item => {
            const upgraded = upgradeCard(item.card);
            this.game.player.deck[item.index] = upgraded;
            upgradedNames.push(item.card.name);
        });

        return upgradedNames;
    }

    grantForgeFallbackExp(base = 10) {
        const player = this.game.player;
        const exp = base + player.realm * 2;
        player.fateRing.exp += exp;
        if (player.checkFateRingLevelUp) player.checkFateRingLevelUp();
        return exp;
    }

    applyForgeChoice(node, choice, costs = {}) {
        const player = this.game.player;
        const forgeCost = costs.forgeCost || (55 + player.realm * 9);
        const premiumCost = costs.premiumCost || (forgeCost + 50);
        const temperCost = costs.temperCost || Math.max(30, Math.floor(forgeCost * 0.6));
        const doctrine = player && player.legacyRunDoctrine ? player.legacyRunDoctrine : null;
        const hasFirstForgeBoost = !!(
            doctrine &&
            doctrine.firstForgeExtraUpgradeOnce > 0 &&
            !doctrine.firstForgeBoostUsed
        );
        const extraForgeUpgrade = hasFirstForgeBoost ? doctrine.firstForgeExtraUpgradeOnce : 0;
        const consumeForgeBoost = () => {
            if (hasFirstForgeBoost && doctrine) {
                doctrine.firstForgeBoostUsed = true;
                Utils.showBattleLog(`传承道统：首个锻炉额外强化 +${extraForgeUpgrade}`);
            }
        };

        if (choice === 'steady') {
            if (player.gold < forgeCost) {
                const exp = this.grantForgeFallbackExp(10);
                Utils.showBattleLog(`灵石不足，观摩锻纹：命环经验 +${exp}`);
                this.completeNode(node);
                return;
            }

            player.gold -= forgeCost;
            const upgradedNames = this.pickAndUpgradeCards(1 + extraForgeUpgrade);
            consumeForgeBoost();
            if (upgradedNames.length > 0) {
                Utils.showBattleLog(`精锻成功：${upgradedNames.join('、')} 得到强化`);
            } else {
                const refund = Math.floor(forgeCost * 0.75);
                player.gold += refund;
                const exp = this.grantForgeFallbackExp(12);
                Utils.showBattleLog(`无可强化卡牌，返还 ${refund} 灵石并获得 ${exp} 命环经验`);
            }
            if (this.game && typeof this.game.handleLegacyMissionProgress === 'function') {
                this.game.handleLegacyMissionProgress('forgeComplete', 1);
            }
            this.completeNode(node);
            return;
        }

        if (choice === 'overload') {
            if (player.gold < premiumCost) {
                const exp = this.grantForgeFallbackExp(8);
                Utils.showBattleLog(`灵石不足以过载锻造，观摩得悟：命环经验 +${exp}`);
                this.completeNode(node);
                return;
            }

            player.gold -= premiumCost;
            const upgradedNames = this.pickAndUpgradeCards(2 + extraForgeUpgrade);
            consumeForgeBoost();
            if (upgradedNames.length > 0) {
                Utils.showBattleLog(`过载锻造：${upgradedNames.join('、')} 获得强化`);
                const bonusExp = 15 + player.realm * 2;
                player.fateRing.exp += bonusExp;
                if (player.checkFateRingLevelUp) player.checkFateRingLevelUp();
                Utils.showBattleLog(`锻炉余辉：命环经验 +${bonusExp}`);
            } else {
                const refund = Math.floor(premiumCost * 0.6);
                player.gold += refund;
                Utils.showBattleLog(`过载失败：无可强化卡牌，返还 ${refund} 灵石`);
            }
            if (this.game && typeof this.game.handleLegacyMissionProgress === 'function') {
                this.game.handleLegacyMissionProgress('forgeComplete', 1);
            }
            this.completeNode(node);
            return;
        }

        if (choice === 'temper') {
            if (player.gold < temperCost) {
                const exp = this.grantForgeFallbackExp(8);
                Utils.showBattleLog(`灵石不足以拓印，观摩得悟：命环经验 +${exp}`);
                this.completeNode(node);
                return;
            }

            player.gold -= temperCost;
            consumeForgeBoost();
            const rarity = Math.random() < 0.7 ? 'uncommon' : 'rare';
            const card = getRandomCard(rarity, player.characterId);
            if (card) {
                player.addCardToDeck(card);
                Utils.showBattleLog(`淬灵拓印：获得 ${card.name}`);
            }
            const exp = 20 + player.realm * 3 + (extraForgeUpgrade * 8);
            player.fateRing.exp += exp;
            if (player.checkFateRingLevelUp) player.checkFateRingLevelUp();
            Utils.showBattleLog(`拓印感悟：命环经验 +${exp}`);
            if (this.game && typeof this.game.handleLegacyMissionProgress === 'function') {
                this.game.handleLegacyMissionProgress('forgeComplete', 1);
            }
            this.completeNode(node);
            return;
        }

        Utils.showBattleLog('你选择暂离锻炉，保留当前资源。');
        this.completeNode(node);
    }

    // 营地休息
    restAtCamp(node) {
        this.game.currentBattleNode = node;
        this.game.showCampfire(node);
    }

    // 完成节点
    completeNode(node) {
        // 标记当前节点为完成
        let nodeCompletedProcessing = false;

        for (const row of this.nodes) {
            for (const n of row) {
                if (n.id === node.id) {
                    if (n.completed) return; // Prevent double completion
                    n.completed = true;
                    this.completedNodes.push(n.id);
                    nodeCompletedProcessing = true;

                    // 检查是否完成本层（BOSS击败）
                    // 必须在这里检查，确保只触发一次
                    if (node.type === 'boss') {
                        this.game.onRealmComplete();
                    }
                }
            }
        }

        if (!nodeCompletedProcessing) return; // 如果没有找到对应节点或已处理，直接返回

        this.applyPathNodeSynergyReward(node);
        if (this.game && typeof this.game.recordStrategicNodeEngineering === 'function') {
            this.game.recordStrategicNodeEngineering(node?.type, {
                realm: this.game?.player?.realm || 0,
                nodeId: node?.id || ''
            });
        }
        const agendaProgress = this.game && typeof this.game.recordSanctumAgendaNodeProgress === 'function'
            ? this.game.recordSanctumAgendaNodeProgress(node?.type, {
                realm: this.game?.player?.realm || 0,
                chapterIndex: this.game?.getExpeditionState?.()?.chapterIndex || 0,
                nodeId: node?.id || '',
                row: node?.row || 0
            })
            : null;

        // 解锁下一行节点
        const nextRow = node.row + 1;
        if (nextRow < this.nodes.length) {
            for (const n of this.nodes[nextRow]) {
                n.accessible = true;
            }
        }

        // V4.2 Persistence: Save progress immediately
        // We save to cache. The game loop or autosave will persist to localStorage.
        const cacheKey = (this.game && typeof this.game.getMapCacheKey === 'function')
            ? this.game.getMapCacheKey(this.game.player.realm)
            : this.game.player.realm;
        this.saveStateToCache(cacheKey);
        if (agendaProgress && this.game && typeof this.game.autoSave === 'function') {
            this.game.autoSave();
        }

        this.render();
    }

    // 获取当前可访问节点
    getAccessibleNodes() {
        const accessible = [];
        for (const row of this.nodes) {
            for (const node of row) {
                if (node.accessible && !node.completed) {
                    accessible.push(node);
                }
            }
        }
        return accessible;
    }


}
