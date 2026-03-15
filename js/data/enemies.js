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
    graveRaven: {
        id: 'graveRaven',
        name: '墓羽鸦',
        icon: '🐦‍⬛',
        realm: 1,
        hp: 28,
        patterns: [
            { type: 'debuff', buffType: 'weak', value: 1, intent: '🪶噪鸣' },
            { type: 'attack', value: 7, intent: '⚔️啄击' },
            { type: 'multiAttack', value: 4, count: 2, intent: '🪶连啄' }
        ],
        stealChance: 0.08,
        stealLaw: null,
        gold: { min: 9, max: 16 }
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
    emberPhysician: {
        id: 'emberPhysician',
        name: '焰脉医修',
        icon: '🧪',
        realm: 4,
        hp: 58,
        patterns: [
            {
                type: 'multiAction',
                intent: '🔥焰脉诊断',
                actions: [
                    { type: 'debuff', buffType: 'burn', value: 2, intent: '🔥灼印' },
                    { type: 'attack', value: 9, intent: '⚔️灼切' }
                ]
            },
            { type: 'heal', value: 12, intent: '💚回元' },
            { type: 'attack', value: 16, intent: '⚔️' },
            { type: 'defend', value: 10, intent: '🛡️' }
        ],
        stealChance: 0.22,
        stealLaw: 'flameTruth',
        gold: { min: 38, max: 58 }
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
    soulLanternMonk: {
        id: 'soulLanternMonk',
        name: '引魂灯僧',
        icon: '🏮',
        realm: 5,
        hp: 76,
        patterns: [
            { type: 'addStatus', cardId: 'heartDemon', count: 1, intent: '🕳️引魂' },
            { type: 'debuff', buffType: 'vulnerable', value: 2, intent: '✨摄念' },
            { type: 'attack', value: 19, intent: '⚔️灯焰击' },
            { type: 'heal', value: 8, intent: '💚回灯' }
        ],
        stealChance: 0.32,
        stealLaw: 'timeStop',
        gold: { min: 58, max: 92 }
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
    runeSentinel: {
        id: 'runeSentinel',
        name: '符阵守卫',
        icon: '🧿',
        realm: 6,
        hp: 96,
        patterns: [
            { type: 'defend', value: 20, intent: '🛡️' },
            { type: 'debuff', buffType: 'weak', value: 2, intent: '🌀' },
            { type: 'attack', value: 24, intent: '⚔️' },
            { type: 'multiAttack', value: 10, count: 2, intent: '✴️连刺' }
        ],
        stealChance: 0.34,
        stealLaw: 'spaceRift',
        gold: { min: 72, max: 108 }
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
    starChainWarden: {
        id: 'starChainWarden',
        name: '锁星卫',
        icon: '⛓️',
        realm: 7,
        hp: 142,
        patterns: [
            { type: 'defend', value: 22, intent: '🛡️锁界' },
            { type: 'addStatus', cardId: 'heartDemon', count: 1, intent: '🕳️缚念' },
            { type: 'multiAttack', value: 11, count: 3, intent: '⚔️星链连击' },
            { type: 'attack', value: 26, intent: '💥星坠' }
        ],
        stealChance: 0.37,
        stealLaw: 'spaceRift',
        gold: { min: 102, max: 162 }
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
    frostArrowHerald: {
        id: 'frostArrowHerald',
        name: '霜翎信使',
        icon: '🏹',
        realm: 8,
        hp: 188,
        patterns: [
            { type: 'attack', value: 26, intent: '❄️霜箭' },
            { type: 'multiAttack', value: 9, count: 3, intent: '🏹连射' },
            { type: 'debuff', buffType: 'vulnerable', value: 3, intent: '🎯破绽' },
            { type: 'defend', value: 22, intent: '🛡️' }
        ],
        stealChance: 0.46,
        stealLaw: 'windSpeed',
        gold: { min: 142, max: 215 }
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
    verdictPriest: {
        id: 'verdictPriest',
        name: '裁令祭司',
        icon: '📘',
        realm: 9,
        hp: 266,
        patterns: [
            { type: 'debuff', buffType: 'weak', value: 2, intent: '📜裁令' },
            {
                type: 'multiAction',
                intent: '⚖️裁决链',
                actions: [
                    { type: 'attack', value: 24, intent: '⚔️判斩' },
                    { type: 'defend', value: 18, intent: '🛡️护典' }
                ]
            },
            { type: 'multiAttack', value: 11, count: 3, intent: '🔥律火连击' }
        ],
        stealChance: 0.47,
        stealLaw: 'karmaLaw',
        gold: { min: 192, max: 314 }
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
    basaltArcanist: {
        id: 'basaltArcanist',
        name: '玄武岩术士',
        icon: '🪨',
        realm: 10,
        hp: 292,
        patterns: [
            { type: 'defend', value: 36, intent: '🛡️岩护' },
            { type: 'buff', buffType: 'thorns', value: 2, intent: '🌵岩刺' },
            {
                type: 'multiAction',
                intent: '🌋岩火共振',
                actions: [
                    { type: 'debuff', buffType: 'burn', value: 2, intent: '🔥焚蚀' },
                    { type: 'attack', value: 28, intent: '⚔️砾爆' }
                ]
            },
            { type: 'attack', value: 34, intent: '⚔️' }
        ],
        stealChance: 0.31,
        stealLaw: 'earthShield',
        gold: { min: 210, max: 292 }
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
    stormScribe: {
        id: 'stormScribe',
        name: '风暴抄录者',
        icon: '📚',
        realm: 11,
        hp: 312,
        patterns: [
            { type: 'summon', value: 'windSpirit', count: 1, intent: '👻引灵' },
            { type: 'debuff', buffType: 'vulnerable', value: 2, intent: '✨裂风注' },
            { type: 'attack', value: 39, intent: '⚔️风压斩' },
            { type: 'defend', value: 28, intent: '🛡️风幕' }
        ],
        stealChance: 0.31,
        stealLaw: 'windSpeed',
        gold: { min: 248, max: 346 }
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
    abyssCantor: {
        id: 'abyssCantor',
        name: '渊咏祭司',
        icon: '🕯️',
        realm: 12,
        hp: 372,
        patterns: [
            { type: 'debuff', buffType: 'weak', value: 3, intent: '📿咏诵' },
            { type: 'heal', value: 24, intent: '💚修复' },
            { type: 'attack', value: 42, intent: '⚔️' },
            { type: 'addStatus', cardId: 'heartDemon', count: 1, intent: '🕳️侵染' }
        ],
        stealChance: 0.33,
        stealLaw: 'voidEmbrace',
        gold: { min: 308, max: 418 }
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
    oracleSilencer: {
        id: 'oracleSilencer',
        name: '缄言卜者',
        icon: '📴',
        realm: 13,
        hp: 408,
        patterns: [
            { type: 'debuff', buffType: 'random', value: 2, intent: '🎲噪讯' },
            { type: 'addStatus', cardId: 'heartDemon', count: 1, intent: '🕳️噤声印' },
            { type: 'attack', value: 44, intent: '⚔️默裁' },
            { type: 'defend', value: 28, intent: '🛡️静域' }
        ],
        stealChance: 0.31,
        stealLaw: 'chaosLaw',
        gold: { min: 352, max: 458 }
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
    warDrummer: {
        id: 'warDrummer',
        name: '裂阵战鼓手',
        icon: '🥁',
        realm: 14,
        hp: 462,
        patterns: [
            { type: 'buff', buffType: 'strength', value: 3, intent: '🥁鼓舞' },
            { type: 'multiAttack', value: 12, count: 3, intent: '⚔️疾击' },
            { type: 'debuff', buffType: 'vulnerable', value: 2, intent: '🎯破防' },
            { type: 'attack', value: 52, intent: '💥重锤' }
        ],
        stealChance: 0.31,
        stealLaw: 'swordIntent',
        gold: { min: 410, max: 560 }
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
    voidTaxCollector: {
        id: 'voidTaxCollector',
        name: '虚空征税使',
        icon: '🧾',
        realm: 15,
        hp: 620,
        patterns: [
            {
                type: 'multiAction',
                intent: '🌀征收判令',
                actions: [
                    { type: 'debuff', buffType: 'weak', value: 2, intent: '🌀税压' },
                    { type: 'attack', value: 36, intent: '⚔️催缴' }
                ]
            },
            { type: 'attack', value: 58, effect: 'devour', intent: '🍽️吞缴' },
            { type: 'heal', value: 24, intent: '💚回收' },
            { type: 'multiAttack', value: 15, count: 3, intent: '⚔️清算连斩' }
        ],
        stealChance: 0.34,
        stealLaw: 'voidEmbrace',
        gold: { min: 462, max: 622 }
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
    prismLocust: {
        id: 'prismLocust',
        name: '棱镜蚀蝗',
        icon: '🦗',
        realm: 16,
        hp: 632,
        patterns: [
            { type: 'multiAttack', value: 14, count: 4, intent: '⚔️棱芒群袭' },
            { type: 'debuff', buffType: 'random', value: 2, intent: '🎲棱蚀' },
            { type: 'attack', value: 58, intent: '💥折光重击' },
            { type: 'defend', value: 34, intent: '🛡️折反甲壳' }
        ],
        stealChance: 0.32,
        stealLaw: 'chaosLaw',
        gold: { min: 512, max: 712 }
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
    ashenArchivist: {
        id: 'ashenArchivist',
        name: '灰烬档案官',
        icon: '📚',
        realm: 17,
        hp: 770,
        patterns: [
            { type: 'debuff', buffType: 'vulnerable', value: 3, intent: '📎裁定注记' },
            { type: 'heal', value: 35, intent: '💚修典' },
            { type: 'multiAttack', value: 16, count: 3, intent: '⚔️卷页切割' },
            { type: 'attack', value: 64, intent: '💥裁断' }
        ],
        stealChance: 0.33,
        stealLaw: 'karmaLaw',
        gold: { min: 620, max: 820 }
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
    doomsdayHerald: {
        id: 'doomsdayHerald',
        name: '终焉司兆',
        icon: '🕯️',
        realm: 18,
        hp: 920,
        patterns: [
            { type: 'addStatus', cardId: 'heartDemon', count: 1, intent: '🕳️终兆侵染' },
            { type: 'debuff', buffType: 'vulnerable', value: 4, intent: '✨衰灭宣告' },
            { type: 'multiAttack', value: 18, count: 3, intent: '⚔️终祷连斩' },
            { type: 'attack', value: 96, intent: '💀末兆裁决' }
        ],
        stealChance: 0.34,
        stealLaw: 'voidEmbrace',
        gold: { min: 710, max: 910 }
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

const V6_ENEMY_PACK = {
    oathHound: {
        id: 'oathHound',
        name: '誓痕猎犬',
        icon: '🐕',
        realm: 1,
        hp: 32,
        patterns: [
            { type: 'attack', value: 8, intent: '⚔️誓痕扑袭' },
            { type: 'debuff', buffType: 'mark', value: 2, intent: '🎯裂誓追痕' },
            { type: 'multiAttack', value: 4, count: 2, intent: '⚔️噬誓连咬' }
        ],
        aiProfile: 'aggressive',
        ecologyLabel: '裂誓猎群',
        ecologyGroup: 'fractured_hunt',
        elitePartnerIds: ['graveRaven', 'bandit'],
        gold: { min: 11, max: 18 }
    },
    oathbreakerScout: {
        id: 'oathbreakerScout',
        name: '裂誓斥候',
        icon: '🏹',
        realm: 2,
        hp: 36,
        patterns: [
            { type: 'debuff', buffType: 'weak', value: 1, intent: '🪶扰誓沙' },
            { type: 'attack', value: 9, intent: '⚔️裂羽暗矢' },
            {
                type: 'multiAction',
                intent: '🜂试锋校准',
                actions: [
                    { type: 'defend', value: 7, intent: '🛡️避矢' },
                    { type: 'attack', value: 6, intent: '⚔️补射' }
                ]
            }
        ],
        aiProfile: 'control',
        ecologyLabel: '誓裂游击',
        ecologyGroup: 'fractured_hunt',
        elitePartnerIds: ['thunderBeast', 'venomSnake'],
        gold: { min: 18, max: 27 }
    },
    executionBanner: {
        id: 'executionBanner',
        name: '问罪旗使',
        icon: '🚩',
        realm: 3,
        hp: 52,
        patterns: [
            { type: 'buff', buffType: 'strength', value: 2, intent: '🚩悬旗督战' },
            { type: 'attack', value: 13, intent: '⚔️执旗斩' },
            { type: 'debuff', buffType: 'vulnerable', value: 1, intent: '✨问罪宣判' }
        ],
        aiProfile: 'balanced',
        ecologyLabel: '试罪刑阵',
        ecologyGroup: 'fractured_hunt',
        elitePartnerIds: ['swordDisciple', 'talismanMaster'],
        stealLaw: 'swordIntent',
        gold: { min: 30, max: 46 }
    },
    slagChanneler: {
        id: 'slagChanneler',
        name: '熔渣导术师',
        icon: '🫗',
        realm: 4,
        hp: 60,
        patterns: [
            { type: 'debuff', buffType: 'burn', value: 2, intent: '🔥灼渣泼洒' },
            { type: 'attack', value: 14, intent: '⚔️熔流切割' },
            { type: 'defend', value: 10, intent: '🛡️炉灰护幕' }
        ],
        aiProfile: 'control',
        ecologyLabel: '熔渣工潮',
        ecologyGroup: 'forge_tide',
        elitePartnerIds: ['emberPhysician', 'alchemyGolem'],
        stealLaw: 'flameTruth',
        element: 'fire',
        gold: { min: 40, max: 58 }
    },
    emberHomunculus: {
        id: 'emberHomunculus',
        name: '火傀药童',
        icon: '🧫',
        realm: 5,
        hp: 74,
        patterns: [
            {
                type: 'multiAction',
                intent: '🧪回炉配方',
                actions: [
                    { type: 'heal', value: 10, intent: '💚回火缝合' },
                    { type: 'debuff', buffType: 'burn', value: 2, intent: '🔥残焰附着' }
                ]
            },
            { type: 'attack', value: 17, intent: '⚔️药焰突刺' },
            { type: 'defend', value: 12, intent: '🛡️丹壁回缩' }
        ],
        aiProfile: 'sustain',
        ecologyLabel: '回炉药潮',
        ecologyGroup: 'forge_tide',
        elitePartnerIds: ['ancientGhost', 'spiritBlade'],
        gold: { min: 55, max: 76 }
    },
    furnaceTribune: {
        id: 'furnaceTribune',
        name: '炉海监军',
        icon: '⚒️',
        realm: 6,
        hp: 92,
        patterns: [
            { type: 'defend', value: 16, intent: '🛡️火脉督阵' },
            { type: 'attack', value: 20, intent: '⚔️淬锋裁断' },
            { type: 'buff', buffType: 'strength', value: 2, intent: '💪熔潮鼓舞' }
        ],
        aiProfile: 'sustain',
        ecologyLabel: '炉监钳阵',
        ecologyGroup: 'forge_tide',
        elitePartnerIds: ['divineGuard', 'voidMonk'],
        stealLaw: 'earthShield',
        gold: { min: 70, max: 95 }
    },
    starScribe: {
        id: 'starScribe',
        name: '沉星书记',
        icon: '📘',
        realm: 7,
        hp: 96,
        patterns: [
            { type: 'debuff', buffType: 'weak', value: 2, intent: '🌠迟滞批注' },
            { type: 'attack', value: 21, intent: '⚔️陨墨斩' },
            { type: 'heal', value: 12, intent: '💚星页回溯' }
        ],
        aiProfile: 'control',
        ecologyLabel: '沉星文阵',
        ecologyGroup: 'star_archive',
        elitePartnerIds: ['icePhoenix', 'timeKeeper'],
        stealLaw: 'spaceRift',
        gold: { min: 78, max: 106 }
    },
    orbitSentinel: {
        id: 'orbitSentinel',
        name: '环轨守御',
        icon: '🛰️',
        realm: 8,
        hp: 116,
        patterns: [
            { type: 'defend', value: 18, intent: '🛡️环轨偏移' },
            { type: 'attack', value: 22, intent: '⚔️轨刺投落' },
            {
                type: 'multiAction',
                intent: '🌌星链联锁',
                actions: [
                    { type: 'buff', buffType: 'strength', value: 1, intent: '💪联锁增幅' },
                    { type: 'attack', value: 8, intent: '⚔️补击' }
                ]
            }
        ],
        aiProfile: 'balanced',
        ecologyLabel: '环轨锁阵',
        ecologyGroup: 'star_archive',
        elitePartnerIds: ['mahayanaDisciple', 'timeKeeper'],
        gold: { min: 95, max: 124 }
    },
    chronologyMoth: {
        id: 'chronologyMoth',
        name: '时序蛾灵',
        icon: '🦋',
        realm: 9,
        hp: 130,
        patterns: [
            { type: 'debuff', buffType: 'vulnerable', value: 2, intent: '✨回响蚀刻' },
            { type: 'multiAttack', value: 10, count: 3, intent: '⚔️时针扑翼' },
            { type: 'defend', value: 14, intent: '🛡️时砂护翅' }
        ],
        aiProfile: 'control',
        ecologyLabel: '时序织翼',
        ecologyGroup: 'star_archive',
        elitePartnerIds: ['ascensionHerald', 'goldenDragonkin'],
        element: 'wind',
        gold: { min: 108, max: 138 }
    },
    mirrorServitor: {
        id: 'mirrorServitor',
        name: '照骨镜役',
        icon: '🪞',
        realm: 10,
        hp: 138,
        patterns: [
            { type: 'debuff', buffType: 'weak', value: 2, intent: '🪞折影映身' },
            { type: 'attack', value: 26, intent: '⚔️镜刃反折' },
            { type: 'defend', value: 16, intent: '🛡️照骨镜壳' }
        ],
        aiProfile: 'control',
        ecologyLabel: '照影反军',
        ecologyGroup: 'mirror_curse',
        elitePartnerIds: ['mirrorWarden', 'cursePriest'],
        gold: { min: 122, max: 156 }
    },
    curseLacquerer: {
        id: 'curseLacquerer',
        name: '黯漆咒匠',
        icon: '🖌️',
        realm: 11,
        hp: 150,
        patterns: [
            { type: 'addStatus', cardId: 'heartDemon', count: 1, intent: '🕳️黯漆附契' },
            { type: 'attack', value: 27, intent: '⚔️诅墨横切' },
            { type: 'debuff', buffType: 'vulnerable', value: 2, intent: '✨镜咒放大' }
        ],
        aiProfile: 'control',
        ecologyLabel: '镜咒工坊',
        ecologyGroup: 'mirror_curse',
        elitePartnerIds: ['stormSummoner', 'mirrorDemon'],
        gold: { min: 132, max: 168 }
    },
    reflectedPenitent: {
        id: 'reflectedPenitent',
        name: '折光罪徒',
        icon: '🕯️',
        realm: 12,
        hp: 164,
        patterns: [
            { type: 'defend', value: 18, intent: '🛡️折光赎壁' },
            {
                type: 'multiAction',
                intent: '🪞罪映双身',
                actions: [
                    { type: 'attack', value: 16, intent: '⚔️镜返' },
                    { type: 'debuff', buffType: 'weak', value: 1, intent: '🌀失真' }
                ]
            },
            { type: 'heal', value: 14, intent: '💚赎烬重缝' }
        ],
        aiProfile: 'sustain',
        ecologyLabel: '赎镜压场',
        ecologyGroup: 'mirror_curse',
        elitePartnerIds: ['triheadAcolyte', 'mirrorDemon'],
        gold: { min: 145, max: 182 }
    },
    bloodDebtKeeper: {
        id: 'bloodDebtKeeper',
        name: '血契典吏',
        icon: '📕',
        realm: 13,
        hp: 176,
        patterns: [
            { type: 'debuff', buffType: 'bleed', value: 3, intent: '🩸血账追偿' },
            { type: 'attack', value: 31, intent: '⚔️契书裁切' },
            { type: 'buff', buffType: 'strength', value: 2, intent: '💪债印催逼' }
        ],
        aiProfile: 'aggressive',
        ecologyLabel: '血账收庭',
        ecologyGroup: 'bloodmoon_hunt',
        elitePartnerIds: ['bloodbat', 'mirrorDemon'],
        gold: { min: 158, max: 196 }
    },
    moonHowler: {
        id: 'moonHowler',
        name: '噬月嚎兽',
        icon: '🌕',
        realm: 14,
        hp: 188,
        patterns: [
            { type: 'multiAttack', value: 14, count: 3, intent: '⚔️血月连扑' },
            { type: 'debuff', buffType: 'mark', value: 3, intent: '🎯猎月锁喉' },
            { type: 'attack', value: 36, intent: '⚔️月陨扑杀' }
        ],
        aiProfile: 'aggressive',
        ecologyLabel: '逐月猎潮',
        ecologyGroup: 'bloodmoon_hunt',
        elitePartnerIds: ['chaosEye', 'voidDevourer'],
        gold: { min: 170, max: 210 }
    },
    sacramentButcher: {
        id: 'sacramentButcher',
        name: '祭锋屠者',
        icon: '🪓',
        realm: 15,
        hp: 205,
        patterns: [
            {
                type: 'multiAction',
                intent: '🩸献祭剜取',
                actions: [
                    { type: 'attack', value: 24, intent: '⚔️剜取' },
                    { type: 'heal', value: 14, intent: '💚啖血回生' }
                ]
            },
            { type: 'debuff', buffType: 'vulnerable', value: 2, intent: '✨祭锋开膛' },
            { type: 'attack', value: 40, intent: '⚔️血断斩' }
        ],
        aiProfile: 'balanced',
        ecologyLabel: '献锋收割',
        ecologyGroup: 'bloodmoon_hunt',
        elitePartnerIds: ['voidDevourer', 'karmaSpirit'],
        gold: { min: 182, max: 226 }
    },
    lawWeaver: {
        id: 'lawWeaver',
        name: '法织执简',
        icon: '📜',
        realm: 16,
        hp: 220,
        patterns: [
            { type: 'debuff', buffType: 'weak', value: 2, intent: '📜法禁停笔' },
            { type: 'defend', value: 20, intent: '🛡️文脉封层' },
            { type: 'attack', value: 42, intent: '⚔️律线断裁' }
        ],
        aiProfile: 'sustain',
        ecologyLabel: '法庭织阵',
        ecologyGroup: 'final_verdict',
        elitePartnerIds: ['elementalElder', 'karmaArbiter'],
        stealLaw: 'reversalLaw',
        gold: { min: 194, max: 238 }
    },
    verdictEnvoy: {
        id: 'verdictEnvoy',
        name: '审命谕使',
        icon: '⚖️',
        realm: 17,
        hp: 236,
        patterns: [
            { type: 'debuff', buffType: 'vulnerable', value: 2, intent: '⚖️裁命宣示' },
            {
                type: 'multiAction',
                intent: '☯️双判同降',
                actions: [
                    { type: 'defend', value: 16, intent: '🛡️天衡自护' },
                    { type: 'attack', value: 22, intent: '⚔️谕令追击' }
                ]
            },
            { type: 'attack', value: 45, intent: '⚔️终审重斩' }
        ],
        aiProfile: 'balanced',
        ecologyLabel: '天衡裁阵',
        ecologyGroup: 'final_verdict',
        elitePartnerIds: ['karmaArbiter', 'heavenlyDao'],
        gold: { min: 206, max: 252 }
    },
    fateShackle: {
        id: 'fateShackle',
        name: '命锁缚灵',
        icon: '⛓️',
        realm: 18,
        hp: 250,
        patterns: [
            { type: 'addStatus', cardId: 'heartDemon', count: 1, intent: '🕳️命锁烙印' },
            { type: 'debuff', buffType: 'mark', value: 3, intent: '🎯终命悬决' },
            { type: 'multiAttack', value: 16, count: 3, intent: '⚔️断命缠剿' }
        ],
        aiProfile: 'control',
        ecologyLabel: '终庭锁命',
        ecologyGroup: 'final_verdict',
        elitePartnerIds: ['heavenlyDao', 'karmaArbiter'],
        stealLaw: 'voidEmbrace',
        gold: { min: 220, max: 270 }
    }
};

const ENEMY_ECOLOGY_TEMPLATES = {
    1: {
        chapterIndex: 1,
        formation: {
            id: 'chapter1_fracture_hunt',
            name: '裂誓围猎',
            tag: '裂誓',
            desc: '前锋以标记和先手压血追猎，适合在你未稳血线前抢拍。',
            behavior: 'pincer',
            preferred: ['striker', 'hexer'],
            attackMul: 1.08,
            openingBlock: 2
        },
        elite: {
            id: 'chapter1_oathbreak_exile',
            name: '问罪流放阵',
            tag: '问罪',
            desc: '精英战会以追痕、压血和问罪宣判连续逼你交资源。',
            behavior: 'hex',
            preferred: ['hexer', 'striker'],
            attackMul: 1.07,
            openingBlock: 4
        }
    },
    2: {
        chapterIndex: 2,
        formation: {
            id: 'chapter2_forge_tide',
            name: '炉潮钳阵',
            tag: '炉潮',
            desc: '厚盾、灼烧与修补并进，会把战斗拖成资源锻打战。',
            behavior: 'bulwark',
            preferred: ['guardian', 'balanced'],
            attackMul: 1.03,
            openingBlock: 6
        },
        elite: {
            id: 'chapter2_anvil_chain',
            name: '淬炉锁链阵',
            tag: '淬炉',
            desc: '精英会轮番上盾、回火与加压，逼你优先拆阵核。',
            behavior: 'relay',
            preferred: ['guardian', 'balanced'],
            attackMul: 1.06,
            openingBlock: 8
        }
    },
    3: {
        chapterIndex: 3,
        formation: {
            id: 'chapter3_star_lattice',
            name: '沉星链阵',
            tag: '沉星',
            desc: '控场、回合预埋和连锁补刀会交替出现，错误收尾会被放大。',
            behavior: 'hex',
            preferred: ['hexer', 'balanced'],
            attackMul: 1.04,
            openingBlock: 4
        },
        elite: {
            id: 'chapter3_chronicle_spiral',
            name: '时序回旋阵',
            tag: '时序',
            desc: '精英更偏向控手与补刀轮转，拖长后会不断吃到次回合税。',
            behavior: 'relay',
            preferred: ['hexer', 'guardian'],
            attackMul: 1.07,
            openingBlock: 5
        }
    },
    4: {
        chapterIndex: 4,
        formation: {
            id: 'chapter4_mirror_curse',
            name: '悬镜咒潮',
            tag: '悬镜',
            desc: '镜返、诅咒与减益会层层叠起，让防错价值明显提高。',
            behavior: 'hex',
            preferred: ['hexer', 'balanced'],
            attackMul: 1.03,
            openingBlock: 5
        },
        elite: {
            id: 'chapter4_reflection_chain',
            name: '折镜连忏',
            tag: '折镜',
            desc: '精英会在反照与续航间切换，要求你找准净化和爆发窗口。',
            behavior: 'bulwark',
            preferred: ['hexer', 'guardian'],
            attackMul: 1.05,
            openingBlock: 7
        }
    },
    5: {
        chapterIndex: 5,
        formation: {
            id: 'chapter5_bloodmoon_hunt',
            name: '血月逐猎',
            tag: '血月',
            desc: '压血、收割与狂化阈值一起推进，越拖越容易被斩线。',
            behavior: 'pincer',
            preferred: ['striker', 'balanced'],
            attackMul: 1.09,
            openingBlock: 3
        },
        elite: {
            id: 'chapter5_sacrifice_feast',
            name: '祭锋盛猎',
            tag: '祭锋',
            desc: '精英会用献祭回生和高压收割把战斗推向赌命节奏。',
            behavior: 'relay',
            preferred: ['striker', 'hexer'],
            attackMul: 1.1,
            openingBlock: 4
        }
    },
    6: {
        chapterIndex: 6,
        formation: {
            id: 'chapter6_final_verdict',
            name: '终庭法裁',
            tag: '终庭',
            desc: '法则压制、标记审判与多轴检定同时存在，要求构筑完整应答。',
            behavior: 'bulwark',
            preferred: ['guardian', 'hexer', 'balanced'],
            attackMul: 1.05,
            openingBlock: 6
        },
        elite: {
            id: 'chapter6_heavenly_adjudication',
            name: '命衡审列',
            tag: '命衡',
            desc: '精英会以终局审判姿态拆你的容错，逼你尽快打穿阵眼。',
            behavior: 'hex',
            preferred: ['hexer', 'guardian'],
            attackMul: 1.08,
            openingBlock: 8
        }
    }
};

const CHAPTER_ELITE_COMBOS = {
    1: {
        chapterIndex: 1,
        name: '问罪猎杀',
        anchorEnemyIds: ['executionBanner', 'oathHound'],
        summary: '先挂追痕再逼出易伤，让前段章节形成强烈的抢拍压血感。'
    },
    2: {
        chapterIndex: 2,
        name: '炉潮锁链',
        anchorEnemyIds: ['furnaceTribune', 'slagChanneler'],
        summary: '前排稳压、后排灼烧回火，逼你在资源被烧干前强拆阵核。'
    },
    3: {
        chapterIndex: 3,
        name: '时序追算',
        anchorEnemyIds: ['orbitSentinel', 'chronologyMoth'],
        summary: '通过连锁补刀与时序控手，让错误牌序不断被追罚。'
    },
    4: {
        chapterIndex: 4,
        name: '镜咒双映',
        anchorEnemyIds: ['mirrorServitor', 'curseLacquerer'],
        summary: '镜返与心魔污染共同压场，需要净化与快攻并用。'
    },
    5: {
        chapterIndex: 5,
        name: '血契盛猎',
        anchorEnemyIds: ['bloodDebtKeeper', 'sacramentButcher'],
        summary: '围绕低血收益与回生收割持续加压，逼你主动抢收头。'
    },
    6: {
        chapterIndex: 6,
        name: '终庭审列',
        anchorEnemyIds: ['lawWeaver', 'verdictEnvoy'],
        summary: '用法则压制与终局裁断构成复合资源税，是终章精英的典型考题。'
    }
};

const BOSS_PHASE_BLUEPRINTS = {
    swordElder: {
        actTwo: {
            threshold: 0.72,
            name: '剑阵封域',
            heal: 0.05,
            attackMul: 1.14,
            appendPatterns: [
                { type: 'debuff', buffType: 'mark', value: 2, intent: '🎯封域剑印' }
            ]
        },
        actThree: {
            threshold: 0.34,
            name: '万刃问锋',
            heal: 0.1,
            attackMul: 1.24,
            defendMul: 0.85,
            appendPatterns: [
                { type: 'multiAttack', value: 8, count: 3, intent: '⚔️万刃断空' }
            ]
        },
        setpiece: {
            openingStance: '开场以剑印封诀锁你的关键牌序，逼你先交冗余牌。',
            counterWindow: '拆掉剑阵护势、逼它提前交出封域回合，就是主要输出窗口。',
            finisher: '万刃问锋',
            visualCue: '大片断空剑符与环形剑阵会成为最醒目的战场记忆点。'
        }
    },
    divineLord: {
        actTwo: {
            threshold: 0.7,
            name: '神念锁界',
            heal: 0.06,
            attackMul: 1.12,
            appendPatterns: [
                { type: 'debuff', buffType: 'weak', value: 2, intent: '🌀神念压境' }
            ]
        },
        actThree: {
            threshold: 0.32,
            name: '敕令天坠',
            heal: 0.11,
            attackMul: 1.26,
            defendMul: 0.8,
            appendPatterns: [
                { type: 'attack', value: 44, intent: '☄️敕令坠界' }
            ]
        },
        setpiece: {
            openingStance: '以神念贡税压你的手牌厚度，越怕丢关键牌越会被拖慢。',
            counterWindow: '保住低价值牌吃税，并在它切入敕令前用爆发压低血线。',
            finisher: '敕令天坠',
            visualCue: '天幕敕符与高空坠落的法印会强化“被审判”的压迫感。'
        }
    },
    ascensionSovereign: {
        actTwo: {
            threshold: 0.72,
            name: '雷诰巡天',
            heal: 0.05,
            attackMul: 1.15,
            appendPatterns: [
                { type: 'debuff', buffType: 'vulnerable', value: 2, intent: '⚡雷诰锁命' }
            ]
        },
        actThree: {
            threshold: 0.35,
            name: '升霄天罚',
            heal: 0.1,
            attackMul: 1.22,
            defendMul: 0.82,
            appendPatterns: [
                { type: 'multiAttack', value: 12, count: 3, intent: '⚡升霄天罚' }
            ]
        },
        setpiece: {
            openingStance: '先以封符和高压雷击迫使你缩短回合价值。',
            counterWindow: '雷诰预备回合护盾较薄，是抢节奏与斩线的关键两拍。',
            finisher: '升霄天罚',
            visualCue: '整幕雷环收束到 Boss 身周，再炸成三段天罚落雷。'
        }
    },
    triheadGoldDragon: {
        actTwo: {
            threshold: 0.7,
            name: '三首轮甲',
            heal: 0.06,
            attackMul: 1.1,
            appendPatterns: [
                { type: 'defend', value: 26, intent: '🛡️龙鳞轮甲' }
            ]
        },
        actThree: {
            threshold: 0.33,
            name: '鎏金噬界',
            heal: 0.12,
            attackMul: 1.25,
            defendMul: 0.9,
            appendPatterns: [
                { type: 'attack', value: 56, intent: '💥鎏金龙噬' }
            ]
        },
        setpiece: {
            openingStance: '三首会轮替夺壁、反伤与高抗，逼你先决定用什么属性拆甲。',
            counterWindow: '破掉大额护盾后的空档极短，需提前预留穿甲与爆发段。',
            finisher: '鎏金噬界',
            visualCue: '三枚龙首轮流点亮，最后会在中央叠成一道鎏金龙噬。'
        }
    },
    voidDevourer: {
        actTwo: {
            threshold: 0.71,
            name: '渊腹翻潮',
            heal: 0.05,
            attackMul: 1.13,
            appendPatterns: [
                { type: 'addStatus', cardId: 'heartDemon', count: 1, intent: '🕳️渊潮蚀心' }
            ]
        },
        actThree: {
            threshold: 0.3,
            name: '终渊咀灭',
            heal: 0.11,
            attackMul: 1.24,
            defendMul: 0.82,
            appendPatterns: [
                { type: 'multiAttack', value: 16, count: 3, intent: '🌑终渊咀灭' }
            ]
        },
        setpiece: {
            openingStance: '以吞噬和禁疗慢慢磨空你的恢复路线，再逼你赌爆发收尾。',
            counterWindow: '它每次翻潮前会略微降速，正是清状态并转攻的窗口。',
            finisher: '终渊咀灭',
            visualCue: '虚空裂口逐层扩张，压轴时会像黑潮一样吞没战场。'
        }
    },
    heavenlyDao: {
        actTwo: {
            threshold: 0.74,
            name: '善律改卷',
            heal: 0.08,
            attackMul: 1.12,
            appendPatterns: [
                { type: 'defend', value: 80, intent: '🛡️善律改卷' }
            ]
        },
        actThree: {
            threshold: 0.36,
            name: '终焉裁问',
            heal: 0.15,
            attackMul: 1.28,
            defendMul: 0.7,
            appendPatterns: [
                { type: 'attack', value: 188, intent: '☯️终焉裁问' }
            ]
        },
        setpiece: {
            openingStance: '先以天道映照审问你的构筑，再逐步把多轴联动拉上台面。',
            counterWindow: '映照回合结束后它会短暂暴露，必须趁那几拍完成关键转轴。',
            finisher: '终焉裁问',
            visualCue: '善恶双轮与太极法庭同时落下，形成终章最强视觉断章。'
        }
    }
};

Object.values(V6_ENEMY_PACK).forEach((enemy) => {
    if (!enemy || !enemy.id || ENEMIES[enemy.id]) return;
    ENEMIES[enemy.id] = enemy;
});

// 为敌人补全扩展元数据：aiProfile / phaseConfig / resistTags
function enrichEnemyMetadata() {
    const createScaledPhasePatterns = (basePatterns = [], config = {}) => {
        const attackMul = Math.max(1, Number(config.attackMul) || 1);
        const defendMul = Math.max(0.5, Number(config.defendMul) || 1);
        const patterns = (Array.isArray(basePatterns) ? basePatterns : []).map((pattern) => {
            if (!pattern || typeof pattern !== 'object') return pattern;
            const next = { ...pattern };
            if ((next.type === 'attack' || next.type === 'multiAttack' || next.type === 'executeDamage') && Number.isFinite(Number(next.value))) {
                next.value = Math.max(1, Math.floor(Number(next.value) * attackMul));
            }
            if ((next.type === 'defend' || next.type === 'heal') && Number.isFinite(Number(next.value))) {
                next.value = Math.max(1, Math.floor(Number(next.value) * defendMul));
            }
            return next;
        });
        (config.appendPatterns || []).forEach((pattern) => {
            if (pattern && typeof pattern === 'object') patterns.push({ ...pattern });
        });
        return patterns;
    };

    Object.entries(BOSS_PHASE_BLUEPRINTS).forEach(([bossId, blueprint]) => {
        const boss = ENEMIES[bossId];
        if (!boss || boss.phaseConfig) return;
        const basePatterns = Array.isArray(boss.patterns) ? boss.patterns : [];
        boss.phaseConfig = [
            {
                threshold: Number.isFinite(Number(blueprint.actTwo?.threshold)) ? Number(blueprint.actTwo.threshold) : 0.68,
                name: blueprint.actTwo?.name || '怒相',
                heal: Number.isFinite(Number(blueprint.actTwo?.heal)) ? Number(blueprint.actTwo.heal) : 0.06,
                patterns: createScaledPhasePatterns(basePatterns, blueprint.actTwo || {})
            },
            {
                threshold: Number.isFinite(Number(blueprint.actThree?.threshold)) ? Number(blueprint.actThree.threshold) : 0.34,
                name: blueprint.actThree?.name || '狂相',
                heal: Number.isFinite(Number(blueprint.actThree?.heal)) ? Number(blueprint.actThree.heal) : 0.1,
                patterns: createScaledPhasePatterns(basePatterns, blueprint.actThree || {})
            }
        ];
        if (blueprint.setpiece && typeof blueprint.setpiece === 'object') {
            boss.bossSetpiece = {
                openingStance: String(blueprint.setpiece.openingStance || ''),
                counterWindow: String(blueprint.setpiece.counterWindow || ''),
                finisher: String(blueprint.setpiece.finisher || ''),
                visualCue: String(blueprint.setpiece.visualCue || '')
            };
        }
    });

    const chapterEcologyDefaults = {
        1: { group: 'fractured_hunt', label: '裂誓试锋' },
        2: { group: 'forge_tide', label: '炉潮淬阵' },
        3: { group: 'star_archive', label: '沉星筹算' },
        4: { group: 'mirror_curse', label: '悬镜反照' },
        5: { group: 'bloodmoon_hunt', label: '血月收割' },
        6: { group: 'final_verdict', label: '终庭裁命' }
    };

    Object.values(ENEMIES).forEach(enemy => {
        if (!enemy.aiProfile) {
            if (enemy.isBoss) enemy.aiProfile = 'boss_adaptive';
            else if ((enemy.patterns || []).some(p => p.type === 'debuff')) enemy.aiProfile = 'control';
            else if ((enemy.patterns || []).some(p => p.type === 'defend' || p.type === 'heal')) enemy.aiProfile = 'sustain';
            else enemy.aiProfile = 'aggressive';
        }

        if (!enemy.resistTags) {
            enemy.resistTags = enemy.resistances
                ? Object.entries(enemy.resistances).filter(([, v]) => v > 0).map(([k]) => `resist_${k}`)
                : [];
        }

        const chapterIndex = Math.max(1, Math.min(6, Math.floor((Math.max(1, Number(enemy.realm) || 1) - 1) / 3) + 1));
        const ecologyDefault = chapterEcologyDefaults[chapterIndex] || chapterEcologyDefaults[1];
        if (!enemy.ecologyGroup) enemy.ecologyGroup = ecologyDefault.group;
        if (!enemy.ecologyLabel) enemy.ecologyLabel = ecologyDefault.label;
    });

    const injectPattern = (enemyId, pattern) => {
        const enemy = ENEMIES[enemyId];
        if (!enemy || !Array.isArray(enemy.patterns)) return;
        const duplicated = enemy.patterns.some(p => p.type === pattern.type && p.buffType === pattern.buffType && p.intent === pattern.intent);
        if (!duplicated) enemy.patterns.push(pattern);
    };

    // 让部分敌人能够施加新机制相关压力（破绽/流血）
    injectPattern('bandit', { type: 'debuff', buffType: 'mark', value: 2, intent: '🎯' });
    injectPattern('venomSnake', { type: 'debuff', buffType: 'bleed', value: 2, intent: '🩸' });
    injectPattern('thunderBeast', { type: 'debuff', buffType: 'mark', value: 3, intent: '🎯' });
    injectPattern('talismanMaster', { type: 'debuff', buffType: 'mark', value: 2, intent: '🎯' });
    injectPattern('flameCultist', { type: 'debuff', buffType: 'bleed', value: 2, intent: '🩸' });
    injectPattern('crystalGolem', { type: 'debuff', buffType: 'mark', value: 2, intent: '🎯' });
    injectPattern('demonWolf', { type: 'debuff', buffType: 'bleed', value: 3, intent: '🩸' });
    injectPattern('swordElder', { type: 'debuff', buffType: 'mark', value: 4, intent: '🎯' });

    const phaseBossIds = [
        'swordElder',
        'danZun',
        'heavenlyDao',
        'karmaArbiter',
        'ancientSpirit',
        'swordSaint',
        'tribulationCloud10',
        'tribulationCloud15'
    ];

    phaseBossIds.forEach(id => {
        const boss = ENEMIES[id];
        if (!boss || boss.phaseConfig) return;
        const basePatterns = boss.patterns || [];
        boss.phaseConfig = [
            {
                threshold: 0.65,
                name: '怒相',
                heal: 0.08,
                patterns: basePatterns.map(p => {
                    if (p.type === 'attack' || p.type === 'multiAttack') {
                        return { ...p, value: Math.floor((p.value || 0) * 1.15) };
                    }
                    return { ...p };
                })
            },
            {
                threshold: 0.30,
                name: '狂相',
                heal: 0.12,
                patterns: basePatterns.map(p => {
                    if (p.type === 'attack' || p.type === 'multiAttack') {
                        return { ...p, value: Math.floor((p.value || 0) * 1.3) };
                    }
                    if (p.type === 'defend') {
                        return { ...p, value: Math.floor((p.value || 0) * 0.8) };
                    }
                    return { ...p };
                })
            }
        ];
    });
}

enrichEnemyMetadata();

// 精英敌人修饰符
const ELITE_MODIFIERS = [
    { name: '狂暴', effect: { type: 'strength', value: 2 }, hpMultiplier: 1.3 },
    { name: '坚韧', effect: { type: 'startBlock', value: 15 }, hpMultiplier: 1.5 },
    { name: '迅捷', effect: { type: 'dodge', value: 0.25 }, hpMultiplier: 1.2 } // Changed to dodge chance
];

// 根据天域获取敌人
function getEnemiesForRealm(realm) {
    return Object.values(ENEMIES)
        .filter(e => e.realm === realm && !e.isBoss && !e.isMinion)
        .map(e => JSON.parse(JSON.stringify(e)));
}

// 根据天域获取BOSS
function getBossForRealm(realm) {
    const boss = Object.values(ENEMIES).find(e => e.realm === realm && e.isBoss);
    return boss ? JSON.parse(JSON.stringify(boss)) : null;
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

if (typeof window !== 'undefined') {
    window.ENEMIES = ENEMIES;
    window.ENEMY_ECOLOGY_TEMPLATES = ENEMY_ECOLOGY_TEMPLATES;
    window.CHAPTER_ELITE_COMBOS = CHAPTER_ELITE_COMBOS;
}
