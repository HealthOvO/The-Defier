const crypto = require('crypto');

function getSecretKey() {
    return typeof process.env.DEFIER_HMAC_SECRET === 'string'
        ? process.env.DEFIER_HMAC_SECRET.trim()
        : '';
}

function isSignatureConfigured() {
    return getSecretKey().length > 0;
}

function generateSignature(dataStr, salt) {
    const secretKey = getSecretKey();
    if (!secretKey) {
        throw new Error('DEFIER_HMAC_SECRET is not configured');
    }
    return crypto.createHmac('sha256', secretKey)
        .update(dataStr + salt)
        .digest('hex');
}

function verifySignature(dataStr, salt, signature) {
    if (!isSignatureConfigured() || !signature) return false;
    const expected = generateSignature(dataStr, salt);
    const expectedBuffer = Buffer.from(expected, 'hex');
    const signatureBuffer = Buffer.from(String(signature), 'hex');
    return expectedBuffer.length === signatureBuffer.length
        && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

module.exports = {
    generateSignature,
    isSignatureConfigured,
    verifySignature
};
