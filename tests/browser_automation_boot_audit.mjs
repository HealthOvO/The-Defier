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

async function runIdleDeferredResourceScenario(browser) {
  const scenarioId = 'idle-deferred-resources';
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const resourceUrls = [];
  page.on('request', (request) => resourceUrls.push(request.url()));
  page.on('console', (msg) => {
    if (msg.type() === 'error') recordConsoleError(msg.text(), scenarioId);
  });
  page.on('pageerror', (err) => recordConsoleError(String(err), scenarioId));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => (
    document.documentElement.getAttribute('data-runtime-ready') === 'true'
  ), null, { timeout: 12000 });
  await page.waitForTimeout(800);

  const deferredResourcePattern = /\/(?:assets\/(?:pvp-scene|SeasonOpsView|FateChronicleView|SocialView|challenge_hub|pvp-|season-ops-|fate-chronicle-|account-social-)[^/]*\.(?:js|css)|js\/(?:scenes\/pvp-scene|views\/(?:SeasonOpsView|FateChronicleView|SocialView)|core\/challenge_hub)\.js|css\/(?:pvp|season-ops|fate-chronicle|account-social)\.css)(?:\?|$)/;
  const unexpectedResources = resourceUrls.filter((url) => deferredResourcePattern.test(url));
  const probe = await page.evaluate(() => ({
    currentScreen: window.game?.currentScreen || '',
    pvpSceneReady: !!window.PVPScene,
    seasonOpsViewReady: !!window.game?.seasonOpsView,
    fateChronicleViewReady: !!window.game?.fateChronicleView,
    socialViewReady: !!window.game?.socialView,
    challengeHubReady: typeof window.game?.challengeHub?.showChallengeHub === 'function',
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  }));

  add(
    'idle main menu leaves secondary PVP, season, chronicle, social and challenge modules deferred',
    probe.currentScreen === 'main-menu'
      && !probe.pvpSceneReady
      && !probe.seasonOpsViewReady
      && !probe.fateChronicleViewReady
      && !probe.socialViewReady
      && !probe.challengeHubReady
      && !probe.horizontalOverflow
      && unexpectedResources.length === 0,
    JSON.stringify({ probe, unexpectedResources }),
  );
  await safeScreenshot(page, path.join(outDir, `${scenarioId}.png`));
  await page.close();
}

