const { cloneJson, hashCanonical, stableStringify } = require('./canonical');

const PROTOCOL_VERSION = 'authoritative-run-v2';
const CONTENT_VERSION = 'authoritative-trials-v2';
const RELAY_EXPEDITION_SCENARIO_IDS = ['vanguard', 'bulwark', 'insight'];

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(entry => deepFreeze(entry));
    return value;
}

const CONTENT_SNAPSHOT = deepFreeze({
    protocolVersion: PROTOCOL_VERSION,
    contentVersion: CONTENT_VERSION,
    cards: {
        strike: {
            cardId: 'strike',
            name: '破势',
            description: '造成 8 点伤害。',
            cost: 1,
            effect: { damage: 8 }
        },
        guard: {
            cardId: 'guard',
            name: '守心',
            description: '获得 6 点格挡。',
            cost: 1,
            effect: { block: 6 }
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
            effect: { damage: 13 }
        },
        iron_mandate: {
            cardId: 'iron_mandate',
            name: '铁律',
            description: '获得 12 点格挡。',
            cost: 2,
            effect: { block: 12 }
        },
        life_siphon: {
            cardId: 'life_siphon',
            name: '归息',
            description: '造成 4 点伤害并回复 3 点生命。',
            cost: 1,
            effect: { damage: 4, heal: 3 }
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
            cost: 0,
            effect: { energy: 1, draw: 1 }
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
            betweenEncounterHeal: 2,
            scoreMultiplier: 1.25,
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
            betweenEncounterHeal: 5,
            scoreMultiplier: 1.1,
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
            stages: [
                { type: 'relay', pool: ['ash_acolyte', 'oath_scribe', 'ink_scout'] },
                { type: 'relay_elite', pool: ['mirror_seer', 'chain_colossus', 'oath_guard'] },
                { type: 'boss', pool: ['trial_adjudicator'] }
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
    PROTOCOL_VERSION,
    RELAY_EXPEDITION_SCENARIO_IDS,
    getContentSnapshot
};
