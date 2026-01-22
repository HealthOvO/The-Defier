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
            level: 1,
            name: '一阶',
            exp: 0,
            slots: 1,
            loadedLaws: [],
            path: 'basic'
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
        this.fateRing.exp += 50; // 增加命环经验

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
        const levels = FATE_RING.levels;
        for (let i = levels.length - 1; i >= 0; i--) {
            if (this.fateRing.exp >= levels[i].expRequired) {
                if (this.fateRing.level < levels[i].level) {
                    this.fateRing.level = levels[i].level;
                    this.fateRing.name = levels[i].name;
                    this.fateRing.slots = levels[i].slots;
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
