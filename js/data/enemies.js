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
