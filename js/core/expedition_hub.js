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
            factions,
            activeNemesis: nemesisSource.id ? {
                id: String(nemesisSource.id || ''),
                icon: String(nemesisSource.icon || '⚔️'),
                name: String(nemesisSource.name || ''),
                epithet: String(nemesisSource.epithet || ''),
                intro: String(nemesisSource.intro || ''),
                triggerNodeTypes: readArray(nemesisSource.triggerNodeTypes).map((value) => String(value || '')).filter(Boolean).slice(0, 4),
                hpMul: Math.max(1, safeNumber(nemesisSource.hpMul, 1)),
                atkMul: Math.max(1, safeNumber(nemesisSource.atkMul, 1)),
                reward: normalizeReward(nemesisSource.reward),
                status: ['hunting', 'defeated', 'escaped'].includes(nemesisSource.status) ? nemesisSource.status : 'hunting',
                engaged: !!nemesisSource.engaged,
                engagedCount: clampInt(nemesisSource.engagedCount, 0, 99),
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
            factions,
            activeNemesis: activeNemesis ? {
                ...activeNemesis,
                status: 'hunting',
                engaged: false,
                engagedCount: 0,
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
            && nemesis.status === 'hunting'
            && nemesis.triggerNodeTypes.includes(nodeType)
            && nextEnemies[0]
        ) {
            const target = nextEnemies[0];
            target.id = `nemesis_${nemesis.id}_${target.id || 'enemy'}`;
            target.name = `【仇敌】${nemesis.name}·${target.name || '未知敌影'}`;
            target.maxHp = Math.max(1, Math.floor((target.maxHp || target.hp || 80) * nemesis.hpMul));
            target.hp = Math.max(1, Math.floor((target.hp || target.maxHp || 80) * nemesis.hpMul));
            target.currentHp = target.hp;
            target.patterns = Array.isArray(target.patterns)
                ? target.patterns.map((pattern) => {
                    const copied = { ...pattern };
                    if (copied.type === 'attack' || copied.type === 'multiAttack') {
                        copied.value = Math.max(1, Math.floor(safeNumber(copied.value, 0) * nemesis.atkMul));
                    }
                    copied.intent = copied.intent ? `${copied.intent} · 仇敌压制` : '仇敌压制';
                    return copied;
                })
                : target.patterns;
            target.tacticalPlanLabel = nemesis.epithet || target.tacticalPlanLabel || '仇敌追猎';
            target.nemesisProfile = { id: nemesis.id, name: nemesis.name };
            state.activeNemesis.engaged = true;
            state.activeNemesis.engagedCount = clampInt((state.activeNemesis.engagedCount || 0) + 1, 0, 99);
            state.activeNemesis.lastEncounterNodeType = nodeType;
            if (typeof Utils !== 'undefined' && Utils?.showBattleLog) {
                Utils.showBattleLog(`【仇敌追猎】${nemesis.name} 现身了。`);
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
            && state.activeNemesis.status === 'hunting'
            && Array.isArray(enemies)
            && enemies.some((enemy) => String(enemy?.id || '').startsWith(`nemesis_${state.activeNemesis.id}`));
        if (nemesisDefeated) {
            state.activeNemesis.status = 'defeated';
            const reward = normalizeReward(state.activeNemesis.reward);
            if (reward.gold > 0) this.player.gold += reward.gold;
            if (reward.ringExp > 0 && this.player.fateRing) {
                this.player.fateRing.exp = clampInt((this.player.fateRing.exp || 0) + reward.ringExp, 0, 999999);
            }
            if (typeof this.recordCollectionUnlock === 'function') {
                this.recordCollectionUnlock('nemesis', {
                    id: `nemesis:${state.activeNemesis.id}`,
                    name: `仇敌留痕·${state.activeNemesis.name}`,
                    icon: state.activeNemesis.icon || '🎯',
                    note: `已在第 ${state.chapterIndex} 章追猎并击破。`
                });
            }
            if (typeof Utils !== 'undefined' && Utils?.showBattleLog) {
                Utils.showBattleLog(`【仇敌追猎】已击破 ${state.activeNemesis.name}。`);
            }
        }
        if (this.player) {
            state.stats.currentHpRatio = Math.max(0, Math.min(1, safeNumber(this.player.currentHp, 0) / Math.max(1, safeNumber(this.player.maxHp, 1))));
        }
        this.expeditionState = state;
        this.refreshExpeditionProgress(true);
        return state;
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
        const nemesisStatus = source.activeNemesis?.status || 'hunting';
        const hpRatio = safeNumber(source.stats.currentHpRatio, 0);
        if (nemesisStatus === 'defeated' && completedBounties >= 1) return this.getExpeditionEndingMeta('hunt');
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
        const score = clampInt(
            completedBounties.reduce((sum, entry) => sum + clampInt(entry.reward?.score || 0, 0, 9999), 0)
            + (source.activeNemesis?.status === 'defeated' ? clampInt(source.activeNemesis.reward?.score || 0, 0, 9999) : 0)
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
                source.activeNemesis?.status === 'defeated'
                    ? `仇敌追猎：击破 ${source.activeNemesis.name}`
                    : `仇敌结果：${source.activeNemesis?.name ? `${source.activeNemesis.name} ${source.activeNemesis.status === 'escaped' ? '已逃逸' : '未现身'}` : '暂无'}`,
                `势力态势：${source.factions.map((entry) => `${entry.name}${entry.stance > 0 ? '+' : ''}${entry.stance}`).join(' / ')}`
            ].filter(Boolean),
            branchName: branch?.name || '未锁定支线',
            bountyNames: completedBounties.map((entry) => entry.name),
            factionSummary: source.factions.map((entry) => `${entry.name}·${getFactionStatusMeta(entry.stance).label}`),
            nemesisName: source.activeNemesis?.name || '',
            tags: [
                branch?.name || '未锁支线',
                ...completedBounties.map((entry) => entry.name),
                ...source.factions.filter((entry) => entry.stance >= 2).map((entry) => `${entry.name}结盟`)
            ].filter(Boolean).slice(0, 6),
            timestamp: Date.now()
        };
    };

    Game.prototype.finalizeExpeditionChapter = function (reason = 'realm_clear') {
        const state = this.getExpeditionState();
        if (!state) return null;
        if (state.activeNemesis && state.activeNemesis.status === 'hunting') {
            state.activeNemesis.status = reason === 'battle_lost' ? 'escaped' : 'escaped';
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
        return {
            chapterIndex: state?.chapterIndex || latestSlate?.chapterIndex || 0,
            chapterName: state?.chapterFullName || latestSlate?.chapterName || '',
            selectedBranchId: state?.selectedBranchId || '',
            selectedBranchName: state?.branchOptions?.find((entry) => entry.id === state.selectedBranchId)?.name || '',
            branchOptions: readArray(state?.branchOptions).map((entry) => ({
                id: entry.id,
                name: entry.name,
                tone: entry.tone,
                selected: entry.id === state.selectedBranchId
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
                    triggerNodeTypes: state.activeNemesis.triggerNodeTypes
                }
                : null,
            endingPreview: state ? this.determineExpeditionEnding(state) : null,
            latestSlate: latestSlate
                ? {
                    id: latestSlate.id,
                    chapterName: latestSlate.chapterName,
                    endingName: latestSlate.endingName,
                    score: latestSlate.score
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
        const state = this.getExpeditionState();
        let container = shell.querySelector('#map-expedition-panels');
        if (!state) {
            if (container) {
                container.innerHTML = '';
                container.style.display = 'none';
            }
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
        container.style.display = 'grid';
        container.innerHTML = `
            <section class="expedition-panel-card expedition-overview-card">
                <div class="expedition-card-kicker">裂界远征</div>
                <div class="expedition-card-title">本章目标 · ${escapeHtml(state.chapterFullName || state.chapterName)}</div>
                <div class="expedition-card-note">${escapeHtml(selectedBranch ? `当前支线：${selectedBranch.name}` : '请选择 1 条支线区域锁定本章路线。')}</div>
                <div class="expedition-chip-row">
                    <span class="expedition-chip">${escapeHtml(ending.icon)} ${escapeHtml(ending.name)}</span>
                    <span class="expedition-chip">${escapeHtml(activeBounties.length)}/${MAX_ACTIVE_BOUNTIES} 条悬赏</span>
                    <span class="expedition-chip">${escapeHtml(state.activeNemesis?.name || '暂无仇敌')}</span>
                </div>
            </section>
            <section class="expedition-panel-card">
                <div class="expedition-card-kicker">支线区域</div>
                <div class="expedition-card-title">选择本章路线</div>
                <div class="expedition-choice-list">
                    ${state.branchOptions.map((entry) => `
                        <article class="expedition-choice-card ${entry.id === state.selectedBranchId ? 'selected' : ''}">
                            <div class="expedition-choice-head">
                                <strong>${escapeHtml(entry.icon)} ${escapeHtml(entry.name)}</strong>
                                <span>${escapeHtml(entry.tone)}</span>
                            </div>
                            <p>${escapeHtml(entry.summary)}</p>
                            <div class="expedition-choice-meta">
                                <span>收益：${escapeHtml(entry.reward)}</span>
                                <span>风险：${escapeHtml(entry.risk)}</span>
                            </div>
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
                        <span>${escapeHtml(state.activeNemesis?.status || 'idle')}</span>
                    </div>
                    <p>${escapeHtml(state.activeNemesis?.intro || '当前本章未锁定特殊仇敌。')}</p>
                    <div class="expedition-choice-meta">
                        <span>出没：${escapeHtml((state.activeNemesis?.triggerNodeTypes || []).join(' / ') || '未知')}</span>
                        <span>追猎结果会直接写入命盘摘要</span>
                    </div>
                </article>
            </section>
        `;
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
        if (expedition.activeNemesis?.status === 'hunting') {
            snapshot.gaps.push(`仇敌【${expedition.activeNemesis.name}】仍在狩猎线中，精英与试炼路线会更危险。`);
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