async function runColdStartClickScenario(browser, scenario) {
  const { scenarioId, triggerSelector, actionId, label, verifyOutcome } = scenario;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const scenarioErrors = [];
  let delayedRuntimeRequests = 0;
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const message = String(msg.text() || '');
    scenarioErrors.push(message);
    recordConsoleError(message, scenarioId);
  });
  page.on('pageerror', (err) => {
    const message = String(err);
    scenarioErrors.push(message);
    recordConsoleError(message, scenarioId);
  });
  const delayRuntimeRequest = async (route) => {
    delayedRuntimeRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue();
  };
  await page.route('**/assets/index-*.js', delayRuntimeRequest);
  await page.route('**/js/main.js*', delayRuntimeRequest);

  await page.goto(baseUrl, { waitUntil: 'commit' });
  await page.locator(triggerSelector).waitFor({ state: 'visible', timeout: 5000 });
  if (actionId === 'open-pvp') {
    await page.evaluate(() => {
      document.getElementById('pvp-tab-live')?.classList.remove('active');
      document.getElementById('pvp-tab-live')?.setAttribute('aria-selected', 'false');
      document.getElementById('pvp-tab-ranking')?.classList.add('active');
      document.getElementById('pvp-tab-ranking')?.setAttribute('aria-selected', 'true');
      document.getElementById('tab-live')?.classList.remove('active');
      document.getElementById('tab-ranking')?.classList.add('active');
    });
  }
  await page.click(triggerSelector, { timeout: 3000 });
  const queuedProbe = await page.evaluate(({ selector, expectedActionId }) => ({
    ready: document.documentElement.getAttribute('data-runtime-ready') === 'true',
    interceptedClicks: window.__THE_DEFIER_BOOT_CLICK_STATE__?.interceptedClicks || 0,
    replayedClicks: window.__THE_DEFIER_BOOT_CLICK_STATE__?.replayedClicks || 0,
    pendingActionId: window.__THE_DEFIER_BOOT_CLICK_STATE__?.pendingActionId || '',
    queued: document.querySelector(selector)?.getAttribute('data-boot-click-queued') === 'true',
    busy: document.querySelector(selector)?.getAttribute('aria-busy') === 'true',
    actionMatches: document.querySelector(selector)?.dataset.bootAction === expectedActionId,
    loadStatusVisible: !document.getElementById('runtime-load-status')?.hidden,
    loadStatusText: document.querySelector('[data-runtime-load-text]')?.textContent || '',
  }), { selector: triggerSelector, expectedActionId: actionId });
  await page.waitForFunction(() => (
    document.documentElement.getAttribute('data-runtime-ready') === 'true'
      && window.__THE_DEFIER_BOOT_CLICK_STATE__?.replayedClicks === 1
  ), null, { timeout: 12000 });
  if (actionId === 'open-pvp') {
    await page.waitForFunction(() => (
      !!window.PVPScene && window.game?.currentScreen === 'pvp-screen'
    ), null, { timeout: 12000 });
    await page.waitForFunction(() => (
      document.getElementById('pvp-tab-live')?.classList.contains('active')
        && document.getElementById('pvp-tab-live')?.getAttribute('aria-selected') === 'true'
        && document.getElementById('tab-live')?.classList.contains('active')
        && document.getElementById('runtime-load-status')?.hidden === true
    ), null, { timeout: 12000 });
  }
  if (actionId === 'open-chronicle') {
    await page.waitForFunction(() => (
      !!window.game?.fateChronicleView
        && window.game?.currentScreen === 'fate-chronicle-screen'
        && document.getElementById('runtime-load-status')?.hidden === true
    ), null, { timeout: 12000 });
  }
  const replayProbe = await page.evaluate((selector) => ({
    ready: document.documentElement.getAttribute('data-runtime-ready') === 'true',
    gameReady: !!window.game,
    pvpSceneReady: !!window.PVPScene,
    fateChronicleViewReady: !!window.game?.fateChronicleView,
    interceptedClicks: window.__THE_DEFIER_BOOT_CLICK_STATE__?.interceptedClicks || 0,
    replayedClicks: window.__THE_DEFIER_BOOT_CLICK_STATE__?.replayedClicks || 0,
    pendingActionId: window.__THE_DEFIER_BOOT_CLICK_STATE__?.pendingActionId || '',
    queued: document.querySelector(selector)?.hasAttribute('data-boot-click-queued') || false,
    busy: document.querySelector(selector)?.hasAttribute('aria-busy') || false,
    currentScreen: window.game?.currentScreen || '',
    loginPromptActive: !!document.getElementById('generic-confirm-modal')?.classList.contains('active'),
    saveSlotsActive: !!document.getElementById('save-slots-modal')?.classList.contains('active'),
    pvpLiveTabActive: document.getElementById('pvp-tab-live')?.classList.contains('active') || false,
    pvpLiveTabSelected: document.getElementById('pvp-tab-live')?.getAttribute('aria-selected') === 'true',
    pvpLivePaneActive: document.getElementById('tab-live')?.classList.contains('active') || false,
    pvpRankingTabActive: document.getElementById('pvp-tab-ranking')?.classList.contains('active') || false,
    pvpRankingPaneActive: document.getElementById('tab-ranking')?.classList.contains('active') || false,
    fateChronicleActive: document.getElementById('fate-chronicle-screen')?.classList.contains('active') || false,
    fateChronicleBackVisible: (() => {
      const button = document.querySelector('#fate-chronicle-screen.active [data-fate-chronicle-action="return-menu"]');
      const rect = button?.getBoundingClientRect();
      return !!(rect && rect.width >= 44 && rect.height >= 44);
    })(),
    loadStatusVisible: !document.getElementById('runtime-load-status')?.hidden,
  }), triggerSelector);
  add(
    `cold-start ${label} action queues before runtime and runs after Game initialization`,
    delayedRuntimeRequests === 1
      && queuedProbe.ready === false
      && queuedProbe.interceptedClicks === 1
      && queuedProbe.replayedClicks === 0
      && queuedProbe.pendingActionId === actionId
      && queuedProbe.actionMatches
      && queuedProbe.queued
      && queuedProbe.busy
      && queuedProbe.loadStatusVisible
      && /正在唤醒轮回/.test(queuedProbe.loadStatusText)
      && replayProbe.ready
      && replayProbe.gameReady
      && replayProbe.interceptedClicks === 1
      && replayProbe.replayedClicks === 1
      && replayProbe.pendingActionId === ''
      && !replayProbe.queued
      && !replayProbe.busy
      && !replayProbe.loadStatusVisible
      && verifyOutcome(replayProbe)
      && !scenarioErrors.some((message) => /game is not defined|PVPScene is not defined/.test(message)),
    JSON.stringify({ delayedRuntimeRequests, queuedProbe, replayProbe, scenarioErrors }),
  );
  await safeScreenshot(page, path.join(outDir, `${scenarioId}.png`));
  if (actionId === 'open-chronicle') {
    const backVisible = replayProbe.fateChronicleBackVisible;
    await page.click('#fate-chronicle-screen.active [data-fate-chronicle-action="return-menu"]');
    await page.waitForFunction(() => (
      window.game?.currentScreen === 'main-menu'
        && document.getElementById('main-menu')?.classList.contains('active')
    ), null, { timeout: 5000 });
    const returnProbe = await page.evaluate(() => ({
      currentScreen: window.game?.currentScreen || '',
      mainMenuActive: document.getElementById('main-menu')?.classList.contains('active') || false,
    }));
    add(
      'cold-start fate chronicle guest state exposes a usable return to the main menu',
      backVisible && returnProbe.currentScreen === 'main-menu' && returnProbe.mainMenuActive,
      JSON.stringify({ backVisible, returnProbe }),
    );
  }
  await page.close();
}

