import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/web-ui-gallery-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];
let browser = null;

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
  await page.waitForSelector('.character-card .char-avatar-img');
  const portraitResponses = await page.evaluate(async () => {
    const sources = [...new Set(Array.from(document.querySelectorAll('.character-card .char-avatar-img'))
      .map((image) => image.currentSrc || image.src)
      .filter(Boolean))];
    return Promise.all(sources.map(async (source) => {
      const response = await fetch(source, { method: 'HEAD', cache: 'no-store' });
      return {
        source,
        ok: response.ok,
        contentType: response.headers.get('content-type') || '',
      };
    }));
  });
  const invalidPortraitResponses = portraitResponses.filter((response) =>
    !response.ok || !response.contentType.toLowerCase().startsWith('image/')
  );
  if (invalidPortraitResponses.length > 0) {
    throw new Error(`Character portrait response mismatch: ${JSON.stringify(invalidPortraitResponses)}`);
  }
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
  const footer = document.querySelector('#character-selection-screen .character-selection-footer');
  const footerRect = footer?.getBoundingClientRect() || null;
  const footerClearanceOk = !footerRect || footerRect.top >= rect.bottom - 2;
  return {
    ok:
      rect.left >= 8 &&
      rect.right <= window.innerWidth - 8 &&
      rect.bottom <= window.innerHeight - 8 &&
      document.documentElement.scrollWidth <= window.innerWidth + 2 &&
      portraitsOk &&
      footerClearanceOk,
    cardCount: cards.length,
    portraitProbes,
    footerClearanceOk,
    rect: {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    footerRect: footerRect ? {
      left: Math.round(footerRect.left),
      top: Math.round(footerRect.top),
      right: Math.round(footerRect.right),
      bottom: Math.round(footerRect.bottom),
      width: Math.round(footerRect.width),
      height: Math.round(footerRect.height),
    } : null,
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
  const hero = document.querySelector('#main-menu .frontend-upgrade-hero');
  const logo = document.querySelector('#main-menu .logo-img');
  const heroRect = rectObj(hero);
  const logoRect = rectObj(logo);
  const visualAssetProbe = {
    hero: {
      complete: !!hero?.complete,
      naturalWidth: hero?.naturalWidth || 0,
      naturalHeight: hero?.naturalHeight || 0,
      src: hero?.currentSrc || hero?.src || '',
      rect: heroRect,
      alt: hero?.getAttribute('alt') || '',
      ariaHidden: hero?.getAttribute('aria-hidden') || '',
      ok:
        !!hero &&
        hero.complete &&
        hero.naturalWidth >= 1200 &&
        hero.naturalHeight >= 700 &&
        !!heroRect &&
        heroRect.width >= rect.width - 4 &&
        heroRect.height >= rect.height - 4 &&
        hero.getAttribute('aria-hidden') === 'true',
    },
    logo: {
      complete: !!logo?.complete,
      naturalWidth: logo?.naturalWidth || 0,
      naturalHeight: logo?.naturalHeight || 0,
      src: logo?.currentSrc || logo?.src || '',
      rect: logoRect,
      alt: logo?.getAttribute('alt') || '',
      ok:
        !!logo &&
        logo.complete &&
        logo.naturalWidth >= 256 &&
        logo.naturalHeight >= 256 &&
        !!logoRect &&
        logoRect.width >= 64 &&
        logoRect.height >= 64 &&
        (logo.getAttribute('alt') || '').trim().length > 0,
    },
  };
  const visualAssetsOk = visualAssetProbe.hero.ok && visualAssetProbe.logo.ok;
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
      visualAssetsOk &&
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
    visualAssetProbe,
    utilityProbes,
    oracleRect,
  };
}

