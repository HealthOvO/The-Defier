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
        this.nodes = [];
        this.currentNodeIndex = -1;
        this.completedNodes = [];

        // 每层生成3-4行节点
        const rows = 4;
        const nodesPerRow = [2, 3, 2, 1]; // 每行节点数

        let nodeId = 0;

        for (let row = 0; row < rows; row++) {
            const rowNodes = [];
            const nodeCount = nodesPerRow[row];

            for (let i = 0; i < nodeCount; i++) {
                const nodeType = this.getRandomNodeType(row, rows, realm);
                rowNodes.push({
                    id: nodeId++,
                    row: row,
                    type: nodeType,
                    icon: this.getNodeIcon(nodeType),
                    completed: false,
                    accessible: row === 0 // 只有第一行可访问
                });
            }

            this.nodes.push(rowNodes);
        }

        // 最后一行是BOSS
        this.nodes[rows - 1] = [{
            id: nodeId,
            row: rows - 1,
            type: 'boss',
            icon: '👹',
            completed: false,
            accessible: false
        }];

        return this.nodes;
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

        // 随机类型
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

    // 渲染地图
    render() {
        const container = document.getElementById('map-nodes');
        container.innerHTML = '';

        // 从上到下渲染（反转显示，让BOSS在上方）
        for (let row = this.nodes.length - 1; row >= 0; row--) {
            const rowEl = document.createElement('div');
            rowEl.className = 'map-row';

            for (const node of this.nodes[row]) {
                const nodeEl = document.createElement('div');
                nodeEl.className = `map-node ${node.type}`;
                nodeEl.dataset.nodeId = node.id;

                if (node.completed) {
                    nodeEl.classList.add('completed');
                } else if (!node.accessible) {
                    nodeEl.classList.add('locked');
                } else {
                    nodeEl.classList.add('current');
                    nodeEl.addEventListener('click', () => this.onNodeClick(node));
                }

                nodeEl.textContent = node.icon;
                rowEl.appendChild(nodeEl);
            }

            container.appendChild(rowEl);
        }

        // 更新状态栏
        this.updateStatusBar();
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
            15: '第十五重·无上天'
        };
        return names[realm] || `第${realm}重天`;
    }

    // 获取天域环境法则
    getRealmEnvironment(realm) {
        const envs = {
            1: { name: '灵气稀薄', desc: '灵力恢复-1 (每回合开始时)', effect: 'energy_malus' },
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
            14: { name: '混元无极', desc: '敌人对所有伤害拥有20%抗性，且无法被眩晕', effect: 'chaos_immune' },
            15: { name: '大道独行', desc: '最大生命值减半，但造成的伤害提升50%', effect: 'final_trial' }
        };
        return envs[realm] || { name: '平稳', desc: '无特殊效果', effect: 'none' };
    }

    // 更新状态栏
    updateStatusBar() {
        const player = this.game.player;
        document.getElementById('map-hp').textContent = `${player.currentHp}/${player.maxHp}`;
        document.getElementById('map-gold').textContent = player.gold;
        document.getElementById('map-floor').textContent = this.getRealmName(player.realm);
        document.getElementById('realm-title').textContent = this.getRealmName(player.realm);

        // 更新环境法则显示
        const env = this.getRealmEnvironment(player.realm);
        const indicator = document.getElementById('realm-law-indicator');
        if (indicator) {
            indicator.querySelector('.law-text').textContent = `当前法则：${env.name} (${env.desc})`;
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
        const boss = getBossForRealm(realm);
        if (boss) {
            const bossInstance = JSON.parse(JSON.stringify(boss));
            bossInstance.isBoss = true;
            bossInstance.name = `【天劫】${bossInstance.name}`; // 标记为天劫BOSS
            bossInstance.ringExp = 50 + realm * 20; // BOSS给大量经验

            // 天劫增强
            bossInstance.maxHp = Math.floor(bossInstance.maxHp * 1.2);
            bossInstance.currentHp = bossInstance.maxHp;

            this.game.currentBattleNode = node;
            this.game.startBattle([bossInstance], node);

            Utils.showBattleLog(`天劫降临！击败【${bossInstance.name}】以破境！`);
        }
    }

    // 触发事件
    triggerEvent(node) {
        // 使用events.js的事件数据
        const event = getRandomEvent();
        if (event) {
            this.game.showEventModal(event, node);
        } else {
            // 后备处理
            this.game.player.gold += 30;
            this.game.player.fateRing.exp += 15;
            Utils.showBattleLog('遭遇神秘事件 - 获得 30 灵石');
            this.completeNode(node);
            this.game.showScreen('map-screen');
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
        for (const row of this.nodes) {
            for (const n of row) {
                if (n.id === node.id) {
                    n.completed = true;
                    this.completedNodes.push(n.id);
                }
            }
        }

        // 解锁下一行节点
        const nextRow = node.row + 1;
        if (nextRow < this.nodes.length) {
            for (const n of this.nodes[nextRow]) {
                n.accessible = true;
            }
        }

        // 检查是否完成本层（BOSS击败）
        if (node.type === 'boss') {
            this.game.onRealmComplete();
        }

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
