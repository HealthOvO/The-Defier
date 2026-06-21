import assert from 'node:assert/strict';
import { createPvpLiveSession } from '../js/services/pvp-live-session.js';

function createMemoryStorage(initialEntries = []) {
  const data = new Map(initialEntries.map(([key, value]) => [String(key), String(value)]));
  return {
    setItem(key, value) {
      data.set(String(key), String(value));
    },
    getItem(key) {
      return data.get(String(key)) || '';
    },
    removeItem(key) {
      data.delete(String(key));
    },
    values() {
      return Array.from(data.values());
    }
  };
}

const calls = [];
const liveService = {
  joinQueue: async (options) => {
    calls.push({ method: 'joinQueue', options });
    return { success: true, status: 'waiting', queueTicket: 'pvplq-session' };
  },
  cancelQueue: async (queueTicket) => {
    calls.push({ method: 'cancelQueue', queueTicket });
    return { success: true, status: 'cancelled', queueTicket };
  },
  getQueueStatus: async (queueTicket) => {
    calls.push({ method: 'getQueueStatus', queueTicket });
    return {
      success: true,
      status: 'matched',
      matchId: 'pvplm-session',
      seatId: 'A',
      stateView: {
        matchId: 'pvplm-session',
        status: 'setup',
        stateVersion: 1,
        currentSeat: 'A',
        setup: { readyDeadlineAt: Date.now() + 45000, mulliganLimit: 2 },
        self: { seatId: 'A', hand: [{ instanceId: 'A-strike-1' }] },
        opponent: { seatId: 'B', handCount: 3, ready: false }
      }
    };
  },
  getMatch: async (matchId) => {
    calls.push({ method: 'getMatch', matchId });
    return {
      success: true,
      matchId,
      seatId: 'A',
      stateView: {
        matchId,
        status: 'active',
        stateVersion: 2,
        currentSeat: 'A',
        self: { seatId: 'A', hand: [] },
        opponent: { seatId: 'B', handCount: 3 }
      }
    };
  },
  getCurrentMatch: async () => {
    calls.push({ method: 'getCurrentMatch' });
    return {
      success: true,
      matchId: 'pvplm-current',
      seatId: 'B',
      stateView: {
        matchId: 'pvplm-current',
        status: 'active',
        stateVersion: 5,
        currentSeat: 'B',
        self: { seatId: 'B', hand: [{ instanceId: 'B-strike-1' }] },
        opponent: { seatId: 'A', handCount: 2 }
      }
    };
  },
  submitIntent: async (matchId, intent) => {
    calls.push({ method: 'submitIntent', matchId, intent });
    if (intent && intent.intentId === 'session-stale-1') {
      return {
        success: true,
        result: 'sync_required',
        reason: 'stale_state',
        events: [{ eventType: 'sync_required' }],
        stateView: {
          matchId,
          status: 'active',
          stateVersion: 8,
          currentSeat: 'B',
          self: { seatId: 'A', hand: [] },
          opponent: { seatId: 'B', handCount: 2 }
        }
      };
    }
    const isSurrender = intent && intent.intentType === 'surrender';
    const isSetupIntent = intent && (intent.intentType === 'ready' || intent.intentType === 'mulligan');
    const nextVersion = isSurrender ? 9 : isSetupIntent ? 3 : 7;
    return {
      success: true,
      result: 'accepted',
      events: [{ eventType: isSurrender ? 'player_surrendered' : isSetupIntent ? `${intent.intentType}_accepted` : 'card_played' }],
      stateView: {
        matchId,
        status: isSurrender ? 'finished' : isSetupIntent ? 'setup' : 'active',
        stateVersion: nextVersion,
        currentSeat: 'B',
        self: { seatId: 'A', hand: [] },
        opponent: { seatId: 'B', handCount: 3 }
      }
    };
  },
  heartbeat: async (matchId) => {
    calls.push({ method: 'heartbeat', matchId });
    return {
      success: true,
      matchId,
      seatId: 'A',
      stateView: {
        matchId,
        status: 'active',
        stateVersion: 6,
        currentSeat: 'A',
        connectionReport: {
          reportVersion: 'pvp-live-connection-v1',
          connectionHealth: 'opponent_grace',
          viewer: { seatId: 'A', status: 'online' },
          opponent: { seatId: 'B', status: 'grace', remainingGraceMs: 12000 },
          heartbeatIntervalMs: 5000,
          graceMs: 30000
        },
        self: { seatId: 'A', hand: [] },
        opponent: { seatId: 'B', handCount: 3 }
      }
    };
  },
  getReplay: async (matchId, options) => {
    calls.push({ method: 'getReplay', matchId, options });
    return {
      success: true,
      replay: {
        reportVersion: 'pvp-live-replay-v1',
        visibilityLayer: options && options.visibility || 'replay_self',
        matchRef: 'abcd1234abcd1234',
        hiddenScan: { forbiddenTokenCount: 0 }
      }
    };
  },
  createInvite: async (options) => {
    calls.push({ method: 'createInvite', options });
    return {
      success: true,
      status: 'waiting_invite',
      inviteCode: 'LIVE1234',
      inviteReport: {
        reportVersion: 'pvp-live-invite-v1',
        inviteCode: 'LIVE1234',
        status: 'waiting',
        rankedImpact: 'none',
        safeguards: ['invite_only_match', 'friendly_no_ranked_impact']
      }
    };
  },
  joinInvite: async (inviteCode, options) => {
    calls.push({ method: 'joinInvite', inviteCode, options });
    return {
      success: true,
      status: 'matched',
      matchId: 'pvplm-invite-session',
      seatId: 'B',
      inviteReport: {
        reportVersion: 'pvp-live-invite-v1',
        inviteCode,
        status: 'matched',
        rankedImpact: 'none'
      },
      stateView: {
        matchId: 'pvplm-invite-session',
        mode: 'friendly',
        status: 'setup',
        stateVersion: 1,
        matchQuality: {
          reportVersion: 'pvp-live-match-quality-v1',
          expansionStage: 'friend_invite',
          safeguards: ['invite_only_match', 'friendly_no_ranked_impact']
        },
        self: { seatId: 'B', hand: [] },
        opponent: { seatId: 'A', handCount: 3 }
      }
    };
  },
  cancelInvite: async (inviteCode) => {
    calls.push({ method: 'cancelInvite', inviteCode });
    return {
      success: true,
      status: 'cancelled',
      inviteCode,
      inviteReport: {
        reportVersion: 'pvp-live-invite-v1',
        inviteCode,
        status: 'cancelled',
        rankedImpact: 'none'
      }
    };
  },
  getCurrentInvite: async () => {
    calls.push({ method: 'getCurrentInvite' });
    return {
      success: true,
      status: 'waiting_invite',
      inviteCode: 'LIVE1234',
      inviteReport: {
        reportVersion: 'pvp-live-invite-v1',
        inviteCode: 'LIVE1234',
        status: 'waiting',
        rankedImpact: 'none',
        safeguards: ['invite_only_match', 'friendly_no_ranked_impact']
      }
    };
  },
  getInviteInbox: async () => {
    calls.push({ method: 'getInviteInbox' });
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
            rankedImpact: 'none',
            safeguards: ['invite_only_match', 'targeted_invite_only', 'friendly_no_ranked_impact']
          }
        }
      ]
    };
  },
  reportMatchResult: async () => {
    throw new Error('live session must not call legacy result reporting');
  },
  findOpponent: async () => {
    throw new Error('live session must not call legacy opponent matching');
  }
};

const session = createPvpLiveSession({ liveService });
assert.equal(session.getState().phase, 'idle', 'new live session should start idle');
assert.equal(typeof session.reportResult, 'undefined', 'live session should not expose client-reported result API');
assert.equal(typeof session.requestRematch, 'function', 'live session should expose friendly rematch request API');
assert.equal(typeof session.pollRematch, 'function', 'live session should expose friendly rematch polling API');
assert.equal(typeof session.cancelRematch, 'function', 'live session should expose friendly rematch cancel API');
assert.equal(typeof session.heartbeat, 'function', 'live session should expose heartbeat API');
assert.equal(typeof session.getReplay, 'function', 'live session should expose replay API');
assert.equal(typeof session.createInvite, 'function', 'live session should expose private invite creation API');
assert.equal(typeof session.joinInvite, 'function', 'live session should expose private invite join API');
assert.equal(typeof session.cancelInvite, 'function', 'live session should expose private invite cancel API');
assert.equal(typeof session.pollInvite, 'function', 'live session should expose private invite polling API');
assert.equal(typeof session.resumeCurrentInvite, 'function', 'live session should expose private invite resume API');
assert.equal(typeof session.refreshInviteInbox, 'function', 'live session should expose targeted private invite inbox refresh API');

const recoveredSession = createPvpLiveSession({ liveService });
const recovered = await recoveredSession.resumeCurrentMatch();
assert.equal(recovered.phase, 'active', 'resumeCurrentMatch should enter active when server has current match');
assert.equal(recovered.matchId, 'pvplm-current', 'resumeCurrentMatch should retain current match id');
assert.equal(recovered.seatId, 'B', 'resumeCurrentMatch should retain current seat');
assert.equal(recovered.stateView.stateVersion, 5, 'resumeCurrentMatch should store authoritative state view');
assert.equal(calls.at(-1).method, 'getCurrentMatch', 'resumeCurrentMatch should call live current match service');

const replayState = await recoveredSession.getReplay({ visibility: 'replay_public' });
assert.equal(replayState.lastReplay?.visibilityLayer, 'replay_public', 'getReplay should store returned public replay payload');
assert.equal(replayState.lastReplayMatchId, 'pvplm-current', 'getReplay should bind stored replay payload to the current match id');
assert.equal(replayState.lastError, null, 'successful getReplay should clear replay errors');
assert.equal(calls.at(-1).method, 'getReplay', 'getReplay should call live service replay bridge');
assert.deepEqual(calls.at(-1).options, { visibility: 'replay_public' }, 'getReplay should forward replay visibility options');

