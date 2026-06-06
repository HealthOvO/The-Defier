const MAX_CLIENT_TIMESTAMP_FUTURE_MS = 0;

function getMaxAcceptedClientTimestamp(referenceTime = Date.now()) {
    return referenceTime + MAX_CLIENT_TIMESTAMP_FUTURE_MS;
}

function normalizeClientTimestamp(value, fallback = Date.now(), referenceTime = Date.now()) {
    const fallbackTime = Number.isFinite(Number(fallback)) && Number(fallback) >= 0
        ? Math.floor(Number(fallback))
        : referenceTime;
    if (value === undefined || value === null || value === '') {
        return fallbackTime;
    }
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp < 0) {
        return fallbackTime;
    }
    const normalized = Math.floor(timestamp);
    if (normalized > getMaxAcceptedClientTimestamp(referenceTime)) {
        return fallbackTime;
    }
    return normalized;
}

module.exports = {
    MAX_CLIENT_TIMESTAMP_FUTURE_MS,
    getMaxAcceptedClientTimestamp,
    normalizeClientTimestamp
};
