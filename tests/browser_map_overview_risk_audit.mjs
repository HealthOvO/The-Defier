import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/browser-map-overview-risk-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

async function safeScreenshot(page, targetPath) {
  try {
    await page.screenshot({ path: targetPath, fullPage: true, timeout: 12000 });
  } catch (err) {
    console.warn(`[browser_map_overview_risk_audit] screenshot skipped: ${err?.message || err}`);
  }
}

async function enterMap(page) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    ['auth-modal', 'save-slots-modal', 'generic-confirm-modal', 'save-conflict-modal'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });
    if (!window.game) return;
    game.guestMode = true;
    game.startNewGame('linFeng');
    if (typeof game.startRealm === 'function') {
      game.startRealm(1, false);
    }
  });
  await page.waitForTimeout(900);
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

  await enterMap(page);

  const desktopProbe = await page.evaluate(() => {
    const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0;
    };

    const overview = document.getElementById('map-situation-overview');
    const risk = document.getElementById('map-chapter-risk-card');
    const overviewItems = overview ? Array.from(overview.querySelectorAll('.map-overview-item')) : [];
    const riskLines = risk ? Array.from(risk.querySelectorAll('.map-risk-line')) : [];
    const overviewValues = overview ? Array.from(overview.querySelectorAll('.map-overview-value')).map((el) => normalize(el.textContent)) : [];
    const riskValues = risk ? Array.from(risk.querySelectorAll('.map-risk-value')).map((el) => normalize(el.textContent)) : [];
    let payload = null;
    try {
      payload = JSON.parse(window.render_game_to_text());
    } catch {}

    return {
      overviewVisible: visible(overview),
      riskVisible: visible(risk),
      overviewText: normalize(overview?.textContent),
      riskText: normalize(risk?.textContent),
      overviewItemCount: overviewItems.length,
      riskLineCount: riskLines.length,
      overviewValues,
      riskValues,
      payloadFrontierRisk: payload?.map?.chapter?.frontierRisk || null,
      payloadEngineeringFocus: payload?.map?.chapter?.engineeringFocus || null,
      payloadEngineeringProjectCount: Array.isArray(payload?.map?.engineeringProjects) ? payload.map.engineeringProjects.length : 0,
      payloadHasFactionSignals: Array.isArray(payload?.map?.chapter?.factionSignals),
      payloadHasNemesisSignals: Array.isArray(payload?.map?.chapter?.nemesisSignals),
      payloadHasBountyConflicts: Array.isArray(payload?.map?.chapter?.bountyConflicts),
      payloadNemesisForecast: payload?.map?.chapter?.nemesisForecast || null,
      payloadNodeEngineeringCount: Array.isArray(payload?.map?.activeNodes)
        ? payload.map.activeNodes.filter((entry) => entry?.engineering && typeof entry.engineering.trackId === 'string').length
        : 0,
      payloadNodeRiskCount: Array.isArray(payload?.map?.activeNodes)
        ? payload.map.activeNodes.filter((entry) => entry?.risk && typeof entry.risk.index === 'number').length
        : 0,
      overviewRect: overview ? overview.getBoundingClientRect().toJSON() : null,
      riskRect: risk ? risk.getBoundingClientRect().toJSON() : null
    };
  });

  add(
    'desktop map renders situation overview strip and chapter risk card with non-empty text',
    !!desktopProbe
      && desktopProbe.overviewVisible
      && desktopProbe.riskVisible
      && desktopProbe.overviewItemCount >= 8
      && desktopProbe.riskLineCount >= 7
      && desktopProbe.overviewValues.every((entry) => entry.length > 0)
      && desktopProbe.riskValues.every((entry) => entry.length > 0)
      && /核心标签/.test(desktopProbe.overviewText || '')
      && /风险等级/.test(desktopProbe.overviewText || '')
      && /前路主险/.test(desktopProbe.overviewText || '')
      && /工程推进/.test(desktopProbe.overviewText || '')
      && /悬赏进度/.test(desktopProbe.overviewText || '')
      && /势力倾向/.test(desktopProbe.overviewText || '')
      && /最近势力变化/.test(desktopProbe.overviewText || '')
      && /追猎预判/.test(desktopProbe.overviewText || '')
      && /高危机制/.test(desktopProbe.riskText || '')
      && /节点预警/.test(desktopProbe.riskText || '')
      && /悬赏冲突/.test(desktopProbe.riskText || '')
      && /追猎预判/.test(desktopProbe.riskText || '')
      && /工程态势/.test(desktopProbe.riskText || '')
      && /防御策略/.test(desktopProbe.riskText || '')
      && /资源预留/.test(desktopProbe.riskText || '')
      && !!desktopProbe.payloadFrontierRisk
      && desktopProbe.payloadEngineeringProjectCount >= 4
      && desktopProbe.payloadHasFactionSignals
      && desktopProbe.payloadHasNemesisSignals
      && desktopProbe.payloadHasBountyConflicts
      && !!desktopProbe.payloadNemesisForecast
      && desktopProbe.payloadNodeRiskCount >= 1,
    JSON.stringify(desktopProbe || null)
  );
  await safeScreenshot(page, path.join(outDir, 'map-overview-risk-desktop.png'));

  await page.setViewportSize({ width: 390, height: 844 });
  await enterMap(page);

  const mobileProbe = await page.evaluate(() => {
    const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0;
    };
    const numberOrZero = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

    const overview = document.getElementById('map-situation-overview');
    const risk = document.getElementById('map-chapter-risk-card');
    const overviewRect = overview ? overview.getBoundingClientRect() : null;
    const riskRect = risk ? risk.getBoundingClientRect() : null;
    const riskLines = risk ? Array.from(risk.querySelectorAll('.map-risk-line')) : [];
    const lineHeights = riskLines.map((line) => numberOrZero(line.getBoundingClientRect().height));
    const overflow = riskRect ? Math.max(0, riskRect.bottom - window.innerHeight) : 9999;
    const stepsNeeded = Math.ceil(overflow / 140);
    const overviewValues = overview ? Array.from(overview.querySelectorAll('.map-overview-value')).map((el) => normalize(el.textContent)) : [];
    const riskValues = risk ? Array.from(risk.querySelectorAll('.map-risk-value')).map((el) => normalize(el.textContent)) : [];

    return {
      viewportHeight: window.innerHeight,
      overviewVisible: visible(overview),
      riskVisible: visible(risk),
      overviewText: normalize(overview?.textContent),
      riskText: normalize(risk?.textContent),
      overviewHeight: overviewRect ? numberOrZero(overviewRect.height) : 0,
      riskHeight: riskRect ? numberOrZero(riskRect.height) : 0,
      riskTop: riskRect ? numberOrZero(riskRect.top) : 0,
      riskBottom: riskRect ? numberOrZero(riskRect.bottom) : 0,
      stepsNeeded,
      minRiskLineHeight: lineHeights.length > 0 ? Math.min(...lineHeights) : 0,
      overviewValues,
      riskValues
    };
  });

  add(
    'mobile map keeps overview and risk card readable, with key risk info visible within two small scroll steps',
    !!mobileProbe
      && mobileProbe.overviewVisible
      && mobileProbe.riskVisible
      && mobileProbe.overviewHeight >= 120
      && mobileProbe.riskHeight >= 145
      && mobileProbe.minRiskLineHeight >= 12
      && mobileProbe.stepsNeeded <= 2
      && mobileProbe.overviewValues.every((entry) => entry.length > 0)
      && mobileProbe.riskValues.every((entry) => entry.length > 0)
      && /前路主险/.test(mobileProbe.overviewText || '')
      && /工程推进/.test(mobileProbe.overviewText || '')
      && /最近势力变化/.test(mobileProbe.overviewText || '')
      && /追猎预判/.test(mobileProbe.overviewText || '')
      && /高危机制/.test(mobileProbe.riskText || '')
      && /节点预警/.test(mobileProbe.riskText || '')
      && /悬赏冲突/.test(mobileProbe.riskText || '')
      && /追猎预判/.test(mobileProbe.riskText || '')
      && /工程态势/.test(mobileProbe.riskText || '')
      && /防御策略/.test(mobileProbe.riskText || '')
      && /资源预留/.test(mobileProbe.riskText || ''),
    JSON.stringify(mobileProbe || null)
  );
  await safeScreenshot(page, path.join(outDir, 'map-overview-risk-mobile.png'));

  add('no console errors were emitted during map overview risk audit', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  const failed = findings.filter((item) => !item.pass);
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ url, findings, consoleErrors }, null, 2));
  if (failed.length > 0) {
    failed.forEach((item) => console.error(`FAIL: ${item.name}\n${item.detail}`));
    process.exitCode = 1;
  } else {
    console.log('browser_map_overview_risk_audit passed');
  }

  await browser.close();
})();
