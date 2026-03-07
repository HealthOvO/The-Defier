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
    common: ['mysteryChest', 'spiritVein', 'wanderingSmith', 'hiddenSpring', 'brokenPavilion', 'mirrorNeedleDojo', 'voidBookkeeper', 'shieldRelayBeacon'],
    uncommon: ['injuredCultivator', 'mysteryStele', 'celestialGamble', 'bloodMoonRitual', 'swordTomb', 'wanderingOracle', 'bloodForgeCovenant', 'shatteredCompass', 'ashLedgerTrial', 'ironCitadelPact'],
    rare: ['mysteriousMerchant', 'ancientAltar', 'fateChoice', 'ancientLibrary', 'voidRift', 'spiritAuction', 'fallenFormation', 'destinyMirror', 'demonContract', 'starObservation', 'debtboundAnvil', 'convergenceRitual', 'aegisTribunal'],
    special: ['trialGround']
};

const ARCHETYPE_EVENT_POOLS = {
    hemorrhage: ['bloodForgeCovenant', 'shatteredCompass', 'debtboundAnvil'],
    precision: ['mirrorNeedleDojo', 'shatteredCompass', 'bloodForgeCovenant'],
    entropy: ['voidBookkeeper', 'ashLedgerTrial', 'convergenceRitual'],
    bulwark: ['shieldRelayBeacon', 'ironCitadelPact', 'aegisTribunal']
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
    if (archetypePool.length > 0 && Math.random() < 0.35) {
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
