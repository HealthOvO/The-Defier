/**
 * The Defier - 命环系统
 * 管理角色的命环等级、技能、法则镶嵌
 */

class FateRing {
    constructor(player, type = 'standard') {
        this.player = player;
        this.type = type; // 'standard', 'mutated' (林风), 'sealed' (香叶), etc.

        // 基础数据
        this.level = 0;
        this.exp = 0;
        this.maxExp = 100;
        this.name = '残缺印记';

        // 槽位系统 (法则刻印)
        this.slots = [];
        this.maxSlots = 1; // 初始槽位

        // 主动技能
        this.activeSkill = null;
        this.skillCooldown = 0;
        this.skillReady = false;

        // 路径 (保留旧版逻辑兼容)
        this.path = 'crippled';
        this.unlockedPaths = ['crippled'];
    }

    // 初始化槽位
    initSlots() {
        // 基础命环根据等级解锁槽位
        // 0级: 0槽, 1级: 1槽, 4级: 2槽, 7级: 3槽, 10级: 4槽
        const existing = Array.isArray(this.slots)
            ? this.slots.map(s => ({ law: s.law, unlocked: s.unlocked, type: s.type }))
            : [];

        this.slots = [];
        for (let i = 0; i < this.maxSlots; i++) {
            const prev = existing[i] || {};
            this.slots.push({
                unlocked: prev.unlocked !== undefined ? prev.unlocked : true,
                law: prev.law || null, // 镶嵌的法则ID
                type: prev.type || 'any' // 槽位类型限制
            });
        }
    }

    // 获得经验
    gainExp(amount) {
        this.exp += amount;
        this.checkLevelUp();
    }

    // 检查升级
    checkLevelUp() {
        if (typeof FATE_RING === 'undefined') return;

        // 获取下一级的经验需求
        // My new class uses current exp and maxExp (progress to next level).
        // I should adapt to the game's existing logic if it uses cumulative.
        // However, standard RPG uses "exp needed for next level".
        // Let's stick to "exp is cumulative" model to match player.js data?
        // player.js: this.fateRing.exp += value.

        // Let's use the levels definition to find current level based on total exp
        const levels = FATE_RING.levels;
        let newLevel = this.level;

        for (const lvl in levels) {
            const levelNum = parseInt(lvl);
            if (this.exp >= levels[lvl].exp) {
                if (levelNum > newLevel) {
                    newLevel = levelNum;
                }
            }
        }

        if (newLevel > this.level) {
            const levelsGained = newLevel - this.level;
            this.level = newLevel;
            this.levelUp(levelsGained);
        }
    }

    // 升级
    levelUp(levelsGained = 1) {
        Utils.showBattleLog(`命环升级！当前等级：${this.level}`);

        // check evolution or slot unlock
        // Update slots based on constant data
        if (FATE_RING.levels[this.level]) {
            const levelData = FATE_RING.levels[this.level];
            if (levelData.slots > this.maxSlots) {
                this.maxSlots = levelData.slots;
                this.initSlots(); // This might reset existing laws! ensure initSlots preserves them
                Utils.showBattleLog(`命环突破！获得新的法则槽位！`);
            }
        }

        if (this.player && this.player.recalculateStats) {
            this.player.recalculateStats();
        }

        // Sync active skill level
        if (this.player) {
            this.player.skillLevel = this.level;
        }

        // Check legacy evolution triggers
        if (this.player && this.player.checkEvolution) {
            this.player.checkEvolution();
        }
    }

    // 镶嵌法则
    socketLaw(slotIndex, lawId) {
        if (slotIndex < 0 || slotIndex >= this.slots.length) return false;
        if (!this.slots[slotIndex].unlocked) return false;

        // 卸下旧法则（如果有）
        if (this.slots[slotIndex].law) {
            // 逻辑上可能需要退还法则卡到牌库？或者直接替换销毁？
            // 暂定：替换销毁旧法则，或者返回手牌/牌库太复杂。
            // 简化：新法则覆盖旧法则，旧法则消失。
        }

        this.slots[slotIndex].law = lawId;
        Utils.showBattleLog(`法则 [${lawId}] 已刻印于命环！`);

        // 立即触发属性重算
        this.player.recalculateStats();

        return true;
    }

    // 获取镶嵌的法则列表
    getSocketedLaws() {
        return this.slots.map(s => s.law).filter(Boolean);
    }

