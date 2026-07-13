const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const { db, dbPath } = require('../db/database');
const { bootstrapAccountSocialSchema } = require('./bootstrap');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LAST_SEEN_UPDATE_INTERVAL_MS = 5 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const USER_LOGIN_LIMIT = 5;
const IP_LOGIN_LIMIT = 30;
const PASSWORD_MIN_BYTES = 8;
const PASSWORD_MAX_BYTES = 72;
const PASSWORD_MIN_CATEGORIES = 2;
const BCRYPT_ROUNDS = 10;
const DUMMY_BCRYPT_HASH = '$2b$10$uzRGd1WvqSu59wZe1sTomeHjQoMrpQxtG4ZKWcSoDkSm.xeXKhymu';
const USERNAME_ALLOWED_PATTERN = /^[\p{L}\p{N}_-]+$/u;
const SAFE_MUTATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

let schemaBootstrapPromise = null;

function makeError(status, reason, message, extra = {}) {
    const error = new Error(message);
    error.status = status;
    error.reason = reason;
    Object.assign(error, extra);
    return error;
}

function makeRegistrationUnavailableError() {
    return makeError(400, 'registration_unavailable', '注册未完成');
}

function getJwtSecret() {
    return process.env.JWT_SECRET || 'the-defier-local-dev-secret';
}

function getHashSecret() {
    const hmacSecret = String(process.env.DEFIER_HMAC_SECRET || '').trim();
    if (hmacSecret.length >= 32) return hmacSecret;
    return getJwtSecret();
}

