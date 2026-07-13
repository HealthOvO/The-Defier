import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

const baseUrl = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/web-run-path-reward-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];
const EXPECTED_CHAPTER_ARC_DRILL_MODES = ['daily', 'weekly', 'global'];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

function recordConsoleError(text) {
  const message = String(text || '');
  if (/ERR_CONNECTION_CLOSED/.test(message)) return;
  consoleErrors.push(message);
}

async function safeScreenshot(page, outPath) {
  await safeAuditScreenshot(page, outPath, 'browser_run_path_reward_audit', {
    fullPage: false,
    preferCdp: true,
    fallbackToPlaywright: false,
    cdpTimeout: 6000,
  });
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', (msg) => {
    if (msg.type() === 'error') recordConsoleError(msg.text());
  });
  page.on('pageerror', (err) => {
    recordConsoleError(String(err));
  });

  await page.goto(`${baseUrl}?autotest=guest-map&character=yanHan&destiny=foldedEdge&spirit=swordWraith&path=insight&realm=1`, {
    waitUntil: 'domcontentloaded'
  });
  await page.waitForTimeout(1200);

  const mapFlashProbe = await page.evaluate(() => {
    if (!window.game || typeof game.handleRunPathProgress !== 'function') {
      return { ok: false, reason: 'map_run_path_api_missing' };
    }

    if (game.player && typeof game.player.setRunPath === 'function') {
      game.player.setRunPath('insight');
    }
    const progress = game.player?.runPathProgress
      || (game.player && typeof game.player.ensureRunPathProgress === 'function'
        ? game.player.ensureRunPathProgress()
        : null);
    if (!progress) {
      return { ok: false, reason: 'map_progress_missing' };
    }

    progress.pathId = 'insight';
    progress.currentPhaseIndex = 1;
    progress.phaseProgress = 1;
    progress.completedPhases = ['insight_opening'];
    progress.rewardHistory = [];
    progress.completed = false;
    progress.lastRewardText = '';
    game.lastRunPathMapFeedback = null;

    game.handleRunPathProgress('strategicNodeVisit', 1, { nodeType: 'observatory' });

    const panel = document.getElementById('map-run-path-flash');
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;

    return {
      ok: !!panel,
      visible: !!panel && getComputedStyle(panel).display !== 'none' && getComputedStyle(panel).visibility !== 'hidden',
      text: panel?.textContent?.replace(/\s+/g, ' ').trim() || '',
      payload: payload?.map?.runPathFlash || null
    };
  });

  add(
    'map screen shows immediate run path completion feedback for strategic node milestones',
    !!mapFlashProbe?.ok
      && !!mapFlashProbe.visible
      && /窥命流/.test(mapFlashProbe.text || '')
      && /阶段已完成/.test(mapFlashProbe.text || '')
      && /窥盘巡脉/.test(mapFlashProbe.text || '')
      && /下一阶段：登峰 · 命盘问真/.test(mapFlashProbe.text || '')
      && mapFlashProbe.payload?.pathId === 'insight'
      && mapFlashProbe.payload?.completed === false,
    JSON.stringify(mapFlashProbe || null)
  );

  await safeScreenshot(page, path.join(outDir, 'map-run-path-flash.png'));

  await page.goto(`${baseUrl}?autotest=guest-battle&character=linFeng&destiny=foldedEdge&spirit=swordWraith&path=shatter&realm=1&battleType=normal`, {
    waitUntil: 'domcontentloaded'
  });
  await page.waitForTimeout(1200);

  const rewardProbe = await page.evaluate(() => {
    if (!window.game || typeof game.handleRunPathProgress !== 'function') {
      return { ok: false, reason: 'run_path_api_missing' };
    }

    if (game.player && typeof game.player.setRunPath === 'function') {
      game.player.setRunPath('shatter');
    }
    const progress = game.player?.runPathProgress
      || (game.player && typeof game.player.ensureRunPathProgress === 'function'
        ? game.player.ensureRunPathProgress()
        : null);
    if (!progress) {
      return { ok: false, reason: 'progress_missing' };
    }

    if (game.player && !game.player.runPathProgress) {
      game.player.runPathProgress = progress;
    }

    game.lastRunPathRewardMeta = null;
    game.currentBattleNode = { type: 'elite', id: 991001, completed: false };
    progress.pathId = 'shatter';
    progress.currentPhaseIndex = 0;
    progress.phaseProgress = 5;
    progress.completedPhases = [];
    progress.rewardHistory = [];
    progress.completed = false;
    progress.lastRewardText = '';

    game.handleRunPathProgress('playAttackCard', 1);
    const liveProgress = game.player?.runPathProgress;
    if (!liveProgress) {
      return { ok: false, reason: 'live_progress_missing_after_first_completion' };
    }
    liveProgress.phaseProgress = 1;
    game.handleRunPathProgress('eliteOrTrialWin', 1, { nodeType: 'elite' });

    game.showRewardScreen(120, false, null, 28, null);

    const panel = document.getElementById('reward-run-path-meta');
    const narrative = document.getElementById('reward-narrative-brief');
    const nextStep = document.getElementById('reward-next-step-card');
    const continueBtn = document.getElementById('continue-reward-btn');
    const firstRewardCard = document.querySelector('#reward-cards .reward-card');
    const nextStepPendingText = nextStep?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const continueDisabledBefore = !!continueBtn?.disabled;
    const entries = Array.from(panel?.querySelectorAll('.reward-run-path-entry') || []);
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;

    return {
      ok: !!panel && entries.length === 2,
      visible: !!panel && getComputedStyle(panel).display !== 'none' && getComputedStyle(panel).visibility !== 'hidden',
      narrativeVisible: !!narrative && getComputedStyle(narrative).display !== 'none' && getComputedStyle(narrative).visibility !== 'hidden',
      narrativeText: narrative?.textContent?.replace(/\s+/g, ' ').trim() || '',
      nextStepPendingText,
      continueDisabledBefore,
      rewardCardRole: firstRewardCard?.getAttribute('role') || '',
      rewardCardTabIndex: firstRewardCard?.getAttribute('tabindex') || '',
      rewardCardAriaPressed: firstRewardCard?.getAttribute('aria-pressed') || '',
      rewardCardAriaDisabled: firstRewardCard?.getAttribute('aria-disabled') || '',
      rewardCardAriaLabel: firstRewardCard?.getAttribute('aria-label') || '',
      summary: panel?.querySelector('.reward-disclosure-summary')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      status: document.querySelector('.reward-run-path-status')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      entries: entries.map((entry) => ({
        text: entry.textContent?.replace(/\s+/g, ' ').trim() || '',
        completed: entry.classList.contains('completed')
      })),
      rewardPayload: payload?.reward?.runPath || null
    };
  });

  add(
    'reward screen shows accumulated run path settlement entries and mirrors them into render_game_to_text',
    !!rewardProbe?.ok
      && !!rewardProbe.visible
      && !!rewardProbe.narrativeVisible
      && /命盘档案/.test(rewardProbe.narrativeText || '')
      && /先选牌或付费跳过/.test(rewardProbe.nextStepPendingText || '')
      && rewardProbe.continueDisabledBefore === true
      && rewardProbe.rewardCardRole === 'button'
      && rewardProbe.rewardCardTabIndex === '0'
      && rewardProbe.rewardCardAriaPressed === 'false'
      && rewardProbe.rewardCardAriaDisabled === 'false'
      && /选择奖励卡牌/.test(rewardProbe.rewardCardAriaLabel || '')
      && /断命问锋/.test(rewardProbe.narrativeText || '')
      && /命途结算回响/.test(rewardProbe.summary || '')
      && /破命流/.test(rewardProbe.summary || '')
      && /本场推进 2 个阶段/.test(rewardProbe.status || '')
      && rewardProbe.entries.some((item) => /碎誓试锋/.test(item.text))
      && rewardProbe.entries.some((item) => /裂阵逐锋/.test(item.text))
      && rewardProbe.entries.some((item) => /下一阶段：登峰 · 断命问锋/.test(item.text))
      && rewardProbe.rewardPayload?.entryCount === 2
      && rewardProbe.rewardPayload?.pathId === 'shatter'
      && rewardProbe.rewardPayload?.narrative?.kicker === '命盘档案',
    JSON.stringify(rewardProbe || null)
  );

  const rewardRequiredFeedbackProbe = await page.evaluate(() => {
    game.rewardCardSelected = false;
    game.continueAfterReward();
    const nextStep = document.getElementById('reward-next-step-card');
    const continueBtn = document.getElementById('continue-reward-btn');
    const battleLog = document.getElementById('battle-log');
    return {
      text: nextStep?.textContent?.replace(/\s+/g, ' ').trim() || '',
      state: nextStep?.dataset.rewardNextState || '',
      role: nextStep?.getAttribute('role') || '',
      live: nextStep?.getAttribute('aria-live') || '',
      visible: !!nextStep
        && getComputedStyle(nextStep).display !== 'none'
        && getComputedStyle(nextStep).visibility !== 'hidden',
      continueDisabled: !!continueBtn?.disabled,
      battleLogHidden: !battleLog || getComputedStyle(battleLog).display === 'none',
      rewardCardSelected: !!game.rewardCardSelected
    };
  });

  add(
    'reward blocked continue uses a visible inline live status while the battle log is suppressed',
    /请先选择一张卡牌奖励/.test(rewardRequiredFeedbackProbe.text)
      && rewardRequiredFeedbackProbe.state === 'required'
      && rewardRequiredFeedbackProbe.role === 'status'
      && rewardRequiredFeedbackProbe.live === 'polite'
      && rewardRequiredFeedbackProbe.visible === true
      && rewardRequiredFeedbackProbe.continueDisabled === true
      && rewardRequiredFeedbackProbe.battleLogHidden === true
      && rewardRequiredFeedbackProbe.rewardCardSelected === false,
    JSON.stringify(rewardRequiredFeedbackProbe)
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo(0, 0);
  });

  let rewardCardFocused = false;
  let rewardCardTabCount = 0;
  for (; rewardCardTabCount < 12; rewardCardTabCount += 1) {
    await page.keyboard.press('Tab');
    rewardCardFocused = await page.evaluate(() => {
      const firstRewardCard = document.querySelector('#reward-cards .reward-card');
      return document.activeElement === firstRewardCard;
    });
    if (rewardCardFocused) {
      break;
    }
  }

  if (rewardCardFocused) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(80);
  }

  const rewardKeyboardProbe = await page.evaluate((tabCount) => {
    const firstRewardCard = document.querySelector('#reward-cards .reward-card');
    const continueBtn = document.getElementById('continue-reward-btn');
    const nextStep = document.getElementById('reward-next-step-card');
    const active = document.activeElement;
    const rect = active && typeof active.getBoundingClientRect === 'function'
      ? active.getBoundingClientRect()
      : null;
    const centerX = rect ? Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2)) : null;
    const centerY = rect ? Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2)) : null;
    const hit = rect ? document.elementFromPoint(centerX, centerY) : null;
    const hitMatches = !!active && !!hit && (hit === active || active.contains(hit) || hit.contains(active));
    return {
      tabCount,
      focusedFirstRewardCard: active === firstRewardCard,
      rewardCardSelected: !!game.rewardCardSelected,
      continueDisabledAfter: !!continueBtn?.disabled,
      nextStepText: nextStep?.textContent?.replace(/\s+/g, ' ').trim() || '',
      ariaPressed: firstRewardCard?.getAttribute('aria-pressed') || '',
      ariaDisabled: firstRewardCard?.getAttribute('aria-disabled') || '',
      activeTag: active?.tagName || '',
      activeRole: active?.getAttribute?.('role') || '',
      activeInViewport: !!rect
        && rect.width > 0
        && rect.height > 0
        && rect.top >= 0
        && rect.left >= 0
        && rect.bottom <= window.innerHeight
        && rect.right <= window.innerWidth,
      hitMatches
    };
  }, rewardCardTabCount + 1);

  add(
    'reward screen disables continue until a reward card is selected and then exposes the map return step',
    rewardCardFocused === true
      && rewardKeyboardProbe.tabCount <= 12
      && rewardKeyboardProbe.focusedFirstRewardCard === true
      && rewardKeyboardProbe.rewardCardSelected === true
      && rewardKeyboardProbe.continueDisabledAfter === false
      && /已选定奖励，可继续回章节地图/.test(rewardKeyboardProbe.nextStepText || '')
      && rewardKeyboardProbe.ariaPressed === 'true'
      && rewardKeyboardProbe.ariaDisabled === 'true'
      && rewardKeyboardProbe.activeRole === 'button'
      && rewardKeyboardProbe.activeInViewport === true
      && rewardKeyboardProbe.hitMatches === true,
    JSON.stringify(rewardKeyboardProbe || null)
  );

  await safeScreenshot(page, path.join(outDir, 'reward-run-path-meta.png'));

  await page.goto(`${baseUrl}?autotest=guest-battle&character=linFeng&destiny=foldedEdge&spirit=swordWraith&path=shatter&realm=1&battleType=normal`, {
    waitUntil: 'domcontentloaded'
  });
  await page.waitForTimeout(1200);

  const finalRewardProbe = await page.evaluate(() => {
    if (!window.game || typeof game.handleRunPathProgress !== 'function') {
      return { ok: false, reason: 'final_run_path_api_missing' };
    }

    if (game.player && typeof game.player.setRunPath === 'function') {
      game.player.setRunPath('shatter');
    }
    const progress = game.player?.runPathProgress
      || (game.player && typeof game.player.ensureRunPathProgress === 'function'
        ? game.player.ensureRunPathProgress()
        : null);
    if (!progress) {
      return { ok: false, reason: 'final_progress_missing' };
    }

    game.lastRunPathRewardMeta = null;
    game.currentScreen = 'battle-screen';
    game.currentBattleNode = { type: 'boss', id: 991099, completed: false };
    progress.pathId = 'shatter';
    progress.currentPhaseIndex = 2;
    progress.phaseProgress = 0;
    progress.completedPhases = ['shatter_opening', 'shatter_mid'];
    progress.rewardHistory = [];
    progress.completed = false;
    progress.lastRewardText = '';

    game.handleRunPathProgress('bossWin', 1, { nodeType: 'boss' });
    game.showRewardScreen(180, false, null, 36, null);

    const panel = document.getElementById('reward-run-path-meta');
    const narrative = document.getElementById('reward-narrative-brief');
    const crest = panel?.querySelector('.reward-run-path-crest');
    const finale = panel?.querySelector('.reward-run-path-finale');
    const archive = panel?.querySelector('.reward-run-path-archive');
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const sanctum = typeof game.getSanctumOverviewData === 'function'
      ? game.getSanctumOverviewData()
      : null;

    return {
      ok: !!panel && !!crest && !!finale && !!archive,
      panelClass: panel?.className || '',
      narrativeText: narrative?.textContent?.replace(/\s+/g, ' ').trim() || '',
      crestText: crest?.textContent?.replace(/\s+/g, ' ').trim() || '',
      finaleText: finale?.textContent?.replace(/\s+/g, ' ').trim() || '',
      archiveText: archive?.textContent?.replace(/\s+/g, ' ').trim() || '',
      status: panel?.querySelector('.reward-run-path-status')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      payload: payload?.reward?.runPath || null,
      recentUnlocks: Array.isArray(sanctum?.recentUnlocks) ? sanctum.recentUnlocks : []
    };
  });

  add(
    'reward screen upgrades completed run paths into a finale crest, archive feedback, and sanctum unlock history',
    !!finalRewardProbe?.ok
      && /\bis-complete\b/.test(finalRewardProbe.panelClass || '')
      && /圆满徽记已铭刻/.test(finalRewardProbe.crestText || '')
      && /命途圆满/.test(finalRewardProbe.status || '')
      && /命盘档案/.test(finalRewardProbe.narrativeText || '')
      && /洞府已收录/.test(finalRewardProbe.narrativeText || '')
      && /三段目标已全部兑现/.test(finalRewardProbe.finaleText || '')
      && /已收入洞府/.test(finalRewardProbe.archiveText || '')
      && /断命战录/.test(finalRewardProbe.archiveText || '')
      && finalRewardProbe.payload?.completed === true
      && finalRewardProbe.payload?.entryCount === 1
      && finalRewardProbe.payload?.archive?.recordName === '断命战录'
      && /洞府已收录/.test(finalRewardProbe.payload?.narrative?.title || '')
      && finalRewardProbe.recentUnlocks.some((entry) => entry?.type === 'run_path' && /命途碑廊/.test(entry?.note || '')),
    JSON.stringify(finalRewardProbe || null)
  );

  await safeScreenshot(page, path.join(outDir, 'reward-run-path-finale.png'));

  const cleanupProbe = await page.evaluate(() => {
    if (!window.game) return { ok: false, reason: 'no_game' };
    game.rewardCardSelected = true;
    game.continueAfterReward();
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    return {
      ok: game.currentScreen === 'map-screen' && game.lastRunPathRewardMeta === null,
      currentScreen: game.currentScreen,
      rewardPayload: payload?.reward || null
    };
  });

  add(
    'reward continuation clears transient run path settlement state after leaving reward screen',
    !!cleanupProbe?.ok && cleanupProbe.rewardPayload === null,
    JSON.stringify(cleanupProbe || null)
  );

  await page.goto(`${baseUrl}?autotest=guest-battle&character=linFeng&destiny=foldedEdge&spirit=swordWraith&path=insight&realm=1&battleType=normal`, {
    waitUntil: 'domcontentloaded'
  });
  await page.waitForTimeout(1200);

  const expeditionRewardProbe = await page.evaluate(() => {
    if (!window.game || typeof game.finalizeExpeditionChapter !== 'function') {
      return { ok: false, reason: 'expedition_finalize_missing' };
    }

    let state = typeof game.getExpeditionState === 'function' ? game.getExpeditionState() : null;
    if (!state && typeof game.initializeExpeditionForRealm === 'function') {
      game.initializeExpeditionForRealm(game.player?.realm || 1, true);
      state = typeof game.getExpeditionState === 'function' ? game.getExpeditionState() : null;
    }
    if (!state) {
      return { ok: false, reason: 'expedition_state_missing' };
    }

    const nodeType = state?.activeNemesis?.triggerNodeTypes?.[0];
    if (nodeType && typeof game.applyExpeditionBattleModifiers === 'function' && typeof game.recordExpeditionBattleVictory === 'function') {
      const enemies = game.applyExpeditionBattleModifiers([
        {
          id: 'reward_audit_enemy',
          name: '校验敌影',
          hp: 80,
          maxHp: 80,
          patterns: [{ type: 'attack', value: 12, intent: '压测' }]
        }
      ], { type: nodeType });
      game.recordExpeditionBattleVictory({ type: nodeType }, enemies);
    }

    const slate = game.finalizeExpeditionChapter('realm_clear');
    if (!slate) {
      return { ok: false, reason: 'expedition_finalize_failed' };
    }

    game.lastRunPathRewardMeta = null;
    game.showRewardScreen(180, false, null, 36, null);

    const panel = document.getElementById('reward-expedition-meta');
    const narrative = document.getElementById('reward-narrative-brief');
    const lines = Array.from(panel?.querySelectorAll('.reward-expedition-line') || []);
    const chips = Array.from(panel?.querySelectorAll('.reward-expedition-chip') || []);
    const chapterArcNode = panel?.querySelector('[data-season-board-chapter-arc-reward="true"]') || null;
    const chapterArcChip = panel?.querySelector('[data-season-board-chip="chapter-arc"]') || null;
    const chapterArcPressureChip = panel?.querySelector('[data-season-board-chip="chapter-arc-pressure"]') || null;
    const chapterArcObjectiveChip = panel?.querySelector('[data-season-board-chip="chapter-arc-objective"]') || null;
    const chapterArcButton = chapterArcNode?.querySelector('[data-season-board-handoff-cta="true"]') || null;
    const chapterArcDrillButtons = Array.from(chapterArcNode?.querySelectorAll('[data-season-board-chapter-drill-cta="true"]') || []);
    const chapterArcDrillButton = chapterArcDrillButtons[0] || null;
    const chapterArcDrillButtonDatasets = chapterArcDrillButtons.map(button => ({ ...button.dataset }));
    const chapterArcDrillButtonTexts = chapterArcDrillButtons.map(button => button.textContent?.replace(/\s+/g, ' ').trim() || '');
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;

    return {
      ok: !!panel && !!game.lastExpeditionRewardMeta,
      panelVisible: !!panel && getComputedStyle(panel).display !== 'none' && getComputedStyle(panel).visibility !== 'hidden',
      narrativeVisible: !!narrative && getComputedStyle(narrative).display !== 'none' && getComputedStyle(narrative).visibility !== 'hidden',
      title: panel?.querySelector('.reward-expedition-title')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      score: panel?.querySelector('.reward-expedition-score')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      advice: panel?.querySelector('.reward-expedition-advice')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      narrativeText: narrative?.textContent?.replace(/\s+/g, ' ').trim() || '',
      lineTexts: lines.map((entry) => entry.textContent?.replace(/\s+/g, ' ').trim() || ''),
      chipTexts: chips.map((entry) => entry.textContent?.replace(/\s+/g, ' ').trim() || ''),
      chapterArcText: chapterArcNode?.textContent?.replace(/\s+/g, ' ').trim() || '',
      chapterArcChipText: chapterArcChip?.textContent?.replace(/\s+/g, ' ').trim() || '',
      chapterArcPressureChipText: chapterArcPressureChip?.textContent?.replace(/\s+/g, ' ').trim() || '',
      chapterArcObjectiveChipText: chapterArcObjectiveChip?.textContent?.replace(/\s+/g, ' ').trim() || '',
      chapterArcButtonCount: chapterArcNode?.querySelectorAll('button').length || 0,
      chapterArcButtonText: chapterArcButton?.textContent?.replace(/\s+/g, ' ').trim() || '',
      chapterArcButtonDataset: chapterArcButton ? { ...chapterArcButton.dataset } : null,
      chapterArcDrillButtonCount: chapterArcDrillButtons.length,
      chapterArcDrillButtonTexts,
      chapterArcDrillButtonDatasets,
      chapterArcDrillButtonModes: chapterArcDrillButtonDatasets.map(dataset => dataset.seasonBoardChapterDrillMode || ''),
      chapterArcDrillButtonText: chapterArcDrillButton?.textContent?.replace(/\s+/g, ' ').trim() || '',
      chapterArcDrillButtonDataset: chapterArcDrillButton ? { ...chapterArcDrillButton.dataset } : null,
      chapterArcDataset: chapterArcNode ? { ...chapterArcNode.dataset } : null,
      rewardPayload: payload?.reward?.expedition || null,
      latestSlateId: payload?.expedition?.latestSlate?.id || null,
      rewardMetaId: game.lastExpeditionRewardMeta?.id || null
    };
  });

  add(
    'reward screen shows expedition settlement summary with grading, diagnostics, and reward payload mirror',
    !!expeditionRewardProbe?.ok
      && !!expeditionRewardProbe.panelVisible
      && !!expeditionRewardProbe.narrativeVisible
      && typeof expeditionRewardProbe.score === 'string'
      && expeditionRewardProbe.score.length > 0
      && typeof expeditionRewardProbe.title === 'string'
      && expeditionRewardProbe.title.length > 0
      && typeof expeditionRewardProbe.advice === 'string'
      && expeditionRewardProbe.advice.length > 0
      && typeof expeditionRewardProbe.narrativeText === 'string'
      && expeditionRewardProbe.narrativeText.length > 0
      && expeditionRewardProbe.lineTexts.length >= 1
      && expeditionRewardProbe.chipTexts.length >= 1
      && /章程|三周|章节/.test(expeditionRewardProbe.chapterArcChipText || '')
      && typeof expeditionRewardProbe.chapterArcText === 'string'
      && expeditionRewardProbe.chapterArcText.length > 0
      && expeditionRewardProbe.chapterArcButtonCount >= 4
      && /章节|章程|档案/.test(expeditionRewardProbe.chapterArcButtonText || '')
      && expeditionRewardProbe.chapterArcDrillButtonCount === EXPECTED_CHAPTER_ARC_DRILL_MODES.length
      && expeditionRewardProbe.chapterArcDrillButtonTexts.some(text => /今日天机/.test(text))
      && expeditionRewardProbe.chapterArcDrillButtonTexts.some(text => /七日劫数/.test(text))
      && expeditionRewardProbe.chapterArcDrillButtonTexts.some(text => /众生试炼/.test(text))
      && expeditionRewardProbe.chapterArcDrillButtonDatasets.every(dataset => dataset.seasonBoardChapterDrillCta === 'true')
      && expeditionRewardProbe.chapterArcDrillButtonDatasets.every(dataset => dataset.seasonBoardChapterDrillSource === 'chapter_arc')
      && expeditionRewardProbe.chapterArcDrillButtonDatasets.every(dataset => !!dataset.seasonBoardChapterDrillChapterId)
      && expeditionRewardProbe.chapterArcDrillButtonDatasets.every(dataset => /^chapter_codex:/.test(dataset.seasonBoardChapterDrillFocusId || ''))
      && expeditionRewardProbe.chapterArcDrillButtonDatasets.some(dataset => dataset.seasonBoardChapterDrillMode === 'daily')
      && expeditionRewardProbe.chapterArcDrillButtonDatasets.some(dataset => dataset.seasonBoardChapterDrillMode === 'weekly')
      && expeditionRewardProbe.chapterArcDrillButtonDatasets.some(dataset => dataset.seasonBoardChapterDrillMode === 'global')
      && !!expeditionRewardProbe.rewardPayload?.seasonBoard?.chapterArc
      && expeditionRewardProbe.chapterArcButtonDataset?.seasonBoardHandoffSourceKey === 'chapterArc'
      && expeditionRewardProbe.chapterArcButtonDataset?.seasonBoardHandoffAction === 'collection'
      && expeditionRewardProbe.chapterArcButtonDataset?.seasonBoardHandoffValue === 'chapters'
      && expeditionRewardProbe.chapterArcButtonDataset?.seasonBoardHandoffSource === 'chapter_arc'
      && expeditionRewardProbe.chapterArcButtonDataset?.seasonBoardHandoffSourceId === expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.id
      && !!expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.objective
      && expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.objective.available !== false
      && !!expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.pressureWindow
      && typeof expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.feedbackLine === 'string'
      && expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.feedbackLine.length > 0
      && typeof expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.objective.summaryLine === 'string'
      && expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.objective.summaryLine.length > 0
      && /章势/.test(expeditionRewardProbe.chapterArcPressureChipText || '')
      && expeditionRewardProbe.chapterArcText.includes(expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.feedbackLine)
      && expeditionRewardProbe.chapterArcText.includes(expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.objective.summaryLine)
      && expeditionRewardProbe.chapterArcText.includes(
        expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.pressureWindow.reasonLine
        || expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.pressureWindow.shortLine
        || ''
      )
      && expeditionRewardProbe.chapterArcText.includes(
        expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.pressureWindow.shortLine
        || expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.pressureWindow.statusLabel
        || ''
      )
      && /章目标/.test(expeditionRewardProbe.chapterArcObjectiveChipText || '')
      && expeditionRewardProbe.chapterArcObjectiveChipText.includes(
        expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.objective.statusLabel
        || expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.objective.label
        || ''
      )
      && expeditionRewardProbe.chapterArcObjectiveChipText.includes(
        expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.objective.focusLaneLabel
        || '本周主线'
      )
      && expeditionRewardProbe.chapterArcDataset?.seasonBoardChapterArcId === expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.id
      && expeditionRewardProbe.chapterArcDataset?.seasonBoardChapterArcOpen === (expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.rescueWindow?.open ? 'true' : 'false')
      && expeditionRewardProbe.chapterArcDataset?.seasonBoardChapterArcPressureOpen === (expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.pressureWindow?.open ? 'true' : 'false')
      && expeditionRewardProbe.chapterArcDataset?.seasonBoardChapterArcPressureStatus === expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.pressureWindow.statusId
      && expeditionRewardProbe.chapterArcDataset?.seasonBoardChapterArcObjectiveId === expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.objective.id
      && expeditionRewardProbe.chapterArcDataset?.seasonBoardChapterArcObjectiveStatus === expeditionRewardProbe.rewardPayload.seasonBoard.chapterArc.objective.statusId
      && expeditionRewardProbe.rewardPayload?.id === expeditionRewardProbe.rewardMetaId
      && expeditionRewardProbe.rewardPayload?.id === expeditionRewardProbe.latestSlateId
      && typeof expeditionRewardProbe.rewardPayload?.ratingLabel === 'string'
      && expeditionRewardProbe.rewardPayload.ratingLabel.length > 0
      && typeof expeditionRewardProbe.rewardPayload?.trainingAdvice === 'string'
      && expeditionRewardProbe.rewardPayload.trainingAdvice.length > 0,
    JSON.stringify(expeditionRewardProbe || null)
  );

  const chapterArcHandoffProbe = await page.evaluate(() => {
    const button = document.querySelector('#reward-expedition-meta [data-season-board-chapter-arc-reward="true"] [data-season-board-handoff-cta="true"]');
    if (!button) return { ok: false, reason: 'chapter_arc_handoff_missing' };
    const before = {
      currentScreen: window.game?.currentScreen || '',
      section: window.game?.collectionHubState?.section || '',
      dataset: { ...button.dataset },
      text: (button.textContent || '').replace(/\s+/g, ' ').trim()
    };
    button.click();
    const notice = document.querySelector('[data-season-board-handoff-arrival="true"]');
    const last = window.game?.lastRewardSeasonBoardHandoff || null;
    const arrival = window.game?.lastRewardSeasonBoardHandoffArrivalNotice || null;
    const noticeText = (notice?.textContent || '').replace(/\s+/g, ' ').trim();
    const chapterPanel = document.querySelector('[data-collection-section="chapters"], [data-section="chapters"], #collection-chapters-panel');
    return {
      ok:
        window.game?.currentScreen === 'collection'
        && window.game?.collectionHubState?.section === 'chapters'
        && last?.sourceKey === 'chapterArc'
        && last?.action === 'collection'
        && last?.value === 'chapters'
        && last?.source === 'chapter_arc'
        && arrival?.sourceKey === 'chapterArc'
        && arrival?.value === 'chapters'
        && (!notice || notice.dataset.seasonBoardHandoffSourceKey === 'chapterArc')
        && /章节|章程|档案|已定位/.test(noticeText || before.text)
        && !!chapterPanel,
      before,
      after: {
        currentScreen: window.game?.currentScreen || '',
        section: window.game?.collectionHubState?.section || '',
        last,
        arrival,
        notice: notice ? { dataset: { ...notice.dataset }, text: noticeText } : null,
        chapterPanelFound: !!chapterPanel
      }
    };
  });

  add(
    'reward chapter-arc CTA opens chapter archive and records arrival feedback',
    !!chapterArcHandoffProbe?.ok,
    JSON.stringify(chapterArcHandoffProbe || null)
  );

  const chapterArcDrillProbe = await page.evaluate(async () => {
    const expectedModes = ['daily', 'weekly', 'global'];
    const buttons = Array.from(document.querySelectorAll('#reward-expedition-meta [data-season-board-chapter-arc-reward="true"] [data-season-board-chapter-drill-cta="true"]'));
    if (buttons.length === 0) return { ok: false, reason: 'chapter_arc_drill_missing' };
    const results = [];
    for (const mode of expectedModes) {
      const button = buttons.find(entry => entry.dataset.seasonBoardChapterDrillMode === mode);
      if (!button) {
        results.push({ mode, ok: false, reason: 'mode_button_missing' });
        continue;
      }
      const before = {
        currentScreen: window.game?.currentScreen || '',
        dataset: { ...button.dataset },
        text: (button.textContent || '').replace(/\s+/g, ' ').trim()
      };
      button.click();
      await new Promise(resolve => setTimeout(resolve, 500));
      const payload = typeof window.render_game_to_text === 'function'
        ? JSON.parse(window.render_game_to_text())
        : null;
      const focus = payload?.challenge?.trainingFocus || null;
      const focusText = document.querySelector('[data-observatory-training-focus="true"]')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const expectedFocusId = before.dataset.seasonBoardChapterDrillFocusId || `chapter_codex:${before.dataset.seasonBoardChapterDrillChapterId || ''}`;
      results.push({
        mode,
        ok:
          window.game?.currentScreen === 'challenge-screen'
          && window.game?.challengeHubState?.tab === mode
          && focus?.sourceRunId === expectedFocusId
          && focus?.guideRecordId === expectedFocusId
          && /章节演练|章节复盘|复盘/.test(focus?.trainingAdvice || '')
          && /章|章节|章程|三周/.test(focus?.sourceTitle || focus?.chapterName || focusText || '')
          && (focus?.trainingTags || []).length >= 3,
        before,
        after: {
          currentScreen: window.game?.currentScreen || '',
          tab: window.game?.challengeHubState?.tab || '',
          focus,
          focusText
        }
      });
    }
    const focusIds = results
      .map(result => result.before?.dataset?.seasonBoardChapterDrillFocusId || '')
      .filter(Boolean);
    return {
      ok: results.length === expectedModes.length
        && expectedModes.every(mode => results.some(result => result.mode === mode && result.ok))
        && new Set(focusIds).size === 1,
      expectedModes,
      results,
      focusIds
    };
  });

  add(
    'reward chapter-arc drill CTAs route chapter training focus into daily/weekly/global challenge hubs',
    !!chapterArcDrillProbe?.ok,
    JSON.stringify(chapterArcDrillProbe || null)
  );

  await safeScreenshot(page, path.join(outDir, 'reward-expedition-summary.png'));

  const expeditionCleanupProbe = await page.evaluate(() => {
    if (!window.game) return { ok: false, reason: 'no_game' };
    game.rewardCardSelected = true;
    game.continueAfterReward();
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    return {
      ok: game.currentScreen === 'map-screen' && game.lastExpeditionRewardMeta === null,
      currentScreen: game.currentScreen,
      rewardPayload: payload?.reward || null
    };
  });

  add(
    'reward continuation clears transient expedition settlement state after leaving reward screen',
    !!expeditionCleanupProbe?.ok && expeditionCleanupProbe.rewardPayload === null,
    JSON.stringify(expeditionCleanupProbe || null)
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}?autotest=guest-battle&character=linFeng&destiny=foldedEdge&spirit=swordWraith&path=insight&realm=1&battleType=normal`, {
    waitUntil: 'domcontentloaded'
  });
  await page.waitForTimeout(1200);

  const expeditionMobileProbe = await page.evaluate(() => {
    if (!window.game || typeof game.finalizeExpeditionChapter !== 'function') {
      return { ok: false, reason: 'expedition_finalize_missing_mobile' };
    }

    let state = typeof game.getExpeditionState === 'function' ? game.getExpeditionState() : null;
    if (!state && typeof game.initializeExpeditionForRealm === 'function') {
      game.initializeExpeditionForRealm(game.player?.realm || 1, true);
      state = typeof game.getExpeditionState === 'function' ? game.getExpeditionState() : null;
    }
    if (!state) {
      return { ok: false, reason: 'expedition_state_missing_mobile' };
    }

    const nodeType = state?.activeNemesis?.triggerNodeTypes?.[0];
    if (nodeType && typeof game.applyExpeditionBattleModifiers === 'function' && typeof game.recordExpeditionBattleVictory === 'function') {
      const enemies = game.applyExpeditionBattleModifiers([
        {
          id: 'reward_mobile_enemy',
          name: '校验敌影',
          hp: 80,
          maxHp: 80,
          patterns: [{ type: 'attack', value: 12, intent: '压测' }]
        }
      ], { type: nodeType });
      game.recordExpeditionBattleVictory({ type: nodeType }, enemies);
    }

    const slate = game.finalizeExpeditionChapter('realm_clear');
    if (!slate) {
      return { ok: false, reason: 'expedition_finalize_failed_mobile' };
    }

    game.lastRunPathRewardMeta = null;
    game.showRewardScreen(180, false, null, 36, null);

    const screen = document.getElementById('reward-screen');
    const sideColumn = document.querySelector('.reward-side-column');
    const panel = document.getElementById('reward-expedition-meta');
    if (panel && !panel.open) panel.open = true;
    const chapterArcNode = panel?.querySelector('[data-season-board-chapter-arc-reward="true"]') || null;
    const drillButtons = Array.from(chapterArcNode?.querySelectorAll('[data-season-board-chapter-drill-cta="true"]') || []);
    const chapterArcRect = chapterArcNode?.getBoundingClientRect() || null;
    const drillRects = drillButtons.map(button => {
      const rect = button.getBoundingClientRect();
      return {
        text: button.textContent?.replace(/\s+/g, ' ').trim() || '',
        mode: button.dataset.seasonBoardChapterDrillMode || '',
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      };
    });
    const panelRect = panel?.getBoundingClientRect() || null;
    const sideRect = sideColumn?.getBoundingClientRect() || null;

    return {
      ok: !!screen && !!panel && !!sideColumn,
      panelVisible: !!panel && getComputedStyle(panel).display !== 'none' && getComputedStyle(panel).visibility !== 'hidden',
      viewportWidth: window.innerWidth,
      screenScrollWidth: screen?.scrollWidth || 0,
      screenClientWidth: screen?.clientWidth || 0,
      sideColumnScrollWidth: sideColumn?.scrollWidth || 0,
      sideColumnClientWidth: sideColumn?.clientWidth || 0,
      panelRight: panelRect ? panelRect.right : 0,
      sideRight: sideRect ? sideRect.right : 0,
      chapterArcRight: chapterArcRect ? chapterArcRect.right : 0,
      chapterArcDrillButtonCount: drillButtons.length,
      chapterArcDrillModes: drillRects.map(rect => rect.mode),
      chapterArcDrillTexts: drillRects.map(rect => rect.text),
      chapterArcDrillRects: drillRects,
      chapterArcText: chapterArcNode?.textContent?.replace(/\s+/g, ' ').trim() || '',
      narrativeVisible: !!document.getElementById('reward-narrative-brief')
        && getComputedStyle(document.getElementById('reward-narrative-brief')).display !== 'none'
    };
  });

  add(
    'mobile reward rail keeps expedition settlement card readable without horizontal overflow',
    !!expeditionMobileProbe?.ok
      && !!expeditionMobileProbe.panelVisible
      && !!expeditionMobileProbe.narrativeVisible
      && expeditionMobileProbe.screenScrollWidth <= expeditionMobileProbe.screenClientWidth + 2
      && expeditionMobileProbe.sideColumnScrollWidth <= expeditionMobileProbe.sideColumnClientWidth + 2
      && expeditionMobileProbe.panelRight <= expeditionMobileProbe.viewportWidth + 2
      && expeditionMobileProbe.sideRight <= expeditionMobileProbe.viewportWidth + 2
      && expeditionMobileProbe.chapterArcRight <= expeditionMobileProbe.viewportWidth + 2
      && expeditionMobileProbe.chapterArcDrillButtonCount === EXPECTED_CHAPTER_ARC_DRILL_MODES.length
      && EXPECTED_CHAPTER_ARC_DRILL_MODES.every(mode => expeditionMobileProbe.chapterArcDrillModes.includes(mode))
      && expeditionMobileProbe.chapterArcDrillRects.every(rect => rect.width >= 44 && rect.height >= 40 && rect.left >= -2 && rect.right <= expeditionMobileProbe.viewportWidth + 2)
      && /章程|三周|章节/.test(expeditionMobileProbe.chapterArcText || ''),
    JSON.stringify(expeditionMobileProbe || null)
  );

  await safeScreenshot(page, path.join(outDir, 'reward-expedition-summary-mobile.png'));

  await page.setViewportSize({ width: 360, height: 780 });
  await page.waitForTimeout(120);
  const rewardMobileDenseProbe = await page.evaluate(() => {
    const screen = document.getElementById('reward-screen');
    const sideColumn = document.querySelector('.reward-side-column');
    const expeditionPanel = document.getElementById('reward-expedition-meta');
    const chapterArcNode = expeditionPanel?.querySelector('[data-season-board-chapter-arc-reward="true"]') || null;
    const drillButtons = Array.from(chapterArcNode?.querySelectorAll('[data-season-board-chapter-drill-cta="true"]') || []);
    const chips = Array.from(expeditionPanel?.querySelectorAll('[data-season-board-chip]') || []);
    const narrative = document.getElementById('reward-narrative-brief');
    const toRect = (el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const screenRect = toRect(screen);
    const sideRect = toRect(sideColumn);
    const expeditionRect = toRect(expeditionPanel);
    const chapterArcRect = toRect(chapterArcNode);
    const drillRects = drillButtons.map(button => ({
      ...toRect(button),
      mode: button.dataset.seasonBoardChapterDrillMode || '',
      text: button.textContent?.replace(/\s+/g, ' ').trim() || ''
    }));
    return {
      ok: !!screen && !!sideColumn && !!expeditionPanel && !!narrative,
      viewportWidth: window.innerWidth,
      screenScrollWidth: screen?.scrollWidth || 0,
      screenClientWidth: screen?.clientWidth || 0,
      sideScrollWidth: sideColumn?.scrollWidth || 0,
      sideClientWidth: sideColumn?.clientWidth || 0,
      expeditionScrollWidth: expeditionPanel?.scrollWidth || 0,
      expeditionClientWidth: expeditionPanel?.clientWidth || 0,
      screenRight: screenRect?.right || 0,
      sideRight: sideRect?.right || 0,
      expeditionRight: expeditionRect?.right || 0,
      chapterArcRight: chapterArcRect?.right || 0,
      chapterArcDrillButtonCount: drillButtons.length,
      chapterArcDrillModes: drillRects.map(rect => rect.mode),
      chapterArcDrillTexts: drillRects.map(rect => rect.text),
      chapterArcDrillRects: drillRects,
      chipCount: chips.length,
      titleText: expeditionPanel?.querySelector('.reward-expedition-title')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      narrativeText: narrative?.textContent?.replace(/\s+/g, ' ').trim() || '',
      chapterArcText: chapterArcNode?.textContent?.replace(/\s+/g, ' ').trim() || '',
    };
  });

  add(
    'mobile reward rail keeps expedition meta and season-board chips compact on narrower viewports',
    !!rewardMobileDenseProbe?.ok
      && rewardMobileDenseProbe.screenScrollWidth <= rewardMobileDenseProbe.screenClientWidth + 2
      && rewardMobileDenseProbe.sideScrollWidth <= rewardMobileDenseProbe.sideClientWidth + 2
      && rewardMobileDenseProbe.expeditionScrollWidth <= rewardMobileDenseProbe.expeditionClientWidth + 2
      && rewardMobileDenseProbe.screenRight <= rewardMobileDenseProbe.viewportWidth + 2
      && rewardMobileDenseProbe.sideRight <= rewardMobileDenseProbe.viewportWidth + 2
      && rewardMobileDenseProbe.expeditionRight <= rewardMobileDenseProbe.viewportWidth + 2
      && rewardMobileDenseProbe.chapterArcRight <= rewardMobileDenseProbe.viewportWidth + 2
      && rewardMobileDenseProbe.chapterArcDrillButtonCount === EXPECTED_CHAPTER_ARC_DRILL_MODES.length
      && EXPECTED_CHAPTER_ARC_DRILL_MODES.every(mode => rewardMobileDenseProbe.chapterArcDrillModes.includes(mode))
      && rewardMobileDenseProbe.chapterArcDrillTexts.every(text => text.length > 0)
      && rewardMobileDenseProbe.chapterArcDrillRects.every(rect => rect.width >= 44 && rect.height >= 40 && rect.left >= -2 && rect.right <= rewardMobileDenseProbe.viewportWidth + 2)
      && rewardMobileDenseProbe.chipCount >= 3
      && rewardMobileDenseProbe.titleText.length > 0
      && rewardMobileDenseProbe.narrativeText.length > 0
      && /章程|三周|章节/.test(rewardMobileDenseProbe.chapterArcText || ''),
    JSON.stringify(rewardMobileDenseProbe || null)
  );

  add(
    'three chapter-drill CTAs remain reachable on 360px reward rail',
    !!rewardMobileDenseProbe?.ok
      && rewardMobileDenseProbe.chapterArcDrillButtonCount === EXPECTED_CHAPTER_ARC_DRILL_MODES.length
      && EXPECTED_CHAPTER_ARC_DRILL_MODES.every(mode => rewardMobileDenseProbe.chapterArcDrillModes.includes(mode))
      && rewardMobileDenseProbe.chapterArcDrillTexts.some(text => /今日天机/.test(text))
      && rewardMobileDenseProbe.chapterArcDrillTexts.some(text => /七日劫数/.test(text))
      && rewardMobileDenseProbe.chapterArcDrillTexts.some(text => /众生试炼/.test(text))
      && rewardMobileDenseProbe.chapterArcDrillRects.every(rect => rect.width >= 44 && rect.height >= 40 && rect.left >= -2 && rect.right <= rewardMobileDenseProbe.viewportWidth + 2),
    JSON.stringify(rewardMobileDenseProbe || null)
  );

  await safeScreenshot(page, path.join(outDir, 'reward-expedition-summary-mobile-narrow.png'));

  const report = {
    baseUrl,
    findings,
    consoleErrors,
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  const failed = findings.filter((item) => !item.pass);
  await browser.close();
  if (failed.length > 0 || consoleErrors.length > 0) {
    process.exit(1);
  }
})();
