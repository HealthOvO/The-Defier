export const SESSION_STORAGE_KEY = 'theDefierServerSession';
export const BackendClient = {
  provider: 'server',
  initError: null,
  cloudEnabled: false,
  currentUser: null,
  NETWORK_RETRY: 2,
  REQUEST_TIMEOUT_MS: 12000,
  getRootConfig() {
    const root = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {}));
    if (!root.__THE_DEFIER_CONFIG__ || typeof root.__THE_DEFIER_CONFIG__ !== 'object') {
      return {};
    }
    return root.__THE_DEFIER_CONFIG__;
  },
  getSelectedProvider() {
    return 'server';
  },
  getServerConfig() {
    const rootConfig = this.getRootConfig();
    let config = null;
    if (rootConfig && rootConfig.server && typeof rootConfig.server === 'object') {
      config = {
        ...rootConfig.server
      };
    }
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('theDefierServerConfig');
        if (raw) {
          const localConfig = JSON.parse(raw);
          if (localConfig && typeof localConfig === 'object') {
            config = {
              ...(config || {}),
              ...localConfig
            };
          }
        }
      } catch (error) {
        console.warn('Invalid theDefierServerConfig in localStorage');
      }
    }
    if (!config || typeof config !== 'object') return null;
    const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim().replace(/\/+$/, '') : '';
    if (!baseUrl) return null;
    return {
      baseUrl,
      authPathPrefix: typeof config.authPathPrefix === 'string' ? config.authPathPrefix.trim() : '/api/auth',
      savePathPrefix: typeof config.savePathPrefix === 'string' ? config.savePathPrefix.trim() : '/api/saves',
      userPathPrefix: typeof config.userPathPrefix === 'string' ? config.userPathPrefix.trim() : '/api/user',
      ghostPathPrefix: typeof config.ghostPathPrefix === 'string' ? config.ghostPathPrefix.trim() : '/api/ghosts',
      pvpPathPrefix: typeof config.pvpPathPrefix === 'string' ? config.pvpPathPrefix.trim() : '/api/pvp'
    };
  },
  cloneData(data) {
    if (data === undefined || data === null) return null;
    try {
      return JSON.parse(JSON.stringify(data));
    } catch (error) {
      if (Array.isArray(data)) return [...data];
      if (typeof data === 'object') return {
        ...data
      };
      return data;
    }
  },
  getRuntimeCrypto() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto) return globalThis.crypto;
    if (typeof window !== 'undefined' && window.crypto) return window.crypto;
    return null;
  },
  createIntegritySalt() {
    const cryptoObj = this.getRuntimeCrypto();
    const prefix = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
    if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') return `session-${prefix}`;
    const bytes = new Uint8Array(8);
    cryptoObj.getRandomValues(bytes);
    const random = Array.from(bytes).map(value => value.toString(16).padStart(2, '0')).join('');
    return `session-${prefix}-${random}`;
  },
  bytesToHex(bytes) {
    return Array.from(bytes || []).map(value => value.toString(16).padStart(2, '0')).join('');
  },
  async signSessionPayload(dataStr, salt, token) {
    const cryptoObj = this.getRuntimeCrypto();
    const Encoder = typeof TextEncoder !== 'undefined' ? TextEncoder : null;
    if (!cryptoObj || !cryptoObj.subtle || !Encoder || !token) return '';
    const encoder = new Encoder();
    const key = await cryptoObj.subtle.importKey(
      'raw',
      encoder.encode(String(token)),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const message = `session-v1\n${salt}\n${String(dataStr)}`;
    const signature = await cryptoObj.subtle.sign('HMAC', key, encoder.encode(message));
    return this.bytesToHex(new Uint8Array(signature));
  },
  async createSessionIntegrityFields(data) {
    const session = this.loadServerSession();
    if (!session || !session.token) return {};
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    const salt = this.createIntegritySalt();
    const signature = await this.signSessionPayload(dataStr, salt, session.token);
    if (!signature) return {};
    return {
      salt,
      signature,
      signatureMode: 'session'
    };
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
    return await Promise.race([Promise.resolve().then(task), new Promise((_, reject) => {
      setTimeout(() => reject(this.createError('network-timeout')), timeoutMs);
    })]);
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
        await new Promise(resolve => setTimeout(resolve, 300 * (i + 1)));
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
      return {
        success: false,
        message: this.initError
      };
    }
    const session = this.loadServerSession();
    this.provider = 'server';
    this.cloudEnabled = true;
    this.currentUser = session && session.user ? session.user : null;
    return {
      success: true,
      provider: this.provider,
      currentUser: this.currentUser
    };
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
  async requestServer(path, {
    method = 'GET',
    data,
    auth = true
  } = {}) {
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
      return {
        success: false,
        message: this.initError || '云服务未就绪'
      };
    }
    try {
      const result = await this.requestServer(`${this.getServerConfig().authPathPrefix}/register`, {
        method: 'POST',
        auth: false,
        data: {
          username,
          password
        }
      });
      const user = this.normalizeUser(result && result.user ? result.user : result);
      const token = result && (result.token || result.sessionToken || user && user.sessionToken) ? result.token || result.sessionToken || user.sessionToken : '';
      if (!user) return {
        success: false,
        message: '服务器未返回用户信息'
      };
      this.currentUser = user;
      this.persistServerSession({
        token,
        user
      });
      return {
        success: true,
        user
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || '注册失败',
        error
      };
    }
  },
  async login(username, password) {
    if (!this.ensureReady()) {
      return {
        success: false,
        message: this.initError || '云服务未就绪'
      };
    }
    try {
      const result = await this.requestServer(`${this.getServerConfig().authPathPrefix}/login`, {
        method: 'POST',
        auth: false,
        data: {
          username,
          password
        }
      });
      const user = this.normalizeUser(result && result.user ? result.user : result);
      const token = result && (result.token || result.sessionToken || user && user.sessionToken) ? result.token || result.sessionToken || user.sessionToken : '';
      if (!user) return {
        success: false,
        message: '服务器未返回用户信息'
      };
      this.currentUser = user;
      this.persistServerSession({
        token,
        user
      });
      return {
        success: true,
        user
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || '登录失败',
        error
      };
    }
  },
  async logout() {
    this.clearServerSession();
    this.currentUser = null;
  },
  async saveCloudData(gameData, slotIndex = 0) {
    const slot = Number(slotIndex);
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    try {
      const payload = this.cloneData(gameData);
      const saveTime = Number.isFinite(payload && payload.timestamp) ? payload.timestamp : Date.now();
      const integrity = await this.createSessionIntegrityFields(payload);
      const result = await this.requestServer(this.getServerConfig().savePathPrefix, {
        method: 'POST',
        data: {
          slotIndex: slot,
          saveData: payload,
          saveTime,
          ...integrity
        }
      });
      const serverSaveTime = Number(result && result.saveTime);
      return {
        success: true,
        skipped: !!(result && result.skipped),
        saveTime: Number.isFinite(serverSaveTime) ? serverSaveTime : saveTime,
        message: result && result.message ? result.message : undefined
      };
    } catch (error) {
      return {
        success: false,
        error,
        message: error.message || '云存档保存失败'
      };
    }
  },
  async generateSignature() {
    // Do not keep server HMAC secrets in the browser bundle.
    // Server-side anti-cheat must rely on authoritative validation rules.
    return '';
  },
  async getCloudData() {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    try {
      const result = await this.requestServer(this.getServerConfig().savePathPrefix, {
        method: 'GET'
      });
      const slots = [null, null, null, null];
      let maxTime = 0;
      if (result && Array.isArray(result.data)) {
        result.data.forEach(item => {
          const idx = item.slotIndex;
          if (idx >= 0 && idx <= 3) {
            let dataToUse = item.saveData;
            if (typeof dataToUse === 'string') {
              try {
                dataToUse = JSON.parse(dataToUse);
              } catch (e) {}
            }
            slots[idx] = this.cloneData(dataToUse);
            if (item.saveTime > maxTime) maxTime = item.saveTime;
          }
        });
      }
      const fallbackIsEmpty = slots.every(slot => slot === null);
      return {
        success: true,
        slots: slots,
        serverTime: maxTime || Date.now(),
        isEmpty: typeof result?.isEmpty === 'boolean' ? result.isEmpty : fallbackIsEmpty
      };
    } catch (error) {
      return {
        success: false,
        error,
        message: error.message || '云存档读取失败'
      };
    }
  },
  async saveGlobalData(data) {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    try {
      const payload = this.cloneData(data);
      const globalUpdatedAt = Number.isFinite(payload && payload.updatedAt) ? payload.updatedAt : Date.now();
      const integrity = await this.createSessionIntegrityFields(payload);
      const result = await this.requestServer(`${this.getServerConfig().userPathPrefix}/global`, {
        method: 'POST',
        data: {
          globalData: payload,
          globalUpdatedAt,
          ...integrity
        }
      });
      const serverUpdatedAt = Number(result && result.globalUpdatedAt);
      return {
        success: true,
        skipped: !!(result && result.skipped),
        globalUpdatedAt: Number.isFinite(serverUpdatedAt) ? serverUpdatedAt : globalUpdatedAt,
        message: result && result.message ? result.message : undefined
      };
    } catch (error) {
      return {
        success: false,
        error,
        message: error.message || '全局数据保存失败'
      };
    }
  },
  async getGlobalData() {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    try {
      const result = await this.requestServer(`${this.getServerConfig().userPathPrefix}/global`, {
        method: 'GET'
      });
      return {
        success: true,
        data: result && Object.prototype.hasOwnProperty.call(result, 'data') ? result.data : result
      };
    } catch (error) {
      return {
        success: false,
        error,
        message: error.message || '全局数据读取失败'
      };
    }
  },
  buildGhostPayload(player) {
    const safeDeck = Array.isArray(player && player.deck) ? player.deck.slice(0, 60).map(card => ({
      id: card && card.id ? card.id : 'unknown',
      upgraded: !!(card && card.upgraded),
      cost: Number.isFinite(card && card.cost) ? card.cost : undefined,
      element: card && card.element ? card.element : undefined
    })) : [];
    return {
      name: player && player.characterId ? player.characterId : 'unknown',
      maxHp: Math.max(1, Math.floor(Number(player && player.maxHp) || 100)),
      hp: Math.max(1, Math.floor(Number(player && player.currentHp) || 100)),
      updatedAt: Date.now(),
      deck: safeDeck,
      treasures: this.cloneData(player && player.treasures ? player.treasures : []),
      laws: this.cloneData(player && player.collectedLaws ? player.collectedLaws : []),
      fateRing: this.cloneData(player && player.fateRing ? player.fateRing : null),
      legacy: this.cloneData(player && player.legacyRunMission ? player.legacyRunMission : null)
    };
  },
  async uploadGhostData(player, realm) {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    try {
      const ghostData = this.buildGhostPayload(player);
      const uploadTime = Number.isFinite(ghostData.updatedAt) ? ghostData.updatedAt : Date.now();
      const integrity = await this.createSessionIntegrityFields(ghostData);
      const result = await this.requestServer(`${this.getServerConfig().ghostPathPrefix}/current`, {
        method: 'POST',
        data: {
          realm: Math.max(1, Math.floor(Number(realm) || 1)),
          ghostData,
          uploadTime,
          ...integrity
        }
      });
      const serverUploadTime = Number(result && result.uploadTime);
      return {
        success: true,
        skipped: !!(result && result.skipped),
        uploadTime: Number.isFinite(serverUploadTime) ? serverUploadTime : uploadTime,
        message: result && result.message ? result.message : undefined
      };
    } catch (error) {
      return {
        success: false,
        error,
        message: error.message || '残影上传失败'
      };
    }
  },
  async fetchRandomGhost(currentRealm) {
    if (!this.ensureReady()) return {
      success: false,
      message: this.initError || '云服务未就绪'
    };
    try {
      const result = await this.requestServer(`${this.getServerConfig().ghostPathPrefix}/random?realm=${encodeURIComponent(Math.max(1, Math.floor(Number(currentRealm) || 1)))}`, {
        method: 'GET',
        auth: !!this.getCurrentUser()
      });
      // 适配服务端格式
      if (result && result.success === false) {
        return result;
      }
      return {
        success: true,
        data: result && result.data ? result.data : result
      };
    } catch (error) {
      return {
        success: false,
        error,
        message: error.message || '残影读取失败'
      };
    }
  },
  async getPvpRank() {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    try {
      const result = await this.requestServer(`${this.getServerConfig().pvpPathPrefix}/rank`, {
        method: 'GET'
      });
      return {
        success: true,
        rank: result && result.rank ? result.rank : null,
        wallet: result && result.wallet ? result.wallet : null,
        economy: result && result.economy ? result.economy : null
      };
    } catch (error) {
      return {
        success: false,
        error,
        message: error.message || 'PVP 段位读取失败'
      };
    }
  },
  async getPvpLeaderboard(limit = 20) {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    try {
      const safeLimit = Math.max(1, Math.min(50, Math.floor(Number(limit) || 20)));
      const result = await this.requestServer(`${this.getServerConfig().pvpPathPrefix}/leaderboard?limit=${encodeURIComponent(safeLimit)}`, {
        method: 'GET'
      });
      return {
        success: true,
        data: result && Array.isArray(result.data) ? result.data : []
      };
    } catch (error) {
      return {
        success: false,
        error,
        message: error.message || 'PVP 排行榜读取失败'
      };
    }
  },
  async uploadPvpDefenseSnapshot(snapshot = {}) {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    try {
      let battleData = snapshot.battleData !== undefined ? snapshot.battleData : snapshot.data;
      if (typeof battleData === 'string') {
        try {
          battleData = JSON.parse(battleData);
        } catch (error) {}
      }
      const payload = this.cloneData(battleData || {});
      const defenseRequest = {
        realm: Math.max(1, Math.floor(Number(snapshot.realm) || 1)),
        powerScore: Math.max(0, Math.floor(Number(snapshot.powerScore) || 100)),
        battleData: payload,
        config: this.cloneData(snapshot.config || {}),
        snapshotTime: Number.isFinite(Number(snapshot.saveTime || snapshot.snapshotTime)) ? Number(snapshot.saveTime || snapshot.snapshotTime) : Date.now()
      };
      const integrity = await this.createSessionIntegrityFields(defenseRequest);
      const result = await this.requestServer(`${this.getServerConfig().pvpPathPrefix}/defense`, {
        method: 'POST',
        data: {
          ...defenseRequest,
          ...integrity
        }
      });
      return {
        success: true,
        snapshot: result && result.snapshot ? result.snapshot : null,
        rank: result && result.rank ? result.rank : null,
        saveTime: result && result.saveTime ? result.saveTime : undefined
      };
    } catch (error) {
      return {
        success: false,
        error,
        message: error.message || 'PVP 防御上传失败'
      };
    }
  },
  async getPvpDefenseSnapshot() {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    try {
      const result = await this.requestServer(`${this.getServerConfig().pvpPathPrefix}/defense/me`, {
        method: 'GET'
      });
      if (result && result.success === false) return result;
      return {
        success: true,
        snapshot: result && result.snapshot ? result.snapshot : null
      };
    } catch (error) {
      return {
        success: false,
        error,
        message: error.message || 'PVP 防御读取失败'
      };
    }
  },
  async findPvpOpponent(options = {}) {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    try {
      const matchRequest = {
        myScore: Math.max(0, Math.floor(Number(options.myScore) || 1000)),
        myRealm: Math.max(1, Math.floor(Number(options.myRealm) || 1)),
        preferredRankId: options.preferredRankId || '',
        allowPractice: options.allowPractice !== false
      };
      const integrity = await this.createSessionIntegrityFields(matchRequest);
      const result = await this.requestServer(`${this.getServerConfig().pvpPathPrefix}/match`, {
        method: 'POST',
        data: {
          ...matchRequest,
          ...integrity
        }
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: 'PVP 匹配返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        message: error.message || 'PVP 匹配失败'
      };
    }
  },
  async reportPvpMatchResult(report = {}) {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    try {
      const signedReport = {
        matchTicket: String(report.matchTicket || ''),
        didWin: !!report.didWin
      };
      const integrity = await this.createSessionIntegrityFields(signedReport);
      const result = await this.requestServer(`${this.getServerConfig().pvpPathPrefix}/match/result`, {
        method: 'POST',
        data: {
          report: signedReport,
          ...integrity
        }
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: 'PVP 结算返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        message: error.message || 'PVP 结算失败'
      };
    }
  },
  async getPvpEconomy() {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    try {
      const result = await this.requestServer(`${this.getServerConfig().pvpPathPrefix}/economy`, {
        method: 'GET'
      });
      return {
        success: true,
        economy: result && result.economy ? result.economy : null,
        wallet: result && result.wallet ? result.wallet : null
      };
    } catch (error) {
      return {
        success: false,
        error,
        message: error.message || 'PVP 钱包读取失败'
      };
    }
  },
  async purchasePvpShopItem(item = {}) {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    try {
      const purchase = {
        itemId: String(item.itemId || item.id || ''),
      };
      const integrity = await this.createSessionIntegrityFields(purchase);
      const result = await this.requestServer(`${this.getServerConfig().pvpPathPrefix}/shop/purchase`, {
        method: 'POST',
        data: {
          ...purchase,
          ...integrity
        }
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: 'PVP 商店返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        message: error.message || 'PVP 商店购买失败'
      };
    }
  }
};
