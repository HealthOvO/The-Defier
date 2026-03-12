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
        this.selectedCardIndex = -1;
        this.targetingMode = false;
        this.battleEnded = false;
        this.isProcessingCard = false; // 防止卡牌连点
        this.pendingTimers = new Set();
        this.activeCardActionId = 0;
        this.activeEncounterTheme = null;
        this.encounterRewardConsumed = false;
        this.squadRewardConsumed = false;
        this.commandState = this.createDefaultBattleCommandState();
        this.tacticalAdvisorCollapsed = false;
        this.tacticalAdvisorHoverExpanded = false;
        this.tacticalAdvisorHoverLocked = false;
        this.activeSquadEcology = null;
        this.advisorFocusTimer = null;
        this.hoveredBattleCardIndex = -1;
        this.turnAdvisorTelemetry = null;
        this.battleCommandPanelPosition = null;
        this.battleCommandDragState = null;
        this.boundBattleCommandDragMove = null;
        this.boundBattleCommandDragEnd = null;

        // 五行定义
        this.ELEMENTS = {
            metal: { name: '金', color: '#FFD700', weak: 'fire', strong: 'wood' },
            wood: { name: '木', color: '#4CAF50', weak: 'metal', strong: 'earth' },
            water: { name: '水', color: '#2196F3', weak: 'earth', strong: 'fire' },
            fire: { name: '火', color: '#FF5722', weak: 'water', strong: 'metal' },
            earth: { name: '土', color: '#795548', weak: 'wood', strong: 'water' }
        };

        this.eventListeners = new Map();
        this.uiDirty = {
            player: false,
            enemies: false,
            hand: false,
            energy: false,
            piles: false,
            environment: false,
            activeSkill: false,
            command: false
        };
    }

    // 统一托管战斗中的延时任务，避免战斗结束后旧回调串入新战斗
    scheduleBattleTimer(callback, delay) {
        const timerId = setTimeout(() => {
            this.pendingTimers.delete(timerId);
            if (this.battleEnded) return;
            try {
                callback();
            } catch (error) {
                console.error('Battle timer callback failed:', error);
            }
        }, delay);

        this.pendingTimers.add(timerId);
        return timerId;
    }

    clearBattleTimers() {
        this.pendingTimers.forEach(timerId => clearTimeout(timerId));
        this.pendingTimers.clear();
    }

    installBattlePlayerHooks() {
        if (!this.player || typeof this.player.addBlock !== 'function' || this.restorePlayerAddBlockHook) return;
        const originalAddBlock = this.player.addBlock;
        const battle = this;
        const wrappedAddBlock = function (amount) {
            const beforeBlock = Math.max(0, Number(this.block) || 0);
            const result = originalAddBlock.call(this, amount);
            const afterBlock = Math.max(0, Number(this.block) || 0);
            const gained = Math.max(0, afterBlock - beforeBlock);
            if (gained > 0) {
                battle.handleBossPlayerBlockGain(gained);
            }
            return result;
        };
        wrappedAddBlock.__battleWrapped = true;
        this.player.addBlock = wrappedAddBlock;
        this.restorePlayerAddBlockHook = () => {
            if (this.player && this.player.addBlock === wrappedAddBlock) {
                this.player.addBlock = originalAddBlock;
            }
            this.restorePlayerAddBlockHook = null;
        };
    }

    restoreBattlePlayerHooks() {
        if (typeof this.restorePlayerAddBlockHook === 'function') {
            this.restorePlayerAddBlockHook();
        }
    }

    getBossThreeActMemoryProfile(enemy) {
        const profileMap = {
            banditLeader: {
                key: 'seal_card',
                name: '封签索命',
                shortRule: '回合开始锁定一张手牌，打出时会注入心魔污染。',
                reverseRule: '逆转阶段会持续封签并扩大手牌污染。',
                counter: '优先清掉低价值牌，避免核心牌被锁定。',
                fail: '关键牌被封签后，节奏会被硬性打断。'
            },
            demonWolf: {
                key: 'siphon_block',
                name: '撕盾噬血',
                shortRule: '你每回合第一次获得护盾时，Boss 会虹吸其中一部分并恢复生命。',
                reverseRule: '逆转阶段虹吸比例提高，拖回合会被持续反制。',
                counter: '分散护盾时点，优先抢进攻窗口。',
                fail: '高护盾节奏会被直接转化成 Boss 的续航。'
            },
            swordElder: {
                key: 'seal_card',
                name: '剑印封诀',
                shortRule: '锁定你的关键手牌，迫使你改写出牌顺序。',
                reverseRule: '逆转阶段被锁定的牌会附带更重污染。',
                counter: '预留过牌与弃牌手段，拆掉被封锁的窗口。',
                fail: '核心斩杀牌被点名后，节奏会崩盘。'
            },
            danZun: {
                key: 'tribute_choice',
                name: '丹火索供',
                shortRule: '回合开始逼迫你在弃牌与掉血间做出牺牲。',
                reverseRule: '逆转阶段弃牌与掉血的惩罚会同步放大。',
                counter: '保持手牌质量，不让关键资源同时暴露。',
                fail: '手牌与血线会被持续双线压制。'
            },
            ancientSpirit: {
                key: 'siphon_block',
                name: '幽魄吸甲',
                shortRule: '你的第一层护盾会被转化为它的续航。',
                reverseRule: '逆转阶段会把护盾差进一步滚成血量差。',
                counter: '别过度依赖防守单卡，改用爆发抢节奏。',
                fail: '拖延会让它越打越难杀。'
            },
            divineLord: {
                key: 'tribute_choice',
                name: '神念索贡',
                shortRule: '每轮要求弃牌纳贡，手少时直接压血。',
                reverseRule: '逆转阶段纳贡失败会追加更高伤害。',
                counter: '留住低价值牌承压，保护核心启动牌。',
                fail: '关键回合会被抽空手牌或直接斩线。'
            },
            fusionSovereign: {
                key: 'seal_card',
                name: '时缚真印',
                shortRule: '将一张手牌标记为时缚牌，打出时污染牌序。',
                reverseRule: '逆转阶段时缚会更频繁地打乱手牌。',
                counter: '多保留冗余牌，让时缚落在次要资源上。',
                fail: '主力技能被拖慢后就会被节奏压死。'
            },
            mahayanaSupreme: {
                key: 'echo_last_card',
                name: '观心复诵',
                shortRule: '记住你上回合最后一张牌，并在敌回合复制收益。',
                reverseRule: '逆转阶段复制会更高效，错误收尾会被放大。',
                counter: '注意回合最后一张牌的类型，避免给它免费增益。',
                fail: '错误收尾会让 Boss 连续白嫖护盾或力量。'
            },
            ascensionSovereign: {
                key: 'seal_card',
                name: '天雷封符',
                shortRule: '被锁定的手牌在打出时会引来额外雷罚。',
                reverseRule: '逆转阶段封符频率增加。',
                counter: '保留便宜牌承受雷罚，保护核心爆发。',
                fail: '封符会把高费牌变成自爆点。'
            },
            dualMagmaGuardians: {
                key: 'siphon_block',
                name: '熔甲回铸',
                shortRule: '你第一次叠盾时，它们会熔走一部分转化为自身恢复。',
                reverseRule: '逆转阶段熔甲比例更高。',
                counter: '通过先手爆发压血，降低护盾依赖。',
                fail: '防守越多，它们越难被击杀。'
            },
            stormSummoner: {
                key: 'tribute_choice',
                name: '风祀索供',
                shortRule: '以弃牌换平安，手少时直接承受压血。',
                reverseRule: '逆转阶段会同时蚕食手牌与血线。',
                counter: '利用过牌与召唤击杀缩短战斗。',
                fail: '拖入后期会被手牌税拖死。'
            },
            triheadGoldDragon: {
                key: 'siphon_block',
                name: '龙首夺壁',
                shortRule: '你的第一段护盾会被金龙夺走并化为续航。',
                reverseRule: '逆转阶段夺壁更重。',
                counter: '减少纯叠盾回合，改打节奏交换。',
                fail: '护盾流会被完全针对。'
            },
            mirrorDemon: {
                key: 'echo_last_card',
                name: '镜返残响',
                shortRule: '它会复制你上回合最后一张牌的类型收益。',
                reverseRule: '逆转阶段镜返效率更高。',
                counter: '谨慎安排回合收尾牌。',
                fail: '错误收尾等于白送 Boss 一整段资源。'
            },
            chaosEye: {
                key: 'seal_card',
                name: '邪视封忆',
                shortRule: '随机扭曲一张手牌，打出时附带混沌污染。',
                reverseRule: '逆转阶段会更频繁地扰乱手牌。',
                counter: '用边角牌吸收污染，不要让关键牌暴露。',
                fail: '牌序被扭曲后会连续断节奏。'
            },
            voidDevourer: {
                key: 'tribute_choice',
                name: '虚渊索祭',
                shortRule: '每回合开始强迫你失去手牌或生命。',
                reverseRule: '逆转阶段若手牌不足，惩罚会更重。',
                counter: '维持足够手牌厚度，控制血线。',
                fail: '容易被拖到弃牌与掉血双崩。'
            },
            elementalElder: {
                key: 'echo_last_card',
                name: '五炁复写',
                shortRule: '根据你上回合最后一张牌复制护盾、力量或回复。',
                reverseRule: '逆转阶段复写收益更大。',
                counter: '避免用高价值防守/启动牌收尾。',
                fail: '每次收尾都会变成对方的免费资源。'
            },
            karmaArbiter: {
                key: 'tribute_choice',
                name: '业衡索偿',
                shortRule: '以弃牌赎罪，拒绝时将直接掉血。',
                reverseRule: '逆转阶段业衡惩罚加重。',
                counter: '保持冗余牌，避免核心回合被迫掉血。',
                fail: '血线和手牌会被同时抽干。'
            },
            heavenlyDao: {
                key: 'echo_last_card',
                name: '天道映照',
                shortRule: '映照你上一回合的终末牌序，把收益返还给自己。',
                reverseRule: '逆转阶段会把映照收益进一步放大。',
                counter: '谨慎处理回合的最后一张牌。',
                fail: '回合收尾错误会被成倍惩罚。'
            }
        };
        return profileMap[(enemy && enemy.id) || ''] || {
            key: 'seal_card',
            name: '封识诏令',
            shortRule: '锁定一张手牌并污染它。',
            reverseRule: '逆转阶段持续扩大封锁压力。',
            counter: '先交低价值牌，保护核心组件。',
            fail: '关键出牌窗口会被硬性打断。'
        };
    }

    createBossThreeActState(enemy) {
        if (!enemy || !enemy.isBoss) return null;
        const mech = (typeof BOSS_MECHANICS !== 'undefined' && enemy.id && BOSS_MECHANICS[enemy.id])
            ? BOSS_MECHANICS[enemy.id]
            : null;
        const memory = this.getBossThreeActMemoryProfile(enemy);
        const counterTreasure = Array.isArray(mech?.countersBy) && typeof TREASURES !== 'undefined'
            ? mech.countersBy.map((id) => TREASURES[id]?.name || id).slice(0, 2).join(' / ')
            : '';
        const declarationRule = mech?.mechanics?.description || '本场将围绕 Boss 的记忆点机制展开。';
        const phaseConfigs = Array.isArray(enemy.phaseConfig) ? enemy.phaseConfig : [];
        const actTwo = phaseConfigs[0] || {};
        const actThree = phaseConfigs[1] || {};
        return {
            active: true,
            bossId: enemy.id,
            bossName: enemy.name,
            memoryKey: memory.key,
            memoryName: memory.name,
            counterTreasure,
            currentActIndex: 0,
            transitionHistory: [0],
            runtime: {
                blockSiphonedTurn: -1,
                echoedTurn: -1,
                sealedTurn: -1,
                lastSealedCardInstanceId: null
            },
            acts: [
                {
                    id: 'declaration',
                    name: '宣告阶段',
                    threshold: 1,
                    signal: declarationRule,
                    rule: `记忆点：${memory.shortRule}`,
                    counter: counterTreasure ? `可借助法宝【${counterTreasure}】降低压力。${memory.counter}` : memory.counter,
                    fail: memory.fail,
                    patterns: enemy.patterns,
                    heal: 0
                },
                {
                    id: 'confrontation',
                    name: `对抗阶段${actTwo.name ? `·${actTwo.name}` : ''}`,
                    threshold: Number.isFinite(Number(actTwo.threshold)) ? Number(actTwo.threshold) : 0.68,
                    signal: actTwo.name ? `${enemy.name} 的 ${actTwo.name} 已被引爆。` : `${enemy.name} 开始主动拉高对抗节奏。`,
                    rule: `破局窗口：${memory.shortRule}`,
                    counter: memory.counter,
                    fail: `若此阶段无法建立优势，${memory.fail}`,
                    patterns: actTwo.patterns || enemy.patterns,
                    heal: Number.isFinite(Number(actTwo.heal)) ? Number(actTwo.heal) : 0.06
                },
                {
                    id: 'reversal',
                    name: `逆转阶段${actThree.name ? `·${actThree.name}` : ''}`,
                    threshold: Number.isFinite(Number(actThree.threshold)) ? Number(actThree.threshold) : 0.34,
                    signal: actThree.name ? `${enemy.name} 的 ${actThree.name} 压轴规则降临。` : `${enemy.name} 进入压轴逆转。`,
                    rule: `压轴机制：${memory.reverseRule}`,
                    counter: `最后窗口：${memory.counter}`,
                    fail: `若仍拖延战斗，${memory.fail}`,
                    patterns: actThree.patterns || actTwo.patterns || enemy.patterns,
                    heal: Number.isFinite(Number(actThree.heal)) ? Number(actThree.heal) : 0.1,
                    bonusStrength: 2
                }
            ]
        };
    }

    initializeBossThreeActState(enemy) {
        if (!enemy || !enemy.isBoss) return null;
        enemy.bossActState = this.createBossThreeActState(enemy);
        enemy.currentBossAct = 0;
        return enemy.bossActState;
    }

    getPrimaryBossEnemy() {
        return (Array.isArray(this.enemies) ? this.enemies : []).find((enemy) => enemy && enemy.isBoss && enemy.currentHp > 0) || null;
    }

    getBossActDisplayState(enemy = null) {
        const boss = enemy || this.getPrimaryBossEnemy();
        if (!boss || !boss.bossActState || !Array.isArray(boss.bossActState.acts)) return null;
        const state = boss.bossActState;
        const index = Math.max(0, Math.min(state.acts.length - 1, Number(state.currentActIndex) || 0));
        const act = state.acts[index] || state.acts[0];
        return {
            boss,
            state,
            index,
            act,
            hpPercent: Math.max(0, Math.min(1, (boss.currentHp || 0) / Math.max(1, boss.maxHp || 1)))
        };
    }

    resolveBossActCounterChips(displayState) {
        if (!displayState || !displayState.state || !displayState.act) return [];
        const { state, act } = displayState;
        const chips = [];

        const pushChip = (id, label, tip) => {
            if (!label) return;
            if (chips.some((chip) => chip.id === id || chip.label === label)) return;
            chips.push({ id, label, tip: tip || label });
        };

        if (act.id === 'declaration') {
            pushChip('observe', '先看宣告', '先确认本幕规则与惩罚，再决定资源投入。');
        } else if (act.id === 'confrontation') {
            pushChip('tempo', '抢对抗节奏', '对抗阶段要尽快建立优势，避免被拖进逆转。');
        } else if (act.id === 'reversal') {
            pushChip('finish', '尽快收官', '逆转阶段惩罚会被放大，应优先寻找收尾窗口。');
        }

        switch (state.memoryKey) {
            case 'seal_card':
                pushChip('protect_core', '保护核心牌', '优先用低价值牌承压，避免关键牌被封签。');
                pushChip('cycle', '留过牌手段', '预留过牌/弃牌窗口，减少被锁牌后的节奏断档。');
                break;
            case 'tribute_choice':
                pushChip('hand_buffer', '保手牌厚度', '保持冗余牌，避免被索供逼到核心资源。');
                pushChip('hp_buffer', '稳血线', '控制血线，避免掉血与弃牌惩罚同时失控。');
                break;
            case 'siphon_block':
                pushChip('burst_first', '少纯叠盾', '避免把整回合价值压在护盾上，优先打节奏交换。');
                pushChip('pressure', '先手压血', '通过爆发抢先压血，削弱 Boss 的滚雪球空间。');
                break;
            case 'echo_last_card':
                pushChip('careful_finish', '谨慎收尾', '回合最后一张牌尽量不要交高价值启动或防守牌。');
                pushChip('avoid_value', '别送白嫖收益', '避免让 Boss 复制到护盾、回复或高额收益。');
                break;
            default:
                pushChip('adapt', '按机制拆招', '先按当前记忆点拆解规则，再决定是否抢节奏。');
                break;
        }

        if (state.counterTreasure) {
            pushChip('treasure', `法宝·${state.counterTreasure}`, `当前 Boss 记忆点可借助法宝【${state.counterTreasure}】缓压。`);
        }

        if ((act.counter || '').includes('低价值牌')) pushChip('low_value', '边角牌承压', act.counter);
        if ((act.counter || '').includes('过牌') || (act.counter || '').includes('弃牌')) pushChip('cycle_tools', '保循环资源', act.counter);
        if ((act.counter || '').includes('爆发') || (act.counter || '').includes('进攻')) pushChip('burst_window', '抓爆发窗口', act.counter);

        return chips.slice(0, 4);
    }

    shouldUseCompactBattleHud() {
        if (typeof window === 'undefined' || typeof window.innerWidth !== 'number') return false;
        return window.innerWidth <= 768;
    }

    updateBossActUI() {
        const battleContainer = document.querySelector('#battle-screen .battle-container') || document.querySelector('.battle-container');
        if (!battleContainer) return;

        let panel = document.getElementById('boss-act-panel');
        const displayState = this.getBossActDisplayState();
        if (!displayState) {
            if (panel) {
                panel.style.display = 'none';
                panel.innerHTML = '';
            }
            return;
        }

        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'boss-act-panel';
            panel.className = 'boss-act-panel';
            const enemyArea = battleContainer.querySelector('.enemy-area');
            if (enemyArea) {
                battleContainer.insertBefore(panel, enemyArea);
            } else {
                battleContainer.insertBefore(panel, battleContainer.firstChild);
            }
        }

        const { boss, state, index, act, hpPercent } = displayState;
        const counterChips = this.resolveBossActCounterChips(displayState);
        panel.style.display = 'block';
        panel.innerHTML = `
            <div class="boss-act-header">
                <div>
                    <div class="boss-act-title">${boss.name} · 三幕式</div>
                    <div class="boss-act-subtitle">当前：${act.name}</div>
                </div>
                <div class="boss-act-hp">血线 ${(hpPercent * 100).toFixed(0)}%</div>
            </div>
            <div class="boss-act-track">
                ${state.acts.map((item, itemIndex) => `
                    <div class="boss-act-chip ${itemIndex === index ? 'active' : ''} ${itemIndex < index ? 'cleared' : ''}">
                        <span class="boss-act-chip-index">${itemIndex + 1}</span>
                        <span class="boss-act-chip-label">${item.name}</span>
                    </div>
                `).join('')}
            </div>
            ${counterChips.length > 0 ? `
                <div class="boss-act-counter-chips">
                    ${counterChips.map((chip) => `
                        <span class="boss-act-counter-chip chip-${chip.id}" title="${chip.tip}">${chip.label}</span>
                    `).join('')}
                </div>
            ` : ''}
            <div class="boss-act-body">
                <div class="boss-act-line signal"><span class="label">明确信号</span><span class="value">${act.signal}</span></div>
                <div class="boss-act-line rule"><span class="label">当前规则</span><span class="value">${act.rule}</span></div>
                <div class="boss-act-line counter"><span class="label">反制窗口</span><span class="value">${act.counter}</span></div>
                <div class="boss-act-line fail"><span class="label">失败原因</span><span class="value">${act.fail}</span></div>
            </div>
        `;
    }

    announceBossAct(enemy, initial = false) {
        const display = this.getBossActDisplayState(enemy);
        if (!display) return;
        const { act } = display;
        const prefix = initial ? '【Boss宣告】' : '【Boss转幕】';
        Utils.showBattleLog(`${prefix}${enemy.name} · ${act.name}`);
        Utils.showBattleLog(`规则：${act.rule}`);
        Utils.showBattleLog(`反制：${act.counter}`);
    }

    applyBossActTransition(enemy, nextIndex) {
        const state = enemy && enemy.bossActState;
        if (!enemy || !state || !Array.isArray(state.acts)) return false;
        if (nextIndex <= state.currentActIndex || nextIndex >= state.acts.length) return false;
        state.currentActIndex = nextIndex;
        enemy.currentBossAct = nextIndex;
        state.transitionHistory.push(nextIndex);
        const act = state.acts[nextIndex];

        if (Array.isArray(act.patterns) && act.patterns.length > 0) {
            enemy.patterns = act.patterns.map((pattern) => ({ ...pattern }));
            enemy.currentPatternIndex = 0;
            this.refreshEnemyTacticalPlan(enemy, true);
        }
        if (Number(act.heal) > 0 && typeof enemy.heal === 'function') {
            const healed = enemy.heal(Math.floor(Math.max(0, Number(act.heal)) * Math.max(1, enemy.maxHp || 1)));
            if (healed > 0) {
                Utils.showBattleLog(`${enemy.name} 在转幕中恢复了 ${healed} 点生命`);
            }
        }
        if (Number(act.bonusStrength) > 0 && typeof enemy.addBuff === 'function') {
            enemy.addBuff('strength', Math.floor(Number(act.bonusStrength)));
        }

        const enemyEl = document.querySelector(`.enemy[data-index="${this.enemies.indexOf(enemy)}"]`);
        if (enemyEl) {
            Utils.addShakeEffect(enemyEl, 'heavy');
            Utils.addFlashEffect(enemyEl, nextIndex >= 2 ? 'red' : 'gold');
        }
        this.announceBossAct(enemy, false);
        return true;
    }

    checkBossThreeActTransition(enemy) {
        const state = enemy && enemy.bossActState;
        if (!enemy || !state || !Array.isArray(state.acts)) return false;
        const hpPercent = (enemy.currentHp || 0) / Math.max(1, enemy.maxHp || 1);
        let transitioned = false;
        while (
            state.currentActIndex + 1 < state.acts.length &&
            hpPercent <= Number(state.acts[state.currentActIndex + 1].threshold)
        ) {
            transitioned = this.applyBossActTransition(enemy, state.currentActIndex + 1) || transitioned;
        }
        return transitioned;
    }

    processBossThreeActEnemyTurnStart(enemy) {
        const display = this.getBossActDisplayState(enemy);
        if (!display) return;
        const memoryKey = display.state.memoryKey;
        if (memoryKey !== 'echo_last_card') return;
        if (!this.lastPlayerCardSnapshot || display.state.runtime.echoedTurn === this.turnNumber) return;

        const snapshot = this.lastPlayerCardSnapshot;
        display.state.runtime.echoedTurn = this.turnNumber;
        if (snapshot.type === 'attack') {
            enemy.addBuff('strength', display.index >= 2 ? 2 : 1);
            Utils.showBattleLog(`记忆点【${display.state.memoryName}】：${enemy.name} 映照了你的攻击节奏，力量提升！`);
        } else if (snapshot.type === 'skill' || snapshot.type === 'defense') {
            enemy.block = (enemy.block || 0) + (display.index >= 2 ? 12 : 8);
            Utils.showBattleLog(`记忆点【${display.state.memoryName}】：${enemy.name} 复制了你的防守余韵，获得护盾！`);
        } else {
            const healed = enemy.heal(display.index >= 2 ? 10 : 6);
            Utils.showBattleLog(`记忆点【${display.state.memoryName}】：${enemy.name} 回收了你的术式余波，恢复 ${healed} 生命！`);
        }
    }

    processBossThreeActPlayerTurnStart(enemy) {
        const display = this.getBossActDisplayState(enemy);
        if (!display) return;
        display.state.runtime.blockSiphonedTurn = -1;
        const memoryKey = display.state.memoryKey;
        if (memoryKey === 'seal_card') {
            this.markBossSealedCard(enemy, display);
            return;
        }
        if (memoryKey === 'tribute_choice') {
            const hand = Array.isArray(this.player.hand) ? this.player.hand : [];
            if (hand.length >= 4) {
                const discardIndex = Math.floor(Math.random() * hand.length);
                const discarded = hand.splice(discardIndex, 1)[0];
                if (discarded) {
                    this.player.discardPile = Array.isArray(this.player.discardPile) ? this.player.discardPile : [];
                    this.player.discardPile.push(discarded);
                    Utils.showBattleLog(`记忆点【${display.state.memoryName}】：你被迫弃掉【${discarded.name}】以平息威压。`);
                }
            } else {
                const damage = display.index >= 2 ? 8 : 5;
                this.player.takeDamage(damage);
                Utils.showBattleLog(`记忆点【${display.state.memoryName}】：供契不足，你失去 ${damage} 点生命。`);
            }
            this.markUIDirty('player', 'hand', 'piles');
        }
    }

    markBossSealedCard(enemy, displayState = null) {
        const display = displayState || this.getBossActDisplayState(enemy);
        if (!display) return false;
        const candidates = (Array.isArray(this.player.hand) ? this.player.hand : []).filter((card) => !!card && !card.__bossSealed);
        if (candidates.length === 0) return false;
        const card = candidates[Math.floor(Math.random() * candidates.length)];
        card.__bossSealed = true;
        card.__bossSealedPenalty = display.index >= 2 ? 2 : 1;
        card.__bossSealedSource = enemy.name;
        display.state.runtime.lastSealedCardInstanceId = card.instanceId || card.id || card.name;
        display.state.runtime.sealedTurn = this.turnNumber;
        Utils.showBattleLog(`记忆点【${display.state.memoryName}】：${enemy.name} 锁定了【${card.name}】。`);
        this.markUIDirty('hand');
        return true;
    }

    handleBossPlayerBlockGain(gainedAmount = 0) {
        const display = this.getBossActDisplayState();
        if (!display || display.state.memoryKey !== 'siphon_block') return;
        if (display.state.runtime.blockSiphonedTurn === this.turnNumber) return;
        const siphonRatio = display.index >= 2 ? 0.65 : 0.45;
        const siphon = Math.max(1, Math.floor(Math.max(0, Number(gainedAmount) || 0) * siphonRatio));
        if (siphon <= 0) return;

        this.player.block = Math.max(0, (this.player.block || 0) - siphon);
        const healed = display.boss.heal(siphon);
        display.state.runtime.blockSiphonedTurn = this.turnNumber;
        Utils.showBattleLog(`记忆点【${display.state.memoryName}】：${display.boss.name} 虹吸 ${siphon} 护盾${healed > 0 ? `，并恢复 ${healed} 生命` : ''}。`);
        this.markUIDirty('player', 'enemies');
    }

    handleBossSealedCardPlayed(card) {
        if (!card || !card.__bossSealed) return;
        const boss = this.getPrimaryBossEnemy();
        if (!boss || !boss.bossActState) return;
        const curseCard = typeof cloneCardTemplate === 'function'
            ? cloneCardTemplate('demonDoubt')
            : (typeof CARDS !== 'undefined' && CARDS.demonDoubt ? JSON.parse(JSON.stringify(CARDS.demonDoubt)) : null);
        if (curseCard) {
            curseCard.instanceId = this.player.generateCardId ? this.player.generateCardId() : `${curseCard.id}_${Date.now()}`;
            this.player.discardPile = Array.isArray(this.player.discardPile) ? this.player.discardPile : [];
            this.player.discardPile.push(curseCard);
        }
        const backlash = boss.currentBossAct >= 2 ? 6 : 4;
        this.player.takeDamage(backlash);
        Utils.showBattleLog(`记忆点【${boss.bossActState.memoryName}】：被锁定的【${card.name}】反噬，你失去 ${backlash} 点生命。`);
        delete card.__bossSealed;
        delete card.__bossSealedPenalty;
        delete card.__bossSealedSource;
        this.markUIDirty('player', 'hand', 'piles');
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
        this.clearBattleTimers();
        this.restoreBattlePlayerHooks();
        this.enemies = [];
        this.battleEnded = false;
        this.battleResolution = null;
        this.forceEndEnemyTurn = false;
        this.eventListeners.clear();
        this.turnNumber = 0;
        this.selectedCard = null;
        this.selectedCardIndex = -1;
        this.targetingMode = false;
        this.isProcessingCard = false;
        this.isTurnTransitioning = false;
        this.currentCardProcessToken = 0;
        this.pendingLifeSteal = 0;
        this.lastPlayerCardSnapshot = null;
        this.cardsPlayedThisTurn = 0;
        this.playerAttackedThisTurn = false;
        this.activeCardActionId = 0;
        this.activeEncounterTheme = null;
        this.encounterRewardConsumed = false;
        this.squadRewardConsumed = false;
        this.commandState = this.createDefaultBattleCommandState();
        this.tacticalAdvisorCollapsed = false;
        this.activeSquadEcology = null;
        this.turnAdvisorTelemetry = null;
        if (this.advisorFocusTimer) {
            clearTimeout(this.advisorFocusTimer);
            this.advisorFocusTimer = null;
        }
        // --- P0 机制：五行融合化境 (Elemental Combo) 追踪器 ---
        this.elementalTracker = [];

        // 创建敌人实例
        if (Array.isArray(enemyData)) {
            for (const data of enemyData) {
                const enemy = this.createEnemyInstance(data);
                if (enemy) this.enemies.push(enemy);
            }
        } else {
            const enemy = this.createEnemyInstance(enemyData);
            if (enemy) this.enemies.push(enemy);
        }

        if (this.enemies.length === 0) {
            this.battleEnded = true;
            Utils.showBattleLog('战斗初始化失败：未找到有效敌人');
            return;
        }

        this.applyEnemySquadEcology();

        // 兼容旧逻辑：部分法宝/系统通过 game.enemies 读取当前敌人
        if (this.game) {
            this.game.currentEnemies = this.enemies;
            this.game.enemies = this.enemies;
        }
        if (typeof window !== 'undefined' && window.game) {
            window.game.currentEnemies = this.enemies;
            window.game.enemies = this.enemies;
        }

        // 准备玩家战斗状态
        this.player.prepareBattle();

        // 开始战斗
        this.startBattle();
    }

    // ==========================================
    // --- P0 机制：五行融合化境 (Elemental Combo) ---
    // ==========================================
    async processElementalCombos(target, targetIndex) {
        if (!this.elementalTracker || this.elementalTracker.length < 3) return;

        // 获取最近的三次元素释放记录
        const len = this.elementalTracker.length;
        const combo = [
            this.elementalTracker[len - 3],
            this.elementalTracker[len - 2],
            this.elementalTracker[len - 1]
        ].map(Utils.getCanonicalElement).join('+');

        let comboTriggered = false;

        // 灰烬领域 (Ash Domain): 火 + 木 + 土
        if (combo === 'fire+wood+earth') {
            Utils.showBattleLog('【五行化境】触发：灰烬领域！', 'warning');
            for (let i = 0; i < this.enemies.length; i++) {
                const enemy = this.enemies[i];
                if (enemy.currentHp <= 0) continue;
                if (!enemy.buffs || typeof enemy.buffs !== 'object') enemy.buffs = {};

                // 施加 2 层灼烧与 1 层虚弱
                enemy.buffs.burn = (enemy.buffs.burn || 0) + 2;
                enemy.buffs.weak = (enemy.buffs.weak || 0) + 1;

                const el = document.querySelector(`.enemy[data-index="${i}"]`);
                if (el) Utils.addFlashEffect(el, '#ff6600');
            }
            comboTriggered = true;
        }

        // 冰霜风暴 (Frost Storm): 水 + 水 + 风(可以用金/木代替？目前假设水+水+水暂定)
        else if (combo === 'water+water+water') {
            Utils.showBattleLog('【五行化境】触发：极寒冰狱！', 'warning');
            for (let i = 0; i < this.enemies.length; i++) {
                const enemy = this.enemies[i];
                if (enemy.currentHp <= 0) continue;

                if (enemy.isBoss) {
                    enemy.currentHp -= 10;
                } else {
                    enemy.stunned = true;
                }
                const el = document.querySelector(`.enemy[data-index="${i}"]`);
                if (el) Utils.addFlashEffect(el, '#00ffff');
            }
            comboTriggered = true;
        }

        // 可以添加更多组合：
        // 锋锐雷阵 (Metal+Fire+Metal): 针对首个目标爆发高额穿透伤害
        else if (combo === 'metal+fire+metal' && target) {
            Utils.showBattleLog('【五行化境】触发：煌雷剑阵！', 'warning');
            const dmg = 15;
            const enemyEl = document.querySelector(`.enemy[data-index="${targetIndex}"]`);

            const oldBlock = target.block;
            target.block = 0;
            target.currentHp -= dmg;
            target.block = oldBlock;

            if (enemyEl) {
                Utils.addShakeEffect(enemyEl, 'heavy');
                Utils.showFloatingNumber(enemyEl, dmg, 'damage');
            }
            comboTriggered = true;
        }
        // 生命萌发 (Water+Wood+Wood): 恢复生命与护盾
        else if (combo === 'water+wood+wood') {
            Utils.showBattleLog('【五行化境】触发：森罗万象！', 'warning');
            this.player.heal(10);
            this.player.addBlock(10);
            comboTriggered = true;
        }
        // 绝对壁垒 (Earth+Metal+Earth): 大额护盾且保留一回合
        else if (combo === 'earth+metal+earth') {
            Utils.showBattleLog('【五行化境】触发：绝对壁垒！', 'warning');
            this.player.addBlock(20);
            this.player.buffs.retainBlock = (this.player.buffs.retainBlock || 0) + 1;
            comboTriggered = true;
        }

        if (comboTriggered) {
            // 触发后清空近期追踪记录（或保留最后几个？为了防止连续触发，通常清空）
            this.elementalTracker = [];
            this.updateBattleUI();
            await Utils.sleep(500); // 视觉停留动画
        }
    }

    // 根据行动构成识别敌人作战倾向，用于注入差异化战术
    resolveEnemyCombatArchetype(patterns = []) {
        if (!Array.isArray(patterns) || patterns.length === 0) return 'balanced';
        const countBy = { attack: 0, defend: 0, debuff: 0, utility: 0 };

        patterns.forEach((pattern) => {
            if (!pattern || typeof pattern !== 'object') return;
            if (pattern.type === 'attack' || pattern.type === 'multiAttack' || pattern.type === 'executeDamage') {
                countBy.attack += 1;
            } else if (pattern.type === 'defend' || (pattern.type === 'buff' && pattern.buffType === 'block')) {
                countBy.defend += 1;
            } else if (pattern.type === 'debuff' || pattern.type === 'addStatus') {
                countBy.debuff += 1;
            } else {
                countBy.utility += 1;
            }
        });

        if (countBy.debuff >= 2 || (countBy.debuff >= 1 && countBy.attack <= 1)) return 'hexer';
        if (countBy.defend >= 2 || (countBy.defend > countBy.attack && countBy.defend >= 1)) return 'guardian';
        if (countBy.attack >= 2 && countBy.attack >= countBy.defend + countBy.debuff) return 'striker';
        return 'balanced';
    }

    // 按天域与敌人倾向构建“战术变体”，降低同层敌人同质化
    getEnemyVariationBlueprint(enemyData, patterns = [], maxHp = 1) {
        if (!enemyData || typeof enemyData !== 'object') return null;
        if (enemyData.isBoss || enemyData.isGhost || enemyData.isMinion) return null;
        const realm = Math.max(1, Math.floor(Number(this.player?.realm) || 1));
        const archetype = this.resolveEnemyCombatArchetype(patterns);

        const attackValues = (Array.isArray(patterns) ? patterns : [])
            .filter((pattern) => pattern && typeof pattern === 'object' && Number.isFinite(Number(pattern.value))
                && (pattern.type === 'attack' || pattern.type === 'multiAttack' || pattern.type === 'executeDamage'))
            .map((pattern) => Math.max(1, Math.floor(Number(pattern.value) || 1)));
        const avgAttack = attackValues.length > 0
            ? Math.max(2, Math.floor(attackValues.reduce((sum, val) => sum + val, 0) / attackValues.length))
            : Math.max(2, Math.floor(realm * 0.75 + 2));

        const seedSource = `${enemyData.id || enemyData.name || 'enemy'}:${realm}:${patterns.length}:${archetype}`;
        let seed = 0;
        for (let i = 0; i < seedSource.length; i += 1) {
            seed = (seed * 31 + seedSource.charCodeAt(i)) % 2147483647;
        }

        const tier = realm >= 13 ? 'late' : realm >= 7 ? 'mid' : 'early';
        const variantPool = {
            early: [
                {
                    id: 'rush_edge',
                    tag: '急袭',
                    roles: ['striker', 'balanced'],
                    attackMul: 1.08,
                    appendPatterns: [
                        { type: 'attack', value: Math.max(3, avgAttack + 2), intent: '⚔️急袭' }
                    ]
                },
                {
                    id: 'guard_shell',
                    tag: '守势',
                    roles: ['guardian', 'any'],
                    openingBlock: 8,
                    appendPatterns: [
                        { type: 'defend', value: Math.max(6, Math.floor(avgAttack * 1.2)), intent: '🛡️固守' }
                    ]
                },
                {
                    id: 'hex_nudge',
                    tag: '扰法',
                    roles: ['hexer', 'balanced', 'any'],
                    attackMul: 1.04,
                    appendPatterns: [
                        { type: 'debuff', buffType: 'weak', value: 1, intent: '🌀扰法' }
                    ]
                }
            ],
            mid: [
                {
                    id: 'rupture_combo',
                    tag: '裂阵',
                    roles: ['striker', 'balanced'],
                    attackMul: 1.1,
                    appendPatterns: [
                        { type: 'multiAttack', value: Math.max(3, Math.floor(avgAttack * 0.76)), count: 2, intent: '⚔️裂阵连击' }
                    ]
                },
                {
                    id: 'anchor_ward',
                    tag: '稳压',
                    roles: ['guardian', 'any'],
                    openingBlock: 10,
                    openingStrength: 1,
                    appendPatterns: [
                        { type: 'defend', value: Math.max(8, Math.floor(avgAttack * 1.3)), intent: '🧿稳压护体' }
                    ]
                },
                {
                    id: 'siphon_curse',
                    tag: '侵蚀',
                    roles: ['hexer', 'balanced', 'any'],
                    appendPatterns: [
                        { type: 'debuff', buffType: 'vulnerable', value: 1, intent: '🩸侵蚀咒印' }
                    ]
                }
            ],
            late: [
                {
                    id: 'skywrath',
                    tag: '天威',
                    roles: ['striker', 'balanced'],
                    attackMul: 1.13,
                    openingStrength: 1,
                    appendPatterns: [
                        {
                            type: 'multiAttack',
                            value: Math.max(4, Math.floor(avgAttack * 0.82)),
                            count: realm >= 16 ? 3 : 2,
                            intent: '⚡天威连斩'
                        }
                    ]
                },
                {
                    id: 'doom_seal',
                    tag: '煞咒',
                    roles: ['hexer', 'any'],
                    openingBlock: 6,
                    appendPatterns: [
                        { type: 'debuff', buffType: 'vulnerable', value: 1, intent: '🩸终厄咒印' },
                        { type: 'addStatus', cardId: 'heartDemon', count: 1, intent: '🕳️心魔侵染' }
                    ]
                },
                {
                    id: 'tide_recover',
                    tag: '回潮',
                    roles: ['guardian', 'balanced', 'any'],
                    openingBlock: 12,
                    appendPatterns: [
                        { type: 'heal', value: Math.max(12, Math.floor(Math.max(1, maxHp) * 0.1)), intent: '🌊回潮修复' }
                    ]
                }
            ]
        };

        const pool = variantPool[tier] || variantPool.early;
        const candidates = pool.filter((variant) => Array.isArray(variant.roles) && (
            variant.roles.includes(archetype) || variant.roles.includes('any')
        ));
        const source = candidates.length > 0 ? candidates : pool;
        const pick = source[seed % source.length];
        if (!pick) return null;

        const appendPatterns = (pick.appendPatterns || [])
            .filter((pattern) => !!pattern && typeof pattern === 'object')
            .map((pattern) => ({ ...pattern }));
        if (typeof CARDS === 'undefined') {
            // 在测试环境里可能没有完整卡牌表，避免注入无效 addStatus
            for (let i = appendPatterns.length - 1; i >= 0; i -= 1) {
                if (appendPatterns[i].type === 'addStatus') appendPatterns.splice(i, 1);
            }
        }

        return {
            id: pick.id,
            tag: pick.tag || '变体',
            archetype,
            tier,
            attackMul: Math.max(1, Number(pick.attackMul) || 1),
            openingBlock: Math.max(0, Math.floor(Number(pick.openingBlock) || 0)),
            openingStrength: Math.max(0, Math.floor(Number(pick.openingStrength) || 0)),
            appendPatterns
        };
    }

    hashSquadSeed(input = '') {
        const str = String(input || '');
        let seed = 0;
        for (let i = 0; i < str.length; i += 1) {
            seed = (seed * 33 + str.charCodeAt(i)) % 2147483647;
        }
        return seed;
    }

    resolveEnemySquadFormation(enemies = []) {
        const combatants = Array.isArray(enemies)
            ? enemies.filter((enemy) => enemy && enemy.currentHp > 0 && !enemy.isBoss && !enemy.isGhost && !enemy.isMinion)
            : [];
        if (combatants.length < 2) return null;

        const roleCount = { striker: 0, guardian: 0, hexer: 0, balanced: 0 };
        combatants.forEach((enemy) => {
            const role = String(enemy.enemyVariantRole || this.resolveEnemyCombatArchetype(enemy.patterns) || 'balanced');
            roleCount[role] = (roleCount[role] || 0) + 1;
        });

        const realm = Math.max(1, Math.floor(Number(this.player?.realm) || 1));
        const node = this.game && this.game.currentBattleNode ? this.game.currentBattleNode : null;
        const nodeSeed = node ? `${node.id || 0}:${node.row || 0}:${node.col || 0}:${node.type || 'enemy'}` : 'node:0';
        const ids = combatants.map((enemy) => String(enemy.id || enemy.name || 'enemy')).sort().join('|');
        const seed = this.hashSquadSeed(`${realm}:${nodeSeed}:${ids}:${combatants.length}`);

        const pool = [
            {
                id: 'squad_pincer_hunt',
                name: '钳袭编队',
                tag: '钳袭',
                desc: '前锋抢节奏，扰阵单位补减益，后排负责接力输出。',
                preferred: ['striker', 'balanced'],
                attackMul: 1.06,
                openingBlock: 2
            },
            {
                id: 'squad_bulwark_web',
                name: '壁垒联阵',
                tag: '壁垒',
                desc: '敌方会轮流加固防线，迫使你优先破盾。',
                preferred: ['guardian', 'balanced'],
                attackMul: 1.02,
                openingBlock: 5
            },
            {
                id: 'squad_hex_weave',
                name: '咒织链阵',
                tag: '咒织',
                desc: '敌方通过咒印链协同压场，战斗更偏控场消耗。',
                preferred: ['hexer', 'balanced'],
                attackMul: 1.03,
                openingBlock: 3
            },
            {
                id: 'squad_relay_cascade',
                name: '潮汐接力',
                tag: '接力',
                desc: '敌方交替爆发与防守，形成明显波段压力。',
                preferred: ['balanced', 'striker', 'guardian'],
                attackMul: 1.05,
                openingBlock: 3
            }
        ];

        const preferredPool = pool.filter((formation) => {
            if (!formation || !Array.isArray(formation.preferred)) return false;
            return formation.preferred.some((role) => (roleCount[role] || 0) > 0);
        });
        const source = preferredPool.length > 0 ? preferredPool : pool;
        const picked = source[seed % source.length];
        if (!picked) return null;
        return {
            ...picked,
            seed
        };
    }

    applyEnemySquadEcology() {
        this.activeSquadEcology = null;
        if (!Array.isArray(this.enemies) || this.enemies.length < 2) return;

        const combatants = this.enemies.filter((enemy) =>
            enemy &&
            enemy.currentHp > 0 &&
            !enemy.isBoss &&
            !enemy.isGhost &&
            !enemy.isMinion &&
            Array.isArray(enemy.patterns)
        );
        if (combatants.length < 2) return;

        const formation = this.resolveEnemySquadFormation(combatants);
        if (!formation) return;

        const seeded = combatants
            .map((enemy) => ({
                enemy,
                seed: this.hashSquadSeed(`${formation.seed}:${enemy.id || enemy.name || 'enemy'}`)
            }))
            .sort((a, b) => a.seed - b.seed)
            .map((entry) => entry.enemy);

        const roleLabels = ['阵核', '前锋', '扰阵'];
        seeded.forEach((enemy, index) => {
            if (!enemy || !Array.isArray(enemy.patterns)) return;
            const roleLabel = roleLabels[index] || '策应';
            enemy.enemySquadFormationId = formation.id;
            enemy.enemySquadTag = formation.tag;
            enemy.enemySquadRoleLabel = roleLabel;
            enemy.enemySquadDesc = formation.desc;

            const attackPatterns = enemy.patterns.filter((pattern) =>
                pattern &&
                typeof pattern === 'object' &&
                (pattern.type === 'attack' || pattern.type === 'multiAttack' || pattern.type === 'executeDamage') &&
                Number.isFinite(Number(pattern.value))
            );
            const hasDefend = enemy.patterns.some((pattern) => pattern && pattern.type === 'defend');
            const hasDebuff = enemy.patterns.some((pattern) => pattern && (pattern.type === 'debuff' || pattern.type === 'addStatus'));

            enemy.block = Math.max(0, Math.floor(Number(enemy.block) || 0)) + Math.max(0, Math.floor(Number(formation.openingBlock) || 0));

            if (index === 0) {
                enemy.buffs = enemy.buffs && typeof enemy.buffs === 'object' ? enemy.buffs : {};
                enemy.buffs.strength = Math.max(0, Number(enemy.buffs.strength) || 0) + 1;
            }

            if (formation.id === 'squad_pincer_hunt') {
                attackPatterns.forEach((pattern) => {
                    pattern.value = Math.max(1, Math.floor(Number(pattern.value) * formation.attackMul));
                });
                if (index === 1 && attackPatterns.length > 0) {
                    const ref = attackPatterns[0];
                    enemy.patterns.push({
                        type: 'multiAttack',
                        value: Math.max(3, Math.floor(Number(ref.value) * 0.62)),
                        count: 2,
                        intent: '⚔️钳袭接力'
                    });
                }
                if (index >= 2 && !hasDebuff) {
                    enemy.patterns.push({
                        type: 'debuff',
                        buffType: 'weak',
                        value: 1,
                        intent: '🪤钳袭扰阵'
                    });
                }
            } else if (formation.id === 'squad_bulwark_web') {
                enemy.block = Math.max(enemy.block || 0, 8 + index * 2);
                enemy.buffs = enemy.buffs && typeof enemy.buffs === 'object' ? enemy.buffs : {};
                if (index === 0) {
                    enemy.buffs.thorns = Math.max(0, Number(enemy.buffs.thorns) || 0) + 1;
                }
                if (!hasDefend) {
                    enemy.patterns.push({
                        type: 'defend',
                        value: 8 + Math.max(0, index - 1) * 2,
                        intent: '🛡️联阵护垒'
                    });
                }
            } else if (formation.id === 'squad_hex_weave') {
                if (!hasDebuff) {
                    enemy.patterns.push({
                        type: 'debuff',
                        buffType: index === 0 ? 'vulnerable' : 'weak',
                        value: 1,
                        intent: index === 0 ? '🕸️咒织裂印' : '🕸️咒织缠压'
                    });
                }
                if (index === seeded.length - 1 && !hasDefend) {
                    enemy.patterns.push({
                        type: 'defend',
                        value: 7,
                        intent: '🧿咒织回护'
                    });
                }
            } else if (formation.id === 'squad_relay_cascade') {
                if (index % 2 === 0) {
                    attackPatterns.forEach((pattern) => {
                        pattern.value = Math.max(1, Math.floor(Number(pattern.value) * formation.attackMul));
                    });
                } else if (!hasDefend) {
                    enemy.patterns.push({
                        type: 'defend',
                        value: 8,
                        intent: '🌊潮汐回防'
                    });
                }
                if (index === seeded.length - 1 && !enemy.patterns.some((pattern) => pattern && pattern.type === 'heal')) {
                    enemy.patterns.push({
                        type: 'heal',
                        value: Math.max(6, Math.floor(Number(enemy.maxHp || enemy.currentHp || 1) * 0.06)),
                        intent: '🌊潮汐整队'
                    });
                }
            }

            this.refreshEnemyTacticalPlan(enemy, true);
        });

        this.activeSquadEcology = {
            id: formation.id,
            name: formation.name,
            tag: formation.tag,
            desc: formation.desc,
            count: seeded.length
        };
    }

    // 构建本场遭遇主题（仅PVE普通/精英/试炼战斗），进一步降低同层战斗同质化
    resolveEncounterThemeProfile() {
        if (!Array.isArray(this.enemies) || this.enemies.length === 0) return null;
        if (this.enemies.some((enemy) => enemy && (enemy.isBoss || enemy.isGhost || enemy.isMinion))) return null;
        if (!this.game || String(this.game.mode || 'pve') === 'pvp') return null;
        if (typeof this.game.isEndlessActive === 'function' && this.game.isEndlessActive()) return null;

        const node = this.game.currentBattleNode || null;
        if (!node || !['enemy', 'elite', 'trial'].includes(node.type)) return null;

        const realm = Math.max(1, Math.floor(Number(this.player?.realm) || 1));
        const tier = realm >= 13 ? 'late' : realm >= 7 ? 'mid' : 'early';
        const poolByTier = {
            early: [
                {
                    id: 'stormfront_skirmish',
                    name: '疾雷遭遇',
                    icon: '⚡',
                    shortTag: '疾雷',
                    description: '敌方攻势更急，但你开场获得少量护盾稳住节奏。',
                    attackMul: 1.06,
                    openingBlock: 0,
                    playerOpeningBlock: 5
                },
                {
                    id: 'iron_checkpoint',
                    name: '铁关据守',
                    icon: '🧱',
                    shortTag: '据守',
                    description: '敌方开场护盾提升，战斗会更偏向拉锯。',
                    attackMul: 1,
                    openingBlock: 10,
                    playerOpeningBlock: 3
                },
                {
                    id: 'haze_ritual',
                    name: '蚀雾术场',
                    icon: '🌫️',
                    shortTag: '蚀雾',
                    description: '敌方术式会补上减益段，考验净化与爆发窗口。',
                    attackMul: 1.03,
                    openingBlock: 4,
                    injectDebuffType: 'weak',
                    injectDebuffValue: 1,
                    injectDebuffIntent: '🌫️蚀雾侵压',
                    playerOpeningBlock: 4
                }
            ],
            mid: [
                {
                    id: 'thunder_vanguard',
                    name: '雷锋突进',
                    icon: '⛈️',
                    shortTag: '雷锋',
                    description: '敌方攻击倍率上浮，需提前规划防御节奏。',
                    attackMul: 1.08,
                    openingBlock: 2,
                    playerOpeningBlock: 6
                },
                {
                    id: 'citadel_grind',
                    name: '玄垒消耗战',
                    icon: '🏯',
                    shortTag: '玄垒',
                    description: '敌方起手护盾与基础威能并存，战线明显拉长。',
                    attackMul: 1.04,
                    openingBlock: 12,
                    playerOpeningBlock: 5
                },
                {
                    id: 'curse_current',
                    name: '咒流压场',
                    icon: '🕸️',
                    shortTag: '咒流',
                    description: '敌方更容易打出易伤压制，需主动抢节奏。',
                    attackMul: 1.05,
                    openingBlock: 6,
                    injectDebuffType: 'vulnerable',
                    injectDebuffValue: 1,
                    injectDebuffIntent: '🕸️咒流缚印',
                    playerOpeningBlock: 5
                }
            ],
            late: [
                {
                    id: 'doomsurge_raid',
                    name: '天灾突袭',
                    icon: '🌩️',
                    shortTag: '天灾',
                    description: '高压突袭型遭遇，敌方伤害显著抬升。',
                    attackMul: 1.1,
                    openingBlock: 4,
                    playerOpeningBlock: 7
                },
                {
                    id: 'obsidian_fortress',
                    name: '黑曜战垒',
                    icon: '🛡️',
                    shortTag: '战垒',
                    description: '敌方进入重护盾拉扯形态，必须把握破绽回合。',
                    attackMul: 1.05,
                    openingBlock: 14,
                    playerOpeningBlock: 6
                },
                {
                    id: 'void_miasma',
                    name: '虚蚀迷域',
                    icon: '☠️',
                    shortTag: '虚蚀',
                    description: '敌方补入减益咒段并提升压迫值，拖战风险上升。',
                    attackMul: 1.06,
                    openingBlock: 8,
                    injectDebuffType: 'weak',
                    injectDebuffValue: 2,
                    injectDebuffIntent: '☠️虚蚀咒印',
                    playerOpeningBlock: 6
                }
            ]
        };

        const tierPool = poolByTier[tier] || poolByTier.early;
        if (!Array.isArray(tierPool) || tierPool.length === 0) return null;

        const nodeTypeWeight = node.type === 'elite' ? 'elite' : node.type === 'trial' ? 'trial' : 'enemy';
        const preferredPool = tierPool.filter((theme) => {
            if (!theme || typeof theme !== 'object') return false;
            if (nodeTypeWeight === 'enemy') return true;
            if (nodeTypeWeight === 'elite') return Number(theme.attackMul || 1) >= 1.05 || Number(theme.openingBlock || 0) >= 10;
            return Number(theme.injectDebuffValue || 0) > 0;
        });
        const sourcePool = preferredPool.length > 0 ? preferredPool : tierPool;
        if (sourcePool.length === 0) return null;

        const encounterState = (this.game && typeof this.game.ensureEncounterState === 'function')
            ? this.game.ensureEncounterState()
            : null;
        const lastThemeId = encounterState && typeof encounterState.currentStreakId === 'string'
            ? encounterState.currentStreakId
            : '';
        const lastThemeStreak = encounterState
            ? Math.max(0, Math.floor(Number(encounterState.currentStreak) || 0))
            : 0;

        const seedSource = [
            realm,
            node.id || 0,
            node.row || 0,
            node.col || 0,
            node.type || 'enemy',
            this.enemies.length
        ].join(':');
        let seed = 0;
        for (let i = 0; i < seedSource.length; i += 1) {
            seed = (seed * 33 + seedSource.charCodeAt(i)) % 2147483647;
        }
        let pick = sourcePool[seed % sourcePool.length];
        if (lastThemeId && lastThemeStreak > 0) {
            const sameTheme = sourcePool.find((theme) => theme && theme.id === lastThemeId);
            const streakRoll = seed % 100;
            // 让同主题连续遭遇有稳定概率出现，支持 II/III 阶成长体验
            if (sameTheme && streakRoll < 38) {
                pick = sameTheme;
            }
        }
        if (!pick) return null;

        return {
            ...pick,
            tier,
            nodeType: node.type
        };
    }

    getEncounterTierScale(tierStage = 1) {
        const stage = Math.max(1, Math.min(3, Math.floor(Number(tierStage) || 1)));
        if (stage >= 3) return 1.22;
        if (stage >= 2) return 1.1;
        return 1;
    }

    applyEncounterSignatureAffix(enemy, theme, tierStage = 1) {
        if (!enemy || enemy.currentHp <= 0) return;
        if (enemy.isBoss || enemy.isGhost || enemy.isMinion) return;
        if (!Array.isArray(enemy.patterns)) enemy.patterns = [];

        const stage = Math.max(1, Math.min(3, Math.floor(Number(tierStage) || 1)));
        const counterAffix = this.getEncounterCounterAffixPayload(stage);
        if (counterAffix) {
            this.applyEncounterAffixPayload(enemy, counterAffix);
            return;
        }

        const hasDebuffTheme = !!(theme && theme.injectDebuffType && Number(theme.injectDebuffValue) > 0);
        const hasFortressTheme = !!(theme && Number(theme.openingBlock || 0) >= 10);

        if (hasDebuffTheme) {
            const debuffType = String(theme.injectDebuffType || 'weak');
            const appendPatterns = [{
                type: 'debuff',
                buffType: debuffType,
                value: Math.max(1, stage),
                intent: '🕸️咒潮侵压'
            }];
            if (typeof CARDS !== 'undefined' && CARDS.heartDemon) {
                appendPatterns.push({
                    type: 'addStatus',
                    cardId: 'heartDemon',
                    count: stage >= 3 ? 2 : 1,
                    intent: '🕳️咒潮侵染'
                });
            }
            this.applyEncounterAffixPayload(enemy, {
                id: 'hex_surge',
                tag: '咒潮',
                desc: '每轮遭遇补充压制减益并可能塞入状态牌。',
                appendPatterns
            });
            return;
        }

        if (hasFortressTheme) {
            const hasDefendPattern = enemy.patterns.some((pattern) => pattern && pattern.type === 'defend');
            const appendPatterns = [];
            if (!hasDefendPattern) {
                appendPatterns.push({
                    type: 'defend',
                    value: 10 + stage * 3,
                    intent: '🛡️战垒回护'
                });
            }
            this.applyEncounterAffixPayload(enemy, {
                id: 'aegis_spire',
                tag: '战垒',
                desc: '开场重甲并附带反制能力，适合拖入拉锯。',
                openingBlock: 6 + (stage - 1) * 3,
                thorns: stage,
                appendPatterns
            });
            return;
        }

        const attackValues = enemy.patterns
            .filter((pattern) => pattern && (pattern.type === 'attack' || pattern.type === 'multiAttack'))
            .map((pattern) => Math.max(1, Math.floor(Number(pattern.value) || 1)));
        const maxAttack = attackValues.length > 0 ? Math.max(...attackValues) : 8;
        this.applyEncounterAffixPayload(enemy, {
            id: 'storm_pursuit',
            tag: '追猎',
            desc: '增加追击段，伤害节奏更紧凑。',
            appendPatterns: [{
                type: 'multiAttack',
                value: Math.max(4, Math.floor(maxAttack * (0.38 + stage * 0.06))),
                count: Math.min(3, 1 + stage),
                intent: '⚡裂闪追猎'
            }]
        });
    }

    getPlayerPreferredArchetypeId() {
        const resonanceId = String(this.player?.archetypeResonance?.id || '');
        if (resonanceId) return resonanceId;
        if (typeof inferDeckArchetype === 'function' && Array.isArray(this.player?.deck) && this.player.deck.length > 0) {
            try {
                const inferred = inferDeckArchetype(this.player.deck);
                return typeof inferred === 'string' ? inferred : '';
            } catch (e) {
                return '';
            }
        }
        return '';
    }

    getEncounterCounterAffixPayload(stage = 1) {
        const archetypeId = this.getPlayerPreferredArchetypeId();
        if (!archetypeId) return null;
        const s = Math.max(1, Math.min(3, Math.floor(Number(stage) || 1)));

        if (archetypeId === 'stormcraft' || archetypeId === 'precision') {
            return {
                id: 'insulated_shell',
                tag: '绝缘',
                desc: '通过绝缘防护削弱破窗节奏，逼迫改用持续压制。',
                openingBlock: 5 + s * 3,
                appendPatterns: [
                    {
                        type: 'defend',
                        value: 8 + s * 3,
                        intent: '🔌绝缘护壳'
                    },
                    {
                        type: 'debuff',
                        buffType: 'weak',
                        value: 1 + (s >= 3 ? 1 : 0),
                        intent: '🔻节奏钳制'
                    }
                ]
            };
        }

        if (archetypeId === 'vitalweave' || archetypeId === 'bulwark') {
            return {
                id: 'severed_meridian',
                tag: '断脉',
                desc: '敌方断脉压制会施加禁疗，并撕开防守窗口。',
                openingBlock: 3 + s * 2,
                appendPatterns: [
                    {
                        type: 'debuff',
                        buffType: 'healing_corrupt',
                        value: 1 + (s >= 2 ? 1 : 0),
                        intent: '🩻断脉封疗'
                    },
                    {
                        type: 'debuff',
                        buffType: 'vulnerable',
                        value: 1,
                        intent: '🩸断脉裂隙'
                    }
                ]
            };
        }

        if (archetypeId === 'entropy') {
            const appendPatterns = [{
                type: 'debuff',
                buffType: 'weak',
                value: 1 + (s >= 2 ? 1 : 0),
                intent: '🧠锁念干扰'
            }];
            if (typeof CARDS !== 'undefined' && CARDS.heartDemon) {
                appendPatterns.push({
                    type: 'addStatus',
                    cardId: 'heartDemon',
                    count: s >= 3 ? 2 : 1,
                    intent: '🕳️锁念侵染'
                });
            }
            return {
                id: 'mind_lock',
                tag: '锁念',
                desc: '通过状态侵染与虚弱压制，限制弃牌节奏循环。',
                appendPatterns
            };
        }

        if (archetypeId === 'hemorrhage') {
            return {
                id: 'coagulate_grid',
                tag: '止血',
                desc: '敌方止血格栅会强化护甲与反制，延缓流血滚雪球。',
                openingBlock: 6 + s * 2,
                thorns: s,
                appendPatterns: [
                    {
                        type: 'defend',
                        value: 10 + s * 2,
                        intent: '🩸止血回护'
                    }
                ]
            };
        }

        return null;
    }

    applyEncounterAffixPayload(enemy, payload) {
        if (!enemy || !payload || typeof payload !== 'object') return;
        enemy.encounterAffixId = String(payload.id || 'encounter_affix');
        enemy.encounterAffixTag = String(payload.tag || '异象');
        enemy.encounterAffixDesc = String(payload.desc || '高阶遭遇词缀生效中。');

        const openingBlock = Math.max(0, Math.floor(Number(payload.openingBlock) || 0));
        if (openingBlock > 0) {
            enemy.block = Math.max(0, Number(enemy.block) || 0) + openingBlock;
        }

        const thorns = Math.max(0, Math.floor(Number(payload.thorns) || 0));
        if (thorns > 0) {
            if (!enemy.buffs || typeof enemy.buffs !== 'object') enemy.buffs = {};
            enemy.buffs.thorns = Math.max(0, Number(enemy.buffs.thorns) || 0) + thorns;
        }

        if (Array.isArray(payload.appendPatterns) && payload.appendPatterns.length > 0) {
            enemy.patterns.push(...payload.appendPatterns.filter((pattern) => pattern && typeof pattern === 'object').map((pattern) => ({ ...pattern })));
        }
    }

    applyEncounterThemeProfile(theme) {
        this.activeEncounterTheme = null;
        if (!theme || typeof theme !== 'object' || !Array.isArray(this.enemies)) return;

        const tierStage = (this.game && typeof this.game.registerEncounterThemeStart === 'function')
            ? this.game.registerEncounterThemeStart(theme.id)
            : 1;
        const stage = Math.max(1, Math.min(3, Math.floor(Number(tierStage) || 1)));
        const stageScale = this.getEncounterTierScale(stage);

        const attackMul = Math.max(1, Number(theme.attackMul) || 1) * (1 + (stage - 1) * 0.04);
        const openingBlock = Math.max(0, Math.floor((Number(theme.openingBlock) || 0) * stageScale));
        const playerOpeningBlock = Math.max(0, Math.floor((Number(theme.playerOpeningBlock) || 0) * (1 + (stage - 1) * 0.12)));
        const injectDebuffType = String(theme.injectDebuffType || '').trim();
        const injectDebuffValue = Math.max(0, Math.floor((Number(theme.injectDebuffValue) || 0) * stageScale));
        const realm = Math.max(1, Math.floor(Number(this.player?.realm) || 1));

        this.enemies.forEach((enemy) => {
            if (!enemy || enemy.currentHp <= 0 || enemy.isBoss || enemy.isGhost || enemy.isMinion) return;
            enemy.encounterThemeId = theme.id || 'encounter';
            enemy.encounterThemeTag = theme.shortTag || theme.name || '遭遇';
            enemy.encounterThemeDesc = theme.description || '';
            enemy.encounterThemeTier = stage;

            if (openingBlock > 0) {
                enemy.block = Math.max(0, Number(enemy.block) || 0) + openingBlock;
            }

            if (attackMul > 1 && Array.isArray(enemy.patterns)) {
                enemy.patterns.forEach((pattern) => {
                    if (!pattern || typeof pattern !== 'object') return;
                    if (pattern.type === 'attack' || pattern.type === 'multiAttack' || pattern.type === 'executeDamage') {
                        const value = Number(pattern.value);
                        if (Number.isFinite(value) && value > 0) {
                            pattern.value = Math.max(1, Math.floor(value * attackMul));
                        }
                    }
                });
            }

            if (injectDebuffType && injectDebuffValue > 0 && Array.isArray(enemy.patterns)) {
                const hasDebuffAction = enemy.patterns.some((pattern) => {
                    if (!pattern || typeof pattern !== 'object') return false;
                    return pattern.type === 'debuff' || pattern.type === 'addStatus';
                });
                if (!hasDebuffAction) {
                    enemy.patterns.push({
                        type: 'debuff',
                        buffType: injectDebuffType,
                        value: injectDebuffValue,
                        intent: theme.injectDebuffIntent || '🌀压迫咒印'
                    });
                }
            }

            if (realm >= 12) {
                this.applyEncounterSignatureAffix(enemy, theme, stage);
            }

            this.refreshEnemyTacticalPlan(enemy, true);
        });

        if (playerOpeningBlock > 0 && this.player) {
            if (typeof this.player.addBlock === 'function') {
                this.player.addBlock(playerOpeningBlock);
            } else {
                this.player.block = Math.max(0, Number(this.player.block) || 0) + playerOpeningBlock;
            }
        }

        this.activeEncounterTheme = {
            id: theme.id || 'encounter',
            name: theme.name || '未知遭遇',
            icon: theme.icon || '⚔️',
            shortTag: theme.shortTag || theme.name || '遭遇',
            description: theme.description || '',
            tier: theme.tier || 'early',
            nodeType: theme.nodeType || 'enemy',
            tierStage: stage,
            attackMul,
            openingBlock,
            playerOpeningBlock
        };
        Utils.showBattleLog(`【遭遇·${this.activeEncounterTheme.name} ${'I'.repeat(stage)}阶】${this.activeEncounterTheme.description}`);
        this.markUIDirty('environment', 'enemies', 'player');
    }

    consumeEncounterVictoryBonusSummary() {
        if (this.encounterRewardConsumed) return null;
        const theme = this.activeEncounterTheme;
        if (!theme || typeof theme !== 'object') return null;

        const stage = Math.max(1, Math.min(3, Math.floor(Number(theme.tierStage) || 1)));
        const nodeType = String(theme.nodeType || 'enemy');
        let baseGold = 14;
        let baseExp = 6;
        if (nodeType === 'elite') {
            baseGold = 26;
            baseExp = 10;
        } else if (nodeType === 'trial') {
            baseGold = 36;
            baseExp = 14;
        }

        const stageScale = this.getEncounterTierScale(stage);
        let goldBonus = Math.max(0, Math.floor(baseGold * stageScale));
        let ringExpBonus = Math.max(0, Math.floor(baseExp * stageScale));
        if (Number(theme.openingBlock || 0) >= 10) {
            goldBonus += 4 * stage;
        }
        if (Number(theme.attackMul || 1) >= 1.08) {
            ringExpBonus += 3 * stage;
        }

        const adventureBuffRewards = [];
        if (theme.injectDebuffType) {
            adventureBuffRewards.push({
                id: 'openingBlockBoostBattles',
                charges: 1,
                label: '开场护盾'
            });
        }
        if (stage >= 2) {
            adventureBuffRewards.push({
                id: 'ringExpBoostBattles',
                charges: 1,
                label: '命环经验'
            });
        }

        const result = {
            themeId: theme.id || 'encounter',
            themeName: theme.name || '未知遭遇',
            tierStage: stage,
            nodeType,
            goldBonus,
            ringExpBonus,
            adventureBuffRewards
        };
        this.encounterRewardConsumed = true;
        return result;
    }

    consumeSquadEcologyVictoryBonusSummary() {
        if (this.squadRewardConsumed) return null;
        const squad = this.activeSquadEcology;
        if (!squad || typeof squad !== 'object' || !squad.id) return null;

        const nodeType = String(this.game?.currentBattleNode?.type || 'enemy');
        const enemyCount = Math.max(1, Math.floor(Number(squad.count) || 1));
        const rewardMap = {
            squad_pincer_hunt: {
                gold: 12,
                exp: 6,
                buffs: [{ id: 'firstTurnEnergyBoostBattles', charges: 1, label: '首回合灵力' }]
            },
            squad_bulwark_web: {
                gold: 10,
                exp: 8,
                buffs: [{ id: 'openingBlockBoostBattles', charges: 1, label: '开场护盾' }]
            },
            squad_hex_weave: {
                gold: 9,
                exp: 10,
                buffs: [{ id: 'ringExpBoostBattles', charges: 1, label: '命环经验' }]
            },
            squad_relay_cascade: {
                gold: 11,
                exp: 7,
                buffs: [{ id: 'firstTurnDrawBoostBattles', charges: 1, label: '首回合抽牌' }]
            }
        };
        const pack = rewardMap[squad.id] || {
            gold: 8,
            exp: 6,
            buffs: [{ id: 'firstTurnDrawBoostBattles', charges: 1, label: '首回合抽牌' }]
        };

        const nodeGoldMul = nodeType === 'elite' ? 1.35 : nodeType === 'trial' ? 1.5 : 1;
        const nodeExpMul = nodeType === 'elite' ? 1.25 : nodeType === 'trial' ? 1.4 : 1;
        let goldBonus = Math.max(0, Math.floor((pack.gold + Math.max(0, enemyCount - 2) * 2) * nodeGoldMul));
        let ringExpBonus = Math.max(0, Math.floor((pack.exp + Math.max(0, enemyCount - 2)) * nodeExpMul));
        const adventureBuffRewards = Array.isArray(pack.buffs)
            ? pack.buffs.map((item) => ({ ...item }))
            : [];

        let synergy = null;
        if (
            this.game &&
            typeof this.game.isEndlessActive === 'function' &&
            this.game.isEndlessActive() &&
            typeof this.game.getEndlessCycleThemeProfile === 'function'
        ) {
            const theme = this.game.getEndlessCycleThemeProfile();
            const directive = String(theme?.enemyDirective || 'balanced');
            const synergyMap = {
                forge: 'squad_pincer_hunt',
                swarm: 'squad_relay_cascade',
                counter: 'squad_hex_weave',
                frenzy: 'squad_pincer_hunt',
                bastion: 'squad_bulwark_web'
            };
            if (synergyMap[directive] && synergyMap[directive] === squad.id) {
                synergy = {
                    themeId: String(theme?.id || ''),
                    themeName: String(theme?.name || '轮段协同'),
                    directive
                };
                goldBonus += Math.max(4, Math.floor(goldBonus * 0.2));
                ringExpBonus += Math.max(3, Math.floor(ringExpBonus * 0.2));
                if (adventureBuffRewards.length > 0) {
                    adventureBuffRewards[0].charges = Math.min(3, Math.max(1, Math.floor(Number(adventureBuffRewards[0].charges) || 1) + 1));
                }
            }
        }

        const result = {
            squadId: squad.id,
            squadName: squad.name || squad.tag || '敌阵协同',
            squadTag: squad.tag || '',
            squadDesc: squad.desc || '',
            nodeType,
            enemyCount,
            goldBonus,
            ringExpBonus,
            adventureBuffRewards,
            synergy
        };
        this.squadRewardConsumed = true;
        return result;
    }

    createDefaultBattleCommandState() {
        return {
            enabled: false,
            initialized: false,
            points: 0,
            maxPoints: 12,
            turnCommandsUsed: 0,
            totalCommandsUsed: 0,
            totalPointsGained: 0,
            totalPointsSpent: 0,
            lastCommandId: '',
            lastResonanceMatrixMode: 'auto',
            firstCommandDiscountUsed: false,
            commands: []
        };
    }

    getBattleCommandCatalog() {
        const baseCatalog = [
            {
                id: 'assault_order',
                icon: '⚔️',
                name: '锋矢强袭',
                cost: 4,
                cooldown: 2,
                desc: '对全体敌人造成伤害并施加易伤。'
            },
            {
                id: 'bulwark_order',
                icon: '🛡️',
                name: '玄甲整阵',
                cost: 3,
                cooldown: 2,
                desc: '获得大量护盾并净化减益。'
            },
            {
                id: 'tempo_order',
                icon: '⚡',
                name: '疾策回转',
                cost: 5,
                cooldown: 3,
                desc: '抽牌回能并强化下一次攻击。'
            },
            {
                id: 'suppress_order',
                icon: '🌀',
                name: '压制领域',
                cost: 4,
                cooldown: 2,
                desc: '削减敌方护盾并附加虚弱。'
            },
            {
                id: 'hunt_order',
                icon: '🎯',
                name: '猎杀标记',
                cost: 5,
                cooldown: 3,
                desc: '锁定高威胁目标并叠加破绽。'
            }
        ];
        if (this.game && typeof this.game.isEndlessActive === 'function' && this.game.isEndlessActive()) {
            baseCatalog.push({
                id: 'rift_surge_order',
                icon: '🜂',
                name: '裂隙潮汐',
                cost: 5,
                cooldown: 3,
                desc: '无尽专属：按压力对全体造成伤害，回收少量指令槽并在高压力时稳压。'
            });
            baseCatalog.push({
                id: 'phase_anchor_order',
                icon: '🜁',
                name: '相位锚定',
                cost: 4,
                cooldown: 3,
                desc: '无尽专属：获得护盾并净化，高压时可稳压但会暴露破绽。'
            });
            baseCatalog.push({
                id: 'void_pursuit_order',
                icon: '🜃',
                name: '裂界追猎',
                cost: 6,
                cooldown: 4,
                desc: '无尽专属：猎杀高血目标并扩散余震，超高压下可强制稳压但需支付生命代价。'
            });
            baseCatalog.push({
                id: 'horizon_barter_order',
                icon: '🜄',
                name: '界隙交易',
                cost: 4,
                cooldown: 2,
                desc: '无尽专属：消耗奶糖换取抽牌、回能与斩击，资源不足会引发压力反噬。'
            });
            baseCatalog.push({
                id: 'resonance_matrix_order',
                icon: '🜇',
                name: '命环共振',
                cost: 5,
                cooldown: 3,
                desc: '无尽专属：根据敌方威胁自适应切换战术回路（守势/破阵/净域/歼灭）。'
            });
        }
        return baseCatalog;
    }

    resolveBattleCommandLoadout() {
        const catalog = this.getBattleCommandCatalog();
        if (!Array.isArray(catalog) || catalog.length === 0) return [];
        const endlessActive = this.game && typeof this.game.isEndlessActive === 'function' && this.game.isEndlessActive();

        const node = this.game && this.game.currentBattleNode ? this.game.currentBattleNode : null;
        const idSource = (Array.isArray(this.enemies) ? this.enemies : [])
            .map((enemy) => String(enemy && (enemy.id || enemy.name) || 'enemy'))
            .join('|');
        const seedSource = [
            this.player && this.player.realm ? this.player.realm : 1,
            node ? node.id : 0,
            node ? node.type : 'battle',
            idSource
        ].join(':');

        let seed = 0;
        for (let i = 0; i < seedSource.length; i += 1) {
            seed = (seed * 37 + seedSource.charCodeAt(i)) % 2147483647;
        }

        const pool = catalog.map((item) => ({ ...item }));
        const loadout = [];
        const maxCommands = Math.min(endlessActive ? 4 : 3, pool.length);

        if (endlessActive) {
            const forcedEndlessIds = ['rift_surge_order'];
            forcedEndlessIds.forEach((id) => {
                const endlessIndex = pool.findIndex((item) => item && item.id === id);
                if (endlessIndex >= 0 && loadout.length < maxCommands) {
                    loadout.push(pool[endlessIndex]);
                    pool.splice(endlessIndex, 1);
                }
            });

            const extraEndlessPool = pool.filter((item) => item && (
                item.id === 'phase_anchor_order'
                || item.id === 'void_pursuit_order'
                || item.id === 'horizon_barter_order'
                || item.id === 'resonance_matrix_order'
            ));
            if (extraEndlessPool.length > 0 && loadout.length < maxCommands) {
                const extraIndex = seed % extraEndlessPool.length;
                const picked = extraEndlessPool[extraIndex];
                loadout.push(picked);
                const rawIndex = pool.findIndex((item) => item && item.id === picked.id);
                if (rawIndex >= 0) pool.splice(rawIndex, 1);
                seed = (seed * 1103515245 + 12345) % 2147483647;
            }
        }
        while (pool.length > 0 && loadout.length < maxCommands) {
            const index = seed % pool.length;
            loadout.push(pool[index]);
            pool.splice(index, 1);
            seed = (seed * 1103515245 + 12345) % 2147483647;
        }

        return loadout.map((command) => ({
            ...command,
            cost: Math.max(1, Math.floor(Number(command.cost) || 1)),
            cooldown: Math.max(0, Math.floor(Number(command.cooldown) || 0)),
            cooldownRemaining: 0,
            uses: 0
        }));
    }

    getBattleCommandPowerScale(command = null) {
        const realm = Math.max(1, Math.floor(Number(this.player && this.player.realm) || 1));
        const realmBonus = Math.min(0.48, Math.floor((realm - 1) / 3) * 0.06);
        const encounterStage = this.activeEncounterTheme
            ? Math.max(1, Math.min(3, Math.floor(Number(this.activeEncounterTheme.tierStage) || 1)))
            : 1;
        const encounterBonus = (encounterStage - 1) * 0.05;
        const path = String(this.player?.fateRing?.path || '');
        const doctrineProfile = this.getPathDoctrineProfile(path);
        const resonanceId = String(this.player?.archetypeResonance?.id || '');
        const hpRatio = Number(this.player?.maxHp) > 0
            ? (Number(this.player?.currentHp) || 0) / Number(this.player.maxHp)
            : 1;
        let synergyBonus = 0;

        if (path === 'destruction' || path === 'defiance') synergyBonus += 0.08;
        if (path === 'convergence' && command && String(command.id) === 'hunt_order') synergyBonus += 0.06;
        if (path === 'resonance' && command && String(command.id) === 'tempo_order') synergyBonus += 0.06;
        if (path === 'insight' && hpRatio <= 0.5) synergyBonus += 0.05;
        if (path === 'destruction' && doctrineProfile.tier > 0 && Math.max(0, Math.floor(Number(this.player?.block) || 0)) <= 5) {
            synergyBonus += 0.02 + doctrineProfile.tier * 0.02;
        }
        if (path === 'convergence' && doctrineProfile.tier > 0 && command && String(command.id) === 'hunt_order') {
            synergyBonus += doctrineProfile.tier * 0.02;
        }
        if (path === 'resonance' && doctrineProfile.tier > 0 && command && String(command.id) === 'tempo_order') {
            synergyBonus += doctrineProfile.tier * 0.02;
        }

        if (resonanceId === 'precision' && command && String(command.id) === 'hunt_order') synergyBonus += 0.05;
        if (resonanceId === 'bulwark' && command && String(command.id) === 'bulwark_order') synergyBonus += 0.05;
        if (resonanceId === 'entropy' && command && String(command.id) === 'tempo_order') synergyBonus += 0.05;

        const treasureCount = Array.isArray(this.player?.equippedTreasures)
            ? this.player.equippedTreasures.length
            : (Array.isArray(this.player?.treasures) ? this.player.treasures.length : 0);
        if (treasureCount >= 4) synergyBonus += 0.04;

        const pressure = this.getBattleCommandEndlessPressure();
        if (pressure >= 6) synergyBonus += 0.04;
        if (pressure >= 8) synergyBonus += 0.04;

        return 1 + realmBonus + encounterBonus + synergyBonus;
    }

    getBattleCommandEndlessPressure() {
        if (!this.game || typeof this.game.isEndlessActive !== 'function' || !this.game.isEndlessActive()) return 0;
        if (typeof this.game.ensureEndlessState !== 'function') return 0;
        const state = this.game.ensureEndlessState();
        return Math.max(0, Math.min(9, Math.floor(Number(state?.pressure) || 0)));
    }

    getPathDoctrineProfile(pathId = null) {
        if (this.player && typeof this.player.getPathDoctrineProfile === 'function') {
            return this.player.getPathDoctrineProfile(pathId);
        }
        return {
            path: String(pathId || this.player?.fateRing?.path || ''),
            tier: 0,
            commandCostDiscount: 0,
            commandGainBonus: 0,
            lowBlockDamageBonus: 0
        };
    }

    resolveBattleCommandEffectiveCost(command) {
        if (!command || typeof command !== 'object') return 0;
        const baseCost = Math.max(1, Math.floor(Number(command.cost) || 1));
        const path = String(this.player?.fateRing?.path || '');
        const doctrineProfile = this.getPathDoctrineProfile(path);
        const hpRatio = Number(this.player?.maxHp) > 0
            ? (Number(this.player?.currentHp) || 0) / Number(this.player.maxHp)
            : 1;
        let discount = 0;

        if (path === 'wisdom' && (command.id === 'tempo_order' || command.id === 'suppress_order')) {
            discount += 1;
            discount += Math.max(0, Math.floor(Number(doctrineProfile.commandCostDiscount) || 0));
        }
        if (path === 'convergence' && command.id === 'hunt_order') {
            discount += Math.max(0, Math.floor(Number(doctrineProfile.commandCostDiscount) || 0));
        }
        if (
            path === 'destruction' &&
            Math.max(0, Math.floor(Number(this.player?.block) || 0)) <= 5
        ) {
            discount += Math.max(0, Math.floor(Number(doctrineProfile.commandCostDiscount) || 0));
        }
        if (path === 'defiance' && hpRatio <= 0.5) {
            discount += 1;
        }
        if (this.commandState && !this.commandState.firstCommandDiscountUsed) {
            const treasureCount = Array.isArray(this.player?.equippedTreasures)
                ? this.player.equippedTreasures.length
                : (Array.isArray(this.player?.treasures) ? this.player.treasures.length : 0);
            if (treasureCount >= 3) discount += 1;
        }
        if (this.getBattleCommandEndlessPressure() >= 8) {
            discount += 1;
        }

        return Math.max(1, baseCost - discount);
    }

    getBattleCommandById(commandId) {
        if (!this.commandState || !Array.isArray(this.commandState.commands)) return null;
        return this.commandState.commands.find((command) => command && command.id === commandId) || null;
    }

    initializeBattleCommandSystem() {
        this.commandState = this.createDefaultBattleCommandState();
        const mode = String(this.game && this.game.mode || 'pve');
        if (mode === 'pvp') {
            this.markUIDirty('command');
            return;
        }

        const loadout = this.resolveBattleCommandLoadout();
        if (!Array.isArray(loadout) || loadout.length === 0) {
            this.markUIDirty('command');
            return;
        }

        this.commandState.enabled = true;
        this.commandState.initialized = true;
        const path = String(this.player?.fateRing?.path || '');
        const pressure = this.getBattleCommandEndlessPressure();
        const baseCap = pressure >= 6 ? 14 : 12;
        this.commandState.maxPoints = baseCap + (path === 'insight' ? 1 : 0);
        this.commandState.points = Math.min(this.commandState.maxPoints, 3 + (pressure >= 8 ? 1 : 0));
        this.commandState.commands = loadout;
        this.commandState.turnCommandsUsed = 0;
        this.commandState.totalCommandsUsed = 0;
        this.commandState.totalPointsGained = this.commandState.points;
        this.commandState.totalPointsSpent = 0;
        this.commandState.lastCommandId = '';
        this.commandState.lastResonanceMatrixMode = 'auto';
        this.commandState.firstCommandDiscountUsed = false;

        this.on('cardPlayed', (payload) => {
            const card = payload && payload.card ? payload.card : null;
            if (!card) return;
            const path = String(this.player?.fateRing?.path || '');
            const doctrineProfile = this.getPathDoctrineProfile(path);
            const archetype = String(this.player?.archetypeResonance?.id || '');

            let gain = 1;
            if (card.type === 'attack') gain += 1;
            if (card.consumeCandy) gain += 1;
            if (path === 'convergence' && card.type === 'attack') {
                gain += 1 + Math.max(0, Math.floor(Number(doctrineProfile.commandGainBonus) || 0));
            }
            if (path === 'resonance' && card.type === 'skill') {
                gain += 1 + Math.max(0, Math.floor(Number(doctrineProfile.commandGainBonus) || 0));
            }
            if (archetype === 'entropy' && card.type === 'skill') gain += 1;
            if (archetype === 'bulwark' && card.type === 'defend') gain += 1;
            if (this.cardsPlayedThisTurn >= 4) gain += 1;
            this.gainBattleCommandPoints(gain, 'card');
        });

        this.markUIDirty('command');
    }

    gainBattleCommandPoints(amount, source = 'generic') {
        if (!this.commandState || !this.commandState.enabled) return 0;
        const gain = Math.max(0, Math.floor(Number(amount) || 0));
        if (gain <= 0) return 0;

        const state = this.commandState;
        const before = Math.max(0, Math.floor(Number(state.points) || 0));
        const cap = Math.max(1, Math.floor(Number(state.maxPoints) || 12));
        const after = Math.min(cap, before + gain);
        const gained = Math.max(0, after - before);
        if (gained <= 0) return 0;

        state.points = after;
        state.totalPointsGained = Math.max(0, Math.floor(Number(state.totalPointsGained) || 0)) + gained;

        if (source === 'kill') {
            Utils.showBattleLog(`战场指令槽 +${gained}（斩敌充能）`);
        } else if (source === 'turnStart') {
            Utils.showBattleLog(`战场指令槽 +${gained}（回合整备）`);
        } else if (after === cap) {
            Utils.showBattleLog('战场指令槽已充满！');
        }

        this.markUIDirty('command');
        return gained;
    }

    onBattleCommandTurnStart() {
        if (!this.commandState || !this.commandState.enabled) return;
        const state = this.commandState;
        state.turnCommandsUsed = 0;
        if (Array.isArray(state.commands)) {
            state.commands.forEach((command) => {
                if (!command) return;
                command.cooldownRemaining = Math.max(0, Math.floor(Number(command.cooldownRemaining) || 0) - 1);
            });
        }

        let baseGain = 1;
        const hpRatio = this.player && Number(this.player.maxHp) > 0
            ? (Number(this.player.currentHp) || 0) / Number(this.player.maxHp)
            : 1;
        if (hpRatio <= 0.45) baseGain += 1;
        if (this.activeEncounterTheme && Number(this.activeEncounterTheme.tierStage || 1) >= 3) {
            baseGain += 1;
        }
        const pressure = this.getBattleCommandEndlessPressure();
        if (pressure >= 5) baseGain += 1;
        this.gainBattleCommandPoints(baseGain, 'turnStart');
    }

    onBattleCommandEnemyKilled(enemy) {
        if (!this.commandState || !this.commandState.enabled) return;
        const bonus = enemy && enemy.isBoss ? 4 : 2;
        this.gainBattleCommandPoints(bonus, 'kill');
    }

    async activateBattleCommand(commandId) {
        if (!this.commandState || !this.commandState.enabled) return false;
        if (this.currentTurn !== 'player' || this.battleEnded || this.isTurnTransitioning || this.isProcessingCard) {
            Utils.showBattleLog('当前无法发动战场指令');
            return false;
        }
        const command = this.getBattleCommandById(commandId);
        if (!command) return false;

        const cost = this.resolveBattleCommandEffectiveCost(command);
        const cooldownRemaining = Math.max(0, Math.floor(Number(command.cooldownRemaining) || 0));
        if (cooldownRemaining > 0) {
            Utils.showBattleLog(`【${command.name}】冷却中 (${cooldownRemaining} 回合)`);
            return false;
        }
        if ((this.commandState.points || 0) < cost) {
            Utils.showBattleLog(`指令槽不足，发动【${command.name}】需要 ${cost}`);
            return false;
        }

        const prevFirstDiscountUsed = !!this.commandState.firstCommandDiscountUsed;
        this.commandState.points -= cost;
        this.commandState.totalPointsSpent = Math.max(0, Math.floor(Number(this.commandState.totalPointsSpent) || 0)) + cost;
        this.commandState.totalCommandsUsed = Math.max(0, Math.floor(Number(this.commandState.totalCommandsUsed) || 0)) + 1;
        this.commandState.turnCommandsUsed = Math.max(0, Math.floor(Number(this.commandState.turnCommandsUsed) || 0)) + 1;
        this.commandState.lastCommandId = command.id;
        if (!this.commandState.firstCommandDiscountUsed) {
            this.commandState.firstCommandDiscountUsed = true;
        }
        command.uses = Math.max(0, Math.floor(Number(command.uses) || 0)) + 1;
        let effectiveCooldown = Math.max(0, Math.floor(Number(command.cooldown) || 0));
        if (String(this.player?.fateRing?.path || '') === 'resonance') {
            effectiveCooldown = Math.max(0, effectiveCooldown - 1);
        }
        command.cooldownRemaining = effectiveCooldown;

        Utils.showBattleLog(`【战场指令】${command.icon} ${command.name} 发动！`);
        const ok = await this.executeBattleCommandEffect(command);
        if (!ok) {
            // 保底回退，防止未知错误吞资源
            this.commandState.points = Math.min(
                Math.max(1, Math.floor(Number(this.commandState.maxPoints) || 12)),
                this.commandState.points + cost
            );
            command.cooldownRemaining = 0;
            command.uses = Math.max(0, command.uses - 1);
            this.commandState.totalCommandsUsed = Math.max(0, this.commandState.totalCommandsUsed - 1);
            this.commandState.turnCommandsUsed = Math.max(0, this.commandState.turnCommandsUsed - 1);
            this.commandState.totalPointsSpent = Math.max(0, this.commandState.totalPointsSpent - cost);
            this.commandState.firstCommandDiscountUsed = prevFirstDiscountUsed;
            Utils.showBattleLog('战场指令未生效，已返还指令槽');
        }

        this.markUIDirty('command', 'player', 'enemies', 'hand', 'energy', 'piles');
        this.updateBattleUI();
        return ok;
    }

    cleansePlayerDebuffs(limit = 2) {
        if (!this.player || !this.player.buffs || typeof this.player.buffs !== 'object') return 0;
        const order = ['vulnerable', 'weak', 'burn', 'poison', 'bleed', 'freeze', 'paralysis'];
        let cleaned = 0;
        const maxClean = Math.max(0, Math.floor(Number(limit) || 0));
        for (let i = 0; i < order.length; i += 1) {
            if (cleaned >= maxClean) break;
            const key = order[i];
            const stack = Math.max(0, Math.floor(Number(this.player.buffs[key]) || 0));
            if (stack <= 0) continue;
            this.player.buffs[key] = Math.max(0, stack - 1);
            if (this.player.buffs[key] <= 0) delete this.player.buffs[key];
            cleaned += 1;
        }
        return cleaned;
    }

    getHorizonBarterModeProfiles() {
        return {
            conservative: {
                id: 'conservative',
                label: '保守交易',
                desc: '低投入，稳定续航，优先过牌与控压。',
                spendCap: 1,
                drawBonus: 1,
                energyBonus: 0,
                damageMul: 0.86,
                stabilizeNeed: 1,
                backlash: 0
            },
            balanced: {
                id: 'balanced',
                label: '均衡交易',
                desc: '均衡收益，攻防两端都可接受。',
                spendCap: 2,
                drawBonus: 0,
                energyBonus: 0,
                damageMul: 1,
                stabilizeNeed: 2,
                backlash: 1
            },
            aggressive: {
                id: 'aggressive',
                label: '激进交易',
                desc: '高投入高爆发，空转会引发更强反噬。',
                spendCap: 3,
                drawBonus: 0,
                energyBonus: 1,
                damageMul: 1.2,
                stabilizeNeed: 2,
                backlash: 2
            }
        };
    }

    getHorizonBarterModeProfile(modeId = 'balanced') {
        const profiles = this.getHorizonBarterModeProfiles();
        const key = String(modeId || 'balanced');
        return profiles[key] || profiles.balanced;
    }

    async resolveHorizonBarterMode(command = null) {
        if (command && typeof command.mode === 'string') {
            return this.getHorizonBarterModeProfile(command.mode);
        }
        if (typeof navigator !== 'undefined' && navigator && navigator.webdriver) {
            return this.getHorizonBarterModeProfile('balanced');
        }
        if (typeof document === 'undefined' || !document.body || typeof document.createElement !== 'function') {
            return this.getHorizonBarterModeProfile('balanced');
        }

        const modalId = 'horizon-barter-modal';
        const oldModal = document.getElementById(modalId);
        if (oldModal && oldModal.parentElement) oldModal.parentElement.removeChild(oldModal);
        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal';
        modal.style.zIndex = '10040';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 440px; text-align: center; padding: 24px;">
                <h2 style="margin-bottom: 10px;">界隙交易</h2>
                <p style="opacity: .85; margin-bottom: 14px;">选择本次交易档位</p>
                <div id="horizon-barter-choices" style="display: flex; flex-direction: column; gap: 8px;"></div>
                <button id="horizon-barter-cancel" class="event-choice" style="margin-top: 10px;">
                    <div>取消交易</div>
                    <div class="choice-effect">不发动本次指令</div>
                </button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.classList.add('active');

        const choicesEl = modal.querySelector('#horizon-barter-choices');
        const profiles = this.getHorizonBarterModeProfiles();
        const profileList = [profiles.conservative, profiles.balanced, profiles.aggressive];

        return new Promise((resolve) => {
            const finalize = (result) => {
                modal.classList.remove('active');
                if (modal.parentElement) modal.parentElement.removeChild(modal);
                resolve(result);
            };

            if (!choicesEl) {
                finalize(this.getHorizonBarterModeProfile('balanced'));
                return;
            }

            profileList.forEach((profile) => {
                const btn = document.createElement('button');
                btn.className = 'event-choice';
                btn.innerHTML = `
                    <div>${profile.label}</div>
                    <div class="choice-effect">${profile.desc}</div>
                `;
                btn.onclick = () => finalize(profile);
                choicesEl.appendChild(btn);
            });

            const cancelBtn = modal.querySelector('#horizon-barter-cancel');
            if (cancelBtn) cancelBtn.onclick = () => finalize(null);
        });
    }

    getResonanceMatrixModeProfiles() {
        return {
            auto: {
                id: 'auto',
                label: '自适应回路',
                desc: '根据敌我态势自动选择守势/破阵/净域/歼灭。',
                forceBranch: 'auto'
            },
            guard: {
                id: 'guard',
                label: '守势优先',
                desc: '强制优先触发守势回路，稳住血线与减益。',
                forceBranch: 'guard'
            },
            break: {
                id: 'break',
                label: '破阵优先',
                desc: '强制优先触发破阵回路，先拆盾再开口。',
                forceBranch: 'break'
            },
            cleanse: {
                id: 'cleanse',
                label: '净域优先',
                desc: '强制优先触发净域回路，优先解控与稳压。',
                forceBranch: 'cleanse'
            },
            burst: {
                id: 'burst',
                label: '歼灭优先',
                desc: '强制优先触发歼灭回路，抢节奏打爆发。',
                forceBranch: 'burst'
            }
        };
    }

    getResonanceMatrixModeProfile(modeId = 'auto') {
        const profiles = this.getResonanceMatrixModeProfiles();
        const key = String(modeId || 'auto');
        return profiles[key] || profiles.auto;
    }

    consumeResonanceMatrixSignalMode() {
        if (!this.player || !this.player.buffs || typeof this.player.buffs !== 'object') return null;
        const signalOrder = [
            { buff: 'matrixGuardSignal', mode: 'guard' },
            { buff: 'matrixBreakSignal', mode: 'break' },
            { buff: 'matrixCleanseSignal', mode: 'cleanse' },
            { buff: 'matrixBurstSignal', mode: 'burst' }
        ];
        for (let i = 0; i < signalOrder.length; i += 1) {
            const signal = signalOrder[i];
            const stack = Math.max(0, Math.floor(Number(this.player.buffs[signal.buff]) || 0));
            if (stack <= 0) continue;
            const next = stack - 1;
            if (next <= 0) {
                delete this.player.buffs[signal.buff];
            } else {
                this.player.buffs[signal.buff] = next;
            }
            return this.getResonanceMatrixModeProfile(signal.mode);
        }
        return null;
    }

    resolvePendingResonanceMatrixSignalMode() {
        if (!this.player || !this.player.buffs || typeof this.player.buffs !== 'object') return 'auto';
        const signalOrder = [
            { buff: 'matrixGuardSignal', mode: 'guard' },
            { buff: 'matrixBreakSignal', mode: 'break' },
            { buff: 'matrixCleanseSignal', mode: 'cleanse' },
            { buff: 'matrixBurstSignal', mode: 'burst' }
        ];
        for (let i = 0; i < signalOrder.length; i += 1) {
            const signal = signalOrder[i];
            const stack = Math.max(0, Math.floor(Number(this.player.buffs[signal.buff]) || 0));
            if (stack > 0) return signal.mode;
        }
        return 'auto';
    }

    setResonanceMatrixSignalMode(modeId = 'auto', options = {}) {
        if (!this.player) return 'auto';
        if (!this.player.buffs || typeof this.player.buffs !== 'object') {
            this.player.buffs = {};
        }
        const mode = String(modeId || 'auto');
        const modeToBuff = {
            guard: 'matrixGuardSignal',
            break: 'matrixBreakSignal',
            cleanse: 'matrixCleanseSignal',
            burst: 'matrixBurstSignal'
        };
        Object.values(modeToBuff).forEach((buffKey) => {
            if (this.player.buffs[buffKey] !== undefined) {
                delete this.player.buffs[buffKey];
            }
        });

        const normalizedMode = modeToBuff[mode] ? mode : 'auto';
        if (modeToBuff[normalizedMode]) {
            this.player.buffs[modeToBuff[normalizedMode]] = 1;
        }
        const silent = !!(options && options.silent);
        if (!silent) {
            const profile = this.getResonanceMatrixModeProfile(normalizedMode);
            if (normalizedMode === 'auto') {
                Utils.showBattleLog('战术助手：命环共振改为自适应模式');
            } else {
                Utils.showBattleLog(`战术助手：已预设命环回路为「${profile.label}」`);
            }
        }
        this.markUIDirty('command');
        this.updateBattleUI();
        return normalizedMode;
    }

    handleTacticalAdvisorHotkey(rawKey = '') {
        const key = String(rawKey || '').trim().toLowerCase();
        if (key === 'h') {
            this.toggleTacticalAdvisor();
            return true;
        }
        const modeByKey = {
            '1': 'auto',
            '2': 'guard',
            '3': 'break',
            '4': 'cleanse',
            '5': 'burst'
        };
        const modeId = modeByKey[key];
        if (!modeId) return false;
        const state = this.commandState || this.createDefaultBattleCommandState();
        const hasMatrixCommand = Array.isArray(state.commands)
            && state.commands.some((command) => command && command.id === 'resonance_matrix_order');
        if (!state.enabled || !hasMatrixCommand) return false;
        this.setResonanceMatrixSignalMode(modeId);
        return true;
    }

    async resolveResonanceMatrixMode(command = null, threatProfile = null) {
        if (command && typeof command.strategy === 'string') {
            return this.getResonanceMatrixModeProfile(command.strategy);
        }
        if (command && typeof command.mode === 'string') {
            return this.getResonanceMatrixModeProfile(command.mode);
        }

        const signalMode = this.consumeResonanceMatrixSignalMode();
        if (signalMode) return signalMode;

        if (typeof navigator !== 'undefined' && navigator && navigator.webdriver) {
            return this.getResonanceMatrixModeProfile('auto');
        }
        if (typeof document === 'undefined' || !document.body || typeof document.createElement !== 'function') {
            return this.getResonanceMatrixModeProfile('auto');
        }

        const profile = threatProfile && typeof threatProfile === 'object'
            ? threatProfile
            : this.resolveCounterplayThreatProfile();
        const recommendId = profile.needDefend
            ? 'guard'
            : (profile.needBreak ? 'break' : (profile.needCleanse ? 'cleanse' : 'burst'));
        const recommend = this.getResonanceMatrixModeProfile(recommendId);

        const modalId = 'resonance-matrix-modal';
        const oldModal = document.getElementById(modalId);
        if (oldModal && oldModal.parentElement) oldModal.parentElement.removeChild(oldModal);
        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal';
        modal.style.zIndex = '10042';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 460px; text-align: center; padding: 24px;">
                <h2 style="margin-bottom: 10px;">命环共振</h2>
                <p style="opacity: .85; margin-bottom: 6px;">选择本次回路策略</p>
                <p style="opacity: .7; margin-bottom: 14px;">战术建议：${recommend.label}</p>
                <div id="resonance-matrix-choices" style="display: flex; flex-direction: column; gap: 8px;"></div>
                <button id="resonance-matrix-cancel" class="event-choice" style="margin-top: 10px;">
                    <div>取消指令</div>
                    <div class="choice-effect">不发动本次命环共振</div>
                </button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.classList.add('active');

        const choicesEl = modal.querySelector('#resonance-matrix-choices');
        const profiles = this.getResonanceMatrixModeProfiles();
        const profileList = [profiles.auto, profiles.guard, profiles.break, profiles.cleanse, profiles.burst];
        return new Promise((resolve) => {
            const finalize = (result) => {
                modal.classList.remove('active');
                if (modal.parentElement) modal.parentElement.removeChild(modal);
                resolve(result);
            };
            if (!choicesEl) {
                finalize(this.getResonanceMatrixModeProfile('auto'));
                return;
            }
            profileList.forEach((item) => {
                const btn = document.createElement('button');
                btn.className = 'event-choice';
                btn.innerHTML = `
                    <div>${item.label}</div>
                    <div class="choice-effect">${item.desc}</div>
                `;
                btn.onclick = () => finalize(item);
                choicesEl.appendChild(btn);
            });
            const cancelBtn = modal.querySelector('#resonance-matrix-cancel');
            if (cancelBtn) cancelBtn.onclick = () => finalize(null);
        });
    }

    resolveCommandRefundAfterCounter(baseRefund = 0, antiRefund = 0) {
        const refund = Math.max(0, Math.floor(Number(baseRefund) || 0));
        const anti = Math.max(0, Math.floor(Number(antiRefund) || 0));
        return Math.max(0, refund - anti);
    }

    resolveBurstDamageAfterCounter(baseDamage = 0, antiBurst = 0, floor = 1) {
        const damage = Math.max(0, Math.floor(Number(baseDamage) || 0));
        const anti = Math.max(0, Math.floor(Number(antiBurst) || 0));
        if (anti <= 0) return damage;
        const ratio = Math.max(0.55, 1 - anti * 0.16);
        return Math.max(Math.max(0, Math.floor(Number(floor) || 0)), Math.floor(damage * ratio));
    }

    async executeBattleCommandEffect(command) {
        if (!command || !command.id) return false;
        const scale = this.getBattleCommandPowerScale(command);

        if (command.id === 'assault_order') {
            const aliveEnemies = this.enemies.filter((enemy) => enemy && enemy.currentHp > 0);
            if (aliveEnemies.length === 0) return false;

            const baseDamage = Math.max(6, Math.floor((7 + this.turnNumber * 1.2 + (this.player.realm || 1) * 0.55) * scale));
            let totalDamage = 0;
            for (let i = 0; i < this.enemies.length; i += 1) {
                const enemy = this.enemies[i];
                if (!enemy || enemy.currentHp <= 0) continue;
                enemy.buffs = enemy.buffs || {};
                enemy.buffs.vulnerable = (enemy.buffs.vulnerable || 0) + 1;
                const bonus = (enemy.block || 0) > 0 ? 3 : 0;
                const damage = this.dealDamageToEnemy(enemy, baseDamage + bonus, 'metal');
                totalDamage += Math.max(0, damage);
                const enemyEl = document.querySelector(`.enemy[data-index="${i}"]`);
                if (enemyEl) {
                    Utils.addShakeEffect(enemyEl, damage >= 18 ? 'heavy' : 'medium');
                    Utils.showFloatingNumber(enemyEl, damage, 'damage');
                }
            }
            Utils.showBattleLog(`锋矢强袭命中全体，累计造成 ${totalDamage} 伤害并施加易伤`);
            await Utils.sleep(180);
            return true;
        }

        if (command.id === 'bulwark_order') {
            const block = Math.max(10, Math.floor((14 + this.turnNumber * 0.9 + (this.player.realm || 1) * 0.35) * scale));
            if (typeof this.player.addBlock === 'function') {
                this.player.addBlock(block);
            } else {
                this.player.block = Math.max(0, Math.floor(Number(this.player.block) || 0)) + block;
            }
            const cleaned = this.cleansePlayerDebuffs(2);
            Utils.showBattleLog(`玄甲整阵：获得 ${block} 护盾${cleaned > 0 ? `，并净化 ${cleaned} 层减益` : ''}`);
            await Utils.sleep(140);
            return true;
        }

        if (command.id === 'tempo_order') {
            const drawCount = Math.max(1, Math.floor(2 + (scale >= 1.25 ? 1 : 0)));
            if (typeof this.player.drawCards === 'function') {
                this.player.drawCards(drawCount);
            }
            const energyGain = 1 + (scale >= 1.35 ? 1 : 0);
            this.player.currentEnergy = Math.max(0, Math.floor(Number(this.player.currentEnergy) || 0) + energyGain);
            if (typeof this.player.maxMilkCandy === 'number') {
                const maxCandy = Math.max(0, Math.floor(Number(this.player.maxMilkCandy) || 0));
                this.player.milkCandy = Math.min(maxCandy, Math.max(0, Math.floor(Number(this.player.milkCandy) || 0)) + 1);
            }
            const nextHitBonus = Math.max(4, Math.floor((5 + this.turnNumber * 0.45) * scale));
            this.player.buffs = this.player.buffs || {};
            this.player.buffs.nextAttackBonus = Math.max(
                Math.floor(Number(this.player.buffs.nextAttackBonus) || 0),
                nextHitBonus
            );
            Utils.showBattleLog(`疾策回转：抽 ${drawCount}，回能 ${energyGain}，并强化下一次攻击 +${nextHitBonus}`);
            await Utils.sleep(120);
            return true;
        }

        if (command.id === 'suppress_order') {
            const aliveEnemies = this.enemies.filter((enemy) => enemy && enemy.currentHp > 0);
            if (aliveEnemies.length === 0) return false;

            let removedBlock = 0;
            for (const enemy of aliveEnemies) {
                enemy.buffs = enemy.buffs || {};
                const block = Math.max(0, Math.floor(Number(enemy.block) || 0));
                const remove = Math.max(0, Math.floor(block * 0.6));
                if (remove > 0) {
                    enemy.block = Math.max(0, block - remove);
                    removedBlock += remove;
                }
                enemy.buffs.weak = (enemy.buffs.weak || 0) + 1;
            }
            Utils.showBattleLog(`压制领域：削减敌方护盾 ${removedBlock} 点，并施加全体虚弱`);
            await Utils.sleep(120);
            return true;
        }

        if (command.id === 'hunt_order') {
            const aliveEnemies = this.enemies.filter((enemy) => enemy && enemy.currentHp > 0);
            if (aliveEnemies.length === 0) return false;
            let target = aliveEnemies[0];
            for (let i = 1; i < aliveEnemies.length; i += 1) {
                if ((aliveEnemies[i].currentHp || 0) > (target.currentHp || 0)) {
                    target = aliveEnemies[i];
                }
            }
            const targetIndex = this.enemies.indexOf(target);
            const strike = Math.max(8, Math.floor((11 + this.turnNumber * 1.1) * scale));
            target.buffs = target.buffs || {};
            target.buffs.mark = (target.buffs.mark || 0) + 3;
            const damage = this.dealDamageToEnemy(target, strike, 'fire');
            const enemyEl = document.querySelector(`.enemy[data-index="${targetIndex}"]`);
            if (enemyEl) {
                Utils.addShakeEffect(enemyEl, damage >= 20 ? 'heavy' : 'medium');
                Utils.showFloatingNumber(enemyEl, damage, 'damage');
            }
            Utils.showBattleLog(`猎杀标记锁定 ${target.name}：造成 ${damage} 伤害并叠加 3 层破绽`);
            await Utils.sleep(160);
            return true;
        }

        if (command.id === 'rift_surge_order') {
            const aliveEnemies = this.enemies.filter((enemy) => enemy && enemy.currentHp > 0);
            if (aliveEnemies.length === 0) return false;
            const pressure = this.getBattleCommandEndlessPressure();
            const base = Math.max(8, Math.floor((10 + pressure * 1.8 + this.turnNumber * 0.8) * scale));
            let totalDamage = 0;
            for (let i = 0; i < this.enemies.length; i += 1) {
                const enemy = this.enemies[i];
                if (!enemy || enemy.currentHp <= 0) continue;
                const damage = this.dealDamageToEnemy(enemy, base, 'water');
                totalDamage += Math.max(0, damage);
                const enemyEl = document.querySelector(`.enemy[data-index="${i}"]`);
                if (enemyEl) {
                    Utils.addShakeEffect(enemyEl, damage >= 20 ? 'heavy' : 'medium');
                    Utils.showFloatingNumber(enemyEl, damage, 'damage');
                }
            }
            const refund = pressure >= 7 ? 2 : 1;
            this.gainBattleCommandPoints(refund, 'rift');
            const heal = Math.max(0, Math.floor((pressure + 1) * 0.8));
            if (heal > 0 && typeof this.player?.heal === 'function') {
                this.player.heal(heal);
            }
            if (pressure >= 6 && this.game && typeof this.game.ensureEndlessState === 'function') {
                const state = this.game.ensureEndlessState();
                const before = Math.max(0, Math.min(9, Math.floor(Number(state.pressure) || 0)));
                state.pressure = Math.max(0, before - 1);
                Utils.showBattleLog(`裂隙潮汐稳定战局：轮回压力 ${before}→${state.pressure}`);
            }
            Utils.showBattleLog(`裂隙潮汐：全体共受 ${totalDamage} 伤害，回收指令槽 +${refund}${heal > 0 ? `，恢复 ${heal} 生命` : ''}`);
            await Utils.sleep(170);
            return true;
        }

        if (command.id === 'phase_anchor_order') {
            const path = String(this.player?.fateRing?.path || '');
            const doctrineProfile = this.getPathDoctrineProfile(path);
            const doctrineTier = Math.max(0, Math.floor(Number(doctrineProfile?.tier) || 0));
            const pressure = this.getBattleCommandEndlessPressure();
            const blockGain = Math.max(10, Math.floor((12 + pressure * 1.6 + this.turnNumber * 0.45) * scale));
            if (typeof this.player?.addBlock === 'function') {
                this.player.addBlock(blockGain);
            } else {
                this.player.block = Math.max(0, Math.floor(Number(this.player?.block) || 0)) + blockGain;
            }
            let cleanseCap = 2 + (pressure >= 7 ? 1 : 0);
            if (path === 'wisdom' && doctrineTier > 0) cleanseCap += 1;
            if (path === 'resonance' && doctrineTier >= 2) cleanseCap += 1;
            const cleaned = this.cleansePlayerDebuffs(cleanseCap);

            let pressureShift = 0;
            if (pressure >= 6 && this.game && typeof this.game.ensureEndlessState === 'function') {
                const state = this.game.ensureEndlessState();
                const before = Math.max(0, Math.min(9, Math.floor(Number(state.pressure) || 0)));
                state.pressure = Math.max(0, before - 1);
                pressureShift = before - state.pressure;
            }

            let exposed = 0;
            const exposedThreshold = (path === 'wisdom' && doctrineTier > 0) ? 9 : 8;
            if (pressure >= exposedThreshold) {
                this.player.buffs = this.player.buffs || {};
                this.player.buffs.vulnerable = Math.max(0, Math.floor(Number(this.player.buffs.vulnerable) || 0)) + 1;
                exposed = 1;
            }
            if (path === 'resonance' && doctrineTier > 0) {
                this.gainBattleCommandPoints(1, 'phaseAnchor');
            }
            if (path === 'wisdom' && doctrineTier >= 2 && typeof this.player?.drawCards === 'function') {
                this.player.drawCards(1);
            }
            if (path === 'destruction' && doctrineTier > 0) {
                this.player.buffs = this.player.buffs || {};
                this.player.buffs.strength = Math.max(0, Math.floor(Number(this.player.buffs.strength) || 0)) + doctrineTier;
            }

            Utils.showBattleLog(
                `相位锚定：获得 ${blockGain} 护盾，净化 ${cleaned} 层减益`
                + `${pressureShift > 0 ? `，轮回压力 -${pressureShift}` : ''}`
                + `${path === 'resonance' && doctrineTier > 0 ? '，回响教义回收 1 点指令槽' : ''}`
                + `${path === 'wisdom' && doctrineTier >= 2 ? '，并获得 1 次战术过牌' : ''}`
                + `${path === 'destruction' && doctrineTier > 0 ? `，毁灭教义提升 ${doctrineTier} 点力量` : ''}`
                + `${exposed > 0 ? '，但自身暴露 1 层易伤' : ''}`
            );
            await Utils.sleep(160);
            return true;
        }

        if (command.id === 'void_pursuit_order') {
            const aliveEnemies = this.enemies.filter((enemy) => enemy && enemy.currentHp > 0);
            if (aliveEnemies.length === 0) return false;

            const path = String(this.player?.fateRing?.path || '');
            const doctrineProfile = this.getPathDoctrineProfile(path);
            const doctrineTier = Math.max(0, Math.floor(Number(doctrineProfile?.tier) || 0));
            const pressure = this.getBattleCommandEndlessPressure();
            const antiBurst = aliveEnemies.reduce((max, enemy) => Math.max(max, Math.floor(Number(enemy?.__endlessAntiBurst) || 0)), 0);
            const antiRefund = aliveEnemies.reduce((max, enemy) => Math.max(max, Math.floor(Number(enemy?.__endlessAntiRefund) || 0)), 0);
            let target = aliveEnemies[0];
            for (let i = 1; i < aliveEnemies.length; i += 1) {
                if ((aliveEnemies[i].currentHp || 0) > (target.currentHp || 0)) {
                    target = aliveEnemies[i];
                }
            }
            const targetIndex = this.enemies.indexOf(target);
            target.buffs = target.buffs || {};

            const extraScale = (path === 'destruction' && doctrineTier > 0)
                ? (1 + doctrineTier * 0.06)
                : 1;
            const primaryDamageRaw = Math.max(
                14,
                Math.floor((16 + pressure * 1.9 + this.turnNumber * 0.75) * scale * extraScale)
            );
            const primaryDamage = this.resolveBurstDamageAfterCounter(primaryDamageRaw, antiBurst, 8);
            const dealtPrimary = this.dealDamageToEnemy(target, primaryDamage, 'metal');
            const markStack = (pressure >= 6 ? 3 : 2) + (
                path === 'convergence' && doctrineTier > 0 ? doctrineTier : 0
            );
            target.buffs.mark = Math.max(0, Math.floor(Number(target.buffs.mark) || 0)) + markStack;

            let splashTotal = 0;
            if (pressure >= 5) {
                const splashRatioBase = pressure >= 8 ? 0.45 : 0.35;
                const splashRatio = Math.min(
                    0.6,
                    splashRatioBase + (path === 'wisdom' && doctrineTier > 0 ? doctrineTier * 0.03 : 0)
                );
                const splashRaw = Math.max(6, Math.floor(primaryDamage * splashRatio));
                const splash = this.resolveBurstDamageAfterCounter(splashRaw, antiBurst, 4);
                for (let i = 0; i < this.enemies.length; i += 1) {
                    const enemy = this.enemies[i];
                    if (!enemy || enemy.currentHp <= 0 || enemy === target) continue;
                    const damage = this.dealDamageToEnemy(enemy, splash, 'fire');
                    splashTotal += Math.max(0, damage);
                    const enemyEl = document.querySelector(`.enemy[data-index="${i}"]`);
                    if (enemyEl) {
                        Utils.addShakeEffect(enemyEl, damage >= 16 ? 'heavy' : 'medium');
                        Utils.showFloatingNumber(enemyEl, damage, 'damage');
                    }
                }
            }

            let hpCost = 0;
            if (pressure >= 8) {
                hpCost = Math.max(4, Math.floor((Number(this.player?.maxHp) || 1) * 0.1));
                if (path === 'destruction' && doctrineTier > 0) hpCost += doctrineTier * 2;
                if (path === 'wisdom' && doctrineTier > 0) hpCost = Math.max(0, hpCost - doctrineTier * 2);
                this.player.currentHp = Math.max(1, Math.floor(Number(this.player?.currentHp) || 1) - hpCost);
                if (this.game && typeof this.game.ensureEndlessState === 'function') {
                    const state = this.game.ensureEndlessState();
                    const before = Math.max(0, Math.min(9, Math.floor(Number(state.pressure) || 0)));
                    state.pressure = Math.max(0, before - 1);
                }
            }
            if (
                path === 'convergence'
                && doctrineTier > 0
                && target.currentHp <= 0
            ) {
                const refund = this.resolveCommandRefundAfterCounter(1, antiRefund);
                if (refund > 0) {
                    this.gainBattleCommandPoints(refund, 'voidPursuit');
                }
            }
            if (
                path === 'resonance'
                && doctrineTier > 0
                && splashTotal > 0
                && typeof this.player?.drawCards === 'function'
            ) {
                this.player.drawCards(1);
            }

            const targetEl = document.querySelector(`.enemy[data-index="${targetIndex}"]`);
            if (targetEl) {
                Utils.addShakeEffect(targetEl, dealtPrimary >= 22 ? 'heavy' : 'medium');
                Utils.showFloatingNumber(targetEl, dealtPrimary, 'damage');
            }

            Utils.showBattleLog(
                `裂界追猎：重击 ${target.name} 造成 ${Math.max(0, dealtPrimary)} 伤害`
                + `${splashTotal > 0 ? `，余震扩散 ${splashTotal}` : ''}`
                + `${path === 'convergence' && doctrineTier > 0 ? `，并叠加 ${markStack} 层破绽` : ''}`
                + `${path === 'resonance' && doctrineTier > 0 && splashTotal > 0 ? '，回响教义抽取 1 张牌' : ''}`
                + `${antiBurst > 0 ? '，敌方爆发抑制削弱了伤害' : ''}`
                + `${hpCost > 0 ? `，并消耗 ${hpCost} 生命稳压` : ''}`
            );
            await Utils.sleep(180);
            return true;
        }

        if (command.id === 'resonance_matrix_order') {
            const aliveEnemies = this.enemies.filter((enemy) => enemy && enemy.currentHp > 0);
            if (aliveEnemies.length === 0) return false;

            const path = String(this.player?.fateRing?.path || '');
            const doctrineProfile = this.getPathDoctrineProfile(path);
            const doctrineTier = Math.max(0, Math.floor(Number(doctrineProfile?.tier) || 0));
            const pressure = this.getBattleCommandEndlessPressure();
            const threatProfile = this.resolveCounterplayThreatProfile();
            const modeProfile = await this.resolveResonanceMatrixMode(command, threatProfile);
            if (!modeProfile) return false;
            if (this.commandState && this.commandState.enabled) {
                this.commandState.lastResonanceMatrixMode = String(modeProfile.id || 'auto');
            }
            const antiDraw = aliveEnemies.reduce((max, enemy) => Math.max(max, Math.floor(Number(enemy?.__endlessAntiDraw) || 0)), 0);
            const antiStabilize = aliveEnemies.some((enemy) => Number(enemy?.__endlessAntiStabilize) > 0);
            const antiRefund = aliveEnemies.reduce((max, enemy) => Math.max(max, Math.floor(Number(enemy?.__endlessAntiRefund) || 0)), 0);
            const antiBurst = aliveEnemies.reduce((max, enemy) => Math.max(max, Math.floor(Number(enemy?.__endlessAntiBurst) || 0)), 0);
            const hpRatio = Number(this.player?.maxHp) > 0
                ? (Number(this.player?.currentHp) || 0) / Number(this.player.maxHp)
                : 1;

            const shouldDefend = !!threatProfile.needDefend && (hpRatio <= 0.72 || pressure >= 7);
            const forcedBranch = String(modeProfile.forceBranch || 'auto');
            let branchId = 'burst';
            if (forcedBranch === 'guard' || forcedBranch === 'break' || forcedBranch === 'cleanse' || forcedBranch === 'burst') {
                branchId = forcedBranch;
            } else if (shouldDefend) {
                branchId = 'guard';
            } else if (threatProfile.needBreak) {
                branchId = 'break';
            } else if (threatProfile.needCleanse) {
                branchId = 'cleanse';
            }
            const modeText = modeProfile.id !== 'auto' ? `（策略：${modeProfile.label}）` : '';

            if (branchId === 'guard') {
                const blockGain = Math.max(12, Math.floor((14 + pressure * 1.2 + this.turnNumber * 0.5) * scale));
                if (typeof this.player?.addBlock === 'function') {
                    this.player.addBlock(blockGain);
                } else {
                    this.player.block = Math.max(0, Math.floor(Number(this.player?.block) || 0)) + blockGain;
                }
                const cleanCap = 1 + (path === 'wisdom' && doctrineTier > 0 ? 1 : 0);
                const cleaned = this.cleansePlayerDebuffs(cleanCap);
                if (path === 'resonance' && doctrineTier > 0 && typeof this.player?.drawCards === 'function') {
                    this.player.drawCards(1);
                }
                const guardRefund = (path === 'convergence' && doctrineTier >= 2)
                    ? this.resolveCommandRefundAfterCounter(1, antiRefund)
                    : 0;
                if (guardRefund > 0) {
                    this.gainBattleCommandPoints(guardRefund, 'resonanceMatrixGuard');
                }
                Utils.showBattleLog(
                    `命环共振·守势回路${modeText}：获得 ${blockGain} 护盾，净化 ${cleaned} 层减益`
                    + `${path === 'resonance' && doctrineTier > 0 ? '，并抽取 1 张牌' : ''}`
                    + `${path === 'convergence' && doctrineTier >= 2 && guardRefund <= 0 && antiRefund > 0 ? '，但回收被敌方封锁' : ''}`
                );
                await Utils.sleep(160);
                return true;
            }

            if (branchId === 'break') {
                let target = aliveEnemies[0];
                for (let i = 1; i < aliveEnemies.length; i += 1) {
                    const challenger = aliveEnemies[i];
                    const challengerBlock = Math.max(0, Math.floor(Number(challenger?.block) || 0));
                    const targetBlock = Math.max(0, Math.floor(Number(target?.block) || 0));
                    if (challengerBlock > targetBlock) {
                        target = challenger;
                        continue;
                    }
                    if (challengerBlock === targetBlock && (challenger.currentHp || 0) > (target.currentHp || 0)) {
                        target = challenger;
                    }
                }
                const targetIndex = this.enemies.indexOf(target);
                target.buffs = target.buffs || {};
                const beforeBlock = Math.max(0, Math.floor(Number(target.block) || 0));
                const breakAmount = Math.max(6, Math.floor(beforeBlock * 0.72) + Math.floor(pressure * 0.5));
                target.block = Math.max(0, beforeBlock - breakAmount);
                const vulnStack = 1 + (path === 'convergence' && doctrineTier > 0 ? 1 : 0);
                target.buffs.vulnerable = Math.max(0, Math.floor(Number(target.buffs.vulnerable) || 0)) + vulnStack;

                const damageScale = path === 'destruction' && doctrineTier > 0 ? (1 + doctrineTier * 0.05) : 1;
                const strikeRaw = Math.max(9, Math.floor((10 + pressure * 1.1 + this.turnNumber * 0.6) * scale * damageScale));
                const strike = this.resolveBurstDamageAfterCounter(strikeRaw, antiBurst, 6);
                const damage = this.dealDamageToEnemy(target, strike, 'metal');
                if (path === 'resonance' && doctrineTier > 0 && breakAmount >= 10 && typeof this.player?.drawCards === 'function') {
                    this.player.drawCards(1);
                }
                const breakRefund = (path === 'convergence' && doctrineTier >= 2 && breakAmount >= 10)
                    ? this.resolveCommandRefundAfterCounter(1, antiRefund)
                    : 0;
                if (breakRefund > 0) {
                    this.gainBattleCommandPoints(breakRefund, 'resonanceMatrixBreak');
                }
                const targetEl = document.querySelector(`.enemy[data-index="${targetIndex}"]`);
                if (targetEl) {
                    Utils.addShakeEffect(targetEl, damage >= 18 ? 'heavy' : 'medium');
                    Utils.showFloatingNumber(targetEl, damage, 'damage');
                }
                Utils.showBattleLog(
                    `命环共振·破阵回路${modeText}：击碎 ${target.name} 护盾 ${Math.min(beforeBlock, breakAmount)} 点，造成 ${Math.max(0, damage)} 伤害并施加 ${vulnStack} 层易伤`
                    + `${path === 'resonance' && doctrineTier > 0 && breakAmount >= 10 ? '，并抽取 1 张牌' : ''}`
                    + `${antiBurst > 0 ? '，敌方爆发抑制生效' : ''}`
                    + `${path === 'convergence' && doctrineTier >= 2 && breakRefund <= 0 && antiRefund > 0 ? '，但回收被敌方封锁' : ''}`
                );
                await Utils.sleep(170);
                return true;
            }

            if (branchId === 'cleanse') {
                const cleanCap = 2 + (path === 'wisdom' && doctrineTier > 0 ? 1 : 0);
                const cleaned = this.cleansePlayerDebuffs(cleanCap);
                const drawCount = Math.max(
                    1,
                    2 + (path === 'resonance' && doctrineTier > 0 ? 1 : 0) - antiDraw
                );
                if (typeof this.player?.drawCards === 'function') {
                    this.player.drawCards(drawCount);
                }
                let pressureDelta = 0;
                if (!antiStabilize && cleaned >= 2 && this.game && typeof this.game.ensureEndlessState === 'function') {
                    const state = this.game.ensureEndlessState();
                    const before = Math.max(0, Math.min(9, Math.floor(Number(state.pressure) || 0)));
                    if (before >= 6) {
                        state.pressure = Math.max(0, before - 1);
                        pressureDelta = state.pressure - before;
                    }
                }
                const cleanseRefund = (path === 'convergence' && doctrineTier > 0)
                    ? this.resolveCommandRefundAfterCounter(1, antiRefund)
                    : 0;
                if (cleanseRefund > 0) {
                    this.gainBattleCommandPoints(cleanseRefund, 'resonanceMatrixCleanse');
                }
                Utils.showBattleLog(
                    `命环共振·净域回路${modeText}：净化 ${cleaned} 层减益并抽 ${drawCount}`
                    + `${pressureDelta < 0 ? `，轮回压力 ${pressureDelta}` : ''}`
                    + `${antiStabilize ? '，敌方稳压封锁生效' : ''}`
                    + `${path === 'convergence' && doctrineTier > 0 && cleanseRefund <= 0 && antiRefund > 0 ? '，且回收被敌方封锁' : ''}`
                );
                await Utils.sleep(150);
                return true;
            }

            let target = aliveEnemies[0];
            for (let i = 1; i < aliveEnemies.length; i += 1) {
                if ((aliveEnemies[i].currentHp || 0) > (target.currentHp || 0)) {
                    target = aliveEnemies[i];
                }
            }
            const targetIndex = this.enemies.indexOf(target);
            const burstScale = path === 'destruction' && doctrineTier > 0 ? (1 + doctrineTier * 0.07) : 1;
            const primaryRaw = Math.max(12, Math.floor((13 + pressure * 1.3 + this.turnNumber * 0.7) * scale * burstScale));
            const primary = this.resolveBurstDamageAfterCounter(primaryRaw, antiBurst, 8);
            const primaryDamage = this.dealDamageToEnemy(target, primary, 'fire');
            let splashTotal = 0;
            const splashRaw = Math.max(5, Math.floor(primary * 0.35));
            const splash = this.resolveBurstDamageAfterCounter(splashRaw, antiBurst, 3);
            for (let i = 0; i < this.enemies.length; i += 1) {
                const enemy = this.enemies[i];
                if (!enemy || enemy.currentHp <= 0 || enemy === target) continue;
                const damage = this.dealDamageToEnemy(enemy, splash, 'fire');
                splashTotal += Math.max(0, damage);
            }
            const burstRefund = (path === 'convergence' && doctrineTier > 0 && primaryDamage >= 16)
                ? this.resolveCommandRefundAfterCounter(1, antiRefund)
                : 0;
            if (burstRefund > 0) {
                this.gainBattleCommandPoints(burstRefund, 'resonanceMatrixBurst');
            }
            const targetEl = document.querySelector(`.enemy[data-index="${targetIndex}"]`);
            if (targetEl) {
                Utils.addShakeEffect(targetEl, primaryDamage >= 20 ? 'heavy' : 'medium');
                Utils.showFloatingNumber(targetEl, primaryDamage, 'damage');
            }
            Utils.showBattleLog(
                `命环共振·歼灭回路${modeText}：重创 ${target.name} ${Math.max(0, primaryDamage)} 并余震扩散 ${splashTotal}`
                + `${burstRefund > 0 ? `，回收指令槽 +${burstRefund}` : ''}`
                + `${path === 'convergence' && doctrineTier > 0 && primaryDamage >= 16 && burstRefund <= 0 && antiRefund > 0 ? '，但回收被敌方封锁' : ''}`
                + `${antiBurst > 0 ? '，敌方爆发抑制生效' : ''}`
            );
            await Utils.sleep(170);
            return true;
        }

        if (command.id === 'horizon_barter_order') {
            const aliveEnemies = this.enemies.filter((enemy) => enemy && enemy.currentHp > 0);
            if (aliveEnemies.length === 0) return false;

            const modeProfile = await this.resolveHorizonBarterMode(command);
            if (!modeProfile) return false;
            const path = String(this.player?.fateRing?.path || '');
            const doctrineProfile = this.getPathDoctrineProfile(path);
            const doctrineTier = Math.max(0, Math.floor(Number(doctrineProfile?.tier) || 0));
            const pressure = this.getBattleCommandEndlessPressure();

            const currentCandy = Math.max(0, Math.floor(Number(this.player?.milkCandy) || 0));
            const maxSpend = Math.max(1, Math.floor(Number(modeProfile.spendCap) || 2) + (path === 'wisdom' && doctrineTier >= 2 ? 1 : 0));
            const spentCandy = Math.min(maxSpend, currentCandy);
            this.player.milkCandy = Math.max(0, currentCandy - spentCandy);

            const antiCandy = aliveEnemies.reduce((max, enemy) => Math.max(max, Math.floor(Number(enemy?.__endlessAntiCandy) || 0)), 0);
            const antiDraw = aliveEnemies.reduce((max, enemy) => Math.max(max, Math.floor(Number(enemy?.__endlessAntiDraw) || 0)), 0);
            const antiStabilize = aliveEnemies.some((enemy) => Number(enemy?.__endlessAntiStabilize) > 0);
            const antiEnergy = aliveEnemies.reduce((max, enemy) => Math.max(max, Math.floor(Number(enemy?.__endlessAntiEnergy) || 0)), 0);
            const antiRefund = aliveEnemies.reduce((max, enemy) => Math.max(max, Math.floor(Number(enemy?.__endlessAntiRefund) || 0)), 0);
            const antiBurst = aliveEnemies.reduce((max, enemy) => Math.max(max, Math.floor(Number(enemy?.__endlessAntiBurst) || 0)), 0);
            const effectiveCandy = Math.max(0, spentCandy - antiCandy);

            const drawCount = Math.max(
                1,
                1 + effectiveCandy + Math.max(0, Math.floor(Number(modeProfile.drawBonus) || 0))
                + (path === 'resonance' && doctrineTier > 0 ? 1 : 0)
                - antiDraw
            );
            if (typeof this.player?.drawCards === 'function') {
                this.player.drawCards(drawCount);
            }
            const rawEnergyGain = Math.max(
                1,
                1 + (effectiveCandy >= 2 ? 1 : 0)
                + Math.max(0, Math.floor(Number(modeProfile.energyBonus) || 0))
                + (path === 'convergence' && doctrineTier >= 2 ? 1 : 0)
            );
            const energyGain = Math.max(0, rawEnergyGain - antiEnergy);
            this.player.currentEnergy = Math.max(0, Math.floor(Number(this.player?.currentEnergy) || 0) + energyGain);

            let target = aliveEnemies[0];
            for (let i = 1; i < aliveEnemies.length; i += 1) {
                if ((aliveEnemies[i].currentHp || 0) > (target.currentHp || 0)) {
                    target = aliveEnemies[i];
                }
            }
            const targetIndex = this.enemies.indexOf(target);
            const damageScale = path === 'destruction' && doctrineTier > 0 ? (1 + doctrineTier * 0.04) : 1;
            const primaryRaw = Math.max(
                8,
                Math.floor((9 + pressure * 1.4 + effectiveCandy * 3 + this.turnNumber * 0.5) * scale * damageScale * Math.max(0.6, Number(modeProfile.damageMul) || 1))
            );
            const primary = this.resolveBurstDamageAfterCounter(primaryRaw, antiBurst, 5);
            const primaryDamage = this.dealDamageToEnemy(target, primary, 'thunder');

            let splashTotal = 0;
            if (effectiveCandy >= 2) {
                const splashRaw = Math.max(5, Math.floor(primary * 0.4));
                const splash = this.resolveBurstDamageAfterCounter(splashRaw, antiBurst, 3);
                for (let i = 0; i < this.enemies.length; i += 1) {
                    const enemy = this.enemies[i];
                    if (!enemy || enemy.currentHp <= 0 || enemy === target) continue;
                    const damage = this.dealDamageToEnemy(enemy, splash, 'thunder');
                    splashTotal += Math.max(0, damage);
                }
            }

            let pressureDelta = 0;
            if (this.game && typeof this.game.ensureEndlessState === 'function') {
                const state = this.game.ensureEndlessState();
                const before = Math.max(0, Math.min(9, Math.floor(Number(state.pressure) || 0)));
                let after = before;
                if (!antiStabilize && effectiveCandy >= Math.max(1, Math.floor(Number(modeProfile.stabilizeNeed) || 2)) && before >= 5) {
                    after = Math.max(0, before - 1);
                } else if (spentCandy <= 0 && before <= 8 && !(path === 'wisdom' && doctrineTier > 0)) {
                    after = Math.min(9, before + Math.max(0, Math.floor(Number(modeProfile.backlash) || 0)));
                }
                state.pressure = after;
                pressureDelta = after - before;
                const currentHeat = Math.max(0, Math.min(9, Math.floor(Number(state.barterHeat) || 0)));
                const heatDelta = spentCandy > 0 ? (spentCandy >= 2 ? 2 : 1) : -1;
                state.barterHeat = Math.max(0, Math.min(9, currentHeat + heatDelta));
            }

            const rawRefund = effectiveCandy >= 1
                ? (1 + (path === 'convergence' && doctrineTier > 0 ? 1 : 0))
                : 0;
            const refund = this.resolveCommandRefundAfterCounter(rawRefund, antiRefund);
            if (refund > 0) {
                this.gainBattleCommandPoints(refund, 'horizonBarter');
            }

            if (path === 'wisdom' && doctrineTier > 0 && spentCandy <= 0) {
                this.cleansePlayerDebuffs(1);
            }

            const targetEl = document.querySelector(`.enemy[data-index="${targetIndex}"]`);
            if (targetEl) {
                Utils.addShakeEffect(targetEl, primaryDamage >= 18 ? 'heavy' : 'medium');
                Utils.showFloatingNumber(targetEl, primaryDamage, 'damage');
            }

            Utils.showBattleLog(
                `界隙交易（${modeProfile.label}）：耗费 ${spentCandy} 点奶糖${antiCandy > 0 ? `（受压制有效 ${effectiveCandy}）` : ''}，抽 ${drawCount} 并回能 ${energyGain}，对 ${target.name} 造成 ${Math.max(0, primaryDamage)} 伤害`
                + `${splashTotal > 0 ? `（扩散 ${splashTotal}）` : ''}`
                + `${refund > 0 ? `，回收指令槽 +${refund}` : ''}`
                + `${rawRefund > 0 && refund <= 0 && antiRefund > 0 ? '，回收被敌方封锁' : ''}`
                + `${pressureDelta < 0 ? `，轮回压力 ${pressureDelta}` : ''}`
                + `${pressureDelta > 0 ? `，轮回压力 +${pressureDelta}` : ''}`
                + `${antiStabilize ? '，敌方稳压封锁生效' : ''}`
                + `${antiEnergy > 0 ? '，敌方断流抑制生效' : ''}`
                + `${antiBurst > 0 ? '，敌方爆发抑制生效' : ''}`
            );
            await Utils.sleep(170);
            return true;
        }

        return false;
    }

    getBattleCommandSnapshot() {
        const state = this.commandState || this.createDefaultBattleCommandState();
        return {
            enabled: !!state.enabled,
            points: Math.max(0, Math.floor(Number(state.points) || 0)),
            maxPoints: Math.max(1, Math.floor(Number(state.maxPoints) || 12)),
            totalCommandsUsed: Math.max(0, Math.floor(Number(state.totalCommandsUsed) || 0)),
            lastResonanceMatrixMode: String(state.lastResonanceMatrixMode || 'auto'),
            endlessPressure: this.getBattleCommandEndlessPressure(),
            commandCount: Array.isArray(state.commands) ? state.commands.length : 0,
            commands: Array.isArray(state.commands)
                ? state.commands.map((command) => ({
                    id: command.id,
                    name: command.name,
                    cost: this.resolveBattleCommandEffectiveCost(command),
                    baseCost: command.cost,
                    cooldown: command.cooldown,
                    cooldownRemaining: command.cooldownRemaining,
                    uses: command.uses || 0
                }))
                : []
        };
    }

    createEnemyTacticalPlan(enemy) {
        if (!enemy || !Array.isArray(enemy.patterns) || enemy.patterns.length === 0) {
            return { id: 'balanced_cycle', label: '均衡轮转', queue: [0] };
        }

        const patterns = enemy.patterns;
        const attackIndexes = [];
        const defendIndexes = [];
        const debuffIndexes = [];
        const utilityIndexes = [];

        patterns.forEach((pattern, index) => {
            if (!pattern || typeof pattern !== 'object') return;
            if (pattern.type === 'attack' || pattern.type === 'multiAttack' || pattern.type === 'executeDamage') {
                attackIndexes.push(index);
            } else if (pattern.type === 'defend' || pattern.type === 'heal') {
                defendIndexes.push(index);
            } else if (pattern.type === 'debuff' || pattern.type === 'addStatus') {
                debuffIndexes.push(index);
            } else {
                utilityIndexes.push(index);
            }
        });

        const take = (arr, fallback = 0, cursor = 0) => {
            if (Array.isArray(arr) && arr.length > 0) {
                return arr[Math.max(0, cursor) % arr.length];
            }
            return Math.max(0, Math.min(patterns.length - 1, fallback));
        };
        const firstAttack = take(attackIndexes, 0, 0);
        const firstDefend = take(defendIndexes, firstAttack, 0);
        const firstDebuff = take(debuffIndexes, firstAttack, 0);
        const firstUtility = take(utilityIndexes, firstAttack, 0);

        const role = String(enemy.enemyVariantRole || this.resolveEnemyCombatArchetype(patterns) || 'balanced');
        let id = 'balanced_cycle';
        let label = '均衡轮转';
        let queue = [firstAttack, firstDefend, firstDebuff, take(attackIndexes, firstAttack, 1)];

        if (role === 'striker') {
            id = 'strike_chain';
            label = '疾攻链';
            queue = [
                firstAttack,
                take(attackIndexes, firstAttack, 1),
                firstDebuff,
                take(attackIndexes, firstAttack, 2),
                firstUtility,
                take(attackIndexes, firstAttack, 3)
            ];
        } else if (role === 'guardian') {
            id = 'guard_cycle';
            label = '守御轮转';
            queue = [
                firstDefend,
                firstAttack,
                take(defendIndexes, firstDefend, 1),
                firstUtility,
                take(attackIndexes, firstAttack, 1),
                firstDebuff
            ];
        } else if (role === 'hexer') {
            id = 'hex_rotation';
            label = '咒压轮换';
            queue = [
                firstDebuff,
                firstAttack,
                take(debuffIndexes, firstDebuff, 1),
                firstUtility,
                take(attackIndexes, firstAttack, 1),
                firstDefend
            ];
        }

        const sanitized = queue
            .map((idx) => Math.max(0, Math.min(patterns.length - 1, Math.floor(Number(idx) || 0))))
            .filter((idx, pos, source) => source.length <= 1 || pos === 0 || idx !== source[pos - 1]);

        return {
            id,
            label,
            queue: sanitized.length > 0 ? sanitized : [0]
        };
    }

    refreshEnemyTacticalPlan(enemy, force = false) {
        if (!enemy || !Array.isArray(enemy.patterns) || enemy.patterns.length === 0) return;
        const needRefresh = force
            || !enemy.tacticalPlanId
            || !Array.isArray(enemy.tacticalQueue)
            || enemy.__tacticalPatternCount !== enemy.patterns.length;
        if (!needRefresh) return;

        const plan = this.createEnemyTacticalPlan(enemy);
        enemy.tacticalPlanId = plan.id;
        enemy.tacticalPlanLabel = plan.label;
        enemy.tacticalQueue = Array.isArray(plan.queue) ? plan.queue.slice() : [0];
        enemy.tacticalCursor = 0;
        enemy.__tacticalPatternCount = enemy.patterns.length;
    }

    getNextEnemyPatternIndex(enemy) {
        if (!enemy || !Array.isArray(enemy.patterns) || enemy.patterns.length === 0) return 0;
        this.refreshEnemyTacticalPlan(enemy);

        if (!Array.isArray(enemy.tacticalQueue) || enemy.tacticalQueue.length === 0) {
            enemy.currentPatternIndex = Math.max(0, enemy.currentPatternIndex || 0) % enemy.patterns.length;
            return enemy.currentPatternIndex;
        }

        const cursor = Math.max(0, Math.floor(Number(enemy.tacticalCursor) || 0));
        const idx = enemy.tacticalQueue[cursor % enemy.tacticalQueue.length];
        enemy.tacticalCursor = cursor + 1;
        enemy.currentPatternIndex = Math.max(0, Math.min(enemy.patterns.length - 1, Math.floor(Number(idx) || 0)));
        return enemy.currentPatternIndex;
    }

    // 创建敌人实例
    createEnemyInstance(enemyData) {
        if (!enemyData || typeof enemyData !== 'object') {
            console.error('createEnemyInstance received invalid enemyData:', enemyData);
            return null;
        }

        // 1. 深拷贝行动模式，防止修改污染原始数据 (Deep copy patterns)
        const sourcePatterns = Array.isArray(enemyData.patterns) ? enemyData.patterns : [];
        const patterns = sourcePatterns.map(p => ({ ...p }));

        if (patterns.length === 0) {
            // 中文注释：兜底默认攻击，防止空行动序列导致敌人回合崩溃
            patterns.push({ type: 'attack', value: 1, intent: '⚔️' });
        }

        // 2. 全局数值增强 (Global Scaling)
        // HP +20%
        const baseHp = Number.isFinite(enemyData.maxHp) ? enemyData.maxHp : enemyData.hp;
        let maxHp = Math.max(1, Math.floor((baseHp || 1) * 1.2));

        // 伤害 +25%
        patterns.forEach(p => {
            if (p.type === 'attack' || p.type === 'multiAttack') {
                if (typeof p.value === 'number') {
                    p.value = Math.floor(p.value * 1.25);
                }
            }
        });

        // 初始化基本对象
        const enemy = {
            ...enemyData,
            hp: maxHp,
            maxHp: maxHp,
            currentHp: maxHp,
            patterns: patterns, // 使用修改后的 patterns
            block: 0,
            buffs: { ...(enemyData.buffs || {}) },
            currentPatternIndex: 0,
            stunned: false,
            isElite: false,
            isAlive() {
                return this.currentHp > 0;
            },
            addBuff(type, value) {
                if (!type || typeof value !== 'number' || isNaN(value) || value === 0) return;
                this.buffs[type] = (this.buffs[type] || 0) + value;
                if (this.buffs[type] <= 0) delete this.buffs[type];
            },
            addDebuff(type, value) {
                this.addBuff(type, value);
            },
            heal(amount) {
                if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) return 0;
                const before = this.currentHp;
                this.currentHp = Math.min(this.maxHp, this.currentHp + Math.floor(amount));
                return this.currentHp - before;
            },
            takeDamage(amount, options = {}) {
                if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) return 0;
                let finalDamage = Math.floor(amount);
                if (!options.ignoreBlock && this.block > 0) {
                    const absorbed = Math.min(this.block, finalDamage);
                    this.block -= absorbed;
                    finalDamage -= absorbed;
                }
                if (finalDamage <= 0) return 0;
                this.currentHp = Math.max(0, this.currentHp - finalDamage);
                return finalDamage;
            }
        };

        const variation = this.getEnemyVariationBlueprint(enemyData, enemy.patterns, enemy.maxHp);
        if (variation) {
            enemy.enemyVariantId = variation.id;
            enemy.enemyVariantTier = variation.tier;
            enemy.enemyVariantRole = variation.archetype;
            enemy.enemyVariantTag = variation.tag;
            enemy.name = `${enemy.name}·${variation.tag}`;

            if (variation.attackMul > 1) {
                enemy.patterns.forEach((pattern) => {
                    if (!pattern || typeof pattern !== 'object') return;
                    if (pattern.type === 'attack' || pattern.type === 'multiAttack' || pattern.type === 'executeDamage') {
                        if (Number.isFinite(Number(pattern.value))) {
                            pattern.value = Math.max(1, Math.floor(Number(pattern.value) * variation.attackMul));
                        }
                    }
                });
            }
            if (variation.openingBlock > 0) {
                enemy.block = Math.max(enemy.block || 0, variation.openingBlock);
            }
            if (variation.openingStrength > 0) {
                enemy.buffs.strength = Math.max(0, Number(enemy.buffs.strength) || 0) + variation.openingStrength;
            }
            if (Array.isArray(variation.appendPatterns) && variation.appendPatterns.length > 0) {
                enemy.patterns.push(...variation.appendPatterns.map((pattern) => ({ ...pattern })));
            }
        }

        // 3. 精英怪机制 (Elite System)
        // 非Boss单位有 20% 几率突变为精英
        // 3. 精英怪机制 (Elite System)
        // 非Boss单位有 20% 几率突变为精英
        // 增加 isMinion 检查，防止召唤物过于变态
        // 增加 !enemy.isElite 检查，防止已经是精英的怪再次突变 (Double Elite Bug Fix)
        const canRollElite = !!(typeof ENEMIES !== 'undefined' && enemyData && enemyData.id && ENEMIES[enemyData.id]);
        if (canRollElite && !enemy.isBoss && !enemy.isMinion && !enemy.isElite && Math.random() < 0.2) {
            enemy.isElite = true;
            enemy.alias = enemy.name; // Keep original name reference if needed
            enemy.name = `【精英】${enemy.name}`;

            // 精英属性加成 (Hardcore)
            // HP 额外 +45%
            enemy.maxHp = Math.floor(enemy.maxHp * 1.45);
            enemy.hp = enemy.maxHp;
            enemy.currentHp = enemy.maxHp;

            // 伤害 额外 +35%
            enemy.patterns.forEach(p => {
                if (p.type === 'attack' || p.type === 'multiAttack') {
                    if (typeof p.value === 'number') {
                        p.value = Math.floor(p.value * 1.35);
                    }
                }
            });

            // 随机精英词缀
            const eliteTypes = ['strength', 'toughness', 'thorns', 'regen', 'swift', 'sunder', 'voidGazers'];
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
            if (type === 'sunder') enemy.buffs.guardBreak = 1;
            if (type === 'voidGazers') enemy.buffs.voidGazers = 1;

            Utils.showBattleLog(`遭遇强敌：${enemy.name} (特性:${type})`);
        }

        // Boss HP 额外增强 +30%
        if (enemy.isBoss) {
            enemy.maxHp = Math.floor(enemy.maxHp * 1.3);
            enemy.hp = enemy.maxHp;
            enemy.currentHp = enemy.maxHp;
        }

        // 兼容 phaseConfig -> phases，供阶段切换逻辑复用
        if (!enemy.phases && Array.isArray(enemy.phaseConfig)) {
            enemy.phases = enemy.phaseConfig.map(cfg => ({
                threshold: cfg.threshold,
                name: cfg.name || '异变',
                heal: cfg.heal || 0,
                patterns: cfg.patterns || enemy.patterns
            }));
            enemy.currentPhase = 0;
        }

        if (enemy.isBoss) {
            this.initializeBossThreeActState(enemy);
        }

        this.refreshEnemyTacticalPlan(enemy, true);

        return enemy;
    }

    // 开始战斗
    startBattle() {
        this.clearBattleTimers();
        this.turnNumber = 1;
        this.currentTurn = 'player';
        this.battleEnded = false;
        this.battleResolution = null;
        this.forceEndEnemyTurn = false;
        this.isProcessingCard = false; // 强制重置状态
        this.isTurnTransitioning = false;
        this.currentCardProcessToken = 0;
        this.pendingLifeSteal = 0;
        this.selectedCardIndex = -1;
        this.playerTookDamage = false; // For Trial Challenge
        this.player.resurrectCount = 0; // Reset resurrection counter
        this.cardsPlayedThisTurn = 0;
        this.playerAttackedThisTurn = false;
        this.playerFirstAttackBoostUsed = false;
        this.turnStartTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        this.encounterRewardConsumed = false;
        this.lastPlayerCardSnapshot = null;
        this.tacticalAdvisorCollapsed = this.shouldUseCompactBattleHud();

        this.installBattlePlayerHooks();

        // --- P1 机制：解析残影 (Ghost) 行为库 ---
        for (let enemy of this.enemies) {
            if (enemy.id === 'ghost_demon' && enemy.ghostPayload) {
                this.parseGhostPatterns(enemy);
            }
        }

        // 玩家回合开始
        this.player.startTurn();

        if (this.player.archetypeResonance) {
            const res = this.player.archetypeResonance;
            if (res.id === 'hemorrhage') {
                Utils.showBattleLog(`【流派共鸣·${res.name}】T${res.tier} 激活：流血施加 +${res.applyBleedBonus}`);
            } else if (res.id === 'precision') {
                Utils.showBattleLog(`【流派共鸣·${res.name}】T${res.tier} 激活：破绽施加 +${res.applyMarkBonus}`);
            } else if (res.id === 'entropy') {
                Utils.showBattleLog(`【流派共鸣·${res.name}】T${res.tier} 激活：本回合首次弃牌触发抽牌与追击`);
            } else if (res.id === 'stormcraft') {
                Utils.showBattleLog(`【流派共鸣·${res.name}】T${res.tier} 激活：本回合首次命中易伤目标触发追击`);
            } else if (res.id === 'vitalweave') {
                Utils.showBattleLog(`【流派共鸣·${res.name}】T${res.tier} 激活：本回合首次治疗触发护脉反击`);
            } else if (res.id === 'bulwark') {
                Utils.showBattleLog(`【流派共鸣·${res.name}】T${res.tier} 激活：本回合首次获得护盾触发抽牌与反击`);
            }
        }

        const doctrine = this.player && this.player.legacyRunDoctrine ? this.player.legacyRunDoctrine : null;
        if (doctrine && doctrine.firstAttackBonusPerBattle > 0) {
            Utils.showBattleLog(`传承道统：本场首次攻击伤害 +${doctrine.firstAttackBonusPerBattle}`);
        }

        // 强制检查手牌，如果为空尝试补发（防止Bug）
        if (this.player.hand.length === 0) {
            console.warn('StartBattle: Hand empty, forcing draw.');
            const fallbackDraw = this.player.drawCount || 5;
            this.player.drawCards(fallbackDraw);
        }

        // 播放BGM
        if (typeof audioManager !== 'undefined') {
            const isBoss = this.enemies.some(e => e.isBoss);
            audioManager.playBGM(isBoss ? 'boss' : 'battle');
        }

        // Boss出场特效
        const isBoss = this.enemies.some(e => e.isBoss);
        if (isBoss && typeof particles !== 'undefined') {
            this.scheduleBattleTimer(() => particles.bossSpawnEffect(), 500);
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

        const encounterTheme = this.resolveEncounterThemeProfile();
        if (encounterTheme) {
            this.applyEncounterThemeProfile(encounterTheme);
        }
        if (this.activeSquadEcology && this.activeSquadEcology.tag) {
            Utils.showBattleLog(`【敌阵生态】${this.activeSquadEcology.name}：${this.activeSquadEcology.desc}`);
        }
        this.resetTurnAdvisorTelemetry();
        this.initializeBattleCommandSystem();
        this.onBattleCommandTurnStart();

        // 环境：禁止护盾时，清空已有护盾（避免开场护盾绕过）
        if (this.environmentState && this.environmentState.noBlock) {
            this.player.block = 0;
            Utils.showBattleLog('古战场：护盾被战场压制！');
        }
        const battleNode = this.game && this.game.currentBattleNode ? this.game.currentBattleNode : null;
        if (battleNode && battleNode.polluted) {
            Utils.showBattleLog('【煞气激荡】污染战斗：恢复被压制，卡牌消耗+1，首回合随机耗散1张手牌。');
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

        // --- P0 机制：虚空凝视者 (Anti-Entropy Meta) ---
        // 检测场上是否有 voidGazers 精英怪
        const hasVoidGazers = this.enemies.some(e => e.buffs && e.buffs.voidGazers > 0);
        if (hasVoidGazers) {
            Utils.showBattleLog('【虚空凝视】：过度运转灵力将招致反噬！');
            this.on('cardPlayed', (payload) => {
                if (payload.cardsPlayedThisTurn > 6) {
                    const voidDamage = 8 + (payload.cardsPlayedThisTurn - 6) * 4;
                    Utils.showBattleLog(`【反噬】你的高频施法激怒了虚空！受到 ${voidDamage} 点真实伤害！`);
                    // 采用绕过护盾的真实伤害
                    const savedBlock = this.player.block;
                    this.player.block = 0;
                    this.player.takeDamage(voidDamage);
                    this.player.block = savedBlock;

                    const playerEl = document.querySelector('.player-avatar');
                    if (playerEl) {
                        Utils.addFlashEffect(playerEl, 'purple');
                        Utils.showFloatingNumber(playerEl, voidDamage, 'damage');
                    }
                    this.updatePlayerUI();
                }
            });
        }

        // 确保结束回合按钮可用
        const endTurnBtn = document.getElementById('end-turn-btn');
        if (endTurnBtn) {
            endTurnBtn.disabled = false;
        }

        const activeBoss = this.getPrimaryBossEnemy();
        if (activeBoss && activeBoss.bossActState) {
            this.announceBossAct(activeBoss, true);
            this.processBossThreeActPlayerTurnStart(activeBoss);
        }

        // 更新UI
        this.markUIDirty();
        this.updateBattleUI();
        // this.bindCardEvents(); // Removed redundant call, updateHandUI handles this

        if (this.game && typeof this.game.showFirstBattleGuide === 'function') {
            this.game.showFirstBattleGuide();
        }
    }

    // --- P1 机制：解析残影 (Ghost) 行为库 ---
    // 将玩家的历史残影牌库粗略提取为敌对BOSS的攻击逻辑
    parseGhostPatterns(enemy) {
        const payload = enemy.ghostPayload;
        if (!payload || !payload.deck || payload.deck.length === 0) return;

        let attacks = [];
        let defends = [];
        let magics = [];

        // 分类计算卡牌基础数值
        payload.deck.forEach(card => {
            const rawCard = window.CARDS ? window.CARDS[card.id] : null;
            if (!rawCard) return;
            const isUpgraded = card.upgraded;
            let val = rawCard.value || 0;
            if (isUpgraded && rawCard.upgradeBonus) val += rawCard.upgradeBonus;

            if (rawCard.type === 'attack') attacks.push(val);
            else if (rawCard.type === 'defend') defends.push(val);
            else magics.push(val);
        });

        // 算出平均值
        const avgAtk = attacks.length > 0 ? attacks.reduce((a, b) => a + b, 0) / attacks.length : 5;
        const avgDef = defends.length > 0 ? defends.reduce((a, b) => a + b, 0) / defends.length : 5;
        const avgMag = magics.length > 0 ? magics.reduce((a, b) => a + b, 0) / magics.length : 5;
        const realmMultiplier = this.player.realm * 0.5;

        enemy.patterns = [];

        // 攻击模式
        if (attacks.length > 0) {
            enemy.patterns.push({ type: 'attack', value: Math.floor(avgAtk + 10 + realmMultiplier * 4), intent: '残影绝学', effect: 'pierce' });
        }
        // 防护模式
        if (defends.length > 0) {
            enemy.patterns.push({ type: 'defend', value: Math.floor(avgDef + 15 + realmMultiplier * 5), intent: '残影罡气' });
        }
        // 法术模式 (多段打击)
        if (magics.length > 0) {
            enemy.patterns.push({ type: 'attack', value: Math.floor(avgMag + 5 + realmMultiplier * 2), intent: '残影法器', count: 2 });
        }

        // 兜底设计：必定拥有基本攻击
        if (enemy.patterns.length === 0) {
            enemy.patterns.push({ type: 'attack', value: 15 + this.player.realm * 2, intent: '求生意志' });
        }
    }

    markUIDirty(...sections) {
        if (!sections || sections.length === 0) {
            this.uiDirty.player = true;
            this.uiDirty.enemies = true;
            this.uiDirty.hand = true;
            this.uiDirty.energy = true;
            this.uiDirty.piles = true;
            this.uiDirty.environment = true;
            this.uiDirty.activeSkill = true;
            this.uiDirty.command = true;
            return;
        }

        sections.forEach(section => {
            if (this.uiDirty[section] !== undefined) {
                this.uiDirty[section] = true;
            }
        });
    }

    on(eventName, listener) {
        if (!eventName || typeof listener !== 'function') return () => { };
        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, new Set());
        }
        this.eventListeners.get(eventName).add(listener);
        return () => this.off(eventName, listener);
    }

    off(eventName, listener) {
        const listeners = this.eventListeners.get(eventName);
        if (!listeners) return;
        listeners.delete(listener);
        if (listeners.size === 0) {
            this.eventListeners.delete(eventName);
        }
    }

    emit(eventName, payload = {}) {
        const listeners = this.eventListeners.get(eventName);
        if (!listeners || listeners.size === 0) return;
        listeners.forEach((listener) => {
            try {
                listener(payload);
            } catch (err) {
                console.error(`Battle event listener failed (${eventName}):`, err);
            }
        });
    }

    clearEventListeners() {
        this.eventListeners.clear();
    }

    advanceTime(ms = 16) {
        // This game is mostly event-driven, so advancing time is treated as a UI refresh point.
        if (this.battleEnded) return;
        this.markUIDirty();
        this.updateBattleUI();
    }

    // 更新战斗UI
    updateBattleUI() {
        const hasDirty = Object.values(this.uiDirty).some(Boolean);
        if (!hasDirty) this.markUIDirty();

        if (this.uiDirty.player) this.updatePlayerUI();
        if (this.uiDirty.enemies) this.updateEnemiesUI();
        if (this.uiDirty.hand) this.updateHandUI();
        if (this.uiDirty.energy) this.updateEnergyUI();
        if (this.uiDirty.piles) this.updatePilesUI();
        if (this.uiDirty.environment) this.updateEnvironmentUI();
        if (this.uiDirty.command) this.updateBattleCommandUI();
        this.updateBossActUI();
        this.updateLegacyMissionTracker();

        // Sync active skill UI (Cooldowns etc)
        if (this.uiDirty.activeSkill && this.game && this.game.updateActiveSkillUI) {
            this.game.updateActiveSkillUI();
        }

        this.uiDirty.player = false;
        this.uiDirty.enemies = false;
        this.uiDirty.hand = false;
        this.uiDirty.energy = false;
        this.uiDirty.piles = false;
        this.uiDirty.environment = false;
        this.uiDirty.activeSkill = false;
        this.uiDirty.command = false;

        if (this.game && this.game.performanceStats) {
            this.game.performanceStats.battleUIUpdates = (this.game.performanceStats.battleUIUpdates || 0) + 1;
        }
    }

    updateLegacyMissionTracker() {
        const panel = document.getElementById('legacy-mission-tracker');
        if (!panel) return;

        const mission = this.player && this.player.legacyRunMission ? this.player.legacyRunMission : null;
        if (!mission || !mission.target) {
            panel.style.display = 'none';
            return;
        }

        const target = Math.max(1, Number(mission.target) || 1);
        const progress = Math.max(0, Math.min(target, Number(mission.progress) || 0));
        const percent = Math.round((progress / target) * 100);

        const title = document.getElementById('legacy-mission-title');
        const reward = document.getElementById('legacy-mission-reward');
        const progressFill = document.getElementById('legacy-mission-progress-fill');
        const progressText = document.getElementById('legacy-mission-progress-text');

        panel.style.display = 'block';
        panel.classList.toggle('completed', !!mission.completed);

        if (title) title.textContent = mission.name ? `${mission.name}：${mission.desc}` : mission.desc;
        if (reward) reward.textContent = `+${mission.rewardEssence || 0} 精粹`;
        if (progressFill) progressFill.style.width = `${percent}%`;
        if (progressText) {
            progressText.textContent = mission.completed
                ? `已达成 ${target}/${target}`
                : `${progress}/${target}`;
        }
    }

    // 更新玩家UI
    updatePlayerUI() {
        const hpBar = document.getElementById('player-hp-bar');
        const hpText = document.getElementById('player-hp-text');
        const blockDisplay = document.getElementById('block-display');
        const blockValue = document.getElementById('block-value');
        const nameDisplay = document.getElementById('player-name-display');

        if (!hpBar || !hpText || !blockDisplay || !blockValue) {
            return;
        }

        // 更新名字
        if (nameDisplay) {
            const charId = this.player.characterId || 'linFeng';
            if (typeof CHARACTERS !== 'undefined' && CHARACTERS[charId]) {
                const char = CHARACTERS[charId];
                nameDisplay.textContent = char.name;

                // Update Avatar Image
                const avatarEl = document.querySelector('.player-avatar');
                if (avatarEl) {
                    let faceVisual = avatarEl.querySelector('.player-face-visual');
                    if (!faceVisual) {
                        faceVisual = document.createElement('div');
                        faceVisual.className = 'player-face-visual';
                        avatarEl.insertBefore(faceVisual, avatarEl.firstChild);
                    }

                    if (char.image || (char.avatar && (char.avatar.includes('/') || char.avatar.includes('.')))) {
                        // Image Avatar
                        const avatarSrc = char.image || char.avatar;
                        faceVisual.style.backgroundImage = `url('${avatarSrc}')`;
                        faceVisual.textContent = '';
                        avatarEl.classList.add('has-image-avatar');
                        // Ensure name is visible (handled by CSS z-index)
                    } else {
                        // Text/Emoji Avatar
                        faceVisual.style.backgroundImage = '';
                        faceVisual.textContent = '';

                        faceVisual.style.backgroundImage = '';
                        avatarEl.classList.remove('has-image-avatar');

                        faceVisual.textContent = char.avatar;
                        faceVisual.style.display = 'flex';
                        faceVisual.style.justifyContent = 'center';
                        faceVisual.style.alignItems = 'center';
                        faceVisual.style.fontSize = '3rem'; // Adjust as needed
                    }
                }
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

        // --- P0 机制：五行施法序列追踪器UI ---
        let comboTracker = document.getElementById('elemental-combo-tracker');
        if (!comboTracker && this.elementalTracker && this.elementalTracker.length > 0) {
            comboTracker = document.createElement('div');
            comboTracker.id = 'elemental-combo-tracker';
            comboTracker.className = 'elemental-combo-tracker';
            const statsContainer = document.querySelector('.player-stats');
            if (statsContainer) {
                statsContainer.appendChild(comboTracker);
            }
        }

        if (comboTracker) {
            if (!this.elementalTracker || this.elementalTracker.length === 0) {
                comboTracker.style.display = 'none';
                comboTracker.innerHTML = '';
            } else {
                comboTracker.style.display = 'flex';
                comboTracker.innerHTML = '';
                this.elementalTracker.forEach(elem => {
                    const elDiv = document.createElement('div');
                    elDiv.className = `element-orb element-${elem}`;
                    elDiv.textContent = Utils.getElementIcon(elem);
                    comboTracker.appendChild(elDiv);
                });
            }
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

        // 渲染无欲 (Wu Yu) 功德/业力 UI
        const karmaRing = this.player.fateRing;
        if (karmaRing && karmaRing.type === 'karma' && karmaRing.getKarmaStatus) {
            this.renderKarmaUI(karmaRing);
        }
    }

    // New: Render Karma UI (Wu Yu)
    renderKarmaUI(karmaRing) {
        let karmaContainer = document.getElementById('karma-container');
        if (!karmaContainer) {
            // Create container if not exists (append to player-area)
            const playerArea = document.getElementById('player-area');
            if (playerArea) {
                karmaContainer = document.createElement('div');
                karmaContainer.id = 'karma-container';
                karmaContainer.className = 'karma-display';
                // Insert after status bars
                const statusBars = playerArea.querySelector('.status-bars');
                if (statusBars) {
                    statusBars.after(karmaContainer);
                } else {
                    playerArea.appendChild(karmaContainer);
                }
            }
        }

        if (karmaContainer) {
            const status = karmaRing.getKarmaStatus();
            const meritPercent = (status.merit / status.max) * 100;
            const sinPercent = (status.sin / status.max) * 100;

            // 检查buff激活状态
            const imperviousActive = this.player.buffs.impervious > 0;
            const wrathActive = this.player.buffs.wrath > 0;

            karmaContainer.innerHTML = `
                <div class="karma-resource merit-resource ${imperviousActive ? 'buff-active' : ''}" title="功德圆满触发【金刚法相】：完全免疫伤害">
                    <div class="karma-label">功德${imperviousActive ? ' ✨ 金刚法相' : ''}</div>
                    <div class="karma-bar-bg">
                        <div class="karma-bar-fill merit-fill" style="width: ${meritPercent}%"></div>
                    </div>
                    <div class="karma-value">${status.merit}/${status.max}</div>
                </div>
                <div class="karma-resource sin-resource ${wrathActive ? 'buff-active' : ''}" title="业力满溢触发【明王之怒】：下次攻击伤害x3">
                    <div class="karma-label">业力${wrathActive ? ' ⚡ 明王之怒' : ''}</div>
                    <div class="karma-bar-bg">
                        <div class="karma-bar-fill sin-fill" style="width: ${sinPercent}%"></div>
                    </div>
                    <div class="karma-value">${status.sin}/${status.max}</div>
                </div>
            `;
        }
    }

    // 更新敌人UI
    updateEnemiesUI() {
        const container = document.getElementById('enemy-container');
        if (!container) return;
        container.innerHTML = '';

        this.enemies.forEach((enemy, index) => {
            if (enemy.currentHp <= 0) return;

            const enemyEl = Utils.createEnemyElement(enemy, index);

            // 绑定点击事件
            enemyEl.addEventListener('click', () => {
                // Fix: use selectedCardIndex that matches startTargetingMode
                if (
                    this.currentTurn === 'player' &&
                    !this.battleEnded &&
                    !this.isProcessingCard &&
                    !this.isTurnTransitioning &&
                    this.targetingMode &&
                    this.selectedCardIndex !== undefined &&
                    this.selectedCardIndex !== -1
                ) {
                    this.playCardOnTarget(this.selectedCardIndex, index);
                }
            });

            container.appendChild(enemyEl);
        });
    }

    resolveCounterplayThreatProfile() {
        const profile = {
            needCleanse: false,
            needBreak: false,
            needDefend: false,
            needBurst: false,
            aliveEnemyCount: 0,
            debuffActions: 0,
            defendActions: 0,
            healActions: 0,
            summonActions: 0,
            burstScore: 0,
            totalEnemyBlock: 0,
            lowestEnemyHp: 0,
            hasGuardBreak: false,
            strikerRoleCount: 0,
            guardianRoleCount: 0,
            hexerRoleCount: 0
        };
        const aliveEnemies = (Array.isArray(this.enemies) ? this.enemies : [])
            .filter((enemy) => enemy && enemy.currentHp > 0);
        if (aliveEnemies.length === 0) return profile;
        profile.aliveEnemyCount = aliveEnemies.length;

        let debuffActions = 0;
        let defendActions = 0;
        let healActions = 0;
        let summonActions = 0;
        let burstScore = 0;
        let hasGuardBreak = false;
        let strikerRoleCount = 0;
        let guardianRoleCount = 0;
        let hexerRoleCount = 0;

        const scanPattern = (pattern) => {
            if (!pattern || typeof pattern !== 'object') return;
            if (pattern.type === 'debuff' || pattern.type === 'addStatus') debuffActions += 1;
            if (pattern.type === 'defend') defendActions += 1;
            if (pattern.type === 'heal') healActions += 1;
            if (pattern.type === 'summon' || (pattern.type === 'addStatus' && Number(pattern.count) >= 2)) summonActions += 1;
            if (pattern.type === 'multiAction' && Array.isArray(pattern.actions)) {
                pattern.actions.forEach((action) => scanPattern(action));
            }
            if (pattern.type === 'attack') {
                burstScore = Math.max(burstScore, Math.max(0, Math.floor(Number(pattern.value) || 0)));
            } else if (pattern.type === 'executeDamage') {
                burstScore = Math.max(burstScore, Math.max(0, Math.floor(Number(pattern.value) || 0)));
            } else if (pattern.type === 'multiAttack') {
                const value = Math.max(0, Math.floor(Number(pattern.value) || 0));
                const count = Math.max(1, Math.floor(Number(pattern.count) || 1));
                burstScore = Math.max(burstScore, value * count);
            }
        };

        aliveEnemies.forEach((enemy) => {
            if (!enemy || !Array.isArray(enemy.patterns)) return;
            const roleId = String(enemy.enemyVariantRole || this.resolveEnemyCombatArchetype(enemy.patterns) || 'balanced');
            if (roleId === 'striker') strikerRoleCount += 1;
            if (roleId === 'guardian') guardianRoleCount += 1;
            if (roleId === 'hexer') hexerRoleCount += 1;
            const currentHp = Math.max(0, Math.floor(Number(enemy.currentHp) || 0));
            const currentBlock = Math.max(0, Math.floor(Number(enemy.block) || 0));
            profile.totalEnemyBlock += currentBlock;
            if (profile.lowestEnemyHp <= 0 || (currentHp > 0 && currentHp < profile.lowestEnemyHp)) {
                profile.lowestEnemyHp = currentHp;
            }
            if (
                (enemy.isElite && enemy.eliteType === 'sunder')
                || Math.max(0, Math.floor(Number(enemy?.buffs?.guardBreak) || 0)) > 0
            ) {
                hasGuardBreak = true;
            }
            enemy.patterns.forEach((pattern) => scanPattern(pattern));
        });

        const heavyBlockEnemy = aliveEnemies.some((enemy) => Math.max(0, Math.floor(Number(enemy.block) || 0)) >= 10);
        profile.needCleanse = debuffActions >= 2 || hexerRoleCount >= 1;
        profile.needBreak = heavyBlockEnemy || defendActions + healActions >= 2 || guardianRoleCount >= 1;
        profile.needDefend = burstScore >= 18 || hasGuardBreak;
        profile.needBurst = summonActions >= 1 || strikerRoleCount >= 1 || (defendActions + healActions >= 2);
        profile.debuffActions = debuffActions;
        profile.defendActions = defendActions;
        profile.healActions = healActions;
        profile.summonActions = summonActions;
        profile.burstScore = burstScore;
        profile.hasGuardBreak = hasGuardBreak;
        profile.strikerRoleCount = strikerRoleCount;
        profile.guardianRoleCount = guardianRoleCount;
        profile.hexerRoleCount = hexerRoleCount;
        return profile;
    }

    resolveCardCounterTags(card, threatProfile = null) {
        if (!card || typeof card !== 'object') return [];
        const profile = threatProfile && typeof threatProfile === 'object'
            ? threatProfile
            : this.resolveCounterplayThreatProfile();
        const effects = Array.isArray(card.effects) ? card.effects : [];
        const keywords = Array.isArray(card.keywords) ? card.keywords.map((kw) => String(kw || '')) : [];
        const tags = [];
        const pushTag = (id, label, tip) => {
            if (!id || !label || !tip) return;
            if (tags.some((item) => item.id === id)) return;
            tags.push({ id, label, tip });
        };

        const hasCleanse = keywords.includes('cleanse') || effects.some((effect) => effect && effect.type === 'cleanse');
        const hasBreak = keywords.includes('penetrate') || keywords.includes('execute') || effects.some((effect) => {
            if (!effect || typeof effect !== 'object') return false;
            return ['removeBlock', 'blockBurst', 'penetrate', 'executeDamage', 'percentDamage'].includes(effect.type);
        });
        const hasDefend = card.type === 'defense'
            || Number(card.block) > 0
            || effects.some((effect) => effect && (
                effect.type === 'block' || (effect.type === 'buff' && effect.buffType === 'nextTurnBlock')
            ));
        const hasBurst = (card.type === 'attack' && Math.max(0, Number(card.damage) || 0) >= 10)
            || keywords.includes('burst')
            || keywords.includes('chain')
            || keywords.includes('vulnerable')
            || keywords.includes('execute')
            || effects.some((effect) => {
                if (!effect || typeof effect !== 'object') return false;
                if (effect.type === 'damage' || effect.type === 'executeDamage' || effect.type === 'percentDamage') {
                    return Math.max(0, Number(effect.value) || 0) >= 10;
                }
                if (effect.type === 'multiAttack') {
                    const v = Math.max(0, Number(effect.value) || 0);
                    const c = Math.max(1, Number(effect.count) || 1);
                    return v * c >= 12;
                }
                return false;
            });

        if (profile.needCleanse && hasCleanse) {
            pushTag('cleanse', '净化', '当前敌方偏控场，这张牌可用于解控与止损。');
        }
        if (profile.needBreak && hasBreak) {
            pushTag('break', '破盾', '当前敌方偏防守，这张牌适合破防开口。');
        }
        if (profile.needDefend && hasDefend) {
            pushTag('defend', '防守', '当前有高爆发威胁，建议优先保命。');
        }
        if (profile.needBurst && hasBurst) {
            pushTag('burst', '爆发', '当前适合抢节奏，这张牌可用于快速压血。');
        }

        return tags.slice(0, 2);
    }

    resolveBattleTempoRail(threatProfile = null, recommendation = null) {
        const profile = threatProfile && typeof threatProfile === 'object'
            ? threatProfile
            : this.resolveCounterplayThreatProfile();
        const pickedRecommendation = recommendation && typeof recommendation === 'object'
            ? recommendation
            : this.resolveTacticalAdvisorRecommendation(profile);
        const commandState = this.commandState || this.createDefaultBattleCommandState();
        const commandPoints = Math.max(0, Math.floor(Number(commandState.points) || 0));
        const playerBlock = Math.max(0, Math.floor(Number(this.player?.block) || 0));
        const clamp = (value) => Math.max(8, Math.min(100, Math.round(Number(value) || 0)));

        const guardScore = clamp(
            (profile.needDefend ? 54 : 18)
            + Math.min(24, Math.max(0, Math.floor(Number(profile.burstScore) || 0)))
            + (profile.hasGuardBreak ? 16 : 0)
            + Math.max(0, Math.floor(Number(profile.aliveEnemyCount) || 0) - 1) * 6
            - Math.min(16, Math.floor(playerBlock / 3))
        );
        const breakScore = clamp(
            (profile.needBreak ? 56 : 16)
            + Math.min(28, Math.floor((Number(profile.totalEnemyBlock) || 0) * 1.5))
            + Math.max(0, Math.floor(Number(profile.guardianRoleCount) || 0)) * 12
            + Math.max(0, Math.floor(Number(profile.healActions) || 0)) * 10
        );
        const cleanseScore = clamp(
            (profile.needCleanse ? 58 : 14)
            + Math.max(0, Math.floor(Number(profile.debuffActions) || 0)) * 14
            + Math.max(0, Math.floor(Number(profile.hexerRoleCount) || 0)) * 16
        );
        const burstScore = clamp(
            (profile.needBurst ? 48 : 22)
            + Math.max(0, Math.floor(Number(profile.strikerRoleCount) || 0)) * 12
            + Math.max(0, Math.floor(Number(profile.summonActions) || 0)) * 14
            + ((Number(profile.lowestEnemyHp) || 999) <= 24 ? 14 : 0)
            + Math.min(10, commandPoints * 2)
        );

        const segments = [
            { id: 'guard', label: '守势', score: guardScore, tip: '先稳血线，避免被敌方抢到斩杀窗口。' },
            { id: 'break', label: '破阵', score: breakScore, tip: '先打开护势缺口，再把伤害压上去。' },
            { id: 'cleanse', label: '净域', score: cleanseScore, tip: '优先处理控制与减益，确保行动链不断。' },
            { id: 'burst', label: '歼灭', score: burstScore, tip: '当前可以主动抢节奏，尽快压低敌方血线。' }
        ].map((item) => ({
            ...item,
            active: item.id === pickedRecommendation.id
        }));

        const summaryMap = {
            guard: '先稳血线，再找爆发窗口。',
            break: '先破防线，再集中输出。',
            cleanse: '先解控保手牌，再续回合链。',
            burst: '窗口已开，优先压血或收头。'
        };

        return {
            summary: summaryMap[pickedRecommendation.id] || '按当前局势选择最强回路展开。',
            segments
        };
    }

    resolveBattleStatusIslands(state = null, threatProfile = null) {
        const profile = threatProfile && typeof threatProfile === 'object'
            ? threatProfile
            : this.resolveCounterplayThreatProfile();
        const runtimeState = state && typeof state === 'object'
            ? state
            : (this.commandState || this.createDefaultBattleCommandState());
        const points = Math.max(0, Math.floor(Number(runtimeState.points) || 0));
        const maxPoints = Math.max(1, Math.floor(Number(runtimeState.maxPoints) || 12));
        const commands = Array.isArray(runtimeState.commands) ? runtimeState.commands : [];
        const readyCount = commands.reduce((count, command) => {
            if (!command) return count;
            const cost = this.resolveBattleCommandEffectiveCost(command);
            const cooldownRemaining = Math.max(0, Math.floor(Number(command.cooldownRemaining) || 0));
            const ready = (
                this.currentTurn === 'player'
                && !this.battleEnded
                && !this.isProcessingCard
                && !this.isTurnTransitioning
                && cooldownRemaining === 0
                && points >= cost
            );
            return count + (ready ? 1 : 0);
        }, 0);
        const playerBlock = Math.max(0, Math.floor(Number(this.player?.block) || 0));
        const resonance = this.player?.archetypeResonance || null;
        const bossDisplay = this.getBossActDisplayState();
        const islands = [];
        const pushIsland = (id, label, value, tone) => {
            if (!label || !value) return;
            islands.push({
                id: String(id || tone || 'state'),
                label: String(label),
                value: String(value),
                tone: String(tone || id || 'state')
            });
        };

        pushIsland(
            'command',
            '指令',
            readyCount > 0 ? `${readyCount} 项就绪` : `${points}/${maxPoints} 槽`,
            readyCount > 0 ? 'command_ready' : 'command'
        );
        pushIsland(
            'guard',
            '护势',
            playerBlock > 0 ? `${playerBlock} 护盾` : (profile.needDefend ? '需补盾' : '平稳'),
            playerBlock > 0 ? 'guard' : (profile.needDefend ? 'warning' : 'calm')
        );
        if (resonance && (resonance.name || resonance.id)) {
            pushIsland(
                'resonance',
                '共鸣',
                `${resonance.name || resonance.id} T${Math.max(1, Math.floor(Number(resonance.tier) || 1))}`,
                'resonance'
            );
        } else {
            pushIsland('resonance', '共鸣', '未成型', 'muted');
        }
        if (bossDisplay && bossDisplay.act) {
            pushIsland('boss', 'Boss幕', bossDisplay.act.name || `第${Math.max(1, Number(bossDisplay.index) + 1)}幕`, 'boss');
        } else if (Number(profile.lowestEnemyHp) > 0) {
            pushIsland(
                'finish',
                '收束',
                Number(profile.lowestEnemyHp) <= 20 ? `可收头 ${profile.lowestEnemyHp}` : `最低血 ${profile.lowestEnemyHp}`,
                Number(profile.lowestEnemyHp) <= 20 ? 'finish' : 'enemy'
            );
        }

        return islands.slice(0, 4);
    }

    resolveBattleAdvisorInspectCardIndex(cardPlanSteps = null) {
        const hand = Array.isArray(this.player?.hand) ? this.player.hand : [];
        const isValidIndex = (value) => Number.isInteger(value) && value >= 0 && value < hand.length;
        const normalizeIndex = (value) => {
            if (value == null || value === '') return -1;
            const numeric = Number(value);
            return Number.isFinite(numeric) ? Math.floor(numeric) : -1;
        };
        const hoveredIndex = normalizeIndex(this.hoveredBattleCardIndex);
        if (isValidIndex(hoveredIndex)) {
            return { index: hoveredIndex, source: 'hover' };
        }

        const selectedIndex = normalizeIndex(this.selectedCardIndex);
        if (isValidIndex(selectedIndex)) {
            return { index: selectedIndex, source: this.targetingMode ? 'selected' : 'preview' };
        }

        const selectedCard = normalizeIndex(this.selectedCard);
        if (isValidIndex(selectedCard)) {
            return { index: selectedCard, source: 'selected' };
        }

        const telemetry = this.ensureTurnAdvisorTelemetry();
        if (telemetry && telemetry.focusedCardKey) {
            const focusedIndex = hand.findIndex((card) => this.getAdvisorCardKey(card) === telemetry.focusedCardKey);
            if (isValidIndex(focusedIndex)) {
                return { index: focusedIndex, source: 'focused' };
            }
        }

        if (Array.isArray(cardPlanSteps) && cardPlanSteps.length > 0) {
            const suggestedIndex = Math.max(0, Math.floor(Number(cardPlanSteps[0]?.index) || 0));
            if (isValidIndex(suggestedIndex)) {
                return { index: suggestedIndex, source: 'suggested' };
            }
        }

        if (hand.length > 0) {
            return { index: 0, source: 'fallback' };
        }

        return { index: -1, source: 'empty' };
    }

    describeBattleAdvisorEffect(effect) {
        if (!effect || typeof effect !== 'object') return '';
        const target = String(effect.target || '').toLowerCase();
        const value = Math.max(0, Math.floor(Number(effect.value) || 0));
        const count = Math.max(0, Math.floor(Number(effect.count) || 0));
        const buffNames = {
            vulnerable: '易伤',
            weak: '虚弱',
            poison: '中毒',
            burn: '灼烧',
            stun: '眩晕',
            bleed: '流血',
            mark: '破绽',
            strength: '力量',
            retainBlock: '护盾保留',
            regen: '再生',
            thorns: '反伤',
            dodge: '闪避',
            dodgeChance: '闪避率',
            slow: '减速',
            paralysis: '麻痹',
            freeze: '冰冻'
        };
        switch (effect.type) {
            case 'damage':
                return `单体伤害 ${value}`;
            case 'damageAll':
                return `群体伤害 ${value}`;
            case 'multiAttack':
                return `连击 ${Math.max(1, count)} 段（总计 ${Math.max(1, count) * value}）`;
            case 'randomDamage':
                return `随机伤害 ${Math.max(0, Math.floor(Number(effect.minValue) || 0))}-${Math.max(0, Math.floor(Number(effect.maxValue) || 0))}`;
            case 'block':
                return `获得 ${value} 护盾`;
            case 'blockBurst':
                return '护势转攻';
            case 'removeBlock':
                return `破盾 ${value}`;
            case 'penetrate':
                return `穿透 ${value}`;
            case 'execute':
                return '按已损生命斩杀';
            case 'executeDamage':
                return `斩杀线打击 ${value}`;
            case 'draw':
                return `抽牌 ${value}`;
            case 'heal':
                return `恢复 ${value}`;
            case 'energy':
                return `回灵 ${value}`;
            case 'cleanse':
                return `净化 ${Math.max(1, value || 1)}`;
            case 'discardHand':
                return `弃牌 ${Math.max(1, value || 1)}`;
            case 'discardRandom':
                return `随机弃牌 ${Math.max(1, value || 1)}`;
            case 'buff':
                return `获得 ${buffNames[effect.buffType] || effect.buffType || '增益'} ${Math.max(1, value || 1)}`;
            case 'debuff':
                return `${target === 'allenemies' ? '全体施加' : '施加'} ${buffNames[effect.buffType] || effect.buffType || '减益'} ${Math.max(1, value || 1)}`;
            default:
                return '';
        }
    }

    resolveBattleAdvisorExecutionChain(threatProfile = null, recommendation = null, cardPlanSteps = null) {
        const profile = threatProfile && typeof threatProfile === 'object'
            ? threatProfile
            : this.resolveCounterplayThreatProfile();
        const pickedRecommendation = recommendation && typeof recommendation === 'object'
            ? recommendation
            : this.resolveTacticalAdvisorRecommendation(profile);
        const hand = Array.isArray(this.player?.hand) ? this.player.hand : [];
        const inspect = this.resolveBattleAdvisorInspectCardIndex(cardPlanSteps);
        const card = inspect.index >= 0 ? hand[inspect.index] : null;
        if (!card) {
            return {
                index: -1,
                source: inspect.source,
                kicker: '执行链',
                title: '暂无可分析手牌',
                summary: '抽牌或等待下一回合后，可在此查看卡牌触发链。',
                tags: [],
                items: []
            };
        }

        const counterTags = this.resolveCardCounterTags(card, profile);
        const items = [];
        if (card.type === 'attack' && Math.max(0, Number(card.damage) || 0) > 0) {
            items.push(`基础伤害 ${Math.max(0, Math.floor(Number(card.damage) || 0))}`);
        }
        if (card.type === 'defense' && Math.max(0, Number(card.block) || 0) > 0) {
            items.push(`基础护盾 ${Math.max(0, Math.floor(Number(card.block) || 0))}`);
        }
        const effectItems = Array.isArray(card.effects)
            ? card.effects
                .map((effect) => this.describeBattleAdvisorEffect(effect))
                .filter(Boolean)
            : [];
        effectItems.forEach((text) => {
            if (!items.includes(text)) items.push(text);
        });

        const resonance = this.player?.archetypeResonance || null;
        if (resonance && card.synergyGroup && String(card.synergyGroup) === String(resonance.id || '')) {
            items.push(`承接 ${resonance.name || resonance.id} 共鸣链`);
        }
        if (counterTags.length > 0) {
            items.push(`贴合当前窗口：${counterTags.map((tag) => tag.label).join(' / ')}`);
        } else {
            items.push(`当前建议：${pickedRecommendation.shortLabel || pickedRecommendation.label || '顺势展开'}`);
        }

        const needsTarget = Array.isArray(card.effects) && card.effects.some((effect) =>
            effect && ['damage', 'debuff', 'execute', 'removeBlock', 'goldOnKill', 'maxHpOnKill', 'penetrate', 'steal', 'lifeSteal', 'absorb', 'swapHpPercent', 'executeDamage', 'percentDamage', 'blockBurst'].includes(effect.type)
            && (!effect.target || effect.target === 'enemy' || effect.target === 'single')
        );
        const hasMultipleEnemies = (Array.isArray(this.enemies) ? this.enemies : []).filter((enemy) => enemy && enemy.currentHp > 0).length > 1;
        const costText = card.consumeCandy
            ? '消耗奶糖'
            : `消耗 ${Math.max(0, Math.floor(Number(this.getEffectiveCardCost(card)) || 0))} 灵力`;
        const summaryParts = [costText];
        if (needsTarget && hasMultipleEnemies) {
            summaryParts.push('需选目标');
        }
        if (card.__bossSealed) {
            summaryParts.push('当前被 Boss 封签');
        }

        const kickerMap = {
            hover: '悬停预判',
            preview: '当前预选',
            selected: '当前预选',
            focused: '焦点卡牌',
            suggested: '助手建议',
            fallback: '默认巡检',
            empty: '执行链'
        };

        return {
            index: inspect.index,
            source: inspect.source,
            kicker: kickerMap[inspect.source] || '执行链',
            title: `执行链：${card.name || '未知卡牌'}`,
            summary: summaryParts.join(' · '),
            tags: counterTags.slice(0, 2),
            items: items.slice(0, 4)
        };
    }

    createDefaultTurnAdvisorTelemetry() {
        return {
            turn: Math.max(1, Math.floor(Number(this.turnNumber) || 1)),
            cardsPlayed: 0,
            followedSuggestedCount: 0,
            tagUsage: {
                cleanse: 0,
                break: 0,
                defend: 0,
                burst: 0
            },
            tagAvailable: {
                cleanse: false,
                break: false,
                defend: false,
                burst: false
            },
            suggestedStepKeys: [],
            focusedCardKey: ''
        };
    }

    resetTurnAdvisorTelemetry() {
        this.turnAdvisorTelemetry = this.createDefaultTurnAdvisorTelemetry();
        return this.turnAdvisorTelemetry;
    }

    ensureTurnAdvisorTelemetry() {
        const turn = Math.max(1, Math.floor(Number(this.turnNumber) || 1));
        if (!this.turnAdvisorTelemetry || Number(this.turnAdvisorTelemetry.turn) !== turn) {
            this.turnAdvisorTelemetry = this.createDefaultTurnAdvisorTelemetry();
            this.turnAdvisorTelemetry.turn = turn;
        }
        return this.turnAdvisorTelemetry;
    }

    getAdvisorCardKey(card) {
        if (!card || typeof card !== 'object') return '';
        if (card.instanceId) return `iid:${String(card.instanceId)}`;
        const cardId = String(card.id || card.name || 'card');
        const cardName = String(card.name || card.id || 'card');
        return `cid:${cardId}:${cardName}`;
    }

    updateTurnAdvisorAvailability(threatProfile = null) {
        const telemetry = this.ensureTurnAdvisorTelemetry();
        const profile = threatProfile && typeof threatProfile === 'object'
            ? threatProfile
            : this.resolveCounterplayThreatProfile();
        const hand = Array.isArray(this.player?.hand) ? this.player.hand : [];

        const seen = {
            cleanse: false,
            break: false,
            defend: false,
            burst: false
        };

        hand.forEach((card) => {
            const tags = this.resolveCardCounterTags(card, profile);
            tags.forEach((tag) => {
                const id = String(tag?.id || '');
                if (Object.prototype.hasOwnProperty.call(seen, id)) {
                    seen[id] = true;
                }
            });
        });

        Object.keys(seen).forEach((key) => {
            if (seen[key]) telemetry.tagAvailable[key] = true;
        });
        return telemetry;
    }

    recordTurnAdvisorCardUsage(card, threatProfile = null) {
        if (!card || typeof card !== 'object') return null;
        const telemetry = this.ensureTurnAdvisorTelemetry();
        const profile = threatProfile && typeof threatProfile === 'object'
            ? threatProfile
            : this.resolveCounterplayThreatProfile();
        const cardKey = this.getAdvisorCardKey(card);
        telemetry.cardsPlayed = Math.max(0, Math.floor(Number(telemetry.cardsPlayed) || 0)) + 1;
        if (cardKey && Array.isArray(telemetry.suggestedStepKeys) && telemetry.suggestedStepKeys.includes(cardKey)) {
            telemetry.followedSuggestedCount = Math.max(0, Math.floor(Number(telemetry.followedSuggestedCount) || 0)) + 1;
        }

        const tags = this.resolveCardCounterTags(card, profile);
        tags.forEach((tag) => {
            const id = String(tag?.id || '');
            if (Object.prototype.hasOwnProperty.call(telemetry.tagUsage, id)) {
                telemetry.tagUsage[id] = Math.max(0, Math.floor(Number(telemetry.tagUsage[id]) || 0)) + 1;
            }
        });
        return telemetry;
    }

    resolveTurnAdvisorReviewSummary(threatProfile = null, recommendation = null) {
        const telemetry = this.ensureTurnAdvisorTelemetry();
        const profile = threatProfile && typeof threatProfile === 'object'
            ? threatProfile
            : this.resolveCounterplayThreatProfile();
        const pickedRecommendation = recommendation && typeof recommendation === 'object'
            ? recommendation
            : this.resolveTacticalAdvisorRecommendation(profile);

        if ((Number(telemetry.followedSuggestedCount) || 0) > 0) {
            return '';
        }

        if ((Number(telemetry.cardsPlayed) || 0) <= 0) {
            if (telemetry.focusedCardKey && Array.isArray(telemetry.suggestedStepKeys) && telemetry.suggestedStepKeys.includes(telemetry.focusedCardKey)) {
                return '回合复盘：已预选建议牌但未执行，可能是目标窗口或资源判断偏保守。';
            }
            return '回合复盘：本回合未出牌，若局势允许可先用低费牌试探并积累指令槽。';
        }

        if (profile.needBreak && telemetry.tagAvailable.break && (Number(telemetry.tagUsage.break) || 0) <= 0) {
            return '回合复盘：本回合错过破盾窗口，敌方护势仍在，优先考虑破开防线。';
        }
        if (profile.needCleanse && telemetry.tagAvailable.cleanse && (Number(telemetry.tagUsage.cleanse) || 0) <= 0) {
            return '回合复盘：本回合未及时净化，减益压力会继续放大，可优先处理控制与减益。';
        }
        if (profile.needDefend && telemetry.tagAvailable.defend && (Number(telemetry.tagUsage.defend) || 0) <= 0) {
            return '回合复盘：本回合防御投入不足，敌方高爆发仍在斩杀线附近。';
        }
        if (profile.needBurst && telemetry.tagAvailable.burst && (Number(telemetry.tagUsage.burst) || 0) <= 0) {
            return '回合复盘：本回合没有抓住爆发窗口，关键目标血线仍偏高。';
        }
        if ((Number(telemetry.cardsPlayed) || 0) > 0 && Array.isArray(telemetry.suggestedStepKeys) && telemetry.suggestedStepKeys.length > 0) {
            return `回合复盘：本回合未按${pickedRecommendation.shortLabel || pickedRecommendation.label || '建议'}回路展开，下轮可优先执行助手步骤。`;
        }
        return '';
    }

    resolveBattleTacticalCardPlanMeta(threatProfile = null, recommendation = null) {
        const profile = threatProfile && typeof threatProfile === 'object'
            ? threatProfile
            : this.resolveCounterplayThreatProfile();
        const pickedRecommendation = recommendation && typeof recommendation === 'object'
            ? recommendation
            : this.resolveTacticalAdvisorRecommendation(profile);

        const hand = Array.isArray(this.player?.hand) ? this.player.hand : [];
        if (hand.length === 0) {
            return {
                text: '手牌执行：当前无手牌可规划，先通过战场指令或回能争取展开。',
                steps: []
            };
        }

        const tagPriorityMap = {
            guard: ['defend', 'cleanse', 'break', 'burst'],
            break: ['break', 'burst', 'defend', 'cleanse'],
            cleanse: ['cleanse', 'defend', 'break', 'burst'],
            burst: ['burst', 'break', 'defend', 'cleanse']
        };
        const priority = tagPriorityMap[pickedRecommendation?.id] || ['burst', 'break', 'defend', 'cleanse'];
        const defaultReasonMap = {
            attack: '压血抢节奏',
            defense: '先稳护势',
            skill: '补关键节奏',
            law: '补关键节奏'
        };

        const cardMeta = hand.map((card, index) => {
            if (!card || typeof card !== 'object') return null;
            const tags = this.resolveCardCounterTags(card, profile);
            const tagIds = tags.map((item) => String(item.id || ''));
            const cost = this.getEffectiveCardCost(card);
            const hpGate = card.condition && card.condition.type === 'hp'
                ? Math.max(0, Number(card.condition.min) || 0)
                : 0;
            const hpAllowed = !hpGate || Number(this.player?.currentHp || 0) >= hpGate;
            const energyAllowed = card.consumeCandy
                ? Math.max(0, Number(this.player?.milkCandy) || 0) >= 1
                : Math.max(0, Number(this.player?.currentEnergy) || 0) >= cost;
            const playable = hpAllowed && energyAllowed && !card.unplayable;

            let score = playable ? 60 : 0;
            priority.forEach((tagId, idx) => {
                if (tagIds.includes(tagId)) {
                    score += Math.max(4, 22 - idx * 5);
                }
            });
            if (pickedRecommendation?.id === 'guard' && card.type === 'defense') score += 8;
            if (pickedRecommendation?.id === 'break' && card.type === 'attack') score += 7;
            if (pickedRecommendation?.id === 'cleanse' && (card.type === 'skill' || card.type === 'law')) score += 6;
            if (pickedRecommendation?.id === 'burst' && card.type === 'attack') score += 8;
            score -= Math.max(0, cost - 1);

            const reason = tags.length > 0
                ? tags.map((item) => item.label).join(' + ')
                : (defaultReasonMap[card.type] || '补节奏');
            return {
                index,
                card,
                playable,
                score,
                reason
            };
        }).filter(Boolean);

        const playableCards = cardMeta
            .filter((item) => item.playable)
            .sort((a, b) => b.score - a.score);
        if (playableCards.length === 0) {
            return {
                text: '手牌执行：当前关键牌均不可立即打出，先攒灵力并用低费牌过渡。',
                steps: []
            };
        }

        const nameOf = (item) => String(item?.card?.name || `卡牌${Number(item?.index || 0) + 1}`);
        const first = playableCards[0];
        const second = playableCards.find((item) => item.index !== first.index) || null;

        if (!second) {
            return {
                text: `手牌执行：优先打【${nameOf(first)}】（${first.reason}），其余手牌留作下轮展开。`,
                steps: [{
                    index: first.index,
                    name: nameOf(first),
                    reason: first.reason
                }]
            };
        }
        return {
            text: `手牌执行：先打【${nameOf(first)}】（${first.reason}），再接【${nameOf(second)}】（${second.reason}）。`,
            steps: [{
                index: first.index,
                name: nameOf(first),
                reason: first.reason
            }, {
                index: second.index,
                name: nameOf(second),
                reason: second.reason
            }]
        };
    }

    resolveBattleTacticalCardPlan(threatProfile = null, recommendation = null) {
        const meta = this.resolveBattleTacticalCardPlanMeta(threatProfile, recommendation);
        return meta && typeof meta.text === 'string' ? meta.text : '';
    }

    previewAdvisorCard(cardIndex) {
        if (this.currentTurn !== 'player' || this.battleEnded || this.isProcessingCard || this.isTurnTransitioning) {
            return false;
        }
        const index = Math.max(0, Math.floor(Number(cardIndex) || 0));
        const card = Array.isArray(this.player?.hand) ? this.player.hand[index] : null;
        if (!card) return false;

        const telemetry = this.ensureTurnAdvisorTelemetry();
        telemetry.focusedCardKey = this.getAdvisorCardKey(card);

        const needsTarget = Array.isArray(card.effects) && card.effects.some((effect) =>
            ['damage', 'debuff', 'execute', 'removeBlock', 'goldOnKill', 'maxHpOnKill', 'penetrate', 'steal', 'lifeSteal', 'absorb', 'swapHpPercent', 'executeDamage', 'percentDamage', 'blockBurst'].includes(effect.type)
            && (!effect.target || effect.target === 'enemy' || effect.target === 'single')
        );
        const hasMultipleEnemies = this.enemies.filter((enemy) => enemy && enemy.currentHp > 0).length > 1;

        this.selectedCard = index;
        this.selectedCardIndex = index;
        if (this.targetingMode) {
            this.endTargetingMode();
            this.selectedCard = index;
            this.selectedCardIndex = index;
        }
        if (needsTarget && hasMultipleEnemies) {
            this.startTargetingMode(index);
            this.selectedCard = index;
        }
        this.markUIDirty('hand', 'command');
        this.updateBattleUI();
        this.focusAdvisorCard(index);
        return true;
    }

    focusAdvisorCard(cardIndex) {
        const handEl = document.getElementById('hand-cards');
        if (!handEl) return false;
        const index = Math.max(0, Math.floor(Number(cardIndex) || 0));
        const target = handEl.querySelector(`.card[data-index="${index}"]`);
        if (!target) return false;

        const card = Array.isArray(this.player?.hand) ? this.player.hand[index] : null;
        if (card) {
            const telemetry = this.ensureTurnAdvisorTelemetry();
            telemetry.focusedCardKey = this.getAdvisorCardKey(card);
        }

        handEl.querySelectorAll('.card.advisor-focus').forEach((el) => el.classList.remove('advisor-focus'));
        target.classList.add('advisor-focus');
        target.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center'
        });

        if (this.advisorFocusTimer) {
            clearTimeout(this.advisorFocusTimer);
            this.advisorFocusTimer = null;
        }
        this.advisorFocusTimer = setTimeout(() => {
            target.classList.remove('advisor-focus');
            this.advisorFocusTimer = null;
        }, 1800);
        return true;
    }

    // 更新手牌UI
    updateHandUI() {
        const handContainer = document.getElementById('hand-cards');
        if (!handContainer) return;
        handContainer.innerHTML = '';
        if (Math.max(-1, Math.floor(Number(this.hoveredBattleCardIndex) || -1)) >= this.player.hand.length) {
            this.hoveredBattleCardIndex = -1;
        }

        // CSS Force for Scroll - Moved to CSS class .hand-area
        handContainer.classList.add('hand-active');
        const threatProfile = this.resolveCounterplayThreatProfile();

        this.player.hand.forEach((card, index) => {
            const effectiveCost = this.getEffectiveCardCost(card);
            const counterTags = this.resolveCardCounterTags(card, threatProfile);
            const cardEl = Utils.createCardElement(card, index, false, {
                costOverride: effectiveCost,
                battleTags: counterTags
            });

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
                if (effectiveCost > this.player.currentEnergy) {
                    playable = false;
                }
            }

            if (!playable) {
                cardEl.classList.add('unplayable');
            }
            if (playable && counterTags.length > 0) {
                cardEl.classList.add('priority-play', `priority-${counterTags[0].id}`);
            }

            // 如果被选中
            if (card.__bossSealed) {
                cardEl.classList.add('boss-sealed-card');
                cardEl.dataset.bossSealed = 'true';
                const sealBadge = document.createElement('div');
                sealBadge.className = 'boss-sealed-badge';
                sealBadge.textContent = card.__bossSealedPenalty > 1 ? '封签·重' : '封签';
                cardEl.appendChild(sealBadge);
            }

            if (this.selectedCard === index) {
                cardEl.classList.add('selected');
            }

            handContainer.appendChild(cardEl);
        });

        this.bindCardEvents();
    }

    // 获取环境修正后的卡牌消耗
    getEffectiveCardCost(card) {
        if (!card || card.consumeCandy || card.unplayable) return 0;

        let cost = typeof card.cost === 'number' ? card.cost : 0;

        // 环境修正（如第8重重力场：耗能>1 +1）
        if (this.activeEnvironment && typeof this.activeEnvironment.modifyCardCost === 'function') {
            try {
                cost = this.activeEnvironment.modifyCardCost({ ...card, cost });
            } catch (e) {
                console.warn('modifyCardCost failed:', e);
            }
        } else if (this.environmentState && this.environmentState.gravity && cost > 1) {
            cost += 1;
        }

        // 地图污染：在污染节点中，所有非0费法术额外 +1 消耗
        const battleNode = this.game && this.game.currentBattleNode ? this.game.currentBattleNode : null;
        if (battleNode && battleNode.polluted && cost > 0) {
            cost += 1;
        }

        if (typeof cost !== 'number' || isNaN(cost)) cost = 0;
        return Math.max(0, cost);
    }

    // 更新灵力UI
    updateEnergyUI() {
        const orbsContainer = document.getElementById('energy-orbs');
        const energyText = document.getElementById('energy-text');
        if (!orbsContainer || !energyText) return;

        orbsContainer.innerHTML = '';

        const maxIconsBeforeCollapse = 6; // 超过6个时折叠为单图标+数字

        if (this.player.currentEnergy > maxIconsBeforeCollapse) {
            // 超过6个，只显示一个图标 + 数字
            const orb = document.createElement('div');
            orb.className = 'energy-orb filled';
            orb.textContent = '⚡';
            orbsContainer.appendChild(orb);

            if (energyText) {
                energyText.style.display = 'block';
                energyText.textContent = `×${this.player.currentEnergy}`;
            }
        } else {
            // 6个及以下，显示对应数量的图标
            for (let i = 0; i < this.player.currentEnergy; i++) {
                const orb = document.createElement('div');
                orb.className = 'energy-orb filled';
                orb.textContent = '⚡';
                orbsContainer.appendChild(orb);
            }

            if (energyText) energyText.style.display = 'none';
        }


        // 显示奶糖 (使用糖果图标)
        let candyContainer = document.getElementById('candy-container');
        if (!candyContainer) {
            candyContainer = document.createElement('div');
            candyContainer.id = 'candy-container';
            candyContainer.className = 'resource-item candy-display';

            const resourcesContainer = orbsContainer.closest('.resources-container');
            if (resourcesContainer) {
                resourcesContainer.appendChild(candyContainer);
            } else if (orbsContainer.parentElement) {
                orbsContainer.parentElement.appendChild(candyContainer);
            }
        }

        if (!candyContainer.querySelector('#candy-orbs')) {
            candyContainer.innerHTML = `
                <div class="candy-orbs" id="candy-orbs"></div>
                <span class="candy-text" id="candy-text">0/0</span>
                <div class="resource-tooltip">奶糖</div>
            `;
        }

        const candyOrbs = candyContainer.querySelector('#candy-orbs');
        const candyText = candyContainer.querySelector('#candy-text');
        if (!candyOrbs || !candyText) return;

        const candySnapshot = this.getCandyDisplaySnapshot(maxIconsBeforeCollapse);
        const currentCandy = candySnapshot.current;
        const maxCandy = candySnapshot.max;
        candyOrbs.innerHTML = '';

        if (!candySnapshot.collapsed) {
            for (let i = 0; i < candySnapshot.iconCount; i += 1) {
                const orb = document.createElement('div');
                orb.className = 'candy-orb';
                orb.textContent = '🍬';
                candyOrbs.appendChild(orb);
            }
        } else {
            const orb = document.createElement('div');
            orb.className = 'candy-orb';
            orb.textContent = '🍬';
            candyOrbs.appendChild(orb);
        }

        candyText.style.display = 'block';
        candyText.textContent = candySnapshot.text;
        candyContainer.title = `奶糖 ${currentCandy}/${maxCandy}`;
    }

    getCandyDisplaySnapshot(maxIconsBeforeCollapse = 6) {
        const current = Math.max(0, Math.floor(Number(this.player?.milkCandy) || 0));
        const max = Math.max(current, Math.floor(Number(this.player?.maxMilkCandy) || 0));
        const collapsed = current > Math.max(1, Math.floor(Number(maxIconsBeforeCollapse) || 6));
        return {
            current,
            max,
            collapsed,
            iconCount: collapsed ? 1 : current,
            text: `${current}/${max}`
        };
    }

    // 更新牌堆UI
    updatePilesUI() {
        const deckCountEl = document.getElementById('deck-count');
        const discardCountEl = document.getElementById('discard-count');
        if (deckCountEl) deckCountEl.textContent = this.player.drawPile.length;
        if (discardCountEl) discardCountEl.textContent = this.player.discardPile.length;
    }

    // 绑定卡牌事件
    bindCardEvents() {
        const handContainer = document.getElementById('hand-cards');
        if (!handContainer || this._handEventsBound) return;
        this._handEventsBound = true;

        handContainer.addEventListener('click', (e) => {
            const cardEl = e.target.closest('.card');
            if (!cardEl || !handContainer.contains(cardEl)) return;
            const index = parseInt(cardEl.dataset.index, 10);
            if (Number.isNaN(index)) return;
            e.stopPropagation();
            this.onCardClick(index);
        });

        handContainer.addEventListener('touchstart', (e) => {
            const cardEl = e.target.closest('.card');
            if (!cardEl || !handContainer.contains(cardEl) || !e.touches || !e.touches[0]) return;
            cardEl.dataset.touchStartY = String(e.touches[0].clientY);
            cardEl.dataset.touchStartTime = String(Date.now());
        }, { passive: true });

        handContainer.addEventListener('touchend', (e) => {
            const cardEl = e.target.closest('.card');
            if (!cardEl || !handContainer.contains(cardEl) || !e.changedTouches || !e.changedTouches[0]) return;
            const startY = parseFloat(cardEl.dataset.touchStartY || '0');
            const startTime = parseInt(cardEl.dataset.touchStartTime || '0', 10);
            if (!startTime) return;
            const endY = e.changedTouches[0].clientY;
            const deltaY = endY - startY;
            const deltaTime = Date.now() - startTime;
            const index = parseInt(cardEl.dataset.index, 10);

            if (deltaY < -50 && deltaTime < 500 && !Number.isNaN(index)) {
                if (navigator.vibrate) navigator.vibrate(50);
                this.onCardClick(index);
            }
        });

        handContainer.addEventListener('mouseover', (e) => {
            const cardEl = e.target.closest('.card');
            if (!cardEl || !handContainer.contains(cardEl)) return;
            const fromEl = e.relatedTarget;
            if (fromEl && cardEl.contains(fromEl)) return;
            const index = parseInt(cardEl.dataset.index, 10);
            if (Number.isNaN(index)) return;
            if (typeof audioManager !== 'undefined') {
                audioManager.playSFX('hover');
            }
            this.onCardHover(index);
        });

        handContainer.addEventListener('mouseout', (e) => {
            const cardEl = e.target.closest('.card');
            if (!cardEl || !handContainer.contains(cardEl)) return;
            const toEl = e.relatedTarget;
            if (toEl && cardEl.contains(toEl)) return;
            this.onCardHoverOut();
        });
    }

    // 卡牌悬停预览
    onCardHover(cardIndex) {
        if (this.battleEnded) return;
        const card = this.player.hand[cardIndex];
        if (!card) return;
        const nextHoverIndex = Math.max(0, Math.floor(Number(cardIndex) || 0));
        if (this.hoveredBattleCardIndex !== nextHoverIndex) {
            this.hoveredBattleCardIndex = nextHoverIndex;
            this.markUIDirty('command');
            this.updateBattleUI();
        }

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
                this.updateDamagePreview(index, totalDamage, enemy.currentHp, enemy.maxHp);
            }
        });
    }

    // 结束悬停
    onCardHoverOut() {
        if (this.hoveredBattleCardIndex !== -1) {
            this.hoveredBattleCardIndex = -1;
            this.markUIDirty('command');
            this.updateBattleUI();
        }
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
        if (!target) return 0;
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
        if (this.currentTurn !== 'player' || this.battleEnded || this.isProcessingCard || this.isTurnTransitioning) {
            console.warn(`Card Click Ignored: Turn=${this.currentTurn}, Ended=${this.battleEnded}, Processing=${this.isProcessingCard}, Transitioning=${this.isTurnTransitioning}`);
            return;
        }

        // Play sound
        if (typeof audioManager !== 'undefined') {
            audioManager.playSFX('click');
        }

        const card = this.player.hand[cardIndex];
        if (!card) return;

        // 计算消耗
        let energyCost = this.getEffectiveCardCost(card);
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
        if (this.currentTurn !== 'player' || this.battleEnded) return;
        if (this.isProcessingCard) return;

        const card = this.player.hand[cardIndex];
        if (!card) return;
        const cardThreatProfile = this.resolveCounterplayThreatProfile();

        const needsTarget = Array.isArray(card.effects) && card.effects.some(e =>
            ['damage', 'debuff', 'execute', 'removeBlock', 'goldOnKill', 'maxHpOnKill', 'penetrate', 'steal', 'lifeSteal', 'absorb', 'swapHpPercent', 'executeDamage', 'percentDamage', 'blockBurst'].includes(e.type)
            && (!e.target || e.target === 'enemy' || e.target === 'single')
        );

        let target = null;
        if (needsTarget) {
            target = this.enemies[targetIndex];
            if (!target || target.currentHp <= 0) {
                Utils.showBattleLog('目标无效，请重新选择');
                this.endTargetingMode();
                return;
            }
        }

        this.isProcessingCard = true;
        const actionId = ++this.activeCardActionId;

        // Safety timeout
        const processingTimeout = this.scheduleBattleTimer(() => {
            if (this.isProcessingCard && this.activeCardActionId === actionId) {
                // 中文注释：仅报警不强制解锁，避免长动画流程中提前放开锁导致并发出牌
                console.warn('Card processing is taking too long. Waiting for current action to finish.');
                Utils.showBattleLog('操作较慢，请稍候...');
            }
        }, 8000);

        try {
            this.endTargetingMode();
            this.selectedCard = null;

            // 立即给予视觉反馈
            const cardEls = document.querySelectorAll('#hand-cards .card');
            if (cardEls[cardIndex]) {
                cardEls[cardIndex].style.opacity = '0.5';
                cardEls[cardIndex].style.transform = 'scale(0.9)';
                cardEls[cardIndex].style.pointerEvents = 'none';
            }

            // 触发连击追踪
            if (this.game && this.game.handleCombo) {
                this.game.handleCombo(card.type);
            }

            // 破法者 (Lawbreaker)（仅成功出牌后）
            if (card.type === 'attack' && this.player.buffs.blockOnAttack) {
                this.player.addBlock(this.player.buffs.blockOnAttack);
                Utils.showBattleLog(`破法者：获得 ${this.player.buffs.blockOnAttack} 护盾`);
            }

            const effectiveCost = this.getEffectiveCardCost(card);
            const sealedCardPlayed = !!card.__bossSealed;

            // 播放卡牌 (核心逻辑)
            const results = this.player.playCard(cardIndex, target, { energyCostOverride: effectiveCost });
            if (results === false) {
                return;
            }

            // 播放音效
            if (typeof audioManager !== 'undefined') {
                audioManager.playSFX('attack');
            }

            // 处理效果
            if (results && Array.isArray(results)) {
                for (const result of results) {
                    await this.processEffect(result, target, targetIndex, card.element);
                }
            }

            // --- P0 机制：五行融合化境 (Elemental Combo) ---
            if (card.element && card.element !== 'none') {
                this.elementalTracker.push(card.element);
                if (this.elementalTracker.length > 5) {
                    this.elementalTracker.shift(); // 保持最近5个元素
                }
                await this.processElementalCombos(target, targetIndex);
            }

            if (sealedCardPlayed) {
                this.handleBossSealedCardPlayed(card);
            }

            this.lastPlayerCardSnapshot = {
                id: card.id || '',
                name: card.name || '',
                type: card.type || '',
                cost: effectiveCost
            };

            // 检查战斗是否结束
            if (this.checkBattleEnd()) return;

            // 计数与追踪
            this.cardsPlayedThisTurn++;
            this.recordTurnAdvisorCardUsage(card, cardThreatProfile);
            if (card.type === 'attack') this.playerAttackedThisTurn = true;
            this.emit('cardPlayed', {
                card,
                target,
                turnNumber: this.turnNumber,
                cardsPlayedThisTurn: this.cardsPlayedThisTurn
            });

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
            this.pendingTimers.delete(processingTimeout);
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

            case 'blockBurst':
                if (target) {
                    const burstDamage = this.dealDamageToEnemy(target, result.value, sourceElement);
                    if (enemyEl) {
                        Utils.addShakeEffect(enemyEl, getShakeIntensity(burstDamage));
                        Utils.showFloatingNumber(enemyEl, burstDamage, 'damage');
                    }
                    const consumed = Math.max(0, Math.floor(Number(result.consumedBlock) || 0));
                    Utils.showBattleLog(`护势转攻！消耗 ${consumed} 点护盾，造成 ${burstDamage} 点伤害`);
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
                    const thunderSword = Array.isArray(this.player.activeResonances)
                        ? this.player.activeResonances.find(r => r.id === 'thunderSword')
                        : null;
                    if (thunderSword) {
                        // 穿透命中后附加易伤，作为“麻痹”表现。
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
                    const targetMaxHp = target.maxHp || target.hp || 1;
                    if ((target.currentHp / targetMaxHp) < threshold) {
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
                    Utils.showBattleLog(`时光倒流！将 ${result.value} 张牌洗回识海`);
                    this.updatePilesUI();
                } else {
                    Utils.showBattleLog(`轮回为空，无需洗牌`);
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

            case 'discardRandom': {
                const count = Math.min(result.value || 1, this.player.hand.length);
                let discarded = 0;
                for (let i = 0; i < count; i++) {
                    const idx = Math.floor(Math.random() * this.player.hand.length);
                    const [card] = this.player.hand.splice(idx, 1);
                    if (card) {
                        this.player.discardPile.push(card);
                        discarded++;
                    }
                }
                if (discarded > 0) {
                    this.player.lastDiscardedCount = discarded;
                    if (typeof this.player.triggerArchetypeDiscardProc === 'function') {
                        this.player.triggerArchetypeDiscardProc(discarded);
                    }
                    Utils.showBattleLog(`随机弃掉 ${discarded} 张手牌`);
                }
                break;
            }

            case 'energyLoss': {
                const loss = Math.max(0, result.value || 0);
                this.player.currentEnergy = Math.max(0, this.player.currentEnergy - loss);
                if (loss > 0) {
                    Utils.showBattleLog(`失去 ${loss} 点灵力`);
                }
                break;
            }

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
                    target.buffs = target.buffs || {};
                    const debuffValue = Math.max(0, Math.floor(Number(result.value) || 0));
                    if (debuffValue <= 0) break;
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

                        // 霸体免疫
                        if (target.buffs && target.buffs.unstoppable > 0) {
                            immune = true;
                            Utils.showBattleLog(`${target.name} 拥有霸体，免疫眩晕！`);
                        }

                        // Fix: Control Immunity Check (Realm 16+)
                        if (target.buffs && target.buffs.controlImmune > 0) {
                            immune = true;
                            Utils.showBattleLog(`${target.name} 免疫控制效果！`);
                        }

                        if (!immune) {
                            target.buffs[result.buffType] = (target.buffs[result.buffType] || 0) + debuffValue;
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
                    } else {
                        target.buffs[result.buffType] = (target.buffs[result.buffType] || 0) + debuffValue;
                    }

                    if (result.buffType === 'stun' && immune) {
                        Utils.showBattleLog(`${target.name} 免疫了眩晕效果`);
                    }

                    const debuffNames = {
                        'vulnerable': '易伤', 'weak': '虚弱', 'poison': '中毒', 'burn': '灼烧', 'stun': '眩晕',
                        'strength': '力量', 'blockOnAttack': '破法盾', 'energyOnVulnerable': '战术优势',
                        'retainBlock': '护盾保留', 'regen': '再生', 'thorns': '反伤', 'reflect': '反弹',
                        'dodge': '闪避', 'dodgeChance': '闪避率', 'freeze': '冰冻', 'slow': '减速',
                        'paralysis': '麻痹', 'severe_wound': '重伤', 'chaosAura': '混沌光环',
                        'bleed': '流血', 'mark': '破绽'
                    };
                    if (!immune || result.buffType !== 'stun') {
                        Utils.showBattleLog(`敌人获得 ${debuffNames[result.buffType] || result.buffType} 效果`);
                    }
                }
                break;

            case 'bleed':
                if (target) {
                    target.buffs.bleed = (target.buffs.bleed || 0) + Math.max(1, result.value || 1);
                    Utils.showBattleLog(`敌人流血 +${result.value}`);
                }
                break;

            case 'mark':
                if (target) {
                    target.buffs.mark = (target.buffs.mark || 0) + Math.max(1, result.value || 1);
                    Utils.showBattleLog(`敌人破绽 +${result.value}`);
                }
                break;

            case 'stance':
                Utils.showBattleLog(`切换架势：${result.value}`);
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
                    Utils.createFloatingText(targetIndex, '破甲', '#ff0000');
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
                const debuffAllValue = Math.max(0, Math.floor(Number(result.value) || 0));
                if (debuffAllValue <= 0) break;
                for (let i = 0; i < this.enemies.length; i++) {
                    const enemy = this.enemies[i];
                    if (enemy.currentHp <= 0) continue;
                    enemy.buffs = enemy.buffs || {};

                    let immune = false;
                    if (result.buffType === 'stun') {
                        // Fix: Boss Unstoppable check for AoE stun
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

                    if (!immune || result.buffType !== 'stun') {
                        enemy.buffs[result.buffType] = (enemy.buffs[result.buffType] || 0) + debuffAllValue;
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
        this.markUIDirty();
        this.updateBattleUI();
    }

    // 对敌人造成伤害
    dealDamageToEnemy(enemy, amount, sourceElement = null) {
        if (!enemy || enemy.currentHp <= 0) return 0;
        if (typeof amount !== 'number' || isNaN(amount)) {
            console.error('dealDamageToEnemy received NaN amount', amount);
            amount = 0;
        }
        amount = Math.max(0, amount);
        enemy.buffs = enemy.buffs || {};

        // 法宝前置伤害修正（如血煞珠、五行珠）
        if (this.player && this.player.triggerTreasureValueEffect) {
            const context = {
                target: enemy,
                targetElement: enemy ? enemy.element : null,
                sourceElement
            };
            amount = this.player.triggerTreasureValueEffect('onBeforeDealDamage', amount, context);
        }

        // 战斗新机制：架势会影响伤害倍率
        if (this.player && this.player.stance === 'aggressive') {
            amount = Math.floor(amount * 1.2);
        } else if (this.player && this.player.stance === 'defensive') {
            amount = Math.floor(amount * 0.9);
        }

        // 敌人闪避层数：必定闪避一次
        if (enemy.buffs.dodge && enemy.buffs.dodge > 0) {
            enemy.buffs.dodge--;
            Utils.showBattleLog(`${enemy.name} 闪避了攻击！`);
            return 0;
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

        // 传承道统：每场战斗首次攻击增伤
        const doctrine = this.player && this.player.legacyRunDoctrine ? this.player.legacyRunDoctrine : null;
        if (
            doctrine &&
            doctrine.firstAttackBonusPerBattle > 0 &&
            !this.playerFirstAttackBoostUsed &&
            sourceElement !== 'plasma_proc'
        ) {
            amount += doctrine.firstAttackBonusPerBattle;
            this.playerFirstAttackBoostUsed = true;
            Utils.showBattleLog(`传承道统：首击增伤 +${doctrine.firstAttackBonusPerBattle}`);
            if (this.game && typeof this.game.handleLegacyMissionProgress === 'function') {
                this.game.handleLegacyMissionProgress('tempoFirstStrike', 1);
            }
        }

        // 应用力量加成 (Strength)
        if (this.player.buffs.strength && this.player.buffs.strength > 0) {
            amount += this.player.buffs.strength;
            // 力量通常是本回合持续生效，不需要在这里消耗
            // 除非是某些特殊的一次性力量，但一般力量定义为回合内Buff
        }

        // 明王之怒（无欲 - 业力满值触发）：下一次攻击伤害x3
        if (this.player.buffs.wrath && this.player.buffs.wrath > 0) {
            const originalAmount = amount;
            amount = Math.floor(amount * 3);
            this.player.buffs.wrath--;
            Utils.showBattleLog(`⚡ 明王之怒！伤害暴增！${originalAmount} → ${amount}`);
        }

        // 共鸣：雷火崩坏 (Plasma Overload) - 改版：对灼烧敌人增伤
        if (this.player.activeResonances) {
            const plasma = this.player.activeResonances.find(r => r.id === 'plasmaOverload');
            if (plasma && (enemy.buffs.burn || 0) > 0 && !this._processingPlasma) {
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
            if (extreme && sourceElement === 'fire') {
                if ((enemy.buffs.weak || 0) > 0 || enemy.stunned) { // Weak as Slow proxy
                    const boom = Math.floor(enemy.maxHp * extreme.effect.damagePercent * (enemy.isBoss ? 0.5 : 1));
                    enemy.currentHp -= boom;
                    Utils.showBattleLog(`极温爆裂！温差爆炸造成 ${boom} 伤害！`);
                    Utils.showFloatingNumber(document.querySelector(`.enemy[data-index="${this.enemies.indexOf(enemy)}"]`), boom, 'damage');
                }
            }
        }

        // 战术优势 (Tactical Advantage) - 攻击易伤回能
        if ((this.player.buffs.energyOnVulnerable || 0) > 0 && enemy && enemy.buffs && enemy.buffs.vulnerable > 0) {
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
        if (this.game && this.game.getComboBonus) {
            const comboBonus = this.game.getComboBonus();
            if (comboBonus > 0) {
                amount = Math.floor(amount * (1 + comboBonus));
                // Utils.showBattleLog(`连击加成：x${comboBonus.toFixed(1)}`);
            }
        }

        // 检查易伤
        if (enemy.buffs.vulnerable && enemy.buffs.vulnerable > 0) {
            amount += enemy.buffs.vulnerable;

            const resonance = this.player && this.player.archetypeResonance ? this.player.archetypeResonance : null;
            const doctrine = this.player && this.player.legacyRunDoctrine ? this.player.legacyRunDoctrine : null;
            const hasStormcraftResonance = !!(resonance && resonance.id === 'stormcraft');
            const hasStormcraftDoctrine = !!(doctrine && doctrine.stormcraftLegacyProcEnabled);
            const resonanceUsed = hasStormcraftResonance ? !!resonance.procUsedThisTurn : false;
            const doctrineUsed = hasStormcraftDoctrine ? !!doctrine.stormcraftProcUsedThisTurn : false;
            if ((hasStormcraftResonance || hasStormcraftDoctrine) && !resonanceUsed && !doctrineUsed) {
                const bonusDamage = Math.max(
                    1,
                    hasStormcraftResonance ? (Math.floor(Number(resonance.vulnerableBonusDamage) || 0)) : 0,
                    hasStormcraftDoctrine ? (Math.floor(Number(doctrine.stormcraftLegacyBonusDamage) || 0)) : 0
                );
                amount += bonusDamage;
                if (hasStormcraftResonance) resonance.procUsedThisTurn = true;
                if (hasStormcraftDoctrine) doctrine.stormcraftProcUsedThisTurn = true;

                const drawCount = Math.max(
                    hasStormcraftResonance ? (Math.floor(Number(resonance.firstVulnerableHitDraw) || 0)) : 0,
                    hasStormcraftDoctrine ? (Math.floor(Number(doctrine.stormcraftLegacyDraw) || 0)) : 0
                );
                if (drawCount > 0) {
                    this.player.drawCards(drawCount);
                    this.markUIDirty('hand', 'piles');
                }
                if (hasStormcraftDoctrine && this.game && typeof this.game.handleLegacyMissionProgress === 'function') {
                    this.game.handleLegacyMissionProgress('stormcraftVulnerableProc', 1);
                }
                Utils.showBattleLog(`【雷策连锁】破窗追击：伤害 +${bonusDamage}${drawCount > 0 ? `，抽牌 +${drawCount}` : ''}`);
            }
        }

        if (enemy.isGhost && enemy.personalityRules && enemy.personalityRules.takenMul) {
            amount = Math.floor(amount * enemy.personalityRules.takenMul);
        }

        // 战斗新机制：破绽（Mark）会强化下一次受击并消耗
        if (enemy.buffs.mark && enemy.buffs.mark > 0) {
            amount += enemy.buffs.mark;
            Utils.showBattleLog(`命中破绽！额外伤害 +${enemy.buffs.mark}`);
            enemy.buffs.mark = 0;
            delete enemy.buffs.mark;

            const resonance = this.player && this.player.archetypeResonance ? this.player.archetypeResonance : null;
            if (resonance && resonance.id === 'precision' && !resonance.procUsedThisTurn && resonance.firstMarkHitDraw > 0) {
                this.player.drawCards(resonance.firstMarkHitDraw);
                resonance.procUsedThisTurn = true;
                Utils.showBattleLog(`【破绽心眼】借势抽牌 +${resonance.firstMarkHitDraw}`);
                this.markUIDirty('hand', 'piles');
            }
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

            if (multiplier !== 1.0) {
                amount = Math.floor(amount * multiplier);

                // 战斗日志
                const sName = this.ELEMENTS[Utils.getCanonicalElement(sourceElement)].name;
                const tName = this.ELEMENTS[Utils.getCanonicalElement(enemy.element)].name;
                const icon = Utils.getElementIcon(sourceElement);

                if (multiplier > 1) {
                    Utils.showBattleLog(`${icon} ${sName}克${tName}！伤害+50%`);
                    Utils.createFloatingText(this.enemies.indexOf(enemy), '克制!', '#ff0');
                    Utils.addFlashEffect(document.querySelector(`.enemy[data-index="${this.enemies.indexOf(enemy)}"]`), 'rgba(255, 0, 0, 0.6)');
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
        amount = Math.max(0, amount);

        // 默认扣血逻辑
        if (!Number.isFinite(amount)) {
            console.warn('dealDamageToEnemy calculated invalid amount, fallback to 0', amount);
            amount = 0;
        }
        amount = Math.max(0, amount);
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

        // --- P0-1: Hit Stop & Screen Shake (顿帧与震屏动画) ---
        // 如果单次伤害超过怪物最大生命值的25%或者是BOSS且伤害过百，触发顿帧和重度震屏
        if (enemy.maxHp > 0) {
            const damagePercent = finalDamage / enemy.maxHp;
            const enemyEl = document.querySelector(`.enemy[data-index="${this.enemies.indexOf(enemy)}"]`);

            if (damagePercent >= 0.25 || (enemy.isBoss && finalDamage >= 100)) {
                if (enemyEl) Utils.addShakeEffect(enemyEl, 'heavy');
                Utils.addShakeEffect(document.body, 'light'); // 全局轻微震动

                // 强制阻塞主线程/动画极短时间实现顿帧(Hit Stop)
                // 这里利用已有的 Utils.sleep，不过更好的是在 processPlayerAction 中阻塞，这里我们可以通过一个小 trick 或者等待
                // 为了保持同步，如果不支持全局暂停，我们可以用一个 CSS 类定格元素
                if (enemyEl) enemyEl.classList.add('hit-stop-frozen');
                setTimeout(() => {
                    if (enemyEl) enemyEl.classList.remove('hit-stop-frozen');
                }, 150); // 顿帧 0.15s
            } else if (damagePercent >= 0.1) {
                if (enemyEl) Utils.addShakeEffect(enemyEl, 'medium');
            }
        }

        // 战斗新机制：阶段化Boss（Phase）切换
        if (enemy.currentHp > 0 && this.checkPhaseChange) {
            this.checkPhaseChange(enemy);
        }

        // 击杀触发
        if (wasAlive && enemy.currentHp <= 0) {
            this.onBattleCommandEnemyKilled(enemy);
            if (this.player.triggerTreasureEffect) {
                this.player.triggerTreasureEffect('onKill', enemy);
            }

            // 命环路径：洞察之环 - 击杀回复5生命
            if (this.player.fateRing && this.player.fateRing.path === 'insight') {
                this.player.heal(5);
                Utils.showBattleLog('洞察之环：击杀回复 5 点生命');
            }

            // Update Achievements: Damage
            if (this.game && this.game.achievementSystem) {
                this.game.achievementSystem.updateStat('totalDamageDealt', finalDamage);
                this.game.achievementSystem.updateStat('maxDamageDealt', finalDamage, 'max');
            }

            // Check Battle End Immediately upon kill
            if (this.checkBattleEnd()) return finalDamage;

            // === Twin Bonds (Dual Boss Vengeance) ===
            if (enemy.isDualBoss) {
                const survivor = this.enemies.find(e => e.isDualBoss && e.currentHp > 0 && e !== enemy);
                if (survivor) {
                    this.scheduleBattleTimer(() => {
                        if (this.battleEnded || survivor.currentHp <= 0) return;
                        Utils.showBattleLog(`【双子羁绊】${survivor.name} 因同伴死亡而暴怒！`);

                        const healAmount = Math.floor(survivor.maxHp * 0.6);
                        survivor.currentHp = Math.min(survivor.maxHp, survivor.currentHp + healAmount);
                        Utils.showBattleLog(`${survivor.name} 恢复了 ${healAmount} 点生命！`);

                        survivor.buffs.strength = (survivor.buffs.strength || 0) + 7;
                        Utils.showBattleLog(`${survivor.name} 力量暴涨！(+7 力量)`);

                        if (this.updateEnemiesUI) this.updateEnemiesUI();
                    }, 600);
                }
            }
        }

        return finalDamage;
    }

    // 结束回合
    async endTurn() {
        if (this.currentTurn !== 'player' || this.battleEnded || this.isProcessingCard || this.isTurnTransitioning) return;
        this.isTurnTransitioning = true;
        this.endTargetingMode();
        this.selectedCard = null;

        const reviewProfile = this.resolveCounterplayThreatProfile();
        const reviewRecommendation = this.resolveTacticalAdvisorRecommendation(reviewProfile);
        this.updateTurnAdvisorAvailability(reviewProfile);
        const turnReview = this.resolveTurnAdvisorReviewSummary(reviewProfile, reviewRecommendation);
        if (turnReview) {
            Utils.showBattleLog(turnReview);
        }

        // 禁用结束回合按钮
        const endTurnBtn = document.getElementById('end-turn-btn');
        if (endTurnBtn) endTurnBtn.disabled = true;

        // --- 清空五行追踪器 ---
        this.elementalTracker = [];

        // 玩家回合结束
        this.player.endTurn();
        this.emit('turnEnd', { turnNumber: this.turnNumber, actor: 'player' });

        // 法宝：玩家回合结束触发
        if (this.player.triggerTreasureEffect) {
            this.player.triggerTreasureEffect('onTurnEnd');
        }

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
                    if (effect.trigger === 'endTurn' || effect.trigger === 'turnEnd') {
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
                                    this.player.lastDiscardedCount = discarded;
                                    if (typeof this.player.triggerArchetypeDiscardProc === 'function') {
                                        this.player.triggerArchetypeDiscardProc(discarded);
                                    }
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
            this.scheduleBattleTimer(() => {
                flash.style.opacity = '0';
                this.scheduleBattleTimer(() => flash.remove(), 500);
            }, 100);

            // 重置回合状态，开始新回合
            this.isProcessingCard = false;
            this.cardsPlayedThisTurn = 0;
            this.playerAttackedThisTurn = false;
            this.resetTurnAdvisorTelemetry();
            this.player.startTurn();
            const extraTurnBoss = this.getPrimaryBossEnemy();
            if (extraTurnBoss && extraTurnBoss.bossActState) {
                this.processBossThreeActPlayerTurnStart(extraTurnBoss);
            }
            this.emit('turnStart', { turnNumber: this.turnNumber, actor: 'player' });
            this.onBattleCommandTurnStart();

            // 启用结束回合按钮
            if (endTurnBtn) endTurnBtn.disabled = false;

            this.updateBattleUI();
            this.isTurnTransitioning = false;
            return; // 直接返回，不进入敌人回合
        }

        // 切换到敌人回合
        this.currentTurn = 'enemy';

        Utils.showBattleLog('敌人回合...');

        let shouldStartPlayerTurn = false;
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

            shouldStartPlayerTurn = true;
        } catch (error) {
            console.error('Enemy Turn Error:', error);
            Utils.showBattleLog('敌人行动异常，跳过...');
            if (!this.battleEnded) {
                shouldStartPlayerTurn = true;
            }
        } finally {
            if (this.battleEnded) return;

            // 无论如何都要恢复玩家回合

            // 新回合
            this.turnNumber++;
            this.currentTurn = 'player';
            this.isProcessingCard = false; // 关键：重置卡牌处理状态
            this.cardsPlayedThisTurn = 0;
            this.playerAttackedThisTurn = false;
            this.tacticalAdvantageTriggerCount = 0; // 重置战术优势计数
            this.resetTurnAdvisorTelemetry();

            // 环境：回合开始效果
            if (this.activeEnvironment && this.activeEnvironment.onTurnStart) {
                this.activeEnvironment.onTurnStart(this);
                if (this.checkBattleEnd()) return; // 环境伤害可能致死
            }

            this.player.startTurn();
            const nextTurnBoss = this.getPrimaryBossEnemy();
            if (nextTurnBoss && nextTurnBoss.bossActState) {
                this.processBossThreeActPlayerTurnStart(nextTurnBoss);
            }
            this.emit('turnStart', { turnNumber: this.turnNumber, actor: 'player' });
            this.onBattleCommandTurnStart();
            this.turnStartTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

            // 启用结束回合按钮
            if (endTurnBtn) endTurnBtn.disabled = false;

            this.markUIDirty();
            this.updateBattleUI();
            this.isTurnTransitioning = false;
        }
    }

    // 敌人回合行动
    async enemyTurn() {
        if (this.forceEndEnemyTurn) {
            this.forceEndEnemyTurn = false;
            Utils.showBattleLog('时间静止：敌方回合被终止');
            return;
        }

        // 敌方护盾在敌人回合开始时结算：
        // - 普通护盾重置
        // - retainBlock 生效时保留并消耗层数
        for (const enemy of this.enemies) {
            enemy.buffs = enemy.buffs || {};
            enemy.guardBreakUsedThisTurn = false;
            if (enemy.buffs.retainBlock && enemy.buffs.retainBlock > 0) {
                enemy.buffs.retainBlock--;
            } else {
                enemy.block = 0;
            }
        }

        for (let i = 0; i < this.enemies.length; i++) {
            if (this.forceEndEnemyTurn || this.battleEnded) break;
            const enemy = this.enemies[i];
            const enemyEl = document.querySelector(`.enemy[data-index="${i}"]`);
            if (enemy.currentHp <= 0) continue;

            try {
                // (Chaos Logic Removed - Replaced by new Chaos Law)

                if (enemy.isBoss && enemy.bossActState) {
                    this.processBossThreeActEnemyTurnStart(enemy);
                }

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
                if (enemy.currentHp <= 0) {
                    enemy.currentHp = 0;
                    continue;
                }

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

                // === PVP Ghost Logic ===
                if (enemy.isGhost) {
                    // Ghost takes full control of its turn
                    await enemy.takeTurn(this);
                    await Utils.sleep(300);
                    continue; // Skip standard behavior
                }

                // 13. 时光逆流 (realm 13) - 每3回合行动两次
                let actionCount = 1;
                if (this.player.realm === 13 && this.turnNumber % 3 === 0) {
                    actionCount = 2;
                    if (i === 0) Utils.showBattleLog('时光逆流：敌人速度加快！');
                }

                for (let k = 0; k < actionCount; k++) {
                    if (this.forceEndEnemyTurn || this.battleEnded) break;
                    // 执行敌人行动
                    await this.executeEnemyAction(enemy, i);

                    if (this.forceEndEnemyTurn || this.battleEnded) break;

                    // 检查玩家是否死亡
                    if (!this.player.isAlive()) {
                        this.battleEnded = true;
                        return;
                    }

                    if (k < actionCount - 1) await Utils.sleep(500);
                }

                if (this.forceEndEnemyTurn || this.battleEnded) break;

                await Utils.sleep(300);
            } catch (err) {
                console.error(`Enemy ${i} action failed:`, err);
                Utils.showBattleLog(`${enemy.name} 行动异常，跳过`);
            }
        }

        if (this.forceEndEnemyTurn) {
            this.forceEndEnemyTurn = false;
            Utils.showBattleLog('时间静止：敌方行动中断');
        }

        // 回合结束额外机制
        for (const enemy of this.enemies) {
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

        // 法宝：敌人回合结束触发（如镇魂玉）
        if (this.player.triggerTreasureEffect) {
            const aliveEnemies = this.enemies.filter(e => e.currentHp > 0);
            this.player.triggerTreasureEffect('onEnemyTurnEnd', aliveEnemies);
        }
    }



    // 处理敌人debuff
    async processEnemyDebuffs(enemy, enemyIndex) {
        const enemyEl = document.querySelector(`.enemy[data-index="${enemyIndex}"]`);

        // 流血：每回合结算并自然衰减
        if (enemy.buffs.bleed && enemy.buffs.bleed > 0) {
            const bleedDamage = enemy.buffs.bleed;
            enemy.currentHp -= bleedDamage;
            enemy.buffs.bleed = Math.max(0, enemy.buffs.bleed - 1);
            if (enemy.buffs.bleed <= 0) delete enemy.buffs.bleed;

            if (enemyEl) {
                Utils.addFlashEffect(enemyEl, '#a11');
                Utils.showFloatingNumber(enemyEl, bleedDamage, 'damage');
            }
            Utils.showBattleLog(`${enemy.name} 流血，受到 ${bleedDamage} 点伤害`);
            this.markUIDirty('enemies');
            this.updateBattleUI();
            if (this.checkBattleEnd()) return;
            await Utils.sleep(220);
        }

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

            this.markUIDirty('enemies');
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

            this.markUIDirty('enemies');
            this.updateBattleUI();

            if (this.checkBattleEnd()) return;

            await Utils.sleep(300);
        }

        if (enemy.currentHp < 0) {
            enemy.currentHp = 0;
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

    // 破盾压力：针对高护盾玩法提供对抗面
    applyGuardBreakPressure(enemy, amount) {
        if (!enemy || !this.player) return amount;
        let damage = Math.max(0, Math.floor(Number(amount) || 0));
        if (damage <= 0) return 0;
        if (enemy.guardBreakUsedThisTurn) return damage;

        const currentBlock = Math.max(0, Math.floor(Number(this.player.block) || 0));
        if (currentBlock <= 0) return damage;

        const isSunderElite = enemy.isElite && enemy.eliteType === 'sunder';
        const isBossPressure = enemy.isBoss && currentBlock >= 18 && Math.random() < 0.35;
        if (!isSunderElite && !isBossPressure) return damage;

        const shatterCap = isSunderElite ? 12 : 8;
        const shatterRate = isSunderElite ? 0.45 : 0.3;
        const shattered = Math.min(
            currentBlock,
            Math.max(3, Math.min(shatterCap, Math.floor(currentBlock * shatterRate)))
        );
        if (shattered <= 0) return damage;

        this.player.block = Math.max(0, currentBlock - shattered);
        const bonusDamage = Math.max(1, Math.floor(shattered * (isSunderElite ? 0.6 : 0.4)));
        damage += bonusDamage;
        enemy.guardBreakUsedThisTurn = true;

        const tag = isSunderElite ? '破盾词缀' : '压迫破盾';
        Utils.showBattleLog(`${enemy.name}【${tag}】击碎 ${shattered} 护盾并追加 ${bonusDamage} 伤害`);
        return damage;
    }

    // 执行敌人行动
    async executeEnemyAction(enemy, index) {
        if (!enemy || !Array.isArray(enemy.patterns) || enemy.patterns.length === 0) {
            console.warn('Enemy has no valid pattern:', enemy);
            return;
        }

        const safeIndex = this.getNextEnemyPatternIndex(enemy);
        const pattern = enemy.patterns[safeIndex] || { type: 'attack', value: 1, intent: '⚔️' };
        // 只有主行动才显示日志，避免子行动刷屏
        Utils.showBattleLog(`${enemy.name} 使用 ${pattern.intent || pattern.type || '行动'}`);

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
                let isPenetrateAttack = false;
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
                        // 如果识海为空，吞噬轮回？
                        // 简单起见，仅吞噬识海，或者洗牌后吞噬
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

                // Boss 攻击前机制（如穿透判定）
                if (enemy.isBoss && typeof BossMechanicsHandler !== 'undefined') {
                    const beforeAttack = BossMechanicsHandler.processOnAttack(this, enemy, damage, {
                        stage: 'before',
                        pattern
                    }) || {};
                    if (typeof beforeAttack.damage === 'number' && !isNaN(beforeAttack.damage)) {
                        damage = beforeAttack.damage;
                    }
                    if (beforeAttack.ignoreBlock) {
                        isTrueDamage = true;
                    }
                    if (beforeAttack.isPenetrate) {
                        isPenetrateAttack = true;
                    }
                }

                damage = this.applyGuardBreakPressure(enemy, damage);

                // 法宝：受到穿透伤害前修正（如护心镜）
                if (isPenetrateAttack && this.player.triggerTreasureValueEffect) {
                    damage = this.player.triggerTreasureValueEffect('onBeforeTakePenetrate', damage, {
                        source: enemy
                    });
                }

                // Handle True Damage
                let result;
                if (isTrueDamage) {
                    // 真实伤害仍走 takeDamage 的减伤/闪避链路，但临时绕过护盾。
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

                // Boss 攻击后机制（如吸血、禁疗）
                if (enemy.isBoss && typeof BossMechanicsHandler !== 'undefined') {
                    BossMechanicsHandler.processOnAttack(this, enemy, result.damage || 0, {
                        stage: 'after',
                        pattern,
                        ignoreBlock: isTrueDamage,
                        isPenetrate: isPenetrateAttack
                    });
                }
                break;

            case 'multiAttack':
                for (let j = 0; j < pattern.count; j++) {
                    let multiDamage = pattern.value;
                    if (enemy.buffs.strength) {
                        multiDamage += enemy.buffs.strength;
                    }

                    // 应用心魔滋生
                    multiDamage = this.dealEnemyDamage(enemy, multiDamage);
                    let multiIgnoreBlock = false;
                    let multiIsPenetrate = false;

                    if (enemy.isBoss && typeof BossMechanicsHandler !== 'undefined') {
                        const beforeMulti = BossMechanicsHandler.processOnAttack(this, enemy, multiDamage, {
                            stage: 'before',
                            pattern
                        }) || {};
                        if (typeof beforeMulti.damage === 'number' && !isNaN(beforeMulti.damage)) {
                            multiDamage = beforeMulti.damage;
                        }
                        multiIgnoreBlock = !!beforeMulti.ignoreBlock;
                        multiIsPenetrate = !!beforeMulti.isPenetrate;
                    }

                    multiDamage = this.applyGuardBreakPressure(enemy, multiDamage);

                    if (multiIsPenetrate && this.player.triggerTreasureValueEffect) {
                        multiDamage = this.player.triggerTreasureValueEffect('onBeforeTakePenetrate', multiDamage, {
                            source: enemy
                        });
                    }

                    let multiResult;
                    if (multiIgnoreBlock) {
                        const savedBlock = this.player.block;
                        this.player.block = 0;
                        multiResult = this.player.takeDamage(multiDamage);
                        this.player.block = savedBlock;
                    } else {
                        multiResult = this.player.takeDamage(multiDamage);
                    }

                    if (playerEl && !multiResult.dodged) {
                        Utils.addShakeEffect(playerEl);
                        if (multiResult.damage > 0) {
                            Utils.showFloatingNumber(playerEl, multiResult.damage, 'damage');
                            this.playerTookDamage = true;
                        }
                    }

                    if (enemy.isBoss && typeof BossMechanicsHandler !== 'undefined') {
                        BossMechanicsHandler.processOnAttack(this, enemy, multiResult.damage || 0, {
                            stage: 'after',
                            pattern,
                            ignoreBlock: multiIgnoreBlock,
                            isPenetrate: multiIsPenetrate
                        });
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
                enemy.currentHp = Math.min(enemy.maxHp || enemy.hp || enemy.currentHp, enemy.currentHp + healVal);
                Utils.showBattleLog(`${enemy.name} 恢复了 ${healVal} 点生命`);
                break;

            case 'tribulationStrike':
                // 天雷：造成真实伤害（无视护盾）
                Utils.showBattleLog(`天劫轰击！受到 ${pattern.value} 点真实伤害！`);
                if (playerEl) Utils.addFlashEffect(playerEl, 'purple');
                this.player.currentHp -= pattern.value;
                if (this.player.currentHp < 0) this.player.currentHp = 0;
                if (pattern.value > 0) {
                    this.playerTookDamage = true;
                }

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

    finalizeBattle(result) {
        if (this.battleResolution) return true;
        this.battleEnded = true;
        this.battleResolution = result;
        this.isProcessingCard = false;
        this.restoreBattlePlayerHooks();
        this.clearBattleTimers();
        this.currentCardProcessToken++;
        this.isTurnTransitioning = false;
        this.endTargetingMode();
        this.emit('battleEnded', {
            result,
            turnNumber: this.turnNumber,
            enemies: this.enemies
        });
        this.clearEventListeners();

        if (result === 'lost') {
            this.game.onBattleLost();
        } else if (result === 'won') {
            this.game.onBattleWon(this.enemies);
        }
        return true;
    }

    // 检查战斗是否结束
    checkBattleEnd() {
        if (this.battleEnded) return true;

        // 检查玩家死亡
        if (!this.player.isAlive()) {
            return this.finalizeBattle('lost');
        }

        // 检查所有敌人死亡
        const allDead = this.enemies.length > 0 && this.enemies.every(e => e.currentHp <= 0);
        if (allDead) {
            return this.finalizeBattle('won');
        }

        return this.battleEnded;
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
            if (!minion) return;
            minion.isMinion = true; // 标记为随从
            this.enemies.push(minion);
            this.updateBattleUI();

            // 随从入场特效
            this.scheduleBattleTimer(() => {
                const newEnemyEl = document.querySelector(`.enemy[data-index="${this.enemies.length - 1}"]`);
                if (newEnemyEl) Utils.addFlashEffect(newEnemyEl);
            }, 100);
        } else {
            console.warn(`Summon failed: Enemy ${enemyId} not found.`);
        }
    }


    // 检查阶段转换
    checkPhaseChange(enemy) {
        if (!enemy) return;
        if (enemy.isBoss && enemy.bossActState) {
            this.checkBossThreeActTransition(enemy);
            return;
        }
        if (!enemy.phases) return;

        // 初始化 phases
        if (typeof enemy.currentPhase === 'undefined') enemy.currentPhase = 0;
        if (enemy.currentPhase >= enemy.phases.length) return;

        const nextPhase = enemy.phases[enemy.currentPhase]; // 这里 enemy.currentPhase 初始应为 0，对应 phases[0] 即第一个转阶段配置

        // 修正逻辑：如果当前 Hp 比例低于 phase 阈值
        const enemyMaxHp = enemy.maxHp || enemy.hp || 1;
        if (nextPhase && (enemy.currentHp / enemyMaxHp) <= nextPhase.threshold) {
            // 触发转阶段
            enemy.currentPhase++; // 增加阶段计数，避免重复触发
            Utils.showBattleLog(`${enemy.name} 进入${nextPhase.name} 形态！`);

            // 更新行动模式
            if (nextPhase.patterns) {
                enemy.patterns = nextPhase.patterns;
                enemy.currentPatternIndex = 0; // 重置循环
                this.refreshEnemyTacticalPlan(enemy, true);
            }

            // 播放特效
            const enemyEl = document.querySelector(`.enemy[data-index="${this.enemies.indexOf(enemy)}"]`);
            if (enemyEl) {
                Utils.addShakeEffect(enemyEl, 'heavy');
                Utils.addFlashEffect(enemyEl, 'red'); // 狂暴红光
            }

            // 恢复少量生命?
            if (nextPhase.heal) {
                const healAmt = Math.floor(enemyMaxHp * nextPhase.heal);
                enemy.currentHp = Math.min(enemyMaxHp, enemy.currentHp + healAmt);
                Utils.showBattleLog(`${enemy.name} 恢复了力量！`);
            }
        }
    }
    // Start Targeting Mode
    startTargetingMode(cardIndex) {
        const aliveEnemies = this.enemies.filter(e => e.currentHp > 0);
        if (aliveEnemies.length === 0) {
            Utils.showBattleLog('当前没有可选目标');
            return;
        }

        this.targetingMode = true;
        this.selectedCardIndex = cardIndex;
        this.selectedCard = cardIndex;

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
        this.markUIDirty('command');
        this.updateBattleUI();
    }

    // End Targeting Mode
    endTargetingMode() {
        this.targetingMode = false;
        this.selectedCardIndex = -1;
        this.selectedCard = null;

        const enemyEls = document.querySelectorAll('.enemy');
        enemyEls.forEach(el => {
            el.classList.remove('targeting-valid');
            el.style.cursor = '';
            el.style.borderColor = '';
            el.style.boxShadow = '';
        });

        const handEl = document.getElementById('hand-cards');
        if (handEl) handEl.classList.remove('targeting-active');
        this.markUIDirty('command');
        this.updateBattleUI();
    }

    // Enemy Click Handler
    onEnemyClick(enemyIndex) {
        if (this.currentTurn !== 'player' || this.battleEnded || this.isProcessingCard) {
            return;
        }
        if (this.targetingMode && this.selectedCardIndex !== -1) {
            this.playCardOnTarget(this.selectedCardIndex, enemyIndex);
        } else {
            // Normal click
        }
    }

    resolveTacticalAdvisorRecommendation(threatProfile = null) {
        const profile = threatProfile && typeof threatProfile === 'object'
            ? threatProfile
            : this.resolveCounterplayThreatProfile();
        if (profile.needDefend) {
            return {
                id: 'guard',
                label: '守势回路',
                shortLabel: '守势',
                desc: '高爆发威胁较高，优先护盾与净化，避免被一波带走。'
            };
        }
        if (profile.needBreak) {
            return {
                id: 'break',
                label: '破阵回路',
                shortLabel: '破阵',
                desc: '敌方护盾或防守动作偏多，先破防再追击收益更高。'
            };
        }
        if (profile.needCleanse) {
            return {
                id: 'cleanse',
                label: '净域回路',
                shortLabel: '净域',
                desc: '对方控场倾向明显，优先净化并保持手牌流转。'
            };
        }
        return {
            id: 'burst',
            label: '歼灭回路',
            shortLabel: '歼灭',
            desc: '当前态势可主动压节奏，集中输出尽快收割。'
        };
    }

    resolveBattleTacticalAdvisorSnapshot(state = null, threatProfile = null) {
        const profile = threatProfile && typeof threatProfile === 'object'
            ? threatProfile
            : this.resolveCounterplayThreatProfile();
        const telemetry = this.updateTurnAdvisorAvailability(profile);
        const runtimeState = state && typeof state === 'object'
            ? state
            : (this.commandState || this.createDefaultBattleCommandState());
        const recommendation = this.resolveTacticalAdvisorRecommendation(profile);

        const threatChips = [];
        if (profile.needDefend) {
            threatChips.push({ id: 'defend', label: '高爆发压制', tip: '建议保留护盾、避免裸吃连击。' });
        }
        if (profile.needBreak) {
            threatChips.push({ id: 'break', label: '守势壁垒', tip: '敌方偏防守，优先破盾与易伤。' });
        }
        if (profile.needCleanse) {
            threatChips.push({ id: 'cleanse', label: '控场干扰', tip: '净化优先级上升，防止行动被锁。' });
        }
        if (profile.needBurst) {
            threatChips.push({ id: 'burst', label: '节奏窗口', tip: '存在可抢节奏点，适合集中爆发。' });
        }
        if (threatChips.length === 0) {
            threatChips.push({ id: 'stable', label: '态势平稳', tip: '暂无高危信号，可按构筑常规展开。' });
        }

        const points = Math.max(0, Math.floor(Number(runtimeState.points) || 0));
        const commands = Array.isArray(runtimeState.commands) ? runtimeState.commands : [];
        const commandMeta = commands.map((command) => {
            const cost = this.resolveBattleCommandEffectiveCost(command);
            const cooldownRemaining = Math.max(0, Math.floor(Number(command?.cooldownRemaining) || 0));
            const ready = (
                this.currentTurn === 'player'
                && !this.battleEnded
                && !this.isProcessingCard
                && !this.isTurnTransitioning
                && cooldownRemaining === 0
                && points >= cost
            );
            return { command, cost, cooldownRemaining, ready };
        });

        const readyCount = commandMeta.filter((item) => item.ready).length;
        let readiness = '当前无可用指令，建议先用卡牌控节奏并攒槽。';
        if (this.battleEnded) {
            readiness = '战斗已结束，战术助手等待下一场战斗。';
        } else if (this.currentTurn !== 'player') {
            readiness = '敌方回合中，优先观察意图并预留反击资源。';
        } else if (readyCount > 0) {
            readiness = `当前可用指令 ${readyCount} 项，建议优先 ${recommendation.shortLabel} 回路。`;
        } else {
            let minGap = Infinity;
            let minCooldown = Infinity;
            commandMeta.forEach((item) => {
                if (!item) return;
                const gap = Math.max(0, item.cost - points);
                minGap = Math.min(minGap, gap);
                if (item.cooldownRemaining > 0) {
                    minCooldown = Math.min(minCooldown, item.cooldownRemaining);
                }
            });
            if (Number.isFinite(minGap) && minGap > 0) {
                readiness = `指令槽不足，还差 ${minGap} 点可启动关键指令。`;
            } else if (Number.isFinite(minCooldown)) {
                readiness = `暂无可用指令，最短冷却剩余 ${minCooldown} 回合。`;
            }
        }

        const matrixMeta = commandMeta.find((item) => item && item.command && item.command.id === 'resonance_matrix_order') || null;
        const endlessActive = !!(this.game && typeof this.game.isEndlessActive === 'function' && this.game.isEndlessActive());
        let matrixHint = '';
        let formationHint = '';
        const cardPlanMeta = this.resolveBattleTacticalCardPlanMeta(profile, recommendation);
        const cardPlanHint = cardPlanMeta && typeof cardPlanMeta.text === 'string'
            ? cardPlanMeta.text
            : '';
        const cardPlanSteps = cardPlanMeta && Array.isArray(cardPlanMeta.steps)
            ? cardPlanMeta.steps
                .filter((item) => item && Number.isFinite(Number(item.index)))
                .slice(0, 2)
                .map((item) => ({
                    index: Math.max(0, Math.floor(Number(item.index) || 0)),
                    name: String(item.name || ''),
                    reason: String(item.reason || '')
                }))
            : [];
        const tempoRail = this.resolveBattleTempoRail(profile, recommendation);
        const statusIslands = this.resolveBattleStatusIslands(runtimeState, profile);
        const executionChain = this.resolveBattleAdvisorExecutionChain(profile, recommendation, cardPlanSteps);
        telemetry.suggestedStepKeys = cardPlanSteps
            .map((item) => this.getAdvisorCardKey(Array.isArray(this.player?.hand) ? this.player.hand[item.index] : null))
            .filter(Boolean);
        let lastModeLabel = '';
        let pendingModeLabel = '';
        const matrixControls = [];
        const squad = this.activeSquadEcology && typeof this.activeSquadEcology === 'object'
            ? this.activeSquadEcology
            : null;

        if (squad && squad.id) {
            const formationHintMap = {
                squad_pincer_hunt: '敌阵画像：钳袭编队偏多段抢节奏，先压前锋并保留护盾，避免被连段补刀。',
                squad_bulwark_web: '敌阵画像：壁垒联阵会反复堆防，先破盾再爆发，破甲与易伤价值更高。',
                squad_hex_weave: '敌阵画像：咒织链阵会持续施压减益，净化与抽牌优先，避免行动链断裂。',
                squad_relay_cascade: '敌阵画像：潮汐接力存在明显波段，敌方回防回合是你反打窗口。'
            };
            formationHint = formationHintMap[squad.id] || `敌阵画像：${squad.name || squad.tag || '协同编队'}，建议优先拆解阵核与关键功能位。`;
        }

        if (endlessActive && this.game && typeof this.game.getEndlessCycleThemeProfile === 'function') {
            const theme = this.game.getEndlessCycleThemeProfile();
            if (theme && typeof theme === 'object') {
                const directive = String(theme.enemyDirective || 'balanced');
                const directiveHintMap = {
                    forge: '该轮段强调前压锻潮，建议保留中费护盾抵消开场压制。',
                    swarm: '该轮段偏连段围猎，优先削减敌方行动数并抢回合节奏。',
                    counter: '该轮段强化反制与减益，净化和免疫优先级显著上升。',
                    frenzy: '该轮段爆发窗口更短，尽量在两回合内建立斩杀线。',
                    bastion: '该轮段偏防守拉扯，留一段续航并分批释放爆发更稳。'
                };
                const themeHint = directiveHintMap[directive]
                    || '该轮段节奏较均衡，可按当前构筑正常展开。';
                const themeLabel = theme.shortName || theme.name || '稳衡';
                if (formationHint) {
                    formationHint = `${formationHint} 轮段研判：${themeLabel} · ${themeHint}`;
                } else {
                    formationHint = `轮段研判：${themeLabel} · ${themeHint}`;
                }
            }
        }

        if (matrixMeta) {
            const modeId = String(runtimeState.lastResonanceMatrixMode || 'auto');
            const modeProfile = this.getResonanceMatrixModeProfile(modeId);
            if (modeProfile && modeProfile.label) {
                lastModeLabel = modeProfile.label;
            }
            const pendingModeId = this.resolvePendingResonanceMatrixSignalMode();
            const pendingMode = this.getResonanceMatrixModeProfile(pendingModeId);
            pendingModeLabel = pendingModeId === 'auto'
                ? '自动判断'
                : `已预设 ${pendingMode.label}`;
            const modeChoices = [
                { id: 'auto', label: '自适应' },
                { id: 'guard', label: '守势' },
                { id: 'break', label: '破阵' },
                { id: 'cleanse', label: '净域' },
                { id: 'burst', label: '歼灭' }
            ];
            modeChoices.forEach((choice) => {
                matrixControls.push({
                    ...choice,
                    active: choice.id === pendingModeId
                });
            });
            if (matrixMeta.cooldownRemaining > 0) {
                matrixHint = `命环共振冷却中（${matrixMeta.cooldownRemaining} 回合）。`;
            } else if (matrixMeta.cost > points) {
                matrixHint = `命环共振需 ${matrixMeta.cost} 槽，当前还差 ${Math.max(0, matrixMeta.cost - points)}。`;
            } else {
                matrixHint = `命环共振可发动，建议走 ${recommendation.shortLabel} 回路。`;
            }
        } else if (endlessActive) {
            matrixHint = '本场未抽到命环共振，先用其他战场指令稳住节奏。';
        }

        return {
            recommendation,
            threatChips,
            readiness,
            formationHint,
            cardPlanHint,
            cardPlanSteps,
            tempoRail,
            statusIslands,
            executionChain,
            matrixHint,
            lastModeLabel,
            pendingModeLabel,
            matrixControls
        };
    }

    syncTacticalAdvisorPresentation() {
        const panel = document.getElementById('battle-command-panel');
        const advisor = panel && typeof panel.querySelector === 'function'
            ? panel.querySelector('#battle-tactical-advisor')
            : null;
        if (!panel || !advisor) return false;

        const expanded = !this.tacticalAdvisorCollapsed || this.tacticalAdvisorHoverExpanded;
        advisor.classList.toggle('collapsed', !expanded);
        advisor.classList.toggle('hover-expanded', !!this.tacticalAdvisorHoverExpanded);

        const body = advisor.querySelector('.battle-advisor-body');
        if (body) {
            body.hidden = !expanded;
        }

        const toggleBtn = panel.querySelector('.battle-advisor-toggle');
        if (toggleBtn) {
            toggleBtn.textContent = expanded ? '收起助手' : '展开助手';
            toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        }

        return true;
    }

    clearBattleCommandPanelDragHandlers() {
        if (typeof window === 'undefined') return;
        if (this.boundBattleCommandDragMove) {
            window.removeEventListener('pointermove', this.boundBattleCommandDragMove);
            this.boundBattleCommandDragMove = null;
        }
        if (this.boundBattleCommandDragEnd) {
            window.removeEventListener('pointerup', this.boundBattleCommandDragEnd);
            window.removeEventListener('pointercancel', this.boundBattleCommandDragEnd);
            this.boundBattleCommandDragEnd = null;
        }
        this.battleCommandDragState = null;
        const panel = document.getElementById('battle-command-panel');
        if (panel) panel.classList.remove('dragging');
    }

    clampBattleCommandPanelPosition(left, top, width, height) {
        const viewportWidth = typeof window !== 'undefined' ? Math.max(0, window.innerWidth || 0) : 0;
        const viewportHeight = typeof window !== 'undefined' ? Math.max(0, window.innerHeight || 0) : 0;
        const safeWidth = Math.max(0, Number(width) || 0);
        const safeHeight = Math.max(0, Number(height) || 0);
        const gutter = 8;
        const maxLeft = Math.max(gutter, viewportWidth - safeWidth - gutter);
        const maxTop = Math.max(gutter, viewportHeight - safeHeight - gutter);
        return {
            left: Math.min(Math.max(gutter, Math.round(Number(left) || 0)), maxLeft),
            top: Math.min(Math.max(gutter, Math.round(Number(top) || 0)), maxTop)
        };
    }

    applyBattleCommandPanelPosition(panel) {
        if (!panel) return false;
        if (this.shouldUseCompactBattleHud()) {
            panel.style.left = '';
            panel.style.top = '';
            panel.style.transform = '';
            panel.classList.remove('custom-position', 'dragging');
            return false;
        }

        const position = this.battleCommandPanelPosition;
        if (!position || !Number.isFinite(position.left) || !Number.isFinite(position.top)) {
            panel.style.left = '';
            panel.style.top = '';
            panel.style.transform = '';
            panel.classList.remove('custom-position');
            return false;
        }

        const rect = panel.getBoundingClientRect();
        const next = this.clampBattleCommandPanelPosition(position.left, position.top, rect.width || panel.offsetWidth, rect.height || panel.offsetHeight);
        this.battleCommandPanelPosition = next;
        panel.style.left = `${next.left}px`;
        panel.style.top = `${next.top}px`;
        panel.style.transform = 'none';
        panel.classList.add('custom-position');
        return true;
    }

    beginBattleCommandPanelDrag(event) {
        if (this.shouldUseCompactBattleHud() || typeof window === 'undefined') return false;
        if (!event || (typeof event.button === 'number' && event.button !== 0)) return false;

        const handle = event.target && typeof event.target.closest === 'function'
            ? event.target.closest('.battle-advisor-drag-handle, .battle-advisor-header')
            : null;
        const panel = document.getElementById('battle-command-panel');
        if (!handle || !panel) return false;
        if (event.target && typeof event.target.closest === 'function' && event.target.closest('.battle-advisor-cardstep-btn, .battle-advisor-matrix-btn, .battle-advisor-toggle')) {
            return false;
        }

        const rect = panel.getBoundingClientRect();
        const clamped = this.clampBattleCommandPanelPosition(rect.left, rect.top, rect.width || panel.offsetWidth, rect.height || panel.offsetHeight);
        this.battleCommandPanelPosition = clamped;
        panel.style.left = `${clamped.left}px`;
        panel.style.top = `${clamped.top}px`;
        panel.style.transform = 'none';
        panel.classList.add('custom-position', 'dragging');

        this.tacticalAdvisorHoverExpanded = false;
        this.tacticalAdvisorHoverLocked = true;
        this.syncTacticalAdvisorPresentation();

        const startX = Number(event.clientX) || 0;
        const startY = Number(event.clientY) || 0;
        this.battleCommandDragState = {
            pointerId: event.pointerId,
            startX,
            startY,
            left: clamped.left,
            top: clamped.top
        };

        const onMove = (moveEvent) => {
            if (!this.battleCommandDragState) return;
            if (this.battleCommandDragState.pointerId != null && moveEvent.pointerId != null && moveEvent.pointerId !== this.battleCommandDragState.pointerId) {
                return;
            }
            const dx = (Number(moveEvent.clientX) || 0) - this.battleCommandDragState.startX;
            const dy = (Number(moveEvent.clientY) || 0) - this.battleCommandDragState.startY;
            const next = this.clampBattleCommandPanelPosition(
                this.battleCommandDragState.left + dx,
                this.battleCommandDragState.top + dy,
                rect.width || panel.offsetWidth,
                rect.height || panel.offsetHeight
            );
            this.battleCommandPanelPosition = next;
            panel.style.left = `${next.left}px`;
            panel.style.top = `${next.top}px`;
            panel.style.transform = 'none';
        };

        const onEnd = (endEvent) => {
            if (this.battleCommandDragState && this.battleCommandDragState.pointerId != null && endEvent.pointerId != null && endEvent.pointerId !== this.battleCommandDragState.pointerId) {
                return;
            }
            if (handle && typeof handle.releasePointerCapture === 'function' && event.pointerId != null) {
                try {
                    handle.releasePointerCapture(event.pointerId);
                } catch (_) {}
            }
            this.clearBattleCommandPanelDragHandlers();
        };

        this.boundBattleCommandDragMove = onMove;
        this.boundBattleCommandDragEnd = onEnd;
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onEnd);
        window.addEventListener('pointercancel', onEnd);

        if (typeof handle.setPointerCapture === 'function' && event.pointerId != null) {
            try {
                handle.setPointerCapture(event.pointerId);
            } catch (_) {}
        }

        event.preventDefault();
        event.stopPropagation();
        return true;
    }

    toggleTacticalAdvisor() {
        this.tacticalAdvisorCollapsed = !this.tacticalAdvisorCollapsed;
        this.tacticalAdvisorHoverExpanded = false;
        this.tacticalAdvisorHoverLocked = this.tacticalAdvisorCollapsed;
        if (!this.syncTacticalAdvisorPresentation()) {
            this.markUIDirty('command');
            this.updateBattleUI();
        }
    }

    setTacticalAdvisorHoverExpanded(active = false) {
        const next = !!active;
        if (this.shouldUseCompactBattleHud() || !this.tacticalAdvisorCollapsed || this.battleCommandDragState) return;
        if (next && this.tacticalAdvisorHoverLocked) return;
        if (!next) this.tacticalAdvisorHoverLocked = false;
        if (this.tacticalAdvisorHoverExpanded === next) return;
        this.tacticalAdvisorHoverExpanded = next;
        if (!this.syncTacticalAdvisorPresentation()) {
            this.markUIDirty('command');
            this.updateBattleUI();
        }
    }

    updateBattleCommandUI() {
        const panelId = 'battle-command-panel';
        let panel = document.getElementById(panelId);
        const state = this.commandState || this.createDefaultBattleCommandState();

        if (!state.enabled || !Array.isArray(state.commands) || state.commands.length === 0) {
            if (panel && panel.parentElement) {
                panel.parentElement.removeChild(panel);
            }
            return;
        }

        if (!panel) {
            panel = document.createElement('div');
            panel.id = panelId;
            panel.className = 'battle-command-panel';
            const battleContainer = document.querySelector('#battle-screen .battle-container') || document.querySelector('.battle-container');
            if (battleContainer) {
                const envEl = document.getElementById('battle-environment');
                const missionEl = document.getElementById('legacy-mission-tracker');
                if (missionEl && missionEl.parentElement === battleContainer) {
                    missionEl.insertAdjacentElement('afterend', panel);
                } else if (envEl && envEl.parentElement === battleContainer) {
                    envEl.insertAdjacentElement('afterend', panel);
                } else {
                    battleContainer.insertBefore(panel, battleContainer.firstChild);
                }
            }
        }
        if (!panel) return;

        const escapeHtml = (value) => String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        const points = Math.max(0, Math.floor(Number(state.points) || 0));
        const maxPoints = Math.max(1, Math.floor(Number(state.maxPoints) || 12));
        const progress = Math.max(0, Math.min(100, Math.round((points / maxPoints) * 100)));
        const threatProfile = this.resolveCounterplayThreatProfile();
        const advisor = this.resolveBattleTacticalAdvisorSnapshot(state, threatProfile);

        const commandButtons = state.commands.map((command) => {
            const cost = this.resolveBattleCommandEffectiveCost(command);
            const cooldownRemaining = Math.max(0, Math.floor(Number(command.cooldownRemaining) || 0));
            const disabled = this.currentTurn !== 'player'
                || this.battleEnded
                || this.isProcessingCard
                || this.isTurnTransitioning
                || cooldownRemaining > 0
                || points < cost;
            const statusText = cooldownRemaining > 0
                ? `冷却 ${cooldownRemaining}`
                : (points >= cost ? '可发动' : '槽能不足');
            const classes = [
                'battle-command-btn',
                cooldownRemaining > 0 ? 'cooldown' : '',
                points >= cost && cooldownRemaining === 0 ? 'ready' : '',
                disabled ? 'disabled' : ''
            ].filter(Boolean).join(' ');

            return `
                <button class="${classes}" ${disabled ? 'disabled' : ''}
                        onclick="window.game && game.battle && game.battle.activateBattleCommand('${escapeHtml(command.id)}')"
                        title="${escapeHtml(command.desc)}">
                    <span class="battle-command-head">
                        <span class="battle-command-icon">${escapeHtml(command.icon)}</span>
                        <span class="battle-command-name">${escapeHtml(command.name)}</span>
                    </span>
                    <span class="battle-command-meta">消耗 ${cost} ｜ ${escapeHtml(statusText)}</span>
                </button>
            `;
        }).join('');

        const threatChips = advisor.threatChips.map((chip) => `
            <span class="battle-advisor-threat-chip chip-${escapeHtml(chip.id)}"
                  title="${escapeHtml(chip.tip)}">${escapeHtml(chip.label)}</span>
        `).join('');

        const matrixControls = Array.isArray(advisor.matrixControls)
            ? advisor.matrixControls.map((mode) => `
                <button type="button"
                        class="battle-advisor-matrix-btn ${mode.active ? 'active' : ''}"
                        data-mode="${escapeHtml(mode.id)}"
                        onclick="window.game && game.battle && game.battle.setResonanceMatrixSignalMode('${escapeHtml(mode.id)}')">
                    ${escapeHtml(mode.label)}
                </button>
            `).join('')
            : '';
        const cardPlanSteps = Array.isArray(advisor.cardPlanSteps)
            ? advisor.cardPlanSteps.map((step, idx) => `
                <button type="button"
                        class="battle-advisor-cardstep-btn"
                        data-card-index="${Math.max(0, Math.floor(Number(step.index) || 0))}"
                        onclick="window.game && game.battle && game.battle.previewAdvisorCard(${Math.max(0, Math.floor(Number(step.index) || 0))})"
                        title="${escapeHtml(step.reason || '')}">
                    ${idx === 0 ? '①' : '②'} ${escapeHtml(step.name || `手牌${idx + 1}`)}
                </button>
            `).join('')
            : '';
        const tempoRail = advisor.tempoRail && Array.isArray(advisor.tempoRail.segments)
            ? advisor.tempoRail.segments.map((segment) => `
                <div class="battle-advisor-tempo-segment ${segment.active ? 'active' : ''} tone-${escapeHtml(segment.id)}"
                     title="${escapeHtml(segment.tip || '')}">
                    <div class="battle-advisor-tempo-row">
                        <span class="battle-advisor-tempo-label">${escapeHtml(segment.label)}</span>
                        <span class="battle-advisor-tempo-score">${Math.max(0, Math.floor(Number(segment.score) || 0))}%</span>
                    </div>
                    <div class="battle-advisor-tempo-track">
                        <span class="battle-advisor-tempo-fill" style="width:${Math.max(0, Math.min(100, Math.floor(Number(segment.score) || 0)))}%"></span>
                    </div>
                </div>
            `).join('')
            : '';
        const statusIslands = Array.isArray(advisor.statusIslands)
            ? advisor.statusIslands.map((item) => `
                <span class="battle-advisor-status-chip tone-${escapeHtml(item.tone || item.id || 'state')}"
                      title="${escapeHtml(item.label)}">
                    <span class="battle-advisor-status-label">${escapeHtml(item.label)}</span>
                    <span class="battle-advisor-status-value">${escapeHtml(item.value)}</span>
                </span>
            `).join('')
            : '';
        const executionChainItems = Array.isArray(advisor.executionChain?.items)
            ? advisor.executionChain.items.map((item) => `
                <span class="battle-advisor-chain-step">${escapeHtml(item)}</span>
            `).join('<span class="battle-advisor-chain-arrow">→</span>')
            : '';
        const executionChainTags = Array.isArray(advisor.executionChain?.tags)
            ? advisor.executionChain.tags.map((tag) => `
                <span class="battle-advisor-chain-tag tone-${escapeHtml(tag.id || 'tag')}"
                      title="${escapeHtml(tag.tip || '')}">${escapeHtml(tag.label || '')}</span>
            `).join('')
            : '';
        const executionChainIndex = advisor.executionChain && advisor.executionChain.index != null && Number.isFinite(Number(advisor.executionChain.index))
            ? Math.floor(Number(advisor.executionChain.index))
            : -1;

        const advisorExpanded = !this.tacticalAdvisorCollapsed || this.tacticalAdvisorHoverExpanded;
        const advisorBody = `
                ${tempoRail ? `
                    <div class="battle-advisor-block battle-advisor-tempo-block">
                        <div class="battle-advisor-section-head">
                            <span class="battle-advisor-section-title">回合节奏条</span>
                            <span class="battle-advisor-section-note">${escapeHtml(advisor.tempoRail?.summary || '')}</span>
                        </div>
                        <div class="battle-advisor-tempo-grid">${tempoRail}</div>
                    </div>
                ` : ''}
                ${statusIslands ? `
                    <div class="battle-advisor-block battle-advisor-status-block">
                        <div class="battle-advisor-section-head">
                            <span class="battle-advisor-section-title">关键状态岛</span>
                            <span class="battle-advisor-section-note">把资源、共鸣与 Boss 节奏聚合查看。</span>
                        </div>
                        <div class="battle-advisor-status-strip">${statusIslands}</div>
                    </div>
                ` : ''}
                <div class="battle-advisor-threat-list">${threatChips}</div>
                <p class="battle-advisor-line battle-advisor-recommend">建议回路：${escapeHtml(advisor.recommendation.label)} · ${escapeHtml(advisor.recommendation.desc)}</p>
                <p class="battle-advisor-line battle-advisor-readiness">${escapeHtml(advisor.readiness)}</p>
                ${advisor.formationHint ? `<p class="battle-advisor-line battle-advisor-formation">${escapeHtml(advisor.formationHint)}</p>` : ''}
                ${advisor.cardPlanHint ? `<p class="battle-advisor-line battle-advisor-cardplan">${escapeHtml(advisor.cardPlanHint)}</p>` : ''}
                ${cardPlanSteps ? `<div class="battle-advisor-cardplan-steps">${cardPlanSteps}</div>` : ''}
                ${executionChainItems ? `
                    <div class="battle-advisor-block battle-advisor-chain"
                         data-card-index="${executionChainIndex}">
                        <div class="battle-advisor-section-head">
                            <span class="battle-advisor-section-title">${escapeHtml(advisor.executionChain?.kicker || '执行链')}</span>
                            <span class="battle-advisor-section-note">${escapeHtml(advisor.executionChain?.summary || '')}</span>
                        </div>
                        <div class="battle-advisor-chain-title">${escapeHtml(advisor.executionChain?.title || '')}</div>
                        ${executionChainTags ? `<div class="battle-advisor-chain-tags">${executionChainTags}</div>` : ''}
                        <div class="battle-advisor-chain-steps">${executionChainItems}</div>
                    </div>
                ` : ''}
                ${advisor.matrixHint ? `<p class="battle-advisor-line battle-advisor-matrix">${escapeHtml(advisor.matrixHint)}</p>` : ''}
                ${advisor.pendingModeLabel ? `<p class="battle-advisor-line battle-advisor-pending-mode">模式预设：${escapeHtml(advisor.pendingModeLabel)}</p>` : ''}
                ${matrixControls ? `<div class="battle-advisor-matrix-controls">${matrixControls}</div>` : ''}
                ${matrixControls ? '<p class="battle-advisor-line battle-advisor-hotkey">快捷预设：H开关助手 · 1自适应 2守势 3破阵 4净域 5歼灭</p>' : '<p class="battle-advisor-line battle-advisor-hotkey">快捷预设：H 开关助手</p>'}
                ${advisor.lastModeLabel ? `<p class="battle-advisor-line battle-advisor-last">上次命环模式：${escapeHtml(advisor.lastModeLabel)}</p>` : ''}
            `;

        panel.innerHTML = `
            <div class="battle-command-header">
                <span class="battle-command-title">战场指令</span>
                <span class="battle-command-right">
                    <span class="battle-command-points">${points}/${maxPoints}</span>
                    <button type="button" class="battle-advisor-toggle"
                            onclick="window.game && game.battle && game.battle.toggleTacticalAdvisor()">
                        ${advisorExpanded ? '收起助手' : '展开助手'}
                    </button>
                </span>
            </div>
            <div class="battle-command-track">
                <div class="battle-command-fill" style="width:${progress}%"></div>
            </div>
            <div class="battle-command-list">${commandButtons}</div>
            <section id="battle-tactical-advisor"
                     class="battle-tactical-advisor ${advisorExpanded ? '' : 'collapsed'} ${this.tacticalAdvisorHoverExpanded ? 'hover-expanded' : ''}">
                <div class="battle-advisor-header">
                    <button type="button"
                            class="battle-advisor-drag-handle"
                            aria-label="拖动战术助手"
                            title="拖动战术助手">⠿</button>
                    <span class="battle-advisor-title">战术助手</span>
                </div>
                <div class="battle-advisor-body" ${advisorExpanded ? '' : 'hidden'}>
                    ${advisorBody}
                </div>
            </section>
        `;

        if (typeof panel.querySelector !== 'function') return;

        const advisorEl = panel.querySelector('#battle-tactical-advisor');
        const dragHandle = panel.querySelector('.battle-advisor-drag-handle');
        this.applyBattleCommandPanelPosition(panel);

        if (dragHandle) {
            dragHandle.onpointerdown = (event) => this.beginBattleCommandPanelDrag(event);
        }
        const advisorHeader = panel.querySelector('.battle-advisor-header');
        if (advisorHeader) {
            advisorHeader.onpointerdown = (event) => this.beginBattleCommandPanelDrag(event);
        }

        if (advisorEl) {
            advisorEl.onmouseenter = null;
            advisorEl.onmouseleave = null;
        }
        panel.onmouseenter = null;
        panel.onmouseleave = null;
    }


    // 更新环境UI
    updateEnvironmentUI() {
        const envEl = document.getElementById('battle-environment');
        if (!envEl) return;

        const envName = this.activeEnvironment ? this.activeEnvironment.name : '';
        const envIcon = this.activeEnvironment ? this.activeEnvironment.icon : '';
        const envDesc = this.activeEnvironment ? this.activeEnvironment.description : '';
        const encounter = this.activeEncounterTheme || null;

        const escapeHtml = (value) => String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        const squad = this.activeSquadEcology || null;
        if (this.activeEnvironment || encounter || squad) {
            envEl.style.display = 'flex';
            envEl.innerHTML = `
                ${this.activeEnvironment
                ? `<span class="env-main"><span class="env-icon">${envIcon}</span><span class="env-name">${escapeHtml(envName)}</span></span>`
                : ''}
                ${encounter
                ? `<span class="encounter-theme-chip" title="${escapeHtml(encounter.description)}">
                        <span class="encounter-icon">${escapeHtml(encounter.icon)}</span>
                        <span class="encounter-name">遭遇·${escapeHtml(encounter.name)} ${'I'.repeat(Math.max(1, Math.min(3, Number(encounter.tierStage) || 1)))}阶</span>
                    </span>`
                : ''}
                ${squad
                ? `<span class="squad-formation-chip" title="${escapeHtml(squad.desc || '敌方编队协同中')}">
                        <span class="squad-icon">⛭</span>
                        <span class="squad-name">敌阵·${escapeHtml(squad.name || squad.tag || '协同')} ${Math.max(1, Math.floor(Number(squad.count) || 1))}体</span>
                    </span>`
                : ''}
`;
            const titleSegments = [];
            if (envDesc) titleSegments.push(`环境：${envDesc}`);
            if (encounter && encounter.description) {
                const stage = Math.max(1, Math.min(3, Number(encounter.tierStage) || 1));
                titleSegments.push(`遭遇（${'I'.repeat(stage)}阶）：${encounter.description}`);
            }
            if (squad && squad.desc) {
                titleSegments.push(`敌阵：${squad.desc}`);
            }
            envEl.title = titleSegments.join(' ｜ ');
        } else {
            envEl.style.display = 'none';
        }
    }
}
