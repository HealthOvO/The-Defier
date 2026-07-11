const crypto = require('node:crypto');
const sqlite3 = require('sqlite3').verbose();
const { dbPath } = require('../db/database');
const { getVerifiedRunOpsOverview } = require('./verified-runs');
const { getAuthoritativeRunOpsOverview } = require('./authoritative-runs/service');
const {
    CATALOG_VERSION,
    DAY_MS,
    OBJECTIVES,
    REWARD_CURRENCY,
    REWARD_IMPACT,
    getCycles,
    getObjective,
    makeReward
} = require('./catalog');

const MAX_EVENT_BATCH = 20;
const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const CLIENT_MODES = new Set(['pve', 'challenge', 'expedition']);
const CLIENT_EVENT_LIMITS = {
    battle_won: 20,
    activity_completed: 10
};
const CLIENT_EVENT_MAX_BACKFILL_MS = DAY_MS;
const CLIENT_EVENT_FUTURE_SKEW_MS = 30 * 1000;
const SAFE_NODE_TYPES = new Set(['enemy', 'elite', 'trial', 'boss', 'ghost_duel']);

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

async function withConnection(fn, { transaction = false, readTransaction = false } = {}) {
    const connection = openDb();
    const usesTransaction = transaction || readTransaction;
    try {
        if (transaction) await dbRun(connection, 'BEGIN IMMEDIATE');
        else if (readTransaction) await dbRun(connection, 'BEGIN');
        const result = await fn(connection);
        if (usesTransaction) await dbRun(connection, 'COMMIT');
        return result;
    } catch (error) {
        if (usesTransaction) {
            try {
                await dbRun(connection, 'ROLLBACK');
            } catch (rollbackError) {
                console.error('[Progression] Rollback failed:', rollbackError);
            }
        }
        throw error;
    } finally {
        await closeDb(connection);
    }
}

function clampInt(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed)) return min;
    return Math.max(min, Math.min(max, parsed));
}

function safeId(value) {
    const text = String(value || '').trim();
    return SAFE_ID.test(text) ? text : '';
}

function sanitizeProof(rawProof, eventType, mode) {
    const proof = rawProof && typeof rawProof === 'object' && !Array.isArray(rawProof) ? rawProof : {};
    const sanitized = {};
    const nodeType = String(proof.nodeType || '').trim();
    if (SAFE_NODE_TYPES.has(nodeType)) sanitized.nodeType = nodeType;
    if (Number.isFinite(Number(proof.realm))) sanitized.realm = clampInt(proof.realm, 1, 999);
    const runId = safeId(proof.runId);
    if (runId) sanitized.runId = runId;
    if (mode === 'challenge') {
        const challengeMode = String(proof.challengeMode || '').trim();
        if (['daily', 'weekly'].includes(challengeMode)) sanitized.challengeMode = challengeMode;
        const rotationKey = safeId(proof.rotationKey);
        const ruleId = safeId(proof.ruleId);
        if (rotationKey) sanitized.rotationKey = rotationKey;
        if (ruleId) sanitized.ruleId = ruleId;
    }
    if (mode === 'expedition') {
        if (Number.isFinite(Number(proof.chapterIndex))) sanitized.chapterIndex = clampInt(proof.chapterIndex, 1, 999);
        if (eventType === 'activity_completed' && String(proof.reason || '') === 'realm_clear') {
            sanitized.reason = 'realm_clear';
        }
    }
    return sanitized;
}

