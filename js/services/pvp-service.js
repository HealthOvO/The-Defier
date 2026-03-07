/**
 * The Defier - PVP Service
 * 处理所有PVP相关的后端交互 (Bmob)
 */

window.PVPService = {
    // 缓存数据
    currentRankData: null,
    ruleVersion: 'pvp-v2',
    activeMatch: null,
    activeMatchStorageKey: 'theDefierPvpActiveMatchV1',
    localRankStorageKey: 'theDefierPvpLocalRankV1',
    localSnapshotStorageKey: 'theDefierPvpLocalSnapshotV1',
    localEconomyStoragePrefix: 'theDefierPvpEconomyV1',
    practiceSeedStorageKey: 'theDefierPvpPracticeSeedV1',
    seasonConfig: {
        id: 's1-genesis',
        name: '开天赛季',
        startedAt: '2026-03-01',
        divisionRewardMultipliers: {
            '潜龙榜': 1.0,
            '问道榜': 1.06,
            '凌霄榜': 1.12,
            '天穹榜': 1.2
        }
    },

    getActiveMatchStorage() {
        if (typeof sessionStorage !== 'undefined') return sessionStorage;
        if (typeof localStorage !== 'undefined') return localStorage;
        return null;
    },

    getPersistentStorage() {
        if (typeof localStorage !== 'undefined') return localStorage;
        if (typeof sessionStorage !== 'undefined') return sessionStorage;
        return null;
    },

    isOnlinePvpAvailable() {
        return !!(
            typeof Bmob !== 'undefined' &&
            typeof AuthService !== 'undefined' &&
            AuthService &&
            typeof AuthService.isLoggedIn === 'function' &&
            AuthService.isLoggedIn()
        );
    },

    getCurrentUserSafe() {
        if (typeof Bmob === 'undefined' || !Bmob.User || typeof Bmob.User.current !== 'function') return null;
        return Bmob.User.current();
    },

    getDivisionByScore(score) {
        const s = Math.max(0, Number(score) || 0);
        if (s >= 1900) return '天穹榜';
        if (s >= 1600) return '凌霄榜';
        if (s >= 1300) return '问道榜';
        return '潜龙榜';
    },

    getDivisionRewardMultiplier(scoreOrDivision = null) {
        const cfg = this.seasonConfig && this.seasonConfig.divisionRewardMultipliers
            ? this.seasonConfig.divisionRewardMultipliers
            : {};
        let division = null;
        if (typeof scoreOrDivision === 'string' && scoreOrDivision) {
            division = scoreOrDivision;
        } else if (typeof scoreOrDivision === 'number') {
            division = this.getDivisionByScore(scoreOrDivision);
        } else if (this.currentRankData && (this.currentRankData.division || typeof this.currentRankData.score === 'number')) {
            division = this.currentRankData.division || this.getDivisionByScore(this.currentRankData.score);
        } else {
            division = this.getDivisionByScore(1000);
        }
        return Number(cfg[division]) || 1;
    },

    getCurrentSeasonMeta() {
        const cfg = this.seasonConfig || {};
        const score = this.currentRankData && typeof this.currentRankData.score === 'number'
            ? this.currentRankData.score
            : 1000;
        const division = this.currentRankData && this.currentRankData.division
            ? this.currentRankData.division
            : this.getDivisionByScore(score);
        return {
            id: cfg.id || 'season-unknown',
            name: cfg.name || '常驻赛季',
            startedAt: cfg.startedAt || null,
            division,
            rewardMultiplier: this.getDivisionRewardMultiplier(division)
        };
    },

    getLocalUserProfile() {
        const user = this.getCurrentUserSafe();
        if (user && user.objectId) {
            return {
                objectId: user.objectId,
                username: user.username || '本机道友'
            };
        }
        return {
            objectId: 'local-guest',
            username: '游客道友'
        };
    },

    getDefaultLocalRank() {
        const user = this.getLocalUserProfile();
        return {
            objectId: `local-rank-${user.objectId}`,
            user,
            score: 1000,
            realm: 1,
            division: this.getDivisionByScore(1000),
            wins: 0,
            losses: 0,
            isLocal: true
        };
    },

    normalizeLocalRank(raw) {
        const defaults = this.getDefaultLocalRank();
        const src = raw && typeof raw === 'object' ? raw : {};
        const normalized = {
            ...defaults,
            ...src,
            score: Math.max(0, Math.floor(Number(src.score) || defaults.score)),
            realm: Math.max(1, Math.floor(Number(src.realm) || defaults.realm)),
            wins: Math.max(0, Math.floor(Number(src.wins) || 0)),
            losses: Math.max(0, Math.floor(Number(src.losses) || 0)),
            isLocal: true
        };
        normalized.division = this.getDivisionByScore(normalized.score);
        if (!normalized.user || typeof normalized.user !== 'object') {
            normalized.user = defaults.user;
        } else {
            normalized.user = {
                objectId: normalized.user.objectId || defaults.user.objectId,
                username: normalized.user.username || defaults.user.username
            };
        }
        if (!normalized.objectId) {
            normalized.objectId = defaults.objectId;
        }
        return normalized;
    },

    loadLocalRank() {
        const storage = this.getPersistentStorage();
        if (!storage) return this.getDefaultLocalRank();
        try {
            const raw = storage.getItem(this.localRankStorageKey);
            if (!raw) return this.getDefaultLocalRank();
            return this.normalizeLocalRank(JSON.parse(raw));
        } catch (error) {
            console.warn('Load local PVP rank failed:', error);
            return this.getDefaultLocalRank();
        }
    },

    saveLocalRank(rank) {
        const storage = this.getPersistentStorage();
        if (!storage) return;
        try {
            const normalized = this.normalizeLocalRank(rank);
            storage.setItem(this.localRankStorageKey, JSON.stringify(normalized));
        } catch (error) {
            console.warn('Save local PVP rank failed:', error);
        }
    },

    loadLocalSnapshot() {
        const storage = this.getPersistentStorage();
        if (!storage) return null;
        try {
            const raw = storage.getItem(this.localSnapshotStorageKey);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            const normalizedData = this.normalizeBattleData(
                typeof parsed.data === 'string' ? JSON.parse(parsed.data) : parsed.data
            );
            return {
                ...parsed,
                data: JSON.stringify(normalizedData),
                config: parsed.config || {}
            };
        } catch (error) {
            console.warn('Load local PVP snapshot failed:', error);
            return null;
        }
    },

    saveLocalSnapshot(snapshot) {
        const storage = this.getPersistentStorage();
        if (!storage) return;
        try {
            storage.setItem(this.localSnapshotStorageKey, JSON.stringify(snapshot));
        } catch (error) {
            console.warn('Save local PVP snapshot failed:', error);
        }
    },

    getEconomyStorageKey() {
        const profile = this.getLocalUserProfile();
        return `${this.localEconomyStoragePrefix}:${profile.objectId || 'guest'}`;
    },

    getDefaultEconomyState() {
        const profile = this.getLocalUserProfile();
        return {
            version: 1,
            userId: profile.objectId,
            coins: 1200,
            totalEarned: 1200,
            totalSpent: 0,
            wins: 0,
            losses: 0,
            totalMatches: 0,
            winStreak: 0,
            lossStreak: 0,
            bestWinStreak: 0,
            purchases: {},
            ownedItems: {},
            equippedSkinId: null,
            equippedTitleId: null,
            transactionLog: [],
            lastRewardAt: 0,
            lastPurchaseAt: 0
        };
    },

    normalizeEconomyState(raw) {
        const defaults = this.getDefaultEconomyState();
        const src = raw && typeof raw === 'object' ? raw : {};
        const purchases = {};
        if (src.purchases && typeof src.purchases === 'object') {
            Object.keys(src.purchases).forEach((key) => {
                const val = Math.max(0, Math.floor(Number(src.purchases[key]) || 0));
                if (val > 0) purchases[key] = val;
            });
        }
        const ownedItems = {};
        if (src.ownedItems && typeof src.ownedItems === 'object') {
            Object.keys(src.ownedItems).forEach((key) => {
                if (src.ownedItems[key]) ownedItems[key] = true;
            });
        }
        const transactionLog = Array.isArray(src.transactionLog)
            ? src.transactionLog
                .filter((it) => it && typeof it === 'object')
                .slice(-40)
                .map((it) => ({
                    type: it.type || 'misc',
                    itemId: it.itemId || null,
                    itemName: it.itemName || null,
                    coins: Math.floor(Number(it.coins) || 0),
                    detail: it.detail || '',
                    at: Math.max(0, Math.floor(Number(it.at) || Date.now()))
                }))
            : [];
        const equippedSkinId = (typeof src.equippedSkinId === 'string' && src.equippedSkinId && ownedItems[src.equippedSkinId])
            ? src.equippedSkinId
            : null;
        const equippedTitleId = (typeof src.equippedTitleId === 'string' && src.equippedTitleId && ownedItems[src.equippedTitleId])
            ? src.equippedTitleId
            : null;
        return {
            version: 1,
            userId: defaults.userId,
            coins: Math.max(0, Math.floor(Number(src.coins) || defaults.coins)),
            totalEarned: Math.max(0, Math.floor(Number(src.totalEarned) || defaults.totalEarned)),
            totalSpent: Math.max(0, Math.floor(Number(src.totalSpent) || 0)),
            wins: Math.max(0, Math.floor(Number(src.wins) || 0)),
            losses: Math.max(0, Math.floor(Number(src.losses) || 0)),
            totalMatches: Math.max(0, Math.floor(Number(src.totalMatches) || 0)),
            winStreak: Math.max(0, Math.floor(Number(src.winStreak) || 0)),
            lossStreak: Math.max(0, Math.floor(Number(src.lossStreak) || 0)),
            bestWinStreak: Math.max(0, Math.floor(Number(src.bestWinStreak) || 0)),
            purchases,
            ownedItems,
            equippedSkinId,
            equippedTitleId,
            transactionLog,
            lastRewardAt: Math.max(0, Math.floor(Number(src.lastRewardAt) || 0)),
            lastPurchaseAt: Math.max(0, Math.floor(Number(src.lastPurchaseAt) || 0))
        };
    },

    loadEconomyState() {
        const storage = this.getPersistentStorage();
        if (!storage) return this.getDefaultEconomyState();
        try {
            const raw = storage.getItem(this.getEconomyStorageKey());
            if (!raw) return this.getDefaultEconomyState();
            return this.normalizeEconomyState(JSON.parse(raw));
        } catch (error) {
            console.warn('Load local PVP economy failed:', error);
            return this.getDefaultEconomyState();
        }
    },

    saveEconomyState(state) {
        const storage = this.getPersistentStorage();
        if (!storage) return;
        try {
            const normalized = this.normalizeEconomyState(state);
            storage.setItem(this.getEconomyStorageKey(), JSON.stringify(normalized));
        } catch (error) {
            console.warn('Save local PVP economy failed:', error);
        }
    },

    getEconomySnapshot() {
        return this.loadEconomyState();
    },

    setEconomySnapshot(snapshot) {
        const normalized = this.normalizeEconomyState(snapshot);
        this.saveEconomyState(normalized);
        return normalized;
    },

    getWalletSummary(state = null) {
        const economy = state ? this.normalizeEconomyState(state) : this.loadEconomyState();
        return {
            coins: economy.coins,
            totalEarned: economy.totalEarned,
            totalSpent: economy.totalSpent,
            wins: economy.wins,
            losses: economy.losses,
            totalMatches: economy.totalMatches,
            winStreak: economy.winStreak,
            lossStreak: economy.lossStreak,
            bestWinStreak: economy.bestWinStreak
        };
    },

    getRecentTransactions(limit = 8, state = null) {
        const economy = state ? this.normalizeEconomyState(state) : this.loadEconomyState();
        const cap = Math.max(1, Math.min(20, Math.floor(Number(limit) || 8)));
        return (economy.transactionLog || []).slice(-cap).reverse();
    },

    appendEconomyLog(economyState, entry) {
        const state = this.normalizeEconomyState(economyState);
        const logs = Array.isArray(state.transactionLog) ? state.transactionLog.slice(-39) : [];
        logs.push({
            type: entry && entry.type ? entry.type : 'misc',
            itemId: entry && entry.itemId ? entry.itemId : null,
            itemName: entry && entry.itemName ? entry.itemName : null,
            coins: Math.floor(Number(entry && entry.coins) || 0),
            detail: entry && entry.detail ? entry.detail : '',
            at: Math.max(0, Math.floor(Number(entry && entry.at) || Date.now()))
        });
        return {
            ...state,
            transactionLog: logs
        };
    },

    getShopCatalog() {
        const source = (typeof PVP_SHOP_ITEMS !== 'undefined' && PVP_SHOP_ITEMS)
            ? PVP_SHOP_ITEMS
            : { cards: [], items: [], cosmetics: [] };
        const groups = [
            { key: 'cards', type: 'cards' },
            { key: 'items', type: 'items' },
            { key: 'cosmetics', type: 'cosmetics' }
        ];
        const catalog = [];
        groups.forEach((group) => {
            const list = Array.isArray(source[group.key]) ? source[group.key] : [];
            list.forEach((item) => {
                if (!item || !item.id) return;
                catalog.push({ ...item, _category: group.type });
            });
        });
        return catalog;
    },

    getShopItemById(itemId) {
        if (!itemId) return null;
        const catalog = this.getShopCatalog();
        return catalog.find((item) => item.id === itemId) || null;
    },

    getPurchaseCount(itemId, state = null) {
        const economy = state ? this.normalizeEconomyState(state) : this.loadEconomyState();
        return Math.max(0, Math.floor(Number(economy.purchases[itemId]) || 0));
    },

    isItemOwned(itemId, state = null) {
        const economy = state ? this.normalizeEconomyState(state) : this.loadEconomyState();
        return !!economy.ownedItems[itemId];
    },

    getRemainingStock(itemId, state = null, itemOverride = null) {
        const item = itemOverride || this.getShopItemById(itemId);
        if (!item) return 0;
        const stock = Math.floor(Number(item.stock) || 0);
        if (stock <= 0) return null;
        const purchased = this.getPurchaseCount(item.id, state);
        return Math.max(0, stock - purchased);
    },

    getShopItemState(itemId, state = null, itemOverride = null) {
        const item = itemOverride || this.getShopItemById(itemId);
        if (!item) {
            return {
                exists: false,
                buyable: false,
                owned: false,
                equipped: false,
                equippable: false,
                soldOut: false,
                insufficient: false,
                reason: 'missing',
                price: 0,
                remainingStock: 0
            };
        }
        const economy = state ? this.normalizeEconomyState(state) : this.loadEconomyState();
        const price = Math.max(0, Math.floor(Number(item.price) || 0));
        const owned = !!economy.ownedItems[item.id];
        const isCosmetic = item.type === 'skin' || item.type === 'title';
        const equipped = !!(
            (item.type === 'skin' && economy.equippedSkinId === item.id)
            || (item.type === 'title' && economy.equippedTitleId === item.id)
        );
        const equippable = !!(isCosmetic && owned && !equipped);
        const remainingStock = this.getRemainingStock(item.id, economy, item);
        const soldOut = remainingStock !== null && remainingStock <= 0;
        const isConsumable = item.type === 'consumable';
        const insufficient = economy.coins < price;
        const blockedByOwnership = !isConsumable && owned && !equippable && !equipped;
        const buyable = !soldOut && !blockedByOwnership && !insufficient && !equippable && !equipped;
        let reason = 'ok';
        if (equipped) reason = 'equipped';
        else if (equippable) reason = 'equippable';
        else if (blockedByOwnership) reason = 'owned';
        else if (soldOut) reason = 'sold_out';
        else if (insufficient) reason = 'insufficient';
        return {
            exists: true,
            buyable,
            owned,
            equipped,
            equippable,
            soldOut,
            insufficient,
            reason,
            price,
            remainingStock
        };
    },

    calculateRewardBreakdown(options = {}, state = null) {
        const isWin = !!options.isWin;
        const isRanked = options.isRanked !== false;
        const opponentRating = Math.max(0, Number(options.opponentRating) || 1000);
        const economy = state ? this.normalizeEconomyState(state) : this.loadEconomyState();
        const myRating = Math.max(
            0,
            Number(
                options.myRating
                || options.myScore
                || (this.currentRankData && this.currentRankData.score)
                || 1000
            ) || 1000
        );
        const myDivision = options.myDivision || this.getDivisionByScore(myRating);
        const divisionMultiplier = this.getDivisionRewardMultiplier(myDivision);

        const baseReward = isWin ? 65 : 30;
        const rankedBonus = isRanked ? 15 : 5;
        const ratingBonusRaw = Math.floor((opponentRating - 1000) / 80);
        const ratingBonus = Math.max(0, Math.min(20, ratingBonusRaw));
        const streakBase = isWin ? (economy.winStreak || 0) : (economy.lossStreak || 0);
        const streakMultiplier = isWin
            ? Math.min(1.25, 1 + streakBase * 0.03)
            : Math.min(1.12, 1 + streakBase * 0.02);
        const preMultiplier = baseReward + rankedBonus + (isWin ? ratingBonus : Math.floor(ratingBonus / 2));
        const totalReward = Math.max(8, Math.floor(preMultiplier * streakMultiplier * divisionMultiplier));
        return {
            totalReward,
            breakdown: {
                baseReward,
                rankedBonus,
                ratingBonus,
                streakBase,
                streakMultiplier,
                myDivision,
                divisionMultiplier,
                totalMultiplier: Number((streakMultiplier * divisionMultiplier).toFixed(3))
            }
        };
    },

    getRewardPreview(isWin = true, opponentRating = 1000) {
        const reward = this.calculateRewardBreakdown({ isWin, opponentRating, isRanked: true });
        return {
            ...reward,
            season: this.getCurrentSeasonMeta()
        };
    },

    grantMatchReward(options = {}) {
        const isWin = !!options.isWin;
        const economy = this.loadEconomyState();
        const rewardInfo = this.calculateRewardBreakdown(options, economy);
        const totalReward = rewardInfo.totalReward;
        const nextWinStreak = isWin ? (economy.winStreak || 0) + 1 : 0;
        const nextLossStreak = isWin ? 0 : (economy.lossStreak || 0) + 1;

        let next = this.normalizeEconomyState({
            ...economy,
            coins: economy.coins + totalReward,
            totalEarned: economy.totalEarned + totalReward,
            totalMatches: economy.totalMatches + 1,
            wins: economy.wins + (isWin ? 1 : 0),
            losses: economy.losses + (isWin ? 0 : 1),
            winStreak: nextWinStreak,
            lossStreak: nextLossStreak,
            bestWinStreak: Math.max(economy.bestWinStreak || 0, nextWinStreak),
            lastRewardAt: Date.now()
        });
        next = this.appendEconomyLog(next, {
            type: 'match_reward',
            coins: totalReward,
            detail: isWin ? '论道胜利结算' : '论道失利结算'
        });
        this.saveEconomyState(next);

        return {
            coinsAwarded: totalReward,
            wallet: this.getWalletSummary(next),
            rewardBreakdown: rewardInfo.breakdown
        };
    },

    getEquippedCosmetics(state = null) {
        const economy = state ? this.normalizeEconomyState(state) : this.loadEconomyState();
        const skinItem = economy.equippedSkinId ? this.getShopItemById(economy.equippedSkinId) : null;
        const titleItem = economy.equippedTitleId ? this.getShopItemById(economy.equippedTitleId) : null;
        return {
            skin: skinItem
                ? { id: skinItem.id, name: skinItem.name, skinId: skinItem.skinId || skinItem.id, icon: skinItem.icon || '👘' }
                : null,
            title: titleItem
                ? { id: titleItem.id, name: titleItem.name, titleId: titleItem.titleId || titleItem.id, icon: titleItem.icon || '👑' }
                : null
        };
    },

    equipCosmeticItem(itemId) {
        const item = this.getShopItemById(itemId);
        if (!item) return { success: false, message: '商品不存在' };
        if (!(item.type === 'skin' || item.type === 'title')) {
            return { success: false, message: '该商品无法佩戴', reason: 'not_cosmetic' };
        }
        const economy = this.loadEconomyState();
        const state = this.getShopItemState(itemId, economy, item);
        if (!state.owned && !state.equippable && !state.equipped) {
            return { success: false, message: '尚未拥有该外观', reason: 'not_owned' };
        }
        if (state.equipped) {
            return {
                success: true,
                message: `已佩戴：${item.name}`,
                equipped: this.getEquippedCosmetics(economy),
                wallet: this.getWalletSummary(economy)
            };
        }

        let next = this.normalizeEconomyState({
            ...economy,
            ...(item.type === 'skin' ? { equippedSkinId: item.id } : {}),
            ...(item.type === 'title' ? { equippedTitleId: item.id } : {})
        });
        next = this.appendEconomyLog(next, {
            type: 'equip',
            itemId: item.id,
            itemName: item.name || null,
            detail: item.type === 'skin' ? '佩戴外观' : '佩戴称号'
        });
        this.saveEconomyState(next);

        return {
            success: true,
            message: `已佩戴：${item.name}`,
            equipped: this.getEquippedCosmetics(next),
            wallet: this.getWalletSummary(next)
        };
    },

    unequipCosmeticItem(itemId) {
        const item = this.getShopItemById(itemId);
        if (!item) return { success: false, message: '商品不存在' };
        if (!(item.type === 'skin' || item.type === 'title')) {
            return { success: false, message: '该商品无法卸下', reason: 'not_cosmetic' };
        }
        const economy = this.loadEconomyState();
        const isEquipped = !!(
            (item.type === 'skin' && economy.equippedSkinId === item.id)
            || (item.type === 'title' && economy.equippedTitleId === item.id)
        );
        if (!isEquipped) {
            return { success: false, message: '该外观未佩戴', reason: 'not_equipped' };
        }

        let next = this.normalizeEconomyState({
            ...economy,
            ...(item.type === 'skin' ? { equippedSkinId: null } : {}),
            ...(item.type === 'title' ? { equippedTitleId: null } : {})
        });
        next = this.appendEconomyLog(next, {
            type: 'unequip',
            itemId: item.id,
            itemName: item.name || null,
            detail: item.type === 'skin' ? '卸下外观' : '卸下称号'
        });
        this.saveEconomyState(next);

        return {
            success: true,
            message: `已卸下：${item.name}`,
            equipped: this.getEquippedCosmetics(next),
            wallet: this.getWalletSummary(next)
        };
    },

    applyShopReward(item, gameRef = null) {
        if (!item || typeof item !== 'object') {
            return { applied: false, detail: 'invalid_item' };
        }
        const game = gameRef || (typeof window !== 'undefined' ? window.game : null);
        const player = game && game.player ? game.player : null;

        if (item.type === 'card') {
            const cardData = item.data && typeof item.data === 'object'
                ? JSON.parse(JSON.stringify(item.data))
                : null;
            if (cardData && typeof CARDS !== 'undefined' && cardData.id && !CARDS[cardData.id]) {
                CARDS[cardData.id] = JSON.parse(JSON.stringify(cardData));
            }
            if (player && typeof player.addCardToDeck === 'function' && cardData) {
                player.addCardToDeck(cardData);
                if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
                    Utils.showBattleLog(`已将【${item.name || cardData.name || '秘籍'}】加入牌组`);
                }
                if (typeof game.autoSave === 'function') game.autoSave();
                return { applied: true, detail: 'card_added' };
            }
            return { applied: false, detail: 'card_unlock_only' };
        }

        if (item.type === 'consumable' && item.action === 'resetStats') {
            if (player) {
                player.permaBuffs = {
                    maxHp: 0,
                    energy: 0,
                    draw: 0,
                    strength: 0,
                    defense: 0
                };
                if (typeof player.recalculateStats === 'function') player.recalculateStats();
                if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
                    Utils.showBattleLog('洗髓丹生效：永久属性已重置');
                }
                if (typeof game.autoSave === 'function') game.autoSave();
                return { applied: true, detail: 'stats_reset' };
            }
            return { applied: false, detail: 'no_player' };
        }

        if (item.type === 'skin') {
            return { applied: false, detail: `skin_unlocked:${item.skinId || item.id}` };
        }
        if (item.type === 'title') {
            return { applied: false, detail: `title_unlocked:${item.titleId || item.id}` };
        }
        return { applied: false, detail: 'no_runtime_effect' };
    },

    purchaseShopItem(itemId, options = {}) {
        const item = this.getShopItemById(itemId);
        if (!item) return { success: false, message: '商品不存在' };

        const economy = this.loadEconomyState();
        const itemState = this.getShopItemState(itemId, economy, item);
        if (!itemState.buyable) {
            if (itemState.reason === 'equipped') return { success: false, message: '该外观已佩戴', reason: 'equipped' };
            if (itemState.reason === 'equippable') return { success: false, message: '该外观可直接佩戴', reason: 'equippable' };
            if (itemState.reason === 'owned') return { success: false, message: '该商品已拥有', reason: 'owned' };
            if (itemState.reason === 'sold_out') return { success: false, message: '该商品已售罄', reason: 'sold_out' };
            if (itemState.reason === 'insufficient') return { success: false, message: '天道币不足', reason: 'insufficient' };
            return { success: false, message: '商品不可购买', reason: itemState.reason };
        }

        let next = this.normalizeEconomyState({
            ...economy,
            coins: economy.coins - itemState.price,
            totalSpent: economy.totalSpent + itemState.price,
            purchases: {
                ...(economy.purchases || {}),
                [item.id]: (Math.max(0, Math.floor(Number(economy.purchases && economy.purchases[item.id]) || 0)) + 1)
            },
            ownedItems: {
                ...(economy.ownedItems || {}),
                ...(item.type !== 'consumable' ? { [item.id]: true } : {})
            },
            ...(item.type === 'skin' && !economy.equippedSkinId ? { equippedSkinId: item.id } : {}),
            ...(item.type === 'title' && !economy.equippedTitleId ? { equippedTitleId: item.id } : {}),
            lastPurchaseAt: Date.now()
        });
        next = this.appendEconomyLog(next, {
            type: 'purchase',
            itemId: item.id,
            itemName: item.name || null,
            coins: -itemState.price,
            detail: '商店兑换'
        });
        this.saveEconomyState(next);

        const rewardResult = this.applyShopReward(item, options.game || null);
        const remainingStock = this.getRemainingStock(item.id, next, item);
        return {
            success: true,
            itemId: item.id,
            itemName: item.name || '未知商品',
            coinsSpent: itemState.price,
            remainingStock,
            reward: rewardResult,
            wallet: this.getWalletSummary(next),
            equipped: this.getEquippedCosmetics(next),
            message: `兑换成功：${item.name || '未知商品'}`
        };
    },

    handleShopItemAction(itemId, options = {}) {
        const item = this.getShopItemById(itemId);
        if (!item) return { success: false, message: '商品不存在', reason: 'missing' };
        const state = this.getShopItemState(itemId);
        if (state.buyable) {
            return this.purchaseShopItem(itemId, options);
        }
        if (state.equipped) {
            return this.unequipCosmeticItem(itemId);
        }
        if (state.equippable) {
            return this.equipCosmeticItem(itemId);
        }
        if (state.reason === 'owned') {
            return { success: false, message: '该商品已拥有', reason: 'owned' };
        }
        if (state.reason === 'insufficient') {
            return { success: false, message: '天道币不足', reason: 'insufficient' };
        }
        if (state.reason === 'sold_out') {
            return { success: false, message: '该商品已售罄', reason: 'sold_out' };
        }
        return { success: false, message: '商品当前不可操作', reason: state.reason || 'unavailable' };
    },

    nextPracticeSeed() {
        const storage = this.getPersistentStorage();
        if (!storage) return Date.now() % 997;
        try {
            const raw = Number(storage.getItem(this.practiceSeedStorageKey)) || 0;
            const next = (raw + 1) % 9973;
            storage.setItem(this.practiceSeedStorageKey, String(next));
            return next;
        } catch {
            return Date.now() % 997;
        }
    },

    getPracticeDeck(deckArchetype = 'balanced', realm = 1) {
        const pickValid = (ids) => ids.filter((id) => typeof CARDS !== 'undefined' && CARDS[id]);
        const baseStarter = Array.isArray(typeof STARTER_DECK !== 'undefined' ? STARTER_DECK : null)
            ? pickValid(STARTER_DECK)
            : [];

        const archetypePools = {
            aggressive: ['strike', 'heavyStrike', 'quickSlash', 'execute', 'furyStrike', 'thunderStrike'],
            fortified: ['defend', 'shieldWall', 'ironDefense', 'fortify', 'healingLight', 'counterStrike'],
            balanced: ['strike', 'defend', 'quickSlash', 'meditation', 'spiritBoost', 'powerUp']
        };
        const pool = pickValid(archetypePools[deckArchetype] || archetypePools.balanced);
        const source = pool.length > 0 ? pool : baseStarter;
        const fallback = pickValid(['strike', 'defend', 'quickSlash', 'meditation']);
        const finalSource = source.length > 0 ? source : fallback;
        const targetSize = Math.max(8, Math.min(16, 8 + Math.floor((Number(realm) || 1) / 2)));
        const deck = [];
        for (let i = 0; i < targetSize; i++) {
            const id = finalSource[i % finalSource.length];
            if (!id) continue;
            deck.push({
                id,
                upgraded: Number(realm) >= 6 && i % 4 === 0
            });
        }
        return deck;
    },

    createPracticeLeaderboard(baseRank = null) {
        const localRank = this.normalizeLocalRank(baseRank || this.currentRankData || this.loadLocalRank());
        const bots = [
            { id: 'bot-1', name: '镜湖散修', score: localRank.score + 40, realm: Math.max(1, localRank.realm), division: this.getDivisionByScore(localRank.score + 40) },
            { id: 'bot-2', name: '玄铁守门人', score: Math.max(800, localRank.score - 35), realm: Math.max(1, localRank.realm), division: this.getDivisionByScore(localRank.score - 35) },
            { id: 'bot-3', name: '离火剑客', score: localRank.score + 95, realm: Math.max(1, localRank.realm + 1), division: this.getDivisionByScore(localRank.score + 95) },
            { id: 'bot-4', name: '归墟棋手', score: Math.max(700, localRank.score - 90), realm: Math.max(1, localRank.realm), division: this.getDivisionByScore(localRank.score - 90) },
            { id: 'bot-5', name: '风雪行者', score: localRank.score + 10, realm: Math.max(1, localRank.realm), division: this.getDivisionByScore(localRank.score + 10) }
        ].map((bot, index) => ({
            objectId: bot.id,
            user: { objectId: bot.id, username: bot.name },
            score: bot.score,
            realm: bot.realm + (index % 2 === 0 ? 1 : 0),
            division: bot.division,
            isLocal: true
        }));

        const board = [localRank, ...bots];
        board.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
        return board.slice(0, 20);
    },

    createPracticeOpponent(myScore = 1000, myRealm = 1, reason = 'practice') {
        const seed = this.nextPracticeSeed();
        const styles = ['aggressive', 'fortified', 'balanced'];
        const style = styles[seed % styles.length];
        const scoreShift = ((seed % 9) - 4) * 15;
        const opponentScore = Math.max(700, Math.floor((Number(myScore) || 1000) + scoreShift));
        const opponentRealm = Math.max(1, Math.floor((Number(myRealm) || 1) + ((seed % 3) - 1)));
        const namePool = ['太虚演武傀儡', '青锋论道者', '星渊镜像', '古碑守阵灵'];
        const opponentName = `${namePool[seed % namePool.length]}-${(seed % 97) + 1}`;
        const opponentRank = {
            objectId: `practice-rank-${seed}`,
            user: { objectId: `practice-user-${seed}`, username: opponentName },
            score: opponentScore,
            realm: opponentRealm,
            division: this.getDivisionByScore(opponentScore),
            isLocal: true
        };

        const battleData = this.normalizeBattleData({
            me: {
                maxHp: 90 + opponentRealm * 4,
                energy: 3 + Math.floor(opponentRealm / 8),
                currEnergy: 3 + Math.floor(opponentRealm / 8)
            },
            deck: this.getPracticeDeck(style, opponentRealm),
            aiProfile: style,
            deckArchetype: style,
            ruleVersion: this.ruleVersion
        });

        const localUser = this.getLocalUserProfile();
        const issuedAt = Date.now();
        const matchTicket = `practice:${localUser.objectId}:${issuedAt}:${seed}`;
        this.setActiveMatch({
            ticket: matchTicket,
            issuedAt,
            opponentRankId: opponentRank.objectId,
            opponentUserId: opponentRank.user.objectId,
            opponentRating: opponentScore,
            userId: localUser.objectId,
            consumed: false,
            localPractice: true,
            reason
        });

        return {
            success: true,
            opponent: {
                rank: opponentRank,
                ghost: {
                    objectId: `practice-ghost-${seed}`,
                    user: opponentRank.user,
                    config: {
                        personality: style,
                        guardianFormation: seed % 2 === 0
                    },
                    saveTime: issuedAt
                },
                battleData,
                matchTicket
            }
        };
    },

    persistActiveMatch() {
        try {
            const storage = this.getActiveMatchStorage();
            if (!storage) return;
            if (!this.activeMatch) {
                storage.removeItem(this.activeMatchStorageKey);
                return;
            }
            storage.setItem(this.activeMatchStorageKey, JSON.stringify(this.activeMatch));
        } catch (e) {
            console.warn('Persist active match failed:', e);
        }
    },

    loadActiveMatchFromStorage() {
        try {
            const storage = this.getActiveMatchStorage();
            if (!storage) return;
            const raw = storage.getItem(this.activeMatchStorageKey);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') {
                storage.removeItem(this.activeMatchStorageKey);
                return;
            }

            const now = Date.now();
            const maxAge = 10 * 60 * 1000;
            const isExpired = !parsed.issuedAt || (now - parsed.issuedAt > maxAge);
            const currentUser = (typeof Bmob !== 'undefined' && Bmob.User && typeof Bmob.User.current === 'function')
                ? Bmob.User.current()
                : null;
            const userMismatch = !!(parsed.userId && currentUser && parsed.userId !== currentUser.objectId);
            if (parsed.consumed || isExpired) {
                storage.removeItem(this.activeMatchStorageKey);
                return;
            }
            if (userMismatch) {
                storage.removeItem(this.activeMatchStorageKey);
                return;
            }
            this.activeMatch = parsed;
        } catch (e) {
            console.warn('Load active match failed:', e);
        }
    },

    setActiveMatch(match) {
        this.activeMatch = match || null;
        this.persistActiveMatch();
    },

    clearActiveMatch() {
        this.activeMatch = null;
        this.persistActiveMatch();
    },

    // 兼容不同 Bmob SDK 查询参数签名
    applyFilter(query, key, op, value) {
        try {
            query.equalTo(key, op, value);
            return;
        } catch (e) {
            // Fallback to method-style operators if available
        }

        if (op === '==') {
            query.equalTo(key, value);
            return;
        }
        if (op === '!=' && typeof query.notEqualTo === 'function') {
            query.notEqualTo(key, value);
            return;
        }
        if (op === '>=' && typeof query.greaterThanOrEqualTo === 'function') {
            query.greaterThanOrEqualTo(key, value);
            return;
        }
        if (op === '<=' && typeof query.lessThanOrEqualTo === 'function') {
            query.lessThanOrEqualTo(key, value);
            return;
        }

        // Last try: keep original call pattern for SDKs that only support this form.
        query.equalTo(key, op, value);
    },

    /**
     * 初始化：检查当前用户并获取榜单信息
     */
    async init() {
        this.loadActiveMatchFromStorage();
        this.loadEconomyState();
        await this.syncRank();
    },

    /**
     * 上传防御快照 (Ghost)
     * @param {Object} snapData - 包含 { powerScore, realm, data, personality, formation }
     */
    async uploadSnapshot(snapData) {
        const safeSnapData = snapData && typeof snapData === 'object' ? snapData : {};
        const normalizedData = this.normalizeBattleData(safeSnapData.data || {});
        const localSnapshot = {
            objectId: `local-ghost-${Date.now()}`,
            user: this.getLocalUserProfile(),
            powerScore: Math.max(0, Math.floor(Number(safeSnapData.powerScore) || 100)),
            realm: Math.max(1, Math.floor(Number(safeSnapData.realm) || 1)),
            data: JSON.stringify(normalizedData),
            config: {
                personality: safeSnapData.personality || normalizedData.aiProfile || 'balanced',
                guardianFormation: !!safeSnapData.guardianFormation
            },
            isDefense: true,
            saveTime: Date.now(),
            isLocal: true
        };

        if (!this.isOnlinePvpAvailable()) {
            this.saveLocalSnapshot(localSnapshot);
            return { success: true, local: true, message: '已保存到本地演武场（离线）' };
        }

        try {
            const user = this.getCurrentUserSafe();
            if (!user || !user.objectId) {
                this.saveLocalSnapshot(localSnapshot);
                return { success: true, local: true, message: '已保存到本地演武场（离线）' };
            }
            const query = Bmob.Query('GhostSnapshot');
            this.applyFilter(query, 'user', '==', user.objectId);

            let results = [];
            try {
                results = await query.find();
            } catch (findError) {
                if (findError && findError.code !== 101) {
                    throw findError;
                }
                // If 101, keep results as []
            }

            let ghost;
            if (results && results.length > 0) {
                // Update existing
                const latest = results.reduce((best, item) => {
                    if (!best) return item;
                    const bestTime = Number(best.saveTime) || 0;
                    const itemTime = Number(item.saveTime) || 0;
                    return itemTime >= bestTime ? item : best;
                }, null);
                ghost = Bmob.Query('GhostSnapshot');
                ghost.set('id', latest.objectId);
            } else {
                // Create new
                ghost = Bmob.Query('GhostSnapshot');
                const userPointer = Bmob.Pointer('_User');
                const poiID = userPointer.set(user.objectId);
                ghost.set('user', poiID);
            }

            // Set Data
            ghost.set('powerScore', localSnapshot.powerScore);
            ghost.set('realm', localSnapshot.realm);
            ghost.set('data', JSON.stringify(normalizedData)); // 完整Battle数据 stringified
            ghost.set('config', {
                personality: localSnapshot.config.personality,
                guardianFormation: localSnapshot.config.guardianFormation
            });
            ghost.set('isDefense', true);
            ghost.set('saveTime', Date.now()); // Renamed from updatedAt (reserved)

            await ghost.save();
            this.saveLocalSnapshot(localSnapshot);
            console.log('Ghost Snapshot uploaded.');
            return { success: true };

        } catch (error) {
            console.error('Upload Snapshot error:', error);
            this.saveLocalSnapshot(localSnapshot);
            return { success: true, local: true, message: '云端上传失败，已保存到本地演武场', error };
        }
    },

    /**
     * 获取我的防御快照
     */
    async getMyDefenseSnapshot() {
        if (!this.isOnlinePvpAvailable()) {
            return this.loadLocalSnapshot();
        }

        try {
            const user = this.getCurrentUserSafe();
            if (!user || !user.objectId) return this.loadLocalSnapshot();
            const query = Bmob.Query('GhostSnapshot');
            this.applyFilter(query, 'user', '==', user.objectId);
            const results = await query.find();

            if (results && results.length > 0) {
                return results.reduce((best, item) => {
                    if (!best) return item;
                    const bestTime = Number(best.saveTime) || 0;
                    const itemTime = Number(item.saveTime) || 0;
                    return itemTime >= bestTime ? item : best;
                }, null);
            }
            return this.loadLocalSnapshot();
        } catch (error) {
            console.error('Get my snapshot error:', error);
            // Ignore 101 table missing
            return this.loadLocalSnapshot();
        }
    },

    /**
     * 寻找对手
     * @param {number} myScore - 我的当前积分
     * @param {number} myRealm - 我的境界
     * @returns {Object} Opponent Ghost Data
     */
    async findOpponent(myScore, myRealm, options = {}) {
        const allowPractice = options.allowPractice !== false;
        if (!this.isOnlinePvpAvailable()) {
            if (allowPractice) return this.createPracticeOpponent(myScore, myRealm, 'offline');
            return { success: false, message: '未登录' };
        }

        try {
            // 策略：找积分相近的对手 (±200分)
            const query = Bmob.Query('PlayerRank');

            // 排除自己
            const user = this.getCurrentUserSafe();
            if (!user || !user.objectId) {
                if (allowPractice) return this.createPracticeOpponent(myScore, myRealm, 'missing_user');
                return { success: false, message: '未登录' };
            }
            this.applyFilter(query, 'user', '!=', user.objectId);

            // 简单范围查询
            if (myScore) {
                this.applyFilter(query, 'score', '>=', myScore - 300);
                this.applyFilter(query, 'score', '<=', myScore + 300);
            }
            query.limit(10);
            // 必须 include user 才能获取对手名字
            query.include('user');

            let opponents = await query.find();

            // 如果没找到，放宽条件
            if (!opponents || opponents.length === 0) {
                const retryQuery = Bmob.Query('PlayerRank');
                this.applyFilter(retryQuery, 'user', '!=', user.objectId);
                retryQuery.limit(5);
                retryQuery.order('-score'); // 找高分的
                retryQuery.include('user');
                opponents = await retryQuery.find();
            }

            if (!opponents || opponents.length === 0) {
                if (allowPractice) return this.createPracticeOpponent(myScore, myRealm, 'no_server_opponent');
                return { success: false, message: '暂无对手，请稍后再试' };
            }

            const shuffled = opponents.slice().sort(() => Math.random() - 0.5);
            let opponentRank = null;
            let ghostData = null;
            for (const rankCandidate of shuffled) {
                if (!rankCandidate || !rankCandidate.user || !rankCandidate.user.objectId) continue;
                const ghostQuery = Bmob.Query('GhostSnapshot');
                this.applyFilter(ghostQuery, 'user', '==', rankCandidate.user.objectId);
                const ghosts = await ghostQuery.find();
                if (!ghosts || ghosts.length === 0) continue;
                ghostData = ghosts.reduce((best, item) => {
                    if (!best) return item;
                    const bestTime = Number(best.saveTime) || 0;
                    const itemTime = Number(item.saveTime) || 0;
                    return itemTime >= bestTime ? item : best;
                }, null);
                opponentRank = rankCandidate;
                break;
            }

            if (!opponentRank || !ghostData) {
                if (allowPractice) return this.createPracticeOpponent(myScore, myRealm, 'missing_server_snapshot');
                return { success: false, message: '对手未设置防御' };
            }

            // 解析数据
            let parsedData;
            try {
                if (typeof ghostData.data === 'string') {
                    parsedData = JSON.parse(ghostData.data);
                } else if (ghostData.data && typeof ghostData.data === 'object') {
                    parsedData = ghostData.data;
                } else {
                    throw new Error('ghost data format invalid');
                }
            } catch (e) {
                console.error('Parse ghost data failed', e);
                return { success: false, message: '对手数据损坏' };
            }
            parsedData = this.normalizeBattleData(parsedData);

            const issuedAt = Date.now();
            const opponentRankId = opponentRank.objectId || null;
            const matchTicket = `${user.objectId}:${opponentRankId || 'unknown'}:${issuedAt}:${Math.random().toString(36).slice(2, 10)}`;
            this.setActiveMatch({
                ticket: matchTicket,
                issuedAt,
                opponentRankId,
                opponentUserId: opponentRank.user && opponentRank.user.objectId ? opponentRank.user.objectId : null,
                userId: user.objectId,
                consumed: false
            });

            return {
                success: true,
                opponent: {
                    rank: opponentRank,
                    ghost: ghostData,
                    battleData: parsedData,
                    matchTicket
                }
            };

        } catch (error) {
            console.error('Find opponent error:', error);
            // Handle 101 (Table missing)
            if (allowPractice) return this.createPracticeOpponent(myScore, myRealm, 'query_error');
            if (error.code === 101) return { success: false, message: '暂无对手数据 (101)' };
            return { success: false, error };
        }
    },

    normalizeBattleData(rawData) {
        const data = rawData && typeof rawData === 'object' ? rawData : {};
        const maxHp = Math.max(60, Math.floor(Number(data.me && data.me.maxHp) || 100));
        const energy = Math.max(1, Math.floor(Number(data.me && data.me.energy) || 3));
        const currEnergy = Math.max(0, Math.min(energy, Math.floor(Number(data.me && data.me.currEnergy) || energy)));
        const requestedArchetype = data.deckArchetype || data.aiProfile || 'balanced';
        const deck = this.sanitizeDeckForPvp(data.deck, requestedArchetype, Math.max(1, Math.floor(maxHp / 25)));
        const aiProfile = data.aiProfile || this.getDeckArchetype(deck);
        const personalityRules = data.personalityRules && typeof data.personalityRules === 'object'
            ? {
                damageMul: Number(data.personalityRules.damageMul) || 1,
                takenMul: Number(data.personalityRules.takenMul) || 1,
                regenEnergyPerTurn: Math.max(0, Math.floor(Number(data.personalityRules.regenEnergyPerTurn) || 0)),
                hpMul: Number(data.personalityRules.hpMul) || 1
            }
            : null;

        return {
            me: {
                maxHp,
                energy,
                currEnergy
            },
            deck,
            aiProfile,
            deckArchetype: data.deckArchetype || this.getDeckArchetype(deck),
            ruleVersion: data.ruleVersion || this.ruleVersion,
            personalityRules
        };
    },

    sanitizeDeckForPvp(rawDeck, preferredArchetype = 'balanced', realm = 1) {
        const srcDeck = Array.isArray(rawDeck) ? rawDeck : [];
        const sanitized = [];
        srcDeck.forEach((card, index) => {
            const cardId = typeof card === 'string' ? card : (card && card.id);
            if (!cardId) return;
            if (typeof CARDS !== 'undefined' && !CARDS[cardId]) return;
            sanitized.push({
                id: cardId,
                upgraded: !!(card && card.upgraded),
                name: card && card.name ? card.name : undefined
            });
            if (sanitized.length >= 20) return;
            if (index > 60) return;
        });
        if (sanitized.length >= 8) return sanitized;
        return this.getPracticeDeck(preferredArchetype, realm);
    },

    getDeckArchetype(deck) {
        let attack = 0;
        let defense = 0;
        let utility = 0;
        deck.forEach(card => {
            const id = typeof card === 'string' ? card : card.id;
            const cardDef = (typeof CARDS !== 'undefined') ? CARDS[id] : null;
            const type = cardDef ? cardDef.type : null;
            if (type === 'attack') attack++;
            else if (type === 'defense') defense++;
            else utility++;
        });

        if (attack >= defense + utility) return 'aggressive';
        if (defense >= attack) return 'fortified';
        return 'balanced';
    },

    /**
     * 同步我的榜单数据
     */
    async syncRank() {
        if (!this.isOnlinePvpAvailable()) {
            this.currentRankData = this.loadLocalRank();
            return this.currentRankData;
        }

        try {
            const user = this.getCurrentUserSafe();
            if (!user || !user.objectId) {
                this.currentRankData = this.loadLocalRank();
                return this.currentRankData;
            }
            const query = Bmob.Query('PlayerRank');
            this.applyFilter(query, 'user', '==', user.objectId);
            const results = await query.find();

            if (results && results.length > 0) {
                this.currentRankData = results[0];
                this.currentRankData.score = Math.max(0, Math.floor(Number(this.currentRankData.score) || 1000));
                this.currentRankData.realm = Math.max(1, Math.floor(Number(this.currentRankData.realm) || 1));
                this.currentRankData.division = this.currentRankData.division || this.getDivisionByScore(this.currentRankData.score);
                this.saveLocalRank(this.currentRankData);
            } else {
                // 初始化
                await this.createInitialRank(user);
            }
        } catch (error) {
            console.error('Sync rank error:', error);
            // Handle 101: Table not found (never created)
            if (error && error.code === 101) {
                console.log('PlayerRank table not found, creating initial rank...');
                const user = this.getCurrentUserSafe();
                await this.createInitialRank(user);
                return this.currentRankData;
            }
            this.currentRankData = this.loadLocalRank();
        }
        return this.currentRankData;
    },

    async createInitialRank(user) {
        if (!user || !user.objectId) {
            this.currentRankData = this.loadLocalRank();
            return;
        }
        const rank = Bmob.Query('PlayerRank');
        const userPointer = Bmob.Pointer('_User');
        const poiID = userPointer.set(user.objectId);
        rank.set('user', poiID);
        rank.set('score', 1000); // 初始分
        rank.set('realm', 1);
        rank.set('division', this.getDivisionByScore(1000));

        try {
            await rank.save();
            this.currentRankData = await this.getRankByUserId(user.objectId);
            this.saveLocalRank(this.currentRankData);
        } catch (e) {
            console.error('Create initial rank failed', e);
            this.currentRankData = this.loadLocalRank();
        }
    },

    async getRankByUserId(userId) {
        const query = Bmob.Query('PlayerRank');
        this.applyFilter(query, 'user', '==', userId);
        const res = await query.find();
        return res[0];
    },

    async getRankByObjectId(rankId) {
        if (!rankId) return null;
        try {
            const query = Bmob.Query('PlayerRank');
            return await query.get(rankId);
        } catch (error) {
            console.warn('Get rank by objectId failed:', rankId, error);
            return null;
        }
    },

    /**
     * 汇报战斗结果
     * @param {boolean} isWin 
     * @param {Object} opponentRankData 
     */
    async reportMatchResult(isWin, opponentRankData, matchTicket = null) {
        if (!this.currentRankData) await this.syncRank();
        if (!this.activeMatch) this.loadActiveMatchFromStorage();
        if (!this.currentRankData) this.currentRankData = this.loadLocalRank();

        const currentRating = Math.max(0, Number(this.currentRankData.score) || 1000);
        const now = Date.now();
        const active = this.activeMatch;
        const onlineAvailable = this.isOnlinePvpAvailable();
        const user = this.getCurrentUserSafe();
        const opponentRankId = opponentRankData ? opponentRankData.objectId : null;
        const opponentUserId = opponentRankData && opponentRankData.user ? opponentRankData.user.objectId : null;
        const ticketValid = !!(
            active &&
            !active.consumed &&
            matchTicket &&
            active.ticket === matchTicket &&
            (!active.userId || !user || active.userId === user.objectId) &&
            now - active.issuedAt <= 10 * 60 * 1000 &&
            (!active.opponentRankId || !opponentRankId || active.opponentRankId === opponentRankId) &&
            (!active.opponentUserId || !opponentUserId || active.opponentUserId === opponentUserId)
        );

        if (!ticketValid) {
            console.warn('PVP report rejected: invalid or expired match ticket.');
            if (active && (active.consumed || now - active.issuedAt > 10 * 60 * 1000 || (matchTicket && active.ticket === matchTicket))) {
                this.clearActiveMatch();
            }
            return { newRating: currentRating, delta: 0, rejected: true };
        }
        active.consumed = true;
        this.persistActiveMatch();

        const calcRating = (myRating, oppRating, result) => {
            if (typeof EloCalculator !== 'undefined' && EloCalculator && typeof EloCalculator.calculate === 'function') {
                return EloCalculator.calculate(myRating, oppRating, result);
            }
            const fallbackDelta = result ? 20 : -20;
            return { newRating: myRating + fallbackDelta, delta: fallbackDelta };
        };

        const applyLocalSettlement = (opponentRating = 1000) => {
            const result = isWin ? 1 : 0;
            const calcRes = calcRating(currentRating, opponentRating, result);
            const next = this.normalizeLocalRank({
                ...this.currentRankData,
                score: calcRes.newRating,
                wins: (this.currentRankData.wins || 0) + (isWin ? 1 : 0),
                losses: (this.currentRankData.losses || 0) + (isWin ? 0 : 1),
                division: this.getDivisionByScore(calcRes.newRating)
            });
            this.currentRankData = next;
            this.saveLocalRank(next);
            const reward = this.grantMatchReward({
                isWin,
                isRanked: !(active && active.localPractice),
                opponentRating
            });
            this.clearActiveMatch();
            return {
                ...calcRes,
                coinsAwarded: reward.coinsAwarded,
                wallet: reward.wallet
            };
        };

        if (!onlineAvailable || active.localPractice) {
            const localOppRating = Math.max(
                100,
                Number((active && active.opponentRating) || (opponentRankData && opponentRankData.score) || 1000)
            );
            return applyLocalSettlement(localOppRating);
        }

        if (!user || !user.objectId) {
            return applyLocalSettlement(Number(opponentRankData && opponentRankData.score) || 1000);
        }

        const myRating = currentRating;
        let oppRating = opponentRankData ? (opponentRankData.score || 1000) : 1000;
        if (opponentRankId) {
            const verifiedOpponentRank = await this.getRankByObjectId(opponentRankId);
            if (verifiedOpponentRank && typeof verifiedOpponentRank.score === 'number') {
                const verifiedOpponentUserId = verifiedOpponentRank.user && verifiedOpponentRank.user.objectId
                    ? verifiedOpponentRank.user.objectId
                    : null;
                if (active.opponentUserId && verifiedOpponentUserId && active.opponentUserId !== verifiedOpponentUserId) {
                    console.warn('PVP report rejected: opponent user mismatch.');
                    this.clearActiveMatch();
                    return { newRating: currentRating, delta: 0, rejected: true };
                }
                oppRating = verifiedOpponentRank.score;
            } else {
                console.warn('PVP rating fallback: unable to verify opponent rank from server.');
            }
        }

        // Local Calc
        const result = isWin ? 1 : 0;
        const calcRes = calcRating(myRating, oppRating, result);

        // Update My Rank (Server)
        const myQuery = Bmob.Query('PlayerRank');
        myQuery.set('id', this.currentRankData.objectId);
        myQuery.set('score', calcRes.newRating);
        // Update Stats
        let wins = this.currentRankData.wins || 0;
        if (isWin) wins++;
        myQuery.set('wins', wins);
        let losses = this.currentRankData.losses || 0;
        if (!isWin) losses++;
        myQuery.set('losses', losses);

        try {
            await myQuery.save();
        } catch (error) {
            console.error('PVP save result failed:', error);
            this.clearActiveMatch();
            return { newRating: currentRating, delta: 0, rejected: true, error };
        }

        // Sync local
        this.currentRankData.score = calcRes.newRating;
        this.currentRankData.wins = wins;
        this.currentRankData.losses = losses;
        this.currentRankData.division = this.getDivisionByScore(calcRes.newRating);
        this.saveLocalRank(this.currentRankData);
        const reward = this.grantMatchReward({
            isWin,
            isRanked: true,
            opponentRating: oppRating
        });
        this.clearActiveMatch();

        return {
            ...calcRes,
            coinsAwarded: reward.coinsAwarded,
            wallet: reward.wallet
        }; // Return delta for UI
    },

    /**
     * 获取排行榜
     */
    async getLeaderboard() {
        if (!this.isOnlinePvpAvailable()) {
            return this.createPracticeLeaderboard(this.currentRankData || this.loadLocalRank());
        }
        try {
            const query = Bmob.Query('PlayerRank');
            query.order('-score');
            query.limit(20);
            query.include('user'); // Include user info (name etc)
            const list = await query.find();
            if (Array.isArray(list) && list.length > 0) return list;
            return this.createPracticeLeaderboard(this.currentRankData || this.loadLocalRank());
        } catch (error) {
            console.warn('Get leaderboard failed, fallback to local board:', error);
            return this.createPracticeLeaderboard(this.currentRankData || this.loadLocalRank());
        }
    }
};
