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
      const score = Number(scoresByUserId[String(userId || '')]);
      return {
        score: Number.isFinite(score) ? score : 1000,
        division: '玄阶',
        seasonId: 's1-genesis',
      };
    },
  };
}

function makeSharedPersistence({ keepQueueRowsOnDelete = false } = {}) {
  const queueEntries = new Map();
  const queueHandoffs = new Map();
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

  console.log('sanity_pvp_live_cross_process_queue_checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
