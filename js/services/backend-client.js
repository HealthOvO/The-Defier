(function (global) {
    const SESSION_STORAGE_KEY = 'theDefierServerSession';

    const BackendClient = {
        provider: 'server',
        initError: null,
        cloudEnabled: false,
        currentUser: null,
        NETWORK_RETRY: 2,
        REQUEST_TIMEOUT_MS: 12000,

        getRootConfig() {
            if (!global || !global.__THE_DEFIER_CONFIG__ || typeof global.__THE_DEFIER_CONFIG__ !== 'object') {
                return {};
            }
            return global.__THE_DEFIER_CONFIG__;
        },

        getSelectedProvider() {
            return 'server';
        },

        getServerConfig() {
            const rootConfig = this.getRootConfig();
            let config = null;

            if (rootConfig && rootConfig.server && typeof rootConfig.server === 'object') {
                config = rootConfig.server;
            }

            if (!config && typeof localStorage !== 'undefined') {
                try {
                    const raw = localStorage.getItem('theDefierServerConfig');
                    if (raw) config = JSON.parse(raw);
                } catch (error) {
                    console.warn('Invalid theDefierServerConfig in localStorage');
                }
            }

            if (!config || typeof config !== 'object') return null;

            const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim().replace(/\/+$/, '') : '';
            if (!baseUrl) return null;

            return {
                baseUrl,
                authPathPrefix: typeof config.authPathPrefix === 'string' ? config.authPathPrefix.trim() : '/auth',
                savePathPrefix: typeof config.savePathPrefix === 'string' ? config.savePathPrefix.trim() : '/saves',
                userPathPrefix: typeof config.userPathPrefix === 'string' ? config.userPathPrefix.trim() : '/user',
                ghostPathPrefix: typeof config.ghostPathPrefix === 'string' ? config.ghostPathPrefix.trim() : '/ghosts'
            };
        },

        cloneData(data) {
            if (data === undefined || data === null) return null;
            try {
                return JSON.parse(JSON.stringify(data));
            } catch (error) {
                if (Array.isArray(data)) return [...data];
                if (typeof data === 'object') return { ...data };
                return data;
            }
        },

        createError(message, code = null, extra = null) {
            const error = new Error(message || 'backend-error');
            if (code !== null && code !== undefined) error.code = code;
            if (extra && typeof extra === 'object') Object.assign(error, extra);
            return error;
        },

        normalizeUser(user) {
            if (!user || typeof user !== 'object') return null;
            const objectId = user.objectId || user.id || user.userId || null;
            if (!objectId) return null;
            return {
                objectId,
                username: user.username || user.name || user.nickname || '道友',
                sessionToken: user.sessionToken || user.token || null
            };
        },

        loadServerSession() {
            if (typeof localStorage === 'undefined') return null;
            try {
                const raw = localStorage.getItem(SESSION_STORAGE_KEY);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object') return null;
                return {
                    token: typeof parsed.token === 'string' ? parsed.token : '',
                    user: this.normalizeUser(parsed.user)
                };
            } catch (error) {
                console.warn('Invalid server session in localStorage');
                return null;
            }
        },

        persistServerSession(session) {
            if (typeof localStorage === 'undefined') return;
            if (!session || !session.token || !session.user) {
                localStorage.removeItem(SESSION_STORAGE_KEY);
                return;
            }
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
                token: session.token,
                user: session.user
            }));
        },

        clearServerSession() {
            this.persistServerSession(null);
            this.currentUser = null;
        },

        async runWithTimeout(task, timeoutMs = this.REQUEST_TIMEOUT_MS) {
            return await Promise.race([
                Promise.resolve().then(task),
                new Promise((_, reject) => {
                    setTimeout(() => reject(this.createError('network-timeout')), timeoutMs);
                })
            ]);
        },

        shouldRetry(error) {
            if (!error) return false;
            const code = Number(error.code);
            const message = String(error.message || '').toLowerCase();
            if ([100, 101, 408, 429, 500, 502, 503, 504].includes(code)) return true;
            return message.includes('timeout') || message.includes('network') || message.includes('fetch');
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
                    await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
                }
            }
            throw lastError;
        },

        init() {
            this.initError = null;
            this.cloudEnabled = false;

            const config = this.getServerConfig();
            if (!config || !config.baseUrl) {
                console.warn('Server config missing. Cloud features disabled.');
                this.initError = '服务器配置缺失';
                this.isInitialized = false;
                this.currentUser = null;
                return { success: false, message: this.initError };
            }

            const session = this.loadServerSession();
            this.provider = 'server';
            this.cloudEnabled = true;
            this.currentUser = session && session.user ? session.user : null;
            return { success: true, provider: this.provider, currentUser: this.currentUser };
        },

        ensureReady() {
            if (this.cloudEnabled) return true;
            const result = this.init();
            return !!(result && result.success);
        },

        getCurrentUser() {
            if (!this.ensureReady()) return null;
            const session = this.loadServerSession();
            this.currentUser = session && session.user ? session.user : null;
            return this.currentUser;
        },

        async requestServer(path, { method = 'GET', data, auth = true } = {}) {
            const config = this.getServerConfig();
            if (!config) throw this.createError('服务器地址配置缺失');

            const headers = {
                'Content-Type': 'application/json'
            };
            const session = this.loadServerSession();
            if (auth && session && session.token) {
                headers.Authorization = `Bearer ${session.token}`;
            }

            const response = await this.withRetry(() => this.runWithTimeout(async () => {
                const res = await fetch(`${config.baseUrl}${path}`, {
                    method,
                    headers,
                    body: data === undefined ? undefined : JSON.stringify(data)
                });
                return res;
            }));

            let payload = null;
            try {
                payload = await response.json();
            } catch (error) {
                payload = null;
            }

            if (response && response.ok) {
                return payload;
            } else {
                const errMsg = payload && payload.message ? payload.message : `HTTP ${response ? response.status : 'unknown'}`;
                throw this.createError(errMsg, response ? response.status : 0);
            }
        },

        async register(username, password) {
            if (!this.ensureReady()) {
                return { success: false, message: this.initError || '云服务未就绪' };
            }

            try {
                const result = await this.requestServer(`${this.getServerConfig().authPathPrefix}/register`, {
                    method: 'POST',
                    auth: false,
                    data: { username, password }
                });
                const user = this.normalizeUser(result && result.user ? result.user : result);
                const token = result && (result.token || result.sessionToken || (user && user.sessionToken)) ? (result.token || result.sessionToken || user.sessionToken) : '';
                if (!user) return { success: false, message: '服务器未返回用户信息' };
                this.currentUser = user;
                this.persistServerSession({ token, user });
                return { success: true, user };
            } catch (error) {
                return { success: false, message: error.message || '注册失败', error };
            }
        },

        async login(username, password) {
            if (!this.ensureReady()) {
                return { success: false, message: this.initError || '云服务未就绪' };
            }

            try {
                const result = await this.requestServer(`${this.getServerConfig().authPathPrefix}/login`, {
                    method: 'POST',
                    auth: false,
                    data: { username, password }
                });
                const user = this.normalizeUser(result && result.user ? result.user : result);
                const token = result && (result.token || result.sessionToken || (user && user.sessionToken)) ? (result.token || result.sessionToken || user.sessionToken) : '';
                if (!user) return { success: false, message: '服务器未返回用户信息' };
                this.currentUser = user;
                this.persistServerSession({ token, user });
                return { success: true, user };
            } catch (error) {
                return { success: false, message: error.message || '登录失败', error };
            }
        },

        async logout() {
            this.clearServerSession();
            this.currentUser = null;
        },

        async saveCloudData(gameData, slotIndex = 0) {
            const slot = Number(slotIndex);
            const user = this.getCurrentUser();
            if (!user) return { success: false, message: '未登录' };

            try {
                const payload = this.cloneData(gameData);
                const saveTime = Number.isFinite(payload && payload.timestamp) ? payload.timestamp : Date.now();
                await this.requestServer(this.getServerConfig().savePathPrefix, {
                    method: 'POST',
                    data: { slotIndex: slot, saveData: payload, saveTime }
                });
                return { success: true, saveTime };
            } catch (error) {
                return { success: false, error, message: error.message || '云存档保存失败' };
            }
        },

        async getCloudData() {
            const user = this.getCurrentUser();
            if (!user) return { success: false, message: '未登录' };

            try {
                const result = await this.requestServer(this.getServerConfig().savePathPrefix, { method: 'GET' });
                const slots = [null, null, null, null];
                let maxTime = 0;
                
                if (result && Array.isArray(result.data)) {
                    result.data.forEach(item => {
                        const idx = item.slotIndex;
                        if (idx >= 0 && idx <= 3) {
                            let dataToUse = item.saveData;
                            if (typeof dataToUse === 'string') {
                                try { dataToUse = JSON.parse(dataToUse); } catch(e) {}
                            }
                            slots[idx] = this.cloneData(dataToUse);
                            if (item.saveTime > maxTime) maxTime = item.saveTime;
                        }
                    });
                }
                
                const fallbackIsEmpty = slots.every((slot) => slot === null);
                return {
                    success: true,
                    slots: slots,
                    serverTime: maxTime || Date.now(),
                    isEmpty: typeof result?.isEmpty === 'boolean' ? result.isEmpty : fallbackIsEmpty
                };
            } catch (error) {
                return { success: false, error, message: error.message || '云存档读取失败' };
            }
        },

        async saveGlobalData(data) {
            const user = this.getCurrentUser();
            if (!user) return { success: false, message: '未登录' };

            try {
                await this.requestServer(`${this.getServerConfig().userPathPrefix}/global`, {
                    method: 'POST',
                    data: { globalData: data }
                });
                return { success: true };
            } catch (error) {
                return { success: false, error, message: error.message || '全局数据保存失败' };
            }
        },

        async getGlobalData() {
            const user = this.getCurrentUser();
            if (!user) return { success: false, message: '未登录' };

            try {
                const result = await this.requestServer(`${this.getServerConfig().userPathPrefix}/global`, {
                    method: 'GET'
                });
                return { success: true, data: result && Object.prototype.hasOwnProperty.call(result, 'data') ? result.data : result };
            } catch (error) {
                return { success: false, error, message: error.message || '全局数据读取失败' };
            }
        },

        buildGhostPayload(player) {
            const safeDeck = Array.isArray(player && player.deck)
                ? player.deck.slice(0, 60).map((card) => ({
                    id: card && card.id ? card.id : 'unknown',
                    upgraded: !!(card && card.upgraded),
                    cost: Number.isFinite(card && card.cost) ? card.cost : undefined,
                    element: card && card.element ? card.element : undefined
                }))
                : [];

            return {
                name: player && player.characterId ? player.characterId : 'unknown',
                maxHp: Math.max(1, Math.floor(Number(player && player.maxHp) || 100)),
                hp: Math.max(1, Math.floor(Number(player && player.currentHp) || 100)),
                deck: safeDeck,
                treasures: this.cloneData(player && player.treasures ? player.treasures : []),
                laws: this.cloneData(player && player.collectedLaws ? player.collectedLaws : []),
                fateRing: this.cloneData(player && player.fateRing ? player.fateRing : null),
                legacy: this.cloneData(player && player.legacyRunMission ? player.legacyRunMission : null)
            };
        },

        async uploadGhostData(player, realm) {
            const user = this.getCurrentUser();
            if (!user) return { success: false, message: '未登录' };

            try {
                await this.requestServer(`${this.getServerConfig().ghostPathPrefix}/current`, {
                    method: 'POST',
                    data: {
                        realm: Math.max(1, Math.floor(Number(realm) || 1)),
                        ghostData: this.buildGhostPayload(player)
                    }
                });
                return { success: true };
            } catch (error) {
                return { success: false, error, message: error.message || '残影上传失败' };
            }
        },

        async fetchRandomGhost(currentRealm) {
            if (!this.ensureReady()) return { success: false, message: this.initError || '云服务未就绪' };

            try {
                const result = await this.requestServer(`${this.getServerConfig().ghostPathPrefix}/random?realm=${encodeURIComponent(Math.max(1, Math.floor(Number(currentRealm) || 1)))}`, {
                    method: 'GET',
                    auth: !!this.getCurrentUser()
                });
                // 适配服务端格式
                if (result && result.success === false) {
                    return result;
                }
                return { success: true, data: result && result.data ? result.data : result };
            } catch (error) {
                return { success: false, error, message: error.message || '残影读取失败' };
            }
        }
    };

    global.BackendClient = BackendClient;
    global.TheDefierBackendClient = BackendClient;
})(typeof window !== 'undefined' ? window : globalThis);
