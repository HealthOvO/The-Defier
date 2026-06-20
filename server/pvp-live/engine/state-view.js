const { cloneLoadoutSnapshot, publicLoadoutSummary } = require('../loadout');
const { RULES, getCardDefinition } = require('./rules');

function publicCard(card) {
    return {
        instanceId: card.instanceId,
        cardId: card.cardId,
        name: card.name,
        cost: card.cost,
        damage: card.damage || 0,
        block: card.block || 0
    };
}

function projectPublicSeat(seat) {
    return {
        seatId: seat.seatId,
        userId: seat.userId,
        displayName: seat.displayName,
        loadoutHash: seat.loadoutSnapshot && seat.loadoutSnapshot.loadoutHash || '',
        loadoutSummary: publicLoadoutSummary(seat.loadoutSnapshot),
        hp: seat.hp,
        maxHp: seat.maxHp,
        energy: seat.energy,
        maxEnergy: seat.maxEnergy,
        block: seat.block,
        ready: !!seat.ready,
        mulliganUsed: !!seat.mulliganUsed,
        handCount: seat.hand.length,
        deckCount: seat.deck.length,
        discardCount: seat.discard.length,
        publicStatuses: seat.publicStatuses.slice()
    };
}

function projectSelfSeat(seat) {
    return {
        ...projectPublicSeat(seat),
        loadoutSnapshot: cloneLoadoutSnapshot(seat.loadoutSnapshot),
        hand: seat.hand.map(publicCard),
        discard: seat.discard.map(publicCard)
    };
}

function projectMatchQuality(matchQuality) {
    const report = matchQuality && typeof matchQuality === 'object' ? matchQuality : {};
    const waitMs = report.waitMs && typeof report.waitMs === 'object' ? report.waitMs : {};
    const connectionHealthSummary = report.connectionHealthSummary && typeof report.connectionHealthSummary === 'object'
        ? {
            reportVersion: String(report.connectionHealthSummary.reportVersion || 'pvp-live-queue-connection-health-v1'),
            status: String(report.connectionHealthSummary.status || report.connectionHealth || 'not_measured'),
            sampleTag: String(report.connectionHealthSummary.sampleTag || '')
        }
        : null;
    return {
        reportVersion: String(report.reportVersion || 'pvp-live-match-quality-v1'),
        tag: String(report.tag || 'good'),
        ruleVersion: String(report.ruleVersion || ''),
        seasonId: String(report.seasonId || 'mvp-local'),
        matchedAt: Math.max(0, Math.floor(Number(report.matchedAt) || 0)),
        expansionStage: String(report.expansionStage || 'mvp_open_pool'),
        ratingDeltaBucket: String(report.ratingDeltaBucket || 'unrated_mvp'),
        waitMs: {
            A: Math.max(0, Math.floor(Number(waitMs.A) || 0)),
            B: Math.max(0, Math.floor(Number(waitMs.B) || 0))
        },
        candidatePoolSize: Math.max(1, Math.floor(Number(report.candidatePoolSize) || 1)),
        connectionHealth: String(report.connectionHealth || 'not_measured'),
        connectionHealthSummary,
        wideMatchReason: String(report.wideMatchReason || ''),
        safeguards: Array.isArray(report.safeguards) ? report.safeguards.map(item => String(item || '')).filter(Boolean).slice(0, 10) : []
    };
}

function projectFirstMatchGuide(firstMatchGuide, status = 'setup') {
    const report = firstMatchGuide && typeof firstMatchGuide === 'object' ? firstMatchGuide : {};
    const nextActionByStatus = report.nextActionByStatus && typeof report.nextActionByStatus === 'object'
        ? report.nextActionByStatus
        : {};
    const currentStatus = String(status || 'setup');
    const steps = Array.isArray(report.steps) ? report.steps : [];
    const recommendedLoadouts = Array.isArray(report.recommendedLoadouts) ? report.recommendedLoadouts : [];
    const exceptionBranches = Array.isArray(report.exceptionBranches) ? report.exceptionBranches : [];
    const reviewActions = Array.isArray(report.reviewActions) ? report.reviewActions : [];
    return {
        reportVersion: String(report.reportVersion || 'pvp-live-first-match-guide-v1'),
        audience: String(report.audience || 'both_players'),
        title: String(report.title || '首战简报'),
        summary: String(report.summary || '先确认斗法谱，再调息准备。'),
        nextAction: String(nextActionByStatus[currentStatus] || nextActionByStatus.setup || '先调息手牌，确认准备后再开战。'),
        safeguards: Array.isArray(report.safeguards) ? report.safeguards.map(item => String(item || '')).filter(Boolean).slice(0, 8) : [],
        steps: steps.slice(0, 6).map(step => ({
            id: String(step && step.id || ''),
            label: String(step && step.label || ''),
            detail: String(step && step.detail || '')
        })).filter(step => step.id && step.label && step.detail),
        recommendedLoadouts: recommendedLoadouts.slice(0, 3).map(item => ({
            id: String(item && item.id || ''),
            label: String(item && item.label || ''),
            role: String(item && item.role || ''),
            weakness: String(item && item.weakness || '')
        })).filter(item => item.id && item.label && item.role && item.weakness),
        exceptionBranches: exceptionBranches.slice(0, 6).map(item => ({
            id: String(item && item.id || ''),
            label: String(item && item.label || ''),
            detail: String(item && item.detail || '')
        })).filter(item => item.id && item.label && item.detail),
        reviewActions: reviewActions.slice(0, 6).map(item => ({
            id: String(item && item.id || ''),
            label: String(item && item.label || '')
        })).filter(item => item.id && item.label)
    };
}

function projectLoadoutExplorationReport(loadoutExplorationReport) {
    const report = loadoutExplorationReport && typeof loadoutExplorationReport === 'object' ? loadoutExplorationReport : {};
    const profiles = Array.isArray(report.profiles) ? report.profiles : [];
    return {
        reportVersion: String(report.reportVersion || 'pvp-live-loadout-exploration-v1'),
        contentPackVersion: String(report.contentPackVersion || ''),
        sourceVisibility: String(report.sourceVisibility || 'public_content'),
        usesHiddenInformation: report.usesHiddenInformation === true,
        rankedImpact: String(report.rankedImpact || 'none'),
        title: String(report.title || '谱系探索'),
        summary: String(report.summary || ''),
        progressionBoundary: String(report.progressionBoundary || ''),
        profiles: profiles.slice(0, 4).map(profile => {
            const practiceTopic = profile && profile.practiceTopic && typeof profile.practiceTopic === 'object' ? profile.practiceTopic : {};
            const swapSlots = Array.isArray(profile && profile.swapSlots) ? profile.swapSlots : [];
            return {
                id: String(profile && profile.id || ''),
                label: String(profile && profile.label || ''),
                primaryDecisionAxis: String(profile && profile.primaryDecisionAxis || ''),
                funHook: String(profile && profile.funHook || ''),
                skillTest: String(profile && profile.skillTest || ''),
                publicWeakness: String(profile && profile.publicWeakness || ''),
                swapSlots: swapSlots.slice(0, 4).map(slot => ({
                    id: String(slot && slot.id || ''),
                    label: String(slot && slot.label || ''),
                    detail: String(slot && slot.detail || '')
                })).filter(slot => slot.id && slot.label && slot.detail),
                practiceTopic: {
                    id: String(practiceTopic.id || ''),
                    label: String(practiceTopic.label || ''),
                    detail: String(practiceTopic.detail || '')
                },
                masteryBoundary: String(profile && profile.masteryBoundary || '')
            };
        }).filter(profile => (
            profile.id
            && profile.label
            && profile.primaryDecisionAxis
            && profile.skillTest
            && profile.publicWeakness
            && profile.practiceTopic.id
        ))
    };
}

const PUBLIC_EVENT_DATA_KEYS = {
    mulligan_completed: ['seatId', 'count'],
    player_ready: ['seatId'],
    battle_started: ['firstSeat', 'roundIndex', 'turnIndex'],
    opening_second_seat_buffer_granted: ['seatId', 'block', 'totalBlock', 'firstSeat', 'source'],
    card_played: ['cost', 'remainingEnergy'],
    turn_ended: ['nextSeat', 'completedTurns', 'roundIndex', 'turnIndex'],
    cards_drawn: ['seatId', 'count', 'handCount', 'deckCount', 'capped'],
    block_gained: ['block', 'seatId', 'totalBlock'],
    opening_counterplay_granted: ['seatId', 'block', 'totalBlock', 'minimumHp', 'source'],
    opening_protection_triggered: ['protectedSeat', 'minimumHp', 'preventedDamage', 'wouldHaveHp'],
    budget_clamped: ['rawDamage', 'actualDamage', 'preventedDamage', 'targetSeat'],
    damage_applied: ['actualDamage', 'budgetedDamage', 'blockedDamage', 'hpDamage', 'targetSeat', 'targetHp'],
    player_surrendered: ['loserSeat', 'winnerSeat'],
    match_finished: ['winnerSeat', 'loserSeat', 'finishReason', 'scoreA', 'scoreB', 'scoreDelta', 'scoreThreshold', 'roundIndex'],
    turn_timeout: ['seatId', 'winnerSeat', 'loserSeat', 'finishReason'],
    connection_timeout: ['seatId', 'disconnectedSeats', 'phase', 'elapsedMs'],
    ready_timeout: ['unreadySeats', 'readyDeadlineAt', 'elapsedMs'],
    match_invalidated: ['reason'],
    automation_action: ['seatId', 'actionType', 'reason', 'automationCount'],
    test_state_forced: ['targetSeatId', 'fields', 'scope'],
    emote_sent: ['seatId', 'emoteId', 'label']
};

