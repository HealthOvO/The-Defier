/**
 * The Defier - 玩家系统
 */

class Player {
    constructor() {
        this.reset();
    }

    reset(characterId = 'linFeng') {
        const charData = CHARACTERS[characterId] || CHARACTERS['linFeng'];
        this.characterId = characterId;

        // 基础属性
        this.maxHp = charData.stats.maxHp;
        this.currentHp = this.maxHp;
        this.block = 0;
        this.gold = charData.stats.gold;

        // 战斗属性
        this.baseEnergy = charData.stats.energy;
        this.currentEnergy = this.baseEnergy;
        this.drawCount = 5;

        // 奶糖 (Milk Candy) - 抽牌资源
        this.milkCandy = 0;
        this.maxMilkCandy = 3; // 初始上限

        // 主动技能
        this.activeSkill = null;
        this.skillLevel = 0; // 0=Locked, 1=Unlocked, 2=Upgraded, 3=Max
        this.skillCooldown = 0;
        this.maxCooldown = 0;

        if (charData.activeSkillId && typeof SKILLS !== 'undefined' && SKILLS[charData.activeSkillId]) {
            this.activeSkill = SKILLS[charData.activeSkillId];
            this.skillLevel = 0; // Default Locked
            this.maxCooldown = this.activeSkill.cooldown;

            // Debug: If realm is already high (e.g. loaded game), check unlock immediately
            // But reset happens before load. Load will overwrite this.
        }

        // 牌组
        this.deck = [];
        this.hand = [];
        this.drawPile = [];
        this.discardPile = [];
        this.exhaustPile = [];

        // Map Persistence (Per-Realm State)
        this.realmMaps = {};

        // 状态
        this.buffs = {};

        // 永久属性加成 (来自事件)
        this.permaBuffs = {
            maxHp: 0,
            energy: 0,
            draw: 0,
            strength: 0,
            defense: 0
        };

        // 遗物
        this.relic = charData.relic;

        // 法宝
        // 法宝
        this.collectedTreasures = []; // 所有拥有的法宝
        this.equippedTreasures = [];  // 当前装备的法宝
        this.treasures = this.equippedTreasures; // 兼容旧引用的Alias

        this.timeStopTriggered = false; // Reset time stop cheat death per battle (via reset)
        this.resurrectCount = 0;
        this.maxRealmReached = 1; // Track highest realm reached

        // 命环
        if (typeof MutatedRing !== 'undefined' && characterId === 'linFeng') {
            this.fateRing = new MutatedRing(this);
        } else if (typeof SealedRing !== 'undefined' && characterId === 'xiangYe') {
            this.fateRing = new SealedRing(this);
        } else if (typeof KarmaRing !== 'undefined' && characterId === 'wuYu') {
            this.fateRing = new KarmaRing(this);
        } else if (typeof AnalysisRing !== 'undefined' && characterId === 'yanHan') {
            this.fateRing = new AnalysisRing(this);
        } else if (typeof FateRing !== 'undefined') {
            this.fateRing = new FateRing(this);
        } else {
            // Fallback if class not loaded yet
            this.fateRing = {
                level: 0,
                name: '残缺印记',
                exp: 0,
                slots: 0,
                loadedLaws: [],
                path: 'crippled',
                unlockedPaths: ['crippled']
            };
        }

        // 收集的法则
        this.collectedLaws = [];

        // 激活的共鸣
        this.activeResonances = [];

        // 游戏进度
        this.realm = 1;
        this.floor = 0;
        this.enemiesDefeated = 0;
        this.lawsCollected = 0;

        // 初始化牌组
        this.initializeDeck(charData.deck);

        // 初始化技能
        if (charData.activeSkillId) {
            this.initSkill(charData.activeSkillId);
        }
    }

    initSkill(skillId) {
        if (!SKILLS[skillId]) return;
        this.activeSkill = { ...SKILLS[skillId] };
        this.maxCooldown = this.activeSkill.cooldown;
        this.skillCooldown = 0; // Ready at start? Or start on cooldown? Let's say Ready.
    }

    unlockUltimate(level) {
        if (level > this.skillLevel) {
            this.skillLevel = level;
            // FIX: Safely log only if Utils and UI are ready. 
            // This prevents crashes during loadGame if DOM isn't ready.
            if (typeof Utils !== 'undefined' && document.getElementById('battle-log')) {
                Utils.showBattleLog(`境界突破！主动技能等级提升至 Lv.${level}`);
            }
            // May reduce cooldown or enhance effect in future
        }
    }

    activateSkill(battle) {
        if (!this.activeSkill || this.skillLevel <= 0) {
            Utils.showBattleLog('尚未解锁主动技能！');
            return false;
        }
        if (this.skillCooldown > 0) {
            Utils.showBattleLog(`技能冷却中... (${this.skillCooldown})`);
            return false;
        }

        const success = this.activeSkill.effect(this, battle);
        if (success) {
            this.skillCooldown = this.maxCooldown;
            // Level bonus: Lv 2 -> Cooldown -1, Lv 3 -> Cooldown -2?
            // Simple implementation for now.
            if (this.skillLevel >= 2) this.skillCooldown = Math.max(1, this.maxCooldown - 1);
            if (this.skillLevel >= 3) this.skillCooldown = Math.max(1, this.maxCooldown - 2);

            Utils.showBattleLog(`释放终极技能：${this.activeSkill.name}！`);
            return true;
        }
        return false;
    }

    initializeDeck(deckList) {
        const list = deckList || STARTER_DECK;
        this.deck = list.map(cardId => {
            const card = CARDS[cardId];
            // Fix: Use deep copy to prevent shared state between same cards
            if (!card) return null;
            const newCard = JSON.parse(JSON.stringify(card));
            newCard.instanceId = this.generateCardId();
            return newCard;
        }).filter(Boolean);
    }

    generateCardId() {
        return 'card_' + Math.random().toString(36).substr(2, 9);
    }

    // 重新计算属性
    recalculateStats() {
        // 检查共鸣状态
        this.checkResonances();

        const charData = CHARACTERS[this.characterId || 'linFeng'];
        if (!charData) return;

        // 安全检查：如果等级>=1但路径仍为crippled，强制觉醒
        // 这是为了修复旧存档可能存在的状态不一致问题
        if (this.fateRing.level >= 1 && this.fateRing.path === 'crippled') {
            this.fateRing.path = 'awakened';
            // 可能需要通知用户或log，但recalculateStats调用频繁，保持静默
        }

        // 1. 基础属性
        let newMaxHp = charData.stats.maxHp;
        let newBaseEnergy = charData.stats.energy;
        let newDrawCount = 5;

        // 2. 命环等级及镶嵌加成
        if (this.fateRing && this.fateRing.getStatsBonus) {
            const ringBonus = this.fateRing.getStatsBonus();
            newMaxHp += ringBonus.maxHp;
            newBaseEnergy += ringBonus.energy;
            newDrawCount += ringBonus.draw;
        } else {
            // 旧逻辑完全保留作为Fallback，但在新类生效时应该不会走这里
            const levelData = FATE_RING.levels[this.fateRing.level];
            if (levelData && levelData.bonus) {
                if (levelData.bonus.maxHp) newMaxHp += levelData.bonus.maxHp;
                if (levelData.bonus.energy) newBaseEnergy += levelData.bonus.energy;
                if (levelData.bonus.draw) newDrawCount += levelData.bonus.draw;
            }
        }

        // 3. 命环路径加成
        if (this.fateRing.path && FATE_RING.paths[this.fateRing.path]) {
            const path = FATE_RING.paths[this.fateRing.path];
            if (path.bonus) {
                if (path.bonus.type === 'hpBonus') newMaxHp += path.bonus.value;
                if (path.bonus.type === 'energyBonus') newBaseEnergy += path.bonus.value;
                if (path.bonus.type === 'drawBonus') newDrawCount += path.bonus.value;

                // 复合加成
                if (path.bonus.type === 'ultimate') {
                    // 真·逆天之环并没有直接属性加成，主要是机制加成，但如果有可以在这里加
                }
            }
        }

        // 4. 永久属性加成 (Perma Buffs)
        if (this.permaBuffs) {
            newMaxHp += (this.permaBuffs.maxHp || 0);
            newBaseEnergy += (this.permaBuffs.energy || 0);
            newDrawCount += (this.permaBuffs.draw || 0);
        }

        // 5. 天域环境影响
        // Realm 10: 大地束缚 - 灵力上限-1
        if (this.realm === 10) {
            newBaseEnergy = Math.max(1, newBaseEnergy - 1);
        }
        // Realm 15: 大道独行 - 最大生命值减半
        if (this.realm === 15) {
            newMaxHp = Math.floor(newMaxHp * 0.7);
        }
        // Realm 18: 混沌终焉 - 所有属性减半
        // Fix: Explicitly EXCLUDE skill cooldown from reduction.
        if (this.realm === 18) {
            newMaxHp = Math.floor(newMaxHp * 0.5);
            newBaseEnergy = Math.max(1, Math.floor(newBaseEnergy * 0.5));
            newDrawCount = Math.max(1, Math.floor(newDrawCount * 0.5));
            // Ensure cooldown is NOT halved (Safety check)
            // this.maxCooldown remains unchanged
        }

        // 更新属性 (保持当前生命值比例或数值？通常保持当前数值，除非超过最大值)
        // Update attributes
        this.maxHp = newMaxHp;
        this.baseEnergy = newBaseEnergy;
        this.drawCount = newDrawCount;
        this.currentHp = Math.min(this.currentHp, this.maxHp);

        // 动态计算奶糖上限 (每5层增加1个)
        // 1-5: 3, 6-10: 4, 11-15: 5, 16+: 6
        this.maxMilkCandy = 3 + Math.floor((Math.max(1, this.realm) - 1) / 5);
    }

    // 获取五行法则计数
    getElementalCounts() {
        const counts = { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 };
        if (this.collectedLaws) {
            this.collectedLaws.forEach(law => {
                const element = Utils.getCanonicalElement(law.element);
                if (counts[element] !== undefined) {
                    counts[element]++;
                }
            });
        }
        return counts;
    }

