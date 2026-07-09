# PVP Live Ops Platform S96 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the next live PVP backend operations slice: dispute timelines, player risk ledger, fairness trend buckets, and conservative retention cleanup without deploying online.

**Architecture:** Keep the runtime match engine unchanged. Extend the existing live ops routes in `server/routes/pvp-live.js` with read-only audit builders plus one bounded retention sweep that only deletes ephemeral sync signals and expired/revoked replay-share rows; formal matches, settlements, dispute reports, and ops audit events remain durable.

**Tech Stack:** Node.js, Express routes, SQLite via existing `dbGet`/`dbAll`/`dbRun`, existing live PVP route sanity tests.

---

### Task 1: Ops Dispute Timeline

**Files:**
- Modify: `server/routes/pvp-live.js`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`

- [ ] **Step 1: Write the failing route test**

Add this assertion block inside the existing live ops token section after `opsMatchTrace` is verified:

```js
const opsDisputeTimeline = await request(baseUrl, `/api/pvp/live/ops/dispute-reports/${disputeReport.payload.report.reportId}/timeline`, {
    headers: { 'x-defier-live-ops-token': liveOpsToken }
});
assert.equal(opsDisputeTimeline.status, 200, 'live ops dispute timeline should require and accept the live ops token');
assert.equal(opsDisputeTimeline.payload.reportVersion, 'pvp-live-ops-dispute-timeline-v1', 'live ops dispute timeline should expose a stable contract');
assert.equal(opsDisputeTimeline.payload.report?.reportId, disputeReport.payload.report.reportId, 'live ops dispute timeline should include the target report');
assert.ok(opsDisputeTimeline.payload.timeline.some(item => item.type === 'dispute_reported'), 'live ops dispute timeline should include dispute creation');
assert.ok(opsDisputeTimeline.payload.timeline.some(item => item.type === 'state_signal'), 'live ops dispute timeline should include sync signals');
assert.ok(opsDisputeTimeline.payload.timeline.some(item => item.type === 'ops_event'), 'live ops dispute timeline should include related ops events');
assert.doesNotMatch(JSON.stringify(opsDisputeTimeline.payload), forbiddenOpsAuditPattern, 'live ops dispute timeline must not leak hidden cards, seeds, payloads, or raw state/event JSON');
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node tests/sanity_pvp_live_route_checks.cjs
```

Expected: FAIL with HTTP `404` or missing `pvp-live-ops-dispute-timeline-v1`.

- [ ] **Step 3: Implement minimal route**

Add helpers in `server/routes/pvp-live.js` near existing live ops builders:

```js
function makeLiveOpsTimelineItem({ type, createdAt, title, source, data = {} }) {
    return {
        type: String(type || 'ops_event'),
        createdAt: Math.max(0, Math.floor(Number(createdAt) || 0)),
        title: String(title || '').slice(0, 80),
        source: String(source || '').slice(0, 48),
        data: sanitizeLiveOpsAuditValue(data) || {}
    };
}
```

Add `GET /ops/dispute-reports/:reportId/timeline`:

```js
router.get('/ops/dispute-reports/:reportId/timeline', asyncHandler(async (req, res) => {
    if (!verifyLiveOpsToken(req, res)) return;
    const reportId = String(req.params.reportId || '').trim();
    const reportRow = reportId ? await dbGet(`SELECT * FROM pvp_live_dispute_reports WHERE report_id = ? LIMIT 1`, [reportId]) : null;
    if (!reportRow) return res.status(404).json({ success: false, reason: 'dispute_report_not_found', message: '争议反馈不存在' });
    const matchId = String(reportRow.match_id || '');
    const [signalRows, opsRows, shareRows, settlementRow] = await Promise.all([
        dbAll(`SELECT signal_id, signal_type, state_version, reason, source_instance_id, created_at FROM pvp_live_state_signals WHERE match_id = ? ORDER BY signal_id ASC LIMIT 80`, [matchId]),
        dbAll(`SELECT event_id, event_type, subject_user_id, match_id, severity, reason, source, evidence_json, created_at FROM pvp_live_ops_events WHERE match_id = ? ORDER BY created_at ASC, event_id ASC LIMIT 80`, [matchId]),
        dbAll(`SELECT share_token, creator_user_id, creator_seat, visibility_layer, source_visibility, match_ref, replay_hash, status, created_at, expires_at, revoked_at FROM pvp_live_replay_shares WHERE match_id = ? ORDER BY created_at ASC LIMIT 20`, [matchId]),
        dbGet(`SELECT * FROM pvp_live_match_settlements WHERE match_id = ? LIMIT 1`, [matchId])
    ]);
    const timeline = [
        makeLiveOpsTimelineItem({ type: 'dispute_reported', createdAt: reportRow.created_at, title: 'dispute reported', source: 'dispute_report', data: makeDisputeStatusReceipt(reportRow, { includeEvidence: true }) }),
        ...signalRows.map(row => makeLiveOpsTimelineItem({ type: 'state_signal', createdAt: row.created_at, title: row.reason, source: 'state_signal', data: sanitizeLiveOpsSignal(row) })),
        ...opsRows.map(row => makeLiveOpsTimelineItem({ type: 'ops_event', createdAt: row.created_at, title: row.event_type, source: row.source, data: sanitizeLiveOpsEvent(row) })),
        ...shareRows.map(row => makeLiveOpsTimelineItem({ type: 'replay_share', createdAt: row.created_at, title: row.status, source: 'replay_share', data: sanitizeLiveOpsReplayShare(row) })),
        settlementRow ? makeLiveOpsTimelineItem({ type: 'settlement', createdAt: settlementRow.created_at, title: settlementRow.finish_reason, source: 'settlement', data: { winnerSeat: settlementRow.winner_seat, loserSeat: settlementRow.loser_seat, finishReason: settlementRow.finish_reason } }) : null
    ].filter(Boolean).sort((left, right) => left.createdAt - right.createdAt);
    res.json({ success: true, reportVersion: 'pvp-live-ops-dispute-timeline-v1', report: makeDisputeStatusReceipt(reportRow, { includeEvidence: true }), matchId, timeline, boundary: '运营时间线只串联公开事件、脱敏证据、同步信号和处理状态，不暴露隐藏手牌、牌库、随机种子或完整斗法谱。' });
}));
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node tests/sanity_pvp_live_route_checks.cjs
```

Expected: PASS.

### Task 2: Ops Player Risk Ledger

**Files:**
- Modify: `server/routes/pvp-live.js`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`

