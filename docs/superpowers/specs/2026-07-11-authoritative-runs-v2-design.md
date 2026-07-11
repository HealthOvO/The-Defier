# Authoritative Runs V2 Design

## 1. Decision

The Defier will add a new, fully playable server-authoritative run slice for PVE,
challenge, and expedition. The legacy game runtime remains available and keeps its
current `client_observed` / `server_verified` progression boundary. It is not
relabeled as authoritative because its map, battle, reward, and DOM-coupled random
state cannot currently be replayed by the backend.

The new slice is exposed in the Season Office as **Authoritative Trials**. The
browser submits commands only. The backend owns the seed, map choices, deck order,
enemy intent, damage, rewards, terminal result, and progression settlement.

## 2. Player Experience

Each mode is a short deterministic deck-building run with three encounters:

- `pve`: balanced route, readable enemies, broad reward choices.
- `challenge`: lower health and a turn budget, with a higher score multiplier.
- `expedition`: stronger sustain and route recovery, with tougher late encounters.

The core loop is:

1. Choose one of two server-generated route nodes.
2. Read the enemy's next intent.
3. Play cards from the server-projected hand.
4. End the turn and receive the deterministic enemy response.
5. Choose one of three server-generated rewards.
6. Defeat the boss, review the server score, and settle the run.

No enemy can kill a full-health player on the opening response. Enemy intent is
visible before the player commits a turn. Random outcomes are deterministic and
replayable. Network failure never advances the local state optimistically.

## 3. Authority Boundary

### Server-owned

- run identifier, owner, content version, content hash, and expiry;
- secret seed and RNG counter;
- route generation and encounter selection;
- card instances, deck order, draw/discard piles, energy, health, and block;
- enemy health, block, statuses, intent, and turn execution;
- reward options and reward application;
- state version, action sequence, hash chain, snapshots, and terminal summary;
- settlement receipt and the single `server_authoritative` progression event.

### Client-owned

- mode selection;
- route-node choice from the currently projected choices;
- card selection from the currently projected hand;
- explicit end-turn, reward choice, abandon, resume, and settle commands.

The client never sends state, damage, health, card definitions, rewards, score, RNG,
or completion claims.

## 4. Protocol

Protocol version: `authoritative-run-v2`

Content version: `authoritative-trials-v1`

Mutating requests require JWT authentication and session-integrity signatures.

### Routes

- `POST /api/progression/authoritative-runs`
- `GET /api/progression/authoritative-runs/current?mode=<mode>`
- `GET /api/progression/authoritative-runs/:runId`
- `POST /api/progression/authoritative-runs/:runId/actions`
- `POST /api/progression/authoritative-runs/:runId/settle`
- `GET /api/progression/authoritative-runs/:runId/replay`
- `GET /api/progression/ops/authoritative-runs`
- `POST /api/progression/ops/authoritative-runs/retention`

### Begin request

```json
{
  "clientRunId": "ar-client-...",
  "mode": "pve",
  "contentVersion": "authoritative-trials-v1"
}
```

One active run per account and mode is allowed. Reusing the same `clientRunId` with
the same mode is idempotent. Reusing it with different data is a conflict. Starting
another run while one is active returns the resumable authoritative projection.

### Action request

```json
{
  "runId": "arun-...",
  "actionId": "ar-action-...",
  "expectedVersion": 7,
  "command": "play_card",
  "payload": { "cardInstanceId": "card-12" }
}
```

Supported commands are `select_node`, `play_card`, `end_turn`, `choose_reward`, and
`abandon`. Payloads are strict allowlists. Unknown keys, client-provided random data,
state, reward, score, or result fields are rejected.

`actionId` is globally unique. Reusing it in the same run with identical canonical
input returns the original receipt. Reusing it with different input or another run
is rejected. New commands require an exact `expectedVersion` match.

### Settlement request

```json
{
  "runId": "arun-...",
  "mutationId": "ar-settle-...",
  "expectedVersion": 31
}
```

