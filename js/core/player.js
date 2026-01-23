/**
 * The Defier - 玩家系统
 */

class Player {
    constructor() {
        this.reset();
    }

    reset(characterId = 'linFeng') {
        const charData = CHARACTERS[characterId] || CHARACTERS['linFeng'];
        this.characterId = characterId;

        // 基础属性
        this.maxHp = charData.stats.maxHp;
        this.currentHp = this.maxHp;
        this.block = 0;
        this.gold = charData.stats.gold;

        // 战斗属性
        this.baseEnergy = charData.stats.energy;
        this.currentEnergy = this.baseEnergy;
        this.drawCount = 5;

        // 牌组
        this.deck = [];
        this.hand = [];
        this.drawPile = [];
        this.discardPile = [];
        this.exhaustPile = [];

        // Buff/Debuff
        this.buffs = {};

        // 遗物
        this.relic = charData.relic;

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
        this.initializeDeck(charData.deck);
    }

    initializeDeck(deckList) {
        const list = deckList || STARTER_DECK;
        this.deck = list.map(cardId => {
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

        // 遗物效果：金刚法相
        if (this.relic && this.relic.id === 'vajraBody') {
            this.block += 6;
        }

        // 遗物效果：真理之镜
        if (this.relic && this.relic.id === 'scholarLens') {
            // 随机获得一张技能牌（0费，临时）
            const skills = ['meditation', 'spiritBoost', 'quickDraw', 'concentration', 'powerUp'];
            const randomSkill = skills[Math.floor(Math.random() * skills.length)];
            const card = CARDS[randomSkill];
            if (card) {
                this.hand.push({ ...card, instanceId: this.generateCardId(), cost: 0, isTemp: true });
            }
        }
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

        // 遗物效果：金刚法相（每回合开始如果需要保留护盾逻辑，这里会被清零，但遗物是战斗开始时获得，所以没问题）
        // 如果想让金刚法相每回合都给，那太强了。描述是"战斗开始时"。

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

    // 应用法则被动
    applyLawPassives() {
        // 法则被动效果在战斗开始时检查

        // 混沌法则：混乱光环
        // 这里只是记录，实际效果在Battle.js的enemy turn logic中生效
        // 或者我们可以给自身加一个永久buff "Chaos Aura"
        const chaosLaw = this.collectedLaws.find(l => l.id === 'chaosLaw');
        if (chaosLaw) {
            this.addBuff('chaosAura', 1);
        }
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

        // 混沌法则 - 扭曲现实（10%几率让伤害归零）
        const chaosLaw = this.collectedLaws.find(l => l.id === 'chaosLaw');
        if (chaosLaw && Math.random() < 0.1) {
            Utils.showBattleLog('混沌之力扭曲了现实，伤害无效！');
            return { dodged: true, damage: 0 };
        }

        // 先扣护盾
        let remainingDamage = amount;
        if (this.block > 0) {
            const blockAbsorbed = Math.min(this.block, remainingDamage);
            this.block -= blockAbsorbed;
            remainingDamage -= blockAbsorbed;
        }

        // 扣血
        if (remainingDamage > 0) {
            this.currentHp -= remainingDamage;
        }

        if (this.currentHp <= 0) {
            this.currentHp = 0;
            // 触发死亡事件
        }
        return { dodged: false, damage: amount - remainingDamage };
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

        // 应用法则加成
        if (this.applyLawBonuses) {
            value = this.applyLawBonuses(effect.type, value);
        }

        switch (effect.type) {
            case 'damage':
                let dmg = value;
                return { type: 'damage', value: dmg, target: effect.target };

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
                if (!target) return { type: 'error', message: '需要目标' };
                const playerPercent = this.currentHp / this.maxHp;
                const enemyPercent = target.currentHp / target.maxHp;
                const newPlayerHp = Math.floor(this.maxHp * enemyPercent);
                const newEnemyHp = Math.floor(target.maxHp * playerPercent);
                const finalPlayerHp = Math.max(1, newPlayerHp);
                const finalEnemyHp = Math.max(1, newEnemyHp);
                const playerDiff = finalPlayerHp - this.currentHp;
                const enemyDiff = finalEnemyHp - target.currentHp;
                this.currentHp = finalPlayerHp;
                target.currentHp = finalEnemyHp;
                Utils.showBattleLog(`逆转乾坤！生命比率互换！`);
                return { type: 'swapHpPercent', playerDiff, enemyDiff, target };

            case 'damageAll':
                return { type: 'damageAll', value, target: 'allEnemies' };

            case 'removeBlock':
                return { type: 'removeBlock', target: effect.target };

            case 'selfDamage':
                this.currentHp = Math.max(1, this.currentHp - value);
                return { type: 'selfDamage', value };

            case 'lifeSteal':
                return { type: 'lifeSteal', value: effect.value };

            case 'conditionalDraw':
                // 简化逻辑
                return { type: 'conditionalDraw', triggered: false };

            case 'bonusGold':
                this.pendingBonusGold = (this.pendingBonusGold || 0) + Utils.random(effect.min, effect.max);
                return { type: 'bonusGold' };

            case 'ringExp':
                this.fateRing.exp += effect.value;
                this.checkFateRingLevelUp();
                return { type: 'ringExp', value: effect.value };

            case 'consumeAllEnergy':
                const energy = this.currentEnergy;
                this.currentEnergy = 0;
                return { type: 'damage', value: energy * (effect.damagePerEnergy || 6), target: effect.target };

            default:
                return { type: 'unknown' };
        }
    }


    // 添加Buff
    addBuff(type, value) {
        if (this.buffs[type]) {
            this.buffs[type] += value;
        } else {
            this.buffs[type] = value;
        }
        Utils.showBattleLog(`获得了 ${GameData.getBuffName ? GameData.getBuffName(type) : type} x${value}`);
        // 触发buff获得时的回调（如果有）
        if (type === 'strength') {
            // Strength logic handled dynamically
        }
    }

    // 回合开始时处理Buff
    processBuffsOnTurnStart() {
        // 中毒伤害结算在EnemyTurn，但如果玩家中毒？
        if (this.buffs.poison) {
            this.takeDamage(this.buffs.poison);
            this.buffs.poison--;
            if (this.buffs.poison <= 0) delete this.buffs.poison;
            Utils.showBattleLog(`受到中毒伤害！剩余 ${this.buffs.poison || 0} 层`);
        }

        // 自动格挡/反伤等逻辑...
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

    // ...

    // 处理回合结束buff
    processBuffsOnTurnEnd() {
        // 遗物效果：治愈之血
        if (this.relic && this.relic.id === 'healingBlood') {
            this.heal(2);
            // 简单反馈，实际UI反馈在Battle.js中处理可能更好，但这里改动最小
        }

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
    loadLawToRing(lawId, slotIndex = -1) {
        // 如果没有指定槽位，找第一个空槽
        if (slotIndex === -1) {
            for (let i = 0; i < this.fateRing.slots; i++) {
                if (!this.fateRing.loadedLaws[i]) {
                    slotIndex = i;
                    break;
                }
            }
        }

        // 检查槽位是否有效
        if (slotIndex < 0 || slotIndex >= this.fateRing.slots) {
            return false;
        }

        // 如果该槽位已有法则，先卸载
        if (this.fateRing.loadedLaws[slotIndex]) {
            this.unloadLawFromRing(slotIndex);
        }

        // 如果要装载的法则已经在其他槽位，也先卸载
        const existingIndex = this.fateRing.loadedLaws.indexOf(lawId);
        if (existingIndex !== -1) {
            this.unloadLawFromRing(existingIndex);
        }

        this.fateRing.loadedLaws[slotIndex] = lawId;
        return true;
    }

    // 从命环卸载法则
    unloadLawFromRing(slotIndex) {
        if (slotIndex >= 0 && slotIndex < this.fateRing.slots) {
            this.fateRing.loadedLaws[slotIndex] = null;
            return true;
        }
        return false;
    }

    // 获取当前槽位的法则
    getLawInSlot(index) {
        const lawId = this.fateRing.loadedLaws[index];
        return lawId ? LAWS[lawId] : null;
    }

    // 检查命环升级
    checkFateRingLevelUp() {
        // 即使是level 0，如果经验足够也应该能觉醒
        // if (this.fateRing.level === 0) return false;

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
