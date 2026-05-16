const assert = require('assert');
const path = require('path');

const hmacPath = path.resolve(__dirname, '../server/utils/hmac.js');
delete require.cache[hmacPath];

const originalSecret = process.env.DEFIER_HMAC_SECRET;
const originalIntegrityRequired = process.env.DEFIER_INTEGRITY_REQUIRED;
delete process.env.DEFIER_HMAC_SECRET;
delete process.env.DEFIER_INTEGRITY_REQUIRED;

let hmac = require(hmacPath);
assert.strictEqual(hmac.isSignatureConfigured(), false, 'HMAC should be disabled when DEFIER_HMAC_SECRET is missing');
assert.strictEqual(hmac.verifySignature('payload', 'salt', '00'), false, 'missing secret must not verify signatures');
assert.throws(() => hmac.generateSignature('payload', 'salt'), /DEFIER_HMAC_SECRET/, 'missing secret should not use a fallback key');

process.env.DEFIER_HMAC_SECRET = 'test-only-hmac-secret-32-characters';
delete require.cache[hmacPath];
hmac = require(hmacPath);
const signature = hmac.generateSignature('payload', 'salt-1234');
assert.strictEqual(hmac.isSignatureConfigured(), true, 'HMAC should be enabled when DEFIER_HMAC_SECRET is set');
assert.strictEqual(hmac.verifySignature('payload', 'salt-1234', signature), true, 'valid signature should verify with configured secret');
assert.strictEqual(hmac.verifySignature('tampered', 'salt-1234', signature), false, 'tampered payload should fail verification');
assert.strictEqual(hmac.verifySignature('payload', 'bad', signature), false, 'weak salt should fail verification');
assert.strictEqual(hmac.verifySignature('payload', 'salt-1234', 'not-hex'), false, 'non-hex signatures should fail verification');
assert.deepStrictEqual(hmac.validateSignatureInput('salt-1234', signature), { valid: true }, 'valid signature input should pass format checks');
assert.strictEqual(hmac.validateSignatureInput('bad', signature).reason, 'invalid-salt', 'short salt should be rejected');
assert.strictEqual(hmac.validateSignatureInput('salt-1234', 'not-hex').reason, 'invalid-signature-format', 'non-hex signature should be rejected');
assert.strictEqual(hmac.verifyRequestIntegrity('payload', undefined, undefined).ok, true, 'missing signature should be accepted when integrity is optional');

process.env.DEFIER_INTEGRITY_REQUIRED = '1';
assert.throws(() => {
  process.env.DEFIER_HMAC_SECRET = 'short-secret';
  delete require.cache[hmacPath];
  require(hmacPath).validateIntegrityConfig();
}, /DEFIER_INTEGRITY_REQUIRED/, 'forced integrity should require a strong HMAC secret');
process.env.DEFIER_HMAC_SECRET = 'test-only-hmac-secret-32-characters';
delete require.cache[hmacPath];
hmac = require(hmacPath);
assert.strictEqual(hmac.verifyRequestIntegrity('payload', undefined, undefined).status, 400, 'forced integrity should reject missing signature');

if (originalSecret === undefined) {
  delete process.env.DEFIER_HMAC_SECRET;
} else {
  process.env.DEFIER_HMAC_SECRET = originalSecret;
}
if (originalIntegrityRequired === undefined) {
  delete process.env.DEFIER_INTEGRITY_REQUIRED;
} else {
  process.env.DEFIER_INTEGRITY_REQUIRED = originalIntegrityRequired;
}

console.log('Backend HMAC sanity checks passed.');
