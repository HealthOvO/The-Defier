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
  await page.waitForTimeout(350);

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
      tabCount: document.querySelectorAll('#challenge-screen .challenge-tab-btn').length,
      rewardCount: document.querySelectorAll('#challenge-hub-rewards .challenge-reward-card').length,
      dangerChipCount: document.querySelectorAll('#challenge-hub-summary .challenge-danger-chip').length,
      launchRect: rectObject(launchBtn?.getBoundingClientRect() || null),
      firstRewardRect: rectObject(firstRewardRect),
    };
  });
  add(
    'challenge mobile hub keeps summary, launch CTA, and reward cards inside the viewport',
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
      && !!hubProbe.launchRect
      && hubProbe.launchRect.left >= 0
      && hubProbe.launchRect.right <= 390
      && !!hubProbe.firstRewardRect
      && hubProbe.firstRewardRect.left >= 0
      && hubProbe.firstRewardRect.right <= 390,
    JSON.stringify(hubProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-mobile-hub.png'), 'browser_challenge_mobile_flow_audit', { timeout: 9000 });

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
      && activeBannerProbe.bannerRect.left >= 0
      && activeBannerProbe.bannerRect.right <= 390
      && (!activeBannerProbe.focusRect || (
        activeBannerProbe.focusRect.left >= 0
        && activeBannerProbe.focusRect.right <= 390
      )),
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
      && replayBannerProbe.bannerRect.left >= 0
      && replayBannerProbe.bannerRect.right <= 390
      && (!replayBannerProbe.focusRect || (
        replayBannerProbe.focusRect.left >= 0
        && replayBannerProbe.focusRect.right <= 390
      )),
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