    // 检查共鸣状态
    checkResonances() {
        if (typeof LAW_RESONANCES === 'undefined') return;

        this.activeResonances = [];
        const loadedLaws = this.fateRing.getSocketedLaws ? this.fateRing.getSocketedLaws() : [];

        for (const key in LAW_RESONANCES) {
            const resonance = LAW_RESONANCES[key];
            const hasAllLaws = resonance.laws.every(lawId => loadedLaws.includes(lawId));

            if (hasAllLaws) {
                this.activeResonances.push(resonance);
                // Utils.showBattleLog(`法则共鸣激活：${resonance.name}`); // 避免刷屏，仅在变化时提示更好
            }
        }
    }

    // 准备战斗
    // 修复牌组数据（每次战斗前重置，防止费用永久变更）
    sanitizeDeck() {
        if (!this.deck || this.deck.length === 0) return;

        this.deck = this.deck.map(card => {
            if (!card || !card.id || !CARDS[card.id]) return card;

            // 基于原始数据重建卡牌
            let freshCard = JSON.parse(JSON.stringify(CARDS[card.id])); // 深拷贝原始数据

            // 如果已升级，应用升级效果
            if (card.upgraded) {
                // upgradeCard 返回新对象，优先使用 cards.js 中的详细逻辑
                if (typeof upgradeCard === 'function') {
                    freshCard = upgradeCard(freshCard);
                } else if (typeof Utils.upgradeCard === 'function') {
                    freshCard = Utils.upgradeCard(freshCard);
                } else {
                    freshCard.upgraded = true; // Fallback
                    freshCard.name += '+'; // Visual
                }
            }

            // 保留实例ID (如果存在)
            if (card.instanceId) freshCard.instanceId = card.instanceId;
            else freshCard.instanceId = this.generateCardId();

            return freshCard;
        });
    }

    // 添加卡牌到弃牌堆 (用于状态牌等)
    addCardToDiscard(cardId) {
        const cardDef = CARDS[cardId];
        if (!cardDef) return;

        const newCard = JSON.parse(JSON.stringify(cardDef));
        newCard.instanceId = this.generateCardId();
        this.discardPile.push(newCard);

        Utils.showBattleLog(`获得卡牌：${newCard.name}`);
    }

    // 重置战斗临时状态 (用于离开战斗或切换场景)
    resetBattleState() {
        this.block = 0;
        this.buffs = {}; // Clear temp buffs
        this.hand = [];
        this.drawPile = [];
        this.discardPile = [];
        this.exhaustPile = [];
        this.currentEnergy = this.baseEnergy;
        this.skillCooldown = 0;
    }

    // 准备战斗
    prepareBattle() {
        // 关键修复：战斗前净化牌组，修复潜在的费用错误
        this.sanitizeDeck();

        this.hand = [];
        // 关键修复：战斗牌堆必须是深拷贝，防止战斗中修改污染原牌组（如费用变化）
        this.drawPile = Utils.shuffle(JSON.parse(JSON.stringify(this.deck)));
        this.discardPile = [];
        this.exhaustPile = [];
        this.block = 0;

        // 战斗开始重置奶糖 (每场战斗/每个敌人重置? 用户说 "Reset per enemy", usually means per battle or per dynamic spawn? Battle.init calls this per battle. So reset here is correct per battle. If "per enemy" means something else, I'll stick to per battle/start.)
        this.milkCandy = this.maxMilkCandy;

        this.turnNumber = 0; // 初始化回合数
        this.skillCooldown = 0; // 进入战斗时重置技能冷却

        // 确保战斗前属性是最新的
        this.recalculateStats();

        // 注入【心魔】卡 (根据用户需求，渡劫后的层数都会携带心魔)
        // 5-9: 1张, 10-14: 2张, 15+: 3张, 18: 2张
        let heartDemonCount = 0;
        if (this.realm === 18) heartDemonCount = 2; // 第十八重特殊处理
        else if (this.realm >= 15) heartDemonCount = 3;
        else if (this.realm >= 10) heartDemonCount = 2;
        else if (this.realm >= 5) heartDemonCount = 1;

        if (heartDemonCount > 0 && CARDS['heartDemon']) {
            for (let i = 0; i < heartDemonCount; i++) {
                const demonCard = JSON.parse(JSON.stringify(CARDS['heartDemon']));
                demonCard.instanceId = this.generateCardId();
                // 插入抽牌堆并打乱
                this.drawPile.push(demonCard);
            }
            // 重新打乱以确保随机分布
            this.drawPile = Utils.shuffle(this.drawPile);
            Utils.showBattleLog(`【心魔来袭】似乎有 ${heartDemonCount} 个不祥的影子混入了牌组...`);
        }

        this.currentEnergy = this.baseEnergy;
        this.buffs = {};

        // 应用永久力量加成
        if (this.permaBuffs && this.permaBuffs.strength) {
            this.addBuff('strength', this.permaBuffs.strength);
        }

        // 命环路径：敏捷之环 - 闪避率 +10%
        if (this.fateRing && this.fateRing.path === 'agility') {
            this.addBuff('dodgeChance', 0.1);
        }

        // 遗物效果：金刚法相 (无欲)
        if (this.relic && this.relic.id === 'vajraBody') {
            const level = this.fateRing ? this.fateRing.level : 0;
            const blockAmt = 6 + level;
            this.block += blockAmt;
            Utils.showBattleLog(`金刚法相：获得 ${blockAmt} 护盾`);
        }

        // 遗物效果：真理之镜 (严寒)
        if (this.relic && this.relic.id === 'scholarLens') {
            const level = this.fateRing ? this.fateRing.level : 0;
            const count = level >= 5 ? 2 : 1; // 5级后给2张

            // 随机获得技能牌（0费，临时）
            const skills = ['meditation', 'spiritBoost', 'quickDraw', 'concentration', 'powerUp', 'divineShield', 'fateTwist'];

            for (let i = 0; i < count; i++) {
                const randomSkill = skills[Math.floor(Math.random() * skills.length)];
                const card = CARDS[randomSkill];
                if (card) {
                    // 临时卡：花费由 playCard 逻辑自动处理 (若是draw则消耗糖，否则消耗灵力)
                    // 用户说 "Spend, not 0 cost". So we keep original cost? 
                    // Or "Temporary cards ... need spend". 
                    // Previously I set cost: 0. Now I remove `cost: 0`.
                    this.hand.push({ ...card, instanceId: this.generateCardId(), isTemp: true });
                }
            }
            Utils.showBattleLog(`真理之镜：获得 ${count} 张临时技能牌`);
        }

        // 命环路径：智慧之环 (额外获得2张随机技能牌)
        if (this.fateRing.path === 'wisdom') {
            const skills = ['meditation', 'spiritBoost', 'quickDraw', 'concentration', 'powerUp', 'analysis'];
            for (let i = 0; i < 2; i++) {
                const randomSkill = skills[Math.floor(Math.random() * skills.length)];
                const card = CARDS[randomSkill];
                if (card) {
                    this.hand.push({ ...card, instanceId: this.generateCardId(), isTemp: true });
                }
            }
            Utils.showBattleLog('智慧之环：获得额外技能牌');
        }
    }

    // 应用命环加成 - 已废弃，由recalculateStats替代
    // applyFateRingBonuses() { ... }