- [ ] **Step 1: Write the failing route test**

Add this block after the dispute timeline assertions:

```js
const opsPlayerRiskLedger = await request(baseUrl, '/api/pvp/live/ops/players/live-user-a/risk-ledger?windowMs=86400000', {
    headers: { 'x-defier-live-ops-token': liveOpsToken }
});
assert.equal(opsPlayerRiskLedger.status, 200, 'live ops player risk ledger should require and accept the live ops token');
assert.equal(opsPlayerRiskLedger.payload.reportVersion, 'pvp-live-ops-player-risk-ledger-v1', 'live ops player risk ledger should expose a stable contract');
assert.equal(opsPlayerRiskLedger.payload.userId, 'live-user-a', 'live ops player risk ledger should return the requested user');
assert.ok(opsPlayerRiskLedger.payload.disputes?.totalReports >= 1, 'live ops player risk ledger should count reporter disputes');
assert.ok(opsPlayerRiskLedger.payload.avoidance?.asAvoider >= 0, 'live ops player risk ledger should count avoider rows');
assert.ok(Array.isArray(opsPlayerRiskLedger.payload.riskFlags), 'live ops player risk ledger should expose bounded risk flags');
assert.equal(opsPlayerRiskLedger.payload.usesHiddenInformation, false, 'live ops player risk ledger should not use hidden information');
assert.doesNotMatch(JSON.stringify(opsPlayerRiskLedger.payload), forbiddenOpsAuditPattern, 'live ops player risk ledger must not leak hidden cards, seeds, payloads, or raw state/event JSON');
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node tests/sanity_pvp_live_route_checks.cjs
```

Expected: FAIL with HTTP `404` or missing `pvp-live-ops-player-risk-ledger-v1`.

- [ ] **Step 3: Implement minimal route**

Add helpers for count aggregation:

```js
function makeLiveOpsPlayerRiskLedger({ userId, disputeRows, opsRows, avoiderRows, avoidedRows, windowMs, now }) {
    const disputesByStatus = {};
    const disputesByReason = {};
    disputeRows.forEach(row => {
        incrementCount(disputesByStatus, sanitizeDisputeStatus(row.status) || 'reported');
        incrementCount(disputesByReason, sanitizeDisputeReason(row.reason));
    });
    const opsByType = {};
    const opsBySeverity = {};
    opsRows.forEach(row => {
        incrementCount(opsByType, row.event_type);
        incrementCount(opsBySeverity, row.severity);
    });
    const riskFlags = [];
    if (disputeRows.length >= 3) riskFlags.push('repeated_disputes');
    if (avoiderRows.length >= 3) riskFlags.push('frequent_avoidance');
    if ((opsBySeverity.review || 0) >= 2) riskFlags.push('review_attention');
    return {
        success: true,
        reportVersion: 'pvp-live-ops-player-risk-ledger-v1',
        sourceVisibility: 'ops_aggregate_public_safety_metrics',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        rewardImpact: 'none',
        userId,
        generatedAt: now,
        windowMs,
        disputes: { totalReports: disputeRows.length, byStatus: disputesByStatus, byReason: disputesByReason },
        opsEvents: { totalEvents: opsRows.length, byType: opsByType, bySeverity: opsBySeverity },
        avoidance: { asAvoider: avoiderRows.length, asAvoided: avoidedRows.length, activeAsAvoider: avoiderRows.filter(row => Number(row.avoid_until) > now).length },
        riskFlags,
        boundary: '玩家风险账本只汇总争议、运营事件和回避偏好数量，不输出隐藏牌面、随机种子、精确评分或完整斗法谱。'
    };
}
```