const replayClearedByQueue = await recoveredSession.joinQueue({ displayName: '乙' });
assert.equal(replayClearedByQueue.lastReplay, null, 'joining a new queue should clear the previous match replay payload');
assert.equal(replayClearedByQueue.lastReplayMatchId, '', 'joining a new queue should clear the previous replay match binding');

const recoveredInviteSession = createPvpLiveSession({ liveService });
const recoveredInvite = await recoveredInviteSession.resumeCurrentInvite();
assert.equal(recoveredInvite.phase, 'waiting_invite', 'resumeCurrentInvite should recover pending private invite');
assert.equal(recoveredInvite.inviteCode, 'LIVE1234', 'resumeCurrentInvite should retain pending invite code');
assert.equal(recoveredInvite.inviteReport?.status, 'waiting', 'resumeCurrentInvite should retain waiting invite report');
assert.equal(calls.at(-1).method, 'getCurrentInvite', 'resumeCurrentInvite should call live current invite service');

const inboxSession = createPvpLiveSession({ liveService });
const inviteInbox = await inboxSession.refreshInviteInbox();
assert.equal(inviteInbox.phase, 'idle', 'refreshInviteInbox should keep idle phase when only notifications are present');
assert.equal(inviteInbox.inviteInbox.length, 1, 'refreshInviteInbox should store targeted private invite notifications');
assert.equal(inviteInbox.inviteInbox[0].inviteCode, 'TDIN42', 'refreshInviteInbox should retain inbox invite code');
assert.equal(inviteInbox.inviteInbox[0].inviteReport?.target?.displayName, '辛', 'refreshInviteInbox should retain target display name');
assert.equal(inviteInbox.lastError, null, 'refreshInviteInbox should not surface an idle inbox as an error');
assert.equal(calls.at(-1).method, 'getInviteInbox', 'refreshInviteInbox should call live service invite inbox');

let flakyInboxShouldFail = true;
const flakyInboxSession = createPvpLiveSession({
  liveService: {
    getInviteInbox: async () => {
      if (flakyInboxShouldFail) {
        flakyInboxShouldFail = false;
        return {
          success: true,
          status: 'invite_inbox',
          invites: [
            {
              inviteCode: 'TDKEEP',
              inviteReport: {
                reportVersion: 'pvp-live-invite-v1',
                inviteCode: 'TDKEEP',
                host: { displayName: '甲' },
                target: { displayName: '辛' },
                rankedImpact: 'none'
              }
            }
          ]
        };
      }
      return {
        success: false,
        reason: 'network_timeout',
        message: '邀请收件箱暂时不可用'
      };
    }
  }
});
const stableInbox = await flakyInboxSession.refreshInviteInbox();
assert.equal(stableInbox.inviteInbox.length, 1, 'first refreshInviteInbox should seed existing inbox notifications');
const failedInbox = await flakyInboxSession.refreshInviteInbox();
assert.equal(failedInbox.inviteInbox.length, 1, 'failed refreshInviteInbox should keep previous invite notifications instead of showing empty');
assert.equal(failedInbox.lastError?.reason, 'invite_inbox_failed', 'failed refreshInviteInbox should expose stable inbox failure reason');

const recoveredInboxSession = createPvpLiveSession({
  liveService: {
    getInviteInbox: async () => ({
      success: true,
      status: 'invite_inbox',
      invites: [
        {
          inviteCode: 'TDRECOVER',
          inviteReport: {
            reportVersion: 'pvp-live-invite-v1',
            inviteCode: 'TDRECOVER',
            host: { displayName: '甲' },
            target: { displayName: '辛' },
            rankedImpact: 'none'
          }
        }
      ]
    })
  }
});
recoveredInboxSession.getState();
await recoveredInboxSession.joinInvite('', {});
assert.equal(recoveredInboxSession.getState().lastError?.reason, 'missing_invite_code', 'test should seed a stale live error before inbox refresh');
const recoveredInbox = await recoveredInboxSession.refreshInviteInbox();
assert.equal(recoveredInbox.inviteInbox.length, 1, 'successful refreshInviteInbox should store recovered inbox notification');
assert.equal(recoveredInbox.lastError, null, 'successful refreshInviteInbox should clear stale idle inbox errors');

const waiting = await session.joinQueue({ displayName: '甲', wideMatchConsent: true });
assert.equal(waiting.phase, 'waiting', 'waiting queue join should enter waiting phase');
assert.equal(waiting.queueTicket, 'pvplq-session', 'waiting queue join should retain queue ticket');
assert.equal(calls.at(-1).method, 'joinQueue', 'joinQueue should call live service joinQueue');
assert.equal(calls.at(-1).options.wideMatchConsent, true, 'joinQueue should preserve explicit wide match consent for the live service');

const cancelled = await session.cancelQueue();
assert.equal(cancelled.phase, 'idle', 'cancel queue should return session to idle');
assert.equal(cancelled.queueTicket, '', 'cancel queue should clear queue ticket');
assert.equal(cancelled.lastError, null, 'cancel queue should clear previous error');
assert.equal(calls.at(-1).method, 'cancelQueue', 'cancelQueue should call live service cancelQueue');

await session.joinQueue({ displayName: '甲' });

const matched = await session.pollQueue();
assert.equal(matched.phase, 'setup', 'matched queue poll should enter setup phase before battle starts');
assert.equal(matched.matchId, 'pvplm-session', 'matched queue poll should retain match id');
assert.equal(matched.seatId, 'A', 'matched queue poll should retain seat id');
assert.ok(!Array.isArray(matched.stateView.opponent.hand), 'live session state must not expose opponent hand');

const mulligan = await session.mulligan({ cardInstanceIds: ['A-strike-1'], intentId: 'session-mulligan-1' });
assert.equal(mulligan.phase, 'setup', 'mulligan should keep session in setup phase');
assert.equal(calls.at(-1).intent.intentType, 'mulligan', 'mulligan should submit mulligan intent');
assert.deepEqual(calls.at(-1).intent.payload, { cardInstanceIds: ['A-strike-1'] }, 'mulligan should forward selected card ids');

const ready = await session.ready({ intentId: 'session-ready-1' });
assert.equal(ready.phase, 'setup', 'single ready should keep session in setup until opponent is ready');
assert.equal(calls.at(-1).intent.intentType, 'ready', 'ready should submit ready intent');

const refreshed = await session.refreshMatch();
assert.equal(refreshed.phase, 'active', 'refreshing an active match should enter active phase');
assert.equal(refreshed.stateView.stateVersion, 2, 'refresh should store latest state view');

const heartbeat = await session.heartbeat();
assert.equal(heartbeat.phase, 'active', 'heartbeat should keep active match phase');
assert.equal(heartbeat.stateView.connectionReport.reportVersion, 'pvp-live-connection-v1', 'heartbeat should store authoritative connection report');
assert.equal(heartbeat.stateView.connectionReport.heartbeatIntervalMs, 5000, 'heartbeat should retain authoritative heartbeat interval for scene scheduling');
assert.equal(heartbeat.stateView.connectionReport.opponent.status, 'grace', 'heartbeat should preserve opponent grace status for UI');
assert.equal(calls.at(-1).method, 'heartbeat', 'heartbeat should call live service heartbeat');

const submitted = await session.submitIntent({
  intentId: 'session-intent-1',
  intentType: 'play_card',
  payload: { cardInstanceId: 'A-strike-1', targetSeat: 'B' }
});
assert.equal(submitted.phase, 'active', 'accepted intent should keep session active');
assert.equal(submitted.stateView.stateVersion, 7, 'accepted intent should update state view');
assert.deepEqual(submitted.lastEvents, [{ eventType: 'card_played' }], 'accepted intent should store last public events');
assert.deepEqual(calls.at(-1).intent, {
  intentId: 'session-intent-1',
  intentType: 'play_card',
  stateVersion: 6,
  payload: { cardInstanceId: 'A-strike-1', targetSeat: 'B' }
}, 'session should inject latest heartbeat-refreshed stateVersion into live intent');

const syncRequired = await session.submitIntent({
  intentId: 'session-stale-1',
  intentType: 'play_card',
  stateVersion: 1,
  payload: { cardInstanceId: 'A-stale-1', targetSeat: 'B' }
});
assert.equal(syncRequired.phase, 'sync_required', 'sync_required should move session into sync_required phase');
assert.equal(syncRequired.lastError.reason, 'stale_state', 'sync_required should keep authoritative reject reason');
assert.deepEqual(syncRequired.lastEvents, [{ eventType: 'sync_required' }], 'sync_required should keep sync events');
assert.equal(syncRequired.stateView.stateVersion, 8, 'sync_required should retain latest authoritative state view');

const surrendered = await session.surrender({ intentId: 'session-surrender-1' });
assert.equal(surrendered.phase, 'finished', 'surrender should move session into finished phase');
assert.equal(calls.at(-1).method, 'submitIntent', 'surrender should submit a live intent');
assert.equal(calls.at(-1).intent.intentType, 'surrender', 'surrender should use surrender intent type');
assert.equal(calls.at(-1).intent.stateVersion, 8, 'surrender should use latest state version');

const noTicketSession = createPvpLiveSession({ liveService });
const noTicket = await noTicketSession.pollQueue();
assert.equal(noTicket.phase, 'idle', 'poll without queue ticket should not leave idle phase');
assert.equal(noTicket.lastError.reason, 'missing_queue_ticket', 'poll without queue ticket should expose missing ticket reason');

const expiredSession = createPvpLiveSession({
  liveService: {
    joinQueue: async () => ({ success: true, status: 'waiting', queueTicket: 'pvplq-expired' }),
    getQueueStatus: async () => ({
      success: false,
      error: { code: 404 },
      message: '实时论道队列票据不存在'
    })
  }
});
await expiredSession.joinQueue({ displayName: '甲' });
const expiredTicket = await expiredSession.pollQueue();
assert.equal(expiredTicket.phase, 'idle', 'expired queue ticket should leave waiting phase');
assert.equal(expiredTicket.queueTicket, '', 'expired queue ticket should clear queue ticket');
assert.equal(expiredTicket.lastError.reason, 'queue_ticket_expired', 'expired queue ticket should expose terminal reason');

