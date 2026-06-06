const express = require('express');
const crypto = require('crypto');
const { db } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { verifyRequestIntegrity } = require('../utils/hmac');
const { normalizeClientTimestamp } = require('../utils/timestamps');

const router = express.Router();
const SEASON_ID = 's1-genesis';
const MATCH_TTL_MS = 10 * 60 * 1000;
const PVP_SHOP_CATALOG = new Map([
    ['secret_manual_1', { id: 'secret_manual_1', type: 'card', name: '虚空破碎', price: 500, stock: 1 }],
    ['secret_manual_2', { id: 'secret_manual_2', type: 'card', name: '天道庇护', price: 300, stock: 1 }],
    ['item_reset_stats', { id: 'item_reset_stats', type: 'consumable', name: '洗髓丹', price: 1000, stock: 5 }],
    ['skin_void_walker', { id: 'skin_void_walker', type: 'skin', name: '法相·虚空行者', price: 2000, stock: 1 }],
    ['title_supreme', { id: 'title_supreme', type: 'title', name: '称号·独断万古', price: 5000, stock: 1 }]
]);

function isClientReportedSettlementEnabled() {
    const allowClientResult = ['1', 'true', 'yes', 'on'].includes(String(process.env.DEFIER_PVP_ALLOW_CLIENT_REPORTED_RESULT || '').toLowerCase());
    const testMode = ['1', 'true', 'yes', 'on'].includes(String(process.env.DEFIER_PVP_TEST_MODE || '').toLowerCase());
    const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    return allowClientResult && testMode && !isProduction;
}

function asyncHandler(fn) {
    return (req, res) => {
        Promise.resolve(fn(req, res)).catch((error) => {
            console.error('[PVP] Route failed:', error);
            res.status(500).json({ success: false, message: 'PVP 服务异常' });
        });
    };
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null));
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
    });
}

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

let transactionTail = Promise.resolve();

async function withTransaction(fn) {
    let releaseQueue;
    const myTurn = new Promise(resolve => {
        releaseQueue = resolve;
    });
    const previousTurn = transactionTail;
    transactionTail = previousTurn.catch(() => {}).then(() => myTurn);
    await previousTurn.catch(() => {});
    try {
        await dbRun('BEGIN IMMEDIATE');
        const result = await fn();
        await dbRun('COMMIT');
        return result;
    } catch (error) {
        try {
            await dbRun('ROLLBACK');
        } catch (rollbackError) {
            console.error('[PVP] Rollback failed:', rollbackError);
        }
        throw error;
    } finally {
        releaseQueue();
    }
}

function makeId(prefix) {
    if (typeof crypto.randomUUID === 'function') {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
}

function getDivisionByScore(score) {
    const s = Math.max(0, Math.floor(Number(score) || 0));
    if (s >= 1900) return '天穹榜';
    if (s >= 1600) return '凌霄榜';
    if (s >= 1300) return '问道榜';
    return '潜龙榜';
}

function parseJson(raw, fallback = null) {
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw === 'object') return raw;
    if (typeof raw !== 'string') return fallback;
    try {
        return JSON.parse(raw);
    } catch (error) {
        return fallback;
    }
}

function sanitizeDeckForPvp(rawDeck) {
    const source = Array.isArray(rawDeck) ? rawDeck : [];
    const deck = [];
    for (let i = 0; i < source.length && deck.length < 20 && i < 80; i++) {
        const card = source[i];
        const id = typeof card === 'string' ? card : card && card.id;
        if (!id || typeof id !== 'string') continue;
        deck.push({
            id: id.slice(0, 64),
            upgraded: !!(card && card.upgraded),
            name: card && typeof card.name === 'string' ? card.name.slice(0, 80) : undefined
        });
    }
    const fallback = ['strike', 'defend', 'quickSlash', 'meditation', 'spiritBoost', 'powerUp', 'shieldWall', 'heavyStrike'];
    for (let i = 0; deck.length < 8 && i < fallback.length; i++) {
        deck.push({ id: fallback[i], upgraded: false });
    }
    return deck;
}

