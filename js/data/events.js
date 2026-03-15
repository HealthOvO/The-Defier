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
    },

    // ==================== 3.0新增事件 ====================
    celestialGamble: {
        id: 'celestialGamble',
        name: '天机赌局',
        icon: '🎲',
        description: '一位神秘的虚影邀请你参与一场关于运气的赌局...',
        choices: [
            {
                text: '小赌怡情 (10% HP)',
                icon: '💉',
                result: '50% 获得 100 灵石',
                resultType: 'neutral',
                effects: [
                    {
                        type: 'random', options: [
                            { type: 'gold', value: 100, chance: 0.5 },
                            { type: 'damage', value: 8, chance: 0.5 } // 约10%HP
                        ]
                    }
                ]
            },
            {
                text: '豪赌一把 (30% HP)',
                icon: '🩸',
                result: '40% 获得随机法宝',
                resultType: 'negative',
                effects: [
                    {
                        type: 'random', options: [
                            { type: 'treasure', random: true, chance: 0.4 },
                            { type: 'damage', value: 24, chance: 0.6 } // 约30%HP
                        ]
                    }
                ]
            },
            {
                text: '拒绝赌博',
                icon: '👋',
                result: '离开',
                resultType: 'neutral',
                effects: []
            }
        ]
    },

    voidRift: {
        id: 'voidRift',
        name: '虚空裂隙',
        icon: '🌀',
        description: '空间撕裂，连接着充满危险与机遇的虚空位面...',
        choices: [
            {
                text: '深入探索',
                icon: '👁️',
                result: '受到伤害，获得强力卡牌',
                resultType: 'negative',
                effects: [
                    { type: 'damage', value: 15 },
                    { type: 'card', rarity: 'epic' }
                ]
            },
            {
                text: '封印裂隙',
                icon: '🔒',
                result: '命环经验 +50',
                resultType: 'positive',
                effects: [
                    { type: 'ringExp', value: 50 },
                    { type: 'heal', value: 10 }
                ]
            }
        ]
    },

    ancientLibrary: {
        id: 'ancientLibrary',
        name: '上古书库',
        icon: '📚',
        description: '这里收藏着无数失传的典籍，知识就是力量...',
        choices: [
            {
                text: '研读禁术',
                icon: '📖',
                result: '获得一张随机法则牌',
                resultType: 'positive',
                effects: [
                    { type: 'card', rarity: 'legendary' }
                ]
            },
            {
                text: '整理古籍',
                icon: '🧹',
                result: '升级一张牌，命环经验+30',
                resultType: 'positive',
                effects: [
                    { type: 'upgradeCard' },
                    { type: 'ringExp', value: 30 }
                ]
            }
        ]
    },

    wanderingSmith: {
        id: 'wanderingSmith',
        name: '云游铁匠',
        icon: '🔨',
        description: '一位背着巨大铁砧的铁匠正在休息，他似乎可以强化万物...',
        choices: [
            {
                text: '强化卡牌',
                icon: '⚡',
                result: '升级一张卡牌',
                resultType: 'positive',
                effects: [
                    { type: 'upgradeCard' }
                ]
            },
            {
                text: '打造法宝',
                icon: '🏺',
                result: '花费150灵石购买随机法宝',
                resultType: 'neutral',
                condition: { type: 'gold', min: 150 },
                effects: [
                    { type: 'gold', value: -150 },
                    { type: 'treasure', random: true }
                ]
            },
            {
                text: '离开',
                icon: '👋',
                result: '无事发生',
                resultType: 'neutral',
                effects: []
            }
        ]
    },

    bloodMoonRitual: {
        id: 'bloodMoonRitual',
        name: '血月祭仪',
        icon: '🌕',
        description: '祭台涌动暗红灵潮，你能感到战意与危险并存。',
        choices: [
            {
                text: '以血换力',
                icon: '🩸',
                result: '失去生命，永久力量提升',
                resultType: 'negative',
                condition: { type: 'hp', min: 18 },
                effects: [
                    { type: 'damage', value: 12 },
                    { type: 'permaBuff', stat: 'strength', value: 1 }
                ]
            },
            {
                text: '稳守心神',
                icon: '🛡️',
                result: '获得护身之力',
                resultType: 'positive',
                effects: [
                    { type: 'maxHp', value: 6 },
                    { type: 'heal', value: 8 }
                ]
            }
        ]
    },

    swordTomb: {
        id: 'swordTomb',
        name: '万剑冢',
        icon: '🗡️',
        description: '遍地断剑在低鸣，你可以继承其中一缕剑魂。',
        choices: [
            {
                text: '择杀伐剑魂',
                icon: '⚔️',
                result: '获得攻击牌',
                resultType: 'positive',
                effects: [
                    { type: 'card', cardId: 'bloodlettingSlash' },
                    { type: 'card', cardId: 'punctureMark' }
                ]
            },
            {
                text: '择守御剑魂',
                icon: '🛡️',
                result: '获得防御与回复',
                resultType: 'neutral',
                effects: [
                    { type: 'card', cardId: 'guardedRiposte' },
                    { type: 'heal', value: 12 }
                ]
            }
        ]
    },

    spiritAuction: {
        id: 'spiritAuction',
        name: '灵市暗拍',
        icon: '🏮',
        description: '蒙面拍卖师低声询价，稀有宝物稍纵即逝。',
        choices: [
            {
                text: '竞拍秘宝',
                icon: '💰',
                result: '花费120灵石，获得随机法宝',
                resultType: 'neutral',
                condition: { type: 'gold', min: 120 },
                effects: [
                    { type: 'gold', value: -120 },
                    { type: 'treasure', random: true }
                ]
            },
            {
                text: '竞拍秘籍',
                icon: '📜',
                result: '花费80灵石，获得稀有卡',
                resultType: 'neutral',
                condition: { type: 'gold', min: 80 },
                effects: [
                    { type: 'gold', value: -80 },
                    { type: 'card', rarity: 'rare' }
                ]
            }
        ]
    },

    fallenFormation: {
        id: 'fallenFormation',
        name: '残阵遗痕',
        icon: '🧿',
        description: '古阵崩坏，仍残留可供利用的法阵节点。',
        choices: [
            {
                text: '重组阵纹',
                icon: '✨',
                result: '命环经验提升并恢复生命',
                resultType: 'positive',
                effects: [
                    { type: 'ringExp', value: 45 },
                    { type: 'heal', value: 10 }
                ]
            },
            {
                text: '强行突破',
                icon: '💥',
                result: '进入高风险试炼',
                resultType: 'negative',
                effects: [
                    { type: 'trial', trialType: 'speedKill', rounds: 4, rewardMultiplier: 1.6 }
                ]
            }
        ]
    },

    destinyMirror: {
        id: 'destinyMirror',
        name: '宿命镜',
        icon: '🪞',
        description: '镜中映出多个可能的你，每个都通向不同代价。',
        choices: [
            {
                text: '映照过去',
                icon: '🧠',
                result: '移除 1 张防御牌，换取 1 张稀有牌',
                resultType: 'neutral',
                effects: [
                    { type: 'removeCardType', cardType: 'defense', count: 1 },
                    { type: 'card', rarity: 'rare' }
                ]
            },
            {
                text: '映照未来',
                icon: '🔮',
                result: '命环经验+70，但失去生命',
                resultType: 'negative',
                effects: [
                    { type: 'damage', value: 10 },
                    { type: 'ringExp', value: 70 }
                ]
            }
        ]
    },

    wanderingOracle: {
        id: 'wanderingOracle',
        name: '行脚卜者',
        icon: '🧙',
        description: '卜者愿以天机交换你的抉择。',
        choices: [
            {
                text: '求战运',
                icon: '⚔️',
                result: '永久力量+1，最大生命-5',
                resultType: 'negative',
                effects: [
                    { type: 'permaBuff', stat: 'strength', value: 1 },
                    { type: 'maxHp', value: -5 }
                ]
            },
            {
                text: '求生运',
                icon: '🌿',
                result: '最大生命+8，灵力上限-1',
                resultType: 'neutral',
                effects: [
                    { type: 'maxHp', value: 8 },
                    { type: 'permaBuff', stat: 'energy', value: -1 }
                ]
            }
        ]
    },

    demonContract: {
        id: 'demonContract',
        name: '魔契残页',
        icon: '📕',
        description: '契约承诺你力量，但也索取回报。',
        choices: [
            {
                text: '签订契约',
                icon: '✒️',
                result: '获得强力牌与诅咒',
                resultType: 'negative',
                effects: [
                    { type: 'card', cardId: 'executionDoctrine' },
                    { type: 'damage', value: 8 }
                ]
            },
            {
                text: '焚毁残页',
                icon: '🔥',
                result: '获得灵石',
                resultType: 'positive',
                effects: [
                    { type: 'gold', value: 90 }
                ]
            }
        ]
    },

    starObservation: {
        id: 'starObservation',
        name: '观星台',
        icon: '🔭',
        description: '星轨悄然偏转，你有机会重塑牌组节奏。',
        choices: [
            {
                text: '推演星轨',
                icon: '🌠',
                result: '升级一张牌并抽象出新思路',
                resultType: 'positive',
                effects: [
                    { type: 'upgradeCard' },
                    { type: 'ringExp', value: 25 }
                ]
            },
            {
                text: '凝视深空',
                icon: '🕳️',
                result: '获得传奇卡，但受到伤害',
                resultType: 'negative',
                effects: [
                    { type: 'card', rarity: 'legendary' },
                    { type: 'damage', value: 12 }
                ]
            }
        ]
    },

    brokenPavilion: {
        id: 'brokenPavilion',
        name: '断碑古亭',
        icon: '🏯',
        description: '古亭残破，但余下的石刻仍可传道。',
        choices: [
            {
                text: '参悟石刻',
                icon: '📜',
                result: '随机法则或命环经验',
                resultType: 'neutral',
                effects: [
                    {
                        type: 'random', options: [
                            { type: 'law', random: true, chance: 0.45 },
                            { type: 'ringExp', value: 60, chance: 0.55 }
                        ]
                    }
                ]
            },
            {
                text: '搜刮残砖',
                icon: '🪙',
                result: '获得灵石',
                resultType: 'positive',
                effects: [
                    { type: 'randomGold', min: 40, max: 110 }
                ]
            }
        ]
    },

    bloodForgeCovenant: {
        id: 'bloodForgeCovenant',
        name: '血炉盟约',
        icon: '🜂',
        description: '炉火映出你摇摆不定的影子：要么以血喂刃，要么以资换稳。',
        choices: [
            {
                text: '以血喂刃',
                icon: '🩸',
                result: '失去生命，获得血蚀核心卡',
                resultType: 'negative',
                condition: { type: 'hp', min: 20 },
                effects: [
                    { type: 'damage', value: 12 },
                    { type: 'card', cardId: 'scarletJudgement' },
                    { type: 'card', cardId: 'serratedRitual' }
                ]
            },
            {
                text: '以资换稳',
                icon: '💰',
                result: '消耗灵石，升级一张牌',
                resultType: 'neutral',
                condition: { type: 'gold', min: 80 },
                effects: [
                    { type: 'gold', value: -80 },
                    { type: 'upgradeCard' }
                ]
            },
            {
                text: '不立盟约',
                icon: '🚶',
                result: '你离开了血炉',
                resultType: 'neutral',
                effects: []
            }
        ]
    },

    mirrorNeedleDojo: {
        id: 'mirrorNeedleDojo',
        name: '镜针道场',
        icon: '🪞',
        description: '道场主张“先识破绽，再谈胜负”。',
        choices: [
            {
                text: '研习破势',
                icon: '🎯',
                result: '获得破绽流核心卡',
                resultType: 'positive',
                effects: [
                    { type: 'card', cardId: 'weakpointSurvey' },
                    { type: 'card', cardId: 'focusBreak' }
                ]
            },
            {
                text: '盲冲试招',
                icon: '⚔️',
                result: '进入战斗，胜者得传承',
                resultType: 'negative',
                effects: [
                    { type: 'battle', enemyId: 'swordDisciple' }
                ]
            }
        ]
    },

    shatteredCompass: {
        id: 'shatteredCompass',
        name: '碎命罗盘',
        icon: '🧭',
        description: '罗盘裂成两半，一半指向伤害，一半指向掌控。',
        choices: [
            {
                text: '偏向血路',
                icon: '🩸',
                result: '生命上限下降，力量提升，获得流血牌',
                resultType: 'negative',
                effects: [
                    { type: 'maxHp', value: -6 },
                    { type: 'permaBuff', stat: 'strength', value: 1 },
                    { type: 'card', cardId: 'arteryRupture' }
                ]
            },
            {
                text: '偏向心眼',
                icon: '🧠',
                result: '失去生命，抽牌能力提升，获得破绽牌',
                resultType: 'neutral',
                effects: [
                    { type: 'damage', value: 6 },
                    { type: 'permaBuff', stat: 'draw', value: 1 },
                    { type: 'card', cardId: 'razorFocus' }
                ]
            },
            {
                text: '修复罗盘',
                icon: '🔧',
                result: '命环经验提升',
                resultType: 'positive',
                effects: [
                    { type: 'ringExp', value: 55 }
                ]
            }
        ]
    },

    debtboundAnvil: {
        id: 'debtboundAnvil',
        name: '负债神砧',
        icon: '⚒️',
        description: '神砧只认代价：你可以用灵石买确定性，也可以用生命赌稀有收益。',
        choices: [
            {
                text: '支付灵石锻造',
                icon: '💰',
                result: '消耗灵石，升级并获得一张稀有卡',
                resultType: 'positive',
                condition: { type: 'gold', min: 120 },
                effects: [
                    { type: 'gold', value: -120 },
                    { type: 'upgradeCard' },
                    { type: 'card', rarity: 'rare' }
                ]
            },
            {
                text: '以命抵债',
                icon: '☠️',
                result: '失去生命，获得随机稀有卡',
                resultType: 'negative',
                condition: { type: 'hp', min: 24 },
                effects: [
                    { type: 'damage', value: 16 },
                    { type: 'card', rarity: 'rare' }
                ]
            }
        ]
    },

    voidBookkeeper: {
        id: 'voidBookkeeper',
        name: '虚空账房',
        icon: '📚',
        description: '账房先生递来一卷黑册，声称“代价必须记账，但节奏可提前兑现”。',
        choices: [
            {
                text: '签收账册',
                icon: '✍️',
                result: '获得弃牌流核心卡组',
                resultType: 'positive',
                effects: [
                    { type: 'card', cardId: 'voidLedger' },
                    { type: 'card', cardId: 'recklessMulligan' }
                ]
            },
            {
                text: '借款提速',
                icon: '💰',
                result: '损失生命，获得灵石与核心进攻牌',
                resultType: 'neutral',
                condition: { type: 'hp', min: 18 },
                effects: [
                    { type: 'damage', value: 8 },
                    { type: 'gold', value: 80 },
                    { type: 'card', cardId: 'echoingCut' }
                ]
            }
        ]
    },

    ashLedgerTrial: {
        id: 'ashLedgerTrial',
        name: '灰契账页',
        icon: '📄',
        description: '账页会在战前预支收益，但要求你在之后偿还手牌质量。',
        choices: [
            {
                text: '立即兑现',
                icon: '🔥',
                result: '升级一张牌并获得稀有弃牌牌',
                resultType: 'positive',
                effects: [
                    { type: 'upgradeCard' },
                    { type: 'card', cardId: 'oblivionSpiral' }
                ]
            },
            {
                text: '稳妥签注',
                icon: '🧮',
                result: '获得两张过牌工具并提升命环经验',
                resultType: 'neutral',
                effects: [
                    { type: 'card', cardId: 'recirculation' },
                    { type: 'card', cardId: 'debtCollection' },
                    { type: 'ringExp', value: 35 }
                ]
            }
        ]
    },

    convergenceRitual: {
        id: 'convergenceRitual',
        name: '收束仪式',
        icon: '🕳️',
        description: '你可以把分散的资源压成一次终局爆发，代价是立刻失去安全边际。',
        choices: [
            {
                text: '进行收束',
                icon: '⚔️',
                result: '获得终局卡并损失生命',
                resultType: 'negative',
                condition: { type: 'hp', min: 24 },
                effects: [
                    { type: 'damage', value: 14 },
                    { type: 'card', cardId: 'finalConvergence' }
                ]
            },
            {
                text: '拆解仪式',
                icon: '🛠️',
                result: '获得灵石、经验和弃牌流中坚牌',
                resultType: 'positive',
                effects: [
                    { type: 'gold', value: 90 },
                    { type: 'ringExp', value: 45 },
                    { type: 'card', cardId: 'calculatedRuin' }
                ]
            }
        ]
    },
    oathscarShrine: {
        id: 'oathscarShrine',
        name: '契痕祠',
        icon: '🩸',
        description: '古祠里的誓纹不断渗血，仿佛在提醒你：每一道契痕都能换来一次越界爆发。',
        choices: [
            {
                text: '在誓纹上刻名',
                icon: '✒️',
                result: '获得咒契起手组件',
                resultType: 'positive',
                effects: [
                    { type: 'card', cardId: 'oathscarCut' },
                    { type: 'card', cardId: 'hexbrandSigil' }
                ]
            },
            {
                text: '以血换约',
                icon: '🫀',
                result: '损失生命，获得核心力量牌',
                resultType: 'negative',
                condition: { type: 'hp', min: 22 },
                effects: [
                    { type: 'damage', value: 10 },
                    { type: 'card', cardId: 'bloodpriceMandate' }
                ]
            }
        ]
    },

    griefWritArchive: {
        id: 'griefWritArchive',
        name: '悲契札库',
        icon: '📚',
        description: '守库人说，真正的咒契不靠蛮勇，而靠“预支痛苦、结算未来”。',
        choices: [
            {
                text: '抄录账页',
                icon: '📜',
                result: '升级一张牌并获得悲契账簿',
                resultType: 'positive',
                effects: [
                    { type: 'upgradeCard' },
                    { type: 'card', cardId: 'griefLedger' }
                ]
            },
            {
                text: '借走旧咒',
                icon: '🕯️',
                result: '获得中轴牌与灵石',
                resultType: 'neutral',
                effects: [
                    { type: 'gold', value: 85 },
                    { type: 'card', cardId: 'pactRite' }
                ]
            }
        ]
    },

    blackbannerExecution: {
        id: 'blackbannerExecution',
        name: '黑幡行刑台',
        icon: '⚑',
        description: '刑台早已空无一人，但黑幡仍在风中低语：“命要先抵押，裁决才会降临。”',
        choices: [
            {
                text: '接下裁决',
                icon: '⚔️',
                result: '损失生命，获得终结牌',
                resultType: 'negative',
                condition: { type: 'hp', min: 26 },
                effects: [
                    { type: 'damage', value: 12 },
                    { type: 'card', cardId: 'doomsentVerdict' }
                ]
            },
            {
                text: '收殓残契',
                icon: '🕳️',
                result: '获得魂押并提升命环经验',
                resultType: 'positive',
                effects: [
                    { type: 'card', cardId: 'soulCollateral' },
                    { type: 'ringExp', value: 50 }
                ]
            }
        ]
    },

    ghostFurnace: {
        id: 'ghostFurnace',
        name: '灵火残炉',
        icon: '🔥',
        description: '残炉中仍有灵火未灭，只要投入新的魂芯，就能唤醒沉睡的锻阵傀影。',
        choices: [
            {
                text: '续燃炉火',
                icon: '🪆',
                result: '获得灵傀起手组件',
                resultType: 'positive',
                effects: [
                    { type: 'card', cardId: 'emberPuppetScript' },
                    { type: 'card', cardId: 'spareSoulCore' }
                ]
            },
            {
                text: '捡走护炉甲片',
                icon: '🛡️',
                result: '恢复生命并获得防守构件牌',
                resultType: 'neutral',
                effects: [
                    { type: 'heal', value: 10 },
                    { type: 'card', cardId: 'relayHarness' }
                ]
            }
        ]
    },

    marionetteArmory: {
        id: 'marionetteArmory',
        name: '傀兵军械库',
        icon: '🧰',
        description: '军械库里整齐摆放着可替换的傀芯和护板，每一件都像是为下一场战斗预制好的答案。',
        choices: [
            {
                text: '整备武装',
                icon: '🔧',
                result: '升级一张牌并获得阵列过载',
                resultType: 'positive',
                effects: [
                    { type: 'upgradeCard' },
                    { type: 'card', cardId: 'arrayOverclock' }
                ]
            },
            {
                text: '搬走防具',
                icon: '🏗️',
                result: '获得两张站场牌',
                resultType: 'positive',
                effects: [
                    { type: 'card', cardId: 'guardianGimbal' },
                    { type: 'card', cardId: 'foundryBulwark' }
                ]
            }
        ]
    },

    ancestralFoundry: {
        id: 'ancestralFoundry',
        name: '祖炉总控',
        icon: '🏭',
        description: '总控台仍记录着古代锻阵的全套流程，只要你敢启动，它会把战场直接改造成兵工域。',
        choices: [
            {
                text: '启动祖炉',
                icon: '⚙️',
                result: '获得祖机开炉',
                resultType: 'positive',
                effects: [
                    { type: 'card', cardId: 'ancestralMachina' },
                    { type: 'ringExp', value: 45 }
                ]
            },
            {
                text: '继承军令',
                icon: '👑',
                result: '获得大锻命令与灵石',
                resultType: 'positive',
                effects: [
                    { type: 'gold', value: 95 },
                    { type: 'card', cardId: 'grandForgeMandate' }
                ]
            }
        ]
    },
    convergenceRelay: {
        id: 'convergenceRelay',
        name: '汇流中继台',
        icon: '🌀',
        description: '中继台仍在输出不稳定的灵流，你可以校准命环，也可以强行并轨。',
        choices: [
            {
                text: '校准命环',
                icon: '🧭',
                result: '命环经验提升，并获得首回合灵力增益',
                resultType: 'positive',
                effects: [
                    { type: 'ringExp', value: 48 },
                    { type: 'adventureBuff', buffId: 'firstTurnEnergyBoostBattles', charges: 1 }
                ]
            },
            {
                text: '强制并轨',
                icon: '⚡',
                result: '失去少量生命，获得汇流核心卡',
                resultType: 'negative',
                condition: { type: 'hp', min: 16 },
                effects: [
                    { type: 'damage', value: 8 },
                    { type: 'card', cardId: 'ringInfusion' }
                ]
            }
        ]
    },
    harmonicAnvil: {
        id: 'harmonicAnvil',
        name: '谐振灵砧',
        icon: '⚒️',
        description: '灵砧会放大命环共鸣，你可以走稳态锻造，或赌一次高压熔接。',
        choices: [
            {
                text: '稳态锻环',
                icon: '🛡️',
                result: '升级一张牌并获得护势卡',
                resultType: 'positive',
                effects: [
                    { type: 'upgradeCard' },
                    { type: 'card', cardId: 'echoWard' }
                ]
            },
            {
                text: '高压熔接',
                icon: '🔥',
                result: '失去生命并获得两张汇流卡',
                resultType: 'negative',
                condition: { type: 'hp', min: 20 },
                effects: [
                    { type: 'damage', value: 10 },
                    { type: 'card', cardId: 'artifactBolt' },
                    { type: 'card', cardId: 'ringInfusion' }
                ]
            }
        ]
    },
    artifactConfluxBazaar: {
        id: 'artifactConfluxBazaar',
        name: '灵器汇流集',
        icon: '🛒',
        description: '巡天器商只在命轨重叠处停留片刻，你可以快速换装，或领补贴继续前进。',
        choices: [
            {
                text: '进入汇流集',
                icon: '🧰',
                result: '开启汇流临时商会',
                resultType: 'positive',
                effects: [
                    {
                        type: 'openTemporaryShop',
                        title: '汇流器商',
                        icon: '🛒',
                        desc: '器商优先提供与命环、法宝联动的补给。',
                        offerCount: 4
                    }
                ]
            },
            {
                text: '领取路费',
                icon: '🪙',
                result: '获得灵石与命环经验',
                resultType: 'neutral',
                effects: [
                    { type: 'gold', value: 40 },
                    { type: 'ringExp', value: 20 }
                ]
            }
        ]
    },

    shieldRelayBeacon: {
        id: 'shieldRelayBeacon',
        name: '护阵中继站',
        icon: '📡',
        description: '一座半损的中继阵仍在输送护阵灵流，你可以接管它，或拆解它。',
        choices: [
            {
                text: '拆解阵芯',
                icon: '⚙️',
                result: '获得灵石，但受到反震伤害',
                resultType: 'neutral',
                effects: [
                    { type: 'gold', value: 90 },
                    { type: 'damage', value: 8 }
                ]
            },
            {
                text: '接入护流',
                icon: '🛡️',
                result: '恢复生命并获得守御工具牌',
                resultType: 'positive',
                effects: [
                    { type: 'heal', value: 10 },
                    { type: 'card', cardId: 'mirrorWall' }
                ]
            }
        ]
    },

    ironCitadelPact: {
        id: 'ironCitadelPact',
        name: '玄铁城契',
        icon: '🏰',
        description: '残存守军要求你立下护城誓约，代价是立即承担灵压反噬。',
        choices: [
            {
                text: '签下守契',
                icon: '✍️',
                result: '失去生命，获得玄甲核心卡',
                resultType: 'negative',
                condition: { type: 'hp', min: 20 },
                effects: [
                    { type: 'damage', value: 10 },
                    { type: 'card', cardId: 'citadelOath' },
                    { type: 'card', cardId: 'ironBreath' }
                ]
            },
            {
                text: '稳态改造',
                icon: '🔧',
                result: '获得守势牌并提升命环经验',
                resultType: 'positive',
                effects: [
                    { type: 'card', cardId: 'guardianMantra' },
                    { type: 'ringExp', value: 40 }
                ]
            }
        ]
    },

    aegisTribunal: {
        id: 'aegisTribunal',
        name: '玄甲审庭',
        icon: '⚖️',
        description: '审庭要求你在“以财稳局”与“以身换势”之间作出裁断。',
        choices: [
            {
                text: '缴纳裁断费',
                icon: '💰',
                result: '消耗灵石，获得两张反制牌',
                resultType: 'neutral',
                condition: { type: 'gold', min: 100 },
                effects: [
                    { type: 'gold', value: -100 },
                    { type: 'card', cardId: 'counterEdict' },
                    { type: 'card', cardId: 'shieldTax' }
                ]
            },
            {
                text: '承受重压',
                icon: '🧱',
                result: '失去生命，获得玄甲裁断',
                resultType: 'negative',
                condition: { type: 'hp', min: 18 },
                effects: [
                    { type: 'damage', value: 12 },
                    { type: 'card', cardId: 'aegisJudgement' }
                ]
            }
        ]
    },

    caravanQuartermaster: {
        id: 'caravanQuartermaster',
        name: '行旅军需官',
        icon: '🚚',
        description: '一支前线车队正在补给，军需官愿用折扣价向你出售战术资源。',
        choices: [
            {
                text: '采购战术图册',
                icon: '📘',
                result: '消耗灵石，强化首回合手牌节奏',
                resultType: 'positive',
                condition: { type: 'gold', min: 70 },
                effects: [
                    { type: 'gold', value: -70 },
                    { type: 'adventureBuff', buffId: 'firstTurnDrawBoostBattles', charges: 2 }
                ]
            },
            {
                text: '采购护阵符',
                icon: '🧿',
                result: '消耗灵石，强化开场防御',
                resultType: 'positive',
                condition: { type: 'gold', min: 90 },
                effects: [
                    { type: 'gold', value: -90 },
                    { type: 'adventureBuff', buffId: 'openingBlockBoostBattles', charges: 2 }
                ]
            },
            {
                text: '帮忙搬运物资',
                icon: '🪙',
                result: '获得少量灵石',
                resultType: 'neutral',
                effects: [
                    { type: 'gold', value: 35 }
                ]
            }
        ]
    },

    nightWatchCamp: {
        id: 'nightWatchCamp',
        name: '夜巡营火',
        icon: '🔥',
        description: '守夜者邀请你共巡一晚：若能坚持，明日战斗会更从容。',
        choices: [
            {
                text: '同巡并演练',
                icon: '🛡️',
                result: '失去少量生命，获得双重行旅增益',
                resultType: 'neutral',
                condition: { type: 'hp', min: 18 },
                effects: [
                    { type: 'damage', value: 8 },
                    { type: 'adventureBuff', buffId: 'openingBlockBoostBattles', charges: 1 },
                    { type: 'adventureBuff', buffId: 'firstTurnDrawBoostBattles', charges: 1 }
                ]
            },
            {
                text: '静坐调息',
                icon: '🧘',
                result: '恢复生命并获得命环经验',
                resultType: 'positive',
                effects: [
                    { type: 'heal', value: 14 },
                    { type: 'ringExp', value: 25 }
                ]
            }
        ]
    },

    frontierContractBoard: {
        id: 'frontierContractBoard',
        name: '前线悬赏榜',
        icon: '📜',
        description: '榜上贴满猎杀与护送委托，签约后你的战果将更值钱。',
        choices: [
            {
                text: '签订悬赏契',
                icon: '✒️',
                result: '接下来战斗胜利将获得额外灵石',
                resultType: 'positive',
                effects: [
                    { type: 'adventureBuff', buffId: 'victoryGoldBoostBattles', charges: 2 }
                ]
            },
            {
                text: '谨慎旁观',
                icon: '👀',
                result: '获得少量灵石与命环经验',
                resultType: 'neutral',
                effects: [
                    { type: 'gold', value: 20 },
                    { type: 'ringExp', value: 15 }
                ]
            }
        ]
    },

    floatingMarketRift: {
        id: 'floatingMarketRift',
        name: '裂隙浮市',
        icon: '🛒',
        description: '你在空间褶皱中遇到一位行商，对方只停留片刻。',
        choices: [
            {
                text: '进入浮市',
                icon: '🧭',
                result: '开启临时商会，可购买一件短期军需',
                resultType: 'positive',
                effects: [
                    {
                        type: 'openTemporaryShop',
                        title: '裂隙行商',
                        icon: '🛒',
                        desc: '行商摊位只维持几息，选一件最适合当前路线的军需。',
                        offerCount: 3
                    }
                ]
            },
            {
                text: '掠过不入',
                icon: '🚶',
                result: '获得少量灵石',
                resultType: 'neutral',
                effects: [
                    { type: 'gold', value: 28 }
                ]
            }
        ]
    },

    emberCampSignal: {
        id: 'emberCampSignal',
        name: '余烬营讯',
        icon: '🏕️',
        description: '远处营火传来集结信号，你可以加入驻扎修整。',
        choices: [
            {
                text: '响应营讯',
                icon: '🔥',
                result: '进入营地决策',
                resultType: 'positive',
                effects: [
                    { type: 'openCampfire' }
                ]
            },
            {
                text: '保持行进',
                icon: '🗺️',
                result: '获得少量命环经验',
                resultType: 'neutral',
                effects: [
                    { type: 'ringExp', value: 18 }
                ]
            }
        ]
    },

    leylineConfluence: {
        id: 'leylineConfluence',
        name: '灵脉会流',
        icon: '🌊',
        description: '两条灵脉在此汇聚，你可以借势稳固战术回路。',
        choices: [
            {
                text: '同步灵息',
                icon: '⚡',
                result: '消耗灵石，换取首回合灵力强化',
                resultType: 'positive',
                condition: { type: 'gold', min: 70 },
                effects: [
                    { type: 'gold', value: -70 },
                    { type: 'adventureBuff', buffId: 'firstTurnEnergyBoostBattles', charges: 2 }
                ]
            },
            {
                text: '逆脉淬心',
                icon: '🕯️',
                result: '失去少量生命，换取经验倍率增益',
                resultType: 'neutral',
                condition: { type: 'hp', min: 16 },
                effects: [
                    { type: 'damage', value: 8 },
                    { type: 'adventureBuff', buffId: 'ringExpBoostBattles', charges: 2 }
                ]
            }
        ]
    },

    astralSupplyDepot: {
        id: 'astralSupplyDepot',
        name: '星港补给站',
        icon: '🛰️',
        description: '巡天商队开放限时补给窗口，你可趁机采购高价值军需。',
        choices: [
            {
                text: '进入补给站',
                icon: '🧭',
                result: '开启高档临时商会',
                resultType: 'positive',
                effects: [
                    {
                        type: 'openTemporaryShop',
                        title: '星港补给站',
                        icon: '🛰️',
                        desc: '高阶军需窗口已开启，可从 4 个补给位中选择其一。',
                        offerCount: 4
                    }
                ]
            },
            {
                text: '领取通行补贴',
                icon: '🪙',
                result: '获得灵石与命环经验',
                resultType: 'neutral',
                effects: [
                    { type: 'gold', value: 35 },
                    { type: 'ringExp', value: 20 }
                ]
            }
        ]
    },

    medicRelayPost: {
        id: 'medicRelayPost',
        name: '战地医护中继站',
        icon: '🩺',
        description: '前线医疗队正在补给，愿与有经验的修士签订短期救护协约。',
        choices: [
            {
                text: '捐赠灵石换取支援',
                icon: '🪙',
                result: '消耗灵石，获得战后医护增益',
                resultType: 'positive',
                condition: { type: 'gold', min: 65 },
                effects: [
                    { type: 'gold', value: -65 },
                    { type: 'adventureBuff', buffId: 'victoryHealBoostBattles', charges: 2 }
                ]
            },
            {
                text: '协助急救值守',
                icon: '🩹',
                result: '损耗少量生命，获得命环经验与医护增益',
                resultType: 'neutral',
                condition: { type: 'hp', min: 16 },
                effects: [
                    { type: 'damage', value: 6 },
                    { type: 'ringExp', value: 24 },
                    { type: 'adventureBuff', buffId: 'victoryHealBoostBattles', charges: 1 }
                ]
            }
        ]
    },

    starlitFieldHospital: {
        id: 'starlitFieldHospital',
        name: '星辉野战医院',
        icon: '🏥',
        description: '星辉结界覆盖了整片营区，医官们正在筛选护卫契约。',
        choices: [
            {
                text: '签订医护护卫契',
                icon: '📄',
                result: '获得战后治疗与开场防线增益',
                resultType: 'positive',
                effects: [
                    { type: 'adventureBuff', buffId: 'victoryHealBoostBattles', charges: 3 },
                    { type: 'adventureBuff', buffId: 'openingBlockBoostBattles', charges: 1 }
                ]
            },
            {
                text: '接受付费疗程',
                icon: '💊',
                result: '消耗灵石，快速恢复生命',
                resultType: 'neutral',
                condition: { type: 'gold', min: 40 },
                effects: [
                    { type: 'gold', value: -40 },
                    { type: 'heal', value: 24 }
                ]
            }
        ]
    },

    riftAidConvoy: {
        id: 'riftAidConvoy',
        name: '裂隙救援车队',
        icon: '🚑',
        description: '一支穿梭裂隙的救援车队短暂停靠，他们愿出售应急补给。',
        choices: [
            {
                text: '进入救援补给点',
                icon: '🧰',
                result: '开启应急临时商会（保证出现低价补给）',
                resultType: 'positive',
                effects: [
                    {
                        type: 'openTemporaryShop',
                        title: '救援补给点',
                        icon: '🚑',
                        desc: '救援车队优先供应伤员，至少会出现一件低价应急补给。',
                        offerCount: 3,
                        forceRelief: true
                    }
                ]
            },
            {
                text: '协助转运伤员',
                icon: '🩹',
                result: '恢复生命并获得少量灵石',
                resultType: 'neutral',
                effects: [
                    { type: 'heal', value: 12 },
                    { type: 'gold', value: 20 }
                ]
            }
        ]
    },

    endlessChronicleBroker: {
        id: 'endlessChronicleBroker',
        name: '轮回纪要商',
        icon: '📓',
        description: '一名记述无尽轮回的商贩愿意出售“过往失败换来的经验”。',
        choices: [
            {
                text: '购入战历',
                icon: '💰',
                result: '消耗灵石，获得经验与开局节奏增益',
                resultType: 'positive',
                condition: { type: 'gold', min: 110 },
                effects: [
                    { type: 'gold', value: -110 },
                    { type: 'ringExp', value: 70 },
                    { type: 'adventureBuff', buffId: 'firstTurnDrawBoostBattles', charges: 1 },
                    { type: 'adventureBuff', buffId: 'firstTurnEnergyBoostBattles', charges: 1 }
                ]
            },
            {
                text: '以血换卷',
                icon: '🩸',
                result: '失去生命，换取更高经验与随机稀有卡',
                resultType: 'negative',
                condition: { type: 'hp', min: 18 },
                effects: [
                    { type: 'damage', value: 10 },
                    { type: 'ringExp', value: 95 },
                    { type: 'card', rarity: 'rare' }
                ]
            }
        ]
    },

    endlessStormSanctum: {
        id: 'endlessStormSanctum',
        name: '风暴静室',
        icon: '🌪️',
        description: '静室中心封着一团风暴核心，你可以平稳吸收，也可强行引爆。',
        choices: [
            {
                text: '平稳导流',
                icon: '🧘',
                result: '恢复生命并获得防线增益',
                resultType: 'positive',
                effects: [
                    { type: 'heal', value: 16 },
                    { type: 'adventureBuff', buffId: 'openingBlockBoostBattles', charges: 2 }
                ]
            },
            {
                text: '强引风暴',
                icon: '⚡',
                result: '进入高压试炼，回报显著提高',
                resultType: 'negative',
                effects: [
                    { type: 'trial', trialType: 'speedKill', rounds: 4, rewardMultiplier: 2.1 }
                ]
            }
        ]
    },

    endlessMutatorWorkshop: {
        id: 'endlessMutatorWorkshop',
        name: '异变工坊',
        icon: '🧪',
        description: '工坊匠师可以重配无尽军需，你需要为代价签字。',
        choices: [
            {
                text: '重配补给',
                icon: '🛒',
                result: '开启轮回补给窗口',
                resultType: 'positive',
                effects: [
                    {
                        type: 'openTemporaryShop',
                        title: '轮回补给库',
                        icon: '🧪',
                        desc: '工坊提供针对无尽作战的特殊补给。',
                        offerCount: 4,
                        forceRelief: true
                    }
                ]
            },
            {
                text: '拆售部件',
                icon: '💸',
                result: '立即获得灵石与战后悬赏增益',
                resultType: 'neutral',
                effects: [
                    { type: 'gold', value: 70 },
                    { type: 'adventureBuff', buffId: 'victoryGoldBoostBattles', charges: 1 }
                ]
            }
        ]
    },

    endlessMemoryVault: {
        id: 'endlessMemoryVault',
        name: '记忆封库',
        icon: '🗄️',
        description: '封库里堆满你上百次失败后的残留结晶，它们能被转化为力量。',
        choices: [
            {
                text: '提取结晶',
                icon: '🔮',
                result: '命环经验提升，并获得战后医护增益',
                resultType: 'positive',
                effects: [
                    { type: 'ringExp', value: 80 },
                    { type: 'adventureBuff', buffId: 'victoryHealBoostBattles', charges: 2 }
                ]
            },
            {
                text: '高压压缩',
                icon: '🗜️',
                result: '失去生命，换取史诗级构筑资源',
                resultType: 'negative',
                condition: { type: 'hp', min: 20 },
                effects: [
                    { type: 'damage', value: 12 },
                    { type: 'card', rarity: 'epic' },
                    { type: 'ringExp', value: 45 }
                ]
            }
        ]
    },

    endlessPressureValve: {
        id: 'endlessPressureValve',
        name: '稳压阀井',
        icon: '♨️',
        description: '阀井发出尖锐嗡鸣，你可以泄压求稳，也可继续加压换取收益。',
        choices: [
            {
                text: '紧急泄压',
                icon: '🧯',
                result: '降低轮回压力并恢复生命',
                resultType: 'positive',
                effects: [
                    { type: 'endlessPressure', value: -2 },
                    { type: 'heal', value: 14 }
                ]
            },
            {
                text: '超载运行',
                icon: '🔥',
                result: '提高轮回压力，换取灵石与经验',
                resultType: 'neutral',
                effects: [
                    { type: 'endlessPressure', value: 2 },
                    { type: 'gold', value: 85 },
                    { type: 'ringExp', value: 45 }
                ]
            }
        ]
    },

    endlessFaultLine: {
        id: 'endlessFaultLine',
        name: '断层军需带',
        icon: '🧰',
        description: '补给断层边缘出现临时军需站，你可以选择坚守或清压换补给。',
        choices: [
            {
                text: '固守防线',
                icon: '🛡️',
                result: '获得防线增益并略微降压',
                resultType: 'positive',
                effects: [
                    { type: 'adventureBuff', buffId: 'openingBlockBoostBattles', charges: 2 },
                    { type: 'endlessPressure', value: -1 }
                ]
            },
            {
                text: '清压换补给',
                icon: '🛒',
                result: '降低压力，开启救援货架',
                resultType: 'neutral',
                effects: [
                    { type: 'endlessPressure', value: -1 },
                    {
                        type: 'openTemporaryShop',
                        title: '断层军需带',
                        icon: '🧰',
                        desc: '军需官要求先降压再领补给。',
                        offerCount: 4,
                        forceRelief: true
                    }
                ]
            }
        ]
    },

    endlessOverclockAltar: {
        id: 'endlessOverclockAltar',
        name: '过载祭坛',
        icon: '🔥',
        description: '祭坛将压力转化为短时爆发力，你可以强行超频，也可以回路降温。',
        choices: [
            {
                text: '强行超频',
                icon: '⚡',
                result: '提升压力，换取灵石与首回合爆发',
                resultType: 'negative',
                effects: [
                    { type: 'endlessPressure', value: 2 },
                    { type: 'gold', value: 90 },
                    { type: 'adventureBuff', buffId: 'firstTurnEnergyBoostBattles', charges: 2 }
                ]
            },
            {
                text: '回路降温',
                icon: '🧊',
                result: '降低压力并恢复状态',
                resultType: 'positive',
                effects: [
                    { type: 'endlessPressure', value: -2 },
                    { type: 'heal', value: 12 },
                    { type: 'ringExp', value: 36 }
                ]
            }
        ]
    },

    thunderConductTrial: {
        id: 'thunderConductTrial',
        name: '导雷试场',
        icon: '⚡',
        description: '一处废弃导雷塔仍在运转，你可以借其校准“破窗连击”节奏。',
        choices: [
            {
                text: '引雷入体',
                icon: '🌩️',
                result: '承受雷灼，获得雷策核心卡',
                resultType: 'negative',
                condition: { type: 'hp', min: 12 },
                effects: [
                    { type: 'damage', value: 8 },
                    { type: 'card', cardId: 'lightningProbe' },
                    { type: 'ringExp', value: 16 }
                ]
            },
            {
                text: '标定破窗',
                icon: '🎯',
                result: '强化易伤窗口并获得破绽工具',
                resultType: 'positive',
                effects: [
                    { type: 'card', cardId: 'chainArc' },
                    { type: 'ringExp', value: 24 },
                    { type: 'adventureBuff', buffId: 'firstTurnEnergyBoostBattles', charges: 1 }
                ]
            }
        ]
    },

    stormchaserCamp: {
        id: 'stormchaserCamp',
        name: '逐雷营站',
        icon: '⛺',
        description: '营站记录了大量“雷策”战斗笔记，补给官愿意为你调整作战节奏。',
        choices: [
            {
                text: '校准回路',
                icon: '🔋',
                result: '获得首回合节奏增益',
                resultType: 'positive',
                effects: [
                    { type: 'adventureBuff', buffId: 'firstTurnEnergyBoostBattles', charges: 2 },
                    { type: 'adventureBuff', buffId: 'firstTurnDrawBoostBattles', charges: 1 }
                ]
            },
            {
                text: '稳态回路',
                icon: '🧊',
                result: '恢复生命并降低轮回压力',
                resultType: 'neutral',
                effects: [
                    { type: 'heal', value: 12 },
                    { type: 'endlessPressure', value: -1 }
                ]
            }
        ]
    },

    fulgurMarket: {
        id: 'fulgurMarket',
        name: '霆光黑市',
        icon: '🏮',
        description: '黑市商人专卖“高压战术”，价格昂贵但成效直接。',
        choices: [
            {
                text: '购买回路蓝图',
                icon: '📜',
                result: '消耗灵石，获得雷策进阶卡',
                resultType: 'neutral',
                condition: { type: 'gold', min: 90 },
                effects: [
                    { type: 'gold', value: -90 },
                    { type: 'card', cardId: 'exposedCircuit' }
                ]
            },
            {
                text: '出售战报',
                icon: '🧾',
                result: '获得灵石，但状态受损',
                resultType: 'negative',
                effects: [
                    { type: 'gold', value: 75 },
                    { type: 'damage', value: 6 }
                ]
            }
        ]
    },

    overclockSigil: {
        id: 'overclockSigil',
        name: '超频铭印',
        icon: '🛠️',
        description: '铭印会把压力直接转化为战力，你可以冒险超频，或选择保守调谐。',
        choices: [
            {
                text: '冒险超频',
                icon: '🔥',
                result: '压力提升，换取命环成长与稀有雷策卡',
                resultType: 'negative',
                effects: [
                    { type: 'endlessPressure', value: 1 },
                    { type: 'ringExp', value: 50 },
                    { type: 'card', cardId: 'skybreakerArray' }
                ]
            },
            {
                text: '保守调谐',
                icon: '🛡️',
                result: '恢复状态并获得稳态防线',
                resultType: 'positive',
                effects: [
                    { type: 'heal', value: 14 },
                    { type: 'card', cardId: 'stormWard' },
                    { type: 'endlessPressure', value: -1 }
                ]
            }
        ]
    },

    herbalPactShrine: {
        id: 'herbalPactShrine',
        name: '回生药坛',
        icon: '🌿',
        description: '药坛守望者提出交易：以代价换取更强续航手段。',
        choices: [
            {
                text: '草契疗护',
                icon: '💚',
                result: '大量恢复并获得回生基础卡',
                resultType: 'positive',
                effects: [
                    { type: 'heal', value: 18 },
                    { type: 'card', cardId: 'mendThread' }
                ]
            },
            {
                text: '燃脉急救',
                icon: '🩸',
                result: '损失生命，换取攻击性回生卡与灵石',
                resultType: 'neutral',
                condition: { type: 'hp', min: 14 },
                effects: [
                    { type: 'damage', value: 8 },
                    { type: 'card', cardId: 'transfuseStrike' },
                    { type: 'gold', value: 45 }
                ]
            }
        ]
    },

    lifestringClinic: {
        id: 'lifestringClinic',
        name: '续命医铺',
        icon: '🏥',
        description: '医铺可提供快速修整，但你需要在灵石与生命风险之间权衡。',
        choices: [
            {
                text: '付费续命',
                icon: '💰',
                result: '消耗灵石，恢复大量生命并点燃营火',
                resultType: 'positive',
                condition: { type: 'gold', min: 80 },
                effects: [
                    { type: 'gold', value: -80 },
                    { type: 'heal', value: 30 },
                    { type: 'openCampfire' }
                ]
            },
            {
                text: '以术换术',
                icon: '🧪',
                result: '承受痛楚，换取回生进阶卡与命环经验',
                resultType: 'negative',
                condition: { type: 'hp', min: 16 },
                effects: [
                    { type: 'damage', value: 10 },
                    { type: 'card', cardId: 'lifelinkWeave' },
                    { type: 'ringExp', value: 24 }
                ]
            }
        ]
    },

    bloodloomGarden: {
        id: 'bloodloomGarden',
        name: '血华药圃',
        icon: '🌺',
        description: '药圃中的血华可炼成进攻药剂，也可调制长线恢复方案。',
        choices: [
            {
                text: '炼制战剂',
                icon: '⚗️',
                result: '失去生命并获得进攻成长',
                resultType: 'negative',
                condition: { type: 'hp', min: 12 },
                effects: [
                    { type: 'damage', value: 8 },
                    { type: 'card', cardId: 'bloodBloom' },
                    { type: 'permaBuff', stat: 'strength', value: 1 }
                ]
            },
            {
                text: '调和药浴',
                icon: '🛁',
                result: '恢复生命并获得战后恢复增益',
                resultType: 'positive',
                effects: [
                    { type: 'heal', value: 16 },
                    { type: 'adventureBuff', buffId: 'victoryHealBoostBattles', charges: 2 }
                ]
            }
        ]
    },

    hospiceRelay: {
        id: 'hospiceRelay',
        name: '护生转运站',
        icon: '🚑',
        description: '转运站在高压路线上提供临时补给与护送服务。',
        choices: [
            {
                text: '设立医站',
                icon: '🛒',
                result: '开启临时补给并稳定压力',
                resultType: 'neutral',
                effects: [
                    {
                        type: 'openTemporaryShop',
                        title: '护生补给架',
                        icon: '🧰',
                        desc: '补给医师提供续航向临时交易。',
                        offerCount: 4,
                        forceRelief: true
                    },
                    { type: 'endlessPressure', value: -1 }
                ]
            },
            {
                text: '护送伤员',
                icon: '🕊️',
                result: '恢复生命并获得护势增益',
                resultType: 'positive',
                effects: [
                    { type: 'heal', value: 20 },
                    { type: 'adventureBuff', buffId: 'openingBlockBoostBattles', charges: 2 }
                ]
            }
        ]
    },

    hiddenSpring: {
        id: 'hiddenSpring',
        name: '隐泉',
        icon: '💧',
        description: '泉眼灵气温润，短暂停驻可恢复状态。',
        choices: [
            {
                text: '静养',
                icon: '🧘',
                result: '恢复生命并清除一层压力',
                resultType: 'positive',
                effects: [
                    { type: 'heal', value: 20 },
                    { type: 'gold', value: 20 }
                ]
            },
            {
                text: '提炼灵液',
                icon: '🧪',
                result: '消耗生命，提升抽牌',
                resultType: 'neutral',
                condition: { type: 'hp', min: 20 },
                effects: [
                    { type: 'damage', value: 10 },
                    { type: 'permaBuff', stat: 'draw', value: 1 }
                ]
            }
        ]
    }
};

