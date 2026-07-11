export const SESSION_STORAGE_KEY = 'theDefierServerSession';
export const CLOUD_STATE_PROTOCOL_VERSION = 'cloud-state-v2';
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
      pvpPathPrefix: typeof config.pvpPathPrefix === 'string' ? config.pvpPathPrefix.trim() : '/api/pvp',
      progressionPathPrefix: typeof config.progressionPathPrefix === 'string' ? config.progressionPathPrefix.trim() : '/api/progression',
      seasonOpsPathPrefix: typeof config.seasonOpsPathPrefix === 'string' ? config.seasonOpsPathPrefix.trim() : '/api/season-ops'
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
  createMutationId() {
    const cryptoObj = this.getRuntimeCrypto();
    if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
      return `mutation-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e12).toString(36)}`;
    }
    const bytes = new Uint8Array(12);
    cryptoObj.getRandomValues(bytes);
    const random = Array.from(bytes).map(value => value.toString(16).padStart(2, '0')).join('');
    return `mutation-${Date.now().toString(36)}-${random}`;
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
  async createSessionIntegrityFields(data, options = {}) {
    const session = this.loadServerSession();
    const sessionToken = typeof options.sessionToken === 'string' && options.sessionToken
      ? options.sessionToken
      : session && session.token;
    if (!sessionToken) return {};
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    const salt = this.createIntegritySalt();
    const signature = await this.signSessionPayload(dataStr, salt, sessionToken);
    if (!signature) return {};
    return {
      salt,
      signature,
      signatureMode: 'session'
    };
  },
  normalizeRevisionId(value) {
    const normalized = String(value || '').trim();
    return normalized || null;
  },
  normalizeRevisionMetadata(source) {
    if (!source || typeof source !== 'object') return null;
    const revisionId = this.normalizeRevisionId(source.revisionId);
    const revisionNumber = Number(source.revisionNumber);
    const contentHash = typeof source.contentHash === 'string' && source.contentHash ? source.contentHash : null;
    const headUpdatedAt = Number(source.headUpdatedAt);
    const metadata = {};
    if (revisionId) metadata.revisionId = revisionId;
    if (Number.isFinite(revisionNumber)) metadata.revisionNumber = revisionNumber;
    if (contentHash) metadata.contentHash = contentHash;
    if (Number.isFinite(headUpdatedAt)) metadata.headUpdatedAt = headUpdatedAt;
    return Object.keys(metadata).length > 0 ? metadata : null;
  },
  parseStructuredPayloadData(rawValue) {
    if (typeof rawValue !== 'string') return this.cloneData(rawValue);
    try {
      return JSON.parse(rawValue);
    } catch (error) {
      return rawValue;
    }
  },
  normalizeSlotEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const slotIndex = Number(entry.slotIndex);
    const saveTime = Number(entry.saveTime);
    const saveData = this.parseStructuredPayloadData(
      Object.prototype.hasOwnProperty.call(entry, 'saveData') ? entry.saveData : entry.data
    );
    const revision = this.normalizeRevisionMetadata(entry);
    const normalized = {
      slotIndex: Number.isInteger(slotIndex) ? slotIndex : null,
      saveData,
      data: this.cloneData(saveData)
    };
    if (Number.isFinite(saveTime)) normalized.saveTime = saveTime;
    if (revision) Object.assign(normalized, revision);
    if (typeof entry.operation === 'string') normalized.operation = entry.operation;
    if (typeof entry.parentRevisionId === 'string') normalized.parentRevisionId = entry.parentRevisionId;
    if (typeof entry.sourceRevisionId === 'string') normalized.sourceRevisionId = entry.sourceRevisionId;
    if (Number.isFinite(Number(entry.clientUpdatedAt))) normalized.clientUpdatedAt = Number(entry.clientUpdatedAt);
    if (Number.isFinite(Number(entry.createdAt))) normalized.createdAt = Number(entry.createdAt);
    if (typeof entry.isHead === 'boolean') normalized.isHead = entry.isHead;
    return normalized;
  },
  normalizeGlobalEntry(entry) {
    if (entry === undefined || entry === null) return null;
    const hasRevisionMetadata = !!this.normalizeRevisionMetadata(entry);
    let dataSource = entry;
    if (entry && typeof entry === 'object') {
      if (Object.prototype.hasOwnProperty.call(entry, 'globalData')) {
        dataSource = entry.globalData;
      } else if (Object.prototype.hasOwnProperty.call(entry, 'data')) {
        dataSource = entry.data;
      } else if (hasRevisionMetadata) {
        dataSource = {};
      }
    }
    const data = this.parseStructuredPayloadData(dataSource);
    const globalUpdatedAt = Number(entry && entry.globalUpdatedAt);
    const revision = this.normalizeRevisionMetadata(entry);
    const normalized = {
      data,
      globalData: this.cloneData(data)
    };
    if (Number.isFinite(globalUpdatedAt)) normalized.globalUpdatedAt = globalUpdatedAt;
    if (revision) Object.assign(normalized, revision);
    if (typeof entry.operation === 'string') normalized.operation = entry.operation;
    if (typeof entry.parentRevisionId === 'string') normalized.parentRevisionId = entry.parentRevisionId;
    if (typeof entry.sourceRevisionId === 'string') normalized.sourceRevisionId = entry.sourceRevisionId;
    if (Number.isFinite(Number(entry.clientUpdatedAt))) normalized.clientUpdatedAt = Number(entry.clientUpdatedAt);
    if (Number.isFinite(Number(entry.createdAt))) normalized.createdAt = Number(entry.createdAt);
    if (typeof entry.isHead === 'boolean') normalized.isHead = entry.isHead;
    return normalized;
  },
  normalizeCloudStateConflict(error, entryType = 'slot', fallbackMessage = '云状态写入冲突') {
    const payload = error && error.payload && typeof error.payload === 'object' ? error.payload : null;
    const currentRaw = payload && payload.current && typeof payload.current === 'object' ? payload.current : null;
    const current = entryType === 'global'
      ? this.normalizeGlobalEntry(currentRaw)
      : this.normalizeSlotEntry(currentRaw);
    return {
      success: false,
      conflict: true,
      reason: payload && payload.reason ? payload.reason : error && error.reason ? error.reason : `${entryType}_conflict`,
      current: current || this.cloneData(currentRaw),
      error,
      message: error && error.message ? error.message : fallbackMessage
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
    auth = true,
    authToken = ''
  } = {}) {
    const config = this.getServerConfig();
    if (!config) throw this.createError('服务器地址配置缺失');
    const headers = {
      'Content-Type': 'application/json'
    };
    const session = this.loadServerSession();
    const requestAuthToken = typeof authToken === 'string' && authToken ? authToken : session && session.token;
    if (auth && requestAuthToken) {
      headers.Authorization = `Bearer ${requestAuthToken}`;
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
      const extra = payload && typeof payload === 'object'
        ? {
          reason: payload.reason,
          status: payload.status,
          friendlySeries: payload.friendlySeries,
          payload
        }
        : null;
      throw this.createError(errMsg, response ? response.status : 0, extra);
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
  async saveCloudData(gameData, slotIndex = 0, options = {}) {
    const slot = Number(slotIndex);
    const sessionSnapshot = this.captureSignedSessionSnapshot(options, '登录账号已变化，请刷新云存档后重试');
    if (!sessionSnapshot || !sessionSnapshot.success) return sessionSnapshot;
    try {
      const payload = this.cloneData(gameData);
      const saveTime = Number.isFinite(payload && payload.timestamp) ? payload.timestamp : Date.now();
      const baseRevisionId = Object.prototype.hasOwnProperty.call(options || {}, 'baseRevisionId')
        ? this.normalizeRevisionId(options.baseRevisionId)
        : null;
      const mutationId = typeof options?.mutationId === 'string' && options.mutationId
        ? options.mutationId
        : this.createMutationId();
      const signedPayload = {
        protocolVersion: CLOUD_STATE_PROTOCOL_VERSION,
        slotIndex: slot,
        baseRevisionId,
        mutationId,
        saveData: payload,
        saveTime
      };
      const integrityResult = await this.createRequiredSessionIntegrityFields(
        signedPayload,
        sessionSnapshot.sessionToken,
        '当前环境不支持云存档签名，请刷新后重试',
        'cloud_state_signature_required'
      );
      if (!integrityResult.success) return integrityResult;
      const result = await this.requestServer(this.getServerConfig().savePathPrefix, {
        method: 'POST',
        authToken: sessionSnapshot.sessionToken,
        data: {
          ...signedPayload,
          ...integrityResult.integrity
        }
      });
      const revision = this.normalizeRevisionMetadata(result);
      const serverSaveTime = Number(result && result.saveTime);
      const response = {
        success: true,
        skipped: !!(result && result.skipped),
        saveTime: Number.isFinite(serverSaveTime) ? serverSaveTime : saveTime,
        message: result && result.message ? result.message : undefined
      };
      if (revision) Object.assign(response, revision);
      return response;
    } catch (error) {
      if (Number(error && error.code) === 409) {
        return this.normalizeCloudStateConflict(error, 'slot', '云存档保存冲突');
      }
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
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
      const slotEntries = [null, null, null, null];
      const revisions = {};
      let maxTime = 0;
      if (result && Array.isArray(result.data)) {
        result.data.forEach(item => {
          const normalized = this.normalizeSlotEntry(item);
          const idx = normalized && Number.isInteger(normalized.slotIndex) ? normalized.slotIndex : Number(item && item.slotIndex);
          if (idx >= 0 && idx <= 3) {
            slots[idx] = this.cloneData(normalized ? normalized.saveData : null);
            slotEntries[idx] = normalized;
            if (normalized) {
              const revision = this.normalizeRevisionMetadata(normalized);
              if (revision) revisions[idx] = revision;
              if (Number.isFinite(normalized.saveTime) && normalized.saveTime > maxTime) maxTime = normalized.saveTime;
            }
          }
        });
      }
      const fallbackIsEmpty = slots.every(slot => slot === null);
      return {
        success: true,
        slots: slots,
        slotEntries,
        revisions,
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
  async saveGlobalData(data, options = {}) {
    const sessionSnapshot = this.captureSignedSessionSnapshot(options, '登录账号已变化，请刷新全局云状态后重试');
    if (!sessionSnapshot || !sessionSnapshot.success) return sessionSnapshot;
    try {
      const payload = this.cloneData(data);
      const globalUpdatedAt = Number.isFinite(payload && payload.updatedAt) ? payload.updatedAt : Date.now();
      const baseRevisionId = Object.prototype.hasOwnProperty.call(options || {}, 'baseRevisionId')
        ? this.normalizeRevisionId(options.baseRevisionId)
        : null;
      const mutationId = typeof options?.mutationId === 'string' && options.mutationId
        ? options.mutationId
        : this.createMutationId();
      const signedPayload = {
        protocolVersion: CLOUD_STATE_PROTOCOL_VERSION,
        baseRevisionId,
        mutationId,
        globalData: payload,
        globalUpdatedAt
      };
      const integrityResult = await this.createRequiredSessionIntegrityFields(
        signedPayload,
        sessionSnapshot.sessionToken,
        '当前环境不支持全局云状态签名，请刷新后重试',
        'cloud_state_signature_required'
      );
      if (!integrityResult.success) return integrityResult;
      const result = await this.requestServer(`${this.getServerConfig().userPathPrefix}/global`, {
        method: 'POST',
        authToken: sessionSnapshot.sessionToken,
        data: {
          ...signedPayload,
          ...integrityResult.integrity
        }
      });
      const revision = this.normalizeRevisionMetadata(result);
      const serverUpdatedAt = Number(result && result.globalUpdatedAt);
      const response = {
        success: true,
        skipped: !!(result && result.skipped),
        globalUpdatedAt: Number.isFinite(serverUpdatedAt) ? serverUpdatedAt : globalUpdatedAt,
        message: result && result.message ? result.message : undefined
      };
      if (revision) Object.assign(response, revision);
      return response;
    } catch (error) {
      if (Number(error && error.code) === 409) {
        return this.normalizeCloudStateConflict(error, 'global', '全局云状态保存冲突');
      }
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
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
      const normalized = this.normalizeGlobalEntry(result);
      const revision = this.normalizeRevisionMetadata(normalized || result);
      return {
        success: true,
        data: normalized ? normalized.data : result && Object.prototype.hasOwnProperty.call(result, 'data') ? result.data : result,
        globalUpdatedAt: normalized && Number.isFinite(normalized.globalUpdatedAt) ? normalized.globalUpdatedAt : undefined,
        revision,
        ...(revision || {})
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '全局数据读取失败'
      };
    }
  },
  async getCloudSaveHistory(slotIndex = 0, options = {}) {
    const slot = Number(slotIndex);
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const safeLimit = Object.prototype.hasOwnProperty.call(options || {}, 'limit')
      ? Math.max(1, Math.min(20, Math.floor(Number(options.limit) || 20)))
      : null;
    const query = new URLSearchParams();
    if (safeLimit !== null) query.set('limit', String(safeLimit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    try {
      const result = await this.requestServer(`${this.getServerConfig().savePathPrefix}/slots/${encodeURIComponent(slot)}/history${suffix}`, {
        method: 'GET'
      });
      const historySource = result && (result.revisions || result.history || result.entries);
      const history = Array.isArray(historySource)
        ? historySource.map(entry => this.normalizeSlotEntry(entry)).filter(Boolean)
        : [];
      return {
        ...(result && typeof result === 'object' ? result : {}),
        success: true,
        slotIndex: slot,
        revisions: history,
        history,
        entries: history
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '云存档历史读取失败'
      };
    }
  },
  async restoreCloudSaveRevision(slotIndex = 0, sourceRevisionId = '', options = {}) {
    const slot = Number(slotIndex);
    const safeSourceRevisionId = this.normalizeRevisionId(sourceRevisionId);
    if (!safeSourceRevisionId) return {
      success: false,
      message: '云存档历史版本缺失'
    };
    const sessionSnapshot = this.captureSignedSessionSnapshot(options, '登录账号已变化，请刷新云存档后重试');
    if (!sessionSnapshot || !sessionSnapshot.success) return sessionSnapshot;
    try {
      const baseRevisionId = Object.prototype.hasOwnProperty.call(options || {}, 'baseRevisionId')
        ? this.normalizeRevisionId(options.baseRevisionId)
        : null;
      const mutationId = typeof options?.mutationId === 'string' && options.mutationId
        ? options.mutationId
        : this.createMutationId();
      const signedPayload = {
        protocolVersion: CLOUD_STATE_PROTOCOL_VERSION,
        slotIndex: slot,
        baseRevisionId,
        sourceRevisionId: safeSourceRevisionId,
        mutationId
      };
      const integrityResult = await this.createRequiredSessionIntegrityFields(
        signedPayload,
        sessionSnapshot.sessionToken,
        '当前环境不支持云存档签名，请刷新后重试',
        'cloud_state_signature_required'
      );
      if (!integrityResult.success) return integrityResult;
      const result = await this.requestServer(`${this.getServerConfig().savePathPrefix}/slots/${encodeURIComponent(slot)}/restore`, {
        method: 'POST',
        authToken: sessionSnapshot.sessionToken,
        data: {
          ...signedPayload,
          ...integrityResult.integrity
        }
      });
      const normalized = this.normalizeSlotEntry(result && typeof result === 'object' ? result : null);
      return {
        ...(result && typeof result === 'object' ? result : {}),
        success: true,
        ...(normalized || {})
      };
    } catch (error) {
      if (Number(error && error.code) === 409) {
        return this.normalizeCloudStateConflict(error, 'slot', '云存档恢复冲突');
      }
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '云存档恢复失败'
      };
    }
  },
  async getGlobalDataHistory(options = {}) {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const safeLimit = Object.prototype.hasOwnProperty.call(options || {}, 'limit')
      ? Math.max(1, Math.min(20, Math.floor(Number(options.limit) || 20)))
      : null;
    const query = new URLSearchParams();
    if (safeLimit !== null) query.set('limit', String(safeLimit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    try {
      const result = await this.requestServer(`${this.getServerConfig().userPathPrefix}/global/history${suffix}`, {
        method: 'GET'
      });
      const historySource = result && (result.revisions || result.history || result.entries);
      const history = Array.isArray(historySource)
        ? historySource.map(entry => this.normalizeGlobalEntry(entry)).filter(Boolean)
        : [];
      return {
        ...(result && typeof result === 'object' ? result : {}),
        success: true,
        revisions: history,
        history,
        entries: history
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '全局云状态历史读取失败'
      };
    }
  },
  async restoreGlobalDataRevision(sourceRevisionId = '', options = {}) {
    const safeSourceRevisionId = this.normalizeRevisionId(sourceRevisionId);
    if (!safeSourceRevisionId) return {
      success: false,
      message: '全局云状态历史版本缺失'
    };
    const sessionSnapshot = this.captureSignedSessionSnapshot(options, '登录账号已变化，请刷新全局云状态后重试');
    if (!sessionSnapshot || !sessionSnapshot.success) return sessionSnapshot;
    try {
      const baseRevisionId = Object.prototype.hasOwnProperty.call(options || {}, 'baseRevisionId')
        ? this.normalizeRevisionId(options.baseRevisionId)
        : null;
      const mutationId = typeof options?.mutationId === 'string' && options.mutationId
        ? options.mutationId
        : this.createMutationId();
      const signedPayload = {
        protocolVersion: CLOUD_STATE_PROTOCOL_VERSION,
        baseRevisionId,
        sourceRevisionId: safeSourceRevisionId,
        mutationId
      };
      const integrityResult = await this.createRequiredSessionIntegrityFields(
        signedPayload,
        sessionSnapshot.sessionToken,
        '当前环境不支持全局云状态签名，请刷新后重试',
        'cloud_state_signature_required'
      );
      if (!integrityResult.success) return integrityResult;
      const result = await this.requestServer(`${this.getServerConfig().userPathPrefix}/global/restore`, {
        method: 'POST',
        authToken: sessionSnapshot.sessionToken,
        data: {
          ...signedPayload,
          ...integrityResult.integrity
        }
      });
      const normalized = this.normalizeGlobalEntry(result && typeof result === 'object' ? result : null);
      const revision = this.normalizeRevisionMetadata(normalized || result);
      return {
        ...(result && typeof result === 'object' ? result : {}),
        success: true,
        ...(normalized || {}),
        revision,
        ...(revision || {})
      };
    } catch (error) {
      if (Number(error && error.code) === 409) {
        return this.normalizeCloudStateConflict(error, 'global', '全局云状态恢复冲突');
      }
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '全局云状态恢复失败'
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
  getProgressionPathPrefix() {
    const config = this.getServerConfig();
    const base = config && typeof config.progressionPathPrefix === 'string' && config.progressionPathPrefix.trim()
      ? config.progressionPathPrefix.trim().replace(/\/+$/, '')
      : '/api/progression';
    return base;
  },
  getSeasonOpsPathPrefix() {
    const config = this.getServerConfig();
    return config && typeof config.seasonOpsPathPrefix === 'string' && config.seasonOpsPathPrefix.trim()
      ? config.seasonOpsPathPrefix.trim().replace(/\/+$/, '')
      : '/api/season-ops';
  },
  cloneUnsignedRequestPayload(payload) {
    const cloned = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? this.cloneData(payload) || {}
      : {};
    delete cloned.salt;
    delete cloned.signature;
    delete cloned.signatureMode;
    return cloned;
  },
  captureSignedSessionSnapshot(options = {}, failureMessage = '登录账号已变化，请刷新云存档后重试') {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const expectedUserId = String(options && options.expectedUserId || '').trim();
    const currentUserId = String(user && (user.objectId || user.id || user.userId) || '').trim();
    const boundUserId = expectedUserId || currentUserId;
    const capturedSession = this.loadServerSession();
    const capturedSessionUserId = String(capturedSession && capturedSession.user && (capturedSession.user.objectId || capturedSession.user.id || capturedSession.user.userId) || '').trim();
    const sessionToken = capturedSession && capturedSession.token || '';
    if (!boundUserId || (expectedUserId && currentUserId !== expectedUserId) || !capturedSession || !sessionToken || capturedSessionUserId !== boundUserId || currentUserId !== boundUserId) {
      return {
        success: false,
        reason: 'cloud_state_account_changed',
        message: failureMessage
      };
    }
    return {
      success: true,
      sessionToken
    };
  },
  captureProgressionSessionSnapshot(options = {}, failureMessage = '登录账号已变化，请刷新长期进度后重试') {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const expectedUserId = String(options && options.expectedUserId || '').trim();
    const currentUserId = String(user && (user.objectId || user.id || user.userId) || '').trim();
    const boundUserId = expectedUserId || currentUserId;
    const capturedSession = this.loadServerSession();
    const capturedSessionUserId = String(capturedSession && capturedSession.user && (capturedSession.user.objectId || capturedSession.user.id || capturedSession.user.userId) || '').trim();
    const sessionToken = capturedSession && capturedSession.token || '';
    if (!boundUserId || (expectedUserId && currentUserId !== expectedUserId) || !capturedSession || !sessionToken || capturedSessionUserId !== boundUserId || currentUserId !== boundUserId) {
      return {
        success: false,
        reason: 'progression_account_changed',
        message: failureMessage
      };
    }
    return {
      success: true,
      sessionToken
    };
  },
  async createRequiredSessionIntegrityFields(data, sessionToken, failureMessage = '当前环境不支持验证跑图签名，请刷新后重试', failureReason = 'verified_run_signature_required') {
    const integrity = await this.createSessionIntegrityFields(data, {
      sessionToken
    });
    if (!integrity || integrity.signatureMode !== 'session' || !integrity.salt || !integrity.signature) {
      return {
        success: false,
        reason: failureReason,
        message: failureMessage
      };
    }
    return {
      success: true,
      integrity
    };
  },
  async getProgressionStatus() {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    try {
      const result = await this.requestServer(`${this.getProgressionPathPrefix()}/status`, {
        method: 'GET'
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '长期进度状态返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '长期进度状态读取失败'
      };
    }
  },
  async submitProgressionEvents(events = [], options = {}) {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const batch = Array.isArray(events) ? this.cloneData(events) : [];
    if (batch.length === 0) return {
      success: false,
      message: '长期进度事件批次不能为空'
    };
    if (batch.length > 20) return {
      success: false,
      message: '长期进度事件批次超过上限'
    };
    try {
      const expectedUserId = String(options && options.expectedUserId || '').trim();
      const currentUserId = String(user && (user.objectId || user.id || user.userId) || '').trim();
      const capturedSession = this.loadServerSession();
      const capturedSessionUserId = String(capturedSession && capturedSession.user && (capturedSession.user.objectId || capturedSession.user.id || capturedSession.user.userId) || '').trim();
      if (expectedUserId && (currentUserId !== expectedUserId || !capturedSession || !capturedSession.token || capturedSessionUserId !== expectedUserId)) {
        return {
          success: false,
          reason: 'progression_account_changed',
          message: '登录账号已变化，长期进度队列将保留到原账号下次登录'
        };
      }
      const signedPayload = { events: batch };
      const capturedToken = capturedSession && capturedSession.token || '';
      const integrity = await this.createSessionIntegrityFields(signedPayload, {
        sessionToken: capturedToken
      });
      const result = await this.requestServer(`${this.getProgressionPathPrefix()}/events`, {
        method: 'POST',
        authToken: capturedToken,
        data: {
          ...signedPayload,
          ...integrity
        }
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '长期进度事件上报返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '长期进度事件上报失败'
      };
    }
  },
  async startVerifiedProgressionRun(payload = {}, options = {}) {
    const sessionSnapshot = this.captureProgressionSessionSnapshot(options, '登录账号已变化，请刷新验证跑图后重试');
    if (!sessionSnapshot || !sessionSnapshot.success) return sessionSnapshot;
    try {
      const signedPayload = this.cloneUnsignedRequestPayload(payload);
      const integrityResult = await this.createRequiredSessionIntegrityFields(signedPayload, sessionSnapshot.sessionToken);
      if (!integrityResult.success) return integrityResult;
      const result = await this.requestServer(`${this.getProgressionPathPrefix()}/verified-runs/tickets`, {
        method: 'POST',
        authToken: sessionSnapshot.sessionToken,
        data: {
          ...signedPayload,
          ...integrityResult.integrity
        }
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '验证跑图发车返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '验证跑图发车失败'
      };
    }
  },
  async submitVerifiedRunCheckpoint(ticketId = '', payload = {}, options = {}) {
    const safeTicketId = String(ticketId || '').trim();
    if (!safeTicketId) return {
      success: false,
      message: '验证跑图 ticket 缺失'
    };
    const sessionSnapshot = this.captureProgressionSessionSnapshot(options, '登录账号已变化，请刷新验证跑图后重试');
    if (!sessionSnapshot || !sessionSnapshot.success) return sessionSnapshot;
    try {
      const signedPayload = this.cloneUnsignedRequestPayload(payload);
      const payloadTicketId = String(signedPayload && signedPayload.ticketId || '').trim();
      if (payloadTicketId && payloadTicketId !== safeTicketId) {
        return {
          success: false,
          reason: 'verified_run_ticket_mismatch',
          message: '验证跑图 ticket 不一致，请刷新后重试'
        };
      }
      if (!payloadTicketId) {
        signedPayload.ticketId = safeTicketId;
      }
      const integrityResult = await this.createRequiredSessionIntegrityFields(signedPayload, sessionSnapshot.sessionToken);
      if (!integrityResult.success) return integrityResult;
      const result = await this.requestServer(`${this.getProgressionPathPrefix()}/verified-runs/${encodeURIComponent(safeTicketId)}/checkpoints`, {
        method: 'POST',
        authToken: sessionSnapshot.sessionToken,
        data: {
          ...signedPayload,
          ...integrityResult.integrity
        }
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '验证跑图检查点返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '验证跑图检查点上报失败'
      };
    }
  },
  async settleVerifiedProgressionRun(ticketId = '', payload = {}, options = {}) {
    const safeTicketId = String(ticketId || '').trim();
    if (!safeTicketId) return {
      success: false,
      message: '验证跑图 ticket 缺失'
    };
    const sessionSnapshot = this.captureProgressionSessionSnapshot(options, '登录账号已变化，请刷新验证跑图后重试');
    if (!sessionSnapshot || !sessionSnapshot.success) return sessionSnapshot;
    try {
      const signedPayload = this.cloneUnsignedRequestPayload(payload);
      const payloadTicketId = String(signedPayload && signedPayload.ticketId || '').trim();
      if (payloadTicketId && payloadTicketId !== safeTicketId) {
        return {
          success: false,
          reason: 'verified_run_ticket_mismatch',
          message: '验证跑图 ticket 不一致，请刷新后重试'
        };
      }
      if (!payloadTicketId) {
        signedPayload.ticketId = safeTicketId;
      }
      const integrityResult = await this.createRequiredSessionIntegrityFields(signedPayload, sessionSnapshot.sessionToken);
      if (!integrityResult.success) return integrityResult;
      const result = await this.requestServer(`${this.getProgressionPathPrefix()}/verified-runs/${encodeURIComponent(safeTicketId)}/settle`, {
        method: 'POST',
        authToken: sessionSnapshot.sessionToken,
        data: {
          ...signedPayload,
          ...integrityResult.integrity
        }
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '验证跑图结算返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '验证跑图结算失败'
      };
    }
  },
  async claimProgressionReward(objectiveId = '', cycleId = '') {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const safeObjectiveId = String(objectiveId || '').trim();
    const safeCycleId = String(cycleId || '').trim();
    if (!safeObjectiveId) return {
      success: false,
      message: '长期进度目标缺失'
    };
    if (!safeCycleId) return {
      success: false,
      message: '长期进度周期缺失'
    };
    try {
      const expectedUserId = String(user && (user.objectId || user.id || user.userId) || '').trim();
      const capturedSession = this.loadServerSession();
      const capturedSessionUserId = String(capturedSession && capturedSession.user && (capturedSession.user.objectId || capturedSession.user.id || capturedSession.user.userId) || '').trim();
      const capturedToken = capturedSession && capturedSession.token || '';
      if (!expectedUserId || !capturedToken || capturedSessionUserId !== expectedUserId) {
        return {
          success: false,
          reason: 'progression_account_changed',
          message: '登录账号已变化，请刷新长期进度后重试'
        };
      }
      const signedPayload = {
        objectiveId: safeObjectiveId,
        cycleId: safeCycleId
      };
      const integrity = await this.createSessionIntegrityFields(signedPayload, {
        sessionToken: capturedToken
      });
      const result = await this.requestServer(`${this.getProgressionPathPrefix()}/rewards/${encodeURIComponent(safeObjectiveId)}/claim`, {
        method: 'POST',
        authToken: capturedToken,
        data: {
          ...signedPayload,
          ...integrity
        }
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '长期进度奖励领取返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '长期进度奖励领取失败'
      };
    }
  },
  async getProgressionLedger(options = {}) {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const safeLimit = options && Object.prototype.hasOwnProperty.call(options, 'limit')
      ? Math.max(1, Math.min(50, Math.floor(Number(options.limit) || 20)))
      : null;
    const rawCursor = options && Object.prototype.hasOwnProperty.call(options, 'cursor')
      ? String(options.cursor || '').trim()
      : '';
    const safeCursor = /^\d+:[A-Za-z0-9._:-]{8,128}$/.test(rawCursor) ? rawCursor : '';
    const query = new URLSearchParams();
    if (safeLimit !== null) query.set('limit', String(safeLimit));
    if (safeCursor) query.set('cursor', safeCursor);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    try {
      const result = await this.requestServer(`${this.getProgressionPathPrefix()}/ledger${suffix}`, {
        method: 'GET'
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '长期进度账本返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '长期进度账本读取失败'
      };
    }
  },
  getLivePvpPathPrefix() {
    const config = this.getServerConfig();
    const base = config && typeof config.pvpPathPrefix === 'string' && config.pvpPathPrefix.trim()
      ? config.pvpPathPrefix.trim().replace(/\/+$/, '')
      : '/api/pvp';
    return `${base}/live`;
  },
  getLivePvpWebSocketUrl() {
    const config = this.getServerConfig();
    if (!config || !config.baseUrl) return '';
    const wsBaseUrl = String(config.baseUrl).replace(/^http:/, 'ws:').replace(/^https:/, 'wss:').replace(/\/+$/, '');
    return `${wsBaseUrl}${this.getLivePvpPathPrefix()}/ws`;
  },
  encodeLivePvpWebSocketToken(token) {
    const value = String(token || '');
    if (!value) return '';
    try {
      if (typeof TextEncoder !== 'undefined' && typeof btoa === 'function') {
        const bytes = new TextEncoder().encode(value);
        let binary = '';
        bytes.forEach(byte => {
          binary += String.fromCharCode(byte);
        });
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      }
      if (typeof Buffer !== 'undefined') {
        return Buffer.from(value, 'utf8').toString('base64url');
      }
    } catch (error) {
      console.warn('[BackendClient] Failed to encode live PVP WS token', error);
    }
    return '';
  },
  getLivePvpWebSocketProtocols() {
    const session = this.loadServerSession();
    const token = session && session.token ? String(session.token) : '';
    const encodedToken = this.encodeLivePvpWebSocketToken(token);
    return encodedToken ? ['defier-live-v1', `defier-auth.${encodedToken}`] : [];
  },
  connectLivePvpWebSocket(handlers = {}) {
    const url = this.getLivePvpWebSocketUrl();
    const protocols = this.getLivePvpWebSocketProtocols();
    const SocketCtor = typeof WebSocket !== 'undefined' ? WebSocket : null;
    if (!url || !SocketCtor || protocols.length === 0) return null;
    const socket = new SocketCtor(url, protocols);
    if (typeof handlers.onOpen === 'function') {
      socket.addEventListener('open', handlers.onOpen);
    }
    if (typeof handlers.onClose === 'function') {
      socket.addEventListener('close', handlers.onClose);
    }
    if (typeof handlers.onError === 'function') {
      socket.addEventListener('error', handlers.onError);
    }
    if (typeof handlers.onMessage === 'function') {
      socket.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(String(event.data || ''));
          handlers.onMessage(message);
        } catch (error) {
          handlers.onMessage({ type: 'error', reason: 'invalid_ws_payload', message: '实时论道 WS 消息解析失败' });
        }
      });
    }
    return {
      socket,
      send(payload = {}) {
        if (socket.readyState !== SocketCtor.OPEN) return false;
        socket.send(JSON.stringify(payload || {}));
        return true;
      },
      close() {
        socket.close();
        return true;
      }
    };
  },
  async joinLivePvpQueue(options = {}) {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    try {
      const displayName = typeof options.displayName === 'string' ? options.displayName.trim().slice(0, 40) : '';
      const data = {};
      if (displayName) data.displayName = displayName;
      if (options.loadout && typeof options.loadout === 'object' && !Array.isArray(options.loadout)) {
        data.loadout = this.cloneData(options.loadout);
      }
      if (options.connectionHealthProbe && typeof options.connectionHealthProbe === 'object' && !Array.isArray(options.connectionHealthProbe)) {
        data.connectionHealthProbe = this.cloneData(options.connectionHealthProbe);
      }
      if (options.wideMatchConsent === true) {
        data.wideMatchConsent = true;
      }
      if (typeof options.testMatchScope === 'string' && options.testMatchScope.trim()) {
        data.testMatchScope = options.testMatchScope.trim().slice(0, 64);
      }
      if (typeof options.testOpenerSeed === 'string' && options.testOpenerSeed.trim()) {
        data.testOpenerSeed = options.testOpenerSeed.trim().slice(0, 64);
      }
      const result = await this.requestServer(`${this.getLivePvpPathPrefix()}/queue/join`, {
        method: 'POST',
        data
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '实时论道入队返回异常'
      };
    } catch (error) {
      const payload = error && error.payload && typeof error.payload === 'object' ? error.payload : null;
      const connectionHealth = payload && payload.connectionHealth && typeof payload.connectionHealth === 'object'
        ? this.cloneData(payload.connectionHealth)
        : error && error.connectionHealth && typeof error.connectionHealth === 'object'
          ? this.cloneData(error.connectionHealth)
          : undefined;
      const matchmakingGuard = payload && payload.matchmakingGuard && typeof payload.matchmakingGuard === 'object'
        ? this.cloneData(payload.matchmakingGuard)
        : error && error.matchmakingGuard && typeof error.matchmakingGuard === 'object'
          ? this.cloneData(error.matchmakingGuard)
          : undefined;
      return {
        success: false,
        error,
        reason: error && error.reason || payload && payload.reason || undefined,
        message: error && error.message || payload && payload.message || '实时论道入队失败',
        ...(connectionHealth ? { connectionHealth } : {}),
        ...(matchmakingGuard ? { matchmakingGuard } : {})
      };
    }
  },
  async measureLivePvpConnectionHealth() {
    const startedAt = Date.now();
    try {
      const result = await this.requestServer('/api/health', {
        method: 'GET',
        auth: false
      });
      const elapsedMs = Math.max(0, Date.now() - startedAt);
      const ok = !!(result && (result.status === 'ok' || result.success !== false));
      return {
        reportVersion: 'pvp-live-queue-connection-health-v1',
        status: ok ? 'pass' : 'blocked',
        sampleTag: 'client_preflight',
        sampleWindowMs: elapsedMs,
        missedHeartbeatCount: ok ? 0 : 2,
        reconnectCount: ok ? 0 : 1,
        rttP95Ms: elapsedMs
      };
    } catch (error) {
      const elapsedMs = Math.max(0, Date.now() - startedAt);
      return {
        reportVersion: 'pvp-live-queue-connection-health-v1',
        status: 'blocked',
        sampleTag: 'client_preflight',
        sampleWindowMs: elapsedMs,
        missedHeartbeatCount: 2,
        reconnectCount: 1,
        rttP95Ms: Math.max(3000, elapsedMs)
      };
    }
  },
  async cancelLivePvpQueue(queueTicket = '') {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const ticket = String(queueTicket || '').trim();
    if (!ticket) return {
      success: false,
      message: '实时论道队列票据缺失'
    };
    try {
      const result = await this.requestServer(`${this.getLivePvpPathPrefix()}/queue/cancel`, {
        method: 'POST',
        data: { queueTicket: ticket }
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '实时论道取消排队返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '实时论道取消排队失败'
      };
    }
  },
  async getLivePvpQueueStatus(queueTicket = '') {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const ticket = String(queueTicket || '').trim();
    if (!ticket) return {
      success: false,
      message: '实时论道队列票据缺失'
    };
    try {
      const result = await this.requestServer(`${this.getLivePvpPathPrefix()}/queue/status/${encodeURIComponent(ticket)}`, {
        method: 'GET'
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '实时论道队列状态返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '实时论道队列状态读取失败'
      };
    }
  },
  async createLivePvpInvite(options = {}) {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    try {
      const displayName = typeof options.displayName === 'string' ? options.displayName.trim().slice(0, 40) : '';
      const targetUsername = typeof options.targetUsername === 'string' ? options.targetUsername.trim() : '';
      const data = {};
      if (displayName) data.displayName = displayName;
      if (targetUsername) data.targetUsername = targetUsername;
      if (options.loadout && typeof options.loadout === 'object' && !Array.isArray(options.loadout)) {
        data.loadout = this.cloneData(options.loadout);
      }
      const result = await this.requestServer(`${this.getLivePvpPathPrefix()}/invites`, {
        method: 'POST',
        data
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '实时论道邀请创建返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '实时论道邀请创建失败'
      };
    }
  },
  async joinLivePvpInvite(inviteCode = '', options = {}) {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const code = String(inviteCode || '').trim();
    if (!code) return {
      success: false,
      message: '实时论道邀请码缺失'
    };
    try {
      const displayName = typeof options.displayName === 'string' ? options.displayName.trim().slice(0, 40) : '';
      const data = {};
      if (displayName) data.displayName = displayName;
      if (options.loadout && typeof options.loadout === 'object' && !Array.isArray(options.loadout)) {
        data.loadout = this.cloneData(options.loadout);
      }
      const result = await this.requestServer(`${this.getLivePvpPathPrefix()}/invites/${encodeURIComponent(code)}/join`, {
        method: 'POST',
        data
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '实时论道邀请加入返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '实时论道邀请加入失败'
      };
    }
  },
  async cancelLivePvpInvite(inviteCode = '') {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const code = String(inviteCode || '').trim();
    if (!code) return {
      success: false,
      message: '实时论道邀请码缺失'
    };
    try {
      const result = await this.requestServer(`${this.getLivePvpPathPrefix()}/invites/${encodeURIComponent(code)}/cancel`, {
        method: 'POST',
        data: {}
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '实时论道邀请取消返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '实时论道邀请取消失败'
      };
    }
  },
  async getCurrentLivePvpInvite() {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    try {
      const result = await this.requestServer(`${this.getLivePvpPathPrefix()}/invites/current`, {
        method: 'GET'
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '实时论道邀请状态返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '实时论道邀请状态读取失败'
      };
    }
  },
  async getLivePvpInviteInbox() {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    try {
      const result = await this.requestServer(`${this.getLivePvpPathPrefix()}/invites/inbox`, {
        method: 'GET'
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '实时论道邀请收件箱返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '实时论道邀请收件箱读取失败'
      };
    }
  },
  async getLivePvpMatch(matchId = '') {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const id = String(matchId || '').trim();
    if (!id) return {
      success: false,
      message: '实时论道战局缺失'
    };
    try {
      const result = await this.requestServer(`${this.getLivePvpPathPrefix()}/matches/${encodeURIComponent(id)}`, {
        method: 'GET'
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '实时论道战局返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '实时论道战局读取失败'
      };
    }
  },
  async getCurrentLivePvpMatch() {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    try {
      const result = await this.requestServer(`${this.getLivePvpPathPrefix()}/matches/current`, {
        method: 'GET'
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '当前实时论道返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '当前实时论道读取失败'
      };
    }
  },
  async getLivePvpReplay(matchId = '', options = {}) {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const id = String(matchId || '').trim();
    if (!id) return {
      success: false,
      message: '实时论道战局缺失'
    };
    const visibility = String(options && options.visibility || '').trim();
    const allowedVisibility = ['', 'replay_self', 'replay_public', 'audit_safe'];
    if (!allowedVisibility.includes(visibility)) {
      return {
        success: false,
        reason: 'invalid_replay_visibility',
        message: '不支持的回放可见性'
      };
    }
    const query = visibility && visibility !== 'replay_self'
      ? `?visibility=${encodeURIComponent(visibility)}`
      : '';
    try {
      const result = await this.requestServer(`${this.getLivePvpPathPrefix()}/matches/${encodeURIComponent(id)}/replay${query}`, {
        method: 'GET'
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '实时论道回放返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '实时论道回放读取失败'
      };
    }
  },
  async createLivePvpReplayShare(matchId = '', options = {}) {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const id = String(matchId || '').trim();
    if (!id) return {
      success: false,
      message: '实时论道战局缺失'
    };
    const body = {};
    const ttlDays = Math.floor(Number(options && options.ttlDays));
    if (Number.isFinite(ttlDays) && ttlDays > 0) {
      body.ttlDays = ttlDays;
    }
    try {
      const result = await this.requestServer(`${this.getLivePvpPathPrefix()}/matches/${encodeURIComponent(id)}/replay-share`, {
        method: 'POST',
        data: body
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '实时论道战报分享返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '实时论道战报分享生成失败'
      };
    }
  },
  async getLivePvpReplayShare(shareToken = '') {
    const token = String(shareToken || '').trim();
    if (!token) return {
      success: false,
      message: '公开战报分享缺失'
    };
    try {
      const result = await this.requestServer(`${this.getLivePvpPathPrefix()}/replay-shares/${encodeURIComponent(token)}`, {
        method: 'GET'
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '公开战报分享返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '公开战报分享读取失败'
      };
    }
  },
  async revokeLivePvpReplayShare(matchId = '') {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const id = String(matchId || '').trim();
    if (!id) return {
      success: false,
      message: '实时论道战局缺失'
    };
    try {
      const result = await this.requestServer(`${this.getLivePvpPathPrefix()}/matches/${encodeURIComponent(id)}/replay-share/revoke`, {
        method: 'POST'
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '实时论道战报分享撤销返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '实时论道战报分享撤销失败'
      };
    }
  },
  async requestLivePvpRematch(matchId = '', options = {}) {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const id = String(matchId || '').trim();
    if (!id) return {
      success: false,
      message: '实时论道战局缺失'
    };
    try {
      const displayName = typeof options.displayName === 'string' ? options.displayName.trim().slice(0, 40) : '';
      const data = {};
      if (displayName) data.displayName = displayName;
      if (options.loadout && typeof options.loadout === 'object' && !Array.isArray(options.loadout)) {
        data.loadout = this.cloneData(options.loadout);
      }
      const result = await this.requestServer(`${this.getLivePvpPathPrefix()}/matches/${encodeURIComponent(id)}/rematch`, {
        method: 'POST',
        data
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '实时论道再战返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '实时论道再战发起失败'
      };
    }
  },
  async getLivePvpRematchStatus(matchId = '') {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const id = String(matchId || '').trim();
    if (!id) return {
      success: false,
      message: '实时论道战局缺失'
    };
    try {
      const result = await this.requestServer(`${this.getLivePvpPathPrefix()}/matches/${encodeURIComponent(id)}/rematch`, {
        method: 'GET'
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '实时论道再战状态返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        status: error && error.status || undefined,
        friendlySeries: error && error.friendlySeries || undefined,
        message: error.message || '实时论道再战状态读取失败'
      };
    }
  },
  async cancelLivePvpRematch(matchId = '') {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const id = String(matchId || '').trim();
    if (!id) return {
      success: false,
      message: '实时论道战局缺失'
    };
    try {
      const result = await this.requestServer(`${this.getLivePvpPathPrefix()}/matches/${encodeURIComponent(id)}/rematch/cancel`, {
        method: 'POST'
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '实时论道再战取消返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        status: error && error.status || undefined,
        friendlySeries: error && error.friendlySeries || undefined,
        message: error.message || '实时论道再战取消失败'
      };
    }
  },
  async heartbeatLivePvpMatch(matchId = '') {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const id = String(matchId || '').trim();
    if (!id) return {
      success: false,
      message: '实时论道战局缺失'
    };
    try {
      const result = await this.requestServer(`${this.getLivePvpPathPrefix()}/matches/${encodeURIComponent(id)}/heartbeat`, {
        method: 'POST',
        data: {}
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '实时论道心跳返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '实时论道心跳失败'
      };
    }
  },
  async submitLivePvpIntent(matchId = '', intent = {}) {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const id = String(matchId || '').trim();
    if (!id) return {
      success: false,
      message: '实时论道战局缺失'
    };
    const payload = {
      intentId: String(intent.intentId || ''),
      intentType: String(intent.intentType || ''),
      stateVersion: Number.isFinite(Number(intent.stateVersion)) ? Math.floor(Number(intent.stateVersion)) : undefined,
      payload: this.cloneData(intent.payload || {})
    };
    try {
      const result = await this.requestServer(`${this.getLivePvpPathPrefix()}/matches/${encodeURIComponent(id)}/intents`, {
        method: 'POST',
        data: payload
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '实时论道行动返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '实时论道行动提交失败'
      };
    }
  },
  async submitLivePvpReport(matchId = '', report = {}) {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const id = String(matchId || '').trim();
    if (!id) return {
      success: false,
      message: '实时论道战局缺失'
    };
    const payload = {
      reason: String(report.reason || 'player_report').trim().slice(0, 48),
      message: String(report.message || '').trim().slice(0, 240)
    };
    try {
      const result = await this.requestServer(`${this.getLivePvpPathPrefix()}/matches/${encodeURIComponent(id)}/reports`, {
        method: 'POST',
        data: payload
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '实时论道异常反馈返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '实时论道异常反馈提交失败'
      };
    }
  },
  async submitLivePvpAvoidOpponent(matchId = '', request = {}) {
    const user = this.getCurrentUser();
    if (!user) return {
      success: false,
      message: '未登录'
    };
    const id = String(matchId || '').trim();
    if (!id) return {
      success: false,
      message: '实时论道战局缺失'
    };
    const payload = {
      reason: String(request.reason || 'post_match_avoid').trim().slice(0, 48),
      message: String(request.message || '').trim().slice(0, 240)
    };
    try {
      const result = await this.requestServer(`${this.getLivePvpPathPrefix()}/matches/${encodeURIComponent(id)}/avoid-opponent`, {
        method: 'POST',
        data: payload
      });
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '实时论道避开对手返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '实时论道避开对手提交失败'
      };
    }
  },
  async getSeasonOpsDashboard(options = {}) {
    const session = this.captureProgressionSessionSnapshot(options, '登录账号已变化，请刷新赛季司后重试');
    if (!session || !session.success) return session;
    const expectedUserId = String(options.expectedUserId || this.getCurrentUser()?.objectId || this.getCurrentUser()?.id || '').trim();
    try {
      const result = await this.requestServer(`${this.getSeasonOpsPathPrefix()}/current`, {
        method: 'GET',
        authToken: session.sessionToken
      });
      const currentUserId = String(this.getCurrentUser()?.objectId || this.getCurrentUser()?.id || '').trim();
      if (!expectedUserId || currentUserId !== expectedUserId) {
        return {
          success: false,
          reason: 'season_ops_account_changed',
          message: '登录账号已变化，旧赛季数据未应用'
        };
      }
      return result && typeof result === 'object' ? result : {
        success: false,
        message: '赛季司状态返回异常'
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '赛季司状态读取失败'
      };
    }
  },
  async getSeasonOpsLeaderboard(options = {}) {
    const expectedUserId = String(options.expectedUserId || this.getCurrentUser()?.objectId || this.getCurrentUser()?.id || '').trim();
    const session = this.captureProgressionSessionSnapshot(options, '登录账号已变化，请刷新权威榜单后重试');
    if (!session || !session.success) return session;
    const limit = Math.max(1, Math.min(50, Math.floor(Number(options.limit) || 20)));
    try {
      const result = await this.requestServer(`${this.getSeasonOpsPathPrefix()}/leaderboard?limit=${limit}`, {
        method: 'GET',
        authToken: session.sessionToken
      });
      const currentUserId = String(this.getCurrentUser()?.objectId || this.getCurrentUser()?.id || '').trim();
      if (!expectedUserId || currentUserId !== expectedUserId) {
        return {
          success: false,
          reason: 'season_ops_account_changed',
          message: '登录账号已变化，旧榜单数据未应用'
        };
      }
      return result;
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '权威榜单读取失败'
      };
    }
  },
  async getSeasonOpsLedger(options = {}) {
    const expectedUserId = String(options.expectedUserId || this.getCurrentUser()?.objectId || this.getCurrentUser()?.id || '').trim();
    const session = this.captureProgressionSessionSnapshot(options, '登录账号已变化，请刷新荣誉账本后重试');
    if (!session || !session.success) return session;
    const query = new URLSearchParams();
    query.set('limit', String(Math.max(1, Math.min(50, Math.floor(Number(options.limit) || 20)))));
    const cursor = String(options.cursor || '').trim();
    if (/^\d+:[A-Za-z0-9._:-]{8,128}$/.test(cursor)) query.set('cursor', cursor);
    try {
      const result = await this.requestServer(`${this.getSeasonOpsPathPrefix()}/ledger?${query.toString()}`, {
        method: 'GET',
        authToken: session.sessionToken
      });
      const currentUserId = String(this.getCurrentUser()?.objectId || this.getCurrentUser()?.id || '').trim();
      if (!expectedUserId || currentUserId !== expectedUserId) {
        return {
          success: false,
          reason: 'season_ops_account_changed',
          message: '登录账号已变化，旧账本数据未应用'
        };
      }
      return result;
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        message: error.message || '荣誉账本读取失败'
      };
    }
  },
  async purchaseSeasonOpsOffer(offerId = '', seasonId = '', options = {}) {
    const safeOfferId = String(offerId || '').trim();
    const safeSeasonId = String(seasonId || '').trim();
    if (!safeOfferId || !safeSeasonId) return {
      success: false,
      reason: 'invalid_purchase',
      message: '赛季商品或赛季标识缺失'
    };
    const expectedUserId = String(options.expectedUserId || this.getCurrentUser()?.objectId || this.getCurrentUser()?.id || '').trim();
    const session = this.captureProgressionSessionSnapshot({ expectedUserId }, '登录账号已变化，请刷新外观商店后重试');
    if (!session || !session.success) return session;
    const payload = {
      protocolVersion: 'season-ops-v1',
      seasonId: safeSeasonId,
      offerId: safeOfferId,
      mutationId: String(options.mutationId || this.createMutationId()).trim()
    };
    const integrity = await this.createRequiredSessionIntegrityFields(
      payload,
      session.sessionToken,
      '当前环境不支持赛季购买签名，请刷新后重试',
      'season_ops_signature_required'
    );
    if (!integrity || !integrity.success) return integrity;
    try {
      const result = await this.requestServer(`${this.getSeasonOpsPathPrefix()}/store/purchases`, {
        method: 'POST',
        authToken: session.sessionToken,
        data: {
          ...payload,
          ...integrity.integrity
        }
      });
      const currentUserId = String(this.getCurrentUser()?.objectId || this.getCurrentUser()?.id || '').trim();
      if (!expectedUserId || currentUserId !== expectedUserId) {
        return {
          success: false,
          reason: 'season_ops_account_changed',
          mutationId: payload.mutationId,
          message: '登录账号已变化，购买回执未应用；原账号可刷新账本确认结果'
        };
      }
      return {
        ...(result && typeof result === 'object' ? result : { success: false, message: '赛季购买返回异常' }),
        mutationId: payload.mutationId
      };
    } catch (error) {
      return {
        success: false,
        error,
        reason: error && error.reason || undefined,
        mutationId: payload.mutationId,
        message: error.message || '赛季商品购买失败'
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