async function runColdStartTimeoutScenario(browser) {
  const scenarioId = 'cold-start-timeout-retry';
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const scenarioErrors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    scenarioErrors.push(msg.text());
    recordConsoleError(msg.text(), scenarioId);
  });
  page.on('pageerror', (err) => {
    scenarioErrors.push(String(err));
    recordConsoleError(String(err), scenarioId);
  });
  await page.route('**/assets/index-*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4500));
    await route.continue();
  });
  await page.route('**/js/main.js*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4500));
    await route.continue();
  });

  await page.goto(baseUrl, { waitUntil: 'commit' });
  await page.locator('#new-game-btn').waitFor({ state: 'visible', timeout: 5000 });
  await page.click('#new-game-btn');
  await page.waitForTimeout(4150);
  const timeoutProbe = await page.evaluate(() => ({
    ready: document.documentElement.getAttribute('data-runtime-ready') === 'true',
    statusVisible: !document.getElementById('runtime-load-status')?.hidden,
    statusState: document.getElementById('runtime-load-status')?.dataset.state || '',
    statusText: document.querySelector('[data-runtime-load-text]')?.textContent || '',
    retryVisible: !document.querySelector('[data-runtime-load-retry]')?.hidden,
  }));
  await safeScreenshot(page, path.join(outDir, `${scenarioId}-error.png`));
  await page.waitForFunction(() => document.documentElement.getAttribute('data-runtime-ready') === 'true', null, { timeout: 12000 });
  const recoveredProbe = await page.evaluate(() => ({
    statusVisible: !document.getElementById('runtime-load-status')?.hidden,
    replayedClicks: window.__THE_DEFIER_BOOT_CLICK_STATE__?.replayedClicks || 0,
  }));

  add(
    'cold-start timeout exposes a visible retry action and clears it after recovery',
    !timeoutProbe.ready
      && timeoutProbe.statusVisible
      && timeoutProbe.statusState === 'error'
      && /载入时间较长，可以重试/.test(timeoutProbe.statusText)
      && timeoutProbe.retryVisible
      && !recoveredProbe.statusVisible
      && recoveredProbe.replayedClicks === 1
      && scenarioErrors.length === 0,
    JSON.stringify({ timeoutProbe, recoveredProbe, scenarioErrors }),
  );
  await safeScreenshot(page, path.join(outDir, `${scenarioId}-recovered.png`));
  await page.close();
}