function normalizeClientEvent(rawEvent, receivedAt = Date.now()) {
    const source = rawEvent && typeof rawEvent === 'object' && !Array.isArray(rawEvent) ? rawEvent : null;
    const eventId = safeId(source && source.eventId);
    if (!source || !eventId) return { rejected: true, eventId, reason: 'invalid_event_id' };
    const eventType = String(source.eventType || '').trim();
    if (eventType === 'pvp_match_completed') {
        return { rejected: true, eventId, reason: 'server_only_event' };
    }
    if (!Object.prototype.hasOwnProperty.call(CLIENT_EVENT_LIMITS, eventType)) {
        return { rejected: true, eventId, reason: 'unsupported_event_type' };
    }
    const mode = String(source.mode || '').trim();
    if (!CLIENT_MODES.has(mode)) return { rejected: true, eventId, reason: 'invalid_activity_mode' };
    const sourceRef = safeId(source.sourceRef);
    if (!sourceRef) return { rejected: true, eventId, reason: 'invalid_source_ref' };
    let occurredAt = receivedAt;
    if (source.occurredAt !== undefined && source.occurredAt !== null) {
        const candidate = Math.floor(Number(source.occurredAt));
        if (!Number.isFinite(candidate) || candidate <= 0) {
            return { rejected: true, eventId, reason: 'invalid_event_timestamp' };
        }
        if (candidate < receivedAt - CLIENT_EVENT_MAX_BACKFILL_MS || candidate > receivedAt + CLIENT_EVENT_FUTURE_SKEW_MS) {
            return { rejected: true, eventId, reason: 'event_timestamp_out_of_window' };
        }
        occurredAt = Math.min(candidate, receivedAt);
    }
    const proof = sanitizeProof(source.proof, eventType, mode);
    if (eventType === 'activity_completed' && mode === 'expedition' && proof.reason !== 'realm_clear') {
        return { rejected: true, eventId, reason: 'invalid_completion_proof' };
    }
    return {
        eventId,
        eventType,
        mode,
        sourceKind: 'client_event_batch',
        trustTier: 'client_observed',
        sourceRef,
        battleWins: eventType === 'battle_won' ? 1 : 0,
        bossWins: eventType === 'battle_won' && proof.nodeType === 'boss' ? 1 : 0,
        activityCompletions: eventType === 'activity_completed' ? 1 : 0,
        pvpMatches: 0,
        pvpWins: 0,
        occurredAt,
        proof
    };
}

function getCycleForObjective(cycles, objective) {
    return cycles[objective.scope];
}

function getMetricColumn(metric) {
    const columns = {
        battle_wins: 'battle_wins',
        boss_wins: 'boss_wins',
        activity_completions: 'activity_completions',
        pvp_matches: 'pvp_matches',
        pvp_wins: 'pvp_wins'
    };
    return columns[metric] || '';
}

function makeEventWhere(objective, cycle) {
    const where = ['user_id = ?'];
    const params = [];
    if (cycle.startsAt > 0) {
        where.push('occurred_at >= ?', 'occurred_at < ?');
        params.push(cycle.startsAt, cycle.endsAt);
    }
    if (objective.trustRequirement === 'server_authoritative') {
        where.push("trust_tier = 'server_authoritative'");
    } else if (objective.trustRequirement === 'server_verified') {
        where.push("trust_tier IN ('server_verified', 'server_authoritative')");
    }
    return { where, params };
}

async function computeObjectiveValue(connection, userId, objective, cycle) {
    const filter = makeEventWhere(objective, cycle);
    const params = [userId, ...filter.params];
    if (objective.metric === 'distinct_modes') {
        const row = await dbGet(
            connection,
            `SELECT COUNT(DISTINCT activity_mode) AS value
             FROM progression_events
             WHERE ${filter.where.join(' AND ')}
               AND (battle_wins > 0 OR activity_completions > 0 OR pvp_matches > 0)`,
            params
        );
        return clampInt(row && row.value);
    }
    const column = getMetricColumn(objective.metric);
    const row = await dbGet(
        connection,
        `SELECT COALESCE(SUM(${column}), 0) AS value
         FROM progression_events
         WHERE ${filter.where.join(' AND ')}`,
        params
    );
    return clampInt(row && row.value);
}

