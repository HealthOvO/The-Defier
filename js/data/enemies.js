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
        element: 'metal',
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
        logo: 'assets/images/enemies/boss_banditLeader.webp',
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

    venomSnake: {
        id: 'venomSnake',
        name: '毒灵蛇',
        icon: '🐍',
        realm: 2,
        hp: 30,
        patterns: [
            { type: 'debuff', buffType: 'poison', value: 3, intent: '☠️' },
            { type: 'attack', value: 6, intent: '⚔️' },
            { type: 'defend', value: 5, intent: '🛡️' }
        ],
        stealChance: 0.2,
        stealLaw: 'woodLaw',
        element: 'wood',
        resistances: { fire: -0.3, wood: 0.5 },
        gold: { min: 18, max: 28 }
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
        element: 'thunder',
        resistances: { fire: -0.2, thunder: 0.5 },
        gold: { min: 20, max: 30 }
    },

    demonWolf: {
        id: 'demonWolf',
        name: '妖狼王',
        icon: '🐾',
        realm: 2,
        isBoss: true,
        logo: 'assets/images/enemies/boss_demonWolf.webp',
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

    crystalGolem: {
        id: 'crystalGolem',
        name: '晶岩傀儡',
        icon: '💎',
        realm: 3,
        hp: 60,
        patterns: [
            { type: 'defend', value: 15, intent: '🛡️' },
            { type: 'attack', value: 8, intent: '⚔️' },
            { type: 'buff', buffType: 'thorns', value: 2, intent: '🌵' }
        ],
        stealChance: 0.1,
        stealLaw: 'earthShield',
        element: 'earth',
        resistances: { wood: -0.3, earth: 0.5 },
        gold: { min: 30, max: 50 }
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
        logo: 'assets/images/enemies/boss_swordElder.webp',
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
        element: 'fire',
        resistances: { water: -0.5, fire: 0.5 },
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
        logo: 'assets/images/enemies/boss_danZun.png',
        hp: 170,
        patterns: [
            { type: 'buff', buffType: 'strength', value: 3, intent: '💪' },
            { type: 'attack', value: 18, intent: '⚔️' },
            { type: 'heal', value: 40, intent: '💚' },
            { type: 'debuff', buffType: 'burn', value: 5, intent: '🔥' },
            { type: 'attack', value: 22, intent: '⚔️' },
            { type: 'multiAttack', value: 8, count: 4, intent: '🔥' }
        ],
        stealChance: 1.0,
        stealLaw: 'reversalLaw',
        element: 'fire',
        resistances: { water: -0.3, fire: 0.3 },
        gold: { min: 800, max: 1200 },
        description: '天道意志的具象化身'
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

    shadowAssassin: {
        id: 'shadowAssassin',
        name: '影杀者',
        icon: '🥷',
        realm: 5,
        hp: 70,
        patterns: [
            { type: 'buff', buffType: 'dodge', value: 1, intent: '💨' },
            { type: 'attack', value: 25, intent: '⚔️' },
            { type: 'debuff', buffType: 'weak', value: 2, intent: '✨' }
        ],
        stealChance: 0.3,
        stealLaw: 'windSpeed',
        gold: { min: 60, max: 90 }
    },

    ancientSpirit: {
        id: 'ancientSpirit',
        name: '上古遗灵',
        icon: '💀',
        realm: 5,
        isBoss: true,
        logo: 'assets/images/enemies/boss_ancientSpirit.png',
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
        logo: 'assets/images/boss_logo_6.png',
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
        logo: 'assets/images/boss_logo_7.png',
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
        stealLaw: 'timeRewindLaw',
        gold: { min: 150, max: 220 }
    },

    mahayanaSupreme: {
        id: 'mahayanaSupreme',
        name: '大乘至尊',
        icon: '🔱',
        logo: 'assets/images/boss_logo_8.png',
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
        stealLaw: 'karmaLaw',
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
        stealLaw: 'karmaLaw',
        gold: { min: 200, max: 320 }
    },

    ascensionSovereign: {
        id: 'ascensionSovereign',
        name: '飞升主宰',
        icon: '👑',
        logo: 'assets/images/boss_logo_9.png',
        realm: 9,
        isBoss: true,
        hp: 600,
        patterns: [
            { type: 'buff', buffType: 'strength', value: 5, intent: '💪' },
            { type: 'attack', value: 45, intent: '⚔️' },
            { type: 'debuff', buffType: 'vulnerable', value: 3, intent: '✨' },
            { type: 'multiAttack', value: 20, count: 4, intent: '🔥' },
            { type: 'heal', value: 50, intent: '💚' },
            { type: 'defend', value: 50, intent: '🛡️' }
        ],
        stealChance: 0.8,
        stealLaw: 'timeRewindLaw',
        gold: { min: 400, max: 600 },
        description: '掌控飞升之力的主宰'
    },

    // ==================== 第十重·地仙界 ====================
    magmaSentinel: {
        id: 'magmaSentinel',
        name: '岩浆哨兵',
        icon: '🗿',
        realm: 10,
        hp: 300,
        patterns: [
            { type: 'defend', value: 40, intent: '🛡️' },
            { type: 'attack', value: 35, intent: '⚔️' },
            { type: 'buff', buffType: 'thorns', value: 3, intent: '🌵' }
        ],
        stealChance: 0.3,
        stealLaw: 'earthShield',
        gold: { min: 220, max: 300 }
    },

    lavaLizard: {
        id: 'lavaLizard',
        name: '熔岩巨蜥',
        icon: '🦎',
        realm: 10,
        hp: 280,
        patterns: [
            { type: 'attack', value: 30, intent: '⚔️' },
            { type: 'debuff', buffType: 'burn', value: 3, intent: '🔥' },
            { type: 'multiAttack', value: 10, count: 3, intent: '🔥' }
        ],
        stealChance: 0.3,
        stealLaw: 'flameTruth',
        gold: { min: 200, max: 280 }
    },

    // ==================== 第十重·地仙界 ====================
    dualMagmaGuardians: {
        id: 'dualMagmaGuardians',
        name: '双子熔岩守卫',
        icon: '🌋',
        logo: 'assets/images/boss_logo_10.png',
        realm: 10,
        isBoss: true,
        hp: 350,
        patterns: [
            { type: 'attack', value: 30, intent: '⚔️' },
            { type: 'buff', buffType: 'thorns', value: 5, intent: '🌵' },
            { type: 'multiAttack', value: 15, count: 2, intent: '🔥' },
            { type: 'defend', value: 30, intent: '🛡️' }
        ],
        stealChance: 0.5,
        stealLaw: 'flameTruth',
        element: 'fire',
        resistances: { water: -0.5, fire: 0.8 },
        gold: { min: 300, max: 400 },
        description: '双生一体，火焰共鸣'
    },

    // 召唤物：风之精灵
    windSpirit: {
        id: 'windSpirit',
        name: '风之精灵',
        icon: '💨',
        realm: 11,
        hp: 50,
        patterns: [
            { type: 'attack', value: 15, intent: '⚔️' },
            { type: 'debuff', buffType: 'vulnerable', value: 1, intent: '✨' }
        ],
        stealChance: 0.1,
        stealLaw: null,
        gold: { min: 10, max: 20 },
        isMinion: true
    },

    // ==================== 第十一重·天仙界 ====================
    galeSpirit: {
        id: 'galeSpirit',
        name: '狂风之灵',
        icon: '🌪️',
        realm: 11,
        hp: 320,
        patterns: [
            { type: 'buff', buffType: 'dodge', value: 1, intent: '💨' },
            { type: 'attack', value: 35, intent: '⚔️' },
            { type: 'multiAttack', value: 12, count: 3, intent: '⚔️' }
        ],
        stealChance: 0.3,
        stealLaw: 'windSpeed',
        gold: { min: 250, max: 350 }
    },

    thunderHawk: {
        id: 'thunderHawk',
        name: '雷鹰',
        icon: '🦅',
        realm: 11,
        hp: 300,
        patterns: [
            { type: 'attack', value: 40, intent: '⚔️' },
            { type: 'debuff', buffType: 'vulnerable', value: 2, intent: '✨' },
            { type: 'attack', value: 45, intent: '⚔️' }
        ],
        stealChance: 0.3,
        stealLaw: 'thunderLaw',
        gold: { min: 250, max: 350 }
    },

    // ==================== 第十一重·天仙界 ====================
    stormSummoner: {
        id: 'stormSummoner',
        name: '风暴唤灵者',
        element: 'wood', // Wind -> Wood
        resistances: { metal: -0.3, wood: 0.5 },
        icon: '🌪️',
        logo: 'assets/images/boss_logo_11.png',
        realm: 11,
        isBoss: true,
        hp: 400,
        patterns: [
            { type: 'summon', value: 'windSpirit', count: 1, intent: '👻' },
            { type: 'attack', value: 35, intent: '⚔️' },
            { type: 'debuff', buffType: 'vulnerable', value: 3, intent: '✨' },
            { type: 'multiAttack', value: 10, count: 4, intent: '💨' }
        ],
        stealChance: 0.5,
        stealLaw: 'windSpeed',
        gold: { min: 350, max: 450 },
        description: '掌控风暴，召唤元灵'
    },

    // ==================== 第十二重·金仙界 ====================
    goldenGuard: {
        id: 'goldenGuard',
        name: '金甲卫士',
        icon: '💂',
        realm: 12,
        hp: 400,
        patterns: [
            { type: 'defend', value: 50, intent: '🛡️' },
            { type: 'attack', value: 30, intent: '⚔️' },
            { type: 'buff', buffType: 'thorns', value: 5, intent: '🌵' }
        ],
        stealChance: 0.3,
        stealLaw: 'metalBody',
        gold: { min: 300, max: 400 }
    },

    swordPuppet: {
        id: 'swordPuppet',
        name: '剑傀儡',
        icon: '🎎',
        realm: 12,
        hp: 350,
        patterns: [
            { type: 'attack', value: 50, intent: '⚔️' },
            { type: 'buff', buffType: 'strength', value: 3, intent: '💪' },
            { type: 'multiAttack', value: 15, count: 3, intent: '⚔️' }
        ],
        stealChance: 0.3,
        stealLaw: 'swordIntent',
        gold: { min: 300, max: 400 }
    },

    // ==================== 第十二重·金仙界 ====================
    triheadGoldDragon: {
        id: 'triheadGoldDragon',
        name: '三首金龙',
        icon: '🐲',
        logo: 'assets/images/boss_logo_12.png',
        realm: 12,
        isBoss: true,
        hp: 600,
        patterns: [
            {
                type: 'multiAction', actions: [
                    { type: 'attack', value: 25 },
                    { type: 'buff', buffType: 'strength', value: 2 },
                    { type: 'debuff', buffType: 'weak', value: 2 }
                ], intent: '⚡'
            },
            { type: 'attack', value: 45, intent: '⚔️' },
            { type: 'defend', value: 50, intent: '🛡️' }
        ],
        stealChance: 0.6,
        stealLaw: 'metalBody',
        element: 'metal',
        resistances: { fire: -0.3, metal: 0.5 },
        gold: { min: 450, max: 550 },
        description: '三首齐动，攻守兼备'
    },

    // ==================== 第十三重·大罗天 ====================
    mirrorReplicant: {
        id: 'mirrorReplicant',
        name: '镜中倒影',
        icon: '👤',
        realm: 13,
        hp: 420,
        patterns: [
            { type: 'attack', value: 40, intent: '⚔️' },
            { type: 'buff', buffType: 'reflect', value: 0.5, intent: '🔮' },
            { type: 'attack', value: 40, intent: '⚔️' }
        ],
        stealChance: 0.3,
        stealLaw: 'reversal',
        gold: { min: 350, max: 450 }
    },

    mindEater: {
        id: 'mindEater',
        name: '噬心魔',
        icon: '🧠',
        realm: 13,
        hp: 400,
        patterns: [
            { type: 'debuff', buffType: 'weak', value: 3, intent: '✨' },
            { type: 'attack', value: 45, intent: '⚔️' },
            { type: 'debuff', buffType: 'vulnerable', value: 3, intent: '✨' }
        ],
        stealChance: 0.3,
        stealLaw: 'chaosLaw',
        gold: { min: 350, max: 450 }
    },

    // ==================== 第十三重·大罗天 ====================
    mirrorDemon: {
        id: 'mirrorDemon',
        name: '心魔镜像',
        icon: '🪞',
        logo: 'assets/images/boss_logo_13.png',
        realm: 13,
        isBoss: true,
        hp: 500,
        patterns: [
            { type: 'attack', value: 40, intent: '⚔️' },
            { type: 'buff', buffType: 'reflect', value: 1, intent: '🔮' }, // Reflects next damage
            { type: 'debuff', buffType: 'stun', value: 1, intent: '💫' },
            { type: 'multiAttack', value: 20, count: 3, intent: '🔥' }
        ],
        stealChance: 0.6,
        stealLaw: 'chaosLaw', // Changed from chaosControl to match existing law types or chaosLaw if generalized
        gold: { min: 500, max: 650 },
        description: '映照人心，反弹伤害'
    },

    // ==================== 第十四重·混元天 ====================
    chaosBeast: {
        id: 'chaosBeast',
        name: '混沌巨兽',
        icon: '🐘',
        realm: 14,
        hp: 500,
        patterns: [
            { type: 'attack', value: 50, intent: '⚔️' },
            { type: 'debuff', buffType: 'random', value: 2, intent: '🎲' },
            { type: 'attack', value: 60, intent: '⚔️' }
        ],
        stealChance: 0.3,
        stealLaw: 'chaosLaw',
        gold: { min: 400, max: 550 }
    },

    entropyWorm: {
        id: 'entropyWorm',
        name: '熵增蠕虫',
        icon: '🐛',
        realm: 14,
        hp: 450,
        patterns: [
            { type: 'attack', value: 40, intent: '⚔️' },
            { type: 'debuff', buffType: 'vulnerable', value: 5, intent: '✨' },
            { type: 'multiAttack', value: 10, count: 5, intent: '🔥' }
        ],
        stealChance: 0.3,
        stealLaw: 'timeStop',
        gold: { min: 400, max: 550 }
    },

    // ==================== 第十四重·混元天 ====================
    chaosEye: {
        id: 'chaosEye',
        name: '混沌之眼',
        icon: '👁️',
        logo: 'assets/images/boss_logo_14.png',
        realm: 14,
        isBoss: true,
        hp: 750,
        patterns: [
            { type: 'debuff', buffType: 'random', value: 3, intent: '🎲' }, // Random debuffs
            { type: 'attack', value: 50, intent: '⚔️' },
            { type: 'debuff', buffType: 'confuse', value: 1, intent: '😵' }, // Confuse: randomize card cost?
            { type: 'multiAttack', value: 15, count: 5, intent: '🌀' }
        ],
        stealChance: 0.7,
        stealLaw: 'chaosLaw',
        gold: { min: 600, max: 800 },
        description: '混沌无序，扰乱神智'
    },

    // ==================== 第十五重·无上天 ====================
    voidStalker: {
        id: 'voidStalker',
        name: '虚空潜行者',
        icon: '🕶️',
        realm: 15,
        hp: 550,
        patterns: [
            { type: 'buff', buffType: 'dodge', value: 2, intent: '💨' },
            { type: 'attack', value: 60, intent: '⚔️' },
            { type: 'attack', value: 80, intent: '⚔️' }
        ],
        stealChance: 0.3,
        stealLaw: 'voidEmbrace',
        gold: { min: 450, max: 600 }
    },

    abyssHulk: {
        id: 'abyssHulk',
        name: '深渊巨尸',
        icon: '🧟',
        realm: 15,
        hp: 700,
        patterns: [
            { type: 'attack', value: 50, intent: '⚔️' },
            { type: 'heal', value: 30, intent: '💚' },
            { type: 'attack', value: 60, intent: '⚔️' },
            { type: 'defend', value: 40, intent: '🛡️' }
        ],
        stealChance: 0.3,
        stealLaw: 'lifeDrain',
        gold: { min: 450, max: 600 }
    },

    // ==================== 第十五重·无上天 ====================
    voidDevourer: {
        id: 'voidDevourer',
        name: '虚空吞噬者',
        icon: '🕳️',
        logo: 'assets/images/boss_logo_15.png',
        realm: 15,
        isBoss: true,
        hp: 900,
        patterns: [
            { type: 'attack', value: 60, intent: '⚔️' },
            { type: 'attack', value: 40, effect: 'devour', intent: '🍽️' }, // Devour: Exiles top card of deck
            { type: 'heal', value: 50, intent: '💚' },
            { type: 'buff', buffType: 'strength', value: 5, intent: '💪' }
        ],
        stealChance: 0.7,
        stealLaw: 'voidEmbrace',
        gold: { min: 700, max: 900 },
        description: '吞噬万物，甚至你的记忆(卡牌)'
    },

    // ==================== 第十六重·五行天 ====================
    elementalConstruct: {
        id: 'elementalConstruct',
        name: '五行构造体',
        icon: '🤖',
        realm: 16,
        hp: 650,
        patterns: [
            { type: 'attack', value: 50, element: 'fire', intent: '🔥' },
            { type: 'attack', value: 50, element: 'ice', intent: '❄️' },
            { type: 'defend', value: 50, element: 'earth', intent: '🛡️' }
        ],
        stealChance: 0.3,
        stealLaw: 'metalBody',
        gold: { min: 500, max: 700 }
    },

    fiveColorPeacock: {
        id: 'fiveColorPeacock',
        name: '五色孔雀',
        icon: '🦚',
        realm: 16,
        hp: 600,
        patterns: [
            { type: 'multiAttack', value: 15, count: 5, intent: '🔥' },
            { type: 'debuff', buffType: 'random', value: 2, intent: '🎲' },
            { type: 'attack', value: 60, intent: '⚔️' }
        ],
        stealChance: 0.3,
        stealLaw: 'flameTruth',
        gold: { min: 500, max: 700 }
    },

    // ==================== 第十六重·五行天 ====================
    elementalElder: {
        id: 'elementalElder',
        name: '五行长老',
        icon: '🧙‍♂️',
        logo: 'assets/images/boss_logo_16.png',
        realm: 16,
        isBoss: true,
        hp: 1000,
        patterns: [
            { type: 'attack', value: 50, element: 'fire', intent: '🔥' },
            { type: 'attack', value: 50, element: 'ice', intent: '❄️' },
            { type: 'attack', value: 50, element: 'thunder', intent: '⚡' },
            { type: 'defend', value: 60, element: 'earth', intent: '🛡️' },
            { type: 'heal', value: 60, element: 'wood', intent: '🌿' }
        ],
        stealChance: 0.8,
        stealLaw: 'flameTruth', // Or random elemental
        gold: { min: 800, max: 1000 },
        description: '五行轮转，生生不息'
    },

    // ==================== 第十七重·因果天 ====================
    karmaSpirit: {
        id: 'karmaSpirit',
        name: '业力之灵',
        icon: '👻',
        realm: 17,
        hp: 750,
        patterns: [
            { type: 'buff', buffType: 'thorns', value: 10, intent: '🌵' },
            { type: 'attack', value: 60, intent: '⚔️' },
            { type: 'attack', value: 70, intent: '⚔️' }
        ],
        stealChance: 0.3,
        stealLaw: 'karmaLaw',
        gold: { min: 600, max: 800 }
    },

    causeEffectMonk: {
        id: 'causeEffectMonk',
        name: '苦行僧',
        icon: '🙏',
        realm: 17,
        hp: 800,
        patterns: [
            { type: 'defend', value: 60, intent: '🛡️' },
            { type: 'heal', value: 40, intent: '💚' },
            { type: 'attack', value: 50, intent: '⚔️' }
        ],
        stealChance: 0.3,
        stealLaw: 'reversalLaw',
        gold: { min: 600, max: 800 }
    },

    // ==================== 第十七重·因果天 ====================
    karmaArbiter: {
        id: 'karmaArbiter',
        name: '因果裁决者',
        icon: '⚖️',
        logo: 'assets/images/boss_logo_17.png',
        realm: 17,
        isBoss: true,
        hp: 1200,
        patterns: [
            { type: 'attack', value: 60, intent: '⚔️' },
            { type: 'buff', buffType: 'thorns', value: 20, intent: '🌵' }, // High thorns = karma
            { type: 'attack', value: 80, intent: '⚖️' },
            { type: 'debuff', buffType: 'weak', value: 5, intent: '✨' }
        ],
        stealChance: 0.9,
        stealLaw: 'karmaLaw',
        gold: { min: 900, max: 1200 },
        description: '因果循环，报应不爽'
    },

    // ==================== 第十八重·终焉天 ====================
    doomShadow: {
        id: 'doomShadow',
        name: '末日之影',
        icon: '🌑',
        realm: 18,
        hp: 900,
        patterns: [
            { type: 'attack', value: 80, intent: '⚔️' },
            { type: 'debuff', buffType: 'vulnerable', value: 5, intent: '✨' },
            { type: 'attack', value: 100, intent: '💀' }
        ],
        stealChance: 0.3,
        stealLaw: 'voidEmbrace',
        gold: { min: 700, max: 900 }
    },

    entropyKing: {
        id: 'entropyKing',
        name: '熵之君王',
        icon: '👑',
        realm: 18,
        hp: 1000,
        patterns: [
            { type: 'multiAttack', value: 20, count: 5, intent: '🔥' },
            { type: 'debuff', buffType: 'weak', value: 5, intent: '✨' },
            { type: 'attack', value: 90, intent: '⚔️' }
        ],
        stealChance: 0.3,
        stealLaw: 'chaosLaw',
        gold: { min: 700, max: 900 }
    },

    // ==================== 第十八重·终焉天 ====================
    heavenlyDao: {
        id: 'heavenlyDao',
        name: '天道终焉',
        icon: '☀️',
        logo: 'assets/images/boss_logo_18.png',
        realm: 18,
        isBoss: true,
        hp: 2000,
        patterns: [
            { type: 'buff', buffType: 'shield', value: 999, intent: '🛡️' }, // Massive shield or immune
            { type: 'attack', value: 100, intent: '⚔️' },
            { type: 'multiAttack', value: 30, count: 5, intent: '🔥' },
            { type: 'debuff', buffType: 'stun', value: 1, intent: '💫' },
            { type: 'attack', value: 999, intent: '💀' } // Enrage?
        ],
        stealChance: 1.0,
        stealLaw: 'reversalLaw',
        gold: { min: 1000, max: 2000 },
        description: '一切的终结与开始'
    },
    // ==================== 特殊BOSS ====================
    tribulationCloud5: {
        id: 'tribulationCloud5',
        name: '五行劫云',
        icon: '☁️',
        realm: 5,
        isBoss: true,
        hp: 250,
        patterns: [
            { type: 'attack', value: 20, intent: '⚡' },
            { type: 'debuff', buffType: 'vulnerable', value: 2, intent: '✨' },
            { type: 'addStatus', cardId: 'heartDemon', count: 1, intent: '👿' }, // 新增心魔
            { type: 'multiAttack', value: 8, count: 3, intent: '⛈️' }
        ],
        stealChance: 0.5,
        stealLaw: 'thunderLaw',
        gold: { min: 300, max: 400 }
    },
    tribulationCloud10: {
        id: 'tribulationCloud10',
        name: '十方劫云',
        icon: '🌩️',
        realm: 10,
        isBoss: true,
        hp: 400,
        patterns: [
            { type: 'attack', value: 35, intent: '⚡' },
            { type: 'addStatus', cardId: 'heartDemon', count: 2, intent: '👿' }, // 更多心魔
            { type: 'debuff', buffType: 'paralysis', value: 2, intent: '⚡' },
            { type: 'multiAttack', value: 15, count: 4, intent: '⛈️' }
        ],
        stealChance: 0.6,
        stealLaw: 'thunderLaw',
        gold: { min: 500, max: 700 }
    },
    tribulationCloud15: {
        id: 'tribulationCloud15',
        name: '灭世劫云',
        icon: '🌨️',
        realm: 15,
        isBoss: true,
        hp: 800,
        patterns: [
            { type: 'attack', value: 50, intent: '⚡' },
            { type: 'debuff', buffType: 'vulnerable', value: 5, intent: '✨' },
            { type: 'addStatus', cardId: 'heartDemon', count: 3, intent: '👿' }, // 大量心魔
            { type: 'multiAttack', value: 20, count: 5, intent: '⛈️' },
            { type: 'debuff', buffType: 'stun', value: 1, intent: '💫' }
        ],
        stealChance: 0.8,
        stealLaw: 'thunderLaw',
        gold: { min: 800, max: 1000 }
    }
};

// 精英敌人修饰符
const ELITE_MODIFIERS = [
    { name: '狂暴', effect: { type: 'strength', value: 2 }, hpMultiplier: 1.3 },
    { name: '坚韧', effect: { type: 'startBlock', value: 15 }, hpMultiplier: 1.5 },
    { name: '迅捷', effect: { type: 'dodge', value: 0.25 }, hpMultiplier: 1.2 } // Changed to dodge chance
];

// 根据天域获取敌人
function getEnemiesForRealm(realm) {
    return Object.values(ENEMIES).filter(e => e.realm === realm && !e.isBoss && !e.isMinion);
}

// 根据天域获取BOSS
function getBossForRealm(realm) {
    return Object.values(ENEMIES).find(e => e.realm === realm && e.isBoss);
}

// 获取随机敌人
function getRandomEnemy(realm) {
    const enemies = getEnemiesForRealm(realm);

    // 防御性检查
    if (enemies.length === 0) {
        console.warn(`⚠️ No enemies found for realm ${realm}!`);
        console.log('Available enemies for this realm:', getEnemiesForRealm(realm));
        console.log('All realm', realm, 'entities:', Object.values(ENEMIES).filter(e => e.realm === realm));

        // 兜底方案：使用前一个realm的怪物
        if (realm > 1) {
            console.log(`Fallback: Using enemies from realm ${realm - 1}`);
            return getRandomEnemy(realm - 1);
        }

        return null;
    }

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
