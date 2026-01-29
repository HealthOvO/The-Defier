/**
 * The Defier - PVP AI Controller
 * 基于效用评估的高阶AI
 */

class AIController {
    constructor(config = {}) {
        // 默认性格（万法道 - 平衡）
        this.personality = config.personality || 'balanced';
        this.weights = this.getPersonalityWeights(this.personality);
    }

    /**
     * 获取性格权重
     */
    getPersonalityWeights(type) {
        const defaults = {
            // 生存分：每点HP/护盾的价值
            survival: 1.0,
            // 杀敌分：每点伤害的价值
            aggression: 1.2,
            // 斩杀分：由于斩杀极高，权重无需过大，主要是机制识别
            fatality: 10000,
            // 运营分：抽牌/回能的价值
            economy: 2.0,
            // 节奏分：给敌方上DeBuff/自己上Buff
            control: 1.5
        };

        if (type === 'slaughter') { // 杀伐道
            return { ...defaults, survival: 0.5, aggression: 2.5, control: 1.0 };
        }
        if (type === 'longevity') { // 长生道
            return { ...defaults, survival: 3.0, aggression: 0.8, control: 1.2 };
        }

        return defaults;
    }

    /**
     * 核心决策函数
     * @param {Object} ghost - AI实体 (GhostEnemy)
     * @param {Object} player - 玩家实体
     * @returns {Object|null} - 返回最佳决策 { cardIndex, targetIndex } 或 null (结束回合)
     */
    think(ghost, player) {
        // 1. 构建当前状态快照
        const currentState = this.snapshotState(ghost, player);
        const currentScore = this.evaluateState(currentState);

        let bestMove = null;
        let maxScoreDelta = -Infinity; // 必须比不做任何事（0）或负收益要好

        // 2. 遍历所有手牌进行模拟
        ghost.hand.forEach((card, index) => {
            // 检查灵力/条件是否足够
            if (!this.canPlay(card, ghost)) return;

            // 模拟打出这张牌
            const nextState = this.simulateAction(currentState, card);

            // 评估新状态
            const nextScore = this.evaluateState(nextState);
            const scoreDelta = nextScore - currentScore;

            // console.log(`AI thinking: Card ${card.name} -> Delta ${scoreDelta.toFixed(1)}`);

            if (scoreDelta > maxScoreDelta) {
                maxScoreDelta = scoreDelta;
                bestMove = { cardIndex: index, targetIndex: 0 }; // PVP默认为单体(0)或AOE
            }
        });

        // 阈值判断：如果最佳行动的收益极低（甚至负收益，如自残），则停止行动
        if (maxScoreDelta < 0.1) {
            return null;
        }

        return bestMove;
    }

    /**
     * 状态快照
     */
    snapshotState(gameGhost, gamePlayer) {
        return {
            me: {
                hp: gameGhost.currentHp,
                maxHp: gameGhost.maxHp,
                block: gameGhost.block || 0,
                energy: gameGhost.energy || 0,
                buffs: { ...gameGhost.buffs }
            },
            opp: {
                hp: gamePlayer.currentHp,
                maxHp: gamePlayer.maxHp,
                block: gamePlayer.block || 0,
                buffs: { ...gamePlayer.buffs }
            }
        };
    }

    /**
     * 判断卡牌是否可用
     */
    canPlay(card, ghost) {
        // 简单检查灵力
        let cost = card.cost || 0;
        if (card.consumeCandy) cost = 0; // AI暂时忽略奶糖限制，假设足够？或者Ghost有无限奶糖
        return ghost.energy >= cost;
    }

    /**
     * 模拟打牌动作
     * 返回一个新的State对象 (Deep Clone)
     */
    simulateAction(state, card) {
        // Deep clone state
        const newState = JSON.parse(JSON.stringify(state));
        const me = newState.me;
        const opp = newState.opp;

        // 扣除消耗
        if (!card.consumeCandy) {
            me.energy -= (card.cost || 0);
        }

        if (!card.effects) return newState;

        // 简化版效果模拟引擎
        card.effects.forEach(effect => {
            this.applyEffect(effect, me, opp);
        });

        return newState;
    }

