const crypto = require('crypto');

// The secret key should ideally come from an environment variable
// Using a hardcoded fallback for development purposes
const SECRET_KEY = process.env.DEFIER_HMAC_SECRET || 'the_defier_secret_key_2026';

function generateSignature(dataStr, salt) {
    return crypto.createHmac('sha256', SECRET_KEY)
        .update(dataStr + salt)
        .digest('hex');
}

function verifySignature(dataStr, salt, signature) {
    const expected = generateSignature(dataStr, salt);
    return expected === signature;
}

module.exports = {
    generateSignature,
    verifySignature
};
