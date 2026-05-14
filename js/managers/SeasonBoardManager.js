export class SeasonBoardManager {
    constructor(gameInstance) {
        this.game = gameInstance;
    }

    normalizeSeasonBoardClaimedLaneRewards(source = null) {
        const root = source && typeof source === 'object' ? source : {};
        const allowedLaneIds = new Set(['training', 'expedition', 'verification']);
        const sanitizeText = (value = '', limit = 120) => String(value || '').trim().slice(0, limit);
        const normalizeEntry = (entry = null, weekTag = '', laneId = '') => {
            const raw = entry && typeof entry === 'object' ? entry : {};
            const normalizedWeekTag = sanitizeText(raw.weekTag || weekTag, 24);
            const normalizedLaneId = sanitizeText(raw.laneId || laneId, 32);
            if (!normalizedWeekTag || !allowedLaneIds.has(normalizedLaneId)) return null;
            const claimedAt = Math.max(0, Math.floor(Number(raw.claimedAt || raw.at || Date.now()) || 0));
            return {
                weekTag: normalizedWeekTag,
                weekLabel: sanitizeText(raw.weekLabel || '', 32),
                laneId: normalizedLaneId,
                laneLabel: sanitizeText(raw.laneLabel || '', 48),
                rewardKey: sanitizeText(raw.rewardKey || `season_lane_reward:${normalizedLaneId}:v1`, 80),
                rewardLine: sanitizeText(raw.rewardLine || '', 160),
                claimed: true,
                claimedAt
            };
        };
        const result = {};
        if (Array.isArray(source)) {
            source.forEach((entry) => {
                const normalized = normalizeEntry(entry);
                if (!normalized) return;
                if (!result[normalized.weekTag]) result[normalized.weekTag] = {};
                result[normalized.weekTag][normalized.laneId] = normalized;
            });
            return result;
        }
        Object.entries(root).forEach(([weekKey, value]) => {
            const weekTag = sanitizeText(weekKey, 24);
            if (!weekTag) return;
            if (Array.isArray(value)) {
                value.forEach((entry) => {
                    const normalized = normalizeEntry(entry, weekTag);
                    if (!normalized) return;
                    if (!result[normalized.weekTag]) result[normalized.weekTag] = {};
                    result[normalized.weekTag][normalized.laneId] = normalized;
                });
                return;
            }
            if (!value || typeof value !== 'object') return;
            Object.entries(value).forEach(([laneKey, entry]) => {
                const normalized = normalizeEntry(entry, weekTag, laneKey);
                if (!normalized) return;
                if (!result[normalized.weekTag]) result[normalized.weekTag] = {};
                result[normalized.weekTag][normalized.laneId] = normalized;
            });
        });
        return Object.fromEntries(
            Object.entries(result)
                .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
                .slice(0, 8)
        );
    }

    getCommittedSeasonBoardFrontierResolution(options = {}) {
        const sanitizeText = (value = '', limit = 120) => String(value || '').trim().slice(0, limit);
        const targetWeekTag = sanitizeText(options.weekTag || options.seasonVerification?.weekTag || '', 24);
        const sourceState = options.seasonVerification && typeof options.seasonVerification === 'object'
            ? options.seasonVerification
            : this.game.ensureSeasonVerificationState({
                weekTag: targetWeekTag,
                weekLabel: options.weekLabel || ''
            });
        const records = [
            ...(Array.isArray(sourceState?.records) ? sourceState.records : []),
            ...(Array.isArray(sourceState?.history) ? sourceState.history : [])
        ]
            .map((entry, index) => this.game.normalizeSeasonVerificationRecord(entry, index))
            .filter((entry) => {
                if (!entry || typeof entry !== 'object') return false;
                if (targetWeekTag && entry.weekTag !== targetWeekTag) return false;
                return String(entry.recordKind || '').trim() === 'frontier_resolution'
                    || !!entry.frontierResolutionChoiceId
                    || !!entry.frontierResolutionId;
            })
            .sort((a, b) => {
                const aAt = Math.max(a.frontierResolutionSubmittedAt || 0, a.updatedAt || 0, a.createdAt || 0);
                const bAt = Math.max(b.frontierResolutionSubmittedAt || 0, b.updatedAt || 0, b.createdAt || 0);
                return bAt - aAt;
            });
        const record = records[0] || null;
        if (!record?.frontierResolutionChoiceId && !record?.frontierResolutionId) return null;
        const choiceId = sanitizeText(record.frontierResolutionChoiceId, 32);
        if (!['hold_primary', 'rebalance_support', 'seal_dispute'].includes(choiceId)) return null;
        return {
            frontierResolutionId: sanitizeText(record.frontierResolutionId || record.recordId, 96),
            frontierResolutionChoiceId: choiceId,
            frontierResolutionLabel: sanitizeText(record.frontierResolutionLabel, 32),
            frontierResolutionStance: sanitizeText(record.frontierResolutionStance, 48),
            frontierResolutionSupportLaneId: sanitizeText(record.frontierResolutionSupportLaneId, 32),
            frontierResolutionSupportLaneLabel: sanitizeText(record.frontierResolutionSupportLaneLabel, 24),
            frontierResolutionSummaryLine: sanitizeText(record.frontierResolutionSummaryLine || record.summaryLine, 220),
            chronicleSealStatus: sanitizeText(record.chronicleSealStatus || 'sealed', 24),
            chronicleSealLine: sanitizeText(record.chronicleSealLine, 220),
            councilResolutionLine: sanitizeText(record.councilResolutionLine, 220),
            frontierResolutionSubmittedAt: Math.max(0, Math.floor(Number(record.frontierResolutionSubmittedAt || record.updatedAt || 0) || 0))
        };
    }

    getSeasonBoardFrontierResolutionArchiveRecords(options = {}) {
        const sourceState = options.seasonVerificationState && typeof options.seasonVerificationState === 'object'
            ? options.seasonVerificationState
            : (this.game.seasonVerificationState && typeof this.game.seasonVerificationState === 'object'
                ? this.game.seasonVerificationState
                : null);
        const rawRecords = [
            ...(Array.isArray(sourceState?.records) ? sourceState.records : []),
            ...(Array.isArray(sourceState?.history) ? sourceState.history : [])
        ];
        const validChoices = new Set(['hold_primary', 'rebalance_support', 'seal_dispute']);
        const seen = new Set();
        return rawRecords
            .map((entry, index) => this.game.normalizeSeasonVerificationRecord(entry, index))
            .filter((entry) => {
                if (!entry || typeof entry !== 'object') return false;
                const choiceId = String(entry.frontierResolutionChoiceId || '').trim();
                const isFrontierResolution = String(entry.recordKind || '').trim() === 'frontier_resolution'
                    || !!choiceId
                    || !!entry.frontierResolutionId;
                if (!isFrontierResolution || !validChoices.has(choiceId)) return false;
                const key = String(
                    entry.recordId
                    || entry.frontierResolutionId
                    || `${entry.weekTag || 'weekless'}:${choiceId}:${entry.frontierResolutionSubmittedAt || entry.updatedAt || index}`
                ).trim();
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .sort((a, b) => {
                const aAt = Math.max(a.frontierResolutionSubmittedAt || 0, a.updatedAt || 0, a.createdAt || 0);
                const bAt = Math.max(b.frontierResolutionSubmittedAt || 0, b.updatedAt || 0, b.createdAt || 0);
                if (bAt !== aAt) return bAt - aAt;
                return String(b.weekTag || '').localeCompare(String(a.weekTag || ''));
            });
    }

    buildSeasonBoardFrontierChronicleArchive(frontier = null, context = {}) {
        const root = frontier && typeof frontier === 'object' ? frontier : null;
        const sanitize = (value = '', limit = 120) => String(value || '').trim().slice(0, limit);
        const records = this.getSeasonBoardFrontierResolutionArchiveRecords({
            seasonVerificationState: context.seasonVerificationState
        });
        if (records.length <= 0) return null;
        const stanceCatalog = {
            frontier_loyalist: {
                label: '守线派',
                choiceId: 'hold_primary',
                choiceLabel: '守主战线',
                summaryLine: '长期倾向继续守住主战线，把强目标先压成稳定成果。'
            },
            support_balancer: {
                label: '平衡派',
                choiceId: 'rebalance_support',
                choiceLabel: '副线补证',
                summaryLine: '长期倾向给副线保留证据，让主线推进时也不丢旁证窗口。'
            },
            dispute_archivist: {
                label: '归档派',
                choiceId: 'seal_dispute',
                choiceLabel: '封存争议',
                summaryLine: '长期倾向把争议先封入史卷，保留回看证据而不强改排班。'
            }
        };
        const choiceToStance = {
            hold_primary: 'frontier_loyalist',
            rebalance_support: 'support_balancer',
            seal_dispute: 'dispute_archivist'
        };
        const laneLabelMap = {
            training: '训练线',
            expedition: '远征线',
            verification: '验算线'
        };
        const choiceLabelMap = {
            hold_primary: '守主战线',
            rebalance_support: '副线补证',
            seal_dispute: '封存争议'
        };
        const countsByChoice = { hold_primary: 0, rebalance_support: 0, seal_dispute: 0 };
        const countsByStance = {
            frontier_loyalist: 0,
            support_balancer: 0,
            dispute_archivist: 0
        };
        const latestAtByStance = {
            frontier_loyalist: 0,
            support_balancer: 0,
            dispute_archivist: 0
        };
        const entries = records.map((record, index) => {
            const choiceId = sanitize(record.frontierResolutionChoiceId, 32);
            const fallbackStanceId = choiceToStance[choiceId] || 'frontier_loyalist';
            const rawStanceId = sanitize(record.frontierResolutionStance || fallbackStanceId, 48);
            const stanceId = stanceCatalog[rawStanceId] ? rawStanceId : fallbackStanceId;
            const stanceMeta = stanceCatalog[stanceId] || stanceCatalog.frontier_loyalist;
            const submittedAt = Math.max(0, Math.floor(Number(record.frontierResolutionSubmittedAt || record.updatedAt || record.createdAt || 0) || 0));
            countsByChoice[choiceId] = (countsByChoice[choiceId] || 0) + 1;
            countsByStance[stanceId] = (countsByStance[stanceId] || 0) + 1;
            latestAtByStance[stanceId] = Math.max(latestAtByStance[stanceId] || 0, submittedAt);
            return {
                recordId: sanitize(record.recordId || record.frontierResolutionId || `frontier_resolution_archive_${index + 1}`, 96),
                weekTag: sanitize(record.weekTag, 24),
                weekLabel: sanitize(record.weekLabel || record.weekTag || '未标周裁记', 32),
                choiceId,
                choiceLabel: sanitize(record.frontierResolutionLabel || choiceLabelMap[choiceId] || stanceMeta.choiceLabel, 32),
                stanceId,
                stanceLabel: stanceMeta.label,
                supportLaneId: sanitize(record.frontierResolutionSupportLaneId, 32),
                supportLaneLabel: sanitize(record.frontierResolutionSupportLaneLabel, 24),
                summaryLine: sanitize(record.frontierResolutionSummaryLine || record.summaryLine, 220),
                chronicleSealLine: sanitize(record.chronicleSealLine, 220),
                councilResolutionLine: sanitize(record.councilResolutionLine, 220),
                submittedAt
            };
        });
        const styleEntries = Object.entries(stanceCatalog).map(([stanceId, meta]) => ({
            id: stanceId,
            label: meta.label,
            choiceId: meta.choiceId,
            choiceLabel: meta.choiceLabel,
            count: Math.max(0, Math.floor(Number(countsByStance[stanceId]) || 0)),
            countText: countsByStance[stanceId] > 0 ? `${countsByStance[stanceId]} 次裁记` : '等待裁记',
            summaryLine: meta.summaryLine,
            latestAt: Math.max(0, Math.floor(Number(latestAtByStance[stanceId]) || 0))
        }));
        const dominantStyle = styleEntries
            .filter((entry) => entry.count > 0)
            .sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return b.latestAt - a.latestAt;
            })[0] || null;
        const latestEntry = entries[0] || null;
        const primaryLaneLabel = sanitize(root?.primaryFrontShortLabel || root?.primaryFrontLabel || latestEntry?.choiceLabel || '主战线', 24);
        return {
            available: true,
            id: `season_frontier_chronicle_archive_${sanitize(context.weekTag || latestEntry?.weekTag || 'current', 24) || 'current'}`,
            weekTag: sanitize(context.weekTag || latestEntry?.weekTag || '', 24),
            weekLabel: sanitize(context.weekLabel || latestEntry?.weekLabel || '', 32),
            totalRecords: entries.length,
            sealedCount: entries.length,
            countsByChoice,
            countsByStance,
            dominantStanceId: dominantStyle?.id || '',
            dominantStanceLabel: dominantStyle?.label || '',
            summaryLine: dominantStyle
                ? `战役史卷已封存 ${entries.length} 条会审裁记，当前更常呈现【${dominantStyle.label}】。`
                : '战役史卷正在等待第一条会审裁记封存。',
            detailLine: latestEntry
                ? `最近封记：${latestEntry.weekLabel || latestEntry.weekTag || '本周'} · ${latestEntry.choiceLabel || '裁记'}${latestEntry.supportLaneLabel ? ` · 副线 ${latestEntry.supportLaneLabel}` : ''}。`
                : `完成本周【${primaryLaneLabel}】会审后，史卷会开始累计长期裁记风格。`,
            progressText: entries.length > 0 ? `已封 ${entries.length} 条` : '等待封记',
            latestEntry,
            styleEntries,
            entries: entries.slice(0, 6)
        };
    }

    normalizeSeasonBoardFrontierChronicleArchive(source = null, context = {}) {
        const derived = this.buildSeasonBoardFrontierChronicleArchive(context.frontier || null, context);
        const root = source && typeof source === 'object' ? source : derived;
        if (!root) return null;
        const sanitize = (value = '', limit = 120) => String(value || '').trim().slice(0, limit);
        const choiceLabelMap = {
            hold_primary: '守主战线',
            rebalance_support: '副线补证',
            seal_dispute: '封存争议'
        };
        const stanceLabelMap = {
            frontier_loyalist: '守线派',
            support_balancer: '平衡派',
            dispute_archivist: '归档派'
        };
        const normalizeEntry = (entry = null, index = 0) => {
            const item = entry && typeof entry === 'object' ? entry : {};
            const choiceId = ['hold_primary', 'rebalance_support', 'seal_dispute'].includes(String(item.choiceId || '').trim())
                ? String(item.choiceId || '').trim()
                : '';
            if (!choiceId) return null;
            const stanceId = String(item.stanceId || '').trim().slice(0, 48)
                || (choiceId === 'rebalance_support'
                    ? 'support_balancer'
                    : (choiceId === 'seal_dispute' ? 'dispute_archivist' : 'frontier_loyalist'));
            const fallbackStanceId = choiceId === 'rebalance_support'
                ? 'support_balancer'
                : (choiceId === 'seal_dispute' ? 'dispute_archivist' : 'frontier_loyalist');
            const effectiveStanceId = stanceLabelMap[stanceId] ? stanceId : fallbackStanceId;
            return {
                recordId: sanitize(item.recordId || item.id || `frontier_resolution_archive_${index + 1}`, 96),
                weekTag: sanitize(item.weekTag, 24),
                weekLabel: sanitize(item.weekLabel || item.weekTag || '未标周裁记', 32),
                choiceId,
                choiceLabel: sanitize(item.choiceLabel || choiceLabelMap[choiceId] || '裁记', 32),
                stanceId: effectiveStanceId,
                stanceLabel: sanitize(item.stanceLabel || stanceLabelMap[effectiveStanceId] || '裁记风格', 32),
                supportLaneId: sanitize(item.supportLaneId, 32),
                supportLaneLabel: sanitize(item.supportLaneLabel, 24),
                summaryLine: sanitize(item.summaryLine, 220),
                chronicleSealLine: sanitize(item.chronicleSealLine, 220),
                councilResolutionLine: sanitize(item.councilResolutionLine, 220),
                submittedAt: Math.max(0, Math.floor(Number(item.submittedAt || item.updatedAt || item.createdAt || 0) || 0))
            };
        };
        const entries = (Array.isArray(root.entries) ? root.entries : [])
            .map(normalizeEntry)
            .filter(Boolean)
            .slice(0, 6);
        const latestEntry = normalizeEntry(root.latestEntry) || entries[0] || null;
        const styleEntries = (Array.isArray(root.styleEntries) ? root.styleEntries : [])
            .filter((entry) => entry && typeof entry === 'object')
            .slice(0, 3)
            .map((entry) => {
                const stanceId = sanitize(entry.id || entry.stanceId, 48);
                const count = Math.max(0, Math.floor(Number(entry.count || entry.value || 0) || 0));
                return {
                    id: stanceId,
                    label: sanitize(entry.label || stanceLabelMap[stanceId] || '裁记风格', 32),
                    choiceId: sanitize(entry.choiceId, 32),
                    choiceLabel: sanitize(entry.choiceLabel || choiceLabelMap[entry.choiceId] || '', 32),
                    count,
                    countText: sanitize(entry.countText || (count > 0 ? `${count} 次裁记` : '等待裁记'), 48),
                    summaryLine: sanitize(entry.summaryLine, 180),
                    latestAt: Math.max(0, Math.floor(Number(entry.latestAt || 0) || 0))
                };
            });
        const totalRecords = Math.max(
            entries.length,
            Math.max(0, Math.floor(Number(root.totalRecords || root.sealedCount || 0) || 0))
        );
        if (root.available === false || totalRecords <= 0 || !latestEntry) return null;
        const countsByChoice = ['hold_primary', 'rebalance_support', 'seal_dispute'].reduce((acc, choiceId) => {
            acc[choiceId] = Math.max(0, Math.floor(Number(root.countsByChoice?.[choiceId]) || 0));
            return acc;
        }, {});
        if (Object.values(countsByChoice).every((value) => value <= 0)) {
            entries.forEach((entry) => {
                countsByChoice[entry.choiceId] = (countsByChoice[entry.choiceId] || 0) + 1;
            });
        }
        const countsByStance = ['frontier_loyalist', 'support_balancer', 'dispute_archivist'].reduce((acc, stanceId) => {
            acc[stanceId] = Math.max(0, Math.floor(Number(root.countsByStance?.[stanceId]) || 0));
            return acc;
        }, {});
        if (Object.values(countsByStance).every((value) => value <= 0)) {
            entries.forEach((entry) => {
                countsByStance[entry.stanceId] = (countsByStance[entry.stanceId] || 0) + 1;
            });
        }
        const dominantStanceId = sanitize(root.dominantStanceId || styleEntries.find((entry) => entry.count > 0)?.id || latestEntry.stanceId, 48);
        const dominantStanceLabel = sanitize(root.dominantStanceLabel || stanceLabelMap[dominantStanceId] || latestEntry.stanceLabel, 32);
        return {
            available: true,
            id: sanitize(root.id || `season_frontier_chronicle_archive_${context.weekTag || latestEntry.weekTag || 'current'}`, 96),
            weekTag: sanitize(root.weekTag || context.weekTag || latestEntry.weekTag || '', 24),
            weekLabel: sanitize(root.weekLabel || context.weekLabel || latestEntry.weekLabel || '', 32),
            totalRecords,
            sealedCount: Math.max(totalRecords, Math.floor(Number(root.sealedCount || 0) || 0)),
            countsByChoice,
            countsByStance,
            dominantStanceId,
            dominantStanceLabel,
            summaryLine: sanitize(root.summaryLine || `战役史卷已封存 ${totalRecords} 条会审裁记，当前更常呈现【${dominantStanceLabel || '裁记风格'}】。`, 220),
            detailLine: sanitize(root.detailLine || `最近封记：${latestEntry.weekLabel || latestEntry.weekTag || '本周'} · ${latestEntry.choiceLabel || '裁记'}。`, 220),
            progressText: sanitize(root.progressText || `已封 ${totalRecords} 条`, 48),
            latestEntry,
            styleEntries,
            entries
        };
    }

    buildSeasonBoardChapterArc(context = {}) {
        const sanitize = (value = '', limit = 120) => String(value || '').trim().slice(0, limit);
        const laneLabelMap = {
            training: '训练线',
            expedition: '远征线',
            verification: '验算线'
        };
        const choiceLabelMap = {
            hold_primary: '守主战线',
            rebalance_support: '副线补证',
            seal_dispute: '封存争议'
        };
        const stanceLabelMap = {
            frontier_loyalist: '守线派',
            support_balancer: '平衡派',
            dispute_archivist: '归档派'
        };
        const choiceToStance = {
            hold_primary: 'frontier_loyalist',
            rebalance_support: 'support_balancer',
            seal_dispute: 'dispute_archivist'
        };
        const parseWeekTag = (value = '') => {
            const match = String(value || '').trim().match(/^(\d{4})-W(\d{1,2})$/);
            if (!match) return null;
            const year = Math.max(1970, Math.floor(Number(match[1]) || 1970));
            const weekNo = Math.max(1, Math.min(53, Math.floor(Number(match[2]) || 1)));
            return {
                year,
                weekNo,
                weekIndex: (year * 53) + weekNo
            };
        };
        const currentWeekTag = sanitize(
            context.weekTag
            || context.weekVerdictLedger?.current?.weekTag
            || context.frontier?.weekTag
            || '',
            24
        );
        const currentWeekLabel = sanitize(
            context.weekLabel
            || context.weekVerdictLedger?.current?.weekLabel
            || context.frontier?.weekLabel
            || currentWeekTag,
            32
        );
        const currentWeekMeta = parseWeekTag(currentWeekTag);
        const currentWeekSlot = currentWeekMeta
            ? ((currentWeekMeta.weekNo - 1) % 3) + 1
            : 1;
        const chapterNumber = currentWeekMeta
            ? Math.max(1, Math.floor((currentWeekMeta.weekNo - 1) / 3) + 1)
            : 1;
        const windowStartWeekNo = currentWeekMeta
            ? Math.max(1, currentWeekMeta.weekNo - currentWeekSlot + 1)
            : 0;
        const windowEndWeekNo = currentWeekMeta
            ? Math.min(53, windowStartWeekNo + 2)
            : 0;
        const windowStartIndex = currentWeekMeta
            ? ((currentWeekMeta.year * 53) + windowStartWeekNo)
            : 0;
        const windowEndIndex = currentWeekMeta
            ? ((currentWeekMeta.year * 53) + windowEndWeekNo)
            : 0;
        const normalizeEntry = (record = null, index = 0) => {
            const root = record && typeof record === 'object' ? record : null;
            if (!root) return null;
            const choiceId = sanitize(root.frontierResolutionChoiceId || root.choiceId, 32);
            if (!Object.prototype.hasOwnProperty.call(choiceLabelMap, choiceId)) return null;
            const weekTag = sanitize(root.weekTag, 24);
            const weekMeta = parseWeekTag(weekTag);
            const stanceId = sanitize(root.frontierResolutionStance || root.stanceId || choiceToStance[choiceId], 48);
            const effectiveStanceId = stanceLabelMap[stanceId] ? stanceId : choiceToStance[choiceId];
            return {
                recordId: sanitize(root.recordId || root.frontierResolutionId || `chapter_arc_entry_${index + 1}`, 96),
                weekTag,
                weekLabel: sanitize(root.weekLabel || weekTag || `第 ${index + 1} 周`, 32),
                weekIndex: Math.max(0, Math.floor(Number(weekMeta?.weekIndex) || 0)),
                weekSlot: weekMeta ? (((weekMeta.weekNo - 1) % 3) + 1) : Math.min(3, index + 1),
                choiceId,
                choiceLabel: sanitize(root.frontierResolutionLabel || root.choiceLabel || choiceLabelMap[choiceId], 32),
                stanceId: effectiveStanceId,
                stanceLabel: stanceLabelMap[effectiveStanceId] || '裁记风格',
                supportLaneId: sanitize(root.frontierResolutionSupportLaneId || root.supportLaneId, 32),
                supportLaneLabel: sanitize(root.frontierResolutionSupportLaneLabel || root.supportLaneLabel, 24),
                summaryLine: sanitize(root.frontierResolutionSummaryLine || root.summaryLine, 220),
                chronicleSealLine: sanitize(root.chronicleSealLine, 220),
                councilResolutionLine: sanitize(root.councilResolutionLine, 220),
                submittedAt: Math.max(0, Math.floor(Number(root.frontierResolutionSubmittedAt || root.submittedAt || root.updatedAt || root.createdAt || 0) || 0))
            };
        };
        const currentVerdict = context.weekVerdictLedger?.current && typeof context.weekVerdictLedger.current === 'object'
            ? context.weekVerdictLedger.current
            : null;
        const records = typeof this.getSeasonBoardFrontierResolutionArchiveRecords === 'function'
            ? this.getSeasonBoardFrontierResolutionArchiveRecords({
                seasonVerificationState: context.seasonVerificationState
            })
            : [];
        const rawEntries = [
            ...(currentVerdict?.frontierResolutionChoiceId ? [currentVerdict] : []),
            ...records
        ]
            .map(normalizeEntry)
            .filter(Boolean)
            .sort((a, b) => {
                if (b.weekIndex !== a.weekIndex) return b.weekIndex - a.weekIndex;
                return b.submittedAt - a.submittedAt;
            });
        const seenWeekTags = new Set();
        const distinctEntries = rawEntries.filter((entry) => {
            const key = entry.weekTag || entry.recordId;
            if (!key || seenWeekTags.has(key)) return false;
            seenWeekTags.add(key);
            return true;
        });
        const summarizeEntries = (entries = []) => {
            const countsByChoice = { hold_primary: 0, rebalance_support: 0, seal_dispute: 0 };
            const countsByStance = { frontier_loyalist: 0, support_balancer: 0, dispute_archivist: 0 };
            const latestAtByChoice = { hold_primary: 0, rebalance_support: 0, seal_dispute: 0 };
            let latestSupportLaneId = '';
            let latestSupportLaneLabel = '';
            let latestSupportLaneAt = 0;
            entries.forEach((entry) => {
                countsByChoice[entry.choiceId] = (countsByChoice[entry.choiceId] || 0) + 1;
                countsByStance[entry.stanceId] = (countsByStance[entry.stanceId] || 0) + 1;
                latestAtByChoice[entry.choiceId] = Math.max(latestAtByChoice[entry.choiceId] || 0, entry.submittedAt);
                if (
                    entry.choiceId === 'rebalance_support'
                    && entry.supportLaneId
                    && entry.submittedAt >= latestSupportLaneAt
                ) {
                    latestSupportLaneAt = entry.submittedAt;
                    latestSupportLaneId = entry.supportLaneId;
                    latestSupportLaneLabel = entry.supportLaneLabel || laneLabelMap[entry.supportLaneId] || '';
                }
            });
            const dominantChoiceId = Object.keys(countsByChoice)
                .sort((a, b) => {
                    if ((countsByChoice[b] || 0) !== (countsByChoice[a] || 0)) return (countsByChoice[b] || 0) - (countsByChoice[a] || 0);
                    return (latestAtByChoice[b] || 0) - (latestAtByChoice[a] || 0);
                })
                .find((choiceId) => countsByChoice[choiceId] > 0) || '';
            return {
                countsByChoice,
                countsByStance,
                dominantChoiceId,
                dominantStanceId: dominantChoiceId ? choiceToStance[dominantChoiceId] : '',
                latestSupportLaneId,
                latestSupportLaneLabel
            };
        };
        const windowEntries = currentWeekMeta
            ? distinctEntries
                .filter((entry) => entry.weekIndex >= windowStartIndex && entry.weekIndex <= windowEndIndex)
                .slice(0, 3)
            : distinctEntries.slice(0, 3);
        const currentSummary = summarizeEntries(windowEntries);
        const countsByChoice = currentSummary.countsByChoice;
        const countsByStance = currentSummary.countsByStance;
        const dominantChoiceId = currentSummary.dominantChoiceId;
        const dominantStanceId = currentSummary.dominantStanceId;
        const previousWindowEntries = currentWeekMeta && currentWeekSlot === 1 && windowStartWeekNo > 3
            ? distinctEntries
                .filter((entry) => entry.weekIndex >= (windowStartIndex - 3) && entry.weekIndex < windowStartIndex)
                .slice(0, 3)
            : [];
        const previousSummary = summarizeEntries(previousWindowEntries);
        const sealedCount = Math.min(3, windowEntries.length);
        const weeksRemaining = Math.max(0, 3 - currentWeekSlot);
        const settlementOutcomeId = sanitize(context.settlement?.outcomeId || currentVerdict?.settlementOutcomeId, 32);
        const debtStatus = sanitize(context.debtPack?.status || currentVerdict?.debtStatus, 24);
        const hasDebtPressure = ['open', 'deferred'].includes(debtStatus) || settlementOutcomeId === 'debt_sheet';
        const hasRiskPressure = settlementOutcomeId === 'risky_sheet';
        const missingExpectedWeeks = Math.max(0, currentWeekSlot - sealedCount);
        const rescueOpen = hasDebtPressure || hasRiskPressure || (currentWeekSlot >= 2 && missingExpectedWeeks > 0) || (currentWeekSlot >= 3 && sealedCount < 3);
        const rescueReasonLine = hasDebtPressure
            ? (context.debtPack?.summaryLine || '本章仍有欠卷占住强目标位，需要先清账再归章。')
            : (hasRiskPressure
                ? (context.settlement?.summaryLine || '本章押卷仍属险卷，需要补一条外场或旁证。')
                : (rescueOpen
                    ? `本章当前只封 ${sealedCount}/3 周裁记，章末前建议补齐缺口。`
                    : '本章裁记节奏稳定，暂不需要额外救火。'));
        const rescueWindow = {
            available: true,
            open: rescueOpen,
            statusId: hasDebtPressure ? 'debt_rescue' : (hasRiskPressure ? 'risk_rescue' : (rescueOpen ? 'seal_gap' : 'stable')),
            statusLabel: hasDebtPressure ? '清账救火' : (hasRiskPressure ? '险卷救火' : (rescueOpen ? '补裁记' : '稳态')),
            reasonLine: sanitize(rescueReasonLine, 220),
            guideLine: sanitize(
                rescueOpen
                    ? '救火窗口只提示章内缺口，真正行动仍沿本周季盘 nextTask 推进。'
                    : '继续按本周季盘主线推进，章层只做归卷回看。',
                220
            )
        };
        const chapterClosed = sealedCount >= 3;
        const pressureWindow = {
            available: true,
            open: rescueOpen || hasDebtPressure || hasRiskPressure,
            statusId: hasDebtPressure
                ? 'debt_pressure'
                : (hasRiskPressure
                    ? 'risk_pressure'
                    : (chapterClosed
                        ? 'sealed_pressure'
                        : (rescueOpen ? 'rescue_pressure' : 'steady_pressure'))),
            statusLabel: hasDebtPressure
                ? '欠卷压章'
                : (hasRiskPressure
                    ? '险卷压章'
                    : (chapterClosed
                        ? '章末定型'
                        : (rescueOpen ? '章内爬压' : '稳态续压'))),
            reasonLine: sanitize(
                hasDebtPressure
                    ? (context.debtPack?.summaryLine || '欠卷仍压住强目标位，先清账再谈章内收束。')
                    : (hasRiskPressure
                        ? (context.settlement?.summaryLine || '险卷仍在抬高章势，需要先补外场或旁证。')
                        : (rescueOpen
                            ? `章内仍有 ${sealedCount}/3 周裁记缺口，压力正在抬高。`
                            : (chapterClosed
                                ? '三周裁记已齐，章势开始收束。'
                                : '章势正在稳步推进。'))),
                220
            ),
            guideLine: sanitize(
                rescueOpen || hasDebtPressure || hasRiskPressure
                    ? '章势只负责读出当前压力，不会改写本周季盘的行动真源。'
                    : '继续沿本周主线推进，等章势自然收束。',
                220
            ),
            shortLine: sanitize(
                `${hasDebtPressure
                    ? '欠卷压章'
                    : (hasRiskPressure
                        ? '险卷压章'
                        : (chapterClosed
                            ? '章末定型'
                            : (rescueOpen ? '章内爬压' : '稳态续压')))}${hasDebtPressure || hasRiskPressure || rescueOpen || chapterClosed ? ` · ${Math.max(0, Math.min(100, hasDebtPressure ? 100 : (hasRiskPressure ? 84 : (chapterClosed ? 32 : 68))))}分` : ''}`,
                120
            )
        };
        const dominantChoiceLabel = dominantChoiceId ? choiceLabelMap[dominantChoiceId] : '';
        const chapterResultId = chapterClosed
            ? (dominantChoiceId === 'seal_dispute' ? 'archived_dispute' : (dominantChoiceId === 'rebalance_support' ? 'balanced_front' : 'guarded_front'))
            : (rescueOpen ? 'under_rescue' : 'in_progress');
        const endingPreviewLine = chapterClosed
            ? `章末预览：本章最终偏向【${dominantChoiceLabel || '裁记风格'}】，下章可据此复盘主线。`
            : `章末预览：还剩 ${weeksRemaining} 周窗口，三周裁记齐后会形成本章评语。`;
        const finalCommentLine = chapterClosed
            ? (dominantChoiceId === 'rebalance_support'
                ? '章末评语：本章愿意给副线留下证据，下章普通排班可更重视旁证补样。'
                : (dominantChoiceId === 'seal_dispute'
                    ? '章末评语：本章多次选择封存争议，下章宜先回看证据再开新赌注。'
                    : '章末评语：本章持续守住主战线，下章可以继续把强目标压成稳定成果。'))
            : (rescueOpen
                ? '章中评语：章内证据尚薄，先用本周主线补齐缺口。'
                : '章中评语：三周节奏正常推进，等待更多裁记沉淀。');
        const feedbackLine = chapterClosed
            ? (dominantChoiceId === 'rebalance_support'
                ? '本章收成：副线证据已被保住，下章开局更适合先沿旁证节奏铺样。'
                : (dominantChoiceId === 'seal_dispute'
                    ? '本章收成：争议已被压成封存口径，下章开局宜先稳证据、少开新赌注。'
                    : '本章收成：主战线已经稳住，下章开局可以继续把强目标压成成果。'))
            : (hasDebtPressure
                ? '本章反馈：当前仍被欠卷压力拖住，先清强目标，再谈这一章的收成。'
                : (hasRiskPressure
                    ? '本章反馈：当前仍属险卷压强，先补外场或旁证，再判断章末收法。'
                    : (rescueOpen
                        ? `本章反馈：第 ${currentWeekSlot}/3 周仍有裁记缺口，先补齐再判断章末收成。`
                        : `本章反馈：当前章势正在形成，继续沿${dominantChoiceLabel ? `【${dominantChoiceLabel}】` : '本周主线'}累积裁记。`)));
        const chapterLabel = currentWeekMeta
            ? `第 ${chapterNumber} 章`
            : '本章';
        const windowLabel = currentWeekMeta
            ? `${currentWeekMeta.year} · 第 ${windowStartWeekNo}-${windowEndWeekNo} 周`
            : '三周窗口';
        const progressText = `${sealedCount}/3 周归卷`;
        const carryover = (() => {
            if (!(currentWeekMeta && currentWeekSlot === 1 && chapterNumber > 1 && previousWindowEntries.length >= 3)) return null;
            const previousDominantChoiceId = previousSummary.dominantChoiceId;
            const previousDominantChoiceLabel = previousDominantChoiceId ? choiceLabelMap[previousDominantChoiceId] : '';
            const resultId = previousDominantChoiceId === 'seal_dispute'
                ? 'archived_dispute'
                : (previousDominantChoiceId === 'rebalance_support' ? 'balanced_front' : 'guarded_front');
            const resultLabel = resultId === 'archived_dispute'
                ? '封争收束'
                : (resultId === 'balanced_front' ? '补证收束' : '守线收束');
            const preferredLaneId = previousDominantChoiceId === 'rebalance_support'
                ? (previousSummary.latestSupportLaneId || 'expedition')
                : 'training';
            const preferredLaneLabel = previousDominantChoiceId === 'rebalance_support'
                ? (previousSummary.latestSupportLaneLabel || laneLabelMap[preferredLaneId] || '远征线')
                : (laneLabelMap[preferredLaneId] || '训练线');
            const previousChapterLabel = `第 ${Math.max(1, chapterNumber - 1)} 章`;
            const summaryLine = previousDominantChoiceId === 'rebalance_support'
                ? `上章承卷：${previousChapterLabel} 以【${previousDominantChoiceLabel || '副线补证'}】收束，新章开局会轻量前移【${preferredLaneLabel}】。`
                : (previousDominantChoiceId === 'seal_dispute'
                    ? `上章承卷：${previousChapterLabel} 以【${previousDominantChoiceLabel || '封存争议'}】收束，新章开局会先回【${preferredLaneLabel}】补证。`
                    : `上章承卷：${previousChapterLabel} 以【${previousDominantChoiceLabel || '守主战线'}】收束，新章开局会先稳住【${preferredLaneLabel}】主轴。`);
            return {
                available: true,
                chapterId: `chapter_arc_${currentWeekMeta.year}_${Math.max(1, chapterNumber - 1)}`,
                chapterLabel: previousChapterLabel,
                resultId,
                resultLabel,
                dominantChoiceId: previousDominantChoiceId,
                dominantChoiceLabel: previousDominantChoiceLabel,
                preferredLaneId,
                preferredLaneLabel,
                openingWeek: true,
                applied: false,
                statusLabel: '待判定',
                summaryLine: sanitize(summaryLine, 220),
                guideLine: sanitize('承卷偏置只会轻量影响普通开局排班；若本周出现欠卷、押卷或主验证硬目标，会自动让位。', 220)
            };
        })();
        const objective = (() => {
            const objectiveLaneId = hasDebtPressure
                ? 'verification'
                : (hasRiskPressure
                    ? (context.nextTask?.laneId || 'verification')
                    : (rescueOpen
                        ? (dominantChoiceId === 'rebalance_support'
                            ? (currentSummary.latestSupportLaneId || context.nextTask?.laneId || 'expedition')
                            : (dominantChoiceId === 'seal_dispute'
                                ? (context.nextTask?.laneId || 'training')
                                : (context.nextTask?.laneId || 'training')))
                        : (chapterClosed
                            ? (dominantChoiceId === 'rebalance_support'
                                ? (currentSummary.latestSupportLaneId || context.nextTask?.laneId || 'expedition')
                                : (context.nextTask?.laneId || 'training'))
                            : (context.nextTask?.laneId || 'training'))));
            const objectiveLaneLabel = laneLabelMap[objectiveLaneId] || '本周主线';
            const statusId = hasDebtPressure
                ? 'debt_clear'
                : (hasRiskPressure
                    ? 'risk_stabilize'
                    : (rescueOpen
                        ? 'chapter_rescue'
                        : (chapterClosed ? 'chapter_close' : 'chapter_progress')));
            const statusLabel = hasDebtPressure
                ? '先清债账'
                : (hasRiskPressure
                    ? '先补外场'
                    : (rescueOpen
                        ? (dominantChoiceId === 'rebalance_support'
                            ? '副线补证'
                            : (dominantChoiceId === 'seal_dispute'
                                ? '封存争议'
                                : '守主战线'))
                        : (chapterClosed ? '章末定型' : '章中推进')));
            const summaryLine = hasDebtPressure
                ? `章目标：本章仍被欠卷压住，先把【${objectiveLaneLabel}】补成可结算事实。`
                : (hasRiskPressure
                    ? `章目标：本章处在险卷压强里，先让【${objectiveLaneLabel}】补上外场或旁证。`
                    : (rescueOpen
                        ? `章目标：本章要先补齐 ${sealedCount}/3 周裁记缺口，当前重心偏向【${objectiveLaneLabel}】。`
                        : (chapterClosed
                            ? `章目标：本章已收束为【${dominantChoiceLabel || '裁记风格'}】，下章经营会沿这个口径继续。`
                            : `章目标：本章正在形成【${dominantChoiceLabel || '当前主线'}】的收束样貌。`)));
            const goalLine = hasDebtPressure
                ? '优先清掉欠卷占位，再谈章末收束。'
                : (hasRiskPressure
                    ? '先补外场或旁证，再判断章末收法。'
                    : (rescueOpen
                        ? `第 ${currentWeekSlot}/3 周仍有裁记缺口，先补齐再判断章末收成。`
                        : (chapterClosed
                            ? '三周裁记已齐，接下来只需维持当前章势。'
                            : '继续沿当前主线补齐章内证据。')));
            const reasonLine = hasDebtPressure
                ? (context.debtPack?.summaryLine || '本章仍有欠卷占住强目标位，需要先清账再归章。')
                : (hasRiskPressure
                    ? (context.settlement?.summaryLine || '本章押卷仍属险卷，需要补一条外场或旁证。')
                    : (rescueOpen
                        ? rescueReasonLine
                        : (finalCommentLine || endingPreviewLine || '章目标已进入稳定收束阶段。')));
            return {
                available: true,
                id: `season_chapter_arc_objective_${currentWeekMeta?.year || 'current'}_${chapterNumber}`,
                label: '章目标',
                statusId,
                statusLabel,
                focusLaneId: objectiveLaneId,
                focusLaneLabel: objectiveLaneLabel,
                summaryLine: sanitize(summaryLine, 220),
                statusLine: sanitize(`当前章目标 · ${statusLabel} · ${objectiveLaneLabel}`, 220),
                goalLine: sanitize(goalLine, 220),
                reasonLine: sanitize(reasonLine, 220),
                guideLine: sanitize('章目标只负责解释当前章势，真正行动仍沿本周季盘 nextTask 推进。', 220),
                shortLine: sanitize(`${statusLabel} · ${objectiveLaneLabel}`, 120)
            };
        })();
        return {
            available: true,
            id: `season_chapter_arc_${currentWeekMeta?.year || 'current'}_${chapterNumber}`,
            chapterId: `chapter_arc_${currentWeekMeta?.year || 'current'}_${chapterNumber}`,
            chapterLabel,
            arcLabel: '三周一章',
            windowLabel,
            weekTag: currentWeekTag,
            weekLabel: currentWeekLabel,
            weekSlot: currentWeekSlot,
            weeksRemaining,
            sealedWeeks: sealedCount,
            targetWeeks: 3,
            progressText,
            countsByChoice,
            countsByStance,
            dominantChoiceId,
            dominantChoiceLabel,
            dominantStanceId,
            dominantStanceLabel: dominantStanceId ? stanceLabelMap[dominantStanceId] : '',
            summaryLine: `${chapterLabel} · ${windowLabel} 正在把连续三周会审裁记收束成章经营摘要。`,
            statusLine: `当前第 ${currentWeekSlot}/3 周 · ${progressText}${dominantChoiceLabel ? ` · 倾向 ${dominantChoiceLabel}` : ''}`,
            goalLine: chapterClosed
                ? '本章三周裁记已齐，章末评语可用于复盘下章主线。'
                : (currentWeekSlot >= 3
                    ? '章末周优先补齐本章裁记缺口，再回看本章主线是否成立。'
                    : '继续沿本周季盘行动推进，等待三周裁记形成章末评语。'),
            feedbackLine: sanitize(feedbackLine, 240),
            rescueWindow,
            pressureWindow,
            review: {
                available: true,
                statusId: chapterResultId,
                statusLabel: chapterClosed ? '章末已成' : (rescueOpen ? '章中救火' : '章中推进'),
                endingPreviewLine: sanitize(endingPreviewLine, 220),
                finalCommentLine: sanitize(finalCommentLine, 240),
                summaryLine: sanitize(chapterClosed ? finalCommentLine : endingPreviewLine, 240)
            },
            objective,
            carryover,
            entries: windowEntries.map((entry) => ({
                recordId: entry.recordId,
                weekTag: entry.weekTag,
                weekLabel: entry.weekLabel,
                weekSlot: entry.weekSlot,
                choiceId: entry.choiceId,
                choiceLabel: entry.choiceLabel,
                stanceId: entry.stanceId,
                stanceLabel: entry.stanceLabel,
                supportLaneId: entry.supportLaneId,
                supportLaneLabel: entry.supportLaneLabel,
                summaryLine: entry.summaryLine,
                chronicleSealLine: entry.chronicleSealLine,
                councilResolutionLine: entry.councilResolutionLine,
                submittedAt: entry.submittedAt
            }))
        };
    }

    normalizeSeasonBoardChapterArc(source = null, context = {}) {
        const derived = this.buildSeasonBoardChapterArc(context);
        const sourceRoot = source && typeof source === 'object' ? source : {};
        const hasDerivedContext = !!(
            context.weekTag
            || context.weekLabel
            || context.weekVerdictLedger?.current
            || context.seasonVerificationState
        );
        const hasDerivedEntries = Array.isArray(derived?.entries) && derived.entries.length > 0;
        const root = (derived && (hasDerivedContext || hasDerivedEntries))
            ? { ...sourceRoot, ...derived }
            : (source && typeof source === 'object' ? source : derived);
        if (!root || root.available === false) return null;
        const sanitize = (value = '', limit = 120) => String(value || '').trim().slice(0, limit);
        const clampInt = (value = 0, min = 0, max = 9999) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
        const normalizeCounts = (counts = null) => ({
            hold_primary: clampInt(counts?.hold_primary, 0, 9999),
            rebalance_support: clampInt(counts?.rebalance_support, 0, 9999),
            seal_dispute: clampInt(counts?.seal_dispute, 0, 9999)
        });
        const entries = (Array.isArray(root.entries) ? root.entries : [])
            .filter((entry) => entry && typeof entry === 'object')
            .slice(0, 3)
            .map((entry, index) => ({
                recordId: sanitize(entry.recordId || entry.id || `chapter_arc_entry_${index + 1}`, 96),
                weekTag: sanitize(entry.weekTag, 24),
                weekLabel: sanitize(entry.weekLabel || entry.weekTag || `第 ${index + 1} 周`, 32),
                weekSlot: clampInt(entry.weekSlot || index + 1, 1, 3),
                choiceId: sanitize(entry.choiceId, 32),
                choiceLabel: sanitize(entry.choiceLabel, 32),
                stanceId: sanitize(entry.stanceId, 48),
                stanceLabel: sanitize(entry.stanceLabel, 32),
                supportLaneId: sanitize(entry.supportLaneId, 32),
                supportLaneLabel: sanitize(entry.supportLaneLabel, 24),
                summaryLine: sanitize(entry.summaryLine, 220),
                chronicleSealLine: sanitize(entry.chronicleSealLine, 220),
                councilResolutionLine: sanitize(entry.councilResolutionLine, 220),
                submittedAt: clampInt(entry.submittedAt, 0, 9999999999999)
            }));
        const sealedWeeks = clampInt(root.sealedWeeks ?? entries.length, 0, 3);
        const targetWeeks = clampInt(root.targetWeeks || 3, 1, 3);
        const rescueRoot = root.rescueWindow && typeof root.rescueWindow === 'object' ? root.rescueWindow : {};
        const pressureRoot = root.pressureWindow && typeof root.pressureWindow === 'object' ? root.pressureWindow : {};
        const reviewRoot = root.review && typeof root.review === 'object' ? root.review : {};
        const objectiveRoot = root.objective && typeof root.objective === 'object' ? root.objective : {};
        const carryoverRoot = root.carryover && typeof root.carryover === 'object' ? root.carryover : null;
        return {
            available: true,
            id: sanitize(root.id || `season_chapter_arc_${context.weekTag || 'current'}`, 96),
            chapterId: sanitize(root.chapterId || root.id || `chapter_arc_${context.weekTag || 'current'}`, 96),
            chapterLabel: sanitize(root.chapterLabel || '本章', 32),
            arcLabel: sanitize(root.arcLabel || '三周一章', 32),
            windowLabel: sanitize(root.windowLabel || '三周窗口', 48),
            weekTag: sanitize(root.weekTag || context.weekTag, 24),
            weekLabel: sanitize(root.weekLabel || context.weekLabel, 32),
            weekSlot: clampInt(root.weekSlot || 1, 1, 3),
            weeksRemaining: clampInt(root.weeksRemaining, 0, 3),
            sealedWeeks,
            targetWeeks,
            progressText: sanitize(root.progressText || `${sealedWeeks}/${targetWeeks} 周归卷`, 32),
            countsByChoice: normalizeCounts(root.countsByChoice),
            countsByStance: {
                frontier_loyalist: clampInt(root.countsByStance?.frontier_loyalist, 0, 9999),
                support_balancer: clampInt(root.countsByStance?.support_balancer, 0, 9999),
                dispute_archivist: clampInt(root.countsByStance?.dispute_archivist, 0, 9999)
            },
            dominantChoiceId: sanitize(root.dominantChoiceId, 32),
            dominantChoiceLabel: sanitize(root.dominantChoiceLabel, 32),
            dominantStanceId: sanitize(root.dominantStanceId, 48),
            dominantStanceLabel: sanitize(root.dominantStanceLabel, 32),
            summaryLine: sanitize(root.summaryLine, 240),
            statusLine: sanitize(root.statusLine, 220),
            goalLine: sanitize(root.goalLine, 220),
            feedbackLine: sanitize(root.feedbackLine || reviewRoot.finalCommentLine || reviewRoot.summaryLine || rescueRoot.guideLine || root.goalLine, 240),
            rescueWindow: {
                available: rescueRoot.available !== false,
                open: !!rescueRoot.open,
                statusId: sanitize(rescueRoot.statusId || (rescueRoot.open ? 'seal_gap' : 'stable'), 32),
                statusLabel: sanitize(rescueRoot.statusLabel || (rescueRoot.open ? '补裁记' : '稳态'), 32),
                reasonLine: sanitize(rescueRoot.reasonLine, 220),
                guideLine: sanitize(rescueRoot.guideLine, 220)
            },
            pressureWindow: {
                available: pressureRoot.available !== false && !!(
                    pressureRoot.summaryLine
                    || pressureRoot.statusLine
                    || pressureRoot.reasonLine
                    || pressureRoot.guideLine
                    || pressureRoot.shortLine
                    || pressureRoot.statusLabel
                ),
                open: !!pressureRoot.open,
                statusId: sanitize(pressureRoot.statusId || (pressureRoot.open ? 'rescue_pressure' : 'steady_pressure'), 32),
                statusLabel: sanitize(pressureRoot.statusLabel || (pressureRoot.open ? '章内爬压' : '稳态续压'), 32),
                reasonLine: sanitize(pressureRoot.reasonLine, 220),
                guideLine: sanitize(pressureRoot.guideLine, 220),
                shortLine: sanitize(pressureRoot.shortLine || pressureRoot.statusLabel || pressureRoot.reasonLine || pressureRoot.guideLine, 120)
            },
            objective: {
                available: objectiveRoot.available !== false && !!(
                    objectiveRoot.summaryLine
                    || objectiveRoot.statusLine
                    || objectiveRoot.goalLine
                    || objectiveRoot.reasonLine
                ),
                id: sanitize(objectiveRoot.id || `season_chapter_arc_objective_${context.weekTag || 'current'}`, 96),
                label: sanitize(objectiveRoot.label || '章目标', 32),
                statusId: sanitize(objectiveRoot.statusId, 32),
                statusLabel: sanitize(objectiveRoot.statusLabel, 32),
                focusLaneId: sanitize(objectiveRoot.focusLaneId, 32),
                focusLaneLabel: sanitize(objectiveRoot.focusLaneLabel, 24),
                summaryLine: sanitize(objectiveRoot.summaryLine, 240),
                statusLine: sanitize(objectiveRoot.statusLine, 220),
                goalLine: sanitize(objectiveRoot.goalLine, 220),
                reasonLine: sanitize(objectiveRoot.reasonLine, 220),
                guideLine: sanitize(objectiveRoot.guideLine, 220),
                shortLine: sanitize(objectiveRoot.shortLine || objectiveRoot.statusLine || objectiveRoot.summaryLine, 120)
            },
            review: {
                available: reviewRoot.available !== false,
                statusId: sanitize(reviewRoot.statusId || 'in_progress', 32),
                statusLabel: sanitize(reviewRoot.statusLabel || '章中推进', 32),
                endingPreviewLine: sanitize(reviewRoot.endingPreviewLine, 220),
                finalCommentLine: sanitize(reviewRoot.finalCommentLine, 240),
                summaryLine: sanitize(reviewRoot.summaryLine || reviewRoot.finalCommentLine || reviewRoot.endingPreviewLine, 240)
            },
            carryover: carryoverRoot
                ? {
                    available: carryoverRoot.available !== false,
                    chapterId: sanitize(carryoverRoot.chapterId, 96),
                    chapterLabel: sanitize(carryoverRoot.chapterLabel, 32),
                    resultId: sanitize(carryoverRoot.resultId, 48),
                    resultLabel: sanitize(carryoverRoot.resultLabel, 32),
                    dominantChoiceId: sanitize(carryoverRoot.dominantChoiceId, 32),
                    dominantChoiceLabel: sanitize(carryoverRoot.dominantChoiceLabel, 32),
                    preferredLaneId: sanitize(carryoverRoot.preferredLaneId, 32),
                    preferredLaneLabel: sanitize(carryoverRoot.preferredLaneLabel, 24),
                    openingWeek: !!carryoverRoot.openingWeek,
                    applied: !!carryoverRoot.applied,
                    statusLabel: sanitize(carryoverRoot.statusLabel || (carryoverRoot.applied ? '开局偏置' : '待判定'), 32),
                    summaryLine: sanitize(carryoverRoot.summaryLine, 220),
                    guideLine: sanitize(carryoverRoot.guideLine, 220)
                }
                : null,
            entries
        };
    }

    followSeasonBoardTask(taskId = '') {
        const boardCandidates = [];
        const sanctumData = typeof this.game.getSanctumOverviewData === 'function'
            ? this.game.getSanctumOverviewData()
            : null;
        if (sanctumData?.seasonBoard && typeof sanctumData.seasonBoard === 'object') {
            boardCandidates.push(sanctumData.seasonBoard);
        }
        const rewardMeta = typeof this.game.getRewardExpeditionMeta === 'function'
            ? this.game.getRewardExpeditionMeta()
            : null;
        if (rewardMeta?.seasonBoard && typeof rewardMeta.seasonBoard === 'object') {
            boardCandidates.push(rewardMeta.seasonBoard);
        }
        const liveBoard = typeof this.getSeasonBoardSnapshot === 'function'
            ? this.getSeasonBoardSnapshot()
            : null;
        if (liveBoard && typeof liveBoard === 'object') {
            boardCandidates.push(liveBoard);
        }
        const board = boardCandidates.find((candidate) => (
            candidate
            && typeof candidate === 'object'
            && (
                candidate.nextTask
                || (Array.isArray(candidate.lanes) && candidate.lanes.some((lane) => Array.isArray(lane?.tasks) && lane.tasks.length > 0))
            )
        )) || null;
        if (!board) return false;
        const tasks = [];
        const pushTask = (task = null, lane = null) => {
            if (!task || typeof task !== 'object') return;
            tasks.push({
                ...task,
                laneId: task.laneId || lane?.id || '',
                laneLabel: task.laneLabel || lane?.label || ''
            });
        };
        if (board.nextTask && typeof board.nextTask === 'object') {
            pushTask(board.nextTask, {
                id: board.nextTask.laneId || '',
                label: board.nextTask.laneLabel || ''
            });
        }
        if (Array.isArray(board.lanes)) {
            board.lanes.forEach((lane) => {
                if (!Array.isArray(lane?.tasks)) return;
                lane.tasks.forEach((task) => pushTask(task, lane));
            });
        }
        const targetTaskId = String(taskId || '').trim();
        const targetTask = tasks.find((entry) => entry.id === targetTaskId)
            || (board.nextTask && typeof board.nextTask === 'object' ? {
                ...board.nextTask,
                laneId: board.nextTask.laneId || '',
                laneLabel: board.nextTask.laneLabel || ''
            } : null)
            || tasks.find((entry) => !entry.completed)
            || tasks[0]
            || null;
        if (!targetTask) return false;
        const resolveAnchorSection = (task = {}) => {
            const anchor = String(task.anchorSection || '').trim();
            if (anchor) return anchor;
            const actionType = String(task.actionType || '').trim();
            const actionValue = String(task.actionValue || '').trim();
            if (actionType === 'collection') return actionValue || 'sanctum';
            if (actionType === 'challenge') return 'challenge';
            if (actionValue === 'pvp-screen') return 'pvp';
            if (actionValue === 'map-screen') return 'map';
            return actionValue || 'sanctum';
        };
        const anchorSection = resolveAnchorSection(targetTask);
        const actionType = String(targetTask.actionType || '').trim();
        const actionValue = String(targetTask.actionValue || '').trim();
        const isCollectionAction = actionType === 'collection'
            || (
                !actionType
                && !['challenge', 'pvp', 'endless', 'map'].includes(anchorSection)
                && !['pvp-screen', 'map-screen'].includes(actionValue)
            );
        const taskFollowNotice = {
            sourceKey: 'task',
            action: isCollectionAction ? 'collection' : (actionType || (anchorSection === 'challenge' ? 'challenge' : 'screen')),
            value: isCollectionAction
                ? (actionValue || anchorSection || 'sanctum')
                : (actionValue || anchorSection || ''),
            buttonLabel: String(targetTask.ctaLabel || (targetTask.completed ? '沿此复核' : '前往推进')).trim() || '前往推进',
            source: String(targetTask.source || 'lane').trim() || 'lane',
            sourceId: String(targetTask.sourceId || targetTask.id || '').trim(),
            taskSource: String(targetTask.taskSource || 'lane').trim() || 'lane',
            taskSourceId: String(targetTask.taskSourceId || targetTask.id || '').trim(),
            taskId: String(targetTask.id || '').trim(),
            laneId: String(targetTask.laneId || '').trim(),
            laneLabel: String(targetTask.laneLabel || '').trim(),
            anchorSection,
            focusLabel: '定位任务行',
            title: String(targetTask.label || targetTask.title || '季盘任务').trim() || '季盘任务',
            note: String(targetTask.hintLine || targetTask.statusLine || targetTask.progressText || '').trim(),
            createdAt: Date.now()
        };
        this.game.lastSeasonBoardTaskFollow = {
            requestedTaskId: targetTaskId,
            taskId: taskFollowNotice.taskId,
            laneId: taskFollowNotice.laneId,
            laneLabel: taskFollowNotice.laneLabel,
            actionType,
            actionValue,
            anchorSection,
            source: taskFollowNotice.source,
            sourceId: taskFollowNotice.sourceId,
            taskSource: taskFollowNotice.taskSource,
            taskSourceId: taskFollowNotice.taskSourceId,
            title: taskFollowNotice.title,
            note: taskFollowNotice.note,
            buttonLabel: taskFollowNotice.buttonLabel,
            followedAt: taskFollowNotice.createdAt
        };
        this.game.lastSeasonBoardTaskFollowNotice = { ...taskFollowNotice };
        this.game.pendingSeasonBoardTaskFollowNotice = taskFollowNotice.action === 'collection'
            ? { ...taskFollowNotice }
            : null;
        return this.game.jumpToSeasonVerificationAnchor(anchorSection, {
            fallbackSection: 'sanctum',
            taskId: targetTask.id || ''
        });
    }

    getSeasonBoardSignalSnapshot(options = {}) {
        const baseSignals = typeof this.game.getHeavenlyMandateSignalSnapshot === 'function'
            ? this.game.getHeavenlyMandateSignalSnapshot(options)
            : {};
        const overrideSlate = options.latestSlate && typeof options.latestSlate === 'object'
            ? options.latestSlate
            : null;
        const latestSlate = overrideSlate || (baseSignals.latestSlate && typeof baseSignals.latestSlate === 'object'
            ? baseSignals.latestSlate
            : null);
        const latestSlateAt = Math.max(
            0,
            Math.floor(Number(
                latestSlate?.timestamp
                ?? latestSlate?.completedAt
                ?? latestSlate?.at
                ?? latestSlate?.createdAt
                ?? 0
            ) || 0)
        );
        const latestSlateWeekTag = latestSlateAt > 0
            ? String(this.game.getHeavenlyMandateWeekMeta(latestSlateAt)?.weekTag || '').trim()
            : String(baseSignals.latestSlateWeekTag || '').trim();
        const agendaSnapshot = typeof this.game.getSanctumAgendaExpeditionSnapshot === 'function'
            ? this.game.getSanctumAgendaExpeditionSnapshot({ latestRunId: String(latestSlate?.id || '') })
            : (baseSignals.agendaSnapshot && typeof baseSignals.agendaSnapshot === 'object'
                ? baseSignals.agendaSnapshot
                : null);
        const activeAgenda = agendaSnapshot?.active || baseSignals.activeAgenda || null;
        const lastAgenda = agendaSnapshot?.lastResolved || baseSignals.lastAgenda || null;
        const expeditionState = typeof this.game.getExpeditionState === 'function'
            ? this.game.getExpeditionState()
            : null;
        const currentChapterIndex = Math.max(
            0,
            Math.floor(Number(expeditionState?.chapterIndex) || 0),
            Math.floor(Number(latestSlate?.chapterIndex) || 0),
            Math.floor(Number(lastAgenda?.boundChapterIndex) || 0),
            Math.floor(Number(activeAgenda?.boundChapterIndex) || 0)
        );
        const lineage = typeof this.game.getFateLineageSnapshot === 'function'
            ? this.game.getFateLineageSnapshot({ latestSlate })
            : null;
        const aftereffects = typeof this.game.getFateAftereffectSnapshot === 'function'
            ? this.game.getFateAftereffectSnapshot({
                latestRunId: String(latestSlate?.id || ''),
                latestSlate,
                currentChapterIndex,
                expeditionState
            })
            : null;
        const seasonVerification = typeof this.game.getSeasonVerificationSnapshot === 'function'
            ? this.game.getSeasonVerificationSnapshot({
                weekTag: String(baseSignals.weekTag || '').trim(),
                weekLabel: String(baseSignals.weekLabel || '').trim()
            })
            : null;
        return {
            ...baseSignals,
            latestSlate,
            latestSlateWeekTag,
            agendaSnapshot,
            activeAgenda,
            lastAgenda,
            currentChapterIndex,
            seasonVerification,
            lineage,
            aftereffects
        };
    }

    getSeasonBoardPhaseMeta(snapshot = null) {
        const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
        const weeklyScore = Math.max(0, Math.floor(Number(source.weeklyScore) || 0));
        const endlessClears = Math.max(0, Math.floor(Number(source.endlessClears) || 0));
        const pvpSeasonMatchCount = Math.max(0, Math.floor(Number(source.pvpSeasonMatchCount) || 0));
        const aftereffectActive = Math.max(0, Math.floor(Number(source.aftereffects?.activeCount) || 0));
        const explicitVerificationCount = Math.max(0, Math.floor(Number(source.seasonVerification?.recordCount) || 0));
        const verificationReady = weeklyScore >= 360
            || endlessClears > 0
            || pvpSeasonMatchCount > 0
            || aftereffectActive > 0
            || explicitVerificationCount > 0;
        if (verificationReady) {
            return {
                id: 'ranking',
                label: '定榜期',
                icon: '🏁'
            };
        }
        const locklineReady = !!source.latestSlate
            || !!source.activeAgenda
            || !!source.lastAgenda
            || !!source.selectedGuide
            || !!source.trainingFocus;
        if (locklineReady) {
            return {
                id: 'lockline',
                label: '锁线期',
                icon: '📜'
            };
        }
        return {
            id: 'sampling',
            label: '采样期',
            icon: '🔭'
        };
    }

    normalizeSeasonBoardSettlement(source = null) {
        const root = source && typeof source === 'object' ? source : null;
        if (!root) return null;
        const outcomeId = (() => {
            const raw = String(root.outcomeId || '').trim();
            const allowed = new Set(['sampling_sheet', 'locking_sheet', 'positive_sheet', 'risky_sheet', 'debt_sheet']);
            return allowed.has(raw) ? raw : 'sampling_sheet';
        })();
        const labelCatalog = {
            sampling_sheet: '待采样',
            locking_sheet: '押卷中',
            positive_sheet: '正卷',
            risky_sheet: '险卷',
            debt_sheet: '欠卷'
        };
        const toneCatalog = {
            sampling_sheet: 'idle',
            locking_sheet: 'selected',
            positive_sheet: 'completed',
            risky_sheet: 'suggested',
            debt_sheet: 'warning'
        };
        const next = {
            id: String(root.id || root.recordId || `season_settlement_${outcomeId}`).trim().slice(0, 80) || `season_settlement_${outcomeId}`,
            sourceRunId: String(root.sourceRunId || '').trim().slice(0, 80),
            chapterIndex: Math.max(0, Math.floor(Number(root.chapterIndex) || 0)),
            outcomeId,
            outcomeLabel: String(root.outcomeLabel || labelCatalog[outcomeId] || '待采样').trim().slice(0, 24) || '待采样',
            outcomeTone: String(root.outcomeTone || toneCatalog[outcomeId] || 'idle').trim().slice(0, 24) || 'idle',
            summaryLine: String(root.summaryLine || '').trim().slice(0, 220),
            detailLine: String(root.detailLine || '').trim().slice(0, 240),
            guideLine: String(root.guideLine || '').trim().slice(0, 240),
            statusLine: String(root.statusLine || '').trim().slice(0, 220),
            progressText: String(root.progressText || '').trim().slice(0, 80),
            settlementWeekTag: String(root.settlementWeekTag || root.weekTag || '').trim().slice(0, 24),
            settlementPhaseId: String(root.settlementPhaseId || root.phaseId || '').trim().slice(0, 32),
            settlementSource: String(root.settlementSource || root.source || 'derived').trim().slice(0, 24) || 'derived',
            resolutionTier: String(root.resolutionTier || outcomeId).trim().slice(0, 24) || outcomeId,
            resolvedStatus: String(root.resolvedStatus || '').trim().slice(0, 24),
            writebackLine: String(root.writebackLine || '').trim().slice(0, 220),
            proofQuality: String(root.proofQuality || '').trim().slice(0, 24),
            lineageStyle: String(root.lineageStyle || '').trim().slice(0, 48),
            primaryVerificationRecordId: String(root.primaryVerificationRecordId || '').trim().slice(0, 96),
            sideVerificationRecordId: String(root.sideVerificationRecordId || '').trim().slice(0, 96),
            selectedContractLabel: String(root.selectedContractLabel || '').trim().slice(0, 40),
            contractResolutionLine: String(root.contractResolutionLine || '').trim().slice(0, 220),
            recoveryEligible: !!root.recoveryEligible
        };
        return Object.values(next).some((value) => value !== '' && value !== 0 && value !== false)
            ? next
            : null;
    }

    normalizeSeasonBoardDebtPack(source = null) {
        const root = source && typeof source === 'object' ? source : null;
        if (!root) return null;
        const status = (() => {
            const raw = String(root.status || '').trim();
            return ['open', 'deferred', 'cleared', 'degraded'].includes(raw) ? raw : 'open';
        })();
        const next = {
            id: String(root.id || root.recordId || 'season_debt_pack').trim().slice(0, 96) || 'season_debt_pack',
            sourceRunId: String(root.sourceRunId || '').trim().slice(0, 80),
            chapterIndex: Math.max(0, Math.floor(Number(root.chapterIndex) || 0)),
            sourceAgendaId: String(root.sourceAgendaId || '').trim().slice(0, 64),
            sourceLabel: String(root.sourceLabel || '').trim().slice(0, 64),
            debtThemeId: String(root.debtThemeId || '').trim().slice(0, 40),
            debtThemeLabel: String(root.debtThemeLabel || '').trim().slice(0, 48),
            summaryLine: String(root.summaryLine || '').trim().slice(0, 220),
            detailLine: String(root.detailLine || '').trim().slice(0, 260),
            guideLine: String(root.guideLine || '').trim().slice(0, 240),
            statusLine: String(root.statusLine || '').trim().slice(0, 220),
            progressText: String(root.progressText || '').trim().slice(0, 80),
            settleWindowText: String(root.settleWindowText || '').trim().slice(0, 48),
            recommendedValidationLabel: String(root.recommendedValidationLabel || '').trim().slice(0, 48),
            recommendedAnchorSection: String(root.recommendedAnchorSection || '').trim().slice(0, 24),
            status,
            deferCount: Math.max(0, Math.floor(Number(root.deferCount) || 0)),
            openedWeekTag: String(root.openedWeekTag || '').trim().slice(0, 24),
            carryIntoWeekTag: String(root.carryIntoWeekTag || '').trim().slice(0, 24),
            occupiedMandateTaskId: String(root.occupiedMandateTaskId || '').trim().slice(0, 64),
            occupationReason: String(root.occupationReason || '').trim().slice(0, 180),
            occupiesStrongSlot: ['open', 'deferred'].includes(status),
            resolvedStatus: String(root.resolvedStatus || '').trim().slice(0, 24),
            writebackLine: String(root.writebackLine || '').trim().slice(0, 220),
            verificationRecordId: String(root.verificationRecordId || '').trim().slice(0, 96),
            selectedContractLabel: String(root.selectedContractLabel || '').trim().slice(0, 40),
            contractResolutionLine: String(root.contractResolutionLine || '').trim().slice(0, 220),
            recoveryEligible: !!root.recoveryEligible
        };
        return Object.values(next).some((value) => value !== '' && value !== 0 && value !== false)
            ? next
            : null;
    }

    normalizeSeasonBoardVerificationOrder(source = null, index = 0) {
        const root = source && typeof source === 'object' ? source : null;
        if (!root) return null;
        const next = {
            id: String(root.id || `season_verification_${index + 1}`).trim().slice(0, 64) || `season_verification_${index + 1}`,
            type: String(root.type || 'verify').trim().slice(0, 24) || 'verify',
            role: ['primary', 'side'].includes(String(root.role || '').trim())
                ? String(root.role).trim()
                : (index === 0 ? 'primary' : 'side'),
            label: String(root.label || `验证状 ${index + 1}`).trim().slice(0, 64) || `验证状 ${index + 1}`,
            summaryLine: String(root.summaryLine || '').trim().slice(0, 220),
            detailLine: String(root.detailLine || '').trim().slice(0, 240),
            hintLine: String(root.hintLine || '').trim().slice(0, 220),
            statusLine: String(root.statusLine || '').trim().slice(0, 120),
            anchorSection: String(root.anchorSection || '').trim().slice(0, 24),
            priority: Math.max(1, Math.min(9, Math.floor(Number(root.priority) || index + 1))),
            resultStatus: String(root.resultStatus || '').trim().slice(0, 24),
            writebackMode: String(root.writebackMode || '').trim().slice(0, 32),
            writebackLine: String(root.writebackLine || '').trim().slice(0, 220),
            sourceMode: String(root.sourceMode || '').trim().slice(0, 24),
            sourceModeLabel: String(root.sourceModeLabel || '').trim().slice(0, 32),
            resolvedRunId: String(root.resolvedRunId || '').trim().slice(0, 80),
            chapterIndex: Math.max(0, Math.floor(Number(root.chapterIndex) || 0)),
            proofQuality: String(root.proofQuality || '').trim().slice(0, 24),
            lineageStyle: String(root.lineageStyle || '').trim().slice(0, 48),
            carryIntoNextWeek: !!root.carryIntoNextWeek
        };
        return Object.values(next).some((value) => value !== '' && value !== 0)
            ? next
            : null;
    }

    normalizeSeasonBoardWeekVerdictLedger(source = null) {
        const root = source && typeof source === 'object' ? source : null;
        if (!root) return null;
        const currentSource = root.current && typeof root.current === 'object' ? root.current : root;
        const current = currentSource
            ? {
                ledgerId: String(currentSource.ledgerId || currentSource.id || '').trim().slice(0, 96),
                weekTag: String(currentSource.weekTag || '').trim().slice(0, 24),
                weekLabel: String(currentSource.weekLabel || '').trim().slice(0, 32),
                phaseId: String(currentSource.phaseId || '').trim().slice(0, 32),
                phaseLabel: String(currentSource.phaseLabel || '').trim().slice(0, 24),
                sourceRunId: String(currentSource.sourceRunId || '').trim().slice(0, 80),
                chapterIndex: Math.max(0, Math.floor(Number(currentSource.chapterIndex) || 0)),
                settlementId: String(currentSource.settlementId || '').trim().slice(0, 96),
                settlementOutcomeId: String(currentSource.settlementOutcomeId || '').trim().slice(0, 32),
                settlementOutcomeLabel: String(currentSource.settlementOutcomeLabel || '').trim().slice(0, 24),
                debtPackId: String(currentSource.debtPackId || '').trim().slice(0, 96),
                debtStatus: String(currentSource.debtStatus || '').trim().slice(0, 24),
                deferCount: Math.max(0, Math.floor(Number(currentSource.deferCount) || 0)),
                carryIntoWeekTag: String(currentSource.carryIntoWeekTag || '').trim().slice(0, 24),
                primaryVerificationOrderId: String(currentSource.primaryVerificationOrderId || '').trim().slice(0, 64),
                sideVerificationOrderId: String(currentSource.sideVerificationOrderId || '').trim().slice(0, 64),
                resolutionTier: String(currentSource.resolutionTier || '').trim().slice(0, 24),
                resolvedStatus: String(currentSource.resolvedStatus || '').trim().slice(0, 24),
                primaryVerificationResultStatus: String(currentSource.primaryVerificationResultStatus || '').trim().slice(0, 24),
                sideVerificationResultStatus: String(currentSource.sideVerificationResultStatus || '').trim().slice(0, 24),
                primaryWritebackMode: String(currentSource.primaryWritebackMode || '').trim().slice(0, 32),
                sideWritebackMode: String(currentSource.sideWritebackMode || '').trim().slice(0, 32),
                writebackLine: String(currentSource.writebackLine || '').trim().slice(0, 220),
                proofQuality: String(currentSource.proofQuality || '').trim().slice(0, 24),
                lineageStyle: String(currentSource.lineageStyle || '').trim().slice(0, 48),
                carryIntoNextWeek: !!currentSource.carryIntoNextWeek,
                settlementSource: String(currentSource.settlementSource || '').trim().slice(0, 24),
                summaryLine: String(currentSource.summaryLine || '').trim().slice(0, 220),
                frontierResolutionId: String(currentSource.frontierResolutionId || '').trim().slice(0, 96),
                frontierResolutionChoiceId: String(currentSource.frontierResolutionChoiceId || currentSource.resolutionChoiceId || currentSource.choiceId || '').trim().slice(0, 32),
                frontierResolutionLabel: String(currentSource.frontierResolutionLabel || currentSource.choiceLabel || '').trim().slice(0, 32),
                frontierResolutionStance: String(currentSource.frontierResolutionStance || '').trim().slice(0, 48),
                frontierResolutionSupportLaneId: String(currentSource.frontierResolutionSupportLaneId || currentSource.supportLaneId || '').trim().slice(0, 32),
                frontierResolutionSupportLaneLabel: String(currentSource.frontierResolutionSupportLaneLabel || currentSource.supportLaneLabel || '').trim().slice(0, 24),
                frontierResolutionSummaryLine: String(currentSource.frontierResolutionSummaryLine || '').trim().slice(0, 220),
                chronicleSealStatus: String(currentSource.chronicleSealStatus || '').trim().slice(0, 24),
                chronicleSealLine: String(currentSource.chronicleSealLine || '').trim().slice(0, 220),
                councilResolutionLine: String(currentSource.councilResolutionLine || '').trim().slice(0, 220),
                frontierResolutionSubmittedAt: Math.max(0, Math.floor(Number(currentSource.frontierResolutionSubmittedAt || currentSource.resolutionSubmittedAt) || 0))
            }
            : null;
        return current && Object.values(current).some((value) => value !== '' && value !== 0)
            ? { current }
            : null;
    }

    buildSeasonBoardSettlementState(signals = {}, phase = null) {
        const safeSignals = signals && typeof signals === 'object' ? signals : {};
        const safePhase = phase && typeof phase === 'object' ? phase : this.getSeasonBoardPhaseMeta(safeSignals);
        const lastAgenda = safeSignals.lastAgenda && typeof safeSignals.lastAgenda === 'object'
            ? safeSignals.lastAgenda
            : null;
        const aftereffects = safeSignals.aftereffects && typeof safeSignals.aftereffects === 'object'
            ? safeSignals.aftereffects
            : null;
        const primaryAftereffect = aftereffects?.primary && typeof aftereffects.primary === 'object'
            ? aftereffects.primary
            : null;
        const seasonVerification = safeSignals.seasonVerification && typeof safeSignals.seasonVerification === 'object'
            ? safeSignals.seasonVerification
            : null;
        const primaryVerification = seasonVerification?.primary && typeof seasonVerification.primary === 'object'
            ? seasonVerification.primary
            : null;
        const sideVerification = seasonVerification?.side && typeof seasonVerification.side === 'object'
            ? seasonVerification.side
            : null;
        const primaryResultStatus = String(primaryVerification?.resultStatus || '').trim();
        const sideResultStatus = String(sideVerification?.resultStatus || '').trim();
        const primaryWritebackMode = String(primaryVerification?.writebackMode || '').trim();
        const primaryVerified = primaryResultStatus === 'verified';
        const primaryFailed = primaryResultStatus === 'failed';
        const sideVerified = sideResultStatus === 'verified';
        const endlessClears = Math.max(0, Math.floor(Number(safeSignals.endlessClears) || 0));
        const pvpMatches = Math.max(0, Math.floor(Number(safeSignals.pvpSeasonMatchCount) || 0));
        const hasCrossVerification = endlessClears > 0 || pvpMatches > 0;
        const hasDebt = !!(
            lastAgenda?.recoveryEligible
            || (lastAgenda?.selectedContractLabel && lastAgenda?.contractResolved && lastAgenda?.contractSuccess === false)
            || ['contract_miss', 'recovery'].includes(String(primaryAftereffect?.outcomeId || '').trim())
            || (lastAgenda?.outcome && !['success', 'completed'].includes(String(lastAgenda.outcome || '').trim()))
        );
        const sourceRunId = String(
            lastAgenda?.sourceRunId
            || primaryAftereffect?.sourceRunId
            || safeSignals.latestSlate?.id
            || ''
        ).trim();
        const sourceSlate = sourceRunId && Array.isArray(this.game.runSlateArchive)
            ? this.game.runSlateArchive.find((entry) => String(entry?.id || '').trim() === sourceRunId) || null
            : null;
        const chapterIndex = Math.max(
            0,
            Math.floor(Number(
                lastAgenda?.boundChapterIndex
                ?? lastAgenda?.chapterIndex
                ?? primaryAftereffect?.chapterIndex
                ?? safeSignals.latestSlate?.chapterIndex
                ?? 0
            ) || 0)
        );
        const currentWeekTag = String(safeSignals.weekTag || '').trim();
        const toWeekIndex = (weekTag = '') => {
            const match = String(weekTag || '').trim().match(/^(\d+)-W(\d+)$/);
            return match ? (Math.max(0, Number(match[1])) * 100 + Math.max(0, Number(match[2]))) : 0;
        };
        const currentWeekIndex = Math.max(
            0,
            Math.floor(Number(safeSignals.weekIndex) || 0),
            toWeekIndex(currentWeekTag)
        );
        const openedAt = Math.max(
            0,
            Math.floor(Number(
                lastAgenda?.updatedAt
                ?? lastAgenda?.resolvedAt
                ?? lastAgenda?.completedAt
                ?? lastAgenda?.selectedAt
                ?? primaryAftereffect?.createdAt
                ?? sourceSlate?.timestamp
                ?? (safeSignals.latestSlate?.id === sourceRunId ? safeSignals.latestSlate?.timestamp : 0)
                ?? 0
            ) || 0)
        );
        const openedWeekMeta = openedAt > 0 && typeof this.game.getHeavenlyMandateWeekMeta === 'function'
            ? this.game.getHeavenlyMandateWeekMeta(openedAt)
            : null;
        const openedWeekTag = String(
            lastAgenda?.openedWeekTag
            || primaryAftereffect?.openedWeekTag
            || openedWeekMeta?.weekTag
            || ''
        ).trim();
        const openedWeekIndex = Math.max(
            0,
            Math.floor(Number(openedWeekMeta?.weekIndex) || 0),
            toWeekIndex(openedWeekTag)
        );
        const weekDelta = hasDebt && currentWeekTag && openedWeekTag && currentWeekTag !== openedWeekTag
            ? Math.max(
                1,
                (currentWeekIndex > 0 && openedWeekIndex > 0)
                    ? currentWeekIndex - openedWeekIndex
                    : 1
            )
            : 0;
        const debtClearedByVerification = hasDebt && primaryVerified && primaryWritebackMode === 'clear_debt';
        const debtDegradedByVerification = hasDebt && primaryFailed;
        const debtDegradedByDelay = hasDebt && !debtClearedByVerification && !debtDegradedByVerification && weekDelta >= 2;
        const debtDelayCount = debtDegradedByDelay ? Math.max(2, weekDelta) : 0;
        const debtStatus = hasDebt
            ? (debtClearedByVerification
                ? 'cleared'
                : (debtDegradedByVerification
                    ? 'degraded'
                    : (debtDegradedByDelay
                        ? 'degraded'
                        : (weekDelta > 0 ? 'deferred' : 'open'))))
            : '';
        const debtOccupiesStrongSlot = ['open', 'deferred'].includes(debtStatus);
        const occupiedMandateTaskId = debtOccupiesStrongSlot
            ? `season_mandate_debt_focus_${String(lastAgenda?.agendaId || sourceRunId || currentWeekTag || 'current').trim().slice(0, 40)}`
            : '';
        const occupationReason = debtStatus === 'deferred'
            ? `旧周欠卷已带入 ${currentWeekTag || safeSignals.weekLabel || '本周'}，强目标先让位给清账。`
            : (debtDegradedByDelay
                ? `这笔欠卷已拖延 ${debtDelayCount} 周，当前降级为反证，不再继续占据强目标。`
            : (debtStatus === 'open'
                ? '本周刚形成欠卷，强目标先切到清账。'
                : (debtStatus === 'cleared'
                    ? '主验证已清账，强目标重新释放给赛季推进。'
                    : '主验证给出反证，欠卷改记为反例，不再继续占据强目标。')));
        const debtProgressText = debtStatus === 'deferred'
            ? `已拖延 ${Math.max(1, weekDelta)} 周`
            : (debtDegradedByDelay
                ? `拖延 ${debtDelayCount} 周后降级`
            : (debtStatus === 'cleared'
                ? '已清账'
                : (debtStatus === 'degraded'
                    ? '反证已入账'
                    : (primaryAftereffect?.remainingChapters > 0
                        ? `清账窗口 ${Math.max(1, Math.floor(Number(primaryAftereffect.remainingChapters) || 1))} 章`
                        : '本周内优先清账'))));
        const debtStatusLine = debtStatus === 'deferred'
            ? `欠卷已拖延 ${Math.max(1, weekDelta)} 周`
            : (debtDegradedByDelay
                ? `欠卷已拖延 ${debtDelayCount} 周，现转为反证`
            : (debtStatus === 'cleared'
                ? (primaryVerification?.statusLine || '欠卷已清账')
                : (debtStatus === 'degraded'
                    ? (primaryVerification?.statusLine || '欠卷已转为反证')
                    : (primaryAftereffect?.statusLine || '欠卷待清账'))));
        const debtGuideLine = debtStatus === 'deferred'
            ? `这笔欠卷已带入 ${safeSignals.weekLabel || currentWeekTag || '本周'}，先清账，再决定这一周是否继续冲定榜验证。`
            : (debtDegradedByDelay
                ? `这笔欠卷已经拖延 ${debtDelayCount} 周，当前先按反证收束主轴，再决定是否重新建立高压验证。`
            : (debtStatus === 'cleared'
                ? (primaryVerification?.writebackLine || '主验证已经完成清账，可以回到定榜推进。')
                : (debtStatus === 'degraded'
                    ? (primaryVerification?.writebackLine || '这笔欠卷已经转成反证，先修正主轴再继续扩线。')
                    : '先处理上一道承诺留下的欠卷，再决定这一周是否值得继续冲定榜验证。')));

        let outcomeId = 'sampling_sheet';
        if (safePhase.id === 'lockline') {
            outcomeId = 'locking_sheet';
        } else if (safePhase.id === 'ranking') {
            if (primaryVerified) {
                outcomeId = 'positive_sheet';
            } else if (hasDebt && !debtClearedByVerification && !debtDegradedByVerification && !debtDegradedByDelay) {
                outcomeId = 'debt_sheet';
            } else if (primaryFailed || debtDegradedByDelay) {
                outcomeId = 'risky_sheet';
            } else {
                outcomeId = hasCrossVerification
                    ? 'positive_sheet'
                    : 'risky_sheet';
            }
        }

        const labelCatalog = {
            sampling_sheet: '待采样',
            locking_sheet: '押卷中',
            positive_sheet: '正卷',
            risky_sheet: '险卷',
            debt_sheet: '欠卷'
        };
        const toneCatalog = {
            sampling_sheet: 'idle',
            locking_sheet: 'selected',
            positive_sheet: 'completed',
            risky_sheet: 'suggested',
            debt_sheet: 'warning'
        };
        const proofQualityLabelMap = {
            thin: '薄证',
            solid: '实证',
            decisive: '铁证'
        };
        const proofQuality = String(
            primaryVerification?.proofQuality
            || sideVerification?.proofQuality
            || (hasCrossVerification ? 'solid' : '')
        ).trim();
        const proofQualityLabel = proofQualityLabelMap[proofQuality] || '';
        const lineageStyle = String(primaryVerification?.lineageStyle || sideVerification?.lineageStyle || '').trim();
        const primaryVerificationRecordId = String(primaryVerification?.recordId || '').trim();
        const sideVerificationRecordId = String(sideVerification?.recordId || '').trim();
        const primaryWritebackLine = String(primaryVerification?.writebackLine || '').trim();
        const sideWritebackLine = String(sideVerification?.writebackLine || '').trim();
        const resolvedStatus = primaryVerified
            ? 'verified'
            : (primaryFailed
                ? 'failed'
                : (sideVerified ? 'reinforced' : (debtStatus || 'pending')));
        const settlementSourceRunId = String(primaryVerification?.resolvedRunId || sourceRunId || '').trim();
        const settlementChapterIndex = Math.max(
            chapterIndex,
            Math.floor(Number(primaryVerification?.chapterIndex) || 0),
            Math.floor(Number(sideVerification?.chapterIndex) || 0)
        );
        const summaryCatalog = {
            sampling_sheet: '当前仍在采样，本周主轴还没有结成可押卷的赛季答卷。',
            locking_sheet: '当前样本已经开始押卷，但还要继续把章节承诺真正锁进洞府与归卷。',
            positive_sheet: primaryVerified
                ? (debtClearedByVerification
                    ? '主验证已经回写，本周欠卷已清，本周押卷改判为「正卷」。'
                    : '主验证已经回写，本周押卷升级为「正卷」。')
                : '本周押卷已结成「正卷」，这条主轴已经通过至少一条高压验证。',
            risky_sheet: primaryFailed
                ? '主验证给出了反证，本周押卷暂降为「险卷」，需要重新校准主轴。'
                : (debtDegradedByDelay
                    ? `这笔欠卷已连续拖延 ${debtDelayCount} 周，当前从强目标位降为「险卷」反证，需要先收紧主轴再继续推进。`
                    : '本周押卷已结成「险卷」，路线已成形，但还需要外场验证决定能否真正定榜。'),
            debt_sheet: sideVerified
                ? '旁验证已经补上，但上一道承诺留下的欠卷仍待主验证清账。'
                : '本周押卷暂结成「欠卷」，上一道承诺留下了待清的研究债账。'
        };
        const detailCatalog = {
            sampling_sheet: safeSignals.selectedGuide?.title
                ? `当前主练样本：${safeSignals.selectedGuide.title}。先把它压成一张本周可复盘的章节答卷。`
                : '先锁一份精选命盘或本周归卷，再决定真正要押哪条主线。',
            locking_sheet: lastAgenda?.phaseLine
                || lastAgenda?.focusNodeLine
                || lastAgenda?.summaryLine
                || '当前押卷正在推进，先把承诺写成真正的章节留痕。',
            positive_sheet: [
                primaryVerification?.summaryLine || '',
                primaryVerification?.detailLine || primaryWritebackLine || '',
                sideVerified ? (sideVerification?.summaryLine || sideWritebackLine || '') : '',
                !primaryVerified && lastAgenda?.contractResolutionLine ? lastAgenda.contractResolutionLine : '',
                !primaryVerified && endlessClears > 0 ? `无尽已清 ${endlessClears} 轮` : '',
                !primaryVerified && pvpMatches > 0 ? `天道榜已留 ${pvpMatches} 场账本` : ''
            ].filter(Boolean).slice(0, 2).join('｜'),
            risky_sheet: [
                debtDegradedByDelay ? (primaryAftereffect?.detailLine || '') : (primaryFailed ? (primaryVerification?.summaryLine || '') : ''),
                debtDegradedByDelay
                    ? `延账 ${debtDelayCount} 周后已从强目标位降级，不再继续占用本周主舞台。`
                    : (!primaryFailed && sideVerified ? (sideVerification?.summaryLine || sideWritebackLine || '') : ''),
                debtDegradedByDelay
                    ? (lastAgenda?.recoveryHintLine || lastAgenda?.contractResolutionLine || '')
                    : (primaryFailed
                        ? (primaryVerification?.detailLine || primaryWritebackLine || '')
                        : (lastAgenda?.contractResolutionLine || '')),
                debtDegradedByDelay || primaryFailed
                    ? ''
                    : '当前主轴还缺最后一轮高压验算，适合继续补无尽或天道榜样本。'
            ].filter(Boolean).slice(0, 2).join('｜'),
            debt_sheet: [
                primaryAftereffect?.detailLine || '',
                sideVerified ? (sideVerification?.summaryLine || sideWritebackLine || '') : '',
                lastAgenda?.recoveryHintLine || lastAgenda?.recoveryLine || lastAgenda?.reasonLine || ''
            ].filter(Boolean).slice(0, 2).join('｜')
        };
        const progressCatalog = {
            sampling_sheet: '等待第一张归卷',
            locking_sheet: lastAgenda
                ? `${Math.max(0, Math.floor(Number(lastAgenda.progress) || 0))}/${Math.max(1, Math.floor(Number(lastAgenda.target) || 1))} 项押卷推进`
                : '等待洞府承诺立项',
            positive_sheet: primaryVerified
                ? `${primaryVerification?.sourceModeLabel || '主验证'} 已回写`
                : `无尽 ${endlessClears}/1 · 天道榜 ${Math.min(pvpMatches, 2)}/2`,
            risky_sheet: primaryFailed
                ? '反证已入账'
                : (debtDegradedByDelay
                    ? `拖延 ${debtDelayCount} 周后降级`
                    : `待补外场验证 ${hasCrossVerification ? 0 : 1} 条`),
            debt_sheet: primaryAftereffect?.remainingChapters > 0
                ? `清账窗口 ${Math.max(1, Math.floor(Number(primaryAftereffect.remainingChapters) || 1))} 章`
                : '本周内优先清账'
        };
        const guideCatalog = {
            sampling_sheet: '先把本周主练样本压成一张可复盘答卷，再决定要不要立项押卷。',
            locking_sheet: '继续沿洞府承诺推进，先把押卷锁进章节结算，再考虑外场验证。',
            positive_sheet: primaryVerified
                ? (sideVerified
                    ? '主验证与旁验证都已回写，可以继续沿当前主修扩样本。'
                    : '主验证已回写，可继续补一张不同节奏的旁验证巩固这条正卷。')
                : (hasCrossVerification
                    ? '当前正卷已经站住脚，主验证可继续补无尽或天道榜，旁验证可去七日劫数复盘。'
                    : '主轴已经成形，但还没留下真正的高压验证样本。'),
            risky_sheet: primaryFailed
                ? '先根据反证收紧路线，再决定是补旁证、换验证入口，还是重新建立主验证。'
                : (debtDegradedByDelay
                    ? `这笔欠卷已经拖延 ${debtDelayCount} 周，当前先按反证收束主轴，再决定是否重新建立高压验证。`
                    : (sideVerified
                        ? '旁验证已经补齐，但仍需把这条险卷送去无尽或天道榜做真正的主验证。'
                        : '先把当前险卷送去无尽或天道榜做一次高压验证，再用七日劫数补一张挑战旁证。')),
            debt_sheet: sideVerified
                ? '旁验证已经给出补强，但仍需主验证真正清账后才能释放本周定榜节奏。'
                : '先处理上一道承诺留下的欠卷，再决定这一周是否值得继续冲定榜验证。'
        };
        const statusCatalog = {
            sampling_sheet: '待形成可押卷主轴',
            locking_sheet: '洞府承诺推进中',
            positive_sheet: primaryVerified
                ? [
                    debtClearedByVerification ? '欠卷已清' : '主验证通过',
                    primaryVerification?.sourceModeLabel || '',
                    proofQualityLabel
                ].filter(Boolean).join(' · ')
                : '正卷已通过至少一条外场验证',
            risky_sheet: primaryFailed
                ? [
                    '主验证失利',
                    primaryVerification?.sourceModeLabel || '',
                    proofQualityLabel
                ].filter(Boolean).join(' · ')
                : (debtDegradedByDelay
                    ? `延账 ${debtDelayCount} 周 · 已降级`
                : (sideVerified
                    ? [
                        '旁验证已补',
                        sideVerification?.sourceModeLabel || '',
                        '险卷待主验证'
                    ].filter(Boolean).join(' · ')
                    : '险卷待做外场定榜验证')),
            debt_sheet: sideVerified
                ? [
                    '旁验证已补',
                    sideVerification?.sourceModeLabel || '',
                    debtStatusLine
                ].filter(Boolean).join(' · ')
                : '欠卷待清账'
        };

        const settlement = this.normalizeSeasonBoardSettlement({
            id: `season_settlement_${outcomeId}_${settlementSourceRunId || safeSignals.weekTag || 'current'}`,
            sourceRunId: settlementSourceRunId,
            chapterIndex: settlementChapterIndex,
            outcomeId,
            outcomeLabel: labelCatalog[outcomeId],
            outcomeTone: toneCatalog[outcomeId],
            summaryLine: summaryCatalog[outcomeId],
            detailLine: detailCatalog[outcomeId],
            guideLine: guideCatalog[outcomeId],
            statusLine: statusCatalog[outcomeId],
            progressText: progressCatalog[outcomeId],
            settlementWeekTag: currentWeekTag,
            settlementPhaseId: safePhase.id,
            settlementSource: primaryVerification ? 'season_verification' : (sourceRunId ? 'run_slate' : (lastAgenda ? 'agenda' : 'derived')),
            resolutionTier: primaryVerified
                ? (debtClearedByVerification ? 'recovered' : 'confirmed')
                : (primaryFailed || debtDegradedByDelay
                    ? 'degraded'
                    : (outcomeId === 'risky_sheet'
                        ? 'provisional'
                        : (outcomeId === 'debt_sheet'
                            ? 'debt'
                            : (outcomeId === 'locking_sheet' ? 'commit' : 'sampling')))),
            resolvedStatus,
            writebackLine: primaryWritebackLine || sideWritebackLine || '',
            proofQuality,
            lineageStyle,
            primaryVerificationRecordId,
            sideVerificationRecordId,
            selectedContractLabel: String(lastAgenda?.selectedContractLabel || '').trim(),
            contractResolutionLine: String(lastAgenda?.contractResolutionLine || '').trim(),
            recoveryEligible: !!lastAgenda?.recoveryEligible
        });

        const debtPack = debtStatus
            ? this.normalizeSeasonBoardDebtPack({
                id: `season_debt_${settlementSourceRunId || lastAgenda?.agendaId || safeSignals.weekTag || 'current'}`,
                sourceRunId: settlementSourceRunId,
                chapterIndex: settlementChapterIndex,
                sourceAgendaId: String(lastAgenda?.agendaId || '').trim(),
                sourceLabel: String(lastAgenda?.name || primaryAftereffect?.sourceLabel || '赛季欠卷').trim(),
                debtThemeId: String(primaryAftereffect?.templateId || safeSignals.activeAgenda?.rewardTrackId || '').trim(),
                debtThemeLabel: String(primaryAftereffect?.templateLabel || safeSignals.activeAgenda?.rewardTrackName || '研究债账').trim(),
                summaryLine: debtStatus === 'cleared'
                    ? `研究债账已清：${String(primaryVerification?.summaryLine || primaryWritebackLine || lastAgenda?.recoveryLine || '这笔欠卷已经完成清账。').trim()}`
                    : (debtStatus === 'degraded'
                        ? `${debtDegradedByDelay ? '研究债账拖延降级' : '研究债账转为反证'}：${String(primaryVerification?.summaryLine || primaryWritebackLine || lastAgenda?.reasonLine || '这笔欠卷已经转成反证。').trim()}`
                        : (primaryAftereffect?.summaryLine
                            ? `研究债账：${String(primaryAftereffect.summaryLine || '').trim()}`
                            : `研究债账：${String(lastAgenda?.recoveryLine || lastAgenda?.reasonLine || '上一道押卷承诺仍待清账。').trim()}`)),
                detailLine: [
                    debtStatus === 'cleared' || debtStatus === 'degraded'
                        ? (primaryVerification?.detailLine || primaryWritebackLine || '')
                        : (primaryAftereffect?.detailLine || ''),
                    sideVerified ? (sideVerification?.summaryLine || sideWritebackLine || '') : '',
                    lastAgenda?.recoveryHintLine || lastAgenda?.contractResolutionLine || ''
                ].filter(Boolean).slice(0, 2).join('｜'),
                guideLine: debtGuideLine,
                statusLine: debtStatusLine,
                progressText: debtProgressText,
                settleWindowText: debtStatus === 'deferred'
                    ? `已带入 ${safeSignals.weekLabel || currentWeekTag || '本周'}`
                    : (debtStatus === 'cleared'
                        ? '本周已清'
                        : (debtStatus === 'degraded'
                            ? (debtDegradedByDelay ? `拖延 ${debtDelayCount} 周后降级` : '反证归档')
                            : (primaryAftereffect?.remainingChapters > 0
                                ? `剩余 ${Math.max(1, Math.floor(Number(primaryAftereffect.remainingChapters) || 1))} 章`
                                : '本周内清账'))),
                recommendedValidationLabel: debtStatus === 'cleared'
                    ? '清账已回写'
                    : (debtStatus === 'degraded' ? '反证归档' : '清债验证'),
                recommendedAnchorSection: String(
                    primaryVerification?.anchorSection
                    || sideVerification?.anchorSection
                    || (safeSignals.endlessSeason ? 'endless' : (safeSignals.pvpSeason ? 'pvp' : 'sanctum'))
                ).trim(),
                status: debtStatus,
                deferCount: debtStatus === 'deferred' ? weekDelta : (debtDegradedByDelay ? debtDelayCount : 0),
                openedWeekTag,
                carryIntoWeekTag: debtStatus === 'deferred' ? currentWeekTag : '',
                occupiedMandateTaskId,
                occupationReason,
                occupiesStrongSlot: debtOccupiesStrongSlot,
                resolvedStatus,
                writebackLine: primaryWritebackLine || sideWritebackLine || '',
                verificationRecordId: primaryVerificationRecordId,
                selectedContractLabel: String(lastAgenda?.selectedContractLabel || '').trim(),
                contractResolutionLine: String(lastAgenda?.contractResolutionLine || '').trim(),
                recoveryEligible: !!lastAgenda?.recoveryEligible
            })
            : null;

        const debtPending = debtPack && ['open', 'deferred'].includes(String(debtPack.status || '').trim());
        const needEndless = endlessClears < 1;
        const needPvp = pvpMatches < 2;
        const weeklyScore = Math.max(0, Math.floor(Number(safeSignals.weeklyScore) || 0));
        const weeklyArchiveCount = Math.max(0, Math.floor(Number(safeSignals.weeklyArchiveCount) || 0));
        const weeklyChallengeTarget = 360;
        const weeklyChallengeProgress = `${Math.min(weeklyScore, weeklyChallengeTarget)}/${weeklyChallengeTarget}`;
        const weeklyChallengeLabel = '七日劫数';
        const weeklyChallengeName = String(safeSignals.weeklyBundle?.rule?.name || weeklyChallengeLabel).trim() || weeklyChallengeLabel;
        const challengeSideVerificationOrder = !debtPending && ['positive_sheet', 'risky_sheet'].includes(String(settlement?.outcomeId || '').trim())
            ? {
                id: 'challenge_followup',
                type: 'challenge_followup',
                role: 'side',
                label: settlement?.outcomeId === 'positive_sheet' ? '补一轮七日劫数旁证' : '补一轮七日劫数试压',
                summaryLine: settlement?.outcomeId === 'positive_sheet'
                    ? (
                        weeklyScore >= weeklyChallengeTarget
                            ? '用七日劫数继续复盘这条正卷，补一张不同节奏的旁验证。'
                            : '去七日劫数打一轮，把当前正卷补成一张挑战旁证。'
                    )
                    : (
                        weeklyScore >= weeklyChallengeTarget
                            ? '先用七日劫数复盘当前险卷，再决定去无尽还是天道榜冲定榜。'
                            : '先去七日劫数打一轮，把当前险卷压成一张挑战旁证。'
                    ),
                hintLine: safeSignals.weeklyBundle
                    ? `${weeklyChallengeName} · 当前 ${weeklyScore} 分${weeklyArchiveCount > 0 ? ` · 已归档 ${weeklyArchiveCount} 份样本` : ''}`
                    : '周挑战会用固定命盘复刻这周主练，适合补一张挑战旁证。',
                statusLine: `${weeklyChallengeLabel} ${weeklyChallengeProgress}${weeklyArchiveCount > 0 ? ` · 归档 ${weeklyArchiveCount}` : ''}`,
                anchorSection: 'challenge',
                priority: 2
            }
            : null;
        const crossModeFollowupOrder = {
            id: debtPending ? 'rank_after_clear' : (needEndless ? 'pvp_followup' : 'endless_followup'),
            type: debtPending ? 'rank_after_clear' : 'followup',
            role: 'side',
            label: debtPending ? '清账后再冲定榜验证' : (needEndless ? '补一场天道榜账本' : '补一轮无尽样本'),
            summaryLine: debtPending
                ? '欠卷清掉后，再把这条主轴送去无尽或天道榜补齐定榜证明。'
                : (needEndless
                    ? '补一场真实对局账本，让本周主轴留下外场反证。'
                    : '再补一轮无尽样本，确认这条路线在更长压力线上依然成立。'),
            hintLine: debtPending
                ? '先清账，再定榜，避免把未结的旧账继续压到下一周。'
                : (needEndless
                    ? `${safeSignals.pvpSeasonName || '天道榜'} 会更快给出真实外场样本。`
                    : `${safeSignals.endlessSeason?.name || '无尽轮回'} 更适合补长线压强证明。`),
            statusLine: debtPending
                ? '清账后解锁'
                : `无尽 ${endlessClears}/1 · 天道榜 ${Math.min(pvpMatches, 2)}/2`,
            anchorSection: debtPending ? (needEndless ? 'endless' : 'pvp') : (needEndless ? 'pvp' : 'endless'),
            priority: 2
        };
        const explicitPrimaryOrder = primaryVerification
            ? {
                id: primaryVerification.recordId || 'season_primary_verification',
                type: primaryVerified ? 'verification_result' : (primaryFailed ? 'verification_counterexample' : 'verification_pending'),
                role: 'primary',
                label: primaryVerification.label || (primaryVerified ? '主验证已回写' : '主验证待复核'),
                summaryLine: primaryVerification.summaryLine || '',
                detailLine: primaryVerification.detailLine || primaryWritebackLine || '',
                hintLine: primaryWritebackLine || primaryVerification.detailLine || '',
                statusLine: primaryVerification.statusLine || '',
                anchorSection: primaryVerification.anchorSection || (needEndless ? 'endless' : 'pvp'),
                priority: 1,
                resultStatus: primaryResultStatus,
                writebackMode: primaryWritebackMode,
                writebackLine: primaryWritebackLine,
                sourceMode: primaryVerification.sourceMode || '',
                sourceModeLabel: primaryVerification.sourceModeLabel || '',
                resolvedRunId: primaryVerification.resolvedRunId || '',
                chapterIndex: primaryVerification.chapterIndex || 0,
                proofQuality: primaryVerification.proofQuality || '',
                lineageStyle: primaryVerification.lineageStyle || '',
                carryIntoNextWeek: !!primaryVerification.carryIntoNextWeek
            }
            : null;
        const explicitSideOrder = sideVerification
            ? {
                id: sideVerification.recordId || 'season_side_verification',
                type: sideVerified ? 'verification_side_result' : 'verification_side_pending',
                role: 'side',
                label: sideVerification.label || '旁验证状',
                summaryLine: sideVerification.summaryLine || '',
                detailLine: sideVerification.detailLine || sideWritebackLine || '',
                hintLine: sideWritebackLine || sideVerification.detailLine || '',
                statusLine: sideVerification.statusLine || '',
                anchorSection: sideVerification.anchorSection || 'challenge',
                priority: 2,
                resultStatus: sideResultStatus,
                writebackMode: sideVerification.writebackMode || '',
                writebackLine: sideWritebackLine,
                sourceMode: sideVerification.sourceMode || '',
                sourceModeLabel: sideVerification.sourceModeLabel || '',
                resolvedRunId: sideVerification.resolvedRunId || '',
                chapterIndex: sideVerification.chapterIndex || 0,
                proofQuality: sideVerification.proofQuality || '',
                lineageStyle: sideVerification.lineageStyle || '',
                carryIntoNextWeek: !!sideVerification.carryIntoNextWeek
            }
            : null;
        const fallbackPrimaryOrder = debtPending
            ? {
                id: 'clear_debt',
                type: 'clear_debt',
                role: 'primary',
                label: '优先清掉本周欠卷',
                summaryLine: debtPack.summaryLine,
                detailLine: debtPack.detailLine || '',
                hintLine: debtPack.guideLine,
                statusLine: debtPack.progressText || debtPack.statusLine,
                anchorSection: debtPack.recommendedAnchorSection || 'sanctum',
                priority: 1
            }
            : {
                id: settlement?.outcomeId === 'positive_sheet' ? 'rank_expand' : 'rank_verify',
                type: settlement?.outcomeId === 'positive_sheet' ? 'rank_expand' : 'rank_verify',
                role: 'primary',
                label: settlement?.outcomeId === 'positive_sheet' ? '扩大本周定榜样本' : '把当前险卷送去高压验证',
                summaryLine: needEndless
                    ? '先补 1 轮无尽轮回，把当前主轴送进更高压环境继续验算。'
                    : (needPvp
                        ? '再补 1-2 场天道榜账本，确认这条路线不是只在章节里成立。'
                        : '无尽与天道榜都已留痕，可继续冲更高分或反例样本。'),
                hintLine: needEndless
                    ? `${safeSignals.endlessSeason?.name || '无尽轮回'} 当前仍缺 1 轮跨模证明。`
                    : (needPvp
                        ? `${safeSignals.pvpSeasonName || '天道榜'} 还缺 ${Math.max(0, 2 - pvpMatches)} 场账本。`
                        : '当前正卷已经具备定榜基础，可继续扩样本或冲更高压证明。'),
                statusLine: `无尽 ${endlessClears}/1 · 天道榜 ${Math.min(pvpMatches, 2)}/2`,
                anchorSection: needEndless ? 'endless' : 'pvp',
                priority: 1
            };
        const verificationOrders = [
            explicitPrimaryOrder || fallbackPrimaryOrder,
            explicitSideOrder || challengeSideVerificationOrder || crossModeFollowupOrder
        ].map((entry, index) => this.normalizeSeasonBoardVerificationOrder({
            ...entry,
            role: entry?.role || (index === 0 ? 'primary' : 'side')
        }, index)).filter(Boolean);

        return {
            settlement,
            debtPack,
            verificationOrders
        };
    }

    getSeasonBoardLaneRewardDefinition(laneId = '') {
        const normalizedLaneId = String(laneId || '').trim();
        const catalog = {
            training: {
                laneId: 'training',
                rewardKey: 'season_lane_reward:training:v1',
                label: '训练线结题赏',
                summaryLine: '主练样本与谱系锚点已经成线，兑现一份观星推演资源。',
                gains: { insight: 1, karma: 0, ringExp: 8, gold: 0 }
            },
            expedition: {
                laneId: 'expedition',
                rewardKey: 'season_lane_reward:expedition:v1',
                label: '远征线结题赏',
                summaryLine: '章节答卷与洞府承诺已经闭环，返还一份压卷推进资源。',
                gains: { insight: 0, karma: 1, ringExp: 8, gold: 0 }
            },
            verification: {
                laneId: 'verification',
                rewardKey: 'season_lane_reward:verification:v1',
                label: '验算线结题赏',
                summaryLine: '无尽轮回与天道榜留下外场证明，兑现一份验算定榜资源。',
                gains: { insight: 1, karma: 1, ringExp: 0, gold: 0 }
            }
        };
        return catalog[normalizedLaneId] || null;
    }

    formatSeasonBoardLaneRewardGainLine(gains = {}) {
        const insight = Math.max(0, Math.floor(Number(gains.insight ?? gains.heavenlyInsight) || 0));
        const karma = Math.max(0, Math.floor(Number(gains.karma) || 0));
        const ringExp = Math.max(0, Math.floor(Number(gains.ringExp) || 0));
        const gold = Math.max(0, Math.floor(Number(gains.gold) || 0));
        return [
            insight > 0 ? `天机 +${insight}` : '',
            karma > 0 ? `业果 +${karma}` : '',
            ringExp > 0 ? `命环经验 +${ringExp}` : '',
            gold > 0 ? `灵石 +${gold}` : ''
        ].filter(Boolean).join('，') || '赛季留痕 +1';
    }

    getSeasonBoardLaneRewardClaim(weekTag = '', laneId = '') {
        const normalizedWeekTag = String(weekTag || '').trim();
        const normalizedLaneId = String(laneId || '').trim();
        if (!normalizedWeekTag || !normalizedLaneId) return null;
        const state = typeof this.game.normalizeSeasonVerificationState === 'function'
            ? this.game.normalizeSeasonVerificationState(this.game.seasonVerificationState)
            : (this.game.seasonVerificationState || {});
        return state?.claimedLaneRewards?.[normalizedWeekTag]?.[normalizedLaneId] || null;
    }

    buildSeasonBoardLaneRewards(lanes = [], context = {}) {
        const weekTag = String(context.weekTag || '').trim().slice(0, 24);
        const weekLabel = String(context.weekLabel || '').trim().slice(0, 32);
        const phaseId = String(context.phaseId || '').trim().slice(0, 32);
        const phaseLabel = String(context.phaseLabel || '').trim().slice(0, 24);
        return (Array.isArray(lanes) ? lanes : [])
            .map((lane) => {
                if (!lane || typeof lane !== 'object') return null;
                const laneId = String(lane.id || '').trim();
                const definition = this.getSeasonBoardLaneRewardDefinition(laneId);
                if (!definition) return null;
                const laneLabel = String(lane.label || definition.label || laneId).trim() || definition.label;
                const totalCount = Math.max(0, Math.floor(Number(lane.totalCount) || 0));
                const completedCount = Math.max(0, Math.floor(Number(lane.completedCount) || 0));
                const completed = totalCount > 0 && completedCount >= totalCount;
                const claim = weekTag ? this.getSeasonBoardLaneRewardClaim(weekTag, laneId) : null;
                const claimed = !!claim;
                const gains = {
                    insight: Math.max(0, Math.floor(Number(definition.gains?.insight) || 0)),
                    karma: Math.max(0, Math.floor(Number(definition.gains?.karma) || 0)),
                    ringExp: Math.max(0, Math.floor(Number(definition.gains?.ringExp) || 0)),
                    gold: Math.max(0, Math.floor(Number(definition.gains?.gold) || 0))
                };
                const rewardLine = this.formatSeasonBoardLaneRewardGainLine(gains);
                const status = claimed ? 'claimed' : (completed ? 'claimable' : 'locked');
                const statusLabel = claimed ? '已领取' : (completed ? '可领取' : '未结题');
                return {
                    id: `season_lane_reward_${weekTag || 'current'}_${laneId}`,
                    weekTag,
                    weekLabel,
                    laneId,
                    laneLabel,
                    laneIcon: String(lane.icon || '').trim(),
                    rewardKey: definition.rewardKey,
                    label: definition.label,
                    summaryLine: definition.summaryLine,
                    detailLine: completed
                        ? `${laneLabel}已达成 ${completedCount}/${Math.max(1, totalCount)}，本周可结算一次。`
                        : `${laneLabel}还差 ${Math.max(0, totalCount - completedCount)} 格结题。`,
                    status,
                    statusLabel,
                    ready: completed,
                    claimable: completed && !claimed,
                    claimed,
                    claimedAt: Math.max(0, Math.floor(Number(claim?.claimedAt) || 0)),
                    rewardLine,
                    gains,
                    buttonLabel: claimed ? '已领取' : (completed ? '领取结题赏' : '未结题'),
                    phaseId,
                    phaseLabel,
                    progressText: `${Math.min(completedCount, Math.max(totalCount, completedCount))}/${Math.max(1, totalCount)}`
                };
            })
            .filter(Boolean);
    }

    buildSeasonBoardFrontier(lanes = [], context = {}) {
        const safeLanes = (Array.isArray(lanes) ? lanes : [])
            .filter((lane) => lane && typeof lane === 'object')
            .slice(0, 3);
        const laneById = new Map(safeLanes.map((lane) => [String(lane.id || '').trim(), lane]));
        const catalog = {
            training: {
                label: '观星采样战线',
                shortLabel: '采样战线',
                icon: '🔭',
                anchorSection: 'chapters'
            },
            expedition: {
                label: '界域推进战线',
                shortLabel: '推进战线',
                icon: '🧭',
                anchorSection: 'slates'
            },
            verification: {
                label: '会审定榜战线',
                shortLabel: '定榜战线',
                icon: '🏁',
                anchorSection: 'sanctum'
            }
        };
        const pressureMeta = (score = 0) => {
            const normalized = Math.max(0, Math.min(3, Math.floor(Number(score) || 0)));
            if (normalized >= 3) return { statusId: 'high_pressure', statusLabel: '高压', pressureLabel: '高压' };
            if (normalized >= 2) return { statusId: 'pressure', statusLabel: '承压', pressureLabel: '承压' };
            if (normalized >= 1) return { statusId: 'pending', statusLabel: '待补样', pressureLabel: '待补样' };
            return { statusId: 'stable', statusLabel: '稳态', pressureLabel: '稳态' };
        };
        const phaseId = String(context.phaseId || '').trim().slice(0, 32) || 'sampling';
        const phaseLabel = String(context.phaseLabel || '').trim().slice(0, 24) || '采样期';
        const weekTag = String(context.weekTag || '').trim().slice(0, 24);
        const debtPack = context.debtPack && typeof context.debtPack === 'object' ? context.debtPack : null;
        const verificationOrders = Array.isArray(context.verificationOrders)
            ? context.verificationOrders.filter((entry) => entry && typeof entry === 'object')
            : [];
        const nextTask = context.nextTask && typeof context.nextTask === 'object' ? context.nextTask : null;
        const debtStatus = String(debtPack?.status || '').trim();
        const hasOpenDebt = !!(debtPack && ['open', 'deferred'].includes(debtStatus));
        const hasDebtVerification = verificationOrders.some((order) => String(order?.type || '').trim() === 'clear_debt');
        const phaseDefaultLaneId = phaseId === 'ranking'
            ? 'verification'
            : (phaseId === 'lockline' ? 'expedition' : 'training');
        const primaryFrontId = hasOpenDebt || hasDebtVerification
            ? 'verification'
            : (nextTask?.laneId && laneById.has(nextTask.laneId)
                ? nextTask.laneId
                : phaseDefaultLaneId);
        const primaryLane = laneById.get(primaryFrontId) || laneById.get(phaseDefaultLaneId) || safeLanes[0] || null;
        if (!primaryLane) return null;
        const primaryCatalog = catalog[primaryFrontId] || catalog.training;
        const firstOpenTaskForLane = (lane = null) => {
            if (!lane || !Array.isArray(lane.tasks)) return null;
            return lane.tasks.find((task) => task && !task.completed)
                || lane.tasks.find((task) => task && typeof task === 'object')
                || null;
        };
        const actionTask = nextTask?.laneId === primaryFrontId
            ? nextTask
            : firstOpenTaskForLane(primaryLane);
        const actionMeta = typeof this.game.getSeasonVerificationActionMeta === 'function'
            ? this.game.getSeasonVerificationActionMeta(
                actionTask?.actionValue || actionTask?.anchorSection || primaryCatalog.anchorSection || 'sanctum',
                { fallbackSection: 'sanctum' }
            )
            : {
                actionType: 'collection',
                actionValue: actionTask?.anchorSection || primaryCatalog.anchorSection || 'sanctum',
                ctaLabel: '前往推进'
            };
        const laneComplete = primaryLane.totalCount > 0 && primaryLane.completedCount >= primaryLane.totalCount;
        const pressureScore = hasOpenDebt
            ? 3
            : (nextTask?.laneId === primaryFrontId
                ? 2
                : (laneComplete ? 0 : (phaseId === 'ranking' && primaryFrontId === 'verification' ? 2 : 1)));
        const primaryPressure = pressureMeta(pressureScore);
        const buildItem = (laneId, index) => {
            const lane = laneById.get(laneId);
            const meta = catalog[laneId] || {
                label: String(lane?.label || laneId || `战线 ${index + 1}`).trim(),
                shortLabel: String(lane?.label || laneId || `战线 ${index + 1}`).trim(),
                icon: String(lane?.icon || '✦').trim() || '✦',
                anchorSection: 'sanctum'
            };
            if (!lane) return null;
            const completedCount = Math.max(0, Math.floor(Number(lane.completedCount) || 0));
            const totalCount = Math.max(0, Math.floor(Number(lane.totalCount) || 0));
            const progressText = totalCount > 0 ? `${Math.min(completedCount, totalCount)}/${totalCount}` : '待同步';
            const completed = totalCount > 0 && completedCount >= totalCount;
            const lanePressureScore = laneId === primaryFrontId
                ? pressureScore
                : (completed ? 0 : 1);
            const lanePressure = pressureMeta(lanePressureScore);
            const role = laneId === primaryFrontId ? 'primary' : (completed ? 'reserve' : 'support');
            const roleLabel = role === 'primary' ? '主战线' : (role === 'support' ? '副战线' : '待命');
            const itemTask = laneId === nextTask?.laneId ? nextTask : firstOpenTaskForLane(lane);
            const itemActionMeta = typeof this.game.getSeasonVerificationActionMeta === 'function'
                ? this.game.getSeasonVerificationActionMeta(
                    itemTask?.actionValue || itemTask?.anchorSection || meta.anchorSection || 'sanctum',
                    { fallbackSection: 'sanctum' }
                )
                : {
                    actionType: 'collection',
                    actionValue: itemTask?.anchorSection || meta.anchorSection || 'sanctum',
                    ctaLabel: '前往推进'
                };
            return {
                id: laneId,
                laneId,
                label: meta.label,
                shortLabel: meta.shortLabel,
                icon: String(lane.icon || meta.icon || '✦').trim().slice(0, 4) || meta.icon || '✦',
                role,
                roleLabel,
                statusId: lanePressure.statusId,
                statusLabel: lanePressure.statusLabel,
                pressureScore: lanePressureScore,
                pressureLabel: lanePressure.pressureLabel,
                progressText,
                completed,
                summaryLine: `${roleLabel} · ${progressText} · ${lanePressure.pressureLabel}`,
                detailLine: String(lane.summaryLine || itemTask?.hintLine || '').trim().slice(0, 220),
                anchorSection: String(itemTask?.anchorSection || meta.anchorSection || 'sanctum').trim().slice(0, 24),
                actionType: String(itemTask?.actionType || itemActionMeta.actionType || '').trim().slice(0, 24)
                    || itemActionMeta.actionType
                    || 'collection',
                actionValue: String(itemTask?.actionValue || itemActionMeta.actionValue || '').trim().slice(0, 40)
                    || itemActionMeta.actionValue
                    || 'sanctum',
                ctaLabel: String(itemTask?.ctaLabel || itemActionMeta.ctaLabel || '前往推进').trim().slice(0, 24)
                    || '前往推进',
                actionTargetLabel: String(itemActionMeta.targetLabel || itemTask?.anchorSection || itemActionMeta.actionValue || '当前主线').trim().slice(0, 24)
                    || '当前主线',
                priority: laneId === primaryFrontId ? 1 : (role === 'support' ? 2 : 3)
            };
        };
        const items = ['training', 'expedition', 'verification']
            .map((laneId, index) => buildItem(laneId, index))
            .filter(Boolean)
            .sort((a, b) => a.priority - b.priority);
        const primaryItem = items.find((item) => item.id === primaryFrontId) || items[0] || null;
        const actionType = String(actionTask?.actionType || actionMeta.actionType || '').trim().slice(0, 24)
            || actionMeta.actionType
            || 'collection';
        const actionValue = String(actionTask?.actionValue || actionMeta.actionValue || '').trim().slice(0, 40)
            || actionMeta.actionValue
            || 'sanctum';
        const ctaLabel = String(actionTask?.ctaLabel || actionMeta.ctaLabel || '前往推进').trim().slice(0, 24)
            || '前往推进';
        const actionTargetLabel = String(actionMeta.targetLabel || actionTask?.anchorSection || actionValue || '当前主线').trim().slice(0, 24)
            || '当前主线';
        const source = hasOpenDebt
            ? 'debt_pack'
            : (String(nextTask?.source || '').trim() || (actionTask ? 'lane' : 'season_board'));
        const sourceId = hasOpenDebt
            ? String(debtPack?.id || '').trim().slice(0, 96)
            : String(nextTask?.sourceId || actionTask?.sourceId || actionTask?.id || '').trim().slice(0, 96);
        const guideSeed = hasOpenDebt
            ? (debtPack?.guideLine || debtPack?.summaryLine || '先把欠卷清回可验证状态。')
            : (actionTask?.hintLine || actionTask?.statusLine || primaryLane.summaryLine || '沿当前主战线补齐下一格。');
        const frontier = {
            available: true,
            id: `season_frontier_${weekTag || 'current'}_${primaryFrontId}`,
            statusId: primaryPressure.statusId,
            statusLabel: primaryPressure.statusLabel,
            pressureScore,
            pressureLabel: primaryPressure.pressureLabel,
            primaryFrontId,
            primaryFrontLabel: primaryCatalog.label,
            primaryFrontShortLabel: primaryCatalog.shortLabel,
            primaryLaneId: primaryFrontId,
            primaryAnchorSection: String(actionTask?.anchorSection || primaryCatalog.anchorSection || 'sanctum').trim().slice(0, 24),
            summaryLine: `诸界战线：主压在【${primaryCatalog.shortLabel}】，${phaseLabel} · ${primaryPressure.pressureLabel}。`,
            detailLine: String([
                primaryItem?.progressText ? `进度 ${primaryItem.progressText}` : '',
                hasOpenDebt ? (debtPack?.progressText || debtPack?.statusLine || '') : '',
                actionTask?.label || ''
            ].filter(Boolean).join(' · ')).trim().slice(0, 220),
            guideLine: `优先处理【${primaryCatalog.label}】：${String(guideSeed || '').trim()}`,
            actionLaneId: primaryFrontId,
            actionType,
            actionValue,
            ctaLabel,
            actionTargetLabel,
            actionLine: `主战线【${primaryCatalog.shortLabel}】 · 下一跳【${actionTargetLabel}】 · ${ctaLabel}`,
            source,
            sourceId,
            taskSource: String(nextTask?.taskSource || 'lane').trim().slice(0, 40) || 'lane',
            taskSourceId: String(nextTask?.taskSourceId || actionTask?.id || '').trim().slice(0, 96),
            taskId: String(nextTask?.id || actionTask?.id || '').trim().slice(0, 64),
            items
        };
        frontier.decree = this.buildSeasonBoardFrontierDecree(frontier, {
            ...context,
            phaseId,
            phaseLabel,
            weekTag
        });
        frontier.chronicle = this.buildSeasonBoardFrontierChronicle(frontier, {
            ...context,
            phaseId,
            phaseLabel,
            weekTag
        });
        frontier.council = this.buildSeasonBoardFrontierCouncil(frontier, {
            ...context,
            phaseId,
            phaseLabel,
            weekTag
        });
        frontier.resolution = this.buildSeasonBoardFrontierResolution(frontier, {
            ...context,
            phaseId,
            phaseLabel,
            weekTag
        });
        return frontier;
    }

    buildSeasonBoardFrontierDecree(frontier = null, context = {}) {
        const root = frontier && typeof frontier === 'object' ? frontier : null;
        if (!root) return null;
        const laneId = String(root.primaryFrontId || root.primaryLaneId || root.actionLaneId || '').trim().slice(0, 32);
        if (!laneId) return null;
        const laneLabel = String(root.primaryFrontShortLabel || root.primaryFrontLabel || '主战线').trim().slice(0, 24) || '主战线';
        const fullLaneLabel = String(root.primaryFrontLabel || root.primaryFrontShortLabel || laneLabel).trim().slice(0, 48) || laneLabel;
        const pressureScore = Math.max(0, Math.min(3, Math.floor(Number(root.pressureScore) || 0)));
        const statusId = String(root.statusId || '').trim().slice(0, 24)
            || (pressureScore >= 3 ? 'high_pressure' : (pressureScore >= 2 ? 'pressure' : (pressureScore >= 1 ? 'pending' : 'stable')));
        const statusLabel = String(root.statusLabel || root.pressureLabel || '').trim().slice(0, 24)
            || (pressureScore >= 3 ? '高压' : (pressureScore >= 2 ? '承压' : (pressureScore >= 1 ? '待补样' : '稳态')));
        const tone = pressureScore >= 3 ? 'urgent' : (pressureScore >= 2 ? 'focused' : (pressureScore >= 1 ? 'watch' : 'steady'));
        const toneLabel = tone === 'urgent' ? '急令' : (tone === 'focused' ? '专注' : (tone === 'watch' ? '观察' : '稳令'));
        const weekTag = String(context.weekTag || root.weekTag || '').trim().slice(0, 24);
        const phaseId = String(context.phaseId || root.phaseId || '').trim().slice(0, 32) || 'sampling';
        const phaseLabel = String(context.phaseLabel || root.phaseLabel || '').trim().slice(0, 24) || '采样期';
        const actionTargetLabel = String(root.actionTargetLabel || root.primaryAnchorSection || '当前主线').trim().slice(0, 24) || '当前主线';
        const laneCopy = {
            training: {
                title: '本周法旨：先定采样战线',
                constraintLine: '约束：先补一份可复盘样本，再展开第二条战线。',
                successLine: '完成口径：采样战线至少补 1 格，并回到季盘验算。',
                riskLine: '若跳过采样，本周后续推荐会继续缺少训练证据。'
            },
            expedition: {
                title: '本周法旨：先定推进战线',
                constraintLine: '约束：先推进当前章节答卷，不额外开启第二战线。',
                successLine: '完成口径：推进战线至少补 1 格，并保留章节归卷证据。',
                riskLine: '若跳过推进，锁线承诺会继续压住本周排班。'
            },
            verification: {
                title: '本周法旨：先定验算战线',
                constraintLine: '约束：先完成主验证或清债口径，再补旁证。',
                successLine: '完成口径：验算战线至少补 1 格，并让押卷/欠卷重新归档。',
                riskLine: '若跳过验算，欠卷或险卷会继续占住强目标位。'
            }
        };
        const copy = laneCopy[laneId] || {
            title: '本周法旨：先定主战线',
            constraintLine: '约束：先完成当前主战线的一格，再拆分到副线。',
            successLine: '完成口径：主战线至少补 1 格，并回到季盘复核。',
            riskLine: '若跳过主战线，本周排班会继续维持承压。'
        };
        return {
            available: true,
            id: `season_frontier_decree_${weekTag || 'current'}_${laneId}`,
            weekTag,
            phaseId,
            phaseLabel,
            laneId,
            laneLabel,
            fullLaneLabel,
            statusId,
            statusLabel,
            pressureScore,
            tone,
            toneLabel,
            title: copy.title,
            summaryLine: `本周法旨：优先完成【${laneLabel}】的下一格。`,
            constraintLine: copy.constraintLine,
            successLine: copy.successLine,
            riskLine: copy.riskLine,
            focusLine: `法旨焦点：${phaseLabel} · ${statusLabel} · 下一跳【${actionTargetLabel}】`,
            actionLaneId: String(root.actionLaneId || laneId).trim().slice(0, 32) || laneId,
            actionType: String(root.actionType || '').trim().slice(0, 24),
            actionValue: String(root.actionValue || '').trim().slice(0, 40),
            actionTargetLabel,
            taskId: String(root.taskId || '').trim().slice(0, 64),
            source: String(root.source || '').trim().slice(0, 40),
            sourceId: String(root.sourceId || '').trim().slice(0, 96)
        };
    }

    buildSeasonBoardFrontierChronicle(frontier = null, context = {}) {
        const root = frontier && typeof frontier === 'object' ? frontier : null;
        if (!root) return null;
        const laneId = String(root.primaryFrontId || root.primaryLaneId || root.actionLaneId || '').trim().slice(0, 32);
        if (!laneId) return null;
        const laneLabel = String(root.primaryFrontShortLabel || root.primaryFrontLabel || '主战线').trim().slice(0, 24) || '主战线';
        const fullLaneLabel = String(root.primaryFrontLabel || root.primaryFrontShortLabel || laneLabel).trim().slice(0, 48) || laneLabel;
        const pressureScore = Math.max(0, Math.min(3, Math.floor(Number(root.pressureScore) || 0)));
        const statusId = String(root.statusId || '').trim().slice(0, 24)
            || (pressureScore >= 3 ? 'high_pressure' : (pressureScore >= 2 ? 'pressure' : (pressureScore >= 1 ? 'pending' : 'stable')));
        const statusLabel = String(root.statusLabel || root.pressureLabel || '').trim().slice(0, 24)
            || (pressureScore >= 3 ? '高压' : (pressureScore >= 2 ? '承压' : (pressureScore >= 1 ? '待补样' : '稳态')));
        const weekTag = String(context.weekTag || root.weekTag || '').trim().slice(0, 24);
        const phaseId = String(context.phaseId || root.phaseId || '').trim().slice(0, 32) || 'sampling';
        const phaseLabel = String(context.phaseLabel || root.phaseLabel || '').trim().slice(0, 24) || '采样期';
        const actionTargetLabel = String(root.actionTargetLabel || root.primaryAnchorSection || '当前主线').trim().slice(0, 24) || '当前主线';
        const decree = root.decree && typeof root.decree === 'object' ? root.decree : null;
        const items = Array.isArray(root.items)
            ? root.items.filter((entry) => entry && typeof entry === 'object').slice(0, 3)
            : [];
        const laneOrder = ['training', 'expedition', 'verification'];
        const laneNameMap = {
            training: '采样',
            expedition: '推进',
            verification: '定榜'
        };
        const itemByLane = new Map(items.map((item) => [String(item.laneId || item.id || '').trim(), item]));
        const progressParts = laneOrder
            .map((entryLaneId) => {
                const item = itemByLane.get(entryLaneId);
                if (!item) return '';
                return `${laneNameMap[entryLaneId] || item.shortLabel || item.label || '战线'} ${item.progressText || '待同步'}`;
            })
            .filter(Boolean);
        const fallbackProgress = items
            .map((item) => `${item.shortLabel || item.label || '战线'} ${item.progressText || '待同步'}`)
            .filter(Boolean);
        const progressLine = `三线记录：${(progressParts.length > 0 ? progressParts : fallbackProgress).join(' · ') || '待同步'}。`;
        const lessonSeed = String(
            decree?.successLine
            || decree?.focusLine
            || root.guideLine
            || '先完成主战线一格，再回季盘复核副线。'
        ).trim();
        return {
            available: true,
            id: `season_frontier_chronicle_${weekTag || 'current'}_${laneId}`,
            weekTag,
            phaseId,
            phaseLabel,
            laneId,
            laneLabel,
            fullLaneLabel,
            statusId,
            statusLabel,
            pressureScore,
            title: `战役史卷：${laneLabel}${statusLabel ? ` · ${statusLabel}` : ''}`,
            summaryLine: `本周战役史卷：${laneLabel}${statusLabel ? statusLabel : '推进中'}，记录法旨与三线进度。`,
            currentEntryLine: `当前条目：${phaseLabel} · ${laneLabel} · 下一跳【${actionTargetLabel}】。`,
            progressLine,
            lessonLine: `战术记载：${lessonSeed}`,
            nextRecordLine: `下一笔记录：完成【${laneLabel}】一格后回季盘写入本周史卷。`,
            actionLaneId: String(root.actionLaneId || laneId).trim().slice(0, 32) || laneId,
            actionTargetLabel,
            taskId: String(root.taskId || '').trim().slice(0, 64),
            source: String(root.source || '').trim().slice(0, 40),
            sourceId: String(root.sourceId || '').trim().slice(0, 96)
        };
    }

    buildSeasonBoardFrontierCouncil(frontier = null, context = {}) {
        const root = frontier && typeof frontier === 'object' ? frontier : null;
        if (!root) return null;
        const laneId = String(root.primaryFrontId || root.primaryLaneId || root.actionLaneId || '').trim().slice(0, 32);
        if (!laneId) return null;
        const laneLabel = String(root.primaryFrontShortLabel || root.primaryFrontLabel || '主战线').trim().slice(0, 24) || '主战线';
        const fullLaneLabel = String(root.primaryFrontLabel || root.primaryFrontShortLabel || laneLabel).trim().slice(0, 48) || laneLabel;
        const pressureScore = Math.max(0, Math.min(3, Math.floor(Number(root.pressureScore) || 0)));
        const statusId = String(root.statusId || '').trim().slice(0, 24)
            || (pressureScore >= 3 ? 'high_pressure' : (pressureScore >= 2 ? 'pressure' : (pressureScore >= 1 ? 'pending' : 'stable')));
        const statusLabel = String(root.statusLabel || root.pressureLabel || '').trim().slice(0, 24)
            || (pressureScore >= 3 ? '高压' : (pressureScore >= 2 ? '承压' : (pressureScore >= 1 ? '待补样' : '稳态')));
        const weekTag = String(context.weekTag || root.weekTag || '').trim().slice(0, 24);
        const phaseId = String(context.phaseId || root.phaseId || '').trim().slice(0, 32) || 'sampling';
        const phaseLabel = String(context.phaseLabel || root.phaseLabel || '').trim().slice(0, 24) || '采样期';
        const decree = root.decree && typeof root.decree === 'object' ? root.decree : null;
        const chronicle = root.chronicle && typeof root.chronicle === 'object' ? root.chronicle : null;
        const items = Array.isArray(root.items)
            ? root.items.filter((entry) => entry && typeof entry === 'object').slice(0, 3)
            : [];
        const laneOpinions = items.map((item, index) => {
            const opinionLaneId = String(item.laneId || item.id || `frontier_${index + 1}`).trim().slice(0, 32);
            const isPrimary = opinionLaneId === laneId || String(item.id || '').trim() === laneId;
            const completed = !!item.completed;
            const role = String(item.role || (isPrimary ? 'primary' : (completed ? 'reserve' : 'support'))).trim().slice(0, 24)
                || (isPrimary ? 'primary' : (completed ? 'reserve' : 'support'));
            const stance = isPrimary
                ? (pressureScore >= 2 ? 'press' : 'lead')
                : (completed ? 'reserve' : 'defer');
            const stanceLabel = stance === 'press'
                ? '优先守线'
                : (stance === 'lead' ? '先行复核' : (stance === 'reserve' ? '证据待命' : '暂缓抢线'));
            const opinionLaneLabel = String(item.shortLabel || item.label || (isPrimary ? laneLabel : '副战线')).trim().slice(0, 24)
                || (isPrimary ? laneLabel : '副战线');
            const progressText = String(item.progressText || '').trim().slice(0, 24);
            return {
                laneId: opinionLaneId,
                laneLabel: opinionLaneLabel,
                role,
                stance,
                stanceLabel,
                noteLine: isPrimary
                    ? `主线意见：先完成【${opinionLaneLabel}】一格，再回季盘复核。`
                    : (completed
                        ? `副线意见：【${opinionLaneLabel}】已留证，暂不抢主行动。`
                        : `副线意见：【${opinionLaneLabel}】保持待补${progressText ? ` ${progressText}` : ''}，不新增第二行动。`)
            };
        }).filter((opinion) => opinion.laneId);
        const supportNames = laneOpinions
            .filter((opinion) => opinion.laneId !== laneId)
            .map((opinion) => opinion.laneLabel)
            .filter(Boolean);
        const verdictSeed = String(decree?.successLine || chronicle?.nextRecordLine || root.guideLine || '').trim();
        return {
            available: true,
            id: `season_frontier_council_${weekTag || 'current'}_${laneId}`,
            weekTag,
            phaseId,
            phaseLabel,
            laneId,
            laneLabel,
            fullLaneLabel,
            statusId,
            statusLabel,
            pressureScore,
            title: `诸界会审：${laneLabel}优先`,
            summaryLine: `诸界会审：本周先守【${laneLabel}】，副线只保留证据，不抢主行动。`,
            verdictLine: verdictSeed || `会审裁语：先完成【${laneLabel}】一格，再回季盘复核三线。`,
            focusLine: `主线意见：${phaseLabel} · ${statusLabel} · 【${laneLabel}】优先。`,
            supportLine: supportNames.length > 0
                ? `副线意见：${supportNames.join(' / ')}只保留证据，不切走主行动。`
                : '副线意见：暂无可拆分副线，保持当前主线推进。',
            auditLine: `会审口径：法旨、史卷与三线进度已对齐。`,
            riskLine: `分歧风险：若跳过【${laneLabel}】，本周会继续承压。`,
            source: 'frontier',
            sourceId: String(root.id || decree?.id || chronicle?.id || '').trim().slice(0, 96),
            laneOpinions
        };
    }

    buildSeasonBoardFrontierResolution(frontier = null, context = {}) {
        const root = frontier && typeof frontier === 'object' ? frontier : null;
        if (!root) return null;
        const sanitize = (value = '', limit = 120) => String(value || '').trim().slice(0, limit);
        const laneId = sanitize(root.primaryFrontId || root.primaryLaneId || root.actionLaneId || '', 32);
        if (!laneId) return null;
        const laneLabel = sanitize(root.primaryFrontShortLabel || root.primaryFrontLabel || '主战线', 24) || '主战线';
        const fullLaneLabel = sanitize(root.primaryFrontLabel || root.primaryFrontShortLabel || laneLabel, 48) || laneLabel;
        const pressureScore = Math.max(0, Math.min(3, Math.floor(Number(root.pressureScore) || 0)));
        const statusId = sanitize(root.statusId || (pressureScore >= 3 ? 'high_pressure' : (pressureScore >= 2 ? 'pressure' : (pressureScore >= 1 ? 'pending' : 'stable'))), 24);
        const statusLabel = sanitize(root.statusLabel || root.pressureLabel || (pressureScore >= 3 ? '高压' : (pressureScore >= 2 ? '承压' : (pressureScore >= 1 ? '待补样' : '稳态'))), 24);
        const weekTag = sanitize(context.weekTag || root.weekTag || '', 24);
        const phaseId = sanitize(context.phaseId || root.phaseId || '', 32) || 'sampling';
        const phaseLabel = sanitize(context.phaseLabel || root.phaseLabel || '', 24) || '采样期';
        const settlement = context.settlement && typeof context.settlement === 'object' ? context.settlement : null;
        const debtPack = context.debtPack && typeof context.debtPack === 'object' ? context.debtPack : null;
        const weekVerdictCurrent = context.weekVerdictLedger?.current && typeof context.weekVerdictLedger.current === 'object'
            ? context.weekVerdictLedger.current
            : null;
        const council = root.council && typeof root.council === 'object' ? root.council : null;
        const chronicle = root.chronicle && typeof root.chronicle === 'object' ? root.chronicle : null;
        const supportOpinion = Array.isArray(council?.laneOpinions)
            ? council.laneOpinions.find((opinion) => opinion && opinion.laneId && opinion.laneId !== laneId && opinion.role !== 'reserve')
                || council.laneOpinions.find((opinion) => opinion && opinion.laneId && opinion.laneId !== laneId)
                || null
            : null;
        const supportLaneId = sanitize(
            weekVerdictCurrent?.frontierResolutionSupportLaneId
            || weekVerdictCurrent?.supportLaneId
            || supportOpinion?.laneId
            || '',
            32
        );
        const supportLaneLabel = sanitize(
            weekVerdictCurrent?.frontierResolutionSupportLaneLabel
            || weekVerdictCurrent?.supportLaneLabel
            || supportOpinion?.laneLabel
            || '',
            24
        );
        const settlementOutcomeId = sanitize(
            settlement?.outcomeId
            || weekVerdictCurrent?.settlementOutcomeId
            || '',
            32
        );
        const settlementOutcomeLabel = sanitize(
            settlement?.outcomeLabel
            || weekVerdictCurrent?.settlementOutcomeLabel
            || '',
            24
        );
        const debtStatus = sanitize(debtPack?.status || weekVerdictCurrent?.debtStatus || '', 24);
        const hardDebtActive = ['open', 'deferred'].includes(debtStatus) || settlementOutcomeId === 'debt_sheet';
        const primaryComplete = Array.isArray(root.items)
            ? !!root.items.find((item) => (item?.laneId === laneId || item?.id === laneId) && item.completed)
            : false;
        const suggestedChoiceId = hardDebtActive
            ? 'hold_primary'
            : (supportLaneId && primaryComplete ? 'rebalance_support' : 'hold_primary');
        const choiceCatalog = {
            hold_primary: {
                label: '守主战线',
                stanceId: 'frontier_loyalist',
                summary: `会审裁记待封：建议继续守住【${laneLabel}】，先完成主战线一格。`
            },
            rebalance_support: {
                label: '副线补证',
                stanceId: 'support_balancer',
                summary: `会审裁记待封：建议在不抢强目标的前提下，给【${supportLaneLabel || '副战线'}】补一份证据。`
            },
            seal_dispute: {
                label: '封存争议',
                stanceId: 'dispute_archivist',
                summary: '会审裁记待封：建议本周只封存争议，不改写下周普通排班。'
            }
        };
        const rawChoiceId = sanitize(
            weekVerdictCurrent?.frontierResolutionChoiceId
            || weekVerdictCurrent?.resolutionChoiceId
            || weekVerdictCurrent?.choiceId
            || '',
            32
        );
        const submittedChoiceId = Object.prototype.hasOwnProperty.call(choiceCatalog, rawChoiceId) ? rawChoiceId : '';
        const submitted = !!(
            weekVerdictCurrent?.frontierResolutionId
            || weekVerdictCurrent?.frontierResolutionSubmittedAt
            || weekVerdictCurrent?.chronicleSealStatus === 'sealed'
            || submittedChoiceId
        );
        const effectiveChoiceId = submitted ? (submittedChoiceId || suggestedChoiceId) : suggestedChoiceId;
        const choiceMeta = choiceCatalog[effectiveChoiceId] || choiceCatalog.hold_primary;
        const source = weekVerdictCurrent
            ? 'week_verdict_ledger'
            : (settlement ? 'settlement' : 'frontier');
        const sourceId = sanitize(
            weekVerdictCurrent?.ledgerId
            || settlement?.id
            || root.id
            || '',
            96
        );
        const choiceLabel = submitted
            ? sanitize(weekVerdictCurrent?.frontierResolutionLabel || weekVerdictCurrent?.choiceLabel || choiceMeta.label, 32)
            : '';
        const summaryLine = sanitize(
            weekVerdictCurrent?.frontierResolutionSummaryLine
            || weekVerdictCurrent?.councilResolutionLine
            || (
                submitted
                    ? `本周会审裁记：采用【${choiceLabel || choiceMeta.label}】，${effectiveChoiceId === 'rebalance_support' ? `副线【${supportLaneLabel || '副战线'}】获得补证优先。` : (effectiveChoiceId === 'seal_dispute' ? '争议先封入史卷，不改写排班。' : `主战线【${laneLabel}】继续优先。`)}`
                    : choiceMeta.summary
            ),
            220
        );
        const chronicleSealLine = sanitize(
            weekVerdictCurrent?.chronicleSealLine
            || (
                submitted
                    ? `战役史卷已封记：${choiceLabel || choiceMeta.label} · ${laneLabel}${supportLaneLabel ? ` / ${supportLaneLabel}` : ''}。`
                    : `战役史卷待封记：${chronicle?.nextRecordLine || `完成【${laneLabel}】一格后回季盘封记。`}`
            ),
            220
        );
        const councilResolutionLine = sanitize(
            weekVerdictCurrent?.councilResolutionLine
            || (
                submitted
                    ? `诸界会审裁定：${summaryLine}`
                    : `诸界会审待裁记：${council?.verdictLine || `先守【${laneLabel}】，副线保留证据。`}`
            ),
            220
        );
        return {
            available: true,
            submitted,
            id: sanitize(
                weekVerdictCurrent?.frontierResolutionId
                || `season_frontier_resolution_${weekTag || 'current'}_${submitted ? effectiveChoiceId : 'pending'}_${laneId}`,
                96
            ),
            weekTag,
            phaseId,
            phaseLabel,
            laneId,
            laneLabel,
            fullLaneLabel,
            statusId,
            statusLabel,
            choiceId: submitted ? effectiveChoiceId : '',
            choiceLabel,
            suggestedChoiceId,
            suggestedChoiceLabel: choiceCatalog[suggestedChoiceId]?.label || choiceCatalog.hold_primary.label,
            stanceId: sanitize(weekVerdictCurrent?.frontierResolutionStance || choiceMeta.stanceId, 48),
            supportLaneId,
            supportLaneLabel,
            settlementOutcomeId,
            settlementOutcomeLabel,
            resolutionTier: sanitize(settlement?.resolutionTier || weekVerdictCurrent?.resolutionTier || '', 24),
            resolvedStatus: sanitize(settlement?.resolvedStatus || weekVerdictCurrent?.resolvedStatus || debtStatus || '', 24),
            proofQuality: sanitize(settlement?.proofQuality || weekVerdictCurrent?.proofQuality || '', 24),
            lineageStyle: sanitize(settlement?.lineageStyle || weekVerdictCurrent?.lineageStyle || '', 48),
            summaryLine,
            chronicleSealLine,
            councilResolutionLine,
            source,
            sourceId,
            submittedAt: Math.max(0, Math.floor(Number(weekVerdictCurrent?.frontierResolutionSubmittedAt || 0) || 0))
        };
    }

    normalizeSeasonBoardFrontierDecree(source = null, context = {}) {
        const frontier = context.frontier && typeof context.frontier === 'object' ? context.frontier : null;
        const derived = this.buildSeasonBoardFrontierDecree(frontier, context);
        const root = source && typeof source === 'object' ? source : derived;
        if (!root) return null;
        const canonical = derived && typeof derived === 'object' ? derived : root;
        const laneId = String(canonical.laneId || canonical.actionLaneId || root.laneId || frontier?.primaryFrontId || '').trim().slice(0, 32);
        if (!laneId) return null;
        const pressureScore = Math.max(0, Math.min(3, Math.floor(Number(canonical.pressureScore ?? root.pressureScore) || 0)));
        const statusId = String(canonical.statusId || root.statusId || frontier?.statusId || '').trim().slice(0, 24)
            || (pressureScore >= 3 ? 'high_pressure' : (pressureScore >= 2 ? 'pressure' : (pressureScore >= 1 ? 'pending' : 'stable')));
        const statusLabel = String(canonical.statusLabel || root.statusLabel || frontier?.statusLabel || frontier?.pressureLabel || '').trim().slice(0, 24)
            || (pressureScore >= 3 ? '高压' : (pressureScore >= 2 ? '承压' : (pressureScore >= 1 ? '待补样' : '稳态')));
        const tone = String(canonical.tone || root.tone || '').trim().slice(0, 24)
            || (pressureScore >= 3 ? 'urgent' : (pressureScore >= 2 ? 'focused' : (pressureScore >= 1 ? 'watch' : 'steady')));
        const toneLabel = String(canonical.toneLabel || root.toneLabel || '').trim().slice(0, 24)
            || (tone === 'urgent' ? '急令' : (tone === 'focused' ? '专注' : (tone === 'watch' ? '观察' : '稳令')));
        const actionTargetLabel = String(
            canonical.actionTargetLabel
            || root.actionTargetLabel
            || frontier?.actionTargetLabel
            || '当前主线'
        ).trim().slice(0, 24) || '当前主线';
        const normalized = {
            available: root.available !== false,
            id: String(canonical.id || root.id || `season_frontier_decree_${context.weekTag || 'current'}_${laneId}`).trim().slice(0, 96),
            weekTag: String(canonical.weekTag || root.weekTag || context.weekTag || '').trim().slice(0, 24),
            phaseId: String(canonical.phaseId || root.phaseId || context.phaseId || '').trim().slice(0, 32) || 'sampling',
            phaseLabel: String(canonical.phaseLabel || root.phaseLabel || context.phaseLabel || '').trim().slice(0, 24) || '采样期',
            laneId,
            laneLabel: String(canonical.laneLabel || root.laneLabel || frontier?.primaryFrontShortLabel || frontier?.primaryFrontLabel || '主战线').trim().slice(0, 24) || '主战线',
            fullLaneLabel: String(canonical.fullLaneLabel || root.fullLaneLabel || frontier?.primaryFrontLabel || frontier?.primaryFrontShortLabel || '主战线').trim().slice(0, 48) || '主战线',
            statusId,
            statusLabel,
            pressureScore,
            tone,
            toneLabel,
            title: String(canonical.title || root.title || '本周法旨：先定主战线').trim().slice(0, 48) || '本周法旨：先定主战线',
            summaryLine: String(canonical.summaryLine || root.summaryLine || '').trim().slice(0, 180),
            constraintLine: String(canonical.constraintLine || root.constraintLine || '').trim().slice(0, 180),
            successLine: String(canonical.successLine || root.successLine || '').trim().slice(0, 180),
            riskLine: String(canonical.riskLine || root.riskLine || '').trim().slice(0, 180),
            focusLine: String(canonical.focusLine || root.focusLine || '').trim().slice(0, 180),
            actionLaneId: String(canonical.actionLaneId || root.actionLaneId || laneId).trim().slice(0, 32) || laneId,
            actionType: String(canonical.actionType || root.actionType || frontier?.actionType || '').trim().slice(0, 24),
            actionValue: String(canonical.actionValue || root.actionValue || frontier?.actionValue || '').trim().slice(0, 40),
            actionTargetLabel,
            taskId: String(canonical.taskId || root.taskId || frontier?.taskId || '').trim().slice(0, 64),
            source: String(canonical.source || root.source || frontier?.source || '').trim().slice(0, 40),
            sourceId: String(canonical.sourceId || root.sourceId || frontier?.sourceId || '').trim().slice(0, 96)
        };
        if (!normalized.summaryLine) {
            normalized.summaryLine = `本周法旨：优先完成【${normalized.laneLabel || '主战线'}】的下一格。`;
        }
        if (!normalized.focusLine) {
            normalized.focusLine = `法旨焦点：${normalized.phaseLabel} · ${normalized.statusLabel} · 下一跳【${normalized.actionTargetLabel}】`;
        }
        return normalized.summaryLine || normalized.constraintLine || normalized.successLine
            ? normalized
            : null;
    }

    normalizeSeasonBoardFrontierChronicle(source = null, context = {}) {
        const frontier = context.frontier && typeof context.frontier === 'object' ? context.frontier : null;
        const derived = this.buildSeasonBoardFrontierChronicle(frontier, context);
        const root = source && typeof source === 'object' ? source : derived;
        if (!root) return null;
        const canonical = derived && typeof derived === 'object' ? derived : root;
        const laneId = String(canonical.laneId || canonical.actionLaneId || root.laneId || frontier?.primaryFrontId || '').trim().slice(0, 32);
        if (!laneId) return null;
        const pressureScore = Math.max(0, Math.min(3, Math.floor(Number(canonical.pressureScore ?? root.pressureScore) || 0)));
        const statusId = String(canonical.statusId || root.statusId || frontier?.statusId || '').trim().slice(0, 24)
            || (pressureScore >= 3 ? 'high_pressure' : (pressureScore >= 2 ? 'pressure' : (pressureScore >= 1 ? 'pending' : 'stable')));
        const statusLabel = String(canonical.statusLabel || root.statusLabel || frontier?.statusLabel || frontier?.pressureLabel || '').trim().slice(0, 24)
            || (pressureScore >= 3 ? '高压' : (pressureScore >= 2 ? '承压' : (pressureScore >= 1 ? '待补样' : '稳态')));
        const actionTargetLabel = String(
            canonical.actionTargetLabel
            || root.actionTargetLabel
            || frontier?.actionTargetLabel
            || '当前主线'
        ).trim().slice(0, 24) || '当前主线';
        const normalized = {
            available: root.available !== false,
            id: String(canonical.id || root.id || `season_frontier_chronicle_${context.weekTag || 'current'}_${laneId}`).trim().slice(0, 96),
            weekTag: String(canonical.weekTag || root.weekTag || context.weekTag || '').trim().slice(0, 24),
            phaseId: String(canonical.phaseId || root.phaseId || context.phaseId || '').trim().slice(0, 32) || 'sampling',
            phaseLabel: String(canonical.phaseLabel || root.phaseLabel || context.phaseLabel || '').trim().slice(0, 24) || '采样期',
            laneId,
            laneLabel: String(canonical.laneLabel || root.laneLabel || frontier?.primaryFrontShortLabel || frontier?.primaryFrontLabel || '主战线').trim().slice(0, 24) || '主战线',
            fullLaneLabel: String(canonical.fullLaneLabel || root.fullLaneLabel || frontier?.primaryFrontLabel || frontier?.primaryFrontShortLabel || '主战线').trim().slice(0, 48) || '主战线',
            statusId,
            statusLabel,
            pressureScore,
            title: String(canonical.title || root.title || '战役史卷').trim().slice(0, 64) || '战役史卷',
            summaryLine: String(canonical.summaryLine || root.summaryLine || '').trim().slice(0, 200),
            currentEntryLine: String(canonical.currentEntryLine || root.currentEntryLine || '').trim().slice(0, 200),
            progressLine: String(canonical.progressLine || root.progressLine || '').trim().slice(0, 220),
            lessonLine: String(canonical.lessonLine || root.lessonLine || '').trim().slice(0, 220),
            nextRecordLine: String(canonical.nextRecordLine || root.nextRecordLine || '').trim().slice(0, 220),
            actionLaneId: String(canonical.actionLaneId || root.actionLaneId || laneId).trim().slice(0, 32) || laneId,
            actionTargetLabel,
            taskId: String(canonical.taskId || root.taskId || frontier?.taskId || '').trim().slice(0, 64),
            source: String(canonical.source || root.source || frontier?.source || '').trim().slice(0, 40),
            sourceId: String(canonical.sourceId || root.sourceId || frontier?.sourceId || '').trim().slice(0, 96)
        };
        if (!normalized.summaryLine) {
            normalized.summaryLine = `本周战役史卷：${normalized.laneLabel}${normalized.statusLabel || '推进中'}，记录法旨与三线进度。`;
        }
        if (!normalized.currentEntryLine) {
            normalized.currentEntryLine = `当前条目：${normalized.phaseLabel} · ${normalized.laneLabel} · 下一跳【${normalized.actionTargetLabel}】。`;
        }
        if (!normalized.progressLine) {
            normalized.progressLine = '三线记录：待同步。';
        }
        if (!normalized.nextRecordLine) {
            normalized.nextRecordLine = `下一笔记录：完成【${normalized.laneLabel}】一格后回季盘写入本周史卷。`;
        }
        return normalized.summaryLine || normalized.currentEntryLine || normalized.progressLine
            ? normalized
            : null;
    }

    normalizeSeasonBoardFrontierCouncil(source = null, context = {}) {
        const frontier = context.frontier && typeof context.frontier === 'object' ? context.frontier : null;
        const derived = this.buildSeasonBoardFrontierCouncil(frontier, context);
        const root = source && typeof source === 'object' ? source : derived;
        if (!root) return null;
        const canonical = derived && typeof derived === 'object' ? derived : root;
        const laneId = String(canonical.laneId || root.laneId || frontier?.primaryFrontId || '').trim().slice(0, 32);
        if (!laneId) return null;
        const pressureScore = Math.max(0, Math.min(3, Math.floor(Number(canonical.pressureScore ?? root.pressureScore) || 0)));
        const statusId = String(canonical.statusId || root.statusId || frontier?.statusId || '').trim().slice(0, 24)
            || (pressureScore >= 3 ? 'high_pressure' : (pressureScore >= 2 ? 'pressure' : (pressureScore >= 1 ? 'pending' : 'stable')));
        const statusLabel = String(canonical.statusLabel || root.statusLabel || frontier?.statusLabel || frontier?.pressureLabel || '').trim().slice(0, 24)
            || (pressureScore >= 3 ? '高压' : (pressureScore >= 2 ? '承压' : (pressureScore >= 1 ? '待补样' : '稳态')));
        const rawOpinions = Array.isArray(canonical.laneOpinions) && canonical.laneOpinions.length > 0
            ? canonical.laneOpinions
            : (Array.isArray(root.laneOpinions) ? root.laneOpinions : []);
        const laneOpinions = rawOpinions
            .filter((entry) => entry && typeof entry === 'object')
            .slice(0, 3)
            .map((entry) => ({
                laneId: String(entry.laneId || '').trim().slice(0, 32),
                laneLabel: String(entry.laneLabel || '战线').trim().slice(0, 24) || '战线',
                role: String(entry.role || '').trim().slice(0, 24),
                stance: String(entry.stance || '').trim().slice(0, 24),
                stanceLabel: String(entry.stanceLabel || '').trim().slice(0, 24),
                noteLine: String(entry.noteLine || '').trim().slice(0, 200)
            }))
            .filter((entry) => entry.laneId);
        const normalized = {
            available: root.available !== false,
            id: String(canonical.id || root.id || `season_frontier_council_${context.weekTag || 'current'}_${laneId}`).trim().slice(0, 96),
            weekTag: String(canonical.weekTag || root.weekTag || context.weekTag || '').trim().slice(0, 24),
            phaseId: String(canonical.phaseId || root.phaseId || context.phaseId || '').trim().slice(0, 32) || 'sampling',
            phaseLabel: String(canonical.phaseLabel || root.phaseLabel || context.phaseLabel || '').trim().slice(0, 24) || '采样期',
            laneId,
            laneLabel: String(canonical.laneLabel || root.laneLabel || frontier?.primaryFrontShortLabel || frontier?.primaryFrontLabel || '主战线').trim().slice(0, 24) || '主战线',
            fullLaneLabel: String(canonical.fullLaneLabel || root.fullLaneLabel || frontier?.primaryFrontLabel || frontier?.primaryFrontShortLabel || '主战线').trim().slice(0, 48) || '主战线',
            statusId,
            statusLabel,
            pressureScore,
            title: String(canonical.title || root.title || '诸界会审').trim().slice(0, 64) || '诸界会审',
            summaryLine: String(canonical.summaryLine || root.summaryLine || '').trim().slice(0, 220),
            verdictLine: String(canonical.verdictLine || root.verdictLine || '').trim().slice(0, 220),
            focusLine: String(canonical.focusLine || root.focusLine || '').trim().slice(0, 200),
            supportLine: String(canonical.supportLine || root.supportLine || '').trim().slice(0, 220),
            auditLine: String(canonical.auditLine || root.auditLine || '').trim().slice(0, 200),
            riskLine: String(canonical.riskLine || root.riskLine || '').trim().slice(0, 200),
            source: String(canonical.source || root.source || 'frontier').trim().slice(0, 40) || 'frontier',
            sourceId: String(canonical.sourceId || root.sourceId || frontier?.id || '').trim().slice(0, 96),
            laneOpinions
        };
        if (!normalized.summaryLine) {
            normalized.summaryLine = `诸界会审：本周先守【${normalized.laneLabel}】，副线只保留证据，不抢主行动。`;
        }
        if (!normalized.verdictLine) {
            normalized.verdictLine = `会审裁语：先完成【${normalized.laneLabel}】一格，再回季盘复核三线。`;
        }
        if (!normalized.focusLine) {
            normalized.focusLine = `主线意见：${normalized.phaseLabel} · ${normalized.statusLabel} · 【${normalized.laneLabel}】优先。`;
        }
        return normalized.summaryLine || normalized.verdictLine || normalized.laneOpinions.length > 0
            ? normalized
            : null;
    }

    normalizeSeasonBoardFrontierResolution(source = null, context = {}) {
        const frontier = context.frontier && typeof context.frontier === 'object' ? context.frontier : null;
        const derived = this.buildSeasonBoardFrontierResolution(frontier, context);
        const root = source && typeof source === 'object' ? source : derived;
        if (!root) return null;
        const canonical = derived && typeof derived === 'object'
            ? {
                ...derived,
                ...(root.submitted ? root : {})
            }
            : root;
        const sanitize = (value = '', limit = 120) => String(value || '').trim().slice(0, limit);
        const laneId = sanitize(canonical.laneId || root.laneId || frontier?.primaryFrontId || '', 32);
        if (!laneId) return null;
        const suggestedChoiceId = ['hold_primary', 'rebalance_support', 'seal_dispute'].includes(String(canonical.suggestedChoiceId || '').trim())
            ? String(canonical.suggestedChoiceId || '').trim()
            : 'hold_primary';
        const choiceId = ['hold_primary', 'rebalance_support', 'seal_dispute'].includes(String(canonical.choiceId || '').trim())
            ? String(canonical.choiceId || '').trim()
            : '';
        const submitted = !!canonical.submitted && !!choiceId;
        const choiceLabelMap = {
            hold_primary: '守主战线',
            rebalance_support: '副线补证',
            seal_dispute: '封存争议'
        };
        const normalized = {
            available: root.available !== false,
            submitted,
            id: sanitize(canonical.id || root.id || `season_frontier_resolution_${context.weekTag || 'current'}_${submitted ? choiceId : 'pending'}_${laneId}`, 96),
            weekTag: sanitize(canonical.weekTag || root.weekTag || context.weekTag || '', 24),
            phaseId: sanitize(canonical.phaseId || root.phaseId || context.phaseId || '', 32) || 'sampling',
            phaseLabel: sanitize(canonical.phaseLabel || root.phaseLabel || context.phaseLabel || '', 24) || '采样期',
            laneId,
            laneLabel: sanitize(canonical.laneLabel || root.laneLabel || frontier?.primaryFrontShortLabel || frontier?.primaryFrontLabel || '主战线', 24) || '主战线',
            fullLaneLabel: sanitize(canonical.fullLaneLabel || root.fullLaneLabel || frontier?.primaryFrontLabel || frontier?.primaryFrontShortLabel || '主战线', 48) || '主战线',
            statusId: sanitize(canonical.statusId || root.statusId || frontier?.statusId || '', 24),
            statusLabel: sanitize(canonical.statusLabel || root.statusLabel || frontier?.statusLabel || frontier?.pressureLabel || '', 24),
            choiceId: submitted ? choiceId : '',
            choiceLabel: submitted ? (sanitize(canonical.choiceLabel || root.choiceLabel || choiceLabelMap[choiceId] || '', 32)) : '',
            suggestedChoiceId,
            suggestedChoiceLabel: sanitize(canonical.suggestedChoiceLabel || root.suggestedChoiceLabel || choiceLabelMap[suggestedChoiceId] || '', 32),
            stanceId: sanitize(canonical.stanceId || root.stanceId || '', 48),
            supportLaneId: sanitize(canonical.supportLaneId || root.supportLaneId || '', 32),
            supportLaneLabel: sanitize(canonical.supportLaneLabel || root.supportLaneLabel || '', 24),
            settlementOutcomeId: sanitize(canonical.settlementOutcomeId || root.settlementOutcomeId || context.settlement?.outcomeId || '', 32),
            settlementOutcomeLabel: sanitize(canonical.settlementOutcomeLabel || root.settlementOutcomeLabel || context.settlement?.outcomeLabel || '', 24),
            resolutionTier: sanitize(canonical.resolutionTier || root.resolutionTier || context.settlement?.resolutionTier || '', 24),
            resolvedStatus: sanitize(canonical.resolvedStatus || root.resolvedStatus || context.settlement?.resolvedStatus || '', 24),
            proofQuality: sanitize(canonical.proofQuality || root.proofQuality || context.settlement?.proofQuality || '', 24),
            lineageStyle: sanitize(canonical.lineageStyle || root.lineageStyle || context.settlement?.lineageStyle || '', 48),
            summaryLine: sanitize(canonical.summaryLine || root.summaryLine || '', 220),
            chronicleSealLine: sanitize(canonical.chronicleSealLine || root.chronicleSealLine || '', 220),
            councilResolutionLine: sanitize(canonical.councilResolutionLine || root.councilResolutionLine || '', 220),
            source: sanitize(canonical.source || root.source || 'frontier', 40) || 'frontier',
            sourceId: sanitize(canonical.sourceId || root.sourceId || frontier?.id || '', 96),
            submittedAt: Math.max(0, Math.floor(Number(canonical.submittedAt || root.submittedAt) || 0))
        };
        if (!normalized.summaryLine) {
            normalized.summaryLine = normalized.submitted
                ? `本周会审裁记：采用【${normalized.choiceLabel || '裁记'}】，写入战役史卷。`
                : `会审裁记待封：建议【${normalized.suggestedChoiceLabel || '守主战线'}】。`;
        }
        if (!normalized.chronicleSealLine) {
            normalized.chronicleSealLine = normalized.submitted
                ? `战役史卷已封记：${normalized.choiceLabel || normalized.laneLabel}。`
                : `战役史卷待封记：完成【${normalized.laneLabel}】一格后回季盘封记。`;
        }
        if (!normalized.councilResolutionLine) {
            normalized.councilResolutionLine = normalized.submitted
                ? `诸界会审裁定：${normalized.summaryLine}`
                : `诸界会审待裁记：先守【${normalized.laneLabel}】，副线保留证据。`;
        }
        return normalized.summaryLine || normalized.chronicleSealLine || normalized.councilResolutionLine
            ? normalized
            : null;
    }

    normalizeSeasonBoardFrontier(source = null, context = {}) {
        const derived = this.buildSeasonBoardFrontier(context.lanes, context);
        const root = source && typeof source === 'object' ? source : derived;
        if (!root) return null;
        const canonical = derived && typeof derived === 'object' ? derived : root;
        const pressureScore = Math.max(0, Math.min(3, Math.floor(Number(canonical.pressureScore ?? root.pressureScore) || 0)));
        const statusId = String(
            canonical.statusId
            || root.statusId
            || (pressureScore >= 3 ? 'high_pressure' : (pressureScore >= 2 ? 'pressure' : (pressureScore >= 1 ? 'pending' : 'stable')))
        ).trim().slice(0, 24);
        const statusLabel = String(
            canonical.statusLabel
            || canonical.pressureLabel
            || root.statusLabel
            || root.pressureLabel
            || (pressureScore >= 3 ? '高压' : (pressureScore >= 2 ? '承压' : (pressureScore >= 1 ? '待补样' : '稳态')))
        ).trim().slice(0, 24);
        const rawItems = Array.isArray(canonical.items) && canonical.items.length > 0
            ? canonical.items
            : (Array.isArray(root.items) ? root.items : []);
        const items = rawItems
            .filter((entry) => entry && typeof entry === 'object')
            .slice(0, 3)
            .map((entry, index) => ({
                id: String(entry.id || entry.laneId || `frontier_${index + 1}`).trim().slice(0, 32) || `frontier_${index + 1}`,
                laneId: String(entry.laneId || entry.id || '').trim().slice(0, 32),
                label: String(entry.label || entry.shortLabel || `战线 ${index + 1}`).trim().slice(0, 48),
                shortLabel: String(entry.shortLabel || entry.label || `战线 ${index + 1}`).trim().slice(0, 24),
                icon: String(entry.icon || '✦').trim().slice(0, 4) || '✦',
                role: String(entry.role || '').trim().slice(0, 24),
                roleLabel: String(entry.roleLabel || '').trim().slice(0, 24),
                statusId: String(entry.statusId || '').trim().slice(0, 24),
                statusLabel: String(entry.statusLabel || '').trim().slice(0, 24),
                pressureScore: Math.max(0, Math.min(3, Math.floor(Number(entry.pressureScore) || 0))),
                pressureLabel: String(entry.pressureLabel || entry.statusLabel || '').trim().slice(0, 24),
                progressText: String(entry.progressText || '').trim().slice(0, 24),
                completed: !!entry.completed,
                summaryLine: String(entry.summaryLine || '').trim().slice(0, 180),
                detailLine: String(entry.detailLine || '').trim().slice(0, 220),
                anchorSection: String(entry.anchorSection || '').trim().slice(0, 24),
                actionType: String(entry.actionType || '').trim().slice(0, 24),
                actionValue: String(entry.actionValue || '').trim().slice(0, 40),
                ctaLabel: String(entry.ctaLabel || '').trim().slice(0, 24),
                actionTargetLabel: String(entry.actionTargetLabel || '').trim().slice(0, 24),
                priority: Math.max(1, Math.min(9, Math.floor(Number(entry.priority) || index + 1)))
            }))
            .sort((a, b) => a.priority - b.priority);
        const primaryFrontId = String(canonical.primaryFrontId || canonical.primaryLaneId || root.primaryFrontId || root.primaryLaneId || '').trim().slice(0, 32);
        const primaryItem = items.find((item) => item.id === primaryFrontId || item.laneId === primaryFrontId) || items[0] || null;
        const actionMeta = typeof this.game.getSeasonVerificationActionMeta === 'function'
            ? this.game.getSeasonVerificationActionMeta(
                canonical.actionValue || canonical.primaryAnchorSection || primaryItem?.anchorSection || root.actionValue || root.primaryAnchorSection || 'sanctum',
                { fallbackSection: 'sanctum' }
            )
            : {
                actionType: 'collection',
                actionValue: canonical.actionValue || canonical.primaryAnchorSection || primaryItem?.anchorSection || root.actionValue || root.primaryAnchorSection || 'sanctum',
                ctaLabel: '前往推进',
                targetLabel: '当前主线'
            };
        const normalized = {
            available: root.available !== false,
            id: String(canonical.id || root.id || `season_frontier_${context.weekTag || 'current'}_${primaryFrontId || 'primary'}`).trim().slice(0, 96),
            statusId,
            statusLabel,
            pressureScore,
            pressureLabel: String(canonical.pressureLabel || root.pressureLabel || statusLabel).trim().slice(0, 24),
            primaryFrontId: primaryFrontId || primaryItem?.id || '',
            primaryFrontLabel: String(canonical.primaryFrontLabel || primaryItem?.label || root.primaryFrontLabel || '诸界战线').trim().slice(0, 48),
            primaryFrontShortLabel: String(canonical.primaryFrontShortLabel || primaryItem?.shortLabel || root.primaryFrontShortLabel || '主战线').trim().slice(0, 24),
            primaryLaneId: String(canonical.primaryLaneId || primaryFrontId || primaryItem?.laneId || root.primaryLaneId || '').trim().slice(0, 32),
            primaryAnchorSection: String(canonical.primaryAnchorSection || primaryItem?.anchorSection || root.primaryAnchorSection || '').trim().slice(0, 24),
            summaryLine: String(canonical.summaryLine || root.summaryLine || '').trim().slice(0, 220),
            detailLine: String(canonical.detailLine || root.detailLine || '').trim().slice(0, 220),
            guideLine: String(canonical.guideLine || root.guideLine || '').trim().slice(0, 240),
            actionLaneId: String(canonical.actionLaneId || primaryFrontId || root.actionLaneId || '').trim().slice(0, 32),
            actionType: String(canonical.actionType || actionMeta.actionType || root.actionType || '').trim().slice(0, 24) || actionMeta.actionType || 'collection',
            actionValue: String(canonical.actionValue || actionMeta.actionValue || root.actionValue || '').trim().slice(0, 40) || actionMeta.actionValue || 'sanctum',
            ctaLabel: String(canonical.ctaLabel || actionMeta.ctaLabel || root.ctaLabel || '前往推进').trim().slice(0, 24) || '前往推进',
            actionTargetLabel: String(canonical.actionTargetLabel || actionMeta.targetLabel || root.actionTargetLabel || '当前主线').trim().slice(0, 24) || '当前主线',
            actionLine: String(canonical.actionLine || root.actionLine || '').trim().slice(0, 160),
            source: String(canonical.source || root.source || '').trim().slice(0, 40),
            sourceId: String(canonical.sourceId || root.sourceId || '').trim().slice(0, 96),
            taskSource: String(canonical.taskSource || root.taskSource || '').trim().slice(0, 40),
            taskSourceId: String(canonical.taskSourceId || root.taskSourceId || '').trim().slice(0, 96),
            taskId: String(canonical.taskId || root.taskId || '').trim().slice(0, 64),
            decree: null,
            chronicle: null,
            council: null,
            resolution: null,
            chronicleArchive: null,
            items
        };
        if (!normalized.actionLine) {
            normalized.actionLine = `主战线【${normalized.primaryFrontShortLabel || normalized.primaryFrontLabel || '主战线'}】 · 下一跳【${normalized.actionTargetLabel || '当前主线'}】 · ${normalized.ctaLabel || '前往推进'}`;
        }
        normalized.decree = this.normalizeSeasonBoardFrontierDecree(canonical.decree || root.decree, {
            ...context,
            frontier: normalized
        });
        normalized.chronicle = this.normalizeSeasonBoardFrontierChronicle(canonical.chronicle || root.chronicle, {
            ...context,
            frontier: normalized
        });
        normalized.council = this.normalizeSeasonBoardFrontierCouncil(canonical.council || root.council, {
            ...context,
            frontier: normalized
        });
        normalized.resolution = this.normalizeSeasonBoardFrontierResolution(canonical.resolution || root.resolution, {
            ...context,
            frontier: normalized
        });
        normalized.chronicleArchive = this.normalizeSeasonBoardFrontierChronicleArchive(canonical.chronicleArchive || root.chronicleArchive, {
            ...context,
            frontier: normalized
        });
        return normalized.summaryLine || normalized.guideLine || normalized.items.length > 0
            ? normalized
            : null;
    }

    commitSeasonBoardFrontierResolution(choiceId = '', options = {}) {
        const sanitizeText = (value = '', limit = 120) => String(value || '').trim().slice(0, limit);
        const choiceCatalog = {
            hold_primary: {
                label: '守主战线',
                stanceId: 'frontier_loyalist',
                writebackMode: 'upgrade_verdict'
            },
            rebalance_support: {
                label: '副线补证',
                stanceId: 'support_balancer',
                writebackMode: 'boost_recommendation'
            },
            seal_dispute: {
                label: '封存争议',
                stanceId: 'dispute_archivist',
                writebackMode: 'carry_forward'
            }
        };
        const targetChoiceId = sanitizeText(choiceId, 32);
        const failure = (reason, detail = {}) => {
            this.game.lastSeasonBoardFrontierResolutionCommit = {
                ok: false,
                reason,
                choiceId: targetChoiceId,
                ...detail,
                submittedAt: 0
            };
            return this.game.lastSeasonBoardFrontierResolutionCommit;
        };
        if (!Object.prototype.hasOwnProperty.call(choiceCatalog, targetChoiceId)) {
            return failure('invalid_choice');
        }

        const board = options?.board && typeof options.board === 'object'
            ? this.normalizeSeasonBoardSnapshot(options.board)
            : (typeof this.getSeasonBoardSnapshot === 'function'
                ? this.getSeasonBoardSnapshot(options)
                : null);
        const frontier = board?.frontier && typeof board.frontier === 'object' ? board.frontier : null;
        const resolution = frontier?.resolution && typeof frontier.resolution === 'object' ? frontier.resolution : null;
        if (!board || !frontier || !resolution?.available) {
            return failure('not_available', { board });
        }
        const weekTag = sanitizeText(resolution.weekTag || board.weekTag || '', 24);
        const weekLabel = sanitizeText(board.weekLabel || '', 32);
        if (!weekTag) return failure('missing_week', { resolution });

        const state = this.game.ensureSeasonVerificationState({ weekTag, weekLabel });
        const existing = this.getCommittedSeasonBoardFrontierResolution({
            weekTag,
            weekLabel,
            seasonVerification: state
        });
        if (existing || resolution.submitted) {
            return failure('already_submitted', {
                resolution,
                committed: existing
            });
        }

        const meta = choiceCatalog[targetChoiceId];
        const primaryLaneId = sanitizeText(resolution.laneId || frontier.primaryFrontId || '', 32);
        const primaryLaneLabel = sanitizeText(resolution.laneLabel || frontier.primaryFrontShortLabel || frontier.primaryFrontLabel || '主战线', 24) || '主战线';
        const supportItem = Array.isArray(frontier.items)
            ? frontier.items.find((item) => item && item.laneId && item.laneId !== primaryLaneId && item.role !== 'reserve')
                || frontier.items.find((item) => item && item.laneId && item.laneId !== primaryLaneId)
                || null
            : null;
        const supportLaneId = targetChoiceId === 'rebalance_support'
            ? sanitizeText(resolution.supportLaneId || supportItem?.laneId || supportItem?.id || '', 32)
            : '';
        const supportLaneLabel = targetChoiceId === 'rebalance_support'
            ? sanitizeText(resolution.supportLaneLabel || supportItem?.shortLabel || supportItem?.label || '副战线', 24)
            : '';
        const submittedAt = Math.max(0, Math.floor(Number(options.submittedAt || Date.now()) || 0));
        const ledger = board.weekVerdictLedger?.current && typeof board.weekVerdictLedger.current === 'object'
            ? board.weekVerdictLedger.current
            : null;
        const settlement = board.settlement && typeof board.settlement === 'object' ? board.settlement : null;
        const summaryLine = targetChoiceId === 'rebalance_support'
            ? `本周会审裁记：给【${supportLaneLabel || '副战线'}】补一份旁证，但不抢【${primaryLaneLabel}】主行动。`
            : (targetChoiceId === 'seal_dispute'
                ? '本周会审裁记：争议先封入史卷，本周不改写三线排班。'
                : `本周会审裁记：继续守住【${primaryLaneLabel}】，先完成主战线一格。`);
        const chronicleSealLine = targetChoiceId === 'rebalance_support'
            ? `战役史卷已封记：${meta.label} · ${primaryLaneLabel}${supportLaneLabel ? ` / ${supportLaneLabel}` : ''}。`
            : (targetChoiceId === 'seal_dispute'
                ? `战役史卷已封记：${meta.label} · 会审争议暂不改写排班。`
                : `战役史卷已封记：${meta.label} · ${primaryLaneLabel}继续优先。`);
        const councilResolutionLine = `诸界会审裁定：${summaryLine}`;
        const record = this.game.normalizeSeasonVerificationRecord({
            recordId: `season_frontier_resolution_${weekTag}`,
            recordKind: 'frontier_resolution',
            weekTag,
            weekLabel,
            role: 'side',
            sourceMode: 'sanctum',
            sourceModeLabel: '诸界会审',
            sourceLabel: frontier.primaryFrontLabel || primaryLaneLabel,
            label: '诸界会审裁记',
            resultStatus: 'verified',
            writebackMode: meta.writebackMode,
            phaseId: sanitizeText(board.phaseId || resolution.phaseId || ledger?.phaseId || '', 32),
            phaseLabel: sanitizeText(board.phaseLabel || resolution.phaseLabel || ledger?.phaseLabel || '', 24),
            settlementId: sanitizeText(settlement?.id || ledger?.settlementId || '', 96),
            settlementOutcomeId: sanitizeText(settlement?.outcomeId || resolution.settlementOutcomeId || ledger?.settlementOutcomeId || '', 32),
            settlementOutcomeLabel: sanitizeText(settlement?.outcomeLabel || resolution.settlementOutcomeLabel || ledger?.settlementOutcomeLabel || '', 24),
            settlementSource: sanitizeText(settlement?.settlementSource || ledger?.settlementSource || '', 24),
            ledgerId: sanitizeText(ledger?.ledgerId || resolution.sourceId || '', 96),
            debtPackId: sanitizeText(board.debtPack?.id || ledger?.debtPackId || '', 96),
            debtStatus: sanitizeText(board.debtPack?.status || ledger?.debtStatus || '', 24),
            deferCount: Math.max(0, Math.floor(Number(board.debtPack?.deferCount || ledger?.deferCount || 0) || 0)),
            carryIntoWeekTag: sanitizeText(board.debtPack?.carryIntoWeekTag || ledger?.carryIntoWeekTag || '', 24),
            proofQuality: sanitizeText(resolution.proofQuality || ledger?.proofQuality || '', 24),
            lineageStyle: sanitizeText(resolution.lineageStyle || ledger?.lineageStyle || '', 48),
            summaryLine,
            detailLine: [resolution.councilResolutionLine || '', resolution.chronicleSealLine || ''].filter(Boolean).slice(0, 2).join('｜'),
            statusLine: `会审裁记 · ${meta.label} · 已封记`,
            anchorSection: 'sanctum',
            priority: 3,
            frontierResolutionId: `season_frontier_resolution_${weekTag}_${targetChoiceId}`,
            frontierResolutionChoiceId: targetChoiceId,
            frontierResolutionLabel: meta.label,
            frontierResolutionStance: meta.stanceId,
            frontierResolutionSupportLaneId: supportLaneId,
            frontierResolutionSupportLaneLabel: supportLaneLabel,
            frontierResolutionSummaryLine: summaryLine,
            chronicleSealStatus: 'sealed',
            chronicleSealLine,
            councilResolutionLine,
            frontierResolutionSubmittedAt: submittedAt,
            createdAt: submittedAt,
            updatedAt: submittedAt
        });
        if (!record?.recordId) return failure('record_failed', { resolution });

        const isSameResolutionRecord = (entry) => (
            entry
            && (
                entry.recordId === record.recordId
                || (
                    entry.weekTag === weekTag
                    && (
                        String(entry.recordKind || '').trim() === 'frontier_resolution'
                        || !!entry.frontierResolutionChoiceId
                        || !!entry.frontierResolutionId
                    )
                )
            )
        );
        const records = [
            record,
            ...(Array.isArray(state.records) ? state.records.filter((entry) => !isSameResolutionRecord(entry)) : [])
        ].slice(0, 6);
        const history = [
            record,
            ...(Array.isArray(state.history) ? state.history.filter((entry) => !isSameResolutionRecord(entry)) : [])
        ].slice(0, 18);
        this.game.seasonVerificationState = this.game.normalizeSeasonVerificationState({
            ...state,
            weekTag,
            weekLabel,
            records,
            history,
            lastResolved: state.lastResolved
        });

        const committed = this.getCommittedSeasonBoardFrontierResolution({
            weekTag,
            weekLabel,
            seasonVerification: this.game.seasonVerificationState
        });
        this.game.lastSeasonBoardFrontierResolutionCommit = {
            ok: true,
            reason: 'submitted',
            choiceId: targetChoiceId,
            weekTag,
            record,
            committed,
            resolution: {
                ...resolution,
                submitted: true,
                choiceId: targetChoiceId,
                choiceLabel: meta.label,
                summaryLine,
                chronicleSealLine,
                councilResolutionLine,
                submittedAt
            },
            submittedAt
        };

        if (typeof this.game.saveGame === 'function') {
            this.game.saveGame();
        }
        if (typeof document !== 'undefined') {
            if (typeof this.game.renderRewardExpeditionMeta === 'function') this.game.renderRewardExpeditionMeta();
            if (typeof this.game.updateRewardHeaderCopy === 'function') this.game.updateRewardHeaderCopy();
            if (typeof this.game.renderSanctumOverview === 'function' && document.getElementById('sanctum-summary')) {
                this.game.renderSanctumOverview();
            }
        }
        return this.game.lastSeasonBoardFrontierResolutionCommit;
    }

    claimSeasonBoardLaneReward(laneId = '', options = {}) {
        const targetLaneId = String(laneId || '').trim();
        const board = options?.board && typeof options.board === 'object'
            ? this.normalizeSeasonBoardSnapshot(options.board)
            : (typeof this.getSeasonBoardSnapshot === 'function'
                ? this.getSeasonBoardSnapshot(options)
                : null);
        const reward = Array.isArray(board?.laneRewards)
            ? board.laneRewards.find((entry) => entry?.laneId === targetLaneId)
            : null;
        const failure = (reason, detail = {}) => {
            this.game.lastSeasonBoardLaneRewardClaim = {
                ok: false,
                reason,
                laneId: targetLaneId,
                ...detail,
                claimedAt: Date.now()
            };
            return this.game.lastSeasonBoardLaneRewardClaim;
        };
        if (!reward) return failure('not_found');
        if (!reward.ready) return failure('not_ready', { reward });
        if (reward.claimed) return failure('already_claimed', { reward });
        const weekTag = String(reward.weekTag || board?.weekTag || '').trim();
        if (!weekTag) return failure('missing_week', { reward });

        const state = this.game.ensureSeasonVerificationState({
            weekTag,
            weekLabel: reward.weekLabel || board?.weekLabel || ''
        });
        const claimedLaneRewards = this.normalizeSeasonBoardClaimedLaneRewards(state.claimedLaneRewards);
        if (claimedLaneRewards?.[weekTag]?.[targetLaneId]) {
            return failure('already_claimed', { reward });
        }

        const gains = reward.gains && typeof reward.gains === 'object' ? reward.gains : {};
        const reason = `${reward.laneLabel || reward.label || '分线'}结题赏`;
        const claimEntry = {
            weekTag,
            weekLabel: reward.weekLabel || board?.weekLabel || '',
            laneId: targetLaneId,
            laneLabel: reward.laneLabel || '',
            rewardKey: reward.rewardKey || '',
            rewardLine: reward.rewardLine || this.formatSeasonBoardLaneRewardGainLine(gains),
            claimed: true,
            claimedAt: Date.now()
        };
        const nextClaims = {
            ...claimedLaneRewards,
            [weekTag]: {
                ...(claimedLaneRewards[weekTag] || {}),
                [targetLaneId]: claimEntry
            }
        };
        this.game.seasonVerificationState = this.game.normalizeSeasonVerificationState({
            ...state,
            claimedLaneRewards: nextClaims
        });
        const playerSnapshot = this.game.player
            ? {
                heavenlyInsight: Math.max(0, Math.floor(Number(this.game.player.heavenlyInsight) || 0)),
                karma: Math.max(0, Math.floor(Number(this.game.player.karma) || 0)),
                gold: Math.max(0, Math.floor(Number(this.game.player.gold) || 0)),
                fateRing: this.game.player.fateRing && typeof this.game.player.fateRing === 'object'
                    ? {
                        exp: Math.max(0, Math.floor(Number(this.game.player.fateRing.exp) || 0)),
                        level: Math.max(0, Math.floor(Number(this.game.player.fateRing.level) || 0)),
                        maxSlots: Math.max(0, Math.floor(Number(this.game.player.fateRing.maxSlots) || 0)),
                        json: (() => {
                            try {
                                return typeof this.game.player.fateRing.toJSON === 'function'
                                    ? this.game.player.fateRing.toJSON()
                                    : null;
                            } catch {
                                return null;
                            }
                        })()
                    }
                    : null
            }
            : null;
        const rollbackClaim = () => {
            this.game.seasonVerificationState = this.game.normalizeSeasonVerificationState({
                ...state,
                claimedLaneRewards
            });
            if (!this.game.player || !playerSnapshot) return;
            this.game.player.heavenlyInsight = playerSnapshot.heavenlyInsight;
            this.game.player.karma = playerSnapshot.karma;
            this.game.player.gold = playerSnapshot.gold;
            const ring = this.game.player.fateRing;
            if (!ring || !playerSnapshot.fateRing) return;
            if (playerSnapshot.fateRing.json && typeof ring.loadFromJSON === 'function') {
                try {
                    ring.loadFromJSON(playerSnapshot.fateRing.json);
                    return;
                } catch {}
            }
            ring.exp = playerSnapshot.fateRing.exp;
            ring.level = playerSnapshot.fateRing.level;
            if ('maxSlots' in ring) ring.maxSlots = playerSnapshot.fateRing.maxSlots;
        };
        let strategicGain = { insight: 0, karma: 0 };
        let ringExp = 0;
        const gold = Math.max(0, Math.floor(Number(gains.gold) || 0));
        try {
            strategicGain = typeof this.game.grantStrategicCurrencies === 'function'
                ? this.game.grantStrategicCurrencies({
                    insight: gains.insight || 0,
                    karma: gains.karma || 0
                }, reason)
                : { insight: 0, karma: 0 };
            ringExp = typeof this.game.grantFateRingExp === 'function'
                ? this.game.grantFateRingExp(gains.ringExp || 0, reason)
                : 0;
            if (gold > 0 && this.game.player) {
                this.game.player.gold = Math.max(0, Math.floor(Number(this.game.player.gold) || 0)) + gold;
                if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
                    Utils.showBattleLog(`${reason}：灵石 +${gold}`);
                }
            }
        } catch (error) {
            rollbackClaim();
            this.game.lastSeasonBoardLaneRewardClaim = {
                ok: false,
                reason: 'grant_failed',
                laneId: targetLaneId,
                weekTag,
                reward,
                rewardLine: claimEntry.rewardLine,
                claimedAt: 0,
                error: error?.message || String(error || '')
            };
            return this.game.lastSeasonBoardLaneRewardClaim;
        }
        this.game.lastSeasonBoardLaneRewardClaim = {
            ok: true,
            laneId: targetLaneId,
            weekTag,
            reward: {
                ...reward,
                claimed: true,
                claimable: false,
                status: 'claimed',
                statusLabel: '已领取',
                claimedAt: claimEntry.claimedAt
            },
            gains: {
                insight: strategicGain.insight || 0,
                karma: strategicGain.karma || 0,
                ringExp,
                gold
            },
            rewardLine: claimEntry.rewardLine,
            claimedAt: claimEntry.claimedAt
        };

        if (typeof this.game.saveGame === 'function') {
            this.game.saveGame();
        }
        if (typeof document !== 'undefined') {
            if (typeof this.game.renderRewardExpeditionMeta === 'function') this.game.renderRewardExpeditionMeta();
            if (typeof this.game.updateRewardHeaderCopy === 'function') this.game.updateRewardHeaderCopy();
            if (typeof this.game.renderSanctumOverview === 'function' && document.getElementById('sanctum-summary')) {
                this.game.renderSanctumOverview();
            }
        }
        return this.game.lastSeasonBoardLaneRewardClaim;
    }

    normalizeSeasonBoardSnapshot(source = null) {
        const root = source && typeof source === 'object' ? source : null;
        if (!root) return null;
        const lanes = Array.isArray(root.lanes)
            ? root.lanes
                .map((lane, index) => this.game.normalizeHeavenlyMandateLane(lane, index))
                .slice(0, 3)
            : [];
        const laneCompletedTaskCount = lanes.reduce((sum, lane) => sum + lane.completedCount, 0);
        const laneTotalTaskCount = lanes.reduce((sum, lane) => sum + lane.totalCount, 0);
        const explicitTotal = Math.max(
            0,
            Math.floor(Number(
                root.totalTaskCount
                ?? root.progress?.total
                ?? 0
            ) || 0)
        );
        const totalTaskCount = Math.max(laneTotalTaskCount, explicitTotal);
        const explicitCompleted = Math.max(
            0,
            Math.floor(Number(
                root.completedTaskCount
                ?? root.progress?.completed
                ?? 0
            ) || 0)
        );
        const completedTaskCount = totalTaskCount > 0
            ? Math.min(totalTaskCount, Math.max(laneCompletedTaskCount, explicitCompleted))
            : Math.max(laneCompletedTaskCount, explicitCompleted);
        const progressText = String(
            root.progress?.progressText
            || (totalTaskCount > 0 ? `${completedTaskCount}/${totalTaskCount}` : '待同步')
        ).trim() || '待同步';
        const progressRatio = totalTaskCount > 0
            ? Math.max(0, Math.min(1, completedTaskCount / Math.max(1, totalTaskCount)))
            : 0;
        const phaseId = String(root.phaseId || 'sampling').trim().slice(0, 32) || 'sampling';
        const phaseLabelCatalog = {
            sampling: '采样期',
            lockline: '锁线期',
            ranking: '定榜期'
        };
        const phaseIconCatalog = {
            sampling: '🔭',
            lockline: '📜',
            ranking: '🏁'
        };
        const phaseLabel = String(root.phaseLabel || phaseLabelCatalog[phaseId] || '采样期').trim() || '采样期';
        const phaseIcon = String(root.phaseIcon || phaseIconCatalog[phaseId] || '🔭').trim() || '🔭';
        const lanePriorityByPhase = {
            ranking: ['verification', 'expedition', 'training'],
            lockline: ['expedition', 'training', 'verification'],
            sampling: ['training', 'expedition', 'verification']
        };
        const basePrioritizedLaneIds = Array.isArray(lanePriorityByPhase[phaseId])
            ? lanePriorityByPhase[phaseId]
            : lanePriorityByPhase.sampling;
        const settlement = this.normalizeSeasonBoardSettlement(root.settlement);
        const debtPack = this.normalizeSeasonBoardDebtPack(root.debtPack);
        const weekVerdictLedger = this.normalizeSeasonBoardWeekVerdictLedger(root.weekVerdictLedger);
        const verificationArchive = this.game.normalizeSeasonVerificationArchiveSnapshot(root.verificationArchive);
        const verificationOrders = Array.isArray(root.verificationOrders)
            ? root.verificationOrders
                .map((entry, index) => this.normalizeSeasonBoardVerificationOrder(entry, index))
                .filter(Boolean)
                .slice(0, 2)
            : [];
        const hasIncompleteLaneTask = (laneId = '') => {
            const lane = lanes.find((entry) => entry && entry.id === laneId);
            return !!(lane && Array.isArray(lane.tasks) && lane.tasks.some((task) => task && !task.completed));
        };
        const currentVerdict = weekVerdictLedger?.current && typeof weekVerdictLedger.current === 'object'
            ? weekVerdictLedger.current
            : null;
        const activeDebtStatus = String(debtPack?.status || currentVerdict?.debtStatus || '').trim();
        const settlementOutcomeId = String(settlement?.outcomeId || currentVerdict?.settlementOutcomeId || '').trim();
        const hardSettlementOutcomes = new Set(['locking_sheet', 'positive_sheet', 'risky_sheet', 'debt_sheet']);
        const hardVerificationGate = phaseId === 'ranking'
            || hardSettlementOutcomes.has(settlementOutcomeId)
            || verificationOrders.some((order) => (
                String(order?.type || '').trim() === 'clear_debt'
            ));
        const hardDebtGate = !!(
            debtPack
            && ['open', 'deferred'].includes(activeDebtStatus)
            && (
                debtPack.occupiesStrongSlot
                || settlementOutcomeId === 'debt_sheet'
                || verificationOrders.some((order) => String(order?.type || '').trim() === 'clear_debt')
            )
        );
        const explicitNextWeekGoal = root.nextWeekGoal && typeof root.nextWeekGoal === 'object'
            ? root.nextWeekGoal
            : null;
        const explicitStrongNextWeekGoal = !!(
            explicitNextWeekGoal
            && String(explicitNextWeekGoal.source || '').trim()
            && String(explicitNextWeekGoal.source || '').trim() !== 'lane'
        );
        const chapterArcPreview = typeof this.buildSeasonBoardChapterArc === 'function'
            ? this.buildSeasonBoardChapterArc({
                weekTag: String(root.weekTag || '').trim().slice(0, 24),
                weekLabel: String(root.weekLabel || '').trim().slice(0, 32),
                settlement,
                debtPack,
                weekVerdictLedger,
                seasonVerificationState: this.game.seasonVerificationState
            })
            : null;
        const chapterArcCarryoverPreview = chapterArcPreview?.carryover && typeof chapterArcPreview.carryover === 'object'
            ? chapterArcPreview.carryover
            : null;
        const frontierResolutionChoiceId = String(
            currentVerdict?.frontierResolutionChoiceId
            || currentVerdict?.resolutionChoiceId
            || currentVerdict?.choiceId
            || ''
        ).trim();
        const frontierResolutionSupportLaneId = String(
            currentVerdict?.frontierResolutionSupportLaneId
            || currentVerdict?.supportLaneId
            || ''
        ).trim();
        const canApplyFrontierResolutionLaneBias = frontierResolutionChoiceId === 'rebalance_support'
            && !hardDebtGate
            && !hardVerificationGate
            && !explicitStrongNextWeekGoal
            && basePrioritizedLaneIds.includes(frontierResolutionSupportLaneId)
            && hasIncompleteLaneTask(frontierResolutionSupportLaneId);
        const chapterArcCarryoverLaneId = String(chapterArcCarryoverPreview?.preferredLaneId || '').trim();
        const canApplyChapterArcCarryoverLaneBias = !canApplyFrontierResolutionLaneBias
            && !!chapterArcCarryoverPreview?.available
            && !!chapterArcCarryoverPreview?.openingWeek
            && !hardDebtGate
            && !hardVerificationGate
            && !explicitStrongNextWeekGoal
            && basePrioritizedLaneIds.includes(chapterArcCarryoverLaneId)
            && hasIncompleteLaneTask(chapterArcCarryoverLaneId);
        const prioritizedLaneIds = canApplyFrontierResolutionLaneBias
            ? [
                frontierResolutionSupportLaneId,
                ...basePrioritizedLaneIds.filter((laneId) => laneId !== frontierResolutionSupportLaneId)
            ]
            : (canApplyChapterArcCarryoverLaneBias
                ? [
                    chapterArcCarryoverLaneId,
                    ...basePrioritizedLaneIds.filter((laneId) => laneId !== chapterArcCarryoverLaneId)
                ]
                : basePrioritizedLaneIds);
        const prioritizedLanes = [
            ...prioritizedLaneIds
                .map((laneId) => lanes.find((lane) => lane && lane.id === laneId))
                .filter(Boolean),
            ...lanes.filter((lane) => lane && !prioritizedLaneIds.includes(lane.id))
        ];
        const nextTask = prioritizedLanes.reduce((result, lane) => {
            if (result) return result;
            const task = Array.isArray(lane.tasks)
                ? lane.tasks.find((entry) => entry && !entry.completed)
                : null;
            return task
                ? {
                    laneId: lane.id,
                    laneLabel: lane.label,
                    task
                }
                : null;
        }, null);
        const normalizeNextTaskSource = (value = '') => {
            const raw = String(value || '').trim();
            const catalog = {
                debt_pack: 'debt_pack',
                debtPack: 'debt_pack',
                seasonDebtPack: 'debt_pack',
                debt: 'debt_pack',
                verification: 'verification',
                verification_order: 'verification',
                seasonVerification: 'verification',
                season_verification: 'verification',
                settlement: 'settlement',
                seasonSettlement: 'settlement',
                lane: 'lane',
                seasonBoardLane: 'lane',
                heavenlyMandateTask: 'lane'
            };
            return catalog[raw] || '';
        };
        const resolveNextTaskSource = (candidate = null) => {
            const task = candidate?.task && typeof candidate.task === 'object' ? candidate.task : {};
            const explicit = normalizeNextTaskSource(task.source || task.sourceType || '');
            if (explicit) return explicit;
            const debtStatus = String(debtPack?.status || '').trim();
            if (
                debtPack
                && ['open', 'deferred'].includes(debtStatus)
                && (
                    debtPack.occupiesStrongSlot
                    || settlement?.outcomeId === 'debt_sheet'
                    || verificationOrders.some((order) => order?.type === 'clear_debt')
                )
            ) {
                return 'debt_pack';
            }
            if (
                candidate?.laneId === 'verification'
                || phaseId === 'ranking'
                || ['positive_sheet', 'risky_sheet'].includes(String(settlement?.outcomeId || '').trim())
            ) {
                return 'verification';
            }
            if (String(settlement?.outcomeId || '').trim() === 'locking_sheet') return 'settlement';
            return 'lane';
        };
        const resolveNextTaskSourceId = (sourceType = '', candidate = null) => {
            const task = candidate?.task && typeof candidate.task === 'object' ? candidate.task : {};
            if (task.sourceId) return String(task.sourceId || '').trim().slice(0, 96);
            switch (sourceType) {
                case 'debt_pack':
                    return String(debtPack?.id || '').trim().slice(0, 96);
                case 'verification':
                    return String(verificationOrders[0]?.id || verificationOrders[1]?.id || '').trim().slice(0, 96);
                case 'settlement':
                    return String(settlement?.id || '').trim().slice(0, 96);
                default:
                    return String(task.id || '').trim().slice(0, 96);
            }
        };
        const nextTaskActionMeta = nextTask
            ? (typeof this.game.getSeasonVerificationActionMeta === 'function'
                ? this.game.getSeasonVerificationActionMeta(
                    nextTask.task.actionValue || nextTask.task.anchorSection || '',
                    { fallbackSection: 'sanctum' }
                )
                : {
                    actionType: 'collection',
                    actionValue: nextTask.task.anchorSection || 'sanctum',
                    ctaLabel: '前往推进'
                })
            : null;
        const nextTaskSource = nextTask ? resolveNextTaskSource(nextTask) : '';
        const nextTaskSourceId = nextTask ? resolveNextTaskSourceId(nextTaskSource, nextTask) : '';
        const nextTaskPayload = nextTask
            ? {
                laneId: nextTask.laneId,
                laneLabel: nextTask.laneLabel,
                id: nextTask.task.id,
                label: nextTask.task.label,
                progressText: nextTask.task.progressText,
                hintLine: nextTask.task.hintLine,
                statusLine: nextTask.task.statusLine,
                anchorSection: nextTask.task.anchorSection,
                actionType: String(nextTask.task.actionType || nextTaskActionMeta?.actionType || '').trim().slice(0, 24)
                    || nextTaskActionMeta?.actionType
                    || 'collection',
                actionValue: String(nextTask.task.actionValue || nextTaskActionMeta?.actionValue || '').trim().slice(0, 40)
                    || nextTaskActionMeta?.actionValue
                    || 'sanctum',
                ctaLabel: String(nextTask.task.ctaLabel || nextTaskActionMeta?.ctaLabel || '前往推进').trim().slice(0, 24)
                    || '前往推进',
                source: nextTaskSource,
                sourceId: nextTaskSourceId,
                taskSource: 'lane',
                taskSourceId: String(nextTask.task.id || nextTask.task.sourceId || '').trim().slice(0, 96)
            }
            : null;
        const rootNextWeekGoal = root.nextWeekGoal && typeof root.nextWeekGoal === 'object'
            ? root.nextWeekGoal
            : null;
        const rootNextWeekGoalMatchesNextTask = !!(
            rootNextWeekGoal
            && nextTaskPayload
            && (!rootNextWeekGoal.taskId || String(rootNextWeekGoal.taskId || '').trim() === nextTaskPayload.id)
            && (!rootNextWeekGoal.taskSourceId || String(rootNextWeekGoal.taskSourceId || '').trim() === nextTaskPayload.taskSourceId)
            && (!rootNextWeekGoal.laneId || String(rootNextWeekGoal.laneId || '').trim() === nextTaskPayload.laneId)
            && (!rootNextWeekGoal.source || normalizeNextTaskSource(rootNextWeekGoal.source) === nextTaskPayload.source)
            && (!rootNextWeekGoal.sourceId || String(rootNextWeekGoal.sourceId || '').trim() === nextTaskPayload.sourceId)
        );
        const rootNextWeekGoalSeed = rootNextWeekGoalMatchesNextTask ? rootNextWeekGoal : null;
        const nextWeekGoal = nextTaskPayload
            ? {
                title: String(rootNextWeekGoalSeed?.title || nextTaskPayload.label || '').trim().slice(0, 80),
                note: String(
                    rootNextWeekGoalSeed?.note
                    || [
                        nextTaskPayload.hintLine || '',
                        nextTaskPayload.statusLine || '',
                        nextTaskPayload.progressText ? `进度 ${nextTaskPayload.progressText}` : ''
                    ].filter(Boolean).join(' · ')
                ).trim().slice(0, 220),
                action: String(rootNextWeekGoalSeed?.action || nextTaskPayload.actionType || '').trim().slice(0, 24)
                    || nextTaskPayload.actionType,
                value: String(rootNextWeekGoalSeed?.value || nextTaskPayload.actionValue || '').trim().slice(0, 40)
                    || nextTaskPayload.actionValue,
                buttonLabel: String(rootNextWeekGoalSeed?.buttonLabel || rootNextWeekGoalSeed?.ctaLabel || nextTaskPayload.ctaLabel || '前往推进').trim().slice(0, 24)
                    || '前往推进',
                source: normalizeNextTaskSource(rootNextWeekGoalSeed?.source) || nextTaskPayload.source,
                sourceId: String(rootNextWeekGoalSeed?.sourceId || nextTaskPayload.sourceId || '').trim().slice(0, 96),
                taskSource: String(rootNextWeekGoalSeed?.taskSource || nextTaskPayload.taskSource || 'lane').trim().slice(0, 40)
                    || 'lane',
                taskSourceId: String(rootNextWeekGoalSeed?.taskSourceId || nextTaskPayload.taskSourceId || nextTaskPayload.id || '').trim().slice(0, 96),
                taskId: String(rootNextWeekGoalSeed?.taskId || nextTaskPayload.id || '').trim().slice(0, 64),
                laneId: String(rootNextWeekGoalSeed?.laneId || nextTaskPayload.laneId || '').trim().slice(0, 32),
                anchorSection: String(rootNextWeekGoalSeed?.anchorSection || nextTaskPayload.anchorSection || '').trim().slice(0, 24)
            }
            : null;
        const themeLabel = String(root.themeLabel || root.seasonLabel || '本周主轴').trim() || '本周主轴';
        const themeId = String(root.themeId || root.phaseId || 'season_axis').trim().slice(0, 40) || 'season_axis';
        const summaryLine = String(
            root.summaryLine
            || `赛季天道盘当前围绕【${themeLabel}】展开，已进入「${phaseLabel}」。`
        ).trim();
        const detailLine = String(
            root.detailLine
            || [
                root.seasonName ? `赛季：${String(root.seasonName || '').trim()}` : '',
                root.weekLabel ? `轮转：${String(root.weekLabel || '').trim()}` : '',
                root.crossModeSummary ? `验算：${String(root.crossModeSummary || '').trim()}` : ''
            ].filter(Boolean).slice(0, 2).join('｜')
        ).trim();
        const guideLine = String(
            root.guideLine
            || (nextTask
                ? `下一步：${nextTask.task.label}${nextTask.task.hintLine ? ` · ${nextTask.task.hintLine}` : ''}`
                : '本周季盘任务已齐备，可以继续冲更高分或扩充跨模样本。')
        ).trim();
        const crossModeSummary = String(root.crossModeSummary || '').trim();
        const statusLine = String(
            root.statusLine
            || [phaseLabel, `赛季进度 ${progressText}`, crossModeSummary].filter(Boolean).join(' · ')
        ).trim();
        const rewardLine = String(
            root.rewardLine
            || `本章归卷会把赛季天道盘推进到 ${progressText}${nextTask ? `，接下来建议 ${nextTask.task.label}` : '，当前主轴已经成型。'}`
        ).trim();
        const laneRewards = this.buildSeasonBoardLaneRewards(lanes, {
            weekTag: String(root.weekTag || '').trim().slice(0, 24),
            weekLabel: String(root.weekLabel || '').trim().slice(0, 32),
            phaseId,
            phaseLabel
        });
        const laneRewardById = new Map(laneRewards.map((entry) => [entry.laneId, entry]));
        const lanesWithRewards = lanes.map((lane) => ({
            ...lane,
            reward: laneRewardById.get(lane.id) || null
        }));
        const laneRewardSummary = {
            readyCount: laneRewards.filter((entry) => entry.ready).length,
            claimableCount: laneRewards.filter((entry) => entry.claimable).length,
            claimedCount: laneRewards.filter((entry) => entry.claimed).length,
            totalCount: laneRewards.length
        };
        const frontier = this.normalizeSeasonBoardFrontier(root.frontier, {
            lanes: lanesWithRewards,
            phaseId,
            phaseLabel,
            weekTag: String(root.weekTag || '').trim().slice(0, 24),
            settlement,
            debtPack,
            weekVerdictLedger,
            seasonVerificationState: this.game.seasonVerificationState,
            verificationOrders,
            nextTask: nextTaskPayload
        });
        const chapterArc = this.normalizeSeasonBoardChapterArc(root.chapterArc, {
            weekTag: String(root.weekTag || '').trim().slice(0, 24),
            weekLabel: String(root.weekLabel || '').trim().slice(0, 32),
            settlement,
            debtPack,
            weekVerdictLedger,
            frontier,
            seasonVerificationState: this.game.seasonVerificationState
        });
        const chapterArcCarryover = chapterArc?.carryover && typeof chapterArc.carryover === 'object'
            ? {
                ...chapterArc.carryover,
                applied: canApplyChapterArcCarryoverLaneBias,
                summaryLine: canApplyChapterArcCarryoverLaneBias
                    ? (chapterArc.carryover.summaryLine || '')
                    : `上章承卷：${chapterArc.carryover.chapterLabel || '上章'} 的章末评语已保留，但当前周强目标更强，开局偏置暂不生效。`,
                statusLabel: canApplyChapterArcCarryoverLaneBias ? '开局偏置' : '让位强目标',
                guideLine: canApplyChapterArcCarryoverLaneBias
                    ? (chapterArc.carryover.guideLine || '承卷偏置正在轻量影响当前普通开局排班。')
                    : '上章承卷已保留为章层评语，但当前周目标更强，这道开局偏置暂不生效。'
            }
            : null;
        const chapterArcPayload = chapterArcCarryover
            ? {
                ...chapterArc,
                carryover: chapterArcCarryover
            }
            : chapterArc;
        return {
            seasonId: String(root.seasonId || 'season_board').trim().slice(0, 64) || 'season_board',
            seasonLabel: String(root.seasonLabel || root.seasonName || '赛季天道盘').trim().slice(0, 64) || '赛季天道盘',
            seasonName: String(root.seasonName || root.seasonLabel || '赛季天道盘').trim().slice(0, 80) || '赛季天道盘',
            seasonIcon: String(root.seasonIcon || '🜂').trim().slice(0, 4) || '🜂',
            seasonSource: String(root.seasonSource || 'derived').trim().slice(0, 24) || 'derived',
            weekTag: String(root.weekTag || '').trim().slice(0, 24),
            weekLabel: String(root.weekLabel || '').trim().slice(0, 32),
            phaseId,
            phaseLabel,
            phaseIcon,
            themeId,
            themeLabel: themeLabel.slice(0, 64),
            summaryLine: summaryLine.slice(0, 220),
            detailLine: detailLine.slice(0, 240),
            guideLine: guideLine.slice(0, 240),
            statusLine: statusLine.slice(0, 220),
            rewardLine: rewardLine.slice(0, 220),
            crossModeSummary: crossModeSummary.slice(0, 200),
            completedTaskCount,
            totalTaskCount,
            progress: {
                completed: completedTaskCount,
                total: totalTaskCount,
                progressText: progressText.slice(0, 24),
                ratio: progressRatio
            },
            settlement,
            debtPack,
            weekVerdictLedger,
            verificationArchive,
            verificationOrders,
            laneRewards,
            laneRewardSummary,
            frontier,
            chapterArc: chapterArcPayload,
            lanes: lanesWithRewards,
            nextTask: nextTaskPayload,
            nextWeekGoal
        };
    }

    buildSeasonBoardRouteDirective(options = {}) {
        const board = options.board && typeof options.board === 'object' ? options.board : null;
        const signals = options.signals && typeof options.signals === 'object' ? options.signals : {};
        const phaseId = String(board?.phaseId || options.phaseId || '').trim();
        const defaultLaneId = phaseId === 'ranking'
            ? 'verification'
            : (phaseId === 'lockline' ? 'expedition' : 'training');
        const boardNextTask = board?.nextTask && typeof board.nextTask === 'object'
            ? board.nextTask
            : null;
        const boardNextLaneId = ['training', 'expedition', 'verification'].includes(String(boardNextTask?.laneId || '').trim())
            && String(boardNextTask?.source || '').trim() === 'lane'
            ? String(boardNextTask.laneId || '').trim()
            : '';
        const nextLaneId = boardNextLaneId || defaultLaneId;
        const chapterArcCarryover = board?.chapterArc?.carryover && typeof board.chapterArc.carryover === 'object'
            ? board.chapterArc.carryover
            : null;
        const chapterArcFeedbackLine = String(board?.chapterArc?.feedbackLine || '').trim();
        const normalizeNodeTypes = (value = null, limit = 4) => {
            if (typeof this.game.normalizeSanctumAgendaNodeTypes === 'function') {
                return this.game.normalizeSanctumAgendaNodeTypes(value, limit);
            }
            return Array.isArray(value)
                ? value.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, limit)
                : [];
        };
        const nodeTypeLabel = (nodeType = '') => {
            const catalog = {
                enemy: '战斗',
                elite: '精英',
                event: '事件',
                shop: '商路',
                trial: '试炼',
                forge: '锻炉',
                rest: '歇息',
                observatory: '观星',
                spirit_grotto: '灵契',
                forbidden_altar: '禁术',
                memory_rift: '裂隙'
            };
            return catalog[String(nodeType || '').trim()] || String(nodeType || '').trim();
        };
        const buildFocusLabel = (nodeTypes = []) => normalizeNodeTypes(nodeTypes)
            .map((nodeType) => nodeTypeLabel(nodeType))
            .join(' / ');
        const agendaNodeTypes = normalizeNodeTypes(signals.activeAgenda?.focusNodeTypes, 4);
        const agendaFocusLabel = buildFocusLabel(agendaNodeTypes);
        const baseCatalog = {
            training: {
                id: 'season_route_training',
                laneId: 'training',
                label: '观星采样线',
                nodeTypes: ['observatory', 'event', 'memory_rift'],
                weightShift: {
                    observatory: 0.012,
                    event: 0.01,
                    memory_rift: 0.012,
                    enemy: -0.01,
                    elite: -0.006
                },
                summaryLine: '观星 / 事件 / 裂隙节点会略多，方便继续补齐主练样本与谱系沉淀。',
                rewardLine: '下一章地图会轻度偏向观星 / 事件 / 裂隙，方便把当前主练继续压成稳定样本。'
            },
            expedition: {
                id: 'season_route_expedition',
                laneId: 'expedition',
                label: '押卷锁线',
                nodeTypes: ['event', 'observatory', 'memory_rift'],
                weightShift: {
                    event: 0.008,
                    observatory: 0.008,
                    memory_rift: 0.006,
                    shop: -0.004,
                    rest: -0.003
                },
                summaryLine: '事件 / 观星 / 裂隙节点会略多，方便尽快把本周答卷压成洞府承诺。',
                rewardLine: '下一章地图会轻度偏向事件 / 观星 / 裂隙，方便尽快把本周答卷锁进洞府承诺。'
            },
            verification: {
                id: 'season_route_verification',
                laneId: 'verification',
                label: '镜战试炼线',
                nodeTypes: ['trial', 'elite', 'enemy', 'forbidden_altar'],
                weightShift: {
                    trial: 0.012,
                    elite: 0.01,
                    enemy: 0.006,
                    forbidden_altar: 0.008,
                    rest: -0.008,
                    shop: -0.006
                },
                summaryLine: '试炼 / 精英 / 战斗 / 禁术节点会略多，方便继续补齐无尽压强与外场验算样本。',
                rewardLine: '下一章地图会轻度偏向试炼 / 精英 / 战斗 / 禁术，方便把当前主练送去高压环境验证。'
            }
        };
        let directive = baseCatalog[nextLaneId] || baseCatalog.training;
        if (nextLaneId === 'training') {
            const focusTitle = String(signals.selectedGuide?.title || '').trim();
            const focusTheme = String(signals.trainingFocus?.themeLabel || '').trim();
            if (focusTitle) {
                directive = {
                    ...directive,
                    label: `${focusTitle} 采样线`,
                    summaryLine: `观星 / 事件 / 裂隙节点会略多，方便继续围绕【${focusTitle}】补样本与训练留痕。`,
                    rewardLine: `下一章地图会轻度偏向观星 / 事件 / 裂隙，方便把【${focusTitle}】继续压成稳定主练。`
                };
            } else if (focusTheme) {
                directive = {
                    ...directive,
                    label: `${focusTheme} 校卷线`,
                    summaryLine: `观星 / 事件 / 裂隙节点会略多，方便继续围绕【${focusTheme}】补观测样本与训练答卷。`,
                    rewardLine: `下一章地图会轻度偏向观星 / 事件 / 裂隙，方便把【${focusTheme}】继续写回主练。`
                };
            }
        } else if (nextLaneId === 'expedition') {
            if (agendaNodeTypes.length > 0) {
                directive = {
                    ...directive,
                    id: 'season_route_lockline',
                    label: `${String(signals.activeAgenda?.selectedContractLabel || signals.activeAgenda?.name || '洞府锁线').trim() || '洞府锁线'}路线`,
                    nodeTypes: agendaNodeTypes,
                    weightShift: null,
                    summaryLine: `${agendaFocusLabel} 节点会继续被洞府承诺牵引，季盘会顺势把这条锁线压向结题。`,
                    rewardLine: `当前洞府承诺会继续牵引 ${agendaFocusLabel} 节点，下一章更适合沿锁线继续压卷。`
                };
            } else if (signals.latestSlate?.themeLabel) {
                directive = {
                    ...directive,
                    label: `${String(signals.latestSlate.themeLabel || '').trim()} 归卷线`
                };
            }
        } else if (nextLaneId === 'verification') {
            const focusPvp = Math.max(0, Math.floor(Number(signals.pvpSeasonMatchCount) || 0)) < 2;
            const focusEndless = Math.max(0, Math.floor(Number(signals.endlessClears) || 0)) < 1;
            if (focusPvp && !focusEndless) {
                directive = {
                    ...directive,
                    label: '天道榜验算线',
                    summaryLine: '试炼 / 精英 / 战斗 / 禁术节点会略多，方便把当前主练送去天道榜前继续补压强样本。',
                    rewardLine: '下一章地图会轻度偏向试炼 / 精英 / 战斗 / 禁术，方便先把 PVP 验算样本补齐。'
                };
            } else if (!focusPvp && focusEndless) {
                directive = {
                    ...directive,
                    label: '无尽验算线',
                    summaryLine: '试炼 / 精英 / 战斗 / 禁术节点会略多，方便把当前主练送去无尽轮回前继续补压强样本。',
                    rewardLine: '下一章地图会轻度偏向试炼 / 精英 / 战斗 / 禁术，方便先把无尽压强验算补齐。'
                };
            }
        }
        if (agendaNodeTypes.length > 0 && phaseId === 'ranking') {
            directive = {
                ...directive,
                weightShift: null,
                summaryLine: `${agendaFocusLabel} 节点仍由洞府承诺牵引；${directive.label} 只保留阶段提醒，不再额外改写地图权重。`,
                rewardLine: `当前洞府承诺会继续牵引 ${agendaFocusLabel} 节点；季盘本阶段只保留${directive.label}提醒，不再额外叠加地图偏置。`
            };
        }
        if (chapterArcFeedbackLine) {
            directive = {
                ...directive,
                summaryLine: [
                    chapterArcFeedbackLine,
                    directive.summaryLine || ''
                ].filter(Boolean).join(' '),
                rewardLine: [
                    chapterArcFeedbackLine,
                    directive.rewardLine || ''
                ].filter(Boolean).join(' ')
            };
        }
        if (chapterArcCarryover?.available) {
            directive = {
                ...directive,
                summaryLine: [
                    chapterArcCarryover.summaryLine || '',
                    directive.summaryLine || ''
                ].filter(Boolean).join(' '),
                rewardLine: [
                    chapterArcCarryover.guideLine || '',
                    directive.rewardLine || ''
                ].filter(Boolean).join(' ')
            };
        }
        const shift = directive.weightShift && typeof directive.weightShift === 'object'
            ? (typeof this.game.sanitizeSanctumAgendaWeightShift === 'function'
                ? this.game.sanitizeSanctumAgendaWeightShift(directive.weightShift)
                : { ...directive.weightShift })
            : null;
        return {
            ...directive,
            nodeTypes: normalizeNodeTypes(directive.nodeTypes, 4),
            weightShift: shift && Object.keys(shift).length > 0 ? shift : null
        };
    }

    getSeasonBoardSnapshot(options = {}) {
        const signals = this.getSeasonBoardSignalSnapshot(options);
        const phase = this.getSeasonBoardPhaseMeta(signals);
        const mandateTheme = typeof this.game.getHeavenlyMandateThemeMeta === 'function'
            ? this.game.getHeavenlyMandateThemeMeta(signals)
            : {
                id: phase.id,
                label: phase.label,
                icon: phase.icon,
                summaryLine: ''
            };
        const lineage = signals.lineage && typeof signals.lineage === 'object'
            ? signals.lineage
            : null;
        const aftereffects = signals.aftereffects && typeof signals.aftereffects === 'object'
            ? signals.aftereffects
            : null;
        const styleTrackCount = [
            lineage?.characterTrack?.dominantLabel,
            lineage?.styleTrack?.dominantLabel,
            lineage?.nodeTrack?.dominantLabel,
            lineage?.researchTrack?.dominantLabel
        ].filter(Boolean).length;
        const settlementState = this.buildSeasonBoardSettlementState(signals, phase);
        const settlement = settlementState?.settlement || null;
        const debtPack = settlementState?.debtPack || null;
        const verificationOrders = Array.isArray(settlementState?.verificationOrders)
            ? settlementState.verificationOrders
            : [];
        const trainingLane = {
            id: 'training',
            label: '训练线',
            icon: '🔭',
            summaryLine: signals.selectedGuide?.title
                ? `当前主练样本已锁到【${signals.selectedGuide.title}】，接下来要把谱系与周挑战结果继续压实。`
                : (signals.trainingFocus?.trainingAdvice
                    ? `当前已有主练建议，下一步要把这份建议继续压成稳定可复用的赛季样本。`
                    : '先锁定一份本周主练样本，再把训练建议与谱系沉淀写成长期主轴。'),
            tasks: [
                {
                    id: 'season_training_focus',
                    label: (signals.selectedGuide || signals.trainingFocus) ? '本周主练已锁定' : '锁定本周主练样本',
                    icon: '🔭',
                    progress: (signals.selectedGuide || signals.trainingFocus) ? 1 : 0,
                    target: 1,
                    hintLine: signals.selectedGuide
                        ? `当前精选命盘：${signals.selectedGuide.title} · ${signals.selectedGuide.themeLabel || '赛季样本'}`
                        : (signals.trainingFocus
                            ? `当前主练：${signals.trainingFocus.chapterName || '最近归卷'} · ${signals.trainingFocus.trainingAdvice || signals.trainingFocus.sourceTitle || '已给出训练建议'}`
                            : '去观星台锁一份精选命盘，或先补一局七日劫数拿到主练建议。'),
                    statusLine: signals.selectedGuide?.themeLabel || signals.trainingFocus?.themeLabel || '',
                    anchorSection: 'chapters'
                },
                {
                    id: 'season_lineage_anchor',
                    label: '命盘谱系沉淀 3 条主修轴',
                    icon: '🪞',
                    progress: Math.min(styleTrackCount, 3),
                    target: 3,
                    hintLine: lineage?.currentFocusLine
                        || lineage?.detailLine
                        || '继续积累角色、流派、节点与研究的长期留痕，把本周主练写成可复刻谱系。',
                    statusLine: lineage?.summaryLine || lineage?.styleTrack?.dominantLabel || '',
                    anchorSection: 'builds'
                }
            ]
        };
        const expeditionLane = {
            id: 'expedition',
            label: '远征线',
            icon: '🧭',
            summaryLine: signals.activeAgenda
                ? `当前正围绕【${signals.activeAgenda.name}】压卷，章节推进要继续沿 ${signals.activeAgenda.focusNodeLine || '主轴'} 走。`
                : (signals.latestSlate
                    ? `最近一张章节答卷已经写回赛季主轴，下一步要把它继续锁进洞府承诺与章节复盘。`
                    : '先推进一章远征留下第一张章节答卷，再决定这周真正要押哪条主线。'),
            tasks: [
                {
                    id: 'season_run_slate',
                    label: signals.latestSlate ? '本周章节答卷已入档' : '留下本周第一张章节答卷',
                    icon: '🧭',
                    progress: signals.latestSlate ? 1 : 0,
                    target: 1,
                    hintLine: signals.latestSlate
                        ? `最新归卷：${signals.latestSlate.chapterName || '章节'} · ${signals.latestSlate.endingName || '已收卷'}${signals.latestSlate.score ? ` · 评分 ${signals.latestSlate.score}` : ''}`
                        : '推进任意一章裂界远征，把本周主轴先写成第一张可复盘答卷。',
                    statusLine: signals.latestSlate?.ratingLabel || '',
                    anchorSection: 'slates'
                },
                {
                    id: 'season_commitment',
                    label: signals.activeAgenda
                        ? `推进 ${signals.activeAgenda.name}`
                        : (signals.lastAgenda ? `复核 ${signals.lastAgenda.name}` : '立下一道洞府锁线承诺'),
                    icon: '📜',
                    progress: signals.activeAgenda
                        ? Math.max(0, Math.floor(Number(signals.activeAgenda.progress) || 0))
                        : (signals.lastAgenda?.outcome === 'success' ? 1 : 0),
                    target: signals.activeAgenda
                        ? Math.max(1, Math.floor(Number(signals.activeAgenda.target) || 1))
                        : 1,
                    hintLine: signals.activeAgenda
                        ? (signals.activeAgenda.phaseLine || signals.activeAgenda.focusNodeLine || signals.activeAgenda.summaryLine || '本轮承诺正在推进。')
                        : (signals.lastAgenda
                            ? (signals.lastAgenda.recoveryLine || signals.lastAgenda.grantedLine || signals.lastAgenda.reasonLine || '上一道洞府承诺已经留下结题结果。')
                            : '从归卷书架挑一份答卷设为本周承诺，让赛季主轴真正锁进章节推进。'),
                    statusLine: signals.activeAgenda?.phaseLabel || signals.lastAgenda?.outcomeLabel || '',
                    anchorSection: 'sanctum'
                }
            ]
        };
        const crossModeSummary = [
            signals.endlessSeason
                ? `无尽 ${Math.max(0, Math.floor(Number(signals.endlessClears) || 0))} 轮`
                : '',
            signals.pvpSeasonName
                ? `天道榜 ${Math.max(0, Math.floor(Number(signals.pvpSeasonMatchCount) || 0))} 场`
                : '',
            aftereffects?.currentStatusLine || ''
        ].filter(Boolean).join(' · ');
        const seasonVerificationLaneTasks = [
            {
                id: 'season_endless_clear',
                label: '无尽轮回通关 1 轮',
                icon: '∞',
                progress: Math.min(Math.max(0, Math.floor(Number(signals.endlessClears) || 0)), 1),
                target: 1,
                hintLine: signals.endlessSeason
                    ? `${signals.endlessSeason.name || '当前赛季'} · 已清 ${Math.max(0, Math.floor(Number(signals.endlessClears) || 0))} 轮${signals.endlessScore ? ` · 积分 ${Math.max(0, Math.floor(Number(signals.endlessScore) || 0))}` : ''}`
                    : '进入无尽轮回后，会开始记录这周主轴在高压环境下是否还能成立。',
                statusLine: signals.endlessSeason?.directiveName || '',
                anchorSection: 'endless'
            },
            {
                id: 'season_pvp_ledger',
                label: '天道榜留下 2 场账本',
                icon: '⚔️',
                progress: Math.min(Math.max(0, Math.floor(Number(signals.pvpSeasonMatchCount) || 0)), 2),
                target: 2,
                hintLine: signals.pvpSeasonName
                    ? `${signals.pvpSeasonName} · 已记 ${Math.max(0, Math.floor(Number(signals.pvpSeasonMatchCount) || 0))} 场${signals.pvpRecentOpponentName ? ` · 最近对手 ${signals.pvpRecentOpponentName}` : ''}`
                    : 'PVP 账本会记录本周真实对局，至少打一场先建立赛季外场样本。',
                statusLine: aftereffects?.currentStatusLine || signals.pvpSeasonName || '',
                anchorSection: 'pvp'
            }
        ];
        const seasonDebtFocusTask = typeof this.game.buildHeavenlyMandateDebtFocusTask === 'function'
            ? this.game.buildHeavenlyMandateDebtFocusTask(debtPack)
            : null;
        if (seasonDebtFocusTask) {
            let replaceIndex = seasonVerificationLaneTasks.findIndex((task) => (
                String(task?.anchorSection || '').trim() === seasonDebtFocusTask.anchorSection
            ));
            if (replaceIndex < 0) {
                replaceIndex = seasonVerificationLaneTasks.findIndex((task) => !task?.completed);
            }
            if (replaceIndex < 0) replaceIndex = 0;
            seasonVerificationLaneTasks[replaceIndex] = {
                ...(seasonVerificationLaneTasks[replaceIndex] || {}),
                ...seasonDebtFocusTask,
                id: seasonDebtFocusTask.id,
                label: seasonDebtFocusTask.label,
                icon: seasonDebtFocusTask.icon,
                progress: seasonDebtFocusTask.progress,
                target: seasonDebtFocusTask.target,
                completed: seasonDebtFocusTask.completed,
                progressText: seasonDebtFocusTask.progressText,
                hintLine: seasonDebtFocusTask.hintLine,
                statusLine: seasonDebtFocusTask.statusLine,
                anchorSection: seasonDebtFocusTask.anchorSection,
                actionType: seasonDebtFocusTask.actionType,
                actionValue: seasonDebtFocusTask.actionValue,
                ctaLabel: seasonDebtFocusTask.ctaLabel,
                source: seasonDebtFocusTask.source,
                sourceId: seasonDebtFocusTask.sourceId,
                isPlaceholder: seasonDebtFocusTask.isPlaceholder,
                occupiesStrongSlot: seasonDebtFocusTask.occupiesStrongSlot
            };
        }
        const verificationLane = {
            id: 'verification',
            label: '验算线',
            icon: '🏁',
            summaryLine: [
                seasonDebtFocusTask
                    ? (debtPack?.status === 'deferred'
                        ? '跨周欠卷已经进入验算线强目标，先清账再恢复常规定榜。'
                        : '本周欠卷已经进入验算线强目标，清账验证优先于普通高压补样。')
                    : '',
                crossModeSummary
                    ? `本周已经开始做跨模验算：${crossModeSummary}。`
                    : '用无尽轮回、天道榜与长期后效去确认这周主练不是只在单章里成立的错觉。'
            ].filter(Boolean).join('｜'),
            tasks: seasonVerificationLaneTasks
        };
        const lanes = [trainingLane, expeditionLane, verificationLane]
            .map((lane, index) => this.game.normalizeHeavenlyMandateLane(lane, index));
        const completedTaskCount = lanes.reduce((sum, lane) => sum + lane.completedCount, 0);
        const totalTaskCount = lanes.reduce((sum, lane) => sum + lane.totalCount, 0);
        const themeId = String(
            signals.selectedGuide?.themeKey
            || signals.trainingFocus?.themeKey
            || signals.activeAgenda?.themeKey
            || signals.latestSlate?.themeKey
            || lineage?.styleTrack?.dominantId
            || mandateTheme.id
            || phase.id
        ).trim() || phase.id;
        const themeLabel = String(
            signals.selectedGuide?.themeLabel
            || signals.trainingFocus?.themeLabel
            || signals.activeAgenda?.themeLabel
            || signals.latestSlate?.themeLabel
            || lineage?.styleTrack?.dominantLabel
            || mandateTheme.label
            || '本周主轴'
        ).trim() || '本周主轴';
        const seasonSource = signals.endlessSeason?.id && signals.pvpSeason?.id
            ? 'hybrid'
            : signals.endlessSeason?.id
                ? 'endless'
                : signals.pvpSeason?.id
                    ? 'pvp'
                    : 'weekly';
        const seasonName = seasonSource === 'hybrid'
            && signals.endlessSeason?.name
            && signals.pvpSeasonName
            && signals.endlessSeason.name !== signals.pvpSeasonName
            ? `${signals.endlessSeason.name} / ${signals.pvpSeasonName}`
            : (signals.endlessSeason?.name
                || signals.pvpSeasonName
                || `${signals.weekLabel || signals.weekTag || '本周轮转'} · 赛季天道盘`);
        const committedFrontierResolution = typeof this.getCommittedSeasonBoardFrontierResolution === 'function'
            ? this.getCommittedSeasonBoardFrontierResolution({
                weekTag: signals.weekTag,
                weekLabel: signals.weekLabel
            })
            : null;
        const weekVerdictLedger = this.normalizeSeasonBoardWeekVerdictLedger({
            current: {
                ledgerId: `season_verdict_${signals.weekTag || 'current'}_${settlement?.outcomeId || phase.id}_${settlement?.sourceRunId || debtPack?.id || 'current'}`,
                weekTag: signals.weekTag,
                weekLabel: signals.weekLabel,
                phaseId: phase.id,
                phaseLabel: phase.label,
                sourceRunId: settlement?.sourceRunId || debtPack?.sourceRunId || signals.latestSlate?.id || '',
                chapterIndex: settlement?.chapterIndex || debtPack?.chapterIndex || 0,
                settlementId: settlement?.id || '',
                settlementOutcomeId: settlement?.outcomeId || '',
                settlementOutcomeLabel: settlement?.outcomeLabel || '',
                debtPackId: debtPack?.id || '',
                debtStatus: debtPack?.status || '',
                deferCount: debtPack?.deferCount || 0,
                carryIntoWeekTag: debtPack?.carryIntoWeekTag || '',
                primaryVerificationOrderId: verificationOrders[0]?.id || '',
                sideVerificationOrderId: verificationOrders[1]?.id || '',
                resolutionTier: settlement?.resolutionTier || '',
                resolvedStatus: settlement?.resolvedStatus || debtPack?.resolvedStatus || '',
                primaryVerificationResultStatus: verificationOrders[0]?.resultStatus || '',
                sideVerificationResultStatus: verificationOrders[1]?.resultStatus || '',
                primaryWritebackMode: verificationOrders[0]?.writebackMode || '',
                sideWritebackMode: verificationOrders[1]?.writebackMode || '',
                writebackLine: settlement?.writebackLine || debtPack?.writebackLine || verificationOrders[0]?.writebackLine || verificationOrders[1]?.writebackLine || '',
                proofQuality: settlement?.proofQuality || verificationOrders[0]?.proofQuality || verificationOrders[1]?.proofQuality || '',
                lineageStyle: settlement?.lineageStyle || verificationOrders[0]?.lineageStyle || verificationOrders[1]?.lineageStyle || '',
                carryIntoNextWeek: !!verificationOrders[0]?.carryIntoNextWeek || !!verificationOrders[1]?.carryIntoNextWeek,
                settlementSource: settlement?.settlementSource || seasonSource || 'derived',
                summaryLine: debtPack?.summaryLine || settlement?.summaryLine || '',
                ...(committedFrontierResolution || {})
            }
        });
        const verificationArchive = this.game.buildSeasonVerificationArchiveSnapshot({
            seasonVerification: signals.seasonVerification,
            phase,
            settlement,
            debtPack,
            weekVerdictLedger,
            verificationOrders,
            weekTag: signals.weekTag,
            weekLabel: signals.weekLabel
        });
        const board = this.normalizeSeasonBoardSnapshot({
            seasonId: String(signals.endlessSeason?.id || signals.pvpSeason?.id || `season_board:${signals.weekTag || 'current'}`),
            seasonLabel: signals.endlessSeason?.name || signals.pvpSeasonName || '赛季天道盘',
            seasonName,
            seasonIcon: signals.endlessSeason?.icon || phase.icon || mandateTheme.icon || '🜂',
            seasonSource,
            weekTag: signals.weekTag,
            weekLabel: signals.weekLabel,
            phaseId: phase.id,
            phaseLabel: phase.label,
            phaseIcon: phase.icon,
            themeId,
            themeLabel,
            summaryLine: `赛季天道盘当前围绕【${themeLabel}】展开，已进入「${phase.label}」。${settlement?.outcomeLabel ? ` 当前押卷：${settlement.outcomeLabel}。` : ''}`,
            detailLine: [
                mandateTheme.label ? `轮转题面：${mandateTheme.label}` : '',
                settlement?.detailLine || '',
                debtPack?.summaryLine || '',
                signals.latestSlate?.ratingLabel ? `最近答卷：${signals.latestSlate.ratingLabel}` : '',
                signals.activeAgenda?.selectedContractLabel ? `锁线契约：${signals.activeAgenda.selectedContractLabel}` : '',
                aftereffects?.currentStatusLine ? `后效：${aftereffects.currentStatusLine}` : ''
            ].filter(Boolean).slice(0, 2).join('｜'),
            guideLine: [
                settlement?.guideLine || '',
                verificationOrders[0]?.summaryLine || ''
            ].filter(Boolean).join(' · '),
            statusLine: [
                phase.label,
                settlement?.outcomeLabel ? `当前押卷 ${settlement.outcomeLabel}` : '',
                debtPack?.progressText || verificationOrders[0]?.statusLine || ''
            ].filter(Boolean).join(' · '),
            rewardLine: [
                settlement?.summaryLine || '',
                debtPack?.guideLine || verificationOrders[0]?.summaryLine || ''
            ].filter(Boolean).join(' '),
            crossModeSummary,
            completedTaskCount,
            totalTaskCount,
            settlement,
            debtPack,
            weekVerdictLedger,
            verificationArchive,
            verificationOrders,
            lanes
        });
        const routeDirective = this.buildSeasonBoardRouteDirective({
            board,
            signals
        });
        if (!routeDirective) return board;
        return this.normalizeSeasonBoardSnapshot({
            ...board,
            guideLine: [
                board.guideLine,
                routeDirective.summaryLine ? `路线引导：${routeDirective.summaryLine}` : ''
            ].filter(Boolean).join(' '),
            rewardLine: [
                board.rewardLine,
                routeDirective.rewardLine || ''
            ].filter(Boolean).join(' ')
        });
    }

    getSeasonBoardWeightShift(options = {}) {
        const board = this.getSeasonBoardSnapshot(options);
        const signals = this.getSeasonBoardSignalSnapshot(options);
        const directive = this.buildSeasonBoardRouteDirective({
            board,
            signals
        });
        const shift = directive?.weightShift && typeof directive.weightShift === 'object'
            ? (typeof this.game.sanitizeSanctumAgendaWeightShift === 'function'
                ? this.game.sanitizeSanctumAgendaWeightShift(directive.weightShift)
                : { ...directive.weightShift })
            : null;
        return shift && Object.keys(shift).length > 0 ? shift : null;
    }


}

if (typeof window !== 'undefined') {
    window.SeasonBoardManager = SeasonBoardManager;
}