function normalizeBattleData(rawData) {
    const parsed = parseJson(rawData, {});
    const data = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    const me = data.me && typeof data.me === 'object' ? data.me : {};
    const maxHp = Math.max(60, Math.min(5000, Math.floor(Number(me.maxHp) || 100)));
    const energy = Math.max(1, Math.min(12, Math.floor(Number(me.energy) || 3)));
    const currEnergy = Math.max(0, Math.min(energy, Math.floor(Number(me.currEnergy) || energy)));
    const deck = sanitizeDeckForPvp(data.deck);
    const aiProfile = typeof data.aiProfile === 'string' && data.aiProfile ? data.aiProfile.slice(0, 40) : 'balanced';
    const deckArchetype = typeof data.deckArchetype === 'string' && data.deckArchetype ? data.deckArchetype.slice(0, 40) : aiProfile;
    return {
        me: { maxHp, energy, currEnergy },
        deck,
        aiProfile,
        deckArchetype,
        ruleVersion: typeof data.ruleVersion === 'string' && data.ruleVersion ? data.ruleVersion.slice(0, 40) : 'pvp-v2',
        personalityRules: data.personalityRules && typeof data.personalityRules === 'object' && !Array.isArray(data.personalityRules)
            ? {
                damageMul: Number(data.personalityRules.damageMul) || 1,
                takenMul: Number(data.personalityRules.takenMul) || 1,
                regenEnergyPerTurn: Math.max(0, Math.floor(Number(data.personalityRules.regenEnergyPerTurn) || 0)),
                hpMul: Number(data.personalityRules.hpMul) || 1
            }
            : null
    };
}

function normalizeConfig(rawConfig = null) {
    const config = rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig) ? rawConfig : {};
    return {
        personality: typeof config.personality === 'string' && config.personality ? config.personality.slice(0, 40) : 'balanced',
        guardianFormation: !!config.guardianFormation
    };
}

function makeRankId(userId) {
    return `pvp-rank-${userId}`;
}

function publicRank(row, extra = {}) {
    if (!row) return null;
    const score = Math.max(0, Math.floor(Number(row.score) || 1000));
    const realm = Math.max(1, Math.floor(Number(row.realm) || 1));
    return {
        objectId: row.id || makeRankId(row.user_id),
        user: {
            objectId: row.user_id,
            username: row.user_name || '道友'
        },
        score,
        wins: Math.max(0, Math.floor(Number(row.wins) || 0)),
        losses: Math.max(0, Math.floor(Number(row.losses) || 0)),
        realm,
        division: row.division || getDivisionByScore(score),
        seasonId: row.season_id || SEASON_ID,
        updatedAt: Math.max(0, Math.floor(Number(row.updated_at) || 0)),
        hasDefenseSnapshot: !!extra.hasDefenseSnapshot,
        isServer: true
    };
}

function publicDefense(row) {
    if (!row) return null;
    const battleData = normalizeBattleData(parseJson(row.battle_data, {}));
    const config = normalizeConfig(parseJson(row.config_data, {}));
    return {
        objectId: row.id,
        user: {
            objectId: row.user_id,
            username: row.user_name || '道友'
        },
        powerScore: Math.max(0, Math.floor(Number(row.power_score) || 100)),
        realm: Math.max(1, Math.floor(Number(row.realm) || 1)),
        data: JSON.stringify(battleData),
        battleData,
        config,
        isDefense: true,
        saveTime: Math.max(0, Math.floor(Number(row.save_time) || 0)),
        isServer: true
    };
}

function defaultEconomy(userId) {
    return {
        version: 1,
        userId,
        coins: 1200,
        totalEarned: 1200,
        totalSpent: 0,
        wins: 0,
        losses: 0,
        totalMatches: 0,
        winStreak: 0,
        lossStreak: 0,
        bestWinStreak: 0,
        purchases: {},
        ownedItems: {},
        equippedSkinId: null,
        equippedTitleId: null,
        transactionLog: [],
        matchHistory: [],
        lastRewardAt: 0,
        lastPurchaseAt: 0
    };
}

