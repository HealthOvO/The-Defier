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
        this.battleEnded = false;
        this.isProcessingCard = false; // 防止卡牌连点

        // 五行定义
        this.ELEMENTS = {
            metal: { name: '金', color: '#FFD700', weak: 'fire', strong: 'wood' },
            wood: { name: '木', color: '#4CAF50', weak: 'metal', strong: 'earth' },
            water: { name: '水', color: '#2196F3', weak: 'earth', strong: 'fire' },
            fire: { name: '火', color: '#FF5722', weak: 'water', strong: 'metal' },
            earth: { name: '土', color: '#795548', weak: 'wood', strong: 'water' }
        };
    }

    // 计算五行克制倍率
    calcElementalMultiplier(source, target) {
        if (!source || !target) return 1.0;

        const s = Utils.getCanonicalElement(source);
        const t = Utils.getCanonicalElement(target);

        if (s === 'none' || t === 'none') return 1.0;

        const sDef = this.ELEMENTS[s];
        if (!sDef) return 1.0;

        if (sDef.strong === t) return 1.5; // 克制
        if (sDef.weak === t) return 0.7;   // 被克
        if (s === t) return 0.8;           // 同属性

        return 1.0;
    }

    // 初始化战斗
    init(enemyData) {
        this.enemies = [];
        this.battleEnded = false;
        this.turnNumber = 0;
        this.selectedCard = null;
        this.targetingMode = false;
        this.targetingMode = false;
        this.isProcessingCard = false;
        this.cardsPlayedThisTurn = 0;
        this.playerAttackedThisTurn = false;

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
        // 1. 深拷贝行动模式，防止修改污染原始数据 (Deep copy patterns)
        const patterns = enemyData.patterns.map(p => ({ ...p }));

        // 2. 全局数值增强 (Global Scaling)
        // HP +20%
        let maxHp = Math.floor(enemyData.hp * 1.2);

        // 伤害 +15%
        patterns.forEach(p => {
            if (p.type === 'attack' || p.type === 'multiAttack') {
                if (typeof p.value === 'number') {
                    p.value = Math.floor(p.value * 1.15);
                }
            }
        });

        // 初始化基本对象
        const enemy = {
            ...enemyData,
            maxHp: maxHp,
            currentHp: maxHp,
            patterns: patterns, // 使用修改后的 patterns
            block: 0,
            buffs: {},
            currentPatternIndex: 0,
            stunned: false,
            isElite: false
        };

        // 3. 精英怪机制 (Elite System)
        // 非Boss单位有 20% 几率突变为精英
        // 3. 精英怪机制 (Elite System)
        // 非Boss单位有 20% 几率突变为精英
        // 增加 isMinion 检查，防止召唤物过于变态
        // 增加 !enemy.isElite 检查，防止已经是精英的怪再次突变 (Double Elite Bug Fix)
        if (!enemy.isBoss && !enemy.isMinion && !enemy.isElite && Math.random() < 0.2) {
            enemy.isElite = true;
            enemy.alias = enemy.name; // Keep original name reference if needed
            enemy.name = `【精英】${enemy.name}`;

            // 精英属性加成
            // HP 额外 +30% (总计 x1.56)
            enemy.maxHp = Math.floor(enemy.maxHp * 1.3);
            enemy.currentHp = enemy.maxHp;

            // 伤害 额外 +20% (总计 x1.38)
            enemy.patterns.forEach(p => {
                if (p.type === 'attack' || p.type === 'multiAttack') {
                    if (typeof p.value === 'number') {
                        p.value = Math.floor(p.value * 1.2);
                    }
                }
            });

            // 随机精英词缀
            const eliteTypes = ['strength', 'toughness', 'thorns', 'regen', 'swift'];
            const type = eliteTypes[Math.floor(Math.random() * eliteTypes.length)];
            enemy.eliteType = type;

            // 初始化词缀效果
            if (type === 'strength') enemy.buffs.strength = 3;
            if (type === 'toughness') {
                enemy.block = 15;
                enemy.buffs.retainBlock = 1; // 假设系统支持此Buff保留护盾
            }
            if (type === 'thorns') enemy.buffs.thorns = 5;
            // Regen 和 Swift 在回合逻辑或受击逻辑中处理
            // 为 Swift 添加初始闪避率 (需要在 dealDamage 中支持)
            if (type === 'swift') enemy.buffs.dodgeChance = 0.15; // 自定义属性

            Utils.showBattleLog(`遭遇强敌：${enemy.name} (特性:${type})`);
        }

        // Boss HP 额外增强 +20%
        if (enemy.isBoss) {
            enemy.maxHp = Math.floor(enemy.maxHp * 1.2);
            enemy.currentHp = enemy.maxHp;
        }

        return enemy;
    }

    // 开始战斗
    startBattle() {
        this.turnNumber = 1;
        this.currentTurn = 'player';
        this.isProcessingCard = false; // 强制重置状态
        this.playerTookDamage = false; // For Trial Challenge
        this.player.resurrectCount = 0; // Reset resurrection counter
        this.cardsPlayedThisTurn = 0;
        this.playerAttackedThisTurn = false;

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

        // Boss机制初始化
        if (typeof BossMechanicsHandler !== 'undefined') {
            this.enemies.forEach(enemy => {
                if (enemy.isBoss) {
                    BossMechanicsHandler.processBattleStart(this, enemy);
                }
            });
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
                // Fix: use selectedCardIndex that matches startTargetingMode
                if (this.targetingMode && this.selectedCardIndex !== undefined && this.selectedCardIndex !== -1) {
                    this.playCardOnTarget(this.selectedCardIndex, index);
                }
            });

            container.appendChild(enemyEl);
        });
    }

    // 更新手牌UI
    updateHandUI() {
        const handContainer = document.getElementById('hand-cards');
        handContainer.innerHTML = '';

        // CSS Force for Scroll - Moved to CSS class .hand-area
        handContainer.classList.add('hand-active');

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
            if (card.consumeCandy) {
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


        // 显示奶糖 (3D Candy Visualization)
        let candyContainer = document.getElementById('candy-container');
        if (!candyContainer) {
            const resourcesContainer = document.querySelector('.resources-container');
            if (resourcesContainer) {
                candyContainer = document.createElement('div');
                candyContainer.id = 'candy-container';
                candyContainer.className = 'candy-display resource-item';
                candyContainer.dataset.resource = 'candy';
                resourcesContainer.appendChild(candyContainer);
            }
        }

        if (candyContainer) {
            // 清空并重新渲染糖果
            candyContainer.innerHTML = '';
            const maxCandies = 5; // 最多显示5颗糖果
            const candyCount = Math.min(this.player.milkCandy, maxCandies);

            const orbsWrapper = document.createElement('div');
            orbsWrapper.className = 'candy-orbs';

            for (let i = 0; i < candyCount; i++) {
                const candy = document.createElement('div');
                candy.className = 'candy-orb';
                candy.style.animationDelay = `${i * 0.1}s`;
                orbsWrapper.appendChild(candy);
            }

            candyContainer.appendChild(orbsWrapper);

            // 添加数字文本
            const candyText = document.createElement('span');
            candyText.className = 'candy-text';
            candyText.textContent = this.player.milkCandy;
            candyContainer.appendChild(candyText);

            // 添加tooltip
            const tooltip = document.createElement('div');
            tooltip.className = 'resource-tooltip';
            tooltip.textContent = '奶糖';
            candyContainer.appendChild(tooltip);
        }
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
        if (!card.effects || !Array.isArray(card.effects)) return;

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

    // 计算预估伤害 (仅用于UI预览，不应修改任何游戏状态)
    calculateEffectDamage(effect, target) {
        let value = effect.value || 0;
        if (effect.type === 'randomDamage') value = (effect.minValue + effect.maxValue) / 2;

        // 1. 玩家自身加成 (仅查询，不修改状态)
        if (['damage', 'penetrate', 'damageAll', 'randomDamage'].includes(effect.type)) {
            // 虚弱减伤
            if (this.player.buffs.weak) value = Math.floor(value * 0.75);

            // 聚气 (Next Attack Bonus) - 预览时计入但不消耗
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
        if (this.currentTurn !== 'player' || this.battleEnded || this.isProcessingCard) {
            console.warn(`Card Click Ignored: Turn=${this.currentTurn}, Ended=${this.battleEnded}, Processing=${this.isProcessingCard}`);
            return;
        }

        // Play sound
        if (typeof audioManager !== 'undefined') {
            audioManager.playSFX('click');
        }

        const card = this.player.hand[cardIndex];
        if (!card) return;

        // 计算消耗
        let energyCost = card.cost;
        let candyCost = 0;

        if (card.consumeCandy) {
            // candyCost = 1; // 保持一致，消耗1奶糖
            // 注意：onCardClick 主要是检查能否打出，具体扣除在 player.playCard
            // 这里我们只需要检查条件
            // 但为了 UI提示 (BattleLog)，我们需要知道消耗什么
            candyCost = 1;
            energyCost = 0; // 消耗奶糖的卡牌不需要消耗灵力
        } else {
            // energyCost is already card.cost
        }

        if (energyCost > 0 && this.player.currentEnergy < energyCost) {
            Utils.showBattleLog('灵力不足！');
            return;
        }

        // Multi-Enemy Targeting Logic
        // Fix: Added 'penetrate', 'steal', 'lifeSteal', 'absorb', 'swapHpPercent', 'executeDamage', 'percentDamage' to trigger targeting mode
        const needsTarget = card.effects && card.effects.some(e =>
            ['damage', 'debuff', 'execute', 'removeBlock', 'goldOnKill', 'maxHpOnKill', 'penetrate', 'steal', 'lifeSteal', 'absorb', 'swapHpPercent', 'executeDamage', 'percentDamage'].includes(e.type)
            && (!e.target || e.target === 'enemy' || e.target === 'single')
        );
        const hasMultipleEnemies = this.enemies.filter(e => e.currentHp > 0).length > 1;

        if (needsTarget && hasMultipleEnemies) {
            if (this.targetingMode) {
                this.endTargetingMode();
            } else {
                this.startTargetingMode(cardIndex);
            }
            return;
        }

        let targetIndex = 0;
        if (needsTarget && !hasMultipleEnemies) {
            targetIndex = this.enemies.findIndex(e => e.currentHp > 0);
            if (targetIndex === -1) return;
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

        this.playCardOnTarget(cardIndex, targetIndex);
    }

    // 对目标使用卡牌
    async playCardOnTarget(cardIndex, targetIndex) {
        if (this.isProcessingCard) return;
        this.isProcessingCard = true;

        // Safety timeout
        const processingTimeout = setTimeout(() => {
            if (this.isProcessingCard) {
                console.warn('Card processing timed out, forcing reset');
                this.isProcessingCard = false;
                Utils.showBattleLog('操作超时，状态已重置');
            }
        }, 3000);

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
                Utils.showBattleLog(`金戈铁马：消耗 ${bloodTax} 点生命`); // Simplified Log
            }

            // 立即给予视觉反馈
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

            // 命环资源钩子
            if (this.player.fateRing && this.player.fateRing.type === 'karma') {
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
            };

            if (this.player.triggerTreasureEffect) {
                this.player.triggerTreasureEffect('onCardPlay', card, context);
            }

            // 破法者 (Lawbreaker)
            if (card.type === 'attack' && this.player.buffs.blockOnAttack) {
                this.player.addBlock(this.player.buffs.blockOnAttack);
                Utils.showBattleLog(`破法者：获得 ${this.player.buffs.blockOnAttack} 护盾`);
            }

            // 播放卡牌 (核心逻辑)
            const results = this.player.playCard(cardIndex, target);

            // 播放音效
            if (typeof audioManager !== 'undefined') {
                audioManager.playSFX('attack');
            }

            // 应用法宝的伤害修正
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
                    await this.processEffect(result, target, targetIndex, card.element);
                }
            }

            // 检查战斗是否结束
            if (this.checkBattleEnd()) return;

            // 计数与追踪
            this.cardsPlayedThisTurn++;
            if (card.type === 'attack') this.playerAttackedThisTurn = true;

            // 风雷翼
            const windThunder = this.player.activeResonances && this.player.activeResonances.find(r => r.id === 'windThunderWing');
            if (windThunder && this.cardsPlayedThisTurn % windThunder.effect.count === 0) {
                const enemies = this.enemies.filter(e => e.currentHp > 0);
                if (enemies.length > 0) {
                    const thunderTarget = enemies[Math.floor(Math.random() * enemies.length)];
                    const dmg = windThunder.effect.damage;
                    this.dealDamageToEnemy(thunderTarget, dmg);
                    Utils.showBattleLog(`风雷翼：造成 ${dmg} 伤害`);
                    const el = document.querySelector(`.enemy[data-index="${this.enemies.indexOf(thunderTarget)}"]`);
                    if (el) Utils.showFloatingNumber(el, dmg, 'damage');
                }
            }

            // 雷法残章
            if (card.type === 'attack') {
                const thunderLaw = this.player.collectedLaws.find(l => l.id === 'thunderLaw');
                if (thunderLaw && Math.random() < thunderLaw.passive.chance) {
                    const enemies = this.enemies.filter(e => e.currentHp > 0);
                    if (enemies.length > 0) {
                        const tTarget = enemies[Math.floor(Math.random() * enemies.length)];
                        const dmg = thunderLaw.passive.value;
                        this.dealDamageToEnemy(tTarget, dmg);
                        Utils.showBattleLog(`雷霆之力：造成 ${dmg} 伤害`);
                        const el = document.querySelector(`.enemy[data-index="${this.enemies.indexOf(tTarget)}"]`);
                        if (el) Utils.showFloatingNumber(el, dmg, 'damage');
                    }
                }

                // 时间静止
                const timeLaw = this.player.collectedLaws.find(l => l.id === 'timeStop');
                if (timeLaw && target && Math.random() < timeLaw.passive.stunChance) {
                    target.stunned = true;
                    Utils.showBattleLog('时间静止：敌人眩晕！');
                }
            }

            // 更新UI
            this.updateBattleUI();
        } catch (error) {
            console.error('Error playing card:', error);
            Utils.showBattleLog('卡牌使用失败！');
            this.updateHandUI(); // Reload UI to fix state
        } finally {
            clearTimeout(processingTimeout);
            this.isProcessingCard = false;
        }
    }

    // 处理效果
    async processEffect(result, target, targetIndex, sourceElement = null) {
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
                    const damage = this.dealDamageToEnemy(target, result.value, sourceElement);
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

                    // 共鸣：剑雷交织 (Thunder Sword) - 穿透附带麻痹
                    const thunderSword = this.player.activeResonances.find(r => r.id === 'thunderSword');
                    if (thunderSword) {
                        // Apply paralysis/stun/weak
                        // Using 'stun' as paralysis representation or 'weak'?
                        // Effect value is 2. Probably 2 stacks of Stun or Weak?
                        // Description: "Penetrate damage applies 2 layers of Paralysis". 
                        // Check what Paralysis does. Valid buffs usually: 'stun', 'weak', 'vulnerable', 'burn'.
                        // 'stun' is usually boolean or 1 turn?
                        // Let's use 'stun' (1 turn) + 'vulnerable' (2 layers)? Or just 'stun'?
                        // Text says "layers". Maybe custom buff?
                        // Let's stick to standard buffs: 2 layers of Vulnerable + chance to Stun?
                        // Or if game supports 'stun' stacks.
                        // Checking battle.js processTurn... 'stunned' is a flag.
                        // Let's apply 2 stacks of 'vulnerable' and small chance to Stun?
                        // Or "Paralysis" = "Stun"? But 2 layers implies duration.
                        // Let's apply 'weak' (reduce dmg) and 'vulnerable' (take more dmg).
                        // Or maybe 'paralysis' is a new buff I should add support for?
                        // To be safe and impactful: 2 stacks of 'vulnerable'.
                        target.buffs.vulnerable = (target.buffs.vulnerable || 0) + thunderSword.effect.value;
                        Utils.showBattleLog(`剑雷交织：敌人麻痹！(易伤+${thunderSword.effect.value})`);
                    }

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
                    const lostHp = Math.max(0, target.maxHp - target.currentHp);
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
                const buffNames = {
                    'vulnerable': '易伤', 'weak': '虚弱', 'poison': '中毒', 'burn': '灼烧', 'stun': '眩晕',
                    'strength': '力量', 'blockOnAttack': '破法盾', 'energyOnVulnerable': '战术优势',
                    'retainBlock': '护盾保留', 'regen': '再生', 'thorns': '反伤', 'reflect': '反弹',
                    'dodge': '闪避', 'dodgeChance': '闪避率', 'freeze': '冰冻', 'slow': '减速',
                    'paralysis': '麻痹', 'severe_wound': '重伤', 'chaosAura': '混沌光环',
                    'meritOnRetain': '苦行', 'immunity': '免疫'
                };
                Utils.showBattleLog(`获得 ${buffNames[result.buffType] || result.buffType} 效果`);
                break;

            case 'debuff':
                if (target) {
                    target.buffs[result.buffType] = (target.buffs[result.buffType] || 0) + result.value;
                    let immune = false;
                    if (result.buffType === 'stun') {
                        // 14. 混元无极 (realm 14) - 50% 免疫眩晕
                        if (this.player.realm === 14 && Math.random() < 0.5) {
                            immune = true;
                            Utils.showBattleLog(`${target.name} 抵抗了眩晕！`);
                        }

                        // Boss Immunity
                        if (target.isBoss && Math.random() < 0.8) { // Boss 80% resist stun
                            immune = true;
                            Utils.showBattleLog(`${target.name} 拥有霸体，免疫眩晕！`);
                        }

                        // Fix: Control Immunity Check (Realm 16+)
                        if (target.buffs && target.buffs.controlImmune > 0) {
                            immune = true;
                            Utils.showBattleLog(`${target.name} 免疫控制效果！`);
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

                    const debuffNames = {
                        'vulnerable': '易伤', 'weak': '虚弱', 'poison': '中毒', 'burn': '灼烧', 'stun': '眩晕',
                        'strength': '力量', 'blockOnAttack': '破法盾', 'energyOnVulnerable': '战术优势',
                        'retainBlock': '护盾保留', 'regen': '再生', 'thorns': '反伤', 'reflect': '反弹',
                        'dodge': '闪避', 'dodgeChance': '闪避率', 'freeze': '冰冻', 'slow': '减速',
                        'paralysis': '麻痹', 'severe_wound': '重伤', 'chaosAura': '混沌光环'
                    };
                    Utils.showBattleLog(`敌人获得 ${debuffNames[result.buffType] || result.buffType} 效果`);
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
                    Utils.showBattleLog(`破甲！移除了 ${removedBlock} 点护盾`);
                    Utils.createFloatingText(target.index, '破甲', '#ff0000');
                    if (this.updateEnemiesUI) this.updateEnemiesUI();
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
                        // Fix: Boss Unstoppable check for AoE stun
                        let immune = false;

                        if (enemy.buffs && enemy.buffs.unstoppable > 0) {
                            immune = true;
                            Utils.showBattleLog(`${enemy.name} 拥有霸体，免疫眩晕！`);
                        }

                        // Fix: Control Immunity Check for AoE
                        if (enemy.buffs && enemy.buffs.controlImmune > 0) {
                            immune = true;
                            Utils.showBattleLog(`${enemy.name} 免疫控制效果！`);
                        }

                        if (!immune) {
                            enemy.stunned = true;
                        }
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
    dealDamageToEnemy(enemy, amount, sourceElement = null) {
        if (typeof amount !== 'number' || isNaN(amount)) {
            console.error('dealDamageToEnemy received NaN amount', amount);
            amount = 0;
        }

        // Elite Ability: Swift (Dodge Chance)
        if (enemy.buffs.dodgeChance && Math.random() < enemy.buffs.dodgeChance) {
            Utils.showBattleLog(`${enemy.name} 闪避了攻击！`);
            return 0;
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

        // 共鸣：雷火崩坏 (Plasma Overload) - 改版：对灼烧敌人增伤
        if (this.player.activeResonances) {
            const plasma = this.player.activeResonances.find(r => r.id === 'plasmaOverload');
            if (plasma && enemy.buffs.burn > 0 && !this._processingPlasma) {
                const extraDmg = Math.floor(amount * plasma.effect.percent);
                if (extraDmg > 0) {
                    enemy.currentHp -= extraDmg;
                    Utils.showBattleLog(`雷火崩坏：过载伤害 +${extraDmg}`);
                    const enemyEl = document.querySelector(`.enemy[data-index="${this.enemies.indexOf(enemy)}"]`);
                    if (enemyEl) Utils.showFloatingNumber(enemyEl, extraDmg, 'damage');

                    // Thunder Strike
                    this._processingPlasma = true;
                    try {
                        this.dealDamageToEnemy(enemy, 10, 'plasma_proc');
                    } finally {
                        this._processingPlasma = false;
                    }
                    Utils.showBattleLog(`雷火崩坏：诱发雷击！`);
                }
            }

            // 共鸣：极温爆裂 (Extreme Temp)
            const extreme = this.player.activeResonances.find(r => r.id === 'extremeTemp');
            // Check if damage type is fire? 
            // We don't have explicit damage type passed easily except my custom call.
            // But let's check if enemy has Burn + Slow/Stun and we just dealt damage?
            // "When dealing FIRE damage".
            // If I passed 'fire' as 3rd arg in my custom calls.
            // Standard attacks might not be fire. 
            // Hack: If enemy has Burn, assume we are doing fire things? No.
            // Let's use the arguments.
            if (extreme && arguments[2] === 'fire') {
                if (enemy.buffs.weak > 0 || enemy.stunned) { // Weak as Slow proxy
                    const boom = Math.floor(enemy.maxHp * extreme.effect.damagePercent * (enemy.isBoss ? 0.5 : 1));
                    enemy.currentHp -= boom;
                    Utils.showBattleLog(`极温爆裂！温差爆炸造成 ${boom} 伤害！`);
                    Utils.showFloatingNumber(document.querySelector(`.enemy[data-index="${this.enemies.indexOf(enemy)}"]`), boom, 'damage');
                }
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

        // 5. 五行克制计算
        if (sourceElement && enemy.element) {
            const multiplier = this.calcElementalMultiplier(sourceElement, enemy.element);

            // 修正抗性 (Resistances)
            let resistMod = 0;
            if (enemy.resistances) {
                const s = Utils.getCanonicalElement(sourceElement);
                if (enemy.resistances[s]) resistMod = enemy.resistances[s]; // e.g., 0.5 means 50% resist
            }

            // 应用克制
            if (multiplier !== 1.0) {
                amount = Math.floor(amount * multiplier);

                // 战斗日志
                const sName = this.ELEMENTS[Utils.getCanonicalElement(sourceElement)].name;
                const tName = this.ELEMENTS[Utils.getCanonicalElement(enemy.element)].name;
                const icon = Utils.getElementIcon(sourceElement);

                if (multiplier > 1) {
                    Utils.showBattleLog(`${icon} ${sName}克${tName}！伤害+50%`);
                    Utils.createFloatingText(this.enemies.indexOf(enemy), '克制!', '#ff0');
                } else if (multiplier < 1 && multiplier > 0.75) { // Same element 0.8
                    Utils.showBattleLog(`${icon} 同属性抵抗！伤害-20%`);
                } else if (multiplier < 0.8) { // Weak 0.7
                    Utils.showBattleLog(`${icon} 被${tName}克制！伤害-30%`);
                    Utils.createFloatingText(this.enemies.indexOf(enemy), '被克', '#888');
                }
            }

            // 应用抗性 (Resistances apply after multiplier or independently?)
            // Usually independent. If resist 0.5, damage * 0.5.
            if (resistMod !== 0) {
                amount = Math.floor(amount * (1 - resistMod));
                if (resistMod > 0) Utils.showBattleLog(`敌方抗性生效！伤害减少 ${Math.floor(resistMod * 100)}%`);
                else Utils.showBattleLog(`敌方弱点！伤害增加 ${Math.floor(Math.abs(resistMod) * 100)}%`);
            }
        }




        // 6. 五行共鸣伤害加成 (Resonance Damage Bonus)
        // 检查玩家收集的法则，计算同属性数量
        if (sourceElement && this.player.collectedLaws) {
            const s = Utils.getCanonicalElement(sourceElement);
            const count = this.player.collectedLaws.filter(l => Utils.getCanonicalElement(l.element) === s).length;

            let bonus = 0;
            if (count >= 2) bonus += 0.10; // +10%
            if (count >= 3) bonus += 0.15; // Total +25%
            if (count >= 4) bonus += 0.15; // Total +40%

            if (bonus > 0) {
                const extra = Math.floor(amount * bonus);
                amount += extra;
                // Utils.showBattleLog(`五行共鸣(${s})：伤害+${Math.floor(bonus*100)}%`);
            }
        }

        // Boss机制伤害处理（减伤、反射等）
        if (enemy.isBoss && typeof BossMechanicsHandler !== 'undefined') {
            amount = BossMechanicsHandler.processOnDamage(this, enemy, amount, 'player');
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

            // Update Achievements: Damage
            if (this.game && this.game.achievementSystem) {
                this.game.achievementSystem.updateStat('totalDamageDealt', finalDamage);
                this.game.achievementSystem.updateStat('maxDamageDealt', finalDamage, 'max');
            }

            // Check Battle End Immediately upon kill
            if (this.checkBattleEnd()) return;

            // === Twin Bonds (Dual Boss Vengeance) ===
            if (enemy.isDualBoss) {
                const survivor = this.enemies.find(e => e.isDualBoss && e.currentHp > 0 && e !== enemy);
                if (survivor) {
                    setTimeout(() => {
                        Utils.showBattleLog(`【双子羁绊】${survivor.name} 因同伴死亡而暴怒！`);

                        const healAmount = Math.floor(survivor.maxHp * 0.5);
                        survivor.currentHp = Math.min(survivor.maxHp, survivor.currentHp + healAmount);
                        Utils.showBattleLog(`${survivor.name} 恢复了 ${healAmount} 点生命！`);

                        survivor.buffs.strength = (survivor.buffs.strength || 0) + 5;
                        Utils.showBattleLog(`${survivor.name} 力量暴涨！(+5 力量)`);

                        if (this.updateEnemiesUI) this.updateEnemiesUI();
                    }, 500);
                }
            }
        }

        // === Twin Bonds (Dual Boss Vengeance) ===
        if (wasAlive && enemy.currentHp <= 0 && enemy.isDualBoss) {
            const survivor = this.enemies.find(e => e.isDualBoss && e.currentHp > 0 && e !== enemy);
            if (survivor) {
                // Delay slightly to let death animation/log play
                setTimeout(() => {
                    Utils.showBattleLog(`【双子羁绊】${survivor.name} 因同伴死亡而暴怒！`);

                    const healAmount = Math.floor(survivor.maxHp * 0.5);
                    survivor.currentHp = Math.min(survivor.maxHp, survivor.currentHp + healAmount);
                    Utils.showBattleLog(`${survivor.name} 恢复了 ${healAmount} 点生命！`);

                    survivor.buffs.strength = (survivor.buffs.strength || 0) + 5;
                    Utils.showBattleLog(`${survivor.name} 力量暴涨！(+5 力量)`);

                    if (this.updateEnemiesUI) this.updateEnemiesUI();
                }, 800);
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

        // 法则：火焰真意 (FlameTruth) - 回合结束AoE
        const flameLaw = this.player.collectedLaws.find(l => l.id === 'flameTruth');
        if (flameLaw && this.playerAttackedThisTurn) {
            Utils.showBattleLog(`烈焰焚天：回合结束爆发火浪！`);
            for (let i = 0; i < this.enemies.length; i++) {
                const e = this.enemies[i];
                if (e.currentHp > 0) {
                    this.dealDamageToEnemy(e, flameLaw.passive.aoeDamage, 'fire');
                    // 视觉效果
                    const el = document.querySelector(`.enemy[data-index="${i}"]`);
                    if (el) Utils.showFloatingNumber(el, flameLaw.passive.aoeDamage, 'damage');
                }
            }
        }

        // 处理手牌中的状态牌效果 (End of Turn)
        // e.g. Heart Demon
        const statusCards = this.player.hand.filter(c => c.type === 'status');
        for (const card of statusCards) {
            if (card.effects) {
                for (const effect of card.effects) {
                    if (effect.trigger === 'endTurn') {
                        if (effect.type === 'selfDamage') {
                            let damage = effect.value;
                            if (effect.isPercent) {
                                damage = Math.ceil(this.player.currentHp * effect.value);
                                // Support minValue (e.g. for Heart Demon: max(10% HP, 10))
                                if (effect.minValue) {
                                    damage = Math.max(damage, effect.minValue);
                                } else {
                                    damage = Math.max(1, damage); // Default at least 1
                                }
                            }

                            this.player.takeDamage(damage);
                            Utils.showBattleLog(`${card.name} 发作！受到 ${damage} 点伤害`);
                            const playerAvatar = document.querySelector('.player-avatar');
                            if (playerAvatar) Utils.addShakeEffect(playerAvatar);
                            await Utils.sleep(300);
                        } else if (effect.type === 'discardRandom') {
                            const count = effect.value || 1;
                            // 排除自身，只弃掉其他手牌（以此惩罚玩家保留好牌）
                            const otherCards = this.player.hand.filter(c => c !== card);

                            if (otherCards.length > 0) {
                                let discarded = 0;
                                for (let i = 0; i < count; i++) {
                                    if (otherCards.length === 0) break;
                                    const randIdx = Math.floor(Math.random() * otherCards.length);
                                    const targetCard = otherCards[randIdx];

                                    // Remove from 'otherCards' to avoid double pick
                                    otherCards.splice(randIdx, 1);

                                    // Remove from actual hand
                                    const handIdx = this.player.hand.indexOf(targetCard);
                                    if (handIdx > -1) {
                                        this.player.hand.splice(handIdx, 1);
                                        this.player.discardPile.push(targetCard);
                                        discarded++;
                                    }
                                }
                                if (discarded > 0) {
                                    Utils.showBattleLog(`${card.name} 发作！随机弃掉了 ${discarded} 张手牌`);
                                    await Utils.sleep(300);
                                    this.updateHandUI();
                                }
                            }
                        } else if (effect.type === 'energyLoss') {
                            const loss = effect.value || 1;
                            if (this.player.currentEnergy > 0) {
                                this.player.currentEnergy = Math.max(0, this.player.currentEnergy - loss);
                                Utils.showBattleLog(`${card.name} 发作！流失 ${loss} 点灵力`);
                                this.updateEnergyUI();
                                await Utils.sleep(300);
                            }
                        }
                    }
                }
            }
        }

        // 检查额外回合 (Extra Turn) - Debug
        // Utils.showBattleLog(`DEBUG: Extra Turn Buff: ${this.player.buffs ? this.player.buffs.extraTurn : 'undefined'}`);

        if (this.player.buffs && this.player.buffs.extraTurn > 0) {
            this.player.buffs.extraTurn--;
            Utils.showBattleLog('【时间凝滞】额外回合！');

            // 视觉特效
            const flash = document.createElement('div');
            flash.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,255,255,0.2);pointer-events:none;z-index:9999;transition:opacity 0.5s;';
            document.body.appendChild(flash);
            setTimeout(() => {
                flash.style.opacity = '0';
                setTimeout(() => flash.remove(), 500);
            }, 100);

            // 重置回合状态，开始新回合
            this.isProcessingCard = false;
            this.cardsPlayedThisTurn = 0;
            this.playerAttackedThisTurn = false;
            this.player.startTurn();

            // 启用结束回合按钮
            const endTurnBtn = document.getElementById('end-turn-btn');
            if (endTurnBtn) endTurnBtn.disabled = false;

            this.updateBattleUI();
            return; // 直接返回，不进入敌人回合
        }

        // 切换到敌人回合
        this.currentTurn = 'enemy';

        Utils.showBattleLog('敌人回合...');

        try {
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
        } catch (error) {
            console.error('Enemy Turn Error:', error);
            Utils.showBattleLog('敌人行动异常，跳过...');
        } finally {
            // 无论如何都要恢复玩家回合

            // 新回合
            this.turnNumber++;
            this.currentTurn = 'player';
            // 新回合
            this.turnNumber++;
            this.currentTurn = 'player';
            this.isProcessingCard = false; // 关键：重置卡牌处理状态
            this.cardsPlayedThisTurn = 0;
            this.playerAttackedThisTurn = false;
            this.tacticalAdvantageTriggerCount = 0; // 重置战术优势计数

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
    }

    // 敌人回合行动
    async enemyTurn() {
        // 关键修复：护盾应在敌人回合开始时重置（上一回合保留的护盾失效），
        // 而不是在敌人回合结束时（否则本回合获得的护盾无法抵挡玩家攻击）
        for (const enemy of this.enemies) {
            enemy.block = 0;
        }

        for (let i = 0; i < this.enemies.length; i++) {
            const enemy = this.enemies[i];
            const enemyEl = document.querySelector(`.enemy[data-index="${i}"]`);
            if (enemy.currentHp <= 0) continue;

            try {
                // (Chaos Logic Removed - Replaced by new Chaos Law)

                // === Boss机制处理 (回合开始) ===
                if (enemy.isBoss && typeof BossMechanicsHandler !== 'undefined') {
                    BossMechanicsHandler.processTurnStart(this, enemy);
                }

                // === Boss 压迫感增强 (Boss Mechanics 2.0) ===
                if (enemy.isBoss) {
                    // 每3回合获得1点力量
                    if (this.turnNumber > 0 && this.turnNumber % 3 === 0) {
                        if (!enemy.buffs.strength) enemy.buffs.strength = 0;
                        enemy.buffs.strength += 1;
                        Utils.showBattleLog(`${enemy.name} 怒意增长！(力量+1)`);
                        Utils.createFloatingText(i, '力量+1', '#ffaa00');
                    }

                    // 30% 几率净化一个负面效果
                    if (Math.random() < 0.3) {
                        const debuffs = Object.keys(enemy.buffs).filter(k =>
                            ['poison', 'burn', 'weak', 'vulnerable', 'stun', 'freeze'].includes(k) && enemy.buffs[k] > 0
                        );
                        if (debuffs.length > 0) {
                            const remove = debuffs[Math.floor(Math.random() * debuffs.length)];
                            enemy.buffs[remove] = 0;
                            Utils.showBattleLog(`${enemy.name} 净化了自身的 ${remove}！`);
                            Utils.createFloatingText(i, '净化', '#ffffff');
                        }
                    }
                }

                // === 精英怪效果: 再生 ===
                if (enemy.isElite && enemy.eliteType === 'regen') {
                    const heal = Math.floor(enemy.maxHp * 0.05);
                    if (heal > 0 && enemy.currentHp < enemy.maxHp) {
                        enemy.currentHp = Math.min(enemy.maxHp, enemy.currentHp + heal);
                        Utils.showBattleLog(`${enemy.name} 再生恢复了 ${heal} 生命`);
                        if (enemyEl) Utils.showFloatingNumber(enemyEl, heal, 'heal');
                    }
                }

                // 处理敌人debuff (提前处理，防止晕眩导致不受DOT伤害)
                await this.processEnemyDebuffs(enemy, i);

                // 检查晕眩
                if (enemy.stunned) {
                    enemy.stunned = false;
                    Utils.showBattleLog(`${enemy.name} 被眩晕，跳过回合`);

                    // === Boss 霸体机制 ===
                    if (enemy.isBoss) {
                        enemy.buffs.unstoppable = 1; // 获得1回合霸体
                        Utils.showBattleLog(`${enemy.name} 获得了霸体，免疫下回合控制！`);
                        // Floating text for visual
                        Utils.createFloatingText(i, '霸体', '#ffff00');
                        if (this.updateEnemiesUI) this.updateEnemiesUI();
                    }

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
            } catch (err) {
                console.error(`Enemy ${i} action failed:`, err);
                Utils.showBattleLog(`${enemy.name} 行动异常，跳过`);
            }
        }


        // 清除敌人护盾 (moved to start of enemy turn)
        for (const enemy of this.enemies) {
            if (enemy.buffs.retainBlock && enemy.buffs.retainBlock > 0) {
                enemy.buffs.retainBlock--;
            } else {
                enemy.block = 0;
            }

            // 16. 太乙神雷 (realm 16) - 敌人每回合获得攻击力+1
            if (this.player.realm === 16) {
                if (!enemy.buffs.strength) enemy.buffs.strength = 0;
                enemy.buffs.strength += 1;
                Utils.showBattleLog(`${enemy.name} 吸收灵气，攻击力+1`);
            }

            // 17. 大罗法身 (realm 17) - 敌人每回合回复 20% 最大生命
            if (this.player.realm === 17 && enemy.currentHp > 0) {
                const regen = Math.floor(enemy.maxHp * 0.20);
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

            if (this.checkBattleEnd()) return;

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

            if (this.checkBattleEnd()) return;

            await Utils.sleep(300);
        }

        // 减少易伤
        if (enemy.buffs.vulnerable && enemy.buffs.vulnerable > 0) {
            enemy.buffs.vulnerable--;
        }

        // 减少虚弱
        if (enemy.buffs.weak && enemy.buffs.weak > 0) {
            enemy.buffs.weak--;
        }

        // 减少霸体 (新增)
        if (enemy.buffs.unstoppable && enemy.buffs.unstoppable > 0) {
            enemy.buffs.unstoppable--;
            if (enemy.buffs.unstoppable <= 0) {
                Utils.showBattleLog(`${enemy.name} 的霸体状态已消失`);
            }
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

        // === Boss Mechanic: Aggression (Realm 15+) ===
        // If Boss uses a non-attack move (buff/debuff/heal/defend), follow up with a quick attack
        if (enemy.isBoss && this.player.realm >= 15) {
            const nonAttackTypes = ['buff', 'debuff', 'defend', 'heal', 'summon'];
            if (nonAttackTypes.includes(pattern.type)) {
                await Utils.sleep(400);
                Utils.showBattleLog(`${enemy.name} 趁势发动追击！`);

                // Damage scales with realm: 10 + (realm-15)*5
                const pursuitDamage = 10 + (this.player.realm - 15) * 5;
                const pursuitAction = { type: 'attack', value: pursuitDamage, intent: '⚔️' };

                await this.processEnemyPattern(enemy, pursuitAction, index);
            }
        }

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
                        await Utils.sleep(200);
                    }
                }
                break;

            case 'addStatus': {
                const cardId = pattern.cardId || 'heartDemon';
                const count = pattern.count || 1;
                for (let k = 0; k < count; k++) {
                    if (this.player.addCardToDiscard) {
                        this.player.addCardToDiscard(cardId);
                    }
                }
                Utils.showBattleLog(`${enemy.name} 施加了 ${count} 张诅咒卡！`);
                break;
            }

            case 'summon': {
                const summonCount = pattern.count || 1;
                for (let k = 0; k < summonCount; k++) {
                    this.summonEnemy(pattern.value);
                }
                Utils.showBattleLog(`${enemy.name} 召唤了随从！`);
                break;
            }

            case 'attack':
                let damage = pattern.value;
                if (typeof damage !== 'number' || isNaN(damage)) {
                    console.error('Enemy attack damage is NaN', pattern);
                    damage = 0;
                }

                // === Boss Mechanic: True Damage (Realm 10+) ===
                let isTrueDamage = false;
                if (enemy.isBoss && this.player.realm >= 10) {
                    // 30% chance to deal True Damage (ignore block)
                    if (Math.random() < 0.3) {
                        isTrueDamage = true;
                        Utils.showBattleLog(`${enemy.name} 的攻击附带【真实伤害】效果！`);
                    }
                }

                // 10-18 heavy bosses always have some piercing? No, random is better.
                // Realm 18 Chaos Boss always true damage? Maybe too hard. Stick to 30%.

                // 检查吞噬效果 (Realm 15)
                if (pattern.effect === 'devour') {
                    if (this.player.drawPile.length > 0) {
                        const devoured = this.player.drawPile.pop();
                        Utils.showBattleLog(`虚空吞噬：${devoured.name} 被吞噬了！`);
                        this.updatePilesUI();
                    } else if (this.player.discardPile.length > 0) {
                        // 如果抽牌堆为空，吞噬弃牌堆？
                        // 简单起见，仅吞噬抽牌堆，或者洗牌后吞噬
                        this.player.drawPile = Utils.shuffle([...this.player.discardPile]);
                        this.player.discardPile = [];
                        const devoured = this.player.drawPile.pop();
                        Utils.showBattleLog(`虚空吞噬：${devoured.name} 被吞噬了！`);
                        this.updatePilesUI();
                    } else {
                        Utils.showBattleLog('虚空吞噬：无牌可吞！');
                    }
                }

                // 应用力量加成
                if (enemy.buffs.strength) {
                    damage += enemy.buffs.strength;
                }

                // 检查玩家虚弱 - FIX: Player Weakness should NOT reduce enemy damage
                // if (this.player.buffs.weak && this.player.buffs.weak > 0) {
                //     damage = Math.floor(damage * 0.75);
                // }

                // 检查敌人被弱化 (Weak)
                if (enemy.buffs.weak && enemy.buffs.weak > 0) {
                    damage = Math.floor(damage * 0.75); // 减少25%伤害
                    enemy.buffs.weak--;
                }

                // 检查火焰真意 (Flame Truth) - Burn on Hit
                const flameLaw = this.player.collectedLaws.find(l => l.id === 'flameTruth');
                if (flameLaw && Math.random() < flameLaw.passive.chance) {
                    enemy.takeDamage(0); // Trigger visual flash if needed? Or just add buff
                    enemy.buffs.burn = (enemy.buffs.burn || 0) + flameLaw.passive.value;
                    Utils.showBattleLog('火焰真意：给予敌人灼烧！');
                }

                // 检查冰封真意 (Ice Freeze) - Slow on Hit
                const iceLaw = this.player.collectedLaws.find(l => l.id === 'iceFreeze');
                if (iceLaw && Math.random() < iceLaw.passive.chance) {
                    enemy.buffs.weak = (enemy.buffs.weak || 0) + iceLaw.passive.value; // Using Weak as proxy for Slow/Freeze debuff
                    Utils.showBattleLog('冰封真意：敌人动作迟缓！(虚弱)');
                }

                // 应用心魔滋生
                damage = this.dealEnemyDamage(enemy, damage);

                // 检查敌人减伤Buff (如: Time Stasis)
                if (enemy.buffs.damageReduction && enemy.buffs.damageReduction > 0) {
                    const reduction = Math.min(90, enemy.buffs.damageReduction);
                    damage = Math.floor(damage * (100 - reduction) / 100);
                    Utils.showBattleLog(`时间凝滞生效！敌人伤害降低 ${reduction}%`);
                    // Consume it (Next Attack)
                    delete enemy.buffs.damageReduction;
                }

                // Handle True Damage
                let result;
                if (isTrueDamage) {
                    // Bypass block logic by temporarily setting block to 0? 
                    // Or use a modified takeDamage?
                    // player.takeDamage handles block. We can modify player.takeDamage to accept 'ignoreBlock' flag
                    // or just subtract HP directly here if dodged is false.

                    // Let's modify logic slightly:
                    // Call takeDamage but if it hits block, we want to bypass it.
                    // The cleanest way is to pass a flag to takeDamage, but takeDamage signature is fixed in many places.
                    // Alternative: Subtract HP directly for damage amount, but handle dodge.

                    // Workaround: Temporarily remove block, take damage, restore block.
                    const savedBlock = this.player.block;
                    this.player.block = 0;
                    result = this.player.takeDamage(damage);
                    this.player.block = savedBlock; // Restore block

                    if (!result.dodged) {
                        Utils.showBattleLog(`(护盾被无视)`);
                    }
                } else {
                    result = this.player.takeDamage(damage);
                }

                if (result.dodged) {
                    Utils.showBattleLog('闪避了攻击！');
                } else {
                    if (playerEl) {
                        Utils.addShakeEffect(playerEl);
                        if (result.damage > 0) {
                            Utils.showFloatingNumber(playerEl, result.damage, 'damage');
                            this.playerTookDamage = true;
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

                    // Check True Damage for MultiAttack as well? 
                    // Let's say MultiAttack is standard. Except if we want to be mean.
                    // Let's keep MultiAttack standard for now, as it's already strong.

                    // 检查战斗胜利

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
                let buffType = pattern.buffType;
                let buffValue = pattern.value;

                // 随机减益 (Realm 14)
                if (buffType === 'random') {
                    const debuffs = ['vulnerable', 'weak', 'burn', 'stun'];
                    buffType = debuffs[Math.floor(Math.random() * debuffs.length)];
                    // Stun usually has value 1
                    if (buffType === 'stun') buffValue = 1;
                }

                this.player.buffs[buffType] = (this.player.buffs[buffType] || 0) + buffValue;
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

            case 'innerDemon': {
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
                    Utils.showBattleLog(`心魔滋生！牌组中加入了 ${count} 张 ${demonCardDef.name} `);
                }
                break;
            }
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
                const newEnemyEl = document.querySelector(`.enemy[data - index= "${this.enemies.length - 1}"]`);
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
            Utils.showBattleLog(`${enemy.name} 进入${nextPhase.name} 形态！`);

            // 更新行动模式
            if (nextPhase.patterns) {
                enemy.patterns = nextPhase.patterns;
                enemy.currentPatternIndex = 0; // 重置循环
            }

            // 播放特效
            const enemyEl = document.querySelector(`.enemy[data - index= "${this.enemies.indexOf(enemy)}"]`);
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
    // Start Targeting Mode
    startTargetingMode(cardIndex) {
        this.targetingMode = true;
        this.selectedCardIndex = cardIndex;

        // Highlight Enemies
        const enemyEls = document.querySelectorAll('.enemy');
        enemyEls.forEach(el => {
            el.classList.add('targeting-valid');
            el.style.cursor = 'crosshair';
            el.style.borderColor = 'var(--accent-gold)';
            el.style.boxShadow = '0 0 15px var(--accent-gold)';
            // Add click listener if not handled by global delegation
            // But usually we rely on existing click handlers checking targetingMode
        });

        Utils.showBattleLog('请选择目标...');
        const handEl = document.getElementById('hand-cards');
        if (handEl) handEl.classList.add('targeting-active');
    }

    // End Targeting Mode
    endTargetingMode() {
        this.targetingMode = false;
        this.selectedCardIndex = -1;

        const enemyEls = document.querySelectorAll('.enemy');
        enemyEls.forEach(el => {
            el.classList.remove('targeting-valid');
            el.style.cursor = '';
            el.style.borderColor = '';
            el.style.boxShadow = '';
        });

        const handEl = document.getElementById('hand-cards');
        if (handEl) handEl.classList.remove('targeting-active');
    }

    // Enemy Click Handler
    onEnemyClick(enemyIndex) {
        if (this.targetingMode && this.selectedCardIndex !== -1) {
            this.playCardOnTarget(this.selectedCardIndex, enemyIndex);
        } else {
            // Normal click
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
