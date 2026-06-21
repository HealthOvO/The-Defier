const { RULE_VERSION, RULES, getCardDefinition } = require('./rules');
const { cloneLoadoutSnapshot, normalizeLoadoutSnapshot, publicLoadoutSummary } = require('../loadout');
const { buildLoadoutExplorationReport } = require('../content/pvp-live-v1-content');

function cloneDeep(value) {
    return JSON.parse(JSON.stringify(value));
}

function createCardInstance(seatId, cardId, ordinal) {
    const definition = getCardDefinition(cardId);
    if (!definition) {
        throw new Error(`Unknown live PVP card: ${cardId}`);
    }
    return {
        instanceId: `${seatId}-${cardId.replace(/^pvp_/, '')}-${ordinal}`,
        cardId,
        name: definition.name,
        cost: definition.cost,
        damage: definition.damage || 0,
        block: definition.block || 0,
        heal: definition.heal || 0
    };
}

function makeLoadoutCardInstances(seatId, loadoutSnapshot) {
    const counts = {};
    return loadoutSnapshot.deck.map(entry => {
        const cardId = entry && entry.id;
        counts[cardId] = (counts[cardId] || 0) + 1;
        return createCardInstance(seatId, cardId, counts[cardId]);
    });
}

function normalizeSeat(rawSeat, fallbackSeatId) {
    const seatId = rawSeat && typeof rawSeat.seatId === 'string' ? rawSeat.seatId : fallbackSeatId;
    if (seatId !== 'A' && seatId !== 'B') {
        throw new Error(`Invalid live PVP seat id: ${seatId}`);
    }
    const loadoutSnapshot = rawSeat && rawSeat.loadoutSnapshot
        ? cloneLoadoutSnapshot(rawSeat.loadoutSnapshot)
        : normalizeLoadoutSnapshot(rawSeat && rawSeat.loadout, { now: () => Date.now(), ruleVersion: RULE_VERSION });
    const cards = makeLoadoutCardInstances(seatId, loadoutSnapshot);
    return {
        seatId,
        userId: rawSeat && typeof rawSeat.userId === 'string' ? rawSeat.userId : seatId,
        displayName: rawSeat && typeof rawSeat.displayName === 'string' ? rawSeat.displayName.slice(0, 40) : seatId,
        loadoutSnapshot,
        hp: RULES.startingHp,
        maxHp: RULES.startingHp,
        energy: RULES.startingEnergy,
        maxEnergy: RULES.startingEnergy,
        block: 0,
        actionsTaken: 0,
        turnsTaken: 0,
        openingCounterplayPending: false,
        openingCounterplayGranted: false,
        playedSetupThisTurn: false,
        effectiveActionThisTurn: false,
        setupConvertedThisTurn: false,
        longGameStats: {
            hpDamageDealt: 0,
            preventedOrRecoveredDamage: 0,
            publicSetupConversions: 0,
            resourceEfficientTurns: 0,
            budgetPenaltyCount: 0,
            automationCount: 0
        },
        ready: false,
        readyAt: 0,
        mulliganUsed: false,
        hand: cards.slice(0, RULES.startingHandSize),
        deck: cards.slice(RULES.startingHandSize),
        discard: [],
        publicStatuses: []
    };
}

function normalizeOpenerAssignment(source = {}, firstSeat = 'A') {
    const resolvedFirstSeat = firstSeat === 'B' || source.firstSeat === 'B' ? 'B' : 'A';
    const secondSeat = resolvedFirstSeat === 'A' ? 'B' : 'A';
    return {
        reportVersion: 'pvp-live-opener-assignment-v1',
        sourceVisibility: String(source.sourceVisibility || 'server_authoritative_public_seed'),
        usesHiddenInformation: false,
        rankedImpact: 'none',
        firstSeat: resolvedFirstSeat,
        secondSeat,
        policy: String(source.policy || 'server_seeded_fair_opener'),
        seedTag: String(source.seedTag || '').slice(0, 24),
        queueOrderBinding: false,
        hostBinding: false,
        boundaryLine: String(source.boundaryLine || '先后手由服务端公开种子分配，不绑定排队顺序或房主身份。')
    };
}

