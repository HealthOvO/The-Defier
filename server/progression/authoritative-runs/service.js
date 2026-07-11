const crypto = require('node:crypto');
const sqlite3 = require('sqlite3').verbose();
const { dbPath } = require('../../db/database');
const {
    CONTENT_HASH,
    CONTENT_VERSION,
    PROTOCOL_VERSION
} = require('./catalog');
const {
    deterministicId,
    hashCanonical,
    makeActionHash,
    makeGenesisHash,
    sha256,
    stableStringify
} = require('./canonical');
const {
    MODES,
    TERMINAL_PHASES,
    applyCommand,
    createInitialState,
    normalizePayload,
    projectState
} = require('./engine');

const REPORT_VERSION = 'account-authoritative-run-v2';
const AUTHORITY_LEVEL = 'server_replayed';
const TRUST_TIER = 'server_authoritative';
const RUN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIONS = 256;
const MAX_ACTION_PAYLOAD_BYTES = 2 * 1024;
const MAX_STATE_BYTES = 64 * 1024;
const SNAPSHOT_INTERVAL = 8;
const RETENTION_DEFAULT_DAYS = 30;
const RETENTION_MIN_DAYS = 7;
const RETENTION_MAX_DAYS = 365;
const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const ACTIVE_RUN_STATUSES = ['active', 'completed'];
const RETAINABLE_STATUSES = ['settled', 'defeated', 'abandoned', 'expired'];

function openDb() {
    const connection = new sqlite3.Database(dbPath);
    connection.configure('busyTimeout', Number(process.env.DEFIER_SQLITE_BUSY_TIMEOUT_MS || 5000));
    return connection;
}

