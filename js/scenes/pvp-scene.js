/**
 * The Defier - PVP Scene Controller (Ink & Gold Edition)
 * 天道榜界面逻辑 - 适配新UI
 */

window.PVPScene = {
    activeTab: 'ranking',
    activeShopCategory: 'all', // Shop Category state
    selectedPersonality: 'balanced', // Default
    isMatching: false, // 匹配锁，防止重复请求导致状态竞争
    matchingTimeoutMs: 8000,
    PERSONA_RULES: {
        balanced: { damageMul: 1.0, takenMul: 1.0, regenEnergyPerTurn: 1, hpMul: 1.0 },
        slaughter: { damageMul: 1.2, takenMul: 1.1, regenEnergyPerTurn: 0, hpMul: 1.0 },
        longevity: { damageMul: 0.85, takenMul: 0.95, regenEnergyPerTurn: 0, hpMul: 1.3 }
    },

    onShow() {
        this.setMatchingState(false);
        this.updateMyRankInfo();
        this.switchTab('ranking');
    },

    getGameRef() {
        if (typeof game !== 'undefined' && game) return game;
        if (typeof window !== 'undefined' && window.game) return window.game;
        return null;
    },

    setMatchingState(isBusy) {
        this.isMatching = !!isBusy;
        const btn = document.querySelector('#tab-ranking .challenge-btn');
        const text = btn ? btn.querySelector('.text') : null;
        if (!btn) return;
        btn.disabled = !!isBusy;
        if (text) {
            text.textContent = isBusy ? '⏳ 神念匹配中...' : '⚔️ 论道切磋';
        }
        btn.classList.toggle('is-matching', !!isBusy);
    },

    getPersonalityRuleSet(type) {
        return this.PERSONA_RULES[type] || this.PERSONA_RULES.balanced;
    },

    switchTab(tabName) {
        this.activeTab = tabName;

        // Update Runes
        document.querySelectorAll('.rune-tab').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.rune-tab[onclick*="'${tabName}'"]`);
        if (activeBtn) activeBtn.classList.add('active');

        // Update Content Panes
        document.querySelectorAll('.pvp-tab-pane').forEach(el => {
            el.classList.remove('active');
            el.style.display = ''; // Clear inline style if present
        });

        const activePane = document.getElementById(`tab-${tabName}`);
        if (activePane) {
            activePane.classList.add('active');
        }

        // Load Data
        if (tabName === 'ranking') this.loadRankings();
        if (tabName === 'defense') this.loadDefenseInfo();
        if (tabName === 'shop') this.loadShop();
    },

    async updateMyRankInfo() {
        if (!PVPService || typeof PVPService.syncRank !== 'function') return;
        if (!PVPService.currentRankData) await PVPService.syncRank();
        const info = PVPService.currentRankData || null;
        const tierEl = document.getElementById('my-rank-tier');
        const scoreEl = document.getElementById('my-rank-score');
        if (info) {
            if (tierEl) tierEl.textContent = info.division || (PVPService.getDivisionByScore ? PVPService.getDivisionByScore(info.score || 1000) : '潜龙榜');
            if (scoreEl) scoreEl.textContent = info.score || 1000;
        } else {
            if (tierEl) tierEl.textContent = '潜龙榜';
            if (scoreEl) scoreEl.textContent = '1000';
        }
    },

    // === Ranking (Jade Slips) ===
    async loadRankings() {
        const listEl = document.getElementById('ranking-list');
        if (!listEl) return;
        const startedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        // Keep loading spinner if empty, or clear
        listEl.innerHTML = `
            <div class="loading-ink">
                 <div class="spinner"></div>
                 <span>读取天机中...</span>
            </div>
        `;

        try {
            if (!PVPService || typeof PVPService.getLeaderboard !== 'function') {
                throw new Error('PVPService unavailable');
            }
            const rankings = await PVPService.getLeaderboard();
            listEl.innerHTML = '';

            if (!rankings || rankings.length === 0) {
                listEl.innerHTML = '<div class="loading-ink"><span>暂无榜单数据</span></div>';
                return;
            }

            rankings.forEach((rank, index) => {
                const row = document.createElement('div');
                row.className = 'jade-slip-row';
                if (index === 0) row.classList.add('rank-1');
                if (index === 1) row.classList.add('rank-2');
                if (index === 2) row.classList.add('rank-3');

                row.style.animationDelay = `${index * 0.1}s`; // Stagger animation

                const user = rank.user || { username: '未知修士' };
                const realmName = rank.realm ? `第${rank.realm}层` : '未知境界';
                // Avatar Initials
                const avatarChar = user.username ? user.username.charAt(0).toUpperCase() : '?';

                row.innerHTML = `
                    <div class="rank-index">${index + 1}</div>
                    
                    <div class="rank-avatar-container">
                        <div class="rank-avatar">${avatarChar}</div>
                        <div class="rank-aura"></div>
                    </div>
                    
                    <div class="rank-info">
                        <span class="rank-name">${user.username}</span>
                        <div class="rank-realm-badge">${realmName}</div>
                    </div>
                    
                    <div class="rank-score-display">${rank.score}</div>
                `;
                listEl.appendChild(row);
            });
            if (window.game && window.game.performanceStats) {
                const duration = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - startedAt;
                const arr = window.game.performanceStats.pvpLoadDurations || [];
                arr.push(duration);
                if (arr.length > 20) arr.shift();
                window.game.performanceStats.pvpLoadDurations = arr;
            }
        } catch (e) {
            listEl.innerHTML = '<div class="loading-ink" style="color:#f44">读取失败，请检查网络</div>';
            console.error(e);
        }
    },

    async findMatch() {
        if (this.isMatching) {
            Utils.showBattleLog("正在匹配中，请稍候...");
            return;
        }

        this.setMatchingState(true);
        try {
            if (!PVPService || typeof PVPService.findOpponent !== 'function') {
                Utils.showBattleLog("匹配服务未就绪");
                return;
            }
            if (!PVPService.currentRankData) await PVPService.syncRank();
            const score = PVPService.currentRankData ? PVPService.currentRankData.score : 1000;
            const realm = PVPService.currentRankData ? PVPService.currentRankData.realm : 1;

            Utils.showBattleLog("神念搜寻中...");
            const timeoutMs = Math.max(2000, Number(this.matchingTimeoutMs) || 8000);
            const timeoutResult = new Promise((resolve) => {
                setTimeout(() => resolve({ success: false, timeout: true, message: '匹配超时，切换离线演武中...' }), timeoutMs);
            });
            let result = await Promise.race([
                PVPService.findOpponent(score, realm, { allowPractice: true }),
                timeoutResult
            ]);

            if (result && result.timeout && typeof PVPService.createPracticeOpponent === 'function') {
                result = PVPService.createPracticeOpponent(score, realm, 'timeout');
            }

            if (result.success) {
                if (result.opponent && result.opponent.rank && result.opponent.rank.isLocal) {
                    Utils.showBattleLog("已进入离线演武匹配");
                }
                this.startPVPBattle(result.opponent);
            } else {
                Utils.showBattleLog(result.message || "未找到合适的对手");
            }
        } catch (e) {
            console.error("PVP matching failed:", e);
            Utils.showBattleLog("匹配失败，请稍后重试");
        } finally {
            this.setMatchingState(false);
        }
    },

    startPVPBattle(opponentData) {
        try {
            const gameRef = (typeof game !== 'undefined' && game)
                ? game
                : ((typeof window !== 'undefined' && window.game) ? window.game : null);
            if (!gameRef) {
                Utils.showBattleLog("游戏实例未就绪，无法开始 PvP");
                return;
            }

            if (!opponentData || !opponentData.battleData) {
                console.error("Opponent data invalid", opponentData);
                Utils.showBattleLog("对手数据异常，无法开始");
                return;
            }

            const ghostData = opponentData.battleData;
            const ghostConfig = (opponentData.ghost && opponentData.ghost.config) ? opponentData.ghost.config : {};
            const opponentUserId = (opponentData.ghost && opponentData.ghost.user && opponentData.ghost.user.objectId)
                || (opponentData.rank && opponentData.rank.user && opponentData.rank.user.objectId)
                || 'ghost';
            const opponentUsername = (opponentData.rank && opponentData.rank.user && opponentData.rank.user.username)
                ? opponentData.rank.user.username
                : '未知对手';

            // Construct Ghost
            const ghost = new GhostEnemy({
                userId: opponentUserId,
                name: `幻影·${opponentUsername}`,
                maxHp: ghostData.me ? ghostData.me.maxHp : 100, // Fallback
                deck: ghostData.deck || [],
                currentHp: ghostData.me ? ghostData.me.maxHp : 100,
                maxEnergy: ghostData.me ? (ghostData.me.energy || 3) : 3,
                energy: ghostData.me ? (ghostData.me.currEnergy || ghostData.me.energy || 3) : 3,
                config: {
                    ...ghostConfig,
                    aiProfile: ghostData.aiProfile || ghostConfig.personality || 'balanced',
                    personalityRules: ghostData.personalityRules || this.getPersonalityRuleSet(ghostConfig.personality || 'balanced')
                }
            });

            gameRef.pvpOpponentRank = opponentData.rank;
            gameRef.pvpMatchTicket = opponentData.matchTicket || null;

            // Initialize Battle
            if (typeof gameRef.startBattle === 'function') {
                gameRef.startBattle([ghost], null);
            } else if (gameRef.battle && typeof gameRef.battle.init === 'function') {
                console.log("Initializing PVP Battle with:", ghost);
                gameRef.mode = 'pvp';
                gameRef.showScreen('battle-screen');
                gameRef.battle.init([ghost]);
            } else {
                console.error("Battle module not ready");
                Utils.showBattleLog("战斗模块初始化失败");
                gameRef.showScreen('index'); // Return to safe screen
            }
        } catch (e) {
            console.error("PVP Start Crash:", e);
            Utils.showBattleLog("切磋启动失败，请查看控制台");
            if (typeof game !== 'undefined' && game) {
                game.mode = 'pve';
                game.pvpMatchTicket = null;
                game.pvpOpponentRank = null;
            }
            // Attempt to return to PVP screen
            setTimeout(() => {
                if (typeof game !== 'undefined' && game && typeof game.showScreen === 'function') {
                    game.showScreen('main-menu');
                    this.switchTab('ranking');
                }
            }, 1000);
        }
    },

    // === Defense Config ===

    // === Defense Config ===

    // === Defense Config ===

    // Personality Selector
    selectPersonality(type) {
        this.selectedPersonality = type;
        // Visual update for new DAO Cards
        document.querySelectorAll('.dao-card').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.val === type) el.classList.add('active');
        });

        // Update Description
        const descEl = document.getElementById('dao-desc-text');
        if (descEl) {
            let text = "";
            let color = "rgba(255,255,255,0.6)";

            switch (type) {
                case 'balanced':
                    text = "【万法自然】<br>均衡之道。不仅平衡攻防，战斗中每回合还能额外回复 1 点灵力。";
                    color = "#aaddff";
                    break;
                case 'slaughter':
                    text = "【杀伐证道】<br>进攻是最好的防守。造成的伤害 +20%，但承受伤害增加 10%。";
                    color = "#ff8888";
                    break;
                case 'longevity':
                    text = "【长生久视】<br>活着才有输出。最大生命值 +30%，造成的伤害降低 15%。";
                    color = "#88ff88";
                    break;
                default:
                    text = "请选择阵灵的道心倾向...";
            }
            descEl.innerHTML = text;
            descEl.style.color = color;
        }
    },

    updateFormationVisuals() {
        const toggle = document.getElementById('guardian-formation');
        const isActive = toggle ? toggle.checked : false;

        const visualizer = document.querySelector('.defense-layout-split'); // Use container to scope active state
        const statusText = document.getElementById('formation-status-text');

        // Update Status Text on control panel
        if (statusText) {
            if (isActive) {
                statusText.textContent = "运行中";
                statusText.className = "value status-active";
            } else {
                statusText.textContent = "未激活";
                statusText.className = "value status-inactive";
            }
        }

        // Trigger animations via parent class
        if (visualizer) {
            if (isActive) {
                visualizer.classList.add('active-formation');
            } else {
                visualizer.classList.remove('active-formation');
            }
        }
    },

    async loadDefenseInfo() {
        const toggle = document.getElementById('guardian-formation');
        const visualizer = document.querySelector('.defense-layout-split');
        const statusText = document.getElementById('formation-status-text');
        const powerVal = document.getElementById('def-power-val');
        const defTime = document.getElementById('def-time');

        // Reset UI State
        if (toggle) toggle.checked = false;
        if (visualizer) visualizer.classList.remove('active-formation');
        if (statusText) {
            statusText.textContent = "未激活";
            statusText.className = "value status-inactive";
        }
        if (powerVal) powerVal.textContent = "---";
        if (defTime) defTime.textContent = "上次注入: 无记录";

        // Fetch Data
        try {
            const snapshot = await PVPService.getMyDefenseSnapshot();

            if (snapshot) {
                // Update UI with real data
                const config = snapshot.config || {};
                const isActive = config.guardianFormation || false;

                if (toggle) toggle.checked = isActive;

                // Visuals
                this.updateFormationVisuals();

                if (powerVal) powerVal.textContent = snapshot.powerScore || 0;

                if (snapshot.saveTime) {
                    const date = new Date(snapshot.saveTime);
                    const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
                    if (defTime) defTime.textContent = `上次注入: ${timeStr}`;
                }

                // Personality
                if (config.personality) {
                    this.selectPersonality(config.personality);
                }
            }
        } catch (e) {
            console.warn("Failed to load defense info:", e);
        }
    },

    async uploadDefense() {
        const gameRef = this.getGameRef();
        if (!gameRef || !gameRef.player) {
            Utils.showBattleLog("请先进入游戏选择角色");
            return;
        }

        const toggle = document.getElementById('guardian-formation');
        const formation = !!(toggle && toggle.checked);
        const deck = Array.isArray(gameRef.player.deck) ? gameRef.player.deck : [];

        const snapshot = {
            powerScore: this.calculatePowerScore(),
            realm: gameRef.player.realm || 1,
            data: {
                me: {
                    maxHp: gameRef.player.maxHp,
                    energy: gameRef.player.maxEnergy,
                    currEnergy: gameRef.player.maxEnergy
                },
                deck: deck.map(c => ({ id: c.id, upgraded: c.upgraded, name: c.name })),
                aiProfile: this.selectedPersonality,
                deckArchetype: (typeof PVPService !== 'undefined' && PVPService.getDeckArchetype)
                    ? PVPService.getDeckArchetype(deck)
                    : 'balanced',
                ruleVersion: (typeof PVPService !== 'undefined' && PVPService.ruleVersion) ? PVPService.ruleVersion : 'pvp-v2'
            },
            personality: this.selectedPersonality,
            guardianFormation: formation
        };

        snapshot.data.personalityRules = this.getPersonalityRuleSet(this.selectedPersonality);

        // Visual Feedback - Pulse the button
        const btn = document.querySelector('#tab-defense .ink-btn-large span.btn-icon');
        if (btn) {
            btn.innerHTML = "⏳";
        }

        const res = await PVPService.uploadSnapshot(snapshot);

        if (btn) btn.innerHTML = "🌩️";

        if (res.success) {
            Utils.showBattleLog(res.message || "防御幻影上传成功！");
            const now = new Date();
            const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            const timeEl = document.getElementById('def-time');
            if (timeEl) timeEl.textContent = `上次注入: ${timeStr}`;

            const powerEl = document.getElementById('def-power-val');
            if (powerEl) powerEl.textContent = snapshot.powerScore;

            // Add success visual effect
            const visualizer = document.querySelector('.formation-visualizer-panel');
            if (visualizer) {
                const flash = document.createElement('div');
                flash.style.position = 'absolute';
                flash.style.top = '0';
                flash.style.left = '0';
                flash.style.width = '100%';
                flash.style.height = '100%';
                flash.style.background = 'rgba(207, 170, 112, 0.5)';
                flash.style.pointerEvents = 'none';
                flash.style.transition = 'opacity 0.5s';
                visualizer.appendChild(flash);
                setTimeout(() => flash.style.opacity = '0', 50);
                setTimeout(() => flash.remove(), 550);
            }

        } else {
            Utils.showBattleLog("上传失败: " + (res.message || '未知错误'));
        }
    },

    calculatePowerScore() {
        const gameRef = this.getGameRef();
        if (!gameRef || !gameRef.player) return 0;
        let score = gameRef.player.maxHp * 2;
        if (gameRef.player.deck) score += gameRef.player.deck.length * 10;
        return Math.floor(score);
    },

    // === Shop (Zhutian Pavilion) ===
    filterShop(category) {
        this.activeShopCategory = category;
        this.loadShop();

        // Update Sidebar UI
        document.querySelectorAll('.shop-category').forEach(el => {
            el.classList.remove('active');
            // Simple check for onclick attribute content
            const clickAttr = el.getAttribute('onclick');
            if (clickAttr && clickAttr.includes(`'${category}'`)) {
                el.classList.add('active');
            }
        });
    },

    loadShop() {
        const grid = document.getElementById('shop-unified-grid');
        if (!grid) return;

        grid.innerHTML = '';

        const allItems = window.PVP_SHOP_ITEMS ? window.PVP_SHOP_ITEMS : { cards: [], items: [], cosmetics: [] };

        // Simple distinct arrays
        const cards = allItems.cards || [];
        const items = allItems.items || [];
        const cosmetics = allItems.cosmetics || [];

        let displayItems = [];

        if (this.activeShopCategory === 'all') {
            displayItems = [...cards, ...items, ...cosmetics];
        } else if (this.activeShopCategory === 'cards') {
            displayItems = cards;
        } else if (this.activeShopCategory === 'items') {
            displayItems = items;
        } else if (this.activeShopCategory === 'cosmetics') {
            displayItems = cosmetics;
        }

        if (displayItems.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1 / -1; text-align:center; color:rgba(255,255,255,0.3); padding-top:100px; font-size:1.2rem;">此分类暂无商品</div>';
            this.updateShopWallet();
            return;
        }

        displayItems.forEach((item, index) => {
            const state = (typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getShopItemState === 'function')
                ? PVPService.getShopItemState(item.id)
                : { buyable: false, reason: 'service_unavailable', remainingStock: null };
            const el = this.createShopItemElement(item, state);
            el.style.animationDelay = `${index * 0.05}s`; // Stagger
            grid.appendChild(el);
        });

        this.updateShopWallet();
    },

    updateShopWallet() {
        const walletEl = document.getElementById('shop-wallet-amount');
        if (!walletEl) return;
        if (typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getWalletSummary === 'function') {
            const wallet = PVPService.getWalletSummary();
            walletEl.textContent = Math.max(0, Math.floor(Number(wallet.coins) || 0));
            this.updateShopMetaPanels(wallet);
            return;
        }
        walletEl.textContent = '0';
        this.updateShopMetaPanels(null);
    },

    updateShopMetaPanels(wallet = null) {
        const cosmeticEl = document.getElementById('shop-cosmetic-status');
        const rewardEl = document.getElementById('shop-reward-status');
        const logEl = document.getElementById('shop-activity-log');
        const walletData = wallet || ((typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getWalletSummary === 'function')
            ? PVPService.getWalletSummary()
            : null);

        let equipped = { skin: null, title: null };
        if (typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getEquippedCosmetics === 'function') {
            equipped = PVPService.getEquippedCosmetics();
        }
        if (cosmeticEl) {
            const titleText = equipped && equipped.title ? equipped.title.name : '未佩戴称号';
            const skinText = equipped && equipped.skin ? equipped.skin.name : '未佩戴外观';
            cosmeticEl.textContent = `称号：${titleText} ｜ 外观：${skinText}`;
        }

        if (rewardEl) {
            if (typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getRewardPreview === 'function' && walletData) {
                const previewWin = PVPService.getRewardPreview(true, 1000);
                const mult = previewWin && previewWin.breakdown
                    ? Number(previewWin.breakdown.totalMultiplier || 1).toFixed(2)
                    : '1.00';
                const seasonName = previewWin && previewWin.season ? (previewWin.season.name || '常驻') : '常驻';
                const division = previewWin && previewWin.breakdown ? (previewWin.breakdown.myDivision || '潜龙榜') : '潜龙榜';
                rewardEl.textContent = `赛季：${seasonName} ｜ 段位：${division} ｜ 连胜 ${walletData.winStreak || 0} ｜ 下场胜利预估 +${previewWin.totalReward}（倍率 x${mult}）`;
            } else {
                rewardEl.textContent = '暂无奖励预估数据';
            }
        }

        if (logEl) {
            let logs = [];
            if (typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getRecentTransactions === 'function') {
                logs = PVPService.getRecentTransactions(6);
            }
            if (!logs || logs.length === 0) {
                logEl.innerHTML = '<div class="shop-log-empty">暂无交易记录</div>';
                return;
            }
            logEl.innerHTML = logs.map((entry) => {
                const at = new Date(entry.at || Date.now());
                const hh = String(at.getHours()).padStart(2, '0');
                const mm = String(at.getMinutes()).padStart(2, '0');
                const sign = entry.coins > 0 ? '+' : '';
                const coinText = entry.coins ? `${sign}${entry.coins}` : '--';
                const title = entry.itemName || entry.detail || entry.type || '记录';
                return `<div class="shop-log-item"><span class="shop-log-time">${hh}:${mm}</span><span class="shop-log-title">${title}</span><span class="shop-log-coin">${coinText}</span></div>`;
            }).join('');
        }
    },

    createShopItemElement(item, itemState = null) {
        const el = document.createElement('div');
        el.className = 'talisman-card';
        if (item && item.id) {
            el.dataset.itemId = item.id;
        }
        // Add fade-in animation class if needed, or rely on CSS default

        let typeLabel = "道具";
        if (item.type === 'card') typeLabel = "秘籍";
        if (item.type === 'skin') typeLabel = "外观";
        if (item.type === 'title') typeLabel = "称号";
        const state = itemState || { buyable: false, reason: 'unknown', remainingStock: null };
        const remaining = state.remainingStock;
        const stockText = remaining === null ? '不限量' : `剩余 ${remaining}/${Math.max(0, Math.floor(Number(item.stock) || 0))}`;
        let buyText = '兑换';
        if (state.reason === 'owned') buyText = '已拥有';
        else if (state.reason === 'equippable') buyText = '佩戴';
        else if (state.reason === 'equipped') buyText = '卸下';
        else if (state.reason === 'sold_out') buyText = '已售罄';
        else if (state.reason === 'insufficient') buyText = '币不足';

        el.innerHTML = `
            <div class="talisman-top-decor"></div>
            <div class="talisman-icon-area">
                <div class="shop-icon">${item.icon || '📦'}</div>
            </div>
            <div class="talisman-info">
                <div class="item-type-badge">${typeLabel}</div>
                <div class="talisman-name">${item.name}</div>
                <div class="talisman-desc">${item.description}</div>
                <div class="talisman-price-tag">
                    <span class="price-text">${item.price}</span>
                    <span style="font-size: 0.8rem; color: #666;">天道币</span>
                </div>
                <div class="shop-stock-info">${stockText}</div>
            </div>
            <div class="buy-overlay ${state.buyable ? 'buyable' : `state-${state.reason || 'locked'}`}" data-state="${state.reason || 'locked'}">
                <span class="buy-btn-text">${buyText}</span>
            </div>
        `;

        const overlay = el.querySelector('.buy-overlay');
        if (overlay) {
            overlay.dataset.itemId = item.id || '';
            if (state.buyable || state.reason === 'equippable' || state.reason === 'equipped') {
                overlay.addEventListener('click', () => this.purchaseShopItem(item.id));
            }
        }

        return el;
    },

    purchaseShopItem(itemId) {
        if (!itemId) return;
        if (typeof PVPService === 'undefined' || !PVPService || typeof PVPService.handleShopItemAction !== 'function') {
            Utils.showBattleLog('商店服务未就绪');
            return;
        }
        const result = PVPService.handleShopItemAction(itemId, { game: this.getGameRef() });
        if (result && result.success) {
            Utils.showBattleLog(result.message || '兑换成功');
            if (result.wallet && typeof result.wallet.coins === 'number') {
                const walletEl = document.getElementById('shop-wallet-amount');
                if (walletEl) walletEl.textContent = Math.max(0, Math.floor(result.wallet.coins));
            }
            this.updateShopMetaPanels(result.wallet || null);
            if (this.getGameRef() && typeof this.getGameRef().updateCharacterInfo === 'function') {
                this.getGameRef().updateCharacterInfo();
            }
            const gameRef = this.getGameRef();
            if (gameRef && typeof gameRef.autoSave === 'function') {
                gameRef.autoSave();
            }
        } else {
            Utils.showBattleLog((result && result.message) ? result.message : '兑换失败');
        }
        this.loadShop();
    }
};
