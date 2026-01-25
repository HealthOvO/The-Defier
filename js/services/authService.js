/**
 * The Defier - Bmob Auth Service
 */

const AuthService = {
    isInitialized: false,
    currentUser: null,

    init() {
        if (typeof Bmob === 'undefined') {
            console.error('Bmob SDK not loaded');
            return;
        }

        // Initialize Bmob with Secret Key and API Security Code
        // User provided Secret Key: 259e1a51585d4437
        // API Safe Code: 1234567891011121
        Bmob.initialize("259e1a51585d4437", "1234567891011121");
        this.isInitialized = true;

        // Check current user
        this.currentUser = Bmob.User.current();
        console.log('Bmob Initialized. Current User:', this.currentUser);
    },

    getCurrentUser() {
        if (typeof Bmob === 'undefined') return null;
        if (!this.isInitialized) this.init();
        return this.isInitialized ? Bmob.User.current() : null;
    },

    isLoggedIn() {
        return !!this.getCurrentUser();
    },

    async register(username, password) {
        if (!this.isInitialized) this.init();
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
        if (!this.isInitialized) this.init();
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
        Bmob.User.logout();
        this.currentUser = null;
    },

    // Cloud Save Methods
    // Cloud Save Methods - Multi Slot Support
    // Data structure: { "slots": [data0, data1, data2, data3], "lastUpdated": timestamp }

    async saveCloudData(gameData, slotIndex = 0) {
        if (!this.isLoggedIn()) return { success: false, message: '未登录' };
        if (slotIndex < 0 || slotIndex > 3) return { success: false, message: '非法存档位' };

        try {
            const user = Bmob.User.current();
            const query = Bmob.Query('_User');

            // First, fetch current data to preserve other slots
            // Optimization: If we trust local state, we might not need to fetch, 
            // but for safety (multi-device), fetch first is better.
            const userData = await query.get(user.objectId);
            let currentSlots = [null, null, null, null];

            if (userData && userData.gameData) {
                try {
                    const parsed = JSON.parse(userData.gameData);
                    if (Array.isArray(parsed.slots)) {
                        currentSlots = parsed.slots;
                    } else if (parsed.version) {
                        // Legacy: single object found, migrate to slot 0
                        currentSlots[0] = parsed; // Keep old data in slot 0
                    }
                } catch (e) { console.error('Parse error', e); }
            }

            // Update specific slot
            currentSlots[slotIndex] = gameData;

            // Save back wrapped structure
            const storageObj = {
                slots: currentSlots,
                updatedAt: new Date().getTime()
            };

            query.set('id', user.objectId);
            query.set('gameData', JSON.stringify(storageObj));
            query.set('saveTime', new Date().getTime());

            const result = await query.save();
            console.log(`Cloud save to slot ${slotIndex} success`);
            return { success: true, result: result };
        } catch (error) {
            console.error('Cloud save error:', error);
            return { success: false, error: error };
        }
    },

    async getCloudData() {
        if (!this.isLoggedIn()) return { success: false, message: '未登录' };

        try {
            const user = Bmob.User.current();
            const query = Bmob.Query('_User');
            const userData = await query.get(user.objectId);

            if (userData && userData.gameData) {
                try {
                    const parsed = JSON.parse(userData.gameData);

                    // New Format
                    if (Array.isArray(parsed.slots)) {
                        return { success: true, slots: parsed.slots, serverTime: userData.saveTime };
                    }

                    // Legacy Format (Single Object)
                    if (parsed.version || parsed.player) {
                        // Return as Slot 0
                        return {
                            success: true,
                            slots: [parsed, null, null, null],
                            serverTime: userData.saveTime,
                            isLegacy: true
                        };
                    }
                } catch (e) {
                    return { success: false, message: '存档数据损坏' };
                }
            }
            // No data implies 4 empty slots
            return { success: true, slots: [null, null, null, null], isEmpty: true };
        } catch (error) {
            console.error('Get cloud data error:', error);
            return { success: false, error: error };
        }
    }
};

// Auto init
// if (typeof Bmob !== 'undefined') AuthService.init();
