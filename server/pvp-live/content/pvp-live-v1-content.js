const { RULE_VERSION, RULES } = require('../engine/rules');

const CONTENT_PACK_VERSION = 'pvp-live-v1-content-pack';

const ROLE_KEYS = Object.freeze([
    'openingActions',
    'defenseOrRecovery',
    'publicSetup',
    'finisher',
    'swapSlots'
]);

function pairDeck(ids) {
    return ids.flatMap(id => ([
        { id, upgraded: false },
        { id, upgraded: false }
    ]));
}

const BASELINE_BOT_POLICIES = Object.freeze([
    {
        id: 'aggro_pressure',
        label: '快攻压迫策略',
        priority: ['play_lethal_if_legal', 'spend_energy_on_best_damage', 'play_visible_setup', 'play_defense_if_energy_left', 'end_turn']
    },
    {
        id: 'tempo_mark',
        label: '节奏破绽策略',
        priority: ['play_visible_setup', 'play_payoff_after_setup', 'spend_energy_on_best_damage', 'play_defense_if_energy_left', 'end_turn']
    },
    {
        id: 'shield_counter',
        label: '守势反击策略',
        priority: ['prevent_death', 'play_defense_if_energy_left', 'play_lethal_if_legal', 'spend_energy_on_best_damage', 'end_turn']
    },
    {
        id: 'soft_control',
        label: '软控消耗策略',
        priority: ['play_visible_setup', 'prevent_death', 'play_defense_if_energy_left', 'spend_energy_on_best_damage', 'end_turn']
    },
    {
        id: 'low_hp_counter',
        label: '低血反击策略',
        priority: ['prevent_death', 'play_lethal_if_legal', 'spend_energy_on_best_damage', 'play_defense_if_energy_left', 'end_turn']
    },
    {
        id: 'vulnerable_combo',
        label: '易伤组合策略',
        priority: ['play_visible_setup', 'play_payoff_after_setup', 'play_lethal_if_legal', 'spend_energy_on_best_damage', 'end_turn']
    },
    {
        id: 'draw_midrange',
        label: '过牌中速策略',
        priority: ['play_defense_if_energy_left', 'spend_energy_on_best_damage', 'play_visible_setup', 'end_turn']
    },
    {
        id: 'healing_attrition',
        label: '回复消耗策略',
        priority: ['prevent_death', 'play_defense_if_energy_left', 'spend_energy_on_best_damage', 'end_turn']
    }
]);

const BASELINE_LOADOUTS = Object.freeze([
    {
        id: 'aggro_pressure',
        label: '快攻压迫',
        identitySlot: 'pvp_fate_starter_aggro',
        botPolicyId: 'aggro_pressure',
        expectedProfile: { speed: 'fast', burst: 'medium', defense: 'low', attrition: 'low', control: 'low' },
        deck: [
            ...pairDeck(['doubleStrike', 'battleCry', 'bloodlettingSlash', 'forkedNeedle', 'defend', 'surgeStep', 'innerPeace', 'tacticalExpose', 'counterStance']),
            { id: 'pvp_burst', upgraded: false },
            { id: 'quickSlash', upgraded: false }
        ]
    },
    {
        id: 'tempo_mark',
        label: '节奏破绽',
        identitySlot: 'pvp_fate_starter_tempo',
        botPolicyId: 'tempo_mark',
        expectedProfile: { speed: 'medium', burst: 'medium', defense: 'medium', attrition: 'low', control: 'medium' },
        deck: pairDeck(['punctureMark', 'exposedCircuit', 'forkedNeedle', 'pvp_strike', 'heavyStrike', 'thunderLattice', 'tacticalExpose', 'stormWard', 'surgeStep', 'pvp_guard'])
    },
    {
        id: 'shield_counter',
        label: '守势反击',
        identitySlot: 'pvp_fate_starter_shield',
        botPolicyId: 'shield_counter',
        expectedProfile: { speed: 'slow', burst: 'low', defense: 'high', attrition: 'medium', control: 'low' },
        deck: pairDeck(['shieldBash', 'quickSlash', 'doubleStrike', 'pvp_strike', 'battleCry', 'pvp_guard', 'defend', 'ironWill', 'counterStance', 'innerPeace'])
    },
    {
        id: 'soft_control',
        label: '软控消耗',
        identitySlot: 'pvp_fate_starter_control',
        botPolicyId: 'soft_control',
        expectedProfile: { speed: 'medium', burst: 'low', defense: 'medium', attrition: 'medium', control: 'high' },
        deck: pairDeck(['shieldBash', 'pvp_strike', 'bloodlettingSlash', 'battleCry', 'exposedCircuit', 'tacticalExpose', 'pvp_guard', 'stormWard', 'counterStance', 'defend'])
    },
    {
        id: 'low_hp_counter',
        label: '低血反击',
        identitySlot: 'pvp_fate_starter_counter',
        botPolicyId: 'low_hp_counter',
        expectedProfile: { speed: 'medium', burst: 'high', defense: 'medium', attrition: 'medium', control: 'low' },
        deck: pairDeck(['transfuseStrike', 'bloodlettingSlash', 'quickSlash', 'pvp_strike', 'exposedCircuit', 'mendThread', 'wardingHerb', 'innerPeace', 'pvp_guard', 'counterStance'])
    },
    {
        id: 'vulnerable_combo',
        label: '易伤组合',
        identitySlot: 'pvp_fate_starter_combo',
        botPolicyId: 'vulnerable_combo',
        expectedProfile: { speed: 'medium', burst: 'high', defense: 'low', attrition: 'low', control: 'medium' },
        deck: pairDeck(['exposedCircuit', 'battleCry', 'pvp_strike', 'transfuseStrike', 'doubleStrike', 'tacticalExpose', 'thunderLattice', 'stormWard', 'defend', 'wardingHerb'])
    },
    {
        id: 'draw_midrange',
        label: '过牌中速',
        identitySlot: 'pvp_fate_starter_midrange',
        botPolicyId: 'draw_midrange',
        expectedProfile: { speed: 'medium', burst: 'medium', defense: 'medium', attrition: 'medium', control: 'low' },
        deck: pairDeck(['surgeStep', 'forkedNeedle', 'shieldBash', 'pvp_strike', 'doubleStrike', 'exposedCircuit', 'thunderLattice', 'innerPeace', 'defend', 'counterStance'])
    },
    {
        id: 'healing_attrition',
        label: '回复消耗',
        identitySlot: 'pvp_fate_starter_healing',
        botPolicyId: 'healing_attrition',
        expectedProfile: { speed: 'slow', burst: 'low', defense: 'high', attrition: 'high', control: 'low' },
        deck: pairDeck(['transfuseStrike', 'shieldBash', 'doubleStrike', 'battleCry', 'punctureMark', 'mendThread', 'wardingHerb', 'ironWill', 'surgeStep', 'defend'])
    }
]);