function sanitizePublicData(eventType, payload) {
    const allowedKeys = PUBLIC_EVENT_DATA_KEYS[eventType] || [];
    if (!payload || typeof payload !== 'object' || allowedKeys.length === 0) return {};
    const publicData = {};
    allowedKeys.forEach(key => {
        const value = payload[key];
        if (value === undefined || value === null) return;
        if (typeof value === 'number') {
            publicData[key] = Number.isFinite(value) ? value : 0;
        } else if (typeof value === 'boolean') {
            publicData[key] = value;
        } else if (typeof value === 'string') {
            publicData[key] = String(value).slice(0, 64);
        } else if (Array.isArray(value)) {
            publicData[key] = value.map(item => String(item || '')).filter(Boolean).slice(0, 4);
        }
    });
    return publicData;
}

function sanitizePublicEvent(event) {
    const eventType = String(event && event.eventType || '');
    const publicData = sanitizePublicData(eventType, event && event.payload);
    const sanitized = {
        eventType,
        sequence: Math.max(0, Math.floor(Number(event && event.sequence) || 0)),
        actingSeat: event && event.actingSeat ? String(event.actingSeat) : ''
    };
    if (Object.keys(publicData).length > 0) sanitized.publicData = publicData;
    return sanitized;
}

function collectReviewEvidence(events, finishSequence) {
    const allowList = new Set([
        'snapshot_locked',
        'mulligan_completed',
        'player_ready',
        'battle_started',
        'opening_second_seat_buffer_granted',
        'card_played',
        'turn_ended',
        'cards_drawn',
        'block_gained',
        'opening_counterplay_granted',
        'opening_protection_triggered',
        'budget_clamped',
        'damage_applied',
        'connection_timeout',
        'ready_timeout',
        'match_invalidated',
        'automation_action',
        'turn_timeout',
        'player_surrendered',
        'match_finished'
    ]);
    const publicEvents = Array.isArray(events) ? events : [];
    const evidence = publicEvents
        .filter(event => event && event.visibility === 'public')
        .filter(event => allowList.has(event.eventType))
        .filter(event => !finishSequence || Number(event.sequence) <= finishSequence)
        .map(sanitizePublicEvent)
        .filter(event => event.eventType);
    if (evidence.length <= 12) return evidence;
    const milestones = evidence.filter(event => (
        event.eventType === 'snapshot_locked'
        || event.eventType === 'player_ready'
        || event.eventType === 'battle_started'
        || event.eventType === 'match_finished'
    ));
    const tail = evidence.slice(-9);
    const bySequence = new Map();
    [...milestones, ...tail].forEach(event => {
        const key = `${event.sequence}:${event.eventType}`;
        if (!bySequence.has(key)) bySequence.set(key, event);
    });
    return Array.from(bySequence.values())
        .sort((a, b) => a.sequence - b.sequence)
        .slice(-12);
}

function getFinishCopy({ result, finishReason, evidenceTypes }) {
    const won = result === 'win';
    if (finishReason === 'round14_draw') {
        return {
            summary: '第 14 整轮后公开长局评分分差不足 5，本局记为平局；双方应复查资源、护盾和有效伤害来源。',
            suggestions: [
                '优先查看最后两个整轮的公开事件，判断是否有可提前收束的伤害或防守窗口。',
                '如果经常进入平局，下一局调整斗法谱的终结牌密度，而不是追求不可读爆发。'
            ]
        };
    }
    if (finishReason === 'round14_score') {
        return won ? {
            summary: '第 14 整轮后由公开长局评分判胜；优势来自可公开追溯的生命、伤害、防守或资源效率。',
            suggestions: [
                '保留本局形成分差的公开节奏，下一局继续避免无前兆爆发。',
                '复查分数来源，确认优势不是依赖对手超时或连接异常。'
            ]
        } : {
            summary: '第 14 整轮后由公开长局评分判负；先复查生命差、有效伤害和资源效率的落后窗口。',
            suggestions: [
                '下一局减少空过和被预算拦截的爆发尝试，优先建立公开 setup。',
                '把防御牌留给可计分的关键回合，避免只拖局却无法形成有效分数。'
            ]
        };
    }
    if (finishReason === 'surrender') {
        return won ? {
            summary: '对手认输结束本局；回看认输前两条权威事件，确认你的压制窗口是否稳定。',
            suggestions: [
                '保留本局形成压力的出牌顺序，下一局继续观察对手是否提前交出防御。',
                '如果对手在低血线前认输，优先复查你的伤害节奏，而不是追求更极端爆发。'
            ]
        } : {
            summary: '本局由认输结束；先回看认输前的生命、灵力和手牌窗口，确认是不是过早放弃。',
            suggestions: [
                '下一局把低费防御或调息保留到第一轮末，避免被连续压低血线后失去判断。',
                '先查看权威事件，再决定换成守势斗法谱还是继续用当前谱练节奏。'
            ]
        };
    }
    if (finishReason === 'timeout') {
        return won ? {
            summary: '对手行动超时结束本局；胜负来自服务端计时，不代表已经完成强压检验。',
            suggestions: [
                '继续排位前先复查回合交替，确认你的局面没有依赖对手掉线。',
                '下一局仍按正常真人节奏保留防守窗口。'
            ]
        } : {
            summary: '本局因你的行动超时结束；下一局优先缩短关键回合思考，必要时先结束回合保留资源。',
            suggestions: [
                '遇到手牌选择过多时先执行低风险防御，再把爆发留到下一手。',
                '复查超时前的权威事件，找出让你卡住的资源或目标判断。'
            ]
        };
    }
    if (finishReason === 'connection_timeout') {
        return won ? {
            summary: '对手重连宽限结束后本局由连接超时结束；胜负来自服务端连接裁决，不代表已经完成强压检验。',
            suggestions: [
                '继续排位前先复查回合交替，确认你的局面没有依赖对手网络波动。',
                '下一局仍按正常真人节奏保留防守窗口，避免把掉线局当成稳定压制。'
            ]
        } : {
            summary: '本局因你的连接超时结束；下局前先确认网络或前后台状态，避免行动窗口被重连宽限耗尽。',
            suggestions: [
                '如果需要切后台，优先在行动前完成低风险动作或结束回合。',
                '复查连接超时前的公开事件，确认是否还有可恢复的防守或结束回合选择。'
            ]
        };
    }
    if (evidenceTypes.has('opening_protection_triggered')) {
        return won ? {
            summary: '本局在开局护体后进入正常终局；胜利来自后续回合确认，而不是先手秒杀。',
            suggestions: [
                '保留开局保护后的第二段节奏，下一局继续验证是否能在公平回合里收束。',
                '回看伤害结算和护体事件，确认爆发没有依赖异常终结。'
            ]
        } : {
            summary: '本局在开局护体后仍被正常终结；优先复查护体后的防御或调息窗口。',
            suggestions: [
                '下一局不要只防第一手，护体触发后也要保留低费防御或结束回合的安全选择。',
                '回看最后一次伤害结算，确认是否错过了护盾或换牌窗口。'
            ]
        };
    }
    return won ? {
        summary: '本局由正常伤害终结；你的胜利来自公开回合内的稳定收束。',
        suggestions: [
            '复查最后两条伤害事件，确认哪一手真正打开终局窗口。',
            '下一局继续保持当前谱的节奏，同时留意对手是否换成守势谱。'
        ]
    } : {
        summary: '本局由正常伤害终结；先回看最后两条伤害或护盾事件，找出失守窗口。',
        suggestions: [
            '下一局提前保留低费防御，别把全部灵力都交给单轮进攻。',
            '如果连续被同类伤害收束，优先调整斗法谱而不是继续硬排。'
        ]
    };
}

function findReviewEvent(evidence, eventTypes, { afterSequence = -1, reverse = false } = {}) {
    const allowed = new Set(eventTypes);
    const source = reverse ? evidence.slice().reverse() : evidence;
    return source.find(event => (
        event
        && allowed.has(event.eventType)
        && (afterSequence < 0 || Number(event.sequence) > afterSequence)
    )) || null;
}

function getKeyTurnLesson(eventType, { result, finishReason }) {
    if (eventType === 'battle_started') {
        return '开战席位确定后先确认首动预算与调息结果，避免把胜负押在第一手爆发。';
    }
    if (eventType === 'opening_protection_triggered') {
        return result === 'loss'
            ? '护体已经挡下开局斩杀，下一手应优先稳血或结束回合保留资源。'
            : '护体触发后不要继续赌秒杀，转为验证第二段节奏是否稳定。';
    }
    if (eventType === 'opening_counterplay_granted') {
        return result === 'loss'
            ? '护体后的反打缓冲已经给出，下一局要优先把这个窗口转成防守或反压。'
            : '反打缓冲说明对方获得了首回合安全垫，收束时要验证后续节奏而不是只赌开局。';
    }
    if (eventType === 'budget_clamped') {
        return '伤害被首动预算压低，说明本局不是先手秒杀，后续资源交换才是判断重点。';
    }
    if (eventType === 'damage_applied') {
        return result === 'loss'
            ? '这里是失血压力窗口，下一局优先预留低费防御或调息空间。'
            : '这里打开了终局压力，复盘时确认这手是否依赖对手失误。';
    }
    if (eventType === 'block_gained') {
        return '护盾窗口会改变伤害节奏，复盘时确认进攻与防守是否错位。';
    }
    if (eventType === 'turn_timeout') {
        if (finishReason === 'connection_timeout') {
            return '连接宽限结束说明行动窗口被网络中断占用，下一局先确认重连状态再进入关键回合。';
        }
        return '读秒窗口说明操作压力过高，下一局先执行低风险动作再追求最大收益。';
    }
    if (eventType === 'player_surrendered') {
        return finishReason === 'surrender'
            ? '认输前先核对公开生命、灵力和行动席位，避免把可打局提前放弃。'
            : '认输事件只作为终局证据，重点仍看前一条压力窗口。';
    }
    if (eventType === 'match_finished') {
        return result === 'loss'
            ? '终局只记录结果，真正要练的是终局前一手的资源取舍。'
            : '终局确认胜负，下一局应复用可重复的节奏而不是追更极端爆发。';
    }
    return '该事件进入关键窗口，复盘时只使用公开序列判断节奏。';
}