    // 开始回合
    startTurn() {
        if (this.skillCooldown > 0) {
            this.skillCooldown--;
        }

        this.turnNumber++; // 增加回合计数
        this.currentEnergy = this.baseEnergy;

        // 1. 灵气稀薄 (realm 1) - 改为护盾效果-20%，更友好的新手体验
        // 效果在addBlock方法中处理

        // 护盾每回合清零 (除非拥有'retainBlock'效果)
        let keepBlock = false;

        // Fix: Damage Reduction expires at start of next turn (ensures it lasts through control/skips)
        if (this.buffs.damageReduction) {
            delete this.buffs.damageReduction;
            // Utils.showBattleLog('减伤效果已消散');
        }

        try {
            keepBlock = this.hasBuff('retainBlock') ||
                (this.collectedLaws && this.collectedLaws.some(l => l && l.passive && l.passive.type === 'retainBlock')) ||
                (this.activeResonances && this.activeResonances.some(r => r.effect && (r.effect.type === 'persistentBlock' || r.effect.type === 'retainBlock')));
        } catch (e) {
            console.warn('Error checking block retention:', e);
        }

        if (!keepBlock) {
            this.block = 0;
        } else {
            // Decrement retainBlock buff if it was the reason for keeping block
            if (this.hasBuff('retainBlock')) {
                this.buffs.retainBlock--;
            }
        }

        // 触发法宝回合开始效果
        this.triggerTreasureEffect('onTurnStart');

        // 遗物效果：治愈之血 (香叶)
        if (this.relic && this.relic.id === 'healingBlood') {
            const level = this.fateRing ? this.fateRing.level : 0;
            const healAmt = 2 + Math.floor(level / 3);
            this.heal(healAmt);
            Utils.showBattleLog(`治愈之血：回复 ${healAmt} 生命`);
        }

        // ... 其他代码 ...

        // 3. 重力压制 (realm 3) - 仅首回合抽牌-1
        let drawAmount = this.drawCount;
        if (this.realm === 3 && this.turnNumber === 1) {
            drawAmount = Math.max(0, drawAmount - 1);
            Utils.showBattleLog('重力压制：首回合抽牌-1');
        }

        // 敏捷之环 - 额外抽牌
        if (this.fateRing.path === 'agility') {
            drawAmount += 1;
        }

        // 疾风之势法则
        const windLaw = this.collectedLaws.find(l => l.id === 'windSpeed');
        if (windLaw) {
            drawAmount += windLaw.passive.value;
        }

        // 检查心魔卡 (占据抽牌位)
        // 这些卡因为 'retain' 属性而留在手中，在此处计算并减少抽牌量
        const occupiedSlots = this.hand.filter(c => c.occupiesDrawSlot).length;
        if (occupiedSlots > 0) {
            drawAmount = Math.max(0, drawAmount - occupiedSlots);
            Utils.showBattleLog(`心魔作祟：抽牌数 -${occupiedSlots}`);
        }

        this.drawCards(drawAmount);

        // 2. 雷霆淬体 (realm 2)
        if (this.realm === 2) {
            this.takeDamage(3);
            Utils.showBattleLog('雷霆淬体：受到3点雷伤');
        }

        // 7. 虚空吞噬 (realm 7)
        if (this.realm === 7) {
            const drain = Math.floor(this.maxHp * 0.05);
            this.takeDamage(drain);
            Utils.showBattleLog(`虚空吞噬：失去 ${drain} 点生命`);
        }

        // 处理回合开始的buff
        this.processBuffsOnTurnStart();

        // 共鸣：混沌风暴
        const chaoticStorm = this.activeResonances.find(r => r.id === 'chaoticStorm');
        if (chaoticStorm) {
            const dmg = Utils.random(chaoticStorm.effect.min, chaoticStorm.effect.max);
            // 假设game.battle存在且能访问enemies
            if (this.game && this.game.battle && this.game.battle.enemies) {
                const enemies = this.game.battle.enemies.filter(e => e.currentHp > 0);
                if (enemies.length > 0) {
                    const target = enemies[Math.floor(Math.random() * enemies.length)];
                    this.game.battle.dealDamageToEnemy(target, dmg);
                    Utils.showBattleLog(`混沌风暴轰击！造成 ${dmg} 点雷伤`);
                }
            }
        }

        // 治愈法则 (Healing Law)
        const healingLaw = this.collectedLaws.find(l => l.id === 'healingLaw');
        if (healingLaw) {
            this.heal(healingLaw.passive.value);
            Utils.showBattleLog(`治愈法则：恢复 ${healingLaw.passive.value} 生命`);
        }

        // 混沌法则 (Chaos Law): 随机Buff/Debuff
        const chaosLaw = this.collectedLaws.find(l => l.id === 'chaosLaw');
        if (chaosLaw) {
            const isGood = Math.random() < 0.5;
            if (isGood) {
                const buffs = ['strength', 'blockOnAttack', 'energyOnVulnerable', 'nextAttackBonus'];
                const buff = buffs[Math.floor(Math.random() * buffs.length)];
                this.addBuff(buff, chaosLaw.passive.value);
                Utils.showBattleLog(`混沌之触：获得随机强化！`);
            } else {
                if (this.game && this.game.battle && this.game.battle.enemies) {
                    const enemies = this.game.battle.enemies.filter(e => e.currentHp > 0);
                    if (enemies.length > 0) {
                        const target = enemies[Math.floor(Math.random() * enemies.length)];
                        const debuffs = ['vulnerable', 'weak', 'burn', 'poison'];
                        const debuff = debuffs[Math.floor(Math.random() * debuffs.length)];
                        target.buffs[debuff] = (target.buffs[debuff] || 0) + chaosLaw.passive.value;
                        Utils.showBattleLog(`混沌之触：给予敌人随机诅咒！`);
                        if (this.game.battle.updateBattleUI) this.game.battle.updateBattleUI();
                    }
                }
            }
        }

        // 共鸣：维度打击 (Dimension Strike)
        const dimStrike = this.activeResonances.find(r => r.id === 'dimensionStrike');
        if (dimStrike) {
            if (Math.random() < dimStrike.effect.chance) {
                // 选项1: 手牌中随机3张耗能-1
                const candidates = this.hand.filter(c => c.cost > 0 && !c.isTemp); // 排除0费和临时卡? 临时卡usually cost 0? 
                // 只是简单的 c.cost > 0 即可

                // Shuffle candidates indices or pick random
                // Fisher-Yates like select
                const targets = [];
                const costCards = this.hand.filter(c => c.cost > 0);

                if (costCards.length > 0) {
                    const count = Math.min(dimStrike.effect.count || 3, costCards.length);
                    // Shuffle costCards to pick random ones
                    const shuffled = Utils.shuffle([...costCards]);
                    const selected = shuffled.slice(0, count);

                    selected.forEach(card => {
                        card.cost = Math.max(0, card.cost - 1);
                        // Visual feedback?
                    });

                    Utils.showBattleLog(`维度打击：${count} 张手牌耗能 -1！`);
                    // Update UI needed? usually handled by battle update cycle or manual update
                    if (this.game && this.game.verifyHandUI) {
                        // verifyHandUI isn't a standard method, let's rely on standard UI update from battle.endTurn -> startTurn flow
                        // But startTurn calls drawCards, calls...
                        // battle.js calls player.startTurn(). 
                        // After player.startTurn() returns, battle.js typically updates UI?
                        // Let's check battle.js line 1220: this.updateBattleUI();
                        // Yes, UI will be updated.
                    }
                } else {
                    Utils.showBattleLog('维度打击：无牌可减费！');
                }
            } else {
                // 选项2: 抽2张牌
                this.drawCards(2);
                Utils.showBattleLog('维度打击：额外抽2张牌！');
            }
        }

        // 五行共鸣：4件套 回合开始特效
        const elCounts = this.getElementalCounts();

        // Fire (4): 烈焰焚天 - 对所有敌人施加2层灼烧
        if (elCounts.fire >= 4) {
            if (this.game && this.game.battle && this.game.battle.enemies) {
                this.game.battle.enemies.forEach(e => {
                    if (e.isAlive()) {
                        e.buffs.burn = (e.buffs.burn || 0) + 2;
                    }
                });
                Utils.showBattleLog('【火之共鸣】烈焰缭绕，灼烧全场！');
            }
        }

        // Water (4): 柔水滋养 - 恢复3生命，获得3护盾
        if (elCounts.water >= 4) {
            this.heal(3);
            this.addBlock(3);
            Utils.showBattleLog('【水之共鸣】流水不腐，生生不息！');
        }

        // Wood (4): 生机勃勃 - 恢复6生命
        if (elCounts.wood >= 4) {
            this.heal(6);
            Utils.showBattleLog('【木之共鸣】万物生长！');
        }

        // Metal (4): 锋芒毕露 - 获得2力量
        if (elCounts.metal >= 4) {
            this.addBuff('strength', 2);
            Utils.showBattleLog('【金之共鸣】如封似闭，锋芒毕露！');
        }

        // Earth (4): 不动如山 - 获得10护盾
        if (elCounts.earth >= 4) {
            this.addBlock(10);
            Utils.showBattleLog('【土之共鸣】大地守护！');
        }
    }

    // 应用法则被动
    applyLawPassives() {
        // ... (existing code)
        const chaosLaw = this.collectedLaws.find(l => l.id === 'chaosLaw');
        if (chaosLaw) {
            this.addBuff('chaosAura', 1);
        }
    }

    // 添加永久属性加成
    addPermaBuff(type, value) {
        if (this.permaBuffs[type] !== undefined) {
            this.permaBuffs[type] += value;
            this.recalculateStats();
        } else {
            // Handle stats that are not directly stored in permaBuffs object structure if needed? 
            // For now assuming types match keys.
            this.permaBuffs[type] = (this.permaBuffs[type] || 0) + value;
            this.recalculateStats();
        }
    }

    // 添加护盾
    addBlock(amount) {
        if (typeof amount !== 'number' || isNaN(amount)) {
            console.error('addBlock received invalid amount', amount);
            return;
        }

        // 环境：古战场 - 无法获得护盾
        try {
            const activeBattle = (typeof window !== 'undefined' && window.game && window.game.battle) ? window.game.battle : null;
            if (activeBattle && activeBattle.environmentState && activeBattle.environmentState.noBlock) {
                Utils.showBattleLog('古战场：无法获得护盾！');
                return;
            }
        } catch (e) {
            // Ignore environment check errors
        }

        // 1. 灵气稀薄 (realm 1) - 护盾效果-20%
        if (this.realm === 1) {
            amount = Math.floor(amount * 0.8);
        }

        // 命环路径护盾加成/减益
        const path = this.fateRing.path;
        if (path === 'toughness') amount = Math.floor(amount * 1.3); // 坚韧: +30%
        if (path === 'destruction') amount = Math.floor(amount * 0.8); // 毁灭: -20%

        // 大地护盾法则
        const earthLaw = this.collectedLaws.find(l => l.id === 'earthShield');
        if (earthLaw) {
            amount += earthLaw.passive.value;
        }

        // 金属法则 (Metal Body)
        const metalLaw = this.collectedLaws.find(l => l.id === 'metalBody');
        if (metalLaw) {
            amount = Math.floor(amount * (1 + metalLaw.passive.value)); // +25%
        }

        // 法宝：护盾获得前修正（如铁壁符）
        if (this.triggerTreasureValueEffect) {
            amount = this.triggerTreasureValueEffect('onGainBlock', amount);
        }

        if (typeof amount !== 'number' || isNaN(amount)) return;
        amount = Math.floor(amount);
        if (amount <= 0) return;

        this.block += amount;
    }

    // 治疗
    heal(amount) {
        if (typeof amount !== 'number' || isNaN(amount)) {
            console.error('heal received invalid amount', amount);
            return;
        }

        const oldHp = this.currentHp;
        this.currentHp = Math.min(this.maxHp, this.currentHp + amount);
        const actualHeal = this.currentHp - oldHp;

        // 共鸣：神魔一念 (GodDemon) - 溢出治疗转伤害
        if (this.activeResonances) {
            const godDemon = this.activeResonances.find(r => r.id === 'godDemon');
            if (godDemon) {
                // 1. 治疗加成 50% (已经包含在传入amount里？不，这里effect says bonus 50%)
                // 如果我们要实现bonus，应该在入口加。
                // 但为了避免递归或复杂，假设传入前未加成？或者在这里加成？
                // 更好的方式：heal(amount) 是基础方法。
                // 让我们修改amount。
                const bonusAmount = Math.floor(amount * godDemon.effect.healBonus); // +50%
                // 重新计算
                const potentialTotal = amount + bonusAmount;
                this.currentHp = Math.min(this.maxHp, oldHp + potentialTotal);
                const newActualHeal = this.currentHp - oldHp;

                const overflow = potentialTotal - newActualHeal;

                if (overflow > 0 && this.game && this.game.battle && this.game.battle.enemies) {
                    const enemies = this.game.battle.enemies.filter(e => e.currentHp > 0);
                    if (enemies.length > 0) {
                        const target = enemies[Math.floor(Math.random() * enemies.length)];
                        // 真实伤害
                        target.currentHp -= overflow;
                        Utils.showBattleLog(`神魔一念：${overflow} 点溢出治疗化为真实伤害！`);
                        const enemyEl = document.querySelector(`.enemy[data-index="${this.game.battle.enemies.indexOf(target)}"]`);
                        if (enemyEl) Utils.showFloatingNumber(enemyEl, overflow, 'damage');
                    }
                }

                // Update amount for log if needed, though log usually says "Healed X"
                // Let's assume the calling function handles logging "Restored X HP"? 
                // Wait, callers often log themselves (e.g. "Healed 5").
                // If we boost heal here, external log might be wrong.
                // But this method doesn't log.
            }
        }
    }

