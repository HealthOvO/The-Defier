const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const game = read('js/game.js');
const saveManager = read('js/managers/SaveManager.js');
const runManager = read('js/managers/RunManager.js');
const challengeHub = read('js/core/challenge_hub.js');
const expeditionHub = read('js/core/expedition_hub.js');
const progressionClient = read('js/services/progression-service.js');
const backendClient = read('js/services/backend-client.js');
const progressionRoute = read('server/routes/progression.js');
const verifiedRuns = read('server/progression/verified-runs.js');
const database = read('server/db/database.js');
const schemaStatus = read('server/services/platform/schema-status.js');

[
  'startVerifiedProgressionRun',
  'submitVerifiedRunCheckpoint',
  'settleVerifiedProgressionRun',
  '/verified-runs/tickets',
  '/checkpoints',
  '/settle'
].forEach(needle => {
  assert(backendClient.includes(needle), `backend client should expose verified run marker: ${needle}`);
});

[
  'verifiedStoragePrefix',
  'buildMapSnapshotHash',
  'createStableSourceRef',
  'enqueueVerifiedOperation',
  'flushVerifiedQueueForKey',
  'progression_run_account_changed',
  'verified_run_signature_required'
].forEach(needle => {
  assert(progressionClient.includes(needle), `progression client should retain verified queue marker: ${needle}`);
});

assert(game.includes('this.progressionRunId'), 'game should own a stable base progression run id');
assert(game.includes('progressionRunOwnerUserId'), 'game should bind the base run to the creating account');
assert(game.includes('restoreProgressionRunIdentity'), 'cross-account save restore should fork the base progression run');
assert(game.includes('isProgressionOwnerCompatible'), 'side-mode restore should validate account ownership');
assert(game.includes("`${baseProgressionRun.runId}:realm:${currentRealm}`"), 'PVE should scope tickets per realm');
assert(game.includes('verificationContext'), 'battle receipts should include fixed run context');
const battleWonBlock = game.slice(game.indexOf('async onBattleWon'), game.indexOf('const endlessMods', game.indexOf('async onBattleWon')));
assert(battleWonBlock.includes('ProgressionService.recordBattleWin'), 'battle wins should enqueue observed + verified checkpoints');
assert(!battleWonBlock.includes("mode: 'pve'\n"), 'battle callback must not settle PVE before map completion');

assert(saveManager.includes('progressionRun:'), 'save payload should persist progression run identity');
assert(saveManager.includes('ownerUserId'), 'save payload should persist run account binding');
assert(runManager.includes('ProgressionService.recordActivityCompleted'), 'realm completion should settle PVE after boss node completion');
assert(runManager.includes("reason: 'realm_clear'"), 'PVE settlement should carry the realm clear predicate');
assert(runManager.includes('progressionSuppressPveRealmCompletion'), 'hub wrappers should be able to suppress accidental PVE settlement');

['runId', 'ownerUserId', 'saveSlot'].forEach(needle => {
  assert(challengeHub.includes(needle), `challenge run should persist ${needle}`);
  assert(expeditionHub.includes(needle), `expedition run should persist ${needle}`);
});
assert(challengeHub.includes('challengeMode'), 'challenge settlement should bind its rotation mode');
assert(challengeHub.includes('seedSignature'), 'challenge ticket context should snapshot seed signature');
assert(expeditionHub.includes('currentSaveSlot'), 'expedition persistence should isolate save slots');
assert(expeditionHub.includes('expeditionState:'), 'expedition persistence should use a versionable wrapper');
assert(challengeHub.includes('ownerCompatible'), 'challenge restore should reject another account state');
assert(expeditionHub.includes('ownerCompatible'), 'expedition restore should reject another account state');

[
  'issueVerifiedRunTicket',
  'recordVerifiedRunCheckpoint',
  'settleVerifiedRun',
  'getSignedBusinessPayload',
  'verified_run_ticket_mismatch'
].forEach(needle => {
  assert(progressionRoute.includes(needle), `verified route should pin signed contract marker: ${needle}`);
});

[
  "BEGIN IMMEDIATE",
  'nonce_hash',
  'progression_verified_run_receipts',
  'upsertVerifiedProgressionEvent',
  "trustTier: VERIFIED_TRUST_TIER",
  "VERIFIED_AUTHORITY_LEVEL = 'verified_envelope'",
  "VERIFIED_TRUST_TIER = 'server_verified'",
  'run_ticket_expired',
  'run_already_settled',
  'observed_event_required',
  'observed_event_run_mismatch',
  'verified_source_replay'
].forEach(needle => {
  assert(verifiedRuns.includes(needle), `verified service should pin trust/transaction marker: ${needle}`);
});
assert(!verifiedRuns.includes("VERIFIED_AUTHORITY_LEVEL = 'server_authoritative'"), 'ticketed client runs must not masquerade as combat-authoritative');
assert(!verifiedRuns.includes('INSERT INTO progression_events'), 'verified runs must upgrade observed events instead of minting progression events');
assert(database.includes('idx_progression_verified_checkpoints_user_source'), 'checkpoint sources should be unique across one account');

[
  'progression_verified_runs',
  'progression_verified_run_checkpoints',
  'progression_verified_run_receipts'
].forEach(table => {
  assert(database.includes(table), `database should create ${table}`);
  assert(schemaStatus.includes(table), `migration should list ${table}`);
});
assert(schemaStatus.includes('0003_verified_runs'), 'schema should expose verified run migration v3');

console.log('Verified run bridge checks passed.');
