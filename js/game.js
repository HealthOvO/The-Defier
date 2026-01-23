/**
 * The Defier 2.1 - 逆命者
 * 主游戏控制器（修复版）
 */

class Game {
    constructor() {
        this.player = new Player();
        this.battle = new Battle(this);
        this.map = new GameMap(this);
        this.eventSystem = new EventSystem(this);
        this.achievementSystem = new AchievementSystem(this);
        this.currentScreen = 'main-menu';
        this.currentEnemies = [];
        this.currentBattleNode = null; // 记录当前战斗节点
        this.stealAttempted = false;
        this.rewardCardSelected = false; // 防止重复选牌
        this.comboCount = 0;
        this.lastCardType = null;
        this.runStartTime = null;

        this.init();
    }

    // 初始化
    init() {
        this.bindGlobalEvents();
        this.initCollection();
        this.initDynamicBackground();

        // 尝试加载存档
        if (this.loadGame()) {
            // 如果加载成功且在地图界面，则显示地图
            if (this.player.currentHp > 0) {
                this.showScreen('map-screen');
            } else {
                // 如果死亡，则重置并回主菜单
                this.clearSave();
                this.showScreen('main-menu');
            }
        }

        console.log('The Defier 2.1 初始化完成！');
    }

    // 绑定全局事件
    bindGlobalEvents() {
        // ESC关闭模态框
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });

        // 点击模态框背景关闭
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal();
                }
            });
        });

        // 牌堆点击
        document.getElementById('deck-pile')?.addEventListener('click', () => {
            this.showDeckModal('draw');
        });

        document.getElementById('discard-pile')?.addEventListener('click', () => {
            this.showDeckModal('discard');
        });
    }

    // 初始化动态背景
    initDynamicBackground() {
        // 删除已存在的
        const existing = document.getElementById('dynamic-bg');
        if (existing) existing.remove();

        const bg = document.createElement('div');
        bg.className = 'dynamic-bg';
        bg.id = 'dynamic-bg';

        // 添加星星
        for (let i = 0; i < 50; i++) {
            const star = document.createElement('div');
            star.className = 'bg-star';
            star.style.left = `${Math.random() * 100}%`;
            star.style.top = `${Math.random() * 100}%`;
            star.style.animationDelay = `${Math.random() * 3}s`;
            bg.appendChild(star);
        }

        // 添加云雾
        for (let i = 0; i < 3; i++) {
            const cloud = document.createElement('div');
            cloud.className = 'bg-cloud';
            cloud.style.top = `${20 + i * 25}%`;
            cloud.style.animationDelay = `${i * 20}s`;
            bg.appendChild(cloud);
        }

        document.body.prepend(bg);
    }

    // 保存游戏
    saveGame() {
        const gameState = {
            version: '2.2.0', // 添加版本号
            player: this.player.getState(),
            map: {
                nodes: this.map.nodes,
                currentNodeIndex: this.map.currentNodeIndex,
                completedNodes: this.map.completedNodes
            },
            unlockedRealms: this.unlockedRealms || [1],
            timestamp: Date.now()
        };
        localStorage.setItem('theDefierSave', JSON.stringify(gameState));
        console.log('游戏已保存');
    }

    // 加载游戏
    loadGame() {
        const savedData = localStorage.getItem('theDefierSave');
        if (!savedData) return false;

        try {
            const gameState = JSON.parse(savedData);

            // 版本检查 - 如果是旧版本存档，清除并重新开始
            const currentVersion = '2.2.0';
            if (!gameState.version || gameState.version < '2.2.0') {
                console.log('检测到旧版本存档，已清除');
                this.clearSave();
                return false;
            }

            // 验证牌组数据有效性
            if (!gameState.player.deck || !Array.isArray(gameState.player.deck) || gameState.player.deck.length < 5) {
                console.log('存档牌组数据无效，已清除存档');
                this.clearSave();
                return false;
            }

            // 恢复玩家状态
            Object.assign(this.player, gameState.player);
            // 恢复命环对象引用
            if (gameState.player.fateRing) {
                this.player.fateRing = gameState.player.fateRing;
            }

            // 恢复地图状态
            this.map.nodes = gameState.map.nodes;
            this.map.currentNodeIndex = gameState.map.currentNodeIndex;
            this.map.completedNodes = gameState.map.completedNodes;

            this.unlockedRealms = gameState.unlockedRealms || [1];

            console.log('游戏已加载');
            return true;
        } catch (e) {
            console.error('加载存档失败:', e);
            this.clearSave();
            return false;
        }
    }

    // 清除存档
    clearSave() {
        localStorage.removeItem('theDefierSave');
    }

    // 自动保存
    autoSave() {
        this.saveGame();
    }

    // 初始化图鉴
    initCollection() {
        const grid = document.getElementById('collection-grid');
        if (!grid) return;

        grid.innerHTML = '';

        for (const lawId in LAWS) {
            const law = LAWS[lawId];
            const collected = this.player.collectedLaws.some(l => l.id === lawId);

            const item = document.createElement('div');
            item.className = `collection-item ${collected ? '' : 'locked'}`;
            item.innerHTML = `
                <div class="collection-icon">${law.icon}</div>
                <div class="collection-name">${collected ? law.name : '???'}</div>
            `;

            if (collected) {
                item.addEventListener('click', () => {
                    alert(`${law.name}\n\n${law.description}\n\n被动效果: ${getLawPassiveDescription(law)}`);
                });
            }

            grid.appendChild(item);
        }
    }

    // 初始化成就界面
    initAchievements() {
        const container = document.getElementById('achievements-container');
        if (!container) return;

        container.innerHTML = '';

        const achievements = this.achievementSystem.getAchievementsList();
        const categories = {};

        // 按分类分组
        for (const achievement of achievements) {
            const cat = achievement.category;
            if (!categories[cat]) {
                categories[cat] = [];
            }
            categories[cat].push(achievement);
        }

        // 添加进度显示
        const progress = this.achievementSystem.getProgress();
        const progressEl = document.createElement('div');
        progressEl.className = 'achievements-progress';
        progressEl.innerHTML = `
            <p>🏆 成就进度: ${progress.completed} / ${progress.total}</p>
        `;
        container.appendChild(progressEl);

        // 渲染每个分类
        for (const catId in categories) {
            const catInfo = ACHIEVEMENT_CATEGORIES[catId];
            const catAchievements = categories[catId];

            const catEl = document.createElement('div');
            catEl.className = 'achievement-category';
            catEl.innerHTML = `
                <h3 class="category-title">${catInfo.icon} ${catInfo.name}</h3>
                <div class="achievement-list">
                    ${catAchievements.map(a => `
                        <div class="achievement-item ${a.unlocked ? 'unlocked' : 'locked'}">
                            <div class="achievement-icon">${a.icon}</div>
                            <div class="achievement-details">
                                <div class="achievement-name">${a.name}</div>
                                <div class="achievement-desc">${a.description}</div>
                            </div>
                            ${a.unlocked ? '<div class="achievement-check">✓</div>' : ''}
                        </div>
                    `).join('')}
                </div>
            `;

            container.appendChild(catEl);
        }
    }

    // 显示成就界面
    showAchievements() {
        this.initAchievements();
        this.showScreen('achievements-screen');
    }

    // 初始化关卡选择界面
    initRealmSelect() {
        const container = document.getElementById('realm-select-container');
        if (!container) return;

        container.innerHTML = '';

        // 假设最高9重天
        for (let i = 1; i <= 9; i++) {
            const isUnlocked = this.unlockedRealms && this.unlockedRealms.includes(i);
            const isCompleted = isUnlocked && this.unlockedRealms.includes(i + 1); // 简单判断：解锁了下一关说明这关过了

            const realmCard = document.createElement('div');
            realmCard.className = `realm-card ${isUnlocked ? '' : 'locked'}`;

            const realmName = this.map.getRealmName(i);
            const env = this.map.getRealmEnvironment(i);

            realmCard.innerHTML = `
                <div class="realm-icon">${isUnlocked ? (isCompleted ? '🏆' : '⚔️') : '🔒'}</div>
                <div class="realm-info">
                    <h3>${realmName}</h3>
                    <p class="realm-env">${env.name}: ${env.desc}</p>
                    ${isCompleted ? '<span class="replay-tag">重复挑战 (收益减半)</span>' : ''}
                </div>
            `;

            if (isUnlocked) {
                realmCard.addEventListener('click', () => {
                    this.startRealm(i, isCompleted);
                });
            }

            container.appendChild(realmCard);
        }
    }

    // 开始指定关卡
    startRealm(realmLevel, isReplay = false) {
        // 如果点击的是当前正在进行的关卡，且并未死亡，则直接返回地图
        if (this.player.realm === realmLevel && this.map.nodes.length > 0 && this.player.currentHp > 0) {
            this.showScreen('map-screen');
            return;
        }

        this.player.realm = realmLevel;
        this.player.floor = 0;
        this.player.isReplay = isReplay; // 标记是否为重玩

        this.map.generate(this.player.realm);
        this.showScreen('map-screen');
        this.autoSave();
    }

    // 显示界面
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('active');
            this.currentScreen = screenId;

            // 特殊处理
            if (screenId === 'map-screen') {
                this.map.render();
            } else if (screenId === 'collection') {
                this.initCollection();
            } else if (screenId === 'achievements-screen') {
                this.initAchievements();
            } else if (screenId === 'character-select') {
                this.updateCharacterInfo();
            } else if (screenId === 'realm-select-screen') {
                this.initRealmSelect();
            }
        }
    }

    // 更新角色信息界面
    updateCharacterInfo() {
        document.getElementById('char-hp').textContent = this.player.maxHp;
        document.getElementById('char-energy').textContent = this.player.baseEnergy;
        document.getElementById('char-draw').textContent = this.player.drawCount;

        // 命环等级
        const ringName = this.player.fateRing.name;
        // Fix: ID mismatch, HTML uses 'ring-level'
        const ringLevelEl = document.getElementById('ring-level');
        if (ringLevelEl) ringLevelEl.textContent = ringName;

        // Update badge text if it exists
        const badgeEl = document.querySelector('.imprint-badge') || document.querySelector('.imprint-badge残次');
        if (badgeEl) badgeEl.textContent = ringName;

        const loadedCount = this.player.fateRing.loadedLaws.length;
        const totalSlots = this.player.fateRing.slots;
        document.getElementById('loaded-laws').textContent = `${loadedCount}/${totalSlots}`;
    }

    // 开始新游戏
    startNewGame() {
        this.player.reset();
        this.player.realm = 1;
        this.player.floor = 0;
        this.comboCount = 0;
        this.lastCardType = null;
        this.runStartTime = Date.now();
        this.currentBattleNode = null;
        this.rewardCardSelected = false;

        // 确保有解锁记录
        if (!this.unlockedRealms) this.unlockedRealms = [1];

        // 应用永久起始加成
        const bonuses = this.achievementSystem.loadStartBonuses();
        if (bonuses.maxHp) {
            this.player.maxHp += bonuses.maxHp;
            this.player.currentHp = this.player.maxHp;
        }
        if (bonuses.strength) this.player.buffs.strength = bonuses.strength;
        if (bonuses.gold) this.player.gold += bonuses.gold;
        if (bonuses.draw) this.player.drawCount += bonuses.draw;

        // 不直接生成地图，而是去选关界面
        this.showScreen('realm-select-screen');
    }

    // 开始战斗 - 保存当前节点
    startBattle(enemies, node = null) {
        this.currentEnemies = enemies;
        this.currentBattleNode = node;
        this.stealAttempted = false;
        this.rewardCardSelected = false;
        this.comboCount = 0;
        this.lastCardType = null;

        this.showScreen('battle-screen');
        this.battle.init(enemies);

        // 隐藏连击显示
        this.hideCombo();
    }

    // 处理连击
    handleCombo(cardType) {
        if (cardType === 'attack') {
            if (this.lastCardType === 'attack') {
                this.comboCount++;
                this.showCombo();
            } else {
                this.comboCount = 1;
                this.hideCombo();
            }
        } else {
            this.comboCount = 0;
            this.hideCombo();
        }
        this.lastCardType = cardType;

        // 更新成就统计
        this.achievementSystem.updateStat('maxCombo', this.comboCount, 'max');
    }

    // 获取连击加成
    getComboBonus() {
        if (this.comboCount < 2) return 0;
        if (this.comboCount === 2) return 0.1;
        if (this.comboCount === 3) return 0.25;
        return 0.5;
    }

    // 显示连击
    showCombo() {
        if (this.comboCount < 2) return;

        const display = document.getElementById('combo-display');
        const countEl = document.getElementById('combo-count');
        const bonusEl = document.getElementById('combo-bonus');

        if (display && countEl && bonusEl) {
            countEl.textContent = this.comboCount;
            const bonus = Math.floor(this.getComboBonus() * 100);
            bonusEl.textContent = `伤害+${bonus}%`;

            // 设置等级
            display.className = 'combo-display show';
            if (this.comboCount >= 4) display.classList.add('level-4');
            else if (this.comboCount >= 3) display.classList.add('level-3');
            else display.classList.add('level-2');
        }
    }

    // 隐藏连击
    hideCombo() {
        const display = document.getElementById('combo-display');
        if (display) {
            display.classList.remove('show');
        }
    }

    // 战斗胜利
    onBattleWon(enemies) {
        this.player.enemiesDefeated += enemies.length;

        // 命环获得经验
        let ringExp = enemies.reduce((sum, e) => sum + (e.ringExp || 10), 0);

        // 重玩收益减半
        if (this.player.isReplay) {
            ringExp = Math.floor(ringExp * 0.5);
        }

        this.player.fateRing.exp += ringExp;
        this.player.checkFateRingLevelUp();

        // 自动保存
        this.autoSave();

        // 更新成就统计
        this.achievementSystem.updateStat('enemiesDefeated', enemies.length);

        // 检查BOSS
        for (const enemy of enemies) {
            if (enemy.isBoss) {
                this.achievementSystem.updateStat('bossesDefeated', 1);

                // 检查低血量击杀BOSS
                if (this.player.currentHp <= 1) {
                    this.achievementSystem.updateStat('lowHpBossKill', 1);
                }
            }
        }

        // 计算奖励
        let totalGold = 0;
        let canSteal = false;
        let stealEnemy = null;

        for (const enemy of enemies) {
            totalGold += Utils.random(enemy.gold.min, enemy.gold.max);
            if (enemy.stealLaw && enemy.stealChance > 0) {
                canSteal = true;
                stealEnemy = enemy;
            }
        }

        // 重玩收益减半
        if (this.player.isReplay) {
            totalGold = Math.floor(totalGold * 0.5);
            // 重玩可以盗取，但不给额外经验奖励了
        }

        this.player.gold += totalGold;
        this.achievementSystem.updateStat('totalGold', totalGold);

        // 显示奖励界面
        this.showRewardScreen(totalGold, canSteal, stealEnemy, ringExp);
    }

    // 显示奖励界面
    showRewardScreen(gold, canSteal, stealEnemy, ringExp = 0) {
        this.rewardCardSelected = false; // 重置选牌状态

        const stealSection = document.getElementById('steal-section');
        const stealBtn = document.getElementById('steal-btn');
        const stealText = document.getElementById('steal-text');
        const rewardGold = document.getElementById('reward-gold');
        const rewardCards = document.getElementById('reward-cards');

        rewardGold.textContent = `+${gold} 灵石 | 命环经验 +${ringExp}`;

        // 法则盗取部分
        if (canSteal && stealEnemy && !this.stealAttempted) {
            stealSection.style.display = 'flex';
            const lawName = LAWS[stealEnemy.stealLaw]?.name || '神秘法则';
            stealText.textContent = `你感受到敌人体内残留的${lawName}力量...`;
            stealBtn.disabled = false;
            stealBtn.dataset.lawId = stealEnemy.stealLaw;
            stealBtn.dataset.chance = stealEnemy.stealChance;
        } else {
            stealSection.style.display = 'none';
        }

        // 卡牌奖励
        rewardCards.innerHTML = '';
        const rewardCardList = getRewardCards(3);

        rewardCardList.forEach((card, index) => {
            const cardEl = Utils.createCardElement(card, index);
            cardEl.classList.add('reward-card');
            cardEl.classList.add(`rarity-${card.rarity || 'common'}`);

            cardEl.addEventListener('click', () => {
                // 防止重复选择
                if (this.rewardCardSelected) return;
                this.rewardCardSelected = true;

                this.selectRewardCard(card);

                // 禁用其他卡牌
                rewardCards.querySelectorAll('.card').forEach(c => {
                    if (c !== cardEl) {
                        c.style.opacity = '0.3';
                        c.style.pointerEvents = 'none';
                    }
                });
                cardEl.style.border = '3px solid var(--accent-gold)';
                cardEl.style.transform = 'scale(1.1)';
            });
            rewardCards.appendChild(cardEl);
        });

        this.showScreen('reward-screen');
    }

    // 选择奖励卡牌
    selectRewardCard(card) {
        this.player.addCardToDeck(card);
        Utils.showBattleLog(`获得卡牌: ${card.name}`);

        // 更新成就 - 收集新卡牌
        this.achievementSystem.updateStat('uniqueCards', card.id);

        // 启用继续按钮
        const continueBtn = document.getElementById('continue-reward-btn');
        if (continueBtn) {
            continueBtn.disabled = false;
            continueBtn.textContent = '继续前进';
        }
    }

    // 跳过奖励卡牌（扣除灵石）
    skipRewardCard() {
        const cost = 20;
        if (this.player.gold >= cost) {
            this.player.gold -= cost;
            Utils.showBattleLog(`跳过卡牌奖励，扣除 ${cost} 灵石`);

            // 跳过视为已选择，且直接继续
            this.rewardCardSelected = true;
            this.continueAfterReward();
        } else {
            Utils.showBattleLog(`灵石不足！需要 ${cost} 灵石才能跳过`);
            // 不启用继续按钮
        }
    }

    // 尝试盗取法则
    attemptSteal() {
        const stealBtn = document.getElementById('steal-btn');
        const stealText = document.getElementById('steal-text');
        const lawId = stealBtn.dataset.lawId;
        const baseChance = parseFloat(stealBtn.dataset.chance);

        this.stealAttempted = true;
        stealBtn.disabled = true;

        const totalChance = baseChance + this.player.getStealBonus();
        const success = Math.random() < totalChance;

        if (success && LAWS[lawId]) {
            const law = { ...LAWS[lawId] };
            const added = this.player.collectLaw(law);

            if (added) {
                stealText.innerHTML = `<span style="color: var(--accent-gold)">✨ 盗取成功！获得【${law.name}】！</span>`;

                // 粒子特效
                if (typeof particles !== 'undefined') {
                    particles.stealSuccessEffect(stealBtn);
                }

                // 更新成就
                this.achievementSystem.updateStat('lawsCollected', 1);

                // 命环经验额外奖励
                this.player.fateRing.exp += 50;
                this.player.checkFateRingLevelUp();

                if (law.unlockCards && law.unlockCards.length > 0) {
                    const cardName = CARDS[law.unlockCards[0]]?.name || '神秘卡牌';
                    stealText.innerHTML += `<br><span style="color: var(--accent-purple)">解锁法则牌: ${cardName}</span>`;
                }
            } else {
                stealText.innerHTML = `<span style="color: var(--text-secondary)">你已经掌握了这个法则</span>`;
            }
        } else {
            stealText.innerHTML = `<span style="color: var(--text-muted)">盗取失败...法则残留消散了</span>`;
        }
    }

    // 奖励后继续 - 修复关卡推进bug
    continueAfterReward() {
        // 使用保存的当前战斗节点
        if (this.currentBattleNode) {
            this.map.completeNode(this.currentBattleNode);
            this.currentBattleNode = null;
        }

        this.autoSave();
        this.showScreen('map-screen');
    }

    // 显示事件弹窗
    showEventModal(event, node) {
        this.currentBattleNode = node;
        this.currentEvent = event;

        const modal = document.getElementById('event-modal');
        document.getElementById('event-icon').textContent = event.icon || '❓';
        document.getElementById('event-title').textContent = event.name || '神秘事件';

        // 显示描述或对话
        const descEl = document.getElementById('event-desc');
        if (event.speaker) {
            descEl.innerHTML = `<span style="color: var(--accent-gold)">${event.speaker.icon}</span> ${event.speaker.dialogue}`;
        } else {
            descEl.textContent = event.description || '发生了一些事情...';
        }

        // 生成选项
        const choicesEl = document.getElementById('event-choices');
        choicesEl.innerHTML = '';

        event.choices.forEach((choice, index) => {
            // 检查条件
            let canChoose = true;
            let conditionText = '';

            if (choice.condition) {
                switch (choice.condition.type) {
                    case 'hp':
                        canChoose = this.player.currentHp >= choice.condition.min;
                        if (!canChoose) conditionText = `(需要 ${choice.condition.min} HP)`;
                        break;
                    case 'gold':
                        canChoose = this.player.gold >= choice.condition.min;
                        if (!canChoose) conditionText = `(需要 ${choice.condition.min} 灵石)`;
                        break;
                    case 'deckSize':
                        canChoose = this.player.deck.length >= choice.condition.min;
                        if (!canChoose) conditionText = `(需要 ${choice.condition.min} 张卡牌)`;
                        break;
                }
            }

            const btn = document.createElement('button');
            btn.className = 'event-choice';
            if (!canChoose) btn.classList.add('disabled');
            btn.innerHTML = `
                <div>${choice.icon || '▶'} ${choice.text} ${conditionText}</div>
                <div class="choice-effect">${choice.result || ''}</div>
            `;

            if (canChoose) {
                btn.onclick = () => this.selectEventChoice(index);
            } else {
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            }

            choicesEl.appendChild(btn);
        });

        modal.classList.add('active');
    }

    // 选择事件选项
    selectEventChoice(choiceIndex) {
        const choice = this.currentEvent.choices[choiceIndex];
        if (!choice) return;

        // 收集效果结果用于显示
        this.eventResults = [];

        // 执行效果
        if (choice.effects && choice.effects.length > 0) {
            choice.effects.forEach(effect => this.executeEventEffect(effect));
        }

        // 在弹窗中显示结果
        const descEl = document.getElementById('event-desc');
        const choicesEl = document.getElementById('event-choices');

        if (this.eventResults.length > 0) {
            descEl.innerHTML = `<div style="color: var(--accent-gold); font-size: 1.1rem;">✨ 结果</div>`;
            descEl.innerHTML += this.eventResults.map(r => `<div style="margin-top: 8px;">${r}</div>`).join('');
        } else if (choice.effects && choice.effects.length === 0) {
            descEl.innerHTML = `<div style="color: var(--text-muted);">你转身离开了...</div>`;
        }

        // 隐藏选项，显示继续按钮
        choicesEl.innerHTML = '';
        const continueBtn = document.createElement('button');
        continueBtn.className = 'event-choice';
        continueBtn.innerHTML = '<div>▶ 继续</div>';
        continueBtn.onclick = () => {
            document.getElementById('event-modal').classList.remove('active');
            this.onEventComplete();
        };
        choicesEl.appendChild(continueBtn);
    }

    // 执行事件效果
    executeEventEffect(effect) {
        switch (effect.type) {
            case 'gold':
                if (effect.percent) {
                    const amount = Math.floor(this.player.gold * (Math.abs(effect.percent) / 100));
                    if (effect.percent < 0) {
                        this.player.gold -= amount;
                        this.eventResults.push(`💰 灵石 -${amount} (${Math.abs(effect.percent)}%)`);
                    } else {
                        this.player.gold += amount;
                        this.eventResults.push(`💰 灵石 +${amount} (${effect.percent}%)`);
                    }
                } else {
                    this.player.gold += effect.value;
                    this.eventResults.push(`💰 灵石 ${effect.value > 0 ? '+' : ''}${effect.value}`);
                }
                break;

            case 'randomGold':
                const goldAmount = Math.floor(Math.random() * (effect.max - effect.min + 1)) + effect.min;
                this.player.gold += goldAmount;
                this.eventResults.push(`💰 获得 ${goldAmount} 灵石`);
                break;

            case 'heal':
                this.player.currentHp = Math.min(this.player.maxHp, this.player.currentHp + effect.value);
                this.eventResults.push(`💚 恢复 ${effect.value} HP`);
                break;

            case 'damage':
                this.player.currentHp -= effect.value;
                this.eventResults.push(`💔 失去 ${effect.value} HP`);
                break;

            case 'ringExp':
                this.player.fateRing.exp += effect.value;
                this.player.checkFateRingLevelUp();
                this.eventResults.push(`🔮 命环经验 +${effect.value}`);
                break;

            case 'card':
                let card = null;
                if (effect.cardId && CARDS[effect.cardId]) {
                    card = { ...CARDS[effect.cardId] };
                } else if (effect.rarity) {
                    card = getRandomCard(effect.rarity);
                }
                if (card) {
                    this.player.addCardToDeck(card);
                    this.eventResults.push(`🃏 获得卡牌: ${card.name}`);
                }
                break;

            case 'maxHp':
                this.player.maxHp += effect.value;
                if (effect.value > 0) {
                    this.player.currentHp += effect.value;
                }
                this.eventResults.push(`❤️ 最大HP ${effect.value > 0 ? '+' : ''}${effect.value}`);
                break;

            case 'permaBuff':
                if (!this.player.permBuffs) this.player.permBuffs = {};
                this.player.permBuffs[effect.stat] = (this.player.permBuffs[effect.stat] || 0) + effect.value;
                this.eventResults.push(`💪 永久${effect.stat === 'strength' ? '力量' : '属性'} ${effect.value > 0 ? '+' : ''}${effect.value}`);
                break;

            case 'law':
                if (effect.random) {
                    const lawKeys = Object.keys(LAWS);
                    const randomLaw = LAWS[lawKeys[Math.floor(Math.random() * lawKeys.length)]];
                    if (randomLaw && this.player.collectLaw({ ...randomLaw })) {
                        this.eventResults.push(`✨ 获得法则: ${randomLaw.name}`);
                    }
                }
                break;

            case 'random':
                if (effect.options) {
                    const roll = Math.random();
                    let cumulative = 0;
                    for (const option of effect.options) {
                        cumulative += option.chance;
                        if (roll < cumulative) {
                            if (option.type !== 'nothing') {
                                this.executeEventEffect(option);
                            }
                            break;
                        }
                    }
                }
                break;

            case 'battle':
                // 触发战斗
                if (effect.enemyId && ENEMIES[effect.enemyId]) {
                    const enemy = JSON.parse(JSON.stringify(ENEMIES[effect.enemyId]));
                    this.closeModal();
                    setTimeout(() => {
                        this.startBattle(enemy, this.currentBattleNode);
                    }, 300);
                }
                break;

            case 'trial':
                // 试炼模式 - 设置特殊战斗规则
                this.trialMode = {
                    type: effect.trialType,
                    rounds: effect.rounds,
                    rewardMultiplier: effect.rewardMultiplier || 1,
                    reward: effect.reward
                };
                Utils.showBattleLog(`进入试炼模式: ${effect.trialType}`);
                // 触发战斗（使用当前天域的随机敌人）
                const trialEnemy = getRandomEnemy(this.player.realm);
                if (trialEnemy) {
                    this.closeModal();
                    setTimeout(() => {
                        this.startBattle(trialEnemy, this.currentBattleNode);
                    }, 300);
                }
                break;

            case 'upgradeCard':
                // 升级卡牌效果 - 显示升级选择界面
                this.closeModal();
                setTimeout(() => {
                    this.showEventUpgradeCard();
                }, 100);
                return; // 不自动完成事件

            case 'removeCardType':
                // 移除指定类型的卡牌
                const cardType = effect.cardType;
                const removeCount = effect.count || 1;
                let removed = 0;

                for (let i = this.player.deck.length - 1; i >= 0 && removed < removeCount; i--) {
                    if (this.player.deck[i].type === cardType) {
                        const removedCard = this.player.deck.splice(i, 1)[0];
                        Utils.showBattleLog(`移除了 ${removedCard.name}`);
                        removed++;
                    }
                }
                break;

            case 'awakenRing':
                // 觉醒命环
                if (this.player.fateRing.level === 0) {
                    this.player.fateRing.level = 1;
                    this.player.fateRing.name = '一阶·觉醒';
                    this.player.fateRing.slots = 1;
                    this.player.fateRing.path = 'awakened';
                    Utils.showBattleLog('命环觉醒！逆命之路开启！');
                }
                break;

            default:
                // 未处理的效果类型
                console.log('未处理的事件效果:', effect.type);
        }
    }

    // 事件中升级卡牌
    showEventUpgradeCard() {
        const modal = document.getElementById('deck-modal');
        const container = document.getElementById('deck-view-cards');
        container.innerHTML = '<h3 style="width:100%;text-align:center;margin-bottom:16px;">选择要升级的卡牌</h3>';

        const upgradableCards = this.player.deck.filter(c => canUpgradeCard(c));

        if (upgradableCards.length === 0) {
            container.innerHTML += '<p style="text-align:center;color:var(--text-muted);">没有可升级的卡牌</p>';
            setTimeout(() => {
                this.closeModal();
                this.onEventComplete();
            }, 1500);
            return;
        }

        this.player.deck.forEach((card, index) => {
            if (!canUpgradeCard(card)) return;

            const cardEl = Utils.createCardElement(card, index);
            cardEl.classList.add(`rarity-${card.rarity || 'common'}`);
            cardEl.style.cursor = 'pointer';

            cardEl.addEventListener('click', () => {
                const upgraded = upgradeCard(card);
                this.player.deck[index] = upgraded;
                Utils.showBattleLog(`${card.name} 升级为 ${upgraded.name}！`);
                this.closeModal();
                this.onEventComplete();
            });
            container.appendChild(cardEl);
        });

        modal.classList.add('active');
    }

    // 事件完成
    onEventComplete() {
        this.achievementSystem.updateStat('eventsCompleted', 1);

        if (this.currentBattleNode) {
            this.map.completeNode(this.currentBattleNode);
            this.currentBattleNode = null;
        }

        this.autoSave();
        this.showScreen('map-screen');
    }

    // 战斗失败
    onBattleLost() {
        document.getElementById('game-over-title').textContent = '陨落...';
        document.getElementById('game-over-title').classList.remove('victory');
        document.getElementById('game-over-text').textContent = '逆命之路，暂时中断';

        document.getElementById('stat-floor').textContent = this.map.getRealmName(this.player.realm);
        document.getElementById('stat-enemies').textContent = this.player.enemiesDefeated;
        document.getElementById('stat-laws').textContent = this.player.collectedLaws.length;

        this.showScreen('game-over-screen');
    }

    // 天域完成
    onRealmComplete() {
        // 更新成就
        this.achievementSystem.updateStat('realmCleared', this.player.realm, 'max');

        // 检查速通
        if (this.runStartTime) {
            const runTime = (Date.now() - this.runStartTime) / 1000;
            this.achievementSystem.updateStat('speedClear', runTime, 'min');
        }

        // 检查牌组大小
        this.achievementSystem.updateStat('minDeckClear', this.player.deck.length, 'min');

        // 解锁下一重天
        if (!this.unlockedRealms) this.unlockedRealms = [1];
        if (!this.unlockedRealms.includes(this.player.realm + 1)) {
            this.unlockedRealms.push(this.player.realm + 1);
        }

        // 允许玩家选择继续或回城
        // 这里暂时保持自动推进，但增加保存
        this.player.realm++;
        this.player.floor = 0;
        this.autoSave();

        if (this.player.realm > 5) {
            this.showVictoryScreen();
            return;
        }

        // 治疗玩家
        const healAmount = Math.floor(this.player.maxHp * 0.2);
        this.player.heal(healAmount);
        Utils.showBattleLog(`进入下一重天域，恢复 ${healAmount} HP`);

        this.map.generate(this.player.realm);
        this.showScreen('map-screen');
    }

    // 显示胜利界面
    showVictoryScreen() {
        document.getElementById('game-over-title').textContent = '逆天成功！';
        document.getElementById('game-over-title').classList.add('victory');
        document.getElementById('game-over-text').textContent = '你打破了命运的枷锁，成为了真正的逆命者！';

        document.getElementById('stat-floor').textContent = '第五重天';
        document.getElementById('stat-enemies').textContent = this.player.enemiesDefeated;
        document.getElementById('stat-laws').textContent = this.player.collectedLaws.length;

        this.showScreen('game-over-screen');
    }

    // 显示牌组
    showDeck() {
        this.showDeckModal('deck');
    }

    // 显示牌组模态框
    showDeckModal(type) {
        const modal = document.getElementById('deck-modal');
        const container = document.getElementById('deck-view-cards');

        // Let's look at index.html content again.
        // I only saw removal modal. I did NOT see deck-modal in the snippets I viewed.
        // Let me verify index.html around line 300-400.

        const title = modal.querySelector('h2');

        let cards = [];
        switch (type) {
            case 'deck':
                cards = this.player.deck;
                title.textContent = `当前牌组 (${cards.length})`;
                break;
            case 'draw':
                cards = this.player.drawPile;
                title.textContent = `抽牌堆 (${cards.length})`;
                break;
            case 'discard':
                cards = this.player.discardPile;
                title.textContent = `弃牌堆 (${cards.length})`;
                break;
        }

        // 统计数量
        const cardCounts = {};
        const uniqueCards = [];

        cards.forEach(card => {
            if (!cardCounts[card.id]) {
                cardCounts[card.id] = {
                    count: 0,
                    card: card
                };
                uniqueCards.push(card);
            }
            cardCounts[card.id].count++;
        });

        // 排序：稀有度 > 名称
        const rarityOrder = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1, basic: 0 };
        uniqueCards.sort((a, b) => {
            const rA = rarityOrder[a.rarity || 'common'];
            const rB = rarityOrder[b.rarity || 'common'];
            if (rA !== rB) return rB - rA;
            return a.id.localeCompare(b.id);
        });

        container.innerHTML = '';
        uniqueCards.forEach((card, index) => {
            const count = cardCounts[card.id].count;
            const cardEl = Utils.createCardElement(card, index);
            cardEl.classList.add(`rarity-${card.rarity || 'common'}`);

            // 如果数量大于1，添加徽章
            if (count > 1) {
                const badge = document.createElement('div');
                badge.className = 'card-count-badge';
                badge.textContent = `x${count}`;
                cardEl.appendChild(badge);
            }

            container.appendChild(cardEl);
        });

        modal.classList.add('active');

    }

    // 显示命环
    showFateRing() {
        const modal = document.getElementById('ring-modal');
        const ring = this.player.fateRing;

        document.getElementById('modal-ring-level').textContent = ring.name;
        const currentLevelInfo = FATE_RING.levels[ring.level];
        const nextLevelInfo = FATE_RING.levels[ring.level + 1];
        const expRequired = nextLevelInfo?.expRequired || currentLevelInfo?.expRequired || 999;
        document.getElementById('ring-progress').textContent = `${ring.exp}/${expRequired}`;

        const slotsContainer = document.getElementById('loaded-laws-list');
        slotsContainer.innerHTML = '';

        // 显示当前路径
        const currentPath = FATE_RING.paths[ring.path];
        if (currentPath && ring.path !== 'crippled') {
            const pathDiv = document.createElement('div');
            pathDiv.className = 'current-path-display';
            pathDiv.innerHTML = `
                <div style="margin-bottom: 16px; padding: 12px; background: linear-gradient(135deg, rgba(255,215,0,0.1), rgba(156,39,176,0.1)); border-radius: 8px; border: 1px solid var(--accent-gold);">
                    <div style="font-size: 1.2rem; margin-bottom: 4px;">${currentPath.icon || '💫'} ${currentPath.name}</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary);">${currentPath.description}</div>
                </div>
            `;
            slotsContainer.appendChild(pathDiv);
        }

        // 检查是否可以进化
        const availablePaths = getAvailablePaths(ring);
        if (availablePaths.length > 0 && ring.level > 0) {
            const evolveSection = document.createElement('div');
            evolveSection.className = 'evolve-section';
            evolveSection.innerHTML = `
                <h4 style="margin: 16px 0 8px; color: var(--accent-gold);">🌟 可进化路径</h4>
            `;

            const pathsGrid = document.createElement('div');
            pathsGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px;';

            availablePaths.forEach(path => {
                const pathCard = document.createElement('div');
                pathCard.className = 'path-card';
                pathCard.style.cssText = `
                    padding: 12px; 
                    background: rgba(255,255,255,0.05); 
                    border: 1px solid rgba(255,255,255,0.2); 
                    border-radius: 8px; 
                    cursor: pointer; 
                    transition: all 0.3s;
                    text-align: center;
                `;
                pathCard.innerHTML = `
                    <div style="font-size: 2rem; margin-bottom: 4px;">${path.icon}</div>
                    <div style="font-weight: 600; margin-bottom: 4px;">${path.name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${path.description}</div>
                `;

                pathCard.addEventListener('mouseenter', () => {
                    pathCard.style.borderColor = 'var(--accent-gold)';
                    pathCard.style.transform = 'translateY(-2px)';
                    pathCard.style.boxShadow = '0 4px 12px rgba(255,215,0,0.2)';
                });
                pathCard.addEventListener('mouseleave', () => {
                    pathCard.style.borderColor = 'rgba(255,255,255,0.2)';
                    pathCard.style.transform = 'translateY(0)';
                    pathCard.style.boxShadow = 'none';
                });
                pathCard.addEventListener('click', () => {
                    this.evolveFateRing(path.id);
                });

                pathsGrid.appendChild(pathCard);
            });

            evolveSection.appendChild(pathsGrid);
            slotsContainer.appendChild(evolveSection);
        }

        if (ring.slots === 0) {
            slotsContainer.innerHTML += '<div style="color: var(--text-muted); padding: 20px; text-align: center;">残缺印记无法承载法则，请寻找古玉觉醒...</div>';
        } else {
            // 显示法则槽位
            const lawsTitle = document.createElement('h4');
            lawsTitle.style.cssText = 'margin: 16px 0 8px; color: var(--accent-purple);';
            lawsTitle.textContent = '📜 装载的法则';
            slotsContainer.appendChild(lawsTitle);

            const lawsGrid = document.createElement('div');
            lawsGrid.style.cssText = 'display: flex; gap: 12px; flex-wrap: wrap;';

            for (let i = 0; i < ring.slots; i++) {
                const lawId = ring.loadedLaws[i];
                const law = lawId ? LAWS[lawId] : null;

                const slot = document.createElement('div');
                slot.className = `law-slot ${law ? 'filled' : ''}`;
                slot.style.cssText = 'padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px; text-align: center; min-width: 80px;';
                slot.innerHTML = law ? `
                    <div class="law-icon" style="font-size: 1.5rem;">${law.icon}</div>
                    <div class="law-name" style="font-size: 0.8rem; margin-top: 4px;">${law.name}</div>
                ` : `
                    <div class="law-icon" style="font-size: 1.5rem; opacity: 0.3;">+</div>
                    <div class="law-name" style="font-size: 0.8rem; opacity: 0.5;">空槽</div>
                `;

                lawsGrid.appendChild(slot);
            }

            slotsContainer.appendChild(lawsGrid);
        }

        modal.classList.add('active');
    }

    // 进化命环
    evolveFateRing(pathId) {
        const path = FATE_RING.paths[pathId];
        if (!path) return;

        // 记录之前的路径
        if (!this.player.fateRing.unlockedPaths) {
            this.player.fateRing.unlockedPaths = [];
        }
        if (this.player.fateRing.path && this.player.fateRing.path !== 'crippled') {
            this.player.fateRing.unlockedPaths.push(this.player.fateRing.path);
        }

        // 设置新路径
        this.player.fateRing.path = pathId;

        // 应用路径加成
        this.applyPathBonus(path);

        Utils.showBattleLog(`命环进化！获得【${path.name}】！`);

        // 关闭并重新打开以刷新UI
        this.closeModal();
        setTimeout(() => this.showFateRing(), 100);

        this.autoSave();
    }

    // 应用路径加成
    applyPathBonus(path) {
        if (!path.bonus) return;

        switch (path.bonus.type) {
            case 'hpBonus':
                this.player.maxHp += path.bonus.value;
                this.player.currentHp += path.bonus.value;
                break;
            case 'energyBonus':
                this.player.baseEnergy += path.bonus.value;
                break;
            case 'drawBonus':
                this.player.drawCount += path.bonus.value;
                break;
        }
    }

    // 显示设置
    showSettings() {
        alert('The Defier 2.1\n\n操作说明:\n- 点击手牌使用卡牌\n- 点击敌人选择目标\n- 点击"结束回合"结束当前回合\n\n系统:\n- 命环经验: 击败敌人获得\n- 法则盗取: 击败敌人后有机会盗取\n- 成就: 完成挑战解锁奖励');
    }

    // 卡牌使用效果
    playCardEffect(targetEl, cardType) {
        if (typeof particles !== 'undefined') {
            particles.playCardEffect(targetEl, cardType);
        }
    }

    // 关闭模态框
    closeModal() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }

    // ========== 商店功能 ==========

    // 当前商店节点和商品
    shopNode = null;
    shopItems = [];

    // 显示商店
    showShop(node) {
        this.shopNode = node;
        this.shopItems = this.generateShopItems();

        // 更新金币显示
        document.getElementById('shop-gold-display').textContent = this.player.gold;

        // 生成商品卡牌
        this.renderShopCards();

        this.showScreen('shop-screen');
    }

    // 生成商店商品
    generateShopItems() {
        const items = [];
        const realm = this.player.realm;

        // 生成3-5张卡牌
        const cardCount = Utils.random(3, 5);
        for (let i = 0; i < cardCount; i++) {
            const card = getRandomCard();
            const basePrice = this.getCardPrice(card);
            items.push({
                card: card,
                price: basePrice,
                sold: false
            });
        }

        return items;
    }

    // 获取卡牌价格
    getCardPrice(card) {
        const rarityPrices = {
            basic: 30,
            common: 50,
            uncommon: 80,
            rare: 120,
            epic: 180,
            legendary: 250
        };
        return rarityPrices[card.rarity] || 50;
    }

    // 渲染商店卡牌
    renderShopCards() {
        const container = document.getElementById('shop-cards');
        container.innerHTML = '';

        this.shopItems.forEach((item, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'shop-card-wrapper';

            const cardEl = Utils.createCardElement(item.card, index);
            cardEl.classList.add(`rarity-${item.card.rarity || 'common'}`);
            if (item.sold) {
                cardEl.classList.add('sold');
            }

            const priceBtn = document.createElement('div');
            priceBtn.className = `card-price ${this.player.gold < item.price ? 'cannot-afford' : ''}`;
            priceBtn.innerHTML = `💰 ${item.price}`;

            if (!item.sold && this.player.gold >= item.price) {
                priceBtn.addEventListener('click', () => this.buyCard(index));
            }

            wrapper.appendChild(cardEl);
            if (!item.sold) {
                wrapper.appendChild(priceBtn);
            } else {
                const soldTag = document.createElement('div');
                soldTag.className = 'card-price';
                soldTag.textContent = '已售出';
                soldTag.style.opacity = '0.5';
                wrapper.appendChild(soldTag);
            }

            container.appendChild(wrapper);
        });
    }

    // 购买卡牌
    buyCard(index) {
        const item = this.shopItems[index];
        if (!item || item.sold) return;
        if (this.player.gold < item.price) {
            Utils.showBattleLog('灵石不足！');
            return;
        }

        this.player.gold -= item.price;
        this.player.addCardToDeck(item.card);
        item.sold = true;

        Utils.showBattleLog(`购买了 ${item.card.name}！`);

        // 更新显示
        document.getElementById('shop-gold-display').textContent = this.player.gold;
        this.renderShopCards();
    }

    // 购买治疗
    buyHeal() {
        const cost = 50;
        if (this.player.gold < cost) {
            Utils.showBattleLog('灵石不足！');
            return;
        }

        const healAmount = Math.floor(this.player.maxHp * 0.3);
        this.player.gold -= cost;
        this.player.heal(healAmount);

        Utils.showBattleLog(`恢复了 ${healAmount} 点生命！`);
        document.getElementById('shop-gold-display').textContent = this.player.gold;
    }

    // 显示移除卡牌界面
    showRemoveCard() {
        const cost = 75;
        if (this.player.gold < cost) {
            Utils.showBattleLog('灵石不足！');
            return;
        }

        const container = document.getElementById('remove-card-list');
        container.innerHTML = '';

        this.player.deck.forEach((card, index) => {
            const cardEl = Utils.createCardElement(card, index);
            cardEl.classList.add(`rarity-${card.rarity || 'common'}`);
            cardEl.addEventListener('click', () => this.removeCard(index, cost));
            container.appendChild(cardEl);
        });

        document.getElementById('remove-card-modal').classList.add('active');
    }

    // 移除卡牌
    removeCard(index, cost) {
        if (this.player.gold < cost) return;

        const card = this.player.deck[index];
        this.player.deck.splice(index, 1);
        this.player.gold -= cost;

        Utils.showBattleLog(`移除了 ${card.name}！`);
        document.getElementById('shop-gold-display').textContent = this.player.gold;
        this.closeModal();
    }

    // 购买命环经验
    buyRingExp() {
        const cost = 50;
        if (this.player.gold < cost) {
            Utils.showBattleLog('灵石不足！');
            return;
        }

        this.player.gold -= cost;
        this.player.fateRing.exp += 50;
        this.player.checkFateRingLevelUp();

        Utils.showBattleLog('命环经验 +50！');
        document.getElementById('shop-gold-display').textContent = this.player.gold;
    }

    // 关闭商店
    closeShop() {
        if (this.shopNode) {
            this.map.completeNode(this.shopNode);
            this.shopNode = null;
        }
        this.autoSave();
        this.showScreen('map-screen');
    }

    // ========== 营地功能 ==========

    campfireNode = null;

    // 显示营地选项
    showCampfire(node) {
        this.campfireNode = node;

        // 使用事件弹窗显示营地选项
        const modal = document.getElementById('event-modal');
        document.getElementById('event-icon').textContent = '🏕️';
        document.getElementById('event-title').textContent = '野外营地';
        document.getElementById('event-desc').textContent = '你找到了一个安全的休息地点，可以在这里恢复精力或磨练技艺...';

        const choicesEl = document.getElementById('event-choices');
        choicesEl.innerHTML = '';

        // 选项1: 休息恢复HP
        const healAmount = Math.floor(this.player.maxHp * 0.3);
        const restBtn = document.createElement('button');
        restBtn.className = 'event-choice';
        restBtn.innerHTML = `
            <div>💤 休息 (恢复 ${healAmount} HP)</div>
            <div class="choice-effect">当前HP: ${this.player.currentHp}/${this.player.maxHp}</div>
        `;
        restBtn.onclick = () => this.campfireRest();
        choicesEl.appendChild(restBtn);

        // 选项2: 升级卡牌
        const upgradableCount = this.player.deck.filter(c => canUpgradeCard(c)).length;
        const upgradeBtn = document.createElement('button');
        upgradeBtn.className = 'event-choice';
        upgradeBtn.innerHTML = `
            <div>⬆️ 升级卡牌</div>
            <div class="choice-effect">可升级: ${upgradableCount} 张</div>
        `;
        if (upgradableCount > 0) {
            upgradeBtn.onclick = () => this.showCampfireUpgrade();
        } else {
            upgradeBtn.classList.add('disabled');
            upgradeBtn.style.opacity = '0.5';
            upgradeBtn.style.cursor = 'not-allowed';
        }
        choicesEl.appendChild(upgradeBtn);

        // 选项3: 移除卡牌（如果牌组足够大）
        if (this.player.deck.length > 5) {
            const removeBtn = document.createElement('button');
            removeBtn.className = 'event-choice';
            removeBtn.innerHTML = `
                <div>🗑️ 净化 (移除一张牌)</div>
                <div class="choice-effect">精简牌组，提升效率</div>
            `;
            removeBtn.onclick = () => this.showCampfireRemove();
            choicesEl.appendChild(removeBtn);
        }

        modal.classList.add('active');
    }

    // 营地休息
    campfireRest() {
        const healAmount = Math.floor(this.player.maxHp * 0.3);
        this.player.heal(healAmount);
        Utils.showBattleLog(`休息恢复 ${healAmount} 点生命！`);

        this.closeModal();
        this.completeCampfire();
    }

    // 显示升级卡牌界面
    showCampfireUpgrade() {
        this.closeModal();

        const modal = document.getElementById('deck-modal');
        const container = document.getElementById('deck-view-cards');
        container.innerHTML = '<h3 style="width:100%;text-align:center;margin-bottom:16px;">选择要升级的卡牌</h3>';

        this.player.deck.forEach((card, index) => {
            if (!canUpgradeCard(card)) return;

            const cardEl = Utils.createCardElement(card, index);
            cardEl.classList.add(`rarity-${card.rarity || 'common'}`);
            cardEl.style.cursor = 'pointer';

            // 显示升级预览
            cardEl.addEventListener('mouseenter', () => {
                const upgraded = upgradeCard(card);
                cardEl.title = `升级后: ${upgraded.name}\n${upgraded.description}`;
            });

            cardEl.addEventListener('click', () => this.campfireUpgradeCard(index));
            container.appendChild(cardEl);
        });

        modal.classList.add('active');
    }

    // 升级选中的卡牌
    campfireUpgradeCard(index) {
        const card = this.player.deck[index];
        if (!canUpgradeCard(card)) return;

        const upgraded = upgradeCard(card);
        this.player.deck[index] = upgraded;

        Utils.showBattleLog(`${card.name} 升级为 ${upgraded.name}！`);

        this.closeModal();
        this.completeCampfire();
    }

    // 显示移除卡牌界面（营地版）
    showCampfireRemove() {
        this.closeModal();

        const modal = document.getElementById('deck-modal');
        const container = document.getElementById('deck-view-cards');
        container.innerHTML = '<h3 style="width:100%;text-align:center;margin-bottom:16px;">选择要移除的卡牌</h3>';

        this.player.deck.forEach((card, index) => {
            const cardEl = Utils.createCardElement(card, index);
            cardEl.classList.add(`rarity-${card.rarity || 'common'}`);
            cardEl.style.cursor = 'pointer';
            cardEl.addEventListener('click', () => this.campfireRemoveCard(index));
            container.appendChild(cardEl);
        });

        modal.classList.add('active');
    }

    // 移除选中的卡牌（营地版）
    campfireRemoveCard(index) {
        const card = this.player.deck[index];
        this.player.deck.splice(index, 1);

        Utils.showBattleLog(`移除了 ${card.name}！`);

        this.closeModal();
        this.completeCampfire();
    }

    // 完成营地
    completeCampfire() {
        if (this.campfireNode) {
            this.map.completeNode(this.campfireNode);
            this.campfireNode = null;
        }
        this.autoSave();
        this.showScreen('map-screen');
    }
}

// 全局游戏实例
let game;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    game = new Game();
});
