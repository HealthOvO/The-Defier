/**
 * The Defier V6.0 - 叙事与身份模板
 * 让章节叙事、角色身份、灵契故事与世界观回收都走统一字段。
 */

function cloneNarrativeTemplate(value) {
    if (value == null) return value;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (error) {
        return value;
    }
}

function createChapterNarrativeTemplate(config = {}) {
    const chapterIndex = Math.max(1, Math.floor(Number(config.chapterIndex) || 1));
    const beats = Array.isArray(config.beats)
        ? config.beats.map((beat, index) => ({
            id: String(beat?.id || `${config.id || `chapter_${chapterIndex}`}_beat_${index + 1}`),
            stage: String(beat?.stage || `第 ${index + 1} 段`),
            title: String(beat?.title || '命线未定'),
            summary: String(beat?.summary || ''),
            gameplayHook: String(beat?.gameplayHook || ''),
            linkedSystems: Array.isArray(beat?.linkedSystems) ? beat.linkedSystems.slice() : [],
            uiMeta: {
                tone: String(beat?.uiMeta?.tone || config.uiMeta?.tone || 'chapter'),
                icon: String(beat?.uiMeta?.icon || config.uiMeta?.icon || '✦')
            }
        }))
        : [];

    return {
        id: String(config.id || `chapter_${chapterIndex}_arc`),
        chapterIndex,
        name: String(config.name || `第 ${chapterIndex} 章叙事线`),
        summary: String(config.summary || ''),
        worldviewFocus: Array.isArray(config.worldviewFocus) ? config.worldviewFocus.slice() : [],
        beats,
        finaleRecall: {
            title: String(config.finaleRecall?.title || ''),
            summary: String(config.finaleRecall?.summary || ''),
            systems: Array.isArray(config.finaleRecall?.systems) ? config.finaleRecall.systems.slice() : []
        },
        uiMeta: {
            tone: String(config.uiMeta?.tone || 'chapter'),
            icon: String(config.uiMeta?.icon || '☯️')
        }
    };
}

function createSpiritStoryTemplate(config = {}) {
    return {
        id: String(config.id || 'unknownSpirit'),
        source: String(config.source || '灵契窟 / 章节事件'),
        acquisitionTitle: String(config.acquisitionTitle || '初见之契'),
        acquisitionSummary: String(config.acquisitionSummary || ''),
        witnessTitle: String(config.witnessTitle || '同行见证'),
        witnessSummary: String(config.witnessSummary || ''),
        growthGoal: String(config.growthGoal || ''),
        uiMeta: {
            tone: String(config.uiMeta?.tone || 'spirit'),
            icon: String(config.uiMeta?.icon || '✦')
        }
    };
}

function createCharacterIdentityTemplate(config = {}) {
    return {
        id: String(config.id || 'unknownCharacter'),
        unlockLabel: String(config.unlockLabel || '已解锁'),
        unlockHint: String(config.unlockHint || '可直接出阵'),
        synopsis: String(config.synopsis || ''),
        identityHook: String(config.identityHook || ''),
        keywords: Array.isArray(config.keywords) ? config.keywords.slice() : [],
        recommendedDestinyIds: Array.isArray(config.recommendedDestinyIds) ? config.recommendedDestinyIds.slice() : [],
        recommendedSpiritIds: Array.isArray(config.recommendedSpiritIds) ? config.recommendedSpiritIds.slice() : [],
        exclusiveLine: {
            title: String(config.exclusiveLine?.title || '命线未定'),
            summary: String(config.exclusiveLine?.summary || '')
        },
        uiMeta: {
            tone: String(config.uiMeta?.tone || 'identity'),
            icon: String(config.uiMeta?.icon || '✦')
        }
    };
}

function createWorldviewRecallTemplate(config = {}) {
    return {
        id: String(config.id || 'worldview_recall'),
        label: String(config.label || '命途回响'),
        summary: String(config.summary || ''),
        systems: Array.isArray(config.systems) ? config.systems.slice() : [],
        uiMeta: {
            tone: String(config.uiMeta?.tone || 'worldview'),
            icon: String(config.uiMeta?.icon || '☯️')
        }
    };
}

