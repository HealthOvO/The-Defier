import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/web-ui-gallery-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

async function captureScreenshot(page, filename) {
  const session = await page.context().newCDPSession(page);
  const shot = await session.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, filename), Buffer.from(shot.data, 'base64'));
}

async function boot(page) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
}

async function showCharacterSelectionWithLoadedPortraits(page) {
  await boot(page);
  await page.waitForFunction(() => window.game && typeof game.showCharacterSelection === 'function');
  await page.evaluate(() => {
    game.guestMode = true;
    game.showCharacterSelection();
  });
  await page.waitForFunction(() => {
    const images = Array.from(document.querySelectorAll('.character-card .char-avatar-img'));
    return images.length >= 4 && images.every((image) => image.complete && image.naturalWidth >= 256 && image.naturalHeight >= 256);
  }, null, { timeout: 8000 });
}

function collectCharacterSelectionProbe() {
  const container = document.getElementById('character-selection-container');
  const cards = document.querySelectorAll('.character-card');
  const destiny = document.getElementById('run-destiny-selection');
  if (!container || cards.length < 4 || !destiny) return { ok: false, reason: 'missing_character_nodes' };
  const rect = container.getBoundingClientRect();
  const portraitProbes = Array.from(cards).map((card) => {
    const header = card.querySelector('.char-header');
    const wrapper = card.querySelector('.char-avatar-wrapper');
    const image = card.querySelector('.char-avatar-img');
    if (!header || !wrapper || !image) return { id: card.dataset.id, ok: false, reason: 'missing_portrait_nodes' };
    const fallback = image.nextElementSibling;
    const fallbackReady =
      image.getAttribute('data-fallback-emoji') === 'true' &&
      !!fallback &&
      fallback.classList.contains('char-avatar-emoji') &&
      fallback.textContent.trim().length > 0;
    const headerRect = header.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const visibleTop = Math.max(headerRect.top, wrapperRect.top);
    const visibleBottom = Math.min(headerRect.bottom, wrapperRect.bottom);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    const visibleRatio = wrapperRect.height > 0 ? visibleHeight / wrapperRect.height : 0;
    const squareDelta = Math.abs(wrapperRect.width - wrapperRect.height);
    return {
      id: card.dataset.id,
      ok:
        headerRect.height >= 120 &&
        wrapperRect.width >= 88 &&
        wrapperRect.height >= 88 &&
        squareDelta <= 2 &&
        visibleRatio >= 0.88 &&
        image.complete &&
        image.naturalWidth >= 256 &&
        image.naturalHeight >= 256 &&
        fallbackReady,
      headerHeight: Math.round(headerRect.height),
      wrapperWidth: Math.round(wrapperRect.width),
      wrapperHeight: Math.round(wrapperRect.height),
      visibleRatio: Number(visibleRatio.toFixed(2)),
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      fallbackReady,
      fallbackText: fallback?.textContent?.trim() || '',
    };
  });
  const portraitsOk = portraitProbes.every((probe) => probe.ok);
  return {
    ok:
      rect.left >= 8 &&
      rect.right <= window.innerWidth - 8 &&
      rect.bottom <= window.innerHeight - 8 &&
      document.documentElement.scrollWidth <= window.innerWidth + 2 &&
      portraitsOk,
    cardCount: cards.length,
    portraitProbes,
    rect: {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    }
  };
}

