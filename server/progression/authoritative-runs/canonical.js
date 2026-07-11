const crypto = require('node:crypto');

function stableStringify(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) {
        return `[${value.map(item => stableStringify(item)).join(',')}]`;
    }
    if (typeof value === 'object') {
        const entries = Object.keys(value)
            .sort()
            .filter(key => value[key] !== undefined)
            .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
        return `{${entries.join(',')}}`;
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
        throw new TypeError('canonical JSON cannot contain non-finite numbers');
    }
    if (!['string', 'number', 'boolean'].includes(typeof value)) {
        throw new TypeError(`canonical JSON does not support ${typeof value}`);
    }
    return JSON.stringify(value);
}

function cloneJson(value) {
    return JSON.parse(stableStringify(value));
}

function sha256(value) {
    return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function hashCanonical(value) {
    return sha256(stableStringify(value));
}

function deterministicId(prefix, parts, length = 32) {
    return `${prefix}-${sha256(parts.map(part => String(part ?? '')).join('|')).slice(0, length)}`;
}

function makeGenesisHash({ protocolVersion, runId, userId, contentHash, stateHash }) {
    return hashCanonical({
        contentHash,
        protocolVersion,
        runId,
        stateHash,
        type: 'authoritative_run_genesis',
        userId
    });
}

function makeActionHash({
    protocolVersion,
    runId,
    sequence,
    expectedVersion,
    command,
    payloadHash,
    previousHash,
    resultStateHash
}) {
    return hashCanonical({
        command,
        expectedVersion,
        payloadHash,
        previousHash,
        protocolVersion,
        resultStateHash,
        runId,
        sequence,
        type: 'authoritative_run_action'
    });
}

module.exports = {
    cloneJson,
    deterministicId,
    hashCanonical,
    makeActionHash,
    makeGenesisHash,
    sha256,
    stableStringify
};