function stableStringify(value) {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(',')}]`;
    if (typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function hashValue(scope, value) {
    return crypto
        .createHmac('sha256', getHashSecret())
        .update(String(scope || ''), 'utf8')
        .update('\n', 'utf8')
        .update(String(value || ''), 'utf8')
        .digest('hex');
}

function normalizeUsername(value) {
    return String(value || '')
        .normalize('NFKC')
        .trim()
        .toLowerCase();
}

function normalizeDisplayUsername(value) {
    return String(value || '')
        .normalize('NFKC')
        .trim();
}

function validateUsernamePolicy(username) {
    const displayUsername = normalizeDisplayUsername(username);
    const normalizedUsername = normalizeUsername(username);
    const codePointLength = [...normalizedUsername].length;
    if (!displayUsername || !normalizedUsername) {
        return {
            ok: false,
            reason: 'invalid_username_policy',
            message: '用户名不能为空'
        };
    }
    if (codePointLength < 3 || codePointLength > 24) {
        return {
            ok: false,
            reason: 'invalid_username_policy',
            message: '用户名长度需为 3 到 24 个字符'
        };
    }
    if (!USERNAME_ALLOWED_PATTERN.test(displayUsername)) {
        return {
            ok: false,
            reason: 'invalid_username_policy',
            message: '用户名仅支持字母、数字、下划线和连字符'
        };
    }
    return {
        ok: true,
        displayUsername,
        normalizedUsername
    };
}

function validatePasswordPolicy(password, options = {}) {
    const normalizedUsername = typeof options === 'string'
        ? normalizeUsername(options)
        : normalizeUsername(options.normalizedUsername || options.username || '');
    const passwordText = typeof password === 'string' ? password : String(password || '');
    const byteLength = Buffer.byteLength(passwordText, 'utf8');
    if (byteLength < PASSWORD_MIN_BYTES || byteLength > PASSWORD_MAX_BYTES) {
        return {
            ok: false,
            reason: 'invalid_password_policy',
            message: `密码长度需为 ${PASSWORD_MIN_BYTES}-${PASSWORD_MAX_BYTES} 字节`,
            byteLength
        };
    }
    const hasLetter = /\p{L}/u.test(passwordText);
    const hasDigit = /\p{N}/u.test(passwordText);
    const hasSymbol = /[^\p{L}\p{N}]/u.test(passwordText);
    const categoryCount = [hasLetter, hasDigit, hasSymbol].filter(Boolean).length;
    if (categoryCount < PASSWORD_MIN_CATEGORIES) {
        return {
            ok: false,
            reason: 'invalid_password_policy',
            message: '密码至少包含两类字符：字母、数字、符号',
            byteLength
        };
    }
    if (normalizedUsername && normalizeUsername(passwordText) === normalizedUsername) {
        return {
            ok: false,
            reason: 'invalid_password_policy',
            message: '密码不能与用户名相同',
            byteLength
        };
    }
    const passwordChars = [...passwordText];
    if (passwordChars.length > 0 && passwordChars.every(char => char === passwordChars[0])) {
        return {
            ok: false,
            reason: 'invalid_password_policy',
            message: '密码不能由同一字符重复组成',
            byteLength
        };
    }
    return {
        ok: true,
        byteLength,
        categoryCount
    };
}

function sanitizeDeviceName(value) {
    const text = String(value || '')
        .replace(/[\u0000-\u001F\u007F]+/g, ' ')
        .trim();
    return text.slice(0, 64) || 'Current device';
}

function resolveDeviceId(value) {
    const text = String(value || '').trim();
    if (SAFE_DEVICE_ID_PATTERN.test(text)) return text;
    return crypto.randomUUID();
}

function extractIpAddress(input) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    return raw.split(',')[0].trim();
}

function getIpPrefix(ipAddress) {
    const raw = extractIpAddress(ipAddress)
        .replace(/^\[|\]$/g, '');
    if (!raw) return 'unknown';
    const normalized = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) {
        const parts = normalized.split('.');
        return `ipv4:${parts.slice(0, 3).join('.')}`;
    }
    const segments = normalized.toLowerCase().split(':').filter(Boolean);
    if (segments.length > 0) {
        return `ipv6:${segments.slice(0, 4).join(':')}`;
    }
    return `raw:${normalized}`;
}

function sanitizeUserAgent(value) {
    return String(value || '')
        .replace(/[\u0000-\u001F\u007F]+/g, ' ')
        .trim()
        .slice(0, 256);
}

function openConnection() {
    const connection = new sqlite3.Database(dbPath);
    connection.configure('busyTimeout', Number(process.env.DEFIER_SQLITE_BUSY_TIMEOUT_MS || 5000));
    return connection;
}

function dbRun(connection, sql, params = []) {
    return new Promise((resolve, reject) => {
        connection.run(sql, params, function onRun(error) {
            if (error) reject(error);
            else {
                resolve({
                    changes: Number(this && this.changes || 0),
                    lastID: Number(this && this.lastID || 0)
                });
            }
        });
    });
}

function dbGet(connection, sql, params = []) {
    return new Promise((resolve, reject) => {
        connection.get(sql, params, (error, row) => {
            if (error) reject(error);
            else resolve(row || null);
        });
    });
}

function dbAll(connection, sql, params = []) {
    return new Promise((resolve, reject) => {
        connection.all(sql, params, (error, rows) => {
            if (error) reject(error);
            else resolve(rows || []);
        });
    });
}

function closeConnection(connection) {
    return new Promise((resolve, reject) => {
        connection.close(error => {
            if (error) reject(error);
            else resolve();
        });
    });
}

async function withConnection(fn) {
    const connection = openConnection();
    try {
        return await fn(connection);
    } finally {
        await closeConnection(connection);
    }
}

async function withImmediateTransaction(fn) {
    const connection = openConnection();
    try {
        await dbRun(connection, 'BEGIN IMMEDIATE');
        const result = await fn(connection);
        await dbRun(connection, 'COMMIT');
        return result;
    } catch (error) {
        try {
            await dbRun(connection, 'ROLLBACK');
        } catch (rollbackError) {}
        throw error;
    } finally {
        await closeConnection(connection);
    }
}

async function ensureSchemaReady() {
    if (!schemaBootstrapPromise) {
        schemaBootstrapPromise = bootstrapAccountSocialSchema(db).catch(error => {
            schemaBootstrapPromise = null;
            throw error;
        });
    }
    return schemaBootstrapPromise;
}

function makeSessionTokenPayload(user, sessionId, authVersion) {
    return {
        id: user.id,
        username: user.username,
        sid: sessionId,
        av: authVersion
    };
}

function signPersistentSessionToken(user, sessionId, authVersion) {
    return jwt.sign(
        makeSessionTokenPayload(user, sessionId, authVersion),
        getJwtSecret(),
        { expiresIn: '30d' }
    );
}

function makeAuthResponse(user, token, sessionRow) {
    const session = sessionRow
        ? {
            sessionId: sessionRow.session_id,
            deviceName: sessionRow.device_name,
            createdAt: Number(sessionRow.created_at) || 0,
            lastSeenAt: Number(sessionRow.last_seen_at) || 0,
            expiresAt: Number(sessionRow.expires_at) || 0,
            current: true,
            legacy: false
        }
        : null;
    return {
        success: true,
        token,
        sessionToken: token,
        user: {
            id: user.id,
            objectId: user.id,
            username: user.username,
            sessionToken: token,
            sessionId: session ? session.sessionId : null,
            authVersion: Math.max(1, Math.floor(Number(user.auth_version) || 1))
        },
        session
    };
}

function makeSecurityEventPayload(eventType, payload = {}) {
    return stableStringify({
        eventType: String(eventType || ''),
        ...payload
    });
}

async function appendSecurityEvent(connection, {
    userId = null,
    sessionId = '',
    eventType,
    payload = {},
    now = Date.now()
}) {
    const eventId = crypto.randomUUID();
    await dbRun(
        connection,
        `INSERT INTO auth_security_events (
            event_id,
            user_id,
            session_id,
            event_type,
            event_payload_json,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
            eventId,
            userId,
            String(sessionId || ''),
            String(eventType || ''),
            makeSecurityEventPayload(eventType, payload),
            now
        ]
    );
}

async function bumpSecurityCounter(connection, counterKey, delta = 1, now = Date.now()) {
    await dbRun(
        connection,
        `INSERT INTO auth_security_counters (counter_key, counter_value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(counter_key) DO UPDATE SET
            counter_value = auth_security_counters.counter_value + excluded.counter_value,
            updated_at = excluded.updated_at`,
        [String(counterKey || ''), Number(delta) || 0, now]
    );
}

function makeMutationHash(payload) {
    return crypto.createHash('sha256').update(stableStringify(payload), 'utf8').digest('hex');
}

function assertMutationId(value) {
    const text = String(value || '').trim();
    if (!SAFE_MUTATION_ID_PATTERN.test(text)) {
        throw makeError(400, 'invalid_mutation_id', 'mutationId 无效');
    }
    return text;
}

async function loadStoredMutation(connection, userId, mutationId, operation) {
    return dbGet(
        connection,
        `SELECT user_id, mutation_id, operation, request_hash, response_json, status_code
         FROM auth_security_mutations
         WHERE user_id = ? AND mutation_id = ? AND operation = ?`,
        [userId, mutationId, operation]
    );
}

