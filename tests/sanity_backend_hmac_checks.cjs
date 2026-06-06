const assert = require('assert');
const crypto = require('crypto');
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
assert.strictEqual(hmac.verifyRequestIntegrity('payload', undefined, undefined).ok, true, 'missing signature should be accepted when integrity is optional');
assert.strictEqual(
  hmac.verifyRequestIntegrity('payload', 'salt-1234', 'a'.repeat(64)).status,
  403,
  'optional mode should reject explicit HMAC signatures when no HMAC secret is configured'
);

process.env.DEFIER_HMAC_SECRET = 'test-only-hmac-secret-32-characters';
delete require.cache[hmacPath];
hmac = require(hmacPath);
const signature = hmac.generateSignature('payload', 'salt-1234');
assert.strictEqual(hmac.isSignatureConfigured(), true, 'HMAC should be enabled when DEFIER_HMAC_SECRET is set');
assert.strictEqual(hmac.verifySignature('payload', 'salt-1234', signature), true, 'valid signature should verify with configured secret');
assert.strictEqual(hmac.verifySignature('tampered', 'salt-1234', signature), false, 'tampered payload should fail verification');
assert.strictEqual(hmac.verifySignature('payload', 'bad', signature), false, 'weak salt should fail verification');
assert.strictEqual(hmac.verifySignature('payload', 'salt-1234', 'not-hex'), false, 'non-hex signatures should fail verification');
const sessionToken = 'session-token-for-browser-integrity';
const sessionSignature = hmac.generateSessionSignature('payload', 'session-salt-1', sessionToken);
assert.strictEqual(hmac.verifySessionSignature('payload', 'session-salt-1', sessionSignature, sessionToken), true, 'valid session signature should verify');
assert.strictEqual(hmac.verifySessionSignature('tampered', 'session-salt-1', sessionSignature, sessionToken), false, 'tampered session payload should fail verification');
assert.deepStrictEqual(hmac.validateSignatureInput('salt-1234', signature), { valid: true }, 'valid signature input should pass format checks');
assert.strictEqual(hmac.validateSignatureInput('bad', signature).reason, 'invalid-salt', 'short salt should be rejected');
assert.strictEqual(hmac.validateSignatureInput('salt-1234', 'not-hex').reason, 'invalid-signature-format', 'non-hex signature should be rejected');
assert.strictEqual(hmac.verifyRequestIntegrity('payload', undefined, undefined).ok, true, 'missing signature should be accepted when integrity is optional');
assert.strictEqual(
  hmac.verifyRequestIntegrity('payload', 'session-salt-1', sessionSignature, {
    sessionToken,
    signatureMode: 'session'
  }).ok,
  true,
  'optional mode should accept valid browser session signatures'
);

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
assert.strictEqual(
  hmac.verifyRequestIntegrity('payload', 'session-salt-1', sessionSignature, {
    sessionToken,
    signatureMode: 'session'
  }).ok,
  true,
  'forced integrity should accept valid browser session signatures'
);

const browserStyleSignature = crypto.createHmac('sha256', sessionToken)
  .update('session-v1', 'utf8')
  .update('\n', 'utf8')
  .update('session-salt-1', 'utf8')
  .update('\n', 'utf8')
  .update('payload', 'utf8')
  .digest('hex');
assert.strictEqual(browserStyleSignature, sessionSignature, 'session signature algorithm should match browser client message format');

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
