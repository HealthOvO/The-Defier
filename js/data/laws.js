/**
 * The Defier - 法则数据
 * 可盗取的法则定义
 */

const LAWS = {
    thunderLaw: {
        id: 'thunderLaw',
        name: '雷法残章',
        icon: '⚡',
        description: '雷霆之力。攻击时有30%几率触发一道惊雷，对随机敌人造成10点伤害。',
        rarity: 'rare',
        element: 'thunder',
        passive: {
            type: 'thunderStrike',
            chance: 0.3,
            value: 10
        },
        unlockCards: ['thunderLaw']
    },

    swordIntent: {
        id: 'swordIntent',
        name: '剑意碎片',
        icon: '🗡️',
        description: '无双剑意。穿透 40% 防御，且穿透伤害增加20%。',
        rarity: 'rare',
        element: 'sword',
        passive: {
            type: 'penetration',
            value: 0.4,
            damageBonus: 0.2
        },
        unlockCards: ['swordIntent']
    },

    flameTruth: {
        id: 'flameTruth',
        name: '火焰真意',
        icon: '🔥',
        description: '烈焰焚天。攻击必定施加1层灼烧。回合结束若攻击过，对全体敌人造成3点火伤。',
        rarity: 'rare',
        element: 'fire',
        passive: {
            type: 'flameMaster',
            burnLayers: 1,
            aoeDamage: 3
        },
        unlockCards: ['flameTruth']
    },

    earthDomain: {
        id: 'earthDomain',
        name: '大地领域',
        icon: '⛰️',
        description: '不动如山。护盾不会在回合结束时消失。',
        rarity: 'epic',
        element: 'earth',
        passive: {
            type: 'retainBlock'
        },
        unlockCards: []
    },

    spaceRift: {
        id: 'spaceRift',
        name: '空间裂隙',
        icon: '🌌',
        description: '虚空行走。每回合打出的第一张牌若不消耗灵力，抽1张牌。获得10%闪避。',
        rarity: 'rare',
        element: 'space',
        passive: {
            type: 'voidWalk', // New Type
            dodgeChance: 0.1,
            condDraw: 1
        },
        unlockCards: ['spaceRift']
    },

    timeStop: {
        id: 'timeStop',
        name: '时间静止',
        icon: '⏱️',
        description: '时光回溯。受致死伤时免疫并结束回合（每战1次）。攻击5%几率眩晕。',
        rarity: 'legendary',
        element: 'time',
        passive: {
            type: 'timeRecall',
            stunChance: 0.05,
            cheatDeath: 1
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

    chaosLaw: {
        id: 'chaosLaw',
        name: '混沌法则',
        icon: '🌀',
        description: '混沌之触。回合开始时，随机获得1个增益或给敌人施加1个负面效果（2层）。',
        rarity: 'legendary',
        element: 'chaos',
        passive: {
            type: 'chaosTouch',
            value: 2
        },
        unlockCards: ['chaosControl']
    },

    lifeDrain: {
        id: 'lifeDrain',
        name: '生命汲取',
        icon: '🩸',
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
        icon: '🛡️',
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
    },

    // ==================== 新增法则 ====================
    healingLaw: {
        id: 'healingLaw',
        name: '治愈法则',
        icon: '💚',
        description: '生命之力流转，每回合恢复生命',
        rarity: 'rare',
        element: 'life',
        passive: {
            type: 'healPerTurn',
            value: 5
        },
        unlockCards: ['healingTouch', 'bloodBlessing']
    },

    metalBody: {
        id: 'metalBody',
        name: '金属法则',
        icon: '🦾',
        description: '铜皮铁骨，护盾效果增强',
        rarity: 'rare',
        element: 'metal',
        passive: {
            type: 'blockBonus',
            value: 0.25  // 25%护盾加成
        },
        unlockCards: ['goldenBell', 'ironSkin']
    },

    karmaLaw: {
        id: 'karmaLaw',
        name: '因果法则',
        icon: '⚖️',
        description: '因果循环，伤害反弹',
        rarity: 'legendary',
        element: 'karma',
        passive: {
            type: 'reflectDamage',
            value: 0.1  // 10%伤害反弹
        },
        unlockCards: ['karmaKill']
    },

    reversalLaw: {
        id: 'reversalLaw',
        name: '逆转法则',
        icon: '🔄',
        description: '乾坤逆转，伤害化为治愈',
        rarity: 'legendary',
        element: 'reversal',
        passive: {
            type: 'damageToHeal',
            value: 0.2  // 20%几率伤害转治愈
        },
        unlockCards: ['reversal']
    }
};

// 天域对应的可盗取法则
const REALM_LAWS = {
    1: ['swordIntent'],                    // 凡尘界
    2: ['thunderLaw'],                     // 练气天
    3: ['swordIntent', 'spaceRift'],       // 筑基天
    4: ['flameTruth'],                     // 金丹天
    5: ['timeStop', 'voidEmbrace'],        // 元婴天
    6: ['lifeDrain', 'earthShield', 'healingLaw'],  // 化神天
    7: ['windSpeed', 'iceFreeze', 'metalBody'],     // 合体天
    8: ['voidEmbrace', 'karmaLaw'],        // 大乘天
    9: ['timeStop', 'reversalLaw']         // 飞升天
};

// 法则共鸣定义
const LAW_RESONANCES = {
    plasmaOverload: {
        id: 'plasmaOverload',
        name: '雷火崩坏',
        laws: ['thunderLaw', 'flameTruth'],
        description: '雷引火爆。攻击对拥有“灼烧”的敌人造成额外50%伤害，并触发一次雷击。',
        effect: { type: 'damageBoostVsDebuff', debuff: 'burn', percent: 0.5, extraEffect: 'thunderStrike' }
    },
    astralShift: {
        id: 'astralShift',
        name: '风空遁',
        laws: ['windSpeed', 'spaceRift'],
        description: '身如幻影。闪避成功时抽1张牌。',
        effect: { type: 'dodgeDraw', value: 1 }
    },
    absoluteZero: {
        id: 'absoluteZero',
        name: '绝对零度',
        laws: ['iceFreeze', 'timeStop'],
        description: '冻结时空。敌人被眩晕时获得3层虚弱。',
        effect: { type: 'stunDebuff', buffType: 'weak', value: 3 }
    },
    gaiaBlessing: {
        id: 'gaiaBlessing',
        name: '大地恩赐',
        laws: ['earthShield', 'lifeDrain'],
        description: '生生不息。回合结束若有护盾，恢复护盾值10%的生命。',
        effect: { type: 'shieldHeal', percent: 0.1 }
    },
    voidSlash: {
        id: 'voidSlash',
        name: '虚空斩',
        laws: ['swordIntent', 'voidEmbrace'],
        description: '无视防御。穿透伤害提升50%。',
        effect: { type: 'penetrateBonus', percent: 0.5 }
    },
    chaoticStorm: {
        id: 'chaoticStorm',
        name: '混沌终焉',
        laws: ['chaosLaw', 'thunderLaw'],
        description: '乱世雷鸣。每当你洗牌时，对所有敌人造成15点混乱伤害，并随机施加一种负面效果。',
        effect: { type: 'shuffleDamage', value: 15, debuff: 'random' }
    },

    // ==================== 新增法则共鸣 ====================
    extremeTemp: {
        id: 'extremeTemp',
        name: '极温爆裂',
        laws: ['flameTruth', 'iceFreeze'],
        description: '冰火不容。当对“冰冻/减速”敌人造成火焰伤害时，触发爆炸（最大生命值5%伤害，BOSS减半）。',
        effect: { type: 'elementalReaction', trigger: 'fire', targetDebuff: 'slow', damagePercent: 0.05 }
    },
    windThunderWing: {
        id: 'windThunderWing',
        name: '风雷翼',
        laws: ['windSpeed', 'thunderLaw'],
        description: '风助雷势。每打出3张牌，随机对一名敌人造成10点雷属性伤害。',
        effect: { type: 'cardPlayTrigger', count: 3, damage: 10, element: 'thunder' }
    },
    dimensionStrike: {
        id: 'dimensionStrike',
        name: '维度打击',
        laws: ['timeStop', 'spaceRift'],
        description: '时空扭曲。回合开始时，50%几率让手牌中随机3张卡牌耗能-1（本回合），或抽2张牌。',
        effect: { type: 'turnStartGamble', chance: 0.5, option1: 'costReduce', option2: 'draw', count: 3 }
    },
    godDemon: {
        id: 'godDemon',
        name: '神魔一念',
        laws: ['healingLaw', 'chaosLaw'],
        description: '圣魔同体。治疗效果提升50%。溢出的治疗量转化为对随机敌人的真实伤害。',
        effect: { type: 'healOverlowDamage', healBonus: 0.5 }
    },
    lifeReincarnation: {
        id: 'lifeReincarnation',
        name: '生命轮回',
        laws: ['healingLaw', 'timeStop'],
        description: '生死轮回。死亡时100%复活（每战一次）。',
        effect: { type: 'resurrect', value: 1, percent: 1.0 }
    },
    ironFortress: {
        id: 'ironFortress',
        name: '钢铁堡垒',
        laws: ['metalBody', 'earthShield'],
        description: '铜墙铁壁。护盾不会在回合结束时消失。',
        effect: { type: 'persistentBlock', value: true }
    },
    thunderSword: {
        id: 'thunderSword',
        name: '剑雷交织',
        laws: ['swordIntent', 'thunderLaw'],
        description: '电光剑影。穿透伤害附带2层麻痹（易伤）。',
        effect: { type: 'penetrateParalysis', value: 2 }
    }
};



/**
 * 获取当前可选择的进化路径
 * @param {Object} fateRing - 玩家的命环状态
 * @returns {Array} 可选择的路径列表
 */
function getAvailablePaths(fateRing) {
    const available = [];
    const currentLevel = fateRing.level;
    const currentPath = fateRing.path || 'crippled'; // Optimize: default to crippled
    const currentPathData = FATE_RING.paths[currentPath];
    const currentTier = currentPathData ? currentPathData.tier : 0;

    for (const pathId in FATE_RING.paths) {
        const path = FATE_RING.paths[pathId];

        // 跳过已选择的路径
        if (pathId === currentPath) continue;

        // BUG修复: 必须选择比当前Tier更高的路径，防止同级互转或降级
        if (path.tier <= currentTier) continue;

        // 检查等级要求
        if (path.levelReq && path.levelReq > currentLevel) continue;

        // 检查前置要求
        if (path.requires && path.requires.length > 0) {
            if (path.requiresAny) {
                // 满足任意一个即可
                const hasAny = path.requires.some(req =>
                    fateRing.unlockedPaths && fateRing.unlockedPaths.includes(req)
                );
                if (!hasAny && !path.requires.includes(currentPath)) continue;
            } else {
                // 必须满足所有
                const hasAll = path.requires.every(req =>
                    fateRing.unlockedPaths && fateRing.unlockedPaths.includes(req) || req === currentPath
                );
                if (!hasAll) continue;
            }
        }

        // 跳过残缺印记
        if (pathId === 'crippled') continue;

        available.push({ ...path, id: pathId });
    }

    return available;
}

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
    const elementMap = {
        'thunder': '雷',
        'fire': '火',
        'sword': '剑',
        'space': '空间',
        'time': '时间',
        'void': '虚空',
        'chaos': '混沌',
        'blood': '血', // lifeDrain -> blood? based on element: 'blood' in data
        'earth': '土',
        'wind': '风',
        'ice': '冰',
        'life': '生命',
        'metal': '金',
        'karma': '因果',
        'reversal': '逆转'
    };

    switch (passive.type) {
        case 'damageBonus':
            const eleName = elementMap[law.element] || law.element;
            return `${eleName}属性攻击+${passive.value}点伤害`;
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

        case 'extraDraw':
            return `每回合额外抽${passive.value}张牌`;
        case 'slowOnHit':
            return `${Math.floor(passive.chance * 100)}%几率减缓敌人${passive.value}回合`;
        case 'healPerTurn':
            return `每回合恢复${passive.value}点生命`;
        case 'chaosControl':
            return `${Math.floor(passive.value * 100)}%几率使敌人陷入混乱`;
        case 'reflectDamage':
            return `反弹${Math.floor(passive.value * 100)}%受到的伤害`;
        case 'damageToHeal':
            return `${Math.floor(passive.value * 100)}%几率将承受伤害转化为治疗`;
        case 'persistentBlock':
        case 'retainBlock':
            return `护盾不会在回合结束时消失`;
        case 'resurrect':
            return `死亡时${Math.floor(passive.percent * 100)}%血量复活（每场战斗${passive.value}次）`;
        case 'thunderStrike':
            return `攻击${Math.floor(passive.chance * 100)}%几率触发闪电（${passive.value}伤害）`;
        case 'flameMaster':
            return `攻击施加${passive.burnLayers}层灼烧，回合结束造成${passive.aoeDamage}点AOE`;
        case 'voidWalk':
            return `首张0耗牌抽${passive.condDraw}张，并获得${Math.floor(passive.dodgeChance * 100)}%闪避`;
        case 'timeRecall':
            return `免疫致死伤害（每战${passive.cheatDeath}次），攻击${Math.floor(passive.stunChance * 100)}%几率眩晕`;
        case 'chaosTouch':
            return `回合开始施加${passive.value}层随机Buff/Debuff`;
        case 'blockBonus':
            if (passive.value < 1) return `获得护盾效果提升${Math.floor(passive.value * 100)}%`;
            return `获得护盾时额外+${passive.value}`;
        default:
            return '未知效果';
    }
}
