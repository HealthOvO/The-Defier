/**
 * The Defier - 逆命誓约
 * 章末提供高风险高收益的中局转折。
 */

const RUN_VOWS = {
    blazingLife: {
        id: 'blazingLife',
        name: '焚命誓',
        icon: '🩸',
        category: '爆发',
        tags: ['压血', '爆发', '处决'],
        description: '以寿火灼命，换取临阵先声与绝杀之势。',
        playstyle: '压低上限，换来更锋利的低血爆发窗口。',
        routeHint: '偏好精英、试炼、锻炉',
        buildFit: '适合压血爆发、处决收尾与首回合抢节奏构筑。',
        counterplay: '怕拖回合、怕续航断层，也怕没能及时把低血换成击杀窗口。',
        source: '第 1 / 3 / 5 章章末誓约 · 禁术坛碎片',
        unlockRules: { chapterRealms: [3, 9, 15], maxOwned: 2 },
        uiMeta: { tone: 'oath', readableCue: '血线越低，收益越亮，但生命上限会被持续烧穿。' },
        affinities: ['linFeng', 'shenYeBai', 'moChen'],
        tiers: [
            {
                tier: 1,
                label: '初契',
                summary: '最大生命 -8；首回合抽牌 +1；生命低于 60% 时伤害 +25%。',
                risk: '寿元被焚，续航和容错同步下降。',
                effects: {
                    maxHpPenalty: 8,
                    firstTurnDraw: 1,
                    lowHpThreshold: 0.6,
                    lowHpDamageBonusPct: 0.25,
                    mapWeightShift: { elite: 0.04, trial: 0.04, forge: 0.02, shop: -0.02, rest: -0.03 }
                }
            },
            {
                tier: 2,
                label: '炽契',
                summary: '最大生命总计 -12；首回合抽牌 +1；生命低于 65% 时伤害 +40%。',
                risk: '焚命更深，拖长战斗会更危险。',
                effects: {
                    maxHpPenalty: 12,
                    firstTurnDraw: 1,
                    lowHpThreshold: 0.65,
                    lowHpDamageBonusPct: 0.4,
                    mapWeightShift: { elite: 0.05, trial: 0.05, forge: 0.03, shop: -0.03, rest: -0.04 }
                }
            }
        ]
    },
    wardingPrison: {
        id: 'wardingPrison',
        name: '镇狱誓',
        icon: '🛡️',
        category: '守势',
        tags: ['护盾', '反制', '守转攻'],
        description: '以重锁镇身，换取更厚的护势与拖战资本。',
        playstyle: '护盾与前线稳定性更强，但治疗效率会被压制。',
        routeHint: '偏好营地、精英、锻炉',
        buildFit: '适合护盾叠层、反击、器灵守势与长线拖拍构筑。',
        counterplay: '怕持续磨血和高频穿盾，若没护阵手段，治疗削弱会变成长期债务。',
        source: '第 1 / 3 / 5 章章末誓约 · 记忆裂隙回响',
        unlockRules: { chapterRealms: [3, 9, 15], maxOwned: 2 },
        uiMeta: { tone: 'oath', readableCue: '护盾收益会立刻变厚，但所有回复都会被锁住。' },
        affinities: ['wuYu', 'ningXuan', 'xiangYe'],
        tiers: [
            {
                tier: 1,
                label: '初契',
                summary: '治疗效率降至 72%；开场护盾 +8；获得护盾效果 +25%。',
                risk: '恢复变慢，必须更依赖护盾和换血时机。',
                effects: {
                    healMultiplier: 0.72,
                    openingBlock: 8,
                    blockGainMultiplier: 0.25,
                    mapWeightShift: { rest: 0.03, elite: 0.03, forge: 0.02, event: -0.02, shop: -0.01 }
                }
            },
            {
                tier: 2,
                label: '重契',
                summary: '治疗效率降至 65%；开场护盾 +12；获得护盾效果 +40%。',
                risk: '回复进一步衰减，节奏必须更稳。',
                effects: {
                    healMultiplier: 0.65,
                    openingBlock: 12,
                    blockGainMultiplier: 0.4,
                    mapWeightShift: { rest: 0.04, elite: 0.04, forge: 0.03, event: -0.03, shop: -0.02 }
                }
            }
        ]
    },
    heavenlyGaze: {
        id: 'heavenlyGaze',
        name: '窥天誓',
        icon: '🔮',
        category: '谋势',
        tags: ['法则', '事件', '信息优势'],
        description: '偷看未来的代价，是当下的一切交易都会更昂贵。',
        playstyle: '让奖励质量和事件路线更偏向构筑，但商店成本显著上涨。',
        routeHint: '偏好事件、商店、营地',
        buildFit: '适合法则编织、观星推演与需要高质量奖励支撑的慢热构筑。',
        counterplay: '怕经济断裂，若前期买错货架或路线过贪，商店溢价会立刻反咬。',
        source: '第 1 / 3 / 5 章章末誓约 · 观星台推演',
        unlockRules: { chapterRealms: [3, 9, 15], maxOwned: 2 },
        uiMeta: { tone: 'oath', readableCue: '未来会更清楚，但现在所有交易都会变贵。' },
        affinities: ['yanHan', 'moChen', 'xiangYe'],
        tiers: [
            {
                tier: 1,
                label: '初契',
                summary: '商店价格 +22%；战后高稀有奖励倾向提升；地图更偏向事件与商路。',
                risk: '经济压力更高，买错一件就会伤到节奏。',
                effects: {
                    shopPriceMul: 1.22,
                    rewardRareChance: 0.18,
                    mapWeightShift: { event: 0.05, shop: 0.04, rest: 0.02, enemy: -0.03, elite: -0.03, trial: -0.02 }
                }
            },
            {
                tier: 2,
                label: '深契',
                summary: '商店价格 +30%；高稀有奖励倾向进一步提升；事件与商路权重继续上调。',
                risk: '重度溢价会放大每一次消费失误。',
                effects: {
                    shopPriceMul: 1.3,
                    rewardRareChance: 0.3,
                    mapWeightShift: { event: 0.07, shop: 0.05, rest: 0.03, enemy: -0.04, elite: -0.04, trial: -0.03 }
                }
            }
        ]
    },
    karmaDevour: {
        id: 'karmaDevour',
        name: '噬业誓',
        icon: '☠️',
        category: '赌博',
        tags: ['自损', '收割', '业障'],
        description: '先吞下业火，再把击杀回报变成下一段命。',
        playstyle: '每战先伤自身，但能凭首击和收割把血线抢回来。',
        routeHint: '偏好精英、事件、试炼',
        buildFit: '适合收割回生、首击爆发和高风险事件交易型构筑。',
        counterplay: '怕空窗回合和无法收头的战斗，一旦击杀链断掉就会持续失血。',
        source: '第 1 / 3 / 5 章章末誓约 · 禁术坛碎片',
        unlockRules: { chapterRealms: [3, 9, 15], maxOwned: 2 },
        uiMeta: { tone: 'oath', readableCue: '每场都会先亏血，只有及时收头才能把债讨回来。' },
        affinities: ['shenYeBai', 'linFeng', 'wuYu'],
        tiers: [
            {
                tier: 1,
                label: '初契',
                summary: '每场战斗开始失去 4 生命；首击伤害 +4；击杀回复 4 点生命。',
                risk: '前段血线不稳，若没能及时收割会持续恶化。',
                effects: {
                    battleStartHpLoss: 4,
                    firstAttackBonusPerBattle: 4,
                    onKillHeal: 4,
                    mapWeightShift: { elite: 0.04, event: 0.03, trial: 0.03, rest: -0.04, shop: -0.02 }
                }
            },
            {
                tier: 2,
                label: '深契',
                summary: '每场战斗开始失去 6 生命；首击伤害 +6；击杀回复 6 点生命。',
                risk: '开场业损更重，空窗回合更难承受。',
                effects: {
                    battleStartHpLoss: 6,
                    firstAttackBonusPerBattle: 6,
                    onKillHeal: 6,
                    mapWeightShift: { elite: 0.05, event: 0.04, trial: 0.04, rest: -0.05, shop: -0.03 }
                }
            }
        ]
    },
    realmBreak: {
        id: 'realmBreak',
        name: '破界誓',
        icon: '⚡',
        category: '节奏',
        tags: ['指令', '资源挤压', '高压回合'],
        description: '把资源挤到极限，换取更激进的战场指令调度。',
        playstyle: '战场指令更快启动，但手牌容错与资源缓冲会明显变差。',
        routeHint: '偏好试炼、精英、锻炉',
        buildFit: '适合战场指令、低费穿插与需要首回合抢节奏的爆发构筑。',
        counterplay: '怕卡手和资源断层，若无法把额外指令槽变成真实收益，负担会格外明显。',
        source: '第 1 / 3 / 5 章章末誓约 · 试炼碑回响',
        unlockRules: { chapterRealms: [3, 9, 15], maxOwned: 2 },
        uiMeta: { tone: 'oath', readableCue: '指令更快更狠，但手牌与资源缓冲都会一起变薄。' },
        affinities: ['moChen', 'yanHan', 'ningXuan'],
        tiers: [
            {
                tier: 1,
                label: '初契',
                summary: '手牌上限 -1；首回合灵力 +1；指令槽上限 +2；指令消耗 -1。',
                risk: '手牌更紧，抽到错位牌时更难周转。',
                effects: {
                    maxHandSizeOffset: -1,
                    firstTurnEnergy: 1,
                    battleCommandPointCapBonus: 2,
                    initialCommandPointsBonus: 1,
                    commandCostDiscount: 1,
                    mapWeightShift: { trial: 0.05, elite: 0.04, forge: 0.03, rest: -0.03, shop: -0.02 }
                }
            },
            {
                tier: 2,
                label: '裂契',
                summary: '手牌上限 -1；首回合灵力 +1；指令槽上限 +3；初始指令槽 +2；指令消耗 -1。',
                risk: '越靠高压指令翻盘，越怕手牌断层。',
                effects: {
                    maxHandSizeOffset: -1,
                    firstTurnEnergy: 1,
                    battleCommandPointCapBonus: 3,
                    initialCommandPointsBonus: 2,
                    commandCostDiscount: 1,
                    mapWeightShift: { trial: 0.06, elite: 0.05, forge: 0.03, rest: -0.04, shop: -0.03 }
                }
            }
        ]
    },
    silentReturn: {
        id: 'silentReturn',
        name: '归寂誓',
        icon: '🕯️',
        category: '献祭',
        tags: ['消耗', '弃牌', '献祭'],
        description: '容错被收窄，但每次真正的消耗都会返还新的手段。',
        playstyle: '消耗/临时卡更有价值，但手牌上限会持续承压。',
        routeHint: '偏好营地、商店、事件',
        buildFit: '适合消耗牌、临时牌、弃牌转收益与净化型构筑。',
        counterplay: '怕手牌过薄和牌序失衡，若没有稳定补牌或净化，很容易整回合空转。',
        source: '第 1 / 3 / 5 章章末誓约 · 记忆裂隙回响',
        unlockRules: { chapterRealms: [3, 9, 15], maxOwned: 2 },
        uiMeta: { tone: 'oath', readableCue: '每次消耗都会返利，但手牌容错会被一步步收窄。' },
        affinities: ['shenYeBai', 'xiangYe', 'ningXuan'],
        tiers: [
            {
                tier: 1,
                label: '初契',
                summary: '手牌上限 -1；每回合首次消耗牌后抽 1 张；开场护盾 +4。',
                risk: '手牌更薄，必须把每次消耗都打成节奏。',
                effects: {
                    maxHandSizeOffset: -1,
                    firstExhaustDrawPerTurn: 1,
                    openingBlock: 4,
                    mapWeightShift: { rest: 0.03, shop: 0.03, event: 0.02, elite: -0.02, trial: -0.02 }
                }
            },
            {
                tier: 2,
                label: '深契',
                summary: '手牌上限 -2；每回合首次消耗牌后抽 1 张；开场护盾 +6；首回合抽牌 +1。',
                risk: '更考验牌序和净化效率，一旦卡手会很难回正。',
                effects: {
                    maxHandSizeOffset: -2,
                    firstExhaustDrawPerTurn: 1,
                    openingBlock: 6,
                    firstTurnDraw: 1,
                    mapWeightShift: { rest: 0.04, shop: 0.04, event: 0.03, elite: -0.03, trial: -0.03 }
                }
            }
        ]
    }
};
