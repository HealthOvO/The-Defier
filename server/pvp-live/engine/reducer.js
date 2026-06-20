const { RULE_VERSION, RULES, getCardDefinition } = require('./rules');
const { createInitialLiveState, cloneState } = require('./state');
const { projectStateView } = require('./state-view');

function stableFingerprint(intent) {
    return JSON.stringify({
        intentType: intent.intentType,
        payload: intent.payload || {}
    });
}

function intentKey(intent) {
    return `${intent.seatId}:${intent.intentId}`;
}

function makeEvent(state, eventType, intent, payload = {}, sequence = state.eventSeq + 1) {
    return {
        eventId: `${state.matchId}-evt-${sequence}`,
        sequence,
        eventType,
        matchId: state.matchId,
        actingSeat: intent.seatId,
        visibility: 'public',
        payload
    };
}

function appendEvent(state, events, eventType, intent, payload = {}) {
    events.push(makeEvent(state, eventType, intent, payload, state.eventSeq + events.length + 1));
}

function reject(state, intent, reason, result = 'rejected') {
    return {
        result,
        reason,
        state,
        events: [],
        stateView: state && state.seats && state.seats[intent.seatId] ? projectStateView(state, intent.seatId) : null
    };
}

function accept(newState, intent, events, fingerprint) {
    newState.eventSeq += events.length;
    newState.events.push(...events);
    newState.stateVersion += 1;
    newState.processedIntents[intentKey(intent)] = {
        fingerprint,
        stateVersion: newState.stateVersion,
        events
    };
    return {
        result: 'accepted',
        state: newState,
        events,
        stateView: projectStateView(newState, intent.seatId)
    };
}

function acceptNonCombat(newState, intent, events, fingerprint) {
    newState.eventSeq += events.length;
    newState.events.push(...events);
    newState.stateVersion += 1;
    newState.processedIntents[intentKey(intent)] = {
        fingerprint,
        stateVersion: newState.stateVersion,
        events
    };
    return {
        result: 'accepted',
        state: newState,
        events,
        nonCombat: true,
        stateView: projectStateView(newState, intent.seatId)
    };
}

function getOpeningSeatBudget(state, actor) {
    const firstSeat = state && state.setup && (state.setup.firstSeat === 'A' || state.setup.firstSeat === 'B')
        ? state.setup.firstSeat
        : 'A';
    const isFirstSeat = actor.seatId === firstSeat;
    const budget = isFirstSeat
        ? RULES.firstActionDamageBudget.firstSeat
        : RULES.firstActionDamageBudget.secondSeat;
    return Math.max(0, Math.floor(Number(budget) || 0));
}

function getFirstActionBudget(state, actor) {
    if (actor.actionsTaken === 0) {
        return getOpeningSeatBudget(state, actor);
    }
    if (actor.actionsTaken === 1) {
        return RULES.firstActionDamageBudget.secondAction;
    }
    return null;
}

function normalizeCount(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
}