function getCard(cardId) {
    return RULES.cards && RULES.cards[cardId] ? RULES.cards[cardId] : null;
}

function getTags(cardId) {
    const card = getCard(cardId);
    return Array.isArray(card && card.tags) ? card.tags : [];
}

function getRoles(cardId) {
    const card = getCard(cardId);
    return Array.isArray(card && card.pvpRoles) ? card.pvpRoles : [];
}

function hasInteraction(cardId) {
    const card = getCard(cardId);
    const tags = getTags(cardId);
    return !!(card && card.block > 0) || tags.some(tag => ['defense', 'guard', 'heal', 'setup', 'draw', 'control', 'counter'].includes(tag));
}

function getLoadoutCardIds(loadout) {
    return Array.isArray(loadout && loadout.deck)
        ? loadout.deck.map(entry => String(entry && entry.id || '')).filter(Boolean)
        : [];
}

function summarizeLoadout(loadout) {
    const ids = getLoadoutCardIds(loadout);
    const counts = new Map();
    ids.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
    const uniqueIds = Array.from(counts.keys());
    const costBuckets = { zeroCost: 0, oneCost: 0, twoCost: 0, threePlusCost: 0 };
    let totalCost = 0;
    let directDamageCards = 0;
    let interactionCards = 0;
    const roleCoverage = ROLE_KEYS.reduce((acc, key) => ({ ...acc, [key]: false }), {});
    ids.forEach(id => {
        const card = getCard(id);
        const cost = Math.max(0, Math.floor(Number(card && card.cost) || 0));
        totalCost += cost;
        if (cost <= 0) costBuckets.zeroCost += 1;
        else if (cost === 1) costBuckets.oneCost += 1;
        else if (cost === 2) costBuckets.twoCost += 1;
        else costBuckets.threePlusCost += 1;
        if (card && card.damage > 0) directDamageCards += 1;
        if (hasInteraction(id)) interactionCards += 1;
        getRoles(id).forEach(role => {
            if (Object.prototype.hasOwnProperty.call(roleCoverage, role)) roleCoverage[role] = true;
        });
    });
    return {
        id: loadout.id,
        deckSize: ids.length,
        uniqueCards: uniqueIds.length,
        maxCopies: Math.max(0, ...Array.from(counts.values())),
        ...costBuckets,
        averageCost: ids.length > 0 ? Number((totalCost / ids.length).toFixed(2)) : 0,
        directDamageCards,
        interactionCards,
        roleCoverage
    };
}

