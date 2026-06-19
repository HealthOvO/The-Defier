const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function loadFile(ctx, filePath) {
  let code = fs.readFileSync(filePath, 'utf8');
  code = code.replace(/^export\s+(const|let|var|class|function|default)/gm, '$1');
  code = code.replace(/^export\s+\{.*?\};?/gm, '');
  code = code.replace(/^import\s+.*?;/gm, '');
  vm.runInContext(code, ctx, { filename: filePath });
}

(async function run() {
  const root = path.resolve(__dirname, '..');
  const calls = [];
  const ctx = vm.createContext({
    console,
    window: {},
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    BackendClient: {
      ensureReady: () => true,
      getCurrentUser: () => ({ objectId: 'live-user-a', username: '甲' }),
      joinLivePvpQueue: async (options) => {
        calls.push({ method: 'joinLivePvpQueue', options });
        return { success: true, status: 'waiting', queueTicket: 'pvplq-test' };
      },
      cancelLivePvpQueue: async (queueTicket) => {
        calls.push({ method: 'cancelLivePvpQueue', queueTicket });
        return { success: true, status: 'cancelled', queueTicket };
      },
      getLivePvpQueueStatus: async (queueTicket) => {
        calls.push({ method: 'getLivePvpQueueStatus', queueTicket });
        return { success: true, status: 'matched', matchId: 'pvplm-test', seatId: 'A' };
      },
      getLivePvpMatch: async (matchId) => {
        calls.push({ method: 'getLivePvpMatch', matchId });
        return { success: true, matchId, stateView: { stateVersion: 1 } };
      },
      getCurrentLivePvpMatch: async () => {
        calls.push({ method: 'getCurrentLivePvpMatch' });
        return { success: true, matchId: 'pvplm-current', seatId: 'A', stateView: { stateVersion: 1 } };
      },
      getLivePvpReplay: async (matchId, options) => {
        calls.push({ method: 'getLivePvpReplay', matchId, options });
        return { success: true, replay: { reportVersion: 'pvp-live-replay-v1', visibilityLayer: options && options.visibility || 'replay_self' } };
      },
      requestLivePvpRematch: async (matchId, options) => {
        calls.push({ method: 'requestLivePvpRematch', matchId, options });
        return { success: true, status: 'waiting_rematch', friendlySeries: { reportVersion: 'pvp-live-friendly-series-v1', rankedImpact: 'none' } };
      },
      createLivePvpInvite: async (options) => {
        calls.push({ method: 'createLivePvpInvite', options });
        return { success: true, status: 'waiting_invite', inviteCode: 'TD1234', inviteReport: { reportVersion: 'pvp-live-invite-v1', rankedImpact: 'none' } };
      },
      joinLivePvpInvite: async (inviteCode, options) => {
        calls.push({ method: 'joinLivePvpInvite', inviteCode, options });
        return { success: true, status: 'matched', matchId: 'pvplm-invite', seatId: 'B', stateView: { mode: 'friendly', status: 'setup' } };
      },
      cancelLivePvpInvite: async (inviteCode) => {
        calls.push({ method: 'cancelLivePvpInvite', inviteCode });
        return { success: true, status: 'cancelled', inviteCode, inviteReport: { reportVersion: 'pvp-live-invite-v1', status: 'cancelled' } };
      },
      getCurrentLivePvpInvite: async () => {
        calls.push({ method: 'getCurrentLivePvpInvite' });
        return { success: true, status: 'waiting_invite', inviteCode: 'TD1234', inviteReport: { reportVersion: 'pvp-live-invite-v1', status: 'waiting' } };
      },
      getLivePvpInviteInbox: async () => {
        calls.push({ method: 'getLivePvpInviteInbox' });
        return {
          success: true,
          status: 'invite_inbox',
          invites: [
            {
              inviteCode: 'TDIN42',
              inviteReport: {
                reportVersion: 'pvp-live-invite-v1',
                inviteCode: 'TDIN42',
                host: { displayName: '甲' },
                target: { displayName: '辛' },
                rankedImpact: 'none'
              }
            }
          ]
        };
      },
      heartbeatLivePvpMatch: async (matchId) => {
        calls.push({ method: 'heartbeatLivePvpMatch', matchId });
        return { success: true, matchId, stateView: { connectionReport: { reportVersion: 'pvp-live-connection-v1' } } };
      },
      submitLivePvpIntent: async (matchId, intent) => {
        calls.push({ method: 'submitLivePvpIntent', matchId, intent });
        return { success: true, result: 'accepted', stateView: { stateVersion: 2 } };
      },
      connectLivePvpWebSocket: (handlers) => {
        calls.push({ method: 'connectLivePvpWebSocket', handlers });
        return { send: () => true, close: () => true };
      },
      reportPvpMatchResult: async () => {
        throw new Error('live pvp bridge must not call legacy reportPvpMatchResult');
      }
    },
    AuthService: {},
    CARDS: {},
    STARTER_DECK: [],
    PVP_SHOP_ITEMS: [],
    EloCalculator: { calculate: (rating, opponent, result) => ({ newRating: rating + (result ? 20 : -20), delta: result ? 20 : -20 }) },
    Utils: {},
    Math,
    JSON,
    Date
  });
  ctx.window = ctx;
  ctx.global = ctx;
  ctx.globalThis = ctx;

  loadFile(ctx, path.join(root, 'js/services/pvp-service.js'));
  const PVPService = vm.runInContext('PVPService', ctx);

  assert(PVPService.live && typeof PVPService.live.joinQueue === 'function', 'PVPService.live should expose joinQueue');
  assert(typeof PVPService.live.cancelQueue === 'function', 'PVPService.live should expose cancelQueue');
  assert(typeof PVPService.live.getQueueStatus === 'function', 'PVPService.live should expose getQueueStatus');
  assert(typeof PVPService.live.getMatch === 'function', 'PVPService.live should expose getMatch');
  assert(typeof PVPService.live.getCurrentMatch === 'function', 'PVPService.live should expose getCurrentMatch');
  assert(typeof PVPService.live.getReplay === 'function', 'PVPService.live should expose getReplay');
  assert(typeof PVPService.live.requestRematch === 'function', 'PVPService.live should expose requestRematch');
  assert(typeof PVPService.live.createInvite === 'function', 'PVPService.live should expose createInvite');
  assert(typeof PVPService.live.joinInvite === 'function', 'PVPService.live should expose joinInvite');
  assert(typeof PVPService.live.cancelInvite === 'function', 'PVPService.live should expose cancelInvite');
  assert(typeof PVPService.live.getCurrentInvite === 'function', 'PVPService.live should expose getCurrentInvite');
  assert(typeof PVPService.live.getInviteInbox === 'function', 'PVPService.live should expose getInviteInbox');
  assert(typeof PVPService.live.heartbeat === 'function', 'PVPService.live should expose heartbeat');
  assert(typeof PVPService.live.submitIntent === 'function', 'PVPService.live should expose submitIntent');
  assert(typeof PVPService.live.connectRealtime === 'function', 'PVPService.live should expose connectRealtime');
  assert(!('reportResult' in PVPService.live), 'PVPService.live must not expose client-reported result API');

  const join = await PVPService.live.joinQueue({ displayName: '甲' });
  assert(join.success === true && join.status === 'waiting', 'live join bridge should forward join result');
  assert(calls.at(-1).method === 'joinLivePvpQueue', 'live join bridge should call BackendClient.joinLivePvpQueue');

  const cancel = await PVPService.live.cancelQueue('pvplq-test');
  assert(cancel.success === true && cancel.status === 'cancelled', 'live cancel bridge should forward cancel result');
  assert(calls.at(-1).method === 'cancelLivePvpQueue', 'live cancel bridge should call BackendClient.cancelLivePvpQueue');

  const status = await PVPService.live.getQueueStatus('pvplq-test');
  assert(status.success === true && status.status === 'matched', 'live queue bridge should forward queue status');
  assert(calls.at(-1).method === 'getLivePvpQueueStatus', 'live queue bridge should call BackendClient.getLivePvpQueueStatus');

  const match = await PVPService.live.getMatch('pvplm-test');
  assert(match.success === true && match.matchId === 'pvplm-test', 'live match bridge should forward match state');
  assert(calls.at(-1).method === 'getLivePvpMatch', 'live match bridge should call BackendClient.getLivePvpMatch');

  const currentMatch = await PVPService.live.getCurrentMatch();
  assert(currentMatch.success === true && currentMatch.matchId === 'pvplm-current', 'live current bridge should forward current match state');
  assert(calls.at(-1).method === 'getCurrentLivePvpMatch', 'live current bridge should call BackendClient.getCurrentLivePvpMatch');

  const replay = await PVPService.live.getReplay('pvplm-test', { visibility: 'audit_safe' });
  assert(replay.success === true && replay.replay.visibilityLayer === 'audit_safe', 'live replay bridge should forward replay payload');
  assert(calls.at(-1).method === 'getLivePvpReplay', 'live replay bridge should call BackendClient.getLivePvpReplay');

  const rematch = await PVPService.live.requestRematch('pvplm-test', { displayName: '甲' });
  assert(rematch.success === true && rematch.status === 'waiting_rematch', 'live rematch bridge should forward friendly rematch state');
  assert(calls.at(-1).method === 'requestLivePvpRematch', 'live rematch bridge should call BackendClient.requestLivePvpRematch');

  const invite = await PVPService.live.createInvite({ displayName: '甲' });
  assert(invite.success === true && invite.status === 'waiting_invite', 'live invite bridge should forward waiting invite state');
  assert(calls.at(-1).method === 'createLivePvpInvite', 'live invite bridge should call BackendClient.createLivePvpInvite');

  const joinedInvite = await PVPService.live.joinInvite('TD1234', { displayName: '乙' });
  assert(joinedInvite.success === true && joinedInvite.status === 'matched', 'live invite join bridge should forward matched invite state');
  assert(calls.at(-1).method === 'joinLivePvpInvite', 'live invite join bridge should call BackendClient.joinLivePvpInvite');

  const cancelledInvite = await PVPService.live.cancelInvite('TD1234');
  assert(cancelledInvite.success === true && cancelledInvite.status === 'cancelled', 'live invite cancel bridge should forward cancelled invite state');
  assert(calls.at(-1).method === 'cancelLivePvpInvite', 'live invite cancel bridge should call BackendClient.cancelLivePvpInvite');

  const currentInvite = await PVPService.live.getCurrentInvite();
  assert(currentInvite.success === true && currentInvite.status === 'waiting_invite', 'live current invite bridge should forward waiting invite state');
  assert(calls.at(-1).method === 'getCurrentLivePvpInvite', 'live current invite bridge should call BackendClient.getCurrentLivePvpInvite');

  const inviteInbox = await PVPService.live.getInviteInbox();
  assert(inviteInbox.success === true && inviteInbox.status === 'invite_inbox', 'live invite inbox bridge should forward targeted invite inbox state');
  assert(calls.at(-1).method === 'getLivePvpInviteInbox', 'live invite inbox bridge should call BackendClient.getLivePvpInviteInbox');

  const heartbeat = await PVPService.live.heartbeat('pvplm-test');
  assert(heartbeat.success === true && heartbeat.stateView.connectionReport.reportVersion === 'pvp-live-connection-v1', 'live heartbeat bridge should forward connection report');
  assert(calls.at(-1).method === 'heartbeatLivePvpMatch', 'live heartbeat bridge should call BackendClient.heartbeatLivePvpMatch');

  const intent = await PVPService.live.submitIntent('pvplm-test', {
    intentId: 'intent-bridge-1',
    intentType: 'end_turn',
    stateVersion: 1,
    payload: {}
  });
  assert(intent.success === true && intent.result === 'accepted', 'live intent bridge should forward intent result');
  assert(calls.at(-1).method === 'submitLivePvpIntent', 'live intent bridge should call BackendClient.submitLivePvpIntent');

  const realtime = PVPService.live.connectRealtime({ onMessage: () => {} });
  assert(realtime && typeof realtime.send === 'function', 'live realtime bridge should return websocket handle');
  assert(calls.at(-1).method === 'connectLivePvpWebSocket', 'live realtime bridge should call BackendClient.connectLivePvpWebSocket');
  assert(!calls.some(call => call.method === 'reportPvpMatchResult'), 'live bridge should not call legacy result reporting');

  console.log('sanity_pvp_live_service_bridge_checks passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