const V6_CHARACTER_IDENTITY_TEMPLATES = {
    linFeng: createCharacterIdentityTemplate({
        id: 'linFeng',
        unlockLabel: '初始可选',
        unlockHint: '默认觉醒的逆命者，适合从命格与誓约理解整套 V6.0 骨架。',
        synopsis: '他是被命环强行留下裂缝的人，也是最先敢把“改命”当作武器的人。',
        identityHook: '以命环进化为主轴，把风险决策转成爆发窗口。',
        keywords: ['逆命成长', '首击滚节奏', '高压转势'],
        recommendedDestinyIds: ['foldedEdge', 'rebelScale'],
        recommendedSpiritIds: ['swordWraith', 'spiritApe'],
        exclusiveLine: {
            title: '裂环初鸣',
            summary: '林风的专属线围绕“命环为何会主动裂开”展开，终章会把这一问带回天命裂界的本源。'
        },
        uiMeta: { tone: 'fate', icon: '✦' }
    }),
    xiangYe: createCharacterIdentityTemplate({
        id: 'xiangYe',
        unlockLabel: '医脉已启',
        unlockHint: '适合体验治疗、护道与献祭代价如何共存。',
        synopsis: '香叶并不是单纯的奶系角色，她每次疗伤都在和体内的逆生咒谈条件。',
        identityHook: '把续航、净化与代价置换打成一条线。',
        keywords: ['逆生咒', '疗伤换势', '续航博弈'],
        recommendedDestinyIds: ['deepMeridian', 'soulAnchor'],
        recommendedSpiritIds: ['blackTortoise', 'emberCrow'],
        exclusiveLine: {
            title: '逆生咒札',
            summary: '她的专属线会追问“治愈为何总伴随伤口”，并把洞府研究与终章抉择连接起来。'
        },
        uiMeta: { tone: 'spirit', icon: '🌿' }
    }),
    wuYu: createCharacterIdentityTemplate({
        id: 'wuYu',
        unlockLabel: '法相可用',
        unlockHint: '更适合体验护盾、阵御与誓约代价的正反反馈。',
        synopsis: '无欲看似稳守，实际上是在用苦行把每一次吃伤都压进下一拍的反击里。',
        identityHook: '护盾不只是防御，而是把守势压成反制。',
        keywords: ['金刚守转攻', '阵御反制', '厚盾收益'],
        recommendedDestinyIds: ['armorTemper', 'soulAnchor'],
        recommendedSpiritIds: ['blackTortoise', 'artifactSoul'],
        exclusiveLine: {
            title: '苦行问心',
            summary: '无欲的专属线会回到“镇狱誓为何诱人”这一问题，检定你能否把守势坚持到底。'
        },
        uiMeta: { tone: 'sanctum', icon: '🛡️' }
    }),
    yanHan: createCharacterIdentityTemplate({
        id: 'yanHan',
        unlockLabel: '典籍已开',
        unlockHint: '推荐从她开始理解法则编织、观星与章节信息优势。',
        synopsis: '严寒看待命环像看待一部会反咬人的古籍，她的强势来自先一步读懂规则。',
        identityHook: '把法则、事件与信息优势提前兑现成中盘掌控。',
        keywords: ['法则编织', '预知筹划', '知识夺势'],
        recommendedDestinyIds: ['starMemory', 'gapInsight'],
        recommendedSpiritIds: ['starFox', 'frostChi'],
        exclusiveLine: {
            title: '失传注解',
            summary: '严寒的专属线会把命环与法则的语言学来源补全，是世界观总回收的重要支点。'
        },
        uiMeta: { tone: 'wisdom', icon: '📘' }
    }),
    moChen: createCharacterIdentityTemplate({
        id: 'moChen',
        unlockLabel: '星律可追',
        unlockHint: '适合体验章节节奏、连锁与路线推演的收束感。',
        synopsis: '墨尘像在裂隙边缘写战报的人，越是混乱的战局，越能被他拆成可执行的节拍。',
        identityHook: '通过星律节拍把中盘铺垫稳稳转成终结。',
        keywords: ['连锁节拍', '路线前推', '次回合筹划'],
        recommendedDestinyIds: ['starMemory', 'echoScripture'],
        recommendedSpiritIds: ['starFox', 'spiritApe'],
        exclusiveLine: {
            title: '裂隙巡录',
            summary: '墨尘的专属线会把章节间的裂隙异象串起来，补齐“世界为何正在裂开”的过程。'
        },
        uiMeta: { tone: 'chapter', icon: '🌠' }
    }),
    ningXuan: createCharacterIdentityTemplate({
        id: 'ningXuan',
        unlockLabel: '器脉可通',
        unlockHint: '推荐配合炼器室、套装研究与法宝编组体验 V6.0 的装备向成长。',
        synopsis: '宁玄把法宝当作会呼吸的构筑件，她更擅长让装备、灵契与命环一起工作。',
        identityHook: '用法宝同频把攻防和资源回收压进同一回合。',
        keywords: ['法宝套装', '器灵灌注', '攻防同频'],
        recommendedDestinyIds: ['hiddenScript', 'preceptSeal'],
        recommendedSpiritIds: ['artifactSoul', 'blackTortoise'],
        exclusiveLine: {
            title: '器脉回响',
            summary: '宁玄的专属线会把炼器室与洞府传承接起来，回答“法宝为何能记住前人命数”。'
        },
        uiMeta: { tone: 'treasure', icon: '🪬' }
    })
};

