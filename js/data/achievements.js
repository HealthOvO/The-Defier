/**
 * The Defier 2.0 - 成就数据
 */

const ACHIEVEMENTS = {
    // ==================== 战斗成就 ====================
    firstBlood: {
        id: 'firstBlood',
        name: '初出茅庐',
        description: '完成首场战斗',
        icon: '⚔️',
        category: 'combat',
        condition: { type: 'enemiesDefeated', value: 1 },
        reward: { type: 'gold', value: 20 }
    },

    veteran: {
        id: 'veteran',
        name: '百战老兵',
        description: '击败50个敌人',
        icon: '🏅',
        category: 'combat',
        condition: { type: 'enemiesDefeated', value: 50 },
        reward: { type: 'card', cardId: 'battleCry' }
    },

    warlord: {
        id: 'warlord',
        name: '万夫莫敌',
        description: '击败200个敌人',
        icon: '👑',
        category: 'combat',
        condition: { type: 'enemiesDefeated', value: 200 },
        reward: { type: 'startBonus', stat: 'strength', value: 1 }
    },

    oneShot: {
        id: 'oneShot',
        name: '一击必杀',
        description: '单次造成50点以上伤害',
        icon: '💥',
        category: 'combat',
        condition: { type: 'singleDamage', value: 50 },
        reward: { type: 'card', cardId: 'ragingBlow' }
    },

    comboMaster: {
        id: 'comboMaster',
        name: '连击大师',
        description: '达成5连击',
        icon: '🔥',
        category: 'combat',
        condition: { type: 'maxCombo', value: 5 },
        reward: { type: 'card', rarity: 'rare' }
    },

    untouchable: {
        id: 'untouchable',
        name: '毫发无伤',
        description: '一场战斗中不受任何伤害',
        icon: '✨',
        category: 'combat',
        condition: { type: 'noDamageBattle', value: 1 },
        reward: { type: 'card', cardId: 'spaceRift' }
    },

    bossSlayer: {
        id: 'bossSlayer',
        name: 'BOSS猎手',
        description: '击败5个BOSS',
        icon: '👹',
        category: 'combat',
        condition: { type: 'bossesDefeated', value: 5 },
        reward: { type: 'startBonus', stat: 'maxHp', value: 10 }
    },

    // ==================== 法则成就 ====================
    firstLaw: {
        id: 'firstLaw',
        name: '初窥门径',
        description: '盗取第一个法则',
        icon: '🔮',
        category: 'law',
        condition: { type: 'lawsCollected', value: 1 },
        reward: { type: 'ringExp', value: 30 }
    },

    lawCollector: {
        id: 'lawCollector',
        name: '法则收藏家',
        description: '收集5种法则',
        icon: '📚',
        category: 'law',
        condition: { type: 'lawsCollected', value: 5 },
        reward: { type: 'card', cardId: 'voidEmbrace' }
    },

    lawMaster: {
        id: 'lawMaster',
        name: '法则大师',
        description: '收集所有法则',
        icon: '🌟',
        category: 'law',
        condition: { type: 'lawsCollected', value: 10 },
        reward: { type: 'unlock', unlockId: 'secretLaw' }
    },

    defyFate: {
        id: 'defyFate',
        name: '逆天改命',
        description: '装载4个法则到命环',
        icon: '💫',
        category: 'law',
        condition: { type: 'loadedLaws', value: 4 },
        reward: { type: 'startBonus', stat: 'stealChance', value: 0.1 }
    },

    thunderPath: {
        id: 'thunderPath',
        name: '雷霆之道',
        description: '收集雷法残章',
        icon: '⚡',
        category: 'law',
        condition: { type: 'specificLaw', lawId: 'thunderLaw' },
        reward: { type: 'gold', value: 50 }
    },

    timeLord: {
        id: 'timeLord',
        name: '时间主宰',
        description: '收集时间静止法则',
        icon: '⏱️',
        category: 'law',
        condition: { type: 'specificLaw', lawId: 'timeStop' },
        reward: { type: 'card', rarity: 'legendary' }
    },

    // ==================== 探索成就 ====================
    realm1Clear: {
        id: 'realm1Clear',
        name: '踏破凡尘',
        description: '通关第一重天',
        icon: '🏔️',
        category: 'explore',
        condition: { type: 'realmCleared', value: 1 },
        reward: { type: 'gold', value: 100 }
    },

    realm3Clear: {
        id: 'realm3Clear',
        name: '筑基有成',
        description: '通关第三重天',
        icon: '⛰️',
        category: 'explore',
        condition: { type: 'realmCleared', value: 3 },
        reward: { type: 'card', rarity: 'epic' }
    },

    realm5Clear: {
        id: 'realm5Clear',
        name: '登峰造极',
        description: '通关第五重天',
        icon: '🗻',
        category: 'explore',
        condition: { type: 'realmCleared', value: 5 },
        reward: { type: 'unlock', unlockId: 'hardMode' }
    },

    allNodeTypes: {
        id: 'allNodeTypes',
        name: '全图探索',
        description: '访问所有类型的节点',
        icon: '🗺️',
        category: 'explore',
        condition: { type: 'nodeTypesVisited', value: 6 },
        reward: { type: 'startBonus', stat: 'gold', value: 30 }
    },

    eventMaster: {
        id: 'eventMaster',
        name: '事件达人',
        description: '完成20次事件',
        icon: '❓',
        category: 'explore',
        condition: { type: 'eventsCompleted', value: 20 },
        reward: { type: 'card', rarity: 'rare' }
    },

    // ==================== 收集成就 ====================
    cardCollector: {
        id: 'cardCollector',
        name: '卡牌收藏家',
        description: '获得30种不同卡牌',
        icon: '🃏',
        category: 'collect',
        condition: { type: 'uniqueCards', value: 30 },
        reward: { type: 'cardBack', backId: 'golden' }
    },

    wealthy: {
        id: 'wealthy',
        name: '财神附体',
        description: '累计获得5000灵石',
        icon: '💰',
        category: 'collect',
        condition: { type: 'totalGold', value: 5000 },
        reward: { type: 'startBonus', stat: 'gold', value: 50 }
    },

    deckMaster: {
        id: 'deckMaster',
        name: '牌组大师',
        description: '单局牌组达到25张',
        icon: '📖',
        category: 'collect',
        condition: { type: 'deckSize', value: 25 },
        reward: { type: 'card', cardId: 'fortuneWheel' }
    },

    minimalist: {
        id: 'minimalist',
        name: '极简主义',
        description: '用不超过10张牌通关一层',
        icon: '🎯',
        category: 'collect',
        condition: { type: 'minDeckClear', value: 10 },
        reward: { type: 'card', rarity: 'legendary' }
    },

    // ==================== 隐藏成就 ====================
    luckyOne: {
        id: 'luckyOne',
        name: '天选之人',
        description: '首次盗取就成功',
        icon: '🍀',
        category: 'hidden',
        condition: { type: 'firstStealSuccess', value: 1 },
        reward: { type: 'startBonus', stat: 'stealChance', value: 0.05 },
        hidden: true
    },

    survivor: {
        id: 'survivor',
        name: '绝处逢生',
        description: '在1HP时击败BOSS',
        icon: '💀',
        category: 'hidden',
        condition: { type: 'lowHpBossKill', value: 1 },
        reward: { type: 'card', cardId: 'miracleHeal' },
        hidden: true
    },

    speedrunner: {
        id: 'speedrunner',
        name: '速通达人',
        description: '10分钟内通关一层',
        icon: '⏰',
        category: 'hidden',
        condition: { type: 'speedClear', value: 600 },
        reward: { type: 'startBonus', stat: 'draw', value: 1 },
        hidden: true
    }
};