    // 恢复灵力
    gainEnergy(amount) {
        this.currentEnergy += amount;
        // 也可以选择在这里限制不超过 baseEnergy，或者允许溢出
        // 通常Roguelike里回合内加费可以溢出? 暂时不做上限限制以防万一
        // 但重置回合时会重置为 baseEnergy
    }

    // 受到伤害
    takeDamage(amount) {
        if (typeof amount !== 'number' || isNaN(amount)) {
            console.error('takeDamage received invalid amount', amount);
            amount = 0;
        }

        // 检查金刚法相（无欲 - 功德满值触发）
        if (this.buffs.impervious && this.buffs.impervious > 0) {
            this.buffs.impervious--;
            Utils.showBattleLog('💫 金刚法相庇护！完全免疫伤害！');
            return { dodged: true, damage: 0, impervious: true };
        }

        // 触发法宝回调 (onBeforeTakeDamage)
        // 例如：阴阳镜 (Yin Yang Mirror) - 几率转化伤害为治疗
        const context = { preventDamage: false };
        if (this.treasures) {
            amount = this.triggerTreasureValueEffect('onBeforeTakeDamage', amount, context);
        }

        if (context.preventDamage) {
            return { dodged: true, damage: 0 }; // Treated as dodge/prevented
        }
        if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
            return { dodged: true, damage: 0 };
        }

        // 共鸣：风空遁 (Astral Shift) - 闪避抽牌
        const astralShift = this.activeResonances.find(r => r.id === 'astralShift');

        // 0. 检查闪避率 (Dodge Chance) - 新增机制
        if (this.buffs.dodgeChance && this.buffs.dodgeChance > 0) {
            if (Math.random() < this.buffs.dodgeChance) {
                Utils.showBattleLog(`${this.name} 闪避了攻击！(几率: ${Math.floor(this.buffs.dodgeChance * 100)}%)`);
                return { dodged: true, damage: 0 };
            }
        }

        // 1. 检查绝对闪避
        if (this.buffs.dodge && this.buffs.dodge > 0) {
            // Realm 10: 大地束缚 - 20%几率闪避失败
            if (this.realm === 10 && Math.random() < 0.2) {
                Utils.showBattleLog(`大地束缚：闪避失效！`);
                // 继续受到伤害，不消耗闪避层数（或者消耗？通常失效也会消耗，这里假设失效不消耗还是消耗？）
                // 为了惩罚，让它失效但消耗层数可能太狠，或者失效但不消耗？
                // 这里选择：闪避失效，必须硬抗，层数保留或消耗？
                // 如果保留，下次还能闪，但这次被打。如果消耗，就是纯亏。
                // 既然是“闪避率降低”，那意味着这次尝试闪避失败了。
                this.buffs.dodge--;
            } else {
                this.buffs.dodge--;
                if (astralShift) {
                    this.drawCards(astralShift.effect.value);
                    Utils.showBattleLog(`风空遁触发！闪避并抽牌`);
                }
                return { dodged: true, damage: 0 };
            }
        }

        // 空间裂隙法则 - 随机闪避
        const spaceLaw = this.collectedLaws.find(l => l.id === 'spaceRift');
        const spaceDodgeChance = spaceLaw ? (spaceLaw.passive.dodgeChance ?? spaceLaw.passive.value ?? 0) : 0;
        if (spaceLaw && Math.random() < spaceDodgeChance) {
            if (astralShift) {
                this.drawCards(astralShift.effect.value);
                Utils.showBattleLog(`风空遁触发！闪避并抽牌`);
            }
            return { dodged: true, damage: 0 };
        }

        // 混沌法则 - 扭曲现实（10%几率让伤害归零）
        const chaosLaw = this.collectedLaws.find(l => l.id === 'chaosLaw');
        if (chaosLaw && Math.random() < 0.1) {
            Utils.showBattleLog('混沌之力扭曲了现实，伤害无效！');
            if (astralShift) {
                this.drawCards(astralShift.effect.value);
                Utils.showBattleLog(`风空遁触发！闪避并抽牌`);
            }
            return { dodged: true, damage: 0 };
        }

        // 检查易伤 (Vulnerable)
        if (this.buffs.vulnerable && this.buffs.vulnerable > 0) {
            amount = Math.floor(amount * 1.5);
        }

        // 检查减伤 Buff (天地同寿等)
        if (this.buffs.damageReduction && this.buffs.damageReduction > 0) {
            // FIX: Cap reduction at 90% to prevent immunity
            const reduction = Math.min(90, this.buffs.damageReduction);
            amount = Math.floor(amount * (100 - reduction) / 100);

            Utils.showBattleLog(`减伤生效！抵消了 ${reduction}% 伤害`);
        }

        // 五行共鸣：3件套减伤 15%
        const elCounts = this.getElementalCounts();
        // Check if ANY element has >= 3
        const hasResonanceDefense = Object.values(elCounts).some(c => c >= 3);
        if (hasResonanceDefense) {
            const reduction = Math.floor(amount * 0.15);
            amount -= reduction;
            // Utils.showBattleLog(`五行护体！减免 ${reduction} 伤害`);
        }



        // 伤害保护机制 (One-shot Protection)
        // 单次伤害超过最大生命值 35% 的部分，减免 20% (受到的伤害为 80%)
        const damageCapThreshold = Math.floor(this.maxHp * 0.35);
        if (amount > damageCapThreshold) {
            const excess = amount - damageCapThreshold;
            const reducedExcess = Math.floor(excess * 0.8);
            amount = damageCapThreshold + reducedExcess;
            Utils.showBattleLog('触发伤害保护！');
        }

        // 先扣护盾
        let remainingDamage = amount;
        if (this.block > 0) {
            const blockAbsorbed = Math.min(this.block, remainingDamage);
            this.block -= blockAbsorbed;
            remainingDamage -= blockAbsorbed;
        }

        // 扣血
        if (remainingDamage > 0) {
            this.currentHp -= remainingDamage;
        }

        if (this.currentHp <= 0) {
            // 法宝：致死前拦截（如定海神针）
            if (this.triggerTreasureEffect) {
                const prevented = this.triggerTreasureEffect('onBeforeDeath');
                if (prevented === true && this.currentHp > 0) {
                    return { dodged: false, damage: amount - remainingDamage, prevented: true };
                }
            }

            // 命环路径：逆天之环 - 免疫一次致死伤害
            if (this.fateRing && this.fateRing.deathImmunityCount && this.fateRing.deathImmunityCount > 0) {
                this.fateRing.deathImmunityCount--;
                this.currentHp = 1;
                Utils.showBattleLog('逆天之环：免疫致死伤害！');
                return { dodged: false, damage: amount - remainingDamage };
            }

            // 共鸣：生命轮回 (Life Reincarnation) - 复活 (每场战斗1次)
            // 修改为 100% 血量复活
            const reincarnation = this.activeResonances.find(r => r.effect && r.effect.type === 'resurrect');
            if (reincarnation && (!this.resurrectCount || this.resurrectCount < (reincarnation.effect.value || 1))) {
                const healPercent = reincarnation.effect.percent || 1.0; // Default 100%
                this.currentHp = Math.floor(this.maxHp * healPercent);
                this.resurrectCount = (this.resurrectCount || 0) + 1;
                Utils.showBattleLog(`生命轮回：涅槃重生！恢复 ${Math.floor(healPercent * 100)}% 生命！`);
                return { dodged: false, damage: amount - remainingDamage }; // Stop death
            }

            // 时间静止 (Time Stop) - 免疫致死并结束回合
            const timeLaw = this.collectedLaws.find(l => l.id === 'timeStop');
            if (timeLaw && !this.timeStopTriggered) {
                this.currentHp = 1; // 保留1血
                this.timeStopTriggered = true;
                Utils.showBattleLog('时间静止！免疫了致死伤害！');

                // 强制结束回合 (如果是在敌人回合，应该让敌人停止行动？)
                // 通过抛出异常或设置标志位？
                // battle.js checkBattleEnd 会检查。
                // 我们可以设置一个 flag 让 battle.js 知道要中断。
                if (this.game && this.game.battle) {
                    this.game.battle.forceEndEnemyTurn = true;
                }

                return { dodged: false, damage: amount - remainingDamage };
            }

            // 9. 生死轮回 (realm 9)
            if (this.realm === 9 && !this.hasRebirthed && Math.random() < 0.5) {
                this.currentHp = this.maxHp;
                this.hasRebirthed = true;
                Utils.showBattleLog('生死轮回：逆天改命，满血复活！');
                return { dodged: false, damage: amount - remainingDamage };
            }

            this.currentHp = 0;
            // 触发死亡事件
        }

        // 因果法则 & 逆转法则 Handler
        const actualDamageTaken = amount - remainingDamage; // This logic seems flawed locally, let's look at `remainingDamage` usage.
        // `remainingDamage` is what hits HP. Block absorbed `amount - remainingDamage`.
        // So HP damage is `remainingDamage`.
        const hpDamage = remainingDamage > 0 ? remainingDamage : 0;

        if (hpDamage > 0) {
            // 逆转法则 (Reversal)
            const reversalLaw = this.collectedLaws.find(l => l.id === 'reversalLaw');
            if (reversalLaw && Math.random() < reversalLaw.passive.value) {
                this.heal(hpDamage * 2); // Heal back the damage + extra? Or just negate?
                // Description says: "Convert damage to healing".
                // Since we already deducted HP, we need to add it back + add same amount.
                // So heal(hpDamage * 2).
                Utils.showBattleLog(`逆转法则：伤害转化为治疗！`);
            }

            // 因果法则 (Karma)
            const karmaLaw = this.collectedLaws.find(l => l.id === 'karmaLaw');
            if (karmaLaw) {
                const reflectDmg = Math.floor(hpDamage * karmaLaw.passive.value);
                if (reflectDmg > 0 && this.game && this.game.battle && this.game.battle.enemies) {
                    // Reflect to random enemy or attacker? We don't have attacker context easily here.
                    // Let's reflect to random enemy for now.
                    const enemies = this.game.battle.enemies.filter(e => e.currentHp > 0);
                    if (enemies.length > 0) {
                        const target = enemies[Math.floor(Math.random() * enemies.length)];
                        this.game.battle.dealDamageToEnemy(target, reflectDmg);
                        Utils.showBattleLog(`因果法则：反弹 ${reflectDmg} 点伤害！`);
                    }
                }
            }
        }