function makeKeyTurnEntry(id, label, event, context, severity = 'tempo') {
    if (!event || !event.eventType) return null;
    return {
        id,
        label,
        sequence: Math.max(0, Math.floor(Number(event.sequence) || 0)),
        eventType: String(event.eventType || ''),
        actingSeat: event.actingSeat ? String(event.actingSeat) : '',
        severity,
        lesson: getKeyTurnLesson(event.eventType, context)
    };
}

function addUniqueKeyTurn(turns, entry) {
    if (!entry) return;
    const key = `${entry.sequence}:${entry.eventType}`;
    if (turns.some(item => `${item.sequence}:${item.eventType}` === key)) return;
    turns.push(entry);
}

function buildKeyTurnReplay(evidence, { result, finishReason }) {
    const safeEvidence = Array.isArray(evidence) ? evidence : [];
    const context = { result, finishReason };
    const battle = findReviewEvent(safeEvidence, ['battle_started']);
    const pressure = findReviewEvent(safeEvidence, [
        'opening_protection_triggered',
        'opening_counterplay_granted',
        'budget_clamped',
        'damage_applied',
        'block_gained',
        'connection_timeout',
        'turn_timeout',
        'card_played'
    ], { afterSequence: battle ? battle.sequence : -1 });
    const terminal = findReviewEvent(safeEvidence, [
        'connection_timeout',
        'player_surrendered',
        'turn_timeout',
        'match_finished'
    ], { reverse: true });
    const turns = [];
    addUniqueKeyTurn(turns, makeKeyTurnEntry('opening_window', '开战窗口', battle, context, 'setup'));
    addUniqueKeyTurn(turns, makeKeyTurnEntry('pressure_window', '压力窗口', pressure, context, 'swing'));
    addUniqueKeyTurn(turns, makeKeyTurnEntry('terminal_window', '终局选择', terminal, context, 'terminal'));
    if (turns.length < 2) {
        safeEvidence.slice(-3).forEach((event, index) => {
            addUniqueKeyTurn(turns, makeKeyTurnEntry(`public_window_${index + 1}`, '公开事件窗口', event, context, 'support'));
        });
    }
    return {
        reportVersion: 'pvp-live-key-turn-replay-v1',
        title: result === 'loss' ? '首败关键回合' : result === 'win' ? '胜局关键回合' : '终局关键回合',
        sourceVisibility: 'public_events',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        summary: result === 'loss'
            ? '把本局压垮体验拆成开战、压力和终局三个公开窗口，下一局先练可控选择。'
            : '把本局有效节奏拆成开战、压力和终局三个公开窗口，下一局复用可重复部分。',
        recommendedAction: result === 'loss' ? 'practice' : 'queue_again',
        turns: turns
            .sort((a, b) => a.sequence - b.sequence)
            .slice(0, 3)
    };
}

function getEventSeat(event, key) {
    if (!event || !event.publicData) return '';
    return event.publicData[key] ? String(event.publicData[key]) : '';
}

function getTerminalEvent(evidence) {
    return findReviewEvent(evidence, [
        'player_surrendered',
        'turn_timeout',
        'match_finished'
    ], { reverse: true });
}

function getSeatWindowSummary(evidence) {
    const safeEvidence = Array.isArray(evidence) ? evidence : [];
    const battle = findReviewEvent(safeEvidence, ['battle_started']);
    const firstSeat = getEventSeat(battle, 'firstSeat') || (battle && battle.actingSeat ? String(battle.actingSeat) : '');
    const secondSeat = firstSeat === 'A' ? 'B' : firstSeat === 'B' ? 'A' : '';
    const battleSequence = battle ? Math.max(0, Math.floor(Number(battle.sequence) || 0)) : 0;
    const terminal = getTerminalEvent(safeEvidence);
    const seatWindows = [];
    const addSeatWindow = (seat, event) => {
        if (!seat || !event || !event.eventType) return;
        if (Number(event.sequence) < battleSequence) return;
        if (seatWindows.some(item => item.seat === seat)) return;
        seatWindows.push({
            seat,
            sequence: Math.max(0, Math.floor(Number(event.sequence) || 0)),
            eventType: String(event.eventType || '')
        });
    };
    if (battle) addSeatWindow(firstSeat, battle);
    safeEvidence.forEach(event => {
        if (!event) return;
        if (event.eventType === 'turn_ended') {
            addSeatWindow(getEventSeat(event, 'nextSeat'), event);
            return;
        }
        if (['card_played', 'block_gained', 'opening_second_seat_buffer_granted', 'opening_counterplay_granted', 'budget_clamped', 'damage_applied', 'opening_protection_triggered'].includes(event.eventType)) {
            addSeatWindow(event.actingSeat ? String(event.actingSeat) : '', event);
        }
    });
    const secondSeatWindow = seatWindows.find(item => item.seat === secondSeat) || null;
    const terminalSequence = terminal ? Math.max(0, Math.floor(Number(terminal.sequence) || 0)) : 0;
    return {
        firstSeat,
        secondSeat,
        secondSeatWindowObserved: !!secondSeatWindow,
        terminalBeforeSecondSeatWindow: !!terminal && (!secondSeatWindow || terminalSequence <= secondSeatWindow.sequence),
        decisionWindowCount: Math.max(1, seatWindows.length),
        windowEvents: seatWindows
    };
}

function countPublicDecisionWindows(evidence) {
    return getSeatWindowSummary(evidence).decisionWindowCount;
}

function compactPublicEventRef(event) {
    if (!event || !event.eventType) return null;
    const ref = {
        eventType: String(event.eventType || ''),
        sequence: Math.max(0, Math.floor(Number(event.sequence) || 0)),
        actingSeat: event.actingSeat ? String(event.actingSeat) : ''
    };
    if (event.publicData && typeof event.publicData === 'object' && Object.keys(event.publicData).length > 0) {
        ref.publicData = { ...event.publicData };
    }
    return ref;
}

function linkedEvidence(evidence, eventTypes, limit = 4) {
    const allowed = new Set(eventTypes);
    const refs = (Array.isArray(evidence) ? evidence : [])
        .filter(event => event && allowed.has(event.eventType))
        .map(compactPublicEventRef)
        .filter(Boolean);
    const unique = new Map();
    refs.forEach(event => {
        const key = `${event.sequence}:${event.eventType}`;
        if (!unique.has(key)) unique.set(key, event);
    });
    return Array.from(unique.values()).slice(0, limit);
}

function makeFairnessCheck(id, label, passed, detail, evidenceRefs) {
    return {
        id,
        label,
        passed: !!passed,
        detail,
        linkedEvidence: Array.isArray(evidenceRefs) && evidenceRefs.length > 0 ? evidenceRefs.slice(0, 4) : []
    };
}

function buildExperienceReport(evidence, { result, finishReason }) {
    const safeEvidence = Array.isArray(evidence) ? evidence : [];
    const evidenceTypes = new Set(safeEvidence.map(event => event.eventType));
    const readyCount = safeEvidence.filter(event => event.eventType === 'player_ready').length;
    const seatWindowSummary = getSeatWindowSummary(safeEvidence);
    const decisionWindowCount = seatWindowSummary.decisionWindowCount;
    const setupReady = evidenceTypes.has('battle_started') && readyCount >= 2;
    const budgetObserved = evidenceTypes.has('budget_clamped');
    const protectionObserved = evidenceTypes.has('opening_protection_triggered');
    const firstActionBudgetState = budgetObserved
        ? 'triggered'
        : evidenceTypes.has('battle_started') || evidenceTypes.has('damage_applied') || evidenceTypes.has('card_played') ? 'not_triggered' : 'not_observable';
    const openingProtectionState = protectionObserved
        ? 'triggered'
        : !seatWindowSummary.terminalBeforeSecondSeatWindow && decisionWindowCount >= 2 ? 'not_needed' : 'not_observable';
    const timeoutLikeFinish = finishReason === 'timeout' || finishReason === 'connection_timeout';
    const shortDecisionWindow = decisionWindowCount < 2 || timeoutLikeFinish || seatWindowSummary.terminalBeforeSecondSeatWindow;
    const nonGameRisk = shortDecisionWindow && !protectionObserved ? 'watch' : 'low';
    const nonGameRiskReasons = [];
    if (!setupReady) nonGameRiskReasons.push('missing_setup_ready_public_signal');
    if (decisionWindowCount < 2) nonGameRiskReasons.push('short_public_decision_window');
    if (seatWindowSummary.terminalBeforeSecondSeatWindow) nonGameRiskReasons.push('terminal_before_second_seat_window');
    if (finishReason === 'timeout') nonGameRiskReasons.push('timeout_finish');
    if (finishReason === 'connection_timeout') nonGameRiskReasons.push('connection_timeout_finish');
    if (nonGameRiskReasons.length === 0) nonGameRiskReasons.push('public_events_show_readable_windows');
    const fairnessChecks = [
        makeFairnessCheck(
            'setup_ready_required',
            '双方确认开战',
            setupReady,
            setupReady ? '公开事件显示双方准备后才开战。' : '未看到完整双方准备事件，建议复查恢复或同步链路。',
            linkedEvidence(safeEvidence, ['player_ready', 'battle_started'])
        ),
        makeFairnessCheck(
            'first_action_budget',
            '首动爆发预算',
            firstActionBudgetState !== 'not_observable',
            budgetObserved ? '本局出现首动预算拦截，爆发没有直接变成先手秒杀。' : firstActionBudgetState === 'not_triggered' ? '本局未触发预算拦截，公开伤害未超过首动预算。' : '本局缺少可观察的首动预算信号。',
            linkedEvidence(safeEvidence, ['battle_started', 'budget_clamped', 'damage_applied', 'card_played'])
        ),
        makeFairnessCheck(
            'opening_protection',
            '开局护体',
            openingProtectionState !== 'not_observable',
            protectionObserved
                ? '本局公开触发开局护体，未行动方保留了回合机会。'
                : openingProtectionState === 'not_needed' ? '本局未触发护体，但公开事件显示双方已有可读窗口，未构成开局秒杀。' : '本局未触发护体且窗口偏短，需要继续观察短局样本。',
            linkedEvidence(safeEvidence, ['battle_started', 'opening_protection_triggered', 'opening_counterplay_granted', 'turn_ended', 'match_finished'])
        ),
        makeFairnessCheck(
            'decision_windows',
            '公开决策窗口',
            decisionWindowCount >= 2,
            decisionWindowCount >= 2 ? `公开事件至少覆盖 ${decisionWindowCount} 个行动席位。` : '公开窗口偏短，下一局优先看是否存在过早放弃或超时。',
            linkedEvidence(safeEvidence, ['battle_started', 'turn_ended', 'card_played', 'player_surrendered', 'match_finished'])
        )
    ];
    if (finishReason === 'round14_score' || finishReason === 'round14_draw') {
        fairnessChecks.push(makeFairnessCheck(
            'round14_resolution',
            '长局公开评分',
            true,
            finishReason === 'round14_draw'
                ? '第 14 整轮后分差不足 5，按公开长局评分记为平局。'
                : '第 14 整轮后分差达到 5，按公开长局评分判定胜负。',
            linkedEvidence(safeEvidence, ['turn_ended', 'match_finished'])
        ));
    }
    const agencyLabel = decisionWindowCount >= 2
        ? '双方均有可读窗口'
        : result === 'loss' ? '败方窗口偏短' : '胜局样本偏短';
    return {
        reportVersion: 'pvp-live-experience-report-v1',
        title: '双方体验诊断',
        sourceVisibility: 'public_events',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        nonGameRisk,
        nonGameRiskReasons,
        agencyLabel,
        decisionWindowCount,
        seatWindowSummary: {
            firstSeat: seatWindowSummary.firstSeat || null,
            secondSeat: seatWindowSummary.secondSeat || null,
            secondSeatWindowObserved: !!seatWindowSummary.secondSeatWindowObserved,
            terminalBeforeSecondSeatWindow: !!seatWindowSummary.terminalBeforeSecondSeatWindow
        },
        safeguardSummary: {
            setupReady: setupReady ? 'confirmed' : 'missing_signal',
            firstActionBudget: firstActionBudgetState,
            openingProtection: openingProtectionState
        },
        summary: nonGameRisk === 'low'
            ? '本局公开轨迹能解释开战、压力和终局，不属于无解释先手秒杀。'
            : '本局公开决策窗口偏短，建议先复盘关键回合再继续排位。',
        recommendedAction: nonGameRisk === 'low' ? 'queue_again' : 'review_key_turns',
        fairnessChecks
    };
}

