const fs = require('fs');
const path = require('path');

const { RULE_VERSION, RULES } = require('./engine/rules');
const {
    CONTENT_PACK_VERSION,
    BASELINE_LOADOUTS,
    BASELINE_BOT_POLICIES
} = require('./content/pvp-live-v1-content');
const {
    OPENING_PROBE_CATEGORIES,
    getOpeningProbeHands,
    runBalanceSimulationQuickGate,
    runBalanceSimulationFullGate: runFullGateFromSimulation,
    validateSimulationReport
} = require('./balance-simulation');

const BALANCE_ARTIFACT_CONTRACT_VERSION = 'pvp-live-balance-artifacts-v1';
const FROZEN_BALANCE_ARTIFACT_SEED = 'pvp-live-v1-s2b-frozen-fixtures';

const FROZEN_BALANCE_ARTIFACT_PATHS = Object.freeze({
    baselineLoadouts: 'server/pvp-live/fixtures/baseline_loadouts_v1.json',
    baselineBotPolicies: 'server/pvp-live/fixtures/baseline_bot_policies_v1.json',
    openingScripts: 'server/pvp-live/fixtures/opening_scripts_v1.jsonl',
    goldenReplays: 'server/pvp-live/fixtures/golden_replays_v1.jsonl',
    simulationReport: 'output/pvp-live-balance/simulation_report_v1.json',
    failingReplaysDir: 'output/pvp-live-balance/failing_replays/'
});

const REQUIRED_GOLDEN_REPLAY_IDS = Object.freeze([
    'golden-budget-prevent-001',
    'golden-no-hand-leak-001',
    'golden-idempotent-action-001',
    'golden-reconnect-resume-001',
    'golden-soft-timeout-001',
    'golden-forfeit-timeout-001',
    'golden-draw-round14-001',
    'golden-invalid-match-001',
    'golden-replay-public-redaction-001',
    'golden-audit-safe-scan-001',
    'golden-public-derivation-001',
    'golden-response-window-preserved-001',
    'golden-soft-lock-breakable-001',
    'golden-public-loss-explanation-only-001'
]);

const REDUCER_BACKED_GOLDEN_REPLAY_IDS = Object.freeze([
    'golden-budget-prevent-001',
    'golden-no-hand-leak-001',
    'golden-idempotent-action-001',
    'golden-draw-round14-001',
    'golden-replay-public-redaction-001',
    'golden-audit-safe-scan-001',
    'golden-public-derivation-001',
    'golden-response-window-preserved-001',
    'golden-soft-lock-breakable-001',
    'golden-public-loss-explanation-only-001'
]);

const STORE_BACKED_GOLDEN_REPLAY_IDS = Object.freeze([
    'golden-reconnect-resume-001',
    'golden-soft-timeout-001',
    'golden-forfeit-timeout-001',
    'golden-invalid-match-001'
]);

const SIMULATION_BACKED_GOLDEN_REPLAY_IDS = Object.freeze([]);

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function getArtifactHeader(kind) {
    return {
        contractVersion: BALANCE_ARTIFACT_CONTRACT_VERSION,
        kind,
        ruleVersion: RULE_VERSION,
        contentPackVersion: CONTENT_PACK_VERSION
    };
}

function buildBaselineLoadoutArtifact() {
    return {
        ...getArtifactHeader('baseline_loadouts'),
        loadouts: cloneJson(BASELINE_LOADOUTS)
    };
}

function buildBaselineBotPolicyArtifact() {
    return {
        ...getArtifactHeader('baseline_bot_policies'),
        policies: cloneJson(BASELINE_BOT_POLICIES)
    };
}

function summarizeOpeningScripts(scripts) {
    const categoryCounts = Object.fromEntries(OPENING_PROBE_CATEGORIES.map(category => [category, 0]));
    scripts.forEach(script => {
        if (Object.prototype.hasOwnProperty.call(categoryCounts, script.category)) {
            categoryCounts[script.category] += 1;
        }
    });
    return {
        reportVersion: 'pvp-live-opening-script-artifact-summary-v1',
        totalScripts: scripts.length,
        categoryCounts
    };
}

