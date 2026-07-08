import assert from 'node:assert/strict';
import { BackendClient } from '../js/services/backend-client.js';

const calls = [];
const requestCallCount = () => calls.length;

BackendClient.getCurrentUser = () => ({
  objectId: 'live-user-a',
  username: '甲'
});
BackendClient.getServerConfig = () => ({
  baseUrl: 'http://127.0.0.1:9000',
  pvpPathPrefix: '/api/pvp'
});
BackendClient.requestServer = async (path, options = {}) => {
  calls.push({ path, options });
  if (path.includes('/match/result')) {
    throw new Error(`live pvp client must not call legacy settlement path: ${path}`);
  }
  return {
    success: true,
    status: 'matched',
    queueTicket: 'pvplq-test',
    matchId: 'pvplm-test',
    seatId: 'A',
    stateView: {
      matchId: 'pvplm-test',
      stateVersion: 1,
      self: { seatId: 'A', hand: [{ instanceId: 'A-burst-1' }] },
      opponent: { seatId: 'B', handCount: 3 }
    },
    result: 'accepted',
    events: [{ eventType: 'card_played' }]
  };
};

assert.equal(typeof BackendClient.joinLivePvpQueue, 'function', 'BackendClient should expose joinLivePvpQueue');
assert.equal(typeof BackendClient.cancelLivePvpQueue, 'function', 'BackendClient should expose cancelLivePvpQueue');
assert.equal(typeof BackendClient.getLivePvpQueueStatus, 'function', 'BackendClient should expose getLivePvpQueueStatus');
assert.equal(typeof BackendClient.getLivePvpMatch, 'function', 'BackendClient should expose getLivePvpMatch');
assert.equal(typeof BackendClient.getCurrentLivePvpMatch, 'function', 'BackendClient should expose getCurrentLivePvpMatch');
assert.equal(typeof BackendClient.getLivePvpReplay, 'function', 'BackendClient should expose getLivePvpReplay');
assert.equal(typeof BackendClient.createLivePvpReplayShare, 'function', 'BackendClient should expose createLivePvpReplayShare');
assert.equal(typeof BackendClient.getLivePvpReplayShare, 'function', 'BackendClient should expose getLivePvpReplayShare');
assert.equal(typeof BackendClient.revokeLivePvpReplayShare, 'function', 'BackendClient should expose revokeLivePvpReplayShare');
assert.equal(typeof BackendClient.requestLivePvpRematch, 'function', 'BackendClient should expose requestLivePvpRematch');
assert.equal(typeof BackendClient.getLivePvpRematchStatus, 'function', 'BackendClient should expose getLivePvpRematchStatus');
assert.equal(typeof BackendClient.cancelLivePvpRematch, 'function', 'BackendClient should expose cancelLivePvpRematch');
assert.equal(typeof BackendClient.createLivePvpInvite, 'function', 'BackendClient should expose createLivePvpInvite');
assert.equal(typeof BackendClient.joinLivePvpInvite, 'function', 'BackendClient should expose joinLivePvpInvite');
assert.equal(typeof BackendClient.cancelLivePvpInvite, 'function', 'BackendClient should expose cancelLivePvpInvite');
assert.equal(typeof BackendClient.getCurrentLivePvpInvite, 'function', 'BackendClient should expose getCurrentLivePvpInvite');
assert.equal(typeof BackendClient.getLivePvpInviteInbox, 'function', 'BackendClient should expose getLivePvpInviteInbox');
assert.equal(typeof BackendClient.measureLivePvpConnectionHealth, 'function', 'BackendClient should expose live PVP connection health preflight');
assert.equal(typeof BackendClient.heartbeatLivePvpMatch, 'function', 'BackendClient should expose heartbeatLivePvpMatch');
assert.equal(typeof BackendClient.submitLivePvpIntent, 'function', 'BackendClient should expose submitLivePvpIntent');
assert.equal(typeof BackendClient.submitLivePvpAvoidOpponent, 'function', 'BackendClient should expose submitLivePvpAvoidOpponent');
assert.equal(typeof BackendClient.getLivePvpWebSocketUrl, 'function', 'BackendClient should expose getLivePvpWebSocketUrl');
assert.equal(typeof BackendClient.getLivePvpWebSocketProtocols, 'function', 'BackendClient should expose getLivePvpWebSocketProtocols');
assert.equal(typeof BackendClient.connectLivePvpWebSocket, 'function', 'BackendClient should expose connectLivePvpWebSocket');

