const assert = require('assert');
const crypto = require('crypto');

const rawBaseUrl = process.argv[2] || process.env.BASE_URL || '';
if (!rawBaseUrl) {
  console.error('Usage: npm run test:prod:api -- <base-url>');
  console.error('For https://080305.xyz, set CONFIRM_PROD=1 because this smoke creates smoke_* users and writes save/global/ghost/PVP data.');
  process.exit(2);
}

const BASE_URL = rawBaseUrl.replace(/\/+$/, '');
const isProductionTarget = /^https:\/\/(?:www\.)?080305\.xyz$/i.test(BASE_URL);
if (isProductionTarget && process.env.CONFIRM_PROD !== '1') {
  console.error('Refusing to mutate production without CONFIRM_PROD=1.');
  console.error('This smoke creates smoke_* users and writes save/global/ghost/PVP data.');
  process.exit(2);
}

const REQUEST_TIMEOUT_MS = Number(process.env.PROD_SMOKE_TIMEOUT_MS || 15000);
const RUN_ID = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const PASSWORD = `pwd_${crypto.randomBytes(8).toString('hex')}`;
const REALM = 900000 + Math.floor(Math.random() * 90000);

function sessionSignature(dataStr, salt, token) {
  return crypto.createHmac('sha256', token)
    .update('session-v1', 'utf8')
    .update('\n', 'utf8')
    .update(String(salt), 'utf8')
    .update('\n', 'utf8')
    .update(String(dataStr), 'utf8')
    .digest('hex');
}

async function request(path, { method = 'GET', token, body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`request timed out after ${REQUEST_TIMEOUT_MS}ms`)), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (error) {
      payload = { raw: text.slice(0, 500) };
    }
    return { status: res.status, ok: res.ok, payload };
  } finally {
    clearTimeout(timer);
  }
}

function requireOk(label, result) {
  assert(result.ok, `${label} failed: HTTP ${result.status} ${JSON.stringify(result.payload)}`);
  assert(result.payload && result.payload.success !== false, `${label} returned unsuccessful payload: ${JSON.stringify(result.payload)}`);
}

