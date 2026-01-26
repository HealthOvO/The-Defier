/**
 * The Defier - 法宝数据
 * 独立于法则的被动道具，提供多样化的构建思路
 * 
 * 法宝携带规则：
 * - 最多同时携带4个法宝
 * - 同品质法宝最多携带2个
 * - 神话法宝最多携带1个
 */

const TREASURES = {
    // ==================== 五行法宝 ====================


    metalEssence: {
        id: 'metalEssence',
        name: '金精石',
        description: '金属性伤害+30%，免疫中毒（木属性负面）。',
        rarity: 'rare',
        icon: '⚔️',
        elementBonus: { element: 'metal', value: 0.3 },
        immuneDebuffs: ['poison']
    },

    woodSpiritRoot: {
        id: 'woodSpiritRoot',
        name: '木灵根',
        description: '每回合回复2血，木属性伤害+30%。',
        rarity: 'rare',
        icon: '🌿',
        elementBonus: { element: 'wood', value: 0.3 },
        onTurnStart: (player) => {
            player.heal(2);
        }
    },

    waterCrystal: {
        id: 'waterCrystal',
        name: '水晶髓',
        description: '免疫灼烧，水属性伤害+30%。',
        rarity: 'rare',
        icon: '💧',
        elementBonus: { element: 'water', value: 0.3 },
        immuneDebuffs: ['burn']
    },

    firePhoenixFeather: {
        id: 'firePhoenixFeather',
        name: '火凤羽',
        description: '免疫冰冻/减速，火属性伤害+30%。',
        rarity: 'rare',
        icon: '🔥',
        elementBonus: { element: 'fire', value: 0.3 },
        immuneDebuffs: ['freeze', 'slow']
    },

    thickEarthShield: {
        id: 'thickEarthShield',
        name: '厚土盾',
        description: '护盾效果+25%，土属性伤害+30%。',
        rarity: 'rare',
        icon: '🪨',
        elementBonus: { element: 'earth', value: 0.3 },
    },

    // ==================== 原有法宝 ====================
    // ============================================================
    // ==================== 普通法宝 (Common) ====================
    // ============================================================

    'vitality_stone': {
        id: 'vitality_stone',
        name: '气血石',
        description: '战斗开始时，获得 5+(等级x2) 点护盾。',
        rarity: 'common',
        icon: '🪨',
        price: 50,
        callbacks: {
            onBattleStart: (player) => {
                const level = player.fateRing ? player.fateRing.level : 0;
                const value = 5 + (level * 2);
                player.addBlock(value);
                Utils.showBattleLog(`【气血石】提供了${value}点护盾`);
            }
        },
        getDesc: (player) => {
            const level = player ? (player.fateRing ? player.fateRing.level : 0) : 0;
            const value = 5 + (level * 2);
            return `战斗开始时，获得 ${value} (5 + ${level}x2) 点护盾。`;
        }
    },

    'sharp_whetstone': {
        id: 'sharp_whetstone',
        name: '磨刀石',
        description: '战斗开始时，第一张攻击牌伤害 +3+(等级x1)。',
        rarity: 'common',
        icon: '🔪',
        price: 50,
        callbacks: {
            onBattleStart: (player) => {
                const level = player.fateRing ? player.fateRing.level : 0;
                const value = 3 + level;
                player.addBuff('sharp_whetstone', value);
            },
            onCardPlay: (player, card, context) => {
                if (player.buffs['sharp_whetstone'] && card.type === 'attack') {
                    const bonus = player.buffs['sharp_whetstone'];
                    context.damageModifier = (context.damageModifier || 0) + bonus;
                    delete player.buffs['sharp_whetstone'];
                    Utils.showBattleLog(`【磨刀石】增加了${bonus}点伤害`);
                }
            }
        },
        getDesc: (player) => {
            const level = player ? (player.fateRing ? player.fateRing.level : 0) : 0;
            const value = 3 + level;
            return `战斗开始时，第一张攻击牌伤害 +${value} (3 + ${level})。`;
        }
    },

    // [NEW] 威压符 - 克制召唤类Boss
    'pressure_talisman': {
        id: 'pressure_talisman',
        name: '威压符',
        description: '敌人召唤的随从生命值减半。战斗开始时获得5点护盾。',
        rarity: 'common',
        icon: '📜',
        price: 60,
        counters: ['banditLeader', 'stormSummoner'],
        callbacks: {
            onBattleStart: (player) => {
                player.addBuff('suppress_summon', 0.5); // 随从生命值x0.5
                player.addBlock(5);
                Utils.showBattleLog('【威压符】威压四方！');
            }
        }
    },

    // [NEW] 镇魂玉 - 克制力量叠加类Boss
    'soul_jade': {
        id: 'soul_jade',
        name: '镇魂玉',
        description: '敌人回合结束时，降低其1层力量（最低为0）。',
        rarity: 'common',
        icon: '🟢',
        price: 75,
        counters: ['demonWolf'],
        callbacks: {
            onEnemyTurnEnd: (player, enemies) => {
                if (enemies) {
                    enemies.forEach(enemy => {
                        if (enemy.isAlive() && enemy.buffs && enemy.buffs.strength > 0) {
                            enemy.buffs.strength = Math.max(0, enemy.buffs.strength - 1);
                            Utils.showBattleLog('【镇魂玉】削减敌人力量！');
                        }
                    });
                }
            }
        }
    },

    // [NEW] 养气葫芦 - 通用回复类
    'qi_gourd': {
        id: 'qi_gourd',
        name: '养气葫芦',
        description: '每3回合回复5点生命。',
        rarity: 'common',
        icon: '🍶',
        price: 65,
        data: { counter: 0 },
        callbacks: {
            onBattleStart: (player, treasure) => {
                treasure.data.counter = 0;
            },
            onTurnStart: (player, treasure) => {
                treasure.data.counter++;
                if (treasure.data.counter >= 3) {
                    player.heal(5);
                    treasure.data.counter = 0;
                    Utils.showBattleLog('【养气葫芦】吐纳灵气，回复5点生命');
                }
            }
        }
    },

    // [NEW] 聚灵石 - 通用能量类
    'spirit_stone': {
        id: 'spirit_stone',
        name: '聚灵石',
        description: '战斗开始时获得1点额外灵力。',
        rarity: 'common',
        icon: '💠',
        price: 80,
        callbacks: {
            onBattleStart: (player) => {
                player.gainEnergy(1);
                Utils.showBattleLog('【聚灵石】灵力涌动！');
            }
        }
    },

    // [NEW] 血煞珠 - 攻击强化类
    'blood_orb': {
        id: 'blood_orb',
        name: '血煞珠',
        description: '生命值低于50%时，攻击伤害+25%。',
        rarity: 'common',
        icon: '🔴',
        price: 70,
        callbacks: {
            onBeforeDealDamage: (player, amount, context) => {
                if (player.currentHp < player.maxHp * 0.5) {
                    const bonus = Math.floor(amount * 0.25);
                    Utils.showBattleLog(`【血煞珠】低血激发，伤害+${bonus}`);
                    return amount + bonus;
                }
                return amount;
            }
        }
    },

    // [NEW] 铁壁符 - 防御强化类
    'iron_talisman': {
        id: 'iron_talisman',
        name: '铁壁符',
        description: '护盾获得量+15%。',
        rarity: 'common',
        icon: '🔶',
        price: 55,
        callbacks: {
            onGainBlock: (player, amount) => {
                const bonus = Math.floor(amount * 0.15);
                return amount + bonus;
            }
        }
    },

    // ============================================================
    // ==================== 稀有法宝 (Rare) ====================
    // ============================================================

    'soul_banner': {
        id: 'soul_banner',
        name: '吸魂幡',
        description: '每击杀一个敌人，最大生命值+2。',
        rarity: 'rare',
        icon: '🏴',
        price: 150,
        callbacks: {
            onKill: (player, enemy) => {
                player.maxHp += 2;
                player.currentHp += 2;
                Utils.showBattleLog('【吸魂幡】吸收魂魄，最大生命+2');
            }
        }
    },

    'spirit_bead': {
        id: 'spirit_bead',
        name: '聚灵珠',
        description: '每打出3张技能牌，回复1点灵力。',
        rarity: 'rare',
        icon: '🔮',
        price: 150,
        data: { counter: 0 },
        callbacks: {
            onBattleStart: (player, treasure) => {
                treasure.data.counter = 0;
            },
            onCardPlay: (player, card, context, treasure) => {
                if (card.type === 'skill') {
                    treasure.data.counter++;
                    if (treasure.data.counter >= 3) {
                        player.gainEnergy(1);
                        treasure.data.counter = 0;
                        Utils.showBattleLog('【聚灵珠】灵力涌动，恢复1点灵力');
                    }
                }
            }
        }
    },

    // [克制第10重 岩浆地狱 & 第4重 丹尊]
    'ice_spirit_bead': {
        id: 'ice_spirit_bead',
        name: '玄冰珠',
        description: '免疫"灼烧"负面效果。受到火焰伤害时回复3点生命。',
        rarity: 'rare',
        icon: '❄️',
        price: 200,
        counters: ['danZun', 'dualMagmaGuardians', 'flameCultist'],
        callbacks: {
            onBattleStart: (player) => {
                player.addBuff('immunity_burn', 999);
                Utils.showBattleLog('【玄冰珠】散发寒气，隔绝灼热！');
            },
            onBeforeTakeDamage: (player, amount, context, treasure) => {
                if (context && context.damageType === 'fire') {
                    player.heal(3);
                    Utils.showBattleLog('【玄冰珠】吸收火劲，回复3点生命！');
                }
                return amount;
            }
        }
    },

    // [NEW] 护心镜 - 克制穿透伤害
    'heart_mirror': {
        id: 'heart_mirror',
        name: '护心镜',
        description: '受到的穿透伤害减少40%。',
        rarity: 'rare',
        icon: '🪞',
        price: 180,
        counters: ['swordElder', 'divineSwordsman'],
        callbacks: {
            onBeforeTakePenetrate: (player, amount) => {
                const reduced = Math.floor(amount * 0.4);
                Utils.showBattleLog(`【护心镜】抵御穿透，减免${reduced}点伤害`);
                return amount - reduced;
            }
        }
    },

    // [NEW] 封魂珠 - 克制吸血机制
    'seal_soul_bead': {
        id: 'seal_soul_bead',
        name: '封魂珠',
        description: '敌人的治疗效果减少50%。',
        rarity: 'rare',
        icon: '⚫',
        price: 200,
        counters: ['ancientSpirit', 'voidDevourer', 'abyssHulk'],
        callbacks: {
            onBattleStart: (player) => {
                player.addBuff('anti_heal', 0.5);
                Utils.showBattleLog('【封魂珠】封印魂力，削弱敌人恢复！');
            }
        }
    },

    // [NEW] 空间锚 - 克制弃牌机制
    'space_anchor': {
        id: 'space_anchor',
        name: '空间锚',
        description: '免疫强制弃牌效果。手牌上限+1。',
        rarity: 'rare',
        icon: '⚓',
        price: 220,
        counters: ['divineLord', 'voidDevourer'],
        callbacks: {
            onBattleStart: (player) => {
                player.addBuff('immunity_discard', 999);
                player.maxHandSize = (player.maxHandSize || 10) + 1;
                Utils.showBattleLog('【空间锚】锚定时空，抵抗混乱！');
            }
        }
    },

    // [NEW] 定风珠 - 克制风系召唤
    'wind_bead': {
        id: 'wind_bead',
        name: '定风珠',
        description: '免疫风属性伤害。敌人召唤的风系随从生命值-50%。',
        rarity: 'rare',
        icon: '🌀',
        price: 200,
        counters: ['stormSummoner', 'galeSpirit'],
        callbacks: {
            onBattleStart: (player) => {
                player.addBuff('immunity_wind', 999);
                player.addBuff('wind_minion_weaken', 0.5);
                Utils.showBattleLog('【定风珠】定住狂风！');
            }
        }
    },

    // [NEW] 辟邪玉佩 - 克制负面状态
    'ward_jade': {
        id: 'ward_jade',
        name: '辟邪玉佩',
        description: '免疫毒素效果。虚弱效果持续时间减半。',
        rarity: 'rare',
        icon: '🟡',
        price: 180,
        counters: ['venomSnake'],
        callbacks: {
            onBattleStart: (player) => {
                player.addBuff('immunity_poison', 999);
                player.addBuff('weak_resist', 0.5);
                Utils.showBattleLog('【辟邪玉佩】辟邪镇煞！');
            }
        }
    },

    // [NEW] 金刚护身符 - 伤害减免
    'diamond_amulet': {
        id: 'diamond_amulet',
        name: '金刚护身符',
        description: '受到超过15点的单次伤害时，减免5点。',
        rarity: 'rare',
        icon: '💎',
        price: 240,
        callbacks: {
            onBeforeTakeDamage: (player, amount, context) => {
                if (amount > 15) {
                    Utils.showBattleLog('【金刚护身符】金刚不坏，减免5点伤害！');
                    return amount - 5;
                }
                return amount;
            }
        }
    },

    // [NEW] 朱雀羽 - 火焰增幅
    'phoenix_feather': {
        id: 'phoenix_feather',
        name: '朱雀羽',
        description: '你造成的灼烧伤害+50%。战斗开始时对所有敌人施加2层灼烧。',
        rarity: 'rare',
        icon: '🐦',
        price: 200,
        callbacks: {
            onBattleStart: (player) => {
                player.addBuff('burn_amplify', 0.5);
                if (window.game && window.game.enemies) {
                    window.game.enemies.forEach(e => {
                        if (e.isAlive && e.isAlive()) {
                            e.addDebuff('burn', 2);
                        }
                    });
                    Utils.showBattleLog('【朱雀羽】朱雀之焰燃遍敌阵！');
                }
            }
        }
    },

    // [NEW] 玄武甲 - 护盾保留
    'tortoise_shell': {
        id: 'tortoise_shell',
        name: '玄武甲',
        description: '回合结束时，保留40%护盾（向上取整）。',
        rarity: 'rare',
        icon: '🐢',
        price: 230,
        callbacks: {
            onTurnEnd: (player) => {
                if (player.block > 0) {
                    const retain = Math.ceil(player.block * 0.4);
                    player.addBuff('retain_block', retain);
                    Utils.showBattleLog(`【玄武甲】保留${retain}点护盾`);
                }
            }
        }
    },

    // ============================================================
    // ==================== 传说法宝 (Legendary) ====================
    // ============================================================

    'flying_dagger': {
        id: 'flying_dagger',
        name: '斩仙飞刀',
        description: '战斗开始时，对所有敌人造成 10+(等级x5) 点穿透伤害。',
        rarity: 'legendary',
        icon: '🗡️',
        price: 300,
        callbacks: {
            onBattleStart: (player) => {
                if (window.game && window.game.enemies) {
                    const level = player.fateRing ? player.fateRing.level : 0;
                    const dmg = 10 + (level * 5);

                    window.game.enemies.forEach(enemy => {
                        if (enemy.isAlive()) {
                            enemy.takeDamage(dmg);
                        }
                    });
                    Utils.showBattleLog(`【斩仙飞刀】造成${dmg}点穿透伤害！`);
                }
            }
        },
        getDesc: (player) => {
            const level = player ? (player.fateRing ? player.fateRing.level : 0) : 0;
            const dmg = 10 + (level * 5);
            return `战斗开始时，对所有敌人造成 ${dmg} (10 + ${level}x5) 点穿透伤害。`;
        }
    },

    'yin_yang_mirror': {
        id: 'yin_yang_mirror',
        name: '阴阳镜',
        description: '受到伤害时，有20%几率将伤害转化为治疗。',
        rarity: 'legendary',
        icon: '☯️',
        price: 300,
        callbacks: {
            onBeforeTakeDamage: (player, amount, context) => {
                if (Math.random() < 0.20) {
                    player.heal(amount);
                    Utils.showBattleLog(`【阴阳镜】逆转阴阳，将${amount}点伤害转化为治疗！`);
                    return 0;
                }
                return amount;
            }
        }
    },

    // [克制第12重 金属壁垒]
    'void_mirror': {
        id: 'void_mirror',
        name: '虚空镜',
        description: '你的攻击无视敌人20%护盾。免疫"反伤"效果。',
        rarity: 'legendary',
        icon: '🪞',
        price: 350,
        counters: ['triheadGoldDragon', 'goldenGuard'],
        callbacks: {
            onBattleStart: (player) => {
                player.addBuff('pierce_block', 0.2);
                player.addBuff('immunity_reflect', 999);
                Utils.showBattleLog('【虚空镜】映照虚实，无视防御与反伤！');
            }
        }
    },

    // [克制第15重 生命禁区]
    'soul_severing_blade': {
        id: 'soul_severing_blade',
        name: '断魂刃',
        description: '攻击施加"重伤"（受疗减半）。处于"禁疗"时，攻击力+50%。',
        rarity: 'legendary',
        icon: '👹',
        price: 350,
        counters: ['voidDevourer', 'abyssHulk'],
        callbacks: {
            onCardPlay: (player, card, context) => {
                if (card.type === 'attack') {
                    context.addDebuff = { type: 'severe_wound', value: 1 };
                    if (player.hasBuff && player.hasBuff('healing_corrupt')) {
                        context.damageModifier = (context.damageModifier || 0) + 0.5;
                        Utils.showBattleLog('【断魂刃】因禁疗而狂暴！伤害+50%！');
                    }
                }
            }
        }
    },

    // [NEW] 灵龟壳 - 克制时间减速
    'spirit_turtle_shell': {
        id: 'spirit_turtle_shell',
        name: '灵龟壳',
        description: '免疫[减速]、[麻痹]效果。回合开始时获得等同于命环等级的护盾。',
        rarity: 'legendary',
        icon: '🐚',
        price: 350,
        counters: ['fusionSovereign', 'thunderTribulation'],
        callbacks: {
            onBattleStart: (player) => {
                player.addBuff('immunity_slow', 999);
                player.addBuff('immunity_paralysis', 999);
                Utils.showBattleLog('【灵龟壳】坚如磐石，不受干扰！');
            },
            onTurnStart: (player) => {
                const level = player.fateRing?.level || 1;
                player.addBlock(level);
                Utils.showBattleLog(`【灵龟壳】获得${level}点护盾`);
            }
        }
    },

    // [NEW] 云步靴 - 克制重力机制
    'cloud_boots': {
        id: 'cloud_boots',
        name: '云步靴',
        description: '免疫卡牌费用增加效果。每回合第一张牌费用-1（最低0）。',
        rarity: 'legendary',
        icon: '👟',
        price: 380,
        counters: ['mahayanaSupreme'],
        data: { reduced: false },
        callbacks: {
            onBattleStart: (player) => {
                player.addBuff('immunity_cost_increase', 999);
                Utils.showBattleLog('【云步靴】轻盈飘逸！');
            },
            onTurnStart: (player, treasure) => {
                treasure.data.reduced = false;
                player.addBuff('first_card_discount', 1);
            }
        }
    },

    // [NEW] 避雷符 - 克制雷属性
    'thunder_ward': {
        id: 'thunder_ward',
        name: '避雷符',
        description: '受到雷属性伤害减少50%。每受到雷属性攻击，敌人反受5点伤害。',
        rarity: 'legendary',
        icon: '⚡',
        price: 350,
        counters: ['ascensionSovereign', 'thunderTribulation', 'tribulationCloud5', 'tribulationCloud10', 'tribulationCloud15'],
        callbacks: {
            onBattleStart: (player) => {
                player.addBuff('thunder_resist', 0.5);
                player.addBuff('thunder_reflect', 5);
                Utils.showBattleLog('【避雷符】雷霆不侵！');
            }
        }
    },

    // [NEW] 破妄镜 - 克制反射机制
    'truth_mirror': {
        id: 'truth_mirror',
        name: '破妄镜',
        description: '无效敌人的反射效果。回合开始时，移除敌人15%护盾。',
        rarity: 'legendary',
        icon: '🔍',
        price: 380,
        counters: ['mirrorDemon', 'mirrorReplicant'],
        callbacks: {
            onBattleStart: (player) => {
                player.addBuff('pierce_reflect', 999);
                Utils.showBattleLog('【破妄镜】照破虚妄！');
            },
            onTurnStart: (player) => {
                if (window.game && window.game.enemies) {
                    window.game.enemies.forEach(e => {
                        if (e.isAlive() && e.block > 0) {
                            const remove = Math.floor(e.block * 0.15);
                            e.block = Math.max(0, e.block - remove);
                            if (remove > 0) {
                                Utils.showBattleLog(`【破妄镜】瓦解${remove}点护盾！`);
                            }
                        }
                    });
                }
            }
        }
    },

    // [NEW] 定心珠 - 克制混乱机制
    'clarity_bead': {
        id: 'clarity_bead',
        name: '定心珠',
        description: '免疫混乱、眩晕效果。手牌费用无法被敌人修改。',
        rarity: 'legendary',
        icon: '🔵',
        price: 400,
        counters: ['chaosEye'],
        callbacks: {
            onBattleStart: (player) => {
                player.addBuff('immunity_confuse', 999);
                player.addBuff('immunity_stun', 999);
                player.addBuff('cost_lock', 999);
                Utils.showBattleLog('【定心珠】心如止水，不受干扰！');
            }
        }
    },

    // [NEW] 九霄剑匣 - 终极攻击
    'nine_sword_case': {
        id: 'nine_sword_case',
        name: '九霄剑匣',
        description: '每打出一张攻击牌积累1层剑气。6层时下次攻击造成双倍伤害并清空。',
        rarity: 'legendary',
        icon: '⚔️',
        price: 420,
        data: { stacks: 0 },
        callbacks: {
            onBattleStart: (player, treasure) => {
                treasure.data.stacks = 0;
            },
            onCardPlay: (player, card, context, treasure) => {
                if (card.type === 'attack') {
                    treasure.data.stacks++;
                    if (treasure.data.stacks >= 6) {
                        context.damageMultiplier = (context.damageMultiplier || 1) * 2;
                        treasure.data.stacks = 0;
                        Utils.showBattleLog('【九霄剑匣】剑气爆发！伤害翻倍！');
                    }
                }
            }
        }
    },

    // ============================================================
    // ==================== 神话法宝 (Mythic) ====================
    // ============================================================

    // [克制第18重 混沌终焉]
    'stabilizer_pin': {
        id: 'stabilizer_pin',
        name: '定海神针',
        description: '回合开始时，灵力补满至3点。免疫一次即死效果（每场战斗一次）。',
        rarity: 'mythic',
        icon: '🥢',
        price: 800,
        counters: ['heavenlyDao'],
        data: { deathSaveUsed: false },
        callbacks: {
            onBattleStart: (player, treasure) => {
                treasure.data.deathSaveUsed = false;
                player.addBuff('execution_immunity', 1);
                Utils.showBattleLog('【定海神针】定住乾坤！');
            },
            onTurnStart: (player) => {
                if (player.currentEnergy < 3) {
                    const diff = 3 - player.currentEnergy;
                    player.gainEnergy(diff);
                    Utils.showBattleLog(`【定海神针】灵力补至3点 (+${diff})`);
                }
            },
            onBeforeDeath: (player, treasure) => {
                if (!treasure.data.deathSaveUsed) {
                    treasure.data.deathSaveUsed = true;
                    player.currentHp = 1;
                    Utils.showBattleLog('【定海神针】定海神针阻挡了致命一击！');
                    return true; // 阻止死亡
                }
                return false;
            }
        }
    },

    // [NEW] 五行珠 - 克制五行长老
    'five_element_bead': {
        id: 'five_element_bead',
        name: '五行珠',
        description: '战斗开始时随机获得一种元素亲和。对该元素敌人伤害+40%，受该元素伤害-30%。',
        rarity: 'mythic',
        icon: '🌈',
        price: 600,
        counters: ['elementalElder', 'elementalConstruct'],
        data: { element: null },
        callbacks: {
            onBattleStart: (player, treasure) => {
                const elements = ['fire', 'ice', 'thunder', 'earth', 'wood'];
                treasure.data.element = elements[Math.floor(Math.random() * elements.length)];
                player.addBuff('element_affinity', treasure.data.element);
                const names = { fire: '火', ice: '冰', thunder: '雷', earth: '土', wood: '木' };
                Utils.showBattleLog(`【五行珠】获得${names[treasure.data.element]}元素亲和！`);
            },
            onBeforeDealDamage: (player, amount, context, treasure) => {
                if (context.targetElement === treasure.data.element) {
                    return Math.floor(amount * 1.4);
                }
                return amount;
            },
            onBeforeTakeDamage: (player, amount, context, treasure) => {
                if (context.damageElement === treasure.data.element) {
                    return Math.floor(amount * 0.7);
                }
                return amount;
            }
        }
    },

    // [NEW] 因果轮 - 克制因果裁决者
    'karma_wheel': {
        id: 'karma_wheel',
        name: '因果轮',
        description: '受到的反伤伤害转化为治疗。击杀敌人时恢复8%最大生命。',
        rarity: 'mythic',
        icon: '☸️',
        price: 700,
        counters: ['karmaArbiter', 'karmaSpirit'],
        callbacks: {
            onBattleStart: (player) => {
                player.addBuff('thorns_heal', 999);
                Utils.showBattleLog('【因果轮】因果流转！');
            },
            onBeforeTakeDamage: (player, amount, context) => {
                if (context && context.source === 'thorns') {
                    player.heal(amount);
                    Utils.showBattleLog(`【因果轮】因果反噬转化为${amount}点治疗！`);
                    return 0;
                }
                return amount;
            },
            onKill: (player, enemy) => {
                const heal = Math.floor(player.maxHp * 0.08);
                player.heal(heal);
                Utils.showBattleLog(`【因果轮】因果圆满，回复${heal}点生命`);
            }
        }
    },

    // [NEW] 天道碎片 - 终极法宝
    'heaven_shard': {
        id: 'heaven_shard',
        name: '天道碎片',
        description: '每回合获得随机强力增益。不会被秒杀（生命不会低于1）。',
        rarity: 'mythic',
        icon: '✨',
        price: 999,
        counters: ['heavenlyDao'],
        callbacks: {
            onBattleStart: (player) => {
                player.addBuff('execution_immunity', 999);
                Utils.showBattleLog('【天道碎片】天道庇护！');
            },
            onTurnStart: (player) => {
                const buffs = [
                    () => { player.addBuff('strength', 2); Utils.showBattleLog('【天道碎片】力量+2'); },
                    () => { player.addBlock(12); Utils.showBattleLog('【天道碎片】护盾+12'); },
                    () => { player.drawCards(1); Utils.showBattleLog('【天道碎片】额外抽1张牌'); },
                    () => { player.gainEnergy(1); Utils.showBattleLog('【天道碎片】灵力+1'); },
                    () => { player.heal(8); Utils.showBattleLog('【天道碎片】回复8点生命'); }
                ];
                buffs[Math.floor(Math.random() * buffs.length)]();
            },
            onBeforeTakeDamage: (player, amount, context) => {
                // 防止被秒杀
                if (amount >= player.currentHp && player.currentHp > 1) {
                    Utils.showBattleLog('【天道碎片】天道护体，免疫致命伤害！');
                    return player.currentHp - 1;
                }
                return amount;
            }
        }
    }
};

