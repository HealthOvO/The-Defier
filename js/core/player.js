/**
 * The Defier - 玩家系统
 */

class Player {
    constructor() {
        this.reset();
    }

    reset() {
        // 基础属性
        this.maxHp = 80;
        this.currentHp = 80;
        this.block = 0;
        this.gold = 0;

        // 战斗属性
        this.baseEnergy = 3;
        this.currentEnergy = 3;
        this.drawCount = 5;

        // 牌组
        this.deck = [];
        this.hand = [];
        this.drawPile = [];
        this.discardPile = [];
        this.exhaustPile = [];

        // Buff/Debuff
        this.buffs = {};

        // 命环
        this.fateRing = {
            level: 0,
            name: '残缺印记',
            exp: 0,
            slots: 0,
            loadedLaws: [],
            path: 'crippled'
        };

        // 收集的法则
        this.collectedLaws = [];

        // 游戏进度
        this.realm = 1;
        this.floor = 0;
        this.enemiesDefeated = 0;
        this.lawsCollected = 0;

        // 初始化牌组
        this.initializeDeck();
    }

    initializeDeck() {
        this.deck = STARTER_DECK.map(cardId => {
            const card = CARDS[cardId];
            return card ? { ...card, instanceId: this.generateCardId() } : null;
        }).filter(Boolean);
    }

    generateCardId() {
        return 'card_' + Math.random().toString(36).substr(2, 9);
    }

    // 准备战斗
    prepareBattle() {
        this.hand = [];
        this.drawPile = Utils.shuffle([...this.deck]);
        this.discardPile = [];
        this.exhaustPile = [];
        this.block = 0;
        this.currentEnergy = this.baseEnergy;
        this.buffs = {};

        // 应用命环加成
        this.applyFateRingBonuses();
    }

    // 应用命环加成
    applyFateRingBonuses() {
        // 智慧之环 - 额外灵力
        if (this.fateRing.path === 'wisdom') {
            this.currentEnergy += 1;
            this.baseEnergy += 1;
        }
    }

    // 开始回合
    startTurn() {
        this.currentEnergy = this.baseEnergy;
        this.block = 0; // 护盾不保留到下回合

        // 应用法则被动效果
        this.applyLawPassives();

        // 抽牌
        let drawAmount = this.drawCount;

        // 敏捷之环 - 额外抽牌
        if (this.fateRing.path === 'agility') {
            drawAmount += 1;
        }

        // 疾风之势法则
        const windLaw = this.collectedLaws.find(l => l.id === 'windSpeed');
        if (windLaw) {
            drawAmount += windLaw.passive.value;
        }

        this.drawCards(drawAmount);

        // 处理回合开始的buff
        this.processBuffsOnTurnStart();
    }

    // 抽牌
    drawCards(count) {
        for (let i = 0; i < count; i++) {
            if (this.drawPile.length === 0) {
                if (this.discardPile.length === 0) break;
                this.drawPile = Utils.shuffle([...this.discardPile]);
                this.discardPile = [];
            }

            const card = this.drawPile.pop();
            if (card) {
                this.hand.push(card);
            }
        }
    }

    // 结束回合
    endTurn() {
        // 弃掉所有手牌
        this.discardPile.push(...this.hand);
        this.hand = [];

        // 处理回合结束的buff
        this.processBuffsOnTurnEnd();
    }

    // 使用卡牌
    playCard(cardIndex, target = null) {
        const card = this.hand[cardIndex];
        if (!card) return false;

        // 检查灵力
        if (card.cost > this.currentEnergy) return false;

        // 消耗灵力
        this.currentEnergy -= card.cost;

        // 从手牌移除
        this.hand.splice(cardIndex, 1);

        // 播放卡牌特效
        if (typeof game !== 'undefined' && game.playCardEffect) {
            // 获取目标元素
            let targetEl = null;
            if (target && target.id) {
                // 假设敌人有ID关联到DOM
                // 这里我们假设 battle.js 会处理 target 关联
                // 或者我们简单传 null，让特效系统自己找默认位置
                // 暂时传 null，让 particles.js 的 playCardEffect 处理默认玩家位置
                // 如果是攻击，我们希望能定位到敌人
                // 但这里 player.js 不应该知道太多 DOM 细节
                // 我们在 game.js 或 battle.js 中处理更合适，但这里是触发点
                // 实际上 playCard 是逻辑层。
                // 我们可以在返回结果后，在 controller 层（game.js/battle.js）播放特效。
                // 但为了方便，我们尝试调用全局 game
            }
            game.playCardEffect(null, card.type);
        }

        // 执行卡牌效果
        const results = this.executeCardEffects(card, target);

        // 加入弃牌堆
        this.discardPile.push(card);

        return results;
    }

