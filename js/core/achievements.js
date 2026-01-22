/**
 * The Defier 2.0 - 成就系统
 */

class AchievementSystem {
    constructor(game) {
        this.game = game;
        this.unlockedAchievements = this.loadUnlocked();
        this.stats = this.loadStats();
        this.pendingPopups = [];
        this.isShowingPopup = false;
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
        } catch (e) {
            console.error('保存成就失败:', e);
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
        } catch (e) {
            console.error('保存统计失败:', e);
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
            case 'realmCleared':
            case 'eventsCompleted':
            case 'totalGold':
            case 'maxCombo':
            case 'singleDamage':
            case 'noDamageBattle':
            case 'lowHpBossKill':
                return (this.stats[condition.type] || 0) >= condition.value;

            case 'uniqueCards':
            case 'nodeTypesVisited':
                return (this.stats[condition.type]?.length || 0) >= condition.value;

            case 'specificLaw':
                const player = this.game.player;
                return player.collectedLaws.some(l => l.id === condition.lawId);

            case 'deckSize':
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

    // 解锁成就
    unlockAchievement(achievementId) {
        const achievement = ACHIEVEMENTS[achievementId];
        if (!achievement) return;

        this.unlockedAchievements.push(achievementId);
        this.saveUnlocked();

        // 应用奖励
        this.applyReward(achievement.reward);

        // 显示弹窗
        this.queuePopup(achievement);
    }

    // 应用奖励
    applyReward(reward) {
        const player = this.game.player;

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
                unlocks.push(reward.unlockId);
                this.saveUnlocks(unlocks);
                break;

            case 'cardBack':
                const cardBacks = this.loadCardBacks();
                cardBacks.push(reward.backId);
                this.saveCardBacks(cardBacks);
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
    queuePopup(achievement) {
        this.pendingPopups.push(achievement);
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
        const achievement = this.pendingPopups.shift();

        this.showAchievementPopup(achievement);
    }

    // 显示成就弹窗
    showAchievementPopup(achievement) {
        const popup = document.createElement('div');
        popup.className = 'achievement-popup';
        popup.innerHTML = `
            <div class="achievement-icon">${achievement.icon}</div>
            <div class="achievement-info">
                <div class="achievement-label">成就解锁</div>
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

            // 隐藏成就只有解锁后才显示详情
            if (achievement.hidden && !unlocked) {
                list.push({
                    ...achievement,
                    name: '???',
                    description: '隐藏成就',
                    unlocked
                });
            } else {
                list.push({
                    ...achievement,
                    unlocked
                });
            }
        }

        return list;
    }

    // 获取进度
    getProgress() {
        const total = getTotalAchievementsCount();
        const completed = this.unlockedAchievements.filter(id =>
            ACHIEVEMENTS[id] && !ACHIEVEMENTS[id].hidden
        ).length;

        return { completed, total };
    }
}
