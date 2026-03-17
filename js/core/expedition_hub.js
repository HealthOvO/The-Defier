(function () {
    if (typeof Game === 'undefined') return;

    const ACTIVE_EXPEDITION_STATE_KEY = 'theDefierActiveExpeditionStateV1';
    const RUN_SLATE_ARCHIVE_KEY = 'theDefierRunSlateArchiveV1';
    const MAX_ACTIVE_BOUNTIES = 2;

    const originalStartRealm = Game.prototype.startRealm;
    const originalAdvanceToNextRealm = Game.prototype.advanceToNextRealm;
    const originalOnBattleWon = Game.prototype.onBattleWon;
    const originalOnBattleLost = Game.prototype.onBattleLost;
    const originalOnRealmComplete = Game.prototype.onRealmComplete;
    const originalStartBattle = Game.prototype.startBattle;
    const originalShowScreen = Game.prototype.showScreen;
    const originalRenderGameToText = Game.prototype.renderGameToText;
    const originalLoadGame = Game.prototype.loadGame;
    const originalClearSave = Game.prototype.clearSave;
    const originalGetBuildSnapshotData = Game.prototype.getBuildSnapshotData;
    const originalGetSanctumOverviewData = Game.prototype.getSanctumOverviewData;

    const originalMapRender = typeof GameMap !== 'undefined' && GameMap?.prototype
        ? GameMap.prototype.render
        : null;
    const originalMapUpdateState = typeof GameMap !== 'undefined' && GameMap?.prototype
        ? GameMap.prototype.updateMapState
        : null;
    const originalMapOnNodeClick = typeof GameMap !== 'undefined' && GameMap?.prototype
        ? GameMap.prototype.onNodeClick
        : null;

    const safeNumber = (value, fallback = 0) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    };

    const clampInt = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
        const num = Math.floor(safeNumber(value, min));
        return Math.max(min, Math.min(max, num));
    };

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const clone = (value) => {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            if (Array.isArray(value)) return value.slice();
            if (value && typeof value === 'object') return { ...value };
            return value;
        }
    };

    const hashString = (value = '') => {
        const text = String(value || '');
        let hash = 0;
        for (let i = 0; i < text.length; i += 1) {
            hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
        }
        return hash >>> 0;
    };

    const getChapterIndexForRealm = (realm) => Math.max(1, Math.min(6, Math.floor((Math.max(1, clampInt(realm, 1, 18)) - 1) / 3) + 1));

    const getChapterKey = (chapterIndex) => `chapter${clampInt(chapterIndex, 1, 6)}`;

    const pickUnique = (list, count, seed = 0) => {
        const source = Array.isArray(list) ? list.filter(Boolean) : [];
        const pool = source
            .map((item, index) => ({
                item,
                weight: hashString(`${seed}:${item.id || item.name || index}`),
                index
            }))
            .sort((a, b) => a.weight - b.weight || a.index - b.index)
            .map((entry) => entry.item);
        return pool.slice(0, Math.max(0, count));
    };

    const readArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

    const normalizeReward = (reward = null) => {
        const source = reward && typeof reward === 'object' ? reward : {};
        return {
            score: clampInt(source.score, 0, 9999),
            gold: clampInt(source.gold, 0, 99999),
            ringExp: clampInt(source.ringExp, 0, 99999),
            heavenlyInsight: clampInt(source.heavenlyInsight, 0, 99),
            karma: clampInt(source.karma, 0, 99)
        };
    };

    const normalizeObservatoryLinkReward = (reward = null) => {
        const source = reward && typeof reward === 'object' ? reward : {};
        const base = normalizeReward(source);
        return {
            ...base,
            block: clampInt(source.block, 0, 99),
            heal: clampInt(source.heal, 0, 999),
            energy: clampInt(source.energy, 0, 9)
        };
    };

    const EXPEDITION_OBSERVATORY_BONUS_LIBRARY = {
        assault: [
            {
                id: 'oracle_assault_opening',
                label: '前压勘线',
                summary: '首次踏入敌阵 / 精英 / 试炼时，开场获得格挡 +6 与灵力 +1。',
                triggerType: 'battle_start',
                nodeTypes: ['enemy', 'elite', 'trial'],
                rewards: { block: 6, energy: 1 }
            },
            {
                id: 'oracle_assault_spoil',
                label: '破阵战利',
                summary: '首次踏入精英 / 试炼路线时，立即获得灵石 +18、命环经验 +10。',
                triggerType: 'node_visit',
                nodeTypes: ['elite', 'trial'],
                rewards: { gold: 18, ringExp: 10 }
            }
        ],
        bulwark: [
            {
                id: 'oracle_bulwark_shelter',
                label: '守线余裕',
                summary: '首次到达营地 / 商店 / 观星时，恢复 10 生命并获得天机 +1。',
                triggerType: 'node_visit',
                nodeTypes: ['rest', 'shop', 'observatory'],
                rewards: { heal: 10, heavenlyInsight: 1 }
            },
            {
                id: 'oracle_bulwark_guard',
                label: '护阵起手',
                summary: '首次敌人 / 精英 / 首领战开始时，开场获得格挡 +8。',
                triggerType: 'battle_start',
                nodeTypes: ['enemy', 'elite', 'boss'],
                rewards: { block: 8 }
            }
        ],
        forge: [
            {
                id: 'oracle_forge_cache',
                label: '器库折返',
                summary: '首次进入锻炉 / 商店时，立即获得灵石 +24 与命环经验 +12。',
                triggerType: 'node_visit',
                nodeTypes: ['forge', 'shop'],
                rewards: { gold: 24, ringExp: 12 }
            },
            {
                id: 'oracle_forge_tune',
                label: '器灵校准',
                summary: '首次精英 / 试炼战开始时，开场获得格挡 +4 与灵力 +1。',
                triggerType: 'battle_start',
                nodeTypes: ['elite', 'trial'],
                rewards: { block: 4, energy: 1 }
            }
        ],
        oracle: [
            {
                id: 'oracle_watch_route',
                label: '观星预案',
                summary: '首次到达观星 / 事件 / 记忆裂隙时，立即获得天机 +1 与命环经验 +10。',
                triggerType: 'node_visit',
                nodeTypes: ['observatory', 'event', 'memory_rift'],
                rewards: { heavenlyInsight: 1, ringExp: 10 }
            },
            {
                id: 'oracle_read_edge',
                label: '先机借势',
                summary: '首次敌人 / 试炼战开始时，开场获得灵力 +1。',
                triggerType: 'battle_start',
                nodeTypes: ['enemy', 'trial'],
                rewards: { energy: 1 }
            }
        ],
        tempo: [
            {
                id: 'oracle_tempo_loop',
                label: '节拍借力',
                summary: '首次敌人 / 灵契 / 事件路线触发时，立即获得命环经验 +8 与灵石 +12。',
                triggerType: 'node_visit',
                nodeTypes: ['enemy', 'spirit_grotto', 'event'],
                rewards: { ringExp: 8, gold: 12 }
            },
            {
                id: 'oracle_tempo_break',
                label: '中盘抢拍',
                summary: '首次敌人 / 精英战开始时，开场获得格挡 +4 与灵力 +1。',
                triggerType: 'battle_start',
                nodeTypes: ['enemy', 'elite'],
                rewards: { block: 4, energy: 1 }
            }
        ],
        marathon: [
            {
                id: 'oracle_marathon_study',
                label: '长线校读',
                summary: '首次观星 / 精英 / 试炼路线触发时，立即获得天机 +1 与命环经验 +12。',
                triggerType: 'node_visit',
                nodeTypes: ['observatory', 'elite', 'trial'],
                rewards: { heavenlyInsight: 1, ringExp: 12 }
            },
            {
                id: 'oracle_marathon_guard',
                label: '耐压起步',
                summary: '首次精英 / 首领战开始时，开场获得格挡 +6。',
                triggerType: 'battle_start',
                nodeTypes: ['elite', 'boss'],
                rewards: { block: 6 }
            }
        ]
    };

    const normalizeExpeditionObservatoryBonus = (bonus = null) => {
        const source = bonus && typeof bonus === 'object' ? bonus : {};
        return {
            id: String(source.id || ''),
            label: String(source.label || '观星加成'),
            summary: String(source.summary || ''),
            triggerType: String(source.triggerType || 'node_visit'),
            nodeTypes: readArray(source.nodeTypes).map((value) => String(value || '')).filter(Boolean).slice(0, 4),
            rewards: normalizeObservatoryLinkReward(source.rewards),
            consumed: !!source.consumed
        };
    };

    const normalizeExpeditionObservatoryLink = (link = null) => {
        const source = link && typeof link === 'object' ? link : null;
        if (!source || !source.sourceRecordId) return null;
        const recommendedBranches = readArray(source.recommendedBranches).map((entry) => ({
            id: String(entry.id || ''),
            name: String(entry.name || ''),
            matchCount: clampInt(entry.matchCount, 0, 9)
        })).filter((entry) => entry.id).slice(0, 3);
        return {
            sourceRecordId: String(source.sourceRecordId || ''),
            sourceTitle: String(source.sourceTitle || ''),
            sourceThemeKey: String(source.sourceThemeKey || 'assault'),
            sourceThemeLabel: String(source.sourceThemeLabel || '前压爆发'),
            sourceFeaturedTier: String(source.sourceFeaturedTier || ''),
            sourceFeaturedTags: readArray(source.sourceFeaturedTags).map((value) => String(value || '')).filter(Boolean).slice(0, 4),
            sourceSeedSignature: String(source.sourceSeedSignature || ''),
            sourceScore: clampInt(source.sourceScore, 0, 9999),
            preferredNodes: readArray(source.preferredNodes).map((value) => String(value || '')).filter(Boolean).slice(0, 4),
            expeditionNote: String(source.expeditionNote || ''),
            recommendedBranches,
            bonusOptions: readArray(source.bonusOptions).map((entry) => normalizeExpeditionObservatoryBonus(entry)).filter((entry) => entry.id).slice(0, 3),
            selectedBonusId: String(source.selectedBonusId || '')
        };
    };

    const getBountyProgressLabel = (bounty) => {
        if (!bounty) return '0/0';
        const condition = bounty.condition || {};
        if (condition.type === 'hpAboveOnBossWin') {
            const ratio = Math.round(Math.max(0, Math.min(1, safeNumber(condition.threshold, 0))) * 100);
            return `${clampInt(bounty.progress, 0, 1)}/1 · ≥${ratio}%`;
        }
        return `${clampInt(bounty.progress, 0, 999)}/${clampInt(condition.target, 1, 999)}`;
    };

    const getFactionStatusMeta = (stance = 0) => {
        if (stance >= 2) return { tone: 'allied', label: '结盟', nextHint: '已进入支援阈值' };
        if (stance <= -2) return { tone: 'hostile', label: '敌意', nextHint: '已进入敌意阈值' };
        if (stance > 0) return { tone: 'warm', label: '偏友', nextHint: `再 +${Math.max(1, 2 - stance)} 可结盟` };
        if (stance < 0) return { tone: 'cold', label: '偏冷', nextHint: `再 ${Math.max(1, Math.abs(-2 - stance))} 会敌对` };
        return { tone: 'neutral', label: '中立', nextHint: '等待本章立场变化' };
    };

    const NEMESIS_STATUS_META = {
        hunting: { tone: 'hunting', label: '追猎中', chip: '狩猎锁定' },
        recurring: { tone: 'recurring', label: '复现中', chip: '回返加压' },
        allied: { tone: 'allied', label: '投靠势力', chip: '势力合围' },
        guarding: { tone: 'guarding', label: '主宰护卫', chip: '护卫终局' },
        defeated: { tone: 'defeated', label: '已击破', chip: '猎线已结' },
        escaped: { tone: 'escaped', label: '已逃逸', chip: '风险外溢' },
        released: { tone: 'released', label: '已放走', chip: '留线观后' },
        traded: { tone: 'traded', label: '完成交易', chip: '以赏换路' },
        evolved: { tone: 'evolved', label: '仇敌进阶', chip: '后患升级' }
    };

    const ACTIVE_NEMESIS_STATUSES = ['hunting', 'recurring', 'allied', 'guarding'];
    const FINAL_NEMESIS_OUTCOMES = ['defeated', 'escaped', 'released', 'traded', 'evolved'];
    const ALL_NEMESIS_STATUSES = [...ACTIVE_NEMESIS_STATUSES, ...FINAL_NEMESIS_OUTCOMES];

    const normalizeNemesisStatus = (value = 'hunting') => (
        ALL_NEMESIS_STATUSES.includes(String(value || '').trim())
            ? String(value || '').trim()
            : 'hunting'
    );

    const normalizeNemesisVariant = (variant = null, index = 0) => {
        const source = variant && typeof variant === 'object' ? variant : {};
        return {
            id: String(source.id || `variant_${index}`),
            label: String(source.label || '追猎压制'),
            note: String(source.note || ''),
            hpMul: Math.max(1, safeNumber(source.hpMul, 1)),
            atkMul: Math.max(1, safeNumber(source.atkMul, 1)),
            titlePrefix: String(source.titlePrefix || '【仇敌】'),
            intentSuffix: String(source.intentSuffix || '仇敌压制')
        };
    };

    const getNemesisStatusMeta = (status = 'hunting') => (
        NEMESIS_STATUS_META[normalizeNemesisStatus(status)] || NEMESIS_STATUS_META.hunting
    );

    Game.prototype.loadActiveExpeditionState = function () {
        try {
            if (typeof localStorage === 'undefined') return null;
            const raw = localStorage.getItem(ACTIVE_EXPEDITION_STATE_KEY);
            return raw ? this.normalizeExpeditionState(JSON.parse(raw)) : null;
        } catch (error) {
            return null;
        }
    };

    Game.prototype.persistActiveExpeditionState = function () {
        try {
            if (typeof localStorage === 'undefined') return;
            if (!this.expeditionState) {
                localStorage.removeItem(ACTIVE_EXPEDITION_STATE_KEY);
                return;
            }
            localStorage.setItem(ACTIVE_EXPEDITION_STATE_KEY, JSON.stringify(this.expeditionState));
        } catch (error) {
            console.warn('Persist expedition state failed:', error);
        }
    };

    Game.prototype.loadRunSlateArchive = function () {
        try {
            if (typeof localStorage === 'undefined') return [];
            const raw = localStorage.getItem(RUN_SLATE_ARCHIVE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return this.normalizeRunSlateArchive(parsed);
        } catch (error) {
            return [];
        }
    };

    Game.prototype.persistRunSlateArchive = function () {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(RUN_SLATE_ARCHIVE_KEY, JSON.stringify(this.runSlateArchive || []));
        } catch (error) {
            console.warn('Persist run slate archive failed:', error);
        }
    };

    Game.prototype.normalizeRunSlateArchive = function (rawArchive = null) {
        const source = Array.isArray(rawArchive) ? rawArchive : [];
        return source
            .filter((entry) => entry && typeof entry === 'object')
            .map((entry) => ({
                id: String(entry.id || ''),
                chapterIndex: clampInt(entry.chapterIndex, 1, 6),
                chapterName: String(entry.chapterName || ''),
                endingId: String(entry.endingId || ''),
                endingName: String(entry.endingName || ''),
                endingIcon: String(entry.endingIcon || '🧭'),
                score: clampInt(entry.score, 0, 9999),
                scoreBreakdown: Array.isArray(entry.scoreBreakdown) ? entry.scoreBreakdown.map((line) => String(line || '')).filter(Boolean).slice(0, 6) : [],
                branchName: String(entry.branchName || ''),
                bountyNames: Array.isArray(entry.bountyNames) ? entry.bountyNames.map((line) => String(line || '')).filter(Boolean).slice(0, 4) : [],
                factionSummary: Array.isArray(entry.factionSummary) ? entry.factionSummary.map((line) => String(line || '')).filter(Boolean).slice(0, 4) : [],
                nemesisName: String(entry.nemesisName || ''),
                nemesisStatus: normalizeNemesisStatus(entry.nemesisStatus || ''),
                nemesisStatusLabel: String(entry.nemesisStatusLabel || getNemesisStatusMeta(entry.nemesisStatus).label),
                nemesisVariantLabel: String(entry.nemesisVariantLabel || ''),
                nemesisFactionName: String(entry.nemesisFactionName || ''),
                nemesisClueLine: String(entry.nemesisClueLine || ''),
                tags: Array.isArray(entry.tags) ? entry.tags.map((line) => String(line || '')).filter(Boolean).slice(0, 8) : [],
                timestamp: clampInt(entry.timestamp, 0)
            }))
            .sort((a, b) => clampInt(b.timestamp, 0) - clampInt(a.timestamp, 0))
            .slice(0, 16);
    };

    Game.prototype.normalizeExpeditionState = function (rawState = null) {
        const source = rawState && typeof rawState === 'object' ? rawState : {};
        const stats = source.stats && typeof source.stats === 'object' ? source.stats : {};
        const bountyDraft = readArray(source.bountyDraft).map((entry) => {
            const condition = entry.condition && typeof entry.condition === 'object' ? entry.condition : {};
            return {
                id: String(entry.id || ''),
                name: String(entry.name || ''),
                icon: String(entry.icon || '✦'),
                type: String(entry.type || 'battle'),
                summary: String(entry.summary || ''),
                routeHint: String(entry.routeHint || ''),
                riskHint: String(entry.riskHint || ''),
                chapters: readArray(entry.chapters).map((value) => clampInt(value, 1, 6)),
                condition: {
                    type: String(condition.type || 'battleWins'),
                    target: clampInt(condition.target, 1, 999),
                    nodeType: String(condition.nodeType || ''),
                    threshold: Math.max(0, Math.min(1, safeNumber(condition.threshold, 0)))
                },
                reward: normalizeReward(entry.reward),
                progress: clampInt(entry.progress, 0, 999),
                completed: !!entry.completed,
                rewardGranted: !!entry.rewardGranted
            };
        }).filter((entry) => entry.id);
        const branchOptions = readArray(source.branchOptions).map((entry) => ({
            id: String(entry.id || ''),
            chapterIndex: clampInt(entry.chapterIndex, 1, 6),
            icon: String(entry.icon || '🧭'),
            name: String(entry.name || ''),
            tone: String(entry.tone || ''),
            summary: String(entry.summary || ''),
            reward: String(entry.reward || ''),
            risk: String(entry.risk || ''),
            nodeBias: readArray(entry.nodeBias).map((value) => String(value || '')).filter(Boolean).slice(0, 4),
            factionImpact: entry.factionImpact && typeof entry.factionImpact === 'object' ? clone(entry.factionImpact) : {}
        })).filter((entry) => entry.id);
        const factions = readArray(source.factions).map((entry) => ({
            id: String(entry.id || ''),
            icon: String(entry.icon || '✦'),
            name: String(entry.name || ''),
            agenda: String(entry.agenda || ''),
            likes: readArray(entry.likes).map((value) => String(value || '')).filter(Boolean).slice(0, 5),
            dislikes: readArray(entry.dislikes).map((value) => String(value || '')).filter(Boolean).slice(0, 5),
            supportNodeTypes: readArray(entry.supportNodeTypes).map((value) => String(value || '')).filter(Boolean).slice(0, 4),
            pressureNodeTypes: readArray(entry.pressureNodeTypes).map((value) => String(value || '')).filter(Boolean).slice(0, 4),
            support: entry.support && typeof entry.support === 'object' ? clone(entry.support) : {},
            threat: entry.threat && typeof entry.threat === 'object' ? clone(entry.threat) : {},
            positiveLabel: String(entry.positiveLabel || '援护'),
            negativeLabel: String(entry.negativeLabel || '压制'),
            stance: clampInt(entry.stance, -3, 3),
            lastReason: String(entry.lastReason || '')
        })).filter((entry) => entry.id);
        const nemesisSource = source.activeNemesis && typeof source.activeNemesis === 'object' ? source.activeNemesis : {};
        return {
            realm: clampInt(source.realm, 1, 18),
            chapterIndex: clampInt(source.chapterIndex, 1, 6),
            chapterName: String(source.chapterName || ''),
            chapterFullName: String(source.chapterFullName || ''),
            selectedBranchId: String(source.selectedBranchId || ''),
            branchSelectionLocked: !!source.branchSelectionLocked,
            branchOptions,
            bountyDraft,
            activeBountyIds: readArray(source.activeBountyIds).map((value) => String(value || '')).filter(Boolean).slice(0, MAX_ACTIVE_BOUNTIES),
            observatoryLink: normalizeExpeditionObservatoryLink(source.observatoryLink),
            factions,
            activeNemesis: nemesisSource.id ? {
                id: String(nemesisSource.id || ''),
                icon: String(nemesisSource.icon || '⚔️'),
                name: String(nemesisSource.name || ''),
                epithet: String(nemesisSource.epithet || ''),
                intro: String(nemesisSource.intro || ''),
                clueLine: String(nemesisSource.clueLine || ''),
                clueRevealed: !!nemesisSource.clueRevealed,
                clueNodeTypes: readArray(nemesisSource.clueNodeTypes).map((value) => String(value || '')).filter(Boolean).slice(0, 4),
                triggerNodeTypes: readArray(nemesisSource.triggerNodeTypes).map((value) => String(value || '')).filter(Boolean).slice(0, 4),
                recursOnVictoryNodeTypes: readArray(nemesisSource.recursOnVictoryNodeTypes).map((value) => String(value || '')).filter(Boolean).slice(0, 3),
                releaseNodeTypes: readArray(nemesisSource.releaseNodeTypes).map((value) => String(value || '')).filter(Boolean).slice(0, 3),
                tradeNodeTypes: readArray(nemesisSource.tradeNodeTypes).map((value) => String(value || '')).filter(Boolean).slice(0, 3),
                alliedFactionHints: readArray(nemesisSource.alliedFactionHints).map((value) => String(value || '')).filter(Boolean).slice(0, 3),
                battleVariants: readArray(nemesisSource.battleVariants).map((entry, index) => normalizeNemesisVariant(entry, index)).slice(0, 4),
                currentVariantId: String(nemesisSource.currentVariantId || ''),
                hpMul: Math.max(1, safeNumber(nemesisSource.hpMul, 1)),
                atkMul: Math.max(1, safeNumber(nemesisSource.atkMul, 1)),
                reward: normalizeReward(nemesisSource.reward),
                resolvedReward: normalizeReward(nemesisSource.resolvedReward),
                status: normalizeNemesisStatus(nemesisSource.status),
                fateOutcome: normalizeNemesisStatus(nemesisSource.fateOutcome || nemesisSource.status),
                engaged: !!nemesisSource.engaged,
                engagedCount: clampInt(nemesisSource.engagedCount, 0, 99),
                recurrenceCount: clampInt(nemesisSource.recurrenceCount, 0, 9),
                alliedFactionId: String(nemesisSource.alliedFactionId || ''),
                alliedFactionName: String(nemesisSource.alliedFactionName || ''),
                outcomeNote: String(nemesisSource.outcomeNote || ''),
                rewardGranted: !!nemesisSource.rewardGranted,
                bossGuardEligible: nemesisSource.bossGuardEligible !== false,
                lastEncounterNodeType: String(nemesisSource.lastEncounterNodeType || '')
            } : null,
            stats: {
                battleWins: clampInt(stats.battleWins, 0, 999),
                eliteWins: clampInt(stats.eliteWins, 0, 999),
                bossWins: clampInt(stats.bossWins, 0, 999),
                noRest: stats.noRest !== false,
                highestHpRatio: Math.max(0, Math.min(1, safeNumber(stats.highestHpRatio, 1))),
                currentHpRatio: Math.max(0, Math.min(1, safeNumber(stats.currentHpRatio, 1))),
                selectedBranchName: String(stats.selectedBranchName || ''),
                completedBounties: clampInt(stats.completedBounties, 0, 99),
                nodeVisits: {
                    enemy: clampInt(stats.nodeVisits?.enemy, 0, 999),
                    elite: clampInt(stats.nodeVisits?.elite, 0, 999),
                    boss: clampInt(stats.nodeVisits?.boss, 0, 999),
                    event: clampInt(stats.nodeVisits?.event, 0, 999),
                    shop: clampInt(stats.nodeVisits?.shop, 0, 999),
                    rest: clampInt(stats.nodeVisits?.rest, 0, 999),
                    trial: clampInt(stats.nodeVisits?.trial, 0, 999),
                    forge: clampInt(stats.nodeVisits?.forge, 0, 999),
                    observatory: clampInt(stats.nodeVisits?.observatory, 0, 999),
                    spirit_grotto: clampInt(stats.nodeVisits?.spirit_grotto, 0, 999),
                    forbidden_altar: clampInt(stats.nodeVisits?.forbidden_altar, 0, 999),
                    memory_rift: clampInt(stats.nodeVisits?.memory_rift, 0, 999)
                }
            }
        };
    };

    Game.prototype.ensureExpeditionBootState = function () {
        if (!Array.isArray(this.runSlateArchive)) {
            this.runSlateArchive = this.loadRunSlateArchive();
        }
        if (!this.expeditionState || typeof this.expeditionState !== 'object') {
            this.expeditionState = this.loadActiveExpeditionState();
        } else {
            this.expeditionState = this.normalizeExpeditionState(this.expeditionState);
        }
    };

    Game.prototype.getExpeditionState = function () {
        this.ensureExpeditionBootState();
        return this.expeditionState ? this.normalizeExpeditionState(this.expeditionState) : null;
    };

    Game.prototype.getExpeditionBranchPool = function (chapterIndex = 1) {
        const pool = (typeof EXPEDITION_BRANCH_REGIONS !== 'undefined' && EXPEDITION_BRANCH_REGIONS)
            ? EXPEDITION_BRANCH_REGIONS[getChapterKey(chapterIndex)]
            : [];
        return readArray(pool).map((entry) => clone(entry));
    };

    Game.prototype.getExpeditionFactionPool = function () {
        const source = (typeof EXPEDITION_FACTION_PROFILES !== 'undefined' && EXPEDITION_FACTION_PROFILES)
            ? EXPEDITION_FACTION_PROFILES
            : {};
        return Object.values(source || {}).filter(Boolean).map((entry) => clone(entry));
    };

    Game.prototype.getExpeditionNemesisPool = function (chapterIndex = 1) {
        const source = (typeof EXPEDITION_NEMESIS_PROFILES !== 'undefined' && EXPEDITION_NEMESIS_PROFILES)
            ? EXPEDITION_NEMESIS_PROFILES[getChapterKey(chapterIndex)]
            : [];
        return readArray(source).map((entry) => clone(entry));
    };

    Game.prototype.getExpeditionBountyPool = function (chapterIndex = 1) {
        const source = (typeof EXPEDITION_BOUNTY_TEMPLATES !== 'undefined' && Array.isArray(EXPEDITION_BOUNTY_TEMPLATES))
            ? EXPEDITION_BOUNTY_TEMPLATES
            : [];
        return source
            .filter((entry) => !Array.isArray(entry?.chapters) || entry.chapters.includes(chapterIndex))
            .map((entry) => clone(entry));
    };

    Game.prototype.buildExpeditionObservatoryBonusOptions = function (guide = null) {
        const themeKey = String(guide?.themeKey || 'assault');
        const source = EXPEDITION_OBSERVATORY_BONUS_LIBRARY[themeKey] || EXPEDITION_OBSERVATORY_BONUS_LIBRARY.assault;
        return source.map((entry) => normalizeExpeditionObservatoryBonus(entry)).slice(0, 2);
    };

    Game.prototype.buildExpeditionObservatoryLink = function (realm = 1, branchOptions = []) {
        if (typeof this.getSelectedObservatoryExpeditionGuide !== 'function') return null;
        const guide = this.getSelectedObservatoryExpeditionGuide({ silentSync: true });
        if (!guide) return null;
        const sourceBranches = Array.isArray(branchOptions) && branchOptions.length > 0
            ? branchOptions
            : this.getExpeditionBranchPool(getChapterIndexForRealm(realm));
        const preferredNodes = readArray(guide.preferredNodes);
        const recommendedBranches = sourceBranches
            .map((entry) => ({
                id: String(entry.id || ''),
                name: String(entry.name || ''),
                matchCount: readArray(entry.nodeBias).filter((nodeType) => preferredNodes.includes(nodeType)).length
            }))
            .filter((entry) => entry.id && entry.matchCount > 0)
            .sort((a, b) => b.matchCount - a.matchCount || a.name.localeCompare(b.name, 'zh-Hans-CN'))
            .slice(0, 3);
        return normalizeExpeditionObservatoryLink({
            sourceRecordId: guide.id,
            sourceTitle: guide.title,
            sourceThemeKey: guide.themeKey,
            sourceThemeLabel: guide.themeLabel,
            sourceFeaturedTier: guide.featuredTier,
            sourceFeaturedTags: guide.featuredTags,
            sourceSeedSignature: guide.seedSignature,
            sourceScore: guide.score,
            preferredNodes,
            expeditionNote: guide.expeditionNote,
            recommendedBranches,
            bonusOptions: this.buildExpeditionObservatoryBonusOptions(guide),
            selectedBonusId: ''
        });
    };

    Game.prototype.getSelectedExpeditionObservatoryBonus = function (state = null) {
        const source = state || this.getExpeditionState();
        const link = source?.observatoryLink;
        if (!link || !link.selectedBonusId) return null;
        return readArray(link.bonusOptions).find((entry) => entry.id === link.selectedBonusId) || null;
    };

    Game.prototype.isExpeditionRecommendedBranch = function (state = null, branchId = '') {
        const source = state || this.getExpeditionState();
        if (!source?.observatoryLink || !branchId) return false;
        return readArray(source.observatoryLink.recommendedBranches).some((entry) => entry.id === branchId);
    };

    Game.prototype.selectExpeditionObservatoryBonus = function (bonusId = '') {
        const state = this.getExpeditionState();
        if (!state?.observatoryLink) return false;
        if (state.observatoryLink.selectedBonusId) {
            if (typeof Utils !== 'undefined' && Utils?.showBattleLog) {
                Utils.showBattleLog('本章的观星线索已经锁定，无法再切换 bonus。');
            }
            return false;
        }
        const target = readArray(state.observatoryLink.bonusOptions).find((entry) => entry.id === String(bonusId || ''));
        if (!target) return false;
        state.observatoryLink.selectedBonusId = target.id;
        this.expeditionState = state;
        this.persistActiveExpeditionState();
        this.renderExpeditionMapPanels();
        if (typeof Utils !== 'undefined' && Utils?.showBattleLog) {
            Utils.showBattleLog(`【观星线索】已启用「${target.label}」，本章会按精选命盘给出小幅支援。`);
        }
        return true;
    };

    Game.prototype.grantExpeditionObservatoryReward = function (reward = null, label = '') {
        if (!this.player) return normalizeObservatoryLinkReward(reward);
        const resolved = normalizeObservatoryLinkReward(reward);
        if (resolved.gold > 0) this.player.gold += resolved.gold;
        if (resolved.heavenlyInsight > 0) {
            this.player.heavenlyInsight = clampInt((this.player.heavenlyInsight || 0) + resolved.heavenlyInsight, 0, 999);
        }
        if (resolved.karma > 0) {
            this.player.karma = clampInt((this.player.karma || 0) + resolved.karma, 0, 999);
        }
        if (resolved.ringExp > 0 && this.player.fateRing) {
            this.player.fateRing.exp = clampInt((this.player.fateRing.exp || 0) + resolved.ringExp, 0, 999999);
            if (typeof this.player.checkFateRingLevelUp === 'function') {
                this.player.checkFateRingLevelUp();
            }
        }
        if (resolved.block > 0 && typeof this.player.addBlock === 'function') {
            this.player.addBlock(resolved.block);
        }
        if (resolved.heal > 0) {
            if (typeof this.player.heal === 'function') {
                this.player.heal(resolved.heal);
            } else {
                this.player.currentHp = Math.min(safeNumber(this.player.maxHp, 0), safeNumber(this.player.currentHp, 0) + resolved.heal);
            }
        }
        if (resolved.energy > 0) {
            this.player.currentEnergy = clampInt((this.player.currentEnergy || 0) + resolved.energy, 0, 99);
        }
        if (typeof this.updatePlayerDisplay === 'function') {
            this.updatePlayerDisplay();
        }
        if (typeof Utils !== 'undefined' && Utils?.showBattleLog) {
            const parts = [];
            if (resolved.gold > 0) parts.push(`灵石 +${resolved.gold}`);
            if (resolved.ringExp > 0) parts.push(`命环经验 +${resolved.ringExp}`);
            if (resolved.heavenlyInsight > 0) parts.push(`天机 +${resolved.heavenlyInsight}`);
            if (resolved.karma > 0) parts.push(`业果 +${resolved.karma}`);
            if (resolved.block > 0) parts.push(`格挡 +${resolved.block}`);
            if (resolved.heal > 0) parts.push(`恢复 ${resolved.heal}`);
            if (resolved.energy > 0) parts.push(`灵力 +${resolved.energy}`);
            if (parts.length > 0) {
                Utils.showBattleLog(`【观星线索】${label || '样本加成'}：${parts.join(' / ')}`);
            }
        }
        return resolved;
    };

    Game.prototype.consumeExpeditionObservatoryBonus = function (state = null, triggerType = 'node_visit', nodeType = '') {
        const source = state || this.getExpeditionState();
        const link = source?.observatoryLink;
        if (!link || !link.selectedBonusId) return source;
        const target = readArray(link.bonusOptions).find((entry) => entry.id === link.selectedBonusId);
        if (!target || target.consumed || target.triggerType !== triggerType) return source;
        if (target.nodeTypes.length > 0 && !target.nodeTypes.includes(String(nodeType || ''))) return source;
        target.consumed = true;
        this.grantExpeditionObservatoryReward(target.rewards, target.label);
        return source;
    };

    Game.prototype.getExpeditionFactionDisplayName = function (state = null, factionId = '') {
        const source = state || this.getExpeditionState();
        if (!source || !factionId) return '';
        return source.factions.find((entry) => entry.id === factionId)?.name || '';
    };

    Game.prototype.resolveExpeditionNemesisReward = function (nemesis = null, outcome = 'defeated') {
        const base = normalizeReward(nemesis?.reward);
        const normalizedOutcome = normalizeNemesisStatus(outcome);
        switch (normalizedOutcome) {
            case 'traded':
                return normalizeReward({
                    ...base,
                    score: Math.round(base.score * 0.72),
                    gold: Math.round(base.gold * 0.88) + 10,
                    ringExp: Math.round(base.ringExp * 0.42),
                    heavenlyInsight: 1
                });
            case 'released':
                return normalizeReward({
                    ...base,
                    score: Math.round(base.score * 0.58),
                    gold: Math.round(base.gold * 0.18),
                    ringExp: Math.round(base.ringExp * 0.78) + 6,
                    heavenlyInsight: 2
                });
            case 'escaped':
                return normalizeReward({
                    ...base,
                    score: Math.round(base.score * 0.2),
                    gold: 0,
                    ringExp: 0
                });
            case 'evolved':
                return normalizeReward({
                    ...base,
                    score: 0,
                    gold: 0,
                    ringExp: 0
                });
            case 'defeated':
            default:
                return base;
        }
    };

    Game.prototype.grantExpeditionNemesisReward = function (reward = null, status = 'defeated', silent = false) {
        if (!this.player) return normalizeReward(reward);
        const resolved = normalizeReward(reward);
        if (resolved.gold > 0) this.player.gold += resolved.gold;
        if (resolved.heavenlyInsight > 0) {
            this.player.heavenlyInsight = clampInt((this.player.heavenlyInsight || 0) + resolved.heavenlyInsight, 0, 999);
        }
        if (resolved.karma > 0) {
            this.player.karma = clampInt((this.player.karma || 0) + resolved.karma, 0, 999);
        }
        if (resolved.ringExp > 0 && this.player.fateRing) {
            this.player.fateRing.exp = clampInt((this.player.fateRing.exp || 0) + resolved.ringExp, 0, 999999);
            if (typeof this.player.checkFateRingLevelUp === 'function') {
                this.player.checkFateRingLevelUp();
            }
        }
        if (!silent && typeof Utils !== 'undefined' && Utils?.showBattleLog) {
            const parts = [];
            if (resolved.gold > 0) parts.push(`灵石 +${resolved.gold}`);
            if (resolved.ringExp > 0) parts.push(`命环经验 +${resolved.ringExp}`);
            if (resolved.heavenlyInsight > 0) parts.push(`天机 +${resolved.heavenlyInsight}`);
            if (resolved.karma > 0) parts.push(`业果 +${resolved.karma}`);
            if (parts.length > 0) {
                Utils.showBattleLog(`【仇敌结果】${getNemesisStatusMeta(status).label}：${parts.join(' / ')}`);
            }
        }
        return resolved;
    };

    Game.prototype.applyExpeditionNemesisOutcome = function (state = null, outcome = 'escaped', options = {}) {
        const source = state || this.getExpeditionState();
        if (!source || !source.activeNemesis) return source;
        const nemesis = source.activeNemesis;
        const normalizedOutcome = normalizeNemesisStatus(outcome);
        const meta = getNemesisStatusMeta(normalizedOutcome);
        nemesis.status = normalizedOutcome;
        nemesis.fateOutcome = normalizedOutcome;
        if (options.variantId) nemesis.currentVariantId = String(options.variantId || '');
        if (options.factionId) nemesis.alliedFactionId = String(options.factionId || '');
        if (options.factionName) nemesis.alliedFactionName = String(options.factionName || '');
        if (typeof options.note === 'string' && options.note) {
            nemesis.outcomeNote = options.note;
        }
        nemesis.engaged = false;
        nemesis.resolvedReward = this.resolveExpeditionNemesisReward(nemesis, normalizedOutcome);
        if (!nemesis.rewardGranted && ['defeated', 'traded', 'released'].includes(normalizedOutcome)) {
            nemesis.rewardGranted = true;
            this.grantExpeditionNemesisReward(nemesis.resolvedReward, normalizedOutcome, !!options.silent);
        }
        if (typeof this.recordCollectionUnlock === 'function') {
            this.recordCollectionUnlock('nemesis', {
                id: `nemesis:${nemesis.id}`,
                name: `仇敌留痕·${nemesis.name}`,
                icon: nemesis.icon || '🎯',
                note: options.note || `${meta.label}${nemesis.alliedFactionName ? ` · ${nemesis.alliedFactionName}` : ''}`
            });
        }
        if (!options.silent && typeof Utils !== 'undefined' && Utils?.showBattleLog) {
            Utils.showBattleLog(`【仇敌追猎】${nemesis.name}：${meta.label}${nemesis.alliedFactionName ? ` · ${nemesis.alliedFactionName}` : ''}`);
        }
        return source;
    };

    Game.prototype.chooseExpeditionNemesisVariant = function (state = null, nodeType = '') {
        const source = state || this.getExpeditionState();
        const nemesis = source?.activeNemesis;
        if (!nemesis) return normalizeNemesisVariant(null, 0);
        const variants = Array.isArray(nemesis.battleVariants) && nemesis.battleVariants.length > 0
            ? nemesis.battleVariants
            : [normalizeNemesisVariant(null, 0)];
        let targetId = 'hunt';
        if (nemesis.status === 'guarding' || (nodeType === 'boss' && nemesis.bossGuardEligible && (nemesis.engagedCount > 0 || nemesis.recurrenceCount > 0 || nemesis.status === 'allied'))) {
            targetId = 'guard';
        } else if (nemesis.status === 'allied') {
            targetId = 'allied';
        } else if (nemesis.status === 'recurring' || nemesis.recurrenceCount > 0) {
            targetId = 'recurrence';
        }
        return variants.find((entry) => entry.id === targetId)
            || variants[0]
            || normalizeNemesisVariant(null, 0);
    };

    Game.prototype.advanceExpeditionNemesisState = function (state = null, node = null, options = {}) {
        const source = state || this.getExpeditionState();
        if (!source || !source.activeNemesis) return source;
        const nemesis = source.activeNemesis;
        if (FINAL_NEMESIS_OUTCOMES.includes(nemesis.status)) return source;

        const nodeType = String(node?.type || '').trim();
        const branch = source.branchOptions.find((entry) => entry.id === source.selectedBranchId) || null;
        const branchId = String(branch?.id || '');
        const hostileFaction = source.factions
            .filter((entry) => entry.stance <= -2 && entry.pressureNodeTypes.includes(nodeType))
            .sort((a, b) => a.stance - b.stance)[0] || null;
        const caravan = source.factions.find((entry) => entry.id === 'caravan_union' && entry.stance >= 2) || null;
        const starSeers = source.factions.find((entry) => entry.id === 'star_seers' && entry.stance >= 2) || null;

        if (!nemesis.clueRevealed && nodeType && nemesis.clueLine && nemesis.clueNodeTypes.includes(nodeType)) {
            nemesis.clueRevealed = true;
            if (!options.silent && typeof Utils !== 'undefined' && Utils?.showBattleLog) {
                Utils.showBattleLog(`【仇敌线索】${nemesis.clueLine}`);
            }
        }

        const tradeEligible = caravan
            && nodeType
            && nemesis.tradeNodeTypes.includes(nodeType)
            && !nemesis.engaged
            && !nemesis.rewardGranted
            && (/market|dock|bazaar|vault/.test(branchId) || (source.stats.nodeVisits?.shop || 0) > 0);
        if (tradeEligible) {
            return this.applyExpeditionNemesisOutcome(source, 'traded', {
                factionId: caravan.id,
                factionName: caravan.name,
                note: `${caravan.name} 牵线把追猎线转成了黑市交易。`,
                silent: !!options.silent
            });
        }

        const releaseEligible = starSeers
            && nodeType
            && nemesis.releaseNodeTypes.includes(nodeType)
            && nemesis.clueRevealed
            && !nemesis.engaged
            && !nemesis.rewardGranted
            && (/spire|archive|orbit|atrium/.test(branchId) || (source.stats.nodeVisits?.observatory || 0) > 0);
        if (releaseEligible) {
            return this.applyExpeditionNemesisOutcome(source, 'released', {
                factionId: starSeers.id,
                factionName: starSeers.name,
                note: `${starSeers.name} 判定这条追猎线更适合留下观察。`,
                silent: !!options.silent
            });
        }

        if (hostileFaction && ['hunting', 'recurring'].includes(nemesis.status)) {
            nemesis.status = 'allied';
            nemesis.alliedFactionId = hostileFaction.id;
            nemesis.alliedFactionName = hostileFaction.name;
            nemesis.outcomeNote = `${hostileFaction.name} 开始为其提供掩护。`;
            if (!options.silent && typeof Utils !== 'undefined' && Utils?.showBattleLog) {
                Utils.showBattleLog(`【仇敌追猎】${nemesis.name} 已投靠 ${hostileFaction.name}。`);
            }
        }

        if (
            nodeType === 'boss'
            && nemesis.bossGuardEligible
            && ACTIVE_NEMESIS_STATUSES.includes(nemesis.status)
            && (nemesis.status === 'allied' || nemesis.engagedCount > 0 || nemesis.recurrenceCount > 0)
        ) {
            if (hostileFaction && !nemesis.alliedFactionId) {
                nemesis.alliedFactionId = hostileFaction.id;
                nemesis.alliedFactionName = hostileFaction.name;
            }
            nemesis.status = 'guarding';
            nemesis.outcomeNote = `${nemesis.name} 已作为终章护卫现身。`;
            if (!options.silent && typeof Utils !== 'undefined' && Utils?.showBattleLog) {
                Utils.showBattleLog(`【仇敌追猎】${nemesis.name} 成为了主宰护卫。`);
            }
        }

        return source;
    };

    Game.prototype.createExpeditionStateForRealm = function (realm = 1) {
        const safeRealm = clampInt(realm, 1, 18);
        const chapterIndex = getChapterIndexForRealm(safeRealm);
        const chapter = typeof this.getChapterDisplaySnapshot === 'function'
            ? this.getChapterDisplaySnapshot(safeRealm)
            : null;
        const seed = hashString([
            safeRealm,
            this.selectedCharacterId || this.player?.characterId || '',
            this.selectedRunDestinyId || this.player?.runDestiny?.id || '',
            this.selectedSpiritCompanionId || this.player?.spiritCompanion?.id || ''
        ].join(':'));

        const branchOptions = pickUnique(this.getExpeditionBranchPool(chapterIndex), 3, seed + 11);
        const bountyPool = this.getExpeditionBountyPool(chapterIndex);
        const preferredTypes = ['battle', 'route', 'extreme'];
        const bountyDraft = [];
        preferredTypes.forEach((type, index) => {
            const picked = pickUnique(bountyPool.filter((item) => item.type === type), 1, seed + 101 + index)[0];
            if (picked) bountyDraft.push(picked);
        });
        if (bountyDraft.length < 3) {
            pickUnique(bountyPool.filter((item) => !bountyDraft.find((picked) => picked.id === item.id)), 3 - bountyDraft.length, seed + 133)
                .forEach((item) => bountyDraft.push(item));
        }

        const factionPool = this.getExpeditionFactionPool();
        const factions = pickUnique(factionPool, 3, seed + 17).map((entry) => ({
            ...entry,
            stance: 0,
            lastReason: '本章初入，局势仍未定盘。'
        }));

        const activeNemesis = pickUnique(this.getExpeditionNemesisPool(chapterIndex), 1, seed + 29)[0] || null;
        const observatoryLink = this.buildExpeditionObservatoryLink(safeRealm, branchOptions);

        return this.normalizeExpeditionState({
            realm: safeRealm,
            chapterIndex,
            chapterName: chapter?.name || `第${chapterIndex}章`,
            chapterFullName: chapter?.fullName || `第${chapterIndex}章`,
            selectedBranchId: '',
            branchSelectionLocked: false,
            branchOptions,
            bountyDraft,
            activeBountyIds: [],
            observatoryLink,
            factions,
            activeNemesis: activeNemesis ? {
                ...activeNemesis,
                status: 'hunting',
                fateOutcome: 'hunting',
                clueRevealed: false,
                currentVariantId: 'hunt',
                engaged: false,
                engagedCount: 0,
                recurrenceCount: 0,
                alliedFactionId: '',
                alliedFactionName: '',
                outcomeNote: '',
                rewardGranted: false,
                resolvedReward: normalizeReward(activeNemesis.reward),
                lastEncounterNodeType: ''
            } : null,
            stats: {
                battleWins: 0,
                eliteWins: 0,
                bossWins: 0,
                noRest: true,
                highestHpRatio: this.player ? Math.max(0, Math.min(1, safeNumber(this.player.currentHp, 0) / Math.max(1, safeNumber(this.player.maxHp, 1)))) : 1,
                currentHpRatio: this.player ? Math.max(0, Math.min(1, safeNumber(this.player.currentHp, 0) / Math.max(1, safeNumber(this.player.maxHp, 1)))) : 1,
                selectedBranchName: '',
                completedBounties: 0,
                nodeVisits: {}
            }
        });
    };

    Game.prototype.initializeExpeditionForRealm = function (realm = 1, force = false) {
        this.ensureExpeditionBootState();
        const safeRealm = clampInt(realm, 1, 18);
        if (!force && this.expeditionState && clampInt(this.expeditionState.realm, 1, 18) === safeRealm) {
            this.expeditionState = this.normalizeExpeditionState(this.expeditionState);
            this.persistActiveExpeditionState();
            return this.expeditionState;
        }
        this.expeditionState = this.createExpeditionStateForRealm(safeRealm);
        this.persistActiveExpeditionState();
        return this.expeditionState;
    };

    Game.prototype.findExpeditionFaction = function (factionId = '') {
        const state = this.getExpeditionState();
        if (!state) return null;
        return state.factions.find((entry) => entry.id === factionId) || null;
    };

    Game.prototype.applyExpeditionFactionShift = function (factionId = '', delta = 0, reason = '', options = {}) {
        const state = this.getExpeditionState();
        if (!state || !factionId || !delta) return null;
        const target = state.factions.find((entry) => entry.id === factionId);
        if (!target) return null;
        target.stance = clampInt(target.stance + clampInt(delta, -3, 3), -3, 3);
        target.lastReason = String(reason || target.lastReason || '');
        this.expeditionState = state;
        this.persistActiveExpeditionState();
        if (!options.silent && typeof Utils !== 'undefined' && Utils?.showBattleLog) {
            Utils.showBattleLog(`【势力】${target.name}${delta > 0 ? '态度转暖' : '态度转冷'}：${target.lastReason}`);
        }
        return target;
    };

    Game.prototype.selectExpeditionBranch = function (branchId = '') {
        const state = this.getExpeditionState();
        if (!state) return false;
        const target = state.branchOptions.find((entry) => entry.id === branchId);
        if (!target) return false;
        state.selectedBranchId = target.id;
        state.stats.selectedBranchName = target.name;
        if (!state.branchSelectionLocked) {
            state.branchSelectionLocked = true;
            Object.keys(target.factionImpact || {}).forEach((factionId) => {
                const delta = clampInt(target.factionImpact[factionId], -2, 2);
                if (!delta) return;
                const faction = state.factions.find((entry) => entry.id === factionId);
                if (!faction) return;
                faction.stance = clampInt(faction.stance + delta, -3, 3);
                faction.lastReason = `你把本章路线锚定到「${target.name}」。`;
            });
            if (typeof Utils !== 'undefined' && Utils?.showBattleLog) {
                Utils.showBattleLog(`【裂界远征】已锁定支线区域：${target.name}`);
            }
        }
        this.expeditionState = state;
        this.persistActiveExpeditionState();
        this.refreshExpeditionProgress(true);
        this.renderExpeditionMapPanels();
        return true;
    };

    Game.prototype.toggleExpeditionBounty = function (bountyId = '') {
        const state = this.getExpeditionState();
        if (!state) return false;
        const bounty = state.bountyDraft.find((entry) => entry.id === bountyId);
        if (!bounty) return false;
        const activeIds = readArray(state.activeBountyIds);
        const exists = activeIds.includes(bountyId);
        if (exists) {
            state.activeBountyIds = activeIds.filter((id) => id !== bountyId);
        } else {
            if (activeIds.length >= MAX_ACTIVE_BOUNTIES) {
                if (typeof Utils !== 'undefined' && Utils?.showBattleLog) {
                    Utils.showBattleLog(`本章最多同时承接 ${MAX_ACTIVE_BOUNTIES} 条悬赏。`);
                }
                return false;
            }
            activeIds.push(bountyId);
            state.activeBountyIds = activeIds;
            if (typeof Utils !== 'undefined' && Utils?.showBattleLog) {
                Utils.showBattleLog(`【章节悬赏】已承接：${bounty.name}`);
            }
        }
        this.expeditionState = state;
        this.persistActiveExpeditionState();
        this.refreshExpeditionProgress(true);
        this.renderExpeditionMapPanels();
        return true;
    };

    Game.prototype.getActiveExpeditionBounties = function (state = null) {
        const source = state || this.getExpeditionState();
        if (!source) return [];
        return source.bountyDraft.filter((entry) => source.activeBountyIds.includes(entry.id));
    };

    Game.prototype.evaluateExpeditionBounty = function (bounty, state = null) {
        const source = state || this.getExpeditionState();
        if (!source || !bounty) return bounty;
        const stats = source.stats || {};
        const condition = bounty.condition || {};
        let progress = 0;
        let completed = false;
        switch (condition.type) {
            case 'battleWins':
                progress = clampInt(stats.battleWins, 0, condition.target || 1);
                completed = progress >= clampInt(condition.target, 1, 999);
                break;
            case 'eliteWins':
                progress = clampInt((stats.eliteWins || 0) + (stats.nodeVisits?.trial || 0), 0, condition.target || 1);
                completed = progress >= clampInt(condition.target, 1, 999);
                break;
            case 'visitNodeType':
                progress = clampInt(stats.nodeVisits?.[condition.nodeType] || 0, 0, condition.target || 1);
                completed = progress >= clampInt(condition.target, 1, 999);
                break;
            case 'noRestBossWin':
                progress = stats.noRest && clampInt(stats.bossWins, 0, 1) > 0 ? 1 : 0;
                completed = progress >= 1;
                break;
            case 'hpAboveOnBossWin':
                progress = clampInt(stats.bossWins, 0, 1) > 0 && safeNumber(stats.currentHpRatio, 0) >= safeNumber(condition.threshold, 0)
                    ? 1
                    : 0;
                completed = progress >= 1;
                break;
            default:
                progress = 0;
                completed = false;
                break;
        }
        return {
            ...bounty,
            progress,
            completed
        };
    };

    Game.prototype.grantExpeditionBountyReward = function (bounty, options = {}) {
        if (!bounty || !bounty.reward || !this.player) return;
        const reward = normalizeReward(bounty.reward);
        if (reward.gold > 0) this.player.gold += reward.gold;
        if (reward.heavenlyInsight > 0) this.player.heavenlyInsight = clampInt((this.player.heavenlyInsight || 0) + reward.heavenlyInsight, 0, 999);
        if (reward.karma > 0) this.player.karma = clampInt((this.player.karma || 0) + reward.karma, 0, 999);
        if (reward.ringExp > 0 && this.player.fateRing) {
            this.player.fateRing.exp = clampInt((this.player.fateRing.exp || 0) + reward.ringExp, 0, 999999);
            if (typeof this.player.checkFateRingLevelUp === 'function') {
                this.player.checkFateRingLevelUp();
            }
        }
        if (!options.silent && typeof Utils !== 'undefined' && Utils?.showBattleLog) {
            const parts = [];
            if (reward.gold > 0) parts.push(`灵石 +${reward.gold}`);
            if (reward.ringExp > 0) parts.push(`命环经验 +${reward.ringExp}`);
            if (reward.heavenlyInsight > 0) parts.push(`天机 +${reward.heavenlyInsight}`);
            if (reward.karma > 0) parts.push(`业果 +${reward.karma}`);
            Utils.showBattleLog(`【章节悬赏】${bounty.name} 已兑现：${parts.join(' / ')}`);
        }
    };

    Game.prototype.refreshExpeditionProgress = function (silent = false) {
        const state = this.getExpeditionState();
        if (!state) return null;
        const nextDraft = state.bountyDraft.map((entry) => {
            const updated = this.evaluateExpeditionBounty(entry, state);
            if (updated.completed && !entry.rewardGranted) {
                updated.rewardGranted = true;
                this.grantExpeditionBountyReward(updated, { silent });
            }
            return updated;
        });
        state.bountyDraft = nextDraft;
        state.stats.completedBounties = nextDraft.filter((entry) => entry.completed).length;
        state.stats.currentHpRatio = this.player
            ? Math.max(0, Math.min(1, safeNumber(this.player.currentHp, 0) / Math.max(1, safeNumber(this.player.maxHp, 1))))
            : safeNumber(state.stats.currentHpRatio, 0);
        state.stats.highestHpRatio = Math.max(safeNumber(state.stats.highestHpRatio, 0), safeNumber(state.stats.currentHpRatio, 0));
        this.expeditionState = state;
        this.persistActiveExpeditionState();
        return state;
    };

    Game.prototype.recordExpeditionNodeVisit = function (node = null) {
        const state = this.getExpeditionState();
        if (!state || !node || !node.type) return null;
        const type = String(node.type || '');
        state.stats.nodeVisits[type] = clampInt((state.stats.nodeVisits[type] || 0) + 1, 0, 999);
        if (type === 'rest') state.stats.noRest = false;
        if (this.player) {
            state.stats.currentHpRatio = Math.max(0, Math.min(1, safeNumber(this.player.currentHp, 0) / Math.max(1, safeNumber(this.player.maxHp, 1))));
        }
        state.factions.forEach((faction) => {
            if (faction.likes.includes(type)) {
                faction.stance = clampInt(faction.stance + 1, -3, 3);
                faction.lastReason = `你在本章推进了「${type}」相关路线。`;
            }
            if (faction.dislikes.includes(type)) {
                faction.stance = clampInt(faction.stance - 1, -3, 3);
                faction.lastReason = `你在本章触碰了他们不喜欢的节点。`;
            }
        });

        const friendlyMerchant = state.factions.find((entry) => entry.id === 'caravan_union' && entry.stance >= 2);
        if (type === 'shop' && friendlyMerchant && this.player) {
            this.player.gold += 24;
            if (typeof Utils !== 'undefined' && Utils?.showBattleLog) {
                Utils.showBattleLog(`【${friendlyMerchant.name}】商路返利：灵石 +24`);
            }
        }
        const friendlySeers = state.factions.find((entry) => entry.id === 'star_seers' && entry.stance >= 2);
        if ((type === 'observatory' || type === 'memory_rift') && friendlySeers && this.player) {
            this.player.heavenlyInsight = clampInt((this.player.heavenlyInsight || 0) + 1, 0, 999);
            if (typeof Utils !== 'undefined' && Utils?.showBattleLog) {
                Utils.showBattleLog(`【${friendlySeers.name}】观测加持：天机 +1`);
            }
        }
        const friendlyAsh = state.factions.find((entry) => entry.id === 'ash_covenant' && entry.stance >= 2);
        if (type === 'forbidden_altar' && friendlyAsh && this.player) {
            this.player.karma = clampInt((this.player.karma || 0) + 1, 0, 999);
            if (typeof Utils !== 'undefined' && Utils?.showBattleLog) {
                Utils.showBattleLog(`【${friendlyAsh.name}】烬誓回响：业果 +1`);
            }
        }

        this.consumeExpeditionObservatoryBonus(state, 'node_visit', type);
        this.advanceExpeditionNemesisState(state, { type }, { silent: false });

        this.expeditionState = state;
        this.refreshExpeditionProgress(true);
        this.renderExpeditionMapPanels();
        return state;
    };

    Game.prototype.applyExpeditionBattleModifiers = function (enemies = [], node = null) {
        const state = this.getExpeditionState();
        if (!state || !Array.isArray(enemies)) return enemies;
        const nodeType = String(node?.type || this.currentBattleNode?.type || '');
        let nextEnemies = enemies.map((enemy) => clone(enemy));

        const nemesis = state.activeNemesis;
        if (
            nemesis
            && ACTIVE_NEMESIS_STATUSES.includes(nemesis.status)
            && nemesis.triggerNodeTypes.includes(nodeType)
            && nextEnemies[0]
        ) {
            this.advanceExpeditionNemesisState(state, { type: nodeType }, { silent: true });
            const variant = this.chooseExpeditionNemesisVariant(state, nodeType);
            const target = nextEnemies[0];
            target.id = `nemesis_${nemesis.id}_${variant.id}_${target.id || 'enemy'}`;
            target.name = `${variant.titlePrefix || '【仇敌】'}${nemesis.name}${nemesis.alliedFactionName ? `·${nemesis.alliedFactionName}` : ''}·${target.name || '未知敌影'}`;
            target.maxHp = Math.max(1, Math.floor((target.maxHp || target.hp || 80) * nemesis.hpMul * variant.hpMul));
            target.hp = Math.max(1, Math.floor((target.hp || target.maxHp || 80) * nemesis.hpMul * variant.hpMul));
            target.currentHp = target.hp;
            target.patterns = Array.isArray(target.patterns)
                ? target.patterns.map((pattern) => {
                    const copied = { ...pattern };
                    if (copied.type === 'attack' || copied.type === 'multiAttack') {
                        copied.value = Math.max(1, Math.floor(safeNumber(copied.value, 0) * nemesis.atkMul * variant.atkMul));
                    }
                    copied.intent = copied.intent ? `${copied.intent} · ${variant.intentSuffix || '仇敌压制'}` : (variant.intentSuffix || '仇敌压制');
                    return copied;
                })
                : target.patterns;
            target.tacticalPlanLabel = `${nemesis.epithet || '仇敌追猎'} · ${variant.label || '追猎压制'}`;
            target.nemesisProfile = {
                id: nemesis.id,
                name: nemesis.name,
                status: nemesis.status,
                variantId: variant.id,
                variantLabel: variant.label
            };
            state.activeNemesis.engaged = true;
            state.activeNemesis.engagedCount = clampInt((state.activeNemesis.engagedCount || 0) + 1, 0, 99);
            state.activeNemesis.currentVariantId = variant.id;
            state.activeNemesis.lastEncounterNodeType = nodeType;
            if (typeof Utils !== 'undefined' && Utils?.showBattleLog) {
                Utils.showBattleLog(`【仇敌追猎】${nemesis.name} 以「${variant.label || '追猎压制'}」现身了。`);
            }
        }

        const hostileFactions = state.factions.filter((entry) => entry.stance <= -2 && entry.pressureNodeTypes.includes(nodeType));
        if (hostileFactions.length > 0) {
            const hpMul = hostileFactions.reduce((mul, entry) => mul * Math.max(1, safeNumber(entry.threat?.enemyHpMul, 1)), 1);
            const atkMul = hostileFactions.reduce((mul, entry) => mul * Math.max(1, safeNumber(entry.threat?.enemyAtkMul, 1)), 1);
            nextEnemies = nextEnemies.map((enemy, index) => {
                const copied = clone(enemy);
                copied.maxHp = Math.max(1, Math.floor((copied.maxHp || copied.hp || 80) * hpMul));
                copied.hp = Math.max(1, Math.floor((copied.hp || copied.maxHp || 80) * hpMul));
                copied.currentHp = copied.hp;
                copied.patterns = Array.isArray(copied.patterns)
                    ? copied.patterns.map((pattern) => {
                        const next = { ...pattern };
                        if (next.type === 'attack' || next.type === 'multiAttack') {
                            next.value = Math.max(1, Math.floor(safeNumber(next.value, 0) * atkMul));
                        }
                        return next;
                    })
                    : copied.patterns;
                if (index === 0 && hostileFactions[0]) {
                    copied.name = `【压制】${copied.name || '敌影'}`;
                }
                return copied;
            });
        }

        this.expeditionState = state;
        this.persistActiveExpeditionState();
        return nextEnemies;
    };

    Game.prototype.applyFriendlyFactionBattleSupport = function (node = null) {
        const state = this.getExpeditionState();
        if (!state || !this.player) return;
        const nodeType = String(node?.type || this.currentBattleNode?.type || '');
        const friendly = state.factions.filter((entry) => entry.stance >= 2 && entry.supportNodeTypes.includes(nodeType));
        if (friendly.length === 0) return;
        friendly.forEach((entry) => {
            const support = entry.support || {};
            if (support.block > 0 && typeof this.player.addBlock === 'function') {
                this.player.addBlock(clampInt(support.block, 0, 999));
            }
            if (support.energy > 0) {
                this.player.currentEnergy = clampInt((this.player.currentEnergy || 0) + clampInt(support.energy, 0, 9), 0, 99);
            }
            if (support.gold > 0) this.player.gold += clampInt(support.gold, 0, 9999);
            if (support.ringExp > 0 && this.player.fateRing) {
                this.player.fateRing.exp = clampInt((this.player.fateRing.exp || 0) + clampInt(support.ringExp, 0, 9999), 0, 999999);
            }
            if (support.heavenlyInsight > 0) {
                this.player.heavenlyInsight = clampInt((this.player.heavenlyInsight || 0) + clampInt(support.heavenlyInsight, 0, 9), 0, 999);
            }
            if (support.heal > 0 && typeof this.player.heal === 'function') {
                this.player.heal(clampInt(support.heal, 0, 999));
            }
            if (typeof Utils !== 'undefined' && Utils?.showBattleLog) {
                Utils.showBattleLog(`【${entry.name}】${entry.positiveLabel}已生效。`);
            }
        });
        if (typeof this.updatePlayerDisplay === 'function') {
            this.updatePlayerDisplay();
        }
    };

    Game.prototype.recordExpeditionBattleVictory = function (node = null, enemies = []) {
        const state = this.getExpeditionState();
        if (!state) return null;
        const nodeType = String(node?.type || this.currentBattleNode?.type || '');
        state.stats.battleWins = clampInt((state.stats.battleWins || 0) + 1, 0, 999);
        if (nodeType === 'elite' || nodeType === 'trial') {
            state.stats.eliteWins = clampInt((state.stats.eliteWins || 0) + 1, 0, 999);
        }
        if (nodeType === 'boss') {
            state.stats.bossWins = clampInt((state.stats.bossWins || 0) + 1, 0, 999);
        }
        state.factions.forEach((faction) => {
            if (faction.likes.includes(nodeType)) {
                faction.stance = clampInt(faction.stance + 1, -3, 3);
                faction.lastReason = `你在本章打穿了 ${nodeType} 压力线。`;
            }
        });
        const nemesisDefeated = state.activeNemesis
            && ACTIVE_NEMESIS_STATUSES.includes(state.activeNemesis.status)
            && Array.isArray(enemies)
            && enemies.some((enemy) => String(enemy?.id || '').startsWith(`nemesis_${state.activeNemesis.id}`));
        if (nemesisDefeated) {
            const canRecur = Array.isArray(state.activeNemesis.recursOnVictoryNodeTypes)
                && state.activeNemesis.recursOnVictoryNodeTypes.includes(nodeType)
                && state.activeNemesis.recurrenceCount < 1
                && state.activeNemesis.status !== 'guarding';
            if (canRecur) {
                state.activeNemesis.status = 'recurring';
                state.activeNemesis.fateOutcome = 'recurring';
                state.activeNemesis.recurrenceCount = clampInt((state.activeNemesis.recurrenceCount || 0) + 1, 0, 9);
                state.activeNemesis.engaged = false;
                state.activeNemesis.currentVariantId = 'recurrence';
                state.activeNemesis.hpMul = Math.max(1, safeNumber(state.activeNemesis.hpMul, 1) * 1.05);
                state.activeNemesis.atkMul = Math.max(1, safeNumber(state.activeNemesis.atkMul, 1) * 1.05);
                state.activeNemesis.outcomeNote = `${state.activeNemesis.name} 暂退重整，后续会以更重的压制回返。`;
                if (typeof Utils !== 'undefined' && Utils?.showBattleLog) {
                    Utils.showBattleLog(`【仇敌追猎】${state.activeNemesis.name} 暂退，后续会再次现身。`);
                }
            } else {
                this.applyExpeditionNemesisOutcome(state, 'defeated', {
                    variantId: state.activeNemesis.currentVariantId || 'hunt',
                    note: `已在第 ${state.chapterIndex} 章追猎并击破。`,
                    silent: false
                });
            }
        }
        if (this.player) {
            state.stats.currentHpRatio = Math.max(0, Math.min(1, safeNumber(this.player.currentHp, 0) / Math.max(1, safeNumber(this.player.maxHp, 1))));
        }
        this.expeditionState = state;
        this.refreshExpeditionProgress(true);
        return state;
    };

    Game.prototype.resolvePendingExpeditionNemesisOutcome = function (state = null, reason = 'realm_clear') {
        const source = state || this.getExpeditionState();
        if (!source || !source.activeNemesis) return source;
        const nemesis = source.activeNemesis;
        if (FINAL_NEMESIS_OUTCOMES.includes(nemesis.status)) return source;

        const starSeers = source.factions.find((entry) => entry.id === 'star_seers' && entry.stance >= 2) || null;
        const caravan = source.factions.find((entry) => entry.id === 'caravan_union' && entry.stance >= 2) || null;
        const hasObservatoryTrail = (source.stats.nodeVisits?.observatory || 0) > 0 || (source.stats.nodeVisits?.event || 0) > 0;
        const hasTradeTrail = (source.stats.nodeVisits?.shop || 0) > 0 || (source.stats.nodeVisits?.forge || 0) > 0;

        if (reason === 'realm_clear' && nemesis.clueRevealed && starSeers && !nemesis.rewardGranted && hasObservatoryTrail) {
            return this.applyExpeditionNemesisOutcome(source, 'released', {
                factionId: starSeers.id,
                factionName: starSeers.name,
                note: `${starSeers.name} 判定应保留这条宿敌线索，命盘记为放走。`,
                silent: true
            });
        }

        if (reason === 'realm_clear' && caravan && !nemesis.rewardGranted && hasTradeTrail && !nemesis.engaged) {
            return this.applyExpeditionNemesisOutcome(source, 'traded', {
                factionId: caravan.id,
                factionName: caravan.name,
                note: `${caravan.name} 在收官前把宿敌线转成了交易赏格。`,
                silent: true
            });
        }

        if (reason === 'battle_lost' && (nemesis.status === 'guarding' || nemesis.recurrenceCount > 0 || nemesis.engagedCount > 1)) {
            return this.applyExpeditionNemesisOutcome(source, 'evolved', {
                note: `${nemesis.name} 借这次失利完成了进阶，后续会以更高威胁复现。`,
                silent: true
            });
        }

        return this.applyExpeditionNemesisOutcome(source, 'escaped', {
            note: `${nemesis.name} 趁章末压力线脱身，命盘记为逃逸。`,
            silent: true
        });
    };

    Game.prototype.getExpeditionEndingMeta = function (endingId = 'fracture') {
        const source = (typeof EXPEDITION_CHAPTER_ENDINGS !== 'undefined' && EXPEDITION_CHAPTER_ENDINGS)
            ? EXPEDITION_CHAPTER_ENDINGS[endingId]
            : null;
        return source || { id: endingId, icon: '🧭', name: '章节留痕', desc: '这章的答案尚未被命盘完整解析。' };
    };

    Game.prototype.determineExpeditionEnding = function (state = null) {
        const source = state || this.getExpeditionState();
        if (!source) return this.getExpeditionEndingMeta('fracture');
        const alliedCount = source.factions.filter((entry) => entry.stance >= 2).length;
        const hostileCount = source.factions.filter((entry) => entry.stance <= -2).length;
        const completedBounties = clampInt(source.stats.completedBounties, 0, 99);
        const nemesisStatus = normalizeNemesisStatus(source.activeNemesis?.fateOutcome || source.activeNemesis?.status || 'hunting');
        const hpRatio = safeNumber(source.stats.currentHpRatio, 0);
        if (nemesisStatus === 'defeated' && completedBounties >= 1) return this.getExpeditionEndingMeta('hunt');
        if (nemesisStatus === 'released' && alliedCount >= 1) return this.getExpeditionEndingMeta('alliance');
        if (nemesisStatus === 'traded' && completedBounties >= 1) return this.getExpeditionEndingMeta('sealed');
        if (nemesisStatus === 'evolved') return this.getExpeditionEndingMeta('scarred');
        if (alliedCount >= 2) return this.getExpeditionEndingMeta('alliance');
        if (completedBounties >= 2 && source.stats.noRest) return this.getExpeditionEndingMeta('assault');
        if (completedBounties >= 2 || hpRatio >= 0.62) return this.getExpeditionEndingMeta('sealed');
        if (hpRatio <= 0.35 || hostileCount >= 2) return this.getExpeditionEndingMeta('scarred');
        return this.getExpeditionEndingMeta('fracture');
    };

    Game.prototype.buildRunSlateEntry = function (state = null) {
        const source = state || this.getExpeditionState();
        if (!source) return null;
        const ending = this.determineExpeditionEnding(source);
        const branch = source.branchOptions.find((entry) => entry.id === source.selectedBranchId) || null;
        const activeBounties = this.getActiveExpeditionBounties(source);
        const completedBounties = activeBounties.filter((entry) => entry.completed);
        const nemesisStatus = normalizeNemesisStatus(source.activeNemesis?.fateOutcome || source.activeNemesis?.status || 'hunting');
        const nemesisStatusMeta = getNemesisStatusMeta(nemesisStatus);
        const nemesisReward = this.resolveExpeditionNemesisReward(source.activeNemesis, nemesisStatus);
        const currentVariant = Array.isArray(source.activeNemesis?.battleVariants)
            ? source.activeNemesis.battleVariants.find((entry) => entry.id === source.activeNemesis.currentVariantId) || source.activeNemesis.battleVariants[0]
            : null;
        const selectedObservatoryBonus = this.getSelectedExpeditionObservatoryBonus(source);
        const score = clampInt(
            completedBounties.reduce((sum, entry) => sum + clampInt(entry.reward?.score || 0, 0, 9999), 0)
            + clampInt(nemesisReward.score || 0, 0, 9999)
            + (ending.id === 'alliance' ? 30 : 0)
            + (ending.id === 'assault' ? 40 : 0)
            + (ending.id === 'hunt' ? 55 : 0)
            + (ending.id === 'sealed' ? 26 : 0),
            0,
            9999
        );
        return {
            id: `run_slate:${source.chapterIndex}:${Date.now()}`,
            chapterIndex: source.chapterIndex,
            chapterName: source.chapterFullName || source.chapterName || `第${source.chapterIndex}章`,
            endingId: ending.id,
            endingName: ending.name,
            endingIcon: ending.icon,
            score,
            scoreBreakdown: [
                `${ending.icon} ${ending.name}`,
                `已完成悬赏 ${completedBounties.length} 条`,
                source.activeNemesis?.name
                    ? `仇敌结果：${source.activeNemesis.name} · ${nemesisStatusMeta.label}${source.activeNemesis.alliedFactionName ? ` · ${source.activeNemesis.alliedFactionName}` : ''}`
                    : '仇敌结果：暂无',
                currentVariant?.label ? `仇敌变体：${currentVariant.label}` : null,
                source.activeNemesis?.clueRevealed && source.activeNemesis?.clueLine
                    ? `线索回看：${source.activeNemesis.clueLine}`
                    : null,
                source.observatoryLink?.sourceTitle
                    ? `观星线索：${source.observatoryLink.sourceTitle}${selectedObservatoryBonus ? ` · ${selectedObservatoryBonus.label}` : ''}`
                    : null,
                `势力态势：${source.factions.map((entry) => `${entry.name}${entry.stance > 0 ? '+' : ''}${entry.stance}`).join(' / ')}`
            ].filter(Boolean),
            branchName: branch?.name || '未锁定支线',
            bountyNames: completedBounties.map((entry) => entry.name),
            factionSummary: source.factions.map((entry) => `${entry.name}·${getFactionStatusMeta(entry.stance).label}`),
            nemesisName: source.activeNemesis?.name || '',
            nemesisStatus,
            nemesisStatusLabel: nemesisStatusMeta.label,
            nemesisVariantLabel: currentVariant?.label || '',
            nemesisFactionName: source.activeNemesis?.alliedFactionName || '',
            nemesisClueLine: source.activeNemesis?.clueRevealed ? (source.activeNemesis?.clueLine || '') : '',
            tags: [
                branch?.name || '未锁支线',
                source.activeNemesis?.name ? `宿敌·${nemesisStatusMeta.label}` : '',
                source.observatoryLink?.sourceThemeLabel ? `观星·${source.observatoryLink.sourceThemeLabel}` : '',
                selectedObservatoryBonus?.label ? `线索·${selectedObservatoryBonus.label}` : '',
                ...completedBounties.map((entry) => entry.name),
                ...source.factions.filter((entry) => entry.stance >= 2).map((entry) => `${entry.name}结盟`)
            ].filter(Boolean).slice(0, 6),
            timestamp: Date.now()
        };
    };

    Game.prototype.finalizeExpeditionChapter = function (reason = 'realm_clear') {
        const state = this.getExpeditionState();
        if (!state) return null;
        if (state.activeNemesis && !FINAL_NEMESIS_OUTCOMES.includes(state.activeNemesis.status)) {
            this.resolvePendingExpeditionNemesisOutcome(state, reason);
        }
        const slate = this.buildRunSlateEntry(state);
        if (!slate) return null;
        this.runSlateArchive = this.normalizeRunSlateArchive([slate, ...(this.runSlateArchive || [])]);
        this.persistRunSlateArchive();
        this.expeditionState = null;
        this.persistActiveExpeditionState();
        this.renderExpeditionMapPanels();
        if (typeof this.recordCollectionUnlock === 'function') {
            this.recordCollectionUnlock('run_slate', {
                id: slate.id,
                name: `${slate.chapterName}·${slate.endingName}`,
                icon: slate.endingIcon || '🧭',
                note: `命盘评分 ${slate.score} · ${slate.branchName}`
            });
        }
        return slate;
    };

    Game.prototype.getLatestRunSlate = function () {
        this.ensureExpeditionBootState();
        return Array.isArray(this.runSlateArchive) && this.runSlateArchive.length > 0
            ? this.runSlateArchive[0]
            : null;
    };

    Game.prototype.getExpeditionPayload = function () {
        const state = this.getExpeditionState();
        const latestSlate = this.getLatestRunSlate();
        if (!state && !latestSlate) return null;
        const activeBounties = state ? this.getActiveExpeditionBounties(state) : [];
        const selectedObservatoryBonus = state ? this.getSelectedExpeditionObservatoryBonus(state) : null;
        return {
            chapterIndex: state?.chapterIndex || latestSlate?.chapterIndex || 0,
            chapterName: state?.chapterFullName || latestSlate?.chapterName || '',
            selectedBranchId: state?.selectedBranchId || '',
            selectedBranchName: state?.branchOptions?.find((entry) => entry.id === state.selectedBranchId)?.name || '',
            branchOptions: readArray(state?.branchOptions).map((entry) => ({
                id: entry.id,
                name: entry.name,
                tone: entry.tone,
                selected: entry.id === state.selectedBranchId,
                recommended: this.isExpeditionRecommendedBranch(state, entry.id)
            })),
            bountyDraft: readArray(state?.bountyDraft).map((entry) => ({
                id: entry.id,
                name: entry.name,
                type: entry.type,
                active: readArray(state?.activeBountyIds).includes(entry.id),
                progress: entry.progress,
                progressText: getBountyProgressLabel(entry),
                completed: !!entry.completed
            })),
            activeBounties: activeBounties.map((entry) => ({
                id: entry.id,
                name: entry.name,
                progress: entry.progress,
                progressText: getBountyProgressLabel(entry),
                completed: !!entry.completed
            })),
            factions: readArray(state?.factions).map((entry) => ({
                id: entry.id,
                name: entry.name,
                stance: entry.stance,
                status: getFactionStatusMeta(entry.stance).label,
                lastReason: entry.lastReason || ''
            })),
            activeNemesis: state?.activeNemesis
                ? {
                    id: state.activeNemesis.id,
                    name: state.activeNemesis.name,
                    status: state.activeNemesis.status,
                    statusLabel: getNemesisStatusMeta(state.activeNemesis.status).label,
                    triggerNodeTypes: state.activeNemesis.triggerNodeTypes,
                    clueLine: state.activeNemesis.clueLine || '',
                    clueRevealed: !!state.activeNemesis.clueRevealed,
                    currentVariantId: state.activeNemesis.currentVariantId || '',
                    currentVariantLabel: this.chooseExpeditionNemesisVariant(state, state.activeNemesis.lastEncounterNodeType || state.activeNemesis.triggerNodeTypes?.[0] || '').label,
                    recurrenceCount: clampInt(state.activeNemesis.recurrenceCount, 0, 9),
                    alliedFactionName: state.activeNemesis.alliedFactionName || '',
                    outcomeNote: state.activeNemesis.outcomeNote || ''
                }
                : null,
            observatoryLink: state?.observatoryLink
                ? {
                    sourceRecordId: state.observatoryLink.sourceRecordId,
                    sourceTitle: state.observatoryLink.sourceTitle,
                    sourceThemeLabel: state.observatoryLink.sourceThemeLabel,
                    sourceFeaturedTier: state.observatoryLink.sourceFeaturedTier,
                    sourceFeaturedTags: readArray(state.observatoryLink.sourceFeaturedTags),
                    sourceSeedSignature: state.observatoryLink.sourceSeedSignature,
                    recommendedBranches: readArray(state.observatoryLink.recommendedBranches).map((entry) => ({
                        id: entry.id,
                        name: entry.name,
                        matchCount: clampInt(entry.matchCount, 0, 9)
                    })),
                    bonusOptions: readArray(state.observatoryLink.bonusOptions).map((entry) => ({
                        id: entry.id,
                        label: entry.label,
                        summary: entry.summary,
                        triggerType: entry.triggerType,
                        nodeTypes: readArray(entry.nodeTypes),
                        selected: entry.id === state.observatoryLink.selectedBonusId,
                        consumed: !!entry.consumed
                    })),
                    selectedBonusId: state.observatoryLink.selectedBonusId || '',
                    selectedBonusLabel: selectedObservatoryBonus?.label || '',
                    selectedBonusConsumed: !!selectedObservatoryBonus?.consumed
                }
                : null,
            endingPreview: state ? this.determineExpeditionEnding(state) : null,
            latestSlate: latestSlate
                ? {
                    id: latestSlate.id,
                    chapterName: latestSlate.chapterName,
                    endingName: latestSlate.endingName,
                    score: latestSlate.score,
                    nemesisStatus: latestSlate.nemesisStatus || '',
                    nemesisStatusLabel: latestSlate.nemesisStatusLabel || '',
                    nemesisVariantLabel: latestSlate.nemesisVariantLabel || ''
                }
                : null
        };
    };

    Game.prototype.getRunSlateArchiveSummary = function () {
        this.ensureExpeditionBootState();
        const archive = Array.isArray(this.runSlateArchive) ? this.runSlateArchive : [];
        return {
            count: archive.length,
            latest: archive[0] || null,
            topScore: archive.reduce((max, entry) => Math.max(max, clampInt(entry.score, 0)), 0)
        };
    };

    Game.prototype.renderExpeditionMapPanels = function () {
        if (typeof document === 'undefined') return;
        const shell = document.querySelector('#map-screen .map-screen-v3');
        if (!shell) return;
        const syncChapterBrief = () => {
            if (this.map && typeof this.map.updateChapterBriefPanel === 'function') {
                this.map.updateChapterBriefPanel();
            }
        };
        const state = this.getExpeditionState();
        let container = shell.querySelector('#map-expedition-panels');
        if (!state) {
            if (container) {
                container.innerHTML = '';
                container.style.display = 'none';
            }
            syncChapterBrief();
            return;
        }
        if (!container) {
            container = document.createElement('div');
            container.id = 'map-expedition-panels';
            container.className = 'map-expedition-panels';
            const header = shell.querySelector('.map-v3-header');
            if (header && header.parentNode) {
                header.insertAdjacentElement('afterend', container);
            } else {
                shell.prepend(container);
            }
        }

        const selectedBranch = state.branchOptions.find((entry) => entry.id === state.selectedBranchId) || null;
        const activeBounties = this.getActiveExpeditionBounties(state);
        const ending = this.determineExpeditionEnding(state);
        const nemesisMeta = getNemesisStatusMeta(state.activeNemesis?.status || 'hunting');
        const nemesisVariant = state.activeNemesis
            ? this.chooseExpeditionNemesisVariant(state, state.activeNemesis.lastEncounterNodeType || state.activeNemesis.triggerNodeTypes?.[0] || '')
            : null;
        const observatoryLink = state.observatoryLink || null;
        const selectedObservatoryBonus = this.getSelectedExpeditionObservatoryBonus(state);
        container.style.display = 'grid';
        container.innerHTML = `
            <section class="expedition-panel-card expedition-overview-card">
                <div class="expedition-card-kicker">裂界远征</div>
                <div class="expedition-card-title">本章目标 · ${escapeHtml(state.chapterFullName || state.chapterName)}</div>
                <div class="expedition-card-note">${escapeHtml(selectedBranch ? `当前支线：${selectedBranch.name}` : '请选择 1 条支线区域锁定本章路线。')}${observatoryLink?.sourceTitle ? ` 当前观星线索：${observatoryLink.sourceTitle}。` : ''}</div>
                <div class="expedition-chip-row">
                    <span class="expedition-chip">${escapeHtml(ending.icon)} ${escapeHtml(ending.name)}</span>
                    <span class="expedition-chip">${escapeHtml(activeBounties.length)}/${MAX_ACTIVE_BOUNTIES} 条悬赏</span>
                    <span class="expedition-chip">${escapeHtml(state.activeNemesis?.name || '暂无仇敌')} · ${escapeHtml(nemesisMeta.label || '未定')}</span>
                    ${observatoryLink?.sourceThemeLabel ? `<span class="expedition-chip">${escapeHtml(observatoryLink.sourceThemeLabel)} · 观星样本</span>` : ''}
                    ${selectedObservatoryBonus?.label ? `<span class="expedition-chip">${escapeHtml(selectedObservatoryBonus.label)}${selectedObservatoryBonus.consumed ? ' · 已触发' : ''}</span>` : ''}
                </div>
            </section>
            <section class="expedition-panel-card">
                <div class="expedition-card-kicker">支线区域</div>
                <div class="expedition-card-title">选择本章路线</div>
                <div class="expedition-choice-list">
                    ${state.branchOptions.map((entry) => `
                        <article class="expedition-choice-card ${entry.id === state.selectedBranchId ? 'selected' : ''} ${this.isExpeditionRecommendedBranch(state, entry.id) ? 'suggested' : ''}">
                            <div class="expedition-choice-head">
                                <strong>${escapeHtml(entry.icon)} ${escapeHtml(entry.name)}</strong>
                                <span>${escapeHtml(entry.tone)}</span>
                            </div>
                            <p>${escapeHtml(entry.summary)}</p>
                            <div class="expedition-choice-meta">
                                <span>收益：${escapeHtml(entry.reward)}</span>
                                <span>风险：${escapeHtml(entry.risk)}</span>
                            </div>
                            ${this.isExpeditionRecommendedBranch(state, entry.id)
                ? `<div class="expedition-observatory-note">观星建议：这条路线更贴近「${escapeHtml(observatoryLink?.sourceThemeLabel || '精选命盘')}」的样本节奏。</div>`
                : ''}
                            <button type="button" class="collection-inline-btn ${entry.id === state.selectedBranchId ? 'secondary' : ''}"
                                onclick="game.selectExpeditionBranch('${escapeHtml(entry.id)}')">${entry.id === state.selectedBranchId ? '当前路线' : '锁定路线'}</button>
                        </article>
                    `).join('')}
                </div>
            </section>
            <section class="expedition-panel-card">
                <div class="expedition-card-kicker">章节悬赏</div>
                <div class="expedition-card-title">承接 1-2 条</div>
                <div class="expedition-choice-list">
                    ${state.bountyDraft.map((entry) => `
                        <article class="expedition-choice-card ${state.activeBountyIds.includes(entry.id) ? 'selected' : ''} ${entry.completed ? 'completed' : ''}">
                            <div class="expedition-choice-head">
                                <strong>${escapeHtml(entry.icon)} ${escapeHtml(entry.name)}</strong>
                                <span>${escapeHtml(entry.type)}</span>
                            </div>
                            <p>${escapeHtml(entry.summary)}</p>
                            <div class="expedition-choice-meta">
                                <span>${escapeHtml(getBountyProgressLabel(entry))}</span>
                                <span>${escapeHtml(entry.routeHint)}</span>
                            </div>
                            <button type="button" class="collection-inline-btn ${state.activeBountyIds.includes(entry.id) ? 'secondary' : ''}"
                                onclick="game.toggleExpeditionBounty('${escapeHtml(entry.id)}')">${state.activeBountyIds.includes(entry.id) ? '取消承接' : '承接悬赏'}</button>
                        </article>
                    `).join('')}
                </div>
            </section>
            <section class="expedition-panel-card expedition-observatory-card">
                <div class="expedition-card-kicker">观星联动</div>
                <div class="expedition-card-title">精选命盘线索</div>
                ${observatoryLink
                ? `
                    <div class="expedition-observatory-source">
                        <div class="expedition-choice-head">
                            <strong>${escapeHtml(observatoryLink.sourceTitle)}</strong>
                            <span>${escapeHtml(observatoryLink.sourceFeaturedTier || '精选命盘')}</span>
                        </div>
                        <p>${escapeHtml(observatoryLink.expeditionNote || '观星台会把这份精选命盘转译为本章的小幅 bonus。')}</p>
                        <div class="expedition-chip-row">
                            <span class="expedition-chip">${escapeHtml(observatoryLink.sourceThemeLabel)}</span>
                            <span class="expedition-chip">${escapeHtml(observatoryLink.sourceSeedSignature || '命盘签未定')}</span>
                        </div>
                        ${observatoryLink.sourceFeaturedTags.length > 0
                    ? `<div class="expedition-chip-row">
                            ${observatoryLink.sourceFeaturedTags.map((tag) => `<span class="expedition-chip">${escapeHtml(tag)}</span>`).join('')}
                        </div>`
                    : ''}
                        ${observatoryLink.recommendedBranches.length > 0
                    ? `<div class="expedition-observatory-note">推荐路线：${escapeHtml(observatoryLink.recommendedBranches.map((entry) => entry.name).join(' / '))}</div>`
                    : ''}
                    </div>
                    <div class="expedition-choice-list">
                        ${observatoryLink.bonusOptions.map((entry) => `
                            <article class="expedition-choice-card ${observatoryLink.selectedBonusId === entry.id ? 'selected' : ''} ${entry.consumed ? 'completed' : ''}">
                                <div class="expedition-choice-head">
                                    <strong>${escapeHtml(entry.label)}</strong>
                                    <span>${escapeHtml(entry.triggerType === 'battle_start' ? '开战触发' : '节点触发')}</span>
                                </div>
                                <p>${escapeHtml(entry.summary)}</p>
                                <div class="expedition-choice-meta">
                                    <span>节点：${escapeHtml(entry.nodeTypes.join(' / ') || '任意')}</span>
                                    <span>${escapeHtml(observatoryLink.selectedBonusId === entry.id ? (entry.consumed ? '已触发' : '本章已锁定') : '可启用 1 条')}</span>
                                </div>
                                <button type="button" class="collection-inline-btn ${observatoryLink.selectedBonusId === entry.id ? 'secondary' : ''}"
                                    ${observatoryLink.selectedBonusId ? 'disabled' : ''}
                                    onclick="game.selectExpeditionObservatoryBonus('${escapeHtml(entry.id)}')">${observatoryLink.selectedBonusId === entry.id ? (entry.consumed ? '已触发' : '当前线索') : '启用线索'}</button>
                            </article>
                        `).join('')}
                    </div>
                `
                : '<div class="expedition-empty-note">当前还没有可读取的精选命盘。先去观星台完成一轮高质量挑战，再回来为裂界远征加一条线索。</div>'}
            </section>
            <section class="expedition-panel-card">
                <div class="expedition-card-kicker">势力与仇敌</div>
                <div class="expedition-card-title">本章态势</div>
                <div class="expedition-faction-list">
                    ${state.factions.map((entry) => {
            const meta = getFactionStatusMeta(entry.stance);
            return `
                            <article class="expedition-faction-card ${meta.tone}">
                                <div class="expedition-choice-head">
                                    <strong>${escapeHtml(entry.icon)} ${escapeHtml(entry.name)}</strong>
                                    <span>${escapeHtml(meta.label)}</span>
                                </div>
                                <p>${escapeHtml(entry.agenda)}</p>
                                <div class="expedition-choice-meta">
                                    <span>${escapeHtml(meta.nextHint)}</span>
                                    <span>${escapeHtml(entry.lastReason || '等待局势变化')}</span>
                                </div>
                            </article>
                        `;
        }).join('')}
                </div>
                <article class="expedition-nemesis-card ${state.activeNemesis?.status || 'idle'}">
                    <div class="expedition-choice-head">
                        <strong>${escapeHtml(state.activeNemesis?.icon || '🎯')} ${escapeHtml(state.activeNemesis?.name || '暂无仇敌')}</strong>
                        <span>${escapeHtml(nemesisMeta.label || '未定')}</span>
                    </div>
                    <p>${escapeHtml(state.activeNemesis?.intro || '当前本章未锁定特殊仇敌。')}</p>
                    <div class="expedition-choice-meta">
                        <span>变体：${escapeHtml(nemesisVariant?.label || '追猎压制')}</span>
                        <span>${escapeHtml(state.activeNemesis?.alliedFactionName ? `投靠：${state.activeNemesis.alliedFactionName}` : `出没：${(state.activeNemesis?.triggerNodeTypes || []).join(' / ') || '未知'}`)}</span>
                    </div>
                    <div class="expedition-choice-meta">
                        <span>${escapeHtml(state.activeNemesis?.clueRevealed ? `线索：${state.activeNemesis.clueLine || '已显露'}` : '线索：尚未显露')}</span>
                        <span>${escapeHtml(state.activeNemesis?.outcomeNote || '追猎结果会直接写入命盘摘要')}</span>
                    </div>
                </article>
            </section>
        `;
        syncChapterBrief();
    };

    Game.prototype.startRealm = function (realmLevel, isReplay = false) {
        const result = typeof originalStartRealm === 'function'
            ? originalStartRealm.call(this, realmLevel, isReplay)
            : undefined;
        if (!this.isEndlessActive()) {
            this.initializeExpeditionForRealm(this.player?.realm || realmLevel, true);
            this.renderExpeditionMapPanels();
        }
        return result;
    };

    Game.prototype.advanceToNextRealm = function (clearEssence = 0) {
        const result = typeof originalAdvanceToNextRealm === 'function'
            ? originalAdvanceToNextRealm.call(this, clearEssence)
            : undefined;
        if (!this.isEndlessActive()) {
            this.initializeExpeditionForRealm(this.player?.realm || 1, true);
            this.renderExpeditionMapPanels();
        }
        return result;
    };

    Game.prototype.onBattleWon = async function (enemies) {
        const node = this.currentBattleNode;
        if (this.mode !== 'pvp') {
            this.recordExpeditionBattleVictory(node, Array.isArray(enemies) ? enemies : [enemies]);
        }
        return typeof originalOnBattleWon === 'function'
            ? originalOnBattleWon.call(this, enemies)
            : undefined;
    };

    Game.prototype.onBattleLost = async function () {
        if (this.mode !== 'pvp' && this.getExpeditionState()) {
            this.finalizeExpeditionChapter('battle_lost');
        }
        return typeof originalOnBattleLost === 'function'
            ? originalOnBattleLost.call(this)
            : undefined;
    };

    Game.prototype.onRealmComplete = function () {
        if (!this.isEndlessActive() && this.getExpeditionState()) {
            this.finalizeExpeditionChapter('realm_clear');
        }
        return typeof originalOnRealmComplete === 'function'
            ? originalOnRealmComplete.call(this)
            : undefined;
    };

    Game.prototype.startBattle = function (enemies, node = null) {
        const prepared = this.mode !== 'pvp'
            ? this.applyExpeditionBattleModifiers(enemies, node)
            : enemies;
        const result = typeof originalStartBattle === 'function'
            ? originalStartBattle.call(this, prepared, node)
            : undefined;
        if (this.mode !== 'pvp') {
            const state = this.getExpeditionState();
            if (state) {
                this.consumeExpeditionObservatoryBonus(state, 'battle_start', String(node?.type || this.currentBattleNode?.type || ''));
                this.expeditionState = state;
                this.persistActiveExpeditionState();
            }
            this.applyFriendlyFactionBattleSupport(node);
        }
        return result;
    };

    Game.prototype.showScreen = function (screenId) {
        const result = typeof originalShowScreen === 'function'
            ? originalShowScreen.call(this, screenId)
            : undefined;
        if (screenId === 'map-screen') {
            this.renderExpeditionMapPanels();
        }
        return result;
    };

    Game.prototype.renderGameToText = function () {
        const raw = typeof originalRenderGameToText === 'function'
            ? originalRenderGameToText.call(this)
            : '{}';
        try {
            const payload = JSON.parse(raw);
            payload.expedition = this.getExpeditionPayload();
            return JSON.stringify(payload);
        } catch (error) {
            return raw;
        }
    };

    Game.prototype.loadGame = function () {
        const result = typeof originalLoadGame === 'function'
            ? originalLoadGame.call(this)
            : undefined;
        this.ensureExpeditionBootState();
        if (!this.isEndlessActive() && this.player?.realm) {
            const active = this.loadActiveExpeditionState();
            this.expeditionState = active && clampInt(active.realm, 1, 18) === clampInt(this.player.realm, 1, 18)
                ? this.normalizeExpeditionState(active)
                : this.createExpeditionStateForRealm(this.player.realm);
            this.persistActiveExpeditionState();
        }
        return result;
    };

    Game.prototype.clearSave = function () {
        const result = typeof originalClearSave === 'function'
            ? originalClearSave.call(this)
            : undefined;
        this.expeditionState = null;
        this.persistActiveExpeditionState();
        this.renderExpeditionMapPanels();
        return result;
    };

    Game.prototype.getBuildSnapshotData = function () {
        const snapshot = typeof originalGetBuildSnapshotData === 'function'
            ? originalGetBuildSnapshotData.call(this)
            : {};
        const expedition = this.getExpeditionState();
        if (!expedition) return snapshot;
        const selectedBranch = expedition.branchOptions.find((entry) => entry.id === expedition.selectedBranchId);
        const activeBounties = this.getActiveExpeditionBounties(expedition);
        snapshot.strengths = Array.isArray(snapshot.strengths) ? snapshot.strengths.slice() : [];
        snapshot.gaps = Array.isArray(snapshot.gaps) ? snapshot.gaps.slice() : [];
        snapshot.nextTargets = Array.isArray(snapshot.nextTargets) ? snapshot.nextTargets.slice() : [];
        if (selectedBranch) {
            snapshot.strengths.push(`远征路线已锁定为【${selectedBranch.name}】，会把当前章节更强地推向「${selectedBranch.tone}」。`);
        } else {
            snapshot.gaps.push('本章裂界远征路线尚未锁定，支线收益和势力态度都还没真正站队。');
        }
        if (activeBounties.length > 0) {
            snapshot.nextTargets.push(`章节悬赏：${activeBounties.map((entry) => `${entry.name}（${getBountyProgressLabel(entry)}）`).join(' / ')}`);
        } else {
            snapshot.nextTargets.push('章节悬赏：还未承接，建议尽快选 1-2 条让本章有明确目标。');
        }
        if (expedition.observatoryLink?.sourceTitle) {
            const selectedBonus = this.getSelectedExpeditionObservatoryBonus(expedition);
            snapshot.strengths.push(`观星线索当前读取【${expedition.observatoryLink.sourceTitle}】（${expedition.observatoryLink.sourceThemeLabel}），可把挑战样本反哺到本章远征。`);
            if (selectedBonus) {
                snapshot.strengths.push(`观星 bonus 已锁定为「${selectedBonus.label}」${selectedBonus.consumed ? '，本章已触发过一次。' : '，接下来会在对应节点给出一次小幅支援。'}`);
            } else {
                snapshot.nextTargets.push('观星线索：从精选命盘里挑 1 条 bonus，本章会额外得到一次小幅支援。');
            }
            if (expedition.observatoryLink.recommendedBranches.length > 0 && !selectedBranch) {
                snapshot.nextTargets.push(`观星建议：优先锁定 ${expedition.observatoryLink.recommendedBranches.map((entry) => `【${entry.name}】`).join(' / ')} 这几条更贴样本节奏的路线。`);
            }
        } else {
            snapshot.nextTargets.push('观星线索：当前还没有精选命盘，先去观星台完成一轮挑战，为远征解出额外选项。');
        }
        if (expedition.activeNemesis && ACTIVE_NEMESIS_STATUSES.includes(expedition.activeNemesis.status)) {
            snapshot.gaps.push(`仇敌【${expedition.activeNemesis.name}】当前处于「${getNemesisStatusMeta(expedition.activeNemesis.status).label}」，精英与试炼路线会更危险。`);
        }
        if (expedition.activeNemesis?.clueRevealed && expedition.activeNemesis?.clueLine) {
            snapshot.nextTargets.push(`仇敌线索：${expedition.activeNemesis.clueLine}`);
        }
        snapshot.expedition = this.getExpeditionPayload();
        return snapshot;
    };

    Game.prototype.getSanctumOverviewData = function () {
        const data = typeof originalGetSanctumOverviewData === 'function'
            ? originalGetSanctumOverviewData.call(this)
            : {
                progress: {},
                rooms: [],
                researches: [],
                goals: [],
                recentUnlocks: []
            };
        const archiveSummary = this.getRunSlateArchiveSummary();
        const latestSlate = archiveSummary.latest;
        data.rooms = Array.isArray(data.rooms) ? data.rooms.slice() : [];
        data.researches = Array.isArray(data.researches) ? data.researches.slice() : [];
        data.goals = Array.isArray(data.goals) ? data.goals.slice() : [];
        data.progress = data.progress && typeof data.progress === 'object' ? { ...data.progress } : {};
        data.progress.runSlateArchives = archiveSummary.count;
        data.progress.topRunSlateScore = archiveSummary.topScore;
        data.rooms.push({
            id: 'run_slate_archive',
            icon: '🧭',
            name: '命盘档案室',
            focus: '章节结局 / 悬赏记录 / 势力立场 / 仇敌追猎',
            note: latestSlate
                ? `最新命盘：${latestSlate.chapterName} · ${latestSlate.endingName} · 评分 ${latestSlate.score}`
                : '当前还没有远征命盘归档，打通一章后会自动留下第一张答卷。',
            actionLabel: '查看构筑快照',
            actionType: 'collection',
            actionValue: 'builds'
        });
        data.researches.push({
            id: 'run_slate_archive_research',
            room: '命盘档案室',
            name: '远征命盘归档',
            progress: archiveSummary.count > 0 ? 1 : 0,
            goal: 1,
            reward: '洞府会开始记录章节结局、仇敌结果与势力走向，为下一轮路线选择提供依据。',
            section: 'builds',
            ready: archiveSummary.count > 0,
            progressText: `${archiveSummary.count > 0 ? 1 : 0}/1`
        });
        if (!data.goals.find((goal) => goal.id === 'run_slate_archive_goal')) {
            data.goals.push({
                id: 'run_slate_archive_goal',
                title: latestSlate ? `${latestSlate.chapterName} · ${latestSlate.endingName}` : '留下第一张远征命盘',
                note: latestSlate
                    ? `最新评分 ${latestSlate.score}，可继续通过更高悬赏完成度与仇敌追猎抬高命盘质量。`
                    : '推进任意主线章节，洞府会自动记录章节结局与势力走向。',
                action: 'collection',
                value: 'builds',
                icon: latestSlate?.endingIcon || '🧭'
            });
        }
        return data;
    };

    if (typeof GameMap !== 'undefined' && originalMapRender) {
        GameMap.prototype.render = function () {
            const result = originalMapRender.call(this);
            if (this?.game && typeof this.game.renderExpeditionMapPanels === 'function') {
                this.game.renderExpeditionMapPanels();
            }
            return result;
        };
    }

    if (typeof GameMap !== 'undefined' && originalMapUpdateState) {
        GameMap.prototype.updateMapState = function () {
            const result = originalMapUpdateState.call(this);
            if (this?.game && typeof this.game.renderExpeditionMapPanels === 'function') {
                this.game.renderExpeditionMapPanels();
            }
            return result;
        };
    }

    if (typeof GameMap !== 'undefined' && originalMapOnNodeClick) {
        GameMap.prototype.onNodeClick = function (node) {
            if (node && !node.completed && node.accessible && this?.game && typeof this.game.recordExpeditionNodeVisit === 'function') {
                this.game.recordExpeditionNodeVisit(node);
            }
            return originalMapOnNodeClick.call(this, node);
        };
    }
}());