function collectMainMenuProbe(options = {}) {
  const requireFullFit = options.requireFullFit !== false;
  const shell = document.querySelector('#main-menu .menu-content');
  const cards = document.querySelectorAll('#main-menu .menu-oracle-card');
  const utilities = document.querySelectorAll('#main-menu .util-btn-wrapper');
  if (!shell || cards.length < 3 || utilities.length < 6) return { ok: false, reason: 'missing_main_menu_nodes' };
  const rect = shell.getBoundingClientRect();
  const rectObj = (target) => {
    if (!target) return null;
    const targetRect = target.getBoundingClientRect();
    return {
      left: Math.round(targetRect.left),
      top: Math.round(targetRect.top),
      right: Math.round(targetRect.right),
      bottom: Math.round(targetRect.bottom),
      width: Math.round(targetRect.width),
      height: Math.round(targetRect.height),
    };
  };
  const overlaps = (a, b, margin = 0) => {
    if (!a || !b) return false;
    return !(
      a.right <= b.left + margin ||
      b.right <= a.left + margin ||
      a.bottom <= b.top + margin ||
      b.bottom <= a.top + margin
    );
  };
  const centerHit = (target) => {
    if (!target) return { ok: false, reason: 'missing_target' };
    const targetRect = target.getBoundingClientRect();
    const x = Math.round(targetRect.left + targetRect.width / 2);
    const y = Math.round(targetRect.top + targetRect.height / 2);
    const inViewport = x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight;
    const hit = inViewport ? document.elementFromPoint(x, y) : null;
    return {
      ok: !!hit && (hit === target || target.contains(hit)),
      hitTag: hit ? hit.tagName : '',
      hitClass: hit ? hit.className : '',
    };
  };
  const oracleStrip = document.querySelector('#main-menu .menu-oracle-strip');
  const oracleRect = rectObj(oracleStrip);
  const utilityProbes = Array.from(utilities).map((wrapper) => {
    const button = wrapper.querySelector('.util-btn');
    const label = wrapper.querySelector('.util-label');
    const expectedName = (label?.textContent || '').trim();
    const ariaLabel = (button?.getAttribute('aria-label') || '').trim();
    const title = (button?.getAttribute('title') || '').trim();
    const buttonRect = rectObj(button);
    const labelRect = rectObj(label);
    const labelVisible = !!labelRect && labelRect.width > 0 && labelRect.height > 0;
    const hit = centerHit(button);
    return {
      expectedName,
      ariaLabel,
      title,
      buttonRect,
      labelRect,
      labelVisible,
      hit,
      ok:
        !!expectedName &&
        ariaLabel === expectedName &&
        title === expectedName &&
        !!buttonRect &&
        buttonRect.width >= 44 &&
        buttonRect.height >= 44 &&
        buttonRect.left >= 0 &&
        buttonRect.right <= window.innerWidth + 2 &&
        hit.ok &&
        (!labelVisible || !overlaps(labelRect, oracleRect, -2)),
    };
  });
  const utilitiesOk = utilityProbes.length >= 7 && utilityProbes.every((probe) => probe.ok);
  return {
    ok:
      rect.left >= (requireFullFit ? 12 : 0) &&
      rect.right <= window.innerWidth + (requireFullFit ? -12 : 2) &&
      rect.top >= (requireFullFit ? 8 : -2) &&
      (!requireFullFit || rect.bottom <= window.innerHeight - 8) &&
      document.documentElement.scrollWidth <= window.innerWidth + 2 &&
      utilitiesOk,
    rect: {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    cards: cards.length,
    utilities: utilities.length,
    utilityProbes,
    oracleRect,
  };
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

  await page.addInitScript(() => {
    try {
      localStorage.setItem('theDefierLegacyV1', JSON.stringify({
        essence: 40,
        spent: 0,
        upgrades: {},
        lastPreset: null,
      }));
    } catch {}
  });

  await boot(page);
  const mainMenuProbe = await page.evaluate(collectMainMenuProbe);
  add('main menu shell stays centered, keeps overview cards visible, and utility buttons are reachable', !!mainMenuProbe?.ok, JSON.stringify(mainMenuProbe || null));
  await captureScreenshot(page, '01-main-menu.png');

  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  const mobileMainMenuProbe = await page.evaluate(collectMainMenuProbe, { requireFullFit: false });
  add('main menu mobile utility buttons stay reachable without horizontal overflow', !!mobileMainMenuProbe?.ok, JSON.stringify(mobileMainMenuProbe || null));
  await captureScreenshot(page, '01b-main-menu-mobile.png');
  await page.setViewportSize({ width: 1440, height: 960 });

  await showCharacterSelectionWithLoadedPortraits(page);
  const characterProbe = await page.evaluate(collectCharacterSelectionProbe);
  add('character selection fits inside a single readable shell', !!characterProbe?.ok, JSON.stringify(characterProbe || null));
  await captureScreenshot(page, '02-character-selection.png');
  const characterFallbackProbe = await page.evaluate(() => {
    const image = document.querySelector('.character-card[data-id="yanHan"] .char-avatar-img');
    const fallback = image?.nextElementSibling || null;
    if (!image || !fallback) return { ok: false, reason: 'missing_yanhan_fallback_nodes' };
    image.dispatchEvent(new Event('error', { bubbles: true }));
    const imageStyle = getComputedStyle(image);
    const fallbackStyle = getComputedStyle(fallback);
    const fallbackRect = fallback.getBoundingClientRect();
    return {
      ok:
        imageStyle.display === 'none' &&
        fallbackStyle.display !== 'none' &&
        fallbackRect.width >= 44 &&
        fallbackRect.height >= 44 &&
        fallback.textContent.trim() === '📘',
      imageDisplay: imageStyle.display,
      fallbackDisplay: fallbackStyle.display,
      fallbackText: fallback.textContent.trim(),
      fallbackRect: {
        width: Math.round(fallbackRect.width),
        height: Math.round(fallbackRect.height),
      },
    };
  });
  add('character portrait image error reveals emoji fallback at runtime', !!characterFallbackProbe?.ok, JSON.stringify(characterFallbackProbe || null));

  await page.setViewportSize({ width: 390, height: 844 });
  await showCharacterSelectionWithLoadedPortraits(page);
  const mobileCharacterProbe = await page.evaluate(collectCharacterSelectionProbe);
  add('character selection mobile keeps portraits visible and avoids horizontal overflow', !!mobileCharacterProbe?.ok, JSON.stringify(mobileCharacterProbe || null));
  await captureScreenshot(page, '02b-character-selection-mobile.png');
  await page.setViewportSize({ width: 1440, height: 960 });

  await boot(page);
  const challengeProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showChallengeHub !== 'function') return { ok: false, reason: 'no_challenge_api' };
    game.showChallengeHub('weekly');
    const shell = document.querySelector('#challenge-screen .challenge-shell');
    const scroll = document.querySelector('#challenge-screen .challenge-scroll-container');
    if (!shell || !scroll) return { ok: false, reason: 'missing_challenge_nodes' };
    const shellRect = shell.getBoundingClientRect();
    scroll.scrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    return {
      ok:
        shellRect.left >= 8 &&
        shellRect.right <= window.innerWidth - 8 &&
        shellRect.bottom <= window.innerHeight - 8 &&
        scroll.scrollTop > 0 &&
        document.documentElement.scrollWidth <= window.innerWidth + 2,
      shellRect: {
        left: Math.round(shellRect.left),
        top: Math.round(shellRect.top),
        right: Math.round(shellRect.right),
        bottom: Math.round(shellRect.bottom),
        width: Math.round(shellRect.width),
        height: Math.round(shellRect.height),
      },
      scrollTop: Math.round(scroll.scrollTop),
    };
  });
  add('challenge screen keeps a centered shell and independent scroll body', !!challengeProbe?.ok, JSON.stringify(challengeProbe || null));
  await captureScreenshot(page, '03-challenge-weekly.png');

  await boot(page);
  const realmProbe = await page.evaluate(() => {
    if (!window.game) return { ok: false, reason: 'no_game' };
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.unlockedRealms = Array.from({ length: 18 }, (_, index) => index + 1);
    const endlessState = typeof game.ensureEndlessState === 'function' ? game.ensureEndlessState() : null;
    if (endlessState) {
      endlessState.unlocked = true;
      endlessState.active = false;
      endlessState.currentCycle = 1;
    }
    game.showScreen('realm-select-screen');
    if (typeof game.initRealmSelect === 'function') game.initRealmSelect();
    if (typeof game.selectRealm === 'function') game.selectRealm('endless');
    const layout = document.querySelector('.realm-select-layout');
    const list = document.getElementById('realm-list-container');
    const panel = document.getElementById('realm-preview-panel');
    if (!layout || !list || !panel) return { ok: false, reason: 'missing_realm_nodes' };
    const layoutRect = layout.getBoundingClientRect();
    return {
      ok:
        layoutRect.left >= 8 &&
        layoutRect.right <= window.innerWidth - 8 &&
        layoutRect.bottom <= window.innerHeight - 8 &&
        document.documentElement.scrollWidth <= window.innerWidth + 2,
      realms: document.querySelectorAll('.realm-card').length,
      layoutRect: {
        left: Math.round(layoutRect.left),
        top: Math.round(layoutRect.top),
        right: Math.round(layoutRect.right),
        bottom: Math.round(layoutRect.bottom),
        width: Math.round(layoutRect.width),
        height: Math.round(layoutRect.height),
      }
    };
  });
  add('realm select keeps list and preview inside one unified shell', !!realmProbe?.ok, JSON.stringify(realmProbe || null));
  await captureScreenshot(page, '04-realm-select.png');

  await boot(page);
  const collectionProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showCollection !== 'function') return { ok: false, reason: 'no_collection_api' };
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.showCollection('laws');
    const shell = document.querySelector('.codex-shell');
    const main = document.querySelector('.codex-main-column');
    const side = document.querySelector('.codex-side-column');
    const activeTab = document.querySelector('#collection [data-collection-tab].active');
    const tabs = Array.from(document.querySelectorAll('#collection [data-collection-tab]'));
    const targetSection = ['sanctum', 'builds', 'slates', 'chapters'].find((section) =>
      tabs.some((tab) => tab.dataset.collectionTab === section)
    );
    if (!shell || !main || !side || !activeTab || !targetSection) {
      return { ok: false, reason: 'missing_collection_nodes' };
    }
    const rect = shell.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    const sideRect = side.getBoundingClientRect();
    return {
      ok:
        rect.left >= 8 &&
        rect.right <= window.innerWidth - 8 &&
        rect.bottom <= window.innerHeight - 8 &&
        document.documentElement.scrollWidth <= window.innerWidth + 2 &&
        activeTab.dataset.collectionTab === 'laws' &&
        mainRect.width > sideRect.width * 0.7,
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      targetSection,
      activeSection: activeTab.dataset.collectionTab,
      tabCount: tabs.length,
      mainWidth: Math.round(mainRect.width),
      sideWidth: Math.round(sideRect.width),
    };
  });
  add('law codex sits inside a unified dual-column shell', !!collectionProbe?.ok, JSON.stringify(collectionProbe || null));
  await captureScreenshot(page, '05-law-codex.png');

  if (collectionProbe?.targetSection) {
    await page.click(`#collection [data-collection-tab='${collectionProbe.targetSection}']`, { force: true });
    await page.waitForTimeout(250);
    const collectionSwitchProbe = await page.evaluate((targetSection) => {
      const shell = document.querySelector('.codex-shell');
      const activeTab = document.querySelector('#collection [data-collection-tab].active');
      const activePanel = document.querySelector('#collection [data-collection-panel].active');
      const title = document.getElementById('collection-title');
      const subtitle = document.getElementById('collection-subtitle');
      if (!shell || !activeTab || !activePanel || !title || !subtitle) {
        return { ok: false, reason: 'missing_collection_switch_nodes', targetSection };
      }
      const rect = shell.getBoundingClientRect();
      return {
        ok:
          activeTab.dataset.collectionTab === targetSection &&
          activePanel.dataset.collectionPanel === targetSection &&
          title.textContent.trim().length > 6 &&
          subtitle.textContent.trim().length > 10 &&
          document.documentElement.scrollWidth <= window.innerWidth + 2 &&
          rect.left >= 8 &&
          rect.right <= window.innerWidth - 8,
        targetSection,
        activeSection: activeTab.dataset.collectionTab,
        panelSection: activePanel.dataset.collectionPanel,
        title: title.textContent.trim(),
        subtitle: subtitle.textContent.trim().slice(0, 120),
      };
    }, collectionProbe.targetSection);
    add(
      'collection section switching updates the active tab, panel, and heading copy',
      !!collectionSwitchProbe?.ok,
      JSON.stringify(collectionSwitchProbe || null)
    );
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const mobileCollectionProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showCollection !== 'function') return { ok: false, reason: 'no_collection_api' };
    game.showCollection('laws');
    const tabs = Array.from(document.querySelectorAll('#collection [data-collection-tab]'));
    const targetTab =
      tabs.find((tab) => ['builds', 'sanctum', 'slates', 'chapters'].includes(tab.dataset.collectionTab || '')) ||
      tabs.find((tab) => (tab.dataset.collectionTab || '') !== 'laws');
    targetTab?.click();
    const shell = document.querySelector('.codex-shell');
    const activeTab = document.querySelector('#collection [data-collection-tab].active');
    const activePanel = document.querySelector('#collection [data-collection-panel].active');
    const tabRail = tabs[0]?.parentElement || null;
    if (!shell || !activeTab || !activePanel || !targetTab || !tabRail) {
      return { ok: false, reason: 'missing_mobile_collection_nodes' };
    }
    const rect = shell.getBoundingClientRect();
    const panelRect = activePanel.getBoundingClientRect();
    const railRect = tabRail.getBoundingClientRect();
    const rectObj = (el) => {
      if (!el) return null;
      const itemRect = el.getBoundingClientRect();
      return {
        left: Math.round(itemRect.left),
        top: Math.round(itemRect.top),
        right: Math.round(itemRect.right),
        bottom: Math.round(itemRect.bottom),
        width: Math.round(itemRect.width),
        height: Math.round(itemRect.height),
      };
    };
    const selectorFor = (el) => {
      if (!el) return '';
      if (el.id) return `#${el.id}`;
      const classes = Array.from(el.classList || []).slice(0, 3).join('.');
      return `${el.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
    };
    const tabProbes = tabs.map((tab) => {
      const tabRect = rectObj(tab);
      const point = tabRect ? {
        x: Math.round(tabRect.left + tabRect.width / 2),
        y: Math.round(tabRect.top + tabRect.height / 2),
      } : null;
      const hit = point && point.x >= 0 && point.y >= 0 && point.x <= window.innerWidth && point.y <= window.innerHeight
        ? document.elementFromPoint(point.x, point.y)
        : null;
      return {
        section: tab.dataset.collectionTab || '',
        text: (tab.textContent || '').replace(/\s+/g, ' ').trim(),
        rect: tabRect,
        hit: selectorFor(hit),
        hitOk: !!hit && (hit === tab || tab.contains(hit) || hit.contains(tab)),
        textFits: tab.scrollWidth <= tab.clientWidth + 2,
      };
    });
    return {
      ok:
        rect.left >= 0 &&
        rect.right <= window.innerWidth + 2 &&
        panelRect.left >= 0 &&
        panelRect.right <= window.innerWidth + 2 &&
        railRect.left >= 0 &&
        railRect.right <= window.innerWidth + 2 &&
        activeTab.dataset.collectionTab === targetTab.dataset.collectionTab &&
        activePanel.dataset.collectionPanel === targetTab.dataset.collectionTab &&
        document.documentElement.scrollWidth <= window.innerWidth + 2 &&
        tabProbes.length >= 8 &&
        tabProbes.every((probe) => probe.hitOk && probe.textFits && probe.rect?.height >= 44),
      activeSection: activeTab.dataset.collectionTab,
      targetSection: targetTab.dataset.collectionTab,
      shellRect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      panelRect: {
        left: Math.round(panelRect.left),
        top: Math.round(panelRect.top),
        right: Math.round(panelRect.right),
        bottom: Math.round(panelRect.bottom),
        width: Math.round(panelRect.width),
        height: Math.round(panelRect.height),
      },
      railRect: {
        left: Math.round(railRect.left),
        top: Math.round(railRect.top),
        right: Math.round(railRect.right),
        bottom: Math.round(railRect.bottom),
        width: Math.round(railRect.width),
        height: Math.round(railRect.height),
      },
      railScrollWidth: Math.round(tabRail.scrollWidth),
      railClientWidth: Math.round(tabRail.clientWidth),
      tabProbes,
    };
  });
  add(
    'collection stays within the mobile viewport while switching sections',
    !!mobileCollectionProbe?.ok,
    JSON.stringify(mobileCollectionProbe || null)
  );
  await captureScreenshot(page, '05b-collection-mobile.png');

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.waitForTimeout(250);

  await boot(page);
  const treasureProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showTreasureCompendium !== 'function') return { ok: false, reason: 'no_treasure_api' };
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.showTreasureCompendium();
    const shell = document.querySelector('.treasure-compendium-shell');
    if (!shell) return { ok: false, reason: 'missing_treasure_shell' };
    const rect = shell.getBoundingClientRect();
    return {
      ok:
        rect.left >= 8 &&
        rect.right <= window.innerWidth - 8 &&
        rect.bottom <= window.innerHeight - 8 &&
        document.documentElement.scrollWidth <= window.innerWidth + 2,
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    };
  });
  add('treasure compendium stays inside the same shell system as the codex', !!treasureProbe?.ok, JSON.stringify(treasureProbe || null));
  await captureScreenshot(page, '06-treasure-compendium.png');

  await boot(page);
  const rewardProbe = await page.evaluate(() => {
    if (!window.game) return { ok: false, reason: 'no_game' };
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.startRealm(1, false);
    const lawId = typeof LAWS !== 'undefined' ? Object.keys(LAWS)[0] : null;
    if (game.player) game.player.getStealBonus = () => 0;
    game.currentBattleNode = { type: 'elite', id: 990101, completed: false };
    game.stealAttempted = false;
    game.lastBattleRewardMeta = {
      encounter: { themeName: '轮段·反制晶格', tierStage: 2, goldBonus: 18, ringExpBonus: 9 },
    };
    game.showRewardScreen(145, true, { stealLaw: lawId, stealChance: 1 }, 32, { insight: 8, karma: 3 });
    const shell = document.querySelector('.reward-shell');
    if (!shell) return { ok: false, reason: 'missing_reward_shell' };
    const rect = shell.getBoundingClientRect();
    return {
      ok:
        rect.left >= 8 &&
        rect.right <= window.innerWidth - 8 &&
        rect.bottom <= window.innerHeight - 8 &&
        document.documentElement.scrollWidth <= window.innerWidth + 2,
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    };
  });
  add('reward screen stays inside a unified shell and avoids viewport clipping', !!rewardProbe?.ok, JSON.stringify(rewardProbe || null));
  await captureScreenshot(page, '07-reward-screen.png');

  await boot(page);
  const achievementsProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showAchievements !== 'function') return { ok: false, reason: 'no_achievements_api' };
    game.showAchievements();
    const container = document.getElementById('achievements-container');
    if (!container) return { ok: false, reason: 'missing_achievements_container' };
    const rect = container.getBoundingClientRect();
    return {
      ok:
        rect.left >= 8 &&
        rect.right <= window.innerWidth - 8 &&
        rect.bottom <= window.innerHeight - 8 &&
        document.documentElement.scrollWidth <= window.innerWidth + 2,
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    };
  });
  add('achievements screen uses the shared shell and keeps content inside viewport', !!achievementsProbe?.ok, JSON.stringify(achievementsProbe || null));
  await captureScreenshot(page, '08-achievements.png');

  await boot(page);
  const inheritanceProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showLegacyScreen !== 'function') return { ok: false, reason: 'no_legacy_api' };
    game.showLegacyScreen();
    const container = document.querySelector('.inheritance-container');
    if (!container) return { ok: false, reason: 'missing_inheritance_container' };
    const rect = container.getBoundingClientRect();
    return {
      ok:
        rect.left >= 8 &&
        rect.right <= window.innerWidth - 8 &&
        rect.bottom <= window.innerHeight - 8 &&
        document.documentElement.scrollWidth <= window.innerWidth + 2,
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    };
  });
  add('inheritance screen uses the shared shell and keeps upgrade cards readable', !!inheritanceProbe?.ok, JSON.stringify(inheritanceProbe || null));
  await captureScreenshot(page, '09-inheritance.png');

  await boot(page);
  const shopProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showShop !== 'function') return { ok: false, reason: 'no_shop_api' };
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.showShop({ id: 'audit_shop', type: 'shop' });
    const container = document.querySelector('.shop-container');
    const sections = document.querySelectorAll('.shop-section');
    if (!container || sections.length < 2) return { ok: false, reason: 'missing_shop_nodes' };
    const rect = container.getBoundingClientRect();
    return {
      ok:
        rect.left >= 8 &&
        rect.right <= window.innerWidth - 8 &&
        rect.bottom <= window.innerHeight - 8 &&
        document.documentElement.scrollWidth <= window.innerWidth + 2,
      sectionCount: sections.length,
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    };
  });
  add('shop screen uses the shared shell and keeps sections stacked cleanly', !!shopProbe?.ok, JSON.stringify(shopProbe || null));
  await captureScreenshot(page, '10-shop-screen.png');

  await boot(page);
  const pvpProbe = await page.evaluate(() => {
    if (!window.game || typeof window.PVPScene === 'undefined') return { ok: false, reason: 'no_pvp_api' };
    game.showScreen('pvp-screen');
    if (typeof PVPScene.onShow === 'function') PVPScene.onShow();
    const layout = document.querySelector('#pvp-screen .pvp-layout-split');
    if (!layout) return { ok: false, reason: 'missing_pvp_layout' };
    const rect = layout.getBoundingClientRect();
    return {
      ok:
        rect.left >= 8 &&
        rect.right <= window.innerWidth - 8 &&
        rect.bottom <= window.innerHeight - 8 &&
        document.documentElement.scrollWidth <= window.innerWidth + 2,
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    };
  });
  add('pvp screen keeps sidebar and content inside the shared shell', !!pvpProbe?.ok, JSON.stringify(pvpProbe || null));
  await captureScreenshot(page, '11-pvp-screen.png');

  await boot(page);
  const battleProbe = await page.evaluate(() => {
    if (!window.game || typeof game.startDebugBattle !== 'function') return { ok: false, reason: 'no_battle_api' };
    game.startDebugBattle(1, 'boss');
    if (game.battle && typeof game.battle.updateBattleUI === 'function') game.battle.updateBattleUI();
    const command = document.getElementById('battle-command-panel');
    const boss = document.getElementById('boss-act-panel');
    if (!command || !boss) return { ok: false, reason: 'missing_battle_nodes' };
    const commandRect = command.getBoundingClientRect();
    const bossRect = boss.getBoundingClientRect();
    return {
      ok:
        commandRect.left >= 0 &&
        commandRect.right <= window.innerWidth &&
        bossRect.left >= 0 &&
        bossRect.right <= window.innerWidth &&
        document.documentElement.scrollWidth <= window.innerWidth + 2,
      commandRect: {
        left: Math.round(commandRect.left),
        top: Math.round(commandRect.top),
        right: Math.round(commandRect.right),
        bottom: Math.round(commandRect.bottom),
        width: Math.round(commandRect.width),
        height: Math.round(commandRect.height),
      },
      bossRect: {
        left: Math.round(bossRect.left),
        top: Math.round(bossRect.top),
        right: Math.round(bossRect.right),
        bottom: Math.round(bossRect.bottom),
        width: Math.round(bossRect.width),
        height: Math.round(bossRect.height),
      }
    };
  });
  add('battle screen keeps shared HUD panels inside the viewport', !!battleProbe?.ok, JSON.stringify(battleProbe || null));
  await captureScreenshot(page, '12-battle-screen.png');

  const report = {
    url,
    findings,
    consoleErrors,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (findings.some((finding) => !finding.pass) || consoleErrors.length > 0) {
    process.exitCode = 1;
  }

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
