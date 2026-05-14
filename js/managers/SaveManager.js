/**
 * SaveManager
 * Extracts save logic from game.js
 */

class SaveManager {
    constructor(gameInstance) {
        this.game = gameInstance;
        this.STORAGE_KEY = 'theDefierSave';
    }

    saveGame() {
        if (this.game.automationBootConfig) {
            return false;
        }
        try {
            const pvpEconomySnapshot = (typeof PVPService !== 'undefined'
                && PVPService
                && typeof PVPService.getEconomySnapshot === 'function')
                ? PVPService.getEconomySnapshot()
                : null;
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
                combatMeta: {
                    stance: this.game.player.stance || 'neutral',
                    ruleVersion: 'combat-v2',
                    battleUIUpdates: (this.game.performanceStats && this.game.performanceStats.battleUIUpdates) || 0
                },
                pvpMeta: {
                    ruleVersion: 'pvp-v2',
                    lastKnownDivision: (typeof PVPService !== 'undefined' && PVPService.currentRankData) ? PVPService.currentRankData.division : null,
                    economy: pvpEconomySnapshot
                },
                legacyProgress: this.game.legacyProgress,
                featureFlags: { ...this.game.featureFlags },
                endlessMeta: this.game.ensureEndlessState(),
                encounterMeta: this.game.ensureEncounterState(),
                sanctumAgendaState: typeof this.game.getSanctumAgendaSaveState === 'function'
                    ? this.game.getSanctumAgendaSaveState()
                    : this.game.createDefaultSanctumAgendaState(),
                heavenlyMandateState: typeof this.game.getHeavenlyMandateSaveState === 'function'
                    ? this.game.getHeavenlyMandateSaveState()
                    : this.game.createDefaultHeavenlyMandateState(),
                seasonVerificationState: typeof this.game.getSeasonVerificationSaveState === 'function'
                    ? this.game.getSeasonVerificationSaveState()
                    : this.game.createDefaultSeasonVerificationState(),
                fateAftereffectState: typeof this.game.getFateAftereffectSaveState === 'function'
                    ? this.game.getFateAftereffectSaveState()
                    : this.game.createDefaultFateAftereffectState(),
                chapterEventLedger: this.game.getChapterEventLedgerSaveState(),
                schemaMigratedAt: Date.now(),
                timestamp: Date.now()
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(gameState));
            console.log('游戏已保存 (本地)');

            const targetSlot = this.game.currentSaveSlot;
            if (typeof AuthService !== 'undefined' && AuthService.isLoggedIn() && targetSlot !== null && targetSlot !== undefined) {
                AuthService.saveCloudData(gameState, targetSlot).then(res => {
                    if (res.success) {
                        console.log(`游戏已同步 (云端 Slot ${targetSlot})`);
                        this.game.cachedSlots[targetSlot] = gameState;
                        if (typeof Utils !== 'undefined') Utils.showBattleLog('游戏进度已保存到云端');
                    } else {
                        console.warn('云端同步失败', res);
                        if (typeof Utils !== 'undefined') Utils.showBattleLog('云端同步失败，仅保存本地');
                    }
                }).catch(err => {
                    console.error('Cloud save error:', err);
                });
            }
        } catch (e) {
            console.error('Save Game Error:', e);
            if (typeof Utils !== 'undefined') Utils.showBattleLog('严重错误：存档失败！请检查存储空间');
        }
    }
}

// Temporary export mechanism to allow global usage before full ESM
if (typeof window !== 'undefined') {
    window.SaveManager = SaveManager;
}
