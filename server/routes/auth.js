const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { db } = require('../db/database');
const { generateToken } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 10;

// POST /auth/register
router.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
    }

    try {
        db.get(`SELECT id FROM users WHERE username = ?`, [username], async (err, row) => {
            if (err) return res.status(500).json({ success: false, message: '数据库错误' });
            if (row) return res.status(400).json({ success: false, message: '用户名已存在' });

            const hash = await bcrypt.hash(password, SALT_ROUNDS);
            const userId = crypto.randomUUID();
            const now = Date.now();

            db.run(`INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)`, 
                [userId, username, hash, now], 
                function(err) {
                    if (err) return res.status(500).json({ success: false, message: '注册失败' });
                    
                    const token = generateToken({ id: userId, username });
                    res.json({
                        success: true,
                        user: {
                            objectId: userId,
                            username: username,
                            sessionToken: token
                        }
                    });
            });
        });
    } catch (e) {
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
});

// POST /auth/login
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
    }

    db.get(`SELECT id, username, password_hash FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err) return res.status(500).json({ success: false, message: '数据库错误' });
        if (!user) return res.status(401).json({ success: false, message: '用户名或密码错误' });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ success: false, message: '用户名或密码错误' });

        const token = generateToken({ id: user.id, username: user.username });
        res.json({
            success: true,
            user: {
                objectId: user.id,
                username: user.username,
                sessionToken: token
            }
        });
    });
});

module.exports = router;