function otherSeat(seatId) {
    return seatId === 'A' ? 'B' : 'A';
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getCardTags(card) {
    const definition = getCardDefinition(card && card.cardId);
    return Array.isArray(definition && definition.tags) ? definition.tags : [];
}

function makePublicStatus(status) {
    return {
        statusId: String(status.statusId || ''),
        label: String(status.label || ''),
        seatId: status.seatId === 'B' ? 'B' : 'A',
        sourceSeat: status.sourceSeat === 'B' ? 'B' : 'A',
        stacks: Math.max(1, Math.floor(Number(status.stacks) || 1)),
        appliedTurnIndex: normalizeCount(status.appliedTurnIndex),
        earliestConsumeTurnIndex: normalizeCount(status.earliestConsumeTurnIndex),
        expiresAtTurnIndex: normalizeCount(status.expiresAtTurnIndex),
        responseWindow: String(status.responseWindow || ''),
        summary: String(status.summary || '').slice(0, 120)
    };
}

function applyPublicSetupStatus(state, intent, card, events) {
    if (!card || card.cardId !== 'punctureMark') return null;
    const targetSeat = intent.payload && intent.payload.targetSeat === 'A' ? 'A' : intent.payload && intent.payload.targetSeat === 'B' ? 'B' : '';
    const target = targetSeat && state.seats[targetSeat];
    if (!target || state.status !== 'active') return null;
    const currentTurn = normalizeCount(state.turnIndex);
    const status = makePublicStatus({
        statusId: 'vulnerable_mark',
        label: '破绽',
        seatId: targetSeat,
        sourceSeat: intent.seatId,
        stacks: 1,
        appliedTurnIndex: currentTurn,
        earliestConsumeTurnIndex: currentTurn + 2,
        expiresAtTurnIndex: currentTurn + 4,
        responseWindow: 'defender_turn_before_payoff',
        summary: '破绽已公开；防守方至少拥有一个行动窗口后才可被兑现。'
    });
    target.publicStatuses = Array.isArray(target.publicStatuses) ? target.publicStatuses.filter(item => item && item.statusId !== status.statusId) : [];
    target.publicStatuses.push(status);
    appendEvent(state, events, 'status_applied', intent, {
        statusId: status.statusId,
        label: status.label,
        seatId: status.seatId,
        sourceSeat: status.sourceSeat,
        stacks: status.stacks,
        appliedTurnIndex: status.appliedTurnIndex,
        earliestConsumeTurnIndex: status.earliestConsumeTurnIndex,
        expiresAtTurnIndex: status.expiresAtTurnIndex,
        responseWindow: status.responseWindow
    });
    return status;
}

function consumePublicPayoffStatus(state, intent, card, events) {
    if (!card || card.cardId !== 'exposedCircuit') return { damageBonus: 0, consumed: null };
    const targetSeat = intent.payload && intent.payload.targetSeat === 'A' ? 'A' : intent.payload && intent.payload.targetSeat === 'B' ? 'B' : '';
    const target = targetSeat && state.seats[targetSeat];
    if (!target || !Array.isArray(target.publicStatuses)) return { damageBonus: 0, consumed: null };
    const currentTurn = normalizeCount(state.turnIndex);
    const statusIndex = target.publicStatuses.findIndex(status => {
        if (!status || status.statusId !== 'vulnerable_mark') return false;
        if (status.sourceSeat !== intent.seatId) return false;
        if (currentTurn < normalizeCount(status.earliestConsumeTurnIndex)) return false;
        if (normalizeCount(status.expiresAtTurnIndex) > 0 && currentTurn > normalizeCount(status.expiresAtTurnIndex)) return false;
        return true;
    });
    if (statusIndex < 0) return { damageBonus: 0, consumed: null };
    const [status] = target.publicStatuses.splice(statusIndex, 1);
    const damageBonus = 6;
    ensureLongGameStats(state.seats[intent.seatId]).publicSetupConversions += 1;
    appendEvent(state, events, 'status_consumed', intent, {
        statusId: status.statusId,
        label: status.label,
        seatId: targetSeat,
        sourceSeat: intent.seatId,
        damageBonus,
        consumedTurnIndex: currentTurn
    });
    return { damageBonus, consumed: status };
}

function mitigatePublicResponseStatus(state, intent, card, events) {
    const tags = getCardTags(card);
    if (!tags.includes('guard') && !tags.includes('defense')) return null;
    const actor = state && state.seats && state.seats[intent.seatId];
    if (!actor || !Array.isArray(actor.publicStatuses)) return null;
    const currentTurn = normalizeCount(state.turnIndex);
    const statusIndex = actor.publicStatuses.findIndex(status => {
        if (!status || status.statusId !== 'vulnerable_mark') return false;
        if (status.seatId !== intent.seatId) return false;
        if (status.sourceSeat === intent.seatId) return false;
        if (currentTurn < normalizeCount(status.appliedTurnIndex)) return false;
        if (currentTurn >= normalizeCount(status.earliestConsumeTurnIndex)) return false;
        if (normalizeCount(status.expiresAtTurnIndex) > 0 && currentTurn > normalizeCount(status.expiresAtTurnIndex)) return false;
        return true;
    });
    if (statusIndex < 0) return null;
    const [status] = actor.publicStatuses.splice(statusIndex, 1);
    appendEvent(state, events, 'status_mitigated', intent, {
        sourceCardId: card.cardId,
        statusId: status.statusId,
        label: status.label,
        seatId: intent.seatId,
        sourceSeat: status.sourceSeat,
        mitigatedBySeat: intent.seatId,
        mitigatedTurnIndex: currentTurn,
        responseWindow: status.responseWindow,
        mitigation: 'guard_response'
    });
    return status;
}

function ensureLongGameStats(seat) {
    if (!seat.longGameStats || typeof seat.longGameStats !== 'object') {
        seat.longGameStats = {};
    }
    [
        'hpDamageDealt',
        'preventedOrRecoveredDamage',
        'publicSetupConversions',
        'resourceEfficientTurns',
        'budgetPenaltyCount',
        'automationCount'
    ].forEach(key => {
        seat.longGameStats[key] = normalizeCount(seat.longGameStats[key]);
    });
    return seat.longGameStats;
}

function getLongGameScore(state, seatId) {
    const seat = state.seats[seatId];
    const opponent = state.seats[otherSeat(seatId)];
    const stats = ensureLongGameStats(seat);
    const longGame = RULES.longGame || {};
    const hpDiff = clamp(
        Math.floor(Number(seat.hp) || 0) - Math.floor(Number(opponent.hp) || 0),
        -Math.max(0, Math.floor(Number(longGame.hpDiffCap) || 20)),
        Math.max(0, Math.floor(Number(longGame.hpDiffCap) || 20))
    );
    const effectiveDamage = Math.min(
        Math.max(0, Math.floor(Number(longGame.effectiveDamageCap) || 18)),
        Math.floor(Math.max(0, stats.hpDamageDealt) / 3)
    );
    const effectiveDefense = Math.min(
        Math.max(0, Math.floor(Number(longGame.effectiveDefenseCap) || 12)),
        Math.floor(Math.max(0, stats.preventedOrRecoveredDamage) / 4)
    );
    const setupConversion = Math.min(
        Math.max(0, Math.floor(Number(longGame.setupConversionCap) || 10)),
        Math.max(0, stats.publicSetupConversions) * 2
    );
    const resourceEfficiency = Math.min(
        Math.max(0, Math.floor(Number(longGame.resourceEfficiencyCap) || 8)),
        Math.max(0, stats.resourceEfficientTurns)
    );
    const budgetPenalty = Math.min(
        Math.max(0, Math.floor(Number(longGame.budgetPenaltyCap) || 10)),
        Math.max(0, stats.budgetPenaltyCount) * 2
    );
    const automationPenalty = Math.min(
        Math.max(0, Math.floor(Number(longGame.automationPenaltyCap) || 8)),
        Math.max(0, stats.automationCount) * 2
    );
    return hpDiff + effectiveDamage + effectiveDefense + setupConversion + resourceEfficiency - budgetPenalty - automationPenalty;
}

function getLongGameResolution(state) {
    const scoreA = getLongGameScore(state, 'A');
    const scoreB = getLongGameScore(state, 'B');
    const scoreDelta = Math.abs(scoreA - scoreB);
    const scoreThreshold = Math.max(1, Math.floor(Number(RULES.longGame && RULES.longGame.scoreThreshold) || 5));
    if (scoreDelta < scoreThreshold) {
        return {
            winnerSeat: 'draw',
            loserSeat: '',
            finishReason: 'round14_draw',
            scoreA,
            scoreB,
            scoreDelta,
            scoreThreshold
        };
    }
    const winnerSeat = scoreA > scoreB ? 'A' : 'B';
    return {
        winnerSeat,
        loserSeat: otherSeat(winnerSeat),
        finishReason: 'round14_score',
        scoreA,
        scoreB,
        scoreDelta,
        scoreThreshold
    };
}

function getOpeningProtectionMinimumHp() {
    return Math.max(0, Math.floor(Number(RULES.openingProtection && RULES.openingProtection.minimumHp) || 0));
}

function shouldTriggerOpeningProtection(target, nextHp) {
    const minimumHp = getOpeningProtectionMinimumHp();
    return minimumHp > 0 && nextHp < minimumHp && normalizeCount(target.turnsTaken) <= 0;
}

function getOpeningCounterplayBlock() {
    return Math.max(0, Math.floor(Number(RULES.openingCounterplay && RULES.openingCounterplay.block) || 0));
}

function getOpeningSecondSeatBufferBlock() {
    return Math.max(0, Math.floor(Number(RULES.openingSecondSeatBuffer && RULES.openingSecondSeatBuffer.block) || 0));
}

function grantOpeningSecondSeatBuffer(state, intent, events, firstSeat) {
    const secondSeat = firstSeat === 'A' ? 'B' : 'A';
    const seat = state && state.seats && state.seats[secondSeat];
    const block = getOpeningSecondSeatBufferBlock();
    if (!seat || block <= 0) return;
    seat.block += block;
    appendEvent(state, events, 'opening_second_seat_buffer_granted', intent, {
        seatId: secondSeat,
        block,
        totalBlock: seat.block,
        firstSeat,
        source: 'opening_second_seat_buffer'
    });
}

function grantOpeningCounterplay(state, intent, events, seatId) {
    const seat = state && state.seats && state.seats[seatId];
    if (!seat || !seat.openingCounterplayPending || seat.openingCounterplayGranted) return;
    if (normalizeCount(seat.turnsTaken) > 0) return;
    const block = getOpeningCounterplayBlock();
    if (block <= 0) return;
    seat.block += block;
    seat.openingCounterplayPending = false;
    seat.openingCounterplayGranted = true;
    appendEvent(state, events, 'opening_counterplay_granted', intent, {
        seatId,
        block,
        totalBlock: seat.block,
        minimumHp: getOpeningProtectionMinimumHp(),
        source: 'opening_protection'
    });
}

function drawCardsForTurn(seat) {
    const drawCount = Math.max(0, Math.floor(Number(RULES.drawPerTurn) || 0));
    const maxHandSize = Math.max(RULES.startingHandSize, Math.floor(Number(RULES.maxHandSize) || RULES.startingHandSize));
    let drawn = 0;
    let capped = false;
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
    return {
        drawn,
        capped,
        handCount: seat.hand.length,
        deckCount: seat.deck.length
    };
}

function applyDamage(state, intent, card, events) {
    const actor = state.seats[intent.seatId];
    const targetSeat = intent.payload && intent.payload.targetSeat;
    const target = state.seats[targetSeat];
    if (!target) {
        return 'invalid_target';
    }

    const rawDamage = Math.max(0, Math.floor(Number(card.damage) || 0));
    if (rawDamage <= 0) {
        return null;
    }
    const actorStats = ensureLongGameStats(actor);

    const budget = getFirstActionBudget(state, actor);
    const actualDamage = budget === null ? rawDamage : Math.min(rawDamage, budget);
    if (actualDamage < rawDamage) {
        appendEvent(state, events, 'budget_clamped', intent, {
            sourceCardId: card.cardId,
            rawDamage,
            actualDamage,
            preventedDamage: rawDamage - actualDamage,
            targetSeat
        });
        if (!actor.playedSetupThisTurn) {
            actorStats.budgetPenaltyCount += 1;
        }
    }

    const blockedDamage = Math.min(target.block, actualDamage);
    target.block -= blockedDamage;
    ensureLongGameStats(target).preventedOrRecoveredDamage += blockedDamage;
    let hpDamage = actualDamage - blockedDamage;
    let targetHp = Math.max(0, target.hp - hpDamage);
    if (shouldTriggerOpeningProtection(target, targetHp)) {
        const minimumHp = getOpeningProtectionMinimumHp();
        const protectedHp = Math.min(Math.max(0, target.maxHp || RULES.startingHp), minimumHp);
        const protectedHpDamage = Math.max(0, target.hp - protectedHp);
        const preventedDamage = Math.max(0, hpDamage - protectedHpDamage);
        hpDamage = protectedHpDamage;
        targetHp = protectedHp;
        target.openingCounterplayPending = true;
        appendEvent(state, events, 'opening_protection_triggered', intent, {
            sourceCardId: card.cardId,
            protectedSeat: targetSeat,
            minimumHp: protectedHp,
            preventedDamage,
            wouldHaveHp: Math.max(0, target.hp - (actualDamage - blockedDamage))
        });
    }
    target.hp = targetHp;
    actorStats.hpDamageDealt += hpDamage;
    if (hpDamage > 0) actor.effectiveActionThisTurn = true;
    appendEvent(state, events, 'damage_applied', intent, {
        sourceCardId: card.cardId,
        rawDamage,
        actualDamage: blockedDamage + hpDamage,
        budgetedDamage: actualDamage,
        blockedDamage,
        hpDamage,
        targetSeat,
        targetHp: target.hp
    });
    if (target.hp <= 0) {
        state.status = 'finished';
        appendEvent(state, events, 'match_finished', intent, {
            winnerSeat: intent.seatId,
            loserSeat: targetSeat,
            finishReason: 'lethal'
        });
    }
    return null;
}

function applyBlock(state, intent, card, events) {
    const actor = state.seats[intent.seatId];
    const block = Math.max(0, Math.floor(Number(card.block) || 0));
    if (block <= 0) return;
    actor.block += block;
    actor.effectiveActionThisTurn = true;
    appendEvent(state, events, 'block_gained', intent, {
        sourceCardId: card.cardId,
        block,
        seatId: actor.seatId,
        totalBlock: actor.block
    });
}

function reducePlayCard(state, intent, fingerprint) {
    if (state.currentSeat !== intent.seatId) {
        return reject(state, intent, 'not_current_turn');
    }
    const actor = state.seats[intent.seatId];
    const cardInstanceId = intent.payload && intent.payload.cardInstanceId;
    const handIndex = actor.hand.findIndex(card => card.instanceId === cardInstanceId);
    if (handIndex < 0) {
        return reject(state, intent, 'card_not_in_hand');
    }

    const newState = cloneState(state);
    const nextActor = newState.seats[intent.seatId];
    const card = nextActor.hand[handIndex];
    if (nextActor.energy < card.cost) {
        return reject(state, intent, 'not_enough_energy');
    }

    const events = [];
    nextActor.energy -= card.cost;
    nextActor.hand.splice(handIndex, 1);
    nextActor.discard.push(card);
    const tags = getCardTags(card);
    if (tags.includes('setup')) nextActor.playedSetupThisTurn = true;

    const payoff = consumePublicPayoffStatus(newState, intent, card, events);
    const resolvedCard = payoff.damageBonus > 0
        ? { ...card, damage: Math.max(0, Math.floor(Number(card.damage) || 0)) + payoff.damageBonus }
        : card;
    const damageError = applyDamage(newState, intent, resolvedCard, events);
    if (damageError) {
        return reject(state, intent, damageError);
    }
    applyBlock(newState, intent, card, events);
    mitigatePublicResponseStatus(newState, intent, card, events);
    applyPublicSetupStatus(newState, intent, card, events);
    if (nextActor.playedSetupThisTurn && !nextActor.setupConvertedThisTurn && !tags.includes('setup') && ((card.damage || 0) > 0 || (card.block || 0) > 0)) {
        ensureLongGameStats(nextActor).publicSetupConversions += 1;
        nextActor.setupConvertedThisTurn = true;
    }
    nextActor.actionsTaken += 1;

    appendEvent(newState, events, 'card_played', intent, {
        cardInstanceId: card.instanceId,
        cardId: card.cardId,
        cost: card.cost,
        remainingEnergy: nextActor.energy
    });

    return accept(newState, intent, events, fingerprint);
}

function reduceEndTurn(state, intent, fingerprint) {
    if (state.currentSeat !== intent.seatId) {
        return reject(state, intent, 'not_current_turn');
    }

    const newState = cloneState(state);
    const nextSeat = intent.seatId === 'A' ? 'B' : 'A';
    const actingSeat = newState.seats[intent.seatId];
    const actingStats = ensureLongGameStats(actingSeat);
    actingSeat.turnsTaken = normalizeCount(actingSeat.turnsTaken) + 1;
    if (actingSeat.effectiveActionThisTurn && actingSeat.energy === 0) {
        actingStats.resourceEfficientTurns += 1;
    }
    if (intent.payload && intent.payload.automated) {
        actingStats.automationCount += 1;
    }
    newState.currentSeat = nextSeat;
    newState.turnIndex += 1;
    if (nextSeat === 'A') {
        newState.roundIndex += 1;
    }
    newState.seats[nextSeat].energy = newState.seats[nextSeat].maxEnergy;
    newState.seats[nextSeat].actionsTaken = 0;
    newState.seats[nextSeat].block = 0;

    const events = [];
    appendEvent(newState, events, 'turn_ended', intent, {
        nextSeat,
        completedTurns: actingSeat.turnsTaken,
        roundIndex: newState.roundIndex,
        turnIndex: newState.turnIndex
    });
    if (nextSeat === 'A' && newState.roundIndex > Math.max(1, Math.floor(Number(RULES.longGame && RULES.longGame.maxRounds) || 14))) {
        const resolution = getLongGameResolution(newState);
        newState.status = 'finished';
        appendEvent(newState, events, 'match_finished', intent, {
            winnerSeat: resolution.winnerSeat,
            loserSeat: resolution.loserSeat,
            finishReason: resolution.finishReason,
            scoreA: resolution.scoreA,
            scoreB: resolution.scoreB,
            scoreDelta: resolution.scoreDelta,
            scoreThreshold: resolution.scoreThreshold,
            roundIndex: Math.max(1, Math.floor(Number(RULES.longGame && RULES.longGame.maxRounds) || 14))
        });
        return accept(newState, intent, events, fingerprint);
    }
    const drawReport = drawCardsForTurn(newState.seats[nextSeat]);
    if (drawReport.drawn > 0 || drawReport.capped) {
        appendEvent(newState, events, 'cards_drawn', intent, {
            seatId: nextSeat,
            count: drawReport.drawn,
            handCount: drawReport.handCount,
            deckCount: drawReport.deckCount,
            capped: drawReport.capped
        });
    }
    grantOpeningCounterplay(newState, intent, events, nextSeat);
    actingSeat.playedSetupThisTurn = false;
    actingSeat.effectiveActionThisTurn = false;
    actingSeat.setupConvertedThisTurn = false;
    newState.seats[nextSeat].playedSetupThisTurn = false;
    newState.seats[nextSeat].effectiveActionThisTurn = false;
    newState.seats[nextSeat].setupConvertedThisTurn = false;
    return accept(newState, intent, events, fingerprint);
}

function getSelectedMulliganIds(intent) {
    const raw = intent.payload && Array.isArray(intent.payload.cardInstanceIds)
        ? intent.payload.cardInstanceIds
        : [];
    const seen = new Set();
    const result = [];
    raw.forEach(value => {
        const id = typeof value === 'string' ? value.trim() : '';
        if (id && !seen.has(id)) {
            seen.add(id);
            result.push(id);
        }
    });
    return result;
}

function reduceMulligan(state, intent, fingerprint) {
    if (state.status !== 'setup') {
        return reject(state, intent, 'mulligan_window_closed');
    }
    const actor = state.seats[intent.seatId];
    if (actor.mulliganUsed) {
        return reject(state, intent, 'mulligan_already_used');
    }
    const selectedIds = getSelectedMulliganIds(intent);
    const limit = Math.max(0, Math.floor(Number(state.setup && state.setup.mulliganLimit) || 2));
    if (selectedIds.length > limit) {
        return reject(state, intent, 'invalid_mulligan_count');
    }
    const missingId = selectedIds.find(id => !actor.hand.some(card => card.instanceId === id));
    if (missingId) {
        return reject(state, intent, 'card_not_in_hand');
    }

    const newState = cloneState(state);
    const nextActor = newState.seats[intent.seatId];
    const replaced = [];
    selectedIds.forEach(cardInstanceId => {
        const index = nextActor.hand.findIndex(card => card.instanceId === cardInstanceId);
        if (index >= 0) {
            replaced.push(nextActor.hand.splice(index, 1)[0]);
        }
    });
    replaced.forEach(card => nextActor.deck.push(card));
    while (nextActor.hand.length < RULES.startingHandSize && nextActor.deck.length > 0) {
        nextActor.hand.push(nextActor.deck.shift());
    }
    nextActor.mulliganUsed = true;

    const events = [];
    appendEvent(newState, events, 'mulligan_completed', intent, {
        seatId: intent.seatId,
        count: replaced.length
    });
    return accept(newState, intent, events, fingerprint);
}

function reduceReady(state, intent, fingerprint) {
    if (state.status !== 'setup') {
        return reject(state, intent, 'ready_window_closed');
    }
    const actor = state.seats[intent.seatId];
    if (actor.ready) {
        return reject(state, intent, 'ready_already_confirmed');
    }

    const newState = cloneState(state);
    const nextActor = newState.seats[intent.seatId];
    nextActor.ready = true;
    nextActor.readyAt = Date.now();

    const events = [];
    appendEvent(newState, events, 'player_ready', intent, {
        seatId: intent.seatId
    });
    if (newState.seats.A.ready && newState.seats.B.ready) {
        const firstSeat = newState.setup && newState.setup.firstSeat ? newState.setup.firstSeat : 'A';
        newState.status = 'active';
        newState.phase = 'main';
        newState.currentSeat = firstSeat;
        newState.setup.battleStartedAt = Date.now();
        appendEvent(newState, events, 'battle_started', intent, {
            firstSeat,
            roundIndex: newState.roundIndex,
            turnIndex: newState.turnIndex
        });
        grantOpeningSecondSeatBuffer(newState, intent, events, firstSeat);
    }
    return accept(newState, intent, events, fingerprint);
}

function reduceSurrender(state, intent, fingerprint) {
    const newState = cloneState(state);
    const loserSeat = intent.seatId;
    const winnerSeat = loserSeat === 'A' ? 'B' : 'A';
    newState.status = 'finished';

    const events = [];
    appendEvent(newState, events, 'player_surrendered', intent, {
        loserSeat,
        winnerSeat
    });
    appendEvent(newState, events, 'match_finished', intent, {
        winnerSeat,
        loserSeat,
        finishReason: 'surrender'
    });
    return accept(newState, intent, events, fingerprint);
}

function getSocialRules() {
    const social = RULES.social && typeof RULES.social === 'object' ? RULES.social : {};
    const emotes = social.emotes && typeof social.emotes === 'object' ? social.emotes : {};
    return {
        emoteCooldownMs: Math.max(0, Math.floor(Number(social.emoteCooldownMs) || 0)),
        emotes
    };
}

function getEmoteDefinition(emoteId) {
    const id = typeof emoteId === 'string' ? emoteId.trim() : '';
    if (!id) return null;
    const social = getSocialRules();
    const definition = social.emotes[id];
    if (!definition) return null;
    return {
        id: String(definition.id || id),
        label: String(definition.label || id).slice(0, 24)
    };
}

function ensureSocialState(state) {
    if (!state.social || typeof state.social !== 'object') {
        state.social = {};
    }
    if (!state.social.emotesBySeat || typeof state.social.emotesBySeat !== 'object') {
        state.social.emotesBySeat = {};
    }
    ['A', 'B'].forEach(seatId => {
        if (!state.social.emotesBySeat[seatId] || typeof state.social.emotesBySeat[seatId] !== 'object') {
            state.social.emotesBySeat[seatId] = {
                lastSentAt: 0,
                count: 0
            };
        }
    });
    return state.social;
}

function reduceEmote(state, intent, fingerprint) {
    if (state.status !== 'setup' && state.status !== 'active') {
        return reject(state, intent, 'match_not_active');
    }
    const emote = getEmoteDefinition(intent.payload && intent.payload.emoteId);
    if (!emote) {
        return reject(state, intent, 'invalid_emote');
    }
    const social = ensureSocialState(state);
    const seatSocial = social.emotesBySeat[intent.seatId] || {};
    const now = Date.now();
    const cooldownMs = getSocialRules().emoteCooldownMs;
    const elapsedMs = now - Math.max(0, Math.floor(Number(seatSocial.lastSentAt) || 0));
    if (seatSocial.lastSentAt && elapsedMs < cooldownMs) {
        return reject(state, intent, 'emote_rate_limited');
    }

    const newState = cloneState(state);
    const nextSocial = ensureSocialState(newState);
    nextSocial.emotesBySeat[intent.seatId].lastSentAt = now;
    nextSocial.emotesBySeat[intent.seatId].count = normalizeCount(nextSocial.emotesBySeat[intent.seatId].count) + 1;

    const events = [];
    appendEvent(newState, events, 'emote_sent', intent, {
        seatId: intent.seatId,
        emoteId: emote.id,
        label: emote.label
    });
    return acceptNonCombat(newState, intent, events, fingerprint);
}

function validateIntentEnvelope(state, intent) {
    if (!state || typeof state !== 'object') return 'missing_state';
    if (!intent || typeof intent !== 'object') return 'missing_intent';
    if (!intent.intentId || typeof intent.intentId !== 'string') return 'missing_intent_id';
    if (!intent.seatId || !state.seats || !state.seats[intent.seatId]) return 'invalid_seat';
    if (intent.matchId !== state.matchId) return 'match_mismatch';
    if (intent.ruleVersion !== state.ruleVersion) return 'rule_version_mismatch';
    return null;
}

function reduceIntent(state, intent) {
    const envelopeError = validateIntentEnvelope(state, intent);
    if (envelopeError) {
        return reject(state, intent || {}, envelopeError);
    }

    const fingerprint = stableFingerprint(intent);
    const previousIntent = state.processedIntents && state.processedIntents[intentKey(intent)];
    if (previousIntent) {
        if (previousIntent.fingerprint !== fingerprint) {
            return reject(state, intent, 'duplicate_action_conflict');
        }
        return {
            result: 'duplicate',
            reason: 'duplicate_action',
            state,
            events: previousIntent.events || [],
            stateView: projectStateView(state, intent.seatId)
        };
    }

    if (intent.stateVersion !== state.stateVersion) {
        return reject(state, intent, 'stale_state', 'sync_required');
    }

    if (intent.intentType === 'emote') {
        return reduceEmote(state, intent, fingerprint);
    }

    if (state.status === 'setup') {
        if (intent.intentType === 'mulligan') {
            return reduceMulligan(state, intent, fingerprint);
        }
        if (intent.intentType === 'ready') {
            return reduceReady(state, intent, fingerprint);
        }
        if (intent.intentType === 'play_card' || intent.intentType === 'end_turn' || intent.intentType === 'surrender') {
            return reject(state, intent, 'setup_not_ready');
        }
        return reject(state, intent, 'unsupported_intent');
    }

    if (state.status !== 'active') {
        return reject(state, intent, 'match_not_active');
    }

    if (intent.intentType === 'play_card') {
        return reducePlayCard(state, intent, fingerprint);
    }
    if (intent.intentType === 'end_turn') {
        return reduceEndTurn(state, intent, fingerprint);
    }
    if (intent.intentType === 'surrender') {
        return reduceSurrender(state, intent, fingerprint);
    }
    return reject(state, intent, 'unsupported_intent');
}

module.exports = {
    RULE_VERSION,
    createInitialLiveState,
    projectStateView,
    reduceIntent
};