function dbRun(connection, sql, params = []) {
    return new Promise((resolve, reject) => {
        connection.run(sql, params, function onRun(error) {
            if (error) reject(error);
            else resolve(this);
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

function closeDb(connection) {
    return new Promise(resolve => connection.close(() => resolve()));
}

async function withReadConnection(fn, { transaction = false } = {}) {
    const connection = openDb();
    try {
        if (transaction) await dbRun(connection, 'BEGIN');
        const result = await fn(connection);
        if (transaction) await dbRun(connection, 'COMMIT');
        return result;
    } catch (error) {
        if (transaction) {
            try {
                await dbRun(connection, 'ROLLBACK');
            } catch (rollbackError) {
                console.error('[AuthoritativeRuns] Read rollback failed:', rollbackError);
            }
        }
        throw error;
    } finally {
        await closeDb(connection);
    }
}

let writeTail = Promise.resolve();

async function withWriteTransaction(fn) {
    let releaseQueue;
    const myTurn = new Promise(resolve => {
        releaseQueue = resolve;
    });
    const previousTurn = writeTail;
    writeTail = previousTurn.catch(() => {}).then(() => myTurn);
    await previousTurn.catch(() => {});
    const connection = openDb();
    try {
        await dbRun(connection, 'BEGIN IMMEDIATE');
        const result = await fn(connection);
        await dbRun(connection, 'COMMIT');
        return result;
    } catch (error) {
        try {
            await dbRun(connection, 'ROLLBACK');
        } catch (rollbackError) {
            console.error('[AuthoritativeRuns] Write rollback failed:', rollbackError);
        }
        if (error && error.authoritativeOpsEvent) {
            const audit = error.authoritativeOpsEvent;
            try {
                await recordOpsEvent(
                    connection,
                    audit.eventType,
                    audit.run,
                    audit.detail,
                    audit.durationMs,
                    audit.now
                );
            } catch (auditError) {
                console.error('[AuthoritativeRuns] Detached audit write failed:', auditError);
            }
        }
        throw error;
    } finally {
        await closeDb(connection);
        releaseQueue();
    }
}

function makeError(statusCode, reason, message, details = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.reason = reason;
    if (details) error.details = details;
    return error;
}

function clampInt(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
}

function safeId(value) {
    const text = String(value || '').trim();
    return SAFE_ID.test(text) ? text : '';
}

function parseJson(value, fallback = null) {
    try {
        const parsed = JSON.parse(String(value || ''));
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (error) {
        return fallback;
    }
}

function assertAllowedKeys(source, allowed, reason = 'invalid_request_payload') {
    const unknown = Object.keys(source).filter(key => !allowed.includes(key));
    if (unknown.length > 0) {
        throw makeError(400, reason, `请求包含不允许字段: ${unknown[0]}`);
    }
}

function normalizeStartRequest(rawRequest) {
    const source = rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest) ? rawRequest : {};
    assertAllowedKeys(source, ['clientRunId', 'mode', 'contentVersion']);
    const clientRunId = safeId(source.clientRunId);
    const mode = String(source.mode || '').trim();
    const contentVersion = String(source.contentVersion || '').trim();
    if (!clientRunId) throw makeError(400, 'invalid_client_run_id', '客户端 run id 非法');
    if (!MODES.includes(mode)) throw makeError(400, 'invalid_run_mode', '权威试炼模式不受支持');
    if (contentVersion !== CONTENT_VERSION) {
        throw makeError(409, 'unsupported_content_version', '权威试炼内容版本不受支持');
    }
    return { clientRunId, mode, contentVersion };
}

function normalizeActionRequest(runId, rawRequest) {
    const source = rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest) ? rawRequest : {};
    assertAllowedKeys(source, ['runId', 'actionId', 'expectedVersion', 'command', 'payload'], 'invalid_action_request');
    const safeRunId = safeId(runId);
    if (!safeRunId || safeId(source.runId) !== safeRunId) {
        throw makeError(400, 'authoritative_run_id_mismatch', '动作 run 与请求路径不一致');
    }
    const actionId = safeId(source.actionId);
    if (!actionId) throw makeError(400, 'invalid_action_id', '动作 ID 非法');
    const expectedVersion = Math.floor(Number(source.expectedVersion));
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0 || expectedVersion > MAX_ACTIONS) {
        throw makeError(400, 'invalid_expected_version', '动作状态版本非法');
    }
    const command = String(source.command || '').trim();
    let payload;
    try {
        payload = normalizePayload(command, source.payload);
    } catch (error) {
        throw makeError(Number(error.statusCode) || 400, error.reason || 'invalid_action_payload', error.message);
    }
    const payloadJson = stableStringify(payload);
    if (Buffer.byteLength(payloadJson, 'utf8') > MAX_ACTION_PAYLOAD_BYTES) {
        throw makeError(413, 'action_payload_too_large', '动作数据超过允许大小');
    }
    return {
        runId: safeRunId,
        actionId,
        expectedVersion,
        command,
        payload,
        payloadJson,
        payloadHash: sha256(payloadJson)
    };
}

function normalizeSettlementRequest(runId, rawRequest) {
    const source = rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest) ? rawRequest : {};
    assertAllowedKeys(source, ['runId', 'mutationId', 'expectedVersion'], 'invalid_settlement_request');
    const safeRunId = safeId(runId);
    if (!safeRunId || safeId(source.runId) !== safeRunId) {
        throw makeError(400, 'authoritative_run_id_mismatch', '结算 run 与请求路径不一致');
    }
    const mutationId = safeId(source.mutationId);
    if (!mutationId) throw makeError(400, 'invalid_mutation_id', '结算 mutation id 非法');
    const expectedVersion = Math.floor(Number(source.expectedVersion));
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0 || expectedVersion > MAX_ACTIONS) {
        throw makeError(400, 'invalid_expected_version', '结算状态版本非法');
    }
    return { runId: safeRunId, mutationId, expectedVersion };
}

function normalizeMode(rawMode) {
    const mode = String(rawMode || '').trim();
    if (!MODES.includes(mode)) throw makeError(400, 'invalid_run_mode', '权威试炼模式不受支持');
    return mode;
}

function runStatusForState(state) {
    if (!state) return 'corrupt';
    if (state.phase === 'completed') return 'completed';
    if (state.phase === 'defeated') return 'defeated';
    if (state.phase === 'abandoned') return 'abandoned';
    return 'active';
}

function makeUserRef(userId) {
    return `account-${sha256(String(userId || '')).slice(0, 16)}`;
}

async function recordOpsEvent(connection, eventType, run = null, detail = {}, durationMs = 0, now = Date.now()) {
    const runId = safeId(run && (run.run_id || run.runId)) || '';
    const userId = String(run && (run.user_id || run.userId) || '');
    const safeDetail = {
        mode: String(detail.mode || run && run.activity_mode || '').slice(0, 32),
        status: String(detail.status || run && run.status || '').slice(0, 32),
        reason: String(detail.reason || '').slice(0, 96),
        actionCount: clampInt(detail.actionCount ?? (run && run.action_count), 0, MAX_ACTIONS),
        recoveredFromSequence: clampInt(detail.recoveredFromSequence, 0, MAX_ACTIONS),
        deletedRuns: clampInt(detail.deletedRuns, 0, 100_000),
        expiredActiveRuns: clampInt(detail.expiredActiveRuns, 0, 100_000)
    };
    const eventId = `arops-${crypto.randomUUID()}`;
    await dbRun(
        connection,
        `INSERT INTO progression_authoritative_run_ops_events
            (event_id, event_type, run_id, user_ref, detail_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [eventId, eventType, runId || null, userId ? makeUserRef(userId) : '', JSON.stringify(safeDetail), now]
    );
    await dbRun(
        connection,
        `INSERT INTO progression_authoritative_run_ops_counters
            (event_type, event_count, total_duration_ms, updated_at)
         VALUES (?, 1, ?, ?)
         ON CONFLICT(event_type) DO UPDATE SET
            event_count = progression_authoritative_run_ops_counters.event_count + 1,
            total_duration_ms = progression_authoritative_run_ops_counters.total_duration_ms + excluded.total_duration_ms,
            updated_at = excluded.updated_at`,
        [eventType, clampInt(durationMs, 0, 60_000), now]
    );
}

async function loadContent(connection, run) {
    const row = await dbGet(
        connection,
        `SELECT protocol_version, content_version, content_hash, content_json
         FROM progression_authoritative_run_catalogs
         WHERE content_version = ?`,
        [run.content_version]
    );
    if (!row) throw makeError(409, 'run_content_missing', '权威内容快照不存在');
    const content = parseJson(row.content_json);
    if (!content
        || String(row.protocol_version || '') !== String(run.protocol_version || '')
        || String(row.content_hash || '') !== String(run.content_hash || '')
        || hashCanonical(content) !== String(run.content_hash || '')) {
        throw makeError(409, 'run_content_integrity_failed', '权威内容快照校验失败');
    }
    return content;
}

async function loadOwnedRun(connection, userId, runId) {
    return dbGet(
        connection,
        `SELECT * FROM progression_authoritative_runs
         WHERE run_id = ? AND user_id = ?`,
        [runId, userId]
    );
}

function parseCanonicalState(run) {
    const state = parseJson(run && run.state_json);
    if (!state) throw makeError(409, 'run_state_integrity_failed', '权威状态无法解析');
    return state;
}

function assertSnapshotState(run, snapshot, state) {
    const sequence = clampInt(snapshot.sequence, 0, MAX_ACTIONS);
    if (!state
        || String(state.runId || '') !== String(run.run_id || '')
        || String(state.mode || '') !== String(run.activity_mode || '')
        || clampInt(state.version, 0, MAX_ACTIONS) !== sequence
        || hashCanonical(state) !== String(snapshot.state_hash || '')) {
        throw makeError(409, 'snapshot_integrity_failed', '权威快照校验失败');
    }
}

async function verifySnapshotAnchor(connection, run, snapshot, state) {
    assertSnapshotState(run, snapshot, state);
    const sequence = clampInt(snapshot.sequence, 0, MAX_ACTIONS);
    if (sequence === 0) {
        const expectedGenesis = makeGenesisHash({
            protocolVersion: run.protocol_version,
            runId: run.run_id,
            userId: run.user_id,
            contentHash: run.content_hash,
            stateHash: snapshot.state_hash
        });
        if (expectedGenesis !== String(snapshot.chain_head || '')) {
            throw makeError(409, 'snapshot_integrity_failed', '权威 genesis 快照链校验失败');
        }
        return;
    }
    const genesis = await dbGet(
        connection,
        `SELECT * FROM progression_authoritative_run_snapshots
         WHERE run_id = ? AND sequence = 0`,
        [run.run_id]
    );
    const genesisState = genesis && parseJson(genesis.state_json);
    if (!genesis || !genesisState) {
        throw makeError(409, 'snapshot_integrity_failed', '权威 genesis 快照不存在');
    }
    assertSnapshotState(run, genesis, genesisState);
    const expectedGenesis = makeGenesisHash({
        protocolVersion: run.protocol_version,
        runId: run.run_id,
        userId: run.user_id,
        contentHash: run.content_hash,
        stateHash: genesis.state_hash
    });
    if (expectedGenesis !== String(genesis.chain_head || '')) {
        throw makeError(409, 'snapshot_integrity_failed', '权威 genesis 快照链校验失败');
    }
    const prefix = await dbAll(
        connection,
        `SELECT sequence, expected_version, command_type, payload_json, payload_hash,
                previous_hash, action_hash, result_state_hash
         FROM progression_authoritative_run_actions
         WHERE run_id = ? AND sequence <= ?
         ORDER BY sequence ASC`,
        [run.run_id, sequence]
    );
    if (prefix.length !== sequence) {
        throw makeError(409, 'snapshot_integrity_failed', '权威快照前序动作链存在缺口');
    }
    let chainHead = String(genesis.chain_head || '');
    let resultStateHash = String(genesis.state_hash || '');
    for (let index = 0; index < prefix.length; index += 1) {
        const action = prefix[index];
        const expectedSequence = index + 1;
        const payload = parseJson(action.payload_json, {});
        const payloadJson = stableStringify(payload);
        const payloadHash = sha256(payloadJson);
        if (clampInt(action.sequence, 0, MAX_ACTIONS) !== expectedSequence
            || clampInt(action.expected_version, 0, MAX_ACTIONS) !== expectedSequence - 1
            || payloadJson !== String(action.payload_json || '')
            || payloadHash !== String(action.payload_hash || '')
            || String(action.previous_hash || '') !== chainHead) {
            throw makeError(409, 'snapshot_integrity_failed', '权威快照前序动作链校验失败');
        }
        const actionHash = makeActionHash({
            protocolVersion: run.protocol_version,
            runId: run.run_id,
            sequence: expectedSequence,
            expectedVersion: action.expected_version,
            command: action.command_type,
            payloadHash,
            previousHash: action.previous_hash,
            resultStateHash: action.result_state_hash
        });
        if (actionHash !== String(action.action_hash || '')) {
            throw makeError(409, 'snapshot_integrity_failed', '权威快照前序动作哈希校验失败');
        }
        chainHead = actionHash;
        resultStateHash = String(action.result_state_hash || '');
    }
    if (chainHead !== String(snapshot.chain_head || '') || resultStateHash !== String(snapshot.state_hash || '')) {
        throw makeError(409, 'snapshot_integrity_failed', '权威快照锚点与动作链不一致');
    }
}

function verifyAndApplyStoredAction(run, content, state, chainHead, action, expectedSequence) {
    const sequence = clampInt(action.sequence, 0, MAX_ACTIONS);
    if (sequence !== expectedSequence || clampInt(action.expected_version, 0, MAX_ACTIONS) !== clampInt(state.version, 0, MAX_ACTIONS)) {
        throw makeError(409, 'journal_sequence_integrity_failed', '权威动作序列不连续');
    }
    const payload = parseJson(action.payload_json, {});
    const payloadJson = stableStringify(payload);
    const payloadHash = sha256(payloadJson);
    if (payloadJson !== String(action.payload_json || '') || payloadHash !== String(action.payload_hash || '')) {
        throw makeError(409, 'journal_payload_integrity_failed', '权威动作载荷校验失败');
    }
    if (String(action.previous_hash || '') !== chainHead) {
        throw makeError(409, 'journal_chain_integrity_failed', '权威动作前序哈希不连续');
    }
    let applied;
    try {
        applied = applyCommand(state, content, String(action.command_type || ''), payload);
    } catch (error) {
        throw makeError(409, 'journal_replay_failed', '权威动作无法重放');
    }
    if (stableStringify(applied.payload) !== payloadJson) {
        throw makeError(409, 'journal_payload_integrity_failed', '权威动作规范化结果不一致');
    }
    const resultStateHash = hashCanonical(applied.state);
    if (resultStateHash !== String(action.result_state_hash || '')) {
        throw makeError(409, 'journal_state_integrity_failed', '权威动作结果哈希不一致');
    }
    const actionHash = makeActionHash({
        protocolVersion: run.protocol_version,
        runId: run.run_id,
        sequence,
        expectedVersion: action.expected_version,
        command: action.command_type,
        payloadHash,
        previousHash: action.previous_hash,
        resultStateHash
    });
    if (actionHash !== String(action.action_hash || '')) {
        throw makeError(409, 'journal_action_integrity_failed', '权威动作哈希校验失败');
    }
    return { state: applied.state, chainHead: actionHash };
}

async function replayFromSnapshot(connection, run, snapshot, content) {
    let state = parseJson(snapshot.state_json);
    await verifySnapshotAnchor(connection, run, snapshot, state);
    let chainHead = String(snapshot.chain_head || '');
    const startSequence = clampInt(snapshot.sequence, 0, MAX_ACTIONS);
    const actions = await dbAll(
        connection,
        `SELECT * FROM progression_authoritative_run_actions
         WHERE run_id = ? AND sequence > ? AND sequence <= ?
         ORDER BY sequence ASC`,
        [run.run_id, startSequence, clampInt(run.action_count, 0, MAX_ACTIONS)]
    );
    if (actions.length !== clampInt(run.action_count, 0, MAX_ACTIONS) - startSequence) {
        throw makeError(409, 'journal_sequence_integrity_failed', '权威动作日志存在缺口');
    }
    for (let index = 0; index < actions.length; index += 1) {
        const applied = verifyAndApplyStoredAction(run, content, state, chainHead, actions[index], startSequence + index + 1);
        state = applied.state;
        chainHead = applied.chainHead;
    }
    return { state, stateHash: hashCanonical(state), chainHead, startSequence, actions };
}

async function replayFromGenesis(connection, run) {
    const content = await loadContent(connection, run);
    const genesis = await dbGet(
        connection,
        `SELECT * FROM progression_authoritative_run_snapshots
         WHERE run_id = ? AND sequence = 0`,
        [run.run_id]
    );
    if (!genesis) throw makeError(409, 'genesis_snapshot_missing', '权威 genesis 快照不存在');
    const replay = await replayFromSnapshot(connection, run, genesis, content);
    if (replay.startSequence !== 0
        || clampInt(replay.state.version, 0, MAX_ACTIONS) !== clampInt(run.action_count, 0, MAX_ACTIONS)) {
        throw makeError(409, 'journal_replay_incomplete', '权威动作日志未完整重放');
    }
    return { ...replay, content };
}

async function isCachedRunStateValid(connection, run) {
    const state = parseJson(run.state_json);
    if (!state
        || stableStringify(state) !== String(run.state_json || '')
        || hashCanonical(state) !== String(run.state_hash || '')
        || clampInt(state.version, 0, MAX_ACTIONS) !== clampInt(run.state_version, 0, MAX_ACTIONS)
        || clampInt(run.state_version, 0, MAX_ACTIONS) !== clampInt(run.action_count, 0, MAX_ACTIONS)
        || String(state.runId || '') !== String(run.run_id || '')) {
        return false;
    }
    if (clampInt(run.action_count, 0, MAX_ACTIONS) === 0) {
        const snapshot = await dbGet(
            connection,
            `SELECT state_hash, chain_head FROM progression_authoritative_run_snapshots
             WHERE run_id = ? AND sequence = 0`,
            [run.run_id]
        );
        return !!snapshot
            && String(snapshot.state_hash || '') === String(run.state_hash || '')
            && String(snapshot.chain_head || '') === String(run.chain_head || '');
    }
    const lastAction = await dbGet(
        connection,
        `SELECT action_hash, result_state_hash
         FROM progression_authoritative_run_actions
         WHERE run_id = ? AND sequence = ?`,
        [run.run_id, run.action_count]
    );
    return !!lastAction
        && String(lastAction.action_hash || '') === String(run.chain_head || '')
        && String(lastAction.result_state_hash || '') === String(run.state_hash || '');
}

async function recoverRunState(connection, run, now = Date.now()) {
    const content = await loadContent(connection, run);
    const snapshots = await dbAll(
        connection,
        `SELECT * FROM progression_authoritative_run_snapshots
         WHERE run_id = ? AND sequence <= ?
         ORDER BY sequence DESC`,
        [run.run_id, clampInt(run.action_count, 0, MAX_ACTIONS)]
    );
    let recovered = null;
    let lastError = null;
    for (const snapshot of snapshots) {
        try {
            recovered = await replayFromSnapshot(connection, run, snapshot, content);
            break;
        } catch (error) {
            lastError = error;
        }
    }
    if (!recovered) {
        const error = makeError(409, 'run_integrity_failed', lastError ? lastError.message : '权威状态无法恢复');
        error.authoritativeOpsEvent = {
            eventType: 'state_recovery_failed',
            run,
            detail: {
                status: run.status,
                reason: lastError && lastError.reason || 'no_valid_snapshot',
                actionCount: run.action_count
            },
            durationMs: 0,
            now
        };
        throw error;
    }
    const stateJson = stableStringify(recovered.state);
    if (Buffer.byteLength(stateJson, 'utf8') > MAX_STATE_BYTES) {
        throw makeError(409, 'run_state_too_large', '恢复后的权威状态超过限制');
    }
    const storedStatus = String(run.status || '');
    const recoveredStatus = ['settled', 'expired'].includes(storedStatus)
        ? storedStatus
        : runStatusForState(recovered.state);
    await dbRun(
        connection,
        `UPDATE progression_authoritative_runs
         SET status = ?, state_version = ?, action_count = ?, state_json = ?, state_hash = ?,
             chain_head = ?, recovery_count = recovery_count + 1, updated_at = ?
         WHERE run_id = ?`,
        [
            recoveredStatus,
            recovered.state.version,
            recovered.state.version,
            stateJson,
            recovered.stateHash,
            recovered.chainHead,
            now,
            run.run_id
        ]
    );
    await recordOpsEvent(connection, 'state_recovered', run, {
        status: recoveredStatus,
        actionCount: recovered.state.version,
        recoveredFromSequence: recovered.startSequence
    }, 0, now);
    const refreshed = await loadOwnedRun(connection, run.user_id, run.run_id);
    return { run: refreshed, state: recovered.state, content, recovered: true };
}

async function ensureRunState(connection, run, now = Date.now()) {
    if (await isCachedRunStateValid(connection, run)) {
        return { run, state: parseCanonicalState(run), content: await loadContent(connection, run), recovered: false };
    }
    return recoverRunState(connection, run, now);
}

async function expireRunIfNeeded(connection, run, now = Date.now()) {
    if (String(run.status || '') !== 'active' || clampInt(run.expires_at) > now) return run;
    const updated = await dbRun(
        connection,
        `UPDATE progression_authoritative_runs
         SET status = 'expired', updated_at = ?
         WHERE run_id = ? AND status = 'active'`,
        [now, run.run_id]
    );
    if (updated.changes > 0) {
        await recordOpsEvent(connection, 'run_expired', run, { status: 'expired' }, 0, now);
    }
    return loadOwnedRun(connection, run.user_id, run.run_id);
}

async function loadReceipt(connection, runId) {
    return dbGet(
        connection,
        `SELECT * FROM progression_authoritative_run_receipts WHERE run_id = ?`,
        [runId]
    );
}

async function formatRun(connection, run, state, content, { idempotent = false, resumedExisting = false } = {}) {
    const projection = projectState(state, content);
    if (String(run.status || '') !== 'active') projection.allowedCommands = [];
    const receiptRow = await loadReceipt(connection, run.run_id);
    const receipt = receiptRow ? parseJson(receiptRow.receipt_json, {}) : null;
    Object.assign(projection, {
        runStatus: String(run.status || ''),
        stateHash: String(run.state_hash || ''),
        chainHead: String(run.chain_head || ''),
        actionCount: clampInt(run.action_count, 0, MAX_ACTIONS),
        contentHash: String(run.content_hash || ''),
        authorityLevel: AUTHORITY_LEVEL,
        trustTier: TRUST_TIER,
        expiresAt: clampInt(run.expires_at),
        settledAt: clampInt(run.settled_at),
        receipt: receipt || null
    });
    return {
        runId: String(run.run_id || ''),
        clientRunId: String(run.client_run_id || ''),
        mode: String(run.activity_mode || ''),
        scenarioId: String(run.scenario_id || ''),
        status: String(run.status || ''),
        protocolVersion: String(run.protocol_version || ''),
        contentVersion: String(run.content_version || ''),
        contentHash: String(run.content_hash || ''),
        authorityLevel: AUTHORITY_LEVEL,
        trustTier: TRUST_TIER,
        stateVersion: clampInt(run.state_version, 0, MAX_ACTIONS),
        actionCount: clampInt(run.action_count, 0, MAX_ACTIONS),
        state: projection,
        projection,
        integrity: {
            stateHash: String(run.state_hash || ''),
            chainHead: String(run.chain_head || ''),
            snapshotInterval: SNAPSHOT_INTERVAL,
            fullyReplayRequiredForSettlement: true
        },
        recovery: {
            recoveryCount: clampInt(run.recovery_count),
            resumable: ['active', 'completed'].includes(String(run.status || ''))
        },
        startedAt: clampInt(run.started_at),
        expiresAt: clampInt(run.expires_at),
        completedAt: clampInt(run.completed_at),
        settledAt: clampInt(run.settled_at),
        abandonedAt: clampInt(run.abandoned_at),
        updatedAt: clampInt(run.updated_at),
        receipt,
        idempotent: !!idempotent,
        resumedExisting: !!resumedExisting
    };
}

async function issueAuthoritativeRun(userId, rawRequest, now = Date.now()) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const request = normalizeStartRequest(rawRequest);
    const startedAt = Date.now();
    return withWriteTransaction(async connection => {
        const existing = await dbGet(
            connection,
            `SELECT * FROM progression_authoritative_runs
             WHERE user_id = ? AND client_run_id = ?`,
            [identity, request.clientRunId]
        );
        if (existing) {
            if (String(existing.activity_mode || '') !== request.mode
                || String(existing.content_version || '') !== request.contentVersion) {
                throw makeError(409, 'client_run_conflict', '相同客户端 run id 已绑定其他权威上下文');
            }
            const ensured = await ensureRunState(connection, existing, now);
            const expired = await expireRunIfNeeded(connection, ensured.run, now);
            const run = expired || ensured.run;
            return {
                success: true,
                reportVersion: `${REPORT_VERSION}-start`,
                run: await formatRun(connection, run, ensured.state, ensured.content, { idempotent: true })
            };
        }

        const expiring = await dbAll(
            connection,
            `SELECT * FROM progression_authoritative_runs
             WHERE user_id = ? AND activity_mode = ? AND status = 'active' AND expires_at <= ?`,
            [identity, request.mode, now]
        );
        for (const row of expiring) await expireRunIfNeeded(connection, row, now);

        const current = await dbGet(
            connection,
            `SELECT * FROM progression_authoritative_runs
             WHERE user_id = ? AND activity_mode = ? AND status IN ('active', 'completed')
             ORDER BY updated_at DESC LIMIT 1`,
            [identity, request.mode]
        );
        if (current) {
            const ensured = await ensureRunState(connection, current, now);
            return {
                success: true,
                reportVersion: `${REPORT_VERSION}-start`,
                run: await formatRun(connection, ensured.run, ensured.state, ensured.content, { resumedExisting: true })
            };
        }

        const catalog = await dbGet(
            connection,
            `SELECT * FROM progression_authoritative_run_catalogs WHERE content_version = ?`,
            [request.contentVersion]
        );
        const content = catalog && parseJson(catalog.content_json);
        if (!catalog || !content
            || String(catalog.protocol_version || '') !== PROTOCOL_VERSION
            || String(catalog.content_hash || '') !== CONTENT_HASH
            || hashCanonical(content) !== CONTENT_HASH) {
            throw makeError(503, 'authoritative_catalog_unavailable', '权威内容目录暂不可用');
        }
        const runId = `arun-${crypto.randomUUID()}`;
        const seedHex = crypto.randomBytes(32).toString('hex');
        const state = createInitialState({ runId, userId: identity, mode: request.mode, seedHex, content });
        const stateJson = stableStringify(state);
        if (Buffer.byteLength(stateJson, 'utf8') > MAX_STATE_BYTES) {
            throw makeError(500, 'initial_state_too_large', '权威初始状态超过限制');
        }
        const stateHash = hashCanonical(state);
        const chainHead = makeGenesisHash({
            protocolVersion: PROTOCOL_VERSION,
            runId,
            userId: identity,
            contentHash: CONTENT_HASH,
            stateHash
        });
        const expiresAt = now + RUN_TTL_MS;
        await dbRun(
            connection,
            `INSERT INTO progression_authoritative_runs
                (run_id, user_id, client_run_id, activity_mode, scenario_id, protocol_version,
                 content_version, content_hash, status, state_version, action_count, state_json,
                 state_hash, chain_head, started_at, expires_at, completed_at, settled_at,
                 abandoned_at, last_action_at, recovery_count, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, 0, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?)`,
            [
                runId,
                identity,
                request.clientRunId,
                request.mode,
                state.scenarioId,
                PROTOCOL_VERSION,
                CONTENT_VERSION,
                CONTENT_HASH,
                stateJson,
                stateHash,
                chainHead,
                now,
                expiresAt,
                now
            ]
        );
        await dbRun(
            connection,
            `INSERT INTO progression_authoritative_run_snapshots
                (snapshot_id, run_id, sequence, state_json, state_hash, chain_head, created_at)
             VALUES (?, ?, 0, ?, ?, ?, ?)`,
            [deterministicId('arsnap', [runId, 0]), runId, stateJson, stateHash, chainHead, now]
        );
        const run = await loadOwnedRun(connection, identity, runId);
        await recordOpsEvent(connection, 'run_started', run, { status: 'active', actionCount: 0 }, Date.now() - startedAt, now);
        return {
            success: true,
            reportVersion: `${REPORT_VERSION}-start`,
            run: await formatRun(connection, run, state, content)
        };
    });
}

async function getAuthoritativeRun(userId, runId, now = Date.now()) {
    const identity = String(userId || '').trim();
    const safeRunId = safeId(runId);
    if (!safeRunId) throw makeError(400, 'invalid_run_id', '权威 run id 非法');
    return withWriteTransaction(async connection => {
        let run = await loadOwnedRun(connection, identity, safeRunId);
        if (!run) throw makeError(404, 'authoritative_run_not_found', '权威 run 不存在');
        const ensured = await ensureRunState(connection, run, now);
        run = await expireRunIfNeeded(connection, ensured.run, now);
        return {
            success: true,
            reportVersion: `${REPORT_VERSION}-state`,
            run: await formatRun(connection, run, ensured.state, ensured.content)
        };
    });
}

async function getCurrentAuthoritativeRun(userId, rawMode, now = Date.now()) {
    const identity = String(userId || '').trim();
    const mode = normalizeMode(rawMode);
    return withWriteTransaction(async connection => {
        let run = await dbGet(
            connection,
            `SELECT * FROM progression_authoritative_runs
             WHERE user_id = ? AND activity_mode = ? AND status IN ('active', 'completed')
             ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC
             LIMIT 1`,
            [identity, mode]
        );
        if (!run) {
            return { success: true, reportVersion: `${REPORT_VERSION}-current`, run: null };
        }
        const ensured = await ensureRunState(connection, run, now);
        run = await expireRunIfNeeded(connection, ensured.run, now);
        if (String(run.status || '') === 'expired') {
            return { success: true, reportVersion: `${REPORT_VERSION}-current`, run: null, expiredRunId: run.run_id };
        }
        return {
            success: true,
            reportVersion: `${REPORT_VERSION}-current`,
            run: await formatRun(connection, run, ensured.state, ensured.content)
        };
    });
}

async function submitAuthoritativeRunAction(userId, runId, rawRequest, now = Date.now()) {
    const identity = String(userId || '').trim();
    const request = normalizeActionRequest(runId, rawRequest);
    const startedAt = Date.now();
    return withWriteTransaction(async connection => {
        const duplicate = await dbGet(
            connection,
            `SELECT * FROM progression_authoritative_run_actions WHERE action_id = ?`,
            [request.actionId]
        );
        if (duplicate) {
            if (String(duplicate.run_id || '') !== request.runId
                || String(duplicate.user_id || '') !== identity) {
                throw makeError(409, 'action_replay_conflict', '动作 ID 已绑定其他权威 run');
            }
            if (String(duplicate.command_type || '') !== request.command
                || clampInt(duplicate.expected_version, 0, MAX_ACTIONS) !== request.expectedVersion
                || String(duplicate.payload_hash || '') !== request.payloadHash) {
                throw makeError(409, 'action_id_conflict', '动作 ID 已绑定不同请求');
            }
            let run = await loadOwnedRun(connection, identity, request.runId);
            if (!run) throw makeError(404, 'authoritative_run_not_found', '权威 run 不存在');
            const ensured = await ensureRunState(connection, run, now);
            run = await expireRunIfNeeded(connection, ensured.run, now);
            if (String(run.status || '') === 'expired') {
                throw makeError(410, 'authoritative_run_expired', '权威 run 已过期');
            }
            return {
                success: true,
                reportVersion: `${REPORT_VERSION}-action`,
                action: { ...parseJson(duplicate.public_receipt_json, {}), idempotent: true },
                run: await formatRun(connection, run, ensured.state, ensured.content, { idempotent: true })
            };
        }

        let run = await loadOwnedRun(connection, identity, request.runId);
        if (!run) throw makeError(404, 'authoritative_run_not_found', '权威 run 不存在');
        const ensured = await ensureRunState(connection, run, now);
        run = await expireRunIfNeeded(connection, ensured.run, now);
        if (String(run.status || '') === 'expired') {
            throw makeError(410, 'authoritative_run_expired', '权威 run 已过期');
        }
        if (String(run.status || '') !== 'active') {
            throw makeError(409, 'run_not_active', '权威 run 已结束，不能继续行动');
        }
        if (request.expectedVersion !== clampInt(run.state_version, 0, MAX_ACTIONS)) {
            throw makeError(409, 'stale_run_version', '权威状态已更新，请同步后重试', {
                currentVersion: clampInt(run.state_version, 0, MAX_ACTIONS),
                stateHash: String(run.state_hash || ''),
                run: await formatRun(connection, run, ensured.state, ensured.content)
            });
        }
        if (clampInt(run.action_count, 0, MAX_ACTIONS) >= MAX_ACTIONS) {
            throw makeError(409, 'run_action_limit_reached', '权威 run 已达到动作上限');
        }
        let applied;
        try {
            applied = applyCommand(ensured.state, ensured.content, request.command, request.payload);
        } catch (error) {
            throw makeError(Number(error.statusCode) || 409, error.reason || 'run_command_rejected', error.message);
        }
        const stateJson = stableStringify(applied.state);
        if (Buffer.byteLength(stateJson, 'utf8') > MAX_STATE_BYTES) {
            throw makeError(409, 'run_state_too_large', '权威状态超过允许大小');
        }
        const sequence = clampInt(run.action_count, 0, MAX_ACTIONS) + 1;
        const stateHash = hashCanonical(applied.state);
        const previousHash = String(run.chain_head || '');
        const actionHash = makeActionHash({
            protocolVersion: run.protocol_version,
            runId: run.run_id,
            sequence,
            expectedVersion: request.expectedVersion,
            command: request.command,
            payloadHash: request.payloadHash,
            previousHash,
            resultStateHash: stateHash
        });
        const nextStatus = runStatusForState(applied.state);
        const actionReceipt = {
            actionId: request.actionId,
            sequence,
            command: request.command,
            expectedVersion: request.expectedVersion,
            appliedVersion: applied.state.version,
            resultPhase: applied.state.phase,
            previousHash,
            actionHash,
            resultStateHash: stateHash,
            events: applied.events,
            acceptedAt: now,
            idempotent: false
        };
        await dbRun(
            connection,
            `INSERT INTO progression_authoritative_run_actions
                (action_id, run_id, user_id, sequence, expected_version, command_type,
                 payload_json, payload_hash, previous_hash, action_hash, result_state_hash,
                 result_phase, public_receipt_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                request.actionId,
                run.run_id,
                identity,
                sequence,
                request.expectedVersion,
                request.command,
                request.payloadJson,
                request.payloadHash,
                previousHash,
                actionHash,
                stateHash,
                applied.state.phase,
                JSON.stringify(actionReceipt),
                now
            ]
        );
        const isTerminal = TERMINAL_PHASES.has(applied.state.phase);
        if (sequence % SNAPSHOT_INTERVAL === 0 || isTerminal) {
            await dbRun(
                connection,
                `INSERT INTO progression_authoritative_run_snapshots
                    (snapshot_id, run_id, sequence, state_json, state_hash, chain_head, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [deterministicId('arsnap', [run.run_id, sequence]), run.run_id, sequence, stateJson, stateHash, actionHash, now]
            );
        }
        const completedAt = nextStatus === 'completed' ? now : clampInt(run.completed_at);
        const abandonedAt = nextStatus === 'abandoned' ? now : clampInt(run.abandoned_at);
        await dbRun(
            connection,
            `UPDATE progression_authoritative_runs
             SET status = ?, state_version = ?, action_count = ?, state_json = ?, state_hash = ?,
                 chain_head = ?, completed_at = ?, abandoned_at = ?, last_action_at = ?, updated_at = ?
             WHERE run_id = ? AND user_id = ? AND state_version = ?`,
            [
                nextStatus,
                applied.state.version,
                sequence,
                stateJson,
                stateHash,
                actionHash,
                completedAt,
                abandonedAt,
                now,
                now,
                run.run_id,
                identity,
                request.expectedVersion
            ]
        );
        run = await loadOwnedRun(connection, identity, run.run_id);
        await recordOpsEvent(connection, isTerminal ? `run_${nextStatus}` : 'action_accepted', run, {
            status: nextStatus,
            actionCount: sequence
        }, Date.now() - startedAt, now);
        return {
            success: true,
            reportVersion: `${REPORT_VERSION}-action`,
            action: actionReceipt,
            run: await formatRun(connection, run, applied.state, ensured.content)
        };
    });
}

function makeProgressionEvent(run, state, receiptId, now) {
    const eventId = deterministicId('arevent', [run.run_id, 'activity_completed']);
    const sourceRef = `authoritative:${run.run_id}`;
    return {
        eventId,
        sourceRef,
        proof: {
            runId: run.run_id,
            receiptId,
            protocolVersion: run.protocol_version,
            contentVersion: run.content_version,
            contentHash: run.content_hash,
            authorityLevel: AUTHORITY_LEVEL,
            actionCount: clampInt(run.action_count, 0, MAX_ACTIONS),
            stateHash: String(run.state_hash || ''),
            chainHead: String(run.chain_head || ''),
            summary: state.summary
        },
        occurredAt: clampInt(run.completed_at || now)
    };
}

async function settleAuthoritativeRun(userId, runId, rawRequest, now = Date.now()) {
    const identity = String(userId || '').trim();
    const request = normalizeSettlementRequest(runId, rawRequest);
    const startedAt = Date.now();
    return withWriteTransaction(async connection => {
        const mutationReceipt = await dbGet(
            connection,
            `SELECT * FROM progression_authoritative_run_receipts
             WHERE user_id = ? AND mutation_id = ?`,
            [identity, request.mutationId]
        );
        if (mutationReceipt) {
            if (String(mutationReceipt.run_id || '') !== request.runId) {
                throw makeError(409, 'settlement_mutation_conflict', '结算 mutation 已绑定其他权威 run');
            }
            const run = await loadOwnedRun(connection, identity, request.runId);
            const ensured = await ensureRunState(connection, run, now);
            return {
                success: true,
                reportVersion: `${REPORT_VERSION}-settlement`,
                receipt: { ...parseJson(mutationReceipt.receipt_json, {}), idempotent: true },
                run: await formatRun(connection, ensured.run, ensured.state, ensured.content, { idempotent: true })
            };
        }
        const existingReceipt = await loadReceipt(connection, request.runId);
        if (existingReceipt) {
            const run = await loadOwnedRun(connection, identity, request.runId);
            if (!run) throw makeError(404, 'authoritative_run_not_found', '权威 run 不存在');
            const ensured = await ensureRunState(connection, run, now);
            return {
                success: true,
                reportVersion: `${REPORT_VERSION}-settlement`,
                receipt: { ...parseJson(existingReceipt.receipt_json, {}), idempotent: true },
                run: await formatRun(connection, ensured.run, ensured.state, ensured.content, { idempotent: true })
            };
        }

        let run = await loadOwnedRun(connection, identity, request.runId);
        if (!run) throw makeError(404, 'authoritative_run_not_found', '权威 run 不存在');
        const ensured = await ensureRunState(connection, run, now);
        run = ensured.run;
        if (String(run.status || '') !== 'completed') {
            throw makeError(409, 'run_not_completed', '权威 run 尚未完成，不能结算');
        }
        if (request.expectedVersion !== clampInt(run.state_version, 0, MAX_ACTIONS)) {
            throw makeError(409, 'stale_run_version', '权威状态已更新，请同步后重试', {
                currentVersion: clampInt(run.state_version, 0, MAX_ACTIONS),
                stateHash: String(run.state_hash || ''),
                run: await formatRun(connection, run, ensured.state, ensured.content)
            });
        }
        let replay;
        try {
            replay = await replayFromGenesis(connection, run);
        } catch (error) {
            error.authoritativeOpsEvent = {
                eventType: 'settlement_replay_rejected',
                run,
                detail: {
                    status: run.status,
                    reason: error.reason || 'journal_replay_failed',
                    actionCount: run.action_count
                },
                durationMs: Date.now() - startedAt,
                now
            };
            throw error;
        }
        if (replay.stateHash !== String(run.state_hash || '')
            || replay.chainHead !== String(run.chain_head || '')
            || stableStringify(replay.state) !== String(run.state_json || '')
            || replay.state.phase !== 'completed'
            || !replay.state.summary
            || replay.state.summary.result !== 'completed') {
            const error = makeError(409, 'settlement_replay_failed', '完整重放与权威终态不一致');
            error.authoritativeOpsEvent = {
                eventType: 'settlement_replay_rejected',
                run,
                detail: {
                    status: run.status,
                    reason: 'final_state_mismatch',
                    actionCount: run.action_count
                },
                durationMs: Date.now() - startedAt,
                now
            };
            throw error;
        }

        const receiptId = deterministicId('arreceipt', [run.run_id, run.state_hash, run.chain_head]);
        const progressionEvent = makeProgressionEvent(run, replay.state, receiptId, now);
        const existingEvent = await dbGet(
            connection,
            `SELECT event_id, activity_mode, source_kind, trust_tier, proof_json
             FROM progression_events
             WHERE user_id = ? AND event_type = 'activity_completed' AND source_ref = ?`,
            [identity, progressionEvent.sourceRef]
        );
        if (existingEvent) {
            const proof = parseJson(existingEvent.proof_json, {});
            if (String(existingEvent.activity_mode || '') !== String(run.activity_mode || '')
                || String(existingEvent.source_kind || '') !== 'authoritative_run_settlement'
                || String(existingEvent.trust_tier || '') !== TRUST_TIER
                || String(proof.runId || '') !== String(run.run_id || '')) {
                throw makeError(409, 'progression_source_conflict', '权威进度来源已绑定其他结算');
            }
            progressionEvent.eventId = String(existingEvent.event_id || progressionEvent.eventId);
        } else {
            await dbRun(
                connection,
                `INSERT INTO progression_events
                    (user_id, event_id, event_type, activity_mode, source_kind, trust_tier, source_ref,
                     battle_wins, boss_wins, activity_completions, pvp_matches, pvp_wins,
                     proof_json, occurred_at, received_at)
                 VALUES (?, ?, 'activity_completed', ?, 'authoritative_run_settlement', ?, ?, ?, ?, 1, 0, 0, ?, ?, ?)`,
                [
                    identity,
                    progressionEvent.eventId,
                    run.activity_mode,
                    TRUST_TIER,
                    progressionEvent.sourceRef,
                    clampInt(replay.state.summary.encountersWon, 0, 16),
                    clampInt(replay.state.summary.bossWins, 0, 4),
                    JSON.stringify(progressionEvent.proof),
                    progressionEvent.occurredAt,
                    now
                ]
            );
        }
        const receiptPayload = {
            reportVersion: `${REPORT_VERSION}-settlement`,
            receiptId,
            runId: run.run_id,
            mode: run.activity_mode,
            protocolVersion: run.protocol_version,
            contentVersion: run.content_version,
            contentHash: run.content_hash,
            authorityLevel: AUTHORITY_LEVEL,
            trustTier: TRUST_TIER,
            eventId: progressionEvent.eventId,
            progressDelta: {
                battleWins: clampInt(replay.state.summary.encountersWon, 0, 16),
                bossWins: clampInt(replay.state.summary.bossWins, 0, 4),
                activityCompletions: 1
            },
            summary: replay.state.summary,
            integrity: {
                actionCount: clampInt(run.action_count, 0, MAX_ACTIONS),
                stateHash: run.state_hash,
                chainHead: run.chain_head,
                replayedFromSequence: 0,
                fullReplayPassed: true
            },
            settledAt: now,
            idempotent: false
        };
        await dbRun(
            connection,
            `INSERT INTO progression_authoritative_run_receipts
                (receipt_id, run_id, user_id, mutation_id, activity_mode, event_id,
                 receipt_json, state_hash, chain_head, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                receiptId,
                run.run_id,
                identity,
                request.mutationId,
                run.activity_mode,
                progressionEvent.eventId,
                JSON.stringify(receiptPayload),
                run.state_hash,
                run.chain_head,
                now
            ]
        );
        await dbRun(
            connection,
            `UPDATE progression_authoritative_runs
             SET status = 'settled', settled_at = ?, updated_at = ?
             WHERE run_id = ? AND user_id = ? AND status = 'completed'`,
            [now, now, run.run_id, identity]
        );
        run = await loadOwnedRun(connection, identity, run.run_id);
        await recordOpsEvent(connection, 'run_settled', run, {
            status: 'settled',
            actionCount: run.action_count
        }, Date.now() - startedAt, now);
        return {
            success: true,
            reportVersion: `${REPORT_VERSION}-settlement`,
            receipt: receiptPayload,
            run: await formatRun(connection, run, replay.state, replay.content)
        };
    });
}

