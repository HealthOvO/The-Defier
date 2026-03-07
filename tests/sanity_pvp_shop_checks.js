const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function loadFile(ctx, filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, ctx, { filename: filePath });
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const storage = {};
  const makeStorage = () => ({
    getItem: (k) => (Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null),
    setItem: (k, v) => {
      storage[k] = String(v);
    },
    removeItem: (k) => {
      delete storage[k];
    }
  });

  const ctx = vm.createContext({
    console,
    window: {},
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    CARDS: {
      strike: { id: 'strike', type: 'attack' },
      defend: { id: 'defend', type: 'defense' },
      quickSlash: { id: 'quickSlash', type: 'attack' },
      meditation: { id: 'meditation', type: 'skill' }
    },
    STARTER_DECK: ['strike', 'defend', 'quickSlash', 'meditation'],
    Math,
    JSON,
    Date
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/data/shop-items.js'));
  loadFile(ctx, path.join(root, 'js/services/pvp-service.js'));
  const PVPService = vm.runInContext('PVPService', ctx);

  const titleState = PVPService.getShopItemState('title_supreme');
  assert(titleState.exists === true, 'title item should exist');
  assert(titleState.reason === 'insufficient', 'expensive title should be blocked by insufficient coins at start');
  const rewardPreview = PVPService.getRewardPreview(true, 1000);
  assert(!!(rewardPreview && rewardPreview.season && rewardPreview.season.name), 'reward preview should include season metadata');

  const boot = PVPService.getEconomySnapshot();
  PVPService.setEconomySnapshot({
    ...boot,
    coins: 14000,
    totalEarned: Math.max(14000, boot.totalEarned || 0)
  });

  for (let i = 0; i < 5; i += 1) {
    const res = PVPService.purchaseShopItem('item_reset_stats');
    assert(res.success === true, `consumable purchase ${i + 1} should succeed`);
  }

  const soldOutRes = PVPService.purchaseShopItem('item_reset_stats');
  assert(soldOutRes.success === false && soldOutRes.reason === 'sold_out', 'consumable should sell out after stock is exhausted');

  const soldOutState = PVPService.getShopItemState('item_reset_stats');
  assert(soldOutState.reason === 'sold_out', 'shop state should report sold_out after max purchases');

  const skinBuy = PVPService.purchaseShopItem('skin_void_walker');
  assert(skinBuy.success === true, 'skin purchase should succeed when wallet is sufficient');
  const equipped = PVPService.getEquippedCosmetics();
  assert(!!(equipped && equipped.skin && equipped.skin.id === 'skin_void_walker'), 'first purchased skin should auto-equip');

  const titleBuy = PVPService.purchaseShopItem('title_supreme');
  assert(titleBuy.success === true, 'title purchase should succeed when wallet is sufficient');
  const titleStateAfterBuy = PVPService.getShopItemState('title_supreme');
  assert(titleStateAfterBuy.reason === 'equipped', 'title should be in equipped state after first purchase');

  const unequipSkin = PVPService.handleShopItemAction('skin_void_walker');
  assert(unequipSkin.success === true, 'equipped skin action should allow unequip');
  const skinAfterUnequip = PVPService.getShopItemState('skin_void_walker');
  assert(skinAfterUnequip.reason === 'equippable', 'unequipped owned skin should become equippable');
  const equipAgain = PVPService.handleShopItemAction('skin_void_walker');
  assert(equipAgain.success === true, 'equippable skin action should equip again');
  const skinAfterEquip = PVPService.getShopItemState('skin_void_walker');
  assert(skinAfterEquip.reason === 'equipped', 'skin should return to equipped state after re-equip');

  const snap = PVPService.getEconomySnapshot();
  const injected = {
    ...snap,
    coins: 345,
    totalEarned: Math.max(snap.totalEarned || 0, 345),
    purchases: { ...snap.purchases, manual: 2 }
  };
  PVPService.setEconomySnapshot(injected);
  const wallet = PVPService.getWalletSummary();
  assert(wallet.coins === 345, 'economy snapshot restore should apply coin balance');
  assert(PVPService.getPurchaseCount('manual') === 2, 'economy snapshot restore should apply purchase counts');
  const logs = PVPService.getRecentTransactions(10);
  assert(logs.some((entry) => entry.type === 'purchase'), 'transaction log should include purchase records');

  console.log('PVP shop checks passed.');
})();
