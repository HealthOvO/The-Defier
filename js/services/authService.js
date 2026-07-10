import { PVPService } from "./pvp-service.js";
import { BackendClient } from "./backend-client.js";
import { ProgressionService } from "./progression-service.js";
/**
 * The Defier - Bmob Auth Service
 */
export const AuthService = {
  isInitialized: false,
  currentUser: null,
  saveQueueBySlot: {},
  latestSaveTimeBySlot: {},
  revisionCacheStoragePrefix: 'theDefierCloudStateRevisionCacheV2',
  activeRevisionState: null,
  getUserIdentity(user) {
    return user && (user.objectId || user.id || user.userId || user.username) || null;
  },
  resetCloudSaveState() {
    this.saveQueueBySlot = {};
    this.latestSaveTimeBySlot = {};
  },
  createEmptyRevisionState() {
    return {
      slots: [null, null, null, null],
      global: null
    };
  },
  cloneRevisionMetadata(revision) {
    if (!revision || typeof revision !== 'object') return null;
    const cloned = {};
    if (typeof revision.revisionId === 'string' && revision.revisionId) cloned.revisionId = revision.revisionId;
    if (Number.isFinite(Number(revision.revisionNumber))) cloned.revisionNumber = Number(revision.revisionNumber);
    if (typeof revision.contentHash === 'string' && revision.contentHash) cloned.contentHash = revision.contentHash;
    if (Number.isFinite(Number(revision.headUpdatedAt))) cloned.headUpdatedAt = Number(revision.headUpdatedAt);
    return Object.keys(cloned).length > 0 ? cloned : null;
  },
  getActiveRevisionState() {
    if (!this.activeRevisionState) {
      this.activeRevisionState = this.createEmptyRevisionState();
    }
    return this.activeRevisionState;
  },
  clearActiveRevisionState() {
    this.activeRevisionState = this.createEmptyRevisionState();
  },
  getRevisionCacheStorageKey(userId) {
    const normalizedUserId = String(userId || '').trim();
    return normalizedUserId ? `${this.revisionCacheStoragePrefix}:${normalizedUserId}` : null;
  },
  loadRevisionCacheForUser(user) {
    const userId = this.getUserIdentity(user);
    if (!userId || typeof localStorage === 'undefined') {
      this.clearActiveRevisionState();
      return this.getActiveRevisionState();
    }
    const state = this.createEmptyRevisionState();
    const storageKey = this.getRevisionCacheStorageKey(userId);
    try {
      const raw = storageKey ? localStorage.getItem(storageKey) : null;
      const parsed = raw ? JSON.parse(raw) : null;
      const slotsSource = parsed && (Array.isArray(parsed.slots) ? parsed.slots : parsed.slots && typeof parsed.slots === 'object' ? parsed.slots : null);
      if (slotsSource) {
        for (let slot = 0; slot < 4; slot += 1) {
          const sourceRevision = Array.isArray(slotsSource) ? slotsSource[slot] : slotsSource[slot];
          state.slots[slot] = this.cloneRevisionMetadata(sourceRevision);
        }
      }
      state.global = this.cloneRevisionMetadata(parsed && parsed.global);
    } catch (error) {
      console.warn('Invalid cloud revision cache in localStorage');
    }
    this.activeRevisionState = state;
    return state;
  },
  persistRevisionCacheForCurrentUser() {
    const userId = this.getUserIdentity(this.currentUser);
    const storageKey = this.getRevisionCacheStorageKey(userId);
    if (!storageKey || typeof localStorage === 'undefined') return;
    const state = this.getActiveRevisionState();
    localStorage.setItem(storageKey, JSON.stringify({
      slots: state.slots.map(revision => this.cloneRevisionMetadata(revision)),
      global: this.cloneRevisionMetadata(state.global)
    }));
  },
  activateUserContext(nextUser, previousUserId = null) {
    const nextUserId = this.getUserIdentity(nextUser);
    if (previousUserId !== nextUserId) {
      this.resetCloudSaveState();
    }
    this.currentUser = nextUser || null;
    this.loadRevisionCacheForUser(nextUser);
  },
  getSlotRevision(slotIndex) {
    const slot = Number(slotIndex);
    if (!Number.isInteger(slot) || slot < 0 || slot > 3) return null;
    return this.cloneRevisionMetadata(this.getActiveRevisionState().slots[slot]);
  },
  setSlotRevision(slotIndex, revision, persist = true) {
    const slot = Number(slotIndex);
    if (!Number.isInteger(slot) || slot < 0 || slot > 3) return;
    this.getActiveRevisionState().slots[slot] = this.cloneRevisionMetadata(revision);
    if (persist) this.persistRevisionCacheForCurrentUser();
  },
  getGlobalRevision() {
    return this.cloneRevisionMetadata(this.getActiveRevisionState().global);
  },
  setGlobalRevision(revision, persist = true) {
    this.getActiveRevisionState().global = this.cloneRevisionMetadata(revision);
    if (persist) this.persistRevisionCacheForCurrentUser();
  },
  extractRevisionMetadata(source) {
    if (typeof BackendClient !== 'undefined' && BackendClient && typeof BackendClient.normalizeRevisionMetadata === 'function') {
      return this.cloneRevisionMetadata(BackendClient.normalizeRevisionMetadata(source));
    }
    return null;
  },
  extractSlotRevisionMetadata(result, slotIndex = null) {
    const slot = Number(slotIndex);
    const candidates = [
      result && result.current,
      result && result.entry,
      result && result.slot,
      result && result.save,
      result
    ];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const candidateSlot = Number(candidate.slotIndex);
      if (Number.isInteger(slot) && Number.isFinite(candidateSlot) && candidateSlot !== slot) continue;
      const revision = this.extractRevisionMetadata(candidate);
      if (revision) return revision;
    }
    return null;
  },
  extractGlobalRevisionMetadata(result) {
    const candidates = [
      result && result.current,
      result && result.entry,
      result && result.global,
      result
    ];
    for (const candidate of candidates) {
      const revision = this.extractRevisionMetadata(candidate);
      if (revision) return revision;
    }
    return null;
  },
  updateLatestSaveTime(slotIndex, saveTime) {
    const slot = Number(slotIndex);
    const numericTime = Number(saveTime);
    if (!Number.isInteger(slot) || slot < 0 || slot > 3 || !Number.isFinite(numericTime)) return;
    this.latestSaveTimeBySlot[slot] = Math.max(this.latestSaveTimeBySlot[slot] || 0, numericTime);
  },
  buildSlotSaveOptions(slotIndex, options = {}) {
    const built = { ...(options || {}) };
    if (!Object.prototype.hasOwnProperty.call(built, 'baseRevisionId')) {
      built.baseRevisionId = this.getSlotRevision(slotIndex)?.revisionId || null;
    }
    return built;
  },
  buildGlobalSaveOptions(options = {}) {
    const built = { ...(options || {}) };
    if (!Object.prototype.hasOwnProperty.call(built, 'baseRevisionId')) {
      built.baseRevisionId = this.getGlobalRevision()?.revisionId || null;
    }
    return built;
  },
  reconcileSlotRevision(slotIndex, result) {
    const revision = this.extractSlotRevisionMetadata(result, slotIndex);
    if (revision) this.setSlotRevision(slotIndex, revision);
    const saveTime = Number(result && result.saveTime);
    if (Number.isFinite(saveTime)) this.updateLatestSaveTime(slotIndex, saveTime);
  },
  reconcileGlobalRevision(result) {
    const revision = this.extractGlobalRevisionMetadata(result);
    if (revision) this.setGlobalRevision(revision);
  },
  replaceSlotRevisionsFromCloudData(result) {
    const nextState = this.createEmptyRevisionState();
    const slotEntries = Array.isArray(result && result.slotEntries) ? result.slotEntries : [];
    const revisions = result && result.revisions && typeof result.revisions === 'object' ? result.revisions : {};
    for (let slot = 0; slot < 4; slot += 1) {
      const revision = this.extractRevisionMetadata(slotEntries[slot]) || this.extractRevisionMetadata(revisions[slot]);
      nextState.slots[slot] = revision;
      const entrySaveTime = Number(slotEntries[slot] && slotEntries[slot].saveTime);
      if (Number.isFinite(entrySaveTime)) {
        this.updateLatestSaveTime(slot, entrySaveTime);
      }
    }
    nextState.global = this.getActiveRevisionState().global;
    this.activeRevisionState = nextState;
    this.persistRevisionCacheForCurrentUser();
  },
  getRuntimeConfig() {
    if (typeof BackendClient !== 'undefined') {
      return BackendClient.getRootConfig();
    }
    return null;
  },
  isCloudEnabled() {
    if (typeof BackendClient !== 'undefined') {
      return BackendClient.cloudEnabled;
    }
    return false;
  },
  ensureInitialized() {
    if (this.isInitialized) return true;
    this.init();
    return this.isInitialized;
  },
  init() {
    if (typeof BackendClient === 'undefined') {
      console.error('BackendClient not loaded');
      this.initError = '后端客户端未加载';
      this.isInitialized = false;
      this.currentUser = null;
      return;
    }
    const result = BackendClient.init();
    if (result.success) {
      this.isInitialized = true;
      this.currentUser = BackendClient.getCurrentUser();
      this.loadRevisionCacheForUser(this.currentUser);
      console.log(`AuthService Initialized [Provider: ${BackendClient.provider}]. Current User:`, this.currentUser);
    } else {
      const log = result.message === '服务器配置缺失' ? console.warn : console.error;
      log('BackendClient initialization failed:', result.message);
      this.initError = result.message;
      this.isInitialized = false;
      this.currentUser = null;
      this.clearActiveRevisionState();
    }
  },
  getCurrentUser() {
    if (typeof BackendClient === 'undefined') return null;
    if (!this.ensureInitialized()) return null;
    return BackendClient.getCurrentUser();
  },
  isLoggedIn() {
    return !!this.getCurrentUser();
  },
  async register(username, password) {
    if (!this.ensureInitialized()) {
      return {
        success: false,
        message: this.initError || '云服务未就绪'
      };
    }
    const previousUserId = this.getUserIdentity(this.currentUser);
    const response = await BackendClient.register(username, password);
    if (response.success) {
      const nextUser = BackendClient.getCurrentUser();
      this.activateUserContext(nextUser, previousUserId);
      if (typeof ProgressionService !== 'undefined' && ProgressionService && typeof ProgressionService.flush === 'function') {
        Promise.resolve().then(() => ProgressionService.flush()).catch(() => {});
      }
    }
    return response;
  },
  async login(username, password) {
    if (!this.ensureInitialized()) {
      return {
        success: false,
        message: this.initError || '云服务未就绪'
      };
    }
    const previousUserId = this.getUserIdentity(this.currentUser);
    const response = await BackendClient.login(username, password);
    if (response.success) {
      const nextUser = BackendClient.getCurrentUser();
      this.activateUserContext(nextUser, previousUserId);
      if (typeof ProgressionService !== 'undefined' && ProgressionService && typeof ProgressionService.flush === 'function') {
        Promise.resolve().then(() => ProgressionService.flush()).catch(() => {});
      }
    }
    return response;
  },
  logout() {
    const previousUserId = this.getUserIdentity(this.currentUser);
    if (!this.isInitialized || typeof BackendClient === 'undefined') {
      this.currentUser = null;
      this.resetCloudSaveState();
      this.clearActiveRevisionState();
      if (previousUserId && typeof ProgressionService !== 'undefined' && ProgressionService && typeof ProgressionService.resetActiveFlushState === 'function') {
        ProgressionService.resetActiveFlushState(previousUserId);
      }
      if (typeof window !== 'undefined' && typeof PVPService !== 'undefined' && PVPService && typeof PVPService.clearActiveMatch === 'function') {
        PVPService.clearActiveMatch();
      }
      return;
    }
    BackendClient.logout();
    this.currentUser = null;
    this.resetCloudSaveState();
    this.clearActiveRevisionState();
    if (previousUserId && typeof ProgressionService !== 'undefined' && ProgressionService && typeof ProgressionService.resetActiveFlushState === 'function') {
      ProgressionService.resetActiveFlushState(previousUserId);
    }
    if (typeof window !== 'undefined' && typeof PVPService !== 'undefined' && PVPService && typeof PVPService.clearActiveMatch === 'function') {
      PVPService.clearActiveMatch();
    }
  },
  // Cloud Save Methods
  async saveCloudData(gameData, slotIndex = 0, options = {}) {
    const slot = Number(slotIndex);
    if (!this.isLoggedIn()) return {
      success: false,
      message: '未登录'
    };
    if (!Number.isInteger(slot) || slot < 0 || slot > 3) return {
      success: false,
      message: '非法存档位'
    };
    const previousTask = this.saveQueueBySlot[slot] || Promise.resolve();
    const queuedTask = previousTask.catch(() => {}).then(async () => {
      const saveTime = Number.isFinite(gameData && gameData.timestamp) ? gameData.timestamp : Date.now();
      if (saveTime < (this.latestSaveTimeBySlot[slot] || 0)) {
        return {
          success: true,
          skipped: true,
          message: 'stale-save-ignored'
        };
      }
      const result = await BackendClient.saveCloudData(gameData, slot, this.buildSlotSaveOptions(slot, options));
      if (result.success) {
        const serverSaveTime = Number(result.saveTime);
        const canonicalSaveTime = Number.isFinite(serverSaveTime) ? serverSaveTime : saveTime;
        this.latestSaveTimeBySlot[slot] = Math.max(this.latestSaveTimeBySlot[slot] || 0, canonicalSaveTime);
        this.reconcileSlotRevision(slot, result);
      } else if (result.conflict && result.current) {
        this.reconcileSlotRevision(slot, result.current);
      }
      return result;
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
      return {
        success: false,
        message: this.initError || '云服务未就绪'
      };
    }
    if (!this.isLoggedIn()) return {
      success: false,
      message: '未登录'
    };
    const result = await BackendClient.getCloudData();
    if (result.success) {
      this.replaceSlotRevisionsFromCloudData(result);
    }
    return result;
  },
  async saveGlobalData(data, options = {}) {
    if (!this.ensureInitialized()) {
      return {
        success: false,
        message: this.initError || '云服务未就绪'
      };
    }
    if (!this.isLoggedIn()) return {
      success: false,
      message: '未登录'
    };
    const result = await BackendClient.saveGlobalData(data, this.buildGlobalSaveOptions(options));
    if (result.success) {
      this.reconcileGlobalRevision(result);
    } else if (result.conflict && result.current) {
      this.reconcileGlobalRevision(result.current);
    }
    return result;
  },
  async getGlobalData() {
    if (!this.ensureInitialized()) {
      return {
        success: false,
        message: this.initError || '云服务未就绪'
      };
    }
    if (!this.isLoggedIn()) return {
      success: false,
      message: '未登录'
    };
    const result = await BackendClient.getGlobalData();
    if (result.success) {
      this.reconcileGlobalRevision(result);
    }
    return result;
  },
  async getCloudSaveHistory(slotIndex = 0, options = {}) {
    if (!this.ensureInitialized()) {
      return {
        success: false,
        message: this.initError || '云服务未就绪'
      };
    }
    if (!this.isLoggedIn()) return {
      success: false,
      message: '未登录'
    };
    return await BackendClient.getCloudSaveHistory(slotIndex, options);
  },
  async restoreCloudSaveRevision(slotIndex = 0, sourceRevisionId = '', options = {}) {
    if (!this.ensureInitialized()) {
      return {
        success: false,
        message: this.initError || '云服务未就绪'
      };
    }
    if (!this.isLoggedIn()) return {
      success: false,
      message: '未登录'
    };
    const slot = Number(slotIndex);
    const result = await BackendClient.restoreCloudSaveRevision(slot, sourceRevisionId, this.buildSlotSaveOptions(slot, options));
    if (result.success) {
      this.reconcileSlotRevision(slot, result);
    } else if (result.conflict && result.current) {
      this.reconcileSlotRevision(slot, result.current);
    }
    return result;
  },
  async getGlobalDataHistory(options = {}) {
    if (!this.ensureInitialized()) {
      return {
        success: false,
        message: this.initError || '云服务未就绪'
      };
    }
    if (!this.isLoggedIn()) return {
      success: false,
      message: '未登录'
    };
    return await BackendClient.getGlobalDataHistory(options);
  },
  async restoreGlobalDataRevision(sourceRevisionId = '', options = {}) {
    if (!this.ensureInitialized()) {
      return {
        success: false,
        message: this.initError || '云服务未就绪'
      };
    }
    if (!this.isLoggedIn()) return {
      success: false,
      message: '未登录'
    };
    const result = await BackendClient.restoreGlobalDataRevision(sourceRevisionId, this.buildGlobalSaveOptions(options));
    if (result.success) {
      this.reconcileGlobalRevision(result);
    } else if (result.conflict && result.current) {
      this.reconcileGlobalRevision(result.current);
    }
    return result;
  },
  async uploadGhostData(player, realm) {
    if (!this.ensureInitialized()) return {
      success: false,
      message: '云服务未就绪'
    };
    if (!this.isLoggedIn()) return {
      success: false,
      message: '未登录'
    };
    return await BackendClient.uploadGhostData(player, realm);
  },
  async fetchRandomGhost(currentRealm) {
    if (!this.ensureInitialized()) return {
      success: false,
      message: '云服务未就绪'
    };
    return await BackendClient.fetchRandomGhost(currentRealm);
  }
}; // Auto init
// if (typeof Bmob !== 'undefined') AuthService.init();
