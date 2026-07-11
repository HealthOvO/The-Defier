const crypto = require('node:crypto');
const {
    CATALOG_VERSION,
    OFFERS,
    REWARD_IMPACT,
    SEASONS
} = require('./catalog');

function dbRun(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(error) {
            if (error) reject(error);
            else resolve(this);
        });
    });
}

function dbGet(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => {
            if (error) reject(error);
            else resolve(row || null);
        });
    });
}

function dbAll(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) reject(error);
            else resolve(rows || []);
        });
    });
}

function stableStringify(value) {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(',')}]`;
    if (typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function hashCatalogEntry(value) {
    return crypto.createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}

function makeSeasonRow(season) {
    return {
        seasonId: season.seasonId,
        catalogVersion: CATALOG_VERSION,
        title: season.title,
        ruleVersion: season.ruleVersion,
        startsAt: season.startsAt,
        endsAt: season.endsAt,
        graceEndsAt: season.graceEndsAt,
        rewardImpact: season.rewardImpact,
        settlementTiers: season.settlementTiers,
        boundary: season.boundary
    };
}

function makeOfferRow(offer) {
    return {
        offerId: offer.offerId,
        seasonId: offer.seasonId,
        catalogVersion: CATALOG_VERSION,
        title: offer.title,
        offerType: offer.offerType,
        entitlementType: offer.entitlementType,
        entitlementKey: offer.entitlementKey,
        priceCurrency: offer.priceCurrency,
        priceAmount: offer.priceAmount,
        purchaseLimit: offer.purchaseLimit,
        rewardImpact: offer.rewardImpact
    };
}

async function ensureCatalogRows(db, now) {
    for (const season of SEASONS) {
        const payload = makeSeasonRow(season);
        const contentHash = hashCatalogEntry(payload);
        const existing = await dbGet(
            db,
            `SELECT catalog_version, content_hash
             FROM season_ops_seasons
             WHERE season_id = ?`,
            [season.seasonId]
        );
        if (existing && String(existing.content_hash || '') !== contentHash) {
            const error = new Error(`season catalog drift detected for ${season.seasonId}`);
            error.code = 'SEASON_OPS_CATALOG_DRIFT';
            throw error;
        }
        if (!existing) {
            await dbRun(
                db,
                `INSERT INTO season_ops_seasons
                    (season_id, catalog_version, title, starts_at, ends_at, grace_ends_at,
                     rule_version, state_json, content_hash, reward_impact, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    season.seasonId,
                    CATALOG_VERSION,
                    season.title,
                    season.startsAt,
                    season.endsAt,
                    season.graceEndsAt,
                    season.ruleVersion,
                    JSON.stringify(payload),
                    contentHash,
                    season.rewardImpact,
                    now,
                    now
                ]
            );
        }
    }

    for (const offer of OFFERS) {
        const payload = makeOfferRow(offer);
        const contentHash = hashCatalogEntry(payload);
        const existing = await dbGet(
            db,
            `SELECT catalog_version, content_hash
             FROM season_ops_offers
             WHERE offer_id = ?`,
            [offer.offerId]
        );
        if (existing && String(existing.content_hash || '') !== contentHash) {
            const error = new Error(`season offer catalog drift detected for ${offer.offerId}`);
            error.code = 'SEASON_OPS_CATALOG_DRIFT';
            throw error;
        }
        if (!existing) {
            await dbRun(
                db,
                `INSERT INTO season_ops_offers
                    (offer_id, season_id, catalog_version, title, offer_type, entitlement_type,
                     entitlement_key, price_currency, price_amount, purchase_limit, metadata_json,
                     content_hash, reward_impact, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    offer.offerId,
                    offer.seasonId,
                    CATALOG_VERSION,
                    offer.title,
                    offer.offerType,
                    offer.entitlementType,
                    offer.entitlementKey,
                    offer.priceCurrency,
                    offer.priceAmount,
                    offer.purchaseLimit,
                    JSON.stringify(payload),
                    contentHash,
                    offer.rewardImpact,
                    now
                ]
            );
        }
    }
}

async function backfillSettlementStartTimes(db) {
    const rows = await dbAll(
        db,
        `SELECT s.match_id, s.created_at AS settled_at, m.created_at AS match_created_at, m.state_json
         FROM pvp_live_match_settlements s
         LEFT JOIN pvp_live_matches m ON m.match_id = s.match_id
         WHERE s.match_started_at <= 0`
    );
    for (const row of rows) {
        let state = null;
        try {
            state = row.state_json ? JSON.parse(row.state_json) : null;
        } catch (error) {
            state = null;
        }
        const matchStartedAt = Math.max(
            0,
            Math.floor(Number(state && state.setup && state.setup.battleStartedAt)
                || Number(row.match_created_at)
                || Number(row.settled_at)
                || 0)
        );
        if (matchStartedAt <= 0) continue;
        await dbRun(
            db,
            `UPDATE pvp_live_match_settlements
             SET match_started_at = ?
             WHERE match_id = ? AND match_started_at <= 0`,
            [matchStartedAt, row.match_id]
        );
    }
}

async function backfillAuthoritativeParticipants(db, now) {
    for (const season of SEASONS) {
        const seasonId = String(season && season.seasonId || '').trim();
        if (!seasonId) continue;
        const finalSnapshot = await dbGet(
            db,
            `SELECT finalized_at
             FROM season_ops_leaderboard_snapshots
             WHERE season_id = ? AND snapshot_type = 'final'
             LIMIT 1`,
            [seasonId]
        );
        const finalizedAt = Math.max(0, Math.floor(Number(finalSnapshot && finalSnapshot.finalized_at) || 0));
        const settlements = await dbAll(
            db,
            `SELECT s.match_id, s.winner_user_id, s.loser_user_id,
                    s.winner_score_after, s.loser_score_after, s.created_at,
                    COALESCE(NULLIF(s.match_started_at, 0), NULLIF(m.created_at, 0), s.created_at) AS match_started_at
             FROM pvp_live_match_settlements s
             LEFT JOIN pvp_live_matches m ON m.match_id = s.match_id
             WHERE COALESCE(NULLIF(s.match_started_at, 0), NULLIF(m.created_at, 0), s.created_at) >= ?
               AND COALESCE(NULLIF(s.match_started_at, 0), NULLIF(m.created_at, 0), s.created_at) < ?
             ORDER BY match_started_at ASC, s.match_id ASC`,
            [season.startsAt, season.endsAt]
        );
        if (settlements.length === 0) continue;
        const participants = new Map();
        const ensureParticipant = (userId, createdAt) => {
            const id = String(userId || '').trim();
            if (!id) return null;
            const current = participants.get(id) || {
                userId: id,
                score: 1000,
                wins: 0,
                losses: 0,
                firstAuthoritativeAt: Math.max(0, Math.floor(Number(createdAt) || now)),
                lastMatchId: '',
                lastResult: '',
                updatedAt: 0
            };
            participants.set(id, current);
            return current;
        };
        const calculateBackfillElo = (rating, opponentRating, didWin) => {
            const current = Math.max(0, Math.floor(Number(rating) || 1000));
            const opponent = Math.max(0, Math.floor(Number(opponentRating) || 1000));
            const expected = 1 / (1 + Math.pow(10, (opponent - current) / 400));
            let delta = Math.round(32 * ((didWin ? 1 : 0) - expected));
            if (didWin) delta = Math.max(8, Math.min(32, delta));
            else delta = Math.min(-8, Math.max(-32, delta));
            return Math.max(0, current + delta);
        };
        const getDivision = score => score >= 1900
            ? '天穹榜'
            : score >= 1600
                ? '凌霄榜'
                : score >= 1300
                    ? '问道榜'
                    : '潜龙榜';
        const record = (current, didWin, scoreAfter, matchId, occurredAt, settledAt) => {
            if (!current) return;
            if (didWin) current.wins += 1;
            else current.losses += 1;
            current.score = Math.max(0, Math.floor(Number(scoreAfter) || current.score));
            current.firstAuthoritativeAt = Math.min(current.firstAuthoritativeAt, Math.max(0, Math.floor(Number(occurredAt) || now)));
            current.lastMatchId = String(matchId || '');
            current.lastResult = didWin ? 'win' : 'loss';
            current.updatedAt = Math.max(current.updatedAt, Math.max(0, Math.floor(Number(settledAt) || Number(occurredAt) || now)));
        };
        for (const row of settlements) {
            const matchStartedAt = Math.max(0, Math.floor(Number(row.match_started_at) || Number(row.created_at) || now));
            const settledAt = Math.max(matchStartedAt, Math.floor(Number(row.created_at) || matchStartedAt));
            const shouldApply = finalizedAt <= 0 || settledAt <= finalizedAt;
            const winner = shouldApply ? ensureParticipant(row.winner_user_id, matchStartedAt) : null;
            const loser = shouldApply ? ensureParticipant(row.loser_user_id, matchStartedAt) : null;
            const winnerScore = winner ? winner.score : Math.max(0, Math.floor(Number(row.winner_score_after) || 1000));
            const loserScore = loser ? loser.score : Math.max(0, Math.floor(Number(row.loser_score_after) || 1000));
            if (winner && loser) {
                record(winner, true, calculateBackfillElo(winnerScore, loserScore, true), row.match_id, matchStartedAt, settledAt);
                record(loser, false, calculateBackfillElo(loserScore, winnerScore, false), row.match_id, matchStartedAt, settledAt);
            }
            for (const [participant, userId, didWin, scoreBefore, fallbackScoreAfter] of [
                [winner, row.winner_user_id, true, winnerScore, row.winner_score_after],
                [loser, row.loser_user_id, false, loserScore, row.loser_score_after]
            ]) {
                const scoreAfter = participant
                    ? participant.score
                    : Math.max(0, Math.floor(Number(fallbackScoreAfter) || scoreBefore));
                await dbRun(
                    db,
                    `INSERT OR IGNORE INTO pvp_season_ladder_results
                        (season_id, user_id, match_id, did_win, score_before, score_after, wins_after,
                         losses_after, ranked_games_after, division, occurred_at, settled_at, projection_status, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        seasonId,
                        String(participant && participant.userId || userId || ''),
                        row.match_id,
                        didWin ? 1 : 0,
                        scoreBefore,
                        scoreAfter,
                        participant ? participant.wins : 0,
                        participant ? participant.losses : 0,
                        participant ? participant.wins + participant.losses : 0,
                        getDivision(scoreAfter),
                        matchStartedAt,
                        settledAt,
                        shouldApply ? 'applied' : 'post_snapshot_noop',
                        settledAt
                    ]
                );
            }
        }
        for (const participant of participants.values()) {
            const identity = await dbGet(
                db,
                `SELECT u.username, r.user_name
                 FROM users u
                 LEFT JOIN pvp_ranks r ON r.user_id = u.id
                 WHERE u.id = ?`,
                [participant.userId]
            );
            const division = getDivision(participant.score);
            await dbRun(
                db,
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
                    first_authoritative_at = excluded.first_authoritative_at,
                    last_match_id = excluded.last_match_id,
                    last_result = excluded.last_result,
                    updated_at = excluded.updated_at,
                    created_at = excluded.created_at`,
                [
                    seasonId,
                    participant.userId,
                    String(identity && (identity.username || identity.user_name) || participant.userId),
                    participant.score,
                    participant.wins,
                    participant.losses,
                    participant.wins + participant.losses,
                    division,
                    participant.firstAuthoritativeAt,
                    participant.lastMatchId,
                    participant.lastResult,
                    participant.updatedAt || now,
                    participant.firstAuthoritativeAt
                ]
            );
        }
    }
}

async function bootstrapSeasonOpsSchema(db) {
    const now = Date.now();
    await dbRun(db, 'BEGIN IMMEDIATE');
    try {
        await dbRun(
            db,
            `CREATE TABLE IF NOT EXISTS season_ops_seasons (
                season_id TEXT PRIMARY KEY,
                catalog_version TEXT NOT NULL,
                title TEXT NOT NULL,
                starts_at INTEGER NOT NULL,
                ends_at INTEGER NOT NULL,
                grace_ends_at INTEGER NOT NULL,
                rule_version TEXT NOT NULL,
                state_json TEXT NOT NULL DEFAULT '{}',
                content_hash TEXT NOT NULL,
                reward_impact TEXT NOT NULL DEFAULT '${REWARD_IMPACT}',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )`
        );
        await dbRun(
            db,
            `CREATE TABLE IF NOT EXISTS season_ops_offers (
                offer_id TEXT PRIMARY KEY,
                season_id TEXT NOT NULL,
                catalog_version TEXT NOT NULL,
                title TEXT NOT NULL,
                offer_type TEXT NOT NULL,
                entitlement_type TEXT NOT NULL,
                entitlement_key TEXT NOT NULL,
                price_currency TEXT NOT NULL,
                price_amount INTEGER NOT NULL,
                purchase_limit INTEGER NOT NULL DEFAULT 1,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                content_hash TEXT NOT NULL,
                reward_impact TEXT NOT NULL DEFAULT '${REWARD_IMPACT}',
                created_at INTEGER NOT NULL,
                FOREIGN KEY(season_id) REFERENCES season_ops_seasons(season_id)
            )`
        );
        await dbRun(
            db,
            `CREATE TABLE IF NOT EXISTS season_ops_mutations (
                user_id TEXT NOT NULL,
                mutation_id TEXT NOT NULL,
                season_id TEXT NOT NULL,
                request_type TEXT NOT NULL,
                request_hash TEXT NOT NULL,
                request_body_json TEXT NOT NULL DEFAULT '{}',
                receipt_json TEXT NOT NULL DEFAULT '{}',
                purchase_id TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                PRIMARY KEY(user_id, mutation_id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`
        );
        await dbRun(
            db,
            `CREATE TABLE IF NOT EXISTS season_ops_purchases (
                purchase_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                season_id TEXT NOT NULL,
                offer_id TEXT NOT NULL,
                mutation_id TEXT NOT NULL,
                request_hash TEXT NOT NULL,
                ledger_entry_id TEXT NOT NULL,
                entitlement_id TEXT NOT NULL,
                price_currency TEXT NOT NULL,
                price_amount INTEGER NOT NULL,
                receipt_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                UNIQUE(user_id, offer_id),
                UNIQUE(user_id, mutation_id),
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(offer_id) REFERENCES season_ops_offers(offer_id)
            )`
        );
        await dbRun(
            db,
            `CREATE TABLE IF NOT EXISTS season_ops_compensations (
                compensation_id TEXT PRIMARY KEY,
                target_user_id TEXT NOT NULL,
                season_id TEXT NOT NULL,
                mutation_id TEXT NOT NULL,
                reason_code TEXT NOT NULL,
                amount INTEGER NOT NULL,
                ledger_entry_id TEXT NOT NULL,
                actor_ref TEXT NOT NULL,
                receipt_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                UNIQUE(target_user_id, mutation_id),
                FOREIGN KEY(target_user_id) REFERENCES users(id)
            )`
        );
        await dbRun(
            db,
            `CREATE TABLE IF NOT EXISTS season_ops_entitlements (
                entitlement_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                entitlement_key TEXT NOT NULL,
                entitlement_type TEXT NOT NULL,
                source_type TEXT NOT NULL,
                source_id TEXT NOT NULL,
                season_id TEXT NOT NULL DEFAULT '',
                reward_impact TEXT NOT NULL DEFAULT '${REWARD_IMPACT}',
                metadata_json TEXT NOT NULL DEFAULT '{}',
                granted_at INTEGER NOT NULL,
                UNIQUE(user_id, entitlement_key),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`
        );
        await dbRun(
            db,
            `CREATE TABLE IF NOT EXISTS pvp_season_ladders (
                season_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                user_name TEXT NOT NULL,
                score INTEGER NOT NULL DEFAULT 1000,
                wins INTEGER NOT NULL DEFAULT 0,
                losses INTEGER NOT NULL DEFAULT 0,
                ranked_games INTEGER NOT NULL DEFAULT 0,
                division TEXT NOT NULL DEFAULT '潜龙榜',
                authoritative_participant INTEGER NOT NULL DEFAULT 0,
                first_authoritative_at INTEGER NOT NULL DEFAULT 0,
                last_match_id TEXT NOT NULL DEFAULT '',
                last_result TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY(season_id, user_id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`
        );
        await dbRun(
            db,
            `CREATE TABLE IF NOT EXISTS pvp_season_ladder_results (
                season_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                match_id TEXT NOT NULL,
                did_win INTEGER NOT NULL DEFAULT 0,
                score_before INTEGER NOT NULL DEFAULT 1000,
                score_after INTEGER NOT NULL DEFAULT 1000,
                wins_after INTEGER NOT NULL DEFAULT 0,
                losses_after INTEGER NOT NULL DEFAULT 0,
                ranked_games_after INTEGER NOT NULL DEFAULT 0,
                division TEXT NOT NULL DEFAULT '潜龙榜',
                occurred_at INTEGER NOT NULL,
                settled_at INTEGER NOT NULL,
                projection_status TEXT NOT NULL DEFAULT 'applied',
                created_at INTEGER NOT NULL,
                PRIMARY KEY(season_id, user_id, match_id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`
        );
        await dbRun(
            db,
            `CREATE TABLE IF NOT EXISTS season_ops_leaderboard_snapshots (
                snapshot_id TEXT PRIMARY KEY,
                season_id TEXT NOT NULL UNIQUE,
                snapshot_type TEXT NOT NULL DEFAULT 'final',
                entry_count INTEGER NOT NULL DEFAULT 0,
                content_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                finalized_at INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(season_id) REFERENCES season_ops_seasons(season_id)
            )`
        );
        await dbRun(
            db,
            `CREATE TABLE IF NOT EXISTS season_ops_leaderboard_entries (
                snapshot_id TEXT NOT NULL,
                season_id TEXT NOT NULL,
                rank INTEGER NOT NULL,
                user_id TEXT NOT NULL,
                user_name TEXT NOT NULL,
                score INTEGER NOT NULL,
                wins INTEGER NOT NULL,
                losses INTEGER NOT NULL,
                ranked_games INTEGER NOT NULL,
                division TEXT NOT NULL DEFAULT '潜龙榜',
                settlement_tier_id TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                PRIMARY KEY(snapshot_id, rank),
                UNIQUE(snapshot_id, user_id),
                FOREIGN KEY(snapshot_id) REFERENCES season_ops_leaderboard_snapshots(snapshot_id)
            )`
        );
        await dbRun(
            db,
            `CREATE TABLE IF NOT EXISTS season_ops_settlements (
                season_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                snapshot_id TEXT NOT NULL,
                final_rank INTEGER NOT NULL DEFAULT 0,
                tier_id TEXT NOT NULL,
                renown_awarded INTEGER NOT NULL DEFAULT 0,
                entitlement_key TEXT NOT NULL DEFAULT '',
                entitlement_type TEXT NOT NULL DEFAULT '',
                ledger_entry_id TEXT NOT NULL DEFAULT '',
                entitlement_id TEXT NOT NULL DEFAULT '',
                balance_after INTEGER NOT NULL DEFAULT 0,
                wallet_applied INTEGER NOT NULL DEFAULT 0,
                ledger_written INTEGER NOT NULL DEFAULT 0,
                entitlement_written INTEGER NOT NULL DEFAULT 0,
                receipt_json TEXT NOT NULL DEFAULT '{}',
                settled_at INTEGER NOT NULL,
                reconciled_at INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(season_id, user_id),
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(snapshot_id) REFERENCES season_ops_leaderboard_snapshots(snapshot_id)
            )`
        );
        await dbRun(
            db,
            `CREATE TABLE IF NOT EXISTS season_ops_ops_events (
                event_id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                season_id TEXT NOT NULL DEFAULT '',
                result_code TEXT NOT NULL DEFAULT '',
                value INTEGER NOT NULL DEFAULT 0,
                detail_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL
            )`
        );
        await dbRun(
            db,
            `CREATE TABLE IF NOT EXISTS season_ops_ops_counters (
                event_type TEXT NOT NULL,
                season_id TEXT NOT NULL DEFAULT '',
                result_code TEXT NOT NULL DEFAULT '',
                event_count INTEGER NOT NULL DEFAULT 0,
                total_value INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY(event_type, season_id, result_code)
            )`
        );
        await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_season_ops_offers_season ON season_ops_offers(season_id, created_at)`);
        await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_season_ops_mutations_season ON season_ops_mutations(season_id, created_at DESC)`);
        await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_season_ops_purchases_user_created ON season_ops_purchases(user_id, created_at DESC)`);
        await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_season_ops_compensations_season_created ON season_ops_compensations(season_id, created_at DESC)`);
        await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_season_ops_entitlements_user ON season_ops_entitlements(user_id, granted_at DESC)`);
        await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_pvp_season_ladders_board ON pvp_season_ladders(season_id, score DESC, wins DESC, updated_at ASC, user_id ASC)`);
        await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_pvp_season_ladders_user ON pvp_season_ladders(user_id, updated_at DESC)`);
        await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_pvp_season_results_timeline ON pvp_season_ladder_results(season_id, user_id, occurred_at DESC, match_id DESC)`);
        await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_pvp_season_results_match ON pvp_season_ladder_results(match_id, season_id)`);
        await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_season_ops_snapshot_entries_board ON season_ops_leaderboard_entries(season_id, rank ASC)`);
        await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_season_ops_settlements_tier ON season_ops_settlements(season_id, tier_id, settled_at)`);
        await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_season_ops_ops_events_created ON season_ops_ops_events(event_type, created_at DESC)`);

        await ensureCatalogRows(db, now);
        await backfillSettlementStartTimes(db);
        await backfillAuthoritativeParticipants(db, now);
        await dbRun(db, 'COMMIT');
    } catch (error) {
        try {
            await dbRun(db, 'ROLLBACK');
        } catch (rollbackError) {
            console.error('[SeasonOps] Bootstrap rollback failed:', rollbackError);
        }
        throw error;
    }
}

module.exports = {
    bootstrapSeasonOpsSchema
};
