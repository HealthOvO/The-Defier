/**
 * The Defier - 角色数据
 * 定义可选角色的属性、初始卡组和特性
 */

const CHARACTERS = {
    linFeng: {
        id: 'linFeng',
        name: '林风',
        title: '逆命者',
        avatar: '🤺',
        image: 'assets/images/characters/lin_feng.png',
        description: '命环可以进化的逆命者，每次进化都伴随着巨大的风险与机遇。',
        stats: {
            maxHp: 80,
            gold: 100,
            energy: 3
        },
        // 初始套牌：替换部分基础牌为专属牌
        deck: ['strike', 'strike', 'strike', 'strike', 'defiantWill', 'defend', 'defend', 'defend', 'defend', 'spiritBoost'],
        relic: {
            id: 'fateRing',
            name: '逆命之环',
            desc: '每次战斗胜利获得额外命环经验 (+20 + 5x等级)。'
        },
        themeColor: 'var(--accent-gold)',
        bgImage: 'linear-gradient(135deg, rgba(255,215,0,0.1) 0%, rgba(0,0,0,0.8) 100%)',
        activeSkillId: 'heavensDefiance'
    },
    xiangYe: {
        id: 'xiangYe',
        name: '香叶',
        title: '被诅咒的医者',
        avatar: '🌿',
        image: 'assets/images/characters/xiang_ye.png',
        description: '身负“逆生咒”的医者，血液中流淌着治愈法则，却需时刻压制体内的力量。',
        stats: {
            maxHp: 65,
            gold: 100,
            energy: 3
        },
        // 初始套牌：加入治愈之触
        deck: ['strike', 'strike', 'strike', 'strike', 'poisonTouch', 'defend', 'defend', 'defend', 'healingTouch', 'minorHeal'],
        relic: {
            id: 'healingBlood',
            name: '治愈之血',
            desc: '回合开始时，回复 2+(等级/3) 点生命值。'
        },
        themeColor: 'var(--accent-green)',
        bgImage: 'linear-gradient(135deg, rgba(76,175,80,0.1) 0%, rgba(0,0,0,0.8) 100%)',
        activeSkillId: 'lifeBloom'
    },
    wuYu: {
        id: 'wuYu',
        name: '无欲',
        title: '苦行僧',
        avatar: '📿',
        description: '脱离宗门的佛门子弟，修习金刚不坏之身，誓要荡平世间黑暗。',
        stats: {
            maxHp: 90,
            gold: 100,
            energy: 3
        },
        // 初始套牌：加入金刚怒目，保留铁布衫
        deck: ['monkStrike', 'monkStrike', 'monkStrike', 'vajraGlare', 'strike', 'defend', 'defend', 'defend', 'defend', 'ironSkin'],
        relic: {
            id: 'vajraBody',
            name: '金刚法相',
            desc: '战斗开始时，获得 6+等级 点护盾。'
        },
        themeColor: 'var(--accent-red)', // Orange-ish Red
        bgImage: 'linear-gradient(135deg, rgba(255,87,34,0.1) 0%, rgba(0,0,0,0.8) 100%)',
        activeSkillId: 'vajraIndestructible',
        image: 'assets/images/characters/wuyu.png'
    },
    yanHan: {
        id: 'yanHan',
        name: '严寒',
        title: '命环学者',
        avatar: 'assets/images/characters/yan_han.png',
        description: '潜心研究命环的学者，掌握着早已失传的古老知识，试图用智慧解开命运的谜题。',
        stats: {
            maxHp: 70,
            gold: 150,
            energy: 3
        },
        // 初始套牌：加入命环解析
        deck: ['strike', 'strike', 'strike', 'defend', 'defend', 'defend', 'meditation', 'spiritBoost', 'quickDraw', 'ringAnalysis'],
        relic: {
            id: 'scholarLens',
            name: '真理之镜',
            desc: '战斗开始时，随机获得1张0费技能牌 (5级后获得2张)。'
        },
        themeColor: '#2196F3',
        bgImage: 'linear-gradient(135deg, rgba(33,150,243,0.1) 0%, rgba(0,0,0,0.8) 100%)',
        activeSkillId: 'absoluteTruth'
    },
    moChen: {
        id: 'moChen',
        name: '墨尘',
        title: '星律巡使',
        avatar: '🌠',
        description: '游走于诸天裂隙的巡使，擅长以命环律动叠加战术节奏，越战越强。',
        stats: {
            maxHp: 74,
            gold: 120,
            energy: 3
        },
        deck: ['strike', 'strike', 'defend', 'defend', 'defend', 'spiritBoost', 'starNeedle', 'omenBarrier', 'ringCatalyst', 'quickDraw'],
        relic: {
            id: 'starsealCompass',
            name: '星封罗盘',
            desc: '战斗开始时奶糖上限外 +1；每回合首次打出技能牌，额外抽1张牌。'
        },
        themeColor: '#8aa4ff',
        bgImage: 'linear-gradient(135deg, rgba(76, 104, 255, 0.20) 0%, rgba(0,0,0,0.82) 100%)',
        activeSkillId: 'starOath'
    },
    ningXuan: {
        id: 'ningXuan',
        name: '宁玄',
        title: '灵器行者',
        avatar: '🪬',
        description: '游历诸界的灵器行者，擅长以法宝与命环同频，将攻防节奏压入同一回合。',
        stats: {
            maxHp: 78,
            gold: 110,
            energy: 3
        },
        deck: ['strike', 'strike', 'defend', 'defend', 'defend', 'spiritBoost', 'artifactBolt', 'echoWard', 'ringInfusion', 'quickDraw'],
        relic: {
            id: 'artifactPulse',
            name: '灵器脉印',
            desc: '战斗开始时获得6点护盾；每回合首次打出攻击牌，获得1点灵力。'
        },
        themeColor: '#4ecdc4',
        bgImage: 'linear-gradient(135deg, rgba(47, 209, 182, 0.22) 0%, rgba(0,0,0,0.82) 100%)',
        activeSkillId: 'artifactOverdrive'
    }
};
