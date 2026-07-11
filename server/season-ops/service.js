const crypto = require('node:crypto');
const sqlite3 = require('sqlite3').verbose();
const { dbPath } = require('../db/database');
const {
    CATALOG_VERSION,
    OFFERS,
    PROTOCOL_VERSION,
    REWARD_CURRENCY,
    REWARD_IMPACT,
    SETTLEMENT_FINALIZATION_DELAY_MS,
    SEASON_OBJECTIVES,
    SEASONS,
    getOffer,
    getSeasonById,
    getSeasonCycle,
    getSeasonForTime,
    getSeasonState,
    getSettlementTier
} = require('./catalog');

const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const COMPENSATION_REASON_CODES = new Set([
    'service_incident',
    'settlement_repair',
    'support_resolution'
]);
const MAX_COMPENSATION_RENOWN = 5000;

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
                console.error('[SeasonOps] Read rollback failed:', rollbackError);
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
            console.error('[SeasonOps] Write rollback failed:', rollbackError);
        }
        throw error;
    } finally {
        await closeDb(connection);
        releaseQueue();
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

function stableStringify(value) {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(',')}]`;
    if (typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function makeHash(value) {
    return crypto.createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}

function deterministicId(prefix, parts) {
    return `${prefix}-${crypto.createHash('sha256').update(parts.join('|'), 'utf8').digest('hex').slice(0, 32)}`;
}

function makeError(statusCode, reason, message, extra = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.reason = reason;
    if (extra && typeof extra === 'object') Object.assign(error, extra);
    return error;
}

function makeMutationConflictError() {
    return makeError(409, 'mutation_reused', 'mutationId 已被其他请求占用');
}

function parseJsonObject(value) {
    try {
        const parsed = JSON.parse(String(value || '{}'));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        return {};
    }
}

function isPendingOfficialSeasonMatch(row, season) {
    const state = parseJsonObject(row && row.state_json);
    if (String(state.mode || 'ranked') === 'friendly' || state.testMatchScope) return false;

    if (String(row && row.status || '') === 'finished') {
        const events = Array.isArray(state.events) ? state.events : [];
        const finishedEvent = events.slice().reverse().find(event => event && event.eventType === 'match_finished');
        const payload = finishedEvent && finishedEvent.payload && typeof finishedEvent.payload === 'object'
            ? finishedEvent.payload
            : {};
        if (String(payload.winnerSeat || '') === 'draw' || String(payload.finishReason || '') === 'round14_draw') {
            return false;
        }
    }

    const battleStartedAt = clampInt(state && state.setup && state.setup.battleStartedAt);
    const anchorTime = battleStartedAt > 0 ? battleStartedAt : clampInt(row && row.created_at);
    return anchorTime >= season.startsAt && anchorTime < season.endsAt;
}

async function getPendingOfficialSeasonMatchCount(connection, season) {
    const rows = await dbAll(
        connection,
        `SELECT m.match_id, m.status, m.state_json, m.created_at
         FROM pvp_live_matches m
         LEFT JOIN pvp_live_match_settlements s ON s.match_id = m.match_id
         WHERE m.created_at < ?
           AND (
             m.status = 'active'
             OR (m.status = 'finished' AND s.match_id IS NULL)
           )`,
        [season.endsAt]
    );
    return rows.reduce((count, row) => count + (isPendingOfficialSeasonMatch(row, season) ? 1 : 0), 0);
}

function makeDailyCycle(now = Date.now()) {
    const at = new Date(now);
    const start = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
    return {
        type: 'daily',
        id: `daily:${new Date(start).toISOString().slice(0, 10)}`,
        startsAt: start,
        endsAt: start + 24 * 60 * 60 * 1000
    };
}

function makeWeeklyCycle(now = Date.now()) {
    const day = makeDailyCycle(now);
    const weekday = new Date(day.startsAt).getUTCDay();
    const daysSinceMonday = (weekday + 6) % 7;
    const start = day.startsAt - daysSinceMonday * 24 * 60 * 60 * 1000;
    return {
        type: 'weekly',
        id: `weekly:${new Date(start).toISOString().slice(0, 10)}`,
        startsAt: start,
        endsAt: start + 7 * 24 * 60 * 60 * 1000
    };
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

function getTrustWhere(objective) {
    const trustRequirement = String(objective && objective.trustRequirement || '');
    if (trustRequirement === 'server_authoritative') {
        return {
            sql: "AND trust_tier = 'server_authoritative'",
            params: []
        };
    }
    if (trustRequirement === 'server_verified') {
        return {
            sql: "AND trust_tier IN ('server_verified', 'server_authoritative')",
            params: []
        };
    }
    return { sql: '', params: [] };
}

function getObjectiveCycle(objective, season, now) {
    if (objective.scope === 'daily') return makeDailyCycle(now);
    if (objective.scope === 'weekly') return makeWeeklyCycle(now);
    if (objective.scope === 'season') return getSeasonCycle(season, now);
    return { type: objective.scope, id: objective.scope, startsAt: 0, endsAt: 0 };
}

async function computeObjectiveValue(connection, userId, objective, cycle) {
    const trust = getTrustWhere(objective);
    const params = [userId];
    let timeSql = '';
    if (cycle.startsAt > 0) {
        timeSql = 'AND occurred_at >= ? AND occurred_at < ?';
        params.push(cycle.startsAt, cycle.endsAt);
    }
    if (objective.metric === 'distinct_modes') {
        const row = await dbGet(
            connection,
            `SELECT COUNT(DISTINCT activity_mode) AS value
             FROM progression_events
             WHERE user_id = ?
               ${timeSql}
               ${trust.sql}
               AND (battle_wins > 0 OR activity_completions > 0 OR pvp_matches > 0)`,
            params.concat(trust.params)
        );
        return clampInt(row && row.value);
    }
    const column = getMetricColumn(objective.metric);
    const row = await dbGet(
        connection,
        `SELECT COALESCE(SUM(${column}), 0) AS value
         FROM progression_events
         WHERE user_id = ?
           ${timeSql}
           ${trust.sql}`,
        params.concat(trust.params)
    );
    return clampInt(row && row.value);
}

async function readSeasonObjectiveSnapshot(connection, userId, season, now) {
    const objectives = [];
    const seasonState = getSeasonState(season, now);
    const claimWindowOpen = seasonState.isActive || seasonState.isGrace;
    for (const objective of SEASON_OBJECTIVES) {
        if (objective.seasonId && objective.seasonId !== season.seasonId) continue;
        const cycle = getObjectiveCycle(objective, season, now);
        const value = await computeObjectiveValue(connection, userId, objective, cycle);
        const claimRow = await dbGet(
            connection,
            `SELECT claimed_at
             FROM progression_reward_claims
             WHERE user_id = ? AND cycle_id = ? AND objective_id = ?`,
            [userId, cycle.id, objective.objectiveId]
        );
        objectives.push({
            objectiveId: objective.objectiveId,
            title: objective.title,
            scope: objective.scope,
            cycleId: cycle.id,
            current: value,
            target: clampInt(objective.target),
            completed: value >= clampInt(objective.target),
            claimable: value >= clampInt(objective.target) && !claimRow && claimWindowOpen,
            claimWindowOpen,
            claimed: !!claimRow,
            claimedAt: clampInt(claimRow && claimRow.claimed_at),
            trustRequirement: objective.trustRequirement,
            reward: {
                rewardType: 'currency',
                currency: REWARD_CURRENCY,
                amount: clampInt(objective.reward),
                rewardImpact: REWARD_IMPACT,
                spendPolicy: 'cosmetic_only'
            }
        });
    }
    return objectives;
}

async function ensureWalletRow(connection, userId, now = Date.now()) {
    await dbRun(
        connection,
        `INSERT OR IGNORE INTO progression_economy_balances
            (user_id, currency, balance, lifetime_earned, lifetime_spent, updated_at)
         VALUES (?, ?, 0, 0, 0, ?)`,
        [userId, REWARD_CURRENCY, now]
    );
}

async function getWalletRow(connection, userId) {
    const row = await dbGet(
        connection,
        `SELECT currency, balance, lifetime_earned, lifetime_spent, updated_at
         FROM progression_economy_balances
         WHERE user_id = ? AND currency = ?`,
        [userId, REWARD_CURRENCY]
    );
    return {
        currency: REWARD_CURRENCY,
        balance: clampInt(row && row.balance),
        lifetimeEarned: clampInt(row && row.lifetime_earned),
        lifetimeSpent: clampInt(row && row.lifetime_spent),
        updatedAt: clampInt(row && row.updated_at),
        spendPolicy: 'cosmetic_only'
    };
}

function normalizeWallet(wallet) {
    return {
        currency: REWARD_CURRENCY,
        balance: clampInt(wallet && wallet.balance),
        lifetimeEarned: clampInt(wallet && wallet.lifetimeEarned),
        lifetimeSpent: clampInt(wallet && wallet.lifetimeSpent),
        updatedAt: clampInt(wallet && wallet.updatedAt),
        spendPolicy: 'cosmetic_only'
    };
}

async function getOwnedEntitlements(connection, userId) {
    const rows = await dbAll(
        connection,
        `SELECT entitlement_id, entitlement_key, entitlement_type, source_type, source_id, season_id, granted_at
         FROM season_ops_entitlements
         WHERE user_id = ?
         ORDER BY granted_at DESC, entitlement_id DESC`,
        [userId]
    );
    return rows.map(row => ({
        entitlementId: String(row.entitlement_id || ''),
        entitlementKey: String(row.entitlement_key || ''),
        entitlementType: String(row.entitlement_type || ''),
        sourceType: String(row.source_type || ''),
        seasonId: String(row.season_id || ''),
        grantedAt: clampInt(row.granted_at)
    }));
}

async function getLeaderboardRows(connection, seasonId, limit) {
    return dbAll(
        connection,
        `SELECT season_id, user_id, user_name, score, wins, losses, ranked_games, division,
                authoritative_participant, first_authoritative_at, last_match_id, last_result,
                updated_at, created_at
         FROM pvp_season_ladders
         WHERE season_id = ? AND authoritative_participant = 1 AND ranked_games > 0
         ORDER BY score DESC, wins DESC, updated_at ASC, user_id ASC
         LIMIT ?`,
        [seasonId, clampInt(limit, 1, 100)]
    );
}

function normalizeLeaderboardRow(row) {
    return {
        seasonId: String(row.season_id || ''),
        userName: String(row.user_name || ''),
        score: clampInt(row.score),
        wins: clampInt(row.wins),
        losses: clampInt(row.losses),
        rankedGames: clampInt(row.ranked_games),
        division: String(row.division || '潜龙榜'),
        authoritativeParticipant: clampInt(row.authoritative_participant) > 0,
        firstAuthoritativeAt: clampInt(row.first_authoritative_at),
        updatedAt: clampInt(row.updated_at),
        createdAt: clampInt(row.created_at)
    };
}

async function getLeaderboardRankForUser(connection, seasonId, userId) {
    const row = await dbGet(
        connection,
        `SELECT score, wins, updated_at
         FROM pvp_season_ladders
         WHERE season_id = ? AND user_id = ? AND authoritative_participant = 1 AND ranked_games > 0`,
        [seasonId, userId]
    );
    if (!row) return null;
    const rankRow = await dbGet(
        connection,
        `SELECT COUNT(*) + 1 AS rank
         FROM pvp_season_ladders
         WHERE season_id = ? AND authoritative_participant = 1 AND ranked_games > 0
           AND (
                score > ?
                OR (score = ? AND wins > ?)
                OR (score = ? AND wins = ? AND updated_at < ?)
                OR (score = ? AND wins = ? AND updated_at = ? AND user_id < ?)
           )`,
        [
            seasonId,
            clampInt(row.score),
            clampInt(row.score),
            clampInt(row.wins),
            clampInt(row.score),
            clampInt(row.wins),
            clampInt(row.updated_at),
            clampInt(row.score),
            clampInt(row.wins),
            clampInt(row.updated_at),
            userId
        ]
    );
    return clampInt(rankRow && rankRow.rank, 1);
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

function summarizeLedgerReason(row) {
    const sourceType = String(row && row.source_type || '');
    if (sourceType === 'season_ops_purchase') return '商店购买';
    if (sourceType === 'season_ops_compensation') return '运营补偿';
    if (sourceType === 'season_settlement') return '赛季结算';
    if (sourceType === 'objective_reward') return '契约奖励';
    return String(row && row.reason || '账本变更');
}

async function readSeasonLedgerPage(connection, userId, { limit = 20, cursor = '' } = {}) {
    const safeLimit = clampInt(limit, 1, 50);
    const parsedCursor = parseLedgerCursor(cursor);
    const where = ['user_id = ?', 'currency = ?'];
    const params = [userId, REWARD_CURRENCY];
    if (parsedCursor) {
        where.push('(created_at < ? OR (created_at = ? AND entry_id < ?))');
        params.push(parsedCursor.createdAt, parsedCursor.createdAt, parsedCursor.entryId);
    }
    params.push(safeLimit + 1);
    const rows = await dbAll(
        connection,
        `SELECT entry_id, currency, delta, balance_after, reason, source_type, reward_impact, created_at
         FROM progression_economy_ledger
         WHERE ${where.join(' AND ')}
         ORDER BY created_at DESC, entry_id DESC
         LIMIT ?`,
        params
    );
    const page = rows.slice(0, safeLimit);
    return {
        entries: page.map(row => ({
            entryId: String(row.entry_id || ''),
            currency: String(row.currency || REWARD_CURRENCY),
            delta: Math.floor(Number(row.delta) || 0),
            balanceAfter: clampInt(row.balance_after),
            reason: summarizeLedgerReason(row),
            rewardImpact: String(row.reward_impact || REWARD_IMPACT),
            createdAt: clampInt(row.created_at)
        })),
        nextCursor: rows.length > safeLimit && page.length > 0 ? makeLedgerCursor(page[page.length - 1]) : null
    };
}

async function getStoredMutation(connection, userId, mutationId) {
    return dbGet(
        connection,
        `SELECT season_id, request_hash, receipt_json
         FROM season_ops_mutations
         WHERE user_id = ? AND mutation_id = ?`,
        [userId, mutationId]
    );
}

async function ensureMutationAvailable(connection, userId, mutationId, requestHash) {
    const row = await getStoredMutation(connection, userId, mutationId);
    if (!row) return null;
    if (String(row.request_hash || '') === requestHash) {
        try {
            return JSON.parse(row.receipt_json);
        } catch (error) {
            throw makeError(500, 'season_ops_corrupt_mutation_receipt', '赛季运营幂等回执损坏');
        }
    }
    throw makeMutationConflictError();
}

async function storeMutationReceipt(connection, userId, mutationId, seasonId, requestType, requestHash, requestBody, purchaseId, receipt, now) {
    await dbRun(
        connection,
        `INSERT INTO season_ops_mutations
            (user_id, mutation_id, season_id, request_type, request_hash, request_body_json, receipt_json, purchase_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            userId,
            mutationId,
            seasonId,
            requestType,
            requestHash,
            stableStringify(requestBody),
            JSON.stringify(receipt),
            purchaseId || '',
            now
        ]
    );
}

