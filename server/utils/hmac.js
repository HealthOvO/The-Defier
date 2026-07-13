const crypto = require('crypto');

const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/i;
const SALT_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

function getSecretKey() {
    return typeof process.env.DEFIER_HMAC_SECRET === 'string'
        ? process.env.DEFIER_HMAC_SECRET.trim()
        : '';
}

function isSignatureConfigured() {
    return getSecretKey().length >= 32;
}

function isIntegrityRequired() {
    return ['1', 'true', 'yes', 'on'].includes(String(process.env.DEFIER_INTEGRITY_REQUIRED || '').toLowerCase());
}

function validateSignatureInput(salt, signature) {
    if (typeof salt !== 'string' || !SALT_PATTERN.test(salt)) {
        return { valid: false, reason: 'invalid-salt' };
    }
    if (typeof signature !== 'string' || !SIGNATURE_PATTERN.test(signature)) {
        return { valid: false, reason: 'invalid-signature-format' };
    }
    return { valid: true };
}

function generateSignature(dataStr, salt) {
    const secretKey = getSecretKey();
    if (!isSignatureConfigured()) {
        throw new Error('DEFIER_HMAC_SECRET must be at least 32 characters');
    }
    return crypto.createHmac('sha256', secretKey)
        .update('v1', 'utf8')
        .update('\n', 'utf8')
        .update(String(salt), 'utf8')
        .update('\n', 'utf8')
        .update(String(dataStr), 'utf8')
        .digest('hex');
}

function normalizeSignedRoute(route) {
    return String(route || '').trim().replace(/\s+/g, ' ');
}

function generateSessionSignature(dataStr, salt, sessionToken, route = '') {
    if (typeof sessionToken !== 'string' || sessionToken.length < 16) {
        throw new Error('session token is required for session integrity signatures');
    }
    const signedRoute = normalizeSignedRoute(route);
    return crypto.createHmac('sha256', sessionToken)
        .update(signedRoute ? 'session-v2' : 'session-v1', 'utf8')
        .update(signedRoute ? `\n${signedRoute}` : '', 'utf8')
        .update('\n', 'utf8')
        .update(String(salt), 'utf8')
        .update('\n', 'utf8')
        .update(String(dataStr), 'utf8')
        .digest('hex');
}

function verifySignature(dataStr, salt, signature) {
    if (!isSignatureConfigured()) return false;
    const input = validateSignatureInput(salt, signature);
    if (!input.valid) return false;
    const expected = generateSignature(dataStr, salt);
    const expectedBuffer = Buffer.from(expected, 'hex');
    const signatureBuffer = Buffer.from(String(signature), 'hex');
    return expectedBuffer.length === signatureBuffer.length
        && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

function verifySessionSignature(dataStr, salt, signature, sessionToken, route = '') {
    if (typeof sessionToken !== 'string' || sessionToken.length < 16) return false;
    const input = validateSignatureInput(salt, signature);
    if (!input.valid) return false;
    const expected = generateSessionSignature(dataStr, salt, sessionToken, route);
    const expectedBuffer = Buffer.from(expected, 'hex');
    const signatureBuffer = Buffer.from(String(signature), 'hex');
    return expectedBuffer.length === signatureBuffer.length
        && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

function validateIntegrityConfig() {
    const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    if (isProduction && !isIntegrityRequired()) {
        throw new Error('NODE_ENV=production requires DEFIER_INTEGRITY_REQUIRED=1');
    }
    if (!isIntegrityRequired()) return;
    if (!isSignatureConfigured()) {
        throw new Error('DEFIER_INTEGRITY_REQUIRED requires DEFIER_HMAC_SECRET with at least 32 characters');
    }
}

function verifyRequestIntegrity(dataStr, salt, signature, context = {}) {
    // A partial signature payload is treated as an explicit integrity attempt.
    // This keeps optional mode permissive for unsigned clients while rejecting malformed signed requests.
    const hasSignature = signature !== undefined || salt !== undefined;
    const route = context.route || 'unknown-route';
    const userId = context.userId || 'anonymous';
    const signatureMode = typeof context.signatureMode === 'string' ? context.signatureMode : '';
    const sessionToken = typeof context.sessionToken === 'string' ? context.sessionToken : '';

    if (!hasSignature) {
        if (isIntegrityRequired()) {
            return { ok: false, status: 400, reason: 'missing-signature', message: '缺少完整性签名' };
        }
        return { ok: true, skipped: true };
    }

    const input = validateSignatureInput(salt, signature);
    if (!input.valid) {
        return { ok: false, status: 400, reason: input.reason, message: '完整性签名格式无效' };
    }

    if (!isSignatureConfigured()) {
        if (signatureMode === 'session' || signatureMode === 'session-v2') {
            if (signatureMode === 'session-v2' && !normalizeSignedRoute(route)) {
                return { ok: false, status: 400, reason: 'missing-signed-route', message: '会话完整性签名缺少请求路径' };
            }
            if (verifySessionSignature(dataStr, salt, signature, sessionToken, signatureMode === 'session-v2' ? route : '')) {
                return { ok: true, mode: signatureMode };
            }
            return { ok: false, status: 403, reason: 'session-signature-mismatch', message: '会话完整性签名校验失败' };
        }
        console.warn(`[Integrity] Rejected signature for ${route} from user ${userId}: DEFIER_HMAC_SECRET is not configured.`);
        return { ok: false, status: 403, reason: 'hmac-not-configured', message: '服务端完整性校验未配置' };
    }

    if (signatureMode === 'session' || signatureMode === 'session-v2') {
        if (signatureMode === 'session-v2' && !normalizeSignedRoute(route)) {
            return { ok: false, status: 400, reason: 'missing-signed-route', message: '会话完整性签名缺少请求路径' };
        }
        if (verifySessionSignature(dataStr, salt, signature, sessionToken, signatureMode === 'session-v2' ? route : '')) {
            return { ok: true, mode: signatureMode };
        }
        return { ok: false, status: 403, reason: 'session-signature-mismatch', message: '会话完整性签名校验失败' };
    }

    if (!verifySignature(dataStr, salt, signature)) {
        return { ok: false, status: 403, reason: 'signature-mismatch', message: '完整性签名校验失败' };
    }

    return { ok: true };
}

module.exports = {
    generateSignature,
    generateSessionSignature,
    isSignatureConfigured,
    isIntegrityRequired,
    validateIntegrityConfig,
    validateSignatureInput,
    verifyRequestIntegrity,
    verifySignature,
    verifySessionSignature
};
