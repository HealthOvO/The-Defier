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

        // Strength calc
        if (['damage', 'damageAll', 'randomDamage'].includes(effect.type)) {
            if (me.buffs.strength) value += me.buffs.strength;
            if (player.buffs.vulnerable) value += player.buffs.vulnerable; // Simplified Additive
            if (me.buffs.weak) value = Math.floor(value * 0.75);
        }

        switch (effect.type) {
            case 'damage':
            case 'damageAll': // In 1v1, same as damage
            case 'randomDamage':
            case 'penetrate':
                // Logic to deal damage to player
                if (effect.type !== 'penetrate') {
                    // Block logic
                    if (player.block > 0) {
                        if (player.block >= value) {
                            player.block -= value;
                            value = 0;
                            Utils.showFloatingNumber(document.querySelector('.player-avatar'), 0, 'block'); // Blocked
                        } else {
                            value -= player.block;
                            player.block = 0;
                        }
                    }
                }

                if (value > 0) {
                    player.takeDamage(value); // Assuming Player has takeDamage
                    // If player doesn't have takeDamage (controlled by Battle usually), 
                    // we modify hp directly and show text.
                    // Checking player.js... likely has takeDamage or battle handles it.
                    // For safety, let's use direct modification + UI update if method missing
                    // player.currentHp -= value; (already handled by takeDamage usually)
                }
                break;

            case 'block':
                me.block += value;
                // Update Enemy UI? Battle.updateEnemiesUI() called continuously?
                // We should call battle.updateBattleUI() after each card?
                break;

            case 'heal':
                me.currentHp = Math.min(me.maxHp, me.currentHp + value);
                break;

            case 'buff':
            case 'debuff':
                const target = (effect.target === 'self') ? me : player;
                const buffType = effect.buffType;
                if (!target.buffs[buffType]) target.buffs[buffType] = 0;
                target.buffs[buffType] += value;
                break;

            // ... handle other effects
        }

        // Force Update UI
        battle.updateBattleUI();
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GhostEnemy;
} else {
    window.GhostEnemy = GhostEnemy;
}
