/**
 * The Defier - PVP Service
 * 处理所有PVP相关的后端交互 (Bmob)
 */

window.PVPService = {
    // 缓存数据
    currentRankData: null,

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
                ghost = Bmob.Query('GhostSnapshot');
                ghost.set('id', results[0].objectId);
            } else {
                // Create new
                ghost = Bmob.Query('GhostSnapshot');
                const userPointer = Bmob.Pointer('_User');
                const poiID = userPointer.set(user.objectId);
                ghost.set('user', poiID);
            }

            // Set Data
            ghost.set('powerScore', snapData.powerScore || 100);
            ghost.set('realm', snapData.realm || 1);
            ghost.set('data', JSON.stringify(snapData.data)); // 完整Battle数据 stringified
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
                return results[0];
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

            const ghostData = ghosts[0];

            // 解析数据
            let parsedData;
            try {
                parsedData = JSON.parse(ghostData.data);
            } catch (e) {
                console.error('Parse ghost data failed', e);
                return { success: false, message: '对手数据损坏' };
            }

            return {
                success: true,
                opponent: {
                    rank: opponentRank,
                    ghost: ghostData,
                    battleData: parsedData
                }
            };

        } catch (error) {
            console.error('Find opponent error:', error);
            // Handle 101 (Table missing)
            if (error.code === 101) return { success: false, message: '暂无对手数据 (101)' };
            return { success: false, error };
        }
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

    /**
     * 汇报战斗结果
     * @param {boolean} isWin 
     * @param {Object} opponentRankData 
     */
    async reportMatchResult(isWin, opponentRankData) {
        if (!this.currentRankData) await this.syncRank();

        if (!this.currentRankData) return; // Sync failed

        const myRating = this.currentRankData.score || 1000;
        const oppRating = opponentRankData ? (opponentRankData.score || 1000) : 1000;

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

        await myQuery.save();

        // Sync local
        this.currentRankData.score = calcRes.newRating;
        this.currentRankData.wins = wins;

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
