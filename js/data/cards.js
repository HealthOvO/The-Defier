/**
 * The Defier - 卡牌数据
 * 所有游戏卡牌的定义
 */

const CARDS = {
    // ==================== 基础攻击牌 ====================
    strike: {
        id: 'strike',
        name: '斩击',
        type: 'attack',
        cost: 1,
        icon: '⚔️',
        description: '造成 6 点伤害',
        rarity: 'basic',
        effects: [
            { type: 'damage', value: 6, target: 'enemy' }
        ]
    },

    heavyStrike: {
        id: 'heavyStrike',
        name: '重斩',
        type: 'attack',
        cost: 2,
        icon: '🗡️',
        description: '造成 12 点伤害',
        rarity: 'common',
        effects: [
            { type: 'damage', value: 12, target: 'enemy' }
        ]
    },

    quickSlash: {
        id: 'quickSlash',
        name: '疾斩',
        type: 'attack',
        cost: 0,
        icon: '💨',
        description: '造成 4 点伤害',
        rarity: 'common',
        effects: [
            { type: 'damage', value: 4, target: 'enemy' }
        ]
    },

    doubleStrike: {
        id: 'doubleStrike',
        name: '双重斩击',
        type: 'attack',
        cost: 1,
        icon: '⚔️',
        description: '造成 4 点伤害两次',
        rarity: 'common',
        effects: [
            { type: 'damage', value: 4, target: 'enemy' },
            { type: 'damage', value: 4, target: 'enemy' }
        ]
    },

    ragingBlow: {
        id: 'ragingBlow',
        name: '狂暴一击',
        type: 'attack',
        cost: 3,
        icon: '💥',
        description: '造成 20 点伤害',
        rarity: 'uncommon',
        effects: [
            { type: 'damage', value: 20, target: 'enemy' }
        ]
    },

    // ==================== 基础防御牌 ====================
    defend: {
        id: 'defend',
        name: '防御',
        type: 'defense',
        cost: 1,
        icon: '🛡️',
        description: '获得 5 点护盾',
        rarity: 'basic',
        effects: [
            { type: 'block', value: 5, target: 'self' }
        ]
    },

    ironWill: {
        id: 'ironWill',
        name: '铁壁',
        type: 'defense',
        cost: 2,
        icon: '🏰',
        description: '获得 12 点护盾',
        rarity: 'common',
        effects: [
            { type: 'block', value: 12, target: 'self' }
        ]
    },

    shieldBash: {
        id: 'shieldBash',
        name: '盾击',
        type: 'attack',
        cost: 1,
        icon: '🛡️',
        description: '造成 4 点伤害，获得 4 点护盾',
        rarity: 'common',
        effects: [
            { type: 'damage', value: 4, target: 'enemy' },
            { type: 'block', value: 4, target: 'self' }
        ]
    },

    counterStance: {
        id: 'counterStance',
        name: '反击架势',
        type: 'defense',
        cost: 1,
        icon: '⚡',
        description: '获得 3 点护盾，下次受到攻击时反弹 5 点伤害',
        rarity: 'uncommon',
        effects: [
            { type: 'block', value: 3, target: 'self' },
            { type: 'buff', buffType: 'thorns', value: 5, target: 'self' }
        ]
    },

    // ==================== 技能牌 ====================
    spiritBoost: {
        id: 'spiritBoost',
        name: '灵力激涌',
        type: 'energy',
        cost: 0,
        icon: '✨',
        description: '获得 2 点灵力',
        rarity: 'common',
        effects: [
            { type: 'energy', value: 2, target: 'self' }
        ]
    },

    meditation: {
        id: 'meditation',
        name: '冥想',
        type: 'energy',
        cost: 1,
        icon: '🧘',
        description: '抽 2 张牌',
        rarity: 'common',
        effects: [
            { type: 'draw', value: 2, target: 'self' }
        ]
    },

    innerPeace: {
        id: 'innerPeace',
        name: '内心平和',
        type: 'defense',
        cost: 1,
        icon: '☯️',
        description: '获得 4 点护盾，回复 3 点生命',
        rarity: 'uncommon',
        effects: [
            { type: 'block', value: 4, target: 'self' },
            { type: 'heal', value: 3, target: 'self' }
        ]
    },

    battleCry: {
        id: 'battleCry',
        name: '战吼',
        type: 'attack',
        cost: 1,
        icon: '📢',
        description: '造成 5 点伤害，本回合攻击力+2',
        rarity: 'uncommon',
        effects: [
            { type: 'damage', value: 5, target: 'enemy' },
            { type: 'buff', buffType: 'strength', value: 2, target: 'self' }
        ]
    },

    // ==================== 法则牌（紫色） ====================
    thunderLaw: {
        id: 'thunderLaw',
        name: '雷法残章',
        type: 'law',
        cost: 2,
        icon: '⚡',
        description: '造成 8 点伤害，使敌人下回合受到的伤害+3',
        rarity: 'rare',
        lawType: 'thunder',
        effects: [
            { type: 'damage', value: 8, target: 'enemy' },
            { type: 'debuff', buffType: 'vulnerable', value: 3, target: 'enemy' }
        ]
    },

    swordIntent: {
        id: 'swordIntent',
        name: '剑意碎片',
        type: 'law',
        cost: 1,
        icon: '🗡️',
        description: '造成 7 点穿透伤害（无视护盾）',
        rarity: 'rare',
        lawType: 'sword',
        effects: [
            { type: 'penetrate', value: 7, target: 'enemy' }
        ]
    },

    flameTruth: {
        id: 'flameTruth',
        name: '火焰真意',
        type: 'law',
        cost: 2,
        icon: '🔥',
        description: '造成 6 点伤害，使敌人获得 3 层灼烧',
        rarity: 'rare',
        lawType: 'fire',
        effects: [
            { type: 'damage', value: 6, target: 'enemy' },
            { type: 'debuff', buffType: 'burn', value: 3, target: 'enemy' }
        ]
    },

    spaceRift: {
        id: 'spaceRift',
        name: '空间裂隙',
        type: 'law',
        cost: 1,
        icon: '🌀',
        description: '获得 1 层闪避（完全躲避下一次攻击）',
        rarity: 'rare',
        lawType: 'space',
        effects: [
            { type: 'buff', buffType: 'dodge', value: 1, target: 'self' }
        ]
    },

    timeStop: {
        id: 'timeStop',
        name: '时间静止',
        type: 'law',
        cost: 3,
        icon: '⏱️',
        description: '敌人跳过下一回合',
        rarity: 'legendary',
        lawType: 'time',
        effects: [
            { type: 'debuff', buffType: 'stun', value: 1, target: 'enemy' }
        ]
    },

    voidEmbrace: {
        id: 'voidEmbrace',
        name: '虚空拥抱',
        type: 'law',
        cost: 2,
        icon: '🕳️',
        description: '造成敌人已损失生命值50%的伤害',
        rarity: 'legendary',
        lawType: 'void',
        effects: [
            { type: 'execute', value: 0.5, target: 'enemy' }
        ]
    },

    // ==================== 机缘牌（金色） ====================
    luckyStrike: {
        id: 'luckyStrike',
        name: '天降机缘',
        type: 'chance',
        cost: 0,
        icon: '🌟',
        description: '随机造成 5-15 点伤害',
        rarity: 'uncommon',
        effects: [
            { type: 'randomDamage', minValue: 5, maxValue: 15, target: 'enemy' }
        ]
    },

    fortuneWheel: {
        id: 'fortuneWheel',
        name: '命运之轮',
        type: 'chance',
        cost: 1,
        icon: '🎰',
        description: '随机获得 1-3 张临时卡牌',
        rarity: 'rare',
        effects: [
            { type: 'randomCards', minValue: 1, maxValue: 3, target: 'self' }
        ]
    },

    miracleHeal: {
        id: 'miracleHeal',
        name: '奇迹治愈',
        type: 'chance',
        cost: 2,
        icon: '💖',
        description: '回复 15 点生命',
        rarity: 'rare',
        effects: [
            { type: 'heal', value: 15, target: 'self' }
        ]
    },

    // ==================== 2.0新增卡牌 ====================

    // 攻击牌
    sweepingStrike: {
        id: 'sweepingStrike',
        name: '横扫千军',
        type: 'attack',
        cost: 2,
        icon: '🌪️',
        description: '对所有敌人造成 8 点伤害',
        rarity: 'uncommon',
        effects: [
            { type: 'damageAll', value: 8, target: 'allEnemies' }
        ]
    },

    armorBreaker: {
        id: 'armorBreaker',
        name: '破甲一击',
        type: 'attack',
        cost: 1,
        icon: '🔨',
        description: '造成 5 点伤害，移除敌人护盾',
        rarity: 'common',
        effects: [
            { type: 'removeBlock', target: 'enemy' },
            { type: 'damage', value: 5, target: 'enemy' }
        ]
    },

    tripleSlash: {
        id: 'tripleSlash',
        name: '致命连击',
        type: 'attack',
        cost: 1,
        icon: '⚡',
        description: '造成 3 点伤害三次',
        rarity: 'uncommon',
        effects: [
            { type: 'damage', value: 3, target: 'enemy' },
            { type: 'damage', value: 3, target: 'enemy' },
            { type: 'damage', value: 3, target: 'enemy' }
        ]
    },

    earthShatter: {
        id: 'earthShatter',
        name: '天崩地裂',
        type: 'attack',
        cost: 3,
        icon: '🌋',
        description: '造成 25 点伤害，自身受 5 点伤害',
        rarity: 'rare',
        effects: [
            { type: 'damage', value: 25, target: 'enemy' },
            { type: 'selfDamage', value: 5, target: 'self' }
        ]
    },

    swordBreaker: {
        id: 'swordBreaker',
        name: '一剑破万法',
        type: 'attack',
        cost: 2,
        icon: '✨',
        description: '造成 15 点穿透伤害',
        rarity: 'rare',
        effects: [
            { type: 'penetrate', value: 15, target: 'enemy' }
        ]
    },

    bloodSlash: {
        id: 'bloodSlash',
        name: '血刃斩',
        type: 'attack',
        cost: 1,
        icon: '🩸',
        description: '造成 8 点伤害，回复造成伤害的30%生命',
        rarity: 'uncommon',
        effects: [
            { type: 'damage', value: 8, target: 'enemy' },
            { type: 'lifeSteal', value: 0.3, target: 'self' }
        ]
    },

    finishingBlow: {
        id: 'finishingBlow',
        name: '终结一击',
        type: 'attack',
        cost: 2,
        icon: '💀',
        description: '造成 10 点伤害，对生命低于30%的敌人造成双倍',
        rarity: 'rare',
        effects: [
            { type: 'executeDamage', value: 10, threshold: 0.3, target: 'enemy' }
        ]
    },

    // 防御牌
    goldenBell: {
        id: 'goldenBell',
        name: '金钟罩',
        type: 'defense',
        cost: 2,
        icon: '🔔',
        description: '获得 15 点护盾',
        rarity: 'common',
        effects: [
            { type: 'block', value: 15, target: 'self' }
        ]
    },

    offenseDefense: {
        id: 'offenseDefense',
        name: '以攻代守',
        type: 'defense',
        cost: 1,
        icon: '⚔️',
        description: '获得等于你力量值x3的护盾（最少5）',
        rarity: 'uncommon',
        effects: [
            { type: 'blockFromStrength', multiplier: 3, minimum: 5, target: 'self' }
        ]
    },

    halfDamage: {
        id: 'halfDamage',
        name: '天地同寿',
        type: 'defense',
        cost: 2,
        icon: '☯️',
        description: '本回合受到的伤害减半',
        rarity: 'rare',
        effects: [
            { type: 'buff', buffType: 'damageReduction', value: 50, target: 'self' }
        ]
    },

    turtleShell: {
        id: 'turtleShell',
        name: '乌龟壳',
        type: 'defense',
        cost: 0,
        icon: '🐢',
        description: '获得 3 点护盾，抽 1 张牌',
        rarity: 'common',
        effects: [
            { type: 'block', value: 3, target: 'self' },
            { type: 'draw', value: 1, target: 'self' }
        ]
    },

    ironSkin: {
        id: 'ironSkin',
        name: '铁布衫',
        type: 'defense',
        cost: 1,
        icon: '🦾',
        description: '获得 6 点护盾，下回合开始时再获得 4 点',
        rarity: 'uncommon',
        effects: [
            { type: 'block', value: 6, target: 'self' },
            { type: 'buff', buffType: 'nextTurnBlock', value: 4, target: 'self' }
        ]
    },

    // 法则牌
    thunderStorm: {
        id: 'thunderStorm',
        name: '劫雷轰顶',
        type: 'law',
        cost: 2,
        icon: '🌩️',
        description: '造成 10 点伤害，使敌人获得 2 层麻痹',
        rarity: 'rare',
        lawType: 'thunder',
        effects: [
            { type: 'damage', value: 10, target: 'enemy' },
            { type: 'debuff', buffType: 'paralysis', value: 2, target: 'enemy' }
        ]
    },

    inferno: {
        id: 'inferno',
        name: '业火焚天',
        type: 'law',
        cost: 3,
        icon: '🔥',
        description: '造成 8 点伤害3次，每次+1灼烧',
        rarity: 'epic',
        lawType: 'fire',
        effects: [
            { type: 'damage', value: 8, target: 'enemy' },
            { type: 'debuff', buffType: 'burn', value: 1, target: 'enemy' },
            { type: 'damage', value: 8, target: 'enemy' },
            { type: 'debuff', buffType: 'burn', value: 1, target: 'enemy' },
            { type: 'damage', value: 8, target: 'enemy' },
            { type: 'debuff', buffType: 'burn', value: 1, target: 'enemy' }
        ]
    },

    voidWalk: {
        id: 'voidWalk',
        name: '穿梭虚空',
        type: 'law',
        cost: 1,
        icon: '🌀',
        description: '获得 2 层闪避',
        rarity: 'rare',
        lawType: 'space',
        effects: [
            { type: 'buff', buffType: 'dodge', value: 2, target: 'self' }
        ]
    },

    timeRewind: {
        id: 'timeRewind',
        name: '时光倒流',
        type: 'law',
        cost: 4,
        icon: '⏪',
        description: '将弃牌堆洗回抽牌堆',
        rarity: 'epic',
        lawType: 'time',
        effects: [
            { type: 'reshuffleDiscard', target: 'self' }
        ]
    },

    karmaKill: {
        id: 'karmaKill',
        name: '因果律杀',
        type: 'law',
        cost: 3,
        icon: '☠️',
        description: '必定命中，造成敌人最大生命10%的伤害',
        rarity: 'legendary',
        lawType: 'karma',
        effects: [
            { type: 'percentDamage', value: 0.1, target: 'enemy' }
        ]
    },

    iceFreeze: {
        id: 'iceFreeze',
        name: '冰封万里',
        type: 'law',
        cost: 2,
        icon: '❄️',
        description: '造成 7 点伤害，使敌人下回合伤害-3',
        rarity: 'rare',
        lawType: 'ice',
        effects: [
            { type: 'damage', value: 7, target: 'enemy' },
            { type: 'debuff', buffType: 'weak', value: 3, target: 'enemy' }
        ]
    },

    // 机缘牌
    desperateSurvival: {
        id: 'desperateSurvival',
        name: '绝处逢生',
        type: 'chance',
        cost: 0,
        icon: '🆘',
        description: '若生命低于20%，抽3张牌+3灵力',
        rarity: 'rare',
        effects: [
            { type: 'conditionalDraw', condition: 'lowHp', threshold: 0.2, drawValue: 3, energyValue: 3 }
        ]
    },

    windfall: {
        id: 'windfall',
        name: '天降横财',
        type: 'chance',
        cost: 1,
        icon: '💰',
        description: '战斗结束后获得 25-100 灵石',
        rarity: 'uncommon',
        effects: [
            { type: 'bonusGold', min: 25, max: 100 }
        ]
    },

    enlightenment: {
        id: 'enlightenment',
        name: '顿悟',
        type: 'chance',
        cost: 2,
        icon: '💡',
        description: '命环经验+50',
        rarity: 'rare',
        effects: [
            { type: 'ringExp', value: 50 }
        ]
    },

    reversal: {
        id: 'reversal',
        name: '逆转乾坤',
        type: 'chance',
        cost: 3,
        icon: '🔄',
        description: '与敌人交换当前生命值百分比',
        rarity: 'legendary',
        effects: [
            { type: 'swapHpPercent', target: 'enemy' }
        ]
    },

    // 技能牌
    concentration: {
        id: 'concentration',
        name: '聚气',
        type: 'energy',
        cost: 0,
        icon: '🎯',
        description: '下一张攻击牌伤害+5',
        rarity: 'common',
        effects: [
            { type: 'buff', buffType: 'nextAttackBonus', value: 5, target: 'self' }
        ]
    },

    doubleEdge: {
        id: 'doubleEdge',
        name: '双刃',
        type: 'attack',
        cost: 1,
        icon: '🔪',
        description: '造成 10 点伤害，获得 1 层易伤',
        rarity: 'common',
        effects: [
            { type: 'damage', value: 10, target: 'enemy' },
            { type: 'debuff', buffType: 'vulnerable', value: 1, target: 'self' }
        ]
    },

    powerUp: {
        id: 'powerUp',
        name: '蓄力',
        type: 'energy',
        cost: 1,
        icon: '💪',
        description: '获得 2 点力量（永久）',
        rarity: 'uncommon',
        effects: [
            { type: 'buff', buffType: 'strength', value: 2, target: 'self', permanent: true }
        ]
    },

    quickDraw: {
        id: 'quickDraw',
        name: '快抽',
        type: 'energy',
        cost: 0,
        icon: '🃏',
        description: '抽 1 张牌',
        rarity: 'common',
        effects: [
            { type: 'draw', value: 1, target: 'self' }
        ]
    },

    allIn: {
        id: 'allIn',
        name: '破釜沉舟',
        type: 'attack',
        cost: 0,
        icon: '🎲',
        description: '消耗所有灵力，每点灵力造成 6 点伤害',
        rarity: 'rare',
        effects: [
            { type: 'consumeAllEnergy', damagePerEnergy: 6, target: 'enemy' }
        ]
    },

    chaosControl: {
        id: 'chaosControl',
        name: '混沌支配',
        type: 'law',
        cost: 2,
        icon: '🌀',
        description: '造成 5 点伤害，使敌人眩晕1回合',
        rarity: 'legendary',
        lawType: 'chaos',
        effects: [
            effects: [
                { type: 'damage', value: 5, target: 'enemy' },
                { type: 'debuff', buffType: 'stun', value: 1, target: 'enemy' }
            ]
    },

    // ==================== 多角色专属卡牌 ====================
    // 香叶
    poisonTouch: {
        id: 'poisonTouch',
        name: '毒触',
        type: 'attack',
        cost: 1,
        icon: '🤢',
        description: '造成 3 点伤害，给予 2 层中毒',
        rarity: 'common',
        effects: [
            { type: 'damage', value: 3, target: 'enemy' },
            { type: 'debuff', buffType: 'poison', value: 2, target: 'enemy' }
        ]
    },
    minorHeal: {
        id: 'minorHeal',
        name: '小治愈术',
        type: 'skill',
        cost: 1,
        icon: '🩹',
        description: '回复 5 点生命',
        rarity: 'common',
        effects: [
            { type: 'heal', value: 5, target: 'self' }
        ]
    },

    // 无欲
    monkStrike: {
        id: 'monkStrike',
        name: '武僧打击',
        type: 'attack',
        cost: 1,
        icon: '🙏',
        description: '造成 6 点伤害，获得 4 点护盾',
        rarity: 'common',
        effects: [
            { type: 'damage', value: 6, target: 'enemy' },
            { type: 'block', value: 4, target: 'self' }
        ]
    },

    // 严寒
    analysis: {
        id: 'analysis',
        name: '弱点分析',
        type: 'skill',
        cost: 0,
        icon: '🧐',
        description: '抽 1 张牌，使敌人获得 1 层易伤',
        rarity: 'common',
        effects: [
            { type: 'draw', value: 1, target: 'self' },
            { type: 'debuff', buffType: 'vulnerable', value: 1, target: 'enemy' }
        ]
    },
};

// 初始牌组
const STARTER_DECK = [
    'strike', 'strike', 'strike', 'strike', 'strike',
    'defend', 'defend', 'defend', 'defend',
    'spiritBoost'
];

// 卡牌池 - 按稀有度分类（2.0扩展版）
const CARD_POOL = {
    common: [
        'heavyStrike', 'quickSlash', 'doubleStrike', 'ironWill', 'shieldBash',
        'spiritBoost', 'meditation', 'armorBreaker', 'goldenBell', 'turtleShell',
        'concentration', 'doubleEdge', 'quickDraw', // Fix missing comma
        'poisonTouch', 'minorHeal', 'monkStrike', 'analysis'
    ],
    uncommon: [
        'ragingBlow', 'counterStance', 'innerPeace', 'battleCry', 'luckyStrike',
        'sweepingStrike', 'tripleSlash', 'bloodSlash', 'offenseDefense', 'ironSkin',
        'windfall', 'powerUp'
    ],
    rare: [
        'thunderLaw', 'swordIntent', 'flameTruth', 'spaceRift', 'fortuneWheel',
        'miracleHeal', 'earthShatter', 'swordBreaker', 'finishingBlow', 'halfDamage', // Fix missing comma
        'thunderStorm', 'voidWalk', 'iceFreeze', 'desperateSurvival', 'enlightenment',
        'allIn'
    ],
    epic: ['inferno', 'timeRewind'],
    legendary: ['timeStop', 'voidEmbrace', 'karmaKill', 'reversal', 'chaosControl']
};

// 获取随机卡牌
function getRandomCard(rarity = null) {
    if (rarity && CARD_POOL[rarity]) {
        const pool = CARD_POOL[rarity];
        const cardId = pool[Math.floor(Math.random() * pool.length)];
        return { ...CARDS[cardId] };
    }

    // 根据权重随机选择稀有度
    const roll = Math.random();
    let selectedRarity;
    if (roll < 0.55) selectedRarity = 'common';
    else if (roll < 0.80) selectedRarity = 'uncommon';
    else if (roll < 0.95) selectedRarity = 'rare';
    else selectedRarity = 'legendary';

    const pool = CARD_POOL[selectedRarity];
    const cardId = pool[Math.floor(Math.random() * pool.length)];
    return { ...CARDS[cardId] };
}

// 获取奖励卡牌选择
function getRewardCards(count = 3) {
    const cards = [];
    for (let i = 0; i < count; i++) {
        cards.push(getRandomCard());
    }
    return cards;
}

// ==================== 卡牌升级系统 ====================

// 升级规则配置
const UPGRADE_RULES = {
    // 默认规则：伤害+3，护盾+3，费用-1（最低0）
    default: {
        damage: 3,
        block: 3,
        heal: 3,
        costReduction: 0  // 部分卡牌减费
    },
    // 特殊卡牌的升级规则
    special: {
        strike: { damage: 3 },          // 6 -> 9
        defend: { block: 3 },           // 5 -> 8
        heavyStrike: { damage: 4 },     // 12 -> 16
        quickSlash: { damage: 2 },      // 4 -> 6
        doubleStrike: { damage: 2 },    // 4x2 -> 6x2
        ragingBlow: { damage: 5 },      // 20 -> 25
        ironWill: { block: 4 },         // 12 -> 16
        meditation: { draw: 1 },        // 抽2 -> 抽3
        spiritBoost: { energy: 1 },     // +2灵力 -> +3灵力
        innerPeace: { block: 2, heal: 2 },
        thunderLaw: { damage: 4 },
        swordIntent: { damage: 4 },
        flameTruth: { damage: 3, burn: 1 },
        timeStop: { costReduction: 1 }, // 3费 -> 2费
        voidEmbrace: { multiplier: 0.15 },  // 50% -> 65%
    }
};

/**
 * 升级卡牌
 * @param {Object} card - 要升级的卡牌
 * @returns {Object} - 升级后的卡牌副本
 */
function upgradeCard(card) {
    if (!card || card.upgraded) return card;

    // 创建卡牌副本
    const upgradedCard = JSON.parse(JSON.stringify(card));
    upgradedCard.upgraded = true;
    upgradedCard.name = card.name + '+';

    // 获取升级规则
    const specialRule = UPGRADE_RULES.special[card.id];
    const defaultRule = UPGRADE_RULES.default;

    // 升级效果
    for (let i = 0; i < upgradedCard.effects.length; i++) {
        const effect = upgradedCard.effects[i];

        if (specialRule) {
            // 应用特殊规则
            if (effect.type === 'damage' && specialRule.damage) {
                effect.value += specialRule.damage;
            }
            if (effect.type === 'block' && specialRule.block) {
                effect.value += specialRule.block;
            }
            if (effect.type === 'heal' && specialRule.heal) {
                effect.value += specialRule.heal;
            }
            if (effect.type === 'draw' && specialRule.draw) {
                effect.value += specialRule.draw;
            }
            if (effect.type === 'energy' && specialRule.energy) {
                effect.value += specialRule.energy;
            }
            if (effect.type === 'debuff' && effect.buffType === 'burn' && specialRule.burn) {
                effect.value += specialRule.burn;
            }
            if (effect.type === 'execute' && specialRule.multiplier) {
                effect.value = (effect.value || 1) + specialRule.multiplier;
            }
        } else {
            // 应用默认规则
            if (effect.type === 'damage') {
                effect.value += defaultRule.damage;
            }
            if (effect.type === 'block') {
                effect.value += defaultRule.block;
            }
            if (effect.type === 'heal') {
                effect.value += defaultRule.heal;
            }
        }
    }

    // 费用减少（如果有特殊规则）
    if (specialRule && specialRule.costReduction) {
        upgradedCard.cost = Math.max(0, upgradedCard.cost - specialRule.costReduction);
    }

    // 更新描述
    upgradedCard.description = generateUpgradedDescription(upgradedCard);

    return upgradedCard;
}

/**
 * 生成升级后的描述
 */
function generateUpgradedDescription(card) {
    let desc = '';
    for (const effect of card.effects) {
        switch (effect.type) {
            case 'damage':
                desc += `造成 ${effect.value} 点伤害。`;
                break;
            case 'block':
                desc += `获得 ${effect.value} 点护盾。`;
                break;
            case 'heal':
                desc += `恢复 ${effect.value} 点生命。`;
                break;
            case 'draw':
                desc += `抽 ${effect.value} 张牌。`;
                break;
            case 'energy':
                desc += `获得 ${effect.value} 点灵力。`;
                break;
            case 'execute':
                desc += `造成敌人已损失生命${Math.floor(effect.value * 100)}%的伤害。`;
                break;
            case 'debuff':
                if (effect.buffType === 'burn') {
                    desc += `使敌人获得 ${effect.value} 层灼烧。`;
                } else if (effect.buffType === 'stun') {
                    desc += `敌人跳过下一回合。`;
                }
                break;
        }
    }
    return desc.trim() || card.description;
}

/**
 * 检查卡牌是否可升级
 */
function canUpgradeCard(card) {
    return card && !card.upgraded;
}
