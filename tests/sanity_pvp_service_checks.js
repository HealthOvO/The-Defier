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

(async function run() {
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
      meditation: { id: 'meditation', type: 'skill' },
      heavyStrike: { id: 'heavyStrike', type: 'attack' },
      shieldWall: { id: 'shieldWall', type: 'defense' }
    },
    STARTER_DECK: ['strike', 'defend', 'quickSlash', 'meditation'],
    Math,
    JSON,
    Date
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/core/elo-calculator.js'));
  loadFile(ctx, path.join(root, 'js/data/shop-items.js'));
  loadFile(ctx, path.join(root, 'js/services/pvp-service.js'));

  const PVPService = vm.runInContext('PVPService', ctx);
  assert(PVPService && typeof PVPService.syncRank === 'function', 'PVPService should be available');

  await PVPService.syncRank();
  assert(PVPService.currentRankData && PVPService.currentRankData.isLocal, 'offline sync should initialize local rank');
  assert(PVPService.currentRankData.score === 1000, 'initial local rank score should be 1000');
  const wallet = PVPService.getWalletSummary();
  assert(wallet && wallet.coins >= 1200, 'wallet should initialize with starter pvp coins');
  const seasonMeta = PVPService.getCurrentSeasonMeta();
  assert(!!(seasonMeta && seasonMeta.name && seasonMeta.division), 'season meta should be available');

  const lowPreview = PVPService.getRewardPreview(true, 1000);
  PVPService.currentRankData.score = 1950;
  PVPService.currentRankData.division = PVPService.getDivisionByScore(1950);
  const highPreview = PVPService.getRewardPreview(true, 1000);
  assert(highPreview.totalReward > lowPreview.totalReward, 'high-division reward preview should exceed low-division preview');
  assert(
    (highPreview.breakdown && highPreview.breakdown.divisionMultiplier) > (lowPreview.breakdown && lowPreview.breakdown.divisionMultiplier),
    'division multiplier should scale up for higher divisions'
  );
  PVPService.currentRankData.score = 1000;
  PVPService.currentRankData.division = PVPService.getDivisionByScore(1000);

  const fakeGame = {
    saved: false,
    autoSave() {
      this.saved = true;
    },
    player: {
      deck: [],
      permaBuffs: { maxHp: 8, energy: 1, draw: 2, strength: 3, defense: 1 },
      addCardToDeck(card) {
        this.deck.push(card);
      },
      recalculateStatsCalled: 0,
      recalculateStats() {
        this.recalculateStatsCalled += 1;
      }
    }
  };

  const buyCard = PVPService.purchaseShopItem('secret_manual_2', { game: fakeGame });
  assert(buyCard.success === true, 'shop card purchase should succeed');
  assert((buyCard.wallet && buyCard.wallet.coins) < wallet.coins, 'successful purchase should reduce wallet');
  assert(fakeGame.player.deck.length === 1, 'card purchase should inject card into deck when game context exists');
  assert(fakeGame.saved === true, 'successful purchase should trigger game autosave');

  const buyCardAgain = PVPService.purchaseShopItem('secret_manual_2', { game: fakeGame });
  assert(buyCardAgain.success === false && buyCardAgain.reason === 'owned', 'duplicate non-consumable purchase should be blocked');

  const toppedUp = PVPService.getEconomySnapshot();
  PVPService.setEconomySnapshot({
    ...toppedUp,
    coins: 9000,
    totalEarned: Math.max(9000, toppedUp.totalEarned || 0)
  });
  const resetBuffs = PVPService.purchaseShopItem('item_reset_stats', { game: fakeGame });
  assert(resetBuffs.success === true, 'consumable should be purchasable');
  assert(fakeGame.player.permaBuffs.maxHp === 0 && fakeGame.player.permaBuffs.strength === 0, 'reset consumable should clear permanent stats');
  assert(fakeGame.player.recalculateStatsCalled > 0, 'reset consumable should recalculate player stats');

  const buyTitle = PVPService.purchaseShopItem('title_supreme', { game: fakeGame });
  assert(buyTitle.success === true, 'title cosmetic purchase should succeed when wallet is sufficient');
  const equippedAfterBuy = PVPService.getEquippedCosmetics();
  assert(!!(equippedAfterBuy && equippedAfterBuy.title && equippedAfterBuy.title.id === 'title_supreme'), 'title cosmetic should auto-equip after purchase');

  const titleState = PVPService.getShopItemState('title_supreme');
  assert(titleState.reason === 'equipped', 'equipped cosmetic should expose equipped state');

  const uploadRes = await PVPService.uploadSnapshot({
    powerScore: 246,
    realm: 3,
    personality: 'balanced',
    guardianFormation: true,
    data: {
      me: { maxHp: 120, energy: 4, currEnergy: 4 },
      deck: [{ id: 'strike', upgraded: false }, { id: 'defend', upgraded: true }],
      aiProfile: 'balanced'
    }
  });
  assert(uploadRes.success === true, 'offline snapshot upload should succeed');

  const mySnapshot = await PVPService.getMyDefenseSnapshot();
  assert(!!mySnapshot, 'offline snapshot should be retrievable');
  assert(Number(mySnapshot.powerScore) === 246, 'snapshot should keep uploaded powerScore');

  const matchRes = await PVPService.findOpponent(1000, 2, { allowPractice: true });
  assert(matchRes.success === true, 'offline findOpponent should fallback to practice opponent');
  assert(matchRes.opponent && matchRes.opponent.matchTicket, 'practice match should provide ticket');
  assert(Array.isArray(matchRes.opponent.battleData.deck) && matchRes.opponent.battleData.deck.length >= 8, 'practice opponent should have playable deck');

  const beforeScore = Number(PVPService.currentRankData.score) || 1000;
  const beforeCoins = PVPService.getWalletSummary().coins;
  const settleRes = await PVPService.reportMatchResult(true, matchRes.opponent.rank, matchRes.opponent.matchTicket);
  assert(!settleRes.rejected, 'valid practice ticket should be accepted');
  assert((Number(settleRes.newRating) || 0) > beforeScore, 'win should increase local rating');
  assert((Number(settleRes.coinsAwarded) || 0) > 0, 'valid settlement should grant pvp coins');
  assert((settleRes.wallet && settleRes.wallet.coins) > beforeCoins, 'settlement reward should increase wallet balance');
  assert((settleRes.wallet && settleRes.wallet.winStreak) >= 1, 'win settlement should update win streak');

  const duplicateSettle = await PVPService.reportMatchResult(true, matchRes.opponent.rank, matchRes.opponent.matchTicket);
  assert(duplicateSettle.rejected === true, 'duplicate ticket settlement should be rejected');

  const logs = PVPService.getRecentTransactions(6);
  assert(Array.isArray(logs) && logs.length > 0, 'economy should expose recent transaction logs');
  assert(logs.some((entry) => entry.type === 'match_reward'), 'transaction logs should contain match reward entry');

  const staleMatch = await PVPService.findOpponent(1000, 2, { allowPractice: true });
  assert(staleMatch.success === true, 'should be able to create another practice match');
  PVPService.activeMatch.issuedAt = Date.now() - (11 * 60 * 1000);
  PVPService.persistActiveMatch();
  const staleReport = await PVPService.reportMatchResult(true, staleMatch.opponent.rank, staleMatch.opponent.matchTicket);
  assert(staleReport.rejected === true, 'expired ticket should be rejected');

  const mismatchMatch = await PVPService.findOpponent(1000, 2, { allowPractice: true });
  assert(mismatchMatch.success === true, 'should create practice match for mismatch test');
  const mismatchRank = { ...mismatchMatch.opponent.rank, objectId: `${mismatchMatch.opponent.rank.objectId}-tampered` };
  const mismatchReport = await PVPService.reportMatchResult(true, mismatchRank, mismatchMatch.opponent.matchTicket);
  assert(mismatchReport.rejected === true, 'opponent mismatch should be rejected');

  const board = await PVPService.getLeaderboard();
  assert(Array.isArray(board) && board.length >= 3, 'leaderboard fallback should provide local board');
  const hasLocalSelf = board.some((r) => r && r.user && r.user.objectId === PVPService.currentRankData.user.objectId);
  assert(hasLocalSelf, 'leaderboard fallback should include local player');

  console.log('PVP service checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
