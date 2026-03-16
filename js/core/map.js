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

        // Update Node Classes
        this.nodes.forEach(row => {
            row.forEach(node => {
                const el = document.querySelector(`.map-node-v3[data-node-id="${node.id}"]`);
                if (el) {
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

        // V3 Flexbox Layout System (Centered & Robust)
        this.nodes.forEach((rowNodes, rowIndex) => {
            const rowEl = document.createElement('div');
            rowEl.className = 'node-row-v3';
            rowEl.dataset.rowIndex = rowIndex;
            // Flex layout handles positioning automatically via justify-content: center

            rowNodes.forEach((node, i) => {
                const nodeEl = document.createElement('div');
                nodeEl.className = `map-node-v3 ${node.type}`;
                nodeEl.dataset.nodeId = node.id;

                nodeEl.innerHTML = `
                    <div class="node-icon">${node.icon}</div>
                    ${node.polluted ? '<div class="pollution-mark">☠️</div>' : ''}
                    <div class="node-tooltip">${this.getNodeTooltip(node.type)}${node.polluted ? '<br><span style="color:#ff4444">[煞气激荡] 此处灵脉受损，不可恢复生命，且能量消耗增加。</span>' : ''}</div>
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

    updateChapterBriefPanel() {
        const panel = document.getElementById('map-chapter-brief');
        if (!panel || !this.game || !this.game.player || typeof this.game.getChapterDisplaySnapshot !== 'function') {
            return;
        }

        const chapter = this.game.getChapterDisplaySnapshot(this.game.player.realm);
        if (!chapter) {
            panel.style.display = 'none';
            panel.innerHTML = '';
            return;
        }

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
        const specialWarnings = Array.from(new Set(
            accessibleNodes
                .map((node) => specialLabelMap[node?.type] || null)
                .filter(Boolean)
        )).slice(0, 3);

        const bossInfo = this.game && typeof this.game.getRealmBossInfo === 'function'
            ? this.game.getRealmBossInfo(this.game.player.realm)
            : null;
        const bossLine = bossInfo && bossInfo.bossName
            ? `${bossInfo.bossName}${chapter.bossPrompt ? ` · ${chapter.bossPrompt}` : ''}`
            : (chapter.bossPrompt || '本章主宰尚未显形。');

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
                <span class="chapter-line-label">主宰</span>
                <span class="chapter-line-value">${bossLine}</span>
            </div>
            <div class="chapter-brief-chip-row">
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
            chapter.bossPrompt || ''
        ].filter(Boolean).join(' ｜ ');
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
            ? `${seasonProfile.desc || ''}｜季签：${seasonProfile.directiveName} · ${seasonProfile.directiveDesc || '保持稳态推进。'}`
            : '赛季尚未激活，等待进入无尽轮回后自动加载。';
        const seasonClears = Math.max(0, Math.floor(Number(state?.seasonCycleClears) || 0));
        const seasonBosses = Math.max(0, Math.floor(Number(state?.seasonBossDefeated) || 0));
        const seasonScore = Math.max(0, Math.floor(Number(state?.seasonScore) || 0));
        const seasonBestCycle = Math.max(1, Math.floor(Number(state?.seasonBestCycle) || 1));
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
            <div class="endless-theme-desc">${themeDesc}</div>
            <div class="endless-season-desc">${seasonDesc}</div>
            <div class="endless-season-ledger">赛季战绩：已通关 ${seasonClears} 轮 · 主宰 ${seasonBosses} · 赛季积分 ${seasonScore} · 最深第 ${seasonBestCycle} 轮</div>
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