function buildFairnessReceipt(experienceReport, { result, finishReason }) {
    const report = experienceReport && typeof experienceReport === 'object' ? experienceReport : null;
    const checks = Array.isArray(report && report.fairnessChecks) ? report.fairnessChecks : [];
    const receiptState = report && report.nonGameRisk === 'low'
        && checks.filter(check => check && check.passed === false).length === 0
        ? 'accepted'
        : 'watch';
    const setupCheck = checks.find(check => check && check.id === 'setup_ready_required');
    const budgetCheck = checks.find(check => check && check.id === 'first_action_budget');
    const protectionCheck = checks.find(check => check && check.id === 'opening_protection');
    const windowCheck = checks.find(check => check && check.id === 'decision_windows');
    const round14Check = checks.find(check => check && check.id === 'round14_resolution');
    const safeguard = report && report.safeguardSummary && typeof report.safeguardSummary === 'object'
        ? report.safeguardSummary
        : {};
    const decisionWindowCount = Math.max(0, Math.floor(Number(report && report.decisionWindowCount) || 0));
    const evidenceSummary = checks.slice(0, 5).map(check => {
        const linked = Array.isArray(check && check.linkedEvidence) ? check.linkedEvidence : [];
        return {
            id: String(check && check.id || ''),
            label: String(check && check.label || ''),
            passed: !!(check && check.passed),
            evidenceSequences: linked
                .map(event => Math.max(0, Math.floor(Number(event && event.sequence) || 0)))
                .filter(sequence => Number.isInteger(sequence))
                .slice(0, 4)
        };
    }).filter(item => item.id && item.label);
    const fairnessVerdict = receiptState === 'accepted'
        ? '公平回执：公开事件能解释开战、压力和终局，不属于无解释先手秒杀。'
        : '公平回执：公开行动窗口偏短，本局需要先复盘关键回合，再判断是否继续排位。';
    const budgetVerdict = budgetCheck && budgetCheck.passed
        ? String(budgetCheck.detail || '首动预算已按公开规则检查。')
        : '首动预算证据不足，下一局优先观察第一手伤害是否被公开预算约束。';
    const counterplayVerdict = safeguard.openingProtection === 'triggered'
        ? '反打回执：开局护体已经触发，受保护方获得后续反打窗口。'
        : safeguard.openingProtection === 'not_needed'
            ? '反打回执：护体未触发，但公开事件显示双方已有行动窗口。'
            : '反打回执：护体或反打窗口样本不足，建议先查看公开关键回合。';
    const windowVerdict = windowCheck && windowCheck.passed
        ? `行动窗口：公开事件至少覆盖 ${decisionWindowCount} 个行动席位。`
        : '行动窗口：公开窗口偏短，先确认是否认输、超时或连接中断导致。';
    const terminalVerdict = finishReason === 'round14_draw' || finishReason === 'round14_score'
        ? String(round14Check && round14Check.detail || '长局终局来自公开轮次评分。')
        : finishReason === 'connection_timeout'
            ? '终局边界：连接超时来自服务端裁决，不把网络中断当作压制能力证明。'
            : finishReason === 'timeout'
                ? '终局边界：行动超时说明操作窗口耗尽，下一局优先降低关键回合操作压力。'
                : finishReason === 'surrender'
                    ? '终局边界：认输只说明本局提前结束，真正要复盘的是认输前公开压力。'
                    : '终局边界：终局来自公开伤害或公开长局规则，复盘看终局前一手。';
    const nextStepLine = receiptState === 'accepted'
        ? (result === 'loss' ? '下一步：按回执里的压力窗口调整斗法谱或进入问道练习。' : '下一步：保留有效节奏，继续真人排位或邀请低压力再战。')
        : '下一步：先查看权威事件和关键回合复盘，不把短窗口样本直接当成公平结论。';
    return {
        reportVersion: 'pvp-live-fairness-receipt-v1',
        sourceVisibility: 'public_events',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        result,
        finishReason,
        receiptState,
        riskState: String(report && report.nonGameRisk || 'watch'),
        agencyLabel: String(report && report.agencyLabel || '公开窗口待复查'),
        setupVerdict: setupCheck && setupCheck.passed
            ? '开战回执：双方准备公开确认后才进入战斗。'
            : '开战回执：缺少完整准备公开信号，建议复查同步链路。',
        fairnessVerdict,
        budgetVerdict,
        counterplayVerdict,
        windowVerdict,
        terminalVerdict,
        nextStepLine,
        evidenceSummary,
        boundary: '公平回执只汇总公开复盘证据，不读取隐藏手牌、牌库或原始事件明细，也不改正式积分或结算。'
    };
}

function projectPostMatchReview(state, seatId) {
    if (!state || state.status !== 'finished' || !Array.isArray(state.events)) return null;
    const finishedEvent = state.events.slice().reverse().find(event => event && event.eventType === 'match_finished' && event.payload);
    if (!finishedEvent || !finishedEvent.payload) return null;
    const winnerSeat = String(finishedEvent.payload.winnerSeat || '');
    const loserSeat = String(finishedEvent.payload.loserSeat || '');
    const finishReason = String(finishedEvent.payload.finishReason || 'lethal');
    const isDraw = winnerSeat === 'draw' && finishReason.endsWith('_draw');
    if (!winnerSeat || (!loserSeat && !isDraw)) return null;
    const result = isDraw ? 'draw' : seatId === winnerSeat ? 'win' : seatId === loserSeat ? 'loss' : 'spectator';
    const evidence = collectReviewEvidence(state.events, Number(finishedEvent.sequence) || 0);
    const evidenceTypes = new Set(evidence.map(event => event.eventType));
    const copy = getFinishCopy({ result, finishReason, evidenceTypes });
    const keyTurnReplay = buildKeyTurnReplay(evidence, { result, finishReason });
    const experienceReport = buildExperienceReport(evidence, { result, finishReason });
    const fairnessReceipt = buildFairnessReceipt(experienceReport, { result, finishReason });
    const settlementReport = projectSettlementReport(state, seatId);
    const friendlySeries = projectFriendlySeries(state.friendlySeries, state.status);
    const isFriendly = state.mode === 'friendly';
    const canFriendlyRematch = !isFriendly || !!(friendlySeries && friendlySeries.canRequestNextRound);
    const nextActions = [
        {
            id: 'review_events',
            label: '查看权威事件',
            detail: '只查看公开事件序列，不暴露隐藏手牌或牌库顺序。'
        },
        {
            id: 'review_key_turns',
            label: '关键回合复盘',
            detail: '按公开事件拆出开战、压力和终局窗口，不读取隐藏信息。'
        },
        ...(canFriendlyRematch ? [{
            id: 'friendly_rematch',
            label: isFriendly ? 'Bo3 决胜局' : '低压力再战',
            detail: isFriendly
                ? '邀请本局对手完成 Bo3 决胜局；双方确认后开战，不写正式积分。'
                : '邀请本局对手换边再来一局；双方确认后开战，不写正式积分。'
        }] : []),
        {
            id: 'adjust_loadout',
            label: '调整斗法谱',
            detail: result === 'loss' ? '按失守窗口调整首战谱。' : '保留有效节奏，微调防守窗口。'
        },
        {
            id: 'practice',
            label: '问道练习',
            detail: '练习只用于熟悉节奏，不写正式结果。'
        },
        {
            id: 'queue_again',
            label: isFriendly ? '回到真人排位' : '继续真人排位',
            detail: isFriendly ? '结束友谊局，回到真人排位队列。' : '带着本局结论重新入队。'
        }
    ];
    return {
        reportVersion: 'pvp-live-post-match-review-v1',
        audience: 'seat',
        title: result === 'win' ? '胜局复盘 MVP' : result === 'loss' ? '首败复盘 MVP' : result === 'draw' ? '平局复盘 MVP' : '赛后复盘 MVP',
        result,
        winnerSeat,
        loserSeat,
        finishReason,
        summary: copy.summary,
        evidence,
        settlementReport,
        keyTurnReplay,
        experienceReport,
        fairnessReceipt,
        friendlySeries,
        suggestions: copy.suggestions.slice(0, 2),
        nextActions
    };
}