async function getAuthoritativeRunReplay(userId, runId) {
    const identity = String(userId || '').trim();
    const safeRunId = safeId(runId);
    if (!safeRunId) throw makeError(400, 'invalid_run_id', '权威 run id 非法');
    return withReadConnection(async connection => {
        const run = await loadOwnedRun(connection, identity, safeRunId);
        if (!run) throw makeError(404, 'authoritative_run_not_found', '权威 run 不存在');
        const replay = await replayFromGenesis(connection, run);
        if (replay.stateHash !== String(run.state_hash || '') || replay.chainHead !== String(run.chain_head || '')) {
            throw makeError(409, 'replay_integrity_failed', '权威回放与当前终态不一致');
        }
        const actions = await dbAll(
            connection,
            `SELECT action_id, sequence, expected_version, command_type, payload_json,
                    previous_hash, action_hash, result_state_hash, result_phase, created_at
             FROM progression_authoritative_run_actions
             WHERE run_id = ? ORDER BY sequence ASC`,
            [run.run_id]
        );
        return {
            success: true,
            reportVersion: `${REPORT_VERSION}-replay`,
            replay: {
                runId: run.run_id,
                mode: run.activity_mode,
                protocolVersion: run.protocol_version,
                contentVersion: run.content_version,
                contentHash: run.content_hash,
                verified: true,
                actionCount: actions.length,
                stateHash: replay.stateHash,
                chainHead: replay.chainHead,
                actions: actions.map(action => ({
                    actionId: String(action.action_id || ''),
                    sequence: clampInt(action.sequence, 0, MAX_ACTIONS),
                    expectedVersion: clampInt(action.expected_version, 0, MAX_ACTIONS),
                    command: String(action.command_type || ''),
                    payload: parseJson(action.payload_json, {}),
                    previousHash: String(action.previous_hash || ''),
                    actionHash: String(action.action_hash || ''),
                    resultStateHash: String(action.result_state_hash || ''),
                    resultPhase: String(action.result_phase || ''),
                    createdAt: clampInt(action.created_at)
                })),
                finalState: projectState(replay.state, replay.content)
            }
        };
    }, { transaction: true });
}