    // 执行卡牌效果
    executeCardEffects(card, target) {
        const results = [];

        for (const effect of card.effects) {
            const result = this.executeEffect(effect, target);
            results.push(result);
        }

        return results;
    }

    // 执行单个效果
    executeEffect(effect, target) {
        let value = effect.value || 0;

        // 应用力量加成
        if (effect.type === 'damage' && this.buffs.strength) {
            value += this.buffs.strength;
        }

        // 应用命环力量加成
        if (effect.type === 'damage' && this.fateRing.path === 'power') {
            value = Math.floor(value * 1.15);
        }

        // 应用法则加成
        value = this.applyLawBonuses(effect.type, value);

        switch (effect.type) {
            case 'damage':
                return { type: 'damage', value, target: effect.target };

            case 'penetrate':
                return { type: 'penetrate', value, target: effect.target };

            case 'block':
                this.addBlock(value);
                return { type: 'block', value };

            case 'heal':
                this.heal(value);
                return { type: 'heal', value };

            case 'energy':
                this.currentEnergy += value;
                return { type: 'energy', value };

            case 'draw':
                this.drawCards(value);
                return { type: 'draw', value };

            case 'buff':
                this.addBuff(effect.buffType, effect.value);
                return { type: 'buff', buffType: effect.buffType, value: effect.value };

            case 'debuff':
                return { type: 'debuff', buffType: effect.buffType, value: effect.value, target: effect.target };

            case 'randomDamage':
                const randValue = Utils.random(effect.minValue, effect.maxValue);
                return { type: 'damage', value: randValue, target: effect.target };

            case 'execute':
                return { type: 'execute', target: effect.target };

            case 'swapHpPercent':
                // 检查是否有目标
                if (!target) return { type: 'error', message: '需要目标' };

                // 计算百分比
                const playerPercent = this.currentHp / this.maxHp;
                const enemyPercent = target.currentHp / target.maxHp;

                // 交换百分比
                const newPlayerHp = Math.floor(this.maxHp * enemyPercent);
                const newEnemyHp = Math.floor(target.maxHp * playerPercent);

                // 确保至少有1点血
                const finalPlayerHp = Math.max(1, newPlayerHp);
                const finalEnemyHp = Math.max(1, newEnemyHp);

                const playerDiff = finalPlayerHp - this.currentHp;
                const enemyDiff = finalEnemyHp - target.currentHp;

                this.currentHp = finalPlayerHp;
                target.currentHp = finalEnemyHp;

                Utils.showBattleLog(`逆转乾坤！生命比率互换！`);
                return { type: 'swapHpPercent', playerDiff, enemyDiff, target };

            // ========== 新增效果类型 ==========

            case 'damageAll':
                // 对所有敌人造成伤害，返回让battle.js处理
                return { type: 'damageAll', value, target: 'allEnemies' };

            case 'removeBlock':
                // 移除敌人护盾
                return { type: 'removeBlock', target: effect.target };

            case 'selfDamage':
                // 对自身造成伤害
                this.currentHp = Math.max(1, this.currentHp - value);
                return { type: 'selfDamage', value };

            case 'lifeSteal':
                // 生命汲取 - 记录吸血比例，让battle.js在造成伤害后处理
                return { type: 'lifeSteal', value: effect.value };

            case 'executeDamage':
                // 斩杀伤害：对低于阈值的敌人造成双倍伤害
                if (!target) return { type: 'damage', value };
                const threshold = effect.threshold || 0.3;
                const hpPercent = target.currentHp / target.hp;
                const finalDamage = hpPercent < threshold ? value * 2 : value;
                // 应用力量加成
                let execDmg = finalDamage;
                if (this.buffs.strength) execDmg += this.buffs.strength;
                if (this.fateRing.path === 'power') execDmg = Math.floor(execDmg * 1.15);
                return { type: 'damage', value: execDmg, target: effect.target, isExecute: hpPercent < threshold };

            case 'blockFromStrength':
                // 基于力量获得护盾
                const strength = this.buffs.strength || 0;
                const multiplier = effect.multiplier || 3;
                const minimum = effect.minimum || 5;
                const blockAmount = Math.max(minimum, strength * multiplier);
                this.addBlock(blockAmount);
                return { type: 'block', value: blockAmount };

            case 'percentDamage':
                // 百分比伤害（基于敌人最大生命值）
                if (!target) return { type: 'damage', value: 0 };
                const percentDmg = Math.floor(target.hp * effect.value);
                return { type: 'damage', value: percentDmg, target: effect.target };

            case 'conditionalDraw':
                // 条件抽牌（如低血量时抽牌）
                const condition = effect.condition;
                const condThreshold = effect.threshold || 0.2;
                let conditionMet = false;

                if (condition === 'lowHp') {
                    conditionMet = (this.currentHp / this.maxHp) <= condThreshold;
                }

                if (conditionMet) {
                    const drawVal = effect.drawValue || 0;
                    const energyVal = effect.energyValue || 0;
                    if (drawVal > 0) this.drawCards(drawVal);
                    if (energyVal > 0) this.currentEnergy += energyVal;
                    Utils.showBattleLog(`绝处逢生触发！抽${drawVal}牌，获得${energyVal}灵力！`);
                    return { type: 'conditionalDraw', triggered: true, draw: drawVal, energy: energyVal };
                } else {
                    Utils.showBattleLog(`条件未满足，效果未触发`);
                    return { type: 'conditionalDraw', triggered: false };
                }

            case 'bonusGold':
                // 战斗结束后获得额外金币
                const bonusMin = effect.min || 0;
                const bonusMax = effect.max || 0;
                const bonusAmount = Utils.random(bonusMin, bonusMax);
                // 标记待领取的金币，将在战斗胜利时结算
                this.pendingBonusGold = (this.pendingBonusGold || 0) + bonusAmount;
                Utils.showBattleLog(`天降横财！战斗结束获得 ${bonusAmount} 灵石`);
                return { type: 'bonusGold', value: bonusAmount };

            case 'ringExp':
                // 命环经验增加
                const expValue = effect.value || 0;
                this.fateRing.exp += expValue;
                this.checkFateRingLevelUp();
                Utils.showBattleLog(`顿悟！命环经验 +${expValue}`);
                return { type: 'ringExp', value: expValue };

            case 'reshuffleDiscard':
                // 将弃牌堆洗回抽牌堆
                if (this.discardPile.length > 0) {
                    this.drawPile = Utils.shuffle([...this.drawPile, ...this.discardPile]);
                    const reshuffled = this.discardPile.length;
                    this.discardPile = [];
                    Utils.showBattleLog(`时光倒流！${reshuffled}张牌洗回牌库`);
                    return { type: 'reshuffleDiscard', value: reshuffled };
                }
                return { type: 'reshuffleDiscard', value: 0 };

            case 'consumeAllEnergy':
                // 消耗所有灵力造成伤害
                const energyToConsume = this.currentEnergy;
                const damagePerEnergy = effect.damagePerEnergy || 6;
                const totalDamage = energyToConsume * damagePerEnergy;
                this.currentEnergy = 0;
                if (totalDamage > 0) {
                    Utils.showBattleLog(`破釜沉舟！消耗${energyToConsume}灵力！`);
                    return { type: 'damage', value: totalDamage, target: effect.target };
                }
                return { type: 'consumeAllEnergy', value: 0 };

            default:
                return { type: 'unknown' };
        }
    }

