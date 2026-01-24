/**
 * The Defier - 敌人数据
 * 所有敌人的定义
 */

const ENEMIES = {
    // ==================== 第一重·凡尘界 ====================
    bandit: {
        id: 'bandit',
        name: '山贼',
        icon: '🗡️',
        realm: 1,
        hp: 30,
        patterns: [
            { type: 'attack', value: 6, intent: '⚔️' },
            { type: 'attack', value: 8, intent: '⚔️' },
            { type: 'defend', value: 5, intent: '🛡️' }
        ],
        stealChance: 0.1,
        stealLaw: null,
        gold: { min: 10, max: 20 }
    },

    wildBoar: {
        id: 'wildBoar',
        name: '野猪',
        icon: '🐗',
        realm: 1,
        hp: 25,
        patterns: [
            { type: 'attack', value: 7, intent: '⚔️' },
            { type: 'attack', value: 5, intent: '⚔️' },
            { type: 'attack', value: 10, intent: '⚔️' }
        ],
        stealChance: 0.05,
        stealLaw: null,
        gold: { min: 8, max: 15 }
    },

    banditLeader: {
        id: 'banditLeader',
        name: '山寨头目',
        icon: '👹',
        realm: 1,
        isBoss: true,
        hp: 80,
        patterns: [
            { type: 'attack', value: 10, intent: '⚔️' },
            { type: 'attack', value: 12, intent: '⚔️' },
            { type: 'defend', value: 8, intent: '🛡️' },
            { type: 'buff', buffType: 'strength', value: 2, intent: '💪' },
            { type: 'attack', value: 15, intent: '⚔️' }
        ],
        stealChance: 0.3,
        stealLaw: 'swordIntent',
        gold: { min: 50, max: 80 }
    },

    // ==================== 第二重·练气天 ====================
    spiritWolf: {
        id: 'spiritWolf',
        name: '灵狼',
        icon: '🐺',
        realm: 2,
        hp: 35,
        patterns: [
            { type: 'attack', value: 8, intent: '⚔️' },
            { type: 'attack', value: 6, intent: '⚔️' },
            { type: 'attack', value: 10, intent: '⚔️' }
        ],
        stealChance: 0.15,
        stealLaw: null,
        gold: { min: 15, max: 25 }
    },

    thunderBeast: {
        id: 'thunderBeast',
        name: '雷兽',
        icon: '⚡',
        realm: 2,
        hp: 40,
        patterns: [
            { type: 'attack', value: 9, intent: '⚔️' },
            { type: 'debuff', buffType: 'vulnerable', value: 2, intent: '✨' },
            { type: 'attack', value: 12, intent: '⚔️' }
        ],
        stealChance: 0.25,
        stealLaw: 'thunderLaw',
        gold: { min: 20, max: 30 }
    },

    demonWolf: {
        id: 'demonWolf',
        name: '妖狼王',
        icon: '🐾',
        realm: 2,
        isBoss: true,
        hp: 100,
        patterns: [
            { type: 'attack', value: 12, intent: '⚔️' },
            { type: 'attack', value: 8, intent: '⚔️' },
            { type: 'buff', buffType: 'strength', value: 3, intent: '💪' },
            { type: 'multiAttack', value: 5, count: 3, intent: '🔥' },
            { type: 'defend', value: 12, intent: '🛡️' }
        ],
        stealChance: 0.4,
        stealLaw: 'thunderLaw',
        gold: { min: 80, max: 120 }
    },

    // ==================== 第三重·筑基天 ====================
    swordDisciple: {
        id: 'swordDisciple',
        name: '剑修弟子',
        icon: '🗡️',
        realm: 3,
        hp: 45,
        patterns: [
            { type: 'attack', value: 10, intent: '⚔️' },
            { type: 'attack', value: 8, intent: '⚔️' },
            { type: 'defend', value: 8, intent: '🛡️' },
            { type: 'attack', value: 14, intent: '⚔️' }
        ],
        stealChance: 0.2,
        stealLaw: 'swordIntent',
        gold: { min: 25, max: 40 }
    },

    talismanMaster: {
        id: 'talismanMaster',
        name: '符修',
        icon: '📜',
        realm: 3,
        hp: 38,
        patterns: [
            { type: 'debuff', buffType: 'weak', value: 2, intent: '✨' },
            { type: 'attack', value: 12, intent: '⚔️' },
            { type: 'defend', value: 10, intent: '🛡️' },
            { type: 'buff', buffType: 'strength', value: 2, intent: '💪' }
        ],
        stealChance: 0.2,
        stealLaw: 'spaceRift',
        gold: { min: 25, max: 40 }
    },

    swordElder: {
        id: 'swordElder',
        name: '仙门长老',
        icon: '👴',
        realm: 3,
        isBoss: true,
        hp: 130,
        patterns: [
            { type: 'attack', value: 14, intent: '⚔️' },
            { type: 'attack', value: 10, intent: '⚔️' },
            { type: 'buff', buffType: 'strength', value: 2, intent: '💪' },
            { type: 'defend', value: 15, intent: '🛡️' },
            { type: 'attack', value: 20, intent: '⚔️' },
            { type: 'multiAttack', value: 6, count: 4, intent: '🔥' }
        ],
        stealChance: 0.5,
        stealLaw: 'swordIntent',
        gold: { min: 120, max: 180 }
    },

    // ==================== 第四重·金丹天 ====================
    flameCultist: {
        id: 'flameCultist',
        name: '火修',
        icon: '🔥',
        realm: 4,
        hp: 50,
        patterns: [
            { type: 'attack', value: 11, intent: '⚔️' },
            { type: 'debuff', buffType: 'burn', value: 3, intent: '🔥' },
            { type: 'attack', value: 8, intent: '⚔️' },
            { type: 'attack', value: 15, intent: '⚔️' }
        ],
        stealChance: 0.25,
        stealLaw: 'flameTruth',
        gold: { min: 35, max: 55 }
    },

    alchemyGolem: {
        id: 'alchemyGolem',
        name: '丹傀儡',
        icon: '🤖',
        realm: 4,
        hp: 70,
        patterns: [
            { type: 'defend', value: 12, intent: '🛡️' },
            { type: 'attack', value: 16, intent: '⚔️' },
            { type: 'defend', value: 15, intent: '🛡️' },
            { type: 'attack', value: 20, intent: '⚔️' }
        ],
        stealChance: 0.15,
        stealLaw: null,
        gold: { min: 40, max: 60 }
    },

    danZun: {
        id: 'danZun',
        name: '丹尊',
        icon: '🧙',
        realm: 4,
        isBoss: true,
        hp: 170,
        patterns: [
            { type: 'buff', buffType: 'strength', value: 3, intent: '💪' },
            { type: 'attack', value: 18, intent: '⚔️' },
            { type: 'heal', value: 15, intent: '💚' },
            { type: 'debuff', buffType: 'burn', value: 5, intent: '🔥' },
            { type: 'attack', value: 22, intent: '⚔️' },
            { type: 'multiAttack', value: 8, count: 4, intent: '🔥' }
        ],
        stealChance: 0.5,
        stealLaw: 'flameTruth',
        gold: { min: 180, max: 250 }
    },

    // ==================== 第五重·元婴天 ====================
    ancientGhost: {
        id: 'ancientGhost',
        name: '元婴老怪',
        icon: '👻',
        realm: 5,
        hp: 80,
        patterns: [
            { type: 'attack', value: 15, intent: '⚔️' },
            { type: 'debuff', buffType: 'weak', value: 3, intent: '✨' },
            { type: 'attack', value: 18, intent: '⚔️' },
            { type: 'heal', value: 10, intent: '💚' }
        ],
        stealChance: 0.3,
        stealLaw: 'timeStop',
        gold: { min: 50, max: 80 }
    },

    ancientSpirit: {
        id: 'ancientSpirit',
        name: '上古遗灵',
        icon: '💀',
        realm: 5,
        isBoss: true,
        hp: 220,
        patterns: [
            { type: 'attack', value: 20, intent: '⚔️' },
            { type: 'debuff', buffType: 'vulnerable', value: 3, intent: '✨' },
            { type: 'defend', value: 20, intent: '🛡️' },
            { type: 'buff', buffType: 'strength', value: 4, intent: '💪' },
            { type: 'attack', value: 25, intent: '⚔️' },
            { type: 'multiAttack', value: 10, count: 5, intent: '🔥' }
        ],
        stealChance: 0.6,
        stealLaw: 'timeStop',
        gold: { min: 250, max: 350 }
    },

    // ==================== 第六重·化神天 ====================
    divineSwordsman: {
        id: 'divineSwordsman',
        name: '化神剑修',
        icon: '⚔️',
        realm: 6,
        hp: 100,
        patterns: [
            { type: 'attack', value: 18, intent: '⚔️' },
            { type: 'attack', value: 22, intent: '⚔️' },
            { type: 'defend', value: 15, intent: '🛡️' },
            { type: 'multiAttack', value: 8, count: 3, intent: '🔥' }
        ],
        stealChance: 0.35,
        stealLaw: 'swordIntent',
        gold: { min: 70, max: 110 }
    },

    thunderTribulation: {
        id: 'thunderTribulation',
        name: '天劫雷灵',
        icon: '⛈️',
        realm: 6,
        hp: 90,
        patterns: [
            { type: 'attack', value: 20, intent: '⚔️' },
            { type: 'debuff', buffType: 'paralysis', value: 2, intent: '⚡' },
            { type: 'attack', value: 25, intent: '⚔️' },
            { type: 'debuff', buffType: 'burn', value: 4, intent: '🔥' }
        ],
        stealChance: 0.4,
        stealLaw: 'thunderLaw',
        gold: { min: 65, max: 100 }
    },

    divineLord: {
        id: 'divineLord',
        name: '化神大能',
        icon: '🧙‍♂️',
        realm: 6,
        isBoss: true,
        hp: 280,
        patterns: [
            { type: 'buff', buffType: 'strength', value: 4, intent: '💪' },
            { type: 'attack', value: 25, intent: '⚔️' },
            { type: 'heal', value: 20, intent: '💚' },
            { type: 'debuff', buffType: 'vulnerable', value: 3, intent: '✨' },
            { type: 'attack', value: 30, intent: '⚔️' },
            { type: 'multiAttack', value: 12, count: 4, intent: '🔥' },
            { type: 'defend', value: 25, intent: '🛡️' }
        ],
        stealChance: 0.65,
        stealLaw: 'voidEmbrace',
        gold: { min: 320, max: 450 }
    },

    // ==================== 第七重·合体天 ====================
    fusionAncestor: {
        id: 'fusionAncestor',
        name: '合体老祖',
        icon: '👴',
        realm: 7,
        hp: 130,
        patterns: [
            { type: 'attack', value: 22, intent: '⚔️' },
            { type: 'buff', buffType: 'strength', value: 3, intent: '💪' },
            { type: 'attack', value: 28, intent: '⚔️' },
            { type: 'defend', value: 20, intent: '🛡️' }
        ],
        stealChance: 0.4,
        stealLaw: 'timeStop',
        gold: { min: 90, max: 140 }
    },

    starBeast: {
        id: 'starBeast',
        name: '星辰巨兽',
        icon: '🌟',
        realm: 7,
        hp: 150,
        patterns: [
            { type: 'attack', value: 25, intent: '⚔️' },
            { type: 'attack', value: 20, intent: '⚔️' },
            { type: 'multiAttack', value: 10, count: 4, intent: '🔥' },
            { type: 'defend', value: 25, intent: '🛡️' }
        ],
        stealChance: 0.35,
        stealLaw: 'spaceRift',
        gold: { min: 100, max: 160 }
    },

    fusionSovereign: {
        id: 'fusionSovereign',
        name: '合体天尊',
        icon: '👑',
        realm: 7,
        isBoss: true,
        hp: 350,
        patterns: [
            { type: 'attack', value: 30, intent: '⚔️' },
            { type: 'debuff', buffType: 'weak', value: 4, intent: '✨' },
            { type: 'buff', buffType: 'strength', value: 5, intent: '💪' },
            { type: 'defend', value: 30, intent: '🛡️' },
            { type: 'attack', value: 35, intent: '⚔️' },
            { type: 'multiAttack', value: 14, count: 5, intent: '🔥' },
            { type: 'heal', value: 25, intent: '💚' }
        ],
        stealChance: 0.7,
        stealLaw: 'timeStop',
        gold: { min: 400, max: 550 }
    },

    // ==================== 第八重·大乘天 ====================
    mahayanaShadow: {
        id: 'mahayanaShadow',
        name: '大乘虚影',
        icon: '👤',
        realm: 8,
        hp: 180,
        patterns: [
            { type: 'attack', value: 28, intent: '⚔️' },
            { type: 'debuff', buffType: 'vulnerable', value: 4, intent: '✨' },
            { type: 'attack', value: 32, intent: '⚔️' },
            { type: 'buff', buffType: 'strength', value: 4, intent: '💪' }
        ],
        stealChance: 0.45,
        stealLaw: 'voidEmbrace',
        gold: { min: 130, max: 200 }
    },

    riftGuardian: {
        id: 'riftGuardian',
        name: '时空裂隙守卫',
        icon: '🌀',
        realm: 8,
        hp: 200,
        patterns: [
            { type: 'defend', value: 30, intent: '🛡️' },
            { type: 'attack', value: 30, intent: '⚔️' },
            { type: 'debuff', buffType: 'stun', value: 1, intent: '💫' },
            { type: 'multiAttack', value: 12, count: 4, intent: '🔥' }
        ],
        stealChance: 0.4,
        stealLaw: 'timeRewind',
        gold: { min: 150, max: 220 }
    },

    mahayanaSupreme: {
        id: 'mahayanaSupreme',
        name: '大乘至尊',
        icon: '🔱',
        realm: 8,
        isBoss: true,
        hp: 450,
        patterns: [
            { type: 'buff', buffType: 'strength', value: 5, intent: '💪' },
            { type: 'attack', value: 35, intent: '⚔️' },
            { type: 'debuff', buffType: 'burn', value: 5, intent: '🔥' },
            { type: 'defend', value: 35, intent: '🛡️' },
            { type: 'attack', value: 40, intent: '⚔️' },
            { type: 'multiAttack', value: 16, count: 5, intent: '🔥' },
            { type: 'heal', value: 30, intent: '💚' },
            { type: 'debuff', buffType: 'vulnerable', value: 4, intent: '✨' }
        ],
        stealChance: 0.75,
        stealLaw: 'karmaKill',
        gold: { min: 500, max: 700 }
    },

    // ==================== 第九重·飞升天 ====================
    ascensionMessenger: {
        id: 'ascensionMessenger',
        name: '飞升使者',
        icon: '👼',
        realm: 9,
        hp: 250,
        patterns: [
            { type: 'attack', value: 35, intent: '⚔️' },
            { type: 'buff', buffType: 'strength', value: 5, intent: '💪' },
            { type: 'attack', value: 40, intent: '⚔️' },
            { type: 'heal', value: 20, intent: '💚' }
        ],
        stealChance: 0.5,
        stealLaw: 'timeStop',
        gold: { min: 180, max: 280 }
    },

    heavenlyEnforcer: {
        id: 'heavenlyEnforcer',
        name: '天道执法者',
        icon: '⚖️',
        realm: 9,
        hp: 280,
        patterns: [
            { type: 'attack', value: 38, intent: '⚔️' },
            { type: 'debuff', buffType: 'stun', value: 1, intent: '💫' },
            { type: 'multiAttack', value: 15, count: 5, intent: '🔥' },
            { type: 'defend', value: 40, intent: '🛡️' }
        ],
        stealChance: 0.45,
        stealLaw: 'karmaKill',
        gold: { min: 200, max: 320 }
    },

    // ==================== 第十重·地仙界 ====================
    earthGuardian: {
        id: 'earthGuardian',
        name: '地脉守卫',
        icon: '🗿',
        realm: 10,
        hp: 180, // 220 -> 180
        patterns: [
            { type: 'defend', value: 25, intent: '🛡️' }, // 30 -> 25
            { type: 'attack', value: 20, intent: '⚔️' }, // 25 -> 20
            { type: 'buff', buffType: 'thorns', value: 3, intent: '🌵' },
            { type: 'attack', value: 25, intent: '⚔️' } // 30 -> 25
        ],
        stealChance: 0.3,
        stealLaw: 'earthShield',
        gold: { min: 150, max: 250 }
    },

    terraTitan: {
        id: 'terraTitan',
        name: '镇岳巨灵',
        icon: '⛰️',
        realm: 10,
        isBoss: true,
        hp: 450, // 550 -> 450
        patterns: [
            { type: 'attack', value: 30, intent: '⚔️' }, // 35 -> 30
            { type: 'defend', value: 35, intent: '🛡️' }, // 45 -> 35
            { type: 'attack', value: 35, intent: '⚔️' }, // 45 -> 35
            { type: 'debuff', buffType: 'stun', value: 1, intent: '🔨' },
            { type: 'multiAttack', value: 12, count: 4, intent: '🔥' } // 15 -> 12
        ],
        stealChance: 0.6,
        stealLaw: 'earthShield',
        gold: { min: 350, max: 500 }
    },

    // ==================== 第十一重·天仙界 ====================
    cloudSpirit: {
        id: 'cloudSpirit',
        name: '流云仙灵',
        icon: '☁️',
        realm: 11,
        hp: 200, // 250 -> 200
        patterns: [
            { type: 'buff', buffType: 'dodge', value: 2, intent: '💨' },
            { type: 'attack', value: 30, intent: '⚔️' }, // 40 -> 30
            { type: 'attack', value: 28, intent: '⚔️' } // 35 -> 28
        ],
        stealChance: 0.3,
        stealLaw: 'windSpeed',
        gold: { min: 200, max: 300 }
    },

    celestialJudge: {
        id: 'celestialJudge',
        name: '司天神官',
        icon: '📜',
        realm: 11,
        isBoss: true,
        hp: 550, // 650 -> 550
        patterns: [
            { type: 'debuff', buffType: 'weak', value: 4, intent: '✨' },
            { type: 'attack', value: 40, intent: '⚔️' }, // 45 -> 40
            { type: 'debuff', buffType: 'vulnerable', value: 4, intent: '💢' },
            { type: 'attack', value: 45, intent: '⚔️' }, // 50 -> 45
            { type: 'heal', value: 35, intent: '💚' } // 40 -> 35
        ],
        stealChance: 0.7,
        stealLaw: 'lightHeal',
        gold: { min: 400, max: 600 }
    },

    // ==================== 第十二重·金仙界 ====================
    goldenSoldier: {
        id: 'goldenSoldier',
        name: '金甲天兵',
        icon: '🛡️',
        realm: 12,
        hp: 300, // 400 -> 300
        patterns: [
            { type: 'defend', value: 40, intent: '🛡️' }, // 50 -> 40
            { type: 'attack', value: 40, intent: '⚔️' }, // 50 -> 40
            { type: 'multiAttack', value: 12, count: 3, intent: '🔥' } // 15 -> 12
        ],
        stealChance: 0.3,
        stealLaw: 'metalBody',
        gold: { min: 250, max: 350 }
    },

    gildedEmperor: {
        id: 'gildedEmperor',
        name: '金阙帝君',
        icon: '👑',
        realm: 12,
        isBoss: true,
        hp: 700, // 800 -> 700
        patterns: [
            { type: 'buff', buffType: 'strength', value: 5, intent: '💪' }, // 6 -> 5
            { type: 'attack', value: 50, intent: '⚔️' }, // 60 -> 50
            { type: 'defend', value: 50, intent: '🛡️' }, // 60 -> 50
            { type: 'multiAttack', value: 15, count: 4, intent: '🔥' }, // 20 -> 15
            { type: 'attack', value: 60, intent: '⚔️' } // 70 -> 60
        ],
        stealChance: 0.8,
        stealLaw: 'metalBody',
        gold: { min: 500, max: 800 }
    },

    // ==================== 第十三重·大罗天 ====================
    voidWalker: {
        id: 'voidWalker',
        name: '虚空行者',
        icon: '🌌',
        realm: 13,
        hp: 400, // 500 -> 400
        patterns: [
            { type: 'buff', buffType: 'dodge', value: 2, intent: '💨' }, // 3 -> 2
            { type: 'attack', value: 50, intent: '⚔️' }, // 60 -> 50
            { type: 'debuff', buffType: 'paralysis', value: 2, intent: '⚡' }
        ],
        stealChance: 0.4,
        stealLaw: 'voidEmbrace',
        gold: { min: 300, max: 400 }
    },

    daoistSage: {
        id: 'daoistSage',
        name: '太上道祖',
        icon: '☯️',
        realm: 13,
        isBoss: true,
        hp: 950, // 1200 -> 950
        patterns: [
            { type: 'debuff', buffType: 'stun', value: 1, intent: '💫' },
            { type: 'attack', value: 55, intent: '⚔️' }, // 80 -> 65 -> 55
            { type: 'heal', value: 80, intent: '💚' }, // 100 -> 80
            { type: 'multiAttack', value: 20, count: 4, intent: '🔥' }, // 30x5 -> 25x4 -> 20x4
            { type: 'buff', buffType: 'nextTurnBlock', value: 40, intent: '🛡️' } // 50 -> 40
        ],
        stealChance: 0.9,
        stealLaw: 'timeStop',
        gold: { min: 700, max: 1000 }
    },

    // ==================== 第十四重·混元天 ====================
    chaosBeast: {
        id: 'chaosBeast',
        name: '混沌魔神',
        icon: '🐙',
        realm: 14,
        hp: 600, // 800 -> 600
        patterns: [
            { type: 'attack', value: 50, intent: '⚔️' }, // 80 -> 60 -> 50
            { type: 'debuff', buffType: 'burn', value: 6, intent: '🔥' }, // 10 -> 6
            { type: 'debuff', buffType: 'poison', value: 6, intent: '🤢' }, // 10 -> 6
            { type: 'attack', value: 65, intent: '⚔️' } // 100 -> 80 -> 65
        ],
        stealChance: 0.5,
        stealLaw: 'chaosLaw',
        gold: { min: 400, max: 600 }
    },

    chaosLord: {
        id: 'chaosLord',
        name: '混元无极',
        icon: '🌀',
        realm: 14,
        isBoss: true,
        hp: 1100, // 1400 -> 1100
        patterns: [
            { type: 'attack', value: 50, intent: '⚔️' }, // 80 -> 60 -> 50
            { type: 'debuff', buffType: 'vulnerable', value: 6, intent: '💢' },
            { type: 'debuff', buffType: 'weak', value: 6, intent: '✨' },
            { type: 'multiAttack', value: 18, count: 4, intent: '🔥' }, // 30 -> 22 -> 18
            { type: 'heal', value: 120, intent: '💚' }, // 150 -> 120
            { type: 'attack', value: 75, intent: '⚔️' } // 120 -> 90 -> 75
        ],
        stealChance: 1.0,
        stealLaw: 'chaosLaw',
        gold: { min: 800, max: 1200 }
    },

    // ==================== 第十五重·无上天 ====================
    cosmicShadow: {
        id: 'cosmicShadow',
        name: '大道投影',
        icon: '👥',
        realm: 15,
        hp: 900, // 1200 -> 900
        patterns: [
            { type: 'attack', value: 80, intent: '⚔️' }, // 120 -> 90 -> 80
            { type: 'defend', value: 80, intent: '🛡️' }, // 100 -> 80
            { type: 'buff', buffType: 'strength', value: 8, intent: '💪' }, // 10 -> 8
            { type: 'attack', value: 100, intent: '⚔️' } // 150 -> 120 -> 100
        ],
        stealChance: 0.6,
        stealLaw: 'reversal',
        gold: { min: 600, max: 900 }
    },

    theDefier: {
        id: 'theDefier',
        name: '逆天者·心魔',
        icon: '👿',
        realm: 15,
        isBoss: true,
        hp: 1900, // 2500 -> 2000 -> 1900
        patterns: [
            { type: 'attack', value: 80, intent: '⚔️' }, // 120 -> 90 -> 80
            { type: 'debuff', buffType: 'stun', value: 1, intent: '💫' },
            { type: 'multiAttack', value: 25, count: 5, intent: '🔥' }, // 40 -> 30 -> 25
            { type: 'heal', value: 300, intent: '💚' }, // 400 -> 300
            { type: 'buff', buffType: 'strength', value: 8, intent: '💪' }, // 15 -> 10 -> 8
            { type: 'attack', value: 110, intent: '💀' } // 250 -> 180 -> 110 (No more one-shot)
        ],
        stealChance: 1.0,
        stealLaw: 'karmaKill',
        gold: { min: 1500, max: 2500 }
    },

    // ==================== 隐藏 & 特殊敌人 ====================
    controlledCultivator: {
        id: 'controlledCultivator',
        name: '被控修士',
        icon: '🧟',
        realm: 8, // 高阶区域出现
        hp: 180,
        patterns: [
            { type: 'attack', value: 25, intent: '⚔️' },
            { type: 'debuff', buffType: 'weak', value: 2, intent: '✨' },
            { type: 'attack', value: 30, intent: '⚔️' }
        ],
        stealChance: 0.3,
        stealLaw: 'chaosLaw',
        gold: { min: 100, max: 150 }
    },

    thePunisher: {
        id: 'thePunisher',
        name: '天罚者',
        icon: '👁️',
        realm: 9, // 与天道同阶
        isBoss: true,
        hp: 550,
        patterns: [
            { type: 'attack', value: 40, intent: '⚔️' },
            { type: 'debuff', buffType: 'stun', value: 1, intent: '😵' }, // 混沌法则：控制
            { type: 'multiAttack', value: 20, count: 4, intent: '🔥' },
            { type: 'buff', buffType: 'strength', value: 5, intent: '💪' },
            { type: 'attack', value: 50, intent: '⚔️' },
            { type: 'heal', value: 50, intent: '💚' }
        ],
        stealChance: 1.0, // 必掉
        stealLaw: 'chaosLaw',
        gold: { min: 600, max: 900 }
    },

    heavenlyAvatar: {
        id: 'heavenlyAvatar',
        name: '天道化身',
        icon: '🌌',
        realm: 9,
        isBoss: true,
        hp: 600,
        patterns: [
            { type: 'buff', buffType: 'strength', value: 6, intent: '💪' },
            { type: 'attack', value: 45, intent: '⚔️' },
            { type: 'debuff', buffType: 'vulnerable', value: 5, intent: '✨' },
            { type: 'defend', value: 40, intent: '🛡️' },
            { type: 'attack', value: 50, intent: '⚔️' },
            { type: 'multiAttack', value: 18, count: 6, intent: '🔥' },
            { type: 'heal', value: 40, intent: '💚' },
            { type: 'debuff', buffType: 'stun', value: 1, intent: '💫' }
        ],
        stealChance: 0.8,
        stealLaw: 'reversal',
        gold: { min: 800, max: 1200 }
    }
};