// 事件池 - 按类型分类
const EVENT_POOL = {
    common: ['mysteryChest', 'spiritVein', 'wanderingSmith', 'hiddenSpring', 'brokenPavilion', 'mirrorNeedleDojo', 'voidBookkeeper', 'shieldRelayBeacon', 'nightWatchCamp', 'emberCampSignal', 'leylineConfluence', 'medicRelayPost', 'riftAidConvoy', 'stormchaserCamp', 'herbalPactShrine', 'oathscarShrine', 'ghostFurnace'],
    uncommon: ['injuredCultivator', 'mysteryStele', 'celestialGamble', 'bloodMoonRitual', 'swordTomb', 'wanderingOracle', 'bloodForgeCovenant', 'shatteredCompass', 'ashLedgerTrial', 'ironCitadelPact', 'caravanQuartermaster', 'floatingMarketRift', 'astralSupplyDepot', 'starlitFieldHospital', 'convergenceRelay', 'harmonicAnvil', 'thunderConductTrial', 'fulgurMarket', 'lifestringClinic', 'bloodloomGarden', 'griefWritArchive', 'marionetteArmory'],
    rare: ['mysteriousMerchant', 'ancientAltar', 'fateChoice', 'ancientLibrary', 'voidRift', 'spiritAuction', 'fallenFormation', 'destinyMirror', 'demonContract', 'starObservation', 'debtboundAnvil', 'convergenceRitual', 'aegisTribunal', 'frontierContractBoard', 'artifactConfluxBazaar', 'overclockSigil', 'hospiceRelay', 'blackbannerExecution', 'ancestralFoundry'],
    special: ['trialGround']
};

