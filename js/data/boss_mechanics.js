/**
 * The Defier - Boss机制系统
 * 定义Boss独特机制和法宝克制关系
 */

const BOSS_MECHANICS = {
    // ==================== 第1重 山寨头目 ====================
    banditLeader: {
        id: 'banditLeader',
        name: '山寨头目',
        mechanics: {
            type: 'summon',
            description: '每2回合召唤一个山贼小弟',
            trigger: 'turnStart',
            interval: 2,
            summonId: 'bandit'
        },
        countersBy: ['pressure_talisman'],
        difficulty: { withCounter: 0.7, withoutCounter: 1.0 }
    },

    // ==================== 第2重 妖狼王 ====================
    demonWolf: {
        id: 'demonWolf',
        name: '妖狼王',
        mechanics: {
            type: 'rage',
            description: '每回合获得1层力量，生命低于50%时每回合获得2层',
            trigger: 'turnStart',
            value: 1,
            rageValue: 2,
            rageThreshold: 0.5
        },
        countersBy: ['soul_jade'],
        difficulty: { withCounter: 0.7, withoutCounter: 1.2 }
    },

    // ==================== 第3重 仙门长老 ====================
    swordElder: {
        id: 'swordElder',
        name: '仙门长老',
        mechanics: {
            type: 'penetrate',
            description: '30%攻击为穿透伤害（无视护盾）',
            chance: 0.3
        },
        countersBy: ['heart_mirror'],
        difficulty: { withCounter: 0.7, withoutCounter: 1.3 }
    },

    // ==================== 第4重 丹尊 ====================
    danZun: {
        id: 'danZun',
        name: '丹尊',
        mechanics: {
            type: 'burn_aura',
            description: '每回合对玩家施加3层灼烧',
            trigger: 'turnStart',
            value: 3,
            damageType: 'fire'
        },
        phases: [
            { hpThreshold: 0.5, message: '丹尊进入狂暴状态！', buffSelf: { strength: 3 } }
        ],
        countersBy: ['ice_spirit_bead'],
        difficulty: { withCounter: 0.6, withoutCounter: 1.4 }
    },

    // ==================== 第5重 上古遗灵 ====================
    ancientSpirit: {
        id: 'ancientSpirit',
        name: '上古遗灵',
        mechanics: {
            type: 'lifesteal',
            description: '攻击时回复造成伤害的30%生命',
            healPercent: 0.3
        },
        countersBy: ['seal_soul_bead'],
        difficulty: { withCounter: 0.7, withoutCounter: 1.3 }
    },

    // ==================== 第6重 化神大能 ====================
    divineLord: {
        id: 'divineLord',
        name: '化神大能',
        mechanics: {
            type: 'discard',
            description: '每回合强制玩家弃掉1张手牌',
            trigger: 'turnStart',
            value: 1
        },
        countersBy: ['space_anchor'],
        difficulty: { withCounter: 0.7, withoutCounter: 1.4 }
    },

    // ==================== 第7重 合体天尊 ====================
    fusionSovereign: {
        id: 'fusionSovereign',
        name: '合体天尊',
        mechanics: {
            type: 'slow',
            description: '每2回合对玩家施加1层麻痹',
            trigger: 'turnStart',
            interval: 2,
            debuff: 'paralysis',
            value: 1
        },
        countersBy: ['spirit_turtle_shell'],
        difficulty: { withCounter: 0.7, withoutCounter: 1.4 }
    },

    // ==================== 第8重 大乘至尊 ====================
    mahayanaSupreme: {
        id: 'mahayanaSupreme',
        name: '大乘至尊',
        mechanics: {
            type: 'gravity',
            description: '所有费用>1的卡牌费用+1',
            modifyCost: true
        },
        countersBy: ['cloud_boots'],
        difficulty: { withCounter: 0.6, withoutCounter: 1.5 }
    },

    // ==================== 第9重 飞升主宰 ====================
    ascensionSovereign: {
        id: 'ascensionSovereign',
        name: '飞升主宰',
        mechanics: {
            type: 'thunder',
            description: '每3回合释放天雷，造成25点雷属性伤害',
            trigger: 'turnStart',
            interval: 3,
            damage: 25,
            damageType: 'thunder'
        },
        countersBy: ['thunder_ward'],
        difficulty: { withCounter: 0.7, withoutCounter: 1.4 }
    },

    // ==================== 第10重 双子熔岩守卫 ====================
    dualMagmaGuardians: {
        id: 'dualMagmaGuardians',
        name: '双子熔岩守卫',
        mechanics: {
            type: 'burn_aura',
            description: '每回合施加2层灼烧，且拥有5点反伤',
            trigger: 'turnStart',
            value: 2,
            thorns: 5
        },
        countersBy: ['ice_spirit_bead', 'void_mirror'],
        difficulty: { withCounter: 0.7, withoutCounter: 1.3 }
    },

    // ==================== 第11重 风暴唤灵者 ====================
    stormSummoner: {
        id: 'stormSummoner',
        name: '风暴唤灵者',
        mechanics: {
            type: 'summon',
            description: '每2回合召唤风之精灵',
            trigger: 'turnStart',
            interval: 2,
            summonId: 'windSpirit'
        },
        countersBy: ['wind_bead', 'pressure_talisman'],
        difficulty: { withCounter: 0.6, withoutCounter: 1.4 }
    },

    // ==================== 第12重 三首金龙 ====================
    triheadGoldDragon: {
        id: 'triheadGoldDragon',
        name: '三首金龙',
        mechanics: {
            type: 'armor',
            description: '受到伤害减少25%，战斗开始获得40护盾，拥有8点反伤',
            damageReduction: 0.25,
            startBlock: 40,
            thorns: 8
        },
        countersBy: ['void_mirror'],
        difficulty: { withCounter: 0.6, withoutCounter: 1.6 }
    },

    // ==================== 第13重 心魔镜像 ====================
    mirrorDemon: {
        id: 'mirrorDemon',
        name: '心魔镜像',
        mechanics: {
            type: 'reflect',
            description: '反射玩家30%的伤害',
            reflectPercent: 0.3
        },
        countersBy: ['truth_mirror'],
        difficulty: { withCounter: 0.7, withoutCounter: 1.5 }
    },

    // ==================== 第14重 混沌之眼 ====================
    chaosEye: {
        id: 'chaosEye',
        name: '混沌之眼',
        mechanics: {
            type: 'chaos',
            description: '每回合随机化玩家手牌费用(0-3)',
            trigger: 'turnStart'
        },
        countersBy: ['clarity_bead'],
        difficulty: { withCounter: 0.6, withoutCounter: 1.7 }
    },

    // ==================== 第15重 虚空吞噬者 ====================
    voidDevourer: {
        id: 'voidDevourer',
        name: '虚空吞噬者',
        mechanics: {
            type: 'devour',
            description: '每次攻击放逐牌组顶部1张牌，并对玩家施加禁疗',
            trigger: 'onAttack',
            healingBan: true
        },
        countersBy: ['soul_severing_blade', 'seal_soul_bead'],
        difficulty: { withCounter: 0.6, withoutCounter: 1.6 }
    },

    // ==================== 第16重 五行长老 ====================
    elementalElder: {
        id: 'elementalElder',
        name: '五行长老',
        mechanics: {
            type: 'element_rotate',
            description: '每回合切换元素属性，玩家需使用克制元素攻击',
            elements: ['fire', 'ice', 'thunder', 'earth', 'wind'],
            resistBonus: 0.5
        },
        countersBy: ['five_element_bead'],
        difficulty: { withCounter: 0.6, withoutCounter: 1.7 }
    },

    // ==================== 第17重 因果裁决者 ====================
    karmaArbiter: {
        id: 'karmaArbiter',
        name: '因果裁决者',
        mechanics: {
            type: 'karma',
            description: '拥有20点反伤，玩家每造成10点伤害受到3点因果反噬',
            thorns: 20,
            karmaThreshold: 10,
            karmaDamage: 3
        },
        countersBy: ['karma_wheel'],
        difficulty: { withCounter: 0.5, withoutCounter: 1.8 }
    },

    // ==================== 第18重 天道终焉 ====================
    heavenlyDao: {
        id: 'heavenlyDao',
        name: '天道终焉',
        mechanics: {
            type: 'execute',
            description: '第6回合后每回合造成100点伤害，第10回合直接处决',
            executeRound: 10,
            rampStartRound: 6,
            rampDamage: 100
        },
        phases: [
            { hpThreshold: 0.7, message: '天道之善被引出！', debuffSelf: { strength: -2 } },
            { hpThreshold: 0.3, message: '天道之恶暴走！', buffSelf: { strength: 5 } }
        ],
        countersBy: ['stabilizer_pin', 'heaven_shard'],
        difficulty: { withCounter: 0.5, withoutCounter: 2.0 }
    }
};