// 精英敌人修饰符
const ELITE_MODIFIERS = [
    { name: '狂暴', effect: { type: 'strength', value: 2 }, hpMultiplier: 1.3 },
    { name: '坚韧', effect: { type: 'startBlock', value: 10 }, hpMultiplier: 1.5 },
    { name: '迅捷', effect: { type: 'extraTurn', value: 0.3 }, hpMultiplier: 1.2 }
];

// 根据天域获取敌人
function getEnemiesForRealm(realm) {
    return Object.values(ENEMIES).filter(e => e.realm === realm && !e.isBoss);
}

// 根据天域获取BOSS
function getBossForRealm(realm) {
    return Object.values(ENEMIES).find(e => e.realm === realm && e.isBoss);
}

// 获取随机敌人
function getRandomEnemy(realm) {
    const enemies = getEnemiesForRealm(realm);
    if (enemies.length === 0) return null;
    const enemy = enemies[Math.floor(Math.random() * enemies.length)];
    return JSON.parse(JSON.stringify(enemy)); // 深拷贝
}

// 创建精英敌人
function createEliteEnemy(realm) {
    const enemy = getRandomEnemy(realm);
    if (!enemy) return null;

    const modifier = ELITE_MODIFIERS[Math.floor(Math.random() * ELITE_MODIFIERS.length)];
    enemy.name = `${modifier.name}${enemy.name}`;
    enemy.hp = Math.floor(enemy.hp * modifier.hpMultiplier);
    enemy.isElite = true;
    enemy.modifier = modifier;
    enemy.stealChance = Math.min(enemy.stealChance * 1.5, 0.8);
    enemy.gold.min = Math.floor(enemy.gold.min * 1.5);
    enemy.gold.max = Math.floor(enemy.gold.max * 1.5);

    return enemy;
}
