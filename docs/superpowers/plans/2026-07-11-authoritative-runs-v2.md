# Authoritative Runs V2 Implementation Plan

## Phase 1: Contract and engine

1. Add canonical JSON/hash helpers and immutable catalog content.
2. Implement deterministic RNG, initial-state creation, command normalization,
   reducer, public projection, and replay helpers.
3. Add engine tests, golden fixtures, and seeded simulations for all three modes.

Exit criteria: identical seed plus command journal produces byte-identical canonical
state and hashes; no public projection exposes hidden state.

## Phase 2: Persistence and service

1. Add the V6 schema bootstrap and migration metadata.
2. Implement begin, current/get, action, settle, replay, recovery, ops overview, and
   retention services with `BEGIN IMMEDIATE` mutation transactions.
3. Insert exactly one server-authoritative progression event per settled run.
4. Add route wiring, signed payload enforcement, error mapping, and payload limits.

Exit criteria: cross-account access is hidden, duplicate commands and settlements
are idempotent, stale writers lose cleanly, and settlement requires full replay.

## Phase 3: Browser client

1. Add BackendClient methods for every public route.
2. Add a one-way authoritative session service. It may cache a run anchor and
   mutation IDs, but never predicts canonical state.
3. Add the Authoritative Trials tab to the Season Office with PVE, challenge, and
   expedition selectors; route, battle, reward, terminal, retry, resume, settle,
   and abandon states; and mobile layout.
4. Update authority-boundary copy without claiming legacy runs are authoritative.

Exit criteria: a player can complete and settle all three modes through the real UI,
and refresh/reconnect resumes the server state without local divergence.

## Phase 4: Adversarial verification

1. Add V6 migration and service API tests.
2. Add concurrent action, duplicate action, cross-run action replay, concurrent
   settlement, corrupt state recovery, corrupt journal refusal, expiry, and
   retention tests.
3. Add frontend service tests for account churn, stale response suppression,
   request retry, and no optimistic fallback.
4. Add a focused real-backend Playwright smoke and include it in release gates.
5. Run full Node, build, browser release, and structural report checks.

Exit criteria: all tests pass from a clean database and an upgraded V5 database.

## Phase 5: Closure

1. Update backend architecture, migration, and player-facing documentation.
2. Run two independent reviews: security/integrity and gameplay/client experience.
3. Fix findings, rerun affected tests, then rerun the full release gate.
4. Commit the feature branch, merge it into `main`, and push both required refs.

No SSH, rsync, systemd, production API mutation, or production deployment is allowed.
