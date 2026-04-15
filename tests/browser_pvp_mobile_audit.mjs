import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/web-pvp-mobile-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

async function safeScreenshot(page, outPath) {
  try {
    await page.addStyleTag({
      content: '*, *::before, *::after { animation: none !important; transition: none !important; }'
    }).catch(() => {});
    await page.screenshot({ path: outPath, fullPage: true, timeout: 0, animations: 'disabled' });
  } catch (err) {
    console.warn(`[browser_pvp_mobile_audit] screenshot skipped: ${err?.message || err}`);
  }
}

async function safeElementScreenshot(page, selector, outPath) {
  try {
    await page.addStyleTag({
      content: '*, *::before, *::after { animation: none !important; transition: none !important; }'
    }).catch(() => {});
    const target = page.locator(selector).first();
    await target.waitFor({ state: 'visible', timeout: 5000 });
    const box = await target.boundingBox();
    if (box && box.width > 0 && box.height > 0) {
      await page.screenshot({ path: outPath, clip: box, timeout: 0, animations: 'disabled' });
      return;
    }
    await target.screenshot({ path: outPath, timeout: 0, animations: 'disabled' });
  } catch (err) {
    console.warn(`[browser_pvp_mobile_audit] element screenshot skipped (${selector}): ${err?.message || err}`);
    await safeScreenshot(page, outPath);
  }
}

async function clickRuneTab(page, label) {
  const tab = page.locator('.rune-tab', { hasText: label }).first();
  await tab.click({ timeout: 5000, force: true });
}

function rectObj(el) {
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
}