        return { dodged: false, damage: hpDamage };
    }

    // 弃掉所有手牌
    discardHand() {
        const count = this.hand.length;
        while (this.hand.length > 0) {
            this.discardPile.push(this.hand.pop());
        }
        return count;
    }

    // 使用卡牌
    playCard(cardIndex, target, options = {}) {
        const card = this.hand[cardIndex];
        if (!card) return false;

        // Check if unplayable
        if (card.unplayable) {
            Utils.showBattleLog('此牌无法打出！');
            return false;
        }



        // 检查奶糖消耗
        // 规则: 明确标记 consumeCandy 的卡牌消耗奶糖，或者为了兼容性保留抽牌卡判定（但要小心）
        // 新规则: 优先使用 consumeCandy 属性。如果未设置，暂不消耗奶糖（除非为了向后兼容）
        // 鉴于我们已经修复了 cards.js，我们可以严格检查 consumeCandy

        // 计算消耗
        let energyCost = (options && typeof options.energyCostOverride === 'number') ? options.energyCostOverride : card.cost;
        let candyCost = 0;

        if (card.consumeCandy) {
            candyCost = 1; // 固定消耗1奶糖
            energyCost = 0; // 消耗奶糖的卡牌不需要消耗灵力
            // 注意: cards.js 中 consumeCandy 的卡牌 cost 通常设为 0
        }

        // Removed legacy fallback: "else if (card.effects.some...)"
        // We now enforce strict 'consumeCandy' property usage.

        // 检查灵力
        if (energyCost > 0 && this.currentEnergy < energyCost) {
            Utils.showBattleLog('灵力不足！');
            return false;
        }

        // 检查奶糖
        if (candyCost > 0 && this.milkCandy < candyCost) {
            Utils.showBattleLog('奶糖不足！无法发动抽牌');
            return false;
        }

        // 消耗资源
        if (energyCost > 0) this.currentEnergy -= energyCost;
        if (candyCost > 0) {
            this.milkCandy -= candyCost;
            // Update UI for candy? (Will be handled in Game/Battle updateUI)
        }

        // 苦行 (Asceticism) - 回合结束若有保留手牌，获得功德
        if (this.buffs.meritOnRetain) {
            const retainedCount = this.hand.filter(c => c.retain).length;
            if (retainedCount > 0) {
                const meritGain = retainedCount * this.buffs.meritOnRetain;
                if (this.fateRing && this.fateRing.gainMerit) {
                    this.fateRing.gainMerit(meritGain);
                    Utils.showBattleLog(`苦行：保留 ${retainedCount} 张牌，功德 +${meritGain}`);
                }
            }
        }

        // 舍弃手牌（除非有保留效果）
        this.hand.splice(cardIndex, 1);

        // 播放卡牌特效
        if (typeof game !== 'undefined' && game.playCardEffect) {
            game.playCardEffect(null, card.type);
        }

        // 触发法宝回调 (onCardPlay)
        const context = { damageModifier: 0 };
        if (this.treasures) {
            this.triggerTreasureEffect('onCardPlay', card, context);
        }

        // 执行卡牌效果
        const results = this.executeCardEffects(card, target, context);

        // 临时卡 (isTemp) -> 消耗 (Exhaust) 而非弃牌
        // 且需要确认临时卡是否本来就是消耗属性 (exhaust: true). 
        // 用户要求: "Temporary cards ... use and delete".
        if (card.isTemp || card.exhaust) {
            this.exhaustPile.push(card);
            Utils.showBattleLog('卡牌已消耗');
        } else {
            // 加入弃牌堆
            this.discardPile.push(card);
        }

        return results;
    }

    // 执行卡牌效果
    // 执行卡牌效果
    executeCardEffects(card, target, context = {}) {
        const results = [];
        if (!card.effects || !Array.isArray(card.effects)) {
            console.warn('Card has no effects:', card);
            return results;
        }

        // Keep card reference in context for downstream effects (e.g., environment bonuses)
        context.card = card;

        for (const effect of card.effects) {
            const result = this.executeEffect(effect, target, context);
            results.push(result);
        }
        return results;
    }

    // 执行单个效果
    executeEffect(effect, target, context = {}) {
        let value = effect.value || 0;

        // 应用法宝/Buff上下文加成 (Context Modifiers)
        if ((effect.type === 'damage' || effect.type === 'damageAll' || effect.type === 'penetrate') && context.damageModifier) {
            value += context.damageModifier;
        }

        // 8. 天道压制 (realm 8)
        if (this.realm === 8 && (typeof value === 'number')) {
            value = Math.floor(value * 0.8);
        }

        // 命环路径伤害加成
        if (effect.type === 'damage' || effect.type === 'penetrate' || effect.type === 'damageAll') {
            const path = this.fateRing.path;
            if (path === 'destruction') value = Math.floor(value * 1.3); // 毁灭: +30%
            if (path === 'insight') value = Math.floor(value * 1.2);    // 洞察: +20%
            if (path === 'defiance') value = Math.floor(value * 1.5);   // 逆天: +50%
        }

        // 15. 大道独行 (realm 15) - 伤害提升50%
        if (this.realm === 15 && (effect.type === 'damage' || effect.type === 'penetrate' || effect.type === 'damageAll')) {
            value = Math.floor(value * 1.5);
        }

        // 12. 古战场环境 (realm 12) - 攻击伤害 +20%
        if (effect.type === 'damage' || effect.type === 'penetrate' || effect.type === 'damageAll') {
            try {
                const battle = (typeof window !== 'undefined' && window.game && window.game.battle) ? window.game.battle : null;
                const envBonus = battle && battle.environmentState ? battle.environmentState.damageBonus : 0;
                if (envBonus && context && context.card && context.card.type === 'attack') {
                    value = Math.floor(value * (1 + envBonus));
                }
            } catch (e) {
                // Ignore environment check errors
            }
        }

        // 共鸣：虚空斩 (Void Slash) - 穿透加成
        if (effect.type === 'penetrate') {
            const voidSlash = this.activeResonances.find(r => r.id === 'voidSlash');
            if (voidSlash) {
                value = Math.floor(value * (1 + voidSlash.effect.percent));
                // Utils.showBattleLog('虚空斩：穿透伤害提升！'); // 频繁提示可能烦人
            }
        }

        // 应用法则加成 (New Implementation)
        if (this.applyLawBonuses) {
            value = this.applyLawBonuses(effect.type, value);
        }

        switch (effect.type) {
            case 'gainSin':
                if (this.fateRing && this.fateRing.gainSin) {
                    this.fateRing.gainSin(value);
                }
                return { type: 'gainSin', value };

            case 'gainMerit':
                if (this.fateRing && this.fateRing.gainMerit) {
                    this.fateRing.gainMerit(value);
                }
                return { type: 'gainMerit', value };

            case 'discardHand':
                const discardedCount = this.hand.length;
                while (this.hand.length > 0) {
                    this.discardPile.push(this.hand.pop());
                }
                this.lastDiscardedCount = discardedCount; // Store for chained effects
                return { type: 'discardHand', value: discardedCount };

            case 'discardRandom':
                return { type: 'discardRandom', value: effect.value || 1, trigger: effect.trigger };

            case 'drawCalculated': {
                const base = effect.base || 0;
                const perDiscard = effect.perDiscard || 0;
                const count = base + (this.lastDiscardedCount || 0) * perDiscard;
                this.lastDiscardedCount = 0; // Reset
                if (count > 0) this.drawCards(count);
                return { type: 'draw', value: count };
            }

            case 'conditionalDamage':
                let dmgValue = 0;
                let conditionMet = false;

                if (effect.condition === 'lowHp') {
                    if (this.currentHp / this.maxHp < (effect.threshold || 0.5)) {
                        conditionMet = true;
                    }
                } else if (effect.condition === 'sealed') {
                    if (this.fateRing && this.fateRing.type === 'sealed' && this.fateRing.slots.some(s => !s.unlocked)) {
                        conditionMet = true;
                    }
                } else {
                    // Default level check (legacy)
                    if (this.fateRing && this.fateRing.level >= (effect.minLevel || 0)) {
                        conditionMet = true;
                    }
                }

                if (conditionMet) {
                    if (effect.multiplier) {
                        dmgValue = Math.floor((effect.value || 0) * effect.multiplier);
                    } else if (effect.bonusDamage) {
                        dmgValue = (effect.value || 0) + effect.bonusDamage;
                    } else {
                        dmgValue = effect.value || 0;
                    }
                } else {
                    dmgValue = effect.value || 0;
                }

                // Apply standard damage logic (modifiers etc. needs to be applied, strictly playCard passes results to battle, battle.dealsDamage)
                // Wait, playCard executeEffect returns value. 
                // But wait, standard 'damage' case applies bonuses BEFORE returning?
                // Line 575+ applies path bonuses and law bonuses to `value`.
                // So now `dmgValue` is base. I should probably re-apply? 
                // Actually `value` variable at top of executeEffect ALREADY applied some bonuses?
                // Yes, lines 567-599 modify `value`.
                // But `value` comes from `effect.value`. 
                // `conditionalDamage` has dynamic value. `effect.value` is base.
                // The bonuses applied at top are to `value`.
                // If I change value here based on condition, is that correct?
                // If condition doubles damage, it should double AFTER bonuses? Or BEFORE?
                // Usually "Doubles damage" implies final damage.
                // But strict "Base damage x 2" is safer.
                // Let's assume modifies base.

                // Re-calculating `value` based on condition, using the ALREADY MODIFIED `value` as base?
                // `value` at this point includes path bonuses etc.
                // If condition is "Multiplier", we multiply `value`.
                // If condition is "Bonus", we add to `value`.

                if (conditionMet) {
                    if (effect.multiplier) value = Math.floor(value * effect.multiplier);
                    if (effect.bonusDamage) value += effect.bonusDamage;
                }

                return { type: 'damage', value: value, target: effect.target };

            case 'damage':
                let dmg = value;
                return { type: 'damage', value: dmg, target: effect.target };

            case 'penetrate':
                return { type: 'penetrate', value, target: effect.target };

            case 'block':
                this.addBlock(value);
                return { type: 'block', value };

            case 'heal':
                this.heal(value);
                return { type: 'heal', value };

            case 'energy':
                this.currentEnergy += value;
                return { type: 'energy', value };

            case 'energyLoss':
                return { type: 'energyLoss', value: effect.value || 1, trigger: effect.trigger };

            case 'draw':
                this.drawCards(value);
                return { type: 'draw', value };

            case 'buff':
                this.addBuff(effect.buffType, effect.value);
                return { type: 'buff', buffType: effect.buffType, value: effect.value };

            case 'debuff':
                return { type: 'debuff', buffType: effect.buffType, value: effect.value, target: effect.target };

            case 'randomDamage':
                const randValue = Utils.random(effect.minValue, effect.maxValue);
                return { type: 'damage', value: randValue, target: effect.target };

            case 'execute':
                return { type: 'execute', value: effect.value, target: effect.target };

            case 'percentDamage':
                if (!target) return { type: 'error', message: '需要目标' };
                // 造成目标最大生命值一定百分比的伤害
                const maxHp = target.maxHp || target.hp;
                const pDamage = Math.floor(maxHp * effect.value);
                return { type: 'damage', value: pDamage, target: effect.target };

            case 'swapHpPercent':
                if (!target) return { type: 'error', message: '需要目标' };
                const playerPercent = this.currentHp / this.maxHp;
                // 确保百分比不为0，至少保留1%
                // 实际上如果玩家只有1HP，百分比极低，交换给满血敌人会造成巨大伤害
                // 但如果敌人满血(100%)，交换给玩家，玩家应该满血

                // 关键修正：获取百分比时，保留足够精度，并确保不会导致生命值归零
                const targetMaxHp = target.maxHp || target.hp;
                const enemyPercent = Math.max(0.01, target.currentHp / targetMaxHp); // 敌人至少保留1%
                const safePlayerPercent = Math.max(0.01, this.currentHp / this.maxHp); // 玩家至少保留1%

                const newPlayerHp = Math.floor(this.maxHp * enemyPercent);
                const newEnemyHp = Math.floor(targetMaxHp * safePlayerPercent);

                const finalPlayerHp = Math.max(1, newPlayerHp);
                const finalEnemyHp = Math.max(1, newEnemyHp);

                const playerDiff = finalPlayerHp - this.currentHp;
                const enemyDiff = finalEnemyHp - target.currentHp;

                this.currentHp = finalPlayerHp;
                target.currentHp = finalEnemyHp;

                Utils.showBattleLog(`逆转乾坤！生命比率互换！`);
                return { type: 'swapHpPercent', playerDiff, enemyDiff, target };

            case 'damageAll':
                return { type: 'damageAll', value, target: 'allEnemies' };

            case 'removeBlock':
                return { type: 'removeBlock', target: effect.target };

            case 'selfDamage':
                this.currentHp = Math.max(1, this.currentHp - value);
                return { type: 'selfDamage', value };

            case 'maxHpOnKill':
                return { type: 'maxHpOnKill', value, target: effect.target };

            case 'mulligan':
                const handSize = this.hand.length; // 当前手牌（不包括打出的这张）
                // 将手牌全部丢弃
                while (this.hand.length > 0) {
                    this.discardPile.push(this.hand.pop());
                }
                // 抽取相同数量
                this.drawCards(handSize);
                return { type: 'mulligan', value: handSize };

            case 'blockFromEnergy':
                const blockVal = this.currentEnergy * effect.multiplier;
                this.addBlock(blockVal);
                return { type: 'block', value: blockVal };

            case 'damagePerCard':
                const cardsCount = this.hand.length;
                const dmgVal = cardsCount * value;
                return { type: 'damage', value: dmgVal, target: effect.target };

            case 'lifeSteal':
                // Ensure value is a number
                return { type: 'lifeSteal', value: value || 0 };

            case 'conditionalDraw':
                // 实现条件抽牌
                let triggered = false;
                if (effect.condition === 'lowHp') {
                    if (this.currentHp / this.maxHp < effect.threshold) {
                        triggered = true;
                    }
                }

                if (triggered) {
                    if (effect.drawValue) this.drawCards(effect.drawValue);
                    if (effect.energyValue) {
                        this.currentEnergy += effect.energyValue;
                        // 触发UI更新（虽然通常在playCard后会统一更新，但能量变化需要及时反映）
                    }
                    Utils.showBattleLog(`绝处逢生生效！抽${effect.drawValue}牌，回${effect.energyValue}灵力`);
                    return { type: 'conditionalDraw', triggered: true };
                } else {
                    Utils.showBattleLog(`条件未满足（生命需低于${Math.floor(effect.threshold * 100)}%）`);
                    return { type: 'conditionalDraw', triggered: false };
                }

            case 'bonusGold':
                this.pendingBonusGold = (this.pendingBonusGold || 0) + Utils.random(effect.min, effect.max);
                return { type: 'bonusGold' };

            case 'ringExp':
                this.fateRing.exp += effect.value;
                this.checkFateRingLevelUp();
                return { type: 'ringExp', value: effect.value };

            case 'consumeAllEnergy':
                const energy = this.currentEnergy;
                this.currentEnergy = 0;
                return { type: 'damage', value: energy * (effect.damagePerEnergy || 6), target: effect.target };

            case 'randomCards':
                const count = Utils.random(effect.minValue, effect.maxValue);
                const addedCards = [];
                for (let i = 0; i < count; i++) {
                    const randomCard = getRandomCard(); // 假设此函数全局可用，或需要从cards.js导入
                    if (randomCard) {
                        const tempCard = { ...randomCard, instanceId: this.generateCardId(), isTemp: true, cost: 0 };
                        this.hand.push(tempCard);
                        addedCards.push(tempCard);
                    }
                }
                return { type: 'draw', value: count, cards: addedCards };

            case 'blockFromStrength':
                const strength = this.buffs.strength || 0;
                const blockAmount = Math.max(effect.minimum || 0, strength * (effect.multiplier || 1));
                this.addBlock(blockAmount);
                return { type: 'block', value: blockAmount };

            case 'reshuffleDiscard':
                if (this.discardPile.length > 0) {
                    this.drawPile.push(...this.discardPile);
                    this.discardPile = [];
                    this.drawPile = Utils.shuffle(this.drawPile);
                    return { type: 'reshuffle', value: this.drawPile.length };
                }
                return { type: 'reshuffle', value: 0 };

            case 'executeDamage':
                return { type: 'executeDamage', value: effect.value, threshold: effect.threshold, target: effect.target };



            case 'damagePerLaw':
                // 根据装载法则数量造成伤害（林风：命环共振）
                const loadedLawCount = this.fateRing.loadedLaws.filter(Boolean).length;
                const totalDamage = effect.baseDamage + (loadedLawCount * effect.damagePerLaw);
                return { type: 'damage', value: totalDamage, target: effect.target };

            case 'cleanse':
                // 净化负面效果（香叶：治愈之触）
                const debuffTypes = ['weak', 'vulnerable', 'poison', 'burn', 'paralysis'];
                let cleansed = 0;
                for (const debuff of debuffTypes) {
                    if (this.buffs[debuff] && cleansed < effect.value) {
                        delete this.buffs[debuff];
                        cleansed++;
                        Utils.showBattleLog(`净化了 ${debuff} 效果`);
                    }
                }
                return { type: 'cleanse', value: cleansed };

            case 'blockFromLostHp':
                // 根据已损失生命获得护盾（香叶：生命涌动）
                const lostHp = this.maxHp - this.currentHp;
                const shieldFromHp = Math.floor(lostHp * effect.percent);
                this.addBlock(shieldFromHp);
                return { type: 'block', value: shieldFromHp };

            case 'debuffAll':
                // 群体debuff（无欲：普渡众生）
                return { type: 'debuffAll', buffType: effect.buffType, value: effect.value, target: 'allEnemies' };

            default:
                return { type: 'unknown' };
        }
    }


    // 添加Buff
    addBuff(type, value) {
        if (value <= 0) return; // 忽略无效buff

        // 11. 天人五衰 (realm 11) - 负面状态持续时间+1
        const isDebuff = ['weak', 'vulnerable', 'poison', 'burn', 'paralysis', 'stun'].includes(type);
        if (this.realm === 11 && isDebuff) {
            value += 1;
        }

        // Fix: Damage Reduction Multiplicative Stacking (避免100%免伤)
        if (type === 'damageReduction') {
            const current = this.buffs[type] || 0;
            // Formula: New = Current + (Remaining * Added%)
            // e.g. 50% + 50% = 50 + (50 * 0.5) = 75%
            const newVal = current + (100 - current) * (value / 100);
            this.buffs[type] = Math.min(95, Math.floor(newVal)); // Cap at 95% to be safe, or just floor
            Utils.showBattleLog(`减伤效果提升至 ${this.buffs[type]}%`);
            return;
        }

        if (this.buffs[type]) {
            this.buffs[type] += value;
        } else {
            this.buffs[type] = value;
        }

        // 获取Buff名称
        let buffName = type;
        const buffNames = {
            strength: '力量',
            weak: '虚弱',
            vulnerable: '易伤',
            poison: '中毒',
            burn: '灼烧',
            thorns: '荆棘',
            dodge: '闪避',
            dodgeChance: '闪避率',
            block: '护盾',
            nextTurnBlock: '固守',
            paralysis: '麻痹',
            stun: '眩晕',
            nextAttackBonus: '聚气',
            damageReduction: '减伤',
            chaosAura: '混乱光环',
            impervious: '金刚法相',
            wrath: '明王之怒'
        };
        if (buffNames[type]) buffName = buffNames[type];
        else if (typeof GameData !== 'undefined' && GameData.getBuffName) buffName = GameData.getBuffName(type);

        Utils.showBattleLog(`获得了 ${buffName} x${value}`);

        // 触发buff获得时的回调（如果有）
        if (type === 'strength') {
            // Strength logic handled dynamically
        }
    }

    // 添加Debuff（供Boss机制与外部系统调用）
    addDebuff(type, value) {
        if (!type || typeof value !== 'number' || isNaN(value) || value <= 0) return 0;

        // 通用免疫判定
        const immunityMap = {
            burn: 'immunity_burn',
            poison: 'immunity_poison',
            weak: 'immunity_weak',
            vulnerable: 'immunity_vulnerable',
            paralysis: 'immunity_paralysis',
            slow: 'immunity_slow',
            stun: 'immunity_stun',
            discard: 'immunity_discard'
        };
        const immunityBuff = immunityMap[type];
        if (immunityBuff && this.hasBuff(immunityBuff)) {
            return 0;
        }

        let finalValue = value;
        if (type === 'weak' && this.hasBuff('weak_resist')) {
            finalValue = Math.max(0, Math.floor(value * (1 - this.buffs.weak_resist)));
        }
        if (finalValue <= 0) return 0;

        // 天人五衰：负面状态持续额外+1
        if (this.realm === 11) {
            finalValue += 1;
        }

        this.buffs[type] = (this.buffs[type] || 0) + finalValue;

        const debuffNames = {
            weak: '虚弱',
            vulnerable: '易伤',
            poison: '中毒',
            burn: '灼烧',
            paralysis: '麻痹',
            stun: '眩晕',
            healing_corrupt: '禁疗'
        };
        Utils.showBattleLog(`受到${debuffNames[type] || type} x${finalValue}`);
        return finalValue;
    }

    // 添加永久属性加成
    addPermBuff(stat, value) {
        if (!this.permaBuffs) this.permaBuffs = {};
        this.permaBuffs[stat] = (this.permaBuffs[stat] || 0) + value;

        // 如果是基础属性，立即重新计算
        if (['maxHp', 'energy', 'draw'].includes(stat)) {
            this.recalculateStats();
        }
    }

    // 回合开始时处理Buff
    processBuffsOnTurnStart() {
        // 中毒伤害结算在EnemyTurn，但如果玩家中毒？
        if (this.buffs.poison) {
            this.takeDamage(this.buffs.poison);
            this.buffs.poison--;
            if (this.buffs.poison <= 0) delete this.buffs.poison;
            Utils.showBattleLog(`受到中毒伤害！剩余 ${this.buffs.poison || 0} 层`);
        }

        // 铁布衫：下回合获得护盾
        if (this.buffs.nextTurnBlock) {
            this.addBlock(this.buffs.nextTurnBlock);
            Utils.showBattleLog(`铁布衫生效！获得 ${this.buffs.nextTurnBlock} 点护盾`);
            delete this.buffs.nextTurnBlock;
        }

        // 再生 (Regen)
        if (this.buffs.regen) {
            this.heal(this.buffs.regen);
            Utils.showBattleLog(`再生生效！恢复 ${this.buffs.regen} 点生命`);
        }
        // The instruction contained a malformed line and an extra brace here.
        // To maintain syntactic correctness, only the intended change (comment update) is applied.

        // 自动格挡/反伤等逻辑...
    }

    // 抽牌
    drawCards(count) {
        for (let i = 0; i < count; i++) {
            if (this.drawPile.length === 0) {
                if (this.discardPile.length === 0) break;
                this.drawPile = Utils.shuffle([...this.discardPile]);
                this.discardPile = [];

                // 共鸣：混沌终焉 (Chaotic Storm) - 洗牌触发
                if (this.activeResonances) {
                    const storm = this.activeResonances.find(r => r.id === 'chaoticStorm');
                    if (storm && this.game && this.game.battle) {
                        const dmg = storm.effect.value;
                        const enemies = this.game.battle.enemies.filter(e => e.currentHp > 0);
                        let hitSomething = false;
                        enemies.forEach(e => {
                            this.game.battle.dealDamageToEnemy(e, dmg);
                            // 随机Debuff
                            const debuffs = ['vulnerable', 'weak', 'burn', 'poison'];
                            const debuff = debuffs[Math.floor(Math.random() * debuffs.length)];
                            e.buffs[debuff] = (e.buffs[debuff] || 0) + 1;
                            hitSomething = true;
                        });
                        if (hitSomething) {
                            Utils.showBattleLog(`混沌终焉：洗牌引发风暴！(伤害+诅咒)`);
                            if (this.game.battle.updateBattleUI) this.game.battle.updateBattleUI();
                        }
                    }
                }
            }

            const card = this.drawPile.pop();
            if (card) {
                // 6. 法则混乱 (realm 6) 或 混乱状态 (Confuse)
                if (this.realm === 6 || (this.buffs.confuse && this.buffs.confuse > 0)) {
                    // Fix: Prevent cumulative drift by using a base cost
                    if (card.baseCost === undefined) card.baseCost = card.cost;

                    if (this.buffs.confuse) {
                        // Confuse: Random cost 0-3
                        card.cost = Math.floor(Math.random() * 4);
                    } else {
                        // Realm 6: -1 to +1 (Weighted: 20% -1, 30% 0, 50% +1)
                        const r = Math.random();
                        let change = 0;
                        if (r < 0.2) change = -1;
                        else if (r < 0.5) change = 0;
                        else change = 1;
                        card.cost = Math.max(0, card.baseCost + change);
                    }
                } else {
                    // 正常情况
                    if (card.baseCost === undefined) card.baseCost = card.cost; // Ensure baseCost

                    // 确保 consumeCandy 的卡牌 cost 保持为 0 (或 baseCost)
                    card.cost = card.baseCost;
                }
                this.hand.push(card);
            }
        }
    }

    // 结束回合
    endTurn() {
        // 4. 丹火焚心 (realm 4)
        if (this.realm === 4 && this.hand.length > 0) {
            const burnDamage = this.hand.length * 2;
            this.takeDamage(burnDamage);
            Utils.showBattleLog(`丹火焚心：受到 ${burnDamage} 点伤害`);
        }

        // 共鸣：大地恩赐 (Gaia's Blessing) - 护盾回血
        if (this.block > 0) {
            const gaiaBlessing = this.activeResonances.find(r => r.id === 'gaiaBlessing');
            if (gaiaBlessing) {
                const healAmount = Math.floor(this.block * gaiaBlessing.effect.percent);
                if (healAmount > 0) {
                    this.heal(healAmount);
                    Utils.showBattleLog(`大地恩赐：恢复 ${healAmount} 点生命`);
                }
            }
        }

        // 弃掉所有手牌 (保留带有 retain 属性的卡牌，如心魔)
        const cardsToDiscard = [];
        const cardsToRetain = [];

        for (const card of this.hand) {
            // 检查卡牌静态定义或动态属性是否包含 retain
            if (card.retain) {
                cardsToRetain.push(card);
            } else {
                cardsToDiscard.push(card);
            }
        }

        this.discardPile.push(...cardsToDiscard);
        this.hand = cardsToRetain;

        if (this.hand.length > 0) {
            Utils.showBattleLog(`保留了 ${this.hand.length} 张手牌`);

            // 苦行 (Asceticism) - 回合结束若有保留手牌，获得功德
            if (this.buffs.meritOnRetain) {
                const retainedCount = this.hand.filter(c => c.retain).length; // Only count actual retained cards? 
                // Description says "If you have retained cards". 
                // Logic above: `this.hand` IS `cardsToRetain` now.
                // So use `this.hand.length`.
                const gain = this.hand.length * this.buffs.meritOnRetain;
                if (gain > 0) {
                    if (this.fateRing && this.fateRing.gainMerit) {
                        this.fateRing.gainMerit(gain);
                        Utils.showBattleLog(`苦行：保留手牌，功德 +${gain}`);
                    }
                }
            }
        }

        // 处理回合结束的buff
        this.processBuffsOnTurnEnd();
    }

    // ...

    // 处理回合结束buff
    processBuffsOnTurnEnd() {
        // 遗物效果：治愈之血
        if (this.relic && this.relic.id === 'healingBlood') {
            this.heal(2);
            // 简单反馈，实际UI反馈在Battle.js中处理可能更好，但这里改动最小
        }

        // 自然生长 (Nature Growth) - 回合结束获得护盾
        if (this.buffs.regenBlock) {
            this.addBlock(this.buffs.regenBlock);
            Utils.showBattleLog(`自然生长：获得 ${this.buffs.regenBlock} 点护盾`);
        }

        // 力量buff持续
        // 反伤消失
        delete this.buffs.thorns;
    }

    // 添加卡牌到牌组
    addCardToDeck(card) {
        // Fix: Use deep copy to isolate instances (avoids "averaged cost" bug)
        if (!card) return;
        const newCard = JSON.parse(JSON.stringify(card));
        newCard.instanceId = this.generateCardId();
        this.deck.push(newCard);
    }

    // 收集法则
    collectLaw(law) {
        if (this.collectedLaws.find(l => l.id === law.id)) {
            return false; // 已经收集过了
        }

        this.collectedLaws.push(law);
        this.lawsCollected++;
        this.fateRing.exp += 100; // 增加命环经验

        // 解锁法则对应的卡牌
        if (law.unlockCards) {
            for (const cardId of law.unlockCards) {
                if (CARDS[cardId]) {
                    this.addCardToDeck(CARDS[cardId]);
                }
            }
        }

        // 检查命环升级
        this.checkFateRingLevelUp();

        return true;
    }

    // 获取当前槽位的法则
    getLawInSlot(index) {
        const lawId = this.fateRing.loadedLaws[index];
        return lawId ? LAWS[lawId] : null;
    }

    // 检查是否升级 (Delegated to FateRing class)
    checkFateRingLevelUp() {
        if (this.fateRing && this.fateRing.checkLevelUp) {
            const prevLevel = this.fateRing.level;
            this.fateRing.checkLevelUp();
            return this.fateRing.level > prevLevel;
        }
        return false;
    }

    // 检查是否触发进化
    checkEvolution() {
        // Delegate to FateRing logic or keep simple check here
        // The FateRing class handles level up, but UI for evolution selection might still belong here or in Game

        const level = this.fateRing.level;
        // Use global FATE_RING to check path tier
        if (typeof FATE_RING === 'undefined') return;

        const currentPath = FATE_RING.paths[this.fateRing.path];
        const currentTier = currentPath ? currentPath.tier : 0;

        // Lv 1: 自动觉醒 (Tier 0 -> Tier 1)
        if (level >= 1 && currentTier < 1) {
            this.evolveFateRing('awakened');
            Utils.showBattleLog(`命环觉醒！无法则之力已激活。`);
        }

        // Lv 3: 第一次分支进化 (Tier 1 -> Tier 2)
        if (level >= 3 && currentTier < 2) {
            if (this.game && this.game.showEvolutionSelection) {
                this.game.showEvolutionSelection(2);
            }
        }

        // Lv 7: 高阶进化 (Tier 2 -> Tier 3)
        if (level >= 7 && currentTier < 3) {
            if (this.game && this.game.showEvolutionSelection) {
                this.game.showEvolutionSelection(3);
            }
        }
    }

    // Check Skill Unlock based on Realm
    checkSkillUnlock() {
        if (!this.activeSkill) return;

        let newLevel = this.skillLevel;
        const realm = this.realm;

        // Realm 18+ -> Lv4
        if (realm >= 18) newLevel = 4;
        // Realm 15+ -> Lv3
        else if (realm >= 15) newLevel = 3;
        // Realm 10+ -> Lv2
        else if (realm >= 10) newLevel = 2;
        // Realm 5+ -> Lv1
        else if (realm >= 5) newLevel = 1;

        // If upgraded
        if (newLevel > this.skillLevel) {
            const oldLevel = this.skillLevel;
            this.skillLevel = newLevel;

            if (oldLevel === 0) {
                Utils.showBattleLog(`【逆命觉醒】主动技能已解锁！(Lv${newLevel})`);
            } else {
                Utils.showBattleLog(`【境界突破】主动技能升级！(Lv${newLevel})`);
            }

            // Refresh UI if Game exists
            if (this.game && this.game.updateActiveSkillUI) {
                this.game.updateActiveSkillUI();
            }
        }
    }

    // 觉醒命环 (用于事件)
    awakenFateRing() {
        if (!this.fateRing) return false;
        if (this.fateRing.path !== 'crippled') return false; // 已经觉醒

        this.evolveFateRing('awakened');
        // 额外奖励？事件描述说 "修复残缺印记"
        return true;
    }

    // 进化命环
    evolveFateRing(pathId) {
        if (!this.fateRing) return;
        this.fateRing.path = pathId;
        this.recalculateStats();
    }

    // applyPathBonus removed, logic moved to recalculateStats and FateRing.getStatsBonus

    // 选择命环进化路径
    chooseFateRingPath(pathName) {
        const path = FATE_RING.paths[pathName];
        if (!path) return false;
        if (path.requires) {
            for (const req of path.requires) {
                const unlocked = this.fateRing.unlockedPaths || [];
                if (this.fateRing.path !== req && !unlocked.includes(req)) {
                    return false;
                }
            }
        }
        this.fateRing.path = pathName;

        // 立即应用新路径的加成
        this.recalculateStats();

        return true;
    }

    // 获取盗取几率加成
    getStealBonus() {
        let bonus = 0;
        // 逆天之环加成
        if (this.fateRing.path === 'defiance') {
            bonus += 0.5;
        }

        return bonus;
    }

    // 是否存活
    isAlive() {
        return this.currentHp > 0;
    }

    // 获取状态 (压缩版)
    getState() {
        return {
            characterId: this.characterId,
            maxHp: this.maxHp,
            currentHp: this.currentHp,
            block: this.block,
            gold: this.gold,
            currentEnergy: this.currentEnergy,
            baseEnergy: this.baseEnergy,
            // 压缩卡牌数据：只保存关键属性
            hand: this.compressCardList(this.hand),
            drawPile: this.compressCardList(this.drawPile),
            discardPile: this.compressCardList(this.discardPile),
            deck: this.compressCardList(this.deck),

            buffs: this.buffs,
            fateRing: this.fateRing, // FateRing needs its own compression ideally, but it's small usually
            // 压缩法则列表
            collectedLaws: this.collectedLaws.map(l => ({ id: l.id })),

            // V4.2 Persistence: Save per-realm map states
            realmMaps: this.realmMaps,

            realm: this.realm,
            floor: this.floor,
            enemiesDefeated: this.enemiesDefeated,
            // 压缩法宝
            collectedTreasures: (this.collectedTreasures || []).map(t => ({
                id: t.id,
                obtainedAt: t.obtainedAt,
                data: t.data
            })),
            equippedTreasures: (this.equippedTreasures || []).map(t => t.id), // 只存ID即可
            permaBuffs: this.permaBuffs,
            maxRealmReached: this.maxRealmReached || 1
        };
    }

    // 辅助：压缩卡牌列表
    compressCardList(list) {
        return list.map(c => ({
            id: c.id,
            instanceId: c.instanceId,
            upgraded: c.upgraded,
            cost: c.cost, // Preserve current cost (e.g. randomized)
            isTemp: c.isTemp
        }));
    }

    // === 法宝系统 ===

    // 获得法宝
    addTreasure(treasureId) {
        // 如果已拥有，补偿金币
        if (this.hasTreasure(treasureId)) {
            // 已有，补偿金币
            this.gold += 50;
            Utils.showBattleLog(`已拥有该法宝，转化为50灵石`);
            return false;
        }

        const treasureData = TREASURES[treasureId];
        if (!treasureData) return false;

        // 深拷贝并初始化
        const treasure = {
            ...treasureData,
            obtainedAt: Date.now(),
            data: treasureData.data ? { ...treasureData.data } : {} // 运行时数据
        };

        // 存入收集库
        this.collectedTreasures = this.collectedTreasures || [];
        this.collectedTreasures.push(treasure);

        // 为了兼容性，this.treasures指向已装备的法宝，或者我们修改逻辑
        // 方案：this.treasures 改为 this.equippedTreasures 别名，保持旧代码兼容？
        // 不，最好显式区分。旧代码使用 this.treasures 遍历生效。
        // 所以我们让 this.treasures 指向 this.equippedTreasures。
        // 但为了存储，我们需要分开。

        // 自动装备逻辑：如果有空位，自动装备
        if (this.equippedTreasures.length < this.getMaxTreasureSlots()) {
            this.equipTreasure(treasureId);
        } else {
            Utils.showBattleLog(`获得法宝【${treasure.name}】，已放入法宝囊`);
        }

        // 触发获取回调
        if (treasure.callbacks && treasure.callbacks.onObtain) {
            treasure.callbacks.onObtain(this, treasure);
        }

        return true;
    }

    // 是否拥有法宝 (检查收集库)
    hasTreasure(treasureId) {
        return (this.collectedTreasures || []).some(t => t.id === treasureId);
    }

    // 是否装备法宝 (检查装备栏)
    isTreasureEquipped(treasureId) {
        return this.equippedTreasures.some(t => t.id === treasureId);
    }

    // 获取最大法宝槽位
    getMaxTreasureSlots() {
        let slots = 2; // 初始
        const r = Math.max(this.realm, this.maxRealmReached || 1);
        if (r >= 5) slots++;
        if (r >= 10) slots++;
        if (r >= 12) slots++;
        if (r >= 15) slots++;

        // Fix: Slot count should not decrease when returning to earlier realms
        if (!this._maxTreasureSlots || slots > this._maxTreasureSlots) {
            this._maxTreasureSlots = slots;
        }
        return this._maxTreasureSlots;
    }

    // 装备法宝
    equipTreasure(treasureId) {
        if (!this.hasTreasure(treasureId)) return false;
        if (this.isTreasureEquipped(treasureId)) return false;
        if (this.equippedTreasures.length >= this.getMaxTreasureSlots()) {
            Utils.showBattleLog('法宝槽位已满！');
            return false;
        }

        const treasure = this.collectedTreasures.find(t => t.id === treasureId);
        if (treasure) {
            this.equippedTreasures.push(treasure);
            // 同步旧属性以保证兼容
            this.treasures = this.equippedTreasures;
            Utils.showBattleLog(`已装备法宝：${treasure.name}`);
            return true;
        }
        return false;
    }

    // 卸下法宝
    unequipTreasure(treasureId) {
        const index = this.equippedTreasures.findIndex(t => t.id === treasureId);
        if (index > -1) {
            const t = this.equippedTreasures[index];
            this.equippedTreasures.splice(index, 1);
            // 同步
            this.treasures = this.equippedTreasures;
            Utils.showBattleLog(`已卸下法宝：${t.name}`);
            return true;
        }
        return false;
    }

    // 触发法宝效果 (只触发装备的)
    // 支持返回值修改（例如伤害减免）
    triggerTreasureEffect(triggerType, ...args) {
        let result = null;
        this.equippedTreasures.forEach(treasure => {
            if (treasure.callbacks && treasure.callbacks[triggerType]) {
                const callbackResult = treasure.callbacks[triggerType](this, ...args, treasure);
                // 某些回调可能返回修改后的值
                if (callbackResult !== undefined) {
                    if (callbackResult === true) {
                        result = true;
                    } else if (result !== true) {
                        result = callbackResult;
                    }
                }
            }
        });
        return result;
    }

    // 触发法宝效果并返回修改的数值（用于伤害计算等）
    triggerTreasureValueEffect(triggerType, value, ...args) {
        let modifiedValue = value;
        this.equippedTreasures.forEach(treasure => {
            if (treasure.callbacks && treasure.callbacks[triggerType]) {
                const result = treasure.callbacks[triggerType](this, modifiedValue, ...args, treasure);
                if (typeof result === 'number') {
                    modifiedValue = result;
                }
            }
        });
        return modifiedValue;
    }

    // 检查Buff
    hasBuff(type) {
        return this.buffs && this.buffs[type] && this.buffs[type] > 0;
    }

    // 移除Buff
    removeBuff(type, value = 0) {
        if (!this.hasBuff(type)) return;

        if (value <= 0 || value >= this.buffs[type]) {
            delete this.buffs[type];
        } else {
            this.buffs[type] -= value;
        }
    }
}