function makeSnapshotLockedEvent(matchId, seats) {
    return {
        eventId: `${matchId}-evt-1`,
        sequence: 1,
        eventType: 'snapshot_locked',
        matchId,
        actingSeat: null,
        visibility: 'public',
        payload: {
            ruleVersion: RULE_VERSION,
            seats: {
                A: publicLoadoutSummary(seats.A.loadoutSnapshot),
                B: publicLoadoutSummary(seats.B.loadoutSnapshot)
            }
        }
    };
}

function normalizeMatchQuality(input = {}) {
    const waitMs = input.waitMs && typeof input.waitMs === 'object' ? input.waitMs : {};
    const safeguards = Array.isArray(input.safeguards) && input.safeguards.length > 0
        ? input.safeguards
        : ['server_authoritative', 'snapshot_locked', 'setup_ready_required', 'first_action_budget'];
    const connectionHealthSummary = input.connectionHealthSummary && typeof input.connectionHealthSummary === 'object'
        ? {
            reportVersion: String(input.connectionHealthSummary.reportVersion || 'pvp-live-queue-connection-health-v1'),
            status: String(input.connectionHealthSummary.status || input.connectionHealth || 'not_measured'),
            sampleTag: String(input.connectionHealthSummary.sampleTag || '')
        }
        : null;
    return {
        reportVersion: 'pvp-live-match-quality-v1',
        tag: input.tag === 'expanded' || input.tag === 'wide_but_accepted' || input.tag === 'rejected' ? input.tag : 'good',
        ruleVersion: RULE_VERSION,
        seasonId: typeof input.seasonId === 'string' && input.seasonId ? input.seasonId : 'mvp-local',
        matchedAt: Math.max(0, Math.floor(Number(input.matchedAt) || Date.now())),
        expansionStage: typeof input.expansionStage === 'string' && input.expansionStage ? input.expansionStage : 'mvp_open_pool',
        ratingDeltaBucket: typeof input.ratingDeltaBucket === 'string' && input.ratingDeltaBucket ? input.ratingDeltaBucket : 'unrated_mvp',
        waitMs: {
            A: Math.max(0, Math.floor(Number(waitMs.A) || 0)),
            B: Math.max(0, Math.floor(Number(waitMs.B) || 0))
        },
        candidatePoolSize: Math.max(1, Math.floor(Number(input.candidatePoolSize) || 2)),
        connectionHealth: typeof input.connectionHealth === 'string' && input.connectionHealth ? input.connectionHealth : 'not_measured',
        connectionHealthSummary,
        wideMatchReason: typeof input.wideMatchReason === 'string' ? input.wideMatchReason : '',
        safeguards: safeguards.map(item => String(item || '')).filter(Boolean).slice(0, 10)
    };
}

function normalizeMode(mode) {
    return mode === 'friendly' ? 'friendly' : 'ranked';
}

