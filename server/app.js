const express = require('express');
const cors = require('cors');
const { initDb } = require('./db/database');
const { validateAuthConfig } = require('./middleware/auth');
const { validateIntegrityConfig } = require('./utils/hmac');

const authRoutes = require('./routes/auth');
const savesRoutes = require('./routes/saves');
const ghostsRoutes = require('./routes/ghosts');

const app = express();
const PORT = process.env.PORT || 9000;

// Middleware
app.use(cors()); // 允许跨域，方便前端直接调用
app.use(express.json()); // 解析 JSON body

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/saves', savesRoutes);
// 因为迁移文档中定义的获取/保存全局数据前缀为 /user
app.use('/api/user', savesRoutes); 
app.use('/api/ghosts', ghostsRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'The Defier Backend is running' });
});

// Start Server
const startServer = async () => {
    try {
        validateAuthConfig();
        validateIntegrityConfig();
        await initDb();
        console.log('Database initialized successfully.');
        
        app.listen(PORT, () => {
            console.log(`Server is running on http://127.0.0.1:${PORT}`);
            console.log(`API endpoints ready:`);
            console.log(`- POST /api/auth/register`);
            console.log(`- POST /api/auth/login`);
            console.log(`- GET/POST /api/saves`);
            console.log(`- GET/POST /api/user/global`);
            console.log(`- POST /api/ghosts/current`);
            console.log(`- GET /api/ghosts/random`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
};

startServer();