function collectDesignSystemProbe(options = {}) {
  const rootStyle = getComputedStyle(document.documentElement);
  const fdTokenChecks = [
    '--fd-space-1',
    '--fd-space-2',
    '--fd-space-3',
    '--fd-space-4',
    '--fd-radius-panel',
    '--fd-radius-control',
    '--fd-hit-target',
    '--fd-surface-panel',
    '--fd-surface-panel-strong',
    '--fd-border-muted',
    '--fd-border-strong',
    '--fd-text-muted',
    '--fd-accent-gold',
    '--fd-accent-blue',
    '--fd-mobile-edge',
    '--fd-safe-bottom',
    '--fd-mobile-action-gap',
    '--fd-sticky-action-offset',
  ].map((token) => ({
    token,
    value: rootStyle.getPropertyValue(token).trim(),
    ok: rootStyle.getPropertyValue(token).trim().length > 0,
  }));

  const sample = document.createElement('div');
  sample.style.cssText = 'position:fixed;left:-9999px;top:-9999px;display:grid;gap:8px;';
  sample.innerHTML = `
    <section class="fd-surface"><div class="fd-panel">panel</div></section>
    <button class="fd-button fd-button-primary">primary</button>
    <button class="fd-tab">tab</button>
    <span class="fd-chip">chip</span>
    <div class="fd-action-bar"><button class="fd-control">control</button></div>
    <div class="fd-scroll-area" style="width:120px;height:40px;"><div style="height:120px;">scroll</div></div>
    <div class="fd-safe-scroll" style="width:120px;height:40px;overflow:auto;"><div style="height:160px;">safe scroll</div></div>
    <div class="fd-safe-action-bar"><button class="fd-control">safe</button></div>
    <div class="fd-touch-grid"><button>touch</button><button>tap</button></div>
    <div class="fd-mobile-stack"><span>stack</span></div>
  `;
  document.body.appendChild(sample);
  const primitiveTargets = [
    ['surface', sample.querySelector('.fd-surface')],
    ['panel', sample.querySelector('.fd-panel')],
    ['button', sample.querySelector('.fd-button')],
    ['tab', sample.querySelector('.fd-tab')],
    ['chip', sample.querySelector('.fd-chip')],
    ['control', sample.querySelector('.fd-control')],
    ['scroll', sample.querySelector('.fd-scroll-area')],
    ['actionBar', sample.querySelector('.fd-action-bar')],
    ['safeScroll', sample.querySelector('.fd-safe-scroll')],
    ['safeActionBar', sample.querySelector('.fd-safe-action-bar')],
    ['touchGrid', sample.querySelector('.fd-touch-grid')],
    ['touchButton', sample.querySelector('.fd-touch-grid button')],
    ['mobileStack', sample.querySelector('.fd-mobile-stack')],
  ];
  const fdPrimitiveChecks = primitiveTargets.map(([name, node]) => {
    const style = node ? getComputedStyle(node) : null;
    const rect = node?.getBoundingClientRect() || null;
    const roundedPrimitive = ['surface', 'panel', 'button', 'tab', 'chip', 'control'].includes(name);
    const minTouchSize = Math.max(parseFloat(style?.minHeight || '0'), rect?.height || 0);
    return {
      name,
      ok:
        !!style &&
        (!roundedPrimitive || name === 'chip' || parseFloat(style.borderRadius) >= 10) &&
        (name !== 'button' || parseFloat(style.minHeight) >= 44) &&
        (name !== 'scroll' || style.overflowY === 'auto') &&
        (name !== 'actionBar' || style.display === 'flex') &&
        (name !== 'safeScroll' || (style.overflowY === 'auto' && parseFloat(style.scrollPaddingBottom || '0') >= 44)) &&
        (name !== 'safeActionBar' || (style.display === 'flex' && parseFloat(style.paddingBottom || '0') >= 12)) &&
        (name !== 'touchGrid' || style.display === 'grid') &&
        (name !== 'touchButton' || minTouchSize >= 44) &&
        (name !== 'mobileStack' || style.display === 'grid'),
      borderRadius: style?.borderRadius || '',
      minHeight: style?.minHeight || '',
      display: style?.display || '',
      overflowY: style?.overflowY || '',
      paddingBottom: style?.paddingBottom || '',
      scrollPaddingBottom: style?.scrollPaddingBottom || '',
      rectHeight: rect?.height || 0,
    };
  });
  const fdMobileInteractionChecks = fdPrimitiveChecks.filter((check) =>
    ['safeScroll', 'safeActionBar', 'touchGrid', 'touchButton'].includes(check.name)
  );
  sample.remove();

  const defaultSurfaceTargets = [
    ['characterSelection', '.character-selection-container', 'surface'],
    ['mapScreen', '#map-screen .map-screen-v3', 'surface'],
    ['rewardShell', '.reward-shell', 'surface'],
    ['pvpLiveStatus', '#pvp-screen .pvp-live-status-card', 'surface'],
    ['pvpLiveSeat', '#pvp-screen .pvp-live-seat-panel', 'surface'],
    ['collectionTab', '.collection-tab-btn', 'control'],
  ];
  const surfaceTargets = Array.isArray(options.surfaceTargets) && options.surfaceTargets.length
    ? options.surfaceTargets
    : defaultSurfaceTargets;
  const activeScreenId = options.activeScreenId || '';
  const requireViewportFit = options.requireViewportFit !== false;
  const rectObj = (rect) => rect ? {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  } : null;
  const fdSurfaceChecks = surfaceTargets.map((target) => {
    const [name, selector, kind = 'surface', targetOptions = {}] = Array.isArray(target)
      ? target
      : [target.name, target.selector, target.kind || 'surface', target.options || {}];
    const optionalWhenHidden = targetOptions.optionalWhenHidden === true;
    const node = document.querySelector(selector);
    const style = node ? getComputedStyle(node) : null;
    const screen = node?.closest('.screen') || null;
    const rect = node?.getBoundingClientRect() || null;
    const activeOk = !activeScreenId || (screen?.id === activeScreenId && screen.classList.contains('active'));
    const visibleOk =
      !!style &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0;
    const viewportOk =
      !requireViewportFit ||
      (rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.width <= window.innerWidth + 1);
    const surfaceOk =
      kind === 'control'
        ? parseFloat(style?.minHeight || '0') >= 44 && parseFloat(style?.borderRadius || '0') >= 10
        : kind === 'chip'
            ? parseFloat(style?.borderRadius || '0') >= 20
            : kind === 'compactChip'
              ? parseFloat(style?.borderRadius || '0') >= 4 && style?.borderTopWidth !== '0px'
            : kind === 'actionBar'
              ? ['flex', 'grid'].includes(style?.display || '') && parseFloat(style?.columnGap || style?.gap || '0') >= 8
              : kind === 'compactSurface'
                ? parseFloat(style?.borderRadius || '0') >= 8 && style?.borderTopWidth !== '0px'
                : parseFloat(style?.borderRadius || '0') >= 16 && style?.borderTopWidth !== '0px';
    return {
      name,
      selector,
      kind,
      ok:
        !!style &&
        activeOk &&
        (visibleOk || optionalWhenHidden) &&
        viewportOk &&
        surfaceOk,
      activeScreenId: screen?.id || '',
      activeOk,
      visibleOk,
      optionalWhenHidden,
      viewportOk,
      borderRadius: style?.borderRadius || '',
      borderTopWidth: style?.borderTopWidth || '',
      minHeight: style?.minHeight || '',
      display: style?.display || '',
      columnGap: style?.columnGap || '',
      rect: rectObj(rect),
    };
  });

  return {
    ok:
      fdTokenChecks.every((check) => check.ok) &&
      fdPrimitiveChecks.every((check) => check.ok) &&
      fdMobileInteractionChecks.every((check) => check.ok) &&
      fdSurfaceChecks.every((check) => check.ok),
    fdTokenChecks,
    fdPrimitiveChecks,
    fdMobileInteractionChecks,
    fdSurfaceChecks,
  };
}

