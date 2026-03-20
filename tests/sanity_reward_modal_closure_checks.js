const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createModal(id) {
  const state = new Set(['active']);
  return {
    id,
    onCloseCallback: null,
    classList: {
      contains(name) {
        return state.has(name);
      },
      add(name) {
        state.add(name);
      },
      remove(name) {
        state.delete(name);
      }
    }
  };
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const code = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');
  const rewardModal = createModal('reward-modal');
  const genericModal = createModal('generic-confirm-modal');

  const ctx = vm.createContext({
    console,
    Math,
    JSON,
    Date,
    window: {},
    document: {
      addEventListener: () => {},
      getElementById: (id) => {
        if (id === 'reward-modal') return rewardModal;
        if (id === 'generic-confirm-modal') return genericModal;
        if (id === 'purification-modal') return null;
        return null;
      },
      querySelectorAll: (selector) => {
        if (selector === '.modal') return [rewardModal, genericModal];
        return [];
      }
    },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
    alert: () => {},
    Utils: {
      showBattleLog: () => {}
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  vm.runInContext(code, ctx, { filename: 'game.js' });
  const Game = vm.runInContext('Game', ctx);
  const game = Object.create(Game.prototype);

  let rewardClosed = 0;
  rewardModal.onCloseCallback = () => {
    rewardClosed += 1;
  };

  game.closeModal();
  assert(rewardClosed === 1, `closing active reward modal should invoke callback exactly once, got ${rewardClosed}`);
  assert(!rewardModal.classList.contains('active'), 'reward modal should become inactive after closeModal');
  assert(!genericModal.classList.contains('active'), 'generic modal should also close through closeModal');

  game.closeModal();
  assert(rewardClosed === 1, 'reward modal callback should not fire again after it was already consumed');

  console.log('Reward modal closure checks passed.');
})();
