/**
 * The Defier - Bmob Auth Service
 */

const AuthService = {
    isInitialized: false,
    currentUser: null,
    cloudEnabled: false,
    initError: null,

    getRuntimeConfig() {
        let config = null;

        // 优先读取宿主注入配置
        if (typeof window !== 'undefined') {
            const rootConfig = window.__THE_DEFIER_CONFIG__;
            if (rootConfig && rootConfig.bmob) {
                config = rootConfig.bmob;
            } else if (window.__BMOB_CONFIG__) {
                config = window.__BMOB_CONFIG__;
            }
        }

        // 次优先：读取本地持久化配置（便于本地调试）
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

    // 兼容不同 Bmob SDK 查询参数签名
    queryEquals(query, key, value) {
        try {
            query.equalTo(key, '==', value);
        } catch (e) {
            query.equalTo(key, value);
        }
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
            return;
        }
        Bmob.User.logout();
        this.currentUser = null;
    },

    // Cloud Save Methods
    // Cloud Save Methods - Multi Slot Support
    // Data structure: { "slots": [data0, data1, data2, data3], "lastUpdated": timestamp }

    async saveCloudData(gameData, slotIndex) {
        if (!this.ensureInitialized()) {
            return { success: false, message: this.initError || '云服务未就绪' };
        }
        if (!this.isLoggedIn()) return { success: false, message: '未登录' };
        if (slotIndex === undefined || slotIndex === null) return { success: false, message: '未指定存档位' };
        if (slotIndex < 0 || slotIndex > 3) return { success: false, message: '非法存档位' };

        try {
            const user = Bmob.User.current();
            const query = Bmob.Query('GameSave');

            // Pointer query: find save for this user and slot
            this.queryEquals(query, 'user', user.objectId);
            this.queryEquals(query, 'slotIndex', slotIndex);

            const results = await query.find();

            let saveObj;
            if (results && results.length > 0) {
                // Update existing
                // FIX: Do NOT reuse 'query' object as it retains filter conditions which breaks update
                saveObj = Bmob.Query('GameSave');
                saveObj.set('id', results[0].objectId);
            } else {
                // Create new
                saveObj = Bmob.Query('GameSave');
                const userPointer = Bmob.Pointer('_User');
                const poiID = userPointer.set(user.objectId);
                saveObj.set('user', poiID);
                saveObj.set('slotIndex', slotIndex);
            }

            // Save data
            saveObj.set('saveData', gameData);
            saveObj.set('saveTime', Date.now());

            const result = await saveObj.save();
            console.log(`Cloud save to GameSave table (Slot ${slotIndex}) success`);
            return { success: true, result: result };
        } catch (error) {
            console.error('Cloud save error:', error);
            // Handle table not exist error (usually auto-created, but just in case)
            return { success: false, error: error };
        }
    },

    async getCloudData() {
        if (!this.ensureInitialized()) {
            return { success: false, message: this.initError || '云服务未就绪' };
        }
        if (!this.isLoggedIn()) return { success: false, message: '未登录' };

        try {
            const user = Bmob.User.current();
            let finalSlots = [null, null, null, null];
            let maxTime = 0;

            console.log('Fetching cloud data...');

            // 1. Fetch New Data (GameSave table)
            try {
                const newQuery = Bmob.Query('GameSave');
                this.queryEquals(newQuery, 'user', user.objectId);
                const newResults = await newQuery.find();

                if (newResults && newResults.length > 0) {
                    console.log(`Found ${newResults.length} records in GameSave table.`);
                    newResults.forEach(save => {
                        if (save.slotIndex >= 0 && save.slotIndex <= 3) {
                            try {
                                let data = save.saveData;
                                if (typeof data === 'string') data = JSON.parse(data);
                                finalSlots[save.slotIndex] = data;
                                if (save.saveTime > maxTime) maxTime = save.saveTime;
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
                const userData = await userQuery.get(user.objectId);

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
                                finalSlots[i] = legacySlots[i];

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
    }
};

// Auto init
// if (typeof Bmob !== 'undefined') AuthService.init();