function parseStoredResponse(row) {
    try {
        return JSON.parse(row && row.response_json ? row.response_json : '{}');
    } catch (error) {
        return { success: false, reason: 'corrupt_stored_response' };
    }
}

async function readOrReserveMutation(connection, {
    userId,
    mutationId,
    operation,
    requestPayload
}) {
    const stored = await loadStoredMutation(connection, userId, mutationId, operation);
    const requestHash = makeMutationHash(requestPayload);
    if (!stored) {
        return { requestHash, stored: null };
    }
    if (String(stored.request_hash || '') !== requestHash) {
        throw makeError(409, 'mutation_reused', 'mutationId 已被其他请求体占用');
    }
    return {
        requestHash,
        stored: {
            status: Number(stored.status_code) || 200,
            response: parseStoredResponse(stored)
        }
    };
}

async function storeMutationResponse(connection, {
    userId,
    mutationId,
    operation,
    requestHash,
    response,
    status = 200,
    now = Date.now()
}) {
    await dbRun(
        connection,
        `INSERT INTO auth_security_mutations (
            user_id,
            mutation_id,
            operation,
            request_hash,
            response_json,
            status_code,
            created_at,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, mutation_id, operation) DO UPDATE SET
            response_json = excluded.response_json,
            status_code = excluded.status_code,
            updated_at = excluded.updated_at`,
        [
            userId,
            mutationId,
            operation,
            requestHash,
            JSON.stringify(response),
            status,
            now,
            now
        ]
    );
}

async function purgeExpiredLoginBuckets(connection, now) {
    await dbRun(
        connection,
        `DELETE FROM auth_login_limits
         WHERE expires_at > 0 AND expires_at <= ?`,
        [now]
    );
}

function makeLoginBucketKeys({ normalizedUsername, ipPrefix }) {
    return {
        userBucketKey: normalizedUsername
            ? hashValue('auth:user_ip', `${normalizedUsername}\n${ipPrefix}`)
            : '',
        ipBucketKey: hashValue('auth:ip', ipPrefix)
    };
}

function parseLoginBucket(row) {
    return row
        ? {
            bucketKey: String(row.bucket_key || ''),
            scope: String(row.scope || ''),
            failures: Math.max(0, Math.floor(Number(row.failures) || 0)),
            blockedUntil: Math.max(0, Math.floor(Number(row.blocked_until) || 0)),
            windowStartedAt: Math.max(0, Math.floor(Number(row.window_started_at) || 0)),
            lastFailedAt: Math.max(0, Math.floor(Number(row.last_failed_at) || 0)),
            expiresAt: Math.max(0, Math.floor(Number(row.expires_at) || 0))
        }
        : null;
}

function computeRetryAfterSeconds(buckets, now) {
    const blockedUntil = buckets
        .map(bucket => Math.max(0, bucket && bucket.blockedUntil || 0))
        .reduce((max, value) => Math.max(max, value), 0);
    if (blockedUntil <= now) return 0;
    return Math.max(1, Math.ceil((blockedUntil - now) / 1000));
}

async function loadBucketByKey(connection, bucketKey) {
    if (!bucketKey) return null;
    const row = await dbGet(
        connection,
        `SELECT bucket_key, scope, failures, window_started_at, last_failed_at, blocked_until, expires_at
         FROM auth_login_limits
         WHERE bucket_key = ?`,
        [bucketKey]
    );
    return parseLoginBucket(row);
}

async function upsertFailedBucket(connection, {
    bucketKey,
    scope,
    limit,
    now
}) {
    if (!bucketKey) return null;
    const existing = await loadBucketByKey(connection, bucketKey);
    const withinWindow = existing && (now - existing.windowStartedAt) < LOGIN_WINDOW_MS;
    const failures = withinWindow
        ? existing.failures + 1
        : 1;
    const windowStartedAt = withinWindow
        ? existing.windowStartedAt
        : now;
    const blockedUntil = failures >= limit
        ? Math.max(existing && existing.blockedUntil || 0, now + LOGIN_BLOCK_MS)
        : Math.max(existing && existing.blockedUntil || 0, 0);
    const expiresAt = Math.max(windowStartedAt + LOGIN_WINDOW_MS, blockedUntil) + LOGIN_RETENTION_MS;
    await dbRun(
        connection,
        `INSERT INTO auth_login_limits (
            bucket_key,
            scope,
            failures,
            window_started_at,
            last_failed_at,
            blocked_until,
            expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(bucket_key) DO UPDATE SET
            scope = excluded.scope,
            failures = excluded.failures,
            window_started_at = excluded.window_started_at,
            last_failed_at = excluded.last_failed_at,
            blocked_until = excluded.blocked_until,
            expires_at = excluded.expires_at`,
        [bucketKey, scope, failures, windowStartedAt, now, blockedUntil, expiresAt]
    );
    return {
        bucketKey,
        scope,
        failures,
        blockedUntil,
        windowStartedAt
    };
}

async function clearUserLoginBucket(connection, bucketKey) {
    if (!bucketKey) return;
    await dbRun(connection, `DELETE FROM auth_login_limits WHERE bucket_key = ?`, [bucketKey]);
}

async function findConflictingUser(connection, normalizedUsername, displayUsername) {
    const rows = await dbAll(
        connection,
        `SELECT id, username, username_normalized
         FROM users`
    );
    for (const row of rows) {
        const currentNormalized = normalizeUsername(row && row.username);
        if (String(row && row.username || '') === String(displayUsername || '')) return row;
        if (String(row && row.username_normalized || '') === String(normalizedUsername || '')) return row;
        if (currentNormalized && currentNormalized === normalizedUsername) return row;
    }
    return null;
}

