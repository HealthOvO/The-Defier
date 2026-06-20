const assert = require('assert');
const express = require('../server/node_modules/express');
const pvpLiveRoutes = require('../server/routes/pvp-live');
const { generateToken } = require('../server/middleware/auth');
const { buildMatchReplay } = require('../server/pvp-live/replay');

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

async function request(baseUrl, path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    payload = { raw: text };
  }
  return { status: response.status, ok: response.ok, payload };
}

function makeLoadout(identitySlot, pattern) {
  const deck = [];
  for (let index = 0; index < 20; index += 1) {
    deck.push({ id: pattern[index % pattern.length], upgraded: false });
  }
  return {
    identitySlot,
    label: `${identitySlot}-replay-测试谱`,
    deck
  };
}

function assertPublicReplayArraySanitizer() {
  const match = {
    matchId: 'pvplm-replay-public-array',
    state: {
      ruleVersion: 'pvp-live-v1',
      status: 'invalidated',
      roundIndex: 1,
      turnIndex: 1,
      seats: {
        A: { hp: 50 },
        B: { hp: 50 },
      },
      events: [],
    },
  };
  const replay = buildMatchReplay(match, 'A', 'replay_public', {
    events: [
      {
        eventType: 'connection_timeout',
        sequence: 1,
        actingSeat: '',
        visibility: 'public',
        payload: {
          seatId: '',
          disconnectedSeats: ['A', 'B'],
          phase: 'setup',
          elapsedMs: 30000,
          cardId: 'hidden-card-id',
        },
      },
      {
        eventType: 'ready_timeout',
        sequence: 2,
        actingSeat: '',
        visibility: 'public',
        payload: {
          unreadySeats: ['A', 'B'],
          readyDeadlineAt: 123456,
          elapsedMs: 10000,
          deck: ['hidden'],
        },
      },
      {
        eventType: 'match_invalidated',
        sequence: 3,
        actingSeat: '',
        visibility: 'public',
        payload: { reason: 'ready_timeout' },
      },
      {
        eventType: 'hp_recovered',
        sequence: 4,
        actingSeat: 'A',
        visibility: 'public',
        payload: {
          seatId: 'A',
          recoveredHp: 3,
          hp: 41,
          maxHp: 50,
          capped: false,
          sourceCardId: 'innerPeace',
          cardId: 'innerPeace',
          deck: ['hidden'],
        },
      },
    ],
  });
  assert.deepEqual(replay.events[0].publicData.disconnectedSeats, ['A', 'B'], 'public replay should preserve public disconnected seat arrays');
  assert.deepEqual(replay.events[1].publicData.unreadySeats, ['A', 'B'], 'public replay should preserve public ready-timeout seat arrays');
  assert.deepEqual(
    replay.events[3].publicData,
    { seatId: 'A', recoveredHp: 3, hp: 41, maxHp: 50, capped: false },
    'public replay should preserve only public hp_recovered fields'
  );
  assert.equal(JSON.stringify(replay.events).includes('hidden-card-id'), false, 'public replay should still strip non-allowlisted ids');
  assert.equal(JSON.stringify(replay.events).includes('hidden'), false, 'public replay should still strip hidden arrays');
  assert.equal(JSON.stringify(replay.events).includes('innerPeace'), false, 'public replay should strip hidden heal source card ids');
}