// ==================== 机制处理函数 ====================

const BossMechanicsHandler = {
    // 处理Boss回合开始机制
    processTurnStart: function (battle, enemy) {
        const mech = BOSS_MECHANICS[enemy.id];
        if (!mech || !mech.mechanics) return;

        const m = mech.mechanics;
        const player = battle.player;
        const turnNum = battle.turnNumber || 1;

        // 检查玩家是否有克制法宝
        const hasCounter = this.hasCounterTreasure(player, enemy.id);

        switch (m.type) {
            case 'summon':
                if (m.interval && turnNum % m.interval === 0) {
                    if (!player.hasBuff('suppress_summon')) {
                        battle.summonEnemy(m.summonId);
                        Utils.showBattleLog(`${enemy.name}召唤了援军！`);
                    } else {
                        Utils.showBattleLog('【威压符】阻止了召唤！');
                    }
                }
                break;

            case 'rage':
                let rageGain = m.value;
                if (enemy.currentHp < enemy.maxHp * m.rageThreshold) {
                    rageGain = m.rageValue;
                }
                // 镇魂玉会在敌人回合结束时削减
                enemy.addBuff('strength', rageGain);
                Utils.showBattleLog(`${enemy.name}的狂暴之力增强！力量+${rageGain}`);
                break;

            case 'burn_aura':
                if (!player.hasBuff('immunity_burn')) {
                    player.addDebuff('burn', m.value);
                    Utils.showBattleLog(`${enemy.name}的灼热气息灼烧着你！`);
                } else {
                    Utils.showBattleLog('【玄冰珠】抵挡了灼烧！');
                }
                break;

            case 'discard':
                if (!player.hasBuff('immunity_discard') && player.hand.length > 0) {
                    const discardIdx = Math.floor(Math.random() * player.hand.length);
                    const discarded = player.hand.splice(discardIdx, 1)[0];
                    Utils.showBattleLog(`${enemy.name}的神念迫使你弃掉了${discarded.name}！`);
                } else if (player.hasBuff('immunity_discard')) {
                    Utils.showBattleLog('【空间锚】稳定了时空！');
                }
                break;

            case 'slow':
                if (m.interval && turnNum % m.interval === 0) {
                    if (!player.hasBuff('immunity_paralysis')) {
                        player.addDebuff(m.debuff, m.value);
                        Utils.showBattleLog(`${enemy.name}释放了时间减速！`);
                    } else {
                        Utils.showBattleLog('【灵龟壳】抵挡了麻痹！');
                    }
                }
                break;

            case 'thunder':
                if (m.interval && turnNum % m.interval === 0) {
                    let dmg = m.damage;
                    if (player.hasBuff('thunder_resist')) {
                        dmg = Math.floor(dmg * 0.5);
                    }
                    player.takeDamage(dmg);
                    Utils.showBattleLog(`${enemy.name}召唤天雷！造成${dmg}点伤害！`);
                    if (player.hasBuff('thunder_reflect')) {
                        enemy.takeDamage(player.buffs['thunder_reflect']);
                    }
                }
                break;

            case 'chaos':
                if (!player.hasBuff('cost_lock')) {
                    player.hand.forEach(card => {
                        card.tempCost = Math.floor(Math.random() * 4);
                    });
                    Utils.showBattleLog(`${enemy.name}的混沌凝视扰乱了你的灵力！`);
                    if (battle.updateHandUI) battle.updateHandUI();
                } else {
                    Utils.showBattleLog('【定心珠】稳定了心神！');
                }
                break;

            case 'execute':
                if (turnNum >= m.rampStartRound) {
                    if (turnNum >= m.executeRound && !player.hasBuff('execution_immunity')) {
                        player.currentHp = 0;
                        Utils.showBattleLog(`${enemy.name}释放了终焉审判！`);
                    } else if (turnNum >= m.executeRound) {
                        Utils.showBattleLog('【定海神针】抵挡了终焉审判！');
                    } else {
                        let dmg = m.rampDamage;
                        if (player.hasBuff('execution_immunity')) {
                            dmg = Math.min(dmg, player.currentHp - 1);
                        }
                        player.takeDamage(dmg);
                        Utils.showBattleLog(`${enemy.name}释放天道之怒！造成${dmg}点伤害！`);
                    }
                }
                break;
        }

        // 处理阶段转换
        this.checkPhaseTransition(battle, enemy, mech);
    },

    // 处理Boss战斗开始机制
    processBattleStart: function (battle, enemy) {
        const mech = BOSS_MECHANICS[enemy.id];
        if (!mech || !mech.mechanics) return;

        const m = mech.mechanics;

        // 护甲类Boss初始护盾和反伤
        if (m.type === 'armor') {
            if (m.startBlock) {
                enemy.block = (enemy.block || 0) + m.startBlock;
            }
            if (m.thorns) {
                enemy.addBuff('thorns', m.thorns);
            }
        }

        // 因果类Boss反伤
        if (m.type === 'karma' && m.thorns) {
            enemy.addBuff('thorns', m.thorns);
        }

        // 双子熔岩反伤
        if (m.thorns) {
            enemy.addBuff('thorns', m.thorns);
        }
    },

    // 处理Boss受到伤害时的机制
    processOnDamage: function (battle, enemy, damage, source) {
        const mech = BOSS_MECHANICS[enemy.id];
        if (!mech || !mech.mechanics) return damage;

        const m = mech.mechanics;
        const player = battle.player;

        // 护甲减伤
        if (m.type === 'armor' && m.damageReduction) {
            if (!player.hasBuff('pierce_block')) {
                const reduced = Math.floor(damage * m.damageReduction);
                damage -= reduced;
                Utils.showBattleLog(`${enemy.name}的金鳞减免了${reduced}点伤害`);
            }
        }

        // 反射伤害
        if (m.type === 'reflect' && m.reflectPercent) {
            if (!player.hasBuff('pierce_reflect')) {
                const reflect = Math.floor(damage * m.reflectPercent);
                player.takeDamage(reflect);
                Utils.showBattleLog(`${enemy.name}反射了${reflect}点伤害！`);
            }
        }

        return damage;
    },

    // 处理Boss攻击时的机制
    processOnAttack: function (battle, enemy, damage) {
        const mech = BOSS_MECHANICS[enemy.id];
        if (!mech || !mech.mechanics) return;

        const m = mech.mechanics;
        const player = battle.player;

        // 吸血
        if (m.type === 'lifesteal') {
            let healAmount = Math.floor(damage * m.healPercent);
            if (player.hasBuff('anti_heal')) {
                healAmount = Math.floor(healAmount * 0.5);
            }
            enemy.heal(healAmount);
            Utils.showBattleLog(`${enemy.name}吸取了${healAmount}点生命！`);
        }

        // 吞噬卡牌
        if (m.type === 'devour') {
            if (player.drawPile && player.drawPile.length > 0) {
                player.drawPile.pop();
                Utils.showBattleLog(`${enemy.name}吞噬了你的一张卡牌！`);
            }
            if (m.healingBan && !player.hasBuff('healing_corrupt')) {
                player.addDebuff('healing_corrupt', 1);
            }
        }

        // 穿透伤害
        if (m.type === 'penetrate' && Math.random() < m.chance) {
            // 在battle.js中处理穿透逻辑
        }
    },

    // 检查阶段转换
    checkPhaseTransition: function (battle, enemy, mech) {
        if (!mech.phases) return;

        const hpPercent = enemy.currentHp / enemy.maxHp;

        mech.phases.forEach((phase, idx) => {
            if (!enemy.phasesTriggered) enemy.phasesTriggered = [];

            if (hpPercent <= phase.hpThreshold && !enemy.phasesTriggered[idx]) {
                enemy.phasesTriggered[idx] = true;

                if (phase.message) {
                    Utils.showBattleLog(phase.message);
                }

                if (phase.buffSelf) {
                    Object.entries(phase.buffSelf).forEach(([buff, value]) => {
                        enemy.addBuff(buff, value);
                    });
                }

                if (phase.debuffSelf) {
                    Object.entries(phase.debuffSelf).forEach(([buff, value]) => {
                        if (enemy.buffs[buff]) {
                            enemy.buffs[buff] = Math.max(0, enemy.buffs[buff] + value);
                        }
                    });
                }
            }
        });
    },

    // 检查玩家是否有克制法宝
    hasCounterTreasure: function (player, bossId) {
        if (!player.treasures || !BOSS_MECHANICS[bossId]) return false;
        const counters = BOSS_MECHANICS[bossId].countersBy || [];
        return player.treasures.some(t => counters.includes(t));
    },

    // 获取Boss难度系数
    getDifficultyMultiplier: function (player, bossId) {
        const mech = BOSS_MECHANICS[bossId];
        if (!mech || !mech.difficulty) return 1.0;

        const hasCounter = this.hasCounterTreasure(player, bossId);
        return hasCounter ? mech.difficulty.withCounter : mech.difficulty.withoutCounter;
    }
};

// 导出
if (typeof window !== 'undefined') {
    window.BOSS_MECHANICS = BOSS_MECHANICS;
    window.BossMechanicsHandler = BossMechanicsHandler;
}