async function resolveUserForLogin(connection, usernameInput) {
    const rawInput = String(usernameInput || '');
    const trimmedInput = rawInput.trim();
    const candidates = [rawInput];
    if (trimmedInput && trimmedInput !== rawInput) candidates.push(trimmedInput);

    for (const candidate of candidates) {
        const exactUser = await dbGet(
            connection,
            `SELECT id, username, username_normalized, password_hash, auth_version, password_changed_at, disabled_at, created_at
             FROM users
             WHERE username = ?
             LIMIT 1`,
            [candidate]
        );
        if (exactUser) return exactUser;
    }

    const normalizedUsername = normalizeUsername(rawInput);
    if (!normalizedUsername) return null;
    return dbGet(
        connection,
        `SELECT id, username, username_normalized, password_hash, auth_version, password_changed_at, disabled_at, created_at
         FROM users
         WHERE username_normalized = ?
         LIMIT 1`,
        [normalizedUsername]
    );
}

function makeSessionMetadata({ deviceId, deviceName, ipAddress, userAgent }) {
    const ipPrefix = getIpPrefix(ipAddress);
    const safeUserAgent = sanitizeUserAgent(userAgent);
    return {
        deviceId,
        deviceName: sanitizeDeviceName(deviceName),
        deviceIdHash: hashValue('auth:device', deviceId),
        ipPrefix,
        ipHash: hashValue('auth:ip_prefix', ipPrefix),
        userAgentHash: hashValue('auth:user_agent', safeUserAgent)
    };
}

async function createPersistentSession(connection, {
    user,
    authVersion,
    deviceId,
    deviceName,
    ipAddress,
    userAgent,
    now = Date.now()
}) {
    const sessionId = crypto.randomUUID();
    const metadata = makeSessionMetadata({
        deviceId: resolveDeviceId(deviceId),
        deviceName,
        ipAddress,
        userAgent
    });
    const expiresAt = now + SESSION_TTL_MS;
    await dbRun(
        connection,
        `INSERT INTO auth_sessions (
            session_id,
            user_id,
            auth_version,
            device_id_hash,
            device_name,
            ip_hash,
            user_agent_hash,
            created_at,
            updated_at,
            last_seen_at,
            expires_at,
            revoked_at,
            revoke_reason,
            replaced_by_session_id,
            metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', '', ?)`,
        [
            sessionId,
            user.id,
            authVersion,
            metadata.deviceIdHash,
            metadata.deviceName,
            metadata.ipHash,
            metadata.userAgentHash,
            now,
            now,
            now,
            expiresAt,
            JSON.stringify({
                deviceIdHash: metadata.deviceIdHash,
                ipPrefixHash: metadata.ipHash,
                userAgentHash: metadata.userAgentHash
            })
        ]
    );
    const sessionRow = await dbGet(
        connection,
        `SELECT session_id, device_name, created_at, last_seen_at, expires_at
         FROM auth_sessions
         WHERE session_id = ?`,
        [sessionId]
    );
    const token = signPersistentSessionToken(user, sessionId, authVersion);
    return {
        token,
        sessionRow
    };
}

function parseJwtToken(token) {
    try {
        return { ok: true, decoded: jwt.verify(token, getJwtSecret()) };
    } catch (error) {
        return { ok: false, error };
    }
}

async function touchSessionLastSeen(sessionId, now) {
    if (!sessionId) return;
    await withConnection(async connection => {
        await dbRun(
            connection,
            `UPDATE auth_sessions
             SET last_seen_at = ?, updated_at = ?
             WHERE session_id = ? AND last_seen_at <= ?`,
            [now, now, sessionId, now - LAST_SEEN_UPDATE_INTERVAL_MS]
        );
    });
}

function buildCurrentSessionPayload(sessionRow) {
    return {
        sessionId: sessionRow.session_id,
        deviceName: sessionRow.device_name,
        createdAt: Number(sessionRow.created_at) || 0,
        lastSeenAt: Number(sessionRow.last_seen_at) || 0,
        expiresAt: Number(sessionRow.expires_at) || 0,
        current: true,
        legacy: false
    };
}

function buildDeviceSessionPayload(sessionRow, currentSessionId) {
    return {
        sessionId: sessionRow.session_id,
        deviceName: sessionRow.device_name,
        createdAt: Number(sessionRow.created_at) || 0,
        lastSeenAt: Number(sessionRow.last_seen_at) || 0,
        expiresAt: Number(sessionRow.expires_at) || 0,
        current: String(sessionRow.session_id || '') === String(currentSessionId || ''),
        legacy: false
    };
}

function shouldAllowEphemeralLegacyTokenWithoutUser() {
    return String(process.env.NODE_ENV || '').toLowerCase() !== 'production';
}