function normalizeFriendlySeries(input = null) {
    if (!input || typeof input !== 'object') return null;
    const sourceMatchId = typeof input.sourceMatchId === 'string' ? input.sourceMatchId.trim() : '';
    const seriesId = typeof input.seriesId === 'string' ? input.seriesId.trim() : '';
    if (!sourceMatchId || !seriesId) return null;
    const safeguards = Array.isArray(input.safeguards) ? input.safeguards : [];
    const sourceParticipants = input.sourceParticipants && typeof input.sourceParticipants === 'object' ? input.sourceParticipants : {};
    const scoreBySourceSeat = input.scoreBySourceSeat && typeof input.scoreBySourceSeat === 'object' ? input.scoreBySourceSeat : {};
    const targetWins = Math.max(2, Math.min(5, Math.floor(Number(input.targetWins) || 2)));
    const maxRounds = Math.max(1, targetWins * 2 - 1);
    const score = {
        A: Math.max(0, Math.floor(Number(scoreBySourceSeat.A) || 0)),
        B: Math.max(0, Math.floor(Number(scoreBySourceSeat.B) || 0))
    };
    const winnerSourceSeat = input.winnerSourceSeat === 'A' || input.winnerSourceSeat === 'B'
        ? input.winnerSourceSeat
        : score.A >= targetWins && score.A > score.B ? 'A' : score.B >= targetWins && score.B > score.A ? 'B' : '';
    const seriesStatus = winnerSourceSeat ? 'complete' : 'ongoing';
    const normalizedSafeguards = (safeguards.length > 0
        ? safeguards
        : ['both_participants_confirmed', 'friendly_no_ranked_impact', 'seat_rotation', 'loadout_change_allowed'])
        .map(item => String(item || '')).filter(Boolean);
    if (!normalizedSafeguards.includes('alternating_opener')) normalizedSafeguards.push('alternating_opener');
    return {
        reportVersion: 'pvp-live-friendly-series-v1',
        sourceMatchId,
        originMatchId: typeof input.originMatchId === 'string' && input.originMatchId.trim() ? input.originMatchId.trim() : sourceMatchId,
        seriesId,
        status: input.status === 'matched' || input.status === 'finished' ? input.status : 'waiting_rematch',
        format: typeof input.format === 'string' && input.format ? input.format : 'bo3_mvp',
        targetWins,
        maxRounds,
        roundIndex: Math.max(1, Math.min(maxRounds, Math.floor(Number(input.roundIndex) || 2))),
        roundLabel: typeof input.roundLabel === 'string' && input.roundLabel ? input.roundLabel : 'Bo3 第 2 局 · 换边再战',
        seriesStatus,
        scoreBySourceSeat: score,
        sourceParticipants: {
            A: {
                sourceSeat: 'A',
                userId: String(sourceParticipants.A && sourceParticipants.A.userId || ''),
                displayName: String(sourceParticipants.A && (sourceParticipants.A.displayName || sourceParticipants.A.userId) || 'A').slice(0, 40)
            },
            B: {
                sourceSeat: 'B',
                userId: String(sourceParticipants.B && sourceParticipants.B.userId || ''),
                displayName: String(sourceParticipants.B && (sourceParticipants.B.displayName || sourceParticipants.B.userId) || 'B').slice(0, 40)
            }
        },
        leaderSourceSeat: input.leaderSourceSeat === 'A' || input.leaderSourceSeat === 'B'
            ? input.leaderSourceSeat
            : score.A === score.B ? '' : score.A > score.B ? 'A' : 'B',
        winnerSourceSeat,
        canRequestNextRound: !!input.canRequestNextRound && !winnerSourceSeat && score.A + score.B < maxRounds,
        rankedImpact: 'none',
        formalResultPolicy: 'practice_only',
        seatPolicy: 'swap_sides',
        openerPolicy: String(input.openerPolicy || 'friendly_series_rotating_opener'),
        openingFirstSourceSeat: input.openingFirstSourceSeat === 'B' ? 'B' : 'A',
        roundFirstSourceSeat: input.roundFirstSourceSeat === 'B' ? 'B' : 'A',
        loadoutPolicy: 'per_game_change_allowed',
        confirmationCount: Math.max(1, Math.min(2, Math.floor(Number(input.confirmationCount) || 1))),
        createdAt: Math.max(0, Math.floor(Number(input.createdAt) || Date.now())),
        safeguards: normalizedSafeguards.slice(0, 8),
        lastRecordedMatchId: String(input.lastRecordedMatchId || '')
    };
}

