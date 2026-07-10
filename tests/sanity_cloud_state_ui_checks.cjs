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
