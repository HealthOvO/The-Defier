import { PVPService } from "../services/pvp-service.js";
import { AuthService } from "../services/authService.js";
import { Utils } from "../core/utils.js";
/**
 * SaveManager
 * Extracts save logic from game.js
 */
export class SaveManager {
  constructor(gameInstance) {
    this.game = gameInstance;
    this.STORAGE_KEY = 'theDefierSave';
  }
  saveGame() {
    if (this.game.automationBootConfig) {
      return {
        success: false,
        skipped: true,
        reason: 'automation-boot'
      };
    }
    try {
      const pvpEconomySnapshot = typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getEconomySnapshot === 'function' ? PVPService.getEconomySnapshot() : null;
      const progressionRun = this.game && typeof this.game.ensureProgressionRunIdentity === 'function'
        ? this.game.ensureProgressionRunIdentity({
            startedAt: this.game.runStartTime || Date.now()
          })
        : {
            runId: '',
            ownerUserId: '',
            startedAt: this.game && this.game.runStartTime ? this.game.runStartTime : Date.now()
          };
      const gameState = {
        version: '5.1.0',
        player: this.game.player.getState(),
        map: {
          nodes: this.game.map.nodes,
          currentNodeIndex: this.game.map.currentNodeIndex,
          completedNodes: this.game.map.completedNodes
        },
        unlockedRealms: this.game.unlockedRealms || [1],
        currentScreen: this.game.currentScreen,
        saveSlot: this.game.currentSaveSlot,
        progressionRun: {
          runId: String(progressionRun.runId || ''),
          ownerUserId: String(progressionRun.ownerUserId || ''),
          startedAt: Number(progressionRun.startedAt) > 0 ? Math.floor(Number(progressionRun.startedAt)) : Date.now()
        },
        combatMeta: {
          stance: this.game.player.stance || 'neutral',
          ruleVersion: 'combat-v2',
          battleUIUpdates: this.game.performanceStats && this.game.performanceStats.battleUIUpdates || 0
        },
        pvpMeta: {
          ruleVersion: 'pvp-v2',
          lastKnownDivision: typeof PVPService !== 'undefined' && PVPService.currentRankData ? PVPService.currentRankData.division : null,
          economy: pvpEconomySnapshot
        },
        legacyProgress: this.game.legacyProgress,
        featureFlags: {
          ...this.game.featureFlags
        },
        endlessMeta: this.game.ensureEndlessState(),
        encounterMeta: this.game.ensureEncounterState(),
        sanctumAgendaState: typeof this.game.getSanctumAgendaSaveState === 'function' ? this.game.getSanctumAgendaSaveState() : this.game.createDefaultSanctumAgendaState(),
        heavenlyMandateState: typeof this.game.getHeavenlyMandateSaveState === 'function' ? this.game.getHeavenlyMandateSaveState() : this.game.createDefaultHeavenlyMandateState(),
        seasonVerificationState: typeof this.game.getSeasonVerificationSaveState === 'function' ? this.game.getSeasonVerificationSaveState() : this.game.createDefaultSeasonVerificationState(),
        fateAftereffectState: typeof this.game.getFateAftereffectSaveState === 'function' ? this.game.getFateAftereffectSaveState() : this.game.createDefaultFateAftereffectState(),
        chapterEventLedger: this.game.getChapterEventLedgerSaveState(),
        schemaMigratedAt: Date.now(),
        timestamp: Date.now()
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(gameState));
      console.log('游戏已保存 (本地)');
      const targetSlot = this.game.currentSaveSlot;
      const result = {
        success: true,
        local: true,
        cloud: false,
        slot: targetSlot,
        timestamp: gameState.timestamp
      };
      if (typeof AuthService !== 'undefined' && AuthService.isLoggedIn() && targetSlot !== null && targetSlot !== undefined) {
        this.game.cachedSlots = this.game.cachedSlots || {};
        const cloudPromise = AuthService.saveCloudData(gameState, targetSlot).then(res => {
          if (res.success && !res.skipped) {
            console.log(`游戏已同步 (云端 Slot ${targetSlot})`);
            this.game.cachedSlots[targetSlot] = gameState;
            if (typeof Utils !== 'undefined') Utils.showBattleLog('游戏进度已保存到云端');
            return {
              ...result,
              cloud: true,
              cloudResult: res
            };
          } else if (res.success && res.skipped) {
            console.warn('云端已有更新，本次未覆盖', res);
            if (typeof Utils !== 'undefined') Utils.showBattleLog('云端已有更新，本次仅保存本地');
            return {
              ...result,
              cloud: false,
              cloudSkipped: true,
              cloudResult: res
            };
          } else if (res && res.conflict) {
            const current = res.current && typeof res.current === 'object' ? res.current : {};
            const cloudData = current.saveData || current.data || null;
            const cloudTime = Number(current.saveTime || current.clientUpdatedAt || current.headUpdatedAt) || Date.now();
            console.warn('云端存档版本冲突', res);
            if (cloudData && this.game) {
              this.game.cachedSlots[targetSlot] = cloudData;
              if (typeof this.game.showSaveConflictModal === 'function') {
                this.game.showSaveConflictModal(gameState, cloudData, cloudTime);
              }
            }
            if (typeof Utils !== 'undefined') Utils.showBattleLog('检测到云端新版本，请选择保留哪份进度');
            return {
              ...result,
              cloud: false,
              cloudConflict: true,
              cloudResult: res
            };
          } else {
            console.warn('云端同步失败', res);
            if (typeof Utils !== 'undefined') Utils.showBattleLog('云端同步失败，仅保存本地');
            return {
              ...result,
              cloud: false,
              cloudResult: res
            };
          }
        }).catch(err => {
          console.error('Cloud save error:', err);
          if (typeof Utils !== 'undefined') Utils.showBattleLog('云端同步失败，仅保存本地');
          return {
            ...result,
            cloud: false,
            cloudError: err && err.message ? err.message : String(err)
          };
        });
        return {
          ...result,
          cloudPending: true,
          cloudPromise
        };
      }
      return result;
    } catch (e) {
      console.error('Save Game Error:', e);
      if (typeof Utils !== 'undefined') Utils.showBattleLog('严重错误：存档失败！请检查存储空间');
      return {
        success: false,
        local: false,
        error: e && e.message ? e.message : String(e)
      };
    }
  }
} // Temporary export mechanism to allow global usage before full ESM
if (typeof window !== 'undefined') {}
