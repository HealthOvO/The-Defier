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

    chaosLaw: {
        id: 'chaosLaw',
        name: '混沌法则',
        icon: '🌀',
        description: '操控人心，造成混乱',
        rarity: 'legendary',
        element: 'chaos',
        passive: {
            type: 'chaosControl', // 特殊效果：让敌人攻击其队友？目前单挑，改为强力debuff
            value: 0.1, // 10%几率让敌人混乱（跳过回合or攻击自己）
        },
        unlockCards: ['chaosControl']
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
        name: '雷火劫',
        laws: ['thunderLaw', 'flameTruth'],
        description: '雷火交加，毁灭万物。攻击造成伤害时额外造成5点真实伤害。',
        effect: { type: 'trueDamage', value: 5 }
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
        name: '混沌风暴',
        laws: ['chaosLaw', 'thunderLaw'],
        description: '不可名状的雷霆。回合开始造成3-8点随机雷属性伤害。',
        effect: { type: 'turnStartDamage', min: 3, max: 8, element: 'thunder' }
    },

    // ==================== 新增法则共鸣 ====================
    lifeReincarnation: {
        id: 'lifeReincarnation',
        name: '生命轮回',
        laws: ['healingLaw', 'timeStop'],
        description: '生死轮回。死亡时100%复活（每战一次）。',
        effect: { type: 'resurrect', value: 1, percent: 0.5 }
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
        description: '电光剑影。穿透伤害附带2层麻痹。',
        effect: { type: 'penetrateParalysis', value: 2 }
    }
};