function mapCounts(rows, key, allowed) {
    const output = Object.fromEntries(allowed.map(value => [value, 0]));
    rows.forEach(row => {
        const value = String(row[key] || '');
        if (Object.prototype.hasOwnProperty.call(output, value)) output[value] = clampInt(row.count);
    });
    return output;
}

async function getAuthoritativeRunOpsOverview(now = Date.now()) {
    return withReadConnection(async connection => {
        const statusRows = await dbAll(
            connection,
            `SELECT status, COUNT(*) AS count FROM progression_authoritative_runs GROUP BY status`
        );
        const modeRows = await dbAll(
            connection,
            `SELECT activity_mode, COUNT(*) AS count FROM progression_authoritative_runs GROUP BY activity_mode`
        );
        const totals = await dbGet(
            connection,
            `SELECT
                (SELECT COUNT(*) FROM progression_authoritative_runs) AS runs,
                (SELECT COUNT(*) FROM progression_authoritative_run_actions) AS actions,
                (SELECT COUNT(*) FROM progression_authoritative_run_snapshots) AS snapshots,
                (SELECT COUNT(*) FROM progression_authoritative_run_receipts) AS receipts,
                (SELECT COALESCE(SUM(recovery_count), 0) FROM progression_authoritative_runs) AS recoveries,
                (SELECT COUNT(*) FROM progression_authoritative_runs WHERE status = 'active' AND expires_at <= ?) AS expired_active`,
            [now]
        );
        const counterRows = await dbAll(
            connection,
            `SELECT event_type, event_count, total_duration_ms, updated_at
             FROM progression_authoritative_run_ops_counters
             ORDER BY event_type ASC`
        );
        const recentRows = await dbAll(
            connection,
            `SELECT event_type, run_id, user_ref, detail_json, created_at
             FROM progression_authoritative_run_ops_events
             ORDER BY created_at DESC, event_id DESC LIMIT 20`
        );
        const counters = {};
        counterRows.forEach(row => {
            const count = clampInt(row.event_count);
            counters[String(row.event_type || '')] = {
                count,
                totalDurationMs: clampInt(row.total_duration_ms),
                averageDurationMs: count > 0 ? Number((clampInt(row.total_duration_ms) / count).toFixed(2)) : 0,
                updatedAt: clampInt(row.updated_at)
            };
        });
        return {
            success: true,
            reportVersion: `${REPORT_VERSION}-ops`,
            generatedAt: now,
            protocolVersion: PROTOCOL_VERSION,
            contentVersion: CONTENT_VERSION,
            limits: {
                maxActions: MAX_ACTIONS,
                maxActionPayloadBytes: MAX_ACTION_PAYLOAD_BYTES,
                maxStateBytes: MAX_STATE_BYTES,
                snapshotInterval: SNAPSHOT_INTERVAL,
                runTtlMs: RUN_TTL_MS,
                retentionDefaultDays: RETENTION_DEFAULT_DAYS
            },
            totals: {
                runs: clampInt(totals && totals.runs),
                actions: clampInt(totals && totals.actions),
                snapshots: clampInt(totals && totals.snapshots),
                receipts: clampInt(totals && totals.receipts),
                recoveries: clampInt(totals && totals.recoveries),
                expiredActive: clampInt(totals && totals.expired_active)
            },
            byStatus: mapCounts(statusRows, 'status', ['active', 'completed', 'settled', 'defeated', 'abandoned', 'expired']),
            byMode: mapCounts(modeRows, 'activity_mode', MODES),
            counters,
            recentEvents: recentRows.map(row => ({
                eventType: String(row.event_type || ''),
                runRef: safeId(row.run_id) ? `run-${sha256(row.run_id).slice(0, 12)}` : '',
                userRef: String(row.user_ref || ''),
                detail: parseJson(row.detail_json, {}),
                createdAt: clampInt(row.created_at)
            }))
        };
    }, { transaction: true });
}