    // 获取属性加成
    getStatsBonus() {
        const bonus = {
            maxHp: 0,
            energy: 0,
            draw: 0
        };

        if (typeof FATE_RING === 'undefined') return bonus;

        // 1. 等级基础加成 (来自 FATE_RING.levels)
        const levelData = FATE_RING.levels[this.level];
        if (levelData && levelData.bonus) {
            if (levelData.bonus.maxHp) bonus.maxHp += levelData.bonus.maxHp;
            if (levelData.bonus.energy) bonus.energy += levelData.bonus.energy;
            if (levelData.bonus.draw) bonus.draw += levelData.bonus.draw;
        }

        // 2. 路径加成 (来自 FATE_RING.paths)
        if (this.path && FATE_RING.paths[this.path]) {
            const pathData = FATE_RING.paths[this.path];
            if (pathData.bonus) {
                if (pathData.bonus.type === 'hpBonus') bonus.maxHp += pathData.bonus.value;
                if (pathData.bonus.type === 'energyBonus') bonus.energy += pathData.bonus.value;
                if (pathData.bonus.type === 'drawBonus') bonus.draw += pathData.bonus.value;
                // Add logic for damage bonus etc if needed in Player.recalculateStats context
                // But getStatsBonus is strictly for stats? 
                // Player.recalculateStats calls this. So this is fine.
            }
        }

        // 3. 镶嵌法则加成
        const laws = this.getSocketedLaws();
        laws.forEach(lawId => {
            if (typeof CARDS !== 'undefined' && CARDS[lawId]) {
                const card = CARDS[lawId];
                // 暂时简单的硬编码规则，后续应移动到 Law 数据定义中
                if (card.lawType === 'fire') bonus.maxHp += 5;
                if (card.lawType === 'ice') bonus.maxHp += 5;
                if (card.lawType === 'thunder') bonus.maxHp += 3;
                if (card.lawType === 'wind') bonus.draw += 1;
                if (card.lawType === 'space') bonus.draw += 1;
                if (card.lawType === 'time') bonus.energy += 1;
            }
        });

        return bonus;
    }

    // 序列化 (用于存档)
    toJSON() {
        return {
            type: this.type,
            level: this.level,
            exp: this.exp,
            slots: this.slots, // 需包含镶嵌状态
            path: this.path
        };
    }

    // 反序列化
    loadFromJSON(data) {
        if (!data) return;
        this.type = data.type || 'standard';
        this.level = data.level || 0;
        this.exp = data.exp || 0;
        this.path = data.path || 'crippled';

        // Fix: Compatible with legacy save data where 'slots' was a number
        if (Array.isArray(data.slots)) {
            this.slots = data.slots;
            this.maxSlots = this.slots.length;
        } else {
            // Legacy format: slots is a number
            this.maxSlots = typeof data.slots === 'number' ? data.slots : 1;
            // Re-initialize slot objects array
            this.initSlots();

            // Migrate loaded laws from legacy array if present
            if (Array.isArray(data.loadedLaws)) {
                data.loadedLaws.forEach((lawId, index) => {
                    if (lawId && this.slots[index]) {
                        this.slots[index].law = lawId;
                    }
                });
            }
        }

        // Sync active skill level with loaded level
        if (this.player) {
            this.player.skillLevel = this.level;
        }
    }
}

// 角色特化子类

// 林风：变异命环
class MutatedRing extends FateRing {
    constructor(player) {
        super(player, 'mutated');
        this.name = '逆天之环';
    }

    // 初始化槽位 (Override for fusion slots)
    initSlots() {
        const existing = Array.isArray(this.slots)
            ? this.slots.map(s => ({
                law: s.law,
                subLaw: s.subLaw,
                unlocked: s.unlocked,
                type: s.type
            }))
            : [];

        this.slots = [];
        for (let i = 0; i < this.maxSlots; i++) {
            const prev = existing[i] || {};
            this.slots.push({
                unlocked: prev.unlocked !== undefined ? prev.unlocked : true,
                law: prev.law || null,
                subLaw: prev.subLaw || null, // 第二个法则槽 (融合用)
                type: prev.type || 'any'
            });
        }
    }

