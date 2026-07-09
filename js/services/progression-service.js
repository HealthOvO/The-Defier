import { BackendClient } from "./backend-client.js";

const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export const ProgressionService = {
  storagePrefix: 'theDefierProgressionQueueV1',
  MAX_QUEUE_SIZE: 200,
  MAX_BATCH_SIZE: 20,
  activeFlushByKey: {},
  memoryQueueByKey: {},
  getStorage() {
    if (typeof localStorage !== 'undefined') return localStorage;
    return null;
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
  normalizeUserId(user) {
    const raw = user && (user.objectId || user.id || user.userId || user.username);
    const value = String(raw || '').trim();
    return value || '';
  },
  getCurrentUser() {
    try {
      if (typeof BackendClient !== 'undefined' && BackendClient && typeof BackendClient.getCurrentUser === 'function') {
        return BackendClient.getCurrentUser();
      }
    } catch (error) {}
    return null;
  },
  getCurrentUserId() {
    return this.normalizeUserId(this.getCurrentUser());
  },
  getQueueStorageKey(userId = '') {
    const safeUserId = this.normalizeUserId({ objectId: userId });
    return safeUserId ? `${this.storagePrefix}:${safeUserId}` : '';
  },
  readQueueByKey(storageKey = '') {
    if (!storageKey) return [];
    const storage = this.getStorage();
    if (!storage) {
      const memoryQueue = this.memoryQueueByKey[storageKey];
      return Array.isArray(memoryQueue) ? this.cloneData(memoryQueue) || [] : [];
    }
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  },
  writeQueueByKey(storageKey = '', queue = []) {
    if (!storageKey) return [];
    const normalizedQueue = Array.isArray(queue) ? queue.map(entry => this.cloneData(entry)).filter(Boolean) : [];
    const storage = this.getStorage();
    if (!storage) {
      if (normalizedQueue.length > 0) this.memoryQueueByKey[storageKey] = normalizedQueue;
      else delete this.memoryQueueByKey[storageKey];
      return normalizedQueue;
    }
    if (normalizedQueue.length === 0) {
      storage.removeItem(storageKey);
      return [];
    }
    storage.setItem(storageKey, JSON.stringify(normalizedQueue));
    return normalizedQueue;
  },
  loadQueueForUser(userId = '') {
    return this.readQueueByKey(this.getQueueStorageKey(userId));
  },
  saveQueueForUser(userId = '', queue = []) {
    return this.writeQueueByKey(this.getQueueStorageKey(userId), queue);
  },
  normalizeSafeId(value) {
    const text = String(value || '').trim();
    return SAFE_ID.test(text) ? text : '';
  },
  normalizeMode(value) {
    const mode = String(value || '').trim();
    return ['pve', 'challenge', 'expedition'].includes(mode) ? mode : '';
  },
  createSafeId(prefix = 'evt') {
    const safePrefix = String(prefix || 'evt').replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 24) || 'evt';
    const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    const random = cryptoObj && typeof cryptoObj.randomUUID === 'function'
      ? cryptoObj.randomUUID()
      : `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e12).toString(36)}`;
    return `${safePrefix}-${random}`.slice(0, 128);
  },
  sanitizeProof(rawProof = {}) {
    const proof = rawProof && typeof rawProof === 'object' && !Array.isArray(rawProof) ? rawProof : {};
    const safe = {};
    const copySafeId = (key) => {
      const value = this.normalizeSafeId(proof[key]);
      if (value) safe[key] = value;
    };
    const nodeType = String(proof.nodeType || '').trim();
    if (['enemy', 'elite', 'trial', 'boss', 'ghost_duel'].includes(nodeType)) safe.nodeType = nodeType;
    if (Number.isFinite(Number(proof.realm))) safe.realm = Math.max(1, Math.min(999, Math.floor(Number(proof.realm))));
    copySafeId('runId');
    if (['daily', 'weekly'].includes(String(proof.challengeMode || '').trim())) safe.challengeMode = String(proof.challengeMode).trim();
    copySafeId('rotationKey');
    copySafeId('ruleId');
    if (Number.isFinite(Number(proof.chapterIndex))) safe.chapterIndex = Math.max(1, Math.min(999, Math.floor(Number(proof.chapterIndex))));
    if (String(proof.reason || '') === 'realm_clear') safe.reason = 'realm_clear';
    return safe;
  },
  buildQueuedEvent(eventType = '', options = {}) {
    const safeType = String(eventType || '').trim();
    if (!['battle_won', 'activity_completed'].includes(safeType)) {
      return {
        success: false,
        queued: false,
        reason: 'unsupported_event_type',
        message: '长期进度事件类型不支持'
      };
    }
    const mode = this.normalizeMode(options && options.mode);
    if (!mode) {
      return {
        success: false,
        queued: false,
        reason: 'invalid_activity_mode',
        message: '长期进度模式不支持'
      };
    }
    const rawEventId = String(options && options.eventId || '').trim();
    const eventId = rawEventId ? this.normalizeSafeId(rawEventId) : this.createSafeId('evt');
    if (!eventId) {
      return {
        success: false,
        queued: false,
        reason: 'invalid_event_id',
        message: '长期进度事件 ID 非法'
      };
    }
    const rawSourceRef = String(options && options.sourceRef || '').trim();
    const sourceRef = rawSourceRef ? this.normalizeSafeId(rawSourceRef) : this.createSafeId('source');
    if (!sourceRef) {
      return {
        success: false,
        queued: false,
        reason: 'invalid_source_ref',
        message: '长期进度来源标识非法'
      };
    }
    const event = {
      eventId,
      eventType: safeType,
      mode,
      sourceRef
    };
    const occurredAt = Math.floor(Number(options && Object.prototype.hasOwnProperty.call(options, 'occurredAt')
      ? options.occurredAt
      : Date.now()));
    if (Number.isFinite(occurredAt) && occurredAt > 0) {
      event.occurredAt = occurredAt;
    }
    if (options && options.proof && typeof options.proof === 'object' && !Array.isArray(options.proof)) {
      event.proof = this.sanitizeProof(options.proof);
    }
    return {
      success: true,
      queued: true,
      event
    };
  },
  enqueueEvent(eventType = '', options = {}) {
    try {
      const userId = this.getCurrentUserId();
      if (!userId) {
        return {
          success: false,
          queued: false,
          skipped: true,
          message: '未登录'
        };
      }
      const built = this.buildQueuedEvent(eventType, options);
      if (!built.success || !built.event) return built;
      const queue = this.loadQueueForUser(userId);
      const deduped = queue.filter(entry => {
        const sameEventId = this.normalizeSafeId(entry && entry.eventId) === built.event.eventId;
        const sameSource = String(entry && entry.eventType || '') === built.event.eventType
          && this.normalizeSafeId(entry && entry.sourceRef) === built.event.sourceRef;
        return !sameEventId && !sameSource;
      });
      deduped.push(built.event);
      const bounded = deduped.slice(-this.MAX_QUEUE_SIZE);
      this.saveQueueForUser(userId, bounded);
      return {
        success: true,
        queued: true,
        userId,
        queueLength: bounded.length,
        event: this.cloneData(built.event)
      };
    } catch (error) {
      return {
        success: false,
        queued: false,
        error,
        message: error.message || '长期进度事件入队失败'
      };
    }
  },
  recordBattleWin(options = {}) {
    return this.enqueueEvent('battle_won', options);
  },
  recordActivityCompleted(options = {}) {
    return this.enqueueEvent('activity_completed', options);
  },
  extractReceiptIds(result = {}) {
    const ids = new Set();
    ['accepted', 'duplicates', 'rejected'].forEach(key => {
      const entries = Array.isArray(result && result[key]) ? result[key] : [];
      entries.forEach(entry => {
        const eventId = this.normalizeSafeId(entry && entry.eventId);
        if (eventId) ids.add(eventId);
      });
    });
    return ids;
  },
  resetActiveFlushState(userId = '') {
    const storageKey = this.getQueueStorageKey(userId);
    if (!storageKey) return false;
    const active = this.activeFlushByKey[storageKey];
    if (active && active.promise) return false;
    delete this.activeFlushByKey[storageKey];
    return true;
  },
  flush() {
    const userId = this.getCurrentUserId();
    if (!userId) {
      return Promise.resolve({
        success: false,
        skipped: true,
        message: '未登录'
      });
    }
    const storageKey = this.getQueueStorageKey(userId);
    if (!storageKey) {
      return Promise.resolve({
        success: false,
        skipped: true,
        message: '账号标识缺失'
      });
    }
    const active = this.activeFlushByKey[storageKey];
    if (active && active.promise) return active.promise;
    const token = Symbol(`progression-flush:${storageKey}`);
    const promise = this.flushQueueForKey(storageKey, userId).finally(() => {
      if (this.activeFlushByKey[storageKey] && this.activeFlushByKey[storageKey].token === token) {
        delete this.activeFlushByKey[storageKey];
      }
    });
    this.activeFlushByKey[storageKey] = { token, promise };
    return promise;
  },
  async flushQueueForKey(storageKey = '', expectedUserId = '') {
    let submittedBatches = 0;
    let removedEvents = 0;
    while (true) {
      const queue = this.readQueueByKey(storageKey);
      if (queue.length === 0) {
        return {
          success: true,
          submittedBatches,
          removedEvents,
          remaining: 0
        };
      }
      const batch = queue.slice(0, this.MAX_BATCH_SIZE);
      let result = null;
      try {
        if (this.getCurrentUserId() !== expectedUserId) {
          return {
            success: false,
            reason: 'progression_account_changed',
            submittedBatches,
            removedEvents,
            remaining: queue.length,
            message: '登录账号已变化，队列保留到原账号下次登录'
          };
        }
        result = await BackendClient.submitProgressionEvents(batch, { expectedUserId });
      } catch (error) {
        return {
          success: false,
          error,
          submittedBatches,
          removedEvents,
          remaining: queue.length,
          message: error.message || '长期进度事件上传失败'
        };
      }
      if (!result || result.success === false) {
        return {
          success: false,
          error: result && result.error ? result.error : null,
          reason: result && result.reason ? result.reason : undefined,
          submittedBatches,
          removedEvents,
          remaining: queue.length,
          message: result && result.message ? result.message : '长期进度事件上传失败'
        };
      }
      const removableIds = this.extractReceiptIds(result);
      if (removableIds.size === 0) {
        return {
          success: false,
          submittedBatches,
          removedEvents,
          remaining: queue.length,
          message: '长期进度回执缺少可清理事件'
        };
      }
      const latestQueue = this.readQueueByKey(storageKey);
      const nextQueue = latestQueue.filter(entry => !removableIds.has(this.normalizeSafeId(entry && entry.eventId)));
      const removedNow = latestQueue.length - nextQueue.length;
      if (removedNow <= 0) {
        const submittedIds = new Set(batch.map(entry => this.normalizeSafeId(entry && entry.eventId)).filter(Boolean));
        const submittedBatchStillQueued = latestQueue.some(entry => submittedIds.has(this.normalizeSafeId(entry && entry.eventId)));
        if (!submittedBatchStillQueued) {
          submittedBatches += 1;
          continue;
        }
        return {
          success: false,
          submittedBatches,
          removedEvents,
          remaining: latestQueue.length,
          message: '长期进度回执未命中已排队事件'
        };
      }
      this.writeQueueByKey(storageKey, nextQueue);
      submittedBatches += 1;
      removedEvents += removedNow;
    }
  }
};
