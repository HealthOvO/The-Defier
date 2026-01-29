/**
 * The Defier - PVP Scene Controller (Ink & Gold Edition)
 * 天道榜界面逻辑 - 适配新UI
 */

window.PVPScene = {
    activeTab: 'ranking',
    activeShopCategory: 'all', // Shop Category state
    selectedPersonality: 'balanced', // Default

    onShow() {
        this.updateMyRankInfo();
        this.switchTab('ranking');
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
        if (!PVPService.currentRankData) await PVPService.syncRank();
        const info = PVPService.currentRankData;
        if (info) {
            document.getElementById('my-rank-tier').textContent = info.division || '潜龙';
            document.getElementById('my-rank-score').textContent = info.score || 1000;
        }
    },

    // === Ranking (Jade Slips) ===
    async loadRankings() {
        const listEl = document.getElementById('ranking-list');
        // Keep loading spinner if empty, or clear
        listEl.innerHTML = `
            <div class="loading-ink">
                 <div class="spinner"></div>
                 <span>读取天机中...</span>
            </div>
        `;

        try {
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
        } catch (e) {
            listEl.innerHTML = '<div class="loading-ink" style="color:#f44">读取失败，请检查网络</div>';
            console.error(e);
        }
    },

    async findMatch() {
        if (!PVPService.currentRankData) await PVPService.syncRank();
        const score = PVPService.currentRankData ? PVPService.currentRankData.score : 1000;
        const realm = PVPService.currentRankData ? PVPService.currentRankData.realm : 1;

        Utils.showBattleLog("神念搜寻中...");
        const result = await PVPService.findOpponent(score, realm);

        if (result.success) {
            this.startPVPBattle(result.opponent);
        } else {
            Utils.showBattleLog(result.message || "未找到合适的对手");
        }
    },

    startPVPBattle(opponentData) {
        try {
            if (!opponentData || !opponentData.battleData) {
                console.error("Opponent data invalid", opponentData);
                Utils.showBattleLog("对手数据异常，无法开始");
                return;
            }

            const ghostData = opponentData.battleData;
            const ghostConfig = opponentData.ghost.config || {};

            // Construct Ghost
            const ghost = new GhostEnemy({
                userId: opponentData.ghost.user.objectId,
                name: `幻影·${opponentData.rank.user.username}`,
                maxHp: ghostData.me ? ghostData.me.maxHp : 100, // Fallback
                deck: ghostData.deck || [],
                currentHp: ghostData.me ? ghostData.me.maxHp : 100,
                energy: ghostData.me ? (ghostData.me.energy || 3) : 3,
                config: ghostConfig
            });

            game.showScreen('battle-screen');
            game.mode = 'pvp';
            game.pvpOpponentRank = opponentData.rank;

            // Initialize Battle
            if (game.battle && typeof game.battle.init === 'function') {
                console.log("Initializing PVP Battle with:", ghost);
                game.battle.init([ghost]);
            } else {
                console.error("Battle module not ready");
                Utils.showBattleLog("战斗模块初始化失败");
                game.showScreen('index'); // Return to safe screen
            }
        } catch (e) {
            console.error("PVP Start Crash:", e);
            Utils.showBattleLog("切磋启动失败，请查看控制台");
            // Attempt to return to PVP screen
            setTimeout(() => {
                game.showScreen('main-menu');
                this.switchTab('ranking');
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
        if (!game.player) {
            Utils.showBattleLog("请先进入游戏选择角色");
            return;
        }

        const formation = document.getElementById('guardian-formation').checked;

        const snapshot = {
            powerScore: this.calculatePowerScore(),
            realm: game.player.realm || 1,
            data: {
                me: {
                    maxHp: game.player.maxHp,
                    energy: game.player.maxEnergy,
                    currEnergy: game.player.maxEnergy
                },
                deck: game.player.deck.map(c => ({ id: c.id, upgraded: c.upgraded, name: c.name }))
            },
            personality: this.selectedPersonality,
            guardianFormation: formation
        };

        // Visual Feedback - Pulse the button
        const btn = document.querySelector('.ink-btn-large span.btn-icon');
        if (btn) {
            btn.innerHTML = "⏳";
        }

        const res = await PVPService.uploadSnapshot(snapshot);

        if (btn) btn.innerHTML = "🌩️";

        if (res.success) {
            Utils.showBattleLog("防御幻影上传成功！");
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
            Utils.showBattleLog("上传失败: " + res.message);
        }
    },

    calculatePowerScore() {
        if (!game.player) return 0;
        let score = game.player.maxHp * 2;
        if (game.player.deck) score += game.player.deck.length * 10;
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
            return;
        }

        displayItems.forEach((item, index) => {
            const el = this.createShopItemElement(item);
            el.style.animationDelay = `${index * 0.05}s`; // Stagger
            grid.appendChild(el);
        });

        // Update Wallet Display (Mock)
        const walletEl = document.getElementById('shop-wallet-amount');
        if (walletEl) walletEl.textContent = "1200";
    },

    createShopItemElement(item) {
        const el = document.createElement('div');
        el.className = 'talisman-card';
        // Add fade-in animation class if needed, or rely on CSS default

        let typeLabel = "道具";
        if (item.type === 'card') typeLabel = "秘籍";
        if (item.type === 'skin') typeLabel = "外观";
        if (item.type === 'title') typeLabel = "称号";

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
            </div>
            <div class="buy-overlay" onclick="Utils.showBattleLog('暂未开放购买: ${item.name}')">
                <span class="buy-btn-text">兑换</span>
            </div>
        `;
        return el;
    }
};
