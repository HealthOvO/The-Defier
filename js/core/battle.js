/**
 * The Defier - 战斗系统
 */

class Battle {
    constructor(game) {
        this.game = game;
        this.player = game.player;
        this.enemies = [];
        this.currentTurn = 'player';
        this.turnNumber = 0;
        this.selectedCard = null;
        this.targetingMode = false;
        this.battleEnded = false;
        this.isProcessingCard = false; // 防止卡牌连点
    }

    // 初始化战斗
    init(enemyData) {
        this.enemies = [];
        this.battleEnded = false;
        this.turnNumber = 0;
        this.selectedCard = null;
        this.targetingMode = false;
        this.isProcessingCard = false;

        // 创建敌人实例
        if (Array.isArray(enemyData)) {
            for (const data of enemyData) {
                this.enemies.push(this.createEnemyInstance(data));
            }
        } else {
            this.enemies.push(this.createEnemyInstance(enemyData));
        }

        // 准备玩家战斗状态
        this.player.prepareBattle();

        // 开始战斗
        this.startBattle();
    }

    // 创建敌人实例
    createEnemyInstance(enemyData) {
        return {
            ...enemyData,
            currentHp: enemyData.hp,
            block: 0,
            buffs: {},
            currentPatternIndex: 0,
            stunned: false
        };
    }

    // 开始战斗
    startBattle() {
        this.turnNumber = 1;
        this.currentTurn = 'player';

        // 玩家回合开始
        this.player.startTurn();

        // 确保结束回合按钮可用
        const endTurnBtn = document.getElementById('end-turn-btn');
        if (endTurnBtn) {
            endTurnBtn.disabled = false;
        }

        // 更新UI
        this.updateBattleUI();
        // this.bindCardEvents(); // Removed redundant call, updateHandUI handles this
    }

    // 更新战斗UI
    updateBattleUI() {
        this.updatePlayerUI();
        this.updateEnemiesUI();
        this.updateHandUI();
        this.updateEnergyUI();
        this.updatePilesUI();
    }

    // 更新玩家UI
    updatePlayerUI() {
        const hpBar = document.getElementById('player-hp-bar');
        const hpText = document.getElementById('player-hp-text');
        const blockDisplay = document.getElementById('block-display');
        const blockValue = document.getElementById('block-value');
        const nameDisplay = document.getElementById('player-name-display');

        // 更新名字
        if (nameDisplay) {
            const charId = this.player.characterId || 'linFeng';
            // 假设 CHARACTERS 是全局变量，如果不是，需要通过 game.CHARACTERS 或 window.CHARACTERS 访问
            // 根据之前的代码，CHARACTERS 应该是全局的 (加载自 js/data/characters.js)
            if (typeof CHARACTERS !== 'undefined' && CHARACTERS[charId]) {
                nameDisplay.textContent = CHARACTERS[charId].name;
            }
        }

        const hpPercent = (this.player.currentHp / this.player.maxHp) * 100;
        hpBar.style.width = `${hpPercent}%`;
        hpText.textContent = `${this.player.currentHp}/${this.player.maxHp}`;

        if (this.player.block > 0) {
            blockDisplay.classList.add('show');
            blockValue.textContent = this.player.block;
        } else {
            blockDisplay.classList.remove('show');
        }

        // 更新 Buffs
        const buffsContainer = document.getElementById('player-buffs');
        if (buffsContainer) {
            buffsContainer.innerHTML = Utils.renderBuffs(this.player);
        }
    }

    // 更新敌人UI
    updateEnemiesUI() {
        const container = document.getElementById('enemy-container');
        container.innerHTML = '';

        this.enemies.forEach((enemy, index) => {
            if (enemy.currentHp <= 0) return;

            const enemyEl = Utils.createEnemyElement(enemy, index);

            // 绑定点击事件
            enemyEl.addEventListener('click', () => {
                if (this.targetingMode && this.selectedCard !== null) {
                    this.playCardOnTarget(this.selectedCard, index);
                }
            });

            container.appendChild(enemyEl);
        });
    }