function buildOpeningScripts({ seed = FROZEN_BALANCE_ARTIFACT_SEED, count = 10000 } = {}) {
    const total = Math.max(0, Math.floor(Number(count) || 0));
    const scripts = [];
    for (let index = 0; index < total; index += 1) {
        const category = OPENING_PROBE_CATEGORIES[index % OPENING_PROBE_CATEGORIES.length];
        const firstSeat = index % 2 === 0 ? 'A' : 'B';
        const loadoutA = BASELINE_LOADOUTS[index % BASELINE_LOADOUTS.length];
        const loadoutB = BASELINE_LOADOUTS[Math.floor(index / BASELINE_LOADOUTS.length) % BASELINE_LOADOUTS.length];
        const forcedOpenings = getOpeningProbeHands(category, firstSeat);
        scripts.push({
            id: `opening-${category}-${String(index + 1).padStart(5, '0')}`,
            category,
            seed: `${seed}-${category}-${index}`,
            firstSeat,
            loadoutA: loadoutA.id,
            loadoutB: loadoutB.id,
            forcedOpeningA: forcedOpenings.A,
            forcedOpeningB: forcedOpenings.B,
            assertions: {
                secondSeatActsBeforeDeath: true,
                secondSeatHasActionLine: true,
                allowBudgetPrevention: true,
                maxDamageBeforeSeatBAction: RULES.startingHp - RULES.openingProtection.minimumHp
            }
        });
    }
    return scripts;
}