async function runDeferredModuleRecoveryScenario(browser, scenario) {
  const {
    scenarioId,
    actionId,
    requestPattern,
    expectedScreen,
    expectedErrorText,
    readyKind,
    stylesheetPattern = null,
    loadingShellPattern = null,
  } = scenario;
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let moduleRequests = 0;
  await page.route(requestPattern, async (route) => {
    moduleRequests += 1;
    if (moduleRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/javascript',
        body: `throw new Error("temporary ${readyKind} chunk failure")`
      });
      return;
    }
    await route.continue();
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-runtime-ready') === 'true', null, { timeout: 12000 });
  await page.click(`[data-boot-action="${actionId}"]`);
  await page.waitForFunction(() => (
    document.getElementById('runtime-load-status')?.dataset.state === 'error'
      && !document.querySelector('[data-runtime-load-retry]')?.hidden
  ), null, { timeout: 12000 });
  const failureProbe = await page.evaluate(() => ({
    statusVisible: !document.getElementById('runtime-load-status')?.hidden,
    statusText: document.querySelector('[data-runtime-load-text]')?.textContent || '',
    retryText: document.querySelector('[data-runtime-load-retry]')?.textContent || '',
    currentScreen: window.game?.currentScreen || '',
    loadingShellText: document.querySelector('[data-season-ops-loading-shell], [data-fate-chronicle-loading-shell]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    backButtonVisible: (() => {
      const button = document.querySelector('[data-season-ops-loading-back], [data-fate-chronicle-loading-back]');
      const rect = button?.getBoundingClientRect();
      return !!(rect && rect.width > 0 && rect.height > 0);
    })(),
  }));
  await safeScreenshot(page, path.join(outDir, `${scenarioId}-error.png`));
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 12000 }),
    page.click('[data-runtime-load-retry]'),
  ]);
  await page.waitForFunction(() => (
    document.documentElement.getAttribute('data-runtime-ready') === 'true'
  ), null, { timeout: 12000 });
  await page.waitForFunction(({ screen, kind }) => {
    const ready = {
      pvp: () => !!window.PVPScene,
      season: () => !!window.game?.seasonOpsView,
      chronicle: () => !!window.game?.fateChronicleView
        && !!document.querySelector('#fate-chronicle-screen .fate-chronicle-shell'),
      challenge: () => typeof window.game?.challengeHub?.showChallengeHub === 'function',
    }[kind];
    return window.game?.currentScreen === screen && !!ready?.();
  }, { screen: expectedScreen, kind: readyKind }, { timeout: 12000 });
  const recoveryProbe = await page.evaluate(({ kind, stylesheetSource }) => ({
    statusVisible: !document.getElementById('runtime-load-status')?.hidden,
    currentScreen: window.game?.currentScreen || '',
    viewReady: ({
      pvp: () => !!window.PVPScene,
      season: () => !!window.game?.seasonOpsView,
      chronicle: () => !!window.game?.fateChronicleView
        && !!document.querySelector('#fate-chronicle-screen .fate-chronicle-shell'),
      challenge: () => typeof window.game?.challengeHub?.showChallengeHub === 'function',
    }[kind])?.() || false,
    stylesheetLoaded: !stylesheetSource
      || [...document.styleSheets].some(sheet => new RegExp(stylesheetSource).test(String(sheet.href || ''))),
    retryActionCleared: !sessionStorage.getItem('theDefierDeferredRetryActionV1'),
  }), { kind: readyKind, stylesheetSource: stylesheetPattern?.source || '' });

  add(
    `deferred ${readyKind} module failure can reload and resume the requested screen`,
    moduleRequests >= 2
      && failureProbe.statusVisible
      && expectedErrorText.test(failureProbe.statusText)
      && /重新载入/.test(failureProbe.retryText)
      && failureProbe.currentScreen === expectedScreen
      && (!loadingShellPattern || loadingShellPattern.test(failureProbe.loadingShellText))
      && (!loadingShellPattern || failureProbe.backButtonVisible)
      && !recoveryProbe.statusVisible
      && recoveryProbe.currentScreen === expectedScreen
      && recoveryProbe.viewReady
      && recoveryProbe.stylesheetLoaded
      && recoveryProbe.retryActionCleared,
    JSON.stringify({ moduleRequests, failureProbe, recoveryProbe }),
  );
  await safeScreenshot(page, path.join(outDir, `${scenarioId}-recovered.png`));
  await page.close();
}

