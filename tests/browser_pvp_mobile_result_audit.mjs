import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/browser-pvp-mobile-result-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    headless: true,
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

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const authActive = await page.evaluate(() => !!document.getElementById('auth-modal')?.classList.contains('active'));
  if (authActive) {
    await page.click('#auth-modal .modal-close', { timeout: 3000, force: true }).catch(() => {});
    await page.waitForTimeout(200);
  }

  await page.click('#pvp-btn', { timeout: 5000, force: true });
  await page.waitForTimeout(700);

  const rankingProbe = await page.evaluate(() => {
    const toRect = (el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };

    const nav = document.querySelector('.pvp-nav-sidebar');
    const content = document.querySelector('.pvp-content-container');
    const brief = document.getElementById('pvp-ranking-brief');
    const tabs = Array.from(document.querySelectorAll('.pvp-nav-sidebar .rune-tab'));
    return {
      navRect: toRect(nav),
      contentRect: toRect(content),
      briefRect: toRect(brief),
      tabRects: tabs.map((tab) => toRect(tab)),
      briefText: brief?.textContent?.replace(/\s+/g, ' ').trim() || '',
    };
  });
  add(
    'pvp mobile ranking screen remains readable before opening the battle result flow',
    !!rankingProbe?.navRect
      && !!rankingProbe?.contentRect
      && !!rankingProbe?.briefRect
      && rankingProbe.navRect.top < rankingProbe.contentRect.top
      && rankingProbe.contentRect.left >= 0
      && rankingProbe.contentRect.right <= 390
      && rankingProbe.briefRect.left >= 0
      && rankingProbe.briefRect.right <= 390
      && rankingProbe.tabRects.length >= 3
      && rankingProbe.tabRects.every((rect) => rect && rect.left >= 0 && rect.right <= 390)
      && /DRI/.test(rankingProbe.briefText || ''),
    JSON.stringify(rankingProbe || null)
  );

  await page.click('#tab-ranking .challenge-btn', { timeout: 5000, force: true });
  await page.waitForTimeout(1300);

  const battleProbe = await page.evaluate(() => {
    try {
      const payload = JSON.parse(window.render_game_to_text());
      return {
        mode: payload?.mode || '',
        ticket: payload?.pvp?.activeMatch?.ticket || '',
      };
    } catch {
      return { mode: '', ticket: '' };
    }
  });
  add(
    'guest pvp challenge starts a ghost battle on mobile',
    battleProbe.mode === 'battle-screen'
      && !!battleProbe.ticket,
    JSON.stringify(battleProbe || null)
  );

  if (battleProbe.mode === 'battle-screen') {
    await page.evaluate(() => {
      if (!window.game?.battle || !Array.isArray(game.battle.enemies)) return;
      game.battle.enemies.forEach((enemy) => {
        enemy.currentHp = 0;
      });
      game.battle.checkBattleEnd?.();
    });
  }
  await page.waitForTimeout(1300);

  const resultProbe = await page.evaluate(() => {
    const toRect = (el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };

    let payload = {};
    try {
      payload = JSON.parse(window.render_game_to_text());
    } catch {}

    const overlay = document.getElementById('pvp-result-overlay');
    const container = document.querySelector('#pvp-result-overlay .pvp-result-container');
    const title = document.getElementById('pvp-result-title');
    const score = document.getElementById('pvp-current-score');
    const delta = document.getElementById('pvp-score-delta');
    const opponent = document.getElementById('pvp-result-opponent');
    const reviewSummary = document.getElementById('pvp-result-review-summary');
    const reviewChip = document.getElementById('pvp-result-review-chip');
    const reviewFocus = document.getElementById('pvp-result-review-focus-value');
    const reviewNext = document.getElementById('pvp-result-review-next-value');
    const reviewFoot = document.getElementById('pvp-result-review-foot');
    const buttons = Array.from(document.querySelectorAll('#pvp-result-overlay .result-actions button'));

    return {
      overlayClassName: overlay?.className || '',
      overlayRect: toRect(overlay),
      containerRect: toRect(container),
      title: title?.textContent?.replace(/\s+/g, ' ').trim() || '',
      score: score?.textContent?.replace(/\s+/g, ' ').trim() || '',
      delta: delta?.textContent?.replace(/\s+/g, ' ').trim() || '',
      opponent: opponent?.textContent?.replace(/\s+/g, ' ').trim() || '',
      reviewSummary: reviewSummary?.textContent?.replace(/\s+/g, ' ').trim() || '',
      reviewChip: reviewChip?.textContent?.replace(/\s+/g, ' ').trim() || '',
      reviewFocus: reviewFocus?.textContent?.replace(/\s+/g, ' ').trim() || '',
      reviewNext: reviewNext?.textContent?.replace(/\s+/g, ' ').trim() || '',
      reviewFoot: reviewFoot?.textContent?.replace(/\s+/g, ' ').trim() || '',
      buttonTexts: buttons.map((btn) => btn.textContent?.replace(/\s+/g, ' ').trim() || ''),
      buttonRects: buttons.map((btn) => toRect(btn)),
      payloadReview: payload?.pvp?.resultOverlay || null,
    };
  });

  add(
    'pvp mobile result overlay keeps victory recap, review, and actions inside the viewport',
    !!resultProbe?.containerRect
      && /victory/.test(resultProbe.overlayClassName || '')
      && /\d/.test(resultProbe.score || '')
      && /[+-]?\d+/.test(resultProbe.delta || '')
      && resultProbe.containerRect.left >= 0
      && resultProbe.containerRect.right <= 390
      && /DRI/.test(resultProbe.reviewChip || '')
      && resultProbe.reviewSummary.length > 0
      && resultProbe.reviewFocus.length > 0
      && resultProbe.reviewNext.length > 0
      && resultProbe.reviewFoot.length > 0
      && resultProbe.buttonTexts.length >= 1
      && resultProbe.buttonRects.every((rect) => rect && rect.left >= 0 && rect.right <= 390)
      && !!resultProbe.payloadReview
      && /DRI/.test(resultProbe.payloadReview.dangerLine || '')
      && typeof resultProbe.payloadReview.focusText === 'string'
      && resultProbe.payloadReview.focusText.length > 0,
    JSON.stringify(resultProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'pvp-mobile-result-overlay.png'), 'browser_pvp_mobile_result_audit', { timeout: 9000 });

  if (resultProbe.buttonTexts.length >= 1) {
    await page.click('#pvp-result-overlay .result-actions .ink-btn-large', { timeout: 5000, force: true }).catch(() => {});
    await page.waitForTimeout(700);
  }

  const settleBackProbe = await page.evaluate(() => {
    try {
      const payload = JSON.parse(window.render_game_to_text());
      return {
        mode: payload?.mode || '',
        briefRect: (() => {
          const brief = document.getElementById('pvp-ranking-brief');
          if (!brief) return null;
          const rect = brief.getBoundingClientRect();
          return {
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        })(),
        historyValue: document.querySelector('[data-dossier-card="history"] .pvp-dossier-value')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        trendValue: document.querySelector('[data-dossier-card="trend"] .pvp-dossier-value')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        ledgerValue: document.querySelector('[data-dossier-card="ledger"] .pvp-dossier-value')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      };
    } catch {
      return { mode: '', briefRect: null, historyValue: '', trendValue: '', ledgerValue: '' };
    }
  });
  add(
    'closing the mobile pvp result overlay returns to the ranking view and keeps dossier follow-up visible',
    settleBackProbe.mode === 'pvp-screen'
      && !!settleBackProbe.briefRect
      && settleBackProbe.briefRect.left >= 0
      && settleBackProbe.briefRect.right <= 390
      && /近|首条|持续/.test(`${settleBackProbe.historyValue} ${settleBackProbe.trendValue}`)
      && /账本|场/.test(settleBackProbe.ledgerValue || ''),
    JSON.stringify(settleBackProbe || null)
  );

  add('no console errors were emitted during pvp mobile result audit', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  const report = { url, findings, consoleErrors };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));

  const failed = findings.filter((item) => !item.pass);
  if (failed.length > 0) {
    failed.forEach((item) => console.error(`FAIL: ${item.name}\n${item.detail}`));
    process.exitCode = 1;
  } else {
    console.log('browser_pvp_mobile_result_audit passed');
  }

  await browser.close();
})();