Add `GET /ops/players/:userId/risk-ledger` with `verifyLiveOpsToken`, bounded `windowMs`, and queries over `pvp_live_dispute_reports`, `pvp_live_ops_events`, and `pvp_live_avoid_opponents`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node tests/sanity_pvp_live_route_checks.cjs
```

Expected: PASS.

### Task 3: Fairness Trend Buckets

**Files:**
- Modify: `server/routes/pvp-live.js`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`

- [ ] **Step 1: Write the failing route test**

Extend the existing `opsFairnessMetrics` assertions:

```js
assert.ok(Array.isArray(opsFairnessMetrics.payload.trendBuckets), 'live ops fairness metrics should include trend buckets');
assert.ok(opsFairnessMetrics.payload.trendBuckets.some(bucket => bucket.matchCount >= 1), 'live ops fairness trend should count match buckets');
assert.ok(Array.isArray(opsFairnessMetrics.payload.anomalyBuckets), 'live ops fairness metrics should include bounded anomaly buckets');
assert.doesNotMatch(JSON.stringify(opsFairnessMetrics.payload.trendBuckets), /exactRating|elo|hand|deck|randomSeed/i, 'live ops fairness trend buckets must stay aggregate-only');
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node tests/sanity_pvp_live_route_checks.cjs
```

Expected: FAIL because `trendBuckets` is absent.

- [ ] **Step 3: Implement bucket helpers**

Add `getLiveOpsBucketMs`, `makeLiveOpsTrendBuckets`, and include `trendBuckets` / `anomalyBuckets` in `makeLiveOpsFairnessMetrics`. Use only `created_at`, `updated_at`, `finished_at`, status, public matchQuality buckets, dispute status, ops severity counts, and avoid counts.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node tests/sanity_pvp_live_route_checks.cjs
```

Expected: PASS.

### Task 4: Conservative Retention Sweep

**Files:**
- Modify: `server/routes/pvp-live.js`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`

- [ ] **Step 1: Write the failing route test**

Inside the live ops token block, seed one old signal, one recent signal, one old expired replay share, and one dispute report. Then assert dry-run and apply behavior:

```js
const oldRetentionTimestamp = Date.now() - 45 * 24 * 60 * 60 * 1000;
const recentRetentionTimestamp = Date.now();
await dbRun(`INSERT INTO pvp_live_state_signals (match_id, signal_type, state_version, reason, source_instance_id, created_at) VALUES (?, 'state_sync', 1, 'retention_probe_old', '', ?)`, [joinRound14ScoreB.payload.matchId, oldRetentionTimestamp]);
await dbRun(`INSERT INTO pvp_live_state_signals (match_id, signal_type, state_version, reason, source_instance_id, created_at) VALUES (?, 'state_sync', 2, 'retention_probe_recent', '', ?)`, [joinRound14ScoreB.payload.matchId, recentRetentionTimestamp]);
await dbRun(`INSERT OR REPLACE INTO pvp_live_replay_shares (share_token, match_id, creator_user_id, creator_seat, visibility_layer, source_visibility, match_ref, replay_hash, status, created_at, expires_at, revoked_at, updated_at) VALUES (?, ?, ?, 'A', 'replay_public', 'replay_public', 'retention-ref', 'retention-hash', 'active', ?, ?, 0, ?)`, ['retention-expired-share', joinRound14ScoreB.payload.matchId, 'live-user-a', oldRetentionTimestamp, oldRetentionTimestamp, oldRetentionTimestamp]);
const opsRetentionPreview = await request(baseUrl, '/api/pvp/live/ops/retention/sweep?olderThanMs=2592000000', { method: 'POST', headers: { 'x-defier-live-ops-token': liveOpsToken }, body: { dryRun: true } });
assert.equal(opsRetentionPreview.status, 200, 'live ops retention preview should accept ops token');
assert.equal(opsRetentionPreview.payload.reportVersion, 'pvp-live-ops-retention-sweep-v1', 'live ops retention sweep should expose a stable contract');
assert.equal(opsRetentionPreview.payload.dryRun, true, 'live ops retention preview should not apply deletes');
assert.ok(opsRetentionPreview.payload.preview?.stateSignals >= 1, 'live ops retention preview should count old state signals');
const opsRetentionApply = await request(baseUrl, '/api/pvp/live/ops/retention/sweep?olderThanMs=2592000000', { method: 'POST', headers: { 'x-defier-live-ops-token': liveOpsToken }, body: { dryRun: false } });
assert.equal(opsRetentionApply.status, 200, 'live ops retention apply should accept ops token');
assert.ok(opsRetentionApply.payload.deleted?.stateSignals >= 1, 'live ops retention apply should delete old state signals');
assert.ok(opsRetentionApply.payload.deleted?.expiredReplayShares >= 1, 'live ops retention apply should delete expired replay shares');
const recentSignalStillThere = await dbGet(`SELECT signal_id FROM pvp_live_state_signals WHERE reason = 'retention_probe_recent' LIMIT 1`);
assert.ok(recentSignalStillThere, 'live ops retention sweep should preserve recent state signals');
const disputeStillThere = await dbGet(`SELECT report_id FROM pvp_live_dispute_reports WHERE report_id = ? LIMIT 1`, [disputeReport.payload.report.reportId]);
assert.ok(disputeStillThere, 'live ops retention sweep should preserve dispute reports');
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node tests/sanity_pvp_live_route_checks.cjs
```

