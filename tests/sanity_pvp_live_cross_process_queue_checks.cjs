const assert = require('node:assert');
const { createLivePvpStore } = require('../server/pvp-live/live-store');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function makeLoadout(identitySlot, pattern) {
  const deck = [];
  for (let index = 0; index < 20; index += 1) {
    deck.push({ id: pattern[index % pattern.length], upgraded: false });
  }
  return {
    identitySlot,
    label: `${identitySlot}-跨进程测试谱`,
    deck,
  };
}

function makeRatingProvider(scoresByUserId) {
  return {
    async getLivePvpRating(userId) {
      const value = scoresByUserId[String(userId || '')];
      if (value && typeof value === 'object') {
        return {
          score: Number.isFinite(Number(value.score)) ? Number(value.score) : 1000,
          division: value.division || '玄阶',
          seasonId: value.seasonId || 's1-genesis',
          provisional: value.provisional,
          rankedGames: value.rankedGames,
        };
      }
      const score = Number(value);
      return {
        score: Number.isFinite(score) ? score : 1000,
        division: '玄阶',
        seasonId: 's1-genesis',
      };
    },
  };
}

function makeRecentOpponentPairKey(userIdA, userIdB) {
  const ids = [String(userIdA || '').trim(), String(userIdB || '').trim()].filter(Boolean).sort();
  return ids.length === 2 && ids[0] !== ids[1] ? `${ids[0]}::${ids[1]}` : '';
}

function finishStoreMatch(store, matchId, { winnerSeat = 'A', finishReason = 'surrender' } = {}) {
  const match = store.matches.get(matchId);
  assert.ok(match, `test match should exist before finishing: ${matchId}`);
  const loserSeat = winnerSeat === 'A' ? 'B' : 'A';
  match.state.status = 'finished';
  match.state.events.push({
    eventType: 'match_finished',
    sequence: (match.state.eventSeq || 0) + 1,
    payload: { winnerSeat, loserSeat, finishReason },
  });
  match.state.eventSeq = (match.state.eventSeq || 0) + 1;
  return store.releaseIfTerminal(match);
}

