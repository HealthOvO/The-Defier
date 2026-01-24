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
        bgImage: 'linear-gradient(135deg, rgba(255,215,0,0.1) 0%, rgba(0,0,0,0.8) 100%)'
    },
    xiangYe: {
        id: 'xiangYe',
        name: '香叶',
        title: '被诅咒的医者',
        avatar: '🌿',
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
        bgImage: 'linear-gradient(135deg, rgba(76,175,80,0.1) 0%, rgba(0,0,0,0.8) 100%)'
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
        bgImage: 'linear-gradient(135deg, rgba(255,87,34,0.1) 0%, rgba(0,0,0,0.8) 100%)'
    },
    yanHan: {
        id: 'yanHan',
        name: '严寒',
        title: '命环学者',
        avatar: '📚',
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
        bgImage: 'linear-gradient(135deg, rgba(33,150,243,0.1) 0%, rgba(0,0,0,0.8) 100%)'
    }
};
