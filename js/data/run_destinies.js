/**
 * The Defier - 命格谱系
 * 开局提供 3 选 1 的轻量构筑身份。
 */

const RUN_DESTINIES = {
    foldedEdge: {
        id: 'foldedEdge',
        name: '折锋',
        icon: '🗡️',
        category: '爆发',
        description: '将第一击磨到极致，先手即分高下。',
        playstyle: '首击增伤，适合快节奏开局与单点处决。',
        affinities: ['linFeng', 'moChen', 'ningXuan'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '每场战斗首次攻击伤害 +4。',
                effects: { firstAttackBonusPerBattle: 4 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '每场战斗首次攻击伤害 +7，首回合抽牌 +1。',
                effects: { firstAttackBonusPerBattle: 7, firstTurnDraw: 1 }
            }
        ]
    },
    rebelScale: {
        id: 'rebelScale',
        name: '逆鳞',
        icon: '🐉',
        category: '爆发',
        description: '越接近绝境，越能逼出锋芒。',
        playstyle: '低血增伤，适合压血博弈与反扑型构筑。',
        affinities: ['linFeng', 'wuYu', 'shenYeBai'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '生命低于 50% 时，造成伤害 +25%。',
                effects: { lowHpThreshold: 0.5, lowHpDamageBonusPct: 0.25 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '生命低于 55% 时，造成伤害 +40%。',
                effects: { lowHpThreshold: 0.55, lowHpDamageBonusPct: 0.4 }
            }
        ]
    },
    markHunter: {
        id: 'markHunter',
        name: '猎脉',
        icon: '🎯',
        category: '爆发',
        description: '专门追击露出破绽的目标。',
        playstyle: '强化破绽与易伤窗口，适合精准流与雷策流。',
        affinities: ['linFeng', 'moChen', 'yanHan'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '攻击带有破绽的目标时额外伤害 +4。',
                effects: { markedBonusDamage: 4 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '攻击带有破绽的目标时额外伤害 +7，并对易伤目标伤害 +2。',
                effects: { markedBonusDamage: 7, vulnerableBonusDamage: 2 }
            }
        ]
    },
    emberHeart: {
        id: 'emberHeart',
        name: '烬心',
        icon: '🔥',
        category: '爆发',
        description: '以灼热灵息换取第一回合的猛攻。',
        playstyle: '首回合回能与压制，适合主动建立节奏。',
        affinities: ['linFeng', 'xiangYe', 'moChen'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '首回合灵力 +1。',
                effects: { firstTurnEnergy: 1 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '首回合灵力 +1，首次攻击伤害 +3。',
                effects: { firstTurnEnergy: 1, firstAttackBonusPerBattle: 3 }
            }
        ]
    },
    deepMeridian: {
        id: 'deepMeridian',
        name: '玄脉',
        icon: '🌊',
        category: '续航',
        description: '多余的生机不会浪费，而会凝成护身灵幕。',
        playstyle: '溢出治疗转护盾，适合回生和防守流。',
        affinities: ['xiangYe', 'wuYu', 'ningXuan'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '溢出治疗的 100% 转化为护盾。',
                effects: { overhealToBlockRatio: 1 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '溢出治疗的 150% 转化为护盾。',
                effects: { overhealToBlockRatio: 1.5 }
            }
        ]
    },
    returningTide: {
        id: 'returningTide',
        name: '归潮',
        icon: '💧',
        category: '续航',
        description: '气血见底时，灵潮自会回返。',
        playstyle: '低血自动回生，适合耐久与资源战。',
        affinities: ['xiangYe', 'wuYu', 'yanHan'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '回合开始时，若生命低于 45%，回复 3 点生命。',
                effects: { turnStartHealBelowPct: 0.45, turnStartHealAmount: 3 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '回合开始时，若生命低于 50%，回复 5 点生命。',
                effects: { turnStartHealBelowPct: 0.5, turnStartHealAmount: 5 }
            }
        ]
    },
    soulAnchor: {
        id: 'soulAnchor',
        name: '镇魄',
        icon: '🛡️',
        category: '续航',
        description: '先立其身，再图后胜。',
        playstyle: '开场护盾与首段防线，适合阵御和防反。',
        affinities: ['wuYu', 'ningXuan', 'yanHan'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '战斗开始时获得 8 护盾。',
                effects: { openingBlock: 8 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '战斗开始时获得 12 护盾，首次获得护盾时额外 +30%。',
                effects: { openingBlock: 12, firstBlockGainBonusPct: 0.3 }
            }
        ]
    },
    armorTemper: {
        id: 'armorTemper',
        name: '砺甲',
        icon: '🧱',
        category: '续航',
        description: '每一层护盾都要比上一层更厚。',
        playstyle: '强化首段护盾建立，适合厚甲型构筑。',
        affinities: ['wuYu', 'ningXuan', 'xiangYe'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '本场首次获得护盾时，额外提升 40%。',
                effects: { firstBlockGainBonusPct: 0.4 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '本场首次获得护盾时，额外提升 60%，并开场护盾 +4。',
                effects: { firstBlockGainBonusPct: 0.6, openingBlock: 4 }
            }
        ]
    },
    echoScripture: {
        id: 'echoScripture',
        name: '回音',
        icon: '📜',
        category: '控制',
        description: '每次运转术式，都会多带回一缕余波。',
        playstyle: '每回合首次技能额外抽牌，适合法术与回响链。',
        affinities: ['yanHan', 'moChen', 'xiangYe'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '每回合首次打出技能牌后，额外抽 1 张。',
                effects: { firstSkillDrawPerTurn: 1 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '每回合首次打出技能牌后，额外抽 1 张；首回合抽牌 +1。',
                effects: { firstSkillDrawPerTurn: 1, firstTurnDraw: 1 }
            }
        ]
    },
    starMemory: {
        id: 'starMemory',
        name: '星忆',
        icon: '✨',
        category: '控制',
        description: '星光会在开局时提醒你先看哪一手。',
        playstyle: '首回合摸牌，适合讲究起手质量的角色。',
        affinities: ['yanHan', 'moChen', 'ningXuan'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '首回合抽牌 +1。',
                effects: { firstTurnDraw: 1 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '首回合抽牌 +2。',
                effects: { firstTurnDraw: 2 }
            }
        ]
    },
    gapInsight: {
        id: 'gapInsight',
        name: '观隙',
        icon: '👁️',
        category: '控制',
        description: '先看见破绽，再决定如何落子。',
        playstyle: '对易伤与破绽目标造成更稳定的收益。',
        affinities: ['yanHan', 'linFeng', 'moChen'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '攻击易伤目标时额外伤害 +3。',
                effects: { vulnerableBonusDamage: 3 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '攻击易伤目标时额外伤害 +5；带破绽目标额外伤害 +2。',
                effects: { vulnerableBonusDamage: 5, markedBonusDamage: 2 }
            }
        ]
    },
    preceptSeal: {
        id: 'preceptSeal',
        name: '戒律',
        icon: '⛩️',
        category: '控制',
        description: '用严谨秩序稳定自己的每个回合。',
        playstyle: '开局稳健，首回合资源更完整。',
        affinities: ['wuYu', 'yanHan', 'ningXuan'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '开场护盾 +4，首回合抽牌 +1。',
                effects: { openingBlock: 4, firstTurnDraw: 1 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '开场护盾 +6，首回合抽牌 +1，首回合灵力 +1。',
                effects: { openingBlock: 6, firstTurnDraw: 1, firstTurnEnergy: 1 }
            }
        ]
    },
    sacrificialFlame: {
        id: 'sacrificialFlame',
        name: '祭火',
        icon: '🩸',
        category: '赌博',
        description: '把自己的边缘状态当成燃料。',
        playstyle: '低血时增伤并抢节奏，适合赌命打法。',
        affinities: ['xiangYe', 'wuYu', 'shenYeBai'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '生命低于 40% 时，伤害 +30%，首回合灵力 +1。',
                effects: { lowHpThreshold: 0.4, lowHpDamageBonusPct: 0.3, firstTurnEnergy: 1 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '生命低于 45% 时，伤害 +40%，首回合灵力 +1。',
                effects: { lowHpThreshold: 0.45, lowHpDamageBonusPct: 0.4, firstTurnEnergy: 1 }
            }
        ]
    },
    bloodContract: {
        id: 'bloodContract',
        name: '血契',
        icon: '🕯️',
        category: '赌博',
        description: '想活下去，就必须先收走对面的命。',
        playstyle: '击杀回复，适合连斩和追击。',
        affinities: ['linFeng', 'shenYeBai', 'moChen'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '击杀敌人时回复 4 点生命。',
                effects: { onKillHeal: 4 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '击杀敌人时回复 7 点生命，并获得开场护盾 +4。',
                effects: { onKillHeal: 7, openingBlock: 4 }
            }
        ]
    },
    mirrorHeart: {
        id: 'mirrorHeart',
        name: '镜心',
        icon: '🪞',
        category: '赌博',
        description: '越会在刀尖上起舞，越能看见另一种可能。',
        playstyle: '首段资源强化，适合高操作开局。',
        affinities: ['yanHan', 'moChen', 'shenYeBai'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '首回合抽牌 +1，首回合灵力 +1。',
                effects: { firstTurnDraw: 1, firstTurnEnergy: 1 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '首回合抽牌 +1，首回合灵力 +1，首次攻击伤害 +3。',
                effects: { firstTurnDraw: 1, firstTurnEnergy: 1, firstAttackBonusPerBattle: 3 }
            }
        ]
    },
    shatteredBoundary: {
        id: 'shatteredBoundary',
        name: '碎界',
        icon: '🌌',
        category: '赌博',
        description: '把边界打碎的人，通常也要承受碎片。',
        playstyle: '对易伤目标追伤，适合爆发窗口构筑。',
        affinities: ['linFeng', 'yanHan', 'shenYeBai'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '攻击易伤目标时额外伤害 +4，首次攻击伤害 +2。',
                effects: { vulnerableBonusDamage: 4, firstAttackBonusPerBattle: 2 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '攻击易伤目标时额外伤害 +6，首次攻击伤害 +3。',
                effects: { vulnerableBonusDamage: 6, firstAttackBonusPerBattle: 3 }
            }
        ]
    },
    gateWarden: {
        id: 'gateWarden',
        name: '守阙',
        icon: '🏯',
        category: '续航',
        description: '守住第一道门，就能争到后面的每一步。',
        playstyle: '开场稳健，适合阵御和慢热构筑。',
        affinities: ['wuYu', 'ningXuan', 'xiangYe'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '战斗开始时获得 6 护盾，首回合抽牌 +1。',
                effects: { openingBlock: 6, firstTurnDraw: 1 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '战斗开始时获得 8 护盾，首回合抽牌 +1，本场首次获得护盾时额外 +25%。',
                effects: { openingBlock: 8, firstTurnDraw: 1, firstBlockGainBonusPct: 0.25 }
            }
        ]
    },
    flowingLightning: {
        id: 'flowingLightning',
        name: '流电',
        icon: '⚡',
        category: '爆发',
        description: '快一步出手，就能多看见一个回合。',
        playstyle: '首回合回能和技能抽牌，适合节奏型角色。',
        affinities: ['moChen', 'yanHan', 'ningXuan'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '首回合灵力 +1；每回合首次技能额外抽 1 张。',
                effects: { firstTurnEnergy: 1, firstSkillDrawPerTurn: 1 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '首回合灵力 +1，首回合抽牌 +1；每回合首次技能额外抽 1 张。',
                effects: { firstTurnEnergy: 1, firstTurnDraw: 1, firstSkillDrawPerTurn: 1 }
            }
        ]
    },
    silentTide: {
        id: 'silentTide',
        name: '寂潮',
        icon: '🌑',
        category: '控制',
        description: '以缓慢稳定的灵潮收束全局。',
        playstyle: '回合开始回复与开场护盾，适合耐久玩法。',
        affinities: ['xiangYe', 'wuYu', 'yanHan'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '战斗开始时获得 4 护盾；生命低于 50% 时，回合开始回复 2 点生命。',
                effects: { openingBlock: 4, turnStartHealBelowPct: 0.5, turnStartHealAmount: 2 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '战斗开始时获得 6 护盾；生命低于 55% 时，回合开始回复 3 点生命。',
                effects: { openingBlock: 6, turnStartHealBelowPct: 0.55, turnStartHealAmount: 3 }
            }
        ]
    },
    deathChaser: {
        id: 'deathChaser',
        name: '追命',
        icon: '☠️',
        category: '爆发',
        description: '命中的空档越大，追斩越狠。',
        playstyle: '强化破绽与收割，适合终结导向 build。',
        affinities: ['linFeng', 'moChen', 'shenYeBai'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '攻击带有破绽的目标时额外伤害 +5；击杀回复 3 点生命。',
                effects: { markedBonusDamage: 5, onKillHeal: 3 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '攻击带有破绽的目标时额外伤害 +7；击杀回复 5 点生命。',
                effects: { markedBonusDamage: 7, onKillHeal: 5 }
            }
        ]
    },
    spiritVault: {
        id: 'spiritVault',
        name: '灵藏',
        icon: '📦',
        category: '续航',
        description: '先把资源稳稳攒起来，再用在最要命的地方。',
        playstyle: '开场护盾 + 首回合资源，适合成长型构筑。',
        affinities: ['ningXuan', 'yanHan', 'wuYu'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '开场护盾 +5；首回合灵力 +1。',
                effects: { openingBlock: 5, firstTurnEnergy: 1 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '开场护盾 +7；首回合灵力 +1，首回合抽牌 +1。',
                effects: { openingBlock: 7, firstTurnEnergy: 1, firstTurnDraw: 1 }
            }
        ]
    },
    omenGlow: {
        id: 'omenGlow',
        name: '宿照',
        icon: '🌠',
        category: '控制',
        description: '预先看见顺手的第一局面。',
        playstyle: '稳定起手并强化首段技能链。',
        affinities: ['yanHan', 'moChen', 'xiangYe'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '首回合抽牌 +1；每回合首次技能额外抽 1 张。',
                effects: { firstTurnDraw: 1, firstSkillDrawPerTurn: 1 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '首回合抽牌 +2；每回合首次技能额外抽 1 张。',
                effects: { firstTurnDraw: 2, firstSkillDrawPerTurn: 1 }
            }
        ]
    },
    lightDrinker: {
        id: 'lightDrinker',
        name: '饮光',
        icon: '🌞',
        category: '赌博',
        description: '把来得太满的生机再压成下一层防线。',
        playstyle: '治疗转护盾并带回杀回复，适合高风险续航。',
        affinities: ['xiangYe', 'wuYu', 'shenYeBai'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '溢出治疗的 80% 转化为护盾；击杀回复 3 点生命。',
                effects: { overhealToBlockRatio: 0.8, onKillHeal: 3 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '溢出治疗的 120% 转化为护盾；击杀回复 4 点生命。',
                effects: { overhealToBlockRatio: 1.2, onKillHeal: 4 }
            }
        ]
    },
    doomGlyph: {
        id: 'doomGlyph',
        name: '灾纹',
        icon: '🕳️',
        category: '赌博',
        description: '越危险的局面，越能从缝隙里撕开出路。',
        playstyle: '低血增伤并强化易伤终结窗口。',
        affinities: ['shenYeBai', 'linFeng', 'xiangYe'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '生命低于 45% 时伤害 +25%；攻击易伤目标额外伤害 +3。',
                effects: { lowHpThreshold: 0.45, lowHpDamageBonusPct: 0.25, vulnerableBonusDamage: 3 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '生命低于 50% 时伤害 +35%；攻击易伤目标额外伤害 +4。',
                effects: { lowHpThreshold: 0.5, lowHpDamageBonusPct: 0.35, vulnerableBonusDamage: 4 }
            }
        ]
    },
    tideMirror: {
        id: 'tideMirror',
        name: '潮镜',
        icon: '🪷',
        category: '续航',
        description: '把稳定的回潮节奏映成更厚的护身水幕。',
        playstyle: '开场护盾、低血回复、溢出转盾的复合续航型。',
        affinities: ['xiangYe', 'ningXuan', 'wuYu'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '开场护盾 +4；生命低于 45% 时回合开始回复 2 点生命；溢出治疗 50% 转盾。',
                effects: { openingBlock: 4, turnStartHealBelowPct: 0.45, turnStartHealAmount: 2, overhealToBlockRatio: 0.5 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '开场护盾 +6；生命低于 50% 时回合开始回复 3 点生命；溢出治疗 80% 转盾。',
                effects: { openingBlock: 6, turnStartHealBelowPct: 0.5, turnStartHealAmount: 3, overhealToBlockRatio: 0.8 }
            }
        ]
    },
    thunderVerse: {
        id: 'thunderVerse',
        name: '雷策',
        icon: '🌩️',
        category: '爆发',
        description: '抢下第一拍节奏，就能把整回合导向你这边。',
        playstyle: '首回合回能与易伤追伤，适合墨尘与快攻 build。',
        affinities: ['moChen', 'linFeng', 'yanHan'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '首回合灵力 +1；攻击易伤目标额外伤害 +2。',
                effects: { firstTurnEnergy: 1, vulnerableBonusDamage: 2 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '首回合灵力 +1；攻击易伤目标额外伤害 +4；首次攻击伤害 +2。',
                effects: { firstTurnEnergy: 1, vulnerableBonusDamage: 4, firstAttackBonusPerBattle: 2 }
            }
        ]
    },
    hiddenScript: {
        id: 'hiddenScript',
        name: '隐录',
        icon: '📘',
        category: '控制',
        description: '越是讲究手顺的人，越能从细节里拿回资源。',
        playstyle: '首回合抽牌与首个技能回牌的稳定工具型命格。',
        affinities: ['yanHan', 'ningXuan', 'moChen'],
        tiers: [
            {
                tier: 1,
                label: '初印',
                summary: '首回合抽牌 +1；每回合首次技能额外抽 1 张。',
                effects: { firstTurnDraw: 1, firstSkillDrawPerTurn: 1 }
            },
            {
                tier: 2,
                label: '裂印',
                summary: '首回合抽牌 +1；每回合首次技能额外抽 1 张；首次获得护盾时额外 +20%。',
                effects: { firstTurnDraw: 1, firstSkillDrawPerTurn: 1, firstBlockGainBonusPct: 0.2 }
            }
        ]
    }
};

window.RUN_DESTINIES = RUN_DESTINIES;