async function runDeferredCrossNavigationRaceScenario(browser) {
  const scenarioId = 'deferred-cross-navigation-race';
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let seasonRequests = 0;
  await page.route(/\/(?:assets\/SeasonOpsView-[^/]+\.js|js\/views\/SeasonOpsView\.js)(?:\?|$)/, async (route) => {
    seasonRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.fulfill({
      status: 503,
      contentType: 'application/javascript',
      body: 'throw new Error("stale season chunk failure")',
    });
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-runtime-ready') === 'true', null, { timeout: 12000 });
  await page.click('[data-boot-action="open-season"]');
  await page.waitForFunction(() => !document.getElementById('runtime-load-status')?.hidden, null, { timeout: 5000 });
  await page.click('[data-season-ops-loading-back]');
  await page.click('[data-boot-action="open-pvp"]');
  await page.waitForFunction(() => (
    !!window.PVPScene
      && window.game?.currentScreen === 'pvp-screen'
      && document.getElementById('runtime-load-status')?.hidden === true
  ), null, { timeout: 12000 });
  await page.waitForTimeout(2700);

  const probe = await page.evaluate(() => ({
    currentScreen: window.game?.currentScreen || '',
    statusVisible: !document.getElementById('runtime-load-status')?.hidden,
    statusText: document.querySelector('[data-runtime-load-text]')?.textContent || '',
    pvpSceneReady: !!window.PVPScene,
  }));
  add(
    'a stale deferred failure cannot overwrite the newer PVP screen status',
    seasonRequests === 1
      && probe.currentScreen === 'pvp-screen'
      && probe.pvpSceneReady
      && !probe.statusVisible
      && !/赛季司暂时无法开启/.test(probe.statusText),
    JSON.stringify({ seasonRequests, probe }),
  );
  await safeScreenshot(page, path.join(outDir, `${scenarioId}.png`));
  await page.close();
}

async function runChallengeIntentWarmupRetryScenario(browser) {
  const scenarioId = 'challenge-intent-warmup-retry';
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let moduleRequests = 0;
  await page.route(/\/(?:assets\/challenge_hub-[^/]+\.js|js\/core\/challenge_hub\.js)(?:\?|$)/, async (route) => {
    moduleRequests += 1;
    if (moduleRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/javascript',
        body: 'throw new Error("challenge warmup failure")',
      });
      return;
    }
    await route.continue();
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-runtime-ready') === 'true', null, { timeout: 12000 });
  const target = page.locator('[data-boot-action="open-challenges"]');
  await target.hover();
  for (let attempt = 0; attempt < 20 && moduleRequests === 0; attempt += 1) {
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(100);
  const requestsAfterWarmup = moduleRequests;
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 12000 }),
    target.click(),
  ]);
  await page.waitForFunction(() => document.documentElement.getAttribute('data-runtime-ready') === 'true', null, { timeout: 12000 });
  await page.waitForFunction(() => (
    window.game?.currentScreen === 'challenge-screen'
      && typeof window.game?.challengeHub?.showChallengeHub === 'function'
      && document.getElementById('runtime-load-status')?.hidden === true
  ), null, { timeout: 12000 });

  const probe = await page.evaluate(() => ({
    currentScreen: window.game?.currentScreen || '',
    challengeReady: typeof window.game?.challengeHub?.showChallengeHub === 'function',
    statusVisible: !document.getElementById('runtime-load-status')?.hidden,
  }));
  add(
    'challenge click automatically reloads and resumes after a failed intent warmup',
    requestsAfterWarmup === 1
      && moduleRequests >= 2
      && probe.currentScreen === 'challenge-screen'
      && probe.challengeReady
      && !probe.statusVisible,
    JSON.stringify({ requestsAfterWarmup, moduleRequests, probe }),
  );
  await safeScreenshot(page, path.join(outDir, `${scenarioId}.png`));
  await page.close();
}

async function runMidSessionWarmupFailureScenario(browser) {
  const scenarioId = 'mid-session-warmup-failure';
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let moduleRequests = 0;
  let mainFrameNavigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) mainFrameNavigations += 1;
  });
  await page.route(/\/(?:assets\/SeasonOpsView-[^/]+\.js|js\/views\/SeasonOpsView\.js)(?:\?|$)/, async (route) => {
    moduleRequests += 1;
    if (moduleRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/javascript',
        body: 'throw new Error("season warmup failure before gameplay")',
      });
      return;
    }
    await route.continue();
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-runtime-ready') === 'true', null, { timeout: 12000 });
  const target = page.locator('[data-boot-action="open-season"]');
  await target.hover();
  for (let attempt = 0; attempt < 20 && moduleRequests === 0; attempt += 1) {
    await page.waitForTimeout(50);
  }
  await page.waitForFunction(() => window.game?.deferredModuleWarmupFailures?.has('open-season') === true, null, { timeout: 5000 });
  await page.evaluate(() => window.game.showCharacterSelection());
  const navigationsBeforeEntry = mainFrameNavigations;
  await page.evaluate(() => window.game.showSeasonOps());
  await page.waitForFunction(() => {
    const status = document.getElementById('runtime-load-status');
    return window.game?.currentScreen === 'season-ops-screen'
      && (
        !!window.game?.seasonOpsView
        || (status?.dataset.state === 'error' && !document.querySelector('[data-runtime-load-retry]')?.hidden)
      );
  }, null, { timeout: 12000 });

  const probe = await page.evaluate(() => ({
    currentScreen: window.game?.currentScreen || '',
    markerCleared: window.game?.deferredModuleWarmupFailures?.has('open-season') === false,
    seasonReady: !!window.game?.seasonOpsView,
    statusVisible: !document.getElementById('runtime-load-status')?.hidden,
    statusState: document.getElementById('runtime-load-status')?.dataset.state || '',
    retryVisible: !document.querySelector('[data-runtime-load-retry]')?.hidden,
  }));
  add(
    'a failed menu warmup does not force a surprise reload from a later gameplay screen',
    moduleRequests >= 1
      && mainFrameNavigations === navigationsBeforeEntry
      && probe.currentScreen === 'season-ops-screen'
      && probe.markerCleared
      && (
        (probe.seasonReady && !probe.statusVisible)
        || (!probe.seasonReady && probe.statusVisible && probe.statusState === 'error' && probe.retryVisible)
      ),
    JSON.stringify({ moduleRequests, mainFrameNavigations, navigationsBeforeEntry, probe }),
  );
  await safeScreenshot(page, path.join(outDir, `${scenarioId}.png`));
  await page.close();
}