    // 更新手牌UI
    updateHandUI() {
        const handContainer = document.getElementById('hand-cards');
        handContainer.innerHTML = '';

        this.player.hand.forEach((card, index) => {
            const cardEl = Utils.createCardElement(card, index);

            // 检查是否可用
            let playable = true;
            if (card.cost > this.player.currentEnergy) {
                playable = false;
            }
            if (card.condition) {
                if (card.condition.type === 'hp' && this.player.currentHp < card.condition.min) {
                    playable = false;
                }
            }

            if (!playable) {
                cardEl.classList.add('unplayable');
            }

            // 如果被选中
            if (this.selectedCard === index) {
                cardEl.classList.add('selected');
            }

            handContainer.appendChild(cardEl);
        });

        this.bindCardEvents();
    }

    // 更新灵力UI
    updateEnergyUI() {
        const orbsContainer = document.getElementById('energy-orbs');
        const energyText = document.getElementById('energy-text');

        orbsContainer.innerHTML = '';
        for (let i = 0; i < this.player.baseEnergy; i++) {
            const orb = document.createElement('div');
            orb.className = `energy-orb ${i >= this.player.currentEnergy ? 'empty' : ''}`;
            orbsContainer.appendChild(orb);
        }

        energyText.textContent = `${this.player.currentEnergy}/${this.player.baseEnergy}`;
    }

    // 更新牌堆UI
    updatePilesUI() {
        document.getElementById('deck-count').textContent = this.player.drawPile.length;
        document.getElementById('discard-count').textContent = this.player.discardPile.length;
    }

