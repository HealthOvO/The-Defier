const assert = require('assert');
const sqlite3 = require('../server/node_modules/sqlite3').verbose();
const {
    createSocialService,
    SOCIAL_PROTOCOL_VERSION,
    getSocialDashboard,
    searchProfile,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
    removeFriend,
    setRelationshipControl,
    updateSocialPreferences,
    recordPresenceHeartbeat,
    resolveFriendlyInviteTarget,
    assertFriendlyInviteJoinAllowed,
    assertRiftSquadInviteAllowed,
    isFriendPair
} = require('../server/account-social/social-service');

const REQUIRED_SOCIAL_BOOTSTRAP_FIELDS = Object.freeze({
    social_profiles: [
        'user_id', 'profile_id', 'discovery_policy', 'friend_request_policy',
        'presence_visibility', 'pvp_invite_policy', 'squad_invite_policy',
        'created_at', 'updated_at'
    ],
    social_friend_requests: [
        'request_id', 'sender_user_id', 'receiver_user_id', 'status',
        'created_at', 'updated_at', 'expires_at'
    ],
    social_friendships: [
        'friendship_id', 'user_low_id', 'user_high_id', 'created_at', 'updated_at'
    ],
    social_relationship_controls: [
        'owner_user_id', 'target_user_id', 'is_blocked', 'is_muted',
        'created_at', 'updated_at'
    ],
    social_presence: [
        'user_id', 'activity', 'last_heartbeat_at', 'updated_at'
    ],
    social_mutations: [
        'actor_user_id', 'mutation_id', 'mutation_type', 'request_fingerprint',
        'response_json', 'created_at', 'updated_at'
    ]
});