const longWaitSession = createPvpLiveSession({
  liveService: {
    joinQueue: async () => ({ success: true, status: 'waiting', queueTicket: 'pvplq-long-wait' }),
    getQueueStatus: async () => ({
      success: true,
      status: 'waiting',
      queueTicket: 'pvplq-long-wait',
      waitingReport: {
        reportVersion: 'pvp-live-waiting-report-v1',
        waitMs: 121000,
        longWaitThresholdMs: 120000,
        longWait: true,
        message: '当前真人较少，可继续等待、进入问道练习或取消匹配；不会自动切残影。',
        safeguards: ['real_player_only', 'no_ghost_fallback', 'no_score_change'],
        actions: [
          { id: 'continue_waiting', label: '继续等待', detail: '继续等待真人，不自动切残影。' },
          { id: 'practice', label: '问道练习', detail: '练习不写正式积分。' },
          { id: 'cancel_queue', label: '取消匹配', detail: '取消本次排队，不影响正式积分。' }
        ]
      }
    })
  }
});
await longWaitSession.joinQueue({ displayName: '甲' });
const longWait = await longWaitSession.pollQueue();
assert.equal(longWait.phase, 'waiting', 'long wait queue poll should keep waiting phase');
assert.equal(longWait.waitingReport.reportVersion, 'pvp-live-waiting-report-v1', 'session should retain long wait report version');
assert.equal(longWait.waitingReport.longWait, true, 'session should retain long wait branch flag');
assert.ok(longWait.waitingReport.actions.some(action => action.id === 'practice' && /不写正式积分/.test(action.detail)), 'session should retain no-score practice option');
assert.ok(longWait.waitingReport.safeguards.includes('no_ghost_fallback'), 'session should retain no ghost fallback safeguard');

const inviteSession = createPvpLiveSession({
  liveService: {
    createInvite: async (options) => ({
      success: true,
      status: 'waiting_invite',
      inviteCode: 'INVITE42',
      inviteReport: {
        reportVersion: 'pvp-live-invite-v1',
        inviteCode: 'INVITE42',
        status: 'waiting',
        rankedImpact: 'none',
        safeguards: ['invite_only_match', 'friendly_no_ranked_impact']
      },
      loadoutHash: 'invite-host-loadout'
    }),
    getCurrentMatch: async () => ({
      success: true,
      matchId: 'pvplm-invite-accepted',
      seatId: 'A',
      stateView: {
        matchId: 'pvplm-invite-accepted',
        mode: 'friendly',
        status: 'setup',
        stateVersion: 1,
        matchQuality: {
          reportVersion: 'pvp-live-match-quality-v1',
          expansionStage: 'friend_invite',
          safeguards: ['invite_only_match', 'friendly_no_ranked_impact']
        },
        self: { seatId: 'A', hand: [] },
        opponent: { seatId: 'B', handCount: 3 }
      }
    })
  }
});
const inviteWaiting = await inviteSession.createInvite({ displayName: '甲', loadout: { identitySlot: 'sword' } });
assert.equal(inviteWaiting.phase, 'waiting_invite', 'private invite creation should enter waiting invite phase');
assert.equal(inviteWaiting.inviteCode, 'INVITE42', 'private invite creation should retain invite code');
assert.equal(inviteWaiting.inviteReport?.rankedImpact, 'none', 'private invite creation should retain no-ranked-impact report');
assert.ok(inviteWaiting.inviteReport?.safeguards?.includes('invite_only_match'), 'private invite creation should retain invite-only safeguard');
const inviteRecovered = await inviteSession.pollInvite();
assert.equal(inviteRecovered.phase, 'setup', 'private invite polling should enter accepted invite setup');
assert.equal(inviteRecovered.matchId, 'pvplm-invite-accepted', 'private invite polling should switch to accepted match id');
assert.equal(inviteRecovered.stateView.mode, 'friendly', 'private invite polling should retain friendly no-score mode');
assert.equal(inviteRecovered.inviteCode, '', 'accepted private invite should clear waiting invite code');
assert.equal(inviteRecovered.inviteReport, null, 'accepted private invite should clear waiting invite report');

const inviteCurrentMatchSession = createPvpLiveSession({
  liveService: {
    createInvite: async () => ({
      success: true,
      status: 'waiting_invite',
      inviteCode: 'INVITE43',
      inviteReport: {
        reportVersion: 'pvp-live-invite-v1',
        inviteCode: 'INVITE43',
        status: 'waiting',
        rankedImpact: 'none',
        safeguards: ['invite_only_match', 'friendly_no_ranked_impact']
      }
    }),
    getCurrentMatch: async () => ({
      success: true,
      matchId: 'pvplm-ranked-current',
      seatId: 'A',
      stateView: {
        matchId: 'pvplm-ranked-current',
        mode: 'ranked',
        status: 'active',
        stateVersion: 7,
        currentSeat: 'A',
        self: { seatId: 'A', hand: [] },
        opponent: { seatId: 'B', handCount: 2 }
      }
    })
  }
});
await inviteCurrentMatchSession.createInvite({ displayName: '甲' });
const inviteCurrentRecovered = await inviteCurrentMatchSession.pollInvite();
assert.equal(inviteCurrentRecovered.phase, 'active', 'private invite polling should recover non-invite current match instead of staying stuck');
assert.equal(inviteCurrentRecovered.matchId, 'pvplm-ranked-current', 'private invite polling should keep recovered current match id');
assert.equal(inviteCurrentRecovered.inviteCode, '', 'recovering a non-invite current match should clear waiting invite code');
assert.equal(inviteCurrentRecovered.inviteReport, null, 'recovering a non-invite current match should clear invite waiting report');
assert.equal(inviteCurrentRecovered.lastError?.reason, 'invite_recovered_current_match', 'recovered current match should expose stable invite recovery reason');

const inviteExpiredSession = createPvpLiveSession({
  liveService: {
    createInvite: async () => ({
      success: true,
      status: 'waiting_invite',
      inviteCode: 'INVITE44',
      inviteReport: {
        reportVersion: 'pvp-live-invite-v1',
        inviteCode: 'INVITE44',
        status: 'waiting',
        rankedImpact: 'none'
      }
    }),
    getCurrentMatch: async () => ({ success: false, reason: 'no_current_match', message: '当前没有进行中的实时论道' }),
    getCurrentInvite: async () => ({ success: false, reason: 'invite_expired', message: '好友约战邀请码已过期' })
  }
});
await inviteExpiredSession.createInvite({ displayName: '甲' });
const inviteExpired = await inviteExpiredSession.pollInvite();
assert.equal(inviteExpired.phase, 'idle', 'expired host private invite polling should leave waiting invite phase');
assert.equal(inviteExpired.inviteCode, '', 'expired host private invite polling should clear invite code');
assert.equal(inviteExpired.inviteReport, null, 'expired host private invite polling should clear invite report');
assert.equal(inviteExpired.lastError?.reason, 'invite_expired', 'expired host private invite polling should expose stable expiry reason');

const inviteCancelSession = createPvpLiveSession({ liveService });
await inviteCancelSession.createInvite({ displayName: '甲', loadout: { identitySlot: 'sword' } });
const inviteCancelled = await inviteCancelSession.cancelInvite('LIVE1234');
assert.equal(inviteCancelled.phase, 'idle', 'private invite cancel should return session to idle');
assert.equal(inviteCancelled.inviteCode, '', 'private invite cancel should clear invite code');
assert.equal(inviteCancelled.inviteReport, null, 'private invite cancel should clear invite report');
assert.equal(inviteCancelled.lastError?.reason, 'invite_cancelled', 'private invite cancel should expose stable cancelled reason');
assert.equal(calls.at(-1).method, 'cancelInvite', 'cancelInvite should call live service cancelInvite');
assert.equal(calls.at(-1).inviteCode, 'LIVE1234', 'cancelInvite should forward invite code');

const inviteJoinSession = createPvpLiveSession({ liveService });
await inviteJoinSession.refreshInviteInbox();
const inviteJoined = await inviteJoinSession.joinInvite('LIVE1234', { displayName: '乙', loadout: { identitySlot: 'shield' } });
assert.equal(inviteJoined.phase, 'setup', 'joining a private invite should enter matched setup');
assert.equal(inviteJoined.matchId, 'pvplm-invite-session', 'joining a private invite should store match id');
assert.equal(inviteJoined.stateView.mode, 'friendly', 'joining a private invite should stay friendly');
assert.equal(inviteJoined.inviteInbox.length, 0, 'joining a private invite should clear invite inbox notifications');
assert.equal(calls.at(-1).method, 'joinInvite', 'joinInvite should call live service joinInvite');
assert.equal(calls.at(-1).inviteCode, 'LIVE1234', 'joinInvite should forward invite code');

const noCurrentSession = createPvpLiveSession({
  liveService: {
    getCurrentMatch: async () => ({ success: false, reason: 'no_current_match', message: '当前没有进行中的实时论道' })
  }
});
const noCurrent = await noCurrentSession.resumeCurrentMatch();
assert.equal(noCurrent.phase, 'idle', 'resumeCurrentMatch should stay idle when server has no current match');
assert.equal(noCurrent.lastError, null, 'no current match should not show as an error');

