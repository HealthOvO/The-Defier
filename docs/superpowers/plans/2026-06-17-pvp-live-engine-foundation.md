# PVP Live Engine Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first testable V10 live PVP server-authoritative battle foundation.

**Architecture:** Add a small CommonJS engine under `server/pvp-live/engine/` with deterministic state creation, seat-scoped views, and intent reduction. Add a minimal authenticated HTTP live route under `/api/pvp/live/*`. Keep it isolated from existing ghost PVP routes so official live ranked cannot accidentally reuse client-reported settlement.

**Tech Stack:** Node CommonJS for server modules, plain Node sanity tests, existing `tests/run_node_checks.sh` gate.

---

### Task 1: Live Engine Red-Green Foundation

**Files:**
- Create: `tests/sanity_pvp_live_engine_checks.cjs`
- Create: `server/pvp-live/engine/rules.js`
- Create: `server/pvp-live/engine/state.js`
- Create: `server/pvp-live/engine/state-view.js`
- Create: `server/pvp-live/engine/reducer.js`
- Modify: `tests/run_node_checks.sh`

- [x] **Step 1: Write the failing test**

Create `tests/sanity_pvp_live_engine_checks.cjs` with assertions for:

```js
const {
  RULE_VERSION,
  createInitialLiveState,
  projectStateView,
  reduceIntent
} = require('../server/pvp-live/engine/reducer');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const baseState = createInitialLiveState({
  matchId: 'pvpm-test',
  seats: [
    { seatId: 'A', userId: 'u-a', displayName: '甲' },
    { seatId: 'B', userId: 'u-b', displayName: '乙' }
  ]
});

assert(baseState.ruleVersion === RULE_VERSION, 'state should expose pvp-live-v1 rule version');
assert(baseState.status === 'active', 'foundation state should start active for engine tests');
assert(baseState.currentSeat === 'A', 'seat A should act first in deterministic engine tests');
assert(baseState.seats.A.hp === 50 && baseState.seats.B.hp === 50, 'both seats should start at 50 hp');

const viewA = projectStateView(baseState, 'A');
assert(Array.isArray(viewA.self.hand) && viewA.self.hand.length > 0, 'self view should include own hand');
assert(typeof viewA.opponent.handCount === 'number', 'opponent view should expose hand count');
assert(!Array.isArray(viewA.opponent.hand), 'opponent view must not expose hand cards');
assert(!Array.isArray(viewA.opponent.deck), 'opponent view must not expose deck order');

const burstIntent = {
  intentId: 'intent-burst-1',
  intentType: 'play_card',
  matchId: 'pvpm-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: baseState.stateVersion,
  payload: { cardInstanceId: 'A-burst-1', targetSeat: 'B' }
};

const burst = reduceIntent(baseState, burstIntent);
assert(burst.result === 'accepted', 'legal over-budget burst should be accepted');
assert(burst.state.seats.B.hp === 32, 'first action damage should clamp to 18 actual damage');
assert(burst.events.some(e => e.eventType === 'budget_clamped' && e.payload.preventedDamage === 12), 'budget clamp event should be public');
assert(burst.events.every(e => e.eventType !== 'damage_budget_exceeded'), 'budget clamp must not use reject event name');

const duplicate = reduceIntent(burst.state, burstIntent);
assert(duplicate.result === 'duplicate', 'same intent should return duplicate');
assert(duplicate.state.seats.B.hp === 32, 'duplicate intent must not deal damage twice');

const conflict = reduceIntent(duplicate.state, {
  ...burstIntent,
  payload: { cardInstanceId: 'A-strike-1', targetSeat: 'B' }
});
assert(conflict.result === 'rejected' && conflict.reason === 'duplicate_action_conflict', 'same intent id with different body should be rejected');

const stale = reduceIntent(conflict.state, {
  intentId: 'intent-stale',
  intentType: 'end_turn',
  matchId: 'pvpm-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: 0,
  payload: {}
});
assert(stale.result === 'sync_required' && stale.reason === 'stale_state', 'stale state version should require sync');

console.log('sanity_pvp_live_engine_checks passed');
```

- [x] **Step 2: Run test to verify it fails**

Run: `node tests/sanity_pvp_live_engine_checks.cjs`

Expected: FAIL with module-not-found for `server/pvp-live/engine/reducer`.

- [x] **Step 3: Write minimal implementation**

Create the engine modules with:

- `rules.js`: `RULE_VERSION`, immutable rules, starter card definitions.
- `state.js`: deterministic initial state with two seats, 50 HP, 3 energy, 20-card deck target, fixture hand cards.
- `state-view.js`: seat-scoped projection that hides opponent hand and deck order.
- `reducer.js`: exports `RULE_VERSION`, `createInitialLiveState`, `projectStateView`, `reduceIntent`; validates intent envelope, handles duplicate and conflict, supports `play_card` and `end_turn`, clamps first-action player-life damage with `budget_clamped`.

- [x] **Step 4: Run test to verify it passes**

Run: `node tests/sanity_pvp_live_engine_checks.cjs`

Expected: PASS and prints `sanity_pvp_live_engine_checks passed`.

- [x] **Step 5: Add node gate**

Modify `tests/run_node_checks.sh` to run `node tests/sanity_pvp_live_engine_checks.cjs` near existing PVP checks.

- [x] **Step 6: Run focused gate**

Run:

```bash
node --check server/pvp-live/engine/rules.js
node --check server/pvp-live/engine/state.js
node --check server/pvp-live/engine/state-view.js
node --check server/pvp-live/engine/reducer.js
node --check tests/sanity_pvp_live_engine_checks.cjs
node tests/sanity_pvp_live_engine_checks.cjs
```

Expected: all commands pass.

---

### Task 2: Minimal Live HTTP Route

**Files:**
- Create: `tests/sanity_pvp_live_route_checks.cjs`
- Create: `server/pvp-live/live-store.js`
- Create: `server/routes/pvp-live.js`
- Modify: `server/app.js`
- Modify: `tests/run_node_checks.sh`

- [x] **Step 1: Write the failing route test**

Covered:

- auth required for queue join.
- first player receives waiting ticket.
- second player matches the waiting player.
- first player polls ticket and receives the same match id.
- authenticated intent submission advances the server state.
- duplicate intent is idempotent.
- opponent state view exposes own hand but not opponent hand.

- [x] **Step 2: Run test to verify it fails**

Observed expected module-not-found for `server/routes/pvp-live`.

- [x] **Step 3: Add live store and route**

Implemented:

- in-memory queue and match store.
- deterministic seat assignment for first live slice.
- authenticated `/queue/join`, `/queue/status/:queueTicket`, `/matches/:matchId`, and `/matches/:matchId/intents`.
- user-bound seat resolution on the server side.
- `/api/pvp/live/*` route mounted before legacy `/api/pvp/*`.

- [x] **Step 4: Add node gate and verify**

Commands run:

```bash
node tests/sanity_pvp_service_checks.cjs
node tests/sanity_pvp_live_engine_checks.cjs
node tests/sanity_pvp_live_route_checks.cjs
node tests/sanity_pvp_shop_checks.cjs
npm run test:node
```

Expected and observed: all commands pass.

---

### Task 8W: Friendly Bo3 Series Closure MVP

**Files:**
- Modify: `server/pvp-live/live-store.js`
- Modify: `server/pvp-live/engine/state.js`
- Modify: `server/pvp-live/engine/state-view.js`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`
- Modify: `tests/sanity_pvp_live_settlement_checks.cjs`
- Modify: `tests/sanity_pvp_live_session_checks.mjs`
- Modify: `tests/sanity_pvp_live_ui_contract_checks.cjs`
- Modify: `tests/browser_pvp_live_audit.mjs`
- Modify: `progress.md`

- [x] **Step 1: Add failing Bo3 tests**

Covered:

- ranked source match starts the no-score Bo3 at 1-0;
- first friendly round can tie the series at 1-1 and keeps `friendly_rematch` available;
- Bo3 decider uses the same `seriesId`, reaches 2-1, then removes the continuation action;
- G2/G3 friendly games do not write formal score, wallet, match history, or live settlement gate.

- [x] **Step 2: Implement series scoring and continuation**

Implemented:

- `friendlySeries` now carries `targetWins`, `maxRounds`, `scoreBySourceSeat`, `sourceParticipants`, `seriesStatus`, `leaderSourceSeat`, `winnerSourceSeat`, `canRequestNextRound`, and `originMatchId`;
- series score is accumulated by source seat / source player, so G2/G3 seat swaps do not corrupt the score;
- `requestFriendlyRematch()` now permits a finished friendly source only while the Bo3 is unresolved, inherits the original `seriesId`, and rejects any continuation after a source seat reaches 2 wins;
- friendly finish completion updates the series before persistence / projection.

- [x] **Step 3: Project and render Bo3 state**

Implemented:

- state normalization and public projection preserve Bo3 fields without reward/rating/ELO data;
- post-match next actions are decided by `canRequestNextRound` rather than a blanket friendly-match suppression;
- the live UI friendly series strip shows Bo3 round label, source-player score, unresolved/complete status, and no-ranked-impact copy.

- [x] **Step 4: Verify**

Commands run:

```bash
node tests/sanity_pvp_live_settlement_checks.cjs
node tests/sanity_pvp_live_route_checks.cjs
node tests/sanity_pvp_live_session_checks.mjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
node tests/sanity_pvp_live_engine_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
npm run build:pages
node tests/browser_pvp_live_audit.mjs http://127.0.0.1:4174 output/browser-pvp-live-bo3-closeout-current
node tests/browser_pvp_live_real_backend_smoke.mjs http://127.0.0.1:4174 output/browser-pvp-live-bo3-real-current
npm run test:node
env AUDIT_FILTER=pvp-live,pvp-live-real bash tests/run_browser_release_checks.sh http://127.0.0.1:4174 output/release-browser-audits-pvp-live-bo3-closeout-current
```

Expected and observed: all commands pass; fake browser audit reports 36/36 findings with 0 console errors, including G2 1:1 -> same-series G3 setup and 2:1 series closeout without `friendly_rematch`; real backend smoke reports 29/29 findings with 0 console errors, and the filtered browser release gate reports 0 failed findings for `pvp-live` and `pvp-live-real`.

Remaining before claiming full V10-S3: friend room / invite-link UX, multi-instance queue strategy, formal MMR / season scoring, production smoke, and online deployment.

---

### Task 8X: Pending Rematch Restart Recovery

**Files:**
- Modify: `server/db/database.js`
- Modify: `server/pvp-live/live-persistence.js`
- Modify: `server/pvp-live/live-store.js`
- Modify: `tests/sanity_pvp_live_persistence_checks.cjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`
- Modify: `progress.md`

- [x] **Step 1: Add failing persistence test**

Covered:

- player A finishes a ranked source match, requests a friendly / Bo3 rematch, and enters `waiting_rematch`;
- backend restarts before player B confirms;
- player B confirms after restart and must create the friendly match instead of becoming a new first waiter;
- player A must recover the accepted friendly match through `/matches/current`;
- the pending rematch row must be deleted after match creation.

- [x] **Step 2: Persist pending rematch requests**

Implemented:

- SQLite table `pvp_live_rematch_requests` stores `source_match_id`, `series_id`, `players_json`, `created_at`, and `updated_at`;
- persistence exposes `saveRematchRequest`, `loadRematchRequest`, and `deleteRematchRequest`;
- stored player payload is limited to server-normalized `userId`, `displayName`, and `loadoutSnapshot`.

- [x] **Step 3: Recover and clear pending rematches**

Implemented:

- `requestFriendlyRematch()` hydrates a pending request from SQLite when memory is empty;
- waiting and blocked rematch states save the pending request;
- successful friendly match creation deletes the pending row and keeps the existing `seriesId`.

- [x] **Step 4: Verify**

Commands run:

```bash
node tests/sanity_pvp_live_persistence_checks.cjs
node tests/sanity_pvp_live_route_checks.cjs
node tests/sanity_pvp_live_settlement_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
npm run test:node
npm run build:pages
```

Expected and observed: all focused commands pass; full Node gate and production-page build also pass.

Remaining before claiming full V10-S3: friend room / invite-link UX, multi-instance queue strategy / distributed locking, formal MMR / season scoring, production smoke, and online deployment.

---

### Task 8Y: Friend Invite Room MVP

**Files:**
- Modify: `server/db/database.js`
- Modify: `server/pvp-live/live-persistence.js`
- Modify: `server/pvp-live/live-store.js`
- Modify: `server/routes/pvp-live.js`
- Modify: `js/services/backend-client.js`
- Modify: `js/services/pvp-service.js`
- Modify: `js/services/pvp-live-session.js`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `index.html`
- Modify: `css/pvp.css`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`
- Modify: `tests/sanity_pvp_live_persistence_checks.cjs`
- Modify: `tests/sanity_pvp_live_settlement_checks.cjs`
- Modify: `tests/sanity_pvp_live_client_checks.mjs`
- Modify: `tests/sanity_pvp_live_service_bridge_checks.cjs`
- Modify: `tests/sanity_pvp_live_session_checks.mjs`
- Modify: `tests/sanity_pvp_live_ui_contract_checks.cjs`
- Modify: `tests/browser_pvp_live_audit.mjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`
- Modify: `progress.md`

- [x] **Step 1: Add failing invite-room tests**

Covered:

- creating a private invite returns `waiting_invite`, a shareable `inviteCode`, `pvp-live-invite-v1`, `rankedImpact='none'`, and `invite_only_match`;
- creator cannot join their own invite;
- a public-queue player must not match the private invite host;
- pending private invite host must be blocked from entering the public queue with `pending_invite_exists`;
- invited opponent joins the code and receives a `mode='friendly'` live match with `expansionStage='friend_invite'`;
- host can recover the accepted invite through `/matches/current`;
- invite polling must recover a non-invite current match instead of staying stuck in `waiting_invite`;
- consumed invite code cannot be reused;
- host cancellation deletes the pending invite, non-host cancellation is rejected, and the host can enter public queue after cancellation;
- expired invite codes return stable `invite_expired`, including after backend restart, and clear the persisted pending invite row;
- host can recover a still-pending invite through the current invite endpoint after refresh;
- host-side polling exits `waiting_invite` when the pending invite naturally expires;
- pending private invite survives backend restart and preserves the host locked loadout;
- invite friendly match finish does not change rank score, wins/losses, wallet matches/coins, live settlement gate, or match history.

- [x] **Step 2: Implement server invite rooms**

Implemented:

- SQLite `pvp_live_invites` persists `invite_code`, `host_user_id`, `host_display_name`, `host_loadout_snapshot_json`, and `created_at`;
- persistence helpers save, load by code, load by host, delete by code, and delete by host;
- `createInvite()` removes the host from public queue, locks the host loadout, reuses any existing pending host invite, and returns the invite report;
- `joinQueue()` rejects users with a pending invite as `pending_invite_exists`, so private rooms cannot be mixed with public matching from another tab or stale entry point;
- `joinInvite()` rejects self-join, blocks active non-terminal conflicts, removes both players from public queue, deletes the invite, and creates a `friendly` live match with invite-only safeguards.
- invite rooms have a server-side TTL; expired invites are deleted from memory and SQLite before returning `invite_expired`.
- `cancelInvite()` only allows the host to cancel a waiting invite, deletes the pending row, and returns a cancelled invite report.
- `getCurrentInvite()` lets the host recover a pending invite by account and also performs TTL cleanup when the pending invite has expired.

- [x] **Step 3: Implement frontend service/session/UI bridge**

Implemented:

- `BackendClient.createLivePvpInvite()` and `BackendClient.joinLivePvpInvite()`;
- `BackendClient.cancelLivePvpInvite()` preserves server failure reasons such as `invite_expired`;
- `BackendClient.getCurrentLivePvpInvite()` reads `/api/pvp/live/invites/current` for refresh recovery;
- `PVPService.live.createInvite()`, `PVPService.live.joinInvite()`, `PVPService.live.cancelInvite()`, and `PVPService.live.getCurrentInvite()`;
- `pvp-live-session` exposes `createInvite`, `joinInvite`, `cancelInvite`, `resumeCurrentInvite`, and `pollInvite`, and carries `waiting_invite`, `inviteCode`, and `inviteReport`;
- `pollInvite()` only treats `friend_invite / invite_only_match` current matches as accepted invites; if another current live match exists, it recovers that match and clears the waiting invite state instead of freezing;
- `pollInvite()` checks current invite after no-current-match responses, so expired host invites leave waiting state instead of silently spinning forever;
- `PVPScene` renders the invite panel, disables conflicting actions while waiting or inside a match, lets the host cancel a waiting invite, polls accepted invite recovery, hides the invite panel once a live match is active, and keeps reconnect-grace text readable on mobile.

- [x] **Step 4: Verify**

Commands run:

```bash
node tests/sanity_pvp_live_route_checks.cjs
node tests/sanity_pvp_live_persistence_checks.cjs
node tests/sanity_pvp_live_settlement_checks.cjs
node tests/sanity_pvp_live_session_checks.mjs
node tests/sanity_pvp_live_client_checks.mjs
node tests/sanity_pvp_live_service_bridge_checks.cjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
npm run build:pages
node tests/browser_pvp_live_audit.mjs http://127.0.0.1:4174 output/browser-pvp-live-invite-room-current
env AUDIT_FILTER=pvp-live,pvp-live-real bash tests/run_browser_release_checks.sh http://127.0.0.1:4174 output/release-browser-audits-pvp-live-invite-room-current
```

Expected and observed: all focused commands pass; fake browser audit reports 41/41 findings with 0 console errors, including private invite creation, invite cancellation back to idle, refresh recovery of a pending invite, friendly setup join, no legacy PVP path, pending invite / public queue isolation, mobile reconnect-grace readability, and mobile viewport stability; filtered browser release gate passes for `pvp-live` and `pvp-live-real`.

Remaining before claiming full V10-S3: full friend list and invite notifications, multi-instance queue strategy / distributed locking, formal MMR / season scoring, production smoke, and online deployment.

---

### Task 8U: Authoritative Heartbeat And Reconnect Grace

**Files:**
- Modify: `server/pvp-live/live-store.js`
- Modify: `server/routes/pvp-live.js`
- Modify: `server/db/database.js`
- Modify: `server/pvp-live/live-persistence.js`
- Modify: `js/services/backend-client.js`
- Modify: `js/services/pvp-service.js`
- Modify: `js/services/pvp-live-session.js`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `index.html`
- Modify: `css/pvp.css`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`
- Modify: `tests/sanity_pvp_live_client_checks.mjs`
- Modify: `tests/sanity_pvp_live_service_bridge_checks.cjs`
- Modify: `tests/sanity_pvp_live_session_checks.mjs`
- Modify: `tests/sanity_pvp_live_persistence_checks.cjs`
- Modify: `tests/sanity_pvp_live_ui_contract_checks.cjs`
- Modify: `tests/browser_pvp_live_audit.mjs`
- Modify: `tests/browser_pvp_live_real_backend_smoke.mjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`

- [x] **Step 1: Add failing heartbeat and grace tests**

Covered:

- live match views must expose `pvp-live-connection-v1`;
- a participant heartbeat must update the viewer seat;
- a stale opponent enters `grace`, not immediate terminal loss;
- a fresh heartbeat recovers the participant to `online`;
- SQLite persistence must retain the connection timeline across backend restart;
- fake and real browser audits must show reconnect grace separately from action countdown.

- [x] **Step 2: Implement server heartbeat and connection projection**

Implemented:

- `LivePvpStore` keeps per-seat `lastHeartbeatAt` in `match.connection`;
- `projectMatchStateView()` attaches a seat-scoped `connectionReport`;
- `/api/pvp/live/matches/:matchId/heartbeat` writes only the authenticated participant seat;
- setup disconnection after stale + grace writes `connection_timeout` and invalidates the match without score or settlement;
- active disconnection after stale + grace only finishes when the disconnected seat owns the current action window, using `match_finished.finishReason='connection_timeout'`;
- non-current disconnected seats remain visible as disconnected but do not steal the current actor's turn or force an immediate win/loss.

- [x] **Step 3: Persist connection timeline**

Implemented:

- `pvp_live_matches.connection_json` stores heartbeat state;
- persistence restores `match.connection` before state projection;
- restart recovery keeps a recently heartbeated opponent online instead of resetting to an inferred baseline.

- [x] **Step 4: Implement browser client and UI**

Implemented:

- `BackendClient.heartbeatLivePvpMatch()`, `PVPService.live.heartbeat()`, and `pvp-live-session.heartbeat()` forward the protocol;
- `PVPScene` starts heartbeat only in matched / setup / active / sync_required phases and stops outside the live match;
- UI renders `data-live-connection-status` with online / grace / disconnected labels while keeping action countdown separate.
- `PVPScene` pauses automatic polling after the long-wait report appears, but a manual refresh opens a short continue-waiting window so the client can still auto-discover a new real-player match.
- post-match review and event formatting explain `connection_timeout` as reconnect grace ending rather than an ordinary slow action.

- [x] **Step 5: Verify**

Commands run:

```bash
node --check server/pvp-live/live-store.js
node --check server/routes/pvp-live.js
node --check server/pvp-live/live-persistence.js
node --check js/scenes/pvp-scene.js
node --check js/services/pvp-live-session.js
node --check tests/browser_pvp_live_audit.mjs
node --check tests/browser_pvp_live_real_backend_smoke.mjs
node tests/sanity_pvp_live_route_checks.cjs
node tests/sanity_pvp_live_client_checks.mjs
node tests/sanity_pvp_live_service_bridge_checks.cjs
node tests/sanity_pvp_live_session_checks.mjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
node tests/sanity_pvp_live_persistence_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
npm run build:pages
node tests/browser_pvp_live_audit.mjs http://127.0.0.1:4174 output/browser-pvp-live-connection-timeout-final
node tests/browser_pvp_live_real_backend_smoke.mjs http://127.0.0.1:4174 output/browser-pvp-live-real-connection-timeout-regression
```

Expected and observed: focused Node checks, build, fake browser, and real browser smoke pass. Full Node and filtered release gate verification still run after this task entry is synced.

---

### Task 8V: Low-Interference Social Emotes And Heartbeat Teardown

**Files:**
- Modify: `server/pvp-live/engine/rules.js`
- Modify: `server/pvp-live/engine/state.js`
- Modify: `server/pvp-live/engine/reducer.js`
- Modify: `server/pvp-live/engine/state-view.js`
- Modify: `server/pvp-live/live-store.js`
- Modify: `js/services/pvp-live-session.js`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `index.html`
- Modify: `css/pvp.css`
- Modify: `tests/sanity_pvp_live_engine_checks.cjs`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`
- Modify: `tests/sanity_pvp_live_ui_contract_checks.cjs`
- Modify: `tests/browser_pvp_live_audit.mjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`
- Modify: `progress.md`

- [x] **Step 1: Add failing social and teardown contracts**

Covered:

- preset `emote` intents must be accepted in setup / active as non-combat social events;
- accepted emotes must not advance combat rounds, refresh turn timers, deal damage, or settle matches; S9E later advances the public `stateVersion` so social events persist and sync correctly;
- repeated emotes from the same seat must be rate-limited;
- non-whitelisted emotes must be rejected, and no free-text chat path is introduced;
- if both active seats exceed reconnect grace, the match must invalidate without win/loss settlement;
- live UI must expose preset emote buttons, local mute, and release/browser audit markers;
- leaving the PVP page must stop both polling and heartbeat.

- [x] **Step 2: Implement non-combat emote events**

Implemented:

- `RULES.social` defines `respect / thinking / well_played` and an emote cooldown;
- `reduceIntent()` handles `intentType='emote'` before setup / active combat routing;
- accepted emotes append public `emote_sent` events and update only social metadata; S9E later advances the public `stateVersion` while still leaving combat rounds, timers, damage, and settlement untouched;
- `LivePvpStore.submitIntent()` does not refresh `match.updatedAt` for `reduced.nonCombat`, so action countdown ownership is not extended by emotes;
- `state-view` whitelists `emote_sent` public data.

- [x] **Step 3: Wire UI, local mute, and event refresh**

Implemented:

- live panel renders a compact social strip with three preset emotes and `toggle-social-mute`;
- `PVPScene.submitLiveEmote()` sends emote intents through the existing live service/session path;
- `PVPScene.filterLiveEventsForMute()` hides opponent emotes locally while preserving authoritative events and snapshots;
- `pvp-live-session.refreshMatch()` now copies `stateView.recentEvents` to `lastEvents`, so refreshes can replace stale local event rows;
- the PVP back button now calls both `PVPScene.stopLivePolling()` and `PVPScene.stopLiveHeartbeat()`.
- `LivePvpStore.invalidateActiveByDoubleConnectionTimeout()` invalidates active matches when both seats are disconnected after grace, preventing a disconnected non-current seat from receiving a win.

- [x] **Step 4: Verify**

Commands run:

```bash
node tests/sanity_pvp_live_engine_checks.cjs
node tests/sanity_pvp_live_route_checks.cjs
node tests/sanity_pvp_live_session_checks.mjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
npm run build:pages
node tests/browser_pvp_live_audit.mjs http://127.0.0.1:4174 output/browser-pvp-live-social-emote-green
npm run test:node
env AUDIT_FILTER=pvp-live,pvp-live-real bash tests/run_browser_release_checks.sh http://127.0.0.1:4174 output/release-browser-audits-pvp-live-social-emote-final
```

Expected and observed: all commands pass; route sanity covers active double-disconnect invalidation, fake browser audit reports 34/34 findings, and filtered browser release gate reports 0 failed findings for `pvp-live` and `pvp-live-real`.

Remaining before claiming full V10-S3: full friend/Bo3 rematch system beyond the single-match MVP, formal MMR / season scoring, production smoke, and online deployment.

---

### Task 8T: Authoritative Turn Timer Visibility