function projectSettlementReport(state, seatId) {
    if (!state || state.status !== 'finished' || state.mode === 'friendly') return null;
    const report = state.settlementReport && typeof state.settlementReport === 'object' ? state.settlementReport : null;
    if (!report || report.reportVersion !== 'pvp-live-settlement-report-v1') return null;
    const participants = report.participants && typeof report.participants === 'object' ? report.participants : {};
    const participant = participants[seatId] && typeof participants[seatId] === 'object' ? participants[seatId] : null;
    if (!participant) return null;
    const ratingDelta = Math.floor(Number(participant.ratingDelta) || 0);
    const coinsAwarded = Math.max(0, Math.floor(Number(participant.coinsAwarded) || 0));
    const result = participant.result === 'win' || participant.didWin === true ? 'win' : 'loss';
    const deltaText = ratingDelta > 0 ? `+${ratingDelta}` : `${ratingDelta}`;
    return {
        reportVersion: 'pvp-live-settlement-report-v1',
        sourceVisibility: 'server_authoritative_settlement',
        usesHiddenInformation: false,
        rankedImpact: 'official',
        settlementSource: 'live_ranked',
        formalResultPolicy: 'ranked_authoritative',
        result,
        finishReason: String(report.finishReason || ''),
        oldScore: Math.max(0, Math.floor(Number(participant.oldScore) || 0)),
        scoreAfter: Math.max(0, Math.floor(Number(participant.scoreAfter) || 0)),
        ratingDelta,
        coinsAwarded,
        settledAt: Math.max(0, Math.floor(Number(report.settledAt) || 0)),
        summaryLine: `正式积分 ${deltaText} · 当前 ${Math.max(0, Math.floor(Number(participant.scoreAfter) || 0))} · 天道币 +${coinsAwarded}`,
        boundary: '本报告来自服务端权威 live ranked 结算；好友约战、问道练习和无效局不会生成正式结算报告。',
        seasonHonorReport: projectSeasonHonorReport(participant.seasonHonorReport)
    };
}

function projectSeasonHonorReward(source) {
    const reward = source && typeof source === 'object' ? source : null;
    if (!reward || reward.reportVersion !== 'pvp-live-season-honor-reward-v1') return null;
    const nextReward = reward.nextReward && typeof reward.nextReward === 'object' ? reward.nextReward : {};
    const collectionReport = reward.collectionReport && typeof reward.collectionReport === 'object' ? reward.collectionReport : null;
    const rewardName = String(reward.rewardName || '赛季荣誉外观');
    return {
        reportVersion: 'pvp-live-season-honor-reward-v1',
        rewardId: String(reward.rewardId || 's1_genesis_honor_mark_1'),
        rewardType: String(reward.rewardType || 'cosmetic_badge'),
        rewardName,
        rewardState: reward.rewardState === 'preview' ? 'preview' : 'earned',
        collectionState: reward.collectionState === 'newly_unlocked' ? 'newly_unlocked' : reward.collectionState === 'owned' ? 'owned' : 'earned',
        rewardImpact: 'cosmetic_only',
        powerImpact: 'none',
        sourceVisibility: 'server_authoritative_settlement',
        usesHiddenInformation: false,
        unlockedAt: Math.max(0, Math.floor(Number(reward.unlockedAt) || 0)),
        collectionSize: Math.max(0, Math.floor(Number(reward.collectionSize) || 0)),
        collectionReport: collectionReport ? {
            reportVersion: 'pvp-live-season-honor-collection-v1',
            seasonId: String(collectionReport.seasonId || 's1-genesis'),
            rewardImpact: 'cosmetic_only',
            powerImpact: 'none',
            totalUnlocked: Math.max(0, Math.floor(Number(collectionReport.totalUnlocked) || 0)),
            lastUnlockedRewardId: String(collectionReport.lastUnlockedRewardId || ''),
            boundary: '赛季荣誉收藏只保存外观成就，不授予卡牌、属性、资源、起手、匹配或战斗效果。'
        } : null,
        unlockLine: String(reward.unlockLine || `已点亮外观目标：${rewardName}`),
        progressLine: String(reward.progressLine || '本季外观目标已更新'),
        nextReward: {
            targetGames: Math.max(1, Math.floor(Number(nextReward.targetGames) || 1)),
            remainingGames: Math.max(0, Math.floor(Number(nextReward.remainingGames) || 0)),
            rewardId: String(nextReward.rewardId || ''),
            rewardType: String(nextReward.rewardType || 'cosmetic_badge'),
            rewardName: String(nextReward.rewardName || '下一档外观目标'),
            label: String(nextReward.label || '下一档外观目标已更新')
        },
        boundary: '仅用于赛季荣誉展示和外观回访，不授予卡牌、属性、资源、起手、匹配或战斗效果。'
    };
}

function projectSeasonHonorReport(source) {
    const report = source && typeof source === 'object' ? source : null;
    if (!report || report.reportVersion !== 'pvp-live-season-honor-v1') return null;
    const gamesPlayed = Math.max(1, Math.floor(Number(report.gamesPlayed) || 1));
    const wins = Math.max(0, Math.floor(Number(report.wins) || 0));
    const losses = Math.max(0, Math.floor(Number(report.losses) || 0));
    const nextMilestone = report.nextMilestone && typeof report.nextMilestone === 'object' ? report.nextMilestone : {};
    return {
        reportVersion: 'pvp-live-season-honor-v1',
        seasonId: String(report.seasonId || 's1-genesis'),
        seasonName: String(report.seasonName || '开天赛季'),
        sourceVisibility: 'server_authoritative_settlement',
        usesHiddenInformation: false,
        rankedImpact: 'honor_only',
        powerImpact: 'none',
        gamesPlayed,
        wins,
        losses,
        resultTag: report.resultTag === 'win_logged' ? 'win_logged' : 'loss_logged',
        milestoneLabel: String(report.milestoneLabel || (gamesPlayed === 1 ? '首场入账' : `本季 ${gamesPlayed} 场`)),
        nextMilestone: {
            targetGames: Math.max(gamesPlayed, Math.floor(Number(nextMilestone.targetGames) || gamesPlayed)),
            remainingGames: Math.max(0, Math.floor(Number(nextMilestone.remainingGames) || 0)),
            label: String(nextMilestone.label || '赛季荣誉节点已更新')
        },
        cosmeticReward: projectSeasonHonorReward(report.cosmeticReward),
        summaryLine: String(report.summaryLine || `赛季荣誉 ${gamesPlayed} 场 · 胜 ${wins} / 负 ${losses}`),
        nextGoalLine: String(report.nextGoalLine || '把本局公开结论带到下一局真人排位。'),
        boundary: '只记录赛季荣誉、复盘目标和外观向回访，不改变生命、伤害、抽牌、灵力、起手或匹配。'
    };
}

function projectFriendlySeries(series, status = '') {
    if (!series || typeof series !== 'object') return null;
    const sourceMatchId = typeof series.sourceMatchId === 'string' ? series.sourceMatchId.trim() : '';
    const seriesId = typeof series.seriesId === 'string' ? series.seriesId.trim() : '';
    if (!sourceMatchId || !seriesId) return null;
    const safeguards = Array.isArray(series.safeguards) ? series.safeguards : [];
    const scoreBySourceSeat = series.scoreBySourceSeat && typeof series.scoreBySourceSeat === 'object' ? series.scoreBySourceSeat : {};
    const sourceParticipants = series.sourceParticipants && typeof series.sourceParticipants === 'object' ? series.sourceParticipants : {};
    const targetWins = Math.max(2, Math.min(5, Math.floor(Number(series.targetWins) || 2)));
    const maxRounds = Math.max(1, Math.floor(Number(series.maxRounds) || (targetWins * 2 - 1)));
    const score = {
        A: Math.max(0, Math.floor(Number(scoreBySourceSeat.A) || 0)),
        B: Math.max(0, Math.floor(Number(scoreBySourceSeat.B) || 0))
    };
    const winnerSourceSeat = series.winnerSourceSeat === 'A' || series.winnerSourceSeat === 'B'
        ? series.winnerSourceSeat
        : score.A >= targetWins && score.A > score.B ? 'A' : score.B >= targetWins && score.B > score.A ? 'B' : '';
    return {
        reportVersion: 'pvp-live-friendly-series-v1',
        sourceMatchId,
        originMatchId: String(series.originMatchId || sourceMatchId),
        seriesId,
        status: status === 'finished' ? 'finished' : String(series.status || 'matched'),
        format: String(series.format || 'bo3_mvp'),
        targetWins,
        maxRounds,
        roundIndex: Math.max(1, Math.min(maxRounds, Math.floor(Number(series.roundIndex) || 2))),
        roundLabel: String(series.roundLabel || '换边再战'),
        seriesStatus: winnerSourceSeat ? 'complete' : String(series.seriesStatus || 'ongoing'),
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
        leaderSourceSeat: series.leaderSourceSeat === 'A' || series.leaderSourceSeat === 'B'
            ? series.leaderSourceSeat
            : score.A === score.B ? '' : score.A > score.B ? 'A' : 'B',
        winnerSourceSeat,
        canRequestNextRound: !!series.canRequestNextRound && !winnerSourceSeat && score.A + score.B < maxRounds,
        rankedImpact: 'none',
        formalResultPolicy: 'practice_only',
        seatPolicy: String(series.seatPolicy || 'swap_sides'),
        loadoutPolicy: String(series.loadoutPolicy || 'per_game_change_allowed'),
        confirmationCount: Math.max(1, Math.min(2, Math.floor(Number(series.confirmationCount) || 2))),
        safeguards: safeguards.map(item => String(item || '')).filter(Boolean).slice(0, 8)
    };
}