const waitingRematchCalls = [];
let waitingRematchAccepted = false;
const waitingRematchSession = createPvpLiveSession({
  liveService: {
    getCurrentMatch: async () => ({
      success: true,
      matchId: waitingRematchAccepted ? 'pvplm-rematch-friendly' : 'pvplm-rematch-source',
      seatId: waitingRematchAccepted ? 'B' : 'A',
      stateView: waitingRematchAccepted
        ? {
          matchId: 'pvplm-rematch-friendly',
          mode: 'friendly',
          status: 'setup',
          stateVersion: 1,
          friendlySeries: {
            reportVersion: 'pvp-live-friendly-series-v1',
            sourceMatchId: 'pvplm-rematch-source',
            seriesId: 'pvpls-session-wait',
            targetWins: 2,
            maxRounds: 3,
            roundIndex: 2,
            roundLabel: 'Bo3 第 2 局 · 换边再战',
            seriesStatus: 'ongoing',
            scoreBySourceSeat: { A: 1, B: 0 },
            canRequestNextRound: false,
            rankedImpact: 'none'
          },
          self: { seatId: 'B', hand: [] },
          opponent: { seatId: 'A', handCount: 3 }
        }
        : {
          matchId: 'pvplm-rematch-source',
          status: 'finished',
          postMatchReview: {
            reportVersion: 'pvp-live-post-match-review-v1',
            result: 'win',
            finishReason: 'surrender'
          },
          self: { seatId: 'A', hand: [] },
          opponent: { seatId: 'B', handCount: 0 }
        }
    }),
    requestRematch: async (matchId, options) => {
      waitingRematchCalls.push({ method: 'requestRematch', matchId, options });
      return {
        success: true,
        status: 'waiting_rematch',
        friendlySeries: {
          reportVersion: 'pvp-live-friendly-series-v1',
          sourceMatchId: matchId,
          seriesId: 'pvpls-session-wait',
          targetWins: 2,
          maxRounds: 3,
          roundIndex: 2,
          roundLabel: 'Bo3 第 2 局 · 换边再战',
          seriesStatus: 'ongoing',
          scoreBySourceSeat: { A: 1, B: 0 },
          canRequestNextRound: false,
          rankedImpact: 'none'
        }
      };
    }
  }
});
await waitingRematchSession.resumeCurrentMatch();
const waitingRematch = await waitingRematchSession.requestRematch({ displayName: '甲', loadout: { identitySlot: 'sword' } });
assert.equal(waitingRematch.phase, 'waiting_rematch', 'waiting friendly rematch should enter a polling phase instead of freezing as finished');
assert.equal(waitingRematch.matchId, 'pvplm-rematch-source', 'waiting friendly rematch should keep source match id');
assert.equal(waitingRematch.stateView.postMatchReview?.reportVersion, 'pvp-live-post-match-review-v1', 'waiting friendly rematch should keep finished review payload visible');
assert.equal(waitingRematch.rematchReport?.rankedImpact, 'none', 'waiting friendly rematch should retain no ranked impact report');
assert.deepEqual(waitingRematch.rematchReport?.scoreBySourceSeat, { A: 1, B: 0 }, 'waiting friendly rematch should retain Bo3 score report');
assert.equal(waitingRematch.lastError.reason, 'waiting_rematch', 'waiting friendly rematch should show opponent confirmation state');
assert.deepEqual(waitingRematchCalls.map(call => call.method), ['requestRematch'], 'waiting friendly rematch should call requestRematch once');
waitingRematchAccepted = true;
const recoveredRematch = await waitingRematchSession.pollRematch();
assert.equal(recoveredRematch.phase, 'setup', 'waiting friendly rematch should poll current match and enter accepted friendly setup');
assert.equal(recoveredRematch.matchId, 'pvplm-rematch-friendly', 'waiting friendly rematch should switch to the accepted friendly match id');
assert.equal(recoveredRematch.stateView.mode, 'friendly', 'waiting friendly rematch recovery should retain friendly mode');
assert.equal(recoveredRematch.rematchReport?.sourceMatchId, 'pvplm-rematch-source', 'waiting friendly rematch recovery should retain source match link');
assert.equal(recoveredRematch.rematchReport?.roundIndex, 2, 'waiting friendly rematch recovery should retain Bo3 round index');
assert.deepEqual(recoveredRematch.rematchReport?.scoreBySourceSeat, { A: 1, B: 0 }, 'waiting friendly rematch recovery should retain Bo3 score');
assert.equal(recoveredRematch.lastError, null, 'accepted friendly rematch recovery should clear waiting hint');

let unrelatedPollStarted = false;
const unrelatedFriendlySession = createPvpLiveSession({
  liveService: {
    getCurrentMatch: async () => ({
      success: true,
      matchId: unrelatedPollStarted ? 'pvplm-unrelated-friendly' : 'pvplm-rematch-source-guard',
      seatId: 'A',
      stateView: unrelatedPollStarted
        ? {
          matchId: 'pvplm-unrelated-friendly',
          mode: 'friendly',
          status: 'setup',
          friendlySeries: {
            reportVersion: 'pvp-live-friendly-series-v1',
            sourceMatchId: 'pvplm-other-source',
            seriesId: 'pvpls-other-series',
            rankedImpact: 'none'
          },
          self: { seatId: 'A', hand: [] },
          opponent: { seatId: 'B', handCount: 3 }
        }
        : {
          matchId: 'pvplm-rematch-source-guard',
          status: 'finished',
          postMatchReview: {
            reportVersion: 'pvp-live-post-match-review-v1',
            result: 'win',
            finishReason: 'surrender'
          },
          self: { seatId: 'A', hand: [] },
          opponent: { seatId: 'B', handCount: 0 }
        }
    }),
    requestRematch: async (matchId) => ({
      success: true,
      status: 'waiting_rematch',
      friendlySeries: {
        reportVersion: 'pvp-live-friendly-series-v1',
        sourceMatchId: matchId,
        seriesId: 'pvpls-session-expected',
        rankedImpact: 'none'
      }
    })
  }
});
await unrelatedFriendlySession.resumeCurrentMatch();
const unrelatedWait = await unrelatedFriendlySession.requestRematch({ displayName: '甲' });
unrelatedPollStarted = true;
const unrelatedPoll = await unrelatedFriendlySession.pollRematch();
assert.equal(unrelatedWait.phase, 'waiting_rematch', 'unrelated friendly setup guard should start from waiting rematch');
assert.equal(unrelatedPoll.phase, 'waiting_rematch', 'waiting friendly rematch should ignore unrelated friendly current matches');
assert.equal(unrelatedPoll.matchId, 'pvplm-rematch-source-guard', 'unrelated friendly rematch guard should keep the original source match anchor');
assert.equal(unrelatedPoll.rematchReport?.seriesId, 'pvpls-session-expected', 'unrelated friendly rematch guard should keep expected series id');

const cancelledRematchCalls = [];
const cancelledRematchSession = createPvpLiveSession({
  liveService: {
    getCurrentMatch: async () => ({
      success: true,
      matchId: 'pvplm-rematch-cancel-source',
      seatId: 'A',
      stateView: {
        matchId: 'pvplm-rematch-cancel-source',
        status: 'finished',
        postMatchReview: {
          reportVersion: 'pvp-live-post-match-review-v1',
          result: 'win',
          finishReason: 'surrender'
        },
        self: { seatId: 'A', hand: [] },
        opponent: { seatId: 'B', handCount: 0 }
      }
    }),
    requestRematch: async (matchId) => {
      cancelledRematchCalls.push({ method: 'requestRematch', matchId });
      return {
        success: true,
        status: 'waiting_rematch',
        friendlySeries: {
          reportVersion: 'pvp-live-friendly-series-v1',
          sourceMatchId: matchId,
          seriesId: 'pvpls-session-cancel',
          status: 'waiting_rematch',
          rankedImpact: 'none'
        }
      };
    },
    cancelRematch: async (matchId) => {
      cancelledRematchCalls.push({ method: 'cancelRematch', matchId });
      return {
        success: true,
        status: 'cancelled',
        reason: 'rematch_cancelled',
        message: '已取消低压力再战等待；本局复盘保留，不写正式积分。',
        friendlySeries: {
          reportVersion: 'pvp-live-friendly-series-v1',
          sourceMatchId: matchId,
          seriesId: 'pvpls-session-cancel',
          status: 'cancelled',
          rankedImpact: 'none'
        }
      };
    }
  }
});
await cancelledRematchSession.resumeCurrentMatch();
await cancelledRematchSession.requestRematch({ displayName: '甲' });
const cancelledRematch = await cancelledRematchSession.cancelRematch();
assert.equal(cancelledRematch.phase, 'finished', 'cancelled friendly rematch should return to the finished review phase');
assert.equal(cancelledRematch.matchId, 'pvplm-rematch-cancel-source', 'cancelled friendly rematch should keep source match id');
assert.equal(cancelledRematch.rematchReport?.status, 'cancelled', 'cancelled friendly rematch should keep cancelled series report');
assert.equal(cancelledRematch.lastError.reason, 'rematch_cancelled', 'cancelled friendly rematch should expose stable cancellation reason');
assert.deepEqual(cancelledRematchCalls.map(call => call.method), ['requestRematch', 'cancelRematch'], 'cancelled friendly rematch should call request then cancel only');

const expiredRematchSession = createPvpLiveSession({
  liveService: {
    getCurrentMatch: async () => expiredRematchSession.getState().phase === 'waiting_rematch'
      ? ({
        success: false,
        code: '404',
        reason: 'no_current_match',
        message: '当前没有进行中的实时论道'
      })
      : ({
        success: true,
        matchId: 'pvplm-rematch-expired-source',
        seatId: 'A',
        stateView: {
          matchId: 'pvplm-rematch-expired-source',
          status: 'finished',
          postMatchReview: {
            reportVersion: 'pvp-live-post-match-review-v1',
            result: 'win',
            finishReason: 'surrender'
          }
        }
      }),
    requestRematch: async (matchId) => ({
      success: true,
      status: 'waiting_rematch',
      friendlySeries: {
        reportVersion: 'pvp-live-friendly-series-v1',
        sourceMatchId: matchId,
        seriesId: 'pvpls-session-expired',
        status: 'waiting_rematch',
        rankedImpact: 'none'
      }
    }),
    getRematchStatus: async (matchId) => ({
      success: false,
      code: '404',
      reason: 'rematch_expired',
      message: '低压力再战等待已过期，可回到复盘后重新发起。',
      friendlySeries: {
        reportVersion: 'pvp-live-friendly-series-v1',
        sourceMatchId: matchId,
        seriesId: 'pvpls-session-expired',
        status: 'expired',
        rankedImpact: 'none'
      }
    })
  }
});
await expiredRematchSession.resumeCurrentMatch();
await expiredRematchSession.requestRematch({ displayName: '甲' });
const expiredRematch = await expiredRematchSession.pollRematch();
assert.equal(expiredRematch.phase, 'finished', 'expired friendly rematch should return to finished review instead of waiting forever');
assert.equal(expiredRematch.rematchReport?.status, 'expired', 'expired friendly rematch should keep expired series report');
assert.equal(expiredRematch.lastError.reason, 'rematch_expired', 'expired friendly rematch should expose stable expiry reason');