const V6_CHAPTER_NARRATIVE_ARCS = {
    1: createChapterNarrativeTemplate({
        id: 'chapter_1_fractured_hunt',
        chapterIndex: 1,
        name: '裂誓追猎',
        summary: '第一章不只是教学关，而是让玩家第一次理解“改命”为什么必然伴随追猎。',
        worldviewFocus: ['命数与改命', '誓约的赌注'],
        beats: [
            {
                stage: '前段·裂印',
                title: '天罚者先至',
                summary: '你刚露出命环裂缝，就会被世界规则主动标记，普通节点也带着问罪意味。',
                gameplayHook: '鼓励抢先手、抢收益，把第一段优势尽快兑现。',
                linkedSystems: ['命格', '先手爆发'],
                uiMeta: { tone: 'fate', icon: '🜂' }
            },
            {
                stage: '中段·追压',
                title: '裂誓围猎',
                summary: '敌人不再只是挡路，而是在试探你敢不敢继续压血、继续往前赌。',
                gameplayHook: '精英、试炼与高压路线在这里第一次真正成立。',
                linkedSystems: ['誓约', '试炼碑', '精英路线'],
                uiMeta: { tone: 'oath', icon: '⛓️' }
            },
            {
                stage: '末段·问锋',
                title: '谁配先改命',
                summary: '章节主宰会追问你的锋芒到底来自勇气还是侥幸，若只靠面板会很快露馅。',
                gameplayHook: 'Boss 会检定你是否真的围绕命格或誓约成形。',
                linkedSystems: ['Boss 三幕', '构筑主轴'],
                uiMeta: { tone: 'chapter', icon: '⚔️' }
            }
        ],
        finaleRecall: {
            title: '裂誓回声',
            summary: '第一章把“命格是改命起点、誓约是改命代价”这组语言先钉死。',
            systems: ['命格', '誓约']
        },
        uiMeta: { tone: 'chapter', icon: '🜂' }
    }),
    2: createChapterNarrativeTemplate({
        id: 'chapter_2_forge_test',
        chapterIndex: 2,
        name: '炉海锻心',
        summary: '第二章用资源灼烧与回铸压力告诉玩家，真正的成长不只是拿牌，而是把损耗也变成节奏。',
        worldviewFocus: ['法宝与器脉', '传承与锻造'],
        beats: [
            {
                stage: '前段·投炉',
                title: '器脉认主',
                summary: '天阙会先看你敢不敢把护盾、资源与锻造入口当成长期投资。',
                gameplayHook: '炼器坊、营地、法宝套装开始显著影响路线。',
                linkedSystems: ['炼器坊', '法宝套装', '营地'],
                uiMeta: { tone: 'treasure', icon: '⚒️' }
            },
            {
                stage: '中段·回锻',
                title: '每次挨打都要有去处',
                summary: '炉海不奖励空防御，它要求你把护盾和承伤都压回下一拍的收益。',
                gameplayHook: '厚盾、反锻、器灵灌注开始形成独立价值。',
                linkedSystems: ['地脉', '器灵', '护盾反制'],
                uiMeta: { tone: 'sanctum', icon: '🛡️' }
            },
            {
                stage: '末段·定器',
                title: '锻成还是熔毁',
                summary: '章节主宰会逼你证明这一路的资源投入不是拖拍，而是真正在塑造赢法。',
                gameplayHook: 'Boss 重点检定资源利用率与装备协同。',
                linkedSystems: ['Boss 三幕', '法宝研究'],
                uiMeta: { tone: 'chapter', icon: '🔥' }
            }
        ],
        finaleRecall: {
            title: '炉海回声',
            summary: '第二章把“洞府传承与法宝研究为何重要”提前埋入玩法语言。',
            systems: ['法宝', '洞府']
        },
        uiMeta: { tone: 'chapter', icon: '⚒️' }
    }),
    3: createChapterNarrativeTemplate({
        id: 'chapter_3_starlit_archive',
        chapterIndex: 3,
        name: '沉星校录',
        summary: '第三章把牌序、预知与事件收益拉到同一条线上，让叙事开始承担构筑改向功能。',
        worldviewFocus: ['法则与信息优势', '记忆与观星'],
        beats: [
            {
                stage: '前段·观星',
                title: '星象不是装饰',
                summary: '古庭会先奖励愿意读信息的人，天象、路线与商路价值第一次被明确放大。',
                gameplayHook: '观星台、事件与法则槽位更容易带来连锁收益。',
                linkedSystems: ['观星台', '法则编织', '事件收益'],
                uiMeta: { tone: 'wisdom', icon: '🌠' }
            },
            {
                stage: '中段·校录',
                title: '答案都写在下一拍',
                summary: '若你愿意为下一回合布局，章节本身就会把你推向更稳定的成型线。',
                gameplayHook: '延迟收益、预埋牌序与次回合规划会被章节规则强化。',
                linkedSystems: ['章节规则', '记忆裂隙'],
                uiMeta: { tone: 'chapter', icon: '📜' }
            },
            {
                stage: '末段·追问',
                title: '你看到未来了吗',
                summary: '主宰会逼你证明观星不是嘴上功夫，而是真的能把信息转成胜率。',
                gameplayHook: 'Boss 会围绕牌序、星律与事件布局出题。',
                linkedSystems: ['Boss 三幕', '观星预告'],
                uiMeta: { tone: 'chapter', icon: '🔭' }
            }
        ],
        finaleRecall: {
            title: '沉星回声',
            summary: '第三章把“法则是被夺取和被编织的世界规则”说得足够清楚。',
            systems: ['法则', '观星台']
        },
        uiMeta: { tone: 'chapter', icon: '🌠' }
    }),
    4: createChapterNarrativeTemplate({
        id: 'chapter_4_mirror_verdict',
        chapterIndex: 4,
        name: '悬镜照骨',
        summary: '第四章把复制、诅咒和反照变成“你做过的选择会回来质问你”的玩法叙事。',
        worldviewFocus: ['代价与执念', '镜像与反照'],
        beats: [
            {
                stage: '前段·照影',
                title: '镜里先看见弱点',
                summary: '深渊会把你上一拍的收尾方式反照回来，逼你认识构筑最脆的一面。',
                gameplayHook: '净化、防错与牌序控制的重要性显著提升。',
                linkedSystems: ['净化', '诅咒', '镜返'],
                uiMeta: { tone: 'oath', icon: '🪞' }
            },
            {
                stage: '中段·回咒',
                title: '代价会留下影子',
                summary: '这里的风险交易不是一次性买卖，每个高收益决定都会在后续节点继续追债。',
                gameplayHook: '禁术坛、事件与镜像敌人共同强化长期代价。',
                linkedSystems: ['禁术坛', '事件抉择'],
                uiMeta: { tone: 'chapter', icon: '☠️' }
            },
            {
                stage: '末段·照骨',
                title: '答案是你自己留下的',
                summary: 'Boss 最终检定的不是面板，而是你有没有为高收益留下足够的反制余地。',
                gameplayHook: 'Boss 会围绕复制、反照和减益管理追问。',
                linkedSystems: ['Boss 三幕', '反制窗口'],
                uiMeta: { tone: 'chapter', icon: '🧿' }
            }
        ],
        finaleRecall: {
            title: '悬镜回声',
            summary: '第四章把“誓约为什么总要付代价”从文案变成了可玩的章节语法。',
            systems: ['誓约', '禁术']
        },
        uiMeta: { tone: 'chapter', icon: '🪞' }
    }),
    5: createChapterNarrativeTemplate({
        id: 'chapter_5_blood_moon_oath',
        chapterIndex: 5,
        name: '血月赌命',
        summary: '第五章把压血、收割、献祭和狂化阈值推进到极限，逼你正面回答“值不值得赌”。',
        worldviewFocus: ['代价与执念', '灵契见证'],
        beats: [
            {
                stage: '前段·逼阈',
                title: '血线先说话',
                summary: '禁庭不会给中庸打法喘息，它会持续把你推向收益与危险同时抬升的阈值。',
                gameplayHook: '压血、献祭与收割回生的价值大幅提升。',
                linkedSystems: ['压血构筑', '灵契护道'],
                uiMeta: { tone: 'spirit', icon: '🌕' }
            },
            {
                stage: '中段·赌命',
                title: '谁替你见证这条路',
                summary: '血月下的灵契不只是战力补位，而是你敢不敢继续赌下去的同行见证。',
                gameplayHook: '灵契主动、誓约代价与事件交易会被同时放大。',
                linkedSystems: ['灵契', '誓约', '事件'],
                uiMeta: { tone: 'oath', icon: '🩸' }
            },
            {
                stage: '末段·狂月',
                title: '活下来的人才有答案',
                summary: '主宰会在你最脆的血线处发问，考的不是敢不敢爆，而是爆完之后如何收束。',
                gameplayHook: 'Boss 检定压血收益能否闭环成胜利，而不是只打高数字。',
                linkedSystems: ['Boss 三幕', '处决窗口'],
                uiMeta: { tone: 'chapter', icon: '🔥' }
            }
        ],
        finaleRecall: {
            title: '血月回声',
            summary: '第五章把“灵契负责同行与见证”明确塞进章节情感骨架。',
            systems: ['灵契', '誓约']
        },
        uiMeta: { tone: 'chapter', icon: '🌕' }
    }),
    6: createChapterNarrativeTemplate({
        id: 'chapter_6_final_reckoning',
        chapterIndex: 6,
        name: '终庭总回收',
        summary: '终章会把命格、法则、誓约、灵契、章节与洞府全部拉回同一套世界观话语里。',
        worldviewFocus: ['命数与改命', '世界规则与夺取', '代价与执念', '同行与见证', '传承与归宿'],
        beats: [
            {
                stage: '前段·命问',
                title: '命格先被点名',
                summary: '终庭首先检定的是你到底成了什么样的人，而不是你打出了多少数值。',
                gameplayHook: '命格、誓约与灵契的缺轴会立即在战场上暴露。',
                linkedSystems: ['命格', '誓约', '灵契'],
                uiMeta: { tone: 'fate', icon: '☯️' }
            },
            {
                stage: '中段·编庭',
                title: '法则要写成答卷',
                summary: '这里不再容忍单轴打法，法则、法宝、章节规则必须真正互相支撑。',
                gameplayHook: '法则编织、法宝套装与章节地脉会被同时拉上战场。',
                linkedSystems: ['法则编织', '法宝', '章节规则'],
                uiMeta: { tone: 'wisdom', icon: '⌘' }
            },
            {
                stage: '末段·归宿',
                title: '洞府替你留下什么',
                summary: '终章最终追问的不是你赢没赢，而是失败之后是否真的打开了新的命途。',
                gameplayHook: '洞府研究、图鉴收录、Boss 记忆战与周挑战都被回收到长期目标里。',
                linkedSystems: ['洞府', '图鉴', '周挑战', 'Boss 记忆战'],
                uiMeta: { tone: 'sanctum', icon: '🏛️' }
            }
        ],
        finaleRecall: {
            title: '终焉回收',
            summary: '命环负责命数与改命，法则负责世界规则与夺取，誓约负责代价与执念，灵契负责同行与见证，洞府负责传承与归宿。',
            systems: ['命格', '法则', '誓约', '灵契', '洞府']
        },
        uiMeta: { tone: 'worldview', icon: '☯️' }
    })
};