async function validateAuthenticatedSession({
    token,
    now = Date.now()
}) {
    await ensureSchemaReady();
    const parsed = parseJwtToken(token);
    if (!parsed.ok) {
        throw makeError(401, 'invalid_token', 'Token无效或已过期');
    }

    return withConnection(async connection => {
        const decoded = parsed.decoded || {};
        const userId = String(decoded.id || '').trim();
        const username = String(decoded.username || '').trim();
        if (!userId || !username) {
            throw makeError(401, 'invalid_token', 'Token无效或已过期');
        }

        const user = await dbGet(
            connection,
            `SELECT id, username, username_normalized, password_hash, auth_version, password_changed_at, disabled_at
             FROM users
             WHERE id = ?
             LIMIT 1`,
            [userId]
        );

        if (!decoded.sid) {
            if (!user) {
                if (shouldAllowEphemeralLegacyTokenWithoutUser()) {
                    return {
                        user: { id: userId, username },
                        currentSession: null,
                        isLegacy: true
                    };
                }
                throw makeError(401, 'session_revoked', '会话已失效，请重新登录');
            }
            if (Math.max(1, Math.floor(Number(user.auth_version) || 1)) !== 1
                || Math.max(0, Math.floor(Number(user.password_changed_at) || 0)) > 0
                || Math.max(0, Math.floor(Number(user.disabled_at) || 0)) > 0) {
                throw makeError(401, 'session_revoked', '会话已失效，请重新登录');
            }
            return {
                user: { id: user.id, username: user.username },
                currentSession: null,
                isLegacy: true
            };
        }

        if (!user || Math.max(0, Math.floor(Number(user.disabled_at) || 0)) > 0) {
            throw makeError(401, 'session_revoked', '会话已失效，请重新登录');
        }

        const authVersion = Math.max(1, Math.floor(Number(user.auth_version) || 1));
        if (Math.floor(Number(decoded.av) || 0) !== authVersion) {
            throw makeError(401, 'session_revoked', '会话已失效，请重新登录');
        }

        const sessionRow = await dbGet(
            connection,
            `SELECT session_id, user_id, auth_version, device_name, created_at, last_seen_at, expires_at, revoked_at
             FROM auth_sessions
             WHERE session_id = ?
             LIMIT 1`,
            [decoded.sid]
        );
        if (!sessionRow
            || String(sessionRow.user_id || '') !== user.id
            || Math.max(1, Math.floor(Number(sessionRow.auth_version) || 1)) !== authVersion
            || Math.max(0, Math.floor(Number(sessionRow.revoked_at) || 0)) > 0
            || Math.max(0, Math.floor(Number(sessionRow.expires_at) || 0)) <= now) {
            throw makeError(401, 'session_revoked', '会话已失效，请重新登录');
        }

        if ((now - Math.max(0, Math.floor(Number(sessionRow.last_seen_at) || 0))) >= LAST_SEEN_UPDATE_INTERVAL_MS) {
            await touchSessionLastSeen(String(sessionRow.session_id || ''), now);
            sessionRow.last_seen_at = now;
        }

        return {
            user: { id: user.id, username: user.username },
            currentSession: buildCurrentSessionPayload(sessionRow),
            isLegacy: false
        };
    });
}

async function registerAccount({
    username,
    password,
    deviceId,
    deviceName,
    ipAddress,
    userAgent,
    now = Date.now()
}) {
    await ensureSchemaReady();
    const usernameValidation = validateUsernamePolicy(username);
    if (!usernameValidation.ok) {
        throw makeRegistrationUnavailableError();
    }
    const passwordValidation = validatePasswordPolicy(password, {
        normalizedUsername: usernameValidation.normalizedUsername
    });
    if (!passwordValidation.ok) {
        throw makeRegistrationUnavailableError();
    }
    const passwordHash = await bcrypt.hash(String(password || ''), BCRYPT_ROUNDS);

    return withImmediateTransaction(async connection => {
        const conflict = await findConflictingUser(
            connection,
            usernameValidation.normalizedUsername,
            usernameValidation.displayUsername
        );
        if (conflict) {
            throw makeRegistrationUnavailableError();
        }

        const user = {
            id: crypto.randomUUID(),
            username: usernameValidation.displayUsername,
            auth_version: 1
        };
        try {
            await dbRun(
                connection,
                `INSERT INTO users (
                    id,
                    username,
                    username_normalized,
                    password_hash,
                    global_data,
                    created_at,
                    global_updated_at,
                    auth_version,
                    password_changed_at,
                    disabled_at
                ) VALUES (?, ?, ?, ?, NULL, ?, 0, 1, 0, 0)`,
                [
                    user.id,
                    user.username,
                    usernameValidation.normalizedUsername,
                    passwordHash,
                    now
                ]
            );
        } catch (error) {
            if (/SQLITE_CONSTRAINT/i.test(String(error && error.code || error && error.message || ''))) {
                throw makeRegistrationUnavailableError();
            }
            throw error;
        }

        const issued = await createPersistentSession(connection, {
            user,
            authVersion: 1,
            deviceId,
            deviceName,
            ipAddress,
            userAgent,
            now
        });
        await appendSecurityEvent(connection, {
            userId: user.id,
            sessionId: issued.sessionRow && issued.sessionRow.session_id,
            eventType: 'register',
            payload: {
                deviceName: issued.sessionRow && issued.sessionRow.device_name || sanitizeDeviceName(deviceName)
            },
            now
        });
        await bumpSecurityCounter(connection, 'auth:register_success', 1, now);
        return makeAuthResponse(user, issued.token, issued.sessionRow);
    });
}