**Files:**
- Modify: `server/pvp-live/live-store.js`
- Modify: `index.html`
- Modify: `css/pvp.css`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`
- Modify: `tests/sanity_pvp_live_ui_contract_checks.cjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`
- Modify: `tests/browser_pvp_live_audit.mjs`
- Modify: `tests/browser_pvp_live_real_backend_smoke.mjs`
- Modify: `progress.md`

- [x] **Step 1: Add failing timer tests**

Covered:

- setup match views must expose `pvp-live-turn-timer-v1` with a future ready deadline.
- active match views must expose the current action seat and remaining action window.
- `end_turn` must switch timer ownership to the next seat.
- fake and real browser audits must render `data-live-turn-timer` and export the same payload through `render_game_to_text()`.

- [x] **Step 2: Implement store-owned timer projection**

Implemented:

- `LivePvpStore.makeTurnTimer()` derives setup countdown from `state.setup.startedAt / readyDeadlineAt`.
- active countdown derives from `match.updatedAt + turnTimeoutMs`.
- all state-view route outputs now go through `projectMatchStateView()`, so queue polling, current match recovery, direct match reads, and intent responses share the same timer contract.

- [x] **Step 3: Wire UI and mobile layout**

Implemented:

- `PVPScene.getLiveTurnTimer()` normalizes server timer payload and recomputes remaining time against `Date.now()`.
- `PVPScene.formatLiveTurnTimer()` renders setup and active timer text.
- `index.html` adds `data-live-turn-timer`.
- `css/pvp.css` adds desktop and compressed mobile timer styles; the mobile browser audit remains within viewport after adding the timer row.

- [x] **Step 4: Verify**

Commands run:

```bash
node --check server/pvp-live/live-store.js
node --check js/scenes/pvp-scene.js
node --check tests/browser_pvp_live_audit.mjs
node --check tests/browser_pvp_live_real_backend_smoke.mjs
node tests/sanity_pvp_live_route_checks.cjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
npm run build:pages
node tests/browser_pvp_live_audit.mjs http://127.0.0.1:4174 output/browser-pvp-live-timer-green-rerun
node tests/browser_pvp_live_real_backend_smoke.mjs http://127.0.0.1:4174 output/browser-pvp-live-real-timer-green
env AUDIT_FILTER=pvp-live,pvp-live-real bash tests/run_browser_release_checks.sh http://127.0.0.1:4174 output/release-browser-audits-pvp-live-timer-current
```

Expected and observed: all commands pass.

---

### Task 8: Setup, Ready, and Mulligan Flow

**Files:**
- Modify: `server/pvp-live/engine/rules.js`
- Modify: `server/pvp-live/engine/state.js`
- Modify: `server/pvp-live/engine/state-view.js`
- Modify: `server/pvp-live/engine/reducer.js`
- Modify: `js/services/pvp-live-session.js`
- Modify: `index.html`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `css/pvp.css`
- Modify: `tests/sanity_pvp_live_engine_checks.cjs`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`
- Modify: `tests/sanity_pvp_live_persistence_checks.cjs`
- Modify: `tests/sanity_pvp_live_settlement_checks.cjs`
- Modify: `tests/sanity_pvp_live_session_checks.mjs`
- Modify: `tests/sanity_pvp_live_ui_contract_checks.cjs`
- Modify: `tests/browser_pvp_live_audit.mjs`

- [x] **Step 1: Add failing setup-state tests**

Covered:

- a new live match starts in `setup`, not `active`;
- `play_card` and `end_turn` are rejected before both players are ready;
- `stateView` exposes setup metadata without leaking hidden hand/deck data;
- route/session/browser flows must see setup before active combat.

- [x] **Step 2: Implement server-authoritative setup actions**

Implemented:

- initial live match state now records `status: setup`, `phase: setup`, setup deadline metadata, first seat, and mulligan limit;
- each seat records `ready`, `readyAt`, and `mulliganUsed`;
- `mulligan` replaces 0-2 selected cards from the player's own hand, moves selected cards to deck bottom, and emits only a public count;
- `ready` marks the seat ready and transitions to `active/main` only after both seats are ready;
- setup rejects combat intents with `setup_not_ready`.

- [x] **Step 3: Wire session and UI**

Implemented:

- `pvp-live-session` treats matched setup views as `phase: setup`;
- live UI exposes confirm-mulligan and ready actions;
- setup hand cards use selection buttons instead of combat `play_card` buttons;
- combat, end-turn, and surrender controls stay disabled until the match is active;
- setup labels and selected-card styling are covered in UI contract tests.

- [x] **Step 4: Extend browser audit**

Implemented:

- desktop audit joins queue, reaches setup, selects a mulligan card, confirms mulligan, readies, then verifies combat is available only after `battle_started`;
- mobile audit covers the same setup action path before play/surrender;
- fake live service in the audit now models setup before active, so the old matched-implies-active assumption is guarded.

- [x] **Step 5: Verify**

Commands run:

```bash
node tests/sanity_pvp_live_engine_checks.cjs
node tests/sanity_pvp_live_route_checks.cjs
node tests/sanity_pvp_live_persistence_checks.cjs
node tests/sanity_pvp_live_settlement_checks.cjs
node tests/sanity_pvp_live_client_checks.mjs
node tests/sanity_pvp_live_service_bridge_checks.cjs
node tests/sanity_pvp_live_session_checks.mjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
node tests/sanity_intro_progress_sync_checks.cjs
node tests/sanity_planning_todo_checks.cjs
npm run test:node
npm run build:pages
node tests/browser_pvp_live_audit.mjs http://127.0.0.1:4174 output/web-pvp-live-audit-setup-current
AUDIT_FILTER=pvp-live bash tests/run_browser_release_checks.sh http://127.0.0.1:4174 output/release-browser-audits-pvp-live-setup-current
```

Expected and observed: all commands pass.

---

### Task 8B: Ready Timeout Invalidated Setup Room

**Files:**
- Modify: `server/pvp-live/engine/rules.js`
- Modify: `server/pvp-live/engine/state.js`
- Modify: `server/pvp-live/live-store.js`
- Modify: `server/pvp-live/live-persistence.js`
- Modify: `server/routes/pvp-live.js`
- Modify: `js/services/pvp-live-session.js`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `css/pvp.css`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`
- Modify: `tests/sanity_pvp_live_settlement_checks.cjs`
- Modify: `tests/sanity_pvp_live_persistence_checks.cjs`
- Modify: `tests/sanity_pvp_live_session_checks.mjs`
- Modify: `tests/sanity_pvp_live_ui_contract_checks.cjs`
- Modify: `tests/browser_pvp_live_audit.mjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`

- [x] **Step 1: Add failing invalidated tests**

Covered:

- stale setup match becomes `invalidated`, not `finished`;
- setup timeout emits `ready_timeout` and `match_invalidated(reason=ready_timeout)`;
- invalidated setup match clears unpolled matched queue tickets and releases both players for a fresh queue;
- setup timeout does not write `pvp_live_match_settlements`, `pvp_match_history`, rank wins/losses, economy matches, or formal rewards;
- invalidated match persisted in SQLite is not recovered as current match after backend restart;
- frontend session maps `status: invalidated` to `phase: invalidated`, not active.

- [x] **Step 2: Implement server-authoritative invalidation**

Implemented:

- setup ready deadline defaults to 45 seconds and can be shortened in tests via `PVP_LIVE_SETUP_READY_TIMEOUT_MS`;
- `LivePvpStore.sweepMatchTimeout()` handles both setup and active terminal paths;
- setup timeout writes public invalidation events, advances `stateVersion`, saves the snapshot, and releases active match locks without calling settlement;
- pending matched queue tickets are cleared through the same `releaseMatch()` path.

- [x] **Step 3: Protect persistence and UI**

Implemented:

- SQLite persistence stores `invalidated` as a terminal status and excludes it from active-match recovery;
- session and UI expose `invalidated` as a terminal no-score state;
- live panel shows "无效局 / 不计正式积分", disables combat actions, and allows a fresh queue;
- browser audit verifies the invalidated UI state with a fake live service.

- [x] **Step 4: Verify**

Commands run:

```bash
node tests/sanity_pvp_live_route_checks.cjs
node tests/sanity_pvp_live_settlement_checks.cjs
node tests/sanity_pvp_live_persistence_checks.cjs
node tests/sanity_pvp_live_session_checks.mjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
node tests/sanity_intro_progress_sync_checks.cjs
node tests/sanity_planning_todo_checks.cjs
npm run test:node
npm run build:pages
node tests/browser_pvp_live_audit.mjs http://127.0.0.1:4174 output/web-pvp-live-audit-ready-timeout-current
AUDIT_FILTER=pvp-live bash tests/run_browser_release_checks.sh http://127.0.0.1:4174 output/release-browser-audits-pvp-live-ready-timeout-current
```

Expected and observed: all commands pass.

---

### Task 8C: Setup Snapshot Lock And Loadout Hash

**Files:**
- Create: `server/pvp-live/loadout.js`
- Modify: `server/pvp-live/engine/state.js`
- Modify: `server/pvp-live/engine/state-view.js`
- Modify: `server/pvp-live/live-store.js`
- Modify: `server/routes/pvp-live.js`
- Modify: `js/services/backend-client.js`
- Modify: `index.html`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `css/pvp.css`
- Modify: `tests/sanity_pvp_live_engine_checks.cjs`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`
- Modify: `tests/sanity_pvp_live_persistence_checks.cjs`
- Modify: `tests/sanity_pvp_live_client_checks.mjs`
- Modify: `tests/sanity_pvp_live_ui_contract_checks.cjs`
- Modify: `tests/browser_pvp_live_audit.mjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`

- [x] **Step 1: Add failing snapshot-lock tests**

Covered:

- initial live state carries server-locked `loadoutSnapshot` for both seats;
- setup view includes a public `snapshot_locked` event;
- self view exposes own locked hash and snapshot;
- opponent view exposes only public loadout summary and never a full snapshot;
- first queue join returns `loadoutHash/loadoutSummary`;
- repeated queue join or active-match rejoin cannot change the locked hash or identity slot;
- illegal first loadout returns `400 + reason`, while later illegal local loadout input cannot overwrite an already locked queue or match.

- [x] **Step 2: Implement server-side normalization and locking**

Implemented:

- `server/pvp-live/loadout.js` normalizes a 20-card MVP live loadout, validates cards against `pvp-live-v1`, records rule version, legal-card hash, identity slot, label, deck size, lock timestamp, and deterministic `loadoutHash`;
- `LivePvpStore.joinQueue()` checks active matches and existing waiting tickets before reading new loadout input, so locked entries are stable across repeated join attempts;
- `createInitialLiveState()` builds opening hand/deck from the locked snapshot and emits `snapshot_locked` before setup actions;
- route error mapping turns loadout validation failures into readable `400` responses.

- [x] **Step 3: Wire client and UI**

Implemented:

- `BackendClient.joinLivePvpQueue()` forwards a cloned `loadout` candidate when present;
- `PVPScene.joinLiveQueue()` submits a default live loadout candidate for the MVP path;
- live panel shows own locked loadout and opponent public summary;
- `render_game_to_text()` exposes only loadout summary/hash, not the opponent full snapshot or deck order.

- [x] **Step 4: Extend persistence and browser evidence**

Implemented:

- SQLite restart recovery checks now assert recovered `stateView.self.loadoutHash` and identity slot do not drift;
- browser audit fake live service includes `snapshot_locked` and loadout summaries;
- browser audit verifies the UI renders locked summaries and does not leak opponent deck/snapshot in the audit payload.

- [x] **Step 5: Verify**

Commands run:

```bash
node tests/sanity_pvp_live_engine_checks.cjs
node tests/sanity_pvp_live_route_checks.cjs
node tests/sanity_pvp_live_persistence_checks.cjs
node tests/sanity_pvp_live_client_checks.mjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
```

Expected and observed: all commands pass.

Later slices covered true two-account browser integration, SQLite waiting-queue restart recovery, and the MVP match-quality report. Remaining before claiming full V10-S3: multi-instance queue strategy, first-match guide report, game-feel audit, production smoke, and online deployment.

---

### Task 8D: Real Two-Account Browser Smoke

