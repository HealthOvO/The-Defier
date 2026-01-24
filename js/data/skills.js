/**
 * The Defier - 主动技能数据
 * 定义角色的终极技能 (Ultimates)
 */

const SKILLS = {
    // 林风：逆天改命
    heavensDefiance: {
        id: 'heavensDefiance',
        name: '逆天改命',
        description: '丢弃所有手牌，抽 5 张牌，恢复 3 点灵力。',
        cooldown: 4,
        icon: '⚡',
        effect: (player, battle) => {
            player.discardHand();
            player.drawCards(5);
            player.gainEnergy(3);
            return true;
        }
    },

    // 香叶：生命绽放
    lifeBloom: {
        id: 'lifeBloom',
        name: '生命绽放',
        description: '恢复 30 点生命，净化所有负面状态。',
        cooldown: 5,
        icon: '🌸',
        effect: (player, battle) => {
            player.heal(30);
            const debuffs = ['weak', 'vulnerable', 'poison', 'burn', 'paralysis', 'stun'];
            debuffs.forEach(d => {
                if (player.buffs[d]) delete player.buffs[d];
            });
            return true;
        }
    },

    // 无欲：金刚不坏
    vajraIndestructible: {
        id: 'vajraIndestructible',
        name: '金刚不坏',
        description: '获得 30 点护盾，并获得等同于护盾值的“荆棘”。',
        cooldown: 5,
        icon: '🛡️',
        effect: (player, battle) => {
            player.addBlock(30);
            const currentBlock = player.block; // Includes existing + new
            player.addBuff('thorns', currentBlock);
            return true;
        }
    },

    // 严寒：真理领域
    absoluteTruth: {
        id: 'absoluteTruth',
        name: '真理领域',
        description: '下 3 张牌耗能为 0，抽 2 张牌。',
        cooldown: 6,
        icon: '👁️',
        effect: (player, battle) => {
            player.addBuff('freeCard', 3); // Need to implement listener in player.playCard
            player.drawCards(2);
            return true;
        }
    }
};
