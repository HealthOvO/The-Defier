/**
 * The Defier 2.0 - 成就系统
 */

class AchievementSystem {
    constructor(game) {
        this.game = game;
        this.unlockedAchievements = this.loadUnlocked();
        this.claimedAchievements = this.loadClaimed(); // New: Track claimed status
        this.stats = this.loadStats();
        this.pendingPopups = [];
        this.isShowingPopup = false;

        // Legacy Migration: If unlocked but no claimed record (and not empty), assume all unlocked are claimed
        // This prevents re-claiming old rewards
        if (this.unlockedAchievements.length > 0 && this.claimedAchievements.length === 0) {
            // Simple heuristic: if we have unlocked achievements but NO claimed record, 
            // it's likely a legacy save. Mark all as claimed.
            // However, for a fresh start (0 unlocked), both are 0, which is fine.
            // Only issue is if a user unlocked 1 thing but genuinely didn't claim (new system), 
            // but since new system introduces claimed array, its absence implies legacy.
            // Wait, if it's a new game, both are empty.
            // If it's a legacy save, unlocked is populated, claimed is empty (or null/undefined before loadClaimed fix).

            // Check if this is actually a legacy load by checking if storage key existed? 
            // loadClaimed returns [] if key missing.
            // Let's rely on a specific flag or just do it once.
            // For safety: If unlocked > 0 and claimed == 0, copy all.
            // EXCEPT if the feature works by "If saved == null". loadClaimed returns [] for null.
            // Let's assume for now backward compatibility: If unlocked > 0 and claimed == 0, copy.
            // But what if user just unlocked their first item in new system?
            // To distinguish, we could check a version flag, but we don't have one easily.
            // Better approach: Since we are deploying this NOW, existing saves have unlocked > 0 and claimed = [].
            // We should mark them as claimed.
            // New players start with unlocked = [], claimed = [].
            // So, (unlocked > 0 && claimed == 0) -> legacy migration.
            // Edge case: User unlocks achievement, doesn't claim, reloads page. 
            // Only then claimed would be 0. But localStorage persists. 
            // So if we save claimed array properly, this only happens once.

            if (isLegacy) {
                this.claimedAchievements = [...this.unlockedAchievements];
                this.saveClaimed();
                console.log('Legacy achievements migrated to claimed status.');
            }
        }

        // Initial Cloud Sync
        // Delay slightly to ensure Auth is ready if loaded async
        setTimeout(() => {
            this.syncFromCloud();
        }, 2000);
    }