// ============================================================
// ==================== 法宝系统配置 ====================
// ============================================================

const TREASURE_CONFIG = {
    // 最多携带法宝数量
    maxTreasures: 4,
    // 同品质法宝最多携带数量
    maxPerRarity: {
        common: 2,
        rare: 2,
        legendary: 2,
        mythic: 1
    },
    // 品质颜色
    rarityColors: {
        common: '#a0a0a0',
        rare: '#4fc3f7',
        legendary: '#ffd700',
        mythic: '#ff6ec7'
    },
    // 品质中文名
    rarityNames: {
        common: '普通',
        rare: '稀有',
        legendary: '传说',
        mythic: '神话'
    },
    // 商店解锁天域
    unlockRealm: {
        'pressure_talisman': 1,
        'soul_jade': 1,
        'qi_gourd': 1,
        'spirit_stone': 1,
        'blood_orb': 2,
        'iron_talisman': 1,
        'vitality_stone': 1,
        'sharp_whetstone': 1,
        'soul_banner': 2,
        'spirit_bead': 2,
        'ice_spirit_bead': 3,
        'heart_mirror': 2,
        'seal_soul_bead': 4,
        'space_anchor': 5,
        'wind_bead': 10,
        'ward_jade': 2,
        'diamond_amulet': 3,
        'phoenix_feather': 3,
        'tortoise_shell': 4,
        'flying_dagger': 5,
        'yin_yang_mirror': 6,
        'void_mirror': 11,
        'soul_severing_blade': 14,
        'spirit_turtle_shell': 6,
        'cloud_boots': 7,
        'thunder_ward': 8,
        'truth_mirror': 12,
        'clarity_bead': 13,
        'nine_sword_case': 9,
        'stabilizer_pin': 16,
        'five_element_bead': 15,
        'karma_wheel': 16,
        'heaven_shard': 17
    }
};