const V6_SPIRIT_STORY_TEMPLATES = {
    frostChi: createSpiritStoryTemplate({
        id: 'frostChi',
        source: '碎誓外域 / 灵契窟',
        acquisitionTitle: '霜渊留痕',
        acquisitionSummary: '你不是驯服霜螭，而是在它愿意慢半拍回头时，证明自己看得懂节奏的价值。',
        witnessTitle: '寒潮见证',
        witnessSummary: '它见证的不是你多稳，而是你能否在最急的一拍仍然守住结构。',
        growthGoal: '优先围绕控制、护盾与后手回收补件，能更快看见完整契阶。',
        uiMeta: { tone: 'spirit', icon: '🐉' }
    }),
    emberCrow: createSpiritStoryTemplate({
        id: 'emberCrow',
        source: '血月禁庭 / 灵契窟',
        acquisitionTitle: '烛焰认主',
        acquisitionSummary: '烛鸦只会追随那些愿意把伤口烧成资源的人，它认的是胆量，不是血量。',
        witnessTitle: '血焰见证',
        witnessSummary: '每次自损都像在问一句“这一口血到底值不值”，烛鸦替你把答案烧亮。',
        growthGoal: '自损、献祭与范围伤害越完整，它的主动就越接近真正的收束按钮。',
        uiMeta: { tone: 'spirit', icon: '🐦' }
    }),
    starFox: createSpiritStoryTemplate({
        id: 'starFox',
        source: '沉星古庭 / 观星回响',
        acquisitionTitle: '星步试心',
        acquisitionSummary: '星狐不会直接给答案，它更像把答案提前放到你肯去看的位置。',
        witnessTitle: '牌序见证',
        witnessSummary: '它见证的是你能否把未来两拍当成当前回合的一部分。',
        growthGoal: '多抽牌、技能连段与费用整理能最快放大它的价值。',
        uiMeta: { tone: 'wisdom', icon: '🦊' }
    }),
    blackTortoise: createSpiritStoryTemplate({
        id: 'blackTortoise',
        source: '炉海天阙 / 灵契窟',
        acquisitionTitle: '龟息镇潮',
        acquisitionSummary: '玄龟并不是迟钝，而是愿意替你把最难的那一拍完整顶住。',
        witnessTitle: '护阵见证',
        witnessSummary: '它记录的是你如何把护盾从防守资源，变成真正的反打资本。',
        growthGoal: '护盾、净化与拖回合收益越稳定，玄龟越像真正的第二命。',
        uiMeta: { tone: 'sanctum', icon: '🐢' }
    }),
    nightmareButterfly: createSpiritStoryTemplate({
        id: 'nightmareButterfly',
        source: '悬镜深渊 / 梦魇裂片',
        acquisitionTitle: '裂梦落翅',
        acquisitionSummary: '魇蝶不是制造裂缝，而是在你已经撕开口子时，把那道缝持续扩大。',
        witnessTitle: '梦魇见证',
        witnessSummary: '它见证的是你如何把敌人的第一处失衡，滚成整场战斗的倾斜。',
        growthGoal: '易伤、虚弱、诅咒与连段追击越多，它的收束越稳定。',
        uiMeta: { tone: 'spirit', icon: '🦋' }
    }),
    spiritApe: createSpiritStoryTemplate({
        id: 'spiritApe',
        source: '碎誓外域 / 林间回路',
        acquisitionTitle: '踏枝听势',
        acquisitionSummary: '灵猿会追随那些愿意把整回合拆成细碎节拍的人，它认的是手感与速度。',
        witnessTitle: '连势见证',
        witnessSummary: '它替你见证每次小收益如何连成一次真正的大回合。',
        growthGoal: '低费连段、抽牌与指令穿插越多，灵猿越能把节奏推过临界点。',
        uiMeta: { tone: 'spirit', icon: '🐒' }
    }),
    swordWraith: createSpiritStoryTemplate({
        id: 'swordWraith',
        source: '血月禁庭 / 剑痕残响',
        acquisitionTitle: '断锋留念',
        acquisitionSummary: '剑魄只认一种出手方式: 知道什么时候先撕开缝，再把命一口收走。',
        witnessTitle: '处决见证',
        witnessSummary: '它见证的是你有没有真的看见敌人最薄的一道护势。',
        growthGoal: '单点爆发、破甲与精英/Boss 检定越集中，它的价值越高。',
        uiMeta: { tone: 'spirit', icon: '⚔️' }
    }),
    artifactSoul: createSpiritStoryTemplate({
        id: 'artifactSoul',
        source: '炉海天阙 / 炼器室',
        acquisitionTitle: '器魂复醒',
        acquisitionSummary: '器灵不是法宝的附赠品，而是法宝愿意再次和人同频时留下的回应。',
        witnessTitle: '器脉见证',
        witnessSummary: '它见证的是装备、命环与灵契如何真正组成一套完整系统。',
        growthGoal: '法宝套装、灌注与重铸链越成熟，器灵的研究推进越快。',
        uiMeta: { tone: 'treasure', icon: '🛠️' }
    })
};

