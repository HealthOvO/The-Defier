const crypto = require('crypto');

const SOCIAL_PROTOCOL_VERSION = 'social-graph-v1';
const FRIEND_REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FRIEND_REQUEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const PRESENCE_HEARTBEAT_INTERVAL_MS = 45 * 1000;
const PRESENCE_TTL_MS = 120 * 1000;
const PRESENCE_RECENT_MS = 15 * 60 * 1000;
const MAX_FRIENDS = 100;
const MAX_OUTGOING_PENDING = 20;
const MAX_INCOMING_PENDING = 50;

const DEFAULT_PREFERENCES = Object.freeze({
    discovery: 'exact_only',
    friendRequestPolicy: 'exact_only',
    presenceVisibility: 'friends',
    pvpInvitePolicy: 'friends',
    squadInvitePolicy: 'friends'
});

const ACTIVITY_SET = new Set(['menu', 'pve', 'pvp_queue', 'pvp_match', 'world_rift', 'away']);
const POLICY_SET = Object.freeze({
    discovery: new Set(['exact_only', 'disabled']),
    friendRequestPolicy: new Set(['exact_only', 'disabled']),
    presenceVisibility: new Set(['friends', 'public', 'disabled']),
    pvpInvitePolicy: new Set(['friends', 'disabled']),
    squadInvitePolicy: new Set(['friends', 'disabled'])
});

function makeError(statusCode, reason, message, extras = {}) {
    const error = new Error(message || reason || 'social_error');
    error.statusCode = Number(statusCode) || 500;
    error.reason = String(reason || 'social_error');
    Object.assign(error, extras);
    return error;
}

