(function () {
    const BRANCH_REGIONS = {
        chapter1: [
            {
                id: 'ember_mines',
                chapterIndex: 1,
                icon: '⛏️',
                name: '焚骨矿场',
                tone: '快攻 / 爆发 / 战利',
                summary: '矿脉中的赤火会逼你抢先手，但胜过这里的人总能更快拿到伤害型补件。',
                reward: '更偏向精英、试炼与攻击收益',
                risk: '战斗节点会更凶，若拖回合更容易被反拍',
                nodeBias: ['enemy', 'elite', 'trial'],
                factionImpact: { frontier_bureau: 1, caravan_union: -1 }
            },
            {
                id: 'outer_camp',
                chapterIndex: 1,
                icon: '🏕️',
                name: '封印外城',
                tone: '生存 / 守阵 / 稳线',
                summary: '外城有旧朝军阵残痕，适合把早章的危险回合稳成可解局面。',
                reward: '更偏向营地、守势法宝与缓冲节点',
                risk: '收益较慢，爆发 build 容易错过前期滚雪球',
                nodeBias: ['rest', 'shop', 'forge'],
                factionImpact: { frontier_bureau: 1, ash_covenant: -1 }
            },
            {
                id: 'rift_market',
                chapterIndex: 1,
                icon: '🛒',
                name: '裂口浮市',
                tone: '交易 / 赌局 / 机缘',
                summary: '这里的货单不讲来路，只讲你敢不敢立刻把未来卖掉。',
                reward: '更偏向商店、事件与非常规补件',
                risk: '势力好感更易撕裂，黑市收益常伴随代价',
                nodeBias: ['shop', 'event', 'memory_rift'],
                factionImpact: { caravan_union: 1, frontier_bureau: -1 }
            },
            {
                id: 'watch_spire',
                chapterIndex: 1,
                icon: '🔭',
                name: '裂誓望台',
                tone: '侦测 / 预案 / 谋略',
                summary: '望台会把前路的压力提前摊开，适合把试探期变成主动布置期。',
                reward: '更偏向观星、事件与路线信息',
                risk: '即时战力提升较慢，需要会读图才赚',
                nodeBias: ['observatory', 'event', 'memory_rift'],
                factionImpact: { star_seers: 1, wild_hunt: -1 }
            }
        ],
        chapter2: [
            {
                id: 'kiln_corridor',
                chapterIndex: 2,
                icon: '🔥',
                name: '炉海窑道',
                tone: '炼器 / 厚甲 / 资源燃烧',
                summary: '炉海会逼你在锻造与续航之间赌一边，适合偏法宝与护阵 build。',
                reward: '更偏向炼器坊、护阵收益与法宝件',
                risk: '若没有足够经济，容易被高费用节点拖慢',
                nodeBias: ['forge', 'shop', 'elite'],
                factionImpact: { ash_covenant: 1, caravan_union: -1 }
            },
            {
                id: 'cinder_docks',
                chapterIndex: 2,
                icon: '⚓',
                name: '灰烬商埠',
                tone: '交易 / 口粮 / 生存',
                summary: '商埠擅长把高压章拆成可呼吸的节奏，但需要你及时拿走补给。',
                reward: '更偏向商店、营地与恢复收益',
                risk: '爆发 build 在这里容易少拿关键输出件',
                nodeBias: ['shop', 'rest', 'event'],
                factionImpact: { caravan_union: 1, ash_covenant: -1 }
            },
            {
                id: 'molten_court',
                chapterIndex: 2,
                icon: '⚖️',
                name: '熔律裁庭',
                tone: '试炼 / 对局检定 / 高收益',
                summary: '裁庭偏爱明确的答卷，会把试炼收益与失误惩罚一起放大。',
                reward: '更偏向试炼、精英与命盘评分',
                risk: '失误成本更高，低容错 build 容易断档',
                nodeBias: ['trial', 'elite', 'enemy'],
                factionImpact: { frontier_bureau: 1, ash_covenant: 1 }
            }
        ],
        chapter3: [
            {
                id: 'star_archive',
                chapterIndex: 3,
                icon: '📚',
                name: '沉星档库',
                tone: '法则 / 预埋 / 命盘',
                summary: '古庭的旧档案偏爱计算型 build，能让预埋与法则编织更早成形。',
                reward: '更偏向观星、记忆裂隙与法则收益',
                risk: '即时牌面强度提升较慢',
                nodeBias: ['observatory', 'memory_rift', 'event'],
                factionImpact: { star_seers: 1, covenant_lodge: 1 }
            },
            {
                id: 'lattice_garden',
                chapterIndex: 3,
                icon: '🌌',
                name: '星链廊庭',
                tone: '连段 / 节奏 / 复利',
                summary: '这里会奖赏能连成节拍的构筑，让你把中盘铺垫滚成稳定优势。',
                reward: '更偏向连段节点、灵契与事件',
                risk: '如果缺少回能与手牌调度，会被自己的节奏反咬',
                nodeBias: ['spirit_grotto', 'event', 'enemy'],
                factionImpact: { star_seers: 1, wild_hunt: -1 }
            },
            {
                id: 'silent_orbit',
                chapterIndex: 3,
                icon: '🪐',
                name: '寂轨回廊',
                tone: '控制 / 守势 / 读局',
                summary: '寂轨更适合慢热型 build，用更强的信息与缓冲换更稳的终局。',
                reward: '更偏向营地、观星与控制型支援',
                risk: '推进速度较慢，悬赏完成线更吃路线精度',
                nodeBias: ['rest', 'observatory', 'shop'],
                factionImpact: { covenant_lodge: 1, wild_hunt: -1 }
            }
        ],
        chapter4: [
            {
                id: 'mirror_bazaar',
                chapterIndex: 4,
                icon: '🪞',
                name: '镜灾黑市',
                tone: '赌博 / 代价 / 换血',
                summary: '黑市会把每一份即时收益都挂上代价标签，但也最容易翻盘。',
                reward: '更偏向禁术坛、事件与稀有服务',
                risk: '势力敌意与构筑波动都会显著放大',
                nodeBias: ['forbidden_altar', 'event', 'shop'],
                factionImpact: { ash_covenant: 1, frontier_bureau: -1 }
            },
            {
                id: 'purge_temple',
                chapterIndex: 4,
                icon: '⛩️',
                name: '净镜封宫',
                tone: '净化 / 防错 / 结算',
                summary: '封宫要求你把所有脏收益都转成干净答卷，适合稳态通关。',
                reward: '更偏向营地、守势与净化型收益',
                risk: '极端赌博流在这里更容易被卡死',
                nodeBias: ['rest', 'trial', 'shop'],
                factionImpact: { frontier_bureau: 1, ash_covenant: -1 }
            },
            {
                id: 'echo_quarry',
                chapterIndex: 4,
                icon: '🔁',
                name: '回波采井',
                tone: '复制 / 回响 / 套利',
                summary: '采井会反复放大你的强项，也会更快暴露同一条轴的脆弱点。',
                reward: '更偏向记忆裂隙、法则与复制收益',
                risk: '单轴 build 更易被镜像针对',
                nodeBias: ['memory_rift', 'observatory', 'elite'],
                factionImpact: { covenant_lodge: 1, star_seers: 1 }
            }
        ],
        chapter5: [
            {
                id: 'blood_moon_dais',
                chapterIndex: 5,
                icon: '🩸',
                name: '血月祭垣',
                tone: '献祭 / 压血 / 收割',
                summary: '祭垣会把压血与收头拉到最刺激的位置，适合敢赌命的 build。',
                reward: '更偏向精英、禁术与终结收益',
                risk: '任何误判都会被放大成残胜甚至断局',
                nodeBias: ['elite', 'forbidden_altar', 'trial'],
                factionImpact: { ash_covenant: 1, wild_hunt: 1, frontier_bureau: -1 }
            },
            {
                id: 'ember_hospital',
                chapterIndex: 5,
                icon: '🩹',
                name: '烬灯疗站',
                tone: '医护 / 调整 / 再战',
                summary: '疗站适合把高压 build 从濒危拉回可控，同时继续保持推进能力。',
                reward: '更偏向营地、恢复与辅助收益',
                risk: '爆发 build 会觉得这里太慢',
                nodeBias: ['rest', 'shop', 'spirit_grotto'],
                factionImpact: { caravan_union: 1, ash_covenant: -1 }
            },
            {
                id: 'howl_frontier',
                chapterIndex: 5,
                icon: '🐺',
                name: '猎嚎边境',
                tone: '追猎 / 伏击 / 对赌',
                summary: '边境会不断抛出能不能继续追猎的提问，非常适合仇敌线推进。',
                reward: '更偏向精英、仇敌与高分线路',
                risk: '连续硬战会快速掏空资源',
                nodeBias: ['elite', 'enemy', 'event'],
                factionImpact: { wild_hunt: 1, caravan_union: -1 }
            }
        ],
        chapter6: [
            {
                id: 'verdict_atrium',
                chapterIndex: 6,
                icon: '☯️',
                name: '终律前庭',
                tone: '多轴 / 审核 / 终局',
                summary: '前庭会提前检定你的答卷完整度，让多轴 build 更容易拿到终章回报。',
                reward: '更偏向法则、观星与终局评分',
                risk: '单轴 build 在这里会被看穿',
                nodeBias: ['observatory', 'trial', 'memory_rift'],
                factionImpact: { star_seers: 1, frontier_bureau: 1 }
            },
            {
                id: 'silent_tribunal',
                chapterIndex: 6,
                icon: '⚔️',
                name: '无声审庭',
                tone: '强袭 / 斩首 / 极限',
                summary: '审庭鼓励你用最少错误打出最短终局，是高压高分路线。',
                reward: '更偏向试炼、精英与强袭结局',
                risk: '任何补救空间都会被压缩',
                nodeBias: ['elite', 'trial', 'enemy'],
                factionImpact: { frontier_bureau: 1, wild_hunt: 1 }
            },
            {
                id: 'ether_vault',
                chapterIndex: 6,
                icon: '🧰',
                name: '合式机库',
                tone: '炼器 / 校准 / 容错',
                summary: '机库允许你在终章前做最后的体系拼装，适合补齐法宝与套装短板。',
                reward: '更偏向炼器坊、商店与法宝补件',
                risk: '如果基础轴不够，单靠补件也救不回来',
                nodeBias: ['forge', 'shop', 'memory_rift'],
                factionImpact: { covenant_lodge: 1, caravan_union: 1 }
            }
        ]
    };

    const BOUNTY_TEMPLATES = [
        {
            id: 'battle_chain',
            name: '破阵快押',
            icon: '⚔️',
            type: 'battle',
            chapters: [1, 2, 5, 6],
            condition: { type: 'battleWins', target: 3 },
            summary: '在本章内赢下 3 场战斗，证明你能在压力线上持续抢拍。',
            reward: { score: 35, gold: 55, ringExp: 22 },
            routeHint: '更适合战斗稠密或强袭路线',
            riskHint: '若路线功能节点偏多，可能赶不上完成线'
        },
        {
            id: 'elite_hunt',
            name: '猎首名状',
            icon: '💀',
            type: 'battle',
            chapters: [1, 2, 5, 6],
            condition: { type: 'eliteWins', target: 2 },
            summary: '击破 2 个精英或试炼敌，拿更高风险去换更高评分。',
            reward: { score: 48, gold: 70, ringExp: 32 },
            routeHint: '适合想冲命盘评分的 build',
            riskHint: '需要稳定处理高压敌人'
        },
        {
            id: 'omen_route',
            name: '观测先机',
            icon: '🔭',
            type: 'route',
            chapters: [1, 3, 4, 6],
            condition: { type: 'visitNodeType', nodeType: 'observatory', target: 1 },
            summary: '至少踏入 1 次观星台，把路线信息换成更稳的章节规划。',
            reward: { score: 26, gold: 28, heavenlyInsight: 1 },
            routeHint: '更适合信息型或法则型路线',
            riskHint: '即时战力收益不高'
        },
        {
            id: 'rift_probe',
            name: '残章回收',
            icon: '🪞',
            type: 'route',
            chapters: [1, 3, 4, 6],
            condition: { type: 'visitNodeType', nodeType: 'memory_rift', target: 1 },
            summary: '踏入 1 次记忆裂隙，为命格、法则和命盘补一块真正有分量的拼图。',
            reward: { score: 32, ringExp: 26, heavenlyInsight: 1 },
            routeHint: '适合围绕中期转折的 build',
            riskHint: '部分裂隙收益偏慢热'
        },
        {
            id: 'forge_contract',
            name: '炉契验收',
            icon: '⚒️',
            type: 'route',
            chapters: [2, 4, 6],
            condition: { type: 'visitNodeType', nodeType: 'forge', target: 1 },
            summary: '至少完成 1 次炼器坊操作，让 build 在章节中段完成明确补件。',
            reward: { score: 28, gold: 35, ringExp: 18 },
            routeHint: '适合法宝与套装路线',
            riskHint: '需要保留足够灵石'
        },
        {
            id: 'spirit_trace',
            name: '灵契追索',
            icon: '🪷',
            type: 'route',
            chapters: [3, 5, 6],
            condition: { type: 'visitNodeType', nodeType: 'spirit_grotto', target: 1 },
            summary: '进入 1 次灵契窟，让灵契从辅助位升级成章节答案的一部分。',
            reward: { score: 28, heavenlyInsight: 1, ringExp: 20 },
            routeHint: '更适合连段、续航与灵契驱动 build',
            riskHint: '节点稀缺，路线需要提前锁定'
        },
        {
            id: 'no_rest_clear',
            name: '一口气冲线',
            icon: '🩸',
            type: 'extreme',
            chapters: [1, 5, 6],
            condition: { type: 'noRestBossWin', target: 1 },
            summary: '本章内不进入营地并成功过章，把整章都压成一次连续冲线。',
            reward: { score: 62, gold: 80, ringExp: 36 },
            routeHint: '只适合已经成型或极强前压 build',
            riskHint: '容错极低，错一步就很难补救'
        },
        {
            id: 'high_hp_finish',
            name: '稳线收官',
            icon: '🛡️',
            type: 'extreme',
            chapters: [1, 2, 3, 4, 6],
            condition: { type: 'hpAboveOnBossWin', threshold: 0.62, target: 1 },
            summary: '以较高血线通过本章，证明这套 build 不只是能赢，而是真正可控。',
            reward: { score: 40, gold: 42, ringExp: 24 },
            routeHint: '更适合守势、续航与信息型路线',
            riskHint: '激进 build 容易在收官前透支血线'
        },
        {
            id: 'altar_oath',
            name: '禁契试刀',
            icon: '🩸',
            type: 'route',
            chapters: [4, 5],
            condition: { type: 'visitNodeType', nodeType: 'forbidden_altar', target: 1 },
            summary: '至少接触一次禁术坛，把风险收益真正拉进本章答卷。',
            reward: { score: 34, karma: 1, ringExp: 20 },
            routeHint: '适合赌博、自损与禁术路线',
            riskHint: '势力敌意与章节压力都会提升'
        },
        {
            id: 'trial_verdict',
            name: '问锋合格',
            icon: '⚖️',
            type: 'battle',
            chapters: [2, 4, 6],
            condition: { type: 'visitNodeType', nodeType: 'trial', target: 1 },
            summary: '至少通过 1 次试炼碑，把章节中段压力换成清晰的高分通道。',
            reward: { score: 36, gold: 45, ringExp: 25 },
            routeHint: '适合想确认 build 真强度的路线',
            riskHint: '试炼会放大当前短板'
        }
    ];

    const FACTION_PROFILES = {
        frontier_bureau: {
            id: 'frontier_bureau',
            icon: '🛡️',
            name: '封疆司',
            agenda: '偏好守序推进、试炼和正面压制，不喜欢黑市与禁术失控。',
            likes: ['elite', 'trial', 'boss', 'rest'],
            dislikes: ['forbidden_altar', 'shop'],
            supportNodeTypes: ['elite', 'boss', 'trial'],
            pressureNodeTypes: ['forbidden_altar', 'event'],
            support: { block: 7 },
            threat: { enemyHpMul: 1.1, enemyAtkMul: 1.08 },
            positiveLabel: '边军援护',
            negativeLabel: '边军盘查'
        },
        caravan_union: {
            id: 'caravan_union',
            icon: '🛒',
            name: '游商盟会',
            agenda: '偏爱稳定商路和可兑现收益，会对粗暴劫掠与高风险禁术保持警惕。',
            likes: ['shop', 'rest', 'event'],
            dislikes: ['elite', 'forbidden_altar'],
            supportNodeTypes: ['shop', 'rest'],
            pressureNodeTypes: ['elite'],
            support: { gold: 24, heal: 8 },
            threat: { enemyHpMul: 1.06, enemyAtkMul: 1.04 },
            positiveLabel: '商路返利',
            negativeLabel: '补给抽紧'
        },
        star_seers: {
            id: 'star_seers',
            icon: '🔭',
            name: '观星会',
            agenda: '看重命盘、观测与法则秩序，愿意帮助能读懂前路的人。',
            likes: ['observatory', 'memory_rift', 'event'],
            dislikes: ['forbidden_altar'],
            supportNodeTypes: ['observatory', 'memory_rift'],
            pressureNodeTypes: ['enemy'],
            support: { heavenlyInsight: 1, ringExp: 18 },
            threat: { enemyHpMul: 1.04, enemyAtkMul: 1.06 },
            positiveLabel: '观测加持',
            negativeLabel: '天象偏转'
        },
        ash_covenant: {
            id: 'ash_covenant',
            icon: '🔥',
            name: '烬誓同盟',
            agenda: '鼓励献祭、禁术和高压换伤，讨厌拖泥带水的守成路线。',
            likes: ['forbidden_altar', 'elite', 'enemy'],
            dislikes: ['rest', 'shop'],
            supportNodeTypes: ['forbidden_altar', 'enemy', 'elite'],
            pressureNodeTypes: ['rest'],
            support: { energy: 1, ringExp: 12 },
            threat: { enemyHpMul: 1.08, enemyAtkMul: 1.1 },
            positiveLabel: '烬誓催锋',
            negativeLabel: '烬誓逼战'
        },
        covenant_lodge: {
            id: 'covenant_lodge',
            icon: '📜',
            name: '契律馆',
            agenda: '偏爱法宝、法则、炼器与结构完整的 build，不喜无序冒进。',
            likes: ['forge', 'memory_rift', 'observatory'],
            dislikes: ['enemy'],
            supportNodeTypes: ['forge', 'memory_rift'],
            pressureNodeTypes: ['boss'],
            support: { ringExp: 22, gold: 20 },
            threat: { enemyHpMul: 1.09, enemyAtkMul: 1.07 },
            positiveLabel: '契律校准',
            negativeLabel: '答卷加压'
        },
        wild_hunt: {
            id: 'wild_hunt',
            icon: '🐺',
            name: '荒猎群盟',
            agenda: '只看狩猎结果，欣赏追击与精英路线，轻视过度保守的商路玩法。',
            likes: ['enemy', 'elite', 'trial'],
            dislikes: ['shop', 'rest'],
            supportNodeTypes: ['enemy', 'elite'],
            pressureNodeTypes: ['rest', 'shop'],
            support: { block: 4, gold: 18 },
            threat: { enemyHpMul: 1.1, enemyAtkMul: 1.09 },
            positiveLabel: '猎群照拂',
            negativeLabel: '猎群索命'
        }
    };

    const buildNemesisVariants = (profile = {}) => ([
        {
            id: 'hunt',
            label: '追猎压制',
            note: '首轮追猎会先检定你当前章节最薄弱的一拍。',
            hpMul: 1,
            atkMul: 1,
            titlePrefix: '【仇敌】',
            intentSuffix: '仇敌压制'
        },
        {
            id: 'recurrence',
            label: '回返追猎',
            note: '若让它暂退，下次现身会专门放大上次暴露出的漏洞。',
            hpMul: Math.max(1.04, Number(profile.recurrenceHpMul) || 1.08),
            atkMul: Math.max(1.04, Number(profile.recurrenceAtkMul) || 1.08),
            titlePrefix: '【再临】',
            intentSuffix: '回返压制'
        },
        {
            id: 'allied',
            label: '势力合围',
            note: '一旦投靠势力，它的出手会更偏向合围和资源挤压。',
            hpMul: Math.max(1.04, Number(profile.alliedHpMul) || 1.06),
            atkMul: Math.max(1.04, Number(profile.alliedAtkMul) || 1.08),
            titlePrefix: '【合围】',
            intentSuffix: '势力合围'
        },
        {
            id: 'guard',
            label: '主宰护卫',
            note: '若拖到终局，它会把前章所有压力压缩成一次护卫检定。',
            hpMul: Math.max(1.08, Number(profile.guardHpMul) || 1.14),
            atkMul: Math.max(1.08, Number(profile.guardAtkMul) || 1.12),
            titlePrefix: '【护卫】',
            intentSuffix: '主宰护卫'
        }
    ]);

    const createNemesisProfile = (profile = {}) => {
        const triggerNodeTypes = Array.isArray(profile.triggerNodeTypes)
            ? profile.triggerNodeTypes.map((value) => String(value || '')).filter(Boolean).slice(0, 4)
            : ['elite'];
        return {
            ...profile,
            clueLine: String(profile.clueLine || '命盘碎屑里留下了一句不完整的追猎暗号。'),
            clueNodeTypes: Array.isArray(profile.clueNodeTypes) && profile.clueNodeTypes.length > 0
                ? profile.clueNodeTypes.map((value) => String(value || '')).filter(Boolean).slice(0, 4)
                : ['event', 'observatory', 'memory_rift'],
            releaseNodeTypes: Array.isArray(profile.releaseNodeTypes) && profile.releaseNodeTypes.length > 0
                ? profile.releaseNodeTypes.map((value) => String(value || '')).filter(Boolean).slice(0, 3)
                : ['event', 'observatory'],
            tradeNodeTypes: Array.isArray(profile.tradeNodeTypes) && profile.tradeNodeTypes.length > 0
                ? profile.tradeNodeTypes.map((value) => String(value || '')).filter(Boolean).slice(0, 3)
                : ['shop'],
            alliedFactionHints: Array.isArray(profile.alliedFactionHints) && profile.alliedFactionHints.length > 0
                ? profile.alliedFactionHints.map((value) => String(value || '')).filter(Boolean).slice(0, 3)
                : ['wild_hunt', 'ash_covenant'],
            recursOnVictoryNodeTypes: Array.isArray(profile.recursOnVictoryNodeTypes)
                ? profile.recursOnVictoryNodeTypes.map((value) => String(value || '')).filter(Boolean).slice(0, 3)
                : (triggerNodeTypes.includes('enemy') ? ['enemy'] : []),
            bossGuardEligible: profile.bossGuardEligible !== false,
            battleVariants: Array.isArray(profile.battleVariants) && profile.battleVariants.length >= 2
                ? profile.battleVariants
                : buildNemesisVariants(profile)
        };
    };

    const NEMESIS_PROFILES = {
        chapter1: [
            {
                id: 'ember_scout',
                chapterIndex: 1,
                icon: '🏹',
                name: '裂誓斥候',
                epithet: '猎拍先声',
                intro: '总会比你更快一步看见缺口，专门惩罚前期失误。',
                triggerNodeTypes: ['elite', 'enemy'],
                hpMul: 1.22,
                atkMul: 1.16,
                reward: { score: 42, gold: 90, ringExp: 36 },
                clueLine: '望台风痕里写着：它会先盯你最缺护盾的那一拍。',
                alliedFactionHints: ['wild_hunt', 'frontier_bureau'],
                recursOnVictoryNodeTypes: ['enemy']
            },
            {
                id: 'bandit_scribe',
                chapterIndex: 1,
                icon: '🗡️',
                name: '山寨书记',
                epithet: '割账人',
                intro: '会把你每一次补给都记成债，拖得越久越危险。',
                triggerNodeTypes: ['elite'],
                hpMul: 1.26,
                atkMul: 1.12,
                reward: { score: 46, gold: 82, ringExp: 34 },
                clueLine: '浮市账簿角落有一句批注：补给越晚，它来收账时就越狠。'
            }
        ],
        chapter2: [
            {
                id: 'kiln_overseer',
                chapterIndex: 2,
                icon: '🧱',
                name: '熔脉监工',
                epithet: '燃炉督役',
                intro: '善于拖长对局，把炼器章的资源焦虑变成实打实的压制。',
                triggerNodeTypes: ['elite', 'boss'],
                hpMul: 1.24,
                atkMul: 1.14,
                reward: { score: 48, gold: 96, ringExp: 38 },
                clueLine: '炉壁焦痕提醒你：它最爱在你还没补回资源的时候继续加炉火。',
                alliedFactionHints: ['ash_covenant', 'frontier_bureau']
            },
            {
                id: 'slag_appraiser',
                chapterIndex: 2,
                icon: '⛓️',
                name: '渣火估价师',
                epithet: '欠炉清点',
                intro: '会把每次锻造代价折算成战斗压力，越想补件越容易被它抓节奏。',
                triggerNodeTypes: ['shop', 'elite'],
                hpMul: 1.2,
                atkMul: 1.17,
                reward: { score: 47, gold: 92, ringExp: 37 },
                clueLine: '商埠旧单据写着：它只在你以为自己补齐了的时候来抬价。',
                alliedFactionHints: ['ash_covenant', 'caravan_union'],
                tradeNodeTypes: ['shop']
            }
        ],
        chapter3: [
            {
                id: 'star_warden',
                chapterIndex: 3,
                icon: '✨',
                name: '沉星链卫',
                epithet: '伏拍看守',
                intro: '专门等待你节奏断口的一拍，一旦失误就会被它滚成回合劣势。',
                triggerNodeTypes: ['elite', 'trial'],
                hpMul: 1.2,
                atkMul: 1.18,
                reward: { score: 52, gold: 88, ringExp: 40 },
                clueLine: '沉星档案里记着：它会在你最后一张低价值牌后立刻上锁。',
                alliedFactionHints: ['star_seers', 'covenant_lodge']
            },
            {
                id: 'orbit_herald',
                chapterIndex: 3,
                icon: '🪐',
                name: '寂轨传令',
                epithet: '静默延拍',
                intro: '不急着打死你，而是擅长把你的回合拖成一份迟到的答卷。',
                triggerNodeTypes: ['enemy', 'observatory'],
                hpMul: 1.18,
                atkMul: 1.16,
                reward: { score: 49, gold: 86, ringExp: 39 },
                clueLine: '回廊碎镜里有句话：别把高价值收尾留给它来抄题。',
                recursOnVictoryNodeTypes: ['enemy'],
                releaseNodeTypes: ['observatory', 'event'],
                alliedFactionHints: ['star_seers', 'wild_hunt']
            }
        ],
        chapter4: [
            {
                id: 'mirror_broker',
                chapterIndex: 4,
                icon: '🪞',
                name: '镜灾掮客',
                epithet: '代价中介',
                intro: '会盯着你每一笔高收益选择，把代价提前兑现到战斗里。',
                triggerNodeTypes: ['event', 'elite'],
                hpMul: 1.18,
                atkMul: 1.2,
                reward: { score: 50, gold: 92, ringExp: 42 },
                clueLine: '黑市镜面写着：每做一次贪婪选择，它就替你记下一层利息。',
                recursOnVictoryNodeTypes: ['event'],
                alliedFactionHints: ['ash_covenant', 'covenant_lodge']
            },
            {
                id: 'echo_tither',
                chapterIndex: 4,
                icon: '🔁',
                name: '回波税吏',
                epithet: '复制征收',
                intro: '会先模仿你的强项，再向你收回那一部分稳定性。',
                triggerNodeTypes: ['memory_rift', 'elite'],
                hpMul: 1.21,
                atkMul: 1.17,
                reward: { score: 52, gold: 95, ringExp: 43 },
                clueLine: '采井残页提醒你：别用最值钱的收尾牌给它留下模板。',
                clueNodeTypes: ['memory_rift', 'event', 'observatory'],
                alliedFactionHints: ['covenant_lodge', 'star_seers']
            }
        ],
        chapter5: [
            {
                id: 'blood_moon_reaper',
                chapterIndex: 5,
                icon: '🩸',
                name: '血月收契者',
                epithet: '逆债回收',
                intro: '最喜欢在你压血自信的时候出现，把收割局反拧成互相斩杀。',
                triggerNodeTypes: ['elite', 'enemy', 'trial'],
                hpMul: 1.28,
                atkMul: 1.2,
                reward: { score: 56, gold: 110, ringExp: 45 },
                clueLine: '血月祭垣刻着一句忠告：收头前先确认自己还能不能再扛一拍。',
                recursOnVictoryNodeTypes: ['enemy'],
                alliedFactionHints: ['wild_hunt', 'ash_covenant']
            }
        ],
        chapter6: [
            {
                id: 'final_auditor',
                chapterIndex: 6,
                icon: '☯️',
                name: '终律审记',
                epithet: '答卷核验',
                intro: '不是为了杀你而来，而是要确认你这一局究竟有没有资格交卷。',
                triggerNodeTypes: ['elite', 'boss', 'trial'],
                hpMul: 1.3,
                atkMul: 1.18,
                reward: { score: 60, gold: 120, ringExp: 52 },
                clueLine: '终律前庭只留了一行注解：它会把你最常依赖的保命方式当成审题入口。',
                alliedFactionHints: ['frontier_bureau', 'star_seers']
            },
            {
                id: 'vault_reclaimer',
                chapterIndex: 6,
                icon: '🧰',
                name: '合式回收官',
                epithet: '终盘追缴',
                intro: '专门检查你有没有把前面所有补件真正拼成一张终章答卷。',
                triggerNodeTypes: ['forge', 'boss'],
                hpMul: 1.24,
                atkMul: 1.2,
                reward: { score: 58, gold: 118, ringExp: 50 },
                clueLine: '机库校准单上的备注是：缺一块桥接件，就会被它整局拆账。',
                tradeNodeTypes: ['shop', 'forge'],
                alliedFactionHints: ['covenant_lodge', 'caravan_union']
            }
        ]
    };

    const ENRICHED_NEMESIS_PROFILES = Object.fromEntries(
        Object.entries(NEMESIS_PROFILES).map(([chapterKey, profiles]) => [
            chapterKey,
            Array.isArray(profiles) ? profiles.map((profile) => createNemesisProfile(profile)) : []
        ])
    );

    const CHAPTER_ENDING_LABELS = {
        assault: { id: 'assault', icon: '⚔️', name: '强袭过章', desc: '高压推进、主动抢节奏，把本章压成一段持续进攻。' },
        alliance: { id: 'alliance', icon: '🤝', name: '结盟过章', desc: '通过势力支持和路线经营，把压力提前转化为稳定收益。' },
        hunt: { id: 'hunt', icon: '🎯', name: '追猎过章', desc: '把章节中的仇敌与高压节点一起清算，换来更高命盘评价。' },
        sealed: { id: 'sealed', icon: '🔒', name: '封印过章', desc: '更强调读局与资源控制，以较少失误拿到完整答卷。' },
        scarred: { id: 'scarred', icon: '🩹', name: '残胜过章', desc: '勉强冲线但仍保住主线进度，命盘会记下这次危险的答案。' },
        fracture: { id: 'fracture', icon: '🪓', name: '裂局过章', desc: '虽然勉强前进，但本章的目标没有被完整兑现。' }
    };

    window.EXPEDITION_BRANCH_REGIONS = BRANCH_REGIONS;
    window.EXPEDITION_BOUNTY_TEMPLATES = BOUNTY_TEMPLATES;
    window.EXPEDITION_FACTION_PROFILES = FACTION_PROFILES;
    window.EXPEDITION_NEMESIS_PROFILES = ENRICHED_NEMESIS_PROFILES;
    window.EXPEDITION_CHAPTER_ENDINGS = CHAPTER_ENDING_LABELS;
}());
