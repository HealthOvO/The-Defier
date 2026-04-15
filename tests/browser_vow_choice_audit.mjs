import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/browser-vow-choice-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

async function safeScreenshot(page, outPath) {
  try {
    await page.screenshot({
      path: outPath,
      fullPage: true,
      animations: 'disabled',
      timeout: 12000,
    });
  } catch (err) {
    try {
      const session = await page.context().newCDPSession(page);
      const shot = await session.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
      console.warn(`[browser_vow_choice_audit] screenshot fallback captured after Playwright timeout: ${err?.message || err}`);
    } catch (fallbackErr) {
      console.warn(`[browser_vow_choice_audit] screenshot skipped: ${fallbackErr?.message || fallbackErr}`);
    }
  }
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
    game.showRunVowSelection(3);

    const modal = document.getElementById('event-modal');
    const atmosphere = document.getElementById('event-atmosphere');
    const summary = document.getElementById('event-system-summary');
    const choices = Array.from(document.querySelectorAll('#event-choices .run-vow-choice'));
    const first = choices[0];
    const firstText = (first?.textContent || '').replace(/\s+/g, ' ').trim();
    const rendered = typeof game.renderGameToText === 'function' ? JSON.parse(game.renderGameToText()) : null;

    return {
      ok:
        !!modal?.classList.contains('active') &&
        modal?.dataset?.eventTone === 'oath' &&
        (atmosphere?.textContent || '').trim().length >= 12 &&
        summary?.querySelectorAll('.event-summary-chip').length >= 3 &&
        choices.length >= 3 &&
        /赌注/.test(firstText) &&
        /适配/.test(firstText) &&
        /弱点/.test(firstText) &&
        /路线/.test(firstText) &&
        rendered?.eventModal?.tone === 'oath',
      tone: modal?.dataset?.eventTone || '',
      atmosphere: (atmosphere?.textContent || '').trim(),
      summaryChipCount: summary?.querySelectorAll('.event-summary-chip').length || 0,
      choiceCount: choices.length,
      firstText,
      renderModal: rendered?.eventModal || null
    };
  });

  add(
    'vow choice modal shows readable gain/risk/build/counterplay summaries and syncs into render_game_to_text',
    !!probe?.ok,
    JSON.stringify(probe || null)
  );
  await safeScreenshot(page, path.join(outDir, 'vow-choice-modal.png'));

  add('no console errors were emitted during vow choice audit', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  const failed = findings.filter((item) => !item.pass);
  const reportPath = path.join(outDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ url, findings, consoleErrors }, null, 2));

  if (failed.length > 0) {
    failed.forEach((item) => console.error(`FAIL: ${item.name}\n${item.detail}`));
    process.exitCode = 1;
  } else {
    console.log('browser_vow_choice_audit passed');
  }

  await browser.close();
})();
