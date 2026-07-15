const { cloneJson, hashCanonical, stableStringify } = require('./canonical');

const PROTOCOL_VERSION = 'authoritative-run-v2';
const CONTENT_VERSION = 'authoritative-trials-v8';
const RELAY_EXPEDITION_SCENARIO_IDS = ['vanguard', 'bulwark', 'insight'];
const FATE_CHRONICLE_SCENARIO_IDS = [
    'chronicle-ember-guard',
    'chronicle-ember-edge',
    'chronicle-ember-proof',
    'chronicle-mirror-guard',
    'chronicle-mirror-edge',
    'chronicle-mirror-audit',
    'chronicle-rift-guard',
    'chronicle-rift-edge',
    'chronicle-rift-seal'
];

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(entry => deepFreeze(entry));
    return value;
}

const CONTENT_SNAPSHOT = deepFreeze({
    protocolVersion: PROTOCOL_VERSION,
    contentVersion: CONTENT_VERSION,
    routeContracts: {
        version: 1,
        reportVersion: 'authoritative-route-contract-v1',
        profiles: {
            steady: {
                contractId: 'steady',
                label: '稳进',
                riskTier: 'low',
                riskLabel: '低风险',
                difficultyTier: 'steady',
                difficultyLabel: '稳压',
                difficultyRating: 1,
                rewardTier: 'standard',
                rewardLabel: '标准回报',
                enemyAdjustments: {
                    maxHpBps: 10000,
                    intentDamageBonus: 0,
                    intentBlockBonus: 0
                },
                rewardAdjustments: {
                    extraCardOffers: 0,
                    healBonus: 0,
                    maxHpBonus: 0
                },
                scoreBonus: 0
            },
            contested: {
                contractId: 'contested',
                label: '争衡',
                riskTier: 'medium',
                riskLabel: '中风险',
                difficultyTier: 'pressured',
                difficultyLabel: '增压',
                difficultyRating: 2,
                rewardTier: 'enhanced',
                rewardLabel: '加码回报',
                enemyAdjustments: {
                    maxHpBps: 11250,
                    intentDamageBonus: 1,
                    intentBlockBonus: 1
                },
                rewardAdjustments: {
                    extraCardOffers: 0,
                    healBonus: 1,
                    maxHpBonus: 1
                },
                scoreBonus: 25
            },
            perilous: {
                contractId: 'perilous',
                label: '险锋',
                riskTier: 'high',
                riskLabel: '高风险',
                difficultyTier: 'severe',
                difficultyLabel: '高压',
                difficultyRating: 3,
                rewardTier: 'premium',
                rewardLabel: '丰厚回报',
                enemyAdjustments: {
                    maxHpBps: 12500,
                    intentDamageBonus: 2,
                    intentBlockBonus: 2
                },
                rewardAdjustments: {
                    extraCardOffers: 1,
                    healBonus: 3,
                    maxHpBonus: 2
                },
                scoreBonus: 55
            }
        },
        stagePairs: [
            ['steady', 'contested'],
            ['steady', 'perilous'],
            ['contested', 'perilous'],
            ['steady', 'perilous'],
            ['contested', 'perilous']
        ]
    },
    combatTactics: {
        version: 2,
        reportVersion: 'authoritative-combat-tactics-v2',
        rewardCardPool: ['warding_stride', 'sealbreaker'],
        profiles: {
            attack: {
                tacticId: 'answer_attack',
                title: '迎击双解',
                prompt: '稳住伤势，或用攻式后接守式夺回节奏。',
                lines: [
                    {
                        lineId: 'brace',
                        tier: 'standard',
                        title: '基础解 · 守势',
                        prompt: '建立足够格挡，直接压低本次伤害。',
                        blockThresholdBps: 7000,
                        minBlockThreshold: 4,
                        damageReduction: 2,
                        rewardSummary: '本次敌方伤害减少 2 点。'
                    },
                    {
                        lineId: 'counterflow',
                        tier: 'advanced',
                        title: '逆解 · 先攻后守',
                        prompt: '先出攻式，再出守式，并在 3 张牌内完成。',
                        sequence: ['attack', 'guard'],
                        maxCardsPlayed: 3,
                        blockThresholdBps: 5000,
                        minBlockThreshold: 3,
                        damageReduction: 4,
                        rewardSummary: '本次敌方伤害减少 4 点。'
                    }
                ]
            },
            fortify: {
                tacticId: 'answer_fortify',
                title: '破印双解',
                prompt: '持续破阵，或用更少的牌抢在结印前击穿。',
                lines: [
                    {
                        lineId: 'break',
                        tier: 'standard',
                        title: '基础解 · 破阵',
                        prompt: '造成足够伤害，压缩敌方即将形成的格挡。',
                        damageThresholdBps: 7500,
                        minDamageThreshold: 5,
                        blockReductionBps: 5000,
                        rewardSummary: '本次敌方格挡减少一半。'
                    },
                    {
                        lineId: 'swiftbreak',
                        tier: 'advanced',
                        title: '逆解 · 两式速破',
                        prompt: '恰用 2 张牌打出更高伤害。',
                        minCardsPlayed: 2,
                        maxCardsPlayed: 2,
                        damageThresholdBps: 8500,
                        minDamageThreshold: 6,
                        blockReductionBps: 7500,
                        rewardSummary: '本次敌方格挡减少四分之三。'
                    }
                ]
            },
            defend_attack: {
                tacticId: 'answer_balance',
                title: '争衡双解',
                prompt: '同时兼顾攻防，或用守式后接攻式完成逆转。',
                lines: [
                    {
                        lineId: 'balance',
                        tier: 'standard',
                        title: '基础解 · 争衡',
                        prompt: '同时完成进攻与防守，拆解攻守一体。',
                        damageThresholdBps: 5000,
                        blockThresholdBps: 5000,
                        minDamageThreshold: 4,
                        minBlockThreshold: 3,
                        damageReduction: 2,
                        blockReduction: 2,
                        rewardSummary: '本次敌方伤害与格挡各减少 2 点。'
                    },
                    {
                        lineId: 'turnabout',
                        tier: 'advanced',
                        title: '逆解 · 先守后攻',
                        prompt: '先出守式，再出攻式，并在 3 张牌内完成。',
                        sequence: ['guard', 'attack'],
                        maxCardsPlayed: 3,
                        damageThresholdBps: 5000,
                        blockThresholdBps: 5000,
                        minDamageThreshold: 4,
                        minBlockThreshold: 3,
                        damageReduction: 3,
                        blockReduction: 3,
                        rewardSummary: '本次敌方伤害与格挡各减少 3 点。'
                    }
                ]
            }
        }
    },
    deckCrafting: {
        version: 1,
        reportVersion: 'authoritative-deck-crafting-v1',
        cardOfferCount: 2,
        healAmount: 10,
        healThresholdPercent: 55,
        maxCardsRemoved: 2,
        maxHpAmount: 5,
        minBlockCards: 2,
        minDamageCards: 2,
        minDeckSize: 8,
        removeUnlockStage: 2
    },
    cards: {
        strike: {
            cardId: 'strike',
            name: '破势',
            description: '造成 8 点伤害。',
            cost: 1,
            effect: { damage: 8 },
            upgrade: {
                name: '破势·极',
                description: '造成 10 点伤害。',
                cost: 1,
                effect: { damage: 10 }
            }
        },
        guard: {
            cardId: 'guard',
            name: '守心',
            description: '获得 6 点格挡。',
            cost: 1,
            effect: { block: 6 },
            upgrade: {
                name: '守心·极',
                description: '获得 8 点格挡。',
                cost: 1,
                effect: { block: 8 }
            }
        },
        insight: {
            cardId: 'insight',
            name: '观微',
            description: '抽 2 张牌。',
            cost: 1,
            effect: { draw: 2 }
        },
        sky_pierce: {
            cardId: 'sky_pierce',
            name: '穿云',
            description: '造成 13 点伤害。',
            cost: 2,
            effect: { damage: 13 },
            upgrade: {
                name: '穿云·极',
                description: '造成 16 点伤害。',
                cost: 2,
                effect: { damage: 16 }
            }
        },
        iron_mandate: {
            cardId: 'iron_mandate',
            name: '铁律',
            description: '获得 12 点格挡。',
            cost: 2,
            effect: { block: 12 },
            upgrade: {
                name: '铁律·极',
                description: '获得 15 点格挡。',
                cost: 2,
                effect: { block: 15 }
            }
        },
        life_siphon: {
            cardId: 'life_siphon',
            name: '归息',
            description: '造成 4 点伤害并回复 3 点生命。',
            cost: 1,
            effect: { damage: 4, heal: 3 },
            upgrade: {
                name: '归息·极',
                description: '造成 5 点伤害并回复 4 点生命。',
                cost: 1,
                effect: { damage: 5, heal: 4 }
            }
        },
        fracture: {
            cardId: 'fracture',
            name: '裂隙',
            description: '造成 4 点伤害，并施加 1 层易伤。',
            cost: 1,
            effect: { damage: 4, vulnerable: 1 }
        },
        flowing_qi: {
            cardId: 'flowing_qi',
            name: '流炁',
            description: '获得 1 点能量并抽 1 张牌。',
            cost: 1,
            effect: { energy: 1, draw: 1 }
        },
        ember_riposte: {
            cardId: 'ember_riposte',
            name: '照火反锋',
            description: '造成 6 点伤害并获得 4 点格挡。',
            cost: 1,
            effect: { damage: 6, block: 4 },
            upgrade: {
                name: '照火反锋·极',
                description: '造成 8 点伤害并获得 5 点格挡。',
                cost: 1,
                effect: { damage: 8, block: 5 }
            }
        },
        mirror_breath: {
            cardId: 'mirror_breath',
            name: '镜息',
            description: '获得 5 点格挡并回复 3 点生命。',
            cost: 1,
            effect: { block: 5, heal: 3 },
            upgrade: {
                name: '镜息·极',
                description: '获得 7 点格挡并回复 4 点生命。',
                cost: 1,
                effect: { block: 7, heal: 4 }
            }
        },
        severing_flow: {
            cardId: 'severing_flow',
            name: '截流',
            description: '造成 7 点伤害并获得 1 点能量。',
            cost: 1,
            effect: { damage: 7, energy: 1 },
            upgrade: {
                name: '截流·极',
                description: '造成 9 点伤害并获得 1 点能量。',
                cost: 1,
                effect: { damage: 9, energy: 1 }
            }
        },
        archive_surge: {
            cardId: 'archive_surge',
            name: '归卷冲霄',
            description: '造成 11 点伤害并抽 1 张牌。',
            cost: 2,
            effect: { damage: 11, draw: 1 },
            upgrade: {
                name: '归卷冲霄·极',
                description: '造成 13 点伤害并抽 1 张牌。',
                cost: 2,
                effect: { damage: 13, draw: 1 }
            }
        },
        warding_stride: {
            cardId: 'warding_stride',
            name: '承势步',
            description: '获得 4 点格挡；若敌方意图包含攻击，额外获得 4 点格挡。',
            cost: 1,
            effect: { block: 4, bonusBlockAgainstAttack: 4 },
            upgrade: {
                name: '承势步·极',
                description: '获得 5 点格挡；若敌方意图包含攻击，额外获得 4 点格挡。',
                cost: 1,
                effect: { block: 5, bonusBlockAgainstAttack: 4 }
            }
        },
        sealbreaker: {
            cardId: 'sealbreaker',
            name: '破印诀',
            description: '造成 9 点伤害；若敌方已有格挡，额外造成 7 点伤害。',
            cost: 2,
            effect: { damage: 9, bonusDamageAgainstBlock: 7 },
            upgrade: {
                name: '破印诀·极',
                description: '造成 11 点伤害；若敌方已有格挡，额外造成 7 点伤害。',
                cost: 2,
                effect: { damage: 11, bonusDamageAgainstBlock: 7 }
            }
        }
    },
    starterDeck: [
        'strike', 'strike', 'strike', 'strike', 'strike',
        'guard', 'guard', 'guard', 'guard', 'insight'
    ],
    rewardCardPool: ['sky_pierce', 'iron_mandate', 'life_siphon', 'fracture', 'flowing_qi'],
    enemies: {
        ink_scout: {
            enemyId: 'ink_scout', name: '墨痕斥候', maxHp: 24, threat: '常规',
            pattern: [
                { type: 'attack', amount: 5, label: '试探 5' },
                { type: 'defend_attack', block: 4, amount: 3, label: '结印 4 / 反击 3' },
                { type: 'attack', amount: 7, label: '突袭 7' }
            ]
        },
        ash_acolyte: {
            enemyId: 'ash_acolyte', name: '烬火道童', maxHp: 26, threat: '常规',
            pattern: [
                { type: 'attack', amount: 6, label: '烬火 6' },
                { type: 'fortify', block: 7, label: '护焰 7' },
                { type: 'attack', amount: 8, label: '爆燃 8' }
            ]
        },
        oath_scribe: {
            enemyId: 'oath_scribe', name: '誓文录事', maxHp: 25, threat: '常规',
            pattern: [
                { type: 'fortify', block: 5, label: '誓纸 5' },
                { type: 'attack', amount: 7, label: '落印 7' },
                { type: 'defend_attack', block: 3, amount: 5, label: '封卷 3 / 追责 5' }
            ]
        },
        oath_guard: {
            enemyId: 'oath_guard', name: '天契守卫', maxHp: 35, threat: '精英',
            pattern: [
                { type: 'attack', amount: 7, label: '横断 7' },
                { type: 'fortify', block: 8, label: '镇契 8' },
                { type: 'attack', amount: 10, label: '重裁 10' }
            ]
        },
        mirror_seer: {
            enemyId: 'mirror_seer', name: '照命术士', maxHp: 34, threat: '精英',
            pattern: [
                { type: 'defend_attack', block: 5, amount: 5, label: '镜返 5 / 5' },
                { type: 'attack', amount: 9, label: '照骨 9' },
                { type: 'fortify', block: 9, label: '藏形 9' }
            ]
        },
        chain_colossus: {
            enemyId: 'chain_colossus', name: '锁天巨像', maxHp: 38, threat: '精英',
            pattern: [
                { type: 'fortify', block: 10, label: '铸锁 10' },
                { type: 'attack', amount: 9, label: '坠链 9' },
                { type: 'attack', amount: 11, label: '镇压 11' }
            ]
        },
        fate_warden: {
            enemyId: 'fate_warden', name: '司命镇守', maxHp: 50, threat: '首领', boss: true,
            pattern: [
                { type: 'attack', amount: 8, label: '命裁 8' },
                { type: 'defend_attack', block: 7, amount: 5, label: '天衡 7 / 5' },
                { type: 'attack', amount: 12, label: '断命 12' }
            ]
        },
        trial_adjudicator: {
            enemyId: 'trial_adjudicator', name: '验算判官', maxHp: 56, threat: '首领', boss: true,
            pattern: [
                { type: 'attack', amount: 9, label: '驳卷 9' },
                { type: 'fortify', block: 9, label: '复核 9' },
                { type: 'attack', amount: 13, label: '否决 13' }
            ]
        },
        rift_sovereign: {
            enemyId: 'rift_sovereign', name: '裂界君主', maxHp: 60, threat: '首领', boss: true,
            pattern: [
                { type: 'defend_attack', block: 6, amount: 7, label: '界幕 6 / 7' },
                { type: 'attack', amount: 10, label: '裂空 10' },
                { type: 'attack', amount: 12, label: '界崩 12' }
            ]
        },
        ember_revenant: {
            enemyId: 'ember_revenant', name: '照火残影', maxHp: 30, threat: '常规',
            pattern: [
                { type: 'attack', amount: 6, label: '余焰 6' },
                { type: 'defend_attack', block: 4, amount: 4, label: '藏锋 4 / 反灼 4' },
                { type: 'attack', amount: 8, label: '焚心 8' }
            ]
        },
        mirror_duelist: {
            enemyId: 'mirror_duelist', name: '镜命剑客', maxHp: 37, threat: '精英',
            pattern: [
                { type: 'defend_attack', block: 5, amount: 5, label: '映守 5 / 返剑 5' },
                { type: 'attack', amount: 9, label: '辨真 9' },
                { type: 'fortify', block: 8, label: '镜界 8' }
            ]
        },
        void_archivist: {
            enemyId: 'void_archivist', name: '虚卷司书', maxHp: 43, threat: '精英',
            pattern: [
                { type: 'fortify', block: 7, label: '封卷 7' },
                { type: 'attack', amount: 10, label: '删命 10' },
                { type: 'defend_attack', block: 5, amount: 7, label: '归档 5 / 追索 7' }
            ]
        },
        heaven_breaker: {
            enemyId: 'heaven_breaker', name: '裂天执卷者', maxHp: 68, threat: '终章首领', boss: true,
            pattern: [
                { type: 'attack', amount: 9, label: '开卷 9' },
                { type: 'defend_attack', block: 8, amount: 7, label: '天衡 8 / 逆裁 7' },
                { type: 'attack', amount: 14, label: '裂天 14' }
            ]
        }
    },
    scenarios: {
        pve: {
            scenarioId: 'pve_defiance_path',
            mode: 'pve',
            title: '逆命正途',
            description: '均衡的三战路线，重在读懂意图并稳住攻防节奏。',
            maxHp: 50,
            energyPerTurn: 3,
            handSize: 5,
            turnBudget: 0,
            betweenEncounterHeal: 0,
            scoreMultiplier: 1,
            rewardCardPool: ['sky_pierce', 'iron_mandate', 'life_siphon', 'fracture', 'ember_riposte', 'mirror_breath'],
            rewardProfile: {
                upgradePriority: ['strike', 'guard', 'ember_riposte', 'life_siphon', 'sky_pierce'],
                removePriority: ['strike', 'guard']
            },
            stages: [
                { type: 'enemy', pool: ['ink_scout', 'ash_acolyte', 'oath_scribe'] },
                { type: 'elite', pool: ['oath_guard', 'mirror_seer', 'chain_colossus'] },
                { type: 'boss', pool: ['fate_warden'] }
            ]
        },
        challenge: {
            scenarioId: 'challenge_heavenly_audit',
            mode: 'challenge',
            title: '天劫验算',
            description: '生命更紧、总回合受限，要求更主动地把防守转成终结。',
            maxHp: 46,
            energyPerTurn: 3,
            handSize: 5,
            turnBudget: 16,
            betweenEncounterHeal: 1,
            scoreMultiplier: 1.25,
            rewardCardPool: ['sky_pierce', 'fracture', 'severing_flow', 'archive_surge', 'ember_riposte', 'flowing_qi'],
            rewardProfile: {
                healAmount: 8,
                healThresholdPercent: 45,
                upgradePriority: ['sky_pierce', 'strike', 'severing_flow', 'archive_surge', 'ember_riposte'],
                removePriority: ['guard', 'strike']
            },
            stages: [
                { type: 'trial', pool: ['ash_acolyte', 'oath_scribe', 'ink_scout'] },
                { type: 'trial', pool: ['mirror_seer', 'oath_guard', 'chain_colossus'] },
                { type: 'boss', pool: ['trial_adjudicator'] }
            ]
        },
        expedition: {
            scenarioId: 'expedition_rift_route',
            mode: 'expedition',
            title: '裂界远征',
            description: '敌人更厚，但每战后会整备回复，考验跨战资源规划。',
            maxHp: 56,
            energyPerTurn: 3,
            handSize: 5,
            turnBudget: 0,
            betweenEncounterHeal: 4,
            scoreMultiplier: 1.1,
            rewardCardPool: ['iron_mandate', 'life_siphon', 'mirror_breath', 'ember_riposte', 'insight', 'flowing_qi'],
            rewardProfile: {
                healAmount: 12,
                healThresholdPercent: 60,
                upgradePriority: ['life_siphon', 'mirror_breath', 'guard', 'iron_mandate', 'ember_riposte'],
                removePriority: ['strike', 'guard']
            },
            stages: [
                { type: 'expedition', pool: ['ink_scout', 'ash_acolyte', 'oath_scribe'] },
                { type: 'expedition_elite', pool: ['chain_colossus', 'oath_guard', 'mirror_seer'] },
                { type: 'boss', pool: ['rift_sovereign'] }
            ]
        },
        vanguard: {
            scenarioId: 'vanguard',
            mode: 'relay_expedition',
            title: '破阵谱',
            description: '偏主动进攻的标准化接力谱，以更快的收束换取更高的失误成本。',
            maxHp: 48,
            energyPerTurn: 3,
            handSize: 5,
            turnBudget: 0,
            betweenEncounterHeal: 0,
            scoreMultiplier: 1,
            starterDeck: [
                'strike', 'strike', 'strike', 'strike',
                'guard', 'guard',
                'insight',
                'sky_pierce',
                'flowing_qi',
                'fracture'
            ],
            rewardCardPool: ['sky_pierce', 'fracture', 'severing_flow', 'archive_surge', 'ember_riposte', 'flowing_qi'],
            rewardProfile: {
                healAmount: 8,
                healThresholdPercent: 45,
                upgradePriority: ['sky_pierce', 'strike', 'severing_flow', 'ember_riposte', 'archive_surge'],
                removePriority: ['guard', 'strike']
            },
            stages: [
                { type: 'relay', pool: ['ink_scout', 'ash_acolyte', 'oath_scribe'] },
                { type: 'relay_elite', pool: ['mirror_seer', 'oath_guard', 'chain_colossus'] },
                { type: 'boss', pool: ['trial_adjudicator'] }
            ]
        },
        bulwark: {
            scenarioId: 'bulwark',
            mode: 'relay_expedition',
            title: '守脉谱',
            description: '偏稳健与护盾容错的标准化接力谱，不继承上一棒残局。',
            maxHp: 60,
            energyPerTurn: 3,
            handSize: 5,
            turnBudget: 0,
            betweenEncounterHeal: 0,
            scoreMultiplier: 1,
            starterDeck: [
                'strike', 'strike', 'strike',
                'guard', 'guard', 'guard', 'guard',
                'insight',
                'iron_mandate',
                'life_siphon'
            ],
            rewardCardPool: ['iron_mandate', 'life_siphon', 'mirror_breath', 'ember_riposte', 'guard', 'insight'],
            rewardProfile: {
                healAmount: 12,
                healThresholdPercent: 65,
                upgradePriority: ['iron_mandate', 'guard', 'life_siphon', 'mirror_breath', 'ember_riposte'],
                removePriority: ['strike', 'guard']
            },
            stages: [
                { type: 'relay', pool: ['ink_scout', 'ash_acolyte', 'oath_scribe'] },
                { type: 'relay_elite', pool: ['chain_colossus', 'oath_guard', 'mirror_seer'] },
                { type: 'boss', pool: ['rift_sovereign'] }
            ]
        },
        insight: {
            scenarioId: 'insight',
            mode: 'relay_expedition',
            title: '观星谱',
            description: '偏抽滤与节奏调整的标准化接力谱，不读取账号既有收藏或存档。',
            maxHp: 52,
            energyPerTurn: 3,
            handSize: 5,
            turnBudget: 0,
            betweenEncounterHeal: 0,
            scoreMultiplier: 1,
            starterDeck: [
                'strike', 'strike', 'strike',
                'guard', 'guard',
                'insight', 'insight',
                'flowing_qi', 'flowing_qi',
                'fracture'
            ],
            rewardCardPool: ['insight', 'flowing_qi', 'fracture', 'severing_flow', 'archive_surge', 'mirror_breath'],
            rewardProfile: {
                healThresholdPercent: 50,
                upgradePriority: ['severing_flow', 'archive_surge', 'strike', 'mirror_breath'],
                removePriority: ['strike', 'guard']
            },
            stages: [
                { type: 'relay', pool: ['ash_acolyte', 'oath_scribe', 'ink_scout'] },
                { type: 'relay_elite', pool: ['mirror_seer', 'chain_colossus', 'oath_guard'] },
                { type: 'boss', pool: ['trial_adjudicator'] }
            ]
        },
        'chronicle-ember-guard': {
            scenarioId: 'chronicle-ember-guard',
            mode: 'fate_chronicle',
            title: '照火问心 · 守誓',
            description: '用护盾与调息稳住三战长线，适合先读懂敌意再反击。',
            maxHp: 60,
            energyPerTurn: 3,
            handSize: 5,
            turnBudget: 0,
            betweenEncounterHeal: 3,
            scoreMultiplier: 1,
            starterDeck: [
                'strike', 'strike', 'strike',
                'guard', 'guard', 'guard',
                'insight', 'iron_mandate', 'life_siphon', 'ember_riposte'
            ],
            rewardCardPool: ['iron_mandate', 'life_siphon', 'ember_riposte', 'mirror_breath', 'flowing_qi'],
            rewardProfile: {
                healAmount: 12,
                healThresholdPercent: 65,
                upgradePriority: ['guard', 'iron_mandate', 'life_siphon', 'mirror_breath', 'ember_riposte'],
                removePriority: ['strike', 'guard']
            },
            stages: [
                { type: 'chronicle', pool: ['ink_scout', 'ash_acolyte', 'ember_revenant'] },
                { type: 'chronicle_elite', pool: ['oath_guard', 'mirror_seer', 'mirror_duelist'] },
                { type: 'boss', pool: ['fate_warden'] }
            ]
        },
        'chronicle-ember-edge': {
            scenarioId: 'chronicle-ember-edge',
            mode: 'fate_chronicle',
            title: '照火问心 · 锋誓',
            description: '以易伤与能量换取主动收束，失误空间更小但路线更短促。',
            maxHp: 50,
            energyPerTurn: 3,
            handSize: 5,
            turnBudget: 20,
            betweenEncounterHeal: 1,
            scoreMultiplier: 1.12,
            starterDeck: [
                'strike', 'strike', 'strike', 'strike',
                'guard', 'guard',
                'insight', 'fracture', 'severing_flow', 'ember_riposte'
            ],
            rewardCardPool: ['sky_pierce', 'fracture', 'severing_flow', 'archive_surge', 'flowing_qi'],
            rewardProfile: {
                healAmount: 8,
                healThresholdPercent: 42,
                upgradePriority: ['severing_flow', 'strike', 'sky_pierce', 'archive_surge'],
                removePriority: ['guard', 'strike']
            },
            stages: [
                { type: 'chronicle', pool: ['ash_acolyte', 'ember_revenant', 'oath_scribe'] },
                { type: 'chronicle_elite', pool: ['mirror_duelist', 'oath_guard', 'chain_colossus'] },
                { type: 'boss', pool: ['trial_adjudicator'] }
            ]
        },
        'chronicle-ember-proof': {
            scenarioId: 'chronicle-ember-proof',
            mode: 'fate_chronicle',
            title: '照火问心 · 定稿誓',
            description: '先用一战读取当前构筑，再在稳稿与抢稿之间锁定后半卷。',
            maxHp: 56,
            energyPerTurn: 3,
            handSize: 5,
            turnBudget: 24,
            betweenEncounterHeal: 2,
            scoreMultiplier: 1.15,
            starterDeck: [
                'strike', 'strike', 'strike',
                'guard', 'guard',
                'insight', 'ember_riposte', 'mirror_breath', 'fracture', 'flowing_qi'
            ],
            rewardCardPool: ['ember_riposte', 'mirror_breath', 'fracture', 'flowing_qi', 'severing_flow'],
            rewardProfile: {
                healAmount: 10,
                healThresholdPercent: 55,
                upgradePriority: ['ember_riposte', 'mirror_breath', 'severing_flow', 'strike'],
                removePriority: ['strike', 'guard']
            },
            branchPlan: {
                version: 1,
                triggerStage: 2,
                title: '照火定稿',
                prompt: '首战已经给出构筑证据。稳住血线再收束，还是把现有节奏兑现成高压路线？',
                options: [
                    {
                        branchId: 'proof_hold',
                        title: '稳稿',
                        description: '先把血线与防守反击写稳，再用司命镇守完成归卷。',
                        counterplay: '首战失血较多，或尚未拿到稳定进攻循环时选择。',
                        buildFocus: '护盾、回复、反击与稳定精修。',
                        consequenceSummary: '当前站走稳进合同，后续首领开放稳进或争衡。',
                        enemyId: 'oath_guard',
                        contractId: 'steady',
                        rewardCardPool: ['iron_mandate', 'mirror_breath', 'life_siphon', 'ember_riposte'],
                        rewardProfile: {
                            healAmount: 13,
                            healThresholdPercent: 68,
                            upgradePriority: ['guard', 'iron_mandate', 'mirror_breath', 'life_siphon']
                        },
                        futureStages: {
                            '3': { type: 'boss', pool: ['fate_warden'], contractIds: ['steady', 'contested'] }
                        }
                    },
                    {
                        branchId: 'proof_rush',
                        title: '抢稿',
                        description: '把已经成形的攻击循环立即兑现，用高压路线换更强构筑候选。',
                        counterplay: '血线健康且易伤、能量或终结牌已经衔接时选择。',
                        buildFocus: '易伤、能量循环与短回合终结。',
                        consequenceSummary: '当前站走险锋合同，后续首领只开放争衡或险锋。',
                        enemyId: 'mirror_duelist',
                        contractId: 'perilous',
                        rewardCardPool: ['fracture', 'severing_flow', 'sky_pierce', 'archive_surge'],
                        rewardProfile: {
                            cardOfferCount: 3,
                            healThresholdPercent: 42,
                            upgradePriority: ['severing_flow', 'sky_pierce', 'archive_surge', 'strike']
                        },
                        futureStages: {
                            '3': { type: 'boss', pool: ['trial_adjudicator'], contractIds: ['contested', 'perilous'] }
                        }
                    }
                ]
            },
            stages: [
                { type: 'chronicle', pool: ['ink_scout', 'ash_acolyte', 'ember_revenant'] },
                { type: 'chronicle_elite', pool: ['oath_guard', 'mirror_duelist'] },
                { type: 'boss', pool: ['fate_warden'] }
            ]
        },
        'chronicle-mirror-guard': {
            scenarioId: 'chronicle-mirror-guard',
            mode: 'fate_chronicle',
            title: '镜命辨真 · 守誓',
            description: '四战中持续修复生命与手牌质量，容许一次路线判断失误。',
            maxHp: 64,
            energyPerTurn: 3,
            handSize: 5,
            turnBudget: 0,
            betweenEncounterHeal: 3,
            scoreMultiplier: 1.08,
            starterDeck: [
                'strike', 'strike', 'strike',
                'guard', 'guard', 'guard',
                'insight', 'mirror_breath', 'life_siphon', 'ember_riposte'
            ],
            rewardCardPool: ['iron_mandate', 'life_siphon', 'mirror_breath', 'ember_riposte', 'insight'],
            rewardProfile: {
                healAmount: 12,
                healThresholdPercent: 65,
                upgradePriority: ['mirror_breath', 'life_siphon', 'guard', 'iron_mandate', 'ember_riposte'],
                removePriority: ['strike', 'guard']
            },
            stages: [
                { type: 'chronicle', pool: ['ink_scout', 'oath_scribe', 'ember_revenant'] },
                { type: 'chronicle', pool: ['ash_acolyte', 'ember_revenant', 'oath_scribe'] },
                { type: 'chronicle_elite', pool: ['mirror_seer', 'mirror_duelist', 'void_archivist'] },
                { type: 'boss', pool: ['trial_adjudicator'] }
            ]
        },
        'chronicle-mirror-edge': {
            scenarioId: 'chronicle-mirror-edge',
            mode: 'fate_chronicle',
            title: '镜命辨真 · 锋誓',
            description: '在回合预算内连续完成四战，奖励能量循环与攻击节奏。',
            maxHp: 52,
            energyPerTurn: 3,
            handSize: 5,
            turnBudget: 28,
            betweenEncounterHeal: 1,
            scoreMultiplier: 1.2,
            starterDeck: [
                'strike', 'strike', 'strike',
                'guard', 'guard',
                'insight', 'fracture', 'flowing_qi', 'severing_flow', 'archive_surge'
            ],
            rewardCardPool: ['sky_pierce', 'fracture', 'flowing_qi', 'severing_flow', 'archive_surge'],
            rewardProfile: {
                healAmount: 8,
                healThresholdPercent: 42,
                upgradePriority: ['severing_flow', 'archive_surge', 'strike', 'sky_pierce'],
                removePriority: ['guard', 'strike']
            },
            stages: [
                { type: 'chronicle', pool: ['ash_acolyte', 'ember_revenant', 'ink_scout'] },
                { type: 'chronicle', pool: ['oath_scribe', 'ember_revenant', 'ash_acolyte'] },
                { type: 'chronicle_elite', pool: ['mirror_duelist', 'chain_colossus', 'void_archivist'] },
                { type: 'boss', pool: ['rift_sovereign'] }
            ]
        },
        'chronicle-mirror-audit': {
            scenarioId: 'chronicle-mirror-audit',
            mode: 'fate_chronicle',
            title: '镜命辨真 · 审镜誓',
            description: '前两战积累构筑证据，中段决定继续校验结构还是立刻兑付节奏。',
            maxHp: 60,
            energyPerTurn: 3,
            handSize: 5,
            turnBudget: 34,
            betweenEncounterHeal: 2,
            scoreMultiplier: 1.18,
            starterDeck: [
                'strike', 'strike', 'strike',
                'guard', 'guard',
                'insight', 'insight', 'mirror_breath', 'fracture', 'flowing_qi'
            ],
            rewardCardPool: ['insight', 'mirror_breath', 'fracture', 'flowing_qi', 'severing_flow'],
            rewardProfile: {
                healAmount: 10,
                healThresholdPercent: 54,
                upgradePriority: ['mirror_breath', 'flowing_qi', 'severing_flow', 'insight'],
                removePriority: ['strike', 'guard']
            },
            branchPlan: {
                version: 1,
                triggerStage: 3,
                title: '镜命审计',
                prompt: '牌组已经暴露真实形态。继续修正结构，还是把循环直接兑付为终局压力？',
                options: [
                    {
                        branchId: 'audit_verify',
                        title: '先校验',
                        description: '保留精修与裁牌空间，以较稳的首领合同检验牌组。',
                        counterplay: '牌组仍偏厚，或关键牌尚未精修时选择。',
                        buildFocus: '抽滤、精修、裁牌与稳定回复。',
                        consequenceSummary: '当前站争衡，后续首领开放稳进或争衡。',
                        enemyId: 'mirror_seer',
                        contractId: 'contested',
                        rewardCardPool: ['insight', 'mirror_breath', 'iron_mandate', 'life_siphon'],
                        rewardProfile: {
                            healThresholdPercent: 62,
                            removeUnlockStage: 2,
                            upgradePriority: ['mirror_breath', 'insight', 'iron_mandate', 'life_siphon'],
                            removePriority: ['strike', 'guard']
                        },
                        futureStages: {
                            '4': { type: 'boss', pool: ['trial_adjudicator'], contractIds: ['steady', 'contested'] }
                        }
                    },
                    {
                        branchId: 'audit_cashout',
                        title: '先兑付',
                        description: '停止继续修稿，把能量循环和易伤立即兑现为终局攻势。',
                        counterplay: '牌组已经精简并能稳定连续出牌时选择。',
                        buildFocus: '能量、易伤、连续出牌与攻击精修。',
                        consequenceSummary: '当前站险锋，后续首领只开放争衡或险锋。',
                        scoreMultiplier: 1.26,
                        enemyId: 'void_archivist',
                        contractId: 'perilous',
                        rewardCardPool: ['flowing_qi', 'fracture', 'severing_flow', 'archive_surge'],
                        rewardProfile: {
                            cardOfferCount: 3,
                            healThresholdPercent: 40,
                            upgradePriority: ['severing_flow', 'archive_surge', 'flowing_qi', 'strike']
                        },
                        futureStages: {
                            '4': { type: 'boss', pool: ['trial_adjudicator'], contractIds: ['contested', 'perilous'] }
                        }
                    }
                ]
            },
            stages: [
                { type: 'chronicle', pool: ['ink_scout', 'oath_scribe', 'ash_acolyte'] },
                { type: 'chronicle', pool: ['ember_revenant', 'ash_acolyte', 'oath_scribe'] },
                { type: 'chronicle_elite', pool: ['mirror_seer', 'mirror_duelist'] },
                { type: 'boss', pool: ['trial_adjudicator'] }
            ]
        },
        'chronicle-rift-guard': {
            scenarioId: 'chronicle-rift-guard',
            mode: 'fate_chronicle',
            title: '裂天归卷 · 守誓',
            description: '五战终章以恢复和稳定构筑抵抗长线损耗。',
            maxHp: 70,
            energyPerTurn: 3,
            handSize: 5,
            turnBudget: 0,
            betweenEncounterHeal: 4,
            scoreMultiplier: 1.16,
            starterDeck: [
                'strike', 'strike', 'strike',
                'guard', 'guard', 'guard',
                'insight', 'iron_mandate', 'mirror_breath', 'life_siphon'
            ],
            rewardCardPool: ['iron_mandate', 'life_siphon', 'mirror_breath', 'ember_riposte', 'flowing_qi'],
            rewardProfile: {
                healAmount: 14,
                healThresholdPercent: 68,
                maxHpAmount: 6,
                upgradePriority: ['mirror_breath', 'life_siphon', 'iron_mandate', 'guard', 'ember_riposte'],
                removePriority: ['strike', 'guard']
            },
            stages: [
                { type: 'chronicle', pool: ['ink_scout', 'ash_acolyte', 'ember_revenant'] },
                { type: 'chronicle', pool: ['oath_scribe', 'ember_revenant', 'ash_acolyte'] },
                { type: 'chronicle_elite', pool: ['oath_guard', 'mirror_seer', 'mirror_duelist'] },
                { type: 'chronicle_elite', pool: ['chain_colossus', 'void_archivist', 'mirror_duelist'] },
                { type: 'boss', pool: ['heaven_breaker'] }
            ]
        },
        'chronicle-rift-edge': {
            scenarioId: 'chronicle-rift-edge',
            mode: 'fate_chronicle',
            title: '裂天归卷 · 锋誓',
            description: '五战高压终章，以更强的进攻谱换取更严格的回合与生命容错。',
            maxHp: 56,
            energyPerTurn: 3,
            handSize: 5,
            turnBudget: 38,
            betweenEncounterHeal: 2,
            scoreMultiplier: 1.3,
            starterDeck: [
                'strike', 'strike', 'strike',
                'guard', 'guard',
                'insight', 'fracture', 'severing_flow', 'archive_surge', 'flowing_qi'
            ],
            rewardCardPool: ['sky_pierce', 'fracture', 'severing_flow', 'archive_surge', 'flowing_qi'],
            rewardProfile: {
                healAmount: 9,
                healThresholdPercent: 45,
                upgradePriority: ['severing_flow', 'archive_surge', 'sky_pierce', 'strike'],
                removePriority: ['guard', 'strike']
            },
            stages: [
                { type: 'chronicle', pool: ['ash_acolyte', 'ember_revenant', 'oath_scribe'] },
                { type: 'chronicle', pool: ['ember_revenant', 'ink_scout', 'ash_acolyte'] },
                { type: 'chronicle_elite', pool: ['mirror_duelist', 'oath_guard', 'mirror_seer'] },
                { type: 'chronicle_elite', pool: ['void_archivist', 'chain_colossus', 'mirror_duelist'] },
                { type: 'boss', pool: ['heaven_breaker'] }
            ]
        },
        'chronicle-rift-seal': {
            scenarioId: 'chronicle-rift-seal',
            mode: 'fate_chronicle',
            title: '裂天归卷 · 封卷誓',
            description: '前三战压缩牌组，终章中段判断该保真入卷还是直接抢卷。',
            maxHp: 62,
            energyPerTurn: 3,
            handSize: 5,
            turnBudget: 42,
            betweenEncounterHeal: 2,
            scoreMultiplier: 1.24,
            starterDeck: [
                'strike', 'strike', 'strike',
                'guard', 'guard',
                'insight', 'iron_mandate', 'mirror_breath', 'severing_flow', 'archive_surge'
            ],
            rewardCardPool: ['iron_mandate', 'mirror_breath', 'severing_flow', 'archive_surge', 'flowing_qi'],
            rewardProfile: {
                healAmount: 11,
                healThresholdPercent: 55,
                maxHpAmount: 5,
                upgradePriority: ['severing_flow', 'archive_surge', 'mirror_breath', 'iron_mandate'],
                removePriority: ['strike', 'guard']
            },
            branchPlan: {
                version: 1,
                triggerStage: 4,
                title: '终章封卷',
                prompt: '终结牌、血线和牌组厚度都已定形。保真进首领，还是把最后资源押在抢卷？',
                options: [
                    {
                        branchId: 'seal_preserve',
                        title: '保真',
                        description: '守住可验证的血线与牌组质量，再稳步完成最终封卷。',
                        counterplay: '血线偏低、牌组仍厚或终结牌未精修时选择。',
                        buildFocus: '护盾、回复、精修与最后一次裁牌。',
                        consequenceSummary: '当前站争衡，裂天首领开放稳进或争衡。',
                        enemyId: 'chain_colossus',
                        contractId: 'contested',
                        rewardCardPool: ['iron_mandate', 'mirror_breath', 'life_siphon', 'ember_riposte'],
                        rewardProfile: {
                            healAmount: 14,
                            healThresholdPercent: 66,
                            removeUnlockStage: 2,
                            upgradePriority: ['mirror_breath', 'iron_mandate', 'life_siphon', 'guard']
                        },
                        futureStages: {
                            '5': { type: 'boss', pool: ['heaven_breaker'], contractIds: ['steady', 'contested'] }
                        }
                    },
                    {
                        branchId: 'seal_rush',
                        title: '抢卷',
                        description: '放弃最后缓冲，把精简牌组的全部节奏压进终局。',
                        counterplay: '牌组已经精简，且终结牌与能量循环都已到位时选择。',
                        buildFocus: '薄牌组、攻击精修、能量循环与短回合收官。',
                        consequenceSummary: '当前站险锋，裂天首领只开放争衡或险锋。',
                        scoreMultiplier: 1.32,
                        enemyId: 'void_archivist',
                        contractId: 'perilous',
                        rewardCardPool: ['severing_flow', 'archive_surge', 'sky_pierce', 'fracture'],
                        rewardProfile: {
                            cardOfferCount: 3,
                            healThresholdPercent: 38,
                            upgradePriority: ['severing_flow', 'archive_surge', 'sky_pierce', 'strike']
                        },
                        futureStages: {
                            '5': { type: 'boss', pool: ['heaven_breaker'], contractIds: ['contested', 'perilous'] }
                        }
                    }
                ]
            },
            stages: [
                { type: 'chronicle', pool: ['ink_scout', 'ash_acolyte', 'ember_revenant'] },
                { type: 'chronicle', pool: ['oath_scribe', 'ember_revenant', 'ash_acolyte'] },
                { type: 'chronicle_elite', pool: ['oath_guard', 'mirror_seer', 'mirror_duelist'] },
                { type: 'chronicle_elite', pool: ['chain_colossus', 'void_archivist'] },
                { type: 'boss', pool: ['heaven_breaker'] }
            ]
        }
    }
});

const CONTENT_JSON = stableStringify(CONTENT_SNAPSHOT);
const CONTENT_HASH = hashCanonical(CONTENT_SNAPSHOT);

function getContentSnapshot() {
    return cloneJson(CONTENT_SNAPSHOT);
}

module.exports = {
    CONTENT_HASH,
    CONTENT_JSON,
    CONTENT_SNAPSHOT,
    CONTENT_VERSION,
    FATE_CHRONICLE_SCENARIO_IDS,
    PROTOCOL_VERSION,
    RELAY_EXPEDITION_SCENARIO_IDS,
    getContentSnapshot
};