const liveLoadout = {
  identitySlot: 'sword',
  label: '攻击测试谱',
  deck: Array.from({ length: 20 }, (_, index) => ({ id: index % 3 === 0 ? 'pvp_burst' : index % 3 === 1 ? 'pvp_strike' : 'pvp_guard', upgraded: false }))
};
BackendClient.loadServerSession = () => ({
  token: 'token ws+/=',
  user: { objectId: 'live-user-a', username: '甲' }
});
assert.equal(
  BackendClient.getLivePvpWebSocketUrl(),
  'ws://127.0.0.1:9000/api/pvp/live/ws',
  'live WebSocket URL should not put bearer tokens in the upgrade URL',
);
assert.ok(
  BackendClient.getLivePvpWebSocketProtocols().some(protocol => /^defier-auth\.[A-Za-z0-9_-]+$/.test(protocol)),
  'live WebSocket protocols should carry an encoded auth token outside the URL',
);
BackendClient.loadServerSession = () => null;
const originalWebSocket = globalThis.WebSocket;
let constructedUnauthedSocket = false;
globalThis.WebSocket = function FakeWebSocket() {
  constructedUnauthedSocket = true;
};
assert.deepEqual(
  BackendClient.getLivePvpWebSocketProtocols(),
  [],
  'live WebSocket protocols should not advertise an unauthenticated socket',
);
assert.equal(
  BackendClient.connectLivePvpWebSocket(),
  null,
  'live WebSocket should not connect without an auth token',
);
assert.equal(constructedUnauthedSocket, false, 'live WebSocket should not construct an unauthenticated socket');
globalThis.WebSocket = originalWebSocket;
BackendClient.loadServerSession = () => ({
  token: 'token ws+/=',
  user: { objectId: 'live-user-a', username: '甲' }
});
const join = await BackendClient.joinLivePvpQueue({ displayName: '甲', loadout: liveLoadout });
assert.equal(join.success, true, 'live queue join should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/queue/join', 'live queue join should use live queue endpoint');
assert.equal(calls.at(-1).options.method, 'POST', 'live queue join should POST');
assert.deepEqual(calls.at(-1).options.data, { displayName: '甲', loadout: liveLoadout }, 'live queue join should forward display name and loadout snapshot candidate');
assert.notEqual(calls.at(-1).options.data.loadout, liveLoadout, 'live queue join should clone loadout before sending');

const wideConsentJoin = await BackendClient.joinLivePvpQueue({ displayName: '甲', loadout: liveLoadout, wideMatchConsent: true });
assert.equal(wideConsentJoin.success, true, 'live queue join should accept explicit wide match consent');
assert.equal(calls.at(-1).options.data.wideMatchConsent, true, 'live queue join should forward explicit wide match consent only when selected');

const connectionHealthProbe = {
  sampleWindowMs: 60000,
  missedHeartbeatCount: 0,
  reconnectCount: 0,
  rttP95Ms: 640,
};
const healthProbeJoin = await BackendClient.joinLivePvpQueue({ displayName: '甲', connectionHealthProbe });
assert.equal(healthProbeJoin.success, true, 'live queue join should accept connection health probe');
assert.deepEqual(calls.at(-1).options.data.connectionHealthProbe, connectionHealthProbe, 'live queue join should forward queue connection health probe');
assert.notEqual(calls.at(-1).options.data.connectionHealthProbe, connectionHealthProbe, 'live queue join should clone connection health probe before sending');