function collectCoreLoopDesignSystemProbe(options = {}) {
  const activeScreenId = options.activeScreenId || '';
  const requireViewportFit = options.requireViewportFit !== false;
  const rectObj = (rect) => rect ? {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  } : null;
  const isVisible = (style, rect) =>
    !!style &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    rect.width > 0 &&
    rect.height > 0;
  const activeOkFor = (node) => {
    const screen = node?.closest('.screen') || null;
    return !activeScreenId || (screen?.id === activeScreenId && screen.classList.contains('active'));
  };
  const viewportOkFor = (rect) =>
    !requireViewportFit ||
    (rect.left >= -2 && rect.right <= window.innerWidth + 2 && rect.width <= window.innerWidth + 2);
  const surfaceTargets = options.surfaceTargets || [];
  const hitTargets = options.hitTargets || [];

  const expandVisibleTargets = ([name, selector, kind = 'surface']) => {
    const nodes = Array.from(document.querySelectorAll(selector));
    if (!nodes.length) return [{ name, selector, kind, node: null, index: -1, reason: 'missing' }];
    const visibleNodes = nodes.filter((node) => {
      const rect = node.getBoundingClientRect();
      return isVisible(getComputedStyle(node), rect);
    });
    if (!visibleNodes.length) return [{ name, selector, kind, node: nodes[0], index: 0, reason: 'not_visible' }];
    return visibleNodes.map((node, index) => ({ name, selector, kind, node, index }));
  };

  const coreLoopSurfaceChecks = surfaceTargets.flatMap(expandVisibleTargets).map(({ name, selector, kind, node, index, reason }) => {
    const style = node ? getComputedStyle(node) : null;
    const rect = node?.getBoundingClientRect() || null;
    const visibleOk = isVisible(style, rect || {});
    const activeOk = activeOkFor(node);
    const viewportOk = rect ? viewportOkFor(rect) : false;
    const radius = parseFloat(style?.borderRadius || '0');
    const borderOk = style?.borderTopWidth !== '0px' || kind === 'card';
    const radiusOk = kind === 'card' || kind === 'compactSurface' ? radius >= 8 : radius >= 12;
    return {
      name,
      selector,
      kind,
      index,
      reason: reason || '',
      ok: !!node && activeOk && visibleOk && viewportOk && borderOk && radiusOk,
      activeScreenId: node?.closest('.screen')?.id || '',
      activeOk,
      visibleOk,
      viewportOk,
      borderTopWidth: style?.borderTopWidth || '',
      borderRadius: style?.borderRadius || '',
      backgroundImage: style?.backgroundImage || '',
      rect: rectObj(rect),
    };
  });

  const coreLoopHitTargetChecks = hitTargets.flatMap(expandVisibleTargets).map(({ name, selector, node, index, reason }) => {
    if (node && options.scrollHitTargetsIntoView) {
      node.scrollIntoView({ block: 'center', inline: 'center' });
    }
    const style = node ? getComputedStyle(node) : null;
    const rect = node?.getBoundingClientRect() || null;
    const visibleOk = isVisible(style, rect || {});
    const activeOk = activeOkFor(node);
    const viewportOk = rect ? viewportOkFor(rect) : false;
    const parsedMinHeight = parseFloat(style?.minHeight || '0');
    const minHeight = Number.isFinite(parsedMinHeight) ? parsedMinHeight : 0;
    const heightOk = Math.max(minHeight, rect?.height || 0) >= 44;
    const widthOk = (rect?.width || 0) >= 44;
    const point = rect ? {
      x: Math.round(rect.left + Math.min(rect.width - 1, Math.max(1, rect.width / 2))),
      y: Math.round(rect.top + Math.min(rect.height - 1, Math.max(1, rect.height / 2))),
    } : null;
    const hit =
      point &&
      point.x >= 0 &&
      point.y >= 0 &&
      point.x <= window.innerWidth &&
      point.y <= window.innerHeight
        ? document.elementFromPoint(point.x, point.y)
        : null;
    const hitOk = !!hit && (hit === node || node.contains(hit) || hit.contains(node));
    return {
      name,
      selector,
      index,
      reason: reason || '',
      ok: !!node && activeOk && visibleOk && viewportOk && heightOk && widthOk && hitOk,
      activeScreenId: node?.closest('.screen')?.id || '',
      activeOk,
      visibleOk,
      viewportOk,
      heightOk,
      widthOk,
      hitOk,
      hitTag: hit?.tagName || '',
      hitClass: hit?.className || '',
      minHeight: style?.minHeight || '',
      borderRadius: style?.borderRadius || '',
      rect: rectObj(rect),
    };
  });

  return {
    ok:
      coreLoopSurfaceChecks.length > 0 &&
      coreLoopHitTargetChecks.length > 0 &&
      coreLoopSurfaceChecks.every((check) => check.ok) &&
      coreLoopHitTargetChecks.every((check) => check.ok),
    coreLoopSurfaceChecks,
    coreLoopHitTargetChecks,
  };
}

