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
            9: '第九重·飞升天'
        };
        return names[realm] || `第${realm}重天`;
    }

    // 获取天域环境法则
    getRealmEnvironment(realm) {
        const envs = {
            1: { name: '灵气稀薄', desc: '灵力恢复-1', effect: 'energy_malus' },
            2: { name: '雷霆淬体', desc: '每回合受到3点雷属性伤害', effect: 'thunder_damage' },
            3: { name: '重力压制', desc: '抽牌数-1', effect: 'draw_malus' },
            4: { name: '丹火焚心', desc: '回合结束时燃烧手牌', effect: 'burn_hand' },
            5: { name: '心魔滋生', desc: '敌人造成伤害+50%', effect: 'enemy_buff' }
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
        // 随机事件
        const events = [
            {
                title: '神秘宝箱',
                description: '你发现了一个神秘的宝箱...',
                choices: [
                    { text: '打开它', effect: () => this.eventReward('chest') },
                    { text: '离开', effect: () => this.completeNode(node) }
                ]
            },
            {
                title: '受伤的修士',
                description: '一位受伤的修士向你求助...',
                choices: [
                    { text: '治疗他 (-10 HP)', effect: () => this.eventHealNpc(node) },
                    { text: '无视', effect: () => this.completeNode(node) }
                ]
            },
            {
                title: '古老祭坛',
                description: '一座古老的祭坛散发着神秘的光芒...',
                choices: [
                    { text: '献祭生命 (-10 HP, +1 法则经验)', effect: () => this.eventAltar(node) },
                    { text: '离开', effect: () => this.completeNode(node) }
                ]
            }
        ];

        const event = events[Math.floor(Math.random() * events.length)];
        this.showEventModal(event, node);
    }

    // 显示事件弹窗
    showEventModal(event, node) {
        this.game.currentBattleNode = node; // 保存节点
        // 简化处理：直接给予奖励
        this.game.player.gold += 30;
        this.game.player.fateRing.exp += 15; // 事件也给命环经验
        Utils.showBattleLog(`${event.title} - 获得 30 灵石, 命环经验+15`);
        this.completeNode(node);
        this.game.showScreen('map-screen');
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
        // 简化处理：直接给一张卡牌选择
        const card = getRandomCard('uncommon');
        if (card) {
            this.game.player.addCardToDeck(card);
            Utils.showBattleLog(`商店赠送: ${card.name}`);
        }
        this.completeNode(node);
        this.game.showScreen('map-screen');
    }

    // 营地休息
    restAtCamp(node) {
        const healAmount = Math.floor(this.game.player.maxHp * 0.3);
        this.game.player.heal(healAmount);
        Utils.showBattleLog(`休息恢复 ${healAmount} 点生命`);
        this.completeNode(node);
        this.game.showScreen('map-screen');
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