**Files:**
- Create: `tests/browser_pvp_live_real_backend_smoke.mjs`
- Modify: `tests/run_browser_release_checks.sh`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`

- [x] **Step 1: Add real-backend browser smoke**

Covered:

- smoke starts a real Node backend with a temporary SQLite DB;
- two isolated browser contexts register and log in as two real users;
- pages use real `BackendClient`, `AuthService`, `PVPService.live`, and `PVPScene`, not a fake live service;
- user A joins queue with a locked loadout;
- user A repeats join with a changed loadout and keeps the original queue ticket/hash/identity slot;
- user B joins and receives matched setup state;
- both browser seats agree on `matchId` and reciprocal public loadout hashes;
- browser state includes `snapshot_locked` but does not expose opponent `loadoutSnapshot` or hand array;
- both seats ready into active, then user A submits a real card intent and user B observes updated HP from the backend.

- [x] **Step 2: Add release-gate wiring**

Implemented:

- `tests/run_browser_release_checks.sh` now exposes `AUDIT_FILTER=pvp-live-real`;
- `tests/sanity_release_gate_coverage_checks.cjs` pins the real two-account smoke command and key finding names.

- [x] **Step 3: Verify**

Commands run:

```bash
node tests/browser_pvp_live_real_backend_smoke.mjs http://127.0.0.1:4174 output/browser-pvp-live-real-backend-current
```

Expected and observed: 8 findings passed, 0 failed, 0 console errors.

Later slices covered SQLite waiting-queue restart recovery and the MVP match-quality report. Remaining before claiming full V10-S3: multi-instance queue strategy, first-match guide report, game-feel audit, production smoke, and online deployment.

---

### Task 8E: MVP Player-Selected Loadout UI

**Files:**
- Modify: `index.html`
- Modify: `css/pvp.css`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `tests/sanity_pvp_live_ui_contract_checks.cjs`
- Modify: `tests/browser_pvp_live_audit.mjs`
- Modify: `tests/browser_pvp_live_real_backend_smoke.mjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`
- Modify: `progress.md`

- [x] **Step 1: Add failing UI and browser contracts**

Covered:

- live tab must expose stable `data-live-loadout-*` hooks for a pre-queue selector;
- `PVPScene.joinLiveQueue()` must submit the currently selected baseline loadout, not an implicit fixed default;
- fake browser audit must capture `joinQueue(options.loadout)` after a UI preset click;
- real two-account browser smoke must select A/B presets through the page UI before queue join.

- [x] **Step 2: Implement MVP baseline presets**

Implemented:

- `PVPScene.getLiveLoadoutPresets()` exposes three engine-valid MVP presets: balanced/default, sword/pressure, and shield/defensive;
- the submitted payload remains `{ identitySlot, label, deck }` and still goes through server-side validator, snapshot lock, and loadout hash generation;
- loadout selection is editable only in `idle`, `finished`, or `invalidated`; queueing, waiting, setup, and active phases lock the selector;
- mobile layout keeps the selector inside the first viewport by using compact three-column controls.

- [x] **Step 3: Verify**

Commands run:

```bash
node tests/sanity_pvp_live_ui_contract_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
npm run build:pages
node tests/browser_pvp_live_audit.mjs http://127.0.0.1:4174 output/web-pvp-live-audit-selectable-loadout-current
node tests/browser_pvp_live_real_backend_smoke.mjs http://127.0.0.1:4174 output/browser-pvp-live-real-backend-selectable-current
AUDIT_FILTER=pvp-live,pvp-live-real bash tests/run_browser_release_checks.sh http://127.0.0.1:4174 output/release-browser-audits-pvp-live-selectable-current
```

Expected and observed: fake live UI audit 11/11 passed; real two-account browser smoke 10/10 passed; filtered release browser gate passed.

Later slices covered the MVP match-quality report. Remaining before claiming full V10-S3: multi-instance queue strategy, first-match guide report, game-feel audit, production smoke, and online deployment.

---

### Task 8F: SQLite Waiting Queue Restart Recovery Baseline

**Files:**
- Modify: `server/db/database.js`
- Modify: `server/pvp-live/live-persistence.js`
- Modify: `server/pvp-live/live-store.js`
- Modify: `tests/sanity_pvp_live_persistence_checks.cjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`
- Modify: `progress.md`

- [x] **Step 1: Persist waiting queue entries**

Implemented:

- `pvp_live_queue_tickets` stores only unmatched waiting entries: queue ticket, user, display name, normalized locked loadout snapshot, and created time;
- persistence exposes save/load/delete helpers for ticket lookup, user lookup, and oldest opponent lookup;
- matched one-shot `pendingQueueResults` remains in memory and is not persisted as replayable state.

- [x] **Step 2: Hydrate waiting queue after restart**

Implemented:

- `joinQueue()` checks active match first, then persisted waiting entry for the same user, then the oldest persisted opponent entry, and only then creates a new ticket;
- `getQueueStatus()` and `cancelQueue()` can hydrate a persisted waiting ticket by ticket id;
- repeated join after restart returns the same ticket and locked hash instead of accepting a changed client loadout;
- when a persisted waiting entry is matched or cancelled, the queue row is removed.

- [x] **Step 3: Guard stale waiting rows against active matches**

Implemented:

- active/current match recovery has higher priority than any stale waiting row;
- hydrating an active match clears waiting rows for its participants;
- persistence tests manually insert a stale waiting row after a match is persisted to prove restarted active match recovery wins and the stale ticket returns 404.

- [x] **Step 4: Verify**

Commands run:

```bash
node tests/sanity_pvp_live_persistence_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
```

Expected and observed: both pass.

Remaining before claiming full V10-S3: multi-instance queue strategy, first-match guide report, game-feel audit, production smoke, and online deployment.

---

### Task 8G: MVP Match Quality Report

**Files:**
- Modify: `server/pvp-live/engine/state.js`
- Modify: `server/pvp-live/engine/state-view.js`
- Modify: `server/pvp-live/live-store.js`
- Modify: `index.html`
- Modify: `css/pvp.css`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `tests/sanity_pvp_live_engine_checks.cjs`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`
- Modify: `tests/sanity_pvp_live_ui_contract_checks.cjs`
- Modify: `tests/browser_pvp_live_audit.mjs`
- Modify: `tests/browser_pvp_live_real_backend_smoke.mjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`
- Modify: `progress.md`

- [x] **Step 1: Add public report contracts**

Covered:

- initial live state must include `pvp-live-match-quality-v1`;
- matched state views must expose a public quality tag, expansion stage, bucketed rating delta, and wait data;
- UI and browser payload must show a public quality explanation without exact hidden `rating`, `score`, or `elo` fields.

- [x] **Step 2: Implement MVP quality snapshot**

Implemented:

- `LivePvpStore.createMatch()` creates a `good / mvp_open_pool / unrated_mvp` quality snapshot with wait times and candidate pool size;
- the report includes safeguards for server authority, locked snapshots, setup ready, and first-action budget;
- `projectStateView()` exposes only the public report fields to both seats.

- [x] **Step 3: Render and audit**

Implemented:

- live panel renders `data-live-match-quality`;
- `PVPScene.getLiveSnapshot()` includes the public report for browser audits;
- fake and real browser live smoke both assert the report exists and does not leak hidden exact rating-like fields.

- [x] **Step 4: Verify**

Commands run:

```bash
node tests/sanity_pvp_live_engine_checks.cjs
node tests/sanity_pvp_live_route_checks.cjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
```

Expected and observed: all pass.

Remaining before claiming full V10-S3: multi-instance queue strategy, first-match guide report, game-feel audit, production smoke, and online deployment.

---

### Task 8H: Opening Lethal Protection And Event Feedback

**Files:**
- Modify: `server/pvp-live/engine/rules.js`
- Modify: `server/pvp-live/engine/state.js`
- Modify: `server/pvp-live/engine/reducer.js`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `css/pvp.css`
- Modify: `tests/sanity_pvp_live_engine_checks.cjs`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`
- Modify: `tests/sanity_pvp_live_ui_contract_checks.cjs`
- Modify: `tests/browser_pvp_live_audit.mjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`
- Modify: `progress.md`

- [x] **Step 1: Add server-authoritative opening protection contracts**

Covered:

- a low-HP defender who has not received a turn cannot be finished by the first actor's opening damage;
- the protected seat is left at `openingProtection.minimumHp`;
- duplicate lethal intents remain idempotent after protection;
- normal lethal still finishes once the target has already received a turn.

- [x] **Step 2: Implement reducer protection and public event**

Implemented:

- each seat tracks completed `turnsTaken`;
- `end_turn` increments the acting seat's completed turn count;
- damage that would kill a zero-turn target is clamped to the opening-protection floor;
- the reducer emits public `opening_protection_triggered` with protected seat, minimum HP, prevented damage, and would-have HP.

- [x] **Step 3: Render readable live event feedback**

Implemented:

- live PVP event panel formats known public events into player-readable Chinese labels;
- `opening_protection_triggered` renders the protected seat, HP floor, and prevented lethal damage;
- CSS gives event title/detail separate wrapping so long protection details do not widen the mobile panel;
- browser audit covers both desktop readable details and mobile long-text width safety.

- [x] **Step 4: Verify focused gates**

Commands run:

```bash
node tests/sanity_pvp_live_engine_checks.cjs
node tests/sanity_pvp_live_route_checks.cjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
```

Expected and observed: all pass.

Remaining before claiming full V10-S3: multi-instance queue strategy, full first-match guide contract, broader game-feel audit, production smoke, and online deployment.

---

### Task 8I: First-Match Guide Brief MVP

**Files:**
- Modify: `server/pvp-live/engine/state.js`
- Modify: `server/pvp-live/engine/state-view.js`
- Modify: `index.html`
- Modify: `css/pvp.css`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `tests/sanity_pvp_live_engine_checks.cjs`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`
- Modify: `tests/sanity_pvp_live_ui_contract_checks.cjs`
- Modify: `tests/browser_pvp_live_audit.mjs`
- Modify: `tests/browser_pvp_live_real_backend_smoke.mjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`
- Modify: `progress.md`

- [x] **Step 1: Add public first-match guide contracts**

Covered:

- initial live state includes `pvp-live-first-match-guide-v1`;
- the guide explains live ranked mode boundary, setup ready flow, snapshot lock, opening protection, and invalidated no-score branch;
- the guide exposes three MVP recommended loadouts with weaknesses, exception branches, and review actions;
- the guide must not imply hidden reward, hidden rating compensation, or formal ELO.

- [x] **Step 2: Project and render the MVP brief**

Implemented:

- `projectStateView()` exposes the public brief to both seats and resolves `nextAction` from current match status;
- live panel renders `data-live-first-guide` / `data-live-first-match-guide` below match quality;
- `PVPScene.getLiveSnapshot()` includes the same public payload for audit and `render_game_to_text()`;
- the visible UI shows current next action, compact rules steps, and three recommended loadout weaknesses.

- [x] **Step 3: Audit fake and real browser paths**

Implemented:

- fake browser audit verifies setup rendering, active next-action update, recommended loadouts, exception branches, review actions, and no reward / rating / ELO wording;
- real two-account browser smoke verifies the backend-projected guide renders after match and updates after both seats enter active;
- release coverage pins engine, route, UI, fake browser, and real browser markers.

- [x] **Step 4: Verify focused gates**

Commands run:

```bash
node tests/sanity_pvp_live_engine_checks.cjs
node tests/sanity_pvp_live_route_checks.cjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
```

Expected and observed: all pass.

Remaining before claiming full V10-S3: multi-instance queue strategy, full first-match guide contract, broader game-feel audit, production smoke, and online deployment. The MVP brief is not the full first-loss review flow, formal practice battle handoff, formal ELO/season reward system, or 8-loadout content rollout.

---

### Task 8J: 120s No-Real-Player Long-Wait Branch MVP

**Files:**
- Modify: `server/pvp-live/live-store.js`
- Modify: `js/services/pvp-live-session.js`
- Modify: `index.html`
- Modify: `css/pvp.css`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`
- Modify: `tests/sanity_pvp_live_session_checks.mjs`
- Modify: `tests/sanity_pvp_live_ui_contract_checks.cjs`
- Modify: `tests/browser_pvp_live_audit.mjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`
- Modify: `progress.md`

- [x] **Step 1: Add long-wait public report contracts**

Covered:

- a waiting queue ticket that has waited at least 120 seconds remains `status=waiting`;
- the route exposes `pvp-live-waiting-report-v1` with wait duration, threshold, `longWait`, `no_ghost_fallback`, `no_score_change`, and three actions;
- the report must not imply reward, rating compensation, formal ELO, or automatic ghost fallback.

- [x] **Step 2: Retain report in live session state**

Implemented:

- `createPvpLiveSession()` stores `waitingReport` from join/status waiting responses;
- matched, refreshed, resumed, sync-required, rejected, accepted, cancelled, and expired states clear stale waiting reports;
- session tests verify the long-wait report survives polling and remains separate from legacy PVP paths.

- [x] **Step 3: Render long-wait branch in live UI**

Implemented:

- live panel renders `data-live-waiting-report` only for long-wait reports;
- the visible branch explains “120 秒无真人”, continue waiting, no-score practice, cancel queue, and no ghost fallback;
- `practice-live` is a safe hint entry only in this MVP and does not call legacy matching or settlement;
- `PVPScene.getLiveSnapshot()` exposes the same waiting report for `render_game_to_text()`.

- [x] **Step 4: Verify focused and browser gates**

Commands run:

```bash
node tests/sanity_pvp_live_route_checks.cjs
node tests/sanity_pvp_live_session_checks.mjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
npm run build:pages
env AUDIT_FILTER=pvp-live,pvp-live-real bash tests/run_browser_release_checks.sh http://127.0.0.1:4174 output/release-browser-audits-pvp-live-long-wait-current
```

Expected and observed: all pass. Browser reports: `pvp-live` 19/19, `pvp-live-real` 14/14 with 0 console errors.

Remaining before claiming full V10-S3: multi-instance queue strategy, full first-match guide contract, full first-loss review flow, formal practice battle handoff, broader game-feel audit, production smoke, and online deployment.

---

### Task 8K: Public Post-Match Review MVP

**Files:**
- Modify: `server/pvp-live/engine/reducer.js`
- Modify: `server/pvp-live/engine/state-view.js`
- Modify: `index.html`
- Modify: `css/pvp.css`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `tests/sanity_pvp_live_engine_checks.cjs`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`
- Modify: `tests/sanity_pvp_live_ui_contract_checks.cjs`
- Modify: `tests/browser_pvp_live_audit.mjs`
- Modify: `tests/browser_pvp_live_real_backend_smoke.mjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`
- Modify: `progress.md`

- [x] **Step 1: Add public finished-review contracts**

Covered:

- finished state views expose `pvp-live-post-match-review-v1`;
- surrender, lethal, and timeout terminal paths expose a stable `finishReason`;
- review evidence is derived from public events only and never includes hidden payloads, opponent hand, deck order, reward, rating, or ELO promises;
- both seats get a useful review: the winner gets stability confirmation, the loser gets first-loss learning advice.

- [x] **Step 2: Render review in live UI**

Implemented:

- live panel renders `data-live-post-match-review` only when the server returns a finished review;
- the card shows result, finish reason, public evidence, 1-2 suggestions, and next actions for reviewing events, adjusting loadout, practice, and queueing again;
- `PVPScene.getLiveSnapshot()` exposes `postMatchReview`, so `render_game_to_text().pvp.live.postMatchReview` uses the same payload as the visible UI.

- [x] **Step 3: Verify focused contracts**

Commands run:

```bash
node tests/sanity_pvp_live_engine_checks.cjs
node tests/sanity_pvp_live_route_checks.cjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
```

Expected and observed: all pass.

Remaining before claiming full V10-S3: multi-instance queue strategy, full first-loss deep review, formal practice battle handoff, key-turn replay, full friend/Bo3 rematch system beyond the single-match MVP, broader game-feel audit, production smoke, and online deployment.

---

### Task 8L: Post-Match Review Action Handoff MVP

**Files:**
- Modify: `index.html`
- Modify: `css/pvp.css`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `tests/browser_pvp_live_audit.mjs`
- Modify: `tests/sanity_pvp_live_ui_contract_checks.cjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`
- Modify: `progress.md`

- [x] **Step 1: Add failing action-entry contracts**

Covered:

- `postMatchReview.nextActions` must render as clickable `data-live-post-review-action` controls, not inert text;
- review events, adjust loadout, practice, and queue again actions must be present in the finished review card;
- the actions must not call legacy ghost matching, client-reported settlement, or old PVP result paths.

Observed red:

```bash
node tests/sanity_pvp_live_ui_contract_checks.cjs
node tests/browser_pvp_live_audit.mjs http://127.0.0.1:4174 output/browser-pvp-live-post-actions-red
```

Expected and observed: UI contract failed on missing `handleLivePostReviewAction(`; browser audit failed waiting for `[data-live-post-review-action="review_events"]`.

- [x] **Step 2: Implement safe action handoff**

Implemented:

- `renderLivePostMatchReview()` renders action buttons for review events, adjust loadout, practice, and queue again;
- `handleLivePostReviewAction()` routes `queue_again` through existing `joinLiveQueue()`, `practice` through the safe no-score practice hint, `review_events` to the event panel, and `adjust_loadout` to the loadout selector;
- `data-live-event-panel` plus CSS focus states make the review handoff visible without introducing a new battle/replay subsystem.
- failed `queue_again` after a finished review now clears stale `matchId/stateView/postMatchReview` and returns to clean idle with the join failure reason.

- [x] **Step 3: Verify focused browser path**

Commands run:

```bash
node tests/sanity_pvp_live_ui_contract_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
node --check js/scenes/pvp-scene.js
node --check tests/browser_pvp_live_audit.mjs
npm run build:pages
node tests/browser_pvp_live_audit.mjs http://127.0.0.1:4174 output/browser-pvp-live-post-actions-green
node tests/sanity_pvp_live_session_checks.mjs
```

Expected and observed: all pass; browser audit reports 23/23 findings and 0 console errors.

- [x] **Step 4: Verify real-backend action handoff**

Covered:

- real two-account browser smoke clicks review events, adjust loadout, practice, and queue again after surrender;
- real queue again returns to `waiting` through `/api/pvp/live/queue/join`;
- no legacy PVP result or ghost path is introduced.

Command covered by release filter:

```bash
env AUDIT_FILTER=pvp-live,pvp-live-real bash tests/run_browser_release_checks.sh http://127.0.0.1:4174 output/release-browser-audits-pvp-live-post-actions-current
```

Remaining before claiming full V10-S3: multi-instance queue strategy, full first-loss deep review, formal practice battle handoff, key-turn replay, full friend/Bo3 rematch system beyond the single-match MVP, broader game-feel audit, production smoke, and online deployment.

---

### Task 8M: Public Post-Match Event Trail MVP

**Files:**
- Modify: `server/pvp-live/engine/state-view.js`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `tests/sanity_pvp_live_engine_checks.cjs`
- Modify: `tests/browser_pvp_live_audit.mjs`
- Modify: `tests/browser_pvp_live_real_backend_smoke.mjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`
- Modify: `progress.md`

- [x] **Step 1: Add failing public-trail contracts**

Covered:

- finished review evidence must be a public event trail, not only the final surrender / match-finished pair;
- the trail must include early public context such as `battle_started` and terminal context such as `match_finished`;
- review evidence must remain sanitized and must not include raw event payloads, hidden hand data, deck order, reward, rating, or ELO promises;
- clicking `review_events` must switch the event panel from last intent events to the post-match public trail.

Observed red:

```bash
node tests/sanity_pvp_live_engine_checks.cjs
node tests/browser_pvp_live_audit.mjs http://127.0.0.1:4174 output/browser-pvp-live-review-trail-red
```

Expected and observed: engine failed on `post-match review should include a public event trail instead of only the final event pair`; browser audit showed the focused event panel still only contained `player_surrendered` / `match_finished`.

- [x] **Step 2: Implement sanitized review trail**

Implemented:

- `collectReviewEvidence()` now allows the public setup / battle / terminal milestones needed for review: `snapshot_locked`, `mulligan_completed`, `player_ready`, `battle_started`, combat public events, surrender / timeout, and `match_finished`;
- evidence is still sanitized through `sanitizePublicEvent()` and only returns `eventType`, `sequence`, and `actingSeat`;
- the review trail keeps up to 12 entries and preserves milestone events such as snapshot lock, battle start, and match finish when trimming is needed.

- [x] **Step 3: Switch live event panel to review trail**

Implemented:

- `getLivePostMatchReview()` now accepts up to 12 evidence entries;
- `handleLivePostReviewAction('review_events')` marks the live event panel as review-focused and re-renders the panel;
- `renderLivePanel()` uses `postMatchReview.evidence` when the panel is review-focused, then falls back to existing `lastEvents / recentEvents`;
- `renderLivePanel()` clears `data-live-review-focus` outside finished states so a new queue / setup UI does not retain the previous match review highlight;
- fake and real browser smoke now assert the focused event panel shows early public trail entries such as `开战` and terminal entries such as `对局结束`.

- [x] **Step 4: Verify**

Commands run:

```bash
node tests/sanity_pvp_live_engine_checks.cjs
node --check js/scenes/pvp-scene.js
node tests/sanity_release_gate_coverage_checks.cjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
node --check tests/browser_pvp_live_real_backend_smoke.mjs
npm run build:pages
node tests/browser_pvp_live_audit.mjs http://127.0.0.1:4174 output/browser-pvp-live-review-trail-green
node tests/browser_pvp_live_audit.mjs http://127.0.0.1:4174 output/browser-pvp-live-review-focus-green
npm run test:node
env AUDIT_FILTER=pvp-live,pvp-live-real bash tests/run_browser_release_checks.sh http://127.0.0.1:4174 output/release-browser-audits-pvp-live-review-trail-current
```

Expected and observed: all commands pass; fake browser audit reports 23/23 findings, and filtered browser release gate reports 0 failed findings and 0 console errors for `pvp-live` and `pvp-live-real`.

Remaining before claiming full V10-S3: terminal review retention after full page refresh, multi-instance queue strategy, full first-loss deep review, formal practice battle handoff, key-turn replay, full friend/Bo3 rematch system beyond the single-match MVP, broader game-feel audit, production smoke, and online deployment.

---

### Task 8N: Terminal Post-Match Review Refresh Recovery MVP

**Files:**
- Modify: `js/services/pvp-live-session.js`
- Modify: `tests/sanity_pvp_live_session_checks.mjs`
- Modify: `tests/browser_pvp_live_real_backend_smoke.mjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`
- Modify: `progress.md`

- [x] **Step 1: Add failing terminal-review recovery contract**

Covered:

- a live session must remember the last finished match only when the server-authoritative state is `finished` and contains `postMatchReview`;
- a newly created session after page reload must call current-match recovery first;
- if `/api/pvp/live/matches/current` returns no current match because the finished match has already been released, the session must load the stored terminal `matchId` through `/api/pvp/live/matches/:matchId`;
- the restored state must be `phase=finished` with the same `postMatchReview`;
- requeue, cancel, and reset must clear the local terminal recovery anchor.

Observed red:

```bash
node tests/sanity_pvp_live_session_checks.mjs
```

Expected and observed: the new assertion failed with `finished terminal match should persist last reviewable match id for refresh recovery`.

- [x] **Step 2: Implement terminal match recovery anchor**

Implemented:

- `pvp-live-session` now uses `theDefierPvpLiveLastTerminalMatchV1` as a best-effort browser storage key and scopes it by current logged-in user when user identity is available;
- accepted terminal states write the finished `matchId` only when `postMatchReview` exists;
- `resumeCurrentMatch()` still prioritizes `/matches/current`, then falls back to the stored terminal `matchId` via `getMatch(matchId)` only after an explicit no-current response;
- invalid / non-reviewable stored matches clear the local anchor and return to idle, while transient current / terminal service failures keep the anchor for retry and never enter fake `finished`;
- failed `joinQueue()` clears the in-memory finished state but keeps the anchor for refresh retry;
- successful `joinQueue()`, `cancelQueue()`, and `reset()` clear the anchor so a new live queue does not inherit an old terminal review.

- [x] **Step 3: Add real browser reload smoke**

Covered:

- real two-account live smoke finishes a match through surrender;
- player B performs a full page reload after the post-match review is visible;
- the smoke reopens the PVP live tab with one explicit `loadLivePanel()` call, avoiding a `switchTab()` plus manual load double-trigger;
- the restored DOM, `PVPScene.getLiveSnapshot()`, `render_game_to_text()`, and local storage all confirm the same finished `matchId` and review payload;
- the smoke setup preserves the authenticated browser context across reload instead of clearing session storage in `addInitScript`.

- [x] **Step 4: Verify**

Commands run:

```bash
node tests/sanity_pvp_live_session_checks.mjs
node --check js/services/pvp-live-session.js
node --check tests/browser_pvp_live_real_backend_smoke.mjs
node tests/sanity_release_gate_coverage_checks.cjs
npm run build:pages
node tests/browser_pvp_live_real_backend_smoke.mjs http://127.0.0.1:4174 output/browser-pvp-live-terminal-review-reload-green
env AUDIT_FILTER=pvp-live,pvp-live-real bash tests/run_browser_release_checks.sh http://127.0.0.1:4174 output/release-browser-audits-pvp-live-terminal-review-current
```

Expected and observed: all commands pass; the real backend browser smoke reports 18/18 findings with 0 console errors, and filtered browser release gate reports 0 failed findings for `pvp-live` and `pvp-live-real`.

Remaining before claiming full V10-S3: multi-instance queue strategy, full first-loss deep review, formal practice battle handoff, key-turn replay, full friend/Bo3 rematch system beyond the single-match MVP, broader game-feel audit, production smoke, and online deployment.

---

### Task 8O: Post-Match Playable Practice Drill MVP

**Files:**
- Modify: `js/scenes/pvp-scene.js`
- Modify: `js/core/challenge_hub.js`
- Modify: `tests/browser_pvp_live_audit.mjs`
- Modify: `tests/browser_pvp_live_real_backend_smoke.mjs`
- Modify: `tests/sanity_observatory_archive_checks.cjs`
- Modify: `tests/sanity_pvp_live_ui_contract_checks.cjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`
- Modify: `progress.md`

- [x] **Step 1: Add failing post-review practice handoff contract**

Covered:

- finished-state post-match `practice` must create a playable no-score drill, not only a hint;
- the handoff must write `challenge.trainingFocus.sourceRunId` and `guideRecordId` as `pvp_live:${matchId}`;
- `pvp.live.drillScenario` must expose `pvp-live-drill-scenario-v1`;
- the scenario must be self-only replay material with `sourceVisibility=replay_self`, `usesHiddenInformation=false`, and `rankedImpact=none`;
- the playable drill must become `practiceOnly + replayOnly`, hide score surface from payload, and avoid official progress / archive / unlock / verification writes;
- no reward, rating, ELO, hidden hand, old ghost opponent, or old client-side settlement path may be used.

Observed red:

```bash
node tests/sanity_pvp_live_ui_contract_checks.cjs
```

Expected and observed: the new source marker failed before implementation with `PVPScene should expose live UI marker: buildLivePostReviewDrillScenario(`.

- [x] **Step 2: Implement no-score drill scenario, focus handoff, and playable practice bundle**

Implemented:

- `PVPScene.buildLivePostReviewDrillScenario()` derives a no-score training scenario from the current `postMatchReview`, public evidence, terminal result, finish reason, and locked public loadout summary;
- the scenario records `sourceMatchId`, public event types and sequences, training tags, recommended MVP loadout, and self-only / no-hidden-info / no-ranked-impact safety flags;
- `PVPScene.commitLivePostReviewPracticeHandoff()` stores the scenario, writes an observatory training focus through `setObservatoryTrainingFocus()`, and calls `beginPvpLiveDrillScenario()` when challenge hub exposes it;
- `challenge_hub` now exposes `buildPvpLiveDrillBundle()` and `beginPvpLiveDrillScenario()`, mapping the PVP review scenario into a `PVP-*` seed, a locked replay-only character selection, and a `practiceOnly` active challenge run;
- `practiceOnly` runs reuse the map / replay banner path but do not write challenge progress, observatory archive records, collection unlocks, season verification, or observatory-node omen archive; payload score is surfaced as `0` and banner copy says `练习不计分`;
- waiting long-wait `practice-live` remains a safety hint only, so the handoff is limited to finished matches with a real post-match review;
- starting a new live queue clears the previous in-memory drill scenario after the queue / match state successfully changes.

- [x] **Step 3: Extend fake and real browser verification**

Covered:

