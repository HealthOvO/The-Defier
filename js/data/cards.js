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
        cost: 1,
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
        element: 'fire',
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
        cost: 0,
        consumeCandy: true,
        icon: '🧘',
        description: '消耗1奶糖。抽 2 张牌',
        rarity: 'common',
        effects: [
            { type: 'draw', value: 2, target: 'self' }
        ]
    },

    heartDemon: {
        id: 'heartDemon',
        name: '心魔',
        type: 'status',
        cost: 0,
        unplayable: true,
        retain: true, // 不会被自然丢弃
        occupiesDrawSlot: true, // 占据抽牌位
        icon: '👿',
        description: '无法打出。保留在手中。占据抽卡位。回合结束时，受到 Max(10%当前生命, 10) 点真实伤害。效果可叠加。',
        rarity: 'special',
        effects: [
            { type: 'selfDamage', value: 0.1, isPercent: true, trigger: 'endTurn', minValue: 10 }
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

    // ==================== 战斗深度扩展：流血/破绽/架势 ====================
    bloodlettingSlash: {
        id: 'bloodlettingSlash',
        name: '裂脉斩',
        type: 'attack',
        cost: 1,
        icon: '🩸',
        description: '造成 6 点伤害并施加 2 层流血',
        rarity: 'common',
        keywords: ['bleed'],
        comboTag: 'bleed',
        synergyGroup: 'hemorrhage',
        effects: [
            { type: 'damage', value: 6, target: 'enemy' },
            { type: 'applyBleed', value: 2, target: 'enemy' }
        ]
    },

    punctureMark: {
        id: 'punctureMark',
        name: '破绽刺',
        type: 'attack',
        cost: 1,
        icon: '🎯',
        description: '造成 4 点伤害并施加 4 层破绽',
        rarity: 'common',
        keywords: ['mark'],
        comboTag: 'mark',
        synergyGroup: 'precision',
        effects: [
            { type: 'damage', value: 4, target: 'enemy' },
            { type: 'applyMark', value: 4, target: 'enemy' }
        ]
    },

    tacticalExpose: {
        id: 'tacticalExpose',
        name: '战术破析',
        type: 'skill',
        cost: 1,
        icon: '🧭',
        description: '施加 6 层破绽并抽 1 张牌',
        rarity: 'uncommon',
        keywords: ['mark'],
        comboTag: 'mark',
        synergyGroup: 'precision',
        effects: [
            { type: 'applyMark', value: 6, target: 'enemy' },
            { type: 'draw', value: 1, target: 'self' }
        ]
    },

    crimsonCascade: {
        id: 'crimsonCascade',
        name: '赤瀑连断',
        type: 'attack',
        cost: 2,
        icon: '🌊',
        description: '造成 9 点伤害并施加 3 层流血',
        rarity: 'uncommon',
        keywords: ['bleed'],
        comboTag: 'bleed',
        synergyGroup: 'hemorrhage',
        effects: [
            { type: 'damage', value: 9, target: 'enemy' },
            { type: 'applyBleed', value: 3, target: 'enemy' }
        ]
    },

    hunterSeal: {
        id: 'hunterSeal',
        name: '猎印',
        type: 'skill',
        cost: 0,
        icon: '🪶',
        description: '施加 3 层破绽，获得 1 点灵力',
        rarity: 'common',
        keywords: ['mark', 'tempo'],
        comboTag: 'mark',
        synergyGroup: 'precision',
        effects: [
            { type: 'applyMark', value: 3, target: 'enemy' },
            { type: 'energy', value: 1, target: 'self' }
        ]
    },

    stanceAggressive: {
        id: 'stanceAggressive',
        name: '攻势架势',
        type: 'power',
        cost: 1,
        icon: '🔥',
        description: '切换到攻势：造成伤害提高，承伤增加',
        rarity: 'uncommon',
        keywords: ['stance'],
        comboTag: 'stance',
        synergyGroup: 'stance',
        effects: [
            { type: 'setStance', stance: 'aggressive', target: 'self' }
        ]
    },

    stanceDefensive: {
        id: 'stanceDefensive',
        name: '守势架势',
        type: 'power',
        cost: 1,
        icon: '🛡️',
        description: '切换到守势：承伤降低，输出略降',
        rarity: 'uncommon',
        keywords: ['stance'],
        comboTag: 'stance',
        synergyGroup: 'stance',
        effects: [
            { type: 'setStance', stance: 'defensive', target: 'self' }
        ]
    },

    stanceFlow: {
        id: 'stanceFlow',
        name: '归一心流',
        type: 'skill',
        cost: 0,
        icon: '☯️',
        description: '切回中和架势并抽 1 张牌',
        rarity: 'common',
        keywords: ['stance'],
        comboTag: 'stance',
        synergyGroup: 'stance',
        effects: [
            { type: 'setStance', stance: 'neutral', target: 'self' },
            { type: 'draw', value: 1, target: 'self' }
        ]
    },

    guardedRiposte: {
        id: 'guardedRiposte',
        name: '守中反击',
        type: 'defense',
        cost: 1,
        icon: '🗡️',
        description: '获得 8 护盾并施加 2 层破绽',
        rarity: 'common',
        keywords: ['stance', 'mark'],
        comboTag: 'stance',
        synergyGroup: 'stance',
        effects: [
            { type: 'block', value: 8, target: 'self' },
            { type: 'applyMark', value: 2, target: 'enemy' }
        ]
    },

    sunderingNeedle: {
        id: 'sunderingNeedle',
        name: '裂界针',
        type: 'attack',
        cost: 2,
        icon: '🪡',
        description: '造成 10 点穿透伤害并施加 2 层流血',
        rarity: 'rare',
        keywords: ['bleed', 'penetrate'],
        comboTag: 'bleed',
        synergyGroup: 'hemorrhage',
        effects: [
            { type: 'penetrate', value: 10, target: 'enemy' },
            { type: 'applyBleed', value: 2, target: 'enemy' }
        ]
    },

    hemorrhageRain: {
        id: 'hemorrhageRain',
        name: '血雨',
        type: 'attack',
        cost: 2,
        icon: '🌧️',
        description: '对全体造成 5 点伤害，并施加 1 层流血',
        rarity: 'rare',
        keywords: ['bleed', 'aoe'],
        comboTag: 'bleed',
        synergyGroup: 'hemorrhage',
        effects: [
            { type: 'damageAll', value: 5, target: 'allEnemies' },
            { type: 'applyBleed', value: 1, target: 'enemy' }
        ]
    },

    executionDoctrine: {
        id: 'executionDoctrine',
        name: '斩决要义',
        type: 'attack',
        cost: 2,
        icon: '📜',
        description: '造成 8 点伤害；若目标有破绽，额外造成 8 点伤害',
        rarity: 'rare',
        keywords: ['mark', 'burst'],
        comboTag: 'mark',
        synergyGroup: 'precision',
        effects: [
            { type: 'damage', value: 8, target: 'enemy' },
            { type: 'conditionalDamage', value: 8, condition: 'marked', target: 'enemy' }
        ]
    },

    serratedRitual: {
        id: 'serratedRitual',
        name: '锯刃仪式',
        type: 'attack',
        cost: 1,
        icon: '🩸',
        description: '造成 5 点伤害，施加 2 层流血，自身受到 1 点伤害',
        rarity: 'common',
        keywords: ['bleed'],
        comboTag: 'bleed',
        synergyGroup: 'hemorrhage',
        effects: [
            { type: 'damage', value: 5, target: 'enemy' },
            { type: 'applyBleed', value: 2, target: 'enemy' },
            { type: 'selfDamage', value: 1, target: 'self' }
        ]
    },

    coagulatedGuard: {
        id: 'coagulatedGuard',
        name: '凝血守式',
        type: 'defense',
        cost: 1,
        icon: '🛡️',
        description: '获得 6 点护盾，并施加 1 层流血',
        rarity: 'common',
        keywords: ['bleed', 'stance'],
        comboTag: 'bleed',
        synergyGroup: 'hemorrhage',
        effects: [
            { type: 'block', value: 6, target: 'self' },
            { type: 'applyBleed', value: 1, target: 'enemy' }
        ]
    },

    bloodDebt: {
        id: 'bloodDebt',
        name: '血债引燃',
        type: 'skill',
        cost: 0,
        icon: '🧪',
        description: '失去 3 点生命，获得 2 点灵力并抽 1 张牌',
        rarity: 'uncommon',
        keywords: ['bleed', 'tempo'],
        comboTag: 'bleed',
        synergyGroup: 'hemorrhage',
        effects: [
            { type: 'selfDamage', value: 3, target: 'self' },
            { type: 'energy', value: 2, target: 'self' },
            { type: 'draw', value: 1, target: 'self' }
        ]
    },

    arteryRupture: {
        id: 'arteryRupture',
        name: '断脉贯刺',
        type: 'attack',
        cost: 2,
        icon: '🗡️',
        description: '造成 8 点穿透伤害并施加 4 层流血',
        rarity: 'uncommon',
        keywords: ['bleed', 'penetrate'],
        comboTag: 'bleed',
        synergyGroup: 'hemorrhage',
        effects: [
            { type: 'penetrate', value: 8, target: 'enemy' },
            { type: 'applyBleed', value: 4, target: 'enemy' }
        ]
    },

    scarletJudgement: {
        id: 'scarletJudgement',
        name: '赤裁',
        type: 'attack',
        cost: 2,
        icon: '⚰️',
        description: '造成 7 点伤害并施加 2 层流血；对半血以下目标造成 10 点处决伤害',
        rarity: 'rare',
        keywords: ['bleed', 'burst'],
        comboTag: 'bleed',
        synergyGroup: 'hemorrhage',
        effects: [
            { type: 'damage', value: 7, target: 'enemy' },
            { type: 'applyBleed', value: 2, target: 'enemy' },
            { type: 'executeDamage', value: 10, threshold: 0.5, target: 'enemy' }
        ]
    },

    bloodTideOath: {
        id: 'bloodTideOath',
        name: '血潮誓约',
        type: 'attack',
        cost: 3,
        icon: '🌊',
        description: '对全体造成 6 点伤害，抽 1 张牌，自身受到 4 点伤害',
        rarity: 'rare',
        keywords: ['bleed', 'aoe'],
        comboTag: 'bleed',
        synergyGroup: 'hemorrhage',
        effects: [
            { type: 'damageAll', value: 6, target: 'allEnemies' },
            { type: 'draw', value: 1, target: 'self' },
            { type: 'selfDamage', value: 4, target: 'self' }
        ]
    },

    weakpointSurvey: {
        id: 'weakpointSurvey',
        name: '弱点勘测',
        type: 'skill',
        cost: 0,
        icon: '🧭',
        description: '施加 2 层破绽并抽 1 张牌',
        rarity: 'common',
        keywords: ['mark', 'tempo'],
        comboTag: 'mark',
        synergyGroup: 'precision',
        effects: [
            { type: 'applyMark', value: 2, target: 'enemy' },
            { type: 'draw', value: 1, target: 'self' }
        ]
    },

    duetFeint: {
        id: 'duetFeint',
        name: '双式佯攻',
        type: 'attack',
        cost: 1,
        icon: '🪶',
        description: '造成 5 点伤害并施加 2 层破绽',
        rarity: 'common',
        keywords: ['mark'],
        comboTag: 'mark',
        synergyGroup: 'precision',
        effects: [
            { type: 'damage', value: 5, target: 'enemy' },
            { type: 'applyMark', value: 2, target: 'enemy' }
        ]
    },

    poisedCounter: {
        id: 'poisedCounter',
        name: '定式反制',
        type: 'defense',
        cost: 1,
        icon: '⚖️',
        description: '获得 7 点护盾并施加 2 层破绽',
        rarity: 'common',
        keywords: ['mark', 'stance'],
        comboTag: 'mark',
        synergyGroup: 'precision',
        effects: [
            { type: 'block', value: 7, target: 'self' },
            { type: 'applyMark', value: 2, target: 'enemy' }
        ]
    },

    razorFocus: {
        id: 'razorFocus',
        name: '锋念凝聚',
        type: 'skill',
        cost: 1,
        icon: '🎯',
        description: '施加 5 层破绽并获得 1 点灵力',
        rarity: 'uncommon',
        keywords: ['mark'],
        comboTag: 'mark',
        synergyGroup: 'precision',
        effects: [
            { type: 'applyMark', value: 5, target: 'enemy' },
            { type: 'energy', value: 1, target: 'self' }
        ]
    },

    stancePivot: {
        id: 'stancePivot',
        name: '转势',
        type: 'skill',
        cost: 0,
        icon: '☯️',
        description: '切回中和架势，施加 2 层破绽并抽 1 张牌',
        rarity: 'uncommon',
        keywords: ['mark', 'stance'],
        comboTag: 'stance',
        synergyGroup: 'precision',
        effects: [
            { type: 'setStance', stance: 'neutral', target: 'self' },
            { type: 'applyMark', value: 2, target: 'enemy' },
            { type: 'draw', value: 1, target: 'self' }
        ]
    },

    focusBreak: {
        id: 'focusBreak',
        name: '断念',
        type: 'attack',
        cost: 1,
        icon: '⚔️',
        description: '造成 6 点伤害；若目标有破绽，额外造成 6 点伤害',
        rarity: 'uncommon',
        keywords: ['mark', 'burst'],
        comboTag: 'mark',
        synergyGroup: 'precision',
        effects: [
            { type: 'damage', value: 6, target: 'enemy' },
            { type: 'conditionalDamage', value: 6, condition: 'marked', target: 'enemy' }
        ]
    },

    verdictNeedle: {
        id: 'verdictNeedle',
        name: '裁决针',
        type: 'attack',
        cost: 2,
        icon: '🪡',
        description: '造成 10 点穿透伤害；若目标有破绽，额外造成 7 点伤害',
        rarity: 'rare',
        keywords: ['mark', 'penetrate'],
        comboTag: 'mark',
        synergyGroup: 'precision',
        effects: [
            { type: 'penetrate', value: 10, target: 'enemy' },
            { type: 'conditionalDamage', value: 7, condition: 'marked', target: 'enemy' }
        ]
    },

    // ==================== 补全卡牌 ====================
    healingTouch: {
        id: 'healingTouch',
        name: '治愈之触',
        type: 'skill',
        cost: 1,
        icon: '💚',
        description: '回复 6 点生命，移除 1 个负面效果',
        rarity: 'uncommon',
        effects: [
            { type: 'heal', value: 6, target: 'self' },
            { type: 'cleanse', value: 1, target: 'self' }
        ]
    },

    bloodBlessing: {
        id: 'bloodBlessing',
        name: '鲜血祝福',
        type: 'power',
        cost: 2,
        icon: '🩸',
        description: '消耗 5 点生命，获得 2 点力量',
        rarity: 'rare',
        effects: [
            { type: 'selfDamage', value: 5, target: 'self' },
            { type: 'buff', buffType: 'strength', value: 2, target: 'self' }
        ]
    },

    poisonThorn: {
        id: 'poisonThorn',
        name: '毒刺',
        type: 'attack',
        cost: 1,
        icon: '🌵',
        description: '造成 4 点伤害，施加 2 层中毒',
        rarity: 'common',
        effects: [
            { type: 'damage', value: 4, target: 'enemy' },
            { type: 'debuff', buffType: 'poison', value: 2, target: 'enemy' }
        ],
        element: 'wood'
    },

    natureGrowth: {
        id: 'natureGrowth',
        name: '自然生长',
        type: 'power',
        cost: 1,
        icon: '🌱',
        description: '每回合结束时，获得 3 点护盾',
        rarity: 'uncommon',
        effects: [
            { type: 'buff', buffType: 'regenBlock', value: 3, target: 'self' }
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
        element: 'metal',
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
        element: 'fire',
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
        description: '造成敌人已损失生命值10%的伤害',
        rarity: 'legendary',
        lawType: 'void',
        effects: [
            { type: 'execute', value: 0.10, target: 'enemy' }
        ]
    },

    // ==================== 机缘牌（金色） ====================
    luckyStrike: {
        id: 'luckyStrike',
        name: '天降机缘',
        type: 'chance',
        cost: 1,
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
        consumeCandy: true,
        icon: '🎰',
        description: '消耗1奶糖。随机获得 1-3 张临时卡牌',
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

    // ==================== 角色专属卡牌 (追加) ====================
    // --- 林风 (Lin Feng) ---
    defianceStrike: {
        id: 'defianceStrike',
        name: '逆命一击',
        type: 'attack',
        character: 'linFeng',
        cost: 1,
        icon: '🗡️',
        description: '造成 8 点伤害。若生命值低于50%，伤害翻倍',
        rarity: 'common',
        effects: [
            { type: 'damage', value: 8, target: 'enemy' },
            { type: 'conditionalDamage', condition: 'lowHp', threshold: 0.5, multiplier: 2, target: 'enemy' }
        ]
    },
    fusionBlast: {
        id: 'fusionBlast',
        name: '融合爆发',
        type: 'skill',
        character: 'linFeng',
        cost: 1,
        icon: '🌌',
        description: '消耗所有手牌，抽取消耗数量+1张牌',
        rarity: 'uncommon',
        effects: [
            { type: 'discardHand', target: 'self' },
            { type: 'drawCalculated', base: 1, perDiscard: 1, target: 'self' }
        ]
    },
    lawbreaker: {
        id: 'lawbreaker',
        name: '破法者',
        type: 'power',
        character: 'linFeng',
        cost: 2,
        icon: '🛡️',
        description: '每打出一张攻击牌，获得 2 点护盾',
        rarity: 'rare',
        effects: [
            { type: 'buff', buffType: 'blockOnAttack', value: 2, target: 'self' }
        ]
    },

    // --- 香叶 (Xiang Ye) ---
    bloodSeal: {
        id: 'bloodSeal',
        name: '血之封印',
        type: 'skill',
        character: 'xiangYe',
        cost: 1,
        icon: '🩸',
        description: '流失 5 点生命，获得 20 点护盾',
        rarity: 'common',
        effects: [
            { type: 'selfDamage', value: 5, target: 'self' },
            { type: 'block', value: 20, target: 'self' }
        ]
    },
    vitalityBloom: {
        id: 'vitalityBloom',
        name: '生命绽放',
        type: 'power',
        character: 'xiangYe',
        cost: 2,
        icon: '🌸',
        description: '回合开始时，回复 3 点生命',
        rarity: 'uncommon',
        effects: [
            { type: 'buff', buffType: 'regen', value: 3, target: 'self' }
        ]
    },
    unchain: {
        id: 'unchain',
        name: '解脱',
        type: 'attack',
        character: 'xiangYe',
        cost: 2,
        icon: '🔗',
        description: '造成 15 点伤害。若仍有封印槽位，额外造成 10 点伤害',
        rarity: 'common',
        effects: [
            { type: 'damage', value: 15, target: 'enemy' },
            { type: 'conditionalDamage', condition: 'sealed', bonusDamage: 10, target: 'enemy' }
        ]
    },

    // --- 无欲 (Wu Yu) ---
    karmaStrike: {
        id: 'karmaStrike',
        name: '业力击',
        type: 'attack',
        character: 'wuYu',
        cost: 1,
        icon: '🕉️',
        description: '造成 6 点伤害。增加 5 点业力',
        rarity: 'common',
        effects: [
            { type: 'damage', value: 6, target: 'enemy' },
            { type: 'gainSin', value: 5, target: 'self' }
        ]
    },
    goldenBellSkill: {
        id: 'goldenBellSkill',
        name: '金钟罩',
        type: 'skill',
        character: 'wuYu',
        cost: 1,
        icon: '🔔',
        description: '获得 12 点护盾。增加 5 点功德',
        rarity: 'common',
        effects: [
            { type: 'block', value: 12, target: 'self' },
            { type: 'gainMerit', value: 5, target: 'self' }
        ]
    },
    asceticism: {
        id: 'asceticism',
        name: '苦行',
        type: 'power',
        character: 'wuYu',
        cost: 1,
        icon: '🙏',
        description: '回合结束时若有保留手牌，获得保留数x2点功德',
        rarity: 'uncommon',
        effects: [
            { type: 'buff', buffType: 'meritOnRetain', value: 2, target: 'self' }
        ]
    },

    // --- 严寒 (Yan Han) ---
    probe: {
        id: 'probe',
        name: '试探',
        type: 'attack',
        character: 'yanHan',
        cost: 0,
        consumeCandy: true,
        icon: '🔍',
        description: '消耗1奶糖。造成 4 点伤害。抽 1 张牌',
        rarity: 'common',
        effects: [
            { type: 'damage', value: 4, target: 'enemy' },
            { type: 'draw', value: 1, target: 'self' }
        ]
    },
    analyzeWeakness: {
        id: 'analyzeWeakness',
        name: '弱点分析',
        type: 'skill',
        character: 'yanHan',
        cost: 1,
        icon: '📊',
        description: '给予所有敌人 2 层易伤',
        rarity: 'uncommon',
        effects: [
            { type: 'debuff', buffType: 'vulnerable', value: 2, target: 'allEnemies' }
        ]
    },
    tacticalAdvantage: {
        id: 'tacticalAdvantage',
        name: '战术优势',
        type: 'power',
        character: 'yanHan',
        cost: 2,
        icon: '📈',
        description: '攻击带有易伤的敌人时，回复 1 点灵力(每回合限2次)',
        rarity: 'rare',
        effects: [
            { type: 'buff', buffType: 'energyOnVulnerable', value: 1, limit: 2, target: 'self' }
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
            { type: 'lifeSteal', value: 0.3, target: 'self' },
            { type: 'damage', value: 8, target: 'enemy' }
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
        description: '本回合受到的伤害减少30%（升级后50%）',
        rarity: 'rare',
        effects: [
            { type: 'buff', buffType: 'damageReduction', value: 30, target: 'self' }
        ]
    },

    turtleShell: {
        id: 'turtleShell',
        name: '乌龟壳',
        type: 'defense',
        cost: 0,
        consumeCandy: true,
        icon: '🐢',
        description: '消耗1奶糖。获得 3 点护盾，抽 1 张牌',
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
        element: 'fire',
        effects: [
            { type: 'damage', value: 8, target: 'enemy' },
            { type: 'debuff', buffType: 'burn', value: 1, target: 'enemy' },
            { type: 'damage', value: 8, target: 'enemy' },
            { type: 'debuff', buffType: 'burn', value: 1, target: 'enemy' },
            { type: 'damage', value: 8, target: 'enemy' },
            { type: 'debuff', buffType: 'burn', value: 1, target: 'enemy' }
        ],
        descriptionTemplate: '造成 {e0} 点伤害3次，每次+{e1}灼烧'
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
        cost: 1,
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
        cost: 1,
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



    allIn: {
        id: 'allIn',
        name: '破釜沉舟',
        type: 'attack',
        cost: 1,
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
        cost: 1,
        icon: '💖',
        description: '获得等于已损失生命50%的护盾',
        rarity: 'rare',
        character: 'xiangYe',
        effects: [
            { type: 'blockFromLostHp', percent: 0.5, target: 'self' }
        ]
    },

    // ===== 无欲（佛门）- 反击与控制主题 =====

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



    // 初始牌组 (Duplicates removed)

    quickDraw: {
        id: 'quickDraw',
        name: '快抽',
        type: 'energy',
        cost: 0,
        consumeCandy: true,
        icon: '⚡',
        description: '消耗1奶糖。抽 2 张牌',
        rarity: 'common',
        effects: [
            { type: 'draw', value: 2, target: 'self' }
        ]
    },


    // ==================== 多角色专属卡牌 ====================

    // --- 香叶 (Xiang Ye) ---
    poisonTouch: {
        id: 'poisonTouch',
        name: '毒手',
        type: 'skill',
        character: 'xiangYe',
        cost: 1,
        icon: '☠️',
        description: '使敌人中毒 2 层',
        rarity: 'common',
        effects: [
            { type: 'debuff', buffType: 'poison', value: 2, target: 'enemy' },
            { type: 'damage', value: 3, target: 'enemy' }
        ]
    },
    minorHeal: {
        id: 'minorHeal',
        name: '小回春术',
        type: 'skill',
        character: 'xiangYe',
        cost: 1,
        icon: '🌿',
        description: '回复 5 点生命',
        rarity: 'common',
        effects: [
            { type: 'heal', value: 5, target: 'self' }
        ]
    },

    // --- 无欲 (Wu Yu) ---
    monkStrike: {
        id: 'monkStrike',
        name: '罗汉拳',
        type: 'attack',
        character: 'wuYu',
        cost: 1,
        icon: '👊',
        description: '造成 6 点伤害，获得 4 点护盾',
        rarity: 'common',
        effects: [
            { type: 'damage', value: 6, target: 'enemy' },
            { type: 'block', value: 4, target: 'self' }
        ]
    },

    // --- 严寒 (Yan Han) ---
    analysis: {
        id: 'analysis',
        name: '弱点分析',
        type: 'skill',
        character: 'yanHan',
        cost: 0,
        consumeCandy: true,
        icon: '🧐',
        description: '消耗1奶糖。抽 1 张牌，使敌人获得 1 层易伤',
        rarity: 'common',
        effects: [
            { type: 'draw', value: 1, target: 'self' },
            { type: 'debuff', buffType: 'vulnerable', value: 1, target: 'enemy' }
        ]
    },

    demonDoubt: {
        id: 'demonDoubt',
        name: '心魔·疑心',
        type: 'status',
        cost: -1, // Unplayable
        icon: '❔',
        description: '无法打出。保留。占据抽牌位 (在手中时下回合少抽一张)。回合结束：受到 2 点伤害。',
        rarity: 'special',
        unplayable: true,
        retain: true,
        occupiesDrawSlot: true,
        effects: [
            { type: 'selfDamage', value: 2, trigger: 'turnEnd' }
        ]
    },
    demonFear: {
        id: 'demonFear',
        name: '心魔·恐惧',
        type: 'status',
        cost: -1,
        icon: '😱',
        description: '无法打出。保留。占据抽牌位 (在手中时下回合少抽一张)。回合结束：随机丢弃 1 张手牌。',
        rarity: 'special',
        unplayable: true,
        retain: true,
        occupiesDrawSlot: true,
        effects: [
            { type: 'discardRandom', value: 1, trigger: 'turnEnd' }
        ]
    },
    demonDespair: {
        id: 'demonDespair',
        name: '心魔·绝望',
        type: 'status',
        cost: -1,
        icon: '🌑',
        description: '无法打出。保留。占据抽牌位 (在手中时下回合少抽一张)。回合结束：失去 1 点灵力。',
        rarity: 'special',
        unplayable: true,
        retain: true,
        occupiesDrawSlot: true,
        effects: [
            { type: 'energyLoss', value: 1, trigger: 'turnEnd' }
        ]
    }
};

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
        'bloodlettingSlash', 'punctureMark', 'hunterSeal', 'stanceFlow', 'guardedRiposte',
        'serratedRitual', 'coagulatedGuard', 'weakpointSurvey', 'duetFeint', 'poisedCounter',
        'poisonTouch', 'minorHeal', 'monkStrike', 'analysis',
        // 角色专属
        'defianceStrike', 'bloodSeal', 'unchain', 'karmaStrike', 'probe'
    ],
    uncommon: [
        'ragingBlow', 'counterStance', 'innerPeace', 'battleCry', 'luckyStrike',
        'sweepingStrike', 'tripleSlash', 'bloodSlash', 'offenseDefense', 'ironSkin',
        'windfall', 'powerUp',
        'tacticalExpose', 'crimsonCascade', 'stanceAggressive', 'stanceDefensive',
        'bloodDebt', 'arteryRupture', 'razorFocus', 'stancePivot', 'focusBreak',
        // 新增角色卡牌
        'defiantWill', 'healingTouch', 'vajraGlare', 'ringAnalysis',
        // 角色专属
        'fusionBlast', 'vitalityBloom', 'asceticism', 'analyzeWeakness'
    ],
    rare: [
        'thunderLaw', 'swordIntent', 'flameTruth', 'spaceRift', 'fortuneWheel',
        'miracleHeal', 'earthShatter', 'swordBreaker', 'finishingBlow', 'halfDamage',
        'thunderStorm', 'voidWalk', 'iceFreeze', 'desperateSurvival', 'enlightenment',
        'allIn', 'sunderingNeedle', 'hemorrhageRain', 'executionDoctrine',
        'scarletJudgement', 'bloodTideOath', 'verdictNeedle',
        // 新增角色卡牌
        'ringResonance', 'breakthrough', 'bloodBlessing', 'lifeSurge', 'zenMeditation', 'lawInsight',
        // 角色专属
        'lawbreaker', 'tacticalAdvantage'
    ],
    epic: ['inferno', 'timeRewind', 'salvation', 'timeStasis'],
    legendary: ['timeStop', 'voidEmbrace', 'karmaKill', 'reversal', 'chaosControl']
};

// 构筑流派模板：用于内容投放和奖励偏置
const ARCHETYPE_PACKS = {
    hemorrhage: {
        id: 'hemorrhage',
        name: '血蚀连斩',
        description: '以流血层数和斩杀节奏滚雪球，容忍以血换伤的打法。',
        cards: [
            'bloodlettingSlash', 'crimsonCascade', 'sunderingNeedle', 'hemorrhageRain',
            'serratedRitual', 'coagulatedGuard', 'bloodDebt', 'arteryRupture',
            'scarletJudgement', 'bloodTideOath', 'bloodSlash', 'bloodBlessing',
            'finishingBlow', 'ragingBlow', 'earthShatter'
        ]
    },
    precision: {
        id: 'precision',
        name: '破绽心眼',
        description: '围绕破绽叠层与架势切换形成稳定爆发窗口。',
        cards: [
            'punctureMark', 'tacticalExpose', 'hunterSeal', 'executionDoctrine',
            'weakpointSurvey', 'duetFeint', 'poisedCounter', 'razorFocus',
            'focusBreak', 'verdictNeedle', 'guardedRiposte', 'stanceAggressive',
            'stanceDefensive', 'stanceFlow', 'stancePivot'
        ]
    }
};

function filterPoolByCharacter(pool, characterId) {
    return pool.filter(id => {
        const card = CARDS[id];
        if (!card) return false;
        if (!card.character) return true;
        return card.character === characterId;
    });
}

function rollRandomRarity() {
    const roll = Math.random();
    if (roll < 0.55) return 'common';
    if (roll < 0.80) return 'uncommon';
    if (roll < 0.95) return 'rare';
    return 'legendary';
}

function cloneCardTemplate(cardId) {
    const source = CARDS[cardId];
    if (!source) return null;
    try {
        // 深拷贝模板，避免运行时修改污染静态配置
        return JSON.parse(JSON.stringify(source));
    } catch (e) {
        console.warn('cloneCardTemplate fallback to shallow copy:', cardId, e);
        return { ...source };
    }
}

// 获取随机卡牌
function getRandomCard(rarity = null, characterId = null) {
    const selectedRarity = rarity || rollRandomRarity();

    if (CARD_POOL[selectedRarity]) {
        let pool = filterPoolByCharacter(CARD_POOL[selectedRarity], characterId);

        if (pool.length === 0) {
            // Fallback if filtering removes all
            pool = CARD_POOL[selectedRarity];
        }

        const cardId = pool[Math.floor(Math.random() * pool.length)];
        return cloneCardTemplate(cardId);
    }

    // Fallback
    return cloneCardTemplate('strike');
}

function getArchetypePack(archetypeId) {
    if (!archetypeId || !ARCHETYPE_PACKS[archetypeId]) return null;
    return ARCHETYPE_PACKS[archetypeId];
}

function getRandomArchetypeCard(archetypeId, rarity = null, characterId = null) {
    const pack = getArchetypePack(archetypeId);
    if (!pack) return getRandomCard(rarity, characterId);

    let pool = pack.cards.filter(id => {
        const card = CARDS[id];
        if (!card) return false;
        if (rarity && card.rarity !== rarity) return false;
        return true;
    });

    pool = filterPoolByCharacter(pool, characterId);
    if (pool.length === 0) {
        return getRandomCard(rarity, characterId);
    }

    const cardId = pool[Math.floor(Math.random() * pool.length)];
    return cloneCardTemplate(cardId);
}

function inferDeckArchetype(deck = []) {
    if (!Array.isArray(deck) || deck.length === 0) return null;

    const scores = { hemorrhage: 0, precision: 0 };
    const cardIds = new Set(deck.map(c => c && c.id).filter(Boolean));

    deck.forEach(card => {
        if (!card) return;
        if (card.synergyGroup === 'hemorrhage') scores.hemorrhage += 3;
        if (card.synergyGroup === 'precision' || card.synergyGroup === 'stance') scores.precision += 3;

        if (Array.isArray(card.keywords)) {
            if (card.keywords.includes('bleed')) scores.hemorrhage += 1;
            if (card.keywords.includes('mark')) scores.precision += 1;
            if (card.keywords.includes('stance')) scores.precision += 1;
        }
    });

    Object.entries(ARCHETYPE_PACKS).forEach(([id, pack]) => {
        pack.cards.forEach(cardId => {
            if (cardIds.has(cardId)) scores[id] += 1;
        });
    });

    const top = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (!top[0] || top[0][1] < 6) return null;
    return top[0][0];
}

// 获取奖励卡牌选择
function getRewardCards(count = 3, characterId = null, deck = []) {
    const cards = [];
    const seen = new Set();
    const preferredArchetype = inferDeckArchetype(deck);

    for (let i = 0; i < count; i++) {
        let picked = null;
        for (let attempt = 0; attempt < 8; attempt++) {
            const favorArchetype = preferredArchetype && Math.random() < 0.55;
            const candidate = favorArchetype
                ? getRandomArchetypeCard(preferredArchetype, null, characterId)
                : getRandomCard(null, characterId);
            if (!candidate) continue;
            if (seen.has(candidate.id) && attempt < 7) continue;
            picked = candidate;
            break;
        }

        if (!picked) picked = getRandomCard(null, characterId);
        if (picked) {
            cards.push(picked);
            seen.add(picked.id);
        }
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

        sweepingStrike: { damage: 5 }, // 8 -> 13
        armorBreaker: { damage: 5 }, // 5 -> 10
        tripleSlash: { damage: 2 }, // 3x3 -> 5x3
        earthShatter: { damage: 15 }, // 25 -> 40
        swordBreaker: { damage: 10 }, // 15 -> 25
        bloodSlash: { damage: 6 }, // 8 -> 14
        finishingBlow: { damage: 4 }, // 10 -> 14

        goldenBell: { block: 5 }, // 15 -> 20
        offenseDefense: { multiplier: 1 }, // x3 -> x4
        halfDamage: { damageReduction: 25 }, // 50% -> 75%
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
        timeStasis: { damageReduction: 25 },  // 50% -> 75%

        // 新增卡牌升级
        soulHarvest: { damage: 5, maxHp: 1 }, // 12/2 -> 17/3
        fateTwist: { costReduction: 1 }, // 1 -> 0
        divineShield: { multiplier: 3 }, // 5 -> 8
        stormFury: { damage: 2 }, // 4 -> 6

        // 修正：虚空拥抱升级不加百分比，改为减费
        // 修正：虚空拥抱升级 +10% (10% -> 20%)
        voidEmbrace: { multiplier: 0.10 },
        karmaKill: { percent: 0.1 }, // 15% -> 25%

        // 修复：融合爆发升级
        fusionBlast: { draw: 1 },

        // 战斗深度扩展卡
        bloodlettingSlash: { damage: 2, bleed: 1 },
        punctureMark: { damage: 2, mark: 2 },
        tacticalExpose: { mark: 2, draw: 1 },
        crimsonCascade: { damage: 3, bleed: 1 },
        hunterSeal: { mark: 2 },
        guardedRiposte: { block: 2, mark: 1 },
        sunderingNeedle: { damage: 3, bleed: 1 },
        hemorrhageRain: { damage: 2, bleed: 1 },
        executionDoctrine: { damage: 3 },
        serratedRitual: { damage: 2, bleed: 1 },
        coagulatedGuard: { block: 2, bleed: 1 },
        bloodDebt: { energy: 1, draw: 1 },
        arteryRupture: { damage: 3, bleed: 1 },
        scarletJudgement: { damage: 3, bleed: 1 },
        bloodTideOath: { damage: 2, draw: 1 },
        weakpointSurvey: { mark: 1, draw: 1 },
        duetFeint: { damage: 2, mark: 1 },
        poisedCounter: { block: 2, mark: 1 },
        razorFocus: { mark: 2, energy: 1 },
        stancePivot: { mark: 1, draw: 1 },
        focusBreak: { damage: 2 },
        verdictNeedle: { damage: 3, mark: 1 }
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
            if (effect.type === 'drawCalculated' && specialRule.draw) {
                effect.base = (effect.base || 0) + specialRule.draw;
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
            if (effect.type === 'applyBleed' && specialRule.bleed) {
                effect.value += specialRule.bleed;
            }
            if (effect.type === 'applyMark' && specialRule.mark) {
                effect.value += specialRule.mark;
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
            if (effect.type === 'buff' && effect.buffType === 'damageReduction' && specialRule.damageReduction) {
                effect.value += specialRule.damageReduction;
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

            // Fix for missing upgrade handlers
            if (effect.type === 'damagePerLaw') {
                if (specialRule.baseDamage) effect.baseDamage += specialRule.baseDamage;
                if (specialRule.damagePerLaw) effect.damagePerLaw += specialRule.damagePerLaw;
            }
            if (effect.type === 'conditionalDamage' && specialRule.bonusDamage) {
                effect.bonusDamage += specialRule.bonusDamage;
            }
            if (effect.type === 'conditionalDamage' && specialRule.damage) {
                effect.value += specialRule.damage;
            }
            if (effect.type === 'blockFromLostHp' && specialRule.percent) {
                effect.percent += specialRule.percent;
            }
            if (effect.type === 'buff' && effect.buffType === 'stealBonus' && specialRule.stealBonus) {
                effect.value += specialRule.stealBonus;
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
    if (card.descriptionTemplate) {
        return card.descriptionTemplate.replace(/{e(\d+)}/g, (match, index) => {
            const i = parseInt(index);
            return card.effects[i] ? card.effects[i].value : '?';
        });
    }

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
            case 'gainSin':
                desc += `增加 ${effect.value} 点业力。`;
                break;
            case 'gainMerit':
                desc += `增加 ${effect.value} 点功德。`;
                break;
            case 'discardHand':
                desc += `丢弃所有手牌。`;
                break;
            case 'drawCalculated':
                desc += `抽 ${effect.base}+弃牌数x${effect.perDiscard} 张牌。`;
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
                else if (effect.buffType === 'stealBonus') desc += `本战法则盗取率+${Math.floor(effect.value * 100)}%。`;
                else if (effect.buffType === 'reflect') desc += `下次被攻击时反弹等量伤害。`;
                else if (effect.buffType === 'extraTurn') desc += `你额外行动 ${effect.value} 次。`;
                else if (effect.buffType === 'blockOnAttack') desc += `每打出攻击牌获得 ${effect.value} 点护盾。`;
                else if (effect.buffType === 'regen') desc += `回合开始时回复 ${effect.value} 点生命。`;
                else if (effect.buffType === 'meritOnRetain') desc += `回合结束每保留一张牌获得 ${effect.value} 点功德。`;
                else if (effect.buffType === 'energyOnVulnerable') desc += `攻击易伤敌人回复 ${effect.value} 点灵力。`;
                break;
            case 'damagePerLaw':
                desc += `根据装载法则数量+${effect.baseDamage}伤害（当前+${effect.damagePerLaw}/个）。`;
                break;
            case 'conditionalDamage':
                if (effect.condition === 'lowHp') {
                    desc += `若生命低于${Math.floor(effect.threshold * 100)}%，伤害翻倍。`;
                } else if (effect.condition === 'marked') {
                    desc += `若目标有破绽，额外造成 ${effect.value} 点伤害。`;
                } else if (effect.condition === 'sealed') {
                    desc += `若有被封印的命环槽，额外造成 ${effect.bonusDamage} 点伤害。`;
                } else {
                    desc += `若命环≥${effect.minLevel}级，再造成 ${effect.bonusDamage} 点伤害。`;
                }
                break;
            case 'applyBleed':
                desc += `施加 ${effect.value} 层流血。`;
                break;
            case 'applyMark':
                desc += `施加 ${effect.value} 层破绽。`;
                break;
            case 'setStance': {
                const stanceText = effect.stance === 'aggressive' ? '攻势' : (effect.stance === 'defensive' ? '守势' : '中和');
                desc += `切换到${stanceText}架势。`;
                break;
            }
            case 'blockFromLostHp':
                desc += `获得等于已损失生命${Math.floor(effect.percent * 100)}%的护盾。`;
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
