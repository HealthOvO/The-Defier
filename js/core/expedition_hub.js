(function () {
    if (typeof Game === 'undefined') return;

    const ACTIVE_EXPEDITION_STATE_KEY = 'theDefierActiveExpeditionStateV1';
    const RUN_SLATE_ARCHIVE_KEY = 'theDefierRunSlateArchiveV1';
    const MAX_ACTIVE_BOUNTIES = 2;
    const MAX_FACTION_HISTORY = 12;
    const MAX_NEMESIS_HISTORY = 12;
    const DEFAULT_FACTION_REASON = '本章初入，局势仍未定盘。';

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
    const originalMapCompleteNode = typeof GameMap !== 'undefined' && GameMap?.prototype
        ? GameMap.prototype.completeNode
        : null;

    const safeNumber = (value, fallback = 0) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    };

    const clampInt = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
        const num = Math.floor(safeNumber(value, min));
        return Math.max(min, Math.min(max, num));
    };

    const isMapNodeMarkedCompleted = (mapInstance, node) => {
        if (!node || !mapInstance || !Array.isArray(mapInstance.nodes)) return false;
        const nodeId = String(node.id || '');
        if (!nodeId) return !!node.completed;
        return mapInstance.nodes.some((row) => Array.isArray(row) && row.some((entry) => entry && entry.id === nodeId && entry.completed));
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

    const EXPEDITION_NODE_LABELS = {
        enemy: '敌阵',
        elite: '精英',
        boss: '首领',
        event: '事件',
        shop: '商店',
        rest: '营地',
        trial: '试炼',
        forge: '炼器坊',
        observatory: '观星台',
        spirit_grotto: '灵契窟',
        forbidden_altar: '禁术坛',
        memory_rift: '记忆裂隙'
    };

    const getExpeditionNodeLabel = (type = '') => (
        EXPEDITION_NODE_LABELS[String(type || '')] || String(type || '未知节点')
    );

    const getExpeditionNodeLabels = (nodeTypes = [], limit = 3) => Array.from(new Set(
        readArray(nodeTypes)
            .map((value) => getExpeditionNodeLabel(value))
            .filter(Boolean)
    )).slice(0, Math.max(1, clampInt(limit, 1, 6)));

    const formatExpeditionNodeLabels = (nodeTypes = [], fallback = '关键线路', limit = 3) => {
        const labels = getExpeditionNodeLabels(nodeTypes, limit);
        return labels.length > 0 ? labels.join(' / ') : fallback;
    };

    const getStrategicEngineeringExpeditionTrackProfile = (trackId = '') => {
        switch (String(trackId || '')) {
            case 'observatory':
                return {
                    routeNodeTypes: ['observatory', 'event', 'memory_rift'],
                    pressureDeltas: [0, -2, -4, -6],
                    routeDirective: '观测锁线',
                    rewardBias: '情报前置',
                    pressureBias: '稳读预警',
                    nemesisModifier: '观测锁线'
                };
            case 'memory_rift':
                return {
                    routeNodeTypes: ['memory_rift', 'event', 'observatory'],
                    pressureDeltas: [0, 2, 4, 6],
                    routeDirective: '裂隙改道',
                    rewardBias: '高收益改写',
                    pressureBias: '错位波动',
                    nemesisModifier: '裂隙改道'
                };
            case 'forbidden_altar':
                return {
                    routeNodeTypes: ['forbidden_altar', 'elite', 'trial'],
                    pressureDeltas: [0, 2, 4, 6],
                    routeDirective: '禁术压强',
                    rewardBias: '献祭收割',
                    pressureBias: '血契增压',
                    nemesisModifier: '血契增压'
                };
            case 'spirit_grotto':
                return {
                    routeNodeTypes: ['spirit_grotto', 'rest', 'observatory'],
                    pressureDeltas: [0, -1, -3, -5],
                    routeDirective: '护送稳线',
                    rewardBias: '护送续航',
                    pressureBias: '缓冲兜底',
                    nemesisModifier: '护送稳线'
                };
            default:
                return null;
        }
    };

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

    const getBountyFocusNodeTypes = (bounty = null) => {
        const condition = bounty?.condition || {};
        switch (condition.type) {
            case 'visitNodeType':
                return condition.nodeType ? [String(condition.nodeType)] : [];
            case 'eliteWins':
                return ['elite', 'trial'];
            case 'battleWins':
                return ['enemy', 'elite', 'trial', 'boss'];
            case 'noRestBossWin':
                return ['enemy', 'elite', 'trial', 'boss'];
            case 'hpAboveOnBossWin':
                return ['rest', 'shop', 'observatory', 'boss'];
            default:
                return [];
        }
    };

    const getBountyAvoidNodeTypes = (bounty = null) => {
        const condition = bounty?.condition || {};
        switch (condition.type) {
            case 'noRestBossWin':
                return ['rest'];
            case 'hpAboveOnBossWin':
                return ['forbidden_altar'];
            default:
                return [];
        }
    };

    const isPressureBounty = (bounty = null) => {
        const condition = bounty?.condition || {};
        return ['battleWins', 'eliteWins', 'noRestBossWin'].includes(condition.type)
            || String(bounty?.id || '') === 'altar_oath'
            || String(bounty?.id || '') === 'trial_verdict';
    };

    const isStabilityBounty = (bounty = null) => (
        String(bounty?.condition?.type || '') === 'hpAboveOnBossWin'
    );

    const getConflictSeverityWeight = (severity = 'low') => {
        if (severity === 'high') return 3;
        if (severity === 'medium') return 2;
        return 1;
    };

    const normalizeFactionHistoryEntry = (entry = null, index = 0) => {
        const source = entry && typeof entry === 'object' ? entry : {};
        const delta = clampInt(source.delta, -3, 3);
        const factionName = String(source.factionName || source.name || '未知势力');
        const reason = String(source.reason || '');
        const stanceAfter = clampInt(source.stanceAfter ?? source.stance ?? 0, -3, 3);
        const deltaLabel = delta > 0 ? `+${delta}` : String(delta);
        return {
            id: String(source.id || `faction_log_${index}`),
            factionId: String(source.factionId || ''),
            factionName,
            delta,
            deltaLabel,
            stanceAfter,
            stanceLabel: getFactionStatusMeta(stanceAfter).label,
            reason,
            sourceType: String(source.sourceType || 'system'),
            line: String(source.line || `${factionName}${delta ? ` ${delta > 0 ? '↑' : '↓'}${Math.abs(delta)}` : ''} · ${reason || '局势出现了新的变化。'}`),
            timestamp: clampInt(source.timestamp, 0) || Date.now()
        };
    };

    const normalizeNemesisHistoryEntry = (entry = null, index = 0) => {
        const source = entry && typeof entry === 'object' ? entry : {};
        const status = normalizeNemesisStatus(source.status || source.fateOutcome || 'hunting');
        const meta = getNemesisStatusMeta(status);
        const severity = ['low', 'medium', 'high'].includes(String(source.severity || ''))
            ? String(source.severity)
            : (['guarding', 'evolved', 'escaped'].includes(status) ? 'high' : ['allied', 'recurring', 'hunting'].includes(status) ? 'medium' : 'low');
        const title = String(source.title || meta.label);
        const detail = String(source.detail || source.reason || source.note || '');
        return {
            id: String(source.id || `nemesis_log_${index}`),
            status,
            statusLabel: meta.label,
            severity,
            title,
            detail,
            counterplay: String(source.counterplay || ''),
            sourceType: String(source.sourceType || 'system'),
            nodeTypes: readArray(source.nodeTypes).map((value) => String(value || '')).filter(Boolean).slice(0, 4),
            line: String(source.line || `${title}${detail ? ` · ${detail}` : ''}`),
            timestamp: clampInt(source.timestamp, 0) || Date.now()
        };
    };

    const normalizeConflictWarning = (entry = null, index = 0) => {
        const source = entry && typeof entry === 'object' ? entry : {};
        const severity = ['low', 'medium', 'high'].includes(String(source.severity || ''))
            ? String(source.severity)
            : 'low';
        const bountyName = String(source.bountyName || '当前悬赏');
        const label = String(source.label || '冲突提示');
        const detail = String(source.detail || '');
        const suggestion = String(source.suggestion || '');
        return {
            id: String(source.id || `bounty_conflict_${index}`),
            bountyId: String(source.bountyId || ''),
            bountyName,
            severity,
            sourceType: String(source.sourceType || 'system'),
            label,
            detail,
            suggestion,
            factionId: String(source.factionId || ''),
            factionName: String(source.factionName || ''),
            engineeringTrackId: String(source.engineeringTrackId || ''),
            engineeringTrackName: String(source.engineeringTrackName || ''),
            engineeringThemeLabel: String(source.engineeringThemeLabel || ''),
            engineeringNote: String(source.engineeringNote || ''),
            routeDivergence: String(source.routeDivergence || ''),
            nodeTypes: readArray(source.nodeTypes).map((value) => String(value || '')).filter(Boolean).slice(0, 4),
            line: String(source.line || `${bountyName} · ${label}${detail ? `：${detail}` : ''}`)
        };
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

    const getNemesisPressureMeta = (score = 0) => {
        const safeScore = clampInt(score, 0, 100);
        if (safeScore >= 78) return { tierId: 'extreme', label: '极高压' };
        if (safeScore >= 58) return { tierId: 'high', label: '高压' };
        if (safeScore >= 34) return { tierId: 'medium', label: '拉扯' };
        return { tierId: 'low', label: '试探' };
    };

    const EXPEDITION_ENGINEERING_SIGNAL_META = {
        observatory: {
            themeLabel: '观测锁线',
            windowPrefix: '观测锁线',
            preferredNodeTypes: ['observatory', 'event', 'memory_rift'],
            pressureDeltaByTier: [0, -2, -4, -6],
            overlapPressureDeltaByTier: [0, -1, -1, -2],
            rewardBiasLabel: '情报 / 锁线',
            pressureBiasLabel: '缓压',
            summaryLine: '观测网会提前显露追猎窗口，并把路线分歧转成可读情报。'
        },
        memory_rift: {
            themeLabel: '裂隙改道',
            windowPrefix: '裂隙改道',
            preferredNodeTypes: ['memory_rift', 'event', 'observatory'],
            pressureDeltaByTier: [0, 2, 4, 6],
            overlapPressureDeltaByTier: [0, 1, 2, 2],
            rewardBiasLabel: '改写 / 绕行',
            pressureBiasLabel: '错位高压',
            summaryLine: '裂隙回响会改写既定路网，让高收益节点与追猎窗口更容易发生错位。'
        },
        spirit_grotto: {
            themeLabel: '护送稳线',
            windowPrefix: '护送稳线',
            preferredNodeTypes: ['spirit_grotto', 'rest', 'observatory'],
            pressureDeltaByTier: [0, -1, -3, -5],
            overlapPressureDeltaByTier: [0, -1, -1, -2],
            rewardBiasLabel: '援护 / 续航',
            pressureBiasLabel: '稳线',
            summaryLine: '灵契护道会抹平追猎波峰，把路线风险压回可控区间。'
        },
        forbidden_altar: {
            themeLabel: '禁术压强',
            windowPrefix: '血契逼战',
            preferredNodeTypes: ['forbidden_altar', 'trial', 'elite', 'enemy'],
            pressureDeltaByTier: [0, 2, 4, 6],
            overlapPressureDeltaByTier: [0, 1, 2, 2],
            rewardBiasLabel: '高压 / 爆发',
            pressureBiasLabel: '升压',
            summaryLine: '血契链路会把高压收益和追猎风险一起抬高，逼你更早交答卷。'
        }
    };

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
        const factionHistory = readArray(source.factionHistory)
            .map((entry, index) => normalizeFactionHistoryEntry(entry, index))
            .slice(-MAX_FACTION_HISTORY);
        const nemesisHistory = readArray(source.nemesisHistory)
            .map((entry, index) => normalizeNemesisHistoryEntry(entry, index))
            .slice(-MAX_NEMESIS_HISTORY);
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
            factionHistory,
            nemesisHistory,
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
        this.appendExpeditionNemesisHistory(source, {
            status: normalizedOutcome,
            severity: ['escaped', 'evolved'].includes(normalizedOutcome) ? 'high' : ['defeated', 'released', 'traded'].includes(normalizedOutcome) ? 'low' : 'medium',
            title: `${nemesis.name} · ${meta.label}`,
            detail: nemesis.outcomeNote || `${nemesis.name} 的追猎线已切换到「${meta.label}」。`,
            counterplay: this.getExpeditionNemesisForecast(source)?.counterplay || '',
            nodeTypes: nemesis.lastEncounterNodeType ? [nemesis.lastEncounterNodeType] : nemesis.triggerNodeTypes,
            sourceType: options.sourceType || 'outcome'
        });
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
            this.appendExpeditionNemesisHistory(source, {
                status: nemesis.status,
                severity: 'medium',
                title: `${nemesis.name} · 线索显露`,
                detail: nemesis.clueLine,
                counterplay: this.getExpeditionNemesisForecast(source)?.counterplay || '',
                nodeTypes: [nodeType],
                sourceType: 'clue'
            });
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
            this.appendExpeditionNemesisHistory(source, {
                status: nemesis.status,
                severity: 'high',
                title: `${nemesis.name} · 投靠势力`,
                detail: `${hostileFaction.name} 开始为其提供掩护，后续合围节点会更危险。`,
                counterplay: this.getExpeditionNemesisForecast(source)?.counterplay || '',
                nodeTypes: [nodeType],
                sourceType: 'allied'
            });
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
            this.appendExpeditionNemesisHistory(source, {
                status: nemesis.status,
                severity: 'high',
                title: `${nemesis.name} · 主宰护卫`,
                detail: `${nemesis.name} 会在首领窗口以护卫形态压轴现身。`,
                counterplay: this.getExpeditionNemesisForecast(source)?.counterplay || '',
                nodeTypes: [nodeType],
                sourceType: 'guarding'
            });
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
            lastReason: DEFAULT_FACTION_REASON
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
            factionHistory: [],
            nemesisHistory: [],
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

    Game.prototype.appendExpeditionFactionHistory = function (state = null, faction = null, delta = 0, reason = '', options = {}) {
        if (!state || !faction || !reason) return null;
        const actualDelta = clampInt(delta, -3, 3);
        const entry = normalizeFactionHistoryEntry({
            id: `${String(faction.id || 'faction')}_${Date.now()}_${Math.max(0, readArray(state.factionHistory).length)}`,
            factionId: faction.id,
            factionName: faction.name,
            delta: actualDelta,
            stanceAfter: faction.stance,
            reason,
            sourceType: options.sourceType || 'system',
            timestamp: Date.now(),
            line: `${faction.name}${actualDelta ? ` ${actualDelta > 0 ? '↑' : '↓'}${Math.abs(actualDelta)}` : ''} · ${reason}`
        });
        state.factionHistory = [...readArray(state.factionHistory), entry].slice(-MAX_FACTION_HISTORY);
        return entry;
    };

    Game.prototype.applyExpeditionFactionDelta = function (state = null, factionId = '', delta = 0, reason = '', options = {}) {
        if (!state || !factionId || !delta) return null;
        const target = state.factions.find((entry) => entry.id === factionId);
        if (!target) return null;
        const previousStance = clampInt(target.stance, -3, 3);
        target.stance = clampInt(previousStance + clampInt(delta, -3, 3), -3, 3);
        target.lastReason = String(reason || target.lastReason || DEFAULT_FACTION_REASON);
        const actualDelta = target.stance - previousStance;
        if (actualDelta !== 0 || options.forceLog) {
            this.appendExpeditionFactionHistory(state, target, actualDelta, target.lastReason, options);
        }
        return target;
    };

    Game.prototype.getRecentExpeditionFactionLogs = function (state = null, limit = 3) {
        const source = state || this.getExpeditionState();
        if (!source) return [];
        const safeLimit = clampInt(limit, 1, MAX_FACTION_HISTORY);
        const history = readArray(source.factionHistory)
            .map((entry, index) => normalizeFactionHistoryEntry(entry, index))
            .slice(-safeLimit)
            .reverse();
        if (history.length > 0) return history;
        return readArray(source.factions)
            .filter((entry) => entry.lastReason && entry.lastReason !== DEFAULT_FACTION_REASON)
            .sort((a, b) => Math.abs(clampInt(b.stance, -3, 3)) - Math.abs(clampInt(a.stance, -3, 3)))
            .slice(0, safeLimit)
            .map((entry, index) => normalizeFactionHistoryEntry({
                id: `faction_fallback_${index}`,
                factionId: entry.id,
                factionName: entry.name,
                delta: 0,
                stanceAfter: entry.stance,
                reason: entry.lastReason,
                sourceType: 'fallback',
                line: `${entry.name} · ${entry.lastReason}`
            }, index));
    };

    Game.prototype.appendExpeditionNemesisHistory = function (state = null, entry = null) {
        if (!state || !entry || typeof entry !== 'object') return null;
        const normalized = normalizeNemesisHistoryEntry({
            ...entry,
            id: entry.id || `nemesis_${Date.now()}_${Math.max(0, readArray(state.nemesisHistory).length)}`,
            timestamp: entry.timestamp || Date.now()
        }, readArray(state.nemesisHistory).length);
        const previous = readArray(state.nemesisHistory).slice(-1)[0];
        if (
            previous
            && String(previous.status || '') === normalized.status
            && String(previous.line || '') === normalized.line
            && String(previous.sourceType || '') === normalized.sourceType
        ) {
            return normalizeNemesisHistoryEntry(previous, 0);
        }
        state.nemesisHistory = [...readArray(state.nemesisHistory), normalized].slice(-MAX_NEMESIS_HISTORY);
        return normalized;
    };

    Game.prototype.getRecentExpeditionNemesisLogs = function (state = null, limit = 3) {
        const source = state || this.getExpeditionState();
        if (!source) return [];
        const safeLimit = clampInt(limit, 1, MAX_NEMESIS_HISTORY);
        const history = readArray(source.nemesisHistory)
            .map((entry, index) => normalizeNemesisHistoryEntry(entry, index))
            .slice(-safeLimit)
            .reverse();
        if (history.length > 0) return history;
        const nemesis = source.activeNemesis;
        if (!nemesis?.id) return [];
        const fallback = [];
        if (nemesis.clueRevealed && nemesis.clueLine) {
            fallback.push({
                id: 'nemesis_fallback_clue',
                status: nemesis.status,
                title: `${nemesis.name} · 线索显露`,
                detail: nemesis.clueLine,
                sourceType: 'fallback',
                nodeTypes: nemesis.clueNodeTypes
            });
        }
        if (nemesis.outcomeNote) {
            fallback.push({
                id: 'nemesis_fallback_note',
                status: nemesis.status,
                title: `${nemesis.name} · ${getNemesisStatusMeta(nemesis.status).label}`,
                detail: nemesis.outcomeNote,
                sourceType: 'fallback',
                nodeTypes: nemesis.lastEncounterNodeType ? [nemesis.lastEncounterNodeType] : nemesis.triggerNodeTypes
            });
        }
        return fallback
            .slice(0, safeLimit)
            .map((entry, index) => normalizeNemesisHistoryEntry(entry, index));
    };

    Game.prototype.getStrategicEngineeringExpeditionInfluence = function (state = null) {
        const source = state || this.getExpeditionState();
        const snapshot = typeof this.getStrategicEngineeringSnapshot === 'function'
            ? this.getStrategicEngineeringSnapshot()
            : null;
        const focusTrack = snapshot?.focusTrack;
        const tier = clampInt(focusTrack?.tier, 0, 3);
        const profile = getStrategicEngineeringExpeditionTrackProfile(focusTrack?.trackId || '');
        if (!source || !focusTrack?.trackId || tier <= 0 || !profile) return null;

        const routeNodeTypes = readArray(profile.routeNodeTypes).slice(0, 4);
        const icon = String(focusTrack.icon || '🧭');
        const name = String(focusTrack.name || focusTrack.trackId || '工程主轴');
        const tierLabel = String(focusTrack.tierLabel || `T${tier}`);
        const effectSummary = String(focusTrack.effectSummary || '跨章工程正在改写本章远征。');
        const pressureDeltas = Array.isArray(profile.pressureDeltas) ? profile.pressureDeltas : [0];
        const pressureDelta = safeNumber(
            pressureDeltas[Math.min(tier, Math.max(0, pressureDeltas.length - 1))],
            0
        );

        return {
            engineeringTrackId: String(focusTrack.trackId || ''),
            engineeringTrackName: name,
            engineeringTrackIcon: icon,
            engineeringTier: tier,
            engineeringTierLabel: tierLabel,
            routeNodeTypes,
            routeNodeLabels: getExpeditionNodeLabels(routeNodeTypes, 3),
            routeDirective: String(profile.routeDirective || ''),
            rewardBias: String(profile.rewardBias || ''),
            pressureBias: String(profile.pressureBias || ''),
            pressureDelta,
            nemesisModifier: String(profile.nemesisModifier || profile.routeDirective || ''),
            effectSummary,
            summary: `${icon} ${name} ${tierLabel} 正在把本章远征推向 ${formatExpeditionNodeLabels(routeNodeTypes, '关键线路')} 线，${effectSummary}`
        };
    };

    Game.prototype.getExpeditionBranchEngineeringInsight = function (state = null, branch = null, influence = null) {
        const activeInfluence = influence || this.getStrategicEngineeringExpeditionInfluence(state);
        if (!branch || !activeInfluence) return null;

        const branchNodeBias = readArray(branch.nodeBias).slice(0, 4);
        const matchNodeTypes = Array.from(new Set(
            branchNodeBias.filter((type) => activeInfluence.routeNodeTypes.includes(type))
        )).slice(0, 4);
        const targetLabels = formatExpeditionNodeLabels(activeInfluence.routeNodeTypes, '关键线路');
        const matchLabels = formatExpeditionNodeLabels(matchNodeTypes, targetLabels);
        let engineeringNote = '';
        let pressureBias = activeInfluence.pressureBias;
        let rewardBias = activeInfluence.rewardBias;
        let routeDivergence = matchNodeTypes.length > 0 ? 'aligned' : 'offset';

        switch (activeInfluence.engineeringTrackId) {
            case 'observatory':
                engineeringNote = matchNodeTypes.length > 0
                    ? `${activeInfluence.engineeringTrackName}会在 ${matchLabels} 线提前暴露追猎窗口。`
                    : `${activeInfluence.engineeringTrackName}更偏 ${targetLabels} 线，这条路线的信息收益会缩水。`;
                pressureBias = matchNodeTypes.length > 0 ? '低压锁线' : '信息偏移';
                rewardBias = matchNodeTypes.length > 0 ? '情报前置' : '预警缩水';
                break;
            case 'memory_rift':
                engineeringNote = matchNodeTypes.length > 0
                    ? `${activeInfluence.engineeringTrackName}会把这条路线改写成 ${matchLabels} 的高收益高波动窗口。`
                    : `${activeInfluence.engineeringTrackName}正在把收益牵向 ${targetLabels} 线，这条路线更容易出现分岔。`;
                pressureBias = matchNodeTypes.length > 0 ? '裂隙改道' : '分岔上升';
                rewardBias = '高收益改写';
                routeDivergence = matchNodeTypes.length > 0 ? 'volatile' : 'drifting';
                break;
            case 'forbidden_altar':
                engineeringNote = matchNodeTypes.length > 0
                    ? `${activeInfluence.engineeringTrackName}会把这条路线抬成 ${matchLabels} 的高压追猎线。`
                    : `${activeInfluence.engineeringTrackName}正在抬升 ${targetLabels} 线压强，这条路线会更吃资源与净化。`;
                pressureBias = '禁术压强';
                rewardBias = '献祭收割';
                routeDivergence = 'volatile';
                break;
            case 'spirit_grotto':
                engineeringNote = matchNodeTypes.length > 0
                    ? `${activeInfluence.engineeringTrackName}会把这条路线稳成 ${matchLabels} 的护送线。`
                    : `${activeInfluence.engineeringTrackName}更偏 ${targetLabels} 线，这条路线暂时吃不到稳线补给。`;
                pressureBias = matchNodeTypes.length > 0 ? '护送稳线' : '补给偏离';
                rewardBias = matchNodeTypes.length > 0 ? '续航兜底' : '补给缩水';
                routeDivergence = matchNodeTypes.length > 0 ? 'stabilized' : 'offset';
                break;
            default:
                engineeringNote = activeInfluence.summary;
                break;
        }

        return {
            engineeringTrackId: activeInfluence.engineeringTrackId,
            engineeringTrackName: activeInfluence.engineeringTrackName,
            engineeringTrackIcon: activeInfluence.engineeringTrackIcon,
            engineeringTier: activeInfluence.engineeringTier,
            engineeringTierLabel: activeInfluence.engineeringTierLabel,
            engineeringNote,
            pressureBias,
            rewardBias,
            routeDivergence,
            matchNodeTypes
        };
    };

    Game.prototype.getExpeditionBountyEngineeringInsight = function (state = null, bounty = null, selectedBranch = null, influence = null) {
        const activeInfluence = influence || this.getStrategicEngineeringExpeditionInfluence(state);
        if (!bounty || !activeInfluence) return null;

        const focusNodeTypes = getBountyFocusNodeTypes(bounty);
        const avoidNodeTypes = getBountyAvoidNodeTypes(bounty);
        const branchNodeBias = readArray(selectedBranch?.nodeBias).slice(0, 4);
        const focusMatch = Array.from(new Set(
            focusNodeTypes.filter((type) => activeInfluence.routeNodeTypes.includes(type))
        )).slice(0, 4);
        const branchMatch = Array.from(new Set(
            branchNodeBias.filter((type) => activeInfluence.routeNodeTypes.includes(type))
        )).slice(0, 4);
        const aligned = focusMatch.length > 0 || branchMatch.length > 0;
        const targetLabels = formatExpeditionNodeLabels(activeInfluence.routeNodeTypes, '关键线路');
        const focusLabels = formatExpeditionNodeLabels(focusNodeTypes, '当前目标');
        const matchLabels = formatExpeditionNodeLabels(focusMatch.length > 0 ? focusMatch : branchMatch, targetLabels);
        const stabilityBounty = isStabilityBounty(bounty);
        const pressureBounty = isPressureBounty(bounty);
        let engineeringNote = '';
        let summaryLine = '';
        let pressureBias = activeInfluence.pressureBias;
        let rewardBias = activeInfluence.rewardBias;
        let routeDivergence = aligned ? 'aligned' : 'offset';
        let warning = null;

        switch (activeInfluence.engineeringTrackId) {
            case 'observatory':
                engineeringNote = aligned
                    ? `${activeInfluence.engineeringTrackName}会把这条赏单锁到 ${matchLabels} 线，追猎窗口会更早显露。`
                    : `${activeInfluence.engineeringTrackName}当前更偏 ${targetLabels} 线，这条赏单需要额外绕路才能吃满情报收益。`;
                summaryLine = `工程牵引：${engineeringNote}`;
                pressureBias = aligned ? '低压锁线' : '信息偏移';
                rewardBias = aligned ? '情报前置' : '预警缩水';
                routeDivergence = aligned ? 'locked' : 'offset';
                if (!aligned && focusNodeTypes.length > 0) {
                    warning = {
                        severity: 'medium',
                        sourceType: 'engineering',
                        label: '观测锁线',
                        detail: `${activeInfluence.engineeringTrackName}更偏 ${targetLabels} 线，而这条赏单主要盯住 ${focusLabels}，完成线会变窄。`,
                        suggestion: '若要稳结单，优先锁含观星 / 事件的路线。',
                        engineeringTrackId: activeInfluence.engineeringTrackId,
                        engineeringTrackName: activeInfluence.engineeringTrackName,
                        engineeringNote,
                        routeDivergence,
                        nodeTypes: activeInfluence.routeNodeTypes
                    };
                }
                break;
            case 'memory_rift':
                engineeringNote = aligned
                    ? `${activeInfluence.engineeringTrackName}会把这条赏单拖进 ${matchLabels} 的改写窗口，奖励更高但路线更抖。`
                    : `${activeInfluence.engineeringTrackName}正在把收益牵向 ${targetLabels} 线，这条赏单更容易出现分岔。`;
                summaryLine = `工程牵引：${engineeringNote}`;
                pressureBias = aligned ? '裂隙改道' : '分岔上升';
                rewardBias = '高收益改写';
                routeDivergence = aligned ? 'volatile' : 'drifting';
                if (stabilityBounty || !aligned) {
                    warning = {
                        severity: stabilityBounty ? 'high' : 'medium',
                        sourceType: 'engineering',
                        label: stabilityBounty ? '追猎错位' : '路线分岔',
                        detail: stabilityBounty
                            ? `${activeInfluence.engineeringTrackName}会把节奏推向 ${targetLabels} 线，稳线类赏单更容易在改道时掉进度。`
                            : `${activeInfluence.engineeringTrackName}正在把路线扯向 ${targetLabels}，这条赏单很难顺带完成。`,
                        suggestion: stabilityBounty
                            ? '接单前先确认补给余量，并给改线预留一个节点。'
                            : '若想吃满奖励，优先锁能碰到记忆裂隙 / 事件的路线。',
                        engineeringTrackId: activeInfluence.engineeringTrackId,
                        engineeringTrackName: activeInfluence.engineeringTrackName,
                        engineeringNote,
                        routeDivergence,
                        nodeTypes: activeInfluence.routeNodeTypes
                    };
                }
                break;
            case 'forbidden_altar':
                engineeringNote = aligned || pressureBounty
                    ? `${activeInfluence.engineeringTrackName}会把这条赏单抬成 ${matchLabels} 的高压收割线，追猎与反噬都会被放大。`
                    : `${activeInfluence.engineeringTrackName}正在抬升 ${targetLabels} 线压强，这条赏单会被迫承担更多风险。`;
                summaryLine = `工程牵引：${engineeringNote}`;
                pressureBias = '禁术压强';
                rewardBias = '献祭收割';
                routeDivergence = 'volatile';
                warning = {
                    severity: stabilityBounty ? 'high' : 'medium',
                    sourceType: 'engineering',
                    label: stabilityBounty ? '禁术反噬' : '压强牵引',
                    detail: stabilityBounty
                        ? `${activeInfluence.engineeringTrackName}会持续抬高追猎压强，稳线类赏单会被迫在保血和结单之间二选一。`
                        : `${activeInfluence.engineeringTrackName}会放大这条赏单的高压节奏，势力与仇敌都更容易同步加压。`,
                    suggestion: stabilityBounty
                        ? '若坚持稳线赏单，优先准备净化、护盾与一次补给节点。'
                        : '承接前确认本章有足够资源顶住两轮连续硬战。',
                    engineeringTrackId: activeInfluence.engineeringTrackId,
                    engineeringTrackName: activeInfluence.engineeringTrackName,
                    engineeringNote,
                    routeDivergence,
                    nodeTypes: activeInfluence.routeNodeTypes
                };
                break;
            case 'spirit_grotto':
                engineeringNote = aligned || stabilityBounty
                    ? `${activeInfluence.engineeringTrackName}会把这条赏单稳成 ${matchLabels} 的护送线，容错更高。`
                    : `${activeInfluence.engineeringTrackName}更偏 ${targetLabels} 线，这条赏单暂时吃不到稳线补给。`;
                summaryLine = `工程牵引：${engineeringNote}`;
                pressureBias = aligned || stabilityBounty ? '护送稳线' : '补给偏离';
                rewardBias = aligned || stabilityBounty ? '续航兜底' : '补给缩水';
                routeDivergence = aligned || stabilityBounty ? 'stabilized' : 'offset';
                if (pressureBounty && !aligned && !avoidNodeTypes.includes('rest')) {
                    warning = {
                        severity: 'low',
                        sourceType: 'engineering',
                        label: '补给绕行',
                        detail: `${activeInfluence.engineeringTrackName}更偏 ${targetLabels} 线，这条强袭赏单如果吃不到补给，后段会更难控血。`,
                        suggestion: '若打算并行推进，至少给本章留 1 个营地或灵契节点。',
                        engineeringTrackId: activeInfluence.engineeringTrackId,
                        engineeringTrackName: activeInfluence.engineeringTrackName,
                        engineeringNote,
                        routeDivergence,
                        nodeTypes: activeInfluence.routeNodeTypes
                    };
                }
                break;
            default:
                engineeringNote = activeInfluence.summary;
                summaryLine = `工程牵引：${engineeringNote}`;
                break;
        }

        return {
            engineeringTrackId: activeInfluence.engineeringTrackId,
            engineeringTrackName: activeInfluence.engineeringTrackName,
            engineeringTrackIcon: activeInfluence.engineeringTrackIcon,
            engineeringTier: activeInfluence.engineeringTier,
            engineeringTierLabel: activeInfluence.engineeringTierLabel,
            engineeringNote,
            summaryLine,
            pressureBias,
            rewardBias,
            routeDivergence,
            warning
        };
    };

    Game.prototype.getExpeditionObservatoryEngineeringIntel = function (state = null, nemesisForecast = null, bountyConflictWarnings = null, influence = null) {
        const source = state || this.getExpeditionState();
        const link = source?.observatoryLink;
        const activeInfluence = influence || this.getStrategicEngineeringExpeditionInfluence(source);
        if (!source || !link || !activeInfluence) return null;

        const forecast = nemesisForecast || this.getExpeditionNemesisForecast(source);
        const warnings = Array.isArray(bountyConflictWarnings)
            ? bountyConflictWarnings
            : this.getExpeditionBountyConflictWarnings(source);
        const leadWarning = readArray(warnings)[0] || null;
        const targetLabels = formatExpeditionNodeLabels(activeInfluence.routeNodeTypes, '关键线路');
        let huntIntel = '';

        switch (activeInfluence.engineeringTrackId) {
            case 'observatory':
                huntIntel = `${activeInfluence.engineeringTrackName}已把追猎窗口收束到 ${forecast?.windowLabel || '观测链路'}，优先查验 ${targetLabels} 线。`;
                break;
            case 'memory_rift':
                huntIntel = `${activeInfluence.engineeringTrackName}正在把追猎窗口推向 ${forecast?.windowLabel || '裂隙改道'}，记忆裂隙与事件线更容易出现错位现身。`;
                break;
            case 'forbidden_altar':
                huntIntel = `${activeInfluence.engineeringTrackName}正在抬升 ${targetLabels} 线压强，后续追猎窗口会更凶。`;
                break;
            case 'spirit_grotto':
                huntIntel = `${activeInfluence.engineeringTrackName}正在 ${targetLabels} 线布出护送稳线，追猎压力可被提前吸收。`;
                break;
            default:
                huntIntel = activeInfluence.summary;
                break;
        }

        return {
            engineeringTrackId: activeInfluence.engineeringTrackId,
            engineeringTrackName: activeInfluence.engineeringTrackName,
            engineeringTrackIcon: activeInfluence.engineeringTrackIcon,
            engineeringTier: activeInfluence.engineeringTier,
            engineeringTierLabel: activeInfluence.engineeringTierLabel,
            huntIntel,
            conflictPreview: leadWarning
                ? `冲突预告：${leadWarning.line}`
                : `${activeInfluence.engineeringTrackName} 暂未侦测到新的悬赏撕裂，可继续按 ${activeInfluence.routeDirective} 节奏推进。`,
            signalLine: `工程情报：${huntIntel}`
        };
    };

    Game.prototype.getExpeditionNemesisForecast = function (state = null) {
        const source = state || this.getExpeditionState();
        const nemesis = source?.activeNemesis;
        if (!source || !nemesis?.id) return null;

        const status = normalizeNemesisStatus(nemesis.status);
        const statusMeta = getNemesisStatusMeta(status);
        const selectedBranch = source.branchOptions.find((entry) => entry.id === source.selectedBranchId) || null;
        const branchNodeBias = readArray(selectedBranch?.nodeBias).slice(0, 4);
        const activeBounties = this.getActiveExpeditionBounties(source);
        const bountySignalMap = new Map(activeBounties.map((entry) => [entry.id, this.getExpeditionBountySignalModel(source, entry)]));
        const bountyFocusNodeTypes = Array.from(new Set(activeBounties.flatMap((entry) => readArray(bountySignalMap.get(entry.id)?.focusNodeTypes)))).slice(0, 4);
        const hostileFactions = source.factions.filter((entry) => entry.stance <= -2);
        const alliedFactions = source.factions.filter((entry) => entry.stance >= 2);
        const hostilePressureNodeTypes = Array.from(new Set(hostileFactions.flatMap((entry) => readArray(entry.pressureNodeTypes)))).slice(0, 4);
        const alliedSupportNodeTypes = Array.from(new Set(alliedFactions.flatMap((entry) => readArray(entry.supportNodeTypes)))).slice(0, 4);
        const triggerNodeTypes = readArray(nemesis.triggerNodeTypes).slice(0, 4);
        const overlapNodeTypes = Array.from(new Set(triggerNodeTypes.filter((type) => (
            branchNodeBias.includes(type)
            || bountyFocusNodeTypes.includes(type)
            || hostilePressureNodeTypes.includes(type)
        )))).slice(0, 4);
        const focusNodeTypes = overlapNodeTypes.length > 0
            ? overlapNodeTypes
            : (triggerNodeTypes.length > 0 ? triggerNodeTypes : branchNodeBias);
        const focusNodeLabels = getExpeditionNodeLabels(focusNodeTypes, 3);
        const engineeringInfluence = this.getStrategicEngineeringExpeditionInfluence(source);
        const engineeringFocusNodeTypes = engineeringInfluence
            ? Array.from(new Set(
                (focusNodeTypes.length > 0 ? focusNodeTypes : triggerNodeTypes)
                    .filter((type) => engineeringInfluence.routeNodeTypes.includes(type))
            )).slice(0, 4)
            : [];
        const hostileOverlap = hostileFactions.find((entry) => readArray(entry.pressureNodeTypes).some((type) => focusNodeTypes.includes(type))) || null;
        const alliedCover = alliedFactions.find((entry) => readArray(entry.supportNodeTypes).some((type) => focusNodeTypes.includes(type))) || null;
        const baseScoreMap = {
            hunting: 46,
            recurring: 62,
            allied: 69,
            guarding: 84,
            defeated: 12,
            escaped: 34,
            released: 10,
            traded: 14,
            evolved: 76
        };
        let pressureIndex = clampInt(
            (baseScoreMap[status] ?? 42)
            + Math.min(18, overlapNodeTypes.length * 7)
            + Math.min(16, clampInt(nemesis.engagedCount, 0, 99) * 4)
            + Math.min(18, clampInt(nemesis.recurrenceCount, 0, 9) * 8)
            + (nemesis.alliedFactionName ? 8 : 0)
            + (nemesis.clueRevealed ? 4 : 0)
            + (activeBounties.length > 0 && overlapNodeTypes.some((type) => bountyFocusNodeTypes.includes(type)) ? 6 : 0)
            - (alliedSupportNodeTypes.some((type) => focusNodeTypes.includes(type)) ? 4 : 0),
            0,
            100
        );
        let nextWindowLabel = status === 'guarding'
            ? '终章首领窗口'
            : status === 'allied'
                ? `下个 ${formatExpeditionNodeLabels(focusNodeTypes, '合围')} 节点`
                : status === 'recurring'
                    ? `下个 ${formatExpeditionNodeLabels(focusNodeTypes, '复现')} 窗口`
                    : status === 'evolved'
                        ? '后续章节同类线路'
                        : ['defeated', 'released', 'traded'].includes(status)
                            ? '本章已结算'
                            : status === 'escaped'
                                ? '章末外溢窗口'
                                : `下个 ${formatExpeditionNodeLabels(focusNodeTypes, '追猎')} 窗口`;

        const drivers = [];
        if (selectedBranch && overlapNodeTypes.some((type) => branchNodeBias.includes(type))) {
            drivers.push(`当前路线会把你送进 ${formatExpeditionNodeLabels(overlapNodeTypes.filter((type) => branchNodeBias.includes(type)), '关键线路')} 线。`);
        }
        if (activeBounties.length > 0 && overlapNodeTypes.some((type) => bountyFocusNodeTypes.includes(type))) {
            drivers.push(`在途悬赏会催你继续踏入 ${formatExpeditionNodeLabels(overlapNodeTypes.filter((type) => bountyFocusNodeTypes.includes(type)), '追猎')} 线。`);
        }
        if (hostileOverlap) {
            drivers.push(`${hostileOverlap.name} 已在 ${formatExpeditionNodeLabels(hostileOverlap.pressureNodeTypes, '高压')} 线加压。`);
        }
        if (nemesis.alliedFactionName) {
            drivers.push(`该仇敌已投靠 ${nemesis.alliedFactionName}，会更倾向在合围节点现身。`);
        }
        if (nemesis.clueRevealed && nemesis.clueLine) {
            drivers.push(`线索指向：${nemesis.clueLine}`);
        }
        if (nemesis.outcomeNote && ['defeated', 'released', 'traded', 'escaped'].includes(status)) {
            drivers.push(nemesis.outcomeNote);
        }

        let engineeringModifier = '';
        let engineeringNote = '';
        const settledWindow = ['defeated', 'released', 'traded', 'escaped', 'evolved'].includes(status);
        if (engineeringInfluence) {
            const engineeringLabels = formatExpeditionNodeLabels(
                engineeringFocusNodeTypes.length > 0 ? engineeringFocusNodeTypes : engineeringInfluence.routeNodeTypes,
                '关键线路'
            );
            engineeringModifier = engineeringInfluence.nemesisModifier;
            switch (engineeringInfluence.engineeringTrackId) {
                case 'observatory':
                    pressureIndex = clampInt(pressureIndex + engineeringInfluence.pressureDelta - (engineeringFocusNodeTypes.length > 0 ? 2 : 0), 0, 100);
                    if (!settledWindow) nextWindowLabel = `${engineeringModifier} · ${nextWindowLabel}`;
                    drivers.unshift(`${engineeringInfluence.engineeringTrackName} 已把追猎窗口提前暴露到 ${engineeringLabels} 线。`);
                    engineeringNote = `${engineeringInfluence.engineeringTrackName}正在收束追猎窗口，${engineeringLabels} 线会更早给出预警。`;
                    break;
                case 'memory_rift':
                    pressureIndex = clampInt(pressureIndex + engineeringInfluence.pressureDelta + (engineeringFocusNodeTypes.length > 0 ? 2 : 0), 0, 100);
                    if (!settledWindow) nextWindowLabel = `${engineeringModifier} · ${nextWindowLabel}`;
                    drivers.unshift(`${engineeringInfluence.engineeringTrackName} 正把追猎窗口拖向 ${engineeringLabels} 线，现身时机会更跳跃。`);
                    engineeringNote = `${engineeringInfluence.engineeringTrackName}会让追猎窗口更易错位，奖励更高但路线波动更强。`;
                    break;
                case 'forbidden_altar':
                    pressureIndex = clampInt(pressureIndex + engineeringInfluence.pressureDelta + 2, 0, 100);
                    if (!settledWindow) nextWindowLabel = `${engineeringModifier} · ${nextWindowLabel}`;
                    drivers.unshift(`${engineeringInfluence.engineeringTrackName} 正在抬升 ${engineeringLabels} 线压强，这次追猎会更凶。`);
                    engineeringNote = `${engineeringInfluence.engineeringTrackName}会同步放大仇敌压强与势力反噬。`;
                    break;
                case 'spirit_grotto':
                    pressureIndex = clampInt(pressureIndex + engineeringInfluence.pressureDelta, 0, 100);
                    if (!settledWindow) nextWindowLabel = `${engineeringModifier} · ${nextWindowLabel}`;
                    drivers.unshift(`${engineeringInfluence.engineeringTrackName} 正在 ${engineeringLabels} 线铺出护送稳线。`);
                    engineeringNote = `${engineeringInfluence.engineeringTrackName}会替这条追猎线提供额外缓冲与稳线空间。`;
                    break;
                default:
                    engineeringNote = engineeringInfluence.summary;
                    break;
            }
        }

        const pressureMeta = getNemesisPressureMeta(pressureIndex);
        let line = status === 'guarding'
            ? `${nemesis.name} 将在终章首领窗口以「${this.chooseExpeditionNemesisVariant(source, 'boss').label || '护卫终局'}」施压。`
            : ['defeated', 'released', 'traded'].includes(status)
                ? `${nemesis.name} · ${statusMeta.label} · ${nemesis.outcomeNote || '当前追猎线已阶段性结算。'}`
                : `${nemesis.name} · ${nextWindowLabel} · ${drivers[0] || `预计会在 ${formatExpeditionNodeLabels(focusNodeTypes, '关键线路')} 线继续施压。`}`;

        let counterplay = status === 'guarding'
            ? '终章前保留净化、护盾与一轮爆发，避免护卫战把答卷直接锁死。'
            : status === 'allied'
                ? `${nemesis.alliedFactionName || hostileOverlap?.name || '敌对势力'} 已参与追猎，先拆敌意路线或改走 ${formatExpeditionNodeLabels(focusNodeTypes, '低压')} 线。`
                : status === 'recurring'
                    ? '它已经记住了上次暴露的缺口，下一次接战前先补好护盾与过牌。'
                    : status === 'escaped'
                        ? '章末外溢说明你没把追猎线收干净，后续优先选能提前锁线的事件与观星节点。'
                        : status === 'evolved'
                            ? '同类追猎题会在后续变得更凶，接下来要优先做能稳血和拆压制的构筑。'
                            : ['defeated', 'released', 'traded'].includes(status)
                                ? '当前可把资源重新转回章节主线，把追猎收益兑现成收官优势。'
                            : alliedCover
                                ? `${alliedCover.name} 能在这条线提供援护，先借支援稳住再找反打窗口。`
                                : `在 ${formatExpeditionNodeLabels(focusNodeTypes, '关键线路')} 线保留 1 轮爆发或控制链，别让它先手滚雪球。`;
        if (engineeringInfluence) {
            switch (engineeringInfluence.engineeringTrackId) {
                case 'observatory':
                    counterplay = `${counterplay} 优先把观星 / 事件节点的预警转成先手资源。`;
                    break;
                case 'memory_rift':
                    counterplay = `${counterplay} 经过记忆裂隙或黑市分岔时，记得给改线与补给留一个节点。`;
                    break;
                case 'forbidden_altar':
                    counterplay = `${counterplay} 提前备好净化、护盾与一次爆发，避免血契压强连续滚大。`;
                    break;
                case 'spirit_grotto':
                    counterplay = `${counterplay} 优先借灵契 / 营地节点稳住血线，再决定要不要硬接追猎。`;
                    break;
                default:
                    break;
            }
        }
        if (engineeringNote && !/工程/.test(line)) {
            line = `${line} ${engineeringNote}`;
        }

        return {
            nemesisId: nemesis.id,
            nemesisName: nemesis.name,
            status,
            statusLabel: statusMeta.label,
            pressureIndex,
            pressureTier: pressureMeta.tierId,
            pressureLabel: pressureMeta.label,
            windowLabel: nextWindowLabel,
            focusNodeTypes,
            focusNodeLabels,
            driverLines: drivers.slice(0, 4),
            line,
            counterplay,
            engineeringTrackId: engineeringInfluence?.engineeringTrackId || '',
            engineeringTrackName: engineeringInfluence?.engineeringTrackName || '',
            engineeringModifier,
            engineeringNote
        };
    };

    Game.prototype.buildExpeditionConflictWarning = function (bounty = null, source = {}) {
        return normalizeConflictWarning({
            id: source.id || `${bounty?.id || 'bounty'}_${source.sourceType || 'system'}_${source.label || 'warning'}_${source.factionId || 'none'}`,
            bountyId: bounty?.id || '',
            bountyName: bounty?.name || '当前悬赏',
            severity: source.severity || 'low',
            sourceType: source.sourceType || 'system',
            label: source.label || '冲突提示',
            detail: source.detail || '',
            suggestion: source.suggestion || '',
            factionId: source.factionId || '',
            factionName: source.factionName || '',
            engineeringTrackId: source.engineeringTrackId || '',
            engineeringTrackName: source.engineeringTrackName || '',
            engineeringThemeLabel: source.engineeringThemeLabel || '',
            engineeringNote: source.engineeringNote || '',
            routeDivergence: source.routeDivergence || '',
            nodeTypes: source.nodeTypes || [],
            line: source.line || ''
        });
    };

    Game.prototype.getExpeditionBountySignalModel = function (state = null, bounty = null) {
        const source = state || this.getExpeditionState();
        if (!source || !bounty) {
            return {
                focusNodeTypes: [],
                avoidNodeTypes: [],
                conflictWarnings: [],
                summaryLine: '暂无悬赏情报',
                engineeringTrackId: '',
                engineeringTrackName: '',
                engineeringNote: '',
                routeDivergence: 'stable',
                pressureBias: '常规',
                rewardBias: '均衡'
            };
        }
        const selectedBranch = source.branchOptions.find((entry) => entry.id === source.selectedBranchId) || null;
        const branchBias = readArray(selectedBranch?.nodeBias).map((value) => String(value || ''));
        const focusNodeTypes = getBountyFocusNodeTypes(bounty);
        const avoidNodeTypes = getBountyAvoidNodeTypes(bounty);
        const focusLabels = focusNodeTypes.map((type) => getExpeditionNodeLabel(type));
        const warnings = [];
        const engineeringInfluence = this.getStrategicEngineeringExpeditionInfluence(source);
        const engineeringInsight = this.getExpeditionBountyEngineeringInsight(source, bounty, selectedBranch, engineeringInfluence);

        if (selectedBranch) {
            if (focusNodeTypes.length > 0 && !focusNodeTypes.some((type) => branchBias.includes(type))) {
                warnings.push(this.buildExpeditionConflictWarning(bounty, {
                    severity: 'high',
                    sourceType: 'route',
                    label: '路线错位',
                    detail: `当前支线「${selectedBranch.name}」较少自然经过 ${focusLabels.join(' / ')}，完成线会偏紧。`,
                    suggestion: `若坚持这条支线，优先把可见的 ${focusLabels[0] || '关键'} 节点留给该悬赏。`,
                    nodeTypes: focusNodeTypes
                }));
            }
            if (avoidNodeTypes.some((type) => branchBias.includes(type))) {
                warnings.push(this.buildExpeditionConflictWarning(bounty, {
                    severity: 'medium',
                    sourceType: 'route',
                    label: '路线牵制',
                    detail: `当前支线会频繁把你引向 ${avoidNodeTypes.map((type) => getExpeditionNodeLabel(type)).join(' / ')}，容错会被压缩。`,
                    suggestion: '先确认补给余量，再决定是否并行推进这条赏单。',
                    nodeTypes: avoidNodeTypes
                }));
            }
        } else if (focusNodeTypes.length > 0) {
            warnings.push(this.buildExpeditionConflictWarning(bounty, {
                severity: 'low',
                sourceType: 'route',
                label: '尚未锁线',
                detail: `这条悬赏依赖 ${focusLabels.join(' / ')} 节点，最好先选定支线再承接。`,
                suggestion: '先看支线分布，再决定是否把它放进本章主目标。 ',
                nodeTypes: focusNodeTypes
            }));
        }

        readArray(source.factions).forEach((faction) => {
            const dislikedFocus = focusNodeTypes.filter((type) => readArray(faction.dislikes).includes(type));
            if (dislikedFocus.length > 0) {
                warnings.push(this.buildExpeditionConflictWarning(bounty, {
                    severity: Number(faction.stance) <= -1 ? 'high' : 'medium',
                    sourceType: 'faction',
                    label: '关系反噬',
                    detail: `${faction.name} 反感 ${dislikedFocus.map((type) => getExpeditionNodeLabel(type)).join(' / ')} 线，继续推进会拉低态度。`,
                    suggestion: `若必须接单，留意 ${faction.name} 后续是否会转入敌意阈值。`,
                    factionId: faction.id,
                    factionName: faction.name,
                    nodeTypes: dislikedFocus
                }));
            }
            const hostilePressure = focusNodeTypes.filter((type) => (
                Number(faction.stance) <= -1
                && (readArray(faction.pressureNodeTypes).includes(type) || readArray(faction.likes).includes(type))
            ));
            if (hostilePressure.length > 0) {
                warnings.push(this.buildExpeditionConflictWarning(bounty, {
                    severity: Number(faction.stance) <= -2 ? 'high' : 'medium',
                    sourceType: 'faction',
                    label: '势力牵制',
                    detail: `${faction.name} 已在 ${hostilePressure.map((type) => getExpeditionNodeLabel(type)).join(' / ')} 线加压，这条赏单更容易被拖慢。`,
                    suggestion: `尽量在资源充足时推进，避免被 ${faction.name} 的压制节奏反咬。`,
                    factionId: faction.id,
                    factionName: faction.name,
                    nodeTypes: hostilePressure
                }));
            }
        });

        const peerBounties = this.getActiveExpeditionBounties(source).filter((entry) => entry.id !== bounty.id);
        peerBounties.forEach((entry) => {
            if (
                (isPressureBounty(bounty) && isStabilityBounty(entry))
                || (isStabilityBounty(bounty) && isPressureBounty(entry))
            ) {
                warnings.push(this.buildExpeditionConflictWarning(bounty, {
                    severity: 'medium',
                    sourceType: 'peer_bounty',
                    label: '目标拉扯',
                    detail: `与「${entry.name}」并行时，会在抢节奏和稳血线之间反复拉扯。`,
                    suggestion: '若手感开始吃紧，优先保住更接近完成的一条赏单。'
                }));
            }
        });

        if (engineeringInsight?.warning) {
            warnings.push(this.buildExpeditionConflictWarning(bounty, engineeringInsight.warning));
        }

        const deduped = warnings.reduce((list, entry) => {
            const key = [entry.bountyId, entry.sourceType, entry.label, entry.factionId, entry.nodeTypes.join(',')].join('|');
            if (!list.some((item) => [item.bountyId, item.sourceType, item.label, item.factionId, item.nodeTypes.join(',')].join('|') === key)) {
                list.push(entry);
            }
            return list;
        }, []).sort((a, b) => (
            getConflictSeverityWeight(b.severity) - getConflictSeverityWeight(a.severity)
            || a.label.localeCompare(b.label, 'zh-Hans-CN')
        ));

        let summaryLine = '当前赏单与路线暂未出现明显冲突。';
        if (engineeringInsight?.summaryLine) {
            summaryLine = engineeringInsight.summaryLine;
        } else if (deduped.length > 0) {
            const lead = deduped[0];
            summaryLine = `${lead.bountyName} · ${lead.label}${lead.detail ? `：${lead.detail}` : ''}`;
        } else if (selectedBranch && focusLabels.length > 0) {
            summaryLine = `当前支线「${selectedBranch.name}」能自然推进 ${focusLabels.join(' / ')} 目标。`;
        } else if (focusLabels.length > 0) {
            summaryLine = `这条悬赏主要围绕 ${focusLabels.join(' / ')} 节点展开。`;
        }

        return {
            focusNodeTypes,
            avoidNodeTypes,
            conflictWarnings: deduped.slice(0, 3),
            summaryLine,
            engineeringTrackId: engineeringInsight?.engineeringTrackId || '',
            engineeringTrackName: engineeringInsight?.engineeringTrackName || '',
            engineeringNote: engineeringInsight?.engineeringNote || '',
            routeDivergence: engineeringInsight?.routeDivergence || 'stable',
            pressureBias: engineeringInsight?.pressureBias || '常规',
            rewardBias: engineeringInsight?.rewardBias || '均衡'
        };
    };

    Game.prototype.getExpeditionBountyConflictWarnings = function (state = null, signalMap = null) {
        const source = state || this.getExpeditionState();
        if (!source) return [];
        const map = signalMap instanceof Map ? signalMap : new Map();
        const warnings = this.getActiveExpeditionBounties(source).flatMap((entry) => {
            if (!map.has(entry.id)) {
                map.set(entry.id, this.getExpeditionBountySignalModel(source, entry));
            }
            return readArray(map.get(entry.id)?.conflictWarnings);
        });
        return warnings
            .map((entry, index) => normalizeConflictWarning(entry, index))
            .sort((a, b) => getConflictSeverityWeight(b.severity) - getConflictSeverityWeight(a.severity))
            .slice(0, 4);
    };

    Game.prototype.applyExpeditionFactionShift = function (factionId = '', delta = 0, reason = '', options = {}) {
        const state = this.getExpeditionState();
        if (!state || !factionId || !delta) return null;
        const target = this.applyExpeditionFactionDelta(state, factionId, delta, reason, {
            sourceType: options.sourceType || 'system',
            forceLog: !!options.forceLog
        });
        if (!target) return null;
        this.expeditionState = state;
        this.persistActiveExpeditionState();
        if (!options.silent && typeof Utils !== 'undefined' && Utils?.showBattleLog) {
            Utils.showBattleLog(`【势力】${target.name}${Number(target.stance) >= 0 && delta > 0 ? '态度转暖' : '态度转冷'}：${target.lastReason}`);
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
                this.applyExpeditionFactionDelta(state, factionId, delta, `你把本章路线锚定到「${target.name}」。`, {
                    sourceType: 'branch'
                });
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
                const signal = this.getExpeditionBountySignalModel(state, bounty);
                const leadWarning = readArray(signal.conflictWarnings)[0];
                if (leadWarning) {
                    Utils.showBattleLog(`【悬赏研判】${leadWarning.label}：${leadWarning.detail}`);
                }
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
                this.applyExpeditionFactionDelta(state, faction.id, 1, `你在「${getExpeditionNodeLabel(type)}」线上推进了一步，顺着他们认可的章法前进。`, {
                    sourceType: 'node_visit'
                });
            }
            if (faction.dislikes.includes(type)) {
                this.applyExpeditionFactionDelta(state, faction.id, -1, `你触碰了「${getExpeditionNodeLabel(type)}」节点，这正是他们最反感的做法。`, {
                    sourceType: 'node_visit'
                });
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
            this.appendExpeditionNemesisHistory(state, {
                status: nemesis.status,
                severity: ['guarding', 'allied'].includes(nemesis.status) ? 'high' : 'medium',
                title: `${nemesis.name} · ${variant.label || '追猎压制'}`,
                detail: `${nemesis.name} 在「${getExpeditionNodeLabel(nodeType)}」线现身，准备以 ${variant.label || '追猎压制'} 开战。`,
                counterplay: this.getExpeditionNemesisForecast(state)?.counterplay || '',
                nodeTypes: [nodeType],
                sourceType: 'encounter'
            });
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
                this.applyExpeditionFactionDelta(state, faction.id, 1, `你在「${getExpeditionNodeLabel(nodeType)}」节点打穿了压力线，证明这条路值得继续。`, {
                    sourceType: 'battle_victory'
                });
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
                this.appendExpeditionNemesisHistory(state, {
                    status: state.activeNemesis.status,
                    severity: 'high',
                    title: `${state.activeNemesis.name} · 复现中`,
                    detail: state.activeNemesis.outcomeNote,
                    counterplay: this.getExpeditionNemesisForecast(state)?.counterplay || '',
                    nodeTypes: [nodeType],
                    sourceType: 'recurring'
                });
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
        const recentFactionLogs = state ? this.getRecentExpeditionFactionLogs(state, 4) : [];
        const recentNemesisLogs = state ? this.getRecentExpeditionNemesisLogs(state, 4) : [];
        const engineeringInfluence = state ? this.getStrategicEngineeringExpeditionInfluence(state) : null;
        const nemesisForecast = state ? this.getExpeditionNemesisForecast(state) : null;
        const branchEngineeringMap = new Map();
        readArray(state?.branchOptions).forEach((entry) => {
            branchEngineeringMap.set(entry.id, state ? this.getExpeditionBranchEngineeringInsight(state, entry, engineeringInfluence) : null);
        });
        const bountySignalMap = new Map();
        readArray(state?.bountyDraft).forEach((entry) => {
            bountySignalMap.set(entry.id, state ? this.getExpeditionBountySignalModel(state, entry) : {
                focusNodeTypes: [],
                avoidNodeTypes: [],
                conflictWarnings: [],
                summaryLine: '暂无悬赏情报',
                engineeringTrackId: '',
                engineeringTrackName: '',
                engineeringNote: '',
                routeDivergence: 'stable',
                pressureBias: '常规',
                rewardBias: '均衡'
            });
        });
        const bountyConflictWarnings = state ? this.getExpeditionBountyConflictWarnings(state, bountySignalMap) : [];
        const observatoryEngineering = state
            ? this.getExpeditionObservatoryEngineeringIntel(state, nemesisForecast, bountyConflictWarnings, engineeringInfluence)
            : null;
        const selectedBranchEngineering = state?.selectedBranchId
            ? branchEngineeringMap.get(state.selectedBranchId) || null
            : null;
        const serializeWarning = (warning = null) => ({
            id: warning?.id || '',
            severity: warning?.severity || 'low',
            label: warning?.label || '',
            detail: warning?.detail || '',
            suggestion: warning?.suggestion || '',
            factionId: warning?.factionId || '',
            factionName: warning?.factionName || '',
            engineeringTrackId: warning?.engineeringTrackId || '',
            engineeringTrackName: warning?.engineeringTrackName || '',
            engineeringNote: warning?.engineeringNote || '',
            routeDivergence: warning?.routeDivergence || '',
            line: warning?.line || ''
        });
        return {
            chapterIndex: state?.chapterIndex || latestSlate?.chapterIndex || 0,
            chapterName: state?.chapterFullName || latestSlate?.chapterName || '',
            selectedBranchId: state?.selectedBranchId || '',
            selectedBranchName: state?.branchOptions?.find((entry) => entry.id === state.selectedBranchId)?.name || '',
            engineeringLink: engineeringInfluence
                ? {
                    trackId: engineeringInfluence.engineeringTrackId,
                    name: engineeringInfluence.engineeringTrackName,
                    icon: engineeringInfluence.engineeringTrackIcon,
                    tier: engineeringInfluence.engineeringTier,
                    tierLabel: engineeringInfluence.engineeringTierLabel,
                    routeDirective: engineeringInfluence.routeDirective,
                    pressureBias: engineeringInfluence.pressureBias,
                    rewardBias: engineeringInfluence.rewardBias,
                    summary: engineeringInfluence.summary,
                    line: selectedBranchEngineering?.engineeringNote || observatoryEngineering?.huntIntel || engineeringInfluence.summary
                }
                : null,
            branchOptions: readArray(state?.branchOptions).map((entry) => ({
                id: entry.id,
                name: entry.name,
                tone: entry.tone,
                selected: entry.id === state.selectedBranchId,
                recommended: this.isExpeditionRecommendedBranch(state, entry.id),
                engineeringTrackId: branchEngineeringMap.get(entry.id)?.engineeringTrackId || '',
                engineeringTrackName: branchEngineeringMap.get(entry.id)?.engineeringTrackName || '',
                engineeringNote: branchEngineeringMap.get(entry.id)?.engineeringNote || '',
                routeDivergence: branchEngineeringMap.get(entry.id)?.routeDivergence || '',
                pressureBias: branchEngineeringMap.get(entry.id)?.pressureBias || '',
                rewardBias: branchEngineeringMap.get(entry.id)?.rewardBias || ''
            })),
            bountyDraft: readArray(state?.bountyDraft).map((entry) => ({
                id: entry.id,
                name: entry.name,
                type: entry.type,
                active: readArray(state?.activeBountyIds).includes(entry.id),
                progress: entry.progress,
                progressText: getBountyProgressLabel(entry),
                completed: !!entry.completed,
                focusNodeTypes: readArray(bountySignalMap.get(entry.id)?.focusNodeTypes),
                conflictWarnings: readArray(bountySignalMap.get(entry.id)?.conflictWarnings).map((warning) => serializeWarning(warning)),
                conflictLabels: readArray(bountySignalMap.get(entry.id)?.conflictWarnings).map((warning) => warning.label),
                signalLine: String(bountySignalMap.get(entry.id)?.summaryLine || ''),
                engineeringTrackId: String(bountySignalMap.get(entry.id)?.engineeringTrackId || ''),
                engineeringTrackName: String(bountySignalMap.get(entry.id)?.engineeringTrackName || ''),
                engineeringNote: String(bountySignalMap.get(entry.id)?.engineeringNote || ''),
                routeDivergence: String(bountySignalMap.get(entry.id)?.routeDivergence || ''),
                pressureBias: String(bountySignalMap.get(entry.id)?.pressureBias || ''),
                rewardBias: String(bountySignalMap.get(entry.id)?.rewardBias || '')
            })),
            activeBounties: activeBounties.map((entry) => ({
                id: entry.id,
                name: entry.name,
                progress: entry.progress,
                progressText: getBountyProgressLabel(entry),
                completed: !!entry.completed,
                conflictWarnings: readArray(bountySignalMap.get(entry.id)?.conflictWarnings).map((warning) => serializeWarning(warning)),
                signalLine: String(bountySignalMap.get(entry.id)?.summaryLine || ''),
                engineeringTrackId: String(bountySignalMap.get(entry.id)?.engineeringTrackId || ''),
                engineeringTrackName: String(bountySignalMap.get(entry.id)?.engineeringTrackName || ''),
                engineeringNote: String(bountySignalMap.get(entry.id)?.engineeringNote || ''),
                routeDivergence: String(bountySignalMap.get(entry.id)?.routeDivergence || ''),
                pressureBias: String(bountySignalMap.get(entry.id)?.pressureBias || ''),
                rewardBias: String(bountySignalMap.get(entry.id)?.rewardBias || '')
            })),
            factions: readArray(state?.factions).map((entry) => ({
                id: entry.id,
                name: entry.name,
                stance: entry.stance,
                status: getFactionStatusMeta(entry.stance).label,
                lastReason: entry.lastReason || ''
            })),
            recentFactionLogs: recentFactionLogs.map((entry) => ({
                id: entry.id,
                factionId: entry.factionId,
                factionName: entry.factionName,
                delta: entry.delta,
                deltaLabel: entry.deltaLabel,
                stanceAfter: entry.stanceAfter,
                stanceLabel: entry.stanceLabel,
                reason: entry.reason,
                line: entry.line,
                sourceType: entry.sourceType
            })),
            recentNemesisLogs: recentNemesisLogs.map((entry) => ({
                id: entry.id,
                status: entry.status,
                statusLabel: entry.statusLabel,
                severity: entry.severity,
                title: entry.title,
                detail: entry.detail,
                counterplay: entry.counterplay,
                line: entry.line,
                sourceType: entry.sourceType,
                nodeTypes: readArray(entry.nodeTypes)
            })),
            bountyConflictWarnings: bountyConflictWarnings.map((entry) => ({
                id: entry.id,
                bountyId: entry.bountyId,
                bountyName: entry.bountyName,
                severity: entry.severity,
                label: entry.label,
                detail: entry.detail,
                suggestion: entry.suggestion,
                factionId: entry.factionId,
                factionName: entry.factionName,
                engineeringTrackId: entry.engineeringTrackId || '',
                engineeringTrackName: entry.engineeringTrackName || '',
                engineeringNote: entry.engineeringNote || '',
                routeDivergence: entry.routeDivergence || '',
                line: entry.line
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
            nemesisForecast: nemesisForecast
                ? {
                    nemesisId: nemesisForecast.nemesisId,
                    nemesisName: nemesisForecast.nemesisName,
                    status: nemesisForecast.status,
                    statusLabel: nemesisForecast.statusLabel,
                    pressureIndex: nemesisForecast.pressureIndex,
                    pressureTier: nemesisForecast.pressureTier,
                    pressureLabel: nemesisForecast.pressureLabel,
                    windowLabel: nemesisForecast.windowLabel,
                    focusNodeTypes: readArray(nemesisForecast.focusNodeTypes),
                    focusNodeLabels: readArray(nemesisForecast.focusNodeLabels),
                    driverLines: readArray(nemesisForecast.driverLines),
                    line: nemesisForecast.line,
                    counterplay: nemesisForecast.counterplay,
                    engineeringTrackId: nemesisForecast.engineeringTrackId || '',
                    engineeringTrackName: nemesisForecast.engineeringTrackName || '',
                    engineeringModifier: nemesisForecast.engineeringModifier || '',
                    engineeringNote: nemesisForecast.engineeringNote || ''
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
                    selectedBonusConsumed: !!selectedObservatoryBonus?.consumed,
                    engineeringTrackId: observatoryEngineering?.engineeringTrackId || '',
                    engineeringTrackName: observatoryEngineering?.engineeringTrackName || '',
                    engineeringTierLabel: observatoryEngineering?.engineeringTierLabel || '',
                    huntIntel: observatoryEngineering?.huntIntel || '',
                    conflictPreview: observatoryEngineering?.conflictPreview || ''
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
        const recentFactionLogs = this.getRecentExpeditionFactionLogs(state, 4);
        const recentNemesisLogs = this.getRecentExpeditionNemesisLogs(state, 3);
        const engineeringInfluence = this.getStrategicEngineeringExpeditionInfluence(state);
        const nemesisForecast = this.getExpeditionNemesisForecast(state);
        const branchEngineeringMap = new Map(state.branchOptions.map((entry) => [
            entry.id,
            this.getExpeditionBranchEngineeringInsight(state, entry, engineeringInfluence)
        ]));
        const bountySignalMap = new Map(state.bountyDraft.map((entry) => [entry.id, this.getExpeditionBountySignalModel(state, entry)]));
        const bountyConflictWarnings = this.getExpeditionBountyConflictWarnings(state, bountySignalMap);
        const observatoryEngineering = this.getExpeditionObservatoryEngineeringIntel(state, nemesisForecast, bountyConflictWarnings, engineeringInfluence);
        container.style.display = 'grid';
        container.innerHTML = `
            <section class="expedition-panel-card expedition-overview-card">
                <div class="expedition-card-kicker">裂界远征</div>
                <div class="expedition-card-title">本章目标 · ${escapeHtml(state.chapterFullName || state.chapterName)}</div>
                <div class="expedition-card-note">${escapeHtml(selectedBranch ? `当前支线：${selectedBranch.name}` : '请选择 1 条支线区域锁定本章路线。')}${observatoryLink?.sourceTitle ? ` 当前观星线索：${observatoryLink.sourceTitle}。` : ''}${engineeringInfluence ? ` 工程主轴：${engineeringInfluence.engineeringTrackIcon} ${engineeringInfluence.engineeringTrackName} ${engineeringInfluence.engineeringTierLabel} · ${engineeringInfluence.routeDirective}。` : ''}</div>
                <div class="expedition-chip-row">
                    <span class="expedition-chip">${escapeHtml(ending.icon)} ${escapeHtml(ending.name)}</span>
                    <span class="expedition-chip">${escapeHtml(activeBounties.length)}/${MAX_ACTIVE_BOUNTIES} 条悬赏</span>
                    <span class="expedition-chip">${escapeHtml(state.activeNemesis?.name || '暂无仇敌')} · ${escapeHtml(nemesisMeta.label || '未定')}</span>
                    ${nemesisForecast?.pressureLabel ? `<span class="expedition-chip">${escapeHtml(`追猎预判 · ${nemesisForecast.pressureLabel}`)}</span>` : ''}
                    ${engineeringInfluence ? `<span class="expedition-chip">${escapeHtml(`工程主轴 · ${engineeringInfluence.engineeringTrackName} ${engineeringInfluence.engineeringTierLabel}`)}</span>` : ''}
                    ${observatoryLink?.sourceThemeLabel ? `<span class="expedition-chip">${escapeHtml(observatoryLink.sourceThemeLabel)} · 观星样本</span>` : ''}
                    ${selectedObservatoryBonus?.label ? `<span class="expedition-chip">${escapeHtml(selectedObservatoryBonus.label)}${selectedObservatoryBonus.consumed ? ' · 已触发' : ''}</span>` : ''}
                </div>
            </section>
            <section class="expedition-panel-card">
                <div class="expedition-card-kicker">支线区域</div>
                <div class="expedition-card-title">选择本章路线</div>
                <div class="expedition-choice-list">
                    ${state.branchOptions.map((entry) => {
            const branchEngineering = branchEngineeringMap.get(entry.id);
            return `
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
                            ${branchEngineering?.engineeringNote
                ? `<div class="expedition-choice-meta">
                                    <span>${escapeHtml(`工程偏向：${branchEngineering.pressureBias || '常规'}`)}</span>
                                    <span>${escapeHtml(`工程收益：${branchEngineering.rewardBias || '均衡'}`)}</span>
                                </div>
                                <div class="expedition-observatory-note">${escapeHtml(`工程联动：${branchEngineering.engineeringNote}`)}</div>`
                : ''}
                            ${this.isExpeditionRecommendedBranch(state, entry.id)
                ? `<div class="expedition-observatory-note">观星建议：这条路线更贴近「${escapeHtml(observatoryLink?.sourceThemeLabel || '精选命盘')}」的样本节奏。</div>`
                : ''}
                            <button type="button" class="collection-inline-btn ${entry.id === state.selectedBranchId ? 'secondary' : ''}"
                                onclick="game.selectExpeditionBranch('${escapeHtml(entry.id)}')">${entry.id === state.selectedBranchId ? '当前路线' : '锁定路线'}</button>
                        </article>
                    `;
        }).join('')}
                </div>
            </section>
            <section class="expedition-panel-card">
                <div class="expedition-card-kicker">章节悬赏</div>
                <div class="expedition-card-title">承接 1-2 条</div>
                <div class="expedition-choice-list">
                    ${state.bountyDraft.map((entry) => {
            const signal = bountySignalMap.get(entry.id) || { conflictWarnings: [], summaryLine: '暂无悬赏情报' };
            return `
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
                            ${signal.conflictWarnings.length > 0
                    ? `<div class="expedition-warning-list">
                                    ${signal.conflictWarnings.slice(0, 2).map((warning) => `
                                        <div class="expedition-warning-item ${escapeHtml(warning.severity)}">
                                            <strong>${escapeHtml(warning.label)}</strong>
                                            <span>${escapeHtml(warning.detail)}</span>
                                        </div>
                                    `).join('')}
                                </div>`
                    : `<div class="expedition-observatory-note expedition-bounty-signal">${escapeHtml(signal.summaryLine || '当前赏单与路线暂未出现明显冲突。')}</div>`}
                            ${signal.engineeringNote
                    ? `<div class="expedition-observatory-note expedition-bounty-signal">${escapeHtml(`工程联动：${signal.engineeringNote}`)}</div>`
                    : ''}
                            <button type="button" class="collection-inline-btn ${state.activeBountyIds.includes(entry.id) ? 'secondary' : ''}"
                                onclick="game.toggleExpeditionBounty('${escapeHtml(entry.id)}')">${state.activeBountyIds.includes(entry.id) ? '取消承接' : '承接悬赏'}</button>
                        </article>
                    `;
        }).join('')}
                </div>
            </section>
            <section class="expedition-panel-card expedition-signals-card">
                <div class="expedition-card-kicker">态势研判</div>
                <div class="expedition-card-title">关系回看、追猎预判与冲突提示</div>
                ${engineeringInfluence ? `<div class="expedition-observatory-note">${escapeHtml(`工程联动：${engineeringInfluence.summary}`)}</div>` : ''}
                <div class="expedition-signal-grid">
                    <div class="expedition-signal-block">
                        <div class="expedition-choice-head">
                            <strong>最近势力变化</strong>
                            <span>${escapeHtml(recentFactionLogs.length > 0 ? `最近 ${recentFactionLogs.length} 条` : '暂无新波动')}</span>
                        </div>
                        ${recentFactionLogs.length > 0
                ? `<div class="expedition-signal-list">
                                ${recentFactionLogs.map((entry) => `
                                    <article class="expedition-signal-item">
                                        <strong>${escapeHtml(entry.factionName)} ${escapeHtml(entry.delta ? `${entry.delta > 0 ? '↑' : '↓'}${Math.abs(entry.delta)}` : entry.stanceLabel)}</strong>
                                        <span>${escapeHtml(entry.reason)}</span>
                                    </article>
                                `).join('')}
                            </div>`
                : '<div class="expedition-empty-note">最近还没有新的势力波动，先锁路线或踩关键节点再观察本章关系转折。</div>'}
                    </div>
                    <div class="expedition-signal-block warning">
                        <div class="expedition-choice-head">
                            <strong>悬赏冲突提示</strong>
                            <span>${escapeHtml(bountyConflictWarnings.length > 0 ? `进行中 ${bountyConflictWarnings.length} 条` : '当前稳定')}</span>
                        </div>
                        ${bountyConflictWarnings.length > 0
                ? `<div class="expedition-signal-list">
                                ${bountyConflictWarnings.map((entry) => `
                                    <article class="expedition-signal-item warning ${escapeHtml(entry.severity)}">
                                        <strong>${escapeHtml(entry.bountyName)} · ${escapeHtml(entry.label)}</strong>
                                        <span>${escapeHtml(entry.detail || entry.line)}</span>
                                        ${entry.engineeringNote ? `<span>${escapeHtml(entry.engineeringNote)}</span>` : ''}
                                    </article>
                                `).join('')}
                            </div>`
                : '<div class="expedition-empty-note">当前承接的悬赏与路线暂未出现明显冲突，可以继续按既定节奏推进。</div>'}
                    </div>
                    <div class="expedition-signal-block nemesis ${escapeHtml(nemesisForecast?.pressureTier || 'low')}">
                        <div class="expedition-choice-head">
                            <strong>仇敌追猎链路</strong>
                            <span>${escapeHtml(nemesisForecast ? `${nemesisForecast.pressureLabel} · ${nemesisForecast.windowLabel}` : '暂无异常')}</span>
                        </div>
                        ${nemesisForecast
                ? `<article class="expedition-signal-item nemesis ${escapeHtml(nemesisForecast.pressureTier || 'low')}">
                                <strong>${escapeHtml(`${nemesisForecast.pressureLabel} · ${nemesisForecast.windowLabel}`)}</strong>
                                <span>${escapeHtml(nemesisForecast.line)}</span>
                                ${nemesisForecast.engineeringModifier ? `<span>${escapeHtml(`工程联动：${nemesisForecast.engineeringModifier} · ${nemesisForecast.engineeringNote || '本轮追猎窗口已被工程主轴改写。'}`)}</span>` : ''}
                                <span>${escapeHtml(nemesisForecast.counterplay || '先稳住关键资源，再决定是否硬接这条追猎线。')}</span>
                            </article>`
                : '<div class="expedition-empty-note">当前仇敌链路尚未形成明确压制窗口，先踩事件或高压节点再观察追猎方向。</div>'}
                        ${recentNemesisLogs.length > 0
                ? `<div class="expedition-signal-list">
                                ${recentNemesisLogs.map((entry) => `
                                    <article class="expedition-signal-item nemesis ${escapeHtml(entry.severity || 'low')}">
                                        <strong>${escapeHtml(entry.title)}</strong>
                                        <span>${escapeHtml(entry.detail || entry.line)}</span>
                                    </article>
                                `).join('')}
                            </div>`
                : ''}
                    </div>
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
                        ${observatoryEngineering?.huntIntel ? `<div class="expedition-observatory-note">${escapeHtml(`工程情报：${observatoryEngineering.huntIntel}`)}</div>` : ''}
                        ${observatoryEngineering?.conflictPreview ? `<div class="expedition-observatory-note">${escapeHtml(observatoryEngineering.conflictPreview)}</div>` : ''}
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
            if (payload?.map?.chapter && payload.expedition) {
                payload.map.chapter.factionSignals = readArray(payload.expedition.recentFactionLogs).map((entry) => ({
                    factionId: entry.factionId,
                    factionName: entry.factionName,
                    delta: entry.delta,
                    stanceAfter: entry.stanceAfter,
                    stanceLabel: entry.stanceLabel,
                    reason: entry.reason,
                    line: entry.line
                }));
                payload.map.chapter.bountyConflicts = readArray(payload.expedition.bountyConflictWarnings).map((entry) => ({
                    bountyId: entry.bountyId,
                    bountyName: entry.bountyName,
                    severity: entry.severity,
                    label: entry.label,
                    detail: entry.detail,
                    suggestion: entry.suggestion,
                    engineeringTrackId: entry.engineeringTrackId || '',
                    engineeringTrackName: entry.engineeringTrackName || '',
                    engineeringNote: entry.engineeringNote || '',
                    routeDivergence: entry.routeDivergence || '',
                    line: entry.line
                }));
                payload.map.chapter.nemesisSignals = readArray(payload.expedition.recentNemesisLogs).map((entry) => ({
                    status: entry.status,
                    statusLabel: entry.statusLabel,
                    severity: entry.severity,
                    title: entry.title,
                    detail: entry.detail,
                    counterplay: entry.counterplay,
                    line: entry.line,
                    nodeTypes: readArray(entry.nodeTypes)
                }));
                payload.map.chapter.nemesisForecast = payload.expedition.nemesisForecast
                    ? {
                        status: payload.expedition.nemesisForecast.status,
                        statusLabel: payload.expedition.nemesisForecast.statusLabel,
                        pressureIndex: payload.expedition.nemesisForecast.pressureIndex,
                        pressureTier: payload.expedition.nemesisForecast.pressureTier,
                        pressureLabel: payload.expedition.nemesisForecast.pressureLabel,
                        windowLabel: payload.expedition.nemesisForecast.windowLabel,
                        focusNodeTypes: readArray(payload.expedition.nemesisForecast.focusNodeTypes),
                        focusNodeLabels: readArray(payload.expedition.nemesisForecast.focusNodeLabels),
                        driverLines: readArray(payload.expedition.nemesisForecast.driverLines),
                        line: payload.expedition.nemesisForecast.line,
                        counterplay: payload.expedition.nemesisForecast.counterplay,
                        engineeringTrackId: payload.expedition.nemesisForecast.engineeringTrackId || '',
                        engineeringTrackName: payload.expedition.nemesisForecast.engineeringTrackName || '',
                        engineeringModifier: payload.expedition.nemesisForecast.engineeringModifier || '',
                        engineeringNote: payload.expedition.nemesisForecast.engineeringNote || ''
                    }
                    : null;
                payload.map.chapter.expeditionEngineering = payload.expedition.engineeringLink
                    ? {
                        trackId: payload.expedition.engineeringLink.trackId,
                        name: payload.expedition.engineeringLink.name,
                        tier: payload.expedition.engineeringLink.tier,
                        tierLabel: payload.expedition.engineeringLink.tierLabel,
                        routeDirective: payload.expedition.engineeringLink.routeDirective,
                        pressureBias: payload.expedition.engineeringLink.pressureBias,
                        rewardBias: payload.expedition.engineeringLink.rewardBias,
                        summary: payload.expedition.engineeringLink.summary,
                        line: payload.expedition.engineeringLink.line
                    }
                    : null;
            }
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
        const recentFactionLogs = this.getRecentExpeditionFactionLogs(expedition, 2);
        const recentNemesisLogs = this.getRecentExpeditionNemesisLogs(expedition, 2);
        const engineeringInfluence = this.getStrategicEngineeringExpeditionInfluence(expedition);
        const nemesisForecast = this.getExpeditionNemesisForecast(expedition);
        const bountySignalMap = new Map(expedition.bountyDraft.map((entry) => [entry.id, this.getExpeditionBountySignalModel(expedition, entry)]));
        const bountyConflictWarnings = this.getExpeditionBountyConflictWarnings(expedition, bountySignalMap);
        snapshot.strengths = Array.isArray(snapshot.strengths) ? snapshot.strengths.slice() : [];
        snapshot.gaps = Array.isArray(snapshot.gaps) ? snapshot.gaps.slice() : [];
        snapshot.nextTargets = Array.isArray(snapshot.nextTargets) ? snapshot.nextTargets.slice() : [];
        if (engineeringInfluence) {
            snapshot.strengths.push(`工程主轴当前为【${engineeringInfluence.engineeringTrackName} ${engineeringInfluence.engineeringTierLabel}】，正在以「${engineeringInfluence.routeDirective}」改写远征。`);
        }
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
        if (recentFactionLogs.length > 0) {
            snapshot.nextTargets.push(`势力日志：${recentFactionLogs[0].line}`);
        }
        if (bountyConflictWarnings.length > 0) {
            snapshot.gaps.push(`悬赏冲突：${bountyConflictWarnings[0].line}`);
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
        if (nemesisForecast?.line) {
            snapshot.gaps.push(`追猎预判：${nemesisForecast.line}`);
        }
        if (expedition.activeNemesis?.clueRevealed && expedition.activeNemesis?.clueLine) {
            snapshot.nextTargets.push(`仇敌线索：${expedition.activeNemesis.clueLine}`);
        }
        if (recentNemesisLogs.length > 0) {
            snapshot.nextTargets.push(`追猎日志：${recentNemesisLogs[0].line}`);
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
            return originalMapOnNodeClick.call(this, node);
        };
    }

    if (typeof GameMap !== 'undefined' && originalMapCompleteNode) {
        GameMap.prototype.completeNode = function (node) {
            const beforeCompleted = isMapNodeMarkedCompleted(this, node);
            const result = originalMapCompleteNode.call(this, node);
            const afterCompleted = isMapNodeMarkedCompleted(this, node);
            if (!beforeCompleted && afterCompleted && node && this?.game && typeof this.game.recordExpeditionNodeVisit === 'function') {
                this.game.recordExpeditionNodeVisit(node);
            }
            return result;
        };
    }
}());