const V6_WORLDVIEW_RECALL = [
    createWorldviewRecallTemplate({
        id: 'recall_fate',
        label: '命格',
        summary: '命格不是数值签，而是这一局你愿意先承担哪一种命数。',
        systems: ['角色', '命格', '章节起手'],
        uiMeta: { tone: 'fate', icon: '✦' }
    }),
    createWorldviewRecallTemplate({
        id: 'recall_law',
        label: '法则',
        summary: '法则不是捡到的被动，而是从世界规则里撬下来的语法碎片。',
        systems: ['法则编织', '章节天象'],
        uiMeta: { tone: 'wisdom', icon: '⌘' }
    }),
    createWorldviewRecallTemplate({
        id: 'recall_vow',
        label: '誓约',
        summary: '誓约代表你愿意为了哪种执念支付长期代价，所以必须始终可读、可见、可后悔。',
        systems: ['逆命誓约', '事件抉择'],
        uiMeta: { tone: 'oath', icon: '⛓️' }
    }),
    createWorldviewRecallTemplate({
        id: 'recall_spirit',
        label: '灵契',
        summary: '灵契是与你同行的见证者，它们不替你赢，而是把你真正的方向放大。',
        systems: ['灵契护道', '灵契图鉴'],
        uiMeta: { tone: 'spirit', icon: '🐉' }
    }),
    createWorldviewRecallTemplate({
        id: 'recall_sanctum',
        label: '洞府',
        summary: '洞府是失败后的归宿，也是下一次再出发前把碎片重新拼好的地方。',
        systems: ['洞府房间', '研究项', 'Boss 记忆战', '周挑战'],
        uiMeta: { tone: 'sanctum', icon: '🏛️' }
    })
];