function makeGoldenReplay(id, index) {
    const reducerBacked = REDUCER_BACKED_GOLDEN_REPLAY_IDS.includes(id);
    const storeBacked = STORE_BACKED_GOLDEN_REPLAY_IDS.includes(id);
    const simulationBacked = SIMULATION_BACKED_GOLDEN_REPLAY_IDS.includes(id);
    const loadoutA = reducerBacked
        ? BASELINE_LOADOUTS.find(loadout => loadout.id === 'aggro_pressure')
        : BASELINE_LOADOUTS[index % BASELINE_LOADOUTS.length];
    const loadoutB = reducerBacked
        ? BASELINE_LOADOUTS.find(loadout => loadout.id === 'soft_control')
        : BASELINE_LOADOUTS[(index + 3) % BASELINE_LOADOUTS.length];
    const auditCase = id.includes('audit');
    const hasBudgetPrevention = id.includes('budget') || id.includes('response-window');
    const round14Draw = id.includes('draw-round14');
    const reducerExpectedWinner = round14Draw ? 'draw' : hasBudgetPrevention ? 'A' : 'B';
    const expectedStatus = storeBacked && id.includes('reconnect') ? 'active'
        : storeBacked && id.includes('soft-timeout') ? 'active'
            : id.includes('invalid') ? 'invalidated'
                : 'finished';
    const expectsPostMatchReview = reducerBacked || id.includes('forfeit-timeout');
    const replay = {
        id,
        seed: `pvp-live-v1-${id}`,
        ruleVersion: RULE_VERSION,
        contentPackVersion: CONTENT_PACK_VERSION,
        loadoutA: loadoutA.id,
        loadoutB: loadoutB.id,
        executionLayer: reducerBacked ? 'reducer' : storeBacked ? 'store' : simulationBacked ? 'simulation' : 'store_or_fixture',
        expectedStatus,
        expectedWinner: reducerBacked ? reducerExpectedWinner
            : id.includes('draw') || id.includes('invalid') || id.includes('reconnect') || id.includes('soft-timeout') ? 'draw'
                : id.includes('forfeit-timeout') ? 'B'
                    : index % 2 === 0 ? 'A' : 'B',
        expectedEndReason: id.includes('reconnect') ? ''
            : id.includes('soft-timeout') ? 'soft_timeout_automation'
            : id.includes('forfeit-timeout') ? 'timeout'
            : id.includes('invalid') ? 'ready_timeout'
                : id.includes('timeout') ? 'connection_timeout'
            : id.includes('draw') ? 'round14_draw'
                : 'lethal',
        visibility: auditCase ? 'audit_safe' : 'replay_public',
        expectedEvents: reducerBacked && round14Draw ? [
            'snapshot_locked',
            'player_ready',
            'battle_started',
            'opening_second_seat_buffer_granted',
            'turn_ended',
            'match_finished'
        ] : reducerBacked ? [
            'snapshot_locked',
            'player_ready',
            'battle_started',
            'opening_second_seat_buffer_granted',
            'card_played',
            ...(hasBudgetPrevention ? ['budget_clamped'] : []),
            'match_finished'
        ] : storeBacked && id.includes('reconnect') ? [
            'snapshot_locked',
            'player_ready',
            'battle_started'
        ] : storeBacked && id.includes('soft-timeout') ? [
            'snapshot_locked',
            'player_ready',
            'battle_started',
            'turn_timeout',
            'automation_action',
            'turn_ended'
        ] : storeBacked && id.includes('forfeit-timeout') ? [
            'snapshot_locked',
            'player_ready',
            'battle_started',
            'turn_timeout',
            'match_finished'
        ] : storeBacked && id.includes('invalid') ? [
            'snapshot_locked',
            'ready_timeout',
            'match_invalidated'
        ] : simulationBacked ? [
            'battle_started',
            'turn_ended',
            'match_finished'
        ] : [
            'match_created',
            'battle_started',
            'card_played',
            hasBudgetPrevention ? 'damage_prevented_by_budget' : 'turn_ended'
        ],
        expectedReview: {
            expectsPostMatchReview,
            hasBudgetPrevention: expectsPostMatchReview && hasBudgetPrevention,
            hasDecisiveRound: expectedStatus === 'finished',
            hasLoserAdvice: expectsPostMatchReview && !id.includes('draw'),
            hiddenHandLeakCount: 0,
            hiddenDeckOrderLeakCount: 0,
            publicDerivationOnly: true
        }
    };
    if (reducerBacked) {
        replay.reducerOpening = {
            A: hasBudgetPrevention
                ? ['pvp_burst', 'doubleStrike', 'battleCry']
                : ['doubleStrike', 'battleCry', 'bloodlettingSlash'],
            B: hasBudgetPrevention
                ? ['pvp_guard', 'defend', 'stormWard']
                : ['pvp_strike', 'bloodlettingSlash', 'battleCry']
        };
        if (round14Draw) {
            replay.reducerScenario = {
                scenarioType: 'round14_draw_runtime',
                roundIndexBeforeFinalTurn: 14,
                turnIndexBeforeFinalTurn: 28,
                finalActorSeat: 'B',
                hp: { A: 30, B: 30 },
                scoreThreshold: RULES.longGame.scoreThreshold
            };
            replay.maxReducerTurns = 1;
        } else {
            replay.reducerScript = [
                { intentType: 'ready', seatId: 'A' },
                { intentType: 'ready', seatId: 'B' },
                { intentType: 'auto_play_until_finished', policy: 'highest_damage_then_block' },
                { intentType: 'expect_public_review', visibility: replay.visibility }
            ];
            replay.maxReducerTurns = 32;
        }
    }
    if (storeBacked) {
        replay.storeOpening = {
            A: id.includes('soft-timeout')
                ? ['pvp_guard', 'defend', 'stormWard']
                : ['doubleStrike', 'battleCry', 'bloodlettingSlash'],
            B: ['pvp_strike', 'bloodlettingSlash', 'battleCry']
        };
        replay.storeScenario = {
            scenarioType: id.includes('reconnect') ? 'reconnect_resume'
                : id.includes('soft-timeout') ? 'soft_timeout_automation'
                    : id.includes('forfeit-timeout') ? 'forfeit_timeout'
                        : 'invalidated_setup_timeout',
            turnTimeoutMs: 1000,
            setupReadyTimeoutMs: 1000,
            heartbeatIntervalMs: 1000,
            heartbeatStaleMs: 1000,
            reconnectGraceMs: 1000
        };
    }
    if (simulationBacked) {
        replay.simulationScenario = {
            scenarioType: 'round14_draw',
            simulationLayerOnly: true,
            evidenceReason: 'round14 settlement is currently implemented in balance simulation, not in reducer/live-store runtime'
        };
    }
    return replay;
}

