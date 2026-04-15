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

    return {
      ok:
        !!detail &&
        !!summary &&
        /连续叙事线/.test(text) &&
        /终焉回收|终章总回收/.test(text) &&
        beatCards >= 3 &&
        tags >= 5,
      text,
      beatCards,
      tags
    };
  });

  add(
    'chapter codex surfaces continuous narrative beats and final worldview recall for chapter six',
    !!probe?.ok,
    JSON.stringify(probe || null)
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
