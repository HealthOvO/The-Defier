/**
 * The Defier 4.2 - 逆命者
 * 主游戏控制器（修复版）
 */

class Game {
    constructor() {
        this.player = new Player();
        this.player.game = this;
        this.battle = new Battle(this);
        this.map = new GameMap(this);
        this.eventSystem = new EventSystem(this);
        this.achievementSystem = new AchievementSystem(this);
        this.currentScreen = 'main-menu';
        this.currentEnemies = [];
        this.currentBattleNode = null; // 记录当前战斗节点
        this.mode = 'pve';
        this.pvpOpponentRank = null;
        this.pvpMatchTicket = null;
        this.stealAttempted = false;
        this.rewardCardSelected = false; // 防止重复选牌
        this.comboCount = 0;
        this.lastCardType = null;
        this.runStartTime = null;
        this.currentSaveSlot = null; // Default to null (unknown), NOT 0 (Slot 1)
        this.cachedSlots = [null, null, null, null]; // Cache for slots
        this.guestMode = false;
        this.guideState = this.loadGuideState();
        this.debugMode = localStorage.getItem('theDefierDebug') === 'true';
        this.legacyStorageKey = 'theDefierLegacyV1';
        this.legacyUpgradeCatalog = this.getLegacyUpgradeCatalog();
        this.legacyProgress = this.loadLegacyProgress();
        this.lastLegacyGain = 0;
        this.featureFlags = {
            combatDepthV2: true,
            pvpRuleSyncV2: true,
            mapNodeTrialForge: true
        };
        this.performanceStats = {
            battleUIUpdates: 0,
            battleTurnDurations: [],
            pvpLoadDurations: []
        };
        setTimeout(() => this.updateDebugUI(), 0);

        // Restore slot from session if exists
        const savedSlot = sessionStorage.getItem('currentSaveSlot');
        if (savedSlot !== null) this.currentSaveSlot = parseInt(savedSlot);

        this.init();
    }

    // 初始化
    init() {
        this.bindGlobalEvents();
        this.initRuntimeHooks();
        // Initialize Auth
        if (typeof AuthService !== 'undefined') {
            AuthService.init();
            this.checkLoginStatus();
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
        if (typeof AuthService !== 'undefined' && AuthService.isLoggedIn() && this.currentSaveSlot === null) {
            console.log('Logged in but slot unknown. Prompting selection.');
            // 延迟一点以免与主菜单动画冲突
            setTimeout(() => this.openSaveSlotsWithSync(), 800);
        }

        console.log('The Defier 2.1 初始化完成！');
    }

    initRuntimeHooks() {
        // Deterministic-ish stepping hook for automation.
        window.advanceTime = (ms = 16) => {
            const delta = Math.max(0, Number(ms) || 0);
            if (this.battle && this.currentScreen === 'battle-screen' && typeof this.battle.advanceTime === 'function') {
                this.battle.advanceTime(delta);
                return;
            }
            if (this.battle && this.currentScreen === 'battle-screen' && typeof this.battle.updateBattleUI === 'function') {
                this.battle.updateBattleUI();
            }
        };

        window.render_game_to_text = () => this.renderGameToText();
    }

    renderGameToText() {
        const mode = this.currentScreen || 'unknown';
        const isBattleMode = mode === 'battle-screen';
        const payload = {
            coordSystem: 'ui-screen-space, origin top-left, +x right, +y down',
            mode,
            player: {
                hp: this.player?.currentHp ?? 0,
                maxHp: this.player?.maxHp ?? 0,
                block: this.player?.block ?? 0,
                energy: this.player?.currentEnergy ?? 0,
                maxEnergy: this.player?.baseEnergy ?? 0,
                hand: Array.isArray(this.player?.hand) ? this.player.hand.length : 0,
                drawPile: Array.isArray(this.player?.drawPile) ? this.player.drawPile.length : 0,
                discardPile: Array.isArray(this.player?.discardPile) ? this.player.discardPile.length : 0,
                stance: this.player?.stance || 'neutral',
                archetypeResonance: this.player?.archetypeResonance
                    ? {
                        id: this.player.archetypeResonance.id,
                        tier: this.player.archetypeResonance.tier
                    }
                    : null
            },
            battle: (isBattleMode && this.battle) ? {
                turn: this.battle.turnNumber || 0,
                currentTurn: this.battle.currentTurn || 'none',
                enemies: (this.battle.enemies || []).filter(e => e.currentHp > 0).map((e, idx) => ({
                    i: idx,
                    id: e.id,
                    name: e.name,
                    hp: e.currentHp,
                    maxHp: e.maxHp,
                    block: e.block || 0,
                    buffs: e.buffs || {},
                    phase: e.currentPhase || 0
                }))
            } : null,
            map: this.map ? {
                realm: this.player?.realm || 1,
                activeNodes: typeof this.map.getAccessibleNodes === 'function'
                    ? this.map.getAccessibleNodes().map(n => ({ id: n.id, row: n.row, type: n.type }))
                    : []
            } : null,
            legacy: {
                essence: this.legacyProgress?.essence || 0,
                unspent: this.getLegacyUnspentEssence(),
                upgrades: this.legacyProgress?.upgrades || {},
                lastPreset: this.legacyProgress?.lastPreset || null,
                doctrine: this.player?.legacyRunDoctrine || null,
                mission: this.player?.legacyRunMission || null
            },
            perf: this.performanceStats
        };

        return JSON.stringify(payload);
    }

    shouldForceCloudLogin() {
        if (this.guestMode) return false;
        if (typeof AuthService === 'undefined') return false;
        if (!AuthService.isCloudEnabled || !AuthService.isCloudEnabled()) return false;
        return !AuthService.isLoggedIn();
    }

    loadGuideState() {
        const defaults = {
            mainMenuIntroSeen: false,
            firstBattleGuideSeen: false,
            battleLogHintSeen: false
        };
        if (typeof localStorage === 'undefined') return defaults;
        try {
            const raw = localStorage.getItem('theDefierGuideStateV1');
            if (!raw) return defaults;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return defaults;
            return { ...defaults, ...parsed };
        } catch (e) {
            console.warn('Guide state parse failed, fallback to defaults.', e);
            return defaults;
        }
    }

    saveGuideState() {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem('theDefierGuideStateV1', JSON.stringify(this.guideState || {}));
        } catch (e) {
            console.warn('Guide state save failed.', e);
        }
    }

    markGuideSeen(key) {
        if (!this.guideState) this.guideState = this.loadGuideState();
        if (!Object.prototype.hasOwnProperty.call(this.guideState, key) || this.guideState[key]) return;
        this.guideState[key] = true;
        this.saveGuideState();
    }

    getLegacyDefaults() {
        return {
            essence: 0,
            spent: 0,
            upgrades: {},
            lastPreset: null
        };
    }

    getLegacyUpgradeCatalog() {
        return [
            {
                id: 'vitalitySeed',
                name: '命元传承',
                icon: '❤️',
                maxLevel: 3,
                costs: [4, 8, 12],
                desc: '每级使开局最大生命 +6',
                effects: { startMaxHp: 6 }
            },
            {
                id: 'spiritPouch',
                name: '灵石囊',
                icon: '💰',
                maxLevel: 3,
                costs: [3, 6, 9],
                desc: '每级使开局灵石 +30',
                effects: { startGold: 30 }
            },
            {
                id: 'battleInsight',
                name: '先天悟性',
                icon: '⚡',
                maxLevel: 2,
                costs: [7, 11],
                desc: '每级首回合额外抽 1 张牌',
                effects: { firstTurnDrawBonus: 1 }
            },
            {
                id: 'forgemind',
                name: '锻意共鸣',
                icon: '⚒️',
                maxLevel: 3,
                costs: [5, 9, 13],
                desc: '每级使锻炉消耗降低 6%',
                effects: { forgeCostDiscount: 0.06 }
            },
            {
                id: 'mindLibrary',
                name: '识海扩容',
                icon: '📖',
                maxLevel: 2,
                costs: [8, 12],
                desc: '每级使战斗抽牌基数 +1',
                effects: { startDraw: 1 }
            }
        ];
    }

    getLegacyPresetCatalog() {
        return [
            {
                id: 'survivor',
                name: '稳健守成',
                icon: '🛡️',
                desc: '优先血量与经济，保证开局容错。',
                priority: ['vitalitySeed', 'spiritPouch', 'mindLibrary', 'forgemind', 'battleInsight']
            },
            {
                id: 'smith',
                name: '锻造流',
                icon: '⚒️',
                desc: '优先锻炉折扣与资源，强化中期成长。',
                priority: ['forgemind', 'spiritPouch', 'vitalitySeed', 'mindLibrary', 'battleInsight']
            },
            {
                id: 'tempo',
                name: '速攻流',
                icon: '⚡',
                desc: '优先首回合节奏与抽牌压制。',
                priority: ['battleInsight', 'mindLibrary', 'spiritPouch', 'forgemind', 'vitalitySeed']
            }
        ];
    }

    getLegacyRunDoctrineForPreset(presetId) {
        const base = {
            presetId: presetId || null,
            openingBattleBlockBonus: 0,
            firstAttackBonusPerBattle: 0,
            firstForgeExtraUpgradeOnce: 0,
            firstForgeBoostUsed: false
        };

        if (presetId === 'survivor') {
            return {
                ...base,
                openingBattleBlockBonus: 4
            };
        }

        if (presetId === 'smith') {
            return {
                ...base,
                firstForgeExtraUpgradeOnce: 1
            };
        }

        if (presetId === 'tempo') {
            return {
                ...base,
                firstAttackBonusPerBattle: 3
            };
        }

        return base;
    }

    getLegacyMissionForPreset(presetId) {
        if (presetId === 'survivor') {
            return {
                presetId,
                id: 'survivor_guard',
                name: '守成试炼',
                desc: '本轮累计获得 40 点护盾',
                eventType: 'gainBlock',
                target: 40,
                progress: 0,
                completed: false,
                rewardEssence: 6,
                rewardGranted: false
            };
        }

        if (presetId === 'smith') {
            return {
                presetId,
                id: 'smith_forge',
                name: '锻意试炼',
                desc: '完成 1 次锻炉抉择',
                eventType: 'forgeComplete',
                target: 1,
                progress: 0,
                completed: false,
                rewardEssence: 6,
                rewardGranted: false
            };
        }

        if (presetId === 'tempo') {
            return {
                presetId,
                id: 'tempo_strike',
                name: '疾势试炼',
                desc: '触发 3 次首击增伤',
                eventType: 'tempoFirstStrike',
                target: 3,
                progress: 0,
                completed: false,
                rewardEssence: 6,
                rewardGranted: false
            };
        }

        return null;
    }

    normalizeLegacyProgress(raw) {
        const defaults = this.getLegacyDefaults();
        const source = raw && typeof raw === 'object' ? raw : {};
        const normalized = {
            essence: Math.max(0, Math.floor(Number(source.essence) || 0)),
            spent: Math.max(0, Math.floor(Number(source.spent) || 0)),
            upgrades: {},
            lastPreset: null
        };

        const inputUpgrades = source.upgrades && typeof source.upgrades === 'object' ? source.upgrades : {};
        (this.legacyUpgradeCatalog || []).forEach(def => {
            const level = Math.max(0, Math.floor(Number(inputUpgrades[def.id]) || 0));
            normalized.upgrades[def.id] = Math.min(def.maxLevel, level);
        });

        if (normalized.spent > normalized.essence) {
            normalized.spent = normalized.essence;
        }

        const validPresetIds = (this.getLegacyPresetCatalog ? this.getLegacyPresetCatalog() : [])
            .map(p => p.id);
        if (typeof source.lastPreset === 'string' && validPresetIds.includes(source.lastPreset)) {
            normalized.lastPreset = source.lastPreset;
        }

        return { ...defaults, ...normalized };
    }

    loadLegacyProgress() {
        const defaults = this.getLegacyDefaults();
        if (typeof localStorage === 'undefined') return defaults;
        try {
            const raw = localStorage.getItem(this.legacyStorageKey);
            if (!raw) return defaults;
            return this.normalizeLegacyProgress(JSON.parse(raw));
        } catch (e) {
            console.warn('Legacy progress parse failed.', e);
            return defaults;
        }
    }

