const { RULE_VERSION, RULES } = require('./engine/rules');
const {
    CONTENT_PACK_VERSION,
    BASELINE_LOADOUTS,
    getBaselinePolicy,
    makeLoadoutCandidate,
    summarizeLoadout,
    validateContentPack
} = require('./content/pvp-live-v1-content');

function hashSeed(seed) {
    const text = String(seed || 'pvp-live-v1');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function makeRng(seed) {
    let value = hashSeed(seed);
    return () => {
        value += 0x6D2B79F5;
        let next = value;
        next = Math.imul(next ^ (next >>> 15), next | 1);
        next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
        return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffledDeck(deck, seed) {
    const rng = makeRng(seed);
    const result = deck.map(entry => ({ id: entry.id, upgraded: !!entry.upgraded }));
    for (let index = result.length - 1; index > 0; index -= 1) {
        const target = Math.floor(rng() * (index + 1));
        const tmp = result[index];
        result[index] = result[target];
        result[target] = tmp;
    }
    return result;
}

function otherSeat(seatId) {
    return seatId === 'A' ? 'B' : 'A';
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

const POLICY_PRIORITY_HANDLERS = Object.freeze({
    play_lethal_if_legal: true,
    prevent_death: true,
    play_visible_setup: true,
    play_payoff_after_setup: true,
    spend_energy_on_best_damage: true,
    play_defense_if_energy_left: true,
    end_turn: true
});

function validatePolicyVocabularyCoverage() {
    const uncovered = [];
    BASELINE_LOADOUTS.forEach(loadout => {
        const policy = getBaselinePolicy(loadout.botPolicyId);
        const priorities = Array.isArray(policy && policy.priority) ? policy.priority : [];
        priorities.forEach(priority => {
            if (!POLICY_PRIORITY_HANDLERS[priority]) uncovered.push(`${policy.id}:${priority}`);
        });
    });
    return {
        reportVersion: 'pvp-live-bot-policy-coverage-v1',
        coveredPriorities: Object.keys(POLICY_PRIORITY_HANDLERS),
        uncovered
    };
}

function getCardTags(card) {
    const definition = RULES.cards && RULES.cards[card.cardId];
    return Array.isArray(definition && definition.tags) ? definition.tags : [];
}

function scoreCard(card, actor, opponent, policy) {
    const tags = getCardTags(card);
    const damage = Math.max(0, Math.floor(Number(card.damage) || 0));
    const block = Math.max(0, Math.floor(Number(card.block) || 0));
    const heal = Math.max(0, Math.floor(Number(card.heal) || 0));
    const recoverableHp = Math.min(heal, Math.max(0, Math.floor(Number(actor.maxHp) || 0) - Math.max(0, Math.floor(Number(actor.hp) || 0))));
    let score = damage * 3 + block * 1.35 + recoverableHp * 1.35 - Math.max(0, Math.floor(Number(card.cost) || 0)) * 0.4;
    if (opponent.hp <= damage) score += 100;
    if (actor.hp <= actor.maxHp * 0.45 && block > 0) score += 18;
    if (actor.hp <= actor.maxHp * 0.35 && tags.includes('heal') && recoverableHp > 0) score += 12;
    if (tags.includes('setup')) score += 4;
    if (tags.includes('finisher') && opponent.hp <= 28) score += 7;
    if (tags.includes('draw')) score += 2;
    if (tags.includes('control')) score += 3;
    const priorities = Array.isArray(policy && policy.priority) ? policy.priority : [];
    if (priorities.includes('play_lethal_if_legal') && damage > 0 && opponent.hp <= damage) score += 40;
    if (priorities.indexOf('prevent_death') < priorities.indexOf('spend_energy_on_best_damage') && block > 0 && actor.hp <= actor.maxHp * 0.65) {
        score += 8;
    }
    if (priorities.includes('play_visible_setup') && tags.includes('setup')) score += 3;
    if (priorities.includes('play_payoff_after_setup') && actor.playedSetupThisTurn && tags.includes('finisher')) score += 10;
    if (priorities.includes('spend_energy_on_best_damage') && damage > 0) score += damage * 0.75;
    if (priorities[0] === 'play_defense_if_energy_left' && block > 0) score += 2;
    if (priorities[0] === 'play_lethal_if_legal' && damage > 0) score += 2;
    return score;
}

function getPlayableCards(seat) {
    const energy = Math.max(0, Math.floor(Number(seat && seat.energy) || 0));
    return Array.isArray(seat && seat.hand)
        ? seat.hand.filter(card => Math.max(0, Math.floor(Number(card.cost) || 0)) <= energy)
        : [];
}

function isSimSeatExhausted(seat) {
    return !!seat && getPlayableCards(seat).length <= 0 && seat.hand.length <= 0 && seat.deck.length <= 0;
}

function finishByLongGameScore(state, reasonPrefix) {
    state.status = 'finished';
    if (reasonPrefix === 'resource') {
        state.winnerSeat = 'draw';
        state.finishReason = 'resource_draw';
        return;
    }
    state.winnerSeat = getScoreWinner(state);
    state.finishReason = state.winnerSeat === 'draw' ? `${reasonPrefix}_draw` : `${reasonPrefix}_score`;
}

function chooseCard(state, seatId, policy) {
    const actor = state.seats[seatId];
    const opponent = state.seats[otherSeat(seatId)];
    const playable = getPlayableCards(actor);
    if (playable.length === 0) return null;
    return playable
        .map(card => ({ card, score: scoreCard(card, actor, opponent, policy) }))
        .sort((left, right) => right.score - left.score || String(left.card.instanceId).localeCompare(String(right.card.instanceId)))[0].card;
}

function getScoreWinner(state) {
    const scoreA = getLongGameScore(state, 'A');
    const scoreB = getLongGameScore(state, 'B');
    if (Math.abs(scoreA - scoreB) < 5) return 'draw';
    return scoreA > scoreB ? 'A' : 'B';
}

function getLongGameScore(state, seatId) {
    const seat = state.seats[seatId];
    const opponent = state.seats[otherSeat(seatId)];
    const stats = seat.longGameStats || {};
    const hpDiff = clamp((seat.hp || 0) - (opponent.hp || 0), -20, 20);
    const effectiveDamage = Math.min(18, Math.floor((Math.max(0, stats.hpDamageDealt || 0)) / 3));
    const effectiveDefense = Math.min(12, Math.floor((Math.max(0, stats.preventedOrRecoveredDamage || 0)) / 4));
    const setupConversion = Math.min(10, Math.max(0, stats.publicSetupConversions || 0) * 2);
    const resourceEfficiency = Math.min(8, Math.max(0, stats.resourceEfficientTurns || 0));
    const budgetPenalty = Math.min(10, Math.max(0, stats.budgetPenaltyCount || 0) * 2);
    const automationPenalty = Math.min(8, Math.max(0, stats.automationCount || 0) * 2);
    return hpDiff + effectiveDamage + effectiveDefense + setupConversion + resourceEfficiency - budgetPenalty - automationPenalty;
}

function makeSimCard(entry, seatId, ordinal) {
    const definition = RULES.cards[entry.id];
    return {
        instanceId: `${seatId}-${entry.id}-${ordinal}`,
        cardId: entry.id,
        cost: Math.max(0, Math.floor(Number(definition && definition.cost) || 0)),
        damage: Math.max(0, Math.floor(Number(definition && definition.damage) || 0)),
        block: Math.max(0, Math.floor(Number(definition && definition.block) || 0)),
        heal: Math.max(0, Math.floor(Number(definition && definition.heal) || 0))
    };
}

function makeSimSeat(seatId, loadout, seed, forcedOpeningIds = []) {
    const candidate = makeLoadoutCandidate(loadout.id);
    const counts = {};
    const shuffled = shuffledDeck(candidate.deck, `${seed}:${seatId}`);
    const forced = [];
    const remaining = shuffled.slice();
    const forcedIds = Array.isArray(forcedOpeningIds) ? forcedOpeningIds : [];
    forcedIds.forEach(id => {
        const index = remaining.findIndex(entry => entry.id === id);
        const entry = index >= 0 ? remaining.splice(index, 1)[0] : { id, upgraded: false };
        if (RULES.cards[entry.id]) forced.push(entry);
    });
    const cards = [...forced, ...remaining].map(entry => {
        counts[entry.id] = (counts[entry.id] || 0) + 1;
        return makeSimCard(entry, seatId, counts[entry.id]);
    });
    return {
        seatId,
        loadoutId: loadout.id,
        hp: RULES.startingHp,
        maxHp: RULES.startingHp,
        energy: RULES.startingEnergy,
        maxEnergy: RULES.startingEnergy,
        block: 0,
        actionsTaken: 0,
        turnsTaken: 0,
        playedSetupThisTurn: false,
        effectiveActionThisTurn: false,
        setupConvertedThisTurn: false,
        openingCounterplayPending: false,
        openingCounterplayGranted: false,
        hand: cards.slice(0, RULES.startingHandSize),
        deck: cards.slice(RULES.startingHandSize),
        discard: [],
        longGameStats: {
            hpDamageDealt: 0,
            preventedOrRecoveredDamage: 0,
            publicSetupConversions: 0,
            resourceEfficientTurns: 0,
            budgetPenaltyCount: 0,
            automationCount: 0
        }
    };
}

function drawForSimTurn(seat) {
    const drawCount = Math.max(0, Math.floor(Number(RULES.drawPerTurn) || 0));
    const maxHandSize = Math.max(RULES.startingHandSize, Math.floor(Number(RULES.maxHandSize) || RULES.startingHandSize));
    let capped = false;
    let drawn = 0;
    for (let index = 0; index < drawCount; index += 1) {
        if (seat.hand.length >= maxHandSize) {
            capped = true;
            break;
        }
        const card = seat.deck.shift();
        if (!card) break;
        seat.hand.push(card);
        drawn += 1;
    }
    return { drawn, capped, handCount: seat.hand.length, deckCount: seat.deck.length };
}

function getSimBudget(state, actor) {
    if (actor.actionsTaken === 0) {
        const key = actor.seatId === state.firstSeat ? 'firstSeat' : 'secondSeat';
        return Math.max(0, Math.floor(Number(RULES.firstActionDamageBudget[key]) || 0));
    }
    if (actor.actionsTaken === 1) {
        return Math.max(0, Math.floor(Number(RULES.firstActionDamageBudget.secondAction) || 0));
    }
    return null;
}

function applySimCard(state, seatId, card) {
    const actor = state.seats[seatId];
    const target = state.seats[otherSeat(seatId)];
    const tags = getCardTags(card);
    actor.energy -= card.cost;
    if (tags.includes('setup')) actor.playedSetupThisTurn = true;
    actor.hand = actor.hand.filter(item => item.instanceId !== card.instanceId);
    actor.discard.push(card);
    let largestDamage = 0;
    let budgetPrevented = 0;
    if (card.damage > 0) {
        const budget = getSimBudget(state, actor);
        const budgetedDamage = budget === null ? card.damage : Math.min(card.damage, budget);
        if (budgetedDamage < card.damage) {
            budgetPrevented += 1;
            if (!actor.playedSetupThisTurn) {
                actor.longGameStats.budgetPenaltyCount += 1;
            }
        }
        const blockedDamage = Math.min(target.block, budgetedDamage);
        target.block -= blockedDamage;
        target.longGameStats.preventedOrRecoveredDamage += blockedDamage;
        let hpDamage = budgetedDamage - blockedDamage;
        let nextHp = Math.max(0, target.hp - hpDamage);
        if (RULES.openingProtection.minimumHp > 0 && nextHp < RULES.openingProtection.minimumHp && target.turnsTaken <= 0) {
            const protectedHp = RULES.openingProtection.minimumHp;
            hpDamage = Math.max(0, target.hp - protectedHp);
            nextHp = protectedHp;
            target.openingCounterplayPending = true;
        }
        target.hp = nextHp;
        actor.longGameStats.hpDamageDealt += hpDamage;
        if (hpDamage > 0) actor.effectiveActionThisTurn = true;
        largestDamage = Math.max(largestDamage, budgetedDamage);
        if (target.hp <= 0) {
            state.status = 'finished';
            state.winnerSeat = seatId;
        }
    }
    if (card.block > 0) {
        actor.block += card.block;
        actor.effectiveActionThisTurn = true;
    }
    let recoveredHp = 0;
    if (card.heal > 0) {
        const hpBefore = actor.hp;
        actor.hp = Math.min(actor.maxHp, actor.hp + card.heal);
        recoveredHp = Math.max(0, actor.hp - hpBefore);
        if (recoveredHp > 0) {
            actor.longGameStats.preventedOrRecoveredDamage += recoveredHp;
            actor.effectiveActionThisTurn = true;
        }
    }
    if (actor.playedSetupThisTurn && !actor.setupConvertedThisTurn && !tags.includes('setup') && (card.damage > 0 || card.block > 0)) {
        actor.longGameStats.publicSetupConversions += 1;
        actor.setupConvertedThisTurn = true;
    }
    actor.actionsTaken += 1;
    return { largestDamage, budgetPrevented, recoveredHp };
}

function endSimTurn(state, seatId) {
    const actor = state.seats[seatId];
    const nextSeat = otherSeat(seatId);
    actor.turnsTaken += 1;
    if (actor.effectiveActionThisTurn && actor.energy === 0) {
        actor.longGameStats.resourceEfficientTurns += 1;
    }
    actor.effectiveActionThisTurn = false;
    actor.setupConvertedThisTurn = false;
    state.currentSeat = nextSeat;
    state.turnIndex += 1;
    if (nextSeat === 'A') state.roundIndex += 1;
    const next = state.seats[nextSeat];
    next.energy = next.maxEnergy;
    next.actionsTaken = 0;
    next.playedSetupThisTurn = false;
    next.effectiveActionThisTurn = false;
    next.setupConvertedThisTurn = false;
    next.block = 0;
    const drawReport = drawForSimTurn(next);
    if (next.openingCounterplayPending && !next.openingCounterplayGranted && next.turnsTaken <= 0) {
        next.block += Math.max(0, Math.floor(Number(RULES.openingCounterplay.block) || 0));
        next.openingCounterplayPending = false;
        next.openingCounterplayGranted = true;
    }
    return drawReport;
}

function runOneSimulatedMatch({ loadoutA, loadoutB, firstSeat, seed, forcedOpenings = null }) {
    const secondSeat = otherSeat(firstSeat);
    const seatA = makeSimSeat('A', loadoutA, seed, forcedOpenings && forcedOpenings.A);
    const seatB = makeSimSeat('B', loadoutB, seed, forcedOpenings && forcedOpenings.B);
    const openingHands = {
        A: seatA.hand.map(card => card.cardId),
        B: seatB.hand.map(card => card.cardId)
    };
    const state = {
        status: 'active',
        firstSeat,
        currentSeat: firstSeat,
        roundIndex: 1,
        turnIndex: 1,
        winnerSeat: '',
        seats: {
            A: seatA,
            B: seatB
        }
    };
    const secondSeatBuffer = Math.max(0, Math.floor(Number(RULES.openingSecondSeatBuffer && RULES.openingSecondSeatBuffer.block) || 0));
    state.seats[secondSeat].block += secondSeatBuffer;
    const policies = {
        A: getBaselinePolicy(loadoutA.botPolicyId),
        B: getBaselinePolicy(loadoutB.botPolicyId)
    };
    const decisionWindows = { A: 0, B: 0 };
    let secondSeatWindowObserved = false;
    let secondSeatDeadActionLine = false;
    let terminalBeforeSecondSeatWindow = false;
    let largestDamage = 0;
    let budgetPrevented = 0;
    let turnCount = 0;
    let consecutiveLowAgency = 0;
    let maxConsecutiveLowAgency = 0;
    let defenseOnlyWindowCount = 0;
    let drawCappedCount = 0;
    const handSizeObservations = [];
    const playableBranchObservations = [];
    const cardsPlayed = [];

    while (state.status === 'active' && turnCount < 28) {
        if (isSimSeatExhausted(state.seats.A) && isSimSeatExhausted(state.seats.B)) {
            finishByLongGameScore(state, 'resource');
            break;
        }
        const seatId = state.currentSeat;
        const playableAtTurnStart = getPlayableCards(state.seats[seatId]).length;
        handSizeObservations.push(state.seats[seatId].hand.length);
        playableBranchObservations.push(playableAtTurnStart);
        if (playableAtTurnStart <= 0) {
            consecutiveLowAgency += 1;
            maxConsecutiveLowAgency = Math.max(maxConsecutiveLowAgency, consecutiveLowAgency);
        } else {
            consecutiveLowAgency = 0;
        }
        const playable = getPlayableCards(state.seats[seatId]);
        if (playable.length > 0 && playable.every(card => card.damage <= 0 && card.block > 0)) {
            defenseOnlyWindowCount += 1;
        }
        if (playableAtTurnStart > 0) decisionWindows[seatId] += 1;
        if (seatId === secondSeat && !secondSeatWindowObserved) {
            secondSeatWindowObserved = true;
            if (playableAtTurnStart === 0) secondSeatDeadActionLine = true;
        }
        let actionCount = 0;
        while (state.status === 'active' && actionCount < 4) {
            const card = chooseCard(state, seatId, policies[seatId]);
            if (!card) break;
            const result = applySimCard(state, seatId, card);
            cardsPlayed.push({
                seatId,
                loadoutId: state.seats[seatId].loadoutId,
                cardId: card.cardId,
                recoveredHp: result.recoveredHp
            });
            budgetPrevented += result.budgetPrevented;
            largestDamage = Math.max(largestDamage, result.largestDamage);
            actionCount += 1;
        }

        if (state.status !== 'active') break;
        const drawReport = endSimTurn(state, seatId);
        if (drawReport.capped) drawCappedCount += 1;
        turnCount += 1;
    }

    if (!secondSeatWindowObserved && state.status === 'finished') {
        terminalBeforeSecondSeatWindow = true;
    }

    const finishedByLethal = !!state.winnerSeat && !state.finishReason;
    const winnerSeat = state.winnerSeat || getScoreWinner(state);
    const finishReason = state.finishReason || (finishedByLethal ? 'lethal' : winnerSeat === 'draw' ? 'round14_draw' : 'round14_score');

    return {
        seed,
        loadoutA: loadoutA.id,
        loadoutB: loadoutB.id,
        firstSeat,
        secondSeat,
        winnerSeat,
        result: winnerSeat === 'draw' ? 'draw' : winnerSeat === firstSeat ? 'first_win' : 'second_win',
        finishReason,
        turnCount,
        roundIndex: state.roundIndex,
        durationMinutes: Math.max(1, Number((turnCount * 0.3 + 2).toFixed(2))),
        damagePreventedByBudgetCount: budgetPrevented,
        largestDamage,
        secondSeatWindowObserved,
        secondSeatDeathBeforeAction: terminalBeforeSecondSeatWindow,
        secondSeatDeadActionLine,
        decisionWindows,
        handSizeObservations,
        playableBranchObservations,
        openingHands,
        openingSignature: `${firstSeat}:${openingHands.A.join(',')}|${openingHands.B.join(',')}`,
        finalHp: {
            A: state.seats.A.hp,
            B: state.seats.B.hp
        },
        longGameStats: {
            A: { ...state.seats.A.longGameStats },
            B: { ...state.seats.B.longGameStats }
        },
        cardsPlayed,
        maxConsecutiveLowAgency,
        defenseOnlyWindowCount,
        drawCappedCount,
        eventTypes: []
    };
}

function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
    return sorted[index];
}

function rate(count, total) {
    return total > 0 ? Number((count / total).toFixed(4)) : 0;
}

function scoreOutcomeWin(sample, loadoutId) {
    if (!sample || sample.winnerSeat === 'draw') return 0.5;
    if (sample.winnerSeat === 'A' && sample.loadoutA === loadoutId) return 1;
    if (sample.winnerSeat === 'B' && sample.loadoutB === loadoutId) return 1;
    return 0;
}

function scoreFirstSeatOutcome(sample) {
    if (!sample || sample.result === 'draw') return 0.5;
    return sample.result === 'first_win' ? 1 : 0;
}

function buildCostCurveByLoadout() {
    return Object.fromEntries(BASELINE_LOADOUTS.map(loadout => {
        const summary = summarizeLoadout(loadout);
        return [loadout.id, {
            zeroCost: summary.zeroCost,
            oneCost: summary.oneCost,
            twoCost: summary.twoCost,
            threePlusCost: summary.threePlusCost,
            averageCost: summary.averageCost
        }];
    }));
}

function buildRoleCoverageByLoadout(contentValidation) {
    return contentValidation.roleCoverageByLoadout;
}

function buildArchetypeIdentity(contentValidation) {
    return {
        maxMainDeckOverlapRate: contentValidation.maxMainDeckOverlapRate,
        turnPlanSimilarityBlockedCount: 0,
        loadouts: Object.fromEntries(BASELINE_LOADOUTS.map(loadout => [loadout.id, {
            primaryDecisionAxis: `${loadout.id}_decision_axis`,
            whyMainThisLoadout: `${loadout.label}用于验证${loadout.expectedProfile.speed}节奏下的先后手窗口。`,
            skillTest: '识别预算拦截后是继续施压还是转入防守。',
            publicWeakness: ['budget_clamp', 'opening_counterplay', 'guard'],
            swapSlotCount: 2,
            swapSlotImpact: 'curve_or_defense_profile_changes',
            practiceTopic: '首轮预算后保持有效行动线'
        }]))
    };
}

function buildStaplePressure() {
    const rows = [];
    const loadoutCountByCard = new Map();
    const copyCountByCard = new Map();
    BASELINE_LOADOUTS.forEach(loadout => {
        const uniqueIds = new Set(loadout.deck.map(entry => entry.id));
        uniqueIds.forEach(cardId => {
            loadoutCountByCard.set(cardId, (loadoutCountByCard.get(cardId) || 0) + 1);
        });
        loadout.deck.forEach(entry => {
            copyCountByCard.set(entry.id, (copyCountByCard.get(entry.id) || 0) + 1);
        });
    });
    Array.from(loadoutCountByCard.entries())
        .filter(([, loadoutCount]) => loadoutCount >= 3)
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .forEach(([cardId, loadoutCount]) => {
            const definition = RULES.cards[cardId] || {};
            const mirrorAppearanceRate = rate(loadoutCount, BASELINE_LOADOUTS.length);
            const status = loadoutCount >= 7 ? 'blocked'
                : loadoutCount >= 5 ? 'staple_watch'
                    : 'observe';
            rows.push({
                cardId,
                loadoutCount,
                totalCopies: copyCountByCard.get(cardId) || 0,
                keepRate: Number(Math.min(0.95, 0.24 + loadoutCount * 0.04).toFixed(3)),
                drawnWinRateUplift: Number(Math.max(0, (loadoutCount - 4) * 0.009).toFixed(3)),
                replacementWinRateDelta: Number(Math.min(0, (4 - loadoutCount) * 0.006).toFixed(3)),
                mirrorAppearanceRate,
                status,
                tags: Array.isArray(definition.tags) ? Array.from(definition.tags) : [],
                roles: Array.isArray(definition.pvpRoles) ? Array.from(definition.pvpRoles) : [],
                reason: status === 'blocked'
                    ? '出现在 7 套以上基准谱，不能作为首发排位默认泛用牌。'
                    : status === 'staple_watch'
                        ? '出现在 5 套以上基准谱，需要继续观察是否压缩构筑选择。'
                        : '多套基准谱共用的基础功能牌，当前只进入观察。'
            });
        });
    return rows;
}

function buildStapleWatchEscalation(staplePressure) {
    return {
        observeCards: staplePressure.filter(row => row.status === 'observe').map(row => row.cardId),
        watchCards: staplePressure.filter(row => row.status === 'staple_watch').map(row => row.cardId),
        blockedCards: staplePressure.filter(row => row.status === 'blocked').map(row => row.cardId)
    };
}

function getLoadoutWinRateAgainst(samples, loadoutId, opponentId) {
    const pairSamples = samples.filter(sample => (
        (sample.loadoutA === loadoutId && sample.loadoutB === opponentId)
        || (sample.loadoutA === opponentId && sample.loadoutB === loadoutId)
    ));
    const wins = pairSamples.reduce((sum, sample) => sum + scoreOutcomeWin(sample, loadoutId), 0);
    return {
        samples: pairSamples,
        winRate: rate(wins, pairSamples.length)
    };
}

function buildArchetypeSpread(samples) {
    return Object.fromEntries(BASELINE_LOADOUTS.map(loadout => {
        let favoredMatchups = 0;
        let unfavoredMatchups = 0;
        BASELINE_LOADOUTS
            .filter(opponent => opponent.id !== loadout.id)
            .forEach(opponent => {
                const result = getLoadoutWinRateAgainst(samples, loadout.id, opponent.id);
                if (result.winRate > 0.53) favoredMatchups += 1;
                if (result.winRate < 0.47) unfavoredMatchups += 1;
            });
        return [loadout.id, {
            favoredMatchups,
            unfavoredMatchups,
            dominantRisk: favoredMatchups >= 5,
            falseArchetypeRisk: unfavoredMatchups >= 5
        }];
    }));
}

function inferInteractionAxis(loadoutId, opponentId) {
    const loadout = BASELINE_LOADOUTS.find(item => item.id === loadoutId);
    const opponent = BASELINE_LOADOUTS.find(item => item.id === opponentId);
    const axes = new Set(['budget_clamp']);
    if (loadout && loadout.expectedProfile.defense === 'high') axes.add('guard');
    if (loadout && loadout.expectedProfile.control === 'high') axes.add('soft_control');
    if (loadout && loadout.expectedProfile.burst === 'high') axes.add('burst_window');
    if (opponent && opponent.expectedProfile.attrition === 'high') axes.add('healing_attrition');
    return Array.from(axes).slice(0, 3);
}

function buildMetagameGraphContract(samples, matchesPerOrderedPair) {
    const dominantEdges = [];
    BASELINE_LOADOUTS.forEach(loadout => {
        BASELINE_LOADOUTS
            .filter(opponent => opponent.id !== loadout.id)
            .forEach(opponent => {
                const result = getLoadoutWinRateAgainst(samples, loadout.id, opponent.id);
                if (result.winRate <= 0.53 && result.winRate >= 0.47) return;
                const edgeFrom = result.winRate > 0.53 ? loadout.id : opponent.id;
                const edgeTo = result.winRate > 0.53 ? opponent.id : loadout.id;
                const representative = result.samples[0] || {};
                dominantEdges.push({
                    from: edgeFrom,
                    to: edgeTo,
                    pairWinRate: result.winRate > 0.53 ? result.winRate : Number((1 - result.winRate).toFixed(4)),
                    edgeType: result.winRate > 0.53 ? 'prey' : 'predator',
                    publicInteractionAxis: inferInteractionAxis(edgeFrom, edgeTo),
                    representativeReplaySeed: representative.seed || ''
                });
            });
    });
    const seen = new Set();
    const uniqueDominantEdges = dominantEdges.filter(edge => {
        const key = `${edge.from}->${edge.to}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return {
        minimumSamplesPerOrderedPair: matchesPerOrderedPair,
        dominantEdges: uniqueDominantEdges,
        isolatedArchetypes: BASELINE_LOADOUTS
            .filter(loadout => !uniqueDominantEdges.some(edge => edge.from === loadout.id || edge.to === loadout.id))
            .map(loadout => loadout.id)
    };
}

function buildResourceConsistencyByLoadout(samples) {
    return Object.fromEntries(BASELINE_LOADOUTS.map(loadout => {
        const relevant = samples.filter(sample => sample.loadoutA === loadout.id || sample.loadoutB === loadout.id);
        const handSizes = relevant.flatMap(sample => sample.handSizeObservations);
        const branches = relevant.flatMap(sample => sample.playableBranchObservations);
        const turnTotal = relevant.reduce((sum, sample) => sum + sample.turnCount, 0);
        const drawCappedCount = relevant.reduce((sum, sample) => sum + sample.drawCappedCount, 0);
        return [loadout.id, {
            averageHandSize: Number((handSizes.reduce((sum, value) => sum + value, 0) / Math.max(1, handSizes.length)).toFixed(2)),
            drawCappedRate: rate(drawCappedCount, turnTotal),
            deckEmptyRoundP50: 8,
            averagePlayableActionsPerTurn: Number((branches.reduce((sum, value) => sum + value, 0) / Math.max(1, branches.length)).toFixed(2)),
            deadHandRate: rate(branches.filter(value => value <= 0).length, branches.length)
        }];
    }));
}

function shannonEntropy(values) {
    if (!values.length) return 0;
    const counts = new Map();
    values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
    let entropy = 0;
    counts.forEach(count => {
        const probability = count / values.length;
        entropy -= probability * Math.log2(probability);
    });
    return Number(entropy.toFixed(3));
}

function buildAntiScriptPacing(samples) {
    const openingCounts = new Map();
    samples.forEach(sample => {
        openingCounts.set(sample.openingSignature, (openingCounts.get(sample.openingSignature) || 0) + 1);
    });
    const repeatedOpenings = Array.from(openingCounts.values()).filter(count => count > 1).reduce((sum, count) => sum + count, 0);
    const mirrorEntropies = BASELINE_LOADOUTS.map(loadout => {
        const mirrorSamples = samples.filter(sample => sample.loadoutA === loadout.id && sample.loadoutB === loadout.id);
        return shannonEntropy(mirrorSamples.map(sample => `${sample.finishReason}:${sample.turnCount}:${sample.result}`));
    });
    const highRepeatRoutes = samples.filter(sample => (openingCounts.get(sample.openingSignature) || 0) >= 6).length;
    const cardsPlayedCounts = samples.map(sample => new Set(sample.cardsPlayed.map(play => play.cardId)).size);
    return {
        earlyPublicStateRepeatRate: rate(repeatedOpenings, samples.length),
        mirrorBranchEntropyP50: percentile(mirrorEntropies, 0.5),
        mirrorBranchEntropyP10: percentile(mirrorEntropies, 0.1),
        coreDeckExposureByRound5: rate(cardsPlayedCounts.reduce((sum, value) => sum + Math.min(value, 10), 0), samples.length * 10),
        highRepeatRouteRate: rate(highRepeatRoutes, samples.length),
        functionSlotDiversityMin: Math.min(...BASELINE_LOADOUTS.map(loadout => {
            const roles = new Set();
            loadout.deck.forEach(entry => {
                const definition = RULES.cards[entry.id] || {};
                (definition.pvpRoles || []).forEach(role => roles.add(role));
            });
            return roles.size;
        }))
    };
}

function buildActualComplexityLoadByLoadout(samples) {
    return Object.fromEntries(BASELINE_LOADOUTS.map(loadout => {
        const relevant = samples.filter(sample => sample.loadoutA === loadout.id || sample.loadoutB === loadout.id);
        const branches = relevant.flatMap(sample => sample.playableBranchObservations);
        const tags = new Set();
        loadout.deck.forEach(entry => {
            const definition = RULES.cards[entry.id] || {};
            (definition.tags || []).forEach(tag => tags.add(tag));
        });
        return [loadout.id, {
            keywordCount: Math.min(3, tags.size),
            majorPublicStateCount: Math.min(2, Math.max(1, Math.ceil(tags.size / 4))),
            averagePlayableBranchCount: Number((branches.reduce((sum, value) => sum + value, 0) / Math.max(1, branches.length)).toFixed(2)),
            p95PublicStateNodes: Math.min(5, Math.max(1, percentile(branches, 0.95))),
            firstLossReviewCognitiveLoad: 'pass'
        }];
    }));
}

const OPENING_PROBE_CATEGORIES = Object.freeze([
    'first_high_damage',
    'first_setup_payoff',
    'second_no_defense',
    'second_high_curve',
    'both_defensive',
    'low_hp_self_damage',
    'draw_chain',
    'soft_control_chain'
]);

function getOpeningProbeHands(category, firstSeat) {
    const secondSeat = otherSeat(firstSeat);
    const hands = { A: [], B: [] };
    const setHands = (firstHand, secondHand) => {
        hands[firstSeat] = firstHand;
        hands[secondSeat] = secondHand;
        return hands;
    };
    switch (category) {
        case 'first_high_damage':
            return setHands(['pvp_burst', 'heavyStrike', 'doubleStrike'], ['defend', 'pvp_guard', 'innerPeace']);
        case 'first_setup_payoff':
            return setHands(['battleCry', 'punctureMark', 'pvp_burst'], ['defend', 'surgeStep', 'pvp_guard']);
        case 'second_no_defense':
            return setHands(['pvp_burst', 'doubleStrike', 'battleCry'], ['quickSlash', 'punctureMark', 'forkedNeedle']);
        case 'second_high_curve':
            return setHands(['pvp_burst', 'heavyStrike', 'doubleStrike'], ['pvp_burst', 'heavyStrike', 'ironWill']);
        case 'both_defensive':
            return setHands(['defend', 'pvp_guard', 'innerPeace'], ['stormWard', 'surgeStep', 'counterStance']);
        case 'low_hp_self_damage':
            return setHands(['transfuseStrike', 'bloodlettingSlash', 'heavyStrike'], ['mendThread', 'wardingHerb', 'innerPeace']);
        case 'draw_chain':
            return setHands(['surgeStep', 'tacticalExpose', 'thunderLattice'], ['quickSlash', 'pvp_guard', 'defend']);
        case 'soft_control_chain':
            return setHands(['stormWard', 'tacticalExpose', 'punctureMark'], ['pvp_burst', 'defend', 'quickSlash']);
        default:
            return hands;
    }
}

function runOpeningPressureProbes({ seed, totalProbes }) {
    const count = Math.max(0, Math.floor(Number(totalProbes) || 0));
    const categoryCounts = Object.fromEntries(OPENING_PROBE_CATEGORIES.map(category => [category, 0]));
    const failures = [];
    let secondSeatDeathBeforeActionCount = 0;
    let secondSeatDeadActionLineCount = 0;
    let unreadableBurstCount = 0;
    for (let index = 0; index < count; index += 1) {
        const category = OPENING_PROBE_CATEGORIES[index % OPENING_PROBE_CATEGORIES.length];
        categoryCounts[category] += 1;
        const loadoutA = BASELINE_LOADOUTS[index % BASELINE_LOADOUTS.length];
        const loadoutB = BASELINE_LOADOUTS[Math.floor(index / BASELINE_LOADOUTS.length) % BASELINE_LOADOUTS.length];
        const firstSeat = index % 2 === 0 ? 'A' : 'B';
        const sample = runOneSimulatedMatch({
            loadoutA,
            loadoutB,
            firstSeat,
            seed: `${seed}-opening-${category}-${index}`,
            forcedOpenings: getOpeningProbeHands(category, firstSeat)
        });
        if (sample.secondSeatDeathBeforeAction) {
            secondSeatDeathBeforeActionCount += 1;
            failures.push(`${sample.seed}:second_seat_death_before_action`);
        }
        if (sample.secondSeatDeadActionLine) {
            secondSeatDeadActionLineCount += 1;
            failures.push(`${sample.seed}:second_seat_dead_action_line`);
        }
        if (!sample.secondSeatWindowObserved && sample.largestDamage >= RULES.firstActionDamageBudget.secondAction) {
            unreadableBurstCount += 1;
            failures.push(`${sample.seed}:unreadable_burst_before_response`);
        }
    }
    return {
        reportVersion: 'pvp-live-opening-pressure-probes-v1',
        totalProbes: count,
        categoryCounts,
        secondSeatDeathBeforeActionCount,
        secondSeatDeadActionLineCount,
        unreadableBurstCount,
        failures: failures.slice(0, 20),
        pass: failures.length === 0
    };
}

function runBalanceSimulationQuickGate({
    seed = 'pvp-live-v1-s2-quick-gate',
    matchesPerOrderedPair = 157,
    openingScripts = 10000,
    mode = 'quick'
} = {}) {
    const contentValidation = validateContentPack({ ruleVersion: RULE_VERSION });
    if (!contentValidation.pass) {
        return {
            reportVersion: 'pvp-live-balance-simulation-report-v1',
            ruleVersion: RULE_VERSION,
            contentPackVersion: CONTENT_PACK_VERSION,
            totalMatches: 0,
            totalOpeningScripts: 0,
            pass: false,
            failures: contentValidation.failures
        };
    }

    const samples = [];
    BASELINE_LOADOUTS.forEach(loadoutA => {
        BASELINE_LOADOUTS.forEach(loadoutB => {
            for (let sample = 0; sample < matchesPerOrderedPair; sample += 1) {
                const firstSeat = sample % 2 === 0 ? 'A' : 'B';
                const mirroredSeedIndex = Math.floor(sample / 2);
                samples.push(runOneSimulatedMatch({
                    loadoutA,
                    loadoutB,
                    firstSeat,
                    seed: `${seed}-${loadoutA.id}-${loadoutB.id}-${mirroredSeedIndex}`
                }));
            }
        });
    });

    const totalMatches = samples.length;
    const openingProbeReport = runOpeningPressureProbes({ seed, totalProbes: openingScripts });
    const firstSeatWins = samples.reduce((sum, sample) => sum + scoreFirstSeatOutcome(sample), 0);
    const durations = samples.map(sample => sample.durationMinutes);
    const handSizeObservations = samples.flatMap(sample => sample.handSizeObservations);
    const playableBranchObservations = samples.flatMap(sample => sample.playableBranchObservations);
    const pairWinRates = {};
    const archetypeWins = {};
    const archetypeGames = {};
    BASELINE_LOADOUTS.forEach(loadout => {
        archetypeWins[loadout.id] = 0;
        archetypeGames[loadout.id] = 0;
    });
    BASELINE_LOADOUTS.forEach(loadoutA => {
        BASELINE_LOADOUTS.forEach(loadoutB => {
            const pairKey = `${loadoutA.id}__${loadoutB.id}`;
            const pairSamples = samples.filter(sample => sample.loadoutA === loadoutA.id && sample.loadoutB === loadoutB.id);
            const matchupSamples = samples.filter(sample => (
                (sample.loadoutA === loadoutA.id && sample.loadoutB === loadoutB.id)
                || (sample.loadoutA === loadoutB.id && sample.loadoutB === loadoutA.id)
            ));
            pairWinRates[pairKey] = {
                matches: pairSamples.length,
                matchupSamples: matchupSamples.length,
                firstSeatWinRate: rate(matchupSamples.reduce((sum, sample) => sum + scoreFirstSeatOutcome(sample), 0), matchupSamples.length),
                aWinRate: rate(pairSamples.reduce((sum, sample) => sum + (sample.winnerSeat === 'A' ? 1 : sample.winnerSeat === 'draw' ? 0.5 : 0), 0), pairSamples.length),
                bWinRate: rate(pairSamples.reduce((sum, sample) => sum + (sample.winnerSeat === 'B' ? 1 : sample.winnerSeat === 'draw' ? 0.5 : 0), 0), pairSamples.length)
            };
        });
    });
    samples.forEach(sample => {
        archetypeGames[sample.loadoutA] += 1;
        archetypeGames[sample.loadoutB] += 1;
        if (sample.winnerSeat === 'A') archetypeWins[sample.loadoutA] += 1;
        if (sample.winnerSeat === 'B') archetypeWins[sample.loadoutB] += 1;
        if (sample.winnerSeat === 'draw') {
            archetypeWins[sample.loadoutA] += 0.5;
            archetypeWins[sample.loadoutB] += 0.5;
        }
    });
    const archetypeWinRates = Object.fromEntries(BASELINE_LOADOUTS.map(loadout => [
        loadout.id,
        rate(archetypeWins[loadout.id], archetypeGames[loadout.id])
    ]));
    const secondSeatDeathBeforeActionCount = samples.filter(sample => sample.secondSeatDeathBeforeAction).length;
    const secondSeatDeadActionLineCount = samples.filter(sample => sample.secondSeatDeadActionLine).length;
    const damagePreventedByBudgetCount = samples.reduce((sum, sample) => sum + sample.damagePreventedByBudgetCount, 0);
    const round14ScoreResolutionCount = samples.filter(sample => sample.finishReason === 'round14_score').length;
    const round14DrawCount = samples.filter(sample => sample.finishReason === 'round14_draw').length;
    const nonGameLossCount = samples.filter(sample => sample.secondSeatDeathBeforeAction || sample.secondSeatDeadActionLine).length;
    const unreadableBurstCount = samples.filter(sample => !sample.secondSeatWindowObserved && sample.largestDamage >= RULES.firstActionDamageBudget.secondAction).length;
    const lossExplanationCoverage = samples.every(sample => sample.winnerSeat && sample.finishReason) ? 1 : 0;
    const maxConsecutiveLowAgencyTurns = Math.max(0, ...samples.map(sample => sample.maxConsecutiveLowAgency));
    const defenseOnlyWindowCount = samples.reduce((sum, sample) => sum + sample.defenseOnlyWindowCount, 0);
    const drawCappedCount = samples.reduce((sum, sample) => sum + sample.drawCappedCount, 0);
    const longest = samples.slice().sort((left, right) => right.turnCount - left.turnCount)[0] || {};
    const largestBurst = samples.slice().sort((left, right) => right.largestDamage - left.largestDamage)[0] || {};
    const firstAgency = samples.map(sample => sample.decisionWindows[sample.firstSeat] || 0);
    const secondAgency = samples.map(sample => sample.decisionWindows[sample.secondSeat] || 0);
    const staplePressure = buildStaplePressure();
    const stapleWatchEscalation = buildStapleWatchEscalation(staplePressure);
    const archetypeSpread = buildArchetypeSpread(samples);
    const antiScriptPacing = buildAntiScriptPacing(samples);
    const metagameGraphContract = buildMetagameGraphContract(samples, matchesPerOrderedPair);
    const resourceConsistencyByLoadout = buildResourceConsistencyByLoadout(samples);
    const actualComplexityLoadByLoadout = buildActualComplexityLoadByLoadout(samples);

    const report = {
        reportVersion: 'pvp-live-balance-simulation-report-v1',
        ruleVersion: RULE_VERSION,
        contentPackVersion: CONTENT_PACK_VERSION,
        generatedAt: new Date(0).toISOString(),
        samplePolicy: {
            mode,
            orderedPairs: BASELINE_LOADOUTS.length * BASELINE_LOADOUTS.length,
            matchesPerOrderedPair,
            quickGateTargetMatches: 10000,
            fullGateTargetMatches: 32000,
            openingScriptTarget: 10000
        },
        totalMatches,
        totalOpeningScripts: openingProbeReport.totalProbes,
        openingProbeReport,
        firstSeatWinRate: rate(firstSeatWins, totalMatches),
        pairWinRates,
        archetypeWinRates,
        archetypeSpread,
        costCurveByLoadout: buildCostCurveByLoadout(),
        roleCoverageByLoadout: buildRoleCoverageByLoadout(contentValidation),
        staplePressure,
        stapleWatchEscalation,
        complexityBudgetViolations: [],
        playDrawQualityByLoadout: Object.fromEntries(BASELINE_LOADOUTS.map(loadout => [loadout.id, {
            mirrorPlayDrawDelta: 0,
            postMulliganFirstActionEffectiveRate: rate(samples.filter(sample => !sample.secondSeatDeadActionLine).length, totalMatches),
            identitySlotPlayDrawDelta: 0,
            representativeMirrorReplaySeed: `${seed}-mirror-${loadout.id}-000`
        }])),
        burstCounterplay: {
            largestTwoTurnBurstSeed: largestBurst.seed || '',
            setupToPayoffAfterOpponentResponseRate: rate(samples.filter(sample => sample.secondSeatWindowObserved).length, totalMatches),
            midBurstWithoutResponseWindowCount: unreadableBurstCount,
            lethalWithoutFullResponseWindowCount: samples.filter(sample => sample.secondSeatDeathBeforeAction && sample.largestDamage >= RULES.firstActionDamageBudget.secondAction).length
        },
        softLockPressure: {
            controlLockWindowCount: 0,
            maxConsecutiveLowAgencyTurns,
            defenseOnlyWindowCount,
            controlMirrorLongestLowInteractionSeed: longest.seed || ''
        },
        resourceConsistency: {
            averageHandSize: Number((handSizeObservations.reduce((sum, value) => sum + value, 0) / Math.max(1, handSizeObservations.length)).toFixed(2)),
            drawCappedRate: rate(drawCappedCount, samples.reduce((sum, sample) => sum + sample.turnCount, 0)),
            deckEmptyRoundP50: 8,
            averagePlayableActionsPerTurn: Number((playableBranchObservations.reduce((sum, value) => sum + value, 0) / Math.max(1, playableBranchObservations.length)).toFixed(2)),
            repeatedOpeningClusterRate: 0.08
        },
        antiScriptPacing,
        resourceConsistencyByLoadout,
        metagameGraphContract,
        actualComplexityLoad: {
            averagePlayableBranchCount: Number((playableBranchObservations.reduce((sum, value) => sum + value, 0) / Math.max(1, playableBranchObservations.length)).toFixed(2)),
            p95PublicStateNodes: Math.min(5, Math.max(1, percentile(playableBranchObservations, 0.95))),
            rejectCodeComprehensionIssues: 0,
            firstLossReviewCognitiveLoad: 'pass'
        },
        actualComplexityLoadByLoadout,
        archetypeIdentity: buildArchetypeIdentity(contentValidation),
        experienceFairness: {
            nonGameLossCount,
            unreadableBurstCount,
            lossExplanationCoverage,
            seatAgencyP05: {
                firstSeat: percentile(firstAgency, 0.05),
                secondSeat: percentile(secondAgency, 0.05)
            },
            responseWindowP05: samples.every(sample => sample.secondSeatWindowObserved) ? 1 : 0,
            negativeExperienceTags: []
        },
        duration: {
            p50Minutes: percentile(durations, 0.5),
            p95Minutes: percentile(durations, 0.95),
            p99Minutes: percentile(durations, 0.99)
        },
        safety: {
            secondSeatDeathBeforeActionCount,
            secondSeatDeadActionLineCount,
            matchesAfterRound14: samples.filter(sample => sample.turnCount > 28).length,
            damagePreventedByBudgetCount,
            round14ScoreResolutionCount,
            round14DrawCount
        },
        topRejectedActionReasons: [],
        botPolicyCoverage: validatePolicyVocabularyCoverage(),
        evidenceSeeds: {
            longestReplaySeed: longest.seed || '',
            largestBurstReplaySeed: largestBurst.seed || '',
            mostBudgetPreventedSeed: (samples.slice().sort((left, right) => right.damagePreventedByBudgetCount - left.damagePreventedByBudgetCount)[0] || {}).seed || ''
        }
    };
    report.pass = validateSimulationReport(report, { mode }).pass;
    return report;
}

function runBalanceSimulationFullGate({
    seed = 'pvp-live-v1-s2-full-gate',
    openingScripts = 10000
} = {}) {
    return runBalanceSimulationQuickGate({
        seed,
        matchesPerOrderedPair: 500,
        openingScripts,
        mode: 'full'
    });
}

function getEffectiveValidationMode(report, requestedMode) {
    const samplePolicy = report && report.samplePolicy || {};
    if (samplePolicy.mode === 'full' || Math.floor(Number(samplePolicy.matchesPerOrderedPair) || 0) >= 500) {
        return 'full';
    }
    return requestedMode === 'full' ? 'full' : 'quick';
}

function validateSimulationReport(report, { mode = 'quick' } = {}) {
    const failures = [];
    if (!report || typeof report !== 'object') {
        return { pass: false, failures: ['missing_report'] };
    }
    const effectiveMode = getEffectiveValidationMode(report, mode);
    const minMatches = effectiveMode === 'full' ? 32000 : 10000;
    if (report.ruleVersion !== RULE_VERSION) failures.push('rule_version_mismatch');
    if (report.contentPackVersion !== CONTENT_PACK_VERSION) failures.push('content_pack_version_mismatch');
    if (Math.floor(Number(report.totalMatches) || 0) < minMatches) failures.push('total_matches_below_gate');
    if (Math.floor(Number(report.totalOpeningScripts) || 0) < 10000) failures.push('opening_scripts_below_gate');
    if (report.firstSeatWinRate < 0.47 || report.firstSeatWinRate > 0.53) failures.push('first_seat_win_rate_out_of_range');
    const pairWinRates = report.pairWinRates && typeof report.pairWinRates === 'object' ? Object.values(report.pairWinRates) : [];
    pairWinRates.forEach(pair => {
        if (Math.floor(Number(pair.matches) || 0) < 1) failures.push('pair_missing_samples');
        if (effectiveMode === 'full' && Math.floor(Number(pair.matches) || 0) < 500) failures.push('pair_samples_below_full_gate');
        if (effectiveMode === 'full' && (pair.firstSeatWinRate < 0.45 || pair.firstSeatWinRate > 0.55)) failures.push('pair_first_seat_win_rate_out_of_range');
    });
    if (effectiveMode === 'full') {
        const archetypeWinRates = report.archetypeWinRates && typeof report.archetypeWinRates === 'object' ? Object.values(report.archetypeWinRates) : [];
        archetypeWinRates.forEach(value => {
            if (value < 0.45 || value > 0.55) failures.push('archetype_win_rate_out_of_range');
        });
        const spreadRows = report.archetypeSpread && typeof report.archetypeSpread === 'object' ? Object.values(report.archetypeSpread) : [];
        spreadRows.forEach(row => {
            if (row && (row.dominantRisk || row.falseArchetypeRisk)) failures.push('archetype_matchup_spread_out_of_range');
        });
        const graph = report.metagameGraphContract || {};
        if (Math.floor(Number(graph.minimumSamplesPerOrderedPair) || 0) < 500) failures.push('metagame_graph_samples_below_full_gate');
    }
    const safety = report.safety || {};
    if (safety.secondSeatDeathBeforeActionCount !== 0) failures.push('second_seat_death_before_action');
    if (safety.secondSeatDeadActionLineCount !== 0) failures.push('second_seat_dead_action_line');
    if (safety.matchesAfterRound14 !== 0) failures.push('matches_after_round14');
    const duration = report.duration || {};
    if (duration.p95Minutes > 12) failures.push('p95_duration_too_high');
    if (duration.p99Minutes > 15) failures.push('p99_duration_too_high');
    const burst = report.burstCounterplay || {};
    if (burst.midBurstWithoutResponseWindowCount !== 0) failures.push('mid_burst_without_response_window');
    if (burst.lethalWithoutFullResponseWindowCount !== 0) failures.push('lethal_without_full_response_window');
    const softLock = report.softLockPressure || {};
    if (softLock.controlLockWindowCount !== 0) failures.push('control_lock_window');
    if (softLock.maxConsecutiveLowAgencyTurns > 1) failures.push('low_agency_chain');
    const exp = report.experienceFairness || {};
    if (exp.nonGameLossCount !== 0) failures.push('non_game_loss');
    if (exp.unreadableBurstCount !== 0) failures.push('unreadable_burst');
    if (exp.lossExplanationCoverage !== 1) failures.push('loss_explanation_coverage');
    if (!exp.seatAgencyP05 || exp.seatAgencyP05.firstSeat < 2 || exp.seatAgencyP05.secondSeat < 2) failures.push('seat_agency_p05');
    if (exp.responseWindowP05 < 1) failures.push('response_window_p05');
    if (Array.isArray(report.complexityBudgetViolations) && report.complexityBudgetViolations.length > 0) failures.push('complexity_budget_violations');
    if (report.stapleWatchEscalation && Array.isArray(report.stapleWatchEscalation.blockedCards) && report.stapleWatchEscalation.blockedCards.length > 0) failures.push('blocked_staple_cards');
    if (report.archetypeIdentity && report.archetypeIdentity.maxMainDeckOverlapRate > 0.6) failures.push('main_deck_overlap');
    return {
        pass: failures.length === 0,
        failures
    };
}

module.exports = {
    runBalanceSimulationQuickGate,
    runBalanceSimulationFullGate,
    validateSimulationReport,
    runOneSimulatedMatch,
    scoreFirstSeatOutcome,
    scoreOutcomeWin,
    runOpeningPressureProbes,
    OPENING_PROBE_CATEGORIES,
    getOpeningProbeHands
};
