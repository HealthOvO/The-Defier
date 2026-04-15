import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/browser-expedition-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];
const ENGINEERING_SNAPSHOTS = {
  observatory: {
    trackId: 'observatory',
    tier: 2,
    tierLabel: 'II阶',
    name: '观星工程',
    icon: '🔭',
    effectSummary: '观星、事件与裂隙联动抬升，常规战斗略降。'
  },
  forbidden_altar: {
    trackId: 'forbidden_altar',
    tier: 2,
    tierLabel: 'II阶',
    name: '禁术工程',
    icon: '🩸',
    effectSummary: '禁术、试炼与锻炉形成加速链，路线更偏冒险爆发。'
  }
};
const FALLBACK_CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

function readFirstNumber(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function readFirstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

function readFirstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) return value.slice();
  }
  return [];
}

function getObservatoryResonanceModel(link) {
  const source = link && typeof link === 'object' ? link : {};
  const resonance = source.resonance && typeof source.resonance === 'object' ? source.resonance : {};
  const completedValue = [
    resonance.completed,
    source.completed,
    source.resonanceCompleted,
    resonance.claimed,
    source.claimed,
    source.resonanceClaimed,
  ].find((value) => typeof value === 'boolean');
  return {
    progress: readFirstNumber(
      resonance.progress,
      source.progress,
      source.resonanceProgress,
      resonance.current,
      source.current,
      source.resonanceCurrent
    ),
    target: readFirstNumber(
      resonance.target,
      source.target,
      source.resonanceTarget,
      resonance.max,
      source.max,
      source.resonanceMax
    ),
    completed: typeof completedValue === 'boolean' ? completedValue : null,
    focusNodeTypes: readFirstArray(
      resonance.focusNodeTypes,
      source.focusNodeTypes,
      source.resonanceFocusNodeTypes,
      resonance.nodeTypes,
      source.nodeTypes,
      source.resonanceNodeTypes
    ),
    label: readFirstString(resonance.label, source.label, source.resonanceLabel, resonance.title, source.title, source.resonanceTitle),
    rewardLine: readFirstString(
      resonance.rewardLine,
      source.rewardLine,
      source.resonanceRewardLine,
      resonance.rewardSummary,
      source.rewardSummary,
      source.resonanceRewardSummary
    ),
    progressLine: readFirstString(
      resonance.progressLine,
      source.progressLine,
      source.resonanceProgressLine,
      resonance.progressText,
      source.progressText,
      source.resonanceProgressText
    ),
    statusLine: readFirstString(
      resonance.statusLine,
      source.statusLine,
      source.resonanceStatusLine,
      resonance.statusLabel,
      source.statusLabel,
      source.resonanceStatusLabel
    ),
  };
}

function getObservatoryRoutePactModel(link) {
  const container = link && typeof link === 'object' ? link : {};
  const routePact = container.routePact && typeof container.routePact === 'object' ? container.routePact : container;
  const completedValue = [
    routePact.completed,
    container.completed,
    container.routePactCompleted,
    routePact.claimed,
    container.claimed,
    container.routePactClaimed,
  ].find((value) => typeof value === 'boolean');
  return {
    bountyId: readFirstString(routePact.bountyId, container.bountyId, container.routePactBountyId),
    bountyName: readFirstString(routePact.bountyName, container.bountyName, container.routePactBountyName),
    progress: readFirstNumber(
      routePact.progress,
      container.progress,
      container.routePactProgress,
      routePact.current,
      container.current,
      container.routePactCurrent
    ),
    target: readFirstNumber(
      routePact.target,
      container.target,
      container.routePactTarget,
      routePact.max,
      container.max,
      container.routePactMax
    ),
    completed: typeof completedValue === 'boolean' ? completedValue : null,
    focusNodeTypes: readFirstArray(
      routePact.focusNodeTypes,
      container.focusNodeTypes,
      container.routePactFocusNodeTypes,
      routePact.nodeTypes,
      container.nodeTypes,
      container.routePactNodeTypes
    ),
    label: readFirstString(routePact.label, container.label, container.routePactLabel, routePact.title, container.title, container.routePactTitle),
    rewardLine: readFirstString(
      routePact.rewardLine,
      container.rewardLine,
      container.routePactRewardLine,
      routePact.rewardSummary,
      container.rewardSummary,
      container.routePactRewardSummary
    ),
    statusLine: readFirstString(
      routePact.statusLine,
      container.statusLine,
      container.routePactStatusLine,
      routePact.statusLabel,
      container.statusLabel,
      container.routePactStatusLabel
    ),
    branchId: readFirstString(routePact.branchId, container.branchId, container.routePactBranchId),
    branchName: readFirstString(routePact.branchName, container.branchName, container.routePactBranchName),
    engineeringTrackId: readFirstString(routePact.engineeringTrackId, container.engineeringTrackId, container.routePactEngineeringTrackId),
    engineeringTrackName: readFirstString(routePact.engineeringTrackName, container.engineeringTrackName, container.routePactEngineeringTrackName),
  };
}

function getPracticeTopicModel(topic) {
  const source = topic && typeof topic === 'object' ? topic : {};
  return {
    id: readFirstString(source.id, source.topicId),
    title: readFirstString(source.title, source.name, source.topicTitle),
    sourceTitle: readFirstString(source.sourceTitle, source.sourceName),
    themeLabel: readFirstString(source.themeLabel, source.sourceThemeLabel),
    trainingTags: readFirstArray(source.trainingTags, source.tags),
    goalLines: readFirstArray(source.goalLines).map((line) => String(line || '')).filter(Boolean),
  };
}

function getAnswerGoalModel(goal) {
  const source = goal && typeof goal === 'object' ? goal : {};
  return {
    id: readFirstString(source.id),
    label: readFirstString(source.label, source.name),
    progress: readFirstNumber(source.progress, source.current),
    target: readFirstNumber(source.target, source.max),
    completed: [source.completed, source.claimed].find((value) => typeof value === 'boolean'),
    stateTone: readFirstString(source.stateTone, source.state, source.tone),
    tagLabel: readFirstString(source.tagLabel, source.tag),
    statusLine: readFirstString(source.statusLine, source.line, source.summary),
    noteLine: readFirstString(source.noteLine, source.note, source.detail),
  };
}

function getAnswerSheetModel(sheet) {
  const source = sheet && typeof sheet === 'object' ? sheet : {};
  const goals = readFirstArray(source.goals).map((entry) => getAnswerGoalModel(entry));
  return {
    topicId: readFirstString(source.topicId),
    clueLocked: [source.clueLocked].find((value) => typeof value === 'boolean'),
    clueStatusLine: readFirstString(source.clueStatusLine, source.clueLine),
    ratingLabel: readFirstString(source.ratingLabel, source.reviewCard?.ratingLabel),
    nextSuggestion: readFirstString(source.nextSuggestion, source.reviewCard?.trainingAdvice),
    overviewLine: readFirstString(source.overviewLine, source.reviewCard?.overviewLine),
    goals,
    routeGoal: goals.find((entry) => entry.id === 'route_alignment') || goals[0] || null,
    executionGoal: goals.find((entry) => entry.id === 'sample_execution') || goals[1] || null,
    synthesisGoal: goals.find((entry) => entry.id === 'chapter_synthesis') || goals[2] || null,
    reviewCard: source.reviewCard && typeof source.reviewCard === 'object' ? source.reviewCard : {},
  };
}

function hasPositiveResourceDelta(before, after) {
  const safeBefore = before || {};
  const safeAfter = after || {};
  const keys = ['gold', 'ringExp', 'heavenlyInsight', 'karma', 'hp', 'energy', 'block'];
  return keys.some((key) => Number(safeAfter[key] || 0) > Number(safeBefore[key] || 0));
}

