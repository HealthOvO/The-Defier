import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/web-automation-boot-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function recordConsoleError(text, scenarioId) {
  const message = `[${scenarioId}] ${String(text || '')}`;
  if (/ERR_CONNECTION_CLOSED/.test(message)) return;
  consoleErrors.push(message);
}

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

async function safeScreenshot(page, outPath) {
  try {
    await page.screenshot({ path: outPath, fullPage: true, timeout: 10000 });
  } catch (err) {
    console.warn(`[browser_automation_boot_audit] screenshot skipped: ${err?.message || err}`);
  }
}

async function runScenario(browser, scenario) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') recordConsoleError(msg.text(), scenario.id);
  });
  page.on('pageerror', (err) => {
    recordConsoleError(String(err), scenario.id);
  });

  await page.goto(`${baseUrl}${scenario.query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const payload = await page.evaluate(() => {
    if (typeof window.render_game_to_text !== 'function') return null;
    try {
      return JSON.parse(window.render_game_to_text());
    } catch {
      return null;
    }
  });

  const probe = await page.evaluate(() => ({
    screen: window.game?.currentScreen || '',
    guestMode: !!window.game?.guestMode,
    selectedRunPathId: window.game?.selectedRunPathId || null,
    runPathTrackerText: document.getElementById('map-run-path-mission')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    selectedCardCount: document.querySelectorAll('#run-path-selection .run-path-card.selected').length,
    selectedPathName: document.querySelector('#run-path-selection .run-path-card.selected .run-destiny-name')?.textContent?.trim() || '',
    pvpTitle: document.querySelector('#pvp-ranking-brief .pvp-risk-title')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    pvpHint: document.getElementById('pvp-challenge-intent')?.textContent?.replace(/\s+/g, ' ').trim() || ''
  }));

  const pass = scenario.assert({ payload, probe });
  add(scenario.name, pass, JSON.stringify({ payload, probe }));
  await safeScreenshot(page, path.join(outDir, `${scenario.id}.png`));
  await page.close();
}

const scenarios = [
  {
    id: 'guest-run-path-selection',
    query: '?autotest=guest-run-path-selection&character=linFeng&path=insight',
    name: 'automation boot can land on run path selection without auth modal',
    assert: ({ payload, probe }) => (
      probe.screen === 'character-selection-screen'
      && probe.guestMode
      && probe.selectedCardCount === 1
      && /窥命流/.test(probe.selectedPathName)
      && payload?.draft?.selectedRunPathId === 'insight'
    )
  },
  {
    id: 'guest-map',
    query: '?autotest=guest-map&character=linFeng&destiny=foldedEdge&spirit=swordWraith&path=insight&realm=1',
    name: 'automation boot can land on map with full run identity state',
    assert: ({ payload, probe }) => (
      probe.screen === 'map-screen'
      && probe.guestMode
      && /窥命流/.test(probe.runPathTrackerText)
      && payload?.player?.runPath?.id === 'insight'
      && payload?.player?.runDestiny?.id === 'foldedEdge'
      && payload?.player?.spiritCompanion?.id === 'swordWraith'
    )
  },
  {
    id: 'guest-battle',
    query: '?autotest=guest-battle&character=linFeng&destiny=foldedEdge&spirit=swordWraith&path=insight&realm=1&battleType=normal',
    name: 'automation boot can land on battle with run path HUD strip item',
    assert: ({ payload, probe }) => {
      const stripItems = payload?.battle?.systemsHud?.stripItems || [];
      const runPathItem = stripItems.find((item) => item && item.id === 'runPath');
      return probe.screen === 'battle-screen'
        && probe.guestMode
        && payload?.player?.runPath?.id === 'insight'
        && runPathItem?.value === '窥命流';
    }
  },
  {
    id: 'guest-pvp',
    query: '?autotest=guest-pvp',
    name: 'automation boot can land on pvp ranking with focus brief visible',
    assert: ({ payload, probe }) => (
      probe.screen === 'pvp-screen'
      && probe.guestMode
      && payload?.mode === 'pvp-screen'
      && payload?.pvp?.activeTab === 'ranking'
      && !!payload?.pvp?.rankingFocus?.rank?.user?.username
      && !!payload?.pvp?.rankingFocus?.duelBrief?.targetName
      && /焦点对手/.test(probe.pvpTitle)
      && /已锁定|可锁定|约战/.test(probe.pvpHint)
    )
  }
];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader']
  });

  for (const scenario of scenarios) {
    await runScenario(browser, scenario);
  }

  const report = {
    baseUrl,
    findings,
    consoleErrors,
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  const failed = findings.filter((item) => !item.pass);
  await browser.close();
  if (failed.length > 0 || consoleErrors.length > 0) {
    process.exit(1);
  }
})();
