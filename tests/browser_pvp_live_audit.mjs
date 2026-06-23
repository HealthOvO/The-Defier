import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/web-pvp-live-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];
const visibleProtocolPattern = /connection_timeout|turn_timeout|ready_timeout|ranked_authoritative|swap_sides|forfeit_disconnect/;

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

async function safeElementScreenshot(page, selector, outputPath) {
  try {
    await page.addStyleTag({
      content: '*, *::before, *::after { animation: none !important; transition: none !important; }'
    }).catch(() => {});
    const target = page.locator(selector).first();
    await target.waitFor({ state: 'visible', timeout: 5000 });
    await target.screenshot({ path: outputPath, timeout: 12000, animations: 'disabled' });
  } catch (err) {
    console.warn(`[browser_pvp_live_audit] screenshot skipped (${selector}): ${err?.message || err}`);
  }
}

(async () => {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(String(err));
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const authActive = await page.evaluate(() => !!document.getElementById('auth-modal')?.classList.contains('active'));
  if (authActive) {
    await page.click('#auth-modal .modal-close', { timeout: 3000, force: true }).catch(() => {});
    await page.waitForTimeout(200);
  }

  await page.evaluate(() => {
    window.__livePvpAuditCalls = [];
    const push = (entry) => window.__livePvpAuditCalls.push(entry);
    const selfLoadoutSummary = {
      loadoutHash: 'hash-self-sword-123456',
      label: '破阵斗法谱',
      identitySlot: 'sword',
      deckSize: 20,
      locked: true,
    };
    const opponentPublicProfile = {
      reportVersion: 'pvp-live-ranked-opponent-profile-v1',
      sourceVisibility: 'ranked_public_boundary',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      alias: '对手',
      archetypeLabel: '流派待观察',
      divisionBucket: 'unrated_mvp',
      revealPolicy: 'no_precombat_build_reveal',
      boundaryLine: '排位只展示公开状态，不展示对手斗法谱、hash 或身份槽。',
    };
    const makeFirstMatchGuide = (status = 'setup') => ({
      reportVersion: 'pvp-live-first-match-guide-v1',
      title: '首战简报',
      summary: '先确认斗法谱，再调息准备；开局保护会防止未行动方被直接终结。',
      nextAction: {
        setup: '先调息手牌，确认准备后再开战。',
        active: '按当前行动席位出牌，留意权威事件。',
        finished: '对局已结束，查看结算后可重新排队。',
        invalidated: '本局未开战成功，不计正式积分，可重新匹配。',
      }[status] || '先调息手牌，确认准备后再开战。',
      safeguards: ['server_authoritative', 'snapshot_locked', 'setup_ready_required', 'opening_protection', 'invalidated_no_score'],
      steps: [
        { id: 'mode_boundary', label: '模式', detail: '真人排位只匹配真实在线玩家，不接旧残影。' },
        { id: 'snapshot_locked', label: '锁谱', detail: '入队后斗法谱由服务端锁定，本局不能中途改谱。' },
        { id: 'setup_ready', label: '调息', detail: '准备阶段可调息 0-2 张手牌，双方确认准备后才开战。' },
        { id: 'opening_protection', label: '护体', detail: '未获得行动回合的一方不会被开局伤害直接终结。' },
        { id: 'invalidated_no_score', label: '无效局', detail: '准备超时会成为无效局，不写正式积分。' },
      ],
      recommendedLoadouts: [
        { id: 'balanced', label: '默认斗法谱', role: '攻防均衡，适合首战熟悉流程。', weakness: '弱点：缺少极限爆发。' },
        { id: 'sword', label: '破阵斗法谱', role: '更容易制造压力，适合主动试探。', weakness: '弱点：防守窗口较窄。' },
        { id: 'shield', label: '守势斗法谱', role: '前两手更稳，适合先观察对方节奏。', weakness: '弱点：收束较慢。' },
      ],
      exceptionBranches: [
        { id: 'no_real_player_120s', label: '120 秒无真人', detail: '可以继续等待，也可以取消匹配；不会自动切到残影。' },
        { id: 'wide_match', label: '宽跨度匹配', detail: '只有双方都确认，才会放宽匹配跨度。' },
        { id: 'disconnect_grace', label: '匹配后断线', detail: '先进入重连宽限，不会立即判负。' },
        { id: 'ready_timeout', label: '准备超时', detail: '本局未开战成功，不写正式积分。' },
        { id: 'refresh_required', label: '需要同步', detail: '刷新权威局面后再继续行动。' },
      ],
      reviewActions: [
        { id: 'review_events', label: '查看权威事件' },
        { id: 'adjust_loadout', label: '调整斗法谱' },
        { id: 'queue_again', label: '继续真人排位' },
      ],
    });
    const makeLoadoutExplorationReport = () => ({
      reportVersion: 'pvp-live-loadout-exploration-v1',
      contentPackVersion: 'pvp-live-v1-content-pack',
      sourceVisibility: 'public_content',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      title: '谱系探索',
      summary: '每套谱都给出公开弱点、替换方向和练习课题，鼓励下一局有目标地调整。',
      progressionBoundary: '熟练徽章与高光收藏只记录荣誉，不改变生命、伤害、抽牌、灵力、起手或匹配。',
      profiles: [
        {
          id: 'aggro_pressure',
          label: '快攻压迫',
          primaryDecisionAxis: '前两手压血后，是继续抢节奏还是保留低费防御。',
          funHook: '用快速压迫制造紧张感，但必须证明优势来自连续公开窗口。',
          skillTest: '首动预算挡下爆发后，能否用第二段伤害和调息顺序继续收束。',
          publicWeakness: '第一波被护盾或回复挡住后，手牌续航和防守窗口都会变窄。',
          swapSlots: [
            { id: 'aggro_defense_pair', label: '低费防御位', detail: '测试被反打时的稳定性。' },
            { id: 'aggro_setup_pair', label: '公开 setup 位', detail: '补入可见铺垫。' },
          ],
          practiceTopic: { id: 'practice_after_budget_clamp', label: '首动预算后继续施压', detail: '练习爆发被压低后的下一手。' },
          masteryBoundary: '熟练徽章和高光收藏只记录荣誉，不改变生命、伤害、抽牌、灵力、起手或匹配。',
        },
        {
          id: 'shield_counter',
          label: '守势反击',
          primaryDecisionAxis: '先把护盾转成反击，还是继续稳血拖到长局评分。',
          funHook: '被压迫时仍有反击目标，败方不只是被动挨打。',
          skillTest: '能否识别对手爆发后的空窗，把防御资源转成伤害。',
          publicWeakness: '收束慢，连续空防会让对手调息找到第二波压力。',
          swapSlots: [
            { id: 'shield_finisher_pair', label: '反击终结位', detail: '提高护盾后反打速度。' },
            { id: 'shield_draw_pair', label: '续航位', detail: '提升长局稳定性。' },
          ],
          practiceTopic: { id: 'practice_block_to_counter', label: '护盾转反击', detail: '练习把防守窗口转成反压。' },
          masteryBoundary: '熟练徽章和高光收藏只记录荣誉，不改变生命、伤害、抽牌、灵力、起手或匹配。',
        },
        {
          id: 'draw_midrange',
          label: '过牌中速',
          primaryDecisionAxis: '用调息找稳定路线，还是直接消耗资源换即时压力。',
          funHook: '每局都有不同资源路线，适合持续优化手牌规划。',
          skillTest: '能否把过牌变成有效行动，而不是只让回合更慢。',
          publicWeakness: '爆发和防守都不极端，遇到专精谱时需要靠调度取胜。',
          swapSlots: [
            { id: 'midrange_burst_pair', label: '爆发补强位', detail: '提高终局速度。' },
            { id: 'midrange_guard_pair', label: '稳血位', detail: '提高抗快攻能力。' },
          ],
          practiceTopic: { id: 'practice_draw_to_action', label: '过牌转行动', detail: '练习调息后形成明确结果。' },
          masteryBoundary: '熟练徽章和高光收藏只记录荣誉，不改变生命、伤害、抽牌、灵力、起手或匹配。',
        },
      ],
    });
    const makePostMatchReview = (status = 'setup') => status === 'finished' ? ({
      reportVersion: 'pvp-live-post-match-review-v1',
      result: 'loss',
      winnerSeat: 'B',
      loserSeat: 'A',
      finishReason: 'surrender',
      title: '首败复盘 MVP',
      summary: '本局由认输结束，先回看最后两条权威事件，再决定是否调整斗法谱。',
      evidence: [
        { eventType: 'snapshot_locked', sequence: 1, actingSeat: '' },
        { eventType: 'mulligan_completed', sequence: 2, actingSeat: 'A', publicData: { seatId: 'A', count: 1 } },
        { eventType: 'player_ready', sequence: 3, actingSeat: 'A', publicData: { seatId: 'A' } },
        { eventType: 'player_ready', sequence: 4, actingSeat: 'B', publicData: { seatId: 'B' } },
        { eventType: 'battle_started', sequence: 5, actingSeat: 'B', publicData: { firstSeat: 'A' } },
        { eventType: 'card_played', sequence: 6, actingSeat: 'A', publicData: { cost: 1, remainingEnergy: 2 } },
        { eventType: 'turn_ended', sequence: 7, actingSeat: 'A', publicData: { nextSeat: 'B' } },
        { eventType: 'block_gained', sequence: 8, actingSeat: 'B', publicData: { block: 3, seatId: 'B', totalBlock: 3 } },
        { eventType: 'player_surrendered', sequence: 9, actingSeat: 'A', publicData: { loserSeat: 'A', winnerSeat: 'B' } },
        { eventType: 'match_finished', sequence: 10, actingSeat: 'A', publicData: { winnerSeat: 'B', loserSeat: 'A', finishReason: 'surrender' } },
      ],
      keyTurnReplay: {
        reportVersion: 'pvp-live-key-turn-replay-v1',
        title: '首败关键回合',
        sourceVisibility: 'public_events',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        summary: '只根据公开事件拆出开战、压力和终局窗口。',
        recommendedAction: 'practice',
        turns: [
          { id: 'opening_window', label: '开战窗口', sequence: 5, eventType: 'battle_started', actingSeat: 'B', severity: 'setup', lesson: '先确认首动预算和调息结果。' },
          { id: 'pressure_window', label: '压力窗口', sequence: 6, eventType: 'card_played', actingSeat: 'A', severity: 'swing', lesson: '这里决定是否需要改成守势谱。' },
          { id: 'terminal_window', label: '终局选择', sequence: 10, eventType: 'match_finished', actingSeat: 'A', severity: 'terminal', lesson: '终局只记录结果，真正要练的是前一手。' },
        ],
      },
      experienceReport: {
        reportVersion: 'pvp-live-experience-report-v1',
        title: '双方体验诊断',
        sourceVisibility: 'public_events',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        nonGameRisk: 'low',
        nonGameRiskReasons: ['public_events_show_readable_windows'],
        agencyLabel: '双方均有可读窗口',
        decisionWindowCount: 2,
        seatWindowSummary: {
          firstSeat: 'A',
          secondSeat: 'B',
          secondSeatWindowObserved: true,
          terminalBeforeSecondSeatWindow: false,
        },
        effectiveActionReport: {
          reportVersion: 'pvp-live-effective-action-report-v1',
          sourceVisibility: 'public_events',
          usesHiddenInformation: false,
          rankedImpact: 'none',
          secondSeat: 'B',
          secondSeatState: 'confirmed',
          observedActionKinds: ['block_gained'],
          reasons: ['public_positive_second_seat_action'],
          evidence: [
            { eventType: 'block_gained', sequence: 8, actingSeat: 'B', publicData: { block: 3, seatId: 'B', totalBlock: 3 } },
          ],
          summary: '公开事件显示后手窗口产生了护盾等正向行动。',
        },
        safeguardSummary: {
          setupReady: 'confirmed',
          firstActionBudget: 'not_triggered',
          openingProtection: 'not_needed',
          effectiveAction: 'confirmed',
        },
        summary: '本局公开轨迹能解释开战、压力和终局，不属于无解释先手秒杀。',
        recommendedAction: 'queue_again',
        fairnessChecks: [
          { id: 'setup_ready_required', label: '双方确认开战', passed: true, detail: '公开事件显示双方准备后才开战。', linkedEvidence: [
            { eventType: 'player_ready', sequence: 3, actingSeat: 'A', publicData: { seatId: 'A' } },
            { eventType: 'player_ready', sequence: 4, actingSeat: 'B', publicData: { seatId: 'B' } },
            { eventType: 'battle_started', sequence: 5, actingSeat: 'B', publicData: { firstSeat: 'A' } },
          ] },
          { id: 'first_action_budget', label: '首动爆发预算', passed: true, detail: '本局按首动预算规则运行。', linkedEvidence: [
            { eventType: 'battle_started', sequence: 5, actingSeat: 'B', publicData: { firstSeat: 'A' } },
            { eventType: 'card_played', sequence: 6, actingSeat: 'A', publicData: { cost: 1, remainingEnergy: 2 } },
          ] },
          { id: 'opening_protection', label: '开局护体', passed: true, detail: '未行动方不会被开局直接终结。', linkedEvidence: [
            { eventType: 'battle_started', sequence: 5, actingSeat: 'B', publicData: { firstSeat: 'A' } },
            { eventType: 'turn_ended', sequence: 7, actingSeat: 'A', publicData: { nextSeat: 'B' } },
          ] },
          { id: 'decision_windows', label: '公开决策窗口', passed: true, detail: '公开事件至少覆盖 2 个行动席位。', linkedEvidence: [
            { eventType: 'battle_started', sequence: 5, actingSeat: 'B', publicData: { firstSeat: 'A' } },
            { eventType: 'turn_ended', sequence: 7, actingSeat: 'A', publicData: { nextSeat: 'B' } },
          ] },
          { id: 'second_seat_effective_action', label: '后手有效行动', passed: true, detail: '公开事件显示后手窗口产生了能改变局面的正向行动。', linkedEvidence: [
            { eventType: 'block_gained', sequence: 8, actingSeat: 'B', publicData: { block: 3, seatId: 'B', totalBlock: 3 } },
          ] },
        ],
      },
      fairnessReceipt: {
        reportVersion: 'pvp-live-fairness-receipt-v1',
        sourceVisibility: 'public_events',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        result: 'loss',
        finishReason: 'surrender',
        receiptState: 'accepted',
        riskState: 'low',
        agencyLabel: '双方均有可读窗口',
        setupVerdict: '开战回执：双方准备公开确认后才进入战斗。',
        fairnessVerdict: '公平回执：公开事件能解释开战、压力和终局，不属于无解释先手秒杀。',
        budgetVerdict: '本局按首动预算规则运行。',
        counterplayVerdict: '反打回执：护体未触发，但公开事件显示双方已有行动窗口。',
        windowVerdict: '行动窗口：公开事件至少覆盖 2 个行动席位。',
        effectiveActionVerdict: '有效行动：后手公开窗口已产生能改变局面的正向行动。',
        terminalVerdict: '终局边界：认输只说明本局提前结束，真正要复盘的是认输前公开压力。',
        nextStepLine: '下一步：按回执里的压力窗口调整斗法谱或进入问道练习。',
        evidenceSummary: [
          { id: 'setup_ready_required', label: '双方确认开战', passed: true, evidenceSequences: [3, 4, 5] },
          { id: 'first_action_budget', label: '首动爆发预算', passed: true, evidenceSequences: [5, 6] },
          { id: 'opening_protection', label: '开局护体', passed: true, evidenceSequences: [5, 7] },
          { id: 'decision_windows', label: '公开决策窗口', passed: true, evidenceSequences: [5, 7] },
          { id: 'second_seat_effective_action', label: '后手有效行动', passed: true, evidenceSequences: [8] },
        ],
        boundary: '公平回执只汇总公开复盘证据，不读取隐藏手牌、牌库或原始事件明细，也不改正式积分或结算。',
      },
      loadoutRecommendation: {
        reportVersion: 'pvp-live-loadout-recommendation-v1',
        sourceVisibility: 'public_events_and_public_content',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        recommendedPresetId: 'shield',
        recommendedPresetLabel: '守势斗法谱',
        reasonLine: '本局公开轨迹显示血线被压低，下一局先套用守势斗法谱测试低费防御窗口。',
        practiceLine: '配合问道练习复刻开战与反打窗口。',
        boundaryLine: '一键套用只改下一局入队候选，不自动排队、不写正式积分。',
        evidenceRefs: [
          { eventType: 'damage_applied', sequence: 6, actingSeat: 'A' },
          { eventType: 'turn_ended', sequence: 7, actingSeat: 'A' },
          { eventType: 'match_finished', sequence: 8, actingSeat: 'B' },
        ],
      },
      suggestions: [
        '查看认输前的生命、灵力和手牌窗口，确认是不是过早放弃。',
        '如果连续被压低血线，下一局先换守势斗法谱或保留低费防御。',
      ],
      nextActions: [
        { id: 'review_events', auditActionId: 'review_events', label: '查看权威事件' },
        { id: 'review_key_turns', auditActionId: 'key_turn_replay', label: '关键回合复盘' },
        { id: 'friendly_rematch', auditActionId: 'friendly_rematch', label: '低压力再战' },
        { id: 'adjust_loadout', auditActionId: 'apply_loadout_recommendation', label: '调整斗法谱' },
        { id: 'practice', auditActionId: 'practice_topic', label: '问道练习' },
        { id: 'queue_again', auditActionId: 'queue_again', label: '继续真人排位' },
        { id: 'report_issue', auditActionId: 'report_issue', label: '举报异常' },
      ],
    }) : null;
    const makeTurnTimer = (status, currentSeat, viewerSeat = 'A') => {
      if (status !== 'setup' && status !== 'active') return null;
      const lowTimerMode = status === 'active' && String(window.__livePvpAuditTurnTimerMode || '') === 'low';
      const timeoutMs = status === 'setup' ? 45000 : 90000;
      const startedAt = lowTimerMode ? Date.now() - 81000 : Date.now();
      return {
        reportVersion: 'pvp-live-turn-timer-v1',
        phase: status === 'setup' ? 'setup' : 'active',
        currentSeat: status === 'setup' ? '' : currentSeat,
        viewerSeat,
        isViewerTurn: status === 'active' && currentSeat === viewerSeat,
        startedAt,
        deadlineAt: startedAt + timeoutMs,
        timeoutMs,
        remainingMs: timeoutMs,
      };
    };
    const makeConnectionReport = (mode = window.__livePvpAuditConnectionMode || 'online') => {
      const rawMode = String(mode || 'online');
      const viewerStatus = rawMode === 'viewer_grace' ? 'grace' : rawMode === 'viewer_disconnected' ? 'disconnected' : 'online';
      const opponentDisconnectedModes = ['active_opponent_disconnected_non_turn', 'active_opponent_disconnected_current_turn'];
      const status = opponentDisconnectedModes.includes(rawMode)
        ? 'disconnected'
        : ['online', 'grace', 'disconnected'].includes(rawMode) ? rawMode : 'online';
      const lastHeartbeatAt = status === 'online' ? Date.now() : Date.now() - 16000;
      const viewerLastHeartbeatAt = viewerStatus === 'online' ? Date.now() : Date.now() - 16000;
      const remainingGraceMs = status === 'grace' ? 18000 : 0;
      const viewerRemainingGraceMs = viewerStatus === 'grace' ? 17000 : 0;
      return {
        reportVersion: 'pvp-live-connection-v1',
        connectionHealth: viewerStatus !== 'online'
          ? (viewerStatus === 'grace' ? 'viewer_grace' : 'viewer_disconnected')
          : status === 'online' ? 'good' : status === 'grace' ? 'opponent_grace' : 'opponent_disconnected',
        viewerSeat: 'A',
        opponentSeat: 'B',
        heartbeatIntervalMs: 5000,
        heartbeatStaleMs: 15000,
        graceMs: 30000,
        viewer: {
          seatId: 'A',
          status: viewerStatus,
          isViewer: true,
          lastHeartbeatAt: viewerLastHeartbeatAt,
          elapsedMs: viewerStatus === 'online' ? 0 : 16000,
          remainingGraceMs: viewerRemainingGraceMs,
        },
        opponent: {
          seatId: 'B',
          status,
          isViewer: false,
          lastHeartbeatAt,
          elapsedMs: status === 'online' ? 0 : 16000,
          remainingGraceMs,
        },
      };
    };
    const makeOpeningSafeguardReport = (stateVersion = 1, currentSeat = 'A', status = 'setup') => {
      const active = status === 'active';
      const setup = status === 'setup';
      return {
        reportVersion: 'pvp-live-opening-safeguard-v1',
        status: active ? 'armed' : setup ? 'preview' : 'closed',
        currentSeat,
        viewerSeat: 'A',
        firstSeat: 'A',
        secondSeat: 'B',
        damageBudget: {
          firstSeat: 18,
          secondSeat: 22,
          secondAction: 28,
          currentSeat,
          currentActionBudget: active ? currentSeat === 'A' ? 18 : 22 : null,
        },
        openingProtection: {
          minimumHp: 1,
          protectedSeats: active ? ['B'] : setup ? ['A', 'B'] : [],
          active,
          summary: '未完成首个回合的席位不会被开局伤害直接终结。',
        },
        secondSeatBuffer: {
          block: 3,
          seatId: 'B',
          active,
          summary: '后手开局获得 3 点公开护盾，抵消先动节奏差。',
        },
        counterplay: {
          block: 8,
          pendingSeats: [],
          grantedSeats: active && stateVersion >= 4 ? ['B'] : [],
          summary: '护体后首个行动窗口会获得 8 点护盾缓冲。',
        },
        sourceVisibility: 'public_state',
        usesHiddenInformation: false,
        rankedImpact: 'none',
      };
    };
    const makeDuelMomentumReport = (stateVersion = 1, currentSeat = 'A', status = 'setup') => {
      const active = status === 'active';
      const counterplayGranted = active && stateVersion >= 4;
      const viewerTurn = active && currentSeat === 'A';
      const opponentHp = stateVersion > 1 ? 42 : 50;
      if (status !== 'setup' && status !== 'active') {
        const pressureState = status === 'finished' ? 'finished' : status === 'invalidated' ? 'invalidated' : 'closed';
        return {
          reportVersion: 'pvp-live-duel-momentum-v1',
          sourceVisibility: 'public_state',
          usesHiddenInformation: false,
          rankedImpact: 'none',
          viewerSeat: 'A',
          opponentSeat: 'B',
          currentSeat,
          isViewerTurn: false,
          viewerHpPct: 100,
          opponentHpPct: Math.round((opponentHp / 50) * 100),
          hpDelta: 50 - opponentHp,
          pressureState,
          pressureLabel: pressureState === 'finished' ? '对局结束' : pressureState === 'invalidated' ? '无效局' : '局势关闭',
          agencyLabel: pressureState === 'finished' ? '对局结束' : pressureState === 'invalidated' ? '无效局' : '局势关闭',
          summaryLine: pressureState === 'finished'
            ? '局势：对局已结束，行动窗口已关闭。'
            : pressureState === 'invalidated'
              ? '局势：无效局，本局未开战成功，不计正式积分。'
              : '局势：当前没有可行动窗口。',
          counterplayLine: pressureState === 'finished'
            ? '行动窗口：本局已进入赛后复盘。'
            : pressureState === 'invalidated'
              ? '行动窗口：无效局不计正式积分，不产生先手击杀或奖励。'
              : '行动窗口：等待新的真人对局。',
          safeguards: pressureState === 'invalidated' ? ['invalidated_no_score'] : [],
        };
      }
      return {
        reportVersion: 'pvp-live-duel-momentum-v1',
        sourceVisibility: 'public_state',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        viewerSeat: 'A',
        opponentSeat: 'B',
        currentSeat,
        isViewerTurn: viewerTurn,
        viewerHpPct: 100,
        opponentHpPct: Math.round((opponentHp / 50) * 100),
        hpDelta: 50 - opponentHp,
        pressureState: counterplayGranted ? 'reversal_window' : active ? 'opening_window' : 'setup',
        pressureLabel: counterplayGranted ? '对手反打窗口' : active ? '开局护体窗口' : '准备观察',
        agencyLabel: !active ? '准备阶段' : viewerTurn ? '你的行动窗口' : '等待对手行动',
        summaryLine: counterplayGranted
          ? '局势：B 已进入反打窗口，A 看到公开缓冲已发放。'
          : active
            ? '局势：开局护体仍在，A 正在行动；B 仍有行动窗口。'
            : '局势：双方仍在准备，先看锁谱和调息。'
        ,
        counterplayLine: counterplayGranted
          ? '反打窗口：B 已获得公开缓冲，等待其首个行动选择。'
          : active
            ? '反打窗口：B 若被护体保住，会在首个行动窗口获得缓冲。'
            : '行动窗口：准备完成后才进入出牌，先手不能在准备阶段秒杀。'
        ,
        safeguards: counterplayGranted
          ? ['opening_protection', 'second_seat_buffer', 'counterplay_granted']
          : ['opening_protection', 'second_seat_buffer', 'counterplay_window_pending'],
      };
    };
    const makeIntentSignalReport = (stateVersion = 1, currentSeat = 'A', status = 'setup') => {
      const active = status === 'active';
      const targetSeat = currentSeat === 'A' ? 'B' : 'A';
      if (status !== 'setup' && status !== 'active') {
        const signalState = status === 'finished' ? 'finished' : status === 'invalidated' ? 'invalidated' : 'closed';
        return {
          reportVersion: 'pvp-live-intent-signal-v1',
          sourceVisibility: 'public_state_and_public_content',
          usesHiddenInformation: false,
          rankedImpact: 'none',
          viewerSeat: 'A',
          opponentSeat: 'B',
          currentSeat,
          isViewerTurn: false,
          signalState,
          signalLabel: signalState === 'invalidated' ? '无效局' : signalState === 'finished' ? '对局结束' : '读牌关闭',
          intentLine: signalState === 'invalidated' ? '读牌：本局无效，不产生正式积分压力。' : '读牌：当前没有公开行动窗口。',
          responseLine: signalState === 'invalidated' ? '反制窗口：无效局不会产生先手击杀、奖励或正式扣分。' : '反制窗口：等待新的真人行动窗口。',
          threat: {
            actorSeat: currentSeat,
            targetSeat,
            actorEnergy: 3,
            publicRawDamageCeiling: 0,
            publicDamageCeiling: 0,
            publicBlockCeiling: 0,
            damageBudget: null,
            blockedByCurrentBlock: 0,
            targetHpBefore: 50,
            targetHpAfter: 50,
            targetBlock: 0,
            openingProtectionWouldTrigger: false,
          },
          responseWindow: {
            defenderSeat: targetSeat,
            hasOpeningProtection: false,
            hasPendingCounterplay: false,
            counterplayBlock: 0,
            defenderBlock: 0,
            defenderHp: 50,
          },
          safeguards: ['public_card_catalog_only', 'private_card_projection_blocked'],
        };
      }
      return {
        reportVersion: 'pvp-live-intent-signal-v1',
        sourceVisibility: 'public_state_and_public_content',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        viewerSeat: 'A',
        opponentSeat: 'B',
        currentSeat,
        isViewerTurn: active && currentSeat === 'A',
        signalState: active ? 'opening_pressure' : 'setup_read',
        signalLabel: active ? '公开压迫' : '准备读牌',
        intentLine: active
          ? '读牌：A 当前 3 能量，公开牌池上限可造成 15 点生命压力；B 预计保留 35 血。'
          : '读牌：双方仍在准备，公开牌池上限只在开战后进入行动窗口。',
        responseLine: active
          ? '反制窗口：B 仍有开局护体与反打缓冲，先手不能直接终结。'
          : '反制窗口：准备完成前不能出牌，先手不能在准备阶段秒杀。',
        threat: {
          actorSeat: currentSeat,
          targetSeat,
          actorEnergy: 3,
          publicRawDamageCeiling: active ? 18 : 0,
          publicDamageCeiling: active ? 15 : 0,
          publicBlockCeiling: active ? 10 : 0,
          damageBudget: active ? 18 : null,
          blockedByCurrentBlock: active ? 3 : 0,
          targetHpBefore: 50,
          targetHpAfter: active ? 35 : 50,
          targetBlock: active ? 3 : 0,
          openingProtectionWouldTrigger: false,
        },
        responseWindow: {
          defenderSeat: targetSeat,
          hasOpeningProtection: active,
          hasPendingCounterplay: active,
          counterplayBlock: active ? 8 : 0,
          defenderBlock: active ? 3 : 0,
          defenderHp: 50,
        },
        safeguards: active
          ? ['public_card_catalog_only', 'private_card_projection_blocked', 'opening_protection', 'counterplay_window_pending']
          : ['public_card_catalog_only', 'private_card_projection_blocked', 'setup_ready_required', 'opening_protection'],
      };
    };
    const makeStateView = (stateVersion = 1, currentSeat = 'A', status = 'setup') => ({
      matchId: 'pvplm-browser-live',
      ruleVersion: 'pvp-live-v1',
      mode: 'ranked',
      status,
      matchQuality: {
        reportVersion: 'pvp-live-match-quality-v1',
        tag: 'good',
        ruleVersion: 'pvp-live-v1',
        expansionStage: 'mvp_open_pool',
        ratingDeltaBucket: 'unrated_mvp',
        waitMs: { A: 3200, B: 0 },
        candidatePoolSize: 2,
        connectionHealth: 'pass',
        connectionHealthSummary: {
          reportVersion: 'pvp-live-queue-connection-health-v1',
          status: 'pass',
          sampleTag: 'client_preflight',
          sampleWindowMs: 1,
          reasons: [],
        },
        safeguards: ['server_authoritative', 'snapshot_locked', 'setup_ready_required', 'connection_health_gate'],
      },
      openerAssignment: {
        reportVersion: 'pvp-live-opener-assignment-v1',
        sourceVisibility: 'server_authoritative_public_seed',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        firstSeat: 'A',
        secondSeat: 'B',
        viewerSeat: 'A',
        opponentSeat: 'B',
        viewerStarts: true,
        seedTag: 'browser-live',
        queueOrderBinding: false,
        hostBinding: false,
      },
      openingSafeguardReport: makeOpeningSafeguardReport(stateVersion, currentSeat, status),
      actionPreviewReport: {
        reportVersion: 'pvp-live-action-preview-v1',
        sourceVisibility: 'viewer_public_state',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        viewerSeat: 'A',
        currentSeat,
        isViewerTurn: status === 'active' && currentSeat === 'A',
        playableCards: status === 'active' && currentSeat === 'A' ? [{
          cardInstanceId: 'A-strike-1',
          cardName: '试探斩',
          targetSeat: 'B',
          rawDamage: 8,
          damageBudget: 18,
          budgetedDamage: 8,
          blockedDamage: 3,
          hpDamage: 5,
          targetHpAfter: 45,
          openingProtection: {
            willTrigger: false,
            minimumHp: 1,
            preventedDamage: 0,
          },
          blockGain: 0,
          summaryLine: '试探斩：预算后 8，破盾 3，生命伤害 5，B 预计 45 血。',
        }] : [],
        endTurn: status === 'active' && currentSeat === 'A'
          ? { nextSeat: 'B', summaryLine: '结束回合后行动权交给 B。' }
          : null,
      },
      actionReceiptReport: stateVersion >= 4 ? {
        reportVersion: 'pvp-live-action-receipt-v1',
        sourceVisibility: 'authoritative_public_projection',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        viewerSeat: 'A',
        actingSeat: 'A',
        actionType: 'play_card',
        latestSequence: 6,
        cardName: '试探斩',
        summaryLine: 'A 打出试探斩：预算后 8，破盾 3，生命伤害 5，B 剩余 45 血。',
        damage: {
          targetSeat: 'B',
          rawDamage: 8,
          budgetedDamage: 8,
          preventedByBudget: 0,
          blockedDamage: 3,
          hpDamage: 5,
          targetHpAfter: 45,
        },
        openingProtection: {
          triggered: false,
          protectedSeat: '',
          minimumHp: 1,
          preventedDamage: 0,
        },
        safeguards: ['public_events', 'public_block'],
      } : null,
      duelMomentumReport: makeDuelMomentumReport(stateVersion, currentSeat, status),
      intentSignalReport: makeIntentSignalReport(stateVersion, currentSeat, status),
      firstMatchGuide: makeFirstMatchGuide(status),
      loadoutExplorationReport: makeLoadoutExplorationReport(),
      postMatchReview: makePostMatchReview(status),
      setup: status === 'setup' ? { readyDeadlineAt: Date.now() + 45000, mulliganLimit: 2 } : null,
      turnTimer: makeTurnTimer(status, currentSeat),
      connectionReport: makeConnectionReport(),
      stateVersion,
      roundIndex: 1,
      turnIndex: stateVersion,
      currentSeat,
      self: {
        seatId: 'A',
        displayName: '甲',
        loadoutHash: selfLoadoutSummary.loadoutHash,
        loadoutSummary: selfLoadoutSummary,
        loadoutSnapshot: {
          ...selfLoadoutSummary,
          deck: Array.from({ length: 20 }, (_, index) => ({ id: index % 2 ? 'pvp_strike' : 'pvp_guard', upgraded: false })),
        },
        hp: 50,
        maxHp: 50,
        energy: 3,
        maxEnergy: 3,
        block: 0,
        ready: status === 'active',
        mulliganUsed: stateVersion > 1,
        hand: status === 'finished' ? [] : [
          { instanceId: 'A-strike-1', cardId: 'pvp_strike', name: '试探斩', cost: 1, damage: 8, block: 0 },
        ],
      },
      opponent: {
        seatId: 'B',
        hp: stateVersion > 1 ? 42 : 50,
        maxHp: 50,
        energy: 3,
        maxEnergy: 3,
        block: 0,
        handCount: 3,
        deckCount: 12,
        discardCount: 0,
        ready: status === 'active',
        publicProfile: opponentPublicProfile,
      },
      recentEvents: [{ eventType: 'snapshot_locked', publicData: { ruleVersion: 'pvp-live-v1', snapshotPolicy: 'server_locked_hidden_until_self_view', seatCount: 2 } }],
    });
    window.__makeLivePvpAuditStateView = makeStateView;
    const makeFriendlyOpenerAssignment = (firstSeat = 'A') => ({
      reportVersion: 'pvp-live-opener-assignment-v1',
      sourceVisibility: 'server_authoritative_series_contract',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      firstSeat,
      secondSeat: firstSeat === 'A' ? 'B' : 'A',
      viewerSeat: 'A',
      opponentSeat: 'B',
      viewerStarts: firstSeat === 'A',
      policy: 'friendly_series_rotating_opener',
      seedTag: 'browser-friendly',
      queueOrderBinding: false,
      hostBinding: false,
      boundaryLine: '友谊 Bo3 按源对局席位轮换先手；换边再战时，首动窗口也会随源玩家轮换。',
    });
    const makeFriendlySeries = (status = 'matched', confirmationCount = 2, overrides = {}) => ({
      reportVersion: 'pvp-live-friendly-series-v1',
      sourceMatchId: 'pvplm-browser-live',
      originMatchId: 'pvplm-browser-live',
      seriesId: 'pvpls-browser-live',
      status,
      format: 'bo3_mvp',
      targetWins: 2,
      maxRounds: 3,
      roundIndex: 2,
      roundLabel: 'Bo3 第 2 局 · 换边再战',
      seriesStatus: 'ongoing',
      scoreBySourceSeat: { A: 1, B: 0 },
      sourceParticipants: {
        A: { sourceSeat: 'A', displayName: '甲' },
        B: { sourceSeat: 'B', displayName: '乙' },
      },
      leaderSourceSeat: 'A',
      winnerSourceSeat: '',
      canRequestNextRound: false,
      rankedImpact: 'none',
      formalResultPolicy: 'practice_only',
      seatPolicy: 'swap_sides',
      openerPolicy: 'friendly_series_rotating_opener',
      openingFirstSourceSeat: 'A',
      roundFirstSourceSeat: 'B',
      loadoutPolicy: 'per_game_change_allowed',
      confirmationCount,
      safeguards: ['friendly_no_ranked_impact', 'seat_rotation', 'alternating_opener'],
      ...overrides,
    });
    window.__makeLivePvpAuditFriendlySeries = makeFriendlySeries;
    window.__makeLivePvpAuditFriendlyView = () => ({
      ...makeStateView(1, 'B', 'setup'),
      matchId: 'pvplm-browser-friendly',
      mode: 'friendly',
      openerAssignment: makeFriendlyOpenerAssignment('A'),
      friendlySeries: makeFriendlySeries('matched', 2),
    });
    window.__makeLivePvpAuditFriendlyFinishedView = () => {
      const friendlySeries = makeFriendlySeries('finished', 2, {
        sourceMatchId: 'pvplm-browser-live',
        scoreBySourceSeat: { A: 1, B: 1 },
        leaderSourceSeat: '',
        canRequestNextRound: true,
      });
      return {
        ...makeStateView(6, 'B', 'finished'),
        matchId: 'pvplm-browser-friendly',
        mode: 'friendly',
        openerAssignment: makeFriendlyOpenerAssignment('A'),
        friendlySeries,
        postMatchReview: {
          ...makePostMatchReview('finished'),
          friendlySeries,
          nextActions: [
            { id: 'review_events', label: '查看权威事件', detail: '只查看公开事件序列。' },
            { id: 'review_key_turns', label: '关键回合复盘', detail: '按公开事件复盘。' },
            { id: 'friendly_rematch', label: 'Bo3 决胜局', detail: '邀请本局对手完成 Bo3 决胜局；不写正式积分。' },
            { id: 'adjust_loadout', label: '调整斗法谱', detail: '按本局窗口微调。' },
            { id: 'practice', label: '问道练习', detail: '练习不写正式结果。' },
            { id: 'queue_again', label: '回到真人排位', detail: '结束友谊局，回到真人排位队列。' },
          ],
        },
      };
    };
    window.__makeLivePvpAuditFriendlyDeciderView = () => ({
      ...makeStateView(1, 'A', 'setup'),
      matchId: 'pvplm-browser-friendly-decider',
      mode: 'friendly',
      openerAssignment: makeFriendlyOpenerAssignment('A'),
      friendlySeries: makeFriendlySeries('matched', 2, {
        sourceMatchId: 'pvplm-browser-friendly',
        roundIndex: 3,
        roundLabel: 'Bo3 决胜局 · 换边再战',
        scoreBySourceSeat: { A: 1, B: 1 },
        leaderSourceSeat: '',
        roundFirstSourceSeat: 'A',
      }),
    });
    window.__makeLivePvpAuditFriendlyCompleteView = () => {
      const friendlySeries = makeFriendlySeries('finished', 2, {
        sourceMatchId: 'pvplm-browser-friendly',
        roundIndex: 3,
        roundLabel: 'Bo3 已结束',
        seriesStatus: 'complete',
        scoreBySourceSeat: { A: 2, B: 1 },
        leaderSourceSeat: 'A',
        winnerSourceSeat: 'A',
        canRequestNextRound: false,
        roundFirstSourceSeat: 'A',
      });
      return {
        ...makeStateView(8, 'B', 'finished'),
        matchId: 'pvplm-browser-friendly-decider',
        mode: 'friendly',
        openerAssignment: makeFriendlyOpenerAssignment('A'),
        friendlySeries,
        postMatchReview: {
          ...makePostMatchReview('finished'),
          friendlySeries,
          nextActions: [
            { id: 'review_events', label: '查看权威事件', detail: '只查看公开事件序列。' },
            { id: 'review_key_turns', label: '关键回合复盘', detail: '按公开事件复盘。' },
            { id: 'adjust_loadout', label: '调整斗法谱', detail: '按本局窗口微调。' },
            { id: 'practice', label: '问道练习', detail: '练习不写正式结果。' },
            { id: 'queue_again', label: '回到真人排位', detail: '结束友谊局，回到真人排位队列。' },
          ],
        },
      };
    };
    let queueStatusPolls = 0;
    window.__setLivePvpAuditQueueStatusPolls = (value = 0) => {
      queueStatusPolls = Math.max(0, Math.floor(Number(value) || 0));
    };
    window.PVPService.findOpponent = async () => {
      throw new Error('live UI should not call legacy PVP matching or settlement');
    };
    window.PVPService.reportMatchResult = async () => {
      throw new Error('live UI should not call legacy PVP matching or settlement');
    };
    window.PVPService.live = {
      connectRealtime: (handlers = {}) => {
        if (window.__livePvpAuditRecordRealtime) {
          push({ method: 'connectRealtime' });
        }
        window.__livePvpAuditRealtimeHandlers = handlers;
        window.setTimeout(() => {
          handlers.onOpen?.();
          handlers.onMessage?.({
            type: 'connected',
            connectionId: 'audit-live-ws-1',
            connectionReport: {
              connectionId: 'audit-live-ws-1',
              heartbeatIntervalMs: 5000,
            },
          });
        }, 0);
        return {
          send: (payload = {}) => {
            if (window.__livePvpAuditRecordRealtime) {
              push({ method: 'realtimeSend', payload });
            }
            return payload.type !== 'intent';
          },
          close: () => true,
        };
      },
      joinQueue: async (options = {}) => {
        const healthMode = String(window.__livePvpAuditConnectionHealthMode || '');
        push({ method: 'joinQueue', options, healthMode });
        if (healthMode === 'blocked') {
          return {
            success: false,
            reason: 'connection_health_failed',
            message: '当前连接不适合进入正式真人排位，请重试检测或先进入问道练习。',
            connectionHealth: {
              reportVersion: 'pvp-live-queue-connection-health-v1',
              status: 'blocked',
              sampleTag: 'client_preflight',
              reasons: ['missed_heartbeat', 'high_rtt'],
              actions: [
                { id: 'retry_connection_check', label: '重试检测' },
                { id: 'practice', label: '问道练习', detail: '练习不写正式积分。' },
              ],
            },
          };
        }
        if (healthMode === 'queue-cooldown') {
          return {
            success: false,
            reason: 'queue_cooldown',
            message: '排队取消过于频繁，正式真人排位短暂冷却中。',
            matchmakingGuard: {
              reportVersion: 'pvp-live-matchmaking-guard-v1',
              status: 'blocked',
              cooldownSource: 'queue_cancel_abuse',
              sourceLabel: '频繁取消冷却',
              retryAt: Date.now() + 60000,
              cooldownRemainingMs: 60000,
              rankedImpact: 'none',
              actions: [
                { id: 'retry_queue_later', label: '稍后重试', detail: '冷却结束后再进入正式排位。' },
                { id: 'practice', label: '问道练习', detail: '练习不写正式积分。' },
              ],
            },
          };
        }
        if (healthMode === 'ready-timeout-cooldown') {
          return {
            success: false,
            reason: 'queue_cooldown',
            message: '准备阶段未确认，正式真人排位短暂冷却中。',
            matchmakingGuard: {
              reportVersion: 'pvp-live-matchmaking-guard-v1',
              status: 'blocked',
              cooldownSource: 'ready_timeout',
              sourceLabel: '准备超时冷却',
              retryAt: Date.now() + 45000,
              cooldownRemainingMs: 45000,
              rankedImpact: 'none',
              actions: [
                { id: 'retry_queue_later', label: '稍后重试', detail: '冷却结束后再进入正式排位。' },
                { id: 'practice', label: '问道练习', detail: '练习不写正式积分。' },
              ],
            },
          };
        }
        if (healthMode === 'connection-timeout-cooldown') {
          return {
            success: false,
            reason: 'queue_cooldown',
            message: '准备阶段连接超时，正式真人排位短暂冷却中。',
            matchmakingGuard: {
              reportVersion: 'pvp-live-matchmaking-guard-v1',
              status: 'blocked',
              cooldownSource: 'connection_timeout',
              sourceLabel: '连接超时冷却',
              retryAt: Date.now() + 30000,
              cooldownRemainingMs: 30000,
              rankedImpact: 'none',
              actions: [
                { id: 'retry_queue_later', label: '稍后重试', detail: '冷却结束后再进入正式排位。' },
                { id: 'practice', label: '问道练习', detail: '练习不写正式积分。' },
              ],
            },
          };
        }
        return { success: true, status: 'waiting', queueTicket: 'pvplq-browser-live' };
      },
      measureConnectionHealth: async () => {
        push({ method: 'measureConnectionHealth' });
        if (String(window.__livePvpAuditConnectionHealthMode || '') === 'blocked') {
          return {
            reportVersion: 'pvp-live-queue-connection-health-v1',
            status: 'blocked',
            sampleTag: 'client_preflight',
            sampleWindowMs: 60000,
            missedHeartbeatCount: 2,
            reconnectCount: 1,
            rttP95Ms: 3000,
          };
        }
        return {
          reportVersion: 'pvp-live-queue-connection-health-v1',
          status: 'pass',
          sampleTag: 'client_preflight',
          sampleWindowMs: 1,
          missedHeartbeatCount: 0,
          reconnectCount: 0,
          rttP95Ms: 18,
        };
      },
      cancelQueue: async (queueTicket) => {
        const mode = String(window.__livePvpAuditCancelQueueMode || '');
        push({ method: 'cancelQueue', queueTicket, mode });
        if (mode === 'matched-race') {
          window.__livePvpAuditCancelQueueMode = '';
          return {
            success: false,
            reason: 'queue_ticket_expired',
            message: '实时论道队列可能已经成局，请同步权威战局',
          };
        }
        return { success: true, status: 'cancelled', queueTicket };
      },
      getQueueStatus: async (queueTicket) => {
        push({ method: 'getQueueStatus', queueTicket });
        queueStatusPolls += 1;
        if (String(window.__livePvpAuditQueueStatusMode || '') === 'recent-opponent') {
          return {
            success: true,
            status: 'waiting',
            queueTicket,
            waitingReport: {
              reportVersion: 'pvp-live-waiting-report-v1',
              waitMs: 6000,
              longWaitThresholdMs: 120000,
              longWait: false,
              message: '刚刚交手的近期对手会被暂时跳过，正在为你换一位真人；不会自动切残影。',
              safeguards: ['real_player_only', 'recent_opponent_suppression', 'no_score_change'],
              actions: [
                { id: 'continue_waiting', label: '继续等待', detail: '继续等待真人，不自动切残影。' },
                { id: 'accept_wide_match', label: '接受宽分差', detail: '仅在双方都确认后，才允许 200-399 分差真人局。' },
                { id: 'practice', label: '问道练习', detail: '练习不写正式积分。' },
                { id: 'cancel_queue', label: '取消匹配', detail: '取消本次排队，不影响正式积分。' },
              ],
            },
          };
        }
        if (String(window.__livePvpAuditQueueStatusMode || '') === 'low-sample') {
          return {
            success: true,
            status: 'waiting',
            queueTicket,
            waitingReport: {
              reportVersion: 'pvp-live-waiting-report-v1',
              waitMs: 5000,
              longWaitThresholdMs: 120000,
              longWait: false,
              protectionReason: 'low_sample_protection',
              releaseMode: 'need_third_player',
              releaseAt: Date.now() + 115000,
              releaseInMs: 115000,
              requiresPoolSize: 3,
              candidatePoolSize: 2,
              currentEligibleActions: ['continue_waiting', 'accept_wide_match', 'practice', 'cancel_queue'],
              message: '低样本保护正在优先寻找更稳妥的真人对手；可继续等待、接受宽分差或先进入问道练习，不会自动切残影。',
              safeguards: ['real_player_only', 'low_sample_protection', 'no_score_change'],
              actions: [
                { id: 'continue_waiting', label: '继续等待', detail: '继续等待真人，不自动切残影。' },
                { id: 'accept_wide_match', label: '接受宽分差', detail: '仅在双方都确认后，才允许 200-399 分差真人局。' },
                { id: 'practice', label: '问道练习', detail: '练习不写正式积分。' },
                { id: 'cancel_queue', label: '取消匹配', detail: '取消本次排队，不影响正式积分。' },
              ],
            },
          };
        }
        if (queueStatusPolls === 1) {
          return {
            success: true,
            status: 'waiting',
            queueTicket,
            waitingReport: {
              reportVersion: 'pvp-live-waiting-report-v1',
              waitMs: 121000,
              longWaitThresholdMs: 120000,
              longWait: true,
              message: '当前真人较少，可继续等待、进入问道练习或取消匹配；不会自动切残影。',
              safeguards: ['real_player_only', 'no_ghost_fallback', 'no_score_change'],
              actions: [
                { id: 'continue_waiting', label: '继续等待', detail: '继续等待真人，不自动切残影。' },
                { id: 'accept_wide_match', label: '接受宽分差', detail: '仅在双方都确认后，才允许 200-399 分差真人局。' },
                { id: 'practice', label: '问道练习', detail: '练习不写正式积分。' },
                { id: 'cancel_queue', label: '取消匹配', detail: '取消本次排队，不影响正式积分。' },
              ],
            },
          };
        }
        return {
          success: true,
          status: 'matched',
          matchId: 'pvplm-browser-live',
          seatId: 'A',
          stateView: makeStateView(1, 'A', 'setup'),
        };
      },
      createInvite: async (options = {}) => {
        push({ method: 'createInvite', options });
        const targetUsername = String(options.targetUsername || '').trim();
        return {
          success: true,
          status: 'waiting_invite',
          inviteCode: 'TDAB12',
          loadoutHash: 'browser-invite-host-hash',
          inviteReport: {
            reportVersion: 'pvp-live-invite-v1',
            inviteCode: 'TDAB12',
            status: 'waiting',
            mode: 'friendly',
            host: { displayName: '甲' },
            target: targetUsername ? { displayName: targetUsername } : null,
            rankedImpact: 'none',
            safeguards: targetUsername
              ? ['invite_only_match', 'targeted_invite_only', 'friendly_no_ranked_impact', 'server_authoritative', 'snapshot_locked']
              : ['invite_only_match', 'friendly_no_ranked_impact', 'server_authoritative', 'snapshot_locked'],
          },
        };
      },
      joinInvite: async (inviteCode, options = {}) => {
        push({ method: 'joinInvite', inviteCode, options });
        return {
          success: true,
          status: 'matched',
          matchId: 'pvplm-browser-invite',
          seatId: 'B',
          stateView: {
            ...makeStateView(1, 'A', 'setup'),
            matchId: 'pvplm-browser-invite',
            mode: 'friendly',
            matchQuality: {
              reportVersion: 'pvp-live-match-quality-v1',
              tag: 'good',
              ruleVersion: 'pvp-live-v1',
              seasonId: 'mvp-local',
              matchedAt: Date.now(),
              expansionStage: 'friend_invite',
              ratingDeltaBucket: 'friend_invite',
              waitMs: { A: 0, B: 0 },
              candidatePoolSize: 2,
              connectionHealth: 'not_measured',
              wideMatchReason: '',
              safeguards: ['server_authoritative', 'snapshot_locked', 'setup_ready_required', 'first_action_budget', 'invite_only_match', 'friendly_no_ranked_impact'],
            },
            firstMatchGuide: {
              ...makeFirstMatchGuide('setup'),
              safeguards: ['server_authoritative', 'snapshot_locked', 'setup_ready_required', 'first_action_budget', 'friendly_no_ranked_impact'],
            },
          },
        };
      },
      cancelInvite: async (inviteCode) => {
        push({ method: 'cancelInvite', inviteCode });
        return {
          success: true,
          status: 'cancelled',
          inviteCode,
          inviteReport: {
            reportVersion: 'pvp-live-invite-v1',
            inviteCode,
            status: 'cancelled',
            rankedImpact: 'none',
          },
        };
      },
      getCurrentInvite: async () => {
        push({ method: 'getCurrentInvite', mode: window.__livePvpAuditCurrentInviteMode || '' });
        if (window.__livePvpAuditCurrentInviteMode === 'pending') {
          return {
            success: true,
            status: 'waiting_invite',
            inviteCode: 'TDAB12',
            inviteReport: {
              reportVersion: 'pvp-live-invite-v1',
              inviteCode: 'TDAB12',
              status: 'waiting',
              rankedImpact: 'none',
              safeguards: ['invite_only_match', 'friendly_no_ranked_impact'],
            },
          };
        }
        if (window.__livePvpAuditCurrentInviteMode === 'expired') {
          return {
            success: false,
            reason: 'invite_expired',
            message: '好友约战邀请码已过期',
          };
        }
        return {
          success: false,
          reason: 'no_current_invite',
          message: '当前没有等待中的好友约战',
        };
      },
      getInviteInbox: async () => {
        push({ method: 'getInviteInbox', mode: window.__livePvpAuditInboxMode || '' });
        if (window.__livePvpAuditInboxMode === 'pending') {
          return {
            success: true,
            status: 'invite_inbox',
            invites: [
              {
                inviteCode: 'TDIN42',
                inviteReport: {
                  reportVersion: 'pvp-live-invite-v1',
                  inviteCode: 'TDIN42',
                  status: 'waiting',
                  mode: 'friendly',
                  host: { displayName: '甲' },
                  target: { displayName: '当前道友' },
                  rankedImpact: 'none',
                  safeguards: ['invite_only_match', 'targeted_invite_only', 'friendly_no_ranked_impact'],
                },
              },
            ],
          };
        }
        return {
          success: true,
          status: 'invite_inbox',
          invites: [],
        };
      },
      getMatch: async (matchId) => {
        push({ method: 'getMatch', matchId });
        const connectionMode = String(window.__livePvpAuditConnectionMode || '');
        const stateView = connectionMode === 'active_opponent_disconnected_non_turn'
          ? makeStateView(6, 'A', 'active')
          : connectionMode === 'active_opponent_disconnected_current_turn'
            ? makeStateView(7, 'B', 'active')
        : window.__livePvpAuditOpponentEmote
          ? {
              ...makeStateView(4, 'B', 'active'),
              recentEvents: [
                { eventType: 'emote_sent', actingSeat: 'B', publicData: { seatId: 'B', emoteId: 'thinking', label: '思考' } },
              ],
            }
          : String(window.__livePvpAuditTurnTimerMode || '') === 'low'
            ? makeStateView(3, 'A', 'active')
          : makeStateView(1, 'A', 'setup');
        return {
          success: true,
          matchId,
          seatId: 'A',
          stateView,
        };
      },
      getReplay: async (matchId, options = {}) => {
        push({ method: 'getReplay', matchId, options });
        return {
          success: true,
          replay: {
            reportVersion: 'pvp-live-replay-v1',
            visibilityLayer: options.visibility || 'replay_self',
            publicSummary: {
              status: 'finished',
              winnerSeat: 'B',
              loserSeat: 'A',
              finishReason: 'surrender',
            },
            events: [
              { eventType: 'battle_started', sequence: 5, actingSeat: 'B' },
              { eventType: 'card_played', sequence: 6, actingSeat: 'A' },
              { eventType: 'match_finished', sequence: 9, actingSeat: 'A' },
            ],
            eventCount: 3,
            hiddenScan: { forbiddenTokenCount: 0, forbiddenKeyCount: 0, forbiddenStringCount: 0 },
          },
        };
      },
      submitReport: async (matchId, report = {}) => {
        push({ method: 'submitReport', matchId, report });
        return {
          success: true,
          report: {
            reportVersion: 'pvp-live-dispute-report-receipt-v1',
            reportId: 'pvplr-browser-live-1',
            status: 'reported',
            reason: report.reason || 'fairness_review',
            sourceVisibility: 'audit_safe_public_state',
            usesHiddenInformation: false,
            rankedImpact: 'none',
            nextStepLine: '异常反馈已提交；复核不会立即改写本局结算。',
            evidencePackage: {
              reportVersion: 'pvp-live-dispute-evidence-v1',
              sourceVisibility: 'audit_safe_public_state',
              usesHiddenInformation: false,
              rankedImpact: 'none',
              matchId,
              reporterSeat: 'A',
              finishReason: 'surrender',
              eventCount: 3,
              riskTags: ['player_reported', 'fairness_review_requested'],
            },
            boundary: '提交异常反馈不会即时改变正式积分、奖励或匹配评分。',
          },
        };
      },
      requestRematch: async (matchId, options = {}) => {
        push({ method: 'requestRematch', matchId, options });
        window.__livePvpFriendlyAccepted = true;
        return {
          success: true,
          status: 'waiting_rematch',
          friendlySeries: {
            ...makeFriendlySeries('waiting_rematch', 1),
            sourceMatchId: matchId,
            originMatchId: matchId,
          },
        };
      },
      getRematchStatus: async (matchId) => {
        push({ method: 'getRematchStatus', matchId });
        return {
          success: true,
          status: 'waiting_rematch',
          friendlySeries: {
            ...makeFriendlySeries('waiting_rematch', 1),
            sourceMatchId: matchId,
            originMatchId: matchId,
          },
        };
      },
      cancelRematch: async (matchId) => {
        push({ method: 'cancelRematch', matchId });
        return {
          success: true,
          status: 'cancelled',
          reason: 'rematch_cancelled',
          message: '已取消低压力再战等待；本局复盘保留，不写正式积分。',
          friendlySeries: {
            ...makeFriendlySeries('cancelled', 1),
            sourceMatchId: matchId,
            originMatchId: matchId,
          },
        };
      },
      heartbeat: async (matchId) => {
        push({ method: 'heartbeat', matchId });
        return {
          success: true,
          matchId,
          seatId: 'A',
          stateView: String(matchId || '').includes('decider')
            ? window.__makeLivePvpAuditFriendlyDeciderView()
            : String(matchId || '').includes('friendly')
            ? window.__makeLivePvpAuditFriendlyView()
            : String(matchId || '').includes('invite')
            ? {
                ...makeStateView(1, 'A', 'setup'),
                matchId: 'pvplm-browser-invite',
                mode: 'friendly',
                matchQuality: {
                  reportVersion: 'pvp-live-match-quality-v1',
                  tag: 'good',
                  ruleVersion: 'pvp-live-v1',
                  expansionStage: 'friend_invite',
                  ratingDeltaBucket: 'friend_invite',
                  waitMs: { A: 0, B: 0 },
                  candidatePoolSize: 2,
                  connectionHealth: 'not_measured',
                  safeguards: ['server_authoritative', 'snapshot_locked', 'setup_ready_required', 'invite_only_match', 'friendly_no_ranked_impact'],
                },
              }
            : window.__livePvpAuditHeartbeatStateView
            ? JSON.parse(JSON.stringify(window.__livePvpAuditHeartbeatStateView))
            : makeStateView(1, 'A', 'setup'),
        };
      },
      submitIntent: async (matchId, intent) => {
        push({ method: 'submitIntent', matchId, intent });
        const isSurrender = intent.intentType === 'surrender';
        const isMulligan = intent.intentType === 'mulligan';
        const isReady = intent.intentType === 'ready';
        const isPlayCard = intent.intentType === 'play_card';
        const isEmote = intent.intentType === 'emote';
        if (isEmote) {
          window.__livePvpAuditOpponentEmote = true;
        }
        const emoteLabel = intent.payload && intent.payload.emoteId === 'respect' ? '抱拳' : '预设表情';
        return {
          success: true,
          result: 'accepted',
          events: isEmote ? [
            { eventType: 'emote_sent', actingSeat: 'A', payload: { seatId: 'A', emoteId: intent.payload?.emoteId || 'respect', label: emoteLabel } },
          ] : isPlayCard ? [
            {
              eventType: 'opening_second_seat_buffer_granted',
              actingSeat: 'A',
              payload: {
                seatId: 'B',
                firstSeat: 'A',
                block: 3,
                totalBlock: 3,
                source: 'opening_second_seat_buffer',
              },
            },
            {
              eventType: 'opening_protection_triggered',
              actingSeat: 'A',
              payload: {
                protectedSeat: 'B',
                minimumHp: 1,
                preventedDamage: 6,
              },
            },
            {
              eventType: 'opening_counterplay_granted',
              actingSeat: 'A',
              payload: {
                seatId: 'B',
                block: 8,
                totalBlock: 8,
                minimumHp: 1,
                source: 'opening_protection',
              },
            },
            {
              eventType: 'damage_applied',
              actingSeat: 'A',
              payload: {
                targetSeat: 'B',
                hpDamage: 9,
                targetHp: 1,
              },
            },
          ] : isSurrender ? [
            { eventType: 'player_surrendered', actingSeat: 'A', payload: { loserSeat: 'A', winnerSeat: 'B' } },
            { eventType: 'match_finished', actingSeat: 'A', payload: { winnerSeat: 'B', loserSeat: 'A', finishReason: 'surrender' } },
          ] : [{ eventType: intent.intentType }],
          stateView: makeStateView(
            isSurrender ? 5 : isReady ? 3 : isMulligan ? 2 : 4,
            isSurrender ? 'A' : isMulligan || isReady ? 'A' : 'B',
            isSurrender ? 'finished' : isMulligan ? 'setup' : isReady || isPlayCard || isEmote ? 'active' : 'active',
          ),
        };
      },
    };
    if (window.PVPScene) {
      window.PVPScene.liveSession = null;
      window.PVPScene.liveSocialMuted = false;
      window.PVPScene.liveSocialPreferencesLoaded = false;
      window.localStorage.removeItem('the-defier:pvp-live-social-preferences:v1');
    }
  });

  await page.click('#pvp-btn', { timeout: 5000, force: true });
  await page.waitForTimeout(400);

  const defaultEntryProbe = await page.evaluate(() => ({
    activeTab: JSON.parse(window.render_game_to_text()).pvp?.activeTab || '',
    liveTabActive: !!document.querySelector('[data-pvp-tab="live"]')?.classList.contains('active'),
    rankingTabActive: !!document.querySelector('[data-pvp-tab="ranking"]')?.classList.contains('active'),
    livePaneActive: !!document.getElementById('tab-live')?.classList.contains('active'),
    rankingPaneActive: !!document.getElementById('tab-ranking')?.classList.contains('active'),
    boundaryText: document.querySelector('[data-live-mode-boundary]')?.textContent || '',
    joinVisible: (() => {
      const button = document.querySelector('[data-live-action="join-queue"]');
      if (!button) return false;
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })(),
  }));
  add(
    'pvp screen opens on live ranked entry by default',
    defaultEntryProbe.activeTab === 'live'
      && defaultEntryProbe.liveTabActive
      && defaultEntryProbe.livePaneActive
      && !defaultEntryProbe.rankingTabActive
      && !defaultEntryProbe.rankingPaneActive
      && /真人排位/.test(defaultEntryProbe.boundaryText)
      && /问道练习/.test(defaultEntryProbe.boundaryText)
      && /好友约战/.test(defaultEntryProbe.boundaryText)
      && /镜像演武/.test(defaultEntryProbe.boundaryText)
      && /不是真人排位/.test(defaultEntryProbe.boundaryText)
      && defaultEntryProbe.joinVisible,
    JSON.stringify(defaultEntryProbe),
  );

  await page.click('[data-pvp-tab="live"]', { timeout: 5000, force: true });
  await page.waitForSelector('[data-live-loadout-preset="sword"]', { timeout: 5000 });
  const initialPresetProbe = await page.evaluate(() => ({
    selectedPreset: document.querySelector('[data-live-loadout-preset].selected')?.getAttribute('data-live-loadout-preset') || '',
    selectedLoadout: document.querySelector('[data-live-selected-loadout]')?.textContent || '',
    presetIds: Array.from(document.querySelectorAll('[data-live-loadout-preset]')).map(button => button.getAttribute('data-live-loadout-preset')),
    disabled: Array.from(document.querySelectorAll('[data-live-loadout-preset]')).map(button => button.disabled),
  }));
  add(
    'live UI renders all baseline loadouts with balanced selected by default',
    initialPresetProbe.selectedPreset === 'balanced'
      && /默认斗法谱/.test(initialPresetProbe.selectedLoadout)
      && ['balanced', 'sword', 'shield'].every(id => initialPresetProbe.presetIds.includes(id))
      && initialPresetProbe.disabled.every(value => value === false),
    JSON.stringify(initialPresetProbe),
  );
  await page.click('[data-live-loadout-preset="sword"]', { timeout: 5000, force: true });
  await page.waitForTimeout(100);

  await page.evaluate(() => {
    window.__livePvpAuditCalls = [];
    window.__livePvpAuditConnectionHealthMode = 'blocked';
  });
  await page.click('[data-live-action="join-queue"]', { timeout: 5000, force: true });
  await page.waitForTimeout(200);
  const blockedHealthProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    lastError: document.querySelector('[data-live-last-error]')?.textContent || '',
    buttons: Object.fromEntries(Array.from(document.querySelectorAll('[data-live-action]')).map(button => [
      button.getAttribute('data-live-action'),
      { disabled: button.disabled, text: button.textContent?.replace(/\s+/g, ' ').trim() || '' },
    ])),
    payload: JSON.parse(window.render_game_to_text()).pvp?.live || null,
    calls: window.__livePvpAuditCalls,
  }));
  add(
    'live UI blocks risky ranked entry and keeps connection health retry practice actions',
    blockedHealthProbe.phase === 'idle'
      && /连接不适合进入正式真人排位/.test(blockedHealthProbe.lastError)
      && blockedHealthProbe.payload?.lastError?.reason === 'connection_health_failed'
      && blockedHealthProbe.payload?.lastError?.connectionHealth?.status === 'blocked'
      && blockedHealthProbe.payload?.lastError?.connectionHealth?.actions?.some(action => action.id === 'retry_connection_check')
      && blockedHealthProbe.payload?.lastError?.connectionHealth?.actions?.some(action => action.id === 'practice' && /不写正式积分/.test(action.detail))
      && blockedHealthProbe.buttons['join-queue']?.disabled === false
      && /重试检测/.test(blockedHealthProbe.buttons['join-queue']?.text || '')
      && blockedHealthProbe.buttons['practice-live']?.disabled === false
      && blockedHealthProbe.calls.some(call => call.method === 'measureConnectionHealth')
      && blockedHealthProbe.calls.some(call => call.method === 'joinQueue' && call.options?.connectionHealthProbe?.status === 'blocked'),
    JSON.stringify(blockedHealthProbe),
  );
  await page.click('[data-live-action="practice-live"]', { timeout: 5000, force: true });
  await page.waitForTimeout(350);
  const blockedHealthPracticeProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    return {
      currentScreen: window.game?.currentScreen || '',
      pending: payload?.challenge?.pending || null,
      focus: payload?.challenge?.trainingFocus || null,
      drillScenario: payload?.pvp?.live?.drillScenario || window.PVPScene.getLiveSnapshot()?.drillScenario || null,
      calls: window.__livePvpAuditCalls,
    };
  });
  add(
    'live UI blocked connection practice opens no-score entry safeguard drill without queue cancellation',
    blockedHealthPracticeProbe.currentScreen === 'character-selection-screen'
      && blockedHealthPracticeProbe.pending?.replayOnly === true
      && blockedHealthPracticeProbe.pending?.practiceOnly === true
      && /^pvp_live_drill_/.test(blockedHealthPracticeProbe.pending?.ruleId || '')
      && blockedHealthPracticeProbe.focus?.sourceRunId === 'pvp_live:entry_safeguard:connection_health_failed'
      && /连接健康|入场保障/.test(blockedHealthPracticeProbe.focus?.trainingAdvice || '')
      && blockedHealthPracticeProbe.drillScenario?.reportVersion === 'pvp-live-drill-scenario-v1'
      && blockedHealthPracticeProbe.drillScenario?.sourceMatchId === 'entry_safeguard:connection_health_failed'
      && blockedHealthPracticeProbe.drillScenario?.sourceVisibility === 'replay_self'
      && blockedHealthPracticeProbe.drillScenario?.usesHiddenInformation === false
      && blockedHealthPracticeProbe.drillScenario?.rankedImpact === 'none'
      && (blockedHealthPracticeProbe.drillScenario?.trainingTags || []).includes('连接健康练习')
      && !blockedHealthPracticeProbe.calls.some(call => call.method === 'cancelQueue')
      && !blockedHealthPracticeProbe.calls.some(call => /findOpponent|reportMatchResult|startPVPBattle/i.test(call.method || ''))
      && !/GhostEnemy|didWin|matchTicket/i.test(JSON.stringify(blockedHealthPracticeProbe.pending || {}))
      && !/ratingDelta|scoreAfter|coinsAwarded|formalResultPolicy|elo/i.test(JSON.stringify(blockedHealthPracticeProbe.drillScenario || {})),
    JSON.stringify(blockedHealthPracticeProbe),
  );
  await page.evaluate(async () => {
    window.game.showScreen('pvp-screen');
    if (window.game) {
      window.game.pendingChallengeStart = null;
      window.game.activeChallengeRun = null;
    }
    window.PVPScene.switchTab('live');
    if (typeof window.PVPScene.loadLivePanel === 'function') {
      await window.PVPScene.loadLivePanel();
    }
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    window.__livePvpAuditCalls = [];
    window.__livePvpAuditConnectionHealthMode = 'queue-cooldown';
  });
  await page.click('[data-live-action="join-queue"]', { timeout: 5000, force: true });
  await page.waitForTimeout(200);
  const queueCooldownProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    lastError: document.querySelector('[data-live-last-error]')?.textContent || '',
    buttons: Object.fromEntries(Array.from(document.querySelectorAll('[data-live-action]')).map(button => [
      button.getAttribute('data-live-action'),
      { disabled: button.disabled, text: button.textContent?.replace(/\s+/g, ' ').trim() || '' },
    ])),
    payload: JSON.parse(window.render_game_to_text()).pvp?.live || null,
    calls: window.__livePvpAuditCalls,
  }));
  add(
    'live UI queue cooldown keeps retry practice actions without reward or rating promise',
    queueCooldownProbe.phase === 'idle'
      && /排队取消过于频繁|短暂冷却/.test(queueCooldownProbe.lastError)
      && /剩余 60 秒/.test(queueCooldownProbe.lastError)
      && queueCooldownProbe.payload?.lastError?.reason === 'queue_cooldown'
      && queueCooldownProbe.payload?.lastError?.matchmakingGuard?.reportVersion === 'pvp-live-matchmaking-guard-v1'
      && queueCooldownProbe.payload?.lastError?.matchmakingGuard?.status === 'blocked'
      && queueCooldownProbe.payload?.lastError?.matchmakingGuard?.cooldownSource === 'queue_cancel_abuse'
      && queueCooldownProbe.payload?.lastError?.matchmakingGuard?.rankedImpact === 'none'
      && queueCooldownProbe.payload?.lastError?.matchmakingGuard?.actions?.some(action => action.id === 'retry_queue_later')
      && queueCooldownProbe.payload?.lastError?.matchmakingGuard?.actions?.some(action => action.id === 'practice' && /不写正式积分/.test(action.detail))
      && queueCooldownProbe.buttons['join-queue']?.disabled === false
      && /60s 后重试/.test(queueCooldownProbe.buttons['join-queue']?.text || '')
      && queueCooldownProbe.buttons['practice-live']?.disabled === false
      && !/reward|rating|elo/i.test(JSON.stringify(queueCooldownProbe.payload?.lastError?.matchmakingGuard || {})),
    JSON.stringify(queueCooldownProbe),
  );
  await page.click('[data-live-action="practice-live"]', { timeout: 5000, force: true });
  await page.waitForTimeout(350);
  const queueCooldownPracticeProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    return {
      currentScreen: window.game?.currentScreen || '',
      pending: payload?.challenge?.pending || null,
      focus: payload?.challenge?.trainingFocus || null,
      drillScenario: payload?.pvp?.live?.drillScenario || window.PVPScene.getLiveSnapshot()?.drillScenario || null,
      calls: window.__livePvpAuditCalls,
    };
  });
  add(
    'live UI queue cooldown practice opens no-score entry safeguard drill without queue cancellation',
    queueCooldownPracticeProbe.currentScreen === 'character-selection-screen'
      && queueCooldownPracticeProbe.pending?.replayOnly === true
      && queueCooldownPracticeProbe.pending?.practiceOnly === true
      && /^pvp_live_drill_/.test(queueCooldownPracticeProbe.pending?.ruleId || '')
      && queueCooldownPracticeProbe.focus?.sourceRunId === 'pvp_live:entry_safeguard:queue_cooldown'
      && /短暂冷却|排队冷却/.test(queueCooldownPracticeProbe.focus?.trainingAdvice || '')
      && queueCooldownPracticeProbe.drillScenario?.reportVersion === 'pvp-live-drill-scenario-v1'
      && queueCooldownPracticeProbe.drillScenario?.sourceMatchId === 'entry_safeguard:queue_cooldown'
      && queueCooldownPracticeProbe.drillScenario?.sourceVisibility === 'replay_self'
      && queueCooldownPracticeProbe.drillScenario?.usesHiddenInformation === false
      && queueCooldownPracticeProbe.drillScenario?.rankedImpact === 'none'
      && queueCooldownPracticeProbe.drillScenario?.finishReason === 'queue_cooldown'
      && (queueCooldownPracticeProbe.drillScenario?.trainingTags || []).includes('排队冷却练习')
      && queueCooldownPracticeProbe.drillScenario?.matchmakingGuard?.cooldownSource === 'queue_cancel_abuse'
      && !queueCooldownPracticeProbe.calls.some(call => call.method === 'cancelQueue')
      && !queueCooldownPracticeProbe.calls.some(call => /findOpponent|reportMatchResult|startPVPBattle/i.test(call.method || ''))
      && !/GhostEnemy|didWin|matchTicket/i.test(JSON.stringify(queueCooldownPracticeProbe.pending || {}))
      && !/ratingDelta|scoreAfter|coinsAwarded|formalResultPolicy|elo/i.test(JSON.stringify(queueCooldownPracticeProbe.drillScenario || {})),
    JSON.stringify(queueCooldownPracticeProbe),
  );

  await page.evaluate(async () => {
    window.game.showScreen('pvp-screen');
    if (window.game) {
      window.game.pendingChallengeStart = null;
      window.game.activeChallengeRun = null;
    }
    window.PVPScene.switchTab('live');
    if (typeof window.PVPScene.loadLivePanel === 'function') {
      await window.PVPScene.loadLivePanel();
    }
    window.__livePvpAuditCalls = [];
    window.__livePvpAuditConnectionHealthMode = 'ready-timeout-cooldown';
  });
  await page.waitForTimeout(100);
  await page.click('[data-live-action="join-queue"]', { timeout: 5000, force: true });
  await page.waitForTimeout(200);
  const readyTimeoutCooldownProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    lastError: document.querySelector('[data-live-last-error]')?.textContent || '',
    buttons: Object.fromEntries(Array.from(document.querySelectorAll('[data-live-action]')).map(button => [
      button.getAttribute('data-live-action'),
      { disabled: button.disabled, text: button.textContent?.replace(/\s+/g, ' ').trim() || '' },
    ])),
    payload: JSON.parse(window.render_game_to_text()).pvp?.live || null,
    calls: window.__livePvpAuditCalls,
  }));
  add(
    'live UI ready timeout cooldown names the setup-dodge source without reward or rating promise',
    readyTimeoutCooldownProbe.phase === 'idle'
      && /准备阶段未确认|准备超时冷却/.test(readyTimeoutCooldownProbe.lastError)
      && /剩余 45 秒/.test(readyTimeoutCooldownProbe.lastError)
      && readyTimeoutCooldownProbe.payload?.lastError?.reason === 'queue_cooldown'
      && readyTimeoutCooldownProbe.payload?.lastError?.matchmakingGuard?.reportVersion === 'pvp-live-matchmaking-guard-v1'
      && readyTimeoutCooldownProbe.payload?.lastError?.matchmakingGuard?.status === 'blocked'
      && readyTimeoutCooldownProbe.payload?.lastError?.matchmakingGuard?.cooldownSource === 'ready_timeout'
      && readyTimeoutCooldownProbe.payload?.lastError?.matchmakingGuard?.sourceLabel === '准备超时冷却'
      && readyTimeoutCooldownProbe.payload?.lastError?.matchmakingGuard?.rankedImpact === 'none'
      && readyTimeoutCooldownProbe.payload?.lastError?.matchmakingGuard?.actions?.some(action => action.id === 'retry_queue_later')
      && readyTimeoutCooldownProbe.payload?.lastError?.matchmakingGuard?.actions?.some(action => action.id === 'practice' && /不写正式积分/.test(action.detail))
      && readyTimeoutCooldownProbe.buttons['join-queue']?.disabled === false
      && /45s 后重试/.test(readyTimeoutCooldownProbe.buttons['join-queue']?.text || '')
      && readyTimeoutCooldownProbe.buttons['practice-live']?.disabled === false
      && !/reward|rating|elo/i.test(JSON.stringify(readyTimeoutCooldownProbe.payload?.lastError?.matchmakingGuard || {})),
    JSON.stringify(readyTimeoutCooldownProbe),
  );
  await page.click('[data-live-action="practice-live"]', { timeout: 5000, force: true });
  await page.waitForTimeout(350);
  const readyTimeoutPracticeProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    return {
      currentScreen: window.game?.currentScreen || '',
      pending: payload?.challenge?.pending || null,
      focus: payload?.challenge?.trainingFocus || null,
      drillScenario: payload?.pvp?.live?.drillScenario || window.PVPScene.getLiveSnapshot()?.drillScenario || null,
      calls: window.__livePvpAuditCalls,
    };
  });
  add(
    'live UI ready timeout cooldown practice opens a source-specific no-score drill',
    readyTimeoutPracticeProbe.currentScreen === 'character-selection-screen'
      && readyTimeoutPracticeProbe.pending?.replayOnly === true
      && readyTimeoutPracticeProbe.pending?.practiceOnly === true
      && /^pvp_live_drill_/.test(readyTimeoutPracticeProbe.pending?.ruleId || '')
      && readyTimeoutPracticeProbe.focus?.sourceRunId === 'pvp_live:entry_safeguard:ready_timeout'
      && /准备超时|未确认/.test(readyTimeoutPracticeProbe.focus?.trainingAdvice || '')
      && readyTimeoutPracticeProbe.drillScenario?.reportVersion === 'pvp-live-drill-scenario-v1'
      && readyTimeoutPracticeProbe.drillScenario?.sourceMatchId === 'entry_safeguard:ready_timeout'
      && readyTimeoutPracticeProbe.drillScenario?.sourceVisibility === 'replay_self'
      && readyTimeoutPracticeProbe.drillScenario?.usesHiddenInformation === false
      && readyTimeoutPracticeProbe.drillScenario?.rankedImpact === 'none'
      && readyTimeoutPracticeProbe.drillScenario?.finishReason === 'queue_cooldown'
      && readyTimeoutPracticeProbe.drillScenario?.themeKey === 'ready_timeout'
      && readyTimeoutPracticeProbe.drillScenario?.themeLabel === '准备超时冷却'
      && (readyTimeoutPracticeProbe.drillScenario?.trainingTags || []).includes('准备超时练习')
      && readyTimeoutPracticeProbe.drillScenario?.matchmakingGuard?.cooldownSource === 'ready_timeout'
      && !readyTimeoutPracticeProbe.calls.some(call => call.method === 'cancelQueue')
      && !readyTimeoutPracticeProbe.calls.some(call => /findOpponent|reportMatchResult|startPVPBattle/i.test(call.method || ''))
      && !/GhostEnemy|didWin|matchTicket/i.test(JSON.stringify(readyTimeoutPracticeProbe.pending || {}))
      && !/ratingDelta|scoreAfter|coinsAwarded|formalResultPolicy|elo/i.test(JSON.stringify(readyTimeoutPracticeProbe.drillScenario || {})),
    JSON.stringify(readyTimeoutPracticeProbe),
  );
  await page.evaluate(async () => {
    window.game.showScreen('pvp-screen');
    if (window.game) {
      window.game.pendingChallengeStart = null;
      window.game.activeChallengeRun = null;
    }
    window.PVPScene.switchTab('live');
    if (typeof window.PVPScene.loadLivePanel === 'function') {
      await window.PVPScene.loadLivePanel();
    }
    window.__livePvpAuditCalls = [];
    window.__livePvpAuditConnectionHealthMode = 'connection-timeout-cooldown';
  });
  await page.waitForTimeout(100);
  await page.click('[data-live-action="join-queue"]', { timeout: 5000, force: true });
  await page.waitForTimeout(200);
  const connectionTimeoutCooldownProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    lastError: document.querySelector('[data-live-last-error]')?.textContent || '',
    buttons: Object.fromEntries(Array.from(document.querySelectorAll('[data-live-action]')).map(button => [
      button.getAttribute('data-live-action'),
      { disabled: button.disabled, text: button.textContent?.replace(/\s+/g, ' ').trim() || '' },
    ])),
    payload: JSON.parse(window.render_game_to_text()).pvp?.live || null,
    calls: window.__livePvpAuditCalls,
  }));
  add(
    'live UI connection timeout cooldown names the setup-disconnect source without reward or rating promise',
    connectionTimeoutCooldownProbe.phase === 'idle'
      && /准备阶段连接超时|连接超时冷却/.test(connectionTimeoutCooldownProbe.lastError)
      && /剩余 30 秒/.test(connectionTimeoutCooldownProbe.lastError)
      && connectionTimeoutCooldownProbe.payload?.lastError?.reason === 'queue_cooldown'
      && connectionTimeoutCooldownProbe.payload?.lastError?.matchmakingGuard?.reportVersion === 'pvp-live-matchmaking-guard-v1'
      && connectionTimeoutCooldownProbe.payload?.lastError?.matchmakingGuard?.status === 'blocked'
      && connectionTimeoutCooldownProbe.payload?.lastError?.matchmakingGuard?.cooldownSource === 'connection_timeout'
      && connectionTimeoutCooldownProbe.payload?.lastError?.matchmakingGuard?.sourceLabel === '连接超时冷却'
      && connectionTimeoutCooldownProbe.payload?.lastError?.matchmakingGuard?.rankedImpact === 'none'
      && connectionTimeoutCooldownProbe.buttons['join-queue']?.disabled === false
      && /30s 后重试/.test(connectionTimeoutCooldownProbe.buttons['join-queue']?.text || '')
      && connectionTimeoutCooldownProbe.buttons['practice-live']?.disabled === false
      && !/reward|rating|elo/i.test(JSON.stringify(connectionTimeoutCooldownProbe.payload?.lastError?.matchmakingGuard || {})),
    JSON.stringify(connectionTimeoutCooldownProbe),
  );
  await page.click('[data-live-action="practice-live"]', { timeout: 5000, force: true });
  await page.waitForTimeout(350);
  const connectionTimeoutPracticeProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    return {
      currentScreen: window.game?.currentScreen || '',
      pending: payload?.challenge?.pending || null,
      focus: payload?.challenge?.trainingFocus || null,
      drillScenario: payload?.pvp?.live?.drillScenario || window.PVPScene.getLiveSnapshot()?.drillScenario || null,
      calls: window.__livePvpAuditCalls,
    };
  });
  add(
    'live UI connection timeout cooldown practice opens a source-specific no-score drill',
    connectionTimeoutPracticeProbe.currentScreen === 'character-selection-screen'
      && connectionTimeoutPracticeProbe.pending?.replayOnly === true
      && connectionTimeoutPracticeProbe.pending?.practiceOnly === true
      && /^pvp_live_drill_/.test(connectionTimeoutPracticeProbe.pending?.ruleId || '')
      && connectionTimeoutPracticeProbe.focus?.sourceRunId === 'pvp_live:entry_safeguard:connection_timeout'
      && /连接超时|断线/.test(connectionTimeoutPracticeProbe.focus?.trainingAdvice || '')
      && connectionTimeoutPracticeProbe.drillScenario?.reportVersion === 'pvp-live-drill-scenario-v1'
      && connectionTimeoutPracticeProbe.drillScenario?.sourceMatchId === 'entry_safeguard:connection_timeout'
      && connectionTimeoutPracticeProbe.drillScenario?.sourceVisibility === 'replay_self'
      && connectionTimeoutPracticeProbe.drillScenario?.usesHiddenInformation === false
      && connectionTimeoutPracticeProbe.drillScenario?.rankedImpact === 'none'
      && connectionTimeoutPracticeProbe.drillScenario?.finishReason === 'queue_cooldown'
      && connectionTimeoutPracticeProbe.drillScenario?.themeKey === 'connection_timeout'
      && connectionTimeoutPracticeProbe.drillScenario?.themeLabel === '连接超时冷却'
      && (connectionTimeoutPracticeProbe.drillScenario?.trainingTags || []).includes('连接超时练习')
      && connectionTimeoutPracticeProbe.drillScenario?.matchmakingGuard?.cooldownSource === 'connection_timeout'
      && !connectionTimeoutPracticeProbe.calls.some(call => call.method === 'cancelQueue')
      && !connectionTimeoutPracticeProbe.calls.some(call => /findOpponent|reportMatchResult|startPVPBattle/i.test(call.method || ''))
      && !/GhostEnemy|didWin|matchTicket/i.test(JSON.stringify(connectionTimeoutPracticeProbe.pending || {}))
      && !/ratingDelta|scoreAfter|coinsAwarded|formalResultPolicy|elo/i.test(JSON.stringify(connectionTimeoutPracticeProbe.drillScenario || {})),
    JSON.stringify(connectionTimeoutPracticeProbe),
  );
  await page.evaluate(async () => {
    window.game.showScreen('pvp-screen');
    if (window.game) {
      window.game.pendingChallengeStart = null;
      window.game.activeChallengeRun = null;
    }
    window.PVPScene.switchTab('live');
    if (typeof window.PVPScene.loadLivePanel === 'function') {
      await window.PVPScene.loadLivePanel();
    }
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    window.__livePvpAuditCalls = [];
    window.__livePvpAuditConnectionHealthMode = '';
  });
  await page.click('[data-live-action="join-queue"]', { timeout: 5000, force: true });
  await page.waitForTimeout(200);

  const waitingProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    ticket: document.querySelector('[data-live-queue-ticket]')?.textContent || '',
    selectedLoadout: document.querySelector('[data-live-selected-loadout]')?.textContent || '',
    selectedPreset: document.querySelector('[data-live-loadout-preset].selected')?.getAttribute('data-live-loadout-preset') || '',
    presetDisabled: Array.from(document.querySelectorAll('[data-live-loadout-preset]')).map(button => button.disabled),
    calls: window.__livePvpAuditCalls,
  }));
  add('live UI joins queue and shows waiting ticket', waitingProbe.phase === 'waiting' && /pvplq-browser-live/.test(waitingProbe.ticket), JSON.stringify(waitingProbe));
  add(
    'live UI selects a baseline loadout before queue join',
    /破阵斗法谱/.test(waitingProbe.selectedLoadout)
      && waitingProbe.selectedPreset === 'sword'
      && waitingProbe.calls.some(call => call.method === 'joinQueue' && call.options?.loadout?.identitySlot === 'sword' && call.options?.loadout?.deck?.length === 20),
    JSON.stringify(waitingProbe),
  );
  add(
    'live UI sends ranked entry connection health preflight with queue join',
    waitingProbe.calls.some(call => call.method === 'measureConnectionHealth')
      && waitingProbe.calls.some(call => call.method === 'joinQueue'
        && call.options?.connectionHealthProbe?.sampleTag === 'client_preflight'
        && call.options?.connectionHealthProbe?.status === 'pass'
        && call.options?.connectionHealthProbe?.missedHeartbeatCount === 0),
    JSON.stringify(waitingProbe),
  );
  add(
    'live UI locks baseline loadout selector after queue join',
    waitingProbe.presetDisabled.length === 3 && waitingProbe.presetDisabled.every(value => value === true),
    JSON.stringify(waitingProbe),
  );

  await page.evaluate(() => {
    window.__setLivePvpAuditQueueStatusPolls(0);
    window.__livePvpAuditQueueStatusMode = 'recent-opponent';
  });
  await page.click('[data-live-action="refresh-match"]', { timeout: 5000, force: true });
  await page.waitForTimeout(200);
  const recentWaitingProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    report: document.querySelector('[data-live-waiting-report]')?.textContent || '',
    buttons: Object.fromEntries(Array.from(document.querySelectorAll('[data-live-action]')).map(button => [button.getAttribute('data-live-action'), button.disabled])),
    payload: JSON.parse(window.render_game_to_text()).pvp?.live || null,
    calls: window.__livePvpAuditCalls,
  }));
  add(
    'live UI renders recent-opponent waiting safeguard before long-wait threshold',
    recentWaitingProbe.phase === 'waiting'
      && /匹配质量护栏/.test(recentWaitingProbe.report)
      && /近期对手|换一位/.test(recentWaitingProbe.report)
      && /接受宽分差/.test(recentWaitingProbe.report)
      && /问道练习/.test(recentWaitingProbe.report)
      && /取消匹配/.test(recentWaitingProbe.report)
      && /不会自动切残影/.test(recentWaitingProbe.report)
      && recentWaitingProbe.buttons['practice-live'] === false
      && recentWaitingProbe.buttons['cancel-queue'] === false
      && recentWaitingProbe.payload?.waitingReport?.reportVersion === 'pvp-live-waiting-report-v1'
      && recentWaitingProbe.payload?.waitingReport?.longWait === false
      && recentWaitingProbe.payload?.waitingReport?.safeguards?.includes('recent_opponent_suppression')
      && recentWaitingProbe.payload?.waitingReport?.actions?.some(action => action.id === 'accept_wide_match')
      && !/GhostEnemy|reward|rating|elo/i.test(`${recentWaitingProbe.report} ${JSON.stringify(recentWaitingProbe.payload?.waitingReport || {})}`),
    JSON.stringify(recentWaitingProbe),
  );

  await page.evaluate(() => {
    window.__setLivePvpAuditQueueStatusPolls(0);
    window.__livePvpAuditQueueStatusMode = 'low-sample';
  });
  await page.click('[data-live-action="refresh-match"]', { timeout: 5000, force: true });
  await page.waitForTimeout(200);
  const lowSampleWaitingProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    report: document.querySelector('[data-live-waiting-report]')?.textContent || '',
    buttons: Object.fromEntries(Array.from(document.querySelectorAll('[data-live-action]')).map(button => [button.getAttribute('data-live-action'), button.disabled])),
    payload: JSON.parse(window.render_game_to_text()).pvp?.live || null,
  }));
  add(
    'live UI renders low-sample waiting safeguard before long-wait threshold',
    lowSampleWaitingProbe.phase === 'waiting'
      && /匹配质量护栏/.test(lowSampleWaitingProbe.report)
      && /匹配样本保护|低样本保护|稳妥/.test(lowSampleWaitingProbe.report)
      && /接受宽分差/.test(lowSampleWaitingProbe.report)
      && /问道练习/.test(lowSampleWaitingProbe.report)
      && /取消匹配/.test(lowSampleWaitingProbe.report)
      && /不会自动切残影/.test(lowSampleWaitingProbe.report)
      && lowSampleWaitingProbe.buttons['practice-live'] === false
      && lowSampleWaitingProbe.buttons['cancel-queue'] === false
      && lowSampleWaitingProbe.payload?.waitingReport?.reportVersion === 'pvp-live-waiting-report-v1'
      && lowSampleWaitingProbe.payload?.waitingReport?.longWait === false
      && lowSampleWaitingProbe.payload?.waitingReport?.protectionReason === 'low_sample_protection'
      && lowSampleWaitingProbe.payload?.waitingReport?.releaseMode === 'need_third_player'
      && lowSampleWaitingProbe.payload?.waitingReport?.releaseAt > Date.now()
      && lowSampleWaitingProbe.payload?.waitingReport?.releaseInMs > 0
      && lowSampleWaitingProbe.payload?.waitingReport?.requiresPoolSize === 3
      && lowSampleWaitingProbe.payload?.waitingReport?.candidatePoolSize === 2
      && lowSampleWaitingProbe.payload?.waitingReport?.currentEligibleActions?.includes('practice')
      && lowSampleWaitingProbe.payload?.waitingReport?.safeguards?.includes('low_sample_protection')
      && lowSampleWaitingProbe.payload?.waitingReport?.actions?.some(action => action.id === 'accept_wide_match')
      && !/GhostEnemy|reward|rating|elo|rankedGames/i.test(`${lowSampleWaitingProbe.report} ${JSON.stringify(lowSampleWaitingProbe.payload?.waitingReport || {})}`),
    JSON.stringify(lowSampleWaitingProbe),
  );

  await page.evaluate(() => {
    window.__setLivePvpAuditQueueStatusPolls(0);
    window.__livePvpAuditQueueStatusMode = '';
  });
  await page.click('[data-live-action="refresh-match"]', { timeout: 5000, force: true });
  await page.waitForTimeout(200);
  const longWaitProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    report: document.querySelector('[data-live-waiting-report]')?.textContent || '',
    buttons: Object.fromEntries(Array.from(document.querySelectorAll('[data-live-action]')).map(button => [button.getAttribute('data-live-action'), button.disabled])),
    calls: window.__livePvpAuditCalls,
    payload: JSON.parse(window.render_game_to_text()).pvp?.live || null,
  }));
  add(
    'live UI renders 120s no-real-player waiting branch without ghost fallback',
    longWaitProbe.phase === 'waiting'
      && /120 秒无真人/.test(longWaitProbe.report)
      && /继续等待/.test(longWaitProbe.report)
      && /接受宽分差/.test(longWaitProbe.report)
      && /问道练习/.test(longWaitProbe.report)
      && /取消匹配/.test(longWaitProbe.report)
      && /不会自动切残影/.test(longWaitProbe.report)
      && /不写正式积分/.test(longWaitProbe.report)
      && longWaitProbe.buttons['practice-live'] === false
      && longWaitProbe.buttons['cancel-queue'] === false
      && longWaitProbe.payload?.waitingReport?.reportVersion === 'pvp-live-waiting-report-v1'
      && longWaitProbe.payload?.waitingReport?.longWait === true
      && longWaitProbe.payload?.waitingReport?.actions?.some(action => action.id === 'accept_wide_match' && /双方都确认/.test(action.detail))
      && longWaitProbe.payload?.waitingReport?.actions?.some(action => action.id === 'practice' && /不写正式积分/.test(action.detail))
      && !/PVPService\\.findOpponent|reportMatchResult|GhostEnemy|reward|rating|elo/i.test(`${longWaitProbe.report} ${JSON.stringify(longWaitProbe.payload?.waitingReport || {})} ${JSON.stringify(longWaitProbe.calls)}`),
    JSON.stringify(longWaitProbe),
  );
  const practiceHintClicked = await page.evaluate(() => {
    const button = document.querySelector('[data-live-action="practice-live"]');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  });
  if (!practiceHintClicked) throw new Error('expected enabled live practice hint button');
  await page.waitForTimeout(450);
  const practiceHintProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    return {
      currentScreen: window.game?.currentScreen || '',
      pending: payload?.challenge?.pending || null,
      focus: payload?.challenge?.trainingFocus || null,
      bannerText: document.getElementById('challenge-selection-banner')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      insightText: document.querySelector('#challenge-selection-banner .challenge-record-insight')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      confirmText: document.querySelector('#confirm-character-btn .btn-text')?.textContent?.trim() || '',
      drillScenario: payload?.pvp?.live?.drillScenario || window.PVPScene.getLiveSnapshot()?.drillScenario || null,
      calls: window.__livePvpAuditCalls,
    };
  });
  add(
    'live UI long-wait practice handoff creates no-score playable challenge drill',
    practiceHintProbe.currentScreen === 'character-selection-screen'
      && practiceHintProbe.pending?.replayOnly === true
      && practiceHintProbe.pending?.practiceOnly === true
      && /^pvp_live_drill_/.test(practiceHintProbe.pending?.ruleId || '')
      && /^PVP-/.test(practiceHintProbe.pending?.seedSignature || '')
      && practiceHintProbe.focus?.sourceRunId === 'pvp_live:waiting:pvplq-browser-live'
      && /长等待练习|等待真人/.test(practiceHintProbe.focus?.trainingAdvice || '')
      && /真人 PVP|问道练习|不计/.test(practiceHintProbe.bannerText || '')
      && /等待真人|不写正式积分|隐藏/.test(practiceHintProbe.insightText || '')
      && /回放命盘/.test(practiceHintProbe.confirmText || '')
      && practiceHintProbe.drillScenario?.reportVersion === 'pvp-live-drill-scenario-v1'
      && practiceHintProbe.drillScenario?.sourceMatchId === 'waiting:pvplq-browser-live'
      && practiceHintProbe.drillScenario?.sourceVisibility === 'replay_self'
      && practiceHintProbe.drillScenario?.usesHiddenInformation === false
      && practiceHintProbe.drillScenario?.rankedImpact === 'none'
      && !Object.prototype.hasOwnProperty.call(practiceHintProbe.drillScenario || {}, 'practicePlan')
      && practiceHintProbe.drillScenario?.waitingReport?.longWait === true
      && (practiceHintProbe.drillScenario?.trainingTags || []).includes('长等待练习')
      && (practiceHintProbe.drillScenario?.publicEventTypes || []).includes('queue_long_wait')
      && practiceHintProbe.calls.some(call => call.method === 'cancelQueue' && call.queueTicket === 'pvplq-browser-live')
      && !/reward|rating|elo/i.test(JSON.stringify(practiceHintProbe.drillScenario || {}))
      && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket/.test(JSON.stringify(practiceHintProbe.calls)),
    JSON.stringify(practiceHintProbe),
  );

  await page.evaluate(async () => {
    window.game.showScreen('pvp-screen');
    if (window.game) {
      window.game.pendingChallengeStart = null;
      window.game.activeChallengeRun = null;
    }
    window.PVPScene.switchTab('live');
    await window.PVPScene.loadLivePanel();
    window.__setLivePvpAuditQueueStatusPolls?.(0);
    window.__livePvpAuditCancelQueueMode = 'matched-race';
  });
  await page.waitForTimeout(100);
  await page.click('[data-live-action="join-queue"]', { timeout: 5000, force: true });
  await page.waitForTimeout(100);
  await page.click('[data-live-action="refresh-match"]', { timeout: 5000, force: true });
  await page.waitForTimeout(200);
  await page.click('[data-live-action="practice-live"]', { timeout: 5000, force: true });
  await page.waitForTimeout(350);
  const cancelRaceProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    return {
      currentScreen: window.game?.currentScreen || '',
      phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
      matchId: document.querySelector('[data-live-match-id]')?.textContent || '',
      pending: payload?.challenge?.pending || null,
      drillScenario: payload?.pvp?.live?.drillScenario || window.PVPScene.getLiveSnapshot()?.drillScenario || null,
      calls: window.__livePvpAuditCalls,
    };
  });
  add(
    'live UI long-wait practice handoff recovers authoritative match when cancel races matchmaking',
    cancelRaceProbe.currentScreen === 'pvp-screen'
      && /setup|matched|active/.test(cancelRaceProbe.phase)
      && /pvplm-browser-live/.test(cancelRaceProbe.matchId)
      && !cancelRaceProbe.pending
      && !cancelRaceProbe.drillScenario
      && cancelRaceProbe.calls.some(call => call.method === 'cancelQueue' && call.mode === 'matched-race')
      && cancelRaceProbe.calls.filter(call => call.method === 'getQueueStatus' && call.queueTicket === 'pvplq-browser-live').length >= 2
      && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket/.test(JSON.stringify(cancelRaceProbe.calls)),
    JSON.stringify(cancelRaceProbe),
  );
  await page.waitForFunction(
    () => document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-realtime-state') === 'connected',
    null,
    { timeout: 1000 },
  ).catch(() => {});
  const matchedProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    matchId: document.querySelector('[data-live-match-id]')?.textContent || '',
    seat: document.querySelector('[data-live-seat]')?.textContent || '',
    stateVersion: document.querySelector('[data-live-state-version]')?.textContent || '',
    selfLoadout: document.querySelector('[data-live-self-loadout]')?.textContent || '',
    opponentLoadout: document.querySelector('[data-live-opponent-loadout]')?.textContent || '',
    matchQuality: document.querySelector('[data-live-match-quality]')?.textContent || '',
    turnTimer: document.querySelector('[data-live-turn-timer]')?.textContent || '',
    connectionStatus: document.querySelector('[data-live-connection-status]')?.textContent || '',
    realtimeStatus: document.querySelector('[data-live-realtime-status]')?.textContent || '',
    realtimeDataset: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-realtime-state') || '',
    openingSafeguard: document.querySelector('[data-live-opening-safeguard]')?.textContent || '',
    openerAssignment: document.querySelector('[data-live-opener-assignment]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    actionReceipt: document.querySelector('[data-live-action-receipt]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    duelMomentum: document.querySelector('[data-live-duel-momentum]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    duelMomentumState: document.querySelector('[data-live-duel-momentum]')?.getAttribute('data-live-duel-momentum-state') || '',
    duelMomentumSource: document.querySelector('[data-live-duel-momentum]')?.getAttribute('data-live-duel-momentum-source') || '',
    duelMomentumHidden: document.querySelector('[data-live-duel-momentum]')?.getAttribute('data-live-duel-momentum-hidden') || '',
    intentSignal: document.querySelector('[data-live-intent-signal]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    intentSignalState: document.querySelector('[data-live-intent-signal]')?.getAttribute('data-live-intent-signal-state') || '',
    intentSignalSource: document.querySelector('[data-live-intent-signal]')?.getAttribute('data-live-intent-signal-source') || '',
    intentSignalHidden: document.querySelector('[data-live-intent-signal]')?.getAttribute('data-live-intent-signal-hidden') || '',
    firstGuide: document.querySelector('[data-live-first-guide]')?.textContent || '',
    loadoutExplorationText: document.querySelector('[data-live-loadout-exploration]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    loadoutExplorationSource: document.querySelector('[data-live-loadout-exploration]')?.getAttribute('data-live-loadout-exploration-source') || '',
    loadoutExplorationHidden: document.querySelector('[data-live-loadout-exploration]')?.getAttribute('data-live-loadout-exploration-hidden') || '',
    loadoutProfileIds: Array.from(document.querySelectorAll('[data-live-loadout-profile]')).map(item => item.getAttribute('data-live-loadout-profile')),
    opponentHandLeaked: Array.from(document.querySelectorAll('[data-live-opponent] [data-live-card]')).length,
    presetDisabled: Array.from(document.querySelectorAll('[data-live-loadout-preset]')).map(button => button.disabled),
    payload: JSON.parse(window.render_game_to_text()).pvp?.live || null,
  }));
  add(
    'live UI shows matched setup state without opponent hand leak',
    /setup/.test(matchedProbe.phase)
      && /pvplm-browser-live/.test(matchedProbe.matchId)
      && /A/.test(matchedProbe.seat)
      && /1/.test(matchedProbe.stateVersion)
      && matchedProbe.opponentHandLeaked === 0
      && matchedProbe.presetDisabled.every(value => value === true)
      && /准备倒计时/.test(matchedProbe.turnTimer)
      && /连接：我方在线 · 对方在线/.test(matchedProbe.connectionStatus)
      && /^传输：/.test(matchedProbe.realtimeStatus)
      && /传输：实时通道已连接/.test(matchedProbe.realtimeStatus)
      && matchedProbe.realtimeDataset === 'connected'
      && matchedProbe.payload?.turnTimer?.reportVersion === 'pvp-live-turn-timer-v1'
      && matchedProbe.payload?.turnTimer?.phase === 'setup'
      && matchedProbe.payload?.connectionReport?.reportVersion === 'pvp-live-connection-v1'
      && matchedProbe.payload?.connectionReport?.opponent?.status === 'online'
      && matchedProbe.payload?.realtimeStatus === 'connected'
      && matchedProbe.payload?.realtimeReport?.connectionId === 'audit-live-ws-1'
      && matchedProbe.payload?.matchId === 'pvplm-browser-live',
    JSON.stringify(matchedProbe),
  );
  await page.evaluate(() => {
    window.__livePvpAuditConnectionMode = 'grace';
  });
  await page.click('[data-live-action="refresh-match"]', { timeout: 5000, force: true });
  await page.waitForTimeout(200);
  const connectionGraceProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    connectionStatus: document.querySelector('[data-live-connection-status]')?.textContent || '',
    turnTimer: document.querySelector('[data-live-turn-timer]')?.textContent || '',
    payload: JSON.parse(window.render_game_to_text()).pvp?.live || null,
  }));
  add(
    'live UI renders opponent reconnect grace without confusing it with action timeout',
    connectionGraceProbe.phase === 'setup'
      && /对方重连宽限/.test(connectionGraceProbe.connectionStatus)
      && /不会立即判负/.test(connectionGraceProbe.connectionStatus)
      && /准备倒计时/.test(connectionGraceProbe.turnTimer)
      && connectionGraceProbe.payload?.connectionReport?.opponent?.status === 'grace'
      && connectionGraceProbe.payload?.connectionReport?.opponent?.remainingGraceMs > 0,
    JSON.stringify(connectionGraceProbe),
  );
  await page.evaluate(() => {
    window.__livePvpAuditConnectionMode = 'viewer_grace';
  });
  await page.click('[data-live-action="refresh-match"]', { timeout: 5000, force: true });
  await page.waitForTimeout(200);
  const localGraceProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    connectionStatus: document.querySelector('[data-live-connection-status]')?.textContent || '',
    turnTimer: document.querySelector('[data-live-turn-timer]')?.textContent || '',
    payload: JSON.parse(window.render_game_to_text()).pvp?.live || null,
  }));
  add(
    'live UI local reconnect grace exposes resume guidance without confusing it with turn timeout',
    localGraceProbe.phase === 'setup'
      && /我方重连宽限/.test(localGraceProbe.connectionStatus)
      && /恢复|切回页面/.test(localGraceProbe.connectionStatus)
      && /准备倒计时/.test(localGraceProbe.turnTimer)
      && localGraceProbe.payload?.connectionReport?.viewer?.status === 'grace'
      && localGraceProbe.payload?.connectionReport?.viewer?.remainingGraceMs > 0,
    JSON.stringify(localGraceProbe),
  );
  await page.evaluate(() => {
    window.__livePvpAuditConnectionMode = 'viewer_disconnected';
  });
  await page.click('[data-live-action="refresh-match"]', { timeout: 5000, force: true });
  await page.waitForTimeout(200);
  const localDisconnectedProbe = await page.evaluate(() => ({
    connectionStatus: document.querySelector('[data-live-connection-status]')?.textContent || '',
    tempoAction: document.querySelector('[data-live-connection-tempo] [data-live-tempo-action="refresh-match"]')?.textContent?.trim() || '',
    tempoDuplicateGlobalRefreshCount: document.querySelectorAll('[data-live-connection-tempo] [data-live-action="refresh-match"]').length,
    globalRefreshActionCount: document.querySelectorAll('[data-live-action="refresh-match"]').length,
    payload: JSON.parse(window.render_game_to_text()).pvp?.live || null,
  }));
  add(
    'live UI local disconnected state names authoritative sync path before timeout',
    /我方断线/.test(localDisconnectedProbe.connectionStatus)
      && /刷新同步权威结果|同步权威结果/.test(localDisconnectedProbe.connectionStatus)
      && /仍在可恢复窗口会自动重连/.test(localDisconnectedProbe.connectionStatus)
      && /权威|连接超时|超时结算/.test(localDisconnectedProbe.connectionStatus)
      && !visibleProtocolPattern.test(`${localDisconnectedProbe.connectionStatus} ${localDisconnectedProbe.connectionTempo}`)
      && /刷新权威状态/.test(localDisconnectedProbe.tempoAction)
      && localDisconnectedProbe.tempoDuplicateGlobalRefreshCount === 0
      && localDisconnectedProbe.globalRefreshActionCount === 1
      && localDisconnectedProbe.payload?.connectionReport?.viewer?.status === 'disconnected',
    JSON.stringify(localDisconnectedProbe),
  );
  const activeNonTurnDisconnectProbe = await page.evaluate(() => {
    const view = {
      status: 'active',
      currentSeat: 'A',
      connectionReport: {
        reportVersion: 'pvp-live-connection-v1',
        connectionHealth: 'opponent_disconnected',
        viewerSeat: 'A',
        opponentSeat: 'B',
        heartbeatIntervalMs: 5000,
        heartbeatStaleMs: 15000,
        graceMs: 30000,
        viewer: { seatId: 'A', status: 'online', isViewer: true, remainingGraceMs: 0 },
        opponent: { seatId: 'B', status: 'disconnected', isViewer: false, remainingGraceMs: 0 },
      },
    };
    const scene = window.PVPScene;
    const tempo = scene.getLiveConnectionTempo(view, { phase: 'active' });
    const el = document.querySelector('[data-live-connection-tempo]');
    if (el) {
      el.hidden = false;
      el.setAttribute('data-live-connection-tempo-state', tempo?.tempoState || '');
      el.setAttribute('data-live-connection-tempo-actor', tempo?.affectedSeat || '');
      el.setAttribute('data-live-connection-tempo-severity', tempo?.severity || '');
      el.innerHTML = scene.renderLiveConnectionTempo(view, { phase: 'active' });
    }
    return {
      phase: view.status,
      currentSeat: view.currentSeat,
      connectionStatus: scene.formatLiveConnectionStatus(view),
      connectionTempo: el?.textContent?.replace(/\s+/g, ' ').trim() || '',
      connectionTempoState: el?.getAttribute('data-live-connection-tempo-state') || '',
      connectionTempoActor: el?.getAttribute('data-live-connection-tempo-actor') || '',
      connectionTempoCta: el?.querySelector('[data-live-action="refresh-match"]')?.textContent?.trim() || '',
      payload: {
        connectionTempoReport: tempo,
        connectionReport: view.connectionReport,
      },
    };
  });
  add(
    'live UI explains active non-turn opponent disconnect without pre-announcing timeout settlement',
    activeNonTurnDisconnectProbe.phase === 'active'
      && activeNonTurnDisconnectProbe.currentSeat === 'A'
      && /对方断线/.test(activeNonTurnDisconnectProbe.connectionStatus)
      && /对局继续|当前行动仍可提交|轮到对手/.test(activeNonTurnDisconnectProbe.connectionStatus)
      && !/等待权威超时结算/.test(activeNonTurnDisconnectProbe.connectionStatus)
      && /对局继续|当前行动仍可提交|轮到对手/.test(activeNonTurnDisconnectProbe.connectionTempo)
      && activeNonTurnDisconnectProbe.connectionTempoState === 'opponent_non_turn_disconnected'
      && activeNonTurnDisconnectProbe.connectionTempoActor === 'B'
      && !activeNonTurnDisconnectProbe.connectionTempoCta
      && activeNonTurnDisconnectProbe.payload?.connectionTempoReport?.reportVersion === 'pvp-live-connection-tempo-v1'
      && activeNonTurnDisconnectProbe.payload?.connectionTempoReport?.tempoState === 'opponent_non_turn_disconnected'
      && activeNonTurnDisconnectProbe.payload?.connectionTempoReport?.affectedSeat === 'B'
      && activeNonTurnDisconnectProbe.payload?.connectionTempoReport?.usesHiddenInformation === false
      && activeNonTurnDisconnectProbe.payload?.connectionReport?.opponent?.status === 'disconnected',
    JSON.stringify(activeNonTurnDisconnectProbe),
  );
  const activeCurrentTurnDisconnectProbe = await page.evaluate(() => {
    const view = {
      status: 'active',
      currentSeat: 'B',
      connectionReport: {
        reportVersion: 'pvp-live-connection-v1',
        connectionHealth: 'opponent_disconnected',
        viewerSeat: 'A',
        opponentSeat: 'B',
        heartbeatIntervalMs: 5000,
        heartbeatStaleMs: 15000,
        graceMs: 30000,
        viewer: { seatId: 'A', status: 'online', isViewer: true, remainingGraceMs: 0 },
        opponent: { seatId: 'B', status: 'disconnected', isViewer: false, remainingGraceMs: 0 },
      },
    };
    const scene = window.PVPScene;
    const tempo = scene.getLiveConnectionTempo(view, { phase: 'active' });
    const el = document.querySelector('[data-live-connection-tempo]');
    if (el) {
      el.hidden = false;
      el.setAttribute('data-live-connection-tempo-state', tempo?.tempoState || '');
      el.setAttribute('data-live-connection-tempo-actor', tempo?.affectedSeat || '');
      el.setAttribute('data-live-connection-tempo-severity', tempo?.severity || '');
      el.innerHTML = scene.renderLiveConnectionTempo(view, { phase: 'active' });
    }
    return {
      phase: view.status,
      currentSeat: view.currentSeat,
      connectionStatus: scene.formatLiveConnectionStatus(view),
      connectionTempo: el?.textContent?.replace(/\s+/g, ' ').trim() || '',
      connectionTempoState: el?.getAttribute('data-live-connection-tempo-state') || '',
      payload: {
        connectionTempoReport: tempo,
        connectionReport: view.connectionReport,
      },
    };
  });
  add(
    'live UI explains active current-turn opponent disconnect as authoritative timeout pending',
    activeCurrentTurnDisconnectProbe.phase === 'active'
      && activeCurrentTurnDisconnectProbe.currentSeat === 'B'
      && /对方断线/.test(activeCurrentTurnDisconnectProbe.connectionStatus)
      && /当前行动|连接超时|超时结算/.test(activeCurrentTurnDisconnectProbe.connectionStatus)
      && /当前行动|连接超时|超时结算/.test(activeCurrentTurnDisconnectProbe.connectionTempo)
      && !visibleProtocolPattern.test(`${activeCurrentTurnDisconnectProbe.connectionStatus} ${activeCurrentTurnDisconnectProbe.connectionTempo}`)
      && activeCurrentTurnDisconnectProbe.connectionTempoState === 'opponent_action_timeout_pending'
      && activeCurrentTurnDisconnectProbe.payload?.connectionTempoReport?.tempoState === 'opponent_action_timeout_pending'
      && activeCurrentTurnDisconnectProbe.payload?.connectionTempoReport?.affectedSeat === 'B',
    JSON.stringify(activeCurrentTurnDisconnectProbe),
  );
  const authoritativeTempoPriorityProbe = await page.evaluate(() => {
    const view = {
      matchId: 'pvpm-browser-authoritative-tempo',
      status: 'active',
      currentSeat: 'B',
      stateVersion: 18,
      connectionReport: {
        reportVersion: 'pvp-live-connection-v1',
        connectionHealth: 'good',
        viewerSeat: 'A',
        opponentSeat: 'B',
        heartbeatIntervalMs: 5000,
        heartbeatStaleMs: 15000,
        graceMs: 30000,
        viewer: { seatId: 'A', status: 'online', isViewer: true, remainingGraceMs: 0 },
        opponent: { seatId: 'B', status: 'online', isViewer: false, remainingGraceMs: 0 },
      },
      connectionTempoReport: {
        reportVersion: 'pvp-live-connection-tempo-v1',
        sourceVisibility: 'server_authoritative_connection_state',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        tempoState: 'opponent_action_timeout_pending',
        severity: 'warning',
        phase: 'active',
        currentSeat: 'B',
        viewerSeat: 'A',
        opponentSeat: 'B',
        affectedSeat: 'B',
        statusLine: '连接：服务端权威 tempo 优先',
        detailLine: '服务端权威连接节奏覆盖本地在线推导。',
        actionBoundary: 'wait_for_authoritative_timeout',
        canSubmitIntent: false,
        shouldWaitForAuthority: true,
        safeguards: ['server_authoritative_projection'],
      },
    };
    const scene = window.PVPScene;
    const originalGetLiveSession = scene.getLiveSession;
    scene.getLiveSession = () => ({
      getState: () => ({
        phase: 'active',
        matchId: view.matchId,
        seatId: 'A',
        stateView: view,
        realtimeStatus: 'connected',
        lastRealtimeSyncAt: Date.now(),
        realtimeReport: null,
        lastEvents: [],
      }),
    });
    const tempo = scene.getLiveConnectionTempo(view, { phase: 'active' });
    const textPayload = JSON.parse(window.render_game_to_text()).pvp?.live || null;
    scene.getLiveSession = originalGetLiveSession;
    const el = document.querySelector('[data-live-connection-tempo]');
    if (el) {
      el.hidden = !tempo || tempo.tempoState === 'stable';
      el.setAttribute('data-live-connection-tempo-state', tempo?.tempoState || '');
      el.setAttribute('data-live-connection-tempo-actor', tempo?.affectedSeat || '');
      el.setAttribute('data-live-connection-tempo-severity', tempo?.severity || '');
      el.innerHTML = scene.renderLiveConnectionTempo(view, { phase: 'active' });
    }
    return {
      connectionStatus: scene.formatLiveConnectionStatus(view),
      connectionTempo: el?.textContent?.replace(/\s+/g, ' ').trim() || '',
      connectionTempoState: el?.getAttribute('data-live-connection-tempo-state') || '',
      connectionTempoActor: el?.getAttribute('data-live-connection-tempo-actor') || '',
      connectionTempoSeverity: el?.getAttribute('data-live-connection-tempo-severity') || '',
      tempo,
      textTempo: textPayload?.connectionTempoReport || null,
    };
  });
  add(
    'live UI prefers server connection tempo over local online inference',
    /服务端权威 tempo 优先/.test(authoritativeTempoPriorityProbe.connectionStatus)
      && /服务端权威连接节奏覆盖本地在线推导/.test(authoritativeTempoPriorityProbe.connectionTempo)
      && authoritativeTempoPriorityProbe.connectionTempoState === 'opponent_action_timeout_pending'
      && authoritativeTempoPriorityProbe.connectionTempoActor === 'B'
      && authoritativeTempoPriorityProbe.connectionTempoSeverity === 'warning'
      && authoritativeTempoPriorityProbe.tempo?.sourceVisibility === 'server_authoritative_connection_state'
      && authoritativeTempoPriorityProbe.tempo?.actionBoundary === 'wait_for_authoritative_timeout'
      && authoritativeTempoPriorityProbe.textTempo?.tempoState === 'opponent_action_timeout_pending'
      && authoritativeTempoPriorityProbe.textTempo?.sourceVisibility === 'server_authoritative_connection_state',
    JSON.stringify(authoritativeTempoPriorityProbe),
  );
  const authoritativeSubmitBlockProbe = await page.evaluate(async () => {
    const scene = window.PVPScene;
    const originalGetLiveSession = scene.getLiveSession;
    const originalStartLiveHeartbeat = scene.startLiveHeartbeat;
    const originalStopLiveHeartbeat = scene.stopLiveHeartbeat;
    originalStopLiveHeartbeat?.call(scene);
    const blockedView = {
      ...window.__makeLivePvpAuditStateView(18, 'A', 'active'),
      matchId: 'pvpm-browser-authoritative-submit-block',
      connectionTempoReport: {
        reportVersion: 'pvp-live-connection-tempo-v1',
        sourceVisibility: 'server_authoritative_connection_state',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        tempoState: 'viewer_reconnect_grace',
        severity: 'warning',
        phase: 'active',
        currentSeat: 'A',
        viewerSeat: 'A',
        opponentSeat: 'B',
        affectedSeat: 'A',
        statusLine: '连接：我方重连宽限 12s',
        detailLine: '本地画面可能落后，先刷新权威状态。',
        action: { id: 'refresh_match', label: '刷新权威状态' },
        actionBoundary: 'recover_connection',
        canSubmitIntent: false,
        shouldWaitForAuthority: true,
        remainingGraceMs: 12000,
        safeguards: ['server_authoritative_projection'],
      },
    };
    const sentIntents = [];
    const blockedState = {
      phase: 'active',
      matchId: blockedView.matchId,
      seatId: 'A',
      stateView: blockedView,
      realtimeStatus: 'connected',
      lastRealtimeSyncAt: Date.now(),
      realtimeReport: null,
      lastEvents: [],
    };
    const blockedSession = {
      getState: () => blockedState,
      connectRealtime: () => true,
      joinRealtimeMatch: () => true,
      disconnectRealtime: () => {},
      submitRealtimeIntent: (intent, matchId) => {
        sentIntents.push({ transport: 'realtime', intent, matchId });
        return true;
      },
      submitIntent: async (intent) => {
        sentIntents.push({ transport: 'http', intent });
        return blockedState;
      },
    };
    scene.getLiveSession = () => blockedSession;
    scene.startLiveHeartbeat = () => {};
    scene.stopLiveHeartbeat = () => {};
    scene.liveInlineHint = '';
    scene.clearLiveOpeningActionConfirm?.();
    scene.clearLiveSurrenderConfirm?.();
    scene.renderLivePanel();
    const buttonDisabled = action => {
      const button = document.querySelector(`[data-live-action="${action}"]`);
      return button ? button.disabled : null;
    };
    const beforeGlobalCalls = window.__livePvpAuditCalls.length;
    const beforeDirectProbe = {
      buttons: {
        refreshMatch: buttonDisabled('refresh-match'),
        endTurn: buttonDisabled('end-turn'),
        surrender: buttonDisabled('surrender'),
        ready: buttonDisabled('ready'),
        confirmMulligan: buttonDisabled('confirm-mulligan'),
      },
      handCardsDisabled: Array.from(document.querySelectorAll('[data-live-card]')).map(button => button.disabled),
      emotesDisabled: Array.from(document.querySelectorAll('[data-live-emote]')).map(button => button.disabled),
      tempoBoundary: document.querySelector('[data-live-connection-tempo]')?.getAttribute('data-live-connection-tempo-boundary') || '',
      tempoCanSubmit: document.querySelector('[data-live-connection-tempo]')?.getAttribute('data-live-connection-tempo-can-submit') || '',
      textTempo: JSON.parse(window.render_game_to_text()).pvp?.live?.connectionTempoReport || null,
    };
    await scene.endLiveTurn();
    await scene.readyLiveMatch();
    await scene.submitLiveEmote('respect');
    await scene.submitLiveCard('A-strike-1');
    const result = {
      ...beforeDirectProbe,
      sentIntents,
      globalCallDelta: window.__livePvpAuditCalls.slice(beforeGlobalCalls),
      hint: document.querySelector('[data-live-last-error]')?.textContent || '',
    };
    scene.getLiveSession = originalGetLiveSession;
    scene.startLiveHeartbeat = originalStartLiveHeartbeat;
    scene.stopLiveHeartbeat = originalStopLiveHeartbeat;
    scene.liveInlineHint = '';
    scene.clearLiveOpeningActionConfirm?.();
    scene.clearLiveSurrenderConfirm?.();
    scene.renderLivePanel();
    return result;
  });
  add(
    'live UI blocks stale inputs when server connection tempo requires authoritative recovery',
    authoritativeSubmitBlockProbe.buttons.refreshMatch === false
      && authoritativeSubmitBlockProbe.buttons.endTurn === true
      && authoritativeSubmitBlockProbe.buttons.surrender === true
      && authoritativeSubmitBlockProbe.buttons.ready === true
      && authoritativeSubmitBlockProbe.buttons.confirmMulligan === true
      && authoritativeSubmitBlockProbe.handCardsDisabled.length > 0
      && authoritativeSubmitBlockProbe.handCardsDisabled.every(value => value === true)
      && authoritativeSubmitBlockProbe.emotesDisabled.length > 0
      && authoritativeSubmitBlockProbe.emotesDisabled.every(value => value === true)
      && authoritativeSubmitBlockProbe.tempoBoundary === 'recover_connection'
      && authoritativeSubmitBlockProbe.tempoCanSubmit === 'false'
      && authoritativeSubmitBlockProbe.textTempo?.actionBoundary === 'recover_connection'
      && authoritativeSubmitBlockProbe.textTempo?.canSubmitIntent === false
      && authoritativeSubmitBlockProbe.sentIntents.length === 0
      && authoritativeSubmitBlockProbe.globalCallDelta.length === 0
      && /刷新权威状态|连接|权威/.test(authoritativeSubmitBlockProbe.hint),
    JSON.stringify(authoritativeSubmitBlockProbe),
  );
  await page.evaluate(() => {
    window.__livePvpAuditConnectionMode = 'online';
    window.PVPScene.renderLivePanel();
  });
  await page.evaluate(() => {
    window.__livePvpAuditConnectionMode = 'online';
  });
  await page.click('[data-live-action="refresh-match"]', { timeout: 5000, force: true });
  await page.waitForTimeout(200);
  add(
    'live UI renders ranked opponent public profile without build reveal',
    /破阵斗法谱/.test(matchedProbe.selfLoadout)
      && /sword/.test(matchedProbe.selfLoadout)
      && /已锁定/.test(matchedProbe.selfLoadout)
      && /公开画像/.test(matchedProbe.opponentLoadout)
      && /流派待观察/.test(matchedProbe.opponentLoadout)
      && /构筑隐藏/.test(matchedProbe.opponentLoadout)
      && !/守势斗法谱|shield|hash-opponent/.test(matchedProbe.opponentLoadout)
      && matchedProbe.payload?.self?.loadout?.loadoutHash === 'hash-self-sword-123456'
      && matchedProbe.payload?.opponent?.publicProfile?.reportVersion === 'pvp-live-ranked-opponent-profile-v1'
      && !Object.prototype.hasOwnProperty.call(matchedProbe.payload?.opponent || {}, 'loadout')
      && !matchedProbe.payload?.opponent?.loadoutSnapshot
      && !matchedProbe.payload?.opponent?.deck
      && !/hash-opponent|守势斗法谱|identitySlot|loadoutHash|loadoutSummary|loadoutSnapshot/.test(JSON.stringify(matchedProbe.payload?.opponent || {})),
    JSON.stringify(matchedProbe),
  );
  add(
    'live UI renders public match quality report without hidden rating leak',
    /匹配质量：良好/.test(matchedProbe.matchQuality)
      && /mvp_open_pool/.test(matchedProbe.matchQuality)
      && /unrated_mvp/.test(matchedProbe.matchQuality)
      && /连接健康通过/.test(matchedProbe.matchQuality)
      && matchedProbe.payload?.matchQuality?.reportVersion === 'pvp-live-match-quality-v1'
      && matchedProbe.payload?.matchQuality?.tag === 'good'
      && matchedProbe.payload?.matchQuality?.ratingDeltaBucket === 'unrated_mvp'
      && matchedProbe.payload?.matchQuality?.connectionHealth === 'pass'
      && matchedProbe.payload?.matchQuality?.connectionHealthSummary?.sampleTag === 'client_preflight'
      && !/rating":|score":|elo/i.test(JSON.stringify(matchedProbe.payload?.matchQuality || {})),
    JSON.stringify(matchedProbe),
  );
  add(
    'live UI renders first-match guide report without reward or rating promises',
    /首战简报/.test(matchedProbe.firstGuide)
      && /模式/.test(matchedProbe.firstGuide)
      && /锁谱/.test(matchedProbe.firstGuide)
      && /调息/.test(matchedProbe.firstGuide)
      && /护体/.test(matchedProbe.firstGuide)
      && /默认斗法谱/.test(matchedProbe.firstGuide)
      && /破阵斗法谱/.test(matchedProbe.firstGuide)
      && /守势斗法谱/.test(matchedProbe.firstGuide)
      && /弱点/.test(matchedProbe.firstGuide)
      && /准备超时/.test(matchedProbe.firstGuide)
      && /需要同步/.test(matchedProbe.firstGuide)
      && /查看权威事件/.test(matchedProbe.firstGuide)
      && /调整斗法谱/.test(matchedProbe.firstGuide)
      && /继续真人排位/.test(matchedProbe.firstGuide)
      && matchedProbe.payload?.firstMatchGuide?.reportVersion === 'pvp-live-first-match-guide-v1'
      && matchedProbe.payload?.firstMatchGuide?.safeguards?.includes('opening_protection')
      && matchedProbe.payload?.firstMatchGuide?.recommendedLoadouts?.length === 3
      && matchedProbe.payload?.firstMatchGuide?.exceptionBranches?.some(item => item.id === 'ready_timeout')
      && matchedProbe.payload?.firstMatchGuide?.reviewActions?.length >= 3
      && matchedProbe.payload?.firstMatchGuide?.steps?.some(step => step.id === 'setup_ready')
      && !/reward|rating|elo/i.test(`${matchedProbe.firstGuide} ${JSON.stringify(matchedProbe.payload?.firstMatchGuide || {})}`),
    JSON.stringify(matchedProbe),
  );
  add(
    'live UI renders loadout exploration report without hidden payloads',
    /谱系探索/.test(matchedProbe.loadoutExplorationText)
      && /快攻压迫/.test(matchedProbe.loadoutExplorationText)
      && /守势反击/.test(matchedProbe.loadoutExplorationText)
      && /过牌中速/.test(matchedProbe.loadoutExplorationText)
      && /不改变生命、伤害、抽牌、灵力、起手或匹配/.test(matchedProbe.loadoutExplorationText)
      && matchedProbe.loadoutExplorationSource === 'public_content'
      && matchedProbe.loadoutExplorationHidden === 'false'
      && ['aggro_pressure', 'shield_counter', 'draw_midrange'].every(id => matchedProbe.loadoutProfileIds.includes(id))
      && matchedProbe.payload?.loadoutExplorationReport?.reportVersion === 'pvp-live-loadout-exploration-v1'
      && matchedProbe.payload?.loadoutExplorationReport?.sourceVisibility === 'public_content'
      && matchedProbe.payload?.loadoutExplorationReport?.usesHiddenInformation === false
      && matchedProbe.payload?.loadoutExplorationReport?.rankedImpact === 'none'
      && matchedProbe.payload?.loadoutExplorationReport?.profiles?.length >= 3
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|rating|elo/i.test(JSON.stringify(matchedProbe.payload?.loadoutExplorationReport || {})),
    JSON.stringify(matchedProbe),
  );
  add(
    'live UI renders public duel momentum report without hidden payloads',
    /局势/.test(matchedProbe.duelMomentum)
      && /行动窗口|反打窗口/.test(matchedProbe.duelMomentum)
      && matchedProbe.duelMomentumState === 'setup'
      && matchedProbe.duelMomentumSource === 'public_state'
      && matchedProbe.duelMomentumHidden === 'false'
      && matchedProbe.payload?.duelMomentumReport?.reportVersion === 'pvp-live-duel-momentum-v1'
      && matchedProbe.payload?.duelMomentumReport?.sourceVisibility === 'public_state'
      && matchedProbe.payload?.duelMomentumReport?.usesHiddenInformation === false
      && matchedProbe.payload?.duelMomentumReport?.rankedImpact === 'none'
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(`${matchedProbe.duelMomentum} ${JSON.stringify(matchedProbe.payload?.duelMomentumReport || {})}`),
    JSON.stringify(matchedProbe),
  );
  add(
    'live UI renders public intent signal report without hidden payloads',
    /读牌/.test(matchedProbe.intentSignal)
      && /公开牌池上限|准备/.test(matchedProbe.intentSignal)
      && /反制窗口/.test(matchedProbe.intentSignal)
      && matchedProbe.intentSignalState === 'setup_read'
      && matchedProbe.intentSignalSource === 'public_state_and_public_content'
      && matchedProbe.intentSignalHidden === 'false'
      && matchedProbe.payload?.intentSignalReport?.reportVersion === 'pvp-live-intent-signal-v1'
      && matchedProbe.payload?.intentSignalReport?.sourceVisibility === 'public_state_and_public_content'
      && matchedProbe.payload?.intentSignalReport?.usesHiddenInformation === false
      && matchedProbe.payload?.intentSignalReport?.rankedImpact === 'none'
      && matchedProbe.payload?.intentSignalReport?.safeguards?.includes('private_card_projection_blocked')
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(`${matchedProbe.intentSignal} ${JSON.stringify(matchedProbe.payload?.intentSignalReport || {})}`),
    JSON.stringify(matchedProbe),
  );

  await page.evaluate(() => document.querySelector('[data-live-mulligan-card]')?.click());
  await page.evaluate(() => document.querySelector('[data-live-action="confirm-mulligan"]')?.click());
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('[data-live-action="ready"]')?.click());
  await page.waitForTimeout(200);
  const setupProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    firstGuide: document.querySelector('[data-live-first-guide]')?.textContent || '',
    openingSafeguard: document.querySelector('[data-live-opening-safeguard]')?.textContent || '',
    openerAssignment: document.querySelector('[data-live-opener-assignment]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    duelMomentum: document.querySelector('[data-live-duel-momentum]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    duelMomentumState: document.querySelector('[data-live-duel-momentum]')?.getAttribute('data-live-duel-momentum-state') || '',
    intentSignal: document.querySelector('[data-live-intent-signal]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    intentSignalState: document.querySelector('[data-live-intent-signal]')?.getAttribute('data-live-intent-signal-state') || '',
    intentSignalHidden: document.querySelector('[data-live-intent-signal]')?.getAttribute('data-live-intent-signal-hidden') || '',
    turnTimer: document.querySelector('[data-live-turn-timer]')?.textContent || '',
    presetDisabled: Array.from(document.querySelectorAll('[data-live-loadout-preset]')).map(button => button.disabled),
    calls: window.__livePvpAuditCalls,
    payload: JSON.parse(window.render_game_to_text()).pvp?.live || null,
  }));
  add(
    'live UI completes setup mulligan and ready before battle actions',
    setupProbe.phase === 'active'
      && setupProbe.presetDisabled.every(value => value === true)
      && /行动倒计时/.test(setupProbe.turnTimer)
      && setupProbe.payload?.turnTimer?.phase === 'active'
      && /mulligan/.test(JSON.stringify(setupProbe.calls))
      && /ready/.test(JSON.stringify(setupProbe.calls)),
    JSON.stringify(setupProbe),
  );
  add(
    'live UI updates first-match guide next action after setup',
    setupProbe.phase === 'active'
      && /按当前行动席位出牌/.test(setupProbe.firstGuide)
      && setupProbe.payload?.firstMatchGuide?.nextAction === '按当前行动席位出牌，留意权威事件。',
    JSON.stringify(setupProbe),
  );
  add(
    'live UI renders active opening safeguard report without hidden payloads',
    setupProbe.phase === 'active'
      && /首动预算/.test(setupProbe.openingSafeguard)
      && /当前 A/.test(setupProbe.openingSafeguard)
      && /18/.test(setupProbe.openingSafeguard)
      && /开局护体/.test(setupProbe.openingSafeguard)
      && /保底 1 血/.test(setupProbe.openingSafeguard)
      && /后手护盾/.test(setupProbe.openingSafeguard)
      && /B \+3/.test(setupProbe.openingSafeguard)
      && /我方先手|对方先手/.test(setupProbe.openerAssignment)
      && /服务端种子/.test(setupProbe.openerAssignment)
      && /不绑定排队|不绑定房主/.test(setupProbe.openerAssignment)
      && setupProbe.payload?.openerAssignment?.reportVersion === 'pvp-live-opener-assignment-v1'
      && setupProbe.payload?.openingSafeguardReport?.reportVersion === 'pvp-live-opening-safeguard-v1'
      && setupProbe.payload?.openingSafeguardReport?.damageBudget?.currentActionBudget === 18
      && setupProbe.payload?.openingSafeguardReport?.secondSeatBuffer?.seatId === 'B'
      && setupProbe.payload?.openingSafeguardReport?.secondSeatBuffer?.block === 3
      && setupProbe.payload?.openingSafeguardReport?.openingProtection?.protectedSeats?.includes('B')
      && setupProbe.payload?.openingSafeguardReport?.usesHiddenInformation === false
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(`${setupProbe.openingSafeguard} ${JSON.stringify(setupProbe.payload?.openingSafeguardReport || {})}`),
    JSON.stringify(setupProbe),
  );
  const setupActionPreview = setupProbe.payload?.actionPreviewReport?.playableCards?.find(card => card.cardInstanceId === 'A-strike-1');
  add(
    'live UI exposes authoritative action preview report for opening card without hidden opponent payloads',
    setupProbe.payload?.actionPreviewReport?.reportVersion === 'pvp-live-action-preview-v1'
      && setupProbe.payload?.actionPreviewReport?.sourceVisibility === 'viewer_public_state'
      && setupProbe.payload?.actionPreviewReport?.usesHiddenInformation === false
      && setupProbe.payload?.actionPreviewReport?.rankedImpact === 'none'
      && setupActionPreview?.damageBudget === 18
      && setupActionPreview?.budgetedDamage === 8
      && setupActionPreview?.blockedDamage === 3
      && setupActionPreview?.hpDamage === 5
      && setupActionPreview?.targetHpAfter === 45
      && /预算后\s*8/.test(setupActionPreview?.summaryLine || '')
      && !/deck|loadoutSnapshot|reward|rating|elo|opponentHand|opponentDeck/i.test(JSON.stringify(setupProbe.payload?.actionPreviewReport || {})),
    JSON.stringify(setupProbe.payload?.actionPreviewReport || null),
  );
  add(
    'live UI renders active duel momentum opening window without hidden payloads',
    setupProbe.phase === 'active'
      && /局势/.test(setupProbe.duelMomentum)
      && /开局护体/.test(setupProbe.duelMomentum)
      && /行动窗口/.test(setupProbe.duelMomentum)
      && /反打窗口/.test(setupProbe.duelMomentum)
      && setupProbe.duelMomentumState === 'opening_window'
      && setupProbe.payload?.duelMomentumReport?.pressureState === 'opening_window'
      && setupProbe.payload?.duelMomentumReport?.safeguards?.includes('second_seat_buffer')
      && setupProbe.payload?.duelMomentumReport?.usesHiddenInformation === false
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(`${setupProbe.duelMomentum} ${JSON.stringify(setupProbe.payload?.duelMomentumReport || {})}`),
    JSON.stringify(setupProbe),
  );
  add(
    'live UI renders active public intent signal opening window without hidden payloads',
    setupProbe.phase === 'active'
      && /公开压迫/.test(setupProbe.intentSignal)
      && /公开牌池上限/.test(setupProbe.intentSignal)
      && /反制窗口/.test(setupProbe.intentSignal)
      && /不含隐藏信息/.test(setupProbe.intentSignal)
      && setupProbe.intentSignalState === 'opening_pressure'
      && setupProbe.intentSignalHidden === 'false'
      && setupProbe.payload?.intentSignalReport?.reportVersion === 'pvp-live-intent-signal-v1'
      && setupProbe.payload?.intentSignalReport?.signalState === 'opening_pressure'
      && setupProbe.payload?.intentSignalReport?.threat?.publicDamageCeiling === 15
      && setupProbe.payload?.intentSignalReport?.responseWindow?.hasOpeningProtection === true
      && setupProbe.payload?.intentSignalReport?.responseWindow?.hasPendingCounterplay === true
      && setupProbe.payload?.intentSignalReport?.usesHiddenInformation === false
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(`${setupProbe.intentSignal} ${JSON.stringify(setupProbe.payload?.intentSignalReport || {})}`),
    JSON.stringify(setupProbe),
  );
  const foregroundResumeProbe = await page.evaluate(async () => {
    const delay = (ms = 0) => new Promise(resolve => window.setTimeout(resolve, ms));
    const session = window.PVPScene.getLiveSession();
    window.__livePvpAuditConnectionMode = 'online';
    window.PVPScene.activeTab = 'live';
    const originalForegroundResumeDebounceMs = window.PVPScene.liveForegroundResumeDebounceMs;
    window.PVPScene.liveForegroundResumeDebounceMs = 80;
    if (window.PVPScene.liveForegroundResumeTimer) {
      window.clearTimeout(window.PVPScene.liveForegroundResumeTimer);
      window.PVPScene.liveForegroundResumeTimer = null;
    }
    window.PVPScene.liveForegroundResumeQueued = false;

    const counters = {
      resumeRealtime: 0,
      heartbeat: 0,
      sendLiveHeartbeat: 0,
    };
    const originalResumeRealtime = session.resumeRealtime ? session.resumeRealtime.bind(session) : null;
    const originalHeartbeat = session.heartbeat ? session.heartbeat.bind(session) : null;
    const originalSendLiveHeartbeat = window.PVPScene.sendLiveHeartbeat.bind(window.PVPScene);
    const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    const originalHeartbeatStateView = window.__livePvpAuditHeartbeatStateView;
    const stateBeforeReconnect = session.getState?.()?.stateView || null;
    let hidden = false;

    session.resumeRealtime = (...args) => {
      counters.resumeRealtime += 1;
      return originalResumeRealtime ? originalResumeRealtime(...args) : false;
    };
    session.heartbeat = async (...args) => {
      counters.heartbeat += 1;
      return originalHeartbeat ? await originalHeartbeat(...args) : null;
    };
    window.PVPScene.sendLiveHeartbeat = async (...args) => {
      counters.sendLiveHeartbeat += 1;
      return await originalSendLiveHeartbeat(...args);
    };
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    });

    window.__livePvpAuditHeartbeatStateView = stateBeforeReconnect
      ? JSON.parse(JSON.stringify(stateBeforeReconnect))
      : window.__makeLivePvpAuditStateView?.(3, 'A', 'active');
    session.connectRealtime?.();
    session.joinRealtimeMatch?.('pvplm-browser-live');
    await delay(20);
    window.__livePvpAuditRealtimeHandlers?.onClose?.();
    await delay(0);
    const beforeResumeStatus = session.getState?.()?.realtimeStatus || '';
    const beforeResumePayload = JSON.parse(window.render_game_to_text()).pvp?.live || null;
    window.__livePvpAuditRecordRealtime = true;
    const callsBeforeResume = window.__livePvpAuditCalls.length;

    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await delay(0);
    const hiddenCounters = { ...counters };

    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await delay(0);
    window.dispatchEvent(new Event('focus'));
    await delay(0);
    window.dispatchEvent(new Event('pageshow'));
    await delay(160);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const realtimeState = document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-realtime-state') || '';
      const realtimeStatus = document.querySelector('[data-live-realtime-status]')?.textContent || '';
      if (realtimeState === 'connected' && /实时通道已连接/.test(realtimeStatus)) break;
      await delay(50);
    }

    const probe = {
      beforeResumeStatus,
      hiddenCounters,
      counters: { ...counters },
      beforePayload: beforeResumePayload,
      realtimeState: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-realtime-state') || '',
      realtimeStatus: document.querySelector('[data-live-realtime-status]')?.textContent || '',
      connectionStatus: document.querySelector('[data-live-connection-status]')?.textContent || '',
      payload: JSON.parse(window.render_game_to_text()).pvp?.live || null,
      calls: window.__livePvpAuditCalls.slice(callsBeforeResume),
    };

    session.resumeRealtime = originalResumeRealtime;
    session.heartbeat = originalHeartbeat;
    window.PVPScene.sendLiveHeartbeat = originalSendLiveHeartbeat;
    window.__livePvpAuditRecordRealtime = false;
    window.PVPScene.liveForegroundResumeDebounceMs = originalForegroundResumeDebounceMs;
    if (originalHeartbeatStateView == null) {
      delete window.__livePvpAuditHeartbeatStateView;
    } else {
      window.__livePvpAuditHeartbeatStateView = originalHeartbeatStateView;
    }
    if (originalHiddenDescriptor) {
      Object.defineProperty(document, 'hidden', originalHiddenDescriptor);
    } else {
      delete document.hidden;
    }
    return probe;
  });
  add(
    'live UI foreground resume catches up reconnecting match without manual refresh',
    foregroundResumeProbe.beforeResumeStatus === 'reconnecting'
      && foregroundResumeProbe.hiddenCounters.resumeRealtime === 0
      && foregroundResumeProbe.hiddenCounters.heartbeat === 0
      && foregroundResumeProbe.hiddenCounters.sendLiveHeartbeat === 0
      && foregroundResumeProbe.counters.sendLiveHeartbeat === 1
      && foregroundResumeProbe.counters.resumeRealtime === 1
      && foregroundResumeProbe.counters.heartbeat === 1
      && /连接：我方在线 · 对方在线/.test(foregroundResumeProbe.connectionStatus)
      && foregroundResumeProbe.realtimeState === 'connected'
      && /传输：实时通道已连接/.test(foregroundResumeProbe.realtimeStatus)
      && foregroundResumeProbe.payload?.connectionReport?.opponent?.status === 'online'
      && foregroundResumeProbe.payload?.realtimeStatus === 'connected'
      && foregroundResumeProbe.payload?.realtimeReport?.connectionId === 'audit-live-ws-1'
      && foregroundResumeProbe.calls.some(call => call.method === 'connectRealtime')
      && foregroundResumeProbe.calls.some(call => call.method === 'realtimeSend'
        && call.payload?.type === 'join_match'
        && call.payload?.matchId === 'pvplm-browser-live'
        && Number.isFinite(Number(call.payload?.lastSeenRevision)))
      && foregroundResumeProbe.calls.some(call => call.method === 'realtimeSend'
        && call.payload?.type === 'heartbeat'
        && call.payload?.matchId === 'pvplm-browser-live'
        && Number.isFinite(Number(call.payload?.lastSeenRevision)))
      && foregroundResumeProbe.calls.some(call => call.method === 'heartbeat' && call.matchId === 'pvplm-browser-live'),
    JSON.stringify(foregroundResumeProbe),
  );
  add(
    'live UI foreground resume preserves active turn window without terminal fallout',
    foregroundResumeProbe.beforePayload?.phase === 'active'
      && foregroundResumeProbe.payload?.phase === 'active'
      && foregroundResumeProbe.payload?.currentSeat === foregroundResumeProbe.beforePayload?.currentSeat
      && foregroundResumeProbe.payload?.turnTimer?.startedAt === foregroundResumeProbe.beforePayload?.turnTimer?.startedAt
      && foregroundResumeProbe.payload?.turnTimer?.deadlineAt === foregroundResumeProbe.beforePayload?.turnTimer?.deadlineAt
      && foregroundResumeProbe.payload?.postMatchReview == null
      && !(foregroundResumeProbe.payload?.lastEvents || []).some(event => ['connection_timeout', 'turn_timeout', 'match_finished'].includes(event.eventType)),
    JSON.stringify(foregroundResumeProbe),
  );
  const reopenCurrentMatchProbe = await page.evaluate(async () => {
    const delay = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
    const scene = window.PVPScene;
    const liveService = window.PVPService?.live || {};
    const session = scene?.getLiveSession?.();
    const beforeState = session?.getState?.() || {};
    const beforePayload = JSON.parse(window.render_game_to_text()).pvp?.live || null;
    const activeStateView = beforeState?.stateView
      ? JSON.parse(JSON.stringify(beforeState.stateView))
      : window.__makeLivePvpAuditStateView?.(3, 'A', 'active');
    if (activeStateView) {
      activeStateView.status = 'active';
      activeStateView.matchId = activeStateView.matchId || beforePayload?.matchId || 'pvplm-browser-live';
      activeStateView.currentSeat = activeStateView.currentSeat || beforePayload?.currentSeat || 'A';
      if (!activeStateView.turnTimer) {
        activeStateView.turnTimer = {
          reportVersion: 'pvp-live-turn-timer-v1',
          phase: 'active',
          currentSeat: activeStateView.currentSeat,
          viewerSeat: beforePayload?.seatId || 'A',
          isViewerTurn: activeStateView.currentSeat === (beforePayload?.seatId || 'A'),
          startedAt: Date.now(),
          deadlineAt: Date.now() + 90000,
          timeoutMs: 90000,
          remainingMs: 90000,
        };
      }
      activeStateView.postMatchReview = null;
      activeStateView.recentEvents = Array.isArray(activeStateView.recentEvents)
        ? activeStateView.recentEvents.filter(event => !['connection_timeout', 'turn_timeout', 'match_finished'].includes(String(event?.eventType || '')))
        : [];
    }
    const originalGetCurrentMatch = liveService.getCurrentMatch;
    const callsBefore = window.__livePvpAuditCalls.length;
    try {
      liveService.getCurrentMatch = async () => {
        window.__livePvpAuditCalls.push({ method: 'getCurrentMatch', reopenLiveTab: true });
        return {
          success: true,
          matchId: activeStateView?.matchId || beforePayload?.matchId || 'pvplm-browser-live',
          seatId: beforeState?.seatId || beforePayload?.seatId || 'A',
          stateView: activeStateView,
          events: Array.isArray(activeStateView?.recentEvents) ? activeStateView.recentEvents.slice(-8) : [],
        };
      };
      if (scene) {
        scene.liveSession = null;
        scene.activeTab = 'live';
        await scene.loadLivePanel();
      }
      await delay(20);
      return {
        beforePayload,
        payload: JSON.parse(window.render_game_to_text()).pvp?.live || null,
        phaseAttr: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
        timerText: document.querySelector('[data-live-turn-timer]')?.textContent || '',
        reviewHidden: document.querySelector('[data-live-post-match-review]')?.hidden ?? false,
        calls: window.__livePvpAuditCalls.slice(callsBefore),
      };
    } finally {
      if (originalGetCurrentMatch) {
        liveService.getCurrentMatch = originalGetCurrentMatch;
      } else {
        delete liveService.getCurrentMatch;
      }
    }
  });
  add(
    'live UI reopening live tab recovers the same active current match',
    reopenCurrentMatchProbe.beforePayload?.phase === 'active'
      && reopenCurrentMatchProbe.payload?.phase === 'active'
      && reopenCurrentMatchProbe.phaseAttr === 'active'
      && reopenCurrentMatchProbe.payload?.matchId === reopenCurrentMatchProbe.beforePayload?.matchId
      && reopenCurrentMatchProbe.payload?.currentSeat === reopenCurrentMatchProbe.beforePayload?.currentSeat
      && reopenCurrentMatchProbe.payload?.turnTimer?.startedAt === reopenCurrentMatchProbe.beforePayload?.turnTimer?.startedAt
      && reopenCurrentMatchProbe.payload?.turnTimer?.deadlineAt === reopenCurrentMatchProbe.beforePayload?.turnTimer?.deadlineAt
      && reopenCurrentMatchProbe.payload?.postMatchReview == null
      && reopenCurrentMatchProbe.reviewHidden === true
      && /行动倒计时/.test(reopenCurrentMatchProbe.timerText)
      && !(reopenCurrentMatchProbe.payload?.lastEvents || []).some(event => ['connection_timeout', 'turn_timeout', 'match_finished'].includes(event.eventType))
      && reopenCurrentMatchProbe.calls.some(call => call.method === 'getCurrentMatch' && call.reopenLiveTab === true),
    JSON.stringify(reopenCurrentMatchProbe),
  );
  const lowTimerProbe = await page.evaluate(async () => {
    const session = window.PVPScene?.getLiveSession?.();
    const originalGetState = session?.getState?.bind(session);
    const baseState = originalGetState?.() || {};
    const currentVersion = Number(baseState?.stateView?.stateVersion || 3);
    window.__livePvpAuditTurnTimerMode = 'low';
    const lowStateView = window.__makeLivePvpAuditStateView?.(currentVersion + 1, 'A', 'active') || null;
    window.__livePvpAuditTurnTimerMode = '';
    if (session && originalGetState && lowStateView) {
      session.getState = () => ({
        ...baseState,
        phase: 'active',
        matchId: baseState.matchId || lowStateView.matchId || 'pvplm-browser-live',
        seatId: baseState.seatId || 'A',
        stateView: lowStateView,
      });
    }
    window.PVPScene?.renderLivePanel?.();
    const timer = document.querySelector('[data-live-turn-timer]');
    const endTurn = document.querySelector('[data-live-action="end-turn"]');
    const probe = {
      text: timer?.textContent || '',
      urgency: timer?.getAttribute('data-live-turn-timer-urgency') || '',
      endTurnDisabled: !!endTurn?.disabled,
      payload: JSON.parse(window.render_game_to_text()).pvp?.live?.turnTimer || null,
    };
    if (session && originalGetState) {
      session.getState = originalGetState;
    }
    window.PVPScene?.renderLivePanel?.();
    return probe;
  });
  add(
    'live UI warns the acting player during the final 10 seconds without hiding action controls',
    /最后 10 秒，请确认行动/.test(lowTimerProbe.text)
      && lowTimerProbe.urgency === 'low'
      && lowTimerProbe.endTurnDisabled === false
      && lowTimerProbe.payload?.phase === 'active'
      && lowTimerProbe.payload?.remainingMs <= 10000,
    JSON.stringify(lowTimerProbe),
  );

  const openingEndTurnConfirmProbe = await page.evaluate(async () => {
    const callStart = window.__livePvpAuditCalls.length;
    await window.PVPScene?.endLiveTurn?.();
    const snapshot = window.PVPScene?.getLiveSnapshot?.() || {};
    return {
      phase: snapshot.phase || '',
      currentSeat: snapshot.currentSeat || '',
      stateVersion: snapshot.stateVersion || 0,
      hint: document.querySelector('[data-live-last-error]')?.textContent || '',
      endTurnText: document.querySelector('[data-live-action="end-turn"]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      calls: window.__livePvpAuditCalls.slice(callStart),
    };
  });
  add(
    'live UI requires a second click before opening-window end turn submits',
    openingEndTurnConfirmProbe.phase === 'active'
      && openingEndTurnConfirmProbe.currentSeat === 'A'
      && /再次点击确认结束回合/.test(openingEndTurnConfirmProbe.hint)
      && /交给\s*B/.test(openingEndTurnConfirmProbe.hint)
      && /首动预算\s*18/.test(openingEndTurnConfirmProbe.hint)
      && /后手护盾\s*B\s*\+3/.test(openingEndTurnConfirmProbe.hint)
      && /反打缓冲\s*\+8/.test(openingEndTurnConfirmProbe.hint)
      && /确认结束/.test(openingEndTurnConfirmProbe.endTurnText)
      && !/end_turn/.test(JSON.stringify(openingEndTurnConfirmProbe.calls)),
    JSON.stringify(openingEndTurnConfirmProbe),
  );
  await page.evaluate(() => {
    window.PVPScene?.clearLiveOpeningActionConfirm?.();
    window.PVPScene.liveInlineHint = '';
    window.PVPScene?.renderLivePanel?.();
    window.__livePvpAuditOpeningCardCallStart = window.__livePvpAuditCalls.length;
  });
  const liveCardClicked = await page.evaluate(() => {
    const card = document.querySelector('[data-live-card]');
    if (!card) return false;
    card.click();
    return true;
  });
  if (!liveCardClicked) throw new Error('expected a playable live card button');
  await page.waitForTimeout(200);
  const openingCardConfirmProbe = await page.evaluate(() => ({
    phase: window.PVPScene?.getLiveSnapshot?.()?.phase || '',
    currentSeat: window.PVPScene?.getLiveSnapshot?.()?.currentSeat || '',
    stateVersion: window.PVPScene?.getLiveSnapshot?.()?.stateVersion || 0,
    hint: document.querySelector('[data-live-last-error]')?.textContent || '',
    cardClass: document.querySelector('[data-live-card]')?.className || '',
    cardText: document.querySelector('[data-live-card]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    calls: window.__livePvpAuditCalls.slice(window.__livePvpAuditOpeningCardCallStart || 0),
  }));
  add(
    'live UI requires a second click before opening-window card intent submits',
    openingCardConfirmProbe.phase === 'active'
      && openingCardConfirmProbe.currentSeat === 'A'
      && /再次点击确认出牌/.test(openingCardConfirmProbe.hint)
      && /首动预算\s*18/.test(openingCardConfirmProbe.hint)
      && /保底\s*1\s*血/.test(openingCardConfirmProbe.hint)
      && /后手护盾\s*B\s*\+3/.test(openingCardConfirmProbe.hint)
      && /反打缓冲\s*\+8/.test(openingCardConfirmProbe.hint)
      && /预算后\s*8/.test(openingCardConfirmProbe.hint)
      && /破盾\s*3/.test(openingCardConfirmProbe.hint)
      && /生命伤害\s*5/.test(openingCardConfirmProbe.hint)
      && /B\s*预计\s*45\s*血/.test(openingCardConfirmProbe.hint)
      && /confirming/.test(openingCardConfirmProbe.cardClass)
      && /确认/.test(openingCardConfirmProbe.cardText)
      && !/play_card/.test(JSON.stringify(openingCardConfirmProbe.calls)),
    JSON.stringify(openingCardConfirmProbe),
  );
  await page.evaluate(() => {
    const card = document.querySelector('[data-live-card]');
    if (!card) throw new Error('expected a playable live card button for confirmation click');
    card.click();
  });
  await page.waitForTimeout(200);
  const actionProbe = await page.evaluate(() => ({
    stateVersion: document.querySelector('[data-live-state-version]')?.textContent || '',
    currentSeat: document.querySelector('[data-live-current-seat]')?.textContent || '',
    turnTimer: document.querySelector('[data-live-turn-timer]')?.textContent || '',
    openingSafeguard: document.querySelector('[data-live-opening-safeguard]')?.textContent || '',
    actionReceipt: document.querySelector('[data-live-action-receipt]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    actionReceiptSource: document.querySelector('[data-live-action-receipt]')?.getAttribute('data-live-action-receipt-source') || '',
    actionReceiptHidden: document.querySelector('[data-live-action-receipt]')?.getAttribute('data-live-action-receipt-hidden') || '',
    actionReceiptSeq: document.querySelector('[data-live-action-receipt]')?.getAttribute('data-live-action-receipt-seq') || '',
    actionReceiptType: document.querySelector('[data-live-action-receipt]')?.getAttribute('data-live-action-receipt-type') || '',
    actionReceiptActing: document.querySelector('[data-live-action-receipt]')?.getAttribute('data-live-action-receipt-acting') || '',
    actionReceiptNextSeat: document.querySelector('[data-live-action-receipt]')?.getAttribute('data-live-action-receipt-next-seat') || '',
    handoffReceipt: window.PVPScene.renderLiveActionReceiptReport({
      actionReceiptReport: {
        reportVersion: 'pvp-live-action-receipt-v1',
        sourceVisibility: 'authoritative_public_projection',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        viewerSeat: 'B',
        actingSeat: 'A',
        actionType: 'end_turn',
        latestSequence: 9,
        nextSeat: 'B',
        draw: { seatId: 'B', count: 3, capped: false },
        counterplay: { granted: true, seatId: 'B', block: 8, totalBlock: 8, minimumHp: 1 },
        summaryLine: 'A 结束回合：行动权交给 B，B 抽 3 张；反打缓冲 +8 给 B。'
      }
    }),
    duelMomentum: document.querySelector('[data-live-duel-momentum]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    duelMomentumState: document.querySelector('[data-live-duel-momentum]')?.getAttribute('data-live-duel-momentum-state') || '',
    events: document.querySelector('[data-live-event-log]')?.textContent || '',
    payload: JSON.parse(window.render_game_to_text()).pvp?.live || null,
    calls: window.__livePvpAuditCalls,
  }));
  add(
    'live UI submits opening-window card intent through live service only after confirmation',
    /4/.test(actionProbe.stateVersion)
      && /B/.test(actionProbe.currentSeat)
      && /B/.test(actionProbe.turnTimer)
      && /play_card/.test(JSON.stringify(actionProbe.calls))
      && !/didWin|matchTicket/.test(JSON.stringify(actionProbe.calls)),
    JSON.stringify(actionProbe),
  );
  add(
    'live UI renders opening protection public event details',
    /开局护体触发/.test(actionProbe.events)
      && /护住 B/.test(actionProbe.events)
      && /保底 1 血/.test(actionProbe.events)
      && /挡下 6 点致命伤害/.test(actionProbe.events)
      && !/opening_protection_triggered/.test(actionProbe.events),
    JSON.stringify(actionProbe),
  );
  add(
    'live UI renders opening counterplay cue after protection',
    /后手护盾发放/.test(actionProbe.events)
      && /护盾 \+3/.test(actionProbe.events)
      && /反打缓冲发放/.test(actionProbe.events)
      && /给 B/.test(actionProbe.events)
      && /护盾 \+8/.test(actionProbe.events)
      && /后手护盾/.test(actionProbe.openingSafeguard)
      && /B \+3/.test(actionProbe.openingSafeguard)
      && /反打缓冲/.test(actionProbe.openingSafeguard)
      && /已发放 B/.test(actionProbe.openingSafeguard)
      && actionProbe.payload?.openingSafeguardReport?.secondSeatBuffer?.seatId === 'B'
      && actionProbe.payload?.openingSafeguardReport?.secondSeatBuffer?.block === 3
      && actionProbe.payload?.openingSafeguardReport?.counterplay?.grantedSeats?.includes('B')
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(`${actionProbe.events} ${actionProbe.openingSafeguard} ${JSON.stringify(actionProbe.payload?.openingSafeguardReport || {})}`),
    JSON.stringify(actionProbe),
  );
  add(
    'live UI renders authoritative action receipt after opening card resolves',
    /行动回执/.test(actionProbe.actionReceipt)
      && /A/.test(actionProbe.actionReceipt)
      && /试探斩/.test(actionProbe.actionReceipt)
      && /预算后\s*8/.test(actionProbe.actionReceipt)
      && /破盾\s*3/.test(actionProbe.actionReceipt)
      && /生命伤害\s*5/.test(actionProbe.actionReceipt)
      && /B\s*剩余\s*45\s*血/.test(actionProbe.actionReceipt)
      && actionProbe.actionReceiptSource === 'authoritative_public_projection'
      && actionProbe.actionReceiptHidden === 'false'
      && actionProbe.actionReceiptSeq === '6'
      && actionProbe.actionReceiptType === 'play_card'
      && actionProbe.actionReceiptActing === 'A'
      && actionProbe.actionReceiptNextSeat === ''
      && actionProbe.payload?.actionReceiptReport?.reportVersion === 'pvp-live-action-receipt-v1'
      && actionProbe.payload?.actionReceiptReport?.sourceVisibility === 'authoritative_public_projection'
      && actionProbe.payload?.actionReceiptReport?.usesHiddenInformation === false
      && actionProbe.payload?.actionReceiptReport?.rankedImpact === 'none'
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(`${actionProbe.actionReceipt} ${JSON.stringify(actionProbe.payload?.actionReceiptReport || {})}`),
    JSON.stringify(actionProbe),
  );
  const mitigationFormatProbe = await page.evaluate(() => {
    const event = window.PVPScene.formatLiveEvent({
      eventType: 'status_mitigated',
      actingSeat: 'B',
      publicData: {
        statusId: 'vulnerable_mark',
        label: '破绽',
        seatId: 'B',
        sourceSeat: 'A',
        mitigatedBySeat: 'B',
        mitigatedTurnIndex: 12,
        responseWindow: 'defender_turn_before_payoff',
        mitigation: 'guard_response',
      },
    });
    const receipt = window.PVPScene.renderLiveActionReceiptReport({
      actionReceiptReport: {
        reportVersion: 'pvp-live-action-receipt-v1',
        sourceVisibility: 'authoritative_public_projection',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        viewerSeat: 'B',
        actingSeat: 'B',
        actionType: 'play_card',
        latestSequence: 44,
        cardName: '护体诀',
        statusEffects: {
          mitigated: [{
            statusId: 'vulnerable_mark',
            label: '破绽',
            seatId: 'B',
            sourceSeat: 'A',
            mitigatedBySeat: 'B',
            mitigatedTurnIndex: 12,
            responseWindow: 'defender_turn_before_payoff',
            mitigation: 'guard_response',
          }],
        },
        summaryLine: 'B 打出护体诀：不造成伤害；自身护盾 +7；稳住破绽，阻止后续兑现。',
        safeguards: ['public_events', 'self_block', 'public_status_mitigated'],
      },
    });
    return {
      event,
      receipt,
    };
  });
  add(
    'live UI formats public status mitigation event and receipt',
    /status_mitigated/.test('status_mitigated')
      && /公开状态缓解/.test(mitigationFormatProbe.event?.label || '')
      && /稳住破绽|阻止后续兑现/.test(mitigationFormatProbe.event?.detail || '')
      && /data-live-public-status-mitigation="public_status_mitigated"/.test(mitigationFormatProbe.receipt || '')
      && /稳住破绽|阻止后续兑现/.test(mitigationFormatProbe.receipt || '')
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo|sourceCardId/i.test(`${mitigationFormatProbe.event?.detail || ''} ${mitigationFormatProbe.receipt || ''}`),
    JSON.stringify(mitigationFormatProbe),
  );
  const guardStanceFormatProbe = await page.evaluate(() => {
    const appliedEvent = window.PVPScene.formatLiveEvent({
      eventType: 'status_applied',
      actingSeat: 'A',
      publicData: {
        statusId: 'guard_stance',
        label: '守势',
        seatId: 'A',
        sourceSeat: 'A',
        stacks: 1,
        mitigationAmount: 2,
        responseWindow: 'next_incoming_attack',
      },
    });
    const mitigatedEvent = window.PVPScene.formatLiveEvent({
      eventType: 'status_mitigated',
      actingSeat: 'B',
      publicData: {
        statusId: 'guard_stance',
        label: '守势',
        seatId: 'A',
        sourceSeat: 'A',
        mitigatedBySeat: 'A',
        preventedDamage: 2,
        mitigation: 'guard_stance_damage_reduction',
      },
    });
    const receipt = window.PVPScene.renderLiveActionReceiptReport({
      actionReceiptReport: {
        reportVersion: 'pvp-live-action-receipt-v1',
        sourceVisibility: 'authoritative_public_projection',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        viewerSeat: 'A',
        actingSeat: 'B',
        actionType: 'play_card',
        latestSequence: 50,
        cardName: '破阵爆发',
        statusEffects: {
          mitigated: [{
            statusId: 'guard_stance',
            label: '守势',
            seatId: 'A',
            sourceSeat: 'A',
            mitigatedBySeat: 'A',
            preventedDamage: 2,
            mitigation: 'guard_stance_damage_reduction',
          }],
        },
        summaryLine: 'B 打出破阵爆发：预算后 19，破盾 7，生命伤害 10，A 剩余 40 血；守势减伤 2。',
        safeguards: ['public_events', 'public_guard_stance_mitigated'],
      },
    });
    return {
      appliedEvent,
      mitigatedEvent,
      receipt,
    };
  });
  add(
    'live UI formats public guard stance event and receipt',
    /guard_stance/.test('guard_stance')
      && /公开守势|公开状态施加/.test(guardStanceFormatProbe.appliedEvent?.label || '')
      && /生命伤害 -2|守势/.test(guardStanceFormatProbe.appliedEvent?.detail || '')
      && /守势减伤 2/.test(guardStanceFormatProbe.mitigatedEvent?.detail || '')
      && /data-live-guard-stance="public_guard_stance"/.test(guardStanceFormatProbe.receipt || '')
      && /守势减伤 2/.test(guardStanceFormatProbe.receipt || '')
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo|sourceCardId/i.test(`${guardStanceFormatProbe.appliedEvent?.detail || ''} ${guardStanceFormatProbe.mitigatedEvent?.detail || ''} ${guardStanceFormatProbe.receipt || ''}`),
    JSON.stringify(guardStanceFormatProbe),
  );
  const weakFocusFormatProbe = await page.evaluate(() => {
    const appliedEvent = window.PVPScene.formatLiveEvent({
      eventType: 'status_applied',
      actingSeat: 'A',
      publicData: {
        statusId: 'weak_focus',
        label: '虚弱',
        seatId: 'B',
        sourceSeat: 'A',
        stacks: 1,
        mitigationAmount: 2,
        responseWindow: 'next_outgoing_attack',
      },
    });
    const mitigatedEvent = window.PVPScene.formatLiveEvent({
      eventType: 'status_mitigated',
      actingSeat: 'B',
      publicData: {
        statusId: 'weak_focus',
        label: '虚弱',
        seatId: 'B',
        sourceSeat: 'A',
        mitigatedBySeat: 'A',
        preventedDamage: 2,
        mitigation: 'public_weak_damage_reduction',
      },
    });
    const receipt = window.PVPScene.renderLiveActionReceiptReport({
      actionReceiptReport: {
        reportVersion: 'pvp-live-action-receipt-v1',
        sourceVisibility: 'authoritative_public_projection',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        viewerSeat: 'A',
        actingSeat: 'B',
        actionType: 'play_card',
        latestSequence: 54,
        cardName: '破阵爆发',
        statusEffects: {
          mitigated: [{
            statusId: 'weak_focus',
            label: '虚弱',
            seatId: 'B',
            sourceSeat: 'A',
            mitigatedBySeat: 'A',
            preventedDamage: 2,
            mitigation: 'public_weak_damage_reduction',
          }],
        },
        summaryLine: 'B 打出破阵爆发：预算后 19，破盾 8，生命伤害 7，A 剩余 43 血；虚弱削减 2。',
        safeguards: ['public_events', 'public_weak_focus_mitigated'],
      },
    });
    return {
      appliedEvent,
      mitigatedEvent,
      receipt,
    };
  });
  add(
    'live UI formats public weak focus event and receipt',
    /weak_focus/.test('weak_focus')
      && /公开状态施加/.test(weakFocusFormatProbe.appliedEvent?.label || '')
      && /下次出手伤害 -2|虚弱/.test(weakFocusFormatProbe.appliedEvent?.detail || '')
      && /虚弱削减 2|伤害降低 2/.test(weakFocusFormatProbe.mitigatedEvent?.detail || '')
      && /data-live-weak-focus="public_weak_focus"/.test(weakFocusFormatProbe.receipt || '')
      && /虚弱削减 2/.test(weakFocusFormatProbe.receipt || '')
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo|sourceCardId/i.test(`${weakFocusFormatProbe.appliedEvent?.detail || ''} ${weakFocusFormatProbe.mitigatedEvent?.detail || ''} ${weakFocusFormatProbe.receipt || ''}`),
    JSON.stringify(weakFocusFormatProbe),
  );
  const healFormatProbe = await page.evaluate(() => {
    const event = window.PVPScene.formatLiveEvent({
      eventType: 'hp_recovered',
      actingSeat: 'A',
      publicData: {
        seatId: 'A',
        recoveredHp: 3,
        hp: 41,
        maxHp: 50,
        capped: false,
        sourceCardId: 'innerPeace',
      },
    });
    const cappedEvent = window.PVPScene.formatLiveEvent({
      eventType: 'hp_recovered',
      actingSeat: 'A',
      publicData: {
        seatId: 'A',
        recoveredHp: 1,
        hp: 50,
        maxHp: 50,
        capped: true,
        sourceCardId: 'wardingHerb',
      },
    });
    const receipt = window.PVPScene.renderLiveActionReceiptReport({
      actionReceiptReport: {
        reportVersion: 'pvp-live-action-receipt-v1',
        sourceVisibility: 'authoritative_public_projection',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        viewerSeat: 'A',
        actingSeat: 'A',
        actionType: 'play_card',
        latestSequence: 51,
        cardName: '内心平和',
        healing: {
          seatId: 'A',
          recoveredHp: 3,
          hp: 41,
          maxHp: 50,
          capped: false,
          sourceCardId: 'innerPeace',
        },
        summaryLine: 'A 打出内心平和：不造成伤害；自身护盾 +4；自身恢复 +3，当前 41/50。',
        safeguards: ['public_events', 'self_block', 'public_heal'],
      },
    });
    return {
      event,
      cappedEvent,
      receipt,
    };
  });
  add(
    'live UI formats public heal event and receipt',
    /hp_recovered/.test('hp_recovered')
      && /公开恢复/.test(healFormatProbe.event?.label || '')
      && /恢复 3/.test(healFormatProbe.event?.detail || '')
      && /当前 41\/50/.test(healFormatProbe.event?.detail || '')
      && /已到上限|当前 50\/50/.test(healFormatProbe.cappedEvent?.detail || '')
      && /data-live-hp-recovered="public_hp_recovered"/.test(healFormatProbe.receipt || '')
      && /恢复 \+3|回血 \+3/.test(healFormatProbe.receipt || '')
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo|sourceCardId/i.test(`${healFormatProbe.event?.detail || ''} ${healFormatProbe.cappedEvent?.detail || ''} ${healFormatProbe.receipt || ''}`),
    JSON.stringify(healFormatProbe),
  );
  const cardCycleFormatProbe = await page.evaluate(() => {
    const event = window.PVPScene.formatLiveEvent({
      eventType: 'card_cycled',
      actingSeat: 'A',
      publicData: {
        seatId: 'A',
        count: 1,
        handCount: 4,
        deckCount: 9,
        capped: false,
        sourceCardId: 'surgeStep',
        effect: 'draw_tag',
      },
    });
    const cappedEvent = window.PVPScene.formatLiveEvent({
      eventType: 'card_cycled',
      actingSeat: 'A',
      publicData: {
        seatId: 'A',
        count: 0,
        handCount: 10,
        deckCount: 6,
        capped: true,
        sourceCardId: 'surgeStep',
        effect: 'draw_tag',
      },
    });
    const receipt = window.PVPScene.renderLiveActionReceiptReport({
      actionReceiptReport: {
        reportVersion: 'pvp-live-action-receipt-v1',
        sourceVisibility: 'authoritative_public_projection',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        viewerSeat: 'A',
        actingSeat: 'A',
        actionType: 'play_card',
        latestSequence: 48,
        cardName: '疾电步',
        cardDraw: {
          seatId: 'A',
          count: 1,
          handCount: 4,
          deckCount: 9,
          capped: false,
          sourceCardId: 'surgeStep',
          effect: 'draw_tag',
        },
        summaryLine: 'A 打出疾电步：不造成伤害；自身护盾 +6；抽滤 1 张，当前手牌 4。',
        safeguards: ['public_events', 'self_block', 'public_card_cycle'],
      },
    });
    return {
      event,
      cappedEvent,
      receipt,
    };
  });
  add(
    'live UI formats public card cycle event and receipt',
    /公开抽滤/.test(cardCycleFormatProbe.event?.label || '')
      && /抽滤 1 张/.test(cardCycleFormatProbe.event?.detail || '')
      && /当前手牌 4/.test(cardCycleFormatProbe.event?.detail || '')
      && /牌库 9/.test(cardCycleFormatProbe.event?.detail || '')
      && /手牌已满，抽滤暂停/.test(cardCycleFormatProbe.cappedEvent?.detail || '')
      && /data-live-card-cycle="public_card_cycle"/.test(cardCycleFormatProbe.receipt || '')
      && /抽滤 1 张/.test(cardCycleFormatProbe.receipt || '')
      && !/sourceCardId|cardId|instanceId|draw_tag|loadoutSnapshot|reward|rating|elo|hand":\[|deck":\[/i.test(`${cardCycleFormatProbe.event?.detail || ''} ${cardCycleFormatProbe.cappedEvent?.detail || ''} ${cardCycleFormatProbe.receipt || ''}`),
    JSON.stringify(cardCycleFormatProbe),
  );
  add(
    'live UI renders handoff receipt label for end-turn action receipt',
    /交权回执/.test(actionProbe.handoffReceipt)
      && /行动权交给 B/.test(actionProbe.handoffReceipt)
      && /抽 3 张/.test(actionProbe.handoffReceipt)
      && /反打缓冲 \+8/.test(actionProbe.handoffReceipt)
      && !/cardInstanceId|sourceCardId|deck|rating|reward/i.test(actionProbe.handoffReceipt),
    JSON.stringify(actionProbe),
  );
  add(
    'live UI keeps duel momentum counterplay window readable after protection',
    /局势/.test(actionProbe.duelMomentum)
      && /反打窗口/.test(actionProbe.duelMomentum)
      && /公开缓冲|首个行动/.test(actionProbe.duelMomentum)
      && actionProbe.duelMomentumState === 'reversal_window'
      && actionProbe.payload?.duelMomentumReport?.pressureState === 'reversal_window'
      && actionProbe.payload?.duelMomentumReport?.safeguards?.includes('counterplay_granted')
      && actionProbe.payload?.duelMomentumReport?.usesHiddenInformation === false
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(`${actionProbe.duelMomentum} ${JSON.stringify(actionProbe.payload?.duelMomentumReport || {})}`),
    JSON.stringify(actionProbe),
  );

  await page.click('[data-live-emote="respect"]', { timeout: 5000, force: true });
  await page.waitForTimeout(200);
  const ownEmoteProbe = await page.evaluate(() => ({
    panel: document.querySelector('[data-live-social-panel]')?.textContent || '',
    events: document.querySelector('[data-live-event-log]')?.textContent || '',
    status: document.querySelector('[data-live-social-status]')?.textContent || '',
    payload: window.PVPScene.getLiveSnapshot()?.social || null,
    calls: window.__livePvpAuditCalls,
  }));
  await page.click('[data-live-action="refresh-match"]', { timeout: 5000, force: true });
  await page.waitForTimeout(200);
  const opponentEmoteProbe = await page.evaluate(() => ({
    panel: document.querySelector('[data-live-social-panel]')?.textContent || '',
    events: document.querySelector('[data-live-event-log]')?.textContent || '',
    status: document.querySelector('[data-live-social-status]')?.textContent || '',
    payload: window.PVPScene.getLiveSnapshot()?.social || null,
  }));
  await page.click('[data-live-action="toggle-social-mute"]', { timeout: 5000, force: true });
  await page.waitForTimeout(200);
  const mutedEmoteProbe = await page.evaluate(() => ({
    panel: document.querySelector('[data-live-social-panel]')?.textContent || '',
    events: document.querySelector('[data-live-event-log]')?.textContent || '',
    status: document.querySelector('[data-live-social-status]')?.textContent || '',
    hint: document.querySelector('[data-live-last-error]')?.textContent || '',
    payload: window.PVPScene.getLiveSnapshot()?.social || null,
    storage: window.localStorage.getItem('the-defier:pvp-live-social-preferences:v1') || '',
  }));
  const mutedPersistProbe = await page.evaluate(() => {
    const storageKey = 'the-defier:pvp-live-social-preferences:v1';
    const scene = window.PVPScene;
    const storage = window.localStorage.getItem(storageKey) || '';
    scene.liveSocialMuted = false;
    scene.liveSocialPreferencesLoaded = false;
    scene.loadLiveSocialPreferences();
    scene.renderLivePanel();
    return {
      status: document.querySelector('[data-live-social-status]')?.textContent || '',
      events: document.querySelector('[data-live-event-log]')?.textContent || '',
      payload: scene.getLiveSnapshot()?.social || null,
      storage,
      liveSocialMuted: scene.liveSocialMuted,
    };
  });
  add(
    'live UI sends preset emote and can locally mute opponent emotes',
    /emote/.test(JSON.stringify(ownEmoteProbe.calls))
      && /预设表情/.test(ownEmoteProbe.events)
      && /抱拳/.test(ownEmoteProbe.events)
      && /B · 思考/.test(opponentEmoteProbe.events)
      && /已静音/.test(mutedEmoteProbe.status)
      && /本地偏好/.test(mutedEmoteProbe.status)
      && mutedEmoteProbe.payload?.muted === true
      && mutedEmoteProbe.payload?.preferenceScope === 'local_only'
      && mutedEmoteProbe.payload?.sourceVisibility === 'local_preference'
      && mutedEmoteProbe.payload?.rankedImpact === 'none'
      && !/B · 思考/.test(mutedEmoteProbe.events)
      && !/自由文本/.test(JSON.stringify(ownEmoteProbe.calls)),
    JSON.stringify({ ownEmoteProbe, opponentEmoteProbe, mutedEmoteProbe }),
  );
  add(
    'live UI persists local social mute preference without affecting ranked state',
    /"socialMuted":true/.test(mutedPersistProbe.storage)
      && mutedPersistProbe.liveSocialMuted === true
      && /已静音/.test(mutedPersistProbe.status)
      && /本地偏好/.test(mutedPersistProbe.status)
      && mutedPersistProbe.payload?.muted === true
      && mutedPersistProbe.payload?.preferenceScope === 'local_only'
      && mutedPersistProbe.payload?.sourceVisibility === 'local_preference'
      && mutedPersistProbe.payload?.rankedImpact === 'none'
      && mutedPersistProbe.payload?.persistence === 'local_storage'
      && !/B · 思考/.test(mutedPersistProbe.events)
      && !/reward|rating|elo|settlement|matchTicket/i.test(JSON.stringify(mutedPersistProbe)),
    JSON.stringify({ mutedPersistProbe }),
  );

  const realtimeIntentRefreshProbe = await page.evaluate(async () => {
    const scene = window.PVPScene;
    const original = {
      getLiveSession: scene.getLiveSession,
      startLiveRealtime: scene.startLiveRealtime,
      renderLivePanel: scene.renderLivePanel,
      liveIntentInFlight: scene.liveIntentInFlight,
      liveInlineHint: scene.liveInlineHint,
    };
    let intentState = {
      phase: 'active',
      matchId: 'pvplm-browser-live-intent-lock',
      seatId: 'A',
      realtimeStatus: 'connected',
      stateView: {
        matchId: 'pvplm-browser-live-intent-lock',
        status: 'active',
        stateVersion: 14,
        currentSeat: 'A',
      },
      lastRealtimeIntentResult: null,
    };
    const calls = [];
    let refreshMatchCalls = 0;
    try {
      scene.liveIntentInFlight = null;
      scene.liveInlineHint = '';
      scene.startLiveRealtime = () => {};
      scene.renderLivePanel = () => {};
      scene.getLiveSession = () => ({
        getState: () => intentState,
        submitRealtimeIntent: (intent, matchId) => {
          calls.push({ method: 'submitRealtimeIntent', intent, matchId });
          return true;
        },
        submitIntent: async () => {
          throw new Error('HTTP fallback should not run for browser realtime intent lock probe');
        },
        refreshMatch: async () => {
          refreshMatchCalls += 1;
          return intentState;
        },
      });
      await scene.submitLiveEmote('respect');
      await scene.submitLiveEmote('respect');
      const beforeRefresh = {
        calls: calls.slice(),
        hint: scene.liveInlineHint,
        lock: scene.liveIntentInFlight ? JSON.parse(JSON.stringify(scene.liveIntentInFlight)) : null,
      };
      await scene.refreshLiveMatch();
      await scene.submitLiveEmote('thinking');
      return {
        beforeRefresh,
        afterRefreshCalls: calls.slice(),
        refreshMatchCalls,
      };
    } finally {
      scene.getLiveSession = original.getLiveSession;
      scene.startLiveRealtime = original.startLiveRealtime;
      scene.renderLivePanel = original.renderLivePanel;
      scene.liveIntentInFlight = original.liveIntentInFlight;
      scene.liveInlineHint = original.liveInlineHint;
      scene.renderLivePanel();
    }
  });
  add(
    'live UI realtime intent lock keeps double-click pending and manual refresh unlocks lost ack',
    realtimeIntentRefreshProbe.beforeRefresh?.calls?.length === 1
      && /上一动作正在等待权威回执/.test(realtimeIntentRefreshProbe.beforeRefresh?.hint || '')
      && realtimeIntentRefreshProbe.refreshMatchCalls === 1
      && realtimeIntentRefreshProbe.afterRefreshCalls?.length === 2
      && realtimeIntentRefreshProbe.afterRefreshCalls?.[1]?.intent?.intentType === 'emote',
    JSON.stringify(realtimeIntentRefreshProbe),
  );

  await page.click('[data-live-action="surrender"]', { timeout: 5000, force: true });
  await page.waitForTimeout(100);
  const surrenderConfirmProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    hint: document.querySelector('[data-live-last-error]')?.textContent || '',
    buttonText: document.querySelector('[data-live-action="surrender"]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    calls: window.__livePvpAuditCalls,
  }));
  add(
    'live UI requires a second click before surrender submits terminal intent',
    surrenderConfirmProbe.phase === 'active'
      && /再次点击确认认输/.test(surrenderConfirmProbe.hint)
      && /确认认输/.test(surrenderConfirmProbe.buttonText)
      && !/surrender/.test(JSON.stringify(surrenderConfirmProbe.calls)),
    JSON.stringify(surrenderConfirmProbe),
  );
  await page.click('[data-live-action="surrender"]', { timeout: 5000, force: true });
  await page.waitForTimeout(200);
  const surrenderProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    events: document.querySelector('[data-live-event-log]')?.textContent || '',
    reviewText: document.querySelector('[data-live-post-match-review]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    keyTurnText: document.querySelector('[data-live-key-turn-replay]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    keyTurnSource: document.querySelector('[data-live-key-turn-replay]')?.getAttribute('data-live-key-turn-source') || '',
    keyTurnHidden: document.querySelector('[data-live-key-turn-replay]')?.getAttribute('data-live-key-turn-hidden') || '',
    keyTurnCount: document.querySelectorAll('[data-live-key-turn]').length,
    experienceText: document.querySelector('[data-live-experience-report]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    experienceSource: document.querySelector('[data-live-experience-report]')?.getAttribute('data-live-experience-source') || '',
    experienceHidden: document.querySelector('[data-live-experience-report]')?.getAttribute('data-live-experience-hidden') || '',
    experienceCheckIds: Array.from(document.querySelectorAll('[data-live-experience-check]')).map(item => item.getAttribute('data-live-experience-check')),
    fairnessText: document.querySelector('[data-live-fairness-receipt]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    fairnessSource: document.querySelector('[data-live-fairness-receipt]')?.getAttribute('data-live-fairness-source') || '',
    fairnessHidden: document.querySelector('[data-live-fairness-receipt]')?.getAttribute('data-live-fairness-hidden') || '',
    fairnessState: document.querySelector('[data-live-fairness-receipt]')?.getAttribute('data-live-fairness-state') || '',
    seasonGoalText: document.querySelector('[data-live-season-goal]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    seasonGoalMode: document.querySelector('[data-live-season-goal]')?.getAttribute('data-live-season-goal-mode') || '',
    seasonGoalDismissState: document.querySelector('[data-live-season-goal]')?.getAttribute('data-live-season-goal-dismiss-state') || '',
    seasonGoalSource: document.querySelector('[data-live-season-goal]')?.getAttribute('data-live-season-goal-source') || '',
    seasonGoalHidden: document.querySelector('[data-live-season-goal]')?.getAttribute('data-live-season-goal-hidden') || '',
    seasonGoalActionIds: Array.from(document.querySelectorAll('[data-live-season-goal-action]')).map(button => button.getAttribute('data-live-season-goal-action')),
    seasonGoalDismissText: document.querySelector('[data-live-season-goal-dismiss]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    loadoutRecommendationText: document.querySelector('[data-live-loadout-recommendation]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    loadoutRecommendationSource: document.querySelector('[data-live-loadout-recommendation]')?.getAttribute('data-live-loadout-recommendation-source') || '',
    loadoutRecommendationHidden: document.querySelector('[data-live-loadout-recommendation]')?.getAttribute('data-live-loadout-recommendation-hidden') || '',
    loadoutRecommendationPreset: document.querySelector('[data-live-loadout-recommendation]')?.getAttribute('data-live-loadout-recommendation-preset') || '',
    loadoutRecommendationAction: document.querySelector('[data-live-loadout-recommendation-action]')?.getAttribute('data-live-loadout-recommendation-action') || '',
    reviewActionIds: Array.from(document.querySelectorAll('[data-live-post-review-action]')).map(button => button.getAttribute('data-live-post-review-action')),
    reviewActionAuditIds: Array.from(document.querySelectorAll('[data-live-post-review-action]')).map(button => `${button.getAttribute('data-live-post-review-action')}:${button.getAttribute('data-live-post-review-audit-action')}`),
    reviewPayload: window.PVPScene.getLiveSnapshot()?.postMatchReview || null,
    seasonGoalPayload: window.PVPScene.getLiveSnapshot()?.seasonGoal || null,
    textPayload: JSON.parse(window.render_game_to_text()).pvp?.live?.postMatchReview || null,
    calls: window.__livePvpAuditCalls,
  }));
  const reviewParity = surrenderProbe.reviewPayload && surrenderProbe.textPayload ? {
    result: surrenderProbe.reviewPayload.result === surrenderProbe.textPayload.result,
    finishReason: surrenderProbe.reviewPayload.finishReason === surrenderProbe.textPayload.finishReason,
    evidence: JSON.stringify((surrenderProbe.reviewPayload.evidence || []).map(event => event.eventType)) === JSON.stringify((surrenderProbe.textPayload.evidence || []).map(event => event.eventType)),
    nextActions: JSON.stringify((surrenderProbe.reviewPayload.nextActions || []).map(action => action.id)) === JSON.stringify((surrenderProbe.textPayload.nextActions || []).map(action => action.id)),
    keyTurns: JSON.stringify((surrenderProbe.reviewPayload.keyTurnReplay?.turns || []).map(event => event.eventType)) === JSON.stringify((surrenderProbe.textPayload.keyTurnReplay?.turns || []).map(event => event.eventType)),
    experienceChecks: JSON.stringify((surrenderProbe.reviewPayload.experienceReport?.fairnessChecks || []).map(item => item.id)) === JSON.stringify((surrenderProbe.textPayload.experienceReport?.fairnessChecks || []).map(item => item.id)),
    fairnessReceipt: JSON.stringify((surrenderProbe.reviewPayload.fairnessReceipt?.evidenceSummary || []).map(item => item.id)) === JSON.stringify((surrenderProbe.textPayload.fairnessReceipt?.evidenceSummary || []).map(item => item.id)),
  } : null;
  add(
    'live UI surrenders through live intent and reaches finished phase',
    surrenderProbe.phase === 'finished'
      && /认输/.test(surrenderProbe.events)
      && /surrender/.test(JSON.stringify(surrenderProbe.calls)),
    JSON.stringify(surrenderProbe),
  );
  add(
    'live UI renders post-match review MVP from public finished state',
    /首败复盘|赛后复盘/.test(surrenderProbe.reviewText)
      && /认输/.test(surrenderProbe.reviewText)
      && /查看权威事件/.test(surrenderProbe.reviewText)
      && /继续真人排位/.test(surrenderProbe.reviewText)
      && /举报异常/.test(surrenderProbe.reviewText)
      && ['review_events', 'review_key_turns', 'friendly_rematch', 'adjust_loadout', 'practice', 'queue_again', 'report_issue'].every(id => surrenderProbe.reviewActionIds.includes(id))
      && ['review_key_turns:key_turn_replay', 'adjust_loadout:apply_loadout_recommendation', 'practice:practice_topic', 'queue_again:queue_again', 'report_issue:report_issue'].every(id => surrenderProbe.reviewActionAuditIds.includes(id))
      && surrenderProbe.reviewPayload?.reportVersion === 'pvp-live-post-match-review-v1'
      && surrenderProbe.reviewPayload?.result === 'loss'
      && surrenderProbe.textPayload?.reportVersion === 'pvp-live-post-match-review-v1'
      && reviewParity?.result === true
      && reviewParity?.finishReason === true
      && reviewParity?.evidence === true
      && reviewParity?.nextActions === true
      && /改谱建议/.test(surrenderProbe.loadoutRecommendationText)
      && /守势斗法谱/.test(surrenderProbe.loadoutRecommendationText)
      && /一键套用/.test(surrenderProbe.loadoutRecommendationText)
      && /不自动排队/.test(surrenderProbe.loadoutRecommendationText)
      && surrenderProbe.loadoutRecommendationSource === 'public_events_and_public_content'
      && surrenderProbe.loadoutRecommendationHidden === 'false'
      && surrenderProbe.loadoutRecommendationPreset === 'shield'
      && surrenderProbe.loadoutRecommendationAction === 'apply'
      && surrenderProbe.reviewPayload?.loadoutRecommendation?.reportVersion === 'pvp-live-loadout-recommendation-v1'
      && surrenderProbe.textPayload?.loadoutRecommendation?.recommendedPresetId === 'shield'
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(JSON.stringify(surrenderProbe.reviewPayload?.loadoutRecommendation || {}))
      && !/reward|rating|elo/i.test(`${surrenderProbe.reviewText} ${JSON.stringify(surrenderProbe.reviewPayload || {})}`),
    JSON.stringify({ ...surrenderProbe, reviewParity }),
  );
  add(
    'live UI renders post-match fairness receipt from public experience checks',
    /公平回执|无解释先手秒杀|首动预算|行动窗口|反打回执|有效行动/.test(surrenderProbe.fairnessText)
      && surrenderProbe.fairnessSource === 'public_events'
      && surrenderProbe.fairnessHidden === 'false'
      && surrenderProbe.fairnessState === 'accepted'
      && surrenderProbe.reviewPayload?.fairnessReceipt?.reportVersion === 'pvp-live-fairness-receipt-v1'
      && surrenderProbe.reviewPayload?.fairnessReceipt?.sourceVisibility === 'public_events'
      && surrenderProbe.reviewPayload?.fairnessReceipt?.usesHiddenInformation === false
      && surrenderProbe.reviewPayload?.fairnessReceipt?.rankedImpact === 'none'
      && surrenderProbe.reviewPayload?.fairnessReceipt?.receiptState === 'accepted'
      && /有效行动/.test(surrenderProbe.reviewPayload?.fairnessReceipt?.effectiveActionVerdict || '')
      && (surrenderProbe.reviewPayload?.fairnessReceipt?.evidenceSummary || []).length >= 3
      && (surrenderProbe.reviewPayload?.fairnessReceipt?.evidenceSummary || []).some(item => item.id === 'second_seat_effective_action')
      && reviewParity?.fairnessReceipt === true
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(`${surrenderProbe.fairnessText} ${JSON.stringify(surrenderProbe.reviewPayload?.fairnessReceipt || {})}`),
    JSON.stringify({ ...surrenderProbe, reviewParity }),
  );
  add(
    'live UI renders post-match key-turn replay from public events',
    /关键回合|开战窗口|压力窗口|终局选择/.test(surrenderProbe.keyTurnText)
      && surrenderProbe.keyTurnSource === 'public_events'
      && surrenderProbe.keyTurnHidden === 'false'
      && surrenderProbe.keyTurnCount >= 2
      && !visibleProtocolPattern.test(surrenderProbe.keyTurnText)
      && surrenderProbe.reviewPayload?.keyTurnReplay?.reportVersion === 'pvp-live-key-turn-replay-v1'
      && surrenderProbe.reviewPayload?.keyTurnReplay?.sourceVisibility === 'public_events'
      && surrenderProbe.reviewPayload?.keyTurnReplay?.usesHiddenInformation === false
      && surrenderProbe.reviewPayload?.keyTurnReplay?.rankedImpact === 'none'
      && (surrenderProbe.reviewPayload?.keyTurnReplay?.turns || []).some(turn => turn.eventType === 'battle_started')
      && (surrenderProbe.reviewPayload?.keyTurnReplay?.turns || []).some(turn => turn.eventType === 'match_finished' || turn.eventType === 'player_surrendered')
      && reviewParity?.keyTurns === true
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot/i.test(JSON.stringify(surrenderProbe.reviewPayload?.keyTurnReplay || {})),
    JSON.stringify({ ...surrenderProbe, reviewParity }),
  );
  add(
    'live UI renders post-match experience report from public events',
    /双方体验诊断|低风险|双方均有可读窗口|公开轨迹|后手有效行动/.test(surrenderProbe.experienceText)
      && surrenderProbe.experienceSource === 'public_events'
      && surrenderProbe.experienceHidden === 'false'
      && ['setup_ready_required', 'first_action_budget', 'opening_protection', 'decision_windows', 'second_seat_effective_action'].every(id => surrenderProbe.experienceCheckIds.includes(id))
      && surrenderProbe.reviewPayload?.experienceReport?.reportVersion === 'pvp-live-experience-report-v1'
      && surrenderProbe.reviewPayload?.experienceReport?.sourceVisibility === 'public_events'
      && surrenderProbe.reviewPayload?.experienceReport?.usesHiddenInformation === false
      && surrenderProbe.reviewPayload?.experienceReport?.rankedImpact === 'none'
      && surrenderProbe.reviewPayload?.experienceReport?.nonGameRisk === 'low'
      && surrenderProbe.reviewPayload?.experienceReport?.decisionWindowCount >= 1
      && surrenderProbe.reviewPayload?.experienceReport?.effectiveActionReport?.reportVersion === 'pvp-live-effective-action-report-v1'
      && surrenderProbe.reviewPayload?.experienceReport?.effectiveActionReport?.secondSeatState === 'confirmed'
      && surrenderProbe.reviewPayload?.experienceReport?.safeguardSummary?.effectiveAction === 'confirmed'
      && reviewParity?.experienceChecks === true
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(JSON.stringify(surrenderProbe.reviewPayload?.experienceReport || {})),
    JSON.stringify({ ...surrenderProbe, reviewParity }),
  );
  add(
    'live UI renders post-match season goal card and can dismiss it locally',
    /本赛季下一局目标/.test(surrenderProbe.seasonGoalText)
      && /问道练习/.test(surrenderProbe.seasonGoalText)
      && /不写正式积分或奖励/.test(surrenderProbe.seasonGoalText)
      && surrenderProbe.seasonGoalMode === 'practice'
      && surrenderProbe.seasonGoalDismissState === 'active'
      && surrenderProbe.seasonGoalSource === 'public_review'
      && surrenderProbe.seasonGoalHidden === 'false'
      && surrenderProbe.seasonGoalActionIds.includes('practice')
      && /本次不再提示/.test(surrenderProbe.seasonGoalDismissText)
      && surrenderProbe.seasonGoalPayload?.reportVersion === 'pvp-live-season-goal-v1'
      && surrenderProbe.seasonGoalPayload?.sourceVisibility === 'public_review'
      && surrenderProbe.seasonGoalPayload?.usesHiddenInformation === false
      && surrenderProbe.seasonGoalPayload?.rankedImpact === 'none'
      && surrenderProbe.seasonGoalPayload?.recommendedMode === 'practice'
      && surrenderProbe.seasonGoalPayload?.dismissState === 'active'
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|rating|elo/i.test(JSON.stringify(surrenderProbe.seasonGoalPayload || {})),
    JSON.stringify({ ...surrenderProbe, reviewParity }),
  );
  await page.evaluate(() => {
    document.querySelector('[data-live-season-goal-dismiss]')?.click();
  });
  await page.waitForTimeout(120);
  const seasonGoalDismissProbe = await page.evaluate(() => ({
    visibleGoalCount: document.querySelectorAll('[data-live-season-goal]').length,
    hint: document.querySelector('[data-live-last-error]')?.textContent || '',
    seasonGoalPayload: window.PVPScene.getLiveSnapshot()?.seasonGoal || null,
    postReviewStillVisible: !!document.querySelector('[data-live-post-match-review]'),
  }));
  add(
    'live UI dismisses season goal locally without hiding post-match review',
    seasonGoalDismissProbe.visibleGoalCount === 0
      && /已关闭当前复盘目标提示/.test(seasonGoalDismissProbe.hint)
      && seasonGoalDismissProbe.seasonGoalPayload?.dismissState === 'dismissed_for_trigger'
      && seasonGoalDismissProbe.seasonGoalPayload?.rankedImpact === 'none'
      && seasonGoalDismissProbe.postReviewStillVisible === true,
    JSON.stringify(seasonGoalDismissProbe),
  );

  const seasonGoalRecoveryProbe = await page.evaluate(() => {
    const scene = window.PVPScene;
    const session = scene.getLiveSession();
    const seasonId = 's1-browser-recovery';
    const makeBadReview = (matchId, reasons) => ({
      reportVersion: 'pvp-live-post-match-review-v1',
      result: 'loss',
      winnerSeat: 'B',
      loserSeat: 'A',
      finishReason: 'lethal',
      title: '短局复盘 MVP',
      summary: '本局公开行动窗口偏短，先复盘再决定是否继续排位。',
      evidence: [
        { eventType: 'battle_started', sequence: 1, actingSeat: 'A', publicData: { firstSeat: 'A' } },
        { eventType: 'match_finished', sequence: 2, actingSeat: 'A', publicData: { winnerSeat: 'B', loserSeat: 'A', finishReason: 'lethal' } },
      ],
      experienceReport: {
        reportVersion: 'pvp-live-experience-report-v1',
        sourceVisibility: 'public_events',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        nonGameRisk: 'watch',
        nonGameRiskReasons: reasons,
        agencyLabel: '败方窗口偏短',
        decisionWindowCount: 1,
        seatWindowSummary: {
          firstSeat: 'A',
          secondSeat: 'B',
          secondSeatWindowObserved: false,
          terminalBeforeSecondSeatWindow: true,
        },
        effectiveActionReport: {
          reportVersion: 'pvp-live-effective-action-report-v1',
          sourceVisibility: 'public_events',
          usesHiddenInformation: false,
          rankedImpact: 'none',
          secondSeat: 'B',
          secondSeatState: 'missing_window',
          reasons: ['missing_public_second_seat_window'],
          evidence: [],
          summary: '公开事件未证明后手获得过有效行动窗口。',
        },
        safeguardSummary: {
          setupReady: 'confirmed',
          firstActionBudget: 'not_observable',
          openingProtection: 'not_observable',
          effectiveAction: 'missing_window',
        },
        summary: '本局公开决策窗口偏短，建议先复盘关键回合再继续排位。',
        recommendedAction: 'review_key_turns',
        fairnessChecks: [
          {
            id: 'decision_windows',
            label: '公开决策窗口',
            passed: false,
            detail: '公开窗口偏短，下一局优先看是否存在过早终结。',
            linkedEvidence: [{ eventType: 'battle_started', sequence: 1, actingSeat: 'A', publicData: { firstSeat: 'A' } }],
          },
          {
            id: 'second_seat_effective_action',
            label: '后手有效行动',
            passed: false,
            detail: '公开事件未证明后手获得过有效行动窗口。',
            linkedEvidence: [{ eventType: 'match_finished', sequence: 2, actingSeat: 'A', publicData: { winnerSeat: 'B', loserSeat: 'A' } }],
          },
        ],
      },
      nextActions: [
        { id: 'review_events', label: '查看权威事件' },
        { id: 'practice', label: '问道练习' },
        { id: 'queue_again', label: '继续真人排位' },
      ],
    });
    const viewFor = (matchId, reasons) => ({
      matchId,
      status: 'finished',
      matchQuality: { seasonId },
      postMatchReview: makeBadReview(matchId, reasons),
    });
    const firstView = viewFor('pvplm-browser-recovery-001', ['short_public_decision_window', 'missing_public_second_seat_window']);
    const firstGoal = scene.getLiveSeasonGoalCard(firstView);
    const dismissed = session.dismissSeasonGoal(seasonId);
    const secondView = viewFor('pvplm-browser-recovery-002', ['terminal_before_second_seat_window', 'missing_public_second_seat_window']);
    const secondGoal = scene.getLiveSeasonGoalCard(secondView);
    const host = document.createElement('div');
    host.innerHTML = scene.renderLiveSeasonGoalCard(secondView);
    const card = host.querySelector('[data-live-season-goal]');
    return {
      firstGoal,
      dismissed,
      secondGoal,
      cardText: card?.textContent?.replace(/\s+/g, ' ').trim() || '',
      cardMode: card?.getAttribute('data-live-season-goal-mode') || '',
      cardDismissState: card?.getAttribute('data-live-season-goal-dismiss-state') || '',
      actionIds: Array.from(host.querySelectorAll('[data-live-season-goal-action]')).map(button => button.getAttribute('data-live-season-goal-action')),
    };
  });
  add(
    'live UI reactivates local recovery goal after consecutive low-agency losses',
    seasonGoalRecoveryProbe.firstGoal?.badExperienceStreak === 1
      && seasonGoalRecoveryProbe.dismissed?.dismissedUntilSeason === 's1-browser-recovery'
      && seasonGoalRecoveryProbe.secondGoal?.badExperienceStreak === 2
      && seasonGoalRecoveryProbe.secondGoal?.recoveryState === 'practice_recommended'
      && seasonGoalRecoveryProbe.secondGoal?.recoveryReason === 'consecutive_low_agency_losses'
      && seasonGoalRecoveryProbe.secondGoal?.dismissState === 'active'
      && seasonGoalRecoveryProbe.secondGoal?.recommendedMode === 'practice'
      && /连续短局先练再排|连续 2 场低行动感失败/.test(seasonGoalRecoveryProbe.cardText)
      && /问道练习/.test(seasonGoalRecoveryProbe.cardText)
      && seasonGoalRecoveryProbe.cardMode === 'practice'
      && seasonGoalRecoveryProbe.cardDismissState === 'active'
      && seasonGoalRecoveryProbe.actionIds.includes('practice')
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(JSON.stringify(seasonGoalRecoveryProbe.secondGoal || {})),
    JSON.stringify(seasonGoalRecoveryProbe),
  );

  const experienceCheckClicked = await page.evaluate(() => {
    const button = document.querySelector('[data-live-experience-check="decision_windows"]');
    if (!button) return false;
    button.scrollIntoView({ block: 'center', inline: 'nearest' });
    button.click();
    return true;
  });
  if (!experienceCheckClicked) throw new Error('expected decision window experience check button');
  await page.waitForTimeout(100);
  const experienceFocusProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    hint: document.querySelector('[data-live-last-error]')?.textContent || '',
    eventsPanelFocused: document.querySelector('[data-live-event-panel]')?.getAttribute('data-live-review-focus') || '',
    checkFocused: document.querySelector('[data-live-experience-check="decision_windows"]')?.getAttribute('data-live-review-focus') || '',
    focusedEvents: document.querySelector('[data-live-event-log]')?.textContent || '',
    eventTypes: Array.from(document.querySelectorAll('[data-live-event-type]')).map(item => item.getAttribute('data-live-event-type')),
    experiencePayload: window.PVPScene.getLiveSnapshot()?.postMatchReview?.experienceReport || null,
    calls: window.__livePvpAuditCalls,
  }));
  add(
    'live UI experience check focuses linked public evidence without hidden payloads',
    experienceFocusProbe.phase === 'finished'
      && /体验诊断证据/.test(experienceFocusProbe.hint)
      && experienceFocusProbe.eventsPanelFocused === 'experience_check:decision_windows'
      && experienceFocusProbe.checkFocused === 'experience_check:decision_windows'
      && experienceFocusProbe.eventTypes.includes('battle_started')
      && experienceFocusProbe.eventTypes.includes('turn_ended')
      && /开战/.test(experienceFocusProbe.focusedEvents)
      && /回合交替/.test(experienceFocusProbe.focusedEvents)
      && (experienceFocusProbe.experiencePayload?.fairnessChecks || []).some(item => item.id === 'decision_windows' && (item.linkedEvidence || []).some(event => event.eventType === 'battle_started'))
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(JSON.stringify(experienceFocusProbe.experiencePayload || {}))
      && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket/.test(JSON.stringify(experienceFocusProbe.calls)),
    JSON.stringify(experienceFocusProbe),
  );

  const keyTurnReplayFetchCallStart = await page.evaluate(() => window.__livePvpAuditCalls.length);
  await page.click('[data-live-post-review-action="review_key_turns"]', { timeout: 5000, force: true });
  await page.waitForTimeout(100);
  const keyTurnActionProbe = await page.evaluate(callStart => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    hint: document.querySelector('[data-live-last-error]')?.textContent || '',
    eventsPanelFocused: document.querySelector('[data-live-event-panel]')?.getAttribute('data-live-review-focus') || '',
    keyTurnFocused: document.querySelector('[data-live-key-turn-replay]')?.getAttribute('data-live-review-focus') || '',
    focusedEvents: document.querySelector('[data-live-event-log]')?.textContent || '',
    keyTurnPayload: window.PVPScene.getLiveSnapshot()?.postMatchReview?.keyTurnReplay || null,
    replaySummary: window.PVPScene.getLiveSnapshot()?.lastReplay || null,
    calls: window.__livePvpAuditCalls.slice(callStart),
  }), keyTurnReplayFetchCallStart);
  add(
    'live UI post-match key-turn action fetches authoritative replay and focuses it without hidden payloads',
    keyTurnActionProbe.phase === 'finished'
      && /关键回合/.test(keyTurnActionProbe.hint)
      && keyTurnActionProbe.eventsPanelFocused === 'key_turns'
      && keyTurnActionProbe.keyTurnFocused === 'key_turns'
      && /开战|术式打出|对局结束/.test(keyTurnActionProbe.focusedEvents)
      && keyTurnActionProbe.calls.some(call => call.method === 'getReplay' && call.options?.visibility === 'replay_self')
      && keyTurnActionProbe.replaySummary?.reportVersion === 'pvp-live-replay-v1'
      && keyTurnActionProbe.replaySummary?.visibilityLayer === 'replay_self'
      && keyTurnActionProbe.replaySummary?.hiddenScan?.forbiddenTokenCount === 0
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot/i.test(JSON.stringify(keyTurnActionProbe.keyTurnPayload || {}))
      && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket/.test(JSON.stringify(keyTurnActionProbe.calls)),
    JSON.stringify(keyTurnActionProbe),
  );

  const disputeReportCallStart = await page.evaluate(() => window.__livePvpAuditCalls.length);
  await page.click('[data-live-post-review-action="report_issue"]', { timeout: 5000, force: true });
  await page.waitForTimeout(100);
  const disputeReportProbe = await page.evaluate(callStart => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    hint: document.querySelector('[data-live-last-error]')?.textContent || '',
    receiptText: document.querySelector('[data-live-dispute-report]')?.textContent || '',
    receiptStatus: document.querySelector('[data-live-dispute-report]')?.getAttribute('data-live-dispute-report-status') || '',
    receiptHidden: document.querySelector('[data-live-dispute-report]')?.getAttribute('data-live-dispute-report-hidden') || '',
    receiptRankedImpact: document.querySelector('[data-live-dispute-report]')?.getAttribute('data-live-dispute-report-ranked-impact') || '',
    reportPayload: window.PVPScene.getLiveSnapshot()?.lastDisputeReport || null,
    calls: window.__livePvpAuditCalls.slice(callStart),
  }), disputeReportCallStart);
  add(
    'live UI post-match report_issue submits audit-safe dispute receipt without changing ranked state',
    disputeReportProbe.phase === 'finished'
      && /异常反馈已提交/.test(disputeReportProbe.receiptText)
      && /不会立即改写本局结算/.test(disputeReportProbe.hint)
      && disputeReportProbe.receiptStatus === 'reported'
      && disputeReportProbe.receiptHidden === 'false'
      && disputeReportProbe.receiptRankedImpact === 'none'
      && disputeReportProbe.reportPayload?.reportVersion === 'pvp-live-dispute-report-receipt-v1'
      && disputeReportProbe.reportPayload?.evidencePackage?.reportVersion === 'pvp-live-dispute-evidence-v1'
      && disputeReportProbe.reportPayload?.evidencePackage?.usesHiddenInformation === false
      && disputeReportProbe.reportPayload?.evidencePackage?.eventCount >= 1
      && disputeReportProbe.calls.some(call => call.method === 'submitReport' && call.report?.reason === 'fairness_review')
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|randomSeed/i.test(JSON.stringify(disputeReportProbe.reportPayload || {}))
      && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket/.test(JSON.stringify(disputeReportProbe.calls)),
    JSON.stringify(disputeReportProbe),
  );

  await page.click('[data-live-post-review-action="review_events"]', { timeout: 5000, force: true });
  await page.click('[data-live-post-review-action="adjust_loadout"]', { timeout: 5000, force: true });
  await page.waitForTimeout(100);
  const postReviewActionProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    hint: document.querySelector('[data-live-last-error]')?.textContent || '',
    loadoutDisabled: Array.from(document.querySelectorAll('[data-live-loadout-preset]')).map(button => button.disabled),
    eventsPanelFocused: document.querySelector('[data-live-event-panel]')?.getAttribute('data-live-review-focus') || '',
    focusedEvents: document.querySelector('[data-live-event-log]')?.textContent || '',
    calls: window.__livePvpAuditCalls,
  }));
  add(
    'live UI post-match review actions are clickable safe handoff entries',
    postReviewActionProbe.phase === 'finished'
      && /改谱只影响下一局/.test(postReviewActionProbe.hint)
      && /events/.test(postReviewActionProbe.eventsPanelFocused)
      && /开战/.test(postReviewActionProbe.focusedEvents)
      && /调息完成/.test(postReviewActionProbe.focusedEvents)
      && /对局结束/.test(postReviewActionProbe.focusedEvents)
      && postReviewActionProbe.loadoutDisabled.every(value => value === false)
      && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket/.test(JSON.stringify(postReviewActionProbe.calls)),
    JSON.stringify(postReviewActionProbe),
  );

  const loadoutRecommendationApplyCallStart = await page.evaluate(() => window.__livePvpAuditCalls.length);
  await page.click('[data-live-loadout-recommendation-action="apply"]', { timeout: 5000, force: true });
  await page.waitForTimeout(100);
  const loadoutRecommendationApplyProbe = await page.evaluate(callStart => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    hint: document.querySelector('[data-live-last-error]')?.textContent || '',
    selectedLoadout: document.querySelector('[data-live-selected-loadout]')?.textContent || '',
    selectedPreset: document.querySelector('[data-live-loadout-preset].selected')?.getAttribute('data-live-loadout-preset') || '',
    loadoutPanelFocused: document.querySelector('.pvp-live-loadout-selector')?.getAttribute('data-live-review-focus') || '',
    presetDisabled: Array.from(document.querySelectorAll('[data-live-loadout-preset]')).map(button => button.disabled),
    resolutions: ['queue_again', 'friendly_rematch', 'practice'].map(actionId => window.PVPScene.resolveLivePostReviewLoadoutPreset(actionId)),
    calls: window.__livePvpAuditCalls.slice(callStart),
  }), loadoutRecommendationApplyCallStart);
  add(
    'live UI one-click applies post-match loadout recommendation without queueing',
    loadoutRecommendationApplyProbe.phase === 'finished'
      && loadoutRecommendationApplyProbe.selectedPreset === 'shield'
      && /守势斗法谱/.test(loadoutRecommendationApplyProbe.selectedLoadout)
      && /已套用.*下一局/.test(loadoutRecommendationApplyProbe.hint)
      && /不自动排队|不写正式积分/.test(loadoutRecommendationApplyProbe.hint)
      && loadoutRecommendationApplyProbe.loadoutPanelFocused === 'loadout_recommendation'
      && loadoutRecommendationApplyProbe.presetDisabled.every(value => value === false)
      && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket|joinQueue|requestRematch/.test(JSON.stringify(loadoutRecommendationApplyProbe.calls)),
    JSON.stringify(loadoutRecommendationApplyProbe),
  );
  add(
    'live UI post-match loadout resolution carries apply receipt across next actions',
    loadoutRecommendationApplyProbe.resolutions.length === 3
      && loadoutRecommendationApplyProbe.resolutions.every(item => item?.reportVersion === 'pvp-live-post-review-loadout-resolution-v1')
      && loadoutRecommendationApplyProbe.resolutions.every(item => item?.presetId === 'shield')
      && loadoutRecommendationApplyProbe.resolutions.some(item => item?.actionId === 'queue_again' && item?.source === 'applied_public_recommendation' && item?.sourceVisibility === 'public_events_and_public_content' && item?.rankedImpact === 'candidate_only')
      && loadoutRecommendationApplyProbe.resolutions.some(item => item?.actionId === 'friendly_rematch' && item?.source === 'applied_public_recommendation' && item?.sourceVisibility === 'public_events_and_public_content' && item?.rankedImpact === 'candidate_only')
      && loadoutRecommendationApplyProbe.resolutions.some(item => item?.actionId === 'practice' && item?.source === 'public_recommendation_practice' && item?.sourceVisibility === 'public_events_and_public_content' && item?.rankedImpact === 'none')
      && loadoutRecommendationApplyProbe.resolutions.every(item => item?.usesHiddenInformation === false)
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(JSON.stringify(loadoutRecommendationApplyProbe.resolutions)),
    JSON.stringify(loadoutRecommendationApplyProbe.resolutions),
  );
  const manualLoadoutOverrideProbe = await page.evaluate(() => {
    const previousPreset = window.PVPScene.liveSelectedLoadoutPreset;
    window.PVPScene.liveSelectedLoadoutPreset = 'balanced';
    const probe = {
      selectedPreset: window.PVPScene.liveSelectedLoadoutPreset,
      queue: window.PVPScene.resolveLivePostReviewLoadoutPreset('queue_again'),
      rematch: window.PVPScene.resolveLivePostReviewLoadoutPreset('friendly_rematch'),
      practice: window.PVPScene.resolveLivePostReviewLoadoutPreset('practice'),
    };
    window.PVPScene.liveSelectedLoadoutPreset = previousPreset;
    return probe;
  });
  add(
    'live UI post-match loadout resolution lets manual candidate override formal carryover while practice stays no-score',
    manualLoadoutOverrideProbe.selectedPreset === 'balanced'
      && manualLoadoutOverrideProbe.queue?.presetId === 'balanced'
      && manualLoadoutOverrideProbe.queue?.source === 'manual_candidate_override'
      && manualLoadoutOverrideProbe.queue?.sourceVisibility === 'local_candidate'
      && manualLoadoutOverrideProbe.queue?.recommendationVisibility === 'public_events_and_public_content'
      && manualLoadoutOverrideProbe.queue?.rankedImpact === 'candidate_only'
      && manualLoadoutOverrideProbe.rematch?.presetId === 'balanced'
      && manualLoadoutOverrideProbe.rematch?.source === 'manual_candidate_override'
      && manualLoadoutOverrideProbe.rematch?.sourceVisibility === 'local_candidate'
      && manualLoadoutOverrideProbe.rematch?.rankedImpact === 'candidate_only'
      && manualLoadoutOverrideProbe.practice?.presetId === 'shield'
      && manualLoadoutOverrideProbe.practice?.source === 'public_recommendation_practice'
      && manualLoadoutOverrideProbe.practice?.sourceVisibility === 'public_events_and_public_content'
      && manualLoadoutOverrideProbe.practice?.rankedImpact === 'none'
      && [manualLoadoutOverrideProbe.queue, manualLoadoutOverrideProbe.rematch, manualLoadoutOverrideProbe.practice].every(item => item?.usesHiddenInformation === false)
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(JSON.stringify(manualLoadoutOverrideProbe)),
    JSON.stringify(manualLoadoutOverrideProbe),
  );
  const manualLoadoutActionPayloadProbe = await page.evaluate(async () => {
    const scene = window.PVPScene;
    const originalGetLiveSession = scene.getLiveSession;
    const originalRenderLivePanel = scene.renderLivePanel;
    const originalStartLivePolling = scene.startLivePolling;
    const originalStopLivePolling = scene.stopLivePolling;
    const previousPreset = scene.liveSelectedLoadoutPreset;
    const previousHint = scene.liveInlineHint;
    const baseReview = scene.getLiveSnapshot()?.postMatchReview || {};
    const state = {
      phase: 'finished',
      matchId: 'pvplm-browser-manual-loadout-action',
      seatId: 'A',
      stateView: {
        matchId: 'pvplm-browser-manual-loadout-action',
        status: 'finished',
        stateVersion: 101,
        postMatchReview: baseReview,
      },
      lastError: null,
    };
    const calls = [];
    scene.liveSelectedLoadoutPreset = 'balanced';
    scene.renderLivePanel = () => {};
    scene.startLivePolling = () => {};
    scene.stopLivePolling = () => {};
    scene.getLiveSession = () => ({
      getState: () => state,
      joinQueue: async (options) => {
        calls.push({ method: 'joinQueue', options });
        state.phase = 'waiting';
        state.queueTicket = 'pvplq-browser-manual-loadout-action';
        state.lastError = null;
        return state;
      },
      requestRematch: async (options) => {
        calls.push({ method: 'requestRematch', options });
        state.phase = 'waiting_rematch';
        state.lastError = {
          reason: 'waiting_rematch',
          message: '已发起低压力再战，等待本局对手确认；不写正式积分。',
        };
        return state;
      },
    });
    await scene.handleLivePostReviewAction('queue_again');
    const queueHint = scene.liveInlineHint;
    state.phase = 'finished';
    state.queueTicket = '';
    state.lastError = null;
    await scene.handleLivePostReviewAction('friendly_rematch');
    const rematchHint = scene.liveInlineHint;
    state.phase = 'finished';
    state.lastError = null;
    const practiceScenario = scene.buildLivePostReviewDrillScenario(state);
    scene.getLiveSession = originalGetLiveSession;
    scene.renderLivePanel = originalRenderLivePanel;
    scene.startLivePolling = originalStartLivePolling;
    scene.stopLivePolling = originalStopLivePolling;
    scene.liveSelectedLoadoutPreset = previousPreset;
    scene.liveInlineHint = previousHint;
    return { calls, queueHint, rematchHint, practiceScenario };
  });
  add(
    'live UI post-match actions submit manual formal loadout while practice keeps public recommendation',
    manualLoadoutActionPayloadProbe.calls.filter(call => call.method === 'joinQueue').length === 1
      && manualLoadoutActionPayloadProbe.calls.find(call => call.method === 'joinQueue')?.options?.loadout?.identitySlot === 'balanced'
      && manualLoadoutActionPayloadProbe.calls.filter(call => call.method === 'requestRematch').length === 1
      && manualLoadoutActionPayloadProbe.calls.find(call => call.method === 'requestRematch')?.options?.loadout?.identitySlot === 'balanced'
      && /手动候选谱默认斗法谱/.test(manualLoadoutActionPayloadProbe.queueHint || '')
      && /手动候选谱默认斗法谱/.test(manualLoadoutActionPayloadProbe.rematchHint || '')
      && /不写正式积分/.test(manualLoadoutActionPayloadProbe.rematchHint || '')
      && manualLoadoutActionPayloadProbe.practiceScenario?.recommendedLoadoutId === 'shield'
      && manualLoadoutActionPayloadProbe.practiceScenario?.rankedImpact === 'none'
      && !/opponentHand|opponentDeck|loadoutSnapshot|reward|rating|elo/i.test(JSON.stringify(manualLoadoutActionPayloadProbe)),
    JSON.stringify(manualLoadoutActionPayloadProbe),
  );
  const failedLoadoutReceiptProbe = await page.evaluate(async () => {
    const scene = window.PVPScene;
    const originalGetLiveSession = scene.getLiveSession;
    const originalRenderLivePanel = scene.renderLivePanel;
    const originalStartLivePolling = scene.startLivePolling;
    const originalStopLivePolling = scene.stopLivePolling;
    const previousPreset = scene.liveSelectedLoadoutPreset;
    const previousHint = scene.liveInlineHint;
    const baseReview = scene.getLiveSnapshot()?.postMatchReview || {};
    const state = {
      phase: 'finished',
      matchId: 'pvplm-browser-failed-loadout-receipt',
      seatId: 'A',
      stateView: {
        matchId: 'pvplm-browser-failed-loadout-receipt',
        status: 'finished',
        stateVersion: 102,
        postMatchReview: baseReview,
      },
      lastError: null,
    };
    const calls = [];
    scene.liveSelectedLoadoutPreset = 'shield';
    scene.liveInlineHint = '旧成功提示';
    scene.renderLivePanel = () => {};
    scene.startLivePolling = () => {};
    scene.stopLivePolling = () => {};
    scene.getLiveSession = () => ({
      getState: () => state,
      joinQueue: async (options) => {
        calls.push({ method: 'joinQueue', options });
        state.phase = 'idle';
        state.matchId = '';
        state.stateView = null;
        state.lastError = {
          reason: 'connection_health_failed',
          message: '当前连接不适合进入正式真人排位',
        };
        return state;
      },
      requestRematch: async (options) => {
        calls.push({ method: 'requestRematch', options });
        state.phase = 'finished';
        state.lastError = {
          reason: 'rematch_expired',
          message: '低压力再战等待已过期',
        };
        return state;
      },
    });
    await scene.handleLivePostReviewAction('queue_again');
    const queueHint = scene.liveInlineHint;
    const queueError = { ...(state.lastError || {}) };
    state.phase = 'finished';
    state.matchId = 'pvplm-browser-failed-loadout-receipt';
    state.stateView = {
      matchId: 'pvplm-browser-failed-loadout-receipt',
      status: 'finished',
      stateVersion: 103,
      postMatchReview: baseReview,
    };
    state.lastError = null;
    scene.liveInlineHint = '旧成功提示';
    await scene.handleLivePostReviewAction('friendly_rematch');
    const rematchHint = scene.liveInlineHint;
    const rematchError = { ...(state.lastError || {}) };
    scene.getLiveSession = originalGetLiveSession;
    scene.renderLivePanel = originalRenderLivePanel;
    scene.startLivePolling = originalStartLivePolling;
    scene.stopLivePolling = originalStopLivePolling;
    scene.liveSelectedLoadoutPreset = previousPreset;
    scene.liveInlineHint = previousHint;
    return { calls, queueHint, queueError, rematchHint, rematchError };
  });
  add(
    'live UI post-match loadout receipts do not mask queue or rematch failures',
    failedLoadoutReceiptProbe.calls.some(call => call.method === 'joinQueue' && call.options?.loadout?.identitySlot === 'shield')
      && failedLoadoutReceiptProbe.queueHint === ''
      && failedLoadoutReceiptProbe.queueError?.reason === 'connection_health_failed'
      && failedLoadoutReceiptProbe.calls.some(call => call.method === 'requestRematch' && call.options?.loadout?.identitySlot === 'shield')
      && failedLoadoutReceiptProbe.rematchHint === ''
      && failedLoadoutReceiptProbe.rematchError?.reason === 'rematch_expired'
      && !/已使用/.test(`${failedLoadoutReceiptProbe.queueHint} ${failedLoadoutReceiptProbe.rematchHint}`),
    JSON.stringify(failedLoadoutReceiptProbe),
  );
  const recommendationPracticePresetProbe = await page.evaluate(() => {
    const scene = window.PVPScene;
    const originalGetLiveSession = scene.getLiveSession;
    const baseReview = scene.getLiveSnapshot()?.postMatchReview || {};
    const state = {
      phase: 'finished',
      matchId: 'pvplm-browser-winning-recommendation-practice',
      seatId: 'A',
      stateView: {
        matchId: 'pvplm-browser-winning-recommendation-practice',
        status: 'finished',
        stateVersion: 99,
        postMatchReview: {
          ...baseReview,
          result: 'win',
          winnerSeat: 'A',
          loserSeat: 'B',
          finishReason: 'lethal',
          summary: '公开轨迹显示主动压制有效。',
          loadoutRecommendation: {
            ...(baseReview.loadoutRecommendation || {}),
            reportVersion: 'pvp-live-loadout-recommendation-v1',
            sourceVisibility: 'public_events_and_public_content',
            usesHiddenInformation: false,
            rankedImpact: 'none',
            recommendedPresetId: 'sword',
            recommendedPresetLabel: '破阵斗法谱',
            reasonLine: '本局公开轨迹显示主动压制有效，下一局可套用破阵斗法谱继续验证前两手压力。',
          },
        },
      },
    };
    scene.liveSelectedLoadoutPreset = 'balanced';
    scene.getLiveSession = () => ({ getState: () => state });
    const scenario = scene.buildLivePostReviewDrillScenario();
    scene.getLiveSession = originalGetLiveSession;
    return {
      selectedPreset: 'balanced',
      recommendationPreset: state.stateView.postMatchReview.loadoutRecommendation.recommendedPresetId,
      scenario,
    };
  });
  add(
    'live UI post-match practice drill follows public loadout recommendation over current preset',
    recommendationPracticePresetProbe.selectedPreset === 'balanced'
      && recommendationPracticePresetProbe.recommendationPreset === 'sword'
      && recommendationPracticePresetProbe.scenario?.recommendedLoadoutId === 'sword'
      && /破阵斗法谱/.test(recommendationPracticePresetProbe.scenario?.recommendedLoadoutLabel || '')
      && /破阵斗法谱/.test(recommendationPracticePresetProbe.scenario?.drillObjective || '')
      && recommendationPracticePresetProbe.scenario?.usesHiddenInformation === false
      && recommendationPracticePresetProbe.scenario?.rankedImpact === 'none'
      && !/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(JSON.stringify(recommendationPracticePresetProbe.scenario || {})),
    JSON.stringify(recommendationPracticePresetProbe),
  );

  await page.click('[data-live-post-review-action="practice"]', { timeout: 5000, force: true });
  await page.waitForTimeout(450);
  const postReviewPracticeProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    return {
      currentScreen: window.game?.currentScreen || '',
      tab: window.game?.challengeHubState?.tab || '',
      pending: payload?.challenge?.pending || null,
      focus: payload?.challenge?.trainingFocus || null,
      bannerText: document.getElementById('challenge-selection-banner')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      insightText: document.querySelector('#challenge-selection-banner .challenge-record-insight')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      confirmText: document.querySelector('#confirm-character-btn .btn-text')?.textContent?.trim() || '',
      drillScenario: payload?.pvp?.live?.drillScenario || window.PVPScene.getLiveSnapshot()?.drillScenario || null,
      calls: window.__livePvpAuditCalls,
    };
  });
  add(
    'live UI post-match practice handoff creates no-score drill scenario and opens replay-only playable challenge drill',
    postReviewPracticeProbe.currentScreen === 'character-selection-screen'
      && postReviewPracticeProbe.pending?.replayOnly === true
      && postReviewPracticeProbe.pending?.practiceOnly === true
      && /^pvp_live_drill_/.test(postReviewPracticeProbe.pending?.ruleId || '')
      && /^PVP-/.test(postReviewPracticeProbe.pending?.seedSignature || '')
      && postReviewPracticeProbe.focus?.sourceRunId === 'pvp_live:pvplm-browser-live'
      && postReviewPracticeProbe.focus?.guideRecordId === 'pvp_live:pvplm-browser-live'
      && /真人 PVP|首败|复盘/.test(postReviewPracticeProbe.focus?.trainingAdvice || '')
      && /真人 PVP|问道练习|不计/.test(postReviewPracticeProbe.bannerText || '')
      && /公开事件|不写正式积分|隐藏/.test(postReviewPracticeProbe.insightText || '')
      && /回放命盘/.test(postReviewPracticeProbe.confirmText || '')
      && postReviewPracticeProbe.drillScenario?.reportVersion === 'pvp-live-drill-scenario-v1'
      && postReviewPracticeProbe.drillScenario?.sourceMatchId === 'pvplm-browser-live'
      && postReviewPracticeProbe.drillScenario?.sourceVisibility === 'replay_self'
      && postReviewPracticeProbe.drillScenario?.usesHiddenInformation === false
      && postReviewPracticeProbe.drillScenario?.rankedImpact === 'none'
      && postReviewPracticeProbe.drillScenario?.practicePlan?.reportVersion === 'pvp-live-practice-plan-v1'
      && postReviewPracticeProbe.drillScenario?.practicePlan?.sourceVisibility === 'public_events'
      && postReviewPracticeProbe.drillScenario?.practicePlan?.usesHiddenInformation === false
      && postReviewPracticeProbe.drillScenario?.practicePlan?.rankedImpact === 'none'
      && (postReviewPracticeProbe.drillScenario?.practicePlan?.tempoScript || []).some(item => item.eventType === 'battle_started')
      && (postReviewPracticeProbe.drillScenario?.practicePlan?.fairnessFocus || []).some(item => item.id === 'decision_windows')
      && !/payload|hand|deck|cardId|instanceId|cardInstanceId|loadoutSnapshot|rawPayload|token/i.test(JSON.stringify(postReviewPracticeProbe.drillScenario?.practicePlan || {}))
      && (postReviewPracticeProbe.drillScenario?.trainingTags || []).includes('首败复盘')
      && (postReviewPracticeProbe.drillScenario?.publicEventTypes || []).includes('battle_started')
      && !/reward|rating|elo/i.test(JSON.stringify(postReviewPracticeProbe.drillScenario || {}))
      && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket/.test(JSON.stringify(postReviewPracticeProbe.calls)),
    JSON.stringify(postReviewPracticeProbe),
  );

  const unsafePracticePlanProbe = await page.evaluate(() => {
    const safeReplay = {
      reportVersion: 'pvp-live-key-turn-replay-v1',
      sourceVisibility: 'public_events',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      turns: [
        { id: 'opening', label: '开局窗口', sequence: 4, eventType: 'battle_started', actingSeat: 'A', severity: 'setup', lesson: '确认先后手和第一拍资源。' },
      ],
    };
    const safeExperience = {
      reportVersion: 'pvp-live-experience-report-v1',
      sourceVisibility: 'public_events',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      fairnessChecks: [
        { id: 'decision_windows', label: '公开决策窗口', passed: false, detail: '第二行动窗口需要复查。' },
      ],
    };
    const unsafeKeyTurnReview = {
      reportVersion: 'pvp-live-post-match-review-v1',
      title: '异常复盘',
      result: 'loss',
      finishReason: 'surrender',
      evidence: [{ eventType: 'battle_started', sequence: 1, actingSeat: 'A', publicData: { firstSeat: 'A' } }],
      keyTurnReplay: {
        ...safeReplay,
        sourceVisibility: 'private_state',
        usesHiddenInformation: true,
        turns: [
          { id: 'hidden_opening', label: '隐藏开局', sequence: 4, eventType: 'battle_started', actingSeat: 'A', severity: 'setup', lesson: 'This should not be relabeled as public practice data.' },
        ],
      },
      experienceReport: safeExperience,
      nextActions: [{ id: 'practice', label: '问道练习' }],
    };
    const unsafeExperienceReview = {
      ...unsafeKeyTurnReview,
      keyTurnReplay: safeReplay,
      experienceReport: {
        ...safeExperience,
        sourceVisibility: 'private_state',
        usesHiddenInformation: true,
      },
    };
    const missingMetadataReview = {
      ...unsafeKeyTurnReview,
      keyTurnReplay: {
        reportVersion: 'pvp-live-key-turn-replay-v1',
        turns: safeReplay.turns,
      },
      experienceReport: {
        reportVersion: 'pvp-live-experience-report-v1',
        sourceVisibility: 'public_events',
        usesHiddenInformation: false,
        fairnessChecks: safeExperience.fairnessChecks,
      },
    };
    return {
      unsafeKeyTurnPlan: window.PVPScene.buildLivePostReviewPracticePlan(unsafeKeyTurnReview),
      unsafeExperiencePlan: window.PVPScene.buildLivePostReviewPracticePlan(unsafeExperienceReview),
      missingMetadataPlan: window.PVPScene.buildLivePostReviewPracticePlan(missingMetadataReview),
      missingMetadataScenario: window.PVPScene.buildLivePostReviewDrillScenario({
        matchId: 'pvplm-browser-missing-practice-meta',
        stateView: {
          matchId: 'pvplm-browser-missing-practice-meta',
          postMatchReview: missingMetadataReview,
        },
      }),
      unsafeScenario: window.PVPScene.buildLivePostReviewDrillScenario({
        matchId: 'pvplm-browser-unsafe-practice',
        stateView: {
          matchId: 'pvplm-browser-unsafe-practice',
          postMatchReview: unsafeKeyTurnReview,
        },
      }),
    };
  });
  add(
    'live UI post-match practice plan rejects unsafe source reports',
    unsafePracticePlanProbe.unsafeKeyTurnPlan === null
      && unsafePracticePlanProbe.unsafeExperiencePlan === null
      && unsafePracticePlanProbe.missingMetadataPlan === null
      && unsafePracticePlanProbe.missingMetadataScenario === null
      && unsafePracticePlanProbe.unsafeScenario === null,
    JSON.stringify(unsafePracticePlanProbe),
  );

  await page.click('#confirm-character-btn', { timeout: 5000, force: true });
  await page.waitForTimeout(900);
  const postReviewDrillStartProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const bannerText = document.getElementById('challenge-run-banner')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const focusText = document.querySelector('#challenge-run-banner .challenge-run-focus')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    return {
      mode: payload?.mode || '',
      currentScreen: window.game?.currentScreen || '',
      activeRun: payload?.challenge?.activeRun || null,
      bannerText,
      focusText,
      calls: window.__livePvpAuditCalls,
    };
  });
  add(
    'live UI post-match practice drill can start replay-only no-reward challenge run',
    postReviewDrillStartProbe.currentScreen === 'map-screen'
      && postReviewDrillStartProbe.activeRun?.replayOnly === true
      && postReviewDrillStartProbe.activeRun?.practiceOnly === true
      && postReviewDrillStartProbe.activeRun?.currentScore === 0
      && /^pvp_live_drill_/.test(postReviewDrillStartProbe.activeRun?.ruleId || '')
      && /^PVP-/.test(postReviewDrillStartProbe.activeRun?.seedSignature || '')
      && /真人练习|不计奖励|练习不计分/.test(postReviewDrillStartProbe.bannerText || '')
      && /训练重点/.test(postReviewDrillStartProbe.focusText || '')
      && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket/.test(JSON.stringify(postReviewDrillStartProbe.calls)),
    JSON.stringify(postReviewDrillStartProbe),
  );

  await page.evaluate(async () => {
    window.game.showScreen('pvp-screen');
    window.PVPScene.switchTab('live');
    await window.PVPScene.loadLivePanel();
  });
  await page.waitForTimeout(100);
  await page.click('[data-live-post-match-review]:visible [data-live-post-review-action="queue_again"]', { timeout: 5000, force: true });
  await page.waitForTimeout(200);
  const postReviewRequeueProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    queueTicket: document.querySelector('[data-live-queue-ticket]')?.textContent || '',
    reviewHidden: document.querySelector('[data-live-post-match-review]')?.hidden ?? false,
    eventsPanelFocused: document.querySelector('[data-live-event-panel]')?.getAttribute('data-live-review-focus') || '',
    calls: window.__livePvpAuditCalls,
  }));
  add(
    'live UI post-match queue again re-enters live queue without legacy settlement',
    postReviewRequeueProbe.phase === 'waiting'
      && /pvplq-browser-live/.test(postReviewRequeueProbe.queueTicket)
      && postReviewRequeueProbe.reviewHidden === true
      && postReviewRequeueProbe.eventsPanelFocused === ''
      && postReviewRequeueProbe.calls.filter(call => call.method === 'joinQueue').length >= 2
      && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket/.test(JSON.stringify(postReviewRequeueProbe.calls)),
    JSON.stringify(postReviewRequeueProbe),
  );

  await page.evaluate(async () => {
    window.PVPScene.liveSession = null;
    window.__livePvpAuditCalls = [];
    await window.PVPScene.loadLivePanel();
    const targetInput = document.querySelector('[data-live-target-username]');
    if (targetInput) targetInput.value = '乙';
  });
  await page.waitForTimeout(100);
  await page.click('[data-live-action="create-invite"]', { timeout: 5000, force: true });
  await page.waitForTimeout(150);
  const inviteCreateProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    inviteCode: document.querySelector('[data-live-invite-code]')?.textContent || '',
    inviteReport: document.querySelector('[data-live-invite-report]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    snapshot: window.PVPScene.getLiveSnapshot(),
    calls: window.__livePvpAuditCalls,
  }));
  add(
    'live UI private invite creation shows share code without entering public queue',
    inviteCreateProbe.phase === 'waiting_invite'
      && /TDAB12/.test(inviteCreateProbe.inviteCode)
      && /好友约战|邀请|约战/.test(inviteCreateProbe.inviteReport)
      && /乙/.test(inviteCreateProbe.inviteReport)
      && /不写正式积分/.test(inviteCreateProbe.inviteReport)
      && inviteCreateProbe.snapshot?.inviteCode === 'TDAB12'
      && inviteCreateProbe.snapshot?.queueTicket === ''
      && inviteCreateProbe.snapshot?.inviteReport?.reportVersion === 'pvp-live-invite-v1'
      && inviteCreateProbe.snapshot?.inviteReport?.rankedImpact === 'none'
      && inviteCreateProbe.calls.some(call => call.method === 'createInvite' && call.options?.targetUsername === '乙' && call.options?.loadout?.deck?.length === 20)
      && !inviteCreateProbe.calls.slice(-3).some(call => call.method === 'joinQueue')
      && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket/.test(JSON.stringify(inviteCreateProbe.calls)),
    JSON.stringify(inviteCreateProbe),
  );

  await page.click('[data-live-action="cancel-invite"]', { timeout: 5000, force: true });
  await page.waitForTimeout(150);
  const inviteCancelProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    inviteCode: document.querySelector('[data-live-invite-code]')?.textContent || '',
    lastError: document.querySelector('[data-live-last-error]')?.textContent || '',
    snapshot: window.PVPScene.getLiveSnapshot(),
    calls: window.__livePvpAuditCalls,
  }));
  add(
    'live UI private invite cancel returns to idle without public queue',
    inviteCancelProbe.phase === 'idle'
      && /--/.test(inviteCancelProbe.inviteCode)
      && /已取消|约战/.test(inviteCancelProbe.lastError)
      && inviteCancelProbe.snapshot?.inviteCode === ''
      && inviteCancelProbe.snapshot?.inviteReport === null
      && inviteCancelProbe.calls.some(call => call.method === 'cancelInvite' && call.inviteCode === 'TDAB12')
      && !inviteCancelProbe.calls.slice(-3).some(call => call.method === 'joinQueue')
      && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket/.test(JSON.stringify(inviteCancelProbe.calls)),
    JSON.stringify(inviteCancelProbe),
  );

  await page.evaluate(async () => {
    window.PVPScene.liveSession = null;
    window.__livePvpAuditCalls = [];
    window.__livePvpAuditCurrentInviteMode = 'pending';
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('theDefierPvpLiveWaitingQueueTicketV1')) {
        window.localStorage.removeItem(key);
      }
    }
    window.PVPService.live.getCurrentMatch = async () => {
      window.__livePvpAuditCalls.push({ method: 'getCurrentMatch', inviteResume: true });
      return { success: false, reason: 'no_current_match', message: '当前没有进行中的实时论道' };
    };
    await window.PVPScene.loadLivePanel();
  });
  await page.waitForTimeout(100);
  const inviteResumeProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    inviteCode: document.querySelector('[data-live-invite-code]')?.textContent || '',
    inviteReport: document.querySelector('[data-live-invite-report]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    cancelDisabled: document.querySelector('[data-live-action="cancel-invite"]')?.disabled,
    snapshot: window.PVPScene.getLiveSnapshot(),
    calls: window.__livePvpAuditCalls,
  }));
  add(
    'live UI refresh resumes pending private invite with cancel action',
    inviteResumeProbe.phase === 'waiting_invite'
      && /TDAB12/.test(inviteResumeProbe.inviteCode)
      && /不写正式积分/.test(inviteResumeProbe.inviteReport)
      && inviteResumeProbe.cancelDisabled === false
      && inviteResumeProbe.snapshot?.inviteCode === 'TDAB12'
      && inviteResumeProbe.snapshot?.inviteReport?.status === 'waiting'
      && inviteResumeProbe.calls.some(call => call.method === 'getCurrentInvite' && call.mode === 'pending')
      && !inviteResumeProbe.calls.some(call => call.method === 'joinQueue')
      && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket/.test(JSON.stringify(inviteResumeProbe.calls)),
    JSON.stringify(inviteResumeProbe),
  );

  await page.evaluate(async () => {
    window.PVPScene.liveSession = null;
    window.__livePvpAuditCalls = [];
    window.__livePvpAuditCurrentInviteMode = '';
    window.__livePvpAuditInboxMode = '';
    await window.PVPScene.loadLivePanel();
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    window.__livePvpAuditInboxMode = 'pending';
  });
  await page.waitForTimeout(2800);
  const inviteInboxAutoRefreshProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    inbox: document.querySelector('[data-live-invite-inbox]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    snapshot: window.PVPScene.getLiveSnapshot(),
    calls: window.__livePvpAuditCalls,
  }));
  add(
    'live UI idle panel auto-refreshes targeted private invite inbox',
    inviteInboxAutoRefreshProbe.phase === 'idle'
      && /甲/.test(inviteInboxAutoRefreshProbe.inbox)
      && /TDIN42/.test(inviteInboxAutoRefreshProbe.inbox)
      && inviteInboxAutoRefreshProbe.snapshot?.inviteInbox?.length === 1
      && inviteInboxAutoRefreshProbe.calls.filter(call => call.method === 'getInviteInbox').length >= 2
      && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket/.test(JSON.stringify(inviteInboxAutoRefreshProbe.calls)),
    JSON.stringify(inviteInboxAutoRefreshProbe),
  );
  await page.evaluate(() => window.PVPScene.stopLivePolling());

  await page.evaluate(async () => {
    window.PVPScene.liveSession = null;
    window.__livePvpAuditCalls = [];
    window.__livePvpAuditCurrentInviteMode = '';
    window.__livePvpAuditInboxMode = 'pending';
    await window.PVPScene.loadLivePanel();
  });
  await page.waitForTimeout(100);
  const inviteInboxProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    inbox: document.querySelector('[data-live-invite-inbox]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    inboxButtons: Array.from(document.querySelectorAll('[data-live-inbox-join]')).map(button => button.getAttribute('data-live-inbox-join')),
    snapshot: window.PVPScene.getLiveSnapshot(),
    calls: window.__livePvpAuditCalls,
  }));
  add(
    'live UI renders targeted private invite inbox while idle',
    inviteInboxProbe.phase === 'idle'
      && /甲/.test(inviteInboxProbe.inbox)
      && /TDIN42/.test(inviteInboxProbe.inbox)
      && /不写正式积分/.test(inviteInboxProbe.inbox)
      && inviteInboxProbe.inboxButtons.includes('TDIN42')
      && inviteInboxProbe.snapshot?.inviteInbox?.length === 1
      && inviteInboxProbe.calls.some(call => call.method === 'getInviteInbox' && call.mode === 'pending')
      && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket/.test(JSON.stringify(inviteInboxProbe.calls)),
    JSON.stringify(inviteInboxProbe),
  );
  await page.click('[data-live-invite-inbox]:visible [data-live-inbox-join="TDIN42"]', { timeout: 5000, force: true });
  await page.waitForTimeout(150);
  const inviteInboxJoinProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    matchId: document.querySelector('[data-live-match-id]')?.textContent || '',
    summary: document.querySelector('[data-live-summary]')?.textContent || '',
    inbox: document.querySelector('[data-live-invite-inbox]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    snapshot: window.PVPScene.getLiveSnapshot(),
    calls: window.__livePvpAuditCalls,
  }));
  add(
    'live UI joins targeted private invite from inbox without manual code copy',
    inviteInboxJoinProbe.phase === 'setup'
      && /pvplm-browser-invite/.test(inviteInboxJoinProbe.matchId)
      && /友谊再战|准备阶段/.test(inviteInboxJoinProbe.summary)
      && inviteInboxJoinProbe.snapshot?.mode === 'friendly'
      && Array.isArray(inviteInboxJoinProbe.snapshot?.inviteInbox)
      && inviteInboxJoinProbe.snapshot.inviteInbox.length === 0
      && inviteInboxJoinProbe.calls.some(call => call.method === 'joinInvite' && call.inviteCode === 'TDIN42' && call.options?.loadout?.deck?.length === 20)
      && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket/.test(JSON.stringify(inviteInboxJoinProbe.calls)),
    JSON.stringify(inviteInboxJoinProbe),
  );

  await page.evaluate(async () => {
    window.PVPScene.liveSession = null;
    window.__livePvpAuditCalls = [];
    window.__livePvpAuditCurrentInviteMode = '';
    window.__livePvpAuditInboxMode = '';
    await window.PVPScene.loadLivePanel();
    const input = document.querySelector('[data-live-invite-input]');
    if (input) input.value = 'TDAB12';
  });
  await page.click('[data-live-action="join-invite"]', { timeout: 5000, force: true });
  await page.waitForTimeout(150);
  const inviteJoinProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    matchId: document.querySelector('[data-live-match-id]')?.textContent || '',
    summary: document.querySelector('[data-live-summary]')?.textContent || '',
    inviteCode: document.querySelector('[data-live-invite-code]')?.textContent || '',
    snapshot: window.PVPScene.getLiveSnapshot(),
    calls: window.__livePvpAuditCalls,
  }));
  add(
    'live UI private invite join enters friendly setup without legacy settlement',
    inviteJoinProbe.phase === 'setup'
      && /pvplm-browser-invite/.test(inviteJoinProbe.matchId)
      && /友谊再战|准备阶段/.test(inviteJoinProbe.summary)
      && /--/.test(inviteJoinProbe.inviteCode)
      && inviteJoinProbe.snapshot?.mode === 'friendly'
      && inviteJoinProbe.snapshot?.matchQuality?.expansionStage === 'friend_invite'
      && (inviteJoinProbe.snapshot?.matchQuality?.safeguards || []).includes('invite_only_match')
      && (inviteJoinProbe.snapshot?.matchQuality?.safeguards || []).includes('friendly_no_ranked_impact')
      && inviteJoinProbe.calls.some(call => call.method === 'joinInvite' && call.inviteCode === 'TDAB12' && call.options?.loadout?.deck?.length === 20)
      && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket/.test(JSON.stringify(inviteJoinProbe.calls)),
    JSON.stringify(inviteJoinProbe),
  );

  await page.evaluate(async () => {
    window.__livePvpFriendlyAccepted = false;
    window.PVPService.live.getCurrentMatch = async () => {
      window.__livePvpAuditCalls.push({ method: 'getCurrentMatch', rematchAccepted: !!window.__livePvpFriendlyAccepted });
      if (window.__livePvpFriendlyAccepted) {
        return {
          success: true,
          matchId: 'pvplm-browser-friendly',
          seatId: 'B',
          stateView: window.__makeLivePvpAuditFriendlyView(),
        };
      }
      return {
        success: true,
        matchId: 'pvplm-browser-live',
        seatId: 'A',
        stateView: window.__makeLivePvpAuditStateView(5, 'A', 'finished'),
      };
    };
    window.game.showScreen('pvp-screen');
    window.PVPScene.switchTab('live');
    window.PVPScene.liveSession = null;
    await window.PVPScene.loadLivePanel();
  });
  await page.waitForTimeout(100);
  await page.click('[data-live-post-review-action="friendly_rematch"]', { timeout: 5000, force: true });
  await page.waitForTimeout(120);
  const friendlyRematchProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    hint: document.querySelector('[data-live-last-error]')?.textContent || '',
    friendlyText: document.querySelector('[data-live-friendly-series]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    snapshot: window.PVPScene.getLiveSnapshot()?.friendlySeries || null,
    actionDisabled: Object.fromEntries(Array.from(document.querySelectorAll('[data-live-post-review-action]')).map(button => [button.getAttribute('data-live-post-review-action'), button.disabled])),
    recommendationLocked: document.querySelector('[data-live-loadout-recommendation]')?.getAttribute('data-live-loadout-recommendation-locked') || '',
    recommendationActionDisabled: document.querySelector('[data-live-loadout-recommendation-action="apply"]')?.disabled ?? null,
    recommendationActionText: document.querySelector('[data-live-loadout-recommendation-action="apply"]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    calls: window.__livePvpAuditCalls,
  }));
  add(
    'live UI post-match friendly rematch waits for same opponent without legacy settlement',
    friendlyRematchProbe.phase === 'waiting_rematch'
      && /等待本局对手确认/.test(friendlyRematchProbe.hint)
      && /Bo3 第 2 局/.test(friendlyRematchProbe.friendlyText)
      && /甲 1 : 0 乙/.test(friendlyRematchProbe.friendlyText)
      && /不写正式积分/.test(friendlyRematchProbe.friendlyText)
      && !visibleProtocolPattern.test(friendlyRematchProbe.friendlyText)
      && friendlyRematchProbe.snapshot?.reportVersion === 'pvp-live-friendly-series-v1'
      && friendlyRematchProbe.snapshot?.sourceMatchId === 'pvplm-browser-live'
      && friendlyRematchProbe.snapshot?.targetWins === 2
      && friendlyRematchProbe.snapshot?.scoreBySourceSeat?.A === 1
      && friendlyRematchProbe.snapshot?.scoreBySourceSeat?.B === 0
      && friendlyRematchProbe.snapshot?.rankedImpact === 'none'
      && friendlyRematchProbe.actionDisabled?.friendly_rematch === true
      && friendlyRematchProbe.actionDisabled?.queue_again === true
      && friendlyRematchProbe.actionDisabled?.practice === true
      && friendlyRematchProbe.recommendationLocked === 'true'
      && friendlyRematchProbe.recommendationActionDisabled === true
      && /锁谱/.test(friendlyRematchProbe.recommendationActionText)
      && friendlyRematchProbe.calls.some(call => call.method === 'requestRematch')
      && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket/.test(JSON.stringify(friendlyRematchProbe.calls)),
    JSON.stringify(friendlyRematchProbe),
  );
  await page.waitForTimeout(2800);
  const friendlyRecoveryProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    matchId: document.querySelector('[data-live-match-id]')?.textContent || '',
    summary: document.querySelector('[data-live-summary]')?.textContent || '',
    hint: document.querySelector('[data-live-last-error]')?.textContent || '',
    snapshot: window.PVPScene.getLiveSnapshot()?.friendlySeries || null,
    calls: window.__livePvpAuditCalls,
  }));
  add(
    'live UI waiting friendly rematch auto-enters accepted friendly setup for the requester',
    friendlyRecoveryProbe.phase === 'setup'
      && /pvplm-browser-friendly/.test(friendlyRecoveryProbe.matchId)
      && /友谊再战/.test(friendlyRecoveryProbe.summary)
      && friendlyRecoveryProbe.snapshot?.rankedImpact === 'none'
      && friendlyRecoveryProbe.snapshot?.scoreBySourceSeat?.A === 1
      && friendlyRecoveryProbe.snapshot?.scoreBySourceSeat?.B === 0
      && friendlyRecoveryProbe.snapshot?.status === 'matched'
      && friendlyRecoveryProbe.snapshot?.openerPolicy === 'friendly_series_rotating_opener'
      && friendlyRecoveryProbe.snapshot?.openingFirstSourceSeat === 'A'
      && friendlyRecoveryProbe.snapshot?.roundFirstSourceSeat === 'B'
      && (friendlyRecoveryProbe.snapshot?.safeguards || []).includes('alternating_opener')
      && !/userId|rating|elo|loadoutSnapshot/i.test(JSON.stringify(friendlyRecoveryProbe.snapshot || {}))
      && friendlyRecoveryProbe.calls.some(call => call.method === 'getCurrentMatch' && call.rematchAccepted === true)
      && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket/.test(JSON.stringify(friendlyRecoveryProbe.calls)),
    JSON.stringify(friendlyRecoveryProbe),
  );

  await page.evaluate(async () => {
    window.__livePvpAuditCalls.push({ method: 'reset-rematch-cancel-probe' });
    window.PVPService.live.getCurrentMatch = async () => {
      window.__livePvpAuditCalls.push({ method: 'getCurrentMatch', rematchCancelProbe: true });
      return {
        success: true,
        matchId: 'pvplm-browser-live',
        seatId: 'A',
        stateView: window.__makeLivePvpAuditStateView(5, 'A', 'finished'),
      };
    };
    window.PVPService.live.requestRematch = async (matchId, options = {}) => {
      window.__livePvpAuditCalls.push({ method: 'requestRematch', matchId, options, cancelProbe: true });
      return {
        success: true,
        status: 'waiting_rematch',
        friendlySeries: {
          ...window.__makeLivePvpAuditFriendlySeries('waiting_rematch', 1),
          sourceMatchId: matchId,
          originMatchId: matchId,
        },
      };
    };
    window.PVPService.live.getRematchStatus = async (matchId) => {
      window.__livePvpAuditCalls.push({ method: 'getRematchStatus', matchId, cancelProbe: true });
      return {
        success: true,
        status: 'waiting_rematch',
        friendlySeries: {
          ...window.__makeLivePvpAuditFriendlySeries('waiting_rematch', 1),
          sourceMatchId: matchId,
          originMatchId: matchId,
        },
      };
    };
    window.PVPService.live.cancelRematch = async (matchId) => {
      window.__livePvpAuditCalls.push({ method: 'cancelRematch', matchId, cancelProbe: true });
      return {
        success: true,
        status: 'cancelled',
        reason: 'rematch_cancelled',
        message: '已取消低压力再战等待；本局复盘保留，不写正式积分。',
        friendlySeries: {
          ...window.__makeLivePvpAuditFriendlySeries('cancelled', 1),
          sourceMatchId: matchId,
          originMatchId: matchId,
        },
      };
    };
    window.game.showScreen('pvp-screen');
    window.PVPScene.switchTab('live');
    window.PVPScene.liveSession = null;
    await window.PVPScene.loadLivePanel();
  });
  await page.waitForTimeout(100);
  await page.click('[data-live-post-review-action="friendly_rematch"]', { timeout: 5000, force: true });
  await page.waitForTimeout(120);
  const friendlyCancelWaitProbe = await page.evaluate(() => {
    const series = document.querySelector('[data-live-friendly-series]');
    return {
      phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
      status: series?.getAttribute('data-live-friendly-series-status') || '',
      sourceMatch: series?.getAttribute('data-live-friendly-series-source-match') || '',
      confirmationCount: series?.getAttribute('data-live-friendly-series-confirmations') || '',
      cancelVisible: !!document.querySelector('[data-live-action="cancel-rematch"]'),
      hint: document.querySelector('[data-live-last-error]')?.textContent || '',
      calls: window.__livePvpAuditCalls,
    };
  });
  add(
    'live UI waiting friendly rematch exposes requester cancel control',
    friendlyCancelWaitProbe.phase === 'waiting_rematch'
      && friendlyCancelWaitProbe.status === 'waiting_rematch'
      && friendlyCancelWaitProbe.sourceMatch === 'pvplm-browser-live'
      && friendlyCancelWaitProbe.confirmationCount === '1'
      && friendlyCancelWaitProbe.cancelVisible === true
      && /等待本局对手确认/.test(friendlyCancelWaitProbe.hint),
    JSON.stringify(friendlyCancelWaitProbe),
  );
  await page.click('[data-live-action="cancel-rematch"]', { timeout: 5000, force: true });
  await page.waitForTimeout(120);
  const friendlyCancelProbe = await page.evaluate(() => {
    const series = document.querySelector('[data-live-friendly-series]');
    const actions = Object.fromEntries(Array.from(document.querySelectorAll('[data-live-post-review-action]')).map(button => [button.getAttribute('data-live-post-review-action'), button.disabled]));
    return {
      phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
      hint: document.querySelector('[data-live-last-error]')?.textContent || '',
      reviewText: document.querySelector('[data-live-post-match-review]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      status: series?.getAttribute('data-live-friendly-series-status') || '',
      seriesText: series?.textContent?.replace(/\s+/g, ' ').trim() || '',
      cancelVisible: !!document.querySelector('[data-live-action="cancel-rematch"]'),
      actions,
      calls: window.__livePvpAuditCalls,
    };
  });
  add(
    'live UI waiting friendly rematch requester can cancel and restores finished review',
    friendlyCancelProbe.phase === 'finished'
      && /rematch_cancelled|已取消低压力再战/.test(friendlyCancelProbe.hint)
      && /首胜复盘|首败复盘|复盘/.test(friendlyCancelProbe.reviewText)
      && friendlyCancelProbe.status === 'cancelled'
      && /等待已取消/.test(friendlyCancelProbe.seriesText)
      && !/系列进行中/.test(friendlyCancelProbe.seriesText)
      && friendlyCancelProbe.cancelVisible === false
      && friendlyCancelProbe.actions?.friendly_rematch === false
      && friendlyCancelProbe.actions?.queue_again === false
      && friendlyCancelProbe.calls.some(call => call.method === 'cancelRematch' && call.cancelProbe === true)
      && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket/.test(JSON.stringify(friendlyCancelProbe.calls)),
    JSON.stringify(friendlyCancelProbe),
  );

  await page.evaluate(async () => {
    window.__livePvpFriendlyDeciderAccepted = false;
    window.PVPService.live.getCurrentMatch = async () => {
      window.__livePvpAuditCalls.push({ method: 'getCurrentMatch', deciderAccepted: !!window.__livePvpFriendlyDeciderAccepted });
      if (window.__livePvpFriendlyDeciderAccepted) {
        return {
          success: true,
          matchId: 'pvplm-browser-friendly-decider',
          seatId: 'A',
          stateView: window.__makeLivePvpAuditFriendlyDeciderView(),
        };
      }
      return {
        success: true,
        matchId: 'pvplm-browser-friendly',
        seatId: 'B',
        stateView: window.__makeLivePvpAuditFriendlyFinishedView(),
      };
    };
    window.PVPService.live.requestRematch = async (matchId, options = {}) => {
      window.__livePvpAuditCalls.push({ method: 'requestRematch', matchId, options, decider: true });
      window.__livePvpFriendlyDeciderAccepted = true;
      return {
        success: true,
        status: 'waiting_rematch',
        friendlySeries: {
          ...window.__makeLivePvpAuditFriendlyDeciderView().friendlySeries,
          status: 'waiting_rematch',
          confirmationCount: 1,
        },
      };
    };
    window.game.showScreen('pvp-screen');
    window.PVPScene.switchTab('live');
    window.PVPScene.liveSession = null;
    await window.PVPScene.loadLivePanel();
  });
  await page.waitForTimeout(100);
  const friendlyDeciderCtaProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    friendlyText: document.querySelector('[data-live-friendly-series]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    actionIds: Array.from(document.querySelectorAll('[data-live-post-review-action]')).map(button => button.getAttribute('data-live-post-review-action')),
    snapshot: window.PVPScene.getLiveSnapshot()?.friendlySeries || null,
  }));
  await page.click('[data-live-post-review-action="friendly_rematch"]', { timeout: 5000, force: true });
  await page.waitForTimeout(2800);
  const friendlyDeciderRecoveryProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    matchId: document.querySelector('[data-live-match-id]')?.textContent || '',
    summary: document.querySelector('[data-live-summary]')?.textContent || '',
    friendlyText: document.querySelector('[data-live-friendly-series]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    snapshot: window.PVPScene.getLiveSnapshot()?.friendlySeries || null,
    calls: window.__livePvpAuditCalls,
  }));
  add(
    'live UI Bo3 tied friendly review exposes decider and auto-enters G3 with same series id',
    friendlyDeciderCtaProbe.phase === 'finished'
      && /甲 1 : 1 乙/.test(friendlyDeciderCtaProbe.friendlyText)
      && friendlyDeciderCtaProbe.snapshot?.canRequestNextRound === true
      && friendlyDeciderCtaProbe.actionIds.includes('friendly_rematch')
      && friendlyDeciderRecoveryProbe.phase === 'setup'
      && /pvplm-browser-friendly-decider/.test(friendlyDeciderRecoveryProbe.matchId)
      && /Bo3 决胜局/.test(friendlyDeciderRecoveryProbe.friendlyText)
      && friendlyDeciderRecoveryProbe.snapshot?.seriesId === friendlyDeciderCtaProbe.snapshot?.seriesId
      && friendlyDeciderRecoveryProbe.snapshot?.roundIndex === 3
      && friendlyDeciderRecoveryProbe.snapshot?.scoreBySourceSeat?.A === 1
      && friendlyDeciderRecoveryProbe.snapshot?.scoreBySourceSeat?.B === 1
      && friendlyDeciderRecoveryProbe.snapshot?.openerPolicy === 'friendly_series_rotating_opener'
      && friendlyDeciderRecoveryProbe.snapshot?.openingFirstSourceSeat === 'A'
      && friendlyDeciderRecoveryProbe.snapshot?.roundFirstSourceSeat === 'A'
      && (friendlyDeciderRecoveryProbe.snapshot?.safeguards || []).includes('alternating_opener')
      && !/userId|rating|elo|loadoutSnapshot/i.test(JSON.stringify(friendlyDeciderRecoveryProbe.snapshot || {}))
      && friendlyDeciderRecoveryProbe.calls.some(call => call.method === 'requestRematch' && call.decider === true)
      && friendlyDeciderRecoveryProbe.calls.some(call => call.method === 'getCurrentMatch' && call.deciderAccepted === true)
      && !/findOpponent|reportMatchResult|GhostEnemy|startPVPBattle|didWin|matchTicket/.test(JSON.stringify(friendlyDeciderRecoveryProbe.calls)),
    JSON.stringify({ friendlyDeciderCtaProbe, friendlyDeciderRecoveryProbe }),
  );

  await page.evaluate(async () => {
    window.PVPService.live.getCurrentMatch = async () => ({
      success: true,
      matchId: 'pvplm-browser-friendly-decider',
      seatId: 'B',
      stateView: window.__makeLivePvpAuditFriendlyCompleteView(),
    });
    window.game.showScreen('pvp-screen');
    window.PVPScene.switchTab('live');
    window.PVPScene.liveSession = null;
    await window.PVPScene.loadLivePanel();
  });
  await page.waitForTimeout(100);
  const friendlyCompleteProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    friendlyText: document.querySelector('[data-live-friendly-series]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    actionIds: Array.from(document.querySelectorAll('[data-live-post-review-action]')).map(button => button.getAttribute('data-live-post-review-action')),
    snapshot: window.PVPScene.getLiveSnapshot()?.friendlySeries || null,
  }));
  add(
    'live UI completed Bo3 hides friendly rematch after source seat reaches two wins',
    friendlyCompleteProbe.phase === 'finished'
      && /甲 2 : 1 乙/.test(friendlyCompleteProbe.friendlyText)
      && /系列结束/.test(friendlyCompleteProbe.friendlyText)
      && friendlyCompleteProbe.snapshot?.seriesStatus === 'complete'
      && friendlyCompleteProbe.snapshot?.winnerSourceSeat === 'A'
      && friendlyCompleteProbe.snapshot?.openerPolicy === 'friendly_series_rotating_opener'
      && friendlyCompleteProbe.snapshot?.roundFirstSourceSeat === 'A'
      && friendlyCompleteProbe.snapshot?.canRequestNextRound === false
      && !/userId|rating|elo|loadoutSnapshot/i.test(JSON.stringify(friendlyCompleteProbe.snapshot || {}))
      && !friendlyCompleteProbe.actionIds.includes('friendly_rematch')
      && friendlyCompleteProbe.actionIds.includes('queue_again'),
    JSON.stringify(friendlyCompleteProbe),
  );

  add(
    'live UI should not call legacy PVP matching or settlement',
    !consoleErrors.some((line) => /legacy PVP matching/.test(line)),
    JSON.stringify(consoleErrors),
  );

  await page.evaluate(async () => {
    const invalidatedView = {
      matchId: 'pvplm-browser-invalidated',
      ruleVersion: 'pvp-live-v1',
      status: 'invalidated',
      phase: 'invalidated',
      firstMatchGuide: {
        reportVersion: 'pvp-live-first-match-guide-v1',
        title: '首战简报',
        summary: '先确认斗法谱，再调息准备。',
        nextAction: '本局未开战成功，不计正式积分，可重新匹配。',
        safeguards: ['snapshot_locked', 'setup_ready_required', 'opening_protection', 'invalidated_no_score'],
        steps: [
          { id: 'setup_ready', label: '调息', detail: '准备阶段可调息 0-2 张手牌。' },
          { id: 'invalidated_no_score', label: '无效局', detail: '准备超时会成为无效局，不写正式积分。' },
        ],
        recommendedLoadouts: [
          { id: 'balanced', label: '默认斗法谱', role: '攻防均衡，适合首战熟悉流程。', weakness: '弱点：缺少极限爆发。' },
          { id: 'sword', label: '破阵斗法谱', role: '更容易制造压力，适合主动试探。', weakness: '弱点：防守窗口较窄。' },
          { id: 'shield', label: '守势斗法谱', role: '前两手更稳，适合先观察对方节奏。', weakness: '弱点：收束较慢。' },
        ],
        exceptionBranches: [{ id: 'ready_timeout', label: '准备超时', detail: '本局未开战成功，不写正式积分。' }],
        reviewActions: [{ id: 'queue_again', label: '继续真人排位' }],
      },
      setup: null,
      openingSafeguardReport: {
        reportVersion: 'pvp-live-opening-safeguard-v1',
        status: 'closed',
        currentSeat: 'A',
        viewerSeat: 'A',
        firstSeat: 'A',
        secondSeat: 'B',
        damageBudget: {
          firstSeat: 18,
          secondSeat: 22,
          secondAction: 28,
          currentSeat: 'A',
          currentActionBudget: null,
        },
        openingProtection: {
          minimumHp: 1,
          protectedSeats: [],
          active: false,
          summary: '未完成首个回合的席位不会被开局伤害直接终结。',
        },
        secondSeatBuffer: {
          block: 3,
          seatId: 'B',
          active: false,
          summary: '后手开局获得 3 点公开护盾，抵消先动节奏差。',
        },
        counterplay: {
          block: 8,
          pendingSeats: [],
          grantedSeats: [],
          summary: '护体后反打缓冲会在受保护方首个行动窗口发放。',
        },
        sourceVisibility: 'public_state',
        usesHiddenInformation: false,
        rankedImpact: 'none',
      },
      duelMomentumReport: {
        reportVersion: 'pvp-live-duel-momentum-v1',
        sourceVisibility: 'public_state',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        viewerSeat: 'A',
        opponentSeat: 'B',
        currentSeat: 'A',
        isViewerTurn: false,
        viewerHpPct: 100,
        opponentHpPct: 100,
        hpDelta: 0,
        pressureState: 'invalidated',
        pressureLabel: '无效局',
        agencyLabel: '无效局',
        summaryLine: '局势：无效局，本局未开战成功，不计正式积分。',
        counterplayLine: '行动窗口：无效局不计正式积分，不产生先手击杀或奖励。',
        safeguards: ['invalidated_no_score'],
      },
      stateVersion: 9,
      roundIndex: 1,
      turnIndex: 1,
      currentSeat: 'A',
      self: {
        seatId: 'A',
        displayName: '甲',
        hp: 50,
        maxHp: 50,
        energy: 3,
        maxEnergy: 3,
        block: 0,
        ready: false,
        mulliganUsed: false,
        hand: [],
      },
      opponent: {
        seatId: 'B',
        displayName: '乙',
        hp: 50,
        maxHp: 50,
        energy: 3,
        maxEnergy: 3,
        block: 0,
        handCount: 3,
        ready: false,
      },
      recentEvents: [{ eventType: 'match_invalidated', publicData: { reason: 'ready_timeout' } }],
    };
    window.PVPService.live.getCurrentMatch = async () => ({
      success: true,
      matchId: invalidatedView.matchId,
      seatId: 'A',
      stateView: invalidatedView,
    });
    if (window.PVPScene) {
      window.PVPScene.liveSession = null;
      window.PVPScene.liveMulliganSelection?.clear?.();
      await window.PVPScene.loadLivePanel();
    }
  });
  await page.waitForTimeout(200);
  const invalidatedProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    label: document.querySelector('[data-live-phase-label]')?.textContent || '',
    chip: document.querySelector('[data-live-status-chip]')?.textContent || '',
    summary: document.querySelector('[data-live-summary]')?.textContent || '',
    hint: document.querySelector('[data-live-last-error]')?.textContent || '',
    firstGuide: document.querySelector('[data-live-first-guide]')?.textContent || '',
    events: document.querySelector('[data-live-event-log]')?.textContent || '',
    postReviewHidden: document.querySelector('[data-live-post-match-review]')?.hidden ?? false,
    postReviewText: document.querySelector('[data-live-post-match-review]')?.textContent || '',
    buttons: Object.fromEntries(Array.from(document.querySelectorAll('[data-live-action]')).map(button => [button.getAttribute('data-live-action'), button.disabled])),
    payload: JSON.parse(window.render_game_to_text()).pvp?.live || null,
  }));
  add(
    'live UI renders ready_timeout invalidated as no-score terminal state',
    invalidatedProbe.phase === 'invalidated'
      && /无效局/.test(invalidatedProbe.label)
      && /VOID/.test(invalidatedProbe.chip)
      && /不计正式积分/.test(`${invalidatedProbe.summary} ${invalidatedProbe.hint}`)
      && /不计正式积分/.test(invalidatedProbe.firstGuide)
      && /无效局/.test(invalidatedProbe.events)
      && /准备超时/.test(invalidatedProbe.events)
      && !visibleProtocolPattern.test(invalidatedProbe.events)
      && invalidatedProbe.postReviewHidden === true
      && !invalidatedProbe.payload?.postMatchReview
      && invalidatedProbe.buttons['join-queue'] === false
      && invalidatedProbe.buttons['refresh-match'] === true
      && invalidatedProbe.buttons.surrender === true
      && invalidatedProbe.buttons['end-turn'] === true
      && invalidatedProbe.payload?.phase === 'invalidated'
      && invalidatedProbe.payload?.openingSafeguardReport?.status === 'closed'
      && invalidatedProbe.payload?.duelMomentumReport?.pressureState === 'invalidated'
      && /不计正式积分/.test(invalidatedProbe.payload?.duelMomentumReport?.counterplayLine || ''),
    JSON.stringify(invalidatedProbe),
  );

  await page.evaluate(async () => {
    const connectionTimeoutView = {
      matchId: 'pvplm-browser-connection-timeout',
      ruleVersion: 'pvp-live-v1',
      status: 'finished',
      phase: 'finished',
      stateVersion: 12,
      roundIndex: 1,
      turnIndex: 1,
      currentSeat: 'A',
      postMatchReview: {
        reportVersion: 'pvp-live-post-match-review-v1',
        audience: 'seat',
        title: '首败复盘 MVP',
        result: 'loss',
        winnerSeat: 'B',
        loserSeat: 'A',
        finishReason: 'connection_timeout',
        summary: '本局因你的连接超时结束；下局前先确认网络或前后台状态。',
        evidence: [
          { eventType: 'player_ready', sequence: 1, actingSeat: 'A', publicData: { seatId: 'A' } },
          { eventType: 'player_ready', sequence: 2, actingSeat: 'B', publicData: { seatId: 'B' } },
          { eventType: 'battle_started', sequence: 3, actingSeat: 'B', publicData: { firstSeat: 'A' } },
          { eventType: 'turn_timeout', sequence: 4, actingSeat: 'A', publicData: { seatId: 'A', loserSeat: 'A', winnerSeat: 'B', finishReason: 'connection_timeout' } },
          { eventType: 'match_finished', sequence: 5, actingSeat: 'A', publicData: { winnerSeat: 'B', loserSeat: 'A', finishReason: 'connection_timeout' } },
        ],
        keyTurnReplay: {
          reportVersion: 'pvp-live-key-turn-replay-v1',
          sourceVisibility: 'public_events',
          usesHiddenInformation: false,
          rankedImpact: 'none',
          turns: [
            { id: 'terminal_window', label: '终局选择', sequence: 4, eventType: 'turn_timeout', actingSeat: 'A', severity: 'terminal', lesson: '连接宽限结束说明行动窗口被网络中断占用。' },
          ],
        },
        experienceReport: {
          reportVersion: 'pvp-live-experience-report-v1',
          sourceVisibility: 'public_events',
          usesHiddenInformation: false,
          rankedImpact: 'none',
          nonGameRisk: 'watch',
          nonGameRiskReasons: ['connection_timeout_finish'],
          agencyLabel: '连接中断影响行动窗口',
          decisionWindowCount: 1,
          seatWindowSummary: { firstSeat: 'A', secondSeat: 'B', secondSeatWindowObserved: false, terminalBeforeSecondSeatWindow: true },
          safeguardSummary: { setupReady: 'confirmed', firstActionBudget: 'not_observable', openingProtection: 'not_observable' },
          summary: '连接超时来自公开事件，不读取隐藏手牌。',
          recommendedAction: 'queue_again',
          fairnessChecks: [],
        },
        suggestions: [
          '如果需要切后台，优先在行动前完成低风险动作或结束回合。',
          '复查连接超时前的公开事件，确认是否还有可恢复的防守或结束回合选择。',
        ],
        nextActions: [
          { id: 'review_events', label: '查看权威事件', detail: '只查看公开事件序列，不暴露隐藏手牌。' },
          { id: 'queue_again', label: '继续真人排位', detail: '带着本局结论重新入队。' },
        ],
      },
      firstMatchGuide: null,
      setup: null,
      self: {
        seatId: 'A',
        displayName: '甲',
        hp: 50,
        maxHp: 50,
        energy: 3,
        maxEnergy: 3,
        block: 0,
        ready: true,
        mulliganUsed: false,
        hand: [],
      },
      opponent: {
        seatId: 'B',
        displayName: '乙',
        hp: 50,
        maxHp: 50,
        energy: 3,
        maxEnergy: 3,
        block: 0,
        handCount: 3,
        ready: true,
      },
      recentEvents: [
        { eventType: 'turn_timeout', actingSeat: 'A', publicData: { seatId: 'A', loserSeat: 'A', winnerSeat: 'B', finishReason: 'connection_timeout' } },
        { eventType: 'match_finished', actingSeat: 'A', publicData: { winnerSeat: 'B', loserSeat: 'A', finishReason: 'connection_timeout' } },
      ],
    };
    window.PVPService.live.getCurrentMatch = async () => ({
      success: true,
      matchId: connectionTimeoutView.matchId,
      seatId: 'A',
      stateView: connectionTimeoutView,
    });
    if (window.PVPScene) {
      window.PVPScene.liveSession = null;
      window.PVPScene.liveMulliganSelection?.clear?.();
      await window.PVPScene.loadLivePanel();
    }
  });
  await page.waitForTimeout(200);
  const connectionTimeoutProbe = await page.evaluate(() => ({
    phase: document.querySelector('[data-live-pvp-root]')?.getAttribute('data-live-phase') || '',
    events: document.querySelector('[data-live-event-log]')?.textContent || '',
    review: document.querySelector('[data-live-post-match-review]')?.textContent || '',
    fairnessReceiptVisible: !!document.querySelector('[data-live-fairness-receipt]'),
    payload: JSON.parse(window.render_game_to_text()).pvp?.live || null,
  }));
  add(
    'live UI renders connection_timeout as reconnect grace terminal review',
    connectionTimeoutProbe.phase === 'finished'
      && /行动超时/.test(connectionTimeoutProbe.events)
      && /重连宽限结束/.test(connectionTimeoutProbe.events)
      && /connection_timeout/.test(JSON.stringify(connectionTimeoutProbe.payload?.postMatchReview || {}))
      && /连接超时|网络|前后台/.test(connectionTimeoutProbe.review)
      && !visibleProtocolPattern.test(`${connectionTimeoutProbe.events} ${connectionTimeoutProbe.review}`)
      && connectionTimeoutProbe.fairnessReceiptVisible === false
      && connectionTimeoutProbe.payload?.postMatchReview?.finishReason === 'connection_timeout',
    JSON.stringify(connectionTimeoutProbe),
  );

  const mobilePage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  mobilePage.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  mobilePage.on('pageerror', (err) => {
    consoleErrors.push(String(err));
  });
  await mobilePage.goto(url, { waitUntil: 'domcontentloaded' });
  await mobilePage.waitForTimeout(1200);
  const mobileAuthActive = await mobilePage.evaluate(() => !!document.getElementById('auth-modal')?.classList.contains('active'));
  if (mobileAuthActive) {
    await mobilePage.click('#auth-modal .modal-close', { timeout: 3000, force: true }).catch(() => {});
    await mobilePage.waitForTimeout(200);
  }
  await mobilePage.evaluate(() => {
    window.__livePvpMobileAuditCalls = [];
    const push = (entry) => window.__livePvpMobileAuditCalls.push(entry);
    const selfLoadoutSummary = {
      loadoutHash: 'hash-mobile-self-balanced',
      label: '默认斗法谱',
      identitySlot: 'balanced',
      deckSize: 20,
      locked: true,
    };
    const opponentPublicProfile = {
      reportVersion: 'pvp-live-ranked-opponent-profile-v1',
      sourceVisibility: 'ranked_public_boundary',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      alias: '对手',
      archetypeLabel: '流派待观察',
      divisionBucket: 'unrated_mvp',
      revealPolicy: 'no_precombat_build_reveal',
      boundaryLine: '排位只展示公开状态，不展示对手斗法谱、hash 或身份槽。',
    };
    const firstMatchGuide = {
      reportVersion: 'pvp-live-first-match-guide-v1',
      title: '首战简报',
      summary: '先确认斗法谱，再调息准备。',
      nextAction: '先调息手牌，确认准备后再开战。',
      safeguards: ['snapshot_locked', 'setup_ready_required', 'opening_protection'],
      steps: [
        { id: 'setup_ready', label: '调息', detail: '准备阶段可调息 0-2 张手牌。' },
        { id: 'opening_protection', label: '护体', detail: '未行动方不会被开局伤害直接终结。' },
      ],
      exceptionBranches: [
        { id: 'no_real_player_120s', label: '120 秒无真人', detail: '可以继续等待，也可以取消匹配；不会自动切到残影。' },
        { id: 'wide_match', label: '宽跨度匹配', detail: '只有双方都确认，才会放宽匹配跨度。' },
        { id: 'disconnect_grace', label: '匹配后断线', detail: '先进入重连宽限，不会立即判负。' },
        { id: 'ready_timeout', label: '准备超时', detail: '本局未开战成功，不写正式积分。' },
        { id: 'refresh_required', label: '需要同步', detail: '刷新权威局面后再继续行动。' },
      ],
      reviewActions: [
        { id: 'review_events', label: '查看权威事件' },
        { id: 'queue_again', label: '继续真人排位' },
      ],
    };
    const makeStateView = (stateVersion = 1, currentSeat = 'B', status = 'setup') => ({
      matchId: 'pvplm-browser-live-mobile',
      ruleVersion: 'pvp-live-v1',
      status,
      matchQuality: {
        reportVersion: 'pvp-live-match-quality-v1',
        tag: 'good',
        ruleVersion: 'pvp-live-v1',
        expansionStage: 'mvp_open_pool',
        ratingDeltaBucket: 'unrated_mvp',
        waitMs: { A: 0, B: 4100 },
        candidatePoolSize: 2,
        safeguards: ['server_authoritative', 'snapshot_locked', 'setup_ready_required'],
      },
      firstMatchGuide,
      setup: status === 'setup' ? { readyDeadlineAt: Date.now() + 45000, mulliganLimit: 2 } : null,
      connectionReport: {
        reportVersion: 'pvp-live-connection-v1',
        connectionHealth: 'opponent_grace',
        viewerSeat: 'B',
        opponentSeat: 'A',
        heartbeatIntervalMs: 5000,
        heartbeatStaleMs: 15000,
        graceMs: 30000,
        viewer: {
          seatId: 'B',
          status: 'online',
          isViewer: true,
          lastHeartbeatAt: Date.now(),
          elapsedMs: 0,
          remainingGraceMs: 0,
        },
        opponent: {
          seatId: 'A',
          status: 'grace',
          isViewer: false,
          lastHeartbeatAt: Date.now() - 16000,
          elapsedMs: 16000,
          remainingGraceMs: 18000,
        },
      },
      stateVersion,
      roundIndex: 1,
      turnIndex: stateVersion,
      currentSeat,
      self: {
        seatId: 'B',
        loadoutHash: selfLoadoutSummary.loadoutHash,
        loadoutSummary: selfLoadoutSummary,
        loadoutSnapshot: {
          ...selfLoadoutSummary,
          deck: Array.from({ length: 20 }, (_, index) => ({ id: index % 2 ? 'pvp_strike' : 'pvp_guard', upgraded: false })),
        },
        hp: 50,
        maxHp: 50,
        energy: 3,
        maxEnergy: 3,
        block: 0,
        ready: status === 'active',
        mulliganUsed: stateVersion > 1,
        hand: [{ instanceId: 'B-strike-1', cardId: 'pvp_strike', name: '试探斩', cost: 1, damage: 8, block: 0 }],
      },
      opponent: {
        seatId: 'A',
        hp: 50,
        maxHp: 50,
        energy: 3,
        maxEnergy: 3,
        block: 0,
        handCount: 3,
        deckCount: 12,
        discardCount: 0,
        ready: status === 'active',
        publicProfile: opponentPublicProfile,
      },
      recentEvents: [{ eventType: 'snapshot_locked', publicData: { ruleVersion: 'pvp-live-v1', snapshotPolicy: 'server_locked_hidden_until_self_view', seatCount: 2 } }],
    });
    window.__makeLivePvpMobileAuditStateView = makeStateView;
    window.PVPService.findOpponent = async () => {
      throw new Error('live UI should not call legacy PVP matching or settlement');
    };
    window.PVPService.reportMatchResult = async () => {
      throw new Error('live UI should not call legacy PVP matching or settlement');
    };
    window.PVPService.live = {
      connectRealtime: (handlers = {}) => {
        window.setTimeout(() => {
          handlers.onOpen?.();
          handlers.onMessage?.({
            type: 'connected',
            connectionId: 'audit-live-mobile-ws-1',
            connectionReport: {
              connectionId: 'audit-live-mobile-ws-1',
              heartbeatIntervalMs: 5000,
            },
          });
        }, 0);
        return {
          send: (payload = {}) => payload.type !== 'intent',
          close: () => true,
        };
      },
      joinQueue: async (options = {}) => {
        push({ method: 'joinQueue', options });
        return { success: true, status: 'waiting', queueTicket: 'pvplq-browser-live-mobile' };
      },
      measureConnectionHealth: async () => ({
        reportVersion: 'pvp-live-queue-connection-health-v1',
        status: 'pass',
        sampleTag: 'client_preflight',
        sampleWindowMs: 1,
        missedHeartbeatCount: 0,
        reconnectCount: 0,
        rttP95Ms: 22,
      }),
      cancelQueue: async (queueTicket) => {
        push({ method: 'cancelQueue', queueTicket });
        return { success: true, status: 'cancelled', queueTicket };
      },
      getQueueStatus: async (queueTicket) => ({
        success: true,
        status: 'matched',
        matchId: 'pvplm-browser-live-mobile',
        seatId: 'B',
        stateView: makeStateView(1, 'B', 'setup'),
      }),
      getMatch: async (matchId) => ({ success: true, matchId, seatId: 'B', stateView: makeStateView(1, 'B', 'setup') }),
      submitIntent: async (matchId, intent) => {
        push({ method: 'submitIntent', matchId, intent });
        const isMulligan = intent.intentType === 'mulligan';
        const isReady = intent.intentType === 'ready';
        const isPlayCard = intent.intentType === 'play_card';
        return {
          success: true,
          result: 'accepted',
          events: isPlayCard ? [
            {
              eventType: 'opening_protection_triggered',
              actingSeat: 'B',
              payload: {
                protectedSeat: 'A',
                minimumHp: 1,
                preventedDamage: 6,
              },
            },
          ] : [{ eventType: intent.intentType }],
          stateView: makeStateView(isReady ? 3 : isMulligan ? 2 : 4, isReady || isMulligan ? 'B' : 'A', isMulligan ? 'setup' : 'active'),
        };
      },
    };
    if (window.PVPScene) {
      window.PVPScene.liveSession = null;
    }
  });
  await mobilePage.click('#pvp-btn', { timeout: 5000, force: true });
  await mobilePage.waitForTimeout(400);
  const mobileDefaultEntryProbe = await mobilePage.evaluate(() => ({
    activeTab: JSON.parse(window.render_game_to_text()).pvp?.activeTab || '',
    liveTabActive: !!document.querySelector('[data-pvp-tab="live"]')?.classList.contains('active'),
    rankingTabActive: !!document.querySelector('[data-pvp-tab="ranking"]')?.classList.contains('active'),
    livePaneActive: !!document.getElementById('tab-live')?.classList.contains('active'),
    rankingPaneActive: !!document.getElementById('tab-ranking')?.classList.contains('active'),
    boundaryText: document.querySelector('[data-live-mode-boundary]')?.textContent || '',
    joinVisible: (() => {
      const button = document.querySelector('[data-live-action="join-queue"]');
      if (!button) return false;
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })(),
  }));
  add(
    'pvp screen opens on live ranked entry by default on mobile',
    mobileDefaultEntryProbe.activeTab === 'live'
      && mobileDefaultEntryProbe.liveTabActive
      && mobileDefaultEntryProbe.livePaneActive
      && !mobileDefaultEntryProbe.rankingTabActive
      && !mobileDefaultEntryProbe.rankingPaneActive
      && /真人排位/.test(mobileDefaultEntryProbe.boundaryText)
      && /问道练习/.test(mobileDefaultEntryProbe.boundaryText)
      && /好友约战/.test(mobileDefaultEntryProbe.boundaryText)
      && /镜像演武/.test(mobileDefaultEntryProbe.boundaryText)
      && /不是真人排位/.test(mobileDefaultEntryProbe.boundaryText)
      && mobileDefaultEntryProbe.joinVisible,
    JSON.stringify(mobileDefaultEntryProbe),
  );
  await mobilePage.click('[data-pvp-tab="live"]', { timeout: 5000, force: true });
  await mobilePage.waitForSelector('[data-live-loadout-preset="shield"]', { timeout: 5000 });
  await mobilePage.click('[data-live-loadout-preset="shield"]', { timeout: 5000, force: true });
  await mobilePage.click('[data-live-action="join-queue"]', { timeout: 5000, force: true });
  await mobilePage.waitForTimeout(100);
  await mobilePage.click('[data-live-action="refresh-match"]', { timeout: 5000, force: true });
  await mobilePage.waitForTimeout(250);
  const mobileConnectionProbe = await mobilePage.evaluate(() => {
    const node = document.querySelector('[data-live-connection-status]');
    const style = node ? window.getComputedStyle(node) : null;
    const rect = node?.getBoundingClientRect();
    return {
      text: node?.textContent || '',
      whiteSpace: style?.whiteSpace || '',
      overflow: style?.overflow || '',
      rect: rect ? {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      } : null,
      viewportWidth: window.innerWidth,
    };
  });
  add(
    'live UI mobile keeps reconnect grace text readable',
    /对方重连宽限/.test(mobileConnectionProbe.text)
      && /不会立即判负/.test(mobileConnectionProbe.text)
      && mobileConnectionProbe.whiteSpace !== 'nowrap'
      && mobileConnectionProbe.overflow !== 'hidden'
      && mobileConnectionProbe.rect?.left >= -1
      && mobileConnectionProbe.rect?.right <= mobileConnectionProbe.viewportWidth + 2,
    JSON.stringify(mobileConnectionProbe),
  );
  const mobileFirstGuideProbe = await mobilePage.evaluate(() => {
    const node = document.querySelector('[data-live-first-guide]');
    const style = node ? window.getComputedStyle(node) : null;
    const rect = node?.getBoundingClientRect();
    return {
      text: node?.textContent?.replace(/\s+/g, ' ').trim() || '',
      overflow: style?.overflow || '',
      maxHeight: style?.maxHeight || '',
      clientHeight: node ? Math.round(node.clientHeight) : 0,
      scrollHeight: node ? Math.round(node.scrollHeight) : 0,
      rect: rect ? {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      } : null,
      viewportWidth: window.innerWidth,
    };
  });
  add(
    'live UI mobile renders first-match guide without clipping exception or review actions',
    /准备超时/.test(mobileFirstGuideProbe.text)
      && /需要同步/.test(mobileFirstGuideProbe.text)
      && /查看权威事件/.test(mobileFirstGuideProbe.text)
      && /继续真人排位/.test(mobileFirstGuideProbe.text)
      && mobileFirstGuideProbe.overflow !== 'hidden'
      && mobileFirstGuideProbe.maxHeight !== '60px'
      && mobileFirstGuideProbe.scrollHeight <= mobileFirstGuideProbe.clientHeight + 2
      && mobileFirstGuideProbe.rect?.left >= -1
      && mobileFirstGuideProbe.rect?.right <= mobileFirstGuideProbe.viewportWidth + 2,
    JSON.stringify(mobileFirstGuideProbe),
  );
  await mobilePage.click('[data-live-mulligan-card]', { timeout: 5000, force: true });
  await mobilePage.click('[data-live-action="confirm-mulligan"]', { timeout: 5000, force: true });
  await mobilePage.waitForTimeout(100);
  await mobilePage.click('[data-live-action="ready"]', { timeout: 5000, force: true });
  await mobilePage.waitForTimeout(100);
  const mobileLiveCardClicked = await mobilePage.evaluate(() => {
    const card = document.querySelector('[data-live-card]');
    if (!card) return false;
    card.click();
    return true;
  });
  if (!mobileLiveCardClicked) throw new Error('expected a playable mobile live card button');
  await mobilePage.waitForTimeout(150);
  const mobileActionProbe = await mobilePage.evaluate(() => {
    const eventPanel = document.querySelector('.pvp-live-event-panel');
    const rect = eventPanel?.getBoundingClientRect();
    return {
      calls: window.__livePvpMobileAuditCalls || [],
      events: document.querySelector('[data-live-event-log]')?.textContent || '',
      viewportWidth: window.innerWidth,
      eventPanel: rect ? {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      } : null,
    };
  });
  add(
    'live UI targets opponent seat for player B',
    mobileActionProbe.calls.some((call) => call.method === 'submitIntent' && call.intent?.payload?.targetSeat === 'A'),
    JSON.stringify(mobileActionProbe),
  );
  add(
    'live UI mobile renders opening protection event without overflow',
    /开局护体触发/.test(mobileActionProbe.events)
      && /护住 A/.test(mobileActionProbe.events)
      && /保底 1 血/.test(mobileActionProbe.events)
      && /挡下 6 点致命伤害/.test(mobileActionProbe.events)
      && mobileActionProbe.eventPanel?.left >= -1
      && mobileActionProbe.eventPanel?.right <= mobileActionProbe.viewportWidth + 2,
    JSON.stringify(mobileActionProbe),
  );
  await mobilePage.evaluate(() => {
    const statusCard = document.querySelector('.pvp-live-status-card');
    const root = document.querySelector('[data-live-pvp-root]');
    if (statusCard && typeof statusCard.scrollIntoView === 'function') {
      statusCard.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
    } else if (root && typeof root.scrollIntoView === 'function') {
      root.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
    } else {
      const screen = document.getElementById('pvp-screen');
      if (root && screen) screen.scrollTo({ top: Math.max(0, root.offsetTop - 22), left: 0, behavior: 'auto' });
    }
  }).catch(() => {});
  await mobilePage.waitForTimeout(100);
  const mobileProbe = await mobilePage.evaluate(() => {
    const toRect = (el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const root = document.querySelector('[data-live-pvp-root]');
    const statusCard = document.querySelector('.pvp-live-status-card');
    const eventPanel = document.querySelector('.pvp-live-event-panel');
    const tabs = Array.from(document.querySelectorAll('.pvp-nav-sidebar .rune-tab'));
    const buttons = Array.from(document.querySelectorAll('.pvp-live-footer [data-live-action]'));
    const pvpScreen = document.getElementById('pvp-screen');
    return {
      phase: root?.getAttribute('data-live-phase') || '',
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      bodyScrollHeight: document.body.scrollHeight,
      screenScrollHeight: pvpScreen?.scrollHeight || 0,
      root: toRect(root),
      statusCard: toRect(statusCard),
      eventPanel: toRect(eventPanel),
      tabs: tabs.map((tab) => toRect(tab)),
      buttons: buttons.map((button) => toRect(button)),
    };
  });
  await mobilePage.evaluate(() => {
    document.querySelector('[data-live-action="surrender"]')?.scrollIntoView({ block: 'end', inline: 'nearest' });
  }).catch(() => {});
  await mobilePage.waitForTimeout(100);
  const mobileBottomProbe = await mobilePage.evaluate(() => {
    const toRect = (el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      buttons: Array.from(document.querySelectorAll('.pvp-live-footer [data-live-action]')).map((button) => toRect(button)),
    };
  });
  add(
    'live UI mobile layout stays inside viewport',
    /matched|active/.test(mobileProbe.phase)
      && mobileProbe.scrollWidth <= mobileProbe.viewportWidth + 2
      && mobileProbe.statusCard?.top >= -1
      && mobileProbe.statusCard?.bottom <= mobileProbe.viewportHeight + 2
      && mobileProbe.statusCard?.height <= mobileProbe.viewportHeight + 2
      && mobileProbe.root?.left >= 0
      && mobileProbe.root?.right <= mobileProbe.viewportWidth + 2
      && mobileProbe.eventPanel?.left >= -1
      && mobileProbe.eventPanel?.right <= mobileProbe.viewportWidth + 2
      && mobileProbe.tabs.every((rect) => rect && rect.left >= -1 && rect.right <= mobileProbe.viewportWidth + 2)
      && mobileBottomProbe.buttons.every((rect) => rect && rect.left >= -1 && rect.right <= mobileBottomProbe.viewportWidth + 2 && rect.bottom <= mobileBottomProbe.viewportHeight + 2 && rect.height >= 34),
    JSON.stringify({ top: mobileProbe, bottom: mobileBottomProbe }),
  );
  await mobilePage.evaluate(async () => {
    const finishedView = {
      ...window.__makeLivePvpMobileAuditStateView(8, 'B', 'finished'),
      status: 'finished',
      postMatchReview: {
        reportVersion: 'pvp-live-post-match-review-v1',
        title: '首败复盘 MVP',
        result: 'loss',
        winnerSeat: 'A',
        loserSeat: 'B',
        finishReason: 'lethal',
        summary: '本局公开轨迹显示血线被压低，下一局先测试守势谱。',
        evidence: [
          { eventType: 'damage_applied', sequence: 6, actingSeat: 'A' },
          { eventType: 'match_finished', sequence: 8, actingSeat: 'A' },
        ],
        loadoutRecommendation: {
          reportVersion: 'pvp-live-loadout-recommendation-v1',
          sourceVisibility: 'public_events_and_public_content',
          usesHiddenInformation: false,
          rankedImpact: 'none',
          recommendedPresetId: 'shield',
          recommendedPresetLabel: '守势斗法谱',
          reasonLine: '本局公开轨迹显示血线被压低，下一局先套用守势斗法谱测试低费防御窗口。',
          practiceLine: '配合问道练习复刻开战与反打窗口。',
          boundaryLine: '一键套用只改下一局入队候选，不自动排队、不写正式积分。',
          evidenceRefs: [
            { eventType: 'damage_applied', sequence: 6, actingSeat: 'A' },
            { eventType: 'match_finished', sequence: 8, actingSeat: 'A' },
          ],
        },
        suggestions: ['先稳住前两手。'],
        nextActions: [
          { id: 'review_events', label: '查看权威事件' },
          { id: 'adjust_loadout', label: '调整斗法谱' },
          { id: 'queue_again', label: '继续真人排位' },
        ],
      },
    };
    window.PVPService.live.getMatch = async () => ({
      success: true,
      matchId: 'pvplm-browser-live-mobile',
      seatId: 'B',
      stateView: finishedView,
    });
    await window.PVPScene.refreshLiveMatch();
    document.querySelector('[data-live-loadout-recommendation]')?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
  });
  await mobilePage.waitForTimeout(100);
  const mobileRecommendationProbe = await mobilePage.evaluate(() => {
    const card = document.querySelector('[data-live-loadout-recommendation]');
    const button = document.querySelector('[data-live-loadout-recommendation-action="apply"]');
    const cardStyle = card ? window.getComputedStyle(card) : null;
    const cardRect = card?.getBoundingClientRect();
    const buttonRect = button?.getBoundingClientRect();
    return {
      text: card?.textContent?.replace(/\s+/g, ' ').trim() || '',
      source: card?.getAttribute('data-live-loadout-recommendation-source') || '',
      hidden: card?.getAttribute('data-live-loadout-recommendation-hidden') || '',
      preset: card?.getAttribute('data-live-loadout-recommendation-preset') || '',
      locked: card?.getAttribute('data-live-loadout-recommendation-locked') || '',
      overflow: cardStyle?.overflow || '',
      overflowWrap: cardStyle?.overflowWrap || '',
      cardScrollWidth: card ? Math.round(card.scrollWidth) : 0,
      cardClientWidth: card ? Math.round(card.clientWidth) : 0,
      cardRect: cardRect ? {
        left: Math.round(cardRect.left),
        right: Math.round(cardRect.right),
        width: Math.round(cardRect.width),
        height: Math.round(cardRect.height),
      } : null,
      buttonDisabled: button?.disabled ?? null,
      buttonRect: buttonRect ? {
        left: Math.round(buttonRect.left),
        right: Math.round(buttonRect.right),
        width: Math.round(buttonRect.width),
        height: Math.round(buttonRect.height),
      } : null,
      viewportWidth: window.innerWidth,
    };
  });
  add(
    'live UI mobile renders post-match loadout recommendation card readably',
    /改谱建议/.test(mobileRecommendationProbe.text)
      && /守势斗法谱/.test(mobileRecommendationProbe.text)
      && /一键套用/.test(mobileRecommendationProbe.text)
      && /不自动排队/.test(mobileRecommendationProbe.text)
      && mobileRecommendationProbe.source === 'public_events_and_public_content'
      && mobileRecommendationProbe.hidden === 'false'
      && mobileRecommendationProbe.preset === 'shield'
      && mobileRecommendationProbe.locked === 'false'
      && mobileRecommendationProbe.buttonDisabled === false
      && mobileRecommendationProbe.buttonRect?.height >= 32
      && mobileRecommendationProbe.cardRect?.left >= -1
      && mobileRecommendationProbe.cardRect?.right <= mobileRecommendationProbe.viewportWidth + 2
      && mobileRecommendationProbe.buttonRect?.left >= -1
      && mobileRecommendationProbe.buttonRect?.right <= mobileRecommendationProbe.viewportWidth + 2
      && mobileRecommendationProbe.cardScrollWidth <= mobileRecommendationProbe.cardClientWidth + 2
      && mobileRecommendationProbe.overflowWrap !== 'normal',
    JSON.stringify(mobileRecommendationProbe),
  );

  await safeElementScreenshot(page, '[data-live-pvp-root]', path.join(outDir, 'pvp-live-panel.png'));
  await mobilePage.evaluate(() => {
    const root = document.querySelector('[data-live-pvp-root]');
    const screen = document.getElementById('pvp-screen');
    if (root && screen) {
      screen.scrollTo({ top: Math.max(0, root.offsetTop - 22), left: 0, behavior: 'auto' });
    } else {
      root?.scrollIntoView({ block: 'start', inline: 'nearest' });
    }
  }).catch(() => {});
  await mobilePage.waitForTimeout(100);
  await safeElementScreenshot(mobilePage, '[data-live-pvp-root]', path.join(outDir, 'pvp-live-panel-mobile.png'));
  await mobilePage.close();
  const report = {
    summary: {
      total: findings.length,
      passed: findings.filter((f) => f.pass).length,
      failed: findings.filter((f) => !f.pass).length,
    },
    findings,
    consoleErrors,
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (report.summary.failed > 0 || consoleErrors.length > 0) process.exit(1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