const originalQueueRequestServer = BackendClient.requestServer;
BackendClient.requestServer = async (path, options = {}) => {
  calls.push({ path, options });
  const error = new Error('当前连接不适合进入正式真人排位，请重试检测或先进入问道练习。');
  error.reason = 'connection_health_failed';
  error.payload = {
    success: false,
    reason: 'connection_health_failed',
    message: error.message,
    connectionHealth: {
      reportVersion: 'pvp-live-queue-connection-health-v1',
      status: 'blocked',
      sampleTag: 'client_preflight',
      reasons: ['missed_heartbeat', 'high_rtt'],
      actions: [
        { id: 'retry_connection_check', label: '重试检测' },
        { id: 'practice', label: '问道练习', detail: '练习不写正式积分。' }
      ]
    }
  };
  throw error;
};
const blockedHealthJoin = await BackendClient.joinLivePvpQueue({ displayName: '甲', connectionHealthProbe });
assert.equal(blockedHealthJoin.success, false, 'live queue join should surface blocked connection health failure');
assert.equal(blockedHealthJoin.reason, 'connection_health_failed', 'blocked connection health join should preserve stable reason');
assert.equal(blockedHealthJoin.connectionHealth?.status, 'blocked', 'blocked connection health join should preserve backend health report');
assert.ok(blockedHealthJoin.connectionHealth?.actions?.some(action => action.id === 'practice'), 'blocked connection health join should preserve practice action');
BackendClient.requestServer = originalQueueRequestServer;

BackendClient.requestServer = async (path, options = {}) => {
  calls.push({ path, options });
  const error = new Error('排队取消过于频繁，正式真人排位短暂冷却中。');
  error.reason = 'queue_cooldown';
  error.payload = {
    success: false,
    reason: 'queue_cooldown',
    message: error.message,
    matchmakingGuard: {
      reportVersion: 'pvp-live-matchmaking-guard-v1',
      status: 'blocked',
      cooldownSource: 'queue_cancel_abuse',
      sourceLabel: '频繁取消冷却',
      retryAt: Date.now() + 60000,
      cooldownRemainingMs: 60000,
      rankedImpact: 'none',
      actions: [
        { id: 'retry_queue_later', label: '稍后重试', detail: '冷却结束后再进入正式排位。' },
        { id: 'practice', label: '问道练习', detail: '练习不写正式积分。' }
      ]
    }
  };
  throw error;
};
const blockedQueueCooldownJoin = await BackendClient.joinLivePvpQueue({ displayName: '甲' });
assert.equal(blockedQueueCooldownJoin.success, false, 'live queue join should surface queue cooldown failure');
assert.equal(blockedQueueCooldownJoin.reason, 'queue_cooldown', 'queue cooldown join should preserve stable reason');
assert.equal(blockedQueueCooldownJoin.matchmakingGuard?.reportVersion, 'pvp-live-matchmaking-guard-v1', 'queue cooldown join should preserve backend matchmaking guard report');
assert.equal(blockedQueueCooldownJoin.matchmakingGuard?.cooldownSource, 'queue_cancel_abuse', 'queue cooldown join should preserve cooldown source');
assert.ok(blockedQueueCooldownJoin.matchmakingGuard?.actions?.some(action => action.id === 'practice' && /不写正式积分/.test(action.detail)), 'queue cooldown join should preserve no-score practice action');
BackendClient.requestServer = originalQueueRequestServer;

const measuredHealth = await BackendClient.measureLivePvpConnectionHealth();
assert.equal(measuredHealth.reportVersion, 'pvp-live-queue-connection-health-v1', 'live connection preflight should return stable report version');
assert.equal(measuredHealth.status, 'pass', 'live connection preflight should pass when health endpoint responds');
assert.equal(measuredHealth.sampleTag, 'client_preflight', 'live connection preflight should expose client preflight tag');
assert.equal(measuredHealth.missedHeartbeatCount, 0, 'live connection preflight should not invent missed heartbeats on success');
assert.equal(measuredHealth.reconnectCount, 0, 'live connection preflight should not invent reconnects on success');
assert.ok(measuredHealth.rttP95Ms >= 0, 'live connection preflight should expose bounded RTT summary');
assert.equal(calls.at(-1).path, '/api/health', 'live connection preflight should call backend health endpoint');
assert.equal(calls.at(-1).options.auth, false, 'live connection preflight should not require auth headers');

const longName = `  ${'甲'.repeat(48)}  `;
const trimmed = await BackendClient.joinLivePvpQueue({ displayName: longName });
assert.equal(trimmed.success, true, 'live queue join should accept long display name');
assert.equal(calls.at(-1).options.data.displayName.length, 40, 'live queue join should clamp display name length');
assert.equal(calls.at(-1).options.data.displayName, '甲'.repeat(40), 'live queue join should trim before clamping display name');

