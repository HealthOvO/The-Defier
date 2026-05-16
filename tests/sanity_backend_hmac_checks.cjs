const assert = require('assert');
const path = require('path');

const hmacPath = path.resolve(__dirname, '../server/utils/hmac.js');
delete require.cache[hmacPath];

const originalSecret = process.env.DEFIER_HMAC_SECRET;
delete process.env.DEFIER_HMAC_SECRET;

let hmac = require(hmacPath);
assert.strictEqual(hmac.isSignatureConfigured(), false, 'HMAC should be disabled when DEFIER_HMAC_SECRET is missing');
assert.strictEqual(hmac.verifySignature('payload', 'salt', '00'), false, 'missing secret must not verify signatures');
assert.throws(() => hmac.generateSignature('payload', 'salt'), /DEFIER_HMAC_SECRET/, 'missing secret should not use a fallback key');

process.env.DEFIER_HMAC_SECRET = 'test-only-hmac-secret';
delete require.cache[hmacPath];
hmac = require(hmacPath);
const signature = hmac.generateSignature('payload', 'salt');
assert.strictEqual(hmac.isSignatureConfigured(), true, 'HMAC should be enabled when DEFIER_HMAC_SECRET is set');
assert.strictEqual(hmac.verifySignature('payload', 'salt', signature), true, 'valid signature should verify with configured secret');
assert.strictEqual(hmac.verifySignature('tampered', 'salt', signature), false, 'tampered payload should fail verification');

if (originalSecret === undefined) {
  delete process.env.DEFIER_HMAC_SECRET;
} else {
  process.env.DEFIER_HMAC_SECRET = originalSecret;
}

console.log('Backend HMAC sanity checks passed.');
