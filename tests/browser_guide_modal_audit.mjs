import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/web-guide-modal-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

function rectObj(rect) {
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

async function safeScreenshot(page, outPath) {
  try {
    await page.screenshot({ path: outPath, fullPage: true, timeout: 5000 });
  } catch (err) {
    console.warn(`[browser_guide_modal_audit] screenshot skipped: ${err?.message || err}`);
  }
}

(async () => {
  const browser = await chromium.launch({
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
  await page.click("button[onclick='game.showGameIntro()']", { force: true });
  await page.waitForTimeout(700);

  const desktopProbe = await page.evaluate(() => {
    const modal = document.getElementById('settings-modal');
    const view = document.querySelector('.settings-view');
    const content = document.querySelector('.intro-content-area');
    const activePanel = document.querySelector('.intro-tab-panel.active');
    const activeTab = document.querySelector('.intro-tab-btn.active');
    if (!modal || !view || !content || !activePanel || !activeTab) {
      return { ok: false, reason: 'missing_desktop_nodes' };
    }
    const toRect = (el) => {
      const rect = el.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const panelText = (activePanel.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      ok:
        modal.classList.contains('active') &&
        panelText.length > 180 &&
        content.scrollHeight >= content.clientHeight &&
        activeTab.textContent.trim() === '综述',
      viewRect: toRect(view),
      contentRect: toRect(content),
      panelTextLength: panelText.length,
      contentScrollHeight: content.scrollHeight,
      contentClientHeight: content.clientHeight,
    };
  });
  add('guide modal renders overview content promptly on desktop', !!desktopProbe?.ok, JSON.stringify(desktopProbe || null));
  await safeScreenshot(page, path.join(outDir, 'guide-desktop.png'));

  await page.click("button[data-tab='controls']", { force: true });
  await page.waitForTimeout(250);
  const tabSwitchProbe = await page.evaluate(() => {
    const activePanel = document.querySelector('.intro-tab-panel.active');
    const activeTab = document.querySelector('.intro-tab-btn.active');
    const text = (activePanel?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      ok: !!activePanel && !!activeTab && activeTab.textContent.trim() === '操作' && /回合|快捷键|日志/.test(text),
      activeTab: activeTab?.textContent?.trim() || '',
      textSample: text.slice(0, 180),
    };
  });
  add('guide modal tab switching updates the visible panel', !!tabSwitchProbe?.ok, JSON.stringify(tabSwitchProbe || null));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const mobileProbe = await page.evaluate(() => {
    const view = document.querySelector('.settings-view');
    const content = document.querySelector('.intro-content-area');
    const tabs = Array.from(document.querySelectorAll('.intro-tab-btn'));
    if (!view || !content || tabs.length < 4) return { ok: false, reason: 'missing_mobile_nodes' };
    const toRect = (el) => {
      const rect = el.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const viewRect = toRect(view);
    const tabsFit = tabs.every((tab) => {
      const rect = tab.getBoundingClientRect();
      return rect.left >= viewRect.left - 2 && rect.right <= viewRect.right + 2;
    });
    return {
      ok:
        viewRect.width <= window.innerWidth - 8 &&
        viewRect.height <= window.innerHeight - 8 &&
        tabsFit &&
        content.clientHeight > 260,
      viewRect,
      contentRect: toRect(content),
      tabWidths: tabs.map((tab) => Math.round(tab.getBoundingClientRect().width)),
      contentClientHeight: content.clientHeight,
    };
  });
  add('guide modal stays readable on mobile without tabs overflowing', !!mobileProbe?.ok, JSON.stringify(mobileProbe || null));
  await safeScreenshot(page, path.join(outDir, 'guide-mobile.png'));

  add('no console errors were emitted during guide modal audit', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  const report = {
    url,
    findings,
    consoleErrors,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();

  if (findings.some((finding) => !finding.pass)) {
    process.exit(1);
  }
})();
