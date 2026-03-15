/**
 * The Defier - 周挑战规则定义
 * 以轮换模板驱动今日天机 / 七日劫数 / 众生试炼。
 */

window.CHALLENGE_RULES = {
    daily: [
        {
            id: 'daily_ember_break',
            icon: '🔥',
            name: '焚脉试锋',
            intro: '以灼脉快攻切开第一章，用最短的节拍抢下破局点。',
            objective: '以林风完成第 1 章，并尽量用更高血量冲线。',
            targetChapter: '第1章·碎誓外域',
            goalRealm: 3,
            characterId: 'linFeng',
            runDestinyId: 'emberHeart',
            spiritCompanionId: 'swordWraith',
            vowIds: ['blazingLife'],
            tags: ['首回合压制', '破甲收头', '试炼前压'],
            battleModifiers: {
                enemyHpMul: 1.08,
                enemyAtkMul: 1.1,
                enemyOpeningBlock: 3
            },
            rewardTrack: [
                {
                    id: 'daily_clear',
                    label: '完成今日天机',
                    target: 1,
                    rewardText: '天道币 +120 / 藏经阁记录「今日天机·焚脉试锋」',
                    rewards: [
                        { kind: 'pvpCoins', amount: 120 },
                        { kind: 'codexRecord', id: 'daily_ember_break_record', name: '今日天机·焚脉试锋', icon: '🔥', note: '已完成焚脉试锋，当日观星记录入档。' }
                    ]
                }
            ]
        },
        {
            id: 'daily_frost_clinic',
            icon: '❄️',
            name: '寒潮行医',
            intro: '稳住血线与节奏，用冰脉延后一切失控时刻。',
            objective: '以香叶完成第 1 章，尽量少吃高压爆发。',
            targetChapter: '第1章·碎誓外域',
            goalRealm: 3,
            characterId: 'xiangYe',
            runDestinyId: 'tideMirror',
            spiritCompanionId: 'frostChi',
            vowIds: ['silentReturn'],
            tags: ['回生护阵', '延后敌势', '低血稳态'],
            battleModifiers: {
                enemyHpMul: 1.06,
                enemyAtkMul: 1.12,
                enemyDebuff: { type: 'weak', value: 1, intent: '天机寒潮' }
            },
            rewardTrack: [
                {
                    id: 'daily_clear',
                    label: '完成今日天机',
                    target: 1,
                    rewardText: '天道币 +120 / 藏经阁记录「今日天机·寒潮行医」',
                    rewards: [
                        { kind: 'pvpCoins', amount: 120 },
                        { kind: 'codexRecord', id: 'daily_frost_clinic_record', name: '今日天机·寒潮行医', icon: '❄️', note: '已完成寒潮行医，当日观星记录入档。' }
                    ]
                }
            ]
        },
        {
            id: 'daily_bastion_vow',
            icon: '🛡️',
            name: '玄甲守誓',
            intro: '高压环境下验证厚甲与反打窗口，先活下来再完成反扑。',
            objective: '以无欲完成第 1 章，让护盾循环撑过前段试探。',
            targetChapter: '第1章·碎誓外域',
            goalRealm: 3,
            characterId: 'wuYu',
            runDestinyId: 'soulAnchor',
            spiritCompanionId: 'blackTortoise',
            vowIds: ['wardingPrison'],
            tags: ['护盾滚动', '稳守反击', '长线压制'],
            battleModifiers: {
                enemyHpMul: 1.1,
                enemyAtkMul: 1.08,
                enemyOpeningBlock: 4
            },
            rewardTrack: [
                {
                    id: 'daily_clear',
                    label: '完成今日天机',
                    target: 1,
                    rewardText: '天道币 +120 / 藏经阁记录「今日天机·玄甲守誓」',
                    rewards: [
                        { kind: 'pvpCoins', amount: 120 },
                        { kind: 'codexRecord', id: 'daily_bastion_vow_record', name: '今日天机·玄甲守誓', icon: '🛡️', note: '已完成玄甲守誓，当日观星记录入档。' }
                    ]
                }
            ]
        },
        {
            id: 'daily_star_script',
            icon: '✨',
            name: '星录推演',
            intro: '把起手质量与技能链拉满，让第一章成为一场精算演示。',
            objective: '以严寒完成第 1 章，优先通过技能链稳住手牌。',
            targetChapter: '第1章·碎誓外域',
            goalRealm: 3,
            characterId: 'yanHan',
            runDestinyId: 'hiddenScript',
            spiritCompanionId: 'starFox',
            vowIds: ['heavenlyGaze'],
            tags: ['手牌修正', '路线预判', '技能回响'],
            battleModifiers: {
                enemyHpMul: 1.05,
                enemyAtkMul: 1.14,
                enemyDebuff: { type: 'vulnerable', value: 1, intent: '天机碎镜' }
            },
            rewardTrack: [
                {
                    id: 'daily_clear',
                    label: '完成今日天机',
                    target: 1,
                    rewardText: '天道币 +120 / 藏经阁记录「今日天机·星录推演」',
                    rewards: [
                        { kind: 'pvpCoins', amount: 120 },
                        { kind: 'codexRecord', id: 'daily_star_script_record', name: '今日天机·星录推演', icon: '✨', note: '已完成星录推演，当日观星记录入档。' }
                    ]
                }
            ]
        }
    ],
    weekly: [
        {
            id: 'weekly_breaking_tide',
            icon: '🌊',
            name: '七日劫数·断潮局',
            intro: '以快节奏压制穿过前两章，七日内重复冲分。',
            objective: '以林风打通第 2 章，反复冲击更高总分。',
            targetChapter: '第2章·炉海天阙',
            goalRealm: 6,
            characterId: 'linFeng',
            runDestinyId: 'rebelScale',
            spiritCompanionId: 'emberCrow',
            vowIds: ['blazingLife', 'realmBreak'],
            tags: ['压血爆发', '连续冲分', '双誓前压'],
            battleModifiers: {
                enemyHpMul: 1.12,
                enemyAtkMul: 1.14,
                enemyOpeningBlock: 4
            },
            rewardTrack: [
                {
                    id: 'weekly_score_360',
                    label: '周积分 360',
                    target: 360,
                    rewardText: '天道币 +180',
                    rewards: [{ kind: 'pvpCoins', amount: 180 }]
                },
                {
                    id: 'weekly_score_620',
                    label: '周积分 620',
                    target: 620,
                    rewardText: '传承精魄 +8 / 洞府记录「观星台·断潮局」',
                    rewards: [
                        { kind: 'legacyEssence', amount: 8 },
                        { kind: 'codexRecord', id: 'weekly_breaking_tide_record', name: '观星台·断潮局', icon: '🌊', note: '七日劫数已累计穿过双章节，观星台记下断潮局样本。' }
                    ]
                },
                {
                    id: 'weekly_score_860',
                    label: '周积分 860',
                    target: 860,
                    rewardText: '称号·独断万古（若已拥有则天道币 +300）',
                    rewards: [{ kind: 'pvpItem', itemId: 'title_supreme', fallbackCoins: 300 }]
                }
            ]
        },
        {
            id: 'weekly_sealed_forge',
            icon: '⚒️',
            name: '七日劫数·封炉谱',
            intro: '围绕炼器与守势推进中局，把慢热构筑打成高完成度样本。',
            objective: '以宁玄打通第 2 章，优先提高法宝与护阵协同。',
            targetChapter: '第2章·炉海天阙',
            goalRealm: 6,
            characterId: 'ningXuan',
            runDestinyId: 'spiritVault',
            spiritCompanionId: 'artifactSoul',
            vowIds: ['wardingPrison', 'heavenlyGaze'],
            tags: ['法宝共振', '器灵灌注', '守阵滚雪球'],
            battleModifiers: {
                enemyHpMul: 1.14,
                enemyAtkMul: 1.1,
                enemyOpeningBlock: 5,
                enemyDebuff: { type: 'weak', value: 1, intent: '封炉震压' }
            },
            rewardTrack: [
                {
                    id: 'weekly_score_360',
                    label: '周积分 360',
                    target: 360,
                    rewardText: '天道币 +180',
                    rewards: [{ kind: 'pvpCoins', amount: 180 }]
                },
                {
                    id: 'weekly_score_620',
                    label: '周积分 620',
                    target: 620,
                    rewardText: '传承精魄 +8 / 洞府记录「观星台·封炉谱」',
                    rewards: [
                        { kind: 'legacyEssence', amount: 8 },
                        { kind: 'codexRecord', id: 'weekly_sealed_forge_record', name: '观星台·封炉谱', icon: '⚒️', note: '七日劫数的炼器样本已入档，可在观星台复盘。' }
                    ]
                },
                {
                    id: 'weekly_score_860',
                    label: '周积分 860',
                    target: 860,
                    rewardText: '称号·独断万古（若已拥有则天道币 +300）',
                    rewards: [{ kind: 'pvpItem', itemId: 'title_supreme', fallbackCoins: 300 }]
                }
            ]
        }
    ],
    global: [
        {
            id: 'global_mirror_crack',
            icon: '🜂',
            name: '众生试炼·裂镜公案',
            intro: '全服统一词缀下的高压长跑，以第 3 章为第一道门槛。',
            objective: '以墨尘完成第 3 章，并以更高分数挤进前列。',
            targetChapter: '第3章·镜墟断界',
            goalRealm: 9,
            characterId: 'moChen',
            runDestinyId: 'flowingLightning',
            spiritCompanionId: 'spiritApe',
            vowIds: ['heavenlyGaze', 'realmBreak'],
            tags: ['统一规则', '跨章冲榜', '节奏连携'],
            battleModifiers: {
                enemyHpMul: 1.16,
                enemyAtkMul: 1.16,
                enemyOpeningBlock: 6,
                enemyDebuff: { type: 'vulnerable', value: 1, intent: '众生裂镜' }
            },
            rewardTrack: [
                {
                    id: 'global_score_980',
                    label: '榜单分 980',
                    target: 980,
                    rewardText: '天道币 +260 / 观星档案「众生试炼·裂镜公案」',
                    rewards: [
                        { kind: 'pvpCoins', amount: 260 },
                        { kind: 'codexRecord', id: 'global_mirror_crack_record', name: '众生试炼·裂镜公案', icon: '🜂', note: '众生试炼样本已入藏经阁，可用于后续复盘。' }
                    ]
                },
                {
                    id: 'global_score_1180',
                    label: '榜单分 1180',
                    target: 1180,
                    rewardText: '法相·虚空行者（若已拥有则天道币 +420）',
                    rewards: [{ kind: 'pvpItem', itemId: 'skin_void_walker', fallbackCoins: 420 }]
                }
            ]
        }
    ],
    scoreDefaults: {
        battleWin: 12,
        eliteWin: 20,
        bossWin: 36,
        realmClear: 40,
        lawDiscover: 10,
        treasureDiscover: 8,
        hpBonus: 30,
        completeBonus: 100
    }
};
