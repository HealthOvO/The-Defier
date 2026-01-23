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

        // 牌组
        this.deck = [];
        this.hand = [];
        this.drawPile = [];
        this.discardPile = [];
        this.exhaustPile = [];

        // Buff/Debuff
        this.buffs = {};

        // 遗物
        this.relic = charData.relic;

        // 命环
        this.fateRing = {
            level: 0,
            name: '残缺印记',
            exp: 0,
            slots: 0,
            loadedLaws: [],
            path: 'crippled'
        };

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
    }

    initializeDeck(deckList) {
        const list = deckList || STARTER_DECK;
        this.deck = list.map(cardId => {
            const card = CARDS[cardId];
            return card ? { ...card, instanceId: this.generateCardId() } : null;
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

        // 1. 基础属性
        let newMaxHp = charData.stats.maxHp;
        let newBaseEnergy = charData.stats.energy;
        let newDrawCount = 5;

        // 2. 命环等级加成
        const levelData = FATE_RING.levels[this.fateRing.level];
        if (levelData && levelData.bonus) {
            if (levelData.bonus.maxHp) newMaxHp += levelData.bonus.maxHp;
            if (levelData.bonus.energy) newBaseEnergy += levelData.bonus.energy;
            if (levelData.bonus.draw) newDrawCount += levelData.bonus.draw;
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

        // 4. 永久属性加成 (来自事件/成就)
        if (this.permBuffs) {
            if (this.permBuffs.maxHp) newMaxHp += this.permBuffs.maxHp;
            if (this.permBuffs.energy) newBaseEnergy += this.permBuffs.energy;
            if (this.permBuffs.draw) newDrawCount += this.permBuffs.draw;
            // 力量等战斗属性不直接加在基础属性里，而是在战斗开始时初始化到buff中
        }

        // 5. 天域环境影响
        // Realm 10: 大地束缚 - 灵力上限-1
        if (this.realm === 10) {
            newBaseEnergy = Math.max(1, newBaseEnergy - 1);
        }
        // Realm 15: 大道独行 - 最大生命值减半
        if (this.realm === 15) {
            newMaxHp = Math.floor(newMaxHp * 0.5);
        }

        // 更新属性 (保持当前生命值比例或数值？通常保持当前数值，除非超过最大值)
        this.maxHp = newMaxHp;
        this.baseEnergy = newBaseEnergy;
        this.drawCount = newDrawCount;
        this.currentHp = Math.min(this.currentHp, this.maxHp);
    }

    // 检查共鸣状态
    checkResonances() {
        if (typeof LAW_RESONANCES === 'undefined') return;

        this.activeResonances = [];
        const loadedLaws = this.fateRing.loadedLaws.filter(Boolean); // 获取所有已装载的法则ID

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
    prepareBattle() {
        this.hand = [];
        this.drawPile = Utils.shuffle([...this.deck]);
        this.discardPile = [];
        this.exhaustPile = [];
        this.block = 0;
        this.turnNumber = 0; // 初始化回合数

        // 确保战斗前属性是最新的
        this.recalculateStats();

        this.currentEnergy = this.baseEnergy;
        this.buffs = {};

        // 应用永久力量加成
        if (this.permBuffs && this.permBuffs.strength) {
            this.addBuff('strength', this.permBuffs.strength);
        }

        // 遗物效果：金刚法相
        if (this.relic && this.relic.id === 'vajraBody') {
            this.block += 6;
        }

        // 遗物效果：真理之镜
        if (this.relic && this.relic.id === 'scholarLens') {
            // 随机获得一张技能牌（0费，临时）
            const skills = ['meditation', 'spiritBoost', 'quickDraw', 'concentration', 'powerUp'];
            const randomSkill = skills[Math.floor(Math.random() * skills.length)];
            const card = CARDS[randomSkill];
            if (card) {
                this.hand.push({ ...card, instanceId: this.generateCardId(), cost: 0, isTemp: true });
            }
        }
    }

    // 应用命环加成 - 已废弃，由recalculateStats替代
    // applyFateRingBonuses() { ... }

    // 开始回合
    startTurn() {
        this.turnNumber++; // 增加回合计数
        this.currentEnergy = this.baseEnergy;

        // 1. 灵气稀薄 (realm 1) - 改为护盾效果-20%，更友好的新手体验
        // 效果在addBlock方法中处理

        this.block = 0; // 护盾不保留到下回合

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
    }

    // 应用法则被动
    applyLawPassives() {
        // 法则被动效果在战斗开始时检查

        // 混沌法则：混乱光环
        // 这里只是记录，实际效果在Battle.js的enemy turn logic中生效
        // 或者我们可以给自身加一个永久buff "Chaos Aura"
        const chaosLaw = this.collectedLaws.find(l => l.id === 'chaosLaw');
        if (chaosLaw) {
            this.addBuff('chaosAura', 1);
        }
    }

    // 添加护盾
    addBlock(amount) {
        // 1. 灵气稀薄 (realm 1) - 护盾效果-20%
        if (this.realm === 1) {
            amount = Math.floor(amount * 0.8);
        }

        // 大地护盾法则
        const earthLaw = this.collectedLaws.find(l => l.id === 'earthShield');
        if (earthLaw) {
            amount += earthLaw.passive.value;
        }

        this.block += amount;
    }

    // 治疗
    heal(amount) {
        this.currentHp = Math.min(this.maxHp, this.currentHp + amount);
    }

    // 受到伤害
    takeDamage(amount) {
        // 共鸣：风空遁 (Astral Shift) - 闪避抽牌
        const astralShift = this.activeResonances.find(r => r.id === 'astralShift');

        // 检查闪避
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
        if (spaceLaw && Math.random() < spaceLaw.passive.value) {
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
        return { dodged: false, damage: amount - remainingDamage };
    }

    // 使用卡牌
    playCard(cardIndex, target = null) {
        const card = this.hand[cardIndex];
        if (!card) return false;

        // 6. 法则混乱 (realm 6) - 费用随机变化已在抽牌时或回合开始处理？
        // 实际上最好是在使用时动态计算，或者在抽到手牌时修改 cost
        // 为了简化，我们假设抽到时已经变了，或者在这里动态增加消耗
        // 但标准做法是修改卡牌对象的 cost 属性

        // 检查灵力
        if (card.cost > this.currentEnergy) return false;

        // 消耗灵力
        this.currentEnergy -= card.cost;

        // 从手牌移除
        this.hand.splice(cardIndex, 1);

        // 播放卡牌特效
        if (typeof game !== 'undefined' && game.playCardEffect) {
            game.playCardEffect(null, card.type);
        }

        // 执行卡牌效果
        const results = this.executeCardEffects(card, target);

        // 加入弃牌堆
        this.discardPile.push(card);

        return results;
    }

    // 执行卡牌效果
    executeCardEffects(card, target) {
        const results = [];
        for (const effect of card.effects) {
            const result = this.executeEffect(effect, target);
            results.push(result);
        }
        return results;
    }

    // 执行单个效果
    executeEffect(effect, target) {
        let value = effect.value || 0;

        // 8. 天道压制 (realm 8)
        if (this.realm === 8 && (typeof value === 'number')) {
            value = Math.floor(value * 0.8);
        }

        // 15. 大道独行 (realm 15) - 伤害提升50%
        if (this.realm === 15 && (effect.type === 'damage' || effect.type === 'penetrate' || effect.type === 'damageAll')) {
            value = Math.floor(value * 1.5);
        }

        // 共鸣：虚空斩 (Void Slash) - 穿透加成
        if (effect.type === 'penetrate') {
            const voidSlash = this.activeResonances.find(r => r.id === 'voidSlash');
            if (voidSlash) {
                value = Math.floor(value * (1 + voidSlash.effect.percent));
                // Utils.showBattleLog('虚空斩：穿透伤害提升！'); // 频繁提示可能烦人
            }
        }

        // 应用法则加成
        if (this.applyLawBonuses) {
            value = this.applyLawBonuses(effect.type, value);
        }

        switch (effect.type) {
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
                return { type: 'execute', target: effect.target };

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

            case 'lifeSteal':
                return { type: 'lifeSteal', value: effect.value };

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

            // ==================== 新增效果类型 ====================
            case 'conditionalDamage':
                // 命环等级条件伤害（林风：逆天意志）
                if (effect.condition === 'fateRingLevel' && this.fateRing.level >= effect.minLevel) {
                    return { type: 'damage', value: effect.bonusDamage, target: effect.target };
                }
                return { type: 'conditionalDamage', triggered: false };

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
            // 可以在首次触发时提示，避免刷屏
            // Utils.showBattleLog('天人五衰：负面状态加深');
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
            block: '护盾',
            nextTurnBlock: '固守',
            paralysis: '麻痹',
            stun: '眩晕',
            nextAttackBonus: '聚气',
            damageReduction: '减伤',
            chaosAura: '混乱光环'
        };
        if (buffNames[type]) buffName = buffNames[type];
        else if (typeof GameData !== 'undefined' && GameData.getBuffName) buffName = GameData.getBuffName(type);

        Utils.showBattleLog(`获得了 ${buffName} x${value}`);

        // 触发buff获得时的回调（如果有）
        if (type === 'strength') {
            // Strength logic handled dynamically
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

        // 自动格挡/反伤等逻辑...
    }

    // 抽牌
    drawCards(count) {
        for (let i = 0; i < count; i++) {
            if (this.drawPile.length === 0) {
                if (this.discardPile.length === 0) break;
                this.drawPile = Utils.shuffle([...this.discardPile]);
                this.discardPile = [];
            }

            const card = this.drawPile.pop();
            if (card) {
                // 6. 法则混乱 (realm 6)
                if (this.realm === 6) {
                    const change = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
                    card.cost = Math.max(0, card.cost + change);
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

        // 弃掉所有手牌
        this.discardPile.push(...this.hand);
        this.hand = [];

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

        // 力量buff持续
        // 反伤消失
        delete this.buffs.thorns;
    }

    // 添加卡牌到牌组
    addCardToDeck(card) {
        const newCard = { ...card, instanceId: this.generateCardId() };
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

    // 装载法则到命环
    loadLawToRing(lawId, slotIndex = -1) {
        // 如果没有指定槽位，找第一个空槽
        if (slotIndex === -1) {
            for (let i = 0; i < this.fateRing.slots; i++) {
                if (!this.fateRing.loadedLaws[i]) {
                    slotIndex = i;
                    break;
                }
            }
        }

        // 检查槽位是否有效
        if (slotIndex < 0 || slotIndex >= this.fateRing.slots) {
            return false;
        }

        // 如果该槽位已有法则，先卸载
        if (this.fateRing.loadedLaws[slotIndex]) {
            this.unloadLawFromRing(slotIndex);
        }

        // 如果要装载的法则已经在其他槽位，也先卸载
        const existingIndex = this.fateRing.loadedLaws.indexOf(lawId);
        if (existingIndex !== -1) {
            this.unloadLawFromRing(existingIndex);
        }

        this.fateRing.loadedLaws[slotIndex] = lawId;
        return true;
    }

    // 从命环卸载法则
    unloadLawFromRing(slotIndex) {
        if (slotIndex >= 0 && slotIndex < this.fateRing.slots) {
            this.fateRing.loadedLaws[slotIndex] = null;
            return true;
        }
        return false;
    }

    // 获取当前槽位的法则
    getLawInSlot(index) {
        const lawId = this.fateRing.loadedLaws[index];
        return lawId ? LAWS[lawId] : null;
    }

    // 检查命环升级
    checkFateRingLevelUp() {
        // 即使是level 0，如果经验足够也应该能觉醒
        // if (this.fateRing.level === 0) return false;

        const levels = FATE_RING.levels;
        // 注意 levels[0] 是 level 0, levels[1] 是 level 1
        for (let i = levels.length - 1; i >= 1; i--) {
            if (this.fateRing.exp >= levels[i].expRequired) {
                if (this.fateRing.level < levels[i].level) {
                    this.fateRing.level = levels[i].level;
                    this.fateRing.name = levels[i].name;
                    this.fateRing.slots = levels[i].slots;

                    // 立即应用新等级的属性加成
                    this.recalculateStats();

                    Utils.showBattleLog(`命环突破！晋升为【${this.fateRing.name}】`);
                    return true;
                }
                break;
            }
        }
        return false;
    }

    // 选择命环进化路径
    chooseFateRingPath(pathName) {
        const path = FATE_RING.paths[pathName];
        if (!path) return false;
        if (path.requires) {
            for (const req of path.requires) {
                if (this.fateRing.path !== req && !this.unlockedPaths?.includes(req)) {
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

    // 获取状态
    getState() {
        return {
            characterId: this.characterId,
            maxHp: this.maxHp,
            currentHp: this.currentHp,
            block: this.block,
            gold: this.gold,
            currentEnergy: this.currentEnergy,
            baseEnergy: this.baseEnergy,
            hand: this.hand,
            drawPile: this.drawPile,
            discardPile: this.discardPile,
            deck: this.deck,
            buffs: this.buffs,
            fateRing: this.fateRing,
            collectedLaws: this.collectedLaws,
            realm: this.realm,
            floor: this.floor,
            enemiesDefeated: this.enemiesDefeated
        };
    }
}