    // 绑定卡牌事件
    bindCardEvents() {
        const cards = document.querySelectorAll('#hand-cards .card');

        cards.forEach((cardEl, index) => {
            cardEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.onCardClick(index);
            });
        });
    }

    // 卡牌点击处理
    onCardClick(cardIndex) {
        if (this.currentTurn !== 'player' || this.battleEnded || this.isProcessingCard) return;

        const card = this.player.hand[cardIndex];
        if (!card) return;

        // 检查灵力
        if (card.cost > this.player.currentEnergy) {
            Utils.showBattleLog('灵力不足！');
            return;
        }

        // 检查卡牌特殊条件
        if (card.condition) {
            if (card.condition.type === 'hp' && this.player.currentHp < card.condition.min) {
                Utils.showBattleLog(`生命值不足！需要至少 ${card.condition.min} 点生命`);
                return;
            }
        }

        // 检查是否需要选择目标
        // 修改判定逻辑：只要有效果是针对敌人的，且效果类型需要目标，就进入选择模式
        // 注意：某些效果可能既有对敌也有对己（如武僧打击：伤害敌人+自己护盾）
        const needsTarget = card.effects.some(e =>
            (e.target === 'enemy' || e.target === 'allEnemies') &&
            ['damage', 'penetrate', 'debuff', 'execute', 'randomDamage', 'damageAll', 'removeBlock', 'consumeAllEnergy', 'conditionalDamage', 'damagePerLaw'].includes(e.type)
        );

        // 如果是群体攻击（target: allEnemies），其实不需要选择目标，直接释放即可
        // 但如果有些效果是 target: enemy（单体），有些是 allEnemies，则需要选择
        // 实际上，只要有一个效果需要单体目标，就必须选择
        const requiresSingleTarget = card.effects.some(e =>
            e.target === 'enemy' &&
            ['damage', 'penetrate', 'debuff', 'execute', 'randomDamage', 'removeBlock', 'consumeAllEnergy', 'conditionalDamage', 'damagePerLaw'].includes(e.type)
        );

        if (requiresSingleTarget && this.enemies.filter(e => e.currentHp > 0).length > 0) {
            // 如果只有一个敌人，且没有处于强制选择模式，或许可以直接打出？
            // 但为了操作统一性，通常还是保持点击卡牌->选择目标（或自动选择唯一目标）

            if (this.enemies.filter(e => e.currentHp > 0).length === 1) {
                // 只有一个敌人，自动选择
                const targetIndex = this.enemies.findIndex(e => e.currentHp > 0);
                this.playCardOnTarget(cardIndex, targetIndex);
            } else {
                // 进入选择目标模式
                this.selectedCard = cardIndex;
                this.targetingMode = true;
                this.updateHandUI();
                Utils.showBattleLog('选择目标');
            }
        } else {
            // 不需要选择目标（如群体攻击、纯自我Buff、纯过牌），直接对首个敌人（作为默认占位）或自身释放
            // 注意：playCardOnTarget 内部会处理 targetIndex，如果是群体攻击，target参数可能被忽略或只作为参考
            const targetIndex = this.enemies.findIndex(e => e.currentHp > 0);
            this.playCardOnTarget(cardIndex, targetIndex);
        }
    }

    // 对目标使用卡牌
    async playCardOnTarget(cardIndex, targetIndex) {
        if (this.isProcessingCard) return;
        this.isProcessingCard = true;

        try {
            this.targetingMode = false;
            this.selectedCard = null;

            const card = this.player.hand[cardIndex];
            if (!card) {
                return;
            }

            // 12. 金戈铁马 (realm 12) - 使用攻击牌消耗生命
            if (this.player.realm === 12 && card.type === 'attack') {
                const bloodTax = Math.max(1, Math.floor(this.player.maxHp * 0.05));
                this.player.takeDamage(bloodTax);
                Utils.showBattleLog(`金戈铁马：消耗 ${bloodTax} 点生命以攻击`);
                // 如果自杀，需要终止吗？暂不终止，允许同归于尽
            }

            // 立即给予视觉反馈：卡牌淡出或标记为使用中
            const cardEls = document.querySelectorAll('#hand-cards .card');
            if (cardEls[cardIndex]) {
                cardEls[cardIndex].style.opacity = '0.5';
                cardEls[cardIndex].style.transform = 'scale(0.9)';
                cardEls[cardIndex].style.pointerEvents = 'none';
            }

            const target = this.enemies[targetIndex];

            // 触发连击追踪
            if (typeof game !== 'undefined' && game.handleCombo) {
                game.handleCombo(card.type);
            }

            // 播放卡牌
            const results = this.player.playCard(cardIndex, target);

            // 处理效果
            if (results && Array.isArray(results)) {
                for (const result of results) {
                    await this.processEffect(result, target, targetIndex);
                }
            }

            // 检查战斗是否结束
            if (this.checkBattleEnd()) return;

            // 更新UI
            this.updateBattleUI();
        } catch (error) {
            console.error('Error playing card:', error);
            Utils.showBattleLog('卡牌使用失败！');
            // 尝试恢复UI状态
            this.updateHandUI();
        } finally {
            this.isProcessingCard = false;
        }
    }

    // 处理效果
    async processEffect(result, target, targetIndex) {
        const enemyEl = document.querySelector(`.enemy[data-index="${targetIndex}"]`);

        switch (result.type) {
            case 'damage':
            case 'randomDamage':
                if (target) {
                    const damage = this.dealDamageToEnemy(target, result.value);
                    if (enemyEl) {
                        Utils.addShakeEffect(enemyEl);
                        Utils.showFloatingNumber(enemyEl, damage, 'damage');
                    }
                    Utils.showBattleLog(`造成 ${damage} 点伤害！${result.isExecute ? '（斩杀加成！）' : ''}`);

                    // 检查生命汲取法则
                    const lifeDrainLaw = this.player.collectedLaws.find(l => l.id === 'lifeDrain');
                    if (lifeDrainLaw) {
                        const heal = Math.floor(damage * lifeDrainLaw.passive.value);
                        if (heal > 0) {
                            this.player.heal(heal);
                            Utils.showBattleLog(`生命汲取恢复 ${heal} 点生命`);
                        }
                    }

                    // 处理待处理的生命汲取效果
                    if (this.pendingLifeSteal && this.pendingLifeSteal > 0) {
                        const stealHeal = Math.floor(damage * this.pendingLifeSteal);
                        if (stealHeal > 0) {
                            this.player.heal(stealHeal);
                            Utils.showBattleLog(`吸血恢复 ${stealHeal} 点生命`);
                        }
                        this.pendingLifeSteal = 0;
                    }
                }
                break;

            case 'penetrate':
                if (target) {
                    const oldBlock = target.block;
                    target.block = 0;
                    target.currentHp -= result.value;
                    target.block = oldBlock;

                    if (enemyEl) {
                        Utils.addShakeEffect(enemyEl);
                        Utils.showFloatingNumber(enemyEl, result.value, 'damage');
                    }
                    Utils.showBattleLog(`穿透伤害 ${result.value}！`);
                }
                break;

            case 'execute':
                if (target) {
                    // 斩杀 - 造成敌人已损失生命乘以系数的伤害
                    const lostHp = target.hp - target.currentHp;
                    const executeMultiplier = result.value || 1; // 使用卡牌定义的系数
                    const executeDamage = Math.floor(lostHp * executeMultiplier);
                    const damage = this.dealDamageToEnemy(target, executeDamage);
                    if (enemyEl) {
                        Utils.addShakeEffect(enemyEl);
                        Utils.showFloatingNumber(enemyEl, damage, 'damage');
                    }
                    Utils.showBattleLog(`虚空拥抱造成 ${damage} 点伤害！`);
                }
                break;

            case 'executeDamage':
                if (target) {
                    let baseDmg = result.value;
                    const threshold = result.threshold || 0.3;
                    if (target.currentHp / target.hp < threshold) {
                        baseDmg *= 2;
                        Utils.showBattleLog(`斩杀触发！双倍伤害！`);
                    }
                    const dmg = this.dealDamageToEnemy(target, baseDmg);
                    if (enemyEl) {
                        Utils.addShakeEffect(enemyEl);
                        Utils.showFloatingNumber(enemyEl, dmg, 'damage');
                    }
                }
                break;

            case 'reshuffle':
                if (result.value > 0) {
                    Utils.showBattleLog(`时光倒流！将 ${result.value} 张牌洗回抽牌堆`);
                    this.updatePilesUI();
                } else {
                    Utils.showBattleLog(`弃牌堆为空，无需洗牌`);
                }
                break;

            case 'block':
                Utils.showBattleLog(`获得 ${result.value} 点护盾`);
                break;

            case 'heal':
                Utils.showBattleLog(`恢复 ${result.value} 点生命`);
                break;

            case 'energy':
                Utils.showBattleLog(`获得 ${result.value} 点灵力`);
                break;

            case 'draw':
                Utils.showBattleLog(`抽取 ${result.value} 张牌`);
                break;

            case 'buff':
                Utils.showBattleLog(`获得 ${result.buffType} 效果`);
                break;

            case 'debuff':
                if (target) {
                    target.buffs[result.buffType] = (target.buffs[result.buffType] || 0) + result.value;
                    if (result.buffType === 'stun') {
                        // 14. 混元无极 (realm 14) - 50% 免疫眩晕
                        let immune = false;
                        if (this.player.realm === 14 && Math.random() < 0.5) {
                            immune = true;
                            Utils.showBattleLog('混元无极：敌人免疫了眩晕！');
                        }

                        if (!immune) {
                            target.stunned = true;

                            // 共鸣：绝对零度 (Absolute Zero)
                            if (this.player.activeResonances) {
                                const absoluteZero = this.player.activeResonances.find(r => r.id === 'absoluteZero');
                                if (absoluteZero) {
                                    target.buffs.weak = (target.buffs.weak || 0) + absoluteZero.effect.value;
                                    Utils.showBattleLog(`绝对零度：敌人获得 ${absoluteZero.effect.value} 层虚弱`);
                                }
                            }
                        }
                    }
                    Utils.showBattleLog(`敌人获得 ${result.buffType} 效果`);
                }
                break;

            // ========== 新增效果类型处理 ==========

            case 'damageAll':
                // 对所有敌人造成伤害
                for (let i = 0; i < this.enemies.length; i++) {
                    const enemy = this.enemies[i];
                    if (enemy.currentHp <= 0) continue;

                    const dmg = this.dealDamageToEnemy(enemy, result.value);
                    const el = document.querySelector(`.enemy[data-index="${i}"]`);
                    if (el) {
                        Utils.addShakeEffect(el);
                        Utils.showFloatingNumber(el, dmg, 'damage');
                    }
                }
                Utils.showBattleLog(`横扫千军！对所有敌人造成 ${result.value} 点伤害！`);
                break;

            case 'removeBlock':
                if (target && target.block > 0) {
                    const removedBlock = target.block;
                    target.block = 0;
                    Utils.showBattleLog(`破甲！移除敌人 ${removedBlock} 点护盾！`);
                }
                break;

            case 'selfDamage':
                const playerEl = document.querySelector('.player-avatar');
                if (playerEl) {
                    Utils.addShakeEffect(playerEl);
                    Utils.showFloatingNumber(playerEl, result.value, 'damage');
                }
                Utils.showBattleLog(`自伤 ${result.value} 点！`);
                break;

            case 'lifeSteal':
                // 记录生命汲取比例，等待下次伤害结算
                this.pendingLifeSteal = result.value;
                break;

            case 'conditionalDraw':
                if (result.triggered) {
                    Utils.showBattleLog(`条件触发！抽 ${result.draw} 牌，获得 ${result.energy} 灵力！`);
                }
                break;

            case 'bonusGold':
            case 'ringExp':
            case 'reshuffleDiscard':
            case 'swapHpPercent':
            case 'cleanse':
            case 'blockFromLostHp':
                // 这些效果已在 player.js 中处理完毕
                break;

            case 'conditionalDamage':
                // 命环等级条件伤害已在player.js判断，这里只需显示结果
                if (result.triggered !== false && result.value) {
                    // 如果触发了额外伤害，作为damage类型处理
                    if (target) {
                        const dmg = this.dealDamageToEnemy(target, result.value);
                        const enemyEl2 = document.querySelector(`.enemy[data-index="${targetIndex}"]`);
                        if (enemyEl2) {
                            Utils.addShakeEffect(enemyEl2);
                            Utils.showFloatingNumber(enemyEl2, dmg, 'damage');
                        }
                        Utils.showBattleLog(`命环共振！额外造成 ${dmg} 点伤害！`);
                    }
                }
                break;

            case 'debuffAll':
                // 对所有敌人施加debuff
                for (let i = 0; i < this.enemies.length; i++) {
                    const enemy = this.enemies[i];
                    if (enemy.currentHp <= 0) continue;

                    enemy.buffs[result.buffType] = (enemy.buffs[result.buffType] || 0) + result.value;
                    if (result.buffType === 'stun') {
                        enemy.stunned = true;
                    }
                }
                Utils.showBattleLog(`普渡众生！所有敌人获得 ${result.buffType} 效果！`);
                break;
        }

        await Utils.sleep(300);
        this.updateBattleUI();
    }

    // 对敌人造成伤害
    dealDamageToEnemy(enemy, amount) {
        // 5. 心魔滋生 (realm 5) - 这里是玩家打敌人，不需要增强
        // 如果是敌人打玩家，需要在 takeDamage 或者 enemy action 中处理

        // 14. 混元无极 (realm 14) - 敌人20%抗性
        if (this.player.realm === 14) {
            amount = Math.floor(amount * 0.8);
        }

        // 应用力量加成 (Strength)
        if (this.player.buffs.strength && this.player.buffs.strength > 0) {
            amount += this.player.buffs.strength;
            // 力量通常是本回合持续生效，不需要在这里消耗
            // 除非是某些特殊的一次性力量，但一般力量定义为回合内Buff
        }

        // 共鸣：雷火劫 (Plasma Overload)
        if (this.player.activeResonances) {
            const plasmaOverload = this.player.activeResonances.find(r => r.id === 'plasmaOverload');
            if (plasmaOverload) {
                // 简单起见，只要造成伤害就触发真实伤害，不严格检查是否是雷/火属性
                // 或者我们可以检查卡牌类型？这里 dealDamageToEnemy 只是底层函数，拿不到卡牌信息
                // 为了游戏性，我们可以设定为“攻击造成伤害时额外造成”
                const trueDmg = plasmaOverload.effect.value;
                enemy.currentHp -= trueDmg;
                // 显示特效
                const enemyEl = document.querySelector(`.enemy[data-index="${this.enemies.indexOf(enemy)}"]`);
                if (enemyEl) Utils.showFloatingNumber(enemyEl, trueDmg, 'damage');
                // Utils.showBattleLog(`雷火劫：额外 ${trueDmg} 点真实伤害`);
            }
        }

        // 检查下一次攻击加成 (Concentration)
        if (this.player.buffs.nextAttackBonus && this.player.buffs.nextAttackBonus > 0) {
            amount += this.player.buffs.nextAttackBonus;
            Utils.showBattleLog(`聚气生效！伤害增加 ${this.player.buffs.nextAttackBonus}`);
            // 消耗Buff
            delete this.player.buffs.nextAttackBonus;
        }

        // 应用连击加成
        if (typeof game !== 'undefined' && game.getComboBonus) {
            const comboBonus = game.getComboBonus();
            if (comboBonus > 0) {
                amount = Math.floor(amount * (1 + comboBonus));
            }
        }

        // 检查易伤
        if (enemy.buffs.vulnerable && enemy.buffs.vulnerable > 0) {
            amount += enemy.buffs.vulnerable;
        }

        // 先扣护盾
        if (enemy.block > 0) {
            if (enemy.block >= amount) {
                enemy.block -= amount;
                return 0;
            } else {
                amount -= enemy.block;
                enemy.block = 0;
            }
        }

        enemy.currentHp -= amount;
        return amount;
    }

    // 结束回合
    async endTurn() {
        if (this.currentTurn !== 'player' || this.battleEnded || this.isProcessingCard) return;

        // 禁用结束回合按钮
        document.getElementById('end-turn-btn').disabled = true;

        // 玩家回合结束
        this.player.endTurn();

        // 切换到敌人回合
        this.currentTurn = 'enemy';
        Utils.showBattleLog('敌人回合...');

        await Utils.sleep(500);

        // 敌人行动
        await this.enemyTurn();

        // 检查战斗是否结束
        if (this.checkBattleEnd()) return;

        // 新回合
        this.turnNumber++;
        this.currentTurn = 'player';
        this.player.startTurn();

        // 启用结束回合按钮
        const endTurnBtn = document.getElementById('end-turn-btn');
        if (endTurnBtn) endTurnBtn.disabled = false;

        this.updateBattleUI();
    }

    // 敌人回合行动
    async enemyTurn() {
        for (let i = 0; i < this.enemies.length; i++) {
            const enemy = this.enemies[i];
            if (enemy.currentHp <= 0) continue;

            // 混沌法则判定：混乱效果 (10% 几率)
            const chaosLaw = this.player.collectedLaws.find(l => l.id === 'chaosLaw');
            if (chaosLaw && Math.random() < chaosLaw.passive.value) {
                // 混乱触发
                Utils.showBattleLog(`${enemy.name} 因混沌之力陷入混乱！`);

                // 随机行为：1. 攻击自己 2. 攻击队友（若有） 3. 跳过
                const chaosRoll = Math.random();
                if (chaosRoll < 0.4) {
                    // 攻击自己
                    const dmg = 5;
                    enemy.currentHp -= dmg;
                    Utils.showBattleLog(`${enemy.name} 攻击了自己，受到 ${dmg} 点伤害！`);
                    // 显示伤害数字
                    const enemyEl = document.querySelector(`.enemy-card[data-index="${i}"]`);
                    if (enemyEl) Utils.showFloatingNumber(enemyEl, dmg, 'damage');
                } else if (chaosRoll < 0.7 && this.enemies.length > 1) {
                    // 攻击队友
                    const teammates = this.enemies.filter(e => e !== enemy && e.currentHp > 0);
                    if (teammates.length > 0) {
                        const target = teammates[Math.floor(Math.random() * teammates.length)];
                        target.currentHp -= 8;
                        Utils.showBattleLog(`${enemy.name} 误伤了队友 ${target.name}！`);
                    } else {
                        Utils.showBattleLog(`${enemy.name} 呆立当场！`);
                    }
                } else {
                    // 跳过
                    Utils.showBattleLog(`${enemy.name} 因混乱错过了攻击机会！`);
                }

                await Utils.sleep(800);
                continue; // 跳过正常行动
            }

            // 检查眩晕
            if (enemy.stunned) {
                enemy.stunned = false;
                Utils.showBattleLog(`${enemy.name} 被眩晕，跳过回合`);
                await Utils.sleep(500);
                continue;
            }

            // 检查麻痹 (50% 几率跳过回合)
            if (enemy.buffs.paralysis && enemy.buffs.paralysis > 0) {
                enemy.buffs.paralysis--;
                if (Math.random() < 0.5) {
                    Utils.showBattleLog(`${enemy.name} 因麻痹无法动弹！`);
                    await Utils.sleep(500);
                    continue;
                }
            }

            // 处理敌人debuff
            await this.processEnemyDebuffs(enemy, i);

            // 13. 时光逆流 (realm 13) - 每3回合行动两次
            let actionCount = 1;
            if (this.player.realm === 13 && this.turnNumber % 3 === 0) {
                actionCount = 2;
                if (i === 0) Utils.showBattleLog('时光逆流：敌人速度加快！');
            }

            for (let k = 0; k < actionCount; k++) {
                // 执行敌人行动
                await this.executeEnemyAction(enemy, i);

                // 检查玩家是否死亡
                if (!this.player.isAlive()) {
                    this.battleEnded = true;
                    return;
                }

                // 下一个行动模式
                enemy.currentPatternIndex = (enemy.currentPatternIndex + 1) % enemy.patterns.length;

                if (k < actionCount - 1) await Utils.sleep(500);
            }

            await Utils.sleep(300);
        }

        // 清除敌人护盾
        for (const enemy of this.enemies) {
            enemy.block = 0;
        }
    }



    // 处理敌人debuff
    async processEnemyDebuffs(enemy, enemyIndex) {
        const enemyEl = document.querySelector(`.enemy[data-index="${enemyIndex}"]`);

        // 灼烧
        if (enemy.buffs.burn && enemy.buffs.burn > 0) {
            const burnDamage = enemy.buffs.burn;
            enemy.currentHp -= burnDamage;
            enemy.buffs.burn--;

            if (enemyEl) {
                Utils.addFlashEffect(enemyEl);
                Utils.showFloatingNumber(enemyEl, burnDamage, 'damage');
            }
            Utils.showBattleLog(`${enemy.name} 受到 ${burnDamage} 点灼烧伤害`);

            this.updateBattleUI();
            await Utils.sleep(300);
        }

        // 中毒
        if (enemy.buffs.poison && enemy.buffs.poison > 0) {
            const poisonDamage = enemy.buffs.poison;
            enemy.currentHp -= poisonDamage;
            enemy.buffs.poison--;

            if (enemyEl) {
                Utils.addFlashEffect(enemyEl, 'green');
                Utils.showFloatingNumber(enemyEl, poisonDamage, 'damage');
            }
            Utils.showBattleLog(`${enemy.name} 受到 ${poisonDamage} 点中毒伤害`);

            this.updateBattleUI();
            await Utils.sleep(300);
        }

        // 减少易伤
        if (enemy.buffs.vulnerable && enemy.buffs.vulnerable > 0) {
            enemy.buffs.vulnerable--;
        }
    }

    // 敌人造成伤害
    dealEnemyDamage(enemy, amount) {
        // 5. 心魔滋生 (realm 5)
        if (this.player.realm === 5) {
            amount = Math.floor(amount * 1.25);
        }
        return amount;
    }

    // 执行敌人行动
    async executeEnemyAction(enemy, index) {
        const pattern = enemy.patterns[enemy.currentPatternIndex];
        const playerEl = document.querySelector('.player-avatar');

        Utils.showBattleLog(`${enemy.name} 使用 ${pattern.intent}`);

        switch (pattern.type) {
            case 'attack':
                let damage = pattern.value;

                // 应用力量加成
                if (enemy.buffs.strength) {
                    damage += enemy.buffs.strength;
                }

                // 检查玩家虚弱
                if (this.player.buffs.weak && this.player.buffs.weak > 0) {
                    damage = Math.floor(damage * 0.75);
                }

                // 检查敌人被弱化 (Weak)
                if (enemy.buffs.weak && enemy.buffs.weak > 0) {
                    damage = Math.floor(damage * 0.75); // 减少25%伤害
                    enemy.buffs.weak--;
                }

                // 应用心魔滋生
                damage = this.dealEnemyDamage(enemy, damage);

                const result = this.player.takeDamage(damage);

                if (result.dodged) {
                    Utils.showBattleLog('闪避了攻击！');
                } else {
                    if (playerEl) {
                        Utils.addShakeEffect(playerEl);
                        if (result.damage > 0) {
                            Utils.showFloatingNumber(playerEl, result.damage, 'damage');
                        }
                    }

                    // 反伤
                    if (result.thorns && result.thorns > 0) {
                        enemy.currentHp -= result.thorns;
                        Utils.showBattleLog(`反弹 ${result.thorns} 点伤害`);
                    }
                }
                break;

            case 'multiAttack':
                for (let j = 0; j < pattern.count; j++) {
                    let multiDamage = pattern.value;
                    if (enemy.buffs.strength) {
                        multiDamage += enemy.buffs.strength;
                    }

                    // 应用心魔滋生
                    multiDamage = this.dealEnemyDamage(enemy, multiDamage);

                    const multiResult = this.player.takeDamage(multiDamage);

                    if (playerEl && !multiResult.dodged) {
                        Utils.addShakeEffect(playerEl);
                        if (multiResult.damage > 0) {
                            Utils.showFloatingNumber(playerEl, multiResult.damage, 'damage');
                        }
                    }

                    this.updateBattleUI();
                    await Utils.sleep(200);

                    if (!this.player.isAlive()) break;
                }
                break;

            case 'defend':
                enemy.block += pattern.value;
                Utils.showBattleLog(`${enemy.name} 获得 ${pattern.value} 点护盾`);
                break;

            case 'buff':
                enemy.buffs[pattern.buffType] = (enemy.buffs[pattern.buffType] || 0) + pattern.value;
                Utils.showBattleLog(`${enemy.name} 强化了自己`);
                break;

            case 'debuff':
                this.player.buffs[pattern.buffType] = (this.player.buffs[pattern.buffType] || 0) + pattern.value;
                Utils.showBattleLog(`${enemy.name} 对你施加了减益效果`);
                break;

            case 'heal':
                enemy.currentHp = Math.min(enemy.hp, enemy.currentHp + pattern.value);
                Utils.showBattleLog(`${enemy.name} 恢复了 ${pattern.value} 点生命`);
                break;
        }

        this.updateBattleUI();
    }

    // 检查战斗是否结束
    checkBattleEnd() {
        // 检查玩家死亡
        if (!this.player.isAlive()) {
            this.battleEnded = true;
            this.game.onBattleLost();
            return true;
        }

        // 检查所有敌人死亡
        const allDead = this.enemies.every(e => e.currentHp <= 0);
        if (allDead) {
            this.battleEnded = true;
            this.game.onBattleWon(this.enemies);
            return true;
        }

        return false;
    }
}