async function computeObjectiveCompletionAt(connection, userId, objective, cycle) {
    const filter = makeEventWhere(objective, cycle);
    const params = [userId, ...filter.params];
    if (objective.metric === 'distinct_modes') {
        const rows = await dbAll(
            connection,
            `SELECT activity_mode, occurred_at
             FROM progression_events
             WHERE ${filter.where.join(' AND ')}
               AND (battle_wins > 0 OR activity_completions > 0 OR pvp_matches > 0)
             ORDER BY occurred_at ASC, event_id ASC`,
            params
        );
        const modes = new Set();
        for (const row of rows) {
            modes.add(String(row.activity_mode || ''));
            if (modes.size >= objective.target) return clampInt(row.occurred_at);
        }
        return 0;
    }
    const column = getMetricColumn(objective.metric);
    const rows = await dbAll(
        connection,
        `SELECT ${column} AS amount, occurred_at
         FROM progression_events
         WHERE ${filter.where.join(' AND ')} AND ${column} > 0
         ORDER BY occurred_at ASC, event_id ASC`,
        params
    );
    let total = 0;
    for (const row of rows) {
        total += clampInt(row.amount);
        if (total >= objective.target) return clampInt(row.occurred_at);
    }
    return 0;
}

async function syncObjective(connection, userId, objective, cycles, now) {
    const cycle = getCycleForObjective(cycles, objective);
    const value = await computeObjectiveValue(connection, userId, objective, cycle);
    const completedAt = value >= objective.target
        ? await computeObjectiveCompletionAt(connection, userId, objective, cycle)
        : 0;
    await dbRun(
        connection,
        `INSERT INTO progression_objective_progress
            (user_id, cycle_type, cycle_id, objective_id, current_value, target_value, completed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, cycle_id, objective_id) DO UPDATE SET
            current_value = excluded.current_value,
            target_value = excluded.target_value,
            completed_at = CASE
                WHEN progression_objective_progress.completed_at > 0 THEN progression_objective_progress.completed_at
                ELSE excluded.completed_at
            END,
            updated_at = excluded.updated_at`,
        [userId, objective.scope, cycle.id, objective.objectiveId, value, objective.target, completedAt, now]
    );
    const stored = await dbGet(
        connection,
        `SELECT current_value, completed_at
         FROM progression_objective_progress
         WHERE user_id = ? AND cycle_id = ? AND objective_id = ?`,
        [userId, cycle.id, objective.objectiveId]
    );
    return {
        objective,
        cycle,
        current: clampInt(stored && stored.current_value),
        completedAt: clampInt(stored && stored.completed_at)
    };
}

async function readObjective(connection, userId, objective, cycles) {
    const cycle = getCycleForObjective(cycles, objective);
    const value = await computeObjectiveValue(connection, userId, objective, cycle);
    const stored = await dbGet(
        connection,
        `SELECT completed_at
         FROM progression_objective_progress
         WHERE user_id = ? AND cycle_id = ? AND objective_id = ?`,
        [userId, cycle.id, objective.objectiveId]
    );
    const storedCompletedAt = clampInt(stored && stored.completed_at);
    const completedAt = storedCompletedAt || (value >= objective.target
        ? await computeObjectiveCompletionAt(connection, userId, objective, cycle)
        : 0);
    return { objective, cycle, current: value, completedAt };
}

async function readObjectives(connection, userId, now) {
    const cycles = getCycles(now);
    const rows = [];
    for (const objective of OBJECTIVES) {
        rows.push(await readObjective(connection, userId, objective, cycles));
    }
    return { cycles, rows };
}

async function syncObjectives(connection, userId, now) {
    const cycles = getCycles(now);
    const rows = [];
    for (const objective of OBJECTIVES) {
        rows.push(await syncObjective(connection, userId, objective, cycles, now));
    }
    return { cycles, rows };
}

function makeEventReceipt(event, receivedAt) {
    return {
        eventId: event.eventId,
        eventType: event.eventType,
        mode: event.mode,
        trustTier: event.trustTier,
        occurredAt: clampInt(event.occurredAt || receivedAt),
        receivedAt
    };
}

