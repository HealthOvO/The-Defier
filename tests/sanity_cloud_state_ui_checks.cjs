const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const gameSource = read('js/game.js');
const saveManagerSource = read('js/managers/SaveManager.js');
const systemViewSource = read('js/views/SystemView.js');
const htmlSource = read('index.html');
const cssSource = read('css/style.css');

for (const expected of [
  "mode === 'history'",
  'showCloudSaveHistory(slotIndex)',
  'AuthService.getCloudSaveHistory(slot, { limit: 20 })',
  'restoreCloudSaveRevision(revisionId)',
  'AuthService.restoreCloudSaveRevision(slot, sourceRevisionId)',
  "sessionStorage.setItem('justLoadedSave', 'true')"
]) {
  assert(gameSource.includes(expected), `game cloud history flow should include ${expected}`);
}

const selectSlotSource = gameSource.slice(gameSource.indexOf('selectSlot(index, mode)'), gameSource.indexOf('async handleRegister()', gameSource.indexOf('selectSlot(index, mode)')));
const restoreCloudRevisionSource = gameSource.slice(gameSource.indexOf('restoreCloudSaveRevision(revisionId)'), gameSource.indexOf('// 解决存档冲突'));
const resolveSaveConflictSource = gameSource.slice(gameSource.indexOf('resolveSaveConflict(choice)'), gameSource.indexOf('// 加载云端存档 (无本地时)'));
const loadCloudGameSource = gameSource.slice(gameSource.indexOf('loadCloudGame()'), gameSource.indexOf('// 打开法宝囊'));
assert(
  selectSlotSource.indexOf("mode === 'history'") < selectSlotSource.indexOf('this.currentSaveSlot = index'),
  'viewing cloud history must return before changing the active save slot'
);
assert(selectSlotSource.includes("slotsModal.classList.remove('active')"), 'opening cloud history should hide the save-slot modal');
assert(gameSource.includes('closeCloudSaveHistory(returnToSlots = true)'), 'cloud history should have an explicit modal lifecycle');
assert(gameSource.includes("slotsModal.classList.add('active')"), 'closing cloud history should return to the save-slot modal');
assert(gameSource.includes('this.closeCloudSaveHistory(true);'), 'an expired login should restore the save-slot modal instead of closing both layers');
assert(gameSource.includes('this.cloudHistoryUserId = historyUserId'), 'cloud history should bind the UI flow to the account that opened it');
assert(gameSource.includes("refreshed.reason === 'cloud_state_account_changed'"), 'restore refresh should stop when the account changes');
assert(!gameSource.includes('restored.saveData || restored.data || null'), 'restore UI must not fall back to stale account data after refresh failure');
assert(gameSource.includes("const PENDING_CHALLENGE_SLOT_RELOAD_KEY = 'theDefierPendingChallengeSlotReloadV1'"), 'challenge starts should use a session-scoped slot reload handoff');
assert(gameSource.includes('persistPendingChallengeStartForSlotReload()'), 'challenge starts should persist their pending bundle before a cloud slot reload');
assert(gameSource.includes('resumePendingChallengeStartAfterSlotLoad()'), 'challenge starts should resume after a cloud slot reload');
assert(gameSource.includes('slotIndex !== this.currentSaveSlot'), 'challenge slot reload resume should stay bound to the selected save slot');
assert(gameSource.includes('markerUserId !== currentUserId'), 'challenge slot reload resume should stay bound to the account that started it');
assert(gameSource.includes('Date.now() - savedAt < -30000'), 'challenge slot reload resume should reject implausibly future handoffs');
assert(gameSource.includes('Date.now() - savedAt > PENDING_CHALLENGE_SLOT_RELOAD_TTL_MS'), 'challenge slot reload resume should reject expired handoffs');
assert(selectSlotSource.includes('this.persistPendingChallengeStartForSlotReload();'), 'loading an existing cloud slot should preserve a pending challenge before reload');
assert(
  selectSlotSource.indexOf('this.persistPendingChallengeStartForSlotReload();') < selectSlotSource.indexOf("setTimeout(() => window.location.reload(), 500)"),
  'pending challenge state must be persisted before the slot reload begins'
);
assert(gameSource.includes('this.pendingChallengeStart = pending;\n        this.showCharacterSelection();'), 'a restored pending challenge should continue at character selection');
assert(restoreCloudRevisionSource.includes('this.persistPendingChallengeStartForSlotReload();'), 'cloud history reload should preserve a pending challenge');
assert(resolveSaveConflictSource.includes('this.persistPendingChallengeStartForSlotReload();'), 'choosing the cloud conflict version should preserve a pending challenge');
assert(loadCloudGameSource.includes('this.persistPendingChallengeStartForSlotReload();'), 'legacy cloud loading should preserve a pending challenge');
assert(loadCloudGameSource.includes("sessionStorage.setItem('currentSaveSlot', String(slot))"), 'legacy cloud loading should bind the restored challenge to its slot');

assert(saveManagerSource.includes('res && res.conflict'), 'SaveManager should distinguish CAS conflicts from transport failures');
assert(saveManagerSource.includes('showSaveConflictModal(gameState, cloudData, cloudTime)'), 'SaveManager should open the conflict chooser with both versions');
assert(systemViewSource.includes('data-slot-mode="history"'), 'save slots should expose a cloud history action');
assert(systemViewSource.includes('data-cloud-revision-id'), 'history rows should expose restore actions through delegated events');
assert(systemViewSource.includes("action.disabled = isHead || !revisionId"), 'the current cloud head must not offer a redundant restore action');
assert(htmlSource.includes('id="cloud-save-history-modal"'), 'cloud history modal should be present in the application shell');
assert(htmlSource.includes('原记录保持不变'), 'history UI should state the non-destructive restore contract');
assert(cssSource.includes('.cloud-history-item'), 'cloud history rows should have stable layout styling');
assert(cssSource.includes('@media (max-width: 640px)'), 'cloud history UI should include a mobile layout');

console.log('Cloud state UI sanity checks passed.');
