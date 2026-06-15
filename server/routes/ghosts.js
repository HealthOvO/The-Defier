const express = require('express');
const { db } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { validateGhostData } = require('../utils/ghostValidator');
const { verifyRequestIntegrity } = require('../utils/hmac');
const { getMaxAcceptedClientTimestamp, normalizeClientTimestamp } = require('../utils/timestamps');

const router = express.Router();

// POST /api/ghosts/current - 上传玩家残影数据
router.post('/current', authenticate, (req, res) => {
    const { realm, ghostData, uploadTime, signature, salt, signatureMode } = req.body;
    const userId = req.user.id;
    const userName = req.user.username;

    if (realm === undefined || !ghostData) {
        return res.status(400).json({ success: false, message: '参数不完整' });
    }

    const nRealm = Math.max(1, Number(realm) || 1);
    const dataStr = typeof ghostData === 'string' ? ghostData : JSON.stringify(ghostData);
    let parsedGhostData = ghostData;
    if (typeof ghostData === 'string') {
        try {
            parsedGhostData = JSON.parse(ghostData);
        } catch (error) {
            return res.status(400).json({ success: false, message: '残影数据格式无效' });
        }
    }

    const integrity = verifyRequestIntegrity(dataStr, salt, signature, {
        route: 'POST /api/ghosts/current',
        userId,
        sessionToken: req.authToken,
        signatureMode
    });
    if (!integrity.ok) {
        console.warn(`[Integrity] Rejected ghost upload for user ${userId}: ${integrity.reason}`);
        return res.status(integrity.status).json({ success: false, message: integrity.message });
    }

    // 防作弊校验
    const validation = validateGhostData(nRealm, parsedGhostData);
    if (!validation.valid) {
        console.warn(`[Anti-Cheat] Ghost rejected for User ${userId}: ${validation.reason}`);
        return res.status(403).json({ success: false, message: `幽灵数据异常，拒绝上传: ${validation.reason}` });
    }

    const dataUpdatedAt = parsedGhostData && typeof parsedGhostData === 'object' && Number.isFinite(Number(parsedGhostData.updatedAt))
        ? Number(parsedGhostData.updatedAt)
        : 0;
    const now = normalizeClientTimestamp(
        uploadTime,
        dataUpdatedAt > 0 ? normalizeClientTimestamp(dataUpdatedAt) : Date.now()
    );
    const maxStoredTime = getMaxAcceptedClientTimestamp();
    const storedGhostData = { ...parsedGhostData, updatedAt: now };
    const storedDataStr = JSON.stringify(storedGhostData);

    db.run(
        `INSERT INTO game_ghosts (user_id, user_name, realm, ghost_data, upload_time)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id)
         DO UPDATE SET
            user_name = excluded.user_name,
            realm = excluded.realm,
            ghost_data = excluded.ghost_data,
            upload_time = excluded.upload_time
         WHERE excluded.upload_time > CASE
            WHEN game_ghosts.upload_time > ? THEN 0
            ELSE game_ghosts.upload_time
         END`,
        [userId, userName, nRealm, storedDataStr, now, maxStoredTime],
        function(err) {
            if (err) return res.status(500).json({ success: false, message: '上传残影失败' });
            res.json({
                success: true,
                skipped: this.changes === 0,
                uploadTime: now,
                message: this.changes === 0 ? 'stale-ghost-ignored' : undefined
            });
        }
    );
});

// GET /api/ghosts/random?realm=3 - 随机拉取当前层数附近的残影
// 不强制要求鉴权，但如果有鉴权信息，可以排除自己
router.get('/random', (req, res) => {
    const realm = Math.max(1, Number(req.query.realm) || 1);
    const minRealm = Math.max(1, realm - 2);
    const maxRealm = realm + 2;

    // 尝试解析可选的 token 以获取当前用户 ID，从而排除自己
    let currentUserId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('../middleware/auth');
        try {
            const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
            currentUserId = decoded.id;
        } catch (e) {
            return res.status(401).json({ success: false, message: 'Token无效或已过期' });
        }
    }

    let query = `SELECT user_name as userName, realm, ghost_data as ghostData FROM game_ghosts WHERE realm >= ? AND realm <= ?`;
    let params = [minRealm, maxRealm];

    if (currentUserId) {
        query += ` AND user_id != ?`;
        params.push(currentUserId);
    }

    // SQLite 随机排序并限制拉取数量
    query += ` ORDER BY RANDOM() LIMIT 1`;

    db.get(query, params, (err, row) => {
        if (err) return res.status(500).json({ success: false, message: '拉取残影失败' });

        if (!row) {
            return res.json({ success: false, message: '未找到合适的对手残影' });
        }

        try {
            row.ghostData = JSON.parse(row.ghostData);
        } catch (e) {}

        res.json({ success: true, data: row });
    });
});

module.exports = router;
