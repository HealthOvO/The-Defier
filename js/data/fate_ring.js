/**
 * The Defier - 命环系统数据
 * 定义命环的等级、加成和进化路径
 */

const FATE_RING = {
    // 等级定义
    levels: {
        0: { exp: 100, slots: 1, bonus: { maxHp: 0, energy: 0, draw: 0 } },
        1: { exp: 300, slots: 2, bonus: { maxHp: 10, energy: 0, draw: 0 } },
        2: { exp: 600, slots: 3, bonus: { maxHp: 20, energy: 0, draw: 0 } },
        3: { exp: 1000, slots: 3, bonus: { maxHp: 30, energy: 1, draw: 0 } }, // 突破：获得灵力
        4: { exp: 1500, slots: 4, bonus: { maxHp: 40, energy: 1, draw: 0 } },
        5: { exp: 2200, slots: 4, bonus: { maxHp: 50, energy: 1, draw: 1 } }, // 突破：获得抽牌
        6: { exp: 3000, slots: 5, bonus: { maxHp: 70, energy: 1, draw: 1 } }, // HP +60 -> +70
        7: { exp: 4000, slots: 5, bonus: { maxHp: 80, energy: 2, draw: 1 } }, // HP +70 -> +80
        8: { exp: 5500, slots: 6, bonus: { maxHp: 100, energy: 2, draw: 2 } }, // HP +80 -> +100, Draw +1 -> +2
        9: { exp: 7500, slots: 6, bonus: { maxHp: 120, energy: 2, draw: 2 } }, // HP +90 -> +120
        10: { exp: 99999, slots: 7, bonus: { maxHp: 150, energy: 3, draw: 3 } } // HP +100 -> +150, Draw +2 -> +3
    },

    // 进化路径
    paths: {
        crippled: {
            id: 'crippled',
            name: '残缺',
            tier: 0,
            description: '命环破损，无法凝聚法则之力。',
            bonus: null
        },
        awakened: {
            id: 'awakened',
            name: '觉醒',
            icon: '✨',
            tier: 1,
            levelReq: 1, // Requires Level 1
            description: '命环初醒，开始适应法则之力。全属性微量提升。',
            bonus: { type: 'hpBonus', value: 10 }
        },
        toughness: {
            id: 'toughness',
            name: '坚韧之环',
            icon: '🛡️',
            tier: 2,
            levelReq: 3,
            requires: ['awakened'],
            description: '铁壁铜墙。最大生命+50，护盾效果+30%。',
            bonus: { type: 'hpBonus', value: 50 }
            // 护盾加成需逻辑支持
        },
        agility: {
            id: 'agility',
            name: '敏捷之环',
            icon: '🌪️',
            tier: 2,
            levelReq: 3,
            requires: ['awakened'],
            description: '身轻如燕。每回合额外抽1张牌，闪避率+10%。',
            bonus: { type: 'drawBonus', value: 1 }
        },
        insight: {
            id: 'insight',
            name: '洞察之环',
            icon: '👁️',
            tier: 2,
            levelReq: 3,
            requires: ['awakened'],
            description: '洞悉弱点。造成的伤害+20%，击杀敌人恢复5点生命。',
            bonus: { type: 'damageBonus', value: 0.2 } // 需逻辑支持
        },
        destruction: {
            id: 'destruction',
            name: '毁灭之环',
            icon: '🔥',
            tier: 2,
            levelReq: 3,
            requires: ['awakened'],
            description: '破坏万物。所有攻击伤害+30%，但护盾获得量-20%。',
            bonus: { type: 'damageBonus', value: 0.3 } // 需逻辑支持
        },
        wisdom: {
            id: 'wisdom',
            name: '智慧之环',
            icon: '🔮',
            tier: 2,
            levelReq: 3,
            requires: ['awakened'],
            description: '法力无边。灵力上限+1，且战斗开始时额外获得2张随机技能牌。',
            bonus: { type: 'energyBonus', value: 1 }
        },
        resonance: {
            id: 'resonance',
            name: '回响之环',
            icon: '🎼',
            tier: 2,
            levelReq: 3,
            requires: ['awakened'],
            description: '命轨回响。战斗开始时奶糖上限外 +1；每回合首次打出技能牌后额外抽1张牌。',
            bonus: null
        },
        convergence: {
            id: 'convergence',
            name: '汇流之环',
            icon: '🌀',
            tier: 2,
            levelReq: 3,
            requires: ['awakened'],
            description: '势能汇流。战斗开始获得1点灵力；每回合首次打出攻击牌，伤害+4。',
            bonus: null
        },
        defiance: {
            id: 'defiance',
            name: '逆天之环',
            icon: '👑',
            tier: 3,
            levelReq: 7,
            requiresAny: true,
            requires: ['toughness', 'agility', 'insight', 'destruction', 'wisdom', 'resonance', 'convergence'],
            description: '逆转天命。攻击大幅提升，免疫一次致死伤害。',
            bonus: { type: 'ultimate' }
        }
    }
};
