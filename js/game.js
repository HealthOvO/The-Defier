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
        document.getElementById('ring-level-display').textContent = ringName;
        document.getElementById('char-imprint-badge').textContent = ringName;
        
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
                this.player.fateRing.exp += 20;
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

        this.showScreen('map-screen');
    }

    // 事件完成
    onEventComplete() {
        this.achievementSystem.updateStat('eventsCompleted', 1);

        if (this.currentBattleNode) {
            this.map.completeNode(this.currentBattleNode);
            this.currentBattleNode = null;
        }

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
        const title = modal.querySelector('h2');

        let cards = [];
        switch (type) {
            case 'deck':
                cards = this.player.deck;
                title.textContent = '当前牌组';
                break;
            case 'draw':
                cards = this.player.drawPile;
                title.textContent = '抽牌堆';
                break;
            case 'discard':
                cards = this.player.discardPile;
                title.textContent = '弃牌堆';
                break;
        }

        container.innerHTML = '';
        cards.forEach((card, index) => {
            const cardEl = Utils.createCardElement(card, index);
            cardEl.classList.add(`rarity-${card.rarity || 'common'}`);
            container.appendChild(cardEl);
        });

        modal.classList.add('active');
    }

    // 显示命环
    showFateRing() {
        const modal = document.getElementById('ring-modal');
        const ring = this.player.fateRing;

        document.getElementById('modal-ring-level').textContent = ring.name;
        const expRequired = FATE_RING.levels[ring.level]?.expRequired || 999;
        document.getElementById('ring-progress').textContent = `${ring.exp}/${expRequired}`;

        const slotsContainer = document.getElementById('loaded-laws-list');
        slotsContainer.innerHTML = '';

        if (ring.slots === 0) {
             slotsContainer.innerHTML = '<div style="color: var(--text-muted); padding: 20px;">残缺印记无法承载法则，请寻找古玉觉醒...</div>';
        }

        for (let i = 0; i < ring.slots; i++) {
            const lawId = ring.loadedLaws[i];
            const law = lawId ? LAWS[lawId] : null;

            const slot = document.createElement('div');
            slot.className = `law-slot ${law ? 'filled' : ''}`;
            slot.innerHTML = law ? `
                <div class="law-icon">${law.icon}</div>
                <div class="law-name">${law.name}</div>
            ` : `
                <div class="law-icon">+</div>
                <div class="law-name">空槽</div>
            `;

            slotsContainer.appendChild(slot);
        }

        modal.classList.add('active');
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
}

// 全局游戏实例
let game;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    game = new Game();
});