const matchedRematchSession = createPvpLiveSession({
  liveService: {
    getCurrentMatch: async () => ({
      success: true,
      matchId: 'pvplm-rematch-source-2',
      seatId: 'B',
      stateView: {
        matchId: 'pvplm-rematch-source-2',
        status: 'finished',
        postMatchReview: {
          reportVersion: 'pvp-live-post-match-review-v1',
          result: 'loss',
          finishReason: 'surrender'
        },
        self: { seatId: 'B', hand: [] },
        opponent: { seatId: 'A', handCount: 0 }
      }
    }),
    requestRematch: async () => ({
      success: true,
      status: 'matched',
      matchId: 'pvplm-friendly-session',
      seatId: 'A',
      stateView: {
        matchId: 'pvplm-friendly-session',
        mode: 'friendly',
        status: 'setup',
        stateVersion: 1,
        friendlySeries: {
          reportVersion: 'pvp-live-friendly-series-v1',
          sourceMatchId: 'pvplm-rematch-source-2',
          seriesId: 'pvpls-session-match',
          targetWins: 2,
          maxRounds: 3,
          roundIndex: 3,
          roundLabel: 'Bo3 决胜局 · 换边再战',
          seriesStatus: 'ongoing',
          scoreBySourceSeat: { A: 1, B: 1 },
          canRequestNextRound: false,
          rankedImpact: 'none'
        },
        self: { seatId: 'A', hand: [] },
        opponent: { seatId: 'B', handCount: 3 }
      }
    })
  }
});
await matchedRematchSession.resumeCurrentMatch();
const matchedRematch = await matchedRematchSession.requestRematch({ displayName: '乙' });
assert.equal(matchedRematch.phase, 'setup', 'matched friendly rematch should enter setup phase');
assert.equal(matchedRematch.matchId, 'pvplm-friendly-session', 'matched friendly rematch should switch to new match id');
assert.equal(matchedRematch.stateView.mode, 'friendly', 'matched friendly rematch should retain friendly mode view');
assert.equal(matchedRematch.rematchReport?.rankedImpact, 'none', 'matched friendly rematch should retain no ranked impact report');
assert.equal(matchedRematch.rematchReport?.roundIndex, 3, 'matched friendly rematch should retain Bo3 decider round index');
assert.deepEqual(matchedRematch.rematchReport?.scoreBySourceSeat, { A: 1, B: 1 }, 'matched friendly rematch should retain Bo3 tied score');

const failedRequeueStorage = createMemoryStorage();
const failedRequeueSession = createPvpLiveSession({
  storage: failedRequeueStorage,
  liveService: {
    getCurrentMatch: async () => ({
      success: true,
      matchId: 'pvplm-finished-stale',
      seatId: 'A',
      stateView: {
        matchId: 'pvplm-finished-stale',
        status: 'finished',
        stateVersion: 9,
        currentSeat: 'A',
        postMatchReview: {
          reportVersion: 'pvp-live-post-match-review-v1',
          result: 'loss',
          finishReason: 'surrender'
        },
        self: { seatId: 'A', hand: [] },
        opponent: { seatId: 'B', handCount: 0 }
      }
    }),
    joinQueue: async () => ({
      success: false,
      reason: 'queue_join_failed',
      message: '实时论道入队失败'
    })
  }
});
const finishedBeforeFailedRequeue = await failedRequeueSession.resumeCurrentMatch();
assert.equal(finishedBeforeFailedRequeue.phase, 'finished', 'finished current match should enter finished phase before requeue');
assert.ok(finishedBeforeFailedRequeue.stateView.postMatchReview, 'finished current match should retain post-match review before requeue');
assert.ok(failedRequeueStorage.values().includes('pvplm-finished-stale'), 'finished current match should persist terminal review anchor before queue again');
const failedRequeue = await failedRequeueSession.joinQueue({ displayName: '甲' });
assert.equal(failedRequeue.phase, 'idle', 'failed queue again after finished should return to clean idle phase');
assert.equal(failedRequeue.matchId, '', 'failed queue again after finished should clear stale match id');
assert.equal(failedRequeue.stateView, null, 'failed queue again after finished should clear stale post-match state view');
assert.equal(failedRequeue.lastError.reason, 'queue_join_failed', 'failed queue again should preserve join failure reason');
assert.ok(failedRequeueStorage.values().includes('pvplm-finished-stale'), 'failed queue again should preserve terminal recovery anchor for refresh retry');

const blockedConnectionSession = createPvpLiveSession({
  liveService: {
    joinQueue: async () => ({
      success: false,
      reason: 'connection_health_failed',
      message: '当前连接不适合进入正式真人排位，请重试检测或先进入问道练习。',
      connectionHealth: {
        reportVersion: 'pvp-live-queue-connection-health-v1',
        status: 'blocked',
        sampleTag: 'client_preflight',
        reasons: ['missed_heartbeat', 'high_rtt'],
        actions: [
          { id: 'retry_connection_check', label: '重试检测' },
          { id: 'practice', label: '问道练习', detail: '练习不写正式积分。' },
        ],
      },
    })
  }
});
const blockedConnection = await blockedConnectionSession.joinQueue({ displayName: '甲' });
assert.equal(blockedConnection.phase, 'idle', 'connection health block should leave session in idle phase');
assert.equal(blockedConnection.lastError.reason, 'connection_health_failed', 'connection health block should preserve stable reason');
assert.equal(blockedConnection.lastError.connectionHealth?.status, 'blocked', 'connection health block should retain structured health report');
assert.ok(blockedConnection.lastError.connectionHealth?.actions?.some(action => action.id === 'practice' && /不写正式积分/.test(action.detail)), 'connection health block should retain no-score practice action');

const successfulRequeueStorage = createMemoryStorage([
  ['theDefierPvpLiveLastTerminalMatchV1', 'pvplm-finished-stale']
]);
const successfulRequeueSession = createPvpLiveSession({
  storage: successfulRequeueStorage,
  liveService: {
    joinQueue: async () => ({
      success: true,
      status: 'waiting',
      queueTicket: 'pvplq-after-review'
    })
  }
});
const successfulRequeue = await successfulRequeueSession.joinQueue({ displayName: '甲' });
assert.equal(successfulRequeue.phase, 'waiting', 'successful queue again should enter waiting phase');
assert.ok(!successfulRequeueStorage.values().includes('pvplm-finished-stale'), 'successful queue again should clear old terminal recovery anchor');

let resolveLateReplay;
const lateReplaySession = createPvpLiveSession({
  liveService: {
    getCurrentMatch: async () => ({
      success: true,
      matchId: 'pvplm-late-replay-a',
      seatId: 'A',
      stateView: {
        matchId: 'pvplm-late-replay-a',
        status: 'finished',
        stateVersion: 9,
        self: { seatId: 'A', hand: [] },
        opponent: { seatId: 'B', handCount: 3 }
      }
    }),
    getReplay: async () => new Promise(resolve => {
      resolveLateReplay = resolve;
    }),
    joinQueue: async () => ({
      success: true,
      status: 'waiting',
      queueTicket: 'pvplq-late-replay-b'
    })
  }
});
await lateReplaySession.resumeCurrentMatch();
const lateReplayPromise = lateReplaySession.getReplay({ visibility: 'replay_self' });
const waitingAfterLateReplayRequest = await lateReplaySession.joinQueue({ displayName: '甲' });
assert.equal(waitingAfterLateReplayRequest.phase, 'waiting', 'late replay race setup should move the session to a new queue');
resolveLateReplay({
  success: true,
  replay: {
    reportVersion: 'pvp-live-replay-v1',
    visibilityLayer: 'replay_self',
    publicSummary: { status: 'finished', finishReason: 'lethal' },
    hiddenScan: { forbiddenTokenCount: 0 }
  }
});
const afterLateReplay = await lateReplayPromise;
assert.equal(afterLateReplay.phase, 'waiting', 'late replay response should not roll the session back from the new queue');
assert.equal(afterLateReplay.lastReplay, null, 'late replay response from an old match should not publish stale replay data');
assert.equal(afterLateReplay.lastReplayMatchId, '', 'late replay response from an old match should keep replay match binding clear');

const invalidatedSession = createPvpLiveSession({
  liveService: {
    getCurrentMatch: async () => ({
      success: true,
      matchId: 'pvplm-invalidated',
      seatId: 'A',
      stateView: {
        matchId: 'pvplm-invalidated',
        status: 'invalidated',
        phase: 'invalidated',
        stateVersion: 7,
        currentSeat: 'A',
        self: { seatId: 'A', hand: [] },
        opponent: { seatId: 'B', handCount: 3 },
        recentEvents: [{ eventType: 'match_invalidated', payload: { reason: 'ready_timeout' } }]
      }
    })
  }
});
const invalidated = await invalidatedSession.resumeCurrentMatch();
assert.equal(invalidated.phase, 'invalidated', 'invalidated current match should enter invalidated phase instead of active');
assert.equal(invalidated.lastEvents[0].eventType, 'match_invalidated', 'invalidated session should retain invalidation event');