function normalizeEconomy(raw, userId) {
    const defaults = defaultEconomy(userId);
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const purchases = {};
    if (src.purchases && typeof src.purchases === 'object') {
        Object.keys(src.purchases).forEach((key) => {
            const count = Math.max(0, Math.floor(Number(src.purchases[key]) || 0));
            if (count > 0) purchases[key] = count;
        });
    }
    const ownedItems = {};
    if (src.ownedItems && typeof src.ownedItems === 'object') {
        Object.keys(src.ownedItems).forEach((key) => {
            if (src.ownedItems[key]) ownedItems[key] = true;
        });
    }
    const transactionLog = Array.isArray(src.transactionLog)
        ? src.transactionLog.filter(it => it && typeof it === 'object').slice(-40)
        : [];
    const matchHistory = Array.isArray(src.matchHistory)
        ? src.matchHistory.filter(it => it && typeof it === 'object').slice(-24)
        : [];
    return {
        ...defaults,
        coins: Math.max(0, Math.floor(Number(src.coins) || defaults.coins)),
        totalEarned: Math.max(0, Math.floor(Number(src.totalEarned) || defaults.totalEarned)),
        totalSpent: Math.max(0, Math.floor(Number(src.totalSpent) || 0)),
        wins: Math.max(0, Math.floor(Number(src.wins) || 0)),
        losses: Math.max(0, Math.floor(Number(src.losses) || 0)),
        totalMatches: Math.max(0, Math.floor(Number(src.totalMatches) || 0)),
        winStreak: Math.max(0, Math.floor(Number(src.winStreak) || 0)),
        lossStreak: Math.max(0, Math.floor(Number(src.lossStreak) || 0)),
        bestWinStreak: Math.max(0, Math.floor(Number(src.bestWinStreak) || 0)),
        purchases,
        ownedItems,
        equippedSkinId: typeof src.equippedSkinId === 'string' ? src.equippedSkinId : null,
        equippedTitleId: typeof src.equippedTitleId === 'string' ? src.equippedTitleId : null,
        transactionLog,
        matchHistory,
        lastRewardAt: Math.max(0, Math.floor(Number(src.lastRewardAt) || 0)),
        lastPurchaseAt: Math.max(0, Math.floor(Number(src.lastPurchaseAt) || 0))
    };
}

async function ensureRank(user) {
    const now = Date.now();
    const rankId = makeRankId(user.id);
    await dbRun(
        `INSERT OR IGNORE INTO pvp_ranks (id, user_id, user_name, score, wins, losses, realm, division, season_id, created_at, updated_at)
         VALUES (?, ?, ?, 1000, 0, 0, 1, ?, ?, ?, ?)`,
        [rankId, user.id, user.username, getDivisionByScore(1000), SEASON_ID, now, now]
    );
    await dbRun(
        `UPDATE pvp_ranks SET user_name = ? WHERE user_id = ?`,
        [user.username, user.id]
    );
    const row = await dbGet(`SELECT * FROM pvp_ranks WHERE user_id = ?`, [user.id]);
    const defense = await dbGet(`SELECT id FROM pvp_defense_snapshots WHERE user_id = ?`, [user.id]);
    return publicRank(row, { hasDefenseSnapshot: !!defense });
}

async function ensureEconomy(userId) {
    const now = Date.now();
    const existing = await dbGet(`SELECT economy_data FROM pvp_economy WHERE user_id = ?`, [userId]);
    if (existing) {
        return normalizeEconomy(parseJson(existing.economy_data, {}), userId);
    }
    const economy = defaultEconomy(userId);
    await dbRun(
        `INSERT OR IGNORE INTO pvp_economy (user_id, economy_data, updated_at) VALUES (?, ?, ?)`,
        [userId, JSON.stringify(economy), now]
    );
    return economy;
}

async function saveEconomy(userId, economy) {
    const normalized = normalizeEconomy(economy, userId);
    await dbRun(
        `INSERT INTO pvp_economy (user_id, economy_data, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET economy_data = excluded.economy_data, updated_at = excluded.updated_at`,
        [userId, JSON.stringify(normalized), Date.now()]
    );
    return normalized;
}