// 命环信息
const FATE_RING = {
    // 命环等级定义
    levels: [
        { level: 0, name: '残缺印记', slots: 0, expRequired: 0, desc: '无法承载完整法则' },
        { level: 1, name: '一阶·觉醒', slots: 1, expRequired: 100, desc: '初识天机，可纳一法', canChoosePath: true, bonus: { maxHp: 10 } },
        { level: 2, name: '二阶·通玄', slots: 2, expRequired: 300, desc: '双法并济，生生不息', canChoosePath: true, bonus: { maxHp: 20, energy: 1 } },
        { level: 3, name: '三阶·神变', slots: 3, expRequired: 600, desc: '三元归一，神通自成', canChoosePath: true, bonus: { maxHp: 40, energy: 1, draw: 1 } },
        { level: 4, name: '四阶·逆命', slots: 4, expRequired: 1000, desc: '四象封天，逆乱阴阳', bonus: { maxHp: 60, energy: 2, draw: 1 } }
    ],

    // 命环进化路径
    paths: {
        // ===== 基础路径 =====
        crippled: {
            id: 'crippled',
            name: '残缺印记',
            icon: '💔',
            description: '天道所弃，命数残缺。灵力恢复减半，无法盗取法则。',
            bonus: { type: 'energyMalus', value: -1 },
            tier: 0
        },
        awakened: {
            id: 'awakened',
            name: '逆命之环',
            icon: '💫',
            description: '古玉重塑，逆天改命。解锁法则盗取能力。',
            bonus: { type: 'stealUnlock', value: true },
            tier: 1,
            requires: []
        },

        // ===== 一阶进化 (等级1时可选) =====
        power: {
            id: 'power',
            name: '力量之环',
            icon: '💪',
            description: '专注力量修炼。攻击伤害+15%。',
            bonus: { type: 'damageBonus', value: 0.15 },
            tier: 1,
            requires: ['awakened'],
            levelReq: 1
        },
        wisdom: {
            id: 'wisdom',
            name: '智慧之环',
            icon: '🧠',
            description: '精研心法奥义。每回合额外+1灵力。',
            bonus: { type: 'energyBonus', value: 1 },
            tier: 1,
            requires: ['awakened'],
            levelReq: 1
        },
        agility: {
            id: 'agility',
            name: '敏捷之环',
            icon: '🌪️',
            description: '身法如风。每回合多抽1张牌。',
            bonus: { type: 'drawBonus', value: 1 },
            tier: 1,
            requires: ['awakened'],
            levelReq: 1
        },
        defense: {
            id: 'defense',
            name: '坚韧之环',
            icon: '🏰',
            description: '铁壁铜墙。最大生命+20，护盾效果+20%。',
            bonus: { type: 'hpBonus', value: 20, blockBonus: 0.2 },
            tier: 1,
            requires: ['awakened'],
            levelReq: 1
        },

        // ===== 二阶进化 (等级2时可选) =====
        thunder_god: {
            id: 'thunder_god',
            name: '雷神环',
            icon: '⚡',
            description: '雷法大成，万雷听令。雷属性伤害+50%。',
            bonus: { type: 'elementBonus', element: 'thunder', value: 0.5 },
            tier: 2,
            requires: ['power'],
            levelReq: 2
        },
        flame_lord: {
            id: 'flame_lord',
            name: '焚天环',
            icon: '🔥',
            description: '业火焚身，涅槃重生。火焰伤害+50%，灼烧效果翻倍。',
            bonus: { type: 'elementBonus', element: 'fire', value: 0.5, burnDouble: true },
            tier: 2,
            requires: ['power'],
            levelReq: 2
        },
        sword_immortal: {
            id: 'sword_immortal',
            name: '剑仙环',
            icon: '🗡️',
            description: '一剑破万法。剑意伤害+40%，20%穿透。',
            bonus: { type: 'damageBonus', category: 'sword', value: 0.4, penetration: 0.2 },
            tier: 2,
            requires: ['power'],
            levelReq: 2
        },
        void_lord: {
            id: 'void_lord',
            name: '虚空环',
            icon: '🌀',
            description: '身化虚空，万法不沾。闪避率+20%。',
            bonus: { type: 'dodgeBonus', value: 0.2 },
            tier: 2,
            requires: ['agility'],
            levelReq: 2
        },
        time_master: {
            id: 'time_master',
            name: '时间环',
            icon: '⏰',
            description: '操控时间长河。10%几率获得额外回合。',
            bonus: { type: 'extraTurnChance', value: 0.1 },
            tier: 2,
            requires: ['wisdom'],
            levelReq: 2
        },

        // ===== 三阶进化 (等级3时可选) =====
        defiance: {
            id: 'defiance',
            name: '真·逆天之环',
            icon: '👑',
            description: '真正的逆命者！法则盗取率+50%，伤害+25%。',
            bonus: { type: 'ultimate', stealBonus: 0.5, damageBonus: 0.25 },
            tier: 3,
            requires: ['thunder_god', 'flame_lord', 'sword_immortal', 'void_lord', 'time_master'],
            requiresAny: true,
            levelReq: 3
        },

        // ===== 四阶进化 (等级4时可选) =====
        law_hunter: {
            id: 'law_hunter',
            name: '天道猎手',
            icon: '🎯',
            description: '法则猎手。法则盗取100%成功，但效果减半。',
            bonus: { type: 'lawHunter', stealRate: 1.0, effectReduction: 0.5 },
            tier: 4,
            requires: ['defiance'],
            levelReq: 4
        },
        law_fusion: {
            id: 'law_fusion',
            name: '法则融合',
            icon: '🔮',
            description: '法则大成。可同时装载5个法则，但每回合-1灵力。',
            bonus: { type: 'lawFusion', extraSlots: 1, energyPenalty: 1 },
            tier: 4,
            requires: ['defiance'],
            levelReq: 4
        },
        pure_power: {
            id: 'pure_power',
            name: '纯粹之力',
            icon: '💪',
            description: '放弃法则，回归本心。放弃所有法则，攻击伤害+100%。',
            bonus: { type: 'purePower', damageBonus: 1.0, noLaws: true },
            tier: 4,
            requires: ['defiance'],
            levelReq: 4
        }
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
    const currentPath = fateRing.path;

    for (const pathId in FATE_RING.paths) {
        const path = FATE_RING.paths[pathId];

        // 跳过已选择的路径
        if (pathId === currentPath) continue;

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
        case 'healPerTurn':
            return `每回合恢复${passive.value}点生命`;
        case 'chaosControl':
            return `${Math.floor(passive.value * 100)}%几率使敌人陷入混乱`;
        case 'reflectDamage':
            return `反弹${Math.floor(passive.value * 100)}%受到的伤害`;
        case 'damageToHeal':
            return `${Math.floor(passive.value * 100)}%几率将承受伤害转化为治疗`;
        case 'persistentBlock':
            return `护盾不会在回合结束时消失`;
        case 'resurrect':
            return `死亡时${Math.floor(passive.percent * 100)}%血量复活（每场战斗${passive.value}次）`;
        default:
            return '未知效果';
    }
}
