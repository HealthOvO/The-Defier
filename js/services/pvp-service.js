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

    getPvpDangerAxisLibrary() {
        const gameRef = (typeof game !== 'undefined' && game)
            ? game
            : ((typeof window !== 'undefined' && window.game) ? window.game : null);
        if (gameRef && typeof gameRef.getSharedDangerAxisLibrary === 'function') {
            const shared = gameRef.getSharedDangerAxisLibrary();
            if (shared && shared.burst && shared.attrition && shared.control && shared.execution) {
                return shared;
            }
        }
        return {
            burst: {
                id: 'burst',
                label: '先手爆发',
                summary: '第一拍与瞬时爆发惩罚偏高，若起手没稳住会迅速掉血。',
                counterplay: '优先留开场护盾、首拍减伤与速杀手段，别让第一轮失血滚雪球。',
                reserveGuidance: '首章前建议至少保留 1 次硬减伤、护盾翻盘点或低费止损牌。'
            },
            attrition: {
                id: 'attrition',
                label: '拉锯压强',
                summary: '敌方血量、护盾或跨章耐压更高，越拖越容易被资源税反超。',
                counterplay: '把恢复、补件与法宝节奏提早，避免在中盘因资源税断档。',
                reserveGuidance: '建议每重结束时都保留恢复与补件预算，不要把灵石和补件机会花空。'
            },
            control: {
                id: 'control',
                label: '控场税负',
                summary: '弱化、易伤与压制会持续放大失误成本，容错窗口更窄。',
                counterplay: '预留净化、免控或稳态护盾，避免在 debuff 回合里空过关键输出窗。',
                reserveGuidance: '建议保留净化、低费防御或灵契主动来专门吃掉压制回合。'
            },
            execution: {
                id: 'execution',
                label: '执行门槛',
                summary: '路线与节拍执行要求更高，一旦出牌顺序和资源预留失误就会被放大。',
                counterplay: '优先把当前回合题面答稳，再追求额外收益与高波动操作。',
                reserveGuidance: '建议先留好稳态回合与收束手段，再去拼高风险斩杀线。'
            }
        };
    },

    clampPvpDangerValue(value, min = 0, max = 100, fallbackValue = min) {
        const num = Number(value);
        if (!Number.isFinite(num)) return fallbackValue;
        return Math.max(min, Math.min(max, Math.round(num)));
    },

    normalizePVPDangerProfile(profile = null) {
        const axisLibrary = this.getPvpDangerAxisLibrary();
        const source = profile && typeof profile === 'object' ? profile : {};
        const axisMap = {};
        (Array.isArray(source.axes) ? source.axes : []).forEach((axis) => {
            if (!axis || typeof axis !== 'object' || !axis.id) return;
            axisMap[axis.id] = {
                id: String(axis.id || ''),
                label: String(axis.label || axisLibrary[axis.id]?.label || ''),
                value: this.clampPvpDangerValue(axis.value, 0, 100, 0)
            };
        });
        const orderedAxes = ['burst', 'attrition', 'control', 'execution'].map((axisId) => ({
            id: axisId,
            label: axisMap[axisId]?.label || axisLibrary[axisId].label,
            value: axisMap[axisId]?.value || 0
        }));
        const dominantAxis = orderedAxes.reduce((best, axis) => (axis.value > best.value ? axis : best), orderedAxes[0]);
        const tierId = String(source.tierId || 'controlled');
        const tierLabelMap = {
            controlled: '可控',
            medium: '中压',
            high: '高压',
            extreme: '极限'
        };
        return {
            index: this.clampPvpDangerValue(source.index, 0, 100, 0),
            tierId,
            tierLabel: String(source.tierLabel || tierLabelMap[tierId] || '可控'),
            dominantAxisId: String(source.dominantAxisId || dominantAxis.id || 'burst'),
            dominantAxisLabel: String(source.dominantAxisLabel || dominantAxis.label || axisLibrary.burst.label),
            summary: String(source.summary || ''),
            counterplay: String(source.counterplay || ''),
            reserveGuidance: String(source.reserveGuidance || ''),
            line: String(source.line || ''),
            brief: String(source.brief || ''),
            note: String(source.note || ''),
            confidence: String(source.confidence || 'estimated'),
            confidenceLabel: String(source.confidenceLabel || '榜单推演'),
            tags: Array.isArray(source.tags)
                ? source.tags
                    .filter((tag) => typeof tag === 'string' && tag.trim())
                    .slice(0, 4)
                : [],
            scoreGap: Number.isFinite(Number(source.scoreGap)) ? Number(source.scoreGap) : 0,
            realmGap: Number.isFinite(Number(source.realmGap)) ? Number(source.realmGap) : 0,
            opponent: source.opponent && typeof source.opponent === 'object'
                ? {
                    name: String(source.opponent.name || ''),
                    score: Math.max(0, Math.floor(Number(source.opponent.score) || 0)),
                    realm: Math.max(1, Math.floor(Number(source.opponent.realm) || 1)),
                    division: String(source.opponent.division || ''),
                    archetypeLabel: String(source.opponent.archetypeLabel || ''),
                    guardianFormation: !!source.opponent.guardianFormation,
                    sourceType: String(source.opponent.sourceType || 'estimated')
                }
                : null,
            axes: orderedAxes
        };
    },

    getPvpResultReview({ didWin = true, dangerProfile = null, ratingDelta = 0, coinsAwarded = 0, opponent = null } = {}) {
        const profile = this.normalizePVPDangerProfile(dangerProfile);
        const fallbackOpponent = opponent && typeof opponent === 'object'
            ? {
                name: opponent.user && opponent.user.username ? String(opponent.user.username) : String(opponent.name || '未知对手'),
                score: Math.max(0, Math.floor(Number(opponent.score) || 0)),
                realm: Math.max(1, Math.floor(Number(opponent.realm) || 1)),
                division: String(opponent.division || this.getDivisionByScore(Number(opponent.score) || 1000)),
                archetypeLabel: String(opponent.archetypeLabel || ''),
                guardianFormation: !!opponent.guardianFormation,
                sourceType: String(opponent.sourceType || '')
            }
            : null;
        const safeOpponent = profile.opponent || fallbackOpponent || {
            name: '未知对手',
            score: 1000,
            realm: 1,
            division: this.getDivisionByScore(1000),
            archetypeLabel: '',
            guardianFormation: false,
            sourceType: profile.confidence || 'estimated'
        };
        const rating = Math.trunc(Number(ratingDelta) || 0);
        const coins = Math.max(0, Math.floor(Number(coinsAwarded) || 0));
        const highPressure = profile.index >= 60 || profile.tierId === 'high' || profile.tierId === 'extreme';
        const moderatePressure = !highPressure && (profile.index >= 42 || profile.tierId === 'medium');

        let verdictLabel = '稳态收分';
        let summary = `本场题面以 ${profile.dominantAxisLabel} 为主轴，当前结算可据此回看自己的读题与资源预留。`;
        let focusTitle = didWin ? '压中题眼' : '先修短板';
        let focusText = didWin ? profile.counterplay : `优先回看：${profile.counterplay}`;
        let nextTitle = didWin ? '下一把' : '补课点';
        let nextText = profile.reserveGuidance;

        if (didWin) {
            if (highPressure) {
                verdictLabel = '越压破局';
                summary = `面对 ${profile.tierLabel} 的 ${profile.dominantAxisLabel} 题面仍能拿下，说明当前构筑已经具备越压破局能力。`;
                focusText = `赢点在于你没有被 ${profile.dominantAxisLabel} 的第一波税负带崩，关键读法仍是：${profile.counterplay}`;
                nextText = `继续保留这条优势，但别把止损与收束拆得太散。${profile.reserveGuidance}`;
            } else if (moderatePressure) {
                verdictLabel = '稳中夺势';
                summary = `这把属于可读可解的中压题面，你把节拍和资源预留都答对了，所以能稳定收分。`;
                focusText = `当前最值钱的仍是这条对策：${profile.counterplay}`;
                nextText = `下一把可以继续沿用同样的读法，重点守住：${profile.reserveGuidance}`;
            } else {
                verdictLabel = '按卷收分';
                summary = `这把不算极限题，但你没有因为题面可控就随意贪线，稳稳把该拿的分数收入囊中。`;
                focusText = `保持这条基本功即可：${profile.counterplay}`;
                nextText = `接下来可以开始上探更高榜位，同时继续做到：${profile.reserveGuidance}`;
            }
        } else if (highPressure) {
            verdictLabel = '高压失手';
            summary = `本场本就是 ${profile.tierLabel} 题面，失手并不完全等于数值落后，更多是 ${profile.dominantAxisLabel} 把容错税放大了。`;
            focusText = `下次先把这条硬题答稳：${profile.counterplay}`;
            nextText = `补课重点不是硬拼收益，而是提前留够：${profile.reserveGuidance}`;
        } else if (moderatePressure) {
            verdictLabel = '换段失拍';
            summary = `这把更像是中压题面里的节拍失误，而不是单纯被数值碾压；修正留牌与回合顺序会更划算。`;
            focusText = `先修这个环节：${profile.counterplay}`;
            nextText = `下把进场前优先准备：${profile.reserveGuidance}`;
        } else {
            verdictLabel = '细节失误';
            summary = `本场题面并不算极端，说明主要差在读题落点或资源顺序，属于能很快补回来的失误。`;
            focusText = `先把这条基本对策练熟：${profile.counterplay}`;
            nextText = `以后默认保留：${profile.reserveGuidance}`;
        }

        const subtitleParts = [
            safeOpponent.division || this.getDivisionByScore(safeOpponent.score),
            `第${Math.max(1, Math.floor(Number(safeOpponent.realm) || 1))}层`
        ];
        if (safeOpponent.archetypeLabel) subtitleParts.push(safeOpponent.archetypeLabel);
        const economyParts = [`道韵 ${rating >= 0 ? `+${rating}` : `${rating}`}`];
        if (coins > 0) economyParts.push(`天道币 +${coins}`);
        if (safeOpponent.name) economyParts.push(`对手 ${safeOpponent.name}`);

        return {
            outcomeId: didWin ? 'victory' : 'defeat',
            verdictLabel,
            kicker: didWin ? '胜场复盘' : '败场复盘',
            title: `${verdictLabel} · ${safeOpponent.name || '本局复盘'}`,
            subtitle: subtitleParts.join(' · '),
            chipText: `DRI ${profile.index} · ${profile.tierLabel}`,
            chipTierId: profile.tierId || 'controlled',
            summary,
            focusTitle,
            focusText,
            nextTitle,
            nextText,
            economyLine: economyParts.join(' · '),
            dangerLine: profile.line || `PVP 压强 DRI ${profile.index} / 100 · ${profile.tierLabel}`,
            tags: [
                profile.dominantAxisLabel,
                safeOpponent.archetypeLabel,
                safeOpponent.division
            ].filter(Boolean).slice(0, 3),
            dangerProfile: profile
        };
    },

    getDivisionDifficultyValue(division = null) {
        const scoreMap = {
            '潜龙榜': 10,
            '问道榜': 22,
            '凌霄榜': 34,
            '天穹榜': 46
        };
        const resolvedDivision = division || this.getDivisionByScore(1000);
        return scoreMap[resolvedDivision] || scoreMap['潜龙榜'];
    },

    getPvpArchetypeMeta(label = null) {
        const normalized = String(label || 'balanced').toLowerCase();
        if (normalized === 'aggressive' || normalized === 'slaughter' || normalized === 'assault') {
            return {
                id: 'aggressive',
                label: '先手斩压',
                burstBonus: 18,
                attritionBonus: 2,
                controlBonus: 4,
                executionBonus: 10,
                defaultMix: { attack: 6, defense: 2, utility: 2 }
            };
        }
        if (normalized === 'fortified' || normalized === 'longevity' || normalized === 'bulwark') {
            return {
                id: 'fortified',
                label: '厚阵续压',
                burstBonus: 2,
                attritionBonus: 18,
                controlBonus: 10,
                executionBonus: 6,
                defaultMix: { attack: 2, defense: 5, utility: 3 }
            };
        }
        if (normalized === 'control' || normalized === 'oracle') {
            return {
                id: 'control',
                label: '牵制控场',
                burstBonus: 4,
                attritionBonus: 8,
                controlBonus: 20,
                executionBonus: 10,
                defaultMix: { attack: 2, defense: 3, utility: 5 }
            };
        }
        return {
            id: 'balanced',
            label: '均衡试探',
            burstBonus: 8,
            attritionBonus: 8,
            controlBonus: 10,
            executionBonus: 10,
            defaultMix: { attack: 3, defense: 3, utility: 4 }
        };
    },

    hashPvpPreviewSeed(value = '') {
        const text = String(value || 'pvp-preview');
        let hash = 2166136261;
        for (let i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return Math.abs(hash >>> 0);
    },

    estimatePvpSnapshotFromRank(rank = null, context = {}) {
        const safeRank = rank && typeof rank === 'object'
            ? rank
            : this.getDefaultLocalRank();
        const division = safeRank.division || this.getDivisionByScore(Number(safeRank.score) || 1000);
        const myScore = Math.max(0, Number(context.myScore) || 1000);
        const myRealm = Math.max(1, Math.floor(Number(context.myRealm) || 1));
        const seed = this.hashPvpPreviewSeed([
            safeRank.objectId || '',
            safeRank.user && safeRank.user.objectId ? safeRank.user.objectId : '',
            safeRank.user && safeRank.user.username ? safeRank.user.username : '',
            safeRank.score || 0,
            safeRank.realm || 1,
            division,
            context.listIndex || 0
        ].join('|'));
        const scoreGap = (Number(safeRank.score) || 1000) - myScore;
        const realmGap = Math.max(0, (Number(safeRank.realm) || 1) - myRealm);

        let style = ['balanced', 'aggressive', 'fortified'][seed % 3];
        if (scoreGap >= 80) style = 'aggressive';
        else if (realmGap >= 1 || division === '天穹榜') style = seed % 2 === 0 ? 'fortified' : 'balanced';

        const personality = style === 'aggressive'
            ? 'slaughter'
            : (style === 'fortified' ? 'longevity' : 'balanced');
        const personalityRules = personality === 'slaughter'
            ? { damageMul: 1.2, takenMul: 1.1, regenEnergyPerTurn: 0, hpMul: 1.0 }
            : (personality === 'longevity'
                ? { damageMul: 0.85, takenMul: 0.95, regenEnergyPerTurn: 0, hpMul: 1.3 }
                : { damageMul: 1.0, takenMul: 1.0, regenEnergyPerTurn: 1, hpMul: 1.0 });
        const guardianFormation = style !== 'aggressive'
            ? seed % 2 === 0
            : seed % 5 === 0;
        const realm = Math.max(1, Math.floor(Number(safeRank.realm) || 1));
        const maxHp = 90 + realm * 4 + (style === 'fortified' ? 16 : (style === 'balanced' ? 8 : 0));
        const energy = 3 + (style === 'aggressive' ? 1 : 0) + (division === '天穹榜' ? 1 : 0);
        return {
            style,
            personality,
            guardianFormation,
            confidence: 'estimated',
            confidenceLabel: '榜单推演',
            battleData: this.normalizeBattleData({
                me: {
                    maxHp,
                    energy,
                    currEnergy: energy
                },
                deck: this.getPracticeDeck(style, realm),
                aiProfile: style,
                deckArchetype: style,
                ruleVersion: this.ruleVersion,
                personalityRules
            })
        };
    },

    getDeckRoleWeights(deck = [], preferredArchetype = 'balanced') {
        const counts = { attack: 0, defense: 0, utility: 0 };
        (Array.isArray(deck) ? deck : []).forEach((card) => {
            const cardId = typeof card === 'string' ? card : card && card.id;
            const cardDef = (typeof CARDS !== 'undefined' && cardId) ? CARDS[cardId] : null;
            const type = cardDef && cardDef.type ? cardDef.type : null;
            if (type === 'attack') counts.attack += 1;
            else if (type === 'defense') counts.defense += 1;
            else counts.utility += 1;
        });
        let total = counts.attack + counts.defense + counts.utility;
        if (total <= 0) {
            const fallback = this.getPvpArchetypeMeta(preferredArchetype).defaultMix;
            counts.attack = fallback.attack;
            counts.defense = fallback.defense;
            counts.utility = fallback.utility;
            total = counts.attack + counts.defense + counts.utility;
        }
        return {
            attack: counts.attack,
            defense: counts.defense,
            utility: counts.utility,
            total,
            attackRate: counts.attack / total,
            defenseRate: counts.defense / total,
            utilityRate: counts.utility / total
        };
    },

    getPVPDangerProfile(opponentSource = null, context = {}) {
        if (
            opponentSource
            && typeof opponentSource === 'object'
            && opponentSource.axes
            && opponentSource.dominantAxisId
        ) {
            return this.normalizePVPDangerProfile(opponentSource);
        }

        const axisLibrary = this.getPvpDangerAxisLibrary();
        const source = opponentSource && typeof opponentSource === 'object' ? opponentSource : {};
        const rank = source.rank
            || (source.opponent && source.opponent.rank)
            || ((source.user || source.score || source.division) ? source : null)
            || null;
        const ghost = source.ghost || (source.opponent && source.opponent.ghost) || null;
        const nestedBattleData = source.battleData || source.data || (source.opponent && source.opponent.battleData) || null;
        const myRank = context.myRank
            || this.currentRankData
            || this.loadLocalRank();
        const myScore = Math.max(0, Number(
            context.myScore !== undefined ? context.myScore : (myRank && myRank.score)
        ) || 1000);
        const myRealm = Math.max(1, Math.floor(Number(
            context.myRealm !== undefined ? context.myRealm : (myRank && myRank.realm)
        ) || 1));
        const safeRank = rank && typeof rank === 'object'
            ? {
                objectId: rank.objectId || `pvp-rank-${Date.now()}`,
                user: rank.user && typeof rank.user === 'object'
                    ? {
                        objectId: rank.user.objectId || 'unknown-user',
                        username: rank.user.username || '未知对手'
                    }
                    : { objectId: 'unknown-user', username: '未知对手' },
                score: Math.max(0, Math.floor(Number(rank.score) || 1000)),
                realm: Math.max(1, Math.floor(Number(rank.realm) || 1)),
                division: rank.division || this.getDivisionByScore(Number(rank.score) || 1000)
            }
            : this.getDefaultLocalRank();
        const estimatedSnapshot = (!nestedBattleData || !nestedBattleData.me)
            ? this.estimatePvpSnapshotFromRank(safeRank, { myScore, myRealm, listIndex: context.listIndex || 0 })
            : null;
        const battleData = this.normalizeBattleData(
            nestedBattleData && typeof nestedBattleData === 'object'
                ? nestedBattleData
                : (estimatedSnapshot ? estimatedSnapshot.battleData : {})
        );
        const config = ghost && ghost.config && typeof ghost.config === 'object'
            ? ghost.config
            : {};
        const derivedProfile = battleData.aiProfile || battleData.deckArchetype || config.personality || (estimatedSnapshot && estimatedSnapshot.style) || 'balanced';
        const archetypeMeta = this.getPvpArchetypeMeta(derivedProfile);
        const roleWeights = this.getDeckRoleWeights(battleData.deck, derivedProfile);
        const personalityRules = battleData.personalityRules && typeof battleData.personalityRules === 'object'
            ? battleData.personalityRules
            : null;
        const guardianFormation = !!(
            config.guardianFormation
            || (estimatedSnapshot && estimatedSnapshot.guardianFormation)
        );
        const confidence = estimatedSnapshot ? estimatedSnapshot.confidence : 'resolved';
        const confidenceLabel = estimatedSnapshot ? estimatedSnapshot.confidenceLabel : '残影实测';
        const scoreGap = safeRank.score - myScore;
        const realmGap = safeRank.realm - myRealm;
        const divisionDifficulty = this.getDivisionDifficultyValue(safeRank.division);
        const burstValue = this.clampPvpDangerValue(
            18
            + divisionDifficulty * 0.34
            + Math.max(0, scoreGap) * 0.07
            + Math.max(0, realmGap) * 5
            + roleWeights.attackRate * 34
            + (Math.max(1, Number(battleData.me.energy) || 3) - 3) * 7
            + archetypeMeta.burstBonus
            + Math.max(0, ((personalityRules && Number(personalityRules.damageMul)) || 1) - 1) * 70,
            0,
            100
        );
        const attritionValue = this.clampPvpDangerValue(
            16
            + divisionDifficulty * 0.36
            + Math.max(0, Math.floor(Number(battleData.me.maxHp) || 100) - 90) * 0.38
            + roleWeights.defenseRate * 34
            + roleWeights.utilityRate * 8
            + archetypeMeta.attritionBonus
            + (guardianFormation ? 6 : 0)
            + Math.max(0, ((personalityRules && Number(personalityRules.hpMul)) || 1) - 1) * 52,
            0,
            100
        );
        const controlValue = this.clampPvpDangerValue(
            14
            + divisionDifficulty * 0.28
            + roleWeights.utilityRate * 40
            + archetypeMeta.controlBonus
            + (guardianFormation ? 18 : 0)
            + Math.max(0, Math.floor(Number(personalityRules && personalityRules.regenEnergyPerTurn) || 0)) * 6
            + (confidence === 'estimated' ? 5 : 0),
            0,
            100
        );
        const executionValue = this.clampPvpDangerValue(
            15
            + divisionDifficulty * 0.42
            + Math.max(0, scoreGap) * 0.05
            + Math.max(0, realmGap) * 4
            + Math.max(8, Math.floor(Number(roleWeights.total) || 8)) * 0.9
            + archetypeMeta.executionBonus
            + (guardianFormation ? 4 : 0)
            + (confidence === 'estimated' ? 6 : 2),
            0,
            100
        );
        const axes = [
            { id: 'burst', label: axisLibrary.burst.label, value: burstValue },
            { id: 'attrition', label: axisLibrary.attrition.label, value: attritionValue },
            { id: 'control', label: axisLibrary.control.label, value: controlValue },
            { id: 'execution', label: axisLibrary.execution.label, value: executionValue }
        ];
        const dominantAxis = axes.reduce((best, axis) => (axis.value > best.value ? axis : best), axes[0]);
        const axisAverage = axes.reduce((sum, axis) => sum + axis.value, 0) / Math.max(1, axes.length);
        const index = this.clampPvpDangerValue(
            18
            + axisAverage * 0.58
            + dominantAxis.value * 0.14
            + divisionDifficulty * 0.26
            + Math.max(0, scoreGap) * 0.015
            + Math.max(0, realmGap) * 1.6,
            0,
            100
        );
        let tierId = 'controlled';
        let tierLabel = '可控';
        if (index >= 75) {
            tierId = 'extreme';
            tierLabel = '极限';
        } else if (index >= 60) {
            tierId = 'high';
            tierLabel = '高压';
        } else if (index >= 42) {
            tierId = 'medium';
            tierLabel = '中压';
        }

        const contextSignals = [];
        if (scoreGap > 0) contextSignals.push(`榜差 +${scoreGap}`);
        else if (scoreGap < 0) contextSignals.push(`榜差 ${scoreGap}`);
        if (realmGap > 0) contextSignals.push(`境界 +${realmGap}`);
        if (guardianFormation) contextSignals.push('护山阵已启');
        contextSignals.push(archetypeMeta.label);
        const tags = [
            safeRank.division || this.getDivisionByScore(safeRank.score),
            archetypeMeta.label,
            guardianFormation ? '守阵镜像' : '',
            scoreGap >= 60 ? '高榜压制' : (scoreGap <= -40 ? '可主动抢节奏' : '同段细局')
        ].filter(Boolean).slice(0, 4);
        const dominantMeta = axisLibrary[dominantAxis.id] || axisLibrary.burst;
        let counterplay = dominantMeta.counterplay;
        if (guardianFormation && dominantAxis.id !== 'control') {
            counterplay += ' 对手已启护山阵，别把破盾、净化与收头拆得太散。';
        }
        if (dominantAxis.id === 'burst' && scoreGap >= 60) {
            counterplay += ' 榜差偏高时更要把首拍硬减伤和速解留在手里。';
        } else if (dominantAxis.id === 'attrition' && Number(battleData.me.maxHp || 0) >= 115) {
            counterplay += ' 对手血线较厚，优先规划稳定收益与跨回合续航。';
        } else if (dominantAxis.id === 'execution' && scoreGap > 0) {
            counterplay += ' 面对高榜位对手时，先把必做题面答稳，再考虑额外贪分。';
        }

        let reserveGuidance = dominantMeta.reserveGuidance;
        if (guardianFormation) {
            reserveGuidance += ' 额外预留一次破阵或稳态净化窗口。';
        }
        if (confidence === 'estimated') {
            reserveGuidance += ' 这份推演来自榜单估算，真正开战前再留一拍修正空间。';
        }

        const summary = `${confidenceLabel}显示 ${dominantMeta.label} 偏高：${dominantMeta.summary}${contextSignals.length > 0 ? ` 当前信号：${contextSignals.join(' / ')}。` : ''}`;
        const note = confidence === 'estimated'
            ? '榜单推演基于榜位、境界与套路估算，最终匹配结果可能不同。'
            : '已按当前残影快照推演本场对局风险，可直接拿来读题。';
        return this.normalizePVPDangerProfile({
            index,
            tierId,
            tierLabel,
            dominantAxisId: dominantAxis.id,
            dominantAxisLabel: dominantMeta.label,
            summary,
            counterplay,
            reserveGuidance,
            line: `PVP 压强 DRI ${index} / 100 · ${tierLabel} · 主轴 ${dominantMeta.label}`,
            brief: `${dominantMeta.label}偏高`,
            note,
            confidence,
            confidenceLabel,
            tags,
            scoreGap,
            realmGap,
            opponent: {
                name: safeRank.user && safeRank.user.username ? safeRank.user.username : '未知对手',
                score: safeRank.score,
                realm: safeRank.realm,
                division: safeRank.division || this.getDivisionByScore(safeRank.score),
                archetypeLabel: archetypeMeta.label,
                guardianFormation,
                sourceType: confidence
            },
            axes
        });
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

    normalizeFocusRank(rawRank = null) {
        const fallback = this.getDefaultLocalRank();
        const src = rawRank && typeof rawRank === 'object' ? rawRank : {};
        const safeUser = src.user && typeof src.user === 'object'
            ? {
                objectId: src.user.objectId || fallback.user.objectId,
                username: src.user.username || fallback.user.username
            }
            : {
                objectId: src.userId || fallback.user.objectId,
                username: src.username || fallback.user.username
            };
        const score = Math.max(0, Math.floor(Number(src.score) || fallback.score));
        const realm = Math.max(1, Math.floor(Number(src.realm) || fallback.realm));
        const objectId = src.objectId
            || `focus-rank-${this.hashPvpPreviewSeed([
                safeUser.objectId,
                safeUser.username,
                score,
                realm
            ].join('|')).toString(16)}`;
        return {
            objectId,
            user: safeUser,
            score,
            realm,
            division: src.division || this.getDivisionByScore(score),
            isLocal: !!src.isLocal
        };
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
            matchHistory: [],
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
        const matchHistory = Array.isArray(src.matchHistory)
            ? src.matchHistory
                .filter((it) => it && typeof it === 'object')
                .slice(-24)
                .map((it) => this.normalizeMatchHistoryEntry(it))
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
            matchHistory,
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

    normalizeMatchHistoryEntry(entry) {
        const axisLibrary = this.getPvpDangerAxisLibrary();
        const src = entry && typeof entry === 'object' ? entry : {};
        const dominantAxisId = String(src.dominantAxisId || 'burst');
        const dominantAxisLabel = String(src.dominantAxisLabel || (axisLibrary[dominantAxisId] && axisLibrary[dominantAxisId].label) || axisLibrary.burst.label);
        return {
            seasonId: String(src.seasonId || ''),
            seasonName: String(src.seasonName || ''),
            opponentRankId: String(src.opponentRankId || ''),
            opponentUserId: String(src.opponentUserId || ''),
            opponentName: String(src.opponentName || '未知对手'),
            opponentDivision: String(src.opponentDivision || this.getDivisionByScore(Number(src.opponentScore) || 1000)),
            opponentRealm: Math.max(1, Math.floor(Number(src.opponentRealm) || 1)),
            didWin: !!src.didWin,
            verdictLabel: String(src.verdictLabel || ''),
            ratingDelta: Math.trunc(Number(src.ratingDelta) || 0),
            coinsAwarded: Math.max(0, Math.floor(Number(src.coinsAwarded) || 0)),
            dangerIndex: this.clampPvpDangerValue(src.dangerIndex, 0, 100, 0),
            dangerTierId: String(src.dangerTierId || 'controlled'),
            dangerTierLabel: String(src.dangerTierLabel || '可控'),
            dominantAxisId,
            dominantAxisLabel,
            engagementId: String(src.engagementId || ''),
            engagementLabel: String(src.engagementLabel || ''),
            modeId: String(src.modeId || ''),
            modeLabel: String(src.modeLabel || ''),
            sourceType: String(src.sourceType || ''),
            archetypeLabel: String(src.archetypeLabel || ''),
            segmentLabel: String(src.segmentLabel || ''),
            comparisonValue: String(src.comparisonValue || ''),
            at: Math.max(0, Math.floor(Number(src.at) || Date.now()))
        };
    },

    getRecentMatchHistory(limit = 8, state = null) {
        const economy = state ? this.normalizeEconomyState(state) : this.loadEconomyState();
        const cap = Math.max(1, Math.min(24, Math.floor(Number(limit) || 8)));
        return (economy.matchHistory || []).slice(-cap).reverse();
    },

    appendMatchHistory(economyState, entry) {
        const state = this.normalizeEconomyState(economyState);
        const history = Array.isArray(state.matchHistory) ? state.matchHistory.slice(-23) : [];
        history.push(this.normalizeMatchHistoryEntry(entry));
        return {
            ...state,
            matchHistory: history
        };
    },

    formatPvpHistoryTime(timestamp = 0) {
        const date = new Date(Math.max(0, Number(timestamp) || 0));
        if (Number.isNaN(date.getTime())) return '刚刚';
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');
        return `${month}/${day} ${hour}:${minute}`;
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

    getRatingDeltaPreview(opponentRating = 1000, options = {}) {
        const myRating = Math.max(
            0,
            Number(
                options.myRating
                || options.myScore
                || (this.currentRankData && this.currentRankData.score)
                || 1000
            ) || 1000
        );
        const safeOpponentRating = Math.max(100, Number(opponentRating) || 1000);
        const calculate = (result) => {
            if (typeof EloCalculator !== 'undefined' && EloCalculator && typeof EloCalculator.calculate === 'function') {
                const res = EloCalculator.calculate(myRating, safeOpponentRating, result);
                return Math.trunc(Number(res && res.delta) || 0);
            }
            return result ? 20 : -20;
        };
        return {
            myRating,
            opponentRating: safeOpponentRating,
            winDelta: calculate(1),
            lossDelta: calculate(0)
        };
    },

    getFocusDuelSlip(focusSource = null, options = {}) {
        const source = focusSource && typeof focusSource === 'object' ? focusSource : {};
        const rank = this.normalizeFocusRank(source.rank || source);
        const myRank = options.myRank && typeof options.myRank === 'object'
            ? options.myRank
            : (this.currentRankData || this.loadLocalRank());
        const myScore = Math.max(0, Number(options.myScore !== undefined ? options.myScore : (myRank && myRank.score)) || 1000);
        const myRealm = Math.max(1, Math.floor(Number(options.myRealm !== undefined ? options.myRealm : (myRank && myRank.realm)) || 1));
        const dangerProfile = source.dangerProfile
            ? this.normalizePVPDangerProfile(source.dangerProfile)
            : this.getPVPDangerProfile({ rank }, { myRank, myScore, myRealm });
        const ratingPreview = this.getRatingDeltaPreview(rank.score, { myRating: myScore });
        const winPreview = this.getRewardPreview(true, rank.score);
        const lossPreview = this.getRewardPreview(false, rank.score);
        const scoreGap = Math.trunc(Number(dangerProfile.scoreGap) || (rank.score - myScore));
        const realmGap = Math.trunc(Number(dangerProfile.realmGap) || (rank.realm - myRealm));
        const hasTargetedOnline = this.isOnlinePvpAvailable() && !rank.isLocal && !options.forcePractice;

        let engagementId = 'drill';
        let engagementLabel = '练手';
        let engagementLine = '题面可读且收益稳定，适合验证起手、留牌与节拍，不必一开始就重压梭哈。';
        if (dangerProfile.index >= 72 && (scoreGap >= 90 || realmGap >= 1 || dangerProfile.tierId === 'extreme')) {
            engagementId = 'avoid';
            engagementLabel = '避战';
            engagementLine = `这名对手的 ${dangerProfile.dominantAxisLabel} 压强偏高，除非你已经备齐硬解与净化链，否则更适合作为读题样本。`;
        } else if (scoreGap >= 40 || realmGap > 0 || dangerProfile.tierId === 'high') {
            engagementId = 'push';
            engagementLabel = '冲榜';
            engagementLine = `榜位更高、胜场收益更厚，适合带着止损与收束一口气往上冲；关键仍是先答稳 ${dangerProfile.dominantAxisLabel}。`;
        }

        const modeId = hasTargetedOnline ? 'targeted-online' : 'practice-mirror';
        const modeLabel = hasTargetedOnline ? '榜位直约' : '镜像演武';
        const modeLine = hasTargetedOnline
            ? (dangerProfile.confidence === 'resolved'
                ? '将优先锁定该榜位已解析的防守残影。'
                : '将优先锁定该榜位；若对手未留残影，则自动回退为镜像演武。')
            : '将按当前焦点目标生成同榜位镜像，不会跳去随机陌生对手。';

        const formatSigned = (value) => {
            const num = Math.trunc(Number(value) || 0);
            return num >= 0 ? `+${num}` : `${num}`;
        };

        return {
            targetName: rank.user && rank.user.username ? String(rank.user.username) : '未知修士',
            targetRankId: rank.objectId || '',
            targetUserId: rank.user && rank.user.objectId ? String(rank.user.objectId) : '',
            targetDivision: rank.division || this.getDivisionByScore(rank.score),
            targetRealm: rank.realm,
            engagementId,
            engagementLabel,
            engagementLine,
            modeId,
            modeLabel,
            modeLine,
            confidence: dangerProfile.confidence || 'estimated',
            confidenceLabel: dangerProfile.confidenceLabel || '榜单推演',
            winRewardText: `天道币 +${winPreview.totalReward} ｜ 道韵约 ${formatSigned(ratingPreview.winDelta)}`,
            lossRewardText: `天道币 +${lossPreview.totalReward} ｜ 道韵约 ${formatSigned(ratingPreview.lossDelta)}`,
            reserveText: dangerProfile.reserveGuidance || '保留一次稳态回合与止损手段。',
            counterplayText: dangerProfile.counterplay || '优先把当前题面读稳，再考虑上限线。',
            cautionText: dangerProfile.summary || '',
            chipText: `DRI ${dangerProfile.index} · ${dangerProfile.tierLabel}`,
            tags: [engagementLabel, modeLabel, dangerProfile.dominantAxisLabel].filter(Boolean).slice(0, 3),
            rewardPreview: {
                winCoins: Math.max(0, Math.floor(Number(winPreview.totalReward) || 0)),
                lossCoins: Math.max(0, Math.floor(Number(lossPreview.totalReward) || 0)),
                winRatingDelta: Math.trunc(Number(ratingPreview.winDelta) || 0),
                lossRatingDelta: Math.trunc(Number(ratingPreview.lossDelta) || 0)
            }
        };
    },

    getPvpSeasonSegmentMeta({ rank = null, dangerProfile = null, duelBrief = null, scoreGap = 0, realmGap = 0, guardianFormation = false } = {}) {
        const profile = this.normalizePVPDangerProfile(dangerProfile);
        const brief = duelBrief && typeof duelBrief === 'object' ? duelBrief : {};
        const safeRank = this.normalizeFocusRank(rank || {});
        const seasonMeta = this.getCurrentSeasonMeta();
        const targetDivision = safeRank.division || this.getDivisionByScore(safeRank.score);
        const targetRealm = Math.max(1, Math.floor(Number(safeRank.realm) || 1));
        const phaseLabel = scoreGap >= 60
            ? '高榜压制'
            : (scoreGap <= -40 ? '可主动抢节奏' : '同段细局');
        const engagementLabel = brief.engagementLabel || '练手';

        let segmentLabel = '同段拆卷';
        let segmentDetail = '同段位细局更看首拍、留牌与收束，不必把整手资源一次性压空。';
        if (brief.engagementId === 'avoid' || profile.tierId === 'extreme') {
            segmentLabel = '守段避险';
            segmentDetail = `这档对手更像守段题面，先守住失分与掉段风险，再找 ${profile.dominantAxisLabel} 的反打窗口。`;
        } else if (brief.engagementId === 'push' && (scoreGap >= 60 || realmGap > 0)) {
            segmentLabel = '越段抢分';
            segmentDetail = `这是典型的跨段抢分卷，胜场收益更厚，但首拍与止损税也会继续放大 ${profile.dominantAxisLabel}。`;
        } else if (guardianFormation || profile.dominantAxisId === 'attrition') {
            segmentLabel = '阵地细局';
            segmentDetail = '这类题面更容易拖进阵地战，适合按护盾、净化与补件节奏去拆。';
        }

        return {
            seasonName: seasonMeta.name || '常驻赛季',
            seasonValue: `${seasonMeta.name || '常驻赛季'} · ${targetDivision} · 第${targetRealm}层`,
            seasonDetail: `${phaseLabel} · ${profile.dominantAxisLabel} · ${engagementLabel}线`,
            phaseLabel,
            segmentLabel,
            stageValue: `${segmentLabel} · ${phaseLabel}`,
            stageLine: `${seasonMeta.name || '当前赛季'}里，这类 ${engagementLabel} 题面会继续放大 ${profile.dominantAxisLabel} 的读题税。 ${segmentDetail}`
        };
    },

    getPvpRankingComparisonMeta({ rankId = '', dangerProfile = null, listContext = [] } = {}) {
        const formatSigned = (value) => {
            const num = Math.trunc(Number(value) || 0);
            return num >= 0 ? `+${num}` : `${num}`;
        };
        const profile = this.normalizePVPDangerProfile(dangerProfile);
        const currentId = String(rankId || '');
        const pool = (Array.isArray(listContext) ? listContext : [])
            .map((entry) => {
                const safeProfile = entry && entry.dangerProfile ? this.normalizePVPDangerProfile(entry.dangerProfile) : null;
                if (!safeProfile) return null;
                return {
                    rankId: String(entry.rankId || (entry.rank && entry.rank.objectId) || ''),
                    profile: safeProfile
                };
            })
            .filter(Boolean);
        const comparePool = pool.filter((entry) => entry.rankId && entry.rankId !== currentId);
        const samples = comparePool.length > 0 ? comparePool : pool;
        if (!samples.length) {
            return {
                value: '缺少榜均对照',
                line: '当前榜单样本不足，先按这份档案完成读题；后续再通过切换更多目标补横向比较。',
                shortTag: '样本待补',
                indexDelta: 0,
                axisLabel: profile.dominantAxisLabel || '先手爆发',
                axisDelta: 0
            };
        }

        const avgIndex = samples.reduce((sum, entry) => sum + (entry.profile.index || 0), 0) / samples.length;
        const axisAverages = (profile.axes || []).reduce((acc, axis) => {
            const values = samples.map((entry) => {
                const hit = (entry.profile.axes || []).find((item) => item && item.id === axis.id);
                return Number(hit && hit.value) || 0;
            });
            acc[axis.id] = values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
            return acc;
        }, {});
        const bestDelta = (profile.axes || []).reduce((best, axis) => {
            const delta = Math.round((Number(axis.value) || 0) - (Number(axisAverages[axis.id]) || 0));
            if (!best || Math.abs(delta) > Math.abs(best.delta)) {
                return {
                    id: axis.id,
                    label: axis.label,
                    delta
                };
            }
            return best;
        }, null) || {
            id: profile.dominantAxisId || 'burst',
            label: profile.dominantAxisLabel || '先手爆发',
            delta: 0
        };
        const indexDelta = Math.round((Number(profile.index) || 0) - avgIndex);

        if (bestDelta.delta >= 12) {
            return {
                value: `比本榜均值更偏${bestDelta.label}`,
                line: `DRI ${formatSigned(indexDelta)} ｜ ${bestDelta.label} ${formatSigned(bestDelta.delta)}。和本榜其他目标相比，这位会更早把 ${bestDelta.label} 的考点甩到你脸上，换人后别沿用上一位的留牌节奏。`,
                shortTag: `偏${bestDelta.label}`,
                indexDelta,
                axisLabel: bestDelta.label,
                axisDelta: bestDelta.delta
            };
        }
        if (bestDelta.delta <= -12) {
            return {
                value: `比本榜均值更轻${bestDelta.label}`,
                line: `DRI ${formatSigned(indexDelta)} ｜ ${bestDelta.label} ${formatSigned(bestDelta.delta)}。这位比榜均更像修正节奏的题面，不必照着上一位重压打法继续满压。`,
                shortTag: `轻${bestDelta.label}`,
                indexDelta,
                axisLabel: bestDelta.label,
                axisDelta: bestDelta.delta
            };
        }
        return {
            value: '与本榜均值接近',
            line: `DRI ${formatSigned(indexDelta)} ｜ 四轴接近榜均。适合把这位当成“本段常规题面”来校准首拍、留牌与收束顺序。`,
            shortTag: '同卷对照',
            indexDelta,
            axisLabel: bestDelta.label,
            axisDelta: bestDelta.delta
        };
    },

    getPvpDossierHistoryMeta({ rank = null, dangerProfile = null, duelBrief = null, state = null } = {}) {
        const formatSigned = (value) => {
            const num = Math.round(Number(value) || 0);
            return num >= 0 ? `+${num}` : `${num}`;
        };
        const safeRank = this.normalizeFocusRank(rank || {});
        const profile = this.normalizePVPDangerProfile(dangerProfile);
        const brief = duelBrief && typeof duelBrief === 'object' ? duelBrief : {};
        const seasonMeta = this.getCurrentSeasonMeta();
        const seasonSegment = this.getPvpSeasonSegmentMeta({
            rank: safeRank,
            dangerProfile: profile,
            duelBrief: brief,
            scoreGap: profile.scoreGap || 0,
            realmGap: profile.realmGap || 0,
            guardianFormation: !!(profile.opponent && profile.opponent.guardianFormation)
        });
        const seasonHistory = this.getRecentMatchHistory(24, state)
            .filter((item) => !item.seasonId || item.seasonId === seasonMeta.id);
        const targetDivision = safeRank.division || this.getDivisionByScore(safeRank.score);
        const directMatches = seasonHistory.filter((item) => {
            if (safeRank.objectId && item.opponentRankId && item.opponentRankId === safeRank.objectId) return true;
            if (safeRank.user && safeRank.user.objectId && item.opponentUserId && item.opponentUserId === safeRank.user.objectId) return true;
            return !safeRank.user?.objectId && !!safeRank.user?.username && item.opponentName === safeRank.user.username;
        });
        const cohortMatches = seasonHistory.filter((item) => {
            if (directMatches.includes(item)) return false;
            const sameDivision = !!(item.opponentDivision && item.opponentDivision === targetDivision);
            const sameAxis = !!(item.dominantAxisId && item.dominantAxisId === profile.dominantAxisId);
            const sameSegment = !!(item.segmentLabel && item.segmentLabel === seasonSegment.segmentLabel);
            return sameDivision && (sameAxis || sameSegment);
        });
        const directSample = directMatches.slice(0, 5);
        const trendSample = (directMatches.length >= 2 ? directMatches : directMatches.concat(cohortMatches)).slice(0, 5);
        const comparableFallbackCount = Math.max(0, trendSample.length - directMatches.length);
        const directWins = directSample.filter((item) => item.didWin).length;
        const directLosses = Math.max(0, directSample.length - directWins);
        const recentTrend = trendSample.slice(0, Math.min(3, trendSample.length));
        const recentTrendWins = recentTrend.filter((item) => item.didWin).length;
        const trendAvgDri = recentTrend.length > 0
            ? Math.round(recentTrend.reduce((sum, item) => sum + (Number(item.dangerIndex) || 0), 0) / recentTrend.length)
            : 0;
        const trendAvgDelta = recentTrend.length > 0
            ? Math.round(recentTrend.reduce((sum, item) => sum + (Number(item.ratingDelta) || 0), 0) / recentTrend.length)
            : 0;
        const directAvgDelta = directSample.length > 0
            ? Math.round(directSample.reduce((sum, item) => sum + (Number(item.ratingDelta) || 0), 0) / directSample.length)
            : 0;
        const directAvgCoins = directSample.length > 0
            ? Math.round(directSample.reduce((sum, item) => sum + (Number(item.coinsAwarded) || 0), 0) / directSample.length)
            : 0;
        const latestDirect = directSample[0] || null;
        const sameModeCount = brief.modeId
            ? seasonHistory.filter((item) => item.modeId && item.modeId === brief.modeId).length
            : 0;
        const ledgerScopeChips = [
            targetDivision,
            profile.dominantAxisLabel || '',
            seasonSegment.segmentLabel || '',
            brief.modeLabel || ''
        ].filter((chip) => typeof chip === 'string' && chip.trim()).slice(0, 4);

        let historyValue = '暂无直接交手';
        let historyLine = '本赛季还没有与这名对手的真实留痕；同卷参照会收进多场趋势与赛季账本，不冒充直样。';
        let historyTag = '待补样本';
        if (latestDirect) {
            historyValue = `近${directSample.length}场 ${directWins}胜${directLosses}负`;
            historyLine = `最近一次 ${this.formatPvpHistoryTime(latestDirect.at)} ${latestDirect.verdictLabel || (latestDirect.didWin ? '胜场复盘' : '败场复盘')}；平均道韵 ${formatSigned(directAvgDelta)} ｜ 天道币均值 ${directAvgCoins}。`;
            historyTag = `本季 ${directSample.length} 场`;
        }

        let trendValue = '趋势待形成';
        let trendLine = '至少再完成 1 场真实样本，才会把节拍回暖或承压下滑写成趋势。';
        let trendTag = '样本待扩';
        if (recentTrend.length > 0) {
            const fallbackTrend = directMatches.length === 0 && cohortMatches.length > 0;
            trendTag = fallbackTrend ? `同卷 ${recentTrend.length} 场` : `近${recentTrend.length}场`;
            if (recentTrend.length >= 2 && recentTrendWins === recentTrend.length) {
                trendValue = `近${recentTrend.length}场持续走稳`;
                trendLine = `${fallbackTrend ? '同卷样本' : '真实交手'}显示近${recentTrend.length}场保持全胜，平均 DRI ${trendAvgDri}，${profile.dominantAxisLabel} 题面已经更容易答稳。`;
            } else if (recentTrend.length >= 2 && recentTrendWins === 0) {
                trendValue = `近${recentTrend.length}场连续失拍`;
                trendLine = `${fallbackTrend ? '同卷样本' : '真实交手'}显示近${recentTrend.length}场全负，平均 DRI ${trendAvgDri}；先把 ${profile.counterplay || profile.dominantAxisLabel} 这条对策练熟，再继续冲榜。`;
            } else if (recentTrend.length >= 2 && recentTrendWins > recentTrend.length / 2) {
                trendValue = `近${recentTrend.length}场走势回暖`;
                trendLine = `${fallbackTrend ? '同卷样本' : '真实交手'}近${recentTrend.length}场 ${recentTrendWins}胜${recentTrend.length - recentTrendWins}负，平均道韵 ${formatSigned(trendAvgDelta)}；现在更像是可持续上分的题面。`;
            } else if (recentTrend.length >= 2) {
                trendValue = `近${recentTrend.length}场胜负拉锯`;
                trendLine = `${fallbackTrend ? '同卷样本' : '真实交手'}近${recentTrend.length}场 ${recentTrendWins}胜${recentTrend.length - recentTrendWins}负，平均 DRI ${trendAvgDri}；仍要把止损与收束拆得更稳。`;
            } else {
                const first = recentTrend[0];
                trendValue = first.didWin ? '首条样本偏稳' : '首条样本承压';
                trendLine = `${fallbackTrend ? '同卷样本' : '真实交手'}只积累了 1 场：${first.verdictLabel || (first.didWin ? '胜场复盘' : '败场复盘')}，继续补样本后才会形成更稳定的多场趋势。`;
            }
        }

        let ledgerValue = '本季账本 0 场';
        let ledgerLine = `筛面会按 ${ledgerScopeChips.join(' · ') || '当前卷面'} 收束；当前还没有可比样本，先用这一把建立首条赛季账本记录。`;
        if (seasonHistory.length > 0) {
            ledgerValue = `本季账本 ${seasonHistory.length} 场 ｜ 直样 ${directMatches.length} / 同卷 ${cohortMatches.length}`;
            if (trendSample.length > 0) {
                const modeLine = brief.modeLabel && sameModeCount > 0
                    ? `；${brief.modeLabel} ${sameModeCount} 场`
                    : '';
                ledgerLine = `筛面按 ${ledgerScopeChips.join(' · ') || '当前卷面'} 收束；当前可比样本 ${trendSample.length} 场，其中直样 ${directMatches.length}、同卷回退 ${comparableFallbackCount}${modeLine}。`;
            } else {
                ledgerLine = `本季已记 ${seasonHistory.length} 场，但还没有命中 ${ledgerScopeChips.join(' · ') || '当前卷面'} 的可比样本；先用这一把继续补账本筛面。`;
            }
        }

        return {
            historyValue,
            historyLine,
            historyTag,
            historyCount: directMatches.length,
            trendValue,
            trendLine,
            trendTag,
            trendSampleCount: trendSample.length,
            ledgerValue,
            ledgerLine,
            ledgerTag: '样本筛面',
            ledgerSampleCount: seasonHistory.length,
            ledgerChips: ledgerScopeChips
        };
    },

    getFocusOpponentDossier(focusSource = null, options = {}) {
        const source = focusSource && typeof focusSource === 'object' ? focusSource : {};
        const rank = this.normalizeFocusRank(source.rank || source);
        const myRank = options.myRank && typeof options.myRank === 'object'
            ? options.myRank
            : (this.currentRankData || this.loadLocalRank());
        const myScore = Math.max(0, Number(options.myScore !== undefined ? options.myScore : (myRank && myRank.score)) || 1000);
        const myRealm = Math.max(1, Math.floor(Number(options.myRealm !== undefined ? options.myRealm : (myRank && myRank.realm)) || 1));
        const dangerProfile = source.dangerProfile
            ? this.normalizePVPDangerProfile(source.dangerProfile)
            : this.getPVPDangerProfile({ rank }, { myRank, myScore, myRealm });
        const duelBrief = source.duelBrief && typeof source.duelBrief === 'object'
            ? source.duelBrief
            : this.getFocusDuelSlip(
                {
                    rank,
                    dangerProfile
                },
                {
                    myRank,
                    myScore,
                    myRealm,
                    forcePractice: !!options.forcePractice
                }
            );
        const scoreGap = Math.trunc(Number(dangerProfile.scoreGap) || (rank.score - myScore));
        const realmGap = Math.trunc(Number(dangerProfile.realmGap) || (rank.realm - myRealm));
        const safeName = rank.user && rank.user.username ? String(rank.user.username) : '未知修士';
        const targetDivision = rank.division || this.getDivisionByScore(rank.score);
        const dominantAxis = dangerProfile.dominantAxisLabel || '先手爆发';
        const guardianFormation = !!(dangerProfile.opponent && dangerProfile.opponent.guardianFormation);
        const seasonMeta = this.getPvpSeasonSegmentMeta({
            rank,
            dangerProfile,
            duelBrief,
            scoreGap,
            realmGap,
            guardianFormation
        });
        const comparisonMeta = this.getPvpRankingComparisonMeta({
            rankId: rank.objectId || '',
            dangerProfile,
            listContext: options.listContext || source.listContext || []
        });
        const historyMeta = this.getPvpDossierHistoryMeta({
            rank,
            dangerProfile,
            duelBrief,
            state: options.historyState || null
        });
        const archetypeLabel = dangerProfile.opponent && dangerProfile.opponent.archetypeLabel
            ? String(dangerProfile.opponent.archetypeLabel)
            : '均衡试探';
        const sourceLabel = dangerProfile.confidenceLabel || '榜单推演';
        const sourceLine = dangerProfile.confidence === 'resolved'
            ? '已按当前残影快照锁定对手结构，可直接按这份档案安排首拍与资源预留。'
            : (duelBrief.modeId === 'targeted-online'
                ? '当前先按榜位与套路推演；若对方未留残影，系统会自动回退为同榜位镜像演武。'
                : '当前以榜位、境界与套路估算对手结构，适合先做备战与收益判断。');
        const formationLabel = guardianFormation ? '护山阵已启' : '未见护山阵';
        const formationLine = guardianFormation
            ? '对手更偏守阵续压，建议额外预留破阵、净化或跨轮收束。'
            : '当前更适合把资源放在先手压制与速断收头。';
        const routeValue = `${duelBrief.engagementLabel || '练手'} · ${duelBrief.modeLabel || '镜像演武'}`;
        const formatSigned = (value) => {
            const num = Math.trunc(Number(value) || 0);
            return num >= 0 ? `+${num}` : `${num}`;
        };
        const clueCards = [
            {
                label: '档案来源',
                value: sourceLabel,
                detail: sourceLine
            },
            {
                label: '赛季题面',
                value: seasonMeta.seasonValue,
                detail: seasonMeta.seasonDetail
            },
            {
                label: '分段标签',
                value: seasonMeta.stageValue,
                detail: seasonMeta.stageLine
            },
            {
                label: '守阵形态',
                value: formationLabel,
                detail: formationLine
            },
            {
                label: '约战路径',
                value: routeValue,
                detail: duelBrief.modeLine || '会按当前焦点目标安排出战路径。'
            },
            {
                label: '跨场对照',
                value: comparisonMeta.value,
                detail: comparisonMeta.line
            }
        ];
        const dossierTags = Array.from(new Set(
            [
                ...(Array.isArray(dangerProfile.tags) ? dangerProfile.tags : []),
                ...(Array.isArray(duelBrief.tags) ? duelBrief.tags : []),
                targetDivision,
                archetypeLabel,
                seasonMeta.segmentLabel,
                comparisonMeta.shortTag
            ].filter((tag) => typeof tag === 'string' && tag.trim())
        )).slice(0, 6);

        return {
            targetName: safeName,
            targetRankId: rank.objectId || '',
            targetDivision,
            targetRealm: Math.max(1, Math.floor(Number(rank.realm) || 1)),
            confidence: dangerProfile.confidence || 'estimated',
            confidenceLabel: sourceLabel,
            title: `${safeName} 档案`,
            summary: dangerProfile.summary || '',
            riskLine: dangerProfile.line || `DRI ${dangerProfile.index || 0} · ${dangerProfile.tierLabel || '可控'} · ${dominantAxis}`,
            scoreLine: `榜差 ${formatSigned(scoreGap)} ｜ 境界 ${formatSigned(realmGap)}`,
            seasonLine: `${seasonMeta.seasonValue} ｜ ${seasonMeta.seasonDetail}`,
            seasonName: seasonMeta.seasonName,
            seasonDetail: seasonMeta.seasonDetail,
            segmentLabel: seasonMeta.segmentLabel,
            segmentLine: seasonMeta.stageLine,
            sourceLabel,
            sourceLine,
            formationLabel,
            formationLine,
            routeValue,
            routeLine: duelBrief.modeLine || '',
            comparisonValue: comparisonMeta.value,
            comparisonLine: comparisonMeta.line,
            historyValue: historyMeta.historyValue,
            historyLine: historyMeta.historyLine,
            historyTag: historyMeta.historyTag,
            historyCount: Math.max(0, Math.floor(Number(historyMeta.historyCount) || 0)),
            trendValue: historyMeta.trendValue,
            trendLine: historyMeta.trendLine,
            trendTag: historyMeta.trendTag,
            trendSampleCount: Math.max(0, Math.floor(Number(historyMeta.trendSampleCount) || 0)),
            ledgerValue: historyMeta.ledgerValue,
            ledgerLine: historyMeta.ledgerLine,
            ledgerTag: historyMeta.ledgerTag,
            ledgerSampleCount: Math.max(0, Math.floor(Number(historyMeta.ledgerSampleCount) || 0)),
            ledgerChips: Array.isArray(historyMeta.ledgerChips) ? historyMeta.ledgerChips.slice(0, 4) : [],
            archetypeLabel,
            counterplayText: dangerProfile.counterplay || duelBrief.counterplayText || '',
            reserveText: dangerProfile.reserveGuidance || duelBrief.reserveText || '',
            tags: dossierTags,
            clueCards
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
            rewardBreakdown: rewardInfo.breakdown,
            economyState: next
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

    createPracticeOpponent(myScore = 1000, myRealm = 1, reason = 'practice', options = {}) {
        const preferredRank = options.preferredRank ? this.normalizeFocusRank(options.preferredRank) : null;
        const localUser = this.getLocalUserProfile();
        const shouldLockFocus = !!(
            preferredRank
            && preferredRank.user
            && preferredRank.user.objectId
            && preferredRank.user.objectId !== localUser.objectId
        );
        const seed = shouldLockFocus
            ? this.hashPvpPreviewSeed([
                preferredRank.objectId,
                preferredRank.user.objectId,
                preferredRank.user.username,
                preferredRank.score,
                preferredRank.realm
            ].join('|'))
            : this.nextPracticeSeed();
        const styles = ['aggressive', 'fortified', 'balanced'];
        const scoreShift = ((seed % 9) - 4) * 15;
        const namePool = ['太虚演武傀儡', '青锋论道者', '星渊镜像', '古碑守阵灵'];
        const estimatedFocus = shouldLockFocus
            ? this.estimatePvpSnapshotFromRank(preferredRank, { myScore, myRealm, listIndex: 0 })
            : null;
        const style = estimatedFocus && estimatedFocus.style
            ? estimatedFocus.style
            : styles[seed % styles.length];
        const opponentScore = shouldLockFocus
            ? preferredRank.score
            : Math.max(700, Math.floor((Number(myScore) || 1000) + scoreShift));
        const opponentRealm = shouldLockFocus
            ? preferredRank.realm
            : Math.max(1, Math.floor((Number(myRealm) || 1) + ((seed % 3) - 1)));
        const opponentName = shouldLockFocus
            ? preferredRank.user.username
            : `${namePool[seed % namePool.length]}-${(seed % 97) + 1}`;
        const opponentRank = shouldLockFocus
            ? {
                ...preferredRank,
                isLocal: true,
                mirrorOfRankId: preferredRank.objectId || null
            }
            : {
                objectId: `practice-rank-${seed}`,
                user: { objectId: `practice-user-${seed}`, username: opponentName },
                score: opponentScore,
                realm: opponentRealm,
                division: this.getDivisionByScore(opponentScore),
                isLocal: true
            };
        const ghostConfig = {
            personality: style,
            guardianFormation: estimatedFocus ? !!estimatedFocus.guardianFormation : seed % 2 === 0
        };
        const battleData = estimatedFocus
            ? estimatedFocus.battleData
            : this.normalizeBattleData({
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
        const battleBaseline = {
            myRank: this.currentRankData || this.loadLocalRank(),
            myScore,
            myRealm
        };
        const dangerProfile = this.getPVPDangerProfile(
            {
                rank: opponentRank,
                ghost: { config: ghostConfig },
                battleData
            },
            battleBaseline
        );

        const issuedAt = Date.now();
        const matchTicket = `practice:${localUser.objectId}:${issuedAt}:${seed}`;
        const matchIntent = this.getFocusDuelSlip(
            {
                rank: opponentRank,
                dangerProfile: dangerProfile
            },
            {
                ...battleBaseline,
                forcePractice: true
            }
        );
        const dossier = this.getFocusOpponentDossier(
            {
                rank: opponentRank,
                dangerProfile,
                duelBrief: matchIntent
            },
            battleBaseline
        );
        this.setActiveMatch({
            ticket: matchTicket,
            issuedAt,
            opponentRankId: opponentRank.objectId,
            opponentUserId: opponentRank.user.objectId,
            opponentRating: opponentScore,
            userId: localUser.objectId,
            consumed: false,
            localPractice: true,
            reason,
            focusRankId: shouldLockFocus ? preferredRank.objectId : null,
            focusUserId: shouldLockFocus ? preferredRank.user.objectId : null,
            matchIntent,
            dangerProfileSnapshot: dangerProfile,
            dossierSnapshot: dossier
                ? {
                    seasonId: this.getCurrentSeasonMeta().id || '',
                    seasonName: dossier.seasonName || this.getCurrentSeasonMeta().name || '',
                    targetName: dossier.targetName || '',
                    targetDivision: dossier.targetDivision || '',
                    targetRealm: dossier.targetRealm || 1,
                    archetypeLabel: dossier.archetypeLabel || '',
                    segmentLabel: dossier.segmentLabel || '',
                    comparisonValue: dossier.comparisonValue || ''
                }
                : null
        });

        return {
            success: true,
            opponent: {
                rank: opponentRank,
                ghost: {
                    objectId: `practice-ghost-${seed}`,
                    user: opponentRank.user,
                    config: ghostConfig,
                    saveTime: issuedAt
                },
                battleData,
                matchTicket,
                matchIntent,
                dangerProfile
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
        const preferredRank = options.preferredRank ? this.normalizeFocusRank(options.preferredRank) : null;
        const preferredDangerProfile = options.preferredDangerProfile || null;
        if (!this.isOnlinePvpAvailable()) {
            if (allowPractice) {
                return this.createPracticeOpponent(myScore, myRealm, 'offline', {
                    preferredRank,
                    preferredDangerProfile
                });
            }
            return { success: false, message: '未登录' };
        }

        try {
            // 策略：找积分相近的对手 (±200分)
            const query = Bmob.Query('PlayerRank');

            // 排除自己
            const user = this.getCurrentUserSafe();
            if (!user || !user.objectId) {
                if (allowPractice) {
                    return this.createPracticeOpponent(myScore, myRealm, 'missing_user', {
                        preferredRank,
                        preferredDangerProfile
                    });
                }
                return { success: false, message: '未登录' };
            }
            this.applyFilter(query, 'user', '!=', user.objectId);

            const resolveLatestGhostByUserId = async (targetUserId) => {
                if (!targetUserId) return null;
                const ghostQuery = Bmob.Query('GhostSnapshot');
                this.applyFilter(ghostQuery, 'user', '==', targetUserId);
                const ghosts = await ghostQuery.find();
                if (!ghosts || ghosts.length === 0) return null;
                return ghosts.reduce((best, item) => {
                    if (!best) return item;
                    const bestTime = Number(best.saveTime) || 0;
                    const itemTime = Number(item.saveTime) || 0;
                    return itemTime >= bestTime ? item : best;
                }, null);
            };

            const buildMatchResult = (opponentRank, ghostData, parsedData, meta = {}) => {
                const safeBattleData = this.normalizeBattleData(parsedData);
                const resolvedDangerProfile = meta.dangerProfile
                    ? this.normalizePVPDangerProfile(meta.dangerProfile)
                    : this.getPVPDangerProfile(
                        { rank: opponentRank, ghost: ghostData, battleData: safeBattleData },
                        {
                            myRank: this.currentRankData || null,
                            myScore,
                            myRealm
                        }
                    );
                const matchIntent = meta.matchIntent && typeof meta.matchIntent === 'object'
                    ? meta.matchIntent
                    : this.getFocusDuelSlip(
                        {
                            rank: opponentRank,
                            dangerProfile: resolvedDangerProfile
                        },
                        {
                            myRank: this.currentRankData || null,
                            myScore,
                            myRealm,
                            forcePractice: !!(opponentRank && opponentRank.isLocal)
                        }
                    );
                const dossier = meta.dossier && typeof meta.dossier === 'object'
                    ? meta.dossier
                    : this.getFocusOpponentDossier(
                        {
                            rank: opponentRank,
                            dangerProfile: resolvedDangerProfile,
                            duelBrief: matchIntent
                        },
                        {
                            myRank: this.currentRankData || null,
                            myScore,
                            myRealm
                        }
                    );
                const issuedAt = Date.now();
                const opponentRankId = opponentRank.objectId || null;
                const matchTicket = `${user.objectId}:${opponentRankId || 'unknown'}:${issuedAt}:${Math.random().toString(36).slice(2, 10)}`;
                this.setActiveMatch({
                    ticket: matchTicket,
                    issuedAt,
                    opponentRankId,
                    opponentUserId: opponentRank.user && opponentRank.user.objectId ? opponentRank.user.objectId : null,
                    opponentRating: Math.max(100, Number(opponentRank.score) || 1000),
                    userId: user.objectId,
                    consumed: false,
                    focusRankId: preferredRank ? preferredRank.objectId : null,
                    focusUserId: preferredRank && preferredRank.user ? preferredRank.user.objectId : null,
                    matchIntent,
                    dangerProfileSnapshot: resolvedDangerProfile,
                    dossierSnapshot: dossier
                        ? {
                            seasonId: this.getCurrentSeasonMeta().id || '',
                            seasonName: dossier.seasonName || this.getCurrentSeasonMeta().name || '',
                            targetName: dossier.targetName || '',
                            targetDivision: dossier.targetDivision || '',
                            targetRealm: dossier.targetRealm || 1,
                            archetypeLabel: dossier.archetypeLabel || '',
                            segmentLabel: dossier.segmentLabel || '',
                            comparisonValue: dossier.comparisonValue || ''
                        }
                        : null
                });
                return {
                    success: true,
                    opponent: {
                        rank: opponentRank,
                        ghost: ghostData,
                        battleData: safeBattleData,
                        matchTicket,
                        matchIntent,
                        dangerProfile: resolvedDangerProfile
                    }
                };
            };

            // 简单范围查询
            if (myScore) {
                this.applyFilter(query, 'score', '>=', myScore - 300);
                this.applyFilter(query, 'score', '<=', myScore + 300);
            }
            query.limit(10);
            // 必须 include user 才能获取对手名字
            query.include('user');

            let opponents = await query.find();

            if (
                preferredRank
                && preferredRank.objectId
                && preferredRank.user
                && preferredRank.user.objectId
                && preferredRank.user.objectId !== user.objectId
            ) {
                const preferredCandidate = preferredRank.objectId
                    ? (await this.getRankByObjectId(preferredRank.objectId) || preferredRank)
                    : preferredRank;
                if (preferredCandidate && preferredCandidate.user && preferredCandidate.user.objectId) {
                    const preferredGhost = await resolveLatestGhostByUserId(preferredCandidate.user.objectId);
                    if (preferredGhost) {
                        let parsedData;
                        try {
                            if (typeof preferredGhost.data === 'string') {
                                parsedData = JSON.parse(preferredGhost.data);
                            } else if (preferredGhost.data && typeof preferredGhost.data === 'object') {
                                parsedData = preferredGhost.data;
                            } else {
                                throw new Error('ghost data format invalid');
                            }
                        } catch (error) {
                            console.error('Parse preferred ghost data failed', error);
                            parsedData = null;
                        }
                        if (parsedData) {
                            const normalizedData = this.normalizeBattleData(parsedData);
                            const resolvedDanger = this.getPVPDangerProfile(
                                { rank: preferredCandidate, ghost: preferredGhost, battleData: normalizedData },
                                {
                                    myRank: this.currentRankData || null,
                                    myScore,
                                    myRealm
                                }
                            );
                            const matchIntent = this.getFocusDuelSlip(
                                {
                                    rank: preferredCandidate,
                                    dangerProfile: resolvedDanger
                                },
                                {
                                    myRank: this.currentRankData || null,
                                    myScore,
                                    myRealm
                                }
                            );
                            return buildMatchResult(preferredCandidate, preferredGhost, normalizedData, {
                                matchIntent,
                                dangerProfile: resolvedDanger
                            });
                        }
                    }
                }
                if (allowPractice) {
                    return this.createPracticeOpponent(myScore, myRealm, 'focused_fallback', {
                        preferredRank: preferredCandidate || preferredRank,
                        preferredDangerProfile
                    });
                }
            }

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
                if (allowPractice) {
                    return this.createPracticeOpponent(myScore, myRealm, 'no_server_opponent', {
                        preferredRank,
                        preferredDangerProfile
                    });
                }
                return { success: false, message: '暂无对手，请稍后再试' };
            }

            const shuffled = opponents.slice().sort(() => Math.random() - 0.5);
            let opponentRank = null;
            let ghostData = null;
            for (const rankCandidate of shuffled) {
                if (!rankCandidate || !rankCandidate.user || !rankCandidate.user.objectId) continue;
                ghostData = await resolveLatestGhostByUserId(rankCandidate.user.objectId);
                if (!ghostData) continue;
                opponentRank = rankCandidate;
                break;
            }

            if (!opponentRank || !ghostData) {
                if (allowPractice) {
                    return this.createPracticeOpponent(myScore, myRealm, 'missing_server_snapshot', {
                        preferredRank,
                        preferredDangerProfile
                    });
                }
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
            const matchIntent = preferredRank
                ? this.getFocusDuelSlip(
                    {
                        rank: opponentRank,
                        dangerProfile: this.getPVPDangerProfile(
                            { rank: opponentRank, ghost: ghostData, battleData: parsedData },
                            {
                                myRank: this.currentRankData || null,
                                myScore,
                                myRealm
                            }
                        )
                    },
                    {
                        myRank: this.currentRankData || null,
                        myScore,
                        myRealm
                    }
                )
                : null;

            return buildMatchResult(opponentRank, ghostData, parsedData, {
                matchIntent
            });

        } catch (error) {
            console.error('Find opponent error:', error);
            // Handle 101 (Table missing)
            if (allowPractice) {
                return this.createPracticeOpponent(myScore, myRealm, 'query_error', {
                    preferredRank,
                    preferredDangerProfile
                });
            }
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
            const historyEntry = this.normalizeMatchHistoryEntry({
                seasonId: active && active.dossierSnapshot ? active.dossierSnapshot.seasonId : (this.getCurrentSeasonMeta().id || ''),
                seasonName: active && active.dossierSnapshot ? active.dossierSnapshot.seasonName : (this.getCurrentSeasonMeta().name || ''),
                opponentRankId: opponentRankId || (active && active.opponentRankId) || '',
                opponentUserId: opponentUserId || (active && active.opponentUserId) || '',
                opponentName: (opponentRankData && opponentRankData.user && opponentRankData.user.username) || (active && active.dossierSnapshot && active.dossierSnapshot.targetName) || '未知对手',
                opponentDivision: (opponentRankData && opponentRankData.division) || (active && active.dossierSnapshot && active.dossierSnapshot.targetDivision) || this.getDivisionByScore(opponentRating),
                opponentRealm: (opponentRankData && opponentRankData.realm) || (active && active.dossierSnapshot && active.dossierSnapshot.targetRealm) || 1,
                didWin: isWin,
                verdictLabel: this.getPvpResultReview({
                    didWin: isWin,
                    dangerProfile: active && active.dangerProfileSnapshot ? active.dangerProfileSnapshot : null,
                    ratingDelta: calcRes.delta,
                    coinsAwarded: reward.coinsAwarded,
                    opponent: opponentRankData
                }).verdictLabel,
                ratingDelta: calcRes.delta,
                coinsAwarded: reward.coinsAwarded,
                dangerIndex: active && active.dangerProfileSnapshot ? active.dangerProfileSnapshot.index : 0,
                dangerTierId: active && active.dangerProfileSnapshot ? active.dangerProfileSnapshot.tierId : 'controlled',
                dangerTierLabel: active && active.dangerProfileSnapshot ? active.dangerProfileSnapshot.tierLabel : '可控',
                dominantAxisId: active && active.dangerProfileSnapshot ? active.dangerProfileSnapshot.dominantAxisId : 'burst',
                dominantAxisLabel: active && active.dangerProfileSnapshot ? active.dangerProfileSnapshot.dominantAxisLabel : '先手爆发',
                engagementId: active && active.matchIntent ? active.matchIntent.engagementId : '',
                engagementLabel: active && active.matchIntent ? active.matchIntent.engagementLabel : '',
                modeId: active && active.matchIntent ? active.matchIntent.modeId : '',
                modeLabel: active && active.matchIntent ? active.matchIntent.modeLabel : '',
                sourceType: active && active.dangerProfileSnapshot ? active.dangerProfileSnapshot.confidence : '',
                archetypeLabel: active && active.dossierSnapshot ? active.dossierSnapshot.archetypeLabel : '',
                segmentLabel: active && active.dossierSnapshot ? active.dossierSnapshot.segmentLabel : '',
                comparisonValue: active && active.dossierSnapshot ? active.dossierSnapshot.comparisonValue : '',
                at: Date.now()
            });
            const historyState = this.appendMatchHistory(reward.economyState || this.getEconomySnapshot(), historyEntry);
            this.saveEconomyState(historyState);
            this.clearActiveMatch();
            return {
                ...calcRes,
                coinsAwarded: reward.coinsAwarded,
                wallet: this.getWalletSummary(historyState)
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
        const historyEntry = this.normalizeMatchHistoryEntry({
            seasonId: active && active.dossierSnapshot ? active.dossierSnapshot.seasonId : (this.getCurrentSeasonMeta().id || ''),
            seasonName: active && active.dossierSnapshot ? active.dossierSnapshot.seasonName : (this.getCurrentSeasonMeta().name || ''),
            opponentRankId: opponentRankId || (active && active.opponentRankId) || '',
            opponentUserId: opponentUserId || (active && active.opponentUserId) || '',
            opponentName: (opponentRankData && opponentRankData.user && opponentRankData.user.username) || (active && active.dossierSnapshot && active.dossierSnapshot.targetName) || '未知对手',
            opponentDivision: (opponentRankData && opponentRankData.division) || (active && active.dossierSnapshot && active.dossierSnapshot.targetDivision) || this.getDivisionByScore(oppRating),
            opponentRealm: (opponentRankData && opponentRankData.realm) || (active && active.dossierSnapshot && active.dossierSnapshot.targetRealm) || 1,
            didWin: isWin,
            verdictLabel: this.getPvpResultReview({
                didWin: isWin,
                dangerProfile: active && active.dangerProfileSnapshot ? active.dangerProfileSnapshot : null,
                ratingDelta: calcRes.delta,
                coinsAwarded: reward.coinsAwarded,
                opponent: opponentRankData
            }).verdictLabel,
            ratingDelta: calcRes.delta,
            coinsAwarded: reward.coinsAwarded,
            dangerIndex: active && active.dangerProfileSnapshot ? active.dangerProfileSnapshot.index : 0,
            dangerTierId: active && active.dangerProfileSnapshot ? active.dangerProfileSnapshot.tierId : 'controlled',
            dangerTierLabel: active && active.dangerProfileSnapshot ? active.dangerProfileSnapshot.tierLabel : '可控',
            dominantAxisId: active && active.dangerProfileSnapshot ? active.dangerProfileSnapshot.dominantAxisId : 'burst',
            dominantAxisLabel: active && active.dangerProfileSnapshot ? active.dangerProfileSnapshot.dominantAxisLabel : '先手爆发',
            engagementId: active && active.matchIntent ? active.matchIntent.engagementId : '',
            engagementLabel: active && active.matchIntent ? active.matchIntent.engagementLabel : '',
            modeId: active && active.matchIntent ? active.matchIntent.modeId : '',
            modeLabel: active && active.matchIntent ? active.matchIntent.modeLabel : '',
            sourceType: active && active.dangerProfileSnapshot ? active.dangerProfileSnapshot.confidence : '',
            archetypeLabel: active && active.dossierSnapshot ? active.dossierSnapshot.archetypeLabel : '',
            segmentLabel: active && active.dossierSnapshot ? active.dossierSnapshot.segmentLabel : '',
            comparisonValue: active && active.dossierSnapshot ? active.dossierSnapshot.comparisonValue : '',
            at: Date.now()
        });
        const historyState = this.appendMatchHistory(reward.economyState || this.getEconomySnapshot(), historyEntry);
        this.saveEconomyState(historyState);
        this.clearActiveMatch();

        return {
            ...calcRes,
            coinsAwarded: reward.coinsAwarded,
            wallet: this.getWalletSummary(historyState)
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