async function recordOpsEvent(connection, eventType, {
    seasonId = '',
    resultCode = 'ok',
    value = 0,
    detail = null
} = {}) {
    const now = Date.now();
    await dbRun(
        connection,
        `INSERT INTO season_ops_ops_events
            (event_id, event_type, season_id, result_code, value, detail_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            deterministicId('season-ops-event', [eventType, seasonId, resultCode, String(now), String(Math.random())]),
            eventType,
            String(seasonId || ''),
            String(resultCode || 'ok'),
            Math.floor(Number(value) || 0),
            JSON.stringify(detail || {}),
            now
        ]
    );
    await dbRun(
        connection,
        `INSERT INTO season_ops_ops_counters
            (event_type, season_id, result_code, event_count, total_value, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT(event_type, season_id, result_code) DO UPDATE SET
            event_count = season_ops_ops_counters.event_count + 1,
            total_value = season_ops_ops_counters.total_value + excluded.total_value,
            updated_at = excluded.updated_at`,
        [eventType, String(seasonId || ''), String(resultCode || 'ok'), Math.floor(Number(value) || 0), now]
    );
}

function makeOpsAuditDetail(context = null) {
    const actorId = String(context && context.actorId || '').trim();
    const requestId = String(context && context.requestId || '').trim();
    if (!actorId && !requestId) return null;
    return {
        actorRef: actorId ? makeHash({ scope: 'season_ops_actor', actorId }).slice(0, 24) : '',
        requestId: safeId(requestId) || ''
    };
}

async function recordDetachedOpsEvent(eventType, details) {
    try {
        await withReadConnection(async connection => {
            await recordOpsEvent(connection, eventType, details);
        });
    } catch (error) {
        console.error('[SeasonOps] Failed to write detached ops event:', error);
    }
}

function buildSeasonSummary(season, now) {
    const state = getSeasonState(season, now);
    return {
        seasonId: season.seasonId,
        title: season.title,
        ruleVersion: season.ruleVersion,
        catalogVersion: CATALOG_VERSION,
        startsAt: season.startsAt,
        endsAt: season.endsAt,
        graceEndsAt: season.graceEndsAt,
        rewardCurrency: REWARD_CURRENCY,
        rewardImpact: REWARD_IMPACT,
        state: state.state,
        isActive: !!state.isActive,
        isGrace: !!state.isGrace,
        isEnded: !!state.isEnded,
        boundary: season.boundary
    };
}

async function getDashboard(userId, { seasonId = '', leaderboardLimit = 10, ledgerLimit = 10, now = Date.now() } = {}) {
    return withReadConnection(async connection => {
        const season = seasonId ? getSeasonById(seasonId) : getSeasonForTime(now);
        if (!season) throw makeError(404, 'season_not_found', '赛季不存在');
        const seasonSummary = buildSeasonSummary(season, now);
        const storeOpen = seasonSummary.isActive || seasonSummary.isGrace;
        const offers = OFFERS.filter(entry => entry.seasonId === season.seasonId);
        const entitlements = await getOwnedEntitlements(connection, userId);
        const ownedKeys = new Set(entitlements.map(entry => entry.entitlementKey));
        const leaderboardRows = await getLeaderboardRows(connection, season.seasonId, leaderboardLimit);
        const selfRank = await getLeaderboardRankForUser(connection, season.seasonId, userId);
        const wallet = await getWalletRow(connection, userId);
        const seasonObjectives = await readSeasonObjectiveSnapshot(connection, userId, season, now);
        const ledger = await readSeasonLedgerPage(connection, userId, { limit: ledgerLimit });
        const selfRow = await dbGet(
            connection,
            `SELECT season_id, user_id, user_name, score, wins, losses, ranked_games, division,
                    authoritative_participant, first_authoritative_at, last_match_id, last_result,
                    updated_at, created_at
             FROM pvp_season_ladders
             WHERE season_id = ? AND user_id = ? AND authoritative_participant = 1 AND ranked_games > 0`,
            [season.seasonId, userId]
        );
        return {
            success: true,
            reportVersion: 'season-ops-dashboard-v1',
            protocolVersion: PROTOCOL_VERSION,
            generatedAt: clampInt(now),
            season: seasonSummary,
            wallet: normalizeWallet(wallet),
            objectives: seasonObjectives,
            entitlements,
            offers: offers.map(offer => ({
                offerId: offer.offerId,
                seasonId: offer.seasonId,
                title: offer.title,
                offerType: offer.offerType,
                entitlementType: offer.entitlementType,
                entitlementKey: offer.entitlementKey,
                price: {
                    currency: offer.priceCurrency,
                    amount: clampInt(offer.priceAmount)
                },
                purchaseLimit: clampInt(offer.purchaseLimit),
                owned: ownedKeys.has(offer.entitlementKey),
                available: storeOpen,
                rewardImpact: offer.rewardImpact
            })),
            leaderboard: leaderboardRows.map((row, index) => ({
                rank: index + 1,
                ...normalizeLeaderboardRow(row)
            })),
            self: selfRow ? {
                rank: selfRank,
                ...normalizeLeaderboardRow(selfRow)
            } : null,
            ledger: ledger.entries,
            ledgerNextCursor: ledger.nextCursor
        };
    }, { transaction: true });
}

async function getLeaderboard({ seasonId = '', limit = 20, userId = '' } = {}) {
    const now = Date.now();
    return withReadConnection(async connection => {
        const season = seasonId ? getSeasonById(seasonId) : getSeasonForTime(now);
        if (!season) throw makeError(404, 'season_not_found', '赛季不存在');
        const rows = await getLeaderboardRows(connection, season.seasonId, limit);
        const selfRank = userId ? await getLeaderboardRankForUser(connection, season.seasonId, userId) : null;
        const selfRow = userId ? await dbGet(
            connection,
            `SELECT season_id, user_id, user_name, score, wins, losses, ranked_games, division,
                    authoritative_participant, first_authoritative_at, last_match_id, last_result,
                    updated_at, created_at
             FROM pvp_season_ladders
             WHERE season_id = ? AND user_id = ? AND authoritative_participant = 1 AND ranked_games > 0`,
            [season.seasonId, userId]
        ) : null;
        return {
            success: true,
            reportVersion: 'season-ops-leaderboard-v1',
            protocolVersion: PROTOCOL_VERSION,
            generatedAt: now,
            season: buildSeasonSummary(season, now),
            entries: rows.map((row, index) => ({
                rank: index + 1,
                ...normalizeLeaderboardRow(row)
            })),
            self: selfRow ? {
                rank: selfRank,
                ...normalizeLeaderboardRow(selfRow)
            } : null
        };
    });
}

async function getSeasonLedger(userId, { limit = 20, cursor = '' } = {}) {
    return withReadConnection(async connection => {
        const page = await readSeasonLedgerPage(connection, userId, { limit, cursor });
        return {
            success: true,
            reportVersion: 'season-ops-ledger-v1',
            protocolVersion: PROTOCOL_VERSION,
            entries: page.entries,
            nextCursor: page.nextCursor
        };
    });
}

async function getExistingPurchase(connection, userId, offerId) {
    return dbGet(
        connection,
        `SELECT purchase_id, receipt_json
         FROM season_ops_purchases
         WHERE user_id = ? AND offer_id = ?`,
        [userId, offerId]
    );
}

async function purchaseOffer(userId, payload) {
    const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    const mutationId = safeId(body.mutationId);
    if (!mutationId) throw makeError(400, 'invalid_mutation_id', 'mutationId 无效');
    if (String(body.protocolVersion || '') !== PROTOCOL_VERSION) {
        throw makeError(409, 'unsupported_protocol_version', '赛季运营协议版本不匹配');
    }
    const season = getSeasonById(body.seasonId);
    if (!season) throw makeError(404, 'season_not_found', '赛季不存在');
    const offer = getOffer(body.offerId);
    if (!offer || offer.seasonId !== season.seasonId) {
        throw makeError(404, 'offer_not_found', '赛季商品不存在');
    }
    const state = getSeasonState(season, Date.now());
    if (!(state.isActive || state.isGrace)) {
        throw makeError(409, 'season_store_closed', '当前赛季商店不可购买');
    }
    const businessPayload = {
        protocolVersion: PROTOCOL_VERSION,
        seasonId: season.seasonId,
        offerId: offer.offerId,
        mutationId
    };
    const requestHash = makeHash(businessPayload);
    try {
        return await withWriteTransaction(async connection => {
            const replay = await ensureMutationAvailable(connection, userId, mutationId, requestHash);
            if (replay) {
                await recordOpsEvent(connection, 'purchase', {
                    seasonId: season.seasonId,
                    resultCode: 'replay',
                    value: 0
                });
                return replay;
            }
            const existingPurchase = await getExistingPurchase(connection, userId, offer.offerId);
            if (existingPurchase) {
                throw makeError(409, 'offer_already_owned', '该商品已购买');
            }
            const existingEntitlement = await dbGet(
                connection,
                `SELECT entitlement_id
                 FROM season_ops_entitlements
                 WHERE user_id = ? AND entitlement_key = ?`,
                [userId, offer.entitlementKey]
            );
            if (existingEntitlement) {
                throw makeError(409, 'offer_already_owned', '该商品已拥有');
            }

            const now = Date.now();
            await ensureWalletRow(connection, userId, now);
            const updateResult = await dbRun(
                connection,
                `UPDATE progression_economy_balances
                 SET balance = balance - ?,
                     lifetime_spent = lifetime_spent + ?,
                     updated_at = ?
                 WHERE user_id = ? AND currency = ? AND balance >= ?`,
                [offer.priceAmount, offer.priceAmount, now, userId, REWARD_CURRENCY, offer.priceAmount]
            );
            if (clampInt(updateResult && updateResult.changes) === 0) {
                throw makeError(409, 'insufficient_funds', '荣誉余额不足');
            }

            const walletRow = await getWalletRow(connection, userId);
            const purchaseId = deterministicId('season-purchase', [season.seasonId, userId, offer.offerId]);
            const ledgerEntryId = deterministicId('season-ledger', [season.seasonId, userId, offer.offerId, 'purchase']);
            const entitlementId = deterministicId('season-entitlement', [season.seasonId, userId, offer.entitlementKey]);

            await dbRun(
                connection,
                `INSERT INTO progression_economy_ledger
                    (entry_id, user_id, currency, delta, balance_after, reason, source_type, source_id,
                     reward_impact, metadata_json, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    ledgerEntryId,
                    userId,
                    REWARD_CURRENCY,
                    -clampInt(offer.priceAmount),
                    clampInt(walletRow.balance),
                    offer.title,
                    'season_ops_purchase',
                    purchaseId,
                    REWARD_IMPACT,
                    JSON.stringify({
                        seasonId: season.seasonId,
                        offerId: offer.offerId,
                        protocolVersion: PROTOCOL_VERSION
                    }),
                    now
                ]
            );

            await dbRun(
                connection,
                `INSERT INTO season_ops_entitlements
                    (entitlement_id, user_id, entitlement_key, entitlement_type, source_type, source_id,
                     season_id, reward_impact, metadata_json, granted_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    entitlementId,
                    userId,
                    offer.entitlementKey,
                    offer.entitlementType,
                    'season_ops_purchase',
                    purchaseId,
                    season.seasonId,
                    REWARD_IMPACT,
                    JSON.stringify({
                        offerId: offer.offerId,
                        protocolVersion: PROTOCOL_VERSION
                    }),
                    now
                ]
            );

            const receipt = {
                success: true,
                reportVersion: 'season-ops-purchase-v1',
                protocolVersion: PROTOCOL_VERSION,
                purchaseId,
                seasonId: season.seasonId,
                offerId: offer.offerId,
                mutationId,
                wallet: normalizeWallet(walletRow),
                entitlement: {
                    entitlementId,
                    entitlementKey: offer.entitlementKey,
                    entitlementType: offer.entitlementType,
                    grantedAt: now
                },
                receipt: {
                    rewardImpact: REWARD_IMPACT,
                    spendPolicy: 'cosmetic_only',
                    requestHash
                },
                purchasedAt: now
            };

            await dbRun(
                connection,
                `INSERT INTO season_ops_purchases
                    (purchase_id, user_id, season_id, offer_id, mutation_id, request_hash, ledger_entry_id,
                     entitlement_id, price_currency, price_amount, receipt_json, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    purchaseId,
                    userId,
                    season.seasonId,
                    offer.offerId,
                    mutationId,
                    requestHash,
                    ledgerEntryId,
                    entitlementId,
                    REWARD_CURRENCY,
                    offer.priceAmount,
                    JSON.stringify(receipt),
                    now
                ]
            );

            await storeMutationReceipt(
                connection,
                userId,
                mutationId,
                season.seasonId,
                'purchase',
                requestHash,
                businessPayload,
                purchaseId,
                receipt,
                now
            );
            await recordOpsEvent(connection, 'purchase', {
                seasonId: season.seasonId,
                resultCode: 'purchased',
                value: offer.priceAmount
            });
            return receipt;
        });
    } catch (error) {
        const reason = error && error.reason ? error.reason : 'purchase_failed';
        await recordDetachedOpsEvent('purchase', {
            seasonId: season.seasonId,
            resultCode: reason,
            value: 0
        });
        throw error;
    }
}

