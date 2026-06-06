const assert = require('assert');
const {
  getMaxAcceptedClientTimestamp,
  normalizeClientTimestamp
} = require('../server/utils/timestamps');

const reference = 1780470000000;
const fallback = reference + 123;

assert.strictEqual(normalizeClientTimestamp(undefined, fallback, reference), fallback, 'missing timestamp should use fallback');
assert.strictEqual(normalizeClientTimestamp(null, fallback, reference), fallback, 'null timestamp should use fallback');
assert.strictEqual(normalizeClientTimestamp('Infinity', fallback, reference), fallback, 'infinite timestamp should use fallback');
assert.strictEqual(normalizeClientTimestamp(Number.POSITIVE_INFINITY, fallback, reference), fallback, 'positive infinity should use fallback');
assert.strictEqual(normalizeClientTimestamp(-1, fallback, reference), fallback, 'negative timestamp should use fallback');
assert.strictEqual(normalizeClientTimestamp('not-a-time', fallback, reference), fallback, 'non-numeric timestamp should use fallback');
assert.strictEqual(normalizeClientTimestamp(reference - 1.9, fallback, reference), reference - 2, 'valid past/current timestamps should be floored');
assert.strictEqual(
  normalizeClientTimestamp(reference + 1, fallback, reference),
  fallback,
  'future timestamps should use fallback'
);
assert.strictEqual(
  normalizeClientTimestamp(getMaxAcceptedClientTimestamp(reference), fallback, reference),
  getMaxAcceptedClientTimestamp(reference),
  'the current reference timestamp should remain valid'
);

console.log('Backend timestamp sanity checks passed.');
