/**
 * The Defier - 灵契护道
 * 开局提供 3 选 1 的灵契同伴，并在战斗中提供被动与蓄能主动。
 */

const SPIRIT_COMPANIONS = {
    frostChi: {
        id: 'frostChi',
        name: '霜螭',
        icon: '🐉',
        title: '冻脉先机',
        description: '以寒潮压住敌方节奏，为你争取关键回合。',
        playstyle: '控场、护阵、延后敌方爆发。',
        affinities: ['yanHan', 'ningXuan', 'xiangYe'],
        story: '它来自霜渊断脉，只愿跟随能看懂“慢一拍”价值的人。',
        tiers: [
            {
                tier: 1,
                label: '初契',
                summary: '开场压低敌势；主动可再施一轮寒潮并补护盾。',
                passiveLabel: '霜鳞凝息',
                passiveDesc: '战斗开始时，全体敌人获得 1 层虚弱。',
                activeLabel: '寒潮护道',
                activeDesc: '蓄能满后：全体敌人虚弱 +2，自身获得 8 护盾。',
                chargeMax: 5,
                passive: { battleStartEnemyWeakAll: 1 },
                active: { type: 'frost_guard', weakAll: 2, block: 8 }
            },
            {
                tier: 2,
                label: '灵契',
                summary: '寒潮更强，能更稳定地拖慢敌阵节拍。',
                passiveLabel: '霜鳞凝息',
                passiveDesc: '战斗开始时，全体敌人获得 2 层虚弱。',
                activeLabel: '寒潮护道',
                activeDesc: '蓄能满后：全体敌人虚弱 +3，自身获得 12 护盾。',
                chargeMax: 5,
                passive: { battleStartEnemyWeakAll: 2 },
                active: { type: 'frost_guard', weakAll: 3, block: 12 }
            }
        ]
    },
    emberCrow: {
        id: 'emberCrow',
        name: '烛鸦',
        icon: '🐦',
        title: '血焰回响',
        description: '以灼烈业火回应受伤与献祭，适合高压换血。',
        playstyle: '自损联动、范围灼烧、抢终结线。',
        affinities: ['wuYu', 'xiangYe', 'shenYeBai'],
        story: '烛鸦只在血焰最盛时现身，替你把代价烧成收益。',
        tiers: [
            {
                tier: 1,
                label: '初契',
                summary: '受伤会反咬敌阵；主动以少量生命换群体焚灼。',
                passiveLabel: '烬羽反啄',
                passiveDesc: '每回合首次失去生命后，对随机敌人造成 4 点伤害并额外获得 1 点灵契蓄能。',
                activeLabel: '血灯燎原',
                activeDesc: '蓄能满后：失去 4 点生命，对所有敌人造成 12 点伤害。',
                chargeMax: 5,
                passive: { onLoseHpRandomDamage: 4, onLoseHpExtraCharge: 1 },
                active: { type: 'blood_flare', selfDamage: 4, damageAll: 12 }
            },
            {
                tier: 2,
                label: '灵契',
                summary: '更适合搏命构筑，受伤后的反扑明显加强。',
                passiveLabel: '烬羽反啄',
                passiveDesc: '每回合首次失去生命后，对随机敌人造成 6 点伤害并额外获得 1 点灵契蓄能。',
                activeLabel: '血灯燎原',
                activeDesc: '蓄能满后：失去 4 点生命，对所有敌人造成 16 点伤害。',
                chargeMax: 5,
                passive: { onLoseHpRandomDamage: 6, onLoseHpExtraCharge: 1 },
                active: { type: 'blood_flare', selfDamage: 4, damageAll: 16 }
            }
        ]
    },
    starFox: {
        id: 'starFox',
        name: '星狐',
        icon: '🦊',
        title: '星兆牌序',
        description: '修正起手与中盘抽牌，让构筑更稳定成型。',
        playstyle: '抽牌、手牌质量、费用微调。',
        affinities: ['moChen', 'yanHan', 'linFeng'],
        story: '它会在牌山边缘踱步，替你提前嗅出下一张答案牌。',
        tiers: [
            {
                tier: 1,
                label: '初契',
                summary: '技能链更顺，主动能立即整理手牌与费用。',
                passiveLabel: '窥牌星眸',
                passiveDesc: '每回合首次打出技能牌后，额外抽 1 张牌。',
                activeLabel: '星轨改写',
                activeDesc: '蓄能满后：抽 2 张牌，并使手牌中最多 2 张牌本回合费用 -1。',
                chargeMax: 5,
                passive: { firstSkillDrawPerTurn: 1 },
                active: { type: 'star_sift', draw: 2, reduceHandCost: 2 }
            },
            {
                tier: 2,
                label: '灵契',
                summary: '更强的起手修正，适合技能与连携体系。',
                passiveLabel: '窥牌星眸',
                passiveDesc: '每回合首次打出技能牌后，额外抽 1 张牌并获得 1 点灵契蓄能。',
                activeLabel: '星轨改写',
                activeDesc: '蓄能满后：抽 2 张牌，并使手牌中最多 3 张牌本回合费用 -1。',
                chargeMax: 5,
                passive: { firstSkillDrawPerTurn: 1, firstSkillChargePerTurn: 1 },
                active: { type: 'star_sift', draw: 2, reduceHandCost: 3 }
            }
        ]
    },
    blackTortoise: {
        id: 'blackTortoise',
        name: '玄龟',
        icon: '🐢',
        title: '镇岳龟息',
        description: '把每一层护盾都堆得更厚，适合拖入长线。',
        playstyle: '护盾放大、解负面、稳守反击。',
        affinities: ['wuYu', 'ningXuan', 'xiangYe'],
        story: '玄龟从不急着出手，它更擅长替你守到敌人先犯错。',
        tiers: [
            {
                tier: 1,
                label: '初契',
                summary: '每回合首段护盾更厚，主动能稳住最危险的一拍。',
                passiveLabel: '厚甲沉息',
                passiveDesc: '每回合首次获得护盾时，额外获得 4 护盾。',
                activeLabel: '玄壳覆潮',
                activeDesc: '蓄能满后：获得 16 护盾，并净化自身常见负面状态。',
                chargeMax: 6,
                passive: { firstBlockBonusPerTurn: 4 },
                active: { type: 'guardian_shell', block: 16, cleansePlayer: 1 }
            },
            {
                tier: 2,
                label: '灵契',
                summary: '守势体系更稳定，战线更难被一口气冲穿。',
                passiveLabel: '厚甲沉息',
                passiveDesc: '每回合首次获得护盾时，额外获得 6 护盾。',
                activeLabel: '玄壳覆潮',
                activeDesc: '蓄能满后：获得 22 护盾，并净化自身常见负面状态。',
                chargeMax: 6,
                passive: { firstBlockBonusPerTurn: 6 },
                active: { type: 'guardian_shell', block: 22, cleansePlayer: 1 }
            }
        ]
    },
    nightmareButterfly: {
        id: 'nightmareButterfly',
        name: '魇蝶',
        icon: '🦋',
        title: '梦魇散翅',
        description: '把已有的减益放大，适合脆弱、虚弱与诅咒体系。',
        playstyle: '减益扩散、压制、稳定追伤。',
        affinities: ['shenYeBai', 'xiangYe', 'yanHan'],
        story: '它总在敌人的第一丝裂缝上落脚，然后把裂缝撕得更大。',
        tiers: [
            {
                tier: 1,
                label: '初契',
                summary: '打有减益的目标会更疼，主动能把脆弱与虚弱同时铺开。',
                passiveLabel: '噩梦纤粉',
                passiveDesc: '你对带有减益的敌人造成伤害时，额外伤害 +3。',
                activeLabel: '迷梦散翅',
                activeDesc: '蓄能满后：全体敌人获得 2 层易伤与 1 层虚弱。',
                chargeMax: 5,
                passive: { debuffedTargetBonusDamage: 3 },
                active: { type: 'night_pollen', vulnerableAll: 2, weakAll: 1 }
            },
            {
                tier: 2,
                label: '灵契',
                summary: '适合减益密度高的构筑，收束线更明确。',
                passiveLabel: '噩梦纤粉',
                passiveDesc: '你对带有减益的敌人造成伤害时，额外伤害 +5。',
                activeLabel: '迷梦散翅',
                activeDesc: '蓄能满后：全体敌人获得 2 层易伤与 2 层虚弱。',
                chargeMax: 5,
                passive: { debuffedTargetBonusDamage: 5 },
                active: { type: 'night_pollen', vulnerableAll: 2, weakAll: 2 }
            }
        ]
    },
    spiritApe: {
        id: 'spiritApe',
        name: '灵猿',
        icon: '🐒',
        title: '踏枝连势',
        description: '为连击与快节奏构筑补充中段回能。',
        playstyle: '连击、回能、补牌、滚回合。',
        affinities: ['linFeng', 'moChen', 'ningXuan'],
        story: '灵猿最喜欢看你把一整回合拆成许多轻巧的小节拍。',
        tiers: [
            {
                tier: 1,
                label: '初契',
                summary: '适合低费连段，主动能让你再往前迈一步。',
                passiveLabel: '三踏回灵',
                passiveDesc: '每回合每打出第 3 张牌时，获得 1 点灵力。',
                activeLabel: '凌枝突进',
                activeDesc: '蓄能满后：获得 2 点灵力并抽 1 张牌。',
                chargeMax: 4,
                passive: { everyNthCardEnergy: { count: 3, energy: 1 } },
                active: { type: 'leap_combo', gainEnergy: 2, draw: 1 }
            },
            {
                tier: 2,
                label: '灵契',
                summary: '更适合快攻与指令穿插，回能更顺滑。',
                passiveLabel: '三踏回灵',
                passiveDesc: '每回合每打出第 3 张牌时，获得 1 点灵力；首次触发后额外获得 1 点灵契蓄能。',
                activeLabel: '凌枝突进',
                activeDesc: '蓄能满后：获得 2 点灵力并抽 2 张牌。',
                chargeMax: 4,
                passive: { everyNthCardEnergy: { count: 3, energy: 1 }, nthCardChargeBonus: 1 },
                active: { type: 'leap_combo', gainEnergy: 2, draw: 2 }
            }
        ]
    },
    swordWraith: {
        id: 'swordWraith',
        name: '剑魄',
        icon: '⚔️',
        title: '断甲逐命',
        description: '专门撕开护甲与残血窗口，强化单点处决。',
        playstyle: '破甲、收头、单点斩杀。',
        affinities: ['linFeng', 'moChen', 'yanHan'],
        story: '它像一口老剑，永远盯着敌人最薄的一道缝。',
        tiers: [
            {
                tier: 1,
                label: '初契',
                summary: '护甲敌人更容易被撕开，主动可强拆一名目标。',
                passiveLabel: '破势剑鸣',
                passiveDesc: '你对带有护盾的敌人造成伤害时，额外伤害 +5。',
                activeLabel: '裂锋斩',
                activeDesc: '蓄能满后：对一名敌人造成 18 点伤害，并击碎其全部护盾。',
                chargeMax: 5,
                passive: { blockedTargetBonusDamage: 5 },
                active: { type: 'sunder_strike', damage: 18, stripBlock: true }
            },
            {
                tier: 2,
                label: '灵契',
                summary: '更适合精英/Boss 单点检定，破防后伤害也更高。',
                passiveLabel: '破势剑鸣',
                passiveDesc: '你对带有护盾的敌人造成伤害时，额外伤害 +7。',
                activeLabel: '裂锋斩',
                activeDesc: '蓄能满后：对一名敌人造成 24 点伤害，并击碎其全部护盾。',
                chargeMax: 5,
                passive: { blockedTargetBonusDamage: 7 },
                active: { type: 'sunder_strike', damage: 24, stripBlock: true }
            }
        ]
    },
    artifactSoul: {
        id: 'artifactSoul',
        name: '器灵',
        icon: '🕯️',
        title: '宝契灌心',
        description: '把法宝数量转成实打实的战斗节奏收益。',
        playstyle: '法宝联动、开场优势、指令与资源协同。',
        affinities: ['ningXuan', 'wuYu', 'moChen'],
        story: '它只认得真正会与器物对话的人，也最擅长把积累变成瞬时爆发。',
        tiers: [
            {
                tier: 1,
                label: '初契',
                summary: '法宝越多越稳，主动能把储备瞬间转成节奏。',
                passiveLabel: '宝纹护脉',
                passiveDesc: '战斗开始时，每件已装备法宝额外提供 3 护盾，并额外获得 1 点灵契蓄能。',
                activeLabel: '器潮共振',
                activeDesc: '蓄能满后：获得 1 点灵力、6 护盾，并使战场指令槽 +2。',
                chargeMax: 6,
                passive: { treasureOpeningBlockPerTreasure: 3, treasureStartCharge: 1 },
                active: { type: 'relic_overclock', gainEnergy: 1, block: 6, gainCommandPoints: 2 }
            },
            {
                tier: 2,
                label: '灵契',
                summary: '更适合多法宝 build，主动也能更快推过关键回合。',
                passiveLabel: '宝纹护脉',
                passiveDesc: '战斗开始时，每件已装备法宝额外提供 4 护盾，并额外获得 2 点灵契蓄能。',
                activeLabel: '器潮共振',
                activeDesc: '蓄能满后：获得 2 点灵力、8 护盾，并使战场指令槽 +3。',
                chargeMax: 6,
                passive: { treasureOpeningBlockPerTreasure: 4, treasureStartCharge: 2 },
                active: { type: 'relic_overclock', gainEnergy: 2, block: 8, gainCommandPoints: 3 }
            }
        ]
    }
};
