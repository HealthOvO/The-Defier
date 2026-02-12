/**
 * The Defier - Ghost Enemy Entity
 * 玩家镜像实体，用于PVP
 */

class GhostEnemy {
    constructor(data) {
        // 基础属性兼容
        this.id = data.userId || 'ghost';
        this.name = data.name || '一位道友';
        this.baseMaxHp = data.maxHp || 100;
        this.maxHp = this.baseMaxHp;
        this.currentHp = data.currentHp || this.maxHp;
        this.block = data.block || 0;
        this.buffs = data.buffs || {};

        // 视觉
        this.icon = data.icon || '👤'; // 默认头像
        this.isGhost = true;

        // 资源
        this.maxEnergy = data.maxEnergy || 3;
        this.energy = this.maxEnergy;
        this.deck = this.hydrateDeck(data.deck || []);
        this.hand = [];
        this.discardPile = [];

        // AI
        const personality = data.config?.personality || 'balanced';
        this.ai = new AIController({ personality });

        // 意图显示 (默认未知)
        this.currentIntent = { type: 'unknown', value: '...' };

        // 护山大阵 (Guardian Formation)
        if (data.config?.guardianFormation) {
            this.block += 20;
            if (!this.buffs.startBlock) this.buffs.startBlock = 0;
            this.buffs.startBlock += 20; // 记录用于显示
        }
    }

    isAlive() {
        return this.currentHp > 0;
    }

    addBuff(type, value) {
        if (!type || typeof value !== 'number' || isNaN(value) || value === 0) return;
        this.buffs[type] = (this.buffs[type] || 0) + value;
        if (this.buffs[type] <= 0) delete this.buffs[type];
    }

    addDebuff(type, value) {
        this.addBuff(type, value);
    }

