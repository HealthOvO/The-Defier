const express = require('express');
const { db } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { verifyRequestIntegrity } = require('../utils/hmac');
const { getMaxAcceptedClientTimestamp, normalizeClientTimestamp } = require('../utils/timestamps');

const router = express.Router();

function parseSlotIndex(slotIndex) {
    if (slotIndex === null || slotIndex === '') {
        return null;
    }
    if (typeof slotIndex !== 'number' && typeof slotIndex !== 'string') {
        return null;
    }
    const nIndex = Number(slotIndex);
    if (!Number.isInteger(nIndex) || nIndex < 0 || nIndex > 3) {
        return null;
    }
    return nIndex;
}

function buildStoredSaveData(saveData, canonicalSaveTime) {
    if (saveData && typeof saveData === 'object' && !Array.isArray(saveData)) {
        return JSON.stringify({ ...saveData, timestamp: canonicalSaveTime });
    }
    if (typeof saveData === 'string') {
        try {
            const parsed = JSON.parse(saveData);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return JSON.stringify({ ...parsed, timestamp: canonicalSaveTime });
            }
        } catch (error) {
            // Keep legacy raw string saves readable instead of rejecting an old payload shape.
        }
    }
    return typeof saveData === 'string' ? saveData : JSON.stringify(saveData);
}

// ----------------------
// 云存档模块
// ----------------------

// POST /api/saves - 上传/覆盖存档
router.post('/', authenticate, (req, res) => {
    const { slotIndex, saveData, saveTime, signature, salt, signatureMode } = req.body;
    const userId = req.user.id;

    if (slotIndex === undefined || !saveData) {
        return res.status(400).json({ success: false, message: '参数不完整' });
    }

    const dataStr = typeof saveData === 'string' ? saveData : JSON.stringify(saveData);

    const integrity = verifyRequestIntegrity(dataStr, salt, signature, {
        route: 'POST /api/saves',
        userId,
        sessionToken: req.authToken,
        signatureMode
    });
    if (!integrity.ok) {
        console.warn(`[Integrity] Rejected save upload for user ${userId}: ${integrity.reason}`);
        return res.status(integrity.status).json({ success: false, message: integrity.message });
    }

    const sIndex = parseSlotIndex(slotIndex);
    if (sIndex === null) {
        return res.status(400).json({ success: false, message: '非法的存档槽位' });
    }

    const sTime = normalizeClientTimestamp(saveTime);
    const maxStoredTime = getMaxAcceptedClientTimestamp();
    const storedDataStr = buildStoredSaveData(saveData, sTime);

    db.run(
        `INSERT INTO game_saves (user_id, slot_index, save_data, save_time) 
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, slot_index) 
         DO UPDATE SET save_data = excluded.save_data, save_time = excluded.save_time
         WHERE excluded.save_time > CASE
            WHEN game_saves.save_time > ? THEN 0
            ELSE game_saves.save_time
         END`,
        [userId, sIndex, storedDataStr, sTime, maxStoredTime],
        function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ success: false, message: '存档保存失败' });
            }
            res.json({
                success: true,
                skipped: this.changes === 0,
                saveTime: sTime,
                message: this.changes === 0 ? 'stale-save-ignored' : undefined
            });
        }
    );
});

// GET /api/saves - 拉取所有槽位存档
router.get('/', authenticate, (req, res) => {
    const userId = req.user.id;

    db.all(
        `SELECT slot_index as slotIndex, save_data as saveData, save_time as saveTime 
         FROM game_saves WHERE user_id = ?`,
        [userId],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: '获取存档失败' });
            
            // 将 JSON 字符串解析回对象
            const formattedData = rows.map(row => {
                try {
                    row.saveData = JSON.parse(row.saveData);
                } catch(e) {}
                return row;
            });

            res.json({ success: true, data: formattedData });
        }
    );
});

// ----------------------
// 全局数据模块
// ----------------------

// POST /api/user/global - 保存全局数据
router.post('/global', authenticate, (req, res) => {
    const { globalData, globalUpdatedAt, signature, salt, signatureMode } = req.body;
    const userId = req.user.id;

    if (globalData === undefined || globalData === null) {
        return res.status(400).json({ success: false, message: '参数不完整' });
    }

    if (typeof globalData !== 'object' || Array.isArray(globalData)) {
        return res.status(400).json({ success: false, message: '全局数据格式无效' });
    }

    const signedDataStr = JSON.stringify(globalData);
    const integrity = verifyRequestIntegrity(signedDataStr, salt, signature, {
        route: 'POST /api/user/global',
        userId,
        sessionToken: req.authToken,
        signatureMode
    });
    if (!integrity.ok) {
        console.warn(`[Integrity] Rejected global data upload for user ${userId}: ${integrity.reason}`);
        return res.status(integrity.status).json({ success: false, message: integrity.message });
    }

    const dataUpdatedAt = globalData && typeof globalData === 'object' && Number.isFinite(Number(globalData.updatedAt))
        ? Number(globalData.updatedAt)
        : 0;
    const updatedAt = normalizeClientTimestamp(
        globalUpdatedAt,
        dataUpdatedAt > 0 ? normalizeClientTimestamp(dataUpdatedAt) : Date.now()
    );
    const maxStoredTime = getMaxAcceptedClientTimestamp();
    const storedGlobalData = { ...globalData, updatedAt };
    const dataStr = JSON.stringify(storedGlobalData);

    db.run(
        `UPDATE users
         SET global_data = ?, global_updated_at = ?
         WHERE id = ? AND ? > CASE
            WHEN COALESCE(global_updated_at, 0) > ? THEN 0
            ELSE COALESCE(global_updated_at, 0)
         END`,
        [dataStr, updatedAt, userId, updatedAt, maxStoredTime],
        function(err) {
            if (err) return res.status(500).json({ success: false, message: '保存全局数据失败' });
            res.json({
                success: true,
                skipped: this.changes === 0,
                globalUpdatedAt: updatedAt,
                message: this.changes === 0 ? 'stale-global-data-ignored' : undefined
            });
        }
    );
});

// GET /api/user/global - 读取全局数据
router.get('/global', authenticate, (req, res) => {
    const userId = req.user.id;

    db.get(
        `SELECT global_data, global_updated_at FROM users WHERE id = ?`,
        [userId],
        (err, row) => {
            if (err) return res.status(500).json({ success: false, message: '获取全局数据失败' });
            
            let data = null;
            if (row && row.global_data) {
                try {
                    data = JSON.parse(row.global_data);
                } catch(e) {}
            }
            
            res.json({ success: true, data: data, globalUpdatedAt: row && row.global_updated_at ? row.global_updated_at : 0 });
        }
    );
});

module.exports = router;