(async () => {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
  browser = await chromium.launch({
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
  const challengeProbe = await page.evaluate(async () => {
    if (!window.game || typeof game.showChallengeHub !== 'function') return { ok: false, reason: 'no_challenge_api' };
    await game.showChallengeHub('weekly');
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
  const mobileCollectionProbe = await page.evaluate(async () => {
    if (!window.game || typeof game.showCollection !== 'function') return { ok: false, reason: 'no_collection_api' };
    game.showCollection('laws');
    const tabs = Array.from(document.querySelectorAll('#collection [data-collection-tab]'));
    const targetTab = tabs[tabs.length - 1] || null;
    const shell = document.querySelector('.codex-shell');
    const tabRail = tabs[0]?.parentElement || null;
    if (!shell || !targetTab || !tabRail) {
      return { ok: false, reason: 'missing_mobile_collection_nodes' };
    }
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
    const tabProbes = [];
    for (const tab of tabs) {
      tab.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const tabRect = rectObj(tab);
      const point = tabRect ? {
        x: Math.round(tabRect.left + tabRect.width / 2),
        y: Math.round(tabRect.top + tabRect.height / 2),
      } : null;
      const hit = point && point.x >= 0 && point.y >= 0 && point.x <= window.innerWidth && point.y <= window.innerHeight
        ? document.elementFromPoint(point.x, point.y)
        : null;
      const activeTab = document.querySelector('#collection [data-collection-tab].active');
      const activePanel = document.querySelector('#collection [data-collection-panel].active');
      tabProbes.push({
        section: tab.dataset.collectionTab || '',
        text: (tab.textContent || '').replace(/\s+/g, ' ').trim(),
        rect: tabRect,
        hit: selectorFor(hit),
        hitOk: !!hit && (hit === tab || tab.contains(hit) || hit.contains(tab)),
        textFits: tab.scrollWidth <= tab.clientWidth + 2,
        activeTab: activeTab?.dataset.collectionTab || '',
        activePanel: activePanel?.dataset.collectionPanel || '',
        railScrollLeft: Math.round(tabRail.scrollLeft),
      });
    }
    const activeTab = document.querySelector('#collection [data-collection-tab].active');
    const activePanel = document.querySelector('#collection [data-collection-panel].active');
    if (!activeTab || !activePanel) {
      return { ok: false, reason: 'missing_mobile_collection_active_state', tabProbes };
    }
    const rect = shell.getBoundingClientRect();
    const panelRect = activePanel.getBoundingClientRect();
    const railRect = tabRail.getBoundingClientRect();
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
        tabProbes.every((probe) => probe.hitOk
          && probe.textFits
          && probe.rect?.height >= 44
          && probe.activeTab === probe.section
          && probe.activePanel === probe.section) &&
        tabRail.scrollLeft > 0,
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
      railScrollLeft: Math.round(tabRail.scrollLeft),
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
    const container = document.querySelector('#reward-screen .reward-container');
    const shell = document.querySelector('.reward-shell');
    if (!container || !shell) return { ok: false, reason: 'missing_reward_shell' };
    const containerRect = container.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    const containerStyle = getComputedStyle(container);
    const shellStyle = getComputedStyle(shell);
    const containerOwnsScroll = ['auto', 'scroll'].includes(containerStyle.overflowY);
    const shellAvoidsNestedScroll = !['auto', 'scroll'].includes(shellStyle.overflowY);
    return {
      ok:
        containerRect.left >= 0 &&
        containerRect.right <= window.innerWidth + 2 &&
        containerRect.bottom <= window.innerHeight + 2 &&
        shellRect.left >= 8 &&
        shellRect.right <= window.innerWidth - 8 &&
        containerOwnsScroll &&
        shellAvoidsNestedScroll &&
        document.documentElement.scrollWidth <= window.innerWidth + 2,
      containerOwnsScroll,
      shellAvoidsNestedScroll,
      containerOverflowY: containerStyle.overflowY,
      shellOverflowY: shellStyle.overflowY,
      containerScrollHeight: Math.round(container.scrollHeight),
      containerClientHeight: Math.round(container.clientHeight),
      shellScrollHeight: Math.round(shell.scrollHeight),
      shellClientHeight: Math.round(shell.clientHeight),
      rect: {
        left: Math.round(shellRect.left),
        top: Math.round(shellRect.top),
        right: Math.round(shellRect.right),
        bottom: Math.round(shellRect.bottom),
        width: Math.round(shellRect.width),
        height: Math.round(shellRect.height),
      },
      containerRect: {
        left: Math.round(containerRect.left),
        top: Math.round(containerRect.top),
        right: Math.round(containerRect.right),
        bottom: Math.round(containerRect.bottom),
        width: Math.round(containerRect.width),
        height: Math.round(containerRect.height),
      },
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
  const pvpProbe = await page.evaluate(async () => {
    if (!window.game || typeof game.showPvpScreen !== 'function') return { ok: false, reason: 'no_pvp_api' };
    const scene = await game.showPvpScreen();
    if (!scene) return { ok: false, reason: 'pvp_load_failed' };
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
  await page.waitForTimeout(250);
  await captureScreenshot(page, '11-pvp-screen.png');

  await boot(page);
  const battleProbe = await page.evaluate(() => {
    if (!window.game || typeof game.startDebugBattle !== 'function') return { ok: false, reason: 'no_battle_api' };
    game.startDebugBattle(1, 'boss');
    if (game.battle && typeof game.battle.updateBattleUI === 'function') game.battle.updateBattleUI();
    const command = document.getElementById('battle-command-panel');
    const boss = document.getElementById('boss-act-panel');
    const hand = document.getElementById('hand-cards');
    const endTurn = document.getElementById('end-turn-btn');
    const advisor = command?.querySelector('.battle-tactical-advisor') || null;
    const advisorToggle = command?.querySelector('.battle-advisor-toggle') || null;
    const spiritButton = command?.querySelector('.battle-advisor-spirit-btn') || null;
    if (!command || !boss || !hand || !endTurn || !advisorToggle) return { ok: false, reason: 'missing_battle_nodes' };
    const rectObj = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
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
    const commandRect = command.getBoundingClientRect();
    const bossRect = boss.getBoundingClientRect();
    const handRect = hand.getBoundingClientRect();
    const endTurnRect = endTurn.getBoundingClientRect();
    const advisorRectBefore = advisor?.getBoundingClientRect() || null;
    const handCardRects = Array.from(hand.querySelectorAll('.card')).slice(0, 5).map(rectObj);
    const advisorCollapsedInitially = !!advisor && advisor.classList.contains('collapsed');
    if (typeof advisorToggle.click === 'function') advisorToggle.click();
    const advisorAfterToggle = command.querySelector('.battle-tactical-advisor');
    const advisorRectAfter = advisorAfterToggle?.getBoundingClientRect() || null;
    const advisorCollapsedAfterToggle = !!advisorAfterToggle && advisorAfterToggle.classList.contains('collapsed');
    const advisorStateChanged = !!advisor && !!advisorAfterToggle && advisorCollapsedAfterToggle !== advisorCollapsedInitially;
    if (typeof advisorToggle.click === 'function') advisorToggle.click();
    const spiritRect = spiritButton ? spiritButton.getBoundingClientRect() : null;
    const commandObj = rectObj(command);
    const bossObj = rectObj(boss);
    const handObj = rectObj(hand);
    const endTurnObj = rectObj(endTurn);
    const advisorBeforeObj = rectObj(advisor);
    const advisorAfterObj = rectObj(advisorAfterToggle);
    const spiritObj = rectObj(spiritButton);
    const handCardsOk = handCardRects.length >= 2 && handCardRects.every((rect) =>
      rect &&
      rect.width >= 96 &&
      rect.height >= 130 &&
      rect.left >= -2 &&
      rect.right <= window.innerWidth + 2 &&
      rect.bottom <= window.innerHeight + 2
    );
    const laneSeparationOk =
      !overlaps(commandObj, bossObj, 8) &&
      !overlaps(commandObj, handObj, 8) &&
      !overlaps(bossObj, handObj, 8) &&
      !overlaps(endTurnObj, handObj, 6) &&
      (!spiritObj || (!overlaps(spiritObj, handObj, 6) && !overlaps(spiritObj, endTurnObj, 6)));
    return {
      ok:
        commandRect.left >= 0 &&
        commandRect.right <= window.innerWidth &&
        bossRect.left >= 0 &&
        bossRect.right <= window.innerWidth &&
        document.documentElement.scrollWidth <= window.innerWidth + 2 &&
        handCardsOk &&
        laneSeparationOk &&
        advisorStateChanged &&
        advisorRectBefore &&
        advisorRectAfter &&
        advisorRectBefore.width <= commandRect.width + 2 &&
        advisorRectAfter.width <= commandRect.width + 2,
      commandRect: commandObj,
      bossRect: bossObj,
      handRect: handObj,
      endTurnRect: endTurnObj,
      advisorBeforeRect: advisorBeforeObj,
      advisorAfterRect: advisorAfterObj,
      spiritRect: spiritObj,
      handCardRects,
      handCardsOk,
      laneSeparationOk,
      advisorCollapsedInitially,
      advisorCollapsedAfterToggle,
      advisorStateChanged,
    };
  });
  add('battle screen keeps shared HUD panels inside the viewport', !!battleProbe?.ok, JSON.stringify(battleProbe || null));
  const battleCoreLoopProbe = await page.evaluate(collectCoreLoopDesignSystemProbe, {
    activeScreenId: 'battle-screen',
    surfaceTargets: [
      ['battleCommandPanel', '#battle-screen #battle-command-panel', 'compactSurface'],
      ['bossActPanel', '#battle-screen #boss-act-panel', 'compactSurface'],
      ['handCard', '#battle-screen #hand-cards .card', 'card'],
    ],
    hitTargets: [
      ['battleCommandButton', '#battle-screen .battle-command-btn'],
      ['battleAdvisorToggle', '#battle-screen .battle-advisor-toggle'],
      ['endTurnButton', '#battle-screen #end-turn-btn'],
      ['handCard', '#battle-screen #hand-cards .card'],
    ],
  });
  add(
    'core play-loop design system primitives are visible on battle HUD',
    !!battleCoreLoopProbe?.ok,
    JSON.stringify(battleCoreLoopProbe || null)
  );
  await captureScreenshot(page, '12-battle-screen.png');

  await showCharacterSelectionWithLoadedPortraits(page);
  const characterDesignSystemProbe = await page.evaluate(collectDesignSystemProbe, {
    activeScreenId: 'character-selection-screen',
    surfaceTargets: [
      ['characterSelection', '#character-selection-screen .character-selection-container', 'surface'],
    ],
  });
  add(
    'design system primitives are loaded and adopted on the visible character selection shell',
    !!characterDesignSystemProbe?.ok,
    JSON.stringify(characterDesignSystemProbe || null)
  );
  add(
    'mobile interaction primitives keep safe action bars and touch grids measurable',
    !!characterDesignSystemProbe?.fdMobileInteractionChecks?.every((check) => check.ok),
    JSON.stringify(characterDesignSystemProbe?.fdMobileInteractionChecks || null)
  );

  await boot(page);
  await page.evaluate(() => {
    if (!window.game) return;
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.startRealm(1, false);
    game.showScreen('map-screen');
  });
  const mapDesignSystemProbe = await page.evaluate(collectDesignSystemProbe, {
    activeScreenId: 'map-screen',
    surfaceTargets: [
      ['mapScreen', '#map-screen .map-screen-v3', 'surface'],
      ['mapAction', '#map-screen [data-map-action]', 'control'],
    ],
  });
  add(
    'design system primitives are loaded and adopted on the visible map controls',
    !!mapDesignSystemProbe?.ok,
    JSON.stringify(mapDesignSystemProbe || null)
  );
  await page.evaluate(() => {
    const shell = document.querySelector('#map-screen .map-screen-v3');
    const intelToggle = document.querySelector('#map-screen [data-map-action="toggle-map-intel"]');
    const toolsToggle = document.querySelector('#map-screen [data-map-action="toggle-map-tools"]');
    if (shell?.classList.contains('show-map-tools') && typeof toolsToggle?.click === 'function') toolsToggle.click();
    if (shell && !shell.classList.contains('show-map-intel') && typeof intelToggle?.click === 'function') intelToggle.click();
  });
  const mapIntelCoreLoopProbe = await page.evaluate(collectCoreLoopDesignSystemProbe, {
    activeScreenId: 'map-screen',
    scrollHitTargetsIntoView: true,
    surfaceTargets: [
      ['mapDetailPanels', '#map-screen .map-detail-panels', 'surface'],
      ['mapNode', '#map-screen .map-node-v3', 'card'],
      ['expeditionPanelCard', '#map-screen .expedition-panel-card', 'surface'],
    ],
    hitTargets: [
      ['mapNode', '#map-screen .map-node-v3'],
      ['mapHeaderAction', '#map-screen .map-v3-header [data-map-action]'],
    ],
  });
  await page.evaluate(() => {
    const shell = document.querySelector('#map-screen .map-screen-v3');
    const toolsToggle = document.querySelector('#map-screen [data-map-action="toggle-map-tools"]');
    if (shell && !shell.classList.contains('show-map-tools') && typeof toolsToggle?.click === 'function') toolsToggle.click();
  });
  const mapToolsCoreLoopProbe = await page.evaluate(collectCoreLoopDesignSystemProbe, {
    activeScreenId: 'map-screen',
    scrollHitTargetsIntoView: true,
    surfaceTargets: [
      ['mapFooter', '#map-screen .map-footer', 'surface'],
      ['mapNode', '#map-screen .map-node-v3', 'card'],
    ],
    hitTargets: [
      ['mapNode', '#map-screen .map-node-v3'],
      ['mapHeaderAction', '#map-screen [data-map-action]'],
      ['mapFooterAction', '#map-screen .map-footer [data-map-action]'],
    ],
  });
  add(
    'core play-loop design system primitives are visible on map route controls',
    !!mapIntelCoreLoopProbe?.ok && !!mapToolsCoreLoopProbe?.ok,
    JSON.stringify({ intel: mapIntelCoreLoopProbe || null, tools: mapToolsCoreLoopProbe || null })
  );

  await boot(page);
  await page.evaluate(() => {
    if (!window.game) return;
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.startRealm(1, false);
    const lawId = typeof LAWS !== 'undefined' ? Object.keys(LAWS)[0] : null;
    if (game.player) game.player.getStealBonus = () => 0;
    game.currentBattleNode = { type: 'elite', id: 990102, completed: false };
    game.showRewardScreen(120, true, { stealLaw: lawId, stealChance: 1 }, 20, { insight: 5 });
  });
  const rewardDesignSystemProbe = await page.evaluate(collectDesignSystemProbe, {
    activeScreenId: 'reward-screen',
    surfaceTargets: [
      ['rewardShell', '#reward-screen .reward-shell', 'surface'],
      ['rewardAction', '#reward-screen .reward-actions button', 'control'],
      ['rewardEyebrow', '#reward-screen .reward-section-eyebrow', 'chip'],
    ],
  });
  add(
    'design system primitives are loaded and adopted on the visible reward controls',
    !!rewardDesignSystemProbe?.ok,
    JSON.stringify(rewardDesignSystemProbe || null)
  );
  await boot(page);
  await page.evaluate(() => {
    if (!window.game || typeof game.finalizeExpeditionChapter !== 'function') return;
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.startRealm(1, false);
    let state = typeof game.getExpeditionState === 'function' ? game.getExpeditionState() : null;
    if (!state && typeof game.initializeExpeditionForRealm === 'function') {
      game.initializeExpeditionForRealm(game.player?.realm || 1, true);
      state = typeof game.getExpeditionState === 'function' ? game.getExpeditionState() : null;
    }
    const nodeType = state?.activeNemesis?.triggerNodeTypes?.[0];
    if (nodeType && typeof game.applyExpeditionBattleModifiers === 'function' && typeof game.recordExpeditionBattleVictory === 'function') {
      const enemies = game.applyExpeditionBattleModifiers([
        { id: 'ui_gallery_core_loop_enemy', name: '校验敌影', hp: 80, maxHp: 80, patterns: [{ type: 'attack', value: 12, intent: '压测' }] }
      ], { type: nodeType });
      game.recordExpeditionBattleVictory({ type: nodeType }, enemies);
    }
    const slate = game.finalizeExpeditionChapter('realm_clear');
    if (!slate) return;
    game.lastRunPathRewardMeta = null;
    game.showRewardScreen(180, false, null, 36, null);
  });
  const rewardCoreLoopProbe = await page.evaluate(collectCoreLoopDesignSystemProbe, {
    activeScreenId: 'reward-screen',
    scrollHitTargetsIntoView: true,
    surfaceTargets: [
      ['rewardPanel', '#reward-screen .reward-panel', 'surface'],
      ['rewardExpeditionMeta', '#reward-screen .reward-expedition-meta', 'surface'],
    ],
    hitTargets: [
      ['rewardAction', '#reward-screen .reward-actions button'],
      ['rewardHandoffAction', '#reward-screen [data-season-board-handoff-cta="true"]'],
    ],
  });
  add(
    'core play-loop design system primitives are visible on reward handoff controls',
    !!rewardCoreLoopProbe?.ok,
    JSON.stringify(rewardCoreLoopProbe || null)
  );

  await boot(page);
  await page.evaluate(async () => {
    if (!window.game || typeof game.showPvpScreen !== 'function') return;
    await game.showPvpScreen();
  });
  const pvpDesignSystemProbe = await page.evaluate(collectDesignSystemProbe, {
    activeScreenId: 'pvp-screen',
    surfaceTargets: [
      ['pvpLiveStatus', '#pvp-screen .pvp-live-status-card', 'compactSurface'],
      ['pvpLiveSeat', '#pvp-screen .pvp-live-seat-panel', 'compactSurface', { optionalWhenHidden: true }],
      ['pvpLiveEvent', '#pvp-screen .pvp-live-event-panel', 'compactSurface', { optionalWhenHidden: true }],
      ['pvpRuneTab', '#pvp-screen .rune-tab', 'control'],
      ['pvpLiveActionBar', '#pvp-screen .pvp-live-action-bar', 'actionBar'],
      ['pvpLiveAction', '#pvp-screen .pvp-live-action-bar .challenge-btn[data-live-action="join-queue"]', 'control'],
      ['pvpModeBoundary', '#pvp-screen .pvp-live-mode-boundary', 'compactChip'],
      ['pvpActionReceipt', '#pvp-screen .pvp-live-action-receipt', 'compactChip', { optionalWhenHidden: true }],
      ['pvpSeatBadge', '#pvp-screen .pvp-live-seat-badge', 'compactChip'],
    ],
  });
  add(
    'design system primitives are loaded and adopted on the visible pvp live controls',
    !!pvpDesignSystemProbe?.ok,
    JSON.stringify(pvpDesignSystemProbe || null)
  );

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
  browser = null;
})().catch(async (error) => {
  console.error(error);
  if (browser) await browser.close().catch(() => {});
  process.exitCode = 1;
});
