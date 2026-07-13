const express = require('express');
const cors = require('cors');
const { db, getSchemaStatus, initDb } = require('./db/database');
const { validateAuthConfig } = require('./middleware/auth');
const { validateIntegrityConfig } = require('./utils/hmac');
const { makeSqliteLivePvpPersistence } = require('./pvp-live/live-persistence');
const { makeSqliteLivePvpSettlement } = require('./pvp-live/live-settlement');
const { attachLivePvpWebSocket } = require('./pvp-live/live-ws');
const { attachRequestContext } = require('./services/platform/request-context');
const { makeHealthVersionSummary, makeVersionPayload } = require('./services/platform/runtime-info');

const authRoutes = require('./routes/auth');
const savesRoutes = require('./routes/saves');
const ghostsRoutes = require('./routes/ghosts');
const pvpRoutes = require('./routes/pvp');
const pvpLiveRoutes = require('./routes/pvp-live');
const progressionRoutes = require('./routes/progression');
const seasonOpsRoutes = require('./routes/season-ops');
const challengeLadderRoutes = require('./routes/challenge-ladder');
const worldRiftRoutes = require('./routes/world-rift');
const socialRoutes = require('./routes/social');
const relayExpeditionRoutes = require('./routes/relay-expedition');
const fateChronicleRoutes = require('./routes/fate-chronicle');
const weeklyArchiveRoutes = require('./routes/weekly-archive');

const app = express();
const PORT = process.env.PORT || 9000;

// Middleware
app.use(cors()); // 允许跨域，方便前端直接调用
app.use(express.json({ limit: '384kb' })); // Business routes enforce smaller scope-specific limits.
app.use(attachRequestContext());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/saves', savesRoutes);
// 因为迁移文档中定义的获取/保存全局数据前缀为 /user
app.use('/api/user', savesRoutes); 
app.use('/api/ghosts', ghostsRoutes);
app.use('/api/pvp/live', pvpLiveRoutes);
app.use('/api/pvp', pvpRoutes);
app.use('/api/progression', progressionRoutes);
app.use('/api/season-ops', seasonOpsRoutes);
app.use('/api/challenge-ladder', challengeLadderRoutes);
app.use('/api/world-rift', worldRiftRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/relay-expeditions', relayExpeditionRoutes);
app.use('/api/fate-chronicle', fateChronicleRoutes);
app.use('/api/weekly-archive', weeklyArchiveRoutes);

const getHealthPayload = async () => {
    const schemaStatus = await getSchemaStatus();
    if (!schemaStatus.ready) {
        throw new Error(`database schema is incomplete: ${schemaStatus.missingResources.join(', ')}`);
    }
    return {
        status: 'ok',
        message: 'The Defier Backend is running',
        checks: {
            database: db.open ? 'ok' : 'unknown',
            schema: 'ok'
        },
        schema: {
            version: schemaStatus.version,
            currentMigrationId: schemaStatus.currentMigrationId,
            ready: true
        },
        version: makeHealthVersionSummary(),
        uptimeMs: Math.floor(process.uptime() * 1000)
    };
};

const sendHealth = async (req, res) => {
    try {
        res.json(await getHealthPayload());
    } catch (error) {
        res.status(503).json({
            status: 'error',
            message: 'The Defier Backend health check failed',
            checks: {
                database: 'error',
                schema: 'error'
            },
            requestId: req.requestId
        });
    }
};

// Health and runtime version checks
app.get('/health', sendHealth);
app.get('/api/health', sendHealth);
const sendVersion = async (req, res) => {
    try {
        const schemaStatus = await getSchemaStatus();
        if (!schemaStatus.ready) throw new Error('database schema is incomplete');
        res.json(makeVersionPayload(schemaStatus));
    } catch (error) {
        res.status(503).json({
            status: 'error',
            service: 'the-defier-backend',
            message: 'runtime version unavailable',
            requestId: req.requestId
        });
    }
};

app.get('/version', sendVersion);
app.get('/api/version', sendVersion);

app.use((error, req, res, next) => {
    if (error && error.type === 'entity.too.large') {
        return res.status(413).json({
            success: false,
            reason: 'payload_too_large',
            message: '请求数据超过允许大小',
            requestId: req.requestId
        });
    }
    return next(error);
});

// Start Server
const startServer = async () => {
    try {
        validateAuthConfig();
        validateIntegrityConfig();
        await initDb();
        if (pvpLiveRoutes && typeof pvpLiveRoutes.__attachServices === 'function') {
            pvpLiveRoutes.__attachServices({
                persistence: makeSqliteLivePvpPersistence(),
                settlement: makeSqliteLivePvpSettlement()
            });
        }
        console.log('Database initialized successfully.');
        
        const server = app.listen(PORT, () => {
            console.log(`Server is running on http://127.0.0.1:${PORT}`);
            console.log(`API endpoints ready:`);
            console.log(`- POST /api/auth/register`);
            console.log(`- POST /api/auth/login`);
            console.log(`- GET/POST /api/saves`);
            console.log(`- GET/POST /api/user/global`);
            console.log(`- POST /api/ghosts/current`);
            console.log(`- GET /api/ghosts/random`);
            console.log(`- GET/POST /api/pvp/live/*`);
            console.log(`- WS /api/pvp/live/ws`);
            console.log(`- GET/POST /api/pvp/*`);
            console.log(`- GET/POST /api/progression/*`);
            console.log(`- GET/POST /api/season-ops/*`);
            console.log(`- GET/POST /api/challenge-ladder/*`);
            console.log(`- GET/POST /api/world-rift/*`);
            console.log(`- GET/POST /api/social/*`);
            console.log(`- GET/POST /api/relay-expeditions/*`);
            console.log(`- GET/POST /api/fate-chronicle/*`);
            console.log(`- GET/POST /api/weekly-archive/*`);
        });
        attachLivePvpWebSocket(server, { livePvpStore: pvpLiveRoutes.__livePvpStore });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
};

startServer();