    // 应用法则加成
    applyLawBonuses(effectType, value) {
        for (const law of this.collectedLaws) {
            if (!law.passive) continue;

            switch (law.passive.type) {
                case 'damageBonus':
                    if (effectType === 'damage') {
                        value += law.passive.value;
                    }
                    break;
                case 'blockBonus':
                    if (effectType === 'block') {
                        value += law.passive.value;
                    }
                    break;
            }
        }
        return value;
    }

    // 应用法则被动
    applyLawPassives() {
        // 法则被动效果在战斗开始时检查
    }

    // 添加护盾
    addBlock(amount) {
        // 大地护盾法则
        const earthLaw = this.collectedLaws.find(l => l.id === 'earthShield');
        if (earthLaw) {
            amount += earthLaw.passive.value;
        }

        this.block += amount;
    }

    // 治疗
    heal(amount) {
        this.currentHp = Math.min(this.maxHp, this.currentHp + amount);
    }

    // 受到伤害
    takeDamage(amount) {
        // 检查闪避
        if (this.buffs.dodge && this.buffs.dodge > 0) {
            this.buffs.dodge--;
            return { dodged: true, damage: 0 };
        }

        // 空间裂隙法则 - 随机闪避
        const spaceLaw = this.collectedLaws.find(l => l.id === 'spaceRift');
        if (spaceLaw && Math.random() < spaceLaw.passive.value) {
            return { dodged: true, damage: 0 };
        }

        // 先扣护盾
        let remainingDamage = amount;
        if (this.block > 0) {
            if (this.block >= remainingDamage) {
                this.block -= remainingDamage;
                return { blocked: true, damage: 0, blockDamage: remainingDamage };
            } else {
                remainingDamage -= this.block;
                const blockDamage = this.block;
                this.block = 0;
                this.currentHp -= remainingDamage;
                return { blocked: true, damage: remainingDamage, blockDamage };
            }
        }

        // 检查反伤
        let thornsDamage = 0;
        if (this.buffs.thorns && this.buffs.thorns > 0) {
            thornsDamage = this.buffs.thorns;
        }

        this.currentHp -= remainingDamage;
        return { damage: remainingDamage, thorns: thornsDamage };
    }