    // 重写镶嵌逻辑，允许双重镶嵌 (融合)
    socketLaw(slotIndex, lawId) {
        if (slotIndex < 0 || slotIndex >= this.slots.length) return false;

        const slot = this.slots[slotIndex];

        // 1. 如果主槽位为空，填入主槽位
        if (!slot.law) {
            slot.law = lawId;
            Utils.showBattleLog(`法则 [${lawId}] 已刻印于命环主位！`);
        }
        // 2. 如果主槽位有值，尝试填入副槽位 (融合)
        else if (!slot.subLaw) {
            // 检查是否允许融合 (不同名)
            if (slot.law === lawId) {
                Utils.showBattleLog('无法融合相同的法则！');
                return false;
            }
            slot.subLaw = lawId;
            Utils.showBattleLog(`法则 [${lawId}] 已融入命环，触发法则变异！`);
        }
        // 3. 两个都有，询问替换? (简化：替换副槽位，或者需要先卸载)
        else {
            // 简单策略：循环替换，新的替换副槽位，旧副槽位顶掉主槽位? 不，太复杂。
            // 策略：如果满，替换副槽位。
            slot.subLaw = lawId;
            Utils.showBattleLog(`法则 [${lawId}] 替换了副融合位！`);
        }

        this.player.recalculateStats();
        return true;
    }

    // 获取镶嵌的法则列表 (包含融合的)
    getSocketedLaws() {
        const laws = [];
        this.slots.forEach(s => {
            if (s.law) laws.push(s.law);
            if (s.subLaw) laws.push(s.subLaw);
        });
        return laws;
    }

    // 获取融合加成 (MutatedRing 特有)
    getFusionBonus(slotIndex) {
        const slot = this.slots[slotIndex];
        if (!slot || !slot.law || !slot.subLaw) return null;

        // 这里可以定义复杂的融合表
        // 简化实现：主副法则被动效果都生效 (无需额外代码，因为 getSocketedLaws 返回了俩)
        // 额外奖励：每个融合槽位提供全属性 +5% (模拟变异强大)
        return {
            damageMult: 0.05,
            hpMult: 0.05
        };
    }

    // 重写 getStatsBonus 以包含融合奖励
    getStatsBonus() {
        const bonus = super.getStatsBonus();

        // 计算融合额外加成
        let fusionCount = 0;
        this.slots.forEach(s => {
            if (s.law && s.subLaw) fusionCount++;
        });

        if (fusionCount > 0) {
            // 每一个融合对提供额外 HP 和 伤害加成
            // 注意：super.getStatsBonus 已经计算了两个法则的基础加成
            // 这里我们只加“变异”的额外奖励
            // 由于 bonus 结构目前只有数值，百分比加成需在 player.recalculateStats 处理，或者这里返回数值
            // 暂定：融合提供额外能量回复 (强力)
            // 每有一个完美融合，最大生命 +20
            bonus.maxHp += fusionCount * 20;
        }

        return bonus;
    }
}

// 香叶：封印命环
class SealedRing extends FateRing {
    constructor(player) {
        super(player, 'sealed');
        this.name = '玉十二环·封印';
        this.maxSlots = 12; // 初始即有12槽，但大部分被锁
        this.initSlots();
    }

    initSlots() {
        this.slots = [];
        for (let i = 0; i < 12; i++) {
            this.slots.push({
                unlocked: i === 0, // 只有第一个解锁
                law: null,
                isSealed: i > 0
            });
        }
    }

    // 能够解除封印
    canUnseal(index) {
        if (!this.slots[index]) return false;
        if (!this.slots[index].isSealed) return false;
        // 只能按顺序解除？或者随意？
        // 假设只能解除第一个未解锁的
        // Check if previous slot is unlocked?
        if (index > 0 && !this.slots[index - 1].unlocked) return false;
        return true;
    }

    // 解除封印
    unseal(index) {
        if (this.canUnseal(index)) {
            this.slots[index].isSealed = false;
            this.slots[index].unlocked = true;

            // 施加逆生咒代价: 扣除最大生命值上限
            if (this.player) {
                // 每解封一层，permanent maxHp cost?
                // 或者施加永久debuff
                // Cost: 10 + index * 5 HP
                const cost = 10 + index * 5;
                this.player.maxHp = Math.max(1, this.player.maxHp - cost);
                this.player.currentHp = Math.min(this.player.currentHp, this.player.maxHp);

                Utils.showBattleLog(`逆生咒：解封第${index + 1}环，最大生命减少 ${cost}！`);
            }

            // Trigger UI update
            if (this.player.recalculateStats) this.player.recalculateStats();
            return true;
        }
        return false;
    }
}

