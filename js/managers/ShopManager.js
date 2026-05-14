export class ShopManager {
    constructor(gameInstance) {
        this.game = gameInstance;
    }

    evaluateShopCardDeckFit(card) {
        const profile = this.game.buildPlayerDeckProfile();
        const reasons = [];
        let score = 0;
        if (!card) return { label: '适配未知', reason: '无法解析当前卡牌。', summaryRows: [], score: 0 };
        if (card.type === 'attack') {
            const ratio = profile.ratio('attack');
            if (ratio >= 0.34) { score += 2.2; reasons.push('当前牌组攻击占比高，新增攻击牌更容易形成连段。'); }
            else if (ratio >= 0.2) { score += 1.1; reasons.push('攻击轴已有基础，可作为补强。'); }
        } else if (card.type === 'defense') {
            const ratio = profile.ratio('defense');
            if (ratio >= 0.28) { score += 2; reasons.push('防御牌占比稳定，这张牌容易融入护盾节奏。'); }
            else { score += 0.8; reasons.push('当前防御牌偏少，可作为补位工具。'); }
        } else if (card.type === 'law') {
            const ratio = profile.ratio('law');
            if (ratio >= 0.2) { score += 2.2; reasons.push('法则牌比重较高，继续叠法则轴收益明显。'); }
            if (card.lawType && profile.lawTypeCounts[card.lawType]) { score += 1.4; reasons.push(`牌组已存在 ${card.lawType} 法则链，可直接衔接。`); }
        } else if (card.type === 'energy') {
            if (profile.avgCost >= 1.7) { score += 2.1; reasons.push('当前牌组平均费用偏高，灵力牌更能稳节奏。'); }
            else { score += 1.2; reasons.push('即使平均费用不高，灵力牌也能提升转场稳定性。'); }
        } else if (card.type === 'chance') {
            score += 1.0; reasons.push('机缘牌更依赖局面，适合作为弹性补件。');
        }
        if ((Number(card.cost) || 0) <= 1) { score += 0.5; reasons.push('低费用意味着更容易塞入现有曲线。'); }
        if ((Number(card.cost) || 0) >= 3 && profile.avgCost >= 1.8) { score += 0.6; reasons.push('当前曲线允许更高费用的爆发牌。'); }
        if (profile.size <= 12) { score += 0.4; reasons.push('牌组规模还不大，新牌更容易被尽快抽到。'); }
        const label = score >= 3.2 ? '高适配' : (score >= 1.7 ? '中适配' : '低适配');
        const reason = reasons[0] || '这张牌更偏通用补件，需结合当前流派自行判断。';
        return {
            label,
            reason,
            score,
            summaryRows: [
                { label: '适配度', value: label },
                { label: '牌组重心', value: `${profile.dominantType}轴 · 均费 ${profile.avgCost.toFixed(1)}` },
                { label: '牌组规模', value: `${profile.size} 张` }
            ]
        };
    }

    evaluateShopServiceFit(service) {
        const profile = this.game.buildPlayerDeckProfile();
        const hpRatio = this.game.player?.maxHp > 0 ? (this.game.player.currentHp / this.game.player.maxHp) : 1;
        const currency = service?.currency || 'gold';
        const currentBudget = typeof this.game.getStrategicCurrencyAmount === 'function'
            ? this.game.getStrategicCurrencyAmount(currency)
            : Number(this.game.player?.gold) || 0;
        const price = Math.max(0, Number(service?.price) || 0);
        const reasons = [];
        let score = 0;

        if (!service) return { label: '适配未知', reason: '无法解析当前服务。', summaryRows: [], score: 0 };

        switch (service.id) {
            case 'heal':
            case 'campRation':
            case 'fieldMedic':
            case 'endlessStabilizer':
            case 'runPathBulwarkRation':
                if (hpRatio <= 0.45) {
                    score += 4.0;
                    reasons.push('当前血线偏低，先补生存比继续扩牌更稳。');
                } else if (hpRatio <= 0.7) {
                    score += 1.8;
                    reasons.push('生命有明显折损，补给类服务能提升容错。');
                } else {
                    score += 0.6;
                    reasons.push('当前血线健康，补给收益偏向稳态。');
                }
                break;
            case 'remove':
                if (profile.size >= 14) {
                    score += 3.1;
                    reasons.push('当前牌组偏厚，净化能直接提高抽到核心牌的频率。');
                } else if (profile.size >= 11) {
                    score += 2.0;
                    reasons.push('移除冗余牌能继续收束曲线。');
                } else {
                    score += 0.7;
                    reasons.push('当前牌组较薄，净化收益更偏长期优化。');
                }
                break;
            case 'exp':
            case 'fateLedger':
            case 'insightIncense':
            case 'runPathInsightAtlas':
                score += 1.8;
                reasons.push('命环成长服务偏向中长期增益，适合提前投资后续强度。');
                break;
            case 'tacticalPlan':
            case 'pulseCatalyst':
            case 'wardSigil':
            case 'runPathShatterOrder':
                score += profile.dominantType === 'attack' || profile.avgCost >= 1.8 ? 2.2 : 1.2;
                reasons.push('战前增益服务能放大现有节奏轴，尤其适合已经成型的牌组。');
                break;
            case 'bountyContract':
            case 'scoutPack':
            case 'rumorRareDraft':
            case 'rumorTreasureTrail':
            case 'rumorUtilityRoute':
            case 'rumorTrialRoute':
            case 'runPathShatterRumor':
            case 'runPathBulwarkRumor':
            case 'runPathInsightRumor':
                score += 1.4;
                reasons.push('这类交易更偏投资未来收益，适合资源宽裕时滚雪球。');
                break;
            case 'endlessRefit':
            case 'endlessOverclock':
            case 'endlessBlessing':
                score += this.game.isEndlessActive && this.game.isEndlessActive() ? 2.4 : 0.2;
                reasons.push(this.game.isEndlessActive && this.game.isEndlessActive()
                    ? '当前处于无尽轮回，轮回服务会直接影响压力与赐福。'
                    : '轮回类服务仅在无尽模式下有较高收益。');
                break;
            default:
                score += 1.0;
                reasons.push('这是泛用型服务，价值取决于你当前缺口。');
                break;
        }

        if (price > currentBudget) {
            score -= 1.8;
            reasons.push('当前资源不足，先保留余钱更稳。');
        } else if (currency === 'gold' && currentBudget - price < 45) {
            score -= 0.5;
            reasons.push('买完后灵石结余偏低，要注意下一次商店与事件缓冲。');
        }

        const label = score >= 3.0 ? '高适配' : (score >= 1.7 ? '中适配' : '低适配');
        return {
            label,
            reason: reasons[0] || '当前局势下属于通用型服务。',
            score,
            summaryRows: [
                { label: '服务适配', value: label },
                { label: '结余预估', value: `${Math.max(0, currentBudget - price)} ${this.game.getStrategicCurrencyLabel ? this.game.getStrategicCurrencyLabel(currency) : currency}` },
                { label: '当前血线', value: `${Math.round(hpRatio * 100)}%` }
            ]
        };
    }

    getShopNextNodeForecast() {
        if (!this.game.map || typeof this.game.map.getAccessibleNodes !== 'function') return null;
        const accessible = this.game.map.getAccessibleNodes().filter((node) => node && node.id !== this.game.shopNode?.id);
        if (accessible.length === 0) return null;
        const shopRow = Number(this.game.shopNode?.row);
        const futureNodes = Number.isFinite(shopRow)
            ? accessible.filter((node) => Number(node?.row) > shopRow)
            : accessible;
        const pool = futureNodes.length > 0 ? futureNodes : accessible;
        const minRow = Math.min(...pool.map((node) => Number(node?.row) || 0));
        const frontier = pool.filter((node) => (Number(node?.row) || 0) === minRow);
        const rank = { boss: 6, elite: 5, ghost_duel: 4, trial: 4, enemy: 3, forge: 2, event: 2, rest: 1, shop: 1 };
        const sortedTypes = [...new Set(frontier.map((node) => node.type))].sort((a, b) => (rank[b] || 0) - (rank[a] || 0));
        const primaryType = sortedTypes[0] || frontier[0]?.type || 'enemy';
        const labels = sortedTypes.map((type) => this.game.getMapNodeTypeLabel(type));
        const danger = ['boss', 'elite', 'ghost_duel', 'trial'].includes(primaryType) ? 'high' : (primaryType === 'enemy' ? 'medium' : 'low');
        return {
            row: minRow,
            nodes: frontier,
            primaryType,
            primaryLabel: this.game.getMapNodeTypeLabel(primaryType),
            labels,
            summary: labels.length > 0 ? `下一批节点：${labels.join(' / ')}` : '下一批节点未明',
            danger
        };
    }

    getShopEconomyOutlook() {
        const budget = typeof this.game.getStrategicCurrencyAmount === 'function'
            ? this.game.getStrategicCurrencyAmount('gold')
            : (Number(this.game.player?.gold) || 0);
        const hpRatio = this.game.player?.maxHp > 0 ? (this.game.player.currentHp / this.game.player.maxHp) : 1;
        const forecast = this.getShopNextNodeForecast();
        const services = Array.isArray(this.game.shopServices) ? this.game.shopServices.filter((item) => item && !item.sold) : [];
        const recoveryServiceIds = new Set(['heal', 'campRation', 'fieldMedic', 'endlessStabilizer']);
        const availableRecoveryServices = services.filter((item) => recoveryServiceIds.has(item.id));
        const affordableRecoveryService = availableRecoveryServices.some((item) => this.canAffordShopItem(item));

        let reserveTarget = this.game.isEndlessActive && this.game.isEndlessActive() ? 48 : 36;
        if (hpRatio <= 0.4) reserveTarget += 24;
        else if (hpRatio <= 0.6) reserveTarget += 16;
        else if (hpRatio <= 0.8) reserveTarget += 8;

        if (forecast?.danger === 'high') reserveTarget += hpRatio <= 0.6 ? 22 : 14;
        else if (forecast?.danger === 'medium') reserveTarget += 7;
        else if (forecast?.primaryType === 'rest') reserveTarget -= 12;
        else if (forecast?.primaryType === 'event' || forecast?.primaryType === 'shop' || forecast?.primaryType === 'forge') reserveTarget -= 5;

        if (availableRecoveryServices.length > 0 && !affordableRecoveryService && hpRatio <= 0.72) {
            reserveTarget += 8;
        }

        reserveTarget = Math.max(18, Math.min(120, Math.round(reserveTarget)));
        const spendCeiling = Math.max(0, budget - reserveTarget);
        const status = spendCeiling <= 0 ? 'critical' : (spendCeiling < 35 ? 'tight' : 'stable');
        const statusLabelMap = {
            critical: '必须囤钱',
            tight: '谨慎消费',
            stable: '可灵活投入'
        };
        const note = status === 'critical'
            ? `建议至少保留 ${reserveTarget} 灵石，用于${forecast?.primaryLabel || '后续节点'}前的恢复与应急。`
            : status === 'tight'
                ? `本次更适合把单次消费控制在 ${spendCeiling} 灵石以内，避免下一批节点前失去回转空间。`
                : `当前可支配约 ${spendCeiling} 灵石，可优先买下真正高适配的卡牌或关键服务。`;

        return {
            budget,
            reserveTarget,
            spendCeiling,
            status,
            statusLabel: statusLabelMap[status] || '谨慎消费',
            note,
            forecast,
            hpRatio,
            affordableRecoveryService
        };
    }

    buildShopSpendRecommendation() {
        const availableCards = Array.isArray(this.game.shopItems) ? this.game.shopItems.filter((item) => item && !item.sold) : [];
        const availableServices = Array.isArray(this.game.shopServices) ? this.game.shopServices.filter((item) => item && !item.sold) : [];
        const affordableCards = availableCards
            .filter((item) => this.canAffordShopItem(item))
            .map((item) => ({ item, fit: this.evaluateShopCardDeckFit(item.card) }))
            .sort((a, b) => (b.fit?.score || 0) - (a.fit?.score || 0));
        const affordableServices = availableServices
            .filter((item) => this.canAffordShopItem(item))
            .map((item) => ({ item, fit: this.evaluateShopServiceFit(item) }))
            .sort((a, b) => (b.fit?.score || 0) - (a.fit?.score || 0));

        const bestCard = affordableCards[0] || null;
        const bestService = affordableServices[0] || null;
        const economy = this.getShopEconomyOutlook();
        const goldBudget = economy.budget;
        const hpRatio = economy.hpRatio;
        const forecast = economy.forecast;
        let bestCardScore = bestCard?.fit?.score || 0;
        let bestServiceScore = bestService?.fit?.score || 0;
        const serviceRecoveryIds = new Set(['heal', 'campRation', 'fieldMedic', 'endlessStabilizer']);

        if (bestCard) {
            const cardPrice = Math.max(0, Number(bestCard.item?.price) || 0);
            if (cardPrice > economy.spendCeiling) {
                bestCardScore -= 0.9 + ((cardPrice - economy.spendCeiling) / 20);
            } else if (economy.status === 'stable') {
                bestCardScore += 0.35;
            }
            if (economy.status === 'critical') bestCardScore -= 0.85;
            else if (economy.status === 'tight') bestCardScore -= 0.25;
        }

        if (bestService) {
            const servicePrice = Math.max(0, Number(bestService.item?.price) || 0);
            const isRecoveryService = serviceRecoveryIds.has(bestService.item?.id);
            if (servicePrice > economy.spendCeiling) {
                bestServiceScore -= (isRecoveryService ? 0.25 : 0.65) + ((servicePrice - economy.spendCeiling) / (isRecoveryService ? 42 : 26));
            } else if (isRecoveryService && economy.status !== 'stable' && hpRatio <= 0.65) {
                bestServiceScore += 0.55;
            }
            if (!isRecoveryService && economy.status === 'critical') {
                bestServiceScore -= 0.35;
            }
        }

        if (forecast?.danger === 'high') {
            bestServiceScore += hpRatio <= 0.7 ? 1.2 : 0.55;
            bestCardScore -= hpRatio <= 0.55 ? 0.55 : 0.15;
        } else if (forecast?.primaryType === 'rest') {
            bestCardScore += 0.45;
        } else if (forecast?.primaryType === 'event' || forecast?.primaryType === 'shop') {
            bestCardScore += 0.25;
            bestServiceScore -= 0.1;
        }

        const forecastHint = forecast?.summary ? ` ${forecast.summary}。` : '';

        if (!bestCard && !bestService) {
            return {
                action: '建议留钱',
                tone: 'save',
                reason: (goldBudget <= 40 ? '当前资源太紧，先留钱应对后续恢复与关键节点。' : '本页暂无高适配且可负担的选项，先观察下一次货架更稳。') + forecastHint,
                bestCard: null,
                bestService: null,
                forecast,
                economy
            };
        }

        if (forecast?.danger === 'high' && hpRatio <= 0.55 && bestService) {
            return {
                action: '更适合买服务',
                tone: 'service',
                reason: `${bestService.item.name}：${bestService.fit.reason}${forecastHint}`,
                bestCard,
                bestService,
                forecast,
                economy
            };
        }

        if (forecast?.danger === 'high' && goldBudget < 65) {
            return {
                action: '建议留钱',
                tone: 'save',
                reason: `下一批更接近${forecast.primaryLabel}，当前灵石偏紧，先保留恢复或应急资金更稳。`,
                bestCard,
                bestService,
                forecast,
                economy
            };
        }

        if (bestService && (!bestCard || bestServiceScore >= bestCardScore + 0.45)) {
            return {
                action: '更适合买服务',
                tone: 'service',
                reason: `${bestService.item.name}：${bestService.fit.reason}${forecastHint}`,
                bestCard,
                bestService,
                forecast,
                economy
            };
        }

        if (bestCard && (!bestService || bestCardScore >= bestServiceScore - 0.25)) {
            return {
                action: '更适合买卡',
                tone: 'card',
                reason: `${bestCard.item.card.name}：${bestCard.fit.reason}${forecastHint}`,
                bestCard,
                bestService,
                forecast,
                economy
            };
        }

        return {
            action: '建议留钱',
            tone: 'save',
            reason: `当前买卡与买服务的收益接近，若资源吃紧可先保留弹性。${forecastHint}`,
            bestCard,
            bestService,
            forecast,
            economy
        };
    }

    generateShopData() {
        const items = [];
        const services = [];
        const priceMult = this.getShopPriceMultiplier(0.15);

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
            desc: `恢复 ${Math.floor(this.game.player.maxHp * 0.5)} 点生命`, // 30% -> 50%
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
            price: Math.floor(75 * (1 + (this.game.player.removeCount || 0) * 0.5) * priceMult), // 50 -> 75
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

        services.push({
            id: 'tacticalPlan',
            type: 'service',
            name: '战术推演',
            icon: '📘',
            desc: '接下来 2 场战斗：首回合额外抽 1 张牌',
            price: Math.floor(95 * priceMult),
            sold: false
        });

        services.push({
            id: 'wardSigil',
            type: 'service',
            name: '护阵符',
            icon: '🧿',
            desc: '接下来 2 场战斗：开场获得 10 护盾',
            price: Math.floor(110 * priceMult),
            sold: false
        });

        services.push({
            id: 'bountyContract',
            type: 'service',
            name: '悬赏契约',
            icon: '📜',
            desc: '接下来 2 场战斗：胜利时额外获得灵石',
            price: Math.floor(125 * priceMult),
            sold: false
        });

        services.push({
            id: 'scoutPack',
            type: 'service',
            name: '侦巡补给包',
            icon: '🎒',
            desc: '支付灵石后，从 3 张随机卡牌中选择 1 张',
            price: Math.floor(105 * priceMult),
            sold: false
        });

        services.push({
            id: 'campRation',
            type: 'service',
            name: '行军口粮',
            icon: '🥣',
            desc: '恢复生命并获得 1 层开场护盾增益',
            price: Math.floor(85 * priceMult),
            sold: false
        });

        services.push({
            id: 'fateLedger',
            type: 'service',
            name: '命轨账簿',
            icon: '📚',
            desc: '命环经验 +45，并获得 1 层胜利悬赏增益',
            price: Math.floor(115 * priceMult),
            sold: false
        });

        services.push({
            id: 'pulseCatalyst',
            type: 'service',
            name: '灵息催化剂',
            icon: '⚡',
            desc: '接下来 2 场战斗：首回合灵力 +1',
            price: Math.floor(118 * priceMult),
            sold: false
        });

        services.push({
            id: 'insightIncense',
            type: 'service',
            name: '悟境香',
            icon: '🕯️',
            desc: '接下来 2 场战斗：命环经验额外 +30%',
            price: Math.floor(128 * priceMult),
            sold: false
        });

        services.push({
            id: 'fieldMedic',
            type: 'service',
            name: '战地医师签约',
            icon: '🩹',
            desc: '接下来 2 场战斗：胜利后恢复生命',
            price: Math.floor(112 * priceMult),
            sold: false
        });

        if (this.game.isEndlessActive()) {
            services.push({
                id: 'endlessRefit',
                type: 'service',
                name: '相位校准',
                icon: '🧬',
                desc: '替换一个当前无尽词缀',
                price: Math.floor(170 * priceMult),
                sold: false
            });
            services.push({
                id: 'endlessStabilizer',
                type: 'service',
                name: '轮回稳压',
                icon: '🧯',
                desc: '轮回压力 -2，并恢复生命',
                price: Math.floor(160 * priceMult),
                sold: false
            });
            services.push({
                id: 'endlessOverclock',
                type: 'service',
                name: '轮回过载',
                icon: '🔥',
                desc: '轮回压力 +2，立即获得稀有赐福与额外灵石',
                price: Math.floor(188 * priceMult),
                sold: false
            });
            services.push({
                id: 'endlessBlessing',
                type: 'service',
                name: '轮回祷告',
                icon: '🕯️',
                desc: '从 2 项无尽赐福中选择 1 项',
                price: Math.floor(210 * priceMult),
                sold: false
            });
        }

        // 3. 随机商品 (由原来的随机服务改为固定商品位 + 概率位)

        // --- 有概率刷出一个法宝 (如果有未拥有的) ---
        // 使用加权随机逻辑
        const treasure = this.game.getWeightedRandomTreasure();

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
            const uncollected = lawKeys.filter(k => !this.game.player.collectedLaws.some(l => l.id === k));
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

    generateShopCards(count = 5) {
        const items = [];
        const realm = this.game.player.realm || 1;
        const priceMult = this.getShopPriceMultiplier(0.05);

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

            const card = getRandomCard(rarity, this.game.player.characterId);

            if (!card) continue;

            // Hardcore: 移除折扣，仅按难度系数
            const basePrice = this.game.getCardPrice(card);
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

    normalizeShopRumors(rumors = null) {
        const source = rumors && typeof rumors === 'object' ? rumors : {};
        const history = Array.isArray(source.history)
            ? source.history.filter((entry) => typeof entry === 'string').slice(-6)
            : [];
        const shift = source.nextRealmMapShift && typeof source.nextRealmMapShift === 'object'
            ? { ...source.nextRealmMapShift }
            : null;
        return {
            rewardRareCharges: Math.max(0, Math.floor(Number(source.rewardRareCharges) || 0)),
            rewardRareBonus: Math.max(0, Number(source.rewardRareBonus) || 0),
            treasureCharges: Math.max(0, Math.floor(Number(source.treasureCharges) || 0)),
            treasureChanceBonus: Math.max(0, Number(source.treasureChanceBonus) || 0),
            nextRealmMapShift: shift,
            nextRealmLabel: typeof source.nextRealmLabel === 'string' ? source.nextRealmLabel : '',
            nextRealmTarget: Number.isFinite(Number(source.nextRealmTarget)) ? Math.max(1, Math.floor(Number(source.nextRealmTarget))) : null,
            history
        };
    }

    ensureShopRumors() {
        if (!this.game.player) {
            return this.normalizeShopRumors();
        }
        this.game.player.shopRumors = this.normalizeShopRumors(this.game.player.shopRumors);
        return this.game.player.shopRumors;
    }

    pushShopRumorHistory(entry) {
        if (typeof entry !== 'string' || !entry.trim()) return;
        const rumors = this.ensureShopRumors();
        rumors.history.push(entry.trim());
        rumors.history = rumors.history.slice(-6);
    }

    formatShopPrice(item = null) {
        if (!item) return '';
        const currency = item.currency || 'gold';
        const icon = this.game.getStrategicCurrencyIcon(currency);
        const label = this.game.getStrategicCurrencyLabel(currency);
        return `${icon} ${Math.max(0, Math.floor(Number(item.price) || 0))} ${label}`;
    }

    canAffordShopItem(item = null) {
        if (!item) return false;
        const price = Math.max(0, Math.floor(Number(item.price) || 0));
        return this.game.getStrategicCurrencyAmount(item.currency || 'gold') >= price;
    }

    spendShopPrice(item = null) {
        if (!item) return false;
        const price = Math.max(0, Math.floor(Number(item.price) || 0));
        const currency = item.currency || 'gold';
        if (this.game.getStrategicCurrencyAmount(currency) < price) return false;
        if (currency === 'insight') {
            this.game.player.heavenlyInsight -= price;
        } else if (currency === 'karma') {
            this.game.player.karma -= price;
        } else {
            this.game.player.gold -= price;
        }
        return true;
    }

    updateShopCurrencyDisplays() {
        const goldEl = document.getElementById('shop-gold-display');
        if (goldEl) goldEl.textContent = this.game.getStrategicCurrencyAmount('gold');
        const insightEl = document.getElementById('shop-insight-display');
        if (insightEl) insightEl.textContent = this.game.getStrategicCurrencyAmount('insight');
        const karmaEl = document.getElementById('shop-karma-display');
        if (karmaEl) karmaEl.textContent = this.game.getStrategicCurrencyAmount('karma');
        const subtitleEl = document.getElementById('shop-header-subtitle');
        if (subtitleEl) {
            const activeRumorText = this.getShopRumorSummaryText();
            subtitleEl.textContent = activeRumorText || '商贩会根据你的命途，拿出不同层级的交易。';
        }
    }

    getShopPriceMultiplier(scalePerRealm = 0.15) {
        const realm = this.game.player?.realm || 1;
        const endlessMods = this.game.isEndlessActive() ? this.game.getEndlessModifiers() : null;
        const vowEffects = this.game.player && typeof this.game.player.getRunVowEffects === 'function'
            ? this.game.player.getRunVowEffects()
            : {};
        let priceMult = 1 + Math.max(0, realm - 1) * scalePerRealm;
        if (endlessMods) {
            priceMult *= Math.max(0.75, Number(endlessMods.shopPriceMul) || 1);
        }
        priceMult *= Math.max(0.6, Number(vowEffects.shopPriceMul) || 1);
        return priceMult;
    }

    generateContractShopServices() {
        const priceMult = this.getShopPriceMultiplier(0.04);
        return [
            {
                id: 'forbiddenDraft',
                type: 'service',
                name: '逆命血契',
                icon: '🩸',
                desc: '失去 6 点生命上限，从 3 张稀有/史诗禁术卡中选择 1 张。',
                price: Math.max(1, Math.floor(1 * priceMult)),
                currency: 'karma',
                sold: false,
                riskLabel: '伤根基',
                tagLabel: '爆发成型'
            },
            {
                id: 'soulMortgage',
                type: 'service',
                name: '蚀寿抵押',
                icon: '⛓️',
                desc: '当前生命降至至多 70%，换取 3 场首回合灵力 +1、命环经验提升与灵石补给。',
                price: Math.max(1, Math.floor(1 * priceMult)),
                currency: 'karma',
                sold: false,
                riskLabel: '搏命加速',
                tagLabel: '滚雪球'
            },
            {
                id: 'doomIdol',
                type: 'service',
                name: '灾像供契',
                icon: '🗿',
                desc: '向牌组加入【心魔·疑心】，立即获得一件随机法宝与 80 灵石。',
                price: Math.max(1, Math.floor(2 * priceMult)),
                currency: 'karma',
                sold: false,
                riskLabel: '牌组污染',
                tagLabel: '法宝跃迁'
            }
        ];
    }

    generateRumorShopServices() {
        const priceMult = this.getShopPriceMultiplier(0.02);
        return [
            {
                id: 'rumorRareDraft',
                type: 'service',
                name: '稀曜签',
                icon: '📎',
                desc: '接下来 2 次战后卡牌奖励显著偏向稀有/史诗。',
                price: Math.max(1, Math.floor(1 * priceMult)),
                currency: 'insight',
                sold: false,
                tagLabel: '未来奖励'
            },
            {
                id: 'rumorTreasureTrail',
                type: 'service',
                name: '宝踪风声',
                icon: '🏺',
                desc: '接下来 2 次精英/Boss 结算提升法宝掉落概率。',
                price: Math.max(1, Math.floor(2 * priceMult)),
                currency: 'insight',
                sold: false,
                tagLabel: '战利强化'
            },
            {
                id: 'rumorUtilityRoute',
                type: 'service',
                name: '商路星引',
                icon: '🗺️',
                desc: '下一重天地图更偏向事件、商店、营地与观星节点，适合稳定修整。',
                price: Math.max(1, Math.floor(2 * priceMult)),
                currency: 'insight',
                sold: false,
                tagLabel: '路线倾向'
            },
            {
                id: 'rumorTrialRoute',
                type: 'service',
                name: '锋路谶语',
                icon: '⚔️',
                desc: '下一重天地图更偏向试炼、精英、锻炉与禁术节点，适合冒险爆发。',
                price: Math.max(1, Math.floor(2 * priceMult)),
                currency: 'insight',
                sold: false,
                tagLabel: '高压路线'
            }
        ];
    }

    generateShopCatalog() {
        const base = this.generateShopData();
        const rumors = this.ensureShopRumors();
        const runPathProfile = typeof this.game.getRunPathShopProfile === 'function' ? this.game.getRunPathShopProfile() : null;
        const baseSummary = runPathProfile
            ? `常规补给，当前命途「${runPathProfile.name}」还额外备了专供交易。`
            : '常规补给，使用灵石进行构筑修整。';
        const rumorSummary = rumors.nextRealmLabel
            ? `已锁定下一重天路线：${rumors.nextRealmLabel}`
            : (runPathProfile
                ? `花费天机锁定未来奖励与下一重天路线倾向。当前命途「${runPathProfile.name}」提供专属情报。`
                : '花费天机锁定未来奖励与下一重天路线倾向。');
        return {
            base: {
                id: 'base',
                icon: '🪙',
                label: '基础页',
                summary: baseSummary,
                cardTitle: '📜 卡牌出售',
                serviceTitle: '✨ 特殊服务',
                items: Array.isArray(base.items) ? base.items : [],
                services: this.game.injectRunPathShopServices(Array.isArray(base.services) ? base.services : [], 'base')
            },
            contract: {
                id: 'contract',
                icon: '🩸',
                label: '契约页',
                summary: `以业果换取高波动收益。当前业果：${this.game.getStrategicCurrencyAmount('karma')}。`,
                cardTitle: '🕯️ 禁术契据',
                serviceTitle: '🩸 高风险交易',
                items: [],
                services: this.generateContractShopServices()
            },
            rumor: {
                id: 'rumor',
                icon: '🔮',
                label: '传闻页',
                summary: rumorSummary,
                cardTitle: '🔍 情报锁定',
                serviceTitle: '📡 未来倾向',
                items: [],
                services: this.game.injectRunPathShopServices(this.generateRumorShopServices(), 'rumor')
            }
        };
    }

    syncActiveShopTab() {
        const catalog = this.game.shopCatalog && typeof this.game.shopCatalog === 'object' ? this.game.shopCatalog : this.generateShopCatalog();
        this.game.shopCatalog = catalog;
        const tabId = catalog[this.game.shopActiveTab] ? this.game.shopActiveTab : 'base';
        this.game.shopActiveTab = tabId;
        const tab = catalog[tabId];
        this.game.shopItems = Array.isArray(tab.items) ? tab.items : [];
        this.game.shopServices = Array.isArray(tab.services) ? tab.services : [];
        return tab;
    }

    switchShopTab(tabId = 'base') {
        if (!this.game.shopCatalog || !this.game.shopCatalog[tabId]) return;
        this.game.shopActiveTab = tabId;
        this.syncActiveShopTab();
        this.game.renderShop();
    }

    getShopRumorSummaryText() {
        const rumors = this.ensureShopRumors();
        const parts = [];
        if (rumors.rewardRareCharges > 0) {
            parts.push(`稀曜签剩余 ${rumors.rewardRareCharges} 次`);
        }
        if (rumors.treasureCharges > 0) {
            parts.push(`宝踪风声剩余 ${rumors.treasureCharges} 次`);
        }
        if (rumors.nextRealmLabel && rumors.nextRealmTarget) {
            parts.push(`第 ${rumors.nextRealmTarget} 重：${rumors.nextRealmLabel}`);
        }
        return parts.join(' ｜ ');
    }

    applyRunPathShopServiceEffect(service) {
        if (!service || typeof service !== 'object') return null;
        switch (service.id) {
            case 'runPathShatterOrder':
                if (typeof this.game.player.grantAdventureBuff === 'function') {
                    this.game.player.grantAdventureBuff('firstTurnEnergyBoostBattles', 2);
                    this.game.player.grantAdventureBuff('victoryGoldBoostBattles', 2);
                }
                Utils.showBattleLog('破命流军需：接下来 2 场战斗首回合灵力 +1，并提高胜利悬赏');
                this.game.showRewardModal('裂锋悬赏令生效', '接下来 2 场战斗：\n首回合灵力 +1，并获得胜利悬赏增益。', '🗡️');
                return true;
            case 'runPathBulwarkRation': {
                const healAmount = Math.max(12, Math.floor(this.game.player.maxHp * 0.2 * this.game.getEndlessHealingMultiplier()));
                this.game.player.heal(healAmount);
                if (typeof this.game.player.grantAdventureBuff === 'function') {
                    this.game.player.grantAdventureBuff('openingBlockBoostBattles', 2);
                    this.game.player.grantAdventureBuff('victoryHealBoostBattles', 1);
                }
                Utils.showBattleLog(`镇命流军需：恢复 ${healAmount} 生命，并补强护盾与医护`);
                this.game.showRewardModal('镇脉军需到位', `恢复 ${healAmount} 生命。\n接下来 2 场战斗开场护盾强化，并获得 1 层战后医护增益。`, '🛡️');
                return true;
            }
            case 'runPathInsightAtlas':
                if (typeof this.game.player.grantAdventureBuff === 'function') {
                    this.game.player.grantAdventureBuff('ringExpBoostBattles', 2);
                    this.game.player.grantAdventureBuff('firstTurnDrawBoostBattles', 1);
                }
                this.game.player.heavenlyInsight = this.game.getStrategicCurrencyAmount('insight') + 1;
                Utils.showBattleLog('窥命流校谱：命环经验增益生效，并额外获得 1 点天机');
                this.game.showRewardModal('窥盘校谱完成', '接下来 2 场战斗：命环经验额外提升。\n并获得 1 层首回合抽牌增益与 1 点天机。', '🔮');
                return true;
            case 'runPathShatterRumor': {
                const forecast = this.game.applyStrategicRouteForecast('runPathShatter');
                Utils.showBattleLog(`命途传闻锁定：第 ${this.game.player.realm + 1} 重更偏向${forecast.label}。`);
                this.game.showRewardModal('锋路断脉谶生效', `第 ${this.game.player.realm + 1} 重地图将更偏向${forecast.label}。`, forecast.icon || '⚔️');
                return true;
            }
            case 'runPathBulwarkRumor': {
                const forecast = this.game.applyStrategicRouteForecast('runPathBulwark');
                Utils.showBattleLog(`命途传闻锁定：第 ${this.game.player.realm + 1} 重更偏向${forecast.label}。`);
                this.game.showRewardModal('守脉安营录生效', `第 ${this.game.player.realm + 1} 重地图将更偏向${forecast.label}。`, forecast.icon || '🏕️');
                return true;
            }
            case 'runPathInsightRumor': {
                const forecast = this.game.applyStrategicRouteForecast('runPathInsight');
                Utils.showBattleLog(`命途传闻锁定：第 ${this.game.player.realm + 1} 重更偏向${forecast.label}。`);
                this.game.showRewardModal('裂隙观测志生效', `第 ${this.game.player.realm + 1} 重地图将更偏向${forecast.label}。`, forecast.icon || '🪞');
                return true;
            }
            default:
                return null;
        }
    }

    closeShop() {
        if (this.game.shopNode) {
            this.game.map.completeNode(this.game.shopNode);
            this.game.shopNode = null;
        }
        this.game.autoSave();
        this.game.showScreen('map-screen');
    }


}

if (typeof window !== 'undefined') {
    window.ShopManager = ShopManager;
}