(async () => {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
  const browser = await chromium.launch({
    executablePath,
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
    const tabs = Array.from(document.querySelectorAll('.pvp-nav-sidebar .rune-tab'));
    const content = document.querySelector('.pvp-content-container');
    const layout = document.querySelector('.pvp-layout-split');
    const brief = document.getElementById('pvp-ranking-brief');
    const briefRect = toRect(brief);
    return {
      ok: !!nav && !!content && !!layout && tabs.length >= 3 &&
        toRect(nav).top < toRect(content).top &&
        tabs.every((tab) => toRect(tab).right <= window.innerWidth - 4) &&
        toRect(content).left >= 0 && toRect(content).right <= window.innerWidth &&
        (!!briefRect && briefRect.left >= 0 && briefRect.right <= window.innerWidth + 2),
      nav: toRect(nav),
      content: toRect(content),
      layout: toRect(layout),
      brief: briefRect,
      tabRects: tabs.map((tab) => toRect(tab)),
    };
  });
  add('pvp mobile ranking view stacks nav above content without overflow', !!rankingProbe?.ok, JSON.stringify(rankingProbe || null));

  const dangerBriefProbe = await page.evaluate(() => {
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
    const brief = document.getElementById('pvp-ranking-brief');
    const chips = Array.from(brief?.querySelectorAll('.pvp-risk-chip') || []).map((el) => toRect(el));
    const duelTags = Array.from(brief?.querySelectorAll('.pvp-duel-slip-tag') || []).map((el) => toRect(el));
    const clueCards = Array.from(brief?.querySelectorAll('.pvp-dossier-card:not([data-dossier-card])') || []).map((el) => toRect(el));
    const historyCard = brief?.querySelector('[data-dossier-card="history"]') || null;
    const trendCard = brief?.querySelector('[data-dossier-card="trend"]') || null;
    const ledgerCard = brief?.querySelector('[data-dossier-card="ledger"]') || null;
    const duelChip = toRect(brief?.querySelector('.pvp-duel-slip-chip'));
    const challengeHint = toRect(document.getElementById('pvp-challenge-intent'));
    return {
      ok: !!brief
        && /DRI/.test(brief.textContent || '')
        && chips.every((rect) => !rect || rect.right <= window.innerWidth + 2)
        && clueCards.length >= 6
        && clueCards.every((rect) => !rect || rect.right <= window.innerWidth + 2)
        && /历史交手/.test(historyCard?.textContent || '')
        && /多场趋势/.test(trendCard?.textContent || '')
        && /赛季账本/.test(ledgerCard?.textContent || '')
        && (!historyCard || toRect(historyCard).right <= window.innerWidth + 2)
        && (!trendCard || toRect(trendCard).right <= window.innerWidth + 2)
        && (!ledgerCard || toRect(ledgerCard).right <= window.innerWidth + 2)
        && duelTags.every((rect) => !rect || rect.right <= window.innerWidth + 2)
        && (!duelChip || duelChip.right <= window.innerWidth + 2)
        && (!challengeHint || challengeHint.right <= window.innerWidth + 2),
      brief: toRect(brief),
      chipRects: chips,
      clueCards,
      historyCard: toRect(historyCard),
      trendCard: toRect(trendCard),
      ledgerCard: toRect(ledgerCard),
      duelTagRects: duelTags,
      duelChip,
      challengeHint
    };
  });
  add('pvp mobile danger brief, season dossier, and focus duel slip stay inside viewport and keep chips wrapped', !!dangerBriefProbe?.ok, JSON.stringify(dangerBriefProbe || null));
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.getElementById('pvp-ranking-brief')?.scrollIntoView({ block: 'start', inline: 'nearest' });
  });
  await page.waitForTimeout(180);
  await safeElementScreenshot(page, '#pvp-ranking-brief', path.join(outDir, 'pvp-mobile.png'));

  await page.click('#tab-ranking .challenge-btn', { timeout: 5000, force: true });
  await page.waitForTimeout(1300);
  const mobileBattleMode = await page.evaluate(() => {
    try {
      return JSON.parse(window.render_game_to_text()).mode;
    } catch {
      return null;
    }
  });
  if (mobileBattleMode === 'battle-screen') {
    await page.evaluate(() => {
      if (!window.game || !game.battle || !Array.isArray(game.battle.enemies)) return;
      game.battle.enemies.forEach((enemy) => { enemy.currentHp = 0; });
      if (typeof game.battle.checkBattleEnd === 'function') game.battle.checkBattleEnd();
    });
    await page.waitForTimeout(1100);
    await page.click('#pvp-result-overlay .result-actions .ink-btn-large', { timeout: 5000, force: true }).catch(() => {});
    await page.waitForTimeout(450);
  }

  const directHistoryProbe = await page.evaluate(() => {
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
    const historyCard = document.querySelector('#pvp-ranking-brief [data-dossier-card="history"]');
    const trendCard = document.querySelector('#pvp-ranking-brief [data-dossier-card="trend"]');
    const ledgerCard = document.querySelector('#pvp-ranking-brief [data-dossier-card="ledger"]');
    const historyValue = historyCard?.querySelector('.pvp-dossier-value');
    const trendDetail = trendCard?.querySelector('.pvp-dossier-detail');
    const ledgerValue = ledgerCard?.querySelector('.pvp-dossier-value');
    const ledgerChips = Array.from(ledgerCard?.querySelectorAll('.pvp-dossier-inline-chip') || []);
    return {
      ok: /近1场 1胜0负/.test(historyValue?.textContent || '')
        && /首条样本偏稳|持续走稳|走势回暖/.test(trendCard?.querySelector('.pvp-dossier-value')?.textContent || '')
        && /本季账本 1 场/.test(ledgerValue?.textContent || '')
        && (!historyCard || toRect(historyCard).right <= window.innerWidth + 2)
        && (!trendCard || toRect(trendCard).right <= window.innerWidth + 2)
        && (!ledgerCard || toRect(ledgerCard).right <= window.innerWidth + 2)
        && (!historyValue || historyValue.scrollWidth <= historyValue.clientWidth + 2)
        && (!trendDetail || trendDetail.scrollWidth <= trendDetail.clientWidth + 2)
        && ledgerChips.every((chip) => chip.scrollWidth <= chip.clientWidth + 2),
      historyRect: toRect(historyCard),
      trendRect: toRect(trendCard),
      ledgerRect: toRect(ledgerCard),
      historyValue: historyValue?.textContent || '',
      ledgerValue: ledgerValue?.textContent || '',
      trendValue: trendCard?.querySelector('.pvp-dossier-value')?.textContent || '',
      trendDetail: trendDetail?.textContent || ''
    };
  });
  add(
    'pvp mobile shows real direct history ledger and wrapped trend text after settlement',
    !!directHistoryProbe?.ok,
    JSON.stringify(directHistoryProbe || null)
  );
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.getElementById('pvp-ranking-brief')?.scrollIntoView({ block: 'start', inline: 'nearest' });
  });
  await page.waitForTimeout(180);
  await safeElementScreenshot(page, '#pvp-ranking-brief', path.join(outDir, 'pvp-mobile-history.png'));

  await clickRuneTab(page, '诸天阁');
  await page.waitForTimeout(500);
  const shopProbe = await page.evaluate(() => {
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
    const header = document.querySelector('.pvp-shop-header');
    const wallet = document.getElementById('shop-wallet-amount');
    const grid = document.querySelector('.pvp-shop-grid, .shop-grid, #shop-items-grid');
    return {
      ok: !!wallet && /\d/.test(wallet.textContent || '') && (!header || toRect(header).right <= window.innerWidth) && (!grid || toRect(grid).right <= window.innerWidth + 2),
      header: toRect(header),
      wallet: wallet?.textContent || '',
      grid: toRect(grid),
    };
  });
  add('pvp mobile shop keeps wallet and content inside viewport', !!shopProbe?.ok, JSON.stringify(shopProbe || null));

  await clickRuneTab(page, '护山阵');
  await page.waitForTimeout(500);
  const defenseProbe = await page.evaluate(() => {
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
    const shell = document.querySelector('#tab-defense .defense-layout, #tab-defense .defense-panel, #tab-defense');
    const action = document.querySelector('#tab-defense .ink-btn-large');
    return {
      ok: !!shell && toRect(shell).right <= window.innerWidth + 2 && (!action || toRect(action).right <= window.innerWidth + 2),
      shell: toRect(shell),
      action: toRect(action),
    };
  });
  add('pvp mobile defense view remains readable in single-column layout', !!defenseProbe?.ok, JSON.stringify(defenseProbe || null));
  await safeElementScreenshot(page, '#tab-defense', path.join(outDir, 'pvp-mobile-defense.png'));

  const report = { url, findings, consoleErrors, timestamp: new Date().toISOString() };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (findings.some((finding) => !finding.pass)) process.exit(1);
})();
