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

async function submitLiveIntent(matchId, token, intent) {
  return request(`/api/pvp/live/matches/${encodeURIComponent(matchId)}/intents`, {
    method: 'POST',
    token,
    body: intent
  });
}

function assertRankAndWalletUnchanged(label, before, after) {
  assert.strictEqual(after.payload.rank.score, before.payload.rank.score, `${label} prod live invite smoke should not change rank scores`);
  assert.strictEqual(after.payload.rank.wins, before.payload.rank.wins, `${label} prod live invite smoke should not change rank wins`);
  assert.strictEqual(after.payload.rank.losses, before.payload.rank.losses, `${label} prod live invite smoke should not change rank losses`);
  assert.strictEqual(after.payload.wallet.coins, before.payload.wallet.coins, `${label} prod live invite smoke should not change wallet coins`);
  assert.strictEqual(after.payload.wallet.totalMatches, before.payload.wallet.totalMatches, `${label} prod live invite smoke should not change wallet match count`);
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

  await assertLivePvpInviteSmoke({
    host: user,
    guest: opponent,
    hostName: username,
    guestName: opponentName
  });

  const pvpLeaderboard = await request('/api/pvp/leaderboard?limit=20', { token: user.sessionToken });
  requireOk('PVP leaderboard read', pvpLeaderboard);
  assert(Array.isArray(pvpLeaderboard.payload.data) && pvpLeaderboard.payload.data.some(rank => rank.user && rank.user.username === opponentName), `PVP leaderboard should include opponent: ${JSON.stringify(pvpLeaderboard.payload)}`);

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
