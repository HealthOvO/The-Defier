# Backend Authoritative Runs V2

## Purpose

Authoritative Runs V2 is the first non-PVP flow in The Defier where the backend owns
the complete playable result. It is intentionally separate from legacy run
verification: V1 validates an account-bound envelope around client observations;
V2 executes a deterministic game state and mints progression only after replay.

## Trust levels

| Flow | Trust tier | Meaning |
| --- | --- | --- |
| Legacy offline PVE/challenge/expedition | `client_observed` | Rate-limited telemetry and basic progression only |
| Legacy signed verified run | `server_verified` | Account-bound envelope; no server combat replay |
| Authoritative Trial V2 | `server_authoritative` | Server state machine and full journal replay |
| Live PVP | `server_authoritative` | Server match engine and settlement |

## Runtime modules

- `server/progression/authoritative-runs/canonical.js`: canonical serialization and hashing.
- `server/progression/authoritative-runs/catalog.js`: immutable cards, enemies, and scenarios.
- `server/progression/authoritative-runs/engine.js`: pure reducer and public projection.
- `server/progression/authoritative-runs/bootstrap.js`: V6 schema and catalog bootstrap.
- `server/progression/authoritative-runs/service.js`: persistence, recovery, settlement, and ops.
- `server/routes/progression.js`: authenticated HTTP surface.

## Operational guarantees

- every mutation is account-bound, signed, sequenced, and idempotent;
- all accepted actions form an append-only SHA-256 chain;
- the current state is a rebuildable cache of snapshots plus actions;
- terminal settlement performs a full replay from sequence zero;
- a settlement writes one unique authoritative progression event;
- operational views expose aggregate counts and hashed account references, not
  secret seeds, tokens, card order, raw action payloads, or full state JSON;
- retention deletes only terminal history older than its configured threshold.

## S108 deck crafting contract

`authoritative-trials-v4` keeps protocol `authoritative-run-v2` and canonical state
schema 2. New runs store `upgraded: false` on each card instance; historical v1-v3
states remain byte-for-byte unchanged and treat the missing field as unupgraded.

After a non-final encounter, the server deterministically creates the complete reward
market from canonical state and the immutable catalog. The client still submits only
`rewardId`; it cannot choose or forge a target instance. A normal market contains two
distinct card offers, one exact upgrade offer, and one contextual utility offer:

- low life produces a heal offer;
- healthy runs before the trim window, or decks at their trim boundary, receive max HP;
- healthy runs after encounter two may remove one server-selected basic card.

Only baseline numeric cards and finishers have upgrade overlays. Draw, energy-cycle,
and vulnerability multipliers do not. Trimming is limited to `strike` and `guard`, at
most twice per run, never below eight cards, two direct-damage cards, or two block
cards. Upgrade and remove rewards retain the target card instance ID in the canonical
choice and action receipt so duplicate card definitions remain unambiguous.

The current reducer keeps the legacy three-choice reward algorithm behind the absence
of `deckCrafting.version = 1`. This branch is required for old catalog replay: adding
`upgraded: false`, new event fields, or new RNG calls to a v1-v3 action would invalidate
the stored state hash and action chain.

## S109 route risk and reward contract

`authoritative-trials-v5` keeps protocol `authoritative-run-v2` and canonical state
schema 2. It adds `routeContracts.version = 1` without rewriting the immutable v1-v4
catalog rows. The reducer now binds each offered node to one of three readable contracts:

| Contract | Pressure | Build reward | Completion score |
| --- | --- | --- | --- |
| `steady` / 稳进 | baseline enemy HP and intent | baseline market | no route bonus |
| `contested` / 争衡 | 112.5% HP, attack/block intent +1 | heal/max-HP utility +1 | +25 |
| `perilous` / 险锋 | 125% HP, attack/block intent +2 | one extra card candidate, heal +3, max HP +2 | +55 |

The complete coefficients stay in canonical server state. Public route, battle, reward,
history, and settlement projections expose only the contract label, risk and difficulty
tier, readable pressure/reward summaries, and score premium. They never expose the
private `enemyAdjustments` or `rewardAdjustments` objects. A command also fails closed
when its canonical state and loaded content snapshot versions differ.

Non-final encounters carry the selected contract into the exact reward market. Final
settlement adds `scoreBreakdown` and `routeResolution` while preserving the existing
top-level score and progression fields consumed by challenge ladder, world rift, relay
expedition, and fate chronicle. The route premium enters before the scenario multiplier,
and only contracts on completed encounters contribute.

