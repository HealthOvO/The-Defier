/**
 * The Defier 2.0 - 事件数据
 */

const EVENTS = {
    // ==================== 觉醒事件 ====================
    ancientJade: {
        id: 'ancientJade',
        name: '神秘古玉',
        icon: '🟢',
        description: '你在废墟中发现一枚温润的古玉，当你触碰它时，体内的残缺印记开始滚烫...',
        choices: [
            {
                text: '融合古玉',
                icon: '✨',
                result: '觉醒逆命之环，修复残缺印记',
                resultType: 'positive',
                effects: [
                    { type: 'awakenRing' }
                ]
            }
        ]
    },

    // ==================== 宝箱事件 ====================
    mysteryChest: {
        id: 'mysteryChest',
        name: '神秘宝箱',
        icon: '📦',
        description: '你在路边发现了一个散发着微光的宝箱...',
        choices: [
            {
                text: '打开宝箱',
                icon: '🔓',
                result: '可能获得丰厚奖励',
                resultType: 'positive',
                effects: [
                    {
                        type: 'random', options: [
                            { type: 'gold', value: 50, chance: 0.5 },
                            { type: 'card', rarity: 'rare', chance: 0.3 },
                            { type: 'damage', value: 10, chance: 0.2 }
                        ]
                    }
                ]
            },
            {
                text: '谨慎离开',
                icon: '🚶',
                result: '无事发生',
                resultType: 'neutral',
                effects: []
            }
        ]
    },

    // ==================== 商人事件 ====================
    mysteriousMerchant: {
        id: 'mysteriousMerchant',
        name: '神秘商人',
        icon: '🎭',
        speaker: {
            icon: '🎭',
            dialogue: '"逆命者...我这里有些稀罕物件，不知道你是否愿意用些许生命来交换？"'
        },
        choices: [
            {
                text: '购买【时间静止】',
                icon: '⏱️',
                result: '-20 HP，获得传说法则牌',
                resultType: 'negative',
                condition: { type: 'hp', min: 25 },
                effects: [
                    { type: 'damage', value: 20 },
                    { type: 'card', cardId: 'timeStop' }
                ]
            },
            {
                text: '购买【治愈药水】',
                icon: '🧪',
                result: '-30 灵石，恢复30 HP',
                resultType: 'positive',
                condition: { type: 'gold', min: 30 },
                effects: [
                    { type: 'gold', value: -30 },
                    { type: 'heal', value: 30 }
                ]
            },
            {
                text: '购买随机稀有卡',
                icon: '🎴',
                result: '-50 灵石',
                resultType: 'neutral',
                condition: { type: 'gold', min: 50 },
                effects: [
                    { type: 'gold', value: -50 },
                    { type: 'card', rarity: 'rare' }
                ]
            },
            {
                text: '婉拒离开',
                icon: '👋',
                result: '商人神秘地消失了',
                resultType: 'neutral',
                effects: []
            }
        ]
    },

    // ==================== 修士事件 ====================
    injuredCultivator: {
        id: 'injuredCultivator',
        name: '受伤的修士',
        icon: '👤',
        speaker: {
            icon: '🧙',
            dialogue: '"道友...能否施以援手？我可以传授一门剑法作为报答..."'
        },
        choices: [
            {
                text: '给他50灵石',
                icon: '💰',
                result: '获得一张稀有卡牌',
                resultType: 'positive',
                condition: { type: 'gold', min: 50 },
                effects: [
                    { type: 'gold', value: -50 },
                    { type: 'card', cardId: 'swordIntent' }
                ]
            },
            {
                text: '分享治疗术',
                icon: '💚',
                result: '-10 HP，提升命环经验',
                resultType: 'neutral',
                condition: { type: 'hp', min: 15 },
                effects: [
                    { type: 'damage', value: 10 },
                    { type: 'ringExp', value: 40 }
                ]
            },
            {
                text: '趁机抢夺',
                icon: '⚔️',
                result: '进入战斗',
                resultType: 'negative',
                effects: [
                    { type: 'battle', enemyId: 'swordDisciple' }
                ]
            },
            {
                text: '无视他',
                icon: '🚶',
                result: '无事发生',
                resultType: 'neutral',
                effects: []
            }
        ]
    },

    // ==================== 祭坛事件 ====================
    ancientAltar: {
        id: 'ancientAltar',
        name: '古老祭坛',
        icon: '⛩️',
        description: '一座古老的祭坛散发着神秘的光芒，似乎在等待某种献祭...',
        choices: [
            {
                text: '献祭生命',
                icon: '❤️',
                result: '-15 HP，命环经验+60',
                resultType: 'negative',
                condition: { type: 'hp', min: 20 },
                effects: [
                    { type: 'damage', value: 15 },
                    { type: 'ringExp', value: 60 }
                ]
            },
            {
                text: '献祭灵石',
                icon: '💰',
                result: '-100 灵石，获得随机法则',
                resultType: 'neutral',
                condition: { type: 'gold', min: 100 },
                effects: [
                    { type: 'gold', value: -100 },
                    { type: 'law', random: true }
                ]
            },
            {
                text: '强化卡牌',
                icon: '⚡',
                result: '选择一张卡牌进行升级',
                resultType: 'positive',
                condition: { type: 'deckSize', min: 6 },
                effects: [
                    { type: 'upgradeCard' }
                ]
            },
            {
                text: '离开祭坛',
                icon: '🚶',
                result: '祭坛的光芒渐渐暗淡',
                resultType: 'neutral',
                effects: []
            }
        ]
    },

    // ==================== 灵脉事件 ====================
    spiritVein: {
        id: 'spiritVein',
        name: '灵脉宝地',
        icon: '💎',
        description: '你发现了一处灵气充沛的灵脉，可以在此修炼或采集资源...',
        choices: [
            {
                text: '静心修炼',
                icon: '🧘',
                result: '恢复25 HP',
                resultType: 'positive',
                effects: [
                    { type: 'heal', value: 25 }
                ]
            },
            {
                text: '采集灵石',
                icon: '⛏️',
                result: '获得 40-80 灵石',
                resultType: 'positive',
                effects: [
                    { type: 'randomGold', min: 40, max: 80 }
                ]
            },
            {
                text: '感悟法则',
                icon: '✨',
                result: '命环经验+30，可能领悟新法则',
                resultType: 'positive',
                effects: [
                    { type: 'ringExp', value: 30 },
                    {
                        type: 'random', options: [
                            { type: 'law', random: true, chance: 0.2 },
                            { type: 'nothing', chance: 0.8 }
                        ]
                    }
                ]
            }
        ]
    },

    // ==================== 命运抉择 ====================
    fateChoice: {
        id: 'fateChoice',
        name: '命运抉择',
        icon: '⚖️',
        description: '两条道路摆在你面前，代表着不同的命运走向...',
        choices: [
            {
                text: '力量之路',
                icon: '💪',
                result: '攻击力永久+2，最大HP-5',
                resultType: 'neutral',
                effects: [
                    { type: 'permaBuff', stat: 'strength', value: 2 },
                    { type: 'maxHp', value: -5 }
                ]
            },
            {
                text: '防御之路',
                icon: '🛡️',
                result: '最大HP+10，每回合起始灵力-1',
                resultType: 'neutral',
                effects: [
                    { type: 'maxHp', value: 10 },
                    { type: 'permaBuff', stat: 'energy', value: -1 }
                ]
            },
            {
                text: '平衡之路',
                icon: '☯️',
                result: '无变化，但获得一张稀有牌',
                resultType: 'positive',
                effects: [
                    { type: 'card', rarity: 'rare' }
                ]
            }
        ]
    },

    // ==================== 试炼之地 ====================
    trialGround: {
        id: 'trialGround',
        name: '试炼之地',
        icon: '🏛️',
        description: '一座古老的试炼场，完成挑战可获得丰厚奖励...',
        choices: [
            {
                text: '接受速杀试炼',
                icon: '⚡',
                result: '3回合内击败敌人获得双倍奖励',
                resultType: 'neutral',
                effects: [
                    { type: 'trial', trialType: 'speedKill', rounds: 3, rewardMultiplier: 2 }
                ]
            },
            {
                text: '接受无伤试炼',
                icon: '💯',
                result: '不受伤击败敌人获得稀有法则',
                resultType: 'neutral',
                effects: [
                    { type: 'trial', trialType: 'noDamage', reward: 'law' }
                ]
            },
            {
                text: '放弃试炼',
                icon: '🚶',
                result: '离开试炼场',
                resultType: 'neutral',
                effects: []
            }
        ]
    },

    // ==================== 神秘石碑 ====================
    mysteryStele: {
        id: 'mysteryStele',
        name: '神秘石碑',
        icon: '🗿',
        speaker: {
            icon: '🗿',
            dialogue: '"吾乃上古修士遗灵...你可选择接受吾之馈赠，但需付出相应代价..."'
        },
        choices: [
            {
                text: '接受力量馈赠',
                icon: '⚔️',
                result: '获得3张攻击牌，移除2张防御牌',
                resultType: 'neutral',
                effects: [
                    { type: 'card', cardId: 'heavyStrike' },
                    { type: 'card', cardId: 'doubleStrike' },
                    { type: 'card', cardId: 'ragingBlow' },
                    { type: 'removeCardType', cardType: 'defense', count: 2 }
                ]
            },
            {
                text: '接受知识馈赠',
                icon: '📖',
                result: '命环升级，但失去一半灵石',
                resultType: 'neutral',
                effects: [
                    { type: 'ringExp', value: 100 },
                    { type: 'gold', percent: -50 }
                ]
            },
            {
                text: '拒绝馈赠',
                icon: '✋',
                result: '石碑裂开，获得少量灵石',
                resultType: 'positive',
                effects: [
                    { type: 'gold', value: 25 }
                ]
            }
        ]
    }
};

// 事件池 - 按类型分类
const EVENT_POOL = {
    common: ['mysteryChest', 'spiritVein'],
    uncommon: ['injuredCultivator', 'mysteryStele'],
    rare: ['mysteriousMerchant', 'ancientAltar', 'fateChoice'],
    special: ['trialGround']
};

// 获取随机事件
function getRandomEvent() {
    const roll = Math.random();
    let pool;

    if (roll < 0.4) pool = EVENT_POOL.common;
    else if (roll < 0.7) pool = EVENT_POOL.uncommon;
    else if (roll < 0.95) pool = EVENT_POOL.rare;
    else pool = EVENT_POOL.special;

    const eventId = pool[Math.floor(Math.random() * pool.length)];
    return EVENTS[eventId] ? { ...EVENTS[eventId] } : null;
}