const blankName = await BackendClient.joinLivePvpQueue({ displayName: '   ' });
assert.equal(blankName.success, true, 'live queue join should accept blank display name and let server use account name');
assert.deepEqual(calls.at(-1).options.data, {}, 'blank live display name should not send dirty displayName');

const cancel = await BackendClient.cancelLivePvpQueue('pvplq test/1');
assert.equal(cancel.success, true, 'live queue cancel should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/queue/cancel', 'live queue cancel should use live cancel endpoint');
assert.equal(calls.at(-1).options.method, 'POST', 'live queue cancel should POST');
assert.deepEqual(calls.at(-1).options.data, { queueTicket: 'pvplq test/1' }, 'live queue cancel should forward queue ticket only');

const status = await BackendClient.getLivePvpQueueStatus('pvplq test/1');
assert.equal(status.success, true, 'live queue status should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/queue/status/pvplq%20test%2F1', 'live queue status should encode queue ticket');
assert.equal(calls.at(-1).options.method, 'GET', 'live queue status should GET');

const beforeEmptyTicket = requestCallCount();
const emptyTicket = await BackendClient.getLivePvpQueueStatus('   ');
assert.equal(emptyTicket.success, false, 'empty live queue ticket should fail locally');
assert.equal(requestCallCount(), beforeEmptyTicket, 'empty live queue ticket should not call requestServer');

const beforeEmptyCancel = requestCallCount();
const emptyCancel = await BackendClient.cancelLivePvpQueue('   ');
assert.equal(emptyCancel.success, false, 'empty live queue cancel ticket should fail locally');
assert.equal(requestCallCount(), beforeEmptyCancel, 'empty live queue cancel ticket should not call requestServer');

const match = await BackendClient.getLivePvpMatch('pvplm test/1');
assert.equal(match.success, true, 'live match fetch should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/matches/pvplm%20test%2F1', 'live match fetch should encode match id');
assert.equal(calls.at(-1).options.method, 'GET', 'live match fetch should GET');

const currentMatch = await BackendClient.getCurrentLivePvpMatch();
assert.equal(currentMatch.success, true, 'current live match fetch should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/matches/current', 'current live match should use live current endpoint');
assert.equal(calls.at(-1).options.method, 'GET', 'current live match should GET');

const replay = await BackendClient.getLivePvpReplay('pvplm test/1', { visibility: 'replay_public' });
assert.equal(replay.success, true, 'live replay fetch should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/matches/pvplm%20test%2F1/replay?visibility=replay_public', 'live replay fetch should encode match id and visibility');
assert.equal(calls.at(-1).options.method, 'GET', 'live replay fetch should GET');

const defaultReplay = await BackendClient.getLivePvpReplay('pvplm test/2');
assert.equal(defaultReplay.success, true, 'default live replay fetch should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/matches/pvplm%20test%2F2/replay', 'default live replay fetch should omit default visibility query');

const replayShare = await BackendClient.createLivePvpReplayShare('pvplm test/1', { ttlDays: 30 });
assert.equal(replayShare.success, true, 'live replay share creation should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/matches/pvplm%20test%2F1/replay-share', 'live replay share creation should encode match id');
assert.equal(calls.at(-1).options.method, 'POST', 'live replay share creation should POST');
assert.deepEqual(calls.at(-1).options.data, { ttlDays: 30 }, 'live replay share creation should forward ttlDays only');

const publicReplayShare = await BackendClient.getLivePvpReplayShare('pvplrs-public_token-12345678901234567890');
assert.equal(publicReplayShare.success, true, 'public live replay share fetch should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/replay-shares/pvplrs-public_token-12345678901234567890', 'public live replay share fetch should encode share token');
assert.equal(calls.at(-1).options.method, 'GET', 'public live replay share fetch should GET');

const revokedReplayShare = await BackendClient.revokeLivePvpReplayShare('pvplm test/1');
assert.equal(revokedReplayShare.success, true, 'live replay share revoke should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/matches/pvplm%20test%2F1/replay-share/revoke', 'live replay share revoke should encode match id');
assert.equal(calls.at(-1).options.method, 'POST', 'live replay share revoke should POST');
assert.deepEqual(calls.at(-1).options.data, undefined, 'live replay share revoke should not send client settlement data');

