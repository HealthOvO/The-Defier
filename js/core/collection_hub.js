(function () {
    if (typeof Game === 'undefined') return;

    const COLLECTION_HISTORY_KEY = 'theDefierCollectionUnlockHistoryV1';
    const BOSS_MEMORY_RECORDS_KEY = 'theDefierBossMemoryRecordsV1';
    const RUN_PATH_RECORDS_KEY = 'theDefierRunPathRecordsV1';
    const RUN_PATH_BOSS_SAMPLES_KEY = 'theDefierRunPathBossSamplesV1';
    const SECTION_META = {
        laws: {
            title: '藏经阁 · 法则图鉴',
            subtitle: '补齐法则与共鸣链，把命环装配、命途样本与下一轮路线对成同一份档案。'
        },
        spirits: {
            title: '藏经阁 · 灵契图鉴',
            subtitle: '比对灵契来源、章节适配与样本表现，决定下一阶缔约方向。'
        },
        chapters: {
            title: '藏经阁 · 章节档案',
            subtitle: '复盘章节天象、地脉与样本留痕，决定下轮路线与补题顺序。'
        },
        enemies: {
            title: '藏经阁 · 敌影档案',
            subtitle: '记录常驻敌影的战术画像、失手样本与应对窗口。'
        },
        bosses: {
            title: '藏经阁 · Boss 档案',
            subtitle: '整理主宰机制、破局窗口与通关样本。'
        },
        builds: {
            title: '藏经阁 · 构筑快照',
            subtitle: '把当前牌组、命环、灵契与实战样本压成一张构筑画像。'
        },
        slates: {
            title: '藏经阁 · 归卷书架',
            subtitle: '把章节答卷、评分、偏题与训练建议收成可反复翻阅的修行书架。'
        },
        sanctum: {
            title: '洞府总览 · 藏经阁',
            subtitle: '查看洞府房间、命盘档案、研究项与近期解锁记录。'
        }
    };

    const originalShowCollection = Game.prototype.showCollection;
    const originalInitCollection = Game.prototype.initCollection;
    const originalStartBattle = Game.prototype.startBattle;
    const originalOnBattleWon = Game.prototype.onBattleWon;
    const originalOnBattleLost = Game.prototype.onBattleLost;
    const originalHandleBossDefeated = Game.prototype.handleBossDefeated;
    const originalOnRealmComplete = Game.prototype.onRealmComplete;

    const sanitizeQuery = (value, max = 60) => String(value || '').trim().slice(0, max);
    const safeNumber = (value, fallback = 0) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    };
    const clampInt = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
        const num = Math.floor(safeNumber(value, min));
        return Math.max(min, Math.min(max, num));
    };
    const splitKeywords = (value, max = 4) => {
        const tokens = String(value || '')
            .split(/[、，,\/\s]+/)
            .map((item) => item.trim())
            .filter(Boolean);
        return [...new Set(tokens)].slice(0, max);
    };
    const toStringArray = (value, max = 8) => Array.isArray(value)
        ? value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, max)
        : [];
    const normalizeRatingTone = (value) => ['completed', 'selected', 'suggested', 'idle'].includes(String(value || ''))
        ? String(value)
        : 'idle';
    const extractTagValue = (values = [], prefix = '') => {
        const entry = toStringArray(values, 12).find((item) => item.startsWith(prefix));
        return entry ? entry.slice(prefix.length).trim() : '';
    };
    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const readArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
    const getHeavenlyMandateLaneOrder = (laneId = '') => {
        switch (String(laneId || '').trim()) {
            case 'expedition':
                return 0;
            case 'training':
                return 1;
            case 'versus':
                return 2;
            default:
                return 9;
        }
    };
    const buildHeavenlyMandateOverviewModel = (source = null, fallback = null) => {
        const mandate = source && typeof source === 'object' ? source : null;
        const legacy = fallback && typeof fallback === 'object' ? fallback : null;
        const lanes = mandate
            ? readArray(mandate.lanes)
                .filter((lane) => lane && typeof lane === 'object')
                .sort((a, b) => getHeavenlyMandateLaneOrder(a.id) - getHeavenlyMandateLaneOrder(b.id))
                .slice(0, 3)
                .map((lane, laneIndex) => {
                    const tasks = readArray(lane.tasks)
                        .filter((task) => task && typeof task === 'object')
                        .slice(0, 4)
                        .map((task, taskIndex) => {
                            const rawProgress = clampInt(task.progress, 0, 9999);
                            const target = Math.max(1, clampInt(task.target, 1, 9999));
                            const completed = !!task.completed || rawProgress >= target;
                            const progress = completed ? target : Math.min(rawProgress, target);
                            const anchorSection = String(task.anchorSection || '').trim();
                            const actionMeta = resolveSeasonBoardActionMeta(anchorSection, 'sanctum');
                            return {
                                id: String(task.id || `${String(lane.id || `lane_${laneIndex + 1}`)}_task_${taskIndex + 1}`).trim(),
                                label: String(task.label || `敕令任务 ${taskIndex + 1}`).trim(),
                                icon: String(task.icon || '✦').trim() || '✦',
                                progress,
                                target,
                                progressText: String(task.progressText || `${progress}/${target}`).trim() || `${progress}/${target}`,
                                completed,
                                hintLine: String(task.hintLine || '').trim(),
                                statusLine: String(task.statusLine || (completed ? '已完成' : `${progress}/${target}`)).trim(),
                                anchorSection,
                                actionType: String(task.actionType || actionMeta.actionType || '').trim() || actionMeta.actionType,
                                actionValue: String(task.actionValue || actionMeta.actionValue || '').trim() || actionMeta.actionValue,
                                ctaLabel: String(task.ctaLabel || actionMeta.ctaLabel || (completed ? '沿此复核' : '前往推进')).trim()
                                    || (completed ? '沿此复核' : '前往推进')
                            };
                        });
                    const completedCount = Math.min(tasks.length, clampInt(lane.completedCount, 0, tasks.length || 9999));
                    const totalCount = Math.max(tasks.length, clampInt(lane.totalCount, 0, 9999));
                    return {
                        id: String(lane.id || `lane_${laneIndex + 1}`).trim() || `lane_${laneIndex + 1}`,
                        label: String(lane.label || `任务线 ${laneIndex + 1}`).trim() || `任务线 ${laneIndex + 1}`,
                        icon: String(lane.icon || '✦').trim() || '✦',
                        summaryLine: String(lane.summaryLine || '').trim(),
                        completedCount,
                        totalCount,
                        tasks
                    };
                })
            : [];
        const completedTaskCount = mandate
            ? Math.min(
                lanes.reduce((sum, lane) => sum + lane.tasks.filter((task) => task.completed).length, 0),
                Math.max(0, clampInt(mandate.completedTaskCount, 0, 9999))
            )
            : 0;
        const totalTaskCount = mandate
            ? Math.max(
                lanes.reduce((sum, lane) => sum + lane.tasks.length, 0),
                clampInt(mandate.totalTaskCount, 0, 9999)
            )
            : 0;
        const focusTaskSource = mandate?.focusTask && typeof mandate.focusTask === 'object'
            ? mandate.focusTask
            : (legacy?.focusTask && typeof legacy.focusTask === 'object' ? legacy.focusTask : null);
        const focusTask = focusTaskSource
            ? (() => {
                const actionMeta = resolveSeasonBoardActionMeta(String(focusTaskSource.anchorSection || '').trim(), 'sanctum');
                return {
                id: String(focusTaskSource.id || 'heavenly_mandate_focus').trim() || 'heavenly_mandate_focus',
                label: String(focusTaskSource.label || '本周焦点').trim() || '本周焦点',
                icon: String(focusTaskSource.icon || '📜').trim() || '📜',
                progress: clampInt(focusTaskSource.progress, 0, 9999),
                target: Math.max(1, clampInt(focusTaskSource.target, 1, 9999)),
                progressText: String(focusTaskSource.progressText || '').trim(),
                completed: !!focusTaskSource.completed,
                hintLine: String(focusTaskSource.hintLine || '').trim(),
                statusLine: String(focusTaskSource.statusLine || '').trim(),
                anchorSection: String(focusTaskSource.anchorSection || '').trim(),
                actionType: String(focusTaskSource.actionType || actionMeta.actionType || '').trim() || actionMeta.actionType,
                actionValue: String(focusTaskSource.actionValue || actionMeta.actionValue || '').trim() || actionMeta.actionValue,
                ctaLabel: String(focusTaskSource.ctaLabel || actionMeta.ctaLabel || '前往推进').trim() || '前往推进',
                source: String(focusTaskSource.source || '').trim(),
                sourceId: String(focusTaskSource.sourceId || '').trim(),
                isPlaceholder: !!focusTaskSource.isPlaceholder,
                occupiesStrongSlot: !!focusTaskSource.occupiesStrongSlot
            };
            })()
            : null;
        const nextTask = focusTask || lanes.flatMap((lane) => lane.tasks).find((task) => !task.completed) || null;
        const weekTag = String(mandate?.weekTag || legacy?.weekTag || '').trim();
        const weekLabel = String(mandate?.weekLabel || legacy?.weekLabel || weekTag || '本周轮转').trim() || '本周轮转';
        const themeId = String(mandate?.themeId || '').trim();
        const themeLabel = String(mandate?.themeLabel || legacy?.directiveName || legacy?.themeLabel || '待启敕令').trim() || '待启敕令';
        const themeIcon = String(mandate?.themeIcon || legacy?.icon || '📜').trim() || '📜';
        const themeKicker = String(mandate?.themeKicker || legacy?.detailLine || '').trim();
        const summaryLine = String(
            mandate?.summaryLine
            || legacy?.summaryLine
            || `天道敕令：${weekLabel} · 当前轮转「${themeLabel}」`
        ).trim();
        const detailLine = String(
            legacy?.detailLine
            || (nextTask
                ? `当前优先补「${nextTask.label}」${nextTask.progressText ? ` · ${nextTask.progressText}` : ''}${nextTask.hintLine ? ` · ${nextTask.hintLine}` : ''}`
                : (mandate
                ? `${themeKicker || '本周天道敕令'}${totalTaskCount > 0 ? ` · 已完成 ${completedTaskCount}/${totalTaskCount}` : ''}`
                : ''))
        ).trim();
        const mandateActionMeta = resolveSeasonBoardActionMeta(
            String(mandate?.actionValue || nextTask?.anchorSection || legacy?.actionValue || '').trim(),
            'sanctum'
        );
        const mandateGuideTargetLabel = String(mandateActionMeta.targetLabel || '').trim();
        const guideLine = String(
            legacy?.guideLine
            || (nextTask
                ? `先沿${mandateGuideTargetLabel ? `【${mandateGuideTargetLabel}】` : '当前主线'}补完「${nextTask.label}」，再回洞府复核其余两条玩法线。`
                : (mandate && lanes.length > 0
                ? `本周共 ${lanes.length} 条任务线，适合按远征、训练、对抗三线同步补进度。`
                : '')
            )
        ).trim();
        return {
            available: !!mandate || !!legacy,
            isBoard: !!mandate,
            title: '天道敕令',
            icon: themeIcon,
            weekTag,
            weekLabel,
            themeId,
            themeLabel,
            themeKicker,
            directiveName: themeLabel,
            summaryLine,
            detailLine,
            guideLine,
            goalTitle: nextTask ? nextTask.label : `${themeLabel} · 本周已结题`,
            goalProgressText: nextTask
                ? (nextTask.progressText || (nextTask.completed ? '已完成' : '待推进'))
                : (totalTaskCount > 0 ? `${completedTaskCount}/${totalTaskCount} 项敕令已成` : '待同步'),
            completedTaskCount,
            totalTaskCount,
            progressText: totalTaskCount > 0 ? `${completedTaskCount}/${totalTaskCount}` : '待同步',
            actionType: String(mandate?.actionType || legacy?.actionType || mandateActionMeta.actionType || 'collection').trim() || 'collection',
            actionValue: String(mandate?.actionValue || legacy?.actionValue || mandateActionMeta.actionValue || 'sanctum').trim() || 'sanctum',
            ctaLabel: String(mandate?.ctaLabel || legacy?.ctaLabel || nextTask?.ctaLabel || mandateActionMeta.ctaLabel || '前往推进').trim() || '前往推进',
            focusTask,
            nextTask,
            lanes
        };
    };
    const getSeasonBoardLaneOrder = (laneId = '') => {
        switch (String(laneId || '').trim()) {
            case 'training':
                return 0;
            case 'expedition':
                return 1;
            case 'verification':
                return 2;
            default:
                return 9;
        }
    };
    const getSeasonBoardVerificationOrderPair = (orders = []) => {
        const list = readArray(orders).filter((entry) => entry && typeof entry === 'object');
        const primary = list.find((entry) => String(entry.role || '').trim() === 'primary') || list[0] || null;
        const secondary = list.find((entry) => entry !== primary && String(entry.role || '').trim() === 'side')
            || list.find((entry) => entry !== primary)
            || null;
        return {
            list,
            primary,
            secondary
        };
    };
    const buildSeasonBoardOverviewModel = (source = null) => {
        const board = source && typeof source === 'object' ? source : null;
        const normalizeLaneReward = (reward = null, fallbackLaneId = '', fallbackLaneLabel = '') => {
            const root = reward && typeof reward === 'object' ? reward : null;
            if (!root) return null;
            const gains = root.gains && typeof root.gains === 'object' ? root.gains : {};
            const laneId = String(root.laneId || fallbackLaneId || '').trim();
            if (!laneId) return null;
            return {
                id: String(root.id || `season_lane_reward_${String(root.weekTag || 'current').trim()}_${laneId}`).trim(),
                weekTag: String(root.weekTag || '').trim(),
                weekLabel: String(root.weekLabel || '').trim(),
                laneId,
                laneLabel: String(root.laneLabel || fallbackLaneLabel || '').trim(),
                laneIcon: String(root.laneIcon || '').trim(),
                rewardKey: String(root.rewardKey || '').trim(),
                label: String(root.label || '').trim(),
                summaryLine: String(root.summaryLine || '').trim(),
                detailLine: String(root.detailLine || '').trim(),
                status: String(root.status || '').trim(),
                statusLabel: String(root.statusLabel || '').trim(),
                ready: !!root.ready,
                claimable: !!root.claimable,
                claimed: !!root.claimed,
                claimedAt: clampInt(root.claimedAt || 0, 0),
                rewardLine: String(root.rewardLine || '').trim(),
                gains: {
                    insight: clampInt(gains.insight ?? gains.heavenlyInsight, 0, 99),
                    karma: clampInt(gains.karma, 0, 99),
                    ringExp: clampInt(gains.ringExp, 0, 999),
                    gold: clampInt(gains.gold, 0, 999999)
                },
                buttonLabel: String(root.buttonLabel || '').trim(),
                progressText: String(root.progressText || '').trim()
            };
        };
        const lanes = board
            ? readArray(board.lanes)
                .filter((lane) => lane && typeof lane === 'object')
                .sort((a, b) => getSeasonBoardLaneOrder(a.id) - getSeasonBoardLaneOrder(b.id))
                .slice(0, 3)
                .map((lane, laneIndex) => {
                    const tasks = readArray(lane.tasks)
                        .filter((task) => task && typeof task === 'object')
                        .slice(0, 4)
                        .map((task, taskIndex) => {
                            const rawProgress = clampInt(task.progress, 0, 9999);
                            const target = Math.max(1, clampInt(task.target, 1, 9999));
                            const completed = !!task.completed || rawProgress >= target;
                            const progress = completed ? target : Math.min(rawProgress, target);
                            const anchorSection = String(task.anchorSection || '').trim();
                            const actionMeta = resolveSeasonBoardActionMeta(anchorSection || task.actionValue || '', 'sanctum');
                            return {
                                id: String(task.id || `${String(lane.id || `lane_${laneIndex + 1}`)}_task_${taskIndex + 1}`).trim(),
                                label: String(task.label || `季盘任务 ${taskIndex + 1}`).trim(),
                                icon: String(task.icon || '✦').trim() || '✦',
                                progress,
                                target,
                                progressText: String(task.progressText || `${progress}/${target}`).trim() || `${progress}/${target}`,
                                completed,
                                hintLine: String(task.hintLine || '').trim(),
                                statusLine: String(task.statusLine || '').trim(),
                                anchorSection,
                                actionType: String(task.actionType || actionMeta.actionType || '').trim() || actionMeta.actionType,
                                actionValue: String(task.actionValue || actionMeta.actionValue || '').trim() || actionMeta.actionValue,
                                ctaLabel: String(task.ctaLabel || actionMeta.ctaLabel || (completed ? '沿此复核' : '前往推进')).trim()
                                    || (completed ? '沿此复核' : '前往推进')
                            };
                        });
                    const completedCount = Math.min(tasks.length, clampInt(lane.completedCount, 0, tasks.length || 9999));
                    const totalCount = Math.max(tasks.length, clampInt(lane.totalCount, 0, 9999));
                    const laneId = String(lane.id || `lane_${laneIndex + 1}`).trim() || `lane_${laneIndex + 1}`;
                    const laneLabel = String(lane.label || `任务线 ${laneIndex + 1}`).trim() || `任务线 ${laneIndex + 1}`;
                    return {
                        id: laneId,
                        label: laneLabel,
                        icon: String(lane.icon || '✦').trim() || '✦',
                        summaryLine: String(lane.summaryLine || '').trim(),
                        completedCount,
                        totalCount,
                        tasks,
                        reward: normalizeLaneReward(lane.reward, laneId, laneLabel)
                    };
                })
            : [];
        const topLevelLaneRewards = board
            ? readArray(board.laneRewards)
                .map((reward) => normalizeLaneReward(reward))
                .filter(Boolean)
            : [];
        const laneRewards = topLevelLaneRewards.length > 0
            ? topLevelLaneRewards
            : lanes.map((lane) => lane.reward).filter(Boolean);
        const laneRewardById = new Map(laneRewards.map((reward) => [reward.laneId, reward]));
        const lanesWithRewards = lanes.map((lane) => ({
            ...lane,
            reward: lane.reward || laneRewardById.get(lane.id) || null
        }));
        const resolveSummaryCount = (value, fallback = 0) => {
            const num = Number(value);
            return Number.isFinite(num)
                ? Math.max(0, Math.min(99, Math.floor(num)))
                : fallback;
        };
        const laneRewardSummary = {
            readyCount: resolveSummaryCount(board?.laneRewardSummary?.readyCount, laneRewards.filter((entry) => entry.ready).length),
            claimableCount: resolveSummaryCount(board?.laneRewardSummary?.claimableCount, laneRewards.filter((entry) => entry.claimable).length),
            claimedCount: resolveSummaryCount(board?.laneRewardSummary?.claimedCount, laneRewards.filter((entry) => entry.claimed).length),
            totalCount: resolveSummaryCount(board?.laneRewardSummary?.totalCount, laneRewards.length)
        };
        const completedTaskCount = board
            ? Math.min(
                lanes.reduce((sum, lane) => sum + lane.tasks.filter((task) => task.completed).length, 0),
                Math.max(0, clampInt(board.completedTaskCount, 0, 9999))
            )
            : 0;
        const totalTaskCount = board
            ? Math.max(
                lanes.reduce((sum, lane) => sum + lane.tasks.length, 0),
                clampInt(board.totalTaskCount, 0, 9999)
            )
            : 0;
        const progressText = String(
            board?.progress?.progressText
            || (totalTaskCount > 0 ? `${completedTaskCount}/${totalTaskCount}` : '待同步')
        ).trim() || '待同步';
        const settlement = board?.settlement && typeof board.settlement === 'object'
            ? {
                id: String(board.settlement.id || 'season_board_settlement').trim() || 'season_board_settlement',
                outcomeId: String(board.settlement.outcomeId || '').trim(),
                outcomeLabel: String(board.settlement.outcomeLabel || '待押卷').trim() || '待押卷',
                outcomeTone: String(board.settlement.outcomeTone || '').trim(),
                summaryLine: String(board.settlement.summaryLine || '').trim(),
                detailLine: String(board.settlement.detailLine || '').trim(),
                guideLine: String(board.settlement.guideLine || '').trim(),
                statusLine: String(board.settlement.statusLine || '').trim(),
                progressText: String(board.settlement.progressText || board.settlement.statusLine || '').trim(),
                settlementWeekTag: String(board.settlement.settlementWeekTag || '').trim(),
                settlementPhaseId: String(board.settlement.settlementPhaseId || '').trim(),
                settlementSource: String(board.settlement.settlementSource || '').trim(),
                resolutionTier: String(board.settlement.resolutionTier || '').trim(),
                selectedContractLabel: String(board.settlement.selectedContractLabel || '').trim(),
                contractResolutionLine: String(board.settlement.contractResolutionLine || '').trim(),
                recoveryEligible: !!board.settlement.recoveryEligible
            }
            : null;
        const debtPack = board?.debtPack && typeof board.debtPack === 'object'
            ? {
                id: String(board.debtPack.id || 'season_board_debt_pack').trim() || 'season_board_debt_pack',
                sourceLabel: String(board.debtPack.sourceLabel || '').trim(),
                debtThemeLabel: String(board.debtPack.debtThemeLabel || '研究债账').trim() || '研究债账',
                summaryLine: String(board.debtPack.summaryLine || '').trim(),
                detailLine: String(board.debtPack.detailLine || '').trim(),
                guideLine: String(board.debtPack.guideLine || '').trim(),
                statusLine: String(board.debtPack.statusLine || '').trim(),
                progressText: String(board.debtPack.progressText || '').trim(),
                settleWindowText: String(board.debtPack.settleWindowText || '').trim(),
                recommendedValidationLabel: String(board.debtPack.recommendedValidationLabel || '').trim(),
                recommendedAnchorSection: String(board.debtPack.recommendedAnchorSection || '').trim(),
                status: String(board.debtPack.status || '').trim(),
                deferCount: clampInt(board.debtPack.deferCount, 0, 9999),
                openedWeekTag: String(board.debtPack.openedWeekTag || '').trim(),
                carryIntoWeekTag: String(board.debtPack.carryIntoWeekTag || '').trim(),
                occupiedMandateTaskId: String(board.debtPack.occupiedMandateTaskId || '').trim(),
                occupationReason: String(board.debtPack.occupationReason || '').trim(),
                occupiesStrongSlot: !!board.debtPack.occupiesStrongSlot,
                resolvedStatus: String(board.debtPack.resolvedStatus || '').trim(),
                writebackLine: String(board.debtPack.writebackLine || '').trim(),
                verificationRecordId: String(board.debtPack.verificationRecordId || '').trim(),
                selectedContractLabel: String(board.debtPack.selectedContractLabel || '').trim(),
                contractResolutionLine: String(board.debtPack.contractResolutionLine || '').trim(),
                recoveryEligible: !!board.debtPack.recoveryEligible
            }
            : null;
        const verificationOrders = board
            ? readArray(board.verificationOrders)
                .filter((entry) => entry && typeof entry === 'object')
                .slice(0, 3)
                .map((entry, index) => ({
                    id: String(entry.id || `season_verification_${index + 1}`).trim() || `season_verification_${index + 1}`,
                    type: String(entry.type || 'followup').trim(),
                    role: String(entry.role || '').trim(),
                    label: String(entry.label || `验证状 ${index + 1}`).trim() || `验证状 ${index + 1}`,
                    summaryLine: String(entry.summaryLine || '').trim(),
                    detailLine: String(entry.detailLine || '').trim(),
                    hintLine: String(entry.hintLine || '').trim(),
                    statusLine: String(entry.statusLine || '').trim(),
                    anchorSection: String(entry.anchorSection || '').trim(),
                    resultStatus: String(entry.resultStatus || '').trim(),
                    writebackMode: String(entry.writebackMode || '').trim(),
                    writebackLine: String(entry.writebackLine || '').trim(),
                    sourceMode: String(entry.sourceMode || '').trim(),
                    sourceModeLabel: String(entry.sourceModeLabel || '').trim(),
                    resolvedRunId: String(entry.resolvedRunId || '').trim(),
                    chapterIndex: clampInt(entry.chapterIndex, 0, 9999),
                    proofQuality: String(entry.proofQuality || '').trim(),
                    lineageStyle: String(entry.lineageStyle || '').trim(),
                    carryIntoNextWeek: !!entry.carryIntoNextWeek
                }))
            : [];
        const verificationOrderPair = getSeasonBoardVerificationOrderPair(verificationOrders);
        const weekVerdictLedger = board?.weekVerdictLedger?.current && typeof board.weekVerdictLedger.current === 'object'
            ? {
                current: {
                    ledgerId: String(board.weekVerdictLedger.current.ledgerId || '').trim(),
                    weekTag: String(board.weekVerdictLedger.current.weekTag || '').trim(),
                    weekLabel: String(board.weekVerdictLedger.current.weekLabel || '').trim(),
                    phaseId: String(board.weekVerdictLedger.current.phaseId || '').trim(),
                    phaseLabel: String(board.weekVerdictLedger.current.phaseLabel || '').trim(),
                    sourceRunId: String(board.weekVerdictLedger.current.sourceRunId || '').trim(),
                    chapterIndex: clampInt(board.weekVerdictLedger.current.chapterIndex, 0, 9999),
                    settlementId: String(board.weekVerdictLedger.current.settlementId || '').trim(),
                    settlementOutcomeId: String(board.weekVerdictLedger.current.settlementOutcomeId || '').trim(),
                    settlementOutcomeLabel: String(board.weekVerdictLedger.current.settlementOutcomeLabel || '').trim(),
                    debtPackId: String(board.weekVerdictLedger.current.debtPackId || '').trim(),
                    debtStatus: String(board.weekVerdictLedger.current.debtStatus || '').trim(),
                    deferCount: clampInt(board.weekVerdictLedger.current.deferCount, 0, 9999),
                    carryIntoWeekTag: String(board.weekVerdictLedger.current.carryIntoWeekTag || '').trim(),
                    primaryVerificationOrderId: String(board.weekVerdictLedger.current.primaryVerificationOrderId || '').trim(),
                    sideVerificationOrderId: String(board.weekVerdictLedger.current.sideVerificationOrderId || '').trim(),
                    resolutionTier: String(board.weekVerdictLedger.current.resolutionTier || '').trim(),
                    resolvedStatus: String(board.weekVerdictLedger.current.resolvedStatus || '').trim(),
                    primaryVerificationResultStatus: String(board.weekVerdictLedger.current.primaryVerificationResultStatus || '').trim(),
                    sideVerificationResultStatus: String(board.weekVerdictLedger.current.sideVerificationResultStatus || '').trim(),
                    primaryWritebackMode: String(board.weekVerdictLedger.current.primaryWritebackMode || '').trim(),
                    sideWritebackMode: String(board.weekVerdictLedger.current.sideWritebackMode || '').trim(),
                    writebackLine: String(board.weekVerdictLedger.current.writebackLine || '').trim(),
                    proofQuality: String(board.weekVerdictLedger.current.proofQuality || '').trim(),
                    lineageStyle: String(board.weekVerdictLedger.current.lineageStyle || '').trim(),
                    carryIntoNextWeek: !!board.weekVerdictLedger.current.carryIntoNextWeek,
                    settlementSource: String(board.weekVerdictLedger.current.settlementSource || '').trim(),
                    summaryLine: String(board.weekVerdictLedger.current.summaryLine || '').trim()
                }
            }
            : null;
        const normalizeSeasonVerificationArchiveEntry = (entry = null, index = 0) => {
            const root = entry && typeof entry === 'object' ? entry : {};
            return {
                recordId: String(root.recordId || root.id || `season_verification_archive_${index + 1}`).trim() || `season_verification_archive_${index + 1}`,
                weekTag: String(root.weekTag || '').trim(),
                weekLabel: String(root.weekLabel || '').trim(),
                role: String(root.role || '').trim(),
                roleLabel: String(root.roleLabel || '').trim(),
                sourceMode: String(root.sourceMode || '').trim(),
                sourceModeLabel: String(root.sourceModeLabel || '').trim(),
                resultStatus: String(root.resultStatus || '').trim(),
                resultLabel: String(root.resultLabel || '').trim(),
                writebackMode: String(root.writebackMode || '').trim(),
                writebackLabel: String(root.writebackLabel || '').trim(),
                phaseId: String(root.phaseId || '').trim(),
                phaseLabel: String(root.phaseLabel || '').trim(),
                settlementOutcomeId: String(root.settlementOutcomeId || '').trim(),
                settlementOutcomeLabel: String(root.settlementOutcomeLabel || '').trim(),
                settlementSource: String(root.settlementSource || '').trim(),
                debtStatus: String(root.debtStatus || '').trim(),
                deferCount: clampInt(root.deferCount, 0, 9999),
                carryIntoWeekTag: String(root.carryIntoWeekTag || '').trim(),
                carryIntoNextWeek: !!root.carryIntoNextWeek,
                summaryLine: String(root.summaryLine || '').trim(),
                detailLine: String(root.detailLine || '').trim(),
                writebackLine: String(root.writebackLine || '').trim(),
                statusLine: String(root.statusLine || '').trim(),
                noteLine: String(root.noteLine || '').trim(),
                kicker: String(root.kicker || '').trim(),
                tagLine: String(root.tagLine || '').trim(),
                lineageStyle: String(root.lineageStyle || '').trim(),
                chapterIndex: clampInt(root.chapterIndex, 0, 9999),
                anchorSection: String(root.anchorSection || '').trim(),
                actionType: String(root.actionType || '').trim() || 'collection',
                actionValue: String(root.actionValue || '').trim() || 'sanctum',
                ctaLabel: String(root.ctaLabel || '').trim() || '沿此复核',
                createdAt: clampInt(root.createdAt, 0),
                updatedAt: clampInt(root.updatedAt, 0)
            };
        };
        const verificationArchiveEntries = board?.verificationArchive && typeof board.verificationArchive === 'object'
            ? readArray(board.verificationArchive.entries)
                .filter((entry) => entry && typeof entry === 'object')
                .slice(0, 6)
                .map(normalizeSeasonVerificationArchiveEntry)
            : [];
        const verificationArchiveLatest = board?.verificationArchive?.latestEntry && typeof board.verificationArchive.latestEntry === 'object'
            ? normalizeSeasonVerificationArchiveEntry(board.verificationArchive.latestEntry)
            : (verificationArchiveEntries[0] || null);
        const verificationArchive = {
            available: !!board?.verificationArchive?.available || verificationArchiveEntries.length > 0 || !!verificationArchiveLatest,
            totalRecords: clampInt(board?.verificationArchive?.totalRecords, verificationArchiveEntries.length, 9999),
            verifiedCount: clampInt(board?.verificationArchive?.verifiedCount, 0, 9999),
            failedCount: clampInt(board?.verificationArchive?.failedCount, 0, 9999),
            deferredCount: clampInt(board?.verificationArchive?.deferredCount, 0, 9999),
            pendingCount: clampInt(board?.verificationArchive?.pendingCount, 0, 9999),
            summaryLine: String(board?.verificationArchive?.summaryLine || '').trim(),
            detailLine: String(board?.verificationArchive?.detailLine || '').trim(),
            progressText: String(board?.verificationArchive?.progressText || '').trim(),
            latestEntry: verificationArchiveLatest,
            entries: verificationArchiveEntries
        };
        const frontier = board?.frontier && typeof board.frontier === 'object'
            ? (() => {
                const root = board.frontier;
                const actionMeta = resolveSeasonBoardActionMeta(root.actionValue || root.primaryAnchorSection || 'sanctum', 'sanctum');
                const decreeRoot = root.decree && typeof root.decree === 'object' ? root.decree : null;
                const decree = decreeRoot
                    ? {
                        available: decreeRoot.available !== false,
                        id: String(decreeRoot.id || '').trim(),
                        weekTag: String(decreeRoot.weekTag || '').trim(),
                        phaseId: String(decreeRoot.phaseId || '').trim(),
                        phaseLabel: String(decreeRoot.phaseLabel || '').trim(),
                        laneId: String(decreeRoot.laneId || '').trim(),
                        laneLabel: String(decreeRoot.laneLabel || '').trim(),
                        fullLaneLabel: String(decreeRoot.fullLaneLabel || '').trim(),
                        statusId: String(decreeRoot.statusId || '').trim(),
                        statusLabel: String(decreeRoot.statusLabel || '').trim(),
                        pressureScore: clampInt(decreeRoot.pressureScore, 0, 3),
                        tone: String(decreeRoot.tone || '').trim(),
                        toneLabel: String(decreeRoot.toneLabel || '').trim(),
                        title: String(decreeRoot.title || '').trim(),
                        summaryLine: String(decreeRoot.summaryLine || '').trim(),
                        constraintLine: String(decreeRoot.constraintLine || '').trim(),
                        successLine: String(decreeRoot.successLine || '').trim(),
                        riskLine: String(decreeRoot.riskLine || '').trim(),
                        focusLine: String(decreeRoot.focusLine || '').trim(),
                        actionLaneId: String(decreeRoot.actionLaneId || '').trim(),
                        actionType: String(decreeRoot.actionType || '').trim(),
                        actionValue: String(decreeRoot.actionValue || '').trim(),
                        actionTargetLabel: String(decreeRoot.actionTargetLabel || '').trim(),
                        taskId: String(decreeRoot.taskId || '').trim(),
                        source: String(decreeRoot.source || '').trim(),
                        sourceId: String(decreeRoot.sourceId || '').trim()
                    }
                    : null;
                const chronicleRoot = root.chronicle && typeof root.chronicle === 'object' ? root.chronicle : null;
                const chronicle = chronicleRoot
                    ? {
                        available: chronicleRoot.available !== false,
                        id: String(chronicleRoot.id || '').trim(),
                        weekTag: String(chronicleRoot.weekTag || '').trim(),
                        phaseId: String(chronicleRoot.phaseId || '').trim(),
                        phaseLabel: String(chronicleRoot.phaseLabel || '').trim(),
                        laneId: String(chronicleRoot.laneId || '').trim(),
                        laneLabel: String(chronicleRoot.laneLabel || '').trim(),
                        fullLaneLabel: String(chronicleRoot.fullLaneLabel || '').trim(),
                        statusId: String(chronicleRoot.statusId || '').trim(),
                        statusLabel: String(chronicleRoot.statusLabel || '').trim(),
                        pressureScore: clampInt(chronicleRoot.pressureScore, 0, 3),
                        title: String(chronicleRoot.title || '').trim(),
                        summaryLine: String(chronicleRoot.summaryLine || '').trim(),
                        currentEntryLine: String(chronicleRoot.currentEntryLine || '').trim(),
                        progressLine: String(chronicleRoot.progressLine || '').trim(),
                        lessonLine: String(chronicleRoot.lessonLine || '').trim(),
                        nextRecordLine: String(chronicleRoot.nextRecordLine || '').trim(),
                        actionLaneId: String(chronicleRoot.actionLaneId || '').trim(),
                        actionTargetLabel: String(chronicleRoot.actionTargetLabel || '').trim(),
                        taskId: String(chronicleRoot.taskId || '').trim(),
                        source: String(chronicleRoot.source || '').trim(),
                        sourceId: String(chronicleRoot.sourceId || '').trim()
                    }
                    : null;
                const councilRoot = root.council && typeof root.council === 'object' ? root.council : null;
                const council = councilRoot
                    ? {
                        available: councilRoot.available !== false,
                        id: String(councilRoot.id || '').trim(),
                        weekTag: String(councilRoot.weekTag || '').trim(),
                        phaseId: String(councilRoot.phaseId || '').trim(),
                        phaseLabel: String(councilRoot.phaseLabel || '').trim(),
                        laneId: String(councilRoot.laneId || '').trim(),
                        laneLabel: String(councilRoot.laneLabel || '').trim(),
                        fullLaneLabel: String(councilRoot.fullLaneLabel || '').trim(),
                        statusId: String(councilRoot.statusId || '').trim(),
                        statusLabel: String(councilRoot.statusLabel || '').trim(),
                        pressureScore: clampInt(councilRoot.pressureScore, 0, 3),
                        title: String(councilRoot.title || '').trim(),
                        summaryLine: String(councilRoot.summaryLine || '').trim(),
                        verdictLine: String(councilRoot.verdictLine || '').trim(),
                        focusLine: String(councilRoot.focusLine || '').trim(),
                        supportLine: String(councilRoot.supportLine || '').trim(),
                        auditLine: String(councilRoot.auditLine || '').trim(),
                        riskLine: String(councilRoot.riskLine || '').trim(),
                        source: String(councilRoot.source || '').trim(),
                        sourceId: String(councilRoot.sourceId || '').trim(),
                        laneOpinions: readArray(councilRoot.laneOpinions)
                            .filter((entry) => entry && typeof entry === 'object')
                            .slice(0, 3)
                            .map((entry) => ({
                                laneId: String(entry.laneId || '').trim(),
                                laneLabel: String(entry.laneLabel || '').trim(),
                                role: String(entry.role || '').trim(),
                                stance: String(entry.stance || '').trim(),
                                stanceLabel: String(entry.stanceLabel || '').trim(),
                                noteLine: String(entry.noteLine || '').trim()
                            }))
                    }
                    : null;
                return {
                    available: root.available !== false,
                    id: String(root.id || 'season_board_frontier').trim() || 'season_board_frontier',
                    statusId: String(root.statusId || '').trim(),
                    statusLabel: String(root.statusLabel || root.pressureLabel || '稳态').trim() || '稳态',
                    pressureScore: clampInt(root.pressureScore, 0, 3),
                    pressureLabel: String(root.pressureLabel || root.statusLabel || '稳态').trim() || '稳态',
                    primaryFrontId: String(root.primaryFrontId || root.primaryLaneId || '').trim(),
                    primaryFrontLabel: String(root.primaryFrontLabel || '诸界战线').trim() || '诸界战线',
                    primaryFrontShortLabel: String(root.primaryFrontShortLabel || root.primaryFrontLabel || '主战线').trim() || '主战线',
                    primaryLaneId: String(root.primaryLaneId || root.primaryFrontId || '').trim(),
                    primaryAnchorSection: String(root.primaryAnchorSection || '').trim(),
                    summaryLine: String(root.summaryLine || '').trim(),
                    detailLine: String(root.detailLine || '').trim(),
                    guideLine: String(root.guideLine || '').trim(),
                    actionLaneId: String(root.actionLaneId || root.primaryFrontId || root.primaryLaneId || '').trim(),
                    actionType: String(root.actionType || actionMeta.actionType || 'collection').trim() || actionMeta.actionType || 'collection',
                    actionValue: String(root.actionValue || actionMeta.actionValue || 'sanctum').trim() || actionMeta.actionValue || 'sanctum',
                    ctaLabel: String(root.ctaLabel || actionMeta.ctaLabel || '前往推进').trim() || actionMeta.ctaLabel || '前往推进',
                    actionTargetLabel: String(root.actionTargetLabel || actionMeta.targetLabel || '当前主线').trim() || actionMeta.targetLabel || '当前主线',
                    actionLine: String(root.actionLine || '').trim(),
                    source: String(root.source || '').trim(),
                    sourceId: String(root.sourceId || '').trim(),
                    taskSource: String(root.taskSource || '').trim(),
                    taskSourceId: String(root.taskSourceId || '').trim(),
                    taskId: String(root.taskId || '').trim(),
                    decree,
                    chronicle,
                    council,
                    items: readArray(root.items)
                        .filter((entry) => entry && typeof entry === 'object')
                        .slice(0, 3)
                        .map((entry, index) => ({
                            id: String(entry.id || entry.laneId || `frontier_${index + 1}`).trim() || `frontier_${index + 1}`,
                            laneId: String(entry.laneId || entry.id || '').trim(),
                            label: String(entry.label || entry.shortLabel || `战线 ${index + 1}`).trim() || `战线 ${index + 1}`,
                            shortLabel: String(entry.shortLabel || entry.label || `战线 ${index + 1}`).trim() || `战线 ${index + 1}`,
                            icon: String(entry.icon || '✦').trim() || '✦',
                            role: String(entry.role || '').trim(),
                            roleLabel: String(entry.roleLabel || '').trim(),
                            statusId: String(entry.statusId || '').trim(),
                            statusLabel: String(entry.statusLabel || '').trim(),
                            pressureScore: clampInt(entry.pressureScore, 0, 3),
                            pressureLabel: String(entry.pressureLabel || entry.statusLabel || '').trim(),
                            progressText: String(entry.progressText || '').trim(),
                            completed: !!entry.completed,
                            summaryLine: String(entry.summaryLine || '').trim(),
                            detailLine: String(entry.detailLine || '').trim(),
                            anchorSection: String(entry.anchorSection || '').trim(),
                            actionType: String(entry.actionType || '').trim(),
                            actionValue: String(entry.actionValue || '').trim(),
                            ctaLabel: String(entry.ctaLabel || '').trim(),
                            actionTargetLabel: String(entry.actionTargetLabel || '').trim(),
                            priority: clampInt(entry.priority || index + 1, 1, 9)
                        }))
                };
            })()
            : null;
        const nextTask = board?.nextTask && typeof board.nextTask === 'object'
            ? {
                laneId: String(board.nextTask.laneId || '').trim(),
                laneLabel: String(board.nextTask.laneLabel || '').trim(),
                id: String(board.nextTask.id || '').trim(),
                label: String(board.nextTask.label || '').trim(),
                progressText: String(board.nextTask.progressText || '').trim(),
                hintLine: String(board.nextTask.hintLine || '').trim(),
                statusLine: String(board.nextTask.statusLine || '').trim(),
                anchorSection: String(board.nextTask.anchorSection || '').trim(),
                actionType: String(board.nextTask.actionType || '').trim(),
                actionValue: String(board.nextTask.actionValue || '').trim(),
                ctaLabel: String(board.nextTask.ctaLabel || '').trim(),
                source: String(board.nextTask.source || '').trim(),
                sourceId: String(board.nextTask.sourceId || '').trim(),
                taskSource: String(board.nextTask.taskSource || '').trim(),
                taskSourceId: String(board.nextTask.taskSourceId || '').trim()
            }
            : null;
        const nextWeekGoal = board?.nextWeekGoal && typeof board.nextWeekGoal === 'object'
            ? {
                title: String(board.nextWeekGoal.title || '').trim(),
                note: String(board.nextWeekGoal.note || '').trim(),
                action: String(board.nextWeekGoal.action || '').trim(),
                value: String(board.nextWeekGoal.value || '').trim(),
                buttonLabel: String(board.nextWeekGoal.buttonLabel || board.nextWeekGoal.ctaLabel || '').trim(),
                source: String(board.nextWeekGoal.source || '').trim(),
                sourceId: String(board.nextWeekGoal.sourceId || '').trim(),
                taskSource: String(board.nextWeekGoal.taskSource || '').trim(),
                taskSourceId: String(board.nextWeekGoal.taskSourceId || '').trim(),
                taskId: String(board.nextWeekGoal.taskId || '').trim(),
                laneId: String(board.nextWeekGoal.laneId || '').trim(),
                anchorSection: String(board.nextWeekGoal.anchorSection || '').trim()
            }
            : (nextTask
                ? {
                    title: nextTask.label,
                    note: [nextTask.hintLine, nextTask.statusLine, nextTask.progressText].filter(Boolean).join(' · '),
                    action: nextTask.actionType || 'collection',
                    value: nextTask.actionValue || nextTask.anchorSection || 'sanctum',
                    buttonLabel: nextTask.ctaLabel || '前往推进',
                    source: nextTask.source || 'lane',
                    sourceId: nextTask.sourceId || nextTask.id,
                    taskSource: nextTask.taskSource || 'lane',
                    taskSourceId: nextTask.taskSourceId || nextTask.id,
                    taskId: nextTask.id,
                    laneId: nextTask.laneId,
                    anchorSection: nextTask.anchorSection
                }
                : null);
        return {
            available: !!board,
            title: '赛季天道盘',
            icon: String(board?.seasonIcon || board?.phaseIcon || '🜂').trim() || '🜂',
            seasonLabel: String(board?.seasonLabel || board?.seasonName || '赛季天道盘').trim() || '赛季天道盘',
            seasonName: String(board?.seasonName || board?.seasonLabel || '赛季天道盘').trim() || '赛季天道盘',
            weekTag: String(board?.weekTag || '').trim(),
            weekLabel: String(board?.weekLabel || '').trim() || '本周轮转',
            phaseId: String(board?.phaseId || 'sampling').trim() || 'sampling',
            phaseLabel: String(board?.phaseLabel || '采样期').trim() || '采样期',
            phaseIcon: String(board?.phaseIcon || '🔭').trim() || '🔭',
            themeId: String(board?.themeId || '').trim(),
            themeLabel: String(board?.themeLabel || '本周主轴').trim() || '本周主轴',
            summaryLine: String(board?.summaryLine || '').trim() || '赛季天道盘正在同步本周主轴。',
            detailLine: String(board?.detailLine || board?.rewardLine || board?.statusLine || '').trim(),
            guideLine: String(board?.guideLine || board?.crossModeSummary || '').trim(),
            statusLine: String(board?.statusLine || '').trim(),
            crossModeSummary: String(board?.crossModeSummary || '').trim(),
            completedTaskCount,
            totalTaskCount,
            progressText,
            settlement,
            debtPack,
            weekVerdictLedger,
            verificationArchive,
            verificationOrders,
            laneRewards,
            laneRewardSummary,
            frontier,
            primaryVerification: verificationOrderPair.primary,
            secondaryVerification: verificationOrderPair.secondary,
            nextTask,
            nextWeekGoal,
            lanes: lanesWithRewards
        };
    };
    const shouldSurfaceSeasonBoardVerification = (seasonBoard = null, seasonSettlement = seasonBoard?.settlement) => {
        const phaseId = String(seasonBoard?.phaseId || '').trim();
        const outcomeId = String(seasonSettlement?.outcomeId || '').trim();
        return phaseId === 'ranking'
            || ['positive_sheet', 'risky_sheet', 'debt_sheet'].includes(outcomeId);
    };
    const getSeasonBoardNextTaskLine = (seasonNextTask = null, fallback = '优先补当前季盘行动。') => {
        if (!seasonNextTask || typeof seasonNextTask !== 'object') return fallback;
        return String(
            seasonNextTask.hintLine
            || (seasonNextTask.label ? `当前季盘行动：${seasonNextTask.label}` : '')
            || seasonNextTask.statusLine
            || seasonNextTask.progressText
            || fallback
        ).trim() || fallback;
    };
    const resolveSeasonBoardActionMeta = (target = '', fallbackTarget = 'sanctum') => {
        const normalizedTarget = String(target || '').trim();
        const fallback = SECTION_META[fallbackTarget]
            ? fallbackTarget
            : 'sanctum';
        const collectionTargetLabelMap = {
            laws: '法则图鉴',
            spirits: '灵契图鉴',
            chapters: '章节档案',
            enemies: '敌影档案',
            bosses: 'Boss 档案',
            builds: '构筑快照',
            slates: '归卷书架',
            sanctum: '洞府'
        };
        const collectionAction = (value, ctaLabel) => ({
            actionType: 'collection',
            actionValue: value,
            ctaLabel,
            targetLabel: collectionTargetLabelMap[value] || SECTION_META[value]?.title || '当前主线'
        });
        if (SECTION_META[normalizedTarget]) {
            const collectionCtaLabelMap = {
                builds: '查看构筑',
                chapters: '查看章节',
                sanctum: '回看洞府',
                slates: '查看归卷'
            };
            return collectionAction(
                normalizedTarget,
                collectionCtaLabelMap[normalizedTarget] || '前往推进'
            );
        }
        switch (normalizedTarget) {
            case 'challenge':
                return {
                    actionType: 'challenge',
                    actionValue: 'weekly',
                    ctaLabel: '前往周挑战',
                    targetLabel: '周挑战'
                };
            case 'pvp':
                return {
                    actionType: 'screen',
                    actionValue: 'pvp-screen',
                    ctaLabel: '前往天道榜',
                    targetLabel: '天道榜'
                };
            case 'endless':
            case 'map':
                return {
                    actionType: 'screen',
                    actionValue: 'map-screen',
                    ctaLabel: normalizedTarget === 'endless' ? '重返无尽' : '返回地图',
                    targetLabel: normalizedTarget === 'endless' ? '无尽轮回' : '地图'
                };
            default:
                return collectionAction(fallback, fallback === 'sanctum' ? '回看洞府' : '前往推进');
        }
    };

    const getCharacterMeta = (characterId) => {
        if (typeof CHARACTERS === 'undefined' || !CHARACTERS || !CHARACTERS[characterId]) return null;
        const meta = CHARACTERS[characterId];
        return {
            id: characterId,
            name: meta.name || characterId,
            title: meta.title || '',
            keywords: Array.isArray(meta.keywords) ? meta.keywords : []
        };
    };

    const getChapterIndexForRealm = (realm) => Math.max(1, Math.min(6, Math.floor((Math.max(1, clampInt(realm, 1, 18)) - 1) / 3) + 1));

    Game.prototype.ensureCollectionHubBootState = function () {
        if (!this.collectionHubState || typeof this.collectionHubState !== 'object') {
            this.collectionHubState = this.normalizeCollectionHubState();
        } else {
            this.collectionHubState = this.normalizeCollectionHubState(this.collectionHubState);
        }
        if (!Array.isArray(this.collectionUnlockHistory)) {
            this.collectionUnlockHistory = this.loadCollectionUnlockHistory();
        }
        if (!this.bossMemoryRecords || typeof this.bossMemoryRecords !== 'object') {
            this.bossMemoryRecords = this.loadBossMemoryRecords();
        }
        if (!this.runPathRecords || typeof this.runPathRecords !== 'object') {
            this.runPathRecords = this.loadRunPathRecords();
        }
        if (!Array.isArray(this.runPathBossSamples)) {
            this.runPathBossSamples = this.loadRunPathBossSamples();
        }
        if (!this.bossMemorySession || typeof this.bossMemorySession !== 'object') {
            this.bossMemorySession = null;
        }
        if (typeof this.selectedSpiritCodexId !== 'string') this.selectedSpiritCodexId = '';
        if (typeof this.selectedChapterCodexId !== 'string') this.selectedChapterCodexId = '';
        if (typeof this.selectedEnemyCodexId !== 'string') this.selectedEnemyCodexId = '';
        if (typeof this.selectedBossArchiveId !== 'string') this.selectedBossArchiveId = '';
        if (typeof this.selectedRunSlateId !== 'string') this.selectedRunSlateId = '';
    };

    Game.prototype.escapeCollectionHtml = function (value) {
        return escapeHtml(value);
    };

    Game.prototype.normalizeCollectionHubState = function (rawState = null) {
        const source = rawState && typeof rawState === 'object' ? rawState : {};
        const allowedSections = Object.keys(SECTION_META);
        return {
            section: allowedSections.includes(source.section) ? source.section : 'laws',
            spiritQuery: sanitizeQuery(source.spiritQuery, 60),
            spiritFocus: ['all', 'current', 'aligned', 'hidden'].includes(source.spiritFocus) ? source.spiritFocus : 'all',
            chapterQuery: sanitizeQuery(source.chapterQuery, 60),
            chapterFocus: ['all', 'active', 'cleared', 'upcoming'].includes(source.chapterFocus) ? source.chapterFocus : 'all',
            enemyQuery: sanitizeQuery(source.enemyQuery, 60),
            enemyFocus: ['all', 'scouted', 'upcoming', 'control'].includes(source.enemyFocus) ? source.enemyFocus : 'all',
            bossQuery: sanitizeQuery(source.bossQuery, 60),
            bossFocus: ['all', 'defeated', 'pending', 'highpressure'].includes(source.bossFocus) ? source.bossFocus : 'all',
            slateTheme: sanitizeQuery(source.slateTheme || 'all', 40) || 'all',
            slateChapter: sanitizeQuery(source.slateChapter || 'all', 40) || 'all',
            slateRating: sanitizeQuery(source.slateRating || 'all', 40) || 'all'
        };
    };

    Game.prototype.getCollectionHubState = function () {
        this.ensureCollectionHubBootState();
        return this.collectionHubState;
    };

    Game.prototype.getCollectionSectionMeta = function (section = 'laws') {
        return SECTION_META[section] || SECTION_META.laws;
    };

    Game.prototype.getRewardSeasonBoardHandoffArrivalNotice = function (section = '') {
        const notice = this.pendingRewardSeasonBoardHandoffNotice && typeof this.pendingRewardSeasonBoardHandoffNotice === 'object'
            ? this.pendingRewardSeasonBoardHandoffNotice
            : null;
        if (!notice) return null;

        const action = String(notice.action || '').trim();
        if (action !== 'collection') return null;

        const targetSection = String(notice.value || notice.anchorSection || 'sanctum').trim() || 'sanctum';
        const currentSection = String(section || this.collectionHubState?.section || '').trim();
        if (currentSection && targetSection && currentSection !== targetSection) return null;

        const source = String(notice.source || '').trim();
        const sourceKey = String(notice.sourceKey || '').trim();
        const sourceLabelMap = {
            debt_pack: '债账包',
            lane: '赛季任务',
            settlement: '季押卷',
            verification: '结业验证'
        };
        const sourceKeyLabelMap = {
            debtPack: '债账包',
            nextTask: '下周行动',
            nextWeekGoal: '下周目标',
            primary: '赛季行动',
            sideVerification: '旁证验证',
            verification: '结业验证'
        };
        const targetLabelMap = {
            laws: '法则图鉴',
            spirits: '灵契图鉴',
            chapters: '章节档案',
            enemies: '敌影档案',
            bosses: 'Boss 档案',
            builds: '构筑快照',
            slates: '归卷书架',
            sanctum: '洞府'
        };

        return {
            sourceKey,
            action,
            value: targetSection,
            buttonLabel: String(notice.buttonLabel || '前往推进').trim() || '前往推进',
            source,
            sourceId: String(notice.sourceId || '').trim(),
            taskSource: String(notice.taskSource || '').trim(),
            taskSourceId: String(notice.taskSourceId || '').trim(),
            taskId: String(notice.taskId || '').trim(),
            laneId: String(notice.laneId || '').trim(),
            anchorSection: String(notice.anchorSection || '').trim(),
            focusLabel: String(notice.focusLabel || '定位季盘任务').trim() || '定位季盘任务',
            title: String(notice.title || '').trim(),
            note: String(notice.note || '').trim(),
            sourceLabel: sourceLabelMap[source] || sourceKeyLabelMap[sourceKey] || '赛季行动',
            targetLabel: targetLabelMap[targetSection] || SECTION_META[targetSection]?.title || targetSection || '藏经阁',
            createdAt: clampInt(notice.createdAt || Date.now(), 0)
        };
    };

    Game.prototype.renderRewardSeasonBoardHandoffArrival = function (section = '') {
        if (typeof document === 'undefined') return;
        const heading = document.querySelector('#collection .collection-heading-group');
        let noticeEl = document.getElementById('collection-season-board-handoff-arrival');
        const notice = this.getRewardSeasonBoardHandoffArrivalNotice(section);
        if (!heading || !notice) {
            if (noticeEl) noticeEl.remove();
            return;
        }

        if (!noticeEl) {
            noticeEl = document.createElement('div');
            noticeEl.id = 'collection-season-board-handoff-arrival';
            heading.appendChild(noticeEl);
        }

        noticeEl.className = 'collection-handoff-arrival';
        noticeEl.dataset.seasonBoardHandoffArrival = 'true';
        noticeEl.dataset.seasonBoardHandoffSourceKey = notice.sourceKey;
        noticeEl.dataset.seasonBoardHandoffAction = notice.action;
        noticeEl.dataset.seasonBoardHandoffValue = notice.value;
        noticeEl.dataset.seasonBoardHandoffSource = notice.source;
        noticeEl.dataset.seasonBoardHandoffSourceId = notice.sourceId;
        noticeEl.dataset.seasonBoardHandoffTaskSource = notice.taskSource;
        noticeEl.dataset.seasonBoardHandoffTaskSourceId = notice.taskSourceId;
        noticeEl.dataset.seasonBoardHandoffTaskId = notice.taskId;
        noticeEl.dataset.seasonBoardHandoffLaneId = notice.laneId;
        noticeEl.dataset.seasonBoardHandoffAnchor = notice.anchorSection;
        noticeEl.dataset.seasonBoardHandoffFocusLabel = notice.focusLabel;
        noticeEl.innerHTML = `
            <span class="collection-handoff-arrival-kicker">赛季行动已定位</span>
            <strong>${escapeHtml(notice.title || `${notice.sourceLabel}行动`)}</strong>
            <p>${escapeHtml(`${notice.buttonLabel} · 来自${notice.sourceLabel} · 已定位到 ${notice.targetLabel}${notice.note ? ` · ${notice.note}` : ''}`)}</p>
            <button type="button" class="collection-inline-btn collection-handoff-arrival-btn"
                data-season-board-handoff-focus="true"
                data-season-board-handoff-task-id="${escapeHtml(notice.taskId)}"
                data-season-board-handoff-lane-id="${escapeHtml(notice.laneId)}"
                onclick="game.focusRewardSeasonBoardHandoffArrival()">${escapeHtml(notice.focusLabel)}</button>
        `;
        this.lastRewardSeasonBoardHandoffArrivalNotice = { ...notice };
        const renderedPendingNotice = this.pendingRewardSeasonBoardHandoffNotice;
        if (renderedPendingNotice && typeof setTimeout === 'function') {
            setTimeout(() => {
                if (this.pendingRewardSeasonBoardHandoffNotice === renderedPendingNotice) {
                    this.pendingRewardSeasonBoardHandoffNotice = null;
                }
            }, 0);
        }
    };

    Game.prototype.getRewardSeasonBoardHandoffArrivalFocusNotice = function () {
        const pending = typeof this.getRewardSeasonBoardHandoffArrivalNotice === 'function'
            ? this.getRewardSeasonBoardHandoffArrivalNotice(this.collectionHubState?.section || '')
            : null;
        const raw = pending || (
            this.lastRewardSeasonBoardHandoffArrivalNotice && typeof this.lastRewardSeasonBoardHandoffArrivalNotice === 'object'
                ? this.lastRewardSeasonBoardHandoffArrivalNotice
                : null
        );
        if (!raw) return null;
        const action = String(raw.action || '').trim();
        if (action !== 'collection') return null;
        const value = String(raw.value || raw.anchorSection || 'sanctum').trim() || 'sanctum';
        return {
            ...raw,
            action,
            value,
            sourceKey: String(raw.sourceKey || '').trim(),
            source: String(raw.source || '').trim(),
            sourceId: String(raw.sourceId || '').trim(),
            taskSource: String(raw.taskSource || '').trim(),
            taskSourceId: String(raw.taskSourceId || '').trim(),
            taskId: String(raw.taskId || '').trim(),
            laneId: String(raw.laneId || '').trim(),
            focusLabel: String(raw.focusLabel || '定位季盘任务').trim() || '定位季盘任务'
        };
    };

    Game.prototype.clearRewardSeasonBoardHandoffArrivalFocus = function () {
        if (typeof document === 'undefined') return;
        document.querySelectorAll('[data-season-board-handoff-focused="true"], [data-season-board-handoff-action-target="true"]').forEach((el) => {
            el.classList?.remove('season-board-handoff-focus', 'season-board-handoff-action-target');
            delete el.dataset.seasonBoardHandoffFocused;
            delete el.dataset.seasonBoardHandoffFocusKind;
            delete el.dataset.seasonBoardHandoffFocusSourceKey;
            delete el.dataset.seasonBoardHandoffActionTarget;
        });
    };

    Game.prototype.findRewardSeasonBoardHandoffArrivalTarget = function (notice = {}) {
        if (typeof document === 'undefined') return null;
        const sourceKey = String(notice.sourceKey || '').trim();
        const source = String(notice.source || '').trim();
        const sourceId = String(notice.sourceId || '').trim();
        const taskSource = String(notice.taskSource || '').trim();
        const taskSourceId = String(notice.taskSourceId || '').trim();
        const taskId = String(notice.taskId || '').trim();
        const laneId = String(notice.laneId || '').trim();
        const textIncludes = (value = '', token = '') => {
            const safeValue = String(value || '');
            const safeToken = String(token || '').trim();
            return !!safeToken && safeValue.includes(safeToken);
        };
        const findNode = (selector, predicate) => Array.from(document.querySelectorAll(selector))
            .find((el) => {
                try {
                    return predicate(el, el.dataset || {});
                } catch (_error) {
                    return false;
                }
            }) || null;
        const matchesTaskLane = (taskValue = '', laneValue = '') => {
            if (!taskId) return false;
            return String(taskValue || '') === taskId && (!laneId || String(laneValue || '') === laneId);
        };
        const matchesSource = (nodeSource = '', nodeSourceId = '', nodeTaskSource = '', nodeTaskSourceId = '') => {
            if (source && String(nodeSource || '') === source && (!sourceId || String(nodeSourceId || '') === sourceId)) return true;
            if (taskSource && String(nodeTaskSource || '') === taskSource && (!taskSourceId || String(nodeTaskSourceId || '') === taskSourceId)) return true;
            return false;
        };
        const goal = findNode('[data-season-board-goal="true"]', (_el, ds) => (
            matchesTaskLane(ds.seasonBoardGoalTaskId, ds.seasonBoardGoalLaneId)
            || matchesSource(ds.seasonBoardGoalSource, ds.seasonBoardGoalSourceId, ds.seasonBoardGoalTaskSource, ds.seasonBoardGoalTaskSourceId)
            || textIncludes(ds.seasonBoardGoalId, taskId)
            || textIncludes(ds.seasonBoardGoalId, sourceId)
        ));
        if (goal) {
            return {
                kind: 'goal',
                element: goal,
                action: goal.querySelector('[data-season-board-action="true"]'),
                id: goal.dataset.seasonBoardGoalId || ''
            };
        }
        const research = findNode('[data-season-board-research="true"]', (_el, ds) => (
            matchesTaskLane(ds.seasonBoardResearchTaskId, ds.seasonBoardResearchLaneId)
            || matchesSource(ds.seasonBoardResearchSource, ds.seasonBoardResearchSourceId, ds.seasonBoardResearchTaskSource, ds.seasonBoardResearchTaskSourceId)
            || textIncludes(ds.seasonBoardResearchId, taskId)
            || textIncludes(ds.seasonBoardResearchId, sourceId)
        ));
        if (research) {
            return {
                kind: 'research',
                element: research,
                action: research.querySelector('[data-season-board-research-action="true"]'),
                id: research.dataset.seasonBoardResearchId || ''
            };
        }
        const task = findNode('[data-season-board-task="true"]', (_el, ds) => (
            matchesTaskLane(ds.seasonBoardTaskId, ds.seasonBoardLaneId)
            || (!!taskId && ds.seasonBoardTaskId === taskId)
        ));
        if (task) {
            return {
                kind: 'task',
                element: task,
                action: null,
                id: task.dataset.seasonBoardTaskId || ''
            };
        }
        const lane = findNode('[data-season-board-lane="true"]', (_el, ds) => (
            !!laneId && ds.seasonBoardLaneId === laneId
        ));
        if (lane) {
            return {
                kind: 'lane',
                element: lane,
                action: null,
                id: lane.dataset.seasonBoardLaneId || ''
            };
        }
        const fallbackGoal = sourceKey
            ? findNode('[data-season-board-goal="true"], [data-season-board-research="true"]', (el, ds) => (
                textIncludes(ds.seasonBoardGoalId || ds.seasonBoardResearchId || el.textContent || '', sourceKey)
            ))
            : null;
        return fallbackGoal
            ? {
                kind: fallbackGoal.dataset.seasonBoardGoal ? 'goal' : 'research',
                element: fallbackGoal,
                action: fallbackGoal.querySelector('[data-season-board-action="true"], [data-season-board-research-action="true"]'),
                id: fallbackGoal.dataset.seasonBoardGoalId || fallbackGoal.dataset.seasonBoardResearchId || ''
            }
            : null;
    };

    Game.prototype.focusRewardSeasonBoardHandoffArrival = function (retryAttempt = 0) {
        if (typeof document === 'undefined') return false;
        const notice = this.getRewardSeasonBoardHandoffArrivalFocusNotice();
        if (!notice) return false;
        const targetSection = notice.value || notice.anchorSection || 'sanctum';
        let switchedSection = false;
        if (this.currentScreen !== 'collection' || this.collectionHubState?.section !== targetSection) {
            if (typeof this.switchCollectionSection === 'function') {
                this.switchCollectionSection(targetSection);
                switchedSection = true;
            } else if (typeof this.showCollection === 'function') {
                this.showCollection(targetSection);
                switchedSection = true;
            }
        }
        if (typeof this.clearSeasonBoardTaskFollowArrivalFocus === 'function') {
            this.clearSeasonBoardTaskFollowArrivalFocus();
        }
        this.clearRewardSeasonBoardHandoffArrivalFocus();
        const target = this.findRewardSeasonBoardHandoffArrivalTarget(notice);
        if (!target?.element) {
            if ((switchedSection || retryAttempt > 0) && retryAttempt < 2 && typeof setTimeout === 'function') {
                this.lastRewardSeasonBoardHandoffArrivalFocus = {
                    ok: false,
                    reason: 'target_retry_pending',
                    taskId: notice.taskId,
                    laneId: notice.laneId,
                    retryAttempt,
                    focusedAt: Date.now()
                };
                setTimeout(() => this.focusRewardSeasonBoardHandoffArrival(retryAttempt + 1), 50);
                return false;
            }
            this.lastRewardSeasonBoardHandoffArrivalFocus = {
                ok: false,
                reason: 'target_not_found',
                taskId: notice.taskId,
                laneId: notice.laneId,
                retryAttempt,
                focusedAt: Date.now()
            };
            return false;
        }
        target.element.classList.add('season-board-handoff-focus');
        target.element.dataset.seasonBoardHandoffFocused = 'true';
        target.element.dataset.seasonBoardHandoffFocusKind = target.kind;
        target.element.dataset.seasonBoardHandoffFocusSourceKey = notice.sourceKey;
        if (target.action) {
            target.action.classList.add('season-board-handoff-action-target');
            target.action.dataset.seasonBoardHandoffActionTarget = 'true';
        }
        if (typeof target.element.scrollIntoView === 'function') {
            target.element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
        const focusTarget = target.action || target.element;
        if (typeof focusTarget.focus === 'function') {
            try {
                focusTarget.focus({ preventScroll: true });
            } catch (_error) {
                focusTarget.focus();
            }
        }
        this.lastRewardSeasonBoardHandoffArrivalFocus = {
            ok: true,
            kind: target.kind,
            id: target.id,
            sourceKey: notice.sourceKey,
            taskId: notice.taskId,
            laneId: notice.laneId,
            hasAction: !!target.action,
            focusedAt: Date.now()
        };
        return true;
    };

    Game.prototype.getSeasonBoardTaskFollowArrivalNotice = function (section = '') {
        const notice = this.pendingSeasonBoardTaskFollowNotice && typeof this.pendingSeasonBoardTaskFollowNotice === 'object'
            ? this.pendingSeasonBoardTaskFollowNotice
            : null;
        if (!notice) return null;

        const action = String(notice.action || '').trim();
        if (action !== 'collection') return null;

        const targetSection = String(notice.value || notice.anchorSection || 'sanctum').trim() || 'sanctum';
        const currentSection = String(section || this.collectionHubState?.section || '').trim();
        if (currentSection && targetSection && currentSection !== targetSection) return null;

        const source = String(notice.source || '').trim();
        const sourceLabelMap = {
            debt_pack: '债账包',
            lane: '赛季任务',
            settlement: '季押卷',
            verification: '结业验证'
        };
        const targetLabelMap = {
            laws: '法则图鉴',
            spirits: '灵契图鉴',
            chapters: '章节档案',
            enemies: '敌影档案',
            bosses: 'Boss 档案',
            builds: '构筑快照',
            slates: '归卷书架',
            sanctum: '洞府'
        };

        return {
            sourceKey: String(notice.sourceKey || 'task').trim() || 'task',
            action,
            value: targetSection,
            buttonLabel: String(notice.buttonLabel || '前往推进').trim() || '前往推进',
            source,
            sourceId: String(notice.sourceId || '').trim(),
            taskSource: String(notice.taskSource || '').trim(),
            taskSourceId: String(notice.taskSourceId || '').trim(),
            taskId: String(notice.taskId || '').trim(),
            laneId: String(notice.laneId || '').trim(),
            laneLabel: String(notice.laneLabel || '').trim(),
            anchorSection: String(notice.anchorSection || '').trim(),
            focusLabel: String(notice.focusLabel || '定位任务行').trim() || '定位任务行',
            title: String(notice.title || '季盘任务').trim() || '季盘任务',
            note: String(notice.note || '').trim(),
            sourceLabel: sourceLabelMap[source] || '季盘任务',
            targetLabel: targetLabelMap[targetSection] || SECTION_META[targetSection]?.title || targetSection || '藏经阁',
            createdAt: clampInt(notice.createdAt || Date.now(), 0)
        };
    };

    Game.prototype.renderSeasonBoardTaskFollowArrival = function (section = '') {
        if (typeof document === 'undefined') return;
        const heading = document.querySelector('#collection .collection-heading-group');
        let noticeEl = document.getElementById('collection-season-board-task-arrival');
        const notice = this.getSeasonBoardTaskFollowArrivalNotice(section);
        if (!heading || !notice) {
            if (noticeEl) noticeEl.remove();
            return;
        }

        if (!noticeEl) {
            noticeEl = document.createElement('div');
            noticeEl.id = 'collection-season-board-task-arrival';
            heading.appendChild(noticeEl);
        }

        noticeEl.className = 'collection-handoff-arrival collection-task-follow-arrival';
        noticeEl.dataset.seasonBoardTaskArrival = 'true';
        noticeEl.dataset.seasonBoardTaskSourceKey = notice.sourceKey;
        noticeEl.dataset.seasonBoardTaskAction = notice.action;
        noticeEl.dataset.seasonBoardTaskValue = notice.value;
        noticeEl.dataset.seasonBoardTaskSource = notice.source;
        noticeEl.dataset.seasonBoardTaskSourceId = notice.sourceId;
        noticeEl.dataset.seasonBoardTaskTaskSource = notice.taskSource;
        noticeEl.dataset.seasonBoardTaskTaskSourceId = notice.taskSourceId;
        noticeEl.dataset.seasonBoardTaskTaskId = notice.taskId;
        noticeEl.dataset.seasonBoardTaskLaneId = notice.laneId;
        noticeEl.dataset.seasonBoardTaskLaneLabel = notice.laneLabel;
        noticeEl.dataset.seasonBoardTaskAnchor = notice.anchorSection;
        noticeEl.dataset.seasonBoardTaskFocusLabel = notice.focusLabel;
        noticeEl.innerHTML = `
            <span class="collection-handoff-arrival-kicker">季盘任务已定位</span>
            <strong>${escapeHtml(notice.title || '季盘任务')}</strong>
            <p>${escapeHtml(`${notice.buttonLabel} · 来自${notice.sourceLabel}${notice.laneLabel ? ` / ${notice.laneLabel}` : ''} · 已定位到 ${notice.targetLabel}${notice.note ? ` · ${notice.note}` : ''}`)}</p>
            <button type="button" class="collection-inline-btn collection-handoff-arrival-btn"
                data-season-board-task-arrival-focus="true"
                data-season-board-task-arrival-task-id="${escapeHtml(notice.taskId)}"
                data-season-board-task-arrival-lane-id="${escapeHtml(notice.laneId)}"
                onclick="game.focusSeasonBoardTaskFollowArrival()">${escapeHtml(notice.focusLabel)}</button>
        `;
        this.lastSeasonBoardTaskFollowArrivalNotice = { ...notice };
        const renderedPendingNotice = this.pendingSeasonBoardTaskFollowNotice;
        if (renderedPendingNotice && typeof setTimeout === 'function') {
            setTimeout(() => {
                if (this.pendingSeasonBoardTaskFollowNotice === renderedPendingNotice) {
                    this.pendingSeasonBoardTaskFollowNotice = null;
                }
            }, 0);
        }
    };

    Game.prototype.getSeasonBoardTaskFollowArrivalFocusNotice = function () {
        const pending = typeof this.getSeasonBoardTaskFollowArrivalNotice === 'function'
            ? this.getSeasonBoardTaskFollowArrivalNotice(this.collectionHubState?.section || '')
            : null;
        const raw = pending || (
            this.lastSeasonBoardTaskFollowArrivalNotice && typeof this.lastSeasonBoardTaskFollowArrivalNotice === 'object'
                ? this.lastSeasonBoardTaskFollowArrivalNotice
                : null
        );
        if (!raw) return null;
        const action = String(raw.action || '').trim();
        if (action !== 'collection') return null;
        const value = String(raw.value || raw.anchorSection || 'sanctum').trim() || 'sanctum';
        return {
            ...raw,
            action,
            value,
            sourceKey: String(raw.sourceKey || 'task').trim() || 'task',
            source: String(raw.source || '').trim(),
            sourceId: String(raw.sourceId || '').trim(),
            taskSource: String(raw.taskSource || '').trim(),
            taskSourceId: String(raw.taskSourceId || '').trim(),
            taskId: String(raw.taskId || '').trim(),
            laneId: String(raw.laneId || '').trim(),
            focusLabel: String(raw.focusLabel || '定位任务行').trim() || '定位任务行'
        };
    };

    Game.prototype.clearSeasonBoardTaskFollowArrivalFocus = function () {
        if (typeof document === 'undefined') return;
        document.querySelectorAll('[data-season-board-task-arrival-focused="true"], [data-season-board-task-arrival-action-target="true"]').forEach((el) => {
            el.classList?.remove('season-board-handoff-focus', 'season-board-handoff-action-target');
            delete el.dataset.seasonBoardTaskArrivalFocused;
            delete el.dataset.seasonBoardTaskArrivalFocusKind;
            delete el.dataset.seasonBoardTaskArrivalFocusSourceKey;
            delete el.dataset.seasonBoardTaskArrivalActionTarget;
        });
    };

    Game.prototype.findSeasonBoardTaskFollowArrivalTarget = function (notice = {}) {
        if (typeof document === 'undefined') return null;
        const taskId = String(notice.taskId || '').trim();
        const laneId = String(notice.laneId || '').trim();
        const findNode = (selector, predicate) => Array.from(document.querySelectorAll(selector))
            .find((el) => {
                try {
                    return predicate(el, el.dataset || {});
                } catch (_error) {
                    return false;
                }
            }) || null;
        const matchesTaskLane = (taskValue = '', laneValue = '') => (
            !!taskId
            && String(taskValue || '') === taskId
            && (!laneId || String(laneValue || '') === laneId)
        );
        const task = findNode('[data-season-board-task="true"]', (_el, ds) => (
            matchesTaskLane(ds.seasonBoardTaskId, ds.seasonBoardLaneId)
            || (!!taskId && ds.seasonBoardTaskId === taskId)
        ));
        if (task) {
            return {
                kind: 'task',
                element: task,
                action: task.querySelector('[data-season-board-task-action="true"]'),
                id: task.dataset.seasonBoardTaskId || ''
            };
        }
        const lane = findNode('[data-season-board-lane="true"]', (_el, ds) => (
            !!laneId && ds.seasonBoardLaneId === laneId
        ));
        if (lane) {
            return {
                kind: 'lane',
                element: lane,
                action: null,
                id: lane.dataset.seasonBoardLaneId || ''
            };
        }
        return typeof this.findRewardSeasonBoardHandoffArrivalTarget === 'function'
            ? this.findRewardSeasonBoardHandoffArrivalTarget(notice)
            : null;
    };

    Game.prototype.focusSeasonBoardTaskFollowArrival = function (retryAttempt = 0) {
        if (typeof document === 'undefined') return false;
        const notice = this.getSeasonBoardTaskFollowArrivalFocusNotice();
        if (!notice) return false;
        const targetSection = notice.value || notice.anchorSection || 'sanctum';
        let switchedSection = false;
        if (this.currentScreen !== 'collection' || this.collectionHubState?.section !== targetSection) {
            if (typeof this.switchCollectionSection === 'function') {
                this.switchCollectionSection(targetSection);
                switchedSection = true;
            } else if (typeof this.showCollection === 'function') {
                this.showCollection(targetSection);
                switchedSection = true;
            }
        }
        if (typeof this.clearRewardSeasonBoardHandoffArrivalFocus === 'function') {
            this.clearRewardSeasonBoardHandoffArrivalFocus();
        }
        this.clearSeasonBoardTaskFollowArrivalFocus();
        const target = this.findSeasonBoardTaskFollowArrivalTarget(notice);
        if (!target?.element) {
            if ((switchedSection || retryAttempt > 0) && retryAttempt < 2 && typeof setTimeout === 'function') {
                this.lastSeasonBoardTaskFollowArrivalFocus = {
                    ok: false,
                    reason: 'target_retry_pending',
                    taskId: notice.taskId,
                    laneId: notice.laneId,
                    retryAttempt,
                    focusedAt: Date.now()
                };
                setTimeout(() => this.focusSeasonBoardTaskFollowArrival(retryAttempt + 1), 50);
                return false;
            }
            this.lastSeasonBoardTaskFollowArrivalFocus = {
                ok: false,
                reason: 'target_not_found',
                taskId: notice.taskId,
                laneId: notice.laneId,
                retryAttempt,
                focusedAt: Date.now()
            };
            return false;
        }
        target.element.classList.add('season-board-handoff-focus');
        target.element.dataset.seasonBoardTaskArrivalFocused = 'true';
        target.element.dataset.seasonBoardTaskArrivalFocusKind = target.kind;
        target.element.dataset.seasonBoardTaskArrivalFocusSourceKey = notice.sourceKey;
        if (target.action) {
            target.action.classList.add('season-board-handoff-action-target');
            target.action.dataset.seasonBoardTaskArrivalActionTarget = 'true';
        }
        if (typeof target.element.scrollIntoView === 'function') {
            target.element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
        const focusTarget = target.action || target.element;
        if (typeof focusTarget.focus === 'function') {
            try {
                focusTarget.focus({ preventScroll: true });
            } catch (_error) {
                focusTarget.focus();
            }
        }
        this.lastSeasonBoardTaskFollowArrivalFocus = {
            ok: true,
            kind: target.kind,
            id: target.id,
            sourceKey: notice.sourceKey,
            taskId: notice.taskId,
            laneId: notice.laneId,
            hasAction: !!target.action,
            focusedAt: Date.now()
        };
        return true;
    };

    Game.prototype.loadCollectionUnlockHistory = function () {
        try {
            const raw = typeof localStorage !== 'undefined'
                ? localStorage.getItem(COLLECTION_HISTORY_KEY)
                : null;
            const parsed = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter((entry) => entry && typeof entry === 'object' && entry.type && entry.itemId)
                .map((entry) => ({
                    type: String(entry.type || ''),
                    itemId: String(entry.itemId || ''),
                    name: String(entry.name || ''),
                    icon: String(entry.icon || '✦'),
                    note: String(entry.note || ''),
                    timestamp: clampInt(entry.timestamp || Date.now(), 0)
                }))
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 24);
        } catch (error) {
            return [];
        }
    };

    Game.prototype.persistCollectionUnlockHistory = function () {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(COLLECTION_HISTORY_KEY, JSON.stringify(this.collectionUnlockHistory || []));
        } catch (error) {
            console.warn('Persist collection unlock history failed:', error);
        }
    };

    Game.prototype.loadBossMemoryRecords = function () {
        try {
            const raw = typeof localStorage !== 'undefined'
                ? localStorage.getItem(BOSS_MEMORY_RECORDS_KEY)
                : null;
            const parsed = raw ? JSON.parse(raw) : {};
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
            return Object.keys(parsed).reduce((records, bossId) => {
                const record = parsed[bossId];
                if (!record || typeof record !== 'object') return records;
                records[bossId] = {
                    bossId,
                    attempts: clampInt(record.attempts || 0, 0, 9999),
                    clears: clampInt(record.clears || 0, 0, 9999),
                    bestTurn: clampInt(record.bestTurn || 0, 0, 9999),
                    lastResult: ['victory', 'defeat'].includes(record.lastResult) ? record.lastResult : '',
                    lastPlayedAt: clampInt(record.lastPlayedAt || 0, 0),
                    firstClearAt: clampInt(record.firstClearAt || 0, 0)
                };
                return records;
            }, {});
        } catch (error) {
            return {};
        }
    };

    Game.prototype.persistBossMemoryRecords = function () {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(BOSS_MEMORY_RECORDS_KEY, JSON.stringify(this.bossMemoryRecords || {}));
        } catch (error) {
            console.warn('Persist boss memory records failed:', error);
        }
    };

    Game.prototype.loadRunPathRecords = function () {
        try {
            const raw = typeof localStorage !== 'undefined'
                ? localStorage.getItem(RUN_PATH_RECORDS_KEY)
                : null;
            const parsed = raw ? JSON.parse(raw) : {};
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
            return Object.keys(parsed).reduce((records, pathId) => {
                const record = parsed[pathId];
                if (!record || typeof record !== 'object') return records;
                const favoredSets = Array.isArray(record.favoredSets)
                    ? record.favoredSets.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 4)
                    : [];
                records[pathId] = {
                    pathId: String(record.pathId || pathId),
                    recordId: String(record.recordId || ''),
                    recordName: String(record.recordName || ''),
                    name: String(record.name || pathId),
                    icon: String(record.icon || '✦'),
                    category: String(record.category || '命途'),
                    routeHint: String(record.routeHint || ''),
                    favoredSets,
                    bossFocus: String(record.bossFocus || ''),
                    note: String(record.note || ''),
                    clears: clampInt(record.clears || 0, 0, 9999),
                    firstClearAt: clampInt(record.firstClearAt || 0, 0),
                    lastCompletedAt: clampInt(record.lastCompletedAt || 0, 0),
                    bestRealm: clampInt(record.bestRealm || 0, 0, 9999),
                    lastRealm: clampInt(record.lastRealm || 0, 0, 9999),
                    lastCharacterId: String(record.lastCharacterId || ''),
                    lastCharacterName: String(record.lastCharacterName || ''),
                    lastMutationId: String(record.lastMutationId || ''),
                    lastMutationName: String(record.lastMutationName || ''),
                    lastMutationBranch: String(record.lastMutationBranch || ''),
                    lastRewardText: String(record.lastRewardText || ''),
                    lastPhaseId: String(record.lastPhaseId || ''),
                    lastPhaseTitle: String(record.lastPhaseTitle || '')
                };
                return records;
            }, {});
        } catch (error) {
            return {};
        }
    };

    Game.prototype.persistRunPathRecords = function () {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(RUN_PATH_RECORDS_KEY, JSON.stringify(this.runPathRecords || {}));
        } catch (error) {
            console.warn('Persist run path records failed:', error);
        }
    };

    Game.prototype.getRunPathRecord = function (pathId = '') {
        this.ensureCollectionHubBootState();
        const safePathId = String(pathId || '').trim();
        const source = safePathId && this.runPathRecords && this.runPathRecords[safePathId]
            ? this.runPathRecords[safePathId]
            : null;
        return {
            pathId: safePathId,
            recordId: String(source?.recordId || ''),
            recordName: String(source?.recordName || ''),
            name: String(source?.name || safePathId),
            icon: String(source?.icon || '✦'),
            category: String(source?.category || '命途'),
            routeHint: String(source?.routeHint || ''),
            favoredSets: Array.isArray(source?.favoredSets) ? source.favoredSets.slice(0, 4) : [],
            bossFocus: String(source?.bossFocus || ''),
            note: String(source?.note || ''),
            clears: clampInt(source?.clears || 0, 0, 9999),
            firstClearAt: clampInt(source?.firstClearAt || 0, 0),
            lastCompletedAt: clampInt(source?.lastCompletedAt || 0, 0),
            bestRealm: clampInt(source?.bestRealm || 0, 0, 9999),
            lastRealm: clampInt(source?.lastRealm || 0, 0, 9999),
            lastCharacterId: String(source?.lastCharacterId || ''),
            lastCharacterName: String(source?.lastCharacterName || ''),
            lastMutationId: String(source?.lastMutationId || ''),
            lastMutationName: String(source?.lastMutationName || ''),
            lastMutationBranch: String(source?.lastMutationBranch || ''),
            lastRewardText: String(source?.lastRewardText || ''),
            lastPhaseId: String(source?.lastPhaseId || ''),
            lastPhaseTitle: String(source?.lastPhaseTitle || '')
        };
    };

    Game.prototype.recordRunPathCompletion = function (pathMeta = null, options = {}) {
        const safePathId = String(pathMeta?.id || '').trim();
        if (!safePathId) return this.getRunPathRecord('');
        const previous = this.getRunPathRecord(safePathId);
        const completionRecord = pathMeta?.completionRecord && typeof pathMeta.completionRecord === 'object'
            ? pathMeta.completionRecord
            : {};
        const completedAt = clampInt(options.completedAt || Date.now(), 0);
        const realm = clampInt(options.realm || 0, 0, 9999);
        const characterId = String(options.characterId || '').trim();
        const characterMeta = characterId ? getCharacterMeta(characterId) : null;
        const mutationMeta = pathMeta?.mutation && typeof pathMeta.mutation === 'object'
            ? pathMeta.mutation
            : null;
        const favoredSets = Array.isArray(pathMeta?.treasureSynergy?.favoredSets)
            ? pathMeta.treasureSynergy.favoredSets.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 4)
            : previous.favoredSets;
        const next = {
            pathId: safePathId,
            recordId: String(completionRecord.id || previous.recordId || `runPath_${safePathId}`),
            recordName: String(completionRecord.name || previous.recordName || `${pathMeta?.name || safePathId}战录`),
            name: String(pathMeta?.name || previous.name || safePathId),
            icon: String(completionRecord.icon || pathMeta?.icon || previous.icon || '✦'),
            category: String(pathMeta?.category || previous.category || '命途'),
            routeHint: String(pathMeta?.routeHint || previous.routeHint || ''),
            favoredSets,
            bossFocus: String(pathMeta?.bossCounterplay?.focus || previous.bossFocus || ''),
            note: String(completionRecord.note || previous.note || ''),
            clears: previous.clears + 1,
            firstClearAt: previous.firstClearAt || completedAt,
            lastCompletedAt: completedAt || Date.now(),
            bestRealm: Math.max(previous.bestRealm, realm),
            lastRealm: realm || previous.lastRealm,
            lastCharacterId: characterId || previous.lastCharacterId,
            lastCharacterName: characterMeta?.name || String(options.characterName || previous.lastCharacterName || ''),
            lastMutationId: String(mutationMeta?.mutationId || mutationMeta?.id || previous.lastMutationId || ''),
            lastMutationName: String(mutationMeta?.name || previous.lastMutationName || ''),
            lastMutationBranch: String(mutationMeta?.branchLabel || previous.lastMutationBranch || ''),
            lastRewardText: String(options.rewardText || previous.lastRewardText || ''),
            lastPhaseId: String(options.phaseMeta?.id || previous.lastPhaseId || ''),
            lastPhaseTitle: String(options.phaseMeta?.title || previous.lastPhaseTitle || '')
        };
        this.runPathRecords = {
            ...(this.runPathRecords || {}),
            [safePathId]: next
        };
        this.persistRunPathRecords();
        return next;
    };

    Game.prototype.getCompletedRunPathCount = function () {
        this.ensureCollectionHubBootState();
        return Object.values(this.runPathRecords || {}).filter((record) => clampInt(record?.clears || 0, 0) > 0).length;
    };

    Game.prototype.getTotalRunPathClearCount = function () {
        this.ensureCollectionHubBootState();
        return Object.values(this.runPathRecords || {}).reduce((sum, record) => sum + clampInt(record?.clears || 0, 0), 0);
    };

    Game.prototype.getLatestRunPathRecord = function () {
        this.ensureCollectionHubBootState();
        const records = Object.values(this.runPathRecords || {})
            .filter((record) => record && clampInt(record.lastCompletedAt || 0, 0) > 0)
            .sort((a, b) => clampInt(b.lastCompletedAt || 0, 0) - clampInt(a.lastCompletedAt || 0, 0));
        return records[0] || null;
    };

    Game.prototype.loadRunPathBossSamples = function () {
        try {
            const raw = typeof localStorage !== 'undefined'
                ? localStorage.getItem(RUN_PATH_BOSS_SAMPLES_KEY)
                : null;
            const parsed = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter((sample) => sample && typeof sample === 'object' && sample.pathId && sample.bossId)
                .map((sample) => {
                    const realm = clampInt(sample.realm || 0, 0, 9999);
                    const chapter = realm > 0 && typeof this.getChapterProfileForRealm === 'function'
                        ? this.getChapterProfileForRealm(realm)
                        : null;
                    const favoredSets = Array.isArray(sample.favoredSets)
                        ? sample.favoredSets.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 4)
                        : [];
                    return {
                        sampleId: String(sample.sampleId || `${sample.pathId}_${sample.bossId}_${sample.completedAt || 0}`),
                        pathId: String(sample.pathId || ''),
                        pathName: String(sample.pathName || sample.pathId || ''),
                        pathIcon: String(sample.pathIcon || '✦'),
                        mutationId: String(sample.mutationId || ''),
                        mutationName: String(sample.mutationName || ''),
                        mutationBranch: String(sample.mutationBranch || ''),
                        bossId: String(sample.bossId || ''),
                        bossName: String(sample.bossName || sample.bossId || ''),
                        bossIcon: String(sample.bossIcon || '🗿'),
                        characterId: String(sample.characterId || ''),
                        characterName: String(sample.characterName || sample.characterId || ''),
                        realm,
                        chapterName: String(sample.chapterName || chapter?.name || (realm > 0 ? `第${getChapterIndexForRealm(realm)}章` : '未定章节')),
                        completedAt: clampInt(sample.completedAt || 0, 0),
                        turns: clampInt(sample.turns || 0, 0, 9999),
                        favoredSets,
                        routeHint: String(sample.routeHint || ''),
                        source: String(sample.source || 'boss_clear')
                    };
                })
                .sort((a, b) => clampInt(b.completedAt || 0, 0) - clampInt(a.completedAt || 0, 0))
                .slice(0, 60);
        } catch (error) {
            return [];
        }
    };

    Game.prototype.persistRunPathBossSamples = function () {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(RUN_PATH_BOSS_SAMPLES_KEY, JSON.stringify(this.runPathBossSamples || []));
        } catch (error) {
            console.warn('Persist run path boss samples failed:', error);
        }
    };

    Game.prototype.recordRunPathBossSample = function (pathMeta = null, bossMeta = null, options = {}) {
        this.ensureCollectionHubBootState();
        const safePathId = String(pathMeta?.id || '').trim();
        const safeBossId = String(bossMeta?.id || options.bossId || '').trim();
        if (!safePathId || !safeBossId) return null;
        const completedAt = clampInt(options.completedAt || Date.now(), 0);
        const realm = clampInt(options.realm || bossMeta?.realm || this.player?.realm || 0, 0, 9999);
        const chapter = realm > 0 && typeof this.getChapterProfileForRealm === 'function'
            ? this.getChapterProfileForRealm(realm)
            : null;
        const mutationMeta = pathMeta?.mutation && typeof pathMeta.mutation === 'object'
            ? pathMeta.mutation
            : null;
        const characterId = String(options.characterId || this.player?.characterId || '').trim();
        const characterMeta = characterId ? getCharacterMeta(characterId) : null;
        const favoredSets = Array.isArray(pathMeta?.treasureSynergy?.favoredSets)
            ? pathMeta.treasureSynergy.favoredSets.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 4)
            : [];
        const sampleId = `sample_${safeBossId}_${safePathId}_${completedAt}_${Math.max(0, (this.runPathBossSamples || []).length % 997)}`;
        const sample = {
            sampleId,
            pathId: safePathId,
            pathName: String(pathMeta?.name || safePathId),
            pathIcon: String(pathMeta?.icon || '✦'),
            mutationId: String(mutationMeta?.mutationId || mutationMeta?.id || ''),
            mutationName: String(mutationMeta?.name || ''),
            mutationBranch: String(mutationMeta?.branchLabel || ''),
            bossId: safeBossId,
            bossName: String(bossMeta?.name || safeBossId),
            bossIcon: String(bossMeta?.icon || '🗿'),
            characterId,
            characterName: String(characterMeta?.name || options.characterName || characterId || '未定角色'),
            realm,
            chapterName: String(options.chapterName || chapter?.name || (realm > 0 ? `第${getChapterIndexForRealm(realm)}章` : '未定章节')),
            completedAt,
            turns: clampInt(options.turns || 0, 0, 9999),
            favoredSets,
            routeHint: String(pathMeta?.routeHint || ''),
            source: String(options.source || 'boss_clear')
        };
        const previous = Array.isArray(this.runPathBossSamples) ? this.runPathBossSamples : [];
        this.runPathBossSamples = [sample, ...previous.filter((entry) => entry?.sampleId !== sampleId)].slice(0, 60);
        this.persistRunPathBossSamples();
        return sample;
    };

    Game.prototype.getRunPathBossSamples = function (options = {}) {
        this.ensureCollectionHubBootState();
        const source = Array.isArray(this.runPathBossSamples) ? this.runPathBossSamples.slice() : [];
        const pathId = String(options.pathId || '').trim();
        const bossId = String(options.bossId || '').trim();
        const characterId = String(options.characterId || '').trim();
        const mutationId = String(options.mutationId || '').trim();
        const sourceType = String(options.source || '').trim();
        const sortBy = ['bestTurn', 'recent'].includes(options.sortBy) ? options.sortBy : 'recent';
        const filtered = source.filter((sample) => {
            if (!sample) return false;
            if (pathId && sample.pathId !== pathId) return false;
            if (bossId && sample.bossId !== bossId) return false;
            if (characterId && sample.characterId !== characterId) return false;
            if (mutationId && sample.mutationId !== mutationId) return false;
            if (sourceType && sample.source !== sourceType) return false;
            return true;
        });
        filtered.sort((a, b) => {
            if (sortBy === 'bestTurn') {
                const aTurns = clampInt(a?.turns || 0, 0, 9999) || 9999;
                const bTurns = clampInt(b?.turns || 0, 0, 9999) || 9999;
                if (aTurns !== bTurns) return aTurns - bTurns;
            }
            return clampInt(b?.completedAt || 0, 0) - clampInt(a?.completedAt || 0, 0);
        });
        const limit = clampInt(options.limit || filtered.length, 0, 60);
        return filtered.slice(0, limit || filtered.length);
    };

    Game.prototype.getRunPathSampleSetLabel = function (setId = '') {
        const safeSetId = String(setId || '').trim();
        if (!safeSetId) return '';
        if (this.player && typeof this.player.getTreasureSetLabel === 'function') {
            const label = String(this.player.getTreasureSetLabel(safeSetId) || '').trim();
            if (label) return label;
        }
        return safeSetId;
    };

    Game.prototype.buildRunPathSampleRecommendation = function (samples = [], options = {}) {
        if (!Array.isArray(samples) || samples.length <= 0) {
            return {
                character: null,
                mutation: null,
                chapter: null,
                sets: [],
                boss: null,
                lines: []
            };
        }

        const resolveTurnRank = (value) => {
            const turns = clampInt(value || 0, 0, 9999);
            return turns > 0 ? turns : 9999;
        };

        const rankByCountAndTurn = (source = []) => source
            .slice()
            .sort((a, b) => {
                if ((b.count || 0) !== (a.count || 0)) return (b.count || 0) - (a.count || 0);
                if ((a.bestTurn || 9999) !== (b.bestTurn || 9999)) return (a.bestTurn || 9999) - (b.bestTurn || 9999);
                return (b.latestAt || 0) - (a.latestAt || 0);
            });
        const parseChapterIndexFromText = (value = '') => {
            const matched = String(value || '').match(/第\s*(\d+)\s*章/);
            return matched ? clampInt(matched[1] || 0, 1, 6) : 0;
        };
        const resolveChapterMeta = (sample = null) => {
            if (!sample || typeof sample !== 'object') {
                return { index: 0, id: '', name: '未定章节' };
            }
            const realm = clampInt(sample.realm || 0, 0, 9999);
            const chapterIndex = realm > 0
                ? getChapterIndexForRealm(realm)
                : parseChapterIndexFromText(sample.chapterName || sample.chapterLabel || '');
            const chapterProfile = chapterIndex > 0 && typeof this.getChapterProfileForRealm === 'function'
                ? this.getChapterProfileForRealm((chapterIndex - 1) * 3 + 1)
                : null;
            return {
                index: chapterIndex,
                id: String(chapterProfile?.id || (chapterIndex > 0 ? `chapter_${chapterIndex}` : sample.chapterName || '')),
                name: String(sample.chapterName || chapterProfile?.name || (chapterIndex > 0 ? `第${chapterIndex}章` : '未定章节'))
            };
        };
        const resolveTargetChapterMeta = () => {
            const targetRealm = clampInt(options.realm || this.player?.realm || 0, 0, 9999);
            let chapterIndex = targetRealm > 0 ? getChapterIndexForRealm(targetRealm) : 0;
            if (chapterIndex <= 0) {
                chapterIndex = clampInt(options.chapterIndex || 0, 0, 6);
            }
            if (chapterIndex <= 0) {
                chapterIndex = parseChapterIndexFromText(options.chapterName || options.chapterLabel || '');
            }
            const chapterProfile = chapterIndex > 0 && typeof this.getChapterProfileForRealm === 'function'
                ? this.getChapterProfileForRealm((chapterIndex - 1) * 3 + 1)
                : null;
            return {
                index: chapterIndex,
                id: String(chapterProfile?.id || (chapterIndex > 0 ? `chapter_${chapterIndex}` : '')),
                name: String(chapterProfile?.name || (chapterIndex > 0 ? `第${chapterIndex}章` : ''))
            };
        };

        const characterMap = new Map();
        const mutationMap = new Map();
        const chapterMap = new Map();
        const setMap = new Map();
        const bossMap = new Map();

        samples.forEach((sample) => {
            if (!sample || typeof sample !== 'object') return;
            const completedAt = clampInt(sample.completedAt || 0, 0);
            const turnRank = resolveTurnRank(sample.turns || 0);

            const characterKey = String(sample.characterId || sample.characterName || '').trim();
            if (characterKey) {
                const previous = characterMap.get(characterKey) || {
                    id: String(sample.characterId || ''),
                    name: String(sample.characterName || sample.characterId || '未定角色'),
                    count: 0,
                    bestTurn: 9999,
                    latestAt: 0
                };
                previous.count += 1;
                previous.bestTurn = Math.min(previous.bestTurn, turnRank);
                previous.latestAt = Math.max(previous.latestAt, completedAt);
                characterMap.set(characterKey, previous);
            }

            const mutationKey = String(sample.mutationId || sample.mutationName || '').trim();
            if (mutationKey) {
                const previous = mutationMap.get(mutationKey) || {
                    id: String(sample.mutationId || mutationKey),
                    name: String(sample.mutationName || sample.mutationId || mutationKey),
                    branch: String(sample.mutationBranch || ''),
                    count: 0,
                    bestTurn: 9999,
                    latestAt: 0
                };
                previous.count += 1;
                previous.bestTurn = Math.min(previous.bestTurn, turnRank);
                previous.latestAt = Math.max(previous.latestAt, completedAt);
                mutationMap.set(mutationKey, previous);
            }

            (Array.isArray(sample.favoredSets) ? sample.favoredSets : [])
                .map((setId) => String(setId || '').trim())
                .filter(Boolean)
                .forEach((setId) => {
                    const previous = setMap.get(setId) || {
                        id: setId,
                        label: this.getRunPathSampleSetLabel(setId),
                        count: 0,
                        bestTurn: 9999,
                        latestAt: 0
                    };
                    previous.count += 1;
                    previous.bestTurn = Math.min(previous.bestTurn, turnRank);
                    previous.latestAt = Math.max(previous.latestAt, completedAt);
                    setMap.set(setId, previous);
                });

            const bossKey = String(sample.bossId || sample.bossName || '').trim();
            if (bossKey) {
                const previous = bossMap.get(bossKey) || {
                    id: String(sample.bossId || bossKey),
                    name: String(sample.bossName || sample.bossId || bossKey),
                    count: 0,
                    bestTurn: 9999,
                    latestAt: 0
                };
                previous.count += 1;
                previous.bestTurn = Math.min(previous.bestTurn, turnRank);
                previous.latestAt = Math.max(previous.latestAt, completedAt);
                bossMap.set(bossKey, previous);
            }

            const chapterMeta = resolveChapterMeta(sample);
            const chapterKey = chapterMeta.index > 0
                ? `chapter_${chapterMeta.index}`
                : String(chapterMeta.name || '').trim();
            if (chapterKey) {
                const previous = chapterMap.get(chapterKey) || {
                    id: chapterMeta.id || chapterKey,
                    index: chapterMeta.index || 0,
                    name: chapterMeta.name || '未定章节',
                    count: 0,
                    bestTurn: 9999,
                    latestAt: 0
                };
                previous.count += 1;
                previous.bestTurn = Math.min(previous.bestTurn, turnRank);
                previous.latestAt = Math.max(previous.latestAt, completedAt);
                chapterMap.set(chapterKey, previous);
            }
        });

        const topCharacter = rankByCountAndTurn(Array.from(characterMap.values()))[0] || null;
        const topMutationRaw = rankByCountAndTurn(Array.from(mutationMap.values()))[0] || null;
        const topChapterRaw = rankByCountAndTurn(Array.from(chapterMap.values()))[0] || null;
        const topSets = rankByCountAndTurn(Array.from(setMap.values())).slice(0, 2);
        const topBoss = rankByCountAndTurn(Array.from(bossMap.values()))[0] || null;
        const targetChapter = resolveTargetChapterMeta();

        const topMutation = topMutationRaw
            ? {
                ...topMutationRaw,
                label: [topMutationRaw.branch, topMutationRaw.name].filter(Boolean).join('·') || topMutationRaw.name
            }
            : null;
        const topChapter = topChapterRaw
            ? (() => {
                const targetChapterIndex = targetChapter.index > 0
                    ? targetChapter.index
                    : (topChapterRaw.index > 0 ? topChapterRaw.index : 0);
                const targetChapterName = targetChapter.name
                    || (targetChapterIndex > 0 ? `第${targetChapterIndex}章` : '');
                const chapterDistance = (targetChapterIndex > 0 && topChapterRaw.index > 0)
                    ? Math.abs(topChapterRaw.index - targetChapterIndex)
                    : 0;
                const coverageScore = Math.round(((topChapterRaw.count || 0) / Math.max(1, samples.length)) * 65);
                const speedScore = topChapterRaw.bestTurn < 9999
                    ? Math.max(0, 18 - topChapterRaw.bestTurn)
                    : 0;
                const chapterAlignScore = (targetChapterIndex > 0 && topChapterRaw.index > 0)
                    ? Math.max(0, 25 - chapterDistance * 10)
                    : 12;
                const fitScore = clampInt(Math.round(coverageScore + speedScore + chapterAlignScore), 0, 100);
                return {
                    ...topChapterRaw,
                    bestTurn: topChapterRaw.bestTurn < 9999 ? topChapterRaw.bestTurn : 0,
                    fitScore,
                    targetIndex: targetChapterIndex,
                    targetName: targetChapterName,
                    distance: chapterDistance,
                    matched: chapterDistance <= 0
                };
            })()
            : null;
        const isBossFocused = !!String(options.bossId || '').trim();
        const lines = [];

        if (topCharacter) {
            lines.push(`推荐角色：${topCharacter.name}（样本 ${topCharacter.count} 份${topCharacter.bestTurn < 9999 ? `，最快 ${topCharacter.bestTurn} 回合` : ''}）。`);
        }
        if (topMutation) {
            lines.push(`推荐裂变：${topMutation.label}（命中 ${topMutation.count} 份样本${topMutation.bestTurn < 9999 ? `，最快 ${topMutation.bestTurn} 回合` : ''}）。`);
        } else if (String(options.pathId || options.pathName || '').trim()) {
            lines.push('推荐裂变：当前样本仍不足，建议在中盘完成一次命途裂变并留下一份收官记录。');
        }
        if (topSets.length > 0) {
            lines.push(`推荐套装：${topSets.map((setStat) => setStat.label || setStat.id).join(' / ')}。`);
        }
        if (topChapter) {
            const chapterTargetHint = topChapter.targetName && topChapter.targetName !== topChapter.name
                ? `，当前章节 ${topChapter.targetName}`
                : '';
            lines.push(`章节适配：${topChapter.name}（命中 ${topChapter.count} 份样本${topChapter.bestTurn > 0 ? `，最快 ${topChapter.bestTurn} 回合` : ''}，场域拟合分 ${topChapter.fitScore}${chapterTargetHint}）。`);
        }
        if (topBoss && !isBossFocused) {
            lines.push(topBoss.bestTurn < 9999
                ? `推荐目标：优先复刻 ${topBoss.name}（最快 ${topBoss.bestTurn} 回合）的收官模板。`
                : `推荐目标：优先补 ${topBoss.name} 的限时回合样本，后续更容易校准收官节奏。`);
        }

        return {
            character: topCharacter
                ? {
                    ...topCharacter,
                    bestTurn: topCharacter.bestTurn < 9999 ? topCharacter.bestTurn : 0
                }
                : null,
            mutation: topMutation
                ? {
                    ...topMutation,
                    bestTurn: topMutation.bestTurn < 9999 ? topMutation.bestTurn : 0
                }
                : null,
            chapter: topChapter || null,
            sets: topSets.map((setStat) => ({
                ...setStat,
                bestTurn: setStat.bestTurn < 9999 ? setStat.bestTurn : 0
            })),
            boss: topBoss
                ? {
                    ...topBoss,
                    bestTurn: topBoss.bestTurn < 9999 ? topBoss.bestTurn : 0
                }
                : null,
            lines
        };
    };

    Game.prototype.buildRunPathBossSampleBoard = function (options = {}) {
        const displayLimit = Math.max(1, clampInt(options.limit || 3, 1, 6));
        const samples = typeof this.getRunPathBossSamples === 'function'
            ? this.getRunPathBossSamples({
                ...options,
                limit: 60
            })
            : [];
        const focusPathName = samples[0]?.pathName || String(options.pathName || '');
        const focusBossName = samples[0]?.bossName || String(options.bossName || '');
        const uniqueCharacters = new Set(samples.map((sample) => sample.characterId || sample.characterName).filter(Boolean)).size;
        const uniqueBosses = new Set(samples.map((sample) => sample.bossId).filter(Boolean)).size;
        const uniqueMutations = new Set(samples.map((sample) => sample.mutationId || sample.mutationName).filter(Boolean)).size;
        const timedSamples = samples.filter((sample) => clampInt(sample.turns || 0, 0, 9999) > 0);
        const bestTurn = timedSamples.length > 0
            ? timedSamples.reduce((best, sample) => Math.min(best, clampInt(sample.turns || 0, 0, 9999)), 9999)
            : 0;
        const entries = samples.slice(0, displayLimit).map((sample) => ({
            ...sample,
            headline: [
                sample.characterName || '未定角色',
                sample.pathName || '未定命途',
                sample.mutationName || ''
            ].filter(Boolean).join(' · '),
            subtitle: `${sample.bossName || sample.bossId} · 第 ${Math.max(1, clampInt(sample.realm || 1, 1, 9999))} 重${sample.turns > 0 ? ` · ${sample.turns} 回合` : ''}`,
            tagLine: [
                sample.mutationBranch && sample.mutationName ? `${sample.mutationBranch}·${sample.mutationName}` : '',
                ...(sample.favoredSets || [])
                    .slice(0, 2)
                    .map((setId) => this.getRunPathSampleSetLabel(setId))
                    .filter(Boolean)
            ].filter(Boolean)
        }));
        const recommendation = typeof this.buildRunPathSampleRecommendation === 'function'
            ? this.buildRunPathSampleRecommendation(samples, options)
            : { character: null, mutation: null, chapter: null, sets: [], boss: null, lines: [] };
        return {
            title: focusPathName && focusBossName
                ? `${focusPathName} × ${focusBossName}`
                : focusBossName
                    ? `${focusBossName} 样本对照`
                    : focusPathName
                        ? `${focusPathName} 样本对照`
                        : '近期通关样本',
            count: samples.length,
            uniqueCharacters,
            uniqueBosses,
            uniqueMutations,
            bestTurn,
            latestSample: samples[0] || null,
            emptyText: focusBossName
                ? '当前还没有这位主宰的通关样本，先去打一场主线 Boss 再回来对照。'
                : focusPathName
                    ? '当前命途还没有沉淀出 Boss 通关样本，先用它完成一场章节 Boss。'
                    : '当前还没有可用于对照的通关样本。',
            entries,
            recommendation
        };
    };

    Game.prototype.getBossMemoryRecord = function (bossId = '') {
        this.ensureCollectionHubBootState();
        const safeBossId = String(bossId || '').trim();
        const source = safeBossId && this.bossMemoryRecords && this.bossMemoryRecords[safeBossId]
            ? this.bossMemoryRecords[safeBossId]
            : null;
        return {
            bossId: safeBossId,
            attempts: clampInt(source?.attempts || 0, 0, 9999),
            clears: clampInt(source?.clears || 0, 0, 9999),
            bestTurn: clampInt(source?.bestTurn || 0, 0, 9999),
            lastResult: ['victory', 'defeat'].includes(source?.lastResult) ? source.lastResult : '',
            lastPlayedAt: clampInt(source?.lastPlayedAt || 0, 0),
            firstClearAt: clampInt(source?.firstClearAt || 0, 0)
        };
    };

    Game.prototype.recordBossMemoryResult = function (bossId = '', result = 'defeat', turns = 0) {
        const safeBossId = String(bossId || '').trim();
        if (!safeBossId) return this.getBossMemoryRecord('');
        const previous = this.getBossMemoryRecord(safeBossId);
        const isVictory = result === 'victory';
        const next = {
            bossId: safeBossId,
            attempts: previous.attempts + 1,
            clears: previous.clears + (isVictory ? 1 : 0),
            bestTurn: isVictory
                ? (previous.bestTurn > 0 ? Math.min(previous.bestTurn, Math.max(1, clampInt(turns || 0, 1, 9999))) : Math.max(1, clampInt(turns || 0, 1, 9999)))
                : previous.bestTurn,
            lastResult: isVictory ? 'victory' : 'defeat',
            lastPlayedAt: Date.now(),
            firstClearAt: previous.firstClearAt || (isVictory ? Date.now() : 0)
        };
        this.bossMemoryRecords = {
            ...(this.bossMemoryRecords || {}),
            [safeBossId]: next
        };
        this.persistBossMemoryRecords();
        return next;
    };

    Game.prototype.getBossMemoryClearCount = function () {
        this.ensureCollectionHubBootState();
        return Object.values(this.bossMemoryRecords || {}).filter((record) => clampInt(record?.clears || 0, 0) > 0).length;
    };

    Game.prototype.getBossMemoryAttemptCount = function () {
        this.ensureCollectionHubBootState();
        return Object.values(this.bossMemoryRecords || {}).reduce((sum, record) => sum + clampInt(record?.attempts || 0, 0), 0);
    };

    Game.prototype.recordCollectionUnlock = function (type = '', payload = {}) {
        this.ensureCollectionHubBootState();
        const itemId = String(payload.id || payload.itemId || '').trim();
        if (!type || !itemId) return false;
        const entry = {
            type: String(type),
            itemId,
            name: String(payload.name || itemId),
            icon: String(payload.icon || '✦'),
            note: String(payload.note || ''),
            timestamp: Date.now()
        };
        const next = Array.isArray(this.collectionUnlockHistory) ? [...this.collectionUnlockHistory] : [];
        const existingIndex = next.findIndex((item) => item.type === entry.type && item.itemId === entry.itemId);
        if (existingIndex >= 0) next.splice(existingIndex, 1);
        next.unshift(entry);
        this.collectionUnlockHistory = next.slice(0, 24);
        this.persistCollectionUnlockHistory();
        return true;
    };

    Game.prototype.getCollectionUnlockHistory = function (limit = 6) {
        this.ensureCollectionHubBootState();
        return (this.collectionUnlockHistory || []).slice(0, Math.max(0, clampInt(limit, 0, 24)));
    };

    Game.prototype.formatCollectionTimestamp = function (timestamp = 0) {
        const safeTs = clampInt(timestamp, 0);
        if (!safeTs) return '刚刚';
        try {
            return new Date(safeTs).toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return '最近';
        }
    };

    Game.prototype.getFateLineageSnapshot = function (options = {}) {
        this.ensureCollectionHubBootState();
        const latestSlate = options.latestSlate && typeof options.latestSlate === 'object'
            ? options.latestSlate
            : (typeof this.getLatestRunSlate === 'function' ? this.getLatestRunSlate() : null);
        const currentRunPath = this.player && typeof this.player.getRunPathMeta === 'function'
            ? this.player.getRunPathMeta()
            : (this.selectedRunPathId && typeof this.getRunPathMetaById === 'function'
                ? this.getRunPathMetaById(this.selectedRunPathId)
                : null);
        const currentDestiny = this.player && typeof this.player.getRunDestinyMeta === 'function'
            ? this.player.getRunDestinyMeta()
            : null;
        const currentCharacter = getCharacterMeta(this.player?.characterId || '');
        const samples = typeof this.getRunPathBossSamples === 'function'
            ? this.getRunPathBossSamples({ limit: 24, sortBy: 'recent' })
            : [];
        const selectedGuide = typeof this.getSelectedObservatoryExpeditionGuide === 'function'
            ? this.getSelectedObservatoryExpeditionGuide({ silentSync: true })
            : null;
        const trainingFocus = typeof this.getObservatoryTrainingFocus === 'function'
            ? this.getObservatoryTrainingFocus()
            : null;
        const seasonVerification = typeof this.getSeasonVerificationSnapshot === 'function'
            ? this.getSeasonVerificationSnapshot()
            : null;
        const primarySeasonVerification = seasonVerification?.primary && typeof seasonVerification.primary === 'object'
            ? seasonVerification.primary
            : null;
        const secondarySeasonVerification = seasonVerification?.side && typeof seasonVerification.side === 'object'
            ? seasonVerification.side
            : null;
        const seasonVerificationHistoryCount = Array.isArray(seasonVerification?.history)
            ? seasonVerification.history.length
            : 0;
        const slateFocus = latestSlate && typeof this.buildObservatoryTrainingFocusFromSlate === 'function'
            ? this.buildObservatoryTrainingFocusFromSlate(latestSlate)
            : null;
        const archiveEntries = typeof this.getObservatoryArchiveEntries === 'function'
            ? this.getObservatoryArchiveEntries({ limit: 12, types: ['challenge', 'replay'], sortBy: 'recent' })
            : [];
        const agendaDashboard = typeof this.getSanctumAgendaDashboard === 'function'
            ? this.getSanctumAgendaDashboard()
            : { active: null, lastResolved: null, history: [] };
        const activeAgenda = agendaDashboard?.active && typeof agendaDashboard.active === 'object'
            ? agendaDashboard.active
            : null;
        const lastResolved = agendaDashboard?.lastResolved && typeof agendaDashboard.lastResolved === 'object'
            ? agendaDashboard.lastResolved
            : null;
        const historyRecords = Array.isArray(agendaDashboard?.history)
            ? agendaDashboard.history
                .filter((entry) => entry && typeof entry === 'object' && entry.agendaId)
                .slice(-6)
            : [];
        const researchHistoryCount = Math.max(historyRecords.length, seasonVerificationHistoryCount);
        const runPathRecords = Object.keys(this.runPathRecords || {})
            .map((pathId) => (typeof this.getRunPathRecord === 'function'
                ? this.getRunPathRecord(pathId)
                : (this.runPathRecords?.[pathId] || null)))
            .filter((record) => record && clampInt(record.clears || 0, 0, 9999) > 0)
            .sort((a, b) => {
                if (clampInt(b.clears || 0, 0, 9999) !== clampInt(a.clears || 0, 0, 9999)) {
                    return clampInt(b.clears || 0, 0, 9999) - clampInt(a.clears || 0, 0, 9999);
                }
                return clampInt(b.lastCompletedAt || 0, 0) - clampInt(a.lastCompletedAt || 0, 0);
            });
        const makeSourceKey = (prefix = '', value = '') => `${String(prefix || '').trim()}:${String(value || '').trim()}`;
        const rankEntries = (source = [], limit = 4) => source
            .slice()
            .sort((a, b) => {
                if (clampInt(b.value || 0, 0, 9999) !== clampInt(a.value || 0, 0, 9999)) {
                    return clampInt(b.value || 0, 0, 9999) - clampInt(a.value || 0, 0, 9999);
                }
                if (clampInt(b.latestAt || 0, 0) !== clampInt(a.latestAt || 0, 0)) {
                    return clampInt(b.latestAt || 0, 0) - clampInt(a.latestAt || 0, 0);
                }
                return String(a.label || '').localeCompare(String(b.label || ''));
            })
            .slice(0, limit);
        const buildTrack = ({
            id = '',
            label = '',
            icon = '✦',
            summaryLine = '',
            progressText = '',
            entries = [],
            dominantId = '',
            dominantLabel = '',
            anchorSection = 'builds'
        } = {}) => ({
            id,
            label,
            icon,
            summaryLine: String(summaryLine || '').trim(),
            progressText: String(progressText || '').trim(),
            dominantId: String(dominantId || '').trim(),
            dominantLabel: String(dominantLabel || '').trim(),
            anchorSection,
            entries: Array.isArray(entries)
                ? entries.map((entry) => ({
                    id: String(entry.id || '').trim(),
                    label: String(entry.label || '').trim(),
                    icon: String(entry.icon || '✦').trim() || '✦',
                    value: clampInt(entry.value || 0, 0, 9999),
                    valueText: String(entry.valueText || '').trim(),
                    noteLine: String(entry.noteLine || '').trim(),
                    tags: toStringArray(entry.tags || [], 4),
                    anchorSection: String(entry.anchorSection || anchorSection).trim() || anchorSection,
                    latestAt: clampInt(entry.latestAt || 0, 0)
                }))
                : []
        });

        const verdictStyleMap = new Map();
        const classifySeasonVerdictStyle = (source = null) => {
            if (!source || typeof source !== 'object') return null;
            const role = String(source.role || '').trim();
            const resultStatus = String(
                source.resultStatus
                || source.primaryVerificationResultStatus
                || source.resolvedStatus
                || ''
            ).trim();
            const writebackMode = String(
                source.writebackMode
                || source.primaryWritebackMode
                || ''
            ).trim();
            if (!writebackMode && !resultStatus) return null;
            if (role === 'side' && writebackMode === 'boost_recommendation') return null;

            let id = '';
            let label = '';
            let icon = '';
            let fallbackNote = '';
            if (writebackMode === 'clear_debt') {
                id = 'debt_recovery';
                label = '清账追收';
                icon = '🧾';
                fallbackNote = '主验证清掉欠卷后，谱系会开始记录“先清账再扩线”的处理习惯。';
            } else if (
                writebackMode === 'carry_forward'
                || resultStatus === 'deferred'
                || writebackMode === 'pending'
            ) {
                id = 'deferred_cleanup';
                label = '延账收尾';
                icon = '⏳';
                fallbackNote = '这笔账被继续带入后续周转，谱系会把拖延与收尾节奏一起记下来。';
            } else if (
                ['upgrade_verdict', 'degrade'].includes(writebackMode)
                || ['verified', 'failed'].includes(resultStatus)
            ) {
                id = 'risky_push';
                label = '押榜抢线';
                icon = '⚔️';
                fallbackNote = '高压定榜与押卷推进会在这里沉淀成长期押榜风格。';
            } else {
                return null;
            }

            const sourceModeLabel = String(source.sourceModeLabel || source.sourceLabel || source.label || '').trim();
            const detailLine = String(source.writebackLine || source.summaryLine || source.detailLine || '').trim();
            const lineageStyle = String(source.lineageStyle || '').trim();
            const statusLabelMap = {
                verified: '通过',
                failed: '失利',
                deferred: '延期',
                pending: '待验证'
            };
            const noteLine = [
                [
                    sourceModeLabel,
                    statusLabelMap[resultStatus] || ''
                ].filter(Boolean).join(' · '),
                detailLine || fallbackNote
            ].filter(Boolean).slice(0, 2).join('｜') || fallbackNote;

            return {
                id,
                label,
                icon,
                noteLine,
                tags: [lineageStyle, sourceModeLabel].filter(Boolean).slice(0, 3),
                latestAt: clampInt(source.updatedAt || source.createdAt || Date.now(), 0),
                sourceKey: String(
                    source.recordId
                    || source.ledgerId
                    || `${source.weekTag || 'current'}:${role || 'primary'}:${writebackMode || resultStatus || 'verdict'}`
                ).trim()
            };
        };
        const addVerdictStyleSource = (source = null) => {
            const verdictStyle = classifySeasonVerdictStyle(source);
            if (!verdictStyle || !verdictStyle.id || !verdictStyle.sourceKey) return;
            const existing = verdictStyleMap.get(verdictStyle.id) || {
                id: verdictStyle.id,
                label: verdictStyle.label,
                icon: verdictStyle.icon,
                value: 0,
                valueText: '',
                noteLine: '',
                tags: [],
                anchorSection: 'sanctum',
                latestAt: 0,
                sourceKeys: new Set()
            };
            if (!existing.sourceKeys.has(verdictStyle.sourceKey)) {
                existing.value += 1;
                existing.sourceKeys.add(verdictStyle.sourceKey);
            }
            existing.latestAt = Math.max(existing.latestAt, verdictStyle.latestAt || 0);
            if (verdictStyle.noteLine) {
                existing.noteLine = verdictStyle.noteLine;
            }
            existing.tags = Array.from(new Set([...(existing.tags || []), ...(verdictStyle.tags || [])])).slice(0, 3);
            verdictStyleMap.set(verdictStyle.id, existing);
        };
        (Array.isArray(seasonVerification?.history) ? seasonVerification.history : []).forEach(addVerdictStyleSource);
        const verdictStyleFallbacks = [
            {
                id: 'debt_recovery',
                label: '清账风格',
                dominantLabel: '清账追收',
                icon: '🧾',
                noteLine: '把欠卷清成主验证通过后，谱系会开始记录“先清账再扩线”的处理习惯。'
            },
            {
                id: 'risky_push',
                label: '押榜风格',
                dominantLabel: '押榜抢线',
                icon: '⚔️',
                noteLine: '高压定榜、押卷升级与正险切换会在这里沉淀成长期押榜口味。'
            },
            {
                id: 'deferred_cleanup',
                label: '拖延风格',
                dominantLabel: '延账收尾',
                icon: '⏳',
                noteLine: '把账继续拖到后续周转时，谱系会记下你更常见的收尾节奏。'
            }
        ];
        const verdictStyleEntries = verdictStyleFallbacks.map((meta) => {
            const entry = verdictStyleMap.get(meta.id);
            return {
                id: `season_${meta.id}`,
                label: meta.label,
                dominantLabel: meta.dominantLabel,
                icon: meta.icon,
                value: clampInt(entry?.value || 0, 0, 9999),
                valueText: entry?.value > 0
                    ? `${meta.dominantLabel} · ${entry.value} 次`
                    : `等待${meta.label}`,
                noteLine: entry?.noteLine || meta.noteLine,
                tags: entry?.tags || [],
                anchorSection: 'sanctum',
                latestAt: clampInt(entry?.latestAt || 0, 0)
            };
        });
        const dominantVerdictStyle = rankEntries(
            verdictStyleEntries
                .filter((entry) => entry.value > 0)
                .map((entry) => ({
                    ...entry,
                    label: entry.dominantLabel
                })),
            1
        )[0] || null;
        const debtRecoveryStyle = verdictStyleEntries.find((entry) => entry.id === 'season_debt_recovery') || null;
        const riskyPushStyle = verdictStyleEntries.find((entry) => entry.id === 'season_risky_push') || null;
        const deferredCleanupStyle = verdictStyleEntries.find((entry) => entry.id === 'season_deferred_cleanup') || null;

        const characterMap = new Map();
        samples.forEach((sample) => {
            if (!sample || typeof sample !== 'object') return;
            const id = String(sample.characterId || sample.characterName || '').trim();
            if (!id) return;
            const meta = getCharacterMeta(sample.characterId || '') || {};
            const sourceKey = makeSourceKey('sample', sample.sampleId || `${sample.pathId || 'path'}_${sample.bossId || 'boss'}_${sample.completedAt || 0}`);
            const existing = characterMap.get(id) || {
                id,
                label: meta.name || sample.characterName || id,
                icon: '🧍',
                value: 0,
                valueText: '',
                noteLine: '',
                tags: [],
                latestAt: 0,
                pathNames: new Set(),
                bossNames: new Set(),
                sourceKeys: new Set(),
                bestTurn: 0
            };
            if (!existing.sourceKeys.has(sourceKey)) {
                existing.value += 1;
                existing.sourceKeys.add(sourceKey);
            }
            if (sample.pathName) existing.pathNames.add(String(sample.pathName).trim());
            if (sample.bossName) existing.bossNames.add(String(sample.bossName).trim());
            existing.latestAt = Math.max(existing.latestAt, clampInt(sample.completedAt || 0, 0));
            const turns = clampInt(sample.turns || 0, 0, 9999);
            if (turns > 0) {
                existing.bestTurn = existing.bestTurn > 0 ? Math.min(existing.bestTurn, turns) : turns;
            }
            existing.tags = [
                ...Array.from(existing.pathNames).slice(0, 2),
                ...Array.from(existing.bossNames).slice(0, 1)
            ].filter(Boolean).slice(0, 3);
            existing.noteLine = [
                sample.pathName ? `最近样本 · ${sample.pathName}` : '',
                sample.bossName ? `对 ${sample.bossName}` : '',
                turns > 0 ? `${turns} 回合` : ''
            ].filter(Boolean).join(' · ');
            characterMap.set(id, existing);
        });
        if (characterMap.size <= 0 && currentCharacter) {
            characterMap.set(currentCharacter.id, {
                id: currentCharacter.id,
                label: currentCharacter.name,
                icon: '🧍',
                value: 0,
                valueText: '当前主修',
                noteLine: currentRunPath?.name
                    ? `当前正沿【${currentRunPath.name}】推进样本。`
                    : '当前角色尚未留下稳定实战样本。',
                tags: toStringArray(currentCharacter.keywords || [], 3),
                latestAt: 0
            });
        }
        const characterEntries = rankEntries(Array.from(characterMap.values()), 3).map((entry) => ({
            id: entry.id,
            label: entry.label,
            icon: entry.icon,
            value: entry.value,
            valueText: entry.value > 0 ? `${entry.value} 份样本` : (entry.valueText || '当前主修'),
            noteLine: entry.noteLine || '等待更多实战样本沉淀角色谱系。',
            tags: entry.tags,
            anchorSection: 'builds',
            latestAt: entry.latestAt
        }));
        const dominantCharacter = characterEntries[0] || null;
        const characterTrack = buildTrack({
            id: 'character',
            label: '角色谱系',
            icon: '🧍',
            summaryLine: dominantCharacter
                ? (dominantCharacter.value > 0
                    ? `实战样本当前更常由【${dominantCharacter.label}】收官，${dominantCharacter.valueText}已经开始成形。`
                    : `当前主修角色暂定为【${dominantCharacter.label}】，后续样本会继续把角色画像压实。`)
                : '角色谱系仍待第一份实战样本落档。',
            progressText: dominantCharacter?.value > 0
                ? `已记录 ${characterEntries.filter((entry) => entry.value > 0).length} 名角色`
                : '等待角色样本',
            entries: characterEntries,
            dominantId: dominantCharacter?.id || '',
            dominantLabel: dominantCharacter?.label || '',
            anchorSection: 'builds'
        });

        const styleEntries = [];
        runPathRecords.slice(0, 3).forEach((record) => {
            const pathMeta = typeof this.getRunPathMetaById === 'function'
                ? this.getRunPathMetaById(record.pathId || '')
                : null;
            styleEntries.push({
                id: `path_${record.pathId || record.name || styleEntries.length + 1}`,
                label: pathMeta?.name || record.name || record.pathId || '未定流派',
                icon: pathMeta?.icon || record.icon || '🧭',
                value: clampInt(record.clears || 0, 0, 9999),
                valueText: `${clampInt(record.clears || 0, 0, 9999)} 份战录`,
                noteLine: [
                    record.lastCharacterName ? `最近由 ${record.lastCharacterName}` : '',
                    record.lastMutationName ? `裂变 ${record.lastMutationName}` : '',
                    record.lastRealm > 0 ? `第 ${record.lastRealm} 重` : ''
                ].filter(Boolean).join(' · ') || '当前流派正在等待新的圆满样本。',
                tags: [
                    record.lastMutationBranch && record.lastMutationName ? `${record.lastMutationBranch}·${record.lastMutationName}` : '',
                    ...(record.favoredSets || []).slice(0, 2).map((setId) => this.getRunPathSampleSetLabel(setId))
                ].filter(Boolean).slice(0, 3),
                anchorSection: 'builds',
                latestAt: clampInt(record.lastCompletedAt || 0, 0)
            });
        });
        if (currentRunPath && !styleEntries.some((entry) => entry.id === `path_${currentRunPath.id}`)) {
            styleEntries.unshift({
                id: `path_${currentRunPath.id}`,
                label: currentRunPath.name || currentRunPath.id,
                icon: currentRunPath.icon || '🧭',
                value: 0,
                valueText: '当前命途',
                noteLine: currentRunPath.playstyle || currentRunPath.routeHint || currentRunPath.description || '当前命途正在等待首份战录。',
                tags: toStringArray(currentRunPath.treasureSynergy?.favoredSets || [], 2).map((setId) => this.getRunPathSampleSetLabel(setId)),
                anchorSection: 'builds',
                latestAt: 0
            });
        }
        if (currentDestiny) {
            styleEntries.push({
                id: `destiny_${currentDestiny.id}`,
                label: currentDestiny.name || currentDestiny.id,
                icon: currentDestiny.icon || '✦',
                value: clampInt(currentDestiny.tier || 1, 1, 9),
                valueText: currentDestiny.tierLabel || `第 ${clampInt(currentDestiny.tier || 1, 1, 9)} 阶`,
                noteLine: currentDestiny.summary || currentDestiny.playstyle || currentDestiny.description || '当前命格会作为这一轮的流派签名。',
                tags: toStringArray(currentDestiny.affinities || [], 3),
                anchorSection: 'builds',
                latestAt: 0
            });
        }
        const dedupedStyleEntries = [];
        const styleIds = new Set();
        styleEntries.forEach((entry) => {
            if (!entry || !entry.id || styleIds.has(entry.id)) return;
            styleIds.add(entry.id);
            dedupedStyleEntries.push(entry);
        });
        const dominantStyle = dedupedStyleEntries.find((entry) => /^path_/.test(entry.id)) || dedupedStyleEntries[0] || null;
        const styleTrack = buildTrack({
            id: 'style',
            label: '流派谱系',
            icon: dominantStyle?.icon || currentRunPath?.icon || currentDestiny?.icon || '🧭',
            summaryLine: dominantStyle
                ? `长期流派当前收束到【${dominantStyle.label}】${currentDestiny ? `，命格签名是【${currentDestiny.name || currentDestiny.id}】。` : '。'}`
                : '流派谱系还没有稳定落在某条长期主线上。',
            progressText: dominantStyle?.value > 0
                ? `${dominantStyle.valueText}`
                : (currentRunPath?.name ? '当前命途已挂接' : '等待流派战录'),
            entries: dedupedStyleEntries.slice(0, 3),
            dominantId: dominantStyle?.id || '',
            dominantLabel: dominantStyle?.label || '',
            anchorSection: 'builds'
        });

        const nodeMap = new Map();
        const addNodeSource = (sourceKeyBase = '', values = [], fallbackThemeKey = '', sourceLabel = '', noteLine = '') => {
            if (!sourceKeyBase) return;
            const nodeTypes = typeof this.inferSanctumAgendaNodeTypes === 'function'
                ? this.inferSanctumAgendaNodeTypes(values, fallbackThemeKey)
                : [];
            nodeTypes.forEach((nodeType) => {
                const meta = typeof this.getSanctumAgendaNodeMeta === 'function'
                    ? this.getSanctumAgendaNodeMeta(nodeType)
                    : null;
                const key = makeSourceKey(sourceKeyBase, nodeType);
                const existing = nodeMap.get(nodeType) || {
                    id: nodeType,
                    label: meta?.label || nodeType,
                    icon: meta?.icon || '✦',
                    value: 0,
                    valueText: '',
                    noteLine: '',
                    tags: [],
                    anchorSection: 'sanctum',
                    latestAt: 0,
                    sourceKeys: new Set(),
                    sources: new Set()
                };
                if (!existing.sourceKeys.has(key)) {
                    existing.value += 1;
                    existing.sourceKeys.add(key);
                }
                if (sourceLabel) existing.sources.add(sourceLabel);
                if (!existing.noteLine && noteLine) existing.noteLine = noteLine;
                existing.tags = Array.from(existing.sources).slice(0, 3);
                nodeMap.set(nodeType, existing);
            });
        };
        addNodeSource(
            currentRunPath?.id ? makeSourceKey('path', currentRunPath.id) : '',
            [currentRunPath?.routeHint, currentRunPath?.playstyle, currentRunPath?.description],
            currentRunPath?.id || '',
            '当前命途',
            currentRunPath?.routeHint || currentRunPath?.playstyle || '当前命途会把节点偏好压成长期路线。'
        );
        addNodeSource(
            selectedGuide?.id ? makeSourceKey('guide', selectedGuide.id) : '',
            [selectedGuide?.routeFocusLine, selectedGuide?.compareHint, ...(selectedGuide?.trainingTags || [])],
            selectedGuide?.themeKey || '',
            '精选命盘',
            selectedGuide?.routeFocusLine || selectedGuide?.compareHint || '当前精选命盘会提供一条稳定的节点抓手。'
        );
        addNodeSource(
            trainingFocus?.sourceRunId ? makeSourceKey('run', trainingFocus.sourceRunId) : '',
            [trainingFocus?.routeFocusLine, trainingFocus?.compareHint, ...(trainingFocus?.trainingTags || [])],
            trainingFocus?.themeKey || '',
            '当前主练',
            trainingFocus?.routeFocusLine || trainingFocus?.trainingAdvice || '当前主练已经开始沉淀节点偏好。'
        );
        addNodeSource(
            slateFocus?.sourceRunId ? makeSourceKey('run', slateFocus.sourceRunId) : '',
            [slateFocus?.routeFocusLine, slateFocus?.compareHint, ...(slateFocus?.trainingTags || [])],
            slateFocus?.themeKey || '',
            '最近答卷',
            slateFocus?.routeFocusLine || slateFocus?.trainingAdvice || '最近答卷会继续反哺节点偏好。'
        );
        archiveEntries.forEach((entry) => {
            addNodeSource(
                makeSourceKey('archive', entry.archiveEntryId || entry.id || entry.at || nodeMap.size),
                [entry.preferredNodes, ...(entry.trainingTags || []), entry.note || '', entry.title || ''],
                entry.themeKey || '',
                entry.themeLabel || entry.originLabel || '观星档案',
                entry.note || entry.summary || entry.title || '观星档案已经留下节点偏好。'
            );
        });
        [activeAgenda, ...historyRecords].filter(Boolean).forEach((entry) => {
            const runSourceKey = entry.sourceRunId
                ? makeSourceKey('run', entry.sourceRunId)
                : makeSourceKey('agenda', `${entry.agendaId || 'agenda'}_${entry.updatedAt || entry.selectedAt || 0}`);
            addNodeSource(
                runSourceKey,
                [entry.focusNodeTypes, entry.contractNodeTypes, entry.focusNodeLine, entry.selectedContractLine, entry.selectedDecisionLine],
                entry.themeKey || '',
                entry.outcome === 'active' ? '当前议程' : '洞府结题',
                entry.focusNodeLine || entry.summaryLine || entry.selectedContractLine || entry.selectedDecisionLine || '洞府研究已经给出节点偏好。'
            );
        });
        const nodeEntries = rankEntries(Array.from(nodeMap.values()), 4).map((entry) => ({
            id: entry.id,
            label: entry.label,
            icon: entry.icon,
            value: entry.value,
            valueText: `${entry.value} 条留痕`,
            noteLine: entry.noteLine || '等待更多节点留痕沉淀路线倾向。',
            tags: entry.tags,
            anchorSection: 'sanctum',
            latestAt: entry.latestAt
        }));
        const dominantNode = nodeEntries[0] || null;
        const nodeTrack = buildTrack({
            id: 'node',
            label: '节点谱系',
            icon: dominantNode?.icon || '🧭',
            summaryLine: nodeEntries.length > 0
                ? `路线留痕当前更常落在【${nodeEntries.slice(0, 3).map((entry) => entry.label).join(' / ')}】。`
                : '节点谱系仍待从观星、归卷和议程里继续抽出长期主轴。',
            progressText: nodeEntries.length > 0 ? `已记录 ${nodeEntries.length} 条节点偏好` : '等待节点留痕',
            entries: nodeEntries,
            dominantId: dominantNode?.id || '',
            dominantLabel: dominantNode?.label || '',
            anchorSection: 'sanctum'
        });

        const facetMaps = {
            agenda: new Map(),
            decision: new Map(),
            contract: new Map(),
            outcome: new Map()
        };
        const addFacetValue = (facetId = '', label = '', sourceKey = '', noteLine = '') => {
            if (!facetMaps[facetId] || !label || !sourceKey) return;
            const safeLabel = String(label || '').trim();
            if (!safeLabel) return;
            const existing = facetMaps[facetId].get(safeLabel) || {
                label: safeLabel,
                count: 0,
                latestAt: 0,
                noteLine: '',
                sourceKeys: new Set()
            };
            if (!existing.sourceKeys.has(sourceKey)) {
                existing.count += 1;
                existing.sourceKeys.add(sourceKey);
            }
            existing.latestAt = Date.now();
            if (!existing.noteLine && noteLine) existing.noteLine = String(noteLine || '').trim();
            facetMaps[facetId].set(safeLabel, existing);
        };
        historyRecords.forEach((record) => {
            const runKey = record.sourceRunId
                ? makeSourceKey('run', record.sourceRunId)
                : makeSourceKey('agenda', `${record.agendaId || 'agenda'}_${record.updatedAt || record.selectedAt || 0}`);
            addFacetValue(
                'agenda',
                record.themeLabel || record.name || record.agendaId,
                runKey,
                `${record.name || record.themeLabel || '洞府议程'} · ${record.outcomeLabel || '研究留痕'}`
            );
            if (record.selectedDecisionLabel) {
                addFacetValue(
                    'decision',
                    record.selectedDecisionLabel,
                    runKey,
                    record.selectedDecisionLine || record.reasonLine || record.summaryLine || ''
                );
            }
            if (record.selectedContractLabel) {
                addFacetValue(
                    'contract',
                    record.selectedContractLabel,
                    runKey,
                    record.contractResolutionLine || record.selectedContractLine || record.summaryLine || ''
                );
            }
            const outcomeLabel = record.outcome === 'success'
                ? '结题成功'
                : (record.recoveryEligible ? `残卷回收${record.recoveryTierLabel ? ` · ${record.recoveryTierLabel}` : ''}` : '研究未成');
            addFacetValue(
                'outcome',
                outcomeLabel,
                runKey,
                record.recoveryLine || record.grantedLine || record.reasonLine || record.summaryLine || ''
            );
        });
        const pickFacetTop = (facetId = '') => rankEntries(
            Array.from(facetMaps[facetId] || []).map(([label, entry]) => ({
                id: `${facetId}_${label}`,
                label,
                value: clampInt(entry.count || 0, 0, 9999),
                latestAt: clampInt(entry.latestAt || 0, 0),
                noteLine: entry.noteLine || '',
                icon: '✦',
                anchorSection: 'sanctum'
            })),
            1
        )[0] || null;
        const agendaFacet = pickFacetTop('agenda');
        const decisionFacet = pickFacetTop('decision');
        const contractFacet = pickFacetTop('contract');
        const outcomeFacet = pickFacetTop('outcome');
        const researchEntries = [
            {
                id: 'agenda_type',
                label: '议程类型',
                icon: '📜',
                value: agendaFacet?.value || 0,
                valueText: agendaFacet ? `${agendaFacet.label} · ${agendaFacet.value} 次` : (activeAgenda?.name ? `${activeAgenda.name} · 当前立项` : '等待议程留痕'),
                noteLine: agendaFacet?.noteLine || activeAgenda?.summaryLine || '先让洞府议程结一次题，研究谱系才会开始稳定沉淀。',
                anchorSection: 'sanctum'
            },
            {
                id: 'decision_style',
                label: '处置倾向',
                icon: '⚖️',
                value: decisionFacet?.value || 0,
                valueText: decisionFacet ? `${decisionFacet.label} · ${decisionFacet.value} 次` : (activeAgenda?.selectedDecisionLabel ? `${activeAgenda.selectedDecisionLabel} · 当前选择` : '等待章中处置'),
                noteLine: decisionFacet?.noteLine || activeAgenda?.selectedDecisionLine || activeAgenda?.decisionPromptLine || '章中处置会在这里沉淀成长期研究风格。',
                anchorSection: 'sanctum'
            },
            {
                id: 'contract_style',
                label: '契约风格',
                icon: '⛓️',
                value: contractFacet?.value || 0,
                valueText: contractFacet ? `${contractFacet.label} · ${contractFacet.value} 次` : (activeAgenda?.selectedContractLabel ? `${activeAgenda.selectedContractLabel} · 当前锁线` : '等待锁线契约'),
                noteLine: contractFacet?.noteLine || activeAgenda?.selectedContractLine || activeAgenda?.contractPromptLine || '锁线契约兑现后，会开始把风险口味写进谱系。',
                anchorSection: 'sanctum'
            },
            {
                id: 'outcome_style',
                label: '结题 / 回收',
                icon: '🧾',
                value: outcomeFacet?.value || 0,
                valueText: outcomeFacet ? `${outcomeFacet.label} · ${outcomeFacet.value} 次` : (lastResolved?.outcomeLabel || '等待研究结果'),
                noteLine: outcomeFacet?.noteLine || lastResolved?.recoveryLine || lastResolved?.grantedLine || lastResolved?.reasonLine || '成功结题与残卷回收都会逐步沉淀成研究收束习惯。',
                anchorSection: 'sanctum'
            },
            {
                id: debtRecoveryStyle?.id || 'season_debt_recovery',
                label: debtRecoveryStyle?.label || '清账风格',
                icon: debtRecoveryStyle?.icon || '🧾',
                value: debtRecoveryStyle?.value || 0,
                valueText: debtRecoveryStyle?.valueText || '等待清账留痕',
                noteLine: debtRecoveryStyle?.noteLine || '把欠卷清成主验证通过后，谱系会开始记录“先清账再扩线”的处理习惯。',
                anchorSection: 'sanctum'
            },
            {
                id: riskyPushStyle?.id || 'season_risky_push',
                label: riskyPushStyle?.label || '押榜风格',
                icon: riskyPushStyle?.icon || '⚔️',
                value: riskyPushStyle?.value || 0,
                valueText: riskyPushStyle?.valueText || '等待押榜留痕',
                noteLine: riskyPushStyle?.noteLine || '高压定榜、押卷升级与正险切换会在这里沉淀成长期押榜口味。',
                anchorSection: 'sanctum'
            },
            {
                id: deferredCleanupStyle?.id || 'season_deferred_cleanup',
                label: deferredCleanupStyle?.label || '拖延风格',
                icon: deferredCleanupStyle?.icon || '⏳',
                value: deferredCleanupStyle?.value || 0,
                valueText: deferredCleanupStyle?.valueText || '等待拖延留痕',
                noteLine: deferredCleanupStyle?.noteLine || '把账继续拖到后续周转时，谱系会记下你更常见的收尾节奏。',
                anchorSection: 'sanctum'
            }
        ];
        const dominantResearchBase = agendaFacet || (activeAgenda ? { label: activeAgenda.name, id: activeAgenda.agendaId || 'active' } : null);
        const dominantResearch = dominantVerdictStyle
            ? {
                label: dominantVerdictStyle.label,
                id: dominantVerdictStyle.id
            }
            : dominantResearchBase;
        const researchTrack = buildTrack({
            id: 'research',
            label: '研究谱系',
            icon: '📚',
            summaryLine: dominantVerdictStyle
                ? `研究谱系当前更常留下【${dominantVerdictStyle.label}】这类赛季裁定习惯${dominantResearchBase?.label ? `，并继续围绕【${dominantResearchBase.label}】推进。` : '。'}`
                : (dominantResearchBase
                    ? `研究谱系当前更常围绕【${dominantResearchBase.label}】推进，处置与契约倾向也开始留下稳定留痕。`
                    : '研究谱系仍待第一批议程结果真正沉淀下来。'),
            progressText: researchHistoryCount > 0 || dominantVerdictStyle
                ? `${researchHistoryCount} 份研究留痕 · ${verdictStyleEntries.filter((entry) => entry.value > 0).length} 类赛季裁定`
                : '等待研究结题',
            entries: researchEntries,
            dominantId: dominantResearch?.id || '',
            dominantLabel: dominantResearch?.label || '',
            anchorSection: 'sanctum'
        });

        const tracks = [characterTrack, styleTrack, nodeTrack, researchTrack];
        const available = !!(
            currentCharacter
            || currentRunPath
            || currentDestiny
            || activeAgenda
            || lastResolved
            || samples.length > 0
            || archiveEntries.length > 0
            || runPathRecords.length > 0
            || seasonVerification?.available
        );
        const summaryParts = [
            dominantCharacter?.label || currentCharacter?.name || '',
            dominantStyle?.label || currentRunPath?.name || currentDestiny?.name || '',
            dominantNode?.label || '',
            dominantResearchBase?.label || ''
        ].filter(Boolean);
        const summaryLine = summaryParts.length > 0
            ? `长期主修正在向【${summaryParts.join(' / ')}】收束${dominantVerdictStyle?.label ? `，赛季裁定更常留下【${dominantVerdictStyle.label}】。` : '。'}`
            : (dominantVerdictStyle?.label
                ? `命盘谱系已经开始记录【${dominantVerdictStyle.label}】这类赛季裁定习惯。`
                : '命盘谱系仍待第一批长期留痕落档。');
        const baseDetailLine = activeAgenda
            ? `当前研究：${activeAgenda.name} · ${activeAgenda.phaseLabel || activeAgenda.selectedDecisionLabel || activeAgenda.selectedContractLabel || activeAgenda.summaryLine || '洞府样本正在推进。'}`
            : (lastResolved
                ? `最近研究：${lastResolved.name} · ${lastResolved.outcomeLabel || '研究留痕'}${lastResolved.recoveryLine ? ` · ${lastResolved.recoveryLine}` : ''}`
                : (dominantCharacter?.noteLine || dominantStyle?.noteLine || dominantNode?.noteLine || '角色、流派、节点与研究会在这里合成一份长期身份档案。'));
        const detailLine = [
            baseDetailLine,
            primarySeasonVerification?.writebackLine
                ? `赛季回写：${primarySeasonVerification.writebackLine}`
                : (dominantVerdictStyle?.noteLine
                    ? `裁定留痕：${dominantVerdictStyle.noteLine}`
                    : (secondarySeasonVerification?.writebackLine ? `旁证回写：${secondarySeasonVerification.writebackLine}` : ''))
        ].filter(Boolean).slice(0, 2).join('｜');
        const currentFocusLine = [
            selectedGuide?.title ? `精选命盘【${selectedGuide.title}】` : '',
            trainingFocus?.chapterName ? `当前主练 ${trainingFocus.chapterName}` : '',
            primarySeasonVerification?.label ? `主验证 ${primarySeasonVerification.label}` : '',
            latestSlate?.chapterName ? `最近答卷 ${latestSlate.chapterName}` : '',
            !primarySeasonVerification?.label && secondarySeasonVerification?.label ? `旁证 ${secondarySeasonVerification.label}` : '',
            !primarySeasonVerification?.label && !secondarySeasonVerification?.label && dominantVerdictStyle?.label
                ? `当前裁定 ${dominantVerdictStyle.label}`
                : ''
        ].filter(Boolean).slice(0, 3).join(' · ');
        const nextTargets = [];
        if (primarySeasonVerification?.resultStatus === 'verified') {
            nextTargets.push(`谱系回写：${primarySeasonVerification.writebackLine || primarySeasonVerification.summaryLine || '主验证已回写，可继续沿这条主修扩样本。'}`);
        } else if (primarySeasonVerification?.resultStatus === 'failed') {
            nextTargets.push(`反证归档：${primarySeasonVerification.writebackLine || primarySeasonVerification.summaryLine || '主验证给出了反证，先收紧主修轴再继续扩线。'}`);
        } else if (secondarySeasonVerification?.resultStatus === 'verified') {
            nextTargets.push(`旁证沉淀：${secondarySeasonVerification.writebackLine || secondarySeasonVerification.summaryLine || '旁验证已补齐，可把这条主修写成长期谱系。'}`);
        }
        if ((dominantCharacter?.value || 0) <= 0 && currentCharacter) {
            nextTargets.push(`先用【${currentCharacter.name}】打成第一份稳定样本，角色谱系才会真正落档。`);
        }
        if ((dominantStyle?.value || 0) <= 0 && currentRunPath?.name) {
            nextTargets.push(`让当前【${currentRunPath.name}】至少圆满 1 次，把流派谱系从“当前配置”升级为长期战录。`);
        }
        if (nodeEntries.length < 3) {
            nextTargets.push('继续用观星、归卷和洞府议程补节点偏好，至少让 3 条路线主轴稳定留痕。');
        }
        if (researchHistoryCount <= 0) {
            nextTargets.push(activeAgenda
                ? `把【${activeAgenda.name}】结成一次留痕，让研究谱系开始记录处置、契约与回收倾向。`
                : '回洞府立下一道议程并真正结题，研究谱系才会开始稳定成长。');
        } else if (!contractFacet && activeAgenda && !activeAgenda.selectedContractLabel) {
            nextTargets.push('至少兑现 1 次锁线契约，让研究谱系不只记录议程类型，也记录风险口味。');
        }
        if ((debtRecoveryStyle?.value || 0) <= 0) {
            nextTargets.push('至少把 1 笔欠卷清成主验证通过，让命盘谱系真正开始记录清账风格。');
        } else if ((deferredCleanupStyle?.value || 0) > 0 && (!primarySeasonVerification || primarySeasonVerification.resultStatus !== 'verified')) {
            nextTargets.push('先把一笔延账收成真清账，避免谱系继续只留下“把账带进下周”的收尾习惯。');
        } else if ((riskyPushStyle?.value || 0) <= 0) {
            nextTargets.push('去打一场能回写季盘的高压主验证，把押榜风格从准备状态升级为长期留痕。');
        }

        return {
            version: 1,
            available,
            title: '命盘谱系',
            icon: '🧬',
            summaryLine,
            detailLine,
            currentFocusLine,
            guideLine: '先把角色与流派压成稳定模板，再用节点偏好、研究结果与赛季裁定风格验证这套主修是不是能长期成立。',
            actionValue: 'builds',
            progress: {
                trackedCharacters: characterEntries.filter((entry) => entry.value > 0).length,
                trackedStyles: dedupedStyleEntries.filter((entry) => entry.value > 0 || /^destiny_/.test(entry.id)).length,
                trackedNodes: nodeEntries.length,
                researchHistoryCount,
                trackedVerdictStyles: verdictStyleEntries.filter((entry) => entry.value > 0).length
            },
            nextTargets: nextTargets.slice(0, 3),
            tracks,
            characterTrack,
            styleTrack,
            nodeTrack,
            researchTrack,
            recentRecords: [
                dominantCharacter?.noteLine || '',
                dominantStyle?.noteLine || '',
                lastResolved?.summaryLine || '',
                dominantVerdictStyle?.noteLine || ''
            ].filter(Boolean).slice(0, 3)
        };
    };

    Game.prototype.buildRuntimeSaveSnapshot = function () {
        const pvpEconomySnapshot = (typeof PVPService !== 'undefined'
            && PVPService
            && typeof PVPService.getEconomySnapshot === 'function')
            ? PVPService.getEconomySnapshot()
            : null;
        return {
            version: '5.1.0',
            player: this.player && typeof this.player.getState === 'function'
                ? this.player.getState()
                : null,
            map: {
                nodes: Array.isArray(this.map?.nodes) ? this.map.nodes : [],
                currentNodeIndex: this.map?.currentNodeIndex || 0,
                completedNodes: Array.isArray(this.map?.completedNodes) ? this.map.completedNodes : []
            },
            unlockedRealms: Array.isArray(this.unlockedRealms) && this.unlockedRealms.length > 0
                ? this.unlockedRealms.slice()
                : [1],
            currentScreen: this.currentScreen || 'main-menu',
            saveSlot: this.currentSaveSlot,
            combatMeta: {
                stance: this.player?.stance || 'neutral',
                ruleVersion: 'combat-v2',
                battleUIUpdates: (this.performanceStats && this.performanceStats.battleUIUpdates) || 0
            },
            pvpMeta: {
                ruleVersion: 'pvp-v2',
                lastKnownDivision: (typeof PVPService !== 'undefined' && PVPService.currentRankData)
                    ? PVPService.currentRankData.division
                    : null,
                economy: pvpEconomySnapshot
            },
            legacyProgress: this.legacyProgress,
            featureFlags: { ...(this.featureFlags || {}) },
            endlessMeta: typeof this.ensureEndlessState === 'function'
                ? this.ensureEndlessState()
                : this.endlessState,
            encounterMeta: typeof this.ensureEncounterState === 'function'
                ? this.ensureEncounterState()
                : this.encounterState,
            schemaMigratedAt: Date.now(),
            timestamp: Date.now()
        };
    };

    Game.prototype.captureBossMemorySession = function (bossId = '') {
        this.ensureCollectionHubBootState();
        const safeBossId = String(bossId || '').trim();
        const snapshot = this.buildRuntimeSaveSnapshot();
        this.bossMemorySession = {
            bossId: safeBossId,
            runtimeSnapshot: JSON.stringify(snapshot),
            originalSaveData: typeof localStorage !== 'undefined' ? localStorage.getItem('theDefierSave') : null,
            returnSection: this.getCollectionHubState().section || 'bosses',
            selectedBossArchiveId: this.selectedBossArchiveId || safeBossId
        };
        return this.bossMemorySession;
    };

    Game.prototype.restoreBossMemorySession = function () {
        const session = this.bossMemorySession;
        if (!session) return false;
        let loaded = false;
        try {
            if (typeof localStorage !== 'undefined' && session.runtimeSnapshot) {
                localStorage.setItem('theDefierSave', session.runtimeSnapshot);
            }
            loaded = typeof this.loadGame === 'function' ? !!this.loadGame() : false;
        } finally {
            if (typeof localStorage !== 'undefined') {
                if (session.originalSaveData != null) {
                    localStorage.setItem('theDefierSave', session.originalSaveData);
                } else {
                    localStorage.removeItem('theDefierSave');
                }
            }
            this.bossMemorySession = null;
        }
        return loaded;
    };

    Game.prototype.startBossMemoryBattle = function (bossId = '') {
        this.ensureCollectionHubBootState();
        const safeBossId = String(bossId || '').trim();
        const catalogBoss = typeof ENEMIES !== 'undefined' && ENEMIES ? ENEMIES[safeBossId] : null;
        if (!catalogBoss || !catalogBoss.isBoss) {
            if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
                Utils.showBattleLog('伏魔台尚未找到这位主宰的完整记忆。');
            }
            return false;
        }

        const entry = typeof this.getBossArchiveEntries === 'function'
            ? this.getBossArchiveEntries().find((item) => item.id === safeBossId) || null
            : null;
        if (entry && entry.status !== 'defeated') {
            if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
                Utils.showBattleLog('需先在主线击破本体，伏魔台才会开启这场记忆战。');
            }
            return false;
        }

        this.captureBossMemorySession(safeBossId);

        const characterId = (typeof this.player?.characterId === 'string' && this.player.characterId)
            ? this.player.characterId
            : 'linFeng';
        if (
            this.player
            && typeof this.player.getRunDestinyMeta === 'function'
            && !this.player.getRunDestinyMeta()
            && typeof this.player.setRunDestiny === 'function'
        ) {
            const runDestinyId = this.selectedRunDestinyId || (typeof this.resolveDefaultRunDestinyId === 'function'
                ? this.resolveDefaultRunDestinyId(characterId)
                : null);
            if (runDestinyId) this.player.setRunDestiny(runDestinyId, 1);
        }
        if (
            this.player
            && typeof this.player.getSpiritCompanionMeta === 'function'
            && !this.player.getSpiritCompanionMeta()
            && typeof this.player.setSpiritCompanion === 'function'
        ) {
            const spiritCompanionId = this.selectedSpiritCompanionId || (typeof this.resolveDefaultSpiritCompanionId === 'function'
                ? this.resolveDefaultSpiritCompanionId(characterId)
                : null);
            if (spiritCompanionId) this.player.setSpiritCompanion(spiritCompanionId, 1);
        }

        this.player.realm = clampInt(catalogBoss.realm || this.player?.realm || 1, 1, 18);
        this.player.currentHp = Math.max(1, clampInt(this.player.maxHp || this.player.currentHp || 1, 1, Number.MAX_SAFE_INTEGER));
        this.player.block = 0;
        this.player.buffs = {};
        this.player.currentEnergy = Math.max(0, clampInt(this.player.baseEnergy || this.player.currentEnergy || 0, 0, 99));
        if (typeof this.player.resetSpiritCompanionBattleState === 'function') {
            this.player.resetSpiritCompanionBattleState();
        }
        if (typeof this.updateRealmBackground === 'function') {
            this.updateRealmBackground();
        }

        const bossInstance = typeof Utils !== 'undefined' && typeof Utils.deepClone === 'function'
            ? Utils.deepClone(catalogBoss)
            : JSON.parse(JSON.stringify(catalogBoss));
        bossInstance.isBoss = true;
        bossInstance.currentHp = clampInt(bossInstance.maxHp || bossInstance.hp || bossInstance.currentHp || 1, 1, Number.MAX_SAFE_INTEGER);
        bossInstance.maxHp = bossInstance.currentHp;
        bossInstance.name = `【记忆战】${bossInstance.name || safeBossId}`;

        const node = {
            id: `boss_memory:${safeBossId}`,
            type: 'boss_memory',
            bossId: safeBossId,
            row: -1,
            completed: false,
            accessible: true
        };
        this.currentBattleNode = node;
        if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
            Utils.showBattleLog(`【伏魔台】${entry?.name || catalogBoss.name || safeBossId} 的记忆残响已被唤醒。`);
        }
        this.startBattle([bossInstance], node);
        return true;
    };

    Game.prototype.finishBossMemoryBattle = function (result = 'defeat', payload = {}) {
        const activeNode = this.currentBattleNode || {};
        const session = this.bossMemorySession;
        const safeBossId = String(payload.bossId || payload.bossEnemy?.id || activeNode.bossId || session?.bossId || '').trim();
        const catalogBoss = typeof ENEMIES !== 'undefined' && ENEMIES ? ENEMIES[safeBossId] : null;
        const bossName = catalogBoss?.name || payload.bossEnemy?.name || safeBossId || '未知主宰';
        const normalizedTurns = clampInt(payload.turns || this.battle?.turnNumber || 0, 0, 9999);
        const isVictory = result === 'victory';
        const record = this.recordBossMemoryResult(safeBossId, isVictory ? 'victory' : 'defeat', normalizedTurns);
        const firstClear = isVictory && record.clears === 1;

        this.restoreBossMemorySession();
        this.mode = 'pve';
        this.currentBattleNode = null;
        if (typeof this.showCollection === 'function') {
            this.showCollection('bosses');
        }
        if (typeof this.selectBossArchiveEntry === 'function' && safeBossId) {
            this.selectBossArchiveEntry(safeBossId);
        }

        let legacyGain = 0;
        if (firstClear && typeof this.awardLegacyEssence === 'function') {
            legacyGain = this.awardLegacyEssence(4, '伏魔台记忆战', { silent: true });
        }
        if (isVictory && typeof this.recordCollectionUnlock === 'function') {
            this.recordCollectionUnlock('boss_memory', {
                id: safeBossId,
                name: bossName,
                icon: catalogBoss?.icon || '🗿',
                note: firstClear
                    ? `伏魔台首胜 · 最快 ${record.bestTurn || Math.max(1, normalizedTurns)} 回合`
                    : `伏魔台再破记忆 · 最快 ${record.bestTurn || Math.max(1, normalizedTurns)} 回合`
            });
        }

        const title = isVictory ? '伏魔台记忆战胜利' : '伏魔台记忆战留痕';
        const lines = isVictory
            ? [
                `${bossName} 的记忆残响已被镇压。`,
                `累计胜场 ${record.clears} · 最快 ${record.bestTurn || Math.max(1, normalizedTurns)} 回合`,
                firstClear && legacyGain > 0 ? `首胜奖励：传承精魄 +${legacyGain}` : '重复演武不会消耗主线进度，可继续刷新更快轮次。'
            ]
            : [
                `${bossName} 的记忆尚未平复。`,
                '本次演武已留档，失败不会污染主线存档。',
                `累计试作 ${record.attempts} 次${record.bestTurn > 0 ? ` · 当前最快 ${record.bestTurn} 回合` : ''}`
            ];
        if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
            Utils.showBattleLog(isVictory
                ? `【伏魔台】记忆战告捷：${bossName}`
                : `【伏魔台】记忆战留档：${bossName}`);
        }
        if (typeof this.showRewardModal === 'function') {
            this.showRewardModal(title, lines.filter(Boolean).join('\n'), isVictory ? '🗿' : '🕯️', () => {
                if (typeof this.showCollection === 'function') {
                    this.showCollection('bosses');
                }
                if (typeof this.selectBossArchiveEntry === 'function' && safeBossId) {
                    this.selectBossArchiveEntry(safeBossId);
                }
            });
        }
        return {
            bossId: safeBossId,
            result: isVictory ? 'victory' : 'defeat',
            record,
            firstClear,
            legacyGain
        };
    };

    Game.prototype.showCollection = function (section = 'laws') {
        this.ensureCollectionHubBootState();
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.collectionHubState,
            section: section || 'laws'
        });
        if (typeof originalShowCollection === 'function') {
            return originalShowCollection.call(this);
        }
        this.showScreen('collection');
        this.initCollection();
    };

    Game.prototype.switchCollectionSection = function (section = 'laws') {
        this.ensureCollectionHubBootState();
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.collectionHubState,
            section
        });
        if (this.currentScreen !== 'collection') {
            this.showCollection(section);
            return;
        }
        this.initCollection();
    };

    Game.prototype.setSpiritCodexSearchQuery = function (query = '') {
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            spiritQuery: query,
            section: 'spirits'
        });
        this.initCollection();
    };

    Game.prototype.setSpiritCodexFocusFilter = function (value = 'all') {
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            spiritFocus: value,
            section: 'spirits'
        });
        this.initCollection();
    };

    Game.prototype.setChapterCodexSearchQuery = function (query = '') {
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            chapterQuery: query,
            section: 'chapters'
        });
        this.initCollection();
    };

    Game.prototype.setChapterCodexFocusFilter = function (value = 'all') {
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            chapterFocus: value,
            section: 'chapters'
        });
        this.initCollection();
    };

    Game.prototype.setEnemyCodexSearchQuery = function (query = '') {
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            enemyQuery: query,
            section: 'enemies'
        });
        this.initCollection();
    };

    Game.prototype.setEnemyCodexFocusFilter = function (value = 'all') {
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            enemyFocus: value,
            section: 'enemies'
        });
        this.initCollection();
    };

    Game.prototype.setBossArchiveSearchQuery = function (query = '') {
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            bossQuery: query,
            section: 'bosses'
        });
        this.initCollection();
    };

    Game.prototype.setBossArchiveFocusFilter = function (value = 'all') {
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            bossFocus: value,
            section: 'bosses'
        });
        this.initCollection();
    };

    Game.prototype.setRunSlateShelfThemeFilter = function (value = 'all') {
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            slateTheme: value,
            section: 'slates'
        });
        this.initCollection();
    };

    Game.prototype.setRunSlateShelfChapterFilter = function (value = 'all') {
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            slateChapter: value,
            section: 'slates'
        });
        this.initCollection();
    };

    Game.prototype.setRunSlateShelfRatingFilter = function (value = 'all') {
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            slateRating: value,
            section: 'slates'
        });
        this.initCollection();
    };

    Game.prototype.getCollectionRealmProgress = function () {
        const currentRealm = Math.max(1, clampInt(this.player?.realm || 1, 1, 18));
        const maxClearedFromStats = Math.max(0, clampInt(this.achievementSystem?.stats?.realmCleared || 0, 0, 18));
        const maxReached = Math.max(1, clampInt(this.player?.maxRealmReached || currentRealm, 1, 18));
        const unlockedRealms = Array.isArray(this.unlockedRealms) && this.unlockedRealms.length > 0
            ? this.unlockedRealms.map((realm) => clampInt(realm, 1, 18))
            : [1];
        const unlockedPeak = Math.max(...unlockedRealms);
        const clearedRealm = Math.max(
            maxClearedFromStats,
            Math.max(0, unlockedPeak - 1),
            Math.max(0, maxReached - 1)
        );
        return {
            currentRealm,
            clearedRealm,
            currentChapterIndex: getChapterIndexForRealm(currentRealm)
        };
    };

    Game.prototype.getCollectionProgressSnapshot = function () {
        this.ensureCollectionHubBootState();
        const spiritCatalog = (typeof SPIRIT_COMPANIONS !== 'undefined' && SPIRIT_COMPANIONS) ? Object.keys(SPIRIT_COMPANIONS) : [];
        const treasureCatalog = (typeof TREASURES !== 'undefined' && TREASURES) ? Object.keys(TREASURES) : [];
        const lawCatalog = (typeof LAWS !== 'undefined' && LAWS) ? Object.keys(LAWS) : [];
        const runPathCatalog = typeof this.getRunPathCatalog === 'function'
            ? this.getRunPathCatalog()
            : ((typeof RUN_PATHS !== 'undefined' && RUN_PATHS)
                ? Object.values(RUN_PATHS).filter((item) => item && item.id)
                : []);
        const enemyCatalog = (typeof ENEMIES !== 'undefined' && ENEMIES)
            ? Object.values(ENEMIES).filter((enemy) => enemy && !enemy.isBoss && !enemy.isMinion)
            : [];
        const bossCatalog = (typeof ENEMIES !== 'undefined' && ENEMIES)
            ? Object.values(ENEMIES).filter((enemy) => enemy && enemy.isBoss)
            : [];
        const realmProgress = this.getCollectionRealmProgress();
        const seenSpiritIds = new Set(
            this.getCollectionUnlockHistory(24)
                .filter((entry) => entry.type === 'spirit')
                .map((entry) => entry.itemId)
        );
        const seenEnemyIds = new Set(
            this.getCollectionUnlockHistory(24)
                .filter((entry) => entry.type === 'enemy')
                .map((entry) => entry.itemId)
        );
        const currentSpirit = this.player && typeof this.player.getSpiritCompanionMeta === 'function'
            ? this.player.getSpiritCompanionMeta()
            : null;
        if (currentSpirit?.id) seenSpiritIds.add(currentSpirit.id);
        const bossMemoryClears = typeof this.getBossMemoryClearCount === 'function'
            ? this.getBossMemoryClearCount()
            : 0;
        const bossMemoryAttempts = typeof this.getBossMemoryAttemptCount === 'function'
            ? this.getBossMemoryAttemptCount()
            : 0;
        const runPathBossSamples = Array.isArray(this.runPathBossSamples) ? this.runPathBossSamples : [];
        const sampledBosses = new Set(runPathBossSamples.map((sample) => sample?.bossId).filter(Boolean));
        const sampledCharacters = new Set(runPathBossSamples.map((sample) => sample?.characterId || sample?.characterName).filter(Boolean));
        const completedRunPaths = typeof this.getCompletedRunPathCount === 'function'
            ? this.getCompletedRunPathCount()
            : 0;
        const totalRunPathClears = typeof this.getTotalRunPathClearCount === 'function'
            ? this.getTotalRunPathClearCount()
            : 0;
        const forgeOverview = this.player && typeof this.player.getTreasureWorkshopResearchOverview === 'function'
            ? this.player.getTreasureWorkshopResearchOverview()
            : null;
        return {
            collectedLaws: Array.isArray(this.player?.collectedLaws) ? this.player.collectedLaws.length : 0,
            totalLaws: lawCatalog.length,
            collectedTreasures: Array.isArray(this.player?.collectedTreasures) ? this.player.collectedTreasures.length : 0,
            totalTreasures: treasureCatalog.length,
            seenSpirits: seenSpiritIds.size,
            totalSpirits: spiritCatalog.length,
            seenEnemies: enemyCatalog.filter((enemy) => seenEnemyIds.has(enemy.id) || realmProgress.currentRealm >= clampInt(enemy.realm || 1, 1, 18)).length,
            totalEnemies: enemyCatalog.length,
            defeatedBosses: bossCatalog.filter((boss) => realmProgress.clearedRealm >= clampInt(boss.realm || 1, 1, 18)).length,
            totalBosses: bossCatalog.length,
            clearedBossMemories: bossMemoryClears,
            totalBossMemoryAttempts: bossMemoryAttempts,
            runPathBossSampleCount: runPathBossSamples.length,
            sampledBosses: sampledBosses.size,
            sampledCharacters: sampledCharacters.size,
            completedRunPaths,
            runPathArchiveCount: completedRunPaths,
            totalRunPaths: runPathCatalog.length,
            totalRunPathClears,
            clearedChapters: Math.max(0, Math.floor(realmProgress.clearedRealm / 3)),
            totalChapters: 6,
            currentChapterIndex: realmProgress.currentChapterIndex,
            forgeCoreOwned: forgeOverview?.coreOwned || 0,
            forgeCoreTotal: forgeOverview?.coreTotal || 0,
            forgeFormOwned: forgeOverview?.formOwned || 0,
            forgeFormTotal: forgeOverview?.formTotal || 0,
            forgeActiveWorkshops: forgeOverview?.activeWorkshops || 0,
            forgeReforges: forgeOverview?.activeReforges || 0,
            forgeInfusions: forgeOverview?.activeInfusions || 0,
            forgeSetEchoes: forgeOverview?.activeSetEchoes || 0,
            forgeResonantSets: forgeOverview?.resonantSets || 0,
            forgeFullSets: forgeOverview?.fullSets || 0,
            unclaimedAchievements: Array.isArray(this.achievementSystem?.unlockedAchievements)
                ? this.achievementSystem.unlockedAchievements.filter((id) => !this.achievementSystem.claimedAchievements.includes(id)).length
                : 0
        };
    };

    Game.prototype.getSpiritCodexEntries = function () {
        const catalog = (typeof SPIRIT_COMPANIONS !== 'undefined' && SPIRIT_COMPANIONS && typeof SPIRIT_COMPANIONS === 'object')
            ? SPIRIT_COMPANIONS
            : {};
        const selectedCharacterId = this.player?.characterId || this.selectedCharacterId || 'linFeng';
        const currentSpirit = this.player && typeof this.player.getSpiritCompanionMeta === 'function'
            ? this.player.getSpiritCompanionMeta()
            : null;
        const historySpiritIds = new Set(
            this.getCollectionUnlockHistory(24)
                .filter((entry) => entry.type === 'spirit')
                .map((entry) => entry.itemId)
        );
        const draftSpiritIds = Array.isArray(this.pendingSpiritCompanionDrafts?.[selectedCharacterId])
            ? this.pendingSpiritCompanionDrafts[selectedCharacterId]
            : [];
        const chapterCatalog = typeof this.getChapterProfileCatalog === 'function' ? this.getChapterProfileCatalog() : {};
        const selectedCharacter = getCharacterMeta(selectedCharacterId);

        return Object.keys(catalog).map((spiritId) => {
            const baseMeta = typeof this.getSpiritCompanionMetaById === 'function'
                ? this.getSpiritCompanionMetaById(spiritId, 1)
                : null;
            if (!baseMeta) return null;
            const storyProfile = typeof this.getSpiritStoryProfile === 'function'
                ? this.getSpiritStoryProfile(spiritId)
                : null;
            const nextTier = Math.min(baseMeta.maxTier || 1, clampInt(baseMeta.tier || 1, 1, 3) + 1);
            const nextMeta = typeof this.getSpiritCompanionMetaById === 'function'
                ? this.getSpiritCompanionMetaById(spiritId, nextTier)
                : null;
            const affinityNames = (baseMeta.affinities || []).map((characterId) => getCharacterMeta(characterId)?.name || characterId);
            const chapterFits = Object.values(chapterCatalog)
                .filter((chapter) => Array.isArray(chapter?.recommendedSpirits) && chapter.recommendedSpirits.includes(spiritId))
                .map((chapter) => chapter.name);
            const isCurrent = currentSpirit?.id === spiritId;
            const isAligned = Array.isArray(baseMeta.affinities) && baseMeta.affinities.includes(selectedCharacterId);
            const isSeen = isCurrent || historySpiritIds.has(spiritId) || draftSpiritIds.includes(spiritId);
            const isHidden = !isCurrent && !isSeen && !isAligned;

            let status = 'known';
            let statusLabel = '已录';
            if (isCurrent) {
                status = 'current';
                statusLabel = '当前同行';
            } else if (isAligned) {
                status = 'aligned';
                statusLabel = '角色共鸣';
            } else if (isHidden) {
                status = 'hidden';
                statusLabel = '未解锁线索';
            }

            const sourceText = isCurrent
                ? `当前已与【${baseMeta.name}】缔约，可在${storyProfile?.source || '灵契窟'}继续升至更高契阶。`
                : isAligned
                    ? `${selectedCharacter?.name || '当前角色'} 与它更易共鸣，可在开局灵契三选或${storyProfile?.source || '灵契窟'}追索。`
                    : isSeen
                        ? `你已见过它的回响，继续在${storyProfile?.source || '灵契窟或章节事件'}中深挖更容易稳定缔约。`
                        : '尚未留下完整纪录，推测需通过灵契窟、章节事件或研究项继续追索。';

            const unlockClue = isHidden
                ? `线索：更适合 ${affinityNames.join('、')} 出手追索。`
                : `线索：优先在灵契窟升契，或围绕 ${splitKeywords(baseMeta.playstyle, 2).join(' / ') || '核心节奏'} 构筑。`;

            return {
                id: spiritId,
                name: baseMeta.name,
                displayName: isHidden ? '未记名灵契' : baseMeta.name,
                icon: baseMeta.icon || '✦',
                displayIcon: isHidden ? '❔' : (baseMeta.icon || '✦'),
                title: baseMeta.title || '',
                description: baseMeta.description || '',
                playstyle: baseMeta.playstyle || '',
                story: isHidden ? '只捕捉到一缕模糊灵识，还需要更多线索才能还原其完整故事。' : (baseMeta.story || ''),
                summary: isHidden ? '尚未解明其完整护道方式。' : (baseMeta.summary || baseMeta.description || ''),
                passiveLabel: isHidden ? '未解析被动' : (baseMeta.passiveLabel || '灵契被动'),
                passiveDesc: isHidden ? '继续研究后可解开其被动结构。' : (baseMeta.passiveDesc || ''),
                activeLabel: isHidden ? '未解析主动' : (baseMeta.activeLabel || '灵契主动'),
                activeDesc: isHidden ? '继续研究后可解开其主动护道。' : (baseMeta.activeDesc || ''),
                chargeMax: clampInt(baseMeta.chargeMax || 0, 0),
                tierLabel: baseMeta.tierLabel || '初契',
                maxTier: clampInt(baseMeta.maxTier || 1, 1, 3),
                nextGrowthText: isCurrent && nextMeta && nextMeta.tier > baseMeta.tier
                    ? `下一阶：${nextMeta.summary || nextMeta.passiveDesc || '灵契护道进一步强化。'}`
                    : isCurrent
                        ? '当前已是最高契阶，可围绕它补足章节与法宝协同。'
                        : '尚未缔约，先解锁来源线索再决定是否围绕它构筑。',
                affinityNames,
                selectedCharacterName: selectedCharacter?.name || '当前角色',
                status,
                statusLabel,
                isCurrent,
                isAligned,
                isSeen,
                isHidden,
                chapterFits,
                sourceText,
                unlockClue,
                roleTags: splitKeywords(baseMeta.playstyle || baseMeta.summary || '', 3),
                storyProfile
            };
        }).filter(Boolean);
    };

    Game.prototype.passesSpiritCodexFilter = function (entry) {
        const state = this.getCollectionHubState();
        if (!entry) return false;
        if (state.spiritFocus === 'current' && !entry.isCurrent) return false;
        if (state.spiritFocus === 'aligned' && !(entry.isCurrent || entry.isAligned)) return false;
        if (state.spiritFocus === 'hidden' && !entry.isHidden) return false;
        if (!state.spiritQuery) return true;
        const haystack = [
            entry.id,
            entry.name,
            entry.title,
            entry.description,
            entry.playstyle,
            entry.story,
            entry.sourceText,
            entry.unlockClue,
            entry.storyProfile?.acquisitionTitle,
            entry.storyProfile?.acquisitionSummary,
            entry.storyProfile?.witnessTitle,
            entry.storyProfile?.witnessSummary,
            ...(entry.affinityNames || []),
            ...(entry.chapterFits || [])
        ].join(' ').toLowerCase();
        return haystack.includes(state.spiritQuery.toLowerCase());
    };

    Game.prototype.selectSpiritCodexEntry = function (spiritId = '') {
        this.selectedSpiritCodexId = String(spiritId || '');
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            section: 'spirits'
        });
        this.initCollection();
    };

    Game.prototype.getChapterCodexEntries = function () {
        const entries = [];
        const realmProgress = this.getCollectionRealmProgress();
        const currentChapterIndex = realmProgress.currentChapterIndex;
        const chapterCatalog = typeof this.getChapterProfileCatalog === 'function' ? this.getChapterProfileCatalog() : {};
        const enemyCatalog = (typeof ENEMIES !== 'undefined' && ENEMIES) ? Object.values(ENEMIES) : [];

        for (let chapterIndex = 1; chapterIndex <= 6; chapterIndex += 1) {
            const baseProfile = chapterCatalog[chapterIndex];
            if (!baseProfile) continue;
            const chapterRealm = (chapterIndex - 1) * 3 + 1;
            const profile = typeof this.getChapterProfileForRealm === 'function'
                ? this.getChapterProfileForRealm(chapterRealm)
                : null;
            if (!profile) continue;
            const narrativeProfile = typeof this.getChapterNarrativeProfile === 'function'
                ? this.getChapterNarrativeProfile(chapterIndex)
                : null;
            const realms = [chapterRealm, chapterRealm + 1, chapterRealm + 2];
            const enemies = enemyCatalog.filter((enemy) => enemy && !enemy.isBoss && realms.includes(clampInt(enemy.realm || 1, 1, 18)));
            const bosses = enemyCatalog.filter((enemy) => enemy && enemy.isBoss && realms.includes(clampInt(enemy.realm || 1, 1, 18)));
            const ecologyTags = new Set();
            const ecologyTemplates = (typeof ENEMY_ECOLOGY_TEMPLATES !== 'undefined' && ENEMY_ECOLOGY_TEMPLATES && ENEMY_ECOLOGY_TEMPLATES[chapterIndex])
                ? ENEMY_ECOLOGY_TEMPLATES[chapterIndex]
                : null;
            const eliteCombo = (typeof CHAPTER_ELITE_COMBOS !== 'undefined' && CHAPTER_ELITE_COMBOS && CHAPTER_ELITE_COMBOS[chapterIndex])
                ? CHAPTER_ELITE_COMBOS[chapterIndex]
                : null;
            enemies.forEach((enemy) => {
                (enemy.patterns || []).forEach((pattern) => {
                    if (!pattern) return;
                    if (pattern.type === 'attack' || pattern.type === 'multiAttack') ecologyTags.add('输出压力');
                    if (pattern.type === 'debuff') ecologyTags.add('控制压力');
                    if (pattern.type === 'addStatus' || pattern.type === 'multiAction') ecologyTags.add('资源压力');
                    if (pattern.type === 'defend' || pattern.type === 'buff') ecologyTags.add('续航压力');
                });
                if (enemy.stealLaw || enemy.element || enemy.resistances) ecologyTags.add('构筑针对');
                if (enemy.ecologyLabel) ecologyTags.add(enemy.ecologyLabel);
            });
            if (ecologyTemplates?.formation?.name) ecologyTags.add(ecologyTemplates.formation.name);
            if (eliteCombo?.name) ecologyTags.add(eliteCombo.name);

            let status = 'upcoming';
            let statusLabel = '未来章节';
            const chapterEndRealm = chapterRealm + 2;
            if (realmProgress.clearedRealm >= chapterEndRealm) {
                status = 'cleared';
                statusLabel = '已贯通';
            } else if (chapterIndex === currentChapterIndex) {
                status = 'active';
                statusLabel = '当前章节';
            }

            entries.push({
                id: profile.id,
                chapterIndex,
                name: profile.name,
                fullName: profile.fullName || profile.name,
                icon: profile.icon || '☯️',
                stageLabel: profile.stageLabel || '前段·示章',
                stageDesc: profile.stageDesc || '',
                mechanic: profile.mechanic || '',
                mood: profile.mood || '',
                skyOmen: profile.skyOmen || null,
                leyline: profile.leyline || null,
                focusTags: Array.isArray(profile.focusTags) ? profile.focusTags.slice() : [],
                routePrompt: profile.routePrompt || '',
                bossPrompt: profile.bossPrompt || '',
                recommendedDestinies: Array.isArray(profile.recommendedDestinies) ? profile.recommendedDestinies.slice() : [],
                recommendedSpirits: Array.isArray(profile.recommendedSpirits) ? profile.recommendedSpirits.slice() : [],
                recommendedVows: Array.isArray(profile.recommendedVows) ? profile.recommendedVows.slice() : [],
                realms,
                realmLabel: `第 ${realms[0]}-${realms[2]} 重`,
                status,
                statusLabel,
                enemies,
                bosses,
                ecologyTags: Array.from(ecologyTags).slice(0, 4),
                ecologyTemplates,
                eliteCombo,
                narrativeProfile,
                isCurrent: status === 'active',
                isCleared: status === 'cleared'
            });
        }

        return entries;
    };

    Game.prototype.passesChapterCodexFilter = function (entry) {
        const state = this.getCollectionHubState();
        if (!entry) return false;
        if (state.chapterFocus === 'active' && !entry.isCurrent) return false;
        if (state.chapterFocus === 'cleared' && !entry.isCleared) return false;
        if (state.chapterFocus === 'upcoming' && (entry.isCurrent || entry.isCleared)) return false;
        if (!state.chapterQuery) return true;
        const haystack = [
            entry.id,
            entry.name,
            entry.fullName,
            entry.mechanic,
            entry.mood,
            entry.skyOmen?.name,
            entry.skyOmen?.desc,
            entry.leyline?.name,
            entry.leyline?.desc,
            entry.routePrompt,
            entry.bossPrompt,
            entry.ecologyTemplates?.formation?.name,
            entry.ecologyTemplates?.formation?.desc,
            entry.eliteCombo?.name,
            entry.eliteCombo?.summary,
            entry.narrativeProfile?.summary,
            entry.narrativeProfile?.finaleRecall?.summary,
            ...(entry.narrativeProfile?.beats || []).map((beat) => `${beat?.stage || ''} ${beat?.title || ''} ${beat?.summary || ''}`),
            ...(entry.focusTags || []),
            ...(entry.ecologyTags || []),
            ...entry.enemies.map((enemy) => enemy?.name || ''),
            ...entry.bosses.map((boss) => boss?.name || '')
        ].join(' ').toLowerCase();
        return haystack.includes(state.chapterQuery.toLowerCase());
    };

    Game.prototype.selectChapterCodexEntry = function (chapterId = '') {
        this.selectedChapterCodexId = String(chapterId || '');
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            section: 'chapters'
        });
        this.initCollection();
    };

    Game.prototype.getEnemyAiProfileLabel = function (profile = 'aggressive') {
        switch (profile) {
            case 'control': return '控场型';
            case 'sustain': return '续航型';
            case 'boss_adaptive': return '主宰型';
            case 'aggressive': return '前压型';
            default: return '均衡型';
        }
    };

    Game.prototype.getEnemyThreatTags = function (enemy = null) {
        const tags = new Set();
        const patterns = Array.isArray(enemy?.patterns) ? enemy.patterns : [];
        patterns.forEach((pattern) => {
            if (!pattern) return;
            if (pattern.type === 'attack') tags.add('正面压血');
            if (pattern.type === 'multiAttack') tags.add('连段围猎');
            if (pattern.type === 'debuff') tags.add('状态压制');
            if (pattern.type === 'addStatus') tags.add('污染负担');
            if (pattern.type === 'defend' || pattern.type === 'heal') tags.add('拖回合');
            if (pattern.type === 'buff') tags.add('自我强化');
            if (pattern.type === 'multiAction') tags.add('复合招式');
        });
        if (enemy?.resistances && Object.keys(enemy.resistances).length > 0) tags.add('元素抗性');
        if (enemy?.stealLaw) tags.add('法则掉落');
        if (enemy?.aiProfile === 'control') tags.add('节奏压制');
        if (enemy?.aiProfile === 'sustain') tags.add('阵地拉锯');
        if (enemy?.ecologyLabel) tags.add(`生态·${enemy.ecologyLabel}`);
        return Array.from(tags).slice(0, 5);
    };

    Game.prototype.getEnemyCounterHints = function (enemy = null) {
        const hints = [];
        const patterns = Array.isArray(enemy?.patterns) ? enemy.patterns : [];
        if (patterns.some((pattern) => pattern?.type === 'debuff')) {
            hints.push('优先准备净化、护盾或提前斩杀，别让减益把整回合价值压低。');
        }
        if (patterns.some((pattern) => pattern?.type === 'defend' || pattern?.type === 'heal')) {
            hints.push('破盾、易伤和持续压血更适合拆它的续航节奏。');
        }
        if (patterns.some((pattern) => pattern?.type === 'multiAttack')) {
            hints.push('连段回合前要先立盾或保留减伤，不要把防御留到最后一拍。');
        }
        if (patterns.some((pattern) => pattern?.type === 'addStatus')) {
            hints.push('一旦开始塞入污染牌，后续回合质量会快速下降，最好提前压死或留净化。');
        }
        if (patterns.some((pattern) => pattern?.type === 'multiAction')) {
            hints.push('复合招式通常兼顾压血和控场，看到前摇就要提前分配护盾与输出。');
        }
        if (enemy?.resistances && Object.values(enemy.resistances).some((value) => Number(value) > 0)) {
            hints.push('尽量绕开它的高抗元素，改用中性伤害或不同属性切入。');
        }
        if (hints.length === 0) {
            hints.push('先结合章节地脉判断它是在考输出节奏还是资源容错，再决定换血还是稳手。');
        }
        return hints.slice(0, 3);
    };

    Game.prototype.getEnemyCodexEntries = function () {
        const enemyCatalog = (typeof ENEMIES !== 'undefined' && ENEMIES)
            ? Object.values(ENEMIES).filter((enemy) => enemy && !enemy.isBoss && !enemy.isMinion)
            : [];
        const realmProgress = this.getCollectionRealmProgress();
        const unlockedPeak = Array.isArray(this.unlockedRealms) && this.unlockedRealms.length > 0
            ? Math.max(...this.unlockedRealms.map((realm) => clampInt(realm, 1, 18)))
            : 1;
        const maxReachedRealm = Math.max(
            realmProgress.currentRealm,
            clampInt(this.player?.maxRealmReached || 1, 1, 18),
            unlockedPeak
        );
        const seenEnemyIds = new Set(
            this.getCollectionUnlockHistory(24)
                .filter((entry) => entry.type === 'enemy')
                .map((entry) => entry.itemId)
        );

        return enemyCatalog
            .map((enemy) => {
                const realm = clampInt(enemy.realm || 1, 1, 18);
                const chapter = typeof this.getChapterProfileForRealm === 'function'
                    ? this.getChapterProfileForRealm(realm)
                    : null;
                const isScouted = seenEnemyIds.has(enemy.id) || maxReachedRealm >= realm;
                const isCurrent = realmProgress.currentRealm === realm;
                const isUpcoming = !isScouted;
                const status = isUpcoming ? 'upcoming' : (realmProgress.clearedRealm >= realm ? 'logged' : 'scouted');
                const statusLabel = status === 'logged'
                    ? '已归档'
                    : status === 'scouted'
                        ? '已遭遇'
                        : '未来敌影';
                const elementLabel = enemy.element && typeof this.getLawElementLabel === 'function'
                    ? this.getLawElementLabel(enemy.element)
                    : (enemy.element || '');
                const stealLaw = enemy.stealLaw && typeof LAWS !== 'undefined' && LAWS
                    ? LAWS[enemy.stealLaw] || null
                    : null;
                const resistTags = enemy.resistances
                    ? Object.entries(enemy.resistances)
                        .filter(([, value]) => Number(value))
                        .map(([element, value]) => {
                            const label = typeof this.getLawElementLabel === 'function'
                                ? this.getLawElementLabel(element)
                                : element;
                            return `${Number(value) > 0 ? '抗' : '弱'}${label}${Math.round(Math.abs(Number(value)) * 100)}%`;
                        })
                    : [];
                return {
                    id: enemy.id,
                    name: enemy.name || enemy.id,
                    icon: enemy.icon || '👁️',
                    realm,
                    realmLabel: `第 ${realm} 重 · ${chapter?.name || `第${getChapterIndexForRealm(realm)}章`}`,
                    chapterName: chapter?.name || `第${getChapterIndexForRealm(realm)}章`,
                    chapterFullName: chapter?.fullName || chapter?.name || `第${getChapterIndexForRealm(realm)}章`,
                    status,
                    statusLabel,
                    isScouted,
                    isUpcoming,
                    isCurrent,
                    aiProfile: enemy.aiProfile || 'aggressive',
                    roleLabel: this.getEnemyAiProfileLabel(enemy.aiProfile || 'aggressive'),
                    threatTags: this.getEnemyThreatTags(enemy),
                    counterHints: this.getEnemyCounterHints(enemy),
                    patternPreview: (enemy.patterns || []).slice(0, 4).map((pattern) => this.formatEnemyPatternSummary(pattern)),
                    firstMoveText: this.formatEnemyPatternSummary((enemy.patterns || [])[0]),
                    stealLawName: stealLaw?.name || '',
                    elementLabel,
                    resistTags,
                    ecologyLabel: enemy.ecologyLabel || '',
                    ecologyGroup: enemy.ecologyGroup || '',
                    elitePartnerIds: Array.isArray(enemy.elitePartnerIds) ? enemy.elitePartnerIds.slice(0, 3) : [],
                    ecologyTags: Array.isArray(chapter?.focusTags) ? chapter.focusTags.slice(0, 3) : [],
                    goldText: enemy.gold ? `${clampInt(enemy.gold.min || 0, 0)}-${clampInt(enemy.gold.max || 0, 0)} 灵石` : '掉落未记录'
                };
            })
            .sort((a, b) => a.realm - b.realm || a.name.localeCompare(b.name, 'zh-Hans-CN'));
    };

    Game.prototype.passesEnemyCodexFilter = function (entry) {
        const state = this.getCollectionHubState();
        if (!entry) return false;
        if (state.enemyFocus === 'scouted' && !entry.isScouted) return false;
        if (state.enemyFocus === 'upcoming' && !entry.isUpcoming) return false;
        if (state.enemyFocus === 'control' && entry.aiProfile !== 'control') return false;
        if (!state.enemyQuery) return true;
        const haystack = [
            entry.id,
            entry.name,
            entry.realmLabel,
            entry.chapterName,
            entry.chapterFullName,
            entry.roleLabel,
            entry.firstMoveText,
            entry.stealLawName,
            entry.elementLabel,
            ...(entry.threatTags || []),
            ...(entry.counterHints || []),
            ...(entry.patternPreview || []),
            ...(entry.resistTags || []),
            ...(entry.ecologyTags || []),
            entry.ecologyLabel,
            ...(entry.elitePartnerIds || [])
        ].join(' ').toLowerCase();
        return haystack.includes(state.enemyQuery.toLowerCase());
    };

    Game.prototype.selectEnemyCodexEntry = function (enemyId = '') {
        this.selectedEnemyCodexId = String(enemyId || '');
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            section: 'enemies'
        });
        this.initCollection();
    };

    Game.prototype.resolveBossPressureLabel = function (pressure = 1) {
        const score = Number(pressure) || 1;
        if (score >= 1.55) return '极高压';
        if (score >= 1.35) return '高压';
        if (score >= 1.15) return '偏硬仗';
        return '常规检定';
    };

    Game.prototype.formatEnemyPatternSummary = function (pattern = {}) {
        if (!pattern || typeof pattern !== 'object') return '未知招式';
        switch (pattern.type) {
            case 'attack': return `攻击 ${clampInt(pattern.value || 0, 0)}`;
            case 'multiAttack': return `${clampInt(pattern.count || 1, 1)} 连击 × ${clampInt(pattern.value || 0, 0)}`;
            case 'defend': return `获得 ${clampInt(pattern.value || 0, 0)} 护盾`;
            case 'buff': return `强化 ${pattern.buffType || '状态'} +${clampInt(pattern.value || 0, 0)}`;
            case 'debuff': return `施加 ${pattern.buffType || '负面'} ${clampInt(pattern.value || 0, 0)} 层`;
            default: return pattern.intent || pattern.type || '特殊招式';
        }
    };

    Game.prototype.getBossBreakHint = function (boss = null, mechanic = null) {
        if (boss?.bossSetpiece?.counterWindow) {
            return boss.bossSetpiece.counterWindow;
        }
        const mechanicType = mechanic?.mechanics?.type || '';
        switch (mechanicType) {
            case 'summon': return '优先准备清场或点杀手段，避免召唤物拖长节奏。';
            case 'rage': return '需要尽早压血线，别让力量层数在中后段失控。';
            case 'burn_aura': return '净化、护盾与冰系反制更关键，拖回合会被灼烧蚕食。';
            case 'slow': return '尽量在偶数回合前交完关键牌，别让麻痹断掉核心节奏。';
            case 'gravity': return '提前压低平均费用或保留回能牌，避免高费整回合卡死。';
            case 'reflect': return '分段压血并留足护盾，避免一次性高伤被镜返。';
            case 'chaos': return '依赖低费与通用牌更稳，高费爆发牌要留作收尾。';
            case 'devour': return '更适合快速收束，越拖越容易被放逐与禁疗掐死。';
            default:
                if (boss?.realm >= 13) return '建议提前准备法宝反制与多轴构筑，不要只押单一爆发。';
                return '先确认其章节规则，再决定是抢节奏还是稳血线。';
        }
    };

    Game.prototype.getBossArchiveMemoryProfile = function (boss = null) {
        const bossId = String(boss?.id || '').trim();
        const profileMap = {
            banditLeader: { key: 'seal_card', name: '封签索命' },
            demonWolf: { key: 'siphon_block', name: '撕盾噬血' },
            swordElder: { key: 'seal_card', name: '剑印封诀' },
            danZun: { key: 'tribute_choice', name: '丹火索供' },
            ancientSpirit: { key: 'siphon_block', name: '幽魄吸甲' },
            divineLord: { key: 'tribute_choice', name: '神念索贡' },
            fusionSovereign: { key: 'seal_card', name: '时缚真印' },
            mahayanaSupreme: { key: 'echo_last_card', name: '观心复诵' },
            ascensionSovereign: { key: 'seal_card', name: '天雷封符' },
            dualMagmaGuardians: { key: 'siphon_block', name: '熔甲回铸' },
            stormSummoner: { key: 'tribute_choice', name: '风祀索供' },
            triheadGoldDragon: { key: 'siphon_block', name: '龙首夺壁' },
            mirrorDemon: { key: 'echo_last_card', name: '镜返残响' },
            chaosEye: { key: 'seal_card', name: '邪视封忆' },
            voidDevourer: { key: 'tribute_choice', name: '虚渊索祭' },
            elementalElder: { key: 'echo_last_card', name: '五炁复写' },
            karmaArbiter: { key: 'tribute_choice', name: '业衡索偿' },
            heavenlyDao: { key: 'echo_last_card', name: '天道映照' }
        };
        return profileMap[bossId] || { key: 'seal_card', name: '封识诏令' };
    };

    Game.prototype.resolveRunPathBossArchiveGuidance = function (boss = null, mechanic = null, runPathMeta = null) {
        if (!runPathMeta || typeof this.resolveRunPathBossMatchup !== 'function') return null;
        const memory = typeof this.getBossArchiveMemoryProfile === 'function'
            ? this.getBossArchiveMemoryProfile(boss)
            : null;
        const chapter = typeof this.getChapterProfileForRealm === 'function'
            ? this.getChapterProfileForRealm(boss?.realm || 1)
            : null;
        const resolved = this.resolveRunPathBossMatchup(runPathMeta, {
            enemy: boss,
            enemyId: boss?.id,
            mechanic,
            mechanicType: mechanic?.mechanics?.type,
            memory,
            memoryKey: memory?.key,
            chapter
        });
        if (!resolved) return null;
        return {
            ...resolved,
            memoryKey: memory?.key || '',
            memoryName: memory?.name || '',
            counterText: [
                resolved.fitLabel ? `适配评级 ${resolved.fitLabel}` : '',
                resolved.chapterCue ? `章节场域 ${resolved.chapterCue}` : '',
                resolved.chapterFocus ? `章节补题 ${resolved.chapterFocus}` : '',
                resolved.chapterCounter ? `场域拆法 ${resolved.chapterCounter}` : '',
                resolved.focus,
                resolved.counter,
                resolved.reward ? `收益：${resolved.reward}` : ''
            ].filter(Boolean).join(' ｜ ')
        };
    };

    Game.prototype.getBossArchiveEntries = function () {
        const enemyCatalog = (typeof ENEMIES !== 'undefined' && ENEMIES) ? Object.values(ENEMIES) : [];
        const bossCatalog = enemyCatalog.filter((enemy) => enemy && enemy.isBoss);
        const realmProgress = this.getCollectionRealmProgress();
        const runPathMeta = this.player && typeof this.player.getRunPathMeta === 'function'
            ? this.player.getRunPathMeta()
            : (this.selectedRunPathId && typeof this.getRunPathMetaById === 'function'
                ? this.getRunPathMetaById(this.selectedRunPathId)
                : null);

        return bossCatalog.map((boss) => {
            const mechanic = (typeof BOSS_MECHANICS !== 'undefined' && BOSS_MECHANICS)
                ? BOSS_MECHANICS[boss.id] || null
                : null;
            const chapter = typeof this.getChapterProfileForRealm === 'function'
                ? this.getChapterProfileForRealm(boss.realm || 1)
                : null;
            const counterTreasures = Array.isArray(mechanic?.countersBy)
                ? mechanic.countersBy.map((treasureId) => {
                    const treasure = typeof TREASURES !== 'undefined' && TREASURES ? TREASURES[treasureId] : null;
                    return treasure
                        ? {
                            id: treasureId,
                            name: treasure.name || treasureId,
                            icon: treasure.icon || '🏺'
                        }
                        : {
                            id: treasureId,
                            name: treasureId,
                            icon: '🏺'
                        };
                })
                : [];
            const pressureScore = Number(mechanic?.difficulty?.withoutCounter) || 1;
            const isDefeated = realmProgress.clearedRealm >= clampInt(boss.realm || 1, 1, 18);
            const memoryRecord = typeof this.getBossMemoryRecord === 'function'
                ? this.getBossMemoryRecord(boss.id)
                : { attempts: 0, clears: 0, bestTurn: 0, lastResult: '', lastPlayedAt: 0, firstClearAt: 0 };
            const memoryReady = isDefeated;
            const memoryStatus = !memoryReady
                ? 'hidden'
                : memoryRecord.clears > 0
                    ? 'logged'
                    : memoryRecord.attempts > 0
                        ? 'ready'
                        : 'pending';
            const memoryStatusLabel = !memoryReady
                ? '需先击破'
                : memoryRecord.clears > 0
                    ? '已留痕'
                    : memoryRecord.attempts > 0
                        ? '试作中'
                        : '未演武';
            const memorySummary = !memoryReady
                ? '需先在主线击破本体，伏魔台才会开放这场记忆战。'
                : memoryRecord.clears > 0
                    ? `已完成 ${memoryRecord.clears} 次记忆战，当前最快 ${Math.max(1, memoryRecord.bestTurn || 0)} 回合。`
                    : memoryRecord.attempts > 0
                        ? `已试作 ${memoryRecord.attempts} 次，仍在摸索稳定破局窗口。`
                        : '尚未发起记忆战，可用当前构筑直接检验破局窗口。';
            const actPreview = Array.isArray(boss.phaseConfig)
                ? boss.phaseConfig
                    .map((phase, index) => {
                        const label = phase?.name || `转幕 ${index + 2}`;
                        const threshold = Math.round(Math.max(0, Math.min(1, Number(phase?.threshold) || 0)) * 100);
                        return `${label} · ${threshold}%`;
                    })
                    .filter(Boolean)
                    .slice(0, 2)
                : [];
            const runPathMatchup = runPathMeta && typeof this.resolveRunPathBossArchiveGuidance === 'function'
                ? this.resolveRunPathBossArchiveGuidance(boss, mechanic, runPathMeta)
                : null;
            let sampleBoard = typeof this.buildRunPathBossSampleBoard === 'function'
                ? this.buildRunPathBossSampleBoard({
                    bossId: boss.id,
                    pathId: runPathMeta?.id || '',
                    mutationId: runPathMeta?.mutation?.mutationId || '',
                    limit: 3,
                    sortBy: 'bestTurn'
                })
                : null;
            if ((!sampleBoard || sampleBoard.count <= 0) && typeof this.buildRunPathBossSampleBoard === 'function') {
                sampleBoard = this.buildRunPathBossSampleBoard({
                    bossId: boss.id,
                    limit: 3,
                    sortBy: 'bestTurn'
                });
            }
            return {
                id: boss.id,
                name: boss.name || boss.id,
                icon: boss.icon || '👁️',
                realm: clampInt(boss.realm || 1, 1, 18),
                chapterName: chapter?.name || `第${getChapterIndexForRealm(boss.realm || 1)}章`,
                chapterFullName: chapter?.fullName || chapter?.name || `第${getChapterIndexForRealm(boss.realm || 1)}章`,
                pressureScore,
                pressureLabel: this.resolveBossPressureLabel(pressureScore),
                status: isDefeated ? 'defeated' : 'pending',
                statusLabel: isDefeated ? '已击破' : '待挑战',
                mechanicText: mechanic?.mechanics?.description || '暂无额外机制记录。',
                counterTreasures,
                patternPreview: (boss.patterns || []).slice(0, 4).map((pattern) => this.formatEnemyPatternSummary(pattern)),
                breakHint: this.getBossBreakHint(boss, mechanic),
                openingStance: boss?.bossSetpiece?.openingStance || '',
                counterWindow: boss?.bossSetpiece?.counterWindow || '',
                finisher: boss?.bossSetpiece?.finisher || '',
                visualCue: boss?.bossSetpiece?.visualCue || '',
                actPreview,
                bossPrompt: chapter?.bossPrompt || '',
                withoutCounter: Number(mechanic?.difficulty?.withoutCounter) || 1,
                withCounter: Number(mechanic?.difficulty?.withCounter) || 1,
                memoryReady,
                memoryRecord,
                memoryStatus,
                memoryStatusLabel,
                memorySummary,
                runPathId: runPathMeta?.id || '',
                runPathName: runPathMeta?.name || '',
                runPathMatchup,
                runPathFit: runPathMatchup?.fit || '',
                runPathFitLabel: runPathMatchup?.fitLabel || '',
                runPathCounterText: runPathMatchup?.counterText || '',
                sampleBoard,
                sampleCount: sampleBoard?.count || 0
            };
        });
    };

    Game.prototype.passesBossArchiveFilter = function (entry) {
        const state = this.getCollectionHubState();
        if (!entry) return false;
        if (state.bossFocus === 'defeated' && entry.status !== 'defeated') return false;
        if (state.bossFocus === 'pending' && entry.status !== 'pending') return false;
        if (state.bossFocus === 'highpressure' && entry.pressureScore < 1.45) return false;
        if (!state.bossQuery) return true;
        const haystack = [
            entry.id,
            entry.name,
            entry.chapterName,
            entry.chapterFullName,
            entry.mechanicText,
            entry.breakHint,
            entry.openingStance,
            entry.counterWindow,
            entry.finisher,
            entry.visualCue,
            entry.bossPrompt,
            entry.runPathName,
            entry.runPathFitLabel,
            entry.runPathCounterText,
            entry.memoryStatusLabel,
            entry.memorySummary,
            ...(entry.sampleBoard?.entries || []).map((sample) => `${sample.headline} ${sample.subtitle} ${(sample.tagLine || []).join(' ')}`),
            ...entry.counterTreasures.map((item) => item.name),
            ...(entry.patternPreview || []),
            ...(entry.actPreview || [])
        ].join(' ').toLowerCase();
        return haystack.includes(state.bossQuery.toLowerCase());
    };

    Game.prototype.selectBossArchiveEntry = function (bossId = '') {
        this.selectedBossArchiveId = String(bossId || '');
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            section: 'bosses'
        });
        this.initCollection();
    };

    Game.prototype.getRunSlateShelfEntries = function () {
        this.ensureCollectionHubBootState();
        const archive = Array.isArray(this.runSlateArchive) ? this.runSlateArchive.slice() : [];
        const activeTrainingFocus = typeof this.getObservatoryTrainingFocus === 'function'
            ? this.getObservatoryTrainingFocus()
            : null;
        return archive
            .filter((entry) => entry && typeof entry === 'object' && entry.id)
            .map((entry, index) => {
                const answerReviewSource = entry.answerReview && typeof entry.answerReview === 'object'
                    ? entry.answerReview
                    : null;
                const answerReview = answerReviewSource
                    ? {
                        title: String(answerReviewSource.title || '章节观星回响'),
                        topicTitle: String(answerReviewSource.topicTitle || ''),
                        ratingLabel: String(answerReviewSource.ratingLabel || ''),
                        ratingTone: normalizeRatingTone(answerReviewSource.ratingTone),
                        overviewLine: String(answerReviewSource.overviewLine || ''),
                        highlightLine: String(answerReviewSource.highlightLine || ''),
                        trainingAdvice: String(answerReviewSource.trainingAdvice || ''),
                        goalHighlights: toStringArray(answerReviewSource.goalHighlights, 3),
                        tags: toStringArray(answerReviewSource.tags, 4)
                    }
                    : null;
                const trainingFocus = typeof this.buildObservatoryTrainingFocusFromSlate === 'function'
                    ? this.buildObservatoryTrainingFocusFromSlate(entry)
                    : null;
                const themeKey = String(
                    trainingFocus?.themeKey
                    || extractTagValue(entry.tags, '课题·')
                    || extractTagValue(entry.tags, '观星·')
                    || ''
                ).trim();
                const themeLabel = String(
                    trainingFocus?.themeLabel
                    || extractTagValue(entry.tags, '课题·')
                    || extractTagValue(entry.tags, '观星·')
                    || ''
                ).trim();
                const ratingLabel = String(answerReview?.ratingLabel || trainingFocus?.ratingLabel || '待复盘').trim() || '待复盘';
                const ratingTone = normalizeRatingTone(answerReview?.ratingTone || trainingFocus?.ratingTone || (answerReview?.trainingAdvice ? 'selected' : 'idle'));
                const trainingAdvice = String(
                    trainingFocus?.trainingAdvice
                    || answerReview?.trainingAdvice
                    || extractTagValue(entry.scoreBreakdown, '训练建议：')
                    || ''
                ).trim();
                const highlightLine = String(
                    trainingFocus?.highlightLine
                    || answerReview?.highlightLine
                    || answerReview?.overviewLine
                    || extractTagValue(entry.scoreBreakdown, '回响结论：')
                    || ''
                ).trim();
                const routeFocusLine = String(
                    trainingFocus?.routeFocusLine
                    || extractTagValue(entry.scoreBreakdown, '样本路径：')
                    || ''
                ).trim();
                const sourceTitle = String(
                    trainingFocus?.sourceTitle
                    || answerReview?.topicTitle
                    || extractTagValue(entry.scoreBreakdown, '课题样本：')
                    || extractTagValue(entry.scoreBreakdown, '观星线索：')
                    || ''
                ).trim();
                const goalHighlights = toStringArray(
                    trainingFocus?.goalHighlights && trainingFocus.goalHighlights.length > 0
                        ? trainingFocus.goalHighlights
                        : answerReview?.goalHighlights,
                    3
                );
                const trainingTags = (() => {
                    const focusTags = toStringArray(trainingFocus?.trainingTags, 4);
                    if (focusTags.length > 0) return focusTags;
                    return entry.tags
                        .filter((tag) => String(tag || '').startsWith('训练·'))
                        .map((tag) => String(tag || '').replace(/^训练·/, '').trim())
                        .filter(Boolean)
                        .slice(0, 4);
                })();
                const summaryTags = [...new Set([
                    ...toStringArray(entry.tags, 6),
                    ...toStringArray(answerReview?.tags, 4)
                ])].slice(0, 8);
                const factionLine = toStringArray(entry.factionSummary, 3).join(' / ');
                const bountyLine = toStringArray(entry.bountyNames, 3).join(' / ');
                const isActiveTraining = String(activeTrainingFocus?.sourceRunId || '') === String(entry.id || '');
                return {
                    id: String(entry.id || ''),
                    order: index,
                    chapterIndex: clampInt(entry.chapterIndex || index + 1, 1, 6),
                    chapterName: String(entry.chapterName || `第${index + 1}章`),
                    endingName: String(entry.endingName || '待归卷'),
                    endingIcon: String(entry.endingIcon || '🧭'),
                    score: clampInt(entry.score || 0, 0, 9999),
                    scoreBreakdown: toStringArray(entry.scoreBreakdown, 8),
                    branchName: String(entry.branchName || '未锁定支线'),
                    bountyNames: toStringArray(entry.bountyNames, 4),
                    bountyLine,
                    factionSummary: toStringArray(entry.factionSummary, 4),
                    factionLine,
                    nemesisName: String(entry.nemesisName || ''),
                    nemesisStatusLabel: String(entry.nemesisStatusLabel || ''),
                    nemesisVariantLabel: String(entry.nemesisVariantLabel || ''),
                    nemesisFactionName: String(entry.nemesisFactionName || ''),
                    nemesisClueLine: String(entry.nemesisClueLine || ''),
                    themeKey,
                    themeLabel,
                    ratingLabel,
                    ratingTone,
                    trainingAdvice,
                    highlightLine,
                    routeFocusLine,
                    compareHint: String(trainingFocus?.compareHint || '').trim(),
                    sourceTitle,
                    goalHighlights,
                    trainingTags,
                    tags: summaryTags,
                    answerReview,
                    currentTraining: isActiveTraining,
                    trainingReady: !!trainingAdvice,
                    focusGuideRecordId: String(trainingFocus?.guideRecordId || ''),
                    timestamp: clampInt(entry.timestamp || 0, 0),
                    timestampLabel: this.formatCollectionTimestamp(entry.timestamp || 0),
                    rawEntry: entry
                };
            });
    };

    Game.prototype.getRunSlateShelfEntryById = function (runId = '') {
        const safeRunId = String(runId || '').trim();
        return this.getRunSlateShelfEntries().find((entry) => entry.id === safeRunId) || null;
    };

    Game.prototype.passesRunSlateShelfFilter = function (entry) {
        const state = this.getCollectionHubState();
        if (!entry) return false;
        if (state.slateTheme !== 'all' && entry.themeKey !== state.slateTheme) return false;
        if (state.slateChapter !== 'all' && String(entry.chapterIndex) !== String(state.slateChapter)) return false;
        if (state.slateRating !== 'all' && entry.ratingLabel !== state.slateRating) return false;
        return true;
    };

    Game.prototype.selectRunSlateShelfEntry = function (runId = '') {
        this.selectedRunSlateId = String(runId || '');
        this.collectionHubState = this.normalizeCollectionHubState({
            ...this.getCollectionHubState(),
            section: 'slates'
        });
        this.initCollection();
    };

    Game.prototype.applyRunSlateShelfTrainingFocus = function (runId = '', options = {}) {
        const safeRunId = String(runId || '').trim();
        const entry = this.getRunSlateShelfEntryById(safeRunId);
        if (!entry || !entry.trainingReady) return null;
        if (typeof this.buildObservatoryTrainingFocusFromSlate !== 'function' || typeof this.setObservatoryTrainingFocus !== 'function') {
            return null;
        }
        const slate = (Array.isArray(this.runSlateArchive) ? this.runSlateArchive : []).find((item) => String(item?.id || '') === safeRunId) || entry.rawEntry;
        const focus = this.buildObservatoryTrainingFocusFromSlate(slate);
        if (!focus) return null;
        const nextFocus = this.setObservatoryTrainingFocus(focus, { silent: true });
        if (!options?.silent && typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
            Utils.showBattleLog(`已将 ${entry.chapterName} 的归卷答卷设为当前主练参考。`);
        }
        if (this.currentScreen === 'collection' && this.getCollectionHubState().section === 'slates') {
            this.initCollection();
        }
        return nextFocus;
    };

    Game.prototype.reviewRunSlateInObservatory = function (runId = '', tab = '') {
        const safeTab = ['daily', 'weekly', 'global'].includes(String(tab || this.challengeHubState?.tab || ''))
            ? String(tab || this.challengeHubState?.tab || '')
            : 'daily';
        const focus = this.applyRunSlateShelfTrainingFocus(runId, { silent: true });
        if (typeof this.showChallengeHub === 'function') {
            this.showChallengeHub(safeTab);
        }
        if (focus && typeof this.applyObservatoryTrainingFocus === 'function') {
            this.applyObservatoryTrainingFocus(safeTab);
        }
        return !!focus;
    };

    Game.prototype.getBuildSnapshotData = function () {
        const profile = typeof this.buildPlayerDeckProfile === 'function'
            ? this.buildPlayerDeckProfile()
            : {
                size: 0,
                counts: { attack: 0, defense: 0, law: 0, chance: 0, energy: 0, other: 0 },
                lawTypeCounts: {},
                dominantType: 'other',
                dominantLawType: '',
                avgCost: 0,
                ratio: () => 0
            };
        const destiny = this.player && typeof this.player.getRunDestinyMeta === 'function'
            ? this.player.getRunDestinyMeta()
            : null;
        const spirit = this.player && typeof this.player.getSpiritCompanionMeta === 'function'
            ? this.player.getSpiritCompanionMeta()
            : null;
        const runPath = this.player && typeof this.player.getRunPathMeta === 'function'
            ? this.player.getRunPathMeta()
            : (this.selectedRunPathId && typeof this.getRunPathMetaById === 'function'
                ? this.getRunPathMetaById(this.selectedRunPathId)
                : null);
        const runPathRecord = runPath && typeof this.getRunPathRecord === 'function'
            ? this.getRunPathRecord(runPath.id)
            : null;
        let runPathSampleBoard = typeof this.buildRunPathBossSampleBoard === 'function' && runPath?.mutation?.mutationId
            ? this.buildRunPathBossSampleBoard({
                pathId: runPath.id,
                mutationId: runPath.mutation.mutationId,
                limit: 3,
                sortBy: 'recent'
            })
            : null;
        if ((!runPathSampleBoard || runPathSampleBoard.count <= 0) && typeof this.buildRunPathBossSampleBoard === 'function') {
            runPathSampleBoard = this.buildRunPathBossSampleBoard({
                pathId: runPath?.id || '',
                limit: 3,
                sortBy: 'recent'
            });
        }
        const runPathSampleRecommendation = runPathSampleBoard && runPathSampleBoard.recommendation && typeof runPathSampleBoard.recommendation === 'object'
            ? runPathSampleBoard.recommendation
            : null;
        const currentCharacterMeta = getCharacterMeta(this.player?.characterId || '');
        const vows = this.player && typeof this.player.getRunVowMetas === 'function'
            ? this.player.getRunVowMetas()
            : [];
        const loadedLawIds = this.player?.fateRing && typeof this.player.fateRing.getSocketedLaws === 'function'
            ? this.player.fateRing.getSocketedLaws()
            : [];
        const loadedLaws = loadedLawIds.map((lawId) => (typeof LAWS !== 'undefined' && LAWS ? LAWS[lawId] : null)).filter(Boolean);
        const equippedTreasures = Array.isArray(this.player?.equippedTreasures) ? this.player.equippedTreasures : [];
        const workshopSnapshot = this.player && typeof this.player.getTreasureWorkshopSnapshot === 'function'
            ? this.player.getTreasureWorkshopSnapshot('equipped')
            : [];
        const chapter = typeof this.getChapterDisplaySnapshot === 'function'
            ? this.getChapterDisplaySnapshot(this.player?.realm || 1)
            : null;
        const currentChapterIndex = clampInt(
            chapter?.chapterIndex || Math.floor((Math.max(1, clampInt(this.player?.realm || 1, 1, 18)) - 1) / 3) + 1,
            1,
            6
        );
        const nextChapter = currentChapterIndex < 6 && typeof this.getChapterDisplaySnapshot === 'function'
            ? this.getChapterDisplaySnapshot(currentChapterIndex * 3 + 1)
            : null;
        const stats = this.achievementSystem?.stats || {};
        const encounter = typeof this.ensureEncounterState === 'function'
            ? (this.ensureEncounterState() || {})
            : {};
        const endless = typeof this.ensureEndlessState === 'function'
            ? (this.ensureEndlessState() || {})
            : {};
        const lineage = typeof this.getFateLineageSnapshot === 'function'
            ? this.getFateLineageSnapshot()
            : null;
        const aftereffects = typeof this.getFateAftereffectSnapshot === 'function'
            ? this.getFateAftereffectSnapshot()
            : null;
        const latestSlate = typeof this.getLatestRunSlate === 'function'
            ? this.getLatestRunSlate()
            : null;
        const seasonBoard = typeof this.getSeasonBoardSnapshot === 'function'
            ? this.getSeasonBoardSnapshot(latestSlate ? { latestSlate } : {})
            : null;
        const seasonSettlement = seasonBoard?.settlement && typeof seasonBoard.settlement === 'object'
            ? seasonBoard.settlement
            : null;
        const seasonDebtPack = seasonBoard?.debtPack && typeof seasonBoard.debtPack === 'object'
            ? seasonBoard.debtPack
            : null;
        const shouldSurfaceSeasonVerification = shouldSurfaceSeasonBoardVerification(seasonBoard, seasonSettlement);
        const seasonVerificationOrders = shouldSurfaceSeasonVerification && Array.isArray(seasonBoard?.verificationOrders)
            ? seasonBoard.verificationOrders.filter((entry) => entry && typeof entry === 'object')
            : [];
        const seasonVerificationOrderPair = getSeasonBoardVerificationOrderPair(seasonVerificationOrders);
        const primarySeasonVerification = seasonVerificationOrderPair.primary;
        const secondarySeasonVerification = seasonVerificationOrderPair.secondary;
        const seasonNextTask = seasonBoard?.nextTask && typeof seasonBoard.nextTask === 'object'
            ? seasonBoard.nextTask
            : null;
        const seasonNextTaskLine = !shouldSurfaceSeasonVerification && seasonNextTask
            ? getSeasonBoardNextTaskLine(seasonNextTask)
            : '';
        const seasonBoardBuildTargetLine = seasonBoard
            ? (
                seasonNextTaskLine
                    ? (seasonBoard.statusLine || seasonBoard.summaryLine || seasonBoard.guideLine || '继续补齐本周主轴。')
                    : (seasonBoard.guideLine || seasonBoard.statusLine || seasonBoard.summaryLine || '继续补齐本周主轴。')
            )
            : '';

        const dominantTypeLabels = {
            attack: '攻势抢拍',
            defense: '护阵拖线',
            law: '法则编织',
            chance: '机缘爆发',
            energy: '回能调度',
            other: '混成试作'
        };
        const dominantLabel = dominantTypeLabels[profile.dominantType] || '混成试作';
        const dominantLawLabel = profile.dominantLawType ? `${this.getLawElementLabel(profile.dominantLawType)}链` : '未定法则链';

        const strengths = [];
        if (profile.ratio('attack') >= 0.32) strengths.push('攻击牌占比高，适合在章节前中段主动抢拍。');
        if (profile.ratio('defense') >= 0.24) strengths.push('防御密度稳定，更容易把危险回合拖成可控回合。');
        if (profile.ratio('law') >= 0.18 || loadedLaws.length >= 2) strengths.push('命环与法则联动已经成形，适合围绕共鸣继续补件。');
        if (runPath) strengths.push(`当前命途【${runPath.name}】会把本轮主线导向「${splitKeywords(runPath.playstyle || runPath.routeHint || runPath.description || '', 2).join(' / ') || runPath.category}」。`);
        if (runPath?.mutation) strengths.push(`命途裂变已锁定【${runPath.mutation.branchLabel || '裂变'}·${runPath.mutation.name}】，当前中盘会更偏向「${splitKeywords(runPath.mutation.playstyle || runPath.mutation.routeHint || runPath.mutation.summary || '', 2).join(' / ') || '转职推进'}」。`);
        if (spirit) strengths.push(`当前灵契【${spirit.name}】能把构筑重心推向「${splitKeywords(spirit.playstyle || spirit.summary || '', 2).join(' / ') || spirit.tierLabel}」。`);
        if (runPathRecord?.clears > 0) strengths.push(`洞府已收录 ${runPathRecord.clears} 份【${runPath.name}】战录，可直接复盘这条命途的推荐套装与 Boss 读法。`);
        if (runPathSampleBoard?.count > 0) strengths.push(`样本对照榜已沉淀 ${runPathSampleBoard.count} 份「角色 × 命途 × Boss」实战样本，可直接比较谁更适合这条路线以及哪位 Boss 最容易收官。`);
        if (runPathSampleRecommendation?.character?.name) {
            strengths.push(`样本推荐角色当前落在【${runPathSampleRecommendation.character.name}】侧，复刻这条角色模板更容易快速稳定收官。`);
        }
        if (Array.isArray(runPathSampleRecommendation?.sets) && runPathSampleRecommendation.sets.length > 0) {
            strengths.push(`样本推荐套装为 ${runPathSampleRecommendation.sets.map((item) => item.label || item.id).join(' / ')}，可优先围绕这一组继续补件。`);
        }
        if (runPathSampleRecommendation?.chapter?.name) {
            strengths.push(`样本章节适配落在【${runPathSampleRecommendation.chapter.name}】（场域拟合分 ${clampInt(runPathSampleRecommendation.chapter.fitScore || 0, 0, 100)}），复盘该章模板更容易还原稳定收官。`);
        }
        if (lineage?.available && lineage.summaryLine) {
            strengths.push(`命盘谱系：${lineage.summaryLine}`);
        }
        if (aftereffects?.available && aftereffects.primary?.positiveLine) {
            strengths.push(`界痕后效：${aftereffects.primary.positiveLine}`);
        }
        if (seasonBoard?.summaryLine) {
            strengths.unshift(`赛季天道盘当前围绕【${seasonBoard.themeLabel || '本周主轴'}】推进，处于「${seasonBoard.phaseLabel || '采样期'}」。`);
            if (seasonBoard.crossModeSummary) {
                strengths.push(`赛季验算：${seasonBoard.crossModeSummary}`);
            }
        }
        if (seasonSettlement?.outcomeId === 'positive_sheet') {
            strengths.unshift(`赛季押卷：${seasonSettlement.summaryLine || `${seasonSettlement.outcomeLabel || '正卷'} 已经落档，可把当前主练当成可经营主轴继续放大。`}`);
            if (seasonSettlement.contractResolutionLine) {
                strengths.push(`押卷回执：${seasonSettlement.contractResolutionLine}`);
            }
        }
        if (workshopSnapshot.some((item) => item?.setEcho || item?.spiritBond)) strengths.push('炼器坊改造已接入战斗，法宝正在从单卡转向体系增幅。');
        if (strengths.length === 0) strengths.push('当前仍处于早期试作阶段，优势更多来自角色基础盘而非完整体系。');

        const nextChapterRiskTags = Array.from(new Set([
            nextChapter?.dangerProfile?.dominantLabel ? `下一章高危：${nextChapter.dangerProfile.dominantLabel}` : '',
            nextChapter?.dangerProfile?.tierLabel ? `${nextChapter.dangerProfile.tierLabel}压力` : '',
            ...(Array.isArray(nextChapter?.focusTags) ? nextChapter.focusTags.slice(0, 2).map((tag) => `高危·${tag}`) : [])
        ].filter(Boolean))).slice(0, 4);

        const gaps = [];
        if (profile.avgCost >= 1.9 && profile.ratio('energy') < 0.1) gaps.push('平均费用偏高，但回能牌偏少，容易在高压章吃到断档。');
        if (profile.ratio('defense') < 0.16) gaps.push('护阵密度偏低，遇到连击或章节灼烧时容错有限。');
        if (loadedLaws.length <= 1) gaps.push('命环槽位利用率偏低，还没有形成足够稳定的法则协同。');
        if (!runPath) gaps.push('尚未挂接命途主线，局内目标更容易退回到“泛泛变强”。');
        if (!spirit) gaps.push('尚未挂接灵契，部分中后段章节会缺少关键的护道被动。');
        if (equippedTreasures.length <= 1) gaps.push('法宝位利用不足，缺少对 Boss 机制和章节规则的额外兜底。');
        if (aftereffects?.available && aftereffects.primary?.negativeLine) gaps.unshift(`契约后效：${aftereffects.primary.negativeLine}`);
        if (seasonDebtPack?.summaryLine) {
            gaps.unshift(`研究债账包：${seasonDebtPack.summaryLine}`);
        } else if (seasonSettlement?.outcomeId === 'debt_sheet') {
            gaps.unshift(`季押卷已转欠卷：${seasonSettlement.detailLine || seasonSettlement.summaryLine || seasonSettlement.guideLine || '这周主练还没有结成正卷，先把欠账清回可验证状态。'}`);
        } else if (seasonSettlement?.outcomeId === 'risky_sheet') {
            gaps.unshift(`季押卷仍属险卷：${seasonSettlement.detailLine || seasonSettlement.summaryLine || seasonSettlement.guideLine || '还需要再补一条外场验证，避免只在单章里成立。'}`);
        }
        if (gaps.length === 0) gaps.push('当前主要缺口不在面板，而在路线执行与资源调度的精度。');

        let sampleMismatchWarning = null;
        if (runPathSampleRecommendation?.chapter?.name) {
            const fitScore = clampInt(runPathSampleRecommendation.chapter.fitScore || 0, 0, 100);
            const sampleChapterName = runPathSampleRecommendation.chapter.name;
            const currentChapterName = runPathSampleRecommendation.chapter.targetName || chapter?.name || '';
            if (currentChapterName && sampleChapterName && sampleChapterName !== currentChapterName && fitScore < 70) {
                sampleMismatchWarning = {
                    title: '误配告警',
                    text: `当前构筑正在【${currentChapterName}】硬扛，但样本主场是【${sampleChapterName}】，场域拟合分只有 ${fitScore}。若继续平均补件，会显著放大误配风险。`
                };
                gaps.unshift(`样本主场与当前章节错位（${currentChapterName} → ${sampleChapterName}），当前场域拟合分仅 ${fitScore}。`);
            }
        }

        const nextTargets = [];
        if (chapter?.routePrompt) nextTargets.push(`章节路线：${chapter.routePrompt}`);
        if (runPath?.mutation) nextTargets.push(`命途裂变：${runPath.mutation.branchLabel || '裂变'}·${runPath.mutation.name} 已生效，后续可优先走 ${runPath.mutation.routeHint || runPath.routeHint || '适配节点'}。`);
        if (chapter && !chapter.spiritRecommended && chapter.recommendedSpirits?.[0]) {
            nextTargets.push(`灵契补位：${chapter.recommendedSpirits[0].name} 更贴近当前章节要求。`);
        }
        if (chapter && !chapter.destinyRecommended && chapter.recommendedDestinies?.[0]) {
            nextTargets.push(`命格参考：${chapter.recommendedDestinies[0].name} 更适合这章的世界规则。`);
        }
        if (runPath && runPathRecord?.clears <= 0) {
            nextTargets.push(`命途碑廊：完成当前【${runPath.name}】后，可把「${runPath.completionRecord?.name || `${runPath.name}战录`}」收入洞府长期档案。`);
        } else if (runPath && runPathRecord?.clears > 0) {
            nextTargets.push(`命途碑廊：${runPath.name} 已累计完成 ${runPathRecord.clears} 次，最近样本可反推角色、套装与 Boss 收官节奏。`);
        }
        if (runPath && (!runPathSampleBoard || runPathSampleBoard.count <= 0)) {
            nextTargets.push(`样本对照：带当前【${runPath.name}】去击破一位章节 Boss，才能把角色、裂变方向与收官轮次压进对照榜。`);
        } else if (runPathSampleBoard?.count > 0 && runPathSampleBoard.latestSample) {
            nextTargets.push(`样本对照：最近一份是 ${runPathSampleBoard.latestSample.characterName} 对 ${runPathSampleBoard.latestSample.bossName} 的 ${runPathSampleBoard.latestSample.turns > 0 ? `${runPathSampleBoard.latestSample.turns} 回合` : '主线'} 收官，可继续压更快轮次。`);
        }
        if (runPathSampleRecommendation?.character?.name && currentCharacterMeta?.name && runPathSampleRecommendation.character.name !== currentCharacterMeta.name) {
            nextTargets.push(`样本换轴：若当前卡手，可切到【${runPathSampleRecommendation.character.name}】复刻同命途样本，先把收官模板跑通。`);
        }
        if (runPathSampleRecommendation?.mutation?.label && !runPath?.mutation) {
            nextTargets.push(`裂变参考：样本命中最高的是 ${runPathSampleRecommendation.mutation.label}，可在中盘裂变弹窗优先尝试该方向。`);
        }
        if (runPathSampleRecommendation?.boss?.name && runPathSampleRecommendation.boss.bestTurn > 0) {
            nextTargets.push(`样本目标：先把 ${runPathSampleRecommendation.boss.name} 压到 ${runPathSampleRecommendation.boss.bestTurn} 回合，再回头抬高其它主宰的稳定率。`);
        }
        if (lineage?.currentFocusLine) {
            nextTargets.unshift(`谱系校准：${lineage.currentFocusLine}`);
        } else if (lineage?.nextTargets?.[0]) {
            nextTargets.unshift(`谱系推进：${lineage.nextTargets[0]}`);
        }
        if (seasonNextTaskLine) {
            nextTargets.unshift(`季盘推进：${seasonNextTaskLine}`);
        }
        if (secondarySeasonVerification) {
            nextTargets.unshift(`旁验证：${secondarySeasonVerification.summaryLine || secondarySeasonVerification.hintLine || secondarySeasonVerification.statusLine || '补一张不同节奏的旁验证，避免本周押卷只有单一路线证明。'}`);
        }
        if (primarySeasonVerification) {
            nextTargets.unshift(`结业验证：${primarySeasonVerification.summaryLine || primarySeasonVerification.hintLine || primarySeasonVerification.statusLine || '优先补一条外场验证，让本周押卷不只停留在章节内。'}`);
        }
        if (seasonDebtPack) {
            nextTargets.unshift(`债账回流：${seasonDebtPack.guideLine || seasonDebtPack.progressText || seasonDebtPack.settleWindowText || seasonDebtPack.summaryLine || '优先把欠卷清回可验证状态。'}`);
        }
        if (seasonBoard) {
            nextTargets.unshift(`赛季天道盘：${seasonBoardBuildTargetLine}`);
        }
        if (aftereffects?.available && aftereffects.currentStatusLine) {
            nextTargets.unshift(`界痕抉择：${aftereffects.currentStatusLine}`);
        } else if (aftereffects?.available && aftereffects.guideLine) {
            nextTargets.unshift(`界痕抉择：${aftereffects.guideLine}`);
        }
        if (runPathSampleRecommendation?.chapter?.name) {
            const fitScore = clampInt(runPathSampleRecommendation.chapter.fitScore || 0, 0, 100);
            const sampleChapterName = runPathSampleRecommendation.chapter.name;
            const currentChapterName = runPathSampleRecommendation.chapter.targetName || chapter?.name || '';
            if (currentChapterName && sampleChapterName && sampleChapterName !== currentChapterName && fitScore < 70) {
                nextTargets.push(`章节适配：当前章节 ${currentChapterName} 与样本主场 ${sampleChapterName} 有偏差，先回到该章补样本，把场域拟合分拉到 70+。`);
            } else {
                nextTargets.push(`章节适配：围绕 ${sampleChapterName} 继续压样本轮次，当前场域拟合分 ${fitScore}，目标 85+。`);
            }
        }
        if (loadedLaws.length < 2 && Array.isArray(this.player?.collectedLaws) && this.player.collectedLaws.length > loadedLaws.length) {
            nextTargets.push('命环装配：已掌握法则多于当前装配数量，优先补命环而不是继续扩卡。');
        }
        if (equippedTreasures.length < 2) nextTargets.push('法宝补件：优先找能补生存或反制章节机制的法宝。');
        if (nextTargets.length === 0) nextTargets.push('当前体系已进入打磨期，重点转向章节路线和 Boss 出题适配。');

        const priorityQueue = [];
        const pushPriority = (label, detail) => {
            if (!label || !detail || priorityQueue.some((entry) => entry.label === label)) return;
            priorityQueue.push({ label, detail });
        };
        if (sampleMismatchWarning) {
            pushPriority('回章纠偏', sampleMismatchWarning.text.replace('误配风险。', '先回到样本主场把拟合分拉回 70+。'));
        } else if (runPathSampleRecommendation?.chapter?.name) {
            pushPriority('章节适配', `优先围绕【${runPathSampleRecommendation.chapter.name}】的场域答案补件，把拟合分压到 85+。`);
        }
        if (seasonDebtPack?.guideLine || seasonDebtPack?.summaryLine) {
            pushPriority('清债账', seasonDebtPack.guideLine || seasonDebtPack.summaryLine);
        } else if (seasonSettlement?.outcomeId === 'risky_sheet' && primarySeasonVerification) {
            pushPriority('补验证', primarySeasonVerification.summaryLine || primarySeasonVerification.hintLine || primarySeasonVerification.statusLine || '先补一条外场验证，再决定是否继续放大当前押卷。');
        } else if (seasonNextTaskLine) {
            pushPriority('季盘推进', seasonNextTaskLine);
        }
        if (loadedLaws.length < 2 && Array.isArray(this.player?.collectedLaws) && this.player.collectedLaws.length > loadedLaws.length) {
            pushPriority('补命环', '先把已掌握法则装进命环，不要在命环未满前继续平均扩卡。');
        } else if (Array.isArray(runPathSampleRecommendation?.sets) && runPathSampleRecommendation.sets.length > 0) {
            pushPriority('补套装', `优先围绕 ${runPathSampleRecommendation.sets.map((item) => item.label || item.id).join(' / ')} 凑出成型阈值。`);
        }
        if (equippedTreasures.length < 2) {
            pushPriority('补法宝', '先补一件能扛章节机制的法宝，再考虑上限件。');
        } else if (chapter && !chapter.spiritRecommended && chapter.recommendedSpirits?.[0]) {
            pushPriority('补灵契', `下一步优先把灵契调整到【${chapter.recommendedSpirits[0].name}】附近，别让护道断档。`);
        }
        if (runPathSampleRecommendation?.boss?.name && runPathSampleRecommendation.boss.bestTurn > 0) {
            pushPriority('压样本轮次', `收官前优先把 ${runPathSampleRecommendation.boss.name} 压到 ${runPathSampleRecommendation.boss.bestTurn} 回合模板。`);
        }
        const buildPriorityQueue = priorityQueue
            .slice(0, 3)
            .map((entry, index) => ({
                rank: index + 1,
                label: entry.label,
                detail: entry.detail
            }));

        return {
            archetypeLabel: `${dominantLabel} · ${dominantLawLabel}`,
            profile,
            destiny,
            spirit,
            runPath,
            runPathRecord,
            runPathSampleBoard,
            runPathSampleRecommendation,
            seasonBoard,
            lineage,
            aftereffects,
            completedRunPaths: typeof this.getCompletedRunPathCount === 'function' ? this.getCompletedRunPathCount() : 0,
            totalRunPaths: typeof this.getRunPathCatalog === 'function' ? this.getRunPathCatalog().length : 0,
            vows,
            loadedLaws,
            equippedTreasures,
            workshopSnapshot,
            chapter,
            nextChapter,
            nextChapterRiskTags,
            sampleMismatchWarning,
            priorityQueue: buildPriorityQueue,
            strengths,
            gaps,
            nextTargets,
            highlights: [
                { label: '最高连击', value: clampInt(stats.maxCombo || 0, 0), note: '来自全局成就统计' },
                { label: '单次最高伤害', value: clampInt(stats.singleDamage || 0, 0), note: '当前账号历史高光' },
                { label: '已击破 Boss', value: clampInt(stats.bossesDefeated || 0, 0), note: '当前账号累计' },
                { label: '遭遇连胜', value: clampInt(encounter.maxStreak || 0, 0), note: '遭遇主题最佳连胜段' },
                { label: '无尽已清轮次', value: clampInt(endless.clearedCycles || 0, 0), note: '无尽轮回进度' },
                { label: '最高通关重数', value: clampInt(stats.realmCleared || 0, 0), note: '章节推进里程碑' }
            ]
        };
    };

    Game.prototype.getSanctumOverviewData = function () {
        const progress = this.getCollectionProgressSnapshot();
        const buildSnapshot = this.getBuildSnapshotData();
        const agendaDashboard = typeof this.getSanctumAgendaDashboard === 'function'
            ? this.getSanctumAgendaDashboard()
            : {
                active: null,
                lastResolved: null,
                candidates: [],
                completedCount: 0,
                failedCount: 0,
                source: { ready: false }
            };
        const currentSpirit = buildSnapshot.spirit;
        const latestRunPathRecord = typeof this.getLatestRunPathRecord === 'function'
            ? this.getLatestRunPathRecord()
            : null;
        const latestSample = typeof this.getRunPathBossSamples === 'function'
            ? this.getRunPathBossSamples({ limit: 1, sortBy: 'recent' })[0] || null
            : null;
        const forgeOverview = this.player && typeof this.player.getTreasureWorkshopResearchOverview === 'function'
            ? (this.player.getTreasureWorkshopResearchOverview() || {
                coreOwned: 0,
                coreTotal: 0,
                formOwned: 0,
                formTotal: 0,
                activeWorkshops: 0,
                activeReforges: 0,
                activeInfusions: 0,
                activeSetEchoes: 0,
                resonantSets: 0,
                fullSets: 0,
                readyInfusions: []
            })
            : {
                coreOwned: 0,
                coreTotal: 0,
                formOwned: 0,
                formTotal: 0,
                activeWorkshops: 0,
                activeReforges: 0,
                activeInfusions: 0,
                activeSetEchoes: 0,
                resonantSets: 0,
                fullSets: 0,
                readyInfusions: []
            };
        const unclaimedAchievementIds = Array.isArray(this.achievementSystem?.unlockedAchievements)
            ? this.achievementSystem.unlockedAchievements.filter((id) => !this.achievementSystem.claimedAchievements.includes(id))
            : [];
        const lineage = typeof this.getFateLineageSnapshot === 'function'
            ? this.getFateLineageSnapshot()
            : null;
        const aftereffects = typeof this.getFateAftereffectSnapshot === 'function'
            ? this.getFateAftereffectSnapshot()
            : null;
        const latestSlate = typeof this.getLatestRunSlate === 'function'
            ? this.getLatestRunSlate()
            : null;
        const seasonBoard = buildSnapshot?.seasonBoard && typeof buildSnapshot.seasonBoard === 'object'
            ? buildSnapshot.seasonBoard
            : (typeof this.getSeasonBoardSnapshot === 'function'
                ? this.getSeasonBoardSnapshot(latestSlate ? { latestSlate } : {})
                : null);
        const seasonSettlement = seasonBoard?.settlement && typeof seasonBoard.settlement === 'object'
            ? seasonBoard.settlement
            : null;
        const seasonDebtPack = seasonBoard?.debtPack && typeof seasonBoard.debtPack === 'object'
            ? seasonBoard.debtPack
            : null;
        const shouldSurfaceSeasonVerification = shouldSurfaceSeasonBoardVerification(seasonBoard, seasonSettlement);
        const seasonVerificationOrders = shouldSurfaceSeasonVerification && Array.isArray(seasonBoard?.verificationOrders)
            ? seasonBoard.verificationOrders.filter((entry) => entry && typeof entry === 'object')
            : [];
        const seasonVerificationOrderPair = getSeasonBoardVerificationOrderPair(seasonVerificationOrders);
        const primarySeasonVerification = seasonVerificationOrderPair.primary;
        const secondarySeasonVerification = seasonVerificationOrderPair.secondary;
        const seasonNextTask = seasonBoard?.nextTask && typeof seasonBoard.nextTask === 'object'
            ? seasonBoard.nextTask
            : null;
        const seasonDebtActionMeta = resolveSeasonBoardActionMeta(seasonDebtPack?.recommendedAnchorSection, 'sanctum');
        const seasonVerificationActionMeta = resolveSeasonBoardActionMeta(primarySeasonVerification?.anchorSection, 'sanctum');
        const seasonSideVerificationActionMeta = resolveSeasonBoardActionMeta(secondarySeasonVerification?.anchorSection, 'sanctum');
        const seasonNextTaskResolvedActionMeta = resolveSeasonBoardActionMeta(seasonNextTask?.anchorSection, 'sanctum');
        const seasonNextTaskActionMeta = {
            ...seasonNextTaskResolvedActionMeta,
            actionType: seasonNextTask?.actionType || seasonNextTaskResolvedActionMeta.actionType,
            actionValue: seasonNextTask?.actionValue || seasonNextTaskResolvedActionMeta.actionValue,
            ctaLabel: seasonNextTask?.ctaLabel || seasonNextTaskResolvedActionMeta.ctaLabel
        };
        const seasonNextWeekGoal = seasonBoard?.nextWeekGoal && typeof seasonBoard.nextWeekGoal === 'object'
            ? seasonBoard.nextWeekGoal
            : null;
        const seasonNextTaskLine = !shouldSurfaceSeasonVerification && seasonNextTask
            ? getSeasonBoardNextTaskLine(seasonNextTask)
            : '';
        const seasonNextTaskNoteLine = seasonNextTaskLine
            ? [
                seasonNextTask.progressText || '',
                seasonNextTask.statusLine || '',
                seasonNextTask.anchorSection
                    ? `去向：${SECTION_META[seasonNextTask.anchorSection]?.title || seasonNextTask.anchorSection}`
                    : ''
            ].filter(Boolean).join(' · ')
            : '';
        const heavenlyMandate = (() => {
            const fallback = {
                available: false,
                source: 'fallback',
                title: '天道敕令',
                icon: '📜',
                weekTag: '',
                weekLabel: '本周轮转',
                seasonName: '众生试炼',
                themeId: '',
                themeLabel: '待启敕令',
                directiveName: '待启敕令',
                directiveDesc: '周循环板尚未启封，洞府会在这里挂出本周题面与刻印进度。',
                directiveRiskLabel: '待定',
                selectionModeLabel: '轮转待定',
                goalTierLabel: '未入卷',
                goalTitle: '敕令未立',
                goalProgressText: '等待周循环接入',
                summaryLine: '天道敕令尚未启封，洞府会在这里留出本周题面与外层考校。',
                detailLine: '待周循环板接入后，会同步当前敕令、风险倾向与本周刻印。',
                guideLine: '若周循环板尚未启封，可先按当前议程、命盘与样本节奏照常推进。',
                completedTaskCount: 0,
                totalTaskCount: 0,
                lanes: [],
                actionType: 'collection',
                actionValue: 'sanctum'
            };
            const mandateSnapshot = typeof this.getHeavenlyMandateExpeditionSnapshot === 'function'
                ? this.getHeavenlyMandateExpeditionSnapshot()
                : null;
            if (mandateSnapshot && typeof mandateSnapshot === 'object') {
                const lanes = Array.isArray(mandateSnapshot.lanes)
                    ? mandateSnapshot.lanes
                        .filter((lane) => lane && typeof lane === 'object')
                        .map((lane) => {
                            const tasks = Array.isArray(lane.tasks)
                                ? lane.tasks
                                    .filter((task) => task && typeof task === 'object')
                                    .map((task, index) => {
                                        const safeTarget = Math.max(1, clampInt(task.target || 0, 0, 999));
                                        const progress = clampInt(task.progress || 0, 0, safeTarget);
                                        const completed = !!task.completed || progress >= safeTarget;
                                        return {
                                            id: String(task.id || `${lane.id || 'lane'}_${index + 1}`).trim(),
                                            label: String(task.label || `敕令任务 ${index + 1}`).trim(),
                                            icon: String(task.icon || lane.icon || '✦').trim(),
                                            progress,
                                            target: safeTarget,
                                            progressText: String(task.progressText || `${progress}/${safeTarget}`).trim(),
                                            completed,
                                            hintLine: String(task.hintLine || '').trim(),
                                            statusLine: String(task.statusLine || '').trim(),
                                            anchorSection: String(task.anchorSection || '').trim()
                                        };
                                    })
                                : [];
                            return {
                                id: String(lane.id || 'mandate_lane').trim(),
                                label: String(lane.label || '玩法线').trim(),
                                icon: String(lane.icon || '✦').trim(),
                                summaryLine: String(lane.summaryLine || '').trim(),
                                completedCount: tasks.filter((task) => task.completed).length,
                                totalCount: tasks.length,
                                tasks
                            };
                        })
                    : [];
                const focusTask = mandateSnapshot.focusTask && typeof mandateSnapshot.focusTask === 'object'
                    ? {
                        id: String(mandateSnapshot.focusTask.id || 'heavenly_mandate_focus').trim(),
                        label: String(mandateSnapshot.focusTask.label || '本周焦点').trim(),
                        icon: String(mandateSnapshot.focusTask.icon || '📜').trim(),
                        progress: clampInt(mandateSnapshot.focusTask.progress || 0, 0, 999),
                        target: Math.max(1, clampInt(mandateSnapshot.focusTask.target || 1, 1, 999)),
                        progressText: String(mandateSnapshot.focusTask.progressText || '').trim(),
                        completed: !!mandateSnapshot.focusTask.completed,
                        hintLine: String(mandateSnapshot.focusTask.hintLine || '').trim(),
                        statusLine: String(mandateSnapshot.focusTask.statusLine || '').trim(),
                        anchorSection: String(mandateSnapshot.focusTask.anchorSection || '').trim(),
                        source: String(mandateSnapshot.focusTask.source || '').trim(),
                        sourceId: String(mandateSnapshot.focusTask.sourceId || '').trim(),
                        isPlaceholder: !!mandateSnapshot.focusTask.isPlaceholder,
                        occupiesStrongSlot: !!mandateSnapshot.focusTask.occupiesStrongSlot
                    }
                    : null;
                const nextTask = focusTask || lanes
                    .flatMap((lane) => lane.tasks)
                    .find((task) => !task.completed) || null;
                const completedTaskCount = clampInt(mandateSnapshot.completedTaskCount || 0, 0, 999);
                const totalTaskCount = Math.max(completedTaskCount, clampInt(mandateSnapshot.totalTaskCount || 0, 0, 999));
                const goalProgressText = nextTask
                    ? (nextTask.progressText || (nextTask.completed ? '已完成' : '待推进'))
                    : (totalTaskCount > 0
                        ? `${completedTaskCount}/${totalTaskCount} 项敕令已成`
                        : '等待本周题面落定');
                const detailLine = nextTask
                    ? `当前优先补「${nextTask.label}」${nextTask.progressText ? ` · ${nextTask.progressText}` : ''}${nextTask.hintLine ? ` · ${nextTask.hintLine}` : ''}`
                    : (mandateSnapshot.summaryLine || fallback.detailLine);
                const focusTaskActionMeta = resolveSeasonBoardActionMeta(nextTask?.anchorSection, 'sanctum');
                const focusTargetLabel = String(focusTaskActionMeta.targetLabel || '').trim();
                const guideLine = nextTask
                    ? `先沿${focusTargetLabel ? `【${focusTargetLabel}】` : '当前主线'}补完「${nextTask.label}」，再回洞府复核其余两条玩法线。`
                    : `本周敕令已全部成卷，可转去更高压模式验证这套主练是否稳定。`;
                return {
                    available: true,
                    source: 'mandate',
                    title: fallback.title,
                    icon: String(mandateSnapshot.themeIcon || fallback.icon),
                    weekTag: String(mandateSnapshot.weekTag || '').trim(),
                    weekLabel: String(mandateSnapshot.weekLabel || fallback.weekLabel).trim(),
                    seasonName: fallback.seasonName,
                    themeId: String(mandateSnapshot.themeId || '').trim(),
                    themeLabel: String(mandateSnapshot.themeLabel || fallback.themeLabel).trim(),
                    directiveName: String(mandateSnapshot.themeLabel || fallback.directiveName).trim(),
                    directiveDesc: String(mandateSnapshot.summaryLine || fallback.directiveDesc).trim(),
                    directiveRiskLabel: totalTaskCount > 0 && completedTaskCount >= totalTaskCount ? '已结题' : '进行中',
                    selectionModeLabel: '周循环板',
                    goalTierLabel: totalTaskCount > 0 ? `${completedTaskCount}/${totalTaskCount}` : fallback.goalTierLabel,
                    goalTitle: nextTask ? nextTask.label : `${String(mandateSnapshot.themeLabel || fallback.themeLabel).trim()} · 本周已结题`,
                    goalProgressText,
                    summaryLine: mandateSnapshot.summaryLine || `天道敕令：${mandateSnapshot.weekTag || mandateSnapshot.weekLabel || fallback.weekLabel} · 当前题面「${mandateSnapshot.themeLabel || fallback.directiveName}」`,
                    detailLine,
                    guideLine,
                    completedTaskCount,
                    totalTaskCount,
                    focusTask,
                    lanes,
                    nextTask,
                    actionType: focusTaskActionMeta.actionType,
                    actionValue: focusTaskActionMeta.actionValue,
                    ctaLabel: focusTaskActionMeta.ctaLabel || '前往推进'
                };
            }

            const seasonProfile = typeof this.getEndlessSeasonProfile === 'function'
                ? this.getEndlessSeasonProfile()
                : null;
            if (!seasonProfile || typeof seasonProfile !== 'object') return fallback;

            const goals = Array.isArray(seasonProfile.goals)
                ? seasonProfile.goals.filter((item) => item && typeof item === 'object')
                : [];
            const activeGoal = goals.find((item) => !item.completed) || goals[goals.length - 1] || null;
            const completedGoals = goals.filter((item) => item.completed).length;
            const weekTag = String(seasonProfile.weekTag || '').trim();
            const weekNo = clampInt(seasonProfile.weekNo || 0, 0, 99);
            const year = clampInt(seasonProfile.year || 0, 0, 9999);
            const weekLabel = weekNo > 0 && year > 0
                ? `${year} · 第 ${weekNo} 周`
                : (weekTag || fallback.weekLabel);
            const directiveName = String(seasonProfile.directiveName || '稳态令');
            const directiveDesc = String(seasonProfile.directiveDesc || seasonProfile.desc || '').trim();
            const seasonName = String(seasonProfile.name || fallback.seasonName);
            const selectionModeLabel = String(seasonProfile.selectionModeLabel || '轮转推荐');
            const directiveRiskLabel = String(seasonProfile.directiveRiskLabel || '平衡');
            const goalTierLabel = String(seasonProfile.goalTierLabel || fallback.goalTierLabel);
            const goalTitle = activeGoal
                ? `${activeGoal.tierLabel || '本周刻印'} · ${activeGoal.title || '留痕校卷'}`
                : `${goalTierLabel} · 本周留痕`;
            const goalProgressText = activeGoal?.progressText
                || `已入卷 ${completedGoals}/${Math.max(1, goals.length)} 重刻印`;
            const summaryLine = `天道敕令：${weekTag || weekLabel} · 当前轮转「${directiveName}」`;
            const detailLine = directiveDesc
                ? `${seasonName}当前偏向 ${directiveRiskLabel} 路数，由${selectionModeLabel}挂题：${directiveDesc}`
                : `${seasonName}已挂出本周题面，当前刻印进度为 ${goalTierLabel}。`;
            const guideLine = activeGoal
                ? `本周刻印：${activeGoal.title || '留痕校卷'} · ${goalProgressText}，适合先按敕令方向校命盘与样本节奏。`
                : `天道敕令已入卷 ${goalTierLabel}，可继续用更高压的轮转补稳定样本。`;

            return {
                available: true,
                source: 'season',
                title: fallback.title,
                icon: String(seasonProfile.icon || fallback.icon),
                weekTag,
                weekLabel,
                seasonName,
                themeId: '',
                themeLabel: directiveName,
                directiveName,
                directiveDesc: directiveDesc || fallback.directiveDesc,
                directiveRiskLabel,
                selectionModeLabel,
                goalTierLabel,
                goalTitle,
                goalProgressText,
                summaryLine,
                detailLine,
                guideLine,
                completedTaskCount: completedGoals,
                totalTaskCount: Math.max(1, goals.length),
                lanes: [],
                actionValue: 'sanctum',
                ctaLabel: '回看洞府'
            };
        })();
        const heavenlyMandateFocusTask = heavenlyMandate?.focusTask && typeof heavenlyMandate.focusTask === 'object'
            ? heavenlyMandate.focusTask
            : (heavenlyMandate?.nextTask && typeof heavenlyMandate.nextTask === 'object'
                ? heavenlyMandate.nextTask
                : null);
        const achievements = unclaimedAchievementIds
            .slice(0, 3)
            .map((achievementId) => {
                const achievement = typeof ACHIEVEMENTS !== 'undefined' && ACHIEVEMENTS ? ACHIEVEMENTS[achievementId] : null;
                if (!achievement) return null;
                const rewardText = typeof getAchievementRewardText === 'function'
                    ? getAchievementRewardText({
                        ...achievement,
                        unlocked: true,
                        claimed: false
                    })
                    : '领取奖励';
                return {
                    id: achievementId,
                    title: achievement.name || achievementId,
                    note: rewardText,
                    action: 'claim',
                    icon: achievement.icon || '🏆'
                };
            })
            .filter(Boolean);
        progress.sanctumAgendaCompleted = agendaDashboard.completedCount || 0;
        progress.sanctumAgendaFailed = agendaDashboard.failedCount || 0;
        if (lineage?.available) {
            progress.lineageCharacters = clampInt(lineage.progress?.trackedCharacters || 0, 0, 999);
            progress.lineageStyles = clampInt(lineage.progress?.trackedStyles || 0, 0, 999);
            progress.lineageNodes = clampInt(lineage.progress?.trackedNodes || 0, 0, 999);
            progress.lineageResearchHistory = clampInt(lineage.progress?.researchHistoryCount || 0, 0, 999);
        }
        if (aftereffects?.available) {
            progress.fateAftereffectActive = clampInt(aftereffects.activeCount || 0, 0, 999);
            progress.fateAftereffectPending = clampInt(aftereffects.pendingCount || 0, 0, 999);
        }
        if (seasonBoard) {
            progress.seasonBoardCompletedTasks = clampInt(seasonBoard.completedTaskCount || 0, 0, 999);
            progress.seasonBoardTotalTasks = clampInt(seasonBoard.totalTaskCount || 0, 0, 999);
            progress.seasonBoardPhaseLabel = String(seasonBoard.phaseLabel || '').trim();
            progress.seasonBoardThemeLabel = String(seasonBoard.themeLabel || '').trim();
        }

        const rooms = [
            {
                id: 'library',
                icon: '📚',
                name: '藏经阁',
                focus: '图鉴研究 / 构筑快照 / Boss 情报',
                note: '集中管理局外情报，帮助下一局更快确定构筑方向。',
                actionLabel: '打开构筑快照',
                actionType: 'collection',
                actionValue: 'builds'
            },
            {
                id: 'run_path_gallery',
                icon: '🧭',
                name: '命途碑廊',
                focus: '命途战录 / 推荐套装 / Boss 读法',
                note: latestSample
                    ? `最近对照：${latestSample.characterName || latestSample.pathName} 用【${latestSample.pathName}】收下 ${latestSample.bossName}，${latestSample.turns > 0 ? `${latestSample.turns} 回合` : '已留样'}。`
                    : latestRunPathRecord
                    ? `最近战录：${latestRunPathRecord.recordName || latestRunPathRecord.name} · ${latestRunPathRecord.lastCharacterName || latestRunPathRecord.name} 完成于第 ${latestRunPathRecord.lastRealm || latestRunPathRecord.bestRealm || 1} 重天。`
                    : '首条命途圆满后，会自动把命途定位、推荐套装与 Boss 读法收入洞府。',
                actionLabel: '查看构筑快照',
                actionType: 'collection',
                actionValue: 'builds'
            },
            {
                id: 'forge',
                icon: '⚒️',
                name: '炼器室',
                focus: '法宝研究 / 套装回响 / 器灵灌注',
                note: forgeOverview.activeWorkshops > 0
                    ? `已激活 ${forgeOverview.activeWorkshops} 条炼器铭刻，当前 ${forgeOverview.fullSets} 组套装已进入三段共鸣。`
                    : `当前已整理出 ${forgeOverview.coreOwned}/${forgeOverview.coreTotal} 件核心法宝与 ${forgeOverview.formOwned}/${forgeOverview.formTotal} 件形态件，可继续追套装与器灵目标。`,
                actionLabel: '进入炼器研究',
                actionType: 'treasure',
                actionValue: 'treasure'
            },
            {
                id: 'observatory',
                icon: '🔭',
                name: '观星台',
                focus: '章节预兆 / 遭遇档案 / 周挑战预留',
                note: '章节天象与地脉已经入档，下一步可叠加周挑战与 Seed 复盘。',
                actionLabel: '查看章节档案',
                actionType: 'collection',
                actionValue: 'chapters'
            },
            {
                id: 'demon_platform',
                icon: '🗿',
                name: '伏魔台',
                focus: '敌影档案 / Boss 记忆 / 破局手札',
                note: progress.runPathBossSampleCount > 0
                    ? `已归档 ${progress.runPathBossSampleCount} 份角色 × 命途 × Boss 对照样本，伏魔台可继续压更快轮次。`
                    : progress.clearedBossMemories > 0
                    ? `已留下 ${progress.clearedBossMemories} 份主宰记忆战记录，可继续压最快轮次。`
                    : '普通敌影与主宰机制都已开始归档，现已开放首版 Boss 记忆战。',
                actionLabel: '查看敌影档案',
                actionType: 'collection',
                actionValue: 'enemies'
            }
        ];

        const researches = [
            {
                id: 'run_path_archive',
                room: '命途碑廊',
                name: '命途战录',
                progress: progress.completedRunPaths || 0,
                goal: Math.max(1, progress.totalRunPaths || 1),
                reward: '洞府会沉淀不同命途的定位、推荐套装、推荐角色与 Boss 读法，方便下轮直接追一条主线。',
                section: 'builds'
            },
            {
                id: 'forge_atlas',
                room: '炼器室',
                name: '炼器总谱',
                progress: progress.collectedTreasures >= 2 ? 1 : 0,
                goal: 1,
                reward: '法宝图鉴显示套装关系、来源、核心件与适配流派。',
                section: 'treasure',
                actionType: 'treasure',
                actionValue: 'treasure'
            },
            {
                id: 'set_resonance',
                room: '炼器室',
                name: '套装共鸣索引',
                progress: forgeOverview.resonantSets >= 1 ? 1 : 0,
                goal: 1,
                reward: '炼器室会总结当前 2 件 / 3 件套阈值与下一步补件方向。',
                section: 'treasure',
                actionType: 'treasure',
                actionValue: 'treasure'
            },
            {
                id: 'spirit_forge',
                room: '炼器室',
                name: '器灵灌注锚点',
                progress: forgeOverview.activeInfusions >= 1 ? 1 : Math.min(1, forgeOverview.coreOwned >= 2 ? 1 : 0),
                goal: 1,
                reward: '核心件会标注器灵灌注资格与当前回响，便于先做目标筛选再走路线。',
                section: 'treasure',
                actionType: 'treasure',
                actionValue: 'treasure'
            },
            {
                id: 'spirit_ledger',
                room: '藏经阁',
                name: '灵契谱录',
                progress: currentSpirit ? 1 : 0,
                goal: 1,
                reward: '开放灵契图鉴的来源线索、章节适配与成长摘要。',
                section: 'spirits'
            },
            {
                id: 'chapter_index',
                room: '观星台',
                name: '章节地脉索引',
                progress: progress.clearedChapters >= 1 ? 1 : 0,
                goal: 1,
                reward: '章节档案显示生态压力、路线建议与 Boss 传闻。',
                section: 'chapters'
            },
            {
                id: 'boss_manual',
                room: '伏魔台',
                name: '主宰破局手札',
                progress: progress.defeatedBosses >= 1 ? 1 : 0,
                goal: 1,
                reward: 'Boss 档案显示反制法宝、风险等级与破局窗口。',
                section: 'bosses'
            },
            {
                id: 'enemy_ledger',
                room: '伏魔台',
                name: '敌影压制索引',
                progress: progress.seenEnemies >= 4 ? 1 : 0,
                goal: 1,
                reward: '敌影档案显示战术画像、招式速记与章节归属。',
                section: 'enemies'
            },
            {
                id: 'memory_duel',
                room: '伏魔台',
                name: '主宰镜战留痕',
                progress: progress.clearedBossMemories >= 1 ? 1 : 0,
                goal: 1,
                reward: 'Boss 档案可直接发起记忆战，并沉淀最快轮次与首胜留痕。',
                section: 'bosses'
            },
            {
                id: 'build_mirror',
                room: '藏经阁',
                name: '构筑留影镜',
                progress: progress.collectedLaws >= 4 && progress.collectedTreasures >= 2 ? 1 : 0,
                goal: 1,
                reward: '构筑快照会汇总牌组画像、关键缺口与下一轮补位建议。',
                section: 'builds'
            },
            {
                id: 'sample_board',
                room: '命途碑廊',
                name: '实战样本对照榜',
                progress: progress.runPathBossSampleCount || 0,
                goal: 3,
                reward: '构筑快照与 Boss 档案会对照角色、命途裂变、Boss 和收官轮次，方便直接找稳定样本。',
                section: 'builds'
            }
        ].map((research) => ({
            ...research,
            ready: research.progress >= research.goal,
            progressText: `${research.progress}/${research.goal}`
        }));

        const agendaResearches = [];
        if (agendaDashboard.active) {
            agendaResearches.push({
                id: `sanctum_agenda_active_${agendaDashboard.active.agendaId}`,
                room: '洞府议程',
                name: `当前议程 · ${agendaDashboard.active.name}`,
                progress: agendaDashboard.active.progress || 0,
                goal: agendaDashboard.active.target || 1,
                reward: agendaDashboard.active.phaseLine || agendaDashboard.active.summaryLine || agendaDashboard.active.trainingAdvice || '本轮研究正在推进中。',
                noteLine: [
                    agendaDashboard.active.phaseLabel ? `当前阶段：${agendaDashboard.active.phaseLabel}` : '',
                    agendaDashboard.active.selectedDecisionLabel ? `已选处置：${agendaDashboard.active.selectedDecisionLabel}` : '',
                    agendaDashboard.active.selectedContractLabel ? `已立契约：${agendaDashboard.active.selectedContractLabel}` : '',
                    agendaDashboard.active.focusNodeLine || agendaDashboard.active.sourceLine || ''
                ].filter(Boolean).join(' · '),
                section: 'slates',
                actionType: 'collection',
                actionValue: 'slates',
                buttonLabel: '查看归卷书架',
                toneClass: agendaDashboard.active.progress >= agendaDashboard.active.target ? 'ready' : 'tracking',
                ready: agendaDashboard.active.progress >= agendaDashboard.active.target,
                progressLabel: '进度',
                progressText: `${agendaDashboard.active.progress || 0}/${agendaDashboard.active.target || 1}${agendaDashboard.active.phaseLabel ? ` · ${agendaDashboard.active.phaseLabel}` : ''}`,
                agendaId: agendaDashboard.active.agendaId,
                agendaState: 'active',
                isAgenda: true
            });
            if (agendaDashboard.active.decisionState === 'pending' && Array.isArray(agendaDashboard.active.decisionOptions)) {
                agendaDashboard.active.decisionOptions.forEach((decision) => {
                    agendaResearches.push({
                        id: `sanctum_agenda_decision_${agendaDashboard.active.agendaId}_${decision.id}`,
                        room: '议程处置',
                        name: `${agendaDashboard.active.name} · ${decision.label}`,
                        progress: agendaDashboard.active.progress || 0,
                        goal: agendaDashboard.active.target || 1,
                        reward: decision.summaryLine || '为当前议程选择一条章中处置。',
                        noteLine: decision.statusLine || agendaDashboard.active.decisionPromptLine || '',
                        section: 'sanctum',
                        actionType: 'agenda_decision',
                        actionValue: decision.id,
                        buttonLabel: decision.buttonLabel || '采用处置',
                        disabled: false,
                        toneClass: 'tracking',
                        ready: false,
                        progressLabel: '处置',
                        progressText: decision.tagLabel || '待选',
                        agendaId: agendaDashboard.active.agendaId,
                        agendaState: 'pending_decision',
                        isAgenda: true
                    });
                });
            }
            if (agendaDashboard.active.contractState === 'pending' && Array.isArray(agendaDashboard.active.contractOptions)) {
                agendaDashboard.active.contractOptions.forEach((contract) => {
                    agendaResearches.push({
                        id: `sanctum_agenda_contract_${agendaDashboard.active.agendaId}_${contract.id}`,
                        room: '锁线契约',
                        name: `${agendaDashboard.active.name} · ${contract.label}`,
                        progress: agendaDashboard.active.contractProgress || 0,
                        goal: agendaDashboard.active.contractTarget || contract.target || 1,
                        reward: contract.summaryLine || '为当前议程补一条锁线契约，争取章末额外奖赏。',
                        noteLine: [
                            contract.statusLine || agendaDashboard.active.contractPromptLine || '',
                            contract.signCostLine ? `契押 ${contract.signCostLine}` : '',
                            contract.burdenLine || ''
                        ].filter(Boolean).join(' · '),
                        section: 'sanctum',
                        actionType: 'agenda_contract',
                        actionValue: contract.id,
                        buttonLabel: contract.buttonLabel || '立契锁线',
                        disabled: false,
                        toneClass: 'tracking',
                        ready: false,
                        progressLabel: '契约',
                        progressText: contract.tagLabel || '待立',
                        agendaId: agendaDashboard.active.agendaId,
                        agendaState: 'pending_contract',
                        isAgenda: true
                    });
                });
            }
        } else if (agendaDashboard.lastResolved) {
            agendaResearches.push({
                id: `sanctum_agenda_last_${agendaDashboard.lastResolved.agendaId}`,
                room: '洞府议程',
                name: `最近结题 · ${agendaDashboard.lastResolved.name}`,
                progress: agendaDashboard.lastResolved.progress || 0,
                goal: agendaDashboard.lastResolved.target || 1,
                reward: agendaDashboard.lastResolved.recoveryLine || agendaDashboard.lastResolved.summaryLine || agendaDashboard.lastResolved.reasonLine || '上一轮研究已经留下结题结果。',
                noteLine: agendaDashboard.lastResolved.recoveryHintLine || agendaDashboard.lastResolved.contractResolutionLine || agendaDashboard.lastResolved.grantedLine || agendaDashboard.lastResolved.reasonLine || '',
                section: 'slates',
                actionType: 'collection',
                actionValue: 'slates',
                buttonLabel: '查看归卷书架',
                toneClass: agendaDashboard.lastResolved.outcome === 'success' ? 'ready' : 'tracking',
                ready: agendaDashboard.lastResolved.outcome === 'success',
                progressLabel: '结果',
                progressText: `${agendaDashboard.lastResolved.progress || 0}/${agendaDashboard.lastResolved.target || 1}`,
                agendaId: agendaDashboard.lastResolved.agendaId,
                agendaState: agendaDashboard.lastResolved.outcome || 'failed',
                isAgenda: true
            });
        }
        agendaDashboard.candidates.forEach((candidate) => {
            agendaResearches.push({
                id: `sanctum_agenda_candidate_${candidate.agendaId}`,
                room: '洞府议程',
                name: candidate.name,
                progress: candidate.progress || 0,
                goal: candidate.target || 1,
                reward: candidate.trainingAdvice || candidate.highlightLine || candidate.summaryLine || '当前候选议程正在等待立项。',
                noteLine: candidate.active
                    ? (candidate.focusNodeLine || candidate.sourceLine || '')
                    : (candidate.sourceLine || candidate.focusNodeLine || ''),
                section: 'slates',
                actionType: 'agenda_activate',
                actionValue: candidate.agendaId,
                buttonLabel: candidate.buttonLabel || '立为本轮议程',
                disabled: !!candidate.disabled,
                toneClass: candidate.active ? 'ready' : candidate.toneClass,
                ready: !!candidate.active,
                progressLabel: candidate.active ? '进度' : '状态',
                progressText: candidate.active
                    ? `${candidate.progress || 0}/${candidate.target || 1}`
                    : (candidate.statusLine || candidate.costLine || '待立项'),
                agendaId: candidate.agendaId,
                agendaState: candidate.active ? 'active' : 'candidate',
                isAgenda: true
            });
        });
        const lineageResearches = [];
        if (lineage?.available) {
            const readyTracks = [lineage.characterTrack, lineage.styleTrack, lineage.nodeTrack, lineage.researchTrack]
                .filter((track) => track && Array.isArray(track.entries) && track.entries.length > 0).length;
            lineageResearches.push({
                id: 'fate_lineage_record_layer',
                room: '命盘档案室',
                name: '命盘谱系记录层',
                progress: readyTracks,
                goal: 4,
                reward: lineage.summaryLine || '把角色、流派、节点与研究结果压成同一份长期身份档案。',
                noteLine: lineage.detailLine || lineage.currentFocusLine || '命盘谱系会把最近答卷、洞府议程与样本留痕统一成长期画像。',
                section: lineage.actionValue || 'builds',
                ready: readyTracks >= 4 || !!lineage.researchTrack?.dominantLabel,
                progressText: `${readyTracks}/4`
            });
        }
        const aftereffectResearches = [];
        if (aftereffects?.available) {
            const totalTracked = Math.max(1, clampInt(aftereffects.activeCount || 0, 0, 999) + clampInt(aftereffects.pendingCount || 0, 0, 999));
            aftereffectResearches.push({
                id: 'fate_aftereffect_record_layer',
                room: '界痕账本',
                name: `界痕后效 · ${aftereffects.primary?.name || aftereffects.primary?.templateLabel || '跨章偏置'}`,
                progress: totalTracked,
                goal: totalTracked,
                reward: aftereffects.summaryLine || '洞府会继续追踪契约兑现、欠契与残卷回收留下的跨章偏置。',
                noteLine: aftereffects.detailLine || aftereffects.currentStatusLine || aftereffects.guideLine || '后效会跨过当前章节继续追账。',
                section: aftereffects.actionValue || 'sanctum',
                ready: true,
                toneClass: aftereffects.primary?.status === 'active' ? 'ready' : 'tracking',
                progressText: `生效 ${clampInt(aftereffects.activeCount || 0, 0, 999)} / 待生效 ${clampInt(aftereffects.pendingCount || 0, 0, 999)}`
            });
        }
        const seasonBoardResearches = [];
        if (seasonBoard) {
            const seasonBoardLaneRewards = Array.isArray(seasonBoard.laneRewards)
                ? seasonBoard.laneRewards.filter((entry) => entry && typeof entry === 'object')
                : [];
            const seasonVerificationArchive = seasonBoard.verificationArchive && typeof seasonBoard.verificationArchive === 'object'
                ? seasonBoard.verificationArchive
                : null;
            const latestSeasonVerificationArchive = seasonVerificationArchive?.latestEntry && typeof seasonVerificationArchive.latestEntry === 'object'
                ? seasonVerificationArchive.latestEntry
                : (Array.isArray(seasonVerificationArchive?.entries) ? seasonVerificationArchive.entries[0] : null);
            seasonBoardResearches.push({
                id: 'season_board_record_layer',
                room: '观星台',
                name: `赛季天道盘 · ${seasonBoard.phaseLabel || '采样期'}`,
                progress: clampInt(seasonBoard.completedTaskCount || 0, 0, 999),
                goal: Math.max(1, clampInt(seasonBoard.totalTaskCount || 0, 0, 999)),
                reward: seasonBoard.summaryLine || '赛季主轴会把训练、远征与验算三条线整理成同一张季盘。',
                noteLine: seasonBoard.detailLine || seasonBoard.guideLine || seasonBoard.statusLine || '继续补齐赛季主轴。',
                section: 'sanctum',
                ready: clampInt(seasonBoard.completedTaskCount || 0, 0, 999) >= Math.max(1, clampInt(seasonBoard.totalTaskCount || 0, 0, 999)),
                toneClass: clampInt(seasonBoard.completedTaskCount || 0, 0, 999) > 0 ? 'tracking' : 'idle',
                progressText: seasonBoard.progress?.progressText || `${clampInt(seasonBoard.completedTaskCount || 0, 0, 999)}/${Math.max(1, clampInt(seasonBoard.totalTaskCount || 0, 0, 999))}`
            });
            seasonBoardLaneRewards.forEach((reward) => {
                seasonBoardResearches.push({
                    id: `season_board_lane_reward_${reward.weekTag || seasonBoard.weekTag || 'current'}_${reward.laneId || 'lane'}`,
                    room: '分线结题赏',
                    name: `${reward.laneLabel || reward.label || '分线'} · ${reward.statusLabel || '结题赏'}`,
                    progress: reward.ready ? 1 : 0,
                    goal: 1,
                    reward: reward.summaryLine || '每条赛季分线结题后，本周可领取一次小额确定性奖励。',
                    noteLine: [reward.rewardLine || '', reward.detailLine || ''].filter(Boolean).join(' · '),
                    section: 'sanctum',
                    actionType: 'season_board_lane_reward',
                    actionValue: reward.laneId || '',
                    buttonLabel: reward.buttonLabel || (reward.claimable ? '领取结题赏' : (reward.claimed ? '已领取' : '未结题')),
                    source: 'lane_reward',
                    sourceId: reward.rewardKey || '',
                    laneId: reward.laneId || '',
                    ready: !!reward.claimable,
                    disabled: !reward.claimable,
                    toneClass: reward.claimed ? 'ready' : (reward.claimable ? 'ready' : 'tracking'),
                    progressText: reward.statusLabel || reward.progressText || '未结题'
                });
            });
            if (seasonSettlement) {
                seasonBoardResearches.push({
                    id: `season_board_settlement_${seasonSettlement.outcomeId || 'pending'}`,
                    room: '季押卷',
                    name: `季押卷 · ${seasonSettlement.outcomeLabel || '待押卷'}`,
                    progress: seasonSettlement.outcomeId === 'positive_sheet' ? 1 : 0,
                    goal: 1,
                    reward: seasonSettlement.summaryLine || '赛季押卷会把这周主练裁定成正卷、险卷或欠卷。',
                    noteLine: [
                        seasonSettlement.detailLine || '',
                        seasonSettlement.contractResolutionLine || seasonSettlement.statusLine || seasonSettlement.guideLine || ''
                    ].filter(Boolean).join(' · '),
                    section: 'sanctum',
                    actionType: 'collection',
                    actionValue: 'sanctum',
                    buttonLabel: '查看裁定',
                    source: 'settlement',
                    sourceId: seasonSettlement.outcomeId || '',
                    ready: seasonSettlement.outcomeId === 'positive_sheet',
                    toneClass: seasonSettlement.outcomeId === 'positive_sheet' ? 'ready' : 'tracking',
                    progressText: seasonSettlement.progressText || seasonSettlement.outcomeLabel || '待裁定'
                });
            }
            if (seasonDebtPack) {
                seasonBoardResearches.push({
                    id: `season_board_debt_${seasonDebtPack.id || 'pack'}`,
                    room: '债账包',
                    name: `研究债账包 · ${seasonDebtPack.debtThemeLabel || seasonBoard.themeLabel || '待清债账'}`,
                    progress: 0,
                    goal: 1,
                    reward: seasonDebtPack.summaryLine || '欠卷不会直接消失，洞府会把它转成一笔待清债账。',
                    noteLine: [
                        seasonDebtPack.detailLine || '',
                        seasonDebtPack.guideLine || seasonDebtPack.progressText || seasonDebtPack.settleWindowText || ''
                    ].filter(Boolean).join(' · '),
                    section: seasonDebtActionMeta.actionType === 'collection' ? seasonDebtActionMeta.actionValue : 'sanctum',
                    actionType: seasonDebtActionMeta.actionType,
                    actionValue: seasonDebtActionMeta.actionValue,
                    buttonLabel: '前往清账',
                    source: 'debt_pack',
                    sourceId: seasonDebtPack.id || '',
                    ready: false,
                    toneClass: 'tracking',
                    progressText: seasonDebtPack.progressText || seasonDebtPack.settleWindowText || '待清账'
                });
            }
            if (seasonNextTaskLine) {
                seasonBoardResearches.push({
                    id: `season_board_next_task_${seasonNextTask.id || 'task'}`,
                    room: '季盘推进',
                    name: `当前季盘行动 · ${seasonNextTask.label || '待推进'}`,
                    progress: 0,
                    goal: 1,
                    reward: seasonNextTaskLine,
                    noteLine: seasonNextTaskNoteLine,
                    section: seasonNextTaskActionMeta.actionType === 'collection' ? seasonNextTaskActionMeta.actionValue : 'sanctum',
                    actionType: seasonNextTaskActionMeta.actionType,
                    actionValue: seasonNextTaskActionMeta.actionValue,
                    buttonLabel: seasonNextTaskActionMeta.ctaLabel || '前往推进',
                    source: seasonNextTask.source || '',
                    sourceId: seasonNextTask.sourceId || '',
                    taskSource: seasonNextTask.taskSource || '',
                    taskSourceId: seasonNextTask.taskSourceId || '',
                    taskId: seasonNextTask.id || '',
                    laneId: seasonNextTask.laneId || '',
                    ready: false,
                    toneClass: 'tracking',
                    progressText: seasonNextTask.progressText || seasonNextTask.statusLine || '待推进'
                });
            }
            if (primarySeasonVerification) {
                seasonBoardResearches.push({
                    id: `season_board_verification_${primarySeasonVerification.id || 'primary'}`,
                    room: '结业验证',
                    name: `结业验证状 · ${primarySeasonVerification.label || '待验证'}`,
                    progress: 0,
                    goal: 1,
                    reward: primarySeasonVerification.summaryLine || '赛季会给出一张最优先的验证状，逼你去外场证明这周主练不是幻觉。',
                    noteLine: [
                        primarySeasonVerification.hintLine || '',
                        primarySeasonVerification.statusLine || '',
                        secondarySeasonVerification?.summaryLine ? `次张：${secondarySeasonVerification.summaryLine}` : ''
                    ].filter(Boolean).join(' · '),
                    section: seasonVerificationActionMeta.actionType === 'collection' ? seasonVerificationActionMeta.actionValue : 'sanctum',
                    actionType: seasonVerificationActionMeta.actionType,
                    actionValue: seasonVerificationActionMeta.actionValue,
                    buttonLabel: '前往验证',
                    ready: false,
                    toneClass: 'tracking',
                    progressText: primarySeasonVerification.statusLine || '待验证'
                });
            }
            if (secondarySeasonVerification) {
                seasonBoardResearches.push({
                    id: `season_board_side_verification_${secondarySeasonVerification.id || 'secondary'}`,
                    room: '旁验证',
                    name: `旁验证状 · ${secondarySeasonVerification.label || '待验证'}`,
                    progress: 0,
                    goal: 1,
                    reward: secondarySeasonVerification.summaryLine || '季盘会保留一张旁验证状，让你用不同节奏补第二份证明。',
                    noteLine: [
                        secondarySeasonVerification.hintLine || '',
                        secondarySeasonVerification.statusLine || ''
                    ].filter(Boolean).join(' · '),
                    section: seasonSideVerificationActionMeta.actionType === 'collection' ? seasonSideVerificationActionMeta.actionValue : 'sanctum',
                    actionType: seasonSideVerificationActionMeta.actionType,
                    actionValue: seasonSideVerificationActionMeta.actionValue,
                    buttonLabel: '前往旁验证',
                    ready: false,
                    toneClass: 'tracking',
                    progressText: secondarySeasonVerification.statusLine || '待验证'
                });
            }
            if (seasonVerificationArchive?.available) {
                seasonBoardResearches.push({
                    id: 'season_board_verification_archive',
                    room: '周判记录',
                    name: `周判记录 · ${latestSeasonVerificationArchive?.weekLabel || seasonBoard.weekLabel || '本周轮转'}`,
                    progress: Math.min(clampInt(seasonVerificationArchive.totalRecords || 0, 0, 999), 3),
                    goal: Math.max(1, Math.min(clampInt(seasonVerificationArchive.totalRecords || 0, 0, 999), 3) || 1),
                    reward: seasonVerificationArchive.summaryLine || '把每周主验证、旁验证和清账回写压成可复核的长期周判记录。',
                    noteLine: [
                        latestSeasonVerificationArchive?.noteLine || '',
                        seasonVerificationArchive.detailLine || ''
                    ].filter(Boolean).slice(0, 2).join(' · '),
                    section: 'sanctum',
                    actionType: 'challenge',
                    actionValue: 'weekly',
                    buttonLabel: '查看全部周判',
                    ready: clampInt(seasonVerificationArchive.totalRecords || 0, 0, 999) > 0,
                    toneClass: clampInt(seasonVerificationArchive.totalRecords || 0, 0, 999) > 0 ? 'tracking' : 'idle',
                    progressText: seasonVerificationArchive.progressText || '等待首条周判'
                });
            }
        }
        const combinedResearches = [...agendaResearches, ...seasonBoardResearches, ...lineageResearches, ...aftereffectResearches, ...researches];

        const fallbackGoals = combinedResearches
            .filter((research) => research.ready)
            .slice(0, 2)
            .map((research) => ({
                id: research.id,
                title: research.name,
                note: research.reward,
                action: research.actionType === 'treasure' ? 'treasure' : 'collection',
                value: research.section,
                actionValue: research.actionValue || research.section,
                icon: '📘'
            }));
        const goalPool = achievements.length > 0 ? achievements : fallbackGoals;
        const heavenlyMandateGoal = {
            id: 'heavenly_mandate_goal',
            title: `天道敕令 · ${heavenlyMandate.directiveName}`,
            note: `${heavenlyMandate.weekTag || heavenlyMandate.weekLabel} · ${heavenlyMandate.goalTitle} · ${heavenlyMandate.goalProgressText}`,
            action: heavenlyMandate.actionType || 'collection',
            value: heavenlyMandate.actionValue || 'sanctum',
            buttonLabel: heavenlyMandate.ctaLabel || '前往推进',
            followTaskId: heavenlyMandateFocusTask?.id || '',
            icon: heavenlyMandate.icon || '📜',
            isHeavenlyMandate: true,
            weekTag: heavenlyMandate.weekTag || '',
            directiveName: heavenlyMandate.directiveName || ''
        };
        const seasonBoardGoal = seasonBoard
            ? {
                id: 'season_board_goal',
                title: `赛季天道盘 · ${seasonBoard.phaseLabel || '采样期'}`,
                note: `${seasonBoard.summaryLine || '赛季主轴正在同步。'}${seasonBoard.totalTaskCount > 0 ? ` · ${seasonBoard.completedTaskCount || 0}/${seasonBoard.totalTaskCount}` : ''}`,
                action: 'collection',
                value: 'sanctum',
                icon: seasonBoard.phaseIcon || seasonBoard.seasonIcon || '🏁',
                isSeasonBoardGoal: true
            }
            : null;
        const seasonBoardSettlementGoal = seasonSettlement
            ? {
                id: `season_board_settlement_goal_${seasonSettlement.outcomeId || 'pending'}`,
                title: `季押卷 · ${seasonSettlement.outcomeLabel || '待押卷'}`,
                note: seasonSettlement.summaryLine || seasonSettlement.detailLine || '季押卷裁定会决定这一周主练是继续放大、先补验证，还是先去清账。',
                action: 'collection',
                value: 'sanctum',
                icon: seasonSettlement.outcomeId === 'positive_sheet' ? '🧾' : (seasonSettlement.outcomeId === 'debt_sheet' ? '📉' : '⚖️'),
                isSeasonBoardGoal: true
            }
            : null;
        const seasonBoardDebtGoal = seasonDebtPack
            ? {
                id: `season_board_debt_goal_${seasonDebtPack.id || 'pack'}`,
                title: `债账包 · ${seasonDebtPack.debtThemeLabel || '待清债账'}`,
                note: seasonDebtPack.summaryLine || seasonDebtPack.guideLine || '先把这笔研究债账清掉，再决定是否继续冲榜。',
                action: seasonDebtActionMeta.actionType,
                value: seasonDebtActionMeta.actionValue,
                icon: '📚',
                isSeasonBoardGoal: true
            }
            : null;
        const seasonBoardNextTaskGoal = seasonNextTaskLine
            ? {
                id: `season_board_next_task_goal_${seasonNextTask.id || 'task'}`,
                title: `当前季盘行动 · ${seasonNextWeekGoal?.title || seasonNextTask.label || '待推进'}`,
                note: seasonNextWeekGoal?.note || [seasonNextTaskLine, seasonNextTaskNoteLine].filter(Boolean).join(' · '),
                action: seasonNextWeekGoal?.action || seasonNextTaskActionMeta.actionType,
                value: seasonNextWeekGoal?.value || seasonNextTaskActionMeta.actionValue,
                buttonLabel: seasonNextWeekGoal?.buttonLabel || seasonNextTaskActionMeta.ctaLabel || '前往推进',
                source: seasonNextWeekGoal?.source || seasonNextTask.source || '',
                sourceId: seasonNextWeekGoal?.sourceId || seasonNextTask.sourceId || '',
                taskSource: seasonNextWeekGoal?.taskSource || seasonNextTask.taskSource || '',
                taskSourceId: seasonNextWeekGoal?.taskSourceId || seasonNextTask.taskSourceId || '',
                taskId: seasonNextWeekGoal?.taskId || seasonNextTask.id || '',
                laneId: seasonNextWeekGoal?.laneId || seasonNextTask.laneId || '',
                icon: '🧭',
                isSeasonBoardGoal: true
            }
            : null;
        const seasonBoardVerificationGoal = primarySeasonVerification
            ? {
                id: `season_board_verification_goal_${primarySeasonVerification.id || 'primary'}`,
                title: `结业验证状 · ${primarySeasonVerification.label || '待验证'}`,
                note: primarySeasonVerification.summaryLine || primarySeasonVerification.hintLine || primarySeasonVerification.statusLine || '去外场补一张验证状，确认本周押卷不只是章节内成立。',
                action: seasonVerificationActionMeta.actionType,
                value: seasonVerificationActionMeta.actionValue,
                icon: '📌',
                isSeasonBoardGoal: true
            }
            : null;
        const seasonBoardSideVerificationGoal = secondarySeasonVerification
            ? {
                id: `season_board_side_verification_goal_${secondarySeasonVerification.id || 'secondary'}`,
                title: `旁验证状 · ${secondarySeasonVerification.label || '待验证'}`,
                note: secondarySeasonVerification.summaryLine || secondarySeasonVerification.hintLine || secondarySeasonVerification.statusLine || '用不同节奏补第二份验证，避免只凭单一路线就把本周押卷当成定论。',
                action: seasonSideVerificationActionMeta.actionType,
                value: seasonSideVerificationActionMeta.actionValue,
                icon: '🧪',
                isSeasonBoardGoal: true
            }
            : null;
        const seasonBoardLaneRewardGoals = seasonBoard && Array.isArray(seasonBoard.laneRewards)
            ? seasonBoard.laneRewards
                .filter((reward) => reward && reward.claimable)
                .map((reward) => ({
                    id: `season_board_lane_reward_goal_${reward.weekTag || seasonBoard.weekTag || 'current'}_${reward.laneId || 'lane'}`,
                    title: `${reward.laneLabel || reward.label || '分线'} · 结题赏`,
                    note: [reward.rewardLine || '', reward.summaryLine || ''].filter(Boolean).join(' · '),
                    action: 'season_board_lane_reward',
                    value: reward.laneId || '',
                    buttonLabel: reward.buttonLabel || '领取结题赏',
                    laneId: reward.laneId || '',
                    source: 'lane_reward',
                    sourceId: reward.rewardKey || '',
                    icon: reward.laneIcon || '🎁',
                    isSeasonBoardGoal: true
                }))
            : [];
        const lineageGoal = lineage?.available
            ? {
                id: 'fate_lineage_goal',
                title: `命盘谱系 · ${lineage.styleTrack?.dominantLabel || lineage.characterTrack?.dominantLabel || '长期主修'}`,
                note: lineage.summaryLine || '当前谱系正在从角色、流派、节点与研究四条线同时长成。',
                action: 'collection',
                value: lineage.actionValue || 'builds',
                icon: lineage.icon || '🧬'
            }
            : null;
        const aftereffectGoal = aftereffects?.available
            ? {
                id: 'fate_aftereffect_goal',
                title: `界痕抉择 · ${aftereffects.primary?.templateLabel || aftereffects.primary?.name || '跨章偏置'}`,
                note: [aftereffects.currentStatusLine || aftereffects.summaryLine || '', aftereffects.primary?.negativeLine || ''].filter(Boolean).join(' · '),
                action: 'collection',
                value: aftereffects.actionValue || 'sanctum',
                icon: aftereffects.icon || aftereffects.primary?.icon || '🧭'
            }
            : null;

        return {
            progress,
            rooms,
            researches: combinedResearches,
            agenda: agendaDashboard,
            heavenlyMandate,
            seasonBoard,
            lineage,
            aftereffects,
            goals: [
                heavenlyMandateGoal,
                ...(seasonBoardGoal ? [seasonBoardGoal] : []),
                ...seasonBoardLaneRewardGoals,
                ...(seasonBoardSettlementGoal ? [seasonBoardSettlementGoal] : []),
                ...(seasonBoardDebtGoal ? [seasonBoardDebtGoal] : []),
                ...(seasonBoardNextTaskGoal ? [seasonBoardNextTaskGoal] : []),
                ...(seasonBoardVerificationGoal ? [seasonBoardVerificationGoal] : []),
                ...(seasonBoardSideVerificationGoal ? [seasonBoardSideVerificationGoal] : []),
                ...(lineageGoal ? [lineageGoal] : []),
                ...(aftereffectGoal ? [aftereffectGoal] : []),
                ...goalPool
            ],
            recentUnlocks: this.getCollectionUnlockHistory(6)
        };
    };

    Game.prototype.renderCollectionHubChrome = function () {
        if (typeof document === 'undefined') return;
        const state = this.getCollectionHubState();
        const meta = this.getCollectionSectionMeta(state.section);
        const titleEl = document.getElementById('collection-title');
        const subtitleEl = document.getElementById('collection-subtitle');
        if (titleEl) titleEl.textContent = meta.title;
        if (subtitleEl) subtitleEl.textContent = meta.subtitle;
        this.renderRewardSeasonBoardHandoffArrival(state.section);
        this.renderSeasonBoardTaskFollowArrival(state.section);

        document.querySelectorAll('#collection [data-collection-tab]').forEach((button) => {
            button.classList.toggle('active', button.dataset.collectionTab === state.section);
        });
        document.querySelectorAll('#collection [data-collection-panel]').forEach((panel) => {
            panel.classList.toggle('active', panel.dataset.collectionPanel === state.section);
        });
    };

    Game.prototype.renderSpiritCodex = function () {
        if (typeof document === 'undefined') return;
        const grid = document.getElementById('spirit-codex-grid');
        const detail = document.getElementById('spirit-codex-detail');
        const summary = document.getElementById('spirit-codex-summary');
        const research = document.getElementById('spirit-codex-research');
        const searchInput = document.getElementById('spirit-codex-search');
        const focusSelect = document.getElementById('spirit-codex-focus-filter');
        if (!grid || !detail || !summary || !research) return;

        const state = this.getCollectionHubState();
        if (searchInput && searchInput.value !== state.spiritQuery) searchInput.value = state.spiritQuery;
        if (focusSelect && focusSelect.value !== state.spiritFocus) focusSelect.value = state.spiritFocus;

        const entries = this.getSpiritCodexEntries();
        const filtered = entries.filter((entry) => this.passesSpiritCodexFilter(entry));
        const selected = filtered.find((entry) => entry.id === this.selectedSpiritCodexId) || filtered[0] || null;
        this.selectedSpiritCodexId = selected?.id || '';

        grid.innerHTML = filtered.length > 0
            ? filtered.map((entry) => `
                <button type="button"
                    class="collection-card spirit-codex-card ${entry.id === this.selectedSpiritCodexId ? 'selected' : ''} ${entry.status}"
                    onclick="game.selectSpiritCodexEntry('${escapeHtml(entry.id)}')">
                    <div class="collection-card-top">
                        <span class="collection-card-icon">${escapeHtml(entry.displayIcon)}</span>
                        <span class="collection-status-chip ${entry.status}">${escapeHtml(entry.statusLabel)}</span>
                    </div>
                    <div class="collection-card-body">
                        <span class="collection-card-kicker">${escapeHtml(entry.tierLabel || '灵契')}</span>
                        <h4>${escapeHtml(entry.displayName)}</h4>
                        <p>${escapeHtml(entry.summary)}</p>
                    </div>
                    <div class="collection-card-tags">
                        ${(entry.roleTags || []).map((tag) => `<span class="collection-tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                </button>
            `).join('')
            : '<div class="codex-empty-state">当前检索条件下没有匹配的灵契记录，试试放宽检索或切换关注对象。</div>';

        if (!selected) {
            detail.innerHTML = '<div class="codex-empty-state">暂无灵契档案。</div>';
            return;
        }

        detail.innerHTML = `
            <div class="collection-detail-shell">
                <section class="collection-detail-hero">
                    <div class="collection-detail-hero-main">
                        <div class="collection-detail-icon">${escapeHtml(selected.displayIcon)}</div>
                        <div class="collection-detail-meta">
                            <span class="codex-side-kicker">灵契档案</span>
                            <h3>${escapeHtml(selected.displayName)}${selected.isHidden ? '' : ` · ${escapeHtml(selected.title || '')}`}</h3>
                            <p>${escapeHtml(selected.description || selected.summary || '')}</p>
                        </div>
                    </div>
                    <div class="detail-status-strip">
                        <span class="detail-status-chip ${selected.status}">${escapeHtml(selected.statusLabel)}</span>
                        <span class="detail-status-chip">${escapeHtml(selected.tierLabel || '初契')}</span>
                        <span class="detail-status-chip">蓄能 ${escapeHtml(selected.chargeMax || 0)}</span>
                    </div>
                </section>
                <div class="collection-detail-grid">
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">护道被动</span>
                        <strong>${escapeHtml(selected.passiveLabel)}</strong>
                        <p>${escapeHtml(selected.passiveDesc)}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">蓄能主动</span>
                        <strong>${escapeHtml(selected.activeLabel)}</strong>
                        <p>${escapeHtml(selected.activeDesc)}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">来源与线索</span>
                        <p>${escapeHtml(selected.sourceText)}</p>
                        <p class="collection-muted">${escapeHtml(selected.unlockClue)}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">下一步研究</span>
                        <p>${escapeHtml(selected.storyProfile?.growthGoal || selected.nextGrowthText)}</p>
                        <p class="collection-muted">推荐角色：${escapeHtml((selected.affinityNames || []).join('、') || '暂无')}</p>
                    </section>
                </div>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">${escapeHtml(selected.storyProfile?.acquisitionTitle || '灵识故事')}</span>
                    <p>${escapeHtml(selected.storyProfile?.acquisitionSummary || selected.story)}</p>
                    <p class="collection-muted">${escapeHtml(selected.storyProfile?.source || '线索来源未明')}</p>
                </section>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">${escapeHtml(selected.storyProfile?.witnessTitle || '同行见证')}</span>
                    <p>${escapeHtml(selected.storyProfile?.witnessSummary || selected.story)}</p>
                </section>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">适配章节</span>
                    <div class="collection-card-tags">
                        ${(selected.chapterFits || []).length > 0
                ? selected.chapterFits.map((name) => `<span class="collection-tag">${escapeHtml(name)}</span>`).join('')
                : '<span class="collection-tag muted">等待更多章节数据验证</span>'}
                    </div>
                </section>
            </div>
        `;

        const alignedCount = entries.filter((entry) => entry.isCurrent || entry.isAligned).length;
        const hiddenCount = entries.filter((entry) => entry.isHidden).length;
        summary.innerHTML = [
            '<span class="codex-side-kicker">灵契总览</span>',
            '<h3>灵契收录状态</h3>',
            '<div class="codex-summary-grid two-cols">',
            `<div class="codex-summary-chip"><strong>${entries.length}</strong><span>总条目</span></div>`,
            `<div class="codex-summary-chip"><strong>${alignedCount}</strong><span>当前角色更易共鸣</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.filter((entry) => entry.isCurrent).length}</strong><span>当前同行</span></div>`,
            `<div class="codex-summary-chip"><strong>${hiddenCount}</strong><span>未补全线索</span></div>`,
            '</div>',
            `<p class="codex-side-note">当前可见 ${filtered.length} 条灵契记录，优先补齐与当前角色共鸣的灵契会更容易形成章节闭环。</p>`
        ].join('');

        const currentSpirit = entries.find((entry) => entry.isCurrent) || null;
        research.innerHTML = [
            '<span class="codex-side-kicker">研究方向</span>',
            '<h3>灵契追索建议</h3>',
            '<ul class="codex-side-list compact">',
            `<li>${escapeHtml(currentSpirit ? `当前灵契【${currentSpirit.name}】已挂接，可优先围绕 ${currentSpirit.roleTags.join(' / ') || '护道节奏'} 补牌。` : '当前还没有挂接灵契，建议先从开局灵契草案或灵契窟补一个稳定护道。')}</li>`,
            `<li>${escapeHtml(selected.selectedCharacterName)} 更容易与 ${(selected.affinityNames || []).join('、') || '特定灵契'} 建立共鸣。</li>`,
            `<li>章节推荐灵契会同步出现在章节档案中，适合和天象 / 地脉一起看。</li>`,
            '</ul>'
        ].join('');
    };

    Game.prototype.renderChapterCodex = function () {
        if (typeof document === 'undefined') return;
        const grid = document.getElementById('chapter-codex-grid');
        const detail = document.getElementById('chapter-codex-detail');
        const summary = document.getElementById('chapter-codex-summary');
        const hints = document.getElementById('chapter-codex-hints');
        const searchInput = document.getElementById('chapter-codex-search');
        const focusSelect = document.getElementById('chapter-codex-focus-filter');
        if (!grid || !detail || !summary || !hints) return;

        const state = this.getCollectionHubState();
        if (searchInput && searchInput.value !== state.chapterQuery) searchInput.value = state.chapterQuery;
        if (focusSelect && focusSelect.value !== state.chapterFocus) focusSelect.value = state.chapterFocus;

        const entries = this.getChapterCodexEntries();
        const filtered = entries.filter((entry) => this.passesChapterCodexFilter(entry));
        const selected = filtered.find((entry) => entry.id === this.selectedChapterCodexId) || filtered[0] || null;
        this.selectedChapterCodexId = selected?.id || '';

        grid.innerHTML = filtered.length > 0
            ? filtered.map((entry) => `
                <button type="button"
                    class="collection-card chapter-codex-card ${entry.id === this.selectedChapterCodexId ? 'selected' : ''} ${entry.status}"
                    onclick="game.selectChapterCodexEntry('${escapeHtml(entry.id)}')">
                    <div class="collection-card-top">
                        <span class="collection-card-icon">${escapeHtml(entry.icon)}</span>
                        <span class="collection-status-chip ${entry.status}">${escapeHtml(entry.statusLabel)}</span>
                    </div>
                    <div class="collection-card-body">
                        <span class="collection-card-kicker">${escapeHtml(entry.realmLabel)}</span>
                        <h4>${escapeHtml(entry.fullName)}</h4>
                        <p>${escapeHtml(entry.skyOmen?.name || entry.mechanic || '章节规则未定')}</p>
                    </div>
                    <div class="collection-card-tags">
                        ${(entry.focusTags || []).slice(0, 3).map((tag) => `<span class="collection-tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                </button>
            `).join('')
            : '<div class="codex-empty-state">当前检索条件下没有匹配的章节档案。</div>';

        if (!selected) {
            detail.innerHTML = '<div class="codex-empty-state">暂无章节档案。</div>';
            return;
        }

        detail.innerHTML = `
            <div class="collection-detail-shell">
                <section class="collection-detail-hero">
                    <div class="collection-detail-hero-main">
                        <div class="collection-detail-icon">${escapeHtml(selected.icon)}</div>
                        <div class="collection-detail-meta">
                            <span class="codex-side-kicker">章节档案</span>
                            <h3>${escapeHtml(selected.fullName)}</h3>
                            <p>${escapeHtml(selected.mechanic)} · ${escapeHtml(selected.mood)}</p>
                        </div>
                    </div>
                    <div class="detail-status-strip">
                        <span class="detail-status-chip ${selected.status}">${escapeHtml(selected.statusLabel)}</span>
                        <span class="detail-status-chip">${escapeHtml(selected.realmLabel)}</span>
                        <span class="detail-status-chip">${escapeHtml(selected.stageLabel)}</span>
                    </div>
                </section>
                <div class="collection-detail-grid">
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">章节天象</span>
                        <strong>${escapeHtml(selected.skyOmen?.name || '未定')}</strong>
                        <p>${escapeHtml(selected.skyOmen?.desc || '')}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">地脉规则</span>
                        <strong>${escapeHtml(selected.leyline?.name || '未定')}</strong>
                        <p>${escapeHtml(selected.leyline?.desc || '')}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">路线提示</span>
                        <p>${escapeHtml(selected.routePrompt)}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">Boss 传闻</span>
                        <p>${escapeHtml(selected.bossPrompt)}</p>
                    </section>
                </div>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">生态模板</span>
                    <div class="collection-card-tags">
                        ${(selected.ecologyTags || []).map((tag) => `<span class="collection-tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                    <div class="collection-mini-grid">
                        <div class="collection-mini-card">
                            <strong>${selected.enemies.length}</strong>
                            <span>常驻敌人</span>
                            <p>${escapeHtml(selected.enemies.slice(0, 4).map((enemy) => enemy.name).join('、') || '暂无')}</p>
                        </div>
                        <div class="collection-mini-card">
                            <strong>${selected.bosses.length}</strong>
                            <span>章节主宰</span>
                            <p>${escapeHtml(selected.bosses.map((boss) => boss.name).join('、') || '暂无')}</p>
                        </div>
                    </div>
                </section>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">顺势建议</span>
                    <ul class="collection-detail-list">
                        <li>推荐命格：${escapeHtml(selected.recommendedDestinies.map((meta) => meta.name).join('、') || '暂无')}</li>
                        <li>推荐灵契：${escapeHtml(selected.recommendedSpirits.map((meta) => meta.name).join('、') || '暂无')}</li>
                        <li>推荐誓约：${escapeHtml(selected.recommendedVows.map((meta) => meta.name).join('、') || '暂无')}</li>
                    </ul>
                </section>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">连续叙事线</span>
                    <p>${escapeHtml(selected.narrativeProfile?.summary || '章节叙事线正在归档整理。')}</p>
                    <div class="collection-mini-grid">
                        ${Array.isArray(selected.narrativeProfile?.beats) && selected.narrativeProfile.beats.length > 0
                ? selected.narrativeProfile.beats.map((beat) => `
                            <div class="collection-mini-card">
                                <strong>${escapeHtml(beat.stage || '章节片段')}</strong>
                                <span>${escapeHtml(beat.title || '命线未定')}</span>
                                <p>${escapeHtml(beat.summary || '')}</p>
                            </div>
                        `).join('')
                : '<div class="collection-mini-card"><strong>归档中</strong><span>当前未展示额外叙事节点</span><p>本章资料正在整理为标准档案。</p></div>'}
                    </div>
                </section>
                ${selected.chapterIndex === 6 && selected.narrativeProfile?.finaleRecall?.summary
                ? `
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">${escapeHtml(selected.narrativeProfile.finaleRecall.title || '终章总回收')}</span>
                        <p>${escapeHtml(selected.narrativeProfile.finaleRecall.summary)}</p>
                        <div class="collection-card-tags">
                            ${(selected.narrativeProfile.finaleRecall.systems || []).map((item) => `<span class="collection-tag">${escapeHtml(item)}</span>`).join('')}
                        </div>
                    </section>
                `
                : ''}
            </div>
        `;

        summary.innerHTML = [
            '<span class="codex-side-kicker">章节总览</span>',
            '<h3>世界规则进度</h3>',
            '<div class="codex-summary-grid two-cols">',
            `<div class="codex-summary-chip"><strong>${entries.length}</strong><span>章节档案</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.filter((entry) => entry.isCleared).length}</strong><span>已贯通章节</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.filter((entry) => entry.isCurrent).length}</strong><span>当前章节</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.reduce((sum, entry) => sum + entry.bosses.length, 0)}</strong><span>已编入主宰</span></div>`,
            '</div>',
            `<p class="codex-side-note">章节档案会把“天象 / 地脉 / 生态 / Boss 传闻”压在同一页，方便在开局前就判断路线。</p>`
        ].join('');

        hints.innerHTML = [
            '<span class="codex-side-kicker">复盘提示</span>',
            '<h3>怎么读章节</h3>',
            '<ul class="codex-side-list compact">',
            '<li>先看天象和地脉，确定这章要放大的是什么玩法。</li>',
            '<li>再看生态模板，判断是输出压力、控制压力还是资源压力更高。</li>',
            '<li>最后再用 Boss 传闻回头修正路线，不要把精英和营地价值看成固定不变。</li>',
            '</ul>'
        ].join('');
    };

    Game.prototype.renderEnemyCodex = function () {
        if (typeof document === 'undefined') return;
        const grid = document.getElementById('enemy-codex-grid');
        const detail = document.getElementById('enemy-codex-detail');
        const summary = document.getElementById('enemy-codex-summary');
        const hints = document.getElementById('enemy-codex-hints');
        const searchInput = document.getElementById('enemy-codex-search');
        const focusSelect = document.getElementById('enemy-codex-focus-filter');
        if (!grid || !detail || !summary || !hints) return;

        const state = this.getCollectionHubState();
        if (searchInput && searchInput.value !== state.enemyQuery) searchInput.value = state.enemyQuery;
        if (focusSelect && focusSelect.value !== state.enemyFocus) focusSelect.value = state.enemyFocus;

        const entries = this.getEnemyCodexEntries();
        const filtered = entries.filter((entry) => this.passesEnemyCodexFilter(entry));
        const selected = filtered.find((entry) => entry.id === this.selectedEnemyCodexId) || filtered[0] || null;
        this.selectedEnemyCodexId = selected?.id || '';

        grid.innerHTML = filtered.length > 0
            ? filtered.map((entry) => `
                <button type="button"
                    class="collection-card enemy-codex-card ${entry.id === this.selectedEnemyCodexId ? 'selected' : ''} ${entry.status}"
                    onclick="game.selectEnemyCodexEntry('${escapeHtml(entry.id)}')">
                    <div class="collection-card-top">
                        <span class="collection-card-icon">${escapeHtml(entry.icon)}</span>
                        <span class="collection-status-chip ${entry.status}">${escapeHtml(entry.statusLabel)}</span>
                    </div>
                    <div class="collection-card-body">
                        <span class="collection-card-kicker">${escapeHtml(entry.realmLabel)}</span>
                        <h4>${escapeHtml(entry.name)}</h4>
                        <p>${escapeHtml(entry.roleLabel)} · ${escapeHtml(entry.firstMoveText || '正在整理招式速记')}</p>
                    </div>
                    <div class="collection-card-tags">
                        ${(entry.threatTags || []).slice(0, 3).map((tag) => `<span class="collection-tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                </button>
            `).join('')
            : '<div class="codex-empty-state">当前检索条件下没有匹配的敌影档案。</div>';

        if (!selected) {
            detail.innerHTML = '<div class="codex-empty-state">暂无敌影档案。</div>';
            return;
        }

        detail.innerHTML = `
            <div class="collection-detail-shell">
                <section class="collection-detail-hero">
                    <div class="collection-detail-hero-main">
                        <div class="collection-detail-icon">${escapeHtml(selected.icon)}</div>
                        <div class="collection-detail-meta">
                            <span class="codex-side-kicker">敌影档案</span>
                            <h3>${escapeHtml(selected.name)}</h3>
                            <p>${escapeHtml(selected.chapterFullName)} · ${escapeHtml(selected.roleLabel)}</p>
                        </div>
                    </div>
                    <div class="detail-status-strip">
                        <span class="detail-status-chip ${selected.status}">${escapeHtml(selected.statusLabel)}</span>
                        <span class="detail-status-chip">${escapeHtml(selected.realmLabel)}</span>
                        ${selected.elementLabel ? `<span class="detail-status-chip">${escapeHtml(selected.elementLabel)}属性</span>` : ''}
                    </div>
                </section>
                <div class="collection-detail-grid">
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">战术画像</span>
                        <strong>${escapeHtml(selected.roleLabel)}</strong>
                        <p>${escapeHtml(selected.counterHints[0] || '正在补充战术建议。')}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">主要威胁</span>
                        <div class="collection-card-tags">
                            ${(selected.threatTags || []).length > 0
                ? selected.threatTags.map((tag) => `<span class="collection-tag">${escapeHtml(tag)}</span>`).join('')
                : '<span class="collection-tag muted">威胁标签未记录</span>'}
                        </div>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">资源与掉落</span>
                        <p>${escapeHtml(selected.goldText)}</p>
                        <p class="collection-muted">${escapeHtml(selected.stealLawName ? `可盗取法则：${selected.stealLawName}` : '当前未记录可盗取法则。')}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">元素与抗性</span>
                        <div class="collection-card-tags">
                            ${(selected.resistTags || []).length > 0
                ? selected.resistTags.map((tag) => `<span class="collection-tag">${escapeHtml(tag)}</span>`).join('')
                : '<span class="collection-tag muted">当前未记录显著抗性</span>'}
                        </div>
                    </section>
                </div>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">招式速记</span>
                    <ul class="collection-detail-list">
                        ${(selected.patternPreview || []).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
                    </ul>
                </section>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">建议应对</span>
                    <ul class="collection-detail-list">
                        ${(selected.counterHints || []).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
                    </ul>
                </section>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">章节生态</span>
                    <div class="collection-card-tags">
                        ${(selected.ecologyTags || []).length > 0
                ? selected.ecologyTags.map((tag) => `<span class="collection-tag">${escapeHtml(tag)}</span>`).join('')
                : '<span class="collection-tag muted">该敌影的章节焦点仍在整理中</span>'}
                    </div>
                </section>
            </div>
        `;

        summary.innerHTML = [
            '<span class="codex-side-kicker">敌影总览</span>',
            '<h3>敌影档案进度</h3>',
            '<div class="codex-summary-grid two-cols">',
            `<div class="codex-summary-chip"><strong>${entries.length}</strong><span>敌影总数</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.filter((entry) => entry.isScouted).length}</strong><span>已遭遇</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.filter((entry) => entry.isUpcoming).length}</strong><span>未来敌影</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.filter((entry) => entry.aiProfile === 'control').length}</strong><span>控场型</span></div>`,
            '</div>',
            '<p class="codex-side-note">敌影档案会把常驻敌人的压制手段、首拍动作和章节归属压在同一页，方便提前做路线与解法准备。</p>'
        ].join('');

        hints.innerHTML = [
            '<span class="codex-side-kicker">复盘提示</span>',
            '<h3>怎么读敌影</h3>',
            '<ul class="codex-side-list compact">',
            '<li>先看战术画像和首拍速记，判断这只敌影是在抢血线、压状态还是拖回合。</li>',
            '<li>再看元素与抗性，确认当前主输出轴会不会被天然克制。</li>',
            '<li>最后回到章节档案，判断它是单卡问题还是整章生态都在逼你补同一种应对。</li>',
            '</ul>'
        ].join('');
    };

    Game.prototype.renderBossArchive = function () {
        if (typeof document === 'undefined') return;
        const grid = document.getElementById('boss-archive-grid');
        const detail = document.getElementById('boss-archive-detail');
        const summary = document.getElementById('boss-archive-summary');
        const hints = document.getElementById('boss-archive-hints');
        const searchInput = document.getElementById('boss-archive-search');
        const focusSelect = document.getElementById('boss-archive-focus-filter');
        if (!grid || !detail || !summary || !hints) return;

        const state = this.getCollectionHubState();
        if (searchInput && searchInput.value !== state.bossQuery) searchInput.value = state.bossQuery;
        if (focusSelect && focusSelect.value !== state.bossFocus) focusSelect.value = state.bossFocus;

        const entries = this.getBossArchiveEntries();
        const progress = this.getCollectionProgressSnapshot();
        const filtered = entries.filter((entry) => this.passesBossArchiveFilter(entry));
        const selected = filtered.find((entry) => entry.id === this.selectedBossArchiveId) || filtered[0] || null;
        this.selectedBossArchiveId = selected?.id || '';

        grid.innerHTML = filtered.length > 0
            ? filtered.map((entry) => `
                <button type="button"
                    class="collection-card boss-archive-card ${entry.id === this.selectedBossArchiveId ? 'selected' : ''} ${entry.status}"
                    onclick="game.selectBossArchiveEntry('${escapeHtml(entry.id)}')">
                    <div class="collection-card-top">
                        <span class="collection-card-icon">${escapeHtml(entry.icon)}</span>
                        <span class="collection-status-chip ${entry.status}">${escapeHtml(entry.statusLabel)}</span>
                    </div>
                    <div class="collection-card-body">
                        <span class="collection-card-kicker">${escapeHtml(entry.chapterName)}</span>
                        <h4>${escapeHtml(entry.name)}</h4>
                        <p>${escapeHtml(entry.mechanicText)}</p>
                    </div>
                    <div class="collection-card-tags">
                        <span class="collection-tag danger">${escapeHtml(entry.pressureLabel)}</span>
                        ${entry.runPathFitLabel ? `<span class="collection-tag">${escapeHtml(entry.runPathFitLabel)}</span>` : ''}
                        ${entry.counterTreasures.slice(0, 2).map((item) => `<span class="collection-tag">${escapeHtml(item.name)}</span>`).join('')}
                    </div>
                </button>
            `).join('')
            : '<div class="codex-empty-state">当前检索条件下没有匹配的 Boss 档案。</div>';

        if (!selected) {
            detail.innerHTML = '<div class="codex-empty-state">暂无 Boss 档案。</div>';
            return;
        }

        detail.innerHTML = `
            <div class="collection-detail-shell">
                <section class="collection-detail-hero">
                    <div class="collection-detail-hero-main">
                        <div class="collection-detail-icon">${escapeHtml(selected.icon)}</div>
                        <div class="collection-detail-meta">
                            <span class="codex-side-kicker">Boss 档案</span>
                            <h3>${escapeHtml(selected.name)}</h3>
                            <p>${escapeHtml(selected.chapterFullName)} · 风险等级 ${escapeHtml(selected.pressureLabel)}</p>
                        </div>
                    </div>
                    <div class="detail-status-strip">
                        <span class="detail-status-chip ${selected.status}">${escapeHtml(selected.statusLabel)}</span>
                        <span class="detail-status-chip">第 ${escapeHtml(selected.realm)} 重</span>
                        <span class="detail-status-chip">无反制难度 ${escapeHtml(selected.withoutCounter.toFixed(2))}</span>
                    </div>
                </section>
                <div class="collection-detail-grid">
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">主机制</span>
                        <p>${escapeHtml(selected.mechanicText)}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">开场立场</span>
                        <p>${escapeHtml(selected.openingStance || '当前档案尚未整理该主宰的开场立场。')}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">破局窗口</span>
                        <p>${escapeHtml(selected.breakHint)}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">当前命途解法</span>
                        <p>${escapeHtml(selected.runPathMatchup
                ? `${selected.runPathName} · ${selected.runPathCounterText}`
                : '当前未挂命途，挂接命途后这里会给出适配评级与拆招建议。')}</p>
                        ${selected.runPathMatchup
                ? `<div class="collection-card-tags"><span class="collection-tag">${escapeHtml(selected.runPathName || '当前命途')}</span><span class="collection-tag">${escapeHtml(selected.runPathFitLabel || '常规拆解')}</span></div>`
                : ''}
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">章节传闻</span>
                        <p>${escapeHtml(selected.bossPrompt || '暂无额外传闻')}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">三幕压轴</span>
                        <p>${escapeHtml(selected.finisher ? `${selected.finisher} · ${selected.visualCue || '已记录专属视觉断章。'}` : '当前档案尚未整理该主宰的压轴大招。')}</p>
                        ${(selected.actPreview || []).length > 0
                ? `<div class="collection-card-tags">${selected.actPreview.map((item) => `<span class="collection-tag">${escapeHtml(item)}</span>`).join('')}</div>`
                : ''}
                    </section>
                    <section class="collection-detail-card collection-memory-panel">
                        <span class="detail-mini-label">伏魔台记忆战</span>
                        <div class="detail-status-strip">
                            <span class="detail-status-chip ${escapeHtml(selected.memoryStatus)}">${escapeHtml(selected.memoryStatusLabel)}</span>
                            <span class="detail-status-chip">试作 ${escapeHtml(selected.memoryRecord.attempts || 0)} 次</span>
                            <span class="detail-status-chip">${selected.memoryRecord.bestTurn > 0 ? `最快 ${escapeHtml(selected.memoryRecord.bestTurn)} 回合` : '尚无最快轮次'}</span>
                        </div>
                        <p>${escapeHtml(selected.memorySummary)}</p>
                        <div class="collection-detail-actions">
                            <button type="button"
                                class="collection-inline-btn ${selected.memoryReady ? '' : 'secondary'}"
                                ${selected.memoryReady ? '' : 'disabled'}
                                onclick="game.startBossMemoryBattle('${escapeHtml(selected.id)}')">${selected.memoryReady ? '发起记忆战' : '需先击破本体'}</button>
                            <button type="button"
                                class="collection-inline-btn secondary"
                                onclick="game.switchCollectionSection('chapters')">对照章节档案</button>
                        </div>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">建议反制法宝</span>
                        <div class="collection-card-tags">
                            ${selected.counterTreasures.length > 0
                ? selected.counterTreasures.map((item) => `<span class="collection-tag">${escapeHtml(item.icon)} ${escapeHtml(item.name)}</span>`).join('')
                : '<span class="collection-tag muted">暂无明确法宝反制</span>'}
                        </div>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">通关样本对照</span>
                        ${selected.sampleBoard && selected.sampleBoard.count > 0
                ? `
                            <div class="detail-status-strip">
                                <span class="detail-status-chip">样本 ${escapeHtml(selected.sampleBoard.count)}</span>
                                <span class="detail-status-chip">角色 ${escapeHtml(selected.sampleBoard.uniqueCharacters)}</span>
                                <span class="detail-status-chip">${selected.sampleBoard.bestTurn > 0 ? `最快 ${escapeHtml(selected.sampleBoard.bestTurn)} 回合` : '暂无轮次记录'}</span>
                            </div>
                            <ul class="collection-detail-list">
                                ${selected.sampleBoard.entries.map((sample) => `
                                    <li>
                                        ${escapeHtml(sample.headline)} · ${escapeHtml(sample.subtitle)}
                                        ${sample.tagLine.length > 0 ? `（${escapeHtml(sample.tagLine.join(' / '))}）` : ''}
                                    </li>
                                `).join('')}
                            </ul>
                            ${Array.isArray(selected.sampleBoard.recommendation?.lines) && selected.sampleBoard.recommendation.lines.length > 0
                ? `
                                <p class="collection-muted">自动推荐摘要</p>
                                <ul class="collection-detail-list">
                                    ${selected.sampleBoard.recommendation.lines.slice(0, 4).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
                                </ul>
                            `
                : ''}
                        `
                : `<p>${escapeHtml(selected.sampleBoard?.emptyText || '当前还没有这位主宰的通关样本。')}</p>`}
                    </section>
                </div>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">招式速记</span>
                    <ul class="collection-detail-list">
                        ${(selected.patternPreview || []).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
                    </ul>
                </section>
            </div>
        `;

        summary.innerHTML = [
            '<span class="codex-side-kicker">主宰总览</span>',
            '<h3>Boss 档案进度</h3>',
            '<div class="codex-summary-grid two-cols">',
            `<div class="codex-summary-chip"><strong>${entries.length}</strong><span>主宰总数</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.filter((entry) => entry.status === 'defeated').length}</strong><span>已击破</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.filter((entry) => entry.memoryRecord.clears > 0).length}</strong><span>记忆战留痕</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.reduce((sum, entry) => sum + clampInt(entry.memoryRecord.attempts || 0, 0), 0)}</strong><span>总试作次数</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.filter((entry) => entry.pressureScore >= 1.45).length}</strong><span>高压主宰</span></div>`,
            `<div class="codex-summary-chip"><strong>${progress.runPathBossSampleCount || 0}</strong><span>样本对照</span></div>`,
            '</div>',
            `<p class="codex-side-note">Boss 档案现在会把章节背景、核心机制、反制法宝与伏魔台记忆战记录压在同一页${entries.some((entry) => entry.runPathMatchup) ? '，并按当前命途补充适配评级与拆招建议' : ''}${(progress.runPathBossSampleCount || 0) > 0 ? '，同时把已归档的角色 × 命途 × Boss 样本放进对照榜' : ''}，方便边读边练。</p>`
        ].join('');

        hints.innerHTML = [
            '<span class="codex-side-kicker">复盘提示</span>',
            '<h3>怎么读主宰</h3>',
            '<ul class="codex-side-list compact">',
            '<li>先看主机制决定这场是抢节奏、稳资源，还是必须带净化 / 反制法宝。</li>',
            '<li>再看招式速记，提前规划哪一拍要留防、哪一拍能转攻。</li>',
            '<li>最后用伏魔台记忆战把理论过一遍，最快轮次会比单次胜负更能说明你是否真的读懂了这位主宰。</li>',
            '</ul>'
        ].join('');
    };

    Game.prototype.renderBuildSnapshot = function () {
        if (typeof document === 'undefined') return;
        const hero = document.getElementById('build-snapshot-hero');
        const metrics = document.getElementById('build-snapshot-metrics');
        const notes = document.getElementById('build-snapshot-notes');
        const highlights = document.getElementById('build-snapshot-highlights');
        const summary = document.getElementById('build-snapshot-summary');
        const guide = document.getElementById('build-snapshot-guide');
        if (!hero || !metrics || !notes || !highlights || !summary || !guide) return;

        const snapshot = this.getBuildSnapshotData();
        const selectedGuide = typeof this.getSelectedObservatoryExpeditionGuide === 'function'
            ? this.getSelectedObservatoryExpeditionGuide({ silentSync: true })
            : null;
        const lineage = snapshot.lineage && typeof snapshot.lineage === 'object'
            ? snapshot.lineage
            : null;
        const profile = snapshot.profile;
        hero.innerHTML = `
            <div class="collection-detail-shell">
                <section class="collection-detail-hero">
                    <div class="collection-detail-hero-main">
                        <div class="collection-detail-icon">${escapeHtml(snapshot.runPath?.icon || snapshot.spirit?.icon || snapshot.destiny?.icon || '🧭')}</div>
                        <div class="collection-detail-meta">
                            <span class="codex-side-kicker">构筑总览</span>
                            <h3>${escapeHtml(snapshot.archetypeLabel)}</h3>
                            <p>${escapeHtml(snapshot.chapter?.fullName || '当前尚未进入章节')}${snapshot.chapter?.skyOmen?.name ? ` · 天象 ${escapeHtml(snapshot.chapter.skyOmen.name)}` : ''}${snapshot.runPath?.name ? ` · 命途 ${escapeHtml(snapshot.runPath.name)}` : ''}</p>
                        </div>
                    </div>
                    <div class="detail-status-strip">
                        <span class="detail-status-chip">牌组 ${escapeHtml(profile.size)} 张</span>
                        <span class="detail-status-chip">均费 ${escapeHtml(profile.avgCost.toFixed(1))}</span>
                        <span class="detail-status-chip">装配法则 ${escapeHtml(snapshot.loadedLaws.length)}</span>
                        <span class="detail-status-chip">法宝 ${escapeHtml(snapshot.equippedTreasures.length)}</span>
                        <span class="detail-status-chip">命途 ${escapeHtml(snapshot.runPath?.name || '未挂')}</span>
                    </div>
                    ${snapshot.nextChapterRiskTags.length > 0
                ? `
                        <div class="collection-card-tags">
                            ${snapshot.nextChapterRiskTags.map((tag) => `<span class="collection-tag danger">${escapeHtml(tag)}</span>`).join('')}
                        </div>
                    `
                : ''}
                    ${snapshot.sampleMismatchWarning
                ? `<p class="collection-alert danger">${escapeHtml(snapshot.sampleMismatchWarning.title)}：${escapeHtml(snapshot.sampleMismatchWarning.text)}</p>`
                : ''}
                </section>
            </div>
        `;

        metrics.innerHTML = `
            <div class="build-metric-grid">
                <div class="build-metric-card">
                    <strong>${escapeHtml(profile.counts.attack || 0)}</strong>
                    <span>攻击牌</span>
                </div>
                <div class="build-metric-card">
                    <strong>${escapeHtml(profile.counts.defense || 0)}</strong>
                    <span>防御牌</span>
                </div>
                <div class="build-metric-card">
                    <strong>${escapeHtml(profile.counts.law || 0)}</strong>
                    <span>法则牌</span>
                </div>
                <div class="build-metric-card">
                    <strong>${escapeHtml(snapshot.vows.length)}</strong>
                    <span>当前誓约</span>
                </div>
            </div>
            <div class="collection-mini-grid">
                <div class="collection-mini-card">
                    <strong>${escapeHtml(snapshot.destiny?.name || '未挂命格')}</strong>
                    <span>命格</span>
                    <p>${escapeHtml(snapshot.destiny?.summary || '先选命格再看章节顺势建议。')}</p>
                </div>
                <div class="collection-mini-card">
                    <strong>${escapeHtml(snapshot.spirit?.name || '未挂灵契')}</strong>
                    <span>灵契</span>
                    <p>${escapeHtml(snapshot.spirit?.summary || '灵契缺位时，中后段章节很难补足护道。')}</p>
                </div>
                <div class="collection-mini-card">
                    <strong>${escapeHtml(snapshot.runPath?.name || '未挂命途')}</strong>
                    <span>命途碑廊</span>
                    <p>${escapeHtml(snapshot.runPathRecord?.clears > 0
                ? `已收录 ${snapshot.runPathRecord.clears} 份战录，最近完成于${this.formatCollectionTimestamp(snapshot.runPathRecord.lastCompletedAt)}。`
                : '当前命途尚未圆满，完成后会把战录自动收入洞府。')}</p>
                </div>
            </div>
        `;

        notes.innerHTML = `
            <div class="collection-detail-grid">
                <section class="collection-detail-card">
                    <span class="detail-mini-label">当前优势</span>
                    <ul class="collection-detail-list">
                        ${snapshot.strengths.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
                    </ul>
                </section>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">主要缺口</span>
                    <ul class="collection-detail-list">
                        ${snapshot.gaps.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
                    </ul>
                </section>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">补件优先级队列</span>
                    <ul class="collection-detail-list">
                        ${snapshot.priorityQueue.length > 0
                ? snapshot.priorityQueue.map((entry) => `<li>${entry.rank}. ${escapeHtml(entry.label)}：${escapeHtml(entry.detail)}</li>`).join('')
                : snapshot.nextTargets.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
                    </ul>
                </section>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">当前装配</span>
                    <div class="collection-card-tags">
                        ${snapshot.loadedLaws.length > 0
                ? snapshot.loadedLaws.map((law) => `<span class="collection-tag">${escapeHtml(law.icon || '📜')} ${escapeHtml(law.name || law.id)}</span>`).join('')
                : '<span class="collection-tag muted">命环暂未装满</span>'}
                        ${snapshot.equippedTreasures.length > 0
                ? snapshot.equippedTreasures.slice(0, 3).map((treasure) => `<span class="collection-tag">${escapeHtml(treasure.icon || '🏺')} ${escapeHtml(treasure.name || treasure.id)}</span>`).join('')
                : '<span class="collection-tag muted">法宝位未装配</span>'}
                    </div>
                </section>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">样本对照</span>
                    ${snapshot.runPathSampleBoard && snapshot.runPathSampleBoard.count > 0
                ? `
                        <div class="detail-status-strip">
                            <span class="detail-status-chip">样本 ${escapeHtml(snapshot.runPathSampleBoard.count)}</span>
                            <span class="detail-status-chip">角色 ${escapeHtml(snapshot.runPathSampleBoard.uniqueCharacters)}</span>
                            <span class="detail-status-chip">${snapshot.runPathSampleBoard.bestTurn > 0 ? `最快 ${escapeHtml(snapshot.runPathSampleBoard.bestTurn)} 回合` : '暂无轮次记录'}</span>
                        </div>
                        <ul class="collection-detail-list">
                            ${snapshot.runPathSampleBoard.entries.map((sample) => `
                                <li>
                                    ${escapeHtml(sample.headline)} · ${escapeHtml(sample.subtitle)}
                                    ${sample.tagLine.length > 0 ? `（${escapeHtml(sample.tagLine.join(' / '))}）` : ''}
                                </li>
                            `).join('')}
                        </ul>
                        ${Array.isArray(snapshot.runPathSampleBoard.recommendation?.lines) && snapshot.runPathSampleBoard.recommendation.lines.length > 0
                ? `
                            <p class="collection-muted">自动推荐摘要</p>
                            <ul class="collection-detail-list">
                                ${snapshot.runPathSampleBoard.recommendation.lines.slice(0, 4).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
                            </ul>
                        `
                : ''}
                    `
                : `<p>${escapeHtml(snapshot.runPathSampleBoard?.emptyText || '当前还没有命途样本，先把一位章节 Boss 打成稳定收官。')}</p>`}
                </section>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">下一章风险镜像</span>
                    ${snapshot.nextChapter
                ? `
                        <div class="detail-status-strip">
                            <span class="detail-status-chip ${snapshot.sampleMismatchWarning ? 'pending' : 'ready'}">${escapeHtml(snapshot.nextChapter.name || '下一章')}</span>
                            <span class="detail-status-chip">${escapeHtml(snapshot.nextChapter.dangerProfile?.tierLabel || '待推演')}压力</span>
                            <span class="detail-status-chip">${escapeHtml(snapshot.nextChapter.dangerProfile?.dominantLabel || '风险未定')}</span>
                        </div>
                        <div class="collection-card-tags">
                            ${snapshot.nextChapterRiskTags.map((tag) => `<span class="collection-tag danger">${escapeHtml(tag)}</span>`).join('')}
                        </div>
                        <p>${escapeHtml(snapshot.nextChapter.dangerProfile?.counterplay || '先保留至少一条护阵与净化链路，再考虑扩伤。')}</p>
                        ${snapshot.sampleMismatchWarning ? `<p class="collection-alert danger">${escapeHtml(snapshot.sampleMismatchWarning.text)}</p>` : ''}
                    `
                : '<p>当前已在终章，没有下一章风险镜像，重点转向终局答卷校验。</p>'}
                </section>
                ${lineage?.available
                ? `
                <section class="collection-detail-card" data-fate-lineage-card="build">
                    <span class="detail-mini-label">命盘谱系</span>
                    <strong data-fate-lineage-summary="true">${escapeHtml(lineage.summaryLine || '长期主修待沉淀')}</strong>
                    <p>${escapeHtml(lineage.detailLine || '当前谱系会把角色、流派、节点与研究四条线压成同一份长期画像。')}</p>
                    <ul class="collection-detail-list compact">
                        ${(lineage.tracks || []).map((track) => `<li data-fate-lineage-track="${escapeHtml(track.id || '')}">${escapeHtml(`${track.icon || '✦'} ${track.label || '谱系'}：${track.summaryLine || track.progressText || '等待留痕。'}`)}</li>`).join('')}
                    </ul>
                </section>
                `
                : ''}
            </div>
        `;

        highlights.innerHTML = `
            <div class="build-metric-grid">
                ${snapshot.highlights.map((item) => `
                    <div class="build-metric-card">
                        <strong>${escapeHtml(item.value)}</strong>
                        <span>${escapeHtml(item.label)}</span>
                        <p>${escapeHtml(item.note)}</p>
                    </div>
                `).join('')}
            </div>
        `;

        summary.innerHTML = [
            '<span class="codex-side-kicker">构筑概览</span>',
            '<h3>这一套在打什么</h3>',
            '<ul class="codex-side-list compact">',
            `<li>${escapeHtml(snapshot.archetypeLabel)}</li>`,
            `<li>主类型：${escapeHtml(profile.dominantType)} · 当前章节：${escapeHtml(snapshot.chapter?.name || '未定')}</li>`,
            `<li>当前誓约：${escapeHtml(snapshot.vows.map((meta) => meta.name).join('、') || '暂无')}</li>`,
            `<li>当前命途：${escapeHtml(snapshot.runPath?.name || '未挂')} · 已完成命途 ${escapeHtml(snapshot.completedRunPaths || 0)} / ${escapeHtml(snapshot.totalRunPaths || 0)}</li>`,
            `<li>样本对照：${escapeHtml(snapshot.runPathSampleBoard?.count || 0)} 份 · ${snapshot.runPathSampleBoard?.bestTurn > 0 ? `当前最快 ${escapeHtml(snapshot.runPathSampleBoard.bestTurn)} 回合` : '尚未形成最快轮次'}</li>`,
            `<li>当前精选命盘：${escapeHtml(selectedGuide ? `${selectedGuide.title} · ${selectedGuide.themeLabel || '观星样本'}` : '未锁定，可先去观星台精选一份命盘答卷')}</li>`,
            lineage?.available ? `<li data-fate-lineage-summary="true">命盘谱系：${escapeHtml(lineage.summaryLine || '长期主修待沉淀')}</li>` : '',
            `<li>下一章风险：${escapeHtml(snapshot.nextChapterRiskTags.join(' / ') || '终章前暂无额外镜像')}</li>`,
            snapshot.sampleMismatchWarning ? `<li>误配告警：${escapeHtml(snapshot.sampleMismatchWarning.text)}</li>` : '',
            '</ul>'
        ].join('');

        guide.innerHTML = [
            '<span class="codex-side-kicker">阅读顺序</span>',
            '<h3>怎么用这页复盘</h3>',
            '<ul class="codex-side-list compact">',
            '<li>先看“下一章风险镜像”，确认下一章真正高危的是爆发、续航、控场还是资源税。</li>',
            '<li>再看“补件优先级队列”，按 1/2/3 的顺序补，不要平均摊资源。</li>',
            '<li>样本对照会告诉你这条命途到底是谁在打、打哪位 Boss 最稳、最快能压到多少回合。</li>',
            lineage?.available
                ? `<li data-fate-lineage-guide="build">${escapeHtml(lineage.guideLine || lineage.detailLine || '命盘谱系会把角色、流派、节点与研究压成一份长期身份画像。')}</li>`
                : '',
            selectedGuide
                ? `<li>当前精选命盘：${escapeHtml(selectedGuide.title)} · ${escapeHtml(selectedGuide.themeLabel || '观星样本')}，适合先按这份开局答卷补前两手资源与路线。</li>`
                : '<li>若还没有锁定精选命盘，先去观星台选一份高分答卷，再回这里对照补件顺序。</li>',
            '<li>若出现“误配告警”，优先纠偏场域，而不是继续硬抬当前章的随机收益。</li>',
            '</ul>'
        ].join('');
    };

    Game.prototype.renderRunSlateShelf = function () {
        if (typeof document === 'undefined') return;
        const grid = document.getElementById('run-slate-shelf-grid');
        const detail = document.getElementById('run-slate-shelf-detail');
        const summary = document.getElementById('run-slate-shelf-summary');
        const guide = document.getElementById('run-slate-shelf-guide');
        const themeFilter = document.getElementById('run-slate-shelf-theme-filter');
        const chapterFilter = document.getElementById('run-slate-shelf-chapter-filter');
        const ratingFilter = document.getElementById('run-slate-shelf-rating-filter');
        if (!grid || !detail || !summary || !guide) return;

        const state = this.getCollectionHubState();
        const entries = this.getRunSlateShelfEntries();
        const activeTrainingFocus = typeof this.getObservatoryTrainingFocus === 'function'
            ? this.getObservatoryTrainingFocus()
            : null;
        const themeOptions = [
            { value: 'all', label: `全部主题 · ${entries.length}` },
            ...Array.from(entries.reduce((map, entry) => {
                if (!entry.themeKey || map.has(entry.themeKey)) return map;
                map.set(entry.themeKey, {
                    value: entry.themeKey,
                    label: `${entry.themeLabel || entry.themeKey} · ${entries.filter((item) => item.themeKey === entry.themeKey).length}`
                });
                return map;
            }, new Map()).values())
        ];
        const chapterOptions = [
            { value: 'all', label: `全部章节 · ${entries.length}` },
            ...Array.from(entries.reduce((map, entry) => {
                const key = String(entry.chapterIndex || '');
                if (!key || map.has(key)) return map;
                map.set(key, {
                    value: key,
                    label: `${entry.chapterName} · ${entries.filter((item) => String(item.chapterIndex) === key).length}`
                });
                return map;
            }, new Map()).values())
        ];
        const ratingOptions = [
            { value: 'all', label: `全部评级 · ${entries.length}` },
            ...Array.from(entries.reduce((map, entry) => {
                const key = String(entry.ratingLabel || '').trim();
                if (!key || map.has(key)) return map;
                map.set(key, {
                    value: key,
                    label: `${key} · ${entries.filter((item) => item.ratingLabel === key).length}`
                });
                return map;
            }, new Map()).values())
        ];

        if (themeFilter) {
            themeFilter.innerHTML = themeOptions.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join('');
            themeFilter.value = themeOptions.some((option) => option.value === state.slateTheme) ? state.slateTheme : 'all';
        }
        if (chapterFilter) {
            chapterFilter.innerHTML = chapterOptions.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join('');
            chapterFilter.value = chapterOptions.some((option) => option.value === state.slateChapter) ? state.slateChapter : 'all';
        }
        if (ratingFilter) {
            ratingFilter.innerHTML = ratingOptions.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join('');
            ratingFilter.value = ratingOptions.some((option) => option.value === state.slateRating) ? state.slateRating : 'all';
        }

        const filtered = entries.filter((entry) => this.passesRunSlateShelfFilter(entry));
        const selected = filtered.find((entry) => entry.id === this.selectedRunSlateId) || filtered[0] || null;
        this.selectedRunSlateId = selected?.id || '';

        grid.innerHTML = filtered.length > 0
            ? filtered.map((entry) => `
                <button type="button"
                    class="collection-card run-slate-card ${entry.id === this.selectedRunSlateId ? 'selected' : ''} tone-${escapeHtml(entry.ratingTone)}"
                    data-run-slate-card="true"
                    data-run-slate-id="${escapeHtml(entry.id)}"
                    data-run-slate-selected="${entry.id === this.selectedRunSlateId ? 'true' : 'false'}"
                    onclick="game.selectRunSlateShelfEntry('${escapeHtml(entry.id)}')">
                    <div class="collection-card-top">
                        <span class="collection-card-icon">${escapeHtml(entry.endingIcon || '🧭')}</span>
                        <span class="collection-status-chip ${escapeHtml(entry.ratingTone)}">${escapeHtml(entry.ratingLabel)}</span>
                    </div>
                    <div class="collection-card-body">
                        <span class="collection-card-kicker">${escapeHtml(entry.themeLabel || '归卷档案')}</span>
                        <h4>${escapeHtml(`${entry.chapterName} · ${entry.endingName}`)}</h4>
                        <p>${escapeHtml(entry.highlightLine || entry.trainingAdvice || `${entry.branchName} · ${entry.score} 分`)}</p>
                    </div>
                    <div class="collection-card-tags">
                        <span class="collection-tag">评分 ${escapeHtml(entry.score)}</span>
                        ${entry.sourceTitle ? `<span class="collection-tag">${escapeHtml(entry.sourceTitle)}</span>` : `<span class="collection-tag">${escapeHtml(entry.branchName)}</span>`}
                        ${entry.trainingTags[0] ? `<span class="collection-tag">${escapeHtml(`主练·${entry.trainingTags[0]}`)}</span>` : ''}
                        ${entry.currentTraining ? '<span class="collection-tag emphasis">当前主练</span>' : ''}
                    </div>
                </button>
            `).join('')
            : '<div class="codex-empty-state">当前筛面下还没有匹配的归卷答卷，试着切回全部主题或先完成一章远征。</div>';

        summary.innerHTML = [
            '<span class="codex-side-kicker">书架总览</span>',
            '<h3>这轮都留下了什么</h3>',
            '<div class="codex-summary-grid two-cols">',
            `<div class="codex-summary-chip"><strong>${entries.length}</strong><span>已归卷答卷</span></div>`,
            `<div class="codex-summary-chip"><strong>${filtered.length}</strong><span>当前筛中</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.reduce((max, entry) => Math.max(max, entry.score), 0)}</strong><span>最高评分</span></div>`,
            `<div class="codex-summary-chip"><strong>${entries.filter((entry) => entry.trainingReady).length}</strong><span>可回流主练</span></div>`,
            '</div>',
            '<ul class="codex-side-list compact">',
            activeTrainingFocus?.trainingAdvice
                ? `<li>当前主练：${escapeHtml(activeTrainingFocus.chapterName || '最近归卷')} · ${escapeHtml(activeTrainingFocus.trainingAdvice)}</li>`
                : '<li>当前还没有主练回流，可从任意一份归卷答卷里指定新的训练参考。</li>',
            selected
                ? `<li>选中答卷：${escapeHtml(selected.chapterName)} · ${escapeHtml(selected.ratingLabel)} · 记录于 ${escapeHtml(selected.timestampLabel)}</li>`
                : '<li>先完成一章远征，书架就会自动收进第一份章节答卷。</li>',
            selected?.bountyLine ? `<li>悬赏收官：${escapeHtml(selected.bountyLine)}</li>` : '',
            selected?.factionLine ? `<li>势力走向：${escapeHtml(selected.factionLine)}</li>` : '',
            selected?.nemesisName ? `<li>追猎结果：${escapeHtml(`${selected.nemesisName} · ${selected.nemesisStatusLabel || '待定'}`)}</li>` : '',
            '</ul>'
        ].join('');

        guide.innerHTML = [
            '<span class="codex-side-kicker">使用建议</span>',
            '<h3>怎么把书架喂回主线</h3>',
            '<ul class="codex-side-list compact">',
            '<li>先按主题筛一遍，看自己最近是在补哪类题，不要把不同课题的答卷混着比。</li>',
            '<li>再按章节和评级缩小范围，优先复盘“高分但仍有偏题提醒”的卷子，这类最适合转成稳定主练。</li>',
            '<li>“设为当前训练参考”只会更新这轮主练，不会清空观星留痕或旧样本。</li>',
            '<li>“回观星复盘”会带着当前答卷的主练主题回到观察站，方便直接继续筛留痕。</li>',
            selected?.compareHint ? `<li>当前卷的对照抓手：${escapeHtml(selected.compareHint)}</li>` : '',
            '</ul>'
        ].join('');

        if (!selected) {
            detail.innerHTML = '<div class="codex-empty-state">归卷书架当前为空，先打一章远征再回来复盘。</div>';
            return;
        }

        const canSetTraining = selected.trainingReady
            && typeof this.buildObservatoryTrainingFocusFromSlate === 'function'
            && typeof this.setObservatoryTrainingFocus === 'function';
        const canReviewInObservatory = canSetTraining && typeof this.showChallengeHub === 'function';
        detail.innerHTML = `
            <div class="collection-detail-shell">
                <section class="collection-detail-hero">
                    <div class="collection-detail-hero-main">
                        <div class="collection-detail-icon">${escapeHtml(selected.endingIcon || '🧭')}</div>
                        <div class="collection-detail-meta">
                            <span class="codex-side-kicker">章节答卷</span>
                            <h3>${escapeHtml(`${selected.chapterName} · ${selected.endingName}`)}</h3>
                            <p>${escapeHtml(selected.highlightLine || selected.trainingAdvice || '这份答卷已经归卷，可继续拿来做路线与训练复盘。')}</p>
                        </div>
                    </div>
                    <div class="detail-status-strip">
                        <span class="detail-status-chip ${escapeHtml(selected.ratingTone)}">${escapeHtml(selected.ratingLabel)}</span>
                        <span class="detail-status-chip">${escapeHtml(`评分 ${selected.score}`)}</span>
                        <span class="detail-status-chip">${escapeHtml(selected.themeLabel || selected.branchName)}</span>
                        ${selected.currentTraining ? '<span class="detail-status-chip ready">当前主练</span>' : ''}
                    </div>
                </section>
                <div class="collection-action-row">
                    <button type="button" class="collection-inline-btn"
                        data-run-slate-train-focus="true"
                        data-run-slate-id="${escapeHtml(selected.id)}"
                        onclick="game.applyRunSlateShelfTrainingFocus('${escapeHtml(selected.id)}')"
                        ${!canSetTraining || selected.currentTraining ? 'disabled' : ''}>${selected.currentTraining ? '当前训练参考' : '设为当前训练参考'}</button>
                    <button type="button" class="collection-inline-btn secondary"
                        data-run-slate-review-observatory="true"
                        data-run-slate-id="${escapeHtml(selected.id)}"
                        onclick="game.reviewRunSlateInObservatory('${escapeHtml(selected.id)}')"
                        ${!canReviewInObservatory ? 'disabled' : ''}>回观星复盘</button>
                </div>
                <div class="collection-detail-grid">
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">主练建议</span>
                        <strong>${escapeHtml(selected.sourceTitle || selected.themeLabel || '章节回响')}</strong>
                        <p>${escapeHtml(selected.trainingAdvice || '当前这份答卷还没有生成训练建议，先去完成带训练提示的章节答卷。')}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">样本路径</span>
                        <p>${escapeHtml(selected.routeFocusLine || '这份归卷暂未留下样本路径，后续可在观星台继续补路线样本。')}</p>
                        ${selected.compareHint ? `<p class="collection-muted">${escapeHtml(`对照抓手：${selected.compareHint}`)}</p>` : ''}
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">章节留痕</span>
                        <p>${escapeHtml(selected.branchName)}</p>
                        <p class="collection-muted">${escapeHtml(selected.bountyLine || '本卷没有额外悬赏收官记录。')}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">势力与追猎</span>
                        <p>${escapeHtml(selected.factionLine || '本卷没有留下明显势力倾向。')}</p>
                        <p class="collection-muted">${escapeHtml(selected.nemesisName ? `${selected.nemesisName} · ${selected.nemesisStatusLabel || '待定'}${selected.nemesisVariantLabel ? ` · ${selected.nemesisVariantLabel}` : ''}` : '本卷没有留下额外宿敌追猎记录。')}</p>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">偏题与抓手</span>
                        <ul class="collection-detail-list">
                            ${(selected.goalHighlights.length > 0 ? selected.goalHighlights : ['当前卷没有额外抓手摘要，先看评分拆解里的路线记录。']).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
                        </ul>
                    </section>
                    <section class="collection-detail-card">
                        <span class="detail-mini-label">评分拆解</span>
                        <ul class="collection-detail-list">
                            ${(selected.scoreBreakdown.length > 0 ? selected.scoreBreakdown : ['这份归卷还没有额外拆解条目。']).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
                        </ul>
                    </section>
                </div>
                <section class="collection-detail-card">
                    <span class="detail-mini-label">答卷标签</span>
                    <div class="collection-card-tags">
                        ${(selected.tags.length > 0 ? selected.tags : ['归卷书架', selected.ratingLabel, selected.themeLabel || '未定课题'])
                .filter(Boolean)
                .map((tag) => `<span class="collection-tag">${escapeHtml(tag)}</span>`).join('')}
                        ${selected.trainingTags.map((tag) => `<span class="collection-tag emphasis">${escapeHtml(`主练·${tag}`)}</span>`).join('')}
                    </div>
                    ${selected.nemesisClueLine ? `<p class="collection-muted">${escapeHtml(`追猎线索：${selected.nemesisClueLine}`)}</p>` : ''}
                </section>
            </div>
        `;
    };

    Game.prototype.renderSanctumOverview = function () {
        if (typeof document === 'undefined') return;
        const roomGrid = document.getElementById('sanctum-room-grid');
        const researchList = document.getElementById('sanctum-research-list');
        const goalList = document.getElementById('sanctum-goal-list');
        const unlockFeed = document.getElementById('sanctum-unlock-feed');
        const summary = document.getElementById('sanctum-summary');
        const progressCard = document.getElementById('sanctum-progress');
        const guide = document.getElementById('sanctum-guide');
        if (!roomGrid || !researchList || !goalList || !unlockFeed || !summary || !progressCard || !guide) return;

        const data = this.getSanctumOverviewData();
        const selectedGuide = typeof this.getSelectedObservatoryExpeditionGuide === 'function'
            ? this.getSelectedObservatoryExpeditionGuide({ silentSync: true })
            : null;
        const agenda = data.agenda && typeof data.agenda === 'object' ? data.agenda : {};
        const activeAgenda = agenda.active && typeof agenda.active === 'object' ? agenda.active : null;
        const lastAgenda = agenda.lastResolved && typeof agenda.lastResolved === 'object' ? agenda.lastResolved : null;
        const seasonBoard = buildSeasonBoardOverviewModel(
            data.seasonBoard && typeof data.seasonBoard === 'object' ? data.seasonBoard : null
        );
        const lineage = data.lineage && typeof data.lineage === 'object' ? data.lineage : null;
        const aftereffects = data.aftereffects && typeof data.aftereffects === 'object' ? data.aftereffects : null;
        const primaryAftereffect = aftereffects?.primary || aftereffects?.records?.[0] || null;
        const heavenlyMandate = buildHeavenlyMandateOverviewModel(
            data.mandate && typeof data.mandate === 'object' ? data.mandate : null,
            data.heavenlyMandate && typeof data.heavenlyMandate === 'object' ? data.heavenlyMandate : null
        );
        const heavenlyMandateFocusTask = heavenlyMandate.focusTask && typeof heavenlyMandate.focusTask === 'object'
            ? heavenlyMandate.focusTask
            : (heavenlyMandate.nextTask && typeof heavenlyMandate.nextTask === 'object'
                ? heavenlyMandate.nextTask
                : null);
        const heavenlyMandateFocusActionMeta = resolveSeasonBoardActionMeta(
            heavenlyMandateFocusTask?.anchorSection,
            'sanctum'
        );
        const seasonBoardLanes = Array.isArray(seasonBoard.lanes) ? seasonBoard.lanes : [];
        const seasonBoardLaneRewards = Array.isArray(seasonBoard.laneRewards)
            ? seasonBoard.laneRewards.filter((entry) => entry && typeof entry === 'object')
            : [];
        const seasonBoardClaimableLaneRewards = seasonBoardLaneRewards.filter((entry) => entry.claimable);
        const seasonSettlement = seasonBoard.settlement && typeof seasonBoard.settlement === 'object'
            ? seasonBoard.settlement
            : null;
        const seasonDebtPack = seasonBoard.debtPack && typeof seasonBoard.debtPack === 'object'
            ? seasonBoard.debtPack
            : null;
        const seasonFrontier = seasonBoard.frontier && typeof seasonBoard.frontier === 'object'
            ? seasonBoard.frontier
            : null;
        const seasonFrontierDecree = seasonFrontier?.decree && typeof seasonFrontier.decree === 'object'
            ? seasonFrontier.decree
            : null;
        const seasonFrontierChronicle = seasonFrontier?.chronicle && typeof seasonFrontier.chronicle === 'object'
            ? seasonFrontier.chronicle
            : null;
        const seasonFrontierCouncil = seasonFrontier?.council && typeof seasonFrontier.council === 'object'
            ? seasonFrontier.council
            : null;
        const seasonVerificationArchive = seasonBoard.verificationArchive && typeof seasonBoard.verificationArchive === 'object'
            ? seasonBoard.verificationArchive
            : null;
        const seasonVerificationArchiveEntries = Array.isArray(seasonVerificationArchive?.entries)
            ? seasonVerificationArchive.entries.filter((entry) => entry && typeof entry === 'object').slice(0, 3)
            : [];
        const seasonVerificationArchiveLatest = seasonVerificationArchive?.latestEntry && typeof seasonVerificationArchive.latestEntry === 'object'
            ? seasonVerificationArchive.latestEntry
            : (seasonVerificationArchiveEntries[0] || null);
        const shouldSurfaceSeasonVerification = shouldSurfaceSeasonBoardVerification(seasonBoard, seasonSettlement);
        const seasonVerificationOrders = shouldSurfaceSeasonVerification && Array.isArray(seasonBoard.verificationOrders)
            ? seasonBoard.verificationOrders.filter((entry) => entry && typeof entry === 'object')
            : [];
        const seasonVerificationOrderPair = getSeasonBoardVerificationOrderPair(seasonVerificationOrders);
        const primarySeasonVerification = seasonVerificationOrderPair.primary;
        const heavenlyMandateBoard = Array.isArray(heavenlyMandate.lanes) ? heavenlyMandate.lanes : [];
        const resolveResearchAction = (research) => {
            if (research.actionType === 'agenda_activate') {
                return {
                    label: research.buttonLabel || '立为本轮议程',
                    onclick: `game.activateSanctumAgenda('${escapeHtml(research.actionValue || research.agendaId || '')}')`,
                    disabled: !!research.disabled,
                    extraAttrs: `data-sanctum-agenda-activate="true" data-sanctum-agenda-id="${escapeHtml(research.agendaId || research.actionValue || '')}"`
                };
            }
            if (research.actionType === 'agenda_decision') {
                return {
                    label: research.buttonLabel || '采用处置',
                    onclick: `game.chooseSanctumAgendaDecision('${escapeHtml(research.actionValue || '')}')`,
                    disabled: !!research.disabled,
                    extraAttrs: `data-sanctum-agenda-decision="true" data-sanctum-agenda-id="${escapeHtml(research.agendaId || '')}" data-sanctum-agenda-decision-id="${escapeHtml(research.actionValue || '')}"`
                };
            }
            if (research.actionType === 'agenda_contract') {
                return {
                    label: research.buttonLabel || '立契锁线',
                    onclick: `game.chooseSanctumAgendaContract('${escapeHtml(research.actionValue || '')}')`,
                    disabled: !!research.disabled,
                    extraAttrs: `data-sanctum-agenda-contract="true" data-sanctum-agenda-id="${escapeHtml(research.agendaId || '')}" data-sanctum-agenda-contract-id="${escapeHtml(research.actionValue || '')}"`
                };
            }
            if (research.actionType === 'treasure') {
                return {
                    label: research.buttonLabel || '查看成果',
                    onclick: 'game.showTreasureCompendium()',
                    disabled: false,
                    extraAttrs: ''
                };
            }
            if (research.actionType === 'challenge') {
                return {
                    label: research.buttonLabel || '查看成果',
                    onclick: `game.showChallengeHub('${escapeHtml(research.actionValue || 'daily')}')`,
                    disabled: false,
                    extraAttrs: ''
                };
            }
            if (research.actionType === 'screen') {
                return {
                    label: research.buttonLabel || '前往查看',
                    onclick: `game.showScreen('${escapeHtml(research.actionValue || 'map-screen')}')`,
                    disabled: false,
                    extraAttrs: ''
                };
            }
            if (research.actionType === 'season_board_lane_reward') {
                return {
                    label: research.buttonLabel || (research.ready ? '领取结题赏' : '查看结题赏'),
                    onclick: `game.claimSeasonBoardLaneReward('${escapeHtml(research.actionValue || research.laneId || '')}')`,
                    disabled: !!research.disabled || !research.ready,
                    extraAttrs: `data-season-board-lane-reward-claim="true" data-season-board-lane-reward-lane-id="${escapeHtml(research.actionValue || research.laneId || '')}"`
                };
            }
            return {
                label: research.buttonLabel || (research.ready ? '查看成果' : '查看线索'),
                onclick: `game.switchCollectionSection('${escapeHtml(research.section || research.actionValue || 'builds')}')`,
                disabled: false,
                extraAttrs: ''
            };
        };
        roomGrid.innerHTML = data.rooms.map((room) => `
            <article class="sanctum-room-card">
                <div class="sanctum-room-top">
                    <span class="sanctum-room-icon">${escapeHtml(room.icon)}</span>
                    <div>
                        <h4>${escapeHtml(room.name)}</h4>
                        <p>${escapeHtml(room.focus)}</p>
                    </div>
                </div>
                <p class="collection-muted">${escapeHtml(room.note)}</p>
                <button type="button" class="collection-inline-btn"
                    onclick="${room.actionType === 'treasure'
                ? 'game.showTreasureCompendium()'
                : room.actionType === 'challenge'
                    ? `game.showChallengeHub('${escapeHtml(room.actionValue || 'daily')}')`
                    : `game.switchCollectionSection('${escapeHtml(room.actionValue)}')`}">${escapeHtml(room.actionLabel)}</button>
            </article>
        `).join('');

        researchList.innerHTML = data.researches.map((research) => {
            const action = resolveResearchAction(research);
            const isSeasonBoardResearch = !!research.isSeasonBoardResearch || /^season_board/.test(String(research.id || ''));
            return `
            <article class="sanctum-research-item ${escapeHtml(research.toneClass || (research.ready ? 'ready' : 'tracking'))}"
                ${research.isAgenda ? `data-sanctum-agenda-card="true" data-sanctum-agenda-id="${escapeHtml(research.agendaId || '')}" data-sanctum-agenda-state="${escapeHtml(research.agendaState || '')}"` : ''}
                ${isSeasonBoardResearch ? `data-season-board-research="true" data-season-board-research-id="${escapeHtml(research.id || '')}" data-season-board-research-source="${escapeHtml(research.source || '')}" data-season-board-research-source-id="${escapeHtml(research.sourceId || '')}" data-season-board-research-task-source="${escapeHtml(research.taskSource || '')}" data-season-board-research-task-source-id="${escapeHtml(research.taskSourceId || '')}" data-season-board-research-task-id="${escapeHtml(research.taskId || '')}" data-season-board-research-lane-id="${escapeHtml(research.laneId || '')}"` : ''}>
                <div class="sanctum-research-meta">
                    <strong>${escapeHtml(research.name)}</strong>
                    <span>${escapeHtml(research.room)} · ${escapeHtml(research.progressLabel || '进度')} ${escapeHtml(research.progressText)}</span>
                </div>
                <p>${escapeHtml(research.reward)}</p>
                ${research.noteLine ? `<p class="collection-muted">${escapeHtml(research.noteLine)}</p>` : ''}
                <button type="button" class="collection-inline-btn"
                    ${isSeasonBoardResearch ? 'data-season-board-research-action="true"' : ''}
                    ${action.disabled ? 'disabled' : ''}
                    ${action.extraAttrs}
                    onclick="${action.onclick}">${escapeHtml(action.label)}</button>
            </article>
        `;
        }).join('');

        goalList.innerHTML = data.goals.length > 0
            ? data.goals.map((goal) => {
                const isHeavenlyMandateGoal = !!goal.isHeavenlyMandate || /^heavenly_mandate/.test(String(goal.id || ''));
                const isSeasonBoardGoal = !!goal.isSeasonBoardGoal || /^season_board/.test(String(goal.id || ''));
                return `
                <article class="sanctum-goal-item"
                    ${isHeavenlyMandateGoal ? `data-heavenly-mandate-goal="true" data-heavenly-mandate-week="${escapeHtml(goal.weekTag || heavenlyMandate.weekTag || '')}" data-heavenly-mandate-directive="${escapeHtml(goal.directiveName || heavenlyMandate.directiveName || '')}"` : ''}
                    ${isSeasonBoardGoal ? `data-season-board-goal="true" data-season-board-goal-id="${escapeHtml(goal.id || '')}" data-season-board-goal-source="${escapeHtml(goal.source || '')}" data-season-board-goal-source-id="${escapeHtml(goal.sourceId || '')}" data-season-board-goal-task-source="${escapeHtml(goal.taskSource || '')}" data-season-board-goal-task-source-id="${escapeHtml(goal.taskSourceId || '')}" data-season-board-goal-task-id="${escapeHtml(goal.taskId || '')}" data-season-board-goal-lane-id="${escapeHtml(goal.laneId || '')}"` : ''}>
                    <div class="sanctum-goal-top">
                        <span class="sanctum-goal-icon">${escapeHtml(goal.icon || '🎯')}</span>
                        <div>
                            <strong>${escapeHtml(goal.title)}</strong>
                            <p>${escapeHtml(goal.note)}</p>
                        </div>
                    </div>
                    <button type="button" class="collection-inline-btn"
                        ${isHeavenlyMandateGoal ? 'data-heavenly-mandate-action="true"' : ''}
                        ${isSeasonBoardGoal ? 'data-season-board-action="true"' : ''}
                        ${goal.action === 'season_board_lane_reward' ? `data-season-board-lane-reward-claim="true" data-season-board-lane-reward-lane-id="${escapeHtml(goal.laneId || goal.value || '')}" data-season-board-lane-reward-claimable="true"` : ''}
                        onclick="${isHeavenlyMandateGoal && goal.followTaskId
                ? `game.followHeavenlyMandateTask('${escapeHtml(goal.followTaskId)}')`
                : goal.action === 'season_board_lane_reward'
                ? `game.claimSeasonBoardLaneReward('${escapeHtml(goal.laneId || goal.value || '')}')`
                : goal.action === 'claim'
                ? `game.claimAchievement('${escapeHtml(goal.id)}')`
                : goal.action === 'treasure'
                    ? 'game.showTreasureCompendium()'
                : goal.action === 'challenge'
                    ? `game.showChallengeHub('${escapeHtml(goal.value || 'global')}')`
                : goal.action === 'screen'
                    ? `game.showScreen('${escapeHtml(goal.value || 'map-screen')}')`
                : `game.switchCollectionSection('${escapeHtml(goal.value || 'builds')}')`}">${goal.action === 'claim' ? '领取奖励' : escapeHtml(goal.buttonLabel || '前往查看')}</button>
                </article>
            `;
            }).join('')
            : '<div class="codex-empty-state">当前没有待领取目标，可以继续推进章节、法则或灵契研究。</div>';

        unlockFeed.innerHTML = data.recentUnlocks.length > 0
            ? data.recentUnlocks.map((entry) => `
                <article class="unlock-feed-item">
                    <div class="unlock-feed-main">
                        <span class="unlock-feed-icon">${escapeHtml(entry.icon || '✦')}</span>
                        <div>
                            <strong>${escapeHtml(entry.name)}</strong>
                            <p>${escapeHtml(entry.note || '已更新藏经阁记录')}</p>
                        </div>
                    </div>
                    <span class="unlock-feed-time">${escapeHtml(this.formatCollectionTimestamp(entry.timestamp))}</span>
                </article>
            `).join('')
            : '<div class="codex-empty-state">近期还没有新的藏经阁记录，去打一局或补一条研究线索吧。</div>';

        summary.innerHTML = [
            '<span class="codex-side-kicker">洞府概览</span>',
            '<h3>局外中枢进度</h3>',
            activeAgenda
                ? `<p data-sanctum-agenda-summary="true">${escapeHtml(`当前议程：${activeAgenda.name} · ${activeAgenda.progress}/${activeAgenda.target}${activeAgenda.phaseLabel ? ` · ${activeAgenda.phaseLabel}` : ''}`)}</p>`
                : (lastAgenda
                    ? `<p data-sanctum-agenda-summary="true">${escapeHtml(`最近结题：${lastAgenda.name} · ${lastAgenda.outcomeLabel || '研究留痕'}`)}</p>`
                    : '<p data-sanctum-agenda-summary="true">当前还没有立下洞府议程，可先从归卷书架挑一份答卷作为本轮承诺。</p>'),
            activeAgenda
                ? `<p class="collection-muted">${escapeHtml(
                    activeAgenda.selectedContractLabel
                        ? `已立契约：${activeAgenda.selectedContractLabel} · ${activeAgenda.selectedContractLine || activeAgenda.phaseLine || activeAgenda.focusNodeLine || ''}`
                        : activeAgenda.selectedDecisionLabel
                        ? `已选处置：${activeAgenda.selectedDecisionLabel} · ${activeAgenda.selectedDecisionLine || activeAgenda.phaseLine || activeAgenda.focusNodeLine || ''}`
                        : (activeAgenda.phaseLine || activeAgenda.focusNodeLine || activeAgenda.summaryLine || '')
                )}</p>`
                : (lastAgenda && (lastAgenda.recoveryLine || lastAgenda.grantedLine || lastAgenda.reasonLine || lastAgenda.summaryLine)
                    ? `<p class="collection-muted">${escapeHtml(lastAgenda.recoveryLine || lastAgenda.grantedLine || lastAgenda.reasonLine || lastAgenda.summaryLine)}</p>`
                    : ''),
            heavenlyMandate.available
                ? `<p data-heavenly-mandate-summary="true" data-heavenly-mandate-week="${escapeHtml(heavenlyMandate.weekTag || '')}" data-heavenly-mandate-directive="${escapeHtml(heavenlyMandate.directiveName || '')}">${escapeHtml(heavenlyMandate.summaryLine || '天道敕令待启封')}</p>`
                : '',
            heavenlyMandate.detailLine
                ? `<p class="collection-muted" data-heavenly-mandate-detail="true">${escapeHtml(heavenlyMandate.detailLine)}</p>`
                : '',
            seasonBoard.available
                ? `<p data-season-board-summary="true">${escapeHtml(seasonBoard.summaryLine || '赛季天道盘待同步')}</p>`
                : '',
            seasonBoard.detailLine
                ? `<p class="collection-muted" data-season-board-detail="true">${escapeHtml(seasonBoard.detailLine)}</p>`
                : '',
            seasonFrontier
                ? `<p class="collection-muted" data-season-board-frontier="true" data-season-board-frontier-id="${escapeHtml(seasonFrontier.primaryFrontId || '')}" data-season-board-frontier-pressure="${escapeHtml(seasonFrontier.statusId || '')}">${escapeHtml(seasonFrontier.summaryLine || `诸界战线：${seasonFrontier.primaryFrontLabel || '主战线'} · ${seasonFrontier.pressureLabel || seasonFrontier.statusLabel || '稳态'}`)}</p>`
                : '',
            seasonFrontierDecree
                ? `<p class="collection-muted" data-season-board-frontier-decree="true" data-season-board-frontier-decree-id="${escapeHtml(seasonFrontierDecree.id || '')}" data-season-board-frontier-decree-lane-id="${escapeHtml(seasonFrontierDecree.laneId || '')}">${escapeHtml([seasonFrontierDecree.summaryLine || seasonFrontierDecree.title || '', seasonFrontierDecree.constraintLine || ''].filter(Boolean).join(' · '))}</p>`
                : '',
            seasonFrontierChronicle
                ? `<p class="collection-muted" data-season-board-frontier-chronicle="true" data-season-board-frontier-chronicle-id="${escapeHtml(seasonFrontierChronicle.id || '')}" data-season-board-frontier-chronicle-lane-id="${escapeHtml(seasonFrontierChronicle.laneId || '')}">${escapeHtml([seasonFrontierChronicle.summaryLine || seasonFrontierChronicle.title || '', seasonFrontierChronicle.progressLine || ''].filter(Boolean).join(' · '))}</p>`
                : '',
            seasonFrontierCouncil
                ? `<p class="collection-muted" data-season-board-frontier-council="true" data-season-board-frontier-council-id="${escapeHtml(seasonFrontierCouncil.id || '')}" data-season-board-frontier-council-lane-id="${escapeHtml(seasonFrontierCouncil.laneId || '')}">${escapeHtml([seasonFrontierCouncil.summaryLine || seasonFrontierCouncil.title || '', seasonFrontierCouncil.verdictLine || ''].filter(Boolean).join(' · '))}</p>`
                : '',
            seasonSettlement
                ? `<p class="collection-muted" data-season-board-settlement="true">${escapeHtml(`季押卷：${seasonSettlement.outcomeLabel || '待押卷'}${seasonSettlement.summaryLine ? ` · ${seasonSettlement.summaryLine}` : ''}`)}</p>`
                : '',
            seasonDebtPack
                ? `<p class="collection-muted" data-season-board-debt="true">${escapeHtml(`债账：${seasonDebtPack.summaryLine || seasonDebtPack.guideLine || seasonDebtPack.progressText || '待清账'}`)}</p>`
                : '',
            primarySeasonVerification
                ? `<p class="collection-muted" data-season-board-verification="true">${escapeHtml(`结业验证：${primarySeasonVerification.summaryLine || primarySeasonVerification.hintLine || primarySeasonVerification.statusLine || primarySeasonVerification.label || '待验证'}`)}</p>`
                : '',
            lineage?.available
                ? `<p data-fate-lineage-summary="true">${escapeHtml(lineage.summaryLine || '命盘谱系待同步')}</p>`
                : '',
            lineage?.detailLine
                ? `<p class="collection-muted" data-fate-lineage-detail="true">${escapeHtml(lineage.detailLine)}</p>`
                : '',
            aftereffects?.summaryLine
                ? `<p data-fate-aftereffect-summary="true">${escapeHtml(aftereffects.summaryLine)}</p>`
                : '',
            aftereffects?.detailLine
                ? `<p class="collection-muted" data-fate-aftereffect-detail="true">${escapeHtml(aftereffects.detailLine)}</p>`
                : '',
            '<div class="codex-summary-grid two-cols">',
            `${activeAgenda ? `<div class="codex-summary-chip"><strong>${escapeHtml(`${activeAgenda.progress}/${activeAgenda.target}`)}</strong><span>当前议程</span></div>` : ''}`,
            `${heavenlyMandate.available ? `<div class="codex-summary-chip" data-heavenly-mandate-chip="directive" data-heavenly-mandate-theme="true"><strong>${escapeHtml(heavenlyMandate.directiveName || '待启敕令')}</strong><span>天道敕令</span></div>` : ''}`,
            `${heavenlyMandate.available ? `<div class="codex-summary-chip" data-heavenly-mandate-chip="week"><strong>${escapeHtml(heavenlyMandate.weekLabel || heavenlyMandate.weekTag || '本周轮转')}</strong><span>当前周签</span></div>` : ''}`,
            `${heavenlyMandate.available ? `<div class="codex-summary-chip" data-heavenly-mandate-chip="progress" data-heavenly-mandate-progress="true"><strong>${escapeHtml(heavenlyMandate.progressText || '待同步')}</strong><span>周进度</span></div>` : ''}`,
            `${seasonBoard.available ? `<div class="codex-summary-chip" data-season-board-chip="phase"><strong>${escapeHtml(seasonBoard.phaseLabel || '采样期')}</strong><span>季盘阶段</span></div>` : ''}`,
            `${seasonBoard.available ? `<div class="codex-summary-chip" data-season-board-chip="theme"><strong>${escapeHtml(seasonBoard.themeLabel || '本周主轴')}</strong><span>赛季主轴</span></div>` : ''}`,
            `${seasonBoard.available ? `<div class="codex-summary-chip" data-season-board-chip="status"><strong>${escapeHtml(seasonBoard.progressText || '待同步')}</strong><span>季盘进度</span></div>` : ''}`,
            `${seasonFrontier ? `<div class="codex-summary-chip" data-season-board-chip="frontier" data-season-board-frontier-chip="true"><strong>${escapeHtml(seasonFrontier.primaryFrontShortLabel || seasonFrontier.primaryFrontLabel || '主战线')}</strong><span>${escapeHtml(seasonFrontier.pressureLabel || seasonFrontier.statusLabel || '战线态势')}</span></div>` : ''}`,
            `${seasonFrontierDecree ? `<div class="codex-summary-chip" data-season-board-chip="frontier-decree" data-season-board-frontier-decree-chip="true"><strong>${escapeHtml(seasonFrontierDecree.laneLabel || seasonFrontier.primaryFrontShortLabel || '主战线')}</strong><span>${escapeHtml(`法旨 · ${seasonFrontierDecree.toneLabel || '本周'}`)}</span></div>` : ''}`,
            `${seasonFrontierChronicle ? `<div class="codex-summary-chip" data-season-board-chip="frontier-chronicle" data-season-board-frontier-chronicle-chip="true"><strong>${escapeHtml(seasonFrontierChronicle.laneLabel || seasonFrontier.primaryFrontShortLabel || '主战线')}</strong><span>${escapeHtml(`史卷 · ${seasonFrontierChronicle.phaseLabel || '本周'}`)}</span></div>` : ''}`,
            `${seasonFrontierCouncil ? `<div class="codex-summary-chip" data-season-board-chip="frontier-council" data-season-board-frontier-council-chip="true"><strong>${escapeHtml(seasonFrontierCouncil.laneLabel || seasonFrontier.primaryFrontShortLabel || '主战线')}</strong><span>${escapeHtml(`会审 · ${seasonFrontierCouncil.phaseLabel || '本周'}`)}</span></div>` : ''}`,
            `${seasonBoardLaneRewards.length > 0 ? `<div class="codex-summary-chip" data-season-board-chip="lane-reward"><strong>${escapeHtml(`${seasonBoardClaimableLaneRewards.length}/${seasonBoardLaneRewards.length}`)}</strong><span>分线结题赏</span></div>` : ''}`,
            `${seasonSettlement ? `<div class="codex-summary-chip" data-season-board-chip="settlement"><strong>${escapeHtml(seasonSettlement.outcomeLabel || '待押卷')}</strong><span>季押卷</span></div>` : ''}`,
            `${seasonDebtPack ? `<div class="codex-summary-chip" data-season-board-chip="debt"><strong>${escapeHtml(seasonDebtPack.progressText || seasonDebtPack.settleWindowText || seasonDebtPack.debtThemeLabel || '待清账')}</strong><span>债账窗口</span></div>` : ''}`,
            `${primarySeasonVerification ? `<div class="codex-summary-chip" data-season-board-chip="verification"><strong>${escapeHtml(primarySeasonVerification.label || '待验证')}</strong><span>结业验证</span></div>` : ''}`,
            `${lineage?.available ? `<div class="codex-summary-chip" data-fate-lineage-chip="style"><strong>${escapeHtml(lineage.styleTrack?.dominantLabel || '待沉淀')}</strong><span>主修流派</span></div>` : ''}`,
            `${lineage?.available ? `<div class="codex-summary-chip" data-fate-lineage-chip="research"><strong>${escapeHtml(lineage.researchTrack?.dominantLabel || '待结题')}</strong><span>研究倾向</span></div>` : ''}`,
            `${primaryAftereffect?.templateLabel ? `<div class="codex-summary-chip" data-fate-aftereffect-chip="template"><strong>${escapeHtml(primaryAftereffect.templateLabel || '跨章偏置')}</strong><span>界痕类型</span></div>` : ''}`,
            `${primaryAftereffect?.statusLabel ? `<div class="codex-summary-chip" data-fate-aftereffect-chip="status"><strong>${escapeHtml(primaryAftereffect.statusLabel || '待生效')}</strong><span>当前状态</span></div>` : ''}`,
            `<div class="codex-summary-chip"><strong>${data.progress.sanctumAgendaCompleted || 0}</strong><span>议程结题</span></div>`,
            `<div class="codex-summary-chip"><strong>${data.progress.sanctumAgendaFailed || 0}</strong><span>未成研究</span></div>`,
            `<div class="codex-summary-chip"><strong>${data.rooms.length}</strong><span>房间总览</span></div>`,
            `<div class="codex-summary-chip"><strong>${data.researches.filter((item) => item.ready).length}</strong><span>已满足研究</span></div>`,
            `<div class="codex-summary-chip"><strong>${data.progress.clearedChapters}</strong><span>已贯通章节</span></div>`,
            `<div class="codex-summary-chip"><strong>${data.progress.clearedBossMemories || 0}</strong><span>记忆战留痕</span></div>`,
            `<div class="codex-summary-chip"><strong>${data.progress.completedRunPaths || 0}</strong><span>命途战录</span></div>`,
            `<div class="codex-summary-chip"><strong>${data.progress.runPathBossSampleCount || 0}</strong><span>样本对照</span></div>`,
            `${data.progress.runSlateArchives !== undefined ? `<div class="codex-summary-chip"><strong>${data.progress.runSlateArchives || 0}</strong><span>归卷书架</span></div>` : ''}`,
            `<div class="codex-summary-chip"><strong>${data.progress.forgeActiveWorkshops || 0}</strong><span>炼器铭刻</span></div>`,
            `<div class="codex-summary-chip"><strong>${data.progress.forgeFullSets || 0}</strong><span>三段套装</span></div>`,
            `${data.progress.observatoryTraces !== undefined ? `<div class="codex-summary-chip"><strong>${data.progress.observatoryTraces || 0}</strong><span>观星留痕</span></div>` : ''}`,
            `<div class="codex-summary-chip"><strong>${data.progress.unclaimedAchievements}</strong><span>可领取目标</span></div>`,
            '</div>',
            seasonBoard.available
                ? `<div class="collection-detail-grid"
                    data-season-board-board="true"
                    data-season-board-week="${escapeHtml(seasonBoard.weekTag || '')}"
                    data-season-board-theme="${escapeHtml(seasonBoard.themeLabel || '')}"
                    data-season-board-progress-value="${escapeHtml(seasonBoard.progressText || '待同步')}">
                    <section class="collection-detail-card" data-season-board-overview="true">
                        <span class="detail-mini-label">${escapeHtml(`${seasonBoard.phaseIcon || seasonBoard.icon || '🜂'} ${seasonBoard.title || '赛季天道盘'}`)}</span>
                        <strong>${escapeHtml(seasonBoard.themeLabel || '本周主轴')}</strong>
                        <p data-season-board-progress-row="true">${escapeHtml(`${seasonBoard.weekLabel || seasonBoard.weekTag || '本周轮转'} · ${seasonBoard.phaseLabel || '采样期'} · ${seasonBoard.progressText || '待同步'}`)}</p>
                        ${seasonBoard.statusLine ? `<p class="collection-muted">${escapeHtml(seasonBoard.statusLine)}</p>` : ''}
                        ${seasonFrontier ? `<p class="collection-muted" data-season-board-frontier-card="true">${escapeHtml(seasonFrontier.detailLine || seasonFrontier.guideLine || seasonFrontier.summaryLine || `${seasonFrontier.primaryFrontLabel || '主战线'} · ${seasonFrontier.pressureLabel || '稳态'}`)}</p>` : ''}
                        ${seasonFrontierDecree ? `<p class="collection-muted" data-season-board-frontier-decree-card="true">${escapeHtml(seasonFrontierDecree.focusLine || seasonFrontierDecree.successLine || seasonFrontierDecree.summaryLine || seasonFrontierDecree.title || '本周法旨待同步')}</p>` : ''}
                        ${seasonFrontierChronicle ? `<p class="collection-muted" data-season-board-frontier-chronicle-card="true">${escapeHtml(seasonFrontierChronicle.currentEntryLine || seasonFrontierChronicle.progressLine || seasonFrontierChronicle.summaryLine || '战役史卷待同步')}</p>` : ''}
                        ${seasonFrontierCouncil ? `<p class="collection-muted" data-season-board-frontier-council-card="true">${escapeHtml(seasonFrontierCouncil.focusLine || seasonFrontierCouncil.supportLine || seasonFrontierCouncil.summaryLine || '诸界会审待同步')}</p>` : ''}
                    </section>
                    ${seasonSettlement ? `
                        <section class="collection-detail-card" data-season-board-settlement-card="true">
                            <span class="detail-mini-label">${escapeHtml(`${seasonSettlement.outcomeId === 'positive_sheet' ? '🧾' : (seasonSettlement.outcomeId === 'debt_sheet' ? '📉' : '⚖️')} 季押卷裁定`)}</span>
                            <strong>${escapeHtml(seasonSettlement.outcomeLabel || '待押卷')}</strong>
                            <p data-season-board-settlement-status="true">${escapeHtml(seasonSettlement.progressText || seasonSettlement.statusLine || seasonSettlement.guideLine || '等待赛季裁定同步')}</p>
                            <ul class="collection-detail-list compact">
                                ${[
                seasonSettlement.summaryLine || '',
                seasonSettlement.detailLine || '',
                seasonSettlement.guideLine ? `下一步：${seasonSettlement.guideLine}` : '',
                seasonSettlement.contractResolutionLine ? `回执：${seasonSettlement.contractResolutionLine}` : ''
            ].filter(Boolean).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
                            </ul>
                        </section>
                    ` : ''}
                    ${seasonDebtPack ? `
                        <section class="collection-detail-card" data-season-board-debt-card="true">
                            <span class="detail-mini-label">${escapeHtml('📚 研究债账包')}</span>
                            <strong>${escapeHtml(seasonDebtPack.debtThemeLabel || '待清债账')}</strong>
                            <p data-season-board-debt-progress="true">${escapeHtml(seasonDebtPack.progressText || seasonDebtPack.settleWindowText || seasonDebtPack.statusLine || '待清账')}</p>
                            <ul class="collection-detail-list compact">
                                ${[
                seasonDebtPack.summaryLine || '',
                seasonDebtPack.detailLine || '',
                seasonDebtPack.guideLine ? `清账路径：${seasonDebtPack.guideLine}` : '',
                seasonDebtPack.recommendedValidationLabel ? `推荐验证：${seasonDebtPack.recommendedValidationLabel}` : ''
            ].filter(Boolean).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
                            </ul>
                        </section>
                    ` : ''}
                    ${seasonVerificationOrders.length > 0 ? `
                        <section class="collection-detail-card" data-season-board-verification-card="true">
                            <span class="detail-mini-label">${escapeHtml('📌 结业验证状')}</span>
                            <strong>${escapeHtml(primarySeasonVerification?.label || '待验证')}</strong>
                            <p data-season-board-verification-status="true">${escapeHtml(primarySeasonVerification?.statusLine || primarySeasonVerification?.summaryLine || '等待验证同步')}</p>
                            <ul class="collection-detail-list compact">
                                ${seasonVerificationOrders.map((entry) => `
                                    <li
                                        data-season-board-verification-order="true"
                                        data-season-board-verification-id="${escapeHtml(entry.id || '')}"
                                        data-season-board-verification-anchor="${escapeHtml(entry.anchorSection || '')}">
                                        ${escapeHtml(`${entry.label || '验证状'}：${entry.summaryLine || entry.hintLine || entry.statusLine || '待验证'}${entry.statusLine ? ` · ${entry.statusLine}` : ''}${entry.anchorSection ? ` · 去向 ${entry.anchorSection}` : ''}`)}
                                    </li>
                                `).join('')}
                            </ul>
                        </section>
                    ` : ''}
                    ${seasonVerificationArchive?.available ? `
                        <section class="collection-detail-card"
                            data-season-board-archive-card="true"
                            data-season-board-archive-total="${escapeHtml(String(seasonVerificationArchive.totalRecords || 0))}">
                            <span class="detail-mini-label">${escapeHtml('🗂️ 周判记录')}</span>
                            <strong>${escapeHtml(seasonVerificationArchiveLatest?.weekLabel || seasonBoard.weekLabel || '本周轮转')}</strong>
                            <p data-season-board-archive-status="true">${escapeHtml(seasonVerificationArchive.summaryLine || '周判记录会把每周主验证与旁验证压成长期归档。')}</p>
                            <ul class="collection-detail-list compact">
                                ${seasonVerificationArchiveEntries.length > 0
                ? seasonVerificationArchiveEntries.map((entry) => `
                                    <li
                                        data-season-board-archive-entry="true"
                                        data-season-board-archive-record-id="${escapeHtml(entry.recordId || '')}"
                                        data-season-board-archive-anchor="${escapeHtml(entry.anchorSection || '')}">
                                        <div>${escapeHtml(entry.kicker || `${entry.weekLabel || entry.weekTag || '本周轮转'} · ${entry.roleLabel || '周判记录'}`)}</div>
                                        <div class="collection-muted">${escapeHtml(entry.noteLine || entry.summaryLine || entry.writebackLine || entry.detailLine || '周判记录已归档。')}</div>
                                        <button type="button" class="collection-inline-btn secondary"
                                            data-season-board-archive-action="true"
                                            onclick="game.followSeasonVerificationRecord('${escapeHtml(entry.recordId || '')}')">${escapeHtml(entry.ctaLabel || '沿此复核')}</button>
                                    </li>
                                `).join('')
                : `<li>${escapeHtml(seasonVerificationArchive.detailLine || '当前还没有真正落档的周判记录，先去补一张主验证或旁验证。')}</li>`}
                            </ul>
                            <p class="collection-muted">${escapeHtml(seasonVerificationArchive.progressText || `已归档 ${seasonVerificationArchive.totalRecords || 0} 条`)}</p>
                        </section>
                    ` : ''}
                    ${seasonBoardLanes.map((lane) => `
                        <section class="collection-detail-card"
                            data-season-board-lane="true"
                            data-season-board-lane-id="${escapeHtml(lane.id)}">
                            <span class="detail-mini-label">${escapeHtml(`${lane.icon || '✦'} ${lane.label || '玩法线'}`)}</span>
                            <strong>${escapeHtml(`${lane.completedCount || 0}/${lane.totalCount || 0}`)}</strong>
                            <p>${escapeHtml(lane.summaryLine || '本条玩法线正在等待赛季同步。')}</p>
                            ${lane.reward ? `
                                <div class="season-board-task-action-row"
                                    data-season-board-lane-reward="true"
                                    data-season-board-lane-reward-lane-id="${escapeHtml(lane.reward.laneId || lane.id || '')}"
                                    data-season-board-lane-reward-status="${escapeHtml(lane.reward.status || '')}"
                                    data-season-board-lane-reward-week="${escapeHtml(lane.reward.weekTag || seasonBoard.weekTag || '')}">
                                    <span class="collection-muted">${escapeHtml(`${lane.reward.statusLabel || '结题赏'}：${lane.reward.rewardLine || lane.reward.summaryLine || '完成后领取'}`)}</span>
                                    <button type="button" class="collection-inline-btn secondary compact"
                                        data-season-board-lane-reward-claim="true"
                                        data-season-board-lane-reward-lane-id="${escapeHtml(lane.reward.laneId || lane.id || '')}"
                                        data-season-board-lane-reward-claimable="${lane.reward.claimable ? 'true' : 'false'}"
                                        ${lane.reward.claimable ? '' : 'disabled'}
                                        onclick="game.claimSeasonBoardLaneReward('${escapeHtml(lane.reward.laneId || lane.id || '')}')">${escapeHtml(lane.reward.buttonLabel || (lane.reward.claimable ? '领取结题赏' : (lane.reward.statusLabel || '未结题')))}</button>
                                </div>
                            ` : ''}
                            <ul class="collection-detail-list compact">
                                ${(lane.tasks.length > 0 ? lane.tasks : [{ id: `${lane.id || 'lane'}_empty`, label: '等待任务同步', progressText: '', completed: false, hintLine: '', statusLine: '', anchorSection: '' }]).map((task) => `
                                    <li
                                        data-season-board-task="true"
                                        data-season-board-task-id="${escapeHtml(task.id)}"
                                        data-season-board-task-completed="${task.completed ? 'true' : 'false'}"
                                        data-season-board-lane-id="${escapeHtml(lane.id)}"
                                        data-season-board-task-anchor="${escapeHtml(task.anchorSection || '')}"
                                        data-season-board-task-action-type="${escapeHtml(task.actionType || '')}"
                                        data-season-board-task-action-value="${escapeHtml(task.actionValue || '')}">
                                        <div>${escapeHtml(`${task.completed ? '已成' : '进行中'} · ${task.label}${task.progressText ? ` · ${task.progressText}` : ''}${task.statusLine ? ` · ${task.statusLine}` : ''}${task.hintLine ? ` · ${task.hintLine}` : ''}`)}</div>
                                        ${(task.actionType || task.anchorSection || task.actionValue) ? `
                                            <div class="season-board-task-action-row">
                                                <span class="collection-muted"
                                                    data-season-board-task-target-label="${escapeHtml(task.id)}">${escapeHtml(`去向：${resolveSeasonBoardActionMeta(task.anchorSection || task.actionValue || 'sanctum', 'sanctum').targetLabel || task.anchorSection || '洞府'}`)}</span>
                                                <button type="button" class="collection-inline-btn secondary compact"
                                                    data-season-board-task-action="true"
                                                    data-season-board-task-action-id="${escapeHtml(task.id)}"
                                                    data-season-board-task-action-type="${escapeHtml(task.actionType || '')}"
                                                    data-season-board-task-action-value="${escapeHtml(task.actionValue || '')}"
                                                    data-season-board-task-target-label="${escapeHtml(resolveSeasonBoardActionMeta(task.anchorSection || task.actionValue || 'sanctum', 'sanctum').targetLabel || '')}"
                                                    onclick="game.followSeasonBoardTask('${escapeHtml(task.id)}')">${escapeHtml(task.ctaLabel || (task.completed ? '沿此复核' : '前往推进'))}</button>
                                            </div>
                                        ` : ''}
                                    </li>
                                `).join('')}
                            </ul>
                        </section>
                    `).join('')}
                </div>`
                : '',
            heavenlyMandateBoard.length > 0
                ? `<div class="collection-detail-grid"
                    data-heavenly-mandate-board="true"
                    data-heavenly-mandate-week="${escapeHtml(heavenlyMandate.weekTag || '')}"
                    data-heavenly-mandate-theme="${escapeHtml(heavenlyMandate.themeLabel || heavenlyMandate.directiveName || '')}"
                    data-heavenly-mandate-progress-value="${escapeHtml(heavenlyMandate.progressText || '待同步')}">
                    <section class="collection-detail-card" data-heavenly-mandate-overview="true">
                        <span class="detail-mini-label">${escapeHtml(`${heavenlyMandate.icon || '📜'} ${heavenlyMandate.title || '天道敕令'}`)}</span>
                        <strong data-heavenly-mandate-theme="true">${escapeHtml(heavenlyMandate.themeLabel || heavenlyMandate.directiveName || '待启敕令')}</strong>
                        <p data-heavenly-mandate-progress="true">${escapeHtml(`${heavenlyMandate.weekLabel || heavenlyMandate.weekTag || '本周轮转'} · 周进度 ${heavenlyMandate.progressText || '待同步'}`)}</p>
                        ${heavenlyMandate.detailLine ? `<p class="collection-muted">${escapeHtml(heavenlyMandate.detailLine)}</p>` : ''}
                    </section>
                    ${heavenlyMandateFocusTask ? `
                        <section class="collection-detail-card"
                            data-heavenly-mandate-focus-card="true"
                            data-heavenly-mandate-focus-id="${escapeHtml(heavenlyMandateFocusTask.id || '')}"
                            data-heavenly-mandate-focus-anchor="${escapeHtml(heavenlyMandateFocusTask.anchorSection || '')}">
                            <span class="detail-mini-label">${escapeHtml(`${heavenlyMandateFocusTask.icon || '📜'} 当前焦点`)}</span>
                            <strong>${escapeHtml(heavenlyMandateFocusTask.label || heavenlyMandate.goalTitle || '当前焦点')}</strong>
                            <p data-heavenly-mandate-focus-progress="true">${escapeHtml(heavenlyMandateFocusTask.progressText || heavenlyMandate.goalProgressText || '待推进')}</p>
                            <ul class="collection-detail-list compact">
                                ${[
                heavenlyMandateFocusTask.hintLine || '',
                heavenlyMandateFocusTask.statusLine || '',
                heavenlyMandateFocusTask.anchorSection
                    ? `去向：${heavenlyMandateFocusActionMeta.targetLabel || heavenlyMandateFocusTask.anchorSection}`
                    : ''
            ].filter(Boolean).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
                            </ul>
                            <button type="button" class="collection-inline-btn"
                                data-heavenly-mandate-focus-action="true"
                                data-heavenly-mandate-focus-task-id="${escapeHtml(heavenlyMandateFocusTask.id || '')}"
                                onclick="game.followHeavenlyMandateTask('${escapeHtml(heavenlyMandateFocusTask.id || '')}')">${escapeHtml(heavenlyMandateFocusTask.ctaLabel || heavenlyMandate.ctaLabel || '前往推进')}</button>
                        </section>
                    ` : ''}
                    ${heavenlyMandateBoard.map((lane) => `
                        <section class="collection-detail-card"
                            data-heavenly-mandate-lane="true"
                            data-heavenly-mandate-lane-id="${escapeHtml(lane.id)}">
                            <span class="detail-mini-label">${escapeHtml(`${lane.icon || '✦'} ${lane.label || '玩法线'}`)}</span>
                            <strong>${escapeHtml(`${lane.completedCount || 0}/${lane.totalCount || 0}`)}</strong>
                            <p>${escapeHtml(lane.summaryLine || '本条玩法线正在等待本周题面。')}</p>
                            <ul class="collection-detail-list compact">
                                ${(lane.tasks.length > 0 ? lane.tasks : [{ id: `${lane.id || 'lane'}_empty`, label: '等待任务同步', progressText: '', completed: false, hintLine: '', statusLine: '', anchorSection: '' }]).map((task) => `
                                    <li
                                        data-heavenly-mandate-task="true"
                                        data-heavenly-mandate-task-id="${escapeHtml(task.id)}"
                                        data-heavenly-mandate-task-completed="${task.completed ? 'true' : 'false'}"
                                        data-heavenly-mandate-lane-id="${escapeHtml(lane.id)}"
                                        data-heavenly-mandate-task-anchor="${escapeHtml(task.anchorSection || '')}">
                                        <div>${escapeHtml(`${task.completed ? '已成' : '进行中'} · ${task.label}${task.progressText ? ` · ${task.progressText}` : ''}${task.statusLine ? ` · ${task.statusLine}` : ''}${task.hintLine ? ` · ${task.hintLine}` : ''}`)}</div>
                                        <button type="button" class="collection-inline-btn secondary"
                                            data-heavenly-mandate-task-action="true"
                                            data-heavenly-mandate-task-action-id="${escapeHtml(task.id)}"
                                            onclick="game.followHeavenlyMandateTask('${escapeHtml(task.id)}')">${escapeHtml(task.ctaLabel || (task.completed ? '沿此复核' : '前往推进'))}</button>
                                    </li>
                                `).join('')}
                            </ul>
                        </section>
                    `).join('')}
                </div>`
                : ''
        ].join('');

        progressCard.innerHTML = [
            '<span class="codex-side-kicker">图鉴进度</span>',
            '<h3>收藏总览</h3>',
            '<ul class="codex-side-list compact">',
            `<li>法则：${data.progress.collectedLaws} / ${data.progress.totalLaws}</li>`,
            `<li>法宝：${data.progress.collectedTreasures} / ${data.progress.totalTreasures}</li>`,
            `<li>炼器研究：核心件 ${data.progress.forgeCoreOwned || 0} / ${data.progress.forgeCoreTotal || 0} · 形态件 ${data.progress.forgeFormOwned || 0} / ${data.progress.forgeFormTotal || 0}</li>`,
            `<li>套装共鸣：${data.progress.forgeResonantSets || 0} 组达到二段阈值 / ${data.progress.forgeFullSets || 0} 组达到三段共鸣</li>`,
            `<li>炼器铭刻：重铸 ${data.progress.forgeReforges || 0} / 器灵 ${data.progress.forgeInfusions || 0} / 套装修正 ${data.progress.forgeSetEchoes || 0}</li>`,
            `<li>灵契线索：${data.progress.seenSpirits} / ${data.progress.totalSpirits}</li>`,
            `<li>敌影档案：${data.progress.seenEnemies} / ${data.progress.totalEnemies}</li>`,
            `<li>Boss 档案：${data.progress.defeatedBosses} / ${data.progress.totalBosses}</li>`,
            `<li>伏魔台记忆战：${data.progress.clearedBossMemories || 0} 次留痕 / ${data.progress.totalBossMemoryAttempts || 0} 次试作</li>`,
            `<li>命途碑廊：${data.progress.completedRunPaths || 0} / ${data.progress.totalRunPaths || 0} 条命途留痕 · 累计 ${data.progress.totalRunPathClears || 0} 次圆满</li>`,
            `<li>样本对照：${data.progress.runPathBossSampleCount || 0} 份实战样本 · 涉及 ${data.progress.sampledCharacters || 0} 名角色 / ${data.progress.sampledBosses || 0} 位主宰</li>`,
            `${data.progress.runSlateArchives !== undefined ? `<li>归卷书架：${data.progress.runSlateArchives || 0} 份章节答卷 · 最高评分 ${data.progress.topRunSlateScore || 0}</li>` : ''}`,
            `${data.progress.observatoryTraces !== undefined ? `<li>观星留痕：${data.progress.observatoryTraces || 0} 条归档 / ${data.progress.observatoryReplays || 0} 次回放</li>` : ''}`,
            `<li>洞府议程：${data.progress.sanctumAgendaCompleted || 0} 次结题 / ${data.progress.sanctumAgendaFailed || 0} 次未成</li>`,
            `${heavenlyMandate.available ? `<li data-heavenly-mandate-progress-row="true">天道敕令：${escapeHtml(heavenlyMandate.weekLabel || heavenlyMandate.weekTag || '本周轮转')} · ${escapeHtml(heavenlyMandate.themeLabel || heavenlyMandate.directiveName || '待启敕令')} · ${escapeHtml(heavenlyMandate.progressText || '待同步')}</li>` : ''}`,
            `${seasonBoard.available ? `<li data-season-board-progress-row="true">赛季天道盘：${escapeHtml(seasonBoard.weekLabel || seasonBoard.weekTag || '本周轮转')} · ${escapeHtml(seasonBoard.phaseLabel || '采样期')} · ${escapeHtml(seasonBoard.progressText || '待同步')}</li>` : ''}`,
            `${seasonSettlement ? `<li data-season-board-progress-settlement="true">季押卷：${escapeHtml(seasonSettlement.outcomeLabel || '待押卷')} · ${escapeHtml(seasonSettlement.progressText || seasonSettlement.statusLine || seasonSettlement.summaryLine || '待裁定')}</li>` : ''}`,
            `${lineage?.available ? `<li data-fate-lineage-progress-row="true">命盘谱系：角色 ${escapeHtml(data.progress.lineageCharacters || 0)} / 流派 ${escapeHtml(data.progress.lineageStyles || 0)} / 节点 ${escapeHtml(data.progress.lineageNodes || 0)} / 研究 ${escapeHtml(data.progress.lineageResearchHistory || 0)}</li>` : ''}`,
            `${aftereffects?.available ? `<li data-fate-aftereffect-progress-row="true">界痕后效：生效 ${escapeHtml(data.progress.fateAftereffectActive || 0)} / 待生效 ${escapeHtml(data.progress.fateAftereffectPending || 0)} · ${escapeHtml(primaryAftereffect?.templateLabel || primaryAftereffect?.name || '跨章偏置')}</li>` : ''}`,
            '</ul>'
        ].join('');

        guide.innerHTML = [
            '<span class="codex-side-kicker">使用建议</span>',
            '<h3>洞府怎么喂主线</h3>',
            '<ul class="codex-side-list compact">',
            activeAgenda
                ? `<li>当前议程：${escapeHtml(activeAgenda.name)} · ${escapeHtml(activeAgenda.sourceLine || activeAgenda.themeLabel || '主练样本')}。</li>`
                : (lastAgenda
                    ? `<li>最近结题：${escapeHtml(lastAgenda.name)} · ${escapeHtml(lastAgenda.outcomeLabel || '研究留痕')}，${escapeHtml(lastAgenda.recoveryLine || lastAgenda.grantedLine || lastAgenda.reasonLine || '可回归卷书架继续校卷。')}</li>`
                    : '<li>若还没有立项，先从归卷书架挑一份答卷设为主练，再回洞府选一个本轮议程。</li>'),
            activeAgenda?.phaseLabel
                ? `<li>当前阶段：${escapeHtml(activeAgenda.phaseLabel)} · ${escapeHtml(activeAgenda.phaseLine || activeAgenda.summaryLine || '本轮研究正在推进。')}</li>`
                : '',
            activeAgenda?.decisionState === 'pending'
                ? `<li>章中处置：${escapeHtml(activeAgenda.decisionPromptLine || '已解锁一轮议程处置，可在研究列表里二选一。')}</li>`
                : '',
            activeAgenda?.contractState === 'pending'
                ? `<li>锁线契约：${escapeHtml(activeAgenda.contractPromptLine || '已解锁一条锁线契约，可回研究列表里补签 bonus 条件。')}</li>`
                : '',
            activeAgenda?.selectedDecisionLabel
                ? `<li>当前处置：${escapeHtml(activeAgenda.selectedDecisionLabel)} · ${escapeHtml(activeAgenda.selectedDecisionLine || '本章研究条件已按所选处置更新。')}</li>`
                : '',
            activeAgenda?.selectedContractLabel
                ? `<li>当前契约：${escapeHtml(activeAgenda.selectedContractLabel)} · ${escapeHtml(activeAgenda.selectedContractLine || '本章已追加一条 bonus 锁线条件。')}</li>`
                : '',
            activeAgenda?.selectedContractLabel && activeAgenda?.contractSignCostLine
                ? `<li>契押代价：${escapeHtml(activeAgenda.contractSignCostLine)}。</li>`
                : '',
            activeAgenda?.selectedContractLabel && activeAgenda?.contractBurdenLine
                ? `<li>契约负担：${escapeHtml(activeAgenda.contractBurdenLine)}</li>`
                : '',
            activeAgenda
                ? `<li>${escapeHtml(activeAgenda.focusNodeLine || '优先节点暂未锁定，先从观星与归卷线补出一条主轴。')}</li>`
                : '',
            activeAgenda
                ? `<li>结题门槛：${escapeHtml(activeAgenda.successLine || '命中关键节点并把答卷维持在贴题以上。')}</li>`
                : '',
            heavenlyMandate.available
                ? `<li data-heavenly-mandate-guide="overview">天道敕令：${escapeHtml(heavenlyMandate.weekTag || heavenlyMandate.weekLabel || '本周轮转')} 当前轮转「${escapeHtml(heavenlyMandate.directiveName || '待启敕令')}」，${escapeHtml(heavenlyMandate.detailLine || '本周题面正在整理。')}</li>`
                : '',
            heavenlyMandate.guideLine
                ? `<li data-heavenly-mandate-guide="goal">${escapeHtml(heavenlyMandate.guideLine)}</li>`
                : '',
            seasonBoard.available
                ? `<li data-season-board-guide="overview">赛季天道盘：${escapeHtml(seasonBoard.summaryLine || '赛季主轴正在同步。')}${seasonBoard.guideLine ? ` · ${escapeHtml(seasonBoard.guideLine)}` : ''}</li>`
                : '',
            seasonFrontier
                ? `<li data-season-board-frontier-guide="true">${escapeHtml(seasonFrontier.guideLine || seasonFrontier.summaryLine || `诸界战线当前主压在 ${seasonFrontier.primaryFrontLabel || '主战线'}。`)}</li>`
                : '',
            seasonFrontierDecree
                ? `<li data-season-board-frontier-decree-guide="true">${escapeHtml([seasonFrontierDecree.title || '本周法旨', seasonFrontierDecree.successLine || seasonFrontierDecree.riskLine || '优先补主战线一格。'].filter(Boolean).join('：'))}</li>`
                : '',
            seasonFrontierChronicle
                ? `<li data-season-board-frontier-chronicle-guide="true">${escapeHtml([seasonFrontierChronicle.title || '战役史卷', seasonFrontierChronicle.nextRecordLine || seasonFrontierChronicle.lessonLine || '完成主战线后回季盘复核史卷。'].filter(Boolean).join('：'))}</li>`
                : '',
            seasonFrontierCouncil
                ? `<li data-season-board-frontier-council-guide="true">${escapeHtml([seasonFrontierCouncil.title || '诸界会审', seasonFrontierCouncil.verdictLine || seasonFrontierCouncil.supportLine || '先守主线，副线保留证据。'].filter(Boolean).join('：'))}</li>`
                : '',
            seasonSettlement
                ? `<li data-season-board-guide="settlement">${escapeHtml(`季押卷：${seasonSettlement.summaryLine || seasonSettlement.detailLine || seasonSettlement.guideLine || seasonSettlement.outcomeLabel || '等待裁定同步。'}`)}</li>`
                : '',
            seasonDebtPack
                ? `<li data-season-board-guide="debt">${escapeHtml(`债账包：${seasonDebtPack.guideLine || seasonDebtPack.summaryLine || seasonDebtPack.progressText || '优先把欠卷清回可验证状态。'}`)}</li>`
                : '',
            primarySeasonVerification
                ? `<li data-season-board-guide="verification">${escapeHtml(`结业验证：${primarySeasonVerification.summaryLine || primarySeasonVerification.hintLine || primarySeasonVerification.statusLine || primarySeasonVerification.label || '等待验证同步。'}`)}</li>`
                : '',
            lineage?.available
                ? `<li data-fate-lineage-guide="overview">${escapeHtml(lineage.detailLine || lineage.guideLine || lineage.summaryLine || '命盘谱系正在同步。')}</li>`
                : '',
            aftereffects?.available
                ? `<li data-fate-aftereffect-guide="overview">${escapeHtml(aftereffects.guideLine || aftereffects.currentStatusLine || aftereffects.detailLine || '界痕后效正在同步。')}</li>`
                : '',
            ...seasonBoardLanes.map((lane) => `<li data-season-board-guide-lane="${escapeHtml(lane.id)}">${escapeHtml(`${lane.label}：${lane.summaryLine || `当前已完成 ${lane.completedCount}/${lane.totalCount}`}。`)}</li>`),
            ...(lineage?.tracks || []).map((track) => `<li data-fate-lineage-track="${escapeHtml(track.id || '')}">${escapeHtml(`${track.label || '谱系'}：${track.summaryLine || track.progressText || '等待留痕。'}`)}</li>`),
            ...heavenlyMandateBoard.slice(0, 3).map((lane) => `<li data-heavenly-mandate-guide-lane="${escapeHtml(lane.id)}">${escapeHtml(`${lane.label}：${lane.summaryLine || `当前已完成 ${lane.completedCount}/${lane.totalCount}`}。`)}</li>`),
            ...(aftereffects?.records || []).slice(0, 2).map((entry) => `<li data-fate-aftereffect-track="${escapeHtml(entry.recordId || '')}">${escapeHtml(`${entry.name || entry.templateLabel || '界痕'}：${entry.statusLine || entry.summaryLine || entry.positiveLine || '后效已登记。'}`)}</li>`),
            activeAgenda?.selectedContractLabel
                ? `<li>契约奖赏：${escapeHtml(activeAgenda.contractBonusLine || '若锁线条件兑现，会额外结算一笔契约奖赏。')}</li>`
                : '',
            (!activeAgenda && lastAgenda?.recoveryEligible)
                ? `<li>失败回收：${escapeHtml(lastAgenda.recoveryLine || '本轮未能结题，但洞府已回收一部分残卷。')}</li>`
                : '',
            (!activeAgenda && lastAgenda?.recoveryHintLine)
                ? `<li>${escapeHtml(lastAgenda.recoveryHintLine)}</li>`
                : '',
            activeAgenda
                ? `<li>风险提醒：${escapeHtml(activeAgenda.failureLine || '若路线偏题或章节折损，本轮研究不会结成结构奖励。')}</li>`
                : '',
            '<li>先从可领取目标拿到即时收益，再回到章节或 Boss 档案定路线。</li>',
            '<li>研究项全部偏“解锁信息与入口”，不直接堆数值，方便后续继续扩系统。</li>',
            '<li>样本对照榜会把角色、命途裂变和 Boss 收官轮次压在一起，适合开局前先找一份稳定模板。</li>',
            '<li>命途碑廊会把圆满后的命途样本长期保存下来，适合拿来决定下一轮该追哪条主线、补哪组套装、怎么读 Boss。</li>',
            `${data.progress.runSlateArchives !== undefined ? '<li>归卷书架会长期保存章节答卷与训练建议，适合先挑一份高分卷设为当前主练，再回观星台继续筛留痕。</li>' : ''}`,
            selectedGuide
                ? `<li>当前精选命盘：${escapeHtml(selectedGuide.title)} · ${escapeHtml(selectedGuide.themeLabel || '观星样本')}，它会作为洞府里最值得先复刻的一份命盘档案。</li>`
                : '<li>若还没有锁定当前精选命盘，先去观星台选一份答卷，再回来把它当作洞府里的主参考样本。</li>',
            '<li>炼器室现在会标出核心件、形态件与器灵灌注资格，适合先在图鉴里定研究目标，再决定路线要去商店、精英还是事件。</li>',
            '<li>伏魔台的记忆战更适合拿来检验“我是否真的读懂了 Boss 出题”，而不是单纯比一次输赢。</li>',
            `${data.progress.observatoryTraces !== undefined ? '<li>观星台现在会沉淀命盘签和留痕，适合把高分轮换或好用命盘重新回放验证。</li>' : ''}`,
            '</ul>'
        ].join('');
    };

    Game.prototype.renderCollectionHub = function () {
        this.renderCollectionHubChrome();
        this.renderSpiritCodex();
        this.renderChapterCodex();
        this.renderEnemyCodex();
        this.renderBossArchive();
        this.renderBuildSnapshot();
        this.renderRunSlateShelf();
        this.renderSanctumOverview();
    };

    Game.prototype.initCollection = function () {
        this.ensureCollectionHubBootState();
        if (typeof originalInitCollection === 'function') {
            originalInitCollection.call(this);
        }
        this.renderCollectionHub();
    };

    if (typeof Player !== 'undefined') {
        const originalSetSpiritCompanion = Player.prototype.setSpiritCompanion;
        const originalCollectLaw = Player.prototype.collectLaw;
        const originalAddTreasure = Player.prototype.addTreasure;

        Player.prototype.setSpiritCompanion = function (spiritId, tier = 1) {
            const result = originalSetSpiritCompanion.call(this, spiritId, tier);
            const meta = typeof this.getSpiritCompanionMeta === 'function' ? this.getSpiritCompanionMeta() : result;
            if (meta && this.game && typeof this.game.recordCollectionUnlock === 'function') {
                this.game.recordCollectionUnlock('spirit', {
                    id: meta.id,
                    name: meta.name,
                    icon: meta.icon || '✦',
                    note: `完成缔约 · ${meta.tierLabel || '初契'}`
                });
            }
            return result;
        };

        Player.prototype.collectLaw = function (law) {
            const added = originalCollectLaw.call(this, law);
            if (added && law && this.game && typeof this.game.recordCollectionUnlock === 'function') {
                this.game.recordCollectionUnlock('law', {
                    id: law.id,
                    name: law.name || law.id,
                    icon: law.icon || '📜',
                    note: `法则入藏 · ${typeof this.game.getLawElementLabel === 'function' ? this.game.getLawElementLabel(law.element) : '未知'}属性`
                });
            }
            return added;
        };

        Player.prototype.addTreasure = function (treasureId) {
            const added = originalAddTreasure.call(this, treasureId);
            const treasure = typeof this.getTreasureById === 'function' ? this.getTreasureById(treasureId) : null;
            if (added && treasure && this.game && typeof this.game.recordCollectionUnlock === 'function') {
                this.game.recordCollectionUnlock('treasure', {
                    id: treasure.id,
                    name: treasure.name || treasure.id,
                    icon: treasure.icon || '🏺',
                    note: '法宝入藏'
                });
            }
            return added;
        };
    }

    if (typeof AchievementSystem !== 'undefined') {
        const originalUnlockAchievement = AchievementSystem.prototype.unlockAchievement;
        AchievementSystem.prototype.unlockAchievement = function (achievementId) {
            const alreadyUnlocked = Array.isArray(this.unlockedAchievements) && this.unlockedAchievements.includes(achievementId);
            const result = originalUnlockAchievement.call(this, achievementId);
            if (!alreadyUnlocked && Array.isArray(this.unlockedAchievements) && this.unlockedAchievements.includes(achievementId)) {
                const achievement = typeof ACHIEVEMENTS !== 'undefined' && ACHIEVEMENTS ? ACHIEVEMENTS[achievementId] : null;
                if (achievement && this.game && typeof this.game.recordCollectionUnlock === 'function') {
                    this.game.recordCollectionUnlock('achievement', {
                        id: achievementId,
                        name: achievement.name || achievementId,
                        icon: achievement.icon || '🏆',
                        note: '成就解锁'
                    });
                }
            }
            return result;
        };
    }

    Game.prototype.startBattle = function (enemies, node = null) {
        const enemyList = Array.isArray(enemies) ? enemies : [enemies];
        if (typeof this.recordCollectionUnlock === 'function') {
            enemyList
                .filter((enemy) => enemy && enemy.id && !enemy.isBoss && !enemy.isMinion)
                .forEach((enemy) => {
                    const realm = clampInt(enemy.realm || this.player?.realm || 1, 1, 18);
                    const chapter = typeof this.getChapterProfileForRealm === 'function'
                        ? this.getChapterProfileForRealm(realm)
                        : null;
                    this.recordCollectionUnlock('enemy', {
                        id: enemy.id,
                        name: enemy.name || enemy.id,
                        icon: enemy.icon || '👁️',
                        note: chapter ? `遭遇于 ${chapter.name}` : `遭遇于第 ${realm} 重`
                    });
                });
        }
        return typeof originalStartBattle === 'function'
            ? originalStartBattle.call(this, enemies, node)
            : undefined;
    };

    Game.prototype.onBattleWon = async function (enemies) {
        if (this.currentBattleNode && this.currentBattleNode.type === 'boss_memory') {
            const enemyList = Array.isArray(enemies) ? enemies.filter(Boolean) : [enemies].filter(Boolean);
            const bossEnemy = enemyList.find((enemy) => enemy && enemy.isBoss) || enemyList[0] || null;
            return this.finishBossMemoryBattle('victory', {
                bossEnemy,
                bossId: this.currentBattleNode?.bossId || bossEnemy?.id || '',
                turns: clampInt(this.battle?.turnNumber || 0, 0, 9999)
            });
        }
        return typeof originalOnBattleWon === 'function'
            ? originalOnBattleWon.call(this, enemies)
            : undefined;
    };

    Game.prototype.onBattleLost = async function () {
        if (this.currentBattleNode && this.currentBattleNode.type === 'boss_memory') {
            return this.finishBossMemoryBattle('defeat', {
                bossId: this.currentBattleNode?.bossId || '',
                turns: clampInt(this.battle?.turnNumber || 0, 0, 9999)
            });
        }
        return typeof originalOnBattleLost === 'function'
            ? originalOnBattleLost.call(this)
            : undefined;
    };

    Game.prototype.handleBossDefeated = async function (bossEnemy = null, enemyList = [], ringExp = 0) {
        const isBossMemoryBattle = this.currentBattleNode?.type === 'boss_memory';
        const liveRunPathMeta = !isBossMemoryBattle && this.player && typeof this.player.getRunPathMeta === 'function'
            ? this.player.getRunPathMeta()
            : null;
        const liveTurnCount = !isBossMemoryBattle
            ? clampInt(this.battle?.turnNumber || 0, 0, 9999)
            : 0;
        if (!isBossMemoryBattle && this.achievementSystem && typeof this.achievementSystem.updateStat === 'function') {
            this.achievementSystem.updateStat('bossesDefeated', 1);
        }
        const result = await originalHandleBossDefeated.call(this, bossEnemy, enemyList, ringExp);
        if (!isBossMemoryBattle && bossEnemy && typeof this.recordCollectionUnlock === 'function') {
            const chapter = typeof this.getChapterProfileForRealm === 'function'
                ? this.getChapterProfileForRealm(bossEnemy.realm || this.player?.realm || 1)
                : null;
            this.recordCollectionUnlock('boss', {
                id: bossEnemy.id,
                name: bossEnemy.name || bossEnemy.id,
                icon: bossEnemy.icon || '👁️',
                note: chapter ? `击破 ${chapter.name} 主宰` : '击破章节主宰'
            });
        }
        if (!isBossMemoryBattle && bossEnemy && liveRunPathMeta && typeof this.recordRunPathBossSample === 'function') {
            this.recordRunPathBossSample(liveRunPathMeta, bossEnemy, {
                turns: liveTurnCount,
                realm: bossEnemy.realm || this.player?.realm || 0,
                characterId: this.player?.characterId || '',
                completedAt: Date.now(),
                source: 'boss_clear'
            });
        }
        return result;
    };

    Game.prototype.onRealmComplete = function () {
        const clearedRealm = clampInt(this.player?.realm || 1, 1, 18);
        const shouldRecordChapter = clearedRealm % 3 === 0;
        const chapter = shouldRecordChapter && typeof this.getChapterProfileForRealm === 'function'
            ? this.getChapterProfileForRealm(clearedRealm)
            : null;
        const result = originalOnRealmComplete.call(this);
        if (chapter && typeof this.recordCollectionUnlock === 'function') {
            this.recordCollectionUnlock('chapter', {
                id: chapter.id,
                name: chapter.fullName || chapter.name,
                icon: chapter.icon || '☯️',
                note: '章节贯通'
            });
        }
        return result;
    };
})();