The compatibility branch is selected by the immutable catalog, not by the current
application version. A v4 snapshot has no `routeContracts`, so its route generation,
RNG calls, intents, rewards, events, summaries, final hashes, and replay remain unchanged.
The engine gate pins the original v4 PVE, challenge, and expedition golden hashes, and
the migration gate preserves v1-v4 catalog rows while bootstrapping v5 as a new row.

`sanity_authoritative_route_balance_checks.cjs` runs 64 shared seeds for lower-pressure,
middle-pressure, and higher-pressure decisions across PVE, challenge, expedition,
relay vanguard, and a five-encounter fate chronicle. The gate requires a monotonic score
premium and turn-cost ladder, a visible damage cost, bounded actions, and a real
challenge completion-rate tradeoff instead of a cosmetic risk label.

## S111 fate chronicle chapter branches

`authoritative-trials-v6` keeps protocol `authoritative-run-v2`, canonical state schema 2,
and the existing `select_node` command. It adds three fate chronicle scenarios with a
single authored branch point: `chronicle-ember-proof`, `chronicle-mirror-audit`, and
`chronicle-rift-seal`. Each branch choice changes the current encounter, later enemy
pool and route-contract pair, plus the reward card pool and deck-crafting priorities.
It does not add a client-authored event, permanent account power, or a second progress
ledger.

The canonical route stores the selected `chapterBranch`. Public route choices, battle,
reward, history, and terminal summary expose only `branchId`, title, description,
counterplay, build focus, and the readable consequence. Internal reward pools, reward
profiles, future-stage overrides, enemy coefficients, and reward coefficients remain in
the immutable server catalog. Replay resolves those internal rules from the run's stored
content version, so the selected branch remains deterministic without copying private
configuration into the projection.

Catalog v1-v5 rows remain immutable. Runs created with those snapshots have no
`branchPlan`, retain their original RNG calls and projection shape, and replay through the
same schema-2 reducer. V6 is inserted as a new catalog row and never rewrites a v5 run.

## S112 combat tactics and persistent enemy guard

`authoritative-trials-v7` keeps protocol `authoritative-run-v2`, canonical state schema 2,
and the existing command set. The optional `combatTactics.version = 1` block enables three
public counterplay questions without adding a page, currency, or account-level power:

- `attack` asks the player to establish a visible block threshold before the intent resolves.
- `fortify` asks the player to deal a visible damage threshold before the enemy guard forms.
- `defend_attack` requires both damage and block, so mixed hands have a real use case.

The battle projection exposes the tactic title, exact requirements, current progress, and
the exact damage or block reduction earned on success. Failure adds no hidden punishment;
the advertised enemy intent resolves at its base value. Every resolved question emits an
`enemy_tactic_resolved` receipt, updates bounded success counters, and contributes to the
terminal `combatTactics` summary.

V7 also fixes the enemy guard lifecycle. Block created by `fortify` or `defend_attack`
persists through the following player turn, absorbs card damage, and expires immediately
before the next enemy intent resolves. The server clears the old guard before applying the
new intent, so guard neither disappears before it matters nor stacks across unrelated enemy
turns. `warding_stride` provides conditional block against attacking intents, while
`sealbreaker` provides conditional damage only when enemy guard is already present; both
cost at least one energy and enter the existing reward pool rather than a new progression
track.

The lifecycle branch is gated entirely by the stored content snapshot. V1-V6 catalogs have
no `combatTactics` block, so their canonical state, public projection, RNG calls, enemy block
expiry, journal replay, and hashes retain the historical behavior. Migration checks preserve
distinct v5 and v6 catalog rows byte-for-byte while concurrent startup inserts exactly one v7
row. The tactic balance gate runs 24 fixed seeds across three contracts and three representative
scenarios, while the route gate remains tactic-aware and keeps every sample within the action
budget.

## Failure model

- Network failure: the client keeps the last confirmed projection and retries with
  the same mutation ID.
- Stale version: the server returns the current projection; the client refreshes and
  asks the player to act again.
- Process crash: the transaction either commits the run/action/snapshot together or
  rolls back. A later read resumes the committed version.
- Denormalized state corruption: replay from the newest valid snapshot repairs it.
- Journal corruption: the run is readable for diagnosis but cannot settle.
- Expiry: the run becomes terminal without progression credit.

## Security notes

The seed and canonical state are server-private. Public state is an explicit
projection, never a redacted copy of the storage object. Mutation payloads use
command-specific allowlists. Unknown fields are rejected so a client cannot smuggle
health, damage, reward, random, score, phase, or completion data into the reducer.

## Local verification

The feature is covered by dedicated engine, platform, client, browser, and release
gate checks. Production deployment is a separate manual operation and is not part
of this implementation goal.