function normalizeCount(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
}

function getOpeningSeatDamageBudget(firstSeat, seatId) {
    const isFirstSeat = seatId === firstSeat;
    const key = isFirstSeat ? 'firstSeat' : 'secondSeat';
    return Math.max(0, Math.floor(Number(RULES.firstActionDamageBudget[key]) || 0));
}

function otherSeat(seatId) {
    return seatId === 'A' ? 'B' : 'A';
}

function getActionDamageBudget(state, seat) {
    if (!seat || !seat.seatId) return null;
    if (normalizeCount(seat.actionsTaken) === 0) {
        const firstSeat = state && state.setup && (state.setup.firstSeat === 'A' || state.setup.firstSeat === 'B')
            ? state.setup.firstSeat
            : 'A';
        return getOpeningSeatDamageBudget(firstSeat, seat.seatId);
    }
    if (normalizeCount(seat.actionsTaken) === 1) {
        return Math.max(0, Math.floor(Number(RULES.firstActionDamageBudget.secondAction) || 0));
    }
    return null;
}

function projectCardActionPreview(state, viewerSeat, card) {
    const actor = state && state.seats ? state.seats[viewerSeat] : null;
    const targetSeat = otherSeat(viewerSeat);
    const target = state && state.seats ? state.seats[targetSeat] : null;
    if (!actor || !target || !card) return null;
    const cost = normalizeCount(card.cost);
    if (normalizeCount(actor.energy) < cost) return null;
    const rawDamage = normalizeCount(card.damage);
    const damageBudget = getActionDamageBudget(state, actor);
    const budgetedDamage = damageBudget === null ? rawDamage : Math.min(rawDamage, damageBudget);
    const preventedByBudget = Math.max(0, rawDamage - budgetedDamage);
    const blockedDamage = Math.min(normalizeCount(target.block), budgetedDamage);
    const hpDamageBeforeProtection = Math.max(0, budgetedDamage - blockedDamage);
    const wouldHaveHp = Math.max(0, normalizeCount(target.hp) - hpDamageBeforeProtection);
    const minimumHp = Math.max(0, Math.floor(Number(RULES.openingProtection && RULES.openingProtection.minimumHp) || 0));
    const protectedHp = Math.min(Math.max(0, normalizeCount(target.maxHp || RULES.startingHp)), minimumHp);
    const willTriggerProtection = minimumHp > 0 && normalizeCount(target.hp) - hpDamageBeforeProtection < minimumHp && normalizeCount(target.turnsTaken) <= 0;
    const protectedHpDamage = willTriggerProtection
        ? Math.max(0, normalizeCount(target.hp) - protectedHp)
        : hpDamageBeforeProtection;
    const preventedByProtection = willTriggerProtection
        ? Math.max(0, hpDamageBeforeProtection - protectedHpDamage)
        : 0;
    const hpDamage = willTriggerProtection ? protectedHpDamage : hpDamageBeforeProtection;
    const targetHpAfter = willTriggerProtection ? protectedHp : wouldHaveHp;
    const blockGain = normalizeCount(card.block);
    const cardName = String(card.name || card.cardId || '术式');
    const damageLine = rawDamage > 0
        ? `预算后 ${budgetedDamage}，破盾 ${blockedDamage}，生命伤害 ${hpDamage}，${targetSeat} 预计 ${targetHpAfter} 血`
        : `不造成伤害，${targetSeat} 血线不变`;
    const protectionLine = willTriggerProtection
        ? `；护体触发，保底 ${protectedHp} 血，挡下 ${preventedByProtection}`
        : '';
    const blockLine = blockGain > 0 ? `；自身获得 ${blockGain} 护盾` : '';
    const safeguards = [];
    if (damageBudget !== null) safeguards.push('first_action_budget');
    if (blockedDamage > 0) safeguards.push('public_block');
    if (willTriggerProtection) safeguards.push('opening_protection');
    if (preventedByProtection > 0) safeguards.push('counterplay_window_pending');
    if (blockGain > 0) safeguards.push('self_block');
    return {
        cardInstanceId: String(card.instanceId || ''),
        cardName,
        targetSeat,
        cost,
        energyAfter: Math.max(0, normalizeCount(actor.energy) - cost),
        rawDamage,
        damageBudget,
        budgetedDamage,
        preventedByBudget,
        blockedDamage,
        hpDamage,
        targetHpBefore: normalizeCount(target.hp),
        targetHpAfter,
        wouldHaveHp,
        openingProtection: {
            willTrigger: willTriggerProtection,
            minimumHp,
            preventedDamage: preventedByProtection
        },
        blockGain,
        selfBlockAfter: normalizeCount(actor.block) + blockGain,
        summaryLine: `${cardName}：${damageLine}${protectionLine}${blockLine}。`,
        safeguards: Array.from(new Set(safeguards))
    };
}

function projectActionPreviewReport(state, seatId) {
    const viewerSeat = seatId === 'B' ? 'B' : 'A';
    const currentSeat = state && state.currentSeat === 'B' ? 'B' : 'A';
    const isViewerTurn = String(state && state.status || '') === 'active' && currentSeat === viewerSeat;
    const actor = state && state.seats ? state.seats[viewerSeat] : null;
    const playableCards = isViewerTurn && actor && Array.isArray(actor.hand)
        ? actor.hand.map(card => projectCardActionPreview(state, viewerSeat, card)).filter(Boolean)
        : [];
    const nextSeat = otherSeat(viewerSeat);
    const nextSeatState = state && state.seats ? state.seats[nextSeat] : null;
    const counterplayBlock = Math.max(0, Math.floor(Number(RULES.openingCounterplay && RULES.openingCounterplay.block) || 0));
    const willGrantCounterplay = !!(isViewerTurn && nextSeatState && nextSeatState.openingCounterplayPending && !nextSeatState.openingCounterplayGranted && normalizeCount(nextSeatState.turnsTaken) <= 0 && counterplayBlock > 0);
    return {
        reportVersion: 'pvp-live-action-preview-v1',
        sourceVisibility: 'viewer_public_state',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        viewerSeat,
        currentSeat,
        isViewerTurn,
        status: String(state && state.status || ''),
        playableCards,
        endTurn: isViewerTurn ? {
            nextSeat,
            willGrantCounterplay,
            counterplayBlock: willGrantCounterplay ? counterplayBlock : 0,
            summaryLine: willGrantCounterplay
                ? `结束回合后行动权交给 ${nextSeat}，并发放反打缓冲 +${counterplayBlock}。`
                : `结束回合后行动权交给 ${nextSeat}。`
        } : null
    };
}

function getPublicEventPayload(event) {
    return event && event.payload && typeof event.payload === 'object' ? event.payload : {};
}

function getPublicCardName(cardId) {
    const definition = getCardDefinition(cardId);
    return String(definition && definition.name || '术式');
}

function isCardResolutionEvent(event, cardId, actingSeat) {
    if (!event || event.actingSeat !== actingSeat) return false;
    if (!['budget_clamped', 'opening_protection_triggered', 'damage_applied', 'block_gained'].includes(String(event.eventType || ''))) return false;
    const payload = getPublicEventPayload(event);
    return String(payload.sourceCardId || '') === String(cardId || '');
}

function collectCardResolutionEvents(events, cardPlayedIndex, cardId, actingSeat) {
    const collected = [];
    for (let index = cardPlayedIndex - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (!isCardResolutionEvent(event, cardId, actingSeat)) break;
        collected.unshift(event);
    }
    return collected;
}