const terminalCalls = [];
let terminalCurrentAvailable = true;
const terminalStorage = createMemoryStorage();
const terminalResumeService = {
  getCurrentMatch: async () => {
    terminalCalls.push({ method: 'getCurrentMatch' });
    if (!terminalCurrentAvailable) {
      return { success: false, reason: 'no_current_match', message: '当前没有进行中的实时论道' };
    }
    return {
      success: true,
      matchId: 'pvplm-terminal-review',
      seatId: 'A',
      stateView: {
        matchId: 'pvplm-terminal-review',
        status: 'active',
        stateVersion: 10,
        currentSeat: 'A',
        self: { seatId: 'A', hand: [] },
        opponent: { seatId: 'B', handCount: 1 }
      }
    };
  },
  getMatch: async (matchId) => {
    terminalCalls.push({ method: 'getMatch', matchId });
    return {
      success: true,
      matchId,
      seatId: 'A',
      stateView: {
        matchId,
        status: 'finished',
        stateVersion: 11,
        currentSeat: 'A',
        postMatchReview: {
          reportVersion: 'pvp-live-post-match-review-v1',
          result: 'loss',
          finishReason: 'surrender',
          evidence: [{ eventType: 'battle_started', sequence: 3, actingSeat: 'A' }],
          nextActions: [{ id: 'review_events', label: '查看权威事件' }]
        },
        recentEvents: [{ eventType: 'match_finished', sequence: 6, actingSeat: 'A' }],
        self: { seatId: 'A', hand: [] },
        opponent: { seatId: 'B', handCount: 0 }
      }
    };
  },
  submitIntent: async (matchId, intent) => {
    terminalCalls.push({ method: 'submitIntent', matchId, intent });
    terminalCurrentAvailable = false;
    return {
      success: true,
      result: 'accepted',
      events: [{ eventType: 'player_surrendered' }, { eventType: 'match_finished' }],
      stateView: {
        matchId,
        status: 'finished',
        stateVersion: 11,
        currentSeat: 'A',
        postMatchReview: {
          reportVersion: 'pvp-live-post-match-review-v1',
          result: 'loss',
          finishReason: 'surrender',
          evidence: [{ eventType: 'battle_started', sequence: 3, actingSeat: 'A' }],
          nextActions: [{ id: 'review_events', label: '查看权威事件' }]
        },
        self: { seatId: 'A', hand: [] },
        opponent: { seatId: 'B', handCount: 0 }
      }
    };
  }
};
const terminalWriter = createPvpLiveSession({ liveService: terminalResumeService, storage: terminalStorage });
await terminalWriter.resumeCurrentMatch();
const terminalFinished = await terminalWriter.surrender({ intentId: 'session-terminal-review-1' });
assert.equal(terminalFinished.phase, 'finished', 'finished terminal match should enter finished before page refresh');
assert.ok(terminalStorage.values().includes('pvplm-terminal-review'), 'finished terminal match should persist last reviewable match id for refresh recovery');
const terminalReader = createPvpLiveSession({ liveService: terminalResumeService, storage: terminalStorage });
const restoredTerminal = await terminalReader.resumeCurrentMatch();
assert.equal(restoredTerminal.phase, 'finished', 'resumeCurrentMatch should restore finished terminal review from stored match id when current match is gone');
assert.equal(restoredTerminal.matchId, 'pvplm-terminal-review', 'restored terminal review should retain stored match id');
assert.equal(restoredTerminal.stateView.postMatchReview.reportVersion, 'pvp-live-post-match-review-v1', 'restored terminal review should retain post-match review payload');
assert.deepEqual(terminalCalls.map(call => call.method), ['getCurrentMatch', 'submitIntent', 'getCurrentMatch', 'getMatch'], 'terminal review refresh should try current match before stored terminal match');

const waitingRematchResumeCalls = [];
const waitingRematchResumeStorage = createMemoryStorage([
  ['theDefierPvpLiveLastTerminalMatchV1', 'pvplm-terminal-rematch-source']
]);
const waitingRematchResumeSession = createPvpLiveSession({
  storage: waitingRematchResumeStorage,
  liveService: {
    getCurrentMatch: async () => {
      waitingRematchResumeCalls.push({ method: 'getCurrentMatch' });
      return { success: false, reason: 'no_current_match', message: '当前没有进行中的实时论道' };
    },
    getMatch: async (matchId) => {
      waitingRematchResumeCalls.push({ method: 'getMatch', matchId });
      return {
        success: true,
        matchId,
        seatId: 'A',
        stateView: {
          matchId,
          status: 'finished',
          stateVersion: 21,
          currentSeat: 'A',
          postMatchReview: {
            reportVersion: 'pvp-live-post-match-review-v1',
            result: 'win',
            finishReason: 'surrender',
            evidence: [{ eventType: 'match_finished', sequence: 8, actingSeat: 'B' }],
            nextActions: [
              { id: 'review_events', label: '查看权威事件' },
              { id: 'friendly_rematch', label: '低压力再战' }
            ]
          },
          recentEvents: [{ eventType: 'match_finished', sequence: 8, actingSeat: 'B' }],
          self: { seatId: 'A', hand: [] },
          opponent: { seatId: 'B', handCount: 0 }
        }
      };
    },
    getRematchStatus: async (matchId) => {
      waitingRematchResumeCalls.push({ method: 'getRematchStatus', matchId });
      return {
        success: true,
        status: 'waiting_rematch',
        friendlySeries: {
          reportVersion: 'pvp-live-friendly-series-v1',
          sourceMatchId: matchId,
          seriesId: 'pvpls-session-refresh-wait',
          status: 'waiting_rematch',
          targetWins: 2,
          maxRounds: 3,
          roundIndex: 2,
          roundLabel: 'Bo3 第 2 局 · 换边再战',
          seriesStatus: 'ongoing',
          scoreBySourceSeat: { A: 1, B: 0 },
          rankedImpact: 'none'
        }
      };
    }
  }
});
const restoredWaitingRematch = await waitingRematchResumeSession.resumeCurrentMatch();
assert.equal(restoredWaitingRematch.phase, 'waiting_rematch', 'resumeCurrentMatch should restore pending friendly rematch after refreshing from terminal review');
assert.equal(restoredWaitingRematch.matchId, 'pvplm-terminal-rematch-source', 'restored waiting rematch should retain source match id');
assert.equal(restoredWaitingRematch.stateView.postMatchReview.reportVersion, 'pvp-live-post-match-review-v1', 'restored waiting rematch should keep terminal review visible');
assert.equal(restoredWaitingRematch.rematchReport?.status, 'waiting_rematch', 'restored waiting rematch should retain pending series status');
assert.equal(restoredWaitingRematch.lastError.reason, 'waiting_rematch', 'restored waiting rematch should show opponent confirmation hint');
assert.deepEqual(waitingRematchResumeCalls.map(call => call.method), ['getCurrentMatch', 'getMatch', 'getRematchStatus'], 'terminal recovery with rematch action should ask pending rematch status before rendering finished');

const transientCurrentCalls = [];
const transientCurrentStorage = createMemoryStorage([
  ['theDefierPvpLiveLastTerminalMatchV1', 'pvplm-terminal-review']
]);
const transientCurrentSession = createPvpLiveSession({
  storage: transientCurrentStorage,
  liveService: {
    getCurrentMatch: async () => {
      transientCurrentCalls.push('getCurrentMatch');
      return { success: false, reason: 'live_service_unavailable', message: '实时论道服务未就绪' };
    },
    getMatch: async () => {
      transientCurrentCalls.push('getMatch');
      return { success: true };
    }
  }
});
const transientCurrentState = await transientCurrentSession.resumeCurrentMatch();
assert.equal(transientCurrentState.phase, 'idle', 'transient current-match failure should not restore stale terminal review');
assert.deepEqual(transientCurrentCalls, ['getCurrentMatch'], 'terminal fallback should only run after explicit no-current response');
assert.ok(transientCurrentStorage.values().includes('pvplm-terminal-review'), 'transient current-match failure should keep terminal recovery anchor');

const transientTerminalCalls = [];
const transientTerminalStorage = createMemoryStorage([
  ['theDefierPvpLiveLastTerminalMatchV1', 'pvplm-terminal-review']
]);
const transientTerminalSession = createPvpLiveSession({
  storage: transientTerminalStorage,
  liveService: {
    getCurrentMatch: async () => {
      transientTerminalCalls.push('getCurrentMatch');
      return { success: false, reason: 'no_current_match', message: '当前没有进行中的实时论道' };
    },
    getMatch: async (matchId) => {
      transientTerminalCalls.push(`getMatch:${matchId}`);
      return { success: false, error: { code: 503 }, message: 'network-timeout' };
    }
  }
});
const transientTerminalState = await transientTerminalSession.resumeCurrentMatch();
assert.equal(transientTerminalState.phase, 'idle', 'transient terminal-match failure should not enter fake finished phase');
assert.deepEqual(transientTerminalCalls, ['getCurrentMatch', 'getMatch:pvplm-terminal-review'], 'explicit no-current should still attempt terminal recovery');
assert.ok(transientTerminalStorage.values().includes('pvplm-terminal-review'), 'transient terminal-match failure should preserve recovery anchor for retry');

const missingTerminalStorage = createMemoryStorage([
  ['theDefierPvpLiveLastTerminalMatchV1', 'pvplm-terminal-review']
]);
const missingTerminalSession = createPvpLiveSession({
  storage: missingTerminalStorage,
  liveService: {
    getCurrentMatch: async () => ({ success: false, reason: 'no_current_match', message: '当前没有进行中的实时论道' }),
    getMatch: async () => ({ success: false, error: { code: 404 }, message: '实时论道战局不存在' })
  }
});
await missingTerminalSession.resumeCurrentMatch();
assert.ok(!missingTerminalStorage.values().includes('pvplm-terminal-review'), 'missing terminal match should clear stale recovery anchor');