function buildGoldenReplays() {
    return REQUIRED_GOLDEN_REPLAY_IDS.map((id, index) => makeGoldenReplay(id, index));
}

function runBalanceSimulationFullGate(options = {}) {
    return runFullGateFromSimulation(options);
}

function buildBalanceFixtureArtifacts({
    seed = FROZEN_BALANCE_ARTIFACT_SEED,
    matchesPerOrderedPair = 157,
    openingScriptCount = 10000
} = {}) {
    const openingScripts = buildOpeningScripts({
        seed,
        count: openingScriptCount
    });
    const simulationReport = runBalanceSimulationQuickGate({
        seed,
        matchesPerOrderedPair,
        openingScripts: openingScriptCount,
        mode: matchesPerOrderedPair >= 500 ? 'full' : 'quick'
    });
    return {
        contractVersion: BALANCE_ARTIFACT_CONTRACT_VERSION,
        ruleVersion: RULE_VERSION,
        contentPackVersion: CONTENT_PACK_VERSION,
        paths: FROZEN_BALANCE_ARTIFACT_PATHS,
        baselineLoadouts: buildBaselineLoadoutArtifact(),
        baselineBotPolicies: buildBaselineBotPolicyArtifact(),
        openingScripts,
        openingScriptSummary: summarizeOpeningScripts(openingScripts),
        goldenReplays: buildGoldenReplays(),
        simulationReport
    };
}

function validateBalanceFixtureArtifacts(artifacts, { mode = 'quick' } = {}) {
    const failures = [];
    if (!artifacts || typeof artifacts !== 'object') {
        return { pass: false, failures: ['missing_artifacts'] };
    }
    if (artifacts.contractVersion !== BALANCE_ARTIFACT_CONTRACT_VERSION) failures.push('contract_version_mismatch');
    if (artifacts.ruleVersion !== RULE_VERSION) failures.push('rule_version_mismatch');
    if (artifacts.contentPackVersion !== CONTENT_PACK_VERSION) failures.push('content_pack_version_mismatch');
    if (JSON.stringify(artifacts.paths) !== JSON.stringify(FROZEN_BALANCE_ARTIFACT_PATHS)) failures.push('artifact_paths_mismatch');
    if (!artifacts.baselineLoadouts || !Array.isArray(artifacts.baselineLoadouts.loadouts)) failures.push('missing_baseline_loadouts');
    if (!artifacts.baselineBotPolicies || !Array.isArray(artifacts.baselineBotPolicies.policies)) failures.push('missing_baseline_bot_policies');
    if ((artifacts.baselineLoadouts && artifacts.baselineLoadouts.loadouts || []).length !== BASELINE_LOADOUTS.length) failures.push('baseline_loadout_count_mismatch');
    if ((artifacts.baselineBotPolicies && artifacts.baselineBotPolicies.policies || []).length !== BASELINE_BOT_POLICIES.length) failures.push('baseline_policy_count_mismatch');
    if (artifacts.baselineLoadouts && JSON.stringify(artifacts.baselineLoadouts) !== JSON.stringify(buildBaselineLoadoutArtifact())) {
        failures.push('baseline_loadout_artifact_drift');
    }
    if (artifacts.baselineBotPolicies && JSON.stringify(artifacts.baselineBotPolicies) !== JSON.stringify(buildBaselineBotPolicyArtifact())) {
        failures.push('baseline_policy_artifact_drift');
    }

    const scripts = Array.isArray(artifacts.openingScripts) ? artifacts.openingScripts : [];
    if (scripts.length < 10000) failures.push('opening_script_count_below_gate');
    const scriptSummary = artifacts.openingScriptSummary || summarizeOpeningScripts(scripts);
    OPENING_PROBE_CATEGORIES.forEach(category => {
        if (Math.floor(Number(scriptSummary.categoryCounts && scriptSummary.categoryCounts[category]) || 0) < 1000) {
            failures.push(`opening_category_under_sampled:${category}`);
        }
    });
    scripts.forEach(script => {
        if (!script.id || !script.seed || !OPENING_PROBE_CATEGORIES.includes(script.category)) failures.push('opening_script_schema');
        if (!script.assertions || script.assertions.secondSeatActsBeforeDeath !== true || script.assertions.secondSeatHasActionLine !== true) {
            failures.push('opening_script_missing_experience_assertions');
        }
        if (!['A', 'B'].includes(script.firstSeat)) failures.push('opening_script_invalid_first_seat');
        if (!BASELINE_LOADOUTS.some(loadout => loadout.id === script.loadoutA)) failures.push(`opening_script_unknown_loadout:${script.loadoutA}`);
        if (!BASELINE_LOADOUTS.some(loadout => loadout.id === script.loadoutB)) failures.push(`opening_script_unknown_loadout:${script.loadoutB}`);
        if (!Array.isArray(script.forcedOpeningA) || script.forcedOpeningA.length < 3) failures.push('opening_script_missing_forced_opening_a');
        if (!Array.isArray(script.forcedOpeningB) || script.forcedOpeningB.length < 3) failures.push('opening_script_missing_forced_opening_b');
    });

    const goldenIds = new Set((Array.isArray(artifacts.goldenReplays) ? artifacts.goldenReplays : []).map(replay => replay.id));
    REQUIRED_GOLDEN_REPLAY_IDS.forEach(id => {
        if (!goldenIds.has(id)) failures.push(`missing_golden_replay:${id}`);
    });
    (Array.isArray(artifacts.goldenReplays) ? artifacts.goldenReplays : []).forEach(replay => {
        if (!['replay_public', 'audit_safe'].includes(replay.visibility)) failures.push(`invalid_golden_visibility:${replay.id}`);
        if (!replay.expectedReview || replay.expectedReview.hiddenHandLeakCount !== 0 || replay.expectedReview.hiddenDeckOrderLeakCount !== 0) {
            failures.push(`golden_hidden_leak_not_blocked:${replay.id}`);
        }
    });

    const simulationValidation = validateSimulationReport(artifacts.simulationReport, { mode });
    if (!simulationValidation.pass) {
        simulationValidation.failures.forEach(failure => failures.push(`simulation_report:${failure}`));
    }
    return {
        pass: failures.length === 0,
        failures: Array.from(new Set(failures))
    };
}

