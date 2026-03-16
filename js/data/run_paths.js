/**
 * The Defier - 命途构筑任务
 * 为每一轮提供清晰的构筑主线与阶段奖励。
 */

const RUN_PATHS = {
    shatter: {
        id: 'shatter',
        name: '破命流',
        icon: '⚔️',
        category: '爆发',
        description: '以主动抢势与连续斩杀撕开命盘裂缝。',
        playstyle: '优先抢拍、扩大攻击收益，并引导路线更偏向精英与试炼。',
        routeHint: '偏好精英、试炼、锻炉',
        affinities: ['linFeng', 'moChen', 'ningXuan'],
        eventPool: ['runPathShatterBounty', 'bloodForgeCovenant', 'ashLedgerTrial', 'frontierContractBoard', 'blackbannerExecution', 'overclockSigil'],
        shopBias: {
            baseServices: [
                {
                    id: 'runPathShatterOrder',
                    type: 'service',
                    name: '裂锋悬赏令',
                    icon: '🗡️',
                    desc: '接下来 2 场战斗：首回合灵力 +1，并获得 2 层胜利悬赏增益。',
                    price: 132,
                    sold: false,
                    tagLabel: '命途专供'
                }
            ],
            rumorServices: [
                {
                    id: 'runPathShatterRumor',
                    type: 'service',
                    name: '锋路断脉谶',
                    icon: '⚔️',
                    desc: '下一重天更偏向精英、试炼、锻炉与禁术节点，适合把爆发直接换成推进。',
                    price: 3,
                    currency: 'insight',
                    sold: false,
                    tagLabel: '命途路线'
                }
            ],
            tempOffers: [
                {
                    id: 'temp_runPathShatter',
                    icon: '🩸',
                    name: '裂脉突击包',
                    price: 118,
                    desc: '获得 1 张进攻卡，并获得 2 层首回合灵力增益与 1 层悬赏增益。'
                }
            ]
        },
        treasureSynergy: {
            favoredSets: ['liemai', 'xingheng'],
            summary: '裂脉负责压血线与斩杀，星衡负责把回能转成抢拍窗口。',
            bonusLabel: '抢线压血',
            bonusDesc: '优先补足裂脉核心件，再用星衡把灵力和抽牌转成更稳定的终结回合。'
        },
        bossCounterplay: {
            chipLabel: '命途·抢前两拍',
            focus: '前两拍抢线，别把斩杀拖进逆转。',
            counter: '宣告阶段先压血，对抗阶段把第一轮高爆发直接交掉。',
            reward: '若先建立血线优势，Boss 的逆转空间会明显缩小。'
        },
        bossMatchups: {
            mechanics: {
                summon: {
                    fit: 'advantage',
                    fitLabel: '顺势抢杀',
                    focus: '召唤链成型前就把本体压进转幕，别让小怪替 Boss 吃掉你的爆发。',
                    counter: '把首轮高伤优先砸向本体，只在能顺手斩掉召唤物时再清场。',
                    reward: '若提前截断召唤节奏，后两幕的压力会显著下降。'
                },
                rage: {
                    fit: 'advantage',
                    fitLabel: '抢线赛跑',
                    focus: '越拖越强的主宰正适合破命流，关键是别把高伤打成无效换血。',
                    counter: '50% 阈值前后各留一拍爆发，别让狂暴段完整兑现。',
                    reward: '只要在狂暴前压低血线，Boss 的叠强就来不及滚起来。'
                },
                execute: {
                    fit: 'risk',
                    fitLabel: '逆风赶时',
                    focus: '处决型主宰不会给慢热套时间，必须比它更早完成收官。',
                    counter: '把压血与终结拆成两拍，别把最后答案拖到裁决之后。',
                    reward: '若能抢在裁决前完成斩杀，整场会从高压直接转成顺势。'
                }
            },
            chapters: {
                mirror_abyss: {
                    fit: 'risk',
                    fitLabel: '镜潮慎收',
                    focus: '悬镜深渊会把你上一拍的收尾直接反照回来，破命流不能把高价值启动随手丢进镜面。',
                    counter: '把收头拆成两拍，先用边角攻击试水，再在确认镜返落空后交真正的终结牌。',
                    reward: '只要没把高价值尾牌送进镜潮，Boss 的复制和追问都会变浅。'
                },
                blood_moon: {
                    fit: 'advantage',
                    fitLabel: '低血抢卷',
                    focus: '血月本就奖励压血与抢杀，破命流只要别在阈值前空挥，就能把章节风险反过来吃成收益。',
                    counter: '把爆发留到狂化阈值前后两拍，先压进线，再用回血或收割把容错拉回来。',
                    reward: '若能卡着狂化阈值连斩，后半场会像提前少打一幕。'
                },
                final_court: {
                    fit: 'risk',
                    fitLabel: '补轴后斩',
                    focus: '终焉命庭会同时检定命格、誓约、法则与法宝，破命流若只剩单轴伤害会很容易露馅。',
                    counter: '先把法则共鸣和辅助轴垫好，再找一拍真正的处决，不要把终章当成普通抢血题。',
                    reward: '一旦多轴补齐，终章的问答会被你压成一次高质量收官。'
                }
            },
            memories: {
                seal_card: {
                    fit: 'pivot',
                    fitLabel: '借边角破封',
                    focus: '被封签时先交低价值攻击牌，不要把真正的收头窗口送进去。',
                    counter: '保留 1-2 张边角攻击承压，斩杀牌留到对抗段再亮。',
                    reward: '若封签吃到杂牌，你的终结回合反而会更干净。'
                },
                echo_last_card: {
                    fit: 'pivot',
                    fitLabel: '慎收最后牌',
                    focus: '回合末别交高价值收益牌，让映照只复制廉价进攻。',
                    counter: '若必须收尾，优先用边角攻击而不是护阵、回复或启动牌。',
                    reward: '把复制价值压低后，Boss 逆转段很难白赚资源。'
                }
            },
            bosses: {
                heavenlyDao: {
                    fit: 'risk',
                    fitLabel: '终章抢问',
                    focus: '天道终焉会把最后一张牌的价值翻倍追问，你要先抢到收官权。',
                    counter: '尽量用低价值牌收尾，把真正的处决牌放在下一拍完成答卷。',
                    reward: '若先抢到裁问前的窗口，终章会比表面上短很多。'
                }
            }
        },
        mutations: {
            polarize: {
                id: 'polarize',
                branchLabel: '极化',
                name: '断脉极锋',
                icon: '🩸',
                summary: '把破命流继续推向纯抢杀，前两拍的压血与斩线会更直接。',
                risk: '若没在中前段兑现优势，后段容错会明显变薄。',
                routeHint: '裂变后偏好精英、试炼、禁术坛',
                playstyle: '把首击、抢拍与处决收益继续极化成更硬的前压节奏。',
                trackerNote: '极锋已成：这轮要更早把优势换成斩线。',
                mutationEventPool: ['runPathShatterPolarizeEdict'],
                effects: {
                    firstAttackBonusPerBattle: 2,
                    mapWeightShift: { elite: 0.02, trial: 0.02, forbidden_altar: 0.016, rest: -0.02, shop: -0.01 }
                },
                immediate: {
                    gold: 70,
                    heavenlyInsight: 1,
                    adventureBuffs: [{ id: 'firstTurnEnergyBoostBattles', charges: 1 }]
                },
                treasureSynergy: {
                    favoredSets: ['liemai', 'xingheng'],
                    summary: '裂变后更强调裂脉收头与星衡抢拍，适合把高质量首轮直接换成对抗优势。'
                }
            },
            pivot: {
                id: 'pivot',
                branchLabel: '转修',
                name: '血契转修',
                icon: '🗡️',
                summary: '保留斩线主轴，但补进调序与防守余地，让爆发不再只靠硬拼。',
                risk: '伤害峰值会略降，必须靠更精确的回合设计找窗口。',
                routeHint: '裂变后偏好锻炉、观星台、精英',
                playstyle: '将纯爆发转成爆发 + 调序副轴，先稳手感，再追收头。',
                trackerNote: '转修完成：别再无脑冲线，要把斩杀藏进更干净的回合。',
                mutationEventPool: ['runPathShatterPivotLedger'],
                effects: {
                    openingBlock: 5,
                    firstSkillDrawPerTurn: 1,
                    mapWeightShift: { forge: 0.02, observatory: 0.018, elite: 0.012, rest: -0.01 }
                },
                immediate: {
                    ringExp: 24,
                    healPct: 0.18
                },
                treasureSynergy: {
                    favoredSets: ['xingheng', 'wuxing'],
                    summary: '星衡补回能与排序，五行补净化与容错，适合把破命流转成更稳定的中盘样本。'
                }
            },
            sacrifice: {
                id: 'sacrifice',
                branchLabel: '献祭',
                name: '斩脉祭火',
                icon: '🔥',
                summary: '主动献出一段血线，换来更偏极限的跨系统爆发件。',
                risk: '最大生命和血线都会被压低，失误代价会立刻变重。',
                routeHint: '裂变后偏好禁术坛、试炼、记忆裂隙',
                playstyle: '接受更薄的容错，换取更高的稀有收益和更强的收官上限。',
                trackerNote: '祭火已立：后续每场都要当成高压抢卷来打。',
                mutationEventPool: ['runPathShatterSacrificePyre'],
                effects: {
                    firstAttackBonusPerBattle: 4,
                    mapWeightShift: { forbidden_altar: 0.024, trial: 0.02, memory_rift: 0.016, rest: -0.024, shop: -0.01 }
                },
                immediate: {
                    heavenlyInsight: 2,
                    ringExp: 18,
                    maxHpDelta: -8,
                    currentHpDelta: -10
                },
                treasureSynergy: {
                    favoredSets: ['liemai', 'wuxing'],
                    summary: '裂脉负责兑现祭火带来的斩线收益，五行帮助你在薄血线里保住关键回合。'
                }
            }
        },
        completionRecord: {
            id: 'runPathShatterRecord',
            name: '断命战录',
            icon: '⚔️',
            note: '记录一轮围绕抢拍与斩杀完成的破命流样本。'
        },
        effects: {
            firstAttackBonusPerBattle: 3,
            mapWeightShift: { elite: 0.03, trial: 0.03, forge: 0.02, rest: -0.015, shop: -0.01 }
        },
        phases: [
            {
                id: 'shatter_opening',
                label: '初成',
                title: '碎誓试锋',
                desc: '打出 6 张攻击牌，把这一轮的节奏抢到自己手里。',
                eventType: 'playAttackCard',
                target: 6,
                rewardText: '灵石 +60 / 接下来 1 场战斗首回合灵力 +1',
                rewards: [
                    { kind: 'gold', amount: 60 },
                    { kind: 'adventureBuff', id: 'firstTurnEnergyBoostBattles', charges: 1 }
                ]
            },
            {
                id: 'shatter_mid',
                label: '化境',
                title: '裂阵逐锋',
                desc: '赢下 2 场精英或试炼战，把爆发真正转成推进力。',
                eventType: 'eliteOrTrialWin',
                target: 2,
                rewardText: '命环经验 +36 / 胜利悬赏 +1',
                rewards: [
                    { kind: 'ringExp', amount: 36 },
                    { kind: 'adventureBuff', id: 'victoryGoldBoostBattles', charges: 1 }
                ]
            },
            {
                id: 'shatter_final',
                label: '登峰',
                title: '断命问锋',
                desc: '完成 1 场 Boss 战胜利，让这轮命途真正定型。',
                eventType: 'bossWin',
                target: 1,
                rewardText: '天机 +1 / 灵石 +120',
                rewards: [
                    { kind: 'heavenlyInsight', amount: 1 },
                    { kind: 'gold', amount: 120 }
                ]
            }
        ]
    },
    bulwark: {
        id: 'bulwark',
        name: '镇命流',
        icon: '🛡️',
        category: '守势',
        description: '先立其身，再以稳固护阵把命数拖回自己一侧。',
        playstyle: '强调开场护盾与持续防线，把地图收益导向营地、锻炉与稳态节点。',
        routeHint: '偏好营地、锻炉、精英',
        affinities: ['wuYu', 'ningXuan', 'xiangYe'],
        eventPool: ['runPathBulwarkSanctuary', 'shieldRelayBeacon', 'nightWatchCamp', 'medicRelayPost', 'starlitFieldHospital', 'aegisTribunal'],
        shopBias: {
            baseServices: [
                {
                    id: 'runPathBulwarkRation',
                    type: 'service',
                    name: '镇脉军需',
                    icon: '🛡️',
                    desc: '立即恢复生命，并获得 2 层开场护盾增益与 1 层战后医护增益。',
                    price: 126,
                    sold: false,
                    tagLabel: '命途专供'
                }
            ],
            rumorServices: [
                {
                    id: 'runPathBulwarkRumor',
                    type: 'service',
                    name: '守脉安营录',
                    icon: '🏕️',
                    desc: '下一重天更偏向营地、锻炉、商店与精英节点，适合先稳住再滚强度。',
                    price: 3,
                    currency: 'insight',
                    sold: false,
                    tagLabel: '命途路线'
                }
            ],
            tempOffers: [
                {
                    id: 'temp_runPathBulwark',
                    icon: '🧿',
                    name: '玄垒整备包',
                    price: 112,
                    desc: '立即恢复生命，并获得 2 层开场护盾增益与 2 层战后医护增益。'
                }
            ]
        },
        treasureSynergy: {
            favoredSets: ['xuanjia', 'wuxing'],
            summary: '玄甲撑住长线防守，五行负责净化与调序，把守势真正拖成优势。',
            bonusLabel: '立盾稳态',
            bonusDesc: '优先成型玄甲 2 件，再用五行补足净化与容错，能更稳定穿过 Boss 对抗段。'
        },
        bossCounterplay: {
            chipLabel: '命途·稳住对抗',
            focus: '先穿过宣告惩罚，再把护盾和医护留给对抗阶段。',
            counter: '不要把全部资源压在首回合，优先保证血线与护盾厚度。',
            reward: '只要顺利度过对抗段，Boss 的压轴逆转会更难滚起来。'
        },
        bossMatchups: {
            mechanics: {
                burn_aura: {
                    fit: 'pivot',
                    fitLabel: '稳线净化',
                    focus: '灼烧型主宰不会被纯护盾解决，必须把续航和净化一起准备好。',
                    counter: '先用护盾过宣告，再把恢复与净化留给对抗段，别在前两拍透支全部资源。',
                    reward: '只要血线不被灼烧偷走，镇命流在中后段会越打越稳。'
                },
                execute: {
                    fit: 'advantage',
                    fitLabel: '厚血过问',
                    focus: '高血线和稳态回复能显著降低处决型主宰的威胁。',
                    counter: '优先保证血量和护盾厚度，不要为了贪输出掉进裁决阈值。',
                    reward: '当你把血线稳住后，Boss 的压轴斩线会很难真正成立。'
                }
            },
            chapters: {
                mirror_abyss: {
                    fit: 'advantage',
                    fitLabel: '净镜稳守',
                    focus: '悬镜深渊会放大诅咒与镜返，但镇命流天生更能把净化、护盾和拖线做成一套。',
                    counter: '先保净化和厚盾，再慢慢把镜返回合拖成低收益回合，不要急着抢一口输出。',
                    reward: '当镜潮追不到你的破绽时，这章会变成最适合镇命流复盘的长局。'
                },
                blood_moon: {
                    fit: 'pivot',
                    fitLabel: '稳血过月',
                    focus: '血月会惩罚过慢和过贪两种守法，镇命流要把稳血线和适度反打绑在一起。',
                    counter: '别只顾着叠盾，先确保每次回血和护阵都能换到一点推进，不让狂化白赚回合。',
                    reward: '只要血线稳住，血月给 Boss 的压迫会先一步失效。'
                },
                final_court: {
                    fit: 'pivot',
                    fitLabel: '补轴立庭',
                    focus: '终章不只考厚度，还考多轴完整度，镇命流要把护阵、净化、法则和法宝一起补齐。',
                    counter: '先用护阵把问答节奏拖住，再让法则共鸣和法宝反制接手，不要让单一厚盾变成白吃。',
                    reward: '当防线真正接上多轴协同后，终章会从硬仗转成可控长题。'
                }
            },
            memories: {
                siphon_block: {
                    fit: 'risk',
                    fitLabel: '逆风别叠满盾',
                    focus: '虹吸护盾会直接克制镇命流，纯叠盾会被转化成 Boss 续航。',
                    counter: '把护盾拆成多段、小额与延后时点，更多依赖恢复和减伤而不是单次大盾。',
                    reward: '若不让 Boss 吃满首段护盾，你仍能把战斗拖回可控节奏。'
                },
                tribute_choice: {
                    fit: 'advantage',
                    fitLabel: '厚资源吃供',
                    focus: '手牌厚度和回复能力让你更能承受索供题，但仍要保护关键法则牌。',
                    counter: '提前留边角牌交税，真正的稳线牌和回血牌留到对抗段。',
                    reward: '只要供品交在杂牌上，Boss 的双线压制会慢很多。'
                },
                echo_last_card: {
                    fit: 'pivot',
                    fitLabel: '低值收尾',
                    focus: '不要用高价值防守牌收尾，否则映照会把你的稳态反过来复制。',
                    counter: '回合末优先用低收益小防守或过渡牌，避免送出免费护盾/回复。',
                    reward: '压低镜返收益后，你的慢节奏会重新占上风。'
                }
            },
            bosses: {
                danZun: {
                    fit: 'advantage',
                    fitLabel: '耐灼稳解',
                    focus: '丹尊的双线索供和灼烧压制会拉长战斗，但镇命流最能扛住这套题。',
                    counter: '别急着把恢复一次交空，先过对抗段，再用医护和净化稳住血线。',
                    reward: '只要挺过灼烧高峰，丹尊的压制会开始自己失速。'
                }
            }
        },
        mutations: {
            polarize: {
                id: 'polarize',
                branchLabel: '极化',
                name: '玄垒固命',
                icon: '🧿',
                summary: '把镇命流继续推向纯稳态，宣告和对抗阶段会更容易站住。',
                risk: '过度保守会让收官速度进一步变慢，容易把局拖长。',
                routeHint: '裂变后偏好营地、锻炉、商店',
                playstyle: '把护阵、回复与抗压继续极化成更厚的中盘防线。',
                trackerNote: '固命已成：先把每轮最危险的一拍变成可承受回合。',
                mutationEventPool: ['runPathBulwarkPolarizeBastion'],
                effects: {
                    openingBlock: 8,
                    mapWeightShift: { rest: 0.026, forge: 0.02, shop: 0.014, elite: -0.01 }
                },
                immediate: {
                    healPct: 0.25,
                    adventureBuffs: [{ id: 'openingBlockBoostBattles', charges: 2 }]
                },
                treasureSynergy: {
                    favoredSets: ['xuanjia', 'wuxing'],
                    summary: '玄甲继续抬高前排厚度，五行负责净化与调序，能把镇命流的稳态拉到极致。'
                }
            },
            pivot: {
                id: 'pivot',
                branchLabel: '转修',
                name: '镜守转阵',
                icon: '🪞',
                summary: '从纯防守转成守转攻，利用更好的手牌质量和节奏回收进行反打。',
                risk: '护盾厚度不再是唯一答案，需要更主动安排中盘换拍。',
                routeHint: '裂变后偏好观星台、精英、锻炉',
                playstyle: '保留防线主轴，但加入调序和反击副轴，让中盘从挨打变成反卷。',
                trackerNote: '转阵完成：把护盾留给危险拍，余下回合要开始主动换节奏。',
                mutationEventPool: ['runPathBulwarkPivotDrill'],
                effects: {
                    openingBlock: 4,
                    firstSkillDrawPerTurn: 1,
                    mapWeightShift: { observatory: 0.018, elite: 0.016, forge: 0.014, rest: -0.008 }
                },
                immediate: {
                    ringExp: 24,
                    gold: 55
                },
                treasureSynergy: {
                    favoredSets: ['wuxing', 'xingheng'],
                    summary: '五行保证净化和容错，星衡把守势转成调度优势，更适合中盘反打。'
                }
            },
            sacrifice: {
                id: 'sacrifice',
                branchLabel: '献祭',
                name: '镇脉断甲',
                icon: '⚒️',
                summary: '牺牲一部分稳态，把镇命流直接改写成带反击张力的重装压制。',
                risk: '回血与厚盾不再能完全兜底，若换节奏失败会被反噬。',
                routeHint: '裂变后偏好精英、试炼、禁术坛',
                playstyle: '用血线和容错换前压能力，让镇命流拥有真正的反击终结段。',
                trackerNote: '断甲已立：该守的回合要守死，能转攻的回合必须敢出手。',
                mutationEventPool: ['runPathBulwarkSacrificeAnvil'],
                effects: {
                    openingBlock: 4,
                    firstAttackBonusPerBattle: 3,
                    mapWeightShift: { elite: 0.02, trial: 0.018, forbidden_altar: 0.012, rest: -0.018 }
                },
                immediate: {
                    maxHpDelta: -6,
                    currentHpDelta: -8,
                    heavenlyInsight: 1,
                    adventureBuffs: [{ id: 'firstTurnEnergyBoostBattles', charges: 1 }]
                },
                treasureSynergy: {
                    favoredSets: ['xuanjia', 'liemai'],
                    summary: '玄甲继续撑住危险拍，裂脉则把你腾出来的攻击窗口直接换成斩线收益。'
                }
            }
        },
        completionRecord: {
            id: 'runPathBulwarkRecord',
            name: '镇狱守录',
            icon: '🛡️',
            note: '记录一轮依靠护阵与续航拖入终局的镇命流样本。'
        },
        effects: {
            openingBlock: 5,
            mapWeightShift: { rest: 0.03, forge: 0.025, elite: 0.015, event: -0.015, shop: -0.01 }
        },
        phases: [
            {
                id: 'bulwark_opening',
                label: '初成',
                title: '厚壁立心',
                desc: '累计获得 40 点护盾，先把防线立起来。',
                eventType: 'gainBlock',
                target: 40,
                rewardText: '灵石 +50 / 开场护盾 +1 场',
                rewards: [
                    { kind: 'gold', amount: 50 },
                    { kind: 'adventureBuff', id: 'openingBlockBoostBattles', charges: 1 }
                ]
            },
            {
                id: 'bulwark_mid',
                label: '化境',
                title: '守势回潮',
                desc: '赢下 4 场战斗，让守势真正滚成稳定推进。',
                eventType: 'battleWin',
                target: 4,
                rewardText: '命环经验 +40 / 战后医护 +1',
                rewards: [
                    { kind: 'ringExp', amount: 40 },
                    { kind: 'adventureBuff', id: 'victoryHealBoostBattles', charges: 1 }
                ]
            },
            {
                id: 'bulwark_final',
                label: '登峰',
                title: '镇狱问劫',
                desc: '完成 1 场 Boss 战胜利，证明防线足以撑到终局。',
                eventType: 'bossWin',
                target: 1,
                rewardText: '天机 +1 / 灵石 +100',
                rewards: [
                    { kind: 'heavenlyInsight', amount: 1 },
                    { kind: 'gold', amount: 100 }
                ]
            }
        ]
    },
    insight: {
        id: 'insight',
        name: '窥命流',
        icon: '🔮',
        category: '谋势',
        description: '通过调序、信息与战略节点把这一局写成可控样本。',
        playstyle: '提升技能调度并引导路线偏向事件、观星、裂隙与灵契节点。',
        routeHint: '偏好事件、观星台、记忆裂隙、灵契窟',
        affinities: ['yanHan', 'moChen', 'xiangYe'],
        eventPool: ['runPathInsightAstrolabe', 'ancientLibrary', 'wanderingOracle', 'starObservation', 'artifactConfluxBazaar', 'convergenceRitual', 'voidRift'],
        shopBias: {
            baseServices: [
                {
                    id: 'runPathInsightAtlas',
                    type: 'service',
                    name: '窥盘校谱',
                    icon: '🔮',
                    desc: '接下来 2 场战斗：命环经验额外提升，并获得 1 层首回合抽牌增益与 1 点天机。',
                    price: 134,
                    sold: false,
                    tagLabel: '命途专供'
                }
            ],
            rumorServices: [
                {
                    id: 'runPathInsightRumor',
                    type: 'service',
                    name: '裂隙观测志',
                    icon: '🪞',
                    desc: '下一重天更偏向事件、观星台、记忆裂隙与灵契节点，适合继续调序拿信息。',
                    price: 3,
                    currency: 'insight',
                    sold: false,
                    tagLabel: '命途路线'
                }
            ],
            tempOffers: [
                {
                    id: 'temp_runPathInsight',
                    icon: '📡',
                    name: '观测校谱包',
                    price: 120,
                    desc: '获得 1 张稀有卡，并获得 2 层命环经验增益、1 层首回合抽牌增益与 1 点天机。'
                }
            ]
        },
        treasureSynergy: {
            favoredSets: ['xingheng', 'wuxing'],
            summary: '星衡负责回能与节奏编织，五行负责净化与调序，能把信息优势真正写进回合。',
            bonusLabel: '调序控样',
            bonusDesc: '优先用星衡稳定灵力与抽牌，再用五行补环境适配与净化，适合长局控节奏。'
        },
        bossCounterplay: {
            chipLabel: '命途·先看后打',
            focus: '先看清记忆点，再决定把高价值牌放在哪个回合。',
            counter: '尽量把调序、抽牌与回复留到能避开 Boss 复诵或封锁的窗口。',
            reward: '只要牌序不被 Boss 牵着走，三幕机制会被你拆成可控样本。'
        },
        bossMatchups: {
            mechanics: {
                gravity: {
                    fit: 'advantage',
                    fitLabel: '顺势调费',
                    focus: '费用扰动更适合窥命流，因为你更能靠抽牌和调序把坏牌序修回来。',
                    counter: '先留低费过渡牌，再用补抽和回能把关键牌接回正确回合。',
                    reward: '一旦调费没打乱你，Boss 的整道题都会失去压迫感。'
                },
                discard: {
                    fit: 'risk',
                    fitLabel: '逆风保手',
                    focus: '弃牌税会直接动到窥命流的手牌质量，不能把所有答案都捏在手里。',
                    counter: '提前把过渡牌打出去，让索贡命中边角牌而不是调序核心。',
                    reward: '若维持住手牌厚度，后续每幕都会更好读。'
                },
                summon: {
                    fit: 'pivot',
                    fitLabel: '先读后清',
                    focus: '窥命流不怕多信息，但怕被召唤物拖慢本体处理节奏。',
                    counter: '先确认召唤节拍，再决定是拆小怪还是继续压本体。',
                    reward: '读清召唤周期后，你能把每个窗口都打得更干净。'
                }
            },
            chapters: {
                mirror_abyss: {
                    fit: 'advantage',
                    fitLabel: '镜后校尾',
                    focus: '悬镜深渊会持续追问你的尾牌质量，而窥命流正适合把镜返题写成可控样本。',
                    counter: '把高价值收尾往下一拍挪，先用调序和边角牌测镜，再决定真正的回答落在哪一回合。',
                    reward: '一旦镜潮只照到边角牌，Boss 的复制段会迅速失去威胁。'
                },
                blood_moon: {
                    fit: 'pivot',
                    fitLabel: '薄血算拍',
                    focus: '血月会把低血收益和风险一起抬高，窥命流必须边算血线边算牌序，不能只顾读题。',
                    counter: '优先把回复、净化与抽牌错位安排，让狂化阈值来的时候手里仍有真正答案。',
                    reward: '若你在薄血线下仍维持住牌序，Boss 的追问会比章节本身先失速。'
                },
                final_court: {
                    fit: 'advantage',
                    fitLabel: '终章排式',
                    focus: '终焉命庭会把多轴联动一起拉上台面，而窥命流最擅长的正是先排好整道终章答卷。',
                    counter: '先确认命格、誓约、法则和法宝哪一轴还没接上，再用调序把终末牌序排成真正的标准答案。',
                    reward: '当终章顺着你的牌序出题时，天道级 Boss 也会被拆成可读的分段题。'
                }
            },
            memories: {
                seal_card: {
                    fit: 'advantage',
                    fitLabel: '顺势控样',
                    focus: '封签题正适合窥命流，先确认谁会吃封锁，再安排真正的高价值牌。',
                    counter: '用边角牌承接封签，把抽牌、回复和启动牌留到安全回合。',
                    reward: '只要封签顺着你的计划落下，它反而会暴露 Boss 的节拍。'
                },
                echo_last_card: {
                    fit: 'advantage',
                    fitLabel: '顺势拆诵',
                    focus: '映照型主宰会检定你的收尾质量，而这正是窥命流最擅长的题。',
                    counter: '回合末先交低价值牌，再用调序把真正答案留到下一拍。',
                    reward: '当你控制住最后一张牌时，Boss 的复制会变成空转。'
                },
                tribute_choice: {
                    fit: 'pivot',
                    fitLabel: '留冗余手牌',
                    focus: '索供题会逼你交手牌，窥命流要提前留冗余而不是临场硬扛。',
                    counter: '优先把低质量手牌转换掉，让纳贡只碰到边角资源。',
                    reward: '一旦索供落空，Boss 的双线压制就会明显变慢。'
                }
            },
            bosses: {
                banditLeader: {
                    fit: 'advantage',
                    fitLabel: '观符下刀',
                    focus: '山寨头目的封签更像一道牌序题，只要先看清谁会吃印，就能顺势拆掉。',
                    counter: '别急着交高价值技能，先用低价值牌试探，再在安全回合打满收益。',
                    reward: '当封签落在杂牌上时，这位 Boss 的整套题会瞬间变浅。'
                },
                heavenlyDao: {
                    fit: 'pivot',
                    fitLabel: '终章控尾',
                    focus: '天道终焉会持续追问你的终末牌序，窥命流能读题，但容错并不高。',
                    counter: '每回合最后一张牌都要刻意设计，别让映照吃到回复、护盾或高费启动。',
                    reward: '若尾牌被你锁住，终章的压轴逆转会失去大半威力。'
                }
            }
        },
        mutations: {
            polarize: {
                id: 'polarize',
                branchLabel: '极化',
                name: '定盘穷观',
                icon: '🪐',
                summary: '把窥命流继续极化成纯调序路线，后续更容易把整局写成可控样本。',
                risk: '一旦前期节奏失手，纯读题会缺少硬解压场的蛮力。',
                routeHint: '裂变后偏好观星台、事件、记忆裂隙',
                playstyle: '继续强化信息、调序和路线控制，让中盘进入真正的掌局状态。',
                trackerNote: '穷观已立：后续每次收尾和路线选择都要当成样本校正。',
                mutationEventPool: ['runPathInsightPolarizeAtlas'],
                effects: {
                    firstSkillDrawPerTurn: 1,
                    mapWeightShift: { observatory: 0.024, event: 0.02, memory_rift: 0.02, enemy: -0.014, elite: -0.01 }
                },
                immediate: {
                    heavenlyInsight: 2,
                    ringExp: 18
                },
                treasureSynergy: {
                    favoredSets: ['xingheng', 'wuxing'],
                    summary: '星衡继续稳住抽牌和回能，五行负责净化与环境适配，最适合把信息优势写进整局。'
                }
            },
            pivot: {
                id: 'pivot',
                branchLabel: '转修',
                name: '借势落子',
                icon: '♟️',
                summary: '不再只做读题者，而是把信息优势转成真正的爆发与收官窗口。',
                risk: '若仍按纯控样节奏拖回合，会同时失去调序和压血的优势。',
                routeHint: '裂变后偏好精英、观星台、灵契窟',
                playstyle: '将窥命流转成调序 + 抢拍副轴，让读题结果直接兑现成伤害。',
                trackerNote: '落子已成：看清窗口后就要敢于落手，不再只做保守校正。',
                mutationEventPool: ['runPathInsightPivotGambit'],
                effects: {
                    openingBlock: 4,
                    firstAttackBonusPerBattle: 2,
                    firstSkillDrawPerTurn: 1,
                    mapWeightShift: { elite: 0.016, observatory: 0.016, spirit_grotto: 0.014, enemy: -0.008 }
                },
                immediate: {
                    gold: 60,
                    adventureBuffs: [{ id: 'firstTurnDrawBoostBattles', charges: 2 }]
                },
                treasureSynergy: {
                    favoredSets: ['xingheng', 'liemai'],
                    summary: '星衡负责调度和回能，裂脉负责兑现窗口伤害，适合把窥命流转成更主动的中盘样本。'
                }
            },
            sacrifice: {
                id: 'sacrifice',
                branchLabel: '献祭',
                name: '盲算窥天',
                icon: '🕯️',
                summary: '主动放弃一段安全边界，换取更罕见的高风险信息收益。',
                risk: '血线更薄、路线更险，后续每次失误都会被放大。',
                routeHint: '裂变后偏好禁术坛、记忆裂隙、观星台',
                playstyle: '接受高压与薄容错，把窥命流直接推向“高风险高情报”的传奇样本。',
                trackerNote: '盲算已立：命盘会给你更多答案，但每个答案都要付出代价。',
                mutationEventPool: ['runPathInsightSacrificeOracle'],
                effects: {
                    firstSkillDrawPerTurn: 1,
                    mapWeightShift: { forbidden_altar: 0.022, memory_rift: 0.02, observatory: 0.016, rest: -0.02, shop: -0.01 }
                },
                immediate: {
                    maxHpDelta: -6,
                    currentHpDelta: -8,
                    heavenlyInsight: 2,
                    ringExp: 22
                },
                treasureSynergy: {
                    favoredSets: ['wuxing', 'xingheng'],
                    summary: '五行帮助薄容错局维持稳定，星衡则把额外信息尽快兑现成节奏收益。'
                }
            }
        },
        completionRecord: {
            id: 'runPathInsightRecord',
            name: '命盘观测录',
            icon: '🔮',
            note: '记录一轮依靠信息、调序与路线控制完成的窥命流样本。'
        },
        effects: {
            firstSkillDrawPerTurn: 1,
            mapWeightShift: { event: 0.03, observatory: 0.025, memory_rift: 0.025, spirit_grotto: 0.018, enemy: -0.015, elite: -0.01 }
        },
        phases: [
            {
                id: 'insight_opening',
                label: '初成',
                title: '观微定式',
                desc: '打出 6 张技能牌，把牌序和节奏先捋顺。',
                eventType: 'playSkillCard',
                target: 6,
                rewardText: '命环经验 +30 / 天机 +1',
                rewards: [
                    { kind: 'ringExp', amount: 30 },
                    { kind: 'heavenlyInsight', amount: 1 }
                ]
            },
            {
                id: 'insight_mid',
                label: '化境',
                title: '窥盘巡脉',
                desc: '拜访 2 个战略节点，让命途开始改写地图结构。',
                eventType: 'strategicNodeVisit',
                target: 2,
                rewardText: '灵石 +45 / 命环经验增益 +1 场',
                rewards: [
                    { kind: 'gold', amount: 45 },
                    { kind: 'adventureBuff', id: 'ringExpBoostBattles', charges: 1 }
                ]
            },
            {
                id: 'insight_final',
                label: '登峰',
                title: '命盘问真',
                desc: '完成 1 场 Boss 战胜利，把这局样本真正写进档案。',
                eventType: 'bossWin',
                target: 1,
                rewardText: '天机 +2 / 灵石 +80',
                rewards: [
                    { kind: 'heavenlyInsight', amount: 2 },
                    { kind: 'gold', amount: 80 }
                ]
            }
        ]
    }
};

window.RUN_PATHS = RUN_PATHS;