    // 添加buff
    addBuff(buffType, value) {
        this.buffs[buffType] = (this.buffs[buffType] || 0) + value;
    }

    // 处理回合开始buff
    processBuffsOnTurnStart() {
        // 可以在这里处理回合开始时的buff效果
    }

    // 处理回合结束buff
    processBuffsOnTurnEnd() {
        // 力量buff持续
        // 反伤消失
        delete this.buffs.thorns;
    }

    // 添加卡牌到牌组
    addCardToDeck(card) {
        const newCard = { ...card, instanceId: this.generateCardId() };
        this.deck.push(newCard);
    }

    // 收集法则
    collectLaw(law) {
        if (this.collectedLaws.find(l => l.id === law.id)) {
            return false; // 已经收集过了
        }

        this.collectedLaws.push(law);
        this.lawsCollected++;
        this.fateRing.exp += 100; // 增加命环经验

        // 解锁法则对应的卡牌
        if (law.unlockCards) {
            for (const cardId of law.unlockCards) {
                if (CARDS[cardId]) {
                    this.addCardToDeck(CARDS[cardId]);
                }
            }
        }

        // 检查命环升级
        this.checkFateRingLevelUp();

        return true;
    }

    // 装载法则到命环
    loadLawToRing(lawId) {
        if (this.fateRing.loadedLaws.length >= this.fateRing.slots) {
            return false;
        }

        const law = this.collectedLaws.find(l => l.id === lawId);
        if (!law) return false;

        if (this.fateRing.loadedLaws.includes(lawId)) return false;

        this.fateRing.loadedLaws.push(lawId);
        return true;
    }

    // 检查命环升级
    checkFateRingLevelUp() {
        // 残缺印记无法通过经验升级，必须觉醒
        if (this.fateRing.level === 0) return false;

        const levels = FATE_RING.levels;
        // 注意 levels[0] 是 level 0, levels[1] 是 level 1
        for (let i = levels.length - 1; i >= 1; i--) {
            if (this.fateRing.exp >= levels[i].expRequired) {
                if (this.fateRing.level < levels[i].level) {
                    this.fateRing.level = levels[i].level;
                    this.fateRing.name = levels[i].name;
                    this.fateRing.slots = levels[i].slots;
                    Utils.showBattleLog(`命环突破！晋升为【${this.fateRing.name}】`);
                    return true;
                }
                break;
            }
        }
        return false;
    }

    // 选择命环进化路径
    chooseFateRingPath(pathName) {
        const path = FATE_RING.paths[pathName];
        if (!path) return false;

        // 检查前置要求
        if (path.requires) {
            for (const req of path.requires) {
                if (this.fateRing.path !== req && !this.unlockedPaths?.includes(req)) {
                    return false;
                }
            }
        }

        this.fateRing.path = pathName;
        return true;
    }

    // 获取盗取几率加成
    getStealBonus() {
        let bonus = 0;

        // 逆天之环加成
        if (this.fateRing.path === 'defiance') {
            bonus += 0.5;
        }

        return bonus;
    }

    // 是否存活
    isAlive() {
        return this.currentHp > 0;
    }

    // 获取状态
    getState() {
        return {
            maxHp: this.maxHp,
            currentHp: this.currentHp,
            block: this.block,
            gold: this.gold,
            currentEnergy: this.currentEnergy,
            baseEnergy: this.baseEnergy,
            hand: this.hand,
            drawPile: this.drawPile,
            discardPile: this.discardPile,
            deck: this.deck,
            buffs: this.buffs,
            fateRing: this.fateRing,
            collectedLaws: this.collectedLaws,
            realm: this.realm,
            floor: this.floor,
            enemiesDefeated: this.enemiesDefeated
        };
    }
}