const scopedTerminalStorage = createMemoryStorage();
const scopedWriter = createPvpLiveSession({
  storage: scopedTerminalStorage,
  userScope: () => 'user-A',
  liveService: {
    getCurrentMatch: async () => ({
      success: true,
      matchId: 'pvplm-user-a-review',
      seatId: 'A',
      stateView: {
        matchId: 'pvplm-user-a-review',
        status: 'finished',
        postMatchReview: {
          reportVersion: 'pvp-live-post-match-review-v1',
          result: 'win',
          finishReason: 'surrender'
        },
        self: { seatId: 'A', hand: [] },
        opponent: { seatId: 'B', handCount: 0 }
      }
    })
  }
});
await scopedWriter.resumeCurrentMatch();
assert.equal(scopedTerminalStorage.getItem('theDefierPvpLiveLastTerminalMatchV1:user-A'), 'pvplm-user-a-review', 'terminal recovery anchor should be scoped to current user');
assert.equal(scopedTerminalStorage.getItem('theDefierPvpLiveLastTerminalMatchV1'), '', 'scoped terminal recovery should not leave an unscoped legacy anchor');

const scopedUserBCalls = [];
const scopedUserBReader = createPvpLiveSession({
  storage: scopedTerminalStorage,
  userScope: () => 'user-B',
  liveService: {
    getCurrentMatch: async () => {
      scopedUserBCalls.push('getCurrentMatch');
      return { success: false, reason: 'no_current_match', message: '当前没有进行中的实时论道' };
    },
    getMatch: async () => {
      scopedUserBCalls.push('getMatch');
      return { success: true };
    }
  }
});
const scopedUserBState = await scopedUserBReader.resumeCurrentMatch();
assert.equal(scopedUserBState.phase, 'idle', 'different logged-in user should not restore another user terminal review');
assert.deepEqual(scopedUserBCalls, ['getCurrentMatch'], 'different logged-in user should not request stored match from another user scope');

const scopedUserACalls = [];
const scopedUserAReader = createPvpLiveSession({
  storage: scopedTerminalStorage,
  userScope: () => 'user-A',
  liveService: {
    getCurrentMatch: async () => {
      scopedUserACalls.push('getCurrentMatch');
      return { success: false, reason: 'no_current_match', message: '当前没有进行中的实时论道' };
    },
    getMatch: async (matchId) => {
      scopedUserACalls.push(`getMatch:${matchId}`);
      return {
        success: true,
        matchId,
        seatId: 'A',
        stateView: {
          matchId,
          status: 'finished',
          postMatchReview: {
            reportVersion: 'pvp-live-post-match-review-v1',
            result: 'win',
            finishReason: 'surrender'
          },
          self: { seatId: 'A', hand: [] },
          opponent: { seatId: 'B', handCount: 0 }
        }
      };
    }
  }
});
const scopedUserAState = await scopedUserAReader.resumeCurrentMatch();
assert.equal(scopedUserAState.phase, 'finished', 'same logged-in user should restore scoped terminal review');
assert.deepEqual(scopedUserACalls, ['getCurrentMatch', 'getMatch:pvplm-user-a-review'], 'same logged-in user should use scoped stored terminal match');

const realtimeSentMessages = [];
let realtimeHandlers = null;
const realtimeSession = createPvpLiveSession({
  liveService: {
    connectRealtime: (handlers) => {
      realtimeHandlers = handlers;
      return {
        send: (payload) => {
          realtimeSentMessages.push(payload);
          return true;
        },
        close: () => {
          realtimeSentMessages.push({ type: 'closed' });
          return true;
        }
      };
    }
  },
  now: () => 1781870000000
});
assert.equal(typeof realtimeSession.connectRealtime, 'function', 'live session should expose connectRealtime');
assert.equal(typeof realtimeSession.joinRealtimeMatch, 'function', 'live session should expose joinRealtimeMatch');
assert.equal(typeof realtimeSession.submitRealtimeIntent, 'function', 'live session should expose submitRealtimeIntent');
assert.equal(typeof realtimeSession.heartbeatRealtime, 'function', 'live session should expose heartbeatRealtime');
assert.equal(typeof realtimeSession.resumeRealtime, 'function', 'live session should expose resumeRealtime for hidden-tab recovery');
assert.equal(typeof realtimeSession.disconnectRealtime, 'function', 'live session should expose disconnectRealtime');
const realtimeInitial = realtimeSession.connectRealtime();
assert.equal(realtimeInitial.realtimeStatus, 'connecting', 'connectRealtime should mark realtime connecting');
assert.ok(realtimeHandlers && typeof realtimeHandlers.onMessage === 'function', 'connectRealtime should register message handler');
realtimeHandlers.onMessage({
  type: 'connected',
  connectionId: 'ws-session-1',
  connectionReport: { heartbeatIntervalMs: 1200 }
});
assert.equal(realtimeSession.getState().realtimeStatus, 'connected', 'connected WS message should mark realtime connected');
assert.equal(realtimeSession.getState().lastRealtimeConnectionId, 'ws-session-1', 'connected WS message should retain connection id');

realtimeHandlers.onMessage({
  type: 'state_sync',
  matchId: 'pvplm-ws-session',
  seatId: 'A',
  stateView: {
    matchId: 'pvplm-ws-session',
    status: 'active',
    stateVersion: 8,
    currentSeat: 'A',
    recentEvents: [{ eventType: 'battle_started', sequence: 3 }],
    self: { seatId: 'A', hand: [] },
    opponent: { seatId: 'B', handCount: 3 }
  }
});
assert.equal(realtimeSession.getState().phase, 'active', 'state_sync WS message should update live phase');
assert.equal(realtimeSession.getState().matchId, 'pvplm-ws-session', 'state_sync WS message should retain match id');
assert.equal(realtimeSession.getState().seatId, 'A', 'state_sync WS message should retain seat id');
assert.equal(realtimeSession.getState().lastRealtimeSyncMatchId, 'pvplm-ws-session', 'state_sync WS message should record synchronized match id');
assert.equal(realtimeSession.getState().lastRealtimeSyncAt, 1781870000000, 'state_sync WS message should record synchronization time');
assert.equal(realtimeSession.getState().lastEvents[0].eventType, 'battle_started', 'state_sync WS message should refresh recent public events');

realtimeHandlers.onMessage({
  type: 'events_replay',
  matchId: 'pvplm-ws-session',
  fromRevision: 0,
  events: [{ eventType: 'player_ready', sequence: 4 }]
});
assert.equal(realtimeSession.getState().lastEvents[0].eventType, 'player_ready', 'events_replay WS message should replace last events with missed public events');

realtimeHandlers.onMessage({
  type: 'presence',
  matchId: 'pvplm-ws-session',
  connectionReport: {
    reportVersion: 'pvp-live-connection-v1',
    viewer: { seatId: 'A', status: 'online' },
    opponent: { seatId: 'B', status: 'grace' },
    heartbeatIntervalMs: 1200
  }
});
assert.equal(realtimeSession.getState().stateView.connectionReport.opponent.status, 'grace', 'presence WS message should update connection report');

realtimeHandlers.onMessage({
  type: 'intent_result',
  matchId: 'pvplm-ws-session',
  intentId: 'ws-intent-session',
  result: 'accepted',
  events: [{ eventType: 'card_played', sequence: 5 }],
  stateView: {
    matchId: 'pvplm-ws-session',
    status: 'active',
    stateVersion: 9,
    currentSeat: 'B',
    self: { seatId: 'A', hand: [] },
    opponent: { seatId: 'B', handCount: 3 }
  }
});
assert.equal(realtimeSession.getState().stateView.stateVersion, 9, 'intent_result WS message should update state view');
assert.equal(realtimeSession.getState().lastEvents[0].eventType, 'card_played', 'intent_result WS message should retain public intent events');
assert.equal(realtimeSession.getState().lastRealtimeIntentResult.intentId, 'ws-intent-session', 'intent_result WS message should expose the acknowledged intent id');
assert.equal(realtimeSession.getState().lastRealtimeIntentResult.result, 'accepted', 'intent_result WS message should expose the authoritative result');
assert.equal(realtimeSession.getState().lastRealtimeIntentResult.matchId, 'pvplm-ws-session', 'intent_result WS message should expose the acknowledged match id');

realtimeHandlers.onMessage({
  type: 'intent_result',
  matchId: 'pvplm-ws-session',
  intentId: 'ws-intent-session-duplicate',
  result: 'duplicate',
  reason: 'duplicate_action',
  events: [],
  stateView: {
    matchId: 'pvplm-ws-session',
    status: 'active',
    stateVersion: 9,
    currentSeat: 'B',
    self: { seatId: 'A', hand: [] },
    opponent: { seatId: 'B', handCount: 3 }
  }
});
assert.equal(realtimeSession.getState().lastRealtimeIntentResult.result, 'duplicate', 'duplicate intent_result WS message should expose the authoritative duplicate result');
assert.equal(realtimeSession.getState().lastRealtimeIntentResult.reason, 'duplicate_action', 'duplicate intent_result WS message should expose the reducer duplicate reason');
assert.equal(realtimeSession.getState().lastError, null, 'duplicate intent_result WS message should not surface an idempotent replay as a realtime error');

realtimeHandlers.onMessage({
  type: 'state_sync',
  matchId: 'pvplm-ws-session',
  seatId: 'A',
  stateView: {
    matchId: 'pvplm-ws-session',
    status: 'active',
    stateVersion: 8,
    currentSeat: 'A',
    recentEvents: [{ eventType: 'stale_state_sync', sequence: 4 }],
    self: { seatId: 'A', hand: [{ instanceId: 'stale-card' }] },
    opponent: { seatId: 'B', handCount: 3 }
  }
});
assert.equal(realtimeSession.getState().stateView.stateVersion, 9, 'stale state_sync WS message should not downgrade authoritative stateVersion');
assert.equal(realtimeSession.getState().lastEvents[0].eventType, 'card_played', 'stale state_sync WS message should not downgrade public events');