function computeMaxMainDeckOverlapRate(loadouts = BASELINE_LOADOUTS) {
    let maxOverlap = 0;
    for (let i = 0; i < loadouts.length; i += 1) {
        const left = new Set(getLoadoutCardIds(loadouts[i]));
        for (let j = i + 1; j < loadouts.length; j += 1) {
            const right = new Set(getLoadoutCardIds(loadouts[j]));
            const overlap = Array.from(left).filter(id => right.has(id)).length;
            const denominator = Math.max(1, Math.min(left.size, right.size));
            maxOverlap = Math.max(maxOverlap, overlap / denominator);
        }
    }
    return Number(maxOverlap.toFixed(3));
}

function validateContentPack({ ruleVersion = RULE_VERSION } = {}) {
    const failures = [];
    const policyIds = new Set(BASELINE_BOT_POLICIES.map(policy => policy.id));
    const loadoutIds = new Set();
    const summaries = {};
    const roleCoverageByLoadout = {};
    BASELINE_LOADOUTS.forEach(loadout => {
        if (loadoutIds.has(loadout.id)) failures.push(`duplicate_loadout:${loadout.id}`);
        loadoutIds.add(loadout.id);
        if (!policyIds.has(loadout.botPolicyId)) failures.push(`missing_policy:${loadout.id}:${loadout.botPolicyId}`);
        const ids = getLoadoutCardIds(loadout);
        if (ids.length !== 20) failures.push(`invalid_deck_size:${loadout.id}:${ids.length}`);
        ids.forEach(id => {
            const card = getCard(id);
            if (!card) failures.push(`unknown_card:${loadout.id}:${id}`);
            if (card && Math.floor(Number(card.cost) || 0) <= 0) failures.push(`zero_cost_card:${loadout.id}:${id}`);
        });
        const summary = summarizeLoadout(loadout);
        summaries[loadout.id] = summary;
        roleCoverageByLoadout[loadout.id] = summary.roleCoverage;
        if (summary.maxCopies > 2) failures.push(`too_many_copies:${loadout.id}:${summary.maxCopies}`);
        if (summary.oneCost < 10) failures.push(`too_few_one_cost:${loadout.id}:${summary.oneCost}`);
        if (summary.directDamageCards > 10) failures.push(`too_many_direct_damage:${loadout.id}:${summary.directDamageCards}`);
        if (summary.interactionCards < 8) failures.push(`too_few_interaction:${loadout.id}:${summary.interactionCards}`);
        ROLE_KEYS.forEach(role => {
            if (!summary.roleCoverage[role]) failures.push(`missing_role:${loadout.id}:${role}`);
        });
    });
    if (BASELINE_LOADOUTS.length !== 8) failures.push(`invalid_loadout_count:${BASELINE_LOADOUTS.length}`);
    if (BASELINE_BOT_POLICIES.length !== 8) failures.push(`invalid_policy_count:${BASELINE_BOT_POLICIES.length}`);
    const maxMainDeckOverlapRate = computeMaxMainDeckOverlapRate();
    if (maxMainDeckOverlapRate > 0.6) failures.push(`main_deck_overlap:${maxMainDeckOverlapRate}`);
    const summaryList = Object.values(summaries);
    return {
        reportVersion: 'pvp-live-content-pack-validation-v1',
        contentPackVersion: CONTENT_PACK_VERSION,
        ruleVersion,
        pass: failures.length === 0,
        failures,
        loadoutCount: BASELINE_LOADOUTS.length,
        policyCount: BASELINE_BOT_POLICIES.length,
        zeroCostCardCount: summaryList.reduce((sum, item) => sum + item.zeroCost, 0),
        maxSingleCardCopies: Math.max(0, ...summaryList.map(item => item.maxCopies)),
        minOneCostCards: Math.min(...summaryList.map(item => item.oneCost)),
        minInteractionCards: Math.min(...summaryList.map(item => item.interactionCards)),
        maxDirectDamageCards: Math.max(...summaryList.map(item => item.directDamageCards)),
        maxMainDeckOverlapRate,
        costCurveByLoadout: summaries,
        roleCoverageByLoadout
    };
}

function getBaselineLoadout(id) {
    return BASELINE_LOADOUTS.find(loadout => loadout.id === id) || null;
}

function getBaselinePolicy(id) {
    return BASELINE_BOT_POLICIES.find(policy => policy.id === id) || null;
}

function makeLoadoutCandidate(id) {
    const loadout = getBaselineLoadout(id);
    if (!loadout) return null;
    return {
        identitySlot: loadout.identitySlot,
        label: loadout.label,
        deck: loadout.deck.map(entry => ({ id: entry.id, upgraded: !!entry.upgraded }))
    };
}

module.exports = {
    CONTENT_PACK_VERSION,
    ROLE_KEYS,
    BASELINE_LOADOUTS,
    BASELINE_BOT_POLICIES,
    getBaselineLoadout,
    getBaselinePolicy,
    getTags,
    getRoles,
    summarizeLoadout,
    validateContentPack,
    computeMaxMainDeckOverlapRate,
    makeLoadoutCandidate
};