Settlement succeeds only when a full replay from the genesis snapshot reaches the
stored completed state with identical state hash and chain head. It inserts one
progression event containing server-computed battle wins, boss wins, and activity
completion. A unique run receipt makes retries idempotent.

## 5. Deterministic Engine

The engine is a pure CommonJS module with no database, clock, network, DOM, or global
state access. Its inputs are a canonical state, immutable catalog snapshot, and one
normalized command. Its output is a new canonical state plus public events.

RNG uses SHA-256 over `(seed, counter)`. Every random draw increments the counter in
canonical state. Shuffle, route selection, reward options, and any future random
effect use this one stream.

The canonical phases are:

- `route`
- `battle`
- `reward`
- `completed`
- `defeated`
- `abandoned`

The projection exposes only information the player is allowed to know. The secret
seed, RNG counter, draw-pile order, future route pools, and internal content snapshot
are never returned.

## 6. Integrity Chain

Every canonical JSON value uses recursively sorted object keys. SHA-256 is used for
payload, state, content, action, and receipt hashes.

The genesis chain head binds:

- protocol version;
- run ID and account ID;
- content hash;
- initial state hash.

Each accepted action binds:

- run ID;
- sequence and expected version;
- command and payload hash;
- previous chain head;
- resulting state hash.

The run row stores the latest state hash and chain head. Action rows are append-only.
Snapshots are written at sequence zero, every eight actions, and every terminal
transition.

## 7. Recovery

Normal reads validate the current state hash. Mutations additionally validate the
latest sequence and chain head. If the denormalized run state is damaged, recovery
loads the newest valid snapshot and replays subsequent actions while checking every
payload hash, previous hash, action hash, and result-state hash.

Settlement always performs a full genesis replay. A broken journal cannot be
settled. Recovery and integrity failures write sanitized operational events and
counters.

## 8. SQLite V6

Migration `0006_authoritative_runs_v2` adds:

- `progression_authoritative_run_catalogs`
- `progression_authoritative_runs`
- `progression_authoritative_run_actions`
- `progression_authoritative_run_snapshots`
- `progression_authoritative_run_receipts`
- `progression_authoritative_run_ops_events`
- `progression_authoritative_run_ops_counters`

Catalog rows are immutable and content-hash checked at startup. A partial unique
index enforces one active run per account and mode. Foreign keys are retained for
schema intent, while retention performs explicit child-first deletion for safety on
legacy SQLite configurations.

## 9. Limits

- maximum 256 accepted actions per run;
- maximum 2 KiB canonical action payload;
- maximum 64 KiB canonical state;
- 24-hour run lifetime;
- snapshot interval of eight actions;
- one active run per account and mode;
- retention defaults to 30 days and cannot be set below seven days.

## 10. Compatibility

Legacy PVE, challenge, and expedition continue to emit their current observed and
verified-envelope events. They do not silently fall back into authoritative runs.
Authoritative-run failures remain explicit and resumable. Only V2 receipts use
`trust_tier = server_authoritative` for these three modes.

The progression status boundary is updated to list all four modes as capable of
server-authoritative settlement while continuing to describe legacy compatibility.

## 11. Verification

Required evidence before merge:

- engine unit, golden replay, and deterministic/property simulations;
- schema V6 fresh-start, upgrade, and concurrent-start tests;
- HTTP auth, signature, ownership, idempotency, stale version, cross-run replay,
  payload injection, expiry, abandon, settlement, and retention tests;
- corrupted denormalized state recovery and corrupted journal settlement refusal;
- concurrent action and concurrent settlement tests;
- frontend client one-way authority and account-churn tests;
- real browser login, start, route, battle, reward, refresh/resume, completion, and
  settlement on desktop and mobile;
- full Node, build, browser release, structural report, and screenshot gates;
- final independent challenger review.

Production deployment is explicitly out of scope.