async function insertEvent(connection, userId, event, receivedAt) {
    return dbRun(
        connection,
        `INSERT INTO progression_events
            (user_id, event_id, event_type, activity_mode, source_kind, trust_tier, source_ref,
             battle_wins, boss_wins, activity_completions, pvp_matches, pvp_wins, proof_json, occurred_at, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            userId,
            event.eventId,
            event.eventType,
            event.mode,
            event.sourceKind,
            event.trustTier,
            event.sourceRef,
            event.battleWins,
            event.bossWins,
            event.activityCompletions,
            event.pvpMatches,
            event.pvpWins,
            JSON.stringify(event.proof || {}),
            clampInt(event.occurredAt || receivedAt),
            receivedAt
        ]
    );
}

async function recordClientEvents(userId, rawEvents, now = Date.now()) {
    if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
        const error = new Error('events must be a non-empty array');
        error.statusCode = 400;
        error.reason = 'invalid_event_batch';
        throw error;
    }
    if (rawEvents.length > MAX_EVENT_BATCH) {
        const error = new Error(`event batch exceeds ${MAX_EVENT_BATCH}`);
        error.statusCode = 400;
        error.reason = 'event_batch_too_large';
        throw error;
    }
    const normalized = rawEvents.map(event => normalizeClientEvent(event, now));
    const preRejected = normalized.filter(entry => entry.rejected).map(entry => ({
        eventId: entry.eventId || '',
        reason: entry.reason
    }));
    const validEvents = normalized.filter(entry => !entry.rejected);
    return withConnection(async connection => {
        const accepted = [];
        const duplicates = [];
        const rejected = preRejected.slice();
        for (const event of validEvents) {
            const existing = await dbGet(
                connection,
                `SELECT event_id, event_type, activity_mode, trust_tier, occurred_at, received_at
                 FROM progression_events
                 WHERE user_id = ? AND (event_id = ? OR (event_type = ? AND source_ref = ?))
                 LIMIT 1`,
                [userId, event.eventId, event.eventType, event.sourceRef]
            );
            if (existing) {
                duplicates.push({
                    eventId: String(existing.event_id || event.eventId),
                    eventType: String(existing.event_type || event.eventType),
                    mode: String(existing.activity_mode || event.mode),
                    trustTier: String(existing.trust_tier || event.trustTier),
                    occurredAt: clampInt(existing.occurred_at || existing.received_at),
                    receivedAt: clampInt(existing.received_at)
                });
                continue;
            }
            const limit = CLIENT_EVENT_LIMITS[event.eventType];
            const dayStart = Math.floor(event.occurredAt / DAY_MS) * DAY_MS;
            const countRow = await dbGet(
                connection,
                `SELECT COUNT(*) AS count
                 FROM progression_events
                 WHERE user_id = ? AND event_type = ? AND activity_mode = ?
                   AND trust_tier = 'client_observed' AND occurred_at >= ? AND occurred_at < ?`,
                [userId, event.eventType, event.mode, dayStart, dayStart + DAY_MS]
            );
            if (clampInt(countRow && countRow.count) >= limit) {
                rejected.push({ eventId: event.eventId, reason: 'daily_event_limit' });
                continue;
            }
            try {
                await insertEvent(connection, userId, event, now);
                accepted.push(makeEventReceipt(event, now));
            } catch (error) {
                if (String(error && error.code || '').includes('SQLITE_CONSTRAINT')) {
                    duplicates.push(makeEventReceipt(event, now));
                    continue;
                }
                throw error;
            }
        }
        if (accepted.length > 0) await syncObjectives(connection, userId, now);
        return {
            success: true,
            reportVersion: 'account-progression-event-batch-v1',
            authorityBoundary: 'client events are observed, rate-limited, and never affect combat power or PVP rating',
            accepted,
            duplicates,
            rejected
        };
    }, { transaction: true });
}

async function getStatus(userId, now = Date.now()) {
    return withConnection(async connection => {
        const snapshot = await readObjectives(connection, userId, now);
        const claims = await dbAll(
            connection,
            `SELECT cycle_id, objective_id, claimed_at
             FROM progression_reward_claims
             WHERE user_id = ?`,
            [userId]
        );
        const claimKeys = new Map(claims.map(row => [`${row.cycle_id}|${row.objective_id}`, clampInt(row.claimed_at)]));
        const balances = await dbAll(
            connection,
            `SELECT currency, balance, lifetime_earned, lifetime_spent, updated_at
             FROM progression_economy_balances
             WHERE user_id = ?
             ORDER BY currency ASC`,
            [userId]
        );
        const recentEvents = await dbAll(
            connection,
            `SELECT event_type, activity_mode, trust_tier, occurred_at, received_at
             FROM progression_events
             WHERE user_id = ?
             ORDER BY received_at DESC, event_id DESC
             LIMIT 12`,
            [userId]
        );
        const objectives = snapshot.rows.map(({ objective, cycle, current, completedAt }) => {
            const claimedAt = claimKeys.get(`${cycle.id}|${objective.objectiveId}`) || 0;
            const claimWindowOpen = objective.scope !== 'season' || ['active', 'grace'].includes(String(cycle && cycle.state || ''));
            return {
                objectiveId: objective.objectiveId,
                title: objective.title,
                scope: objective.scope,
                cycleId: cycle.id,
                current,
                target: objective.target,
                completed: current >= objective.target,
                completedAt,
                claimable: current >= objective.target && claimedAt === 0 && claimWindowOpen,
                claimWindowOpen,
                claimed: claimedAt > 0,
                claimedAt,
                trustRequirement: objective.trustRequirement,
                reward: makeReward(objective)
            };
        });
        const normalizedBalances = balances.map(row => ({
            currency: String(row.currency || ''),
            balance: clampInt(row.balance),
            lifetimeEarned: clampInt(row.lifetime_earned),
            lifetimeSpent: clampInt(row.lifetime_spent),
            updatedAt: clampInt(row.updated_at),
            spendPolicy: 'cosmetic_only'
        }));
        if (!normalizedBalances.some(entry => entry.currency === REWARD_CURRENCY)) {
            normalizedBalances.push({
                currency: REWARD_CURRENCY,
                balance: 0,
                lifetimeEarned: 0,
                lifetimeSpent: 0,
                updatedAt: 0,
                spendPolicy: 'cosmetic_only'
            });
        }
        return {
            success: true,
            reportVersion: 'account-progression-status-v1',
            catalogVersion: CATALOG_VERSION,
            generatedAt: now,
            authorityBoundary: {
                serverAuthoritative: ['pvp_live', 'pve', 'challenge', 'expedition'],
                serverAuthoritativeSourceKinds: ['live_pvp_settlement', 'authoritative_run_settlement'],
                serverVerified: ['pve', 'challenge', 'expedition'],
                clientObserved: ['pve', 'challenge', 'expedition'],
                legacyRunCompatibility: 'legacy PVE, challenge, and expedition remain observed or verified-envelope; only Authoritative Trials V2 mint authoritative events',
                clientObservedRewardImpact: REWARD_IMPACT
            },
            cycles: snapshot.cycles,
            objectives,
            balances: normalizedBalances,
            recentEvents: recentEvents.map(row => ({
                eventType: String(row.event_type || ''),
                mode: String(row.activity_mode || ''),
                trustTier: String(row.trust_tier || ''),
                occurredAt: clampInt(row.occurred_at || row.received_at),
                receivedAt: clampInt(row.received_at)
            }))
        };
    }, { readTransaction: true });
}

function deterministicId(prefix, parts) {
    return `${prefix}-${crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32)}`;
}

async function claimReward(userId, objectiveId, requestedCycleId, now = Date.now()) {
    const objective = getObjective(objectiveId);
    if (!objective) {
        const error = new Error('objective not found');
        error.statusCode = 404;
        error.reason = 'objective_not_found';
        throw error;
    }
    const cycles = getCycles(now);
    const cycle = cycles[objective.scope];
    if (objective.scope === 'season' && !['active', 'grace'].includes(String(cycle && cycle.state || ''))) {
        const error = new Error('season reward claim window is closed');
        error.statusCode = 409;
        error.reason = 'season_claim_window_closed';
        throw error;
    }
    if (String(requestedCycleId || '') !== cycle.id) {
        const error = new Error('reward cycle is not current');
        error.statusCode = 409;
        error.reason = 'cycle_not_current';
        throw error;
    }
    return withConnection(async connection => {
        const progress = await syncObjective(connection, userId, objective, cycles, now);
        if (progress.current < objective.target) {
            const error = new Error('objective is not completed');
            error.statusCode = 409;
            error.reason = 'objective_not_completed';
            throw error;
        }
        const reward = makeReward(objective);
        const claimId = deterministicId('progression-claim', [userId, cycle.id, objective.objectiveId]);
        const claimInsert = await dbRun(
            connection,
            `INSERT OR IGNORE INTO progression_reward_claims
                (claim_id, user_id, cycle_type, cycle_id, objective_id, reward_type, currency, amount,
                 reward_impact, trust_requirement, claim_payload_json, claimed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                claimId,
                userId,
                objective.scope,
                cycle.id,
                objective.objectiveId,
                reward.rewardType,
                reward.currency,
                reward.amount,
                reward.rewardImpact,
                objective.trustRequirement,
                JSON.stringify({ catalogVersion: CATALOG_VERSION, spendPolicy: reward.spendPolicy }),
                now
            ]
        );
        const alreadyClaimed = claimInsert.changes === 0;
        if (!alreadyClaimed) {
            await dbRun(
                connection,
                `INSERT INTO progression_economy_balances
                    (user_id, currency, balance, lifetime_earned, lifetime_spent, updated_at)
                 VALUES (?, ?, ?, ?, 0, ?)
                 ON CONFLICT(user_id, currency) DO UPDATE SET
                    balance = progression_economy_balances.balance + excluded.balance,
                    lifetime_earned = progression_economy_balances.lifetime_earned + excluded.lifetime_earned,
                    updated_at = excluded.updated_at`,
                [userId, reward.currency, reward.amount, reward.amount, now]
            );
        }
        const balanceRow = await dbGet(
            connection,
            `SELECT currency, balance, lifetime_earned, lifetime_spent, updated_at
             FROM progression_economy_balances
             WHERE user_id = ? AND currency = ?`,
            [userId, reward.currency]
        );
        if (!alreadyClaimed) {
            await dbRun(
                connection,
                `INSERT INTO progression_economy_ledger
                    (entry_id, user_id, currency, delta, balance_after, reason, source_type, source_id,
                     reward_impact, metadata_json, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    deterministicId('progression-ledger', [userId, cycle.id, objective.objectiveId, reward.currency]),
                    userId,
                    reward.currency,
                    reward.amount,
                    clampInt(balanceRow && balanceRow.balance),
                    objective.title,
                    'objective_reward',
                    `objective:${cycle.id}:${objective.objectiveId}`,
                    reward.rewardImpact,
                    JSON.stringify({ catalogVersion: CATALOG_VERSION, trustRequirement: objective.trustRequirement }),
                    now
                ]
            );
        }
        const claimRow = await dbGet(
            connection,
            `SELECT claim_id, cycle_type, cycle_id, objective_id, reward_type, currency, amount,
                    reward_impact, trust_requirement, claimed_at
             FROM progression_reward_claims
             WHERE user_id = ? AND cycle_id = ? AND objective_id = ?`,
            [userId, cycle.id, objective.objectiveId]
        );
        return {
            success: true,
            reportVersion: 'account-progression-reward-claim-v1',
            alreadyClaimed,
            claim: {
                claimId: String(claimRow.claim_id || ''),
                cycleType: String(claimRow.cycle_type || ''),
                cycleId: String(claimRow.cycle_id || ''),
                objectiveId: String(claimRow.objective_id || ''),
                rewardType: String(claimRow.reward_type || ''),
                currency: String(claimRow.currency || ''),
                amount: clampInt(claimRow.amount),
                rewardImpact: String(claimRow.reward_impact || REWARD_IMPACT),
                trustRequirement: String(claimRow.trust_requirement || ''),
                claimedAt: clampInt(claimRow.claimed_at)
            },
            balance: {
                currency: reward.currency,
                balance: clampInt(balanceRow && balanceRow.balance),
                lifetimeEarned: clampInt(balanceRow && balanceRow.lifetime_earned),
                lifetimeSpent: clampInt(balanceRow && balanceRow.lifetime_spent),
                spendPolicy: 'cosmetic_only'
            }
        };
    }, { transaction: true });
}

function parseLedgerCursor(rawCursor) {
    const text = String(rawCursor || '').trim();
    const separator = text.indexOf(':');
    if (separator <= 0) return null;
    const createdAt = clampInt(text.slice(0, separator));
    const entryId = safeId(text.slice(separator + 1));
    return createdAt > 0 && entryId ? { createdAt, entryId } : null;
}

function makeLedgerCursor(row) {
    return `${clampInt(row && row.created_at)}:${String(row && row.entry_id || '')}`;
}

async function getLedger(userId, { limit = 20, cursor = '' } = {}) {
    const safeLimit = clampInt(limit, 1, 50);
    const safeCursor = parseLedgerCursor(cursor);
    return withConnection(async connection => {
        const where = ['user_id = ?'];
        const params = [userId];
        if (safeCursor) {
            where.push('(created_at < ? OR (created_at = ? AND entry_id < ?))');
            params.push(safeCursor.createdAt, safeCursor.createdAt, safeCursor.entryId);
        }
        params.push(safeLimit + 1);
        const rows = await dbAll(
            connection,
            `SELECT entry_id, currency, delta, balance_after, reason, source_type, source_id,
                    reward_impact, created_at
             FROM progression_economy_ledger
             WHERE ${where.join(' AND ')}
             ORDER BY created_at DESC, entry_id DESC
             LIMIT ?`,
            params
        );
        const page = rows.slice(0, safeLimit);
        return {
            success: true,
            reportVersion: 'account-progression-ledger-v1',
            entries: page.map(row => ({
                entryId: String(row.entry_id || ''),
                currency: String(row.currency || ''),
                delta: Math.floor(Number(row.delta) || 0),
                balanceAfter: clampInt(row.balance_after),
                reason: String(row.reason || ''),
                sourceType: String(row.source_type || ''),
                sourceId: String(row.source_id || ''),
                rewardImpact: String(row.reward_impact || REWARD_IMPACT),
                createdAt: clampInt(row.created_at)
            })),
            nextCursor: rows.length > safeLimit && page.length > 0 ? makeLedgerCursor(page[page.length - 1]) : null
        };
    });
}

function mapCounts(rows, key, allowed) {
    const output = Object.fromEntries(allowed.map(value => [value, 0]));
    for (const row of rows) {
        const value = String(row[key] || '');
        if (Object.prototype.hasOwnProperty.call(output, value)) output[value] = clampInt(row.count);
    }
    return output;
}

async function countCompletedAccounts(connection, objective, cycle) {
    const filter = makeEventWhere(objective, cycle);
    const aggregateWhere = filter.where.filter(part => part !== 'user_id = ?');
    const whereSql = aggregateWhere.length > 0 ? aggregateWhere.join(' AND ') : '1 = 1';
    const params = [...filter.params, objective.target];
    if (objective.metric === 'distinct_modes') {
        const row = await dbGet(
            connection,
            `SELECT COUNT(*) AS count
             FROM (
                SELECT user_id
                FROM progression_events
                WHERE ${whereSql}
                  AND (battle_wins > 0 OR activity_completions > 0 OR pvp_matches > 0)
                GROUP BY user_id
                HAVING COUNT(DISTINCT activity_mode) >= ?
             )`,
            params
        );
        return clampInt(row && row.count);
    }
    const column = getMetricColumn(objective.metric);
    const row = await dbGet(
        connection,
        `SELECT COUNT(*) AS count
         FROM (
            SELECT user_id
            FROM progression_events
            WHERE ${whereSql}
            GROUP BY user_id
            HAVING SUM(${column}) >= ?
         )`,
        params
    );
    return clampInt(row && row.count);
}

async function getOpsOverview(now = Date.now()) {
    const cycles = getCycles(now);
    const overview = await withConnection(async connection => {
        const [eventTotal, activeUsers, modeRows, trustRows, economy] = await Promise.all([
            dbGet(connection, 'SELECT COUNT(*) AS count FROM progression_events'),
            dbGet(connection, 'SELECT COUNT(DISTINCT user_id) AS count FROM progression_events'),
            dbAll(connection, 'SELECT activity_mode, COUNT(*) AS count FROM progression_events GROUP BY activity_mode'),
            dbAll(connection, 'SELECT trust_tier, COUNT(*) AS count FROM progression_events GROUP BY trust_tier'),
            dbGet(
                connection,
                `SELECT
                    (SELECT COUNT(*) FROM progression_reward_claims) AS claims,
                    (SELECT COALESCE(SUM(delta), 0) FROM progression_economy_ledger) AS ledger_delta,
                    (SELECT COALESCE(SUM(balance), 0) FROM progression_economy_balances) AS balances`
            )
        ]);
        const completedByObjective = {};
        for (const objective of OBJECTIVES) {
            completedByObjective[objective.objectiveId] = await countCompletedAccounts(
                connection,
                objective,
                cycles[objective.scope]
            );
        }
        const acceptedEvents = clampInt(eventTotal && eventTotal.count);
        const trustCounts = mapCounts(trustRows, 'trust_tier', ['server_authoritative', 'server_verified', 'client_observed']);
        const authoritativeEvents = trustCounts.server_authoritative;
        return {
            success: true,
            reportVersion: 'account-progression-ops-overview-v1',
            catalogVersion: CATALOG_VERSION,
            generatedAt: now,
            cycles,
            activity: {
                acceptedEvents,
                activeAccounts: clampInt(activeUsers && activeUsers.count),
                byMode: mapCounts(modeRows, 'activity_mode', ['pve', 'challenge', 'expedition', 'pvp_live']),
                byTrust: trustCounts,
                authoritativeShare: acceptedEvents > 0 ? Number((authoritativeEvents / acceptedEvents).toFixed(4)) : 0,
                verifiedShare: acceptedEvents > 0 ? Number((trustCounts.server_verified / acceptedEvents).toFixed(4)) : 0
            },
            objectives: {
                completedByObjective
            },
            economy: {
                currency: REWARD_CURRENCY,
                rewardImpact: REWARD_IMPACT,
                claims: clampInt(economy && economy.claims),
                ledgerDelta: Math.floor(Number(economy && economy.ledger_delta) || 0),
                outstandingBalance: clampInt(economy && economy.balances)
            },
            recommendedActions: acceptedEvents === 0
                ? ['seed_cross_mode_activity']
                : authoritativeEvents === 0 && trustCounts.server_verified === 0
                    ? ['expand_server_authoritative_settlements']
                    : ['monitor_mode_mix_and_claim_rate']
        };
    });
    return {
        ...overview,
        verifiedRuns: await getVerifiedRunOpsOverview(now),
        authoritativeRuns: await getAuthoritativeRunOpsOverview(now)
    };
}

function makeTrustedPvpProgressionEvent({ userId, matchId, didWin, finishReason }) {
    const safeUserId = String(userId || '').trim();
    const safeMatchId = safeId(matchId);
    if (!safeUserId || !safeMatchId) return null;
    return {
        eventId: `pvp-${crypto.createHash('sha256').update(safeMatchId).digest('hex').slice(0, 32)}`,
        eventType: 'pvp_match_completed',
        mode: 'pvp_live',
        sourceKind: 'live_pvp_settlement',
        trustTier: 'server_authoritative',
        sourceRef: safeMatchId,
        battleWins: 0,
        bossWins: 0,
        activityCompletions: 1,
        pvpMatches: 1,
        pvpWins: didWin ? 1 : 0,
        proof: {
            didWin: !!didWin,
            finishReason: String(finishReason || '').trim().slice(0, 64)
        }
    };
}

async function recordTrustedPvpSettlement(input, now = Date.now()) {
    const event = makeTrustedPvpProgressionEvent(input || {});
    if (!event) return { recorded: false, reason: 'invalid_trusted_event' };
    return withConnection(async connection => {
        const existing = await dbGet(
            connection,
            `SELECT event_id FROM progression_events WHERE user_id = ? AND event_type = ? AND source_ref = ?`,
            [input.userId, event.eventType, event.sourceRef]
        );
        if (existing) return { recorded: false, duplicate: true, eventId: String(existing.event_id || event.eventId) };
        await insertEvent(connection, input.userId, event, now);
        await syncObjectives(connection, input.userId, now);
        return { recorded: true, eventId: event.eventId, trustTier: event.trustTier };
    }, { transaction: true });
}

module.exports = {
    MAX_EVENT_BATCH,
    claimReward,
    getLedger,
    getOpsOverview,
    getStatus,
    makeTrustedPvpProgressionEvent,
    normalizeClientEvent,
    recordClientEvents,
    recordTrustedPvpSettlement
};
