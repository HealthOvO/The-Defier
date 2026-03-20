import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/browser-challenge-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

(async () => {
  const browser = await chromium.launch({
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

  await page.addInitScript(() => {
    try {
      localStorage.removeItem('theDefierChallengeProgressV1');
      localStorage.removeItem('theDefierActiveChallengeRunV1');
      localStorage.removeItem('theDefierSave');
    } catch {}
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);

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
    if (window.game && typeof game.showScreen === 'function') game.showScreen('main-menu');
  });
  await page.waitForTimeout(250);

  await page.click('button[onclick="game.showChallengeHub(\'daily\')"]', { timeout: 5000, force: true });
  await page.waitForTimeout(350);

  const challengeHubProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const title = document.getElementById('challenge-hub-title')?.textContent?.trim() || '';
    const summary = document.getElementById('challenge-hub-summary')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const sideText = document.getElementById('challenge-hub-side')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const rewardCount = document.querySelectorAll('#challenge-hub-rewards .challenge-reward-card').length;
    const tabCount = document.querySelectorAll('#challenge-screen .challenge-tab-btn').length;
    const dangerChipCount = document.querySelectorAll('#challenge-hub-summary .challenge-danger-chip').length;
    return {
      mode: payload?.mode || '',
      challenge: payload?.challenge || null,
      title,
      summary,
      sideText,
      rewardCount,
      tabCount,
      dangerChipCount
    };
  });
  add(
    'challenge hub opens from main menu and exposes daily rotation summary plus challenge danger profile',
    !!challengeHubProbe &&
      challengeHubProbe.mode === 'challenge-screen' &&
      /观星台/.test(challengeHubProbe.title || '') &&
      /第1章|完成线/.test(challengeHubProbe.summary || '') &&
      /试炼压强|DRI/.test(challengeHubProbe.summary || '') &&
      /难度同轴|主轴/.test(challengeHubProbe.sideText || '') &&
      challengeHubProbe.rewardCount >= 1 &&
      challengeHubProbe.tabCount === 3 &&
      challengeHubProbe.dangerChipCount === 4 &&
      challengeHubProbe.challenge?.hub?.activeTab === 'daily' &&
      (challengeHubProbe.challenge?.hub?.dangerProfile?.axes?.length || 0) === 4 &&
      (challengeHubProbe.challenge?.hub?.dangerProfile?.index || 0) >= 1 &&
      !!challengeHubProbe.challenge?.hub?.dangerProfile?.dominantAxisLabel,
    JSON.stringify(challengeHubProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-hub-desktop.png'), 'browser_challenge_audit', { timeout: 9000 });

  await page.evaluate(() => {
    if (window.game && typeof game.beginChallengeStart === 'function') {
      game.beginChallengeStart('daily');
    }
  });
  await page.waitForTimeout(300);

  const guestPromptVisible = await page.locator('#generic-confirm-modal.active #generic-cancel-btn').isVisible().catch(() => false);
  if (guestPromptVisible) {
    await page.click('#generic-cancel-btn', { timeout: 3000, force: true });
    await page.waitForTimeout(450);
  }

  const selectionProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const bannerText = document.getElementById('challenge-selection-banner')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const lockedCount = document.querySelectorAll('.character-card.challenge-card-locked').length;
    const selectedCount = document.querySelectorAll('.character-card.selected').length;
    const destinyCount = document.querySelectorAll('#run-destiny-selection .run-destiny-card').length;
    const spiritCount = document.querySelectorAll('#spirit-companion-selection .run-spirit-card').length;
    const confirmText = document.querySelector('#confirm-character-btn .btn-text')?.textContent?.trim() || '';
    return {
      mode: payload?.mode || '',
      pending: payload?.challenge?.pending || null,
      bannerText,
      lockedCount,
      selectedCount,
      destinyCount,
      spiritCount,
      confirmText
    };
  });
  add(
    'challenge launch locks character selection and compresses destiny/spirit picks into fixed options',
    !!selectionProbe &&
      selectionProbe.mode === 'character-selection-screen' &&
      /今日天机|第1章/.test(selectionProbe.bannerText || '') &&
      /DRI|主轴/.test(selectionProbe.bannerText || '') &&
      selectionProbe.lockedCount >= 1 &&
      selectionProbe.selectedCount === 1 &&
      selectionProbe.destinyCount === 1 &&
      selectionProbe.spiritCount === 1 &&
      /开局/.test(selectionProbe.confirmText || '') &&
      selectionProbe.pending?.mode === 'daily' &&
      (selectionProbe.pending?.dangerProfile?.index || 0) >= 1,
    JSON.stringify(selectionProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-selection-locked.png'), 'browser_challenge_audit', { timeout: 9000 });

  await page.click('#confirm-character-btn', { timeout: 4000, force: true });
  await page.waitForTimeout(900);

  const mapProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const banner = document.getElementById('challenge-run-banner');
    const style = banner ? getComputedStyle(banner) : null;
    return {
      mode: payload?.mode || '',
      activeRun: payload?.challenge?.activeRun || null,
      bannerVisible: !!banner && !!style && style.display !== 'none' && style.visibility !== 'hidden',
      bannerText: banner?.textContent?.replace(/\s+/g, ' ').trim() || '',
      runDestinyId: payload?.player?.runDestiny?.id || null,
      spiritId: payload?.player?.spiritCompanion?.id || null
    };
  });
  add(
    'daily challenge start jumps directly into run and surfaces active challenge banner with shared danger axis on map',
    !!mapProbe &&
      mapProbe.mode === 'map-screen' &&
      mapProbe.bannerVisible &&
      /今日天机|第 3 重|第1章/.test(mapProbe.bannerText || '') &&
      /DRI/.test(mapProbe.bannerText || '') &&
      mapProbe.activeRun?.mode === 'daily' &&
      mapProbe.activeRun?.goalRealm === 3 &&
      (mapProbe.activeRun?.dangerProfile?.index || 0) >= 1 &&
      !!mapProbe.runDestinyId &&
      !!mapProbe.spiritId,
    JSON.stringify(mapProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-map-banner.png'), 'browser_challenge_audit', { timeout: 9000 });

  await page.evaluate(() => {
    if (window.game && game.activeChallengeRun && typeof game.finalizeActiveChallengeRun === 'function') {
      game.finalizeActiveChallengeRun({ completed: true, reason: 'goal_reached' });
      if (typeof game.showChallengeHub === 'function') game.showChallengeHub('daily');
    }
  });
  await page.waitForTimeout(350);

  const archiveProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const recordsText = document.getElementById('challenge-hub-records')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const replayButtons = document.querySelectorAll('#challenge-hub-records .challenge-record-actions .collection-inline-btn').length;
    const compareCards = document.querySelectorAll('#challenge-hub-records .challenge-compare-card').length;
    const insightCards = document.querySelectorAll('#challenge-hub-records .challenge-record-insight').length;
    const compareInsightCards = document.querySelectorAll('#challenge-hub-records .challenge-compare-card .challenge-record-insight').length;
    const sideInsightCards = document.querySelectorAll('#challenge-hub-side .challenge-record-insight').length;
    const summaryText = document.getElementById('challenge-hub-summary')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    return {
      mode: payload?.mode || '',
      archive: payload?.challenge?.archive || null,
      hub: payload?.challenge?.hub || null,
      guide: payload?.challenge?.observatoryGuide || null,
      recordsText,
      replayButtons,
      compareCards,
      insightCards,
      compareInsightCards,
      sideInsightCards,
      summaryText
    };
  });
  add(
    'challenge hub now surfaces seed signatures, danger profile, same-theme comparison, and replay sample insights after a completed run',
    !!archiveProbe &&
      archiveProbe.mode === 'challenge-screen' &&
      archiveProbe.archive?.totalRecords >= 1 &&
      archiveProbe.archive?.replayableCount >= 1 &&
      archiveProbe.archive?.featuredCount >= 1 &&
      /^D-/.test(archiveProbe.hub?.seedSignature || '') &&
      (archiveProbe.hub?.dangerProfile?.index || 0) >= 1 &&
      archiveProbe.hub?.comparisonCount >= 1 &&
      archiveProbe.replayButtons >= 1 &&
      archiveProbe.compareCards >= 1 &&
      archiveProbe.insightCards >= 2 &&
      archiveProbe.compareInsightCards >= 1 &&
      archiveProbe.sideInsightCards >= 1 &&
      !!archiveProbe.guide?.title &&
      (archiveProbe.guide?.featuredTags?.length || 0) >= 2 &&
      !!archiveProbe.guide?.insight?.title &&
      /命盘签/.test(archiveProbe.summaryText || '') &&
      /观星留痕|复盘命盘|同主题对比/.test(archiveProbe.recordsText || '') &&
      /复刻重点|失手剖面|回放复刻|回放试错/.test(archiveProbe.recordsText || ''),
    JSON.stringify(archiveProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-archive-replay.png'), 'browser_challenge_audit', { timeout: 9000 });

  await page.evaluate(() => {
    const btn = document.querySelector('#challenge-hub-records .challenge-record-actions .collection-inline-btn');
    if (btn) btn.click();
  });
  await page.waitForTimeout(350);

  const replayGuestPromptVisible = await page.locator('#generic-confirm-modal.active #generic-cancel-btn').isVisible().catch(() => false);
  if (replayGuestPromptVisible) {
    await page.click('#generic-cancel-btn', { timeout: 3000, force: true });
    await page.waitForTimeout(450);
  }

  const replaySelectionProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const bannerText = document.getElementById('challenge-selection-banner')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const insightText = document.querySelector('#challenge-selection-banner .challenge-record-insight')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const confirmText = document.querySelector('#confirm-character-btn .btn-text')?.textContent?.trim() || '';
    return {
      mode: payload?.mode || '',
      pending: payload?.challenge?.pending || null,
      bannerText,
      insightText,
      confirmText
    };
  });
  add(
    'replaying an archived observatory record re-enters locked selection in replay-only mode with explicit sample training focus',
    !!replaySelectionProbe &&
      replaySelectionProbe.mode === 'character-selection-screen' &&
      replaySelectionProbe.pending?.replayOnly === true &&
      /^D-/.test(replaySelectionProbe.pending?.seedSignature || '') &&
      /观星回放/.test(replaySelectionProbe.bannerText || '') &&
      !!replaySelectionProbe.pending?.archiveInsight?.title &&
      /回放复刻|回放试错/.test(replaySelectionProbe.insightText || '') &&
      /回放命盘/.test(replaySelectionProbe.confirmText || ''),
    JSON.stringify(replaySelectionProbe || null)
  );

  await page.click('#confirm-character-btn', { timeout: 4000, force: true });
  await page.waitForTimeout(900);

  const replayMapProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const banner = document.getElementById('challenge-run-banner');
    const focusText = banner?.querySelector('.challenge-run-focus')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    return {
      mode: payload?.mode || '',
      activeRun: payload?.challenge?.activeRun || null,
      bannerText: banner?.textContent?.replace(/\s+/g, ' ').trim() || '',
      focusText
    };
  });
  add(
    'archived replay starts a replay-only run whose banner keeps seed signature, non-reward state, and training focus visible',
    !!replayMapProbe &&
      replayMapProbe.mode === 'map-screen' &&
      replayMapProbe.activeRun?.replayOnly === true &&
      /^D-/.test(replayMapProbe.activeRun?.seedSignature || '') &&
      /观星回放/.test(replayMapProbe.bannerText || '') &&
      /命盘签/.test(replayMapProbe.bannerText || '') &&
      /不计奖励/.test(replayMapProbe.bannerText || '') &&
      !!replayMapProbe.activeRun?.archiveInsight?.title &&
      /训练重点/.test(replayMapProbe.focusText || ''),
    JSON.stringify(replayMapProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-replay-banner.png'), 'browser_challenge_audit', { timeout: 9000 });

  await page.evaluate(() => {
    if (window.game && game.activeChallengeRun && typeof game.finalizeActiveChallengeRun === 'function') {
      game.finalizeActiveChallengeRun({ completed: false, reason: 'battle_lost' });
      if (typeof game.showChallengeHub === 'function') game.showChallengeHub('daily');
    }
  });
  await page.waitForTimeout(350);

  const replayFailureProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const recordsText = document.getElementById('challenge-hub-records')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const latestInsightText = document.querySelector('#challenge-hub-side .challenge-record-insight')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    return {
      mode: payload?.mode || '',
      archive: payload?.challenge?.archive || null,
      recordsText,
      latestInsightText
    };
  });
  add(
    'failed replay returns to challenge hub with retry-oriented sample insight still visible',
    !!replayFailureProbe &&
      replayFailureProbe.mode === 'challenge-screen' &&
      /回放试错/.test(replayFailureProbe.recordsText || '') &&
      /补救建议|资源缺口/.test(replayFailureProbe.recordsText || '') &&
      /回放试错|补救建议|资源缺口/.test(replayFailureProbe.latestInsightText || '') &&
      /回放试错/.test(replayFailureProbe.archive?.latestInsight?.title || replayFailureProbe.archive?.latestInsightTitle || ''),
    JSON.stringify(replayFailureProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-replay-failure-hub.png'), 'browser_challenge_audit', { timeout: 9000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);

  const mobileArchiveProbe = await page.evaluate(() => {
    const shell = document.querySelector('.challenge-shell');
    const scroll = document.querySelector('.challenge-scroll-container');
    const records = document.getElementById('challenge-hub-records');
    const root = document.documentElement;
    const lineRects = Array.from(document.querySelectorAll('#challenge-hub-records .challenge-record-insight-line')).map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
      };
    });
    return {
      shellWidth: Math.round(shell?.getBoundingClientRect().width || 0),
      scrollWidth: Math.round(scroll?.getBoundingClientRect().width || 0),
      recordsWidth: Math.round(records?.getBoundingClientRect().width || 0),
      docScrollWidth: Math.round(root?.scrollWidth || 0),
      insightCount: lineRects.length,
      widestInsightLine: lineRects.reduce((max, rect) => Math.max(max, Math.round(rect.width || 0)), 0),
      ok:
        !!shell &&
        !!scroll &&
        !!records &&
        lineRects.length >= 3 &&
        (root?.scrollWidth || 0) <= window.innerWidth + 8 &&
        lineRects.every((rect) => rect.left >= 0 && rect.right <= window.innerWidth - 4)
    };
  });
  add(
    'challenge archive insights remain readable on mobile without horizontal overflow',
    !!mobileArchiveProbe &&
      mobileArchiveProbe.ok &&
      mobileArchiveProbe.shellWidth > 300 &&
      mobileArchiveProbe.scrollWidth > 300 &&
      mobileArchiveProbe.recordsWidth > 300,
    JSON.stringify(mobileArchiveProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-archive-mobile.png'), 'browser_challenge_audit', { timeout: 9000 });

  await page.evaluate(() => {
    if (window.game && typeof game.showChallengeHub === 'function') game.showChallengeHub('weekly');
  });
  await page.waitForTimeout(300);

  const mobileProbe = await page.evaluate(() => {
    const shell = document.querySelector('.challenge-shell');
    const scroll = document.querySelector('.challenge-scroll-container');
    const tabs = Array.from(document.querySelectorAll('.challenge-tab-btn')).map((el) => el.getBoundingClientRect().width);
    const launchBtn = document.querySelector('#challenge-hub-launch .challenge-launch-btn');
    return {
      shellWidth: Math.round(shell?.getBoundingClientRect().width || 0),
      scrollWidth: Math.round(scroll?.getBoundingClientRect().width || 0),
      tabWidths: tabs,
      launchWidth: Math.round(launchBtn?.getBoundingClientRect().width || 0)
    };
  });
  add(
    'challenge hub remains readable on mobile with stacked layout and reachable CTA',
    !!mobileProbe &&
      mobileProbe.shellWidth > 300 &&
      mobileProbe.scrollWidth > 300 &&
      mobileProbe.tabWidths.length === 3 &&
      mobileProbe.tabWidths.every((width) => width > 80) &&
      mobileProbe.launchWidth > 250,
    JSON.stringify(mobileProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-hub-mobile.png'), 'browser_challenge_audit', { timeout: 9000 });

  add('no console errors were emitted during challenge audit', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  const result = { url, findings, consoleErrors, timestamp: new Date().toISOString() };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));

  const failed = findings.filter((item) => !item.pass);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();
