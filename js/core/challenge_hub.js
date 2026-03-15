(function () {
    if (typeof Game === 'undefined') return;

    const CHALLENGE_PROGRESS_KEY = 'theDefierChallengeProgressV1';
    const ACTIVE_CHALLENGE_RUN_KEY = 'theDefierActiveChallengeRunV1';
    const OBSERVATORY_ARCHIVE_KEY = 'theDefierObservatoryArchiveV1';
    const HUB_META = {
        daily: {
            title: '观星台 · 今日天机',
            subtitle: '每日一局短挑战，固定角色、章节目标与战场词缀。',
            label: '今日天机',
            accentClass: 'daily'
        },
        weekly: {
            title: '观星台 · 七日劫数',
            subtitle: '围绕同一套规则反复冲分，争取更高周积分。',
            label: '七日劫数',
            accentClass: 'weekly'
        },
        global: {
            title: '观星台 · 众生试炼',
            subtitle: '统一规则下的长线冲榜，争夺本周最高试炼分。',
            label: '众生试炼',
            accentClass: 'global'
        }
    };

    const originalShowScreen = Game.prototype.showScreen;
    const originalShowCharacterSelection = Game.prototype.showCharacterSelection;
    const originalRenderRunDestinySelection = Game.prototype.renderRunDestinySelection;
    const originalRenderSpiritCompanionSelection = Game.prototype.renderSpiritCompanionSelection;
    const originalSelectCharacter = Game.prototype.selectCharacter;
    const originalSelectRunDestiny = Game.prototype.selectRunDestiny;
    const originalSelectSpiritCompanion = Game.prototype.selectSpiritCompanion;
    const originalStartNewGame = Game.prototype.startNewGame;
    const originalStartBattle = Game.prototype.startBattle;
    const originalOnBattleWon = Game.prototype.onBattleWon;
    const originalOnBattleLost = Game.prototype.onBattleLost;
    const originalOnRealmComplete = Game.prototype.onRealmComplete;
    const originalSaveGame = Game.prototype.saveGame;
    const originalLoadGame = Game.prototype.loadGame;
    const originalClearSave = Game.prototype.clearSave;
    const originalRenderGameToText = Game.prototype.renderGameToText;
    const originalGetSanctumOverviewData = Game.prototype.getSanctumOverviewData;
    const originalFinishStrategicNode = Game.prototype.finishStrategicNode;
    const originalGameMapRender = typeof GameMap !== 'undefined' && GameMap?.prototype
        ? GameMap.prototype.render
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
            return value && typeof value === 'object' ? { ...value } : value;
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

    const pad2 = (value) => String(value).padStart(2, '0');

    const getDayKey = (date = new Date()) => {
        const year = date.getFullYear();
        const month = pad2(date.getMonth() + 1);
        const day = pad2(date.getDate());
        return `${year}-${month}-${day}`;
    };

    const getISOWeekInfo = (date = new Date()) => {
        const target = new Date(date.getTime());
        target.setHours(0, 0, 0, 0);
        target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
        const week1 = new Date(target.getFullYear(), 0, 4);
        const week = 1 + Math.round(((target.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
        return {
            year: target.getFullYear(),
            week: Math.max(1, week)
        };
    };

    const getWeekKey = (date = new Date()) => {
        const info = getISOWeekInfo(date);
        return `${info.year}-W${pad2(info.week)}`;
    };

    const formatDateLabel = (mode = 'daily', key = '') => {
        if (mode === 'daily') {
            const [year, month, day] = String(key || '').split('-');
            if (year && month && day) return `${year}.${month}.${day}`;
            return '今日轮换';
        }
        if (mode === 'weekly' || mode === 'global') {
            const match = String(key || '').match(/^(\d+)-W(\d+)$/);
            if (match) return `${match[1]} · 第 ${Number(match[2])} 周`;
            return '本周轮换';
        }
        return key || '当前轮换';
    };

    const createProgressEntry = () => ({
        attempts: 0,
        completions: 0,
        bestScore: 0,
        totalScore: 0,
        claimedRewards: {},
        records: [],
        lastResult: null
    });

    const normalizeChallengeRuleSnapshot = (source = null) => {
        const rule = source && typeof source === 'object' ? source : {};
        return {
            id: String(rule.id || ''),
            name: String(rule.name || ''),
            icon: String(rule.icon || '✦'),
            intro: String(rule.intro || ''),
            objective: String(rule.objective || ''),
            targetChapter: String(rule.targetChapter || ''),
            goalRealm: clampInt(rule.goalRealm, 1, 18),
            characterId: String(rule.characterId || ''),
            runDestinyId: String(rule.runDestinyId || ''),
            spiritCompanionId: String(rule.spiritCompanionId || ''),
            vowIds: Array.isArray(rule.vowIds)
                ? rule.vowIds.map((id) => String(id || '')).filter(Boolean).slice(0, 2)
                : [],
            tags: Array.isArray(rule.tags)
                ? rule.tags.map((item) => String(item || '')).filter(Boolean).slice(0, 6)
                : [],
            scoreWeights: rule.scoreWeights && typeof rule.scoreWeights === 'object'
                ? clone(rule.scoreWeights)
                : {},
            battleModifiers: rule.battleModifiers && typeof rule.battleModifiers === 'object'
                ? clone(rule.battleModifiers)
                : {}
        };
    };

    const createObservatoryArchiveState = () => ({
        records: []
    });

    Game.prototype.ensureChallengeHubBootState = function () {
        if (!this.challengeHubState || typeof this.challengeHubState !== 'object') {
            this.challengeHubState = { tab: 'daily' };
        } else if (!['daily', 'weekly', 'global'].includes(this.challengeHubState.tab)) {
            this.challengeHubState.tab = 'daily';
        }

        if (!this.challengeProgressState || typeof this.challengeProgressState !== 'object') {
            this.challengeProgressState = this.loadChallengeProgressState();
        }

        if (typeof this.pendingChallengeStart === 'undefined') {
            this.pendingChallengeStart = null;
        }

        if (typeof this.activeChallengeRun === 'undefined') {
            this.activeChallengeRun = this.restoreActiveChallengeRun();
        }

        if (!this.observatoryArchiveState || typeof this.observatoryArchiveState !== 'object') {
            this.observatoryArchiveState = this.loadObservatoryArchiveState();
        }
    };

    Game.prototype.normalizeObservatoryArchiveState = function (rawState = null) {
        const source = rawState && typeof rawState === 'object' ? rawState : {};
        const records = Array.isArray(source.records) ? source.records : [];
        return {
            records: records
                .filter((item) => item && typeof item === 'object')
                .slice(0, 24)
                .map((item) => {
                    const rule = normalizeChallengeRuleSnapshot(item.rule);
                    const mode = ['daily', 'weekly', 'global'].includes(item.mode) ? item.mode : 'daily';
                    const replayOnly = !!item.replayOnly;
                    const type = ['challenge', 'replay', 'omen'].includes(item.type)
                        ? item.type
                        : (replayOnly ? 'replay' : 'omen');
                    return {
                        id: String(item.id || ''),
                        type,
                        mode,
                        modeLabel: String(item.modeLabel || (replayOnly ? '观星回放' : HUB_META[mode]?.label || '观星留痕')),
                        rotationKey: String(item.rotationKey || ''),
                        rotationLabel: String(item.rotationLabel || formatDateLabel(mode, item.rotationKey || '')),
                        seedSignature: String(item.seedSignature || ''),
                        title: String(item.title || rule.name || '观星留痕'),
                        note: String(item.note || ''),
                        icon: String(item.icon || rule.icon || '🔭'),
                        score: clampInt(item.score, 0),
                        completed: !!item.completed,
                        at: clampInt(item.at, 0),
                        reason: String(item.reason || ''),
                        replayOnly,
                        replayable: !!(rule.id && rule.characterId && rule.runDestinyId && rule.spiritCompanionId),
                        archiveEntryId: String(item.archiveEntryId || ''),
                        originLabel: String(item.originLabel || ''),
                        rule
                    };
                })
                .sort((a, b) => clampInt(b.at, 0) - clampInt(a.at, 0))
        };
    };

    Game.prototype.loadObservatoryArchiveState = function () {
        try {
            const raw = typeof localStorage !== 'undefined'
                ? localStorage.getItem(OBSERVATORY_ARCHIVE_KEY)
                : null;
            return this.normalizeObservatoryArchiveState(raw ? JSON.parse(raw) : createObservatoryArchiveState());
        } catch (error) {
            return this.normalizeObservatoryArchiveState(createObservatoryArchiveState());
        }
    };

    Game.prototype.persistObservatoryArchiveState = function () {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(OBSERVATORY_ARCHIVE_KEY, JSON.stringify(this.observatoryArchiveState || createObservatoryArchiveState()));
        } catch (error) {
            console.warn('Persist observatory archive failed:', error);
        }
    };

    Game.prototype.buildChallengeSeedSignature = function (mode = 'daily', rotationKey = '', rule = null) {
        const safeMode = ['daily', 'weekly', 'global'].includes(mode) ? mode : 'daily';
        const snapshot = normalizeChallengeRuleSnapshot(rule);
        const seedSource = [
            safeMode,
            String(rotationKey || ''),
            snapshot.id,
            snapshot.characterId,
            snapshot.runDestinyId,
            snapshot.spiritCompanionId,
            snapshot.goalRealm,
            snapshot.vowIds.join(','),
            JSON.stringify(snapshot.battleModifiers || {})
        ].join('|');
        const digest = hashString(seedSource).toString(16).toUpperCase().padStart(8, '0');
        const prefixMap = { daily: 'D', weekly: 'W', global: 'G' };
        const keyPart = String(rotationKey || 'ARCH').replace(/[^0-9A-Z]/gi, '').slice(-6) || 'ARCH';
        return `${prefixMap[safeMode] || 'O'}-${keyPart}-${digest.slice(0, 4)}`;
    };

    Game.prototype.recordObservatoryArchiveEntry = function (payload = {}) {
        this.ensureChallengeHubBootState();
        const state = this.observatoryArchiveState && typeof this.observatoryArchiveState === 'object'
            ? this.observatoryArchiveState
            : createObservatoryArchiveState();
        const normalized = this.normalizeObservatoryArchiveState({
            records: [
                {
                    id: String(payload.id || `${Date.now()}:${hashString(JSON.stringify(payload || {}))}`),
                    type: payload.type || 'omen',
                    mode: payload.mode || 'daily',
                    modeLabel: payload.modeLabel || '',
                    rotationKey: payload.rotationKey || '',
                    rotationLabel: payload.rotationLabel || '',
                    seedSignature: payload.seedSignature || '',
                    title: payload.title || '',
                    note: payload.note || '',
                    icon: payload.icon || '🔭',
                    score: payload.score || 0,
                    completed: payload.completed,
                    at: payload.at || Date.now(),
                    reason: payload.reason || '',
                    replayOnly: payload.replayOnly,
                    archiveEntryId: payload.archiveEntryId || '',
                    originLabel: payload.originLabel || '',
                    rule: payload.rule || null
                },
                ...(Array.isArray(state.records) ? state.records : [])
            ].slice(0, 24)
        });
        this.observatoryArchiveState = normalized;
        this.persistObservatoryArchiveState();
        return normalized.records[0] || null;
    };

    Game.prototype.getObservatoryArchiveEntries = function (options = {}) {
        this.ensureChallengeHubBootState();
        const source = Array.isArray(this.observatoryArchiveState?.records)
            ? this.observatoryArchiveState.records
            : [];
        const limit = clampInt(options.limit, 0, 24) || 6;
        const mode = ['daily', 'weekly', 'global'].includes(options.mode) ? options.mode : '';
        const types = Array.isArray(options.types)
            ? options.types.map((item) => String(item || '')).filter(Boolean)
            : null;
        const replayableOnly = !!options.replayableOnly;
        return source
            .filter((entry) => {
                if (!entry) return false;
                if (mode && entry.mode !== mode) return false;
                if (types && types.length > 0 && !types.includes(entry.type)) return false;
                if (replayableOnly && !entry.replayable) return false;
                return true;
            })
            .slice(0, limit);
    };

    Game.prototype.getObservatoryArchiveSummary = function () {
        const records = this.getObservatoryArchiveEntries({ limit: 24 });
        return {
            totalRecords: records.length,
            replayCount: records.filter((item) => item.type === 'replay').length,
            challengeCount: records.filter((item) => item.type === 'challenge').length,
            omenCount: records.filter((item) => item.type === 'omen').length,
            replayableCount: records.filter((item) => item.replayable).length,
            latest: records[0] || null
        };
    };

    Game.prototype.normalizeChallengeProgressState = function (rawState = null) {
        const source = rawState && typeof rawState === 'object' ? rawState : {};
        const sessions = source.sessions && typeof source.sessions === 'object' ? source.sessions : {};
        const normalizeBucket = (bucketName) => {
            const bucket = sessions[bucketName] && typeof sessions[bucketName] === 'object' ? sessions[bucketName] : {};
            const next = {};
            Object.keys(bucket).forEach((key) => {
                const entry = bucket[key] && typeof bucket[key] === 'object' ? bucket[key] : {};
                next[key] = {
                    attempts: clampInt(entry.attempts, 0),
                    completions: clampInt(entry.completions, 0),
                    bestScore: clampInt(entry.bestScore, 0),
                    totalScore: clampInt(entry.totalScore, 0),
                    claimedRewards: entry.claimedRewards && typeof entry.claimedRewards === 'object'
                        ? { ...entry.claimedRewards }
                        : {},
                    records: Array.isArray(entry.records)
                        ? entry.records
                            .filter((item) => item && typeof item === 'object')
                            .slice(0, 8)
                            .map((item) => ({
                                score: clampInt(item.score, 0),
                                completed: !!item.completed,
                                at: clampInt(item.at, 0),
                                ruleId: String(item.ruleId || ''),
                                ruleName: String(item.ruleName || ''),
                                reason: String(item.reason || ''),
                                modeLabel: String(item.modeLabel || ''),
                                icon: String(item.icon || '✦')
                            }))
                        : [],
                    lastResult: entry.lastResult && typeof entry.lastResult === 'object'
                        ? {
                            score: clampInt(entry.lastResult.score, 0),
                            completed: !!entry.lastResult.completed,
                            at: clampInt(entry.lastResult.at, 0),
                            ruleId: String(entry.lastResult.ruleId || ''),
                            ruleName: String(entry.lastResult.ruleName || ''),
                            reason: String(entry.lastResult.reason || '')
                        }
                        : null
                };
            });
            return next;
        };

        return {
            sessions: {
                daily: normalizeBucket('daily'),
                weekly: normalizeBucket('weekly'),
                global: normalizeBucket('global')
            },
            recentResults: Array.isArray(source.recentResults)
                ? source.recentResults
                    .filter((item) => item && typeof item === 'object')
                    .slice(0, 12)
                    .map((item) => ({
                        mode: ['daily', 'weekly', 'global'].includes(item.mode) ? item.mode : 'daily',
                        score: clampInt(item.score, 0),
                        completed: !!item.completed,
                        at: clampInt(item.at, 0),
                        ruleName: String(item.ruleName || ''),
                        icon: String(item.icon || '✦'),
                        reason: String(item.reason || '')
                    }))
                : []
        };
    };

    Game.prototype.loadChallengeProgressState = function () {
        try {
            const raw = typeof localStorage !== 'undefined'
                ? localStorage.getItem(CHALLENGE_PROGRESS_KEY)
                : null;
            return this.normalizeChallengeProgressState(raw ? JSON.parse(raw) : null);
        } catch (error) {
            return this.normalizeChallengeProgressState();
        }
    };

    Game.prototype.saveChallengeProgressState = function () {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(CHALLENGE_PROGRESS_KEY, JSON.stringify(this.challengeProgressState || this.normalizeChallengeProgressState()));
        } catch (error) {
            console.warn('Save challenge progress failed:', error);
        }
    };

    Game.prototype.getChallengeProgressEntry = function (mode = 'daily', rotationKey = '', create = false) {
        this.ensureChallengeHubBootState();
        const bucket = this.challengeProgressState.sessions[mode];
        if (!bucket[rotationKey] && create) {
            bucket[rotationKey] = createProgressEntry();
        }
        return bucket[rotationKey] || null;
    };

    Game.prototype.getChallengeRuleCatalog = function (mode = 'daily') {
        const rules = (typeof CHALLENGE_RULES !== 'undefined' && CHALLENGE_RULES && Array.isArray(CHALLENGE_RULES[mode]))
            ? CHALLENGE_RULES[mode]
            : [];
        return rules.map((item) => clone(item)).filter(Boolean);
    };

    Game.prototype.getChallengeRotationKey = function (mode = 'daily', date = new Date()) {
        return mode === 'daily' ? getDayKey(date) : getWeekKey(date);
    };

    Game.prototype.pickChallengeRule = function (mode = 'daily', rotationKey = '') {
        const catalog = this.getChallengeRuleCatalog(mode);
        if (catalog.length === 0) return null;
        const index = hashString(`${mode}:${rotationKey}`) % catalog.length;
        return clone(catalog[index]);
    };

    Game.prototype.getChallengeScoreDefaults = function () {
        const base = (typeof CHALLENGE_RULES !== 'undefined' && CHALLENGE_RULES && CHALLENGE_RULES.scoreDefaults)
            ? CHALLENGE_RULES.scoreDefaults
            : {};
        return {
            battleWin: clampInt(base.battleWin, 0),
            eliteWin: clampInt(base.eliteWin, 0),
            bossWin: clampInt(base.bossWin, 0),
            realmClear: clampInt(base.realmClear, 0),
            lawDiscover: clampInt(base.lawDiscover, 0),
            treasureDiscover: clampInt(base.treasureDiscover, 0),
            hpBonus: clampInt(base.hpBonus, 0),
            completeBonus: clampInt(base.completeBonus, 0)
        };
    };

    Game.prototype.buildChallengeBundle = function (mode = 'daily', date = new Date()) {
        this.ensureChallengeHubBootState();
        const safeMode = ['daily', 'weekly', 'global'].includes(mode) ? mode : 'daily';
        const rotationKey = this.getChallengeRotationKey(safeMode, date);
        const meta = HUB_META[safeMode] || HUB_META.daily;
        const rule = this.pickChallengeRule(safeMode, rotationKey);
        const seedSignature = this.buildChallengeSeedSignature(safeMode, rotationKey, rule);
        const entry = this.getChallengeProgressEntry(safeMode, rotationKey, false) || createProgressEntry();
        const currentValue = safeMode === 'daily'
            ? clampInt(entry.completions, 0)
            : safeMode === 'weekly'
                ? clampInt(entry.totalScore, 0)
                : clampInt(entry.bestScore, 0);
        const rewards = Array.isArray(rule?.rewardTrack)
            ? rule.rewardTrack.map((reward) => {
                const target = clampInt(reward.target, 0);
                const claimed = !!entry.claimedRewards[reward.id];
                return {
                    ...clone(reward),
                    target,
                    claimed,
                    currentValue,
                    ready: !claimed && currentValue >= target,
                    progressText: safeMode === 'daily'
                        ? `${Math.min(target || 1, currentValue)}/${Math.max(1, target || 1)}`
                        : `${currentValue}/${target}`
                };
            })
            : [];

        const records = Array.isArray(entry.records) ? entry.records.slice(0, 5) : [];
        return {
            mode: safeMode,
            rotationKey,
            rotationLabel: formatDateLabel(safeMode, rotationKey),
            meta,
            rule,
            seedSignature,
            progress: {
                attempts: clampInt(entry.attempts, 0),
                completions: clampInt(entry.completions, 0),
                bestScore: clampInt(entry.bestScore, 0),
                totalScore: clampInt(entry.totalScore, 0),
                currentValue
            },
            rewards,
            records,
            leaderboard: safeMode === 'global'
                ? this.buildChallengeLeaderboard(rotationKey, entry)
                : []
        };
    };

    Game.prototype.buildReplayBundleFromArchiveEntry = function (recordId = '') {
        const entry = this.getObservatoryArchiveEntries({ limit: 24 })
            .find((item) => item && item.id === String(recordId || ''));
        if (!entry || !entry.replayable || !entry.rule?.id) return null;
        const safeMode = ['daily', 'weekly', 'global'].includes(entry.mode) ? entry.mode : 'daily';
        return {
            mode: safeMode,
            rotationKey: entry.rotationKey || `archive-${entry.id}`,
            rotationLabel: entry.rotationLabel || formatDateLabel(safeMode, entry.rotationKey || ''),
            meta: {
                title: '观星台 · 命盘回放',
                subtitle: '按历史命盘重开，不计入当前轮换奖励，只保留观星留痕与回放得分。',
                label: '观星回放',
                accentClass: HUB_META[safeMode]?.accentClass || 'daily'
            },
            rule: clone(entry.rule),
            seedSignature: entry.seedSignature || this.buildChallengeSeedSignature(safeMode, entry.rotationKey || entry.id, entry.rule),
            progress: createProgressEntry(),
            rewards: [],
            records: [],
            leaderboard: [],
            replayOnly: true,
            archiveEntryId: entry.id
        };
    };

    Game.prototype.buildChallengeLeaderboard = function (rotationKey = '', entry = null) {
        const baseNames = ['丹渊', '孤衡', '南烛', '玄泠', '照川', '寂河', '停云', '白述'];
        const scores = [];
        const seed = hashString(`leaderboard:${rotationKey}`);
        for (let i = 0; i < baseNames.length; i += 1) {
            const wobble = ((seed >> (i % 8)) & 31) - 15;
            scores.push({
                name: baseNames[i],
                score: 1280 - i * 58 + wobble,
                highlight: false
            });
        }
        if (entry && clampInt(entry.bestScore, 0) > 0) {
            scores.push({
                name: '你',
                score: clampInt(entry.bestScore, 0),
                highlight: true
            });
        } else {
            scores.push({
                name: '你',
                score: 0,
                highlight: true
            });
        }
        scores.sort((a, b) => b.score - a.score);
        return scores.slice(0, 8).map((item, index) => ({
            rank: index + 1,
            name: item.name,
            score: clampInt(item.score, 0),
            highlight: !!item.highlight
        }));
    };

    Game.prototype.getSanctumOverviewData = function () {
        const data = typeof originalGetSanctumOverviewData === 'function'
            ? originalGetSanctumOverviewData.call(this)
            : null;
        if (!data || !Array.isArray(data.rooms)) return data;
        const archive = this.getObservatoryArchiveSummary();
        data.rooms = data.rooms.map((room) => {
            if (room && room.id === 'observatory') {
                return {
                    ...room,
                    focus: '周挑战 / 章节预兆 / 观星留痕',
                    note: archive.totalRecords > 0
                        ? `已留下 ${archive.totalRecords} 条观星留痕，其中 ${archive.replayCount} 次为命盘回放，可继续复盘旧命盘。`
                        : '今日天机、七日劫数与众生试炼已经接入观星台，可直接从洞府切到本周轮换。',
                    actionLabel: archive.totalRecords > 0 ? '查看观星台' : '查看周挑战',
                    actionType: 'challenge',
                    actionValue: 'daily'
                };
            }
            return room;
        });
        data.progress = {
            ...(data.progress || {}),
            observatoryTraces: archive.totalRecords,
            observatoryReplays: archive.replayCount
        };
        if (Array.isArray(data.researches) && !data.researches.some((item) => item && item.id === 'observatory_archive')) {
            data.researches.push({
                id: 'observatory_archive',
                room: '观星台',
                name: '命盘留痕库',
                progress: archive.totalRecords > 0 ? 1 : 0,
                goal: 1,
                reward: '观星台会沉淀命盘签、挑战留痕与回放入口，让旧命盘可直接重开。',
                section: 'sanctum',
                actionType: 'challenge',
                actionValue: 'daily',
                ready: archive.totalRecords > 0,
                progressText: `${archive.totalRecords > 0 ? 1 : 0}/1`
            });
        }
        return data;
    };

    Game.prototype.showChallengeHub = function (tab = 'daily') {
        this.ensureChallengeHubBootState();
        this.challengeHubState.tab = ['daily', 'weekly', 'global'].includes(tab) ? tab : 'daily';
        this.showScreen('challenge-screen');
        this.initChallengeHub();
    };

    Game.prototype.switchChallengeTab = function (tab = 'daily') {
        this.ensureChallengeHubBootState();
        this.challengeHubState.tab = ['daily', 'weekly', 'global'].includes(tab) ? tab : 'daily';
        if (this.currentScreen !== 'challenge-screen') {
            this.showChallengeHub(this.challengeHubState.tab);
            return;
        }
        this.initChallengeHub();
    };

    Game.prototype.initChallengeHub = function () {
        if (typeof document === 'undefined') return;
        this.ensureChallengeHubBootState();
        const tab = this.challengeHubState.tab || 'daily';
        const bundle = this.buildChallengeBundle(tab);
        if (!bundle || !bundle.rule) return;

        const titleEl = document.getElementById('challenge-hub-title');
        const subtitleEl = document.getElementById('challenge-hub-subtitle');
        const summaryEl = document.getElementById('challenge-hub-summary');
        const rulesEl = document.getElementById('challenge-hub-rules');
        const rewardsEl = document.getElementById('challenge-hub-rewards');
        const recordsEl = document.getElementById('challenge-hub-records');
        const sideEl = document.getElementById('challenge-hub-side');
        const rankingEl = document.getElementById('challenge-hub-ranking');
        const launchEl = document.getElementById('challenge-hub-launch');

        if (titleEl) titleEl.textContent = bundle.meta.title;
        if (subtitleEl) subtitleEl.textContent = bundle.meta.subtitle;

        document.querySelectorAll('#challenge-screen [data-challenge-tab]').forEach((button) => {
            button.classList.toggle('active', button.dataset.challengeTab === tab);
        });

        const run = this.activeChallengeRun;
        const isCurrentRun = !!run
            && !run.resolved
            && run.mode === bundle.mode
            && run.rotationKey === bundle.rotationKey;
        const archiveSummary = this.getObservatoryArchiveSummary();
        const replayEntries = this.getObservatoryArchiveEntries({
            mode: bundle.mode,
            types: ['challenge', 'replay'],
            replayableOnly: true,
            limit: 3
        });

        if (summaryEl) {
            const tags = Array.isArray(bundle.rule.tags) ? bundle.rule.tags.slice(0, 4) : [];
            summaryEl.innerHTML = `
                <article class="challenge-focus-card ${escapeHtml(bundle.meta.accentClass)}">
                    <div class="challenge-focus-head">
                        <span class="challenge-focus-icon">${escapeHtml(bundle.rule.icon || '✦')}</span>
                        <div>
                            <span class="challenge-kicker">${escapeHtml(bundle.meta.label)} · ${escapeHtml(bundle.rotationLabel)}</span>
                            <h3>${escapeHtml(bundle.rule.name || '未知试炼')}</h3>
                        </div>
                    </div>
                    <p class="challenge-focus-intro">${escapeHtml(bundle.rule.intro || bundle.rule.objective || '观星台正在推演当前试炼。')}</p>
                    <div class="challenge-focus-meta">
                        <div class="challenge-meta-chip"><strong>${escapeHtml(bundle.rule.targetChapter || '未知章节')}</strong><span>目标章节</span></div>
                        <div class="challenge-meta-chip"><strong>第 ${clampInt(bundle.rule.goalRealm, 1, 18)} 重</strong><span>完成线</span></div>
                        <div class="challenge-meta-chip"><strong>${clampInt(bundle.progress.bestScore, 0)}</strong><span>${bundle.mode === 'weekly' ? '历史最高单次' : '当前最高得分'}</span></div>
                        <div class="challenge-meta-chip"><strong>${bundle.mode === 'weekly' ? clampInt(bundle.progress.totalScore, 0) : clampInt(bundle.progress.completions, 0)}</strong><span>${bundle.mode === 'weekly' ? '周累计积分' : '完成次数'}</span></div>
                    </div>
                    <div class="challenge-tag-strip">
                        ${tags.map((tag) => `<span class="challenge-tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                    <div class="challenge-seed-line">
                        <span class="challenge-seed-chip">命盘签 ${escapeHtml(bundle.seedSignature)}</span>
                        <span>完成后会写入观星留痕，可直接回放旧命盘。</span>
                    </div>
                    ${isCurrentRun ? `<div class="challenge-inline-note">当前已有进行中的 ${escapeHtml(bundle.meta.label)}，回地图即可继续冲线。</div>` : ''}
                </article>
            `;
        }

        if (rulesEl) {
            const scoreDefaults = this.getChallengeScoreDefaults();
            const rules = [
                `指定角色：${this.getCharacterDisplayName(bundle.rule.characterId)}`,
                `开局命格：${this.getChallengeMetaName('destiny', bundle.rule.runDestinyId)}`,
                `同行灵契：${this.getChallengeMetaName('spirit', bundle.rule.spiritCompanionId)}`,
                Array.isArray(bundle.rule.vowIds) && bundle.rule.vowIds.length > 0
                    ? `固定誓约：${bundle.rule.vowIds.map((id) => this.getChallengeMetaName('vow', id)).join(' / ')}`
                    : '固定誓约：无',
                bundle.rule.battleModifiers?.enemyOpeningBlock > 0
                    ? `敌方开场护盾 +${clampInt(bundle.rule.battleModifiers.enemyOpeningBlock, 0)}`
                    : null,
                Number(bundle.rule.battleModifiers?.enemyHpMul || 1) > 1
                    ? `敌方生命 x${safeNumber(bundle.rule.battleModifiers.enemyHpMul, 1).toFixed(2)}`
                    : null,
                Number(bundle.rule.battleModifiers?.enemyAtkMul || 1) > 1
                    ? `敌方伤害 x${safeNumber(bundle.rule.battleModifiers.enemyAtkMul, 1).toFixed(2)}`
                    : null,
                bundle.rule.battleModifiers?.enemyDebuff?.type
                    ? `额外压制：${bundle.rule.battleModifiers.enemyDebuff.type} ${clampInt(bundle.rule.battleModifiers.enemyDebuff.value, 0)}`
                    : null,
                `基础计分：普通战 +${scoreDefaults.battleWin} / 精英 +${scoreDefaults.eliteWin} / Boss +${scoreDefaults.bossWin}`,
                `章节推进：每破一重 +${scoreDefaults.realmClear}，完成线 +${scoreDefaults.completeBonus}`
            ].filter(Boolean);

            rulesEl.innerHTML = rules.map((line) => `
                <article class="challenge-rule-card">
                    <span class="challenge-rule-bullet">✦</span>
                    <p>${escapeHtml(line)}</p>
                </article>
            `).join('');
        }

        if (rewardsEl) {
            rewardsEl.innerHTML = bundle.rewards.map((reward) => `
                <article class="challenge-reward-card ${reward.claimed ? 'claimed' : reward.ready ? 'ready' : 'locked'}">
                    <div class="challenge-reward-top">
                        <div>
                            <strong>${escapeHtml(reward.label)}</strong>
                            <p>${escapeHtml(reward.rewardText || '完成后可领取奖励。')}</p>
                        </div>
                        <span class="challenge-reward-progress">${escapeHtml(reward.progressText)}</span>
                    </div>
                    <button type="button" class="collection-inline-btn"
                        ${reward.ready && !reward.claimed ? '' : 'disabled'}
                        onclick="game.claimChallengeMilestone('${escapeHtml(bundle.mode)}', '${escapeHtml(reward.id)}')">${reward.claimed ? '已领取' : reward.ready ? '领取奖励' : '未达成'}</button>
                </article>
            `).join('');
        }

        if (recordsEl) {
            const source = bundle.records.length > 0
                ? bundle.records
                : (Array.isArray(this.challengeProgressState?.recentResults) ? this.challengeProgressState.recentResults.filter((item) => item.mode === bundle.mode).slice(0, 4) : []);
            const currentRecordsMarkup = source.length > 0
                ? source.map((record) => `
                    <article class="challenge-record-item">
                        <div>
                            <strong>${escapeHtml(record.ruleName || bundle.rule.name || '试炼记录')}</strong>
                            <p>${record.completed ? '完成试炼' : '试炼中断'} · 得分 ${clampInt(record.score, 0)}</p>
                        </div>
                        <span>${escapeHtml(this.formatCollectionTimestamp ? this.formatCollectionTimestamp(record.at) : formatDateLabel(bundle.mode, bundle.rotationKey))}</span>
                    </article>
                `).join('')
                : '<div class="codex-empty-state">当前轮换还没有留痕，去跑一局把分数打出来。</div>';
            const replayMarkup = replayEntries.length > 0
                ? replayEntries.map((entry) => `
                    <article class="challenge-record-item replayable">
                        <div>
                            <strong>${escapeHtml(entry.title || bundle.rule.name || '观星留痕')}</strong>
                            <p>${escapeHtml(entry.replayOnly ? '命盘回放' : '观星留痕')} · ${entry.completed ? '完成' : '中断'} · 得分 ${clampInt(entry.score, 0)}</p>
                            <div class="challenge-record-subline">
                                <span class="challenge-seed-chip">${escapeHtml(entry.seedSignature || '命盘签未定')}</span>
                                <span>${escapeHtml(entry.rotationLabel || formatDateLabel(entry.mode, entry.rotationKey))}</span>
                            </div>
                        </div>
                        <div class="challenge-record-actions">
                            <span>${escapeHtml(this.formatCollectionTimestamp ? this.formatCollectionTimestamp(entry.at) : formatDateLabel(entry.mode, entry.rotationKey))}</span>
                            <button type="button" class="collection-inline-btn secondary"
                                onclick="game.beginObservatoryReplay('${escapeHtml(entry.id)}')">复盘命盘</button>
                        </div>
                    </article>
                `).join('')
                : '<div class="codex-empty-state">观星留痕还没有可回放命盘，先完成一轮挑战或命盘回放。</div>';
            recordsEl.innerHTML = `
                <section class="challenge-record-section">
                    <div class="challenge-record-section-head">
                        <strong>当前轮换记录</strong>
                        <span>${escapeHtml(bundle.rotationLabel)}</span>
                    </div>
                    ${currentRecordsMarkup}
                </section>
                <section class="challenge-record-section">
                    <div class="challenge-record-section-head">
                        <strong>观星留痕</strong>
                        <span>${escapeHtml(`${replayEntries.length} 条可回放命盘`)}</span>
                    </div>
                    ${replayMarkup}
                </section>
            `;
        }

        if (sideEl) {
            const nextReward = bundle.rewards.find((item) => !item.claimed) || null;
            sideEl.innerHTML = `
                <section class="codex-side-card">
                    <span class="codex-side-kicker">观星总览</span>
                    <h3>${escapeHtml(bundle.meta.label)}进度</h3>
                    <div class="codex-summary-grid two-cols">
                        <div class="codex-summary-chip"><strong>${clampInt(bundle.progress.attempts, 0)}</strong><span>挑战次数</span></div>
                        <div class="codex-summary-chip"><strong>${clampInt(bundle.progress.completions, 0)}</strong><span>完成次数</span></div>
                        <div class="codex-summary-chip"><strong>${clampInt(bundle.progress.bestScore, 0)}</strong><span>最高得分</span></div>
                        <div class="codex-summary-chip"><strong>${bundle.mode === 'weekly' ? clampInt(bundle.progress.totalScore, 0) : clampInt(bundle.rewards.filter((item) => item.claimed).length, 0)}</strong><span>${bundle.mode === 'weekly' ? '累计积分' : '已领奖励'}</span></div>
                    </div>
                    <p>${escapeHtml(bundle.rule.objective || '观星台正在推演这一轮的试炼目标。')}</p>
                    <p class="collection-muted">当前命盘签：${escapeHtml(bundle.seedSignature)}</p>
                </section>
                <section class="codex-side-card">
                    <span class="codex-side-kicker">下一目标</span>
                    <h3>${escapeHtml(nextReward ? nextReward.label : '当前轮换已清空奖励')}</h3>
                    <p>${escapeHtml(nextReward ? nextReward.rewardText : '本轮奖励已全部领取，可以继续冲更高分。')}</p>
                </section>
                <section class="codex-side-card">
                    <span class="codex-side-kicker">观星留痕</span>
                    <h3>回放档案</h3>
                    <div class="codex-summary-grid two-cols">
                        <div class="codex-summary-chip"><strong>${archiveSummary.totalRecords}</strong><span>总留痕</span></div>
                        <div class="codex-summary-chip"><strong>${archiveSummary.replayCount}</strong><span>命盘回放</span></div>
                        <div class="codex-summary-chip"><strong>${archiveSummary.replayableCount}</strong><span>可回放命盘</span></div>
                        <div class="codex-summary-chip"><strong>${archiveSummary.latest?.seedSignature || '待生成'}</strong><span>最近命盘签</span></div>
                    </div>
                    <p>${escapeHtml(archiveSummary.latest?.title
                ? `最近留痕：${archiveSummary.latest.title}。`
                : '完成任意观星挑战后，命盘签和成绩都会沉淀到这里。')}</p>
                </section>
            `;
        }

        if (rankingEl) {
            rankingEl.innerHTML = bundle.mode === 'global'
                ? `
                    <section class="codex-side-card">
                        <span class="codex-side-kicker">众生榜</span>
                        <h3>本周统一排行</h3>
                        <div class="challenge-leaderboard">
                            ${bundle.leaderboard.map((item) => `
                                <div class="challenge-rank-row ${item.highlight ? 'highlight' : ''}">
                                    <span>#${item.rank}</span>
                                    <strong>${escapeHtml(item.name)}</strong>
                                    <span>${clampInt(item.score, 0)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </section>
                `
                : `
                    <section class="codex-side-card">
                        <span class="codex-side-kicker">冲分建议</span>
                        <h3>怎样把分打高</h3>
                        <p>优先保证章节推进，再补法则与法宝发现。血量越健康，结算奖励越容易再抬一档。</p>
                    </section>
                `;
        }

        if (launchEl) {
            launchEl.innerHTML = `
                <button type="button" class="menu-btn primary challenge-launch-btn"
                    onclick="game.beginChallengeStart('${escapeHtml(bundle.mode)}')">${isCurrentRun ? '继续当前挑战' : `开启${escapeHtml(bundle.meta.label)}`}</button>
                <p class="collection-muted">${escapeHtml(isCurrentRun
                ? '当前轮换已在进行中，继续推进地图即可累计分数。'
                : '将固定角色、命格、灵契与章节目标，并直接开始新的挑战轮回。')}</p>
            `;
        }

        this.renderMainMenuChallengeSummary();
        this.renderChallengeRunBanner();
    };

    Game.prototype.getCharacterDisplayName = function (characterId = '') {
        if (typeof CHARACTERS !== 'undefined' && CHARACTERS && CHARACTERS[characterId]) {
            return CHARACTERS[characterId].name || characterId;
        }
        return characterId || '未知角色';
    };

    Game.prototype.getChallengeMetaName = function (type = 'destiny', itemId = '') {
        if (!itemId) return '未指定';
        if (type === 'destiny' && typeof this.getRunDestinyMetaById === 'function') {
            return this.getRunDestinyMetaById(itemId, 1)?.name || itemId;
        }
        if (type === 'spirit' && typeof this.getSpiritCompanionMetaById === 'function') {
            return this.getSpiritCompanionMetaById(itemId, 1)?.name || itemId;
        }
        if (type === 'vow' && typeof this.getRunVowMetaById === 'function') {
            return this.getRunVowMetaById(itemId, 1)?.name || itemId;
        }
        return itemId;
    };

    Game.prototype.renderMainMenuChallengeSummary = function () {
        if (typeof document === 'undefined') return;
        this.ensureChallengeHubBootState();
        const dailyEl = document.getElementById('menu-daily-omen-card');
        const weeklyEl = document.getElementById('menu-weekly-ordeal-card');
        const unlockEl = document.getElementById('menu-unlock-focus-card');
        if (!dailyEl || !weeklyEl || !unlockEl) return;

        const daily = this.buildChallengeBundle('daily');
        const weekly = this.buildChallengeBundle('weekly');
        const nextWeeklyReward = weekly.rewards.find((item) => !item.claimed);
        const latestUnlock = typeof this.getCollectionUnlockHistory === 'function'
            ? this.getCollectionUnlockHistory(1)[0] || null
            : null;

        dailyEl.innerHTML = `
            <span class="menu-oracle-kicker">今日天机</span>
            <h4>${escapeHtml(daily.rule?.name || '未解出')}</h4>
            <p>${escapeHtml(daily.rule?.objective || '观星台正在推演今日轮换。')}</p>
            <div class="menu-oracle-meta">
                <span>${escapeHtml(daily.rule?.targetChapter || '未知章节')}</span>
                <strong>${clampInt(daily.progress.completions, 0)} 次完成</strong>
            </div>
            <button type="button" class="collection-inline-btn" onclick="game.showChallengeHub('daily')">查看今日天机</button>
        `;

        weeklyEl.innerHTML = `
            <span class="menu-oracle-kicker">七日劫数</span>
            <h4>${escapeHtml(weekly.rule?.name || '未解出')}</h4>
            <p>${escapeHtml(nextWeeklyReward ? `下一奖励：${nextWeeklyReward.label}` : '本周奖励已清空，可继续冲更高分。')}</p>
            <div class="menu-oracle-meta">
                <span>${escapeHtml(weekly.rotationLabel)}</span>
                <strong>${clampInt(weekly.progress.totalScore, 0)} 分</strong>
            </div>
            <button type="button" class="collection-inline-btn" onclick="game.showChallengeHub('weekly')">查看周积分</button>
        `;

        unlockEl.innerHTML = latestUnlock
            ? `
                <span class="menu-oracle-kicker">最近解锁</span>
                <h4>${escapeHtml(latestUnlock.name || '藏经阁更新')}</h4>
                <p>${escapeHtml(latestUnlock.note || '藏经阁有新的研究记录。')}</p>
                <div class="menu-oracle-meta">
                    <span>${escapeHtml(this.formatCollectionTimestamp ? this.formatCollectionTimestamp(latestUnlock.timestamp) : '最近')}</span>
                    <strong>洞府可复盘</strong>
                </div>
                <button type="button" class="collection-inline-btn" onclick="game.showCollection('sanctum')">查看洞府</button>
            `
            : `
                <span class="menu-oracle-kicker">最近解锁</span>
                <h4>洞府新线索</h4>
                <p>去打一局、补一条法则或灵契研究，主菜单会在这里持续更新。</p>
                <div class="menu-oracle-meta">
                    <span>藏经阁</span>
                    <strong>等待入档</strong>
                </div>
                <button type="button" class="collection-inline-btn" onclick="game.showCollection('sanctum')">打开洞府</button>
            `;
    };

    Game.prototype.beginChallengeStart = function (mode = 'daily') {
        this.ensureChallengeHubBootState();
        const bundle = this.buildChallengeBundle(mode);
        if (!bundle || !bundle.rule) return false;

        if (
            this.activeChallengeRun
            && !this.activeChallengeRun.resolved
            && this.activeChallengeRun.mode === bundle.mode
            && this.activeChallengeRun.rotationKey === bundle.rotationKey
        ) {
            this.showScreen('map-screen');
            return true;
        }

        this.pendingChallengeStart = {
            mode: bundle.mode,
            rotationKey: bundle.rotationKey,
            rule: clone(bundle.rule),
            modeLabel: bundle.meta.label,
            bundleSnapshot: clone(bundle),
            replayOnly: false,
            seedSignature: bundle.seedSignature || ''
        };

        if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
            Utils.showBattleLog(`观星台已锁定【${bundle.rule.name}】。接下来会以固定命盘开启新一轮挑战。`, {
                category: 'system',
                duration: 2600
            });
        }

        if (typeof this.openSaveSlotsWithSync === 'function') {
            this.openSaveSlotsWithSync();
        } else if (typeof this.showCharacterSelection === 'function') {
            this.showCharacterSelection();
        }
        return true;
    };

    Game.prototype.beginObservatoryReplay = function (recordId = '') {
        this.ensureChallengeHubBootState();
        const bundle = this.buildReplayBundleFromArchiveEntry(recordId);
        if (!bundle || !bundle.rule) return false;

        if (
            this.activeChallengeRun
            && !this.activeChallengeRun.resolved
            && this.activeChallengeRun.replayOnly
            && this.activeChallengeRun.archiveEntryId === bundle.archiveEntryId
        ) {
            this.showScreen('map-screen');
            return true;
        }

        this.pendingChallengeStart = {
            mode: bundle.mode,
            rotationKey: bundle.rotationKey,
            rule: clone(bundle.rule),
            modeLabel: bundle.meta.label,
            bundleSnapshot: clone(bundle),
            replayOnly: true,
            seedSignature: bundle.seedSignature || '',
            archiveEntryId: bundle.archiveEntryId || ''
        };

        if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
            Utils.showBattleLog(`观星台开始回放【${bundle.rule.name}】。本轮只记录留痕，不计入当前轮换奖励。`, {
                category: 'system',
                duration: 2800
            });
        }

        if (typeof this.openSaveSlotsWithSync === 'function') {
            this.openSaveSlotsWithSync();
        } else if (typeof this.showCharacterSelection === 'function') {
            this.showCharacterSelection();
        }
        return true;
    };

    Game.prototype.clearPendingChallengeStart = function () {
        this.pendingChallengeStart = null;
    };

    Game.prototype.normalizeActiveChallengeRun = function (rawRun = null) {
        const source = rawRun && typeof rawRun === 'object' ? rawRun : null;
        if (!source || !source.ruleId || !source.mode || !source.rotationKey) return null;
        return {
            mode: ['daily', 'weekly', 'global'].includes(source.mode) ? source.mode : 'daily',
            modeLabel: String(source.modeLabel || HUB_META[source.mode]?.label || HUB_META.daily.label),
            rotationKey: String(source.rotationKey || ''),
            rotationLabel: String(source.rotationLabel || formatDateLabel(source.mode, source.rotationKey)),
            ruleId: String(source.ruleId || ''),
            ruleName: String(source.ruleName || ''),
            icon: String(source.icon || '✦'),
            goalRealm: clampInt(source.goalRealm, 1, 18),
            targetChapter: String(source.targetChapter || ''),
            characterId: String(source.characterId || ''),
            runDestinyId: String(source.runDestinyId || ''),
            spiritCompanionId: String(source.spiritCompanionId || ''),
            vowIds: Array.isArray(source.vowIds) ? source.vowIds.map((id) => String(id || '')).filter(Boolean).slice(0, 2) : [],
            battleModifiers: source.battleModifiers && typeof source.battleModifiers === 'object' ? clone(source.battleModifiers) : {},
            scoreWeights: source.scoreWeights && typeof source.scoreWeights === 'object'
                ? { ...this.getChallengeScoreDefaults(), ...clone(source.scoreWeights) }
                : this.getChallengeScoreDefaults(),
            startedAt: clampInt(source.startedAt, 0),
            resolved: !!source.resolved,
            completed: !!source.completed,
            finalScore: clampInt(source.finalScore, 0),
            seedSignature: String(source.seedSignature || ''),
            replayOnly: !!source.replayOnly,
            archiveEntryId: String(source.archiveEntryId || ''),
            progress: {
                battleWins: clampInt(source.progress?.battleWins, 0),
                eliteWins: clampInt(source.progress?.eliteWins, 0),
                bossWins: clampInt(source.progress?.bossWins, 0),
                realmClears: clampInt(source.progress?.realmClears, 0),
                startLawCount: clampInt(source.progress?.startLawCount, 0),
                startTreasureCount: clampInt(source.progress?.startTreasureCount, 0),
                currentScore: clampInt(source.progress?.currentScore, 0)
            }
        };
    };

    Game.prototype.createActiveChallengeRun = function (bundle) {
        const defaults = this.getChallengeScoreDefaults();
        return this.normalizeActiveChallengeRun({
            mode: bundle.mode,
            modeLabel: bundle.meta.label,
            rotationKey: bundle.rotationKey,
            rotationLabel: bundle.rotationLabel,
            ruleId: bundle.rule.id,
            ruleName: bundle.rule.name,
            icon: bundle.rule.icon || '✦',
            goalRealm: bundle.rule.goalRealm || 3,
            targetChapter: bundle.rule.targetChapter || '',
            characterId: bundle.rule.characterId || '',
            runDestinyId: bundle.rule.runDestinyId || '',
            spiritCompanionId: bundle.rule.spiritCompanionId || '',
            vowIds: Array.isArray(bundle.rule.vowIds) ? bundle.rule.vowIds.slice(0, 2) : [],
            battleModifiers: bundle.rule.battleModifiers || {},
            scoreWeights: { ...defaults, ...(bundle.rule.scoreWeights || {}) },
            startedAt: Date.now(),
            seedSignature: String(bundle.seedSignature || this.buildChallengeSeedSignature(bundle.mode, bundle.rotationKey, bundle.rule)),
            replayOnly: !!bundle.replayOnly,
            archiveEntryId: String(bundle.archiveEntryId || ''),
            progress: {
                battleWins: 0,
                eliteWins: 0,
                bossWins: 0,
                realmClears: 0,
                startLawCount: Array.isArray(this.player?.collectedLaws) ? this.player.collectedLaws.length : 0,
                startTreasureCount: Array.isArray(this.player?.collectedTreasures) ? this.player.collectedTreasures.length : 0,
                currentScore: 0
            }
        });
    };

    Game.prototype.persistActiveChallengeRun = function () {
        try {
            if (typeof localStorage === 'undefined') return;
            if (!this.activeChallengeRun) {
                localStorage.removeItem(ACTIVE_CHALLENGE_RUN_KEY);
                return;
            }
            localStorage.setItem(ACTIVE_CHALLENGE_RUN_KEY, JSON.stringify({
                currentSaveSlot: this.currentSaveSlot,
                activeRun: this.activeChallengeRun
            }));
        } catch (error) {
            console.warn('Persist active challenge run failed:', error);
        }
    };

    Game.prototype.restoreActiveChallengeRun = function () {
        try {
            if (typeof localStorage === 'undefined') return null;
            const raw = localStorage.getItem(ACTIVE_CHALLENGE_RUN_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            const savedSlot = parsed && parsed.currentSaveSlot !== undefined ? parsed.currentSaveSlot : null;
            if (
                savedSlot !== null
                && this.currentSaveSlot !== null
                && this.currentSaveSlot !== undefined
                && clampInt(savedSlot, -1) !== clampInt(this.currentSaveSlot, -2)
            ) {
                return null;
            }
            return this.normalizeActiveChallengeRun(parsed ? parsed.activeRun : null);
        } catch (error) {
            return null;
        }
    };

    Game.prototype.clearActiveChallengeRun = function () {
        this.activeChallengeRun = null;
        this.persistActiveChallengeRun();
        this.renderChallengeRunBanner();
    };

    Game.prototype.computeActiveChallengeScore = function (run = null) {
        const source = run || this.activeChallengeRun;
        if (!source) return 0;
        const weights = source.scoreWeights || this.getChallengeScoreDefaults();
        const currentLawCount = Array.isArray(this.player?.collectedLaws) ? this.player.collectedLaws.length : 0;
        const currentTreasureCount = Array.isArray(this.player?.collectedTreasures) ? this.player.collectedTreasures.length : 0;
        const lawGains = Math.max(0, currentLawCount - clampInt(source.progress?.startLawCount, 0));
        const treasureGains = Math.max(0, currentTreasureCount - clampInt(source.progress?.startTreasureCount, 0));
        const hpRatio = this.player && this.player.maxHp > 0
            ? Math.max(0, Math.min(1, safeNumber(this.player.currentHp, 0) / safeNumber(this.player.maxHp, 1)))
            : 0;
        return clampInt(
            clampInt(source.progress?.battleWins, 0) * clampInt(weights.battleWin, 0)
            + clampInt(source.progress?.eliteWins, 0) * clampInt(weights.eliteWin, 0)
            + clampInt(source.progress?.bossWins, 0) * clampInt(weights.bossWin, 0)
            + clampInt(source.progress?.realmClears, 0) * clampInt(weights.realmClear, 0)
            + lawGains * clampInt(weights.lawDiscover, 0)
            + treasureGains * clampInt(weights.treasureDiscover, 0)
            + Math.floor(hpRatio * clampInt(weights.hpBonus, 0))
            + (source.completed ? clampInt(weights.completeBonus, 0) : 0),
            0
        );
    };

    Game.prototype.refreshActiveChallengeScore = function (shouldRender = true) {
        if (!this.activeChallengeRun) return 0;
        this.activeChallengeRun.progress.currentScore = this.computeActiveChallengeScore(this.activeChallengeRun);
        this.persistActiveChallengeRun();
        if (shouldRender) this.renderChallengeRunBanner();
        return this.activeChallengeRun.progress.currentScore;
    };

    Game.prototype.recordChallengeCompletion = function (run, options = {}) {
        const entry = this.getChallengeProgressEntry(run.mode, run.rotationKey, true);
        entry.attempts += 1;
        entry.completions += options.completed ? 1 : 0;
        entry.bestScore = Math.max(clampInt(entry.bestScore, 0), clampInt(run.finalScore, 0));
        if (run.mode === 'weekly') {
            entry.totalScore = clampInt(entry.totalScore, 0) + clampInt(run.finalScore, 0);
        }
        const record = {
            score: clampInt(run.finalScore, 0),
            completed: !!options.completed,
            at: Date.now(),
            ruleId: run.ruleId,
            ruleName: run.ruleName,
            reason: String(options.reason || ''),
            modeLabel: run.modeLabel,
            icon: run.icon
        };
        entry.records = [record, ...(Array.isArray(entry.records) ? entry.records : [])].slice(0, 8);
        entry.lastResult = {
            score: clampInt(run.finalScore, 0),
            completed: !!options.completed,
            at: record.at,
            ruleId: run.ruleId,
            ruleName: run.ruleName,
            reason: String(options.reason || '')
        };
        this.challengeProgressState.recentResults = [
            {
                mode: run.mode,
                score: clampInt(run.finalScore, 0),
                completed: !!options.completed,
                at: record.at,
                ruleName: run.ruleName,
                icon: run.icon,
                reason: String(options.reason || '')
            },
            ...(Array.isArray(this.challengeProgressState.recentResults) ? this.challengeProgressState.recentResults : [])
        ].slice(0, 12);
        this.saveChallengeProgressState();
    };

    Game.prototype.recordChallengeArchiveResult = function (run, options = {}) {
        if (!run) return null;
        const rule = normalizeChallengeRuleSnapshot({
            id: run.ruleId,
            name: run.ruleName,
            icon: run.icon,
            targetChapter: run.targetChapter,
            goalRealm: run.goalRealm,
            characterId: run.characterId,
            runDestinyId: run.runDestinyId,
            spiritCompanionId: run.spiritCompanionId,
            vowIds: run.vowIds,
            scoreWeights: run.scoreWeights,
            battleModifiers: run.battleModifiers
        });
        const statusLabel = options.completed ? '完成' : '中断';
        const replayNote = run.replayOnly ? ' · 回放不计奖励' : '';
        const note = `${statusLabel} · 得分 ${clampInt(run.finalScore, 0)}${replayNote}`;
        const entry = this.recordObservatoryArchiveEntry({
            id: `${run.replayOnly ? 'replay' : 'challenge'}:${run.mode}:${run.rotationKey}:${run.ruleId}:${Date.now()}`,
            type: run.replayOnly ? 'replay' : 'challenge',
            mode: run.mode,
            modeLabel: run.replayOnly ? '观星回放' : run.modeLabel,
            rotationKey: run.rotationKey,
            rotationLabel: run.rotationLabel || formatDateLabel(run.mode, run.rotationKey),
            seedSignature: run.seedSignature || this.buildChallengeSeedSignature(run.mode, run.rotationKey, rule),
            title: run.ruleName,
            note,
            icon: run.icon || '🔭',
            score: run.finalScore,
            completed: !!options.completed,
            at: Date.now(),
            reason: String(options.reason || ''),
            replayOnly: !!run.replayOnly,
            archiveEntryId: run.archiveEntryId || '',
            originLabel: run.replayOnly ? '观星回放' : '观星留痕',
            rule
        });
        if (typeof this.recordCollectionUnlock === 'function') {
            this.recordCollectionUnlock('observatory', {
                id: entry?.id || `${run.mode}:${run.rotationKey}:${run.ruleId}`,
                name: `${run.replayOnly ? '命盘回放' : '观星留痕'}·${run.ruleName}`,
                icon: run.icon || '🔭',
                note
            });
        }
        return entry;
    };

    Game.prototype.finalizeActiveChallengeRun = function (options = {}) {
        if (!this.activeChallengeRun) return null;
        const run = this.activeChallengeRun;
        run.completed = !!options.completed;
        run.resolved = true;
        run.finalScore = this.computeActiveChallengeScore(run);
        run.progress.currentScore = run.finalScore;
        if (!run.replayOnly) {
            this.recordChallengeCompletion(run, options);
        }
        this.recordChallengeArchiveResult(run, options);

        if (!run.replayOnly && options.completed && typeof this.recordCollectionUnlock === 'function') {
            this.recordCollectionUnlock('challenge', {
                id: `challenge:${run.mode}:${run.rotationKey}:${run.ruleId}`,
                name: `${run.modeLabel}·${run.ruleName}`,
                icon: run.icon || '🜂',
                note: `本轮得分 ${run.finalScore}，可回观星台领取对应奖励。`
            });
        }

        if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
            Utils.showBattleLog(`【${run.modeLabel}】${options.completed ? '完成' : '中断'}：${run.ruleName}，得分 ${run.finalScore}${run.replayOnly ? '（不计奖励）' : ''}`);
        }

        this.clearActiveChallengeRun();
        this.renderMainMenuChallengeSummary();
        if (this.currentScreen === 'challenge-screen') {
            this.initChallengeHub();
        }
        return run;
    };

    Game.prototype.grantChallengePvpCoins = function (amount = 0) {
        const delta = clampInt(amount, 0);
        if (delta <= 0 || typeof PVPService === 'undefined' || !PVPService) return false;
        if (typeof PVPService.loadEconomyState !== 'function' || typeof PVPService.saveEconomyState !== 'function') return false;
        const current = PVPService.loadEconomyState();
        let next = PVPService.normalizeEconomyState({
            ...current,
            coins: clampInt(current.coins, 0) + delta,
            totalEarned: clampInt(current.totalEarned, 0) + delta
        });
        if (typeof PVPService.appendEconomyLog === 'function') {
            next = PVPService.appendEconomyLog(next, {
                type: 'challenge_reward',
                coins: delta,
                detail: '周挑战奖励'
            });
        }
        PVPService.saveEconomyState(next);
        return true;
    };

    Game.prototype.grantChallengePvpItem = function (itemId = '', fallbackCoins = 0) {
        if (!itemId || typeof PVPService === 'undefined' || !PVPService) {
            return this.grantChallengePvpCoins(fallbackCoins);
        }
        if (
            typeof PVPService.getShopItemById !== 'function'
            || typeof PVPService.loadEconomyState !== 'function'
            || typeof PVPService.saveEconomyState !== 'function'
        ) {
            return this.grantChallengePvpCoins(fallbackCoins);
        }
        const item = PVPService.getShopItemById(itemId);
        if (!item) {
            return this.grantChallengePvpCoins(fallbackCoins);
        }
        const current = PVPService.loadEconomyState();
        if (current.ownedItems && current.ownedItems[item.id]) {
            return this.grantChallengePvpCoins(fallbackCoins);
        }
        let next = PVPService.normalizeEconomyState({
            ...current,
            ownedItems: {
                ...(current.ownedItems || {}),
                [item.id]: true
            },
            ...(item.type === 'skin' && !current.equippedSkinId ? { equippedSkinId: item.id } : {}),
            ...(item.type === 'title' && !current.equippedTitleId ? { equippedTitleId: item.id } : {})
        });
        if (typeof PVPService.appendEconomyLog === 'function') {
            next = PVPService.appendEconomyLog(next, {
                type: 'challenge_reward',
                itemId: item.id,
                itemName: item.name || null,
                detail: '周挑战解锁'
            });
        }
        PVPService.saveEconomyState(next);
        return true;
    };

    Game.prototype.claimChallengeMilestone = function (mode = 'daily', rewardId = '') {
        this.ensureChallengeHubBootState();
        const bundle = this.buildChallengeBundle(mode);
        if (!bundle || !bundle.rule || !rewardId) return false;
        const reward = bundle.rewards.find((item) => item.id === rewardId);
        if (!reward || reward.claimed || !reward.ready) return false;

        const entry = this.getChallengeProgressEntry(bundle.mode, bundle.rotationKey, true);
        entry.claimedRewards[rewardId] = true;
        const logs = [];
        (reward.rewards || []).forEach((grant) => {
            if (!grant || !grant.kind) return;
            if (grant.kind === 'pvpCoins') {
                if (this.grantChallengePvpCoins(grant.amount)) logs.push(`天道币 +${clampInt(grant.amount, 0)}`);
            } else if (grant.kind === 'legacyEssence') {
                if (typeof this.awardLegacyEssence === 'function') {
                    this.awardLegacyEssence(clampInt(grant.amount, 0), '周挑战奖励', { silent: true });
                    logs.push(`传承精魄 +${clampInt(grant.amount, 0)}`);
                }
            } else if (grant.kind === 'pvpItem') {
                const ok = this.grantChallengePvpItem(grant.itemId, grant.fallbackCoins);
                if (ok) {
                    const fallbackItem = (typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getShopItemById === 'function')
                        ? PVPService.getShopItemById(grant.itemId)
                        : null;
                    logs.push(fallbackItem ? `解锁 ${fallbackItem.name}` : '已发放周挑战外观奖励');
                }
            } else if (grant.kind === 'codexRecord') {
                if (typeof this.recordCollectionUnlock === 'function') {
                    this.recordCollectionUnlock('challenge', {
                        id: grant.id || `${bundle.mode}:${rewardId}`,
                        name: grant.name || reward.label,
                        icon: grant.icon || bundle.rule.icon || '✦',
                        note: grant.note || reward.rewardText || '周挑战奖励已入档。'
                    });
                    logs.push(grant.name || '观星记录已入档');
                }
            }
        });

        this.saveChallengeProgressState();
        if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
            Utils.showBattleLog(`观星台奖励已领取：${logs.join(' / ') || reward.rewardText}`);
        }
        this.initChallengeHub();
        this.renderMainMenuChallengeSummary();
        return true;
    };

    Game.prototype.renderChallengeRunBanner = function () {
        if (typeof document === 'undefined') return;
        const banner = this.ensureChallengeRunBannerHost();
        if (!banner) return;
        const run = this.activeChallengeRun;
        const visible = !!run && !run.resolved && this.currentScreen === 'map-screen';
        banner.style.display = visible ? 'flex' : 'none';
        if (!visible) {
            banner.innerHTML = '';
            return;
        }
        const score = this.computeActiveChallengeScore(run);
        run.progress.currentScore = score;
        this.persistActiveChallengeRun();
        banner.innerHTML = `
            <span class="challenge-run-chip">${escapeHtml(run.modeLabel)}</span>
            <div class="challenge-run-text">
                <strong>${escapeHtml(run.ruleName)}</strong>
                <span>${escapeHtml(run.targetChapter || `目标至第 ${run.goalRealm} 重`)}${run.seedSignature ? ` · 命盘签 ${run.seedSignature}` : ''}</span>
            </div>
            <div class="challenge-run-stats">
                <span>${run.replayOnly ? '观星回放 · 不计奖励' : `完成线 第 ${run.goalRealm} 重`}</span>
                <strong>${score} 分</strong>
            </div>
        `;
    };

    Game.prototype.ensureChallengeRunBannerHost = function () {
        if (typeof document === 'undefined') return null;
        const existing = document.getElementById('challenge-run-banner');
        if (existing) return existing;

        const mapScreen = document.getElementById('map-screen');
        if (!mapScreen) return null;

        const banner = document.createElement('div');
        banner.id = 'challenge-run-banner';
        banner.className = 'challenge-run-banner';
        banner.style.display = 'none';

        const modernMapShell = mapScreen.querySelector('.map-screen-v3');
        if (modernMapShell) {
            const anchor = modernMapShell.querySelector('.map-scroll-container');
            if (anchor && anchor.parentNode === modernMapShell) {
                modernMapShell.insertBefore(banner, anchor);
            } else {
                modernMapShell.appendChild(banner);
            }
            return banner;
        }

        const legacyAnchor = mapScreen.querySelector('.map-container, .map-footer');
        if (legacyAnchor && legacyAnchor.parentNode === mapScreen) {
            mapScreen.insertBefore(banner, legacyAnchor);
        } else {
            mapScreen.appendChild(banner);
        }
        return banner;
    };

    Game.prototype.renderChallengeLockedSelection = function (type = 'destiny') {
        const pending = this.pendingChallengeStart;
        if (!pending || !pending.rule) return false;
        const host = document.getElementById(type === 'destiny' ? 'run-destiny-selection' : 'spirit-companion-selection');
        const summary = document.getElementById(type === 'destiny' ? 'run-destiny-summary' : 'spirit-companion-summary');
        if (!host) return false;

        const meta = type === 'destiny'
            ? this.getRunDestinyMetaById(pending.rule.runDestinyId, 1)
            : this.getSpiritCompanionMetaById(pending.rule.spiritCompanionId, 1);
        if (!meta) return false;

        host.innerHTML = `
            <div class="run-destiny-card selected challenge-locked-card ${type === 'spirit' ? 'run-spirit-card' : ''}">
                <div class="run-destiny-head">
                    <span class="run-destiny-icon">${escapeHtml(meta.icon || '✦')}</span>
                    <div class="run-destiny-title-group">
                        <span class="run-destiny-name">${escapeHtml(meta.name || '未知条目')}</span>
                        <span class="run-destiny-tier">${escapeHtml(type === 'destiny' ? `${meta.category || '命格'} · ${meta.tierLabel || '初印'}` : (meta.title || `${meta.category || '灵契'} · ${meta.tierLabel || '初契'}`))}</span>
                    </div>
                    <span class="challenge-lock-pill">挑战锁定</span>
                </div>
                <div class="run-destiny-desc">${escapeHtml(meta.description || '')}</div>
                <div class="run-destiny-summary">${escapeHtml(type === 'destiny'
                ? (meta.summary || meta.playstyle || meta.description || '')
                : `${meta.passiveDesc || ''} ${meta.activeDesc || ''}`.trim())}</div>
            </div>
        `;

        if (summary) {
            summary.textContent = type === 'destiny'
                ? `${pending.replayOnly ? '本次回放' : '本轮挑战'}固定命格「${meta.name}」，用于稳定这套轮换的开局节奏。`
                : `${pending.replayOnly ? '本次回放' : '本轮挑战'}固定灵契「${meta.name}」，用于锁定当前观星台的测试方向。`;
        }
        return true;
    };

    Game.prototype.decorateCharacterSelectionForChallenge = function () {
        const pending = this.pendingChallengeStart;
        if (!pending || !pending.rule || typeof document === 'undefined') return;
        const container = document.getElementById('character-selection-container');
        const confirmBtn = document.getElementById('confirm-character-btn');
        if (!container) return;

        let banner = document.getElementById('challenge-selection-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'challenge-selection-banner';
            banner.className = 'challenge-selection-banner';
            container.prepend(banner);
        }

        banner.innerHTML = `
            <div class="challenge-selection-head">
                <span class="challenge-run-chip">${escapeHtml(pending.modeLabel || HUB_META[pending.mode]?.label || '周挑战')}</span>
                <strong>${escapeHtml(pending.rule.name || '挑战轮换')}</strong>
            </div>
            <p>${escapeHtml(pending.rule.objective || '本轮将使用固定命盘直接开局。')}</p>
            <div class="challenge-selection-meta">
                <span>角色：${escapeHtml(this.getCharacterDisplayName(pending.rule.characterId))}</span>
                <span>章节：${escapeHtml(pending.rule.targetChapter || `完成至第 ${pending.rule.goalRealm} 重`)}</span>
            </div>
        `;

        document.querySelectorAll('.character-card').forEach((card) => {
            const locked = card.dataset.id !== pending.rule.characterId;
            card.classList.toggle('challenge-card-locked', locked);
            if (locked) {
                card.style.pointerEvents = 'none';
            }
        });

        this.selectedCharacterId = pending.rule.characterId;
        this.selectedRunDestinyId = pending.rule.runDestinyId;
        this.selectedSpiritCompanionId = pending.rule.spiritCompanionId;
        if (typeof originalSelectCharacter === 'function') {
            originalSelectCharacter.call(this, pending.rule.characterId);
        }

        if (confirmBtn) {
            confirmBtn.querySelector('.btn-text').textContent = pending.replayOnly ? '以回放命盘开局' : '以挑战命盘开局';
        }
    };

    Game.prototype.applyChallengeRunStart = function (bundle) {
        const run = this.createActiveChallengeRun(bundle);
        this.activeChallengeRun = run;
        this.persistActiveChallengeRun();

        if (Array.isArray(bundle.rule.vowIds) && this.player && typeof this.player.applyRunVow === 'function') {
            bundle.rule.vowIds.slice(0, 2).forEach((vowId) => {
                try {
                    this.player.applyRunVow(vowId);
                } catch (error) {
                    console.warn('Apply challenge vow failed:', vowId, error);
                }
            });
        }

        if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
            Utils.showBattleLog(`【${bundle.meta.label}】${bundle.rule.name} 已开始，完成线：第 ${bundle.rule.goalRealm} 重。${bundle.replayOnly ? '本轮只记录留痕。' : ''}`);
        }
        this.renderMainMenuChallengeSummary();
        this.renderChallengeRunBanner();
    };

    Game.prototype.applyChallengeModifiersToEnemies = function (enemies = []) {
        const run = this.activeChallengeRun;
        if (!run || run.resolved) return Array.isArray(enemies) ? enemies : [enemies];
        return (Array.isArray(enemies) ? enemies : [enemies]).filter(Boolean).map((enemy) => {
            const next = clone(enemy) || {};
            const hpMul = Math.max(1, safeNumber(run.battleModifiers.enemyHpMul, 1));
            const atkMul = Math.max(1, safeNumber(run.battleModifiers.enemyAtkMul, 1));
            const openingBlock = clampInt(run.battleModifiers.enemyOpeningBlock, 0);
            const enemyDebuff = run.battleModifiers.enemyDebuff;

            next.hp = Math.max(1, Math.floor(safeNumber(next.hp || next.maxHp, 1) * hpMul));
            next.maxHp = Math.max(next.hp, Math.floor(safeNumber(next.maxHp || next.hp, 1) * hpMul));
            next.block = clampInt(next.block, 0) + openingBlock;
            next.patterns = Array.isArray(next.patterns)
                ? next.patterns.map((pattern) => {
                    const copied = { ...(pattern || {}) };
                    if (copied.type === 'attack' || copied.type === 'multiAttack') {
                        copied.value = Math.max(1, Math.floor(safeNumber(copied.value, 0) * atkMul));
                    }
                    return copied;
                })
                : [];
            if (
                enemyDebuff
                && enemyDebuff.type
                && clampInt(enemyDebuff.value, 0) > 0
            ) {
                next.patterns.unshift({
                    type: 'debuff',
                    buffType: enemyDebuff.type,
                    value: clampInt(enemyDebuff.value, 0),
                    intent: enemyDebuff.intent || '周挑战词缀'
                });
            }
            next.challengeMarked = true;
            return next;
        });
    };

    Game.prototype.registerChallengeBattleResult = function (nodeType = 'enemy') {
        if (!this.activeChallengeRun || this.activeChallengeRun.resolved) return;
        if (nodeType === 'boss') {
            this.activeChallengeRun.progress.bossWins += 1;
        } else if (nodeType === 'elite' || nodeType === 'trial') {
            this.activeChallengeRun.progress.eliteWins += 1;
        } else {
            this.activeChallengeRun.progress.battleWins += 1;
        }
        const score = this.refreshActiveChallengeScore();
        if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
            Utils.showBattleLog(`【${this.activeChallengeRun.modeLabel}】当前得分 ${score}`);
        }
    };

    Game.prototype.getChallengeHubPayload = function () {
        this.ensureChallengeHubBootState();
        const tab = this.challengeHubState.tab || 'daily';
        const bundle = this.currentScreen === 'challenge-screen' ? this.buildChallengeBundle(tab) : null;
        const archive = this.getObservatoryArchiveSummary();
        return {
            pending: this.pendingChallengeStart
                ? {
                    mode: this.pendingChallengeStart.mode,
                    ruleId: this.pendingChallengeStart.rule?.id || '',
                    characterId: this.pendingChallengeStart.rule?.characterId || '',
                    replayOnly: !!this.pendingChallengeStart.replayOnly,
                    seedSignature: String(this.pendingChallengeStart.seedSignature || '')
                }
                : null,
            activeRun: this.activeChallengeRun
                ? {
                    mode: this.activeChallengeRun.mode,
                    modeLabel: this.activeChallengeRun.modeLabel,
                    ruleId: this.activeChallengeRun.ruleId,
                    ruleName: this.activeChallengeRun.ruleName,
                    goalRealm: this.activeChallengeRun.goalRealm,
                    currentScore: clampInt(this.activeChallengeRun.progress?.currentScore, 0),
                    resolved: !!this.activeChallengeRun.resolved,
                    replayOnly: !!this.activeChallengeRun.replayOnly,
                    seedSignature: String(this.activeChallengeRun.seedSignature || '')
                }
                : null,
            hub: bundle
                ? {
                    activeTab: tab,
                    ruleName: bundle.rule?.name || '',
                    targetChapter: bundle.rule?.targetChapter || '',
                    rewardCount: bundle.rewards.length,
                    bestScore: clampInt(bundle.progress.bestScore, 0),
                    totalScore: clampInt(bundle.progress.totalScore, 0),
                    seedSignature: bundle.seedSignature || ''
                }
                : null,
            archive: {
                totalRecords: archive.totalRecords,
                replayCount: archive.replayCount,
                replayableCount: archive.replayableCount,
                latestTitle: archive.latest?.title || '',
                latestSeedSignature: archive.latest?.seedSignature || ''
            }
        };
    };

    Game.prototype.showScreen = function (screenId) {
        const prevScreen = this.currentScreen;
        const result = typeof originalShowScreen === 'function'
            ? originalShowScreen.call(this, screenId)
            : undefined;

        if (screenId === 'main-menu') {
            if (prevScreen === 'character-selection-screen' && this.pendingChallengeStart && !this.activeChallengeRun) {
                this.clearPendingChallengeStart();
            }
            this.renderMainMenuChallengeSummary();
        } else if (screenId === 'challenge-screen') {
            this.initChallengeHub();
        } else if (screenId === 'map-screen') {
            this.renderChallengeRunBanner();
        } else {
            this.renderChallengeRunBanner();
        }

        return result;
    };

    Game.prototype.showCharacterSelection = function () {
        const result = typeof originalShowCharacterSelection === 'function'
            ? originalShowCharacterSelection.call(this)
            : undefined;
        this.decorateCharacterSelectionForChallenge();
        return result;
    };

    Game.prototype.renderRunDestinySelection = function (characterId) {
        if (this.pendingChallengeStart && this.renderChallengeLockedSelection('destiny')) {
            this.updateCharacterSelectionConfirmState();
            return;
        }
        if (typeof originalRenderRunDestinySelection === 'function') {
            return originalRenderRunDestinySelection.call(this, characterId);
        }
        return undefined;
    };

    Game.prototype.renderSpiritCompanionSelection = function (characterId) {
        if (this.pendingChallengeStart && this.renderChallengeLockedSelection('spirit')) {
            this.updateCharacterSelectionConfirmState();
            return;
        }
        if (typeof originalRenderSpiritCompanionSelection === 'function') {
            return originalRenderSpiritCompanionSelection.call(this, characterId);
        }
        return undefined;
    };

    Game.prototype.selectCharacter = function (charId) {
        if (this.pendingChallengeStart && this.pendingChallengeStart.rule && charId !== this.pendingChallengeStart.rule.characterId) {
            if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
                Utils.showBattleLog(`${this.pendingChallengeStart.replayOnly ? '观星回放' : '观星挑战'}已锁定当前角色，需按观星台给出的命盘开局。`);
            }
            return;
        }
        if (typeof originalSelectCharacter === 'function') {
            return originalSelectCharacter.call(this, charId);
        }
        return undefined;
    };

    Game.prototype.selectRunDestiny = function (destinyId) {
        if (this.pendingChallengeStart && destinyId !== this.pendingChallengeStart.rule?.runDestinyId) return;
        if (typeof originalSelectRunDestiny === 'function') {
            return originalSelectRunDestiny.call(this, destinyId);
        }
        return undefined;
    };

    Game.prototype.selectSpiritCompanion = function (spiritId) {
        if (this.pendingChallengeStart && spiritId !== this.pendingChallengeStart.rule?.spiritCompanionId) return;
        if (typeof originalSelectSpiritCompanion === 'function') {
            return originalSelectSpiritCompanion.call(this, spiritId);
        }
        return undefined;
    };

    Game.prototype.startNewGame = function (characterId = 'linFeng', options = {}) {
        const pending = this.pendingChallengeStart;
        const bundle = pending?.bundleSnapshot
            ? clone(pending.bundleSnapshot)
            : (pending ? this.buildChallengeBundle(pending.mode) : null);
        const isMatchingPending = !!bundle && !!bundle.rule && (
            !!pending?.bundleSnapshot
            || (
                bundle.rotationKey === pending.rotationKey
                && bundle.rule.id === pending.rule.id
            )
        );

        if (!isMatchingPending) {
            this.clearPendingChallengeStart();
            this.clearActiveChallengeRun();
            return typeof originalStartNewGame === 'function'
                ? originalStartNewGame.call(this, characterId, options)
                : undefined;
        }

        const lockedOptions = {
            ...(options && typeof options === 'object' ? options : {}),
            runDestinyId: bundle.rule.runDestinyId,
            spiritCompanionId: bundle.rule.spiritCompanionId
        };
        const result = typeof originalStartNewGame === 'function'
            ? originalStartNewGame.call(this, bundle.rule.characterId, lockedOptions)
            : undefined;

        this.applyChallengeRunStart(bundle);
        this.clearPendingChallengeStart();
        if (typeof this.startRealm === 'function') {
            this.startRealm(1, false);
            this.renderChallengeRunBanner();
        }
        return result;
    };

    Game.prototype.startBattle = function (enemies, node = null) {
        const prepared = this.activeChallengeRun && !this.activeChallengeRun.resolved
            ? this.applyChallengeModifiersToEnemies(enemies)
            : enemies;
        return typeof originalStartBattle === 'function'
            ? originalStartBattle.call(this, prepared, node)
            : undefined;
    };

    Game.prototype.onBattleWon = async function (enemies) {
        const nodeType = this.currentBattleNode && this.currentBattleNode.type ? this.currentBattleNode.type : 'enemy';
        if (this.activeChallengeRun && !this.activeChallengeRun.resolved) {
            this.registerChallengeBattleResult(nodeType);
        }
        const result = typeof originalOnBattleWon === 'function'
            ? await originalOnBattleWon.call(this, enemies)
            : undefined;
        return result;
    };

    Game.prototype.onBattleLost = async function () {
        if (this.activeChallengeRun && !this.activeChallengeRun.resolved) {
            this.finalizeActiveChallengeRun({
                completed: false,
                reason: 'battle_lost'
            });
        }
        return typeof originalOnBattleLost === 'function'
            ? originalOnBattleLost.call(this)
            : undefined;
    };

    Game.prototype.onRealmComplete = function () {
        const currentRealm = this.player && this.player.realm ? this.player.realm : 1;
        if (this.activeChallengeRun && !this.activeChallengeRun.resolved) {
            this.activeChallengeRun.progress.realmClears += 1;
            if (currentRealm >= this.activeChallengeRun.goalRealm) {
                this.finalizeActiveChallengeRun({
                    completed: true,
                    reason: 'goal_reached'
                });
            } else {
                this.refreshActiveChallengeScore();
            }
        }
        return typeof originalOnRealmComplete === 'function'
            ? originalOnRealmComplete.call(this)
            : undefined;
    };

    Game.prototype.finishStrategicNode = function (node, title, message, icon = '✨') {
        const result = typeof originalFinishStrategicNode === 'function'
            ? originalFinishStrategicNode.call(this, node, title, message, icon)
            : undefined;

        if (node && node.type === 'observatory') {
            const note = String(message || '')
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .slice(0, 2)
                .join(' / ');
            const entry = this.recordObservatoryArchiveEntry({
                id: `omen:${Date.now()}:${hashString(`${title}:${message}`)}`,
                type: 'omen',
                mode: 'daily',
                modeLabel: '观星留痕',
                rotationKey: getDayKey(new Date()),
                rotationLabel: formatDateLabel('daily', getDayKey(new Date())),
                title: String(title || '观星留痕'),
                note,
                icon: String(icon || '🔭'),
                at: Date.now(),
                completed: true,
                replayOnly: false,
                originLabel: '观星台'
            });
            if (typeof this.recordCollectionUnlock === 'function') {
                this.recordCollectionUnlock('observatory', {
                    id: entry?.id || `omen:${Date.now()}`,
                    name: `观星留痕·${String(title || '星轨已定')}`,
                    icon: String(icon || '🔭'),
                    note: note || '观星台已留下新的留痕。'
                });
            }
        }

        return result;
    };

    Game.prototype.saveGame = function () {
        const result = typeof originalSaveGame === 'function'
            ? originalSaveGame.call(this)
            : undefined;
        this.persistActiveChallengeRun();
        return result;
    };

    Game.prototype.loadGame = function () {
        const result = typeof originalLoadGame === 'function'
            ? originalLoadGame.call(this)
            : undefined;
        this.ensureChallengeHubBootState();
        const restored = this.restoreActiveChallengeRun();
        if (restored) {
            this.activeChallengeRun = restored;
            this.refreshActiveChallengeScore();
        }
        return result;
    };

    Game.prototype.clearSave = function () {
        const result = typeof originalClearSave === 'function'
            ? originalClearSave.call(this)
            : undefined;
        this.clearActiveChallengeRun();
        return result;
    };

    Game.prototype.renderGameToText = function () {
        const raw = typeof originalRenderGameToText === 'function'
            ? originalRenderGameToText.call(this)
            : '{}';
        try {
            const payload = JSON.parse(raw);
            payload.challenge = this.getChallengeHubPayload();
            return JSON.stringify(payload);
        } catch (error) {
            return raw;
        }
    };

    if (typeof originalGameMapRender === 'function') {
        GameMap.prototype.render = function () {
            const result = originalGameMapRender.call(this);
            if (this?.game && typeof this.game.renderChallengeRunBanner === 'function') {
                this.game.renderChallengeRunBanner();
            }
            return result;
        };
    }
}());