// 成就分类
const ACHIEVEMENT_CATEGORIES = {
    combat: { name: '战斗成就', icon: '⚔️' },
    law: { name: '法则成就', icon: '🔮' },
    explore: { name: '探索成就', icon: '🗺️' },
    collect: { name: '收集成就', icon: '🃏' },
    hidden: { name: '隐藏成就', icon: '❓' }
};

// 检查成就是否完成
function checkAchievement(achievementId, playerStats) {
    const achievement = ACHIEVEMENTS[achievementId];
    if (!achievement) return false;

    const condition = achievement.condition;
    const stat = playerStats[condition.type] || 0;

    return stat >= condition.value;
}

// 获取成就奖励描述
function getAchievementRewardText(achievement) {
    const reward = achievement.reward;
    switch (reward.type) {
        case 'gold':
            return `+${reward.value} 灵石`;
        case 'card':
            if (reward.cardId) {
                return `获得卡牌: ${CARDS[reward.cardId]?.name || '未知'}`;
            }
            return `获得${reward.rarity === 'legendary' ? '传说' : reward.rarity === 'epic' ? '史诗' : '稀有'}卡牌`;
        case 'ringExp':
            return `命环经验 +${reward.value}`;
        case 'startBonus':
            return `永久起始加成`;
        case 'unlock':
            return `解锁新内容`;
        case 'cardBack':
            return `解锁专属卡背`;
        default:
            return '神秘奖励';
    }
}

// 获取已完成成就数量
function getCompletedAchievementsCount(unlockedAchievements) {
    return Object.keys(ACHIEVEMENTS).filter(id =>
        unlockedAchievements.includes(id)
    ).length;
}

// 获取成就总数
function getTotalAchievementsCount() {
    return Object.keys(ACHIEVEMENTS).filter(id =>
        !ACHIEVEMENTS[id].hidden
    ).length;
}