const ENDLESS_EVENT_POOL = {
    common: ['endlessChronicleBroker', 'endlessMutatorWorkshop', 'endlessStormSanctum', 'endlessPressureValve', 'endlessOverclockAltar'],
    rare: ['endlessMemoryVault', 'endlessFaultLine', 'floatingMarketRift', 'astralSupplyDepot', 'riftAidConvoy']
};

const ENDLESS_MUTATOR_EVENT_BIAS = {
    war_market: ['floatingMarketRift', 'endlessMutatorWorkshop', 'caravanQuartermaster'],
    void_tax: ['endlessChronicleBroker', 'endlessMemoryVault', 'endlessPressureValve', 'riftAidConvoy'],
    trial_inferno: ['endlessStormSanctum', 'trialGround', 'leylineConfluence', 'endlessOverclockAltar'],
    ashen_camp: ['emberCampSignal', 'starlitFieldHospital', 'medicRelayPost', 'endlessFaultLine'],
    iron_wall: ['shieldRelayBeacon', 'nightWatchCamp', 'aegisTribunal'],
    berserker_tide: ['bloodForgeCovenant', 'ashLedgerTrial', 'frontierContractBoard', 'endlessPressureValve', 'endlessOverclockAltar']
};

const ARCHETYPE_EVENT_POOLS = {
    hemorrhage: ['bloodForgeCovenant', 'shatteredCompass', 'debtboundAnvil'],
    precision: ['mirrorNeedleDojo', 'shatteredCompass', 'bloodForgeCovenant', 'caravanQuartermaster', 'floatingMarketRift', 'astralSupplyDepot'],
    entropy: ['voidBookkeeper', 'ashLedgerTrial', 'convergenceRitual', 'frontierContractBoard', 'floatingMarketRift', 'astralSupplyDepot'],
    stormcraft: ['thunderConductTrial', 'stormchaserCamp', 'fulgurMarket', 'overclockSigil', 'convergenceRelay', 'harmonicAnvil'],
    vitalweave: ['herbalPactShrine', 'lifestringClinic', 'bloodloomGarden', 'hospiceRelay', 'medicRelayPost', 'starlitFieldHospital', 'riftAidConvoy'],
    bulwark: ['shieldRelayBeacon', 'ironCitadelPact', 'aegisTribunal', 'nightWatchCamp', 'emberCampSignal', 'leylineConfluence', 'medicRelayPost', 'starlitFieldHospital', 'riftAidConvoy'],
    cursebound: ['oathscarShrine', 'griefWritArchive', 'blackbannerExecution', 'voidBookkeeper', 'ashLedgerTrial', 'frontierContractBoard'],
    soulforge: ['ghostFurnace', 'marionetteArmory', 'ancestralFoundry', 'harmonicAnvil', 'artifactConfluxBazaar', 'shieldRelayBeacon']
};