Expected: FAIL with HTTP `404` or missing retention contract.

- [ ] **Step 3: Implement bounded sweep**

Add `getLiveOpsRetentionWindowMs()` with default `30 days`, minimum `1 day`, maximum `365 days`. Add `POST /ops/retention/sweep`:

```js
router.post('/ops/retention/sweep', asyncHandler(async (req, res) => {
    if (!verifyLiveOpsToken(req, res)) return;
    const olderThanMs = getLiveOpsRetentionWindowMs(req.query && req.query.olderThanMs || req.body && req.body.olderThanMs);
    const now = Date.now();
    const cutoff = Math.max(0, now - olderThanMs);
    const dryRun = req.body && req.body.dryRun !== false;
    const preview = {
        stateSignals: Number((await dbGet(`SELECT COUNT(*) AS count FROM pvp_live_state_signals WHERE created_at < ?`, [cutoff]))?.count || 0),
        expiredReplayShares: Number((await dbGet(`SELECT COUNT(*) AS count FROM pvp_live_replay_shares WHERE (expires_at > 0 AND expires_at < ?) OR (revoked_at > 0 AND revoked_at < ?)`, [cutoff, cutoff]))?.count || 0)
    };
    const deleted = { stateSignals: 0, expiredReplayShares: 0 };
    if (!dryRun) {
        deleted.stateSignals = (await dbRun(`DELETE FROM pvp_live_state_signals WHERE created_at < ?`, [cutoff])).changes || 0;
        deleted.expiredReplayShares = (await dbRun(`DELETE FROM pvp_live_replay_shares WHERE (expires_at > 0 AND expires_at < ?) OR (revoked_at > 0 AND revoked_at < ?)`, [cutoff, cutoff])).changes || 0;
    }
    res.json({ success: true, reportVersion: 'pvp-live-ops-retention-sweep-v1', dryRun, generatedAt: now, olderThanMs, cutoff, preview, deleted, preserved: ['pvp_live_matches', 'pvp_live_match_events', 'pvp_live_dispute_reports', 'pvp_live_ops_events', 'pvp_live_match_settlements'], boundary: '生命周期清理只删除过期同步信号和过期/撤销战报分享，不删除正式对局、争议、结算或运营审计事件。' });
}));
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node tests/sanity_pvp_live_route_checks.cjs
```

Expected: PASS.

### Final Verification

- [ ] Run syntax checks:

```bash
node --check server/routes/pvp-live.js && node --check tests/sanity_pvp_live_route_checks.cjs
```

- [ ] Run focused route checks:

```bash
node tests/sanity_pvp_live_route_checks.cjs
```

- [ ] Run release gate coverage:

```bash
node tests/sanity_release_gate_coverage_checks.cjs
```

- [ ] Run full node gate:

```bash
PVP_LIVE_WS_FANOUT_MESSAGE_TIMEOUT_MS=60000 npm run test:node
```

- [ ] Dispatch a challenger reviewer before merge. The reviewer must check read/write boundaries, redaction, retention deletion scope, and route tests.

