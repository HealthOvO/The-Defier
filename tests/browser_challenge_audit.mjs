import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/browser-challenge-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

async function safeScreenshot(page, outPath) {
  try {
    await page.screenshot({ path: outPath, fullPage: true, timeout: 6000 });
  } catch (err) {
    console.warn(`[browser_challenge_audit] screenshot skipped: ${err?.message || err}`);
  }
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
    const rewardCount = document.querySelectorAll('#challenge-hub-rewards .challenge-reward-card').length;
    const tabCount = document.querySelectorAll('#challenge-screen .challenge-tab-btn').length;
    return {
      mode: payload?.mode || '',
      challenge: payload?.challenge || null,
      title,
      summary,
      rewardCount,
      tabCount
    };
  });
  add(
    'challenge hub opens from main menu and exposes daily rotation summary',
    !!challengeHubProbe &&
      challengeHubProbe.mode === 'challenge-screen' &&
      /观星台/.test(challengeHubProbe.title || '') &&
      /第1章|完成线/.test(challengeHubProbe.summary || '') &&
      challengeHubProbe.rewardCount >= 1 &&
      challengeHubProbe.tabCount === 3 &&
      challengeHubProbe.challenge?.hub?.activeTab === 'daily',
    JSON.stringify(challengeHubProbe || null)
  );
  await safeScreenshot(page, path.join(outDir, 'challenge-hub-desktop.png'));

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
      selectionProbe.lockedCount >= 1 &&
      selectionProbe.selectedCount === 1 &&
      selectionProbe.destinyCount === 1 &&
      selectionProbe.spiritCount === 1 &&
      /开局/.test(selectionProbe.confirmText || '') &&
      selectionProbe.pending?.mode === 'daily',
    JSON.stringify(selectionProbe || null)
  );
  await safeScreenshot(page, path.join(outDir, 'challenge-selection-locked.png'));

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
    'daily challenge start jumps directly into run and surfaces active challenge banner on map',
    !!mapProbe &&
      mapProbe.mode === 'map-screen' &&
      mapProbe.bannerVisible &&
      /今日天机|第 3 重|第1章/.test(mapProbe.bannerText || '') &&
      mapProbe.activeRun?.mode === 'daily' &&
      mapProbe.activeRun?.goalRealm === 3 &&
      !!mapProbe.runDestinyId &&
      !!mapProbe.spiritId,
    JSON.stringify(mapProbe || null)
  );
  await safeScreenshot(page, path.join(outDir, 'challenge-map-banner.png'));

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
    const summaryText = document.getElementById('challenge-hub-summary')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    return {
      mode: payload?.mode || '',
      archive: payload?.challenge?.archive || null,
      hub: payload?.challenge?.hub || null,
      guide: payload?.challenge?.observatoryGuide || null,
      recordsText,
      replayButtons,
      compareCards,
      summaryText
    };
  });
  add(
    'challenge hub now surfaces seed signatures, same-theme comparison, and observatory archive replay entries after a completed run',
    !!archiveProbe &&
      archiveProbe.mode === 'challenge-screen' &&
      archiveProbe.archive?.totalRecords >= 1 &&
      archiveProbe.archive?.replayableCount >= 1 &&
      archiveProbe.archive?.featuredCount >= 1 &&
      /^D-/.test(archiveProbe.hub?.seedSignature || '') &&
      archiveProbe.hub?.comparisonCount >= 1 &&
      archiveProbe.replayButtons >= 1 &&
      archiveProbe.compareCards >= 1 &&
      !!archiveProbe.guide?.title &&
      (archiveProbe.guide?.featuredTags?.length || 0) >= 2 &&
      /命盘签/.test(archiveProbe.summaryText || '') &&
      /观星留痕|复盘命盘|同主题对比/.test(archiveProbe.recordsText || ''),
    JSON.stringify(archiveProbe || null)
  );
  await safeScreenshot(page, path.join(outDir, 'challenge-archive-replay.png'));

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
    const confirmText = document.querySelector('#confirm-character-btn .btn-text')?.textContent?.trim() || '';
    return {
      mode: payload?.mode || '',
      pending: payload?.challenge?.pending || null,
      bannerText,
      confirmText
    };
  });
  add(
    'replaying an archived observatory record re-enters locked selection in replay-only mode',
    !!replaySelectionProbe &&
      replaySelectionProbe.mode === 'character-selection-screen' &&
      replaySelectionProbe.pending?.replayOnly === true &&
      /^D-/.test(replaySelectionProbe.pending?.seedSignature || '') &&
      /观星回放/.test(replaySelectionProbe.bannerText || '') &&
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
    return {
      mode: payload?.mode || '',
      activeRun: payload?.challenge?.activeRun || null,
      bannerText: banner?.textContent?.replace(/\s+/g, ' ').trim() || ''
    };
  });
  add(
    'archived replay starts a replay-only run whose banner keeps the seed signature and non-reward state visible',
    !!replayMapProbe &&
      replayMapProbe.mode === 'map-screen' &&
      replayMapProbe.activeRun?.replayOnly === true &&
      /^D-/.test(replayMapProbe.activeRun?.seedSignature || '') &&
      /观星回放/.test(replayMapProbe.bannerText || '') &&
      /命盘签/.test(replayMapProbe.bannerText || '') &&
      /不计奖励/.test(replayMapProbe.bannerText || ''),
    JSON.stringify(replayMapProbe || null)
  );
  await safeScreenshot(page, path.join(outDir, 'challenge-replay-banner.png'));

  await page.setViewportSize({ width: 390, height: 844 });
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
  await safeScreenshot(page, path.join(outDir, 'challenge-hub-mobile.png'));

  add('no console errors were emitted during challenge audit', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  const result = { url, findings, consoleErrors, timestamp: new Date().toISOString() };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));

  const failed = findings.filter((item) => !item.pass);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();
