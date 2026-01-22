/**
 * The Defier 2.0 - 事件系统
 */

class EventSystem {
    constructor(game) {
        this.game = game;
        this.currentEvent = null;
    }

    // 触发随机事件
    triggerRandomEvent() {
        const event = getRandomEvent();
        if (event) {
            this.showEvent(event);
        }
    }

    // 显示事件
    showEvent(event) {
        this.currentEvent = event;

        // 创建事件模态框
        const modal = document.createElement('div');
        modal.className = 'event-modal active';
        modal.id = 'event-modal';

        modal.innerHTML = `
            <div class="event-container">
                <div class="event-header">
                    <div class="event-icon">${event.icon}</div>
                    <h2 class="event-title">${event.name}</h2>
                </div>
                <div class="event-body">
                    ${event.speaker ? `
                        <div class="event-speaker">
                            <div class="speaker-avatar">${event.speaker.icon}</div>
                            <div class="speaker-dialogue">${event.speaker.dialogue}</div>
                        </div>
                    ` : `
                        <p class="event-description">${event.description}</p>
                    `}
                    <div class="event-choices">
                        ${this.renderChoices(event.choices)}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 绑定选项点击事件
        this.bindChoiceEvents(modal, event.choices);
    }

    // 渲染选项
    renderChoices(choices) {
        return choices.map((choice, index) => {
            const canChoose = this.checkCondition(choice.condition);
            const disabledClass = canChoose ? '' : 'disabled';

            return `
                <div class="event-choice ${disabledClass}" data-index="${index}" ${canChoose ? '' : 'style="opacity: 0.5; pointer-events: none;"'}>
                    <div class="choice-icon">${choice.icon}</div>
                    <div class="choice-content">
                        <div class="choice-text">${choice.text}</div>
                        <div class="choice-result ${choice.resultType}">${choice.result}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 检查条件
    checkCondition(condition) {
        if (!condition) return true;

        const player = this.game.player;

        switch (condition.type) {
            case 'hp':
                return player.currentHp >= condition.min;
            case 'gold':
                return player.gold >= condition.min;
            case 'deckSize':
                return player.deck.length >= condition.min;
            default:
                return true;
        }
    }

    // 绑定选项事件
    bindChoiceEvents(modal, choices) {
        const choiceEls = modal.querySelectorAll('.event-choice:not(.disabled)');

        choiceEls.forEach(el => {
            el.addEventListener('click', () => {
                const index = parseInt(el.dataset.index);
                this.executeChoice(choices[index]);
            });
        });
    }

    // 执行选项
    async executeChoice(choice) {
        const results = [];

        for (const effect of choice.effects) {
            const result = await this.executeEffect(effect);
            if (result) results.push(result);
        }

        // 关闭事件模态框
        this.closeEvent();

        // 显示结果
        if (results.length > 0) {
            this.showResults(results);
        }

        // 完成事件节点
        this.game.onEventComplete();
    }

    // 执行效果
    async executeEffect(effect) {
        const player = this.game.player;

        switch (effect.type) {
            case 'gold':
                if (effect.percent) {
                    const amount = Math.floor(player.gold * (effect.percent / 100));
                    player.gold += amount;
                    return `灵石 ${amount >= 0 ? '+' : ''}${amount}`;
                } else {
                    player.gold += effect.value;
                    return `灵石 ${effect.value >= 0 ? '+' : ''}${effect.value}`;
                }

            case 'randomGold':
                const gold = Utils.random(effect.min, effect.max);
                player.gold += gold;
                return `灵石 +${gold}`;

            case 'damage':
                player.currentHp -= effect.value;
                return `生命 -${effect.value}`;

            case 'heal':
                const healed = Math.min(effect.value, player.maxHp - player.currentHp);
                player.heal(effect.value);
                return `恢复 ${healed} 生命`;

            case 'maxHp':
                player.maxHp += effect.value;
                if (effect.value > 0) {
                    player.currentHp += effect.value;
                }
                return `最大生命 ${effect.value >= 0 ? '+' : ''}${effect.value}`;

            case 'card':
                let card;
                if (effect.cardId) {
                    card = CARDS[effect.cardId];
                } else if (effect.rarity) {
                    card = getRandomCard(effect.rarity);
                } else {
                    card = getRandomCard();
                }
                if (card) {
                    player.addCardToDeck(card);
                    return `获得卡牌: ${card.name}`;
                }
                break;

            case 'ringExp':
                player.fateRing.exp += effect.value;
                player.checkFateRingLevelUp();
                return `命环经验 +${effect.value}`;

            case 'law':
                if (effect.random) {
                    const lawIds = Object.keys(LAWS);
                    const randomLawId = lawIds[Math.floor(Math.random() * lawIds.length)];
                    const law = LAWS[randomLawId];
                    if (law && player.collectLaw({ ...law })) {
                        return `获得法则: ${law.name}`;
                    }
                }
                break;

            case 'battle':
                const enemy = ENEMIES[effect.enemyId];
                if (enemy) {
                    this.game.startBattle([JSON.parse(JSON.stringify(enemy))]);
                    return null; // 战斗会单独处理
                }
                break;

            case 'permaBuff':
                player.permanentBuffs = player.permanentBuffs || {};
                player.permanentBuffs[effect.stat] = (player.permanentBuffs[effect.stat] || 0) + effect.value;
                return `永久${effect.stat} ${effect.value >= 0 ? '+' : ''}${effect.value}`;

            case 'upgradeCard':
                // TODO: 实现卡牌升级选择界面
                return '选择一张牌升级';

            case 'removeCardType':
                // TODO: 实现卡牌移除选择界面
                return `移除${effect.count}张${effect.cardType === 'defense' ? '防御' : '攻击'}牌`;

            case 'random':
                const roll = Math.random();
                let cumulative = 0;
                for (const option of effect.options) {
                    cumulative += option.chance;
                    if (roll < cumulative) {
                        return await this.executeEffect(option);
                    }
                }
                break;

            case 'trial':
                // TODO: 实现试炼系统
                return '开始试炼';

            case 'nothing':
                return null;
        }

        return null;
    }

    // 显示结果
    showResults(results) {
        const validResults = results.filter(r => r);
        if (validResults.length === 0) return;

        const message = validResults.join('\n');
        Utils.showBattleLog(message);
    }

    // 关闭事件
    closeEvent() {
        const modal = document.getElementById('event-modal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        }
        this.currentEvent = null;
    }
}