    // 加载已解锁成就
    loadUnlocked() {
        try {
            const saved = localStorage.getItem('theDefierAchievements');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    }

    // 保存已解锁成就
    saveUnlocked() {
        try {
            localStorage.setItem('theDefierAchievements', JSON.stringify(this.unlockedAchievements));
            this.triggerCloudSave();
        } catch (e) {
            console.error('保存成就失败:', e);
        }
    }

    // New: Load Claimed
    loadClaimed() {
        try {
            const saved = localStorage.getItem('theDefierClaimedAchievements');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    }

    // New: Save Claimed
    saveClaimed() {
        try {
            localStorage.setItem('theDefierClaimedAchievements', JSON.stringify(this.claimedAchievements));
            this.triggerCloudSave();
        } catch (e) {
            console.error('保存已领取记录失败:', e);
        }
    }

    // 加载统计数据
    loadStats() {
        try {
            const saved = localStorage.getItem('theDefierStats');
            return saved ? JSON.parse(saved) : this.getDefaultStats();
        } catch (e) {
            return this.getDefaultStats();
        }
    }

    // 保存统计数据
    saveStats() {
        try {
            localStorage.setItem('theDefierStats', JSON.stringify(this.stats));
            this.triggerCloudSave();
        } catch (e) {
            console.error('保存统计失败:', e);
        }
    }

    // Cloud Sync Integration
    triggerCloudSave() {
        // Debounce cloud save (avoid spamming API on every kill)
        if (this.saveTimeout) clearTimeout(this.saveTimeout);

        this.saveTimeout = setTimeout(() => {
            this.syncToCloud();
        }, 5000); // 5 seconds delay
    }

    async syncToCloud() {
        if (typeof AuthService === 'undefined' || !AuthService.isLoggedIn()) return;

        console.log('Syncing achievements to cloud...');
        const data = {
            unlocked: this.unlockedAchievements,
            claimed: this.claimedAchievements,
            stats: this.stats,
            conf: {
                startBonuses: this.loadStartBonuses(),
                unlocks: this.loadUnlocks(),
                cardBacks: this.loadCardBacks()
            },
            lastUpdated: Date.now()
        };

        await AuthService.saveGlobalData(data);
    }

    async syncFromCloud() {
        if (typeof AuthService === 'undefined' || !AuthService.isLoggedIn()) return;

        console.log('Fetching achievements from cloud...');
        const result = await AuthService.getGlobalData();

        if (result.success && result.data) {
            const cloud = result.data;

            // Merge Strategy: Union of unlocked/claimed, Max of stats (or overwrite if cloud is newer?)
            // Achievements are cumulative, so Union is best.

            let changed = false;

            // 1. Merge Unlocked
            if (Array.isArray(cloud.unlocked)) {
                cloud.unlocked.forEach(id => {
                    if (!this.unlockedAchievements.includes(id)) {
                        this.unlockedAchievements.push(id);
                        changed = true;
                    }
                });
            }

            // 2. Merge Claimed
            if (Array.isArray(cloud.claimed)) {
                cloud.claimed.forEach(id => {
                    if (!this.claimedAchievements.includes(id)) {
                        this.claimedAchievements.push(id);
                        changed = true;
                    }
                });
            }

            // 3. Sync Stats (Max value logic)
            if (cloud.stats) {
                // For cumulative stats like kills, we ideally want to sync. 
                // But blindly taking max might miss local progress if offline. 
                // Simple approach: Take cloud if cloud > local (assuming playing on multiple devices)
                // Actually, if we play offline, local > cloud. 
                // Let's just Max() numeric values.
                for (const key in cloud.stats) {
                    if (typeof cloud.stats[key] === 'number') {
                        if ((cloud.stats[key] || 0) > (this.stats[key] || 0)) {
                            this.stats[key] = cloud.stats[key];
                            changed = true;
                        }
                    }
                    // Arrays (unique cards etc)
                    else if (Array.isArray(cloud.stats[key])) {
                        if (!this.stats[key]) this.stats[key] = [];
                        cloud.stats[key].forEach(item => {
                            if (!this.stats[key].includes(item)) {
                                this.stats[key].push(item);
                                changed = true;
                            }
                        });
                    }
                }
            }

            // 4. Configs
            if (cloud.conf) {
                // Merge Start Bonuses
                if (cloud.conf.startBonuses) {
                    const localBonuses = this.loadStartBonuses();
                    let bonusChanged = false;
                    for (const k in cloud.conf.startBonuses) {
                        if ((cloud.conf.startBonuses[k] || 0) > (localBonuses[k] || 0)) {
                            localBonuses[k] = cloud.conf.startBonuses[k];
                            bonusChanged = true;
                        }
                    }
                    if (bonusChanged) this.saveStartBonuses(localBonuses);
                }

                // Merge Unlocks
                if (cloud.conf.unlocks) {
                    const localUnlocks = this.loadUnlocks();
                    let unlockChanged = false;
                    cloud.conf.unlocks.forEach(u => {
                        if (!localUnlocks.includes(u)) {
                            localUnlocks.push(u);
                            unlockChanged = true;
                        }
                    });
                    if (unlockChanged) this.saveUnlocks(localUnlocks);
                }
            }

            if (changed) {
                this.saveUnlocked();
                this.saveClaimed();
                this.saveStats();
                console.log('Achievements synced from cloud successfully.');

                // Refresh UI if exists
                // const ui = document.querySelector('achievement-panel');
            }
        }
    }

    // 默认统计数据
    getDefaultStats() {
        return {
            enemiesDefeated: 0,
            bossesDefeated: 0,
            lawsCollected: 0,
            loadedLaws: 0,
            realmCleared: 0,
            eventsCompleted: 0,
            totalGold: 0,
            uniqueCards: [],
            maxCombo: 0,
            singleDamage: 0,
            noDamageBattle: 0,
            nodeTypesVisited: [],
            firstStealSuccess: false,
            lowHpBossKill: 0,
            speedClear: Infinity,
            minDeckClear: Infinity
        };
    }

    // 更新统计数据
    updateStat(statName, value, mode = 'add') {
        switch (mode) {
            case 'add':
                if (Array.isArray(this.stats[statName])) {
                    if (!this.stats[statName].includes(value)) {
                        this.stats[statName].push(value);
                    }
                } else {
                    this.stats[statName] = (this.stats[statName] || 0) + value;
                }
                break;
            case 'set':
                this.stats[statName] = value;
                break;
            case 'max':
                this.stats[statName] = Math.max(this.stats[statName] || 0, value);
                break;
            case 'min':
                this.stats[statName] = Math.min(this.stats[statName] || Infinity, value);
                break;
        }

        this.saveStats();
        this.checkAllAchievements();
    }

    // 检查所有成就
    checkAllAchievements() {
        for (const id in ACHIEVEMENTS) {
            if (!this.unlockedAchievements.includes(id)) {
                if (this.checkAchievement(id)) {
                    this.unlockAchievement(id);
                }
            }
        }
    }

    // 检查单个成就
    checkAchievement(achievementId) {
        const achievement = ACHIEVEMENTS[achievementId];
        if (!achievement) return false;

        const condition = achievement.condition;

        switch (condition.type) {
            case 'enemiesDefeated':
            case 'bossesDefeated':
            case 'lawsCollected':
            case 'loadedLaws':
            case 'eventsCompleted':
            case 'totalGold':
            case 'maxCombo':
            case 'singleDamage':
            case 'noDamageBattle':
            case 'lowHpBossKill':
                return (this.stats[condition.type] || 0) >= condition.value;

            case 'realmCleared':
                return (this.stats.realmCleared || 0) >= condition.value;

            case 'uniqueCards':
            case 'nodeTypesVisited':
                return (this.stats[condition.type]?.length || 0) >= condition.value;

            case 'specificLaw':
                const player = this.game.player;
                // Safeguard against missing player (init time)
                if (!player || !player.collectedLaws) return false;
                return player.collectedLaws.some(l => l.id === condition.lawId);

            case 'deckSize':
                if (!this.game.player || !this.game.player.deck) return false;
                return this.game.player.deck.length >= condition.value;

            case 'minDeckClear':
                return this.stats.minDeckClear <= condition.value;

            case 'speedClear':
                return this.stats.speedClear <= condition.value;

            case 'firstStealSuccess':
                return this.stats.firstStealSuccess;

            default:
                return false;
        }
    }

    // 解锁成就 (Condition Met)
    unlockAchievement(achievementId) {
        const achievement = ACHIEVEMENTS[achievementId];
        if (!achievement) return;

        // If already unlocked, do nothing
        if (this.unlockedAchievements.includes(achievementId)) return;

        this.unlockedAchievements.push(achievementId);
        this.saveUnlocked();

        // Modified: DO NOT apply reward automatically.
        // Just notify user.
        this.queuePopup(achievement, 'unlocked');
    }

    // New: Claim Reward
    claimReward(achievementId) {
        if (!this.unlockedAchievements.includes(achievementId)) {
            return { success: false, reason: 'locked' };
        }
        if (this.claimedAchievements.includes(achievementId)) {
            return { success: false, reason: 'already_claimed' };
        }

        const achievement = ACHIEVEMENTS[achievementId];

        // Mark as claimed
        this.claimedAchievements.push(achievementId);
        this.saveClaimed();

        // Apply Reward
        this.applyReward(achievement.reward);

        // Notify
        // Maybe a different visual for "Claimed"?
        // For now standard popup or returns success for UI to animate.
        return { success: true, reward: achievement.reward };
    }

    // 应用奖励
    applyReward(reward) {
        const player = this.game.player;
        if (!player) return;

        switch (reward.type) {
            case 'gold':
                player.gold += reward.value;
                break;

            case 'card':
                let card;
                if (reward.cardId) {
                    card = CARDS[reward.cardId];
                } else if (reward.rarity) {
                    card = getRandomCard(reward.rarity);
                }
                if (card) {
                    player.addCardToDeck(card);
                }
                break;

            case 'ringExp':
                player.fateRing.exp += reward.value;
                player.checkFateRingLevelUp();
                break;

            case 'startBonus':
                // 保存永久加成
                const bonuses = this.loadStartBonuses();
                bonuses[reward.stat] = (bonuses[reward.stat] || 0) + reward.value;
                this.saveStartBonuses(bonuses);
                break;

            case 'unlock':
                // 解锁特殊内容
                const unlocks = this.loadUnlocks();
                if (!unlocks.includes(reward.unlockId)) {
                    unlocks.push(reward.unlockId);
                    this.saveUnlocks(unlocks);
                }
                break;

            case 'cardBack':
                const cardBacks = this.loadCardBacks();
                if (!cardBacks.includes(reward.backId)) {
                    cardBacks.push(reward.backId);
                    this.saveCardBacks(cardBacks);
                }
                break;
        }
    }

    // 加载/保存起始加成
    loadStartBonuses() {
        try {
            const saved = localStorage.getItem('theDefierStartBonuses');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            return {};
        }
    }

    saveStartBonuses(bonuses) {
        localStorage.setItem('theDefierStartBonuses', JSON.stringify(bonuses));
    }

    // 加载/保存解锁内容
    loadUnlocks() {
        try {
            const saved = localStorage.getItem('theDefierUnlocks');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    }

    saveUnlocks(unlocks) {
        localStorage.setItem('theDefierUnlocks', JSON.stringify(unlocks));
    }

    // 加载/保存卡背
    loadCardBacks() {
        try {
            const saved = localStorage.getItem('theDefierCardBacks');
            return saved ? JSON.parse(saved) : ['default'];
        } catch (e) {
            return ['default'];
        }
    }

    saveCardBacks(backs) {
        localStorage.setItem('theDefierCardBacks', JSON.stringify(backs));
    }

    // 队列弹窗
    queuePopup(achievement, type = 'unlocked') {
        this.pendingPopups.push({ achievement, type });
        if (!this.isShowingPopup) {
            this.showNextPopup();
        }
    }

    // 显示下一个弹窗
    showNextPopup() {
        if (this.pendingPopups.length === 0) {
            this.isShowingPopup = false;
            return;
        }

        this.isShowingPopup = true;
        const data = this.pendingPopups.shift();

        this.showAchievementPopup(data.achievement, data.type);
    }

    // 显示成就弹窗
    showAchievementPopup(achievement, type) {
        const popup = document.createElement('div');
        popup.className = 'achievement-popup';

        let label = '成就解锁';
        if (type === 'claimed') label = '奖励已领取';

        popup.innerHTML = `
            <div class="achievement-icon">${achievement.icon}</div>
            <div class="achievement-info">
                <div class="achievement-label">${label}</div>
                <div class="achievement-name">${achievement.name}</div>
            </div>
        `;

        document.body.appendChild(popup);

        // 触发动画
        requestAnimationFrame(() => {
            popup.classList.add('show');
        });

        // 自动隐藏
        setTimeout(() => {
            popup.classList.remove('show');
            setTimeout(() => {
                popup.remove();
                this.showNextPopup();
            }, 500);
        }, 3000);
    }

    // 获取成就列表（用于显示）
    getAchievementsList() {
        const list = [];

        for (const id in ACHIEVEMENTS) {
            const achievement = ACHIEVEMENTS[id];
            const unlocked = this.unlockedAchievements.includes(id);
            const claimed = this.claimedAchievements.includes(id);

            // 隐藏成就只有解锁后才显示详情
            if (achievement.hidden && !unlocked) {
                list.push({
                    ...achievement,
                    name: '???',
                    description: '隐藏成就',
                    unlocked,
                    claimed
                });
            } else {
                list.push({
                    ...achievement,
                    unlocked,
                    claimed
                });
            }
        }

        return list;
    }

    // 获取进度 (Based on UNLOCKED)
    getProgress() {
        const total = getTotalAchievementsCount();
        const completed = this.unlockedAchievements.filter(id =>
            ACHIEVEMENTS[id] && !ACHIEVEMENTS[id].hidden
        ).length;

        return { completed, total };
    }
}