const rematch = await BackendClient.requestLivePvpRematch('pvplm test/1', { displayName: '甲', loadout: liveLoadout });
assert.equal(rematch.success, true, 'live friendly rematch should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/matches/pvplm%20test%2F1/rematch', 'live friendly rematch should encode source match id');
assert.equal(calls.at(-1).options.method, 'POST', 'live friendly rematch should POST');
assert.deepEqual(calls.at(-1).options.data, { displayName: '甲', loadout: liveLoadout }, 'live friendly rematch should forward display name and loadout snapshot candidate');
assert.notEqual(calls.at(-1).options.data.loadout, liveLoadout, 'live friendly rematch should clone loadout before sending');

const rematchStatus = await BackendClient.getLivePvpRematchStatus('pvplm test/1');
assert.equal(rematchStatus.success, true, 'live friendly rematch status should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/matches/pvplm%20test%2F1/rematch', 'live friendly rematch status should encode source match id');
assert.equal(calls.at(-1).options.method, 'GET', 'live friendly rematch status should GET');

const rematchCancel = await BackendClient.cancelLivePvpRematch('pvplm test/1');
assert.equal(rematchCancel.success, true, 'live friendly rematch cancel should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/matches/pvplm%20test%2F1/rematch/cancel', 'live friendly rematch cancel should encode source match id');
assert.equal(calls.at(-1).options.method, 'POST', 'live friendly rematch cancel should POST');
assert.deepEqual(calls.at(-1).options.data, undefined, 'live friendly rematch cancel should not send legacy settlement body');

const invite = await BackendClient.createLivePvpInvite({ displayName: '甲', loadout: liveLoadout });
assert.equal(invite.success, true, 'live private invite creation should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/invites', 'live private invite creation should use live invite endpoint');
assert.equal(calls.at(-1).options.method, 'POST', 'live private invite creation should POST');
assert.deepEqual(calls.at(-1).options.data, { displayName: '甲', loadout: liveLoadout }, 'live private invite creation should forward display name and loadout snapshot candidate');
assert.notEqual(calls.at(-1).options.data.loadout, liveLoadout, 'live private invite creation should clone loadout before sending');

const targetedInvite = await BackendClient.createLivePvpInvite({ displayName: '甲', targetUsername: ' 辛 ', loadout: liveLoadout });
assert.equal(targetedInvite.success, true, 'live targeted private invite creation should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/invites', 'live targeted private invite should use live invite endpoint');
assert.deepEqual(calls.at(-1).options.data, { displayName: '甲', targetUsername: '辛', loadout: liveLoadout }, 'live targeted private invite should forward trimmed target username');
assert.notEqual(calls.at(-1).options.data.loadout, liveLoadout, 'live targeted private invite should clone loadout before sending');

const inviteJoin = await BackendClient.joinLivePvpInvite('TD AB/12', { displayName: '乙', loadout: liveLoadout });
assert.equal(inviteJoin.success, true, 'live private invite join should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/invites/TD%20AB%2F12/join', 'live private invite join should encode invite code');
assert.equal(calls.at(-1).options.method, 'POST', 'live private invite join should POST');
assert.deepEqual(calls.at(-1).options.data, { displayName: '乙', loadout: liveLoadout }, 'live private invite join should forward display name and loadout snapshot candidate');
assert.notEqual(calls.at(-1).options.data.loadout, liveLoadout, 'live private invite join should clone loadout before sending');

const inviteCancel = await BackendClient.cancelLivePvpInvite('TD AB/12');
assert.equal(inviteCancel.success, true, 'live private invite cancel should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/invites/TD%20AB%2F12/cancel', 'live private invite cancel should encode invite code');
assert.equal(calls.at(-1).options.method, 'POST', 'live private invite cancel should POST');
assert.deepEqual(calls.at(-1).options.data, {}, 'live private invite cancel should send an empty body');