function walletSummary(economy) {
    return {
        coins: economy.coins,
        totalEarned: economy.totalEarned,
        totalSpent: economy.totalSpent,
        wins: economy.wins,
        losses: economy.losses,
        totalMatches: economy.totalMatches,
        winStreak: economy.winStreak,
        lossStreak: economy.lossStreak,
        bestWinStreak: economy.bestWinStreak
    };
}

function calculateElo(myRating, opponentRating, didWin) {
    const my = Math.max(0, Number(myRating) || 1000);
    const opp = Math.max(0, Number(opponentRating) || 1000);
    const expected = 1 / (1 + Math.pow(10, (opp - my) / 400));
    const actual = didWin ? 1 : 0;
    let delta = Math.round(32 * (actual - expected));
    if (didWin) delta = Math.max(8, Math.min(32, delta));
    else delta = Math.min(-8, Math.max(-32, delta));
    return {
        newRating: Math.max(0, my + delta),
        delta
    };
}

function calculateReward({ didWin, opponentRating, currentRating, winStreak = 0, lossStreak = 0 }) {
    const division = getDivisionByScore(currentRating);
    const divisionMultiplier = division === '天穹榜' ? 1.2 : division === '凌霄榜' ? 1.12 : division === '问道榜' ? 1.06 : 1;
    const baseReward = didWin ? 65 : 30;
    const rankedBonus = 15;
    const ratingBonus = Math.max(0, Math.min(20, Math.floor((Math.max(0, Number(opponentRating) || 1000) - 1000) / 80)));
    const streakBase = didWin ? winStreak : lossStreak;
    const streakMultiplier = didWin ? Math.min(1.25, 1 + streakBase * 0.03) : Math.min(1.12, 1 + streakBase * 0.02);
    return Math.max(8, Math.floor((baseReward + rankedBonus + (didWin ? ratingBonus : Math.floor(ratingBonus / 2))) * streakMultiplier * divisionMultiplier));
}

function appendEconomyLog(economy, entry) {
    const logs = Array.isArray(economy.transactionLog) ? economy.transactionLog.slice(-39) : [];
    logs.push({
        type: entry.type || 'misc',
        itemId: entry.itemId || null,
        itemName: entry.itemName || null,
        coins: Math.floor(Number(entry.coins) || 0),
        detail: entry.detail || '',
        at: Math.max(0, Math.floor(Number(entry.at) || Date.now()))
    });
    return { ...economy, transactionLog: logs };
}

function appendMatchHistory(economy, entry) {
    const history = Array.isArray(economy.matchHistory) ? economy.matchHistory.slice(-23) : [];
    history.push(entry);
    return { ...economy, matchHistory: history };
}

router.get('/rank', authenticate, asyncHandler(async (req, res) => {
    const rank = await ensureRank(req.user);
    const economy = await ensureEconomy(req.user.id);
    res.json({ success: true, rank, wallet: walletSummary(economy), economy });
}));

router.get('/leaderboard', authenticate, asyncHandler(async (req, res) => {
    await ensureRank(req.user);
    const limit = Math.max(1, Math.min(50, Math.floor(Number(req.query.limit) || 20)));
    const rows = await dbAll(
        `SELECT r.*, d.id AS defense_id
         FROM pvp_ranks r
         LEFT JOIN pvp_defense_snapshots d ON d.user_id = r.user_id
         ORDER BY r.score DESC, r.updated_at ASC
         LIMIT ?`,
        [limit]
    );
    const data = rows.map(row => publicRank(row, { hasDefenseSnapshot: !!row.defense_id }));
    res.json({ success: true, data });
}));