function makeSharedPersistence({ keepQueueRowsOnDelete = false } = {}) {
  const queueEntries = new Map();
  const queueHandoffs = new Map();
  const recentOpponents = new Map();
  const matches = new Map();
  const activeStatuses = new Set(['setup', 'active']);
  const claimHooks = new Map();

  return {
    async saveQueueEntry(queueEntry) {
      queueEntries.set(queueEntry.queueTicket, clone(queueEntry));
    },
    async deleteQueueEntry(queueTicket) {
      if (keepQueueRowsOnDelete) return;
      queueEntries.delete(String(queueTicket || ''));
    },
    async deleteQueueEntryForUser(userId) {
      if (keepQueueRowsOnDelete) return;
      const id = String(userId || '');
      for (const [ticket, entry] of queueEntries.entries()) {
        if (entry && entry.player && entry.player.userId === id) {
          queueEntries.delete(ticket);
        }
      }
    },
    async loadQueueEntryByTicket(queueTicket) {
      return clone(queueEntries.get(String(queueTicket || '')) || null);
    },
    async loadQueueEntryForUser(userId) {
      const id = String(userId || '');
      const entry = Array.from(queueEntries.values())
        .filter(candidate => candidate && candidate.player && candidate.player.userId === id)
        .sort((left, right) => left.createdAt - right.createdAt)[0] || null;
      return clone(entry);
    },
    async loadQueueEntriesExceptUser(userId) {
      const id = String(userId || '');
      return Array.from(queueEntries.values())
        .filter(candidate => candidate && candidate.player && candidate.player.userId !== id)
        .sort((left, right) => left.createdAt - right.createdAt)
        .map(clone);
    },
    async claimQueueEntry(queueTicket, userId) {
      const ticket = String(queueTicket || '');
      const id = String(userId || '');
      const entry = queueEntries.get(ticket) || null;
      if (!entry || !entry.player || entry.player.userId !== id) {
        return { claimed: false };
      }
      queueEntries.delete(ticket);
      const hook = claimHooks.get(ticket);
      if (hook) {
        claimHooks.delete(ticket);
        await hook({ queueTicket: ticket, userId: id, queueEntry: clone(entry) });
      }
      return { claimed: true, queueEntry: clone(entry) };
    },
    async claimQueueEntries(queueClaims) {
      const claims = (Array.isArray(queueClaims) ? queueClaims : []).map((claim) => ({
        queueTicket: String(claim && claim.queueTicket || ''),
        userId: String(claim && claim.userId || ''),
      }));
      if (claims.length === 0 || claims.some(claim => !claim.queueTicket || !claim.userId)) {
        return { claimed: false, claimedCount: 0 };
      }
      const uniqueTickets = new Set(claims.map(claim => claim.queueTicket));
      if (uniqueTickets.size !== claims.length) return { claimed: false, claimedCount: 0 };
      const entries = claims.map((claim) => queueEntries.get(claim.queueTicket) || null);
      const allPresent = entries.every((entry, index) => entry
        && entry.player
        && entry.player.userId === claims[index].userId);
      if (!allPresent) return { claimed: false, claimedCount: 0 };
      claims.forEach(claim => queueEntries.delete(claim.queueTicket));
      for (let index = 0; index < claims.length; index += 1) {
        const hook = claimHooks.get(claims[index].queueTicket);
        if (!hook) continue;
        claimHooks.delete(claims[index].queueTicket);
        await hook({ queueTicket: claims[index].queueTicket, userId: claims[index].userId, queueEntry: clone(entries[index]) });
      }
      return { claimed: true, claimedCount: claims.length, queueEntries: entries.map(clone) };
    },
    async saveMatch(match) {
      matches.set(match.matchId, clone(match));
    },
    async saveMatchEvents() {},
    async saveQueueHandoff(handoff) {
      queueHandoffs.set(String(handoff.queueTicket || ''), clone(handoff));
    },
    async loadQueueHandoff(queueTicket, userId) {
      const handoff = queueHandoffs.get(String(queueTicket || '')) || null;
      if (!handoff || handoff.userId !== userId) return null;
      return clone(handoff);
    },
    async saveRecentOpponentPair(pair) {
      const key = makeRecentOpponentPairKey(pair && pair.userIdA, pair && pair.userIdB);
      if (!key) return;
      recentOpponents.set(key, clone({
        pairKey: key,
        userIdA: key.split('::')[0],
        userIdB: key.split('::')[1],
        lastMatchId: String(pair.lastMatchId || ''),
        lastMatchedAt: Number(pair.lastMatchedAt) || 0,
      }));
    },
    async loadRecentOpponentPair(userIdA, userIdB) {
      return clone(recentOpponents.get(makeRecentOpponentPairKey(userIdA, userIdB)) || null);
    },
    async loadActiveMatchForUser(userId) {
      const id = String(userId || '');
      const match = Array.from(matches.values())
        .find(candidate => candidate
          && candidate.seatsByUserId
          && candidate.seatsByUserId[id]
          && candidate.state
          && activeStatuses.has(candidate.state.status)) || null;
      return clone(match);
    },
    inspectQueueTickets() {
      return Array.from(queueEntries.keys());
    },
    setClaimHook(queueTicket, hook) {
      claimHooks.set(String(queueTicket || ''), hook);
    },
  };
}

