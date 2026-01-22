/**
 * The Defier - 法则数据
 * 可盗取的法则定义
 */

const LAWS = {
    thunderLaw: {
        id: 'thunderLaw',
        name: '雷法残章',
        icon: '⚡',
        description: '掌握雷电之力，攻击附带雷电效果',
        rarity: 'rare',
        element: 'thunder',
        passive: {
            type: 'damageBonus',
            element: 'thunder',
            value: 2
        },
        unlockCards: ['thunderLaw']
    },

    swordIntent: {
        id: 'swordIntent',
        name: '剑意碎片',
        icon: '🗡️',
        description: '领悟剑道真意，穿透敌人防御',
        rarity: 'rare',
        element: 'sword',
        passive: {
            type: 'penetration',
            value: 0.15
        },
        unlockCards: ['swordIntent']
    },

    flameTruth: {
        id: 'flameTruth',
        name: '火焰真意',
        icon: '🔥',
        description: '驾驭真火，灼烧敌人灵魂',
        rarity: 'rare',
        element: 'fire',
        passive: {
            type: 'burnOnHit',
            value: 1,
            chance: 0.3
        },
        unlockCards: ['flameTruth']
    },

    spaceRift: {
        id: 'spaceRift',
        name: '空间裂隙',
        icon: '🌀',
        description: '撕裂空间，闪避致命打击',
        rarity: 'rare',
        element: 'space',
        passive: {
            type: 'dodgeChance',
            value: 0.1
        },
        unlockCards: ['spaceRift']
    },

    timeStop: {
        id: 'timeStop',
        name: '时间静止',
        icon: '⏱️',
        description: '操控时间，让敌人陷入停滞',
        rarity: 'legendary',
        element: 'time',
        passive: {
            type: 'stunChance',
            value: 0.1
        },
        unlockCards: ['timeStop']
    },

    voidEmbrace: {
        id: 'voidEmbrace',
        name: '虚空拥抱',
        icon: '🕳️',
        description: '虚空之力，根据敌人弱点造成毁灭伤害',
        rarity: 'legendary',
        element: 'void',
        passive: {
            type: 'executionBonus',
            value: 0.2
        },
        unlockCards: ['voidEmbrace']
    },

    lifeDrain: {
        id: 'lifeDrain',
        name: '生命汲取',
        icon: '💉',
        description: '汲取敌人生命，恢复自身',
        rarity: 'rare',
        element: 'blood',
        passive: {
            type: 'lifeSteal',
            value: 0.1
        },
        unlockCards: []
    },

    earthShield: {
        id: 'earthShield',
        name: '大地护盾',
        icon: '🪨',
        description: '大地守护，获得额外护盾',
        rarity: 'rare',
        element: 'earth',
        passive: {
            type: 'blockBonus',
            value: 2
        },
        unlockCards: []
    },

    windSpeed: {
        id: 'windSpeed',
        name: '疾风之势',
        icon: '🌪️',
        description: '疾风加身，每回合额外抽牌',
        rarity: 'rare',
        element: 'wind',
        passive: {
            type: 'extraDraw',
            value: 1
        },
        unlockCards: []
    },

    iceFreeze: {
        id: 'iceFreeze',
        name: '冰封真意',
        icon: '❄️',
        description: '冰霜之力，减缓敌人行动',
        rarity: 'rare',
        element: 'ice',
        passive: {
            type: 'slowOnHit',
            value: 1,
            chance: 0.2
        },
        unlockCards: []
    }
};

// 天域对应的可盗取法则
const REALM_LAWS = {
    1: ['swordIntent'],      // 凡尘界
    2: ['thunderLaw'],       // 练气天
    3: ['swordIntent', 'spaceRift'],  // 筑基天
    4: ['flameTruth'],       // 金丹天
    5: ['timeStop', 'voidEmbrace'],   // 元婴天
    6: ['lifeDrain', 'earthShield'],  // 化神天
    7: ['windSpeed', 'iceFreeze'],    // 合体天
    8: ['voidEmbrace'],      // 大乘天
    9: ['timeStop']          // 飞升天
};

// 命环信息
const FATE_RING = {
    levels: [
        { level: 1, name: '一阶', slots: 1, expRequired: 0 },
        { level: 2, name: '二阶', slots: 2, expRequired: 100 },
        { level: 3, name: '三阶', slots: 3, expRequired: 300 },
        { level: 4, name: '四阶', slots: 4, expRequired: 600 }
    ],

    // 命环进化路径
    paths: {
        basic: {
            name: '基础命环',
            description: '最初的命环，蕴含无限可能'
        },
        power: {
            name: '力量之环',
            description: '攻击力+15%',
            bonus: { type: 'damageMultiplier', value: 1.15 },
            requires: ['basic']
        },
        agility: {
            name: '敏捷之环',
            description: '每回合额外抽1张牌',
            bonus: { type: 'extraDraw', value: 1 },
            requires: ['basic']
        },
        wisdom: {
            name: '智慧之环',
            description: '每回合额外1点灵力',
            bonus: { type: 'extraEnergy', value: 1 },
            requires: ['basic']
        },
        defiance: {
            name: '逆天之环',
            description: '所有效果+25%，盗取几率翻倍',
            bonus: { type: 'allBonus', value: 1.25 },
            requires: ['power', 'agility', 'wisdom']
        }
    }
};

// 尝试盗取法则
function attemptStealLaw(enemy, stealBonus = 0) {
    if (!enemy.stealLaw) return null;

    const chance = Math.min(enemy.stealChance + stealBonus, 0.9);
    if (Math.random() < chance) {
        const lawId = enemy.stealLaw;
        return LAWS[lawId] ? { ...LAWS[lawId] } : null;
    }
    return null;
}

// 获取法则被动效果描述
function getLawPassiveDescription(law) {
    const passive = law.passive;
    switch (passive.type) {
        case 'damageBonus':
            return `${law.element}属性攻击+${passive.value}点伤害`;
        case 'penetration':
            return `${Math.floor(passive.value * 100)}%伤害无视护盾`;
        case 'burnOnHit':
            return `${Math.floor(passive.chance * 100)}%几率附加${passive.value}层灼烧`;
        case 'dodgeChance':
            return `${Math.floor(passive.value * 100)}%几率闪避攻击`;
        case 'stunChance':
            return `${Math.floor(passive.value * 100)}%几率使敌人眩晕`;
        case 'executionBonus':
            return `对生命值低于${Math.floor(passive.value * 100)}%的敌人造成双倍伤害`;
        case 'lifeSteal':
            return `造成伤害时恢复${Math.floor(passive.value * 100)}%生命`;
        case 'blockBonus':
            return `获得护盾时额外+${passive.value}`;
        case 'extraDraw':
            return `每回合额外抽${passive.value}张牌`;
        case 'slowOnHit':
            return `${Math.floor(passive.chance * 100)}%几率减缓敌人${passive.value}回合`;
        default:
            return '未知效果';
    }
}
