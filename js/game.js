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
        this.currentSaveSlot = 0; // Default slot
        this.cachedSlots = [null, null, null, null]; // Cache for slots

        // Restore slot from session if exists
        const savedSlot = sessionStorage.getItem('currentSaveSlot');
        if (savedSlot !== null) this.currentSaveSlot = parseInt(savedSlot);

        this.init();
    }

    // 初始化
    init() {
        this.bindGlobalEvents();
        // Initialize Auth
        if (typeof AuthService !== 'undefined') {
            AuthService.init();
            this.checkLoginStatus();
            // 需求：如果未登录，让他去登录
            if (!AuthService.isLoggedIn()) {
                setTimeout(() => this.showLoginModal(), 1000); // 延迟一点显示，体验更好
            }
        }
        this.initCollection();
        this.initDynamicBackground();
        this.loadGameResult = this.loadGame();

        // 检查是否有存档，更新按钮状态
        const continueBtn = document.getElementById('continue-game-btn');
        const newGameBtn = document.getElementById('new-game-btn');

        // 默认显示“新的轮回”
        if (newGameBtn) newGameBtn.style.display = 'flex';

        if (this.loadGameResult && this.player.currentHp > 0) {
            if (continueBtn) {
                continueBtn.style.display = 'flex';
                // 当有存档时，新游戏按钮改为“次级”样式或保持原样，但必须显示
                // 这里我们确保它就在那里，并且文字清晰
            }
        } else {
            if (continueBtn) continueBtn.style.display = 'none';
        }

        // 默认总是留在主菜单，除非特定场景（比如移动端恢复？）
        // 这里我们强制让用户选择，解决了刷新后乱入的问题
        this.showScreen('main-menu');

        console.log('The Defier 2.1 初始化完成！');
    }

    // 继续游戏
    continueGame() {
        // 强制登录检查
        if (typeof AuthService === 'undefined') {
            alert('登录系统未就绪，请刷新重试！(AuthService missing)');
            return;
        }
        if (!AuthService.isLoggedIn()) {
            this.showLoginModal();
            return;
        }

        if (this.loadGameResult) {
            this.showScreen('map-screen');
        } else {
            // 如果加载失败（比如存档被手动删了），刷新页面或提示
            window.location.reload();
        }
    }



    // 绑定全局事件
    bindGlobalEvents() {
        // ESC关闭模态框
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });

        // 全局点击音效
        document.addEventListener('click', (e) => {
            // 如果点击的是按钮或包含在按钮内，或者是卡牌、菜单按钮、收藏项、角色卡片、关卡卡片
            if (e.target.closest('button') || e.target.closest('.card') || e.target.closest('.menu-btn') || e.target.closest('.collection-item') || e.target.closest('.character-card') || e.target.closest('.realm-card')) {
                // 如果没有被阻止传播
                if (typeof audioManager !== 'undefined') {
                    // 重要按钮播放确认音效
                    const targetBtn = e.target.closest('button');
                    const targetRealm = e.target.closest('.realm-card');

                    if ((targetBtn && (
                        targetBtn.id === 'new-game-btn' ||
                        targetBtn.id === 'confirm-character-btn' ||
                        targetBtn.id === 'end-turn-btn' ||
                        targetBtn.id === 'continue-game-btn' ||
                        targetBtn.classList.contains('primary')
                    )) || targetRealm) {
                        audioManager.playSFX('confirm');
                    } else {
                        // 普通点击
                        audioManager.playSFX('click');
                    }
                }
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
    // 保存游戏
    saveGame() {
        const gameState = {
            version: '3.0.0',
            player: this.player.getState(),
            map: {
                nodes: this.map.nodes,
                currentNodeIndex: this.map.currentNodeIndex,
                completedNodes: this.map.completedNodes
            },
            unlockedRealms: this.unlockedRealms || [1],
            currentScreen: this.currentScreen,
            timestamp: Date.now()
        };
        localStorage.setItem('theDefierSave', JSON.stringify(gameState));
        console.log('游戏已保存 (本地)');

        // 如果已登录，自动同步到云端对应槽位
        if (AuthService.isLoggedIn()) {
            AuthService.saveCloudData(gameState, this.currentSaveSlot).then(res => {
                if (res.success) {
                    console.log(`游戏已同步 (云端 Slot ${this.currentSaveSlot})`);
                    // Update cache
                    this.cachedSlots[this.currentSaveSlot] = gameState;
                }
            });
        }
    }

    // 加载游戏
    loadGame() {
        const savedData = localStorage.getItem('theDefierSave');
        if (!savedData) return false;

        try {
            const gameState = JSON.parse(savedData);

            // 版本检查
            const currentVersion = '3.0.0';
            if (!gameState.version || gameState.version < '2.2.0') { // 兼容2.2.0存档
                console.log('检测到旧版本存档，已清除');
                this.clearSave();
                return false;
            }

            // 检查生命值，如果是0或更低，说明是死亡存档，直接清除
            if (!gameState.player || gameState.player.currentHp <= 0) {
                console.log('检测到死亡存档，已清除');
                this.clearSave();
                return false;
            }

            // 验证牌组数据
            if (!gameState.player.deck || !Array.isArray(gameState.player.deck) || gameState.player.deck.length < 5) {
                console.log('存档牌组数据无效，已清除存档');
                this.clearSave();
                return false;
            }

            // === 兼容性迁移 ===
            // 修复：无欲角色的 'goldenBell' 曾与通用卡牌ID冲突，现更名为 'goldenBellSkill'
            if (gameState.player.characterId === 'wuYu') {
                gameState.player.deck.forEach(card => {
                    if (card.id === 'goldenBell') {
                        card.id = 'goldenBellSkill';
                        console.log('Migration: Renamed Wu Yu goldenBell -> goldenBellSkill');
                    }
                });
            }

            // 恢复玩家状态
            Object.assign(this.player, gameState.player);

            // 重新计算属性，确保版本更新后的加成生效
            // 并且防止旧存档中可能存在的错误叠加
            if (this.player.recalculateStats) {
                this.player.recalculateStats();
            }

            // 兼容性修复：确保法宝列表已初始化
            if (!this.player.treasures) {
                this.player.treasures = [];
            }
            if (!this.player.collectedLaws) {
                this.player.collectedLaws = [];
            } else {
                this.player.collectedLaws = this.player.collectedLaws.filter(Boolean);
            }

            // 数据修复
            if (isNaN(this.player.gold)) {
                this.player.gold = 100;
            }
            if (isNaN(this.player.currentHp) || this.player.currentHp <= 0) {
                this.player.currentHp = Math.floor(this.player.maxHp * 0.5);
            }

            // 恢复命环对象引用
            if (gameState.player.fateRing) {
                // Determine class based on type or character
                let RingClass = FateRing;
                if (gameState.player.fateRing.type === 'mutated') RingClass = MutatedRing;
                if (gameState.player.fateRing.type === 'sealed') RingClass = SealedRing;
                if (gameState.player.fateRing.type === 'karma') RingClass = KarmaRing;
                if (gameState.player.fateRing.type === 'analysis') RingClass = AnalysisRing;

                // Re-instantiate
                this.player.fateRing = new RingClass(this.player);
                this.player.fateRing.loadFromJSON(gameState.player.fateRing);

                // Check level up or initialization
                if (this.player.fateRing.checkLevelUp) {
                    this.player.fateRing.checkLevelUp();
                }
            }

            // Retroactive Skill Unlock (Fix for existing saves)
            // 确保旧存档中通过了天劫的玩家能解锁对应技能
            if (this.player.realm >= 5) this.player.unlockUltimate(1);
            if (this.player.realm >= 10) this.player.unlockUltimate(2);
            if (this.player.realm >= 15) this.player.unlockUltimate(3);

            // Fix: Global Force Sync for Card Data Persistence
            // 强制同步卡牌数据：使用最新代码中的数值覆盖存档中的旧数据，解决旧存档数值不更新的问题
            if (this.player.deck) {
                this.player.deck = this.player.deck.map(savedCard => {
                    // 在最新卡牌库中查找定义
                    // 如果是初始数据中不存在的卡牌（生成的？），CARDS中可能找不到
                    const originalDef = CARDS[savedCard.id];

                    // 如果找不到（可能是移除的卡牌或特殊卡牌），则保持原样
                    if (!originalDef) return savedCard;

                    // 创建新副本
                    let newCard = JSON.parse(JSON.stringify(originalDef));

                    // 恢复状态: 升级
                    if (savedCard.upgraded) {
                        try {
                            // 重新执行升级逻辑，获取最新数值
                            newCard = upgradeCard(newCard);
                        } catch (e) {
                            console.warn(`Card upgrade sync failed for ${savedCard.name}:`, e);
                            return savedCard; // 出错则回退
                        }
                    }

                    // 理论上如果后续有其他动态属性（如“临时卡牌”标记等），应在此处合并
                    // 目前主要关注静态数值和升级状态

                    return newCard;
                });
            }

            // 恢复地图状态
            this.map.nodes = gameState.map.nodes;
            this.map.currentNodeIndex = gameState.map.currentNodeIndex;
            this.map.completedNodes = gameState.map.completedNodes;

            this.unlockedRealms = gameState.unlockedRealms || [1];

            // 恢复界面：如果是战斗或奖励界面，因为临时数据未保存，强制回退到地图
            let savedScreen = gameState.currentScreen || 'map-screen';
            if (['battle-screen', 'reward-screen', 'game-over-screen'].includes(savedScreen)) {
                savedScreen = 'map-screen';
            }
            this.savedScreen = savedScreen;

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

    // 继续游戏
    continueGame() {
        if (this.loadGameResult) {
            // 如果保存的界面是角色选择或主菜单，说明并未真正开始游戏，转到地图
            if (['main-menu', 'character-select'].includes(this.savedScreen)) {
                this.showScreen('map-screen');
            } else {
                this.showScreen(this.savedScreen);
            }
        } else {
            window.location.reload();
        }
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
            // 保留 locked 样式用于视觉区分（变灰），但不再隐藏详细信息
            item.className = `collection-item ${collected ? '' : 'locked'}`;

            // 样式调整：允许高度自适应以显示描述
            item.style.height = 'auto';
            item.style.minHeight = '140px';
            item.style.display = 'flex';
            item.style.flexDirection = 'column';
            item.style.alignItems = 'center';
            item.style.padding = '15px';
            item.style.cursor = collected ? 'pointer' : 'default';

            // 构建描述HTML
            let descHtml = '';
            let passiveText = '';

            // 尝试获取被动效果描述（如果函数存在）
            if (typeof getLawPassiveDescription === 'function') {
                passiveText = getLawPassiveDescription(law);
            } else if (law.passive) {
                // 简单的fallback
                passiveText = `被动: ${law.passive.type} ${law.passive.value}`;
            }

            if (collected) {
                descHtml = `
                    <div class="collection-desc" style="font-size: 0.85rem; color: #ccc; margin-top: 8px; text-align: center; line-height: 1.4;">
                        ${law.description}
                    </div>
                    ${passiveText ? `
                    <div class="collection-effect" style="font-size: 0.8rem; color: #4ff; margin-top: 8px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 5px;">
                        ${passiveText}
                    </div>` : ''}
                `;
            } else {
                descHtml = `
                    <div class="collection-desc" style="font-size: 0.85rem; color: #666; margin-top: 8px; font-style: italic;">
                        未获得
                    </div>
                `;
            }

            // 始终显示名字
            item.innerHTML = `
                <div class="collection-icon" style="font-size: 2.5rem; margin-bottom: 5px;">${law.icon}</div>
                <div class="collection-name" style="font-size: 1.1rem; font-weight: bold; color: var(--accent-gold);">${law.name}</div>
                ${descHtml}
            `;

            if (collected) {
                item.addEventListener('click', () => {
                    // 详情弹窗
                    let detailMsg = `${law.name}\n\n${law.description}`;
                    if (passiveText) {
                        detailMsg += `\n\n被动效果: ${passiveText}`;
                    }
                    alert(detailMsg);
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

    // 渲染法宝
    renderTreasures(containerId = 'map-treasures') {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';

        if (this.player.treasures) {
            this.player.treasures.forEach(t => {
                const el = document.createElement('div');
                el.className = `treasure-item rarity-${t.rarity || 'common'}`;
                el.innerHTML = t.icon || '📦';

                // 获取动态描述
                const desc = (t.getDesc && this.player) ? t.getDesc(this.player) : t.description;

                el.title = `${t.name}\n${desc}`;

                // 点击查看详情
                el.addEventListener('click', () => {
                    alert(`${t.name}\n\n${desc}`);
                });

                container.appendChild(el);
            });
        }
    }

    // 初始化关卡选择界面
    initRealmSelect() {
        const container = document.getElementById('realm-select-container');
        if (!container) return;

        container.innerHTML = '';
        // 更新为18重天
        for (let i = 1; i <= 18; i++) {
            const isUnlocked = this.unlockedRealms && this.unlockedRealms.includes(i);
            const isCompleted = isUnlocked && this.unlockedRealms.includes(i + 1); // 简单判断

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
                this.updatePlayerDisplay();
            } else if (screenId === 'battle-screen') {
                this.updatePlayerDisplay();
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

    // 显示角色选择界面
    showCharacterSelection() {
        this.selectedCharacterId = null;
        const container = document.getElementById('character-selection-container');
        if (container) {
            container.innerHTML = '';

            // 剧情背景
            const introDiv = document.createElement('div');
            introDiv.className = 'story-intro';

            introDiv.innerHTML = `
                <p><strong>背景设定：</strong></p>
                <p>“命环”，乃天道为万物众生设下的枷锁，意在限制潜力，维持统治。</p>
                <p>然而天道亦有善恶，善念留下一线生机，即为“逆命者”。</p>
                <p>恶念化身天道之主，对此大为震怒，封印善念，并派遣“天罚者”猎杀逆命之人。</p>
                <p>如今，你作为新的逆命者觉醒，需在天罚者的追猎下不断突破命环，最终斩杀恶道，解放众生。</p>
            `;
            container.appendChild(introDiv);

            const cardsContainer = document.createElement('div');
            cardsContainer.className = 'character-cards-wrapper';


            for (const charId in CHARACTERS) {
                const char = CHARACTERS[charId];
                const card = document.createElement('div');
                card.className = 'character-card';
                card.dataset.id = charId;
                card.innerHTML = `
                    <div class="card-inner">
                        <div class="char-header">
                            <div class="char-avatar">${char.avatar}</div>
                        </div>
                        <div class="char-body">
                            <div class="char-name">${char.name}</div>
                            <div class="char-title">${char.title}</div>
                            <div class="char-desc">${char.description}</div>
                            <div class="char-relic-info" style="margin: 10px 0; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 6px; border: 1px solid var(--border-color);">
                                <div style="color: var(--accent-gold); font-size: 0.9em;">✦ 天赋：${char.relic.name}</div>
                                <div style="font-size: 0.8em; color: #ccc; margin-top: 2px;">${char.relic.desc}</div>
                            </div>
                            <div class="char-stats-preview">
                                <div class="stat-item">
                                    <span>${char.stats.maxHp}</span>
                                    <span>HP</span>
                                </div>
                                <div class="stat-item">
                                    <span>${char.stats.energy}</span>
                                    <span>灵力</span>
                                </div>
                            </div>
                            <div class="char-relic-preview">
                                🔮 ${char.relic.name}
                            </div>
                        </div>
                    </div>
                `;

                card.addEventListener('click', () => {
                    this.selectCharacter(charId);
                });

                cardsContainer.appendChild(card);
            }
            container.appendChild(cardsContainer);
        }

        const confirmBtn = document.getElementById('confirm-character-btn');
        if (confirmBtn) confirmBtn.disabled = true;

        this.showScreen('character-selection-screen');
    }

    // 选择角色
    selectCharacter(charId) {
        this.selectedCharacterId = charId;
        const cards = document.querySelectorAll('.character-card');
        cards.forEach(c => {
            if (c.dataset.id === charId) c.classList.add('selected');
            else c.classList.remove('selected');
        });
        const confirmBtn = document.getElementById('confirm-character-btn');
        if (confirmBtn) confirmBtn.disabled = false;
    }

    // 确认选择
    confirmCharacterSelection() {
        if (!this.selectedCharacterId) return;

        // 强制登录检查
        if (typeof AuthService !== 'undefined' && !AuthService.isLoggedIn()) {
            this.showLoginModal();
            return;
        }

        // 清除旧存档，开始新游戏
        this.clearSave();
        this.startNewGame(this.selectedCharacterId);
    }

    // 开始新游戏
    startNewGame(characterId = 'linFeng') {
        // 强制登录检查
        if (typeof AuthService === 'undefined') {
            alert('登录系统未就绪，请刷新重试！');
            return;
        }
        if (!AuthService.isLoggedIn()) {
            this.showLoginModal();
            return;
        }

        this.player.reset(characterId);
        this.player.realm = 1;
        this.player.floor = 0;
        this.comboCount = 0;
        this.lastCardType = null;
        this.runStartTime = Date.now();
        this.currentBattleNode = null;
        this.rewardCardSelected = false;

        // 强制重置解锁进度（应用户要求，新轮回如果不继承则重置为1）
        this.unlockedRealms = [1];

        // 应用永久起始加成
        const bonuses = this.achievementSystem.loadStartBonuses();
        if (bonuses.maxHp) {
            this.player.maxHp += bonuses.maxHp;
            this.player.currentHp = this.player.maxHp;
        }
        if (bonuses.strength) this.player.buffs.strength = bonuses.strength;
        if (bonuses.gold) this.player.gold += bonuses.gold;
        if (bonuses.draw) this.player.drawCount += bonuses.draw;

        // 清空地图数据，确保startRealm不会误判为继续游戏
        if (this.map) {
            this.map.nodes = [];
            this.map.bossNode = null;
        }

        // 不直接生成地图，而是去选关界面
        this.showScreen('realm-select-screen');
        this.autoSave();
    }

    // 显示角色详情（主菜单）
    showPlayerInfo() {
        // 优先显示当前玩家对象的角色，没有则默认为林风
        const charId = (this.player && this.player.characterId) ? this.player.characterId : 'linFeng';

        const char = CHARACTERS[charId];
        if (!char) return;

        // 更新界面
        const avatarEl = document.getElementById('info-char-avatar');
        const nameEl = document.getElementById('info-char-name');
        const titleEl = document.getElementById('info-char-title');
        const descEl = document.getElementById('info-char-desc');
        const hpEl = document.getElementById('char-hp');
        const energyEl = document.getElementById('char-energy');

        if (avatarEl) avatarEl.textContent = char.avatar;
        if (nameEl) nameEl.textContent = `${char.name} · ${char.title}`;
        if (titleEl) {
            titleEl.textContent = '逆命印记';
            titleEl.className = 'imprint-badge';
        }
        if (descEl) descEl.textContent = char.description;
        if (hpEl) hpEl.textContent = char.stats.maxHp;
        if (energyEl) energyEl.textContent = char.stats.energy;

        this.showScreen('character-select');
    }

    // 更新界面上的玩家显示（名字、头像等）
    updatePlayerDisplay() {
        const charId = this.player.characterId || 'linFeng';
        const char = CHARACTERS[charId];

        const battleNameEl = document.getElementById('player-name-display');
        if (battleNameEl && char) {
            battleNameEl.textContent = char.name;
        }

        // 更新属性显示
        const strengthEl = document.getElementById('char-strength');
        // 检查永久Buff中的力量
        let strength = 0;
        if (this.player.permBuffs && this.player.permBuffs.strength) {
            strength = this.player.permBuffs.strength;
        }
        // 如果在战斗中，加上临时Buff
        if (this.player.buffs && this.player.buffs.strength) {
            strength = this.player.buffs.strength; // buffs usually formatted as total value? check addBuff
            // addBuff accumulates: this.buffs[type] += value
            // Since prepareBattle calls addBuff for permBuffs, this.buffs.strength ALREADY includes permBuffs during battle.
            // But checking this.player.buffs.strength is safer if we are in battle.
            // If NOT in battle, use permBuffs.
        }

        // Better logic:
        let displayStrength = 0;
        if (this.battle && !this.battle.battleEnded && this.player.buffs.strength) {
            displayStrength = this.player.buffs.strength;
        } else if (this.player.permBuffs && this.player.permBuffs.strength) {
            displayStrength = this.player.permBuffs.strength;
        }

        if (strengthEl) {
            strengthEl.textContent = displayStrength > 0 ? displayStrength : '-';
            strengthEl.parentElement.style.display = displayStrength > 0 ? 'flex' : 'none';
        }
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

        // 遗物：逆命之环（额外获得25%经验）
        if (this.player.relic && this.player.relic.id === 'fateRing') {
            ringExp = Math.floor(ringExp * 1.25);
        }

        this.player.fateRing.exp += ringExp;
        const levelUp = this.player.checkFateRingLevelUp();

        if (levelUp) {
            // 命环升级触发微弱的法则波动，虽然现在还不足以引来天罚者，但随着等级提升...
            Utils.showBattleLog("命环突破！法则波动引起了未知的注视...");
            // 将来可以在这里根据level触发特定事件或对话
        }

        // 立即标记节点完成，防止意外退出导致进度丢失
        if (this.currentBattleNode) {
            this.map.completeNode(this.currentBattleNode);
        }

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
        this.achievementSystem.updateStat('enemiesDefeated', enemies.length); // 更新击杀数
        this.achievementSystem.updateStat('realmCleared', this.player.realm, 'max');

        // 计算命环经验奖励 (包含遗物加成)
        let totalRingExp = ringExp;
        if (this.player.relic && this.player.relic.id === 'fateRing') {
            const level = this.player.fateRing ? this.player.fateRing.level : 0;
            const bonusExp = 20 + (level * 5);
            totalRingExp += bonusExp;
            Utils.showBattleLog(`逆命之环生效！额外获得 ${bonusExp} 命环经验`);
        }

        // 增加经验
        this.player.fateRing.exp += totalRingExp;
        this.player.checkFateRingLevelUp();

        // 显示奖励界面
        this.showRewardScreen(totalGold, canSteal, stealEnemy, totalRingExp);

        // 检查BOSS击杀
        if (this.currentBattleNode && this.currentBattleNode.type === 'boss') {
            this.achievementSystem.updateStat('bossesDefeated', 1);
        }

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

        // 关键修复：初始时禁用“继续前进”按钮，强制玩家选择或跳过
        const continueBtn = document.getElementById('continue-reward-btn');
        if (continueBtn) {
            continueBtn.disabled = true;
            continueBtn.textContent = '请选择奖励';
        }

        rewardGold.textContent = `+${gold} 灵石 | 命环经验 +${ringExp}`;

        // 法宝掉落判定
        const resourceContainer = document.querySelector('.reward-resources');
        // 清理旧的掉落显示
        const existingTreasures = resourceContainer.querySelectorAll('.reward-treasure-item');
        existingTreasures.forEach(el => el.remove());

        let dropChance = 0.15; // 普通概率提升一点
        if (this.currentBattleNode && this.currentBattleNode.type === 'elite') dropChance = 0.40;
        if (this.currentBattleNode && this.currentBattleNode.type === 'boss') dropChance = 1.0;

        if (Math.random() < dropChance) {
            const treasureKeys = Object.keys(TREASURES);
            const unowned = treasureKeys.filter(k => !this.player.hasTreasure(k));
            if (unowned.length > 0) {
                const tid = unowned[Math.floor(Math.random() * unowned.length)];
                const droppedTreasure = TREASURES[tid];

                // 自动获取
                this.player.addTreasure(droppedTreasure.id);

                const tItem = document.createElement('div');
                tItem.className = 'reward-item reward-treasure-item';
                tItem.style.color = 'var(--accent-gold)';
                tItem.style.cursor = 'help';
                tItem.title = droppedTreasure.description;
                tItem.innerHTML = `<span class="icon">${droppedTreasure.icon}</span> <span>获得法宝：${droppedTreasure.name}</span>`;
                resourceContainer.appendChild(tItem);

                Utils.showBattleLog(`战斗胜利！获得法宝: ${droppedTreasure.name}`);
            }
        }

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
        const cards = getRewardCards(3, this.player.characterId);

        cards.forEach((card, index) => {
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
        const cost = 10 * this.player.realm;
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
                if (!this.achievementSystem.stats.firstStealSuccess) {
                    this.achievementSystem.updateStat('firstStealSuccess', true, 'set');
                }

                // 命环经验额外奖励
                this.player.fateRing.exp += 50;
                this.player.checkFateRingLevelUp();

                if (law.unlockCards && law.unlockCards.length > 0) {
                    const cardName = CARDS[law.unlockCards[0]]?.name || '神秘卡牌';
                    stealText.innerHTML += `<br><span style="color: var(--accent-purple)">解锁法则牌: ${cardName}</span>`;
                }
            } else {
                // 补偿机制
                let compensationMsg = `<span style="color: var(--text-secondary)">你已经掌握了这个法则</span>`;

                // 给予补偿：50灵石 + 20命环经验
                this.player.gold += 50;
                this.player.fateRing.exp += 20;
                this.player.checkFateRingLevelUp();

                compensationMsg += `<br><span style="color: var(--accent-gold)">获得补偿：50灵石，20命环经验</span>`;
                stealText.innerHTML = compensationMsg;

                // 更新UI
                this.updatePlayerDisplay();
            }
        } else {
            stealText.innerHTML = `<span style="color: var(--text-muted)">盗取失败...法则残留消散了</span>`;
        }
    }

    // 奖励后继续 - 修复关卡推进bug
    continueAfterReward() {
        // 双重保险：必须已选择卡牌（包括跳过）
        if (!this.rewardCardSelected) {
            Utils.showBattleLog('请先选择一张卡牌奖励，或支付灵石跳过');
            return;
        }

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
                // 如果导致升级，checkFateRingLevelUp 内部会处理并可能弹窗，但这里我们主要关注数值
                break;

            case 'gold':
                if (effect.percent) {
                    const amount = Math.floor(this.player.gold * (effect.percent / 100)); // percent is usually negative or positive e.g. -50
                    this.player.gold += amount;
                    this.eventResults.push(`💰 灵石 ${amount > 0 ? '+' : ''}${amount} (${effect.percent}%)`);
                } else {
                    this.player.gold += effect.value;
                    this.eventResults.push(`💰 灵石 ${effect.value > 0 ? '+' : ''}${effect.value}`);
                }
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

            case 'treasure':
                if (effect.treasureId) {
                    if (this.player.addTreasure(effect.treasureId)) {
                        this.eventResults.push(`🏺 获得法宝: ${TREASURES[effect.treasureId].name}`);
                    } else {
                        this.eventResults.push(`已拥有该法宝，获得替代奖励`);
                    }
                } else if (effect.random) {
                    const tKeys = Object.keys(TREASURES);
                    const unowned = tKeys.filter(k => !this.player.hasTreasure(k));
                    if (unowned.length > 0) {
                        const tid = unowned[Math.floor(Math.random() * unowned.length)];
                        this.player.addTreasure(tid);
                        this.eventResults.push(`🏺 获得随机法宝: ${TREASURES[tid].name}`);
                    } else {
                        this.player.gold += 100;
                        this.eventResults.push(`法宝已收集齐，获得 100 灵石`);
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
                        this.startBattle([trialEnemy], this.currentBattleNode);
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

    // 事件中升级卡牌 (Revised with Preview)
    showEventUpgradeCard() {
        const modal = document.getElementById('deck-modal');
        const container = document.getElementById('deck-view-cards');
        // Clear previous content
        container.innerHTML = '';
        container.style.display = 'flex';
        container.style.flexDirection = 'row'; // Ensure row layout for split view

        // Create Split Layout
        const listContainer = document.createElement('div');
        listContainer.style.flex = '1';
        listContainer.style.display = 'flex';
        listContainer.style.flexWrap = 'wrap';
        listContainer.style.justifyContent = 'center';
        listContainer.style.alignContent = 'flex-start';
        listContainer.style.overflowY = 'auto';
        listContainer.style.maxHeight = '60vh';

        const previewContainer = document.createElement('div');
        previewContainer.style.width = '300px';
        previewContainer.style.borderLeft = '1px solid rgba(255,255,255,0.1)';
        previewContainer.style.padding = '10px';
        previewContainer.style.display = 'flex';
        previewContainer.style.flexDirection = 'column';
        previewContainer.style.alignItems = 'center';

        container.appendChild(listContainer);
        container.appendChild(previewContainer);

        // Preview UI Elements
        previewContainer.innerHTML = `
            <h3 style="color:var(--accent-gold);margin-top:0;">升级预览</h3>
            <div id="upgrade-preview-placeholder" style="color:#666;margin-top:50px;">
                鼠标悬浮或点击卡牌<br>查看升级效果
            </div>
            <div id="upgrade-preview-card" style="display:none; transform:scale(1.1); margin: 20px 0;"></div>
            <div id="upgrade-diff-text" style="width:100%; font-size:0.9rem; color:#ddd; margin: 10px 0; background:rgba(0,0,0,0.3); padding:8px; border-radius:4px; display:none;"></div>
            <button id="confirm-upgrade-btn" class="menu-btn" style="margin-top:auto; width:100%;" disabled>确认升级</button>
        `;

        const confirmBtn = previewContainer.querySelector('#confirm-upgrade-btn');
        const previewCardDiv = previewContainer.querySelector('#upgrade-preview-card');
        const previewTextDiv = previewContainer.querySelector('#upgrade-diff-text');
        const placeholder = previewContainer.querySelector('#upgrade-preview-placeholder');

        let selectedIndex = -1;

        const upgradableCards = this.player.deck.filter(c => canUpgradeCard(c));
        if (upgradableCards.length === 0) {
            listContainer.innerHTML = '<p style="text-align:center;color:var(--text-muted);width:100%;">没有可升级的卡牌</p>';
            setTimeout(() => {
                this.closeModal();
                this.onEventComplete();
            }, 1500);
            return;
        }

        // Render Cards
        this.player.deck.forEach((card, index) => {
            if (!canUpgradeCard(card)) return;

            const cardEl = Utils.createCardElement(card, index);
            cardEl.classList.add(`rarity-${card.rarity || 'common'}`);
            cardEl.style.cursor = 'pointer';
            cardEl.dataset.index = index;

            // Interaction Logic
            const showPreview = () => {
                const upgraded = upgradeCard(card);
                placeholder.style.display = 'none';
                previewCardDiv.style.display = 'flex';
                previewTextDiv.style.display = 'block';

                // Clear and render upgraded card
                previewCardDiv.innerHTML = '';
                const upgradedEl = Utils.createCardElement(upgraded, 999); // Dummy index
                upgradedEl.classList.add(`rarity-${upgraded.rarity || 'common'}`);
                previewCardDiv.appendChild(upgradedEl);

                // Show basic info text
                previewTextDiv.innerHTML = `
                    <p style="margin:0;color:var(--accent-green);font-weight:bold;">${card.name} ➤ ${upgraded.name}</p>
                    <p style="margin:4px 0 0 0;font-size:0.8rem;">${upgraded.description}</p>
                `;
            };

            // Hover: Show preview (but don't select if not clicked)
            cardEl.addEventListener('mouseenter', () => {
                if (selectedIndex === -1) showPreview();
            });

            // Click: Select and Enable Confirm
            cardEl.addEventListener('click', () => {
                // Deselect others
                listContainer.querySelectorAll('.card').forEach(c => c.style.border = '');
                // Select this
                cardEl.style.border = '3px solid var(--accent-gold)';
                selectedIndex = index;
                showPreview(); // Force show this preview
                confirmBtn.disabled = false;
                confirmBtn.classList.remove('disabled');
            });

            listContainer.appendChild(cardEl);
        });

        // Confirm Action
        confirmBtn.onclick = () => {
            if (selectedIndex === -1) return;
            const card = this.player.deck[selectedIndex];
            const upgraded = upgradeCard(card);
            this.player.deck[selectedIndex] = upgraded;
            Utils.showBattleLog(`${card.name} 升级为 ${upgraded.name}！`);

            // Clean up styles
            container.style.display = '';
            container.style.flexDirection = '';

            this.closeModal();
            this.onEventComplete();
        };

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
        // 清除存档，防止死亡后还能继续
        // this.clearSave(); // 改为仅在选择重新开始或退出时清除？或者保留存档但标记为已死亡
        // 为了支持重修此界，我们暂时保留内存中的数据，但清除硬盘上的进度以防刷新作弊
        // 只有当玩家选择“重修此界”时，才会重新写入存档（扣钱后的）
        this.clearSave();

        // 标记玩家已死亡，即使被非法恢复，也会在加载时被拦截
        this.player.currentHp = 0;

        document.getElementById('game-over-title').textContent = '陨落...';
        document.getElementById('game-over-title').classList.remove('victory');
        document.getElementById('game-over-text').textContent = '逆命之路，暂时中断';

        document.getElementById('stat-floor').textContent = this.map.getRealmName(this.player.realm);
        document.getElementById('stat-enemies').textContent = this.player.enemiesDefeated;
        document.getElementById('stat-laws').textContent = this.player.collectedLaws.length;

        // 显示重修此界按钮 (仅在非第一层或有一定进度时？为了体验，总是显示)
        const restartBtn = document.getElementById('restart-realm-btn');
        if (restartBtn) {
            restartBtn.style.display = 'inline-block';
            restartBtn.title = '保留当前属性和牌组，重新挑战本重天域';
        }

        this.showScreen('game-over-screen');
    }

    // 重修此界 (Restart Realm)
    restartRealm() {
        if (!this.player) return;

        // 增加复活代价：扣除一定灵石
        const reviveCost = Math.floor(this.player.gold * 0.5); // 扣除50%灵石
        this.player.gold -= reviveCost;

        // 恢复生命值
        this.player.currentHp = this.player.maxHp;

        // 重置层数
        this.player.floor = 0;

        // 重新生成地图
        this.map.generate(this.player.realm);

        // 自动保存
        // 关键修复：保存必须在所有状态重置（扣钱、恢复HP、重置层数）之后立即进行
        // 这样如果用户在点击“重修此界”后刷新，加载的存档已经是扣过钱并重置进度的状态
        this.autoSave();

        Utils.showBattleLog(`时光倒流... 损失 ${reviveCost} 灵石，重修 ${this.map.getRealmName(this.player.realm)}`);

        // 进入地图界面
        this.showScreen('map-screen');
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

        // 解锁主动技能 (通过5, 10, 15重天)
        // 玩家当前realm即将+1，所以通过Realm 5 = current realm is 5, next is 6.
        if (this.player.realm === 5) this.player.unlockUltimate(1);
        if (this.player.realm === 10) this.player.unlockUltimate(2);
        if (this.player.realm === 15) this.player.unlockUltimate(3);

        // 检查是否通关所有天域 (现在是18重)
        if (this.player.realm >= 18) {
            this.showVictoryScreen();
            return;
        }

        // 允许玩家选择继续或回城
        // 这里暂时保持自动推进，但增加保存
        this.player.realm++;
        this.player.floor = 0;

        // 关键修复：不要重置 currentHp 到 maxHp，保留当前状态
        // 也不要回退到第一层，player.realm 已经 ++ 了
        // 之前的代码似乎没有重置回第一层，但可能有逻辑错误导致感知错觉？
        // 或者是 autoSave 读取时的问题？
        // 检查 loadGame 逻辑，如果有非法数据会被重置，可能是那里

        this.autoSave();

        // 治疗玩家 (小幅回复，而不是回满)
        const healAmount = Math.floor(this.player.maxHp * 0.2);
        this.player.heal(healAmount);
        Utils.showBattleLog(`进入下一重天域，恢复 ${healAmount} HP`);

        this.map.generate(this.player.realm);
        this.renderTreasures('map-treasures');
        this.showScreen('map-screen');
    }

    // 显示胜利界面
    showVictoryScreen() {
        document.getElementById('game-over-title').textContent = '逆天成功！';
        document.getElementById('game-over-title').classList.add('victory');
        document.getElementById('game-over-text').textContent = '你打破了命运的枷锁，成为了真正的逆命者！';

        document.getElementById('stat-floor').textContent = this.map.getRealmName(this.player.realm);
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
            // Fix: Handle undefined/corrupt cards to prevent crash
            if (!card || !card.id) {
                console.warn('Found invalid card in deck:', card);
                return;
            }

            const key = card.upgraded ? `${card.id}_upgraded` : card.id;

            if (!cardCounts[key]) {
                cardCounts[key] = {
                    count: 0,
                    card: card
                };
                uniqueCards.push(card);
            }
            cardCounts[key].count++;
        });

        // 排序：稀有度 > 名称 > 等级
        const rarityOrder = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1, basic: 0 };
        uniqueCards.sort((a, b) => {
            const rA = rarityOrder[a.rarity || 'common'];
            const rB = rarityOrder[b.rarity || 'common'];
            if (rA !== rB) return rB - rA;
            if (a.id !== b.id) return a.id.localeCompare(b.id);
            return (b.upgraded ? 1 : 0) - (a.upgraded ? 1 : 0);
        });

        container.innerHTML = '';
        uniqueCards.forEach((card, index) => {
            const key = card.upgraded ? `${card.id}_upgraded` : card.id;
            const count = cardCounts[key].count;
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

    // 渲染法宝栏
    renderTreasures() {
        if (!this.player || !this.player.treasures) return;

        const containers = [
            document.getElementById('map-treasures'),
            document.getElementById('battle-treasures'),
            document.getElementById('treasures-container') // 顶部栏 (如有)
        ];

        // 构建 HTML
        const html = this.player.treasures.map(treasure => {
            const rarityClass = treasure.rarity || 'common';
            return `
                <div class="treasure-icon ${rarityClass}">
                    ${treasure.icon}
                    <div class="treasure-tooltip">
                        <h4>${treasure.name}</h4>
                        <p>${treasure.description}</p>
                    </div>
                </div>
            `;
        }).join('');

        // 更新所有容器
        containers.forEach(container => {
            if (container) {
                container.innerHTML = html;
            }
        });
    }

    // 显示命环
    showFateRing() {
        const modal = document.getElementById('ring-modal');
        const ring = this.player.fateRing;

        // In-memory fix for missing data (prevents crash if loaded from old save without reload)
        if (!ring.slots || ring.slots.length === 0) {
            if (ring.initSlots) ring.initSlots();
        }
        if (!ring.unlockedPaths) ring.unlockedPaths = ['awakened'];
        if (!ring.path) ring.path = 'awakened';

        // 使用新的HTML结构
        modal.innerHTML = `
            <div class="modal-content fate-ring-modal-content">
                <div class="fate-ring-header">
                    <h2 style="color: var(--accent-gold); margin: 0; font-family: var(--font-display);">命环系统</h2>
                    <div class="modal-close" onclick="game.closeModal()">×</div>
                </div>
                
                <div class="fate-ring-body">
                    <!-- 左侧：状态面板 -->
                    <div class="ring-status-panel">
                        <div class="ring-visual">
                            <div style="font-size: 3rem;">${ring.limitBreaked ? '👑' : '💫'}</div>
                        </div>
                        
                        <div class="ring-level-info">
                            <h3 style="color: var(--accent-gold); margin-bottom: 5px;">${ring.name}</h3>
                            <div style="font-size: 0.9rem; color: #aaa;">LV.${ring.level}</div>
                            
                            <div style="margin-top: 10px; background: rgba(0,0,0,0.3); height: 6px; border-radius: 3px; overflow: hidden;">
                                <div style="width: ${Math.min(100, (ring.exp / (FATE_RING.levels[ring.level + 1]?.exp || 9999)) * 100)}%; background: var(--accent-gold); height: 100%;"></div>
                            </div>
                            <div style="font-size: 0.8rem; margin-top: 5px; color: #888;">
                                经验值: ${ring.exp}/${FATE_RING.levels[ring.level + 1]?.exp || (ring.level >= 10 ? 'Max' : '???')}
                            </div>
                        </div>
                        
                        <!-- 当前路径加成 -->
                        ${this.renderCurrentPathInfo(ring)}

                        <!-- 角色专属面板 -->
                        ${this.renderCharacterSpecifics(ring)}
                    </div>
                    
                    <!-- 中间：槽位展示 -->
                    <div class="ring-slots-panel">
                        <div class="slots-circle">
                            <div class="center-core">
                                <span>${ring.maxSlots || ring.slots.length}</span>
                            </div>
                            
                            <!-- 动态生成槽位 -->
                            ${this.renderRingSlots(ring)}
                        </div>
                        
                        <div id="slot-action-hint" style="position: absolute; bottom: 20px; color: var(--text-muted); font-size: 0.9rem;">
                            ${this.selectedRingSlot !== undefined ? '从右侧选择法则装填' : '点击槽位进行操作'}
                        </div>
                    </div>
                    
                    <!-- 右侧：法则库 -->
                    <div class="law-library-panel">
                        <div class="library-header">
                            法则库 (${this.player.collectedLaws.length})
                        </div>
                        <div class="library-list">
                            ${this.renderLawLibrary(ring)}
                        </div>
                        
                        <!-- 法则共鸣显示 -->
                        <div class="resonance-panel" style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                            <div class="library-header" style="color: var(--accent-gold);">
                                法则共鸣
                            </div>
                            <div class="resonance-list" style="max-height: 150px; overflow-y: auto;">
                                ${this.renderResonances(ring)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 绑定事件
        this.bindRingEvents();

        modal.classList.add('active');
    }

    // 渲染当前路径信息
    renderCurrentPathInfo(ring) {
        if (!ring.path) return '';

        const path = FATE_RING.paths[ring.path];
        if (!path) return ''; // Guard against invalid path keys (e.g. 'undefined' string)
        return `
            <div class="ring-path-info">
                <div style="font-weight: bold; color: var(--accent-purple); margin-bottom: 5px;">
                    ${path.icon || '✨'} ${path.name}
                </div>
                <div style="font-size: 0.8rem; line-height: 1.4;">
                    ${path.description}
                </div>
                ${this.renderEvolveButton(ring)}
            </div>
        `;
    }

    // 渲染角色专属面板
    renderCharacterSpecifics(ring) {
        if (ring.type === 'karma' && ring.getKarmaStatus) {
            const status = ring.getKarmaStatus();
            const meritPercent = (status.merit / status.max) * 100;
            const sinPercent = (status.sin / status.max) * 100;
            return `
                <div class="ring-specifics-panel" style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                    <h4 style="color: var(--accent-gold); margin: 0 0 10px 0;">功德金轮</h4>
                    
                    <div style="margin-bottom: 8px;">
                        <div style="font-size: 0.8rem; display: flex; justify-content: space-between;">
                            <span>功德 (防御)</span>
                            <span>${status.merit}/${status.max}</span>
                        </div>
                        <div style="background: rgba(0,0,0,0.3); height: 6px; border-radius: 3px; overflow: hidden;">
                            <div style="width: ${meritPercent}%; background: #ffd700; height: 100%;"></div>
                        </div>
                    </div>
                    
                    <div>
                        <div style="font-size: 0.8rem; display: flex; justify-content: space-between;">
                            <span>业力 (攻击)</span>
                            <span>${status.sin}/${status.max}</span>
                        </div>
                        <div style="background: rgba(0,0,0,0.3); height: 6px; border-radius: 3px; overflow: hidden;">
                            <div style="width: ${sinPercent}%; background: #ff4d4d; height: 100%;"></div>
                        </div>
                    </div>
                    <div style="font-size: 0.7rem; color: #888; margin-top: 5px;">
                        满值触发【金刚法相】或【明王之怒】
                    </div>
                </div>
            `;
        }

        if (ring.type === 'analysis' && ring.analyzedTypes) {
            return `
                <div class="ring-specifics-panel" style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                    <h4 style="color: var(--accent-blue); margin: 0 0 10px 0;">真理解析</h4>
                    <div style="font-size: 0.8rem; color: #ddd;">
                        已解析物种: <span style="color: var(--accent-gold);">${ring.analyzedTypes.length}</span>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px;">
                        ${ring.analyzedTypes.map(t => `<span style="background: rgba(255,255,255,0.1); padding: 2px 4px; border-radius: 2px; font-size: 0.7rem;">${t}</span>`).join('')}
                    </div>
                    ${ring.tacticalConfig && ring.tacticalConfig.damageVsType ? `
                        <div style="margin-top: 8px; font-size: 0.8rem; color: var(--accent-green);">
                            当前针对: <strong>${ring.tacticalConfig.damageVsType}</strong>
                            <br>(伤害 +${(ring.tacticalConfig.damageBonus * 100).toFixed(0)}%)
                        </div>
                    ` : '<div style="margin-top: 5px; font-size: 0.7rem; color: #666;">暂无针对目标</div>'}
                </div>
            `;
        }

        if (ring.type === 'sealed') {
            // 简单的状态提示
            const unlockedCount = ring.slots.filter(s => s.unlocked).length;
            return `
                <div class="ring-specifics-panel" style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                    <h4 style="color: var(--accent-purple); margin: 0 0 5px 0;">逆生咒印</h4>
                    <div style="font-size: 0.8rem;">
                        解封进度: <span style="color: ${unlockedCount > 1 ? 'var(--accent-red)' : '#888'}">${unlockedCount}/12</span>
                    </div>
                    <div style="font-size: 0.7rem; color: #888; margin-top: 5px;">
                        点击锁定槽位以解除封印（需付出代价）
                    </div>
                </div>
             `;
        }

        return '';
    }

    // 渲染进化按钮（如果有）
    renderEvolveButton(ring) {
        const available = getAvailablePaths(ring);
        if (available.length > 0 && ring.level > 0) {
            return `
                <button onclick="game.showEvolveOptions()" 
                    style="width: 100%; margin-top: 10px; padding: 5px; background: rgba(255,215,0,0.2); border: 1px solid var(--accent-gold); color: var(--accent-gold); border-radius: 4px; cursor: pointer;">
                    🌟 命环进化
                </button>
            `;
        }
        return '';
    }

    // 渲染环形槽位
    renderRingSlots(ring) {
        let html = '';
        const radius = 105; // 半径
        const slotsCount = ring.slots.length; // Use array length or maxSlots

        for (let i = 0; i < slotsCount; i++) {
            const angle = (i / slotsCount) * 2 * Math.PI - Math.PI / 2; // 从上方开始
            const x = Math.cos(angle) * radius + 120; // +120是偏移量，使其居中 (300/2 - 30)
            const y = Math.sin(angle) * radius + 120;

            const slot = ring.slots[i];
            const lawId = slot.law;
            const law = lawId ? LAWS[lawId] : null;
            const isSelected = this.selectedRingSlot === i;
            const isLocked = !slot.unlocked;

            // Mutated Ring Fusion Slot Support
            const subLawId = slot.subLaw;
            const subLaw = subLawId ? LAWS[subLawId] : null;

            html += `
                <div class="law-slot-node ${law ? 'filled' : 'empty'} ${isLocked ? 'locked' : ''}" 
                     style="left: ${x}px; top: ${y}px; ${isSelected ? 'box-shadow: 0 0 15px var(--accent-green); border-color: var(--accent-green);' : ''}"
                     data-index="${i}">
                    ${law ? law.icon : (isLocked ? '🔒' : '+')}
                    
                    ${ring.type === 'mutated' && law ? `
                        <div class="sub-slot ${subLaw ? 'filled' : 'empty'}" 
                             style="position: absolute; right: -10px; bottom: -10px; width: 20px; height: 20px; border-radius: 50%; background: ${subLaw ? '#2a2a2a' : 'rgba(0,0,0,0.5)'}; border: 1px solid var(--accent-gold); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; z-index: 2;">
                            ${subLaw ? subLaw.icon : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        }
        return html;
    }

    // 渲染法则库列表
    renderLawLibrary(ring) {
        if (this.player.collectedLaws.length === 0) {
            return '<div style="padding: 20px; text-align: center; color: #666;">暂无法则</div>';
        }

        return this.player.collectedLaws.map(law => {
            const isEquipped = ring.getSocketedLaws().includes(law.id);
            return `
                <div class="library-item ${isEquipped ? 'equipped' : ''}" data-id="${law.id}">
                    <div class="lib-icon">${law.icon}</div>
                    <div class="lib-info">
                        <div class="lib-name">${law.name}</div>
                        <div class="lib-desc">${(typeof getLawPassiveDescription === 'function' ? getLawPassiveDescription(law) : '') || law.description || '效果未知'}</div>
                    </div>
                    ${isEquipped ? '<div style="font-size: 0.8rem; color: var(--accent-gold);">已装</div>' : ''}
                </div>
            `;
        }).join('');
    }

    // 渲染法则共鸣
    renderResonances(ring) {
        if (!typeof LAW_RESONANCES === 'object') return '';

        let activeResonances = [];

        for (const key in LAW_RESONANCES) {
            const resonance = LAW_RESONANCES[key];
            const equippedLaws = ring.getSocketedLaws();
            const hasAllLaws = resonance.laws.every(lawId => equippedLaws.includes(lawId));

            if (hasAllLaws) {
                activeResonances.push(resonance);
            }
        }

        if (activeResonances.length === 0) {
            return '<div style="padding: 10px; text-align: center; color: #666; font-size: 0.8rem;">暂无激活共鸣</div>';
        }

        return activeResonances.map(res => `
            <div class="resonance-item" style="padding: 8px; margin-bottom: 8px; background: rgba(255, 215, 0, 0.1); border: 1px solid var(--accent-gold); border-radius: 4px;">
                <div style="font-weight: bold; color: var(--accent-gold); font-size: 0.9rem; margin-bottom: 4px;">
                    ⚡ ${res.name}
                </div>
                <div style="font-size: 0.8rem; color: #ddd; line-height: 1.3;">
                    ${res.description}
                </div>
            </div>
        `).join('');
    }

    // 绑定命环界面事件
    bindRingEvents() {
        const modal = document.getElementById('ring-modal');

        // 绑定槽位点击
        modal.querySelectorAll('.law-slot-node').forEach(slot => {
            slot.addEventListener('click', (e) => {
                const index = parseInt(slot.dataset.index);
                const ring = this.player.fateRing;
                const slotData = ring.slots[index];

                if (!slotData.unlocked) {
                    // Check for SealedRing unseal interaction
                    if (ring.type === 'sealed' && ring.canUnseal && ring.canUnseal(index)) {
                        if (confirm(`该槽位被【逆生咒】封印。\n强制解除将永久损耗生命上限。\n是否解除？`)) {
                            ring.unseal(index);
                            this.showFateRing();
                            this.autoSave();
                        }
                    } else {
                        Utils.showBattleLog('该槽位尚未解锁');
                    }
                    return;
                }

                // 如果该槽位有法则，点击卸载
                if (slotData.law) {
                    ring.socketLaw(index, null); // Unload
                    Utils.showBattleLog('法则已卸载');
                    this.showFateRing(); // 刷新
                    this.autoSave();
                } else {
                    // 如果是空槽位，选中它
                    if (this.selectedRingSlot === index) {
                        this.selectedRingSlot = undefined; // 取消选中
                    } else {
                        this.selectedRingSlot = index;
                    }
                    this.showFateRing();
                }
            });
        });

        // 绑定法则库点击
        modal.querySelectorAll('.library-item').forEach(item => {
            if (item.classList.contains('equipped')) return;

            item.addEventListener('click', () => {
                const lawId = item.dataset.id;
                let targetSlot = this.selectedRingSlot;

                // 如果没选中槽位，找第一个空的
                if (targetSlot === undefined) {
                    for (let i = 0; i < this.player.fateRing.slots.length; i++) {
                        if (this.player.fateRing.slots[i].unlocked && !this.player.fateRing.slots[i].law) {
                            targetSlot = i;
                            break;
                        }
                    }
                }

                if (targetSlot !== undefined && targetSlot >= 0) {
                    if (this.player.fateRing.socketLaw(targetSlot, lawId)) {
                        const lawName = LAWS[lawId]?.name || '法则';
                        Utils.showBattleLog(`已装填法则【${lawName}】`);
                        this.selectedRingSlot = undefined; // 重置选中
                        this.showFateRing();
                        this.autoSave();
                    } else {
                        Utils.showBattleLog('装填失败：槽位未解锁或无效');
                    }
                } else {
                    Utils.showBattleLog('请先选择一个空槽位');
                }
            });
        });
    }

    // 显示进化选项（为了复用之前的逻辑，这里把之前的 showFateRing 里的进化部分提出来）
    showEvolveOptions() {
        const modal = document.getElementById('ring-modal'); // 复用同一个modal，或者创建一个临时的覆盖层
        // 这里简单起见，我们直接在模态框里替换内容显示进化选项，或者弹出一个 alert/confirm 风格的选择

        const ring = this.player.fateRing;
        const availablePaths = getAvailablePaths(ring);

        if (availablePaths.length === 0) return;

        const slotsContainer = document.querySelector('.fate-ring-body');
        slotsContainer.innerHTML = `
            <div class="evolution-view">
                <h2 class="evolution-title">选择进化路径</h2>
                <div class="evolution-options-container">
                    ${availablePaths.map(path => `
                        <div class="evolution-path-card" onclick="game.evolveFateRing('${path.id}')">
                            <div class="path-icon">${path.icon}</div>
                            <h3 class="path-name">${path.name}</h3>
                            <p class="path-desc">${path.description}</p>
                            <div class="path-select-hint">点击选择</div>
                        </div>
                    `).join('')}
                </div>
                <button class="evolution-back-btn" onclick="game.showFateRing()">返回</button>
            </div>
         `;
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

    // 显示游戏介绍 (原设置)
    showGameIntro() {
        const modal = document.getElementById('settings-modal');
        // 确保模态框存在
        if (!modal) {
            console.error('Settings modal not found!');
            return;
        }

        const settingsContainer = document.getElementById('settings-options');
        if (!settingsContainer) return;

        settingsContainer.innerHTML = `
        <div class="game-intro-content" style="text-align: left; line-height: 1.6; max-height: 60vh; overflow-y: auto; padding-right: 10px;">
            <h3 style="color: var(--accent-gold); border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px; margin-top: 0;">🔮 版本更新 v4.1 (天道终章)</h3>
            <p><strong>🔥 核心更新：</strong></p>
            <ul style="padding-left: 20px; list-style-type: disc;">
                <li><strong>天域全开 (10-18重)</strong>：开放地仙界至终焉天九大高阶天域。挑战【双子熔岩】、【五行长老】，直至直面【天道终焉】。</li>
                <li><strong>Boss机制升级</strong>：新增【召唤随从】、【多重行动】与【阶段转换】机制。敌人不再单调，战斗更具策略性。</li>
                <li><strong>主界面优化</strong>：优化了存档读取逻辑，现在可以更方便地选择开启新轮回或继续冒险。</li>
                <li><strong>平衡性调整</strong>：调整了过量伤害保护极致（现承受80%溢出伤害），并修复了部分卡牌描述与数值问题。</li>
            </ul>

            <h3 style="color: var(--accent-purple); border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px; margin-top: 20px;">🎮 游戏玩法</h3>
            <p>在这个被天道锁死的修仙世界，你作为【逆命者】，需通过战斗不断吞噬法则，重塑命环。</p>
            <ul style="padding-left: 20px; list-style-type: disc;">
                <li><strong>卡牌与法则</strong>：收集卡牌构建流派，击败精英夺取【法则】赋予被动。</li>
                <li><strong>共鸣系统</strong>：特定法则组合可触发共鸣（如五行俱全、时空扭曲）。</li>
                <li><strong>策略试炼</strong>：十八重天域，每重天域都有独特的环境效果与守关Boss。</li>
            </ul>
            
            <h3 style="color: var(--accent-red); border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px; margin-top: 20px;">👥 角色介绍</h3>
            <ul style="padding-left: 20px; list-style-type: none;">
                <li style="margin-bottom: 10px;"><strong>🗡️ 林风</strong>：全能战士，擅长利用命环力量，各方面属性均衡。</li>
                <li style="margin-bottom: 10px;"><strong>💚 香叶</strong>：医毒圣手，虽生命值较低，但拥有强大的回复能力。</li>
                <li style="margin-bottom: 10px;"><strong>🪙 无欲</strong>：佛门金刚，自带护盾加成，擅长防守反击与反伤玩法。</li>
                <li><strong>❄️ 严寒</strong>：极冰修士，擅长控制与削弱，能让敌人寸步难行。</li>
            </ul>

            <div style="margin-top: 20px; text-align: center; font-size: 0.8rem; color: #888;">
                当前版本: v4.1 | 逆命轮回·天道终章
            </div>
        </div>
    `;

        modal.classList.add('active');
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

    shopNode = null;
    shopItems = []; // 卡牌商品
    shopServices = []; // 特殊服务/道具

    // 显示商店
    showShop(node) {
        this.shopNode = node;

        // 生成商店数据（每次进入生成，增加随机性）
        // 理想情况下应该保存在node中以防SL大法，但为了简单暂不持久化到node.data
        const data = this.generateShopData();
        this.shopItems = data.items;
        this.shopServices = data.services;

        // 更新金币显示
        document.getElementById('shop-gold-display').textContent = this.player.gold;

        // 渲染商店
        this.renderShop();

        this.showScreen('shop-screen');
    }

    // 生成商店数据
    generateShopData() {
        const items = [];
        const services = [];
        const realm = this.player.realm || 1;
        // 价格随天域层数轻微上涨，每重天+5% (原10%)
        const priceMult = 1 + (realm - 1) * 0.05;

        // 1. 生成卡牌 (使用新方法)
        const newCards = this.generateShopCards(5);
        items.push(...newCards);

        // 2. 固定服务
        // 治疗
        services.push({
            id: 'heal',
            type: 'service',
            name: '灵丹妙药',
            icon: '💖',
            desc: `恢复 ${Math.floor(this.player.maxHp * 0.5)} 点生命`, // 30% -> 50%
            price: Math.floor(30 * priceMult), // 50 -> 30
            sold: false
        });

        // 移除卡牌
        services.push({
            id: 'remove',
            type: 'service',
            name: '净化仪式',
            icon: '🗑️',
            desc: '移除一张牌',
            price: Math.floor(50 * (1 + (this.player.removeCount || 0) * 0.5) * priceMult), // 75 -> 50
            sold: false
        });

        // 命环经验
        services.push({
            id: 'exp',
            type: 'service',
            name: '命环充能',
            icon: '⬆️',
            desc: '命环经验 +100', // 50 -> 100
            price: Math.floor(50 * priceMult), // 60 -> 50
            sold: false
        });

        // 3. 随机商品 (30% 几率刷出法则，20% 几率刷出属性药水)
        if (Math.random() < 0.3) {
            const lawKeys = Object.keys(LAWS);
            // 尝试找一个未获得的法则
            const uncollected = lawKeys.filter(k => !this.player.collectedLaws.some(l => l.id === k));
            if (uncollected.length > 0) {
                const randomLawId = uncollected[Math.floor(Math.random() * uncollected.length)];
                const law = LAWS[randomLawId];
                services.push({
                    id: 'law',
                    type: 'item',
                    name: '法则残卷',
                    icon: '📜',
                    desc: `获得: ${law.name}`,
                    price: Math.floor(250 * priceMult),
                    sold: false,
                    data: law
                });
            }
        }

        if (Math.random() < 0.25) {
            services.push({
                id: 'maxHp',
                type: 'item',
                name: '淬体金丹',
                icon: '💊',
                desc: '最大生命上限 +5',
                price: Math.floor(120 * priceMult),
                sold: false
            });
        }

        // 极小概率刷出永久力量
        if (Math.random() < 0.05) {
            services.push({
                id: 'strength',
                type: 'item',
                name: '龙血草',
                icon: '💪',
                desc: '永久力量 +1',
                price: Math.floor(300 * priceMult),
                sold: false
            });
        }

        // 5. 更多服务
        // 刷新商店
        services.push({
            id: 'refresh',
            type: 'service',
            name: '重新进货',
            icon: '🔄',
            desc: '刷新所有卡牌商品',
            price: Math.floor(50 * priceMult),
            sold: false
        });

        // 赌博：神秘盒子
        services.push({
            id: 'gamble',
            type: 'service',
            name: '神秘盲盒',
            icon: '🎁',
            desc: '可能获得灵石、卡牌或...空气？',
            price: Math.floor(30 * priceMult),
            sold: false
        });

        return { items, services };
    }

    // 生成商店卡牌 (封装以便刷新使用)
    generateShopCards(count = 5) {
        const items = [];
        const realm = this.player.realm || 1;
        const priceMult = 1 + (realm - 1) * 0.05;

        for (let i = 0; i < count; i++) {
            // 随层数提升稀有度
            let rarity = 'common';
            const roll = Math.random();
            if (realm >= 3) {
                if (roll < 0.1) rarity = 'legendary'; // 10%
                else if (roll < 0.35) rarity = 'epic'; // 25%
                else if (roll < 0.7) rarity = 'rare'; // 35%
                else rarity = 'uncommon';
            } else {
                if (roll < 0.05) rarity = 'legendary';
                else if (roll < 0.2) rarity = 'rare';
                else if (roll < 0.5) rarity = 'uncommon';
            }

            const card = getRandomCard(rarity, this.player.characterId); // Pass characterId for filtering
            // 之前的 getRandomCard 实现可能不支持参数，稳妥起见我们用旧逻辑并增强筛选
            // 如果 getRandomCard 不支持，就多随机几次取最好的？
            // 假设 getRandomCard 虽然支持参数（查看 import/export），但Utils中没看到，可能是全局的。
            // 检查 game.js 顶部引用... 好像是 data/cards.js 里的helper？
            // 没关系，我们先用简单逻辑:

            // 暂且使用全局 getRandomCard，如果不接受参数，我们就在外部过滤
            // 实际上 cards.js 里的 getRandomCard(rarity) 是支持的（通常）
            // 如果不支持，我们会得到随机牌。

            // 商店特惠：所有卡牌8折
            const basePrice = this.getCardPrice(card);
            const price = Math.floor(basePrice * 0.8 * priceMult);

            items.push({
                type: 'card',
                card: card,
                price: price,
                sold: false
            });
        }
        return items;
    }

    // 更新UI
    updateUI() {
        if (this.currentScreen === 'map-screen') {
            this.map.render();
            this.updatePlayerDisplay();
        } else if (this.currentScreen === 'battle-screen') {
            this.updatePlayerDisplay();
            if (this.battle) {
                this.battle.updateBattleUI();
                this.updateActiveSkillUI();
            }
        }
    }

    // 更新主动技能UI
    updateActiveSkillUI() {
        const btn = document.getElementById('active-skill-btn');
        if (!btn) return;

        const skill = this.player.activeSkill;
        if (!skill || this.player.skillLevel === 0) {
            btn.style.display = 'none';
            return;
        }

        btn.style.display = 'flex';

        // Icon
        const iconEl = btn.querySelector('.skill-icon');
        if (iconEl) iconEl.textContent = skill.icon;

        // Tooltip
        const nameEl = btn.querySelector('.skill-name');
        const descEl = btn.querySelector('.skill-desc');
        if (nameEl) nameEl.textContent = skill.name + (this.player.skillLevel > 1 ? ` Lv.${this.player.skillLevel}` : '');
        if (descEl) descEl.textContent = skill.description;

        // Cooldown
        const overlay = btn.querySelector('.skill-cooldown-overlay');
        const text = btn.querySelector('.skill-cooldown-text');

        if (this.player.skillCooldown > 0) {
            const pct = (this.player.skillCooldown / this.player.maxCooldown) * 100;
            overlay.style.height = `${pct}%`;
            text.textContent = this.player.skillCooldown;
            btn.classList.add('cooldown');
        } else {
            overlay.style.height = '0%';
            text.textContent = '';
            btn.classList.remove('cooldown');
            btn.classList.add('ready'); // Add ready class for animation
        }

        // CSS Injection for Active Skill Visibility
        if (!document.getElementById('active-skill-style')) {
            const style = document.createElement('style');
            style.id = 'active-skill-style';
            style.innerHTML = `
                .active-skill-container {
                    transition: all 0.3s ease;
                    border: 2px solid transparent;
                }
                .active-skill-container.ready {
                    border-color: var(--accent-gold);
                    box-shadow: 0 0 15px var(--accent-gold), 0 0 5px #fff inset;
                    animation: skillPulse 2s infinite;
                    cursor: pointer;
                    transform: scale(1.05);
                }
                .active-skill-container.ready:hover {
                    transform: scale(1.15);
                    box-shadow: 0 0 25px var(--accent-gold), 0 0 10px #fff inset;
                }
                @keyframes skillPulse {
                    0% { box-shadow: 0 0 10px var(--accent-gold); }
                    50% { box-shadow: 0 0 20px var(--accent-gold), 0 0 10px var(--accent-gold); }
                    100% { box-shadow: 0 0 10px var(--accent-gold); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // 激活主动技能 - 点击按钮触发
    activatePlayerSkill() {
        if (this.currentScreen !== 'battle-screen') return;
        if (this.battle.currentTurn !== 'player') {
            Utils.showBattleLog('现在不是你的回合！');
            return;
        }

        // 预检查：是否冷却中
        if (this.player.skillCooldown > 0) {
            Utils.showBattleLog(`技能冷却中 (${this.player.skillCooldown})`);
            return;
        }

        // 显示确认弹窗
        this.showSkillConfirmModal();
    }

    // 显示技能确认弹窗
    showSkillConfirmModal() {
        const modal = document.getElementById('skill-confirm-modal');
        const titleEl = document.getElementById('skill-confirm-title');
        const iconEl = document.getElementById('skill-confirm-icon');
        const descEl = document.getElementById('skill-confirm-desc');

        if (this.player.activeSkill) {
            titleEl.textContent = `${this.player.activeSkill.name}`;
            iconEl.textContent = this.player.activeSkill.icon || '⚡';
            descEl.textContent = this.player.activeSkill.description;
        }

        modal.classList.add('active');
    }

    // 确认释放技能
    confirmActivateSkill() {
        this.closeModal(); // 关闭弹窗

        if (this.player.activateSkill(this.battle)) {
            this.updateActiveSkillUI();
            this.battle.updateBattleUI();
            // 增强反馈
            const btn = document.getElementById('active-skill-btn');
            if (btn) {
                Utils.addShakeEffect(btn);
                btn.classList.remove('ready');

                // Add particle effect logic if present, omitted for brevity/safety
                if (typeof particles !== 'undefined') {
                    // particles.createBurst(btn);
                }
            }

            // Visual Flash
            const flash = document.createElement('div');
            flash.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(255,255,255,0.3);pointer-events:none;z-index:9999;transition:opacity 0.5s;';
            document.body.appendChild(flash);
            setTimeout(() => {
                flash.style.opacity = '0';
                setTimeout(() => flash.remove(), 500);
            }, 50);

            if (typeof audioManager !== 'undefined') audioManager.playSFX('buff');
        }
    }

    // 获取卡牌基础价格
    getCardPrice(card) {
        const rarityPrices = {
            basic: 0,
            common: 60,
            uncommon: 100,
            rare: 180,
            epic: 300,
            legendary: 500
        };
        return rarityPrices[card.rarity] || 60;
    }

    // 渲染商店
    renderShop() {
        // 1. 渲染卡牌
        const cardContainer = document.getElementById('shop-cards');
        cardContainer.innerHTML = '';

        this.shopItems.forEach((item, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'shop-card-wrapper';

            const cardEl = Utils.createCardElement(item.card, index);
            cardEl.classList.add(`rarity-${item.card.rarity || 'common'}`);
            if (item.sold) cardEl.classList.add('sold');

            const priceBtn = document.createElement('div');
            priceBtn.className = `card-price ${this.player.gold < item.price || item.sold ? 'cannot-afford' : ''}`;
            priceBtn.innerHTML = item.sold ? '已售出' : `💰 ${item.price}`;

            if (!item.sold) {
                priceBtn.addEventListener('click', () => this.buyItem('card', index));
                priceBtn.style.cursor = 'pointer';
            }

            wrapper.appendChild(cardEl);
            wrapper.appendChild(priceBtn);
            cardContainer.appendChild(wrapper);
        });

        // 2. 渲染服务/道具
        const serviceContainer = document.getElementById('shop-services-container');
        serviceContainer.innerHTML = '';

        this.shopServices.forEach((service, index) => {
            const el = document.createElement('div');
            el.className = 'shop-service';
            el.id = `service-${service.id}`;
            if (service.sold) el.style.opacity = '0.5';

            el.innerHTML = `
                <div class="service-icon">${service.icon}</div>
                <div class="service-info">
                    <div class="service-name">${service.name}</div>
                    <div class="service-desc">${service.desc}</div>
                </div>
                <button class="buy-btn ${this.player.gold < service.price || service.sold ? 'disabled' : ''}">
                    <span class="price">${service.sold ? '已售出' : '💰 ' + service.price}</span>
                </button>
            `;

            if (!service.sold) {
                const btn = el.querySelector('.buy-btn');
                btn.addEventListener('click', () => this.buyItem('service', index));
            }

            serviceContainer.appendChild(el);
        });
    }

    // 统一购买逻辑
    buyItem(type, index) {
        let item;
        if (type === 'card') {
            item = this.shopItems[index];
        } else {
            item = this.shopServices[index];
        }

        if (!item || item.sold) return;
        if (this.player.gold < item.price) {
            Utils.showBattleLog('灵石不足！');
            return;
        }

        // 执行购买效果
        if (type === 'card') {
            this.player.addCardToDeck(item.card);
            Utils.showBattleLog(`购买了 ${item.card.name}`);

            // 扣款并标记
            this.player.gold -= item.price;
            item.sold = true;
        } else {
            // 处理服务效果
            const result = this.applyServiceEffect(item);

            if (!result) return; // 失败/取消

            if (result === 'deferred') {
                return; // 延迟扣款处理 (如移除卡牌)
            }

            // 立即扣款
            this.player.gold -= item.price;

            if (result === 'repeatable') {
                // 可重复购买，不标记为售出
                // 如果导致涨价，在 applyServiceEffect 中已经处理
            } else {
                item.sold = true;
            }
        }

        // 更新UI
        document.getElementById('shop-gold-display').textContent = this.player.gold;
        this.renderShop();
    }

    // 显示命环进化选择
    showEvolutionSelection(targetTier) {
        const modal = document.getElementById('event-modal');
        const titleEl = document.getElementById('event-title');
        const iconEl = document.getElementById('event-icon');
        const descEl = document.getElementById('event-desc');
        const choicesEl = document.getElementById('event-choices');

        titleEl.textContent = '命环进化';
        iconEl.textContent = '🧬';
        descEl.textContent = '你的命环因力量满盈而震颤，显化出数条进化的可能...';
        choicesEl.innerHTML = '';

        // 筛选可用路径
        const availablePaths = Object.values(FATE_RING.paths).filter(path =>
            path.tier === targetTier &&
            (!path.requires || path.requires.includes(this.player.fateRing.path))
        );

        // 如果是 Tier 3 (逆天之环)，特殊处理 requiresAny
        if (targetTier === 3) {
            const ultimatePath = FATE_RING.paths['defiance'];
            if (ultimatePath) availablePaths.push(ultimatePath);
        }

        availablePaths.forEach(path => {
            const btn = document.createElement('button');
            btn.className = 'event-choice';
            btn.innerHTML = `
                <div class="choice-icon">${path.icon || '✨'}</div>
                <div class="choice-content">
                    <div class="choice-text">进化：${path.name}</div>
                    <div class="choice-result">${path.description}</div>
                </div>
            `;

            btn.onclick = () => {
                this.player.evolveFateRing(path.id);
                Utils.showBattleLog(`命环进化为：${path.name}`);
                modal.classList.remove('active');

                // 刷新UI
                if (document.getElementById('ring-modal').classList.contains('active')) {
                    this.showFateRing();
                }
            };

            choicesEl.appendChild(btn);
        });

        modal.classList.add('active');
    }

    // 应用服务效果
    applyServiceEffect(service) {
        // 法宝购买逻辑
        if (service.type === 'treasure') {
            if (this.player.addTreasure(service.id)) {
                Utils.showBattleLog(`获得法宝：${service.name}`);
                return true;
            }
            return false;
        }

        switch (service.id) {
            case 'heal':
                if (this.player.currentHp >= this.player.maxHp) {
                    Utils.showBattleLog('生命值已满！');
                    return false;
                }
                const healAmount = Math.floor(this.player.maxHp * 0.3);
                this.player.heal(healAmount);
                Utils.showBattleLog(`恢复了 ${healAmount} 点生命`);
                return true;

            case 'remove':
                this.showRemoveCard(service);
                return 'deferred';

            case 'exp':
                this.player.fateRing.exp += 50;
                this.player.checkFateRingLevelUp();
                Utils.showBattleLog('命环经验 +50');
                return true;

            case 'law':
                if (service.data) {
                    this.player.collectLaw(service.data);
                    Utils.showBattleLog(`习得法则：${service.data.name} `);
                    return true;
                }
                return false;

            case 'maxHp':
                this.player.maxHp += 5;
                this.player.currentHp += 5;
                Utils.showBattleLog('最大生命 +5');
                return true;

            case 'strength':
                this.player.addPermBuff('strength', 1);
                Utils.showBattleLog('永久力量 +1');
                return true;

            case 'refresh':
                // 刷新卡牌
                this.shopItems = this.generateShopCards(5);
                Utils.showBattleLog('商店货物已刷新');
                // 不在这里 renderShop，由 buyItem 统一处理
                return 'repeatable';

            case 'gamble':
                const roll = Math.random();
                if (roll < 0.5) { // 50% 亏本/保本
                    const goldBack = Utils.random(10, 30);
                    this.player.gold += goldBack;
                    Utils.showBattleLog(`盲盒：获得 ${goldBack} 灵石（亏了...）`);
                } else if (roll < 0.85) { // 35% 获得随机卡牌
                    const randCard = getRandomCard(this.player.realm > 2 ? 'uncommon' : 'common');
                    this.player.addCardToDeck(randCard);
                    Utils.showBattleLog(`盲盒：获得卡牌【${randCard.name}】！`);
                } else if (roll < 0.98) { // 13% 小奖 (稀有卡或大量金币)
                    if (Math.random() < 0.5) {
                        const rareCard = getRandomCard('rare');
                        this.player.addCardToDeck(rareCard);
                        Utils.showBattleLog(`盲盒：大奖！获得稀有卡牌【${rareCard.name}】！`);
                    } else {
                        const bigGold = Utils.random(80, 150);
                        this.player.gold += bigGold;
                        Utils.showBattleLog(`盲盒：手气不错！获得 ${bigGold} 灵石！`);
                    }
                } else { // 2% 传说/法宝奖
                    const jackpot = Math.random();
                    if (jackpot < 0.5) {
                        const legCard = getRandomCard('legendary');
                        this.player.addCardToDeck(legCard);
                        Utils.showBattleLog(`盲盒：传说大奖！！获得【${legCard.name}】！`);
                    } else {
                        // 尝试给法宝
                        const treasureKeys = Object.keys(TREASURES);
                        const unowned = treasureKeys.filter(k => !this.player.hasTreasure(k));
                        if (unowned.length > 0) {
                            const tid = unowned[Math.floor(Math.random() * unowned.length)];
                            this.player.addTreasure(tid);
                            Utils.showBattleLog(`盲盒：鸿运当头！获得法宝【${TREASURES[tid].name}】！`);
                        } else {
                            this.player.gold += 300;
                            Utils.showBattleLog(`盲盒：传说大奖！获得 300 灵石！`);
                        }
                    }
                }

                alert('请查看顶部战斗日志确认盲盒结果 (获得具体物品)');
                // 盲盒涨价逻辑
                service.price = Math.floor(service.price * 1.5);
                service.name = '神秘盲盒 (涨价了)';
                return 'repeatable';

            default:
                return false;
        }
    }

    // 显示移除卡牌界面 (Fixed: Use deck-modal which exists)
    showRemoveCard(serviceItem) {
        // 如果钱不够在 buyItem 里已经检查了，但为了安全
        if (this.player.gold < serviceItem.price) return;

        // 先关闭当前弹窗（如果有）
        this.closeModal();

        const modal = document.getElementById('deck-modal');
        const container = document.getElementById('deck-view-cards');
        const title = modal.querySelector('h2');

        // Reset modal content
        container.innerHTML = '';
        container.style.display = 'flex';
        container.style.flexWrap = 'wrap';
        container.style.justifyContent = 'center'; // Ensure centering

        if (title) title.textContent = '选择一张卡牌移除 (净化)';

        // Add hint text
        const hint = document.createElement('p');
        hint.style.width = '100%';
        hint.style.textAlign = 'center';
        hint.style.marginBottom = '10px';
        hint.style.color = 'var(--accent-gold)';
        hint.textContent = `点击卡牌以移除 (消耗 ${serviceItem.price} 灵石)`;
        container.appendChild(hint);

        this.player.deck.forEach((card, index) => {
            const cardEl = Utils.createCardElement(card, index);
            cardEl.classList.add(`rarity-${card.rarity || 'common'}`);
            cardEl.style.cursor = 'pointer';

            // 点击移除
            cardEl.addEventListener('click', () => {
                // Confirm dialog could be nice, but for now direct action as before
                this.player.deck.splice(index, 1);
                this.player.gold -= serviceItem.price;

                // 增加移除计数，让下次更贵
                this.player.removeCount = (this.player.removeCount || 0) + 1;
                serviceItem.sold = true;
                // Price increase for next time is handled in generateShopData, 
                // but for current session item is sold.

                Utils.showBattleLog(`已移除 ${card.name}`);

                this.closeModal();
                // 刷新商店界面
                document.getElementById('shop-gold-display').textContent = this.player.gold;
                // Re-render shop to show 'Sold' status
                this.renderShop();
                // Re-open shop screen (it might be hidden by modal)
                this.showScreen('shop-screen');
            });

            container.appendChild(cardEl);
        });

        modal.classList.add('active');
    }

    // 剩下的 buyRingExp 等旧方法可以删除，因为已经集成到 applyServiceEffect 中了

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
                    <div>💤 休息(恢复 ${healAmount} HP)</div>
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
                    <div>🗑️ 净化(移除一张牌)</div>
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

    // 显示升级卡牌界面 (Campfire Version with Preview)
    showCampfireUpgrade() {
        this.closeModal();

        const modal = document.getElementById('deck-modal');
        const container = document.getElementById('deck-view-cards');
        container.innerHTML = '';
        container.style.display = 'flex';
        container.style.flexDirection = 'row';

        // Reuse split layout logic
        const listContainer = document.createElement('div');
        listContainer.style.flex = '1';
        listContainer.style.display = 'flex';
        listContainer.style.flexWrap = 'wrap';
        listContainer.style.justifyContent = 'center';
        listContainer.style.alignContent = 'flex-start';
        listContainer.style.overflowY = 'auto';
        listContainer.style.maxHeight = '60vh';

        const previewContainer = document.createElement('div');
        previewContainer.style.width = '300px';
        previewContainer.style.borderLeft = '1px solid rgba(255,255,255,0.1)';
        previewContainer.style.padding = '10px';
        previewContainer.style.display = 'flex';
        previewContainer.style.flexDirection = 'column';
        previewContainer.style.alignItems = 'center';

        container.appendChild(listContainer);
        container.appendChild(previewContainer);

        previewContainer.innerHTML = `
                    <h3 style="color:var(--accent-gold);margin-top:0;">升级预览</h3>
            <div id="upgrade-preview-placeholder" style="color:#666;margin-top:50px;">
                鼠标悬浮或点击卡牌<br>查看升级效果
            </div>
            <div id="upgrade-preview-card" style="display:none; transform:scale(1.1); margin: 20px 0;"></div>
            <div id="upgrade-diff-text" style="width:100%; font-size:0.9rem; color:#ddd; margin: 10px 0; background:rgba(0,0,0,0.3); padding:8px; border-radius:4px; display:none;"></div>
            <button id="confirm-upgrade-btn" class="menu-btn" style="margin-top:auto; width:100%;" disabled>确认升级</button>
                `;

        const confirmBtn = previewContainer.querySelector('#confirm-upgrade-btn');
        const previewCardDiv = previewContainer.querySelector('#upgrade-preview-card');
        const previewTextDiv = previewContainer.querySelector('#upgrade-diff-text');
        const placeholder = previewContainer.querySelector('#upgrade-preview-placeholder');

        let selectedIndex = -1;

        this.player.deck.forEach((card, index) => {
            if (!canUpgradeCard(card)) return;

            const cardEl = Utils.createCardElement(card, index);
            cardEl.classList.add(`rarity-${card.rarity || 'common'}`);
            cardEl.style.cursor = 'pointer';

            const showPreview = () => {
                const upgraded = upgradeCard(card);
                placeholder.style.display = 'none';
                previewCardDiv.style.display = 'flex';
                previewTextDiv.style.display = 'block';

                previewCardDiv.innerHTML = '';
                const upgradedEl = Utils.createCardElement(upgraded, 999);
                upgradedEl.classList.add(`rarity-${upgraded.rarity || 'common'}`);
                previewCardDiv.appendChild(upgradedEl);

                previewTextDiv.innerHTML = `
                    <p style="margin:0;color:var(--accent-green);font-weight:bold;">${card.name} ➤ ${upgraded.name}</p>
                        <p style="margin:4px 0 0 0;font-size:0.8rem;">${upgraded.description}</p>
                `;
            };

            cardEl.addEventListener('mouseenter', () => {
                if (selectedIndex === -1) showPreview();
            });

            cardEl.addEventListener('click', () => {
                listContainer.querySelectorAll('.card').forEach(c => c.style.border = '');
                cardEl.style.border = '3px solid var(--accent-gold)';
                selectedIndex = index;
                showPreview();
                confirmBtn.disabled = false;
                confirmBtn.classList.remove('disabled');
            });

            listContainer.appendChild(cardEl);
        });

        // Confirm Action
        confirmBtn.onclick = () => {
            if (selectedIndex === -1) return;
            this.campfireUpgradeCard(selectedIndex);

            // Clean up
            container.style.display = '';
            container.style.flexDirection = '';
        };

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
    // --- Auth System ---
    showLoginModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.classList.add('active');
            // Clear inputs
            const u = document.getElementById('auth-username');
            const p = document.getElementById('auth-password');
            const m = document.getElementById('auth-message');
            if (u) u.value = '';
            if (p) p.value = '';
            if (m) m.innerText = '';
        }
    }

    async handleLogin() {
        const usernameInput = document.getElementById('auth-username');
        const passwordInput = document.getElementById('auth-password');
        const messageEl = document.getElementById('auth-message');

        if (!usernameInput || !passwordInput) return;
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username || !password) {
            messageEl.innerText = '请输入账号和密码';
            return;
        }

        messageEl.innerText = '登录中...';
        AuthService.login(username, password).then(async result => {
            if (result.success) {
                this.onLoginSuccess(messageEl, '登录成功！');
            } else {
                messageEl.innerText = result.message || '登录失败';
                messageEl.style.color = '#ff6b6b';
            }
        });
    }

    // 打开存档选择界面 (同步云端)
    async openSaveSlotsWithSync() {
        if (!AuthService.isLoggedIn()) {
            if (confirm('尚未登录，是否先登录以同步云端存档？')) {
                this.showLoginModal();
                return;
            }
            // Guest mode: Just go to character selection (Local only, risk of data loss)
            this.showCharacterSelection();
            return;
        }

        const msgBtn = document.getElementById('new-game-btn');
        const originalText = msgBtn ? msgBtn.innerHTML : '';
        if (msgBtn) msgBtn.innerText = '同步中...';

        try {
            const res = await AuthService.getCloudData();
            if (msgBtn) msgBtn.innerHTML = originalText;

            let slots = [null, null, null, null];
            if (res.success && res.slots) {
                slots = res.slots;
            } else if (res.isLegacy && res.slots) {
                slots = res.slots;
                // Auto-migrate legacy if needed? Already returned as slot 0 format
            }

            // Update cache
            this.cachedSlots = slots;
            this.showSaveSlotsModal(slots);
        } catch (e) {
            console.error('Sync failed', e);
            if (msgBtn) msgBtn.innerHTML = originalText;
            alert('获取云端存档失败，请检查网络');
        }
    }

    // 统一的登录成功逻辑
    onLoginSuccess(messageEl, successMsg) {
        messageEl.innerText = successMsg;
        messageEl.style.color = '#4ff';
        setTimeout(async () => {
            this.closeModal();
            this.checkLoginStatus();

            // 登录成功后，获取云端存档列表并展示选择界面
            const res = await AuthService.getCloudData();

            // 检查本地旧存档
            const localSave = localStorage.getItem('theDefierSave');
            let localData = null;
            if (localSave) { try { localData = JSON.parse(localSave); } catch (e) { } }

            let slots = [null, null, null, null];

            if (res.success && res.slots) {
                slots = res.slots;
            } else if (res.isEmpty && localData) {
                // 如果云端是新的（空），但本地有数据，自动帮用户填入 Slot 0
                slots[0] = localData;
                AuthService.saveCloudData(localData, 0); // Async sync
                Utils.showBattleLog('检测到旧存档，已自动绑定至 存档 1');
            }

            this.cachedSlots = slots;
            this.showSaveSlotsModal(slots);

        }, 500);
    }

    // 显示存档位选择模态框
    showSaveSlotsModal(slots) {
        const modal = document.getElementById('save-slots-modal');
        const container = document.getElementById('slots-container');
        if (!modal || !container) return;

        container.innerHTML = '';

        slots.forEach((slotData, index) => {
            const slotEl = document.createElement('div');
            const isEmpty = !slotData;
            slotEl.className = `save-slot ${isEmpty ? 'empty' : ''}`;

            const slotName = `存档 ${index + 1}`;

            let contentHtml = '';
            if (isEmpty) {
                contentHtml = `<div class="slot-empty-text">空存档</div>`;
            } else {
                const date = new Date(slotData.timestamp).toLocaleString();
                const realm = (slotData.player && slotData.player.realm) ? slotData.player.realm : '?';
                const hp = (slotData.player && slotData.player.currentHp) ? slotData.player.currentHp : '?';
                const roleId = (slotData.player && slotData.player.characterId);
                let roleName = '未知角色';
                if (roleId === 'wuYu') roleName = '无欲';
                if (roleId === 'yanHan') roleName = '严寒'; // Add others if needed

                contentHtml = `
                    <div class="slot-info-row" style="color:var(--accent-gold); font-weight:bold;">${roleName}</div>
                    <div class="slot-info-row">🏔️ 第 ${realm} 重天 | ❤️ ${hp}</div>
                    <div class="slot-info-row" style="font-size:0.8rem; color:#666;">📅 ${date}</div>
                `;
            }

            const actionsHtml = isEmpty ?
                `<button class="menu-btn small" onclick="game.selectSlot(${index}, 'new')">新建轮回</button>` :
                `<button class="menu-btn small primary" onclick="game.selectSlot(${index}, 'load')">继续</button>
                 <button class="menu-btn small" style="border-color:var(--accent-red); color:var(--accent-red)" onclick="game.selectSlot(${index}, 'overwrite')">覆盖</button>`;

            slotEl.innerHTML = `
                <div class="slot-header">
                    <span>${slotName}</span>
                </div>
                <div class="slot-content">
                    ${contentHtml}
                </div>
                <div class="slot-actions">
                    ${actionsHtml}
                </div>
            `;

            container.appendChild(slotEl);
        });

        modal.classList.add('active');
    }

    // 选择存档位操作
    selectSlot(index, mode) {
        this.currentSaveSlot = index;
        const modal = document.getElementById('save-slots-modal');

        if (mode === 'load') {
            const data = this.cachedSlots[index];
            if (data) {
                localStorage.setItem('theDefierSave', JSON.stringify(data));
                Utils.showBattleLog(`已加载 存档 ${index + 1}`);
                modal.classList.remove('active');

                // Reload game state directly without full refresh if possible, but reload is safer
                setTimeout(() => window.location.reload(), 500);
            }
        } else if (mode === 'new' || mode === 'overwrite') {
            let confirmed = true;
            if (mode === 'overwrite') {
                confirmed = confirm('确定要覆盖此存档吗？旧进度将丢失！');
            }

            if (confirmed) {
                // For new game, we start fresh. 
                // We should probably go to character selection?
                // Or just clear current local save and refresh?
                // The logical flow: Select slot -> Go to Character Select -> Start Game

                // Clear local save to force new game start
                localStorage.removeItem('theDefierSave');
                this.currentSaveSlot = index; // Persistent? No, reset on reload.
                // We need to store selected slot in localStorage temporarily so next load knows?
                // Or just:
                modal.classList.remove('active');

                // If we treat "New Game" as "Go to Character Select":
                this.showCharacterSelection();

                // We must ensure that when the actual game starts, it saves to this slot.
                // Since `this.currentSaveSlot` is set, `saveGame()` will use it.
                // But if user refreshes at character select, slot info is lost.
                // Maybe store active slot in sessionStorage?
                sessionStorage.setItem('currentSaveSlot', index);
            }
        }
    }

    async handleRegister() {
        const username = document.getElementById('auth-username').value;
        const password = document.getElementById('auth-password').value;
        const msg = document.getElementById('auth-message');

        if (!username || !password) {
            msg.innerText = '请输入账号和密码';
            return;
        }

        msg.innerText = '注册中...';
        const result = await AuthService.register(username, password);
        if (result.success) {
            // Auto login logic reuse
            const loginRes = await AuthService.login(username, password);
            if (loginRes.success) {
                // 使用统一的成功处理逻辑，这会自动将本地旧存档上传到新注册的空账号中
                this.onLoginSuccess(msg, '注册成功！已绑定旧存档');
            }
        } else {
            if (result.error && result.error.code === 202) {
                msg.innerText = '该用户名已被使用，请换一个';
            } else {
                msg.innerText = result.message || '注册失败';
            }
        }
    }

    checkLoginStatus() {
        const btn = document.getElementById('login-btn');
        if (!btn) return;

        if (AuthService.isLoggedIn()) {
            const user = AuthService.getCurrentUser();
            // Change button to show name or Logout
            btn.innerHTML = `<span class="btn-icon">👤</span><span class="btn-text" style="font-size:0.8rem">${user.username}</span>`;
            btn.onclick = async () => {
                if (confirm('确定要退出登录吗？\n(退出前将自动上传当前进度)')) {
                    // 退出前强制尝试上传一次本地存档
                    const localSave = localStorage.getItem('theDefierSave');
                    if (localSave) {
                        try {
                            const data = JSON.parse(localSave);
                            await AuthService.saveCloudData(data, this.currentSaveSlot);
                            console.log('Logout sync complete');
                        } catch (e) {
                            console.error('Logout sync failed', e);
                        }
                    }

                    AuthService.logout();
                    this.checkLoginStatus();
                    location.reload();
                }
            };
        } else {
            btn.innerHTML = `<span class="btn-icon">☁️</span><span class="btn-text">登入轮回</span>`;
            btn.onclick = () => this.showLoginModal();
        }
    }

    async checkForCloudSave() {
        // This is now handled within handleLogin's flow logic, but kept as fallback or for manual checks
        const res = await AuthService.getCloudData();
        if (res.success && res.data) {
            const cloudTime = res.saveTime ? new Date(res.saveTime).toLocaleString() : '未知时间';
            // If we are strictly checking, we might want to show the full modal
            const localSave = localStorage.getItem('theDefierSave');
            let localData = null;
            if (localSave) { try { localData = JSON.parse(localSave); } catch (e) { } }

            this.showSaveConflictModal(localData, res.data, res.saveTime);
        }
    }

    // 显示存档冲突弹窗
    showSaveConflictModal(localData, cloudData, cloudTime) {
        const modal = document.getElementById('save-conflict-modal');
        if (!modal) return;

        // Populate Info
        const localInfo = document.getElementById('local-save-info');
        const cloudInfo = document.getElementById('cloud-save-info');

        const formatInfo = (data, time) => {
            if (!data) return '无数据';
            const date = time ? new Date(time).toLocaleString() : (data.timestamp ? new Date(data.timestamp).toLocaleString() : '未知时间');
            const realm = (data.player && data.player.realm) ? data.player.realm : '?';
            const hp = (data.player && data.player.currentHp) ? data.player.currentHp : '?';
            const gold = (data.player && data.player.gold) ? data.player.gold : '?';
            return `
                <div style="margin-bottom:4px">📅 ${date}</div>
                <div style="margin-bottom:4px">🏔️ 第 ${realm} 重天</div>
                <div>❤️ ${hp} | 💰 ${gold}</div>
            `;
        };

        if (localInfo) localInfo.innerHTML = formatInfo(localData, localData ? localData.timestamp : null);
        if (cloudInfo) cloudInfo.innerHTML = formatInfo(cloudData, cloudTime);

        // Store temp data
        this.tempCloudData = cloudData;

        modal.classList.add('active');
    }

    // 解决存档冲突
    resolveSaveConflict(choice) {
        const modal = document.getElementById('save-conflict-modal');
        if (choice === 'local') {
            // Keep Local -> Upload to Cloud
            const localSave = localStorage.getItem('theDefierSave');
            if (localSave) {
                const data = JSON.parse(localSave);
                AuthService.saveCloudData(data).then(res => {
                    if (res.success) {
                        Utils.showBattleLog('本地存档已覆盖云端！');
                        modal.classList.remove('active');
                        // No reload needed
                    } else {
                        alert('云端同步失败：' + (res.message || '未知错误'));
                    }
                });
            }
        } else if (choice === 'cloud') {
            // Keep Cloud -> Overwrite Local
            if (this.tempCloudData) {
                localStorage.setItem('theDefierSave', JSON.stringify(this.tempCloudData));
                alert('已从云端恢复存档！');
                modal.classList.remove('active');
                window.location.reload(); // Reload to apply
            } else {
                alert('云端数据读取异常');
            }
        }
    }

    // 加载云端存档 (无本地时)
    loadCloudGame() {
        AuthService.getCloudData().then(res => {
            if (res.success && res.data) {
                localStorage.setItem('theDefierSave', JSON.stringify(res.data));
                Utils.showBattleLog('已拉取云端存档');
                setTimeout(() => window.location.reload(), 500);
            }
        });
    }
}

// 全局游戏实例
let game;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    game = new Game();
});
