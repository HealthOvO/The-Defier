import { PVPService } from "./pvp-service.js";
import { BackendClient } from "./backend-client.js";
/**
 * The Defier - Bmob Auth Service
 */
export const AuthService = {
  isInitialized: false,
  currentUser: null,
  saveQueueBySlot: {},
  latestSaveTimeBySlot: {},
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
      console.log(`AuthService Initialized [Provider: ${BackendClient.provider}]. Current User:`, this.currentUser);
    } else {
      console.error('BackendClient initialization failed:', result.message);
      this.initError = result.message;
      this.isInitialized = false;
      this.currentUser = null;
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
    const response = await BackendClient.register(username, password);
    if (response.success) {
      this.currentUser = BackendClient.getCurrentUser();
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
    const response = await BackendClient.login(username, password);
    if (response.success) {
      this.currentUser = BackendClient.getCurrentUser();
    }
    return response;
  },
  logout() {
    if (!this.isInitialized || typeof BackendClient === 'undefined') {
      this.currentUser = null;
      this.saveQueueBySlot = {};
      if (typeof window !== 'undefined' && PVPService && typeof PVPService.clearActiveMatch === 'function') {
        PVPService.clearActiveMatch();
      }
      return;
    }
    BackendClient.logout();
    this.currentUser = null;
    this.saveQueueBySlot = {};
    if (typeof window !== 'undefined' && PVPService && typeof PVPService.clearActiveMatch === 'function') {
      PVPService.clearActiveMatch();
    }
  },
  // Cloud Save Methods
  async saveCloudData(gameData, slotIndex = 0) {
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
      const result = await BackendClient.saveCloudData(gameData, slot);
      if (result.success) {
        this.latestSaveTimeBySlot[slot] = saveTime;
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
    return await BackendClient.getCloudData();
  },
  async saveGlobalData(data) {
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
    return await BackendClient.saveGlobalData(data);
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
    return await BackendClient.getGlobalData();
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