function createFirstMatchGuide({ mode = 'ranked' } = {}) {
    const safeMode = normalizeMode(mode);
    const friendly = safeMode === 'friendly';
    return {
        reportVersion: 'pvp-live-first-match-guide-v1',
        audience: 'both_players',
        title: friendly ? '友谊再战简报' : '首战简报',
        summary: friendly
            ? '低压力换边再战，双方可换谱测试；本局不写正式积分。'
            : '先确认斗法谱，再调息准备；开局保护会防止未行动方被直接终结。',
        nextActionByStatus: {
            setup: '先调息手牌，确认准备后再开战。',
            active: '按当前行动席位出牌，留意权威事件。',
            finished: friendly ? '友谊局已结束，可复盘或回到真人排位。' : '对局已结束，查看结算后可重新排队。',
            invalidated: '本局未开战成功，不计正式积分，可重新匹配。'
        },
        safeguards: [
            'server_authoritative',
            'snapshot_locked',
            'setup_ready_required',
            'opening_protection',
            'invalidated_no_score',
            ...(friendly ? ['friendly_no_ranked_impact'] : [])
        ],
        steps: [
            {
                id: 'mode_boundary',
                label: '模式',
                detail: friendly
                    ? '友谊再战只面向本局双方，换边测试，不写正式积分。'
                    : '真人排位只匹配真实在线玩家，不接旧残影或客户端胜负回执。'
            },
            {
                id: 'snapshot_locked',
                label: '锁谱',
                detail: '入队后斗法谱由服务端锁定，本局不能中途改谱。'
            },
            {
                id: 'setup_ready',
                label: '调息',
                detail: '准备阶段可调息 0-2 张手牌，双方确认准备后才开战。'
            },
            {
                id: 'opening_protection',
                label: '护体',
                detail: '未获得行动回合的一方不会被开局伤害直接终结。'
            },
            {
                id: 'invalidated_no_score',
                label: '无效局',
                detail: '准备超时会成为无效局，不写正式积分。'
            }
        ],
        recommendedLoadouts: [
            {
                id: 'balanced',
                label: '默认斗法谱',
                role: '攻防均衡，适合首战熟悉流程。',
                weakness: '弱点：缺少极限爆发，需要看准时机交出破阵。'
            },
            {
                id: 'sword',
                label: '破阵斗法谱',
                role: '更容易制造压力，适合主动试探。',
                weakness: '弱点：防守窗口较窄，连续进攻失败后容易被反打。'
            },
            {
                id: 'shield',
                label: '守势斗法谱',
                role: '前两手更稳，适合先观察对方节奏。',
                weakness: '弱点：收束较慢，需要把护盾转成反击。'
            }
        ],
        exceptionBranches: [
            {
                id: 'no_real_player_120s',
                label: '120 秒无真人',
                detail: '可以继续等待，也可以取消匹配；不会自动切到残影。'
            },
            {
                id: 'wide_match',
                label: '宽跨度匹配',
                detail: '会显示脱敏匹配质量，不展示隐藏评分。'
            },
            {
                id: 'disconnect_after_match',
                label: '匹配后断线',
                detail: '可用当前对局恢复入口找回权威局面。'
            },
            {
                id: 'ready_timeout',
                label: '准备超时',
                detail: '本局未开战成功，不写正式积分。'
            },
            {
                id: 'refresh_required',
                label: '需要同步',
                detail: '刷新权威局面后再继续行动。'
            }
        ],
        reviewActions: [
            {
                id: 'review_events',
                label: '查看权威事件'
            },
            {
                id: 'adjust_loadout',
                label: '调整斗法谱'
            },
            {
                id: 'queue_again',
                label: friendly ? '回到真人排位' : '继续真人排位'
            }
        ]
    };
}

function createInitialLiveState({ matchId, seats, matchQuality, mode = 'ranked', friendlySeries = null, firstSeat = 'A', openerAssignment = null } = {}) {
    if (!matchId || typeof matchId !== 'string') {
        throw new Error('createInitialLiveState requires a matchId');
    }
    if (!Array.isArray(seats) || seats.length !== 2) {
        throw new Error('createInitialLiveState requires exactly two seats');
    }

    const normalizedSeats = {
        A: normalizeSeat(seats.find(seat => seat && seat.seatId === 'A') || seats[0], 'A'),
        B: normalizeSeat(seats.find(seat => seat && seat.seatId === 'B') || seats[1], 'B')
    };

    const now = Date.now();
    const safeMode = normalizeMode(mode);
    const openingFirstSeat = openerAssignment && openerAssignment.firstSeat === 'B' ? 'B' : firstSeat === 'B' ? 'B' : 'A';
    return {
        matchId,
        ruleVersion: RULE_VERSION,
        mode: safeMode,
        status: 'setup',
        phase: 'setup',
        stateVersion: 1,
        eventSeq: 1,
        roundIndex: 1,
        turnIndex: 1,
        currentSeat: openingFirstSeat,
        setup: {
            startedAt: now,
            readyDeadlineAt: now + RULES.setupReadyTimeoutMs,
            firstSeat: openingFirstSeat,
            mulliganLimit: 2
        },
        seats: normalizedSeats,
        matchQuality: normalizeMatchQuality(matchQuality),
        openerAssignment: normalizeOpenerAssignment(openerAssignment || {}, openingFirstSeat),
        friendlySeries: safeMode === 'friendly' ? normalizeFriendlySeries(friendlySeries) : null,
        firstMatchGuide: createFirstMatchGuide({ mode: safeMode }),
        loadoutExplorationReport: buildLoadoutExplorationReport(),
        social: {
            emotesBySeat: {
                A: { lastSentAt: 0, count: 0 },
                B: { lastSentAt: 0, count: 0 }
            }
        },
        events: [makeSnapshotLockedEvent(matchId, normalizedSeats)],
        processedIntents: {}
    };
}

function cloneState(state) {
    return cloneDeep(state);
}

module.exports = {
    createInitialLiveState,
    cloneState
};
