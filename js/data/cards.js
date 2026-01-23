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
        description: '获得 50% 闪避率（持续1回合）',
        rarity: 'rare',
        lawType: 'space',
        effects: [
            { type: 'buff', buffType: 'dodgeChance', value: 0.5, target: 'self', duration: 1 }
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
        description: '造成敌人已损失生命值30%的伤害',
        rarity: 'legendary',
        lawType: 'void',
        effects: [
            { type: 'execute', value: 0.3, target: 'enemy' }
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
        description: '造成 25 点伤害，自身受 5 点伤害（生命≤5不可用）',
        rarity: 'rare',
        condition: { type: 'hp', min: 6 },
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
        description: '获得 1 层闪避',
        rarity: 'rare',
        lawType: 'space',
        effects: [
            { type: 'buff', buffType: 'dodge', value: 1, target: 'self' }
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
        description: '必定命中，造成敌人最大生命15%的伤害',
        rarity: 'legendary',
        lawType: 'karma',
        effects: [
            { type: 'percentDamage', value: 0.15, target: 'enemy' }
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
        cost: 4,
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
            { type: 'damage', value: 5, target: 'enemy' },
            { type: 'debuff', buffType: 'stun', value: 1, target: 'enemy' }
        ]
    },

    // ==================== 多角色专属卡牌 ====================
    // ===== 林风（逆命者）- 突破与进化主题 =====
    defiantWill: {
        id: 'defiantWill',
        name: '逆天意志',
        type: 'attack',
        cost: 1,
        icon: '💫',
        description: '造成 8 点伤害，若命环≥2级，再造成 8 点伤害',
        rarity: 'uncommon',
        character: 'linFeng',
        effects: [
            { type: 'damage', value: 8, target: 'enemy' },
            { type: 'conditionalDamage', condition: 'fateRingLevel', minLevel: 2, bonusDamage: 8, target: 'enemy' }
        ]
    },
    ringResonance: {
        id: 'ringResonance',
        name: '命环共振',
        type: 'attack',
        cost: 2,
        icon: '🔮',
        description: '根据装载法则数量+4伤害，抽1张牌',
        rarity: 'rare',
        character: 'linFeng',
        effects: [
            { type: 'damagePerLaw', baseDamage: 4, damagePerLaw: 4, target: 'enemy' },
            { type: 'draw', value: 1, target: 'self' }
        ]
    },
    breakthrough: {
        id: 'breakthrough',
        name: '突破极限',
        type: 'attack',
        cost: 3,
        icon: '⚡',
        description: '造成 25 点伤害，命环经验+30',
        rarity: 'rare',
        character: 'linFeng',
        effects: [
            { type: 'damage', value: 25, target: 'enemy' },
            { type: 'ringExp', value: 30 }
        ]
    },

    // ===== 香叶（治愈法则）- 增益与治疗主题 =====
    poisonTouch: {
        id: 'poisonTouch',
        name: '毒触',
        type: 'attack',
        cost: 1,
        icon: '🤢',
        description: '造成 3 点伤害，给予 2 层中毒',
        rarity: 'common',
        character: 'xiangYe',
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
        character: 'xiangYe',
        effects: [
            { type: 'heal', value: 5, target: 'self' }
        ]
    },
    healingTouch: {
        id: 'healingTouch',
        name: '治愈之触',
        type: 'skill',
        cost: 1,
        icon: '💚',
        description: '回复 8 点生命，净化 1 层负面效果',
        rarity: 'uncommon',
        character: 'xiangYe',
        effects: [
            { type: 'heal', value: 8, target: 'self' },
            { type: 'cleanse', value: 1, target: 'self' }
        ]
    },
    bloodBlessing: {
        id: 'bloodBlessing',
        name: '血之祝福',
        type: 'skill',
        cost: 2,
        icon: '🩸',
        description: '回复 15 点生命，使敌人虚弱 2 回合',
        rarity: 'rare',
        character: 'xiangYe',
        effects: [
            { type: 'heal', value: 15, target: 'self' },
            { type: 'debuff', buffType: 'weak', value: 2, target: 'enemy' }
        ]
    },
    lifeSurge: {
        id: 'lifeSurge',
        name: '生命涌动',
        type: 'defense',
        cost: 0,
        icon: '💖',
        description: '获得等于已损失生命50%的护盾',
        rarity: 'rare',
        character: 'xiangYe',
        effects: [
            { type: 'blockFromLostHp', percent: 0.5, target: 'self' }
        ]
    },

    // ===== 无欲（佛门）- 反击与控制主题 =====
    monkStrike: {
        id: 'monkStrike',
        name: '武僧打击',
        type: 'attack',
        cost: 1,
        icon: '🙏',
        description: '造成 6 点伤害，获得 4 点护盾',
        rarity: 'common',
        character: 'wuYu',
        effects: [
            { type: 'damage', value: 6, target: 'enemy' },
            { type: 'block', value: 4, target: 'self' }
        ]
    },
    vajraGlare: {
        id: 'vajraGlare',
        name: '金刚怒目',
        type: 'attack',
        cost: 1,
        icon: '😡',
        description: '造成 5 点伤害，获得 3 点荆棘持续 2 回合',
        rarity: 'uncommon',
        character: 'wuYu',
        effects: [
            { type: 'damage', value: 5, target: 'enemy' },
            { type: 'buff', buffType: 'thorns', value: 3, target: 'self', duration: 2 }
        ]
    },
    zenMeditation: {
        id: 'zenMeditation',
        name: '禅定',
        type: 'defense',
        cost: 2,
        icon: '🧘',
        description: '获得 15 点护盾，下次被攻击时反弹等量伤害',
        rarity: 'rare',
        character: 'wuYu',
        effects: [
            { type: 'block', value: 15, target: 'self' },
            { type: 'buff', buffType: 'reflect', value: 1, target: 'self' }
        ]
    },
    salvation: {
        id: 'salvation',
        name: '普渡众生',
        type: 'law',
        cost: 3,
        icon: '☸️',
        description: '对所有敌人造成 12 点伤害并眩晕 1 回合',
        rarity: 'epic',
        character: 'wuYu',
        effects: [
            { type: 'damageAll', value: 12, target: 'allEnemies' },
            { type: 'debuffAll', buffType: 'stun', value: 1, target: 'allEnemies' }
        ]
    },

    // ===== 严寒（学者）- 分析与削弱主题 =====
    analysis: {
        id: 'analysis',
        name: '弱点分析',
        type: 'skill',
        cost: 0,
        icon: '🧐',
        description: '抽 1 张牌，使敌人获得 1 层易伤',
        rarity: 'common',
        character: 'yanHan',
        effects: [
            { type: 'draw', value: 1, target: 'self' },
            { type: 'debuff', buffType: 'vulnerable', value: 1, target: 'enemy' }
        ]
    },
    ringAnalysis: {
        id: 'ringAnalysis',
        name: '命环解析',
        type: 'skill',
        cost: 1,
        icon: '📊',
        description: '敌人易伤 2 层，命环经验+15',
        rarity: 'uncommon',
        character: 'yanHan',
        effects: [
            { type: 'debuff', buffType: 'vulnerable', value: 2, target: 'enemy' },
            { type: 'ringExp', value: 15 }
        ]
    },
    lawInsight: {
        id: 'lawInsight',
        name: '法则窥探',
        type: 'skill',
        cost: 2,
        icon: '👁️',
        description: '抽 2 张牌，本战法则盗取率+10%',
        rarity: 'rare',
        character: 'yanHan',
        effects: [
            { type: 'draw', value: 2, target: 'self' },
            { type: 'buff', buffType: 'stealBonus', value: 0.1, target: 'self' }
        ]
    },
    timeStasis: {
        id: 'timeStasis',
        name: '时间凝滞',
        type: 'law',
        cost: 3,
        icon: '⏳',
        description: '敌人下次攻击伤害-50%，你额外行动1次',
        rarity: 'epic',
        character: 'yanHan',
        effects: [
            { type: 'debuff', buffType: 'damageReduction', value: 50, target: 'enemy' },
            { type: 'buff', buffType: 'extraTurn', value: 1, target: 'self' }
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
        'concentration', 'doubleEdge', 'quickDraw',
        'poisonTouch', 'minorHeal', 'monkStrike', 'analysis'
    ],
    uncommon: [
        'ragingBlow', 'counterStance', 'innerPeace', 'battleCry', 'luckyStrike',
        'sweepingStrike', 'tripleSlash', 'bloodSlash', 'offenseDefense', 'ironSkin',
        'windfall', 'powerUp',
        // 新增角色卡牌
        'defiantWill', 'healingTouch', 'vajraGlare', 'ringAnalysis'
    ],
    rare: [
        'thunderLaw', 'swordIntent', 'flameTruth', 'spaceRift', 'fortuneWheel',
        'miracleHeal', 'earthShatter', 'swordBreaker', 'finishingBlow', 'halfDamage',
        'thunderStorm', 'voidWalk', 'iceFreeze', 'desperateSurvival', 'enlightenment',
        'allIn',
        // 新增角色卡牌
        'ringResonance', 'breakthrough', 'bloodBlessing', 'lifeSurge', 'zenMeditation', 'lawInsight'
    ],
    epic: ['inferno', 'timeRewind', 'salvation', 'timeStasis'],
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
        voidEmbrace: { multiplier: 0.2 },  // 30% -> 50%

        // 新增/补全的升级规则
        shieldBash: { damage: 2, block: 2 }, // 4/4 -> 6/6
        counterStance: { block: 3, thorns: 3 }, // 3/5 -> 6/8
        battleCry: { damage: 3, strength: 1 }, // 5/2 -> 8/3
        spaceRift: { dodge: -1, dodgeChance: 0.25 }, // 50% -> 75%
        luckyStrike: { minDamage: 3, maxDamage: 5 }, // 5-15 -> 8-20
        fortuneWheel: { minCards: 1, maxCards: 1 }, // 1-3 -> 2-4
        miracleHeal: { heal: 5 }, // 15 -> 20

        sweepingStrike: { damage: 3 }, // 8 -> 11
        armorBreaker: { damage: 3 }, // 5 -> 8
        tripleSlash: { damage: 1 }, // 3x3 -> 4x3
        earthShatter: { damage: 8 }, // 25 -> 33
        swordBreaker: { damage: 5 }, // 15 -> 20
        bloodSlash: { damage: 4 }, // 8 -> 12
        finishingBlow: { damage: 4 }, // 10 -> 14

        goldenBell: { block: 5 }, // 15 -> 20
        offenseDefense: { multiplier: 1 }, // x3 -> x4
        halfDamage: { costReduction: 1 }, // 2费 -> 1费
        turtleShell: { block: 2, draw: 1 }, // 3/1 -> 5/2
        ironSkin: { block: 3, nextBlock: 3 }, // 6/4 -> 9/7

        thunderStorm: { damage: 4, paralysis: 1 }, // 10/2 -> 14/3
        inferno: { damage: 2 }, // 8x3 -> 10x3
        voidWalk: { dodge: 1 }, // 2 -> 3
        timeRewind: { costReduction: 1 }, // 4费 -> 3费
        karmaKill: { percent: 0.15 }, // 30% -> 45%
        iceFreeze: { damage: 3, weak: 1 }, // 7/3 -> 10/4

        desperateSurvival: { draw: 1, energy: 1 }, // 3/3 -> 4/4
        windfall: { minGold: 10, maxGold: 25 }, // 25-100 -> 35-125
        enlightenment: { exp: 25 }, // 50 -> 75
        reversal: { costReduction: 1 }, // 3费 -> 2费

        concentration: { bonus: 3 }, // +5 -> +8
        doubleEdge: { damage: 5 }, // 10 -> 15
        powerUp: { strength: 1 }, // 2 -> 3
        quickDraw: { draw: 1 }, // 1 -> 2
        allIn: { damagePerEnergy: 2 }, // 6 -> 8
        chaosControl: { damage: 3, stun: 1 }, // 5/1 -> 8/2 (眩晕回合还是1，伤害加点)

        poisonTouch: { damage: 2, poison: 2 }, // 3/2 -> 5/4
        minorHeal: { heal: 3 }, // 5 -> 8
        monkStrike: { damage: 3, block: 2 }, // 6/4 -> 9/6
        analysis: { draw: 1 }, // 1 -> 2

        // ==================== 新增角色卡牌升级规则 ====================
        // 林风
        defiantWill: { damage: 2, bonusDamage: 2 }, // 8/8 -> 10/10
        ringResonance: { baseDamage: 2, damagePerLaw: 1 }, // 4+4/法则 -> 6+5/法则
        breakthrough: { damage: 5, exp: 20 }, // 25/30 -> 30/50

        // 香叶
        healingTouch: { heal: 4, cleanse: 1 }, // 8/1 -> 12/2
        bloodBlessing: { heal: 5, weak: 1 }, // 15/2 -> 20/3
        lifeSurge: { percent: 0.25 }, // 50% -> 75%

        // 无欲
        vajraGlare: { damage: 3, thorns: 2 }, // 5/3 -> 8/5
        zenMeditation: { block: 5 }, // 15 -> 20
        salvation: { damage: 3 }, // 12 -> 15

        // 严寒
        ringAnalysis: { vulnerable: 1, exp: 10 }, // 2/15 -> 3/25
        lawInsight: { draw: 1, stealBonus: 0.05 }, // 2/10% -> 3/15%
        timeStasis: { damageReduction: 25 }  // 50% -> 75%
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
            if (effect.type === 'debuff' && effect.buffType === 'poison' && specialRule.poison) {
                effect.value += specialRule.poison;
            }
            if (effect.type === 'debuff' && effect.buffType === 'vulnerable' && specialRule.vulnerable) {
                effect.value += specialRule.vulnerable;
            }
            if (effect.type === 'debuff' && effect.buffType === 'weak' && specialRule.weak) {
                effect.value += specialRule.weak;
            }
            if (effect.type === 'debuff' && effect.buffType === 'paralysis' && specialRule.paralysis) {
                effect.value += specialRule.paralysis;
            }
            if (effect.type === 'buff' && effect.buffType === 'thorns' && specialRule.thorns) {
                effect.value += specialRule.thorns;
            }
            if (effect.type === 'buff' && effect.buffType === 'strength' && specialRule.strength) {
                effect.value += specialRule.strength;
            }
            if (effect.type === 'buff' && effect.buffType === 'dodge' && specialRule.dodge) {
                effect.value += specialRule.dodge;
            }
            if (effect.type === 'buff' && effect.buffType === 'dodgeChance' && specialRule.dodgeChance) {
                effect.value += specialRule.dodgeChance;
            }
            if (effect.type === 'buff' && effect.buffType === 'nextAttackBonus' && specialRule.bonus) {
                effect.value += specialRule.bonus;
            }
            if (effect.type === 'buff' && effect.buffType === 'nextTurnBlock' && specialRule.nextBlock) {
                effect.value += specialRule.nextBlock;
            }
            if (effect.type === 'randomDamage') {
                if (specialRule.minDamage) effect.minValue += specialRule.minDamage;
                if (specialRule.maxDamage) effect.maxValue += specialRule.maxDamage;
            }
            if (effect.type === 'randomCards') {
                if (specialRule.minCards) effect.minValue += specialRule.minCards;
                if (specialRule.maxCards) effect.maxValue += specialRule.maxCards;
            }
            if (effect.type === 'damageAll' && specialRule.damage) {
                effect.value += specialRule.damage;
            }
            if (effect.type === 'penetrate' && specialRule.damage) {
                effect.value += specialRule.damage;
            }
            if (effect.type === 'executeDamage' && specialRule.damage) {
                effect.value += specialRule.damage;
            }
            if (effect.type === 'blockFromStrength' && specialRule.multiplier) {
                effect.multiplier += specialRule.multiplier;
            }
            if (effect.type === 'percentDamage' && specialRule.percent) {
                effect.value += specialRule.percent;
            }
            if (effect.type === 'conditionalDraw') {
                if (specialRule.draw) effect.drawValue += specialRule.draw;
                if (specialRule.energy) effect.energyValue += specialRule.energy;
            }
            if (effect.type === 'bonusGold') {
                if (specialRule.minGold) effect.min += specialRule.minGold;
                if (specialRule.maxGold) effect.max += specialRule.maxGold;
            }
            if (effect.type === 'ringExp' && specialRule.exp) {
                effect.value += specialRule.exp;
            }
            if (effect.type === 'consumeAllEnergy' && specialRule.damagePerEnergy) {
                effect.damagePerEnergy += specialRule.damagePerEnergy;
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
                desc += `回复 ${effect.value} 点生命。`;
                break;
            case 'draw':
                desc += `抽 ${effect.value} 张牌。`;
                break;
            case 'energy':
                desc += `获得 ${effect.value} 点灵力。`;
                break;
            case 'penetrate':
                desc += `造成 ${effect.value} 点穿透伤害。`;
                break;
            case 'damageAll':
                desc += `对所有敌人造成 ${effect.value} 点伤害。`;
                break;
            case 'randomDamage':
                desc += `随机造成 ${effect.minValue}-${effect.maxValue} 点伤害。`;
                break;
            case 'randomCards':
                desc += `随机获得 ${effect.minValue}-${effect.maxValue} 张临时卡牌。`;
                break;
            case 'execute':
                desc += `造成敌人已损失生命${Math.floor(effect.value * 100)}%的伤害。`;
                break;
            case 'percentDamage':
                desc += `造成敌人最大生命${Math.floor(effect.value * 100)}%的伤害。`;
                break;
            case 'selfDamage':
                desc += `自身受到 ${effect.value} 点伤害。`;
                break;
            case 'lifeSteal':
                desc += `回复造成伤害的${Math.floor(effect.value * 100)}%生命。`;
                break;
            case 'removeBlock':
                desc += `移除敌人所有护盾。`;
                break;
            case 'reshuffleDiscard':
                desc += `将弃牌堆洗回抽牌堆。`;
                break;
            case 'swapHpPercent':
                desc += `与敌人交换当前生命值百分比。`;
                break;
            case 'blockFromStrength':
                desc += `获得等于你力量值x${effect.multiplier}的护盾（最少${effect.minimum}）。`;
                break;
            case 'executeDamage':
                desc += `造成 ${effect.value} 点伤害，对生命低于${Math.floor((effect.threshold || 0.3) * 100)}%的敌人造成双倍。`;
                break;
            case 'consumeAllEnergy':
                desc += `消耗所有灵力，每点灵力造成 ${effect.damagePerEnergy} 点伤害。`;
                break;
            case 'conditionalDraw':
                if (effect.condition === 'lowHp') {
                    desc += `若生命低于${Math.floor(effect.threshold * 100)}%，抽${effect.drawValue}张牌+${effect.energyValue}灵力。`;
                }
                break;
            case 'bonusGold':
                desc += `战斗结束后获得 ${effect.min}-${effect.max} 灵石。`;
                break;
            case 'ringExp':
                desc += `命环经验+${effect.value}。`;
                break;
            case 'debuff':
                if (effect.buffType === 'burn') desc += `使敌人获得 ${effect.value} 层灼烧。`;
                else if (effect.buffType === 'poison') desc += `给予 ${effect.value} 层中毒。`;
                else if (effect.buffType === 'vulnerable') desc += `使敌人获得 ${effect.value} 层易伤。`;
                else if (effect.buffType === 'weak') desc += `使敌人获得 ${effect.value} 层虚弱。`;
                else if (effect.buffType === 'paralysis') desc += `使敌人获得 ${effect.value} 层麻痹。`;
                else if (effect.buffType === 'stun') desc += `敌人跳过下一回合。`;
                break;
            case 'buff':
                if (effect.buffType === 'strength') desc += `获得 ${effect.value} 点力量${effect.permanent ? '(永久)' : ''}。`;
                else if (effect.buffType === 'thorns') desc += `获得 ${effect.value} 点荆棘。`;
                else if (effect.buffType === 'dodge') desc += `获得 ${effect.value} 层闪避。`;
                else if (effect.buffType === 'dodgeChance') desc += `获得 ${Math.floor(effect.value * 100)}% 闪避率。`;
                else if (effect.buffType === 'nextTurnBlock') desc += `下回合开始时获得 ${effect.value} 点护盾。`;
                else if (effect.buffType === 'damageReduction') desc += `本回合受到的伤害减少${effect.value}%。`;
                else if (effect.buffType === 'nextAttackBonus') desc += `下一张攻击牌伤害+${effect.value}。`;
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
