(function () {
    if (typeof Game === 'undefined') return;

    const CHALLENGE_PROGRESS_KEY = 'theDefierChallengeProgressV1';
    const ACTIVE_CHALLENGE_RUN_KEY = 'theDefierActiveChallengeRunV1';
    const OBSERVATORY_ARCHIVE_KEY = 'theDefierObservatoryArchiveV1';
    const OBSERVATORY_GUIDE_STATE_KEY = 'theDefierObservatoryGuideStateV1';
    const HUB_META = {
        daily: {
            title: '观星台 · 今日天机',
            subtitle: '每日一局短挑战，固定角色、章节目标与战场词缀。',
            label: '今日天机',
            accentClass: 'daily'
        },
        weekly: {
            title: '观星台 · 七日劫数',
            subtitle: '围绕同一套规则反复冲分，争取更高周积分。',
            label: '七日劫数',
            accentClass: 'weekly'
        },
        global: {
            title: '观星台 · 众生试炼',
            subtitle: '统一规则下的长线冲榜，争夺本周最高试炼分。',
            label: '众生试炼',
            accentClass: 'global'
        }
    };

    const originalShowScreen = Game.prototype.showScreen;
    const originalShowCharacterSelection = Game.prototype.showCharacterSelection;
    const originalRenderRunDestinySelection = Game.prototype.renderRunDestinySelection;
    const originalRenderSpiritCompanionSelection = Game.prototype.renderSpiritCompanionSelection;
    const originalSelectCharacter = Game.prototype.selectCharacter;
    const originalSelectRunDestiny = Game.prototype.selectRunDestiny;
    const originalSelectSpiritCompanion = Game.prototype.selectSpiritCompanion;
    const originalStartNewGame = Game.prototype.startNewGame;
    const originalStartBattle = Game.prototype.startBattle;
    const originalOnBattleWon = Game.prototype.onBattleWon;
    const originalOnBattleLost = Game.prototype.onBattleLost;
    const originalOnRealmComplete = Game.prototype.onRealmComplete;
    const originalSaveGame = Game.prototype.saveGame;
    const originalLoadGame = Game.prototype.loadGame;
    const originalClearSave = Game.prototype.clearSave;
    const originalRenderGameToText = Game.prototype.renderGameToText;
    const originalGetSanctumOverviewData = Game.prototype.getSanctumOverviewData;
    const originalFinishStrategicNode = Game.prototype.finishStrategicNode;
    const originalGameMapRender = typeof GameMap !== 'undefined' && GameMap?.prototype
        ? GameMap.prototype.render
        : null;

    const safeNumber = (value, fallback = 0) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    };

    const clampInt = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
        const num = Math.floor(safeNumber(value, min));
        return Math.max(min, Math.min(max, num));
    };

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const clone = (value) => {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            return value && typeof value === 'object' ? { ...value } : value;
        }
    };

    const hashString = (value = '') => {
        const text = String(value || '');
        let hash = 0;
        for (let i = 0; i < text.length; i += 1) {
            hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
        }
        return hash >>> 0;
    };

    const pad2 = (value) => String(value).padStart(2, '0');

    const getDayKey = (date = new Date()) => {
        const year = date.getFullYear();
        const month = pad2(date.getMonth() + 1);
        const day = pad2(date.getDate());
        return `${year}-${month}-${day}`;
    };

    const getISOWeekInfo = (date = new Date()) => {
        const target = new Date(date.getTime());
        target.setHours(0, 0, 0, 0);
        target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
        const week1 = new Date(target.getFullYear(), 0, 4);
        const week = 1 + Math.round(((target.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
        return {
            year: target.getFullYear(),
            week: Math.max(1, week)
        };
    };

    const getWeekKey = (date = new Date()) => {
        const info = getISOWeekInfo(date);
        return `${info.year}-W${pad2(info.week)}`;
    };

    const formatDateLabel = (mode = 'daily', key = '') => {
        if (mode === 'daily') {
            const [year, month, day] = String(key || '').split('-');
            if (year && month && day) return `${year}.${month}.${day}`;
            return '今日轮换';
        }
        if (mode === 'weekly' || mode === 'global') {
            const match = String(key || '').match(/^(\d+)-W(\d+)$/);
            if (match) return `${match[1]} · 第 ${Number(match[2])} 周`;
            return '本周轮换';
        }
        return key || '当前轮换';
    };

    const createProgressEntry = () => ({
        attempts: 0,
        completions: 0,
        bestScore: 0,
        totalScore: 0,
        claimedRewards: {},
        records: [],
        lastResult: null
    });

    const normalizeChallengeRuleSnapshot = (source = null) => {
        const rule = source && typeof source === 'object' ? source : {};
        return {
            id: String(rule.id || ''),
            name: String(rule.name || ''),
            icon: String(rule.icon || '✦'),
            intro: String(rule.intro || ''),
            objective: String(rule.objective || ''),
            targetChapter: String(rule.targetChapter || ''),
            goalRealm: clampInt(rule.goalRealm, 1, 18),
            characterId: String(rule.characterId || ''),
            runDestinyId: String(rule.runDestinyId || ''),
            spiritCompanionId: String(rule.spiritCompanionId || ''),
            vowIds: Array.isArray(rule.vowIds)
                ? rule.vowIds.map((id) => String(id || '')).filter(Boolean).slice(0, 2)
                : [],
            tags: Array.isArray(rule.tags)
                ? rule.tags.map((item) => String(item || '')).filter(Boolean).slice(0, 6)
                : [],
            scoreWeights: rule.scoreWeights && typeof rule.scoreWeights === 'object'
                ? clone(rule.scoreWeights)
                : {},
            battleModifiers: rule.battleModifiers && typeof rule.battleModifiers === 'object'
                ? clone(rule.battleModifiers)
                : {}
        };
    };

    const createObservatoryArchiveState = () => ({
        records: []
    });

    const createObservatoryGuideState = () => ({
        selectedRecordId: '',
        updatedAt: 0
    });

    const normalizeTagList = (source = [], limit = 4) => {
        const seen = new Set();
        return (Array.isArray(source) ? source : [])
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .filter((item) => {
                const key = item.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, Math.max(0, limit));
    };

    const CHALLENGE_THEME_LIBRARY = {
        assault: {
            key: 'assault',
            label: '前压爆发',
            signatureTag: '前压爆发',
            compareHint: '对比先手压制、收头效率与能否稳定抢下前段节拍。',
            expeditionNote: '优先战斗稠密路线，把先手优势换成远征的开局节奏。',
            preferredNodes: ['enemy', 'elite', 'trial']
        },
        bulwark: {
            key: 'bulwark',
            label: '稳守续航',
            signatureTag: '稳守续航',
            compareHint: '对比护阵、稳血与长线容错是否真正撑起了收官。',
            expeditionNote: '优先营地、商店与观星路线，把恢复和容错做厚。',
            preferredNodes: ['rest', 'shop', 'observatory']
        },
        forge: {
            key: 'forge',
            label: '法宝共振',
            signatureTag: '法宝共振',
            compareHint: '对比法宝补件速度、经济换强度效率与器灵协同质量。',
            expeditionNote: '优先锻炉、商店与高价值战斗路线，尽快补齐关键部件。',
            preferredNodes: ['forge', 'shop', 'elite']
        },
        oracle: {
            key: 'oracle',
            label: '推演控场',
            signatureTag: '推演控场',
            compareHint: '对比观测收益、读图质量与控场链条的稳定度。',
            expeditionNote: '优先观星、事件与记忆裂隙路线，把信息差换成更稳的决策。',
            preferredNodes: ['observatory', 'event', 'memory_rift']
        },
        tempo: {
            key: 'tempo',
            label: '连携节拍',
            signatureTag: '连携节拍',
            compareHint: '对比连段衔接、中盘滚动速度与资源衰减点。',
            expeditionNote: '优先灵契、事件与普通战路线，把节拍链尽快滚起来。',
            preferredNodes: ['spirit_grotto', 'event', 'enemy']
        },
        marathon: {
            key: 'marathon',
            label: '跨章耐压',
            signatureTag: '跨章耐压',
            compareHint: '对比跨章承压、终盘效率与高压路段的答卷完整度。',
            expeditionNote: '优先精英、试炼与观星路线，让长线答卷更完整。',
            preferredNodes: ['elite', 'trial', 'observatory']
        }
    };

    const CHALLENGE_NODE_LABELS = {
        enemy: '常规战',
        elite: '精英',
        trial: '试炼',
        rest: '营地',
        shop: '商店',
        observatory: '观星台',
        forge: '炼器台',
        event: '事件',
        memory_rift: '记忆裂隙',
        spirit_grotto: '灵契窟',
        forbidden_altar: '禁术坛'
    };

    const CHALLENGE_REASON_LIBRARY = {
        goal_reached: { label: '完成线达成' },
        battle_lost: { label: '战斗失手' },
        interrupted: { label: '中途收束' }
    };

    const CHALLENGE_DANGER_AXIS_LIBRARY = {
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
            summary: '固定命盘、双誓约与跨章目标提高了路线与节拍执行要求。',
            counterplay: '优先按指定命盘完成章节目标，再追求额外分数，不要过早偏离样本。',
            reserveGuidance: '建议先完成指定章节线，再去贪高压战和额外资源点。'
        }
    };

    const resolveChallengeThemeMeta = (rule = null, mode = 'daily') => {
        const source = rule && typeof rule === 'object' ? rule : {};
        const searchText = [
            source.name,
            source.intro,
            source.objective,
            ...(Array.isArray(source.tags) ? source.tags : [])
        ]
            .join(' ')
            .trim();
        let key = 'assault';
        if (mode === 'global' || /跨章|冲榜|统一规则|长线|众生试炼/.test(searchText)) {
            key = 'marathon';
        } else if (/法宝|器灵|炼器|封炉|锻|炉|法器/.test(searchText)) {
            key = 'forge';
        } else if (/观星|推演|预判|预案|手牌|星录|读图|控场|天机|法则/.test(searchText)) {
            key = 'oracle';
        } else if (/连携|节拍|回响|连段|调度|链/.test(searchText)) {
            key = 'tempo';
        } else if (/护盾|守|稳|医|疗|续航|回生|守阵|反击/.test(searchText)) {
            key = 'bulwark';
        } else if (/爆发|前压|压制|收头|强袭|快攻|冲分|猎首/.test(searchText)) {
            key = 'assault';
        }
        return clone(CHALLENGE_THEME_LIBRARY[key] || CHALLENGE_THEME_LIBRARY.assault);
    };

    const normalizeChallengeMetricSnapshot = (source = null) => {
        const metrics = source && typeof source === 'object' ? source : {};
        return {
            hpRatio: Math.max(0, Math.min(1, safeNumber(metrics.hpRatio, 0))),
            lawGains: clampInt(metrics.lawGains, 0, 99),
            treasureGains: clampInt(metrics.treasureGains, 0, 99),
            battleWins: clampInt(metrics.battleWins, 0, 99),
            eliteWins: clampInt(metrics.eliteWins, 0, 99),
            bossWins: clampInt(metrics.bossWins, 0, 99),
            realmClears: clampInt(metrics.realmClears, 0, 99)
        };
    };

    const normalizeChallengeDangerProfile = (profile = null) => {
        const source = profile && typeof profile === 'object' ? profile : {};
        const axes = Array.isArray(source.axes) ? source.axes : [];
        return {
            index: clampInt(source.index, 0, 100),
            tierId: String(source.tierId || 'controlled'),
            tierLabel: String(source.tierLabel || '可控'),
            dominantAxisId: String(source.dominantAxisId || 'burst'),
            dominantAxisLabel: String(source.dominantAxisLabel || CHALLENGE_DANGER_AXIS_LIBRARY.burst.label),
            summary: String(source.summary || ''),
            counterplay: String(source.counterplay || ''),
            reserveGuidance: String(source.reserveGuidance || ''),
            line: String(source.line || ''),
            axes: axes
                .filter((axis) => axis && typeof axis === 'object')
                .slice(0, 4)
                .map((axis) => ({
                    id: String(axis.id || ''),
                    label: String(axis.label || ''),
                    value: clampInt(axis.value, 0, 100)
                }))
        };
    };

    const normalizeChallengeArchiveInsight = (insight = null) => {
        const source = insight && typeof insight === 'object' ? insight : {};
        return {
            title: String(source.title || ''),
            summary: String(source.summary || ''),
            focusLines: normalizeTagList(Array.isArray(source.focusLines) ? source.focusLines : [], 3),
            preferredNodeLine: String(source.preferredNodeLine || ''),
            reasonLabel: String(source.reasonLabel || '')
        };
    };

    const hasChallengeArchiveInsight = (insight = null) => {
        const normalized = normalizeChallengeArchiveInsight(insight);
        return !!(normalized.title || normalized.summary || normalized.focusLines.length > 0);
    };

    const serializeChallengeDangerProfile = (profile = null) => {
        const normalized = normalizeChallengeDangerProfile(profile);
        return {
            index: normalized.index,
            tierId: normalized.tierId,
            tierLabel: normalized.tierLabel,
            dominantAxisId: normalized.dominantAxisId,
            dominantAxisLabel: normalized.dominantAxisLabel,
            summary: normalized.summary,
            counterplay: normalized.counterplay,
            reserveGuidance: normalized.reserveGuidance,
            line: normalized.line,
            axes: normalized.axes.map((axis) => ({
                id: axis.id,
                label: axis.label,
                value: axis.value
            }))
        };
    };

    const serializeChallengeArchiveInsight = (insight = null) => {
        const normalized = normalizeChallengeArchiveInsight(insight);
        if (!normalized.title && !normalized.summary && normalized.focusLines.length === 0) return null;
        return {
            title: normalized.title,
            summary: normalized.summary,
            focusLines: normalized.focusLines.slice(0, 3),
            preferredNodeLine: normalized.preferredNodeLine,
            reasonLabel: normalized.reasonLabel
        };
    };

    const buildChallengeFeaturedTier = (run = null, metrics = null, options = {}) => {
        const sourceRun = run && typeof run === 'object' ? run : {};
        const snapshot = normalizeChallengeMetricSnapshot(metrics);
        const completed = !!options.completed;
        const replayOnly = !!sourceRun.replayOnly;
        const score = clampInt(sourceRun.finalScore, 0);
        const goalRealm = clampInt(sourceRun.goalRealm, 1, 18);
        const benchmark = goalRealm * 42;
        if (!completed) return replayOnly ? '回放留痕' : '中断留痕';
        if (score >= benchmark + 120 || snapshot.hpRatio >= 0.86 || (snapshot.eliteWins + snapshot.bossWins) >= 2) {
            return replayOnly ? '回放标杆' : '标杆命盘';
        }
        return replayOnly ? '回放样本' : '精选命盘';
    };

    const buildChallengeFeaturedTags = (rule = null, run = null, metrics = null, themeMeta = null, options = {}) => {
        const sourceRule = rule && typeof rule === 'object' ? rule : {};
        const sourceRun = run && typeof run === 'object' ? run : {};
        const snapshot = normalizeChallengeMetricSnapshot(metrics);
        const meta = themeMeta || resolveChallengeThemeMeta(sourceRule, sourceRun.mode || options.mode || 'daily');
        const tags = [];
        if (meta.signatureTag) tags.push(meta.signatureTag);
        if (options.completed && snapshot.realmClears >= clampInt(sourceRun.goalRealm, 1, 18)) {
            tags.push(clampInt(sourceRun.goalRealm, 1, 18) >= 6 ? '跨章冲线' : '准时冲线');
        }
        if (options.completed && snapshot.hpRatio >= 0.78) tags.push('稳血收官');
        if (snapshot.lawGains >= 2) tags.push('法则补全');
        if (snapshot.treasureGains >= 1) tags.push('法宝补件');
        if ((snapshot.eliteWins + snapshot.bossWins) >= 2) tags.push('高压过线');
        if (sourceRun.replayOnly) tags.push(options.completed ? '回放复刻' : '回放试错');
        if (!options.completed) tags.push(snapshot.hpRatio >= 0.45 ? '中盘止损' : '高压折返');
        normalizeTagList(sourceRule.tags, 2).forEach((tag) => tags.push(tag));
        return normalizeTagList(tags, 4);
    };

    const formatChallengeMetricLine = (metrics = null) => {
        const snapshot = normalizeChallengeMetricSnapshot(metrics);
        const parts = [`血线 ${Math.round(snapshot.hpRatio * 100)}%`];
        if (snapshot.lawGains > 0) parts.push(`法则 +${snapshot.lawGains}`);
        if (snapshot.treasureGains > 0) parts.push(`法宝 +${snapshot.treasureGains}`);
        if ((snapshot.eliteWins + snapshot.bossWins) > 0) parts.push(`高压战 ${snapshot.eliteWins + snapshot.bossWins}`);
        return parts.join(' · ');
    };

    const formatChallengePreferredNodes = (preferredNodes = []) => normalizeTagList(
        preferredNodes
            .map((nodeId) => CHALLENGE_NODE_LABELS[nodeId] || String(nodeId || '').trim())
            .filter(Boolean),
        3
    );

    const buildChallengeArchiveInsight = (entry = {}, themeMeta = null) => {
        const source = entry && typeof entry === 'object' ? entry : {};
        const metrics = normalizeChallengeMetricSnapshot(source.metrics);
        const meta = themeMeta || resolveChallengeThemeMeta(source.rule, source.mode || 'daily');
        const preferredNodeLabels = formatChallengePreferredNodes(
            Array.isArray(source.preferredNodes) && source.preferredNodes.length > 0
                ? source.preferredNodes
                : meta.preferredNodes
        );
        const preferredNodeLine = preferredNodeLabels.length > 0
            ? `优先节点：${preferredNodeLabels.join(' / ')}`
            : '';
        const hpPercent = clampInt(Math.round(metrics.hpRatio * 100), 0, 100);
        const highPressureCount = clampInt(metrics.eliteWins + metrics.bossWins, 0, 99);
        const resourceParts = [];
        if (metrics.lawGains > 0) resourceParts.push(`法则 +${metrics.lawGains}`);
        if (metrics.treasureGains > 0) resourceParts.push(`法宝 +${metrics.treasureGains}`);
        const reasonLabel = CHALLENGE_REASON_LIBRARY[source.reason]?.label || '本轮留痕';
        const focusLines = [];
        let title = source.replayOnly ? '回放样本' : '挑战留痕';
        let summary = `${meta.label} 主题已写入观察站，可继续拿来复盘。`;

        if (source.completed) {
            title = source.replayOnly ? '回放复刻' : '复刻重点';
            const keyword = hpPercent >= 78
                ? '稳血收官'
                : highPressureCount >= 2
                    ? '高压过线'
                    : metrics.lawGains >= 2
                        ? '法则补全'
                        : reasonLabel;
            summary = `${keyword}：${meta.label} 样本保住了 ${hpPercent}% 血线${highPressureCount > 0 ? `，并处理了 ${highPressureCount} 场高压战` : ''}。`;
            if (preferredNodeLine) focusLines.push(preferredNodeLine);
            focusLines.push(
                highPressureCount >= 2
                    ? '复刻建议：高压战前先预留护盾、减伤或控场，再按这套命盘推进。'
                    : `复刻建议：优先沿主题节点走，尽量把血线维持在 ${Math.max(55, Math.min(90, hpPercent || 65))}% 左右进入收官。`
            );
            if (resourceParts.length > 0) {
                focusLines.push(`资源抓手：${resourceParts.join(' / ')}。`);
            } else if (meta.expeditionNote) {
                focusLines.push(`路线提示：${meta.expeditionNote}`);
            }
        } else {
            title = source.replayOnly ? '回放试错' : '失手剖面';
            const failKeyword = hpPercent < 35
                ? '血线失守'
                : highPressureCount >= 1
                    ? '高压段断档'
                    : resourceParts.length === 0
                        ? '补件断档'
                        : reasonLabel;
            summary = `${failKeyword}：这份${source.replayOnly ? '回放样本' : '挑战留痕'}停在 ${hpPercent}% 血线${highPressureCount > 0 ? `，已吃下 ${highPressureCount} 场高压战` : ''}。`;
            if (preferredNodeLine) focusLines.push(preferredNodeLine);
            if (hpPercent < 45) {
                focusLines.push('补救建议：下次先把恢复、护盾或减伤做厚，再回到高压节点。');
            } else if (highPressureCount === 0) {
                focusLines.push('补救建议：先按主题优先节点补信息与资源，再去打第一场高压战。');
            } else {
                focusLines.push('补救建议：进入高压战前留住爆发与兜底，不要把关键资源耗在前段。');
            }
            if (resourceParts.length === 0) {
                focusLines.push('资源缺口：本轮没有形成法则/法宝补件，建议先补一组关键件再复刻。');
            } else {
                focusLines.push(`本轮抓到：${resourceParts.join(' / ')}，可以保留这部分路线，再修正失手点。`);
            }
        }

        return {
            title,
            summary,
            focusLines: normalizeTagList(focusLines, 3),
            preferredNodeLine,
            reasonLabel
        };
    };

    const renderChallengeInsightMarkup = (insight = null, options = {}) => {
        if (!insight || typeof insight !== 'object') return '';
        const compact = !!options.compact;
        const lines = Array.isArray(insight.focusLines) ? insight.focusLines.filter(Boolean).slice(0, 3) : [];
        if (!insight.title && !insight.summary && lines.length === 0) return '';
        return `
            <div class="challenge-record-insight${compact ? ' compact' : ''}">
                ${insight.title ? `<strong>${escapeHtml(insight.title)}</strong>` : ''}
                ${insight.summary ? `<p>${escapeHtml(insight.summary)}</p>` : ''}
                ${lines.length > 0
                    ? `<div class="challenge-record-insight-lines">${lines.map((line) => `<span class="challenge-record-insight-line">${escapeHtml(line)}</span>`).join('')}</div>`
                    : ''}
            </div>
        `;
    };

    Game.prototype.ensureChallengeHubBootState = function () {
        if (!this.challengeHubState || typeof this.challengeHubState !== 'object') {
            this.challengeHubState = { tab: 'daily' };
        } else if (!['daily', 'weekly', 'global'].includes(this.challengeHubState.tab)) {
            this.challengeHubState.tab = 'daily';
        }

        if (!this.challengeProgressState || typeof this.challengeProgressState !== 'object') {
            this.challengeProgressState = this.loadChallengeProgressState();
        }

        if (typeof this.pendingChallengeStart === 'undefined') {
            this.pendingChallengeStart = null;
        }

        if (typeof this.activeChallengeRun === 'undefined') {
            this.activeChallengeRun = this.restoreActiveChallengeRun();
        }

        if (!this.observatoryArchiveState || typeof this.observatoryArchiveState !== 'object') {
            this.observatoryArchiveState = this.loadObservatoryArchiveState();
        }

        if (!this.observatoryGuideState || typeof this.observatoryGuideState !== 'object') {
            this.observatoryGuideState = this.loadObservatoryGuideState();
        }
    };

    Game.prototype.normalizeObservatoryArchiveState = function (rawState = null) {
        const source = rawState && typeof rawState === 'object' ? rawState : {};
        const records = Array.isArray(source.records) ? source.records : [];
        return {
            records: records
                .filter((item) => item && typeof item === 'object')
                .slice(0, 24)
                .map((item) => {
                    const rule = normalizeChallengeRuleSnapshot(item.rule);
                    const mode = ['daily', 'weekly', 'global'].includes(item.mode) ? item.mode : 'daily';
                    const replayOnly = !!item.replayOnly;
                    const type = ['challenge', 'replay', 'omen'].includes(item.type)
                        ? item.type
                        : (replayOnly ? 'replay' : 'omen');
                    const themeMeta = resolveChallengeThemeMeta(rule, mode);
                    const metrics = normalizeChallengeMetricSnapshot(item.metrics);
                    const completed = !!item.completed;
                    const featured = type !== 'omen' && completed;
                    const featuredTier = String(item.featuredTier || buildChallengeFeaturedTier({
                        goalRealm: rule.goalRealm,
                        replayOnly,
                        finalScore: item.score
                    }, metrics, { completed }));
                    const featuredTags = normalizeTagList(
                        item.featuredTags && Array.isArray(item.featuredTags)
                            ? item.featuredTags
                            : buildChallengeFeaturedTags(rule, {
                                goalRealm: rule.goalRealm,
                                replayOnly,
                                finalScore: item.score,
                                mode
                            }, metrics, themeMeta, { completed, mode }),
                        4
                    );
                    const preferredNodes = Array.isArray(item.preferredNodes)
                        ? item.preferredNodes.map((entry) => String(entry || '')).filter(Boolean).slice(0, 4)
                        : themeMeta.preferredNodes.slice(0, 4);
                    const insight = normalizeChallengeArchiveInsight(
                        item.insight || buildChallengeArchiveInsight({
                            rule,
                            mode,
                            replayOnly,
                            completed,
                            metrics,
                            preferredNodes,
                            reason: String(item.reason || '')
                        }, themeMeta)
                    );
                    return {
                        id: String(item.id || ''),
                        type,
                        mode,
                        modeLabel: String(item.modeLabel || (replayOnly ? '观星回放' : HUB_META[mode]?.label || '观星留痕')),
                        rotationKey: String(item.rotationKey || ''),
                        rotationLabel: String(item.rotationLabel || formatDateLabel(mode, item.rotationKey || '')),
                        seedSignature: String(item.seedSignature || ''),
                        title: String(item.title || rule.name || '观星留痕'),
                        note: String(item.note || ''),
                        icon: String(item.icon || rule.icon || '🔭'),
                        score: clampInt(item.score, 0),
                        completed,
                        at: clampInt(item.at, 0),
                        reason: String(item.reason || ''),
                        replayOnly,
                        replayable: !!(rule.id && rule.characterId && rule.runDestinyId && rule.spiritCompanionId),
                        archiveEntryId: String(item.archiveEntryId || ''),
                        originLabel: String(item.originLabel || ''),
                        themeKey: String(item.themeKey || themeMeta.key || 'assault'),
                        themeLabel: String(item.themeLabel || themeMeta.label || '前压爆发'),
                        featured,
                        featuredTier,
                        featuredTags,
                        metrics,
                        preferredNodes,
                        insight: hasChallengeArchiveInsight(insight) ? insight : null,
                        rule
                    };
                })
                .sort((a, b) => clampInt(b.at, 0) - clampInt(a.at, 0))
        };
    };

    Game.prototype.loadObservatoryArchiveState = function () {
        try {
            const raw = typeof localStorage !== 'undefined'
                ? localStorage.getItem(OBSERVATORY_ARCHIVE_KEY)
                : null;
            return this.normalizeObservatoryArchiveState(raw ? JSON.parse(raw) : createObservatoryArchiveState());
        } catch (error) {
            return this.normalizeObservatoryArchiveState(createObservatoryArchiveState());
        }
    };

    Game.prototype.persistObservatoryArchiveState = function () {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(OBSERVATORY_ARCHIVE_KEY, JSON.stringify(this.observatoryArchiveState || createObservatoryArchiveState()));
        } catch (error) {
            console.warn('Persist observatory archive failed:', error);
        }
    };

    Game.prototype.normalizeObservatoryGuideState = function (rawState = null) {
        const source = rawState && typeof rawState === 'object' ? rawState : {};
        return {
            selectedRecordId: String(source.selectedRecordId || ''),
            updatedAt: clampInt(source.updatedAt, 0)
        };
    };

    Game.prototype.loadObservatoryGuideState = function () {
        try {
            const raw = typeof localStorage !== 'undefined'
                ? localStorage.getItem(OBSERVATORY_GUIDE_STATE_KEY)
                : null;
            return this.normalizeObservatoryGuideState(raw ? JSON.parse(raw) : createObservatoryGuideState());
        } catch (error) {
            return this.normalizeObservatoryGuideState(createObservatoryGuideState());
        }
    };

    Game.prototype.persistObservatoryGuideState = function () {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(OBSERVATORY_GUIDE_STATE_KEY, JSON.stringify(this.observatoryGuideState || createObservatoryGuideState()));
        } catch (error) {
            console.warn('Persist observatory guide failed:', error);
        }
    };

    Game.prototype.buildChallengeSeedSignature = function (mode = 'daily', rotationKey = '', rule = null) {
        const safeMode = ['daily', 'weekly', 'global'].includes(mode) ? mode : 'daily';
        const snapshot = normalizeChallengeRuleSnapshot(rule);
        const seedSource = [
            safeMode,
            String(rotationKey || ''),
            snapshot.id,
            snapshot.characterId,
            snapshot.runDestinyId,
            snapshot.spiritCompanionId,
            snapshot.goalRealm,
            snapshot.vowIds.join(','),
            JSON.stringify(snapshot.battleModifiers || {})
        ].join('|');
        const digest = hashString(seedSource).toString(16).toUpperCase().padStart(8, '0');
        const prefixMap = { daily: 'D', weekly: 'W', global: 'G' };
        const keyPart = String(rotationKey || 'ARCH').replace(/[^0-9A-Z]/gi, '').slice(-6) || 'ARCH';
        return `${prefixMap[safeMode] || 'O'}-${keyPart}-${digest.slice(0, 4)}`;
    };

    Game.prototype.recordObservatoryArchiveEntry = function (payload = {}) {
        this.ensureChallengeHubBootState();
        const state = this.observatoryArchiveState && typeof this.observatoryArchiveState === 'object'
            ? this.observatoryArchiveState
            : createObservatoryArchiveState();
        const normalized = this.normalizeObservatoryArchiveState({
            records: [
                {
                    id: String(payload.id || `${Date.now()}:${hashString(JSON.stringify(payload || {}))}`),
                    type: payload.type || 'omen',
                    mode: payload.mode || 'daily',
                    modeLabel: payload.modeLabel || '',
                    rotationKey: payload.rotationKey || '',
                    rotationLabel: payload.rotationLabel || '',
                    seedSignature: payload.seedSignature || '',
                    title: payload.title || '',
                    note: payload.note || '',
                    icon: payload.icon || '🔭',
                    score: payload.score || 0,
                    completed: payload.completed,
                    at: payload.at || Date.now(),
                    reason: payload.reason || '',
                    replayOnly: payload.replayOnly,
                    archiveEntryId: payload.archiveEntryId || '',
                    originLabel: payload.originLabel || '',
                    themeKey: payload.themeKey || '',
                    themeLabel: payload.themeLabel || '',
                    featuredTier: payload.featuredTier || '',
                    featuredTags: payload.featuredTags || [],
                    metrics: payload.metrics || null,
                    preferredNodes: payload.preferredNodes || [],
                    insight: payload.insight || null,
                    rule: payload.rule || null
                },
                ...(Array.isArray(state.records) ? state.records : [])
            ].slice(0, 24)
        });
        this.observatoryArchiveState = normalized;
        this.persistObservatoryArchiveState();
        this.syncObservatoryGuideSelection();
        return normalized.records[0] || null;
    };

    Game.prototype.getObservatoryArchiveEntries = function (options = {}) {
        this.ensureChallengeHubBootState();
        const source = Array.isArray(this.observatoryArchiveState?.records)
            ? this.observatoryArchiveState.records
            : [];
        const limit = clampInt(options.limit, 0, 24) || 6;
        const mode = ['daily', 'weekly', 'global'].includes(options.mode) ? options.mode : '';
        const types = Array.isArray(options.types)
            ? options.types.map((item) => String(item || '')).filter(Boolean)
            : null;
        const replayableOnly = !!options.replayableOnly;
        const featuredOnly = !!options.featuredOnly;
        return source
            .filter((entry) => {
                if (!entry) return false;
                if (mode && entry.mode !== mode) return false;
                if (types && types.length > 0 && !types.includes(entry.type)) return false;
                if (replayableOnly && !entry.replayable) return false;
                if (featuredOnly && !entry.featured) return false;
                return true;
            })
            .slice(0, limit);
    };

    Game.prototype.getObservatoryArchiveSummary = function () {
        const records = this.getObservatoryArchiveEntries({ limit: 24 });
        const selectedGuide = this.getSelectedObservatoryExpeditionGuide({ silentSync: true });
        return {
            totalRecords: records.length,
            replayCount: records.filter((item) => item.type === 'replay').length,
            challengeCount: records.filter((item) => item.type === 'challenge').length,
            omenCount: records.filter((item) => item.type === 'omen').length,
            replayableCount: records.filter((item) => item.replayable).length,
            featuredCount: records.filter((item) => item.featured).length,
            latest: records[0] || null,
            selectedGuideId: selectedGuide?.id || '',
            selectedGuideTitle: selectedGuide?.title || '',
            selectedGuideThemeLabel: selectedGuide?.themeLabel || ''
        };
    };

    Game.prototype.getChallengeThemeMeta = function (rule = null, mode = 'daily') {
        return resolveChallengeThemeMeta(rule, mode);
    };

    Game.prototype.isObservatoryEntryExpeditionEligible = function (entry = null) {
        return !!entry
            && entry.type !== 'omen'
            && !!entry.completed
            && !!entry.replayable
            && !!entry.featured;
    };

    Game.prototype.syncObservatoryGuideSelection = function () {
        this.ensureChallengeHubBootState();
        const state = this.normalizeObservatoryGuideState(this.observatoryGuideState || createObservatoryGuideState());
        const eligible = this.getObservatoryArchiveEntries({ limit: 24, featuredOnly: true })
            .filter((entry) => this.isObservatoryEntryExpeditionEligible(entry));
        const hasSelected = !!state.selectedRecordId && eligible.some((entry) => entry.id === state.selectedRecordId);
        const nextSelected = hasSelected ? state.selectedRecordId : (eligible[0]?.id || '');
        if (nextSelected !== state.selectedRecordId) {
            this.observatoryGuideState = this.normalizeObservatoryGuideState({
                selectedRecordId: nextSelected,
                updatedAt: nextSelected ? Date.now() : 0
            });
            this.persistObservatoryGuideState();
        } else {
            this.observatoryGuideState = state;
        }
        return this.observatoryGuideState.selectedRecordId || '';
    };

    Game.prototype.getSelectedObservatoryExpeditionGuide = function (options = {}) {
        this.ensureChallengeHubBootState();
        if (!options.silentSync) {
            this.syncObservatoryGuideSelection();
        }
        const guideState = this.observatoryGuideState || createObservatoryGuideState();
        const eligible = this.getObservatoryArchiveEntries({ limit: 24, featuredOnly: true })
            .filter((entry) => this.isObservatoryEntryExpeditionEligible(entry));
        const entry = eligible.find((item) => item.id === guideState.selectedRecordId) || eligible[0] || null;
        if (!entry) return null;
        const themeMeta = resolveChallengeThemeMeta(entry.rule, entry.mode);
        return {
            id: entry.id,
            title: entry.title,
            score: entry.score,
            note: entry.note,
            icon: entry.icon,
            type: entry.type,
            mode: entry.mode,
            modeLabel: entry.modeLabel,
            seedSignature: entry.seedSignature,
            themeKey: entry.themeKey || themeMeta.key,
            themeLabel: entry.themeLabel || themeMeta.label,
            featuredTier: entry.featuredTier,
            featuredTags: normalizeTagList(entry.featuredTags, 4),
            metricLine: formatChallengeMetricLine(entry.metrics),
            preferredNodes: Array.isArray(entry.preferredNodes) && entry.preferredNodes.length > 0
                ? entry.preferredNodes.slice(0, 4)
                : themeMeta.preferredNodes.slice(0, 4),
            insight: entry.insight && hasChallengeArchiveInsight(entry.insight)
                ? normalizeChallengeArchiveInsight(entry.insight)
                : null,
            expeditionNote: themeMeta.expeditionNote,
            compareHint: themeMeta.compareHint
        };
    };

    Game.prototype.selectObservatoryExpeditionGuide = function (recordId = '', options = {}) {
        this.ensureChallengeHubBootState();
        const entry = this.getObservatoryArchiveEntries({ limit: 24, featuredOnly: true })
            .find((item) => item.id === String(recordId || ''));
        if (!this.isObservatoryEntryExpeditionEligible(entry)) return false;
        this.observatoryGuideState = this.normalizeObservatoryGuideState({
            selectedRecordId: entry.id,
            updatedAt: Date.now()
        });
        this.persistObservatoryGuideState();
        if (!options.silent && typeof Utils !== 'undefined' && Utils?.showBattleLog) {
            Utils.showBattleLog(`观星台已把【${entry.title}】设为远征线索。接下来裂界远征会读取这份精选命盘。`, {
                category: 'system',
                duration: 2800
            });
        }
        if (this.currentScreen === 'challenge-screen') {
            this.initChallengeHub();
        }
        return true;
    };

    Game.prototype.buildObservatoryThemeComparison = function (options = {}) {
        this.ensureChallengeHubBootState();
        const focusRule = options.rule && typeof options.rule === 'object' ? options.rule : null;
        const focusMode = ['daily', 'weekly', 'global'].includes(options.mode) ? options.mode : 'daily';
        const selectedGuide = this.getSelectedObservatoryExpeditionGuide({ silentSync: true });
        const fallbackMeta = focusRule
            ? resolveChallengeThemeMeta(focusRule, focusMode)
            : (selectedGuide || { themeKey: 'assault', themeLabel: '前压爆发', compareHint: CHALLENGE_THEME_LIBRARY.assault.compareHint });
        const focusThemeKey = String(options.themeKey || fallbackMeta.themeKey || fallbackMeta.key || 'assault');
        const focusThemeLabel = String(options.themeLabel || fallbackMeta.themeLabel || fallbackMeta.label || '前压爆发');
        const compareHint = String(options.compareHint || fallbackMeta.compareHint || CHALLENGE_THEME_LIBRARY.assault.compareHint);
        const selectedGuideId = this.syncObservatoryGuideSelection();
        const sourceEntries = this.getObservatoryArchiveEntries({ limit: 24, types: ['challenge', 'replay'] });
        let resolvedThemeKey = focusThemeKey;
        let resolvedThemeLabel = focusThemeLabel;
        let entries = sourceEntries
            .filter((entry) => entry.themeKey === resolvedThemeKey)
            .sort((a, b) => clampInt(b.score, 0) - clampInt(a.score, 0) || clampInt(b.at, 0) - clampInt(a.at, 0))
            .slice(0, 3);
        if (entries.length === 0 && selectedGuide?.themeKey && selectedGuide.themeKey !== resolvedThemeKey) {
            resolvedThemeKey = selectedGuide.themeKey;
            resolvedThemeLabel = selectedGuide.themeLabel || resolvedThemeLabel;
            entries = sourceEntries
                .filter((entry) => entry.themeKey === resolvedThemeKey)
                .sort((a, b) => clampInt(b.score, 0) - clampInt(a.score, 0) || clampInt(b.at, 0) - clampInt(a.at, 0))
                .slice(0, 3);
        }
        entries = entries
            .map((entry, index, source) => {
                const topScore = clampInt(source[0]?.score, 0);
                const delta = topScore - clampInt(entry.score, 0);
                return {
                    id: entry.id,
                    title: entry.title,
                    score: clampInt(entry.score, 0),
                    completed: !!entry.completed,
                    replayOnly: !!entry.replayOnly,
                    seedSignature: entry.seedSignature,
                    modeLabel: entry.modeLabel,
                    featuredTier: entry.featuredTier,
                    featuredTags: normalizeTagList(entry.featuredTags, 4),
                    metricLine: formatChallengeMetricLine(entry.metrics),
                    deltaText: delta > 0 ? `距主题最高分 ${delta}` : '当前主题最高分',
                    selected: selectedGuideId === entry.id,
                    expeditionEligible: this.isObservatoryEntryExpeditionEligible(entry),
                    replayable: !!entry.replayable,
                    note: entry.note || '',
                    insight: entry.insight && hasChallengeArchiveInsight(entry.insight)
                        ? normalizeChallengeArchiveInsight(entry.insight)
                        : null
                };
            });
        return {
            themeKey: resolvedThemeKey,
            themeLabel: resolvedThemeLabel,
            compareHint,
            entries,
            emptyText: `当前还没有「${resolvedThemeLabel}」主题的观星样本。先完成一轮同主题挑战，把打法差异压进观察站。`
        };
    };

    Game.prototype.normalizeChallengeProgressState = function (rawState = null) {
        const source = rawState && typeof rawState === 'object' ? rawState : {};
        const sessions = source.sessions && typeof source.sessions === 'object' ? source.sessions : {};
        const normalizeBucket = (bucketName) => {
            const bucket = sessions[bucketName] && typeof sessions[bucketName] === 'object' ? sessions[bucketName] : {};
            const next = {};
            Object.keys(bucket).forEach((key) => {
                const entry = bucket[key] && typeof bucket[key] === 'object' ? bucket[key] : {};
                next[key] = {
                    attempts: clampInt(entry.attempts, 0),
                    completions: clampInt(entry.completions, 0),
                    bestScore: clampInt(entry.bestScore, 0),
                    totalScore: clampInt(entry.totalScore, 0),
                    claimedRewards: entry.claimedRewards && typeof entry.claimedRewards === 'object'
                        ? { ...entry.claimedRewards }
                        : {},
                    records: Array.isArray(entry.records)
                        ? entry.records
                            .filter((item) => item && typeof item === 'object')
                            .slice(0, 8)
                            .map((item) => ({
                                score: clampInt(item.score, 0),
                                completed: !!item.completed,
                                at: clampInt(item.at, 0),
                                ruleId: String(item.ruleId || ''),
                                ruleName: String(item.ruleName || ''),
                                reason: String(item.reason || ''),
                                modeLabel: String(item.modeLabel || ''),
                                icon: String(item.icon || '✦'),
                                themeLabel: String(item.themeLabel || ''),
                                featuredTier: String(item.featuredTier || ''),
                                featuredTags: normalizeTagList(item.featuredTags, 4)
                            }))
                        : [],
                    lastResult: entry.lastResult && typeof entry.lastResult === 'object'
                        ? {
                            score: clampInt(entry.lastResult.score, 0),
                            completed: !!entry.lastResult.completed,
                            at: clampInt(entry.lastResult.at, 0),
                            ruleId: String(entry.lastResult.ruleId || ''),
                            ruleName: String(entry.lastResult.ruleName || ''),
                            reason: String(entry.lastResult.reason || ''),
                            themeLabel: String(entry.lastResult.themeLabel || ''),
                            featuredTier: String(entry.lastResult.featuredTier || '')
                        }
                        : null
                };
            });
            return next;
        };

        return {
            sessions: {
                daily: normalizeBucket('daily'),
                weekly: normalizeBucket('weekly'),
                global: normalizeBucket('global')
            },
            recentResults: Array.isArray(source.recentResults)
                ? source.recentResults
                    .filter((item) => item && typeof item === 'object')
                    .slice(0, 12)
                    .map((item) => ({
                        mode: ['daily', 'weekly', 'global'].includes(item.mode) ? item.mode : 'daily',
                        score: clampInt(item.score, 0),
                        completed: !!item.completed,
                        at: clampInt(item.at, 0),
                        ruleName: String(item.ruleName || ''),
                        icon: String(item.icon || '✦'),
                        reason: String(item.reason || ''),
                        themeLabel: String(item.themeLabel || ''),
                        featuredTier: String(item.featuredTier || ''),
                        featuredTags: normalizeTagList(item.featuredTags, 4)
                    }))
                : []
        };
    };

    Game.prototype.loadChallengeProgressState = function () {
        try {
            const raw = typeof localStorage !== 'undefined'
                ? localStorage.getItem(CHALLENGE_PROGRESS_KEY)
                : null;
            return this.normalizeChallengeProgressState(raw ? JSON.parse(raw) : null);
        } catch (error) {
            return this.normalizeChallengeProgressState();
        }
    };

    Game.prototype.saveChallengeProgressState = function () {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(CHALLENGE_PROGRESS_KEY, JSON.stringify(this.challengeProgressState || this.normalizeChallengeProgressState()));
        } catch (error) {
            console.warn('Save challenge progress failed:', error);
        }
    };

    Game.prototype.getChallengeProgressEntry = function (mode = 'daily', rotationKey = '', create = false) {
        this.ensureChallengeHubBootState();
        const bucket = this.challengeProgressState.sessions[mode];
        if (!bucket[rotationKey] && create) {
            bucket[rotationKey] = createProgressEntry();
        }
        return bucket[rotationKey] || null;
    };

    Game.prototype.getChallengeRuleCatalog = function (mode = 'daily') {
        const rules = (typeof CHALLENGE_RULES !== 'undefined' && CHALLENGE_RULES && Array.isArray(CHALLENGE_RULES[mode]))
            ? CHALLENGE_RULES[mode]
            : [];
        return rules.map((item) => clone(item)).filter(Boolean);
    };

    Game.prototype.getChallengeRotationKey = function (mode = 'daily', date = new Date()) {
        return mode === 'daily' ? getDayKey(date) : getWeekKey(date);
    };

    Game.prototype.pickChallengeRule = function (mode = 'daily', rotationKey = '') {
        const catalog = this.getChallengeRuleCatalog(mode);
        if (catalog.length === 0) return null;
        const index = hashString(`${mode}:${rotationKey}`) % catalog.length;
        return clone(catalog[index]);
    };

    Game.prototype.getChallengeScoreDefaults = function () {
        const base = (typeof CHALLENGE_RULES !== 'undefined' && CHALLENGE_RULES && CHALLENGE_RULES.scoreDefaults)
            ? CHALLENGE_RULES.scoreDefaults
            : {};
        return {
            battleWin: clampInt(base.battleWin, 0),
            eliteWin: clampInt(base.eliteWin, 0),
            bossWin: clampInt(base.bossWin, 0),
            realmClear: clampInt(base.realmClear, 0),
            lawDiscover: clampInt(base.lawDiscover, 0),
            treasureDiscover: clampInt(base.treasureDiscover, 0),
            hpBonus: clampInt(base.hpBonus, 0),
            completeBonus: clampInt(base.completeBonus, 0)
        };
    };

    Game.prototype.buildChallengeDangerProfile = function (rule = null, mode = 'daily', themeMeta = null) {
        const source = rule && typeof rule === 'object' ? rule : {};
        const safeMode = ['daily', 'weekly', 'global'].includes(mode) ? mode : 'daily';
        const meta = themeMeta || resolveChallengeThemeMeta(source, safeMode);
        const modifiers = source.battleModifiers && typeof source.battleModifiers === 'object'
            ? source.battleModifiers
            : {};
        const enemyHpMul = Math.max(1, safeNumber(modifiers.enemyHpMul, 1));
        const enemyAtkMul = Math.max(1, safeNumber(modifiers.enemyAtkMul, 1));
        const openingBlock = clampInt(modifiers.enemyOpeningBlock, 0, 12);
        const debuffValue = clampInt(modifiers.enemyDebuff?.value, 0, 4);
        const goalRealm = clampInt(source.goalRealm, 1, 18);
        const vowCount = Array.isArray(source.vowIds) ? source.vowIds.filter(Boolean).length : 0;
        const searchText = [
            source.name,
            source.intro,
            source.objective,
            ...(Array.isArray(source.tags) ? source.tags : [])
        ].join(' ');

        const modeBase = safeMode === 'daily' ? 28 : safeMode === 'weekly' ? 42 : 58;
        const burstTags = /爆发|前压|压制|收头|强袭|快攻|猎首|抢拍|先手/;
        const attritionTags = /长线|守|稳|续航|护盾|跨章|冲榜|法宝|炼器|守阵|耐压/;
        const controlTags = /控场|推演|预判|手牌|弱化|易伤|天机|法则|读图|星录/;
        const executionTags = /双誓|连携|节拍|统一规则|固定命盘|冲分|命盘|试炼|复刻/;

        const burstValue = clampInt(
            12
            + Math.round((enemyAtkMul - 1) * 120)
            + (/vulnerable|weak/.test(String(modifiers.enemyDebuff?.type || '')) ? 9 + debuffValue * 3 : 0)
            + (burstTags.test(searchText) ? 8 : 0)
            + (safeMode === 'global' ? 6 : 0),
            0,
            100
        );
        const attritionValue = clampInt(
            14
            + Math.round((enemyHpMul - 1) * 110)
            + openingBlock * 3
            + Math.max(0, goalRealm - 3) * 2
            + (attritionTags.test(searchText) ? 8 : 0),
            0,
            100
        );
        const controlValue = clampInt(
            10
            + (modifiers.enemyDebuff?.type ? 10 + debuffValue * 5 : 0)
            + (controlTags.test(searchText) ? 8 : 0)
            + (meta?.key === 'oracle' ? 6 : 0),
            0,
            100
        );
        const executionValue = clampInt(
            12
            + Math.max(0, goalRealm - 3) * 5
            + vowCount * 6
            + (executionTags.test(searchText) ? 8 : 0)
            + (safeMode === 'global' ? 10 : safeMode === 'weekly' ? 4 : 0),
            0,
            100
        );

        const axes = [
            { ...CHALLENGE_DANGER_AXIS_LIBRARY.burst, value: burstValue },
            { ...CHALLENGE_DANGER_AXIS_LIBRARY.attrition, value: attritionValue },
            { ...CHALLENGE_DANGER_AXIS_LIBRARY.control, value: controlValue },
            { ...CHALLENGE_DANGER_AXIS_LIBRARY.execution, value: executionValue }
        ];
        const dominantAxis = axes.reduce((best, axis) => (axis.value > best.value ? axis : best), axes[0]);
        const axisAverage = axes.reduce((sum, axis) => sum + axis.value, 0) / Math.max(1, axes.length);
        const index = clampInt(
            modeBase
            + axisAverage * 0.55
            + dominantAxis.value * 0.12
            + Math.max(0, goalRealm - 3) * 0.8,
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

        return normalizeChallengeDangerProfile({
            index,
            tierId,
            tierLabel,
            dominantAxisId: dominantAxis.id,
            dominantAxisLabel: dominantAxis.label,
            summary: `${dominantAxis.label}偏高：${dominantAxis.summary}`,
            counterplay: dominantAxis.counterplay,
            reserveGuidance: dominantAxis.reserveGuidance,
            line: `试炼压强 DRI ${index} / 100 · ${tierLabel} · 主轴 ${dominantAxis.label}`,
            axes: axes.map((axis) => ({
                id: axis.id,
                label: axis.label,
                value: axis.value
            }))
        });
    };

    Game.prototype.buildChallengeBundle = function (mode = 'daily', date = new Date()) {
        this.ensureChallengeHubBootState();
        const safeMode = ['daily', 'weekly', 'global'].includes(mode) ? mode : 'daily';
        const rotationKey = this.getChallengeRotationKey(safeMode, date);
        const meta = HUB_META[safeMode] || HUB_META.daily;
        const rule = this.pickChallengeRule(safeMode, rotationKey);
        const seedSignature = this.buildChallengeSeedSignature(safeMode, rotationKey, rule);
        const entry = this.getChallengeProgressEntry(safeMode, rotationKey, false) || createProgressEntry();
        const themeMeta = this.getChallengeThemeMeta(rule, safeMode);
        const dangerProfile = this.buildChallengeDangerProfile(rule, safeMode, themeMeta);
        const currentValue = safeMode === 'daily'
            ? clampInt(entry.completions, 0)
            : safeMode === 'weekly'
                ? clampInt(entry.totalScore, 0)
                : clampInt(entry.bestScore, 0);
        const rewards = Array.isArray(rule?.rewardTrack)
            ? rule.rewardTrack.map((reward) => {
                const target = clampInt(reward.target, 0);
                const claimed = !!entry.claimedRewards[reward.id];
                return {
                    ...clone(reward),
                    target,
                    claimed,
                    currentValue,
                    ready: !claimed && currentValue >= target,
                    progressText: safeMode === 'daily'
                        ? `${Math.min(target || 1, currentValue)}/${Math.max(1, target || 1)}`
                        : `${currentValue}/${target}`
                };
            })
            : [];

        const records = Array.isArray(entry.records) ? entry.records.slice(0, 5) : [];
        return {
            mode: safeMode,
            rotationKey,
            rotationLabel: formatDateLabel(safeMode, rotationKey),
            meta,
            rule,
            themeMeta,
            dangerProfile,
            seedSignature,
            progress: {
                attempts: clampInt(entry.attempts, 0),
                completions: clampInt(entry.completions, 0),
                bestScore: clampInt(entry.bestScore, 0),
                totalScore: clampInt(entry.totalScore, 0),
                currentValue
            },
            rewards,
            records,
            leaderboard: safeMode === 'global'
                ? this.buildChallengeLeaderboard(rotationKey, entry)
                : []
        };
    };

    Game.prototype.buildReplayBundleFromArchiveEntry = function (recordId = '') {
        const entry = this.getObservatoryArchiveEntries({ limit: 24 })
            .find((item) => item && item.id === String(recordId || ''));
        if (!entry || !entry.replayable || !entry.rule?.id) return null;
        const safeMode = ['daily', 'weekly', 'global'].includes(entry.mode) ? entry.mode : 'daily';
        const themeMeta = this.getChallengeThemeMeta(entry.rule, safeMode);
        const archiveInsight = normalizeChallengeArchiveInsight(buildChallengeArchiveInsight({
            ...entry,
            replayOnly: true
        }, themeMeta));
        return {
            mode: safeMode,
            rotationKey: entry.rotationKey || `archive-${entry.id}`,
            rotationLabel: entry.rotationLabel || formatDateLabel(safeMode, entry.rotationKey || ''),
            meta: {
                title: '观星台 · 命盘回放',
                subtitle: '按历史命盘重开，不计入当前轮换奖励，只保留观星留痕与回放得分。',
                label: '观星回放',
                accentClass: HUB_META[safeMode]?.accentClass || 'daily'
            },
            rule: clone(entry.rule),
            themeMeta,
            dangerProfile: this.buildChallengeDangerProfile(entry.rule, safeMode, themeMeta),
            seedSignature: entry.seedSignature || this.buildChallengeSeedSignature(safeMode, entry.rotationKey || entry.id, entry.rule),
            archiveInsight: hasChallengeArchiveInsight(archiveInsight) ? archiveInsight : null,
            progress: createProgressEntry(),
            rewards: [],
            records: [],
            leaderboard: [],
            replayOnly: true,
            archiveEntryId: entry.id
        };
    };

    Game.prototype.buildChallengeLeaderboard = function (rotationKey = '', entry = null) {
        const baseNames = ['丹渊', '孤衡', '南烛', '玄泠', '照川', '寂河', '停云', '白述'];
        const scores = [];
        const seed = hashString(`leaderboard:${rotationKey}`);
        for (let i = 0; i < baseNames.length; i += 1) {
            const wobble = ((seed >> (i % 8)) & 31) - 15;
            scores.push({
                name: baseNames[i],
                score: 1280 - i * 58 + wobble,
                highlight: false
            });
        }
        if (entry && clampInt(entry.bestScore, 0) > 0) {
            scores.push({
                name: '你',
                score: clampInt(entry.bestScore, 0),
                highlight: true
            });
        } else {
            scores.push({
                name: '你',
                score: 0,
                highlight: true
            });
        }
        scores.sort((a, b) => b.score - a.score);
        return scores.slice(0, 8).map((item, index) => ({
            rank: index + 1,
            name: item.name,
            score: clampInt(item.score, 0),
            highlight: !!item.highlight
        }));
    };

    Game.prototype.getSanctumOverviewData = function () {
        const data = typeof originalGetSanctumOverviewData === 'function'
            ? originalGetSanctumOverviewData.call(this)
            : null;
        if (!data || !Array.isArray(data.rooms)) return data;
        const archive = this.getObservatoryArchiveSummary();
        data.rooms = data.rooms.map((room) => {
            if (room && room.id === 'observatory') {
                return {
                    ...room,
                    focus: '周挑战 / 章节预兆 / 观星留痕',
                    note: archive.totalRecords > 0
                        ? `已留下 ${archive.totalRecords} 条观星留痕，其中 ${archive.replayCount} 次为命盘回放，可继续复盘旧命盘。`
                        : '今日天机、七日劫数与众生试炼已经接入观星台，可直接从洞府切到本周轮换。',
                    actionLabel: archive.totalRecords > 0 ? '查看观星台' : '查看周挑战',
                    actionType: 'challenge',
                    actionValue: 'daily'
                };
            }
            return room;
        });
        data.progress = {
            ...(data.progress || {}),
            observatoryTraces: archive.totalRecords,
            observatoryReplays: archive.replayCount
        };
        if (Array.isArray(data.researches) && !data.researches.some((item) => item && item.id === 'observatory_archive')) {
            data.researches.push({
                id: 'observatory_archive',
                room: '观星台',
                name: '命盘留痕库',
                progress: archive.totalRecords > 0 ? 1 : 0,
                goal: 1,
                reward: '观星台会沉淀命盘签、挑战留痕与回放入口，让旧命盘可直接重开。',
                section: 'sanctum',
                actionType: 'challenge',
                actionValue: 'daily',
                ready: archive.totalRecords > 0,
                progressText: `${archive.totalRecords > 0 ? 1 : 0}/1`
            });
        }
        return data;
    };

    Game.prototype.showChallengeHub = function (tab = 'daily') {
        this.ensureChallengeHubBootState();
        this.challengeHubState.tab = ['daily', 'weekly', 'global'].includes(tab) ? tab : 'daily';
        this.showScreen('challenge-screen');
        this.initChallengeHub();
    };

    Game.prototype.switchChallengeTab = function (tab = 'daily') {
        this.ensureChallengeHubBootState();
        this.challengeHubState.tab = ['daily', 'weekly', 'global'].includes(tab) ? tab : 'daily';
        if (this.currentScreen !== 'challenge-screen') {
            this.showChallengeHub(this.challengeHubState.tab);
            return;
        }
        this.initChallengeHub();
    };

    Game.prototype.initChallengeHub = function () {
        if (typeof document === 'undefined') return;
        this.ensureChallengeHubBootState();
        const tab = this.challengeHubState.tab || 'daily';
        const bundle = this.buildChallengeBundle(tab);
        if (!bundle || !bundle.rule) return;

        const titleEl = document.getElementById('challenge-hub-title');
        const subtitleEl = document.getElementById('challenge-hub-subtitle');
        const summaryEl = document.getElementById('challenge-hub-summary');
        const rulesEl = document.getElementById('challenge-hub-rules');
        const rewardsEl = document.getElementById('challenge-hub-rewards');
        const recordsEl = document.getElementById('challenge-hub-records');
        const sideEl = document.getElementById('challenge-hub-side');
        const rankingEl = document.getElementById('challenge-hub-ranking');
        const launchEl = document.getElementById('challenge-hub-launch');

        if (titleEl) titleEl.textContent = bundle.meta.title;
        if (subtitleEl) subtitleEl.textContent = bundle.meta.subtitle;

        document.querySelectorAll('#challenge-screen [data-challenge-tab]').forEach((button) => {
            button.classList.toggle('active', button.dataset.challengeTab === tab);
        });

        const run = this.activeChallengeRun;
        const isCurrentRun = !!run
            && !run.resolved
            && run.mode === bundle.mode
            && run.rotationKey === bundle.rotationKey;
        const archiveSummary = this.getObservatoryArchiveSummary();
        const themeMeta = bundle.themeMeta || this.getChallengeThemeMeta(bundle.rule, bundle.mode);
        const dangerProfile = bundle.dangerProfile || this.buildChallengeDangerProfile(bundle.rule, bundle.mode, themeMeta);
        const selectedGuide = this.getSelectedObservatoryExpeditionGuide({ silentSync: true });
        const comparison = this.buildObservatoryThemeComparison({
            mode: bundle.mode,
            rule: bundle.rule,
            themeKey: themeMeta.key,
            themeLabel: themeMeta.label,
            compareHint: themeMeta.compareHint
        });
        const replayEntries = this.getObservatoryArchiveEntries({
            mode: bundle.mode,
            types: ['challenge', 'replay'],
            replayableOnly: true,
            limit: 3
        });

        if (summaryEl) {
            const tags = normalizeTagList([themeMeta.signatureTag, ...(Array.isArray(bundle.rule.tags) ? bundle.rule.tags : [])], 4);
            summaryEl.innerHTML = `
                <article class="challenge-focus-card ${escapeHtml(bundle.meta.accentClass)}">
                    <div class="challenge-focus-head">
                        <span class="challenge-focus-icon">${escapeHtml(bundle.rule.icon || '✦')}</span>
                        <div>
                            <span class="challenge-kicker">${escapeHtml(bundle.meta.label)} · ${escapeHtml(bundle.rotationLabel)}</span>
                            <h3>${escapeHtml(bundle.rule.name || '未知试炼')}</h3>
                        </div>
                    </div>
                    <p class="challenge-focus-intro">${escapeHtml(bundle.rule.intro || bundle.rule.objective || '观星台正在推演当前试炼。')}</p>
                    <div class="challenge-focus-meta">
                        <div class="challenge-meta-chip"><strong>${escapeHtml(bundle.rule.targetChapter || '未知章节')}</strong><span>目标章节</span></div>
                        <div class="challenge-meta-chip"><strong>第 ${clampInt(bundle.rule.goalRealm, 1, 18)} 重</strong><span>完成线</span></div>
                        <div class="challenge-meta-chip"><strong>${clampInt(bundle.progress.bestScore, 0)}</strong><span>${bundle.mode === 'weekly' ? '历史最高单次' : '当前最高得分'}</span></div>
                        <div class="challenge-meta-chip"><strong>${bundle.mode === 'weekly' ? clampInt(bundle.progress.totalScore, 0) : clampInt(bundle.progress.completions, 0)}</strong><span>${bundle.mode === 'weekly' ? '周累计积分' : '完成次数'}</span></div>
                    </div>
                    <div class="challenge-tag-strip">
                        ${tags.map((tag) => `<span class="challenge-tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                    <div class="challenge-seed-line">
                        <span class="challenge-seed-chip">命盘签 ${escapeHtml(bundle.seedSignature)}</span>
                        <span>完成后会生成命盘精选标签，并可直接设为远征线索。</span>
                    </div>
                    <div class="challenge-theme-note">
                        <strong>${escapeHtml(themeMeta.label)}</strong>
                        <span>${escapeHtml(comparison.compareHint)}</span>
                    </div>
                    <div class="challenge-danger-band">
                        <div class="challenge-danger-head">
                            <strong>试炼压强</strong>
                            <span>DRI ${dangerProfile.index} / 100 · ${escapeHtml(dangerProfile.tierLabel)}</span>
                        </div>
                        <p class="challenge-danger-summary">${escapeHtml(dangerProfile.summary)}</p>
                        <div class="challenge-danger-grid">
                            ${dangerProfile.axes.map((axis) => `
                                <div class="challenge-danger-chip">
                                    <strong>${clampInt(axis.value, 0)}</strong>
                                    <span>${escapeHtml(axis.label)}</span>
                                </div>
                            `).join('')}
                        </div>
                        <div class="challenge-danger-foot">
                            <span>主轴：${escapeHtml(dangerProfile.dominantAxisLabel)}</span>
                            <span>对策：${escapeHtml(dangerProfile.counterplay)}</span>
                        </div>
                    </div>
                    ${selectedGuide
                ? `<div class="challenge-inline-note">当前远征线索：${escapeHtml(selectedGuide.title)} · ${escapeHtml(selectedGuide.themeLabel)}。</div>`
                : '<div class="challenge-inline-note">当前还没有精选命盘线索，先完成一轮挑战，把最佳答卷压进观察站。</div>'}
                    ${isCurrentRun ? `<div class="challenge-inline-note">当前已有进行中的 ${escapeHtml(bundle.meta.label)}，回地图即可继续冲线。</div>` : ''}
                </article>
            `;
        }

        if (rulesEl) {
            const scoreDefaults = this.getChallengeScoreDefaults();
            const rules = [
                `指定角色：${this.getCharacterDisplayName(bundle.rule.characterId)}`,
                `开局命格：${this.getChallengeMetaName('destiny', bundle.rule.runDestinyId)}`,
                `同行灵契：${this.getChallengeMetaName('spirit', bundle.rule.spiritCompanionId)}`,
                Array.isArray(bundle.rule.vowIds) && bundle.rule.vowIds.length > 0
                    ? `固定誓约：${bundle.rule.vowIds.map((id) => this.getChallengeMetaName('vow', id)).join(' / ')}`
                    : '固定誓约：无',
                bundle.rule.battleModifiers?.enemyOpeningBlock > 0
                    ? `敌方开场护盾 +${clampInt(bundle.rule.battleModifiers.enemyOpeningBlock, 0)}`
                    : null,
                Number(bundle.rule.battleModifiers?.enemyHpMul || 1) > 1
                    ? `敌方生命 x${safeNumber(bundle.rule.battleModifiers.enemyHpMul, 1).toFixed(2)}`
                    : null,
                Number(bundle.rule.battleModifiers?.enemyAtkMul || 1) > 1
                    ? `敌方伤害 x${safeNumber(bundle.rule.battleModifiers.enemyAtkMul, 1).toFixed(2)}`
                    : null,
                bundle.rule.battleModifiers?.enemyDebuff?.type
                    ? `额外压制：${bundle.rule.battleModifiers.enemyDebuff.type} ${clampInt(bundle.rule.battleModifiers.enemyDebuff.value, 0)}`
                    : null,
                `基础计分：普通战 +${scoreDefaults.battleWin} / 精英 +${scoreDefaults.eliteWin} / Boss +${scoreDefaults.bossWin}`,
                `章节推进：每破一重 +${scoreDefaults.realmClear}，完成线 +${scoreDefaults.completeBonus}`
            ].filter(Boolean);

            rulesEl.innerHTML = rules.map((line) => `
                <article class="challenge-rule-card">
                    <span class="challenge-rule-bullet">✦</span>
                    <p>${escapeHtml(line)}</p>
                </article>
            `).join('');
        }

        if (rewardsEl) {
            rewardsEl.innerHTML = bundle.rewards.map((reward) => `
                <article class="challenge-reward-card ${reward.claimed ? 'claimed' : reward.ready ? 'ready' : 'locked'}">
                    <div class="challenge-reward-top">
                        <div>
                            <strong>${escapeHtml(reward.label)}</strong>
                            <p>${escapeHtml(reward.rewardText || '完成后可领取奖励。')}</p>
                        </div>
                        <span class="challenge-reward-progress">${escapeHtml(reward.progressText)}</span>
                    </div>
                    <button type="button" class="collection-inline-btn"
                        ${reward.ready && !reward.claimed ? '' : 'disabled'}
                        onclick="game.claimChallengeMilestone('${escapeHtml(bundle.mode)}', '${escapeHtml(reward.id)}')">${reward.claimed ? '已领取' : reward.ready ? '领取奖励' : '未达成'}</button>
                </article>
            `).join('');
        }

        if (recordsEl) {
            const source = bundle.records.length > 0
                ? bundle.records
                : (Array.isArray(this.challengeProgressState?.recentResults) ? this.challengeProgressState.recentResults.filter((item) => item.mode === bundle.mode).slice(0, 4) : []);
            const currentRecordsMarkup = source.length > 0
                ? source.map((record) => `
                    <article class="challenge-record-item">
                        <div>
                            <strong>${escapeHtml(record.ruleName || bundle.rule.name || '试炼记录')}</strong>
                            <p>${record.completed ? '完成试炼' : '试炼中断'} · 得分 ${clampInt(record.score, 0)}${record.themeLabel ? ` · ${escapeHtml(record.themeLabel)}` : ''}</p>
                            ${Array.isArray(record.featuredTags) && record.featuredTags.length > 0
                ? `<div class="challenge-record-tags">${record.featuredTags.map((tag) => `<span class="challenge-tag">${escapeHtml(tag)}</span>`).join('')}</div>`
                : ''}
                        </div>
                        <span>${escapeHtml(this.formatCollectionTimestamp ? this.formatCollectionTimestamp(record.at) : formatDateLabel(bundle.mode, bundle.rotationKey))}</span>
                    </article>
                `).join('')
                : '<div class="codex-empty-state">当前轮换还没有留痕，去跑一局把分数打出来。</div>';
            const replayMarkup = replayEntries.length > 0
                ? replayEntries.map((entry) => `
                    <article class="challenge-record-item replayable">
                        <div>
                            <strong>${escapeHtml(entry.title || bundle.rule.name || '观星留痕')}</strong>
                            <p>${escapeHtml(entry.replayOnly ? '命盘回放' : '观星留痕')} · ${entry.completed ? '完成' : '中断'} · 得分 ${clampInt(entry.score, 0)} · ${escapeHtml(entry.themeLabel || themeMeta.label)}</p>
                            <div class="challenge-record-subline">
                                <span class="challenge-seed-chip">${escapeHtml(entry.seedSignature || '命盘签未定')}</span>
                                <span>${escapeHtml(entry.rotationLabel || formatDateLabel(entry.mode, entry.rotationKey))}</span>
                                <span>${escapeHtml(entry.featuredTier || '留痕')}</span>
                            </div>
                            ${entry.featuredTags.length > 0
                ? `<div class="challenge-record-tags">${entry.featuredTags.map((tag) => `<span class="challenge-tag">${escapeHtml(tag)}</span>`).join('')}</div>`
                : ''}
                            ${renderChallengeInsightMarkup(entry.insight)}
                        </div>
                        <div class="challenge-record-actions">
                            <span>${escapeHtml(this.formatCollectionTimestamp ? this.formatCollectionTimestamp(entry.at) : formatDateLabel(entry.mode, entry.rotationKey))}</span>
                            <button type="button" class="collection-inline-btn secondary"
                                onclick="game.beginObservatoryReplay('${escapeHtml(entry.id)}')">复盘命盘</button>
                            ${entry.featured
                ? `<button type="button" class="collection-inline-btn ${selectedGuide?.id === entry.id ? 'secondary' : ''}"
                                ${selectedGuide?.id === entry.id ? 'disabled' : ''}
                                onclick="game.selectObservatoryExpeditionGuide('${escapeHtml(entry.id)}')">${selectedGuide?.id === entry.id ? '当前远征线索' : '设为远征线索'}</button>`
                : ''}
                        </div>
                    </article>
                `).join('')
                : '<div class="codex-empty-state">观星留痕还没有可回放命盘，先完成一轮挑战或命盘回放。</div>';
            const comparisonMarkup = comparison.entries.length > 0
                ? comparison.entries.map((entry) => `
                    <article class="challenge-compare-card ${entry.selected ? 'selected' : ''}">
                        <div class="challenge-compare-head">
                            <div>
                                <strong>${escapeHtml(entry.title)}</strong>
                                <p>${escapeHtml(entry.note || entry.metricLine)}</p>
                            </div>
                            <span class="challenge-compare-score">${clampInt(entry.score, 0)} 分</span>
                        </div>
                        <div class="challenge-record-subline">
                            <span class="challenge-seed-chip">${escapeHtml(entry.seedSignature || '命盘签未定')}</span>
                            <span>${escapeHtml(entry.featuredTier || '留痕')}</span>
                            <span>${escapeHtml(entry.deltaText)}</span>
                        </div>
                        <div class="challenge-record-tags">
                            ${entry.featuredTags.map((tag) => `<span class="challenge-tag">${escapeHtml(tag)}</span>`).join('')}
                        </div>
                        ${renderChallengeInsightMarkup(entry.insight, { compact: true })}
                        <div class="challenge-compare-meta">
                            <span>${escapeHtml(entry.modeLabel)}</span>
                            <span>${escapeHtml(entry.metricLine)}</span>
                        </div>
                        <div class="challenge-compare-actions">
                            ${entry.expeditionEligible
                ? `<button type="button" class="collection-inline-btn ${entry.selected ? 'secondary' : ''}"
                                ${entry.selected ? 'disabled' : ''}
                                onclick="game.selectObservatoryExpeditionGuide('${escapeHtml(entry.id)}')">${entry.selected ? '当前远征线索' : '设为远征线索'}</button>`
                : ''}
                            ${entry.replayable
                ? `<button type="button" class="collection-inline-btn secondary"
                                onclick="game.beginObservatoryReplay('${escapeHtml(entry.id)}')">复盘命盘</button>`
                : ''}
                        </div>
                    </article>
                `).join('')
                : `<div class="codex-empty-state">${escapeHtml(comparison.emptyText)}</div>`;
            recordsEl.innerHTML = `
                <section class="challenge-record-section">
                    <div class="challenge-record-section-head">
                        <strong>当前轮换记录</strong>
                        <span>${escapeHtml(bundle.rotationLabel)}</span>
                    </div>
                    ${currentRecordsMarkup}
                </section>
                <section class="challenge-record-section">
                    <div class="challenge-record-section-head">
                        <strong>观星留痕</strong>
                        <span>${escapeHtml(`${replayEntries.length} 条可回放命盘`)}</span>
                    </div>
                    ${replayMarkup}
                </section>
                <section class="challenge-record-section">
                    <div class="challenge-record-section-head">
                        <strong>同主题对比</strong>
                        <span>${escapeHtml(`${comparison.themeLabel} · ${comparison.entries.length} 份样本`)}</span>
                    </div>
                    <p class="challenge-compare-note">${escapeHtml(comparison.compareHint)}</p>
                    ${comparisonMarkup}
                </section>
            `;
        }

        if (sideEl) {
            const nextReward = bundle.rewards.find((item) => !item.claimed) || null;
            sideEl.innerHTML = `
                <section class="codex-side-card">
                    <span class="codex-side-kicker">难度同轴</span>
                    <h3>试炼压强 DRI ${dangerProfile.index}</h3>
                    <div class="codex-summary-grid two-cols">
                        ${dangerProfile.axes.map((axis) => `
                            <div class="codex-summary-chip">
                                <strong>${clampInt(axis.value, 0)}</strong>
                                <span>${escapeHtml(axis.label)}</span>
                            </div>
                        `).join('')}
                    </div>
                    <p>${escapeHtml(`${dangerProfile.tierLabel} · ${dangerProfile.summary}`)}</p>
                    <p class="collection-muted">${escapeHtml(dangerProfile.reserveGuidance)}</p>
                </section>
                <section class="codex-side-card">
                    <span class="codex-side-kicker">观星总览</span>
                    <h3>${escapeHtml(bundle.meta.label)}进度</h3>
                    <div class="codex-summary-grid two-cols">
                        <div class="codex-summary-chip"><strong>${clampInt(bundle.progress.attempts, 0)}</strong><span>挑战次数</span></div>
                        <div class="codex-summary-chip"><strong>${clampInt(bundle.progress.completions, 0)}</strong><span>完成次数</span></div>
                        <div class="codex-summary-chip"><strong>${clampInt(bundle.progress.bestScore, 0)}</strong><span>最高得分</span></div>
                        <div class="codex-summary-chip"><strong>${bundle.mode === 'weekly' ? clampInt(bundle.progress.totalScore, 0) : clampInt(bundle.rewards.filter((item) => item.claimed).length, 0)}</strong><span>${bundle.mode === 'weekly' ? '累计积分' : '已领奖励'}</span></div>
                    </div>
                    <p>${escapeHtml(bundle.rule.objective || '观星台正在推演这一轮的试炼目标。')}</p>
                    <p class="collection-muted">当前命盘签：${escapeHtml(bundle.seedSignature)}</p>
                </section>
                <section class="codex-side-card">
                    <span class="codex-side-kicker">下一目标</span>
                    <h3>${escapeHtml(nextReward ? nextReward.label : '当前轮换已清空奖励')}</h3>
                    <p>${escapeHtml(nextReward ? nextReward.rewardText : '本轮奖励已全部领取，可以继续冲更高分。')}</p>
                </section>
                <section class="codex-side-card">
                    <span class="codex-side-kicker">观星留痕</span>
                    <h3>回放档案</h3>
                    <div class="codex-summary-grid two-cols">
                        <div class="codex-summary-chip"><strong>${archiveSummary.totalRecords}</strong><span>总留痕</span></div>
                        <div class="codex-summary-chip"><strong>${archiveSummary.replayCount}</strong><span>命盘回放</span></div>
                        <div class="codex-summary-chip"><strong>${archiveSummary.replayableCount}</strong><span>可回放命盘</span></div>
                        <div class="codex-summary-chip"><strong>${archiveSummary.featuredCount}</strong><span>精选命盘</span></div>
                    </div>
                    <p>${escapeHtml(archiveSummary.latest?.title
                ? `最近留痕：${archiveSummary.latest.title}。`
                : '完成任意观星挑战后，命盘签和成绩都会沉淀到这里。')}</p>
                    ${renderChallengeInsightMarkup(archiveSummary.latest?.insight, { compact: true })}
                </section>
                <section class="codex-side-card">
                    <span class="codex-side-kicker">远征线索</span>
                    <h3>${escapeHtml(selectedGuide?.title || '尚未锁定精选命盘')}</h3>
                    <div class="codex-summary-grid two-cols">
                        <div class="codex-summary-chip"><strong>${escapeHtml(selectedGuide?.themeLabel || themeMeta.label)}</strong><span>样本主题</span></div>
                        <div class="codex-summary-chip"><strong>${escapeHtml(selectedGuide?.featuredTier || '待精选')}</strong><span>命盘评级</span></div>
                        <div class="codex-summary-chip"><strong>${escapeHtml(selectedGuide?.seedSignature || '待生成')}</strong><span>命盘签</span></div>
                        <div class="codex-summary-chip"><strong>${clampInt(selectedGuide?.score || 0)}</strong><span>参考得分</span></div>
                    </div>
                    <p>${escapeHtml(selectedGuide?.expeditionNote || '远征入口会读取这里选中的精选命盘，并生成小幅 bonus 选项。')}</p>
                    ${selectedGuide?.featuredTags?.length
                ? `<div class="challenge-record-tags">${selectedGuide.featuredTags.map((tag) => `<span class="challenge-tag">${escapeHtml(tag)}</span>`).join('')}</div>`
                : ''}
                    ${renderChallengeInsightMarkup(selectedGuide?.insight, { compact: true })}
                </section>
            `;
        }

        if (rankingEl) {
            rankingEl.innerHTML = bundle.mode === 'global'
                ? `
                    <section class="codex-side-card">
                        <span class="codex-side-kicker">众生榜</span>
                        <h3>本周统一排行</h3>
                        <div class="challenge-leaderboard">
                            ${bundle.leaderboard.map((item) => `
                                <div class="challenge-rank-row ${item.highlight ? 'highlight' : ''}">
                                    <span>#${item.rank}</span>
                                    <strong>${escapeHtml(item.name)}</strong>
                                    <span>${clampInt(item.score, 0)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </section>
                `
                : `
                    <section class="codex-side-card">
                        <span class="codex-side-kicker">冲分建议</span>
                        <h3>怎样把分打高</h3>
                        <p>优先保证章节推进，再补法则与法宝发现。血量越健康，结算奖励越容易再抬一档。</p>
                    </section>
                `;
        }

        if (launchEl) {
            launchEl.innerHTML = `
                <button type="button" class="menu-btn primary challenge-launch-btn"
                    onclick="game.beginChallengeStart('${escapeHtml(bundle.mode)}')">${isCurrentRun ? '继续当前挑战' : `开启${escapeHtml(bundle.meta.label)}`}</button>
                <p class="collection-muted">${escapeHtml(isCurrentRun
                ? '当前轮换已在进行中，继续推进地图即可累计分数。'
                : '将固定角色、命格、灵契与章节目标，并直接开始新的挑战轮回。')}</p>
            `;
        }

        this.renderMainMenuChallengeSummary();
        this.renderChallengeRunBanner();
    };

    Game.prototype.getCharacterDisplayName = function (characterId = '') {
        if (typeof CHARACTERS !== 'undefined' && CHARACTERS && CHARACTERS[characterId]) {
            return CHARACTERS[characterId].name || characterId;
        }
        return characterId || '未知角色';
    };

    Game.prototype.getChallengeMetaName = function (type = 'destiny', itemId = '') {
        if (!itemId) return '未指定';
        if (type === 'destiny' && typeof this.getRunDestinyMetaById === 'function') {
            return this.getRunDestinyMetaById(itemId, 1)?.name || itemId;
        }
        if (type === 'spirit' && typeof this.getSpiritCompanionMetaById === 'function') {
            return this.getSpiritCompanionMetaById(itemId, 1)?.name || itemId;
        }
        if (type === 'vow' && typeof this.getRunVowMetaById === 'function') {
            return this.getRunVowMetaById(itemId, 1)?.name || itemId;
        }
        return itemId;
    };

    Game.prototype.renderMainMenuChallengeSummary = function () {
        if (typeof document === 'undefined') return;
        this.ensureChallengeHubBootState();
        const dailyEl = document.getElementById('menu-daily-omen-card');
        const weeklyEl = document.getElementById('menu-weekly-ordeal-card');
        const unlockEl = document.getElementById('menu-unlock-focus-card');
        if (!dailyEl || !weeklyEl || !unlockEl) return;

        const daily = this.buildChallengeBundle('daily');
        const weekly = this.buildChallengeBundle('weekly');
        const nextWeeklyReward = weekly.rewards.find((item) => !item.claimed);
        const latestUnlock = typeof this.getCollectionUnlockHistory === 'function'
            ? this.getCollectionUnlockHistory(1)[0] || null
            : null;

        dailyEl.innerHTML = `
            <span class="menu-oracle-kicker">今日天机</span>
            <h4>${escapeHtml(daily.rule?.name || '未解出')}</h4>
            <p>${escapeHtml(daily.rule?.objective || '观星台正在推演今日轮换。')}</p>
            <div class="menu-oracle-meta">
                <span>${escapeHtml(daily.rule?.targetChapter || '未知章节')}</span>
                <strong>${clampInt(daily.progress.completions, 0)} 次完成</strong>
            </div>
            <button type="button" class="collection-inline-btn" onclick="game.showChallengeHub('daily')">查看今日天机</button>
        `;

        weeklyEl.innerHTML = `
            <span class="menu-oracle-kicker">七日劫数</span>
            <h4>${escapeHtml(weekly.rule?.name || '未解出')}</h4>
            <p>${escapeHtml(nextWeeklyReward ? `下一奖励：${nextWeeklyReward.label}` : '本周奖励已清空，可继续冲更高分。')}</p>
            <div class="menu-oracle-meta">
                <span>${escapeHtml(weekly.rotationLabel)}</span>
                <strong>${clampInt(weekly.progress.totalScore, 0)} 分</strong>
            </div>
            <button type="button" class="collection-inline-btn" onclick="game.showChallengeHub('weekly')">查看周积分</button>
        `;

        unlockEl.innerHTML = latestUnlock
            ? `
                <span class="menu-oracle-kicker">最近解锁</span>
                <h4>${escapeHtml(latestUnlock.name || '藏经阁更新')}</h4>
                <p>${escapeHtml(latestUnlock.note || '藏经阁有新的研究记录。')}</p>
                <div class="menu-oracle-meta">
                    <span>${escapeHtml(this.formatCollectionTimestamp ? this.formatCollectionTimestamp(latestUnlock.timestamp) : '最近')}</span>
                    <strong>洞府可复盘</strong>
                </div>
                <button type="button" class="collection-inline-btn" onclick="game.showCollection('sanctum')">查看洞府</button>
            `
            : `
                <span class="menu-oracle-kicker">最近解锁</span>
                <h4>洞府新线索</h4>
                <p>去打一局、补一条法则或灵契研究，主菜单会在这里持续更新。</p>
                <div class="menu-oracle-meta">
                    <span>藏经阁</span>
                    <strong>等待入档</strong>
                </div>
                <button type="button" class="collection-inline-btn" onclick="game.showCollection('sanctum')">打开洞府</button>
            `;
    };

    Game.prototype.beginChallengeStart = function (mode = 'daily') {
        this.ensureChallengeHubBootState();
        const bundle = this.buildChallengeBundle(mode);
        if (!bundle || !bundle.rule) return false;

        if (
            this.activeChallengeRun
            && !this.activeChallengeRun.resolved
            && this.activeChallengeRun.mode === bundle.mode
            && this.activeChallengeRun.rotationKey === bundle.rotationKey
        ) {
            this.showScreen('map-screen');
            return true;
        }

        this.pendingChallengeStart = {
            mode: bundle.mode,
            rotationKey: bundle.rotationKey,
            rule: clone(bundle.rule),
            modeLabel: bundle.meta.label,
            bundleSnapshot: clone(bundle),
            replayOnly: false,
            seedSignature: bundle.seedSignature || '',
            archiveInsight: bundle.archiveInsight && hasChallengeArchiveInsight(bundle.archiveInsight)
                ? normalizeChallengeArchiveInsight(bundle.archiveInsight)
                : null
        };

        if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
            Utils.showBattleLog(`观星台已锁定【${bundle.rule.name}】。接下来会以固定命盘开启新一轮挑战。`, {
                category: 'system',
                duration: 2600
            });
        }

        if (typeof this.openSaveSlotsWithSync === 'function') {
            this.openSaveSlotsWithSync();
        } else if (typeof this.showCharacterSelection === 'function') {
            this.showCharacterSelection();
        }
        return true;
    };

    Game.prototype.beginObservatoryReplay = function (recordId = '') {
        this.ensureChallengeHubBootState();
        const bundle = this.buildReplayBundleFromArchiveEntry(recordId);
        if (!bundle || !bundle.rule) return false;

        if (
            this.activeChallengeRun
            && !this.activeChallengeRun.resolved
            && this.activeChallengeRun.replayOnly
            && this.activeChallengeRun.archiveEntryId === bundle.archiveEntryId
        ) {
            this.showScreen('map-screen');
            return true;
        }

        this.pendingChallengeStart = {
            mode: bundle.mode,
            rotationKey: bundle.rotationKey,
            rule: clone(bundle.rule),
            modeLabel: bundle.meta.label,
            bundleSnapshot: clone(bundle),
            replayOnly: true,
            seedSignature: bundle.seedSignature || '',
            archiveEntryId: bundle.archiveEntryId || '',
            archiveInsight: bundle.archiveInsight && hasChallengeArchiveInsight(bundle.archiveInsight)
                ? normalizeChallengeArchiveInsight(bundle.archiveInsight)
                : null
        };

        if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
            Utils.showBattleLog(`观星台开始回放【${bundle.rule.name}】。本轮只记录留痕，不计入当前轮换奖励。`, {
                category: 'system',
                duration: 2800
            });
        }

        if (typeof this.openSaveSlotsWithSync === 'function') {
            this.openSaveSlotsWithSync();
        } else if (typeof this.showCharacterSelection === 'function') {
            this.showCharacterSelection();
        }
        return true;
    };

    Game.prototype.clearPendingChallengeStart = function () {
        this.pendingChallengeStart = null;
    };

    Game.prototype.normalizeActiveChallengeRun = function (rawRun = null) {
        const source = rawRun && typeof rawRun === 'object' ? rawRun : null;
        if (!source || !source.ruleId || !source.mode || !source.rotationKey) return null;
        return {
            mode: ['daily', 'weekly', 'global'].includes(source.mode) ? source.mode : 'daily',
            modeLabel: String(source.modeLabel || HUB_META[source.mode]?.label || HUB_META.daily.label),
            rotationKey: String(source.rotationKey || ''),
            rotationLabel: String(source.rotationLabel || formatDateLabel(source.mode, source.rotationKey)),
            ruleId: String(source.ruleId || ''),
            ruleName: String(source.ruleName || ''),
            icon: String(source.icon || '✦'),
            intro: String(source.intro || ''),
            objective: String(source.objective || ''),
            goalRealm: clampInt(source.goalRealm, 1, 18),
            targetChapter: String(source.targetChapter || ''),
            characterId: String(source.characterId || ''),
            runDestinyId: String(source.runDestinyId || ''),
            spiritCompanionId: String(source.spiritCompanionId || ''),
            vowIds: Array.isArray(source.vowIds) ? source.vowIds.map((id) => String(id || '')).filter(Boolean).slice(0, 2) : [],
            tags: Array.isArray(source.tags) ? source.tags.map((item) => String(item || '')).filter(Boolean).slice(0, 6) : [],
            battleModifiers: source.battleModifiers && typeof source.battleModifiers === 'object' ? clone(source.battleModifiers) : {},
            scoreWeights: source.scoreWeights && typeof source.scoreWeights === 'object'
                ? { ...this.getChallengeScoreDefaults(), ...clone(source.scoreWeights) }
                : this.getChallengeScoreDefaults(),
            startedAt: clampInt(source.startedAt, 0),
            resolved: !!source.resolved,
            completed: !!source.completed,
            finalScore: clampInt(source.finalScore, 0),
            seedSignature: String(source.seedSignature || ''),
            replayOnly: !!source.replayOnly,
            archiveEntryId: String(source.archiveEntryId || ''),
            archiveInsight: source.archiveInsight && hasChallengeArchiveInsight(source.archiveInsight)
                ? normalizeChallengeArchiveInsight(source.archiveInsight)
                : null,
            progress: {
                battleWins: clampInt(source.progress?.battleWins, 0),
                eliteWins: clampInt(source.progress?.eliteWins, 0),
                bossWins: clampInt(source.progress?.bossWins, 0),
                realmClears: clampInt(source.progress?.realmClears, 0),
                startLawCount: clampInt(source.progress?.startLawCount, 0),
                startTreasureCount: clampInt(source.progress?.startTreasureCount, 0),
                currentScore: clampInt(source.progress?.currentScore, 0)
            }
        };
    };

    Game.prototype.createActiveChallengeRun = function (bundle) {
        const defaults = this.getChallengeScoreDefaults();
        return this.normalizeActiveChallengeRun({
            mode: bundle.mode,
            modeLabel: bundle.meta.label,
            rotationKey: bundle.rotationKey,
            rotationLabel: bundle.rotationLabel,
            ruleId: bundle.rule.id,
            ruleName: bundle.rule.name,
            icon: bundle.rule.icon || '✦',
            intro: bundle.rule.intro || '',
            objective: bundle.rule.objective || '',
            goalRealm: bundle.rule.goalRealm || 3,
            targetChapter: bundle.rule.targetChapter || '',
            characterId: bundle.rule.characterId || '',
            runDestinyId: bundle.rule.runDestinyId || '',
            spiritCompanionId: bundle.rule.spiritCompanionId || '',
            vowIds: Array.isArray(bundle.rule.vowIds) ? bundle.rule.vowIds.slice(0, 2) : [],
            tags: Array.isArray(bundle.rule.tags) ? bundle.rule.tags.slice(0, 6) : [],
            battleModifiers: bundle.rule.battleModifiers || {},
            scoreWeights: { ...defaults, ...(bundle.rule.scoreWeights || {}) },
            startedAt: Date.now(),
            seedSignature: String(bundle.seedSignature || this.buildChallengeSeedSignature(bundle.mode, bundle.rotationKey, bundle.rule)),
            replayOnly: !!bundle.replayOnly,
            archiveEntryId: String(bundle.archiveEntryId || ''),
            archiveInsight: bundle.archiveInsight && hasChallengeArchiveInsight(bundle.archiveInsight)
                ? normalizeChallengeArchiveInsight(bundle.archiveInsight)
                : null,
            progress: {
                battleWins: 0,
                eliteWins: 0,
                bossWins: 0,
                realmClears: 0,
                startLawCount: Array.isArray(this.player?.collectedLaws) ? this.player.collectedLaws.length : 0,
                startTreasureCount: Array.isArray(this.player?.collectedTreasures) ? this.player.collectedTreasures.length : 0,
                currentScore: 0
            }
        });
    };

    Game.prototype.persistActiveChallengeRun = function () {
        try {
            if (typeof localStorage === 'undefined') return;
            if (!this.activeChallengeRun) {
                localStorage.removeItem(ACTIVE_CHALLENGE_RUN_KEY);
                return;
            }
            localStorage.setItem(ACTIVE_CHALLENGE_RUN_KEY, JSON.stringify({
                currentSaveSlot: this.currentSaveSlot,
                activeRun: this.activeChallengeRun
            }));
        } catch (error) {
            console.warn('Persist active challenge run failed:', error);
        }
    };

    Game.prototype.restoreActiveChallengeRun = function () {
        try {
            if (typeof localStorage === 'undefined') return null;
            const raw = localStorage.getItem(ACTIVE_CHALLENGE_RUN_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            const savedSlot = parsed && parsed.currentSaveSlot !== undefined ? parsed.currentSaveSlot : null;
            if (
                savedSlot !== null
                && this.currentSaveSlot !== null
                && this.currentSaveSlot !== undefined
                && clampInt(savedSlot, -1) !== clampInt(this.currentSaveSlot, -2)
            ) {
                return null;
            }
            return this.normalizeActiveChallengeRun(parsed ? parsed.activeRun : null);
        } catch (error) {
            return null;
        }
    };

    Game.prototype.clearActiveChallengeRun = function () {
        this.activeChallengeRun = null;
        this.persistActiveChallengeRun();
        this.renderChallengeRunBanner();
    };

    Game.prototype.computeActiveChallengeScore = function (run = null) {
        const source = run || this.activeChallengeRun;
        if (!source) return 0;
        const weights = source.scoreWeights || this.getChallengeScoreDefaults();
        const currentLawCount = Array.isArray(this.player?.collectedLaws) ? this.player.collectedLaws.length : 0;
        const currentTreasureCount = Array.isArray(this.player?.collectedTreasures) ? this.player.collectedTreasures.length : 0;
        const lawGains = Math.max(0, currentLawCount - clampInt(source.progress?.startLawCount, 0));
        const treasureGains = Math.max(0, currentTreasureCount - clampInt(source.progress?.startTreasureCount, 0));
        const hpRatio = this.player && this.player.maxHp > 0
            ? Math.max(0, Math.min(1, safeNumber(this.player.currentHp, 0) / safeNumber(this.player.maxHp, 1)))
            : 0;
        return clampInt(
            clampInt(source.progress?.battleWins, 0) * clampInt(weights.battleWin, 0)
            + clampInt(source.progress?.eliteWins, 0) * clampInt(weights.eliteWin, 0)
            + clampInt(source.progress?.bossWins, 0) * clampInt(weights.bossWin, 0)
            + clampInt(source.progress?.realmClears, 0) * clampInt(weights.realmClear, 0)
            + lawGains * clampInt(weights.lawDiscover, 0)
            + treasureGains * clampInt(weights.treasureDiscover, 0)
            + Math.floor(hpRatio * clampInt(weights.hpBonus, 0))
            + (source.completed ? clampInt(weights.completeBonus, 0) : 0),
            0
        );
    };

    Game.prototype.refreshActiveChallengeScore = function (shouldRender = true) {
        if (!this.activeChallengeRun) return 0;
        this.activeChallengeRun.progress.currentScore = this.computeActiveChallengeScore(this.activeChallengeRun);
        this.persistActiveChallengeRun();
        if (shouldRender) this.renderChallengeRunBanner();
        return this.activeChallengeRun.progress.currentScore;
    };

    Game.prototype.buildChallengeArchiveProfile = function (run, options = {}) {
        const sourceRun = run && typeof run === 'object' ? run : {};
        const rule = normalizeChallengeRuleSnapshot({
            id: sourceRun.ruleId,
            name: sourceRun.ruleName,
            icon: sourceRun.icon,
            intro: sourceRun.intro,
            objective: sourceRun.objective,
            targetChapter: sourceRun.targetChapter,
            goalRealm: sourceRun.goalRealm,
            characterId: sourceRun.characterId,
            runDestinyId: sourceRun.runDestinyId,
            spiritCompanionId: sourceRun.spiritCompanionId,
            vowIds: sourceRun.vowIds,
            tags: sourceRun.tags,
            scoreWeights: sourceRun.scoreWeights,
            battleModifiers: sourceRun.battleModifiers
        });
        const currentLawCount = Array.isArray(this.player?.collectedLaws) ? this.player.collectedLaws.length : 0;
        const currentTreasureCount = Array.isArray(this.player?.collectedTreasures) ? this.player.collectedTreasures.length : 0;
        const metrics = normalizeChallengeMetricSnapshot({
            hpRatio: this.player && this.player.maxHp > 0
                ? Math.max(0, Math.min(1, safeNumber(this.player.currentHp, 0) / safeNumber(this.player.maxHp, 1)))
                : 0,
            lawGains: Math.max(0, currentLawCount - clampInt(sourceRun.progress?.startLawCount, 0)),
            treasureGains: Math.max(0, currentTreasureCount - clampInt(sourceRun.progress?.startTreasureCount, 0)),
            battleWins: clampInt(sourceRun.progress?.battleWins, 0),
            eliteWins: clampInt(sourceRun.progress?.eliteWins, 0),
            bossWins: clampInt(sourceRun.progress?.bossWins, 0),
            realmClears: clampInt(sourceRun.progress?.realmClears, 0)
        });
        const themeMeta = resolveChallengeThemeMeta(rule, sourceRun.mode);
        const preferredNodes = themeMeta.preferredNodes.slice(0, 4);
        const insight = normalizeChallengeArchiveInsight(buildChallengeArchiveInsight({
            rule,
            mode: sourceRun.mode,
            replayOnly: !!sourceRun.replayOnly,
            completed: !!options.completed,
            metrics,
            preferredNodes,
            reason: String(options.reason || '')
        }, themeMeta));
        return {
            rule,
            metrics,
            themeKey: themeMeta.key,
            themeLabel: themeMeta.label,
            featuredTier: buildChallengeFeaturedTier(sourceRun, metrics, options),
            featuredTags: buildChallengeFeaturedTags(rule, sourceRun, metrics, themeMeta, options),
            preferredNodes,
            metricLine: formatChallengeMetricLine(metrics),
            insight: hasChallengeArchiveInsight(insight) ? insight : null,
            compareHint: themeMeta.compareHint,
            expeditionNote: themeMeta.expeditionNote
        };
    };

    Game.prototype.recordChallengeCompletion = function (run, options = {}) {
        const entry = this.getChallengeProgressEntry(run.mode, run.rotationKey, true);
        const profile = options.featuredProfile || this.buildChallengeArchiveProfile(run, options);
        entry.attempts += 1;
        entry.completions += options.completed ? 1 : 0;
        entry.bestScore = Math.max(clampInt(entry.bestScore, 0), clampInt(run.finalScore, 0));
        if (run.mode === 'weekly') {
            entry.totalScore = clampInt(entry.totalScore, 0) + clampInt(run.finalScore, 0);
        }
        const record = {
            score: clampInt(run.finalScore, 0),
            completed: !!options.completed,
            at: Date.now(),
            ruleId: run.ruleId,
            ruleName: run.ruleName,
            reason: String(options.reason || ''),
            modeLabel: run.modeLabel,
            icon: run.icon,
            themeLabel: profile.themeLabel || '',
            featuredTier: profile.featuredTier || '',
            featuredTags: normalizeTagList(profile.featuredTags, 4)
        };
        entry.records = [record, ...(Array.isArray(entry.records) ? entry.records : [])].slice(0, 8);
        entry.lastResult = {
            score: clampInt(run.finalScore, 0),
            completed: !!options.completed,
            at: record.at,
            ruleId: run.ruleId,
            ruleName: run.ruleName,
            reason: String(options.reason || ''),
            themeLabel: profile.themeLabel || '',
            featuredTier: profile.featuredTier || ''
        };
        this.challengeProgressState.recentResults = [
            {
                mode: run.mode,
                score: clampInt(run.finalScore, 0),
                completed: !!options.completed,
                at: record.at,
                ruleName: run.ruleName,
                icon: run.icon,
                reason: String(options.reason || ''),
                themeLabel: profile.themeLabel || '',
                featuredTier: profile.featuredTier || '',
                featuredTags: normalizeTagList(profile.featuredTags, 4)
            },
            ...(Array.isArray(this.challengeProgressState.recentResults) ? this.challengeProgressState.recentResults : [])
        ].slice(0, 12);
        this.saveChallengeProgressState();
    };

    Game.prototype.recordChallengeArchiveResult = function (run, options = {}) {
        if (!run) return null;
        const profile = options.featuredProfile || this.buildChallengeArchiveProfile(run, options);
        const rule = profile.rule;
        const statusLabel = options.completed ? '完成' : '中断';
        const replayNote = run.replayOnly ? ' · 回放不计奖励' : '';
        const tagNote = profile.featuredTags.length > 0 ? ` · ${profile.featuredTags.join(' / ')}` : '';
        const note = `${statusLabel} · 得分 ${clampInt(run.finalScore, 0)}${replayNote}${tagNote}`;
        const entry = this.recordObservatoryArchiveEntry({
            id: `${run.replayOnly ? 'replay' : 'challenge'}:${run.mode}:${run.rotationKey}:${run.ruleId}:${clampInt(run.finalScore, 0)}:${hashString(JSON.stringify(run.progress || {}))}:${Date.now()}`,
            type: run.replayOnly ? 'replay' : 'challenge',
            mode: run.mode,
            modeLabel: run.replayOnly ? '观星回放' : run.modeLabel,
            rotationKey: run.rotationKey,
            rotationLabel: run.rotationLabel || formatDateLabel(run.mode, run.rotationKey),
            seedSignature: run.seedSignature || this.buildChallengeSeedSignature(run.mode, run.rotationKey, rule),
            title: run.ruleName,
            note,
            icon: run.icon || '🔭',
            score: run.finalScore,
            completed: !!options.completed,
            at: Date.now(),
            reason: String(options.reason || ''),
            replayOnly: !!run.replayOnly,
            archiveEntryId: run.archiveEntryId || '',
            originLabel: run.replayOnly ? '观星回放' : '观星留痕',
            themeKey: profile.themeKey,
            themeLabel: profile.themeLabel,
            featuredTier: profile.featuredTier,
            featuredTags: profile.featuredTags,
            metrics: profile.metrics,
            preferredNodes: profile.preferredNodes,
            insight: profile.insight,
            rule
        });
        if (typeof this.recordCollectionUnlock === 'function') {
            this.recordCollectionUnlock('observatory', {
                id: entry?.id || `${run.mode}:${run.rotationKey}:${run.ruleId}`,
                name: `${run.replayOnly ? '命盘回放' : '观星留痕'}·${run.ruleName}`,
                icon: run.icon || '🔭',
                note
            });
        }
        return entry;
    };

    Game.prototype.finalizeActiveChallengeRun = function (options = {}) {
        if (!this.activeChallengeRun) return null;
        const run = this.activeChallengeRun;
        run.completed = !!options.completed;
        run.resolved = true;
        run.finalScore = this.computeActiveChallengeScore(run);
        run.progress.currentScore = run.finalScore;
        const featuredProfile = this.buildChallengeArchiveProfile(run, options);
        if (!run.replayOnly) {
            this.recordChallengeCompletion(run, { ...options, featuredProfile });
        }
        this.recordChallengeArchiveResult(run, { ...options, featuredProfile });

        if (!run.replayOnly && options.completed && typeof this.recordCollectionUnlock === 'function') {
            this.recordCollectionUnlock('challenge', {
                id: `challenge:${run.mode}:${run.rotationKey}:${run.ruleId}`,
                name: `${run.modeLabel}·${run.ruleName}`,
                icon: run.icon || '🜂',
                note: `本轮得分 ${run.finalScore}，可回观星台领取对应奖励。`
            });
        }

        if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
            Utils.showBattleLog(`【${run.modeLabel}】${options.completed ? '完成' : '中断'}：${run.ruleName}，得分 ${run.finalScore}${run.replayOnly ? '（不计奖励）' : ''}`);
        }

        this.clearActiveChallengeRun();
        this.renderMainMenuChallengeSummary();
        if (this.currentScreen === 'challenge-screen') {
            this.initChallengeHub();
        }
        return run;
    };

    Game.prototype.grantChallengePvpCoins = function (amount = 0) {
        const delta = clampInt(amount, 0);
        if (delta <= 0 || typeof PVPService === 'undefined' || !PVPService) return false;
        if (typeof PVPService.loadEconomyState !== 'function' || typeof PVPService.saveEconomyState !== 'function') return false;
        const current = PVPService.loadEconomyState();
        let next = PVPService.normalizeEconomyState({
            ...current,
            coins: clampInt(current.coins, 0) + delta,
            totalEarned: clampInt(current.totalEarned, 0) + delta
        });
        if (typeof PVPService.appendEconomyLog === 'function') {
            next = PVPService.appendEconomyLog(next, {
                type: 'challenge_reward',
                coins: delta,
                detail: '周挑战奖励'
            });
        }
        PVPService.saveEconomyState(next);
        return true;
    };

    Game.prototype.grantChallengePvpItem = function (itemId = '', fallbackCoins = 0) {
        if (!itemId || typeof PVPService === 'undefined' || !PVPService) {
            return this.grantChallengePvpCoins(fallbackCoins);
        }
        if (
            typeof PVPService.getShopItemById !== 'function'
            || typeof PVPService.loadEconomyState !== 'function'
            || typeof PVPService.saveEconomyState !== 'function'
        ) {
            return this.grantChallengePvpCoins(fallbackCoins);
        }
        const item = PVPService.getShopItemById(itemId);
        if (!item) {
            return this.grantChallengePvpCoins(fallbackCoins);
        }
        const current = PVPService.loadEconomyState();
        if (current.ownedItems && current.ownedItems[item.id]) {
            return this.grantChallengePvpCoins(fallbackCoins);
        }
        let next = PVPService.normalizeEconomyState({
            ...current,
            ownedItems: {
                ...(current.ownedItems || {}),
                [item.id]: true
            },
            ...(item.type === 'skin' && !current.equippedSkinId ? { equippedSkinId: item.id } : {}),
            ...(item.type === 'title' && !current.equippedTitleId ? { equippedTitleId: item.id } : {})
        });
        if (typeof PVPService.appendEconomyLog === 'function') {
            next = PVPService.appendEconomyLog(next, {
                type: 'challenge_reward',
                itemId: item.id,
                itemName: item.name || null,
                detail: '周挑战解锁'
            });
        }
        PVPService.saveEconomyState(next);
        return true;
    };

    Game.prototype.claimChallengeMilestone = function (mode = 'daily', rewardId = '') {
        this.ensureChallengeHubBootState();
        const bundle = this.buildChallengeBundle(mode);
        if (!bundle || !bundle.rule || !rewardId) return false;
        const reward = bundle.rewards.find((item) => item.id === rewardId);
        if (!reward || reward.claimed || !reward.ready) return false;

        const entry = this.getChallengeProgressEntry(bundle.mode, bundle.rotationKey, true);
        entry.claimedRewards[rewardId] = true;
        const logs = [];
        (reward.rewards || []).forEach((grant) => {
            if (!grant || !grant.kind) return;
            if (grant.kind === 'pvpCoins') {
                if (this.grantChallengePvpCoins(grant.amount)) logs.push(`天道币 +${clampInt(grant.amount, 0)}`);
            } else if (grant.kind === 'legacyEssence') {
                if (typeof this.awardLegacyEssence === 'function') {
                    this.awardLegacyEssence(clampInt(grant.amount, 0), '周挑战奖励', { silent: true });
                    logs.push(`传承精魄 +${clampInt(grant.amount, 0)}`);
                }
            } else if (grant.kind === 'pvpItem') {
                const ok = this.grantChallengePvpItem(grant.itemId, grant.fallbackCoins);
                if (ok) {
                    const fallbackItem = (typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getShopItemById === 'function')
                        ? PVPService.getShopItemById(grant.itemId)
                        : null;
                    logs.push(fallbackItem ? `解锁 ${fallbackItem.name}` : '已发放周挑战外观奖励');
                }
            } else if (grant.kind === 'codexRecord') {
                if (typeof this.recordCollectionUnlock === 'function') {
                    this.recordCollectionUnlock('challenge', {
                        id: grant.id || `${bundle.mode}:${rewardId}`,
                        name: grant.name || reward.label,
                        icon: grant.icon || bundle.rule.icon || '✦',
                        note: grant.note || reward.rewardText || '周挑战奖励已入档。'
                    });
                    logs.push(grant.name || '观星记录已入档');
                }
            }
        });

        this.saveChallengeProgressState();
        if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
            Utils.showBattleLog(`观星台奖励已领取：${logs.join(' / ') || reward.rewardText}`);
        }
        this.initChallengeHub();
        this.renderMainMenuChallengeSummary();
        return true;
    };

    Game.prototype.renderChallengeRunBanner = function () {
        if (typeof document === 'undefined') return;
        const banner = this.ensureChallengeRunBannerHost();
        if (!banner) return;
        const run = this.activeChallengeRun;
        const visible = !!run && !run.resolved && this.currentScreen === 'map-screen';
        banner.style.display = visible ? 'flex' : 'none';
        if (!visible) {
            banner.innerHTML = '';
            return;
        }
        const score = this.computeActiveChallengeScore(run);
        run.progress.currentScore = score;
        this.persistActiveChallengeRun();
        const replayFocus = run.replayOnly && run.archiveInsight
            ? (() => {
                const insight = normalizeChallengeArchiveInsight(run.archiveInsight);
                return insight.focusLines[0] || insight.summary || insight.title || '';
            })()
            : '';
        banner.innerHTML = `
            <span class="challenge-run-chip">${escapeHtml(run.modeLabel)}</span>
            <div class="challenge-run-text">
                <strong>${escapeHtml(run.ruleName)}</strong>
                <span>${escapeHtml(run.targetChapter || `目标至第 ${run.goalRealm} 重`)}${run.seedSignature ? ` · 命盘签 ${run.seedSignature}` : ''}${(() => {
                    const dangerProfile = this.buildChallengeDangerProfile(run, run.mode);
                    return dangerProfile.index > 0 ? ` · DRI ${dangerProfile.index} · ${dangerProfile.tierLabel}` : '';
                })()}</span>
                ${replayFocus ? `<span class="challenge-run-focus">训练重点：${escapeHtml(replayFocus)}</span>` : ''}
            </div>
            <div class="challenge-run-stats">
                <span>${run.replayOnly ? '观星回放 · 不计奖励' : `完成线 第 ${run.goalRealm} 重`}</span>
                <strong>${score} 分</strong>
            </div>
        `;
    };

    Game.prototype.ensureChallengeRunBannerHost = function () {
        if (typeof document === 'undefined') return null;
        const existing = document.getElementById('challenge-run-banner');
        if (existing) return existing;

        const mapScreen = document.getElementById('map-screen');
        if (!mapScreen) return null;

        const banner = document.createElement('div');
        banner.id = 'challenge-run-banner';
        banner.className = 'challenge-run-banner';
        banner.style.display = 'none';

        const modernMapShell = mapScreen.querySelector('.map-screen-v3');
        if (modernMapShell) {
            const anchor = modernMapShell.querySelector('.map-scroll-container');
            if (anchor && anchor.parentNode === modernMapShell) {
                modernMapShell.insertBefore(banner, anchor);
            } else {
                modernMapShell.appendChild(banner);
            }
            return banner;
        }

        const legacyAnchor = mapScreen.querySelector('.map-container, .map-footer');
        if (legacyAnchor && legacyAnchor.parentNode === mapScreen) {
            mapScreen.insertBefore(banner, legacyAnchor);
        } else {
            mapScreen.appendChild(banner);
        }
        return banner;
    };

    Game.prototype.renderChallengeLockedSelection = function (type = 'destiny') {
        const pending = this.pendingChallengeStart;
        if (!pending || !pending.rule) return false;
        const host = document.getElementById(type === 'destiny' ? 'run-destiny-selection' : 'spirit-companion-selection');
        const summary = document.getElementById(type === 'destiny' ? 'run-destiny-summary' : 'spirit-companion-summary');
        if (!host) return false;

        const meta = type === 'destiny'
            ? this.getRunDestinyMetaById(pending.rule.runDestinyId, 1)
            : this.getSpiritCompanionMetaById(pending.rule.spiritCompanionId, 1);
        if (!meta) return false;

        host.innerHTML = `
            <div class="run-destiny-card selected challenge-locked-card ${type === 'spirit' ? 'run-spirit-card' : ''}">
                <div class="run-destiny-head">
                    <span class="run-destiny-icon">${escapeHtml(meta.icon || '✦')}</span>
                    <div class="run-destiny-title-group">
                        <span class="run-destiny-name">${escapeHtml(meta.name || '未知条目')}</span>
                        <span class="run-destiny-tier">${escapeHtml(type === 'destiny' ? `${meta.category || '命格'} · ${meta.tierLabel || '初印'}` : (meta.title || `${meta.category || '灵契'} · ${meta.tierLabel || '初契'}`))}</span>
                    </div>
                    <span class="challenge-lock-pill">挑战锁定</span>
                </div>
                <div class="run-destiny-desc">${escapeHtml(meta.description || '')}</div>
                <div class="run-destiny-summary">${escapeHtml(type === 'destiny'
                ? (meta.summary || meta.playstyle || meta.description || '')
                : `${meta.passiveDesc || ''} ${meta.activeDesc || ''}`.trim())}</div>
            </div>
        `;

        if (summary) {
            summary.textContent = type === 'destiny'
                ? `${pending.replayOnly ? '本次回放' : '本轮挑战'}固定命格「${meta.name}」，用于稳定这套轮换的开局节奏。`
                : `${pending.replayOnly ? '本次回放' : '本轮挑战'}固定灵契「${meta.name}」，用于锁定当前观星台的测试方向。`;
        }
        return true;
    };

    Game.prototype.decorateCharacterSelectionForChallenge = function () {
        const pending = this.pendingChallengeStart;
        if (!pending || !pending.rule || typeof document === 'undefined') return;
        const container = document.getElementById('character-selection-container');
        const confirmBtn = document.getElementById('confirm-character-btn');
        if (!container) return;
        const dangerProfile = this.buildChallengeDangerProfile(pending.rule, pending.mode);
        const archiveInsight = pending.archiveInsight && hasChallengeArchiveInsight(pending.archiveInsight)
            ? normalizeChallengeArchiveInsight(pending.archiveInsight)
            : null;

        let banner = document.getElementById('challenge-selection-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'challenge-selection-banner';
            banner.className = 'challenge-selection-banner';
            container.prepend(banner);
        }

        banner.innerHTML = `
            <div class="challenge-selection-head">
                <span class="challenge-run-chip">${escapeHtml(pending.modeLabel || HUB_META[pending.mode]?.label || '周挑战')}</span>
                <strong>${escapeHtml(pending.rule.name || '挑战轮换')}</strong>
            </div>
            <p>${escapeHtml(pending.rule.objective || '本轮将使用固定命盘直接开局。')}</p>
            <div class="challenge-selection-meta">
                <span>角色：${escapeHtml(this.getCharacterDisplayName(pending.rule.characterId))}</span>
                <span>章节：${escapeHtml(pending.rule.targetChapter || `完成至第 ${pending.rule.goalRealm} 重`)}</span>
                <span>压强：DRI ${dangerProfile.index} · ${escapeHtml(dangerProfile.tierLabel)}</span>
                <span>主轴：${escapeHtml(dangerProfile.dominantAxisLabel)}</span>
            </div>
            ${renderChallengeInsightMarkup(archiveInsight, { compact: true })}
        `;

        document.querySelectorAll('.character-card').forEach((card) => {
            const locked = card.dataset.id !== pending.rule.characterId;
            card.classList.toggle('challenge-card-locked', locked);
            if (locked) {
                card.style.pointerEvents = 'none';
            }
        });

        this.selectedCharacterId = pending.rule.characterId;
        this.selectedRunDestinyId = pending.rule.runDestinyId;
        this.selectedSpiritCompanionId = pending.rule.spiritCompanionId;
        if (typeof originalSelectCharacter === 'function') {
            originalSelectCharacter.call(this, pending.rule.characterId);
        }

        if (confirmBtn) {
            confirmBtn.querySelector('.btn-text').textContent = pending.replayOnly ? '以回放命盘开局' : '以挑战命盘开局';
        }
    };

    Game.prototype.applyChallengeRunStart = function (bundle) {
        const run = this.createActiveChallengeRun(bundle);
        this.activeChallengeRun = run;
        this.persistActiveChallengeRun();

        if (Array.isArray(bundle.rule.vowIds) && this.player && typeof this.player.applyRunVow === 'function') {
            bundle.rule.vowIds.slice(0, 2).forEach((vowId) => {
                try {
                    this.player.applyRunVow(vowId);
                } catch (error) {
                    console.warn('Apply challenge vow failed:', vowId, error);
                }
            });
        }

        if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
            Utils.showBattleLog(`【${bundle.meta.label}】${bundle.rule.name} 已开始，完成线：第 ${bundle.rule.goalRealm} 重。${bundle.replayOnly ? '本轮只记录留痕。' : ''}`);
        }
        this.renderMainMenuChallengeSummary();
        this.renderChallengeRunBanner();
    };

    Game.prototype.applyChallengeModifiersToEnemies = function (enemies = []) {
        const run = this.activeChallengeRun;
        if (!run || run.resolved) return Array.isArray(enemies) ? enemies : [enemies];
        return (Array.isArray(enemies) ? enemies : [enemies]).filter(Boolean).map((enemy) => {
            const next = clone(enemy) || {};
            const hpMul = Math.max(1, safeNumber(run.battleModifiers.enemyHpMul, 1));
            const atkMul = Math.max(1, safeNumber(run.battleModifiers.enemyAtkMul, 1));
            const openingBlock = clampInt(run.battleModifiers.enemyOpeningBlock, 0);
            const enemyDebuff = run.battleModifiers.enemyDebuff;

            next.hp = Math.max(1, Math.floor(safeNumber(next.hp || next.maxHp, 1) * hpMul));
            next.maxHp = Math.max(next.hp, Math.floor(safeNumber(next.maxHp || next.hp, 1) * hpMul));
            next.block = clampInt(next.block, 0) + openingBlock;
            next.patterns = Array.isArray(next.patterns)
                ? next.patterns.map((pattern) => {
                    const copied = { ...(pattern || {}) };
                    if (copied.type === 'attack' || copied.type === 'multiAttack') {
                        copied.value = Math.max(1, Math.floor(safeNumber(copied.value, 0) * atkMul));
                    }
                    return copied;
                })
                : [];
            if (
                enemyDebuff
                && enemyDebuff.type
                && clampInt(enemyDebuff.value, 0) > 0
            ) {
                next.patterns.unshift({
                    type: 'debuff',
                    buffType: enemyDebuff.type,
                    value: clampInt(enemyDebuff.value, 0),
                    intent: enemyDebuff.intent || '周挑战词缀'
                });
            }
            next.challengeMarked = true;
            return next;
        });
    };

    Game.prototype.registerChallengeBattleResult = function (nodeType = 'enemy') {
        if (!this.activeChallengeRun || this.activeChallengeRun.resolved) return;
        if (nodeType === 'boss') {
            this.activeChallengeRun.progress.bossWins += 1;
        } else if (nodeType === 'elite' || nodeType === 'trial') {
            this.activeChallengeRun.progress.eliteWins += 1;
        } else {
            this.activeChallengeRun.progress.battleWins += 1;
        }
        const score = this.refreshActiveChallengeScore();
        if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
            Utils.showBattleLog(`【${this.activeChallengeRun.modeLabel}】当前得分 ${score}`);
        }
    };

    Game.prototype.getChallengeHubPayload = function () {
        this.ensureChallengeHubBootState();
        const tab = this.challengeHubState.tab || 'daily';
        const liveBundle = this.currentScreen === 'challenge-screen' ? this.buildChallengeBundle(tab) : null;
        const archive = this.getObservatoryArchiveSummary();
        const selectedGuide = this.getSelectedObservatoryExpeditionGuide({ silentSync: true });
        const pendingDangerProfile = this.pendingChallengeStart?.rule
            ? this.buildChallengeDangerProfile(this.pendingChallengeStart.rule, this.pendingChallengeStart.mode)
            : null;
        const pendingArchiveInsight = this.pendingChallengeStart?.archiveInsight
            || this.pendingChallengeStart?.bundleSnapshot?.archiveInsight
            || null;
        const hubBundle = (
            this.pendingChallengeStart
            && this.pendingChallengeStart.rule
            && this.pendingChallengeStart.mode === tab
        )
            ? {
                mode: this.pendingChallengeStart.mode,
                rule: this.pendingChallengeStart.rule,
                rewards: Array.isArray(this.pendingChallengeStart.bundleSnapshot?.rewards)
                    ? this.pendingChallengeStart.bundleSnapshot.rewards
                    : (liveBundle?.rewards || []),
                progress: liveBundle?.progress || { bestScore: 0, totalScore: 0 },
                seedSignature: String(
                    this.pendingChallengeStart.seedSignature
                    || this.pendingChallengeStart.bundleSnapshot?.seedSignature
                    || liveBundle?.seedSignature
                    || ''
                ),
                dangerProfile: pendingDangerProfile,
                archiveInsight: pendingArchiveInsight
            }
            : liveBundle;
        const comparison = hubBundle
            ? this.buildObservatoryThemeComparison({
                mode: hubBundle.mode,
                rule: hubBundle.rule,
                themeKey: this.getChallengeThemeMeta(hubBundle.rule, hubBundle.mode).key,
                themeLabel: this.getChallengeThemeMeta(hubBundle.rule, hubBundle.mode).label
            })
            : null;
        const activeRunDangerProfile = this.activeChallengeRun
            ? this.buildChallengeDangerProfile(this.activeChallengeRun, this.activeChallengeRun.mode)
            : null;
        const activeRunArchiveInsight = this.activeChallengeRun?.archiveInsight || null;
        return {
            pending: this.pendingChallengeStart
                ? {
                    mode: this.pendingChallengeStart.mode,
                    ruleId: this.pendingChallengeStart.rule?.id || '',
                    characterId: this.pendingChallengeStart.rule?.characterId || '',
                    replayOnly: !!this.pendingChallengeStart.replayOnly,
                    seedSignature: String(this.pendingChallengeStart.seedSignature || ''),
                    dangerProfile: serializeChallengeDangerProfile(pendingDangerProfile),
                    archiveInsight: serializeChallengeArchiveInsight(pendingArchiveInsight)
                }
                : null,
            activeRun: this.activeChallengeRun
                ? {
                    mode: this.activeChallengeRun.mode,
                    modeLabel: this.activeChallengeRun.modeLabel,
                    ruleId: this.activeChallengeRun.ruleId,
                    ruleName: this.activeChallengeRun.ruleName,
                    goalRealm: this.activeChallengeRun.goalRealm,
                    currentScore: clampInt(this.activeChallengeRun.progress?.currentScore, 0),
                    resolved: !!this.activeChallengeRun.resolved,
                    replayOnly: !!this.activeChallengeRun.replayOnly,
                    seedSignature: String(this.activeChallengeRun.seedSignature || ''),
                    dangerProfile: serializeChallengeDangerProfile(activeRunDangerProfile),
                    archiveInsight: serializeChallengeArchiveInsight(activeRunArchiveInsight)
                }
                : null,
            hub: hubBundle
                ? {
                    activeTab: tab,
                    ruleName: hubBundle.rule?.name || '',
                    targetChapter: hubBundle.rule?.targetChapter || '',
                    rewardCount: hubBundle.rewards.length,
                    bestScore: clampInt(hubBundle.progress.bestScore, 0),
                    totalScore: clampInt(hubBundle.progress.totalScore, 0),
                    seedSignature: hubBundle.seedSignature || '',
                    comparisonThemeLabel: comparison?.themeLabel || '',
                    comparisonCount: comparison?.entries?.length || 0,
                    dangerProfile: serializeChallengeDangerProfile(hubBundle.dangerProfile)
                }
                : null,
            archive: {
                totalRecords: archive.totalRecords,
                replayCount: archive.replayCount,
                replayableCount: archive.replayableCount,
                featuredCount: archive.featuredCount,
                latestTitle: archive.latest?.title || '',
                latestSeedSignature: archive.latest?.seedSignature || '',
                latestInsightTitle: archive.latest?.insight?.title || '',
                latestInsight: serializeChallengeArchiveInsight(archive.latest?.insight),
                selectedGuideId: selectedGuide?.id || '',
                selectedGuideTitle: selectedGuide?.title || '',
                selectedGuideThemeLabel: selectedGuide?.themeLabel || ''
            },
            observatoryGuide: selectedGuide
                ? {
                    id: selectedGuide.id,
                    title: selectedGuide.title,
                    themeLabel: selectedGuide.themeLabel,
                    featuredTier: selectedGuide.featuredTier,
                    featuredTags: normalizeTagList(selectedGuide.featuredTags, 4),
                    seedSignature: selectedGuide.seedSignature || '',
                    insight: serializeChallengeArchiveInsight(selectedGuide.insight)
                }
                : null
        };
    };

    Game.prototype.showScreen = function (screenId) {
        const prevScreen = this.currentScreen;
        const result = typeof originalShowScreen === 'function'
            ? originalShowScreen.call(this, screenId)
            : undefined;

        if (screenId === 'main-menu') {
            if (prevScreen === 'character-selection-screen' && this.pendingChallengeStart && !this.activeChallengeRun) {
                this.clearPendingChallengeStart();
            }
            this.renderMainMenuChallengeSummary();
        } else if (screenId === 'challenge-screen') {
            this.initChallengeHub();
        } else if (screenId === 'map-screen') {
            this.renderChallengeRunBanner();
        } else {
            this.renderChallengeRunBanner();
        }

        return result;
    };

    Game.prototype.showCharacterSelection = function () {
        const result = typeof originalShowCharacterSelection === 'function'
            ? originalShowCharacterSelection.call(this)
            : undefined;
        this.decorateCharacterSelectionForChallenge();
        return result;
    };

    Game.prototype.renderRunDestinySelection = function (characterId) {
        if (this.pendingChallengeStart && this.renderChallengeLockedSelection('destiny')) {
            this.updateCharacterSelectionConfirmState();
            return;
        }
        if (typeof originalRenderRunDestinySelection === 'function') {
            return originalRenderRunDestinySelection.call(this, characterId);
        }
        return undefined;
    };

    Game.prototype.renderSpiritCompanionSelection = function (characterId) {
        if (this.pendingChallengeStart && this.renderChallengeLockedSelection('spirit')) {
            this.updateCharacterSelectionConfirmState();
            return;
        }
        if (typeof originalRenderSpiritCompanionSelection === 'function') {
            return originalRenderSpiritCompanionSelection.call(this, characterId);
        }
        return undefined;
    };

    Game.prototype.selectCharacter = function (charId) {
        if (this.pendingChallengeStart && this.pendingChallengeStart.rule && charId !== this.pendingChallengeStart.rule.characterId) {
            if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
                Utils.showBattleLog(`${this.pendingChallengeStart.replayOnly ? '观星回放' : '观星挑战'}已锁定当前角色，需按观星台给出的命盘开局。`);
            }
            return;
        }
        if (typeof originalSelectCharacter === 'function') {
            return originalSelectCharacter.call(this, charId);
        }
        return undefined;
    };

    Game.prototype.selectRunDestiny = function (destinyId) {
        if (this.pendingChallengeStart && destinyId !== this.pendingChallengeStart.rule?.runDestinyId) return;
        if (typeof originalSelectRunDestiny === 'function') {
            return originalSelectRunDestiny.call(this, destinyId);
        }
        return undefined;
    };

    Game.prototype.selectSpiritCompanion = function (spiritId) {
        if (this.pendingChallengeStart && spiritId !== this.pendingChallengeStart.rule?.spiritCompanionId) return;
        if (typeof originalSelectSpiritCompanion === 'function') {
            return originalSelectSpiritCompanion.call(this, spiritId);
        }
        return undefined;
    };

    Game.prototype.startNewGame = function (characterId = 'linFeng', options = {}) {
        const pending = this.pendingChallengeStart;
        const bundle = pending?.bundleSnapshot
            ? clone(pending.bundleSnapshot)
            : (pending ? this.buildChallengeBundle(pending.mode) : null);
        const isMatchingPending = !!bundle && !!bundle.rule && (
            !!pending?.bundleSnapshot
            || (
                bundle.rotationKey === pending.rotationKey
                && bundle.rule.id === pending.rule.id
            )
        );

        if (!isMatchingPending) {
            this.clearPendingChallengeStart();
            this.clearActiveChallengeRun();
            return typeof originalStartNewGame === 'function'
                ? originalStartNewGame.call(this, characterId, options)
                : undefined;
        }

        const lockedOptions = {
            ...(options && typeof options === 'object' ? options : {}),
            runDestinyId: bundle.rule.runDestinyId,
            spiritCompanionId: bundle.rule.spiritCompanionId
        };
        const result = typeof originalStartNewGame === 'function'
            ? originalStartNewGame.call(this, bundle.rule.characterId, lockedOptions)
            : undefined;

        this.applyChallengeRunStart(bundle);
        this.clearPendingChallengeStart();
        if (typeof this.startRealm === 'function') {
            this.startRealm(1, false);
            this.renderChallengeRunBanner();
        }
        return result;
    };

    Game.prototype.startBattle = function (enemies, node = null) {
        const prepared = this.activeChallengeRun && !this.activeChallengeRun.resolved
            ? this.applyChallengeModifiersToEnemies(enemies)
            : enemies;
        return typeof originalStartBattle === 'function'
            ? originalStartBattle.call(this, prepared, node)
            : undefined;
    };

    Game.prototype.onBattleWon = async function (enemies) {
        const nodeType = this.currentBattleNode && this.currentBattleNode.type ? this.currentBattleNode.type : 'enemy';
        if (this.activeChallengeRun && !this.activeChallengeRun.resolved) {
            this.registerChallengeBattleResult(nodeType);
        }
        const result = typeof originalOnBattleWon === 'function'
            ? await originalOnBattleWon.call(this, enemies)
            : undefined;
        return result;
    };

    Game.prototype.onBattleLost = async function () {
        if (this.activeChallengeRun && !this.activeChallengeRun.resolved) {
            this.finalizeActiveChallengeRun({
                completed: false,
                reason: 'battle_lost'
            });
        }
        return typeof originalOnBattleLost === 'function'
            ? originalOnBattleLost.call(this)
            : undefined;
    };

    Game.prototype.onRealmComplete = function () {
        const currentRealm = this.player && this.player.realm ? this.player.realm : 1;
        if (this.activeChallengeRun && !this.activeChallengeRun.resolved) {
            this.activeChallengeRun.progress.realmClears += 1;
            if (currentRealm >= this.activeChallengeRun.goalRealm) {
                this.finalizeActiveChallengeRun({
                    completed: true,
                    reason: 'goal_reached'
                });
            } else {
                this.refreshActiveChallengeScore();
            }
        }
        return typeof originalOnRealmComplete === 'function'
            ? originalOnRealmComplete.call(this)
            : undefined;
    };

    Game.prototype.finishStrategicNode = function (node, title, message, icon = '✨') {
        const result = typeof originalFinishStrategicNode === 'function'
            ? originalFinishStrategicNode.call(this, node, title, message, icon)
            : undefined;

        if (node && node.type === 'observatory') {
            const note = String(message || '')
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .slice(0, 2)
                .join(' / ');
            const entry = this.recordObservatoryArchiveEntry({
                id: `omen:${Date.now()}:${hashString(`${title}:${message}`)}`,
                type: 'omen',
                mode: 'daily',
                modeLabel: '观星留痕',
                rotationKey: getDayKey(new Date()),
                rotationLabel: formatDateLabel('daily', getDayKey(new Date())),
                title: String(title || '观星留痕'),
                note,
                icon: String(icon || '🔭'),
                at: Date.now(),
                completed: true,
                replayOnly: false,
                originLabel: '观星台'
            });
            if (typeof this.recordCollectionUnlock === 'function') {
                this.recordCollectionUnlock('observatory', {
                    id: entry?.id || `omen:${Date.now()}`,
                    name: `观星留痕·${String(title || '星轨已定')}`,
                    icon: String(icon || '🔭'),
                    note: note || '观星台已留下新的留痕。'
                });
            }
        }

        return result;
    };

    Game.prototype.saveGame = function () {
        const result = typeof originalSaveGame === 'function'
            ? originalSaveGame.call(this)
            : undefined;
        this.persistActiveChallengeRun();
        return result;
    };

    Game.prototype.loadGame = function () {
        const result = typeof originalLoadGame === 'function'
            ? originalLoadGame.call(this)
            : undefined;
        this.ensureChallengeHubBootState();
        const restored = this.restoreActiveChallengeRun();
        if (restored) {
            this.activeChallengeRun = restored;
            this.refreshActiveChallengeScore();
        }
        return result;
    };

    Game.prototype.clearSave = function () {
        const result = typeof originalClearSave === 'function'
            ? originalClearSave.call(this)
            : undefined;
        this.clearActiveChallengeRun();
        return result;
    };

    Game.prototype.renderGameToText = function () {
        const raw = typeof originalRenderGameToText === 'function'
            ? originalRenderGameToText.call(this)
            : '{}';
        try {
            const payload = JSON.parse(raw);
            payload.challenge = this.getChallengeHubPayload();
            return JSON.stringify(payload);
        } catch (error) {
            return raw;
        }
    };

    if (typeof originalGameMapRender === 'function') {
        GameMap.prototype.render = function () {
            const result = originalGameMapRender.call(this);
            if (this?.game && typeof this.game.renderChallengeRunBanner === 'function') {
                this.game.renderChallengeRunBanner();
            }
            return result;
        };
    }
}());
