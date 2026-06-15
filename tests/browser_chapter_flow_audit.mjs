import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/browser-chapter-flow-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

(async () => {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
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

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const probe = await page.evaluate(() => {
    if (!window.game) return { ok: false, reason: 'no_game' };
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.player.realm = 18;
    game.unlockedRealms = Array.from({ length: 18 }, (_, index) => index + 1);
    game.showCollection();
    game.switchCollectionSection('chapters');
    game.selectChapterCodexEntry('final_court');

    const detail = document.getElementById('chapter-codex-detail');
    const summary = document.getElementById('chapter-codex-summary');
    const text = (detail?.textContent || '').replace(/\s+/g, ' ').trim();
    const beatCards = detail?.querySelectorAll('.collection-mini-card').length || 0;
    const tags = detail?.querySelectorAll('.collection-tag').length || 0;
    const drillButton = detail?.querySelector('[data-collection-action="apply-chapter-drill-focus"]');
    const drillButtons = Array.from(detail?.querySelectorAll('[data-collection-action="apply-chapter-drill-focus"]') || []);
    const drillModes = drillButtons.map((button) => button.dataset.challengeMode || '');
    const drillButtonTexts = drillButtons.map((button) => button.textContent?.replace(/\s+/g, ' ').trim() || '');

    return {
      ok:
        !!detail &&
        !!summary &&
        /连续叙事线/.test(text) &&
        /终焉回收|终章总回收/.test(text) &&
        !!drillButton &&
        /章节演练|设为/.test(drillButton.textContent || '') &&
        drillButtons.length === 3 &&
        ['daily', 'weekly', 'global'].every((mode) => drillModes.includes(mode)) &&
        drillButtonTexts.some((line) => /今日天机/.test(line)) &&
        drillButtonTexts.some((line) => /七日劫数/.test(line)) &&
        drillButtonTexts.some((line) => /众生试炼/.test(line)) &&
        beatCards >= 3 &&
        tags >= 5,
      text,
      beatCards,
      tags,
      drillButtonText: drillButton?.textContent?.replace(/\s+/g, ' ').trim() || '',
      drillDataset: drillButton ? { ...drillButton.dataset } : null,
      drillModes,
      drillButtonTexts
    };
  });

  add(
    'chapter codex surfaces continuous narrative beats, final worldview recall, and a chapter drill CTA for chapter six',
    !!probe?.ok,
    JSON.stringify(probe || null)
  );

  const drillProbe = await page.evaluate(async () => {
    const detail = document.getElementById('chapter-codex-detail');
    const button = detail?.querySelector('[data-collection-action="apply-chapter-drill-focus"][data-challenge-mode="daily"]');
    if (!button) return { ok: false, reason: 'missing_daily_drill_button' };
    const before = {
      currentScreen: window.game?.currentScreen || '',
      section: window.game?.collectionHubState?.section || '',
      selectedChapter: window.game?.selectedChapterCodexId || '',
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
    return {
      ok:
        window.game?.currentScreen === 'challenge-screen'
        && window.game?.challengeHubState?.tab === 'daily'
        && focus?.sourceRunId === `chapter_codex:${before.selectedChapter}`
        && focus?.guideRecordId === `chapter_codex:${before.selectedChapter}`
        && /终焉|第六章|章节/.test(focus?.chapterName || '')
        && /章节演练|章节复盘|复盘/.test(focus?.trainingAdvice || '')
        && /终庭|Boss|生态|天象|地脉/.test(focusText || focus?.trainingAdvice || '')
        && (focus?.trainingTags || []).length >= 3,
      before,
      after: {
        currentScreen: window.game?.currentScreen || '',
        tab: window.game?.challengeHubState?.tab || '',
        focus,
        focusText
      }
    };
  });

  add(
    'chapter drill CTA stores a chapter training focus and opens daily challenge hub',
    !!drillProbe?.ok,
    JSON.stringify(drillProbe || null)
  );

  const laneProbe = await page.evaluate(async () => {
    if (!window.game) return { ok: false, reason: 'no_game' };
    const results = [];
    for (const mode of ['weekly', 'global']) {
      game.showCollection();
      game.switchCollectionSection('chapters');
      game.selectChapterCodexEntry('final_court');
      const detail = document.getElementById('chapter-codex-detail');
      const button = detail?.querySelector(`[data-collection-action="apply-chapter-drill-focus"][data-challenge-mode="${mode}"]`);
      if (!button) {
        results.push({ mode, ok: false, reason: 'missing_mode_button' });
        continue;
      }
      button.click();
      await new Promise(resolve => setTimeout(resolve, 450));
      const payload = typeof window.render_game_to_text === 'function'
        ? JSON.parse(window.render_game_to_text())
        : null;
      const focus = payload?.challenge?.trainingFocus || null;
      results.push({
        mode,
        ok:
          window.game?.currentScreen === 'challenge-screen'
          && window.game?.challengeHubState?.tab === mode
          && focus?.sourceRunId === 'chapter_codex:final_court'
          && focus?.guideRecordId === 'chapter_codex:final_court'
          && /章节演练|章节复盘|复盘/.test(focus?.trainingAdvice || ''),
        tab: window.game?.challengeHubState?.tab || '',
        focus,
        buttonText: button.textContent?.replace(/\s+/g, ' ').trim() || ''
      });
    }
    return {
      ok: results.length === 2 && results.every((entry) => entry.ok),
      results
    };
  });

  add(
    'chapter drill mode buttons can route the same chapter focus into weekly and global challenge hubs',
    !!laneProbe?.ok,
    JSON.stringify(laneProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'chapter-codex-final.png'), 'browser_chapter_flow_audit', { timeout: 8000 });

  add('no console errors were emitted during chapter flow audit', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  const failed = findings.filter((item) => !item.pass);
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ url, findings, consoleErrors }, null, 2));
  if (failed.length > 0) {
    failed.forEach((item) => console.error(`FAIL: ${item.name}\n${item.detail}`));
    process.exitCode = 1;
  } else {
    console.log('browser_chapter_flow_audit passed');
  }

  await browser.close();
})();
