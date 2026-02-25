/**
 * The Defier - PVP Service
 * 处理所有PVP相关的后端交互 (Bmob)
 */

window.PVPService = {
    // 缓存数据
    currentRankData: null,
    ruleVersion: 'pvp-v2',
    activeMatch: null,
    activeMatchStorageKey: 'theDefierPvpActiveMatchV1',

    getActiveMatchStorage() {
        if (typeof sessionStorage !== 'undefined') return sessionStorage;
        if (typeof localStorage !== 'undefined') return localStorage;
        return null;
    },

    persistActiveMatch() {
        try {
            const storage = this.getActiveMatchStorage();
            if (!storage) return;
            if (!this.activeMatch) {
                storage.removeItem(this.activeMatchStorageKey);
                return;
            }
            storage.setItem(this.activeMatchStorageKey, JSON.stringify(this.activeMatch));
        } catch (e) {
            console.warn('Persist active match failed:', e);
        }
    },

    loadActiveMatchFromStorage() {
        try {
            const storage = this.getActiveMatchStorage();
            if (!storage) return;
            const raw = storage.getItem(this.activeMatchStorageKey);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') {
                storage.removeItem(this.activeMatchStorageKey);
                return;
            }

            const now = Date.now();
            const maxAge = 10 * 60 * 1000;
            const isExpired = !parsed.issuedAt || (now - parsed.issuedAt > maxAge);
            const currentUser = (typeof Bmob !== 'undefined' && Bmob.User && typeof Bmob.User.current === 'function')
                ? Bmob.User.current()
                : null;
            const userMismatch = !!(parsed.userId && currentUser && parsed.userId !== currentUser.objectId);
            if (parsed.consumed || isExpired) {
                storage.removeItem(this.activeMatchStorageKey);
                return;
            }
            if (userMismatch) {
                storage.removeItem(this.activeMatchStorageKey);
                return;
            }
            this.activeMatch = parsed;
        } catch (e) {
            console.warn('Load active match failed:', e);
        }
    },

    setActiveMatch(match) {
        this.activeMatch = match || null;
        this.persistActiveMatch();
    },

    clearActiveMatch() {
        this.activeMatch = null;
        this.persistActiveMatch();
    },

    // 兼容不同 Bmob SDK 查询参数签名
    applyFilter(query, key, op, value) {
        try {
            query.equalTo(key, op, value);
            return;
        } catch (e) {
            // Fallback to method-style operators if available
        }

        if (op === '==') {
            query.equalTo(key, value);
            return;
        }
        if (op === '!=' && typeof query.notEqualTo === 'function') {
            query.notEqualTo(key, value);
            return;
        }
        if (op === '>=' && typeof query.greaterThanOrEqualTo === 'function') {
            query.greaterThanOrEqualTo(key, value);
            return;
        }
        if (op === '<=' && typeof query.lessThanOrEqualTo === 'function') {
            query.lessThanOrEqualTo(key, value);
            return;
        }

        // Last try: keep original call pattern for SDKs that only support this form.
        query.equalTo(key, op, value);
    },

    /**
     * 初始化：检查当前用户并获取榜单信息
     */
    async init() {
        if (typeof AuthService === 'undefined' || !AuthService.isInitialized) {
            console.warn('PVPService waiting for AuthService...');
            return;
        }
        this.loadActiveMatchFromStorage();
        await this.syncRank();
    },

    /**
     * 上传防御快照 (Ghost)
     * @param {Object} snapData - 包含 { powerScore, realm, data, personality, formation }
     */
    async uploadSnapshot(snapData) {
        if (!AuthService.isLoggedIn()) return { success: false, message: '未登录' };

        try {
            const user = Bmob.User.current();
            const query = Bmob.Query('GhostSnapshot');
            this.applyFilter(query, 'user', '==', user.objectId);

            let results = [];
            try {
                results = await query.find();
            } catch (findError) {
                if (findError && findError.code !== 101) {
                    throw findError;
                }
                // If 101, keep results as []
            }

            let ghost;
            if (results && results.length > 0) {
                // Update existing
                const latest = results.reduce((best, item) => {
                    if (!best) return item;
                    const bestTime = Number(best.saveTime) || 0;
                    const itemTime = Number(item.saveTime) || 0;
                    return itemTime >= bestTime ? item : best;
                }, null);
                ghost = Bmob.Query('GhostSnapshot');
                ghost.set('id', latest.objectId);
            } else {
                // Create new
                ghost = Bmob.Query('GhostSnapshot');
                const userPointer = Bmob.Pointer('_User');
                const poiID = userPointer.set(user.objectId);
                ghost.set('user', poiID);
            }

            // Set Data
            const normalizedData = this.normalizeBattleData(snapData.data || {});
            ghost.set('powerScore', snapData.powerScore || 100);
            ghost.set('realm', snapData.realm || 1);
            ghost.set('data', JSON.stringify(normalizedData)); // 完整Battle数据 stringified
            ghost.set('config', {
                personality: snapData.personality || 'balanced',
                guardianFormation: snapData.guardianFormation || false
            });
            ghost.set('isDefense', true);
            ghost.set('saveTime', Date.now()); // Renamed from updatedAt (reserved)

            await ghost.save();
            console.log('Ghost Snapshot uploaded.');
            return { success: true };

        } catch (error) {
            console.error('Upload Snapshot error:', error);
            return { success: false, error };
        }
    },

    /**
     * 获取我的防御快照
     */
    async getMyDefenseSnapshot() {
        if (!AuthService.isLoggedIn()) return null;

        try {
            const user = Bmob.User.current();
            const query = Bmob.Query('GhostSnapshot');
            this.applyFilter(query, 'user', '==', user.objectId);
            const results = await query.find();

            if (results && results.length > 0) {
                return results.reduce((best, item) => {
                    if (!best) return item;
                    const bestTime = Number(best.saveTime) || 0;
                    const itemTime = Number(item.saveTime) || 0;
                    return itemTime >= bestTime ? item : best;
                }, null);
            }
            return null;
        } catch (error) {
            console.error('Get my snapshot error:', error);
            // Ignore 101 table missing
            return null;
        }
    },

    /**
     * 寻找对手
     * @param {number} myScore - 我的当前积分
     * @param {number} myRealm - 我的境界
     * @returns {Object} Opponent Ghost Data
     */
    async findOpponent(myScore, myRealm) {
        if (!AuthService.isLoggedIn()) return { success: false, message: '未登录' };

        try {
            // 策略：找积分相近的对手 (±200分)
            const query = Bmob.Query('PlayerRank');

            // 排除自己
            const user = Bmob.User.current();
            this.applyFilter(query, 'user', '!=', user.objectId);

            // 简单范围查询
            if (myScore) {
                this.applyFilter(query, 'score', '>=', myScore - 300);
                this.applyFilter(query, 'score', '<=', myScore + 300);
            }
            query.limit(10);
            // 必须 include user 才能获取对手名字
            query.include('user');

            let opponents = await query.find();

            // 如果没找到，放宽条件
            if (!opponents || opponents.length === 0) {
                const retryQuery = Bmob.Query('PlayerRank');
                this.applyFilter(retryQuery, 'user', '!=', user.objectId);
                retryQuery.limit(5);
                retryQuery.order('-score'); // 找高分的
                retryQuery.include('user');
                opponents = await retryQuery.find();
            }

            if (!opponents || opponents.length === 0) {
                return { success: false, message: '暂无对手，请稍后再试' };
            }

            // 随机挑一个
            const opponentRank = opponents[Math.floor(Math.random() * opponents.length)];

            // 获取该对手的 Ghost Snapshot
            const ghostQuery = Bmob.Query('GhostSnapshot');
            // 注意：这里需要查 opponentRank.user.objectId
            if (opponentRank.user && opponentRank.user.objectId) {
                this.applyFilter(ghostQuery, 'user', '==', opponentRank.user.objectId);
            } else {
                return { success: false, message: '对手数据异常' };
            }

            const ghosts = await ghostQuery.find();

            if (!ghosts || ghosts.length === 0) {
                return { success: false, message: '对手未设置防御' };
            }

            const ghostData = ghosts.reduce((best, item) => {
                if (!best) return item;
                const bestTime = Number(best.saveTime) || 0;
                const itemTime = Number(item.saveTime) || 0;
                return itemTime >= bestTime ? item : best;
            }, null);

            // 解析数据
            let parsedData;
            try {
                if (typeof ghostData.data === 'string') {
                    parsedData = JSON.parse(ghostData.data);
                } else if (ghostData.data && typeof ghostData.data === 'object') {
                    parsedData = ghostData.data;
                } else {
                    throw new Error('ghost data format invalid');
                }
            } catch (e) {
                console.error('Parse ghost data failed', e);
                return { success: false, message: '对手数据损坏' };
            }
            parsedData = this.normalizeBattleData(parsedData);

            const issuedAt = Date.now();
            const opponentRankId = opponentRank.objectId || null;
            const matchTicket = `${user.objectId}:${opponentRankId || 'unknown'}:${issuedAt}:${Math.random().toString(36).slice(2, 10)}`;
            this.setActiveMatch({
                ticket: matchTicket,
                issuedAt,
                opponentRankId,
                opponentUserId: opponentRank.user && opponentRank.user.objectId ? opponentRank.user.objectId : null,
                userId: user.objectId,
                consumed: false
            });

            return {
                success: true,
                opponent: {
                    rank: opponentRank,
                    ghost: ghostData,
                    battleData: parsedData,
                    matchTicket
                }
            };

        } catch (error) {
            console.error('Find opponent error:', error);
            // Handle 101 (Table missing)
            if (error.code === 101) return { success: false, message: '暂无对手数据 (101)' };
            return { success: false, error };
        }
    },

    normalizeBattleData(rawData) {
        const data = rawData && typeof rawData === 'object' ? rawData : {};
        const deck = Array.isArray(data.deck) ? data.deck : [];
        const aiProfile = data.aiProfile || this.getDeckArchetype(deck);

        return {
            me: {
                maxHp: data.me && data.me.maxHp ? data.me.maxHp : 100,
                energy: data.me && data.me.energy ? data.me.energy : 3,
                currEnergy: data.me && data.me.currEnergy ? data.me.currEnergy : (data.me && data.me.energy ? data.me.energy : 3)
            },
            deck,
            aiProfile,
            deckArchetype: data.deckArchetype || this.getDeckArchetype(deck),
            ruleVersion: data.ruleVersion || this.ruleVersion
        };
    },

    getDeckArchetype(deck) {
        let attack = 0;
        let defense = 0;
        let utility = 0;
        deck.forEach(card => {
            const id = typeof card === 'string' ? card : card.id;
            const cardDef = (typeof CARDS !== 'undefined') ? CARDS[id] : null;
            const type = cardDef ? cardDef.type : null;
            if (type === 'attack') attack++;
            else if (type === 'defense') defense++;
            else utility++;
        });

        if (attack >= defense + utility) return 'aggressive';
        if (defense >= attack) return 'fortified';
        return 'balanced';
    },

    /**
     * 同步我的榜单数据
     */
    async syncRank() {
        if (!AuthService.isLoggedIn()) return;

        try {
            const user = Bmob.User.current();
            const query = Bmob.Query('PlayerRank');
            this.applyFilter(query, 'user', '==', user.objectId);
            const results = await query.find();

            if (results && results.length > 0) {
                this.currentRankData = results[0];
            } else {
                // 初始化
                await this.createInitialRank(user);
            }
        } catch (error) {
            console.error('Sync rank error:', error);
            // Handle 101: Table not found (never created)
            if (error && error.code === 101) {
                console.log('PlayerRank table not found, creating initial rank...');
                const user = Bmob.User.current();
                await this.createInitialRank(user);
            }
        }
    },

    async createInitialRank(user) {
        const rank = Bmob.Query('PlayerRank');
        const userPointer = Bmob.Pointer('_User');
        const poiID = userPointer.set(user.objectId);
        rank.set('user', poiID);
        rank.set('score', 1000); // 初始分
        rank.set('realm', 1);
        rank.set('division', '潜龙榜'); // Default

        try {
            await rank.save();
            this.currentRankData = await this.getRankByUserId(user.objectId);
        } catch (e) {
            console.error('Create initial rank failed', e);
        }
    },

    async getRankByUserId(userId) {
        const query = Bmob.Query('PlayerRank');
        this.applyFilter(query, 'user', '==', userId);
        const res = await query.find();
        return res[0];
    },

    async getRankByObjectId(rankId) {
        if (!rankId) return null;
        try {
            const query = Bmob.Query('PlayerRank');
            return await query.get(rankId);
        } catch (error) {
            console.warn('Get rank by objectId failed:', rankId, error);
            return null;
        }
    },

    /**
     * 汇报战斗结果
     * @param {boolean} isWin 
     * @param {Object} opponentRankData 
     */
    async reportMatchResult(isWin, opponentRankData, matchTicket = null) {
        if (!this.currentRankData) await this.syncRank();
        if (!this.activeMatch) this.loadActiveMatchFromStorage();
        if (typeof Bmob === 'undefined' || typeof AuthService === 'undefined' || !AuthService.isLoggedIn()) {
            return { newRating: 1000, delta: 0, rejected: true };
        }

        if (!this.currentRankData) return { newRating: 1000, delta: 0, rejected: true }; // Sync failed

        const currentRating = this.currentRankData.score || 1000;
        const now = Date.now();
        const active = this.activeMatch;
        const user = Bmob.User.current();
        if (!user || !user.objectId) {
            return { newRating: currentRating, delta: 0, rejected: true };
        }
        const opponentRankId = opponentRankData ? opponentRankData.objectId : null;
        const opponentUserId = opponentRankData && opponentRankData.user ? opponentRankData.user.objectId : null;
        const ticketValid = !!(
            active &&
            !active.consumed &&
            matchTicket &&
            active.ticket === matchTicket &&
            (!active.userId || active.userId === user.objectId) &&
            now - active.issuedAt <= 10 * 60 * 1000 &&
            (!active.opponentRankId || !opponentRankId || active.opponentRankId === opponentRankId) &&
            (!active.opponentUserId || !opponentUserId || active.opponentUserId === opponentUserId)
        );

        if (!ticketValid) {
            console.warn('PVP report rejected: invalid or expired match ticket.');
            if (active && (active.consumed || now - active.issuedAt > 10 * 60 * 1000 || (matchTicket && active.ticket === matchTicket))) {
                this.clearActiveMatch();
            }
            return { newRating: currentRating, delta: 0, rejected: true };
        }
        active.consumed = true;
        this.persistActiveMatch();

        const myRating = currentRating;
        let oppRating = opponentRankData ? (opponentRankData.score || 1000) : 1000;
        if (opponentRankId) {
            const verifiedOpponentRank = await this.getRankByObjectId(opponentRankId);
            if (verifiedOpponentRank && typeof verifiedOpponentRank.score === 'number') {
                const verifiedOpponentUserId = verifiedOpponentRank.user && verifiedOpponentRank.user.objectId
                    ? verifiedOpponentRank.user.objectId
                    : null;
                if (active.opponentUserId && verifiedOpponentUserId && active.opponentUserId !== verifiedOpponentUserId) {
                    console.warn('PVP report rejected: opponent user mismatch.');
                    this.clearActiveMatch();
                    return { newRating: currentRating, delta: 0, rejected: true };
                }
                oppRating = verifiedOpponentRank.score;
            } else {
                console.warn('PVP rating fallback: unable to verify opponent rank from server.');
            }
        }

        // Local Calc
        const result = isWin ? 1 : 0;
        const calcRes = EloCalculator.calculate(myRating, oppRating, result);

        // Update My Rank (Server)
        const myQuery = Bmob.Query('PlayerRank');
        myQuery.set('id', this.currentRankData.objectId);
        myQuery.set('score', calcRes.newRating);
        // Update Stats
        let wins = this.currentRankData.wins || 0;
        if (isWin) wins++;
        myQuery.set('wins', wins);
        let losses = this.currentRankData.losses || 0;
        if (!isWin) losses++;
        myQuery.set('losses', losses);

        try {
            await myQuery.save();
        } catch (error) {
            console.error('PVP save result failed:', error);
            this.clearActiveMatch();
            return { newRating: currentRating, delta: 0, rejected: true, error };
        }

        // Sync local
        this.currentRankData.score = calcRes.newRating;
        this.currentRankData.wins = wins;
        this.currentRankData.losses = losses;
        this.clearActiveMatch();

        return calcRes; // Return delta for UI
    },

    /**
     * 获取排行榜
     */
    async getLeaderboard() {
        const query = Bmob.Query('PlayerRank');
        query.order('-score');
        query.limit(20);
        query.include('user'); // Include user info (name etc)
        return await query.find();
    }
};