// 无欲：功德金轮
class KarmaRing extends FateRing {
    constructor(player) {
        super(player, 'karma');
        this.name = '功德金轮';

        // 资源池
        this.merit = 0; // 功德
        this.sin = 0;   // 业力
        this.maxPool = 100; // 初始上限

        // 状态标记
        this.goldenBodyActive = false; // 金身状态
        this.wrathActive = false;      // 明王怒状态
    }

    // 获取资源状态用于UI显示
    getKarmaStatus() {
        return {
            merit: this.merit,
            sin: this.sin,
            max: this.maxPool
        };
    }

    // 增加功德 (防御/辅助牌触发)
    gainMerit(amount) {
        if (this.wrathActive) return; // 愤怒状态下不积攒功德? 或者互斥? 暂时允许共存但触发不同

        this.merit = Math.min(this.maxPool, this.merit + amount);

        // 检查满值触发
        if (this.merit >= this.maxPool) {
            this.triggerGoldenBody();
        }
    }

    // 增加业力 (攻击牌触发)
    gainSin(amount) {
        if (this.goldenBodyActive) return; // 金身状态下不积攒业力?

        this.sin = Math.min(this.maxPool, this.sin + amount);

        // 检查满值触发
        if (this.sin >= this.maxPool) {
            this.triggerWrath();
        }
    }

    // 触发金身 (无敌)
    triggerGoldenBody() {
        this.merit = 0;
        this.goldenBodyActive = true;
        this.player.addBuff('impervious', 1); // 假设 'impervious' 是无敌buff ID，需确认 battle.js
        Utils.showBattleLog(`功德圆满！【金刚法相】现世！`);
    }

    // 触发明王怒 (伤害加倍)
    triggerWrath() {
        this.sin = 0;
        this.wrathActive = true;
        this.player.addBuff('strength', 5); // 简单加力量
        // 或者施加一个特殊buff "wrath"，下一次攻击x3
        this.player.addBuff('wrath', 1);
        Utils.showBattleLog(`业力滔天！【明王之怒】降临！`);
    }

    // 重写序列化，保存功德业力
    toJSON() {
        const data = super.toJSON();
        data.merit = this.merit;
        data.sin = this.sin;
        return data;
    }

    // 重写反序列化
    loadFromJSON(data) {
        super.loadFromJSON(data);
        this.merit = data.merit || 0;
        this.sin = data.sin || 0;
    }
}

// 严寒：真理之环
class AnalysisRing extends FateRing {
    constructor(player) {
        super(player, 'analysis');
        this.name = '真理之环';

        // 已分析的敌人类型
        this.analyzedTypes = []; // ['fire', 'undead', ...]

        // 当前针对配置
        this.tacticalConfig = {
            damageVsType: null, // 当前针对的类型
            damageBonus: 0.2    // 20% 伤害加成
        };
    }

    // 扫描敌人 (战斗开始时调用)
    scanEnemies(enemies) {
        if (!enemies || enemies.length === 0) return;

        let newDiscovery = false;
        enemies.forEach(enemy => {
            const type = enemy.type || 'normal'; // 假设敌人有 type 属性
            if (!this.analyzedTypes.includes(type)) {
                this.analyzedTypes.push(type);
                newDiscovery = true;
                Utils.showBattleLog(`真理之环：解析了新物种【${type}】！`);
            }

            // 自动适配战术? 或者需要手动?
            // 简化：自动适配第一个精英/Boss的弱点
            if (this.analyzedTypes.includes(type)) {
                // 自动激活针对弱点
                this.tacticalConfig.damageVsType = type;
            }
        });
    }

    // 获取针对弱点加成
    getTacticalBonus(targetEnemy) {
        if (targetEnemy.type === this.tacticalConfig.damageVsType) {
            return this.tacticalConfig.damageBonus;
        }
        return 0;
    }

    toJSON() {
        const data = super.toJSON();
        data.analyzedTypes = this.analyzedTypes;
        return data;
    }

    loadFromJSON(data) {
        super.loadFromJSON(data);
        this.analyzedTypes = data.analyzedTypes || [];
    }
}