function projectCardActionReceipt(state, seatId, cardPlayedIndex) {
    const events = Array.isArray(state && state.events) ? state.events : [];
    const cardEvent = events[cardPlayedIndex];
    const cardPayload = getPublicEventPayload(cardEvent);
    const actingSeat = cardEvent && cardEvent.actingSeat === 'B' ? 'B' : 'A';
    const cardId = String(cardPayload.cardId || '');
    const resolutionEvents = collectCardResolutionEvents(events, cardPlayedIndex, cardId, actingSeat);
    const findResolution = (eventType) => resolutionEvents.find(event => event.eventType === eventType) || null;
    const budgetEvent = findResolution('budget_clamped');
    const damageEvent = findResolution('damage_applied');
    const protectionEvent = findResolution('opening_protection_triggered');
    const blockEvent = findResolution('block_gained');
    const budgetPayload = getPublicEventPayload(budgetEvent);
    const damagePayload = getPublicEventPayload(damageEvent);
    const protectionPayload = getPublicEventPayload(protectionEvent);
    const blockPayload = getPublicEventPayload(blockEvent);
    const rawDamage = normalizeCount(damagePayload.rawDamage || budgetPayload.rawDamage);
    const budgetedDamage = normalizeCount(damagePayload.budgetedDamage || damagePayload.actualDamage || budgetPayload.actualDamage);
    const preventedByBudget = normalizeCount(budgetPayload.preventedDamage);
    const blockedDamage = normalizeCount(damagePayload.blockedDamage);
    const hpDamage = normalizeCount(damagePayload.hpDamage);
    const targetSeat = String(damagePayload.targetSeat || budgetPayload.targetSeat || protectionPayload.protectedSeat || '');
    const targetHpAfter = normalizeCount(damagePayload.targetHp);
    const blockGain = normalizeCount(blockPayload.block);
    const cardName = getPublicCardName(cardId);
    const damageLine = rawDamage > 0 || damageEvent
        ? `预算后 ${budgetedDamage}，破盾 ${blockedDamage}，生命伤害 ${hpDamage}${targetSeat ? `，${targetSeat} 剩余 ${targetHpAfter} 血` : ''}`
        : '不造成伤害';
    const protectionTriggered = !!protectionEvent;
    const protectionLine = protectionTriggered
        ? `；护体保底 ${normalizeCount(protectionPayload.minimumHp) || 1} 血，挡下 ${normalizeCount(protectionPayload.preventedDamage)}`
        : '';
    const blockLine = blockGain > 0
        ? `；自身护盾 +${blockGain}，当前 ${normalizeCount(blockPayload.totalBlock)}`
        : '';
    const safeguards = ['public_events'];
    if (budgetEvent) safeguards.push('first_action_budget');
    if (blockedDamage > 0) safeguards.push('public_block');
    if (protectionTriggered) safeguards.push('opening_protection');
    if (blockGain > 0) safeguards.push('self_block');
    return {
        reportVersion: 'pvp-live-action-receipt-v1',
        sourceVisibility: 'authoritative_public_projection',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        viewerSeat: seatId === 'B' ? 'B' : 'A',
        actingSeat,
        actionType: 'play_card',
        latestSequence: normalizeCount(cardEvent && cardEvent.sequence),
        cardName,
        cost: normalizeCount(cardPayload.cost),
        remainingEnergy: normalizeCount(cardPayload.remainingEnergy),
        damage: {
            targetSeat,
            rawDamage,
            budgetedDamage,
            preventedByBudget,
            blockedDamage,
            hpDamage,
            targetHpAfter
        },
        openingProtection: {
            triggered: protectionTriggered,
            protectedSeat: String(protectionPayload.protectedSeat || ''),
            minimumHp: normalizeCount(protectionPayload.minimumHp),
            preventedDamage: normalizeCount(protectionPayload.preventedDamage),
            wouldHaveHp: normalizeCount(protectionPayload.wouldHaveHp)
        },
        blockGain: blockGain > 0 ? {
            seatId: String(blockPayload.seatId || actingSeat),
            block: blockGain,
            totalBlock: normalizeCount(blockPayload.totalBlock)
        } : null,
        summaryLine: `${actingSeat} 打出${cardName}：${damageLine}${protectionLine}${blockLine}。`,
        safeguards: Array.from(new Set(safeguards))
    };
}

function collectEndTurnResolutionEvents(events, turnEndedIndex) {
    const collected = [];
    for (let index = turnEndedIndex + 1; index < events.length; index += 1) {
        const event = events[index];
        if (!event) break;
        if (event.eventType === 'card_played' || event.eventType === 'turn_ended') break;
        if (['cards_drawn', 'opening_counterplay_granted'].includes(String(event.eventType || ''))) {
            collected.push(event);
        }
    }
    return collected;
}

function projectEndTurnActionReceipt(state, seatId, turnEndedIndex) {
    const events = Array.isArray(state && state.events) ? state.events : [];
    const turnEvent = events[turnEndedIndex];
    const turnPayload = getPublicEventPayload(turnEvent);
    const actingSeat = turnEvent && turnEvent.actingSeat === 'B' ? 'B' : 'A';
    const resolutionEvents = collectEndTurnResolutionEvents(events, turnEndedIndex);
    const drawEvent = resolutionEvents.find(event => event.eventType === 'cards_drawn') || null;
    const counterplayEvent = resolutionEvents.find(event => event.eventType === 'opening_counterplay_granted') || null;
    const drawPayload = getPublicEventPayload(drawEvent);
    const counterplayPayload = getPublicEventPayload(counterplayEvent);
    const nextSeat = String(turnPayload.nextSeat || '');
    const drawCount = normalizeCount(drawPayload.count);
    const counterplayBlock = normalizeCount(counterplayPayload.block);
    const drawLine = drawEvent ? `，${String(drawPayload.seatId || nextSeat || '下家')} 抽 ${drawCount} 张` : '';
    const counterplayLine = counterplayEvent ? `；反打缓冲 +${counterplayBlock} 给 ${String(counterplayPayload.seatId || nextSeat || '')}` : '';
    const safeguards = ['public_events'];
    if (counterplayEvent) safeguards.push('counterplay_granted');
    return {
        reportVersion: 'pvp-live-action-receipt-v1',
        sourceVisibility: 'authoritative_public_projection',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        viewerSeat: seatId === 'B' ? 'B' : 'A',
        actingSeat,
        actionType: 'end_turn',
        latestSequence: normalizeCount(turnEvent && turnEvent.sequence),
        nextSeat,
        completedTurns: normalizeCount(turnPayload.completedTurns),
        roundIndex: normalizeCount(turnPayload.roundIndex),
        turnIndex: normalizeCount(turnPayload.turnIndex),
        draw: {
            seatId: String(drawPayload.seatId || nextSeat || ''),
            count: drawCount,
            capped: drawPayload.capped === true
        },
        counterplay: {
            granted: !!counterplayEvent,
            seatId: String(counterplayPayload.seatId || ''),
            block: counterplayBlock,
            totalBlock: normalizeCount(counterplayPayload.totalBlock),
            minimumHp: normalizeCount(counterplayPayload.minimumHp)
        },
        summaryLine: `${actingSeat} 结束回合：行动权交给 ${nextSeat || '下家'}${drawLine}${counterplayLine}。`,
        safeguards: Array.from(new Set(safeguards))
    };
}

function projectActionReceiptReport(state, seatId) {
    const events = Array.isArray(state && state.events) ? state.events : [];
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const eventType = String(events[index] && events[index].eventType || '');
        if (eventType === 'card_played') return projectCardActionReceipt(state, seatId, index);
        if (eventType === 'turn_ended') return projectEndTurnActionReceipt(state, seatId, index);
    }
    return null;
}

function projectOpeningSafeguardReport(state, seatId) {
    const firstSeat = state && state.setup && (state.setup.firstSeat === 'A' || state.setup.firstSeat === 'B')
        ? state.setup.firstSeat
        : 'A';
    const secondSeat = firstSeat === 'A' ? 'B' : 'A';
    const minimumHp = Math.max(0, Math.floor(Number(RULES.openingProtection && RULES.openingProtection.minimumHp) || 0));
    const activeStatuses = new Set(['setup', 'active']);
    const protectedSeats = activeStatuses.has(String(state && state.status || ''))
        ? ['A', 'B'].filter(candidate => {
            const seat = state.seats && state.seats[candidate];
            return seat && seat.hp > 0 && normalizeCount(seat.turnsTaken) <= 0;
        })
        : [];
    const pendingCounterplaySeats = ['A', 'B'].filter(candidate => {
        const seat = state.seats && state.seats[candidate];
        return !!(seat && seat.openingCounterplayPending && !seat.openingCounterplayGranted);
    });
    const grantedCounterplaySeats = ['A', 'B'].filter(candidate => {
        const seat = state.seats && state.seats[candidate];
        return !!(seat && seat.openingCounterplayGranted);
    });
    const currentSeat = state && state.currentSeat === 'B' ? 'B' : 'A';
    const currentActionBudget = state && state.status === 'active'
        ? getActionDamageBudget(state, state.seats[currentSeat])
        : null;
    return {
        reportVersion: 'pvp-live-opening-safeguard-v1',
        status: state && state.status === 'active'
            ? protectedSeats.length > 0 ? 'armed' : 'expired'
            : state && state.status === 'setup' ? 'preview' : 'closed',
        currentSeat,
        viewerSeat: seatId,
        firstSeat,
        secondSeat,
        damageBudget: {
            firstSeat: getOpeningSeatDamageBudget(firstSeat, firstSeat),
            secondSeat: getOpeningSeatDamageBudget(firstSeat, secondSeat),
            secondAction: Math.max(0, Math.floor(Number(RULES.firstActionDamageBudget.secondAction) || 0)),
            currentSeat,
            currentActionBudget
        },
        openingProtection: {
            minimumHp,
            protectedSeats,
            active: protectedSeats.length > 0 && minimumHp > 0,
            summary: minimumHp > 0
                ? `未完成首个回合的席位不会被开局伤害直接终结，最低保留 ${minimumHp} 血。`
                : '本局未启用开局护体。'
        },
        secondSeatBuffer: {
            block: Math.max(0, Math.floor(Number(RULES.openingSecondSeatBuffer && RULES.openingSecondSeatBuffer.block) || 0)),
            seatId: secondSeat,
            active: state.status === 'active',
            summary: `后手开局获得 ${Math.max(0, Math.floor(Number(RULES.openingSecondSeatBuffer && RULES.openingSecondSeatBuffer.block) || 0))} 点公开护盾，抵消先动节奏差。`
        },
        counterplay: {
            block: Math.max(0, Math.floor(Number(RULES.openingCounterplay && RULES.openingCounterplay.block) || 0)),
            pendingSeats: pendingCounterplaySeats,
            grantedSeats: grantedCounterplaySeats,
            summary: pendingCounterplaySeats.length > 0
                ? `护体后首个行动窗口会获得 ${Math.max(0, Math.floor(Number(RULES.openingCounterplay && RULES.openingCounterplay.block) || 0))} 点护盾缓冲。`
                : '护体后反打缓冲会在受保护方首个行动窗口发放。'
        },
        sourceVisibility: 'public_state',
        usesHiddenInformation: false,
        rankedImpact: 'none'
    };
}

