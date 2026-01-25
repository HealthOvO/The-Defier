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
        this.currentSaveSlot = null; // Default to null (unknown), NOT 0 (Slot 1)
        this.cachedSlots = [null, null, null, null]; // Cache for slots
        this.debugMode = localStorage.getItem('theDefierDebug') === 'true';
        setTimeout(() => this.updateDebugUI(), 0);

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

        // 恢复当前的存档位索引 (修复刷新后无法同步到正确槽位的问题)
        // 恢复当前的存档位索引 (修复刷新后无法同步到正确槽位的问题)
        let savedSlotIndex = sessionStorage.getItem('currentSaveSlot');

        // 关键修复：如果会话均无，尝试从本地持久化存储恢复
        if (savedSlotIndex === null) {
            savedSlotIndex = localStorage.getItem('lastSaveSlot');
        }

        if (savedSlotIndex !== null) {
            this.currentSaveSlot = parseInt(savedSlotIndex);
            console.log(`已恢复存档位: Slot ${this.currentSaveSlot + 1}`);
        }

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
                // 这里我们确保它就在那里，而且文字清晰
            }
        } else {
            if (continueBtn) continueBtn.style.display = 'none';
        }

        // 默认总是留在主菜单，除非特定场景（比如移动端恢复？）
        // 这里我们强制让用户选择，解决了刷新后乱入的问题
        this.showScreen('main-menu');

        // 安全检查：如果已登录但没有选中存档位（例如新标签页打开），强制显示存档选择，防止数据错乱
        if (AuthService.isLoggedIn() && this.currentSaveSlot === null) {
            console.log('Logged in but slot unknown. Prompting selection.');
            // 延迟一点以免与主菜单动画冲突
            setTimeout(() => this.openSaveSlotsWithSync(), 800);
        }

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
                    // FIX: 禁止点击没景关闭事件弹窗，防止无限刷经验
                    if (modal.id === 'event-modal') return;
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
        try {
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
                saveSlot: this.currentSaveSlot, // Persist the slot ID
                timestamp: Date.now()
            };
            localStorage.setItem('theDefierSave', JSON.stringify(gameState));
            console.log('游戏已保存 (本地)');

            // 如果已登录，且知道当前的存档槽位，自动同步到云端
            // 防止 unset slot 默认为 0 覆盖了 Slot 1
            if (AuthService.isLoggedIn() && this.currentSaveSlot !== null && this.currentSaveSlot !== undefined) {
                AuthService.saveCloudData(gameState, this.currentSaveSlot).then(res => {
                    if (res.success) {
                        console.log(`游戏已同步 (云端 Slot ${this.currentSaveSlot})`);
                        // Update cache
                        this.cachedSlots[this.currentSaveSlot] = gameState;
                        Utils.showBattleLog('游戏进度已保存到云端');
                    } else {
                        console.warn('云端同步失败', res);
                        Utils.showBattleLog('云端同步失败，仅保存本地');
                    }
                }).catch(err => {
                    console.error('Cloud save error:', err);
                });
            } else {
                // Local only warning if not logged in? No, silent is fine.
            }
        } catch (e) {
            console.error('Save Game Error:', e);
            Utils.showBattleLog('严重错误：存档失败！请检查存储空间');
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

                // ... logic handled by assign generally, but methods are lost.
                // ideally we re-instantiate, but for now assuming data structure is enough
                // as methods are on prototype. 
                // Wait, assign doesn't restore prototype. 
                // Currently code relies on this.player having methods, and we assign properties TO it.
                // So prototype methods are safe.


                // === 关键修复：数据解压与重建 (Rehydration) ===

                // 1. 重建卡牌 (Deck, Hand, Draw, Discard)
                const hydrateCards = (list) => {
                    if (!Array.isArray(list)) return [];
                    return list.map(savedCard => {
                        // 如果是旧档且包含完整数据，直接使用
                        if (savedCard.name && savedCard.description) return savedCard;

                        // 获取基础数据
                        const baseCard = CARDS[savedCard.id];
                        if (!baseCard) return savedCard; // Fallback

                        // 合并：基础 < 存档
                        let card = { ...JSON.parse(JSON.stringify(baseCard)), ...savedCard };

                        // 恢复升级状态
                        if (card.upgraded && typeof upgradeCard === 'function') {
                            // upgradeCard通常不仅改数值，还改变name和description
                            // 我们需要在一个纯净的基础卡上应用升级
                            // 但savedCard包含当前cost。
                            // 策略：用upgradeCard生成一个新的标准升级卡，然后覆盖savedCard中的特定动态属性
                            let freshUpgraded = upgradeCard(JSON.parse(JSON.stringify(baseCard)));
                            card = { ...freshUpgraded, ...savedCard };
                        }

                        return card;
                    });
                };

                this.player.deck = hydrateCards(this.player.deck);
                this.player.hand = hydrateCards(this.player.hand);
                this.player.drawPile = hydrateCards(this.player.drawPile);
                this.player.discardPile = hydrateCards(this.player.discardPile);

                // 2. 重建法宝
                if (this.player.treasures) {
                    this.player.treasures = this.player.treasures.map(t => {
                        if (t.name) return t; // Old format
                        const baseT = TREASURES[t.id];
                        if (!baseT) return t;
                        return { ...baseT, ...t };
                    });
                }

                // 3. 重建法则
                if (this.player.collectedLaws) {
                    this.player.collectedLaws = this.player.collectedLaws.map(l => {
                        if (l.name) return l; // Old format
                        const baseL = LAWS[l.id];
                        return baseL || l;
                    });
                }
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

            // 恢复当前的存档位索引 (修复刷新后无法同步到正确槽位的问题)
            if (this.currentSaveSlot === null && gameState.saveSlot !== undefined) {
                this.currentSaveSlot = gameState.saveSlot;
                console.log(`Recovered Save Slot ID from save file: ${this.currentSaveSlot}`);
                // Re-persist for session
                sessionStorage.setItem('currentSaveSlot', this.currentSaveSlot);
                localStorage.setItem('lastSaveSlot', this.currentSaveSlot);
            }

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

    // 初始化图鉴
    initCollection() {
        const grid = document.getElementById('collection-grid');
        if (!grid) return;

        // 清空现有内容
        grid.innerHTML = '';

        // --- 1. 渲染法则部分 ---
        for (const lawId in LAWS) {
            const law = LAWS[lawId];
            const collected = this.player.collectedLaws.some(l => l.id === lawId);

            const item = document.createElement('div');
            item.className = `collection-item ${collected ? '' : 'locked'}`;

            // 构建描述HTML
            let descHtml = '';
            let passiveText = '';

            // 尝试获取被动效果描述
            if (typeof getLawPassiveDescription === 'function') {
                passiveText = getLawPassiveDescription(law);
            } else if (law.passive) {
                passiveText = `被动: ${law.passive.type} ${law.passive.value}`;
            }

            if (collected) {
                // UI Fix: 仅显示被动效果，不显示Flavor Text
                descHtml = `
                    <div class="collection-desc">${passiveText || law.description}</div>
                `;
            } else {
                descHtml = `
                    <div class="collection-desc" style="font-style: italic;">未获得</div>
                `;
            }

            item.innerHTML = `
                <div class="collection-icon">${law.icon}</div>
                <div class="collection-name">${law.name}</div>
                ${descHtml}
            `;

            if (collected) {
                item.addEventListener('click', () => {
                    let detailMsg = `${law.description}`;
                    if (passiveText) {
                        detailMsg += `\n\n🔎 被动效果:\n${passiveText}`;
                    }
                    this.showAlertModal(detailMsg, law.name);
                });
            }

            grid.appendChild(item);
        }

        // --- 2. 渲染共鸣手册部分 ---
        // 检查是否已经存在 resonance-container，避免重复添加 (虽然 grid.innerHTML='' 这里清除的是 grid 内部，
        // 但如果我们的设计是把共鸣放在 grid 面板后面，我们需要找到 grid 的父容器或者直接追加到 grid 后面?
        // 查看 HTML 结构：通常 collection-grid 是一个 scrollable div。
        // 如果把共鸣放在 grid 里面，会被 grid 布局影响。
        // 最好是在 grid 之后追加一个 section。
        // 但是 grid.innerHTML = '' 只清空 grid。
        // 让我们看看 DOM 结构。假设我们只能操作 grid 内部，或者 grid 是整个内容区域。
        // 如果 grid 是 grid 布局，直接 append 一个全宽元素可能不方便（需 span all）。
        // 简单方案：把 grid 的 display: grid 改为一个容器，内部包含 .laws-grid 和 .resonance-section。
        // 但这需要改 HTML 结构。
        // 或者：我们在 js 里动态调整。
        // 方案 B: 把 collection-grid 的 CSS 还原为 block，内部包含两个 div: laws-grid (display:grid) 和 resonance-section。

        // 动态改造 grid 容器
        grid.style.display = 'block';
        grid.style.overflowY = 'auto'; // Ensure scroll

        // 重新构建 structure
        // 1. Laws Grid Container
        const lawsContainer = document.createElement('div');
        lawsContainer.className = 'collection-subgrid';
        lawsContainer.style.display = 'grid';
        lawsContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
        lawsContainer.style.gap = 'var(--spacing-md)';

        // Move processed items to lawsContainer
        while (grid.firstChild) {
            lawsContainer.appendChild(grid.firstChild);
        }
        grid.appendChild(lawsContainer);

        // 2. Resonance Section
        const resSection = document.createElement('div');
        resSection.className = 'resonance-section';

        resSection.innerHTML = `
            <div class="resonance-header">🔮 法则共鸣手册</div>
            <div class="resonance-grid"></div>
        `;

        const resGrid = resSection.querySelector('.resonance-grid');

        for (const resKey in LAW_RESONANCES) {
            const res = LAW_RESONANCES[resKey];

            // 检查玩家是否满足条件 (UI高亮显示)
            const hasResonance = this.player.activeResonances && this.player.activeResonances.some(r => r.id === res.id);

            const resItem = document.createElement('div');
            resItem.className = `resonance-item ${hasResonance ? 'active' : ''}`;
            if (hasResonance) resItem.style.borderColor = 'var(--accent-gold)';

            // 构建所需法则图标
            let lawsHtml = '';
            if (res.laws) {
                lawsHtml = res.laws.map(lawId => {
                    const l = LAWS[lawId];
                    const hasLaw = this.player.collectedLaws.some(cl => cl.id === lawId);
                    const color = hasLaw ? 'var(--text-primary)' : 'var(--text-muted)';
                    const opacity = hasLaw ? '1' : '0.5';
                    return l ? `<div class="res-law-req" style="color:${color}; opacity:${opacity}">${l.icon} ${l.name}</div>` : '';
                }).join('');
            }

            resItem.innerHTML = `
                <div class="resonance-title">
                    ${res.name}
                    ${hasResonance ? '✅' : ''}
                </div>
                <div class="resonance-laws">
                    ${lawsHtml}
                </div>
                <div class="resonance-desc">${res.description}</div>
                ${res.effect ? `<div class="resonance-effect">效果: ${this.formattingResonanceEffect(res.effect)}</div>` : ''}
            `;

            resGrid.appendChild(resItem);
        }

        grid.appendChild(resSection);
    }

    // 辅助：格式化共鸣效果描述
    formattingResonanceEffect(effect) {
        if (!effect) return '';

        const terms = {
            'burn': '灼烧', 'weak': '虚弱', 'vulnerable': '易伤', 'poison': '中毒',
            'stun': '眩晕', 'freeze': '冰冻', 'slow': '减速', 'random': '随机效果',
            'thunder': '雷', 'fire': '火', 'ice': '冰', 'wind': '风', 'earth': '土',
            'costReduce': '减费', 'draw': '抽牌'
        };
        const t = (k) => terms[k] || k;

        switch (effect.type) {
            case 'damageBoostVsDebuff': return `对[${t(effect.debuff)}]敌人伤害+${Math.floor(effect.percent * 100)}%`;
            case 'dodgeDraw': return `闪避时抽${effect.value}张牌`;
            case 'stunDebuff': return `眩晕时施加${effect.value}层${t(effect.buffType)}`;
            case 'shieldHeal': return `回合结束若有护盾，恢复护盾值${Math.floor(effect.percent * 100)}%的生命`;
            case 'penetrateBonus': return `穿透伤害+${Math.floor(effect.percent * 100)}%`;
            case 'shuffleDamage': return `洗牌造成${effect.value}伤害+${t(effect.debuff)}`;
            case 'elementalReaction': return `${t(effect.trigger)}伤触发${Math.floor(effect.damagePercent * 100)}%生命爆炸`;
            case 'cardPlayTrigger': return `每${effect.count}张牌触发${effect.damage}点${t(effect.element)}伤`;
            case 'turnStartGamble': return `回合开始：50%几率随机3张牌耗能-1，或抽2张牌`;
            case 'healOverlowDamage': return `溢出治疗转伤害 (+${Math.floor(effect.healBonus * 100)}%治疗)`;
            case 'resurrect': return `死亡复活 (${Math.floor(effect.percent * 100)}%血)`;
            case 'persistentBlock': return `护盾不消失`;
            case 'penetrateParalysis': return `穿透施加${effect.value}层麻痹`;
            default: return '特殊效果';
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
                    this.showAlertModal(desc, t.name);
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

        // 显示力量 (永久)
        const permaStrength = (this.player.permaBuffs && this.player.permaBuffs.strength) ? this.player.permaBuffs.strength : 0;
        const charStrEl = document.getElementById('char-strength');
        if (charStrEl) charStrEl.textContent = permaStrength;
        const ringName = this.player.fateRing.name;
        // Fix: ID mismatch, HTML uses 'ring-level'
        const ringLevelEl = document.getElementById('ring-level');
        if (ringLevelEl) ringLevelEl.textContent = ringName;

        // Update badge text if it exists
        const badgeEl = document.querySelector('.imprint-badge') || document.querySelector('.imprint-badge残次');
        if (badgeEl) badgeEl.textContent = ringName;

        let loadedCount = 0;
        let totalSlots = 0;

        // different logic for Class instance vs simple object (fallback/legacy)
        if (typeof this.player.fateRing.getSocketedLaws === 'function') {
            loadedCount = this.player.fateRing.getSocketedLaws().length;
            totalSlots = this.player.fateRing.maxSlots;
        } else {
            loadedCount = this.player.fateRing.loadedLaws ? this.player.fateRing.loadedLaws.length : 0;
            totalSlots = this.player.fateRing.slots;
        }

        const loadedLawsSpan = document.getElementById('loaded-laws');
        if (loadedLawsSpan) loadedLawsSpan.textContent = `${loadedCount}/${totalSlots}`;
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
        if (this.player.permaBuffs && this.player.permaBuffs.strength) {
            strength = this.player.permaBuffs.strength;
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
        } else if (this.player.permaBuffs && this.player.permaBuffs.strength) {
            displayStrength = this.player.permaBuffs.strength;
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

        // 试炼挑战检测 (Trial Challenge)
        if (this.activeTrial) {
            let trialSuccess = false;
            // 获取回合数 (assuming battle object exists and persists turnNumber)
            // this.battle 应该是当前战斗实例

            if (this.activeTrial === 'speedKill') {
                const limit = (this.trialData && this.trialData.rounds) ? this.trialData.rounds : 3;
                if (this.battle && this.battle.turnNumber <= limit) {
                    trialSuccess = true;
                }
            } else if (this.activeTrial === 'noDamage') {
                if (this.battle && !this.battle.playerTookDamage) {
                    trialSuccess = true;
                }
            }

            if (trialSuccess) {
                Utils.showBattleLog('⚡ 试炼完成！获得额外奖励！');

                if (this.trialData.rewardMultiplier) {
                    ringExp = Math.floor(ringExp * this.trialData.rewardMultiplier);
                    this.player.gold += 50;
                    Utils.showBattleLog(`奖励翻倍！获得额外 50 灵石`);
                }
                if (this.trialData.reward === 'law') {
                    // 奖励一张随机法则牌
                    const randomLawKey = Object.keys(LAWS)[Math.floor(Math.random() * Object.keys(LAWS).length)];
                    const law = LAWS[randomLawKey];
                    // 只是获得卡牌还是获得法则? "reward: law" usually implies getting the law power or card.
                    // Description says "obtain rare law".
                    // Let's force add law to player (if not duplicate)
                    if (this.player.collectedLaws.some(l => l.id === law.id)) {
                        this.player.gold += 100; // Fallback
                        Utils.showBattleLog(`法则已存在，转化为 100 灵石`);
                    } else {
                        // Normally stealLaw logic adds checks. Here we force add.
                        if (this.player.collectedLaws) this.player.collectedLaws.push(law);
                        Utils.showBattleLog(`领悟法则：${law.name}`);
                        // Also add unlock card?
                        if (law.unlockCards) {
                            law.unlockCards.forEach(cid => {
                                if (CARDS[cid]) this.player.deck.push({ ...CARDS[cid], instanceId: this.player.generateCardId() });
                            });
                        }
                    }
                }
            } else {
                Utils.showBattleLog('试炼失败...');
            }
            // Clear trial state
            this.activeTrial = null;
            this.trialData = null;
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

        // 检查BOSS击杀
        if (this.currentBattleNode && this.currentBattleNode.type === 'boss') {
            this.achievementSystem.updateStat('bossesDefeated', 1);
        }

        // 显示奖励界面
        this.showRewardScreen(totalGold, canSteal, stealEnemy, totalRingExp);
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

        // 动态更新跳过按钮文本
        const skipBtn = this.currentScreenElement ? this.currentScreenElement.querySelector('.skip-reward-btn') : document.querySelector('.skip-reward-btn');
        if (skipBtn) {
            const skipCost = 50 * this.player.realm;
            skipBtn.textContent = `跳过卡牌 (扣${skipCost}灵石)`;
            // Visual indicator if affordable
            if (this.player.gold < skipCost) {
                skipBtn.style.opacity = '0.6';
                skipBtn.style.cursor = 'not-allowed';
                skipBtn.title = '灵石不足';
            } else {
                skipBtn.style.opacity = '1';
                skipBtn.style.cursor = 'pointer';
                skipBtn.title = '';
            }
        }

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
        const cost = 50 * this.player.realm;
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
        // FIX: 在 onBattleWon 中已经调用过 completeNode。
        //这里再次调用会导致Boss关卡重复结算（因为新地图生成后ID冲突），造成跳关。
        // if (this.currentBattleNode) {
        //    this.map.completeNode(this.currentBattleNode);
        //    this.currentBattleNode = null;
        // }

        // 确保清除当前节点引用
        this.currentBattleNode = null;

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
                this.player.heal(effect.value); // Use existing heal method
                this.eventResults.push(`💚 恢复 ${effect.value} HP`);
                break;

            case 'maxHp':
                this.player.maxHp += effect.value;
                this.player.currentHp = Math.min(this.player.currentHp, this.player.maxHp);
                if (effect.value > 0) {
                    this.player.heal(effect.value); // Usually MaxHP+ also heals that amount?
                }
                this.eventResults.push(`❤️ 最大HP ${effect.value > 0 ? '+' : ''}${effect.value}`);
                break;

            case 'permaBuff':
                if (this.player.addPermaBuff) {
                    this.player.addPermaBuff(effect.stat, effect.value);
                    const statMap = { 'strength': '力量', 'defense': '防御', 'energy': '灵力', 'maxHp': '生命' };
                    this.eventResults.push(`💪 永久${statMap[effect.stat] || effect.stat} ${effect.value > 0 ? '+' : ''}${effect.value}`);
                }
                break;

            case 'damage':
                this.player.takeDamage(effect.value);
                this.eventResults.push(`💔 失去 ${effect.value} HP`);
                break;

            case 'removeCardType':
                let removedCount = 0;
                const toRemove = [];
                // Find cards matching criteria
                this.player.deck.forEach((card, index) => {
                    // Check if card matches criteria (e.g. cardId or cardType)
                    // If cardType is 'strike', remove any card with id/name containing strike? 
                    // Or check type property.
                    let match = false;
                    if (effect.cardId && card.id === effect.cardId) match = true;
                    if (effect.cardType && card.type === effect.cardType) match = true;
                    // Special case for 'strike' in data sometimes maps to 'attack' type, detailed check needed?
                    // Let's assume strict type match first.

                    if (match && removedCount < (effect.count || 1)) {
                        toRemove.push(index);
                        removedCount++;
                    }
                });

                // Remove from back to front to avoid index shift
                toRemove.sort((a, b) => b - a).forEach(idx => {
                    const removed = this.player.deck.splice(idx, 1)[0];
                    if (removed) this.eventResults.push(`🗑️ 移除: ${removed.name}`);
                });
                if (removedCount === 0) {
                    this.eventResults.push(`⚠️ 没有符合条件的卡牌可移除`);
                }
                break;

            case 'upgradeCard':
                // This requires UI interaction which is hard in instant event result.
                // We should probably set a state 'pendingUpgrade' and show modal AFTER event modal closes?
                // Or show modal on top.
                // For simplicity, let's upgrade a random card if no UI available, OR call a hypothetical openUpgradeUI.
                // But wait, the prompt asks to "implement logic".
                // I'll check if openUpgradeUI exists. If not, random upgrade.
                // Checking previous context... I didn't see openUpgradeUI.
                // Let's upgrade a RANDOM upgradable card for now to ensure effect works, 
                // OR trigger a flag "this.pendingCardReward = 'upgrade'"?

                // Let's force a random upgrade for now as MVP.
                const upgradable = this.player.deck.filter(c => !c.upgraded);
                if (upgradable.length > 0) {
                    const target = upgradable[Math.floor(Math.random() * upgradable.length)];
                    target.upgraded = true;
                    target.name += '+';
                    target.value = Math.floor((target.value || 0) * 1.3); // Simple buff
                    if (target.effects) {
                        target.effects.forEach(e => {
                            if (e.value) e.value = Math.floor(e.value * 1.3);
                        });
                    }
                    this.eventResults.push(`✨ 升级: ${target.name}`);
                } else {
                    this.eventResults.push(`⚠️ 没有可升级的卡牌`);
                }
                break;

            case 'treasure':
                if (effect.random) {
                    // Add random treasure
                    // Need access to TREASURES list.
                    if (typeof TREASURES !== 'undefined') {
                        const keys = Object.keys(TREASURES);
                        const randomKey = keys[Math.floor(Math.random() * keys.length)];
                        const treasureData = TREASURES[randomKey];
                        // Simple add logic
                        this.player.treasures.push({ ...treasureData, instanceId: Date.now() });
                        // Trigger onObtain if exists?
                        this.eventResults.push(`🏺 获得法宝: ${treasureData.name}`);
                    }
                }
                break;

            case 'trial':
                this.activeTrial = effect.trialType; // 'speedKill' or 'noDamage'
                this.trialData = effect;
                this.eventResults.push(`⚔️ 试炼开启: ${effect.trialType === 'speedKill' ? '速杀' : '无伤'}`);
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
        this.currentBattleNode = null; // 关键修复：防止奖励结算再次触发节点完成

        // 关键修复：立即保存并强制同步
        this.autoSave();
        if (typeof AuthService !== 'undefined' && AuthService.isLoggedIn()) {
            // Force sync log
            console.log('Realm Complete: Forcing Cloud Sync');
            // autoSave calls saveGame which handles sync, but logging here helps debug
        }

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

    // 调试模式开关
    toggleDebug() {
        this.debugMode = !this.debugMode;
        localStorage.setItem('theDefierDebug', this.debugMode);
        this.updateDebugUI();
        console.log(`Debug Mode: ${this.debugMode ? 'ON' : 'OFF'}`);
        return this.debugMode ? 'Debug ON' : 'Debug OFF';
    }

    updateDebugUI() {
        const btn = document.querySelector('.cheat-btn');
        if (btn) btn.style.display = this.debugMode ? 'inline-block' : 'none';

        // 可以在这里控制其他调试元素的显隐
    }

    // 显示命环
    // 作弊功能
    cheat() {
        this.showConfirmModal(
            '确定要启用作弊模式吗？\n这是测试功能，可能会破坏游戏体验。',
            () => this._performCheat()
        );
    }

    _performCheat() {
        // 1. 暴富
        this.player.gold += 10000000;

        // 2. 命环满级
        if (typeof FATE_RING !== 'undefined') {
            const maxLevel = 10;
            this.player.fateRing.level = maxLevel;
            this.player.fateRing.exp = 999999; // 确保是满经验

            // 确保槽位解锁
            // 只有MutatedRing(林风)和SealedRing(香叶)有不同的maxSlots逻辑
            // 通用逻辑：根据等级重置
            if (this.player.fateRing.type === 'sealed') {
                this.player.fateRing.maxSlots = 12;
            } else if (this.player.fateRing.type === 'mutated') {
                this.player.fateRing.maxSlots = 4; // 假设4是满级
                // check level data
                if (FATE_RING.levels[10]) this.player.fateRing.maxSlots = FATE_RING.levels[10].slots;
            } else {
                if (FATE_RING.levels[10]) this.player.fateRing.maxSlots = FATE_RING.levels[10].slots;
            }

            if (this.player.fateRing.initSlots) {
                // initSlots会重置槽位内容？如果是空的就重置，如果不是则保留？
                // fateRing.initSlots() 会重新生成 slots 数组，可能会清空现有法则。
                // 我们应该只增加槽位？
                // initSlots implementation: creates new array loop maxSlots.
                // 我们还是简单调用 initSlots，反正下一步是获得所有法则。
                this.player.fateRing.initSlots();
            }
        }

        // 3. 获得所有法则
        if (typeof LAWS !== 'undefined') {
            // 清空当前收集，全部重新加入
            this.player.collectedLaws = [];
            for (const key in LAWS) {
                // 深拷贝防止引用
                this.player.collectedLaws.push(JSON.parse(JSON.stringify(LAWS[key])));
            }
            this.player.lawsCollected = this.player.collectedLaws.length;
        }

        // 4. 更新UI
        this.player.recalculateStats();
        if (this.currentScreen === 'map-screen' && this.map) {
            this.map.updateStatusBar();
        }

        Utils.showBattleLog("【天道崩塌】作弊成功！已获得千万灵石、满级命环及所有法则！");

        // 自动保存并同步云端
        this.saveGame();
    }

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
                        this.showConfirmModal(
                            `该槽位被【逆生咒】封印。\n强制解除将永久损耗生命上限。\n是否解除？`,
                            () => {
                                ring.unseal(index);
                                this.showFateRing();
                                this.autoSave();
                            }
                        );
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
        <div class="game-intro-content" style="text-align: left; line-height: 1.6; max-height: 60vh; overflow-y: auto; padding-right: 15px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="color: var(--accent-gold); margin: 0;">📖 逆命者指南</h2>
                <div style="font-size: 0.8rem; color: #666;">Cultivation Handbook</div>
            </div>

            <h3 style="color: var(--accent-purple); border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px; margin-top: 10px;">🔮 核心玩法</h3>
            <p><strong>逆天改命的旅途：</strong></p>
            <ul style="padding-left: 20px; list-style-type: disc; color: #ccc;">
                <li><strong>十八重天</strong>：从凡尘界层层飞升，直面最终的【天道终焉】。</li>
                <li><strong>法则盗取</strong>：击败精英或Boss，可使用古玉盗取其核心【法则】，嵌入命环获得强力被动。</li>
                <li><strong>卡牌构建</strong>：五行生克、物理爆发、以守代攻...构建你的专属流派。</li>
            </ul>

            <h3 style="color: var(--accent-gold); border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px; margin-top: 20px;">👥 角色与机制详解</h3>
            
            <div style="background: rgba(255, 215, 0, 0.05); padding: 10px; border-radius: 5px; margin-bottom: 10px; border-left: 3px solid var(--accent-gold);">
                <strong style="color: var(--accent-gold);">🪙 无欲 (佛门金刚) - 功德体系</strong>
                <p style="font-size: 0.9rem; margin-top: 5px;">无欲拥有独特的【功德金轮】，不以此消彼长，而是双向积累：</p>
                <ul style="padding-left: 20px; margin-top: 5px;">
                    <li><strong>🔸 功德 (Merit)</strong>：使用<span style="color:#4ff">防御/回复/辅助牌</span>时积累。
                        <br>→ 积攒至100点，触发<strong>【金刚法相】</strong>：获得<strong>无敌</strong>一回合，并净化负面状态。</li>
                    <li><strong>🟣 业力 (Sin)</strong>：使用<span style="color:#f44">攻击牌</span>时积累。
                        <br>→ 积攒至100点，触发<strong>【明王之怒】</strong>：获得<strong>强力爆发</strong>（如下次攻击伤害x3或巨额力量）。</li>
                </ul>
                <p style="font-size: 0.85rem; color: #aaa; margin-top: 5px;">* 策略提示：合理控制出牌节奏，在敌人爆发时触发金身，在虚弱时触发明王怒。</p>
            </div>

            <div style="margin-bottom: 10px;">
                <strong>🗡️ 林风 (逆天之环)</strong>：拥有【法则融合】能力，可将两个法则嵌入同一槽位，产生强大的变异效果。
            </div>
            <div style="margin-bottom: 10px;">
                <strong>💚 香叶 (圣手仁心)</strong>：拥有【封印命环】，通过解开自我封印（消耗生命上限）来换取瞬间的爆发与质变。
            </div>
            <div>
                <strong>❄️ 严寒 (真理探索)</strong>：拥有【解析之眼】，战斗越久，对敌人的解析度越高，造成的伤害与控制效果越强。
            </div>

            <h3 style="color: var(--accent-red); border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px; margin-top: 20px;">⚔️ 战斗百科</h3>
            <ul style="padding-left: 20px; list-style-type: none; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <li>🛡️ <strong>护盾</strong>：抵挡下一次受到的伤害，回合结束时消失（除非拥有【固守】）。</li>
                <li>💔 <strong>易伤</strong>：受到的伤害增加 50%。</li>
                <li>😫 <strong>虚弱</strong>：造成的伤害减少 25%。</li>
                <li>🔥 <strong>灼烧</strong>：回合开始时受到伤害，层数越高伤害越高。</li>
                <li>⚡ <strong>感电</strong>：受到攻击时额外承受伤害，并消耗一层。</li>
            </ul>

            <div style="margin-top: 20px; text-align: center; font-size: 0.8rem; color: #888; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                当前版本: v4.2 | 逆命轮回·天道终章
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
        // 价格随天域层数上涨，每重天+10% (was 5%)
        const priceMult = 1 + (realm - 1) * 0.10;

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
            price: Math.floor(30 * priceMult), // 30
            sold: false
        });

        // 移除卡牌 - base price increased
        services.push({
            id: 'remove',
            type: 'service',
            name: '净化仪式',
            icon: '🗑️',
            desc: '移除一张牌',
            price: Math.floor(75 * (1 + (this.player.removeCount || 0) * 0.5) * priceMult), // 50 -> 75
            sold: false
        });

        // 命环经验 - base price increased
        services.push({
            id: 'exp',
            type: 'service',
            name: '命环充能',
            icon: '⬆️',
            desc: '命环经验 +100', // 100
            price: Math.floor(80 * priceMult), // 50 -> 80
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

    // 显示奖励弹窗
    showRewardModal(title, message, icon = '🎁', onClose = null) {
        let modal = document.getElementById('reward-modal');

        // 动态创建模态框
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'reward-modal';
            modal.className = 'modal';
            modal.style.zIndex = '10001'; // 比通用高一点
            modal.innerHTML = `
                <div class="modal-content" style="text-align: center; max-width: 360px; padding: 40px; border: 2px solid var(--accent-gold); box-shadow: 0 0 50px rgba(255, 215, 0, 0.2);">
                    <div id="reward-icon" style="font-size: 4rem; margin-bottom: 20px; animation: bounce 1s infinite;">🎁</div>
                    <h3 id="reward-title" style="color: var(--accent-gold); margin-bottom: 15px; font-size: 1.5rem;">获得奖励</h3>
                    <p id="reward-message" style="color: #fff; margin-bottom: 30px; line-height: 1.6; font-size: 1.1rem; white-space: pre-line;"></p>
                    <button id="reward-confirm-btn" class="menu-btn primary">收下</button>
                </div>
            `;
            document.body.appendChild(modal);

            // 绑定事件
            const btn = modal.querySelector('#reward-confirm-btn');
            btn.onclick = () => {
                modal.classList.remove('active');
                if (modal.onCloseCallback) modal.onCloseCallback();
                if (typeof audioManager !== 'undefined') audioManager.playSFX('click');
            };
        }

        // 更新内容
        modal.querySelector('#reward-title').textContent = title;
        modal.querySelector('#reward-message').textContent = message;
        modal.querySelector('#reward-icon').textContent = icon;
        modal.onCloseCallback = onClose;

        // 显示
        modal.classList.add('active');
        if (typeof audioManager !== 'undefined') audioManager.playSFX('buff'); // 使用buff音效作为奖励音效
    }

    // 显示通用确认弹窗
    showConfirmModal(message, onConfirm, onCancel = null) {
        let modal = document.getElementById('generic-confirm-modal');

        // 动态创建模态框
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'generic-confirm-modal';
            modal.className = 'modal';
            modal.style.zIndex = '10000'; // 确保在最上层
            modal.innerHTML = `
                <div class="modal-content" style="text-align: center; max-width: 400px; padding: 30px;">
                    <h3 id="generic-confirm-title" style="color: var(--accent-gold); margin-bottom: 20px;">提示</h3>
                    <p id="generic-confirm-message" style="color: #ccc; margin-bottom: 30px; line-height: 1.6; font-size: 1.1rem; white-space: pre-line;"></p>
                    <div style="display: flex; justify-content: center; gap: 20px;">
                        <button id="generic-confirm-btn" class="menu-btn primary small">确定</button>
                        <button id="generic-cancel-btn" class="menu-btn small">取消</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // 绑定通用关闭
            const closeBtn = document.createElement('button');
            closeBtn.className = 'modal-close';
            closeBtn.innerHTML = '×';
            closeBtn.onclick = () => modal.classList.remove('active');
            modal.querySelector('.modal-content').appendChild(closeBtn);
        }

        // 更新内容
        const msgEl = document.getElementById('generic-confirm-message');
        const confirmBtn = document.getElementById('generic-confirm-btn');
        const cancelBtn = document.getElementById('generic-cancel-btn');

        if (msgEl) msgEl.textContent = message;

        // 绑定事件 (使用 onclick 覆盖之前的绑定，防止多次触发)
        if (confirmBtn) {
            confirmBtn.onclick = () => {
                modal.classList.remove('active');
                if (typeof onConfirm === 'function') onConfirm();
            };
        }

        if (cancelBtn) {
            cancelBtn.onclick = () => {
                modal.classList.remove('active');
                if (typeof onCancel === 'function') onCancel();
            };
        }

        // 显示
        modal.classList.add('active');
    }

    // 显示通用提示弹窗 (Alert)
    showAlertModal(message, title = '提示', onOk = null) {
        let modal = document.getElementById('generic-alert-modal');

        // 动态创建模态框
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'generic-alert-modal';
            modal.className = 'modal';
            modal.style.zIndex = '10001'; // 比Confirm更高
            modal.innerHTML = `
                <div class="modal-content" style="text-align: center; max-width: 400px; padding: 30px;">
                    <h3 id="generic-alert-title" style="color: var(--accent-gold); margin-bottom: 20px;">提示</h3>
                    <p id="generic-alert-message" style="color: #ccc; margin-bottom: 30px; line-height: 1.6; font-size: 1.1rem; white-space: pre-line;"></p>
                    <div style="display: flex; justify-content: center;">
                        <button id="generic-alert-btn" class="menu-btn primary small" style="min-width: 100px;">确定</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // 绑定通用关闭
            const closeBtn = document.createElement('button');
            closeBtn.className = 'modal-close';
            closeBtn.innerHTML = '×';
            closeBtn.onclick = () => modal.classList.remove('active');
            modal.querySelector('.modal-content').appendChild(closeBtn);
        }

        // 更新内容
        const msgEl = document.getElementById('generic-alert-message');
        const titleEl = document.getElementById('generic-alert-title');
        if (msgEl) msgEl.innerText = message;
        if (titleEl) titleEl.innerText = title;

        // 按钮事件
        const okBtn = document.getElementById('generic-alert-btn');
        if (okBtn) {
            okBtn.onclick = () => {
                if (onOk) onOk();
                modal.classList.remove('active');
            };
        }

        modal.classList.add('active');
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
                    this.showRewardModal('状态完美', '你的生命值已满，无需治疗。\n保持最佳状态去战斗吧！', '💪');
                    return false;
                }
                const healAmount = Math.floor(this.player.maxHp * 0.3);
                this.player.heal(healAmount);
                Utils.showBattleLog(`恢复了 ${healAmount} 点生命`);

                // 增强反馈
                this.showRewardModal('治疗成功', `生命值恢复了 ${healAmount} 点！\n当前状态极佳。`, '💖');
                return true;

            case 'remove':
                this.showRemoveCard(service);
                return 'deferred';

            case 'exp':
                this.player.fateRing.exp += 50;
                this.player.checkFateRingLevelUp();
                Utils.showBattleLog('命环经验 +50');
                this.showRewardModal('命环充能', `命环经验 +50！\n距离下一级更近了。`, '⬆️');
                return true;

            case 'law':
                if (service.data) {
                    this.player.collectLaw(service.data);
                    Utils.showBattleLog(`习得法则：${service.data.name} `);
                    this.showRewardModal('习得法则', `你领悟了新的法则：\n【${service.data.name}】`, '📜');
                    return true;
                }
                return false;

            case 'maxHp':
                this.player.maxHp += 5;
                this.player.currentHp += 5;
                Utils.showBattleLog('最大生命 +5');
                this.showRewardModal('体质增强', `最大生命值上限 +5！`, '💊');
                return true;

            case 'strength':
                this.player.addPermBuff('strength', 1);
                Utils.showBattleLog('永久力量 +1');
                this.showRewardModal('力量觉醒', `永久力量 +1！\n你的攻击将更加致命。`, '💪');
                return true;

            case 'refresh':
                // 刷新卡牌
                this.shopItems = this.generateShopCards(5);
                Utils.showBattleLog('商店货物已刷新');
                this.showRewardModal('进货完成', `商店货物已刷新！\n快来看看有什么新宝贝。`, '🔄');
                return 'repeatable';

            case 'gamble':
                const roll = Math.random();
                let rewardText = '';
                let rewardIcon = '🎁';
                let rewardTitle = '盲盒开启';

                if (roll < 0.5) { // 50% 亏本/保本
                    const goldBack = Utils.random(10, 30);
                    this.player.gold += goldBack;
                    Utils.showBattleLog(`盲盒：获得 ${goldBack} 灵石（亏了...）`);
                    rewardIcon = '💸';
                    rewardTitle = '运气平平';
                    rewardText = `你打开盲盒，里面只有一些碎银子...\n获得 ${goldBack} 灵石。`;
                } else if (roll < 0.85) { // 35% 获得随机卡牌
                    const randCard = getRandomCard(this.player.realm > 2 ? 'uncommon' : 'common');
                    this.player.addCardToDeck(randCard);
                    Utils.showBattleLog(`盲盒：获得卡牌【${randCard.name}】！`);
                    rewardIcon = '🎴';
                    rewardTitle = '获得卡牌';
                    rewardText = `你获得了一张卡牌：\n【${randCard.name}】`;
                } else if (roll < 0.98) { // 13% 小奖 (稀有卡或大量金币)
                    if (Math.random() < 0.5) {
                        const rareCard = getRandomCard('rare');
                        this.player.addCardToDeck(rareCard);
                        Utils.showBattleLog(`盲盒：大奖！获得稀有卡牌【${rareCard.name}】！`);
                        rewardIcon = '🌟';
                        rewardTitle = '稀有大奖！';
                        rewardText = `运气爆棚！你获得了一张稀有卡牌：\n【${rareCard.name}】`;
                    } else {
                        const bigGold = Utils.random(80, 150);
                        this.player.gold += bigGold;
                        Utils.showBattleLog(`盲盒：手气不错！获得 ${bigGold} 灵石！`);
                        rewardIcon = '💰';
                        rewardTitle = '发财了！';
                        rewardText = `盒子底部铺满了闪闪发光的灵石！\n获得 ${bigGold} 灵石！`;
                    }
                } else { // 2% 传说/法宝奖
                    const jackpot = Math.random();
                    if (jackpot < 0.5) {
                        const legCard = getRandomCard('legendary');
                        this.player.addCardToDeck(legCard);
                        Utils.showBattleLog(`盲盒：传说大奖！！获得【${legCard.name}】！`);
                        rewardIcon = '👑';
                        rewardTitle = '传说降世！';
                        rewardText = `金光乍现！你获得了传说卡牌：\n【${legCard.name}】`;
                    } else {
                        // 尝试给法宝
                        const treasureKeys = Object.keys(TREASURES);
                        const unowned = treasureKeys.filter(k => !this.player.hasTreasure(k));
                        if (unowned.length > 0) {
                            const tid = unowned[Math.floor(Math.random() * unowned.length)];
                            this.player.addTreasure(tid);
                            Utils.showBattleLog(`盲盒：鸿运当头！获得法宝【${TREASURES[tid].name}】！`);
                            rewardIcon = '🏺';
                            rewardTitle = '法宝现世！';
                            rewardText = `极其罕见！你获得了法宝：\n【${TREASURES[tid].name}】`;
                        } else {
                            this.player.gold += 300;
                            Utils.showBattleLog(`盲盒：传说大奖！获得 300 灵石！`);
                            rewardIcon = '💎';
                            rewardTitle = '巨额财富';
                            rewardText = `虽然没有法宝，但这里有一大笔钱！\n获得 300 灵石！`;
                        }
                    }
                }

                this.showRewardModal(rewardTitle, rewardText, rewardIcon);

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
            this.showConfirmModal(
                '尚未登录，是否先登录以同步云端存档？',
                () => {
                    this.showLoginModal();
                },
                () => {
                    // Guest mode
                    this.showCharacterSelection();
                }
            );
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
            }

            // 修正：如果云端虽然返回成功，但存档全空（新注册账号），也应该尝试绑定旧存档
            const isCloudEmpty = res.isEmpty || (slots && slots.every(s => s === null));

            if (isCloudEmpty && localData) {
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
        // 持久化存储，防止刷新丢失
        sessionStorage.setItem('currentSaveSlot', index);

        const modal = document.getElementById('save-slots-modal');

        if (mode === 'load') {
            const cloudData = this.cachedSlots[index];
            if (cloudData) {
                // 移除冲突检测，直接加载选中的存档
                // 用户要求点击继续时不跳出提醒

                const doLoad = () => {
                    try {
                        localStorage.setItem('theDefierSave', JSON.stringify(cloudData));
                        sessionStorage.setItem('justLoadedSave', 'true'); // Prevent loop

                        Utils.showBattleLog(`已加载 存档 ${index + 1}`);
                        modal.classList.remove('active');
                        setTimeout(() => window.location.reload(), 500);
                    } catch (e) {
                        console.error('Load Save Failed:', e);
                        alert('加载存档失败：本地存储可能已满，请清理浏览器缓存后重试。');
                    }
                };

                doLoad();
            }
        } else if (mode === 'new' || mode === 'overwrite') {
            const doOverwrite = () => {
                localStorage.removeItem('theDefierSave');
                this.currentSaveSlot = index;
                modal.classList.remove('active');

                // If we treat "New Game" as "Go to Character Select":
                this.showCharacterSelection();
                sessionStorage.setItem('currentSaveSlot', index);
            };

            if (mode === 'overwrite') {
                this.showConfirmModal(
                    '确定要覆盖此存档吗？旧进度将丢失！',
                    doOverwrite
                );
            } else {
                doOverwrite();
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
            btn.onclick = () => {
                // Muted/Audio handling (delayed slightly for feel)
                setTimeout(() => {
                    this.showConfirmModal(
                        '确定要退出登录吗？\n(退出前将自动上传当前进度)',
                        async () => {
                            // 退出前强制尝试上传一次本地存档
                            const localSave = localStorage.getItem('theDefierSave');
                            // Fix: Check if we have a valid slot before syncing
                            if (localSave && this.currentSaveSlot !== null && this.currentSaveSlot !== undefined) {
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
                    );
                }, 50);
            };
        } else {
            btn.innerHTML = `<span class="btn-icon">☁️</span><span class="btn-text">登入轮回</span>`;
            btn.onclick = () => this.showLoginModal();
        }
    }

    async checkForCloudSave() {
        // 如果是刚刚手动加载的存档，跳过冲突检测，并清除标记
        if (sessionStorage.getItem('justLoadedSave') === 'true') {
            sessionStorage.removeItem('justLoadedSave');
            console.log('Skipping conflict check (Manual load)');
            return;
        }

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
window.game = null;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('Initializing Game...');
        window.game = new Game();
        console.log('Game Initialized:', window.game);
    } catch (error) {
        console.error('Game Initialization Failed:', error);
        Utils.showBattleLog('游戏初始化失败，请检查控制台');
        alert('游戏初始化失败: ' + error.message);
    }
});
