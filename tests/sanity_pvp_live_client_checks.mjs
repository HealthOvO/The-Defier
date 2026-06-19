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
assert.equal(typeof BackendClient.requestLivePvpRematch, 'function', 'BackendClient should expose requestLivePvpRematch');
assert.equal(typeof BackendClient.createLivePvpInvite, 'function', 'BackendClient should expose createLivePvpInvite');
assert.equal(typeof BackendClient.joinLivePvpInvite, 'function', 'BackendClient should expose joinLivePvpInvite');
assert.equal(typeof BackendClient.cancelLivePvpInvite, 'function', 'BackendClient should expose cancelLivePvpInvite');
assert.equal(typeof BackendClient.getCurrentLivePvpInvite, 'function', 'BackendClient should expose getCurrentLivePvpInvite');
assert.equal(typeof BackendClient.getLivePvpInviteInbox, 'function', 'BackendClient should expose getLivePvpInviteInbox');
assert.equal(typeof BackendClient.heartbeatLivePvpMatch, 'function', 'BackendClient should expose heartbeatLivePvpMatch');
assert.equal(typeof BackendClient.submitLivePvpIntent, 'function', 'BackendClient should expose submitLivePvpIntent');

const liveLoadout = {
  identitySlot: 'sword',
  label: '攻击测试谱',
  deck: Array.from({ length: 20 }, (_, index) => ({ id: index % 3 === 0 ? 'pvp_burst' : index % 3 === 1 ? 'pvp_strike' : 'pvp_guard', upgraded: false }))
};
const join = await BackendClient.joinLivePvpQueue({ displayName: '甲', loadout: liveLoadout });
assert.equal(join.success, true, 'live queue join should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/queue/join', 'live queue join should use live queue endpoint');
assert.equal(calls.at(-1).options.method, 'POST', 'live queue join should POST');
assert.deepEqual(calls.at(-1).options.data, { displayName: '甲', loadout: liveLoadout }, 'live queue join should forward display name and loadout snapshot candidate');
assert.notEqual(calls.at(-1).options.data.loadout, liveLoadout, 'live queue join should clone loadout before sending');

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

const rematch = await BackendClient.requestLivePvpRematch('pvplm test/1', { displayName: '甲', loadout: liveLoadout });
assert.equal(rematch.success, true, 'live friendly rematch should forward success payload');
assert.equal(calls.at(-1).path, '/api/pvp/live/matches/pvplm%20test%2F1/rematch', 'live friendly rematch should encode source match id');
assert.equal(calls.at(-1).options.method, 'POST', 'live friendly rematch should POST');
assert.deepEqual(calls.at(-1).options.data, { displayName: '甲', loadout: liveLoadout }, 'live friendly rematch should forward display name and loadout snapshot candidate');
assert.notEqual(calls.at(-1).options.data.loadout, liveLoadout, 'live friendly rematch should clone loadout before sending');

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

BackendClient.getCurrentUser = () => null;
const loggedOut = await BackendClient.joinLivePvpQueue({ displayName: '甲' });
assert.equal(loggedOut.success, false, 'live queue join should fail when logged out');
assert.match(loggedOut.message || '', /未登录/, 'logged out live queue failure should be readable');

console.log('sanity_pvp_live_client_checks passed');