const deferredRecoveryScenarios = [
  {
    scenarioId: 'season-module-recovery',
    actionId: 'open-season',
    requestPattern: /\/(?:assets\/SeasonOpsView-[^/]+\.js|js\/views\/SeasonOpsView\.js)(?:\?|$)/,
    expectedScreen: 'season-ops-screen',
    expectedErrorText: /赛季司暂时无法开启/,
    readyKind: 'season',
    stylesheetPattern: /(?:season-ops-[^/]+|css\/season-ops)\.css/,
    loadingShellPattern: /卷宗未能展开/,
  },
  {
    scenarioId: 'pvp-module-recovery',
    actionId: 'open-pvp',
    requestPattern: /\/(?:assets\/pvp-scene-[^/]+\.js|js\/scenes\/pvp-scene\.js)(?:\?|$)/,
    expectedScreen: 'pvp-screen',
    expectedErrorText: /天道榜暂时无法开启/,
    readyKind: 'pvp',
    stylesheetPattern: /(?:pvp-[^/]+|css\/pvp)\.css/,
  },
  {
    scenarioId: 'challenge-module-recovery',
    actionId: 'open-challenges',
    requestPattern: /\/(?:assets\/challenge_hub-[^/]+\.js|js\/core\/challenge_hub\.js)(?:\?|$)/,
    expectedScreen: 'challenge-screen',
    expectedErrorText: /观星台暂时无法开启/,
    readyKind: 'challenge',
  },
  {
    scenarioId: 'chronicle-module-recovery',
    actionId: 'open-chronicle',
    requestPattern: /\/(?:assets\/FateChronicleView-[^/]+\.js|js\/views\/FateChronicleView\.js)(?:\?|$)/,
    expectedScreen: 'fate-chronicle-screen',
    expectedErrorText: /命途长卷暂时无法开启/,
    readyKind: 'chronicle',
    stylesheetPattern: /(?:fate-chronicle-[^/]+|css\/fate-chronicle)\.css/,
    loadingShellPattern: /命途长卷未能展开/,
  },
];

