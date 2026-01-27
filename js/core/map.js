/**
 * The Defier - 地图系统
 */

class GameMap {
    constructor(game) {
        this.game = game;
        this.nodes = [];
        this.currentNodeIndex = -1;
        this.completedNodes = [];
    }

    // 生成地图
    generate(realm) {
        // V4.2 Persistence: Check if we have a saved map for this realm
        if (this.game.player.realmMaps && this.game.player.realmMaps[realm]) {
            console.log(`Loading cached map for Realm ${realm}`);
            const cached = this.game.player.realmMaps[realm];
            this.nodes = cached.nodes;
            this.completedNodes = cached.completedNodes || [];

            // Re-bind click events (functions are not saved in JSON)
            // Actually, renderV3Nodes re-binds them based on data.
            // But we need to ensure the data structure is valid.
            return this.nodes;
        }

        console.log(`Generating new map for Realm ${realm}`);
        this.nodes = [];
        this.currentNodeIndex = -1;
        this.completedNodes = [];

        // 获取层配置
        const config = window.LEVEL_CONFIG ? window.LEVEL_CONFIG.getRealmConfig(realm) : { rows: 8, nodesSequence: [] };
        const rows = config.rows;

        let nodeId = 0;

        // 1. 生成普通层
        for (let row = 0; row < rows - 1; row++) {
            const rowNodes = [];
            let nodeCount = 2;
            if (config.nodesSequence && config.nodesSequence[row]) {
                nodeCount = config.nodesSequence[row];
            } else {
                nodeCount = Math.random() > 0.5 ? 3 : 2;
            }

            for (let i = 0; i < nodeCount; i++) {
                const nodeType = this.getRandomNodeType(row, rows, realm);
                rowNodes.push({
                    id: nodeId++,
                    row: row,
                    type: nodeType,
                    icon: this.getNodeIcon(nodeType),
                    completed: false,
                    accessible: row === 0
                });
            }
            this.nodes.push(rowNodes);
        }

        // 2. 生成BOSS层 (最后一行)
        this.nodes.push([{
            id: nodeId++,
            row: rows - 1,
            type: 'boss',
            icon: '👹',
            completed: false,
            accessible: false
        }]);

        // Save initial state to cache
        this.saveStateToCache(realm);

        return this.nodes;
    }

    // Helper to save state
    saveStateToCache(realm) {
        if (!this.game.player.realmMaps) this.game.player.realmMaps = {};
        this.game.player.realmMaps[realm] = {
            nodes: this.nodes,
            completedNodes: this.completedNodes
        };
        // Auto-save game to persist this change immediately? 
        // Better to let local autosave handle it, or trigger it here if critical.
    }

    // 获取随机节点类型
    getRandomNodeType(row, totalRows, realm) {
        // 第一行必有战斗
        if (row === 0) {
            return Math.random() < 0.7 ? 'enemy' : 'elite';
        }

        // 最后一行是BOSS
        if (row === totalRows - 1) {
            return 'boss';
        }

        // 检查是否通过改关卡 (Current Realm < Max Reached)
        const isPassed = this.game.player.maxRealmReached > realm;

        if (isPassed) {
            // Only monsters (enemy/elite) and boss (handled above)
            return Math.random() < 0.7 ? 'enemy' : 'elite';
        }

        // 随机类型 (Normal logic)
        const roll = Math.random();
        if (roll < 0.45) return 'enemy';
        if (roll < 0.60) return 'elite';
        if (roll < 0.75) return 'event';
        if (roll < 0.85) return 'shop';
        return 'rest';
    }

    // 获取节点图标
    getNodeIcon(type) {
        const icons = {
            enemy: '⚔️',
            elite: '💀',
            boss: '👹',
            event: '❓',
            shop: '🏪',
            rest: '🏕️'
        };
        return icons[type] || '❓';
    }

