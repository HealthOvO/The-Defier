const express = require('express');
const { db } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ----------------------
// 云存档模块
// ----------------------

// POST /saves - 上传/覆盖存档
router.post('/', authenticate, (req, res) => {
    const { slotIndex, saveData, saveTime } = req.body;
    const userId = req.user.id;

    if (slotIndex === undefined || !saveData) {
        return res.status(400).json({ success: false, message: '参数不完整' });
    }

    const sIndex = Number(slotIndex);
    if (sIndex < 0 || sIndex > 3) {
        return res.status(400).json({ success: false, message: '非法的存档槽位' });
    }

    const sTime = Number(saveTime) || Date.now();
    const dataStr = typeof saveData === 'string' ? saveData : JSON.stringify(saveData);

    db.run(
        `INSERT INTO game_saves (user_id, slot_index, save_data, save_time) 
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, slot_index) 
         DO UPDATE SET save_data = excluded.save_data, save_time = excluded.save_time`,
        [userId, sIndex, dataStr, sTime],
        function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ success: false, message: '存档保存失败' });
            }
            res.json({ success: true });
        }
    );
});

// GET /saves - 拉取所有槽位存档
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

// POST /user/global - 保存全局数据
router.post('/global', authenticate, (req, res) => {
    const { globalData } = req.body;
    const userId = req.user.id;

    if (!globalData) {
        return res.status(400).json({ success: false, message: '参数不完整' });
    }

    const dataStr = typeof globalData === 'string' ? globalData : JSON.stringify(globalData);

    db.run(
        `UPDATE users SET global_data = ? WHERE id = ?`,
        [dataStr, userId],
        function(err) {
            if (err) return res.status(500).json({ success: false, message: '保存全局数据失败' });
            res.json({ success: true });
        }
    );
});

// GET /user/global - 读取全局数据
router.get('/global', authenticate, (req, res) => {
    const userId = req.user.id;

    db.get(
        `SELECT global_data FROM users WHERE id = ?`,
        [userId],
        (err, row) => {
            if (err) return res.status(500).json({ success: false, message: '获取全局数据失败' });
            
            let data = null;
            if (row && row.global_data) {
                try {
                    data = JSON.parse(row.global_data);
                } catch(e) {}
            }
            
            res.json({ success: true, data: data });
        }
    );
});

module.exports = router;