const V6_EVENT_PRESENTATION_TEMPLATES = {
    generic: {
        tone: 'chapter',
        atmosphere: '命数回响正在逼近，抉择会直接改写接下来的路线。',
        summaryLabel: '局内摘要'
    },
    rest: {
        tone: 'sanctum',
        atmosphere: '这是少数能暂时放下杀机、重新修补命途的缝隙。'
    },
    event: {
        tone: 'chapter',
        atmosphere: '事件不再只是补给点，而是章节叙事与构筑改向的交叉口。'
    },
    observatory: {
        tone: 'wisdom',
        atmosphere: '观星台给出的从来不是答案，而是下一步该押注什么的提示。'
    },
    forbidden: {
        tone: 'oath',
        atmosphere: '禁术的价值都写在代价背面，你必须清楚自己正在卖掉什么。'
    },
    memory: {
        tone: 'worldview',
        atmosphere: '记忆裂隙不是背景故事，而是你理解章节与主宰的另一条战术入口。'
    },
    vow: {
        tone: 'oath',
        atmosphere: '誓约会把收益与代价一起写进后续地图，所以必须读懂再签。'
    }
};

function getV6ChapterNarrativeTemplate(chapterIndex) {
    return cloneNarrativeTemplate(V6_CHAPTER_NARRATIVE_ARCS[Math.max(1, Math.floor(Number(chapterIndex) || 1))] || null);
}

function getV6SpiritStoryTemplate(spiritId) {
    return cloneNarrativeTemplate(V6_SPIRIT_STORY_TEMPLATES[String(spiritId || '')] || null);
}

function getV6CharacterIdentityTemplate(characterId) {
    return cloneNarrativeTemplate(V6_CHARACTER_IDENTITY_TEMPLATES[String(characterId || '')] || null);
}