// 获取指定天域可购买的法宝
function getAvailableTreasures(realm) {
    return Object.values(TREASURES).filter(t => {
        const unlockRealm = TREASURE_CONFIG.unlockRealm[t.id] || 1;
        return realm >= unlockRealm;
    });
}

// 检查是否可以添加法宝
function canAddTreasure(playerTreasures, newTreasure) {
    if (!playerTreasures) playerTreasures = [];

    // 检查总数量
    if (playerTreasures.length >= TREASURE_CONFIG.maxTreasures) {
        return { canAdd: false, reason: `最多携带${TREASURE_CONFIG.maxTreasures}个法宝` };
    }

    // 检查同品质数量
    const rarity = TREASURES[newTreasure]?.rarity || 'common';
    const sameRarityCount = playerTreasures.filter(t =>
        TREASURES[t]?.rarity === rarity
    ).length;

    if (sameRarityCount >= TREASURE_CONFIG.maxPerRarity[rarity]) {
        return {
            canAdd: false,
            reason: `同品质(${TREASURE_CONFIG.rarityNames[rarity]})法宝最多${TREASURE_CONFIG.maxPerRarity[rarity]}个`
        };
    }

    // 检查是否已拥有
    if (playerTreasures.includes(newTreasure)) {
        return { canAdd: false, reason: '已拥有该法宝' };
    }

    return { canAdd: true };
}

// 获取法宝克制的Boss列表
function getTreasureCounters(treasureId) {
    const treasure = TREASURES[treasureId];
    if (!treasure || !treasure.counters) return [];
    return treasure.counters;
}

// 获取克制指定Boss的法宝列表
function getCounterTreasures(bossId) {
    return Object.values(TREASURES).filter(t =>
        t.counters && t.counters.includes(bossId)
    );
}

// 导出供全局使用
if (typeof window !== 'undefined') {
    window.TREASURES = TREASURES;
    window.TREASURE_CONFIG = TREASURE_CONFIG;
    window.getAvailableTreasures = getAvailableTreasures;
    window.canAddTreasure = canAddTreasure;
    window.getTreasureCounters = getTreasureCounters;
    window.getCounterTreasures = getCounterTreasures;
}