- fake browser audit clicks the finished post-review practice action and verifies `character-selection-screen`, `pending.practiceOnly`, `challenge.trainingFocus`, `pvp.live.drillScenario`, public evidence fields, and no legacy calls;
- fake browser audit confirms the drill can start into `map-screen` as a `practiceOnly + replayOnly` active run with `currentScore=0` and `练习不计分` banner copy;
- the old safe-handoff check now validates `adjust_loadout` copy, keeping waiting/practice hint behavior separate from finished practice handoff;
- real two-account browser smoke clicks review events, adjusts loadout, selects a new preset, then clicks practice and verifies the same no-score drill handoff against a real backend `matchId`;
- observatory archive sanity covers `practiceOnly` start / active payload / observatory-node side effect / finalize paths, proving progress, archive, unlock, and verification state remain unchanged;
- release-gate coverage now pins the fake and real browser findings plus `pvp-live-drill-scenario-v1`, `practiceOnly`, `sourceVisibility`, `usesHiddenInformation`, and `rankedImpact`.

- [x] **Step 4: Verify**

Commands run:

```bash
node --check js/scenes/pvp-scene.js
node --check js/core/challenge_hub.js
node --check tests/browser_pvp_live_real_backend_smoke.mjs
node tests/sanity_observatory_archive_checks.cjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
npm run build:pages
node tests/browser_pvp_live_audit.mjs http://127.0.0.1:4174 output/browser-pvp-live-practice-playable-green
node tests/browser_pvp_live_real_backend_smoke.mjs http://127.0.0.1:4174 output/browser-pvp-live-practice-playable-real
npm run test:node
env AUDIT_FILTER=pvp-live,pvp-live-real bash tests/run_browser_release_checks.sh http://127.0.0.1:4174 output/release-browser-audits-pvp-live-practice-playable-current
```

Expected and observed: all commands pass; fake browser audit reports 25/25 findings, real backend smoke reports 18/18 findings with 0 console errors, `npm run test:node` passes, and filtered browser release gate reports 0 failed findings for `pvp-live` and `pvp-live-real`.

Remaining before claiming full V10-S3: multi-instance queue strategy, full first-loss deep review, formal AI practice opponent that replays the original PVP tempo, key-turn interactive replay, full friend/Bo3 rematch system beyond the single-match MVP, broader game-feel audit, production smoke, and online deployment.

---

### Task 8P: Post-Match Key-Turn Replay MVP

**Files:**
- Modify: `server/pvp-live/engine/state-view.js`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `css/pvp.css`
- Modify: `tests/sanity_pvp_live_engine_checks.cjs`
- Modify: `tests/sanity_pvp_live_ui_contract_checks.cjs`
- Modify: `tests/browser_pvp_live_audit.mjs`
- Modify: `tests/browser_pvp_live_real_backend_smoke.mjs`
- Modify: `progress.md`

- [x] **Step 1: Add failing key-turn replay contract**

Covered:

- finished-state post-match review must expose `keyTurnReplay.reportVersion=pvp-live-key-turn-replay-v1`;
- key-turn replay must use `sourceVisibility=public_events`, `usesHiddenInformation=false`, and `rankedImpact=none`;
- replay turns must include at least the battle-start and terminal decision windows;
- replay turns must not contain raw `payload`, hidden hand/deck/card ids, card instance ids, loadout snapshots, rewards, rating, or ELO fields;
- post-match actions must include `review_key_turns` without removing `queue_again`.

Observed red:

```bash
node tests/sanity_pvp_live_engine_checks.cjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
```

Expected and observed: the engine check first failed because `review_key_turns` / `keyTurnReplay` did not exist; after the server contract passed, the UI contract failed because `getLiveKeyTurnReplay()` and browser audit markers did not exist.

- [x] **Step 2: Implement public key-turn replay projection and UI focus**

Implemented:

- `state-view` builds `keyTurnReplay` from the already-sanitized `postMatchReview.evidence`, selecting opening, pressure, and terminal windows without consulting raw event payloads;
- replay entries include stable ids, labels, public sequence/event type/acting seat, severity, and lesson copy derived from public event type and terminal result;
- `nextActions` now includes `review_key_turns` and the frontend accepts up to five actions, preserving `queue_again`;
- `PVPScene.getLiveKeyTurnReplay()` white-lists the new replay payload for UI, snapshot, and `render_game_to_text()`;
- `renderLiveKeyTurnReplay()` renders a compact key-turn grid inside the finished review card;
- `handleLivePostReviewAction('review_key_turns')` focuses the key-turn card and switches the event panel to `key_turns`, using only `keyTurnReplay.turns` rather than raw `recentEvents` / `lastEvents`;
- `css/pvp.css` adds key-turn grid and focus styling.

- [x] **Step 3: Extend fake and real browser verification**

Covered:

- fake browser audit verifies key-turn replay DOM, snapshot/text parity, public visibility flags, action id, focus behavior, no hidden payload fields, and no legacy settlement calls;
- real two-account browser smoke verifies server-generated key-turn replay after surrender, text parity, refresh survival, click focus, and no regression in no-score practice handoff;
- contract checks pin `pvp-live-key-turn-replay-v1`, `review_key_turns`, `data-live-key-turn-replay`, CSS markers, and the new browser finding names.

- [x] **Step 4: Verify**

Commands run:

```bash
node --check server/pvp-live/engine/state-view.js
node --check js/scenes/pvp-scene.js
node tests/sanity_pvp_live_engine_checks.cjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
npm run build:pages
node tests/browser_pvp_live_audit.mjs http://127.0.0.1:4174 output/browser-pvp-live-key-turn-current
node tests/browser_pvp_live_real_backend_smoke.mjs http://127.0.0.1:4174 output/browser-pvp-live-key-turn-real-current
npm run test:node
env AUDIT_FILTER=pvp-live,pvp-live-real bash tests/run_browser_release_checks.sh http://127.0.0.1:4174 output/release-browser-audits-pvp-live-key-turn-current
```

Expected and observed: all focused commands pass; fake browser audit reports 27/27 findings, real backend smoke reports 19/19 findings with 0 console errors, `npm run test:node` passes, and the filtered browser release gate reports 0 failed findings for `pvp-live` and `pvp-live-real`.

Remaining before claiming full V10-S3: multi-instance queue strategy, full first-loss deep review, formal AI practice opponent that replays the original PVP tempo, key-turn interactive replay beyond this MVP summary, full friend/Bo3 rematch system beyond the single-match MVP, broader game-feel audit, production smoke, and online deployment.

---

### Task 8R: Friendly Rematch MVP

**Files:**
- Modify: `server/pvp-live/live-store.js`
- Modify: `server/routes/pvp-live.js`
- Modify: `server/pvp-live/engine/state.js`
- Modify: `server/pvp-live/engine/state-view.js`
- Modify: `server/pvp-live/live-settlement.js`
- Modify: `js/services/backend-client.js`
- Modify: `js/services/pvp-service.js`
- Modify: `js/services/pvp-live-session.js`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `css/pvp.css`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`
- Modify: `tests/sanity_pvp_live_settlement_checks.cjs`
- Modify: `tests/sanity_pvp_live_client_checks.mjs`
- Modify: `tests/sanity_pvp_live_service_bridge_checks.cjs`
- Modify: `tests/sanity_pvp_live_session_checks.mjs`
- Modify: `tests/sanity_pvp_live_ui_contract_checks.cjs`
- Modify: `tests/browser_pvp_live_audit.mjs`
- Modify: `tests/browser_pvp_live_real_backend_smoke.mjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`
- Modify: `progress.md`

- [x] **Step 1: Add same-opponent rematch contract**

Covered:

- finished live matches must expose `friendly_rematch` as a post-match next action;
- only original participants can request a rematch from the source match;
- the first participant receives `waiting_rematch` plus `friendlySeries.reportVersion=pvp-live-friendly-series-v1`;
- the second participant creates a new live match with `mode=friendly`, swapped seats, source match linkage, and no ranked impact;
- friendly matches must keep server-authoritative reducer / ready / opening-protection behavior, but must not write formal settlement, rank, wallet, coins, or `pvp_match_history`.

Observed red:

```bash
node tests/sanity_pvp_live_route_checks.cjs
node tests/sanity_pvp_live_settlement_checks.cjs
```

Expected and observed: route check first failed because `friendly_rematch` did not exist; settlement check first failed because `/matches/:matchId/rematch` returned 404.

- [x] **Step 2: Implement server rematch and no-score isolation**

Implemented:

- `LivePvpStore.requestFriendlyRematch()` records a same-source rematch request in memory, returns `waiting_rematch` for the first participant, and creates a new match after the second participant confirms;
- rematch creation swaps source seats, lets each side submit a new legal loadout candidate, sets `mode=friendly`, and attaches a sanitized `friendlySeries`;
- `POST /api/pvp/live/matches/:matchId/rematch` exposes the flow, returns 404 for non-participants, and keeps active-match conflict handling server-side;
- `createInitialLiveState()` accepts `mode` and `friendlySeries`, and friendly first-match guide adds `friendly_no_ranked_impact`;
- `projectStateView()` and `projectPostMatchReview()` expose sanitized `mode` / `friendlySeries`;
- `makeSqliteLivePvpSettlement().settleMatch()` skips friendly finished matches with `friendly_no_ranked_impact`, leaving formal rank/economy/history unchanged.

- [x] **Step 3: Implement browser-facing rematch flow**

Implemented:

- `BackendClient.requestLivePvpRematch()` posts to `/api/pvp/live/matches/:matchId/rematch`, trims display name, clones loadout, and does not touch legacy result paths;
- `PVPService.live.requestRematch()` bridges the client method;
- `pvp-live-session.requestRematch()` keeps the finished review visible while waiting, stores `rematchReport`, and switches to the new friendly setup match when the server returns `matched`;
- `PVPScene.handleLivePostReviewAction('friendly_rematch')` submits the currently selected loadout, renders the waiting hint, and shows the `data-live-friendly-series` no-score summary;
- `getLiveSnapshot()` and `render_game_to_text()` expose top-level `friendlySeries` for audit and tooling.

- [x] **Step 4: Extend verification**

Covered:

- route sanity verifies participant-only access, waiting / matched responses, friendly mode projection, source match linkage, no reward/rating/ELO wording, and accepted rematch becoming the current match instead of opening a parallel public queue;
- settlement sanity verifies friendly surrender reaches finished but does not change scores, wallet matches, coins, settlement gate, or match history;
- client / service / session checks pin the new request method and the waiting/matched session states;
- fake browser audit clicks friendly rematch and verifies waiting hint, visible `friendlySeries`, snapshot parity, and no legacy calls;
- real two-account browser smoke verifies the post-match friendly rematch button can create a waiting same-opponent invite against the real backend; requester auto-recovery is completed in Task 8S.

Commands run so far:

```bash
node --check server/pvp-live/live-store.js
node --check server/routes/pvp-live.js
node --check server/pvp-live/engine/state.js
node --check server/pvp-live/engine/state-view.js
node --check server/pvp-live/live-settlement.js
node tests/sanity_pvp_live_engine_checks.cjs
node tests/sanity_pvp_live_persistence_checks.cjs
node tests/sanity_pvp_live_route_checks.cjs
node tests/sanity_pvp_live_settlement_checks.cjs
node tests/sanity_pvp_live_client_checks.mjs
node tests/sanity_pvp_live_service_bridge_checks.cjs
node tests/sanity_pvp_live_session_checks.mjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
```

Expected and observed so far: all listed focused commands pass. Full Node/build/browser release verification remains to run after this implementation note.

### Task 8S: Friendly Rematch Requester Auto-Recovery

**Files:**
- Modify: `js/services/pvp-live-session.js`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `tests/sanity_pvp_live_session_checks.mjs`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`
- Modify: `tests/browser_pvp_live_audit.mjs`
- Modify: `tests/browser_pvp_live_real_backend_smoke.mjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`
- Modify: `progress.md`

- [x] **Step 1: Add failing requester-recovery checks**

Covered:

- first requester must enter an explicit `waiting_rematch` phase instead of freezing as a normal `finished` post-match page;
- the old finished review and friendly-series report must remain visible while waiting;
- requester session must expose `pollRematch()` and use `getCurrentMatch()` to discover the accepted friendly match;
- route sanity must prove that after the opponent accepts, the requester can recover the new friendly match through `/api/pvp/live/matches/current`;
- fake browser audit and real backend smoke must cover the requester waiting page auto-entering accepted friendly setup.

Observed red:

```bash
node tests/sanity_pvp_live_session_checks.mjs
node tests/browser_pvp_live_audit.mjs http://127.0.0.1:4174 output/browser-pvp-live-rematch-poll-red
```

Expected and observed: session first failed because `pollRematch` did not exist; browser audit first failed because `PVPScene` polling stopped outside public queue `waiting`, leaving the requester stuck in `waiting_rematch`.

- [x] **Step 2: Implement requester rematch polling**

Implemented:

- `pvp-live-session.requestRematch()` now publishes `phase='waiting_rematch'` for the first requester and keeps `rematchReport` plus the old finished review visible;
- `pvp-live-session.pollRematch()` calls `getCurrentMatch()`, stays in `waiting_rematch` while no accepted friendly match is available, and switches to the new friendly setup/active match when current match changes to `mode='friendly'`;
- `PVPScene` includes `waiting_rematch` in `loadLivePanel()`, `resumeLiveMatch()`, `startLivePolling()`, `refreshLiveMatch()`, phase label, summary, hint, and top action disabling;
- `handleLivePostReviewAction('friendly_rematch')` restarts polling when the requester is waiting, so no manual reload or queue-again workaround is required.

- [x] **Step 3: Extend route, fake-browser, real-browser, and release coverage**

Implemented:

- route sanity checks requester `GET /matches/current` returns the accepted friendly match with source-match linkage;
- fake browser audit validates waiting hint first, then automatic transition into `pvplm-browser-friendly` setup with no legacy PVP calls;
- real backend smoke validates B requester waits, A accepts, B auto-enters accepted friendly setup, then the friendly match can still ready, finish, and queue again;
- release-gate coverage now pins the new session, route, fake browser, and real browser markers.

- [x] **Step 4: Challenger negative hardening**

Implemented:

- `pollRematch()` now requires the current friendly match to carry the expected `friendlySeries.sourceMatchId` and `seriesId`, so a waiting requester cannot be switched into an unrelated friendly match;
- `waiting_rematch` keeps review-only actions available but disables `friendly_rematch`, `queue_again`, `practice`, and `adjust_loadout`, preventing a pending rematch and public waiting queue from coexisting in the same session;
- finished friendly matches no longer expose another `friendly_rematch` CTA, because the server intentionally rejects rematching from a friendly source match;
- settlement/session/fake browser/release coverage pin these negative branches.

Commands run so far:

```bash
node --check js/services/pvp-live-session.js
node --check js/scenes/pvp-scene.js
node --check server/pvp-live/engine/state-view.js
node --check tests/browser_pvp_live_audit.mjs
node tests/sanity_pvp_live_session_checks.mjs
node tests/sanity_pvp_live_settlement_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
npm run build:pages
node tests/browser_pvp_live_audit.mjs http://127.0.0.1:4174 output/browser-pvp-live-rematch-poll-green
node tests/browser_pvp_live_audit.mjs http://127.0.0.1:4174 output/browser-pvp-live-rematch-negative-green
node tests/browser_pvp_live_real_backend_smoke.mjs http://127.0.0.1:4174 output/browser-pvp-live-rematch-negative-real-green
```

Expected and observed: listed commands pass. Full Node/build/browser release verification remains to run after this implementation note.

Remaining before claiming full V10-S3: multi-instance queue strategy, full first-loss deep review, formal AI practice opponent that replays the original PVP tempo, key-turn interactive replay beyond this MVP summary, full friend/Bo3 rematch system beyond the single-match MVP, broader game-feel audit, production smoke, and online deployment.

---

### Task 8Q: Post-Match Player Experience Fairness Report MVP

**Files:**
- Modify: `server/pvp-live/engine/state-view.js`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `css/pvp.css`
- Modify: `tests/sanity_pvp_live_engine_checks.cjs`
- Modify: `tests/sanity_pvp_live_ui_contract_checks.cjs`
- Modify: `tests/browser_pvp_live_audit.mjs`
- Modify: `tests/browser_pvp_live_real_backend_smoke.mjs`
- Modify: `progress.md`

- [x] **Step 1: Add failing player-experience fairness contract**

Covered:

- finished-state post-match review must expose `experienceReport.reportVersion=pvp-live-experience-report-v1`;
- the report must use `sourceVisibility=public_events`, `usesHiddenInformation=false`, and `rankedImpact=none`;
- the report must include public, player-readable fields for `nonGameRisk`, `nonGameRiskReasons`, `agencyLabel`, `decisionWindowCount`, `seatWindowSummary`, `safeguardSummary`, `summary`, and fairness checks;
- required fairness checks include setup readiness, first-action damage budget, opening protection / no-opening-lethal observation, and decision windows;
- every fairness check must include `linkedEvidence` built from sanitized public refs with allowlisted `publicData`;
- the report must not contain raw `payload`, hidden hand/deck/card ids, card instance ids, loadout snapshots, rewards, rating, or ELO fields.

Observed red:

```bash
node tests/sanity_pvp_live_engine_checks.cjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
```

Expected and observed: the engine check first failed because `experienceReport` did not exist; after the server contract passed, the UI contract failed because `getLiveExperienceReport()` and browser audit markers did not exist.

- [x] **Step 2: Implement public experience report projection and UI card**

Implemented:

- `state-view` builds `experienceReport` from sanitized `postMatchReview.evidence`, using only public event type, sequence, acting seat, terminal result, and finish reason;
- `collectReviewEvidence()` keeps a narrow allowlist of public explanatory data such as `firstSeat`, `nextSeat`, `seatId`, `targetSeat`, `protectedSeat`, `preventedDamage`, `hpDamage`, `targetHp`, `winnerSeat`, `loserSeat`, and `finishReason`, while still excluding raw payload and card/loadout identifiers;
- the report summarizes whether the match had setup confirmation, first-action budget evidence, opening-protection / non-opening-lethal observation, and enough public decision windows;
- `seatWindowSummary` uses `battle_started.publicData.firstSeat` and `turn_ended.publicData.nextSeat` rather than raw payloads or terminal-only surrender events, so short-game risk is not overcounted as a real action window;
- each fairness check links back to 1-4 sanitized public event refs through `linkedEvidence`;
- short or suspicious games can be marked `nonGameRisk=watch` without affecting ranked state;
- `PVPScene.getLiveExperienceReport()` white-lists the report payload for UI, snapshot, and `render_game_to_text()`;
- `renderLiveExperienceReport()` renders a compact finished-review card with risk label, agency label, summary, and per-check public details;
- `handleLiveExperienceCheckFocus()` lets each `data-live-experience-check` focus the event panel to `experience_check:{id}` and render only the check's linked public evidence;
- `formatLiveEvent()` reads allowlisted `publicData` for focused post-match evidence, so the UI can explain first seat, next seat, budget, protection, and terminal result without reading raw payload;
- `css/pvp.css` adds experience report layout, risk label, clickable check grid, focused-check styling, status color, and mobile wrapping.

- [x] **Step 3: Extend fake and real browser verification**

Covered:

- fake browser audit verifies experience-report DOM, public source flags, hidden-info flag, check ids, snapshot/text parity, no reward/rating/ELO fields, and no legacy settlement calls;
- fake browser audit clicks `decision_windows` and verifies the event panel focuses linked public evidence without hidden payloads;
- real two-account browser smoke verifies server-generated experience report after surrender, public source flags, linked evidence, check parity, focused public evidence, and no regression in finished review recovery;
- contract checks pin `pvp-live-experience-report-v1`, `linkedEvidence`, `seatWindowSummary`, `safeguardSummary`, `data-live-experience-report`, `experience_check:`, CSS markers, and the new fake / real browser finding names.

- [x] **Step 4: Verify**

Commands run:

```bash
node --check server/pvp-live/engine/state-view.js
node --check js/scenes/pvp-scene.js
node tests/sanity_pvp_live_engine_checks.cjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
npm run build:pages
node tests/browser_pvp_live_audit.mjs http://127.0.0.1:4174 output/browser-pvp-live-experience-report-current
node tests/browser_pvp_live_real_backend_smoke.mjs http://127.0.0.1:4174 output/browser-pvp-live-experience-report-real-current
npm run test:node
env AUDIT_FILTER=pvp-live,pvp-live-real bash tests/run_browser_release_checks.sh http://127.0.0.1:4174 output/release-browser-audits-pvp-live-experience-report-current
```

Expected and observed: all focused commands pass; fake browser audit reports 29/29 findings, real backend smoke reports 21/21 findings with 0 console errors, `npm run test:node` passes, and the filtered browser release gate reports 0 failed findings for `pvp-live` and `pvp-live-real`.

Remaining before claiming full V10-S3: multi-instance queue strategy, full first-loss deep review, formal AI practice opponent that replays the original PVP tempo, key-turn interactive replay beyond this MVP summary, full friend/Bo3 rematch system beyond the single-match MVP, broader game-feel audit, production smoke, and online deployment.

---

### Task 8: Current Match Recovery And Timeout Baseline

**Files:**
- Modify: `server/pvp-live/live-store.js`
- Modify: `server/routes/pvp-live.js`
- Modify: `js/services/backend-client.js`
- Modify: `js/services/pvp-service.js`
- Modify: `js/services/pvp-live-session.js`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`
- Modify: `tests/sanity_pvp_live_client_checks.mjs`
- Modify: `tests/sanity_pvp_live_service_bridge_checks.cjs`
- Modify: `tests/sanity_pvp_live_session_checks.mjs`
- Modify: `tests/sanity_pvp_live_ui_contract_checks.cjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`

- [x] **Step 1: Add failing recovery and timeout tests**

Covered:

- authenticated player can recover their current live match without a queue ticket.
- non-participants and users without active live matches get 404 / idle behavior.
- stale active match finishes by server timeout and emits public `turn_timeout` plus `match_finished(timeout)`.
- timeout releases both players for a new queue.
- frontend client, bridge, session, and UI contracts expose current-match resume without legacy settlement paths.

- [x] **Step 2: Implement server-authoritative recovery and timeout**

Implemented:

- `LivePvpStore.getActiveMatchForUser()` returns a seat-scoped current match view.
- `LivePvpStore.finishMatchByTimeout()` finalizes stale active matches, records public timeout events, advances `stateVersion`, and releases active-match locks.
- `GET /api/pvp/live/matches/current` is mounted before `GET /matches/:matchId`.

- [x] **Step 3: Implement frontend resume path**

Implemented:

- `BackendClient.getCurrentLivePvpMatch()`.
- `PVPService.live.getCurrentMatch()`.
- `pvp-live-session.resumeCurrentMatch()`.
- `PVPScene.loadLivePanel()` attempts current match recovery before rendering idle state.

- [x] **Step 4: Verify**

Commands run:

```bash
node tests/sanity_pvp_live_route_checks.cjs
node tests/sanity_pvp_live_client_checks.mjs
node tests/sanity_pvp_live_service_bridge_checks.cjs
node tests/sanity_pvp_live_session_checks.mjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
```

Expected and observed: all commands pass.

---

### Task 9: SQLite-Backed Live Match Restart Recovery

**Files:**
- Modify: `server/db/database.js`
- Create: `server/pvp-live/live-persistence.js`
- Modify: `server/pvp-live/live-store.js`
- Modify: `server/routes/pvp-live.js`
- Modify: `server/app.js`
- Create: `tests/sanity_pvp_live_persistence_checks.cjs`
- Modify: `tests/run_node_checks.sh`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`
- Modify: `progress.md`

- [x] **Step 1: Add failing restart-recovery test**

Covered:

- start real backend with a temporary `DEFIER_DB_PATH`.
- register two users, match them through `/api/pvp/live`, and submit one accepted intent.
- stop the backend, restart it with the same SQLite DB path, and recover the same current match.
- verify recovered `matchId`, `seatId`, `stateVersion`, HP, and hidden-info projection.
- verify rejoining the queue after restart returns the persisted active match instead of creating a new waiting ticket.

- [x] **Step 2: Add live match persistence**

Implemented:

- `pvp_live_matches` table stores `match_id`, status, A/B user ids, authoritative `state_json`, created / updated / finished timestamps.
- `live-persistence.js` provides `saveMatch()` and `loadActiveMatchForUser()`.
- `LivePvpStore` persists created matches, accepted intents, and timeout finishes.
- `LivePvpStore` hydrates active matches from SQLite for current-match recovery and rejoin protection.
- `server/app.js` attaches SQLite persistence after `initDb()` so lightweight route sanity remains in-memory.

- [x] **Step 3: Gate sync**

Implemented:

- `tests/run_node_checks.sh` runs `sanity_pvp_live_persistence_checks.cjs`.
- `tests/sanity_release_gate_coverage_checks.cjs` pins the same-DB-path restart recovery markers.

- [x] **Step 4: Verify**

Commands run:

```bash
node tests/sanity_pvp_live_route_checks.cjs
node tests/sanity_pvp_live_persistence_checks.cjs
```

Expected and observed: both commands pass.

---

### Task 10: Server-Authoritative Live Settlement

**Files:**
- Modify: `server/db/database.js`
- Create: `server/pvp-live/live-settlement.js`
- Modify: `server/pvp-live/live-store.js`
- Modify: `server/routes/pvp-live.js`
- Modify: `server/app.js`
- Create: `tests/sanity_pvp_live_settlement_checks.cjs`
- Modify: `tests/run_node_checks.sh`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`
- Modify: `progress.md`

- [x] **Step 1: Add failing live settlement test**

Covered:

- start real backend with a temporary `DEFIER_DB_PATH`.
- register two users and initialize their PVP rank/economy records.
- finish a live match through the authoritative `surrender` intent.
- verify the winner and loser both receive rank, economy, and history updates from server-side live state.
- verify duplicate terminal intent does not pay rewards or mutate rank twice.
- verify `pvp_live_match_settlements` stores one match-level idempotency gate and `pvp_match_history` stores both player perspectives exactly once.

Observed red result before implementation:

```bash
node tests/sanity_pvp_live_settlement_checks.cjs
# FAIL: server-authoritative live settlement should add winner rank win
```

- [x] **Step 2: Add live settlement service**

Implemented:

- `pvp_live_match_settlements` table stores match id, winner/loser user ids, seats, finish reason, both rating deltas, both score-after values, both rewards, payload, and created timestamp.
- `live-settlement.js` parses the latest `match_finished` event, maps seats to users, computes Elo and rewards with the existing PVP formula, and updates both `pvp_ranks` and `pvp_economy`.
- live settlement writes both perspectives to `pvp_match_history` with `live:${matchId}:${userId}` ticket ids.
- match-level settlement is guarded by a SQLite transaction and the `pvp_live_match_settlements` primary key.
- live table and settlement migration statements now propagate initialization errors instead of relying only on the final index callback.

- [x] **Step 3: Hook settlement into live store**

Implemented:

- `LivePvpStore` accepts an injected settlement service.
- accepted intents and timeout sweeps that finish a match call `settleFinishedMatch()` after persisting the finished match.
- `server/app.js` attaches both SQLite persistence and SQLite settlement after `initDb()`.
- `server/routes/pvp-live.js` keeps `__attachPersistence()` and adds service injection helpers so route sanity can remain in-memory.
- finished matches are released from active matchmaking only after settlement succeeds; if settlement throws, current-match recovery, exact match reads, duplicate terminal intents, and queue re-entry can retry the finished-but-unsettled match.
- `PVP_LIVE_TURN_TIMEOUT_MS` allows focused integration tests to trigger timeout settlement without waiting for the production 90s default.

- [x] **Step 4: Gate sync and verify**

Implemented:

- `tests/run_node_checks.sh` runs `sanity_pvp_live_settlement_checks.cjs`.
- `tests/sanity_release_gate_coverage_checks.cjs` pins live settlement rank/economy/history, idempotency, timeout settlement, and transient-failure retry markers.

Commands run:

```bash
node --check server/pvp-live/live-settlement.js
node --check server/pvp-live/live-persistence.js
node --check server/pvp-live/live-store.js
node --check server/routes/pvp-live.js
node --check server/db/database.js
node --check server/app.js
node --check tests/sanity_pvp_live_settlement_checks.cjs
node tests/sanity_pvp_live_settlement_checks.cjs
```

Expected and observed: all commands pass.

---

### Task 5: Live Session Controller

**Files:**
- Create: `js/services/pvp-live-session.js`
- Create: `tests/sanity_pvp_live_session_checks.mjs`
- Modify: `tests/run_node_checks.sh`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`