    heal(amount) {
        if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) return 0;
        const before = this.currentHp;
        this.currentHp = Math.min(this.maxHp, this.currentHp + Math.floor(amount));
        return this.currentHp - before;
    }

    takeDamage(amount, options = {}) {
        if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) return 0;
        let finalDamage = Math.floor(amount);
        if (!options.ignoreBlock && this.block > 0) {
            const absorbed = Math.min(this.block, finalDamage);
            this.block -= absorbed;
            finalDamage -= absorbed;
        }
        if (finalDamage <= 0) return 0;
        this.currentHp = Math.max(0, this.currentHp - finalDamage);
        return finalDamage;
    }

    /**
     * 将简化的卡牌数据还原为完整对象
     */
    hydrateDeck(simpleDeck) {
        // simpleDeck might be list of IDs or objects
        // Assuming list of IDs for now or simple objects
        return simpleDeck.map(item => {
            const cardId = typeof item === 'string' ? item : item.id;
            const baseCard = CARDS[cardId];
            if (!baseCard) return null;

            // Clone and apply upgrades if needed
            let card = JSON.parse(JSON.stringify(baseCard));
            if (item.upgraded) {
                card = Utils.upgradeCard(card);
            }
            return card;
        }).filter(c => c);
    }

    /**
     * 回合开始
     */
    startTurn() {
        this.energy = this.maxEnergy;
        this.block = 0; // PVP规则：回合开始护盾清零(除非有保留)
        // Draw cards (Standard 5)
        this.drawCards(5);

        // Process Buffs (Burn, Poison, etc) - simplified, usually handled by Battle.processTurnStart
    }

    drawCards(count) {
        for (let i = 0; i < count; i++) {
            if (this.deck.length === 0) {
                if (this.discardPile.length > 0) {
                    this.deck = Utils.shuffle([...this.discardPile]);
                    this.discardPile = [];
                } else {
                    break;
                }
            }
            this.hand.push(this.deck.pop());
        }
    }

    /**
     * 执行回合 (Async)
     */
    async takeTurn(battle) {
        this.startTurn();
        Utils.showBattleLog(`${this.name} 正在思考...`);
        await Utils.sleep(800);

        let actionCount = 0;
        while (true) {
            // AI Decide
            const decision = this.ai.think(this, battle.player);

            if (!decision) {
                // No move possible or worth it
                break;
            }

            // Execute Card
            const card = this.hand[decision.cardIndex];

            // UI Feedback: Show card being played
            await this.showCardPlayedEffect(card, battle);

            // Apply Effects
            await this.playCard(card, battle, decision.targetIndex);

            // Remove from hand -> Discard
            this.hand.splice(decision.cardIndex, 1);
            this.discardPile.push(card);
            this.energy -= (card.cost || 0);

            actionCount++;
            await Utils.sleep(1000); // Wait between moves
        }

        Utils.showBattleLog(`${this.name} 结束了回合`);
    }

    /**
     * 播放出牌特效
     */
    async showCardPlayedEffect(card, battle) {
        // Create a temporary visual card element
        const cardEl = Utils.createCardElement(card);
        cardEl.style.position = 'absolute';
        cardEl.style.top = '20%';
        cardEl.style.right = '20%'; // Show from enemy side
        cardEl.style.transform = 'scale(0)';
        cardEl.style.transition = 'all 0.5s ease-out';
        cardEl.style.zIndex = 1000;

        document.body.appendChild(cardEl);

        // Pop in
        requestAnimationFrame(() => {
            cardEl.style.transform = 'scale(1)';
        });

        await Utils.sleep(800);

        // Fade out
        cardEl.style.opacity = 0;
        setTimeout(() => cardEl.remove(), 500);
    }

    /**
     * 实际执行卡牌逻辑
     * This mirrors Player.playCard logic but targeting player
     */
    async playCard(card, battle, targetIndex) {
        // Use AIController's applyEffect logic? 
        // No, we should use real Battle logic to ensure consistency (events, hooks).
        // BUT, Battle.js calculates damage based on `this.player`.
        // We need a way to apply effects FROM enemy TO player.

        // Manual implementation of effect application for Ghost
        if (!card.effects) return;

        for (const effect of card.effects) {
            await this.applyEffectReal(effect, battle);
        }
    }

    async applyEffectReal(effect, battle) {
        const player = battle.player;
        const me = this;

        let value = effect.value || 0;
        if (effect.type === 'randomDamage') value = Utils.random(effect.minValue, effect.maxValue);

        // Common damage modifiers for mirror combat.
        const applyDamageModifiers = (raw) => {
            let dmg = raw;
            if (me.buffs.strength) dmg += me.buffs.strength;
            if (player.buffs.vulnerable) dmg += player.buffs.vulnerable;
            if (me.buffs.weak) dmg = Math.floor(dmg * 0.75);
            return Math.max(0, Math.floor(dmg));
        };

        const dealNormalDamage = (rawDamage) => {
            const damage = applyDamageModifiers(rawDamage);
            if (damage <= 0) {
                this._lastDamageDealt = 0;
                return;
            }
            if (typeof player.takeDamage === 'function') {
                const result = player.takeDamage(damage);
                if (result && typeof result.damage === 'number') {
                    this._lastDamageDealt = result.damage;
                    return;
                }
            }
            player.currentHp = Math.max(0, player.currentHp - damage);
            this._lastDamageDealt = damage;
        };

        const dealPenetrateDamage = (rawDamage) => {
            const damage = applyDamageModifiers(rawDamage);
            if (damage <= 0) {
                this._lastDamageDealt = 0;
                return;
            }
            player.currentHp = Math.max(0, player.currentHp - damage);
            this._lastDamageDealt = damage;
        };

        const addBuff = (target, buffType, buffValue) => {
            if (!buffType || !target || !target.buffs) return;
            if (!target.buffs[buffType]) target.buffs[buffType] = 0;
            target.buffs[buffType] += buffValue;
        };

        switch (effect.type) {
            case 'damage':
            case 'damageAll':
            case 'randomDamage':
                dealNormalDamage(value);
                break;

            case 'conditionalDamage': {
                let conditionalValue = value;
                if (effect.condition === 'lowHp') {
                    const hpRatio = me.maxHp > 0 ? me.currentHp / me.maxHp : 1;
                    if (hpRatio < (effect.threshold || 0.5)) {
                        if (effect.multiplier) conditionalValue = Math.floor(conditionalValue * effect.multiplier);
                        if (effect.bonusDamage) conditionalValue += effect.bonusDamage;
                    }
                }
                dealNormalDamage(conditionalValue);
                break;
            }

            case 'penetrate':
                dealPenetrateDamage(value);
                break;

            case 'execute': {
                const lostHp = Math.max(0, player.maxHp - player.currentHp);
                const executeMultiplier = value || 1;
                dealNormalDamage(Math.floor(lostHp * executeMultiplier));
                break;
            }

            case 'executeDamage': {
                const threshold = effect.threshold || 0.3;
                let executeDamage = value;
                if ((player.currentHp / Math.max(1, player.maxHp)) < threshold) {
                    executeDamage *= 2;
                }
                dealNormalDamage(executeDamage);
                break;
            }

            case 'percentDamage': {
                const percentDamage = Math.floor(player.maxHp * value);
                dealNormalDamage(percentDamage);
                break;
            }

            case 'lifeSteal': {
                const healValue = Math.floor((this._lastDamageDealt || 0) * value);
                if (healValue > 0) {
                    me.currentHp = Math.min(me.maxHp, me.currentHp + healValue);
                }
                break;
            }

            case 'block':
                me.block += Math.floor(value);
                break;

            case 'blockFromLostHp': {
                const lostHp = Math.max(0, me.maxHp - me.currentHp);
                me.block += Math.floor(lostHp * (effect.percent || 0));
                break;
            }

            case 'blockFromStrength': {
                const strength = me.buffs.strength || 0;
                const minVal = effect.minimum || 0;
                const blockValue = Math.max(minVal, strength * (effect.multiplier || 1));
                me.block += blockValue;
                break;
            }

            case 'heal':
                me.currentHp = Math.min(me.maxHp, me.currentHp + Math.floor(value));
                break;

            case 'energy':
                me.energy += Math.floor(value);
                break;

            case 'energyLoss':
                me.energy = Math.max(0, me.energy - Math.floor(value));
                break;

            case 'consumeAllEnergy': {
                const damage = me.energy * (effect.damagePerEnergy || 6);
                me.energy = 0;
                dealNormalDamage(damage);
                break;
            }

            case 'draw':
                this.drawCards(Math.floor(value));
                break;

            case 'drawCalculated': {
                const base = effect.base || 0;
                const perDiscard = effect.perDiscard || 0;
                const count = base + (this.lastDiscardedCount || 0) * perDiscard;
                this.lastDiscardedCount = 0;
                if (count > 0) this.drawCards(count);
                break;
            }

            case 'discardHand': {
                const count = this.hand.length;
                while (this.hand.length > 0) {
                    this.discardPile.push(this.hand.pop());
                }
                this.lastDiscardedCount = count;
                break;
            }

            case 'discardRandom': {
                const count = Math.min(Math.floor(value || 1), this.hand.length);
                for (let i = 0; i < count; i++) {
                    const idx = Math.floor(Math.random() * this.hand.length);
                    const [discarded] = this.hand.splice(idx, 1);
                    if (discarded) this.discardPile.push(discarded);
                }
                break;
            }

            case 'buff':
                addBuff(effect.target === 'self' ? me : player, effect.buffType, Math.floor(value));
                break;

            case 'debuff':
            case 'debuffAll':
                addBuff(effect.target === 'self' ? me : player, effect.buffType, Math.floor(value));
                break;

            case 'removeBlock':
                if (effect.target === 'self') me.block = 0;
                else player.block = 0;
                break;

            case 'selfDamage': {
                const selfDamage = effect.isPercent ? Math.floor(me.maxHp * value) : Math.floor(value);
                me.currentHp = Math.max(1, me.currentHp - selfDamage);
                break;
            }

            case 'swapHpPercent': {
                const mePercent = me.maxHp > 0 ? me.currentHp / me.maxHp : 1;
                const playerPercent = player.maxHp > 0 ? player.currentHp / player.maxHp : 1;
                me.currentHp = Math.max(1, Math.floor(me.maxHp * playerPercent));
                player.currentHp = Math.max(1, Math.floor(player.maxHp * mePercent));
                break;
            }

            case 'conditionalDraw': {
                const hpRatio = me.maxHp > 0 ? me.currentHp / me.maxHp : 1;
                if (hpRatio < (effect.threshold || 0.5)) {
                    if (effect.drawValue) this.drawCards(effect.drawValue);
                    if (effect.energyValue) me.energy += effect.energyValue;
                }
                break;
            }

            case 'randomCards': {
                const min = effect.minValue || 0;
                const max = effect.maxValue || min;
                const count = Utils.random(min, max);
                for (let i = 0; i < count; i++) {
                    const randomCard = (typeof getRandomCard === 'function') ? getRandomCard() : null;
                    if (randomCard) this.hand.push({ ...randomCard, isTemp: true, cost: 0 });
                }
                break;
            }

            case 'reshuffleDiscard':
                if (this.discardPile.length > 0) {
                    this.deck = Utils.shuffle([...this.deck, ...this.discardPile]);
                    this.discardPile = [];
                }
                break;

            case 'cleanse': {
                const debuffTypes = ['weak', 'vulnerable', 'poison', 'burn', 'paralysis', 'stun'];
                let cleaned = 0;
                for (const debuff of debuffTypes) {
                    if (me.buffs[debuff] && cleaned < (effect.value || 0)) {
                        delete me.buffs[debuff];
                        cleaned++;
                    }
                }
                break;
            }

            // PVP中无意义或未接入机制：忽略但不报错
            case 'gainSin':
            case 'gainMerit':
            case 'bonusGold':
            case 'ringExp':
            case 'damagePerLaw':
                break;

            default:
                console.warn(`[GhostEnemy] Unsupported effect type: ${effect.type}`);
                break;
        }

        battle.updateBattleUI();
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GhostEnemy;
} else {
    window.GhostEnemy = GhostEnemy;
}