(async () => {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH
    || (fs.existsSync(FALLBACK_CHROME_PATH) ? FALLBACK_CHROME_PATH : undefined);
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(String(err));
  });

  async function captureObservatoryMobileProbe(viewport, screenshotName) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(120);
    const probe = await page.evaluate(() => {
      const panel = document.getElementById('map-expedition-panels');
      const card = panel?.querySelector('.expedition-observatory-card');
      const trackedNodes = Array.from(card?.querySelectorAll('.expedition-choice-head, .expedition-chip-row, .expedition-choice-meta, .expedition-observatory-actions, .expedition-answer-goal, .collection-inline-btn') || []);
      const overflowingNodes = trackedNodes
        .map((node, index) => ({
          index,
          className: typeof node.className === 'string' ? node.className : String(node.tagName || ''),
          overflowX: Math.max(0, Math.ceil((node.scrollWidth || 0) - (node.clientWidth || 0))),
          text: node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) || '',
        }))
        .filter((entry) => entry.overflowX > 1);
      return {
        ok: !!card,
        panelOverflowX: panel ? Math.max(0, Math.ceil((panel.scrollWidth || 0) - (panel.clientWidth || 0))) : null,
        cardOverflowX: card ? Math.max(0, Math.ceil((card.scrollWidth || 0) - (card.clientWidth || 0))) : null,
        overflowingNodes,
        practiceTopicTitle: card?.querySelector('[data-practice-topic-title]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        answerSheetRating: card?.querySelector('[data-answer-sheet-rating]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        selectedRecommendedCard: card?.querySelector('[data-selected-recommended-branch="true"] strong')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      };
    });
    add(
      `observatory panel stays readable on ${viewport.width}px mobile viewport`,
      !!probe &&
        probe.ok &&
        Number(probe.panelOverflowX || 0) <= 1 &&
        Number(probe.cardOverflowX || 0) <= 1 &&
        probe.overflowingNodes.length === 0 &&
        !!probe.practiceTopicTitle &&
        !!probe.answerSheetRating &&
        !!probe.selectedRecommendedCard,
      JSON.stringify(probe || null)
    );
    await safeAuditScreenshot(page, path.join(outDir, screenshotName), 'browser_expedition_audit', { timeout: 9000 });
  }

  await page.addInitScript(() => {
    try {
      localStorage.removeItem('theDefierSave');
      localStorage.removeItem('theDefierActiveExpeditionStateV1');
    localStorage.removeItem('theDefierRunSlateArchiveV1');
    localStorage.removeItem('theDefierChallengeProgressV1');
    localStorage.removeItem('theDefierActiveChallengeRunV1');
    localStorage.removeItem('theDefierChallengeHubStateV1');
    localStorage.removeItem('theDefierObservatoryArchiveV1');
    localStorage.removeItem('theDefierObservatoryGuideStateV1');
    } catch {}
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  await page.evaluate(() => {
    ['auth-modal', 'save-slots-modal', 'generic-confirm-modal', 'save-conflict-modal'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });
    if (!window.game) return;
    game.guestMode = true;
    game.startNewGame('linFeng');
    const bundle = typeof game.buildChallengeBundle === 'function' ? game.buildChallengeBundle('daily') : null;
    if (bundle && typeof game.applyChallengeRunStart === 'function') {
      game.applyChallengeRunStart(bundle);
      if (game.activeChallengeRun) {
        game.activeChallengeRun.progress.battleWins = 3;
        game.activeChallengeRun.progress.eliteWins = 1;
        game.activeChallengeRun.progress.realmClears = 1;
      }
      if (game.player) {
        game.player.currentHp = Math.min(game.player.maxHp || 80, 72);
      }
      if (typeof game.finalizeActiveChallengeRun === 'function') {
        game.finalizeActiveChallengeRun({ completed: true, reason: 'goal_reached' });
      }
    }
    const followupBundle = typeof game.buildChallengeBundle === 'function' ? game.buildChallengeBundle('daily') : null;
    if (followupBundle && typeof game.applyChallengeRunStart === 'function') {
      game.applyChallengeRunStart(followupBundle);
      if (game.activeChallengeRun) {
        game.activeChallengeRun.progress.battleWins = 4;
        game.activeChallengeRun.progress.eliteWins = 2;
        game.activeChallengeRun.progress.realmClears = Math.max(1, game.activeChallengeRun.goalRealm || 3);
      }
      if (game.player) {
        game.player.currentHp = Math.max(18, Math.min(game.player.maxHp || 80, 46));
      }
      if (typeof game.finalizeActiveChallengeRun === 'function') {
        game.finalizeActiveChallengeRun({ completed: true, reason: 'goal_reached' });
      }
    }
    if (typeof game.getObservatoryArchiveEntries === 'function' && typeof game.selectObservatoryExpeditionGuide === 'function') {
      const currentGuide = typeof game.getSelectedObservatoryExpeditionGuide === 'function'
        ? game.getSelectedObservatoryExpeditionGuide({ silentSync: true })
        : null;
      const alternateGuide = game.getObservatoryArchiveEntries({
        mode: 'daily',
        types: ['challenge'],
        replayableOnly: true,
        limit: 6,
      }).find((entry) => entry && entry.id && entry.id !== (currentGuide?.id || ''));
      if (alternateGuide) {
        game.selectObservatoryExpeditionGuide(alternateGuide.id, { silent: true });
      }
    }
    if (typeof game.initializeExpeditionForRealm === 'function') {
      game.initializeExpeditionForRealm(game.player?.realm || 1, true);
    }
    if (typeof game.showScreen === 'function') {
      game.showScreen('map-screen');
    }
  });
  await page.waitForTimeout(1000);

  const initialProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const panels = document.getElementById('map-expedition-panels');
    const selectedGuide = window.game && typeof game.getSelectedObservatoryExpeditionGuide === 'function'
      ? game.getSelectedObservatoryExpeditionGuide({ silentSync: true })
      : null;
    return {
      mode: payload?.mode || '',
      expedition: payload?.expedition || null,
      selectedGuideId: selectedGuide?.id || '',
      selectedGuideTitle: selectedGuide?.title || '',
      selectedGuideTrainingTags: Array.isArray(selectedGuide?.trainingTags) ? selectedGuide.trainingTags : [],
      selectedGuideRouteFocus: selectedGuide?.routeFocusLine || '',
      panelVisible: !!panels && getComputedStyle(panels).display !== 'none',
      panelCount: panels?.querySelectorAll('.expedition-panel-card').length || 0,
      branchButtons: panels?.querySelectorAll('.expedition-choice-card button').length || 0,
      recommendedCardCount: panels?.querySelectorAll('[data-observatory-recommended-card]').length || 0,
      factionCards: panels?.querySelectorAll('.expedition-faction-card').length || 0,
      nemesisName: panels?.querySelector('.expedition-nemesis-card strong')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      overviewText: panels?.querySelector('.expedition-overview-card')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      observatoryText: panels?.querySelector('.expedition-observatory-card')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      hasPracticeTopicCard: !!panels?.querySelector('[data-practice-topic-card]'),
      hasAnswerSheetCard: !!panels?.querySelector('[data-answer-sheet-card]'),
      hasAnswerSummaryCard: !!panels?.querySelector('[data-answer-sheet-summary]'),
      practiceTopicTitle: panels?.querySelector('[data-practice-topic-title]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      answerSheetRating: panels?.querySelector('[data-answer-sheet-rating]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      signalText: panels?.querySelector('.expedition-signals-card')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      hasNemesisForecast: !!payload?.expedition?.nemesisForecast,
      recentNemesisLogCount: Array.isArray(payload?.expedition?.recentNemesisLogs) ? payload.expedition.recentNemesisLogs.length : 0,
    };
  });
  add(
    'map screen exposes expedition panels, reads the selected observatory guide into expedition, and mirrors them into render_game_to_text',
    !!initialProbe &&
      initialProbe.mode === 'map-screen' &&
      initialProbe.panelVisible &&
      initialProbe.panelCount >= 6 &&
      initialProbe.branchButtons >= 8 &&
      initialProbe.factionCards === 3 &&
      initialProbe.expedition?.branchOptions?.length === 3 &&
      initialProbe.expedition?.bountyDraft?.length === 3 &&
      initialProbe.expedition?.factions?.length === 3 &&
      Array.isArray(initialProbe.expedition?.recentFactionLogs) &&
      Array.isArray(initialProbe.expedition?.recentNemesisLogs) &&
      Array.isArray(initialProbe.expedition?.bountyConflictWarnings) &&
      !!initialProbe.expedition?.practiceTopic &&
      !!initialProbe.expedition?.answerSheet &&
      !!initialProbe.expedition?.observatoryLink &&
      initialProbe.expedition?.observatoryLink?.sourceRecordId === initialProbe.selectedGuideId &&
      initialProbe.expedition?.observatoryLink?.sourceTitle === initialProbe.selectedGuideTitle &&
      (initialProbe.expedition?.observatoryLink?.trainingTags?.length || 0) >= 1 &&
      (initialProbe.expedition?.practiceTopic?.goalLines?.length || 0) >= 3 &&
      (initialProbe.expedition?.answerSheet?.goals?.length || 0) >= 3 &&
      /优先节点/.test(initialProbe.expedition?.observatoryLink?.routeFocusLine || initialProbe.selectedGuideRouteFocus || '') &&
      initialProbe.hasNemesisForecast &&
      initialProbe.expedition?.observatoryLink?.bonusOptions?.length === 2 &&
      /裂界远征/.test(initialProbe.overviewText || '') &&
      /观星|精选命盘/.test(initialProbe.observatoryText || '') &&
      initialProbe.recommendedCardCount >= 1 &&
      initialProbe.hasPracticeTopicCard &&
      initialProbe.hasAnswerSheetCard &&
      initialProbe.hasAnswerSummaryCard &&
      !!initialProbe.practiceTopicTitle &&
      !!initialProbe.answerSheetRating &&
      /最近势力变化/.test(initialProbe.signalText || '') &&
      /仇敌追猎链路/.test(initialProbe.signalText || '') &&
      /悬赏冲突提示/.test(initialProbe.signalText || '') &&
      !!initialProbe.nemesisName,
    JSON.stringify(initialProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-panels-initial.png'), 'browser_expedition_audit', { timeout: 9000 });

  const observatoryProbe = await page.evaluate(() => {
    if (!window.game || typeof game.getExpeditionState !== 'function') return { ok: false, reason: 'no_game' };
    const readFirstNumber = (...values) => {
      for (const value of values) {
        const num = Number(value);
        if (Number.isFinite(num)) return num;
      }
      return null;
    };
    const readFirstString = (...values) => {
      for (const value of values) {
        if (typeof value === 'string' && value.length > 0) return value;
      }
      return '';
    };
    const readFirstArray = (...values) => {
      for (const value of values) {
        if (Array.isArray(value) && value.length > 0) return value.slice();
      }
      return [];
    };
    const getResonanceModel = (link) => {
      const source = link && typeof link === 'object' ? link : {};
      const resonance = source.resonance && typeof source.resonance === 'object' ? source.resonance : {};
      const completedValue = [
        resonance.completed,
        source.completed,
        source.resonanceCompleted,
        resonance.claimed,
        source.claimed,
        source.resonanceClaimed,
      ].find((value) => typeof value === 'boolean');
      return {
        progress: readFirstNumber(
          resonance.progress,
          source.progress,
          source.resonanceProgress,
          resonance.current,
          source.current,
          source.resonanceCurrent
        ),
        target: readFirstNumber(
          resonance.target,
          source.target,
          source.resonanceTarget,
          resonance.max,
          source.max,
          source.resonanceMax
        ),
        completed: typeof completedValue === 'boolean' ? completedValue : null,
        focusNodeTypes: readFirstArray(
          resonance.focusNodeTypes,
          source.focusNodeTypes,
          source.resonanceFocusNodeTypes,
          resonance.nodeTypes,
          source.nodeTypes,
          source.resonanceNodeTypes
        ),
        label: readFirstString(resonance.label, source.label, source.resonanceLabel, resonance.title, source.title, source.resonanceTitle),
        rewardLine: readFirstString(
          resonance.rewardLine,
          source.rewardLine,
          source.resonanceRewardLine,
          resonance.rewardSummary,
          source.rewardSummary,
          source.resonanceRewardSummary
        ),
        progressLine: readFirstString(
          resonance.progressLine,
          source.progressLine,
          source.resonanceProgressLine,
          resonance.progressText,
          source.progressText,
          source.resonanceProgressText
        ),
        statusLine: readFirstString(
          resonance.statusLine,
          source.statusLine,
          source.resonanceStatusLine,
          resonance.statusLabel,
          source.statusLabel,
          source.resonanceStatusLabel
        ),
      };
    };
    const snapshotResources = () => ({
      gold: Number(game.player?.gold || 0),
      ringExp: Number(game.player?.fateRing?.exp || 0),
      heavenlyInsight: Number(game.player?.heavenlyInsight || 0),
      karma: Number(game.player?.karma || 0),
      hp: Number(game.player?.currentHp || 0),
      energy: Number(game.player?.currentEnergy || 0),
      block: Number(game.player?.block || 0),
    });
    const state = game.getExpeditionState();
    const observatory = state?.observatoryLink;
    const option = observatory?.bonusOptions?.find((entry) => entry.triggerType === 'node_visit') || observatory?.bonusOptions?.[0];
    if (!option) return { ok: false, reason: 'no_option' };
    game.selectExpeditionObservatoryBonus(option.id);
    let payload = JSON.parse(window.render_game_to_text());
    const lockedLink = payload?.expedition?.observatoryLink || null;
    const lockedPracticeTopic = payload?.expedition?.practiceTopic || null;
    const lockedAnswerSheet = payload?.expedition?.answerSheet || null;
    const lockedResonance = getResonanceModel(lockedLink);
    const focusNodeType = lockedResonance.focusNodeTypes?.[0];
    const originalGuideGetter = game.getSelectedObservatoryExpeditionGuide;
    if (typeof originalGuideGetter === 'function') {
      game.getSelectedObservatoryExpeditionGuide = function () {
        return {
          id: 'guide_browser_drift',
          title: '观星精选·漂移假线',
          score: 404,
          seedSignature: 'D-BROWSER-DRIFT',
          themeKey: 'oracle',
          themeLabel: '错位观测',
          featuredTier: '误导命盘',
          featuredTags: ['不应串入当前章节'],
          preferredNodes: ['observatory'],
          expeditionNote: '如果 observatory UI 读了 live guide，这里会串档。'
        };
      };
    }
    game.renderExpeditionMapPanels?.();
    const frozenPayload = JSON.parse(window.render_game_to_text());
    const frozenLink = frozenPayload?.expedition?.observatoryLink || null;
    const frozenPracticeTopic = frozenPayload?.expedition?.practiceTopic || null;
    if (typeof originalGuideGetter === 'function') {
      game.getSelectedObservatoryExpeditionGuide = originalGuideGetter;
      game.renderExpeditionMapPanels?.();
    }

    const resourcesBeforeFocus = snapshotResources();
    if (focusNodeType) {
      game.recordExpeditionNodeVisit({ type: focusNodeType, accessible: true, completed: false });
    }
    let resourceBeforeCompletion = snapshotResources();
    payload = JSON.parse(window.render_game_to_text());
    let progressedLink = payload?.expedition?.observatoryLink || null;
    let progressedAnswerSheet = payload?.expedition?.answerSheet || null;
    let progressedResonance = getResonanceModel(progressedLink);
    if (!progressedLink?.bonusOptions?.some((entry) => entry.id === option.id && entry.consumed === true) && option.triggerType === 'node_visit' && option.nodeTypes?.[0] && option.nodeTypes[0] !== focusNodeType) {
      game.recordExpeditionNodeVisit({ type: option.nodeTypes[0], accessible: true, completed: false });
      payload = JSON.parse(window.render_game_to_text());
      progressedLink = payload?.expedition?.observatoryLink || null;
      progressedAnswerSheet = payload?.expedition?.answerSheet || null;
      progressedResonance = getResonanceModel(progressedLink);
    }

    let completedLink = progressedLink;
    let completedAnswerSheet = progressedAnswerSheet;
    let completedResonance = progressedResonance;
    let completionSteps = 0;
    let completionRewardDelta = null;
    let safety = Math.max(2, (Number(completedResonance.target) || 1) + 2);
    while (focusNodeType && completedResonance.completed !== true && completedResonance.progress < completedResonance.target && safety > 0) {
      resourceBeforeCompletion = snapshotResources();
      game.recordExpeditionNodeVisit({ type: focusNodeType, accessible: true, completed: false });
      payload = JSON.parse(window.render_game_to_text());
      completedLink = payload?.expedition?.observatoryLink || null;
      completedAnswerSheet = payload?.expedition?.answerSheet || null;
      completedResonance = getResonanceModel(completedLink);
      completionSteps += 1;
      if (completedResonance.completed === true || completedResonance.progress >= completedResonance.target) {
        completionRewardDelta = {
          before: resourceBeforeCompletion,
          after: snapshotResources(),
        };
        break;
      }
      safety -= 1;
    }

    payload = JSON.parse(window.render_game_to_text());
    completedLink = payload?.expedition?.observatoryLink || completedLink;
    completedAnswerSheet = payload?.expedition?.answerSheet || completedAnswerSheet;
    completedResonance = getResonanceModel(completedLink);
    const observatoryText = document.querySelector('#map-expedition-panels .expedition-observatory-card')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const practiceTopicTitle = document.querySelector('#map-expedition-panels [data-practice-topic-title]')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const hasAnswerSheetCard = !!document.querySelector('#map-expedition-panels [data-answer-sheet-card]');
    const hasAnswerSummaryCard = !!document.querySelector('#map-expedition-panels [data-answer-sheet-summary]');
    const hasNextSuggestion = !!document.querySelector('#map-expedition-panels [data-answer-sheet-next]');
    const hasTrainingAdvice = !!document.querySelector('#map-expedition-panels [data-answer-sheet-training]');
    const buildSnapshot = typeof game.getBuildSnapshotData === 'function' ? game.getBuildSnapshotData() : null;
    return {
      ok: true,
      optionId: option.id,
      selectedOptionNodeTypes: Array.isArray(option.nodeTypes) ? option.nodeTypes.slice() : [],
      observatoryLink: completedLink,
      lockedLink,
      lockedPracticeTopic,
      lockedAnswerSheet,
      lockedResonance,
      frozenLink,
      frozenPracticeTopic,
      progressedAnswerSheet,
      progressedResonance,
      completedAnswerSheet,
      completedResonance,
      focusNodeType,
      resourcesBeforeFocus,
      resourcesAfterCompletion: snapshotResources(),
      completionRewardDelta,
      completionSteps,
      buildSnapshotObservatoryLink: buildSnapshot?.expedition?.observatoryLink || null,
      buildSnapshotAnswerSheet: buildSnapshot?.expedition?.answerSheet || null,
      buildSnapshotText: [
        ...(Array.isArray(buildSnapshot?.strengths) ? buildSnapshot.strengths : []),
        ...(Array.isArray(buildSnapshot?.nextTargets) ? buildSnapshot.nextTargets : []),
        ...(Array.isArray(buildSnapshot?.gaps) ? buildSnapshot.gaps : []),
      ].join(' '),
      observatoryText,
      practiceTopicTitle,
      hasAnswerSheetCard,
      hasAnswerSummaryCard,
      hasNextSuggestion,
      hasTrainingAdvice,
    };
  });
  add(
    'observatory panel can lock a bonus clue, freeze chapter-scoped resonance, and sync redeemed progress back into render_game_to_text',
    !!observatoryProbe &&
      observatoryProbe.ok &&
      observatoryProbe.observatoryLink?.selectedBonusId === observatoryProbe.optionId &&
      observatoryProbe.observatoryLink?.bonusOptions?.some((entry) => entry.id === observatoryProbe.optionId && entry.selected === true) &&
      observatoryProbe.lockedLink?.sourceTitle === observatoryProbe.frozenLink?.sourceTitle &&
      getPracticeTopicModel(observatoryProbe.lockedPracticeTopic).title === getPracticeTopicModel(observatoryProbe.frozenPracticeTopic).title &&
      getPracticeTopicModel(observatoryProbe.lockedPracticeTopic).themeLabel === getPracticeTopicModel(observatoryProbe.frozenPracticeTopic).themeLabel &&
      JSON.stringify(getPracticeTopicModel(observatoryProbe.lockedPracticeTopic).goalLines) === JSON.stringify(getPracticeTopicModel(observatoryProbe.frozenPracticeTopic).goalLines) &&
      typeof getAnswerSheetModel(observatoryProbe.lockedAnswerSheet).clueStatusLine === 'string' &&
      getAnswerSheetModel(observatoryProbe.lockedAnswerSheet).clueStatusLine.length > 0 &&
      Number.isFinite(getObservatoryResonanceModel(observatoryProbe.lockedLink).progress) &&
      Number.isFinite(getObservatoryResonanceModel(observatoryProbe.lockedLink).target) &&
      getObservatoryResonanceModel(observatoryProbe.lockedLink).target >= 1 &&
      getObservatoryResonanceModel(observatoryProbe.lockedLink).focusNodeTypes.length >= 1 &&
      (
        observatoryProbe.selectedOptionNodeTypes.length === 0
          || getObservatoryResonanceModel(observatoryProbe.lockedLink).focusNodeTypes.every((type) => observatoryProbe.selectedOptionNodeTypes.includes(type))
      ) &&
      (
        getObservatoryResonanceModel(observatoryProbe.progressedResonance).progress > getObservatoryResonanceModel(observatoryProbe.lockedLink).progress
          || getObservatoryResonanceModel(observatoryProbe.progressedResonance).completed === true
      ) &&
      (
        Number(getAnswerSheetModel(observatoryProbe.progressedAnswerSheet).executionGoal?.progress || 0)
          > Number(getAnswerSheetModel(observatoryProbe.lockedAnswerSheet).executionGoal?.progress || 0)
          || /推进|跑完|进行中/.test(getAnswerSheetModel(observatoryProbe.progressedAnswerSheet).executionGoal?.statusLine || '')
      ) &&
      getObservatoryResonanceModel(observatoryProbe.observatoryLink).completed === true &&
      getObservatoryResonanceModel(observatoryProbe.observatoryLink).progress >= getObservatoryResonanceModel(observatoryProbe.observatoryLink).target &&
      typeof getAnswerSheetModel(observatoryProbe.completedAnswerSheet).ratingLabel === 'string' &&
      getAnswerSheetModel(observatoryProbe.completedAnswerSheet).ratingLabel.length > 0 &&
      typeof getAnswerSheetModel(observatoryProbe.completedAnswerSheet).nextSuggestion === 'string' &&
      getAnswerSheetModel(observatoryProbe.completedAnswerSheet).nextSuggestion.length > 0 &&
      (hasPositiveResourceDelta(observatoryProbe.resourcesBeforeFocus, observatoryProbe.resourcesAfterCompletion)
        || hasPositiveResourceDelta(observatoryProbe.completionRewardDelta?.before, observatoryProbe.completionRewardDelta?.after)) &&
      /命盘共鸣|共鸣|已兑现|进度/.test(observatoryProbe.observatoryText || '') &&
      observatoryProbe.practiceTopicTitle.length > 0 &&
      observatoryProbe.hasAnswerSheetCard &&
      observatoryProbe.hasAnswerSummaryCard &&
      observatoryProbe.hasNextSuggestion &&
      observatoryProbe.hasTrainingAdvice &&
      (
        /命盘共鸣|共鸣|已兑现|进度|章节答卷|训练建议/.test(observatoryProbe.buildSnapshotText || '')
          || Number.isFinite(getObservatoryResonanceModel(observatoryProbe.buildSnapshotObservatoryLink).progress)
          || typeof getAnswerSheetModel(observatoryProbe.buildSnapshotAnswerSheet).ratingLabel === 'string'
      ),
    JSON.stringify(observatoryProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-observatory-link.png'), 'browser_expedition_audit', { timeout: 9000 });

  const branchTarget = await page.evaluate(() => {
    if (typeof window.render_game_to_text !== 'function') return { ok: false, reason: 'no_render_game_to_text' };
    const payload = JSON.parse(window.render_game_to_text());
    const branch = payload?.expedition?.observatoryLink?.recommendedBranches?.[0] || null;
    return {
      ok: !!branch?.id,
      branchId: branch?.id || '',
      branchName: branch?.name || '',
    };
  });
  let branchProbe = {
    ok: false,
    reason: branchTarget?.reason || 'no_recommended_branch',
    branchId: branchTarget?.branchId || '',
    branchName: branchTarget?.branchName || '',
  };
  if (branchTarget?.ok) {
    await page.locator(`#map-expedition-panels button[data-observatory-recommended-branch="${branchTarget.branchId}"]`).click({ timeout: 9000 });
    branchProbe = await page.evaluate((branchId) => {
      const payload = JSON.parse(window.render_game_to_text());
      const recommendedBranches = payload?.expedition?.observatoryLink?.recommendedBranches || [];
      const selectedRecommended = recommendedBranches.find((entry) => entry.id === branchId) || null;
      const selectedRecommendedCard = document.querySelector(`#map-expedition-panels [data-observatory-recommended-card="${branchId}"]`);
      const note = document.querySelector('#map-expedition-panels .expedition-card-note')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const selectedCard = selectedRecommendedCard?.querySelector('strong')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const answerSheetText = document.querySelector('#map-expedition-panels [data-answer-sheet-card]')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const currentButton = document.querySelector(`#map-expedition-panels button[data-observatory-recommended-branch="${branchId}"]`);
      return {
        ok: !!payload?.expedition?.selectedBranchId,
        branchId,
        branchName: selectedRecommended?.name || '',
        payloadBranchId: payload?.expedition?.selectedBranchId || '',
        payloadBranchName: payload?.expedition?.selectedBranchName || '',
        answerSheet: payload?.expedition?.answerSheet || null,
        recommendedSelected: selectedRecommended?.selected === true,
        selectedRecommendedCardState: selectedRecommendedCard?.getAttribute('data-selected-recommended-branch') || '',
        buttonDisabled: !!currentButton?.disabled,
        buttonText: currentButton?.textContent?.replace(/\s+/g, ' ').trim() || '',
        note,
        selectedCard,
        answerSheetText,
      };
    }, branchTarget.branchId);
  }
  add(
    'observatory recommended branch shortcut updates the panel highlight and render_game_to_text branch summary',
    !!branchProbe &&
      branchProbe.ok &&
      branchProbe.payloadBranchId === branchProbe.branchId &&
      branchProbe.payloadBranchName === branchProbe.branchName &&
      branchProbe.recommendedSelected === true &&
      branchProbe.selectedRecommendedCardState === 'true' &&
      branchProbe.buttonDisabled === true &&
      /当前推荐路线/.test(branchProbe.buttonText || '') &&
      branchProbe.note.includes(branchProbe.branchName) &&
      branchProbe.selectedCard.includes(branchProbe.branchName) &&
      getAnswerSheetModel(branchProbe.answerSheet).routeGoal?.completed === true &&
      /已按样本锁定|贴题/.test(getAnswerSheetModel(branchProbe.answerSheet).routeGoal?.statusLine || '') &&
      /章节答卷状态|已按样本锁定|训练建议/.test(branchProbe.answerSheetText || ''),
    JSON.stringify(branchProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-branch-selected.png'), 'browser_expedition_audit', { timeout: 9000 });
  await captureObservatoryMobileProbe({ width: 390, height: 844 }, 'expedition-mobile-390.png');
  await captureObservatoryMobileProbe({ width: 360, height: 780 }, 'expedition-mobile-360.png');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.waitForTimeout(120);

  const clueProbe = await page.evaluate(() => {
    if (!window.game || typeof game.recordExpeditionNodeVisit !== 'function') return { ok: false, reason: 'no_game' };
    game.recordExpeditionNodeVisit({ type: 'event', accessible: true, completed: false });
    const payload = JSON.parse(window.render_game_to_text());
    const nemesisText = document.querySelector('#map-expedition-panels .expedition-nemesis-card')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    return {
      ok: !!payload?.expedition?.activeNemesis,
      activeNemesis: payload?.expedition?.activeNemesis || null,
      nemesisText,
    };
  });
  add(
    'nemesis panel reveals clue and richer status metadata once an event trail is explored',
    !!clueProbe &&
      clueProbe.ok &&
      typeof clueProbe.activeNemesis?.statusLabel === 'string' &&
      clueProbe.activeNemesis.statusLabel.length > 0 &&
      typeof clueProbe.activeNemesis?.clueLine === 'string' &&
      clueProbe.activeNemesis.clueLine.length > 0 &&
      (clueProbe.activeNemesis.clueRevealed === true || /线索/.test(clueProbe.nemesisText || '')),
    JSON.stringify(clueProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-nemesis-clue.png'), 'browser_expedition_audit', { timeout: 9000 });

  const bountyProbe = await page.evaluate(() => {
    if (!window.game || typeof game.getExpeditionState !== 'function') return { ok: false, reason: 'no_game' };
    const state = game.getExpeditionState();
    const route = state.bountyDraft.find((entry) => entry.condition?.type === 'visitNodeType') || state.bountyDraft[0];
    const battle = state.bountyDraft.find((entry) => entry.id !== route.id) || state.bountyDraft[1];
    game.toggleExpeditionBounty(route.id);
    if (battle) game.toggleExpeditionBounty(battle.id);
    const payload = JSON.parse(window.render_game_to_text());
    const selectedCount = document.querySelectorAll('#map-expedition-panels .expedition-choice-card.selected').length;
    const activeBountyNames = payload?.expedition?.activeBounties?.map((entry) => entry.name) || [];
    return {
      ok: activeBountyNames.length >= 1,
      routeId: route.id,
      routeNodeType: route.condition?.nodeType || '',
      activeBountyNames,
      activeBountyCount: payload?.expedition?.activeBounties?.length || 0,
      selectedCount,
    };
  });
  add(
    'bounty selection reflects active objectives in both UI cards and render_game_to_text',
    !!bountyProbe &&
      bountyProbe.ok &&
      bountyProbe.activeBountyCount >= 1 &&
      bountyProbe.selectedCount >= bountyProbe.activeBountyCount + 1,
    JSON.stringify(bountyProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-bounties-selected.png'), 'browser_expedition_audit', { timeout: 9000 });

  const routePactProbe = await page.evaluate(() => {
    if (!window.game || typeof game.getExpeditionState !== 'function' || typeof game.initializeExpeditionForRealm !== 'function') {
      return { ok: false, reason: 'no_game' };
    }
    const readFirstNumber = (...values) => {
      for (const value of values) {
        const num = Number(value);
        if (Number.isFinite(num)) return num;
      }
      return null;
    };
    const readFirstString = (...values) => {
      for (const value of values) {
        if (typeof value === 'string' && value.length > 0) return value;
      }
      return '';
    };
    const readFirstArray = (...values) => {
      for (const value of values) {
        if (Array.isArray(value) && value.length > 0) return value.slice();
      }
      return [];
    };
    const getResonanceModel = (link) => {
      const source = link && typeof link === 'object' ? link : {};
      const resonance = source.resonance && typeof source.resonance === 'object' ? source.resonance : {};
      const completedValue = [
        resonance.completed,
        source.completed,
        source.resonanceCompleted,
        resonance.claimed,
        source.claimed,
        source.resonanceClaimed,
      ].find((value) => typeof value === 'boolean');
      return {
        progress: readFirstNumber(
          resonance.progress,
          source.progress,
          source.resonanceProgress,
          resonance.current,
          source.current,
          source.resonanceCurrent
        ),
        target: readFirstNumber(
          resonance.target,
          source.target,
          source.resonanceTarget,
          resonance.max,
          source.max,
          source.resonanceMax
        ),
        completed: typeof completedValue === 'boolean' ? completedValue : null,
        focusNodeTypes: readFirstArray(
          resonance.focusNodeTypes,
          source.focusNodeTypes,
          source.resonanceFocusNodeTypes,
          resonance.nodeTypes,
          source.nodeTypes,
          source.resonanceNodeTypes
        ),
        label: readFirstString(resonance.label, source.label, source.resonanceLabel, resonance.title, source.title, source.resonanceTitle),
        rewardLine: readFirstString(
          resonance.rewardLine,
          source.rewardLine,
          source.resonanceRewardLine,
          resonance.rewardSummary,
          source.rewardSummary,
          source.resonanceRewardSummary
        ),
        progressLine: readFirstString(
          resonance.progressLine,
          source.progressLine,
          source.resonanceProgressLine,
          resonance.progressText,
          source.progressText,
          source.resonanceProgressText
        ),
        statusLine: readFirstString(
          resonance.statusLine,
          source.statusLine,
          source.resonanceStatusLine,
          resonance.statusLabel,
          source.statusLabel,
          source.resonanceStatusLabel
        ),
      };
    };
    const getRoutePactModel = (link) => {
      const container = link && typeof link === 'object' ? link : {};
      const routePact = container.routePact && typeof container.routePact === 'object' ? container.routePact : container;
      const completedValue = [
        routePact.completed,
        container.completed,
        container.routePactCompleted,
        routePact.claimed,
        container.claimed,
        container.routePactClaimed,
      ].find((value) => typeof value === 'boolean');
      return {
        bountyId: readFirstString(routePact.bountyId, container.bountyId, container.routePactBountyId),
        bountyName: readFirstString(routePact.bountyName, container.bountyName, container.routePactBountyName),
        progress: readFirstNumber(
          routePact.progress,
          container.progress,
          container.routePactProgress,
          routePact.current,
          container.current,
          container.routePactCurrent
        ),
        target: readFirstNumber(
          routePact.target,
          container.target,
          container.routePactTarget,
          routePact.max,
          container.max,
          container.routePactMax
        ),
        completed: typeof completedValue === 'boolean' ? completedValue : null,
        focusNodeTypes: readFirstArray(
          routePact.focusNodeTypes,
          container.focusNodeTypes,
          container.routePactFocusNodeTypes,
          routePact.nodeTypes,
          container.nodeTypes,
          container.routePactNodeTypes
        ),
        label: readFirstString(routePact.label, container.label, container.routePactLabel, routePact.title, container.title, container.routePactTitle),
        rewardLine: readFirstString(
          routePact.rewardLine,
          container.rewardLine,
          container.routePactRewardLine,
          routePact.rewardSummary,
          container.rewardSummary,
          container.routePactRewardSummary
        ),
        statusLine: readFirstString(
          routePact.statusLine,
          container.statusLine,
          container.routePactStatusLine,
          routePact.statusLabel,
          container.statusLabel,
          container.routePactStatusLabel
        ),
        branchId: readFirstString(routePact.branchId, container.branchId, container.routePactBranchId),
        branchName: readFirstString(routePact.branchName, container.branchName, container.routePactBranchName),
      };
    };
    const snapshotResources = () => ({
      gold: Number(game.player?.gold || 0),
      ringExp: Number(game.player?.fateRing?.exp || 0),
      heavenlyInsight: Number(game.player?.heavenlyInsight || 0),
      karma: Number(game.player?.karma || 0),
      hp: Number(game.player?.currentHp || 0),
      energy: Number(game.player?.currentEnergy || 0),
      block: Number(game.player?.block || 0),
    });
    const candidateRealms = [1, 4, 8, 13];
    const findRoutePactSetup = () => {
      for (const realm of candidateRealms) {
        game.initializeExpeditionForRealm(realm, true);
        game.showScreen?.('map-screen');
        const baseState = game.getExpeditionState();
        for (const option of baseState?.observatoryLink?.bonusOptions || []) {
          if (!Array.isArray(option.nodeTypes) || option.nodeTypes.length === 0) continue;
          game.initializeExpeditionForRealm(realm, true);
          game.showScreen?.('map-screen');
          if (!game.selectExpeditionObservatoryBonus(option.id)) continue;
          let payload = JSON.parse(window.render_game_to_text());
          const lockedLink = payload?.expedition?.observatoryLink || null;
          const lockedResonance = getResonanceModel(lockedLink);
          let state = game.getExpeditionState();
          for (const branch of state?.branchOptions || []) {
            game.selectExpeditionBranch(branch.id);
            state = game.getExpeditionState();
            const existingRoutePact = getRoutePactModel(state?.observatoryLink || null);
            if (existingRoutePact.bountyId) {
              return {
                realm,
                optionId: option.id,
                optionNodeTypes: option.nodeTypes.slice(),
                branchId: branch.id,
                branchName: branch.name,
                bountyId: existingRoutePact.bountyId,
                bountyName: existingRoutePact.bountyName,
                lockedLink,
                lockedResonance,
              };
            }
            const candidateBounty = (state?.bountyDraft || []).find((entry) =>
              typeof game.buildExpeditionObservatoryRoutePact === 'function'
                && !!game.buildExpeditionObservatoryRoutePact(state, entry)
            );
            if (candidateBounty) {
              return {
                realm,
                optionId: option.id,
                optionNodeTypes: option.nodeTypes.slice(),
                branchId: branch.id,
                branchName: branch.name,
                bountyId: candidateBounty.id,
                bountyName: candidateBounty.name,
                lockedLink,
                lockedResonance,
              };
            }
          }
        }
      }
      return null;
    };
    const setup = findRoutePactSetup();
    if (!setup) return { ok: false, reason: 'no_route_pact_setup' };

    game.initializeExpeditionForRealm(setup.realm, true);
    game.showScreen?.('map-screen');
    const bonusSelected = game.selectExpeditionObservatoryBonus(setup.optionId);
    let payload = JSON.parse(window.render_game_to_text());
    const lockedLink = payload?.expedition?.observatoryLink || null;
    const lockedResonance = getResonanceModel(lockedLink);
    if (!bonusSelected) {
      return { ok: false, reason: 'bonus_lock_failed', setup, lockedLink };
    }
    const branchSelected = game.selectExpeditionBranch(setup.branchId);
    let state = game.getExpeditionState();
    const targetBounty = state?.bountyDraft?.find((entry) => entry.id === setup.bountyId)
      || (state?.bountyDraft || []).find((entry) =>
        typeof game.buildExpeditionObservatoryRoutePact === 'function'
          && !!game.buildExpeditionObservatoryRoutePact(state, entry)
      );
    if (!branchSelected || !targetBounty) {
      return {
        ok: false,
        reason: 'branch_or_bounty_missing',
        setup,
        branchSelected,
        bountyDraft: state?.bountyDraft || [],
      };
    }

    const resourcesBeforeArming = snapshotResources();
    if (!Array.isArray(state.activeBountyIds) || !state.activeBountyIds.includes(targetBounty.id)) {
      game.toggleExpeditionBounty(targetBounty.id);
    }
    payload = JSON.parse(window.render_game_to_text());
    const armedLink = payload?.expedition?.observatoryLink || null;
    let completedLink = armedLink;
    let completedRoutePact = getRoutePactModel(completedLink);
    const focusNodeType = completedRoutePact.focusNodeTypes?.[0]
      || lockedResonance.focusNodeTypes?.[0]
      || setup.optionNodeTypes?.[0]
      || '';
    const readRouteCardText = () => Array.from(document.querySelectorAll('#map-expedition-panels .expedition-choice-card'))
      .find((card) => card.textContent?.includes(targetBounty.name))
      ?.textContent?.replace(/\s+/g, ' ').trim() || '';
    let routeCardText = readRouteCardText();
    let completionRewardDelta = null;
    let completionSteps = 0;
    let safety = Math.max(2, (Number(completedRoutePact.target) || 1) + 2);
    while (focusNodeType && completedRoutePact.completed !== true && completedRoutePact.progress < completedRoutePact.target && safety > 0) {
      const beforeStep = snapshotResources();
      game.recordExpeditionNodeVisit({ type: focusNodeType, accessible: true, completed: false });
      payload = JSON.parse(window.render_game_to_text());
      completedLink = payload?.expedition?.observatoryLink || null;
      completedRoutePact = getRoutePactModel(completedLink);
      routeCardText = readRouteCardText();
      completionSteps += 1;
      if (completedRoutePact.completed === true || completedRoutePact.progress >= completedRoutePact.target) {
        completionRewardDelta = {
          before: beforeStep,
          after: snapshotResources(),
        };
        break;
      }
      safety -= 1;
    }

    payload = JSON.parse(window.render_game_to_text());
    completedLink = payload?.expedition?.observatoryLink || completedLink;
    const buildSnapshot = typeof game.getBuildSnapshotData === 'function' ? game.getBuildSnapshotData() : null;
    return {
      ok: true,
      realm: setup.realm,
      optionId: setup.optionId,
      selectedOptionNodeTypes: Array.isArray(setup.optionNodeTypes) ? setup.optionNodeTypes.slice() : [],
      branchId: setup.branchId,
      branchName: setup.branchName || '',
      targetBountyId: targetBounty.id,
      targetBountyName: targetBounty.name,
      lockedLink,
      armedLink,
      completedLink,
      focusNodeType,
      resourcesBeforeArming,
      resourcesAfterCompletion: snapshotResources(),
      completionRewardDelta,
      completionSteps,
      observatoryText: document.querySelector('#map-expedition-panels .expedition-observatory-card')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      routeCardText,
      buildSnapshotObservatoryLink: buildSnapshot?.expedition?.observatoryLink || null,
      buildSnapshotText: [
        ...(Array.isArray(buildSnapshot?.strengths) ? buildSnapshot.strengths : []),
        ...(Array.isArray(buildSnapshot?.nextTargets) ? buildSnapshot.nextTargets : []),
        ...(Array.isArray(buildSnapshot?.gaps) ? buildSnapshot.gaps : []),
      ].join(' '),
    };
  });
  add(
    'aligned observatory clue, branch, and bounty can arm a route pact that completes across UI, payload, and build snapshot',
    !!routePactProbe &&
      routePactProbe.ok &&
      routePactProbe.selectedOptionNodeTypes.length >= 1 &&
      getObservatoryResonanceModel(routePactProbe.lockedLink).focusNodeTypes.length >= 1 &&
      getObservatoryResonanceModel(routePactProbe.lockedLink).focusNodeTypes.every((type) => routePactProbe.selectedOptionNodeTypes.includes(type)) &&
      getObservatoryRoutePactModel(routePactProbe.armedLink).bountyId === routePactProbe.targetBountyId &&
      getObservatoryRoutePactModel(routePactProbe.armedLink).focusNodeTypes.length >= 1 &&
      getObservatoryRoutePactModel(routePactProbe.completedLink).completed === true &&
      getObservatoryRoutePactModel(routePactProbe.completedLink).progress >= getObservatoryRoutePactModel(routePactProbe.completedLink).target &&
      getObservatoryRoutePactModel(routePactProbe.buildSnapshotObservatoryLink).bountyId === routePactProbe.targetBountyId &&
      /路线合卷|合卷/.test(routePactProbe.observatoryText || '') &&
      (
        /路线合卷|合卷/.test(routePactProbe.routeCardText || '')
          || /路线合卷|合卷/.test(routePactProbe.buildSnapshotText || '')
      ) &&
      (
        hasPositiveResourceDelta(routePactProbe.resourcesBeforeArming, routePactProbe.resourcesAfterCompletion)
          || hasPositiveResourceDelta(routePactProbe.completionRewardDelta?.before, routePactProbe.completionRewardDelta?.after)
      ),
    JSON.stringify(routePactProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-route-pact.png'), 'browser_expedition_audit', { timeout: 9000 });

  const signalProbe = await page.evaluate(() => {
    if (!window.game || typeof game.getExpeditionState !== 'function') return { ok: false, reason: 'no_game' };
    const state = game.getExpeditionState();
    const route = state.bountyDraft.find((entry) => entry.condition?.type === 'visitNodeType') || state.bountyDraft[0];
    const factionId = state.factions?.[0]?.id;
    if (!route || !factionId) return { ok: false, reason: 'missing_route_or_faction' };
    game.applyExpeditionFactionShift(factionId, -2, '审计：路线分歧正在加深。', { silent: true });
    const next = game.getExpeditionState();
    const targetFaction = next.factions.find((entry) => entry.id === factionId);
    if (!targetFaction) return { ok: false, reason: 'no_target_faction' };
    targetFaction.stance = -2;
    targetFaction.lastReason = '审计：该路线会继续刺激对立势力。';
    targetFaction.dislikes = [route.condition?.nodeType || 'observatory'];
    targetFaction.pressureNodeTypes = [route.condition?.nodeType || 'observatory'];
    next.activeBountyIds = Array.from(new Set([...(next.activeBountyIds || []), route.id]));
    if (typeof game.appendExpeditionNemesisHistory === 'function' && next.activeNemesis) {
      game.appendExpeditionNemesisHistory(next, {
        status: next.activeNemesis.status || 'hunting',
        severity: 'medium',
        title: `${next.activeNemesis.name} · 审计追猎`,
        detail: '审计：追猎压制信号已写回态势面板。',
        counterplay: typeof game.getExpeditionNemesisForecast === 'function'
          ? game.getExpeditionNemesisForecast(next)?.counterplay || ''
          : '',
      });
    }
    game.expeditionState = next;
    game.persistActiveExpeditionState();
    game.refreshExpeditionProgress(true);
    game.renderExpeditionMapPanels();

    const payload = JSON.parse(window.render_game_to_text());
    const signalsText = document.querySelector('#map-expedition-panels .expedition-signals-card')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const routeCard = Array.from(document.querySelectorAll('#map-expedition-panels .expedition-choice-card')).find((card) =>
      card.textContent?.includes(route.name)
    );
    return {
      ok: true,
      routeId: route.id,
      recentFactionLogs: payload?.expedition?.recentFactionLogs || [],
      recentNemesisLogs: payload?.expedition?.recentNemesisLogs || [],
      nemesisForecast: payload?.expedition?.nemesisForecast || null,
      bountyConflicts: payload?.expedition?.bountyConflictWarnings || [],
      signalsText,
      routeCardText: routeCard?.textContent?.replace(/\s+/g, ' ').trim() || ''
    };
  });
  add(
    'signal panel and bounty cards surface recent faction logs plus concrete conflict prompts',
    !!signalProbe &&
      signalProbe.ok &&
      signalProbe.recentFactionLogs.length >= 1 &&
      signalProbe.recentNemesisLogs.length >= 1 &&
      !!signalProbe.nemesisForecast &&
      signalProbe.bountyConflicts.some((entry) => entry.bountyId === signalProbe.routeId) &&
      /最近势力变化/.test(signalProbe.signalsText || '') &&
      /仇敌追猎链路/.test(signalProbe.signalsText || '') &&
      /悬赏冲突提示/.test(signalProbe.signalsText || '') &&
      /路线分歧|刺激对立势力|审计|投靠势力|追猎/.test(signalProbe.signalsText || '') &&
      /势力牵制|关系反噬|尚未锁线|路线错位/.test(signalProbe.routeCardText || ''),
    JSON.stringify(signalProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-signals.png'), 'browser_expedition_audit', { timeout: 9000 });

  const observatoryEngineeringProbe = await page.evaluate((snapshot) => {
    if (!window.game || typeof game.initializeExpeditionForRealm !== 'function') return { ok: false, reason: 'no_game' };
    game.getStrategicEngineeringSnapshot = () => ({
      focusTrack: snapshot,
      activeTracks: [snapshot],
      allTracks: [snapshot],
      summary: `${snapshot.icon} ${snapshot.name} ${snapshot.tierLabel}`
    });
    game.initializeExpeditionForRealm(1, true);
    game.showScreen?.('map-screen');
    let state = game.getExpeditionState();
    const branch = state?.branchOptions?.find((entry) => Array.isArray(entry.nodeBias) && entry.nodeBias.includes('observatory')) || state?.branchOptions?.[0];
    if (!branch) return { ok: false, reason: 'no_branch' };
    game.selectExpeditionBranch(branch.id);
    state = game.getExpeditionState();
    const route = state?.bountyDraft?.find((entry) => entry.condition?.nodeType === 'observatory') || state?.bountyDraft?.[0];
    if (route && !state.activeBountyIds.includes(route.id)) {
      game.toggleExpeditionBounty(route.id);
    }
    game.renderExpeditionMapPanels();
    const payload = JSON.parse(window.render_game_to_text());
    return {
      ok: true,
      engineeringLink: payload?.expedition?.engineeringLink || null,
      observatoryLink: payload?.expedition?.observatoryLink || null,
      nemesisForecast: payload?.expedition?.nemesisForecast || null,
      chapterEngineering: payload?.map?.chapter?.expeditionEngineering || null,
      chapterNemesisForecast: payload?.map?.chapter?.nemesisForecast || null,
      overviewText: document.querySelector('#map-expedition-panels .expedition-overview-card')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      signalText: document.querySelector('#map-expedition-panels .expedition-signals-card')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      observatoryText: document.querySelector('#map-expedition-panels .expedition-observatory-card')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    };
  }, ENGINEERING_SNAPSHOTS.observatory);
  add(
    'observatory engineering syncs route intel into overview, observatory, expedition payload, and chapter bridge',
    !!observatoryEngineeringProbe &&
      observatoryEngineeringProbe.ok &&
      observatoryEngineeringProbe.engineeringLink?.trackId === 'observatory' &&
      observatoryEngineeringProbe.observatoryLink?.engineeringTrackId === 'observatory' &&
      typeof observatoryEngineeringProbe.observatoryLink?.huntIntel === 'string' &&
      observatoryEngineeringProbe.observatoryLink.huntIntel.length > 0 &&
      observatoryEngineeringProbe.nemesisForecast?.engineeringTrackId === 'observatory' &&
      observatoryEngineeringProbe.nemesisForecast?.engineeringModifier === '观测锁线' &&
      observatoryEngineeringProbe.chapterEngineering?.trackId === 'observatory' &&
      observatoryEngineeringProbe.chapterNemesisForecast?.engineeringModifier === '观测锁线' &&
      /工程主轴|观星工程/.test(observatoryEngineeringProbe.overviewText || '') &&
      /工程联动|观测锁线/.test(observatoryEngineeringProbe.signalText || '') &&
      /工程情报|追猎窗口/.test(observatoryEngineeringProbe.observatoryText || ''),
    JSON.stringify(observatoryEngineeringProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-engineering-observatory.png'), 'browser_expedition_audit', { timeout: 9000 });

  const altarEngineeringProbe = await page.evaluate((snapshot) => {
    if (!window.game || typeof game.initializeExpeditionForRealm !== 'function') return { ok: false, reason: 'no_game' };
    game.getStrategicEngineeringSnapshot = () => ({
      focusTrack: snapshot,
      activeTracks: [snapshot],
      allTracks: [snapshot],
      summary: `${snapshot.icon} ${snapshot.name} ${snapshot.tierLabel}`
    });
    game.initializeExpeditionForRealm(13, true);
    game.showScreen?.('map-screen');
    let state = game.getExpeditionState();
    const branch = state?.branchOptions?.find((entry) => Array.isArray(entry.nodeBias) && entry.nodeBias.includes('forbidden_altar')) || state?.branchOptions?.[0];
    if (!branch) return { ok: false, reason: 'no_branch' };
    game.selectExpeditionBranch(branch.id);
    state = game.getExpeditionState();
    const targetBounty = state?.bountyDraft?.find((entry) => entry.condition?.nodeType === 'forbidden_altar')
      || state?.bountyDraft?.find((entry) => entry.type === 'battle' || entry.type === 'extreme')
      || state?.bountyDraft?.[0];
    if (!targetBounty) return { ok: false, reason: 'no_bounty' };
    if (!state.activeBountyIds.includes(targetBounty.id)) {
      game.toggleExpeditionBounty(targetBounty.id);
    }
    const next = game.getExpeditionState();
    if (next?.factions?.[0]) {
      next.factions[0].stance = -2;
      next.factions[0].lastReason = '审计：禁术压强正在逼近。';
      next.factions[0].dislikes = ['forbidden_altar', 'elite', 'trial'];
      next.factions[0].pressureNodeTypes = ['forbidden_altar', 'elite', 'trial'];
      game.expeditionState = next;
      game.persistActiveExpeditionState();
    }
    game.refreshExpeditionProgress?.(true);
    game.renderExpeditionMapPanels();
    const payload = JSON.parse(window.render_game_to_text());
    const activeCard = Array.from(document.querySelectorAll('#map-expedition-panels .expedition-choice-card')).find((card) =>
      card.textContent?.includes(targetBounty.name)
    );
    const branchPayload = payload?.expedition?.branchOptions?.find((entry) => entry.id === branch.id) || null;
    const bountyPayload = payload?.expedition?.bountyDraft?.find((entry) => entry.id === targetBounty.id) || null;
    return {
      ok: true,
      branchPayload,
      bountyPayload,
      engineeringLink: payload?.expedition?.engineeringLink || null,
      bountyConflicts: payload?.expedition?.bountyConflictWarnings || [],
      nemesisForecast: payload?.expedition?.nemesisForecast || null,
      chapterEngineering: payload?.map?.chapter?.expeditionEngineering || null,
      chapterNemesisForecast: payload?.map?.chapter?.nemesisForecast || null,
      signalText: document.querySelector('#map-expedition-panels .expedition-signals-card')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      activeCardText: activeCard?.textContent?.replace(/\s+/g, ' ').trim() || ''
    };
  }, ENGINEERING_SNAPSHOTS.forbidden_altar);
  add(
    'forbidden-altar engineering pushes branch bias, bounty conflict warnings, and nemesis pressure through UI and payload',
    !!altarEngineeringProbe &&
      altarEngineeringProbe.ok &&
      altarEngineeringProbe.engineeringLink?.trackId === 'forbidden_altar' &&
      altarEngineeringProbe.branchPayload?.engineeringTrackId === 'forbidden_altar' &&
      typeof altarEngineeringProbe.branchPayload?.pressureBias === 'string' &&
      altarEngineeringProbe.branchPayload.pressureBias.length > 0 &&
      altarEngineeringProbe.bountyPayload?.engineeringTrackId === 'forbidden_altar' &&
      typeof altarEngineeringProbe.bountyPayload?.engineeringNote === 'string' &&
      altarEngineeringProbe.bountyPayload.engineeringNote.length > 0 &&
      /工程牵引|禁术工程/.test(altarEngineeringProbe.bountyPayload?.signalLine || altarEngineeringProbe.bountyPayload?.engineeringNote || '') &&
      altarEngineeringProbe.nemesisForecast?.engineeringTrackId === 'forbidden_altar' &&
      altarEngineeringProbe.nemesisForecast?.engineeringModifier === '血契增压' &&
      altarEngineeringProbe.chapterEngineering?.trackId === 'forbidden_altar' &&
      altarEngineeringProbe.chapterNemesisForecast?.engineeringModifier === '血契增压' &&
      /工程联动|禁术压强|血契增压/.test(altarEngineeringProbe.signalText || '') &&
      /工程联动|禁术/.test(altarEngineeringProbe.activeCardText || ''),
    JSON.stringify(altarEngineeringProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-engineering-altar.png'), 'browser_expedition_audit', { timeout: 9000 });

  const progressProbe = await page.evaluate(() => {
    if (!window.game || typeof game.getExpeditionState !== 'function') return { ok: false, reason: 'no_game' };
    game.initializeExpeditionForRealm?.(1, true);
    game.showScreen?.('map-screen');
    let state = game.getExpeditionState();
    const branch = state?.branchOptions?.find((entry) => Array.isArray(entry.nodeBias) && entry.nodeBias.includes('observatory')) || state?.branchOptions?.[0];
    if (branch) {
      game.selectExpeditionBranch(branch.id);
    }
    state = game.getExpeditionState();
    const route = state.bountyDraft.find((entry) => entry.condition?.type === 'visitNodeType');
    if (!route) return { ok: false, reason: 'no_route_bounty' };
    if (!state.activeBountyIds.includes(route.id)) {
      game.toggleExpeditionBounty(route.id);
      state = game.getExpeditionState();
    }
    game.recordExpeditionNodeVisit({ type: route.condition.nodeType, accessible: true, completed: false });
    const payload = JSON.parse(window.render_game_to_text());
    const activeRoute = payload?.expedition?.activeBounties?.find((entry) => entry.id === route.id) || null;
    const routeCard = Array.from(document.querySelectorAll('#map-expedition-panels .expedition-choice-card')).find((card) =>
      card.textContent?.includes(route.name)
    );
    return {
      ok: !!activeRoute,
      routeName: route.name,
      activeRoute,
      routeCardCompleted: routeCard?.classList.contains('completed') || false,
    };
  });
  add(
    'route progression completes a bounty and syncs completion state back into the panel',
    !!progressProbe &&
      progressProbe.ok &&
      progressProbe.activeRoute.completed === true &&
      /1\/1|2\/2|3\/3/.test(progressProbe.activeRoute.progressText || '') &&
      progressProbe.routeCardCompleted === true,
    JSON.stringify(progressProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-bounty-progressed.png'), 'browser_expedition_audit', { timeout: 9000 });

  const battleStartProbe = await page.evaluate(() => {
    if (!window.game || typeof game.initializeExpeditionForRealm !== 'function') return { ok: false, reason: 'no_game' };
    game.initializeExpeditionForRealm(4, true);
    game.showScreen?.('map-screen');
    const state = game.getExpeditionState();
    const battleStartBonus = state?.observatoryLink?.bonusOptions?.find((entry) => entry.triggerType === 'battle_start');
    if (!battleStartBonus) {
      return { ok: false, reason: 'no_battle_start_bonus', observatoryLink: state?.observatoryLink || null };
    }
    const selected = game.selectExpeditionObservatoryBonus(battleStartBonus.id);
    const energyBeforeBattle = Number(game.player?.currentEnergy || 0);
    const blockBeforeBattle = Number(game.player?.block || 0);
    const originalBattleInit = game.battle?.init;
    let battleRecord = null;
    if (game.battle) {
      game.battle.init = function (enemies) {
        battleRecord = {
          enemyCount: Array.isArray(enemies) ? enemies.length : 0,
          energyAtInit: Number(game.player?.currentEnergy || 0),
          blockAtInit: Number(game.player?.block || 0),
          nodeType: String(game.currentBattleNode?.type || ''),
        };
        return typeof originalBattleInit === 'function'
          ? originalBattleInit.apply(this, arguments)
          : undefined;
      };
    }
    try {
      game.startBattle(
        [{
          id: 'audit_battle_start_enemy',
          name: '校验敌影',
          hp: 30,
          maxHp: 30,
          patterns: [{ type: 'attack', value: 8, intent: '压测' }],
        }],
        { type: battleStartBonus.nodeTypes?.[0] || 'enemy' }
      );
    } finally {
      if (game.battle) {
        game.battle.init = originalBattleInit;
      }
    }
    const expeditionPayload = typeof game.getExpeditionPayload === 'function' ? game.getExpeditionPayload() : null;
    game.showScreen?.('map-screen');
    game.renderExpeditionMapPanels?.();
    return {
      ok: true,
      selected,
      energyBeforeBattle,
      blockBeforeBattle,
      battleStartBonus,
      battleRecord,
      expeditionPayloadObservatoryLink: expeditionPayload?.observatoryLink || null,
      observatoryText: document.querySelector('#map-expedition-panels .expedition-observatory-card')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    };
  });
  add(
    'battle-start observatory clue resolves before battle init and stays synced in expedition payload',
    !!battleStartProbe &&
      battleStartProbe.ok &&
      battleStartProbe.selected === true &&
      battleStartProbe.expeditionPayloadObservatoryLink?.bonusOptions?.some((entry) => entry.id === battleStartProbe.battleStartBonus.id && entry.consumed === true) &&
      (
        Number(battleStartProbe.battleRecord?.energyAtInit || 0) > Number(battleStartProbe.energyBeforeBattle || 0)
          || Number(battleStartProbe.battleRecord?.blockAtInit || 0) > Number(battleStartProbe.blockBeforeBattle || 0)
      ) &&
      battleStartProbe.battleRecord?.nodeType === String(battleStartProbe.battleStartBonus.nodeTypes?.[0] || 'enemy') &&
      /观星|开战触发|命盘|样本/.test(battleStartProbe.observatoryText || ''),
    JSON.stringify(battleStartProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-battle-start.png'), 'browser_expedition_audit', { timeout: 9000 });

  const finalizeProbe = await page.evaluate(() => {
    if (!window.game || typeof game.getExpeditionState !== 'function') return { ok: false, reason: 'no_game' };
    const state = game.getExpeditionState();
    const nodeType = state?.activeNemesis?.triggerNodeTypes?.[0];
    if (nodeType) {
      const enemies = game.applyExpeditionBattleModifiers([
        {
          id: 'audit_target',
          name: '校验敌影',
          hp: 80,
          maxHp: 80,
          patterns: [{ type: 'attack', value: 12, intent: '压测' }],
        }
      ], { type: nodeType });
      game.recordExpeditionBattleVictory({ type: nodeType }, enemies);
    }
    const buildBeforeFinalize = typeof game.getBuildSnapshotData === 'function' ? game.getBuildSnapshotData() : null;
    const slate = game.finalizeExpeditionChapter('realm_clear');
    const payload = JSON.parse(window.render_game_to_text());
    const panels = document.getElementById('map-expedition-panels');
    const sanctum = typeof game.getSanctumOverviewData === 'function' ? game.getSanctumOverviewData() : null;
    return {
      ok: !!slate,
      slate,
      payloadExpedition: payload?.expedition || null,
      panelHidden: !!panels && getComputedStyle(panels).display === 'none',
      buildHasExpedition: !!buildBeforeFinalize?.expedition,
      sanctumProgress: sanctum?.progress || null,
      sanctumRoomCount: sanctum?.rooms?.filter((room) => room.id === 'run_slate_archive').length || 0,
      latestSlateBreakdown: payload?.expedition?.latestSlate?.scoreBreakdown || [],
      latestSlateAnswerReview: payload?.expedition?.latestSlate?.answerReview || null,
    };
  });
  add(
    'finalizing a chapter archives the run slate, hides live panels, and keeps archive data in render_game_to_text',
    !!finalizeProbe &&
      finalizeProbe.ok &&
      finalizeProbe.panelHidden &&
      finalizeProbe.buildHasExpedition &&
      finalizeProbe.payloadExpedition?.latestSlate?.id === finalizeProbe.slate.id &&
      finalizeProbe.latestSlateBreakdown.some((line) => /章节答卷|训练建议|课题样本|命盘共鸣|路线合卷/.test(line || '')) &&
      typeof finalizeProbe.latestSlateAnswerReview?.ratingLabel === 'string' &&
      finalizeProbe.latestSlateAnswerReview.ratingLabel.length > 0 &&
      typeof finalizeProbe.latestSlateAnswerReview?.trainingAdvice === 'string' &&
      finalizeProbe.latestSlateAnswerReview.trainingAdvice.length > 0 &&
      finalizeProbe.sanctumProgress?.runSlateArchives >= 1 &&
      finalizeProbe.sanctumRoomCount === 1,
    JSON.stringify(finalizeProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-finalized.png'), 'browser_expedition_audit', { timeout: 9000 });

  const trainingRelayProbe = await page.evaluate(() => {
    if (!window.game || typeof game.initializeExpeditionForRealm !== 'function') {
      return { ok: false, reason: 'no_game' };
    }
    const realm = Number(game.player?.realm || 4) || 4;
    game.initializeExpeditionForRealm(realm, true);
    game.showScreen?.('map-screen');
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    return {
      ok: true,
      expedition: payload?.expedition || null,
      mapChapter: payload?.map?.chapter || null,
      relayText: document.querySelector('#map-expedition-panels [data-observatory-training-focus="true"]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      nextText: document.querySelector('#map-expedition-panels [data-answer-sheet-next]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      currentText: document.querySelector('#map-expedition-panels [data-answer-sheet-current]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    };
  });
  add(
    'starting the next expedition chapter replays the last chapter training focus into observatory and answer-sheet preview',
    !!trainingRelayProbe &&
      trainingRelayProbe.ok &&
      typeof trainingRelayProbe.expedition?.trainingFocus?.trainingAdvice === 'string' &&
      trainingRelayProbe.expedition.trainingFocus.trainingAdvice.length > 0 &&
      trainingRelayProbe.mapChapter?.trainingFocus?.trainingAdvice === trainingRelayProbe.expedition.trainingFocus.trainingAdvice &&
      trainingRelayProbe.relayText.includes(trainingRelayProbe.expedition.trainingFocus.trainingAdvice) &&
      trainingRelayProbe.nextText.includes(trainingRelayProbe.expedition.trainingFocus.trainingAdvice) &&
      /上章主练/.test(trainingRelayProbe.nextText || '') &&
      (/本章推进/.test(trainingRelayProbe.currentText || '') || trainingRelayProbe.currentText === ''),
    JSON.stringify(trainingRelayProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-training-relay.png'), 'browser_expedition_audit', { timeout: 9000 });

  add('no console errors were emitted during expedition audit', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  const failed = findings.filter((item) => !item.pass);
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ url, findings, consoleErrors }, null, 2));
  if (failed.length > 0) {
    failed.forEach((item) => console.error(`FAIL: ${item.name}\n${item.detail}`));
    process.exitCode = 1;
  } else {
    console.log('browser_expedition_audit passed');
  }

  await browser.close();
})();
