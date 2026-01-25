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

        // 强制检查手牌，如果为空尝试补发（防止Bug）
        if (this.player.hand.length === 0) {
            console.warn('StartBattle: Hand empty, forcing draw.');
            this.player.drawCards(this.player.baseDraw);
        }

        // 播放BGM
        if (typeof audioManager !== 'undefined') {
            const isBoss = this.enemies.some(e => e.isBoss);
            audioManager.playBGM(isBoss ? 'boss' : 'battle');
        }

        // Boss出场特效
        const isBoss = this.enemies.some(e => e.isBoss);
        if (isBoss && typeof particles !== 'undefined') {
            setTimeout(() => particles.bossSpawnEffect(), 500);
        }

        // 触发法宝战斗开始效果
        if (this.player.triggerTreasureEffect) {
            this.player.triggerTreasureEffect('onBattleStart');
        }

        // 环境加载
        this.activeEnvironment = null;
        if (typeof REALM_ENVIRONMENTS !== 'undefined') {
            const env = REALM_ENVIRONMENTS[this.player.realm];
            if (env) {
                this.activeEnvironment = env;
                Utils.showBattleLog(`【${env.name}】环境生效！`);
                if (env.onBattleStart) {
                    env.onBattleStart(this);
                }
            }
        }

        // 命环战斗开始钩子 (Analysis Ring)
        if (this.player.fateRing && this.player.fateRing.scanEnemies) {
            this.player.fateRing.scanEnemies(this.enemies);
        }

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
        this.updateEnvironmentUI();

        // Sync active skill UI (Cooldowns etc)
        if (this.game && this.game.updateActiveSkillUI) {
            this.game.updateActiveSkillUI();
        }
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

        // 渲染法宝
        if (this.game.renderTreasures) {
            this.game.renderTreasures();
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

        // CSS Force for Scroll
        handContainer.style.display = 'flex';
        handContainer.style.flexWrap = 'nowrap';
        handContainer.style.overflowX = 'auto'; // scrollable
        handContainer.style.justifyContent = 'flex-start'; // Align left to allow scroll
        handContainer.style.paddingBottom = '10px'; // Space for scrollbar
        handContainer.style.width = '100%';
        handContainer.style.scrollbarWidth = 'thin'; // Firefox

        this.player.hand.forEach((card, index) => {
            const cardEl = Utils.createCardElement(card, index);

            // 检查是否可用
            let playable = true;
            if (card.condition) {
                if (card.condition.type === 'hp' && this.player.currentHp < card.condition.min) {
                    playable = false;
                }
                // Check milk candy cost for draw cards ??
                // Actually playCard logic handles it. But for UI grayscale:
                // If it's a draw card (energyCost 0, candyCost 1), we should check candy.
            }

            // Check Candy Cost for UI
            const hasDraw = card.effects && card.effects.some(e => e.type === 'draw' || e.type === 'drawCalculated' || e.type === 'conditionalDraw' || e.type === 'randomCards');
            if (hasDraw) {
                if (this.player.milkCandy < 1) playable = false;
            } else {
                if (card.cost > this.player.currentEnergy) {
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

        // 显示奶糖
        let candyContainer = document.getElementById('candy-container');
        if (!candyContainer) {
            candyContainer = document.createElement('div');
            candyContainer.id = 'candy-container';
            candyContainer.style.marginLeft = '15px';
            candyContainer.style.display = 'flex';
            candyContainer.style.alignItems = 'center';
            candyContainer.style.color = '#ff9';
            candyContainer.style.fontSize = '1.2rem';
            orbsContainer.parentElement.appendChild(candyContainer);
        }
        candyContainer.innerHTML = `<span style="margin-right:5px">🍬</span> ${this.player.milkCandy}`;
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

            // 手势支持 (上滑出牌)
            let startY = 0;
            let startTime = 0;

            cardEl.addEventListener('touchstart', (e) => {
                startY = e.touches[0].clientY;
                startTime = Date.now();
            }, { passive: true });

            cardEl.addEventListener('touchend', (e) => {
                const endY = e.changedTouches[0].clientY;
                const endTime = Date.now();
                const deltaY = endY - startY; // 负值表示向上
                const deltaTime = endTime - startTime;

                if (deltaY < -50 && deltaTime < 500) {
                    // 上滑且快速，视为出牌
                    // 添加震动反馈
                    if (navigator.vibrate) navigator.vibrate(50);
                    this.onCardClick(index);
                }
            });

            // 悬停音效 & 伤害预览
            cardEl.addEventListener('mouseenter', () => {
                if (typeof audioManager !== 'undefined') {
                    audioManager.playSFX('hover');
                }
                this.onCardHover(index);
            });

            cardEl.addEventListener('mouseleave', () => {
                this.onCardHoverOut();
            });
        });
    }

    // 卡牌悬停预览
    onCardHover(cardIndex) {
        if (this.battleEnded) return;
        const card = this.player.hand[cardIndex];
        if (!card) return;

        // 仅针对攻击卡显示预览
        // 实际上有些技能卡也可能有伤害，检查效果
        const damageEffects = card.effects.filter(e =>
            ['damage', 'penetrate', 'randomDamage', 'damageAll', 'execute', 'executeDamage'].includes(e.type)
        );

        if (damageEffects.length === 0) return;

        // 遍历所有敌人进行计算
        this.enemies.forEach((enemy, index) => {
            let totalDamage = 0; // Initialize totalDamage for each enemy
            let isTarget = false; // Initialize isTarget for each enemy

            if (enemy.currentHp <= 0) {
                enemy.currentHp = 0;
                // 击杀逻辑将在 UI 更新或下一次循环处理
            } else {
                // 检查阶段转换
                if (this.checkPhaseChange) {
                    this.checkPhaseChange(enemy);
                }
            }
            // 检查每段效果
            damageEffects.forEach(effect => {
                // 如果是全体伤害，或者需要选择目标（暂定鼠标悬停时默认预览当前敌人？或者全部敌人？）
                // UI逻辑：如果还没选目标，通常游戏会只预览 AoE 或者不高亮。
                // 但为了体验，我们可以让单体攻击在悬停时，如果必须指定目标，暂时不高亮（因为不知道打谁）。
                // 或者：高亮所有可能的目标？
                // 简化方案：只预览 AoE 和随机伤害。单体伤害需要拖拽？
                // 优化方案：杀戮尖塔是拖拽时预览。
                // 但这里操作模式是点击卡牌 -> 选择目标。
                // 所以悬停时，如果卡牌需要目标，我们无法确定打谁。
                // 除非这里是 AoE。

                // 修正：如果处于 targetingMode，悬停敌人时预览？
                // 这里是悬停手牌。

                if (effect.target === 'allEnemies') {
                    totalDamage += this.calculateEffectDamage(effect, enemy);
                    isTarget = true;
                } else if (effect.target === 'random') {
                    // 随机伤害难以预览确切目标，暂时忽略或平均？
                }
            });

            if (isTarget && totalDamage > 0) {
                this.updateDamagePreview(index, totalDamage, enemy.currentHp, enemy.hp);
            }
        });
    }

    // 结束悬停
    onCardHoverOut() {
        // 清除所有预览
        const previews = document.querySelectorAll('.enemy-hp-preview');
        previews.forEach(el => el.style.width = '0%');
        const pixels = document.querySelectorAll('.enemy-hp-fill');
        pixels.forEach(el => el.classList.remove('will-die'));
    }

    // 更新预览条
    updateDamagePreview(enemyIndex, damage, currentHp, maxHp) {
        const enemyEl = document.querySelector(`.enemy[data-index="${enemyIndex}"]`);
        if (!enemyEl) return;

        const previewBar = enemyEl.querySelector('.enemy-hp-preview');
        if (!previewBar) return;

        // 确保伤害不超过当前血量
        const effectiveDamage = Math.min(damage, currentHp);
        const damagePercent = (effectiveDamage / maxHp) * 100;

        // 预览条应该显示在血条末端？不，通常是覆盖在血条即将减少的部分。
        // CSS设置 .enemy-hp-preview 为 absolute right: 0? 
        // 或者是覆盖在 .enemy-hp-fill 上？
        // 简单做法：Preview是灰色，Width = Damage%。
        // 因为 .enemy-hp-fill 是 width%，我们只需把 preview 放在 fill 里面？
        // 或者 preview 也是 absolute, left = currentHp% - damage% ?
        // 让我们看看HTML结构。 .enemy-hp 是相对定位容器。
        // .enemy-hp-fill 是当前血量。
        // 我们想让 preview 显示在 fill 的末尾。
        // 所以 preview 应该放在 fill 内部？或者 preview 也是 absolute top 0 right (100 - currentHpPercent)% ?

        // 重新思考 CSS：
        // 假设 .enemy-hp-fill width=80%.
        // 伤害 20%. 剩余 60%.
        // 我们希望 60%-80% 这段闪烁。
        // 这可以通过在 .enemy-hp-fill 内部加一个 right-aligned 的 div 实现？难。
        // 更好的方法：.enemy-hp-preview 绝对定位，left = (currentHp - damage)/maxHp * 100 %. width = damage/maxHp * 100 %.

        const remainingHp = currentHp - effectiveDamage;
        const leftPercent = (remainingHp / maxHp) * 100;

        previewBar.style.left = `${leftPercent}%`;
        previewBar.style.width = `${damagePercent}%`;
        previewBar.style.opacity = '1';

        // 致死提示
        if (remainingHp <= 0) {
            const fill = enemyEl.querySelector('.enemy-hp-fill');
            if (fill) fill.classList.add('will-die'); // 添加致命闪烁
        }
    }

    // 计算预估伤害
    calculateEffectDamage(effect, target) {
        let value = effect.value || 0;
        if (effect.type === 'randomDamage') value = (effect.minValue + effect.maxValue) / 2;

        // 1. 玩家自身加成
        if (['damage', 'penetrate', 'damageAll', 'randomDamage'].includes(effect.type)) {
            // 苦行 (Asceticism) - 若有保留手牌获得功德
            // 注意：这里是在弃牌之前判断，所以只要手牌数>0就算保留（如果没有手动打出）
            // 实际上 "保留" 意味着没有被打出。
            if (this.player.buffs.meritOnRetain > 0) {
                const retainedCount = this.player.hand.length;
                if (retainedCount > 0 && this.player.fateRing && this.player.fateRing.gainMerit) {
                    const merit = retainedCount * this.player.buffs.meritOnRetain;
                    this.player.fateRing.gainMerit(merit);
                    Utils.showBattleLog(`苦行：保留${retainedCount}张卡，功德+${merit}`);
                }
            }

            // 弃牌
            if (!this.player.buffs.retainHand) {
                this.player.discardHand();
            } // 虚弱
            if (this.player.buffs.weak) value = Math.floor(value * 0.75);

            // 聚气 (Next Attack Bonus) - 预览不应消耗
            if (this.player.buffs.nextAttackBonus) value += this.player.buffs.nextAttackBonus;
        }

        // 命环战术加成 (Analysis Ring)
        if (this.player.fateRing && this.player.fateRing.getTacticalBonus && target) {
            const bonus = this.player.fateRing.getTacticalBonus(target);
            if (bonus > 0) {
                value = Math.floor(value * (1 + bonus));
            }
        }

        // 2. 目标防御计算
        let finalDamage = value;

        // 穿透无视护盾
        if (effect.type !== 'penetrate') {
            // 计算被护盾抵消的部分
            if (target.block > 0) {
                const block = target.block;
                if (block >= finalDamage) {
                    finalDamage = 0;
                } else {
                    finalDamage -= block;
                }
            }
        }

        // 3. 目标易伤
        if (target.buffs && target.buffs.vulnerable) {
            finalDamage += target.buffs.vulnerable; // 这里使用的是固定值易伤，确认下 battle.js 里的逻辑
            // check battle.js line 699: amount += enemy.buffs.vulnerable; yes it is additive.
        }

        return Math.max(0, finalDamage);
    }

    // 卡牌点击处理
    onCardClick(cardIndex) {
        if (this.currentTurn !== 'player' || this.battleEnded || this.isProcessingCard) return;

        const card = this.player.hand[cardIndex];
        if (!card) return;

        // 检查奶糖消耗 (如果包含抽牌效果)
        // 规则: 抽牌卡不消耗灵力，消耗奶糖
        const hasDraw = card.effects.some(e => e.type === 'draw' || e.type === 'drawCalculated' || e.type === 'conditionalDraw' || e.type === 'randomCards');

        // 计算消耗
        let energyCost = card.cost;
        let candyCost = 0;

        if (hasDraw) {
            energyCost = 0; // 抽牌卡不消耗灵力
            candyCost = 1;  // 抽牌卡消耗1奶糖
        }

        // 检查灵力
        if (energyCost > 0 && this.player.currentEnergy < energyCost) {
            Utils.showBattleLog('灵力不足！');
            return;
        }

        // 检查奶糖
        if (candyCost > 0 && this.player.milkCandy < candyCost) {
            Utils.showBattleLog('奶糖不足！无法使用此卡');
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

            // 命环资源钩子 (Karma Ring)
            if (this.player.fateRing && this.player.fateRing.type === 'karma') {
                // 简单规则：卡牌耗能多少就积攒多少？或者固定1点？
                // 暂定：每次出牌积攒 5 点，耗能越高加成越多 ?
                // 简化：固定值 + 耗能 * 5
                const gain = 5 + (card.cost || 0) * 5;

                if (card.type === 'attack') {
                    this.player.fateRing.gainSin(gain);
                } else if (card.type === 'skill' || card.type === 'power') {
                    this.player.fateRing.gainMerit(gain);
                }
            }

            // 触发法宝使用卡牌效果
            const context = {
                damageModifier: 0
                // 未来可扩展 blockModifier 等，但需修改 player.playCard
            };

            if (this.player.triggerTreasureEffect) {
                this.player.triggerTreasureEffect('onCardPlay', card, context);
            }

            // 破法者 (Lawbreaker) - 攻击获得护盾
            if (card.type === 'attack' && this.player.buffs.blockOnAttack) {
                this.player.addBlock(this.player.buffs.blockOnAttack);
                Utils.showBattleLog(`破法者触发！获得 ${this.player.buffs.blockOnAttack} 护盾`);
            }

            // 播放卡牌
            const results = this.player.playCard(cardIndex, target);

            // 播放音效
            if (typeof audioManager !== 'undefined') {
                audioManager.playSFX('attack');
            }

            // 应用法宝的伤害修正 (仅对 damage 类型有效，因为 block 等已在 playCard 内部执行)
            if (results && context.damageModifier !== 0) {
                results.forEach(res => {
                    if (res.type === 'damage' || res.type === 'penetrate' || res.type === 'damageAll') {
                        res.value += context.damageModifier;
                    }
                });
            }

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

        // 辅助函数：根据伤害计算震动强度
        const getShakeIntensity = (damage) => {
            if (damage >= 30) return 'heavy';
            if (damage < 10) return 'light';
            return 'medium';
        };

        switch (result.type) {
            case 'damage':
            case 'randomDamage':
                if (target) {
                    const damage = this.dealDamageToEnemy(target, result.value);
                    if (enemyEl) {
                        Utils.addShakeEffect(enemyEl, getShakeIntensity(damage));
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
                        const stealRate = isNaN(this.pendingLifeSteal) ? 0 : this.pendingLifeSteal;
                        const stealHeal = Math.floor(damage * stealRate);
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
                    const penDmg = (typeof result.value === 'number' && !isNaN(result.value)) ? result.value : 0;
                    const oldBlock = target.block;
                    target.block = 0;
                    target.currentHp -= penDmg;
                    target.block = oldBlock;

                    if (enemyEl) {
                        Utils.addShakeEffect(enemyEl, getShakeIntensity(penDmg));
                        Utils.showFloatingNumber(enemyEl, penDmg, 'damage');
                    }
                    Utils.showBattleLog(`穿透伤害 ${penDmg}！`);
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
                        Utils.addShakeEffect(enemyEl, getShakeIntensity(damage));
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
                        Utils.addShakeEffect(enemyEl, getShakeIntensity(dmg));
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

            case 'gainSin':
                Utils.showBattleLog(`业力 +${result.value}`);
                break;

            case 'gainMerit':
                Utils.showBattleLog(`功德 +${result.value}`);
                break;

            case 'discardHand':
                Utils.showBattleLog(`丢弃了 ${result.value} 张手牌`);
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
                        Utils.addShakeEffect(el, getShakeIntensity(dmg));
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
                    Utils.addShakeEffect(playerEl, getShakeIntensity(result.value));
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
                break;

            case 'maxHpOnKill':
                if (target && target.currentHp <= 0) {
                    this.player.maxHp += result.value;
                    this.player.currentHp += result.value; // 同时回复等量生命
                    Utils.showBattleLog(`灵魂收割！最大生命 +${result.value}`);
                    const playerEl = document.querySelector('.player-avatar');
                    Utils.showFloatingNumber(playerEl, result.value, 'heal');
                }
                break;

            case 'mulligan':
                Utils.showBattleLog(`命运扭转！重抽 ${result.value} 张牌`);
                this.updateHandUI();
                break;
        }

        await Utils.sleep(300);
        this.updateBattleUI();
    }

    // 对敌人造成伤害
    dealDamageToEnemy(enemy, amount) {
        if (typeof amount !== 'number' || isNaN(amount)) {
            console.error('dealDamageToEnemy received NaN amount', amount);
            amount = 0;
        }

        // 13. 心魔镜像 (Reflect)
        if (enemy.buffs.reflect && enemy.buffs.reflect > 0) {
            enemy.buffs.reflect--;
            Utils.showBattleLog(`${enemy.name} 反弹了攻击！`);
            this.player.takeDamage(amount);

            const playerEl = document.querySelector('.player-avatar');
            if (playerEl) {
                Utils.addShakeEffect(playerEl, 'heavy');
                Utils.showFloatingNumber(playerEl, amount, 'damage');
            }
            return 0; // 敌人不受伤害
        }

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
                // 为了游戏性，我们可以设定为“攻击造成伤害时额外造成”
                const trueDmg = plasmaOverload.effect.value;
                enemy.currentHp -= trueDmg;
                // 显示特效
                const enemyEl = document.querySelector(`.enemy[data-index="${this.enemies.indexOf(enemy)}"]`);
                if (enemyEl) Utils.showFloatingNumber(enemyEl, trueDmg, 'damage');
                Utils.showBattleLog(`雷火劫：额外 ${trueDmg} 点真实伤害`);
            }
        }

        // 战术优势 (Tactical Advantage) - 攻击易伤回能
        if (this.player.buffs.energyOnVulnerable > 0 && enemy && enemy.buffs && enemy.buffs.vulnerable > 0) {
            const gain = this.player.buffs.energyOnVulnerable;
            // 每回合限2次
            if ((this.tacticalAdvantageTriggerCount || 0) < 2) {
                this.player.currentEnergy += gain;
                this.tacticalAdvantageTriggerCount = (this.tacticalAdvantageTriggerCount || 0) + 1;
                Utils.showBattleLog(`战术优势！回能 +${gain}`);
                this.updateEnergyUI();
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
            if (comboBonus > 1) {
                amount = Math.floor(amount * comboBonus);
                // Utils.showBattleLog(`连击加成：x${comboBonus.toFixed(1)}`);
            }
        }

        // 检查易伤
        if (enemy.buffs.vulnerable && enemy.buffs.vulnerable > 0) {
            amount += enemy.buffs.vulnerable;
        }

        // 默认扣血逻辑
        let finalDamage = Math.floor(amount);
        const wasAlive = enemy.currentHp > 0;

        // 检查护盾
        if (enemy.block > 0) {
            if (enemy.block >= finalDamage) {
                enemy.block -= finalDamage;
                finalDamage = 0;
            } else {
                finalDamage -= enemy.block;
                enemy.block = 0;
            }
        }

        enemy.currentHp -= finalDamage;
        if (enemy.currentHp < 0) enemy.currentHp = 0;

        // 击杀触发
        if (wasAlive && enemy.currentHp <= 0) {
            if (this.player.triggerTreasureEffect) {
                this.player.triggerTreasureEffect('onKill', enemy);
            }
        }

        return finalDamage;
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

        // 环境：回合结束效果
        if (this.activeEnvironment && this.activeEnvironment.onTurnEnd) {
            this.activeEnvironment.onTurnEnd(this);
            if (this.checkBattleEnd()) return;
        }

        // 新回合
        this.turnNumber++;
        this.currentTurn = 'player';

        // 环境：回合开始效果
        if (this.activeEnvironment && this.activeEnvironment.onTurnStart) {
            this.activeEnvironment.onTurnStart(this);
            if (this.checkBattleEnd()) return; // 环境伤害可能致死
        }

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

            // 处理敌人debuff (提前处理，防止晕眩导致不受DOT伤害)
            await this.processEnemyDebuffs(enemy, i);

            // 检查晕眩
            if (enemy.stunned) {
                enemy.stunned = false;
                Utils.showBattleLog(`${enemy.name} 被眩晕，跳过回合`);

                // 控制抵抗机制 (Realm 16+)
                if (this.player.realm >= 16) {
                    let resistChance = 0;
                    if (this.player.realm === 16) resistChance = 0.3;
                    else if (this.player.realm === 17) resistChance = 0.4;
                    else if (this.player.realm >= 18) resistChance = 0.5;

                    if (Math.random() < resistChance) {
                        enemy.buffs.controlImmune = 2; // 持续2回合
                        Utils.showBattleLog(`${enemy.name} 产生了抗性！(免疫控制)`);
                    }
                }

                await Utils.sleep(500);
                continue;
            }

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

            // 16. 太乙神雷 (realm 16) - 敌人每回合获得攻击力+1
            if (this.player.realm === 16) {
                if (!enemy.buffs.strength) enemy.buffs.strength = 0;
                enemy.buffs.strength += 1;
                Utils.showBattleLog(`${enemy.name} 吸收灵气，攻击力+1`);
            }

            // 17. 大罗法身 (realm 17) - 敌人每回合回复 5% 最大生命
            if (this.player.realm === 17) {
                const regen = Math.floor(enemy.maxHp * 0.05);
                if (regen > 0 && enemy.currentHp < enemy.maxHp) {
                    enemy.currentHp = Math.min(enemy.maxHp, enemy.currentHp + regen);
                    Utils.showFloatingNumber(document.querySelector(`.enemy[data-index="${this.enemies.indexOf(enemy)}"]`), regen, 'heal');
                    Utils.showBattleLog(`${enemy.name} 回复了 ${regen} 点生命`);
                }
            }
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
        // 只有主行动才显示日志，避免子行动刷屏
        Utils.showBattleLog(`${enemy.name} 使用 ${pattern.intent}`);

        await this.processEnemyPattern(enemy, pattern, index);

        this.updateBattleUI();
    }

    // 处理单个意图模式 (分离出来以支持 multiAction)
    async processEnemyPattern(enemy, pattern, index) {
        const playerEl = document.querySelector('.player-avatar');

        switch (pattern.type) {
            case 'multiAction':
                if (pattern.actions && Array.isArray(pattern.actions)) {
                    for (const action of pattern.actions) {
                        await this.processEnemyPattern(enemy, action, index);
                        await Utils.sleep(300); // 动作间歇
                    }
                }
                break;

            case 'summon':
                const summonCount = pattern.count || 1;
                for (let k = 0; k < summonCount; k++) {
                    this.summonEnemy(pattern.value);
                }
                Utils.showBattleLog(`${enemy.name} 召唤了随从！`);
                break;

            case 'attack':
                let damage = pattern.value;
                if (typeof damage !== 'number' || isNaN(damage)) {
                    console.error('Enemy attack damage is NaN', pattern);
                    damage = 0;
                }

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

                    // 16. 太乙神雷 (realm 16) - 敌人攻击吸血 20%
                    if (this.player.realm === 16 && result.damage > 0 && !isNaN(result.damage)) {
                        const heal = Math.ceil(result.damage * 0.2);
                        if (heal > 0 && !isNaN(heal)) {
                            enemy.currentHp = Math.min(enemy.maxHp, enemy.currentHp + heal);
                            if (isNaN(enemy.currentHp)) {
                                console.error('Enemy HP became NaN after lifesteal', enemy);
                                enemy.currentHp = enemy.maxHp; // Fallback
                            }
                            const enemyEl = document.querySelector(`.enemy[data-index="${index}"]`);
                            if (enemyEl) Utils.showFloatingNumber(enemyEl, heal, 'heal');
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
                const blockVal = (typeof pattern.value === 'number' && !isNaN(pattern.value)) ? pattern.value : 0;
                enemy.block += blockVal;
                Utils.showBattleLog(`${enemy.name} 获得 ${blockVal} 点护盾`);
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
                const healVal = (typeof pattern.value === 'number' && !isNaN(pattern.value)) ? pattern.value : 0;
                enemy.currentHp = Math.min(enemy.hp, enemy.currentHp + healVal);
                Utils.showBattleLog(`${enemy.name} 恢复了 ${healVal} 点生命`);
                break;

            case 'tribulationStrike':
                // 天雷：造成真实伤害（无视护盾）
                Utils.showBattleLog(`天劫轰击！受到 ${pattern.value} 点真实伤害！`);
                if (playerEl) Utils.addFlashEffect(playerEl, 'purple');
                this.player.currentHp -= pattern.value;
                if (this.player.currentHp < 0) this.player.currentHp = 0;

                if (playerEl) Utils.showFloatingNumber(playerEl, pattern.value, 'damage');

                if (this.player.currentHp <= 0) {
                    // 9. 生死轮回 (realm 9) check
                    if (this.player.realm === 9 && !this.player.hasRebirthed && Math.random() < 0.5) {
                        this.player.currentHp = this.player.maxHp;
                        this.player.hasRebirthed = true;
                        Utils.showBattleLog('生死轮回：逆天改命，满血复活！');
                    }
                }
                break;

            case 'innerDemon':
                // 塞入心魔牌
                const demonCardId = pattern.card;
                const count = pattern.count || 1;
                const demonCardDef = CARDS[demonCardId];
                if (demonCardDef) {
                    for (let c = 0; c < count; c++) {
                        const demonCard = { ...demonCardDef, instanceId: this.player.generateCardId() };
                        // Random insert
                        const pos = Math.floor(Math.random() * (this.player.drawPile.length + 1));
                        this.player.drawPile.splice(pos, 0, demonCard);
                    }
                    Utils.showBattleLog(`心魔滋生！牌组中加入了 ${count} 张 ${demonCardDef.name}`);
                }
                break;
        }
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
    // 召唤敌人
    summonEnemy(enemyId) {
        if (this.enemies.length >= 4) {
            Utils.showBattleLog('战场拥挤，无法召唤！');
            return;
        }

        // 查找敌人数据
        let enemyData = null;
        if (typeof ENEMIES !== 'undefined' && ENEMIES[enemyId]) {
            enemyData = ENEMIES[enemyId];
        } else if (typeof ENEMIES !== 'undefined') {
            // 尝试遍历所有 (Fallback)
            for (const key in ENEMIES) {
                if (ENEMIES[key].id === enemyId) {
                    enemyData = ENEMIES[key];
                    break;
                }
            }
        }

        if (enemyData) {
            const minion = this.createEnemyInstance(enemyData);
            minion.isMinion = true; // 标记为随从
            this.enemies.push(minion);
            this.updateBattleUI();

            // 随从入场特效
            setTimeout(() => {
                const newEnemyEl = document.querySelector(`.enemy[data-index="${this.enemies.length - 1}"]`);
                if (newEnemyEl) Utils.addFlashEffect(newEnemyEl);
            }, 100);
        } else {
            console.warn(`Summon failed: Enemy ${enemyId} not found.`);
        }
    }


    // 检查阶段转换
    checkPhaseChange(enemy) {
        if (!enemy.phases || enemy.currentPhase >= enemy.phases.length) return;

        // 初始化 phases
        if (typeof enemy.currentPhase === 'undefined') enemy.currentPhase = 0;

        const nextPhase = enemy.phases[enemy.currentPhase]; // 这里 enemy.currentPhase 初始应为 0，对应 phases[0] 即第一个转阶段配置

        // 修正逻辑：如果当前 Hp 比例低于 phase 阈值
        if (nextPhase && (enemy.currentHp / enemy.hp) <= nextPhase.threshold) {
            // 触发转阶段
            enemy.currentPhase++; // 增加阶段计数，避免重复触发
            Utils.showBattleLog(`${enemy.name} 进入${nextPhase.name}形态！`);

            // 更新行动模式
            if (nextPhase.patterns) {
                enemy.patterns = nextPhase.patterns;
                enemy.currentPatternIndex = 0; // 重置循环
            }

            // 播放特效
            const enemyEl = document.querySelector(`.enemy[data-index="${this.enemies.indexOf(enemy)}"]`);
            if (enemyEl) {
                Utils.addShakeEffect(enemyEl, 'heavy');
                Utils.addFlashEffect(enemyEl, 'red'); // 狂暴红光
            }

            // 恢复少量生命?
            if (nextPhase.heal) {
                const healAmt = Math.floor(enemy.hp * nextPhase.heal);
                enemy.currentHp = Math.min(enemy.hp, enemy.currentHp + healAmt);
                Utils.showBattleLog(`${enemy.name} 恢复了力量！`);
            }
        }
    }

    // 更新环境UI
    updateEnvironmentUI() {
        const envEl = document.getElementById('battle-environment');
        if (!envEl) return;

        if (this.activeEnvironment) {
            envEl.style.display = 'flex';
            envEl.innerHTML = `
                <span class="env-icon">${this.activeEnvironment.icon}</span>
                <span class="env-name">${this.activeEnvironment.name}</span>
            `;
            envEl.title = this.activeEnvironment.description;
        } else {
            envEl.style.display = 'none';
        }
    }
}