const FATE_PATH_EVENT_POOLS = {
    convergence: ['convergenceRelay', 'harmonicAnvil', 'artifactConfluxBazaar'],
    resonance: ['stormchaserCamp', 'thunderConductTrial', 'fulgurMarket'],
    wisdom: ['lifestringClinic', 'artifactConfluxBazaar', 'ancientLibrary'],
    destruction: ['overclockSigil', 'bloodForgeCovenant', 'bloodloomGarden']
};

function canUseDebugEventHooks() {
    if (typeof window === 'undefined') return false;
    if (window.__ALLOW_DEBUG_EVENT_HOOKS__ === true) return true;
    const host = window.location && window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const isGameDebugMode = !!(window.game && window.game.debugMode);
    return isLocalHost || isGameDebugMode;
}

// 获取随机事件
function getRandomEvent() {
    // Test hook: allow deterministic event replay in browser audits
    if (canUseDebugEventHooks()) {
        if (Array.isArray(window.__debugEventQueue) && window.__debugEventQueue.length > 0) {
            const forcedId = window.__debugEventQueue.shift();
            if (forcedId && EVENTS[forcedId]) return { ...EVENTS[forcedId] };
        }
        if (window.__debugEventId && EVENTS[window.__debugEventId]) {
            return { ...EVENTS[window.__debugEventId] };
        }
    }

    let endlessActive = false;
    let endlessCycle = 0;
    let endlessMutators = [];
    try {
        endlessActive = !!(window && window.game && typeof window.game.isEndlessActive === 'function' && window.game.isEndlessActive());
        const endlessState = window?.game?.ensureEndlessState?.() || {};
        endlessCycle = Math.max(0, Math.floor(Number(endlessState.currentCycle) || 0));
        endlessMutators = Array.isArray(endlessState.activeMutators)
            ? endlessState.activeMutators.filter((id) => typeof id === 'string')
            : [];
    } catch (e) {
        endlessActive = false;
        endlessCycle = 0;
        endlessMutators = [];
    }
    if (endlessActive) {
        if (endlessMutators.length > 0 && Math.random() < 0.38) {
            const biasPool = [];
            endlessMutators.forEach((mutatorId) => {
                const mapped = ENDLESS_MUTATOR_EVENT_BIAS[mutatorId];
                if (!Array.isArray(mapped)) return;
                mapped.forEach((eventId) => {
                    if (EVENTS[eventId]) biasPool.push(eventId);
                });
            });
            if (biasPool.length > 0) {
                const uniquePool = Array.from(new Set(biasPool));
                const forcedId = uniquePool[Math.floor(Math.random() * uniquePool.length)];
                if (forcedId && EVENTS[forcedId]) {
                    return JSON.parse(JSON.stringify(EVENTS[forcedId]));
                }
            }
        }
        const endlessRoll = Math.random();
        if (endlessRoll < 0.42) {
            const rareRate = Math.min(0.42, 0.18 + endlessCycle * 0.015);
            const chooseRare = Math.random() < rareRate;
            const endlessPool = chooseRare ? ENDLESS_EVENT_POOL.rare : ENDLESS_EVENT_POOL.common;
            if (Array.isArray(endlessPool) && endlessPool.length > 0) {
                const endlessEventId = endlessPool[Math.floor(Math.random() * endlessPool.length)];
                if (EVENTS[endlessEventId]) {
                    return JSON.parse(JSON.stringify(EVENTS[endlessEventId]));
                }
            }
        }
    }

    // 牌组成型后，事件投放向对应流派轻度偏置，提升构筑连贯性
    // 命环路径偏置：使路径玩法在地图层面有更明显的持续反馈
    let preferredPath = null;
    let pathDoctrineTier = 0;
    try {
        preferredPath = window?.game?.player?.fateRing?.path || null;
        const doctrineProfile = window?.game?.player?.getPathDoctrineProfile?.() || null;
        if (doctrineProfile && typeof doctrineProfile === 'object') {
            if (!preferredPath && typeof doctrineProfile.path === 'string') {
                preferredPath = doctrineProfile.path;
            }
            if (doctrineProfile.path === preferredPath) {
                pathDoctrineTier = Math.max(0, Math.floor(Number(doctrineProfile.tier) || 0));
            }
        }
    } catch (e) {
        preferredPath = null;
        pathDoctrineTier = 0;
    }
    const pathPool = preferredPath && FATE_PATH_EVENT_POOLS[preferredPath]
        ? FATE_PATH_EVENT_POOLS[preferredPath].filter(id => !!EVENTS[id])
        : [];
    const pathBiasChance = Math.min(
        0.62,
        0.28 + pathDoctrineTier * 0.07 + (preferredPath === 'wisdom' ? pathDoctrineTier * 0.02 : 0)
    );
    if (pathPool.length > 0 && Math.random() < pathBiasChance) {
        const pathEventId = pathPool[Math.floor(Math.random() * pathPool.length)];
        return JSON.parse(JSON.stringify(EVENTS[pathEventId]));
    }

    // 牌组成型后，事件投放向对应流派轻度偏置，提升构筑连贯性
    let preferredArchetype = null;
    try {
        const deck = window && window.game && window.game.player ? window.game.player.deck : null;
        if (Array.isArray(deck) && deck.length > 0 && typeof inferDeckArchetype === 'function') {
            preferredArchetype = inferDeckArchetype(deck);
        }
    } catch (e) {
        preferredArchetype = null;
    }
    const archetypePool = preferredArchetype && ARCHETYPE_EVENT_POOLS[preferredArchetype]
        ? ARCHETYPE_EVENT_POOLS[preferredArchetype].filter(id => !!EVENTS[id])
        : [];
    const archetypeBiasBoost = (preferredPath === 'wisdom' && pathDoctrineTier > 0)
        ? pathDoctrineTier * 0.05
        : 0;
    if (archetypePool.length > 0 && Math.random() < Math.min(0.6, 0.35 + archetypeBiasBoost)) {
        const boostedId = archetypePool[Math.floor(Math.random() * archetypePool.length)];
        return JSON.parse(JSON.stringify(EVENTS[boostedId]));
    }

    const roll = Math.random();
    let pool;

    if (roll < 0.4) pool = EVENT_POOL.common;
    else if (roll < 0.7) pool = EVENT_POOL.uncommon;
    else if (roll < 0.95) pool = EVENT_POOL.rare;
    else pool = EVENT_POOL.special;

    const eventId = pool[Math.floor(Math.random() * pool.length)];
    // 中文注释：深拷贝事件，防止事件流程在运行时改写全局模板（尤其 choices/effects 数组）
    return EVENTS[eventId] ? JSON.parse(JSON.stringify(EVENTS[eventId])) : null;
}
