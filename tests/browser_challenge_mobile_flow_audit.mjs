import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/browser-challenge-mobile-flow-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

function rectObject(rect) {
  if (!rect) return null;
  return {
    left: Math.round(rect.left),
    right: Math.round(rect.right),
    top: Math.round(rect.top),
    bottom: Math.round(rect.bottom),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function rectFitsWidth(rect, viewportWidth) {
  return !!rect && rect.left >= 0 && rect.right <= viewportWidth;
}

function rectFitsViewport(rect, viewportWidth, viewportHeight) {
  return rectFitsWidth(rect, viewportWidth)
    && rect.top >= 0
    && rect.bottom <= viewportHeight;
}

async function waitForChallengeHubReady(page, expectedTab = 'daily') {
  await page.waitForFunction((tab) => {
    const text = (value) => (value?.textContent || '').replace(/\s+/g, ' ').trim();
    let payload = null;
    try {
      payload = typeof window.render_game_to_text === 'function'
        ? JSON.parse(window.render_game_to_text())
        : null;
    } catch {}
    const hub = payload?.challenge?.hub || null;
    const summaryText = text(document.getElementById('challenge-hub-summary'));
    const dangerChipCount = document.querySelectorAll('#challenge-hub-summary .challenge-danger-chip').length;
    return window.game?.currentScreen === 'challenge-screen'
      && hub?.activeTab === tab
      && text(document.getElementById('challenge-hub-title')).length > 0
      && /试炼压强|DRI/.test(summaryText)
      && dangerChipCount === 4
      && (hub?.dangerProfile?.axes?.length || 0) === 4;
  }, expectedTab, { timeout: 8000 });
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(String(err));
  });

  await page.addInitScript(() => {
    try {
      localStorage.removeItem('theDefierChallengeProgressV1');
      localStorage.removeItem('theDefierActiveChallengeRunV1');
      localStorage.removeItem('theDefierChallengeHubStateV1');
      localStorage.removeItem('theDefierObservatoryArchiveV1');
      localStorage.removeItem('theDefierObservatoryGuideStateV1');
      localStorage.removeItem('theDefierSave');
    } catch {}
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  await page.evaluate(() => {
    if (typeof AuthService !== 'undefined') {
      AuthService.cloudEnabled = false;
      AuthService.isInitialized = false;
      AuthService.currentUser = null;
    }
    ['auth-modal', 'save-slots-modal', 'generic-confirm-modal', 'save-conflict-modal'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });
    if (window.game?.showScreen) game.showScreen('main-menu');
  });
  await page.waitForTimeout(250);

  await page.evaluate(() => {
    if (window.game?.showChallengeHub) game.showChallengeHub('daily');
  });
  await waitForChallengeHubReady(page, 'daily').catch(() => {});

  const hubProbe = await page.evaluate(() => {
    const rectObject = (rect) => {
      if (!rect) return null;
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const shell = document.querySelector('.challenge-shell');
    const scroll = document.querySelector('.challenge-scroll-container');
    const summary = document.getElementById('challenge-hub-summary');
    const launchBtn = document.querySelector('#challenge-hub-launch .challenge-launch-btn');
    const firstReward = document.querySelector('#challenge-hub-rewards .challenge-reward-card');
    const firstRewardRect = firstReward?.getBoundingClientRect() || null;
    return {
      mode: payload?.mode || '',
      activeTab: payload?.challenge?.hub?.activeTab || '',
      title: document.getElementById('challenge-hub-title')?.textContent?.trim() || '',
      subtitle: document.getElementById('challenge-hub-subtitle')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      summaryText: summary?.textContent?.replace(/\s+/g, ' ').trim() || '',
      sideText: document.getElementById('challenge-hub-side')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      shellWidth: Math.round(shell?.getBoundingClientRect().width || 0),
      scrollWidth: Math.round(scroll?.getBoundingClientRect().width || 0),
      docScrollWidth: Math.round(document.documentElement?.scrollWidth || 0),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      tabCount: document.querySelectorAll('#challenge-screen .challenge-tab-btn').length,
      rewardCount: document.querySelectorAll('#challenge-hub-rewards .challenge-reward-card').length,
      dangerChipCount: document.querySelectorAll('#challenge-hub-summary .challenge-danger-chip').length,
      launchRect: rectObject(launchBtn?.getBoundingClientRect() || null),
      firstRewardRect: rectObject(firstRewardRect),
    };
  });
  add(
    'challenge mobile hub keeps launch CTA visible and content inside mobile width',
    !!hubProbe
      && hubProbe.mode === 'challenge-screen'
      && hubProbe.activeTab === 'daily'
      && /观星台/.test(hubProbe.title || '')
      && /观星样本|命盘|远征线索/.test(hubProbe.subtitle || '')
      && /第1章|完成线/.test(hubProbe.summaryText || '')
      && /试炼压强|DRI/.test(hubProbe.summaryText || '')
      && /难度同轴|主轴/.test(hubProbe.sideText || '')
      && hubProbe.tabCount === 3
      && hubProbe.rewardCount >= 1
      && hubProbe.dangerChipCount === 4
      && hubProbe.shellWidth >= 300
      && hubProbe.scrollWidth >= 300
      && hubProbe.docScrollWidth <= 398
      && rectFitsViewport(hubProbe.launchRect, hubProbe.viewportWidth, hubProbe.viewportHeight)
      && rectFitsWidth(hubProbe.firstRewardRect, hubProbe.viewportWidth),
    JSON.stringify(hubProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-mobile-hub.png'), 'browser_challenge_mobile_flow_audit', { timeout: 9000 });

  const rewardReachProbe = await page.evaluate(() => {
    const rectObject = (rect) => {
      if (!rect) return null;
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const firstReward = document.querySelector('#challenge-hub-rewards .challenge-reward-card');
    firstReward?.scrollIntoView({ block: 'center', inline: 'nearest' });
    const scroll = document.querySelector('.challenge-scroll-container');
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      docScrollWidth: Math.round(document.documentElement?.scrollWidth || 0),
      scrollTop: Math.round(scroll?.scrollTop || window.scrollY || 0),
      firstRewardRect: rectObject(firstReward?.getBoundingClientRect() || null),
    };
  });
  add(
    'challenge mobile reward cards can be scrolled into view without horizontal overflow',
    !!rewardReachProbe
      && rewardReachProbe.docScrollWidth <= 398
      && rewardReachProbe.scrollTop > 0
      && rectFitsViewport(rewardReachProbe.firstRewardRect, rewardReachProbe.viewportWidth, rewardReachProbe.viewportHeight),
    JSON.stringify(rewardReachProbe || null)
  );

  await page.evaluate(() => {
    if (window.game?.beginChallengeStart) game.beginChallengeStart('daily');
  });
  await page.waitForTimeout(300);

  const guestPromptVisible = await page.locator('#generic-confirm-modal.active #generic-cancel-btn').isVisible().catch(() => false);
  if (guestPromptVisible) {
    await page.evaluate(() => {
      document.getElementById('generic-cancel-btn')?.click();
    });
    await page.waitForTimeout(450);
  }

  const startSelectionProbe = await page.evaluate(() => {
    const rectObject = (rect) => {
      if (!rect) return null;
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const banner = document.getElementById('challenge-selection-banner');
    const confirmBtn = document.getElementById('confirm-character-btn');
    return {
      mode: payload?.mode || '',
      pending: payload?.challenge?.pending || null,
      bannerText: banner?.textContent?.replace(/\s+/g, ' ').trim() || '',
      bannerRect: rectObject(banner?.getBoundingClientRect() || null),
      confirmText: confirmBtn?.textContent?.replace(/\s+/g, ' ').trim() || '',
      confirmRect: rectObject(confirmBtn?.getBoundingClientRect() || null),
      lockedCount: document.querySelectorAll('.character-card.challenge-card-locked').length,
      selectedCount: document.querySelectorAll('.character-card.selected').length,
    };
  });
  add(
    'challenge mobile start selection keeps the locked banner and confirm action fully reachable',
    !!startSelectionProbe
      && startSelectionProbe.mode === 'character-selection-screen'
      && startSelectionProbe.pending?.mode === 'daily'
      && /今日天机|第1章/.test(startSelectionProbe.bannerText || '')
      && /DRI|主轴/.test(startSelectionProbe.bannerText || '')
      && /开局/.test(startSelectionProbe.confirmText || '')
      && startSelectionProbe.lockedCount >= 1
      && startSelectionProbe.selectedCount === 1
      && !!startSelectionProbe.bannerRect
      && startSelectionProbe.bannerRect.left >= 0
      && startSelectionProbe.bannerRect.right <= 390
      && !!startSelectionProbe.confirmRect
      && startSelectionProbe.confirmRect.left >= 0
      && startSelectionProbe.confirmRect.right <= 390,
    JSON.stringify(startSelectionProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-mobile-start-selection.png'), 'browser_challenge_mobile_flow_audit', { timeout: 9000 });

  await page.evaluate(() => {
    document.getElementById('confirm-character-btn')?.click();
  });
  await page.waitForTimeout(900);

  const activeBannerProbe = await page.evaluate(() => {
    const rectObject = (rect) => {
      if (!rect) return null;
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const banner = document.getElementById('challenge-run-banner');
    const focus = banner?.querySelector('.challenge-run-focus');
    return {
      mode: payload?.mode || '',
      activeRun: payload?.challenge?.activeRun || null,
      bannerText: banner?.textContent?.replace(/\s+/g, ' ').trim() || '',
      focusText: focus?.textContent?.replace(/\s+/g, ' ').trim() || '',
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      bannerRect: rectObject(banner?.getBoundingClientRect() || null),
      focusRect: rectObject(focus?.getBoundingClientRect() || null),
      runDestinyId: payload?.player?.runDestiny?.id || '',
      spiritId: payload?.player?.spiritCompanion?.id || '',
    };
  });
  add(
    'challenge mobile active banner keeps shared danger axis and training focus visible after launch',
    !!activeBannerProbe
      && activeBannerProbe.mode === 'map-screen'
      && activeBannerProbe.activeRun?.mode === 'daily'
      && /今日天机|第 3 重|第1章/.test(activeBannerProbe.bannerText || '')
      && /DRI/.test(activeBannerProbe.bannerText || '')
      && !!activeBannerProbe.runDestinyId
      && !!activeBannerProbe.spiritId
      && !!activeBannerProbe.bannerRect
      && rectFitsViewport(activeBannerProbe.bannerRect, activeBannerProbe.viewportWidth, activeBannerProbe.viewportHeight)
      && (!activeBannerProbe.focusRect || rectFitsViewport(activeBannerProbe.focusRect, activeBannerProbe.viewportWidth, activeBannerProbe.viewportHeight)),
    JSON.stringify(activeBannerProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-mobile-active-banner.png'), 'browser_challenge_mobile_flow_audit', { timeout: 9000 });

  await page.evaluate(() => {
    if (window.game?.activeChallengeRun && window.game?.finalizeActiveChallengeRun) {
      game.finalizeActiveChallengeRun({ completed: true, reason: 'goal_reached' });
      game.showChallengeHub?.('daily');
    }
  });
  await page.waitForTimeout(350);

  await page.evaluate(() => {
    const btn = document.querySelector('#challenge-hub-records [data-replay-record-id]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(350);

  const replayGuestPromptVisible = await page.locator('#generic-confirm-modal.active #generic-cancel-btn').isVisible().catch(() => false);
  if (replayGuestPromptVisible) {
    await page.evaluate(() => {
      document.getElementById('generic-cancel-btn')?.click();
    });
    await page.waitForTimeout(450);
  }

  const replaySelectionProbe = await page.evaluate(() => {
    const rectObject = (rect) => {
      if (!rect) return null;
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const banner = document.getElementById('challenge-selection-banner');
    const confirmBtn = document.getElementById('confirm-character-btn');
    return {
      mode: payload?.mode || '',
      pending: payload?.challenge?.pending || null,
      bannerText: banner?.textContent?.replace(/\s+/g, ' ').trim() || '',
      insightText: banner?.querySelector('.challenge-record-insight')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      confirmText: confirmBtn?.textContent?.replace(/\s+/g, ' ').trim() || '',
      bannerRect: rectObject(banner?.getBoundingClientRect() || null),
      confirmRect: rectObject(confirmBtn?.getBoundingClientRect() || null),
    };
  });
  add(
    'challenge mobile replay selection keeps replay-only context and training focus visible',
    !!replaySelectionProbe
      && replaySelectionProbe.mode === 'character-selection-screen'
      && replaySelectionProbe.pending?.replayOnly === true
      && /^D-/.test(replaySelectionProbe.pending?.seedSignature || '')
      && /观星回放/.test(replaySelectionProbe.bannerText || '')
      && /回放复刻|回放试错/.test(replaySelectionProbe.insightText || '')
      && /演练目标|稳血收官|高压过线|补件断档/.test(replaySelectionProbe.insightText || '')
      && /回放命盘/.test(replaySelectionProbe.confirmText || '')
      && !!replaySelectionProbe.bannerRect
      && replaySelectionProbe.bannerRect.left >= 0
      && replaySelectionProbe.bannerRect.right <= 390
      && !!replaySelectionProbe.confirmRect
      && replaySelectionProbe.confirmRect.left >= 0
      && replaySelectionProbe.confirmRect.right <= 390,
    JSON.stringify(replaySelectionProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-mobile-replay-selection.png'), 'browser_challenge_mobile_flow_audit', { timeout: 9000 });

  await page.evaluate(() => {
    document.getElementById('confirm-character-btn')?.click();
  });
  await page.waitForTimeout(900);

  const replayBannerProbe = await page.evaluate(() => {
    const rectObject = (rect) => {
      if (!rect) return null;
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const banner = document.getElementById('challenge-run-banner');
    const focus = banner?.querySelector('.challenge-run-focus');
    return {
      mode: payload?.mode || '',
      activeRun: payload?.challenge?.activeRun || null,
      bannerText: banner?.textContent?.replace(/\s+/g, ' ').trim() || '',
      focusText: focus?.textContent?.replace(/\s+/g, ' ').trim() || '',
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      bannerRect: rectObject(banner?.getBoundingClientRect() || null),
      focusRect: rectObject(focus?.getBoundingClientRect() || null),
    };
  });
  add(
    'challenge mobile replay banner preserves replay-only state and sample focus without overflow',
    !!replayBannerProbe
      && replayBannerProbe.mode === 'map-screen'
      && replayBannerProbe.activeRun?.replayOnly === true
      && /^D-/.test(replayBannerProbe.activeRun?.seedSignature || '')
      && /观星回放/.test(replayBannerProbe.bannerText || '')
      && /命盘签/.test(replayBannerProbe.bannerText || '')
      && /不计奖励/.test(replayBannerProbe.bannerText || '')
      && /训练重点/.test(replayBannerProbe.focusText || '')
      && !!replayBannerProbe.bannerRect
      && rectFitsViewport(replayBannerProbe.bannerRect, replayBannerProbe.viewportWidth, replayBannerProbe.viewportHeight)
      && (!replayBannerProbe.focusRect || rectFitsViewport(replayBannerProbe.focusRect, replayBannerProbe.viewportWidth, replayBannerProbe.viewportHeight)),
    JSON.stringify(replayBannerProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-mobile-replay-banner.png'), 'browser_challenge_mobile_flow_audit', { timeout: 9000 });

  await page.evaluate(() => {
    if (window.game?.activeChallengeRun && window.game?.finalizeActiveChallengeRun) {
      game.finalizeActiveChallengeRun({ completed: false, reason: 'battle_lost' });
      game.showChallengeHub?.('daily');
    }
  });
  await page.waitForTimeout(350);

  const archiveProbe = await page.evaluate(() => {
    const rectObject = (rect) => {
      if (!rect) return null;
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const shell = document.querySelector('.challenge-shell');
    const scroll = document.querySelector('.challenge-scroll-container');
    const records = document.getElementById('challenge-hub-records');
    const lineRects = Array.from(document.querySelectorAll('#challenge-hub-records .challenge-record-insight-line')).map((el) => rectObject(el.getBoundingClientRect()));
    return {
      shellWidth: Math.round(shell?.getBoundingClientRect().width || 0),
      scrollWidth: Math.round(scroll?.getBoundingClientRect().width || 0),
      recordsWidth: Math.round(records?.getBoundingClientRect().width || 0),
      docScrollWidth: Math.round(document.documentElement?.scrollWidth || 0),
      lineRects,
      latestInsightText: Array.from(document.querySelectorAll('#challenge-hub-side .codex-side-card'))
        .find((card) => /观星留痕/.test(card.textContent || ''))
        ?.textContent?.replace(/\s+/g, ' ').trim() || '',
    };
  });
  add(
    'challenge mobile archive insights remain readable after replay loss without horizontal overflow',
    !!archiveProbe
      && archiveProbe.shellWidth >= 300
      && archiveProbe.scrollWidth >= 300
      && archiveProbe.recordsWidth >= 250
      && archiveProbe.docScrollWidth <= 398
      && archiveProbe.lineRects.length >= 3
      && archiveProbe.lineRects.every((rect) => rect && rect.left >= 0 && rect.right <= 390)
      && /回放试错|补救建议|资源缺口/.test(archiveProbe.latestInsightText || ''),
    JSON.stringify(archiveProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-mobile-archive.png'), 'browser_challenge_mobile_flow_audit', { timeout: 9000 });

  await page.evaluate(() => {
    if (typeof game.recordSeasonVerificationResult === 'function') {
      const weekMeta = typeof game.getHeavenlyMandateWeekMeta === 'function'
        ? game.getHeavenlyMandateWeekMeta()
        : { weekTag: 'mobile', weekLabel: '本周轮转' };
      const now = Date.now();
      game.recordSeasonVerificationResult({
        recordId: `mobile_weekly_pvp_${weekMeta?.weekTag || 'mobile'}`,
        weekTag: weekMeta?.weekTag || '',
        weekLabel: weekMeta?.weekLabel || '',
        role: 'primary',
        sourceMode: 'pvp',
        sourceModeLabel: '天道榜',
        phaseId: 'ranking',
        phaseLabel: '定榜期',
        settlementOutcomeId: 'positive_sheet',
        settlementOutcomeLabel: '正卷',
        sourceLabel: '天道榜 · 主验证',
        label: '天道榜主验证',
        resultStatus: 'verified',
        writebackMode: 'upgrade_verdict',
        writebackLine: '天道榜主验证已入档。',
        resolvedRunId: 'mobile_weekly_pvp_record',
        chapterIndex: 6,
        proofQuality: 'solid',
        lineageStyle: '镜战压强',
        summaryLine: '天道榜主验证已经落入周判记录。',
        detailLine: '这条周判记录会作为 weekly archive 的最新样本。',
        statusLine: '天道榜 · 通过',
        anchorSection: 'pvp',
        priority: 1,
        createdAt: now - 1000,
        updatedAt: now - 1000
      });
      game.recordSeasonVerificationResult({
        recordId: `mobile_weekly_challenge_${weekMeta?.weekTag || 'mobile'}`,
        weekTag: weekMeta?.weekTag || '',
        weekLabel: weekMeta?.weekLabel || '',
        role: 'side',
        sourceMode: 'challenge',
        sourceModeLabel: '七日劫数',
        phaseId: 'lockline',
        phaseLabel: '锁线期',
        settlementOutcomeId: 'locking_sheet',
        settlementOutcomeLabel: '押卷中',
        sourceLabel: '七日劫数 · 旁验证',
        label: '周挑战旁验证',
        resultStatus: 'verified',
        writebackMode: 'boost_recommendation',
        writebackLine: '周挑战旁验证补齐样本。',
        resolvedRunId: 'mobile_weekly_challenge_record',
        chapterIndex: 6,
        proofQuality: 'thin',
        lineageStyle: '旁证补样',
        summaryLine: '周挑战旁验证已入档。',
        detailLine: '这条周判记录可直接回到周挑战复核。',
        statusLine: '七日劫数 · 通过',
        anchorSection: 'challenge',
        priority: 2,
        createdAt: now - 2000,
        updatedAt: now - 2000
      });
      game.recordSeasonVerificationResult({
        recordId: `mobile_weekly_endless_${weekMeta?.weekTag || 'mobile'}`,
        weekTag: weekMeta?.weekTag || '',
        weekLabel: weekMeta?.weekLabel || '',
        role: 'primary',
        sourceMode: 'endless',
        sourceModeLabel: '无尽试炼',
        phaseId: 'closing',
        phaseLabel: '收束期',
        settlementOutcomeId: 'risky_sheet',
        settlementOutcomeLabel: '险卷',
        debtStatus: 'degraded',
        sourceLabel: '无尽试炼 · 主验证',
        label: '无尽试炼主验证',
        resultStatus: 'failed',
        writebackMode: 'degrade_recommendation',
        writebackLine: '无尽试炼主验证失利。',
        resolvedRunId: 'mobile_weekly_endless_record',
        chapterIndex: 7,
        proofQuality: 'solid',
        lineageStyle: '长线压测',
        summaryLine: '无尽试炼主验证失利。',
        detailLine: '这条周判记录将用于回看失利样本。',
        statusLine: '无尽试炼 · 失利',
        anchorSection: 'endless',
        priority: 3,
        createdAt: now - 3000,
        updatedAt: now - 3000
      });
      game.recordSeasonVerificationResult({
        recordId: `mobile_weekly_map_${weekMeta?.weekTag || 'mobile'}`,
        weekTag: weekMeta?.weekTag || '',
        weekLabel: weekMeta?.weekLabel || '',
        role: 'side',
        sourceMode: 'map',
        sourceModeLabel: '山海绘卷',
        phaseId: 'sampling',
        phaseLabel: '采样期',
        carryIntoNextWeek: true,
        carryIntoWeekTag: `${weekMeta?.weekTag || 'mobile'}-next`,
        sourceLabel: '山海绘卷 · 旁验证',
        label: '地图旁验证',
        resultStatus: 'deferred',
        writebackMode: 'carry_forward',
        writebackLine: '地图旁验证延期到下周继续回写。',
        resolvedRunId: 'mobile_weekly_map_record',
        chapterIndex: 5,
        proofQuality: 'thin',
        lineageStyle: '外场补样',
        summaryLine: '地图旁验证延期入档。',
        detailLine: '这条周判记录会保留到下周继续补证。',
        statusLine: '山海绘卷 · 延期',
        anchorSection: 'map',
        priority: 4,
        createdAt: now - 4000,
        updatedAt: now - 4000
      });
    }
    game.showChallengeHub?.('weekly');
  });
  await page.waitForTimeout(450);

  const weeklyVerificationProbe = await page.evaluate(() => {
    const rectObject = (rect) => {
      if (!rect) return null;
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())?.challenge?.verificationArchive
      : null;
    const section = document.querySelector('[data-season-verification-archive="true"]');
    const toolbar = document.querySelector('[data-season-verification-toolbar="true"]');
    const sourceSelect = document.querySelector('[data-season-verification-filter="sourceMode"]');
    const resultSelect = document.querySelector('[data-season-verification-filter="resultStatus"]');
    const phaseSelect = document.querySelector('[data-season-verification-filter="phaseKey"]');
    const trajectorySelect = document.querySelector('[data-season-verification-filter="trajectoryKey"]');
    const roleSelect = document.querySelector('[data-season-verification-filter="role"]');
    const sortSelect = document.querySelector('[data-season-verification-filter="sortBy"]');
    const entries = Array.from(document.querySelectorAll('[data-season-verification-archive-entry="true"]'));
    return {
      payload,
      sectionRect: rectObject(section?.getBoundingClientRect() || null),
      toolbarRect: rectObject(toolbar?.getBoundingClientRect() || null),
      selectRects: [sourceSelect, resultSelect, phaseSelect, trajectorySelect, roleSelect, sortSelect].map((node) => rectObject(node?.getBoundingClientRect() || null)),
      entryRects: entries.map((node) => rectObject(node.getBoundingClientRect() || null)),
      entryAnchors: entries.map((node) => node.getAttribute('data-season-verification-anchor') || ''),
      entryStatuses: entries.map((node) => node.getAttribute('data-season-verification-result-status') || ''),
      entryTrajectoryKeys: entries.map((node) => node.getAttribute('data-season-verification-trajectory-key') || ''),
      entryRoles: entries.map((node) => node.getAttribute('data-season-verification-role') || ''),
      docScrollWidth: Math.round(document.documentElement?.scrollWidth || 0),
      totalRecordsText: section?.getAttribute('data-season-verification-total') || '',
      filteredRecordsText: section?.getAttribute('data-season-verification-filtered') || '',
      titleText: section?.textContent?.replace(/\s+/g, ' ').trim() || '',
    };
  });
  add(
    'challenge mobile weekly verification archive keeps filter toolbar and entries inside the viewport',
    !!weeklyVerificationProbe
      && weeklyVerificationProbe.payload?.filterState?.sourceMode === 'all'
      && weeklyVerificationProbe.payload?.filterState?.trajectoryKey === 'all'
      && weeklyVerificationProbe.payload?.filteredCount === 4
      && weeklyVerificationProbe.payload?.latestAnchorSection === 'pvp'
      && weeklyVerificationProbe.payload?.latestActionValue === 'pvp-screen'
      && weeklyVerificationProbe.sectionRect
      && weeklyVerificationProbe.sectionRect.left >= 0
      && weeklyVerificationProbe.sectionRect.right <= 390
      && weeklyVerificationProbe.toolbarRect
      && weeklyVerificationProbe.toolbarRect.left >= 0
      && weeklyVerificationProbe.toolbarRect.right <= 390
      && weeklyVerificationProbe.selectRects.length === 6
      && weeklyVerificationProbe.selectRects.every((rect) => rect && rect.left >= 0 && rect.right <= 390)
      && weeklyVerificationProbe.entryRects.length >= 4
      && weeklyVerificationProbe.entryRects.every((rect) => rect && rect.left >= 0 && rect.right <= 390)
      && weeklyVerificationProbe.entryTrajectoryKeys.includes('carry_forward')
      && weeklyVerificationProbe.docScrollWidth <= 398
      && /周判记录|天道榜|七日劫数|无尽试炼|山海绘卷/.test(weeklyVerificationProbe.titleText || ''),
    JSON.stringify(weeklyVerificationProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-mobile-weekly-verification-archive.png'), 'browser_challenge_mobile_flow_audit', { timeout: 9000 });

  await page.selectOption('[data-season-verification-filter="phaseKey"]', 'ranking');
  await page.waitForFunction(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())?.challenge?.verificationArchive
      : null;
    return payload?.filterState?.phaseKey === 'ranking' && payload?.filteredCount === 1;
  }, { timeout: 5000 });
  const weeklyPhaseFilterProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())?.challenge?.verificationArchive
      : null;
    const entries = Array.from(document.querySelectorAll('[data-season-verification-archive-entry="true"]'));
    return {
      ok:
        !!payload
        && payload.filterState?.phaseKey === 'ranking'
        && payload.phaseLabel === '定榜期'
        && payload.filteredCount === 1
        && entries.length === 1
        && entries[0]?.getAttribute('data-season-verification-anchor') === 'pvp'
        && entries[0]?.getAttribute('data-season-verification-result-status') === 'verified',
      payload,
      entryCount: entries.length,
      entryText: entries.map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
    };
  });
  add(
    'challenge mobile weekly phase filter narrows to the ranking verdict',
    !!weeklyPhaseFilterProbe?.ok,
    JSON.stringify(weeklyPhaseFilterProbe || null)
  );

  await page.click('[data-reset-season-verification-filters="true"]', { timeout: 5000, force: true });
  await page.waitForFunction(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())?.challenge?.verificationArchive
      : null;
    return payload?.filterState?.trajectoryKey === 'all' && payload?.filteredCount === 4;
  }, { timeout: 5000 });
  await page.selectOption('[data-season-verification-filter="trajectoryKey"]', 'carry_forward');
  await page.waitForFunction(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())?.challenge?.verificationArchive
      : null;
    return payload?.filterState?.trajectoryKey === 'carry_forward' && payload?.filteredCount === 1;
  }, { timeout: 5000 });
  const weeklyTrajectoryFilterProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())?.challenge?.verificationArchive
      : null;
    const entries = Array.from(document.querySelectorAll('[data-season-verification-archive-entry="true"]'));
    return {
      ok:
        !!payload
        && payload.filterState?.trajectoryKey === 'carry_forward'
        && payload.filteredCount === 1
        && payload.filteredDeferredCount === 1
        && payload.filteredTrajectoryLabel === '转入下周'
        && entries.length === 1
        && entries[0]?.getAttribute('data-season-verification-anchor') === 'map'
        && entries[0]?.getAttribute('data-season-verification-trajectory-key') === 'carry_forward',
      payload,
      entryCount: entries.length,
      anchors: entries.map((node) => node.getAttribute('data-season-verification-anchor') || ''),
      trajectoryKeys: entries.map((node) => node.getAttribute('data-season-verification-trajectory-key') || '')
    };
  });
  add(
    'challenge mobile weekly trajectory filter narrows to the carry-forward map verdict',
    !!weeklyTrajectoryFilterProbe?.ok,
    JSON.stringify(weeklyTrajectoryFilterProbe || null)
  );

  add('no console errors were emitted during challenge mobile flow audit', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  const report = { url, findings, consoleErrors };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));

  const failed = findings.filter((item) => !item.pass);
  if (failed.length > 0) {
    failed.forEach((item) => console.error(`FAIL: ${item.name}\n${item.detail}`));
    process.exitCode = 1;
  } else {
    console.log('browser_challenge_mobile_flow_audit passed');
  }

  await browser.close();
})();