async function runScenario(browser, scenario) {
  const page = await browser.newPage({ viewport: scenario.viewport || { width: 1440, height: 900 } });
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
      if (scenario.mockReplayShareDelayMs) {
        await new Promise(resolve => setTimeout(resolve, scenario.mockReplayShareDelayMs));
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(scenario.mockReplayShare)
      });
    });
  }

  await page.goto(`${baseUrl}${scenario.query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  if (/autotest=guest-pvp|pvpReplayShare=/.test(scenario.query)) {
    await page.waitForFunction(() => (
      !!window.PVPScene && window.game?.currentScreen === 'pvp-screen'
    ), null, { timeout: 12000 });
  }
  if (scenario.mockReplayShare && !scenario.verifyReplayExitWhileLoading) {
    await page.waitForFunction(() => (
      document.querySelector('[data-live-replay-share-viewer]')?.getAttribute('data-live-replay-share-viewer-status') === 'ready'
    ), null, { timeout: 12000 });
  }
  if (scenario.verifyReplayExitWhileLoading) {
    await page.waitForFunction(() => (
      document.querySelector('[data-live-replay-share-viewer]')?.getAttribute('data-live-replay-share-viewer-status') === 'loading'
        && !!document.querySelector('[data-live-replay-share-close]')
    ), null, { timeout: 12000 });
    await page.locator('[data-live-replay-share-close]').click();
    await page.waitForFunction(() => (
      !window.PVPScene?.liveReplayShareViewer
        && document.querySelector('[data-live-pvp-root]')?.hasAttribute('data-live-public-replay') === false
        && !new URL(window.location.href).searchParams.has('pvpReplayShare')
    ), null, { timeout: 12000 });
    await page.waitForTimeout((scenario.mockReplayShareDelayMs || 0) + 500);
  }

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
    publicReplayShareParamPresent: new URL(window.location.href).searchParams.has('pvpReplayShare'),
    publicReplayViewerMetrics: (() => {
      const viewer = document.querySelector('[data-live-replay-share-viewer]');
      const highlightList = document.querySelector('[data-live-replay-share-highlight-list]');
      const viewerRect = viewer?.getBoundingClientRect();
      const highlightRect = highlightList?.getBoundingClientRect();
      const overflows = (rect, element) => !!(rect && element && (
        rect.left < -1
        || rect.right > window.innerWidth + 1
        || element.scrollWidth > Math.ceil(rect.width) + 1
      ));
      return {
        viewportWidth: window.innerWidth,
        documentOverflowsX: document.documentElement.scrollWidth > window.innerWidth + 1,
        viewerOverflowsX: overflows(viewerRect, viewer),
        viewerStartsInViewport: !!(viewerRect && viewerRect.top >= -1 && viewerRect.top < window.innerHeight),
        highlightVisible: !!(highlightRect && highlightRect.width > 0 && highlightRect.height > 0),
        highlightOverflowsX: overflows(highlightRect, highlightList)
      };
    })(),
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
  if (scenario.verifyReplayExit) {
    await page.locator('[data-live-replay-share-close]').click();
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-live-pvp-root]');
      const host = document.querySelector('[data-live-replay-share-viewer-root]');
      const joinButton = document.querySelector('[data-live-action="join-queue"]');
      const joinRect = joinButton?.getBoundingClientRect();
      return !window.PVPScene?.liveReplayShareViewer
        && root?.hasAttribute('data-live-public-replay') === false
        && host?.hidden === true
        && !!(joinRect && joinRect.width > 0 && joinRect.height > 0)
        && !new URL(window.location.href).searchParams.has('pvpReplayShare');
    }, null, { timeout: 12000 });
    const exitProbe = await page.evaluate(() => ({
      viewerState: window.PVPScene?.liveReplayShareViewer || null,
      replaySurfaceActive: document.querySelector('[data-live-pvp-root]')?.hasAttribute('data-live-public-replay') || false,
      viewerHostHidden: document.querySelector('[data-live-replay-share-viewer-root]')?.hidden === true,
      liveJoinVisible: (() => {
        const button = document.querySelector('[data-live-action="join-queue"]');
        const rect = button?.getBoundingClientRect();
        return !!(rect && rect.width > 0 && rect.height > 0);
      })(),
      shareParamPresent: new URL(window.location.href).searchParams.has('pvpReplayShare'),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    }));
    add(
      'public replay viewer can return to normal live PVP without reload',
      exitProbe.viewerState === null
        && !exitProbe.replaySurfaceActive
        && exitProbe.viewerHostHidden
        && exitProbe.liveJoinVisible
        && !exitProbe.shareParamPresent
        && !exitProbe.horizontalOverflow,
      JSON.stringify(exitProbe),
    );
    await safeScreenshot(page, path.join(outDir, `${scenario.id}-returned-live.png`));
  }
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
    viewport: { width: 390, height: 844 },
    verifyReplayExit: true,
    name: 'public replay share mobile viewer keeps key moments readable before auth or automation boot',
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
        eventCount: 4,
        events: [
          { sequence: 1, eventType: 'battle_started', actingSeat: 'A', publicData: { firstSeat: 'A' } },
          { sequence: 2, eventType: 'opening_protection_triggered', actingSeat: 'A', publicData: { protectedSeat: 'B', minimumHp: 1, preventedDamage: 8 } },
          { sequence: 3, eventType: 'damage_applied', actingSeat: 'B', publicData: { targetSeat: 'A', hpDamage: 8, targetHp: 12 } },
          { sequence: 4, eventType: 'match_finished', actingSeat: 'A', publicData: { reason: 'lethal', winnerSeat: 'A', loserSeat: 'B' } }
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
      && /关键节点/.test(probe.publicReplayViewerText)
      && /开局/.test(probe.publicReplayViewerText)
      && /反打窗口/.test(probe.publicReplayViewerText)
      && /终局/.test(probe.publicReplayViewerText)
      && !/battle_started|opening_protection_triggered|match_finished/.test(probe.publicReplayViewerText)
      && probe.publicReplayViewerMetrics?.viewportWidth === 390
      && probe.publicReplayViewerMetrics?.viewerStartsInViewport
      && probe.publicReplayViewerMetrics?.highlightVisible
      && !probe.publicReplayViewerMetrics?.viewerOverflowsX
      && !probe.publicReplayViewerMetrics?.highlightOverflowsX
      && !probe.publicReplayViewerMetrics?.documentOverflowsX
      && !/pvpm-browser-raw-should-not-render|SHOULD_NOT_RENDER|postMatchReview|settlementReport|seasonHonorReport/.test(probe.publicReplayViewerText)
      && payload?.mode === 'pvp-screen'
      && payload?.pvp?.activeTab === 'live'
      && payload?.pvp?.live === null
      && payload?.pvp?.replayShareViewer?.status === 'ready'
      && payload?.pvp?.replayShareViewer?.matchRef === 'b0c0ffee1234abcd'
      && payload?.pvp?.replayShareViewer?.visibilityLayer === 'replay_public'
      && payload?.pvp?.replayShareViewer?.publicSummary?.finishReason === 'lethal'
    )
  },
  {
    id: 'public-replay-share-loading-exit',
    query: '?pvpReplayShare=pvplrs-browser_loading_exit_token_1234567890',
    viewport: { width: 390, height: 844 },
    verifyReplayExitWhileLoading: true,
    mockReplayShareDelayMs: 2500,
    name: 'public replay viewer loading state stays closed after a delayed response',
    mockReplayShare: {
      success: true,
      share: {
        visibilityLayer: 'replay_public',
        sourceVisibility: 'replay_public',
        matchRef: 'late-response-should-not-render'
      },
      replay: {
        visibilityLayer: 'replay_public',
        publicSummary: { status: 'finished', winnerSeat: 'A', loserSeat: 'B', finishReason: 'lethal' },
        events: [],
        hiddenScan: { forbiddenTokenCount: 0, forbiddenKeyCount: 0, forbiddenStringCount: 0 }
      }
    },
    assert: ({ payload, probe }) => (
      probe.screen === 'pvp-screen'
      && !probe.authModalActive
      && !probe.saveSlotsModalActive
      && probe.pvpLiveTabActive
      && probe.pvpLivePaneActive
      && !probe.publicReplayViewerVisible
      && probe.publicReplayViewerStatus === ''
      && !probe.publicReplayShareParamPresent
      && probe.pvpLiveJoinVisible
      && !probe.publicReplayViewerMetrics?.documentOverflowsX
      && payload?.pvp?.replayShareViewer === null
    )
  }
];

const coldStartScenarios = [
  {
    scenarioId: 'cold-start-new-game-action',
    triggerSelector: '#new-game-btn',
    actionId: 'new-game',
    label: 'new game',
    verifyOutcome: (probe) => (
      probe.loginPromptActive
      || probe.saveSlotsActive
      || probe.currentScreen === 'character-selection-screen'
    ),
  },
  {
    scenarioId: 'cold-start-pvp-action',
    triggerSelector: '#pvp-btn',
    actionId: 'open-pvp',
    label: 'PVP',
    verifyOutcome: (probe) => (
      probe.pvpSceneReady
      && probe.currentScreen === 'pvp-screen'
      && probe.pvpLiveTabActive
      && probe.pvpLiveTabSelected
      && probe.pvpLivePaneActive
      && !probe.pvpRankingTabActive
      && !probe.pvpRankingPaneActive
    ),
  },
  {
    scenarioId: 'cold-start-fate-chronicle-action',
    triggerSelector: 'button[data-boot-action="open-chronicle"]',
    actionId: 'open-chronicle',
    label: 'fate chronicle',
    verifyOutcome: (probe) => (
      probe.currentScreen === 'fate-chronicle-screen'
      && probe.fateChronicleViewReady
      && probe.fateChronicleActive
      && probe.fateChronicleBackVisible
    ),
  },
];

(async () => {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader']
  });

  await runIdleDeferredResourceScenario(browser);
  for (const scenario of coldStartScenarios) {
    await runColdStartClickScenario(browser, scenario);
  }
  await runColdStartTimeoutScenario(browser);
  for (const scenario of deferredRecoveryScenarios) {
    await runDeferredModuleRecoveryScenario(browser, scenario);
  }
  await runDeferredCrossNavigationRaceScenario(browser);
  await runChallengeIntentWarmupRetryScenario(browser);
  await runMidSessionWarmupFailureScenario(browser);
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