router.post('/defense', authenticate, asyncHandler(async (req, res) => {
    const body = req.body || {};
    const rawBattleData = body.battleData !== undefined ? body.battleData : body.data;
    if (!rawBattleData) {
        return res.status(400).json({ success: false, message: '参数不完整' });
    }
    const defenseRequest = {
        realm: Math.max(1, Math.floor(Number(body.realm) || 1)),
        powerScore: Math.max(0, Math.min(999999, Math.floor(Number(body.powerScore) || 100))),
        battleData: rawBattleData,
        config: body.config && typeof body.config === 'object' && !Array.isArray(body.config) ? body.config : {},
        snapshotTime: Number.isFinite(Number(body.snapshotTime)) ? Number(body.snapshotTime) : Date.now()
    };
    const integrity = verifyRequestIntegrity(JSON.stringify(defenseRequest), body.salt, body.signature, {
        route: 'POST /api/pvp/defense',
        userId: req.user.id,
        sessionToken: req.authToken,
        signatureMode: body.signatureMode
    });
    if (!integrity.ok) {
        console.warn(`[Integrity] Rejected PVP defense upload for user ${req.user.id}: ${integrity.reason}`);
        return res.status(integrity.status).json({ success: false, message: integrity.message });
    }

    const battleData = normalizeBattleData(defenseRequest.battleData);
    const config = normalizeConfig(defenseRequest.config);
    const realm = defenseRequest.realm;
    const powerScore = defenseRequest.powerScore;
    const saveTime = normalizeClientTimestamp(defenseRequest.snapshotTime, Date.now());
    const snapshotId = makeId('pvp-defense');
    await ensureRank(req.user);
    await dbRun(
        `INSERT INTO pvp_defense_snapshots (id, user_id, user_name, power_score, realm, battle_data, config_data, save_time, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
            user_name = excluded.user_name,
            power_score = excluded.power_score,
            realm = excluded.realm,
            battle_data = excluded.battle_data,
            config_data = excluded.config_data,
            save_time = excluded.save_time,
            updated_at = excluded.updated_at`,
        [snapshotId, req.user.id, req.user.username, powerScore, realm, JSON.stringify(battleData), JSON.stringify(config), saveTime, Date.now()]
    );
    await dbRun(
        `UPDATE pvp_ranks SET realm = ?, division = ?, updated_at = ? WHERE user_id = ?`,
        [realm, getDivisionByScore((await dbGet(`SELECT score FROM pvp_ranks WHERE user_id = ?`, [req.user.id]))?.score || 1000), Date.now(), req.user.id]
    );
    const row = await dbGet(`SELECT * FROM pvp_defense_snapshots WHERE user_id = ?`, [req.user.id]);
    const rank = await ensureRank(req.user);
    res.json({ success: true, snapshot: publicDefense(row), rank, saveTime });
}));

router.get('/defense/me', authenticate, asyncHandler(async (req, res) => {
    const row = await dbGet(`SELECT * FROM pvp_defense_snapshots WHERE user_id = ?`, [req.user.id]);
    if (!row) {
        return res.json({ success: false, message: '未设置防御快照' });
    }
    res.json({ success: true, snapshot: publicDefense(row) });
}));