async function pruneAuthoritativeRunHistory(rawDays, now = Date.now()) {
    const requested = rawDays === undefined || rawDays === null || rawDays === ''
        ? RETENTION_DEFAULT_DAYS
        : Math.floor(Number(rawDays));
    if (!Number.isInteger(requested) || requested < RETENTION_MIN_DAYS || requested > RETENTION_MAX_DAYS) {
        throw makeError(400, 'invalid_retention_days', `保留天数必须在 ${RETENTION_MIN_DAYS}-${RETENTION_MAX_DAYS} 之间`);
    }
    const cutoff = now - requested * 24 * 60 * 60 * 1000;
    return withWriteTransaction(async connection => {
        const rows = await dbAll(
            connection,
            `SELECT run_id, status FROM progression_authoritative_runs
             WHERE (status IN ('settled', 'defeated', 'abandoned', 'expired') AND updated_at < ?)
                OR (status = 'active' AND expires_at < ?)
             ORDER BY updated_at ASC LIMIT 1000`,
            [cutoff, cutoff]
        );
        const runIds = rows.map(row => String(row.run_id || '')).filter(Boolean);
        const expiredActiveRuns = rows.filter(row => String(row.status || '') === 'active').length;
        let actions = 0;
        let snapshots = 0;
        let receipts = 0;
        for (const targetRunId of runIds) {
            actions += (await dbRun(connection, `DELETE FROM progression_authoritative_run_actions WHERE run_id = ?`, [targetRunId])).changes;
            snapshots += (await dbRun(connection, `DELETE FROM progression_authoritative_run_snapshots WHERE run_id = ?`, [targetRunId])).changes;
            receipts += (await dbRun(connection, `DELETE FROM progression_authoritative_run_receipts WHERE run_id = ?`, [targetRunId])).changes;
            await dbRun(connection, `DELETE FROM progression_authoritative_runs WHERE run_id = ?`, [targetRunId]);
        }
        await recordOpsEvent(connection, 'retention_pruned', null, {
            status: 'complete',
            deletedRuns: runIds.length,
            expiredActiveRuns
        }, 0, now);
        return {
            success: true,
            reportVersion: `${REPORT_VERSION}-retention`,
            retentionDays: requested,
            cutoff,
            deleted: { runs: runIds.length, actions, snapshots, receipts, expiredActiveRuns }
        };
    });
}

module.exports = {
    AUTHORITY_LEVEL,
    CONTENT_VERSION,
    MAX_ACTIONS,
    MAX_ACTION_PAYLOAD_BYTES,
    MAX_STATE_BYTES,
    PROTOCOL_VERSION,
    REPORT_VERSION,
    RUN_TTL_MS,
    SNAPSHOT_INTERVAL,
    TRUST_TIER,
    getAuthoritativeRun,
    getAuthoritativeRunOpsOverview,
    getAuthoritativeRunReplay,
    getCurrentAuthoritativeRun,
    issueAuthoritativeRun,
    normalizeActionRequest,
    normalizeSettlementRequest,
    normalizeStartRequest,
    pruneAuthoritativeRunHistory,
    settleAuthoritativeRun,
    submitAuthoritativeRunAction
};