function getHpPct(seat) {
    const hp = Math.max(0, Math.floor(Number(seat && seat.hp) || 0));
    const maxHp = Math.max(1, Math.floor(Number(seat && seat.maxHp) || 1));
    return Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100)));
}

function projectDuelMomentumReport(state, seatId, openingSafeguardReport = null) {
    const viewerSeat = seatId === 'B' ? 'B' : 'A';
    const opponentSeat = viewerSeat === 'A' ? 'B' : 'A';
    const viewer = state && state.seats ? state.seats[viewerSeat] : null;
    const opponent = state && state.seats ? state.seats[opponentSeat] : null;
    const status = String(state && state.status || 'setup');
    const currentSeat = state && state.currentSeat === 'B' ? 'B' : 'A';
    const isActive = status === 'active';
    const isViewerTurn = isActive && currentSeat === viewerSeat;
    if (status !== 'setup' && status !== 'active') {
        const pressureState = status === 'finished' ? 'finished' : status === 'invalidated' ? 'invalidated' : 'closed';
        const pressureLabel = pressureState === 'finished' ? '对局结束' : pressureState === 'invalidated' ? '无效局' : '局势关闭';
        const summaryLine = pressureState === 'finished'
            ? '局势：对局已结束，行动窗口已关闭。'
            : pressureState === 'invalidated'
                ? '局势：无效局，本局未开战成功，不计正式积分。'
                : '局势：当前没有可行动窗口。';
        const counterplayLine = pressureState === 'finished'
            ? '行动窗口：本局已进入赛后复盘。'
            : pressureState === 'invalidated'
                ? '行动窗口：无效局不计正式积分，不产生先手击杀或奖励。'
                : '行动窗口：等待新的真人对局。';
        return {
            reportVersion: 'pvp-live-duel-momentum-v1',
            sourceVisibility: 'public_state',
            usesHiddenInformation: false,
            rankedImpact: 'none',
            viewerSeat,
            opponentSeat,
            currentSeat,
            isViewerTurn: false,
            viewerHpPct: getHpPct(viewer),
            opponentHpPct: getHpPct(opponent),
            hpDelta: Math.max(0, Math.floor(Number(viewer && viewer.hp) || 0)) - Math.max(0, Math.floor(Number(opponent && opponent.hp) || 0)),
            pressureState,
            pressureLabel,
            agencyLabel: pressureLabel,
            summaryLine,
            counterplayLine,
            safeguards: pressureState === 'invalidated' ? ['invalidated_no_score'] : []
        };
    }
    const report = openingSafeguardReport || projectOpeningSafeguardReport(state, viewerSeat);
    const protection = report.openingProtection && typeof report.openingProtection === 'object' ? report.openingProtection : {};
    const buffer = report.secondSeatBuffer && typeof report.secondSeatBuffer === 'object' ? report.secondSeatBuffer : {};
    const counterplay = report.counterplay && typeof report.counterplay === 'object' ? report.counterplay : {};
    const protectedSeats = Array.isArray(protection.protectedSeats)
        ? protection.protectedSeats.filter(item => item === 'A' || item === 'B')
        : [];
    const grantedSeats = Array.isArray(counterplay.grantedSeats)
        ? counterplay.grantedSeats.filter(item => item === 'A' || item === 'B')
        : [];
    const pendingSeats = Array.isArray(counterplay.pendingSeats)
        ? counterplay.pendingSeats.filter(item => item === 'A' || item === 'B')
        : [];
    const viewerHp = Math.max(0, Math.floor(Number(viewer && viewer.hp) || 0));
    const opponentHp = Math.max(0, Math.floor(Number(opponent && opponent.hp) || 0));
    const hpDelta = viewerHp - opponentHp;
    const openingProtectionActive = !!protection.active && protectedSeats.length > 0;
    const currentSeatHasCounterplay = grantedSeats.includes(currentSeat);
    const viewerHasCounterplay = grantedSeats.includes(viewerSeat);
    const opponentHasCounterplay = grantedSeats.includes(opponentSeat);
    const viewerProtected = protectedSeats.includes(viewerSeat);
    const opponentProtected = protectedSeats.includes(opponentSeat);
    const safeguards = [];
    if (openingProtectionActive || status === 'setup') safeguards.push('opening_protection');
    if (Math.max(0, Math.floor(Number(buffer.block) || 0)) > 0) safeguards.push('second_seat_buffer');
    if (grantedSeats.length > 0) safeguards.push('counterplay_granted');
    if (pendingSeats.length > 0 || openingProtectionActive && grantedSeats.length === 0) safeguards.push('counterplay_window_pending');
    if (status === 'setup') safeguards.push('setup_ready_required');
    const pressureState = status === 'setup'
        ? 'setup'
        : currentSeatHasCounterplay || viewerHasCounterplay || opponentHasCounterplay
            ? 'reversal_window'
            : openingProtectionActive
                ? 'opening_window'
                : Math.abs(hpDelta) <= 5 ? 'balanced' : hpDelta > 5 ? 'viewer_advantage' : 'opponent_advantage';
    const pressureLabel = pressureState === 'setup'
        ? '准备观察'
        : pressureState === 'reversal_window'
            ? currentSeat === viewerSeat ? '你的反打窗口' : `${currentSeat} 的反打窗口`
            : pressureState === 'opening_window'
                ? '开局护体窗口'
                : pressureState === 'viewer_advantage' ? '你方血线领先' : pressureState === 'opponent_advantage' ? '对方血线领先' : '血线均衡';
    const agencyLabel = status === 'setup'
        ? '准备阶段'
        : status === 'finished' ? '对局结束' : isViewerTurn ? '你的行动窗口' : `等待 ${currentSeat} 行动`;
    const summaryLine = pressureState === 'setup'
        ? '局势：双方仍在锁谱调息，完成准备后才进入行动窗口。'
        : pressureState === 'reversal_window'
            ? currentSeat === viewerSeat
                ? '局势：你的反打窗口已打开，公开缓冲已发放。'
                : `局势：${currentSeat} 的反打窗口已打开，公开缓冲已发放。`
            : pressureState === 'opening_window'
                ? isViewerTurn
                    ? '局势：你的开局行动窗口，对手仍有开局护体。'
                    : '局势：对手行动中，开局护体仍保护未行动席位。'
                : hpDelta > 5 ? '局势：你方血线领先，继续保留下一手行动窗口。' : hpDelta < -5 ? '局势：对方血线领先，优先寻找反打窗口。' : '局势：血线接近，行动窗口仍在双方之间轮转。';
    const counterplayLine = pressureState === 'setup'
        ? '行动窗口：准备完成后才进入出牌，先手不能在准备阶段秒杀。'
        : pressureState === 'reversal_window'
            ? currentSeat === viewerSeat
                ? '反打窗口：你的反打窗口已生效，先处理护盾缓冲后的首个选择。'
                : `反打窗口：${currentSeat} 已获得公开缓冲，等待其首个行动选择。`
            : openingProtectionActive
                ? viewerProtected && !isViewerTurn
                    ? '反打窗口：若你被护体保住，首个行动窗口会获得缓冲。'
                    : opponentProtected
                        ? '反打窗口：对方若被护体保住，会在首个行动窗口获得缓冲。'
                        : '反打窗口：护体保护仍在，等待受保护方首个行动窗口。'
                : isViewerTurn ? '行动窗口：轮到你行动，按公开血线与护盾选择节奏。' : '行动窗口：等待对手行动，保留下一手反打判断。';
    return {
        reportVersion: 'pvp-live-duel-momentum-v1',
        sourceVisibility: 'public_state',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        viewerSeat,
        opponentSeat,
        currentSeat,
        isViewerTurn,
        viewerHpPct: getHpPct(viewer),
        opponentHpPct: getHpPct(opponent),
        hpDelta,
        pressureState,
        pressureLabel,
        agencyLabel,
        summaryLine,
        counterplayLine,
        safeguards: Array.from(new Set(safeguards)).slice(0, 8)
    };
}

function projectStateView(state, seatId) {
    if (!state || !state.seats || !state.seats[seatId]) {
        throw new Error(`Cannot project live PVP state for seat: ${seatId}`);
    }
    const opponentSeatId = seatId === 'A' ? 'B' : 'A';
    const openingSafeguardReport = projectOpeningSafeguardReport(state, seatId);
    return {
        matchId: state.matchId,
        ruleVersion: state.ruleVersion,
        mode: state.mode === 'friendly' ? 'friendly' : 'ranked',
        status: state.status,
        phase: state.phase,
        stateVersion: state.stateVersion,
        roundIndex: state.roundIndex,
        turnIndex: state.turnIndex,
        currentSeat: state.currentSeat,
        setup: state.setup ? {
            readyDeadlineAt: Math.max(0, Math.floor(Number(state.setup.readyDeadlineAt) || 0)),
            firstSeat: state.setup.firstSeat || 'A',
            mulliganLimit: Math.max(0, Math.floor(Number(state.setup.mulliganLimit) || 0))
        } : null,
        matchQuality: projectMatchQuality(state.matchQuality),
        friendlySeries: projectFriendlySeries(state.friendlySeries, state.status),
        firstMatchGuide: projectFirstMatchGuide(state.firstMatchGuide, state.status),
        loadoutExplorationReport: projectLoadoutExplorationReport(state.loadoutExplorationReport),
        openingSafeguardReport,
        actionPreviewReport: projectActionPreviewReport(state, seatId),
        actionReceiptReport: projectActionReceiptReport(state, seatId),
        duelMomentumReport: projectDuelMomentumReport(state, seatId, openingSafeguardReport),
        settlementReport: projectSettlementReport(state, seatId),
        postMatchReview: projectPostMatchReview(state, seatId),
        self: projectSelfSeat(state.seats[seatId]),
        opponent: projectPublicSeat(state.seats[opponentSeatId]),
        recentEvents: state.events.slice(-20).map(sanitizePublicEvent)
    };
}

module.exports = {
    projectStateView
};