router.post('/match', authenticate, asyncHandler(async (req, res) => {
    const body = req.body || {};
    const matchRequest = {
        myScore: Math.max(0, Math.floor(Number(body.myScore) || 1000)),
        myRealm: Math.max(1, Math.floor(Number(body.myRealm) || 1)),
        preferredRankId: typeof body.preferredRankId === 'string' ? body.preferredRankId : '',
        allowPractice: body.allowPractice !== false
    };
    const integrity = verifyRequestIntegrity(JSON.stringify(matchRequest), body.salt, body.signature, {
        route: 'POST /api/pvp/match',
        userId: req.user.id,
        sessionToken: req.authToken,
        signatureMode: body.signatureMode
    });
    if (!integrity.ok) {
        console.warn(`[Integrity] Rejected PVP matchmaking for user ${req.user.id}: ${integrity.reason}`);
        return res.status(integrity.status).json({ success: false, message: integrity.message });
    }
    const myScore = matchRequest.myScore;
    await ensureRank(req.user);

    let row = null;
    const preferredRankId = matchRequest.preferredRankId;
    if (preferredRankId) {
        row = await dbGet(
            `SELECT r.*, d.id AS defense_id, d.power_score, d.battle_data, d.config_data, d.save_time
             FROM pvp_ranks r
             INNER JOIN pvp_defense_snapshots d ON d.user_id = r.user_id
             WHERE r.id = ? AND r.user_id != ?`,
            [preferredRankId, req.user.id]
        );
    }
    if (!row) {
        row = await dbGet(
            `SELECT r.*, d.id AS defense_id, d.power_score, d.battle_data, d.config_data, d.save_time
             FROM pvp_ranks r
             INNER JOIN pvp_defense_snapshots d ON d.user_id = r.user_id
             WHERE r.user_id != ?
             ORDER BY ABS(r.score - ?) ASC, r.score DESC, r.updated_at ASC
             LIMIT 1`,
            [req.user.id, myScore]
        );
    }
    if (!row) {
        return res.json({ success: false, message: '暂无对手数据' });
    }

    const issuedAt = Date.now();
    const expiresAt = issuedAt + MATCH_TTL_MS;
    const ticket = makeId('pvp-ticket');
    await dbRun(
        `INSERT INTO pvp_match_tickets (ticket_id, user_id, opponent_user_id, opponent_rank_id, opponent_score, issued_at, expires_at, consumed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [ticket, req.user.id, row.user_id, row.id, Math.max(0, Math.floor(Number(row.score) || 1000)), issuedAt, expiresAt, issuedAt]
    );

    const rank = publicRank(row, { hasDefenseSnapshot: true });
    const ghost = publicDefense({
        id: row.defense_id,
        user_id: row.user_id,
        user_name: row.user_name,
        power_score: row.power_score,
        realm: row.realm,
        battle_data: row.battle_data,
        config_data: row.config_data,
        save_time: row.save_time
    });
    res.json({
        success: true,
        matchTicket: ticket,
        issuedAt,
        expiresAt,
        opponent: {
            rank,
            ghost,
            battleData: ghost.battleData,
            matchTicket: ticket
        }
    });
}));

router.post('/match/result', authenticate, asyncHandler(async (req, res) => {
    const body = req.body || {};
    const report = body.report && typeof body.report === 'object'
        ? body.report
        : { matchTicket: body.matchTicket, didWin: !!body.didWin };
    const matchTicket = typeof report.matchTicket === 'string' ? report.matchTicket : '';
    if (!matchTicket) {
        return res.status(400).json({ success: false, message: '缺少对局票据' });
    }
    const signedReport = {
        matchTicket,
        didWin: !!report.didWin
    };
    const integrity = verifyRequestIntegrity(JSON.stringify(signedReport), body.salt, body.signature, {
        route: 'POST /api/pvp/match/result',
        userId: req.user.id,
        sessionToken: req.authToken,
        signatureMode: body.signatureMode
    });
    if (!integrity.ok) {
        console.warn(`[Integrity] Rejected PVP match report for user ${req.user.id}: ${integrity.reason}`);
        return res.status(integrity.status).json({ success: false, message: integrity.message });
    }
    if (!isClientReportedSettlementEnabled()) {
        return res.json({
            success: false,
            reason: 'server_authority_unavailable',
            message: 'PVP 权威结算未启用，服务端不会信任客户端胜负上报'
        });
    }

    const result = await withTransaction(async () => {
        const ticket = await dbGet(
            `SELECT * FROM pvp_match_tickets WHERE ticket_id = ? AND user_id = ?`,
            [matchTicket, req.user.id]
        );
        if (!ticket) {
            const error = new Error('对局票据无效');
            error.status = 400;
            throw error;
        }
        if (Number(ticket.consumed_at) > 0) {
            const error = new Error('对局票据已结算');
            error.status = 409;
            throw error;
        }
        if (Date.now() > Number(ticket.expires_at || 0)) {
            const error = new Error('对局票据已过期');
            error.status = 410;
            throw error;
        }
        await ensureRank(req.user);
        const rankRow = await dbGet(`SELECT * FROM pvp_ranks WHERE user_id = ?`, [req.user.id]);
        const currentRating = Math.max(0, Math.floor(Number(rankRow.score) || 1000));
        const opponentRating = Math.max(0, Math.floor(Number(ticket.opponent_score) || 1000));
        const didWin = !!signedReport.didWin;
        const calc = calculateElo(currentRating, opponentRating, didWin);
        const wins = Math.max(0, Math.floor(Number(rankRow.wins) || 0)) + (didWin ? 1 : 0);
        const losses = Math.max(0, Math.floor(Number(rankRow.losses) || 0)) + (didWin ? 0 : 1);
        const division = getDivisionByScore(calc.newRating);
        const now = Date.now();

        await dbRun(
            `UPDATE pvp_ranks SET score = ?, wins = ?, losses = ?, division = ?, updated_at = ? WHERE user_id = ?`,
            [calc.newRating, wins, losses, division, now, req.user.id]
        );

        let economy = await ensureEconomy(req.user.id);
        const coinsAwarded = calculateReward({
            didWin,
            opponentRating,
            currentRating,
            winStreak: economy.winStreak,
            lossStreak: economy.lossStreak
        });
        const nextEconomyBase = {
            ...economy,
            coins: economy.coins + coinsAwarded,
            totalEarned: economy.totalEarned + coinsAwarded,
            wins: economy.wins + (didWin ? 1 : 0),
            losses: economy.losses + (didWin ? 0 : 1),
            totalMatches: economy.totalMatches + 1,
            winStreak: didWin ? economy.winStreak + 1 : 0,
            lossStreak: didWin ? 0 : economy.lossStreak + 1,
            lastRewardAt: now
        };
        nextEconomyBase.bestWinStreak = Math.max(nextEconomyBase.bestWinStreak, nextEconomyBase.winStreak);
        const opponentRank = await dbGet(`SELECT * FROM pvp_ranks WHERE user_id = ?`, [ticket.opponent_user_id]);
        const historyEntry = {
            seasonId: SEASON_ID,
            seasonName: '开天赛季',
            opponentRankId: ticket.opponent_rank_id,
            opponentUserId: ticket.opponent_user_id,
            opponentName: opponentRank && opponentRank.user_name ? opponentRank.user_name : '未知对手',
            opponentDivision: opponentRank && opponentRank.division ? opponentRank.division : getDivisionByScore(opponentRating),
            opponentRealm: opponentRank ? Math.max(1, Math.floor(Number(opponentRank.realm) || 1)) : 1,
            didWin,
            verdictLabel: didWin ? '问道得胜' : '败而不馁',
            ratingDelta: calc.delta,
            coinsAwarded,
            dangerIndex: 0,
            dangerTierId: 'controlled',
            dangerTierLabel: '可控',
            dominantAxisId: 'burst',
            dominantAxisLabel: '先手爆发',
            at: now
        };
        let nextEconomy = appendEconomyLog(nextEconomyBase, {
            type: 'match_reward',
            coins: coinsAwarded,
            detail: didWin ? 'PVP 胜场奖励' : 'PVP 参战奖励',
            at: now
        });
        nextEconomy = appendMatchHistory(nextEconomy, historyEntry);
        nextEconomy = await saveEconomy(req.user.id, nextEconomy);

        const resultData = {
            didWin,
            oldRating: currentRating,
            newRating: calc.newRating,
            delta: calc.delta,
            coinsAwarded,
            settledAt: now
        };
        await dbRun(
            `UPDATE pvp_match_tickets SET consumed_at = ?, result_data = ? WHERE ticket_id = ?`,
            [now, JSON.stringify(resultData), matchTicket]
        );
        await dbRun(
            `INSERT OR IGNORE INTO pvp_match_history
                (ticket_id, user_id, opponent_user_id, did_win, rating_delta, score_after, coins_awarded, payload, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [matchTicket, req.user.id, ticket.opponent_user_id, didWin ? 1 : 0, calc.delta, calc.newRating, coinsAwarded, JSON.stringify(historyEntry), now]
        );
        const updatedRankRow = await dbGet(`SELECT * FROM pvp_ranks WHERE user_id = ?`, [req.user.id]);
        const defense = await dbGet(`SELECT id FROM pvp_defense_snapshots WHERE user_id = ?`, [req.user.id]);
        return {
            newRating: calc.newRating,
            delta: calc.delta,
            coinsAwarded,
            rank: publicRank(updatedRankRow, { hasDefenseSnapshot: !!defense }),
            economy: nextEconomy,
            wallet: walletSummary(nextEconomy)
        };
    }).catch((error) => {
        if (error.status) {
            return { routeError: error };
        }
        throw error;
    });

    if (result.routeError) {
        return res.status(result.routeError.status).json({ success: false, message: result.routeError.message });
    }
    res.json({ success: true, ...result });
}));

