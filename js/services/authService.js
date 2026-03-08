/**
 * The Defier - Bmob Auth Service
 */

const AuthService = {
    isInitialized: false,
    currentUser: null,
    saveQueueBySlot: {},
    latestSaveTimeBySlot: {},
    NETWORK_RETRY: 2,
    REQUEST_TIMEOUT_MS: 12000,

    getRuntimeConfig() {
        let config = null;

        // 优先读取宿主注入配置
        if (typeof window !== 'undefined') {
            const rootConfig = window.__THE_DEFIER_CONFIG__;
            if (rootConfig && rootConfig.bmob) {
                config = rootConfig.bmob;
            }
        }

        // 回退读取 localStorage （为了兼容旧版逻辑或独立测试）
        if (!config && typeof localStorage !== 'undefined') {
            try {
                const raw = localStorage.getItem('theDefierBmobConfig');
                if (raw) config = JSON.parse(raw);
            } catch (e) {
                console.warn('Invalid theDefierBmobConfig in localStorage');
            }
        }

        if (!config || typeof config !== 'object') return null;

        const secretKey = typeof config.secretKey === 'string' ? config.secretKey.trim() : '';
        const securityCode = typeof config.securityCode === 'string' ? config.securityCode.trim() : '';
        const masterKey = typeof config.masterKey === 'string' ? config.masterKey.trim() : '';

        if (!secretKey || !securityCode) return null;
        return { secretKey, securityCode, masterKey };
    },

    isCloudEnabled() {
        return this.cloudEnabled;
    },

    ensureInitialized() {
        if (this.isInitialized) return true;
        this.init();
        return this.isInitialized;
    },

    init() {
        this.initError = null;
        this.cloudEnabled = false;

        if (typeof Bmob === 'undefined') {
            console.error('Bmob SDK not loaded');
            this.initError = 'Bmob SDK 未加载';
            return;
        }

        const config = this.getRuntimeConfig();
        if (!config) {
            console.warn('Bmob config missing. Cloud auth disabled.');
            this.initError = '云存档配置缺失';
            this.isInitialized = false;
            this.currentUser = null;
            return;
        }

        // 安全基线：浏览器端禁止使用 Master Key，避免高权限泄露
        if (config.masterKey) {
            console.warn('Master key is ignored on client-side for security reasons.');
        }

        try {
            Bmob.initialize(config.secretKey, config.securityCode);
            this.isInitialized = true;
            this.cloudEnabled = true;
        } catch (error) {
            console.error('Bmob initialization failed:', error);
            this.initError = '云存档初始化失败';
            this.isInitialized = false;
            this.currentUser = null;
            return;
        }

        // Check current user
        this.currentUser = Bmob.User.current();
        console.log('Bmob Initialized. Current User:', this.currentUser);
    },

    getCurrentUser() {
        if (typeof Bmob === 'undefined') return null;
        if (!this.ensureInitialized()) return null;
        return this.isInitialized ? Bmob.User.current() : null;
    },

    isLoggedIn() {
        return !!this.getCurrentUser();
    },

    cloneData(data) {
        if (data === undefined || data === null) return null;
        try {
            return JSON.parse(JSON.stringify(data));
        } catch (error) {
            console.warn('cloneData fallback to shallow copy:', error);
            if (Array.isArray(data)) return [...data];
            if (typeof data === 'object') return { ...data };
            return data;
        }
    },

    async runWithTimeout(task, timeoutMs = this.REQUEST_TIMEOUT_MS) {
        return await Promise.race([
            Promise.resolve().then(task),
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error('network-timeout')), timeoutMs);
            })
        ]);
    },

    shouldRetry(error) {
        if (!error) return false;
        const code = error.code;
        const msg = String(error.message || '').toLowerCase();
        if (code === 100 || code === 101 || code === 500) return true;
        if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) return true;
        return false;
    },

    async withRetry(task, retries = this.NETWORK_RETRY) {
        let lastError = null;
        for (let i = 0; i <= retries; i++) {
            try {
                return await task();
            } catch (error) {
                lastError = error;
                if (i === retries || !this.shouldRetry(error)) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, 300 * (i + 1)));
            }
        }
        throw lastError;
    },

    async register(username, password) {
        if (!this.ensureInitialized()) {
            return { success: false, message: this.initError || '云服务未就绪' };
        }
        try {
            const params = {
                username: username,
                password: password
            };
            const response = await Bmob.User.register(params);
            console.log('Register success:', response);
            this.currentUser = Bmob.User.current();
            return { success: true, user: response };
        } catch (error) {
            console.error('Register error:', error);
            // Handle specific error codes if needed
            let msg = '注册失败';
            if (error.code === 202) msg = '用户名已存在';
            return { success: false, message: msg, error: error };
        }
    },

    async login(username, password) {
        if (!this.ensureInitialized()) {
            return { success: false, message: this.initError || '云服务未就绪' };
        }
        try {
            const user = await Bmob.User.login(username, password);
            console.log('Login success:', user);
            this.currentUser = user;
            return { success: true, user: user };
        } catch (error) {
            console.error('Login error:', error);
            let msg = '登录失败';
            if (error.code === 101) msg = '用户名或密码错误';
            return { success: false, message: msg, error: error };
        }
    },

    logout() {
        if (!this.isInitialized || typeof Bmob === 'undefined') {
            this.currentUser = null;
            this.slotSaveQueue.clear();
            if (typeof window !== 'undefined' && window.PVPService && typeof window.PVPService.clearActiveMatch === 'function') {
                window.PVPService.clearActiveMatch();
            }
            return;
        }
        Bmob.User.logout();
        this.currentUser = null;
        this.slotSaveQueue.clear();
        if (typeof window !== 'undefined' && window.PVPService && typeof window.PVPService.clearActiveMatch === 'function') {
            window.PVPService.clearActiveMatch();
        }
    },

    // Cloud Save Methods
    // Cloud Save Methods - Multi Slot Support
    // Data structure: { "slots": [data0, data1, data2, data3], "lastUpdated": timestamp }

    async saveCloudData(gameData, slotIndex = 0) {
        const slot = Number(slotIndex);
        if (!this.isLoggedIn()) return { success: false, message: '未登录' };
        if (!Number.isInteger(slot) || slot < 0 || slot > 3) return { success: false, message: '非法存档位' };

        const previousTask = this.saveQueueBySlot[slot] || Promise.resolve();
        const queuedTask = previousTask
            .catch(() => { })
            .then(async () => {
                try {
                    const user = this.getCurrentUser();
                    if (!user || !user.objectId) return { success: false, message: '登录状态失效' };

                    const payload = this.cloneData(gameData);
                    const saveTime = Number.isFinite(payload && payload.timestamp) ? payload.timestamp : Date.now();
                    if (saveTime < (this.latestSaveTimeBySlot[slot] || 0)) {
                        return { success: true, skipped: true, message: 'stale-save-ignored' };
                    }

                    const query = Bmob.Query('GameSave');
                    query.equalTo('user', '==', user.objectId);
                    query.equalTo('slotIndex', '==', slot);

                    const results = await this.withRetry(
                        () => this.runWithTimeout(() => query.find()),
                        this.NETWORK_RETRY
                    );

                    let saveObj;
                    if (results && results.length > 0) {
                        const latest = results.reduce((acc, item) =>
                            ((item.saveTime || 0) > (acc.saveTime || 0) ? item : acc), results[0]
                        );
                        saveObj = Bmob.Query('GameSave');
                        saveObj.set('id', latest.objectId);
                    } else {
                        saveObj = Bmob.Query('GameSave');
                        const userPointer = Bmob.Pointer('_User');
                        const pointer = userPointer.set(user.objectId);
                        saveObj.set('user', pointer);
                        saveObj.set('slotIndex', slot);
                    }

                    saveObj.set('saveData', payload);
                    saveObj.set('saveTime', saveTime);

                    const result = await this.withRetry(
                        () => this.runWithTimeout(() => saveObj.save()),
                        this.NETWORK_RETRY
                    );
                    this.latestSaveTimeBySlot[slot] = saveTime;
                    console.log(`Cloud save to GameSave table (Slot ${slot}) success`);
                    return { success: true, result: result };
                } catch (error) {
                    console.error('Cloud save error:', error);
                    return { success: false, error: error };
                }
            });

        this.saveQueueBySlot[slot] = queuedTask.finally(() => {
            if (this.saveQueueBySlot[slot] === queuedTask) {
                delete this.saveQueueBySlot[slot];
            }
        });

        return queuedTask;
    },

    async getCloudData() {
        if (!this.ensureInitialized()) {
            return { success: false, message: this.initError || '云服务未就绪' };
        }
        if (!this.isLoggedIn()) return { success: false, message: '未登录' };

        try {
            const user = Bmob.User.current();
            let finalSlots = [null, null, null, null];
            const slotTimes = [0, 0, 0, 0];
            let maxTime = 0;

            console.log('Fetching cloud data...');

            // 1. Fetch New Data (GameSave table)
            try {
                const newQuery = Bmob.Query('GameSave');
                newQuery.equalTo('user', '==', user.objectId);
                const newResults = await this.withRetry(
                    () => this.runWithTimeout(() => newQuery.find()),
                    this.NETWORK_RETRY
                );

                if (newResults && newResults.length > 0) {
                    console.log(`Found ${newResults.length} records in GameSave table.`);
                    newResults.forEach(save => {
                        if (save.slotIndex >= 0 && save.slotIndex <= 3) {
                            try {
                                let data = save.saveData;
                                if (typeof data === 'string') data = JSON.parse(data);
                                const saveTime = Number.isFinite(save.saveTime) ? save.saveTime : 0;
                                if (saveTime >= slotTimes[save.slotIndex]) {
                                    finalSlots[save.slotIndex] = this.cloneData(data);
                                    slotTimes[save.slotIndex] = saveTime;
                                }
                                if (saveTime > maxTime) maxTime = saveTime;
                            } catch (e) {
                                console.error(`Error parsing slot ${save.slotIndex}:`, e);
                            }
                        }
                    });
                }
            } catch (e) {
                console.warn('GameSave table fetch failed or empty (normal for first migration):', e);
            }

            // 2. Fetch Legacy Data (_User.gameData)
            // We always check this to fill in any empty slots
            try {
                const userQuery = Bmob.Query('_User');
                const userData = await this.withRetry(
                    () => this.runWithTimeout(() => userQuery.get(user.objectId)),
                    this.NETWORK_RETRY
                );

                if (userData && userData.gameData) {
                    console.log('Found legacy data in _User table.');
                    try {
                        let legacySlots = [null, null, null, null];
                        // Try to parse as JSON first
                        let parsed = userData.gameData;
                        if (typeof parsed === 'string') {
                            try {
                                parsed = JSON.parse(parsed);
                            } catch (e) {
                                // If parse fails, it might be raw object or invalid
                                console.warn('Legacy data parse warning:', e);
                            }
                        }

                        // Check structure
                        if (parsed) {
                            if (Array.isArray(parsed.slots)) {
                                legacySlots = parsed.slots;
                            } else if (parsed.version || parsed.player || parsed.stage) {
                                // Assume it's a single save object from older version
                                // Default to slot 0 if slot 0 is empty
                                legacySlots[0] = parsed;
                            }
                        }

                        // Merge: Fill empty slots with legacy data
                        for (let i = 0; i < 4; i++) {
                            // Only use legacy if we don't have a new save in this slot
                            if (finalSlots[i] === null && legacySlots[i] !== null) {
                                console.log(`Restoring slot ${i} from legacy data.`);
                                finalSlots[i] = this.cloneData(legacySlots[i]);

                                // Update timestamp references
                                const legacyTime = userData.saveTime || 0;
                                if (legacyTime > maxTime) maxTime = legacyTime;
                            }
                        }
                    } catch (e) {
                        console.error('Legacy data processing error:', e);
                    }
                }
            } catch (e) {
                console.warn('Legacy _User fetch failed:', e);
            }

            // Check if we have any data
            const isEmpty = finalSlots.every(s => s === null);

            return {
                success: true,
                slots: finalSlots,
                serverTime: maxTime,
                isEmpty: isEmpty
            };

        } catch (error) {
            console.error('Get cloud data error:', error);
            return { success: false, error: error };
        }
    }
    ,

    // Global Data Methods (Achievements, Stats, Settings)
    // Stored in _User table 'globalData' column (Object)

    async saveGlobalData(data) {
        if (!this.ensureInitialized()) {
            return { success: false, message: this.initError || '云服务未就绪' };
        }
        if (!this.isLoggedIn()) return { success: false, message: '未登录' };

        try {
            const user = Bmob.User.current();
            const query = Bmob.Query('_User');
            // Update _User directly
            query.set('id', user.objectId);

            // Validate data size/structure if needed
            // Bmob Object column has size limits, but for achievements it should be fine

            query.set('globalData', data);

            await query.save();
            console.log('Global data saved to cloud.');
            return { success: true };
        } catch (error) {
            console.error('Save global data error:', error);
            return { success: false, error: error };
        }
    },

    async getGlobalData() {
        if (!this.ensureInitialized()) {
            return { success: false, message: this.initError || '云服务未就绪' };
        }
        if (!this.isLoggedIn()) return { success: false, message: '未登录' };

        try {
            const user = Bmob.User.current();
            const query = Bmob.Query('_User');
            const userData = await query.get(user.objectId);

            if (userData && userData.globalData) {
                return { success: true, data: userData.globalData };
            }
            return { success: true, data: null }; // No data found (new user)
        } catch (error) {
            console.error('Get global data error:', error);
            return { success: false, error: error };
        }
    },

    // ==========================================
    // --- P1 机制：异步 PVP 残影 (Ghost Data) ---
    // ==========================================

    /**
     * 上传玩家残影数据 (Ghost)
     * @param {Object} player - 当前玩家对象
     * @param {number} realm - 当前抵达的层数/境界
     */
    async uploadGhostData(player, realm) {
        if (!this.ensureInitialized()) return { success: false, message: '云服务未就绪' };
        if (!this.isLoggedIn()) return { success: false, message: '未登录' };

        try {
            const user = Bmob.User.current();
            if (!user || !user.objectId) return { success: false, message: '登录状态失效' };

            const safeDeck = Array.isArray(player && player.deck)
                ? player.deck.slice(0, 60).map(card => ({
                    id: card && card.id ? card.id : 'unknown',
                    upgraded: !!(card && card.upgraded),
                    cost: Number.isFinite(card && card.cost) ? card.cost : undefined,
                    element: card && card.element ? card.element : undefined
                }))
                : [];

            // 剥离循环引用，抽取核心战斗属性
            const ghostPayload = {
                name: player && player.characterId ? player.characterId : 'unknown',
                maxHp: Math.max(1, Math.floor(Number(player && player.maxHp) || 100)),
                hp: Math.max(1, Math.floor(Number(player && player.currentHp) || 100)),
                deck: safeDeck,
                treasures: this.cloneData(player && player.treasures ? player.treasures : []),
                laws: this.cloneData(player && player.collectedLaws ? player.collectedLaws : []),
                fateRing: this.cloneData(player && player.fateRing ? player.fateRing : null),
                legacy: this.cloneData(player && player.legacyRunMission ? player.legacyRunMission : null)
            };

            const query = Bmob.Query('GameGhost');
            const userPointer = Bmob.Pointer('_User');
            query.set('user', userPointer.set(user.objectId));
            query.set('userId', user.objectId);
            query.set('userName', user.username || '神秘修仙者');
            query.set('realm', Math.max(1, Math.floor(Number(realm) || 1)));
            query.set('ghostData', ghostPayload);
            query.set('uploadTime', Date.now());

            await query.save();
            console.log('Ghost data uploaded successfully.');
            return { success: true };
        } catch (error) {
            console.error('Upload ghost data error:', error);
            return { success: false, error: error };
        }
    },

    /**
     * 随机拉取一条当前层数附近的残影数据
     * @param {number} currentRealm - 玩家当前层数
     */
    async fetchRandomGhost(currentRealm) {
        if (!this.ensureInitialized()) return { success: false, message: '云服务未就绪' };

        try {
            const query = Bmob.Query('GameGhost');
            const numericRealm = Math.max(1, Math.floor(Number(currentRealm) || 1));
            // 获取前后2层的Ghost数据
            query.equalTo('realm', '>=', Math.max(1, numericRealm - 2));
            query.equalTo('realm', '<=', numericRealm + 2);
            // 避免拉到自己的Ghost
            if (this.isLoggedIn()) {
                const currentUser = Bmob.User.current();
                if (currentUser && currentUser.objectId) {
                    query.equalTo('userId', '!=', currentUser.objectId);
                }
            }
            // 随机拉取几条来避免每次打同一个人
            query.limit(10);
            const results = await query.find();

            if (results && results.length > 0) {
                // 随机选一个
                const randomIdx = Math.floor(Math.random() * results.length);
                const ghost = results[randomIdx];
                return { success: true, data: ghost };
            }

            return { success: false, message: '未找到合适的对手残影' };
        } catch (error) {
            console.error('Fetch ghost data error:', error);
            return { success: false, error: error };
        }
    }
};

// Auto init
// if (typeof Bmob !== 'undefined') AuthService.init();