function makeReplaySettlementStub() {
  const seatUserId = (match, seatId) => Object.entries(match && match.seatsByUserId || {})
    .find(([, sourceSeat]) => sourceSeat === seatId)?.[0] || '';
  const makeSeasonHonorClaim = () => ({
    reportVersion: 'pvp-live-season-honor-claim-v1',
    rewardId: 's1_genesis_honor_mark_1',
    rewardType: 'cosmetic_badge',
    rewardName: '开天见证徽记',
    collectionState: 'newly_unlocked',
    rewardImpact: 'cosmetic_only',
    powerImpact: 'none',
    unlockedAt: Date.now(),
    collectionSize: 1,
    collectionReport: {
      reportVersion: 'pvp-live-season-honor-collection-v1',
      seasonId: 's1-genesis',
      rewardImpact: 'cosmetic_only',
      powerImpact: 'none',
      totalUnlocked: 1,
      lastUnlockedRewardId: 's1_genesis_honor_mark_1',
      boundary: '赛季荣誉收藏只保存外观成就，不授予卡牌、属性、资源、起手、匹配或战斗效果。'
    }
  });
  return {
    async settleMatch(match) {
      if (!match || !match.state || match.state.status !== 'finished' || match.state.mode === 'friendly') {
        return { settled: false, reason: 'not_ranked_finished' };
      }
      const finishedEvent = match.state.events.slice().reverse()
        .find(event => event && event.eventType === 'match_finished' && event.payload);
      const winnerSeat = String(finishedEvent && finishedEvent.payload && finishedEvent.payload.winnerSeat || '');
      if (winnerSeat !== 'A' && winnerSeat !== 'B') return { settled: false, reason: 'no_ranked_winner' };
      const loserSeat = winnerSeat === 'A' ? 'B' : 'A';
      return {
        settled: true,
        matchId: match.matchId,
        finishReason: String(finishedEvent.payload.finishReason || 'lethal'),
        settledAt: Date.now(),
        winner: {
          userId: seatUserId(match, winnerSeat),
          didWin: true,
          oldScore: 1000,
          newScore: 1024,
          ratingDelta: 24,
          coinsAwarded: 38,
          rankedGames: 1,
          seasonHonorClaim: makeSeasonHonorClaim()
        },
        loser: {
          userId: seatUserId(match, loserSeat),
          didWin: false,
          oldScore: 1000,
          newScore: 988,
          ratingDelta: -12,
          coinsAwarded: 12,
          rankedGames: 1,
          seasonHonorClaim: makeSeasonHonorClaim()
        }
      };
    }
  };
}

async function submitIntent(baseUrl, token, matchId, body) {
  return request(baseUrl, `/api/pvp/live/matches/${matchId}/intents`, {
    method: 'POST',
    token,
    body
  });
}

async function readyBoth(baseUrl, { matchId, tokenA, tokenB, stateVersionA }) {
  const readyA = await submitIntent(baseUrl, tokenA, matchId, {
    intentId: 'replay-ready-a',
    intentType: 'ready',
    stateVersion: stateVersionA,
    payload: {}
  });
  assert.equal(readyA.payload.result, 'accepted', 'first ready should be accepted');
  const readyB = await submitIntent(baseUrl, tokenB, matchId, {
    intentId: 'replay-ready-b',
    intentType: 'ready',
    stateVersion: readyA.payload.stateView.stateVersion,
    payload: {}
  });
  assert.equal(readyB.payload.result, 'accepted', 'second ready should be accepted');
  assert.equal(readyB.payload.stateView.status, 'active', 'both ready should start live battle');
  return readyB;
}

function assertNoHiddenReplayLeak(payload, label) {
  const text = JSON.stringify(payload || {});
  assert.ok(!/\b(hand|deck|deckOrder|cardId|instanceId|cardInstanceId|loadoutSnapshot|rngSeed|randomSeed|payload)\b/i.test(text), `${label} should not expose hidden card or raw payload fields`);
  assert.ok(!/[AB]-[a-zA-Z]+-\d+/.test(text), `${label} should not expose card instance token strings`);
}

function assertPublicReplayShape(replay, visibilityLayer) {
  assert.equal(replay.reportVersion, 'pvp-live-replay-v1', `${visibilityLayer} replay should expose report version`);
  assert.equal(replay.visibilityLayer, visibilityLayer, `${visibilityLayer} replay should expose requested visibility`);
  assert.ok(/^[a-f0-9]{16}$/.test(replay.matchRef), `${visibilityLayer} replay should expose stable match reference`);
  assert.ok(/^[a-f0-9]{16}$/.test(replay.replayHash), `${visibilityLayer} replay should expose stable replay hash`);
  assert.equal(Object.prototype.hasOwnProperty.call(replay, 'matchId'), false, `${visibilityLayer} replay should not expose raw match id`);
  assert.equal(replay.ruleVersion, 'pvp-live-v1', `${visibilityLayer} replay should expose rule version`);
  assert.equal(replay.status, 'finished', `${visibilityLayer} replay should only materialize after terminal match`);
  assert.ok(Array.isArray(replay.events) && replay.events.length >= 4, `${visibilityLayer} replay should include public event timeline`);
  assert.ok(replay.events.some(event => event.eventType === 'battle_started'), `${visibilityLayer} replay should include battle_started`);
  assert.ok(replay.events.some(event => event.eventType === 'match_finished'), `${visibilityLayer} replay should include match_finished`);
  assert.ok(replay.events.every(event => event && event.eventId && event.eventType && Number.isInteger(event.sequence)), `${visibilityLayer} replay events should expose stable public ids and sequence`);
  assert.equal(replay.hiddenScan?.forbiddenTokenCount, 0, `${visibilityLayer} replay hidden scan should be clean`);
  assertNoHiddenReplayLeak(replay, visibilityLayer);
}