router.get('/economy', authenticate, asyncHandler(async (req, res) => {
    const economy = await ensureEconomy(req.user.id);
    res.json({ success: true, economy, wallet: walletSummary(economy) });
}));

router.post('/shop/purchase', authenticate, asyncHandler(async (req, res) => {
    const body = req.body || {};
    const purchaseRequest = {
        itemId: typeof body.itemId === 'string' ? body.itemId : ''
    };
    if (!purchaseRequest.itemId) {
        return res.status(400).json({ success: false, message: '参数不完整' });
    }
    const integrity = verifyRequestIntegrity(JSON.stringify(purchaseRequest), body.salt, body.signature, {
        route: 'POST /api/pvp/shop/purchase',
        userId: req.user.id,
        sessionToken: req.authToken,
        signatureMode: body.signatureMode
    });
    if (!integrity.ok) {
        return res.status(integrity.status).json({ success: false, message: integrity.message });
    }
    const purchase = PVP_SHOP_CATALOG.get(purchaseRequest.itemId);
    if (!purchase) {
        return res.status(400).json({ success: false, message: '商品不存在', reason: 'missing' });
    }

    const outcome = await withTransaction(async () => {
        let economy = await ensureEconomy(req.user.id);
        if (economy.coins < purchase.price) {
            return {
                status: 400,
                payload: { success: false, message: '天道币不足', reason: 'insufficient', wallet: walletSummary(economy) }
            };
        }
        const purchasedCount = Math.max(0, Math.floor(Number(economy.purchases[purchase.id]) || 0));
        if (Math.max(0, Math.floor(Number(purchase.stock) || 0)) > 0 && purchasedCount >= purchase.stock) {
            return {
                status: 400,
                payload: { success: false, message: '该商品已售罄', reason: 'sold_out', wallet: walletSummary(economy) }
            };
        }
        const isCosmetic = purchase.type === 'skin' || purchase.type === 'title';
        if (isCosmetic && economy.ownedItems[purchase.id]) {
            return {
                status: 400,
                payload: { success: false, message: '该商品已拥有', reason: 'owned', wallet: walletSummary(economy) }
            };
        }
        const now = Date.now();
        const next = {
            ...economy,
            coins: economy.coins - purchase.price,
            totalSpent: economy.totalSpent + purchase.price,
            purchases: {
                ...economy.purchases,
                [purchase.id]: purchasedCount + 1
            },
            ownedItems: {
                ...economy.ownedItems,
                ...(purchase.type !== 'consumable' ? { [purchase.id]: true } : {})
            },
            ...(purchase.type === 'skin' && !economy.equippedSkinId ? { equippedSkinId: purchase.id } : {}),
            ...(purchase.type === 'title' && !economy.equippedTitleId ? { equippedTitleId: purchase.id } : {}),
            lastPurchaseAt: now
        };
        economy = appendEconomyLog(next, {
            type: 'purchase',
            itemId: purchase.id,
            itemName: purchase.name,
            coins: -purchase.price,
            detail: 'PVP 商店兑换',
            at: now
        });
        economy = await saveEconomy(req.user.id, economy);
        return {
            status: 200,
            payload: {
                success: true,
                itemId: purchase.id,
                itemName: purchase.name,
                coinsSpent: purchase.price,
                economy,
                wallet: walletSummary(economy)
            }
        };
    });
    res.status(outcome.status).json(outcome.payload);
}));

module.exports = router;
