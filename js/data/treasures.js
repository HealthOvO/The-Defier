/**
 * The Defier - 法宝数据
 * 独立于法则的被动道具，提供多样化的构建思路
 */

const TREASURES = {
    // === 普通法宝 (Common) ===
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
                player.addBuff('sharp_whetstone', value); // 这里的value是伤害加成量，不是层数，但buff系统通常用值作为层数
                // 为了支持动态数值，我们需要修改 onCardPlay 的逻辑，或者将数值存入 buff 的 value
                // 假设 addBuff 的第二个参数是 value/stacks
            },
            onCardPlay: (player, card, context) => {
                if (player.buffs['sharp_whetstone'] && card.type === 'attack') {
                    const bonus = player.buffs['sharp_whetstone'];
                    context.damageModifier += bonus;
                    delete player.buffs['sharp_whetstone']; // 移除buff
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

    // === 稀有法宝 (Rare) ===
    'soul_banner': {
        id: 'soul_banner',
        name: '吸魂幡',
        description: '每击杀一个敌人，最大生命值+1。',
        rarity: 'rare',
        icon: '🏴',
        price: 150,
        callbacks: {
            onKill: (player, enemy) => {
                player.maxHp += 1;
                player.currentHp += 1; // 同时回血
                Utils.showBattleLog('【吸魂幡】吸收魂魄，最大生命+1');
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
        data: { counter: 0 }, // 内部计数器
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

    // === 传说法宝 (Legendary) ===
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
        description: '受到伤害时，有25%几率将伤害转化为治疗。',
        rarity: 'legendary',
        icon: '☯️',
        price: 300,
        callbacks: {
            onBeforeTakeDamage: (player, amount, context) => {
                if (Math.random() < 0.25) {
                    context.preventDamage = true;
                    player.heal(amount);
                    Utils.showBattleLog(`【阴阳镜】逆转阴阳，将${amount}点伤害转化为治疗！`);
                }
            }
        }
    }
};

// 导出供全局使用
if (typeof window !== 'undefined') {
    window.TREASURES = TREASURES;
}
