(function () {
    if (typeof Game === 'undefined') return;

    const COLLECTION_HISTORY_KEY = 'theDefierCollectionUnlockHistoryV1';
    const BOSS_MEMORY_RECORDS_KEY = 'theDefierBossMemoryRecordsV1';
    const SECTION_META = {
        laws: {
            title: '藏经阁 · 法则图鉴',
            subtitle: '补齐法则与共鸣链，规划命环装配顺序。'
        },
        spirits: {
            title: '藏经阁 · 灵契图鉴',
            subtitle: '比对灵契来源、适配章节与下一阶成长方向。'
        },
        chapters: {
            title: '藏经阁 · 章节档案',
            subtitle: '复盘章节天象、地脉、生态与路线提示。'
        },
        enemies: {
            title: '藏经阁 · 敌影档案',
            subtitle: '记录常驻敌影的战术画像、压制手段与应对窗口。'
        },
        bosses: {
            title: '藏经阁 · Boss 档案',
            subtitle: '整理主宰机制、破局窗口与反制法宝。'
        },
        builds: {
            title: '藏经阁 · 构筑快照',
            subtitle: '把当前牌组、命环、灵契与战绩压成一张构筑画像。'
        },
        sanctum: {
            title: '洞府总览 · 藏经阁',
            subtitle: '查看洞府房间、研究项、可领取目标与近期解锁记录。'
        }
    };

    const originalShowCollection = Game.prototype.showCollection;
    const originalInitCollection = Game.prototype.initCollection;
    const originalStartBattle = Game.prototype.startBattle;
    const originalOnBattleWon = Game.prototype.onBattleWon;
    const originalOnBattleLost = Game.prototype.onBattleLost;
    const originalHandleBossDefeated = Game.prototype.handleBossDefeated;
    const originalOnRealmComplete = Game.prototype.onRealmComplete;

    const sanitizeQuery = (value, max = 60) => String(value || '').trim().slice(0, max);
    const safeNumber = (value, fallback = 0) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    };
    const clampInt = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
        const num = Math.floor(safeNumber(value, min));
        return Math.max(min, Math.min(max, num));
    };
    const splitKeywords = (value, max = 4) => {
        const tokens = String(value || '')
            .split(/[、，,\/\s]+/)
            .map((item) => item.trim())
            .filter(Boolean);
        return [...new Set(tokens)].slice(0, max);
    };
    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const getCharacterMeta = (characterId) => {
        if (typeof CHARACTERS === 'undefined' || !CHARACTERS || !CHARACTERS[characterId]) return null;
        const meta = CHARACTERS[characterId];
        return {
            id: characterId,
            name: meta.name || characterId,
            title: meta.title || '',
            keywords: Array.isArray(meta.keywords) ? meta.keywords : []
        };
    };

    const getChapterIndexForRealm = (realm) => Math.max(1, Math.min(6, Math.floor((Math.max(1, clampInt(realm, 1, 18)) - 1) / 3) + 1));

    Game.prototype.ensureCollectionHubBootState = function () {
        if (!this.collectionHubState || typeof this.collectionHubState !== 'object') {
            this.collectionHubState = this.normalizeCollectionHubState();
        } else {
            this.collectionHubState = this.normalizeCollectionHubState(this.collectionHubState);
        }
        if (!Array.isArray(this.collectionUnlockHistory)) {
            this.collectionUnlockHistory = this.loadCollectionUnlockHistory();
        }
        if (!this.bossMemoryRecords || typeof this.bossMemoryRecords !== 'object') {
            this.bossMemoryRecords = this.loadBossMemoryRecords();
        }
        if (!this.bossMemorySession || typeof this.bossMemorySession !== 'object') {
            this.bossMemorySession = null;
        }
        if (typeof this.selectedSpiritCodexId !== 'string') this.selectedSpiritCodexId = '';
        if (typeof this.selectedChapterCodexId !== 'string') this.selectedChapterCodexId = '';
        if (typeof this.selectedEnemyCodexId !== 'string') this.selectedEnemyCodexId = '';
        if (typeof this.selectedBossArchiveId !== 'string') this.selectedBossArchiveId = '';
    };

    Game.prototype.escapeCollectionHtml = function (value) {
        return escapeHtml(value);
    };

    Game.prototype.normalizeCollectionHubState = function (rawState = null) {
        const source = rawState && typeof rawState === 'object' ? rawState : {};
        const allowedSections = Object.keys(SECTION_META);
        return {
            section: allowedSections.includes(source.section) ? source.section : 'laws',
            spiritQuery: sanitizeQuery(source.spiritQuery, 60),
            spiritFocus: ['all', 'current', 'aligned', 'hidden'].includes(source.spiritFocus) ? source.spiritFocus : 'all',
            chapterQuery: sanitizeQuery(source.chapterQuery, 60),
            chapterFocus: ['all', 'active', 'cleared', 'upcoming'].includes(source.chapterFocus) ? source.chapterFocus : 'all',
            enemyQuery: sanitizeQuery(source.enemyQuery, 60),
            enemyFocus: ['all', 'scouted', 'upcoming', 'control'].includes(source.enemyFocus) ? source.enemyFocus : 'all',
            bossQuery: sanitizeQuery(source.bossQuery, 60),
            bossFocus: ['all', 'defeated', 'pending', 'highpressure'].includes(source.bossFocus) ? source.bossFocus : 'all'
        };
    };

    Game.prototype.getCollectionHubState = function () {
        this.ensureCollectionHubBootState();
        return this.collectionHubState;
    };

    Game.prototype.getCollectionSectionMeta = function (section = 'laws') {
        return SECTION_META[section] || SECTION_META.laws;
    };

    Game.prototype.loadCollectionUnlockHistory = function () {
        try {
            const raw = typeof localStorage !== 'undefined'
                ? localStorage.getItem(COLLECTION_HISTORY_KEY)
                : null;
            const parsed = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter((entry) => entry && typeof entry === 'object' && entry.type && entry.itemId)
                .map((entry) => ({
                    type: String(entry.type || ''),
                    itemId: String(entry.itemId || ''),
                    name: String(entry.name || ''),
                    icon: String(entry.icon || '✦'),
                    note: String(entry.note || ''),
                    timestamp: clampInt(entry.timestamp || Date.now(), 0)
                }))
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 24);
        } catch (error) {
            return [];
        }
    };

    Game.prototype.persistCollectionUnlockHistory = function () {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(COLLECTION_HISTORY_KEY, JSON.stringify(this.collectionUnlockHistory || []));
        } catch (error) {
            console.warn('Persist collection unlock history failed:', error);
        }
    };

    Game.prototype.loadBossMemoryRecords = function () {
        try {
            const raw = typeof localStorage !== 'undefined'
                ? localStorage.getItem(BOSS_MEMORY_RECORDS_KEY)
                : null;
            const parsed = raw ? JSON.parse(raw) : {};
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
            return Object.keys(parsed).reduce((records, bossId) => {
                const record = parsed[bossId];
                if (!record || typeof record !== 'object') return records;
                records[bossId] = {
                    bossId,
                    attempts: clampInt(record.attempts || 0, 0, 9999),
                    clears: clampInt(record.clears || 0, 0, 9999),
                    bestTurn: clampInt(record.bestTurn || 0, 0, 9999),
                    lastResult: ['victory', 'defeat'].includes(record.lastResult) ? record.lastResult : '',
                    lastPlayedAt: clampInt(record.lastPlayedAt || 0, 0),
                    firstClearAt: clampInt(record.firstClearAt || 0, 0)
                };
                return records;
            }, {});
        } catch (error) {
            return {};
        }
    };

    Game.prototype.persistBossMemoryRecords = function () {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(BOSS_MEMORY_RECORDS_KEY, JSON.stringify(this.bossMemoryRecords || {}));
        } catch (error) {
            console.warn('Persist boss memory records failed:', error);
        }
    };

    Game.prototype.getBossMemoryRecord = function (bossId = '') {
        this.ensureCollectionHubBootState();
        const safeBossId = String(bossId || '').trim();
        const source = safeBossId && this.bossMemoryRecords && this.bossMemoryRecords[safeBossId]
            ? this.bossMemoryRecords[safeBossId]
            : null;
        return {
            bossId: safeBossId,
            attempts: clampInt(source?.attempts || 0, 0, 9999),
            clears: clampInt(source?.clears || 0, 0, 9999),
            bestTurn: clampInt(source?.bestTurn || 0, 0, 9999),
            lastResult: ['victory', 'defeat'].includes(source?.lastResult) ? source.lastResult : '',
            lastPlayedAt: clampInt(source?.lastPlayedAt || 0, 0),
            firstClearAt: clampInt(source?.firstClearAt || 0, 0)
        };
    };

    Game.prototype.recordBossMemoryResult = function (bossId = '', result = 'defeat', turns = 0) {
        const safeBossId = String(bossId || '').trim();
        if (!safeBossId) return this.getBossMemoryRecord('');
        const previous = this.getBossMemoryRecord(safeBossId);
        const isVictory = result === 'victory';
        const next = {
            bossId: safeBossId,
            attempts: previous.attempts + 1,
            clears: previous.clears + (isVictory ? 1 : 0),
            bestTurn: isVictory
                ? (previous.bestTurn > 0 ? Math.min(previous.bestTurn, Math.max(1, clampInt(turns || 0, 1, 9999))) : Math.max(1, clampInt(turns || 0, 1, 9999)))
                : previous.bestTurn,
            lastResult: isVictory ? 'victory' : 'defeat',
            lastPlayedAt: Date.now(),
            firstClearAt: previous.firstClearAt || (isVictory ? Date.now() : 0)
        };
        this.bossMemoryRecords = {
            ...(this.bossMemoryRecords || {}),
            [safeBossId]: next
        };
        this.persistBossMemoryRecords();
        return next;
    };

    Game.prototype.getBossMemoryClearCount = function () {
        this.ensureCollectionHubBootState();
        return Object.values(this.bossMemoryRecords || {}).filter((record) => clampInt(record?.clears || 0, 0) > 0).length;
    };

    Game.prototype.getBossMemoryAttemptCount = function () {
        this.ensureCollectionHubBootState();
        return Object.values(this.bossMemoryRecords || {}).reduce((sum, record) => sum + clampInt(record?.attempts || 0, 0), 0);
    };

    Game.prototype.recordCollectionUnlock = function (type = '', payload = {}) {
        this.ensureCollectionHubBootState();
        const itemId = String(payload.id || payload.itemId || '').trim();
        if (!type || !itemId) return false;
        const entry = {
            type: String(type),
            itemId,
            name: String(payload.name || itemId),
            icon: String(payload.icon || '✦'),
            note: String(payload.note || ''),
            timestamp: Date.now()
        };
        const next = Array.isArray(this.collectionUnlockHistory) ? [...this.collectionUnlockHistory] : [];
        const existingIndex = next.findIndex((item) => item.type === entry.type && item.itemId === entry.itemId);
        if (existingIndex >= 0) next.splice(existingIndex, 1);
        next.unshift(entry);
        this.collectionUnlockHistory = next.slice(0, 24);
        this.persistCollectionUnlockHistory();
        return true;
    };

    Game.prototype.getCollectionUnlockHistory = function (limit = 6) {
        this.ensureCollectionHubBootState();
        return (this.collectionUnlockHistory || []).slice(0, Math.max(0, clampInt(limit, 0, 24)));
    };

    Game.prototype.formatCollectionTimestamp = function (timestamp = 0) {
        const safeTs = clampInt(timestamp, 0);
        if (!safeTs) return '刚刚';
        try {
            return new Date(safeTs).toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return '最近';
        }
    };

    Game.prototype.buildRuntimeSaveSnapshot = function () {
        const pvpEconomySnapshot = (typeof PVPService !== 'undefined'
            && PVPService
            && typeof PVPService.getEconomySnapshot === 'function')
            ? PVPService.getEconomySnapshot()
            : null;
        return {
            version: '5.1.0',
            player: this.player && typeof this.player.getState === 'function'
                ? this.player.getState()
                : null,
            map: {
                nodes: Array.isArray(this.map?.nodes) ? this.map.nodes : [],
                currentNodeIndex: this.map?.currentNodeIndex || 0,
                completedNodes: Array.isArray(this.map?.completedNodes) ? this.map.completedNodes : []
            },
            unlockedRealms: Array.isArray(this.unlockedRealms) && this.unlockedRealms.length > 0
                ? this.unlockedRealms.slice()
                : [1],
            currentScreen: this.currentScreen || 'main-menu',
            saveSlot: this.currentSaveSlot,
            combatMeta: {
                stance: this.player?.stance || 'neutral',
                ruleVersion: 'combat-v2',
                battleUIUpdates: (this.performanceStats && this.performanceStats.battleUIUpdates) || 0
            },
            pvpMeta: {
                ruleVersion: 'pvp-v2',
                lastKnownDivision: (typeof PVPService !== 'undefined' && PVPService.currentRankData)
                    ? PVPService.currentRankData.division
                    : null,
                economy: pvpEconomySnapshot
            },
            legacyProgress: this.legacyProgress,
            featureFlags: { ...(this.featureFlags || {}) },
            endlessMeta: typeof this.ensureEndlessState === 'function'
                ? this.ensureEndlessState()
                : this.endlessState,
            encounterMeta: typeof this.ensureEncounterState === 'function'
                ? this.ensureEncounterState()
                : this.encounterState,
            schemaMigratedAt: Date.now(),
            timestamp: Date.now()
        };
    };

    Game.prototype.captureBossMemorySession = function (bossId = '') {
        this.ensureCollectionHubBootState();
        const safeBossId = String(bossId || '').trim();
        const snapshot = this.buildRuntimeSaveSnapshot();
        this.bossMemorySession = {
            bossId: safeBossId,
            runtimeSnapshot: JSON.stringify(snapshot),
            originalSaveData: typeof localStorage !== 'undefined' ? localStorage.getItem('theDefierSave') : null,
            returnSection: this.getCollectionHubState().section || 'bosses',
            selectedBossArchiveId: this.selectedBossArchiveId || safeBossId
        };
        return this.bossMemorySession;
    };

    Game.prototype.restoreBossMemorySession = function () {
        const session = this.bossMemorySession;
        if (!session) return false;
        let loaded = false;
        try {
            if (typeof localStorage !== 'undefined' && session.runtimeSnapshot) {
                localStorage.setItem('theDefierSave', session.runtimeSnapshot);
            }
            loaded = typeof this.loadGame === 'function' ? !!this.loadGame() : false;
        } finally {
            if (typeof localStorage !== 'undefined') {
                if (session.originalSaveData != null) {
                    localStorage.setItem('theDefierSave', session.originalSaveData);
                } else {
                    localStorage.removeItem('theDefierSave');
                }
            }
            this.bossMemorySession = null;
        }
        return loaded;
    };

    Game.prototype.startBossMemoryBattle = function (bossId = '') {
        this.ensureCollectionHubBootState();
        const safeBossId = String(bossId || '').trim();
        const catalogBoss = typeof ENEMIES !== 'undefined' && ENEMIES ? ENEMIES[safeBossId] : null;
        if (!catalogBoss || !catalogBoss.isBoss) {
            if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
                Utils.showBattleLog('伏魔台尚未找到这位主宰的完整记忆。');
            }
            return false;
        }

        const entry = typeof this.getBossArchiveEntries === 'function'
            ? this.getBossArchiveEntries().find((item) => item.id === safeBossId) || null
            : null;
        if (entry && entry.status !== 'defeated') {
            if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
                Utils.showBattleLog('需先在主线击破本体，伏魔台才会开启这场记忆战。');
            }
            return false;
        }

        this.captureBossMemorySession(safeBossId);

        const characterId = (typeof this.player?.characterId === 'string' && this.player.characterId)
            ? this.player.characterId
            : 'linFeng';
        if (
            this.player
            && typeof this.player.getRunDestinyMeta === 'function'
            && !this.player.getRunDestinyMeta()
            && typeof this.player.setRunDestiny === 'function'
        ) {
            const runDestinyId = this.selectedRunDestinyId || (typeof this.resolveDefaultRunDestinyId === 'function'
                ? this.resolveDefaultRunDestinyId(characterId)
                : null);
            if (runDestinyId) this.player.setRunDestiny(runDestinyId, 1);
        }
        if (
            this.player
            && typeof this.player.getSpiritCompanionMeta === 'function'
            && !this.player.getSpiritCompanionMeta()
            && typeof this.player.setSpiritCompanion === 'function'
        ) {
            const spiritCompanionId = this.selectedSpiritCompanionId || (typeof this.resolveDefaultSpiritCompanionId === 'function'
                ? this.resolveDefaultSpiritCompanionId(characterId)
                : null);
            if (spiritCompanionId) this.player.setSpiritCompanion(spiritCompanionId, 1);
        }

        this.player.realm = clampInt(catalogBoss.realm || this.player?.realm || 1, 1, 18);
        this.player.currentHp = Math.max(1, clampInt(this.player.maxHp || this.player.currentHp || 1, 1, Number.MAX_SAFE_INTEGER));
        this.player.block = 0;
        this.player.buffs = {};
        this.player.currentEnergy = Math.max(0, clampInt(this.player.baseEnergy || this.player.currentEnergy || 0, 0, 99));
        if (typeof this.player.resetSpiritCompanionBattleState === 'function') {
            this.player.resetSpiritCompanionBattleState();
        }
        if (typeof this.updateRealmBackground === 'function') {
            this.updateRealmBackground();
        }

        const bossInstance = typeof Utils !== 'undefined' && typeof Utils.deepClone === 'function'
            ? Utils.deepClone(catalogBoss)
            : JSON.parse(JSON.stringify(catalogBoss));
        bossInstance.isBoss = true;
        bossInstance.currentHp = clampInt(bossInstance.maxHp || bossInstance.hp || bossInstance.currentHp || 1, 1, Number.MAX_SAFE_INTEGER);
        bossInstance.maxHp = bossInstance.currentHp;
        bossInstance.name = `【记忆战】${bossInstance.name || safeBossId}`;

        const node = {
            id: `boss_memory:${safeBossId}`,
            type: 'boss_memory',
            bossId: safeBossId,
            row: -1,
            completed: false,
            accessible: true
        };
        this.currentBattleNode = node;
        if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
            Utils.showBattleLog(`【伏魔台】${entry?.name || catalogBoss.name || safeBossId} 的记忆残响已被唤醒。`);
        }
        this.startBattle([bossInstance], node);
        return true;
    };

    Game.prototype.finishBossMemoryBattle = function (result = 'defeat', payload = {}) {
        const activeNode = this.currentBattleNode || {};
        const session = this.bossMemorySession;
        const safeBossId = String(payload.bossId || payload.bossEnemy?.id || activeNode.bossId || session?.bossId || '').trim();
        const catalogBoss = typeof ENEMIES !== 'undefined' && ENEMIES ? ENEMIES[safeBossId] : null;
        const bossName = catalogBoss?.name || payload.bossEnemy?.name || safeBossId || '未知主宰';
        const normalizedTurns = clampInt(payload.turns || this.battle?.turnNumber || 0, 0, 9999);
        const isVictory = result === 'victory';
        const record = this.recordBossMemoryResult(safeBossId, isVictory ? 'victory' : 'defeat', normalizedTurns);
        const firstClear = isVictory && record.clears === 1;

        this.restoreBossMemorySession();
        this.mode = 'pve';
        this.currentBattleNode = null;
        if (typeof this.showCollection === 'function') {
            this.showCollection('bosses');
        }
        if (typeof this.selectBossArchiveEntry === 'function' && safeBossId) {
            this.selectBossArchiveEntry(safeBossId);
        }

        let legacyGain = 0;
        if (firstClear && typeof this.awardLegacyEssence === 'function') {
            legacyGain = this.awardLegacyEssence(4, '伏魔台记忆战', { silent: true });
        }
        if (isVictory && typeof this.recordCollectionUnlock === 'function') {
            this.recordCollectionUnlock('boss_memory', {
                id: safeBossId,
                name: bossName,
                icon: catalogBoss?.icon || '🗿',
                note: firstClear
                    ? `伏魔台首胜 · 最快 ${record.bestTurn || Math.max(1, normalizedTurns)} 回合`
                    : `伏魔台再破记忆 · 最快 ${record.bestTurn || Math.max(1, normalizedTurns)} 回合`
            });
        }

        const title = isVictory ? '伏魔台记忆战胜利' : '伏魔台记忆战留痕';
        const lines = isVictory
            ? [
                `${bossName} 的记忆残响已被镇压。`,
                `累计胜场 ${record.clears} · 最快 ${record.bestTurn || Math.max(1, normalizedTurns)} 回合`,
                firstClear && legacyGain > 0 ? `首胜奖励：传承精魄 +${legacyGain}` : '重复演武不会消耗主线进度，可继续刷新更快轮次。'
            ]
            : [
                `${bossName} 的记忆尚未平复。`,
                '本次演武已留档，失败不会污染主线存档。',
                `累计试作 ${record.attempts} 次${record.bestTurn > 0 ? ` · 当前最快 ${record.bestTurn} 回合` : ''}`
            ];
        if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
            Utils.showBattleLog(isVictory
                ? `【伏魔台】记忆战告捷：${bossName}`
                : `【伏魔台】记忆战留档：${bossName}`);
        }
        if (typeof this.showRewardModal === 'function') {
            this.showRewardModal(title, lines.filter(Boolean).join('\n'), isVictory ? '🗿' : '🕯️', () => {
                if (typeof this.showCollection === 'function') {
                    this.showCollection('bosses');
                }
                if (typeof this.selectBossArchiveEntry === 'function' && safeBossId) {
                    this.selectBossArchiveEntry(safeBossId);
                }
            });
        }
        return {
            bossId: safeBossId,
            result: isVictory ? 'victory' : 'defeat',
            record,
            firstClear,
            legacyGain
        };
    };

    Game.prototype.showCollection = function (section = 'laws') {
        this.ensureCollectionHubBootState();
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.collectionHubState,
            section: section || 'laws'
        });
        if (typeof originalShowCollection === 'function') {
            return originalShowCollection.call(this);
        }
        this.showScreen('collection');
        this.initCollection();
    };

    Game.prototype.switchCollectionSection = function (section = 'laws') {
        this.ensureCollectionHubBootState();
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.collectionHubState,
            section
        });
        if (this.currentScreen !== 'collection') {
            this.showCollection(section);
            return;
        }
        this.initCollection();
    };

    Game.prototype.setSpiritCodexSearchQuery = function (query = '') {
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            spiritQuery: query,
            section: 'spirits'
        });
        this.initCollection();
    };

    Game.prototype.setSpiritCodexFocusFilter = function (value = 'all') {
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            spiritFocus: value,
            section: 'spirits'
        });
        this.initCollection();
    };

    Game.prototype.setChapterCodexSearchQuery = function (query = '') {
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            chapterQuery: query,
            section: 'chapters'
        });
        this.initCollection();
    };

    Game.prototype.setChapterCodexFocusFilter = function (value = 'all') {
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            chapterFocus: value,
            section: 'chapters'
        });
        this.initCollection();
    };

    Game.prototype.setEnemyCodexSearchQuery = function (query = '') {
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            enemyQuery: query,
            section: 'enemies'
        });
        this.initCollection();
    };

    Game.prototype.setEnemyCodexFocusFilter = function (value = 'all') {
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            enemyFocus: value,
            section: 'enemies'
        });
        this.initCollection();
    };

    Game.prototype.setBossArchiveSearchQuery = function (query = '') {
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            bossQuery: query,
            section: 'bosses'
        });
        this.initCollection();
    };

    Game.prototype.setBossArchiveFocusFilter = function (value = 'all') {
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            bossFocus: value,
            section: 'bosses'
        });
        this.initCollection();
    };

    Game.prototype.getCollectionRealmProgress = function () {
        const currentRealm = Math.max(1, clampInt(this.player?.realm || 1, 1, 18));
        const maxClearedFromStats = Math.max(0, clampInt(this.achievementSystem?.stats?.realmCleared || 0, 0, 18));
        const maxReached = Math.max(1, clampInt(this.player?.maxRealmReached || currentRealm, 1, 18));
        const unlockedRealms = Array.isArray(this.unlockedRealms) && this.unlockedRealms.length > 0
            ? this.unlockedRealms.map((realm) => clampInt(realm, 1, 18))
            : [1];
        const unlockedPeak = Math.max(...unlockedRealms);
        const clearedRealm = Math.max(
            maxClearedFromStats,
            Math.max(0, unlockedPeak - 1),
            Math.max(0, maxReached - 1)
        );
        return {
            currentRealm,
            clearedRealm,
            currentChapterIndex: getChapterIndexForRealm(currentRealm)
        };
    };

    Game.prototype.getCollectionProgressSnapshot = function () {
        const spiritCatalog = (typeof SPIRIT_COMPANIONS !== 'undefined' && SPIRIT_COMPANIONS) ? Object.keys(SPIRIT_COMPANIONS) : [];
        const treasureCatalog = (typeof TREASURES !== 'undefined' && TREASURES) ? Object.keys(TREASURES) : [];
        const lawCatalog = (typeof LAWS !== 'undefined' && LAWS) ? Object.keys(LAWS) : [];
        const enemyCatalog = (typeof ENEMIES !== 'undefined' && ENEMIES)
            ? Object.values(ENEMIES).filter((enemy) => enemy && !enemy.isBoss && !enemy.isMinion)
            : [];
        const bossCatalog = (typeof ENEMIES !== 'undefined' && ENEMIES)
            ? Object.values(ENEMIES).filter((enemy) => enemy && enemy.isBoss)
            : [];
        const realmProgress = this.getCollectionRealmProgress();
        const seenSpiritIds = new Set(
            this.getCollectionUnlockHistory(24)
                .filter((entry) => entry.type === 'spirit')
                .map((entry) => entry.itemId)
        );
        const seenEnemyIds = new Set(
            this.getCollectionUnlockHistory(24)
                .filter((entry) => entry.type === 'enemy')
                .map((entry) => entry.itemId)
        );
        const currentSpirit = this.player && typeof this.player.getSpiritCompanionMeta === 'function'
            ? this.player.getSpiritCompanionMeta()
            : null;
        if (currentSpirit?.id) seenSpiritIds.add(currentSpirit.id);
        const bossMemoryClears = typeof this.getBossMemoryClearCount === 'function'
            ? this.getBossMemoryClearCount()
            : 0;
        const bossMemoryAttempts = typeof this.getBossMemoryAttemptCount === 'function'
            ? this.getBossMemoryAttemptCount()
            : 0;
        const forgeOverview = this.player && typeof this.player.getTreasureWorkshopResearchOverview === 'function'
            ? this.player.getTreasureWorkshopResearchOverview()
            : null;
        return {
            collectedLaws: Array.isArray(this.player?.collectedLaws) ? this.player.collectedLaws.length : 0,
            totalLaws: lawCatalog.length,
            collectedTreasures: Array.isArray(this.player?.collectedTreasures) ? this.player.collectedTreasures.length : 0,
            totalTreasures: treasureCatalog.length,
            seenSpirits: seenSpiritIds.size,
            totalSpirits: spiritCatalog.length,
            seenEnemies: enemyCatalog.filter((enemy) => seenEnemyIds.has(enemy.id) || realmProgress.currentRealm >= clampInt(enemy.realm || 1, 1, 18)).length,
            totalEnemies: enemyCatalog.length,
            defeatedBosses: bossCatalog.filter((boss) => realmProgress.clearedRealm >= clampInt(boss.realm || 1, 1, 18)).length,
            totalBosses: bossCatalog.length,
            clearedBossMemories: bossMemoryClears,
            totalBossMemoryAttempts: bossMemoryAttempts,
            clearedChapters: Math.max(0, Math.floor(realmProgress.clearedRealm / 3)),
            totalChapters: 6,
            currentChapterIndex: realmProgress.currentChapterIndex,
            forgeCoreOwned: forgeOverview?.coreOwned || 0,
            forgeCoreTotal: forgeOverview?.coreTotal || 0,
            forgeFormOwned: forgeOverview?.formOwned || 0,
            forgeFormTotal: forgeOverview?.formTotal || 0,
            forgeActiveWorkshops: forgeOverview?.activeWorkshops || 0,
            forgeReforges: forgeOverview?.activeReforges || 0,
            forgeInfusions: forgeOverview?.activeInfusions || 0,
            forgeSetEchoes: forgeOverview?.activeSetEchoes || 0,
            forgeResonantSets: forgeOverview?.resonantSets || 0,
            forgeFullSets: forgeOverview?.fullSets || 0,
            unclaimedAchievements: Array.isArray(this.achievementSystem?.unlockedAchievements)
                ? this.achievementSystem.unlockedAchievements.filter((id) => !this.achievementSystem.claimedAchievements.includes(id)).length
                : 0
        };
    };

    Game.prototype.getSpiritCodexEntries = function () {
        const catalog = (typeof SPIRIT_COMPANIONS !== 'undefined' && SPIRIT_COMPANIONS && typeof SPIRIT_COMPANIONS === 'object')
            ? SPIRIT_COMPANIONS
            : {};
        const selectedCharacterId = this.player?.characterId || this.selectedCharacterId || 'linFeng';
        const currentSpirit = this.player && typeof this.player.getSpiritCompanionMeta === 'function'
            ? this.player.getSpiritCompanionMeta()
            : null;
        const historySpiritIds = new Set(
            this.getCollectionUnlockHistory(24)
                .filter((entry) => entry.type === 'spirit')
                .map((entry) => entry.itemId)
        );
        const draftSpiritIds = Array.isArray(this.pendingSpiritCompanionDrafts?.[selectedCharacterId])
            ? this.pendingSpiritCompanionDrafts[selectedCharacterId]
            : [];
        const chapterCatalog = typeof this.getChapterProfileCatalog === 'function' ? this.getChapterProfileCatalog() : {};
        const selectedCharacter = getCharacterMeta(selectedCharacterId);

        return Object.keys(catalog).map((spiritId) => {
            const baseMeta = typeof this.getSpiritCompanionMetaById === 'function'
                ? this.getSpiritCompanionMetaById(spiritId, 1)
                : null;
            if (!baseMeta) return null;
            const storyProfile = typeof this.getSpiritStoryProfile === 'function'
                ? this.getSpiritStoryProfile(spiritId)
                : null;
            const nextTier = Math.min(baseMeta.maxTier || 1, clampInt(baseMeta.tier || 1, 1, 3) + 1);
            const nextMeta = typeof this.getSpiritCompanionMetaById === 'function'
                ? this.getSpiritCompanionMetaById(spiritId, nextTier)
                : null;
            const affinityNames = (baseMeta.affinities || []).map((characterId) => getCharacterMeta(characterId)?.name || characterId);
            const chapterFits = Object.values(chapterCatalog)
                .filter((chapter) => Array.isArray(chapter?.recommendedSpirits) && chapter.recommendedSpirits.includes(spiritId))
                .map((chapter) => chapter.name);
            const isCurrent = currentSpirit?.id === spiritId;
            const isAligned = Array.isArray(baseMeta.affinities) && baseMeta.affinities.includes(selectedCharacterId);
            const isSeen = isCurrent || historySpiritIds.has(spiritId) || draftSpiritIds.includes(spiritId);
            const isHidden = !isCurrent && !isSeen && !isAligned;

            let status = 'known';
            let statusLabel = '已录';
            if (isCurrent) {
                status = 'current';
                statusLabel = '当前同行';
            } else if (isAligned) {
                status = 'aligned';
                statusLabel = '角色共鸣';
            } else if (isHidden) {
                status = 'hidden';
                statusLabel = '未解锁线索';
            }

            const sourceText = isCurrent
                ? `当前已与【${baseMeta.name}】缔约，可在${storyProfile?.source || '灵契窟'}继续升至更高契阶。`
                : isAligned
                    ? `${selectedCharacter?.name || '当前角色'} 与它更易共鸣，可在开局灵契三选或${storyProfile?.source || '灵契窟'}追索。`
                    : isSeen
                        ? `你已见过它的回响，继续在${storyProfile?.source || '灵契窟或章节事件'}中深挖更容易稳定缔约。`
                        : '尚未留下完整纪录，推测需通过灵契窟、章节事件或研究项继续追索。';

            const unlockClue = isHidden
                ? `线索：更适合 ${affinityNames.join('、')} 出手追索。`
                : `线索：优先在灵契窟升契，或围绕 ${splitKeywords(baseMeta.playstyle, 2).join(' / ') || '核心节奏'} 构筑。`;

            return {
                id: spiritId,
                name: baseMeta.name,
                displayName: isHidden ? '未记名灵契' : baseMeta.name,
                icon: baseMeta.icon || '✦',
                displayIcon: isHidden ? '❔' : (baseMeta.icon || '✦'),
                title: baseMeta.title || '',
                description: baseMeta.description || '',
                playstyle: baseMeta.playstyle || '',
                story: isHidden ? '只捕捉到一缕模糊灵识，还需要更多线索才能还原其完整故事。' : (baseMeta.story || ''),
                summary: isHidden ? '尚未解明其完整护道方式。' : (baseMeta.summary || baseMeta.description || ''),
                passiveLabel: isHidden ? '未解析被动' : (baseMeta.passiveLabel || '灵契被动'),
                passiveDesc: isHidden ? '继续研究后可解开其被动结构。' : (baseMeta.passiveDesc || ''),
                activeLabel: isHidden ? '未解析主动' : (baseMeta.activeLabel || '灵契主动'),
                activeDesc: isHidden ? '继续研究后可解开其主动护道。' : (baseMeta.activeDesc || ''),
                chargeMax: clampInt(baseMeta.chargeMax || 0, 0),
                tierLabel: baseMeta.tierLabel || '初契',
                maxTier: clampInt(baseMeta.maxTier || 1, 1, 3),
                nextGrowthText: isCurrent && nextMeta && nextMeta.tier > baseMeta.tier
                    ? `下一阶：${nextMeta.summary || nextMeta.passiveDesc || '灵契护道进一步强化。'}`
                    : isCurrent
                        ? '当前已是最高契阶，可围绕它补足章节与法宝协同。'
                        : '尚未缔约，先解锁来源线索再决定是否围绕它构筑。',
                affinityNames,
                selectedCharacterName: selectedCharacter?.name || '当前角色',
                status,
                statusLabel,
                isCurrent,
                isAligned,
                isSeen,
                isHidden,
                chapterFits,
                sourceText,
                unlockClue,
                roleTags: splitKeywords(baseMeta.playstyle || baseMeta.summary || '', 3),
                storyProfile
            };
        }).filter(Boolean);
    };

    Game.prototype.passesSpiritCodexFilter = function (entry) {
        const state = this.getCollectionHubState();
        if (!entry) return false;
        if (state.spiritFocus === 'current' && !entry.isCurrent) return false;
        if (state.spiritFocus === 'aligned' && !(entry.isCurrent || entry.isAligned)) return false;
        if (state.spiritFocus === 'hidden' && !entry.isHidden) return false;
        if (!state.spiritQuery) return true;
        const haystack = [
            entry.id,
            entry.name,
            entry.title,
            entry.description,
            entry.playstyle,
            entry.story,
            entry.sourceText,
            entry.unlockClue,
            entry.storyProfile?.acquisitionTitle,
            entry.storyProfile?.acquisitionSummary,
            entry.storyProfile?.witnessTitle,
            entry.storyProfile?.witnessSummary,
            ...(entry.affinityNames || []),
            ...(entry.chapterFits || [])
        ].join(' ').toLowerCase();
        return haystack.includes(state.spiritQuery.toLowerCase());
    };

    Game.prototype.selectSpiritCodexEntry = function (spiritId = '') {
        this.selectedSpiritCodexId = String(spiritId || '');
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            section: 'spirits'
        });
        this.initCollection();
    };

    Game.prototype.getChapterCodexEntries = function () {
        const entries = [];
        const realmProgress = this.getCollectionRealmProgress();
        const currentChapterIndex = realmProgress.currentChapterIndex;
        const chapterCatalog = typeof this.getChapterProfileCatalog === 'function' ? this.getChapterProfileCatalog() : {};
        const enemyCatalog = (typeof ENEMIES !== 'undefined' && ENEMIES) ? Object.values(ENEMIES) : [];

        for (let chapterIndex = 1; chapterIndex <= 6; chapterIndex += 1) {
            const baseProfile = chapterCatalog[chapterIndex];
            if (!baseProfile) continue;
            const chapterRealm = (chapterIndex - 1) * 3 + 1;
            const profile = typeof this.getChapterProfileForRealm === 'function'
                ? this.getChapterProfileForRealm(chapterRealm)
                : null;
            if (!profile) continue;
            const narrativeProfile = typeof this.getChapterNarrativeProfile === 'function'
                ? this.getChapterNarrativeProfile(chapterIndex)
                : null;
            const realms = [chapterRealm, chapterRealm + 1, chapterRealm + 2];
            const enemies = enemyCatalog.filter((enemy) => enemy && !enemy.isBoss && realms.includes(clampInt(enemy.realm || 1, 1, 18)));
            const bosses = enemyCatalog.filter((enemy) => enemy && enemy.isBoss && realms.includes(clampInt(enemy.realm || 1, 1, 18)));
            const ecologyTags = new Set();
            const ecologyTemplates = (typeof ENEMY_ECOLOGY_TEMPLATES !== 'undefined' && ENEMY_ECOLOGY_TEMPLATES && ENEMY_ECOLOGY_TEMPLATES[chapterIndex])
                ? ENEMY_ECOLOGY_TEMPLATES[chapterIndex]
                : null;
            const eliteCombo = (typeof CHAPTER_ELITE_COMBOS !== 'undefined' && CHAPTER_ELITE_COMBOS && CHAPTER_ELITE_COMBOS[chapterIndex])
                ? CHAPTER_ELITE_COMBOS[chapterIndex]
                : null;
            enemies.forEach((enemy) => {
                (enemy.patterns || []).forEach((pattern) => {
                    if (!pattern) return;
                    if (pattern.type === 'attack' || pattern.type === 'multiAttack') ecologyTags.add('输出压力');
                    if (pattern.type === 'debuff') ecologyTags.add('控制压力');
                    if (pattern.type === 'addStatus' || pattern.type === 'multiAction') ecologyTags.add('资源压力');
                    if (pattern.type === 'defend' || pattern.type === 'buff') ecologyTags.add('续航压力');
                });
                if (enemy.stealLaw || enemy.element || enemy.resistances) ecologyTags.add('构筑针对');
                if (enemy.ecologyLabel) ecologyTags.add(enemy.ecologyLabel);
            });
            if (ecologyTemplates?.formation?.name) ecologyTags.add(ecologyTemplates.formation.name);
            if (eliteCombo?.name) ecologyTags.add(eliteCombo.name);

            let status = 'upcoming';
            let statusLabel = '未来章节';
            const chapterEndRealm = chapterRealm + 2;
            if (realmProgress.clearedRealm >= chapterEndRealm) {
                status = 'cleared';
                statusLabel = '已贯通';
            } else if (chapterIndex === currentChapterIndex) {
                status = 'active';
                statusLabel = '当前章节';
            }

            entries.push({
                id: profile.id,
                chapterIndex,
                name: profile.name,
                fullName: profile.fullName || profile.name,
                icon: profile.icon || '☯️',
                stageLabel: profile.stageLabel || '前段·示章',
                stageDesc: profile.stageDesc || '',
                mechanic: profile.mechanic || '',
                mood: profile.mood || '',
                skyOmen: profile.skyOmen || null,
                leyline: profile.leyline || null,
                focusTags: Array.isArray(profile.focusTags) ? profile.focusTags.slice() : [],
                routePrompt: profile.routePrompt || '',
                bossPrompt: profile.bossPrompt || '',
                recommendedDestinies: Array.isArray(profile.recommendedDestinies) ? profile.recommendedDestinies.slice() : [],
                recommendedSpirits: Array.isArray(profile.recommendedSpirits) ? profile.recommendedSpirits.slice() : [],
                recommendedVows: Array.isArray(profile.recommendedVows) ? profile.recommendedVows.slice() : [],
                realms,
                realmLabel: `第 ${realms[0]}-${realms[2]} 重`,
                status,
                statusLabel,
                enemies,
                bosses,
                ecologyTags: Array.from(ecologyTags).slice(0, 4),
                ecologyTemplates,
                eliteCombo,
                narrativeProfile,
                isCurrent: status === 'active',
                isCleared: status === 'cleared'
            });
        }

        return entries;
    };

    Game.prototype.passesChapterCodexFilter = function (entry) {
        const state = this.getCollectionHubState();
        if (!entry) return false;
        if (state.chapterFocus === 'active' && !entry.isCurrent) return false;
        if (state.chapterFocus === 'cleared' && !entry.isCleared) return false;
        if (state.chapterFocus === 'upcoming' && (entry.isCurrent || entry.isCleared)) return false;
        if (!state.chapterQuery) return true;
        const haystack = [
            entry.id,
            entry.name,
            entry.fullName,
            entry.mechanic,
            entry.mood,
            entry.skyOmen?.name,
            entry.skyOmen?.desc,
            entry.leyline?.name,
            entry.leyline?.desc,
            entry.routePrompt,
            entry.bossPrompt,
            entry.ecologyTemplates?.formation?.name,
            entry.ecologyTemplates?.formation?.desc,
            entry.eliteCombo?.name,
            entry.eliteCombo?.summary,
            entry.narrativeProfile?.summary,
            entry.narrativeProfile?.finaleRecall?.summary,
            ...(entry.narrativeProfile?.beats || []).map((beat) => `${beat?.stage || ''} ${beat?.title || ''} ${beat?.summary || ''}`),
            ...(entry.focusTags || []),
            ...(entry.ecologyTags || []),
            ...entry.enemies.map((enemy) => enemy?.name || ''),
            ...entry.bosses.map((boss) => boss?.name || '')
        ].join(' ').toLowerCase();
        return haystack.includes(state.chapterQuery.toLowerCase());
    };

    Game.prototype.selectChapterCodexEntry = function (chapterId = '') {
        this.selectedChapterCodexId = String(chapterId || '');
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            section: 'chapters'
        });
        this.initCollection();
    };

    Game.prototype.getEnemyAiProfileLabel = function (profile = 'aggressive') {
        switch (profile) {
            case 'control': return '控场型';
            case 'sustain': return '续航型';
            case 'boss_adaptive': return '主宰型';
            case 'aggressive': return '前压型';
            default: return '均衡型';
        }
    };

    Game.prototype.getEnemyThreatTags = function (enemy = null) {
        const tags = new Set();
        const patterns = Array.isArray(enemy?.patterns) ? enemy.patterns : [];
        patterns.forEach((pattern) => {
            if (!pattern) return;
            if (pattern.type === 'attack') tags.add('正面压血');
            if (pattern.type === 'multiAttack') tags.add('连段围猎');
            if (pattern.type === 'debuff') tags.add('状态压制');
            if (pattern.type === 'addStatus') tags.add('污染负担');
            if (pattern.type === 'defend' || pattern.type === 'heal') tags.add('拖回合');
            if (pattern.type === 'buff') tags.add('自我强化');
            if (pattern.type === 'multiAction') tags.add('复合招式');
        });
        if (enemy?.resistances && Object.keys(enemy.resistances).length > 0) tags.add('元素抗性');
        if (enemy?.stealLaw) tags.add('法则掉落');
        if (enemy?.aiProfile === 'control') tags.add('节奏压制');
        if (enemy?.aiProfile === 'sustain') tags.add('阵地拉锯');
        if (enemy?.ecologyLabel) tags.add(`生态·${enemy.ecologyLabel}`);
        return Array.from(tags).slice(0, 5);
    };

    Game.prototype.getEnemyCounterHints = function (enemy = null) {
        const hints = [];
        const patterns = Array.isArray(enemy?.patterns) ? enemy.patterns : [];
        if (patterns.some((pattern) => pattern?.type === 'debuff')) {
            hints.push('优先准备净化、护盾或提前斩杀，别让减益把整回合价值压低。');
        }
        if (patterns.some((pattern) => pattern?.type === 'defend' || pattern?.type === 'heal')) {
            hints.push('破盾、易伤和持续压血更适合拆它的续航节奏。');
        }
        if (patterns.some((pattern) => pattern?.type === 'multiAttack')) {
            hints.push('连段回合前要先立盾或保留减伤，不要把防御留到最后一拍。');
        }
        if (patterns.some((pattern) => pattern?.type === 'addStatus')) {
            hints.push('一旦开始塞入污染牌，后续回合质量会快速下降，最好提前压死或留净化。');
        }
        if (patterns.some((pattern) => pattern?.type === 'multiAction')) {
            hints.push('复合招式通常兼顾压血和控场，看到前摇就要提前分配护盾与输出。');
        }
        if (enemy?.resistances && Object.values(enemy.resistances).some((value) => Number(value) > 0)) {
            hints.push('尽量绕开它的高抗元素，改用中性伤害或不同属性切入。');
        }
        if (hints.length === 0) {
            hints.push('先结合章节地脉判断它是在考输出节奏还是资源容错，再决定换血还是稳手。');
        }
        return hints.slice(0, 3);
    };

    Game.prototype.getEnemyCodexEntries = function () {
        const enemyCatalog = (typeof ENEMIES !== 'undefined' && ENEMIES)
            ? Object.values(ENEMIES).filter((enemy) => enemy && !enemy.isBoss && !enemy.isMinion)
            : [];
        const realmProgress = this.getCollectionRealmProgress();
        const unlockedPeak = Array.isArray(this.unlockedRealms) && this.unlockedRealms.length > 0
            ? Math.max(...this.unlockedRealms.map((realm) => clampInt(realm, 1, 18)))
            : 1;
        const maxReachedRealm = Math.max(
            realmProgress.currentRealm,
            clampInt(this.player?.maxRealmReached || 1, 1, 18),
            unlockedPeak
        );
        const seenEnemyIds = new Set(
            this.getCollectionUnlockHistory(24)
                .filter((entry) => entry.type === 'enemy')
                .map((entry) => entry.itemId)
        );

        return enemyCatalog
            .map((enemy) => {
                const realm = clampInt(enemy.realm || 1, 1, 18);
                const chapter = typeof this.getChapterProfileForRealm === 'function'
                    ? this.getChapterProfileForRealm(realm)
                    : null;
                const isScouted = seenEnemyIds.has(enemy.id) || maxReachedRealm >= realm;
                const isCurrent = realmProgress.currentRealm === realm;
                const isUpcoming = !isScouted;
                const status = isUpcoming ? 'upcoming' : (realmProgress.clearedRealm >= realm ? 'logged' : 'scouted');
                const statusLabel = status === 'logged'
                    ? '已归档'
                    : status === 'scouted'
                        ? '已遭遇'
                        : '未来敌影';
                const elementLabel = enemy.element && typeof this.getLawElementLabel === 'function'
                    ? this.getLawElementLabel(enemy.element)
                    : (enemy.element || '');
                const stealLaw = enemy.stealLaw && typeof LAWS !== 'undefined' && LAWS
                    ? LAWS[enemy.stealLaw] || null
                    : null;
                const resistTags = enemy.resistances
                    ? Object.entries(enemy.resistances)
                        .filter(([, value]) => Number(value))
                        .map(([element, value]) => {
                            const label = typeof this.getLawElementLabel === 'function'
                                ? this.getLawElementLabel(element)
                                : element;
                            return `${Number(value) > 0 ? '抗' : '弱'}${label}${Math.round(Math.abs(Number(value)) * 100)}%`;
                        })
                    : [];
                return {
                    id: enemy.id,
                    name: enemy.name || enemy.id,
                    icon: enemy.icon || '👁️',
                    realm,
                    realmLabel: `第 ${realm} 重 · ${chapter?.name || `第${getChapterIndexForRealm(realm)}章`}`,
                    chapterName: chapter?.name || `第${getChapterIndexForRealm(realm)}章`,
                    chapterFullName: chapter?.fullName || chapter?.name || `第${getChapterIndexForRealm(realm)}章`,
                    status,
                    statusLabel,
                    isScouted,
                    isUpcoming,
                    isCurrent,
                    aiProfile: enemy.aiProfile || 'aggressive',
                    roleLabel: this.getEnemyAiProfileLabel(enemy.aiProfile || 'aggressive'),
                    threatTags: this.getEnemyThreatTags(enemy),
                    counterHints: this.getEnemyCounterHints(enemy),
                    patternPreview: (enemy.patterns || []).slice(0, 4).map((pattern) => this.formatEnemyPatternSummary(pattern)),
                    firstMoveText: this.formatEnemyPatternSummary((enemy.patterns || [])[0]),
                    stealLawName: stealLaw?.name || '',
                    elementLabel,
                    resistTags,
                    ecologyLabel: enemy.ecologyLabel || '',
                    ecologyGroup: enemy.ecologyGroup || '',
                    elitePartnerIds: Array.isArray(enemy.elitePartnerIds) ? enemy.elitePartnerIds.slice(0, 3) : [],
                    ecologyTags: Array.isArray(chapter?.focusTags) ? chapter.focusTags.slice(0, 3) : [],
                    goldText: enemy.gold ? `${clampInt(enemy.gold.min || 0, 0)}-${clampInt(enemy.gold.max || 0, 0)} 灵石` : '掉落未记录'
                };
            })
            .sort((a, b) => a.realm - b.realm || a.name.localeCompare(b.name, 'zh-Hans-CN'));
    };

    Game.prototype.passesEnemyCodexFilter = function (entry) {
        const state = this.getCollectionHubState();
        if (!entry) return false;
        if (state.enemyFocus === 'scouted' && !entry.isScouted) return false;
        if (state.enemyFocus === 'upcoming' && !entry.isUpcoming) return false;
        if (state.enemyFocus === 'control' && entry.aiProfile !== 'control') return false;
        if (!state.enemyQuery) return true;
        const haystack = [
            entry.id,
            entry.name,
            entry.realmLabel,
            entry.chapterName,
            entry.chapterFullName,
            entry.roleLabel,
            entry.firstMoveText,
            entry.stealLawName,
            entry.elementLabel,
            ...(entry.threatTags || []),
            ...(entry.counterHints || []),
            ...(entry.patternPreview || []),
            ...(entry.resistTags || []),
            ...(entry.ecologyTags || []),
            entry.ecologyLabel,
            ...(entry.elitePartnerIds || [])
        ].join(' ').toLowerCase();
        return haystack.includes(state.enemyQuery.toLowerCase());
    };

    Game.prototype.selectEnemyCodexEntry = function (enemyId = '') {
        this.selectedEnemyCodexId = String(enemyId || '');
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            section: 'enemies'
        });
        this.initCollection();
    };

    Game.prototype.resolveBossPressureLabel = function (pressure = 1) {
        const score = Number(pressure) || 1;
        if (score >= 1.55) return '极高压';
        if (score >= 1.35) return '高压';
        if (score >= 1.15) return '偏硬仗';
        return '常规检定';
    };

    Game.prototype.formatEnemyPatternSummary = function (pattern = {}) {
        if (!pattern || typeof pattern !== 'object') return '未知招式';
        switch (pattern.type) {
            case 'attack': return `攻击 ${clampInt(pattern.value || 0, 0)}`;
            case 'multiAttack': return `${clampInt(pattern.count || 1, 1)} 连击 × ${clampInt(pattern.value || 0, 0)}`;
            case 'defend': return `获得 ${clampInt(pattern.value || 0, 0)} 护盾`;
            case 'buff': return `强化 ${pattern.buffType || '状态'} +${clampInt(pattern.value || 0, 0)}`;
            case 'debuff': return `施加 ${pattern.buffType || '负面'} ${clampInt(pattern.value || 0, 0)} 层`;
            default: return pattern.intent || pattern.type || '特殊招式';
        }
    };

    Game.prototype.getBossBreakHint = function (boss = null, mechanic = null) {
        if (boss?.bossSetpiece?.counterWindow) {
            return boss.bossSetpiece.counterWindow;
        }
        const mechanicType = mechanic?.mechanics?.type || '';
        switch (mechanicType) {
            case 'summon': return '优先准备清场或点杀手段，避免召唤物拖长节奏。';
            case 'rage': return '需要尽早压血线，别让力量层数在中后段失控。';
            case 'burn_aura': return '净化、护盾与冰系反制更关键，拖回合会被灼烧蚕食。';
            case 'slow': return '尽量在偶数回合前交完关键牌，别让麻痹断掉核心节奏。';
            case 'gravity': return '提前压低平均费用或保留回能牌，避免高费整回合卡死。';
            case 'reflect': return '分段压血并留足护盾，避免一次性高伤被镜返。';
            case 'chaos': return '依赖低费与通用牌更稳，高费爆发牌要留作收尾。';
            case 'devour': return '更适合快速收束，越拖越容易被放逐与禁疗掐死。';
            default:
                if (boss?.realm >= 13) return '建议提前准备法宝反制与多轴构筑，不要只押单一爆发。';
                return '先确认其章节规则，再决定是抢节奏还是稳血线。';
        }
    };

    Game.prototype.getBossArchiveEntries = function () {
        const enemyCatalog = (typeof ENEMIES !== 'undefined' && ENEMIES) ? Object.values(ENEMIES) : [];
        const bossCatalog = enemyCatalog.filter((enemy) => enemy && enemy.isBoss);
        const realmProgress = this.getCollectionRealmProgress();

        return bossCatalog.map((boss) => {
            const mechanic = (typeof BOSS_MECHANICS !== 'undefined' && BOSS_MECHANICS)
                ? BOSS_MECHANICS[boss.id] || null
                : null;
            const chapter = typeof this.getChapterProfileForRealm === 'function'
                ? this.getChapterProfileForRealm(boss.realm || 1)
                : null;
            const counterTreasures = Array.isArray(mechanic?.countersBy)
                ? mechanic.countersBy.map((treasureId) => {
                    const treasure = typeof TREASURES !== 'undefined' && TREASURES ? TREASURES[treasureId] : null;
                    return treasure
                        ? {
                            id: treasureId,
                            name: treasure.name || treasureId,
                            icon: treasure.icon || '🏺'
                        }
                        : {
                            id: treasureId,
                            name: treasureId,
                            icon: '🏺'
                        };
                })
                : [];
            const pressureScore = Number(mechanic?.difficulty?.withoutCounter) || 1;
            const isDefeated = realmProgress.clearedRealm >= clampInt(boss.realm || 1, 1, 18);
            const memoryRecord = typeof this.getBossMemoryRecord === 'function'
                ? this.getBossMemoryRecord(boss.id)
                : { attempts: 0, clears: 0, bestTurn: 0, lastResult: '', lastPlayedAt: 0, firstClearAt: 0 };
            const memoryReady = isDefeated;
            const memoryStatus = !memoryReady
                ? 'hidden'
                : memoryRecord.clears > 0
                    ? 'logged'
                    : memoryRecord.attempts > 0
                        ? 'ready'
                        : 'pending';
            const memoryStatusLabel = !memoryReady
                ? '需先击破'
                : memoryRecord.clears > 0
                    ? '已留痕'
                    : memoryRecord.attempts > 0
                        ? '试作中'
                        : '未演武';
            const memorySummary = !memoryReady
                ? '需先在主线击破本体，伏魔台才会开放这场记忆战。'
                : memoryRecord.clears > 0
                    ? `已完成 ${memoryRecord.clears} 次记忆战，当前最快 ${Math.max(1, memoryRecord.bestTurn || 0)} 回合。`
                    : memoryRecord.attempts > 0
                        ? `已试作 ${memoryRecord.attempts} 次，仍在摸索稳定破局窗口。`
                        : '尚未发起记忆战，可用当前构筑直接检验破局窗口。';
            const actPreview = Array.isArray(boss.phaseConfig)
                ? boss.phaseConfig
                    .map((phase, index) => {
                        const label = phase?.name || `转幕 ${index + 2}`;
                        const threshold = Math.round(Math.max(0, Math.min(1, Number(phase?.threshold) || 0)) * 100);
                        return `${label} · ${threshold}%`;
                    })
                    .filter(Boolean)
                    .slice(0, 2)
                : [];
            return {
                id: boss.id,
                name: boss.name || boss.id,
                icon: boss.icon || '👁️',
                realm: clampInt(boss.realm || 1, 1, 18),
                chapterName: chapter?.name || `第${getChapterIndexForRealm(boss.realm || 1)}章`,
                chapterFullName: chapter?.fullName || chapter?.name || `第${getChapterIndexForRealm(boss.realm || 1)}章`,
                pressureScore,
                pressureLabel: this.resolveBossPressureLabel(pressureScore),
                status: isDefeated ? 'defeated' : 'pending',
                statusLabel: isDefeated ? '已击破' : '待挑战',
                mechanicText: mechanic?.mechanics?.description || '暂无额外机制记录。',
                counterTreasures,
                patternPreview: (boss.patterns || []).slice(0, 4).map((pattern) => this.formatEnemyPatternSummary(pattern)),
                breakHint: this.getBossBreakHint(boss, mechanic),
                openingStance: boss?.bossSetpiece?.openingStance || '',
                counterWindow: boss?.bossSetpiece?.counterWindow || '',
                finisher: boss?.bossSetpiece?.finisher || '',
                visualCue: boss?.bossSetpiece?.visualCue || '',
                actPreview,
                bossPrompt: chapter?.bossPrompt || '',
                withoutCounter: Number(mechanic?.difficulty?.withoutCounter) || 1,
                withCounter: Number(mechanic?.difficulty?.withCounter) || 1,
                memoryReady,
                memoryRecord,
                memoryStatus,
                memoryStatusLabel,
                memorySummary
            };
        });
    };

    Game.prototype.passesBossArchiveFilter = function (entry) {
        const state = this.getCollectionHubState();
        if (!entry) return false;
        if (state.bossFocus === 'defeated' && entry.status !== 'defeated') return false;
        if (state.bossFocus === 'pending' && entry.status !== 'pending') return false;
        if (state.bossFocus === 'highpressure' && entry.pressureScore < 1.45) return false;
        if (!state.bossQuery) return true;
        const haystack = [
            entry.id,
            entry.name,
            entry.chapterName,
            entry.chapterFullName,
            entry.mechanicText,
            entry.breakHint,
            entry.openingStance,
            entry.counterWindow,
            entry.finisher,
            entry.visualCue,
            entry.bossPrompt,
            entry.memoryStatusLabel,
            entry.memorySummary,
            ...entry.counterTreasures.map((item) => item.name),
            ...(entry.patternPreview || []),
            ...(entry.actPreview || [])
        ].join(' ').toLowerCase();
        return haystack.includes(state.bossQuery.toLowerCase());
    };

    Game.prototype.selectBossArchiveEntry = function (bossId = '') {
        this.selectedBossArchiveId = String(bossId || '');
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            section: 'bosses'
        });
        this.initCollection();
    };

    Game.prototype.getBuildSnapshotData = function () {
        const profile = typeof this.buildPlayerDeckProfile === 'function'
            ? this.buildPlayerDeckProfile()
            : {
                size: 0,
                counts: { attack: 0, defense: 0, law: 0, chance: 0, energy: 0, other: 0 },
                lawTypeCounts: {},
                dominantType: 'other',
                dominantLawType: '',
                avgCost: 0,
                ratio: () => 0
            };
        const destiny = this.player && typeof this.player.getRunDestinyMeta === 'function'
            ? this.player.getRunDestinyMeta()
            : null;
        const spirit = this.player && typeof this.player.getSpiritCompanionMeta === 'function'
            ? this.player.getSpiritCompanionMeta()
            : null;
        const vows = this.player && typeof this.player.getRunVowMetas === 'function'
            ? this.player.getRunVowMetas()
            : [];
        const loadedLawIds = this.player?.fateRing && typeof this.player.fateRing.getSocketedLaws === 'function'
            ? this.player.fateRing.getSocketedLaws()
            : [];
        const loadedLaws = loadedLawIds.map((lawId) => (typeof LAWS !== 'undefined' && LAWS ? LAWS[lawId] : null)).filter(Boolean);
        const equippedTreasures = Array.isArray(this.player?.equippedTreasures) ? this.player.equippedTreasures : [];
        const workshopSnapshot = this.player && typeof this.player.getTreasureWorkshopSnapshot === 'function'
            ? this.player.getTreasureWorkshopSnapshot('equipped')
            : [];
        const chapter = typeof this.getChapterDisplaySnapshot === 'function'
            ? this.getChapterDisplaySnapshot(this.player?.realm || 1)
            : null;
        const stats = this.achievementSystem?.stats || {};
        const encounter = typeof this.ensureEncounterState === 'function' ? this.ensureEncounterState() : {};
        const endless = typeof this.ensureEndlessState === 'function' ? this.ensureEndlessState() : {};

        const dominantTypeLabels = {
            attack: '攻势抢拍',
            defense: '护阵拖线',
            law: '法则编织',
            chance: '机缘爆发',
            energy: '回能调度',
            other: '混成试作'
        };
        const dominantLabel = dominantTypeLabels[profile.dominantType] || '混成试作';
        const dominantLawLabel = profile.dominantLawType ? `${this.getLawElementLabel(profile.dominantLawType)}链` : '未定法则链';

        const strengths = [];
        if (profile.ratio('attack') >= 0.32) strengths.push('攻击牌占比高，适合在章节前中段主动抢拍。');
        if (profile.ratio('defense') >= 0.24) strengths.push('防御密度稳定，更容易把危险回合拖成可控回合。');
        if (profile.ratio('law') >= 0.18 || loadedLaws.length >= 2) strengths.push('命环与法则联动已经成形，适合围绕共鸣继续补件。');
        if (spirit) strengths.push(`当前灵契【${spirit.name}】能把构筑重心推向「${splitKeywords(spirit.playstyle || spirit.summary || '', 2).join(' / ') || spirit.tierLabel}」。`);
        if (workshopSnapshot.some((item) => item?.setEcho || item?.spiritBond)) strengths.push('炼器坊改造已接入战斗，法宝正在从单卡转向体系增幅。');
        if (strengths.length === 0) strengths.push('当前仍处于早期试作阶段，优势更多来自角色基础盘而非完整体系。');

        const gaps = [];
        if (profile.avgCost >= 1.9 && profile.ratio('energy') < 0.1) gaps.push('平均费用偏高，但回能牌偏少，容易在高压章吃到断档。');
        if (profile.ratio('defense') < 0.16) gaps.push('护阵密度偏低，遇到连击或章节灼烧时容错有限。');
        if (loadedLaws.length <= 1) gaps.push('命环槽位利用率偏低，还没有形成足够稳定的法则协同。');
        if (!spirit) gaps.push('尚未挂接灵契，部分中后段章节会缺少关键的护道被动。');
        if (equippedTreasures.length <= 1) gaps.push('法宝位利用不足，缺少对 Boss 机制和章节规则的额外兜底。');
        if (gaps.length === 0) gaps.push('当前主要缺口不在面板，而在路线执行与资源调度的精度。');

        const nextTargets = [];
        if (chapter?.routePrompt) nextTargets.push(`章节路线：${chapter.routePrompt}`);
        if (chapter && !chapter.spiritRecommended && chapter.recommendedSpirits?.[0]) {
            nextTargets.push(`灵契补位：${chapter.recommendedSpirits[0].name} 更贴近当前章节要求。`);
        }
        if (chapter && !chapter.destinyRecommended && chapter.recommendedDestinies?.[0]) {
            nextTargets.push(`命格参考：${chapter.recommendedDestinies[0].name} 更适合这章的世界规则。`);
        }
        if (loadedLaws.length < 2 && Array.isArray(this.player?.collectedLaws) && this.player.collectedLaws.length > loadedLaws.length) {
            nextTargets.push('命环装配：已掌握法则多于当前装配数量，优先补命环而不是继续扩卡。');
        }
        if (equippedTreasures.length < 2) nextTargets.push('法宝补件：优先找能补生存或反制章节机制的法宝。');
        if (nextTargets.length === 0) nextTargets.push('当前体系已进入打磨期，重点转向章节路线和 Boss 出题适配。');

        return {
            archetypeLabel: `${dominantLabel} · ${dominantLawLabel}`,
            profile,
            destiny,
            spirit,
            vows,
            loadedLaws,
            equippedTreasures,
            workshopSnapshot,
            chapter,
            strengths,
            gaps,
            nextTargets,
            highlights: [
                { label: '最高连击', value: clampInt(stats.maxCombo || 0, 0), note: '来自全局成就统计' },
                { label: '单次最高伤害', value: clampInt(stats.singleDamage || 0, 0), note: '当前账号历史高光' },
                { label: '已击破 Boss', value: clampInt(stats.bossesDefeated || 0, 0), note: '当前账号累计' },
                { label: '遭遇连胜', value: clampInt(encounter.maxStreak || 0, 0), note: '遭遇主题最佳连胜段' },
                { label: '无尽已清轮次', value: clampInt(endless.clearedCycles || 0, 0), note: '无尽轮回进度' },
                { label: '最高通关重数', value: clampInt(stats.realmCleared || 0, 0), note: '章节推进里程碑' }
            ]
        };
    };

    Game.prototype.getSanctumOverviewData = function () {
        const progress = this.getCollectionProgressSnapshot();
        const buildSnapshot = this.getBuildSnapshotData();
        const currentSpirit = buildSnapshot.spirit;
        const forgeOverview = this.player && typeof this.player.getTreasureWorkshopResearchOverview === 'function'
            ? this.player.getTreasureWorkshopResearchOverview()
            : {
                coreOwned: 0,
                coreTotal: 0,
                formOwned: 0,
                formTotal: 0,
                activeWorkshops: 0,
                activeReforges: 0,
                activeInfusions: 0,
                activeSetEchoes: 0,
                resonantSets: 0,
                fullSets: 0,
                readyInfusions: []
            };
        const unclaimedAchievementIds = Array.isArray(this.achievementSystem?.unlockedAchievements)
            ? this.achievementSystem.unlockedAchievements.filter((id) => !this.achievementSystem.claimedAchievements.includes(id))
            : [];
        const achievements = unclaimedAchievementIds
            .slice(0, 3)
            .map((achievementId) => {
                const achievement = typeof ACHIEVEMENTS !== 'undefined' && ACHIEVEMENTS ? ACHIEVEMENTS[achievementId] : null;
                if (!achievement) return null;
                const rewardText = typeof getAchievementRewardText === 'function'
                    ? getAchievementRewardText({
                        ...achievement,
                        unlocked: true,
                        claimed: false
                    })
                    : '领取奖励';
                return {
                    id: achievementId,
                    title: achievement.name || achievementId,
                    note: rewardText,
                    action: 'claim',
                    icon: achievement.icon || '🏆'
                };
            })
            .filter(Boolean);

        const rooms = [
            {
                id: 'library',
                icon: '📚',
                name: '藏经阁',
                focus: '图鉴研究 / 构筑快照 / Boss 情报',
                note: '集中管理局外情报，帮助下一局更快确定构筑方向。',
                actionLabel: '打开构筑快照',
                actionType: 'collection',
                actionValue: 'builds'
            },
            {
                id: 'forge',
                icon: '⚒️',
                name: '炼器室',
                focus: '法宝研究 / 套装回响 / 器灵灌注',
                note: forgeOverview.activeWorkshops > 0
                    ? `已激活 ${forgeOverview.activeWorkshops} 条炼器铭刻，当前 ${forgeOverview.fullSets} 组套装已进入三段共鸣。`
                    : `当前已整理出 ${forgeOverview.coreOwned}/${forgeOverview.coreTotal} 件核心法宝与 ${forgeOverview.formOwned}/${forgeOverview.formTotal} 件形态件，可继续追套装与器灵目标。`,
                actionLabel: '进入炼器研究',
                actionType: 'treasure',
                actionValue: 'treasure'
            },
            {
                id: 'observatory',
                icon: '🔭',
                name: '观星台',
                focus: '章节预兆 / 遭遇档案 / 周挑战预留',
                note: '章节天象与地脉已经入档，下一步可叠加周挑战与 Seed 复盘。',
                actionLabel: '查看章节档案',
                actionType: 'collection',
                actionValue: 'chapters'
            },
            {
                id: 'demon_platform',
                icon: '🗿',
                name: '伏魔台',
                focus: '敌影档案 / Boss 记忆 / 破局手札',
                note: progress.clearedBossMemories > 0
                    ? `已留下 ${progress.clearedBossMemories} 份主宰记忆战记录，可继续压最快轮次。`
                    : '普通敌影与主宰机制都已开始归档，现已开放首版 Boss 记忆战。',
                actionLabel: '查看敌影档案',
                actionType: 'collection',
                actionValue: 'enemies'
            }
        ];

        const researches = [
            {
                id: 'forge_atlas',
                room: '炼器室',
                name: '炼器总谱',
                progress: progress.collectedTreasures >= 2 ? 1 : 0,
                goal: 1,
                reward: '法宝图鉴显示套装关系、来源、核心件与适配流派。',
                section: 'treasure',
                actionType: 'treasure',
                actionValue: 'treasure'
            },
            {
                id: 'set_resonance',
                room: '炼器室',
                name: '套装共鸣索引',
                progress: forgeOverview.resonantSets >= 1 ? 1 : 0,
                goal: 1,
                reward: '炼器室会总结当前 2 件 / 3 件套阈值与下一步补件方向。',
                section: 'treasure',
                actionType: 'treasure',
                actionValue: 'treasure'
            },
            {
                id: 'spirit_forge',
                room: '炼器室',
                name: '器灵灌注锚点',
                progress: forgeOverview.activeInfusions >= 1 ? 1 : Math.min(1, forgeOverview.coreOwned >= 2 ? 1 : 0),
                goal: 1,
                reward: '核心件会标注器灵灌注资格与当前回响，便于先做目标筛选再走路线。',
                section: 'treasure',
                actionType: 'treasure',
                actionValue: 'treasure'
            },
            {
                id: 'spirit_ledger',
                room: '藏经阁',
                name: '灵契谱录',
                progress: currentSpirit ? 1 : 0,
                goal: 1,
                reward: '开放灵契图鉴的来源线索、章节适配与成长摘要。',
                section: 'spirits'
            },
            {
                id: 'chapter_index',
                room: '观星台',
                name: '章节地脉索引',
                progress: progress.clearedChapters >= 1 ? 1 : 0,
                goal: 1,
                reward: '章节档案显示生态压力、路线建议与 Boss 传闻。',
                section: 'chapters'
            },
            {
                id: 'boss_manual',
                room: '伏魔台',
                name: '主宰破局手札',
                progress: progress.defeatedBosses >= 1 ? 1 : 0,
                goal: 1,
                reward: 'Boss 档案显示反制法宝、风险等级与破局窗口。',
                section: 'bosses'
            },
            {
                id: 'enemy_ledger',
                room: '伏魔台',
                name: '敌影压制索引',
                progress: progress.seenEnemies >= 4 ? 1 : 0,
                goal: 1,
                reward: '敌影档案显示战术画像、招式速记与章节归属。',
                section: 'enemies'
            },
            {
                id: 'memory_duel',
                room: '伏魔台',
                name: '主宰镜战留痕',
                progress: progress.clearedBossMemories >= 1 ? 1 : 0,
                goal: 1,
                reward: 'Boss 档案可直接发起记忆战，并沉淀最快轮次与首胜留痕。',
                section: 'bosses'
            },
            {
                id: 'build_mirror',
                room: '藏经阁',
                name: '构筑留影镜',
                progress: progress.collectedLaws >= 4 && progress.collectedTreasures >= 2 ? 1 : 0,
                goal: 1,
                reward: '构筑快照会汇总牌组画像、关键缺口与下一轮补位建议。',
                section: 'builds'
            }
        ].map((research) => ({
            ...research,
            ready: research.progress >= research.goal,
            progressText: `${research.progress}/${research.goal}`
        }));

        const fallbackGoals = researches
            .filter((research) => research.ready)
            .slice(0, 2)
            .map((research) => ({
                id: research.id,
                title: research.name,
                note: research.reward,
                action: research.actionType === 'treasure' ? 'treasure' : 'collection',
                value: research.section,
                actionValue: research.actionValue || research.section,
                icon: '📘'
            }));

        return {
            progress,
            rooms,
            researches,
            goals: achievements.length > 0 ? achievements : fallbackGoals,
            recentUnlocks: this.getCollectionUnlockHistory(6)
        };
    };

    Game.prototype.renderCollectionHubChrome = function () {
        if (typeof document === 'undefined') return;
        const state = this.getCollectionHubState();
        const meta = this.getCollectionSectionMeta(state.section);
        const titleEl = document.getElementById('collection-title');
        const subtitleEl = document.getElementById('collection-subtitle');
        if (titleEl) titleEl.textContent = meta.title;
        if (subtitleEl) subtitleEl.textContent = meta.subtitle;

        document.querySelectorAll('#collection [data-collection-tab]').forEach((button) => {
            button.classList.toggle('active', button.dataset.collectionTab === state.section);
        });
        document.querySelectorAll('#collection [data-collection-panel]').forEach((panel) => {
            panel.classList.toggle('active', panel.dataset.collectionPanel === state.section);
        });
    };

    Game.prototype.renderSpiritCodex = function () {
        if (typeof document === 'undefined') return;
        const grid = document.getElementById('spirit-codex-grid');
        const detail = document.getElementById('spirit-codex-detail');
        const summary = document.getElementById('spirit-codex-summary');
        const research = document.getElementById('spirit-codex-research');
        const searchInput = document.getElementById('spirit-codex-search');
        const focusSelect = document.getElementById('spirit-codex-focus-filter');
        if (!grid || !detail || !summary || !research) return;

        const state = this.getCollectionHubState();
        if (searchInput && searchInput.value !== state.spiritQuery) searchInput.value = state.spiritQuery;
        if (focusSelect && focusSelect.value !== state.spiritFocus) focusSelect.value = state.spiritFocus;

        const entries = this.getSpiritCodexEntries();
        const filtered = entries.filter((entry) => this.passesSpiritCodexFilter(entry));
        const selected = filtered.find((entry) => entry.id === this.selectedSpiritCodexId) || filtered[0] || null;
        this.selectedSpiritCodexId = selected?.id || '';

        grid.innerHTML = filtered.length > 0
            ? filtered.map((entry) => `
                <button type="button"
                    class="collection-card spirit-codex-card ${entry.id === this.selectedSpiritCodexId ? 'selected' : ''} ${entry.status}"
                    onclick="game.selectSpiritCodexEntry('${escapeHtml(entry.id)}')">
                    <div class="collection-card-top">
                        <span class="collection-card-icon">${escapeHtml(entry.displayIcon)}</span>
                        <span class="collection-status-chip ${entry.status}">${escapeHtml(entry.statusLabel)}</span>
                    </div>
                    <div class="collection-card-body">
                        <span class="collection-card-kicker">${escapeHtml(entry.tierLabel || '灵契')}</span>
                        <h4>${escapeHtml(entry.displayName)}</h4>
                        <p>${escapeHtml(entry.summary)}</p>
                    </div>
                    <div class="collection-card-tags">
                        ${(entry.roleTags || []).map((tag) => `<span class="collection-tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                </button>
            `).join('')
            : '<div class="codex-empty-state">当前检索条件下没有匹配的灵契记录，试试放宽检索或切换关注对象。</div>';

        if (!selected) {
            detail.innerHTML = '<div class="codex-empty-state">暂无灵契档案。</div>';
            return;
        }

        detail.innerHTML = `
            <div class="collection-detail-shell">
                <section class="collection-detail-hero">
                    <div class="collection-detail-hero-main">
                        <div class="collection-detail-icon">${escapeHtml(selected.displayIcon)}</div>
                        <div class="collection-detail-meta">
                            <span class="codex-side-kicker">灵契档案</span>
                            <h3>${escapeHtml(selected.displayName)}${selected.isHidden ? '' : ` · ${escapeHtml(selected.title || '')}`}</h3>
                            <p>${escapeHtml(selected.description || selected.summary || '')}</p>
                        </div>
                    </div>
                    <div class="detail-status-strip">
                        <span class="detail-status-chip ${selected.status}">${escapeHtml(selected.statusLabel)}</span>
                        <span class="detail-status-chip">${escapeHtml(selected.tierLabel || '初契')}</span>
                        <span class="detail-status-chip">蓄能 ${escapeHtml(selected.chargeMax || 0)}</span>
                    </div>
                </section>
                <div class="collection-detail-grid">
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">护道被动</span>
                        <strong>${escapeHtml(selected.passiveLabel)}</strong>
                        <p>${escapeHtml(selected.passiveDesc)}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">蓄能主动</span>
                        <strong>${escapeHtml(selected.activeLabel)}</strong>
                        <p>${escapeHtml(selected.activeDesc)}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">来源与线索</span>
                        <p>${escapeHtml(selected.sourceText)}</p>
                        <p class="collection-muted">${escapeHtml(selected.unlockClue)}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">下一步研究</span>
                        <p>${escapeHtml(selected.storyProfile?.growthGoal || selected.nextGrowthText)}</p>
                        <p class="collection-muted">推荐角色：${escapeHtml((selected.affinityNames || []).join('、') || '暂无')}</p>
                    </section>
                </div>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">${escapeHtml(selected.storyProfile?.acquisitionTitle || '灵识故事')}</span>
                    <p>${escapeHtml(selected.storyProfile?.acquisitionSummary || selected.story)}</p>
                    <p class="collection-muted">${escapeHtml(selected.storyProfile?.source || '线索来源未明')}</p>
                </section>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">${escapeHtml(selected.storyProfile?.witnessTitle || '同行见证')}</span>
                    <p>${escapeHtml(selected.storyProfile?.witnessSummary || selected.story)}</p>
                </section>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">适配章节</span>
                    <div class="collection-card-tags">
                        ${(selected.chapterFits || []).length > 0
                ? selected.chapterFits.map((name) => `<span class="collection-tag">${escapeHtml(name)}</span>`).join('')
                : '<span class="collection-tag muted">等待更多章节数据验证</span>'}
                    </div>
                </section>
            </div>
        `;

        const alignedCount = entries.filter((entry) => entry.isCurrent || entry.isAligned).length;
        const hiddenCount = entries.filter((entry) => entry.isHidden).length;
        summary.innerHTML = [
            '<span class="codex-side-kicker">灵契总览</span>',
            '<h3>灵契收录状态</h3>',
            '<div class="codex-summary-grid two-cols">',
            `<div class="codex-summary-chip"><strong>${entries.length}</strong><span>总条目</span></div>`,
            `<div class="codex-summary-chip"><strong>${alignedCount}</strong><span>当前角色更易共鸣</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.filter((entry) => entry.isCurrent).length}</strong><span>当前同行</span></div>`,
            `<div class="codex-summary-chip"><strong>${hiddenCount}</strong><span>未补全线索</span></div>`,
            '</div>',
            `<p class="codex-side-note">当前可见 ${filtered.length} 条灵契记录，优先补齐与当前角色共鸣的灵契会更容易形成章节闭环。</p>`
        ].join('');

        const currentSpirit = entries.find((entry) => entry.isCurrent) || null;
        research.innerHTML = [
            '<span class="codex-side-kicker">研究方向</span>',
            '<h3>灵契追索建议</h3>',
            '<ul class="codex-side-list compact">',
            `<li>${escapeHtml(currentSpirit ? `当前灵契【${currentSpirit.name}】已挂接，可优先围绕 ${currentSpirit.roleTags.join(' / ') || '护道节奏'} 补牌。` : '当前还没有挂接灵契，建议先从开局灵契草案或灵契窟补一个稳定护道。')}</li>`,
            `<li>${escapeHtml(selected.selectedCharacterName)} 更容易与 ${(selected.affinityNames || []).join('、') || '特定灵契'} 建立共鸣。</li>`,
            `<li>章节推荐灵契会同步出现在章节档案中，适合和天象 / 地脉一起看。</li>`,
            '</ul>'
        ].join('');
    };

    Game.prototype.renderChapterCodex = function () {
        if (typeof document === 'undefined') return;
        const grid = document.getElementById('chapter-codex-grid');
        const detail = document.getElementById('chapter-codex-detail');
        const summary = document.getElementById('chapter-codex-summary');
        const hints = document.getElementById('chapter-codex-hints');
        const searchInput = document.getElementById('chapter-codex-search');
        const focusSelect = document.getElementById('chapter-codex-focus-filter');
        if (!grid || !detail || !summary || !hints) return;

        const state = this.getCollectionHubState();
        if (searchInput && searchInput.value !== state.chapterQuery) searchInput.value = state.chapterQuery;
        if (focusSelect && focusSelect.value !== state.chapterFocus) focusSelect.value = state.chapterFocus;

        const entries = this.getChapterCodexEntries();
        const filtered = entries.filter((entry) => this.passesChapterCodexFilter(entry));
        const selected = filtered.find((entry) => entry.id === this.selectedChapterCodexId) || filtered[0] || null;
        this.selectedChapterCodexId = selected?.id || '';

        grid.innerHTML = filtered.length > 0
            ? filtered.map((entry) => `
                <button type="button"
                    class="collection-card chapter-codex-card ${entry.id === this.selectedChapterCodexId ? 'selected' : ''} ${entry.status}"
                    onclick="game.selectChapterCodexEntry('${escapeHtml(entry.id)}')">
                    <div class="collection-card-top">
                        <span class="collection-card-icon">${escapeHtml(entry.icon)}</span>
                        <span class="collection-status-chip ${entry.status}">${escapeHtml(entry.statusLabel)}</span>
                    </div>
                    <div class="collection-card-body">
                        <span class="collection-card-kicker">${escapeHtml(entry.realmLabel)}</span>
                        <h4>${escapeHtml(entry.fullName)}</h4>
                        <p>${escapeHtml(entry.skyOmen?.name || entry.mechanic || '章节规则未定')}</p>
                    </div>
                    <div class="collection-card-tags">
                        ${(entry.focusTags || []).slice(0, 3).map((tag) => `<span class="collection-tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                </button>
            `).join('')
            : '<div class="codex-empty-state">当前检索条件下没有匹配的章节档案。</div>';

        if (!selected) {
            detail.innerHTML = '<div class="codex-empty-state">暂无章节档案。</div>';
            return;
        }

        detail.innerHTML = `
            <div class="collection-detail-shell">
                <section class="collection-detail-hero">
                    <div class="collection-detail-hero-main">
                        <div class="collection-detail-icon">${escapeHtml(selected.icon)}</div>
                        <div class="collection-detail-meta">
                            <span class="codex-side-kicker">章节档案</span>
                            <h3>${escapeHtml(selected.fullName)}</h3>
                            <p>${escapeHtml(selected.mechanic)} · ${escapeHtml(selected.mood)}</p>
                        </div>
                    </div>
                    <div class="detail-status-strip">
                        <span class="detail-status-chip ${selected.status}">${escapeHtml(selected.statusLabel)}</span>
                        <span class="detail-status-chip">${escapeHtml(selected.realmLabel)}</span>
                        <span class="detail-status-chip">${escapeHtml(selected.stageLabel)}</span>
                    </div>
                </section>
                <div class="collection-detail-grid">
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">章节天象</span>
                        <strong>${escapeHtml(selected.skyOmen?.name || '未定')}</strong>
                        <p>${escapeHtml(selected.skyOmen?.desc || '')}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">地脉规则</span>
                        <strong>${escapeHtml(selected.leyline?.name || '未定')}</strong>
                        <p>${escapeHtml(selected.leyline?.desc || '')}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">路线提示</span>
                        <p>${escapeHtml(selected.routePrompt)}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">Boss 传闻</span>
                        <p>${escapeHtml(selected.bossPrompt)}</p>
                    </section>
                </div>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">生态模板</span>
                    <div class="collection-card-tags">
                        ${(selected.ecologyTags || []).map((tag) => `<span class="collection-tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                    <div class="collection-mini-grid">
                        <div class="collection-mini-card">
                            <strong>${selected.enemies.length}</strong>
                            <span>常驻敌人</span>
                            <p>${escapeHtml(selected.enemies.slice(0, 4).map((enemy) => enemy.name).join('、') || '暂无')}</p>
                        </div>
                        <div class="collection-mini-card">
                            <strong>${selected.bosses.length}</strong>
                            <span>章节主宰</span>
                            <p>${escapeHtml(selected.bosses.map((boss) => boss.name).join('、') || '暂无')}</p>
                        </div>
                    </div>
                </section>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">顺势建议</span>
                    <ul class="collection-detail-list">
                        <li>推荐命格：${escapeHtml(selected.recommendedDestinies.map((meta) => meta.name).join('、') || '暂无')}</li>
                        <li>推荐灵契：${escapeHtml(selected.recommendedSpirits.map((meta) => meta.name).join('、') || '暂无')}</li>
                        <li>推荐誓约：${escapeHtml(selected.recommendedVows.map((meta) => meta.name).join('、') || '暂无')}</li>
                    </ul>
                </section>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">连续叙事线</span>
                    <p>${escapeHtml(selected.narrativeProfile?.summary || '章节叙事线正在归档整理。')}</p>
                    <div class="collection-mini-grid">
                        ${Array.isArray(selected.narrativeProfile?.beats) && selected.narrativeProfile.beats.length > 0
                ? selected.narrativeProfile.beats.map((beat) => `
                            <div class="collection-mini-card">
                                <strong>${escapeHtml(beat.stage || '章节片段')}</strong>
                                <span>${escapeHtml(beat.title || '命线未定')}</span>
                                <p>${escapeHtml(beat.summary || '')}</p>
                            </div>
                        `).join('')
                : '<div class="collection-mini-card"><strong>归档中</strong><span>当前未展示额外叙事节点</span><p>本章资料正在整理为标准档案。</p></div>'}
                    </div>
                </section>
                ${selected.chapterIndex === 6 && selected.narrativeProfile?.finaleRecall?.summary
                ? `
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">${escapeHtml(selected.narrativeProfile.finaleRecall.title || '终章总回收')}</span>
                        <p>${escapeHtml(selected.narrativeProfile.finaleRecall.summary)}</p>
                        <div class="collection-card-tags">
                            ${(selected.narrativeProfile.finaleRecall.systems || []).map((item) => `<span class="collection-tag">${escapeHtml(item)}</span>`).join('')}
                        </div>
                    </section>
                `
                : ''}
            </div>
        `;

        summary.innerHTML = [
            '<span class="codex-side-kicker">章节总览</span>',
            '<h3>世界规则进度</h3>',
            '<div class="codex-summary-grid two-cols">',
            `<div class="codex-summary-chip"><strong>${entries.length}</strong><span>章节档案</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.filter((entry) => entry.isCleared).length}</strong><span>已贯通章节</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.filter((entry) => entry.isCurrent).length}</strong><span>当前章节</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.reduce((sum, entry) => sum + entry.bosses.length, 0)}</strong><span>已编入主宰</span></div>`,
            '</div>',
            `<p class="codex-side-note">章节档案会把“天象 / 地脉 / 生态 / Boss 传闻”压在同一页，方便在开局前就判断路线。</p>`
        ].join('');

        hints.innerHTML = [
            '<span class="codex-side-kicker">复盘提示</span>',
            '<h3>怎么读章节</h3>',
            '<ul class="codex-side-list compact">',
            '<li>先看天象和地脉，确定这章要放大的是什么玩法。</li>',
            '<li>再看生态模板，判断是输出压力、控制压力还是资源压力更高。</li>',
            '<li>最后再用 Boss 传闻回头修正路线，不要把精英和营地价值看成固定不变。</li>',
            '</ul>'
        ].join('');
    };

    Game.prototype.renderEnemyCodex = function () {
        if (typeof document === 'undefined') return;
        const grid = document.getElementById('enemy-codex-grid');
        const detail = document.getElementById('enemy-codex-detail');
        const summary = document.getElementById('enemy-codex-summary');
        const hints = document.getElementById('enemy-codex-hints');
        const searchInput = document.getElementById('enemy-codex-search');
        const focusSelect = document.getElementById('enemy-codex-focus-filter');
        if (!grid || !detail || !summary || !hints) return;

        const state = this.getCollectionHubState();
        if (searchInput && searchInput.value !== state.enemyQuery) searchInput.value = state.enemyQuery;
        if (focusSelect && focusSelect.value !== state.enemyFocus) focusSelect.value = state.enemyFocus;

        const entries = this.getEnemyCodexEntries();
        const filtered = entries.filter((entry) => this.passesEnemyCodexFilter(entry));
        const selected = filtered.find((entry) => entry.id === this.selectedEnemyCodexId) || filtered[0] || null;
        this.selectedEnemyCodexId = selected?.id || '';

        grid.innerHTML = filtered.length > 0
            ? filtered.map((entry) => `
                <button type="button"
                    class="collection-card enemy-codex-card ${entry.id === this.selectedEnemyCodexId ? 'selected' : ''} ${entry.status}"
                    onclick="game.selectEnemyCodexEntry('${escapeHtml(entry.id)}')">
                    <div class="collection-card-top">
                        <span class="collection-card-icon">${escapeHtml(entry.icon)}</span>
                        <span class="collection-status-chip ${entry.status}">${escapeHtml(entry.statusLabel)}</span>
                    </div>
                    <div class="collection-card-body">
                        <span class="collection-card-kicker">${escapeHtml(entry.realmLabel)}</span>
                        <h4>${escapeHtml(entry.name)}</h4>
                        <p>${escapeHtml(entry.roleLabel)} · ${escapeHtml(entry.firstMoveText || '正在整理招式速记')}</p>
                    </div>
                    <div class="collection-card-tags">
                        ${(entry.threatTags || []).slice(0, 3).map((tag) => `<span class="collection-tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                </button>
            `).join('')
            : '<div class="codex-empty-state">当前检索条件下没有匹配的敌影档案。</div>';

        if (!selected) {
            detail.innerHTML = '<div class="codex-empty-state">暂无敌影档案。</div>';
            return;
        }

        detail.innerHTML = `
            <div class="collection-detail-shell">
                <section class="collection-detail-hero">
                    <div class="collection-detail-hero-main">
                        <div class="collection-detail-icon">${escapeHtml(selected.icon)}</div>
                        <div class="collection-detail-meta">
                            <span class="codex-side-kicker">敌影档案</span>
                            <h3>${escapeHtml(selected.name)}</h3>
                            <p>${escapeHtml(selected.chapterFullName)} · ${escapeHtml(selected.roleLabel)}</p>
                        </div>
                    </div>
                    <div class="detail-status-strip">
                        <span class="detail-status-chip ${selected.status}">${escapeHtml(selected.statusLabel)}</span>
                        <span class="detail-status-chip">${escapeHtml(selected.realmLabel)}</span>
                        ${selected.elementLabel ? `<span class="detail-status-chip">${escapeHtml(selected.elementLabel)}属性</span>` : ''}
                    </div>
                </section>
                <div class="collection-detail-grid">
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">战术画像</span>
                        <strong>${escapeHtml(selected.roleLabel)}</strong>
                        <p>${escapeHtml(selected.counterHints[0] || '正在补充战术建议。')}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">主要威胁</span>
                        <div class="collection-card-tags">
                            ${(selected.threatTags || []).length > 0
                ? selected.threatTags.map((tag) => `<span class="collection-tag">${escapeHtml(tag)}</span>`).join('')
                : '<span class="collection-tag muted">威胁标签未记录</span>'}
                        </div>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">资源与掉落</span>
                        <p>${escapeHtml(selected.goldText)}</p>
                        <p class="collection-muted">${escapeHtml(selected.stealLawName ? `可盗取法则：${selected.stealLawName}` : '当前未记录可盗取法则。')}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">元素与抗性</span>
                        <div class="collection-card-tags">
                            ${(selected.resistTags || []).length > 0
                ? selected.resistTags.map((tag) => `<span class="collection-tag">${escapeHtml(tag)}</span>`).join('')
                : '<span class="collection-tag muted">当前未记录显著抗性</span>'}
                        </div>
                    </section>
                </div>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">招式速记</span>
                    <ul class="collection-detail-list">
                        ${(selected.patternPreview || []).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
                    </ul>
                </section>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">建议应对</span>
                    <ul class="collection-detail-list">
                        ${(selected.counterHints || []).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
                    </ul>
                </section>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">章节生态</span>
                    <div class="collection-card-tags">
                        ${(selected.ecologyTags || []).length > 0
                ? selected.ecologyTags.map((tag) => `<span class="collection-tag">${escapeHtml(tag)}</span>`).join('')
                : '<span class="collection-tag muted">该敌影的章节焦点仍在整理中</span>'}
                    </div>
                </section>
            </div>
        `;

        summary.innerHTML = [
            '<span class="codex-side-kicker">敌影总览</span>',
            '<h3>敌影档案进度</h3>',
            '<div class="codex-summary-grid two-cols">',
            `<div class="codex-summary-chip"><strong>${entries.length}</strong><span>敌影总数</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.filter((entry) => entry.isScouted).length}</strong><span>已遭遇</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.filter((entry) => entry.isUpcoming).length}</strong><span>未来敌影</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.filter((entry) => entry.aiProfile === 'control').length}</strong><span>控场型</span></div>`,
            '</div>',
            '<p class="codex-side-note">敌影档案会把常驻敌人的压制手段、首拍动作和章节归属压在同一页，方便提前做路线与解法准备。</p>'
        ].join('');

        hints.innerHTML = [
            '<span class="codex-side-kicker">复盘提示</span>',
            '<h3>怎么读敌影</h3>',
            '<ul class="codex-side-list compact">',
            '<li>先看战术画像和首拍速记，判断这只敌影是在抢血线、压状态还是拖回合。</li>',
            '<li>再看元素与抗性，确认当前主输出轴会不会被天然克制。</li>',
            '<li>最后回到章节档案，判断它是单卡问题还是整章生态都在逼你补同一种应对。</li>',
            '</ul>'
        ].join('');
    };

    Game.prototype.renderBossArchive = function () {
        if (typeof document === 'undefined') return;
        const grid = document.getElementById('boss-archive-grid');
        const detail = document.getElementById('boss-archive-detail');
        const summary = document.getElementById('boss-archive-summary');
        const hints = document.getElementById('boss-archive-hints');
        const searchInput = document.getElementById('boss-archive-search');
        const focusSelect = document.getElementById('boss-archive-focus-filter');
        if (!grid || !detail || !summary || !hints) return;

        const state = this.getCollectionHubState();
        if (searchInput && searchInput.value !== state.bossQuery) searchInput.value = state.bossQuery;
        if (focusSelect && focusSelect.value !== state.bossFocus) focusSelect.value = state.bossFocus;

        const entries = this.getBossArchiveEntries();
        const filtered = entries.filter((entry) => this.passesBossArchiveFilter(entry));
        const selected = filtered.find((entry) => entry.id === this.selectedBossArchiveId) || filtered[0] || null;
        this.selectedBossArchiveId = selected?.id || '';

        grid.innerHTML = filtered.length > 0
            ? filtered.map((entry) => `
                <button type="button"
                    class="collection-card boss-archive-card ${entry.id === this.selectedBossArchiveId ? 'selected' : ''} ${entry.status}"
                    onclick="game.selectBossArchiveEntry('${escapeHtml(entry.id)}')">
                    <div class="collection-card-top">
                        <span class="collection-card-icon">${escapeHtml(entry.icon)}</span>
                        <span class="collection-status-chip ${entry.status}">${escapeHtml(entry.statusLabel)}</span>
                    </div>
                    <div class="collection-card-body">
                        <span class="collection-card-kicker">${escapeHtml(entry.chapterName)}</span>
                        <h4>${escapeHtml(entry.name)}</h4>
                        <p>${escapeHtml(entry.mechanicText)}</p>
                    </div>
                    <div class="collection-card-tags">
                        <span class="collection-tag danger">${escapeHtml(entry.pressureLabel)}</span>
                        ${entry.counterTreasures.slice(0, 2).map((item) => `<span class="collection-tag">${escapeHtml(item.name)}</span>`).join('')}
                    </div>
                </button>
            `).join('')
            : '<div class="codex-empty-state">当前检索条件下没有匹配的 Boss 档案。</div>';

        if (!selected) {
            detail.innerHTML = '<div class="codex-empty-state">暂无 Boss 档案。</div>';
            return;
        }

        detail.innerHTML = `
            <div class="collection-detail-shell">
                <section class="collection-detail-hero">
                    <div class="collection-detail-hero-main">
                        <div class="collection-detail-icon">${escapeHtml(selected.icon)}</div>
                        <div class="collection-detail-meta">
                            <span class="codex-side-kicker">Boss 档案</span>
                            <h3>${escapeHtml(selected.name)}</h3>
                            <p>${escapeHtml(selected.chapterFullName)} · 风险等级 ${escapeHtml(selected.pressureLabel)}</p>
                        </div>
                    </div>
                    <div class="detail-status-strip">
                        <span class="detail-status-chip ${selected.status}">${escapeHtml(selected.statusLabel)}</span>
                        <span class="detail-status-chip">第 ${escapeHtml(selected.realm)} 重</span>
                        <span class="detail-status-chip">无反制难度 ${escapeHtml(selected.withoutCounter.toFixed(2))}</span>
                    </div>
                </section>
                <div class="collection-detail-grid">
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">主机制</span>
                        <p>${escapeHtml(selected.mechanicText)}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">开场立场</span>
                        <p>${escapeHtml(selected.openingStance || '当前档案尚未整理该主宰的开场立场。')}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">破局窗口</span>
                        <p>${escapeHtml(selected.breakHint)}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">章节传闻</span>
                        <p>${escapeHtml(selected.bossPrompt || '暂无额外传闻')}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">三幕压轴</span>
                        <p>${escapeHtml(selected.finisher ? `${selected.finisher} · ${selected.visualCue || '已记录专属视觉断章。'}` : '当前档案尚未整理该主宰的压轴大招。')}</p>
                        ${(selected.actPreview || []).length > 0
                ? `<div class="collection-card-tags">${selected.actPreview.map((item) => `<span class="collection-tag">${escapeHtml(item)}</span>`).join('')}</div>`
                : ''}
                    </section>
                    <section class="collection-detail-card collection-memory-panel">
                        <span class="detail-mini-label">伏魔台记忆战</span>
                        <div class="detail-status-strip">
                            <span class="detail-status-chip ${escapeHtml(selected.memoryStatus)}">${escapeHtml(selected.memoryStatusLabel)}</span>
                            <span class="detail-status-chip">试作 ${escapeHtml(selected.memoryRecord.attempts || 0)} 次</span>
                            <span class="detail-status-chip">${selected.memoryRecord.bestTurn > 0 ? `最快 ${escapeHtml(selected.memoryRecord.bestTurn)} 回合` : '尚无最快轮次'}</span>
                        </div>
                        <p>${escapeHtml(selected.memorySummary)}</p>
                        <div class="collection-detail-actions">
                            <button type="button"
                                class="collection-inline-btn ${selected.memoryReady ? '' : 'secondary'}"
                                ${selected.memoryReady ? '' : 'disabled'}
                                onclick="game.startBossMemoryBattle('${escapeHtml(selected.id)}')">${selected.memoryReady ? '发起记忆战' : '需先击破本体'}</button>
                            <button type="button"
                                class="collection-inline-btn secondary"
                                onclick="game.switchCollectionSection('chapters')">对照章节档案</button>
                        </div>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">建议反制法宝</span>
                        <div class="collection-card-tags">
                            ${selected.counterTreasures.length > 0
                ? selected.counterTreasures.map((item) => `<span class="collection-tag">${escapeHtml(item.icon)} ${escapeHtml(item.name)}</span>`).join('')
                : '<span class="collection-tag muted">暂无明确法宝反制</span>'}
                        </div>
                    </section>
                </div>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">招式速记</span>
                    <ul class="collection-detail-list">
                        ${(selected.patternPreview || []).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
                    </ul>
                </section>
            </div>
        `;

        summary.innerHTML = [
            '<span class="codex-side-kicker">主宰总览</span>',
            '<h3>Boss 档案进度</h3>',
            '<div class="codex-summary-grid two-cols">',
            `<div class="codex-summary-chip"><strong>${entries.length}</strong><span>主宰总数</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.filter((entry) => entry.status === 'defeated').length}</strong><span>已击破</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.filter((entry) => entry.memoryRecord.clears > 0).length}</strong><span>记忆战留痕</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.reduce((sum, entry) => sum + clampInt(entry.memoryRecord.attempts || 0, 0), 0)}</strong><span>总试作次数</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.filter((entry) => entry.pressureScore >= 1.45).length}</strong><span>高压主宰</span></div>`,
            '</div>',
            '<p class="codex-side-note">Boss 档案现在会把章节背景、核心机制、反制法宝与伏魔台记忆战记录压在同一页，方便边读边练。</p>'
        ].join('');

        hints.innerHTML = [
            '<span class="codex-side-kicker">复盘提示</span>',
            '<h3>怎么读主宰</h3>',
            '<ul class="codex-side-list compact">',
            '<li>先看主机制决定这场是抢节奏、稳资源，还是必须带净化 / 反制法宝。</li>',
            '<li>再看招式速记，提前规划哪一拍要留防、哪一拍能转攻。</li>',
            '<li>最后用伏魔台记忆战把理论过一遍，最快轮次会比单次胜负更能说明你是否真的读懂了这位主宰。</li>',
            '</ul>'
        ].join('');
    };

    Game.prototype.renderBuildSnapshot = function () {
        if (typeof document === 'undefined') return;
        const hero = document.getElementById('build-snapshot-hero');
        const metrics = document.getElementById('build-snapshot-metrics');
        const notes = document.getElementById('build-snapshot-notes');
        const highlights = document.getElementById('build-snapshot-highlights');
        const summary = document.getElementById('build-snapshot-summary');
        const guide = document.getElementById('build-snapshot-guide');
        if (!hero || !metrics || !notes || !highlights || !summary || !guide) return;

        const snapshot = this.getBuildSnapshotData();
        const profile = snapshot.profile;
        hero.innerHTML = `
            <div class="collection-detail-shell">
                <section class="collection-detail-hero">
                    <div class="collection-detail-hero-main">
                        <div class="collection-detail-icon">${escapeHtml(snapshot.spirit?.icon || snapshot.destiny?.icon || '🧭')}</div>
                        <div class="collection-detail-meta">
                            <span class="codex-side-kicker">构筑总览</span>
                            <h3>${escapeHtml(snapshot.archetypeLabel)}</h3>
                            <p>${escapeHtml(snapshot.chapter?.fullName || '当前尚未进入章节')}${snapshot.chapter?.skyOmen?.name ? ` · 天象 ${escapeHtml(snapshot.chapter.skyOmen.name)}` : ''}</p>
                        </div>
                    </div>
                    <div class="detail-status-strip">
                        <span class="detail-status-chip">牌组 ${escapeHtml(profile.size)} 张</span>
                        <span class="detail-status-chip">均费 ${escapeHtml(profile.avgCost.toFixed(1))}</span>
                        <span class="detail-status-chip">装配法则 ${escapeHtml(snapshot.loadedLaws.length)}</span>
                        <span class="detail-status-chip">法宝 ${escapeHtml(snapshot.equippedTreasures.length)}</span>
                    </div>
                </section>
            </div>
        `;

        metrics.innerHTML = `
            <div class="build-metric-grid">
                <div class="build-metric-card">
                    <strong>${escapeHtml(profile.counts.attack || 0)}</strong>
                    <span>攻击牌</span>
                </div>
                <div class="build-metric-card">
                    <strong>${escapeHtml(profile.counts.defense || 0)}</strong>
                    <span>防御牌</span>
                </div>
                <div class="build-metric-card">
                    <strong>${escapeHtml(profile.counts.law || 0)}</strong>
                    <span>法则牌</span>
                </div>
                <div class="build-metric-card">
                    <strong>${escapeHtml(snapshot.vows.length)}</strong>
                    <span>当前誓约</span>
                </div>
            </div>
            <div class="collection-mini-grid">
                <div class="collection-mini-card">
                    <strong>${escapeHtml(snapshot.destiny?.name || '未挂命格')}</strong>
                    <span>命格</span>
                    <p>${escapeHtml(snapshot.destiny?.summary || '先选命格再看章节顺势建议。')}</p>
                </div>
                <div class="collection-mini-card">
                    <strong>${escapeHtml(snapshot.spirit?.name || '未挂灵契')}</strong>
                    <span>灵契</span>
                    <p>${escapeHtml(snapshot.spirit?.summary || '灵契缺位时，中后段章节很难补足护道。')}</p>
                </div>
            </div>
        `;

        notes.innerHTML = `
            <div class="collection-detail-grid">
                <section class="collection-detail-card">
                    <span class="detail-mini-label">当前优势</span>
                    <ul class="collection-detail-list">
                        ${snapshot.strengths.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
                    </ul>
                </section>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">主要缺口</span>
                    <ul class="collection-detail-list">
                        ${snapshot.gaps.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
                    </ul>
                </section>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">下一轮补位</span>
                    <ul class="collection-detail-list">
                        ${snapshot.nextTargets.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
                    </ul>
                </section>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">当前装配</span>
                    <div class="collection-card-tags">
                        ${snapshot.loadedLaws.length > 0
                ? snapshot.loadedLaws.map((law) => `<span class="collection-tag">${escapeHtml(law.icon || '📜')} ${escapeHtml(law.name || law.id)}</span>`).join('')
                : '<span class="collection-tag muted">命环暂未装满</span>'}
                        ${snapshot.equippedTreasures.length > 0
                ? snapshot.equippedTreasures.slice(0, 3).map((treasure) => `<span class="collection-tag">${escapeHtml(treasure.icon || '🏺')} ${escapeHtml(treasure.name || treasure.id)}</span>`).join('')
                : '<span class="collection-tag muted">法宝位未装配</span>'}
                    </div>
                </section>
            </div>
        `;

        highlights.innerHTML = `
            <div class="build-metric-grid">
                ${snapshot.highlights.map((item) => `
                    <div class="build-metric-card">
                        <strong>${escapeHtml(item.value)}</strong>
                        <span>${escapeHtml(item.label)}</span>
                        <p>${escapeHtml(item.note)}</p>
                    </div>
                `).join('')}
            </div>
        `;

        summary.innerHTML = [
            '<span class="codex-side-kicker">构筑概览</span>',
            '<h3>这一套在打什么</h3>',
            '<ul class="codex-side-list compact">',
            `<li>${escapeHtml(snapshot.archetypeLabel)}</li>`,
            `<li>主类型：${escapeHtml(profile.dominantType)} · 当前章节：${escapeHtml(snapshot.chapter?.name || '未定')}</li>`,
            `<li>当前誓约：${escapeHtml(snapshot.vows.map((meta) => meta.name).join('、') || '暂无')}</li>`,
            '</ul>'
        ].join('');

        guide.innerHTML = [
            '<span class="codex-side-kicker">阅读顺序</span>',
            '<h3>怎么用这页复盘</h3>',
            '<ul class="codex-side-list compact">',
            '<li>先看“当前优势”，确认这套牌真正赢在哪里。</li>',
            '<li>再看“主要缺口”，判断是缺护阵、缺回能，还是命环没装满。</li>',
            '<li>最后用“下一轮补位”反推地图路线，而不是每个节点都平均拿。</li>',
            '</ul>'
        ].join('');
    };

    Game.prototype.renderSanctumOverview = function () {
        if (typeof document === 'undefined') return;
        const roomGrid = document.getElementById('sanctum-room-grid');
        const researchList = document.getElementById('sanctum-research-list');
        const goalList = document.getElementById('sanctum-goal-list');
        const unlockFeed = document.getElementById('sanctum-unlock-feed');
        const summary = document.getElementById('sanctum-summary');
        const progressCard = document.getElementById('sanctum-progress');
        const guide = document.getElementById('sanctum-guide');
        if (!roomGrid || !researchList || !goalList || !unlockFeed || !summary || !progressCard || !guide) return;

        const data = this.getSanctumOverviewData();
        roomGrid.innerHTML = data.rooms.map((room) => `
            <article class="sanctum-room-card">
                <div class="sanctum-room-top">
                    <span class="sanctum-room-icon">${escapeHtml(room.icon)}</span>
                    <div>
                        <h4>${escapeHtml(room.name)}</h4>
                        <p>${escapeHtml(room.focus)}</p>
                    </div>
                </div>
                <p class="collection-muted">${escapeHtml(room.note)}</p>
                <button type="button" class="collection-inline-btn"
                    onclick="${room.actionType === 'treasure'
                ? 'game.showTreasureCompendium()'
                : room.actionType === 'challenge'
                    ? `game.showChallengeHub('${escapeHtml(room.actionValue || 'daily')}')`
                    : `game.switchCollectionSection('${escapeHtml(room.actionValue)}')`}">${escapeHtml(room.actionLabel)}</button>
            </article>
        `).join('');

        researchList.innerHTML = data.researches.map((research) => `
            <article class="sanctum-research-item ${research.ready ? 'ready' : 'tracking'}">
                <div class="sanctum-research-meta">
                    <strong>${escapeHtml(research.name)}</strong>
                    <span>${escapeHtml(research.room)} · 进度 ${escapeHtml(research.progressText)}</span>
                </div>
                <p>${escapeHtml(research.reward)}</p>
                <button type="button" class="collection-inline-btn"
                    onclick="${research.actionType === 'treasure'
                ? 'game.showTreasureCompendium()'
                : research.actionType === 'challenge'
                ? `game.showChallengeHub('${escapeHtml(research.actionValue || 'daily')}')`
                : `game.switchCollectionSection('${escapeHtml(research.section)}')`}">${research.ready ? '查看成果' : '查看线索'}</button>
            </article>
        `).join('');

        goalList.innerHTML = data.goals.length > 0
            ? data.goals.map((goal) => `
                <article class="sanctum-goal-item">
                    <div class="sanctum-goal-top">
                        <span class="sanctum-goal-icon">${escapeHtml(goal.icon || '🎯')}</span>
                        <div>
                            <strong>${escapeHtml(goal.title)}</strong>
                            <p>${escapeHtml(goal.note)}</p>
                        </div>
                    </div>
                    <button type="button" class="collection-inline-btn"
                        onclick="${goal.action === 'claim'
                ? `game.claimAchievement('${escapeHtml(goal.id)}')`
                : goal.action === 'treasure'
                    ? 'game.showTreasureCompendium()'
                : `game.switchCollectionSection('${escapeHtml(goal.value || 'builds')}')`}">${goal.action === 'claim' ? '领取奖励' : '前往查看'}</button>
                </article>
            `).join('')
            : '<div class="codex-empty-state">当前没有待领取目标，可以继续推进章节、法则或灵契研究。</div>';

        unlockFeed.innerHTML = data.recentUnlocks.length > 0
            ? data.recentUnlocks.map((entry) => `
                <article class="unlock-feed-item">
                    <div class="unlock-feed-main">
                        <span class="unlock-feed-icon">${escapeHtml(entry.icon || '✦')}</span>
                        <div>
                            <strong>${escapeHtml(entry.name)}</strong>
                            <p>${escapeHtml(entry.note || '已更新藏经阁记录')}</p>
                        </div>
                    </div>
                    <span class="unlock-feed-time">${escapeHtml(this.formatCollectionTimestamp(entry.timestamp))}</span>
                </article>
            `).join('')
            : '<div class="codex-empty-state">近期还没有新的藏经阁记录，去打一局或补一条研究线索吧。</div>';

        summary.innerHTML = [
            '<span class="codex-side-kicker">洞府概览</span>',
            '<h3>局外中枢进度</h3>',
            '<div class="codex-summary-grid two-cols">',
            `<div class="codex-summary-chip"><strong>${data.rooms.length}</strong><span>房间总览</span></div>`,
            `<div class="codex-summary-chip"><strong>${data.researches.filter((item) => item.ready).length}</strong><span>已满足研究</span></div>`,
            `<div class="codex-summary-chip"><strong>${data.progress.clearedChapters}</strong><span>已贯通章节</span></div>`,
            `<div class="codex-summary-chip"><strong>${data.progress.clearedBossMemories || 0}</strong><span>记忆战留痕</span></div>`,
            `<div class="codex-summary-chip"><strong>${data.progress.forgeActiveWorkshops || 0}</strong><span>炼器铭刻</span></div>`,
            `<div class="codex-summary-chip"><strong>${data.progress.forgeFullSets || 0}</strong><span>三段套装</span></div>`,
            `${data.progress.observatoryTraces !== undefined ? `<div class="codex-summary-chip"><strong>${data.progress.observatoryTraces || 0}</strong><span>观星留痕</span></div>` : ''}`,
            `<div class="codex-summary-chip"><strong>${data.progress.unclaimedAchievements}</strong><span>可领取目标</span></div>`,
            '</div>'
        ].join('');

        progressCard.innerHTML = [
            '<span class="codex-side-kicker">图鉴进度</span>',
            '<h3>收藏总览</h3>',
            '<ul class="codex-side-list compact">',
            `<li>法则：${data.progress.collectedLaws} / ${data.progress.totalLaws}</li>`,
            `<li>法宝：${data.progress.collectedTreasures} / ${data.progress.totalTreasures}</li>`,
            `<li>炼器研究：核心件 ${data.progress.forgeCoreOwned || 0} / ${data.progress.forgeCoreTotal || 0} · 形态件 ${data.progress.forgeFormOwned || 0} / ${data.progress.forgeFormTotal || 0}</li>`,
            `<li>套装共鸣：${data.progress.forgeResonantSets || 0} 组达到二段阈值 / ${data.progress.forgeFullSets || 0} 组达到三段共鸣</li>`,
            `<li>炼器铭刻：重铸 ${data.progress.forgeReforges || 0} / 器灵 ${data.progress.forgeInfusions || 0} / 套装修正 ${data.progress.forgeSetEchoes || 0}</li>`,
            `<li>灵契线索：${data.progress.seenSpirits} / ${data.progress.totalSpirits}</li>`,
            `<li>敌影档案：${data.progress.seenEnemies} / ${data.progress.totalEnemies}</li>`,
            `<li>Boss 档案：${data.progress.defeatedBosses} / ${data.progress.totalBosses}</li>`,
            `<li>伏魔台记忆战：${data.progress.clearedBossMemories || 0} 次留痕 / ${data.progress.totalBossMemoryAttempts || 0} 次试作</li>`,
            `${data.progress.observatoryTraces !== undefined ? `<li>观星留痕：${data.progress.observatoryTraces || 0} 条归档 / ${data.progress.observatoryReplays || 0} 次回放</li>` : ''}`,
            '</ul>'
        ].join('');

        guide.innerHTML = [
            '<span class="codex-side-kicker">使用建议</span>',
            '<h3>洞府怎么喂主线</h3>',
            '<ul class="codex-side-list compact">',
            '<li>先从可领取目标拿到即时收益，再回到章节或 Boss 档案定路线。</li>',
            '<li>研究项全部偏“解锁信息与入口”，不直接堆数值，方便后续继续扩系统。</li>',
            '<li>炼器室现在会标出核心件、形态件与器灵灌注资格，适合先在图鉴里定研究目标，再决定路线要去商店、精英还是事件。</li>',
            '<li>伏魔台的记忆战更适合拿来检验“我是否真的读懂了 Boss 出题”，而不是单纯比一次输赢。</li>',
            `${data.progress.observatoryTraces !== undefined ? '<li>观星台现在会沉淀命盘签和留痕，适合把高分轮换或好用命盘重新回放验证。</li>' : ''}`,
            '</ul>'
        ].join('');
    };

    Game.prototype.renderCollectionHub = function () {
        this.renderCollectionHubChrome();
        this.renderSpiritCodex();
        this.renderChapterCodex();
        this.renderEnemyCodex();
        this.renderBossArchive();
        this.renderBuildSnapshot();
        this.renderSanctumOverview();
    };

    Game.prototype.initCollection = function () {
        this.ensureCollectionHubBootState();
        if (typeof originalInitCollection === 'function') {
            originalInitCollection.call(this);
        }
        this.renderCollectionHub();
    };

    if (typeof Player !== 'undefined') {
        const originalSetSpiritCompanion = Player.prototype.setSpiritCompanion;
        const originalCollectLaw = Player.prototype.collectLaw;
        const originalAddTreasure = Player.prototype.addTreasure;

        Player.prototype.setSpiritCompanion = function (spiritId, tier = 1) {
            const result = originalSetSpiritCompanion.call(this, spiritId, tier);
            const meta = typeof this.getSpiritCompanionMeta === 'function' ? this.getSpiritCompanionMeta() : result;
            if (meta && this.game && typeof this.game.recordCollectionUnlock === 'function') {
                this.game.recordCollectionUnlock('spirit', {
                    id: meta.id,
                    name: meta.name,
                    icon: meta.icon || '✦',
                    note: `完成缔约 · ${meta.tierLabel || '初契'}`
                });
            }
            return result;
        };

        Player.prototype.collectLaw = function (law) {
            const added = originalCollectLaw.call(this, law);
            if (added && law && this.game && typeof this.game.recordCollectionUnlock === 'function') {
                this.game.recordCollectionUnlock('law', {
                    id: law.id,
                    name: law.name || law.id,
                    icon: law.icon || '📜',
                    note: `法则入藏 · ${typeof this.game.getLawElementLabel === 'function' ? this.game.getLawElementLabel(law.element) : '未知'}属性`
                });
            }
            return added;
        };

        Player.prototype.addTreasure = function (treasureId) {
            const added = originalAddTreasure.call(this, treasureId);
            const treasure = typeof this.getTreasureById === 'function' ? this.getTreasureById(treasureId) : null;
            if (added && treasure && this.game && typeof this.game.recordCollectionUnlock === 'function') {
                this.game.recordCollectionUnlock('treasure', {
                    id: treasure.id,
                    name: treasure.name || treasure.id,
                    icon: treasure.icon || '🏺',
                    note: '法宝入藏'
                });
            }
            return added;
        };
    }

    if (typeof AchievementSystem !== 'undefined') {
        const originalUnlockAchievement = AchievementSystem.prototype.unlockAchievement;
        AchievementSystem.prototype.unlockAchievement = function (achievementId) {
            const alreadyUnlocked = Array.isArray(this.unlockedAchievements) && this.unlockedAchievements.includes(achievementId);
            const result = originalUnlockAchievement.call(this, achievementId);
            if (!alreadyUnlocked && Array.isArray(this.unlockedAchievements) && this.unlockedAchievements.includes(achievementId)) {
                const achievement = typeof ACHIEVEMENTS !== 'undefined' && ACHIEVEMENTS ? ACHIEVEMENTS[achievementId] : null;
                if (achievement && this.game && typeof this.game.recordCollectionUnlock === 'function') {
                    this.game.recordCollectionUnlock('achievement', {
                        id: achievementId,
                        name: achievement.name || achievementId,
                        icon: achievement.icon || '🏆',
                        note: '成就解锁'
                    });
                }
            }
            return result;
        };
    }

    Game.prototype.startBattle = function (enemies, node = null) {
        const enemyList = Array.isArray(enemies) ? enemies : [enemies];
        if (typeof this.recordCollectionUnlock === 'function') {
            enemyList
                .filter((enemy) => enemy && enemy.id && !enemy.isBoss && !enemy.isMinion)
                .forEach((enemy) => {
                    const realm = clampInt(enemy.realm || this.player?.realm || 1, 1, 18);
                    const chapter = typeof this.getChapterProfileForRealm === 'function'
                        ? this.getChapterProfileForRealm(realm)
                        : null;
                    this.recordCollectionUnlock('enemy', {
                        id: enemy.id,
                        name: enemy.name || enemy.id,
                        icon: enemy.icon || '👁️',
                        note: chapter ? `遭遇于 ${chapter.name}` : `遭遇于第 ${realm} 重`
                    });
                });
        }
        return typeof originalStartBattle === 'function'
            ? originalStartBattle.call(this, enemies, node)
            : undefined;
    };

    Game.prototype.onBattleWon = async function (enemies) {
        if (this.currentBattleNode && this.currentBattleNode.type === 'boss_memory') {
            const enemyList = Array.isArray(enemies) ? enemies.filter(Boolean) : [enemies].filter(Boolean);
            const bossEnemy = enemyList.find((enemy) => enemy && enemy.isBoss) || enemyList[0] || null;
            return this.finishBossMemoryBattle('victory', {
                bossEnemy,
                bossId: this.currentBattleNode?.bossId || bossEnemy?.id || '',
                turns: clampInt(this.battle?.turnNumber || 0, 0, 9999)
            });
        }
        return typeof originalOnBattleWon === 'function'
            ? originalOnBattleWon.call(this, enemies)
            : undefined;
    };

    Game.prototype.onBattleLost = async function () {
        if (this.currentBattleNode && this.currentBattleNode.type === 'boss_memory') {
            return this.finishBossMemoryBattle('defeat', {
                bossId: this.currentBattleNode?.bossId || '',
                turns: clampInt(this.battle?.turnNumber || 0, 0, 9999)
            });
        }
        return typeof originalOnBattleLost === 'function'
            ? originalOnBattleLost.call(this)
            : undefined;
    };

    Game.prototype.handleBossDefeated = async function (bossEnemy = null, enemyList = [], ringExp = 0) {
        if (this.currentBattleNode?.type !== 'boss_memory' && this.achievementSystem && typeof this.achievementSystem.updateStat === 'function') {
            this.achievementSystem.updateStat('bossesDefeated', 1);
        }
        const result = await originalHandleBossDefeated.call(this, bossEnemy, enemyList, ringExp);
        if (this.currentBattleNode?.type !== 'boss_memory' && bossEnemy && typeof this.recordCollectionUnlock === 'function') {
            const chapter = typeof this.getChapterProfileForRealm === 'function'
                ? this.getChapterProfileForRealm(bossEnemy.realm || this.player?.realm || 1)
                : null;
            this.recordCollectionUnlock('boss', {
                id: bossEnemy.id,
                name: bossEnemy.name || bossEnemy.id,
                icon: bossEnemy.icon || '👁️',
                note: chapter ? `击破 ${chapter.name} 主宰` : '击破章节主宰'
            });
        }
        return result;
    };

    Game.prototype.onRealmComplete = function () {
        const clearedRealm = clampInt(this.player?.realm || 1, 1, 18);
        const shouldRecordChapter = clearedRealm % 3 === 0;
        const chapter = shouldRecordChapter && typeof this.getChapterProfileForRealm === 'function'
            ? this.getChapterProfileForRealm(clearedRealm)
            : null;
        const result = originalOnRealmComplete.call(this);
        if (chapter && typeof this.recordCollectionUnlock === 'function') {
            this.recordCollectionUnlock('chapter', {
                id: chapter.id,
                name: chapter.fullName || chapter.name,
                icon: chapter.icon || '☯️',
                note: '章节贯通'
            });
        }
        return result;
    };
})();