realtimeHandlers.onMessage({
  type: 'intent_result',
  matchId: 'pvplm-ws-session',
  intentId: 'ws-intent-stale',
  result: 'accepted',
  events: [{ eventType: 'stale_intent_result', sequence: 4 }],
  stateView: {
    matchId: 'pvplm-ws-session',
    status: 'active',
    stateVersion: 7,
    currentSeat: 'A',
    self: { seatId: 'A', hand: [{ instanceId: 'stale-card-2' }] },
    opponent: { seatId: 'B', handCount: 3 }
  }
});
assert.equal(realtimeSession.getState().stateView.stateVersion, 9, 'stale intent_result WS message should not downgrade authoritative stateVersion');
assert.equal(realtimeSession.getState().lastEvents[0].eventType, 'card_played', 'stale intent_result WS message should not downgrade public events');
assert.equal(realtimeSession.getState().lastRealtimeIntentResult.intentId, 'ws-intent-stale', 'stale intent_result WS message should still expose the acknowledged intent id for UI locks');

realtimeHandlers.onMessage({
  type: 'events_replay',
  matchId: 'pvplm-ws-session',
  fromRevision: 5,
  events: []
});
assert.equal(realtimeSession.getState().lastEvents[0].eventType, 'card_played', 'empty events_replay should not downgrade the last seen public event revision');

realtimeSession.joinRealtimeMatch('pvplm-ws-session', { lastSeenRevision: 4 });
realtimeSession.heartbeatRealtime();
realtimeSession.submitRealtimeIntent({
  intentId: 'ws-intent-session-2',
  intentType: 'end_turn',
  stateVersion: 9,
  payload: {}
});
assert.deepEqual(realtimeSentMessages.slice(0, 3), [
  { type: 'join_match', matchId: 'pvplm-ws-session', lastSeenRevision: 4 },
  { type: 'heartbeat', matchId: 'pvplm-ws-session', lastSeenRevision: 5 },
  {
    type: 'intent',
    matchId: 'pvplm-ws-session',
    intent: {
      intentId: 'ws-intent-session-2',
      intentType: 'end_turn',
      stateVersion: 9,
      payload: {}
    }
  }
], 'live session realtime helpers should send stable WS message envelopes with last seen event revision');
realtimeSession.resumeRealtime();
assert.deepEqual(realtimeSentMessages.slice(3, 5), [
  { type: 'join_match', matchId: 'pvplm-ws-session', lastSeenRevision: 5 },
  { type: 'heartbeat', matchId: 'pvplm-ws-session', lastSeenRevision: 5 }
], 'visibility resume should replay pending join_match and heartbeat immediately with the latest public event revision');
realtimeSession.disconnectRealtime();
assert.equal(realtimeSession.getState().realtimeStatus, 'closed', 'disconnectRealtime should mark realtime closed');

const delayedRealtimeSent = [];
let delayedRealtimeHandlers = null;
let delayedRealtimeOpen = false;
const delayedRealtimeSession = createPvpLiveSession({
  liveService: {
    connectRealtime: (handlers) => {
      delayedRealtimeHandlers = handlers;
      return {
        send: (payload) => {
          if (!delayedRealtimeOpen) return false;
          delayedRealtimeSent.push(payload);
          return true;
        },
        close: () => true
      };
    }
  },
  now: () => 1781870000000
});
delayedRealtimeSession.connectRealtime();
delayedRealtimeSession.joinRealtimeMatch('pvplm-delayed-open', { lastSeenRevision: 6 });
assert.equal(delayedRealtimeSent.length, 0, 'joinRealtimeMatch before socket open should not pretend to send');
delayedRealtimeOpen = true;
delayedRealtimeHandlers.onOpen();
assert.deepEqual(delayedRealtimeSent[0], {
  type: 'join_match',
  matchId: 'pvplm-delayed-open',
  lastSeenRevision: 6
}, 'onOpen should replay pending join_match after the socket becomes writable');

const reconnectSent = [];
const reconnectHandlers = [];
const reconnectTimers = [];
const reconnectOpenConnections = new Set();
let reconnectClearedTimer = null;
const reconnectRealtimeSession = createPvpLiveSession({
  liveService: {
    connectRealtime: (handlers) => {
      const connectionIndex = reconnectHandlers.length + 1;
      const wrappedHandlers = {
        ...handlers,
        onOpen: (...args) => {
          reconnectOpenConnections.add(connectionIndex);
          return handlers.onOpen(...args);
        }
      };
      reconnectHandlers.push(wrappedHandlers);
      return {
        send: (payload) => {
          if (!reconnectOpenConnections.has(connectionIndex)) return false;
          reconnectSent.push({
            connectionIndex,
            payload
          });
          return true;
        },
        close: () => true
      };
    }
  },
  realtimeReconnectDelayMs: 25,
  timers: {
    setTimeout: (fn, delayMs) => {
      const timer = { fn, delayMs };
      reconnectTimers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => {
      reconnectClearedTimer = timer;
    }
  },
  now: () => 1781870000000
});
reconnectRealtimeSession.connectRealtime();
reconnectRealtimeSession.joinRealtimeMatch('pvplm-reconnect-fast', { lastSeenRevision: 7 });
reconnectHandlers[0].onOpen();
assert.deepEqual(reconnectSent[0], {
  connectionIndex: 1,
  payload: { type: 'join_match', matchId: 'pvplm-reconnect-fast', lastSeenRevision: 7 }
}, 'initial realtime open should send pending join before reconnect testing');
reconnectHandlers[0].onClose();
assert.equal(reconnectRealtimeSession.getState().realtimeStatus, 'reconnecting', 'unexpected WS close should mark realtime reconnecting');
assert.equal(reconnectTimers[0]?.delayMs, 25, 'unexpected WS close should schedule a short reconnect delay');
reconnectRealtimeSession.resumeRealtime();
assert.equal(reconnectHandlers.length, 2, 'reconnect timer should create a fresh realtime connection');
reconnectHandlers[1].onOpen();
assert.deepEqual(reconnectSent[1], {
  connectionIndex: 2,
  payload: { type: 'join_match', matchId: 'pvplm-reconnect-fast', lastSeenRevision: 7 }
}, 'reconnected realtime socket should replay pending join_match without waiting for heartbeat');
assert.deepEqual(reconnectSent[2], {
  connectionIndex: 2,
  payload: { type: 'heartbeat', matchId: 'pvplm-reconnect-fast', lastSeenRevision: 7 }
}, 'visibility resume should send heartbeat_realtime with the pending join high-water mark as soon as the reconnected socket opens');
reconnectRealtimeSession.disconnectRealtime();
assert.equal(reconnectClearedTimer, reconnectTimers[0], 'visibility resume should clear the delayed reconnect timer instead of waiting for the next interval');
reconnectHandlers[1].onClose();
assert.equal(reconnectTimers.length, 1, 'manual disconnect should not schedule another reconnect');

const staleHttpSession = createPvpLiveSession({
  liveService: {
    joinQueue: async () => ({
      success: true,
      status: 'matched',
      matchId: 'pvplm-stale-http',
      seatId: 'A',
      stateView: {
        matchId: 'pvplm-stale-http',
        status: 'active',
        stateVersion: 9,
        currentSeat: 'B',
        recentEvents: [{ eventType: 'fresh_http_anchor', sequence: 9 }],
        self: { seatId: 'A', hand: [] },
        opponent: { seatId: 'B', handCount: 2 }
      }
    }),
    getMatch: async (matchId) => ({
      success: true,
      matchId,
      seatId: 'A',
      stateView: {
        matchId,
        status: 'active',
        stateVersion: 8,
        currentSeat: 'A',
        recentEvents: [{ eventType: 'stale_http_refresh', sequence: 8 }],
        self: { seatId: 'A', hand: [{ instanceId: 'old-refresh-card' }] },
        opponent: { seatId: 'B', handCount: 3 }
      }
    }),
    heartbeat: async (matchId) => ({
      success: true,
      matchId,
      seatId: 'A',
      stateView: {
        matchId,
        status: 'active',
        stateVersion: 7,
        currentSeat: 'A',
        recentEvents: [{ eventType: 'stale_http_heartbeat', sequence: 7 }],
        connectionReport: { reportVersion: 'pvp-live-connection-v1', heartbeatIntervalMs: 1000 },
        self: { seatId: 'A', hand: [{ instanceId: 'old-heartbeat-card' }] },
        opponent: { seatId: 'B', handCount: 3 }
      }
    }),
    submitIntent: async (matchId) => ({
      success: true,
      result: 'accepted',
      events: [{ eventType: 'stale_http_intent', sequence: 6 }],
      stateView: {
        matchId,
        status: 'active',
        stateVersion: 6,
        currentSeat: 'A',
        self: { seatId: 'A', hand: [{ instanceId: 'old-intent-card' }] },
        opponent: { seatId: 'B', handCount: 3 }
      }
    })
  },
  now: () => 1781870000000
});
await staleHttpSession.joinQueue({ displayName: '单调守卫' });
assert.equal(staleHttpSession.getState().stateView.stateVersion, 9, 'stale HTTP guard test should start from fresh version 9');
await staleHttpSession.refreshMatch();
assert.equal(staleHttpSession.getState().stateView.stateVersion, 9, 'stale HTTP refresh should not downgrade authoritative stateVersion');
assert.equal(staleHttpSession.getState().lastEvents[0].eventType, 'fresh_http_anchor', 'stale HTTP refresh should not downgrade public events');
await staleHttpSession.heartbeat();
assert.equal(staleHttpSession.getState().stateView.stateVersion, 9, 'stale HTTP heartbeat should not downgrade authoritative stateVersion');
await staleHttpSession.submitIntent({
  intentId: 'stale-http-intent',
  intentType: 'end_turn',
  stateVersion: 9,
  payload: {}
});
assert.equal(staleHttpSession.getState().stateView.stateVersion, 9, 'stale HTTP intent result should not downgrade authoritative stateVersion');
assert.equal(staleHttpSession.getState().lastEvents[0].eventType, 'fresh_http_anchor', 'stale HTTP intent result should not downgrade public events');

assert.ok(!calls.some(call => call.method === 'reportMatchResult' || call.method === 'findOpponent'), 'live session should not use legacy PVP paths');

console.log('sanity_pvp_live_session_checks passed');