async function loginAccount({
    username,
    password,
    deviceId,
    deviceName,
    ipAddress,
    userAgent,
    now = Date.now()
}) {
    await ensureSchemaReady();
    const rawUsername = String(username || '');
    const passwordText = String(password || '');
    if (!rawUsername.trim() || !passwordText) {
        throw makeError(400, 'missing_required_fields', '用户名和密码不能为空');
    }

    const ipPrefix = getIpPrefix(ipAddress);
    const normalizedInput = normalizeUsername(rawUsername);

    return withConnection(async connection => {
        await purgeExpiredLoginBuckets(connection, now);
        const initialBucketKeys = makeLoginBucketKeys({
            normalizedUsername: normalizedInput,
            ipPrefix
        });
        const ipBucket = await loadBucketByKey(connection, initialBucketKeys.ipBucketKey);
        const user = await resolveUserForLogin(connection, rawUsername);
        const effectiveNormalizedUsername = String(user && user.username_normalized || normalizedInput || '');
        const userBucketKey = effectiveNormalizedUsername
            ? makeLoginBucketKeys({
                normalizedUsername: effectiveNormalizedUsername,
                ipPrefix
            }).userBucketKey
            : '';
        const userBucket = await loadBucketByKey(connection, userBucketKey);

        const blockedBuckets = [ipBucket, userBucket].filter(bucket => bucket && bucket.blockedUntil > now);
        if (blockedBuckets.length > 0) {
            throw makeError(429, 'auth_rate_limited', '登录尝试过于频繁', {
                retryAfterSeconds: computeRetryAfterSeconds(blockedBuckets, now)
            });
        }

        const passwordHash = String(user && user.password_hash || DUMMY_BCRYPT_HASH);
        const passwordMatches = await bcrypt.compare(passwordText, passwordHash);
        const userDisabled = Math.max(0, Math.floor(Number(user && user.disabled_at || 0))) > 0;
        if (!user || userDisabled || !passwordMatches) {
            const failedAttempt = await withImmediateTransaction(async failedConnection => {
                await purgeExpiredLoginBuckets(failedConnection, now);
                const actualUserBucketKey = effectiveNormalizedUsername
                    ? makeLoginBucketKeys({
                        normalizedUsername: effectiveNormalizedUsername,
                        ipPrefix
                    }).userBucketKey
                    : '';
                const updatedUserBucket = await upsertFailedBucket(failedConnection, {
                    bucketKey: actualUserBucketKey,
                    scope: 'user_ip',
                    limit: USER_LOGIN_LIMIT,
                    now
                });
                const updatedIpBucket = await upsertFailedBucket(failedConnection, {
                    bucketKey: initialBucketKeys.ipBucketKey,
                    scope: 'ip',
                    limit: IP_LOGIN_LIMIT,
                    now
                });
                if (user) {
                    await appendSecurityEvent(failedConnection, {
                        userId: user.id,
                        eventType: 'login_failed',
                        payload: {},
                        now
                    });
                    await bumpSecurityCounter(failedConnection, 'auth:login_failed', 1, now);
                }
                return {
                    updatedUserBucket,
                    updatedIpBucket
                };
            });
            const rateLimited = [failedAttempt.updatedUserBucket, failedAttempt.updatedIpBucket]
                .filter(bucket => bucket && bucket.blockedUntil > now);
            if (rateLimited.length > 0) {
                throw makeError(429, 'auth_rate_limited', '登录尝试过于频繁', {
                    retryAfterSeconds: computeRetryAfterSeconds(rateLimited, now)
                });
            }
            throw makeError(401, 'auth_failed', '用户名或密码错误');
        }

        return withImmediateTransaction(async successConnection => {
            const freshUser = await resolveUserForLogin(successConnection, rawUsername);
            if (!freshUser || Math.max(0, Math.floor(Number(freshUser.disabled_at) || 0)) > 0) {
                throw makeError(401, 'auth_failed', '用户名或密码错误');
            }
            const authVersion = Math.max(1, Math.floor(Number(freshUser.auth_version) || 1));
            const issued = await createPersistentSession(successConnection, {
                user: freshUser,
                authVersion,
                deviceId,
                deviceName,
                ipAddress,
                userAgent,
                now
            });
            await clearUserLoginBucket(successConnection, userBucketKey);
            await appendSecurityEvent(successConnection, {
                userId: freshUser.id,
                sessionId: issued.sessionRow && issued.sessionRow.session_id,
                eventType: 'login_success',
                payload: {
                    deviceName: issued.sessionRow && issued.sessionRow.device_name || sanitizeDeviceName(deviceName)
                },
                now
            });
            await bumpSecurityCounter(successConnection, 'auth:login_success', 1, now);
            return makeAuthResponse(freshUser, issued.token, issued.sessionRow);
        });
    });
}

async function getSecurityOverview({
    userId,
    currentSessionId = null,
    isLegacy = false,
    now = Date.now()
}) {
    await ensureSchemaReady();
    return withConnection(async connection => {
        const user = await dbGet(
            connection,
            `SELECT id, username, auth_version
             FROM users
             WHERE id = ?
             LIMIT 1`,
            [userId]
        );
        if (!user) {
            throw makeError(401, 'session_revoked', '会话已失效，请重新登录');
        }

        const sessionRows = await dbAll(
            connection,
            `SELECT session_id, device_name, created_at, last_seen_at, expires_at
             FROM auth_sessions
             WHERE user_id = ?
               AND revoked_at = 0
               AND expires_at > ?
             ORDER BY created_at DESC`,
            [userId, now]
        );
        const currentSession = isLegacy
            ? {
                sessionId: null,
                deviceName: 'Legacy JWT',
                createdAt: 0,
                lastSeenAt: 0,
                expiresAt: 0,
                current: true,
                legacy: true
            }
            : (() => {
                const match = sessionRows.find(row => String(row.session_id || '') === String(currentSessionId || ''));
                return match ? buildCurrentSessionPayload(match) : null;
            })();

        const recentEvents = await dbAll(
            connection,
            `SELECT event_id, session_id, event_type, event_payload_json, created_at
             FROM auth_security_events
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT 20`,
            [userId]
        );
        return {
            success: true,
            passwordPolicy: {
                minBytes: PASSWORD_MIN_BYTES,
                maxBytes: PASSWORD_MAX_BYTES,
                minCategories: PASSWORD_MIN_CATEGORIES,
                bcryptRounds: BCRYPT_ROUNDS
            },
            currentSession,
            sessions: sessionRows.map(row => buildDeviceSessionPayload(row, currentSessionId)),
            recentEvents: recentEvents.map(row => {
                let payload = {};
                try {
                    payload = row.event_payload_json ? JSON.parse(row.event_payload_json) : {};
                } catch (error) {
                    payload = {};
                }
                return {
                    eventId: row.event_id,
                    sessionId: row.session_id || '',
                    eventType: row.event_type,
                    createdAt: Number(row.created_at) || 0,
                    payload
                };
            })
        };
    });
}

