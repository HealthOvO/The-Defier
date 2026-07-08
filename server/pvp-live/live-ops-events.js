const crypto = require('crypto');

function makePvpLiveOpsEventId() {
    if (typeof crypto.randomUUID === 'function') return `pvploe-${crypto.randomUUID()}`;
    return `pvploe-${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}`;
}

function normalizePvpLiveOpsEventId(value) {
    const normalized = String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9:_-]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 160);
    return normalized.length >= 8 ? normalized : '';
}

function normalizeOpsToken(value, fallback) {
    const normalized = String(value || fallback || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 64);
    return normalized || String(fallback || 'event');
}

function recordPvpLiveOpsEvent(db, event = {}) {
    const eventId = normalizePvpLiveOpsEventId(event.eventId) || makePvpLiveOpsEventId();
    const eventType = normalizeOpsToken(event.eventType, 'ops_event');
    const subjectUserId = String(event.subjectUserId || '').trim().slice(0, 96);
    const matchId = String(event.matchId || '').trim().slice(0, 96);
    const severity = ['info', 'review', 'warning', 'critical'].includes(event.severity)
        ? event.severity
        : 'info';
    const reason = normalizeOpsToken(event.reason, eventType);
    const source = normalizeOpsToken(event.source, 'pvp_live');
    const evidence = event.evidence && typeof event.evidence === 'object' && !Array.isArray(event.evidence)
        ? event.evidence
        : {};
    const createdAt = Math.max(0, Math.floor(Number(event.createdAt) || Date.now()));
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT OR IGNORE INTO pvp_live_ops_events
                (event_id, event_type, subject_user_id, match_id, severity, reason, source, evidence_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                eventId,
                eventType,
                subjectUserId,
                matchId,
                severity,
                reason,
                source,
                JSON.stringify(evidence),
                createdAt
            ],
            function(err) {
                if (err) reject(err);
                else resolve({
                    eventId,
                    eventType,
                    subjectUserId,
                    matchId,
                    severity,
                    reason,
                    source,
                    createdAt,
                    inserted: this.changes > 0
                });
            }
        );
    });
}

module.exports = {
    recordPvpLiveOpsEvent
};