function makeId(prefix) {
    if (typeof crypto.randomUUID === 'function') {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}`;
}

function makeProfileId() {
    return `sp_${crypto.randomBytes(16).toString('hex')}`;
}

function normalizeUsername(value) {
    return String(value || '')
        .normalize('NFKC')
        .trim()
        .toLowerCase();
}

function normalizeMutationId(value) {
    const normalized = String(value || '').trim();
    if (!normalized || normalized.length > 128 || /[\s]/.test(normalized)) {
        throw makeError(400, 'invalid_mutation_id', 'mutationId 非法');
    }
    return normalized;
}

function normalizeProfileId(value) {
    return String(value || '').trim().slice(0, 80);
}

function normalizeActivity(value) {
    const normalized = String(value || '').trim();
    if (!ACTIVITY_SET.has(normalized)) {
        throw makeError(400, 'invalid_presence_activity', '心跳活动值非法');
    }
    return normalized;
}

function normalizeWriteEnvelope(input = {}) {
    const protocolVersion = String(input.protocolVersion || '').trim();
    if (protocolVersion !== SOCIAL_PROTOCOL_VERSION) {
        throw makeError(400, 'invalid_protocol_version', '协议版本不匹配');
    }
    return {
        protocolVersion,
        mutationId: normalizeMutationId(input.mutationId)
    };
}

function normalizePolicyValue(kind, value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) {
        throw makeError(400, 'invalid_social_preferences', `缺少 ${kind}`);
    }
    const normalized = ['off', 'none', 'hidden', 'private'].includes(raw)
        ? 'disabled'
        : raw;
    const allowed = POLICY_SET[kind];
    if (!allowed || !allowed.has(normalized)) {
        throw makeError(400, 'invalid_social_preferences', `${kind} 配置非法`);
    }
    return normalized;
}

function sha256(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
    }, {});
}

function stableStringify(value) {
    return JSON.stringify(stableValue(value));
}

function normalizeOptionalUserId(input) {
    if (typeof input === 'string') return input.trim();
    if (!input || typeof input !== 'object') return '';
    return String(input.userId || input.id || '').trim();
}

function orderedPair(leftUserId, rightUserId) {
    const ids = [String(leftUserId || '').trim(), String(rightUserId || '').trim()].filter(Boolean).sort();
    return ids.length === 2 && ids[0] !== ids[1] ? ids : ['', ''];
}

function dbRun(connection, sql, params = []) {
    return new Promise((resolve, reject) => {
        connection.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function dbGet(connection, sql, params = []) {
    return new Promise((resolve, reject) => {
        connection.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

function dbAll(connection, sql, params = []) {
    return new Promise((resolve, reject) => {
        connection.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(Array.isArray(rows) ? rows : []);
        });
    });
}

function closeDb(connection) {
    return new Promise((resolve, reject) => {
        connection.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

function parseJson(value, fallback) {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch (error) {
        return fallback;
    }
}

function normalizePresenceStatus(lastHeartbeatAt, nowValue) {
    const heartbeatAt = Math.max(0, Math.floor(Number(lastHeartbeatAt) || 0));
    if (!heartbeatAt) return 'offline';
    const age = Math.max(0, nowValue - heartbeatAt);
    if (age <= PRESENCE_TTL_MS) return 'online';
    if (age <= PRESENCE_RECENT_MS) return 'recent';
    return 'offline';
}

function normalizeProfilePreferences(row) {
    return {
        discovery: String(row && row.discovery_policy || DEFAULT_PREFERENCES.discovery),
        friendRequestPolicy: String(row && row.friend_request_policy || DEFAULT_PREFERENCES.friendRequestPolicy),
        presenceVisibility: String(row && row.presence_visibility || DEFAULT_PREFERENCES.presenceVisibility),
        pvpInvitePolicy: String(row && row.pvp_invite_policy || DEFAULT_PREFERENCES.pvpInvitePolicy),
        squadInvitePolicy: String(row && row.squad_invite_policy || DEFAULT_PREFERENCES.squadInvitePolicy)
    };
}

function normalizeProfileRow(row) {
    if (!row || !row.user_id || !row.profile_id) return null;
    return {
        userId: String(row.user_id),
        profileId: String(row.profile_id),
        username: String(row.username || ''),
        usernameNormalized: String(row.username_normalized || normalizeUsername(row.username || '')),
        preferences: normalizeProfilePreferences(row),
        createdAt: Math.max(0, Math.floor(Number(row.created_at) || 0)),
        updatedAt: Math.max(0, Math.floor(Number(row.updated_at) || 0))
    };
}

function normalizeControlRow(row) {
    return {
        ownerUserId: String(row && row.owner_user_id || ''),
        targetUserId: String(row && row.target_user_id || ''),
        isBlocked: Number(row && row.is_blocked) === 1,
        isMuted: Number(row && row.is_muted) === 1
    };
}

function normalizeRequestRow(row) {
    if (!row || !row.request_id || !row.sender_user_id || !row.receiver_user_id) return null;
    return {
        requestId: String(row.request_id),
        senderUserId: String(row.sender_user_id),
        receiverUserId: String(row.receiver_user_id),
        status: String(row.status || ''),
        createdAt: Math.max(0, Math.floor(Number(row.created_at) || 0)),
        updatedAt: Math.max(0, Math.floor(Number(row.updated_at) || 0)),
        expiresAt: Math.max(0, Math.floor(Number(row.expires_at) || 0))
    };
}

function normalizeFriendshipRow(row) {
    if (!row || !row.user_low_id || !row.user_high_id) return null;
    return {
        friendshipId: String(row.friendship_id || ''),
        userLowId: String(row.user_low_id),
        userHighId: String(row.user_high_id),
        createdAt: Math.max(0, Math.floor(Number(row.created_at) || 0)),
        updatedAt: Math.max(0, Math.floor(Number(row.updated_at) || 0))
    };
}

function makeTargetUnavailableError() {
    return makeError(404, 'target_unavailable', '目标当前不可用');
}

function makeRequestNotFoundError() {
    return makeError(404, 'friend_request_not_found', '好友请求不存在');
}

function makeSelfTargetError(message = '不能对自己执行该操作') {
    return makeError(409, 'self_target_forbidden', message);
}

function makeControlSummary(control) {
    return {
        blocked: !!(control && control.isBlocked),
        muted: !!(control && control.isMuted)
    };
}

function buildFriendPresence({ nowValue, presenceRow, viewerMutedTarget = false, targetPreferences, isFriend }) {
    const visibility = String(targetPreferences && targetPreferences.presenceVisibility || DEFAULT_PREFERENCES.presenceVisibility);
    if (viewerMutedTarget) return null;
    if (visibility === 'disabled') return null;
    if (visibility === 'friends' && !isFriend) return null;
    const status = normalizePresenceStatus(presenceRow && presenceRow.last_heartbeat_at, nowValue);
    return {
        status,
        activity: status === 'online' ? String(presenceRow && presenceRow.activity || 'away') : null
    };
}

function makeRelationshipState({ viewerUserId, targetUserId, friendship, outgoingPending, incomingPending }) {
    if (viewerUserId === targetUserId) return 'self';
    if (friendship) return 'friends';
    if (outgoingPending) return 'outgoing_pending';
    if (incomingPending) return 'incoming_pending';
    return 'none';
}

function makePublicProfileEnvelope({
    targetProfile,
    relationshipState,
    presence,
    viewerControl,
    canSendFriendRequest = false,
    canInvitePvp = false
}) {
    return {
        profileId: targetProfile.profileId,
        username: targetProfile.username,
        relationship: relationshipState,
        presence,
        controls: makeControlSummary(viewerControl),
        preferences: {
            friendRequestPolicy: targetProfile.preferences.friendRequestPolicy,
            pvpInvitePolicy: targetProfile.preferences.pvpInvitePolicy
        },
        capabilities: {
            canSendFriendRequest,
            canInvitePvp
        }
    };
}

function createSocialService({ db = null, dbPath = '', now = () => Date.now(), sqlite3Lib = null } = {}) {
    let cachedDb = db;
    let cachedDbPath = dbPath;
    let cachedSqlite3 = sqlite3Lib;
    const columnCache = new Map();

    function getSqlite3() {
        if (!cachedSqlite3) {
            cachedSqlite3 = require('sqlite3').verbose();
        }
        return cachedSqlite3;
    }

    function getBaseDb() {
        if (!cachedDb) {
            const databaseModule = require('../db/database');
            cachedDb = databaseModule.db;
            if (!cachedDbPath) cachedDbPath = databaseModule.dbPath || '';
        }
        return cachedDb;
    }

    async function getTableColumns(connection, tableName) {
        const cacheKey = `${cachedDbPath || 'inline'}:${tableName}`;
        if (columnCache.has(cacheKey)) return columnCache.get(cacheKey);
        const rows = await dbAll(connection, `PRAGMA table_info(${tableName})`);
        const columns = new Set(rows.map(row => String(row.name || '')));
        columnCache.set(cacheKey, columns);
        return columns;
    }

    async function hasColumn(connection, tableName, columnName) {
        const columns = await getTableColumns(connection, tableName);
        return columns.has(columnName);
    }

    async function withReadConnection(callback) {
        return callback(getBaseDb());
    }

    async function withWriteTransaction(callback) {
        const baseDb = getBaseDb();
        const sqlite3 = getSqlite3();
        const canOpenDedicated = !!(cachedDbPath && sqlite3 && typeof sqlite3.Database === 'function');
        const connection = canOpenDedicated ? new sqlite3.Database(cachedDbPath) : baseDb;
        let began = false;
        try {
            if (canOpenDedicated && typeof connection.configure === 'function') {
                connection.configure('busyTimeout', Number(process.env.DEFIER_SQLITE_BUSY_TIMEOUT_MS || 5000));
            }
            await dbRun(connection, 'BEGIN IMMEDIATE');
            began = true;
            const result = await callback(connection);
            await dbRun(connection, 'COMMIT');
            began = false;
            return result;
        } catch (error) {
            if (began) {
                try {
                    await dbRun(connection, 'ROLLBACK');
                } catch (rollbackError) {
                    // Ignore rollback failures and surface the original error.
                }
            }
            throw error;
        } finally {
            if (canOpenDedicated) {
                await closeDb(connection);
            }
        }
    }

    async function loadUserById(connection, userId) {
        const id = String(userId || '').trim();
        if (!id) return null;
        const includeNormalized = await hasColumn(connection, 'users', 'username_normalized');
        const selectNormalized = includeNormalized
            ? `COALESCE(NULLIF(username_normalized, ''), LOWER(username)) AS username_normalized`
            : `LOWER(username) AS username_normalized`;
        return dbGet(
            connection,
            `SELECT id, username, ${selectNormalized}
               FROM users
              WHERE id = ?
              LIMIT 1`,
            [id]
        );
    }

    async function loadUserByExactUsername(connection, username) {
        const exactUsername = String(username || '').trim();
        const normalized = normalizeUsername(username);
        if (!normalized || !exactUsername) return null;
        const includeNormalized = await hasColumn(connection, 'users', 'username_normalized');
        const sql = includeNormalized
            ? `SELECT id, username, COALESCE(NULLIF(username_normalized, ''), LOWER(username)) AS username_normalized
                 FROM users
                WHERE COALESCE(NULLIF(username_normalized, ''), LOWER(username)) = ?
                LIMIT 1`
            : `SELECT id, username, LOWER(username) AS username_normalized
                 FROM users
                WHERE LOWER(username) = ?
                LIMIT 1`;
        const normalizedMatch = await dbGet(connection, sql, [normalized]);
        if (normalizedMatch || !includeNormalized) return normalizedMatch;
        return dbGet(
            connection,
            `SELECT id, username, COALESCE(NULLIF(username_normalized, ''), LOWER(username)) AS username_normalized
               FROM users
              WHERE username = ? COLLATE BINARY
              LIMIT 1`,
            [exactUsername]
        );
    }

    async function loadProfileByUserId(connection, userId) {
        const id = String(userId || '').trim();
        if (!id) return null;
        const includeNormalized = await hasColumn(connection, 'users', 'username_normalized');
        const selectNormalized = includeNormalized
            ? `COALESCE(NULLIF(u.username_normalized, ''), LOWER(u.username)) AS username_normalized`
            : `LOWER(u.username) AS username_normalized`;
        const row = await dbGet(
            connection,
            `SELECT sp.user_id, sp.profile_id, sp.discovery_policy, sp.friend_request_policy,
                    sp.presence_visibility, sp.pvp_invite_policy, sp.squad_invite_policy,
                    sp.created_at, sp.updated_at,
                    u.username, ${selectNormalized}
               FROM social_profiles sp
               JOIN users u
                 ON u.id = sp.user_id
              WHERE sp.user_id = ?
              LIMIT 1`,
            [id]
        );
        return normalizeProfileRow(row);
    }

    async function loadProfileByProfileId(connection, profileId) {
        const id = normalizeProfileId(profileId);
        if (!id) return null;
        const includeNormalized = await hasColumn(connection, 'users', 'username_normalized');
        const selectNormalized = includeNormalized
            ? `COALESCE(NULLIF(u.username_normalized, ''), LOWER(u.username)) AS username_normalized`
            : `LOWER(u.username) AS username_normalized`;
        const row = await dbGet(
            connection,
            `SELECT sp.user_id, sp.profile_id, sp.discovery_policy, sp.friend_request_policy,
                    sp.presence_visibility, sp.pvp_invite_policy, sp.squad_invite_policy,
                    sp.created_at, sp.updated_at,
                    u.username, ${selectNormalized}
               FROM social_profiles sp
               JOIN users u
                 ON u.id = sp.user_id
              WHERE sp.profile_id = ?
              LIMIT 1`,
            [id]
        );
        return normalizeProfileRow(row);
    }

    async function ensureProfileForUser(connection, userRow) {
        if (!userRow || !userRow.id || !userRow.username) {
            throw makeError(401, 'social_user_not_found', '用户不存在');
        }
        const existing = await loadProfileByUserId(connection, userRow.id);
        if (existing) return existing;
        const nowValue = Math.max(0, Math.floor(Number(now()) || Date.now()));
        await dbRun(
            connection,
            `INSERT INTO social_profiles
                (user_id, profile_id, discovery_policy, friend_request_policy, presence_visibility, pvp_invite_policy, squad_invite_policy, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id) DO NOTHING`,
            [
                String(userRow.id),
                makeProfileId(),
                DEFAULT_PREFERENCES.discovery,
                DEFAULT_PREFERENCES.friendRequestPolicy,
                DEFAULT_PREFERENCES.presenceVisibility,
                DEFAULT_PREFERENCES.pvpInvitePolicy,
                DEFAULT_PREFERENCES.squadInvitePolicy,
                nowValue,
                nowValue
            ]
        );
        const created = await loadProfileByUserId(connection, userRow.id);
        if (!created) {
            throw makeError(500, 'social_profile_missing', '社交档案创建失败');
        }
        return created;
    }

    async function requireActor(connection, actorInput) {
        const actorUserId = normalizeOptionalUserId(actorInput);
        if (!actorUserId) {
            throw makeError(401, 'social_auth_required', '缺少用户身份');
        }
        const user = await loadUserById(connection, actorUserId);
        if (!user) {
            throw makeError(401, 'social_user_not_found', '用户不存在');
        }
        const profile = await ensureProfileForUser(connection, user);
        return {
            userId: String(user.id),
            username: String(user.username),
            usernameNormalized: String(user.username_normalized || normalizeUsername(user.username)),
            profile
        };
    }

    async function loadTargetProfile(connection, { targetProfileId = '', targetUsername = '' } = {}) {
        const profileId = normalizeProfileId(targetProfileId);
        if (profileId) return loadProfileByProfileId(connection, profileId);
        if (String(targetUsername || '').trim()) {
            const user = await loadUserByExactUsername(connection, targetUsername);
            if (!user) return null;
            return ensureProfileForUser(connection, user);
        }
        throw makeError(400, 'missing_target', '缺少目标 profileId 或 username');
    }

    async function expirePendingRequests(connection, nowValue, pair = null) {
        const params = [nowValue];
        let sql = `UPDATE social_friend_requests
                      SET status = 'expired',
                          updated_at = ?
                    WHERE status = 'pending'
                      AND expires_at > 0
                      AND expires_at <= ?`;
        params.push(nowValue);
        if (pair && pair.left && pair.right) {
            sql += ` AND (
                (sender_user_id = ? AND receiver_user_id = ?)
                OR
                (sender_user_id = ? AND receiver_user_id = ?)
            )`;
            params.push(pair.left, pair.right, pair.right, pair.left);
        }
        await dbRun(connection, sql, params);
    }

    async function loadFriendship(connection, leftUserId, rightUserId) {
        const [userLowId, userHighId] = orderedPair(leftUserId, rightUserId);
        if (!userLowId || !userHighId) return null;
        const row = await dbGet(
            connection,
            `SELECT friendship_id, user_low_id, user_high_id, created_at, updated_at
               FROM social_friendships
              WHERE user_low_id = ?
                AND user_high_id = ?
              LIMIT 1`,
            [userLowId, userHighId]
        );
        return normalizeFriendshipRow(row);
    }

    async function insertFriendship(connection, leftUserId, rightUserId, nowValue) {
        const [userLowId, userHighId] = orderedPair(leftUserId, rightUserId);
        if (!userLowId || !userHighId) throw makeError(400, 'invalid_friendship_pair', '好友关系非法');
        await dbRun(
            connection,
            `INSERT INTO social_friendships (friendship_id, user_low_id, user_high_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(user_low_id, user_high_id) DO NOTHING`,
            [makeId('sf'), userLowId, userHighId, nowValue, nowValue]
        );
        return loadFriendship(connection, leftUserId, rightUserId);
    }

    async function deleteFriendship(connection, leftUserId, rightUserId) {
        const [userLowId, userHighId] = orderedPair(leftUserId, rightUserId);
        if (!userLowId || !userHighId) return;
        await dbRun(
            connection,
            `DELETE FROM social_friendships
              WHERE user_low_id = ?
                AND user_high_id = ?`,
            [userLowId, userHighId]
        );
    }

    async function loadControl(connection, ownerUserId, targetUserId) {
        const row = await dbGet(
            connection,
            `SELECT owner_user_id, target_user_id, is_blocked, is_muted
               FROM social_relationship_controls
              WHERE owner_user_id = ?
                AND target_user_id = ?
              LIMIT 1`,
            [String(ownerUserId || ''), String(targetUserId || '')]
        );
        return normalizeControlRow(row);
    }

    async function loadPairControls(connection, leftUserId, rightUserId) {
        const rows = await dbAll(
            connection,
            `SELECT owner_user_id, target_user_id, is_blocked, is_muted
               FROM social_relationship_controls
              WHERE (owner_user_id = ? AND target_user_id = ?)
                 OR (owner_user_id = ? AND target_user_id = ?)`,
            [leftUserId, rightUserId, rightUserId, leftUserId]
        );
        const byKey = new Map(rows.map(row => [`${row.owner_user_id}::${row.target_user_id}`, normalizeControlRow(row)]));
        return {
            forward: byKey.get(`${leftUserId}::${rightUserId}`) || normalizeControlRow(null),
            reverse: byKey.get(`${rightUserId}::${leftUserId}`) || normalizeControlRow(null)
        };
    }

    async function upsertControl(connection, ownerUserId, targetUserId, { isBlocked, isMuted }, nowValue) {
        const existing = await loadControl(connection, ownerUserId, targetUserId);
        const nextBlocked = typeof isBlocked === 'boolean' ? isBlocked : existing.isBlocked;
        const nextMuted = typeof isMuted === 'boolean' ? isMuted : existing.isMuted;
        if (!nextBlocked && !nextMuted) {
            await dbRun(
                connection,
                `DELETE FROM social_relationship_controls
                  WHERE owner_user_id = ?
                    AND target_user_id = ?`,
                [ownerUserId, targetUserId]
            );
            return normalizeControlRow(null);
        }
        await dbRun(
            connection,
            `INSERT INTO social_relationship_controls
                (owner_user_id, target_user_id, is_blocked, is_muted, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(owner_user_id, target_user_id) DO UPDATE SET
                is_blocked = excluded.is_blocked,
                is_muted = excluded.is_muted,
                updated_at = excluded.updated_at`,
            [
                ownerUserId,
                targetUserId,
                nextBlocked ? 1 : 0,
                nextMuted ? 1 : 0,
                nowValue,
                nowValue
            ]
        );
        return loadControl(connection, ownerUserId, targetUserId);
    }

    async function loadPendingRequestById(connection, requestId) {
        const row = await dbGet(
            connection,
            `SELECT request_id, sender_user_id, receiver_user_id, status, created_at, updated_at, expires_at
               FROM social_friend_requests
              WHERE request_id = ?
              LIMIT 1`,
            [String(requestId || '').trim()]
        );
        return normalizeRequestRow(row);
    }

    async function loadPendingBetween(connection, senderUserId, receiverUserId) {
        const row = await dbGet(
            connection,
            `SELECT request_id, sender_user_id, receiver_user_id, status, created_at, updated_at, expires_at
               FROM social_friend_requests
              WHERE sender_user_id = ?
                AND receiver_user_id = ?
                AND status = 'pending'
              ORDER BY created_at DESC
              LIMIT 1`,
            [senderUserId, receiverUserId]
        );
        return normalizeRequestRow(row);
    }

    async function countFriends(connection, userId) {
        const row = await dbGet(
            connection,
            `SELECT COUNT(*) AS total
               FROM social_friendships
              WHERE user_low_id = ?
                 OR user_high_id = ?`,
            [userId, userId]
        );
        return Math.max(0, Math.floor(Number(row && row.total) || 0));
    }

    async function countPending(connection, columnName, userId) {
        const row = await dbGet(
            connection,
            `SELECT COUNT(*) AS total
               FROM social_friend_requests
              WHERE ${columnName} = ?
                AND status = 'pending'`,
            [userId]
        );
        return Math.max(0, Math.floor(Number(row && row.total) || 0));
    }

    async function loadLatestDirectionalCooldown(connection, senderUserId, receiverUserId) {
        const row = await dbGet(
            connection,
            `SELECT status, updated_at
               FROM social_friend_requests
              WHERE sender_user_id = ?
                AND receiver_user_id = ?
                AND status IN ('declined', 'cancelled')
              ORDER BY updated_at DESC
              LIMIT 1`,
            [senderUserId, receiverUserId]
        );
        return row || null;
    }

    async function insertRequestHistory(connection, senderUserId, receiverUserId, status, nowValue) {
        await dbRun(
            connection,
            `INSERT INTO social_friend_requests
                (request_id, sender_user_id, receiver_user_id, status, created_at, updated_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [makeId('sfr'), senderUserId, receiverUserId, status, nowValue, nowValue, nowValue]
        );
    }

    async function setPairPendingStatus(connection, leftUserId, rightUserId, status, nowValue) {
        await dbRun(
            connection,
            `UPDATE social_friend_requests
                SET status = ?,
                    updated_at = ?
              WHERE status = 'pending'
                AND (
                    (sender_user_id = ? AND receiver_user_id = ?)
                    OR
                    (sender_user_id = ? AND receiver_user_id = ?)
                )`,
            [status, nowValue, leftUserId, rightUserId, rightUserId, leftUserId]
        );
    }

    async function loadProfilesByUserIds(connection, userIds = []) {
        const ids = Array.from(new Set((Array.isArray(userIds) ? userIds : []).map(value => String(value || '').trim()).filter(Boolean)));
        if (ids.length === 0) return new Map();
        const placeholders = ids.map(() => '?').join(', ');
        const includeNormalized = await hasColumn(connection, 'users', 'username_normalized');
        const selectNormalized = includeNormalized
            ? `COALESCE(NULLIF(u.username_normalized, ''), LOWER(u.username)) AS username_normalized`
            : `LOWER(u.username) AS username_normalized`;
        const rows = await dbAll(
            connection,
            `SELECT sp.user_id, sp.profile_id, sp.discovery_policy, sp.friend_request_policy,
                    sp.presence_visibility, sp.pvp_invite_policy, sp.squad_invite_policy,
                    sp.created_at, sp.updated_at,
                    u.username, ${selectNormalized}
               FROM social_profiles sp
               JOIN users u
                 ON u.id = sp.user_id
              WHERE sp.user_id IN (${placeholders})`,
            ids
        );
        return new Map(rows.map(row => {
            const normalized = normalizeProfileRow(row);
            return [normalized.userId, normalized];
        }));
    }

    async function loadPresenceByUserIds(connection, userIds = []) {
        const ids = Array.from(new Set((Array.isArray(userIds) ? userIds : []).map(value => String(value || '').trim()).filter(Boolean)));
        if (ids.length === 0) return new Map();
        const placeholders = ids.map(() => '?').join(', ');
        const rows = await dbAll(
            connection,
            `SELECT user_id, activity, last_heartbeat_at
               FROM social_presence
              WHERE user_id IN (${placeholders})`,
            ids
        );
        return new Map(rows.map(row => [String(row.user_id), row]));
    }

    async function loadOutgoingControls(connection, ownerUserId, targetUserIds = []) {
        const ids = Array.from(new Set((Array.isArray(targetUserIds) ? targetUserIds : []).map(value => String(value || '').trim()).filter(Boolean)));
        if (ids.length === 0) return new Map();
        const placeholders = ids.map(() => '?').join(', ');
        const rows = await dbAll(
            connection,
            `SELECT owner_user_id, target_user_id, is_blocked, is_muted
               FROM social_relationship_controls
              WHERE owner_user_id = ?
                AND target_user_id IN (${placeholders})`,
            [ownerUserId, ...ids]
        );
        return new Map(rows.map(row => [String(row.target_user_id), normalizeControlRow(row)]));
    }

    async function loadFriendUserIds(connection, userId) {
        const rows = await dbAll(
            connection,
            `SELECT user_low_id, user_high_id
               FROM social_friendships
              WHERE user_low_id = ?
                 OR user_high_id = ?`,
            [userId, userId]
        );
        return rows.map(row => row.user_low_id === userId ? String(row.user_high_id) : String(row.user_low_id));
    }

    async function loadPendingRequestsForViewer(connection, viewerUserId, direction) {
        const column = direction === 'incoming' ? 'receiver_user_id' : 'sender_user_id';
        const rows = await dbAll(
            connection,
            `SELECT request_id, sender_user_id, receiver_user_id, status, created_at, updated_at, expires_at
               FROM social_friend_requests
              WHERE ${column} = ?
                AND status = 'pending'
              ORDER BY created_at DESC
              LIMIT ?`,
            [viewerUserId, direction === 'incoming' ? MAX_INCOMING_PENDING : MAX_OUTGOING_PENDING]
        );
        return rows.map(normalizeRequestRow).filter(Boolean);
    }

    async function readMutationRow(connection, actorUserId, mutationId) {
        return dbGet(
            connection,
            `SELECT request_fingerprint, response_json
               FROM social_mutations
              WHERE actor_user_id = ?
                AND mutation_id = ?
              LIMIT 1`,
            [actorUserId, mutationId]
        );
    }

    async function writeMutationRow(connection, actorUserId, mutationId, mutationType, requestFingerprint, response, nowValue) {
        const responseJson = stableStringify(response);
        try {
            await dbRun(
                connection,
                `INSERT INTO social_mutations
                    (actor_user_id, mutation_id, mutation_type, request_fingerprint, response_json, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [actorUserId, mutationId, mutationType, requestFingerprint, responseJson, nowValue, nowValue]
            );
        } catch (error) {
            if (!/SQLITE_CONSTRAINT/i.test(String(error && error.code || error && error.message || ''))) {
                throw error;
            }
            const existing = await readMutationRow(connection, actorUserId, mutationId);
            if (!existing) throw error;
            if (String(existing.request_fingerprint || '') !== requestFingerprint) {
                throw makeError(409, 'mutation_reused', 'mutationId 已被其他参数占用');
            }
            return parseJson(existing.response_json, response);
        }
        return response;
    }

    async function withMutation(connection, actorUserId, mutationType, envelope, payload, callback) {
        const requestFingerprint = sha256(stableStringify(payload));
        const existing = await readMutationRow(connection, actorUserId, envelope.mutationId);
        if (existing) {
            if (String(existing.request_fingerprint || '') !== requestFingerprint) {
                throw makeError(409, 'mutation_reused', 'mutationId 已被其他参数占用');
            }
            return parseJson(existing.response_json, {});
        }
        const response = await callback();
        return writeMutationRow(connection, actorUserId, envelope.mutationId, mutationType, requestFingerprint, response, Math.max(0, Math.floor(Number(now()) || Date.now())));
    }

    function checkProfileDiscoverable(targetProfile, isFriend, isSelf) {
        if (isSelf || isFriend) return true;
        return targetProfile.preferences.discovery !== 'disabled';
    }

    function checkFriendRequestAllowed(targetProfile, isFriend, isSelf) {
        if (isSelf || isFriend) return false;
        return targetProfile.preferences.friendRequestPolicy === 'exact_only';
    }

    function checkPvpInviteAllowed(targetProfile, isFriend) {
        if (!isFriend) return false;
        return targetProfile.preferences.pvpInvitePolicy === 'friends';
    }

    async function ensureReachableTarget(connection, actor, targetProfile) {
        if (!targetProfile) {
            throw makeTargetUnavailableError();
        }
        if (targetProfile.userId === actor.userId) {
            throw makeSelfTargetError('不能邀请自己进行好友操作');
        }
        const nowValue = Math.max(0, Math.floor(Number(now()) || Date.now()));
        await expirePendingRequests(connection, nowValue, { left: actor.userId, right: targetProfile.userId });
        const friendship = await loadFriendship(connection, actor.userId, targetProfile.userId);
        const controls = await loadPairControls(connection, actor.userId, targetProfile.userId);
        if (controls.forward.isBlocked || controls.reverse.isBlocked) {
            throw makeTargetUnavailableError();
        }
        return { friendship, controls };
    }

    async function getSocialDashboard(actorInput) {
        return withReadConnection(async (connection) => {
            const actor = await requireActor(connection, actorInput);
            const nowValue = Math.max(0, Math.floor(Number(now()) || Date.now()));
            await expirePendingRequests(connection, nowValue);
            const friendUserIds = await loadFriendUserIds(connection, actor.userId);
            const friendProfiles = await loadProfilesByUserIds(connection, friendUserIds);
            const friendPresence = await loadPresenceByUserIds(connection, friendUserIds);
            const outgoingControls = await loadOutgoingControls(connection, actor.userId, friendUserIds);

            const friends = friendUserIds.map((friendUserId) => {
                const profile = friendProfiles.get(friendUserId);
                if (!profile) return null;
                const control = outgoingControls.get(friendUserId) || normalizeControlRow(null);
                return {
                    profileId: profile.profileId,
                    username: profile.username,
                    presence: buildFriendPresence({
                        nowValue,
                        presenceRow: friendPresence.get(friendUserId),
                        viewerMutedTarget: control.isMuted,
                        targetPreferences: profile.preferences,
                        isFriend: true
                    }),
                    controls: makeControlSummary(control),
                    invitePolicies: {
                        pvp: profile.preferences.pvpInvitePolicy,
                        squad: profile.preferences.squadInvitePolicy
                    }
                };
            }).filter(Boolean).sort((left, right) => left.username.localeCompare(right.username, 'zh-Hans-CN'));

            const incomingRequests = await loadPendingRequestsForViewer(connection, actor.userId, 'incoming');
            const outgoingRequests = await loadPendingRequestsForViewer(connection, actor.userId, 'outgoing');
            const pendingUserIds = new Set();
            incomingRequests.forEach(request => pendingUserIds.add(request.senderUserId));
            outgoingRequests.forEach(request => pendingUserIds.add(request.receiverUserId));
            const pendingProfiles = await loadProfilesByUserIds(connection, Array.from(pendingUserIds));
            const pendingPresence = await loadPresenceByUserIds(connection, Array.from(pendingUserIds));
            const pendingControls = await loadOutgoingControls(connection, actor.userId, Array.from(pendingUserIds));

            const mapRequestEnvelope = (request, otherUserId, direction) => {
                const profile = pendingProfiles.get(otherUserId);
                if (!profile) return null;
                const control = pendingControls.get(otherUserId) || normalizeControlRow(null);
                return {
                    requestId: request.requestId,
                    direction,
                    profileId: profile.profileId,
                    username: profile.username,
                    createdAt: request.createdAt,
                    expiresAt: request.expiresAt,
                    presence: buildFriendPresence({
                        nowValue,
                        presenceRow: pendingPresence.get(otherUserId),
                        viewerMutedTarget: control.isMuted,
                        targetPreferences: profile.preferences,
                        isFriend: false
                    })
                };
            };

            return {
                reportVersion: 'social-graph-dashboard-v1',
                profile: {
                    profileId: actor.profile.profileId,
                    username: actor.username,
                    preferences: actor.profile.preferences
                },
                presence: {
                    heartbeatIntervalSeconds: Math.floor(PRESENCE_HEARTBEAT_INTERVAL_MS / 1000),
                    ttlSeconds: Math.floor(PRESENCE_TTL_MS / 1000),
                    recentWindowSeconds: Math.floor(PRESENCE_RECENT_MS / 1000)
                },
                limits: {
                    maxFriends: MAX_FRIENDS,
                    maxOutgoingPending: MAX_OUTGOING_PENDING,
                    maxIncomingPending: MAX_INCOMING_PENDING
                },
                friends,
                incomingRequests: incomingRequests.map(request => mapRequestEnvelope(request, request.senderUserId, 'incoming')).filter(Boolean),
                outgoingRequests: outgoingRequests.map(request => mapRequestEnvelope(request, request.receiverUserId, 'outgoing')).filter(Boolean)
            };
        });
    }

    async function searchProfile(actorInput, options = {}) {
        return withReadConnection(async (connection) => {
            const actor = await requireActor(connection, actorInput);
            const targetProfile = await loadTargetProfile(connection, options);
            if (!targetProfile) {
                throw makeTargetUnavailableError();
            }
            const isSelf = targetProfile.userId === actor.userId;
            const nowValue = Math.max(0, Math.floor(Number(now()) || Date.now()));
            await expirePendingRequests(connection, nowValue, { left: actor.userId, right: targetProfile.userId });
            const friendship = isSelf ? null : await loadFriendship(connection, actor.userId, targetProfile.userId);
            const controls = isSelf ? { forward: normalizeControlRow(null), reverse: normalizeControlRow(null) } : await loadPairControls(connection, actor.userId, targetProfile.userId);
            if (!isSelf && (controls.forward.isBlocked || controls.reverse.isBlocked)) {
                throw makeTargetUnavailableError();
            }
            if (!checkProfileDiscoverable(targetProfile, !!friendship, isSelf)) {
                throw makeTargetUnavailableError();
            }
            const outgoingPending = isSelf ? null : await loadPendingBetween(connection, actor.userId, targetProfile.userId);
            const incomingPending = isSelf ? null : await loadPendingBetween(connection, targetProfile.userId, actor.userId);
            const relationshipState = makeRelationshipState({
                viewerUserId: actor.userId,
                targetUserId: targetProfile.userId,
                friendship,
                outgoingPending,
                incomingPending
            });
            const presenceMap = await loadPresenceByUserIds(connection, [targetProfile.userId]);
            return {
                reportVersion: 'social-profile-search-v1',
                profile: makePublicProfileEnvelope({
                    targetProfile,
                    relationshipState,
                    presence: buildFriendPresence({
                        nowValue,
                        presenceRow: presenceMap.get(targetProfile.userId),
                        viewerMutedTarget: controls.forward.isMuted,
                        targetPreferences: targetProfile.preferences,
                        isFriend: !!friendship || isSelf
                    }),
                    viewerControl: controls.forward,
                    canSendFriendRequest: checkFriendRequestAllowed(targetProfile, !!friendship, isSelf) && !outgoingPending && !incomingPending,
                    canInvitePvp: checkPvpInviteAllowed(targetProfile, !!friendship)
                })
            };
        });
    }

    async function sendFriendRequest(actorInput, input = {}) {
        const envelope = normalizeWriteEnvelope(input);
        return withWriteTransaction(async (connection) => {
            const actor = await requireActor(connection, actorInput);
            return withMutation(connection, actor.userId, 'send_friend_request', envelope, {
                targetProfileId: normalizeProfileId(input.targetProfileId),
                targetUsername: String(input.targetUsername || '').trim(),
                protocolVersion: envelope.protocolVersion
            }, async () => {
                const targetProfile = await loadTargetProfile(connection, input);
                if (!targetProfile) throw makeTargetUnavailableError();
                if (targetProfile.userId === actor.userId) {
                    throw makeSelfTargetError('不能向自己发送好友请求');
                }
                const nowValue = Math.max(0, Math.floor(Number(now()) || Date.now()));
                await expirePendingRequests(connection, nowValue, { left: actor.userId, right: targetProfile.userId });
                const { friendship, controls } = await ensureReachableTarget(connection, actor, targetProfile);
                if (friendship) {
                    throw makeError(409, 'friendship_exists', '已经是好友');
                }
                if (!checkProfileDiscoverable(targetProfile, false, false)) {
                    throw makeTargetUnavailableError();
                }
                if (!checkFriendRequestAllowed(targetProfile, false, false)) {
                    throw makeTargetUnavailableError();
                }
                const existingOutgoing = await loadPendingBetween(connection, actor.userId, targetProfile.userId);
                if (existingOutgoing) {
                    return {
                        reportVersion: 'social-friend-request-write-v1',
                        status: 'pending',
                        requestId: existingOutgoing.requestId,
                        targetProfileId: targetProfile.profileId,
                        autoAccepted: false
                    };
                }
                const existingIncoming = await loadPendingBetween(connection, targetProfile.userId, actor.userId);
                if (existingIncoming) {
                    const friendshipRow = await insertFriendship(connection, actor.userId, targetProfile.userId, nowValue);
                    await setPairPendingStatus(connection, actor.userId, targetProfile.userId, 'accepted', nowValue);
                    const acceptedRequestId = makeId('sfr');
                    await dbRun(
                        connection,
                        `INSERT INTO social_friend_requests
                            (request_id, sender_user_id, receiver_user_id, status, created_at, updated_at, expires_at)
                         VALUES (?, ?, ?, 'accepted', ?, ?, ?)`,
                        [acceptedRequestId, actor.userId, targetProfile.userId, nowValue, nowValue, nowValue]
                    );
                    return {
                        reportVersion: 'social-friend-request-write-v1',
                        status: 'accepted',
                        requestId: acceptedRequestId,
                        targetProfileId: targetProfile.profileId,
                        autoAccepted: true,
                        friendshipId: friendshipRow && friendshipRow.friendshipId || ''
                    };
                }

                const actorFriendCount = await countFriends(connection, actor.userId);
                const targetFriendCount = await countFriends(connection, targetProfile.userId);
                if (actorFriendCount >= MAX_FRIENDS || targetFriendCount >= MAX_FRIENDS) {
                    throw makeError(409, 'friend_limit_reached', '好友数量已达上限');
                }
                const outgoingCount = await countPending(connection, 'sender_user_id', actor.userId);
                if (outgoingCount >= MAX_OUTGOING_PENDING) {
                    throw makeError(409, 'outgoing_request_limit_reached', '发出的待处理好友请求已达上限');
                }
                const incomingCount = await countPending(connection, 'receiver_user_id', targetProfile.userId);
                if (incomingCount >= MAX_INCOMING_PENDING) {
                    throw makeError(409, 'target_request_limit_reached', '目标当前不可用');
                }
                const cooldownRow = await loadLatestDirectionalCooldown(connection, actor.userId, targetProfile.userId);
                const cooldownUntil = cooldownRow
                    ? Math.max(0, Math.floor(Number(cooldownRow.updated_at) || 0)) + FRIEND_REQUEST_COOLDOWN_MS
                    : 0;
                if (cooldownRow && cooldownUntil > nowValue) {
                    throw makeError(409, 'friend_request_cooldown', '该方向请求仍在冷却中', {
                        retryAfterSeconds: Math.ceil((cooldownUntil - nowValue) / 1000)
                    });
                }
                const requestId = makeId('sfr');
                await dbRun(
                    connection,
                    `INSERT INTO social_friend_requests
                        (request_id, sender_user_id, receiver_user_id, status, created_at, updated_at, expires_at)
                     VALUES (?, ?, ?, 'pending', ?, ?, ?)`,
                    [requestId, actor.userId, targetProfile.userId, nowValue, nowValue, nowValue + FRIEND_REQUEST_TTL_MS]
                );
                return {
                    reportVersion: 'social-friend-request-write-v1',
                    status: 'pending',
                    requestId,
                    targetProfileId: targetProfile.profileId,
                    autoAccepted: false
                };
            });
        });
    }

    async function acceptFriendRequest(actorInput, input = {}) {
        const envelope = normalizeWriteEnvelope(input);
        return withWriteTransaction(async (connection) => {
            const actor = await requireActor(connection, actorInput);
            return withMutation(connection, actor.userId, 'accept_friend_request', envelope, {
                requestId: String(input.requestId || '').trim(),
                protocolVersion: envelope.protocolVersion
            }, async () => {
                const request = await loadPendingRequestById(connection, input.requestId);
                const nowValue = Math.max(0, Math.floor(Number(now()) || Date.now()));
                await expirePendingRequests(connection, nowValue);
                if (!request || request.receiverUserId !== actor.userId || request.status !== 'pending') {
                    throw makeRequestNotFoundError();
                }
                const targetProfile = await loadProfileByUserId(connection, request.senderUserId);
                if (!targetProfile) throw makeTargetUnavailableError();
                const controls = await loadPairControls(connection, actor.userId, request.senderUserId);
                if (controls.forward.isBlocked || controls.reverse.isBlocked) {
                    await setPairPendingStatus(connection, actor.userId, request.senderUserId, 'blocked', nowValue);
                    throw makeTargetUnavailableError();
                }
                const friendship = await insertFriendship(connection, actor.userId, request.senderUserId, nowValue);
                await setPairPendingStatus(connection, actor.userId, request.senderUserId, 'accepted', nowValue);
                return {
                    reportVersion: 'social-friend-request-write-v1',
                    status: 'accepted',
                    requestId: request.requestId,
                    targetProfileId: targetProfile.profileId,
                    friendshipId: friendship && friendship.friendshipId || ''
                };
            });
        });
    }

    async function declineFriendRequest(actorInput, input = {}) {
        const envelope = normalizeWriteEnvelope(input);
        return withWriteTransaction(async (connection) => {
            const actor = await requireActor(connection, actorInput);
            return withMutation(connection, actor.userId, 'decline_friend_request', envelope, {
                requestId: String(input.requestId || '').trim(),
                protocolVersion: envelope.protocolVersion
            }, async () => {
                const request = await loadPendingRequestById(connection, input.requestId);
                const nowValue = Math.max(0, Math.floor(Number(now()) || Date.now()));
                await expirePendingRequests(connection, nowValue);
                if (!request || request.receiverUserId !== actor.userId || request.status !== 'pending') {
                    throw makeRequestNotFoundError();
                }
                await dbRun(
                    connection,
                    `UPDATE social_friend_requests
                        SET status = 'declined',
                            updated_at = ?
                      WHERE request_id = ?
                        AND receiver_user_id = ?
                        AND status = 'pending'`,
                    [nowValue, request.requestId, actor.userId]
                );
                const targetProfile = await loadProfileByUserId(connection, request.senderUserId);
                return {
                    reportVersion: 'social-friend-request-write-v1',
                    status: 'declined',
                    requestId: request.requestId,
                    targetProfileId: targetProfile && targetProfile.profileId || ''
                };
            });
        });
    }

    async function cancelFriendRequest(actorInput, input = {}) {
        const envelope = normalizeWriteEnvelope(input);
        return withWriteTransaction(async (connection) => {
            const actor = await requireActor(connection, actorInput);
            return withMutation(connection, actor.userId, 'cancel_friend_request', envelope, {
                requestId: String(input.requestId || '').trim(),
                protocolVersion: envelope.protocolVersion
            }, async () => {
                const request = await loadPendingRequestById(connection, input.requestId);
                const nowValue = Math.max(0, Math.floor(Number(now()) || Date.now()));
                await expirePendingRequests(connection, nowValue);
                if (!request || request.senderUserId !== actor.userId || request.status !== 'pending') {
                    throw makeRequestNotFoundError();
                }
                await dbRun(
                    connection,
                    `UPDATE social_friend_requests
                        SET status = 'cancelled',
                            updated_at = ?
                      WHERE request_id = ?
                        AND sender_user_id = ?
                        AND status = 'pending'`,
                    [nowValue, request.requestId, actor.userId]
                );
                const targetProfile = await loadProfileByUserId(connection, request.receiverUserId);
                return {
                    reportVersion: 'social-friend-request-write-v1',
                    status: 'cancelled',
                    requestId: request.requestId,
                    targetProfileId: targetProfile && targetProfile.profileId || ''
                };
            });
        });
    }

    async function removeFriend(actorInput, input = {}) {
        const envelope = normalizeWriteEnvelope(input);
        return withWriteTransaction(async (connection) => {
            const actor = await requireActor(connection, actorInput);
            return withMutation(connection, actor.userId, 'remove_friend', envelope, {
                profileId: normalizeProfileId(input.profileId),
                protocolVersion: envelope.protocolVersion
            }, async () => {
                const targetProfile = await loadTargetProfile(connection, { targetProfileId: input.profileId });
                if (!targetProfile) throw makeTargetUnavailableError();
                if (targetProfile.userId === actor.userId) {
                    throw makeSelfTargetError('不能删除自己');
                }
                const friendship = await loadFriendship(connection, actor.userId, targetProfile.userId);
                if (!friendship) {
                    throw makeTargetUnavailableError();
                }
                const nowValue = Math.max(0, Math.floor(Number(now()) || Date.now()));
                await deleteFriendship(connection, actor.userId, targetProfile.userId);
                await insertRequestHistory(connection, actor.userId, targetProfile.userId, 'cancelled', nowValue);
                return {
                    reportVersion: 'social-friendship-write-v1',
                    status: 'removed',
                    targetProfileId: targetProfile.profileId
                };
            });
        });
    }

    async function setRelationshipControl(actorInput, input = {}) {
        const envelope = normalizeWriteEnvelope(input);
        const action = String(input.action || input.control || '').trim().toLowerCase();
        const mapping = {
            block: { isBlocked: true, isMuted: undefined, status: 'blocked' },
            unblock: { isBlocked: false, isMuted: undefined, status: 'unblocked' },
            mute: { isBlocked: undefined, isMuted: true, status: 'muted' },
            unmute: { isBlocked: undefined, isMuted: false, status: 'unmuted' }
        };
        const nextState = mapping[action];
        if (!nextState) {
            throw makeError(400, 'invalid_relationship_control', '关系控制动作非法');
        }
        return withWriteTransaction(async (connection) => {
            const actor = await requireActor(connection, actorInput);
            return withMutation(connection, actor.userId, 'relationship_control', envelope, {
                action,
                profileId: normalizeProfileId(input.profileId),
                protocolVersion: envelope.protocolVersion
            }, async () => {
                const targetProfile = await loadTargetProfile(connection, { targetProfileId: input.profileId });
                if (!targetProfile) throw makeTargetUnavailableError();
                if (targetProfile.userId === actor.userId) {
                    throw makeSelfTargetError('不能对自己设置关系控制');
                }
                const nowValue = Math.max(0, Math.floor(Number(now()) || Date.now()));
                const control = await upsertControl(connection, actor.userId, targetProfile.userId, nextState, nowValue);
                if (nextState.isBlocked === true) {
                    await deleteFriendship(connection, actor.userId, targetProfile.userId);
                    await setPairPendingStatus(connection, actor.userId, targetProfile.userId, 'blocked', nowValue);
                }
                return {
                    reportVersion: 'social-relationship-control-v1',
                    status: nextState.status,
                    targetProfileId: targetProfile.profileId,
                    controls: makeControlSummary(control)
                };
            });
        });
    }

    async function updateSocialPreferences(actorInput, input = {}) {
        const envelope = normalizeWriteEnvelope(input);
        const updates = {};
        ['discovery', 'friendRequestPolicy', 'presenceVisibility', 'pvpInvitePolicy', 'squadInvitePolicy'].forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(input, key)) {
                updates[key] = normalizePolicyValue(key, input[key]);
            }
        });
        if (Object.keys(updates).length === 0) {
            throw makeError(400, 'invalid_social_preferences', '至少需要一个社交偏好字段');
        }
        return withWriteTransaction(async (connection) => {
            const actor = await requireActor(connection, actorInput);
            return withMutation(connection, actor.userId, 'update_social_preferences', envelope, {
                ...updates,
                protocolVersion: envelope.protocolVersion
            }, async () => {
                const nextPreferences = {
                    ...actor.profile.preferences,
                    ...updates
                };
                const nowValue = Math.max(0, Math.floor(Number(now()) || Date.now()));
                await dbRun(
                    connection,
                    `UPDATE social_profiles
                        SET discovery_policy = ?,
                            friend_request_policy = ?,
                            presence_visibility = ?,
                            pvp_invite_policy = ?,
                            squad_invite_policy = ?,
                            updated_at = ?
                      WHERE user_id = ?`,
                    [
                        nextPreferences.discovery,
                        nextPreferences.friendRequestPolicy,
                        nextPreferences.presenceVisibility,
                        nextPreferences.pvpInvitePolicy,
                        nextPreferences.squadInvitePolicy,
                        nowValue,
                        actor.userId
                    ]
                );
                return {
                    reportVersion: 'social-preferences-write-v1',
                    status: 'updated',
                    preferences: nextPreferences
                };
            });
        });
    }

    async function recordPresenceHeartbeat(actorInput, input = {}) {
        const envelope = normalizeWriteEnvelope(input);
        const activity = normalizeActivity(input.activity);
        return withWriteTransaction(async (connection) => {
            const actor = await requireActor(connection, actorInput);
            return withMutation(connection, actor.userId, 'presence_heartbeat', envelope, {
                activity,
                protocolVersion: envelope.protocolVersion
            }, async () => {
                const nowValue = Math.max(0, Math.floor(Number(now()) || Date.now()));
                await dbRun(
                    connection,
                    `INSERT INTO social_presence (user_id, activity, last_heartbeat_at, updated_at)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(user_id) DO UPDATE SET
                        activity = excluded.activity,
                        last_heartbeat_at = excluded.last_heartbeat_at,
                        updated_at = excluded.updated_at`,
                    [actor.userId, activity, nowValue, nowValue]
                );
                return {
                    reportVersion: 'social-presence-heartbeat-v1',
                    status: 'recorded',
                    activity,
                    ttlSeconds: Math.floor(PRESENCE_TTL_MS / 1000)
                };
            });
        });
    }

    async function resolveFriendlyInviteTarget(actorInput, options = {}) {
        const targetProfileId = normalizeProfileId(options.targetProfileId);
        const targetUsername = String(options.targetUsername || '').trim();
        if (!targetProfileId && !targetUsername) return null;
        return withReadConnection(async (connection) => {
            const actor = await requireActor(connection, actorInput);
            const targetProfile = await loadTargetProfile(connection, { targetProfileId, targetUsername });
            if (!targetProfile) {
                throw makeTargetUnavailableError();
            }
            if (targetProfile.userId === actor.userId) {
                throw makeError(409, 'invite_self_target', '不能邀请自己进行好友约战');
            }
            const nowValue = Math.max(0, Math.floor(Number(now()) || Date.now()));
            await expirePendingRequests(connection, nowValue, { left: actor.userId, right: targetProfile.userId });
            const friendship = await loadFriendship(connection, actor.userId, targetProfile.userId);
            const controls = await loadPairControls(connection, actor.userId, targetProfile.userId);
            if (!friendship || controls.forward.isBlocked || controls.reverse.isBlocked) {
                throw makeTargetUnavailableError();
            }
            if (!checkPvpInviteAllowed(targetProfile, true)) {
                throw makeTargetUnavailableError();
            }
            return {
                userId: targetProfile.userId,
                profileId: targetProfile.profileId,
                displayName: targetProfile.username
            };
        });
    }

    async function assertFriendlyInviteJoinAllowed(hostInput, guestInput, options = {}) {
        const hostUserId = normalizeOptionalUserId(hostInput);
        const guestUserId = normalizeOptionalUserId(guestInput);
        if (!hostUserId || !guestUserId || hostUserId === guestUserId) {
            throw makeTargetUnavailableError();
        }
        return withReadConnection(async (connection) => {
            const guestUser = await loadUserById(connection, guestUserId);
            if (!guestUser) throw makeTargetUnavailableError();
            const targetProfile = await ensureProfileForUser(connection, guestUser);
            const friendship = await loadFriendship(connection, hostUserId, guestUserId);
            const controls = await loadPairControls(connection, hostUserId, guestUserId);
            if (controls.forward.isBlocked || controls.reverse.isBlocked) {
                throw makeTargetUnavailableError();
            }
            if (options.targeted && (!friendship || !checkPvpInviteAllowed(targetProfile, true))) {
                throw makeTargetUnavailableError();
            }
            return {
                userId: targetProfile.userId,
                profileId: targetProfile.profileId,
                displayName: targetProfile.username
            };
        });
    }

    async function assertRiftSquadInviteAllowed(connection, options = {}) {
        const inviterUserId = normalizeOptionalUserId(options.inviterUserId);
        const inviteeUserId = normalizeOptionalUserId(options.inviteeUserId);
        if (!connection || !inviterUserId || !inviteeUserId || inviterUserId === inviteeUserId) {
            throw makeTargetUnavailableError();
        }
        const targetProfile = await loadProfileByUserId(connection, inviteeUserId);
        const friendship = await loadFriendship(connection, inviterUserId, inviteeUserId);
        const controls = await loadPairControls(connection, inviterUserId, inviteeUserId);
        if (!targetProfile || !friendship || controls.forward.isBlocked || controls.reverse.isBlocked
            || targetProfile.preferences.squadInvitePolicy !== 'friends') {
            throw makeTargetUnavailableError();
        }
        return {
            userId: targetProfile.userId,
            profileId: targetProfile.profileId,
            displayName: targetProfile.username,
            squadInvitePolicy: targetProfile.preferences.squadInvitePolicy
        };
    }

    async function isFriendPair(leftInput, rightInput) {
        const leftUserId = normalizeOptionalUserId(leftInput);
        const rightUserId = normalizeOptionalUserId(rightInput);
        if (!leftUserId || !rightUserId || leftUserId === rightUserId) return false;
        return withReadConnection(async (connection) => {
            const friendship = await loadFriendship(connection, leftUserId, rightUserId);
            const controls = await loadPairControls(connection, leftUserId, rightUserId);
            if (controls.forward.isBlocked || controls.reverse.isBlocked) return false;
            return !!friendship;
        });
    }

    return {
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
        isFriendPair,
        __constants: {
            SOCIAL_PROTOCOL_VERSION,
            FRIEND_REQUEST_TTL_MS,
            FRIEND_REQUEST_COOLDOWN_MS,
            PRESENCE_HEARTBEAT_INTERVAL_MS,
            PRESENCE_TTL_MS,
            PRESENCE_RECENT_MS
        }
    };
}

let defaultService = null;

function getDefaultService() {
    if (!defaultService) {
        defaultService = createSocialService();
    }
    return defaultService;
}

module.exports = {
    createSocialService,
    SOCIAL_PROTOCOL_VERSION,
    getSocialDashboard(...args) {
        return getDefaultService().getSocialDashboard(...args);
    },
    searchProfile(...args) {
        return getDefaultService().searchProfile(...args);
    },
    sendFriendRequest(...args) {
        return getDefaultService().sendFriendRequest(...args);
    },
    acceptFriendRequest(...args) {
        return getDefaultService().acceptFriendRequest(...args);
    },
    declineFriendRequest(...args) {
        return getDefaultService().declineFriendRequest(...args);
    },
    cancelFriendRequest(...args) {
        return getDefaultService().cancelFriendRequest(...args);
    },
    removeFriend(...args) {
        return getDefaultService().removeFriend(...args);
    },
    setRelationshipControl(...args) {
        return getDefaultService().setRelationshipControl(...args);
    },
    updateSocialPreferences(...args) {
        return getDefaultService().updateSocialPreferences(...args);
    },
    recordPresenceHeartbeat(...args) {
        return getDefaultService().recordPresenceHeartbeat(...args);
    },
    resolveFriendlyInviteTarget(...args) {
        return getDefaultService().resolveFriendlyInviteTarget(...args);
    },
    assertFriendlyInviteJoinAllowed(...args) {
        return getDefaultService().assertFriendlyInviteJoinAllowed(...args);
    },
    assertRiftSquadInviteAllowed(...args) {
        return getDefaultService().assertRiftSquadInviteAllowed(...args);
    },
    isFriendPair(...args) {
        return getDefaultService().isFriendPair(...args);
    }
};