const originalRequestServer = BackendClient.requestServer;
BackendClient.requestServer = async (path, options = {}) => {
  calls.push({ path, options });
  const error = new Error('好友约战邀请码已过期');
  error.code = 404;
  error.reason = 'invite_expired';
  throw error;
};
const expiredInviteCancel = await BackendClient.cancelLivePvpInvite('TD EXP');
assert.equal(expiredInviteCancel.success, false, 'live private invite cancel should return failed payload on server expiry');
assert.equal(expiredInviteCancel.reason, 'invite_expired', 'live private invite cancel should preserve server expiry reason');
BackendClient.requestServer = originalRequestServer;

const currentInvite = await BackendClient.getCurrentLivePvpInvite();
assert.equal(currentInvite.success, true, 'live current private invite should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/invites/current', 'live current private invite should use current invite endpoint');
assert.equal(calls.at(-1).options.method, 'GET', 'live current private invite should GET');

const inviteInbox = await BackendClient.getLivePvpInviteInbox();
assert.equal(inviteInbox.success, true, 'live invite inbox should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/invites/inbox', 'live invite inbox should use inbox endpoint');
assert.equal(calls.at(-1).options.method, 'GET', 'live invite inbox should GET');

const heartbeat = await BackendClient.heartbeatLivePvpMatch('pvplm test/1');
assert.equal(heartbeat.success, true, 'live heartbeat should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/matches/pvplm%20test%2F1/heartbeat', 'live heartbeat should encode match id');
assert.equal(calls.at(-1).options.method, 'POST', 'live heartbeat should POST');
assert.deepEqual(calls.at(-1).options.data, {}, 'live heartbeat should send an empty body');

const livePayload = { cardInstanceId: 'A-burst-1', targetSeat: 'B' };
const intent = await BackendClient.submitLivePvpIntent('pvplm-test', {
  intentId: 'intent-client-1',
  intentType: 'play_card',
  stateVersion: 1.9,
  payload: livePayload,
  matchTicket: 'legacy-ticket',
  didWin: true
});
assert.equal(intent.result, 'accepted', 'live intent submission should forward reducer result');
assert.equal(calls.at(-1).path, '/api/pvp/live/matches/pvplm-test/intents', 'live intent should use live intent endpoint');
assert.equal(calls.at(-1).options.method, 'POST', 'live intent should POST');
assert.deepEqual(calls.at(-1).options.data, {
  intentId: 'intent-client-1',
  intentType: 'play_card',
  stateVersion: 1,
  payload: { cardInstanceId: 'A-burst-1', targetSeat: 'B' }
}, 'live intent should not add legacy didWin or matchTicket fields');
assert.notEqual(calls.at(-1).options.data.payload, livePayload, 'live intent should clone payload before sending');

BackendClient.requestServer = async (path, options = {}) => {
  calls.push({ path, options });
  const error = new Error('需要同步权威状态');
  error.code = 409;
  error.reason = 'sync_required';
  throw error;
};
const staleIntent = await BackendClient.submitLivePvpIntent('pvplm-test', {
  intentId: 'intent-client-stale',
  intentType: 'play_card',
  stateVersion: 1,
  payload: livePayload
});
assert.equal(staleIntent.success, false, 'live intent stale failure should return failed payload');
assert.equal(staleIntent.reason, 'sync_required', 'live intent stale failure should preserve server reason');
BackendClient.requestServer = originalRequestServer;

const avoidOpponent = await BackendClient.submitLivePvpAvoidOpponent('pvplm test/1', {
  reason: 'post_match_avoid',
  message: '之后优先避开这个对手'
});
assert.equal(avoidOpponent.success, true, 'live avoid-opponent request should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/matches/pvplm%20test%2F1/avoid-opponent', 'live avoid-opponent request should encode match id');
assert.equal(calls.at(-1).options.method, 'POST', 'live avoid-opponent request should POST');
assert.deepEqual(calls.at(-1).options.data, {
  reason: 'post_match_avoid',
  message: '之后优先避开这个对手'
}, 'live avoid-opponent request should send only a bounded social safety payload');

const beforeEmptyMatch = requestCallCount();
const emptyMatch = await BackendClient.getLivePvpMatch('');
assert.equal(emptyMatch.success, false, 'empty live match id should fail locally');
assert.equal(requestCallCount(), beforeEmptyMatch, 'empty live match id should not call requestServer');