function requireStatus(label, result, expectedStatus) {
  assert.strictEqual(result.status, expectedStatus, `${label} should return HTTP ${expectedStatus}: ${JSON.stringify(result.payload)}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function nextServerTimestamp(previousTimestamp) {
  const previous = Number(previousTimestamp);
  assert(Number.isFinite(previous) && previous >= 0, `invalid server timestamp: ${previousTimestamp}`);
  await sleep(25);
  return Math.floor(previous) + 1;
}

function corruptToken(token) {
  assert(token && token.length > 8, `cannot corrupt invalid token: ${token}`);
  const last = token[token.length - 1];
  const replacement = last === 'a' ? 'b' : 'a';
  return `${token.slice(0, -1)}${replacement}`;
}

async function register(username) {
  const result = await request('/api/auth/register', {
    method: 'POST',
    body: { username, password: PASSWORD }
  });
  requireOk(`register ${username}`, result);
  const user = result.payload && result.payload.user;
  assert(user && user.sessionToken && user.objectId, `register ${username} returned invalid user: ${JSON.stringify(result.payload)}`);
  return user;
}

async function login(username) {
  const result = await request('/api/auth/login', {
    method: 'POST',
    body: { username, password: PASSWORD }
  });
  requireOk(`login ${username}`, result);
  const user = result.payload && result.payload.user;
  assert(user && user.sessionToken && user.objectId, `login ${username} returned invalid user: ${JSON.stringify(result.payload)}`);
  return user;
}

function signedFields(data, token, saltPrefix) {
  const salt = `${saltPrefix}-${RUN_ID}`;
  const dataStr = JSON.stringify(data);
  return {
    salt,
    signature: sessionSignature(dataStr, salt, token),
    signatureMode: 'session'
  };
}

function makePvpBattleData(marker, overrides = {}) {
  return {
    me: {
      maxHp: overrides.maxHp || 360,
      energy: overrides.energy || 4,
      currEnergy: overrides.currEnergy || overrides.energy || 4
    },
    deck: (overrides.deck || [
      'strike',
      'heavyStrike',
      'quickSlash',
      'defend',
      'ironWill',
      'shieldBash',
      'spiritBoost',
      'meditation'
    ]).map(id => ({ id })),
    aiProfile: overrides.aiProfile || 'balanced',
    deckArchetype: overrides.deckArchetype || overrides.aiProfile || 'balanced',
    ruleVersion: `prod-smoke-pvp-${marker}`,
    personalityRules: overrides.personalityRules || null
  };
}

function makeLivePvpLoadout(identitySlot, pattern) {
  const deck = [];
  for (let index = 0; index < 20; index += 1) {
    deck.push({ id: pattern[index % pattern.length], upgraded: false });
  }
  return {
    identitySlot,
    label: `${identitySlot}-prod-smoke-live`,
    deck
  };
}

async function submitLiveIntent(matchId, token, intent) {
  return request(`/api/pvp/live/matches/${encodeURIComponent(matchId)}/intents`, {
    method: 'POST',
    token,
    body: intent
  });
}

async function submitLiveHeartbeat(matchId, participant, label) {
  const result = await request(`/api/pvp/live/matches/${encodeURIComponent(matchId)}/heartbeat`, {
    method: 'POST',
    token: participant.sessionToken,
    body: {}
  });
  requireOk(label, result);
  return result;
}

function hasLiveTerminalEvent(stateView) {
  return Array.isArray(stateView?.recentEvents)
    && stateView.recentEvents.some(event => ['connection_timeout', 'turn_timeout', 'match_finished'].includes(event?.eventType));
}

function assertRankAndWalletUnchanged(label, before, after) {
  assert.strictEqual(after.payload.rank.score, before.payload.rank.score, `${label} prod live invite smoke should not change rank scores`);
  assert.strictEqual(after.payload.rank.wins, before.payload.rank.wins, `${label} prod live invite smoke should not change rank wins`);
  assert.strictEqual(after.payload.rank.losses, before.payload.rank.losses, `${label} prod live invite smoke should not change rank losses`);
  assert.strictEqual(after.payload.wallet.coins, before.payload.wallet.coins, `${label} prod live invite smoke should not change wallet coins`);
  assert.strictEqual(after.payload.wallet.totalMatches, before.payload.wallet.totalMatches, `${label} prod live invite smoke should not change wallet match count`);
}

async function readyLiveMatch({ matchId, tokenA, tokenB, stateVersionA, prefix }) {
  const readyA = await submitLiveIntent(matchId, tokenA, {
    intentId: `${prefix}-ready-a-${RUN_ID}`,
    intentType: 'ready',
    stateVersion: stateVersionA,
    payload: {}
  });
  requireOk(`${prefix} ready A`, readyA);
  assert.strictEqual(readyA.payload.result, 'accepted', `${prefix} ready A should be accepted: ${JSON.stringify(readyA.payload)}`);

  const readyB = await submitLiveIntent(matchId, tokenB, {
    intentId: `${prefix}-ready-b-${RUN_ID}`,
    intentType: 'ready',
    stateVersion: readyA.payload.stateView.stateVersion,
    payload: {}
  });
  requireOk(`${prefix} ready B`, readyB);
  assert.strictEqual(readyB.payload.result, 'accepted', `${prefix} ready B should be accepted: ${JSON.stringify(readyB.payload)}`);
  assert.strictEqual(readyB.payload.stateView?.status, 'active', `${prefix} both ready should enter active: ${JSON.stringify(readyB.payload)}`);
  return readyB;
}

function getPublicEventData(event) {
  if (!event || typeof event !== 'object') return {};
  if (event.publicData && typeof event.publicData === 'object') return event.publicData;
  if (event.payload && typeof event.payload === 'object') return event.payload;
  return {};
}

function pickLiveDamageCard(stateView) {
  const playableCards = Array.isArray(stateView?.actionPreviewReport?.playableCards)
    ? stateView.actionPreviewReport.playableCards
    : [];
  return playableCards
    .filter(card => Math.max(0, Math.floor(Number(card?.hpDamage) || 0)) > 0)
    .sort((left, right) => {
      const leftLethal = Math.max(0, Math.floor(Number(left?.targetHpAfter) || 0)) <= 0 && left?.openingProtection?.willTrigger !== true;
      const rightLethal = Math.max(0, Math.floor(Number(right?.targetHpAfter) || 0)) <= 0 && right?.openingProtection?.willTrigger !== true;
      if (leftLethal !== rightLethal) return leftLethal ? -1 : 1;
      return Math.max(0, Math.floor(Number(right?.hpDamage) || 0)) - Math.max(0, Math.floor(Number(left?.hpDamage) || 0));
    })[0] || null;
}

function assertRankedLethalSettlementReasons(settlement, label) {
  const reasons = Array.isArray(settlement?.reasonLines) ? settlement.reasonLines : [];
  assert(reasons.length >= 3, `prod live ranked lethal settlement should expose player-readable reason lines (${label}): ${JSON.stringify(settlement)}`);
  const byId = Object.fromEntries(reasons.map(reason => [reason?.id, reason]));
  assert.ok(
    byId.finish_type
      && byId.finish_type.label === '终局类型'
      && /公开伤害|终局事件/.test(String(byId.finish_type.line || ''))
      && byId.finish_type.sourceVisibility === 'public_events',
    `prod live ranked lethal settlement should explain finish type (${label}): ${JSON.stringify(reasons)}`
  );
  assert.ok(
    byId.score_delta
      && byId.score_delta.label === '积分变化'
      && /正式积分/.test(String(byId.score_delta.line || ''))
      && /服务端权威/.test(String(byId.score_delta.line || ''))
      && /对手强度/.test(String(byId.score_delta.line || ''))
      && byId.score_delta.sourceVisibility === 'server_authoritative_settlement'
      && byId.score_delta.rankedImpact === 'official',
    `prod live ranked lethal settlement should explain score delta (${label}): ${JSON.stringify(reasons)}`
  );
  assert.ok(
    byId.reward_boundary
      && byId.reward_boundary.label === '奖励边界'
      && /天道币/.test(String(byId.reward_boundary.line || ''))
      && /不改变战斗数值/.test(String(byId.reward_boundary.line || ''))
      && byId.reward_boundary.sourceVisibility === 'server_authoritative_settlement',
    `prod live ranked lethal settlement should explain reward boundary (${label}): ${JSON.stringify(reasons)}`
  );
  assert.ok(
    reasons.every(reason => reason?.usesHiddenInformation === false),
    `prod live ranked lethal settlement reasons should not use hidden information (${label}): ${JSON.stringify(reasons)}`
  );

  const reasonCopyHaystack = [
    settlement?.summaryLine,
    settlement?.boundary,
    JSON.stringify(reasons)
  ].join(' ');
  assert.ok(
    !/rating":|\belo\b|opponentRating|expectedWinRate|ranked_authoritative|surrender_|connection_timeout|turn_timeout|ready_timeout/i.test(reasonCopyHaystack),
    `prod live ranked lethal settlement copy should not leak hidden rating or raw protocol tokens (${label}): ${reasonCopyHaystack}`
  );

  const settlementHiddenHaystack = JSON.stringify(settlement || {});
  assert.ok(
    !/rating":|\belo\b|opponentRating|expectedWinRate/i.test(settlementHiddenHaystack),
    `prod live ranked lethal settlement report should not expose hidden rating fields (${label}): ${settlementHiddenHaystack}`
  );
}

async function readLiveMatchForSeat(matchId, participant, label) {
  const result = await request(`/api/pvp/live/matches/${encodeURIComponent(matchId)}`, { token: participant.sessionToken });
  requireOk(label, result);
  assert.strictEqual(result.payload.matchId, matchId, `${label} should read the same match: ${JSON.stringify(result.payload)}`);
  return result;
}

async function finishRankedMatchWithRealLethal({ matchId, participantsBySeat }) {
  const seatIds = Object.keys(participantsBySeat).filter(seatId => seatId === 'A' || seatId === 'B');
  assert.strictEqual(seatIds.length, 2, `prod live ranked lethal needs both seat tokens: ${JSON.stringify(seatIds)}`);
  let latest = await readLiveMatchForSeat(matchId, participantsBySeat[seatIds[0]], 'prod live ranked lethal scout');
  const finishEvents = [];
  for (let step = 0; step < 40; step += 1) {
    let scoutView = latest.payload.stateView;
    if (scoutView?.status === 'finished') {
      return { terminal: latest, finishEvents, steps: step };
    }
    assert.strictEqual(scoutView?.status, 'active', `prod live ranked real-card lethal should stay active before terminal: ${JSON.stringify(scoutView)}`);
    await Promise.all(seatIds.map((seatId) => submitLiveHeartbeat(
      matchId,
      participantsBySeat[seatId],
      `prod live ranked lethal keepalive ${seatId} step ${step}`,
    )));
    latest = await readLiveMatchForSeat(
      matchId,
      participantsBySeat[seatIds[0]],
      `prod live ranked lethal post-keepalive refresh step ${step}`,
    );
    scoutView = latest.payload.stateView;
    if (scoutView?.status === 'finished') {
      return { terminal: latest, finishEvents, steps: step };
    }
    assert.strictEqual(scoutView?.status, 'active', `prod live ranked refreshed real-card lethal should stay active before terminal: ${JSON.stringify(scoutView)}`);
    const currentSeat = scoutView.currentSeat === 'B' ? 'B' : 'A';
    const actor = participantsBySeat[currentSeat];
    assert(actor, `prod live ranked current seat should have participant token: ${currentSeat}`);
    const actorRead = latest.payload.seatId === currentSeat
      ? latest
      : await readLiveMatchForSeat(matchId, actor, `prod live ranked lethal actor ${currentSeat} read`);
    const view = actorRead.payload.stateView;
    const card = pickLiveDamageCard(view);
    const stateVersion = view.stateVersion;
    const intent = card
      ? {
          intentId: `prod-live-ranked-lethal-${currentSeat}-${step}-${RUN_ID}`,
          intentType: 'play_card',
          stateVersion,
          payload: {
            cardInstanceId: card.cardInstanceId,
            targetSeat: card.targetSeat || view.opponent?.seatId || (currentSeat === 'A' ? 'B' : 'A')
          }
        }
      : {
          intentId: `prod-live-ranked-handoff-${currentSeat}-${step}-${RUN_ID}`,
          intentType: 'end_turn',
          stateVersion,
          payload: {}
        };
    const action = await submitLiveIntent(matchId, actor.sessionToken, intent);
    requireOk(`prod live ranked real ${intent.intentType} ${currentSeat}`, action);
    if (Array.isArray(action.payload.events)) finishEvents.push(...action.payload.events);
    if (action.payload.result !== 'accepted') {
      const retryableReasons = ['not_current_turn', 'stale_state_version', 'conflicting_state_version'];
      assert.ok(
        retryableReasons.includes(String(action.payload.reason || ''))
          && action.payload.stateView?.status === 'active',
        `prod live ranked real ${intent.intentType} should be accepted or return a recoverable authoritative race: ${JSON.stringify(action.payload)}`,
      );
      latest = action;
      continue;
    }
    if (action.payload.stateView?.status === 'finished') {
      const review = action.payload.stateView?.postMatchReview;
      assert.strictEqual(review?.finishReason, 'lethal', `prod live ranked real card lethal should finish authoritative match: ${JSON.stringify(review)}`);
      assert.strictEqual(review?.winnerSeat, currentSeat, `prod live ranked lethal winner should be the real card actor: ${JSON.stringify(review)}`);
      assert(
        Array.isArray(action.payload.events)
          && action.payload.events.some(event => event.eventType === 'match_finished' && getPublicEventData(event).finishReason === 'lethal'),
        `prod live ranked lethal terminal action should include lethal match_finished event: ${JSON.stringify(action.payload.events)}`
      );
      assert(
        !finishEvents.some(event => event.eventType === 'player_surrendered'),
        `prod live ranked lethal should not use surrender shortcut: ${JSON.stringify(finishEvents)}`
      );
      return { terminal: action, finishEvents, steps: step + 1 };
    }
    latest = action;
  }
  throw new Error(`prod live ranked real-card lethal did not finish within action budget: ${JSON.stringify(latest.payload?.stateView)}`);
}

async function assertRankedActiveRecoverySmoke({ matchId, participantsBySeat }) {
  const heartbeatsBySeat = {};
  for (const [seatId, participant] of Object.entries(participantsBySeat)) {
    if (seatId !== 'A' && seatId !== 'B') continue;
    const current = await request('/api/pvp/live/matches/current', { token: participant.sessionToken });
    requireOk(`prod live ranked current recovery ${seatId}`, current);
    assert.strictEqual(current.payload.matchId, matchId, `prod live ranked active current match should recover same ranked match: ${JSON.stringify(current.payload)}`);
    assert.strictEqual(current.payload.seatId, seatId, `prod live ranked active current match should preserve viewer seat: ${JSON.stringify(current.payload)}`);
    assert.strictEqual(current.payload.stateView?.mode, 'ranked', `prod live ranked active current match should stay ranked: ${JSON.stringify(current.payload)}`);
    assert.strictEqual(current.payload.stateView?.status, 'active', `prod live ranked active current match should stay active: ${JSON.stringify(current.payload)}`);
    assert.strictEqual(current.payload.stateView?.postMatchReview, null, `prod live ranked current recovery should keep terminal review hidden before grace: ${JSON.stringify(current.payload.stateView?.postMatchReview)}`);
    assert.strictEqual(current.payload.stateView?.turnTimer?.reportVersion, 'pvp-live-turn-timer-v1', `prod live ranked active current match should preserve turn timer: ${JSON.stringify(current.payload.stateView?.turnTimer)}`);
    assert.strictEqual(current.payload.stateView?.connectionReport?.reportVersion, 'pvp-live-connection-v1', `prod live ranked active current match should expose connection report: ${JSON.stringify(current.payload.stateView?.connectionReport)}`);
    assert.strictEqual(current.payload.stateView?.connectionReport?.viewer?.seatId, seatId, `prod live ranked active current match should scope connection viewer seat: ${JSON.stringify(current.payload.stateView?.connectionReport)}`);

    const heartbeat = await submitLiveHeartbeat(matchId, participant, `prod live ranked heartbeat recovery ${seatId}`);
    assert.strictEqual(heartbeat.payload.matchId, matchId, `prod live ranked heartbeat recovery should recover same match: ${JSON.stringify(heartbeat.payload)}`);
    assert.strictEqual(heartbeat.payload.seatId, seatId, `prod live ranked heartbeat recovery should preserve viewer seat: ${JSON.stringify(heartbeat.payload)}`);
    assert.strictEqual(heartbeat.payload.stateView?.mode, 'ranked', `prod live ranked heartbeat recovery should stay ranked: ${JSON.stringify(heartbeat.payload)}`);
    assert.strictEqual(heartbeat.payload.stateView?.status, 'active', `prod live ranked heartbeat recovery should keep active ranked match: ${JSON.stringify(heartbeat.payload)}`);
    assert.strictEqual(heartbeat.payload.stateView?.postMatchReview, null, `prod live ranked heartbeat recovery should keep terminal review hidden: ${JSON.stringify(heartbeat.payload.stateView?.postMatchReview)}`);
    assert.strictEqual(heartbeat.payload.stateView?.connectionReport?.viewer?.status, 'online', `prod live ranked heartbeat recovery should mark viewer online: ${JSON.stringify(heartbeat.payload.stateView?.connectionReport)}`);
    assert.strictEqual(heartbeat.payload.stateView?.connectionTempoReport?.sourceVisibility, 'server_authoritative_connection_state', `prod live ranked heartbeat recovery should keep authoritative tempo source: ${JSON.stringify(heartbeat.payload.stateView?.connectionTempoReport)}`);
    heartbeatsBySeat[seatId] = heartbeat;
  }

  const baseline = heartbeatsBySeat.A || heartbeatsBySeat.B;
  const baselineView = baseline && baseline.payload && baseline.payload.stateView;
  const observerSeatId = baselineView?.currentSeat === 'B' ? 'B' : 'A';
  const silentSeatId = observerSeatId === 'A' ? 'B' : 'A';
  const observer = participantsBySeat[observerSeatId];
  const silent = participantsBySeat[silentSeatId];
  assert(observer && silent, `prod live ranked reconnect grace recovery needs both seat participants: ${JSON.stringify(Object.keys(participantsBySeat))}`);

  const observerBaseline = await request('/api/pvp/live/matches/current', { token: observer.sessionToken });
  requireOk(`prod live ranked reconnect grace baseline ${observerSeatId}`, observerBaseline);
  assert.strictEqual(observerBaseline.payload.stateView?.currentSeat, observerSeatId, `prod live ranked reconnect grace baseline should use current actor as observer: ${JSON.stringify(observerBaseline.payload.stateView)}`);
  const baselineDeadlineAt = Math.max(0, Math.floor(Number(observerBaseline.payload.stateView?.turnTimer?.deadlineAt) || 0));
  const turnTimeoutMs = Math.max(0, Math.floor(Number(observerBaseline.payload.stateView?.turnTimer?.timeoutMs) || 0));
  const heartbeatStaleMs = Math.max(1000, Math.floor(Number(observerBaseline.payload.stateView?.connectionReport?.heartbeatStaleMs) || 15000));
  const reconnectGraceMs = Math.max(1000, Math.floor(Number(observerBaseline.payload.stateView?.connectionReport?.graceMs) || 30000));
  const graceProbeMs = Math.min(1000, Math.max(250, Math.floor(reconnectGraceMs / 2)));
  const waitMs = heartbeatStaleMs + graceProbeMs;
  assert(turnTimeoutMs > waitMs + 5000, `prod live ranked reconnect grace probe should fit inside active turn timer: ${JSON.stringify({ turnTimeoutMs, waitMs, heartbeatStaleMs, reconnectGraceMs })}`);

  const observerKeepaliveDelayMs = Math.max(100, Math.floor(heartbeatStaleMs * 0.75));
  await sleep(observerKeepaliveDelayMs);
  const observerKeepalive = await submitLiveHeartbeat(matchId, observer, `prod live ranked reconnect grace observer keepalive ${observerSeatId}`);
  assert.strictEqual(observerKeepalive.payload.stateView?.status, 'active', `prod live ranked reconnect grace observer keepalive should keep active match: ${JSON.stringify(observerKeepalive.payload)}`);
  await sleep(Math.max(0, waitMs - observerKeepaliveDelayMs));

  const graceCurrent = await request('/api/pvp/live/matches/current', { token: observer.sessionToken });
  requireOk(`prod live ranked reconnect grace current recovery ${observerSeatId}`, graceCurrent);
  assert.strictEqual(graceCurrent.payload.matchId, matchId, `prod live ranked reconnect grace current recovery should keep same match: ${JSON.stringify(graceCurrent.payload)}`);
  assert.strictEqual(graceCurrent.payload.stateView?.status, 'active', `prod live ranked silent opponent should enter reconnect grace through current match recovery: ${JSON.stringify(graceCurrent.payload.stateView)}`);
  assert.strictEqual(graceCurrent.payload.stateView?.postMatchReview, null, `prod live ranked reconnect grace current recovery should keep terminal review hidden: ${JSON.stringify(graceCurrent.payload.stateView?.postMatchReview)}`);
  assert.strictEqual(graceCurrent.payload.stateView?.turnTimer?.deadlineAt, baselineDeadlineAt, `prod live ranked reconnect grace should preserve active turn deadline: ${JSON.stringify({ before: observerBaseline.payload.stateView?.turnTimer, after: graceCurrent.payload.stateView?.turnTimer })}`);
  assert.strictEqual(graceCurrent.payload.stateView?.connectionReport?.viewer?.status, 'online', `prod live ranked reconnect grace observer should remain online: ${JSON.stringify(graceCurrent.payload.stateView?.connectionReport)}`);
  assert.strictEqual(graceCurrent.payload.stateView?.connectionReport?.opponent?.seatId, silentSeatId, `prod live ranked reconnect grace should identify silent opponent seat: ${JSON.stringify(graceCurrent.payload.stateView?.connectionReport)}`);
  assert.strictEqual(graceCurrent.payload.stateView?.connectionReport?.opponent?.status, 'grace', `prod live ranked silent opponent should enter reconnect grace through current match recovery: ${JSON.stringify(graceCurrent.payload.stateView?.connectionReport)}`);
  assert(graceCurrent.payload.stateView?.connectionReport?.opponent?.remainingGraceMs > 0, `prod live ranked reconnect grace should expose remaining grace window: ${JSON.stringify(graceCurrent.payload.stateView?.connectionReport)}`);
  assert.strictEqual(graceCurrent.payload.stateView?.connectionTempoReport?.tempoState, 'opponent_non_turn_grace', `prod live ranked reconnect grace should preserve actionable opponent grace tempo: ${JSON.stringify(graceCurrent.payload.stateView?.connectionTempoReport)}`);
  assert.strictEqual(graceCurrent.payload.stateView?.connectionTempoReport?.canSubmitIntent, true, `prod live ranked reconnect grace observer should keep current action authority: ${JSON.stringify(graceCurrent.payload.stateView?.connectionTempoReport)}`);
  assert.strictEqual(hasLiveTerminalEvent(graceCurrent.payload.stateView), false, `prod live ranked reconnect grace recovery should not emit terminal events: ${JSON.stringify(graceCurrent.payload.stateView?.recentEvents)}`);

  const silentHeartbeat = await submitLiveHeartbeat(matchId, silent, `prod live ranked reconnect grace silent recovery ${silentSeatId}`);
  assert.strictEqual(silentHeartbeat.payload.matchId, matchId, `prod live ranked reconnect grace heartbeat should recover same match: ${JSON.stringify(silentHeartbeat.payload)}`);
  assert.strictEqual(silentHeartbeat.payload.stateView?.status, 'active', `prod live ranked heartbeat recovery should keep active ranked match: ${JSON.stringify(silentHeartbeat.payload)}`);
  assert.strictEqual(silentHeartbeat.payload.stateView?.postMatchReview, null, `prod live ranked heartbeat recovery should keep terminal review hidden: ${JSON.stringify(silentHeartbeat.payload.stateView?.postMatchReview)}`);
  assert.strictEqual(silentHeartbeat.payload.stateView?.turnTimer?.deadlineAt, baselineDeadlineAt, `prod live ranked heartbeat recovery should preserve active turn deadline: ${JSON.stringify(silentHeartbeat.payload.stateView?.turnTimer)}`);
  assert.strictEqual(silentHeartbeat.payload.stateView?.connectionReport?.viewer?.status, 'online', `prod live ranked heartbeat recovery should mark viewer online: ${JSON.stringify(silentHeartbeat.payload.stateView?.connectionReport)}`);
  assert.strictEqual(hasLiveTerminalEvent(silentHeartbeat.payload.stateView), false, `prod live ranked reconnect grace recovery should not emit terminal events: ${JSON.stringify(silentHeartbeat.payload.stateView?.recentEvents)}`);

  const observerAfterRecovery = await request('/api/pvp/live/matches/current', { token: observer.sessionToken });
  requireOk(`prod live ranked reconnect grace observer after recovery ${observerSeatId}`, observerAfterRecovery);
  assert.strictEqual(observerAfterRecovery.payload.stateView?.status, 'active', `prod live ranked observer after reconnect should stay active: ${JSON.stringify(observerAfterRecovery.payload.stateView)}`);
  assert.strictEqual(observerAfterRecovery.payload.stateView?.connectionReport?.opponent?.status, 'online', `prod live ranked heartbeat recovery should return opponent online for observer: ${JSON.stringify(observerAfterRecovery.payload.stateView?.connectionReport)}`);
  assert.strictEqual(observerAfterRecovery.payload.stateView?.postMatchReview, null, `prod live ranked observer after reconnect should keep terminal review hidden: ${JSON.stringify(observerAfterRecovery.payload.stateView?.postMatchReview)}`);
}

async function assertLivePvpInviteSmoke({ host, guest, hostName, guestName }) {
  const hostRankBefore = await request('/api/pvp/rank', { token: host.sessionToken });
  requireOk('prod live invite host rank before', hostRankBefore);
  const guestRankBefore = await request('/api/pvp/rank', { token: guest.sessionToken });
  requireOk('prod live invite guest rank before', guestRankBefore);

  const invite = await request('/api/pvp/live/invites', {
    method: 'POST',
    token: host.sessionToken,
    body: {
      displayName: hostName,
      targetUsername: guestName
    }
  });
  requireOk('prod live invite create', invite);
  assert.strictEqual(invite.payload.status, 'waiting_invite', `prod live invite should create no-ranked invite: ${JSON.stringify(invite.payload)}`);
  assert.strictEqual(invite.payload.inviteReport?.rankedImpact, 'none', `prod live invite should create no-ranked invite: ${JSON.stringify(invite.payload)}`);
  assert(invite.payload.inviteCode, `prod live invite should return invite code: ${JSON.stringify(invite.payload)}`);
  const inviteCode = invite.payload.inviteCode;

  const currentInvite = await request('/api/pvp/live/invites/current', { token: host.sessionToken });
  requireOk('prod live invite current host', currentInvite);
  assert.strictEqual(currentInvite.payload.inviteCode, inviteCode, `prod live invite current host should recover invite: ${JSON.stringify(currentInvite.payload)}`);

  const inbox = await request('/api/pvp/live/invites/inbox', { token: guest.sessionToken });
  requireOk('prod live invite inbox', inbox);
  assert(
    Array.isArray(inbox.payload.invites) && inbox.payload.invites.some(item => item.inviteCode === inviteCode),
    `prod live invite target inbox should list invite: ${JSON.stringify(inbox.payload)}`
  );

  const joined = await request(`/api/pvp/live/invites/${encodeURIComponent(inviteCode)}/join`, {
    method: 'POST',
    token: guest.sessionToken,
    body: { displayName: guestName }
  });
  requireOk('prod live invite join', joined);
  assert.strictEqual(joined.payload.status, 'matched', `prod live invite join should create friendly setup: ${JSON.stringify(joined.payload)}`);
  assert.strictEqual(joined.payload.stateView?.mode, 'friendly', `prod live invite join should create friendly setup: ${JSON.stringify(joined.payload)}`);
  assert.strictEqual(joined.payload.stateView?.status, 'setup', `prod live invite join should create friendly setup: ${JSON.stringify(joined.payload)}`);
  assert.strictEqual(joined.payload.inviteReport?.rankedImpact, 'none', `prod live invite join should keep no-ranked invite report: ${JSON.stringify(joined.payload)}`);
  assert(
    joined.payload.stateView?.matchQuality?.safeguards?.includes('friendly_no_ranked_impact'),
    `prod live invite join should create no-ranked friendly setup: ${JSON.stringify(joined.payload)}`
  );
  const matchId = joined.payload.matchId;

  const hostCurrent = await request('/api/pvp/live/matches/current', { token: host.sessionToken });
  requireOk('prod live invite host current match', hostCurrent);
  assert.strictEqual(hostCurrent.payload.matchId, matchId, `prod live invite host current match should recover same match: ${JSON.stringify(hostCurrent.payload)}`);
  assert.strictEqual(hostCurrent.payload.stateView?.mode, 'friendly', `prod live invite host current match should stay friendly: ${JSON.stringify(hostCurrent.payload)}`);

  const readyHost = await submitLiveIntent(matchId, host.sessionToken, {
    intentId: `prod-live-invite-ready-host-${RUN_ID}`,
    intentType: 'ready',
    stateVersion: hostCurrent.payload.stateView.stateVersion,
    payload: {}
  });
  requireOk('prod live invite host ready', readyHost);
  assert.strictEqual(readyHost.payload.result, 'accepted', `prod live invite host ready should be accepted: ${JSON.stringify(readyHost.payload)}`);

  const readyGuest = await submitLiveIntent(matchId, guest.sessionToken, {
    intentId: `prod-live-invite-ready-guest-${RUN_ID}`,
    intentType: 'ready',
    stateVersion: readyHost.payload.stateView.stateVersion,
    payload: {}
  });
  requireOk('prod live invite guest ready', readyGuest);
  assert.strictEqual(readyGuest.payload.result, 'accepted', `prod live invite guest ready should be accepted: ${JSON.stringify(readyGuest.payload)}`);
  assert.strictEqual(readyGuest.payload.stateView?.status, 'active', `prod live invite both ready should enter active: ${JSON.stringify(readyGuest.payload)}`);
  assert.strictEqual(readyGuest.payload.stateView?.mode, 'friendly', `prod live invite both ready should stay friendly: ${JSON.stringify(readyGuest.payload)}`);

  const surrender = await submitLiveIntent(matchId, guest.sessionToken, {
    intentId: `prod-live-invite-surrender-guest-${RUN_ID}`,
    intentType: 'surrender',
    stateVersion: readyGuest.payload.stateView.stateVersion,
    payload: {}
  });
  requireOk('prod live invite surrender', surrender);
  assert.strictEqual(surrender.payload.result, 'accepted', `prod live invite surrender should be accepted: ${JSON.stringify(surrender.payload)}`);
  assert.strictEqual(surrender.payload.stateView?.status, 'finished', `prod live invite surrender should finish friendly match: ${JSON.stringify(surrender.payload)}`);
  assert.strictEqual(surrender.payload.stateView?.mode, 'friendly', `prod live invite surrender should finish friendly match: ${JSON.stringify(surrender.payload)}`);
  assert(
    !surrender.payload.stateView?.postMatchReview?.settlementReport,
    `prod live invite smoke should not expose settlement report: ${JSON.stringify(surrender.payload.stateView?.postMatchReview)}`
  );

  const replay = await request(`/api/pvp/live/matches/${encodeURIComponent(matchId)}/replay`, { token: host.sessionToken });
  requireOk('prod live invite replay', replay);
  assert.strictEqual(replay.payload.replay?.publicSummary?.status, 'finished', `prod live invite replay should expose finished public replay: ${JSON.stringify(replay.payload)}`);
  assert.strictEqual(replay.payload.replay?.visibilityLayer, 'replay_self', `prod live invite replay should expose finished public replay: ${JSON.stringify(replay.payload)}`);
  assert(
    Array.isArray(replay.payload.replay?.events) && replay.payload.replay.events.some(event => event.eventType === 'match_finished'),
    `prod live invite replay should include match_finished public event: ${JSON.stringify(replay.payload)}`
  );

  const hostRankAfter = await request('/api/pvp/rank', { token: host.sessionToken });
  requireOk('prod live invite host rank after', hostRankAfter);
  const guestRankAfter = await request('/api/pvp/rank', { token: guest.sessionToken });
  requireOk('prod live invite guest rank after', guestRankAfter);
  assertRankAndWalletUnchanged('host', hostRankBefore, hostRankAfter);
  assertRankAndWalletUnchanged('guest', guestRankBefore, guestRankAfter);
}

async function assertLivePvpRankedQueueSmoke({ playerA, playerB, playerC, playerAName, playerBName, playerCName }) {
  const rankBeforeA = await request('/api/pvp/rank', { token: playerA.sessionToken });
  requireOk('prod live ranked player A rank before', rankBeforeA);
  const rankBeforeC = await request('/api/pvp/rank', { token: playerC.sessionToken });
  requireOk('prod live ranked player C rank before', rankBeforeC);

  const joinA = await request('/api/pvp/live/queue/join', {
    method: 'POST',
    token: playerA.sessionToken,
    body: {
      displayName: playerAName,
      loadout: makeLivePvpLoadout('sword', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']),
      wideMatchConsent: true
    }
  });
  requireOk('prod live ranked queue join A', joinA);
  assert.strictEqual(joinA.payload.status, 'waiting', `prod live ranked first queue user should wait: ${JSON.stringify(joinA.payload)}`);
  assert.strictEqual(joinA.payload.waitingReport?.wideMatchConsent?.viewerAccepted, true, `prod live ranked first queue user should visibly accept protected matching: ${JSON.stringify(joinA.payload)}`);
  const queueTicket = joinA.payload.queueTicket;
  assert(queueTicket, `prod live ranked first queue user should receive queue ticket: ${JSON.stringify(joinA.payload)}`);

  await sleep(1050);

  const joinBWaiting = await request('/api/pvp/live/queue/join', {
    method: 'POST',
    token: playerB.sessionToken,
    body: {
      displayName: playerBName,
      loadout: makeLivePvpLoadout('shield', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']),
      wideMatchConsent: true
    }
  });
  requireOk('prod live ranked queue join B protected wait', joinBWaiting);
  assert.strictEqual(joinBWaiting.payload.status, 'waiting', `prod live ranked second low-sample user should wait for third-player protection: ${JSON.stringify(joinBWaiting.payload)}`);
  assert.strictEqual(joinBWaiting.payload.waitingReport?.requiresPoolSize, 3, `prod live ranked low-sample protection should require a third player: ${JSON.stringify(joinBWaiting.payload)}`);
  const queueTicketB = joinBWaiting.payload.queueTicket;
  assert(queueTicketB, `prod live ranked second queue user should receive queue ticket: ${JSON.stringify(joinBWaiting.payload)}`);

  await sleep(1050);

  const joinC = await request('/api/pvp/live/queue/join', {
    method: 'POST',
    token: playerC.sessionToken,
    body: {
      displayName: playerCName,
      loadout: makeLivePvpLoadout('curse', ['pvp_strike', 'pvp_guard', 'pvp_burst', 'pvp_guard']),
      wideMatchConsent: true
    }
  });
  requireOk('prod live ranked queue join C', joinC);
  assert.strictEqual(joinC.payload.status, 'matched', `prod live ranked should match through public queue: ${JSON.stringify(joinC.payload)}`);
  assert.strictEqual(joinC.payload.stateView?.mode, 'ranked', `prod live ranked public queue match should use ranked mode: ${JSON.stringify(joinC.payload)}`);
  assert.strictEqual(joinC.payload.stateView?.status, 'setup', `prod live ranked public queue match should start in setup: ${JSON.stringify(joinC.payload)}`);
  assert.strictEqual(joinC.payload.stateView?.postMatchReview, null, `prod live ranked setup should not expose terminal review: ${JSON.stringify(joinC.payload.stateView)}`);
  assert(
    joinC.payload.stateView?.matchQuality?.expansionStage === 'low_sample_pairing'
      && joinC.payload.stateView?.matchQuality?.safeguards?.includes('low_sample_protection'),
    `prod live ranked third-player match should preserve low-sample pairing safeguard: ${JSON.stringify(joinC.payload.stateView?.matchQuality)}`
  );
  const matchId = joinC.payload.matchId;
  assert(matchId, `prod live ranked match should return match id: ${JSON.stringify(joinC.payload)}`);

  const pollA = await request(`/api/pvp/live/queue/status/${encodeURIComponent(queueTicket)}`, { token: playerA.sessionToken });
  requireOk('prod live ranked queue status A', pollA);
  assert.strictEqual(pollA.payload.status, 'matched', `prod live ranked waiting player should recover matched queue status: ${JSON.stringify(pollA.payload)}`);
  assert.strictEqual(pollA.payload.matchId, matchId, `prod live ranked queue status should recover same match: ${JSON.stringify(pollA.payload)}`);

  const cancelB = await request('/api/pvp/live/queue/cancel', {
    method: 'POST',
    token: playerB.sessionToken,
    body: { queueTicket: queueTicketB }
  });
  requireOk('prod live ranked cancel unused low-sample queue user', cancelB);

  const ready = await readyLiveMatch({
    matchId,
    tokenA: playerA.sessionToken,
    tokenB: playerC.sessionToken,
    stateVersionA: pollA.payload.stateView.stateVersion,
    prefix: 'prod-live-ranked'
  });
  assert.strictEqual(ready.payload.stateView?.mode, 'ranked', `prod live ranked both ready should enter active ranked mode: ${JSON.stringify(ready.payload)}`);

  const playerASeat = String(pollA.payload.seatId || pollA.payload.stateView?.self?.seatId || '');
  const playerCSeat = String(joinC.payload.seatId || joinC.payload.stateView?.self?.seatId || '');
  const participantsBySeat = {
    [playerASeat]: {
      sessionToken: playerA.sessionToken,
      rankBefore: rankBeforeA,
      label: 'A'
    },
    [playerCSeat]: {
      sessionToken: playerC.sessionToken,
      rankBefore: rankBeforeC,
      label: 'C'
    }
  };
  await assertRankedActiveRecoverySmoke({ matchId, participantsBySeat });
  const lethalFinish = await finishRankedMatchWithRealLethal({ matchId, participantsBySeat });
  const terminalReview = lethalFinish.terminal.payload.stateView?.postMatchReview;
  assert.strictEqual(lethalFinish.terminal.payload.stateView?.status, 'finished', `prod live ranked real card lethal should finish authoritative match: ${JSON.stringify(lethalFinish.terminal.payload)}`);
  assert.strictEqual(lethalFinish.terminal.payload.stateView?.mode, 'ranked', `prod live ranked lethal should stay ranked: ${JSON.stringify(lethalFinish.terminal.payload)}`);
  assert.strictEqual(terminalReview?.finishReason, 'lethal', `prod live ranked terminal review should be lethal: ${JSON.stringify(terminalReview)}`);
  const winnerSeat = String(terminalReview?.winnerSeat || '');
  const loserSeat = String(terminalReview?.loserSeat || '');
  assert(participantsBySeat[winnerSeat] && participantsBySeat[loserSeat], `prod live ranked lethal should identify both seats: ${JSON.stringify(terminalReview)}`);

  const loserState = await request(`/api/pvp/live/matches/${encodeURIComponent(matchId)}`, { token: participantsBySeat[loserSeat].sessionToken });
  requireOk('prod live ranked loser match read', loserState);
  const loserSettlement = loserState.payload.stateView?.postMatchReview?.settlementReport;
  assert.strictEqual(loserState.payload.stateView?.postMatchReview?.finishReason, 'lethal', `prod live ranked loser review should stay lethal: ${JSON.stringify(loserState.payload.stateView?.postMatchReview)}`);
  assert.strictEqual(loserSettlement?.reportVersion, 'pvp-live-settlement-report-v1', `prod live ranked loser should expose settlement report: ${JSON.stringify(loserState.payload.stateView?.postMatchReview)}`);
  assert.strictEqual(loserSettlement?.result, 'loss', `prod live ranked loser settlement should be scoped to loser: ${JSON.stringify(loserSettlement)}`);
  assert.strictEqual(loserSettlement?.sourceVisibility, 'server_authoritative_settlement', `prod live ranked settlement should expose server source: ${JSON.stringify(loserSettlement)}`);
  assert.strictEqual(loserSettlement?.formalResultPolicy, 'ranked_authoritative', `prod live ranked settlement should be formal authoritative: ${JSON.stringify(loserSettlement)}`);
  assertRankedLethalSettlementReasons(loserSettlement, 'prod live ranked lethal settlement');
  assert.strictEqual(loserSettlement?.seasonHonorReport?.reportVersion, 'pvp-live-season-honor-v1', `prod live ranked settlement should expose season honor: ${JSON.stringify(loserSettlement)}`);
  assert.strictEqual(loserSettlement?.seasonHonorReport?.cosmeticReward?.rewardImpact, 'cosmetic_only', `prod live ranked season honor should remain cosmetic only: ${JSON.stringify(loserSettlement)}`);
  assert.strictEqual(loserSettlement?.seasonHonorReport?.powerImpact, 'none', `prod live ranked season honor should not grant power: ${JSON.stringify(loserSettlement)}`);

  const winnerState = await request(`/api/pvp/live/matches/${encodeURIComponent(matchId)}`, { token: participantsBySeat[winnerSeat].sessionToken });
  requireOk('prod live ranked winner match read', winnerState);
  const winnerSettlement = winnerState.payload.stateView?.postMatchReview?.settlementReport;
  assert.strictEqual(winnerState.payload.stateView?.status, 'finished', `prod live ranked winner should read finished match: ${JSON.stringify(winnerState.payload)}`);
  assert.strictEqual(winnerState.payload.stateView?.postMatchReview?.finishReason, 'lethal', `prod live ranked winner review should stay lethal: ${JSON.stringify(winnerState.payload.stateView?.postMatchReview)}`);
  assert.strictEqual(winnerSettlement?.result, 'win', `prod live ranked winner should see win settlement: ${JSON.stringify(winnerSettlement)}`);
  assert.strictEqual(winnerSettlement?.formalResultPolicy, 'ranked_authoritative', `prod live ranked winner settlement should be formal authoritative: ${JSON.stringify(winnerSettlement)}`);
  assertRankedLethalSettlementReasons(winnerSettlement, 'prod live ranked lethal winner settlement');

  const rankAfterA = await request('/api/pvp/rank', { token: playerA.sessionToken });
  requireOk('prod live ranked player A rank after', rankAfterA);
  const rankAfterC = await request('/api/pvp/rank', { token: playerC.sessionToken });
  requireOk('prod live ranked player C rank after', rankAfterC);
  const ranksBySeat = {
    [playerASeat]: { before: rankBeforeA, after: rankAfterA },
    [playerCSeat]: { before: rankBeforeC, after: rankAfterC }
  };
  const winnerRank = ranksBySeat[winnerSeat];
  const loserRank = ranksBySeat[loserSeat];
  assert.strictEqual(winnerRank.after.payload.rank.wins, winnerRank.before.payload.rank.wins + 1, `prod live ranked should add winner rank win: ${JSON.stringify({ before: winnerRank.before.payload, after: winnerRank.after.payload })}`);
  assert.strictEqual(winnerRank.after.payload.rank.losses, winnerRank.before.payload.rank.losses, `prod live ranked winner should not gain loss: ${JSON.stringify({ before: winnerRank.before.payload, after: winnerRank.after.payload })}`);
  assert.strictEqual(loserRank.after.payload.rank.wins, loserRank.before.payload.rank.wins, `prod live ranked loser should not gain win: ${JSON.stringify({ before: loserRank.before.payload, after: loserRank.after.payload })}`);
  assert.strictEqual(loserRank.after.payload.rank.losses, loserRank.before.payload.rank.losses + 1, `prod live ranked should add loser rank loss: ${JSON.stringify({ before: loserRank.before.payload, after: loserRank.after.payload })}`);
  assert(winnerRank.after.payload.rank.score > winnerRank.before.payload.rank.score, `prod live ranked winner score should increase: ${JSON.stringify({ before: winnerRank.before.payload.rank, after: winnerRank.after.payload.rank })}`);
  assert(loserRank.after.payload.rank.score < loserRank.before.payload.rank.score, `prod live ranked loser score should decrease: ${JSON.stringify({ before: loserRank.before.payload.rank, after: loserRank.after.payload.rank })}`);
  assert(winnerRank.after.payload.wallet.coins > winnerRank.before.payload.wallet.coins, `prod live ranked winner wallet should gain live reward: ${JSON.stringify({ before: winnerRank.before.payload.wallet, after: winnerRank.after.payload.wallet })}`);
  assert(loserRank.after.payload.wallet.coins > loserRank.before.payload.wallet.coins, `prod live ranked loser wallet should gain participation reward: ${JSON.stringify({ before: loserRank.before.payload.wallet, after: loserRank.after.payload.wallet })}`);
  assert.strictEqual(winnerRank.after.payload.wallet.totalMatches, winnerRank.before.payload.wallet.totalMatches + 1, `prod live ranked winner wallet should add one match: ${JSON.stringify({ before: winnerRank.before.payload.wallet, after: winnerRank.after.payload.wallet })}`);
  assert.strictEqual(loserRank.after.payload.wallet.totalMatches, loserRank.before.payload.wallet.totalMatches + 1, `prod live ranked loser wallet should add one match: ${JSON.stringify({ before: loserRank.before.payload.wallet, after: loserRank.after.payload.wallet })}`);
  assert(
    Array.isArray(winnerRank.after.payload.economy?.matchHistory)
      && winnerRank.after.payload.economy.matchHistory.some(item => item && item.source === 'live_pvp' && item.matchId === matchId && item.didWin === true),
    `prod live ranked should append winner live match history: ${JSON.stringify(winnerRank.after.payload.economy?.matchHistory)}`
  );
  assert(
    Array.isArray(loserRank.after.payload.economy?.matchHistory)
      && loserRank.after.payload.economy.matchHistory.some(item => item && item.source === 'live_pvp' && item.matchId === matchId && item.didWin === false),
    `prod live ranked should append loser live match history: ${JSON.stringify(loserRank.after.payload.economy?.matchHistory)}`
  );

  const replay = await request(`/api/pvp/live/matches/${encodeURIComponent(matchId)}/replay`, { token: participantsBySeat[winnerSeat].sessionToken });
  requireOk('prod live ranked replay', replay);
  assert.strictEqual(replay.payload.replay?.publicSummary?.status, 'finished', `prod live ranked replay should expose finished public replay: ${JSON.stringify(replay.payload)}`);
  assert.strictEqual(replay.payload.replay?.publicSummary?.finishReason, 'lethal', `prod live ranked replay should record lethal finish reason: ${JSON.stringify(replay.payload)}`);
  assert(
    Array.isArray(replay.payload.replay?.events) && replay.payload.replay.events.some(event => event.eventType === 'match_finished'),
    `prod live ranked replay should include match_finished public event: ${JSON.stringify(replay.payload)}`
  );
  assert(
    Array.isArray(replay.payload.replay?.events) && !replay.payload.replay.events.some(event => event.eventType === 'player_surrendered'),
    `prod live ranked replay should not contain surrender shortcut: ${JSON.stringify(replay.payload)}`
  );
}

async function main() {
  console.log(`[prod-smoke] Base URL: ${BASE_URL}`);

  const health = await request('/api/health');
  assert.strictEqual(health.status, 200, `/api/health should return 200: ${JSON.stringify(health.payload)}`);
  assert.strictEqual(health.payload && health.payload.status, 'ok', `/api/health should return status=ok: ${JSON.stringify(health.payload)}`);

  const username = `smoke_${RUN_ID}`;
  const opponentName = `smoke_opponent_${RUN_ID}`;
  await register(username);
  const user = await login(username);
  const opponent = await register(opponentName);

  const badTokenSaves = await request('/api/saves', { token: corruptToken(user.sessionToken) });
  requireStatus('corrupted JWT save read', badTokenSaves, 401);

  const badTokenGlobalWrite = await request('/api/user/global', {
    method: 'POST',
    token: corruptToken(user.sessionToken),
    body: {
      globalData: { marker: `bad_token_global_${RUN_ID}`, updatedAt: Date.now() },
      globalUpdatedAt: Date.now()
    }
  });
  requireStatus('corrupted JWT global write', badTokenGlobalWrite, 401);

  const badTokenGhostWrite = await request('/api/ghosts/current', {
    method: 'POST',
    token: corruptToken(user.sessionToken),
    body: {
      realm: REALM,
      ghostData: { name: `bad_token_ghost_${RUN_ID}`, hp: 500, maxHp: 1000, deck: [{ id: 'audit_guard' }], updatedAt: Date.now() },
      uploadTime: Date.now()
    }
  });
  requireStatus('corrupted JWT ghost upload', badTokenGhostWrite, 401);

  const badTokenPvpRank = await request('/api/pvp/rank', { token: corruptToken(user.sessionToken) });
  requireStatus('corrupted JWT PVP rank read', badTokenPvpRank, 401);

  const pvpRank = await request('/api/pvp/rank', { token: user.sessionToken });
  requireOk('PVP rank read', pvpRank);
  assert.strictEqual(pvpRank.payload.rank && pvpRank.payload.rank.score, 1000, `PVP rank should start at 1000: ${JSON.stringify(pvpRank.payload)}`);
  assert.strictEqual(pvpRank.payload.wallet && pvpRank.payload.wallet.coins, 1200, `PVP wallet should start at 1200 coins: ${JSON.stringify(pvpRank.payload)}`);

  const pvpEconomy = await request('/api/pvp/economy', { token: user.sessionToken });
  requireOk('PVP economy read', pvpEconomy);
  assert.strictEqual(pvpEconomy.payload.wallet && pvpEconomy.payload.wallet.coins, 1200, `PVP economy wallet should match rank wallet: ${JSON.stringify(pvpEconomy.payload)}`);

  const pvpDefenseRequest = {
    realm: 7,
    powerScore: 1480,
    battleData: makePvpBattleData('main', { maxHp: 390, energy: 5 }),
    config: { personality: 'balanced', guardianFormation: true },
    snapshotTime: Date.now()
  };
  const unsignedPvpDefense = await request('/api/pvp/defense', {
    method: 'POST',
    token: user.sessionToken,
    body: pvpDefenseRequest
  });
  requireStatus('unsigned PVP defense upload', unsignedPvpDefense, 400);

  const pvpDefense = await request('/api/pvp/defense', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      ...pvpDefenseRequest,
      ...signedFields(pvpDefenseRequest, user.sessionToken, 'pvp-defense')
    }
  });
  requireOk('PVP defense upload', pvpDefense);
  assert.strictEqual(pvpDefense.payload.snapshot && pvpDefense.payload.snapshot.isServer, true, `PVP defense should return server snapshot: ${JSON.stringify(pvpDefense.payload)}`);
  assert(pvpDefense.payload.snapshot.battleData.deck.some(card => card.id === 'heavyStrike'), `PVP defense should preserve uploaded deck: ${JSON.stringify(pvpDefense.payload)}`);

  const myPvpDefense = await request('/api/pvp/defense/me', { token: user.sessionToken });
  requireOk('PVP defense readback', myPvpDefense);
  assert(myPvpDefense.payload.snapshot.battleData.deck.some(card => card.id === 'heavyStrike'), `PVP defense readback should preserve uploaded deck: ${JSON.stringify(myPvpDefense.payload)}`);

  const opponentPvpDefenseRequest = {
    realm: 8,
    powerScore: 1660,
    battleData: makePvpBattleData('opponent', {
      maxHp: 440,
      energy: 5,
      deck: ['mirrorWall', 'ironBreath', 'reboundingShell', 'bastionStudy', 'wardingSweep', 'defend', 'ironWill', 'shieldBash'],
      aiProfile: 'fortified',
      deckArchetype: 'fortified',
      personalityRules: {
        damageMul: 0.92,
        takenMul: 0.85,
        regenEnergyPerTurn: 1,
        hpMul: 1.08
      }
    }),
    config: { personality: 'fortified', guardianFormation: true },
    snapshotTime: Date.now() + 1
  };
  const opponentPvpDefense = await request('/api/pvp/defense', {
    method: 'POST',
    token: opponent.sessionToken,
    body: {
      ...opponentPvpDefenseRequest,
      ...signedFields(opponentPvpDefenseRequest, opponent.sessionToken, 'pvp-defense-opponent')
    }
  });
  requireOk('opponent PVP defense upload', opponentPvpDefense);

  const opponentPvpRank = await request('/api/pvp/rank', { token: opponent.sessionToken });
  requireOk('opponent PVP rank read', opponentPvpRank);
  assert.strictEqual(opponentPvpRank.payload.rank?.user?.username, opponentName, `opponent PVP rank should bind the smoke account: ${JSON.stringify(opponentPvpRank.payload)}`);

  await assertLivePvpInviteSmoke({
    host: user,
    guest: opponent,
    hostName: username,
    guestName: opponentName
  });

  const rankedAName = `smoke_ranked_a_${RUN_ID}`;
  const rankedBName = `smoke_ranked_b_${RUN_ID}`;
  const rankedCName = `smoke_ranked_c_${RUN_ID}`;
  const rankedA = await register(rankedAName);
  const rankedB = await register(rankedBName);
  const rankedC = await register(rankedCName);
  await assertLivePvpRankedQueueSmoke({
    playerA: rankedA,
    playerB: rankedB,
    playerC: rankedC,
    playerAName: rankedAName,
    playerBName: rankedBName,
    playerCName: rankedCName
  });

  const pvpLeaderboard = await request('/api/pvp/leaderboard?limit=50', { token: user.sessionToken });
  requireOk('PVP leaderboard read', pvpLeaderboard);
  const leaderboardRows = pvpLeaderboard.payload.data;
  assert(Array.isArray(leaderboardRows), `PVP leaderboard should return an array: ${JSON.stringify(pvpLeaderboard.payload)}`);
  assert(leaderboardRows.length > 0 && leaderboardRows.length <= 50, `PVP leaderboard should honor its page limit: ${leaderboardRows.length}`);
  leaderboardRows.forEach((rank, index) => {
    assert(rank && rank.user && rank.user.objectId && rank.user.username, `PVP leaderboard row ${index} should expose a public user`);
    assert(Number.isFinite(Number(rank.score)), `PVP leaderboard row ${index} should expose a numeric score`);
    if (index > 0) {
      assert(Number(leaderboardRows[index - 1].score) >= Number(rank.score), `PVP leaderboard should be score-descending at row ${index}`);
    }
  });
  const opponentLeaderboardEntry = leaderboardRows.find(rank => rank.user?.objectId === opponent.objectId);
  const opponentScore = Number(opponentPvpRank.payload.rank?.score);
  const cutoffScore = Number(leaderboardRows.at(-1)?.score);
  assert(
    opponentLeaderboardEntry
      || (leaderboardRows.length === 50 && Number.isFinite(opponentScore) && Number.isFinite(cutoffScore) && opponentScore <= cutoffScore),
    `PVP leaderboard omitted the smoke opponent despite an available slot or qualifying score: ${JSON.stringify({ rowCount: leaderboardRows.length, opponentScore, cutoffScore })}`,
  );

  const pvpMatchRequest = {
    myScore: pvpRank.payload.rank.score,
    myRealm: 7,
    preferredRankId: opponentPvpRank.payload.rank.objectId,
    allowPractice: false
  };
  const unsignedPvpMatch = await request('/api/pvp/match', {
    method: 'POST',
    token: user.sessionToken,
    body: pvpMatchRequest
  });
  requireStatus('unsigned PVP match request', unsignedPvpMatch, 400);

  const pvpMatch = await request('/api/pvp/match', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      ...pvpMatchRequest,
      ...signedFields(pvpMatchRequest, user.sessionToken, 'pvp-match')
    }
  });
  requireOk('PVP match request', pvpMatch);
  assert(pvpMatch.payload.matchTicket, `PVP match should return a ticket: ${JSON.stringify(pvpMatch.payload)}`);
  assert.strictEqual(pvpMatch.payload.opponent && pvpMatch.payload.opponent.rank && pvpMatch.payload.opponent.rank.user.username, opponentName, `PVP match should lock requested opponent: ${JSON.stringify(pvpMatch.payload)}`);
  assert(pvpMatch.payload.opponent.battleData.deck.some(card => card.id === 'mirrorWall'), `PVP match should return opponent battle data: ${JSON.stringify(pvpMatch.payload)}`);

  const pvpReport = { matchTicket: pvpMatch.payload.matchTicket, didWin: true };
  const unsignedPvpReport = await request('/api/pvp/match/result', {
    method: 'POST',
    token: user.sessionToken,
    body: { report: pvpReport }
  });
  requireStatus('unsigned PVP match result', unsignedPvpReport, 400);

  const rankBeforePvpReport = await request('/api/pvp/rank', { token: user.sessionToken });
  requireOk('PVP rank before gated result', rankBeforePvpReport);
  const gatedPvpReport = await request('/api/pvp/match/result', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      report: pvpReport,
      ...signedFields(pvpReport, user.sessionToken, 'pvp-report-gated')
    }
  });
  requireStatus('PVP gated match result request', gatedPvpReport, 200);
  assert.strictEqual(gatedPvpReport.payload.success, false, `PVP production/default result gate should reject client result: ${JSON.stringify(gatedPvpReport.payload)}`);
  assert.strictEqual(gatedPvpReport.payload.reason, 'server_authority_unavailable', `PVP result gate should explain authority mode: ${JSON.stringify(gatedPvpReport.payload)}`);
  const rankAfterPvpReport = await request('/api/pvp/rank', { token: user.sessionToken });
  requireOk('PVP rank after gated result', rankAfterPvpReport);
  assert.strictEqual(rankAfterPvpReport.payload.rank.score, rankBeforePvpReport.payload.rank.score, `PVP gated result should not change score: ${JSON.stringify({ before: rankBeforePvpReport.payload, after: rankAfterPvpReport.payload })}`);
  assert.strictEqual(rankAfterPvpReport.payload.wallet.coins, rankBeforePvpReport.payload.wallet.coins, `PVP gated result should not change wallet: ${JSON.stringify({ before: rankBeforePvpReport.payload, after: rankAfterPvpReport.payload })}`);

  const pvpShopRequest = { itemId: 'secret_manual_2' };
  const unsignedPvpShop = await request('/api/pvp/shop/purchase', {
    method: 'POST',
    token: user.sessionToken,
    body: pvpShopRequest
  });
  requireStatus('unsigned PVP shop purchase', unsignedPvpShop, 400);

  const tamperedPvpShop = await request('/api/pvp/shop/purchase', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      itemId: 'secret_manual_1',
      ...signedFields(pvpShopRequest, user.sessionToken, 'pvp-shop-tamper')
    }
  });
  requireStatus('tampered PVP shop purchase', tamperedPvpShop, 403);

  const pvpShop = await request('/api/pvp/shop/purchase', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      ...pvpShopRequest,
      ...signedFields(pvpShopRequest, user.sessionToken, 'pvp-shop')
    }
  });
  requireOk('PVP shop purchase', pvpShop);
  assert.strictEqual(pvpShop.payload.coinsSpent, 300, `PVP shop should use server catalog pricing: ${JSON.stringify(pvpShop.payload)}`);
  assert.strictEqual(pvpShop.payload.wallet && pvpShop.payload.wallet.coins, 900, `PVP shop should deduct exactly one stock item price: ${JSON.stringify(pvpShop.payload)}`);

  const pvpEconomyAfterShop = await request('/api/pvp/economy', { token: user.sessionToken });
  requireOk('PVP economy after shop purchase', pvpEconomyAfterShop);
  assert.strictEqual(pvpEconomyAfterShop.payload.economy.purchases.secret_manual_2, 1, `PVP shop should record purchase count: ${JSON.stringify(pvpEconomyAfterShop.payload)}`);
  assert.strictEqual(pvpEconomyAfterShop.payload.economy.ownedItems.secret_manual_2, true, `PVP shop should record ownership: ${JSON.stringify(pvpEconomyAfterShop.payload)}`);

  const saveData = { level: 10, hp: 100, marker: RUN_ID };
  const saveTime = Date.now();
  const save = await request('/api/saves', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      slotIndex: 0,
      saveData,
      saveTime,
      ...signedFields(saveData, user.sessionToken, 'save')
    }
  });
  requireOk('save upload', save);

  const unsignedSave = await request('/api/saves', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      slotIndex: 1,
      saveData: { level: 11, hp: 101, marker: `unsigned_${RUN_ID}` },
      saveTime: Date.now()
    }
  });
  requireStatus('unsigned save upload', unsignedSave, 400);

  const infinitySaveData = { level: 12, hp: 102, marker: `infinity_${RUN_ID}`, timestamp: 9999999999999999 };
  const infinitySave = await request('/api/saves', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      slotIndex: 1,
      saveData: infinitySaveData,
      saveTime: 'Infinity',
      ...signedFields(infinitySaveData, user.sessionToken, 'save-infinity')
    }
  });
  requireOk('infinite timestamp save upload', infinitySave);

  const normalAfterInfinitySaveData = { level: 13, hp: 103, marker: `normal_after_infinity_${RUN_ID}` };
  const normalAfterInfinitySaveTime = await nextServerTimestamp(infinitySave.payload.saveTime);
  const normalAfterInfinitySave = await request('/api/saves', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      slotIndex: 1,
      saveData: normalAfterInfinitySaveData,
      saveTime: normalAfterInfinitySaveTime,
      ...signedFields(normalAfterInfinitySaveData, user.sessionToken, 'save-normal-after-infinity')
    }
  });
  requireOk('normal save after infinite timestamp', normalAfterInfinitySave);
  assert.strictEqual(normalAfterInfinitySave.payload.skipped, false, `normal save after infinite timestamp should update slot: ${JSON.stringify(normalAfterInfinitySave.payload)}`);

  const futureSaveTime = Date.now() + 6 * 24 * 60 * 60 * 1000;
  const futureSaveData = { level: 14, hp: 104, marker: `future_save_${RUN_ID}`, timestamp: futureSaveTime };
  const futureSave = await request('/api/saves', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      slotIndex: 1,
      saveData: futureSaveData,
      saveTime: futureSaveTime,
      ...signedFields(futureSaveData, user.sessionToken, 'save-future')
    }
  });
  requireOk('future timestamp save upload', futureSave);
  assert(futureSave.payload.saveTime < futureSaveTime, `future save timestamp was not normalized: ${JSON.stringify(futureSave.payload)}`);

  const normalAfterFutureSaveData = { level: 15, hp: 105, marker: `normal_after_future_save_${RUN_ID}` };
  const normalAfterFutureSaveTime = await nextServerTimestamp(futureSave.payload.saveTime);
  const normalAfterFutureSave = await request('/api/saves', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      slotIndex: 1,
      saveData: normalAfterFutureSaveData,
      saveTime: normalAfterFutureSaveTime,
      ...signedFields(normalAfterFutureSaveData, user.sessionToken, 'save-normal-after-future')
    }
  });
  requireOk('normal save after future timestamp', normalAfterFutureSave);
  assert.strictEqual(normalAfterFutureSave.payload.skipped, false, `normal save after future timestamp should update slot: ${JSON.stringify(normalAfterFutureSave.payload)}`);

  const staleSaveData = { level: 1, hp: 1, marker: `stale_save_${RUN_ID}` };
  const staleSave = await request('/api/saves', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      slotIndex: 1,
      saveData: staleSaveData,
      saveTime: normalAfterFutureSaveTime - 1,
      ...signedFields(staleSaveData, user.sessionToken, 'save-stale')
    }
  });
  requireOk('stale save upload', staleSave);
  assert.strictEqual(staleSave.payload.skipped, true, `stale save should be skipped: ${JSON.stringify(staleSave.payload)}`);

  const sameTimeSaveData = { level: 2, hp: 2, marker: `same_time_save_${RUN_ID}` };
  const sameTimeSave = await request('/api/saves', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      slotIndex: 1,
      saveData: sameTimeSaveData,
      saveTime: normalAfterFutureSaveTime,
      ...signedFields(sameTimeSaveData, user.sessionToken, 'save-same-time')
    }
  });
  requireOk('same-time save upload', sameTimeSave);
  assert.strictEqual(sameTimeSave.payload.skipped, true, `same-time save should be skipped: ${JSON.stringify(sameTimeSave.payload)}`);

  const saves = await request('/api/saves', { token: user.sessionToken });
  requireOk('save read', saves);
  const slot = saves.payload.data.find(item => item.slotIndex === 0);
  assert(slot && slot.saveData && slot.saveData.marker === RUN_ID, `save read did not return uploaded slot: ${JSON.stringify(saves.payload)}`);
  const timestampSlot = saves.payload.data.find(item => item.slotIndex === 1);
  assert(timestampSlot && timestampSlot.saveData && timestampSlot.saveData.marker === normalAfterFutureSaveData.marker, `invalid/future timestamp save should not lock slot 1: ${JSON.stringify(saves.payload)}`);
  assert.strictEqual(timestampSlot.saveData.timestamp, normalAfterFutureSave.payload.saveTime, `save payload timestamp should match canonical saveTime: ${JSON.stringify(timestampSlot)}`);

  const globalData = { achievements: { smoke: true }, marker: RUN_ID, updatedAt: Date.now() };
  const globalWrite = await request('/api/user/global', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      globalData,
      globalUpdatedAt: globalData.updatedAt,
      ...signedFields(globalData, user.sessionToken, 'global')
    }
  });
  requireOk('global data write', globalWrite);

  const unsignedGlobal = await request('/api/user/global', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      globalData: { achievements: { unsigned: true }, marker: `unsigned_${RUN_ID}`, updatedAt: Date.now() },
      globalUpdatedAt: Date.now()
    }
  });
  requireStatus('unsigned global data write', unsignedGlobal, 400);

  const futureGlobalTime = Date.now() + 6 * 24 * 60 * 60 * 1000;
  const futureGlobalData = { achievements: { future: true }, marker: `future_${RUN_ID}`, updatedAt: futureGlobalTime };
  const futureGlobalWrite = await request('/api/user/global', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      globalData: futureGlobalData,
      globalUpdatedAt: futureGlobalTime,
      ...signedFields(futureGlobalData, user.sessionToken, 'global-future')
    }
  });
  requireOk('future timestamp global data write', futureGlobalWrite);
  assert(futureGlobalWrite.payload.globalUpdatedAt < futureGlobalTime, `future global timestamp was not normalized: ${JSON.stringify(futureGlobalWrite.payload)}`);

  const normalAfterFutureGlobalTime = await nextServerTimestamp(futureGlobalWrite.payload.globalUpdatedAt);
  const normalAfterFutureGlobalData = { achievements: { normalAfterFuture: true }, marker: `normal_after_future_${RUN_ID}`, updatedAt: normalAfterFutureGlobalTime };
  const normalAfterFutureGlobal = await request('/api/user/global', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      globalData: normalAfterFutureGlobalData,
      globalUpdatedAt: normalAfterFutureGlobalData.updatedAt,
      ...signedFields(normalAfterFutureGlobalData, user.sessionToken, 'global-normal-after-future')
    }
  });
  requireOk('normal global data write after future timestamp', normalAfterFutureGlobal);
  assert.strictEqual(normalAfterFutureGlobal.payload.skipped, false, `normal global write after future timestamp should update data: ${JSON.stringify(normalAfterFutureGlobal.payload)}`);

  const staleGlobalData = { achievements: { stale: true }, marker: `stale_global_${RUN_ID}`, updatedAt: normalAfterFutureGlobalTime - 1 };
  const staleGlobal = await request('/api/user/global', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      globalData: staleGlobalData,
      globalUpdatedAt: staleGlobalData.updatedAt,
      ...signedFields(staleGlobalData, user.sessionToken, 'global-stale')
    }
  });
  requireOk('stale global data write', staleGlobal);
  assert.strictEqual(staleGlobal.payload.skipped, true, `stale global write should be skipped: ${JSON.stringify(staleGlobal.payload)}`);

  const sameTimeGlobalData = { achievements: { sameTime: true }, marker: `same_time_global_${RUN_ID}`, updatedAt: normalAfterFutureGlobalTime };
  const sameTimeGlobal = await request('/api/user/global', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      globalData: sameTimeGlobalData,
      globalUpdatedAt: sameTimeGlobalData.updatedAt,
      ...signedFields(sameTimeGlobalData, user.sessionToken, 'global-same-time')
    }
  });
  requireOk('same-time global data write', sameTimeGlobal);
  assert.strictEqual(sameTimeGlobal.payload.skipped, true, `same-time global write should be skipped: ${JSON.stringify(sameTimeGlobal.payload)}`);

  const globalRead = await request('/api/user/global', { token: user.sessionToken });
  requireOk('global data read', globalRead);
  assert(globalRead.payload.data && globalRead.payload.data.marker === normalAfterFutureGlobalData.marker, `global read did not return latest normalized payload: ${JSON.stringify(globalRead.payload)}`);

  const ghostData = { name: username, hp: 500, maxHp: 1000, deck: [{ id: 'audit_strike' }], marker: RUN_ID, updatedAt: Date.now() };
  const ghostWrite = await request('/api/ghosts/current', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      realm: REALM,
      ghostData,
      uploadTime: ghostData.updatedAt,
      ...signedFields(ghostData, user.sessionToken, 'ghost')
    }
  });
  requireOk('own ghost upload', ghostWrite);

  const staleGhostData = { name: username, hp: 501, maxHp: 1000, deck: [{ id: 'audit_stale' }], marker: `stale_ghost_${RUN_ID}`, updatedAt: ghostData.updatedAt - 1 };
  const staleGhost = await request('/api/ghosts/current', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      realm: REALM,
      ghostData: staleGhostData,
      uploadTime: staleGhostData.updatedAt,
      ...signedFields(staleGhostData, user.sessionToken, 'ghost-stale')
    }
  });
  requireOk('stale ghost upload', staleGhost);
  assert.strictEqual(staleGhost.payload.skipped, true, `stale ghost upload should be skipped: ${JSON.stringify(staleGhost.payload)}`);

  const sameTimeGhostData = { name: username, hp: 502, maxHp: 1000, deck: [{ id: 'audit_same_time' }], marker: `same_time_ghost_${RUN_ID}`, updatedAt: ghostData.updatedAt };
  const sameTimeGhost = await request('/api/ghosts/current', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      realm: REALM,
      ghostData: sameTimeGhostData,
      uploadTime: sameTimeGhostData.updatedAt,
      ...signedFields(sameTimeGhostData, user.sessionToken, 'ghost-same-time')
    }
  });
  requireOk('same-time ghost upload', sameTimeGhost);
  assert.strictEqual(sameTimeGhost.payload.skipped, true, `same-time ghost upload should be skipped: ${JSON.stringify(sameTimeGhost.payload)}`);

  const unsignedGhost = await request('/api/ghosts/current', {
    method: 'POST',
    token: user.sessionToken,
    body: {
      realm: REALM,
      ghostData: { name: `unsigned_${username}`, hp: 500, maxHp: 1000, deck: [{ id: 'audit_guard' }], updatedAt: Date.now() },
      uploadTime: Date.now()
    }
  });
  requireStatus('unsigned ghost upload', unsignedGhost, 400);

  const mainGhostFromOpponent = await request(`/api/ghosts/random?realm=${REALM}`, { token: opponent.sessionToken });
  requireOk('main ghost fetch from opponent account', mainGhostFromOpponent);
  assert.strictEqual(mainGhostFromOpponent.payload.data && mainGhostFromOpponent.payload.data.userName, username, `opponent should see current user's ghost before uploading own ghost: ${JSON.stringify(mainGhostFromOpponent.payload)}`);
  assert.strictEqual(mainGhostFromOpponent.payload.data && mainGhostFromOpponent.payload.data.ghostData && mainGhostFromOpponent.payload.data.ghostData.marker, RUN_ID, `stale ghost writes should not overwrite main ghost payload: ${JSON.stringify(mainGhostFromOpponent.payload)}`);

  const opponentGhost = { name: opponentName, hp: 520, maxHp: 1000, deck: [{ id: 'audit_guard' }], updatedAt: Date.now() + 1 };
  const opponentGhostWrite = await request('/api/ghosts/current', {
    method: 'POST',
    token: opponent.sessionToken,
    body: {
      realm: REALM,
      ghostData: opponentGhost,
      uploadTime: opponentGhost.updatedAt,
      ...signedFields(opponentGhost, opponent.sessionToken, 'ghost-opponent')
    }
  });
  requireOk('opponent ghost upload', opponentGhostWrite);

  const randomGhost = await request(`/api/ghosts/random?realm=${REALM}`, { token: user.sessionToken });
  requireOk('random ghost fetch', randomGhost);
  assert.strictEqual(randomGhost.payload.data && randomGhost.payload.data.userName, opponentName, `random ghost should exclude current user and return opponent: ${JSON.stringify(randomGhost.payload)}`);
  assert.strictEqual(randomGhost.payload.data && randomGhost.payload.data.ghostData && randomGhost.payload.data.ghostData.name, opponentName, `random ghost payload should match opponent: ${JSON.stringify(randomGhost.payload)}`);

  console.log('[prod-smoke] API smoke passed.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
