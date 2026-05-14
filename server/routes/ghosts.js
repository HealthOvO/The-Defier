const express = require('express');
const { db } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { validateGhostData } = require('../utils/ghostValidator');
const { verifySignature } = require('../utils/hmac');

const router = express.Router();

// POST /ghosts/current - 上传玩家残影数据
router.post('/current', authenticate, (req, res) => {
    const { realm, ghostData, signature, salt } = req.body;
    const userId = req.user.id;
    const userName = req.user.username;

    if (realm === undefined || !ghostData) {
        return res.status(400).json({ success: false, message: '参数不完整' });
    }

    const nRealm = Math.max(1, Number(realm) || 1);
    const dataStr = typeof ghostData === 'string' ? ghostData : JSON.stringify(ghostData);

    // HMAC 防篡改签名校验
    if (signature && salt) {
        if (!verifySignature(dataStr, salt, signature)) {
            return res.status(403).json({ success: false, message: '幽灵数据被篡改，拒绝上传' });
        }
    } else {
        console.warn(`[Anti-Cheat] User ${userId} uploaded ghost data without HMAC signature.`);
    }

    // 防作弊校验
    const validation = validateGhostData(nRealm, typeof ghostData === 'string' ? JSON.parse(ghostData) : ghostData);
    if (!validation.valid) {
        console.warn(`[Anti-Cheat] Ghost rejected for User ${userId}: ${validation.reason}`);
        return res.status(403).json({ success: false, message: `幽灵数据异常，拒绝上传: ${validation.reason}` });
    }

    const now = Date.now();

    // 先查询该用户是否已有残影，如果有则更新，没有则插入
    db.get(`SELECT id FROM game_ghosts WHERE user_id = ?`, [userId], (err, row) => {
        if (err) return res.status(500).json({ success: false, message: '数据库错误' });

        if (row) {
            db.run(
                `UPDATE game_ghosts SET realm = ?, ghost_data = ?, upload_time = ? WHERE user_id = ?`,
                [nRealm, dataStr, now, userId],
                (err) => {
                    if (err) return res.status(500).json({ success: false, message: '更新残影失败' });
                    res.json({ success: true });
                }
            );
        } else {
            db.run(
                `INSERT INTO game_ghosts (user_id, user_name, realm, ghost_data, upload_time) VALUES (?, ?, ?, ?, ?)`,
                [userId, userName, nRealm, dataStr, now],
                (err) => {
                    if (err) return res.status(500).json({ success: false, message: '上传残影失败' });
                    res.json({ success: true });
                }
            );
        }
    });
});

// GET /ghosts/random?realm=3 - 随机拉取当前层数附近的残影
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
        } catch (e) {}
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