function dbRun(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function closeDb(db) {
    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function createHarnessDb() {
    const db = new sqlite3.Database(':memory:');
    await dbRun(db, `CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        username_normalized TEXT NOT NULL UNIQUE
    )`);
    await dbRun(db, `CREATE TABLE social_profiles (
        user_id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL UNIQUE,
        discovery_policy TEXT NOT NULL,
        friend_request_policy TEXT NOT NULL,
        presence_visibility TEXT NOT NULL,
        pvp_invite_policy TEXT NOT NULL,
        squad_invite_policy TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    )`);
    await dbRun(db, `CREATE TABLE social_friend_requests (
        request_id TEXT PRIMARY KEY,
        sender_user_id TEXT NOT NULL,
        receiver_user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
    )`);
    await dbRun(db, `CREATE TABLE social_friendships (
        friendship_id TEXT PRIMARY KEY,
        user_low_id TEXT NOT NULL,
        user_high_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(user_low_id, user_high_id)
    )`);
    await dbRun(db, `CREATE TABLE social_relationship_controls (
        owner_user_id TEXT NOT NULL,
        target_user_id TEXT NOT NULL,
        is_blocked INTEGER NOT NULL DEFAULT 0,
        is_muted INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(owner_user_id, target_user_id)
    )`);
    await dbRun(db, `CREATE TABLE social_presence (
        user_id TEXT PRIMARY KEY,
        activity TEXT NOT NULL,
        last_heartbeat_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    )`);
    await dbRun(db, `CREATE TABLE social_mutations (
        actor_user_id TEXT NOT NULL,
        mutation_id TEXT NOT NULL,
        mutation_type TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(actor_user_id, mutation_id)
    )`);
    await dbRun(db, `INSERT INTO users (id, username, username_normalized) VALUES
        ('u-a', 'Alpha', 'alpha'),
        ('u-b', 'Beta', 'beta'),
        ('u-c', 'Gamma', 'gamma')`);
    return db;
}

function writeEnvelope(mutationId) {
    return { protocolVersion: SOCIAL_PROTOCOL_VERSION, mutationId };
}

async function assertRejectsUnavailable(promise, label) {
    await assert.rejects(
        promise,
        (error) => error && error.reason === 'target_unavailable',
        label
    );
}

(async () => {
    const exportedFunctions = {
        getSocialDashboard,
        searchProfile,
        sendFriendRequest,
        acceptFriendRequest,
        declineFriendRequest,
        cancelFriendRequest,
        removeFriend,
        setRelationshipControl,
        updateSocialPreferences,
        recordPresenceHeartbeat,
        resolveFriendlyInviteTarget,
        assertFriendlyInviteJoinAllowed,
        assertRiftSquadInviteAllowed,
        isFriendPair
    };
    Object.entries(exportedFunctions).forEach(([name, fn]) => {
        assert.equal(typeof fn, 'function', `${name} must be exported as a function`);
    });
    assert.deepEqual(Object.keys(REQUIRED_SOCIAL_BOOTSTRAP_FIELDS).sort(), [
        'social_friend_requests',
        'social_friendships',
        'social_mutations',
        'social_presence',
        'social_profiles',
        'social_relationship_controls'
    ].sort(), 'social bootstrap table list should stay explicit for bootstrap wiring');

    const db = await createHarnessDb();
    try {
        let nowValue = 1000000;
        const service = createSocialService({
            db,
            sqlite3Lib: sqlite3,
            now: () => nowValue += 1000
        });

        const dashboardA = await service.getSocialDashboard({ userId: 'u-a' });
        const dashboardB = await service.getSocialDashboard({ userId: 'u-b' });
        assert.equal(dashboardA.profile.username, 'Alpha', 'dashboard should create actor profile');
        assert.equal(dashboardB.profile.username, 'Beta', 'dashboard should create target profile');

        const request = await service.sendFriendRequest({ userId: 'u-a' }, {
            ...writeEnvelope('send-a-b-1'),
            targetProfileId: dashboardB.profile.profileId
        });
        assert.equal(request.status, 'pending', 'targetProfileId friend request should enter pending state');

        const incomingB = await service.getSocialDashboard({ userId: 'u-b' });
        assert.equal(incomingB.incomingRequests.length, 1, 'receiver dashboard should show incoming request');
        const accepted = await service.acceptFriendRequest({ userId: 'u-b' }, {
            ...writeEnvelope('accept-a-b-1'),
            requestId: incomingB.incomingRequests[0].requestId
        });
        assert.equal(accepted.status, 'accepted', 'receiver should accept pending request');
        assert.equal(await service.isFriendPair({ userId: 'u-a' }, { userId: 'u-b' }), true, 'accepted pair should be friends');

        const resolvedByProfile = await service.resolveFriendlyInviteTarget({ userId: 'u-a' }, {
            targetProfileId: dashboardB.profile.profileId
        });
        assert.equal(resolvedByProfile.userId, 'u-b', 'friendly invite targetProfileId should resolve friend target');

        const resolvedByUsername = await service.resolveFriendlyInviteTarget({ userId: 'u-a' }, {
            targetUsername: ' Beta '
        });
        assert.equal(resolvedByUsername.profileId, dashboardB.profile.profileId, 'targetUsername should use the same social graph gate');
        const allowedTargetedJoin = await service.assertFriendlyInviteJoinAllowed({ userId: 'u-a' }, { userId: 'u-b' }, { targeted: true });
        assert.equal(allowedTargetedJoin.userId, 'u-b', 'targeted invite join should revalidate the current friend policy');

        await service.updateSocialPreferences({ userId: 'u-b' }, {
            ...writeEnvelope('prefs-b-no-pvp-1'),
            pvpInvitePolicy: 'disabled'
        });
        await assertRejectsUnavailable(
            service.resolveFriendlyInviteTarget({ userId: 'u-a' }, { targetProfileId: dashboardB.profile.profileId }),
            'disabled pvp invite policy should hide target behind generic unavailable'
        );
        await assertRejectsUnavailable(
            service.assertFriendlyInviteJoinAllowed({ userId: 'u-a' }, { userId: 'u-b' }, { targeted: true }),
            'targeted join should recheck a policy disabled after invite creation'
        );

        await service.updateSocialPreferences({ userId: 'u-b' }, {
            ...writeEnvelope('prefs-b-pvp-friends-1'),
            pvpInvitePolicy: 'friends',
            squadInvitePolicy: 'disabled'
        });
        await assertRejectsUnavailable(
            service.assertRiftSquadInviteAllowed(db, { inviterUserId: 'u-a', inviteeUserId: 'u-b' }),
            'disabled squad invite policy should reject the invite'
        );
        await service.updateSocialPreferences({ userId: 'u-b' }, {
            ...writeEnvelope('prefs-b-squad-friends-1'),
            squadInvitePolicy: 'friends'
        });
        const allowedSquadInvite = await service.assertRiftSquadInviteAllowed(db, { inviterUserId: 'u-a', inviteeUserId: 'u-b' });
        assert.equal(allowedSquadInvite.userId, 'u-b', 'friend-only squad policy should allow the current friend');
        await service.setRelationshipControl({ userId: 'u-b' }, {
            ...writeEnvelope('block-b-a-1'),
            profileId: dashboardA.profile.profileId,
            action: 'block'
        });
        await assertRejectsUnavailable(
            service.resolveFriendlyInviteTarget({ userId: 'u-a' }, { targetUsername: 'Beta' }),
            'blocked pair should hide target behind generic unavailable'
        );
        await assertRejectsUnavailable(
            service.assertFriendlyInviteJoinAllowed({ userId: 'u-a' }, { userId: 'u-b' }, { targeted: false }),
            'open-code invite join should still recheck bilateral blocks'
        );
        assert.equal(await service.isFriendPair({ userId: 'u-a' }, { userId: 'u-b' }), false, 'blocked pair should not count as friends');

        await service.setRelationshipControl({ userId: 'u-b' }, {
            ...writeEnvelope('unblock-b-a-1'),
            profileId: dashboardA.profile.profileId,
            action: 'unblock'
        });
        const freshRequest = await service.sendFriendRequest({ userId: 'u-a' }, {
            ...writeEnvelope('send-a-b-2'),
            targetUsername: 'Beta'
        });
        const finalFriendship = freshRequest.status === 'accepted'
            ? freshRequest
            : await service.acceptFriendRequest({ userId: 'u-b' }, {
                ...writeEnvelope('accept-a-b-2'),
                requestId: freshRequest.requestId
            });
        assert.equal(finalFriendship.status, 'accepted', 'unblocked users should be able to rebuild friendship');

        await service.recordPresenceHeartbeat({ userId: 'u-b' }, {
            ...writeEnvelope('presence-b-1'),
            activity: 'pvp_queue'
        });
        const search = await service.searchProfile({ userId: 'u-a' }, {
            targetProfileId: dashboardB.profile.profileId
        });
        assert.equal(search.profile.relationship, 'friends', 'search should expose friend relationship');
        assert.equal(search.profile.capabilities.canInvitePvp, true, 'friends with pvp policy should be invite-capable');
        assert.equal(search.profile.presence.status, 'online', 'friend presence should be visible after heartbeat');

        await service.removeFriend({ userId: 'u-a' }, {
            ...writeEnvelope('remove-a-b-1'),
            profileId: dashboardB.profile.profileId
        });
        assert.equal(await service.isFriendPair({ userId: 'u-a' }, { userId: 'u-b' }), false, 'removed friendship should be cleared');
    } finally {
        await closeDb(db);
    }

    console.log('sanity_social_graph_platform_checks: ok');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