- [x] **Step 1: Add failing session controller test**

Covered:

- session starts idle.
- join queue enters waiting.
- queue poll enters matched.
- refresh match enters active.
- submit intent injects current `stateVersion`.
- session state does not expose opponent hand.
- no `reportResult` API exists.
- missing queue ticket fails locally.
- legacy `findOpponent` and `reportMatchResult` are not called.

- [x] **Step 2: Implement session controller**

Implemented:

- no-DOM ESM module.
- injectable live service.
- state snapshot getter.
- queue / match / intent methods.
- local error state.
- `sync_required`, `rejected`, `finished`, and active phase mapping.

- [x] **Step 3: Add gate coverage**

Implemented:

- session check added to `tests/run_node_checks.sh`.
- release-gate coverage pins session isolation markers.

- [x] **Step 4: Verify**

Commands run:

```bash
node tests/sanity_pvp_live_session_checks.mjs
node tests/sanity_release_gate_coverage_checks.cjs
npm run test:node
npm run build:pages
```

Expected and observed: all commands pass.

---

### Task 4: Live Frontend Client Contract

**Files:**
- Modify: `js/services/backend-client.js`
- Modify: `js/services/pvp-service.js`
- Create: `tests/sanity_pvp_live_client_checks.mjs`
- Create: `tests/sanity_pvp_live_service_bridge_checks.cjs`
- Modify: `tests/run_node_checks.sh`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`

- [x] **Step 1: Add failing BackendClient contract test**

Covered:

- `BackendClient` exposes `joinLivePvpQueue`, `getLivePvpQueueStatus`, `getLivePvpMatch`, and `submitLivePvpIntent`.
- live paths use `/api/pvp/live/*`.
- live intent payload contains only `intentId`, `intentType`, `stateVersion`, and `payload`.
- live client must not call legacy `/api/pvp/match/result`.
- logged-out live calls fail locally.

- [x] **Step 2: Implement live BackendClient methods**

Implemented:

- queue join.
- queue status polling.
- match state fetch.
- intent submission.
- input trimming / encoding / local missing-id rejection.

- [x] **Step 3: Add failing PVPService bridge test**

Covered:

- `PVPService.live` exposes only live queue / match / intent methods.
- no `reportResult` client result API exists.
- bridge forwards to `BackendClient` live methods only.
- bridge does not call `reportPvpMatchResult`.

- [x] **Step 4: Implement live PVPService bridge**

Implemented:

- `PVPService.live` namespace.
- backend readiness guard.
- no rank, reward, history, or season write side effects.

- [x] **Step 5: Add gate coverage**

Implemented:

- live client and bridge checks added to `tests/run_node_checks.sh`.
- release-gate coverage now pins live client/bridge checks and `/api/pvp/live/*` isolation markers.

- [x] **Step 6: Verify**

Commands run:

```bash
node tests/sanity_pvp_live_client_checks.mjs
node tests/sanity_pvp_live_service_bridge_checks.cjs
node tests/sanity_release_gate_coverage_checks.cjs
npm run test:node
npm run build:pages
```

Expected and observed: all commands pass.

---

### Task 3: Challenger Fixes And Negative Coverage

**Files:**
- Modify: `server/pvp-live/engine/reducer.js`
- Modify: `server/pvp-live/live-store.js`
- Modify: `tests/sanity_pvp_live_engine_checks.cjs`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`

- [x] **Step 1: Reproduce challenger P0 findings**

Added failing assertions for:

- one accepted intent must emit unique ordered event sequences.
- a user with an active live match must not re-enter the waiting queue.
- a duplicate lethal intent must remain idempotent after match finish.

- [x] **Step 2: Fix reducer sequencing and terminal idempotency**

Implemented:

- event sequence assignment uses the pending event list offset.
- duplicate intent lookup happens before `match_not_active`, so terminal retries remain idempotent.
- new intents after match finish still return `match_not_active`.

- [x] **Step 3: Fix active match rejoin**

Implemented:

- live store tracks active match by user id.
- queue join returns the existing matched result when the user already has an active live match.

- [x] **Step 4: Add turn-flow and access-control coverage**

Covered:

- `end_turn` switches seat and advances state version.
- wrong seat action returns `not_current_turn`.
- non-participant cannot read match state.
- another user cannot read a queue ticket.
- route-level turn-flow rejects seat A after A has ended turn.

- [x] **Step 5: Verify final gate**

Commands run:

```bash
node tests/sanity_pvp_live_engine_checks.cjs
node tests/sanity_pvp_live_route_checks.cjs
npm run test:node
npm run build:pages
```

Expected and observed: all commands pass.

---

### Task 6: Cancel Queue And Surrender Lifecycle

**Files:**
- Modify: `server/pvp-live/engine/reducer.js`
- Modify: `server/pvp-live/live-store.js`
- Modify: `server/routes/pvp-live.js`
- Modify: `js/services/backend-client.js`
- Modify: `js/services/pvp-service.js`
- Modify: `js/services/pvp-live-session.js`
- Modify: `tests/sanity_pvp_live_engine_checks.cjs`
- Modify: `tests/sanity_pvp_live_route_checks.cjs`
- Modify: `tests/sanity_pvp_live_client_checks.mjs`
- Modify: `tests/sanity_pvp_live_service_bridge_checks.cjs`
- Modify: `tests/sanity_pvp_live_session_checks.mjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`

- [x] **Step 1: Add failing lifecycle tests**

Covered:

- waiting queue ticket can be cancelled by its owner.
- cancelled queue ticket no longer returns status.
- live client exposes `cancelLivePvpQueue()`.
- `PVPService.live` exposes `cancelQueue()` without adding a `reportResult` surface.
- session controller supports `cancelQueue()` and returns to idle.
- session controller supports `surrender()` through the existing intent envelope.
- reducer accepts `surrender`, emits `player_surrendered` and `match_finished`, and moves state to `finished`.
- finished match releases both participants so a player can queue again.
- matched queue ticket is consumed after the first successful matched poll.
- finished match clears unpolled matched queue tickets.
- another user cannot cancel an owner queue ticket.
- matched queue ticket cannot be cancelled as a waiting ticket.
- `sync_required` keeps the latest authoritative `stateView` in the session state.
- expired queue ticket polling leaves waiting state and clears the session ticket.

- [x] **Step 2: Implement queue cancellation**

Implemented:

- `POST /api/pvp/live/queue/cancel` route.
- `liveStore.cancelQueue()` owner and waiting-state validation.
- frontend `BackendClient.cancelLivePvpQueue()`, `PVPService.live.cancelQueue()`, and session `cancelQueue()`.

- [x] **Step 3: Implement surrender and terminal release**

Implemented:

- reducer-level `surrender` intent.
- public `player_surrendered` and `match_finished` events.
- active-match release when match status becomes `finished`.
- pending matched queue ticket cleanup when match status becomes `finished`.
- session `surrender()` helper that submits `{ intentType: 'surrender' }`.

- [x] **Step 4: Implement pending ticket and sync follow-up**

Implemented after challenger review:

- matched queue status reads are one-shot; the first successful matched poll consumes the pending queue ticket.
- `clearPendingResultsForMatch()` removes unpolled matched tickets when a match finishes.
- `sync_required` session handling now stores `result.stateView` so the UI can render or refresh from the authoritative server view.
- route sanity covers wrong-user cancel, matched-ticket cancel rejection, matched-ticket consumption, and terminal cleanup of unpolled tickets.

- [x] **Step 5: Fix expired-ticket session race**

Implemented after final challenger review:

- `pollQueue()` now treats explicit 404 / missing queue ticket responses as `queue_ticket_expired`.
- expired queue ticket polling exits `waiting`, clears `queueTicket`, clears stale match state, and keeps a terminal error reason for UI.
- session sanity covers the case where the server clears an unpolled matched ticket before the first player polls it.

- [x] **Step 6: Extend release-gate coverage**

Implemented:

- `tests/sanity_release_gate_coverage_checks.cjs` now pins the live cancel route, client cancel method, session cancel behavior, session surrender behavior, queue ticket lifecycle markers, expired-ticket session handling, and `sync_required` state-view handling.
- live checks remain isolated from legacy `didWin`, `matchTicket`, `reportResult`, and `/api/pvp/match/result`.

- [x] **Step 7: Verify**

Commands run:

```bash
node tests/sanity_pvp_live_engine_checks.cjs
node tests/sanity_pvp_live_route_checks.cjs
node tests/sanity_pvp_live_client_checks.mjs
node tests/sanity_pvp_live_service_bridge_checks.cjs
node tests/sanity_pvp_live_session_checks.mjs
node tests/sanity_release_gate_coverage_checks.cjs
npm run test:node
npm run build:pages
```

Expected and observed: all commands pass.

---

### Task 7: Minimal Playable Live PVP UI

**Files:**
- Modify: `index.html`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `js/game.js`
- Modify: `css/pvp.css`
- Create: `tests/sanity_pvp_live_ui_contract_checks.cjs`
- Create: `tests/browser_pvp_live_audit.mjs`
- Modify: `tests/run_node_checks.sh`
- Modify: `tests/run_browser_release_checks.sh`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`

- [x] **Step 1: Add failing UI contract and browser audit**

Covered:

- PVP screen has a dedicated `live` tab and stable `data-live-*` hooks.
- live UI exposes queue, match, seat, state version, current seat, public state, own hand, opponent public info, and event log.
- `PVPScene` exposes live methods for queueing, cancellation, refresh, card intent, end turn, surrender, and snapshot export.
- live UI methods must not call `findOpponent`, `reportMatchResult`, `startPVPBattle`, `GhostEnemy`, `pvpMatchTicket`, or `didWin`.
- browser audit patches legacy PVP methods to throw and verifies the live UI still works.

- [x] **Step 2: Implement live tab and scene controller**

Implemented:

- `index.html` adds `PVPScene.switchTab('live')` navigation and `#tab-live` panel.
- `PVPScene` creates a `pvp-live-session` instance and renders live state into the panel.
- live actions call `PVPService.live` through the session controller only.
- `render_game_to_text()` exposes `pvp.live` for audit and future tooling.

- [x] **Step 3: Add responsive styling**

Implemented:

- desktop live status card, duel panels, hand card buttons, event log, and action bar.
- mobile live layout keeps metadata, panels, cards, and actions inside viewport.
- mobile PVP nav wraps into two columns so the fourth live tab does not overflow.

- [x] **Step 4: Add browser verification**

Implemented:

- `tests/browser_pvp_live_audit.mjs` verifies join queue, matched state, hidden opponent hand, play-card intent, surrender intent, old-path isolation, desktop screenshot, and mobile viewport layout.
- `tests/run_browser_release_checks.sh` adds `pvp-live` filtered audit.
- release-gate coverage pins live UI browser and Node markers.

- [x] **Step 5: Final challenger fixes**

Implemented:

- PVP back button calls `PVPScene.stopLivePolling()` before returning to the main menu.
- `submitLiveCard()` targets `stateView.opponent.seatId`, with a self-seat fallback, so player B card intents target A.
- mobile `#pvp-screen` allows vertical scrolling, live panel uses `scroll-margin-top`, and browser audit scrolls the PVP screen container explicitly.
- browser audit now verifies player B target selection and mobile top / bottom reachability.

- [x] **Step 6: Verify**

Commands run:

```bash
node --check js/scenes/pvp-scene.js
node --check tests/browser_pvp_live_audit.mjs
node tests/sanity_pvp_live_ui_contract_checks.cjs
npm run build:pages
node tests/browser_pvp_live_audit.mjs http://127.0.0.1:4174 output/web-pvp-live-audit-current
AUDIT_FILTER=pvp-live bash tests/run_browser_release_checks.sh http://127.0.0.1:4174 output/release-browser-audits-pvp-live-current
```

Expected and observed: all commands pass.