async function grantCompensation(opsContext, payload) {
    const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    const actorAudit = makeOpsAuditDetail(opsContext);
    if (!actorAudit || !actorAudit.actorRef) {
        throw makeError(401, 'ops_actor_required', '运营补偿缺少已认证操作者');
    }
    if (String(body.protocolVersion || '') !== PROTOCOL_VERSION) {
        throw makeError(409, 'unsupported_protocol_version', '赛季运营协议版本不匹配');
    }
    const targetUserId = safeId(body.targetUserId);
    const confirmTargetUserId = String(body.confirmTargetUserId || '').trim();
    const mutationId = safeId(body.mutationId);
    const reasonCode = String(body.reasonCode || '').trim();
    const amount = Number(body.amount);
    if (!targetUserId) throw makeError(400, 'invalid_target_user_id', '补偿目标账号无效');
    if (confirmTargetUserId !== targetUserId) {
        throw makeError(400, 'target_confirmation_required', '运营补偿必须明确确认目标账号');
    }
    if (!mutationId) throw makeError(400, 'invalid_mutation_id', 'mutationId 无效');
    if (!COMPENSATION_REASON_CODES.has(reasonCode)) {
        throw makeError(400, 'invalid_compensation_reason', '补偿原因不在允许范围内');
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_COMPENSATION_RENOWN) {
        throw makeError(400, 'invalid_compensation_amount', `补偿荣誉必须在 1-${MAX_COMPENSATION_RENOWN} 之间`);
    }
    const season = getSeasonById(body.seasonId);
    if (!season) throw makeError(404, 'season_not_found', '赛季不存在');
    const businessPayload = {
        protocolVersion: PROTOCOL_VERSION,
        seasonId: season.seasonId,
        targetUserId,
        reasonCode,
        amount,
        mutationId
    };
    const requestHash = makeHash(businessPayload);
    try {
        return await withWriteTransaction(async connection => {
            const target = await dbGet(connection, 'SELECT id FROM users WHERE id = ?', [targetUserId]);
            if (!target) throw makeError(404, 'target_user_not_found', '补偿目标账号不存在');
            const replay = await ensureMutationAvailable(connection, targetUserId, mutationId, requestHash);
            if (replay) {
                await recordOpsEvent(connection, 'compensation', {
                    seasonId: season.seasonId,
                    resultCode: 'replay',
                    value: 0,
                    detail: { ...actorAudit, reasonCode }
                });
                return replay;
            }
            const now = Date.now();
            await ensureWalletRow(connection, targetUserId, now);
            await dbRun(
                connection,
                `UPDATE progression_economy_balances
                 SET balance = balance + ?,
                     lifetime_earned = lifetime_earned + ?,
                     updated_at = ?
                 WHERE user_id = ? AND currency = ?`,
                [amount, amount, now, targetUserId, REWARD_CURRENCY]
            );
            const wallet = await getWalletRow(connection, targetUserId);
            const compensationId = deterministicId('season-compensation', [targetUserId, mutationId]);
            const ledgerEntryId = deterministicId('season-ledger', [targetUserId, mutationId, 'compensation']);
            await dbRun(
                connection,
                `INSERT INTO progression_economy_ledger
                    (entry_id, user_id, currency, delta, balance_after, reason, source_type, source_id,
                     reward_impact, metadata_json, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'season_ops_compensation', ?, ?, ?, ?)`,
                [
                    ledgerEntryId,
                    targetUserId,
                    REWARD_CURRENCY,
                    amount,
                    clampInt(wallet.balance),
                    '运营补偿',
                    compensationId,
                    REWARD_IMPACT,
                    JSON.stringify({ seasonId: season.seasonId, reasonCode, protocolVersion: PROTOCOL_VERSION }),
                    now
                ]
            );
            const receipt = {
                success: true,
                reportVersion: 'season-ops-compensation-v1',
                protocolVersion: PROTOCOL_VERSION,
                compensationId,
                seasonId: season.seasonId,
                mutationId,
                reasonCode,
                amount,
                recipientRef: makeHash({ scope: 'season_ops_recipient', targetUserId }).slice(0, 24),
                wallet: normalizeWallet(wallet),
                appliedAt: now
            };
            await dbRun(
                connection,
                `INSERT INTO season_ops_compensations
                    (compensation_id, target_user_id, season_id, mutation_id, reason_code, amount,
                     ledger_entry_id, actor_ref, receipt_json, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    compensationId,
                    targetUserId,
                    season.seasonId,
                    mutationId,
                    reasonCode,
                    amount,
                    ledgerEntryId,
                    actorAudit.actorRef,
                    JSON.stringify(receipt),
                    now
                ]
            );
            await storeMutationReceipt(
                connection,
                targetUserId,
                mutationId,
                season.seasonId,
                'compensation',
                requestHash,
                businessPayload,
                compensationId,
                receipt,
                now
            );
            await recordOpsEvent(connection, 'compensation', {
                seasonId: season.seasonId,
                resultCode: 'applied',
                value: amount,
                detail: { ...actorAudit, reasonCode }
            });
            return receipt;
        });
    } catch (error) {
        await recordDetachedOpsEvent('compensation', {
            seasonId: season.seasonId,
            resultCode: error && error.reason || 'compensation_failed',
            value: 0,
            detail: { ...actorAudit, reasonCode }
        });
        throw error;
    }
}

async function recordAuthoritativePvpResult(connection, input) {
    if (!connection || typeof connection.run !== 'function') {
        throw makeError(500, 'invalid_db_connection', '赛季榜投影缺少数据库连接');
    }
    const payload = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const userId = String(payload.userId || '').trim();
    const matchId = String(payload.matchId || '').trim();
    if (!userId) throw makeError(400, 'invalid_user_id', '缺少权威结算用户');
    if (!matchId) throw makeError(400, 'invalid_match_id', '缺少权威结算战局');
    const anchorTime = clampInt(payload.occurredAt || payload.settledAt || Date.now());
    const season = payload.seasonId ? getSeasonById(payload.seasonId) : getSeasonForTime(anchorTime, { includeGrace: false });
    if (!season) {
        return { success: true, applied: false, reason: 'season_not_found', matchId, userId };
    }
    const state = getSeasonState(season, anchorTime);
    if (!state.isActive) {
        return { success: true, applied: false, reason: 'season_not_active', seasonId: season.seasonId, matchId, userId };
    }
    const existing = await dbGet(
        connection,
        `SELECT season_id, user_id, score, wins, losses, ranked_games, division, last_match_id,
                first_authoritative_at, updated_at, created_at
         FROM pvp_season_ladders
         WHERE season_id = ? AND user_id = ?`,
        [season.seasonId, userId]
    );
    const finalizedSnapshot = await dbGet(
        connection,
        `SELECT snapshot_id, finalized_at
         FROM season_ops_leaderboard_snapshots
         WHERE season_id = ? AND snapshot_type = 'final'
         LIMIT 1`,
        [season.seasonId]
    );
    if (finalizedSnapshot) {
        const score = Number.isFinite(Number(payload.score))
            ? clampInt(payload.score)
            : clampInt(existing && existing.score || 1000);
        const wins = Number.isFinite(Number(payload.wins))
            ? clampInt(payload.wins)
            : clampInt(existing && existing.wins);
        const losses = Number.isFinite(Number(payload.losses))
            ? clampInt(payload.losses)
            : clampInt(existing && existing.losses);
        const rankedGames = Math.max(clampInt(payload.rankedGames), wins + losses);
        const settledAt = clampInt(payload.updatedAt || payload.settledAt || Date.now());
        await dbRun(
            connection,
            `INSERT OR IGNORE INTO pvp_season_ladder_results
                (season_id, user_id, match_id, did_win, score_before, score_after, wins_after,
                 losses_after, ranked_games_after, division, occurred_at, settled_at, projection_status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'post_snapshot_noop', ?)`,
            [
                season.seasonId,
                userId,
                matchId,
                payload.didWin === false ? 0 : 1,
                existing ? clampInt(existing.score) : 1000,
                score,
                wins,
                losses,
                rankedGames,
                String(payload.division || existing && existing.division || '潜龙榜'),
                anchorTime,
                settledAt,
                settledAt
            ]
        );
        await recordOpsEvent(connection, 'authoritative_result', {
            seasonId: season.seasonId,
            resultCode: 'post_snapshot_noop',
            value: 0
        });
        return {
            success: true,
            applied: false,
            finalized: true,
            reason: 'season_already_finalized',
            seasonId: season.seasonId,
            matchId,
            userId,
            snapshotId: String(finalizedSnapshot.snapshot_id || '')
        };
    }
    const rankRow = await dbGet(
        connection,
        `SELECT user_id, user_name, score, wins, losses, division, created_at, updated_at
         FROM pvp_ranks
         WHERE user_id = ?`,
        [userId]
    );
    if (!rankRow) {
        throw makeError(404, 'pvp_rank_not_found', 'PVP 段位数据不存在');
    }
    const score = Number.isFinite(Number(payload.score)) ? clampInt(payload.score) : clampInt(rankRow.score);
    const wins = Number.isFinite(Number(payload.wins)) ? clampInt(payload.wins) : clampInt(rankRow.wins);
    const losses = Number.isFinite(Number(payload.losses)) ? clampInt(payload.losses) : clampInt(rankRow.losses);
    const rankedGames = Math.max(clampInt(payload.rankedGames), wins + losses);
    const settledAt = clampInt(payload.updatedAt || rankRow.updated_at || Date.now());
    const journalInsert = await dbRun(
        connection,
        `INSERT OR IGNORE INTO pvp_season_ladder_results
            (season_id, user_id, match_id, did_win, score_before, score_after, wins_after,
             losses_after, ranked_games_after, division, occurred_at, settled_at, projection_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [
            season.seasonId,
            userId,
            matchId,
            payload.didWin === false ? 0 : 1,
            existing ? clampInt(existing.score) : 1000,
            score,
            wins,
            losses,
            rankedGames,
            String(payload.division || rankRow.division || '潜龙榜'),
            anchorTime,
            settledAt,
            settledAt
        ]
    );
    if (clampInt(journalInsert && journalInsert.changes) === 0) {
        await recordOpsEvent(connection, 'authoritative_result', {
            seasonId: season.seasonId,
            resultCode: 'replay',
            value: 0
        });
        return {
            success: true,
            applied: false,
            alreadyRecorded: true,
            seasonId: season.seasonId,
            matchId,
            userId
        };
    }
    const newerResult = await dbGet(
        connection,
        `SELECT match_id
         FROM pvp_season_ladder_results
         WHERE season_id = ? AND user_id = ?
           AND (occurred_at > ? OR (occurred_at = ? AND match_id > ?))
           AND projection_status = 'applied'
         ORDER BY occurred_at DESC, match_id DESC
         LIMIT 1`,
        [season.seasonId, userId, anchorTime, anchorTime, matchId]
    );
    if (newerResult || (existing && String(existing.last_match_id || '') === matchId)) {
        const resultCode = newerResult ? 'stale_noop' : 'replay_noop';
        await dbRun(
            connection,
            `UPDATE pvp_season_ladder_results
             SET projection_status = ?
             WHERE season_id = ? AND user_id = ? AND match_id = ?`,
            [resultCode, season.seasonId, userId, matchId]
        );
        await recordOpsEvent(connection, 'authoritative_result', {
            seasonId: season.seasonId,
            resultCode,
            value: 0
        });
        return {
            success: true,
            applied: false,
            alreadyRecorded: !newerResult,
            stale: !!newerResult,
            seasonId: season.seasonId,
            matchId,
            userId
        };
    }
    await dbRun(
        connection,
        `INSERT INTO pvp_season_ladders
            (season_id, user_id, user_name, score, wins, losses, ranked_games, division,
             authoritative_participant, first_authoritative_at, last_match_id, last_result,
             updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
         ON CONFLICT(season_id, user_id) DO UPDATE SET
            user_name = excluded.user_name,
            score = excluded.score,
            wins = excluded.wins,
            losses = excluded.losses,
            ranked_games = excluded.ranked_games,
            division = excluded.division,
            authoritative_participant = 1,
            first_authoritative_at = CASE
                WHEN pvp_season_ladders.first_authoritative_at <= 0 THEN excluded.first_authoritative_at
                ELSE MIN(pvp_season_ladders.first_authoritative_at, excluded.first_authoritative_at)
            END,
            last_match_id = excluded.last_match_id,
            last_result = excluded.last_result,
            updated_at = excluded.updated_at`,
        [
            season.seasonId,
            userId,
            String(rankRow.user_name || payload.userName || userId),
            score,
            wins,
            losses,
            rankedGames,
            String(payload.division || rankRow.division || '潜龙榜'),
            clampInt(payload.occurredAt || rankRow.created_at || now),
            matchId,
            payload.didWin === false ? 'loss' : 'win',
            settledAt,
            clampInt(existing && existing.created_at || rankRow.created_at || settledAt)
        ]
    );
    await dbRun(
        connection,
        `UPDATE pvp_season_ladder_results
         SET projection_status = 'applied'
         WHERE season_id = ? AND user_id = ? AND match_id = ?`,
        [season.seasonId, userId, matchId]
    );
    await recordOpsEvent(connection, 'authoritative_result', {
        seasonId: season.seasonId,
        resultCode: 'applied',
        value: payload.didWin === false ? 0 : 1
    });
    const projected = await dbGet(
        connection,
        `SELECT season_id, user_id, user_name, score, wins, losses, ranked_games, division,
                authoritative_participant, first_authoritative_at, last_match_id, last_result,
                updated_at, created_at
         FROM pvp_season_ladders
         WHERE season_id = ? AND user_id = ?`,
        [season.seasonId, userId]
    );
    return {
        success: true,
        applied: true,
        seasonId: season.seasonId,
        matchId,
        userId,
        ladder: normalizeLeaderboardRow(projected)
    };
}

async function loadSnapshot(connection, seasonId) {
    const snapshot = await dbGet(
        connection,
        `SELECT snapshot_id, season_id, snapshot_type, entry_count, content_hash, created_at, finalized_at
         FROM season_ops_leaderboard_snapshots
         WHERE season_id = ?`,
        [seasonId]
    );
    if (!snapshot) return null;
    const entries = await dbAll(
        connection,
        `SELECT snapshot_id, season_id, rank, user_id, user_name, score, wins, losses,
                ranked_games, division, settlement_tier_id, created_at
         FROM season_ops_leaderboard_entries
         WHERE snapshot_id = ?
         ORDER BY rank ASC`,
        [snapshot.snapshot_id]
    );
    const normalizedEntries = entries.map(row => ({
        rank: clampInt(row.rank, 1),
        userId: String(row.user_id || ''),
        userName: String(row.user_name || ''),
        score: clampInt(row.score),
        wins: clampInt(row.wins),
        losses: clampInt(row.losses),
        rankedGames: clampInt(row.ranked_games),
        division: String(row.division || '潜龙榜'),
        settlementTierId: String(row.settlement_tier_id || '')
    }));
    const contentHash = makeHash({
        seasonId: String(snapshot.season_id || ''),
        entries: normalizedEntries
    });
    if (normalizedEntries.length !== clampInt(snapshot.entry_count) || contentHash !== String(snapshot.content_hash || '')) {
        throw makeError(409, 'season_snapshot_corrupt', '赛季定榜快照完整性校验失败');
    }
    return {
        snapshotId: String(snapshot.snapshot_id || ''),
        seasonId: String(snapshot.season_id || ''),
        snapshotType: String(snapshot.snapshot_type || 'final'),
        entryCount: clampInt(snapshot.entry_count),
        contentHash,
        createdAt: clampInt(snapshot.created_at),
        finalizedAt: clampInt(snapshot.finalized_at),
        entries: normalizedEntries
    };
}

async function createSnapshotInConnection(connection, seasonId, now = Date.now(), opsContext = null) {
    const season = getSeasonById(seasonId);
    if (!season) throw makeError(404, 'season_not_found', '赛季不存在');
    const state = getSeasonState(season, now);
    if (!(state.isGrace || state.isEnded)) {
        throw makeError(409, 'season_snapshot_not_ready', '赛季尚未进入定榜阶段');
    }
    if (now < season.endsAt + SETTLEMENT_FINALIZATION_DELAY_MS) {
        throw makeError(409, 'season_snapshot_settlement_window_open', '赛季边界对局仍在结算缓冲期');
    }
    const existing = await loadSnapshot(connection, seasonId);
    if (existing) {
        await recordOpsEvent(connection, 'snapshot', {
            seasonId,
            resultCode: 'replay',
            value: existing.entryCount,
            detail: makeOpsAuditDetail(opsContext)
        });
        return existing;
    }
    const pendingMatchCount = await getPendingOfficialSeasonMatchCount(connection, season);
    if (pendingMatchCount > 0) {
        throw makeError(
            409,
            'season_snapshot_matches_pending',
            '仍有赛季内开局的正式对局尚未完成权威结算',
            { pendingMatchCount }
        );
    }
    const rows = await dbAll(
        connection,
        `SELECT season_id, user_id, user_name, score, wins, losses, ranked_games, division,
                authoritative_participant, first_authoritative_at, last_match_id, last_result,
                updated_at, created_at
         FROM pvp_season_ladders
         WHERE season_id = ? AND authoritative_participant = 1 AND ranked_games > 0
         ORDER BY score DESC, wins DESC, updated_at ASC, user_id ASC`,
        [seasonId]
    );
    const snapshotId = deterministicId('season-snapshot', [seasonId]);
    const entries = rows.map((row, index) => {
        const rank = index + 1;
        const tier = getSettlementTier({
            rank,
            totalPlayers: rows.length,
            rankedGames: clampInt(row.ranked_games)
        });
        return {
            rank,
            userId: String(row.user_id || ''),
            userName: String(row.user_name || ''),
            score: clampInt(row.score),
            wins: clampInt(row.wins),
            losses: clampInt(row.losses),
            rankedGames: clampInt(row.ranked_games),
            division: String(row.division || '潜龙榜'),
            settlementTierId: tier ? tier.tierId : ''
        };
    });
    const contentHash = makeHash({
        seasonId,
        entries
    });
    await dbRun(
        connection,
        `INSERT INTO season_ops_leaderboard_snapshots
            (snapshot_id, season_id, snapshot_type, entry_count, content_hash, created_at, finalized_at)
         VALUES (?, ?, 'final', ?, ?, ?, ?)`,
        [snapshotId, seasonId, entries.length, contentHash, now, now]
    );
    for (const entry of entries) {
        await dbRun(
            connection,
            `INSERT INTO season_ops_leaderboard_entries
                (snapshot_id, season_id, rank, user_id, user_name, score, wins, losses,
                 ranked_games, division, settlement_tier_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                snapshotId,
                seasonId,
                entry.rank,
                entry.userId,
                entry.userName,
                entry.score,
                entry.wins,
                entry.losses,
                entry.rankedGames,
                entry.division,
                entry.settlementTierId,
                now
            ]
        );
    }
    await recordOpsEvent(connection, 'snapshot', {
        seasonId,
        resultCode: 'created',
        value: entries.length,
        detail: makeOpsAuditDetail(opsContext)
    });
    return {
        snapshotId,
        seasonId,
        snapshotType: 'final',
        entryCount: entries.length,
        contentHash,
        createdAt: now,
        finalizedAt: now,
        entries
    };
}

async function createLeaderboardSnapshot(seasonId, opsContext = null) {
    return withWriteTransaction(async connection => {
        const snapshot = await createSnapshotInConnection(connection, seasonId, Date.now(), opsContext);
        return {
            success: true,
            reportVersion: 'season-ops-snapshot-v1',
            protocolVersion: PROTOCOL_VERSION,
            ...snapshot
        };
    });
}

function buildSettlementReceipt({ seasonId, snapshotId, entry, tier, wallet, ledgerEntryId, entitlement }) {
    return {
        success: true,
        reportVersion: 'season-ops-settlement-v1',
        protocolVersion: PROTOCOL_VERSION,
        seasonId,
        snapshotId,
        rank: entry.rank,
        userId: entry.userId,
        tier: {
            tierId: tier.tierId,
            title: tier.title,
            renown: tier.renown,
            entitlementKey: tier.entitlementKey,
            entitlementType: tier.entitlementType,
            rewardImpact: tier.rewardImpact
        },
        wallet: normalizeWallet(wallet),
        ledgerEntryId,
        entitlement: entitlement || null
    };
}

async function getLedgerBySource(connection, userId, sourceType, sourceId) {
    return dbGet(
        connection,
        `SELECT entry_id, balance_after
         FROM progression_economy_ledger
         WHERE user_id = ? AND source_type = ? AND source_id = ?`,
        [userId, sourceType, sourceId]
    );
}

async function getEntitlementByKey(connection, userId, entitlementKey) {
    return dbGet(
        connection,
        `SELECT entitlement_id, granted_at
         FROM season_ops_entitlements
         WHERE user_id = ? AND entitlement_key = ?`,
        [userId, entitlementKey]
    );
}

async function applySettlementForEntry(connection, seasonId, snapshotId, entry, tier, now) {
    const existing = await dbGet(
        connection,
        `SELECT season_id, user_id, receipt_json
         FROM season_ops_settlements
         WHERE season_id = ? AND user_id = ?`,
        [seasonId, entry.userId]
    );
    if (existing) {
        const receipt = JSON.parse(String(existing.receipt_json || '{}') || '{}');
        return { status: 'already_settled', receipt };
    }

    await ensureWalletRow(connection, entry.userId, now);
    await dbRun(
        connection,
        `UPDATE progression_economy_balances
         SET balance = balance + ?,
             lifetime_earned = lifetime_earned + ?,
             updated_at = ?
         WHERE user_id = ? AND currency = ?`,
        [tier.renown, tier.renown, now, entry.userId, REWARD_CURRENCY]
    );
    const wallet = await getWalletRow(connection, entry.userId);
    const settlementSourceId = `season-settlement:${seasonId}:${entry.userId}`;
    const ledgerEntryId = deterministicId('season-ledger', [seasonId, entry.userId, tier.tierId, 'settlement']);
    await dbRun(
        connection,
        `INSERT INTO progression_economy_ledger
            (entry_id, user_id, currency, delta, balance_after, reason, source_type, source_id,
             reward_impact, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            ledgerEntryId,
            entry.userId,
            REWARD_CURRENCY,
            tier.renown,
            clampInt(wallet.balance),
            tier.title,
            'season_settlement',
            settlementSourceId,
            REWARD_IMPACT,
            JSON.stringify({
                seasonId,
                snapshotId,
                rank: entry.rank,
                tierId: tier.tierId
            }),
            now
        ]
    );
    let entitlement = null;
    let entitlementId = '';
    if (tier.entitlementKey) {
        entitlementId = deterministicId('season-entitlement', [seasonId, entry.userId, tier.entitlementKey, tier.tierId]);
        await dbRun(
            connection,
            `INSERT OR IGNORE INTO season_ops_entitlements
                (entitlement_id, user_id, entitlement_key, entitlement_type, source_type, source_id,
                 season_id, reward_impact, metadata_json, granted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                entitlementId,
                entry.userId,
                tier.entitlementKey,
                tier.entitlementType,
                'season_settlement',
                settlementSourceId,
                seasonId,
                REWARD_IMPACT,
                JSON.stringify({
                    snapshotId,
                    rank: entry.rank,
                    tierId: tier.tierId
                }),
                now
            ]
        );
        entitlement = {
            entitlementId,
            entitlementKey: tier.entitlementKey,
            entitlementType: tier.entitlementType,
            grantedAt: now
        };
    }
    const receipt = buildSettlementReceipt({
        seasonId,
        snapshotId,
        entry,
        tier,
        wallet,
        ledgerEntryId,
        entitlement
    });
    await dbRun(
        connection,
        `INSERT INTO season_ops_settlements
            (season_id, user_id, snapshot_id, final_rank, tier_id, renown_awarded, entitlement_key,
             entitlement_type, ledger_entry_id, entitlement_id, balance_after, wallet_applied,
             ledger_written, entitlement_written, receipt_json, settled_at, reconciled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, 0)`,
        [
            seasonId,
            entry.userId,
            snapshotId,
            entry.rank,
            tier.tierId,
            tier.renown,
            tier.entitlementKey || '',
            tier.entitlementType || '',
            ledgerEntryId,
            entitlementId,
            clampInt(wallet.balance),
            entitlement ? 1 : 0,
            JSON.stringify(receipt),
            now
        ]
    );
    return { status: 'settled', receipt };
}

async function settleSeason(seasonId, opsContext = null) {
    return withWriteTransaction(async connection => {
        const snapshot = await createSnapshotInConnection(connection, seasonId, Date.now(), opsContext);
        let settled = 0;
        let replayed = 0;
        for (const entry of snapshot.entries) {
            const tier = getSettlementTier({
                rank: entry.rank,
                totalPlayers: snapshot.entries.length,
                rankedGames: entry.rankedGames
            });
            if (!tier) continue;
            const result = await applySettlementForEntry(connection, seasonId, snapshot.snapshotId, entry, tier, Date.now());
            if (result.status === 'settled') settled += 1;
            else replayed += 1;
        }
        await recordOpsEvent(connection, 'settlement', {
            seasonId,
            resultCode: settled > 0 ? 'settled' : 'replay',
            value: settled,
            detail: makeOpsAuditDetail(opsContext)
        });
        return {
            success: true,
            reportVersion: 'season-ops-settlement-v1',
            protocolVersion: PROTOCOL_VERSION,
            seasonId,
            snapshotId: snapshot.snapshotId,
            settledCount: settled,
            replayedCount: replayed
        };
    });
}

async function reconcileSettlementEntry(connection, seasonId, snapshotId, entry, tier, now) {
    const settlementSourceId = `season-settlement:${seasonId}:${entry.userId}`;
    const expectedLedgerEntryId = deterministicId('season-ledger', [seasonId, entry.userId, tier.tierId, 'settlement']);
    const expectedEntitlementId = tier.entitlementKey
        ? deterministicId('season-entitlement', [seasonId, entry.userId, tier.entitlementKey, tier.tierId])
        : '';
    let settlement = await dbGet(
        connection,
        `SELECT season_id, user_id, snapshot_id, final_rank, tier_id, renown_awarded, entitlement_key,
                entitlement_type, ledger_entry_id, entitlement_id, balance_after, wallet_applied,
                ledger_written, entitlement_written, receipt_json, settled_at, reconciled_at
         FROM season_ops_settlements
         WHERE season_id = ? AND user_id = ?`,
        [seasonId, entry.userId]
    );
    if (!settlement) {
        const created = await applySettlementForEntry(connection, seasonId, snapshotId, entry, tier, now);
        return { status: created.status === 'settled' ? 'created' : created.status };
    }
    let wallet = await getWalletRow(connection, entry.userId);
    let ledgerRow = await getLedgerBySource(connection, entry.userId, 'season_settlement', settlementSourceId);
    if (!ledgerRow) {
        if (clampInt(settlement.wallet_applied) === 0) {
            await ensureWalletRow(connection, entry.userId, now);
            await dbRun(
                connection,
                `UPDATE progression_economy_balances
                 SET balance = balance + ?,
                     lifetime_earned = lifetime_earned + ?,
                     updated_at = ?
                 WHERE user_id = ? AND currency = ?`,
                [clampInt(settlement.renown_awarded), clampInt(settlement.renown_awarded), now, entry.userId, REWARD_CURRENCY]
            );
            wallet = await getWalletRow(connection, entry.userId);
        }
        await dbRun(
            connection,
            `INSERT INTO progression_economy_ledger
                (entry_id, user_id, currency, delta, balance_after, reason, source_type, source_id,
                 reward_impact, metadata_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                settlement.ledger_entry_id || expectedLedgerEntryId,
                entry.userId,
                REWARD_CURRENCY,
                clampInt(settlement.renown_awarded),
                clampInt(settlement.balance_after || wallet.balance),
                tier.title,
                'season_settlement',
                settlementSourceId,
                REWARD_IMPACT,
                JSON.stringify({
                    seasonId,
                    snapshotId,
                    rank: entry.rank,
                    tierId: tier.tierId,
                    reconcileMode: clampInt(settlement.wallet_applied) === 0 ? 'wallet_and_ledger' : 'ledger_only'
                }),
                now
            ]
        );
        ledgerRow = {
            entry_id: settlement.ledger_entry_id || expectedLedgerEntryId,
            balance_after: clampInt(settlement.balance_after || wallet.balance)
        };
    }
    let entitlement = tier.entitlementKey ? await getEntitlementByKey(connection, entry.userId, tier.entitlementKey) : null;
    if (tier.entitlementKey && !entitlement) {
        await dbRun(
            connection,
            `INSERT OR IGNORE INTO season_ops_entitlements
                (entitlement_id, user_id, entitlement_key, entitlement_type, source_type, source_id,
                 season_id, reward_impact, metadata_json, granted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                settlement.entitlement_id || expectedEntitlementId,
                entry.userId,
                tier.entitlementKey,
                tier.entitlementType,
                'season_settlement',
                settlementSourceId,
                seasonId,
                REWARD_IMPACT,
                JSON.stringify({
                    snapshotId,
                    rank: entry.rank,
                    tierId: tier.tierId,
                    reconciled: true
                }),
                now
            ]
        );
        entitlement = await getEntitlementByKey(connection, entry.userId, tier.entitlementKey);
    }
    wallet = await getWalletRow(connection, entry.userId);
    const receipt = buildSettlementReceipt({
        seasonId,
        snapshotId,
        entry,
        tier,
        wallet,
        ledgerEntryId: String((ledgerRow && ledgerRow.entry_id) || settlement.ledger_entry_id || expectedLedgerEntryId),
        entitlement: entitlement ? {
            entitlementId: String(entitlement.entitlement_id || settlement.entitlement_id || expectedEntitlementId),
            entitlementKey: tier.entitlementKey,
            entitlementType: tier.entitlementType,
            grantedAt: clampInt(entitlement.granted_at)
        } : null
    });
    await dbRun(
        connection,
        `UPDATE season_ops_settlements
         SET snapshot_id = ?,
             final_rank = ?,
             tier_id = ?,
             renown_awarded = ?,
             entitlement_key = ?,
             entitlement_type = ?,
             ledger_entry_id = ?,
             entitlement_id = ?,
             balance_after = ?,
             wallet_applied = CASE WHEN wallet_applied > 0 THEN wallet_applied ELSE ? END,
             ledger_written = 1,
             entitlement_written = ?,
             receipt_json = ?,
             reconciled_at = ?
         WHERE season_id = ? AND user_id = ?`,
        [
            snapshotId,
            entry.rank,
            tier.tierId,
            tier.renown,
            tier.entitlementKey || '',
            tier.entitlementType || '',
            String((ledgerRow && ledgerRow.entry_id) || settlement.ledger_entry_id || expectedLedgerEntryId),
            entitlement ? String(entitlement.entitlement_id || settlement.entitlement_id || expectedEntitlementId) : '',
            clampInt(wallet.balance),
            clampInt(settlement.wallet_applied) > 0 ? clampInt(settlement.wallet_applied) : 1,
            entitlement ? 1 : 0,
            JSON.stringify(receipt),
            now,
            seasonId,
            entry.userId
        ]
    );
    return { status: 'reconciled' };
}

async function reconcileSeason(seasonId, opsContext = null) {
    return withWriteTransaction(async connection => {
        const snapshot = await createSnapshotInConnection(connection, seasonId, Date.now(), opsContext);
        let created = 0;
        let repaired = 0;
        for (const entry of snapshot.entries) {
            const tier = getSettlementTier({
                rank: entry.rank,
                totalPlayers: snapshot.entries.length,
                rankedGames: entry.rankedGames
            });
            if (!tier) continue;
            const result = await reconcileSettlementEntry(connection, seasonId, snapshot.snapshotId, entry, tier, Date.now());
            if (result.status === 'created') created += 1;
            else if (result.status === 'reconciled') repaired += 1;
        }
        await recordOpsEvent(connection, 'reconcile', {
            seasonId,
            resultCode: repaired > 0 || created > 0 ? 'repaired' : 'noop',
            value: repaired + created,
            detail: makeOpsAuditDetail(opsContext)
        });
        return {
            success: true,
            reportVersion: 'season-ops-settlement-v1',
            protocolVersion: PROTOCOL_VERSION,
            seasonId,
            snapshotId: snapshot.snapshotId,
            createdCount: created,
            repairedCount: repaired
        };
    });
}

async function getOpsOverview() {
    return withReadConnection(async connection => {
        const [counterRows, seasonRows, offerSummary, ladderSummary, authoritativeResultSummary, purchaseSummary, compensationSummary, entitlementSummary, snapshotSummary, settlementSummary] = await Promise.all([
            dbAll(
                connection,
                `SELECT event_type, season_id, result_code, event_count, total_value, updated_at
                 FROM season_ops_ops_counters
                 ORDER BY event_type ASC, season_id ASC, result_code ASC`
            ),
            dbAll(
                connection,
                `SELECT season_id, title, starts_at, ends_at, grace_ends_at, reward_impact
                 FROM season_ops_seasons
                 ORDER BY starts_at ASC, season_id ASC`
            ),
            dbGet(
                connection,
                `SELECT COUNT(*) AS offer_count
                 FROM season_ops_offers`
            ),
            dbAll(
                connection,
                `SELECT season_id, COUNT(*) AS player_count, COALESCE(MAX(score), 0) AS top_score
                 FROM pvp_season_ladders
                 WHERE authoritative_participant = 1 AND ranked_games > 0
                 GROUP BY season_id`
            ),
            dbAll(
                connection,
                `SELECT season_id, projection_status, COUNT(*) AS result_count
                 FROM pvp_season_ladder_results
                 GROUP BY season_id, projection_status
                 ORDER BY season_id ASC, projection_status ASC`
            ),
            dbGet(
                connection,
                `SELECT COUNT(*) AS purchase_count, COUNT(DISTINCT user_id) AS buyer_count
                 FROM season_ops_purchases`
            ),
            dbGet(
                connection,
                `SELECT COUNT(*) AS compensation_count, COALESCE(SUM(amount), 0) AS compensation_total
                 FROM season_ops_compensations`
            ),
            dbGet(
                connection,
                `SELECT COUNT(*) AS entitlement_count
                 FROM season_ops_entitlements`
            ),
            dbGet(
                connection,
                `SELECT COUNT(*) AS snapshot_count, COALESCE(MAX(created_at), 0) AS latest_snapshot_at
                 FROM season_ops_leaderboard_snapshots`
            ),
            dbAll(
                connection,
                `SELECT season_id, tier_id, COUNT(*) AS settlement_count
                 FROM season_ops_settlements
                 GROUP BY season_id, tier_id`
            )
        ]);
        const now = Date.now();
        return {
            success: true,
            reportVersion: 'season-ops-ops-overview-v1',
            protocolVersion: PROTOCOL_VERSION,
            generatedAt: now,
            catalogVersion: CATALOG_VERSION,
            seasons: seasonRows.map(row => {
                const season = getSeasonById(row.season_id) || {
                    seasonId: String(row.season_id || ''),
                    title: String(row.title || '')
                };
                return {
                    seasonId: String(row.season_id || ''),
                    title: String(row.title || season.title || ''),
                    state: getSeasonState(season, now).state,
                    startsAt: clampInt(row.starts_at),
                    endsAt: clampInt(row.ends_at),
                    graceEndsAt: clampInt(row.grace_ends_at),
                    rewardImpact: String(row.reward_impact || REWARD_IMPACT)
                };
            }),
            resources: {
                offerCount: clampInt(offerSummary && offerSummary.offer_count),
                purchaseCount: clampInt(purchaseSummary && purchaseSummary.purchase_count),
                buyerCount: clampInt(purchaseSummary && purchaseSummary.buyer_count),
                compensationCount: clampInt(compensationSummary && compensationSummary.compensation_count),
                compensationTotal: clampInt(compensationSummary && compensationSummary.compensation_total),
                entitlementCount: clampInt(entitlementSummary && entitlementSummary.entitlement_count),
                snapshotCount: clampInt(snapshotSummary && snapshotSummary.snapshot_count),
                latestSnapshotAt: clampInt(snapshotSummary && snapshotSummary.latest_snapshot_at)
            },
            ladders: ladderSummary.map(row => ({
                seasonId: String(row.season_id || ''),
                playerCount: clampInt(row.player_count),
                topScore: clampInt(row.top_score)
            })),
            authoritativeResults: authoritativeResultSummary.map(row => ({
                seasonId: String(row.season_id || ''),
                projectionStatus: String(row.projection_status || ''),
                count: clampInt(row.result_count)
            })),
            settlements: settlementSummary.map(row => ({
                seasonId: String(row.season_id || ''),
                tierId: String(row.tier_id || ''),
                count: clampInt(row.settlement_count)
            })),
            counters: counterRows.map(row => ({
                eventType: String(row.event_type || ''),
                seasonId: String(row.season_id || ''),
                resultCode: String(row.result_code || ''),
                eventCount: clampInt(row.event_count),
                totalValue: Math.floor(Number(row.total_value) || 0),
                updatedAt: clampInt(row.updated_at)
            }))
        };
    });
}

module.exports = {
    getDashboard,
    getLeaderboard,
    getSeasonLedger,
    purchaseOffer,
    grantCompensation,
    recordAuthoritativePvpResult,
    createLeaderboardSnapshot,
    settleSeason,
    reconcileSeason,
    getOpsOverview
};