    /**
     * 应用单个效果 (Pure Logic)
     */
    applyEffect(effect, me, opp) {
        let value = effect.value || 0;

        // Random damage average
        if (effect.type === 'randomDamage') {
            value = (effect.minValue + effect.maxValue) / 2;
        }

        switch (effect.type) {
            case 'damage':
            case 'damageAll':
            case 'randomDamage':
                // 1. 计算伤害加成 (Strength)
                if (me.buffs.strength) value += me.buffs.strength;
                if (opp.buffs.vulnerable) value += opp.buffs.vulnerable; // Simplified: fix damage add
                if (me.buffs.weak) value = Math.floor(value * 0.75);

                // 2. 结算防御
                let damage = value;
                if (opp.block > 0 && effect.type !== 'penetrate') {
                    if (opp.block >= damage) {
                        opp.block -= damage;
                        damage = 0;
                    } else {
                        damage -= opp.block;
                        opp.block = 0;
                    }
                }
                opp.hp -= damage;
                break;

            case 'penetrate': // 穿透
                if (me.buffs.strength) value += me.buffs.strength;
                opp.hp -= value;
                break;

            case 'block':
                // 敏捷/格挡加成? 暂无，直接加盾
                me.block += value;
                break;

            case 'heal':
                me.hp = Math.min(me.hp + value, me.maxHp);
                break;

            case 'draw':
                // 运营价值：每抽一张牌，假设计算一定分数
                // 这里只修改状态，evaluate时会计入 hand size value? 
                // 都在 evaluateState 处理，这里只需标记“资源增加了”
                // 但 snapshot没有 hand size. 我们可以在 me 中加一个 tempScore
                me.tempScore = (me.tempScore || 0) + (value * 2); // 抽牌价值
                break;

            case 'energy':
                me.energy += value;
                break;

            case 'buff':
            case 'debuff':
                const target = (effect.target === 'self') ? me : opp;
                const buffType = effect.buffType;
                if (!target.buffs[buffType]) target.buffs[buffType] = 0;
                target.buffs[buffType] += value;
                break;

            case 'selfDamage':
                let dmg = value;
                if (effect.isPercent) dmg = Math.floor(me.maxHp * value);
                me.hp -= dmg;
                break;

            case 'lifeSteal': // 吸血 (假设配合伤害)
                // 复杂逻辑，暂时忽略，或者简单估算回血
                // 如果是攻击带吸血，通常是 effect chain. 
                // 简化：直接算作 heal value * 0.5?
                break;

            case 'executeDamage': // 斩杀增伤
                // 判断阈值
                if (opp.hp / opp.maxHp < (effect.threshold || 0.3)) {
                    // 简单模拟大量伤害
                    opp.hp -= (effect.value * 2);
                }
                break;
        }
    }

    /**
     * 评估状态分数 (State Evaluation)
     * Score越高越好
     */
    evaluateState(state) {
        const me = state.me;
        const opp = state.opp;
        const w = this.weights;

        let score = 0;

        // 1. 生存分 (HP + Block)
        // 血量权重随血量降低而指数上升 (危机感)
        const hpPercent = Math.max(0, me.hp) / me.maxHp;
        const dangerFactor = 1 + (1 - hpPercent) * 2; // 1.0 ~ 3.0
        score += me.hp * w.survival * dangerFactor;
        score += me.block * w.survival * 0.8; // 护盾略低于真实血量

        // 2. 杀敌分 (Enemy HP Loss)
        // 对方血量越少分越高
        score += (opp.maxHp - Math.max(0, opp.hp)) * w.aggression;

        // 3. 斩杀奖励 (Fatality)
        if (opp.hp <= 0) {
            score += w.fatality;
        }

        // 4. 自身Buff价值 (Buff Value)
        if (me.buffs.strength) score += me.buffs.strength * 5 * w.control;
        if (me.buffs.thorns) score += me.buffs.thorns * 2 * w.control;
        if (me.buffs.regen) score += me.buffs.regen * 4 * w.control;

        // 5. 敌方DeBuff价值 (Debuff Value)
        if (opp.buffs.vulnerable) score += opp.buffs.vulnerable * 3 * w.control;
        if (opp.buffs.weak) score += opp.buffs.weak * 3 * w.control;
        if (opp.buffs.stun) score += 20 * w.control; // 眩晕高价值
        if (opp.buffs.burn) score += opp.buffs.burn * 1.5 * w.control;

        // 6. 自身负面Buff惩罚
        if (me.buffs.burn) score -= me.buffs.burn * 1;

        // 7. 资源分 (灵力剩余价值)
        // 我们不希望AI无脑留灵力，所以灵力价值应该较低，甚至鼓励用掉？
        // 其实 evaluateState 比较的是“打这张牌后的世界” vs “现在的世界”。
        // 打牌消耗灵力 -> score 减少。
        // 如果 牌的效果收益 > 灵力成本，scoreDelta > 0.
        // 此时我们不仅不需要给灵力加分，反而应该给灵力赋予“机会成本”。
        // 假设 1点灵力 = 5分 (一般的模型)。
        score += me.energy * 2;

        // 8. 临时分 (如抽牌)
        if (me.tempScore) score += me.tempScore * w.economy;

        return score;
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIController;
} else {
    window.AIController = AIController;
}