    saveLegacyProgress() {
        if (!this.legacyProgress) this.legacyProgress = this.getLegacyDefaults();
        this.legacyProgress = this.normalizeLegacyProgress(this.legacyProgress);
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem(this.legacyStorageKey, JSON.stringify(this.legacyProgress));
        } catch (e) {
            console.warn('Legacy progress save failed.', e);
        }
    }

    getLegacyUpgradeById(upgradeId) {
        if (!Array.isArray(this.legacyUpgradeCatalog)) return null;
        return this.legacyUpgradeCatalog.find(u => u.id === upgradeId) || null;
    }

    getLegacyUpgradeLevel(upgradeId) {
        if (!this.legacyProgress || !this.legacyProgress.upgrades) return 0;
        return Math.max(0, Math.floor(Number(this.legacyProgress.upgrades[upgradeId]) || 0));
    }

    getLegacyUpgradeCost(upgradeId, targetLevel = null) {
        const def = this.getLegacyUpgradeById(upgradeId);
        if (!def) return 0;
        const currentLevel = this.getLegacyUpgradeLevel(upgradeId);
        const level = targetLevel === null ? currentLevel + 1 : targetLevel;
        if (level < 1 || level > def.maxLevel) return 0;
        return def.costs[level - 1] || 0;
    }

    getLegacyUnspentEssence() {
        if (!this.legacyProgress) return 0;
        return Math.max(0, (this.legacyProgress.essence || 0) - (this.legacyProgress.spent || 0));
    }

    getLegacyBonuses() {
        const bonuses = {
            startMaxHp: 0,
            startGold: 0,
            startDraw: 0,
            firstTurnDrawBonus: 0,
            forgeCostDiscount: 0
        };

        (this.legacyUpgradeCatalog || []).forEach(def => {
            const level = this.getLegacyUpgradeLevel(def.id);
            if (!level || !def.effects) return;
            Object.keys(def.effects).forEach(key => {
                bonuses[key] = (bonuses[key] || 0) + (def.effects[key] * level);
            });
        });

        bonuses.forgeCostDiscount = Math.min(0.35, bonuses.forgeCostDiscount);
        return bonuses;
    }

    applyLegacyRunDoctrine(player, presetId = null) {
        if (!player) return;
        const doctrine = this.getLegacyRunDoctrineForPreset(presetId);
        player.legacyRunDoctrine = { ...doctrine };
    }

    applyLegacyRunMission(player, presetId = null) {
        if (!player) return;
        const mission = this.getLegacyMissionForPreset(presetId);
        player.legacyRunMission = mission ? { ...mission } : null;
    }

    handleLegacyMissionProgress(eventType, amount = 1) {
        if (!this.player || !this.player.legacyRunMission) return false;
        const mission = this.player.legacyRunMission;
        if (mission.completed) return false;
        if (mission.eventType !== eventType) return false;

        const delta = Math.max(0, Number(amount) || 0);
        if (delta <= 0) return false;
        const beforeProgress = Math.max(0, Number(mission.progress) || 0);
        mission.progress = Math.min(mission.target, beforeProgress + delta);

        const target = Math.max(1, Number(mission.target) || 1);
        const checkpoints = [0.25, 0.5, 0.75];
        const beforeRatio = beforeProgress / target;
        const afterRatio = mission.progress / target;

        const shouldBroadcastProgress =
            target <= 5 ||
            checkpoints.some(cp => beforeRatio < cp && afterRatio >= cp);
        if (shouldBroadcastProgress && !mission.completed && typeof Utils !== 'undefined' && Utils.showBattleLog) {
            Utils.showBattleLog(`传承试炼进度：${mission.name} ${mission.progress}/${mission.target}`);
        }

        if (mission.progress >= mission.target) {
            mission.completed = true;
            if (!mission.rewardGranted) {
                mission.rewardGranted = true;
                this.awardLegacyEssence(
                    mission.rewardEssence || 0,
                    `完成传承试炼：${mission.name}`
                );
                if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
                    Utils.showBattleLog(`传承试炼达成：${mission.name}`);
                }
            }
        }

        if (typeof this.refreshLegacyMissionTrackers === 'function') {
            this.refreshLegacyMissionTrackers();
        }
        return true;
    }

    refreshLegacyMissionTrackers() {
        if (this.battle && this.currentScreen === 'battle-screen' && typeof this.battle.updateLegacyMissionTracker === 'function') {
            this.battle.updateLegacyMissionTracker();
        }
        if (this.map && this.currentScreen === 'map-screen' && typeof this.map.updateLegacyMissionTracker === 'function') {
            this.map.updateLegacyMissionTracker();
        }
    }

    applyLegacyBonusesToPlayer(player, bonuses = null) {
        if (!player) return;
        const finalBonuses = bonuses || this.getLegacyBonuses();
        player.legacyBonuses = { ...finalBonuses };

        if (typeof player.recalculateStats === 'function') {
            player.recalculateStats();
        }

        if (finalBonuses.startGold > 0) {
            player.gold += finalBonuses.startGold;
        }
        if (finalBonuses.startMaxHp > 0) {
            player.currentHp = player.maxHp;
        }
    }

    awardLegacyEssence(amount, reason = '轮回感悟', options = {}) {
        const gain = Math.max(0, Math.floor(Number(amount) || 0));
        if (gain <= 0) return 0;
        if (!this.legacyProgress) this.legacyProgress = this.getLegacyDefaults();

        this.legacyProgress.essence = (this.legacyProgress.essence || 0) + gain;
        this.lastLegacyGain = gain;
        this.saveLegacyProgress();

        if (!options.silent && typeof Utils !== 'undefined' && Utils.showBattleLog) {
            Utils.showBattleLog(`【传承】${reason}：轮回精粹 +${gain}`);
        }

        return gain;
    }

    buyLegacyUpgrade(upgradeId, options = {}) {
        const def = this.getLegacyUpgradeById(upgradeId);
        if (!def) return false;

        const currentLevel = this.getLegacyUpgradeLevel(upgradeId);
        if (currentLevel >= def.maxLevel) return false;

        const cost = this.getLegacyUpgradeCost(upgradeId, currentLevel + 1);
        if (this.getLegacyUnspentEssence() < cost) return false;

        this.legacyProgress.upgrades[upgradeId] = currentLevel + 1;
        this.legacyProgress.spent = (this.legacyProgress.spent || 0) + cost;
        this.saveLegacyProgress();

        if (!options.silent && typeof Utils !== 'undefined' && Utils.showBattleLog) {
            Utils.showBattleLog(`传承提升：${def.name} Lv.${currentLevel + 1}`);
        }
        return true;
    }

    applyLegacyPreset(presetId, options = {}) {
        const presets = this.getLegacyPresetCatalog();
        const preset = presets.find(p => p.id === presetId);
        if (!preset) return { success: false, reason: 'preset_not_found', allocated: 0 };

        const resetFirst = options.resetFirst !== false;
        if (resetFirst) {
            this.legacyProgress.spent = 0;
            this.legacyProgress.upgrades = {};
        }

        const beforeSpent = this.legacyProgress.spent || 0;
        let changed = true;
        while (changed) {
            changed = false;
            for (const upgradeId of preset.priority) {
                if (this.buyLegacyUpgrade(upgradeId, { silent: true })) {
                    changed = true;
                }
            }
        }

        this.legacyProgress.lastPreset = preset.id;
        this.saveLegacyProgress();
        const allocated = Math.max(0, (this.legacyProgress.spent || 0) - beforeSpent);

        if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
            Utils.showBattleLog(`已套用预设【${preset.name}】，投入 ${allocated} 精粹`);
        }
        return { success: true, allocated, preset };
    }

    resetLegacyUpgrades() {
        if (!this.legacyProgress || (this.legacyProgress.spent || 0) <= 0) return;

        this.showConfirmModal(
            '重置传承将返还全部已投入精粹，是否继续？',
            () => {
                this.legacyProgress.spent = 0;
                this.legacyProgress.upgrades = {};
                this.saveLegacyProgress();
                this.initInheritanceScreen();
                if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
                    Utils.showBattleLog('传承已重置，全部精粹已返还。');
                }
            }
        );
    }

    showLegacyScreen() {
        this.showScreen('inheritance-screen');
    }

    initInheritanceScreen() {
        const summary = document.getElementById('inheritance-summary');
        const presetsEl = document.getElementById('inheritance-presets');
        const grid = document.getElementById('inheritance-upgrade-grid');
        const note = document.getElementById('inheritance-run-note');
        if (!summary || !grid) return;

        const total = this.legacyProgress?.essence || 0;
        const spent = this.legacyProgress?.spent || 0;
        const unspent = this.getLegacyUnspentEssence();
        const bonuses = this.getLegacyBonuses();

        summary.innerHTML = `
            <div class="inheritance-stat">
                <span class="label">轮回精粹</span>
                <span class="value">${total}</span>
            </div>
            <div class="inheritance-stat">
                <span class="label">可分配</span>
                <span class="value highlight">${unspent}</span>
            </div>
            <div class="inheritance-stat">
                <span class="label">已投入</span>
                <span class="value">${spent}</span>
            </div>
        `;

        const activePresetId = this.legacyProgress?.lastPreset || null;
        const presetDefs = this.getLegacyPresetCatalog();
        const activePreset = presetDefs.find(p => p.id === activePresetId);
        if (note) {
            const presetText = activePreset ? `｜当前预设：${activePreset.name}` : '';
            const mission = this.getLegacyMissionForPreset(activePresetId);
            const missionText = mission ? `｜本轮试炼：${mission.desc}（奖励 +${mission.rewardEssence} 精粹）` : '';
            note.textContent = `当前加成：开局HP +${bonuses.startMaxHp}｜开局灵石 +${bonuses.startGold}｜抽牌 +${bonuses.startDraw}｜首回合额外抽牌 +${bonuses.firstTurnDrawBonus}｜锻炉减耗 ${Math.round((bonuses.forgeCostDiscount || 0) * 100)}%${presetText}${missionText}`;
        }

        if (presetsEl) {
            presetsEl.innerHTML = '';
            presetDefs.forEach(preset => {
                const btn = document.createElement('button');
                const isActive = activePresetId === preset.id;
                btn.className = `inheritance-preset-btn ${isActive ? 'active' : ''}`;
                btn.innerHTML = `
                    <span class="icon">${preset.icon}</span>
                    <span class="name">${preset.name}</span>
                    <span class="desc">${preset.desc}</span>
                `;
                btn.onclick = () => {
                    this.showConfirmModal(
                        `套用【${preset.name}】将重置当前传承分配并重新投入，是否继续？`,
                        () => {
                            this.applyLegacyPreset(preset.id, { resetFirst: true });
                            this.initInheritanceScreen();
                        }
                    );
                };
                presetsEl.appendChild(btn);
            });
        }

        grid.innerHTML = '';
        (this.legacyUpgradeCatalog || []).forEach(def => {
            const level = this.getLegacyUpgradeLevel(def.id);
            const canLevel = level < def.maxLevel;
            const nextCost = this.getLegacyUpgradeCost(def.id, level + 1);
            const affordable = canLevel && unspent >= nextCost;

            const card = document.createElement('div');
            card.className = `inheritance-card ${canLevel ? '' : 'maxed'}`;
            card.innerHTML = `
                <div class="inheritance-card-header">
                    <div class="icon">${def.icon}</div>
                    <div class="meta">
                        <div class="name">${def.name}</div>
                        <div class="level">Lv.${level}/${def.maxLevel}</div>
                    </div>
                </div>
                <div class="inheritance-desc">${def.desc}</div>
                <div class="inheritance-card-footer">
                    <span class="cost">${canLevel ? `消耗 ${nextCost}` : '已满级'}</span>
                    <button class="menu-btn small ${affordable ? 'primary' : ''}" ${canLevel ? '' : 'disabled'}>
                        ${canLevel ? '投入精粹' : '已圆满'}
                    </button>
                </div>
            `;

            const btn = card.querySelector('button');
            if (btn && canLevel) {
                if (affordable) {
                    btn.onclick = () => {
                        if (this.buyLegacyUpgrade(def.id)) {
                            this.initInheritanceScreen();
                        }
                    };
                } else {
                    btn.disabled = true;
                }
            }

            grid.appendChild(card);
        });
    }

    tryShowMainMenuGuide() {
        if (!this.guideState || this.guideState.mainMenuIntroSeen) return;
        this.markGuideSeen('mainMenuIntroSeen');
        setTimeout(() => {
            Utils.showBattleLog('新手提示：先点“新的轮回”进入选角，游客模式也可直接开局。', {
                category: 'system',
                duration: 3400
            });
        }, 400);
    }

    showFirstBattleGuide() {
        if (!this.guideState || this.guideState.firstBattleGuideSeen) return;
        this.markGuideSeen('firstBattleGuideSeen');

        const tips = [
            '新手提示：先看敌方意图，再决定是进攻还是防御。',
            '新手提示：打完牌后，点击“结束回合”推进战斗。',
            '新手提示：按 L 可以打开战斗记录，复盘每次触发。'
        ];
        tips.forEach((msg, idx) => {
            setTimeout(() => {
                Utils.showBattleLog(msg, { category: 'system', duration: 2800 });
            }, idx * 1700);
        });
    }

    // 继续游戏
    continueGame() {
        console.log('[Debug] continueGame called');
        // 云功能可用时才强制登录
        if (typeof AuthService === 'undefined') {
            console.error('[Debug] AuthService missing');
            alert('登录系统未就绪，请刷新重试！(AuthService missing)');
            return;
        }
        if (AuthService.isCloudEnabled && AuthService.isCloudEnabled() && !AuthService.isLoggedIn()) {
            console.log('[Debug] Not logged in, showing modal');
            this.showLoginModal();
            return;
        }

        console.log('[Debug] Logged in. loadGameResult:', this.loadGameResult);
        if (this.loadGameResult) {
            console.log('[Debug] Calling showScreen("map-screen")');
            this.showScreen('map-screen');
        } else {
            // 如果加载失败（比如存档被手动删了），刷新页面或提示
            console.warn('[Debug] loadGameResult false, reloading');
            window.location.reload();
        }
    }



    // 绑定全局事件
    bindGlobalEvents() {
        // ESC关闭模态框
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                if (typeof Utils !== 'undefined' && Utils.toggleBattleLogPanel) {
                    Utils.toggleBattleLogPanel(false);
                }
                return;
            }

            if ((e.key === 'l' || e.key === 'L') && typeof Utils !== 'undefined' && Utils.toggleBattleLogPanel) {
                const activeTag = document.activeElement ? document.activeElement.tagName : '';
                if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
                e.preventDefault();
                Utils.toggleBattleLogPanel();
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
        // 如果存在当前背景图，使用图片背景
        this.updateRealmBackground(this.player.realm || 1);
    }

    // 更新天域背景
    updateRealmBackground(realm) {
        // 确保 default 为 1
        realm = realm || 1;

        // 查找是否有对应的背景图
        // 映射规则：1-3重天有专属图
        let bgImage = '';
        if (realm === 1) bgImage = 'assets/images/realms/realm_bg_1.webp';
        else if (realm === 2) bgImage = 'assets/images/realms/realm_bg_2.webp';
        else if (realm === 3) bgImage = 'assets/images/realms/realm_bg_3.webp';
        else if (realm === 7) bgImage = 'assets/images/bg_realm_7.png';
        else if (realm === 8) bgImage = 'assets/images/bg_realm_8.png';
        else if (realm === 9) bgImage = 'assets/images/bg_realm_9.png';
        else if (realm === 10) bgImage = 'assets/images/bg_realm_10.png';
        else if (realm === 11) bgImage = 'assets/images/bg_realm_11.png';
        else if (realm === 12) bgImage = 'assets/images/bg_realm_12.png';
        else if (realm === 13) bgImage = 'assets/images/bg_realm_13.png';
        else if (realm === 14) bgImage = 'assets/images/bg_realm_14.png';
        else if (realm === 15) bgImage = 'assets/images/bg_realm_15.png';
        else if (realm === 16) bgImage = 'assets/images/bg_realm_16.png';
        else if (realm === 17) bgImage = 'assets/images/bg_realm_17.png';
        else if (realm === 18) bgImage = 'assets/images/bg_realm_18.png';

        const existing = document.getElementById('dynamic-bg');
        if (existing) existing.remove();

        const bg = document.createElement('div');
        bg.className = 'dynamic-bg';
        bg.id = 'dynamic-bg';

        if (bgImage) {
            bg.classList.add('is-image-bg');
            bg.style.backgroundImage = `url('${bgImage}')`;
            // 添加遮罩层以确保文字可读性
            const overlay = document.createElement('div');
            overlay.className = 'bg-overlay';
            bg.appendChild(overlay);
        } else {
            // Fallback to procedural stars
            for (let i = 0; i < 50; i++) {
                const star = document.createElement('div');
                star.className = 'bg-star';
                star.style.left = `${Math.random() * 100}%`;
                star.style.top = `${Math.random() * 100}%`;
                star.style.animationDelay = `${Math.random() * 3}s`;
                bg.appendChild(star);
            }
            // Cloud layers
            for (let i = 0; i < 3; i++) {
                const cloud = document.createElement('div');
                cloud.className = 'bg-cloud';
                cloud.style.top = `${20 + i * 25}%`;
                cloud.style.animationDelay = `${i * 20}s`;
                bg.appendChild(cloud);
            }
        }

        document.body.prepend(bg);
    }

    // 保存游戏
    // 保存游戏
    saveGame() {
        try {
            const gameState = {
                version: '5.1.0',
                player: this.player.getState(),
                map: {
                    nodes: this.map.nodes,
                    currentNodeIndex: this.map.currentNodeIndex,
                    completedNodes: this.map.completedNodes
                },
                unlockedRealms: this.unlockedRealms || [1],
                currentScreen: this.currentScreen,
                saveSlot: this.currentSaveSlot, // Persist the slot ID
                combatMeta: {
                    stance: this.player.stance || 'neutral',
                    ruleVersion: 'combat-v2',
                    battleUIUpdates: this.performanceStats.battleUIUpdates || 0
                },
                pvpMeta: {
                    ruleVersion: 'pvp-v2',
                    lastKnownDivision: (typeof PVPService !== 'undefined' && PVPService.currentRankData) ? PVPService.currentRankData.division : null
                },
                legacyProgress: this.legacyProgress,
                featureFlags: { ...this.featureFlags },
                schemaMigratedAt: Date.now(),
                timestamp: Date.now()
            };
            localStorage.setItem('theDefierSave', JSON.stringify(gameState));
            console.log('游戏已保存 (本地)');

            // 如果已登录，且知道当前的存档槽位，自动同步到云端
            // 防止 unset slot 默认为 0 覆盖了 Slot 1
            const targetSlot = this.currentSaveSlot;
            if (AuthService.isLoggedIn() && targetSlot !== null && targetSlot !== undefined) {
                AuthService.saveCloudData(gameState, targetSlot).then(res => {
                    if (res.success) {
                        console.log(`游戏已同步 (云端 Slot ${targetSlot})`);
                        // Update cache
                        this.cachedSlots[targetSlot] = gameState;
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

    migrateSaveData(rawSave) {
        const migrated = rawSave && typeof rawSave === 'object' ? rawSave : {};
        const normalizeLegacy = (source) => {
            const progress = source && typeof source === 'object' ? source : {};
            const essence = Math.max(0, Math.floor(Number(progress.essence) || 0));
            const spent = Math.max(0, Math.floor(Number(progress.spent) || 0));
            const upgrades = progress.upgrades && typeof progress.upgrades === 'object' ? progress.upgrades : {};
            return {
                essence,
                spent: Math.min(spent, essence),
                upgrades
            };
        };
        if (!migrated.version) {
            migrated.version = '5.0.0';
        }

        const isLegacy = migrated.version < '5.1.0';
        if (isLegacy) {
            migrated.combatMeta = migrated.combatMeta || {
                stance: migrated.player && migrated.player.stance ? migrated.player.stance : 'neutral',
                ruleVersion: 'combat-v2',
                battleUIUpdates: 0
            };
            migrated.pvpMeta = migrated.pvpMeta || {
                ruleVersion: 'pvp-v2',
                lastKnownDivision: null
            };
            migrated.legacyProgress = normalizeLegacy(migrated.legacyProgress);
            migrated.featureFlags = migrated.featureFlags || { ...this.featureFlags };
            migrated.schemaMigratedAt = Date.now();
            migrated.version = '5.1.0';
        } else {
            migrated.combatMeta = migrated.combatMeta || {};
            migrated.pvpMeta = migrated.pvpMeta || {};
            migrated.legacyProgress = normalizeLegacy(migrated.legacyProgress);
            migrated.featureFlags = migrated.featureFlags || { ...this.featureFlags };
            migrated.schemaMigratedAt = migrated.schemaMigratedAt || Date.now();
        }

        return migrated;
    }

    // 加载游戏
    loadGame() {
        const savedData = localStorage.getItem('theDefierSave');
        if (!savedData) return false;

        try {
            let gameState = JSON.parse(savedData);
            gameState = this.migrateSaveData(gameState);
            this.legacyProgress = this.normalizeLegacyProgress(gameState.legacyProgress || this.legacyProgress);
            this.saveLegacyProgress();

            // 版本检查
            const currentVersion = '5.1.0';
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
            // 存档防篡改与边界修正：关键数值统一钳制
            const clampInt = (value, min, max, fallback = min) => {
                const num = Number(value);
                if (!Number.isFinite(num)) return fallback;
                return Math.max(min, Math.min(max, Math.floor(num)));
            };
            this.player.maxHp = clampInt(this.player.maxHp, 1, 999999, 100);
            this.player.currentHp = clampInt(this.player.currentHp, 1, this.player.maxHp, this.player.maxHp);
            this.player.maxEnergy = clampInt(this.player.maxEnergy, 1, 99, 3);
            this.player.currentEnergy = clampInt(this.player.currentEnergy, 0, this.player.maxEnergy, this.player.maxEnergy);
            this.player.gold = clampInt(this.player.gold, 0, 999999999, 0);
            this.player.realm = clampInt(this.player.realm, 1, 18, 1);
            if (!this.player.buffs || typeof this.player.buffs !== 'object') this.player.buffs = {};
            if (!Array.isArray(this.player.deck)) this.player.deck = [];
            if (!Array.isArray(this.player.hand)) this.player.hand = [];
            if (!Array.isArray(this.player.drawPile)) this.player.drawPile = [];
            if (!Array.isArray(this.player.discardPile)) this.player.discardPile = [];

            if (!this.player.legacyBonuses || typeof this.player.legacyBonuses !== 'object') {
                this.player.legacyBonuses = {
                    startMaxHp: 0,
                    startGold: 0,
                    startDraw: 0,
                    firstTurnDrawBonus: 0,
                    forgeCostDiscount: 0
                };
            }
            if (!this.player.legacyRunDoctrine || typeof this.player.legacyRunDoctrine !== 'object') {
                this.applyLegacyRunDoctrine(this.player, this.legacyProgress?.lastPreset || null);
            } else {
                const normalizedDoctrine = this.getLegacyRunDoctrineForPreset(
                    this.player.legacyRunDoctrine.presetId || this.legacyProgress?.lastPreset || null
                );
                this.player.legacyRunDoctrine = {
                    ...normalizedDoctrine,
                    ...this.player.legacyRunDoctrine,
                    firstForgeBoostUsed: !!this.player.legacyRunDoctrine.firstForgeBoostUsed
                };
            }
            if (!this.player.legacyRunMission || typeof this.player.legacyRunMission !== 'object') {
                this.applyLegacyRunMission(this.player, this.player.legacyRunDoctrine?.presetId || this.legacyProgress?.lastPreset || null);
            } else {
                const normalizedMission = this.getLegacyMissionForPreset(
                    this.player.legacyRunMission.presetId || this.player.legacyRunDoctrine?.presetId || this.legacyProgress?.lastPreset || null
                );
                if (normalizedMission) {
                    this.player.legacyRunMission = {
                        ...normalizedMission,
                        ...this.player.legacyRunMission,
                        progress: Math.max(0, Math.min(
                            normalizedMission.target,
                            Number(this.player.legacyRunMission.progress) || 0
                        )),
                        completed: !!this.player.legacyRunMission.completed,
                        rewardGranted: !!this.player.legacyRunMission.rewardGranted
                    };
                } else {
                    this.player.legacyRunMission = null;
                }
            }

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
                const rebuildCard = (savedCard) => {
                    if (!savedCard || typeof savedCard !== 'object') return null;
                    const cardId = typeof savedCard.id === 'string' ? savedCard.id : null;
                    const baseCard = cardId ? CARDS[cardId] : null;
                    if (!baseCard) {
                        console.warn('Dropped unknown card from save:', savedCard.id);
                        return null;
                    }

                    const deepClone = (value) => JSON.parse(JSON.stringify(value));
                    let card = deepClone(baseCard);
                    const upgraded = !!savedCard.upgraded;
                    if (upgraded) {
                        if (typeof Utils.upgradeCard === 'function') {
                            card = Utils.upgradeCard(deepClone(baseCard));
                        } else if (typeof upgradeCard === 'function') {
                            card = upgradeCard(deepClone(baseCard));
                        } else {
                            card.upgraded = true;
                        }
                    }

                    // 仅恢复运行时安全字段，避免被存档注入任意卡牌数据
                    if (savedCard.instanceId !== undefined && savedCard.instanceId !== null) {
                        card.instanceId = savedCard.instanceId;
                    }
                    if (savedCard.retain === true) card.retain = true;
                    if (savedCard.exhaust === true) card.exhaust = true;
                    if (savedCard.isTemp === true) card.isTemp = true;
                    if (savedCard.ethereal === true) card.ethereal = true;

                    const safeCost = Number(savedCard.cost);
                    if (Number.isFinite(safeCost)) {
                        card.cost = Math.max(0, Math.min(10, Math.floor(safeCost)));
                    }
                    const safeBaseCost = Number(savedCard.baseCost);
                    if (Number.isFinite(safeBaseCost)) {
                        card.baseCost = Math.max(0, Math.min(10, Math.floor(safeBaseCost)));
                    }
                    if (card.instanceId === undefined || card.instanceId === null) {
                        card.instanceId = this.player.generateCardId
                            ? this.player.generateCardId()
                            : `${card.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    }
                    return card;
                };

                const hydrateCards = (list) => {
                    if (!Array.isArray(list)) return [];
                    return list.map(rebuildCard).filter(Boolean);
                };

                this.player.deck = hydrateCards(this.player.deck);
                this.player.hand = hydrateCards(this.player.hand);
                this.player.drawPile = hydrateCards(this.player.drawPile);
                this.player.discardPile = hydrateCards(this.player.discardPile);
                if (this.player.deck.length < 5) {
                    throw new Error('存档卡组校验失败：有效卡牌不足');
                }

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

                // Migration: Fix permBuffs typo from old saves
                if (gameState.player.permBuffs && !gameState.player.permaBuffs) {
                    this.player.permaBuffs = gameState.player.permBuffs;
                }

                // Re-instantiate
                this.player.fateRing = new RingClass(this.player);
                this.player.fateRing.loadFromJSON(gameState.player.fateRing);

                // Check level up or initialization
                if (this.player.fateRing.checkLevelUp) {
                    this.player.fateRing.checkLevelUp();
                }

                // === 4. 重建法宝系统 (New System) ===
                // 初始化数组
                this.player.collectedTreasures = [];
                this.player.equippedTreasures = [];

                // 恢复收集库 (Collected)
                const hydrateTreasure = (savedT) => {
                    const baseT = TREASURES[savedT.id];
                    if (!baseT) {
                        console.warn('Unknown treasure:', savedT.id);
                        return savedT; // 未知法宝，保留原样
                    }
                    // 基础数据优先，只保留存档中的运行时数据
                    return {
                        ...baseT,           // 基础定义（icon, name, description, callbacks等）
                        id: savedT.id,
                        obtainedAt: savedT.obtainedAt || Date.now(),
                        data: savedT.data || (baseT.data ? { ...baseT.data } : {})
                    };
                };

                if (gameState.player.collectedTreasures) {
                    const hydrated = gameState.player.collectedTreasures.map(hydrateTreasure);
                    // 去重：保留最后获得的或者是第一个？应该根据ID去重
                    const uniqueMap = new Map();
                    hydrated.forEach(t => {
                        if (!uniqueMap.has(t.id)) {
                            uniqueMap.set(t.id, t);
                        } else {
                            // 如果已存在，可以检查是否需要合并数据的逻辑，但目前法宝没有复杂数据
                            // 简单的保留第一个即可
                            console.log(`Removed duplicate treasure: ${t.id}`);
                        }
                    });
                    this.player.collectedTreasures = Array.from(uniqueMap.values());
                } else if (gameState.player.treasures) {
                    // 兼容旧存档：旧treasures视为"已收集且已装备"
                    const hydrated = gameState.player.treasures.map(hydrateTreasure);
                    // 同样去重
                    const uniqueMap = new Map();
                    hydrated.forEach(t => {
                        if (!uniqueMap.has(t.id)) uniqueMap.set(t.id, t);
                    });
                    this.player.collectedTreasures = Array.from(uniqueMap.values());
                }

                // 恢复已装备 (Equipped)
                if (gameState.player.equippedTreasures) {
                    // 新存档: 存储的是ID列表
                    const uniqueEquippedIds = new Set(gameState.player.equippedTreasures);
                    uniqueEquippedIds.forEach(tid => {
                        // 兼容性：如果碰巧存的是对象（极其罕见），尝试取id
                        const id = (typeof tid === 'object' && tid.id) ? tid.id : tid;
                        const t = this.player.collectedTreasures.find(ct => ct.id === id);
                        if (t) this.player.equippedTreasures.push(t);
                    });
                } else if (gameState.player.treasures) {
                    // 兼容旧存档：将所有法宝放入收集库，只装备前N个
                    this.player.equippedTreasures = [...this.player.collectedTreasures];
                }

                // 修复：确保装备数量不超过槽位上限
                const maxSlots = this.player.getMaxTreasureSlots();
                if (this.player.equippedTreasures.length > maxSlots) {
                    console.log(`载入存档：装备法宝超限 (${this.player.equippedTreasures.length}/${maxSlots})，已自动调整`);
                    // 超出部分移回仓库（仍在 collectedTreasures 中，只是不在 equippedTreasures 中）
                    this.player.equippedTreasures = this.player.equippedTreasures.slice(0, maxSlots);
                }

                // Sync references
                this.player.treasures = this.player.equippedTreasures;

                // Fix: Robust Max Realm Logic - Prevent Regression
                const savedMax = gameState.player.maxRealmReached || 1;
                const derivedMax = Math.max(...(gameState.unlockedRealms || [1]), 1);
                // Always take the HIGHER value to prevent progress loss
                this.player.maxRealmReached = Math.max(savedMax, derivedMax, this.player.maxRealmReached || 1);
            }

            // Retroactive Skill Unlock (Fix for existing saves)
            // 确保旧存档中通过了天劫的玩家能解锁对应技能
            if (this.player.realm >= 5) this.player.unlockUltimate(1);
            if (this.player.realm >= 10) this.player.unlockUltimate(2);
            if (this.player.realm >= 15) this.player.unlockUltimate(3);
            if (this.player.realm >= 18) this.player.unlockUltimate(4);

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
                            if (typeof Utils.upgradeCard === 'function') {
                                newCard = Utils.upgradeCard(newCard);
                            } else if (typeof upgradeCard === 'function') {
                                newCard = upgradeCard(newCard);
                            } else {
                                newCard.upgraded = true;
                            }
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
            if (gameState.combatMeta && gameState.combatMeta.stance) {
                this.player.stance = gameState.combatMeta.stance;
            } else {
                this.player.stance = this.player.stance || 'neutral';
            }
            this.featureFlags = { ...this.featureFlags, ...(gameState.featureFlags || {}) };

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
        const lawGrid = document.getElementById('law-archive-grid');
        const resonanceList = document.getElementById('resonance-manual-list');

        // 确保容器存在
        if (!lawGrid || !resonanceList) {
            console.warn('New Codex UI structure not found.');
            return;
        }

        // --- 1. 渲染法则库 (Jade Slips) ---
        lawGrid.innerHTML = '';

        for (const lawId in LAWS) {
            const law = LAWS[lawId];
            const collected = this.player.collectedLaws.some(l => l.id === lawId);

            const item = document.createElement('div');
            item.className = `law-item ${collected ? '' : 'locked'}`;

            // 构建内容
            let contentHtml = '';

            // Dao Type Mapping based on Rarity
            let daoType = '小道';
            if (law.rarity === 'legendary') daoType = '无上大道';
            else if (law.rarity === 'epic') daoType = '三千大道';
            else daoType = '旁门小道';

            // 密封层 (Locked)
            if (!collected) {
                contentHtml += `<div class="law-seal-overlay">封</div>`;
            }

            contentHtml += `
                <div class="law-icon-wrapper">${collected ? law.icon : '?'}</div>
                <div class="law-name">${collected ? law.name : '？？？'}</div>
                <div class="law-type-tag ${law.rarity}">${daoType}</div>
            `;

            item.innerHTML = contentHtml;

            if (collected) {
                // 点击查看详情
                item.addEventListener('click', () => {
                    // 尝试获取被动效果描述
                    let passiveText = '';
                    if (typeof getLawPassiveDescription === 'function') {
                        passiveText = getLawPassiveDescription(law);
                    } else if (law.passive) {
                        passiveText = `被动: ${law.passive.type} ${law.passive.value}`;
                    }

                    let detailMsg = `${law.description}`;
                    if (passiveText) {
                        detailMsg += `\n\n🔎 被动效果:\n${passiveText}`;
                    }
                    this.showAlertModal(detailMsg, law.name);
                });
            } else {
                item.addEventListener('click', () => {
                    this.showAlertModal('此法则尚处于迷雾之中，需在轮回中窃取获得。', '未解之谜');
                });
            }

            lawGrid.appendChild(item);
        }

        // --- 2. 渲染共鸣手册 (Bamboo Scrolls) ---
        resonanceList.innerHTML = '';

        if (typeof LAW_RESONANCES === 'undefined') {
            resonanceList.innerHTML = '<div style="padding:20px; color:#666;">暂无记载</div>';
            return;
        }

        for (const resKey in LAW_RESONANCES) {
            const res = LAW_RESONANCES[resKey];

            const isActive = this.player.activeResonances && this.player.activeResonances.some(r => r.id === res.id);

            const resScroll = document.createElement('div');
            resScroll.className = `resonance-item ${isActive ? 'active' : ''}`;

            // 构建法则组件图标 + 名称列表
            let componentsHtml = '';
            let reqNames = [];

            if (res.laws) {
                componentsHtml = res.laws.map(lawId => {
                    const l = LAWS[lawId];
                    // 在图鉴中，如果玩家收集过该法则，则点亮该组件
                    const hasLaw = this.player.collectedLaws.some(cl => cl.id === lawId);

                    if (l) reqNames.push(l.name);

                    return `
                        <div class="res-component-icon ${hasLaw ? 'has-law' : ''}" title="${l ? l.name : lawId}">
                            ${l ? l.icon : '?'}
                        </div>
                    `;
                }).join('');
            }

            resScroll.innerHTML = `
                <div class="resonance-info">
                    <div class="resonance-title">
                        ${res.name}
                        ${isActive ? '<span style="color:var(--accent-gold); font-size:1rem; margin-left:10px;">(当前激活)</span>' : ''}
                    </div>
                    <div class="resonance-reqs">
                        <span style="color:#666; font-size:0.9rem;">所需法则: </span>
                        <span style="color:var(--accent-gold); font-size:0.9rem;">${reqNames.join(' + ')}</span>
                    </div>
                    <div class="resonance-desc">${res.description}</div>
                    <div class="resonance-effect">📜 效果: ${this.formattingResonanceEffect(res.effect)}</div>
                </div>
                <div class="resonance-components">
                    ${componentsHtml}
                </div>
            `;

            resonanceList.appendChild(resScroll);
        }
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

        // 1. 渲染进度部分 (Cultivation Progress)
        const progress = this.achievementSystem.getProgress();
        const progressPercent = Math.floor((progress.completed / progress.total) * 100);

        const progressSection = document.createElement('div');
        progressSection.className = 'achievements-header-stats';
        progressSection.innerHTML = `
            <div class="achievement-progress-card">
                <div class="progress-label">修行进度</div>
                <div class="progress-track">
                    <div class="progress-fill" style="width: ${progressPercent}%"></div>
                </div>
                <div class="progress-text">${progressPercent}%</div>
            </div>
        `;
        container.appendChild(progressSection);

        // 2. 渲染每个分类
        for (const catId in categories) {
            const catInfo = ACHIEVEMENT_CATEGORIES[catId];
            const catAchievements = categories[catId];

            const catEl = document.createElement('div');
            catEl.className = 'achievement-category';
            catEl.innerHTML = `
                <div class="category-header">
                    <h3>${catInfo.icon} ${catInfo.name}</h3>
                    <div class="ink-decoration"></div>
                </div>
                <div class="achievement-grid">
                    ${catAchievements.map(a => {
                const statusClass = a.unlocked ? 'unlocked' : 'locked';
                const rewardText = getAchievementRewardText(a);

                // Condition Met but Reward Not Claimed
                const canClaim = a.unlocked && !a.claimed;
                const isClaimed = a.claimed;

                let actionHtml = '';
                if (canClaim) {
                    actionHtml = `
                                <button class="claim-btn pulse" onclick="game.claimAchievement('${a.id}')">
                                    <span class="btn-text">领取奖励</span>
                                </button>
                            `;
                } else if (isClaimed) {
                    actionHtml = `<div class="claimed-badge">已领取</div>`;
                }

                return `
                        <div class="achievement-card ${statusClass} ${isClaimed ? 'claimed' : ''}">
                            ${isClaimed ? '<div class="achievement-status-icon">✓</div>' : ''}
                            <div class="achievement-icon-wrapper">
                                ${a.icon}
                            </div>
                            <div class="achievement-content">
                                <div class="achievement-title">${a.name}</div>
                                <div class="achievement-desc">${a.description}</div>
                                ${a.unlocked ? `<div class="achievement-reward-tag">${rewardText}</div>` : ''}
                                ${actionHtml}
                            </div>
                        </div>
                        `;
            }).join('')}
                </div>
            `;

            container.appendChild(catEl);
        }
    }

    // Claim Achievement Wrapper
    claimAchievement(id) {
        const result = this.achievementSystem.claimReward(id);
        if (result.success) {
            // Re-render UI to show "Claimed" status
            this.initAchievements();
            // Optional: Play Sound
            // this.audio.play('success');

            // Show toast or something?
            // The AchievementSystem already queues a popup for "Claimed" if we want,
            // or we can implement a specific visual here.
            this.achievementSystem.queuePopup(ACHIEVEMENTS[id], 'claimed');
        } else {
            console.warn('Cannot claim:', result.reason);
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

    // 初始化关卡选择界面 (Refactored for Ink & Gold UI)
    // 初始化关卡选择界面 (Refactored for Ink & Gold UI - Spirit Tablets)
    initRealmSelect() {
        const listContainer = document.getElementById('realm-list-container');
        if (!listContainer) return;

        listContainer.innerHTML = '';
        this.selectedRealmId = null;

        // Visual Themes for each Realm
        const REALM_THEMES = {
            1: { icon: '🛖', color: '#B0BEC5', bg: 'linear-gradient(135deg, #263238 0%, #102027 100%)', bgImage: 'assets/images/realms/realm_bg_1.webp' }, // Mortal Dust
            2: { icon: '🌬️', color: '#81D4FA', bg: 'linear-gradient(135deg, #01579B 0%, #002f6c 100%)', bgImage: 'assets/images/realms/realm_bg_2.webp' }, // Qi Flow
            3: { icon: '🧱', color: '#BCAAA4', bg: 'linear-gradient(135deg, #4E342E 0%, #261a17 100%)', bgImage: 'assets/images/realms/realm_bg_3.webp' }, // Foundation
            4: { icon: '🌕', color: '#FFD54F', bg: 'linear-gradient(135deg, #FF6F00 0%, #8f3e00 100%)', bgImage: 'assets/images/realms/realm-4-bg.png' }, // Golden Core
            5: { icon: '👶', color: '#FFAB91', bg: 'linear-gradient(135deg, #BF360C 0%, #5f1a05 100%)', bgImage: 'assets/images/realms/realm-5-bg.png' }, // Nascent Soul
            6: { icon: '🧘', color: '#CE93D8', bg: 'linear-gradient(135deg, #4A148C 0%, #220542 100%)', bgImage: 'assets/images/realms/realm-6-bg.png' }, // Divine Spirit
            7: { icon: '🔗', color: '#80CBC4', bg: 'linear-gradient(135deg, #004D40 0%, #00251f 100%)', bgImage: 'assets/images/bg_realm_7.png' }, // Integration
            8: { icon: '🚤', color: '#FFE082', bg: 'linear-gradient(135deg, #FF8F00 0%, #8f5000 100%)', bgImage: 'assets/images/bg_realm_8.png' }, // Great Vehicle
            9: { icon: '☁️', color: '#B3E5FC', bg: 'linear-gradient(135deg, #0277BD 0%, #003c5f 100%)', bgImage: 'assets/images/bg_realm_9.png' }, // Ascension
            10: { icon: '⛰️', color: '#A5D6A7', bg: 'linear-gradient(135deg, #1B5E20 0%, #0a290d 100%)', bgImage: 'assets/images/bg_realm_10.png' }, // Earthly Immortal
            11: { icon: '🕊️', color: '#F48FB1', bg: 'linear-gradient(135deg, #880E4F 0%, #440727 100%)', bgImage: 'assets/images/bg_realm_11.png' }, // Heavenly Peace
            12: { icon: '✨', color: '#FFF59D', bg: 'linear-gradient(135deg, #F9A825 0%, #7e520b 100%)', bgImage: 'assets/images/bg_realm_12.png' }, // Golden Immortal
            13: { icon: '🌌', color: '#9575CD', bg: 'linear-gradient(135deg, #311B92 0%, #150a42 100%)', bgImage: 'assets/images/bg_realm_13.png' }, // Great Luo
            14: { icon: '🌀', color: '#90A4AE', bg: 'linear-gradient(135deg, #263238 0%, #0f1619 100%)', bgImage: 'assets/images/bg_realm_14.png' }, // Chaos Origin
            15: { icon: '👑', color: '#EF9A9A', bg: 'linear-gradient(135deg, #B71C1C 0%, #520909 100%)', bgImage: 'assets/images/bg_realm_15.png' }, // Supreme
            16: { icon: '☯️', color: '#E0E0E0', bg: 'linear-gradient(135deg, #212121 0%, #000000 100%)', bgImage: 'assets/images/bg_realm_16.png' }, // Taiyi
            17: { icon: '🌳', color: '#C5E1A5', bg: 'linear-gradient(135deg, #33691E 0%, #163009 100%)', bgImage: 'assets/images/bg_realm_17.png' }, // Bodhi
            18: { icon: '🌑', color: '#757575', bg: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)', bgImage: 'assets/images/bg_realm_18.png' }  // Chaos Void
        };

        // 生成18重天卡片
        for (let i = 1; i <= 18; i++) {
            const isUnlocked = this.unlockedRealms && this.unlockedRealms.includes(i);
            const isCompleted = isUnlocked && this.unlockedRealms.includes(i + 1);

            const realmCard = document.createElement('div');
            // Add 'spirit-tablet' class conceptually, actual styling via .realm-card
            realmCard.className = `realm-card ${isUnlocked ? '' : 'locked'}`;
            realmCard.dataset.id = i;
            realmCard.style.animationDelay = `${i * 0.05}s`; // Staggered entrance

            const realmName = this.map.getRealmName(i);
            const env = this.map.getRealmEnvironment(i);
            const theme = REALM_THEMES[i] || { icon: '❓', color: '#fff', bg: '#222' };

            // Apply Theme
            // 设计要求：未解锁重天也展示背景图，仅通过遮罩和锁定标识区分状态。
            try {
                if (theme.bgImage) {
                    const overlay = isUnlocked
                        ? 'linear-gradient(to bottom, rgba(0,0,0,0) 30%, rgba(0,0,0,0.95) 100%)'
                        : 'linear-gradient(to bottom, rgba(0,0,0,0.35) 20%, rgba(0,0,0,0.92) 100%)';
                    realmCard.style.backgroundImage = `${overlay}, url('${theme.bgImage}')`;
                    realmCard.style.backgroundSize = 'cover';
                    realmCard.style.backgroundPosition = 'center';
                    realmCard.style.textShadow = '0 2px 4px #000';
                } else if (theme.bg) {
                    realmCard.style.background = theme.bg;
                }
            } catch (e) {
                console.warn('Realm card theme apply failed:', i, e);
            }

            realmCard.style.borderColor = isUnlocked ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.08)';
            // We'll let CSS hover handle the gold border, but we can set a custom property for the glow
            realmCard.style.setProperty('--theme-color', theme.color);

            // Icon selection
            // default to empty for unlocked realms as per user request
            let icon = '';
            if (!isUnlocked) icon = '🔒';

            // Hide icon if bgImage is present or if it's empty
            const iconStyle = ((isUnlocked && theme.bgImage) || !icon) ? 'display:none' : `text-shadow: 0 0 15px ${theme.color}40`;

            // Spirit Tablet Structure
            realmCard.innerHTML = `
                <div class="realm-icon" style="${iconStyle}">${icon}</div>
                <div class="realm-info">
                    <h3 style="${isUnlocked ? `color:${theme.color}` : ''}">${realmName}</h3>
                    ${isUnlocked ? `<span class="realm-env-preview">${env.name}</span>` : ''}
                </div>
            `;

            if (isUnlocked) {
                realmCard.addEventListener('click', () => {
                    this.selectRealm(i);
                });
            } else {
                // Locked click feedback
                realmCard.addEventListener('click', () => {
                    Utils.showBattleLog('此天域尚处于迷雾之中，需突破前一重方可踏入。');
                });
            }

            listContainer.appendChild(realmCard);
        }

        // Bind Enter Button
        const enterBtn = document.getElementById('enter-realm-btn');
        if (enterBtn) {
            // Remove old listeners by cloning
            const newBtn = enterBtn.cloneNode(true);
            enterBtn.parentNode.replaceChild(newBtn, enterBtn);

            newBtn.onclick = () => {
                if (this.selectedRealmId) {
                    const isCompleted = this.unlockedRealms && this.unlockedRealms.includes(this.selectedRealmId + 1);
                    this.startRealm(this.selectedRealmId, isCompleted);
                }
            };
        }

        // Auto-select logic
        let targetRealm = 1;
        const unlockedRealms = Array.isArray(this.unlockedRealms) && this.unlockedRealms.length > 0
            ? this.unlockedRealms
            : [1];
        if (unlockedRealms.length > 0) {
            targetRealm = Math.max(...unlockedRealms);
        }
        if (this.lastSelectedRealmId && unlockedRealms.includes(this.lastSelectedRealmId)) {
            targetRealm = this.lastSelectedRealmId;
        }

        this.selectRealm(targetRealm);
    }

    // 选择天域
    selectRealm(realmId) {
        if (this.selectedRealmId === realmId) return;
        this.selectedRealmId = realmId;
        this.lastSelectedRealmId = realmId;

        // 1. Highlight UI
        document.querySelectorAll('.realm-card').forEach(card => {
            if (parseInt(card.dataset.id) === realmId) {
                card.classList.add('active');
                card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            } else {
                card.classList.remove('active');
            }
        });

        // 2. Update Preview
        this.updateRealmPreview(realmId);

        // 3. Enable Button
        const enterBtn = document.getElementById('enter-realm-btn');
        if (enterBtn) {
            enterBtn.disabled = false;
            // Update button text contextually
            const unlocked = Array.isArray(this.unlockedRealms) ? this.unlockedRealms : [1];
            const isCompleted = unlocked.includes(realmId + 1);
            const btnText = enterBtn.querySelector('.btn-text') || enterBtn;
            if (isCompleted) {
                // enterBtn.innerHTML = '<span class="btn-text">重修此界</span>'; 
                // Keep simple text for now to avoid breaking structure if it relies on spans
                enterBtn.textContent = '重修此界';
            } else {
                enterBtn.textContent = '踏入天域';
            }
        }
    }

    // 更新预览面板 (Cloud Mirror)
    updateRealmPreview(realmId) {
        const panel = document.getElementById('realm-preview-panel');
        if (!panel) return;

        const placeholder = panel.querySelector('.realm-preview-placeholder');
        const content = panel.querySelector('.realm-preview-content');

        if (placeholder) placeholder.style.display = 'none';
        if (content) {
            content.style.display = 'flex';
            content.style.opacity = 0;
            setTimeout(() => content.style.opacity = 1, 50);
        }

        // Data
        const realmName = this.map.getRealmName(realmId);
        const env = this.map.getRealmEnvironment(realmId);

        // Update Header
        const titleEl = document.getElementById('preview-title');
        if (titleEl) titleEl.textContent = realmName;

        // Dynamic Icon based on Realm Type
        const iconEl = document.getElementById('preview-icon');
        if (iconEl) {
            let iconChar = '⚔️';
            if (realmId % 5 === 0) iconChar = '⚡'; // Boss Realms
            if (realmId === 18) iconChar = '🌌';
            iconEl.textContent = iconChar;
        }

        // Update Environment Section
        const envEl = document.getElementById('preview-env');
        if (envEl) {
            // Parse effect key to icon/color if needed, for now just rich text
            envEl.innerHTML = `
                <div style="margin-bottom:5px; color:var(--accent-gold); font-weight:bold; font-size:1.1rem;">
                    ${env.name}
                </div>
                <div style="font-size:0.95rem;">${env.desc}</div>
            `;
        }

        // Update Boss Section
        const bossInfo = this.getRealmBossInfo(realmId);
        const bossEl = document.getElementById('preview-boss');
        if (bossEl) {
            if (bossInfo) {
                // If bossInfo is just an object, we need to format it. 
                // Assuming getRealmBossInfo returns { bossName, mechDesc, ... } from the code I saw earlier
                // Wait, I saw getRealmBossInfo body partially. Let's assume it returns a consistent object or null.
                // Actually, I should probably check getRealmBossInfo implementation or rely on what was there.
                // The previous code had: const bossInfo = this.getRealmBossInfo(realmId);
                // I will replicate safe check.
                const name = bossInfo.bossName || '???';
                const desc = bossInfo.mechDesc || '未知的恐怖存在...';

                // Add logo if exists
                let logoHtml = '';
                if (bossInfo.logo) {
                    logoHtml = `<div style="text-align:center; margin-bottom:10px;">
                        <img src="${bossInfo.logo}" style="width:80px; height:80px; border-radius:50%; border:2px solid var(--accent-red); object-fit:cover;">
                   </div>`;
                }

                bossEl.innerHTML = `
                    ${logoHtml}
                    <div style="color:var(--accent-red); font-weight:bold; margin-bottom:5px;">${name}</div>
                    <div style="font-size:0.9rem; opacity:0.9;">${desc}</div>
                `;
            } else {
                bossEl.innerHTML = '<span style="color:#666;">此界并无所谓的主宰...</span>';
            }
        }

        // Update Rewards (Loot)
        const lootEl = document.getElementById('preview-loot');
        if (lootEl) {
            lootEl.innerHTML = '';

            // Generate visual loot icons
            const createLoot = (icon, type) => {
                const el = document.createElement('div');
                el.className = `loot-icon ${type}`;
                el.textContent = icon;
                return el;
            };

            lootEl.appendChild(createLoot('💰', 'common'));
            lootEl.appendChild(createLoot('🔮', 'rare'));

            if (realmId >= 5) lootEl.appendChild(createLoot('📜', 'epic')); // Jade Slips
            if (realmId >= 10) lootEl.appendChild(createLoot('🏺', 'legendary')); // Treasures
        }

        // Cost Display (if re-entering)
        const costDisplay = document.getElementById('realm-cost-display');
        const unlocked = Array.isArray(this.unlockedRealms) ? this.unlockedRealms : [1];
        const isCompleted = unlocked.includes(realmId + 1);
        if (costDisplay) {
            if (isCompleted) {
                costDisplay.style.display = 'block';
                costDisplay.innerHTML = `⚠️ 重修此界将 <span style="color:var(--accent-gold);">收益减半</span> (无法获得全额灵石与经验)`;
            } else {
                costDisplay.style.display = 'none';
            }
        }
    }

    // 获取天域Boss信息
    getRealmBossInfo(realm) {
        // 天域与Boss ID对照表
        const realmBossMap = {
            1: 'banditLeader',
            2: 'demonWolf',
            3: 'swordElder',
            4: 'danZun',
            5: 'ancientSpirit',
            6: 'divineLord',
            7: 'fusionSovereign',
            8: 'mahayanaSupreme',
            9: 'ascensionSovereign',
            10: 'dualMagmaGuardians',
            11: 'stormSummoner',
            12: 'triheadGoldDragon',
            13: 'mirrorDemon',
            14: 'chaosEye',
            15: 'voidDevourer',
            16: 'elementalElder',
            17: 'karmaArbiter',
            18: 'heavenlyDao'
        };

        const bossId = realmBossMap[realm];
        if (!bossId || typeof BOSS_MECHANICS === 'undefined' || !BOSS_MECHANICS[bossId]) {
            return { bossName: null, mechDesc: '', counterTreasure: '' };
        }

        const boss = BOSS_MECHANICS[bossId];
        const mechDesc = boss.mechanics?.description || '未知机制';

        // 获取克制法宝名称
        let counterNames = [];
        if (boss.countersBy && typeof TREASURES !== 'undefined') {
            counterNames = boss.countersBy
                .map(tid => TREASURES[tid]?.name || tid)
                .slice(0, 2); // 最多显示2个
        }

        return {
            bossName: boss.name,
            mechDesc: mechDesc,
            counterTreasure: counterNames.length > 0 ? counterNames.join(' / ') : '',
            logo: (typeof ENEMIES !== 'undefined' && ENEMIES[bossId]) ? ENEMIES[bossId].logo : null
        };
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
        // 标记是否为重玩 (已通关)
        this.player.isReplay = isReplay;
        // 新的开始（非原地复活）重置重修标记
        this.player.isRecultivation = false;

        this.player.resetBattleState(); // hypothetical helper, or manual reset

        this.map.generate(this.player.realm);
        this.showScreen('map-screen');
        this.autoSave();
    }

    // 显示界面
    showScreen(screenId) {
        console.log(`[Debug] showScreen called for: ${screenId}`);
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        const screen = document.getElementById(screenId);
        if (screen) {

            // Safety: Ensure screen is visible before running logic that might crash
            screen.classList.add('active');
            this.currentScreen = screenId;
            console.log(`[Debug] Screen ${screenId} set to active class.`);

            // Use Try-Catch to prevent logical errors from blocking UI rendering (Black Screen Fix)
            try {
                // Particle Control
                if (typeof particles !== 'undefined') {
                    if (screenId === 'main-menu') {
                        particles.startMainMenuParticles();
                        this.tryShowMainMenuGuide();
                    } else {
                        particles.stopMainMenuParticles();
                    }
                }

                // 特殊处理
                if (screenId === 'map-screen') {
                    console.log('[Debug] Initializing map-screen logic');
                    if (this.map) {
                        console.log('[Debug] Calling this.map.render()');
                        this.map.render();
                    } else {
                        console.error('[Debug] this.map is undefined!');
                    }
                    console.log('[Debug] Calling updatePlayerDisplay()');
                    this.updatePlayerDisplay();
                    this.refreshLegacyMissionTrackers();

                    // DEBUG: Check DOM state after render
                    setTimeout(() => {
                        const mapScreen = document.getElementById('map-screen');
                        if (mapScreen) {
                            const style = window.getComputedStyle(mapScreen);
                            console.log(`[Debug] #map-screen style: display=${style.display}, visibility=${style.visibility}, opacity=${style.opacity}, height=${style.height}, width=${style.width}, z-index=${style.zIndex}`);
                            console.log(`[Debug] #map-screen Parent: <${mapScreen.parentNode.tagName} id="${mapScreen.parentNode.id}" class="${mapScreen.parentNode.className}">`);
                            console.log(`[Debug] #map-screen innerHTML length: ${mapScreen.innerHTML.length}`);

                            // Audit body children for overlays
                            console.log('[Debug] Auditing Body Children for Overlays:');
                            Array.from(document.body.children).forEach(child => {
                                const s = window.getComputedStyle(child);
                                if (s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0) {
                                    console.log(`[Debug] Visible Child: <${child.tagName} id="${child.id}" class="${child.className}"> Z=${s.zIndex} Pos=${s.position} Rect=${child.getBoundingClientRect().height}x${child.getBoundingClientRect().width}`);
                                }
                            });
                        }
                    }, 500); // Delayed check

                } else if (screenId === 'battle-screen') {
                    console.log('[Debug] Initializing battle-screen logic');
                    this.updatePlayerDisplay();
                    this.refreshLegacyMissionTrackers();
                    if (!this.guideState.battleLogHintSeen) {
                        this.markGuideSeen('battleLogHintSeen');
                        setTimeout(() => {
                            Utils.showBattleLog('提示：按 L 可查看战斗记录面板。', {
                                category: 'system',
                                duration: 2600
                            });
                        }, 350);
                    }
                } else if (screenId === 'collection') {
                    this.initCollection();
                } else if (screenId === 'achievements-screen') {
                    this.initAchievements();
                } else if (screenId === 'inheritance-screen') {
                    this.initInheritanceScreen();
                } else if (screenId === 'character-select') {
                    this.updateCharacterInfo();
                } else if (screenId === 'realm-select-screen') {
                    this.initRealmSelect();
                }
                console.log(`[Debug] showScreen logic for ${screenId} completed successfully.`);
            } catch (e) {
                console.error(`Error initializing screen ${screenId}:`, e);
                // Try to show error safely
                if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
                    Utils.showBattleLog('界面加载异常: ' + e.message);
                }
            }
        } else {
            console.error(`[Debug] Screen element #${screenId} NOT FOUND in DOM!`);
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

                // Check if character is locked
                let locked = false;
                let lockReason = '';
                // Simple unlock logic (example)
                if (charId !== 'linFeng' && charId !== 'xiangYe' && charId !== 'yanHan' && charId !== 'wuYu') {
                    // locked = true; // Default lock logic if needed
                }

                const card = document.createElement('div');
                card.className = `character-card ${locked ? 'locked' : ''}`;
                card.dataset.id = charId;

                // Image handling
                let avatarHtml = '';
                if (char.image) {
                    avatarHtml = `<img src="${char.image}" class="char-avatar-img" alt="${char.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                                  <span class="char-avatar-emoji" style="display:none">${char.avatar}</span>`;
                } else if (char.portrait) {
                    avatarHtml = `<img src="${char.portrait}" class="char-avatar-img" alt="${char.name}">`;
                } else if (char.avatar && (char.avatar.includes('/') || char.avatar.includes('.'))) {
                    avatarHtml = `<img src="${char.avatar}" class="char-avatar-img" alt="${char.name}">`;
                } else {
                    avatarHtml = `<span class="char-avatar-emoji">${char.avatar}</span>`;
                }

                card.innerHTML = `
                    <div class="selected-mark">✔</div>
                    <div class="card-inner">
                        <div class="char-header">
                            <div class="char-ink-bg">✦</div>
                            <div class="char-avatar-wrapper">
                                ${avatarHtml}
                            </div>
                        </div>
                        <div class="char-body">
                            <div class="char-name">${char.name}</div>
                            <div class="char-title">${char.title}</div>
                            <div class="char-desc">${char.description}</div>
                            
                            <div class="char-relic-info">
                                <div class="relic-name"><span>🔮</span> ${char.relic.name}</div>
                                <div class="relic-desc">${char.relic.desc}</div>
                            </div>
                            
                            <div class="char-stats-preview">
                                <div class="stat-item">
                                    <span class="stat-value">${char.stats.maxHp}</span>
                                    <span class="stat-label">HP</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">${char.stats.energy}</span>
                                    <span class="stat-label">灵力</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">${char.stats.draw || 5}</span>
                                    <span class="stat-label">抽牌</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                if (!locked) {
                    card.addEventListener('click', () => {
                        this.selectCharacter(charId);
                    });
                }

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

        // 云功能可用时才强制登录
        if (this.shouldForceCloudLogin()) {
            this.showLoginModal();
            return;
        }

        // 清除旧存档，开始新游戏
        this.clearSave();
        this.startNewGame(this.selectedCharacterId);
    }

    // 开始新游戏
    startNewGame(characterId = 'linFeng') {
        // 游客模式下允许离线开始，不强制登录
        if (this.shouldForceCloudLogin()) {
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

        // 恢复解锁进度（如果从旧存档继承）
        if (this.tempPreservedRealms && Array.isArray(this.tempPreservedRealms)) {
            this.unlockedRealms = this.tempPreservedRealms;
            this.tempPreservedRealms = null; // Consume
            console.log('Restored unlocked realms from previous save:', this.unlockedRealms);
        } else {
            // 否则初始为1
            this.unlockedRealms = [1];
        }

        // Initialize Registration Time if new run
        if (!this.player.registerTime) {
            this.player.registerTime = Date.now();
        }

        // 应用局外传承加成（仅影响新的一轮）
        const legacyBonuses = this.getLegacyBonuses();
        this.applyLegacyBonusesToPlayer(this.player, legacyBonuses);
        this.applyLegacyRunDoctrine(this.player, this.legacyProgress?.lastPreset || null);
        this.applyLegacyRunMission(this.player, this.legacyProgress?.lastPreset || null);

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
        if (!this.player) return;

        const charId = this.player.characterId || 'linFeng';
        // Add Fallback for missing character data
        const char = (typeof CHARACTERS !== 'undefined' && CHARACTERS[charId]) ? CHARACTERS[charId] : { name: '未知修士' };

        const battleNameEl = document.getElementById('player-name-display');
        if (battleNameEl) {
            battleNameEl.textContent = char.name;
        }

        // Update Avatar (Image or Emoji)
        const faceEl = document.getElementById('player-face-display');
        if (faceEl) {
            // Reset styles
            faceEl.style.backgroundImage = '';
            faceEl.textContent = '';
            faceEl.className = 'player-face-visual';

            // Resolve Image Path: Check .image, .portrait (WuYu), or .avatar (Yan Han if path)
            const imagePath = char.image || char.portrait || (char.avatar && char.avatar.includes('/') ? char.avatar : null);

            if (imagePath) {
                faceEl.style.backgroundImage = `url('${imagePath}')`;
                faceEl.classList.add('is-image');
            } else {
                faceEl.textContent = char.avatar || '👤';
            }
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
        const enemyList = Array.isArray(enemies) ? enemies : [enemies];
        const isPvpBattle = enemyList.some(e => e && e.isGhost);
        this.mode = isPvpBattle ? 'pvp' : 'pve';
        if (!isPvpBattle) {
            this.pvpOpponentRank = null;
            this.pvpMatchTicket = null;
            if (typeof PVPService !== 'undefined' && typeof PVPService.clearActiveMatch === 'function') {
                PVPService.clearActiveMatch();
            }
        }

        this.currentEnemies = enemyList;
        this.currentBattleNode = node;
        this.stealAttempted = false;
        this.rewardCardSelected = false;
        this.comboCount = 0;
        this.lastCardType = null;

        this.showScreen('battle-screen');
        this.battle.init(enemyList);

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
    async onBattleWon(enemies) {
        if (this.mode === 'pvp') {
            await this.handlePVPVictory();
            return;
        }

        this.player.enemiesDefeated += enemies.length;

        // 命环获得经验
        let ringExp = enemies.reduce((sum, e) => sum + (e.ringExp || 10), 0);

        // 重玩收益减半
        if (this.player.isReplay) {
            ringExp = Math.floor(ringExp * 0.5);
        }

        // 遗物：逆命之环（额外获得25%经验）
        if (this.player.relic && this.player.relic.id === 'fateRing') {
            ringExp = Math.floor(ringExp * 1.10);
        }

        // 新节点：试炼节点额外收益
        if (this.currentBattleNode && this.currentBattleNode.type === 'trial') {
            ringExp = Math.floor(ringExp * 1.5);
            const trialGold = 80 + this.player.realm * 15;
            this.player.gold += trialGold;
            Utils.showBattleLog(`试炼胜利！额外获得 ${trialGold} 灵石`);
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
                    if (this.player.collectLaw(law)) {
                        Utils.showBattleLog(`领悟法则：${law.name}`);
                        this.achievementSystem.updateStat('lawsCollected', 1); // Update Achievement
                    } else {
                        // Fallback if already exists
                        this.player.gold += 100;
                        Utils.showBattleLog(`法则已存在，转化为 100 灵石`);
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
                await this.handleBossDefeated(enemy);
                return; // 结束函数，因为 handleBossDefeated 会处理后续界面
            }
        }

        // 正常显示奖励
        this.showScreen('reward-screen');
        this.generateRewards(enemies, ringExp);
    }

    // === PVP Result Handlers ===

    async handlePVPVictory() {
        console.log('PVP Victory!');
        const overlay = document.getElementById('pvp-result-overlay');
        const title = document.getElementById('pvp-result-title');
        const scoreVal = document.getElementById('pvp-current-score');
        const deltaVal = document.getElementById('pvp-score-delta');
        const oppName = document.getElementById('pvp-result-opponent');
        const oppScore = document.getElementById('pvp-result-opp-score');

        // Report
        let result = {
            newRating: (typeof PVPService !== 'undefined' && PVPService.currentRankData) ? (PVPService.currentRankData.score || 1000) : 1000,
            delta: 0
        };
        try {
            if (typeof PVPService !== 'undefined') {
                result = await PVPService.reportMatchResult(true, this.pvpOpponentRank, this.pvpMatchTicket);
            }
        } catch (e) {
            console.error('PVP Report Failed:', e);
        } finally {
            this.pvpMatchTicket = null;
        }

        // Update UI
        if (overlay) {
            overlay.className = 'screen pvp-result-overlay victory'; // Add victory class
            overlay.style.display = 'flex';

            title.textContent = '问道成功';
            scoreVal.textContent = result.newRating;
            // Fix: EloCalculator returns 'delta', not 'ratingChange'
            const change = result.delta !== undefined ? result.delta : (result.ratingChange || 0);
            deltaVal.textContent = change >= 0 ? `+${change}` : `${change}`;

            if (this.pvpOpponentRank && this.pvpOpponentRank.user) {
                oppName.textContent = this.pvpOpponentRank.user.username || '未知对手';
                oppScore.textContent = this.pvpOpponentRank.score || 1000;
            }
        }
        if (result && result.rejected) {
            Utils.showBattleLog('PVP 结算校验未通过，本场积分未变动。');
        }
    }

    async handlePVPDefeat() {
        console.log('PVP Defeat...');
        const overlay = document.getElementById('pvp-result-overlay');
        const title = document.getElementById('pvp-result-title');
        const scoreVal = document.getElementById('pvp-current-score');
        const deltaVal = document.getElementById('pvp-score-delta');
        const oppName = document.getElementById('pvp-result-opponent');
        const oppScore = document.getElementById('pvp-result-opp-score');

        // Report
        let result = {
            newRating: (typeof PVPService !== 'undefined' && PVPService.currentRankData) ? (PVPService.currentRankData.score || 1000) : 1000,
            delta: 0
        };
        try {
            if (typeof PVPService !== 'undefined') {
                result = await PVPService.reportMatchResult(false, this.pvpOpponentRank, this.pvpMatchTicket);
            }
        } catch (e) {
            console.error('PVP Report Failed:', e);
        } finally {
            this.pvpMatchTicket = null;
        }

        // Update UI
        if (overlay) {
            overlay.className = 'screen pvp-result-overlay defeat'; // Add defeat class
            overlay.style.display = 'flex';

            title.textContent = '道心受损';
            scoreVal.textContent = result.newRating;
            const change = result.delta !== undefined ? result.delta : (result.ratingChange || 0);
            deltaVal.textContent = `${change}`; // Usually negative

            if (this.pvpOpponentRank && this.pvpOpponentRank.user) {
                oppName.textContent = this.pvpOpponentRank.user.username || '未知对手';
                oppScore.textContent = this.pvpOpponentRank.score || 1000;
            }
        }
        if (result && result.rejected) {
            Utils.showBattleLog('PVP 结算校验未通过，本场积分未变动。');
        }
    }

    closePVPResult() {
        const overlay = document.getElementById('pvp-result-overlay');
        if (overlay) overlay.style.display = 'none';
        this.mode = 'pve';
        this.pvpMatchTicket = null;
        this.pvpOpponentRank = null;
        if (typeof PVPService !== 'undefined' && typeof PVPService.clearActiveMatch === 'function') {
            PVPService.clearActiveMatch();
        }

        // Return to PVP Screen
        this.showScreen('pvp-screen');
        // Refresh Rank
        if (window.PVPScene && typeof PVPScene.loadRankings === 'function') {
            PVPScene.loadRankings();
        } else if (window.PVPScene && typeof PVPScene.loadRanking === 'function') {
            // Fallback/Correction just in case
            PVPScene.loadRanking();
        } else {
            // Direct call if available globally or assume standard name
            if (typeof PVPScene !== 'undefined') PVPScene.loadRankings();
        }
    }
    generateRewards(enemies, ringExp) {
        let totalGold = 0;
        let canSteal = false;
        let stealEnemy = null;

        for (const enemy of enemies) {
            if (enemy.gold && typeof enemy.gold.min === 'number') {
                totalGold += Utils.random(enemy.gold.min, enemy.gold.max);
            }
            if (enemy.stealLaw && enemy.stealChance > 0) {
                canSteal = true;
                stealEnemy = enemy;
            }
        }

        // 重玩或重修收益减半
        if (this.player.isReplay || this.player.isRecultivation) {
            totalGold = Math.floor(totalGold * 0.5);
        }

        // Hardcore: 全局战斗灵石收益降低
        totalGold = Math.floor(totalGold * 0.75);

        this.player.gold += totalGold;
        this.achievementSystem.updateStat('totalGold', totalGold);
        this.achievementSystem.updateStat('enemiesDefeated', enemies.length);
        if (this.player.realm) {
            this.achievementSystem.updateStat('realmCleared', this.player.realm, 'max');
        }

        // 显示奖励界面
        this.showRewardScreen(totalGold, canSteal, stealEnemy, ringExp);
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

        let dropChance = 0.08; // Hardcore: 普通8%
        if (this.currentBattleNode && this.currentBattleNode.type === 'elite') dropChance = 0.25; // Hardcore: 精英25%
        if (this.currentBattleNode && this.currentBattleNode.type === 'boss') dropChance = 0.60; // Hardcore: Boss 60%

        if (Math.random() < dropChance) {
            let droppedTreasure = null;

            // Boss特定掉落逻辑：检查击败的敌人是否有克制法宝
            if (this.currentBattleNode && this.currentBattleNode.type === 'boss' && this.battle && this.battle.enemies) {
                const bossEnemy = this.battle.enemies.find(e => e.isBoss);
                if (bossEnemy) {
                    // 获取原始ID (去除 _A, _B 后缀)
                    const originalId = bossEnemy.id.replace(/_[AB]$/, '');

                    // 获取克制该Boss的法宝
                    let counterTreasures = [];
                    if (typeof getCounterTreasures === 'function') {
                        counterTreasures = getCounterTreasures(originalId);
                    } else if (typeof BOSS_MECHANICS !== 'undefined' && BOSS_MECHANICS[originalId]) {
                        counterTreasures = BOSS_MECHANICS[originalId].countersBy || [];
                        // Convert string IDs to treasure objects if needed, but logic below expects IDs or Objects?
                        // BOSS_MECHANICS uses string IDs.
                        // map to objects if needed? No, logic uses t.id check below.
                        // But BOSS_MECHANICS.countersBy is array of strings usually?
                        // Let's check BOSS_MECHANICS definition (Step 22).
                        // countersBy: ['pressure_talisman'] -> Strings.
                        // Logic below: filter(t => !player.hasTreasure(t.id)) implies t is Object!
                        // So we must map string IDs to Treasure Objects.
                        if (counterTreasures.length > 0 && typeof counterTreasures[0] === 'string') {
                            if (typeof TREASURES !== 'undefined') {
                                counterTreasures = counterTreasures.map(id => TREASURES[id]).filter(Boolean);
                            }
                        }
                    }

                    // 过滤玩家未拥有的
                    const unownedCounters = counterTreasures.filter(t => !this.player.hasTreasure(t.id));

                    // 50%概率掉落克制法宝，50%概率随机
                    if (unownedCounters.length > 0 && Math.random() < 0.5) {
                        droppedTreasure = unownedCounters[Math.floor(Math.random() * unownedCounters.length)];
                        Utils.showBattleLog(`【Boss战利品】获得克制法宝！`);
                    }
                }
            }

            // 如果没有特定掉落，使用权重随机
            if (!droppedTreasure) {
                droppedTreasure = this.getWeightedRandomTreasure();
            }

            if (droppedTreasure) {
                // 自动获取
                this.player.addTreasure(droppedTreasure.id);

                const tItem = document.createElement('div');
                tItem.className = 'reward-item reward-treasure-item';
                tItem.style.color = 'var(--accent-gold)';
                tItem.style.cursor = 'help';
                tItem.title = droppedTreasure.description;
                const label = this.getRarityLabel ? this.getRarityLabel(droppedTreasure.rarity) : '';
                const icon = droppedTreasure.icon || '📦';
                tItem.innerHTML = `<span class="icon">${icon}</span> <span>获得法宝：${droppedTreasure.name} ${label}</span>`;
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
        const rewardCardCount = (this.currentBattleNode && this.currentBattleNode.type === 'trial') ? 3 : 2;
        const cards = getRewardCards(rewardCardCount, this.player.characterId, this.player.deck);

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
            const skipCost = 80 * this.player.realm;
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

    showForgeChoiceModal(node, costs = {}) {
        this.currentBattleNode = node;

        const forgeCost = costs.forgeCost || (55 + this.player.realm * 9);
        const premiumCost = costs.premiumCost || (forgeCost + 50);
        const temperCost = costs.temperCost || Math.max(30, Math.floor(forgeCost * 0.6));
        const upgradableCount = Array.isArray(this.player.deck)
            ? this.player.deck.filter(c => typeof canUpgradeCard === 'function' && canUpgradeCard(c)).length
            : 0;

        const modal = document.getElementById('event-modal');
        document.getElementById('event-icon').textContent = '⚒️';
        document.getElementById('event-title').textContent = '天工锻炉';

        const descEl = document.getElementById('event-desc');
        descEl.innerHTML = `
            炉火正旺，你可以选择不同锻法。<br>
            当前可强化卡牌：<span style="color:var(--accent-gold)">${upgradableCount}</span> 张
        `;

        const options = [
            {
                id: 'steady',
                icon: '🔧',
                text: `精锻（-${forgeCost} 灵石）`,
                result: '稳定强化 1 张卡牌',
                canChoose: this.player.gold >= forgeCost
            },
            {
                id: 'overload',
                icon: '🔥',
                text: `过载锻造（-${premiumCost} 灵石）`,
                result: '强化 2 张卡牌并获得命环经验',
                canChoose: this.player.gold >= premiumCost
            },
            {
                id: 'temper',
                icon: '📜',
                text: `淬灵拓印（-${temperCost} 灵石）`,
                result: '获得 1 张非传说卡并获得命环经验',
                canChoose: this.player.gold >= temperCost
            },
            {
                id: 'leave',
                icon: '🚶',
                text: '暂离锻炉',
                result: '保留资源，继续前进',
                canChoose: true
            }
        ];

        const choicesEl = document.getElementById('event-choices');
        choicesEl.innerHTML = '';
        options.forEach(option => {
            const btn = document.createElement('button');
            btn.className = 'event-choice';
            if (!option.canChoose) btn.classList.add('disabled');
            btn.innerHTML = `
                <div>${option.icon} ${option.text}</div>
                <div class="choice-effect">${option.result}</div>
            `;

            if (option.canChoose) {
                btn.onclick = () => {
                    modal.classList.remove('active');
                    if (this.map && typeof this.map.applyForgeChoice === 'function') {
                        this.map.applyForgeChoice(node, option.id, { forgeCost, premiumCost, temperCost });
                    }
                    this.autoSave();
                };
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
        let flowInterrupted = false;

        // 执行效果
        if (choice.effects && choice.effects.length > 0) {
            for (const effect of choice.effects) {
                if (this.executeEventEffect(effect)) {
                    flowInterrupted = true;
                    break;
                }
            }
        }

        // 某些效果（如战斗/试炼/升级界面）会切换流程，不再渲染“继续”按钮
        if (flowInterrupted) {
            return;
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
                } else if (this.player.addPermBuff) {
                    this.player.addPermBuff(effect.stat, effect.value);
                } else {
                    this.player.permaBuffs = this.player.permaBuffs || {};
                    this.player.permaBuffs[effect.stat] = (this.player.permaBuffs[effect.stat] || 0) + effect.value;
                    if (this.player.recalculateStats) this.player.recalculateStats();
                }
                {
                    const statMap = { strength: '力量', defense: '防御', energy: '灵力', maxHp: '生命', draw: '抽牌' };
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
                // 进入专用升级选择界面，切换流程
                this.closeModal();
                setTimeout(() => {
                    this.showEventUpgradeCard();
                }, 100);
                return true;

            case 'treasure':
                if (effect.treasureId) {
                    if (this.player.addTreasure && this.player.addTreasure(effect.treasureId)) {
                        this.eventResults.push(`🏺 获得法宝: ${TREASURES[effect.treasureId].name}`);
                    } else {
                        this.eventResults.push(`已拥有该法宝，获得替代奖励`);
                    }
                } else if (effect.random && typeof TREASURES !== 'undefined') {
                    const tKeys = Object.keys(TREASURES);
                    const unowned = tKeys.filter(k => !this.player.hasTreasure || !this.player.hasTreasure(k));
                    if (unowned.length > 0) {
                        const tid = unowned[Math.floor(Math.random() * unowned.length)];
                        if (this.player.addTreasure) this.player.addTreasure(tid);
                        this.eventResults.push(`🏺 获得随机法宝: ${TREASURES[tid].name}`);
                    } else {
                        this.player.gold += 100;
                        this.eventResults.push(`法宝已收集齐，获得 100 灵石`);
                    }
                }
                break;

            case 'trial':
                // 试炼模式 - 设置特殊战斗规则并立即进入战斗
                this.trialMode = {
                    type: effect.trialType,
                    rounds: effect.rounds,
                    rewardMultiplier: effect.rewardMultiplier || 1,
                    reward: effect.reward
                };
                Utils.showBattleLog(`进入试炼模式: ${effect.trialType}`);
                const trialEnemy = getRandomEnemy(this.player.realm);
                if (trialEnemy) {
                    this.closeModal();
                    setTimeout(() => {
                        this.startBattle([trialEnemy], this.currentBattleNode);
                    }, 300);
                    return true;
                }
                this.eventResults.push('⚠️ 试炼开启失败：未找到试炼目标');
                break;

            case 'ringExp':
                this.player.fateRing.exp += effect.value;
                this.player.checkFateRingLevelUp();
                this.eventResults.push(`🔮 命环经验 +${effect.value}`);
                // 如果导致升级，checkFateRingLevelUp 内部会处理并可能弹窗，但这里我们主要关注数值
                break;

            case 'card':
                let card = null;
                if (effect.cardId && CARDS[effect.cardId]) {
                    card = { ...CARDS[effect.cardId] };
                } else if (effect.rarity) {
                    card = getRandomCard(effect.rarity);
                } else {
                    card = getRandomCard();
                }
                if (card) {
                    this.player.addCardToDeck(card);
                    this.eventResults.push(`🃏 获得卡牌: ${card.name}`);
                }
                break;

            case 'law':
                if (effect.random) {
                    const lawKeys = Object.keys(LAWS);
                    const randomLaw = LAWS[lawKeys[Math.floor(Math.random() * lawKeys.length)]];
                    if (randomLaw && this.player.collectLaw({ ...randomLaw })) {
                        this.eventResults.push(`✨ 获得法则: ${randomLaw.name}`);
                        this.achievementSystem.updateStat('lawsCollected', 1);
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
                                return this.executeEventEffect(option);
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
                    return true;
                }
                this.eventResults.push('⚠️ 战斗触发失败：目标敌人不存在');
                break;

            case 'awakenRing':
                // 觉醒命环
                if (this.player.fateRing.level === 0) {
                    const ring = this.player.fateRing;
                    ring.level = 1;
                    ring.name = '一阶·觉醒';
                    ring.path = 'awakened';

                    // 同步槽位结构（避免 slots 变成数字）
                    const levelData = (typeof FATE_RING !== 'undefined' && FATE_RING.levels) ? FATE_RING.levels[1] : null;
                    if (levelData && ring.type !== 'sealed') {
                        ring.maxSlots = levelData.slots;
                        ring.exp = Math.max(ring.exp || 0, levelData.exp || 0);
                    }
                    if (ring.initSlots) ring.initSlots();
                    Utils.showBattleLog('命环觉醒！逆命之路开启！');
                }
                break;

            default:
                // 未处理的效果类型
                console.log('未处理的事件效果:', effect.type);
        }
        return false;
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
    async onBattleLost() {
        if (this.mode === 'pvp') {
            await this.handlePVPDefeat();
            return;
        }

        const reachRealm = this.player && this.player.realm ? this.player.realm : 1;
        const lossEssence = this.awardLegacyEssence(
            Math.max(1, Math.floor((reachRealm - 1) / 2)),
            '败中悟道',
            { silent: true }
        );

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
        const legacyStat = document.getElementById('stat-legacy');
        if (legacyStat) {
            legacyStat.textContent = `+${lossEssence}（库存 ${this.legacyProgress.essence}）`;
        }

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

        // 增加复活代价：收益减半 (不再扣除灵石)
        this.player.isRecultivation = true;
        // const reviveCost = Math.floor(this.player.gold * 0.5); // 扣除50%灵石
        // this.player.gold -= reviveCost;

        // 恢复生命值
        this.player.currentHp = this.player.maxHp;

        // 重置层数
        this.player.floor = 0;

        // 重新生成地图
        this.map.generate(this.player.realm);

        // Check Skill Unlock status (e.g. if restarting at Realm 5+, unlock skill)
        this.player.checkSkillUnlock();

        // 自动保存
        // 关键修复：保存必须在所有状态重置（扣钱、恢复HP、重置层数）之后立即进行
        // 这样如果用户在点击“重修此界”后刷新，加载的存档已经是扣过钱并重置进度的状态
        this.autoSave();

        Utils.showBattleLog(`时光倒流... 重修 ${this.map.getRealmName(this.player.realm)} (此界收益减半)`);

        // 进入地图界面
        this.showScreen('map-screen');
    }

    // 天域完成
    onRealmComplete() {
        const currentRealm = this.player.realm;
        const clearEssence = this.awardLegacyEssence(2 + Math.floor(currentRealm / 2), '破境夺天', { silent: true });

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

        // Update max realm reached (Next unlocked)
        if (this.player.realm + 1 > this.player.maxRealmReached) {
            this.player.maxRealmReached = this.player.realm + 1;
        }

        // 检查是否通关所有天域 (现在是18重)
        if (this.player.realm >= 18) {
            const finalEssence = this.awardLegacyEssence(18, '逆天终局', { silent: true });
            this.lastLegacyGain = clearEssence + finalEssence;
            this.showVictoryScreen();
            return;
        }

        // 允许玩家选择继续或回城
        // 这里暂时保持自动推进，但增加保存
        this.player.realm++;
        this.player.floor = 0;
        this.currentBattleNode = null; // 关键修复：防止奖励结算再次触发节点完成

        // 成功突破天域，清除重修惩罚
        this.player.isRecultivation = false;
        // 进入下一层肯定不是重玩（除非本来就是全通关后的无限模式？暂时假设突破即解除）
        this.player.isReplay = false;

        // 检查技能解锁 (Level up skill upon entering specific realms)
        this.player.checkSkillUnlock();

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
        Utils.showBattleLog(`进入下一重天域，恢复 ${healAmount} HP，轮回精粹 +${clearEssence}`);

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
        const legacyStat = document.getElementById('stat-legacy');
        if (legacyStat) {
            legacyStat.textContent = `+${this.lastLegacyGain || 0}（库存 ${this.legacyProgress.essence}）`;
        }

        this.showScreen('game-over-screen');
    }

    // 显示牌组
    showDeck() {
        this.showDeckModal('deck');
    }

    // 显示牌组模态框
    showDeckModal(type) {
        const modal = document.getElementById('deck-modal');
        const modalContent = modal.querySelector('.modal-content');

        // Ensure Header Structure
        let header = modalContent.querySelector('.deck-view-header');
        let contentContainer = modalContent.querySelector('.deck-view-content');

        if (!header || !contentContainer) {
            const closeBtn = modalContent.querySelector('.modal-close');
            const oldCloseBtnHtml = closeBtn ? closeBtn.outerHTML : '<button class="modal-close" onclick="game.closeModal()">×</button>';

            modalContent.innerHTML = `
                ${oldCloseBtnHtml}
                <div class="deck-view-header">
                    <h2>当前牌组</h2>
                </div>
                <!-- Add a container for the scene perspective if needed, or keep relying on content -->
                <div class="deck-view-content" id="deck-view-cards"></div>
            `;
            header = modalContent.querySelector('.deck-view-header');
            contentContainer = document.getElementById('deck-view-cards');
        }

        const title = header.querySelector('h2');
        contentContainer.innerHTML = '';

        let cards = [];
        let deckName = '';

        switch (type) {
            case 'deck': cards = this.player.deck; deckName = '当前牌组'; break;
            case 'draw': cards = this.player.drawPile; deckName = '抽牌堆'; break;
            case 'discard': cards = this.player.discardPile; deckName = '弃牌堆'; break;
        }

        title.textContent = `${deckName} · ${cards.length}`;

        // === Group by Rarity (High -> Low) ===
        const rarityOrder = ['legendary', 'epic', 'rare', 'uncommon', 'common', 'basic'];
        const groups = {
            'legendary': { name: '传说 · Legendary', cards: [], color: '#ffeb3b', icon: '👑' },
            'epic': { name: '史诗 · Epic', cards: [], color: '#d500f9', icon: '🔮' },
            'rare': { name: '稀有 · Rare', cards: [], color: '#00e5ff', icon: '💎' },
            'uncommon': { name: '优秀 · Uncommon', cards: [], color: '#76ff03', icon: '🌿' },
            'common': { name: '普通 · Common', cards: [], color: '#bdbdbd', icon: '📄' },
            'basic': { name: '基础 · Basic', cards: [], color: '#795548', icon: '🪵' }
        };

        // Helper to count duplicates
        const cardCounts = {};

        cards.forEach(card => {
            if (!card || !card.id) return;
            const key = card.upgraded ? `${card.id}_upgraded` : card.id;
            if (!cardCounts[key]) cardCounts[key] = 0;
            cardCounts[key]++;
        });

        // Add unique instances to groups
        const processedKeys = new Set();

        cards.forEach(card => {
            if (!card || !card.id) return;
            const key = card.upgraded ? `${card.id}_upgraded` : card.id;

            if (processedKeys.has(key)) return;
            processedKeys.add(key);

            let rarity = (card.rarity || 'common').toLowerCase();
            if (!groups[rarity]) rarity = 'common';

            card._tempCount = cardCounts[key];
            groups[rarity].cards.push(card);
        });

        // Render Groups in Order
        rarityOrder.forEach((rarityKey, groupIndex) => {
            const group = groups[rarityKey];
            if (group.cards.length === 0) return;

            // Sort within rarity: Type (Attack > Skill) then ID
            group.cards.sort((a, b) => {
                const typeOrder = { attack: 1, skill: 2, power: 3, defense: 4 }; // Custom type priority
                const tA = typeOrder[a.type] || 99;
                const tB = typeOrder[b.type] || 99;
                if (tA !== tB) return tA - tB;
                return a.id.localeCompare(b.id);
            });

            const groupEl = document.createElement('div');
            groupEl.className = `deck-category rarity-${rarityKey}`;
            groupEl.style.animationDelay = `${groupIndex * 0.15}s`;

            // Enhanced Group Header
            groupEl.innerHTML = `
                <h3 style="border-color: ${group.color}; background: linear-gradient(90deg, ${group.color}15 0%, transparent 100%);">
                    <span style="font-size:1.2em; margin-right:5px; filter: drop-shadow(0 0 5px ${group.color});">${group.icon}</span>
                    <span style="color:${group.color}; text-shadow: 0 0 10px ${group.color}40;">${group.name}</span>
                    <span class="category-count" style="border: 1px solid ${group.color}50;">${group.cards.reduce((sum, c) => sum + c._tempCount, 0)}</span>
                </h3>
                <div class="deck-grid"></div>
            `;

            const grid = groupEl.querySelector('.deck-grid');

            group.cards.forEach((card, i) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'deck-card-wrapper';
                // Randomize float delay for natural look
                wrapper.style.animationDelay = `${Math.random() * 2}s`;
                wrapper.style.setProperty('--delay', `${i * 0.05}s`);

                const cardEl = Utils.createCardElement(card);

                if (card._tempCount > 1) {
                    const badge = document.createElement('div');
                    badge.className = 'card-count-badge';
                    badge.textContent = `x${card._tempCount}`;
                    cardEl.appendChild(badge);
                }

                wrapper.appendChild(cardEl);
                grid.appendChild(wrapper);
            });

            contentContainer.appendChild(groupEl);
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
        const btns = document.querySelectorAll('.cheat-btn');
        btns.forEach(btn => {
            btn.style.display = this.debugMode ? 'inline-block' : 'none';
        });

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
            if (this.player.fateRing.type === 'sealed') {
                this.player.fateRing.maxSlots = 12;
            } else if (this.player.fateRing.type === 'mutated') {
                this.player.fateRing.maxSlots = 4;
                if (FATE_RING.levels[10]) this.player.fateRing.maxSlots = FATE_RING.levels[10].slots;
            } else {
                if (FATE_RING.levels[10]) this.player.fateRing.maxSlots = FATE_RING.levels[10].slots;
            }

            if (this.player.fateRing.initSlots) {
                this.player.fateRing.initSlots();
            }
        }

        // 3. 获得所有法则
        if (typeof LAWS !== 'undefined') {
            this.player.collectedLaws = [];
            for (const key in LAWS) {
                this.player.collectedLaws.push(JSON.parse(JSON.stringify(LAWS[key])));
            }
            this.player.lawsCollected = this.player.collectedLaws.length;
        }

        // 4. 获得所有法宝
        if (typeof TREASURES !== 'undefined') {
            // 清空并重新收集所有法宝
            this.player.collectedTreasures = [];
            this.player.equippedTreasures = [];

            for (const key in TREASURES) {
                const treasure = TREASURES[key];
                // 深拷贝法宝数据
                const treasureCopy = JSON.parse(JSON.stringify(treasure));
                // 确保图标等属性被复制
                treasureCopy.icon = treasure.icon;
                treasureCopy.callbacks = treasure.callbacks;
                treasureCopy.getDesc = treasure.getDesc;

                this.player.collectedTreasures.push(treasureCopy);
            }

            Utils.showBattleLog(`【天道馈赠】获得所有 ${this.player.collectedTreasures.length} 个法宝！`);
        }

        // 5. 解锁所有技能（如果有冷却重置）
        if (this.player.skillCooldown !== undefined) {
            this.player.skillCooldown = 0;
        }

        // 6. 解锁所有关卡
        this.player.maxRealm = 14;
        if (typeof RealmManager !== 'undefined') {
            RealmManager.unlockAll();
        }

        // 7. 打开怪物调试面板
        this.showCheatMonsterSelector();

        this.updateUI();
        Utils.showBattleLog('【作弊生效】富可敌国，神功大成，万界通行！');
    }

    // 作弊：怪物选择器
    showCheatMonsterSelector() {
        const modalId = 'cheat-monster-selector';
        let modal = document.getElementById(modalId);

        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.85); z-index: 10000; display: flex;
                flex-direction: column; padding: 20px; overflow-y: auto;
                color: #fff; font-family: sans-serif;
            `;
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:20px; border-bottom:1px solid #444; padding-bottom:10px;">
                <h2 style="margin:0; color:gold;">⚔️ 试炼场 (Debug)</h2>
                <button onclick="document.getElementById('${modalId}').style.display='none'" style="padding:5px 15px;">关闭</button>
            </div>
            <div id="cheat-realm-list" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap:15px;"></div>
        `;

        const list = modal.querySelector('#cheat-realm-list');

        // 遍历所有境界 (1-14)
        for (let r = 1; r <= 14; r++) {
            const realmData = REALM_ENVIRONMENTS[r] || { name: `第${r}重天` };
            const card = document.createElement('div');
            card.style.cssText = `
                background: #222; border: 1px solid #555; padding: 10px; border-radius: 4px;
            `;

            // 添加两个通用测试按钮
            const btnStyle = "display:block; width:100%; margin:5px 0; padding:8px; background:#333; color:#eee; border:none; cursor:pointer; text-align:left;";

            card.innerHTML = `<h3 style="margin-top:0; color:#ddd;">${r}. ${realmData.name}</h3>`;

            // 1. 生成普通测试怪
            const normalBtn = document.createElement('button');
            normalBtn.style.cssText = btnStyle;
            normalBtn.textContent = "👊 生成随机小怪 (Random)";
            normalBtn.onclick = () => {
                this.startDebugBattle(r, 'normal');
                modal.style.display = 'none';
            };
            card.appendChild(normalBtn);

            // 2. 生成 Boss
            const bossBtn = document.createElement('button');
            bossBtn.style.cssText = btnStyle;
            bossBtn.textContent = "💀 生成 Boss";
            bossBtn.onclick = () => {
                this.startDebugBattle(r, 'boss');
                modal.style.display = 'none';
            };
            card.appendChild(bossBtn);

            list.appendChild(card);
        }

        modal.style.display = 'flex';
    }

    startDebugBattle(realm, type) {
        // 1. 切换环境
        this.player.realm = realm;
        this.updateRealmBackground(); // 确保背景切换

        // 2. 获取敌人数据
        let enemyData;
        if (type === 'boss') {
            // 尝试查找特定境界 Boss，找不到则随机
            const bosses = Object.values(ENEMIES).filter(e => e.isBoss && (e.realm === realm || !e.realm));
            enemyData = bosses.length > 0 ? Utils.deepClone(bosses[0]) : Utils.deepClone(ENEMIES.boss_generic || ENEMIES.boss_1);
            // 强制修正名字以显示测试
            enemyData.name = `(Test) ${enemyData.name}`;
        } else {
            // 随机小怪
            const minions = Object.values(ENEMIES).filter(e => !e.isBoss && (e.realm === realm || !e.realm));
            enemyData = minions.length > 0 ? Utils.deepClone(minions[Math.floor(Math.random() * minions.length)]) : Utils.deepClone(ENEMIES.basic_soldier);
        }

        // 3. 开始战斗
        this.showScreen('battle-screen');
        if (this.battle) {
            this.battle.init([enemyData]);
        }

        // 6. 恢复满血
        this.player.currentHp = this.player.maxHp;

        // 7. 更新UI
        this.player.recalculateStats();
        if (this.currentScreen === 'map-screen' && this.map) {
            this.map.updateStatusBar();
        }

        const lawCount = this.player.collectedLaws ? this.player.collectedLaws.length : 0;
        const treasureCount = this.player.collectedTreasures ? this.player.collectedTreasures.length : 0;

        Utils.showBattleLog(`【天道崩塌】作弊成功！已获得：千万灵石、满级命环、${lawCount}个法则、${treasureCount}个法宝！`);

        // 自动保存并同步云端
        this.saveGame();
    }

    showFateRing() {
        const modal = document.getElementById('ring-modal');
        const ring = this.player.fateRing;
        const ringSystem = document.getElementById('ring-system-3d');

        // Data Initialization
        if (!ring.slots || ring.slots.length === 0) {
            if (ring.initSlots) ring.initSlots();
        }
        if (!ring.unlockedPaths) ring.unlockedPaths = ['awakened'];
        if (!ring.path) ring.path = 'awakened';

        // --- Render 3D Scene (Initialize Only Once) ---
        if (ringSystem.children.length === 0) {
            ringSystem.innerHTML = ''; // Clear comments/whitespace
            // 1. Add Decorative Rings with Ink & Gold Styles
            const layers = ['core', 'inner', 'middle', 'outer'];
            layers.forEach(layer => {
                const el = document.createElement('div');
                el.className = `fate-ring-layer ring-layer-${layer}`;
                // Add runes
                if (layer !== 'core') {
                    for (let i = 0; i < 8; i++) {
                        const rune = document.createElement('div');
                        rune.className = 'ring-rune';
                        rune.innerText = this.getRandomRune();
                        rune.style.transform = `rotate(${i * 45}deg) translateY(-${(layer === 'inner' ? 120 : (layer === 'middle' ? 200 : 280))}px)`;
                        el.appendChild(rune);
                    }
                }
                ringSystem.appendChild(el);
            });

            // 2. Add Slots (3D Positioned)
            const radius = 220;
            const slotsCount = ring.slots.length;

            ring.slots.forEach((slot, index) => {
                const angleDeg = (index / slotsCount) * 360 - 90;
                const angleRad = angleDeg * (Math.PI / 180);
                const x = Math.cos(angleRad) * radius;
                const y = Math.sin(angleRad) * radius;

                const slotEl = document.createElement('div');
                slotEl.className = `ring-slot-3d`;
                slotEl.id = `ring-slot-${index}`; // Add ID for easier updates

                // Drag & Drop Attributes
                slotEl.classList.add('droppable');
                slotEl.setAttribute('data-slot-index', index);

                slotEl.style.transform = `translate(${x}px, ${y}px)`;

                // Content Placeholder
                slotEl.innerHTML = '';

                // Force high z-index interaction
                slotEl.style.zIndex = '2000';

                // Click Interaction
                slotEl.onclick = (e) => this.handleSlotClick(index, e);

                ringSystem.appendChild(slotEl);
            });

            // Bind Drag Events (Removed)
        }

        // --- Update Dynamic Content ---
        this.updateUIState(ring);

        // --- Render 2D UI Overlay ---

        // 1. Basic Info
        document.getElementById('modal-ring-name').innerText = ring.name;
        document.getElementById('modal-ring-level').innerText = `等级 ${ring.level}`;

        // EXP (Polished)
        const nextLevelExp = FATE_RING.levels[ring.level + 1]?.exp || 9999;
        const expPercent = Math.min(100, (ring.exp / nextLevelExp) * 100);
        const isMax = ring.level >= 10;

        const expBar = document.getElementById('modal-ring-exp-bar');
        expBar.style.width = `${expPercent}%`;
        if (isMax) expBar.classList.add('max');
        else expBar.classList.remove('max');

        const expText = document.getElementById('modal-ring-exp-text');
        expText.innerHTML = isMax ? '<span class="value max">MAX</span>' : `<span class="value">${ring.exp}</span> / ${nextLevelExp}`;

        // 2. Bonus Info
        const statsList = document.getElementById('modal-ring-stats');
        statsList.innerHTML = '';
        const bonus = ring.getStatsBonus();
        if (bonus.maxHp) statsList.innerHTML += this.createStatRow('生命上限', `+${bonus.maxHp}`, '❤️');
        if (bonus.energy) statsList.innerHTML += this.createStatRow('基础灵力', `+${bonus.energy}`, '⚡');
        if (bonus.draw) statsList.innerHTML += this.createStatRow('每回合抽牌', `+${bonus.draw}`, '🎴');

        // Character Specifics
        document.getElementById('modal-ring-path').innerHTML = this.renderCurrentPathInfo(ring) + this.renderCharacterSpecifics(ring);

        // 3. Right Panel (Tabbed Refactor)
        const rightPanel = document.querySelector('.ring-ui-panel.right');
        // Check if structure exists, if not recreate (safe to overwrite)
        rightPanel.innerHTML = `
            <div class="panel-tabs">
                <div class="tab active" onclick="game.switchRingTab(this, 'library')">法则库 (${this.player.collectedLaws.length})</div>
                <div class="tab" onclick="game.switchRingTab(this, 'resonance')">法则共鸣</div>
            </div>
            <div class="panel-content-area">
                <div id="tab-content-library" class="tab-content active">
                     ${this.renderLawLibrary(ring)}
                </div>
                <div id="tab-content-resonance" class="tab-content">
                     ${this.renderResonances(ring)}
                </div>
            </div>
            <div class="ring-ui-footer" id="ring-ui-footer">
                <p class="instruction-text">点击空槽位，再选择法则库中的法则进行装配</p>
            </div>
        `;

        // Bind Events (Library needs re-binding on update, Drag only on init - handled above)
        this.bindLibraryEvents();

        modal.classList.add('active');
    }

    // Optimized UI Updater (Full State Refresh without Re-render)
    updateUIState(ring) {
        // 1. Update Slots
        ring.slots.forEach((slot, index) => {
            const slotEl = document.getElementById(`ring-slot-${index}`);
            if (!slotEl) return;

            // Update Classes
            slotEl.className = `ring-slot-3d ${!slot.unlocked ? 'locked' : ''} ${this.selectedRingSlot === index ? 'active' : ''}`;

            // Update Content
            const law = slot.law ? LAWS[slot.law] : null;
            const subLaw = slot.subLaw ? LAWS[slot.subLaw] : null;

            let content = '';
            if (law) {
                if (subLaw) {
                    content = `
                        <div class="slot-inner-icon main">${law.icon}</div>
                        <div class="slot-fusion-icon" style="position:absolute; bottom:-10px; right:-10px; font-size:1rem; background:#000; border-radius:50%; border:1px solid gold; width:25px; height:25px; display:flex; justify-content:center; align-items:center;">${subLaw.icon}</div>
                     `;
                } else {
                    content = `<div class="slot-inner-icon">${law.icon}</div>`;
                }
            } else if (!slot.unlocked) {
                content = `<div class="slot-inner-icon" style="font-size:1.2rem; filter: grayscale(1);">🔒</div>`;
            } else {
                content = `<div class="slot-inner-icon" style="opacity:0.2; font-size: 2rem;">+</div>`;
            }

            if (slotEl.innerHTML !== content) slotEl.innerHTML = content;
        });

        // 2. Update Library Items
        const equippedLaws = ring.getSocketedLaws();
        const libraryItems = document.querySelectorAll('.law-item-row');
        libraryItems.forEach(item => {
            const lawId = item.dataset.id;
            const isEquipped = equippedLaws.includes(lawId);
            const statusIcon = item.querySelector('.law-status-icon');

            if (isEquipped) {
                item.classList.add('equipped');
                // statusIcon content managed via CSS 'content' but we can safeguard here or leave it generic
            } else {
                item.classList.remove('equipped');
            }
        });

        // 3. Update Stats (Left Panel) - Lightweight enough to re-render
        const statsList = document.getElementById('modal-ring-stats');
        if (statsList) {
            statsList.innerHTML = '';
            const bonus = ring.getStatsBonus();
            if (bonus.maxHp) statsList.innerHTML += this.createStatRow('生命上限', `+${bonus.maxHp}`, '❤️');
            if (bonus.energy) statsList.innerHTML += this.createStatRow('基础灵力', `+${bonus.energy}`, '⚡');
            if (bonus.draw) statsList.innerHTML += this.createStatRow('每回合抽牌', `+${bonus.draw}`, '🎴');
        }
    }

    // Tab Switcher
    switchRingTab(tabEl, tabName) {
        document.querySelectorAll('.panel-tabs .tab').forEach(t => t.classList.remove('active'));
        tabEl.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-content-${tabName}`).classList.add('active');
    }

    getRandomRune() {
        const runes = ['⚡', '🔥', '❄️', '🌪️', '👁️', '⚔️', '🛡️', '🔮', '🌙', '☀️', '☯️', '📜'];
        return runes[Math.floor(Math.random() * runes.length)];
    }

    createStatRow(label, value, icon) {
        return `
            <div class="stat-row-3d">
                <span style="color:#aaa"><span style="margin-right:5px">${icon}</span>${label}</span>
                <span style="color:#fff; font-weight:bold">${value}</span>
            </div>
        `;
    }

    handleSlotClick(index, e) {
        e.stopPropagation();
        const ring = this.player.fateRing;
        const slotData = ring.slots[index];

        if (!slotData.unlocked) {
            if (ring.type === 'sealed' && ring.canUnseal && ring.canUnseal(index)) {
                this.showConfirmModal(
                    `该槽位被【逆生咒】封印。\n强制解除将永久损耗生命上限。\n是否解除？`,
                    () => {
                        ring.unseal(index);
                        this.showFateRing(); // Structure change needs full refresh
                        this.autoSave();
                    }
                );
            } else {
                Utils.showBattleLog('该槽位尚未解锁');
            }
            return;
        }

        // Click Logic:
        // 1. If slot has law -> Unload it
        // 2. If slot empty -> Select it
        if (slotData.law) {
            // Mutated Ring Special: If fusion, remove subLaw first?
            if (ring.type === 'mutated' && slotData.subLaw) {
                slotData.subLaw = null;
                Utils.showBattleLog('融合法则已移除');
            } else {
                ring.socketLaw(index, null);
                Utils.showBattleLog('法则已卸载');
            }
            this.player.recalculateStats();
            this.updateUIState(ring); // Optimized update
            this.autoSave();
        } else {
            this.selectedRingSlot = (this.selectedRingSlot === index) ? undefined : index;
            this.updateUIState(ring); // Optimized update
        }
    }

    // Removed bindRingDragEvents (Interaction removed per user request)

    // Updated bindLibraryEvents for optimized updates
    bindLibraryEvents() {
        // Selector matches new structure
        const items = document.querySelectorAll('.law-item-row');
        items.forEach(item => {
            // Remove 'equipped' check to allow selecting equipped items if we want to show info, 
            // but for equipping logic, we check inside.

            item.onclick = () => {
                const lawId = item.dataset.id;
                const ring = this.player.fateRing;
                // Safe lookup
                const equippedSlotIndex = ring.slots.findIndex(slot => slot.law === lawId);

                // 1. If already equipped -> Unequip
                if (equippedSlotIndex !== -1) {
                    ring.socketLaw(equippedSlotIndex, null);
                    Utils.showBattleLog('法则已卸载');
                    this.updateUIState(ring);
                    this.autoSave();
                    return;
                }

                // 2. Equip Logic
                if (item.classList.contains('equipped')) return; // Should be redundant now but safe

                let targetSlot = this.selectedRingSlot;

                if (targetSlot === undefined) {
                    // Find first empty
                    for (let i = 0; i < ring.slots.length; i++) {
                        if (ring.slots[i].unlocked && !ring.slots[i].law) {
                            targetSlot = i;
                            break;
                        }
                    }
                }

                if (targetSlot !== undefined && targetSlot >= 0) {
                    if (ring.socketLaw(targetSlot, lawId)) {
                        Utils.showBattleLog(`已装填法则`);
                        this.selectedRingSlot = undefined;
                        this.updateUIState(ring); // Optimized update
                        this.autoSave();
                    } else {
                        Utils.showBattleLog('装填失败');
                    }
                } else {
                    Utils.showBattleLog('请先选择一个空槽位');
                }
            };
        });
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



    // 渲染法则库列表 (Redesigned)
    renderLawLibrary(ring) {
        if (this.player.collectedLaws.length === 0) {
            return '<div style="padding: 20px; text-align: center; color: #666;">暂无法则</div>';
        }

        return `
            <div class="library-list-container">
            ${this.player.collectedLaws.map(law => {
            const isEquipped = ring.getSocketedLaws().includes(law.id);
            return `
                    <div class="law-item-row ${isEquipped ? 'equipped' : ''}" data-id="${law.id}">
                        <div class="law-icon-box">${law.icon}</div>
                        <div class="law-info">
                            <div class="law-name">${law.name}</div>
                            <div class="law-desc-mini">${(typeof getLawPassiveDescription === 'function' ? getLawPassiveDescription(law) : '') || law.description || '效果未知'}</div>
                        </div>
                        <div class="law-status-icon"></div>
                    </div>
                `;
        }).join('')}
            </div>
        `;
    }

    // 渲染法则共鸣 (Redesigned)
    renderResonances(ring) {
        if (!typeof LAW_RESONANCES === 'object') return '';

        let activeResonances = [];
        let html = '';

        html += `<div class="section-label">共鸣检测</div>`;

        for (const key in LAW_RESONANCES) {
            const resonance = LAW_RESONANCES[key];
            const equippedLaws = ring.getSocketedLaws();
            const hasAllLaws = resonance.laws.every(lawId => equippedLaws.includes(lawId));

            // Calculate progress
            const matchCount = resonance.laws.filter(lawId => equippedLaws.includes(lawId)).length;
            const totalCount = resonance.laws.length;
            const progress = (matchCount / totalCount) * 100;

            if (matchCount > 0) { // Only show relevant ones
                html += `
                    <div class="resonance-card ${hasAllLaws ? 'active' : ''}">
                        <div class="resonance-header">
                            <span class="resonance-name">${resonance.name}</span>
                            <span style="font-size:0.8rem; color:${hasAllLaws ? 'var(--accent-gold)' : '#666'}">${matchCount}/${totalCount}</span>
                        </div>
                        <div style="font-size:0.8rem; color:#ccc; margin-bottom:5px;">${resonance.description}</div>
                        <div class="resonance-bar">
                            <div class="resonance-progress" style="width: ${progress}%"></div>
                        </div>
                    </div>
                `;
            }
        }

        if (html === `<div class="section-label">共鸣检测</div>`) {
            return `<div class="section-label">共鸣检测</div><div style="text-align:center; color:#666; font-size:0.8rem; padding:10px;">暂无共鸣迹象</div>`;
        }

        return html;
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
            case 'damageBonus':
                // Store permanent damage bonus from Fate Ring
                this.player.fateRingDamageBonus = (this.player.fateRingDamageBonus || 0) + path.bonus.value;
                break;
            case 'ultimate':
                // Defiance: 免疫一次致死
                if (this.player.fateRing) {
                    this.player.fateRing.deathImmunityCount = (this.player.fateRing.deathImmunityCount || 0) + 1;
                }
                break;
        }
    }

    // 显示游戏介绍 (v4.2)
    // 切换游戏介绍标签页
    switchIntroTab(tabId) {
        // Update Buttons
        document.querySelectorAll('.intro-tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tab === tabId) btn.classList.add('active');
        });

        // Update Panels
        document.querySelectorAll('.intro-tab-panel').forEach(panel => {
            panel.classList.remove('active');
            if (panel.id === `intro-${tabId}`) panel.classList.add('active');
        });
    }

    showGameIntro() {
        const modal = document.getElementById('settings-modal');
        // 确保模态框存在
        if (!modal) {
            console.error('Settings modal not found!');
            return;
        }

        const settingsContainer = document.getElementById('settings-options');
        if (!settingsContainer) return;

        // Content for specific tabs
        // Tab 1: Overview
        const overviewContent = `
            <div class="intro-section">
                <h3><span style="font-size:1.5rem; margin-right:10px;">☯</span> 逆天改命</h3>
                <p class="intro-text">
                    天道无情，视万物为刍狗。作为一介凡人，你偶然获得了【残缺命环】，可以通过盗取法则之力，挑战高高在上的妖尊。
                    这不仅仅是一场战斗，更是一次对命运的宣战。
                </p>
                <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,215,0,0.1);">
                    <strong style="color:var(--accent-gold)">游玩目标：</strong>
                    <ul class="intro-list" style="margin-top:10px;">
                        <li>闯过 <strong>18层</strong> 试炼天域，击败每一层的镇守妖尊。</li>
                        <li>收集 <strong>五行法则</strong>，完善你的命环。</li>
                        <li>构建独一无二的卡牌流派，在大道争锋中存活下来。</li>
                    </ul>
                </div>
            </div>
            
             <div class="intro-section">
                <h3>👥 角色图鉴 (4位)</h3>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                
                    <!-- Lin Feng -->
                    <div class="char-highlight" style="border-color: var(--accent-gold);">
                        <strong style="color: var(--accent-gold); font-size:1.1rem;">🤺 林风 (逆命者)</strong>
                        <p style="font-size:0.8rem; color:#bbb; margin-top:5px;">"凡人之躯，比肩神明。"</p>
                        <ul class="intro-list" style="margin-top:10px; font-size:0.85rem;">
                            <li><strong>均衡 (Balance)</strong>：属性平均，适应性强。</li>
                            <li><strong>进化 (Evolve)</strong>：命环升级速度更快，擅长后期爆发。</li>
                        </ul>
                    </div>

                    <!-- Xiang Ye -->
                    <div class="char-highlight" style="border-color: var(--accent-green);">
                        <strong style="color: var(--accent-green); font-size:1.1rem;">🌿 香叶 (被诅咒的医者)</strong>
                        <p style="font-size:0.8rem; color:#bbb; margin-top:5px;">"医者仁心，亦可杀人。"</p>
                        <ul class="intro-list" style="margin-top:10px; font-size:0.85rem;">
                            <li><strong>毒愈 (Poison/Heal)</strong>：擅长施加持续伤害与自我回复。</li>
                            <li><strong>逆生 (Reverse)</strong>：将治疗转化为伤害。</li>
                        </ul>
                    </div>
                    
                    <!-- Wu Yu -->
                    <div class="char-highlight" style="border-color: var(--accent-red);">
                        <strong style="color: var(--accent-red); font-size:1.1rem;">📿 无欲 (苦行僧)</strong>
                        <p style="font-size:0.8rem; color:#bbb; margin-top:5px;">"金刚怒目，只为降魔。"</p>
                        <ul class="intro-list" style="margin-top:10px; font-size:0.85rem;">
                            <li><strong>功德 (Merit)</strong>：防守积累，触发【金刚法相】无敌。</li>
                            <li><strong>业力 (Sin)</strong>：攻击积累，触发【明王之怒】爆发。</li>
                        </ul>
                    </div>
                
                    <!-- Yan Han -->
                     <div class="char-highlight" style="border-color: #2196F3;">
                        <strong style="color: #2196F3; font-size:1.1rem;">📚 严寒 (命环学者)</strong>
                        <p style="font-size:0.8rem; color:#bbb; margin-top:5px;">"知识，就是这一界最锋利的剑。"</p>
                        <ul class="intro-list" style="margin-top:10px; font-size:0.85rem;">
                            <li><strong>解析 (Analysis)</strong>：每回合获得额外的0费技能牌。</li>
                            <li><strong>真理 (Truth)</strong>：利用手牌数量优势压制敌人。</li>
                        </ul>
                    </div>
                    
                </div>
            </div>
        `;

        // Tab 2: Mechanics
        const mechanicsContent = `
             <div class="intro-section">
                <h3>🌌 五行法则 (Five Elements)</h3>
                <p class="intro-text">万物生克，循环不息。掌握属性克制是制胜关键。</p>
                
                <div class="element-cycle-container">
                    <span class="element-cycle-text">
                        <span style="color:#ffcc00">金</span> <span style="color:#666">></span> 
                        <span style="color:#4caf50">木</span> <span style="color:#666">></span> 
                        <span style="color:#795548">土</span> <span style="color:#666">></span> 
                        <span style="color:#2196f3">水</span> <span style="color:#666">></span> 
                        <span style="color:#f44336">火</span> <span style="color:#666">></span> 
                        <span style="color:#ffcc00">金</span>
                    </span>
                </div>
                <ul class="intro-list">
                    <li><strong>克制 (Advantage)</strong>：造成 <strong>+50%</strong> 伤害。</li>
                    <li><strong>被克 (Disadvantage)</strong>：造成 <strong>-25%</strong> 伤害。</li>
                    <li><strong>法宝变幻</strong>：装备不同属性的法宝可以改变自身的属性亲和。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>⭕ 命环系统 (Fate Ring)</h3>
                <p class="intro-text">
                    命环是逆命者的根本。通过战斗汲取灵气（经验），提升命环等级。
                </p>
                <div style="display:flex; gap:20px; align-items:center;">
                    <div class="intro-list">
                        <li><strong>解锁槽位</strong>：命环升级可解锁新的法则槽位。</li>
                         <li><strong>法则共鸣</strong>：收集 4 个同系列法则（如：离火、坎水），回合开始时触发强力特效。</li>
                         <li><strong>神识 (Draw)</strong>：提升命环等级可增加每回合抽牌数。</li>
                         <li><strong>灵力 (Energy)</strong>：决定每回合可使用的卡牌点数上限。</li>
                    </div>
                </div>
            </div>

            <div class="intro-section">
                <h3>📦 法宝品阶 (Treasures)</h3>
                <p class="intro-text">天地异宝，有德者居之。</p> 
                <div class="rarity-legend">
                    <span class="rarity-tag common">凡品 (Common)</span>
                    <span class="rarity-tag rare">灵品 (Rare)</span>
                    <span class="rarity-tag epic">神品 (Epic)</span>
                    <span class="rarity-tag legendary">仙品 (Legendary)</span>
                </div>
                <p style="margin-top:10px; font-size:0.9rem; color:#888;">注：仙品法宝拥有改变规则的逆天能力。</p>
            </div>
        `;

        // Tab 3: Controls & Tips
        const controlsContent = `
             <div class="intro-section">
                <h3>🎮 操作指南</h3>
                <ul class="intro-list">
                    <li><strong>出牌</strong>：拖拽卡牌 到 敌人身上 或 战斗区域中心。</li>
                    <li><strong>结束回合</strong>：点击右侧“结束回合”按钮。</li>
                    <li><strong>查看详情</strong>：长按/悬停在 卡牌、状态图标、法宝 上查看详细说明。</li>
                    <li><strong>神器技能</strong>：点击角色头像旁的技能图标释放角色绝技。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>💾 存档与云同步</h3>
                <p class="intro-text">
                    本游戏支持 <strong>浏览器本地存档</strong> 与 <strong>账号云存档</strong> 双重备份。
                </p>
                <ul class="intro-list">
                    <li><strong>本地</strong>：自动保存进度在当前浏览器中。</li>
                    <li><strong>云端</strong>：注册登录后，存档将同步至服务器，可在不同设备间无缝切换。</li>
                    <li><strong>冲突解决</strong>：若发现本地与云端不一致，系统会提示您选择保留哪一份。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>💡 逆命心得</h3>
                 <ul class="intro-list">
                    <li><strong>精简卡组</strong>：商店可花费灵石 "销毁" 弱卡。卡组越薄，核心Key牌上手率越高。</li>
                    <li><strong>观察意图</strong>：注意敌人头顶的意图图标（攻击、格挡、Debuff），制定应对策略。</li>
                    <li><strong>保留灵力</strong>：部分防御牌或法宝需要灵力触发，不要每次都把灵力用光。</li>
                </ul>
            </div>
        `;

        // Tab 4: Updates
        const updatesContent = `
             <div class="intro-section">
                <h3>📜 版本日志 v5.0 最终版</h3>
                <p style="color:var(--accent-gold); margin-bottom:10px;">Update: 逆命轮回·天道终焉</p>
                <ul class="intro-list">
                    <li><strong>[最终版]</strong> 游戏内容全面完善，正式发布！</li>
                    <li><strong>[新增]</strong> 18层天域试炼，100+独特妖魔。</li>
                    <li><strong>[新增]</strong> 4大角色，各具特色的命环系统。</li>
                    <li><strong>[新增]</strong> 300+卡牌，50+法宝，30+法则。</li>
                    <li><strong>[优化]</strong> 精美的"墨金"UI，沉浸式修仙体验。</li>
                    <li><strong>[优化]</strong> 云存档支持，多设备无缝切换。</li>
                </ul>
            </div>

            <div class="intro-section">
                <h3>👨‍💻 关于开发者</h3>
                <p class="intro-text">
                    Designed & Developed by <strong>HealthOvO</strong> Team.
                </p>
                <p class="intro-text" style="font-size: 0.9rem;">
                    本项目致力于打造最硬核、最具东方韵味的卡牌Roguelike。如果您有任何建议或发现BUG，欢迎反馈！
                </p>
                <div style="margin-top:20px; text-align:center;">
                    <a href="https://github.com/HealthOvO/The-Defier" target="_blank" style="color:var(--accent-cyan); text-decoration:none; border-bottom:1px dashed var(--accent-cyan);">GitHub Repository</a>
                </div>
            </div>
        `;


        settingsContainer.innerHTML = `
        <div class="game-intro-container">
            <div class="intro-header">
                <h2>📖 逆命者指南</h2>
                <div class="subtitle">The Defier's Handbook</div>
            </div>

            <nav class="intro-tabs">
                <button class="intro-tab-btn active" data-tab="overview" onclick="game.switchIntroTab('overview')">综述</button>
                <button class="intro-tab-btn" data-tab="mechanics" onclick="game.switchIntroTab('mechanics')">机制</button>
                <button class="intro-tab-btn" data-tab="controls" onclick="game.switchIntroTab('controls')">操作</button>
                <button class="intro-tab-btn" data-tab="updates" onclick="game.switchIntroTab('updates')">更新</button>
            </nav>

            <div class="intro-content-area">
                <div id="intro-overview" class="intro-tab-panel active">
                    ${overviewContent}
                </div>
                <div id="intro-mechanics" class="intro-tab-panel">
                    ${mechanicsContent}
                </div>
                <div id="intro-controls" class="intro-tab-panel">
                    ${controlsContent}
                </div>
                <div id="intro-updates" class="intro-tab-panel">
                    ${updatesContent}
                </div>
            </div>
            
            <div style="text-align: center; margin-top: auto; font-size: 0.8rem; color: rgba(255,255,255,0.2); padding-top: 10px;">
                v5.0.0 最终版 | Breaking Fate since 2024
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
            modal.classList.remove('upgrade-mode'); // Clean up upgrade UI overrides
        });

        // Specific Modals (lacking generic class)
        const purification = document.getElementById('purification-modal');
        if (purification) purification.classList.remove('active');
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
        // Hardcore: 价格随天域层数上涨，每重天+15%
        const priceMult = 1 + (realm - 1) * 0.15;

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

        // 3. 随机商品 (由原来的随机服务改为固定商品位 + 概率位)

        // --- 有概率刷出一个法宝 (如果有未拥有的) ---
        // 使用加权随机逻辑
        const treasure = this.getWeightedRandomTreasure();

        if (treasure && Math.random() < 0.5) {
            // 计算价格：基础价格 * (1 + 0.1 * (层数-1))
            let finalPrice = Math.floor((treasure.price || 150) * priceMult);

            services.push({
                id: treasure.id,
                type: 'treasure',
                name: treasure.name,
                icon: treasure.icon || '🏺',
                desc: treasure.description,
                price: finalPrice,
                sold: false,
                rarity: treasure.rarity
            });
        }

        // 4. 概率商品 (法则/药水/额外法宝)
        // 降低概率，因为已经必出法宝了
        if (Math.random() < 0.25) {
            const lawKeys = Object.keys(LAWS);
            const uncollected = lawKeys.filter(k => !this.player.collectedLaws.some(l => l.id === k));
            if (uncollected.length > 0) {
                const randomLawId = uncollected[Math.floor(Math.random() * uncollected.length)];
                const law = LAWS[randomLawId];
                services.push({
                    id: 'law',
                    type: 'item',
                    name: '法则残卷',
                    icon: '📜',
                    desc: `获得: ${law.name} `,
                    price: Math.floor(250 * priceMult),
                    sold: false,
                    data: law
                });
            }
        }

        if (Math.random() < 0.2) {
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

    // 获取加权随机法宝
    getWeightedRandomTreasure() {
        if (typeof TREASURES === 'undefined') return null;

        const unowned = Object.values(TREASURES).filter(t => !this.player.hasTreasure(t.id));
        if (unowned.length === 0) return null;

        // Weights
        const weights = {
            common: 60,
            uncommon: 30,
            rare: 10,
            epic: 5,
            legendary: 2
        };

        const totalWeight = unowned.reduce((sum, t) => sum + (weights[t.rarity] || 10), 0);
        let roll = Math.random() * totalWeight;

        for (const t of unowned) {
            roll -= (weights[t.rarity] || 10);
            if (roll <= 0) return t;
        }
        return unowned[0];
    }

    // 生成商店卡牌 (封装以便刷新使用)
    generateShopCards(count = 5) {
        const items = [];
        // 商店刷新的卡牌价格不随层数膨胀太厉害，主要还是原价打折
        const realm = this.player.realm || 1;
        // 卡牌本身价格固定，这里Multiplier主要影响折扣力度? 不，这里影响最终售价
        // 卡牌基础价值较低，这里只微调
        const priceMult = 1 + (realm - 1) * 0.05;

        for (let i = 0; i < count; i++) {
            // 随层数提升稀有度
            let rarity = 'common';
            const roll = Math.random();
            if (realm >= 3) {
                // Hardcore: 2% legendary, 6% epic, 18% rare, 34% uncommon, 40% common
                if (roll < 0.02) rarity = 'legendary';
                else if (roll < 0.08) rarity = 'epic';
                else if (roll < 0.26) rarity = 'rare';
                else if (roll < 0.60) rarity = 'uncommon';
                else rarity = 'common';
            } else {
                if (roll < 0.05) rarity = 'legendary';
                else if (roll < 0.2) rarity = 'rare';
                else if (roll < 0.5) rarity = 'uncommon';
            }

            const card = getRandomCard(rarity, this.player.characterId);

            if (!card) continue;

            // Hardcore: 移除折扣，仅按难度系数
            const basePrice = this.getCardPrice(card);
            const price = Math.floor(basePrice * 1.0 * priceMult);

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
        if (nameEl) nameEl.textContent = skill.name + (this.player.skillLevel > 1 ? ` Lv.${this.player.skillLevel} ` : '');
        if (descEl) {
            if (skill.getDescription) {
                descEl.textContent = skill.getDescription(this.player.skillLevel);
            } else {
                descEl.textContent = skill.description;
            }
        }

        // Cooldown - Color Recovery Progress
        const overlay = btn.querySelector('.skill-cooldown-overlay');
        const text = btn.querySelector('.skill-cooldown-text');
        const loreEl = btn.querySelector('.skill-lore');

        if (this.player.skillCooldown > 0) {
            // 计算恢复进度 (0-1，0表示完全冷却，1表示即将可用)
            const progress = 1 - (this.player.skillCooldown / this.player.maxCooldown);

            // 不显示CD文本
            text.textContent = '';
            text.style.display = 'none';

            // 通过颜色恢复表示进度
            // 灰度从100%逐渐降低到0%
            const grayscale = (1 - progress) * 100;
            // 透明度从0.5逐渐增加到1
            const opacity = 0.5 + progress * 0.5;

            btn.style.filter = `grayscale(${grayscale}%)`;
            btn.style.opacity = opacity;

            // Overlay不再使用，设为0
            overlay.style.height = '0%';

            btn.classList.add('cooldown');
            btn.classList.remove('ready');

            // 在lore位置显示CD信息（仅tooltip可见）
            if (loreEl) {
                loreEl.textContent = `冷却中: ${this.player.skillCooldown} 回合`;
            }
        } else {
            overlay.style.height = '0%';
            text.textContent = '';
            text.style.display = 'none';
            btn.style.filter = 'none';
            btn.style.opacity = '1';
            btn.classList.remove('cooldown');
            btn.classList.add('ready');

            // 恢复lore文本
            if (loreEl) {
                loreEl.textContent = '"逆乱阴阳，颠倒乾坤。"';
            }
        }


    }

    // 激活主动技能 - 点击按钮触发
    // 激活主动技能 - 点击按钮触发
    activatePlayerSkill() {
        if (this.currentScreen !== 'battle-screen') return;
        if (this.battle.currentTurn !== 'player') {
            Utils.showBattleLog('现在不是你的回合！');
            return;
        }

        // 预检查：是否冷却中
        if (this.player.skillCooldown > 0) {
            Utils.showBattleLog(`技能冷却中(${this.player.skillCooldown})`);
            return;
        }

        // 直接通过验证，执行技能
        if (this.player.activateSkill(this.battle)) {
            this.updateActiveSkillUI();
            this.battle.updateBattleUI();
            // 增强反馈
            const btn = document.getElementById('active-skill-btn');
            if (btn) {
                Utils.addShakeEffect(btn);
                btn.classList.remove('ready');

                // Add particle effect customization here if needed
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

    // 显示技能确认弹窗
    showSkillConfirmModal() {
        const modal = document.getElementById('skill-confirm-modal');
        const titleEl = document.getElementById('skill-confirm-title');
        const iconEl = document.getElementById('skill-confirm-icon');
        const descEl = document.getElementById('skill-confirm-desc');

        if (this.player.activeSkill) {
            titleEl.textContent = `${this.player.activeSkill.name} `;
            iconEl.textContent = this.player.activeSkill.icon || '⚡';

            if (this.player.activeSkill.getDescription) {
                descEl.textContent = this.player.activeSkill.getDescription(this.player.skillLevel);
            } else {
                descEl.textContent = this.player.activeSkill.description;
            }
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
        if (msgEl) msgEl.innerHTML = message.replace(/\n/g, '<br>');
        if (titleEl) titleEl.textContent = title;

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
            priceBtn.innerHTML = item.sold ? '已售出' : `💰 ${item.price} `;

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
            el.id = `service - ${service.id} `;
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
            Utils.showBattleLog(`购买了 ${item.card.name} `);

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

        // 自动保存 (防止刷新丢进度)
        this.saveGame();
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
                Utils.showBattleLog(`命环进化为：${path.name} `);
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
                Utils.showBattleLog(`获得法宝：${service.name} `);
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
                this.showRewardModal('命环充能', `命环经验 + 50！\n距离下一级更近了。`, '⬆️');
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
                this.player.addPermaBuff('maxHp', 5);
                this.player.currentHp += 5;
                Utils.showBattleLog('最大生命 +5');
                this.showRewardModal('体质增强', `最大生命值上限 + 5！`, '💊');
                return true;

            case 'strength':
                this.player.addPermBuff('strength', 1);
                Utils.showBattleLog('永久力量 +1');
                this.showRewardModal('力量觉醒', `永久力量 + 1！\n你的攻击将更加致命。`, '💪');
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

    // 显示移除卡牌界面 (Refactored: Ink & Gold Purification UI)
    showRemoveCard(serviceItem) {
        if (this.player.gold < serviceItem.price) {
            Utils.showBattleLog('灵石不足！');
            return;
        }

        // Close other modals
        this.closeModal();

        const modal = document.getElementById('purification-modal');
        const grid = document.getElementById('purification-grid');
        const costDisplay = document.getElementById('purification-cost-display');
        const confirmBtn = document.getElementById('purification-confirm-btn');

        if (!modal || !grid) {
            console.error('Purification UI elements missing!');
            return;
        }

        // Reset State
        grid.innerHTML = '';
        modal.classList.add('active');
        costDisplay.textContent = `消耗: ${serviceItem.price} 灵石`;
        confirmBtn.disabled = true;
        confirmBtn.onclick = null; // Clear previous listeners

        let selectedIndex = -1;

        // Render Cards
        this.player.deck.forEach((card, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'purification-card-wrapper';

            // Create standard card element
            const cardEl = Utils.createCardElement(card, index);
            // Disable default hover/click behaviors if they conflict, though CSS handles most
            wrapper.appendChild(cardEl);

            // Delete Intent Overlay (Visual)
            const overlay = document.createElement('div');
            overlay.className = 'delete-intent-overlay';
            overlay.innerHTML = '<span class="delete-icon">🔥</span>';
            wrapper.appendChild(overlay);

            // Selection Logic
            wrapper.addEventListener('click', () => {
                // Deselect others
                document.querySelectorAll('.purification-card-wrapper').forEach(el => el.classList.remove('selected'));

                if (selectedIndex === index) {
                    // Deselect if clicking same
                    selectedIndex = -1;
                    confirmBtn.disabled = true;
                    confirmBtn.textContent = '确认移除 (Confirm)';
                } else {
                    // Select new
                    selectedIndex = index;
                    wrapper.classList.add('selected');
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = `确认焚毁 (Burn)`;

                    // Sound effect if available
                    if (typeof audioManager !== 'undefined') {
                        audioManager.playSFX('click');
                    }
                }
            });

            grid.appendChild(wrapper);
        });

        // Confirm Action
        confirmBtn.onclick = () => {
            if (selectedIndex === -1) return;

            const cardName = this.player.deck[selectedIndex].name;
            const targetWrapper = grid.children[selectedIndex];

            // Visual Burn Effect
            const burn = document.createElement('div');
            burn.className = 'card-burn-effect';
            targetWrapper.appendChild(burn);

            // Audio
            if (typeof audioManager !== 'undefined') {
                audioManager.playSFX('fire'); // Assuming 'fire' exists, or 'buff'
            }

            // Delay actual removal for animation
            setTimeout(() => {
                // Remove from deck
                this.player.deck.splice(selectedIndex, 1);
                this.player.gold -= serviceItem.price;

                // Update Logic
                this.player.removeCount = (this.player.removeCount || 0) + 1;
                serviceItem.sold = true;

                // Close UI
                modal.classList.remove('active');

                // Feedback
                Utils.showBattleLog(`【${cardName}】已化为灰烬...`);

                // Refresh shop UI to show sold status
                this.renderShop();
                document.getElementById('shop-gold-display').textContent = this.player.gold;

            }, 800);
        };
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
        const healAmount = Math.floor(this.player.maxHp * 0.2);
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
        const healAmount = Math.floor(this.player.maxHp * 0.2);
        this.player.heal(healAmount);
        Utils.showBattleLog(`休息恢复 ${healAmount} 点生命！`);

        this.closeModal();
        this.completeCampfire();
    }

    // 显示升级卡牌界面 (Refactored: Ink & Gold Edition)
    showCampfireUpgrade() {
        this.closeModal();

        const modal = document.getElementById('deck-modal');
        // Add specific class for styling override (no scroll on parent)
        modal.classList.add('upgrade-mode');

        // Ensure we remove this class when modal closes (simple patch: override the close button or handle in general close)
        // For now, let's attach a one-time listener to the close button to remove the class
        const closeBtn = modal.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                modal.classList.remove('upgrade-mode');
                this.closeModal();
            };
        }
        const container = document.getElementById('deck-view-cards');

        // Reset Modal State
        container.innerHTML = '';
        container.style.display = 'block'; // Reset flex styles from previous usage

        // --- 1. Main Layout Container ---
        const layout = document.createElement('div');
        layout.className = 'upgrade-modal-layout';

        // --- 2. Left: Card Grid ---
        const cardGrid = document.createElement('div');
        cardGrid.className = 'upgrade-card-grid';

        // --- 3. Right: Preview Panel ---
        const previewPanel = document.createElement('div');
        previewPanel.className = 'upgrade-preview-panel';
        previewPanel.innerHTML = `
            <div class="preview-title">悟道演练</div>
            <div class="preview-placeholder" id="ug-preview-placeholder">
                <span style="font-size:3rem; display:block; margin-bottom:20px; opacity:0.3">👆</span>
                点击左侧卡牌<br>推演进阶效果
            </div>
            
            <div id="ug-preview-content" style="display:none; width:100%; flex-direction:column; align-items:center;">
                <div class="preview-card-container" id="ug-preview-card"></div>
                
                <div class="preview-diff-box" id="ug-diff-box">
                    <!-- Dynamic Rows -->
                </div>

                <button class="confirm-upgrade-btn" id="ug-confirm-btn" disabled>
                    <span class="btn-text">注灵进阶</span>
                </button>
            </div>
        `;

        layout.appendChild(cardGrid);
        layout.appendChild(previewPanel);
        container.appendChild(layout);

        // --- 4. Logic & Interaction ---
        const placeholder = previewPanel.querySelector('#ug-preview-placeholder');
        const contentArea = previewPanel.querySelector('#ug-preview-content');
        const cardContainer = previewPanel.querySelector('#ug-preview-card');
        const diffBox = previewPanel.querySelector('#ug-diff-box');
        const confirmBtn = previewPanel.querySelector('#ug-confirm-btn');

        let selectedIndex = -1;
        let selectedCard = null;

        // Render Cards
        this.player.deck.forEach((card, index) => {
            if (!canUpgradeCard(card)) return; // Only show upgradable

            // Create standard card
            const cardEl = Utils.createCardElement(card, index);

            // Interaction
            cardEl.addEventListener('click', () => {
                // Audio
                if (typeof audioManager !== 'undefined') audioManager.playSFX('click');

                // Highlight Selection
                cardGrid.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
                cardEl.classList.add('selected');

                selectedIndex = index;
                selectedCard = card;

                // Show Preview
                this.updateUpgradePreview(card, placeholder, contentArea, cardContainer, diffBox, confirmBtn);
            });

            cardGrid.appendChild(cardEl);
        });

        // Bind Confirm
        confirmBtn.onclick = () => {
            if (selectedIndex === -1) return;

            // Audio
            if (typeof audioManager !== 'undefined') audioManager.playSFX('powerup'); // Or 'upgrade'

            // Visual Effect
            const overlay = document.createElement('div');
            overlay.className = 'upgrade-flash-overlay';
            container.appendChild(overlay);

            // Execute Logic
            setTimeout(() => {
                const upgradedCard = upgradeCard(selectedCard);
                // Replace in deck (must handle reference carefully or splice)
                // Assuming deck is array of objects
                this.player.deck[selectedIndex] = upgradedCard;

                this.closeModal();
                this.completeCampfire();
            }, 500);
        };

        modal.classList.add('active');

        // Update Title (Optional override)
        const title = modal.querySelector('h2');
        if (title) title.textContent = '🔥 营地 | 悟道进阶';
    }

    // Helper: Update Preview Panel
    updateUpgradePreview(card, placeholder, contentArea, cardContainer, diffBox, confirmBtn) {
        placeholder.style.display = 'none';
        contentArea.style.display = 'flex';
        confirmBtn.disabled = false;

        // Generate Upgraded Version
        const upgraded = upgradeCard(card);

        // 1. Render Card Visual
        cardContainer.innerHTML = '';
        const upgradedEl = Utils.createCardElement(upgraded, 999);
        // Remove hover effects on preview card to keep it static
        upgradedEl.style.transform = 'none';
        upgradedEl.style.pointerEvents = 'none';
        cardContainer.appendChild(upgradedEl);

        // 2. Diff Logic
        let diffHtml = '';

        // Name Diff (if changed)
        if (card.name !== upgraded.name) {
            diffHtml += `
                <div class="diff-row">
                    <span class="diff-label">名讳</span>
                    <div>
                        <span class="diff-val-old">${card.name}</span>
                        <span class="diff-val-new"> ➤ ${upgraded.name}</span>
                    </div>
                </div>`;
        }

        // Damage Diff
        if (card.damage !== upgraded.damage && upgraded.damage) {
            diffHtml += `
                <div class="diff-row">
                    <span class="diff-label">威力</span>
                    <div>
                        <span class="diff-val-old">${card.damage || 0}</span>
                        <span class="diff-val-new"> ➤ ${upgraded.damage}</span>
                    </div>
                </div>`;
        }

        // Block Diff
        if (card.block !== upgraded.block && upgraded.block) {
            diffHtml += `
                <div class="diff-row">
                    <span class="diff-label">护盾</span>
                    <div>
                        <span class="diff-val-old">${card.block || 0}</span>
                        <span class="diff-val-new"> ➤ ${upgraded.block}</span>
                    </div>
                </div>`;
        }

        // Cost Diff
        if (card.cost !== upgraded.cost) {
            diffHtml += `
                <div class="diff-row">
                    <span class="diff-label">消耗</span>
                    <div>
                        <span class="diff-val-old">${card.cost}</span>
                        <span class="diff-val-new"> ➤ ${upgraded.cost}</span>
                    </div>
                </div>`;
        }

        // Description Diff (Always show as summary)
        diffHtml += `
            <div class="diff-row" style="flex-direction:column; border:none; margin-top:5px;">
                <span class="diff-label" style="margin-bottom:2px;">效果演变</span>
                <span class="diff-val-new" style="font-size:0.85rem; line-height:1.4">${upgraded.description}</span>
            </div>
        `;

        diffBox.innerHTML = diffHtml;
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

    // 显示移除卡牌界面（营地版 - Ink & Gold Refactor）
    showCampfireRemove() {
        this.closeModal();

        const modal = document.getElementById('purification-modal');
        const grid = document.getElementById('purification-grid');
        const costDisplay = document.getElementById('purification-cost-display');
        const confirmBtn = document.getElementById('purification-confirm-btn');

        if (!modal || !grid) {
            console.error('Purification UI elements missing!');
            return;
        }

        // Reset State
        grid.innerHTML = '';
        modal.classList.add('active');

        // Campfire specific adjustments
        costDisplay.innerHTML = '<span style="color: var(--accent-green); font-size: 1.1em;">✨ 净化心灵</span>';

        confirmBtn.disabled = true;
        confirmBtn.onclick = null; // Clear listeners

        let selectedIndex = -1;

        // Render Cards
        this.player.deck.forEach((card, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'purification-card-wrapper';

            // Create standard card element
            const cardEl = Utils.createCardElement(card, index);
            wrapper.appendChild(cardEl);

            // Delete Intent Overlay (Visual)
            const overlay = document.createElement('div');
            overlay.className = 'delete-intent-overlay';
            overlay.innerHTML = '<span class="delete-icon">🔥</span>';
            wrapper.appendChild(overlay);

            // Selection Logic
            wrapper.addEventListener('click', () => {
                // Deselect others
                document.querySelectorAll('.purification-card-wrapper').forEach(el => el.classList.remove('selected'));

                if (selectedIndex === index) {
                    // Deselect
                    selectedIndex = -1;
                    confirmBtn.disabled = true;
                    confirmBtn.textContent = '选择移除对象';
                } else {
                    // Select
                    selectedIndex = index;
                    wrapper.classList.add('selected');
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = `确认焚毁 (Burn)`;

                    if (typeof audioManager !== 'undefined') audioManager.playSFX('click');
                }
            });

            grid.appendChild(wrapper);
        });

        // Confirm Action
        confirmBtn.onclick = () => {
            if (selectedIndex === -1) return;

            const cardName = this.player.deck[selectedIndex].name;
            const targetWrapper = grid.children[selectedIndex];

            // Visual Burn Effect
            const burn = document.createElement('div');
            burn.className = 'card-burn-effect';
            targetWrapper.appendChild(burn);

            if (typeof audioManager !== 'undefined') audioManager.playSFX('fire');

            // Delay actual removal
            setTimeout(() => {
                this.campfireRemoveCard(selectedIndex);

                // Close UI manually here since campfireRemoveCard might need to handle logic differently if we didn't pass params
                // Actually campfireRemoveCard calls closeModal/completeCampfire, so we are good.
            }, 800);
        };
    }

    // 移除选中的卡牌（营地版 - 逻辑处理）
    campfireRemoveCard(index) {
        const card = this.player.deck[index];
        this.player.deck.splice(index, 1);

        // Removed tracking count logic if specific to shop, or keep it if global? 
        // Let's increment global remove count just in case
        this.player.removeCount = (this.player.removeCount || 0) + 1;

        Utils.showBattleLog(`【${card.name}】已化为灰烬...`);
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
        if (
            typeof AuthService !== 'undefined' &&
            AuthService.isCloudEnabled &&
            !AuthService.isCloudEnabled()
        ) {
            const modalMsg = document.getElementById('auth-message');
            if (modalMsg) modalMsg.innerText = '云存档未配置，当前仅可离线游玩';
            Utils.showBattleLog('云存档未配置，已切换为离线模式');
            return;
        }

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
        if (AuthService.isCloudEnabled && !AuthService.isCloudEnabled()) {
            this.guestMode = true;
            this.showCharacterSelection();
            return;
        }

        if (!AuthService.isLoggedIn()) {
            this.showConfirmModal(
                '尚未登录，是否先登录以同步云端存档？',
                () => {
                    this.guestMode = false;
                    this.showLoginModal();
                },
                () => {
                    // Guest mode
                    this.guestMode = true;
                    this.showCharacterSelection();
                }
            );
            return;
        }

        this.guestMode = false;

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
            this.renderSaveSlots(slots);
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
        this.guestMode = false;
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
            this.renderSaveSlots(slots);

        }, 500);
    }

    // 显示存档位选择模态框 (Spirit Tablet Style)
    renderSaveSlots(slots) {
        const modal = document.getElementById('save-slots-modal');
        const container = document.getElementById('slots-container');
        if (!modal || !container) return;

        container.innerHTML = '';

        slots.forEach((slotData, index) => {
            const slotEl = document.createElement('div');
            const isEmpty = !slotData;
            slotEl.className = `save-slot ${isEmpty ? 'empty' : ''}`;

            const slotName = `命 牌 · ${['一', '二', '三', '四'][index] || (index + 1)}`;

            let contentHtml = '';
            if (isEmpty) {
                contentHtml = `
                    <div class="slot-visual" style="border-color: #555; opacity: 0.5;">?</div>
                    <div class="slot-empty-text">虚位以待</div>
                `;
            } else {
                let date = new Date(slotData.timestamp).toLocaleDateString();
                let dateLabel = "更新";
                if (slotData.player && slotData.player.registerTime) {
                    date = new Date(slotData.player.registerTime).toLocaleDateString();
                    dateLabel = "注册";
                }
                const realm = (slotData.player && slotData.player.realm) ? slotData.player.realm : 1;
                const hp = (slotData.player && slotData.player.currentHp) ? slotData.player.currentHp : '?';
                const roleId = (slotData.player && slotData.player.characterId);

                let roleName = '未知角色';
                let roleIcon = '👤';
                if (roleId && typeof CHARACTERS !== 'undefined' && CHARACTERS[roleId]) {
                    const c = CHARACTERS[roleId];
                    roleName = c.name;
                    // Resolve Image Path: Check .image, .portrait, or .avatar (if path)
                    const imagePath = c.image || c.portrait || (c.avatar && c.avatar.includes('/') ? c.avatar : null);

                    if (imagePath) {
                        // Use image
                        roleIcon = ''; // Clear text icon
                        // We'll handle image via style in the HTML construction loop below
                    } else {
                        roleIcon = c.avatar || '👤';
                    }

                    // Store for use below
                    slotData._tempImage = imagePath;
                }

                let maxRealm = 1;
                if (slotData.unlockedRealms && Array.isArray(slotData.unlockedRealms)) {
                    maxRealm = Math.max(...slotData.unlockedRealms);
                } else if (slotData.player && slotData.player.realm) {
                    maxRealm = slotData.player.realm;
                }

                let realmDisplay = `第${maxRealm}重天`;
                if (maxRealm > 18) {
                    realmDisplay = `<span style="color:var(--accent-gold); font-weight:bold;">已通关</span>`;
                }

                contentHtml = `
                    <div class="slot-visual ${slotData._tempImage ? 'is-image' : ''}" 
                         style="${slotData._tempImage ? `background-image: url('${slotData._tempImage}');` : ''}">
                        ${slotData._tempImage ? '' : roleIcon}
                    </div>
                
                    <div class="slot-info-primary">${roleName} <span style="font-size:0.8em; opacity:0.7">| ${realmDisplay}</span></div>
                    <div class="slot-info-secondary">❤️ ${hp}  📅 ${dateLabel}: ${date}</div>
                `;
            }

            const actionsHtml = isEmpty ?
                `<button class="talisman-btn small" onclick="game.selectSlot(${index}, 'new')">
                    <div class="talisman-paper"></div>
                    <div class="talisman-content">
                        <span class="btn-text">开启轮回</span>
                    </div>
                </button>` :
                `<button class="talisman-btn small primary" onclick="game.selectSlot(${index}, 'load')">
                    <div class="talisman-paper"></div>
                    <div class="talisman-content">
                        <span class="btn-text">继续</span>
                    </div>
                </button>
                <button class="talisman-btn small" onclick="game.selectSlot(${index}, 'overwrite')" style="margin-top:5px; transform:scale(0.9);">
                    <div class="talisman-paper" style="border-color:var(--accent-red);"></div>
                    <div class="talisman-content">
                        <span class="btn-text" style="color:var(--accent-red);">覆盖</span>
                    </div>
                </button>`;

            slotEl.innerHTML = `
                <div class="slot-header">${slotName}</div>
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

                        Utils.showBattleLog(`已加载 存档 ${index + 1} `);
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
                this.tempPreservedRealms = null;

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

        const cloudEnabled = !(AuthService.isCloudEnabled) || AuthService.isCloudEnabled();

        if (cloudEnabled && AuthService.isLoggedIn()) {
            const user = AuthService.getCurrentUser();
            // Refactored to keep button style but show user info
            btn.innerHTML = `
                    <div class="talisman-paper"></div>
                    <div class="talisman-content">
                        <span class="btn-icon">👤</span>
                        <span class="btn-text" style="font-size:0.9rem">${user.username}</span>
                    </div>
                `;
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
            btn.innerHTML = `
                    <div class="talisman-paper"></div>
                    <div class="talisman-content">
                        <span class="btn-icon">☁️</span>
                        <span class="btn-text">登入轮回</span>
                    </div>
                `;
            btn.onclick = () => this.showLoginModal();
            if (!cloudEnabled) {
                btn.innerHTML = `
                    <div class="talisman-paper"></div>
                    <div class="talisman-content">
                        <span class="btn-icon">☁️</span>
                        <span class="btn-text">离线模式</span>
                    </div>
                `;
                btn.onclick = () => {
                    Utils.showBattleLog('云存档未配置，当前为离线模式');
                };
            }
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
                try {
                    const data = JSON.parse(localSave);
                    // 尝试从本地存档中获取槽位ID
                    let targetSlot = data.saveSlot;
                    if (targetSlot === undefined || targetSlot === null) {
                        targetSlot = this.currentSaveSlot;
                    }

                    if (targetSlot === undefined || targetSlot === null) {
                        alert('错误：无法确定存档位，请先进入游戏选择存档位后再尝试同步。');
                        return;
                    }

                    AuthService.saveCloudData(data, targetSlot).then(res => {
                        if (res.success) {
                            Utils.showBattleLog(`本地存档已同步至云端(Slot ${targetSlot + 1})`);
                            modal.classList.remove('active');
                            // Update cache
                            if (this.cachedSlots) this.cachedSlots[targetSlot] = data;
                        } else {
                            alert('云端同步失败：' + (res.message || '未知错误'));
                        }
                    });
                } catch (e) {
                    console.error('Resolve conflict error:', e);
                    alert('存档数据异常，无法上传');
                }
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
    // 加载云端存档 (Legacy -> Redirect to Slots)
    loadCloudGame() {
        console.warn('loadCloudGame is deprecated. Opening slot selection.');
        this.openSaveSlotsWithSync();
    }

    // 打开法宝囊
    showTreasureBag() {
        // 创建或获取法宝囊模态框
        let modal = document.getElementById('treasure-bag-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'treasure-bag-modal';
            modal.className = 'modal treasure-bag-modal';
            modal.innerHTML = `
            <div class="modal-content large-modal">
                    <span class="close-btn">&times;</span>
                    <h2>🎒 法宝囊</h2>
                    
                    <div class="treasure-bag-layout">
                        <!-- 左侧：已装备 -->
                        <div class="equipped-section">
                            <h3>已装备法宝 <span id="equipped-count">0/2</span></h3>
                            <div class="equipped-grid" id="equipped-grid"></div>
                            <div class="slot-info">突破境界可解锁更多槽位</div>
                        </div>

                        <!-- 右侧：仓库 -->
                        <div class="inventory-section">
                            <h3>法宝仓库</h3>
                            <div class="inventory-grid" id="inventory-grid"></div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // 绑定关闭
            const closeBtn = modal.querySelector('.close-btn');
            closeBtn.onclick = () => {
                modal.style.display = 'none';
                if (this.currentScreen === 'map-screen') {
                    this.updateMapUI(); // 刷新地图上的法宝显示
                }
            };

            // 点击背景关闭
            modal.onclick = (e) => {
                if (e.target === modal) modal.style.display = 'none';
            };
        }

        modal.style.display = 'flex';
        this.updateTreasureBagUI();
    }

    // 更新法宝囊界面
    updateTreasureBagUI() {
        const modal = document.getElementById('treasure-bag-modal');
        if (!modal || modal.style.display === 'none') return;

        const maxSlots = this.player.getMaxTreasureSlots();
        const equippedCountObj = document.getElementById('equipped-count');
        if (equippedCountObj) {
            equippedCountObj.innerText = `${this.player.equippedTreasures.length}/${maxSlots}`;
        }

        const equippedGrid = document.getElementById('equipped-grid');
        const inventoryGrid = document.getElementById('inventory-grid');

        equippedGrid.innerHTML = '';
        inventoryGrid.innerHTML = '';

        // 渲染装备槽
        for (let i = 0; i < maxSlots; i++) {
            const treasure = this.player.equippedTreasures[i];
            const slot = document.createElement('div');
            slot.className = 'treasure-slot';

            if (treasure) {
                const icon = treasure.icon || '📦';
                const name = treasure.name || treasure.id;
                const desc = treasure.description || (treasure.getDesc ? treasure.getDesc(this.player) : '');
                const shortDesc = desc.length > 25 ? desc.substring(0, 25) + '...' : desc;
                const rarityLabel = this.getRarityLabel(treasure.rarity || 'common');

                slot.className += ' filled rarity-' + (treasure.rarity || 'common');
                slot.innerHTML = `
                    <div class="t-icon">${icon}</div>
                    <div class="t-name">${name}</div>
                    <div class="t-rarity" style="font-size:0.7rem; margin-bottom:2px;">${rarityLabel}</div>
                    <div class="t-effect">${shortDesc}</div>
                    <button class="unequip-btn">卸下</button>
                `;

                // Click to view, btn to unequip
                slot.onclick = (e) => {
                    if (e.target.className === 'unequip-btn') {
                        e.stopPropagation();
                        this.player.unequipTreasure(treasure.id);
                        if (typeof audioManager !== 'undefined') audioManager.playSFX('click');
                        this.updateTreasureBagUI();
                    } else {
                        // Show full info
                        this.showAlertModal(desc, name);
                    }
                };

                // Add right-click to view details
                slot.oncontextmenu = (e) => {
                    e.preventDefault();
                    this.showAlertModal(desc, name);
                };
            } else {
                slot.className += ' empty';
                slot.innerHTML = '<div class="empty-text">空闲槽位</div>';
            }
            equippedGrid.appendChild(slot);
        }

        // 渲染仓库
        // 过滤掉已装备的
        let inventory = this.player.collectedTreasures.filter(t => !this.player.isTreasureEquipped(t.id));

        // 排序：按品质高到低 (仙品 > 神品 > 灵品 > 凡品)
        const rarityWeights = { 'mythic': 4, 'legendary': 3, 'rare': 2, 'common': 1 };
        inventory.sort((a, b) => {
            const wA = rarityWeights[a.rarity || 'common'] || 1;
            const wB = rarityWeights[b.rarity || 'common'] || 1;
            return wB - wA;
        });

        if (inventory.length === 0) {
            inventoryGrid.innerHTML = '<div class="empty-inventory">暂无闲置法宝</div>';
        } else {
            inventory.forEach(t => {
                // 确保图标存在，如果不存在则使用默认
                const icon = t.icon || '📦';
                const name = t.name || t.id;
                const desc = t.description || (t.getDesc ? t.getDesc(this.player) : '未知效果');
                const rarityLabel = this.getRarityLabel(t.rarity || 'common');

                const el = document.createElement('div');
                el.className = `inventory-item rarity-${t.rarity || 'common'}`;
                el.innerHTML = `
                    <div class="t-icon">${icon}</div>
                    <div class="t-name">${name}</div>
                    <div class="t-rarity" style="font-size:0.7rem; margin-bottom:2px;">${rarityLabel}</div>
                    <div class="t-effect">${desc}</div>
                `;
                el.title = `${name}: ${desc}`;

                el.onclick = (e) => {
                    // Left click to equip
                    if (this.player.equipTreasure(t.id)) {
                        if (typeof audioManager !== 'undefined') audioManager.playSFX('equip');
                        this.updateTreasureBagUI();
                    } else {
                        // 装备失败（满）
                        if (this.player.equippedTreasures.length >= maxSlots) {
                            this.showAlertModal(`⚠️ 法宝槽位已满！请先卸下其他法宝。`, '无法装备');
                        }
                    }
                };

                // Right click to view details - 使用 addEventListener 确保绑定成功
                el.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation(); // 防止冒泡
                    this.showAlertModal(desc, name);
                    return false;
                });

                inventoryGrid.appendChild(el);
            });
        }
    }

    // 获取法宝获取途径
    getTreasureSource(t) {
        // 特殊法宝的详细来源
        const specificSources = {
            // 普通法宝
            'vitality_stone': '商店购买 (第1重起) · 精英敌人掉落',
            'sharp_whetstone': '商店购买 (第1重起) · 普通敌人掉落',
            'pressure_talisman': '商店购买 (第1重起) · 击败山寨头目掉落',
            'soul_jade': '商店购买 (第1重起) · 击败妖狼王掉落',
            'qi_gourd': '商店购买 (第1重起) · 奇遇事件奖励',
            'spirit_stone': '商店购买 (第1重起) · 营地供奉获得',
            'blood_orb': '商店购买 (第2重起) · 精英敌人掉落',
            'iron_talisman': '商店购买 (第1重起) · 普通敌人掉落',

            // 稀有法宝
            'soul_banner': '商店购买 (第2重起) · 精英敌人掉落',
            'spirit_bead': '商店购买 (第2重起) · 奇遇事件奖励',
            'ice_spirit_bead': '第3重商店解锁 · 击败丹尊掉落 · 第10重Boss掉落',
            'heart_mirror': '商店购买 (第2重起) · 击败仙门长老掉落',
            'seal_soul_bead': '第4重商店解锁 · 击败上古遗灵掉落',
            'space_anchor': '第5重商店解锁 · 击败化神大能掉落',
            'wind_bead': '第10重商店解锁 · 击败风暴唤灵者掉落',
            'ward_jade': '商店购买 (第2重起) · 精英毒蛇敌人掉落',
            'diamond_amulet': '第3重商店解锁 · 奇遇事件奖励',
            'phoenix_feather': '第3重商店解锁 · 火焰地带奇遇',
            'tortoise_shell': '第4重商店解锁 · 击败精英敌人',

            // 传说法宝
            'flying_dagger': '第5重商店解锁 · Boss首杀奖励',
            'yin_yang_mirror': '第6重商店解锁 · 奇遇事件奖励',
            'void_mirror': '第11重商店解锁 · 击败三首金龙掉落',
            'soul_severing_blade': '第14重商店解锁 · 击败虚空吞噬者掉落',
            'spirit_turtle_shell': '第6重商店解锁 · 击败合体天尊掉落',
            'cloud_boots': '第7重商店解锁 · 击败大乘至尊掉落',
            'thunder_ward': '第8重商店解锁 · 击败飞升主宰掉落 · 雷劫奇遇',
            'truth_mirror': '第12重商店解锁 · 击败心魔镜像掉落',
            'clarity_bead': '第13重商店解锁 · 击败混沌之眼掉落',
            'nine_sword_case': '第9重商店解锁 · 剑冢奇遇事件',

            // 神话法宝
            'stabilizer_pin': '第16重商店解锁 · 击败因果裁决者掉落 · 隐藏成就奖励',
            'five_element_bead': '第15重商店解锁 · 击败五行长老掉落',
            'karma_wheel': '第16重商店解锁 · 击败因果裁决者掉落',
            'heaven_shard': '仅第17-18重 · 击败天道终焉掉落 · 终极挑战奖励'
        };

        if (specificSources[t.id]) {
            return specificSources[t.id];
        }

        // 通用稀有度判断（fallback）
        const unlockRealm = TREASURE_CONFIG?.unlockRealm?.[t.id] || 1;
        switch (t.rarity) {
            case 'common': return `商店购买 (第${unlockRealm}重起) · 普通/精英敌人掉落`;
            case 'rare': return `商店购买 (第${unlockRealm}重起) · 精英/Boss敌人掉落`;
            case 'legendary': return `第${unlockRealm}重商店解锁 · Boss首杀奖励 · 奇遇事件`;
            case 'mythic': return `第${unlockRealm}重解锁 · Boss掉落 · 隐藏挑战奖励`;
            default: return '未知来源';
        }
    }

    // --- 新增：加权随机获取未拥有法宝 ---
    getWeightedRandomTreasure() {
        // 1. 确定当前层级的稀有度权重
        const realm = this.player.realm || 1;
        let weights = { common: 100, rare: 0, legendary: 0, mythic: 0 };

        if (realm <= 3) {
            weights = { common: 90, rare: 9, legendary: 1, mythic: 0 };
        } else if (realm <= 6) {
            weights = { common: 60, rare: 35, legendary: 5, mythic: 0 };
        } else if (realm <= 10) {
            weights = { common: 30, rare: 50, legendary: 19, mythic: 1 };
        } else {
            weights = { common: 10, rare: 40, legendary: 45, mythic: 5 };
        }

        // 2. 筛选未拥有的法宝
        const unowned = Object.keys(TREASURES)
            .map(k => TREASURES[k])
            .filter(t => !this.player.hasTreasure(t.id));

        if (unowned.length === 0) return null;

        // 3. 尝试按权重抽取稀有度
        const roll = Math.random() * 100;
        let targetRarity = 'common';
        let cumulative = 0;

        if ((cumulative += weights.common) > roll) targetRarity = 'common';
        else if ((cumulative += weights.rare) > roll) targetRarity = 'rare';
        else if ((cumulative += weights.legendary) > roll) targetRarity = 'legendary';
        else targetRarity = 'mythic';

        // 4. 在该稀有度中随机选择
        let candidates = unowned.filter(t => (t.rarity || 'common') === targetRarity);

        // 如果该稀有度没有未获得的（或者根本没定义该稀有度的法宝），回退到全局随机
        if (candidates.length === 0) {
            return unowned[Math.floor(Math.random() * unowned.length)];
        }

        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    // 辅助：获取品质名称和颜色
    getRarityLabel(rarity) {
        switch (rarity) {
            case 'common': return '<span style="color:#9e9e9e">【凡品】</span>';
            case 'rare': return '<span style="color:#4fc3f7">【灵品】</span>';
            case 'legendary': return '<span style="color:#e040fb">【神品】</span>'; // Legendary -> Mythic (Purple)
            case 'mythic': return '<span style="color:#ffab00">【仙品】</span>';    // Mythic -> Immortal (Orange)
            default: return '<span style="color:#9e9e9e">【凡品】</span>';
        }
    }

    // 显示法宝图鉴 (重构版)
    showTreasureCompendium() {
        this.showScreen('treasure-compendium');

        const grid = document.getElementById('treasure-compendium-grid');
        const statsEl = document.getElementById('treasure-compendium-stats');
        if (!grid) return;

        grid.innerHTML = '';
        if (statsEl) statsEl.innerHTML = '';

        // 1. 准备数据并排序
        let allTreasures = [];
        let ownedCount = 0;

        for (const tid in TREASURES) {
            const t = TREASURES[tid];
            const isOwned = this.player.hasTreasure(tid);
            if (isOwned) ownedCount++;

            allTreasures.push({
                id: tid,
                data: t,
                isOwned: isOwned
            });
        }

        // 排序规则: 品质 (Mythic > Legendary > Rare > Common) -> 是否拥有 (已拥有在前) -> ID
        const rarityScore = { 'mythic': 4, 'legendary': 3, 'rare': 2, 'common': 1 };

        allTreasures.sort((a, b) => {
            const rA = rarityScore[a.data.rarity || 'common'] || 1;
            const rB = rarityScore[b.data.rarity || 'common'] || 1;
            if (rA !== rB) return rB - rA; // 高品质在前

            // if (a.isOwned !== b.isOwned) return b.isOwned - a.isOwned; // 已拥有在前 (可选，暂不启用，保持图鉴顺序统一)

            return a.id.localeCompare(b.id);
        });

        // 2. 渲染网格
        allTreasures.forEach(item => {
            const t = item.data;
            const isOwned = item.isOwned;
            const rarity = t.rarity || 'common';
            // const rarityLabel = this.getRarityLabel(rarity); // Not needed for grid

            const el = document.createElement('div');
            el.className = `compendium-item rarity-${rarity} ${isOwned ? 'unlocked' : 'locked'}`;

            // 构建内容 - 即使未解锁也显示真实图标和名字，但会有样式灰化
            const icon = t.icon || '📦';
            const name = t.name;

            el.innerHTML = `
                <div class="compendium-item-inner">
                    <div class="compendium-icon ${isOwned ? '' : 'locked'}">${icon}</div>
                    <div class="compendium-name ${isOwned ? '' : 'locked'}">${name}</div>
                </div>
            `;

            el.onclick = () => {
                this.showTreasureDetail(t, isOwned);
            };

            grid.appendChild(el);
        });

        // 3. 更新进度头
        if (statsEl) {
            statsEl.innerHTML = `
                <span class="stat-icon">🎒</span>
                <span class="stat-text">法宝收藏进度: <span style="color:var(--accent-gold); font-weight:bold;">${ownedCount}</span> / ${allTreasures.length}</span>
            `;
        }
    }

    // 显示法宝详情 (新版)
    showTreasureDetail(treasure, isUnlocked) {
        const modal = document.getElementById('treasure-detail-modal');
        if (!modal) return;

        // Elements
        const elIcon = document.getElementById('detail-icon');
        const elName = document.getElementById('detail-name');
        const elRarity = document.getElementById('detail-rarity');
        const elDesc = document.getElementById('detail-desc');
        const elLore = document.getElementById('detail-lore');
        const elSource = document.getElementById('detail-source');
        const header = modal.querySelector('.detail-header');

        if (!elIcon || !elName) return;

        // Reset classes
        header.className = 'detail-header';

        // Common logic for filling content (Locked items now show full details too)
        const rarity = treasure.rarity || 'common';
        const rarityLabel = this.getRarityLabel(rarity);

        header.classList.add(`rarity-${rarity}`);
        elIcon.textContent = treasure.icon || '📦';
        elName.textContent = treasure.name;
        elRarity.innerHTML = rarityLabel;

        // Description
        let desc = treasure.description;
        try {
            if (treasure.getDesc) desc = treasure.getDesc(this.player);
        } catch (e) {
            console.warn('Desc gen failed', e);
        }
        // Highlight keywords support
        desc = desc.replace(/([\d.]+|[+\-]\d+%?)/g, '<span style="color:#ffb74d;">$1</span>');
        elDesc.innerHTML = desc;

        // Lore
        elLore.textContent = treasure.lore || "（此物似乎蕴含着某种未知的力量...）";
        elLore.style.visibility = 'visible';

        // Source
        const source = this.getTreasureSource(treasure);
        elSource.innerHTML = source;

        // Visual adjustments for Locked state in modal
        if (!isUnlocked) {
            elIcon.style.filter = 'grayscale(1) brightness(0.7)';
            elName.style.color = '#888'; // Grey out name
            elRarity.innerHTML += ' <span style="font-size:0.8em; color:#666">(未获取)</span>';
            // We still show description and source as requested
        } else {
            elIcon.style.filter = '';
            elName.style.color = ''; // Reset to CSS default (gold/rarity color)
        }

        // Show Modal
        modal.classList.add('active');

        // Play sound
        if (typeof audioManager !== 'undefined') {
            audioManager.playSFX('click');
        }
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