function writeJsonFile(rootDir, relativePath, value) {
    const targetPath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    return targetPath;
}

function writeJsonlFile(rootDir, relativePath, rows) {
    const targetPath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`, 'utf8');
    return targetPath;
}

function writeBalanceFixtureArtifacts(rootDir, artifacts) {
    const cwd = rootDir || path.resolve(__dirname, '../..');
    const written = {
        baselineLoadouts: writeJsonFile(cwd, FROZEN_BALANCE_ARTIFACT_PATHS.baselineLoadouts, artifacts.baselineLoadouts),
        baselineBotPolicies: writeJsonFile(cwd, FROZEN_BALANCE_ARTIFACT_PATHS.baselineBotPolicies, artifacts.baselineBotPolicies),
        openingScripts: writeJsonlFile(cwd, FROZEN_BALANCE_ARTIFACT_PATHS.openingScripts, artifacts.openingScripts),
        goldenReplays: writeJsonlFile(cwd, FROZEN_BALANCE_ARTIFACT_PATHS.goldenReplays, artifacts.goldenReplays),
        simulationReport: writeJsonFile(cwd, FROZEN_BALANCE_ARTIFACT_PATHS.simulationReport, artifacts.simulationReport)
    };
    fs.mkdirSync(path.join(cwd, FROZEN_BALANCE_ARTIFACT_PATHS.failingReplaysDir), { recursive: true });
    return written;
}

module.exports = {
    BALANCE_ARTIFACT_CONTRACT_VERSION,
    FROZEN_BALANCE_ARTIFACT_SEED,
    FROZEN_BALANCE_ARTIFACT_PATHS,
    REQUIRED_GOLDEN_REPLAY_IDS,
    REDUCER_BACKED_GOLDEN_REPLAY_IDS,
    STORE_BACKED_GOLDEN_REPLAY_IDS,
    SIMULATION_BACKED_GOLDEN_REPLAY_IDS,
    buildBalanceFixtureArtifacts,
    validateBalanceFixtureArtifacts,
    writeBalanceFixtureArtifacts,
    runBalanceSimulationFullGate
};