const beforeEmptyRematch = requestCallCount();
const emptyRematch = await BackendClient.requestLivePvpRematch('', { displayName: '甲' });
assert.equal(emptyRematch.success, false, 'empty live rematch match id should fail locally');
assert.equal(requestCallCount(), beforeEmptyRematch, 'empty live rematch match id should not call requestServer');

const beforeEmptyReplay = requestCallCount();
const emptyReplay = await BackendClient.getLivePvpReplay('', { visibility: 'replay_public' });
assert.equal(emptyReplay.success, false, 'empty live replay match id should fail locally');
assert.equal(requestCallCount(), beforeEmptyReplay, 'empty live replay match id should not call requestServer');

const beforeInvalidReplayVisibility = requestCallCount();
const invalidReplayVisibility = await BackendClient.getLivePvpReplay('pvplm-test', { visibility: 'server_full' });
assert.equal(invalidReplayVisibility.success, false, 'server_full replay visibility should fail locally');
assert.equal(requestCallCount(), beforeInvalidReplayVisibility, 'server_full replay visibility should not call requestServer');

const beforeEmptyReplayShare = requestCallCount();
const emptyReplayShare = await BackendClient.createLivePvpReplayShare('  ');
assert.equal(emptyReplayShare.success, false, 'empty live replay share match id should fail locally');
assert.equal(requestCallCount(), beforeEmptyReplayShare, 'empty live replay share match id should not call requestServer');

const beforeEmptyPublicReplayShare = requestCallCount();
const emptyPublicReplayShare = await BackendClient.getLivePvpReplayShare('  ');
assert.equal(emptyPublicReplayShare.success, false, 'empty public live replay share token should fail locally');
assert.equal(requestCallCount(), beforeEmptyPublicReplayShare, 'empty public live replay share token should not call requestServer');

const beforeEmptyInvite = requestCallCount();
const emptyInviteJoin = await BackendClient.joinLivePvpInvite('   ', { displayName: '乙' });
assert.equal(emptyInviteJoin.success, false, 'empty live invite code should fail locally');
assert.equal(requestCallCount(), beforeEmptyInvite, 'empty live invite code should not call requestServer');

const beforeEmptyInviteCancel = requestCallCount();
const emptyInviteCancel = await BackendClient.cancelLivePvpInvite('   ');
assert.equal(emptyInviteCancel.success, false, 'empty live invite cancel code should fail locally');
assert.equal(requestCallCount(), beforeEmptyInviteCancel, 'empty live invite cancel code should not call requestServer');

const beforeEmptyHeartbeat = requestCallCount();
const emptyHeartbeat = await BackendClient.heartbeatLivePvpMatch('');
assert.equal(emptyHeartbeat.success, false, 'empty live heartbeat match id should fail locally');
assert.equal(requestCallCount(), beforeEmptyHeartbeat, 'empty live heartbeat match id should not call requestServer');

const beforeEmptyIntentMatch = requestCallCount();
const emptyIntentMatch = await BackendClient.submitLivePvpIntent('', {
  intentId: 'intent-client-2',
  intentType: 'end_turn',
  stateVersion: 1,
  payload: {}
});
assert.equal(emptyIntentMatch.success, false, 'empty live intent match id should fail locally');
assert.equal(requestCallCount(), beforeEmptyIntentMatch, 'empty live intent match id should not call requestServer');

const beforeEmptyAvoidOpponentMatch = requestCallCount();
const emptyAvoidOpponentMatch = await BackendClient.submitLivePvpAvoidOpponent('', { reason: 'post_match_avoid' });
assert.equal(emptyAvoidOpponentMatch.success, false, 'empty live avoid-opponent match id should fail locally');
assert.equal(requestCallCount(), beforeEmptyAvoidOpponentMatch, 'empty live avoid-opponent match id should not call requestServer');

BackendClient.getCurrentUser = () => null;
const loggedOut = await BackendClient.joinLivePvpQueue({ displayName: '甲' });
assert.equal(loggedOut.success, false, 'live queue join should fail when logged out');
assert.match(loggedOut.message || '', /未登录/, 'logged out live queue failure should be readable');

console.log('sanity_pvp_live_client_checks passed');
