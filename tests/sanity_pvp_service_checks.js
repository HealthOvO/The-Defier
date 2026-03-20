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

  const lowRankCandidate = {
    objectId: 'low-rank',
    user: { objectId: 'low-user', username: '试锋客' },
    score: 930,
    realm: 1,
    division: PVPService.getDivisionByScore(930)
  };
  const highRankCandidate = {
    objectId: 'high-rank',
    user: { objectId: 'high-user', username: '护山上人' },
    score: 1360,
    realm: 2,
    division: PVPService.getDivisionByScore(1360)
  };

  const lowPressureProfile = PVPService.getPVPDangerProfile({
    rank: lowRankCandidate
  }, {
    myScore: 1000,
    myRealm: 1
  });
  const highPressureProfile = PVPService.getPVPDangerProfile({
    rank: highRankCandidate,
    ghost: {
      config: {
        guardianFormation: true,
        personality: 'longevity'
      }
    },
    battleData: {
      me: { maxHp: 126, energy: 4, currEnergy: 4 },
      deck: PVPService.getPracticeDeck('fortified', 2),
      aiProfile: 'fortified',
      deckArchetype: 'fortified',
      personalityRules: { damageMul: 0.85, takenMul: 0.95, regenEnergyPerTurn: 0, hpMul: 1.3 }
    }
  }, {
    myScore: 1000,
    myRealm: 1
  });
  assert(lowPressureProfile && /DRI/.test(lowPressureProfile.line || ''), 'pvp danger profile should expose a DRI line');
  assert(Array.isArray(lowPressureProfile.axes) && lowPressureProfile.axes.length === 4, 'pvp danger profile should expose four axes');
  assert(lowPressureProfile.confidence === 'estimated', 'rank-only pvp preview should be marked as estimated');
  assert(highPressureProfile.confidence === 'resolved', 'snapshot-backed pvp profile should be marked as resolved');
  assert(highPressureProfile.index > lowPressureProfile.index, 'stronger pvp snapshot should produce higher danger index than weak rank-only preview');
  assert(
    highPressureProfile.dominantAxisId === 'attrition' || highPressureProfile.dominantAxisId === 'control',
    'fortified guardian snapshot should lean toward attrition/control pressure'
  );
  assert((highPressureProfile.tags || []).length > 0, 'pvp danger profile should expose readable tags');

  const focusSlip = PVPService.getFocusDuelSlip({
    rank: highRankCandidate,
    dangerProfile: highPressureProfile
  }, {
    myScore: 1000,
    myRealm: 1
  });
  const lowFocusSlip = PVPService.getFocusDuelSlip({
    rank: lowRankCandidate,
    dangerProfile: lowPressureProfile
  }, {
    myScore: 1000,
    myRealm: 1
  });
  const dossierContext = [
    { rank: lowRankCandidate, dangerProfile: lowPressureProfile, rankId: lowRankCandidate.objectId },
    { rank: highRankCandidate, dangerProfile: highPressureProfile, rankId: highRankCandidate.objectId }
  ];
  assert(/天道币/.test(focusSlip.winRewardText || ''), 'focus duel slip should expose win-side coin preview');
  assert(/道韵/.test(focusSlip.lossRewardText || ''), 'focus duel slip should expose loss-side rating preview');
  assert(/冲榜|练手|避战/.test(focusSlip.engagementLabel || ''), 'focus duel slip should classify engagement intent');
  assert(/直约|镜像/.test(focusSlip.modeLabel || ''), 'focus duel slip should classify matching mode');
  const focusDossier = PVPService.getFocusOpponentDossier({
    rank: highRankCandidate,
    dangerProfile: highPressureProfile,
    duelBrief: focusSlip
  }, {
    myScore: 1000,
    myRealm: 1,
    listContext: dossierContext
  });
  const estimatedDossier = PVPService.getFocusOpponentDossier({
    rank: lowRankCandidate,
    dangerProfile: lowPressureProfile,
    duelBrief: lowFocusSlip
  }, {
    myScore: 1000,
    myRealm: 1,
    listContext: dossierContext
  });
  const degradedDossier = PVPService.getFocusOpponentDossier({
    rank: {
      user: { username: '残卷客' },
      score: 1010,
      realm: 1
    }
  }, {
    myScore: 1000,
    myRealm: 1
  });
  assert(/DRI/.test(focusDossier.riskLine || ''), 'focus dossier should expose readable risk line');
  assert(/榜差/.test(focusDossier.scoreLine || ''), 'focus dossier should expose score gap line');
  assert(/开天赛季/.test(focusDossier.seasonLine || ''), 'focus dossier should expose concrete season line');
  assert(Array.isArray(focusDossier.clueCards) && focusDossier.clueCards.length === 6, 'focus dossier should expose six clue cards after season deepening');
  assert(focusDossier.clueCards.some((item) => /约战路径/.test(item.label || '') && /直约|镜像/.test(item.value || '')), 'focus dossier should expose routing clue');
  assert(focusDossier.clueCards.some((item) => /分段标签/.test(item.label || '') && item.value.length > 0), 'focus dossier should expose a season segment clue');
  assert(focusDossier.clueCards.some((item) => /跨场对照/.test(item.label || '') && item.value.length > 0), 'focus dossier should expose ranking comparison clue');
  assert((focusDossier.segmentLabel || '').length > 0 && (focusDossier.segmentLine || '').length > 0, 'focus dossier should expose season segment metadata');
  assert((focusDossier.comparisonValue || '').length > 0 && (focusDossier.comparisonLine || '').length > 0, 'focus dossier should expose comparison metadata');
  assert(focusDossier.historyCount === 0 && focusDossier.trendSampleCount === 0, 'fresh dossier should start without direct history or trend samples');
  assert(/暂无直接交手/.test(focusDossier.historyValue || ''), 'fresh dossier should state direct history is empty');
  assert(/不冒充直样|真实留痕/.test(focusDossier.historyLine || ''), 'fresh dossier should explain that fallback evidence does not replace direct history');
  assert(focusDossier.historyTag === '待补样本', 'fresh dossier should label empty direct history as waiting for samples');
  assert(/趋势待形成/.test(focusDossier.trendValue || ''), 'fresh dossier should state trend is not formed yet');
  assert(/至少再完成 1 场/.test(focusDossier.trendLine || ''), 'fresh dossier should explain how to unlock multi-match trend');
  assert(focusDossier.trendTag === '样本待扩', 'fresh dossier should label empty trend as waiting for more samples');
  assert(focusDossier.ledgerValue === '本季账本 0 场', 'fresh dossier should expose an empty season ledger summary');
  assert(/建立首条赛季账本记录/.test(focusDossier.ledgerLine || ''), 'fresh dossier should explain how to seed the season ledger');
  assert(focusDossier.ledgerTag === '样本筛面', 'fresh dossier should label the ledger card as a sample scope hint');
  assert(Array.isArray(focusDossier.ledgerChips) && focusDossier.ledgerChips.length >= 3, 'fresh dossier should expose ledger scope chips');
  assert(Array.isArray(focusDossier.tags) && focusDossier.tags.length >= 4, 'focus dossier should expose readable dossier tags');
  assert(estimatedDossier.sourceLabel !== focusDossier.sourceLabel, 'estimated and resolved dossiers should distinguish source label');
  assert(/开天赛季/.test(estimatedDossier.seasonLine || ''), 'estimated dossier should still expose concrete season line');
  assert(Array.isArray(degradedDossier.clueCards) && degradedDossier.clueCards.length === 6, 'degraded dossier should keep stable clue card count');
  assert(degradedDossier.clueCards.every((item) => item && item.label && item.value), 'degraded dossier should keep renderable clue card fields');

  const cohortOnlyHistoryState = PVPService.normalizeEconomyState({
    ...PVPService.getEconomySnapshot(),
    matchHistory: [{
      seasonId: seasonMeta.id,
      seasonName: seasonMeta.name,
      opponentRankId: 'cohort-rank',
      opponentUserId: 'cohort-user',
      opponentName: '同卷试锋客',
      opponentDivision: highRankCandidate.division,
      opponentRealm: highRankCandidate.realm,
      didWin: false,
      verdictLabel: '换段失拍',
      ratingDelta: -12,
      coinsAwarded: 14,
      dangerIndex: highPressureProfile.index,
      dangerTierId: highPressureProfile.tierId,
      dangerTierLabel: highPressureProfile.tierLabel,
      dominantAxisId: highPressureProfile.dominantAxisId,
      dominantAxisLabel: highPressureProfile.dominantAxisLabel,
      segmentLabel: focusDossier.segmentLabel,
      comparisonValue: focusDossier.comparisonValue,
      at: Date.now() - 1500
    }]
  });
  const cohortFallbackDossier = PVPService.getFocusOpponentDossier({
    rank: highRankCandidate,
    dangerProfile: highPressureProfile,
    duelBrief: focusSlip
  }, {
    myScore: 1000,
    myRealm: 1,
    listContext: dossierContext,
    historyState: cohortOnlyHistoryState
  });
  assert(/暂无直接交手/.test(cohortFallbackDossier.historyValue || ''), 'cohort fallback should keep the direct-history card empty when no direct record exists');
  assert(/不冒充直样|尚未与这名对手的真实留痕/.test(cohortFallbackDossier.historyLine || ''), 'cohort fallback should stay explicit about missing direct record');
  assert(cohortFallbackDossier.historyTag === '待补样本' && cohortFallbackDossier.historyCount === 0, 'cohort fallback should not inflate direct-history metadata');
  assert(cohortFallbackDossier.trendValue === '首条样本承压', 'single cohort sample should surface first-sample pressure trend');
  assert(/同卷样本/.test(cohortFallbackDossier.trendLine || ''), 'cohort trend should remain explicitly labeled as fallback evidence');
  assert(cohortFallbackDossier.trendTag === '同卷 1 场' && cohortFallbackDossier.trendSampleCount === 1, 'cohort trend should expose fallback sample counters');
  assert(/本季账本 1 场 ｜ 直样 0 \/ 同卷 1/.test(cohortFallbackDossier.ledgerValue || ''), 'cohort fallback should surface ledger split between direct and fallback samples');
  assert(/当前可比样本 1 场/.test(cohortFallbackDossier.ledgerLine || ''), 'cohort fallback should explain current comparable sample count');

  const breakthroughReview = PVPService.getPvpResultReview({
    didWin: true,
    dangerProfile: highPressureProfile,
    ratingDelta: 28,
    coinsAwarded: 96,
    opponent: highPressureProfile.opponent
  });
  assert(/DRI/.test(breakthroughReview.chipText || ''), 'pvp result review should expose a chip text with DRI');
  assert(/越压|稳中|按卷/.test(breakthroughReview.verdictLabel || ''), 'victory review should classify the result');
  assert((breakthroughReview.focusText || '').length > 0 && (breakthroughReview.nextText || '').length > 0, 'pvp result review should provide actionable recap lines');
  assert(/天道币 \+96/.test(breakthroughReview.economyLine || ''), 'pvp result review should surface coin reward changes');

  const defeatReview = PVPService.getPvpResultReview({
    didWin: false,
    dangerProfile: lowPressureProfile,
    ratingDelta: -11,
    coinsAwarded: 0,
    opponent: lowPressureProfile.opponent
  });
  assert(/失/.test(defeatReview.verdictLabel || '') || /换段/.test(defeatReview.verdictLabel || ''), 'defeat review should classify the miss');
  assert(/道韵 -11/.test(defeatReview.economyLine || ''), 'defeat review should reflect negative rating delta');

  const focusedPracticeA = await PVPService.findOpponent(1000, 2, {
    allowPractice: true,
    preferredRank: highRankCandidate,
    preferredDangerProfile: highPressureProfile
  });
  const focusedPracticeB = await PVPService.findOpponent(1000, 2, {
    allowPractice: true,
    preferredRank: highRankCandidate,
    preferredDangerProfile: highPressureProfile
  });
  assert(focusedPracticeA.success === true && focusedPracticeB.success === true, 'focused practice should succeed offline');
  assert(focusedPracticeA.opponent.rank.objectId === focusedPracticeB.opponent.rank.objectId, 'focused practice should lock to a deterministic mirror rank');
  assert(focusedPracticeA.opponent.rank.user.username === highRankCandidate.user.username, 'focused practice should inherit the selected target name');
  assert(!!(focusedPracticeA.opponent.matchIntent && focusedPracticeA.opponent.matchIntent.targetName === highRankCandidate.user.username), 'focused practice should carry focus match intent');
  assert(
    Array.isArray(focusedPracticeA.opponent.battleData.deck) && focusedPracticeA.opponent.battleData.deck.length >= 8,
    'focused practice mirror should still produce a playable deck'
  );

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
  const historyAfterSettle = PVPService.getRecentMatchHistory(8);
  assert(Array.isArray(historyAfterSettle) && historyAfterSettle.length >= 1, 'accepted settlement should append match history');
  assert(historyAfterSettle[0].opponentRankId === matchRes.opponent.rank.objectId, 'match history should bind to the settled opponent rank');
  assert(historyAfterSettle[0].opponentUserId === matchRes.opponent.rank.user.objectId, 'match history should bind to the settled opponent user');
  assert(historyAfterSettle[0].didWin === true, 'match history should record the settled result');
  assert(historyAfterSettle[0].coinsAwarded === settleRes.coinsAwarded, 'match history should record the granted coin reward');
  assert(historyAfterSettle[0].ratingDelta === settleRes.delta, 'match history should record the rating delta');
  assert((historyAfterSettle[0].segmentLabel || '').length > 0 && (historyAfterSettle[0].comparisonValue || '').length > 0, 'match history should persist dossier metadata for later aggregation');

  const postSettleBaseline = {
    myRank: PVPService.currentRankData,
    myScore: Number(PVPService.currentRankData.score) || 1000,
    myRealm: Number(PVPService.currentRankData.realm) || 1
  };
  const postSettleProfile = PVPService.getPVPDangerProfile(matchRes.opponent, postSettleBaseline);
  const postSettleSlip = PVPService.getFocusDuelSlip({
    rank: matchRes.opponent.rank,
    dangerProfile: postSettleProfile
  }, postSettleBaseline);
  const postSettleDossier = PVPService.getFocusOpponentDossier({
    rank: matchRes.opponent.rank,
    dangerProfile: postSettleProfile,
    duelBrief: postSettleSlip
  }, {
    ...postSettleBaseline,
    listContext: dossierContext,
    historyState: PVPService.getEconomySnapshot()
  });
  assert(postSettleDossier.historyCount === 1, 'direct dossier should expose one real history record after first accepted settlement');
  assert(/近1场 1胜0负/.test(postSettleDossier.historyValue || ''), 'direct dossier should summarize first direct win');
  assert(/最近一次/.test(postSettleDossier.historyLine || ''), 'direct dossier should expose the latest record time/detail');
  assert(postSettleDossier.trendSampleCount >= 1, 'direct dossier should expose at least one trend sample after first settlement');
  assert(/首条样本偏稳|持续走稳|走势回暖/.test(postSettleDossier.trendValue || ''), 'direct dossier should expose a positive trend after first win');
  assert(/本季账本 1 场 ｜ 直样 1 \/ 同卷 0/.test(postSettleDossier.ledgerValue || ''), 'direct dossier should update season ledger with the new direct sample');
  assert(/当前可比样本 1 场，其中直样 1、同卷回退 0/.test(postSettleDossier.ledgerLine || ''), 'direct dossier should explain the ledger sample composition after first settlement');

  const seedHistoryEntry = historyAfterSettle[0];
  const multiSampleState = PVPService.appendMatchHistory(
    PVPService.appendMatchHistory(PVPService.getEconomySnapshot(), {
      ...seedHistoryEntry,
      didWin: false,
      verdictLabel: '换段失拍',
      ratingDelta: -14,
      coinsAwarded: 12,
      at: Date.now() - 1500
    }),
    {
      ...seedHistoryEntry,
      didWin: true,
      verdictLabel: '稳中夺势',
      ratingDelta: 18,
      coinsAwarded: 64,
      at: Date.now() - 900
    }
  );
  const multiSampleDossier = PVPService.getFocusOpponentDossier({
    rank: matchRes.opponent.rank,
    dangerProfile: PVPService.getPVPDangerProfile(matchRes.opponent, {
      myRank: PVPService.currentRankData,
      myScore: Number(PVPService.currentRankData.score) || 1000,
      myRealm: Number(PVPService.currentRankData.realm) || 1
    }),
    duelBrief: PVPService.getFocusDuelSlip({
      rank: matchRes.opponent.rank,
      dangerProfile: PVPService.getPVPDangerProfile(matchRes.opponent, {
        myRank: PVPService.currentRankData,
        myScore: Number(PVPService.currentRankData.score) || 1000,
        myRealm: Number(PVPService.currentRankData.realm) || 1
      })
    }, {
      myRank: PVPService.currentRankData,
      myScore: Number(PVPService.currentRankData.score) || 1000,
      myRealm: Number(PVPService.currentRankData.realm) || 1
    })
  }, {
    myRank: PVPService.currentRankData,
    myScore: Number(PVPService.currentRankData.score) || 1000,
    myRealm: Number(PVPService.currentRankData.realm) || 1,
    listContext: dossierContext,
    historyState: multiSampleState
  });
  assert(multiSampleDossier.historyCount === 3, 'direct dossier should aggregate three accepted settlements against the same target');
  assert(/近3场/.test(multiSampleDossier.historyValue || ''), 'direct history summary should scale to the recent multi-match window');
  assert(multiSampleDossier.trendSampleCount === 3, 'trend sample count should reflect the recent three-match window');
  assert(/近3场/.test(multiSampleDossier.trendValue || ''), 'multi-match dossier should expose an aggregated trend summary');
  assert(/本季账本 3 场 ｜ 直样 3 \/ 同卷 0/.test(multiSampleDossier.ledgerValue || ''), 'multi-match dossier should aggregate the season ledger counts');
  assert(/当前可比样本 3 场，其中直样 3、同卷回退 0/.test(multiSampleDossier.ledgerLine || ''), 'multi-match dossier should explain the direct-only sample composition');

  const unrelatedDossier = PVPService.getFocusOpponentDossier({
    rank: lowRankCandidate,
    dangerProfile: lowPressureProfile,
    duelBrief: lowFocusSlip
  }, {
    ...postSettleBaseline,
    listContext: dossierContext,
    historyState: PVPService.getEconomySnapshot()
  });
  assert(unrelatedDossier.historyCount === 0, 'direct history should not leak to unrelated targets');
  const crossSeasonHistoryState = PVPService.normalizeEconomyState({
    ...PVPService.getEconomySnapshot(),
    matchHistory: (PVPService.getEconomySnapshot().matchHistory || []).concat([{
      seasonId: 's0-archived',
      seasonName: '封存赛季',
      opponentRankId: matchRes.opponent.rank.objectId,
      opponentUserId: matchRes.opponent.rank.user.objectId,
      opponentName: matchRes.opponent.rank.user.username,
      opponentDivision: matchRes.opponent.rank.division,
      opponentRealm: matchRes.opponent.rank.realm,
      didWin: false,
      verdictLabel: '旧赛季败场',
      ratingDelta: -12,
      coinsAwarded: 0,
      dangerIndex: 28,
      dangerTierId: 'controlled',
      dangerTierLabel: '可控',
      dominantAxisId: 'burst',
      dominantAxisLabel: '先手爆发',
      at: Date.now() - 86400000
    }])
  });
  const crossSeasonDossier = PVPService.getFocusOpponentDossier({
    rank: matchRes.opponent.rank,
    dangerProfile: postSettleProfile,
    duelBrief: postSettleSlip
  }, {
    ...postSettleBaseline,
    listContext: dossierContext,
    historyState: crossSeasonHistoryState
  });
  assert(crossSeasonDossier.historyCount === postSettleDossier.historyCount, 'history aggregation should ignore records from other seasons');
  const acceptedHistoryCount = PVPService.getRecentMatchHistory(24).length;

  const duplicateSettle = await PVPService.reportMatchResult(true, matchRes.opponent.rank, matchRes.opponent.matchTicket);
  assert(duplicateSettle.rejected === true, 'duplicate ticket settlement should be rejected');
  assert(PVPService.getRecentMatchHistory(24).length === acceptedHistoryCount, 'duplicate ticket should not append another history entry');

  const logs = PVPService.getRecentTransactions(6);
  assert(Array.isArray(logs) && logs.length > 0, 'economy should expose recent transaction logs');
  assert(logs.some((entry) => entry.type === 'match_reward'), 'transaction logs should contain match reward entry');

  const staleMatch = await PVPService.findOpponent(1000, 2, { allowPractice: true });
  assert(staleMatch.success === true, 'should be able to create another practice match');
  PVPService.activeMatch.issuedAt = Date.now() - (11 * 60 * 1000);
  PVPService.persistActiveMatch();
  const staleHistoryCount = PVPService.getRecentMatchHistory(24).length;
  const staleReport = await PVPService.reportMatchResult(true, staleMatch.opponent.rank, staleMatch.opponent.matchTicket);
  assert(staleReport.rejected === true, 'expired ticket should be rejected');
  assert(PVPService.getRecentMatchHistory(24).length === staleHistoryCount, 'expired ticket should not append history');

  const mismatchMatch = await PVPService.findOpponent(1000, 2, { allowPractice: true });
  assert(mismatchMatch.success === true, 'should create practice match for mismatch test');
  const mismatchRank = { ...mismatchMatch.opponent.rank, objectId: `${mismatchMatch.opponent.rank.objectId}-tampered` };
  const mismatchHistoryCount = PVPService.getRecentMatchHistory(24).length;
  const mismatchReport = await PVPService.reportMatchResult(true, mismatchRank, mismatchMatch.opponent.matchTicket);
  assert(mismatchReport.rejected === true, 'opponent mismatch should be rejected');
  assert(PVPService.getRecentMatchHistory(24).length === mismatchHistoryCount, 'opponent mismatch should not append history');

  const board = await PVPService.getLeaderboard();
  assert(Array.isArray(board) && board.length >= 3, 'leaderboard fallback should provide local board');
  const hasLocalSelf = board.some((r) => r && r.user && r.user.objectId === PVPService.currentRankData.user.objectId);
  assert(hasLocalSelf, 'leaderboard fallback should include local player');

  console.log('PVP service checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