(async () => {
  let now = 1_000_000;

  const persistence = makeSharedPersistence();
  const storeA = createLivePvpStore({ now: () => now, persistence });
  const storeB = createLivePvpStore({ now: () => now, persistence });
  const storeC = createLivePvpStore({ now: () => now, persistence });

  const joinA = await storeA.joinQueue({
    userId: 'cross-process-user-a',
    displayName: '跨甲',
    loadout: makeLoadout('sword', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']),
  });
  assert.equal(joinA.status, 'waiting', 'process A first player should wait in public queue');
  assert.ok(joinA.queueTicket, 'process A waiting player should receive a queue ticket');

  now += 1500;

  const joinB = await storeB.joinQueue({
    userId: 'cross-process-user-b',
    displayName: '跨乙',
    loadout: makeLoadout('shield', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']),
  });
  assert.equal(joinB.status, 'matched', 'process B second player should create a shared live match');
  assert.ok(joinB.matchId, 'process B matched player should receive match id');

  const fakeTicketPoll = await storeC.getQueueStatus('cross-process-user-a', 'pvplq-not-real-ticket');
  assert.equal(
    fakeTicketPoll,
    null,
    'stateless process should not recover a match for a queue ticket that never belonged to the player',
  );

  const pollAOnStatelessProcess = await storeC.getQueueStatus('cross-process-user-a', joinA.queueTicket);
  assert.equal(
    pollAOnStatelessProcess && pollAOnStatelessProcess.status,
    'matched',
    'stateless process should recover the cross-process match even after the queue row was consumed',
  );
  assert.equal(
    pollAOnStatelessProcess.matchId,
    joinB.matchId,
    'stateless process recovered match should be the match created by process B',
  );
  const repeatedStatelessPoll = await storeC.getQueueStatus('cross-process-user-a', joinA.queueTicket);
  assert.equal(
    repeatedStatelessPoll,
    null,
    'stateless process should consume the recovered queue ticket after the first matched poll',
  );

  const pollAOnOriginalProcess = await storeA.getQueueStatus('cross-process-user-a', joinA.queueTicket);
  assert.equal(
    pollAOnOriginalProcess && pollAOnOriginalProcess.status,
    'matched',
    'process A waiting player should recover the cross-process match from persistence instead of receiving 404/waiting',
  );
  assert.equal(
    pollAOnOriginalProcess.matchId,
    joinB.matchId,
    'process A recovered match should be the match created by process B',
  );
  assert.equal(
    pollAOnOriginalProcess.stateView?.matchQuality?.reportVersion,
    'pvp-live-match-quality-v1',
    'cross-process recovered match should keep the authoritative match quality report',
  );
  assert.deepEqual(
    persistence.inspectQueueTickets(),
    [],
    'cross-process match handoff should consume both public queue tickets',
  );

  const currentFirstPersistence = makeSharedPersistence();
  const currentFirstStoreA = createLivePvpStore({ now: () => now, persistence: currentFirstPersistence });
  const currentFirstStoreB = createLivePvpStore({ now: () => now, persistence: currentFirstPersistence });
  const currentFirstJoinA = await currentFirstStoreA.joinQueue({
    userId: 'cross-process-current-first-a',
    displayName: '先读甲',
    loadout: makeLoadout('sword', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']),
  });
  const currentFirstJoinB = await currentFirstStoreB.joinQueue({
    userId: 'cross-process-current-first-b',
    displayName: '先读乙',
    loadout: makeLoadout('shield', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']),
  });
  assert.equal(currentFirstJoinB.status, 'matched', 'current-first second player should create match');
  const currentFirstMatch = await currentFirstStoreA.getActiveMatchForUser('cross-process-current-first-a');
  assert.equal(currentFirstMatch?.match?.matchId, currentFirstJoinB.matchId, 'current-first player should recover active match before queue poll');
  const currentFirstQueuePoll = await currentFirstStoreA.getQueueStatus('cross-process-current-first-a', currentFirstJoinA.queueTicket);
  assert.equal(
    currentFirstQueuePoll?.status,
    'matched',
    'queue ticket should still hand off once after current-match recovery clears local waiting state',
  );

  const laggingDeletePersistence = makeSharedPersistence({ keepQueueRowsOnDelete: true });
  const laggingStoreA = createLivePvpStore({ now: () => now, persistence: laggingDeletePersistence });
  const laggingStoreB = createLivePvpStore({ now: () => now, persistence: laggingDeletePersistence });
  const laggingStoreC = createLivePvpStore({ now: () => now, persistence: laggingDeletePersistence });
  const laggingJoinA = await laggingStoreA.joinQueue({
    userId: 'cross-process-lagging-delete-a',
    displayName: '滞删甲',
    loadout: makeLoadout('sword', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']),
  });
  const laggingJoinB = await laggingStoreB.joinQueue({
    userId: 'cross-process-lagging-delete-b',
    displayName: '滞删乙',
    loadout: makeLoadout('shield', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']),
  });
  assert.equal(laggingJoinB.status, 'matched', 'lagging-delete second player should create match');
  const laggingPoll = await laggingStoreC.getQueueStatus('cross-process-lagging-delete-a', laggingJoinA.queueTicket);
  assert.equal(
    laggingPoll?.status,
    'matched',
    'stateless process should use the persisted handoff even when queue-row deletion lags behind match creation',
  );

  const staleClaimPersistence = makeSharedPersistence();
  const staleClaimStoreA = createLivePvpStore({ now: () => now, persistence: staleClaimPersistence });
  const staleClaimStoreB = createLivePvpStore({ now: () => now, persistence: staleClaimPersistence });
  const staleClaimStoreC = createLivePvpStore({ now: () => now, persistence: staleClaimPersistence });
  const staleClaimJoinA = await staleClaimStoreA.joinQueue({
    userId: 'cross-process-stale-claim-a',
    displayName: '抢占甲',
    loadout: makeLoadout('sword', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']),
  });
  assert.equal(staleClaimJoinA.status, 'waiting', 'stale claim first player should enter queue');
  await staleClaimStoreC.hydrateWaitingQueueEntriesExceptUser('cross-process-stale-claim-c');
  const staleClaimJoinB = await staleClaimStoreB.joinQueue({
    userId: 'cross-process-stale-claim-b',
    displayName: '抢占乙',
    loadout: makeLoadout('shield', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']),
  });
  assert.equal(staleClaimJoinB.status, 'matched', 'stale claim second process should create the first match');
  const staleClaimJoinC = await staleClaimStoreC.joinQueue({
    userId: 'cross-process-stale-claim-c',
    displayName: '抢占丙',
    loadout: makeLoadout('mirror', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']),
  });
  assert.equal(
    staleClaimJoinC.status,
    'waiting',
    'stale local queue candidate should not create a duplicate match after atomic claim fails',
  );
  assert.notEqual(
    staleClaimJoinC.matchId,
    staleClaimJoinB.matchId,
    'stale local queue candidate should not reuse the consumed opponent ticket for a second match',
  );

  const pairClaimPersistence = makeSharedPersistence();
  const pairClaimRatings = makeRatingProvider({
    'cross-process-pair-claim-a': 1250,
    'cross-process-pair-claim-b': 1000,
    'cross-process-pair-claim-c': 1260,
  });
  const pairStoreOptions = {
    now: () => now,
    persistence: pairClaimPersistence,
    ratingProvider: pairClaimRatings,
    longWaitThresholdMs: 1000,
  };
  const pairClaimStoreA = createLivePvpStore(pairStoreOptions);
  const pairClaimStoreB = createLivePvpStore(pairStoreOptions);
  const pairClaimStoreC = createLivePvpStore(pairStoreOptions);
  const pairJoinA = await pairClaimStoreA.joinQueue({
    userId: 'cross-process-pair-claim-a',
    displayName: '双票甲',
    loadout: makeLoadout('sword', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']),
  });
  assert.equal(pairJoinA.status, 'waiting', 'pair claim first waiting player should queue without wide consent');
  now += 3000;
  const pairJoinB = await pairClaimStoreB.joinQueue({
    userId: 'cross-process-pair-claim-b',
    displayName: '双票乙',
    loadout: makeLoadout('shield', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']),
    wideMatchConsent: true,
  });
  assert.equal(pairJoinB.status, 'waiting', 'pair claim wide opponent should wait until both sides consent');
  assert.ok(pairJoinB.queueTicket, 'pair claim wide opponent should keep a queue ticket');
  await pairClaimStoreC.hydrateWaitingQueueEntriesExceptUser('cross-process-pair-claim-c');
  now += 3000;
  let interleavedPairJoinC = null;
  pairClaimPersistence.setClaimHook(pairJoinA.queueTicket, async () => {
    interleavedPairJoinC = await pairClaimStoreC.joinQueue({
      userId: 'cross-process-pair-claim-c',
      displayName: '双票丙',
      loadout: makeLoadout('mirror', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']),
    });
  });
  const pairJoinAConsent = await pairClaimStoreA.joinQueue({
    userId: 'cross-process-pair-claim-a',
    displayName: '双票甲',
    loadout: makeLoadout('sword', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']),
    wideMatchConsent: true,
  });
  assert.equal(pairJoinAConsent.status, 'matched', 'pair claim consenting waiting player should match the accepted wide opponent');
  assert.ok(interleavedPairJoinC, 'pair claim hook should interleave the third process before match creation');
  assert.equal(
    interleavedPairJoinC.status,
    'waiting',
    'existing waiting ticket should be claimed atomically before match creation',
  );
  assert.notEqual(
    interleavedPairJoinC.matchId,
    pairJoinAConsent.matchId,
    'existing waiting ticket should not appear in two live matches after pair claim',
  );

  const recentStore = createLivePvpStore({
    now: () => now,
    recentOpponentCooldownMs: 10 * 60 * 1000,
  });
  const recentJoinA1 = await recentStore.joinQueue({
    userId: 'recent-opponent-a',
    displayName: '近期甲',
    loadout: makeLoadout('sword', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']),
  });
  assert.equal(recentJoinA1.status, 'waiting', 'recent opponent seed should wait before first match');
  now += 1000;
  const recentJoinB1 = await recentStore.joinQueue({
    userId: 'recent-opponent-b',
    displayName: '近期乙',
    loadout: makeLoadout('shield', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']),
  });
  assert.equal(recentJoinB1.status, 'matched', 'recent opponent pair should match before any recent history exists');
  await finishStoreMatch(recentStore, recentJoinB1.matchId, { winnerSeat: 'A', finishReason: 'surrender' });
  now += 1000;
  const recentJoinA2 = await recentStore.joinQueue({
    userId: 'recent-opponent-a',
    displayName: '近期甲',
    loadout: makeLoadout('sword', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']),
  });
  assert.equal(recentJoinA2.status, 'waiting', 'recent opponent returning player should wait for a new opponent');
  now += 1000;
  const recentJoinB2 = await recentStore.joinQueue({
    userId: 'recent-opponent-b',
    displayName: '近期乙',
    loadout: makeLoadout('shield', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']),
  });
  assert.equal(recentJoinB2.status, 'waiting', 'recent opponent should not be rematched immediately after a finished match');
  assert.ok(
    recentJoinB2.waitingReport?.safeguards?.includes('recent_opponent_suppression'),
    'recent opponent waiting report should expose recent-opponent suppression safeguard',
  );
  assert.match(
    recentJoinB2.waitingReport?.message || '',
    /近期对手|换一位/,
    'recent opponent waiting report should explain why the player is still waiting',
  );
  const recentAStatus = await recentStore.getQueueStatus('recent-opponent-a', recentJoinA2.queueTicket);
  assert.equal(recentAStatus?.status, 'waiting', 'original recent opponent queue ticket should stay waiting');
  assert.ok(
    recentAStatus?.waitingReport?.safeguards?.includes('recent_opponent_suppression'),
    'both sides should see the recent-opponent suppression safeguard while waiting',
  );
  now += 1000;
  const recentJoinC = await recentStore.joinQueue({
    userId: 'recent-opponent-c',
    displayName: '近期丙',
    loadout: makeLoadout('mirror', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']),
  });
  assert.equal(recentJoinC.status, 'matched', 'a third player should still be able to match into the waiting pool');
  const recentMatchedNames = [recentJoinC.stateView.self.displayName, recentJoinC.stateView.opponent.displayName].sort();
  assert.notDeepStrictEqual(
    recentMatchedNames,
    ['近期甲', '近期乙'].sort(),
    'recent opponent suppression should avoid recreating the just-finished pair',
  );
  assert.ok(recentMatchedNames.includes('近期丙'), 'third player should be one side of the resolved match');

  const persistedRecentPairs = makeSharedPersistence();
  const persistedRecentStoreA = createLivePvpStore({
    now: () => now,
    persistence: persistedRecentPairs,
    recentOpponentCooldownMs: 10 * 60 * 1000,
  });
  const persistedRecentStoreB = createLivePvpStore({
    now: () => now,
    persistence: persistedRecentPairs,
    recentOpponentCooldownMs: 10 * 60 * 1000,
  });
  const persistedRecentStoreC = createLivePvpStore({
    now: () => now,
    persistence: persistedRecentPairs,
    recentOpponentCooldownMs: 10 * 60 * 1000,
  });
  const persistedRecentStoreD = createLivePvpStore({
    now: () => now,
    persistence: persistedRecentPairs,
    recentOpponentCooldownMs: 10 * 60 * 1000,
  });
  now += 1000;
  const persistedRecentA1 = await persistedRecentStoreA.joinQueue({
    userId: 'persisted-recent-a',
    displayName: '持久甲',
    loadout: makeLoadout('sword', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']),
  });
  assert.equal(persistedRecentA1.status, 'waiting', 'persisted recent seed should wait before first match');
  now += 1000;
  const persistedRecentB1 = await persistedRecentStoreB.joinQueue({
    userId: 'persisted-recent-b',
    displayName: '持久乙',
    loadout: makeLoadout('shield', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']),
  });
  assert.equal(persistedRecentB1.status, 'matched', 'persisted recent pair should match before history exists');
  await finishStoreMatch(persistedRecentStoreB, persistedRecentB1.matchId, { winnerSeat: 'A', finishReason: 'surrender' });
  now += 1000;
  const persistedRecentA2 = await persistedRecentStoreC.joinQueue({
    userId: 'persisted-recent-a',
    displayName: '持久甲',
    loadout: makeLoadout('sword', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']),
  });
  assert.equal(persistedRecentA2.status, 'waiting', 'persisted recent returning player should wait in a fresh process');
  now += 1000;
  const persistedRecentB2 = await persistedRecentStoreD.joinQueue({
    userId: 'persisted-recent-b',
    displayName: '持久乙',
    loadout: makeLoadout('shield', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']),
  });
  assert.equal(
    persistedRecentB2.status,
    'waiting',
    'recent opponent suppression should survive process boundaries through persistence',
  );
  assert.ok(
    persistedRecentB2.waitingReport?.safeguards?.includes('recent_opponent_suppression'),
    'persisted recent opponent suppression should still expose the waiting safeguard',
  );

  const lowSampleOpenPoolRatings = makeRatingProvider({
    'open-pool-low-a': { score: 1000, rankedGames: 0, provisional: true },
    'open-pool-low-b': { score: 1000, rankedGames: 0, provisional: true },
    'open-pool-low-c': { score: 1000, rankedGames: 0, provisional: true },
  });
  const lowSampleOpenPoolPersistence = makeSharedPersistence();
  const lowSampleOpenPoolStore = createLivePvpStore({
    now: () => now,
    ratingProvider: lowSampleOpenPoolRatings,
    longWaitThresholdMs: 120000,
    persistence: lowSampleOpenPoolPersistence,
  });
  now += 1000;
  const openPoolLowA = await lowSampleOpenPoolStore.joinQueue({
    userId: 'open-pool-low-a',
    displayName: '开池低样本甲',
    loadout: makeLoadout('sword', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']),
  });
  assert.equal(openPoolLowA.status, 'waiting', 'first low-sample open-pool player should seed the queue');
  now += 1000;
  const openPoolLowB = await lowSampleOpenPoolStore.joinQueue({
    userId: 'open-pool-low-b',
    displayName: '开池低样本乙',
    loadout: makeLoadout('shield', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']),
  });
  assert.equal(
    openPoolLowB.status,
    'waiting',
    'two-player low-sample open pool should wait instead of instantly starting a fragile first match',
  );
  assert.ok(
    openPoolLowB.waitingReport?.safeguards?.includes('low_sample_protection'),
    'two-player low-sample open pool should expose low-sample protection while waiting',
  );
  assert.equal(
    openPoolLowB.waitingReport?.protectionReason,
    'low_sample_protection',
    'two-player low-sample open pool should expose structured protection reason',
  );
  assert.equal(
    openPoolLowB.waitingReport?.releaseMode,
    'need_third_player',
    'two-player low-sample open pool should explain it is waiting for a third player',
  );
  assert.equal(
    openPoolLowB.waitingReport?.requiresPoolSize,
    3,
    'two-player low-sample open pool should expose the release pool size',
  );
  assert.equal(
    openPoolLowB.waitingReport?.candidatePoolSize,
    2,
    'two-player low-sample open pool should expose the current candidate pool size',
  );
  assert.ok(
    openPoolLowB.waitingReport?.releaseAt > now,
    'two-player low-sample open pool should expose the long-wait release timestamp',
  );
  assert.ok(
    openPoolLowB.waitingReport?.currentEligibleActions?.includes('practice'),
    'two-player low-sample open pool should expose practice as a structured action',
  );
  const lowSampleFreshStatusStore = createLivePvpStore({
    now: () => now,
    ratingProvider: lowSampleOpenPoolRatings,
    longWaitThresholdMs: 120000,
    persistence: lowSampleOpenPoolPersistence,
  });
  const openPoolLowBFreshStatus = await lowSampleFreshStatusStore.getQueueStatus('open-pool-low-b', openPoolLowB.queueTicket);
  assert.equal(
    openPoolLowBFreshStatus?.waitingReport?.candidatePoolSize,
    2,
    'fresh process low-sample queue status should hydrate peer tickets before reporting candidate pool size',
  );
  assert.equal(
    openPoolLowBFreshStatus?.waitingReport?.releaseMode,
    'need_third_player',
    'fresh process low-sample queue status should preserve need_third_player release mode before threshold',
  );
  now += 120000;
  const openPoolLowBLongWait = await lowSampleOpenPoolStore.getQueueStatus('open-pool-low-b', openPoolLowB.queueTicket);
  assert.equal(
    openPoolLowBLongWait?.waitingReport?.releaseMode,
    'long_wait_release',
    'low-sample waiting report should switch to long_wait_release after the threshold',
  );
  assert.equal(
    openPoolLowBLongWait?.waitingReport?.releaseInMs,
    0,
    'low-sample long-wait release should expose zero remaining release time',
  );
  now += 1000;
  const openPoolLowC = await lowSampleOpenPoolStore.joinQueue({
    userId: 'open-pool-low-c',
    displayName: '开池低样本丙',
    loadout: makeLoadout('mirror', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']),
  });
  assert.equal(openPoolLowC.status, 'matched', 'third low-sample open-pool player should release the low-sample pool into a real match');
  assert.equal(
    openPoolLowC.stateView.matchQuality?.expansionStage,
    'low_sample_pairing',
    'released low-sample open-pool match should expose low_sample_pairing stage',
  );
  assert.ok(
    openPoolLowC.stateView.matchQuality?.safeguards?.includes('low_sample_protection'),
    'released low-sample open-pool match should keep low-sample protection in match quality',
  );

  const lowSampleRatings = makeRatingProvider({
    'low-sample-established': { score: 1000, rankedGames: 12, provisional: false },
    'low-sample-waiting': { score: 1000, rankedGames: 1, provisional: false },
    'low-sample-requester': { score: 1000, rankedGames: 0, provisional: true },
  });
  const lowSampleStore = createLivePvpStore({
    now: () => now,
    ratingProvider: lowSampleRatings,
    longWaitThresholdMs: 120000,
  });
  now += 1000;
  const establishedJoin = await lowSampleStore.joinQueue({
    userId: 'low-sample-established',
    displayName: '老练同分',
    loadout: makeLoadout('shield', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']),
  });
  assert.equal(establishedJoin.status, 'waiting', 'established same-score player should seed the low-sample protection test');
  now += 1000;
  const lowWaitingJoin = await lowSampleStore.joinQueue({
    userId: 'low-sample-waiting',
    displayName: '低样本候选',
    loadout: makeLoadout('sword', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']),
  });
  assert.equal(
    lowWaitingJoin.status,
    'waiting',
    'low-sample player should not be immediately paired into an established same-score opponent',
  );
  assert.ok(
    lowWaitingJoin.waitingReport?.safeguards?.includes('low_sample_protection'),
    'low-sample waiting report should expose the low-sample protection safeguard',
  );
  assert.match(
    lowWaitingJoin.waitingReport?.message || '',
    /低样本|样本保护|稳妥/,
    'low-sample waiting report should explain why matchmaking is still waiting',
  );
  now += 1000;
  const lowRequesterJoin = await lowSampleStore.joinQueue({
    userId: 'low-sample-requester',
    displayName: '低样本请求者',
    loadout: makeLoadout('mirror', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']),
  });
  assert.equal(lowRequesterJoin.status, 'matched', 'low-sample requester should match another low-sample candidate');
  const lowSampleMatchedNames = [lowRequesterJoin.stateView.self.displayName, lowRequesterJoin.stateView.opponent.displayName].sort();
  assert.deepEqual(
    lowSampleMatchedNames,
    ['低样本候选', '低样本请求者'].sort(),
    'low-sample protection should prefer a low-sample pair over an established same-score player',
  );
  assert.equal(
    lowRequesterJoin.stateView.matchQuality?.expansionStage,
    'low_sample_pairing',
    'low-sample pair should expose a dedicated low-sample pairing stage',
  );
  assert.ok(
    lowRequesterJoin.stateView.matchQuality?.safeguards?.includes('low_sample_protection'),
    'low-sample matched quality should keep the low-sample protection safeguard',
  );
  assert.ok(
    !/rankedGames|ranked_games/.test(JSON.stringify(lowRequesterJoin.stateView.matchQuality || {})),
    'low-sample match quality should not expose exact ranked game count fields',
  );
  const establishedStillWaiting = await lowSampleStore.getQueueStatus('low-sample-established', establishedJoin.queueTicket);
  assert.equal(establishedStillWaiting?.status, 'waiting', 'established same-score player should remain waiting after low-sample pair resolves');

  console.log('sanity_pvp_live_cross_process_queue_checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
