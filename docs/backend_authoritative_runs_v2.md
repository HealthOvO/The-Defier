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