(async () => {
  assertPublicReplayArraySanitizer();
  pvpLiveRoutes.__livePvpStore.reset();
  pvpLiveRoutes.__attachServices({ settlement: makeReplaySettlementStub() });

  const app = express();
  app.use(express.json());
  app.use('/api/pvp/live', pvpLiveRoutes);
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const tokenA = generateToken({ id: 'replay-user-a', username: 'replay-a' });
  const tokenB = generateToken({ id: 'replay-user-b', username: 'replay-b' });
  const tokenC = generateToken({ id: 'replay-user-c', username: 'replay-c' });
  const loadoutA = makeLoadout('sword', ['pvp_burst', 'doubleStrike', 'battleCry', 'defend']);
  const loadoutB = makeLoadout('shield', ['pvp_guard', 'defend', 'stormWard', 'quickSlash']);

  try {
    const joinA = await request(baseUrl, '/api/pvp/live/queue/join', {
      method: 'POST',
      token: tokenA,
      body: { displayName: 'Replay A', loadout: loadoutA }
    });
    assert.equal(joinA.payload.status, 'waiting', 'first replay player should wait in queue');

    const joinB = await request(baseUrl, '/api/pvp/live/queue/join', {
      method: 'POST',
      token: tokenB,
      body: { displayName: 'Replay B', loadout: loadoutB }
    });
    assert.equal(joinB.payload.status, 'matched', 'second replay player should match');

    const readyB = await readyBoth(baseUrl, {
      matchId: joinB.payload.matchId,
      tokenA,
      tokenB,
      stateVersionA: joinB.payload.stateView.stateVersion
    });

    const activeReplay = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}/replay`, {
      token: tokenA
    });
    assert.equal(activeReplay.status, 409, 'active match should not expose post-match replay');
    assert.equal(activeReplay.payload.reason, 'replay_not_ready', 'active replay rejection should be stable');

    const surrenderB = await submitIntent(baseUrl, tokenB, joinB.payload.matchId, {
      intentId: 'replay-surrender-b',
      intentType: 'surrender',
      stateVersion: readyB.payload.stateView.stateVersion,
      payload: { reason: 'replay_gate' }
    });
    assert.equal(surrenderB.payload.result, 'accepted', 'surrender should finish replay test match');
    assert.equal(surrenderB.payload.stateView.status, 'finished', 'surrender should produce terminal match');

    const finishedMatch = pvpLiveRoutes.__livePvpStore.matches.get(joinB.payload.matchId);
    assert.ok(finishedMatch && finishedMatch.state && Array.isArray(finishedMatch.state.events), 'finished replay match should remain inspectable in store');
    const partialPersistedEvents = finishedMatch.state.events
      .filter(event => event && event.eventType !== 'match_finished');
    const partialEventSourceReplay = buildMatchReplay(finishedMatch, 'A', 'replay_public', {
      events: partialPersistedEvents
    });
    assertPublicReplayShape(partialEventSourceReplay, 'replay_public');
    assert.ok(
      partialEventSourceReplay.events.some(event => event.eventType === 'match_finished'),
      'partial persisted event source should fall back to complete state events',
    );
    const corruptedFinishedMatch = {
      ...finishedMatch,
      state: {
        ...finishedMatch.state,
        events: []
      }
    };
    const incompletePersistedEvents = finishedMatch.state.events
      .filter(event => event && event.eventType !== 'match_finished')
      .slice(0, 3);
    assert.ok(incompletePersistedEvents.length > 0, 'corrupted replay fixture should retain a non-empty incomplete persisted source');
    const incompleteReplay = buildMatchReplay(corruptedFinishedMatch, 'A', 'replay_public', {
      events: incompletePersistedEvents
    });
    assert.equal(
      incompleteReplay,
      null,
      'terminal replay should reject incomplete persisted events when state events are also incomplete',
    );

    const selfReplay = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}/replay?visibility=replay_self`, {
      token: tokenA
    });
    assert.equal(selfReplay.status, 200, 'participant should fetch replay_self');
    assertPublicReplayShape(selfReplay.payload.replay, 'replay_self');
    assert.equal(selfReplay.payload.replay.viewerSeat, 'A', 'replay_self should expose viewer seat only to the participant');
    assert.equal(selfReplay.payload.replay.postMatchReview?.result, 'win', 'winner self replay should include own public post-match review');
    assert.equal(selfReplay.payload.replay.postMatchReview?.settlementReport?.reportVersion, 'pvp-live-settlement-report-v1', 'winner self replay should include own authoritative settlement report');
    assert.equal(selfReplay.payload.replay.postMatchReview?.settlementReport?.result, 'win', 'winner self replay settlement report should stay seat-scoped');
    assert.equal(selfReplay.payload.replay.postMatchReview?.settlementReport?.seasonHonorReport?.reportVersion, 'pvp-live-season-honor-v1', 'winner self replay should include own season honor progress');
    assert.equal(selfReplay.payload.replay.postMatchReview?.settlementReport?.seasonHonorReport?.powerImpact, 'none', 'winner self replay season honor should not grant combat power');
    assert.equal(selfReplay.payload.replay.postMatchReview?.settlementReport?.seasonHonorReport?.cosmeticReward?.reportVersion, 'pvp-live-season-honor-reward-v1', 'winner self replay should include own cosmetic honor reward track');
    assert.equal(selfReplay.payload.replay.postMatchReview?.settlementReport?.seasonHonorReport?.cosmeticReward?.rewardImpact, 'cosmetic_only', 'winner self replay honor reward should be cosmetic only');
    assert.equal(selfReplay.payload.replay.postMatchReview?.settlementReport?.seasonHonorReport?.cosmeticReward?.powerImpact, 'none', 'winner self replay honor reward should not grant combat power');
    assert.equal(selfReplay.payload.replay.postMatchReview?.settlementReport?.seasonHonorReport?.cosmeticReward?.collectionState, 'newly_unlocked', 'winner self replay should include own honor collection unlock state');
    assert.equal(selfReplay.payload.replay.postMatchReview?.settlementReport?.seasonHonorReport?.cosmeticReward?.collectionReport?.reportVersion, 'pvp-live-season-honor-collection-v1', 'winner self replay should include own honor collection report');

    const publicReplay = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}/replay?visibility=replay_public`, {
      token: tokenA
    });
    assert.equal(publicReplay.status, 200, 'participant should fetch replay_public');
    assertPublicReplayShape(publicReplay.payload.replay, 'replay_public');
    assert.equal(publicReplay.payload.replay.viewerSeat, undefined, 'replay_public should not expose requester seat');
    assert.equal(publicReplay.payload.replay.postMatchReview, undefined, 'replay_public should not expose seat-specific review object');
    assert.equal(publicReplay.payload.replay.settlementReport, undefined, 'replay_public should not expose seat-specific settlement report');
    assert.equal(publicReplay.payload.replay.seasonHonorReport, undefined, 'replay_public should not expose seat-specific season honor progress');
    assert.equal(publicReplay.payload.replay.cosmeticReward, undefined, 'replay_public should not expose seat-specific cosmetic honor reward track');
    assert.equal(publicReplay.payload.replay.seasonHonorCollection, undefined, 'replay_public should not expose seat-specific season honor collection');
    assert.ok(publicReplay.payload.replay.publicSummary?.finishReason === 'surrender', 'replay_public should include public finish summary');

    const auditReplay = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}/replay?visibility=audit_safe`, {
      token: tokenB
    });
    assert.equal(auditReplay.status, 200, 'participant should fetch audit_safe replay');
    assertPublicReplayShape(auditReplay.payload.replay, 'audit_safe');
    assert.ok(Array.isArray(auditReplay.payload.replay.fieldPaths) && auditReplay.payload.replay.fieldPaths.length > 0, 'audit_safe replay should expose field path summary');
    assert.equal(auditReplay.payload.replay.sourceVisibilityLayer, 'replay_public', 'audit_safe replay should derive from replay_public');
    assert.equal(auditReplay.payload.replay.cosmeticReward, undefined, 'audit_safe should not expose seat-specific cosmetic honor reward track');
    assert.equal(auditReplay.payload.replay.seasonHonorCollection, undefined, 'audit_safe should not expose seat-specific season honor collection');

    const outsiderReplay = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}/replay`, {
      token: tokenC
    });
    assert.equal(outsiderReplay.status, 404, 'non-participant should not fetch replay');

    const invalidVisibility = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}/replay?visibility=server_full`, {
      token: tokenA
    });
    assert.equal(invalidVisibility.status, 400, 'browser replay route should reject server_full visibility');
    assert.equal(invalidVisibility.payload.reason, 'invalid_replay_visibility', 'invalid visibility rejection should be stable');

    console.log('sanity_pvp_live_replay_checks passed');
  } finally {
    await close(server);
    pvpLiveRoutes.__livePvpStore.reset();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
