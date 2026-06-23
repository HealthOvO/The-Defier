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
  if (scenario.mockReplayShare) {
    await page.addInitScript(() => {
      localStorage.setItem('theDefierServerConfig', JSON.stringify({
        baseUrl: window.location.origin,
        pvpPathPrefix: '/api/pvp'
      }));
    });
    await page.route('**/api/pvp/live/replay-shares/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(scenario.mockReplayShare)
      });
    });
  }

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
    pvpHint: document.getElementById('pvp-challenge-intent')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    pvpLiveTabActive: !!document.querySelector('[data-pvp-tab="live"]')?.classList.contains('active'),
    pvpRankingTabActive: !!document.querySelector('[data-pvp-tab="ranking"]')?.classList.contains('active'),
    pvpLivePaneActive: !!document.getElementById('tab-live')?.classList.contains('active'),
    pvpRankingPaneActive: !!document.getElementById('tab-ranking')?.classList.contains('active'),
    authModalActive: !!document.getElementById('auth-modal')?.classList.contains('active'),
    saveSlotsModalActive: !!document.getElementById('save-slots-modal')?.classList.contains('active'),
    publicReplayViewerVisible: (() => {
      const viewer = document.querySelector('[data-live-replay-share-viewer]');
      if (!viewer) return false;
      const rect = viewer.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })(),
    publicReplayViewerText: document.querySelector('[data-live-replay-share-viewer]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    publicReplayViewerStatus: document.querySelector('[data-live-replay-share-viewer]')?.getAttribute('data-live-replay-share-viewer-status') || '',
    pvpLiveJoinVisible: (() => {
      const button = document.querySelector('[data-live-action="join-queue"]');
      if (!button) return false;
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })()
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
    name: 'automation boot lands on live ranked pvp by default',
    assert: ({ payload, probe }) => (
      probe.screen === 'pvp-screen'
      && probe.guestMode
      && payload?.mode === 'pvp-screen'
      && payload?.pvp?.activeTab === 'live'
      && probe.pvpLiveTabActive
      && probe.pvpLivePaneActive
      && !probe.pvpRankingTabActive
      && !probe.pvpRankingPaneActive
      && probe.pvpLiveJoinVisible
    )
  },
  {
    id: 'public-replay-share-viewer',
    query: '?autotest=guest-map&pvpReplayShare=pvplrs-browser_public_viewer_token_1234567890',
    name: 'public replay share query lands on anonymous viewer before auth or automation boot',
    mockReplayShare: {
      success: true,
      share: {
        reportVersion: 'pvp-live-replay-share-v1',
        shareToken: 'pvplrs-browser_public_viewer_token_1234567890',
        apiPath: '/api/pvp/live/replay-shares/pvplrs-browser_public_viewer_token_1234567890',
        sharePath: '/?pvpReplayShare=pvplrs-browser_public_viewer_token_1234567890',
        shareUrl: 'https://080305.xyz/?pvpReplayShare=pvplrs-browser_public_viewer_token_1234567890',
        visibilityLayer: 'replay_public',
        sourceVisibility: 'replay_public',
        matchRef: 'b0c0ffee1234abcd',
        rankedImpact: 'none',
        rewardImpact: 'none',
        boundary: '公开战报分享只暴露 replay_public 脱敏回放。'
      },
      replay: {
        reportVersion: 'pvp-live-replay-v1',
        visibilityLayer: 'replay_public',
        matchId: 'pvpm-browser-raw-should-not-render',
        publicSummary: {
          status: 'finished',
          winnerSeat: 'A',
          loserSeat: 'B',
          finishReason: 'lethal'
        },
        eventCount: 2,
        events: [
          { sequence: 1, eventType: 'battle_started', actingSeat: 'A', publicData: { firstSeat: 'A' } },
          { sequence: 2, eventType: 'damage_applied', actingSeat: 'A', publicData: { targetSeat: 'B', hpDamage: 8, targetHp: 0 } }
        ],
        hiddenScan: { forbiddenTokenCount: 0, forbiddenKeyCount: 0, forbiddenStringCount: 0 },
        postMatchReview: { summary: 'SHOULD_NOT_RENDER_POST_MATCH_REVIEW' },
        settlementReport: { summaryLine: 'SHOULD_NOT_RENDER_SETTLEMENT' },
        seasonHonorReport: { summaryLine: 'SHOULD_NOT_RENDER_SEASON_HONOR' }
      }
    },
    assert: ({ payload, probe }) => (
      probe.screen === 'pvp-screen'
      && !probe.guestMode
      && !probe.authModalActive
      && !probe.saveSlotsModalActive
      && probe.pvpLiveTabActive
      && probe.pvpLivePaneActive
      && probe.publicReplayViewerVisible
      && probe.publicReplayViewerStatus === 'ready'
      && /b0c0ffee1234abcd/.test(probe.publicReplayViewerText)
      && /replay_public/.test(probe.publicReplayViewerText)
      && /伤害终结/.test(probe.publicReplayViewerText)
      && !/pvpm-browser-raw-should-not-render|SHOULD_NOT_RENDER|postMatchReview|settlementReport|seasonHonorReport/.test(probe.publicReplayViewerText)
      && payload?.mode === 'pvp-screen'
      && payload?.pvp?.activeTab === 'live'
      && payload?.pvp?.live === null
      && payload?.pvp?.replayShareViewer?.status === 'ready'
      && payload?.pvp?.replayShareViewer?.matchRef === 'b0c0ffee1234abcd'
      && payload?.pvp?.replayShareViewer?.visibilityLayer === 'replay_public'
      && payload?.pvp?.replayShareViewer?.publicSummary?.finishReason === 'lethal'
    )
  }
];

(async () => {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
  const browser = await chromium.launch({
    executablePath,
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
