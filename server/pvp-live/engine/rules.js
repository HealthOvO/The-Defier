const RULE_VERSION = 'pvp-live-v1';

const RULES = Object.freeze({
    startingHp: 50,
    startingEnergy: 3,
    startingHandSize: 3,
    drawPerTurn: 3,
    setupReadyTimeoutMs: 45 * 1000,
    maxHandSize: 10,
    firstActionDamageBudget: Object.freeze({
        firstSeat: 18,
        secondSeat: 22,
        secondAction: 28
    }),
    openingProtection: Object.freeze({
        minimumHp: 1
    }),
    openingCounterplay: Object.freeze({
        block: 8
    }),
    openingSecondSeatBuffer: Object.freeze({
        block: 3
    }),
    guardStance: Object.freeze({
        reduction: 2
    }),
    longGame: Object.freeze({
        maxRounds: 14,
        scoreThreshold: 5,
        hpDiffCap: 20,
        effectiveDamageCap: 18,
        effectiveDefenseCap: 12,
        setupConversionCap: 10,
        resourceEfficiencyCap: 8,
        budgetPenaltyCap: 10,
        automationPenaltyCap: 8
    }),
    social: Object.freeze({
        emoteCooldownMs: 3000,
        emotes: Object.freeze({
            respect: Object.freeze({
                id: 'respect',
                label: '抱拳'
            }),
            thinking: Object.freeze({
                id: 'thinking',
                label: '思考'
            }),
            well_played: Object.freeze({
                id: 'well_played',
                label: '妙手'
            })
        })
    }),
    cards: Object.freeze({
        pvp_burst: Object.freeze({
            id: 'pvp_burst',
            name: '破阵爆发',
            cost: 2,
            damage: 19,
            tags: Object.freeze(['damage', 'finisher']),
            pvpRoles: Object.freeze(['finisher'])
        }),
        pvp_strike: Object.freeze({
            id: 'pvp_strike',
            name: '试探斩',
            cost: 1,
            damage: 8,
            tags: Object.freeze(['damage', 'opening']),
            pvpRoles: Object.freeze(['openingActions'])
        }),
        pvp_guard: Object.freeze({
            id: 'pvp_guard',
            name: '护体诀',
            cost: 1,
            block: 7,
            tags: Object.freeze(['defense', 'guard']),
            pvpRoles: Object.freeze(['defenseOrRecovery'])
        }),
        quickSlash: Object.freeze({
            id: 'quickSlash',
            name: '疾斩',
            cost: 1,
            damage: 4,
            tags: Object.freeze(['damage', 'opening']),
            pvpRoles: Object.freeze(['openingActions'])
        }),
        doubleStrike: Object.freeze({
            id: 'doubleStrike',
            name: '双重斩击',
            cost: 1,
            damage: 8,
            tags: Object.freeze(['damage', 'finisher']),
            pvpRoles: Object.freeze(['finisher'])
        }),
        heavyStrike: Object.freeze({
            id: 'heavyStrike',
            name: '重斩',
            cost: 2,
            damage: 12,
            tags: Object.freeze(['damage', 'finisher']),
            pvpRoles: Object.freeze(['finisher'])
        }),
        defend: Object.freeze({
            id: 'defend',
            name: '防御',
            cost: 1,
            block: 5,
            tags: Object.freeze(['defense', 'guard']),
            pvpRoles: Object.freeze(['defenseOrRecovery'])
        }),
        ironWill: Object.freeze({
            id: 'ironWill',
            name: '铁壁',
            cost: 2,
            block: 10,
            tags: Object.freeze(['defense', 'guard']),
            pvpRoles: Object.freeze(['defenseOrRecovery'])
        }),
        shieldBash: Object.freeze({
            id: 'shieldBash',
            name: '盾击',
            cost: 1,
            damage: 4,
            block: 4,
            tags: Object.freeze(['damage', 'defense', 'guard']),
            pvpRoles: Object.freeze(['openingActions', 'defenseOrRecovery'])
        }),
        counterStance: Object.freeze({
            id: 'counterStance',
            name: '反击架势',
            cost: 1,
            block: 6,
            tags: Object.freeze(['defense', 'counter']),
            pvpRoles: Object.freeze(['defenseOrRecovery', 'swapSlots'])
        }),
        innerPeace: Object.freeze({
            id: 'innerPeace',
            name: '内心平和',
            cost: 1,
            block: 4,
            tags: Object.freeze(['defense', 'heal']),
            pvpRoles: Object.freeze(['defenseOrRecovery'])
        }),
        battleCry: Object.freeze({
            id: 'battleCry',
            name: '战吼',
            cost: 1,
            damage: 5,
            tags: Object.freeze(['damage', 'setup']),
            pvpRoles: Object.freeze(['publicSetup'])
        }),
        bloodlettingSlash: Object.freeze({
            id: 'bloodlettingSlash',
            name: '裂脉斩',
            cost: 1,
            damage: 6,
            tags: Object.freeze(['damage', 'setup']),
            pvpRoles: Object.freeze(['publicSetup'])
        }),
        punctureMark: Object.freeze({
            id: 'punctureMark',
            name: '破绽刺',
            cost: 1,
            damage: 4,
            tags: Object.freeze(['damage', 'setup']),
            pvpRoles: Object.freeze(['publicSetup'])
        }),
        tacticalExpose: Object.freeze({
            id: 'tacticalExpose',
            name: '战术破析',
            cost: 1,
            block: 2,
            tags: Object.freeze(['setup', 'draw']),
            pvpRoles: Object.freeze(['publicSetup', 'swapSlots'])
        }),
        surgeStep: Object.freeze({
            id: 'surgeStep',
            name: '疾电步',
            cost: 1,
            block: 6,
            tags: Object.freeze(['defense', 'draw']),
            pvpRoles: Object.freeze(['defenseOrRecovery', 'swapSlots'])
        }),
        forkedNeedle: Object.freeze({
            id: 'forkedNeedle',
            name: '分岔雷针',
            cost: 1,
            damage: 6,
            tags: Object.freeze(['damage', 'chain']),
            pvpRoles: Object.freeze(['openingActions'])
        }),
        thunderLattice: Object.freeze({
            id: 'thunderLattice',
            name: '雷网矩阵',
            cost: 1,
            block: 2,
            tags: Object.freeze(['setup', 'draw']),
            pvpRoles: Object.freeze(['publicSetup', 'swapSlots'])
        }),
        exposedCircuit: Object.freeze({
            id: 'exposedCircuit',
            name: '裸露回路',
            cost: 1,
            damage: 8,
            tags: Object.freeze(['damage', 'setup', 'finisher']),
            pvpRoles: Object.freeze(['publicSetup', 'finisher'])
        }),
        stormWard: Object.freeze({
            id: 'stormWard',
            name: '雷障',
            cost: 1,
            block: 8,
            tags: Object.freeze(['defense', 'control']),
            pvpRoles: Object.freeze(['defenseOrRecovery', 'publicSetup'])
        }),
        mendThread: Object.freeze({
            id: 'mendThread',
            name: '续命丝',
            cost: 1,
            block: 4,
            tags: Object.freeze(['heal', 'defense']),
            pvpRoles: Object.freeze(['defenseOrRecovery'])
        }),
        wardingHerb: Object.freeze({
            id: 'wardingHerb',
            name: '护脉草',
            cost: 1,
            block: 7,
            tags: Object.freeze(['heal', 'defense']),
            pvpRoles: Object.freeze(['defenseOrRecovery'])
        }),
        transfuseStrike: Object.freeze({
            id: 'transfuseStrike',
            name: '输生斩',
            cost: 1,
            damage: 8,
            tags: Object.freeze(['damage', 'heal']),
            pvpRoles: Object.freeze(['openingActions', 'swapSlots'])
        })
    })
});

function cloneRules() {
    return JSON.parse(JSON.stringify(RULES));
}

function getCardDefinition(cardId) {
    return RULES.cards[cardId] || null;
}

module.exports = {
    RULE_VERSION,
    RULES,
    cloneRules,
    getCardDefinition
};
