import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/web-run-path-reward-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

function recordConsoleError(text) {
  const message = String(text || '');
  if (/ERR_CONNECTION_CLOSED/.test(message)) return;
  consoleErrors.push(message);
}

async function safeScreenshot(page, outPath) {
  try {
    await page.screenshot({ path: outPath, fullPage: true, timeout: 10000 });
  } catch (err) {
    console.warn(`[browser_run_path_reward_audit] screenshot skipped: ${err?.message || err}`);
  }
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
    const entries = Array.from(panel?.querySelectorAll('.reward-run-path-entry') || []);
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;

    return {
      ok: !!panel && entries.length === 2,
      visible: !!panel && getComputedStyle(panel).display !== 'none' && getComputedStyle(panel).visibility !== 'hidden',
      narrativeVisible: !!narrative && getComputedStyle(narrative).display !== 'none' && getComputedStyle(narrative).visibility !== 'hidden',
      narrativeText: narrative?.textContent?.replace(/\s+/g, ' ').trim() || '',
      header: document.querySelector('.reward-run-path-badge')?.textContent?.replace(/\s+/g, ' ').trim() || '',
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
      && /断命问锋/.test(rewardProbe.narrativeText || '')
      && /破命流/.test(rewardProbe.header || '')
      && /本场推进 2 个阶段/.test(rewardProbe.status || '')
      && rewardProbe.entries.some((item) => /碎誓试锋/.test(item.text))
      && rewardProbe.entries.some((item) => /裂阵逐锋/.test(item.text))
      && rewardProbe.entries.some((item) => /下一阶段：登峰 · 断命问锋/.test(item.text))
      && rewardProbe.rewardPayload?.entryCount === 2
      && rewardProbe.rewardPayload?.pathId === 'shatter'
      && rewardProbe.rewardPayload?.narrative?.kicker === '命盘档案',
    JSON.stringify(rewardProbe || null)
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
      && expeditionRewardProbe.rewardPayload?.id === expeditionRewardProbe.rewardMetaId
      && expeditionRewardProbe.rewardPayload?.id === expeditionRewardProbe.latestSlateId
      && typeof expeditionRewardProbe.rewardPayload?.ratingLabel === 'string'
      && expeditionRewardProbe.rewardPayload.ratingLabel.length > 0
      && typeof expeditionRewardProbe.rewardPayload?.trainingAdvice === 'string'
      && expeditionRewardProbe.rewardPayload.trainingAdvice.length > 0,
    JSON.stringify(expeditionRewardProbe || null)
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
      && expeditionMobileProbe.sideRight <= expeditionMobileProbe.viewportWidth + 2,
    JSON.stringify(expeditionMobileProbe || null)
  );

  await safeScreenshot(page, path.join(outDir, 'reward-expedition-summary-mobile.png'));

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
