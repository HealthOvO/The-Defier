const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createLivePvpStore } = require('../server/pvp-live/live-store');

const repoRoot = path.resolve(__dirname, '..');

function readRepoFile(filePath) {
    return fs.readFileSync(path.join(repoRoot, filePath), 'utf8');
}

function makeLoadout(identitySlot) {
    const pattern = ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike'];
    return {
        identitySlot,
        label: `${identitySlot}-gate`,
        deck: Array.from({ length: 20 }, (_, index) => ({
            id: pattern[index % pattern.length],
            upgraded: false
        }))
    };
}

function finishSourceMatch(match) {
    match.state.status = 'finished';
    match.state.phase = 'finished';
    match.state.eventSeq += 1;
    match.state.events.push({
        eventId: `${match.matchId}-finish-test`,
        sequence: match.state.eventSeq,
        eventType: 'match_finished',
        matchId: match.matchId,
        actingSeat: 'A',
        visibility: 'public',
        payload: {
            winnerSeat: 'A',
            loserSeat: 'B',
            finishReason: 'sanity_finished',
            scoreA: 20,
            scoreB: 0
        }
    });
}

(async () => {
    const routeSource = readRepoFile('server/routes/pvp-live.js');
    assert.match(routeSource, /require\('\.\.\/account-social\/social-service'\)/, 'PVP route should use account social service');
    assert.match(routeSource, /getTargetProfileId/, 'PVP route should accept targetProfileId');
    assert.match(routeSource, /resolveFriendlyInviteTarget\(\s*\{\s*userId:\s*req\.user\s*&&\s*req\.user\.id\s*\}/s, 'PVP route should resolve target from server auth identity');
    assert.match(routeSource, /assertFriendlyInviteJoinAllowed/, 'PVP invite join should recheck current blocks, friendship, and target policy');
    assert.match(routeSource, /target_unavailable/, 'PVP route should genericize unavailable target errors');
    assert.doesNotMatch(routeSource, /target_user_not_found/, 'PVP route should not distinguish unknown usernames from private or blocked targets');

    const storeSource = readRepoFile('server/pvp-live/live-store.js');
    assert.match(storeSource, /randomBytes\(16\)/, 'invite code should carry at least 128 bits of server randomness');
    assert.doesNotMatch(storeSource, /randomBytes\(3\)/, 'invite code must not use the legacy 24-bit short code');
    assert.match(storeSource, /inviteJoinLocks/, 'joinInvite should have a per-code serial lock');
    assert.match(storeSource, /rematchLocks/, 'friendly rematch should have a per-source-match serial lock');
    assert.match(storeSource, /withSerialLock\(this\.inviteJoinLocks,\s*code/s, 'joinInvite should run under the invite-code lock');
    assert.match(storeSource, /withSerialLock\(this\.rematchLocks,\s*rematchLockKey/s, 'requestFriendlyRematch should run under the source-match lock');
    assert.match(storeSource, /persistence\.claimInviteRoom\(code, userId/, 'invite consumption should claim the durable row before creating a match');
    assert.ok(storeSource.indexOf('const guest = normalizePlayer') < storeSource.indexOf('this.persistence.claimInviteRoom(code, userId'), 'guest loadout validation must happen before durable invite claim');
    const joinInviteSource = storeSource.slice(storeSource.indexOf('async joinInvite('), storeSource.indexOf('async cancelInvite('));
    assert.ok(joinInviteSource.indexOf('recoverInviteRoomClaim') < joinInviteSource.indexOf('deleteIfInviteExpired'), 'claimed invite recovery must run before TTL deletion');
    const persistenceSource = readRepoFile('server/pvp-live/live-persistence.js');
    assert.match(persistenceSource, /async claimInviteRoom\(/, 'SQLite persistence should expose an atomic invite claim');
    assert.match(persistenceSource, /WHERE invite_code = \?[\s\S]*AND claimed_at = 0/, 'durable invite claim should only consume an unclaimed row');
    assert.match(persistenceSource, /async claimRematchRequest\(/, 'SQLite persistence should atomically claim a rematch source');
    assert.match(persistenceSource, /async completeRematchRequest\(/, 'SQLite persistence should retain the unique matched rematch id');
    assert.match(persistenceSource, /async recoverInviteRoomClaim\(/, 'SQLite persistence should recover or release stale invite claims');
    assert.match(persistenceSource, /source_invite_code/, 'invite crash recovery should resolve an already persisted match by durable source');
    const databaseSource = readRepoFile('server/db/database.js');
    assert.match(databaseSource, /claimed_by_user_id TEXT NOT NULL DEFAULT ''/, 'invite schema should persist the durable claimer');
    assert.match(databaseSource, /claimed_at INTEGER NOT NULL DEFAULT 0/, 'invite schema should persist durable consumption time');
    assert.match(databaseSource, /matched_match_id TEXT NOT NULL DEFAULT ''/, 'rematch schema should retain the one authoritative next match id');
    assert.match(databaseSource, /source_invite_code TEXT NOT NULL DEFAULT ''/, 'match schema should retain its durable invite source');
    assert.match(databaseSource, /source_rematch_match_id TEXT NOT NULL DEFAULT ''/, 'match schema should retain its durable rematch source');
    assert.match(databaseSource, /idx_pvp_live_matches_source_invite_unique/, 'SQLite should forbid duplicate matches from one invite source');
    assert.match(databaseSource, /idx_pvp_live_matches_source_rematch_unique/, 'SQLite should forbid duplicate matches from one rematch source');

    const inviteStore = createLivePvpStore();
    const invite = await inviteStore.createInvite({
        userId: 'host',
        displayName: 'Host',
        loadout: makeLoadout('host')
    });
    assert.equal(invite.status, 'waiting_invite', 'invite should be created');
    assert.match(invite.inviteCode, /^TD[A-F0-9]{32}$/, 'invite code should expose TD plus 128-bit hex token');

    const joinResults = await Promise.all([
        inviteStore.joinInvite('guest-a', invite.inviteCode, {
            displayName: 'Guest A',
            loadout: makeLoadout('guest-a')
        }),
        inviteStore.joinInvite('guest-b', invite.inviteCode, {
            displayName: 'Guest B',
            loadout: makeLoadout('guest-b')
        })
    ]);
    const matchedInviteResults = joinResults.filter(result => result && result.status === 'matched');
    const rejectedInviteResults = joinResults.filter(result => !result);
    assert.equal(matchedInviteResults.length, 1, 'only one concurrent invite join should consume the invite');
    assert.equal(rejectedInviteResults.length, 1, 'second concurrent invite join should see the consumed invite');
    assert.equal(Array.from(inviteStore.matches.values()).filter(match => match.mode === 'friendly').length, 1, 'concurrent invite join should create exactly one friendly match');

    const recoveredCode = `TD${'A'.repeat(32)}`;
    const recoveredNow = Date.now();
    let recoveredInviteDeleted = false;
    const recoveredInviteStore = createLivePvpStore({
        now: () => recoveredNow,
        inviteTtlMs: 1000,
        persistence: {
            async loadInviteRoomForJoin() {
                return {
                    inviteCode: recoveredCode,
                    host: { userId: 'recovered-host', displayName: 'Recovered Host', loadoutSnapshot: makeLoadout('recovered-host') },
                    target: { userId: 'recovered-guest', displayName: 'Recovered Guest' },
                    claimedByUserId: 'recovered-guest',
                    claimId: 'recovered-claim',
                    claimedAt: recoveredNow - 5000,
                    createdAt: recoveredNow - 5000
                };
            },
            async recoverInviteRoomClaim() {
                return { matchedMatchId: 'recovered-match', released: false };
            },
            async deleteInviteRoom() {
                recoveredInviteDeleted = true;
            }
        }
    });
    const recoveredMatch = await recoveredInviteStore.createMatch(
        { userId: 'recovered-host', displayName: 'Recovered Host', loadoutSnapshot: makeLoadout('recovered-host') },
        { userId: 'recovered-guest', displayName: 'Recovered Guest', loadoutSnapshot: makeLoadout('recovered-guest') },
        { candidatePoolSize: 2 },
        { mode: 'friendly', sourceInviteCode: recoveredCode }
    );
    recoveredInviteStore.matches.delete(recoveredMatch.matchId);
    recoveredMatch.matchId = 'recovered-match';
    recoveredMatch.state.matchId = 'recovered-match';
    recoveredInviteStore.matches.set(recoveredMatch.matchId, recoveredMatch);
    recoveredInviteStore.activeMatchByUserId.set('recovered-host', recoveredMatch.matchId);
    recoveredInviteStore.activeMatchByUserId.set('recovered-guest', recoveredMatch.matchId);
    const recoveredJoin = await recoveredInviteStore.joinInvite('recovered-guest', recoveredCode, {});
    assert.equal(recoveredJoin.status, 'matched', 'expired claimed invite should recover its already persisted match');
    assert.equal(recoveredJoin.matchId, 'recovered-match', 'expired claimed invite recovery should return the original match id');
    assert.equal(recoveredInviteDeleted, true, 'recovered matched invite fact should be cleaned after handoff');

    const rematchStore = createLivePvpStore();
    const source = await rematchStore.createMatch(
        { userId: 'rematch-a', displayName: 'Rematch A', loadoutSnapshot: makeLoadout('rematch-a') },
        { userId: 'rematch-b', displayName: 'Rematch B', loadoutSnapshot: makeLoadout('rematch-b') },
        { candidatePoolSize: 2 },
        { mode: 'ranked' }
    );
    finishSourceMatch(source);
    const rematchResults = await Promise.all([
        rematchStore.requestFriendlyRematch('rematch-a', source.matchId, {
            displayName: 'Rematch A',
            loadout: makeLoadout('rematch-a-next')
        }),
        rematchStore.requestFriendlyRematch('rematch-b', source.matchId, {
            displayName: 'Rematch B',
            loadout: makeLoadout('rematch-b-next')
        })
    ]);
    assert.equal(rematchResults.filter(result => result && result.status === 'matched').length, 1, 'concurrent rematch acceptance should create one match');
    assert.equal(rematchResults.filter(result => result && result.status === 'waiting_rematch').length, 1, 'first rematch requester should still receive waiting receipt');
    assert.equal(Array.from(rematchStore.matches.values()).filter(match => match.mode === 'friendly').length, 1, 'concurrent rematch should create exactly one friendly match');

    console.log('sanity_pvp_live_social_gate_checks: ok');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
