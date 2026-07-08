import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/browser-dongfu-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

async function safeScreenshot(page, outPath) {
  try {
    await page.screenshot({ path: outPath, fullPage: true, timeout: 5000 });
  } catch (err) {
    console.warn(`[browser_dongfu_audit] screenshot skipped: ${err?.message || err}`);
  }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(String(err));
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const probe = await page.evaluate(() => {
    if (!window.game) return { ok: false, reason: 'no_game' };
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.player.realm = 18;
    game.unlockedRealms = Array.from({ length: 18 }, (_, index) => index + 1);
    if (game.achievementSystem && typeof game.achievementSystem.unlockAchievement === 'function') {
      const firstAchievementId = Array.isArray(game.achievementSystem.achievements)
        ? game.achievementSystem.achievements[0]?.id
        : null;
      if (firstAchievementId) game.achievementSystem.unlockAchievement(firstAchievementId);
    }
    game.showCollection();
    game.switchCollectionSection('sanctum');

    const roomCount = document.querySelectorAll('#sanctum-room-grid .sanctum-room-card').length;
    const researchCount = document.querySelectorAll('#sanctum-research-list .sanctum-research-item').length;
    const goalCount = document.querySelectorAll('#sanctum-goal-list .sanctum-goal-item').length;
    const unlockCount = document.querySelectorAll('#sanctum-unlock-feed .unlock-feed-item').length;
    const summaryText = (document.getElementById('sanctum-summary')?.textContent || '').replace(/\s+/g, ' ').trim();
    const progressText = (document.getElementById('sanctum-progress')?.textContent || '').replace(/\s+/g, ' ').trim();
    const honorSummary = document.querySelector('#sanctum-summary [data-season-honor-showcase="true"]');
    const honorCard = document.querySelector('#sanctum-summary [data-season-honor-showcase-card="true"]');
    const honorCta = document.querySelector('#sanctum-summary [data-season-honor-showcase-cta="true"]');
    const honorChip = document.querySelector('#sanctum-summary [data-season-honor-showcase-chip="unlocked"]');
    if (honorCard && typeof honorCard.scrollIntoView === 'function') {
      honorCard.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
    const honorText = (honorCard?.textContent || honorSummary?.textContent || '').replace(/\s+/g, ' ').trim();
    const honorRect = honorCard?.getBoundingClientRect();
    const honorFitsViewport = !honorRect || (
      honorRect.left >= -2 &&
      honorRect.right <= window.innerWidth + 2 &&
      honorRect.top >= -2 &&
      honorRect.bottom <= window.innerHeight + 2 &&
      honorRect.width > 120
    );

    return {
      ok:
        roomCount >= 4 &&
        researchCount >= 3 &&
        goalCount >= 2 &&
        unlockCount >= 1 &&
        /洞府/.test(summaryText) &&
        /主线|图鉴|Boss|周挑战/.test(progressText) &&
        honorSummary?.dataset.seasonHonorShowcaseReport === 'pvp-live-season-honor-showcase-v1' &&
        honorSummary?.dataset.seasonHonorShowcaseImpact === 'cosmetic_only' &&
        honorSummary?.dataset.seasonHonorShowcasePower === 'none' &&
        honorSummary?.dataset.seasonHonorShowcaseVisibility === 'self_only_ranked_economy' &&
        honorCard?.dataset.seasonHonorShowcaseVisibility === 'self_only_ranked_economy' &&
        !!honorCard &&
        !!honorChip &&
        !!honorCta &&
        /赛季荣誉|正式论道/.test(honorText) &&
        /仅本人洞府只读可见，不进入公开回放或审计回放/.test(honorText) &&
        /不授予卡牌、属性、资源、起手、匹配或战斗效果/.test(honorText) &&
        honorFitsViewport,
      roomCount,
      researchCount,
      goalCount,
      unlockCount,
      summaryText,
      progressText,
      honorText,
      honorReport: honorSummary?.dataset.seasonHonorShowcaseReport || '',
      honorImpact: honorSummary?.dataset.seasonHonorShowcaseImpact || '',
      honorPower: honorSummary?.dataset.seasonHonorShowcasePower || '',
      honorVisibility: honorSummary?.dataset.seasonHonorShowcaseVisibility || '',
      honorCtaText: (honorCta?.textContent || '').replace(/\s+/g, ' ').trim(),
      honorFitsViewport
    };
  });

  add(
    'dongfu overview keeps room summary, research goals and unlock feed in one readable progression loop',
    !!probe?.ok,
    JSON.stringify(probe || null)
  );
  await safeScreenshot(page, path.join(outDir, 'dongfu-overview.png'));

  add('no console errors were emitted during dongfu audit', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  const failed = findings.filter((item) => !item.pass);
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ url, findings, consoleErrors }, null, 2));
  if (failed.length > 0) {
    failed.forEach((item) => console.error(`FAIL: ${item.name}\n${item.detail}`));
    process.exitCode = 1;
  } else {
    console.log('browser_dongfu_audit passed');
  }

  await browser.close();
})();
