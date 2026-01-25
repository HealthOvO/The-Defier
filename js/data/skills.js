/**
 * The Defier - 主动技能数据
 * 定义角色的终极技能 (Ultimates)
 */

const SKILLS = {
    // 林风：逆天改命
    heavensDefiance: {
        id: 'heavensDefiance',
        name: '逆天改命',
        cooldown: 5,
        icon: '⚡',
        getDescription: (level) => {
            if (level >= 4) return '丢弃所有手牌，抽 5 张牌，恢复 3 点灵力。';
            if (level === 3) return '丢弃所有手牌，抽 4 张牌，恢复 2 点灵力。';
            if (level === 2) return '丢弃所有手牌，抽 3 张牌，恢复 2 点灵力。';
            return '丢弃所有手牌，抽 2 张牌，恢复 1 点灵力。';
        },
        effect: (player, battle) => {
            const level = player.skillLevel;
            let draw = 2;
            let energy = 1;

            if (level >= 4) { draw = 5; energy = 3; }
            else if (level === 3) { draw = 4; energy = 2; }
            else if (level === 2) { draw = 3; energy = 2; }

            player.discardHand();
            player.drawCards(draw);
            player.gainEnergy(energy);
            return true;
        }
    },

    // 香叶：生命绽放
    lifeBloom: {
        id: 'lifeBloom',
        name: '生命绽放',
        cooldown: 5,
        icon: '🌸',
        getDescription: (level) => {
            let heal = 10;
            if (level >= 4) heal = 30;
            else if (level === 3) heal = 25;
            else if (level === 2) heal = 15;

            return `恢复 ${heal} 点生命，净化所有负面状态。`;
        },
        effect: (player, battle) => {
            const level = player.skillLevel;
            let heal = 10;
            if (level >= 4) heal = 30;
            else if (level === 3) heal = 25;
            else if (level === 2) heal = 15;

            player.heal(heal);
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
        cooldown: 5,
        icon: '🛡️',
        getDescription: (level) => {
            let block = 10;
            if (level >= 4) block = 30;
            else if (level === 3) block = 25;
            else if (level === 2) block = 15;
            return `获得 ${block} 点护盾，并获得等同于护盾值的“荆棘”。`;
        },
        effect: (player, battle) => {
            const level = player.skillLevel;
            let block = 10;
            if (level >= 4) block = 30;
            else if (level === 3) block = 25;
            else if (level === 2) block = 15;

            player.addBlock(block);
            const currentBlock = player.block;
            player.addBuff('thorns', currentBlock);
            return true;
        }
    },

    // 严寒：真理领域
    absoluteTruth: {
        id: 'absoluteTruth',
        name: '真理领域',
        cooldown: 6,
        icon: '👁️',
        getDescription: (level) => {
            let free = 1;
            let draw = 1;
            if (level >= 4) { free = 3; draw = 2; }
            else if (level === 3) { free = 2; draw = 2; }
            else if (level === 2) { free = 2; draw = 1; }
            return `下 ${free} 张牌耗能为 0，抽 ${draw} 张牌。`;
        },
        effect: (player, battle) => {
            const level = player.skillLevel;
            let free = 1;
            let draw = 1;
            if (level >= 4) { free = 3; draw = 2; }
            else if (level === 3) { free = 2; draw = 2; }
            else if (level === 2) { free = 2; draw = 1; }

            player.addBuff('freeCard', free);
            player.drawCards(draw);
            return true;
        }
    }
};
