const crypto = require('crypto');

const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

const sanitizeRequestId = (value) => {
    const candidate = Array.isArray(value) ? value[0] : value;
    if (!candidate) return '';
    const normalized = String(candidate).trim();
    return SAFE_REQUEST_ID.test(normalized) ? normalized : '';
};

const makeRequestId = () => {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return crypto.randomBytes(16).toString('hex');
};

const writeStructuredHttpLog = (record) => {
    if (process.env.DEFIER_STRUCTURED_HTTP_LOGS === '0') return;
    try {
        console.log(JSON.stringify(record));
    } catch (error) {
        console.log(`[http] ${record.method} ${record.path} ${record.statusCode} ${record.durationMs}ms`);
    }
};

const attachRequestContext = () => (req, res, next) => {
    const startedAt = Date.now();
    const requestId = sanitizeRequestId(req.headers[REQUEST_ID_HEADER]) || makeRequestId();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    res.on('finish', () => {
        writeStructuredHttpLog({
            ts: new Date().toISOString(),
            level: 'info',
            event: 'http_request',
            requestId,
            method: req.method,
            path: req.originalUrl || req.url,
            statusCode: res.statusCode,
            durationMs: Date.now() - startedAt
        });
    });
    next();
};

module.exports = {
    attachRequestContext,
    sanitizeRequestId
};
