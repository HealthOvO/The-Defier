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
  const browser = await chromium.launch({
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
    return {
      ok: !!nav && !!content && !!layout && tabs.length >= 3 &&
        toRect(nav).top < toRect(content).top &&
        tabs.every((tab) => toRect(tab).right <= window.innerWidth - 4) &&
        toRect(content).left >= 0 && toRect(content).right <= window.innerWidth,
      nav: toRect(nav),
      content: toRect(content),
      layout: toRect(layout),
      tabRects: tabs.map((tab) => toRect(tab)),
    };
  });
  add('pvp mobile ranking view stacks nav above content without overflow', !!rankingProbe?.ok, JSON.stringify(rankingProbe || null));

  await page.click(".rune-tab[onclick*=\"'shop'\"]", { timeout: 5000, force: true });
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

  await page.click(".rune-tab[onclick*=\"'defense'\"]", { timeout: 5000, force: true });
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

  await page.screenshot({ path: path.join(outDir, 'pvp-mobile.png'), fullPage: true });

  const report = { url, findings, consoleErrors, timestamp: new Date().toISOString() };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (findings.some((finding) => !finding.pass)) process.exit(1);
})();