    // 渲染地图 (V3 - Ascension Style + Flexbox Fix)
    render() {
        const container = document.getElementById('map-screen');
        container.innerHTML = `
            <div class="map-screen-v3">
                <div class="map-bg-layer map-bg-stars"></div>
                <div class="map-bg-layer map-bg-mist"></div>
                
                <div class="map-v3-header">
                    <button class="back-btn" onclick="game.showScreen('realm-select-screen')">← 返回关卡</button>
                    <div class="player-status-bar">
                        <div class="status-item hp">
                            <span class="icon">❤️</span>
                            <span id="map-hp">${this.game.player.currentHp}/${this.game.player.maxHp}</span>
                        </div>
                        <div class="status-item gold">
                            <span class="icon">💰</span>
                            <span id="map-gold">${this.game.player.gold}</span>
                        </div>
                        <div class="status-item floor">
                            <span class="icon">🏔️</span>
                            <span id="map-floor">${this.getRealmName(this.game.player.realm)}</span>
                        </div>
                    </div>
                </div>

                <div class="map-scroll-container" id="map-scroll-container">
                    <div class="map-content-wrapper" id="map-content-wrapper">
                        <!-- SVG Layer -->
                        <svg class="map-connections-svg" id="map-svg-layer"></svg>
                    </div>
                </div>

                <div class="map-footer">
                    <button class="menu-btn small" onclick="game.showDeck()">查看牌组</button>
                    <button class="menu-btn small" onclick="game.showTreasureBag()">法宝囊</button>
                    <button class="menu-btn small" onclick="game.showFateRing()">命环</button>
                </div>
            </div>
        `;

        this.renderV3Nodes();
        this.updateStatusBar();

        // Auto-scroll to current node
        // Auto-scroll to best target (Highest Accessible or Completed)
        setTimeout(() => {
            // Find the highest row index that has potential activity
            let targetRowIndex = 0;

            // Search from top down
            for (let r = this.nodes.length - 1; r >= 0; r--) {
                const row = this.nodes[r];
                const hasActive = row.some(n => n.accessible && !n.completed);
                if (hasActive) {
                    targetRowIndex = r;
                    break;
                }
                const hasCompleted = row.some(n => n.completed);
                if (hasCompleted && targetRowIndex === 0) {
                    // If we haven't found an active row yet, track the highest completed row as fallback
                    targetRowIndex = r;
                }
            }

            // Target element in that row
            const targetRowEl = document.querySelector(`.node-row-v3[data-row-index="${targetRowIndex}"]`);
            if (targetRowEl) {
                targetRowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                // Fallback to bottom if something is weird
                const scrollContainer = document.getElementById('map-scroll-container');
                if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        }, 150);
    }

    renderV3Nodes() {
        const wrapper = document.getElementById('map-content-wrapper');
        const svgLayer = document.getElementById('map-svg-layer');
        if (!wrapper || !svgLayer) return;

        // V3 Flexbox Layout System (Centered & Robust)
        this.nodes.forEach((rowNodes, rowIndex) => {
            const rowEl = document.createElement('div');
            rowEl.className = 'node-row-v3';
            rowEl.dataset.rowIndex = rowIndex;
            // Flex layout handles positioning automatically via justify-content: center

            rowNodes.forEach((node, i) => {
                const nodeEl = document.createElement('div');
                nodeEl.className = `map-node-v3 ${node.type}`;
                nodeEl.dataset.nodeId = node.id;

                nodeEl.innerHTML = `
                    <div class="node-icon">${node.icon}</div>
                    <div class="node-tooltip">${this.getNodeTooltip(node.type)}</div>
                `;

                if (node.completed) nodeEl.classList.add('completed');
                else if (!node.accessible) nodeEl.classList.add('locked');
                else {
                    nodeEl.classList.add('current');
                    nodeEl.addEventListener('click', () => this.onNodeClick(node));
                }

                // Just append, no manual positioning
                rowEl.appendChild(nodeEl);
            });

            wrapper.appendChild(rowEl);
        });

        // Draw Lines after DOM update and potential reflow
        // Use timeout to ensure geometry is final
        setTimeout(() => this.drawConnections(), 50);
        // Also redraw on resize
        if (!this._resizeObserver) {
            this._resizeObserver = new ResizeObserver(() => {
                // Throttle drawing
                if (this._resizeTimeout) clearTimeout(this._resizeTimeout);
                this._resizeTimeout = setTimeout(() => this.drawConnections(), 100);
            });
            this._resizeObserver.observe(wrapper);
        }
    }

    drawConnections() {
        const svg = document.getElementById('map-svg-layer');
        if (!svg) return;

        // Clear old
        svg.innerHTML = '';

        // Iterate Rows
        for (let r = 0; r < this.nodes.length - 1; r++) {
            const currentRow = this.nodes[r];
            const nextRow = this.nodes[r + 1];

            currentRow.forEach(sourceNode => {
                nextRow.forEach(targetNode => {
                    if (this.shouldConnect(sourceNode, targetNode)) {
                        this.createPath(svg, r, sourceNode, targetNode);
                    }
                });
            });
        }
    }

    shouldConnect(src, tgt) {
        // Special case: Boss connects to everything
        if (tgt.type === 'boss' || src.type === 'boss') return true;

        const srcRowNodes = this.nodes[src.row];
        const tgtRowNodes = this.nodes[tgt.row];

        // Single node rows connect to everything
        if (srcRowNodes.length === 1 || tgtRowNodes.length === 1) return true;

        const srcIndex = srcRowNodes.findIndex(n => n.id === src.id);
        const tgtIndex = tgtRowNodes.findIndex(n => n.id === tgt.id);

        const srcNorm = srcIndex / (srcRowNodes.length - 1 || 1);
        const tgtNorm = tgtIndex / (tgtRowNodes.length - 1 || 1);

        return Math.abs(srcNorm - tgtNorm) <= 0.6; // Allow diagonal connections
    }

    createPath(svg, rowIndex, src, tgt) {
        // Calculate Accurate Positions relative to Wrapper
        // We use DOM geometry instead of assumptions
        const wrapper = document.getElementById('map-content-wrapper');
        if (!wrapper) return;

        const srcEl = document.querySelector(`.map-node-v3[data-node-id="${src.id}"]`);
        const tgtEl = document.querySelector(`.map-node-v3[data-node-id="${tgt.id}"]`);

        if (!srcEl || !tgtEl) return;

        // Get Centers relative to viewport
        const srcRect = srcEl.getBoundingClientRect();
        const tgtRect = tgtEl.getBoundingClientRect();
        const wrapRect = wrapper.getBoundingClientRect();

        // Convert to Wrapper Coordinates
        // SVG is absolute 0,0 inside Wrapper.

        const srcX = srcRect.left - wrapRect.left + srcRect.width / 2;
        const srcY = srcRect.top - wrapRect.top + srcRect.height / 2;

        const tgtX = tgtRect.left - wrapRect.left + tgtRect.width / 2;
        const tgtY = tgtRect.top - wrapRect.top + tgtRect.height / 2;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const midY = (srcY + tgtY) / 2;

        // Standard Bezier
        const d = `M ${srcX} ${srcY} C ${srcX} ${midY}, ${tgtX} ${midY}, ${tgtX} ${tgtY}`;

        path.setAttribute('d', d);
        path.setAttribute('class', 'connection-path');

        if (src.completed && (tgt.completed || tgt.accessible)) {
            path.classList.add('completed');
        } else if (src.completed && tgt.accessible) {
            path.classList.add('active');
        }

        svg.appendChild(path);
    }

    getNodeTooltip(type) {
        const tips = {
            enemy: '普通敌人：只有战斗才能变强',
            elite: '精英敌人：高风险，高回报',
            boss: '天劫：突破境界的必经之路',
            event: '机缘：祸福相依',
            shop: '坊市：互通有无',
            rest: '洞府：休养生息'
        };
        return tips[type] || '未知区域';
    }

    // 获取天域名称
    getRealmName(realm) {
        const names = {
            1: '第一重·凡尘界',
            2: '第二重·练气天',
            3: '第三重·筑基天',
            4: '第四重·金丹天',
            5: '第五重·元婴天',
            6: '第六重·化神天',
            7: '第七重·合体天',
            8: '第八重·大乘天',
            9: '第九重·飞升天',
            10: '第十重·地仙界',
            11: '第十一重·天仙界',
            12: '第十二重·金仙界',
            13: '第十三重·大罗天',
            14: '第十四重·混元天',
            15: '第十五重·无上天',
            16: '第十六重·太乙天',
            17: '第十七重·大罗天',
            18: '第十八重·混沌天'
        };
        return names[realm] || `第${realm}重天`;
    }

    // 获取天域环境法则
    getRealmEnvironment(realm) {
        const envs = {
            1: { name: '灵气稀薄', desc: '护盾效果降低 20%', effect: 'shield_malus' },
            2: { name: '雷霆淬体', desc: '每回合受到3点雷属性伤害', effect: 'thunder_damage' },
            3: { name: '重力压制', desc: '抽牌数-1', effect: 'draw_malus' },
            4: { name: '丹火焚心', desc: '回合结束时若有手牌，受到等于手牌数x2的伤害', effect: 'burn_hand' },
            5: { name: '心魔滋生', desc: '敌人造成伤害+25%', effect: 'enemy_buff' },
            6: { name: '法则混乱', desc: '卡牌费用随机变化 (-1到+1)', effect: 'chaos_cost' },
            7: { name: '虚空吞噬', desc: '每回合失去 5% 最大生命值', effect: 'void_drain' },
            8: { name: '天道压制', desc: '所有卡牌效果降低 20%', effect: 'heaven_suppress' },
            9: { name: '生死轮回', desc: '受到致死伤害时有 50% 几率复活并回满血（限一次）', effect: 'rebirth' },
            10: { name: '大地束缚', desc: '灵力上限-1，且闪避率降低20%', effect: 'earth_bind' },
            11: { name: '天人五衰', desc: '所有负面状态持续时间+1回合', effect: 'decay' },
            12: { name: '金戈铁马', desc: '使用攻击牌时，需消耗当前生命值的5%', effect: 'blood_tax' },
            13: { name: '时光逆流', desc: '每3回合，敌人会额外行动一次', effect: 'time_warp' },
            14: { name: '混元无极', desc: '敌人对所有伤害拥有20%抗性，且有50%几率免疫眩晕', effect: 'chaos_immune' },
            15: { name: '大道独行', desc: '最大生命值降低 30%，但造成的伤害提升50%', effect: 'final_trial' },
            16: { name: '太乙神雷', desc: '敌人攻击自带20%吸血，且每回合获得攻击力+1', effect: 'vampire_scaling' },
            17: { name: '大罗法身', desc: '敌人免疫控制效果，且每回合回复 20% 最大生命', effect: 'immunity_regen' },
            18: { name: '混沌终焉', desc: '玩家所有属性减半，敌人全属性翻倍', effect: 'chaos_end' }
        };
        return envs[realm] || { name: '平稳', desc: '无特殊效果', effect: 'none' };
    }

    // 更新状态栏
    updateStatusBar() {
        const player = this.game.player;
        document.getElementById('map-hp').textContent = `${player.currentHp}/${player.maxHp}`;
        document.getElementById('map-gold').textContent = player.gold;
        document.getElementById('map-floor').textContent = this.getRealmName(player.realm);
        document.getElementById('map-floor').textContent = this.getRealmName(player.realm);
        const realmTitle = document.getElementById('realm-title');
        if (realmTitle) realmTitle.textContent = this.getRealmName(player.realm);

        // 更新环境法则显示
        const env = this.getRealmEnvironment(player.realm);
        const indicator = document.getElementById('realm-law-indicator');
        if (indicator) {
            indicator.querySelector('.law-text').textContent = `当前法则：${env.name} (${env.desc})`;
        }

        // 渲染法宝
        if (this.game.renderTreasures) {
            this.game.renderTreasures();
        }
    }

    // 节点点击
    onNodeClick(node) {
        if (node.completed || !node.accessible) return;

        this.currentNodeIndex = node.id;

        switch (node.type) {
            case 'enemy':
                this.startEnemyBattle(node);
                break;
            case 'elite':
                this.startEliteBattle(node);
                break;
            case 'boss':
                this.startBossBattle(node);
                break;
            case 'event':
                this.triggerEvent(node);
                break;
            case 'shop':
                this.openShop(node);
                break;
            case 'rest':
                this.restAtCamp(node);
                break;
        }
    }

    // 开始普通战斗
    startEnemyBattle(node) {
        const realm = this.game.player.realm;
        const enemy = getRandomEnemy(realm);
        if (enemy) {
            enemy.ringExp = 10 + realm * 5; // 添加命环经验
            this.game.currentBattleNode = node; // 保存节点
            this.game.startBattle([enemy], node);
        }
    }

    // 开始精英战斗
    startEliteBattle(node) {
        const realm = this.game.player.realm;
        const elite = createEliteEnemy(realm);
        if (elite) {
            elite.ringExp = 25 + realm * 10; // 精英给更多经验
            this.game.currentBattleNode = node;
            this.game.startBattle([elite], node);
        }
    }

    // 开始BOSS战斗
    startBossBattle(node) {
        const realm = this.game.player.realm;

        // 5-10-15 层天劫BOSS特殊处理
        if ([5, 10, 15].includes(realm)) {
            let tribId = 'tribulationCloud5';
            if (realm === 10) tribId = 'tribulationCloud10';
            if (realm === 15) tribId = 'tribulationCloud15';

            // Check if tribulation boss exists in definition
            // Assuming ENEMIES has these IDs. If not, fallback to normal boss.
            if (ENEMIES[tribId]) {
                const tBoss = JSON.parse(JSON.stringify(ENEMIES[tribId]));
                tBoss.isBoss = true;
                tBoss.isTribulation = true;
                tBoss.ringExp = 100 + realm * 20;

                this.game.currentBattleNode = node;
                this.game.startBattle([tBoss], node);

                Utils.showBattleLog(`【天劫降临】渡过此劫，逆天改命！`);
                return;
            }
        }

        const boss = getBossForRealm(realm);
        if (boss) {
            const bossInstance = JSON.parse(JSON.stringify(boss));
            bossInstance.isBoss = true;
            bossInstance.name = `【天劫】${bossInstance.name}`; // 标记为天劫BOSS
            bossInstance.ringExp = 50 + realm * 20; // BOSS给大量经验

            // 天劫增强
            bossInstance.maxHp = Math.floor(bossInstance.maxHp * 1.2);
            bossInstance.currentHp = bossInstance.maxHp;

            // Dual Boss Logic (Realm 10+)
            const enemies = [];
            if (realm >= 10) {
                // Boss A
                const bossA = JSON.parse(JSON.stringify(bossInstance));
                bossA.id = (bossA.id || 'boss') + '_A';
                bossA.name += ' (阴)';
                bossA.maxHp = Math.floor(bossA.maxHp * 0.7); // 70% HP
                bossA.currentHp = bossA.maxHp;
                bossA.isDualBoss = true; // Mark for Twin Bonds logic
                enemies.push(bossA);

                // Boss B
                const bossB = JSON.parse(JSON.stringify(bossInstance));
                bossB.id = (bossB.id || 'boss') + '_B';
                bossB.name += ' (阳)';
                bossB.maxHp = Math.floor(bossB.maxHp * 0.7); // 70% HP
                bossB.currentHp = bossB.maxHp;
                bossB.isDualBoss = true;
                enemies.push(bossB);

                Utils.showBattleLog(`天劫异变！双子魔尊降临！`);
            } else {
                enemies.push(bossInstance);
                Utils.showBattleLog(`天劫降临！击败【${bossInstance.name}】以破境！`);
            }

            this.game.currentBattleNode = node;
            this.game.startBattle(enemies, node);
        }
    }

    // 触发事件
    triggerEvent(node) {
        // 确保 getRandomEvent 可用
        if (typeof getRandomEvent !== 'function') {
            console.error('getRandomEvent not found');
            this.completeNode(node);
            return;
        }

        const event = typeof getRandomEvent === 'function' ? getRandomEvent() : null;
        console.log('Triggering event:', event);

        if (event) {
            this.game.showEventModal(event, node);
        } else {
            // 后备处理：如果随机池为空或出错
            console.warn('No event returned from pool');
            this.game.player.gold += 30;
            this.game.player.fateRing.exp += 15;
            Utils.showBattleLog('遭遇神秘迷雾... 捡到 30 灵石');

            if (this.game.showRewardModal) {
                this.game.showRewardModal(
                    '神秘迷雾',
                    '迷雾散去，你在地上发现了一些东西...\n获得 30 灵石\n获得 15 命环经验',
                    '🌫️',
                    () => {
                        this.completeNode(node);
                    }
                );
            } else {
                this.completeNode(node);
            }
        }
    }

    // 显示事件弹窗 - 由game.js处理
    showEventModal(event, node) {
        this.game.showEventModal(event, node);
    }

    // 事件奖励
    eventReward(type) {
        this.game.player.gold += 50;
        Utils.showBattleLog('获得 50 灵石！');
    }

    // 事件治疗NPC
    eventHealNpc(node) {
        this.game.player.currentHp = Math.max(1, this.game.player.currentHp - 10);
        this.game.player.gold += 80;
        Utils.showBattleLog('修士感谢你的帮助，赠送 80 灵石');
        this.completeNode(node);
    }

    // 事件祭坛
    eventAltar(node) {
        this.game.player.currentHp = Math.max(1, this.game.player.currentHp - 10);
        this.game.player.fateRing.exp += 30;
        Utils.showBattleLog('命环获得神秘力量，经验+30');
        this.completeNode(node);
    }

    // 打开商店
    openShop(node) {
        this.game.currentBattleNode = node;
        this.game.showShop(node);
    }

    // 营地休息
    restAtCamp(node) {
        this.game.currentBattleNode = node;
        this.game.showCampfire(node);
    }

    // 完成节点
    completeNode(node) {
        // 标记当前节点为完成
        let nodeCompletedProcessing = false;

        for (const row of this.nodes) {
            for (const n of row) {
                if (n.id === node.id) {
                    if (n.completed) return; // Prevent double completion
                    n.completed = true;
                    this.completedNodes.push(n.id);
                    nodeCompletedProcessing = true;

                    // 检查是否完成本层（BOSS击败）
                    // 必须在这里检查，确保只触发一次
                    if (node.type === 'boss') {
                        this.game.onRealmComplete();
                    }
                }
            }
        }

        if (!nodeCompletedProcessing) return; // 如果没有找到对应节点或已处理，直接返回

        // 解锁下一行节点
        const nextRow = node.row + 1;
        if (nextRow < this.nodes.length) {
            for (const n of this.nodes[nextRow]) {
                n.accessible = true;
            }
        }

        // V4.2 Persistence: Save progress immediately
        // We save to cache. The game loop or autosave will persist to localStorage.
        this.saveStateToCache(this.game.player.realm);

        this.render();
    }

    // 获取当前可访问节点
    getAccessibleNodes() {
        const accessible = [];
        for (const row of this.nodes) {
            for (const node of row) {
                if (node.accessible && !node.completed) {
                    accessible.push(node);
                }
            }
        }
        return accessible;
    }


}