async function revokeAllSessionsForUser(connection, userId, reason, now, replacedBySessionId = '') {
    const rows = await dbAll(
        connection,
        `SELECT session_id
         FROM auth_sessions
         WHERE user_id = ?
           AND revoked_at = 0`,
        [userId]
    );
    await dbRun(
        connection,
        `UPDATE auth_sessions
         SET revoked_at = ?,
             revoke_reason = ?,
             replaced_by_session_id = ?,
             updated_at = ?
         WHERE user_id = ?
           AND revoked_at = 0`,
        [now, reason, String(replacedBySessionId || ''), now, userId]
    );
    return rows.map(row => row.session_id);
}

async function changePassword({
    userId,
    currentPassword,
    newPassword,
    mutationId,
    currentSessionId = null,
    deviceId,
    deviceName,
    ipAddress,
    userAgent,
    now = Date.now()
}) {
    await ensureSchemaReady();
    const checkedMutationId = assertMutationId(mutationId);
    const requestPayload = {
        currentPassword: String(currentPassword || ''),
        newPassword: String(newPassword || ''),
        currentSessionId: String(currentSessionId || ''),
        deviceId: String(deviceId || '').trim(),
        deviceName: sanitizeDeviceName(deviceName)
    };

    const currentUser = await withConnection(connection => dbGet(
        connection,
        `SELECT id, username, username_normalized, password_hash, auth_version
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [userId]
    ));
    if (!currentUser) {
        throw makeError(401, 'session_revoked', '会话已失效，请重新登录');
    }
    const currentPasswordMatches = await bcrypt.compare(String(currentPassword || ''), String(currentUser.password_hash || DUMMY_BCRYPT_HASH));
    if (!currentPasswordMatches) {
        throw makeError(401, 'auth_failed', '用户名或密码错误');
    }
    const passwordValidation = validatePasswordPolicy(newPassword, {
        normalizedUsername: currentUser.username_normalized
    });
    if (!passwordValidation.ok) {
        throw makeError(400, passwordValidation.reason, passwordValidation.message);
    }
    const nextHash = await bcrypt.hash(String(newPassword || ''), BCRYPT_ROUNDS);

    return withImmediateTransaction(async connection => {
        const reserved = await readOrReserveMutation(connection, {
            userId,
            mutationId: checkedMutationId,
            operation: 'change_password',
            requestPayload
        });
        if (reserved.stored) return reserved.stored.response;

        const freshUser = await dbGet(
            connection,
            `SELECT id, username, username_normalized, password_hash, auth_version
             FROM users
             WHERE id = ?
             LIMIT 1`,
            [userId]
        );
        if (!freshUser || String(freshUser.password_hash || '') !== String(currentUser.password_hash || '')) {
            throw makeError(401, 'session_revoked', '会话已失效，请重新登录');
        }
        const nextAuthVersion = Math.max(1, Math.floor(Number(freshUser.auth_version) || 1)) + 1;
        await dbRun(
            connection,
            `UPDATE users
             SET password_hash = ?,
                 auth_version = ?,
                 password_changed_at = ?
             WHERE id = ?`,
            [nextHash, nextAuthVersion, now, userId]
        );
        await revokeAllSessionsForUser(connection, userId, 'password_changed', now);
        const issued = await createPersistentSession(connection, {
            user: freshUser,
            authVersion: nextAuthVersion,
            deviceId,
            deviceName,
            ipAddress,
            userAgent,
            now
        });
        await appendSecurityEvent(connection, {
            userId,
            sessionId: issued.sessionRow && issued.sessionRow.session_id,
            eventType: 'password_changed',
            payload: {
                deviceName: issued.sessionRow && issued.sessionRow.device_name || sanitizeDeviceName(deviceName)
            },
            now
        });
        await bumpSecurityCounter(connection, 'auth:password_changed', 1, now);
        const response = makeAuthResponse(
            { ...freshUser, auth_version: nextAuthVersion },
            issued.token,
            issued.sessionRow
        );
        await storeMutationResponse(connection, {
            userId,
            mutationId: checkedMutationId,
            operation: 'change_password',
            requestHash: reserved.requestHash,
            response,
            now
        });
        return response;
    });
}

async function revokeSession({
    userId,
    targetSessionId,
    currentSessionId = null,
    mutationId,
    now = Date.now()
}) {
    await ensureSchemaReady();
    const checkedMutationId = assertMutationId(mutationId);
    const targetId = String(targetSessionId || '').trim();
    if (!targetId) {
        throw makeError(400, 'invalid_session_id', 'sessionId 无效');
    }

    return withImmediateTransaction(async connection => {
        const reserved = await readOrReserveMutation(connection, {
            userId,
            mutationId: checkedMutationId,
            operation: 'revoke_session',
            requestPayload: {
                targetSessionId: targetId,
                currentSessionId: String(currentSessionId || '')
            }
        });
        if (reserved.stored) return reserved.stored.response;

        const target = await dbGet(
            connection,
            `SELECT session_id, revoked_at
             FROM auth_sessions
             WHERE user_id = ? AND session_id = ?
             LIMIT 1`,
            [userId, targetId]
        );
        if (!target) {
            throw makeError(404, 'session_not_found', '未找到目标会话');
        }
        const alreadyRevoked = Math.max(0, Math.floor(Number(target.revoked_at) || 0)) > 0;
        if (!alreadyRevoked) {
            await dbRun(
                connection,
                `UPDATE auth_sessions
                 SET revoked_at = ?,
                     revoke_reason = 'session_revoked',
                     updated_at = ?
                 WHERE session_id = ? AND user_id = ?`,
                [now, now, targetId, userId]
            );
        }
        await appendSecurityEvent(connection, {
            userId,
            sessionId: targetId,
            eventType: 'session_revoked',
            payload: {
                currentSessionRevoked: targetId === String(currentSessionId || '')
            },
            now
        });
        await bumpSecurityCounter(connection, 'auth:session_revoked', 1, now);
        const response = {
            success: true,
            revokedSessionId: targetId,
            currentSessionRevoked: targetId === String(currentSessionId || ''),
            alreadyRevoked
        };
        await storeMutationResponse(connection, {
            userId,
            mutationId: checkedMutationId,
            operation: 'revoke_session',
            requestHash: reserved.requestHash,
            response,
            now
        });
        return response;
    });
}

async function logoutSession({
    userId,
    currentSessionId = null,
    isLegacy = false,
    now = Date.now()
}) {
    await ensureSchemaReady();
    if (isLegacy || !currentSessionId) {
        return withImmediateTransaction(async connection => {
            await dbRun(
                connection,
                `UPDATE users
                 SET auth_version = auth_version + 1
                 WHERE id = ?`,
                [userId]
            );
            await dbRun(
                connection,
                `UPDATE auth_sessions
                 SET revoked_at = CASE WHEN revoked_at > 0 THEN revoked_at ELSE ? END,
                     revoke_reason = CASE WHEN revoked_at > 0 THEN revoke_reason ELSE 'legacy_logout' END,
                     updated_at = ?
                 WHERE user_id = ?`,
                [now, now, userId]
            );
            await appendSecurityEvent(connection, {
                userId,
                sessionId: null,
                eventType: 'legacy_logout',
                payload: { allSessionsRevoked: true },
                now
            });
            await bumpSecurityCounter(connection, 'auth:legacy_logout', 1, now);
            return {
                success: true,
                legacyTokenCleared: true,
                allSessionsRevoked: true
            };
        });
    }
    return withImmediateTransaction(async connection => {
        await dbRun(
            connection,
            `UPDATE auth_sessions
             SET revoked_at = ?,
                 revoke_reason = 'logout',
                 updated_at = ?
             WHERE user_id = ? AND session_id = ? AND revoked_at = 0`,
            [now, now, userId, currentSessionId]
        );
        await appendSecurityEvent(connection, {
            userId,
            sessionId: currentSessionId,
            eventType: 'logout',
            payload: {},
            now
        });
        await bumpSecurityCounter(connection, 'auth:logout', 1, now);
        return {
            success: true,
            revokedSessionId: currentSessionId
        };
    });
}

async function logoutAllSessions({
    userId,
    mutationId,
    now = Date.now()
}) {
    await ensureSchemaReady();
    const checkedMutationId = assertMutationId(mutationId);
    return withImmediateTransaction(async connection => {
        const reserved = await readOrReserveMutation(connection, {
            userId,
            mutationId: checkedMutationId,
            operation: 'logout_all_sessions',
            requestPayload: {}
        });
        if (reserved.stored) return reserved.stored.response;

        const user = await dbGet(
            connection,
            `SELECT id, auth_version
             FROM users
             WHERE id = ?
             LIMIT 1`,
            [userId]
        );
        if (!user) {
            throw makeError(401, 'session_revoked', '会话已失效，请重新登录');
        }
        const nextAuthVersion = Math.max(1, Math.floor(Number(user.auth_version) || 1)) + 1;
        await dbRun(
            connection,
            `UPDATE users
             SET auth_version = ?
             WHERE id = ?`,
            [nextAuthVersion, userId]
        );
        const revokedSessionIds = await revokeAllSessionsForUser(connection, userId, 'logout_all', now);
        await appendSecurityEvent(connection, {
            userId,
            eventType: 'logout_all',
            payload: {
                revokedSessionCount: revokedSessionIds.length
            },
            now
        });
        await bumpSecurityCounter(connection, 'auth:logout_all', 1, now);
        const response = {
            success: true,
            authVersion: nextAuthVersion,
            revokedSessionCount: revokedSessionIds.length
        };
        await storeMutationResponse(connection, {
            userId,
            mutationId: checkedMutationId,
            operation: 'logout_all_sessions',
            requestHash: reserved.requestHash,
            response,
            now
        });
        return response;
    });
}

module.exports = {
    registerAccount,
    loginAccount,
    getSecurityOverview,
    changePassword,
    revokeSession,
    logoutSession,
    logoutAllSessions,
    validateAuthenticatedSession,
    normalizeUsername,
    validatePasswordPolicy
};
