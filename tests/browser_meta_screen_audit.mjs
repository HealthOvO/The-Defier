import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/web-meta-screen-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

function recordConsoleError(text) {
  const message = String(text || '');
  if (/ERR_CONNECTION_(CLOSED|RESET)/.test(message)) return;
  consoleErrors.push(message);
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

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  page.on('console', (msg) => {
    if (msg.type() === 'error') recordConsoleError(msg.text());
  });
  page.on('pageerror', (err) => {
    recordConsoleError(String(err));
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

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const rewardProbe = await page.evaluate(() => {
    if (!window.game) return { ok: false, reason: 'no_game' };
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.startRealm(1, false);
    const lawId = typeof LAWS !== 'undefined' ? Object.keys(LAWS)[0] : null;
    if (game.player) {
      game.player.getStealBonus = () => 0;
    }
    game.currentBattleNode = { type: 'elite', id: 990001, completed: false };
    game.stealAttempted = false;
    game.lastBattleRewardMeta = {
      encounter: {
        themeId: 'theme_counter_lattice',
        themeName: '轮段·反制晶格',
        tierStage: 2,
        goldBonus: 18,
        ringExpBonus: 9,
      },
      squad: {
        squadId: 'squad_hex_weave',
        squadName: '咒织链阵',
        goldBonus: 14,
        ringExpBonus: 11,
        synergyThemeName: '轮段·反制晶格',
      },
    };
    game.showRewardScreen(145, true, { stealLaw: lawId, stealChance: 1 }, 32, { insight: 8, karma: 3 });

    const screen = document.getElementById('reward-screen');
    const layout = document.querySelector('.reward-layout');
    const main = document.querySelector('.reward-main-column');
    const side = document.querySelector('.reward-side-column');
    const actions = document.querySelector('.reward-actions');
    const summary = document.querySelector('.reward-summary-card');
    const cards = Array.from(document.querySelectorAll('#reward-cards .card'));
    const skipBtn = document.querySelector('.skip-reward-btn');
    const expectedSkipCost = typeof game.getRewardSkipCost === 'function'
      ? game.getRewardSkipCost()
      : 50 * Math.max(1, Math.floor(Number(game.player?.realm) || 1));

    if (!screen || !layout || !main || !side || !actions || !summary || cards.length < 2 || !skipBtn) {
      return { ok: false, reason: 'missing_reward_nodes' };
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
    const viewportWidth = window.innerWidth;
    const mainRect = toRect(main);
    const sideRect = toRect(side);
    const summaryRect = toRect(summary);
    const actionsRect = toRect(actions);
    const cardRects = cards.map((card) => toRect(card));
    const cardsInsideMain = cardRects.every((rect) => rect.left >= mainRect.left - 4 && rect.right <= mainRect.right + 4);
    const cardsAboveActions = cardRects.every((rect) => rect.bottom < actionsRect.bottom);

    return {
      ok:
        screen.dataset.stealState === 'ready' &&
        mainRect.left < sideRect.left &&
        sideRect.width >= 320 &&
        summaryRect.bottom <= actionsRect.top + 24 &&
        cardsInsideMain &&
        cardsAboveActions &&
        mainRect.right < viewportWidth &&
        sideRect.right <= viewportWidth &&
        (skipBtn.textContent || '').includes(`扣${expectedSkipCost}灵石`),
      stealState: screen.dataset.stealState || '',
      mainRect,
      sideRect,
      summaryRect,
      actionsRect,
      cardRects,
      skipText: skipBtn.textContent || '',
      expectedSkipCost,
    };
  });
  add(
    'reward screen keeps card stage and summary rail separated on desktop',
    !!rewardProbe?.ok,
    JSON.stringify(rewardProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'reward-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  await page.evaluate(() => {
    window.__auditOriginalRandom = Math.random;
    Math.random = () => 0;
  });
  await page.click('#steal-btn', { force: true });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    if (window.__auditOriginalRandom) Math.random = window.__auditOriginalRandom;
  });
  const rewardResolveProbe = await page.evaluate(() => {
    const screen = document.getElementById('reward-screen');
    const text = document.getElementById('steal-text')?.textContent || '';
    const btn = document.getElementById('steal-btn');
    return {
      state: screen?.dataset?.stealState || '',
      disabled: !!btn?.disabled,
      text,
      ok: (screen?.dataset?.stealState === 'success') && !!btn?.disabled && /盗取成功|已经掌握/.test(text),
    };
  });
  add(
    'reward steal panel resolves into success state with localized feedback',
    !!rewardResolveProbe?.ok,
    JSON.stringify(rewardResolveProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'reward-layout-after-steal.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const rewardMobileProbe = await page.evaluate(() => {
    if (!window.game) return { ok: false, reason: 'no_game' };
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.startRealm(1, false);
    const lawId = typeof LAWS !== 'undefined' ? Object.keys(LAWS)[0] : null;
    if (game.player) {
      game.player.getStealBonus = () => 0;
    }
    game.currentBattleNode = { type: 'elite', id: 990002, completed: false };
    game.stealAttempted = false;
    game.lastBattleRewardMeta = {
      encounter: {
        themeId: 'theme_counter_lattice',
        themeName: '轮段·反制晶格',
        tierStage: 2,
        goldBonus: 18,
        ringExpBonus: 9,
      },
    };
    game.showRewardScreen(145, true, { stealLaw: lawId, stealChance: 1 }, 32, { insight: 8, karma: 3 });
    const main = document.querySelector('.reward-main-column');
    const side = document.querySelector('.reward-side-column');
    const actions = document.querySelector('.reward-actions');
    const cards = Array.from(document.querySelectorAll('#reward-cards .card'));
    if (!main || !side || !actions || cards.length < 2) return { ok: false, reason: 'missing_reward_mobile_nodes' };
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
    const mainRect = toRect(main);
    const sideRect = toRect(side);
    const actionsRect = toRect(actions);
    const cardRects = cards.map((card) => toRect(card));
    return {
      ok:
        sideRect.top >= mainRect.bottom - 6 &&
        cardRects.every((rect) => rect.left >= mainRect.left - 4 && rect.right <= mainRect.right + 4) &&
        actionsRect.width <= sideRect.width + 2,
      mainRect,
      sideRect,
      actionsRect,
      cardRects,
    };
  });
  add(
    'reward screen stacks into a single readable column on mobile',
    !!rewardMobileProbe?.ok,
    JSON.stringify(rewardMobileProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'reward-layout-mobile.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.click('button[onclick="game.showAchievements()"]', { timeout: 5000, force: true });
  await page.waitForTimeout(400);
  const achievementsProbe = await page.evaluate(() => {
    const header = document.querySelector('#achievements-screen .screen-header');
    const container = document.getElementById('achievements-container');
    const firstCategory = document.querySelector('.achievement-category');
    const firstItem = document.querySelector('.achievement-card');
    if (!header || !container || !firstCategory || !firstItem) return { ok: false, reason: 'missing_achievement_nodes' };
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
    const headerRect = toRect(header);
    const containerRect = toRect(container);
    const firstItemRect = toRect(firstItem);
    return {
      ok:
        containerRect.top >= headerRect.bottom - 8 &&
        containerRect.width >= 1000 &&
        firstItemRect.left >= containerRect.left - 2 &&
        firstItemRect.right <= containerRect.right + 2,
      headerRect,
      containerRect,
      firstItemRect,
      categories: document.querySelectorAll('.achievement-category').length,
      items: document.querySelectorAll('.achievement-card').length,
    };
  });
  add(
    'achievements screen uses a centered container without clipping the first grid row',
    !!achievementsProbe?.ok,
    JSON.stringify(achievementsProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'achievements-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const realmSelectScrollProbe = await page.evaluate(() => {
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

    const layout = document.querySelector('#realm-select-screen .realm-select-layout');
    const list = document.getElementById('realm-list-container');
    const panel = document.getElementById('realm-preview-panel');
    const content = panel?.querySelector('.realm-preview-content');
    const enterBtn = document.getElementById('enter-realm-btn');
    if (!layout || !list || !panel || !content || !enterBtn) return { ok: false, reason: 'missing_realm_nodes' };

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

    const layoutRect = toRect(layout);
    const listRect = toRect(list);
    const panelRect = toRect(panel);
    const buttonRectBefore = toRect(enterBtn);
    const listScrollable = list.scrollHeight > list.clientHeight + 20;
    const panelScrollable = panel.scrollHeight > panel.clientHeight + 20;

    list.scrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
    panel.scrollTop = Math.max(0, panel.scrollHeight - panel.clientHeight);
    const listScrolled = list.scrollTop > 0;
    const panelScrolled = panel.scrollTop > 0;
    const buttonRectAfter = toRect(enterBtn);

    return {
      ok:
        layoutRect.bottom <= window.innerHeight + 2 &&
        listRect.bottom <= layoutRect.bottom + 2 &&
        panelRect.bottom <= layoutRect.bottom + 2 &&
        listScrollable &&
        panelScrollable &&
        listScrolled &&
        panelScrolled &&
        buttonRectAfter.bottom <= panelRect.bottom + 2,
      layoutRect,
      listRect,
      panelRect,
      buttonRectBefore,
      buttonRectAfter,
      listClientHeight: list.clientHeight,
      listScrollHeight: list.scrollHeight,
      listScrollTop: list.scrollTop,
      panelClientHeight: panel.clientHeight,
      panelScrollHeight: panel.scrollHeight,
      panelScrollTop: panel.scrollTop,
      activeRealm: document.querySelector('.realm-card.active')?.getAttribute('data-id') || null,
    };
  });
  add(
    'realm select screen keeps list and preview panel independently scrollable',
    !!realmSelectScrollProbe?.ok,
    JSON.stringify(realmSelectScrollProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'realm-select-scroll.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.click('button[onclick="game.showLegacyScreen()"]', { timeout: 5000, force: true });
  await page.waitForTimeout(450);
  const inheritanceProbe = await page.evaluate(() => {
    const header = document.querySelector('#inheritance-screen .screen-header');
    const container = document.querySelector('.inheritance-container');
    const summary = document.getElementById('inheritance-summary');
    const presets = document.getElementById('inheritance-presets');
    const grid = document.getElementById('inheritance-upgrade-grid');
    const actions = document.querySelector('.inheritance-actions');
    if (!header || !container || !summary || !presets || !grid || !actions) return { ok: false, reason: 'missing_inheritance_nodes' };
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
    const headerRect = toRect(header);
    const containerRect = toRect(container);
    const summaryRect = toRect(summary);
    const presetsRect = toRect(presets);
    const actionsRect = toRect(actions);
    return {
      ok:
        containerRect.top >= headerRect.bottom - 10 &&
        summaryRect.left >= containerRect.left - 2 &&
        presetsRect.left >= containerRect.left - 2 &&
        actionsRect.right <= containerRect.right + 2 &&
        document.querySelectorAll('.inheritance-preset-btn').length >= 4 &&
        document.querySelectorAll('.inheritance-card').length >= 4,
      headerRect,
      containerRect,
      summaryRect,
      presetsRect,
      actionsRect,
      presetCount: document.querySelectorAll('.inheritance-preset-btn').length,
      cardCount: document.querySelectorAll('.inheritance-card').length,
    };
  });
  add(
    'inheritance screen keeps summary, presets and upgrade grid inside a single readable shell',
    !!inheritanceProbe?.ok,
    JSON.stringify(inheritanceProbe || null)
  );
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const collectionProbe = await page.evaluate(() => {
    if (!window.game) return { ok: false, reason: 'no_game' };
    if (!game.player || !Array.isArray(game.player.collectedLaws)) {
      game.guestMode = true;
      game.startNewGame('linFeng');
    }
    if (typeof game.showCollection === 'function') game.showCollection();
    else {
      if (typeof game.initCollection === 'function') game.initCollection();
      game.showScreen('collection');
    }
    const main = document.querySelector('.codex-main-column');
    const side = document.querySelector('.codex-side-column');
    const summary = document.getElementById('law-codex-summary');
    const resonance = document.getElementById('law-codex-resonance-summary');
    const toRect = (el) => {
      const rect = el.getBoundingClientRect();
      return { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) };
    };
    if (!main || !side || !summary || !resonance) return { ok: false, reason: 'missing_codex_nodes' };
    const mainRect = toRect(main);
    const sideRect = toRect(side);
    return {
      ok: mainRect.left < sideRect.left && sideRect.width >= 280 && /已收录/.test(summary.textContent || '') && /激活中/.test(resonance.textContent || ''),
      mainRect,
      sideRect,
      summaryText: (summary.textContent || '').replace(/\s+/g, ' ').trim(),
      resonanceText: (resonance.textContent || '').replace(/\s+/g, ' ').trim()
    };
  });
  add(
    'law codex uses reward-style main and side rails with live summary cards',
    !!collectionProbe?.ok,
    JSON.stringify(collectionProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'law-codex-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  const lawCodexFilterProbe = await page.evaluate(() => {
    if (!window.game || !game.player || typeof game.showCollection !== 'function') return { ok: false, reason: 'no_game' };
    const fireLaw = typeof LAWS !== 'undefined' ? LAWS.flameTruth || Object.values(LAWS)[0] : null;
    const thunderLaw = typeof LAWS !== 'undefined' ? LAWS.thunderLaw || Object.values(LAWS)[1] : null;
    if (!fireLaw || !thunderLaw) return { ok: false, reason: 'missing_laws' };
    if (typeof game.player.collectLaw === 'function') {
      game.player.collectLaw(fireLaw);
      game.player.collectLaw(thunderLaw);
    }
    if (game.player?.fateRing) {
      game.player.fateRing.getSocketedLaws = () => [fireLaw.id, thunderLaw.id];
    }
    game.showCollection();
    if (typeof game.setLawCodexSearchQuery === 'function') game.setLawCodexSearchQuery('火');
    if (typeof game.setLawCodexStatusFilter === 'function') game.setLawCodexStatusFilter('owned');
    if (typeof game.setLawCodexElementFilter === 'function') game.setLawCodexElementFilter('fire');
    if (typeof game.setLawCodexResonanceFilter === 'function') game.setLawCodexResonanceFilter('active');
    const lawNames = Array.from(document.querySelectorAll('#law-archive-grid .law-item .law-name')).map((el) => (el.textContent || '').trim()).filter(Boolean);
    const resonanceNames = Array.from(document.querySelectorAll('#resonance-manual-list .resonance-title')).map((el) => (el.textContent || '').trim()).filter(Boolean);
    const summaryText = (document.getElementById('law-codex-summary')?.textContent || '').replace(/\s+/g, ' ').trim();
    const resonanceText = (document.getElementById('law-codex-resonance-summary')?.textContent || '').replace(/\s+/g, ' ').trim();
    const searchValue = document.getElementById('law-codex-search')?.value || '';
    return {
      ok:
        searchValue === '火' &&
        lawNames.length === 1 &&
        /火/.test(lawNames[0] || '') &&
        resonanceNames.length >= 1 &&
        /火属性/.test(summaryText) &&
        /已掌握/.test(summaryText) &&
        /当前结果/.test(resonanceText),
      searchValue,
      lawNames,
      resonanceNames,
      summaryText,
      resonanceText
    };
  });
  add(
    'law codex search and filters narrow visible laws and resonance chains',
    !!lawCodexFilterProbe?.ok,
    JSON.stringify(lawCodexFilterProbe || null)
  );

  const lawDetailProbe = await page.evaluate(() => {
    if (!window.game || !game.player) return { ok: false, reason: 'no_game' };
    const firstLaw = typeof LAWS !== 'undefined' ? LAWS.thunderLaw || Object.values(LAWS)[0] : null;
    const comboLaw = typeof LAWS !== 'undefined' ? LAWS.flameTruth || Object.values(LAWS)[1] : null;
    if (!firstLaw) return { ok: false, reason: 'no_law' };
    if (typeof game.player.collectLaw === 'function') {
      game.player.collectLaw(firstLaw);
      if (comboLaw) game.player.collectLaw(comboLaw);
    }
    if (game.player?.fateRing) {
      game.player.fateRing.getSocketedLaws = () => [firstLaw.id, comboLaw?.id].filter(Boolean);
    }
    if (typeof game.initCollection === 'function') game.initCollection();
    if (typeof game.showLawDetail === 'function') game.showLawDetail(firstLaw, true);
    const modal = document.getElementById('law-detail-modal');
    const main = modal ? modal.querySelector('.law-detail-main') : null;
    const side = modal ? modal.querySelector('.law-detail-side') : null;
    const passive = document.getElementById('law-detail-passive');
    const readiness = document.getElementById('law-detail-readiness');
    const readinessItems = readiness ? readiness.querySelectorAll('.law-readiness-item').length : 0;
    const chips = document.querySelectorAll('#law-detail-chips .detail-status-chip').length;
    const toRect = (el) => {
      const rect = el.getBoundingClientRect();
      return { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) };
    };
    if (!modal || !main || !side || !passive || !readiness) return { ok: false, reason: 'missing_law_modal_nodes' };
    const mainRect = toRect(main);
    const sideRect = toRect(side);
    const actionButtons = readiness ? readiness.querySelectorAll('.law-readiness-btn').length : 0;
    const modalWasActive = modal.classList.contains('active');
    if (typeof game.handleLawReadinessAction === 'function') {
      game.handleLawReadinessAction('law', '', 'flameTruth');
    }
    const jumpedName = (document.getElementById('law-detail-name')?.textContent || '').trim();
    if (typeof game.handleLawReadinessAction === 'function') {
      game.handleLawReadinessAction('ring', 'plasmaOverload', '');
    }
    const ringActive = document.getElementById('ring-modal')?.classList.contains('active');
    return {
      ok:
        modalWasActive &&
        mainRect.left < sideRect.left &&
        chips >= 3 &&
        readinessItems >= 1 &&
        actionButtons >= 1 &&
        /已激活|待装配|差 1 枚/.test(readiness.textContent || '') &&
        /火/.test(jumpedName) &&
        !!ringActive &&
        (passive.textContent || '').trim().length > 0,
      mainRect,
      sideRect,
      chips,
      readinessItems,
      actionButtons,
      jumpedName,
      ringActive,
      passiveText: (passive.textContent || '').replace(/\s+/g, ' ').trim(),
      readinessText: (readiness.textContent || '').replace(/\s+/g, ' ').trim()
    };
  });
  add(
    'law detail modal uses the same main and side rail layout with passive and source summary',
    !!lawDetailProbe?.ok,
    JSON.stringify(lawDetailProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'law-detail-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  const spiritCodexProbe = await page.evaluate(() => {
    if (!window.game || !game.player || typeof game.showCollection !== 'function') return { ok: false, reason: 'no_game' };
    document.querySelectorAll('.achievement-popup').forEach((el) => el.remove());
    document.querySelectorAll('.modal.active, .card-detail-overlay.active').forEach((el) => el.classList.remove('active'));
    game.selectedCharacterId = 'linFeng';
    if (typeof game.player.setSpiritCompanion === 'function') game.player.setSpiritCompanion('emberCrow', 1);
    game.showCollection();
    if (typeof game.switchCollectionSection === 'function') game.switchCollectionSection('spirits');
    if (typeof game.setSpiritCodexSearchQuery === 'function') game.setSpiritCodexSearchQuery('烛鸦');
    if (typeof game.setSpiritCodexFocusFilter === 'function') game.setSpiritCodexFocusFilter('current');
    const activeTab = document.querySelector('#collection [data-collection-tab="spirits"]');
    const cards = document.querySelectorAll('#spirit-codex-grid .collection-card');
    const detailText = (document.getElementById('spirit-codex-detail')?.textContent || '').replace(/\s+/g, ' ').trim();
    const summaryText = (document.getElementById('spirit-codex-summary')?.textContent || '').replace(/\s+/g, ' ').trim();
    const searchValue = document.getElementById('spirit-codex-search')?.value || '';
    return {
      ok:
        !!activeTab?.classList.contains('active') &&
        cards.length === 1 &&
        /烛鸦/.test(detailText) &&
        /血灯燎原|烬羽反啄/.test(detailText) &&
        /当前同行/.test(summaryText) &&
        searchValue === '烛鸦',
      cards: cards.length,
      searchValue,
      detailText,
      summaryText
    };
  });
  add(
    'spirit codex tab filters current spirit entries and renders detailed passive/active records',
    !!spiritCodexProbe?.ok,
    JSON.stringify(spiritCodexProbe || null)
  );
  await page.evaluate(() => {
    document.querySelectorAll('.achievement-popup').forEach((el) => el.remove());
    document.querySelectorAll('.modal.active, .card-detail-overlay.active').forEach((el) => el.classList.remove('active'));
  });
  await safeAuditScreenshot(page, path.join(outDir, 'spirit-codex-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  const enemyCodexProbe = await page.evaluate(() => {
    if (!window.game || !game.player || typeof game.showCollection !== 'function') return { ok: false, reason: 'no_game' };
    document.querySelectorAll('.achievement-popup').forEach((el) => el.remove());
    document.querySelectorAll('.modal.active, .card-detail-overlay.active').forEach((el) => el.classList.remove('active'));
    game.player.maxRealmReached = Math.max(Number(game.player.maxRealmReached) || 1, 2);
    if (game.achievementSystem && typeof game.achievementSystem.updateStat === 'function') {
      game.achievementSystem.updateStat('realmCleared', 2, 'max');
    }
    game.showCollection();
    if (typeof game.switchCollectionSection === 'function') game.switchCollectionSection('enemies');
    if (typeof game.setEnemyCodexSearchQuery === 'function') game.setEnemyCodexSearchQuery('墓羽鸦');
    if (typeof game.setEnemyCodexFocusFilter === 'function') game.setEnemyCodexFocusFilter('scouted');
    const cards = document.querySelectorAll('#enemy-codex-grid .collection-card');
    const detailText = (document.getElementById('enemy-codex-detail')?.textContent || '').replace(/\s+/g, ' ').trim();
    const summaryText = (document.getElementById('enemy-codex-summary')?.textContent || '').replace(/\s+/g, ' ').trim();
    const searchValue = document.getElementById('enemy-codex-search')?.value || '';
    return {
      ok:
        cards.length === 1 &&
        /墓羽鸦/.test(detailText) &&
        /控场型/.test(detailText) &&
        /状态压制|净化|减益/.test(detailText) &&
        /敌影档案进度/.test(summaryText) &&
        searchValue === '墓羽鸦',
      cards: cards.length,
      searchValue,
      detailText,
      summaryText
    };
  });
  add(
    'enemy codex tab links tactical role, threat tags, and counterplay notes for scouted enemies',
    !!enemyCodexProbe?.ok,
    JSON.stringify(enemyCodexProbe || null)
  );
  await page.evaluate(() => {
    document.querySelectorAll('.achievement-popup').forEach((el) => el.remove());
    document.querySelectorAll('.modal.active, .card-detail-overlay.active').forEach((el) => el.classList.remove('active'));
  });
  await safeAuditScreenshot(page, path.join(outDir, 'enemy-codex-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  const bossArchiveProbe = await page.evaluate(() => {
    if (!window.game || !game.player || typeof game.showCollection !== 'function') return { ok: false, reason: 'no_game' };
    document.querySelectorAll('.achievement-popup').forEach((el) => el.remove());
    document.querySelectorAll('.modal.active, .card-detail-overlay.active').forEach((el) => el.classList.remove('active'));
    if (game.achievementSystem && typeof game.achievementSystem.updateStat === 'function') {
      game.achievementSystem.updateStat('realmCleared', 12, 'max');
      game.achievementSystem.updateStat('bossesDefeated', 4, 'max');
    }
    if (typeof game.recordBossMemoryResult === 'function') game.recordBossMemoryResult('danZun', 'victory', 6);
    if (typeof game.player?.setRunPath === 'function') game.player.setRunPath('insight');
    if (typeof game.recordRunPathBossSample === 'function' && typeof game.player?.getRunPathMeta === 'function') {
      game.recordRunPathBossSample(game.player.getRunPathMeta(), {
        id: 'danZun',
        name: '丹尊',
        icon: '🗿',
        realm: 6
      }, {
        characterId: 'linFeng',
        turns: 4,
        completedAt: Date.now() - 1000
      });
    }
    game.showCollection();
    if (typeof game.switchCollectionSection === 'function') game.switchCollectionSection('bosses');
    if (typeof game.setBossArchiveSearchQuery === 'function') game.setBossArchiveSearchQuery('丹尊');
    if (typeof game.setBossArchiveFocusFilter === 'function') game.setBossArchiveFocusFilter('all');
    const cards = document.querySelectorAll('#boss-archive-grid .collection-card');
    const detailText = (document.getElementById('boss-archive-detail')?.textContent || '').replace(/\s+/g, ' ').trim();
    const summaryText = (document.getElementById('boss-archive-summary')?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      ok:
        cards.length === 1 &&
        /丹尊/.test(detailText) &&
        /玄冰珠/.test(detailText) &&
        /灼烧|净化|冰/.test(detailText) &&
        /当前命途解法|窥命流|适配评级|留冗余手牌/.test(detailText) &&
        /章节场域/.test(detailText) &&
        /记忆战|已留痕|最快 6 回合/.test(detailText) &&
        /通关样本对照/.test(detailText) &&
        /自动推荐摘要|推荐角色|推荐套装/.test(detailText) &&
        /林风|林枫/.test(detailText) &&
        /4 回合/.test(detailText) &&
        /记忆战留痕/.test(summaryText) &&
        /Boss 档案进度/.test(summaryText) &&
        /样本对照/.test(summaryText),
      cards: cards.length,
      detailText,
      summaryText
    };
  });
  add(
    'boss archive tab links chapter boss mechanics with counter treasures and break-window notes',
    !!bossArchiveProbe?.ok,
    JSON.stringify(bossArchiveProbe || null)
  );
  await page.evaluate(() => {
    document.querySelectorAll('.achievement-popup').forEach((el) => el.remove());
    document.querySelectorAll('.modal.active, .card-detail-overlay.active').forEach((el) => el.classList.remove('active'));
  });
  await safeAuditScreenshot(page, path.join(outDir, 'boss-archive-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  const bossMemoryFlowProbe = await page.evaluate(async () => {
    if (!window.game || !game.player || typeof game.startBossMemoryBattle !== 'function') return { ok: false, reason: 'no_memory_battle' };
    document.querySelectorAll('.achievement-popup').forEach((el) => el.remove());
    document.querySelectorAll('.modal.active, .card-detail-overlay.active').forEach((el) => el.classList.remove('active'));
    if (game.achievementSystem && typeof game.achievementSystem.updateStat === 'function') {
      game.achievementSystem.updateStat('realmCleared', 12, 'max');
      game.achievementSystem.updateStat('bossesDefeated', 4, 'max');
    }
    game.showCollection();
    if (typeof game.switchCollectionSection === 'function') game.switchCollectionSection('bosses');
    if (typeof game.setBossArchiveSearchQuery === 'function') game.setBossArchiveSearchQuery('丹尊');
    const memoryBtn = document.querySelector('#boss-archive-detail .collection-inline-btn');
    if (!memoryBtn) return { ok: false, reason: 'missing_memory_button' };
    memoryBtn.click();
    const startedMode = game.currentScreen;
    const startedNodeType = game.currentBattleNode?.type || '';
    const startedBossName = game.battle?.enemies?.[0]?.name || '';
    if (typeof game.onBattleLost === 'function') {
      await game.onBattleLost();
    }
    const returnedMode = game.currentScreen;
    const rewardText = (document.getElementById('reward-message')?.textContent || '').replace(/\s+/g, ' ').trim();
    const detailText = (document.getElementById('boss-archive-detail')?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      ok:
        startedMode === 'battle-screen' &&
        startedNodeType === 'boss_memory' &&
        /记忆战/.test(startedBossName) &&
        returnedMode === 'collection' &&
        /失败不会污染主线|累计试作/.test(rewardText) &&
        /试作/.test(detailText),
      startedMode,
      startedNodeType,
      startedBossName,
      returnedMode,
      rewardText,
      detailText
    };
  });
  add(
    'boss archive can launch a boss memory battle and return to the archive with trial records intact',
    !!bossMemoryFlowProbe?.ok,
    JSON.stringify(bossMemoryFlowProbe || null)
  );
  await page.evaluate(() => {
    document.getElementById('reward-modal')?.classList.remove('active');
    document.querySelectorAll('.achievement-popup').forEach((el) => el.remove());
    document.querySelectorAll('.modal.active, .card-detail-overlay.active').forEach((el) => el.classList.remove('active'));
  });

  const buildAndSanctumProbe = await page.evaluate(() => {
    if (!window.game || !game.player || typeof game.showCollection !== 'function') return { ok: false, reason: 'no_game' };
    document.querySelectorAll('.achievement-popup').forEach((el) => el.remove());
    document.querySelectorAll('.modal.active, .card-detail-overlay.active').forEach((el) => el.classList.remove('active'));
    const firstLaw = typeof LAWS !== 'undefined' ? LAWS.flameTruth || Object.values(LAWS)[0] : null;
    const secondLaw = typeof LAWS !== 'undefined' ? LAWS.thunderLaw || Object.values(LAWS)[1] : null;
    if (firstLaw && typeof game.player.collectLaw === 'function') game.player.collectLaw(firstLaw);
    if (secondLaw && typeof game.player.collectLaw === 'function') game.player.collectLaw(secondLaw);
    if (typeof game.player.addTreasure === 'function') {
      game.player.addTreasure('soul_jade');
      game.player.addTreasure('ice_spirit_bead');
    }
    if (typeof game.player.setRunPath === 'function') game.player.setRunPath('insight');
    if (typeof game.player.setRunDestiny === 'function') game.player.setRunDestiny('rebelScale', 1);
    if (typeof game.player.setSpiritCompanion === 'function') game.player.setSpiritCompanion('emberCrow', 1);
    if (game.player?.fateRing) {
      game.player.fateRing.getSocketedLaws = () => [firstLaw?.id, secondLaw?.id].filter(Boolean);
    }
    if (game.achievementSystem && typeof game.achievementSystem.unlockAchievement === 'function') {
      const firstAchievementId = typeof ACHIEVEMENTS !== 'undefined' ? Object.keys(ACHIEVEMENTS)[0] : null;
      if (firstAchievementId) game.achievementSystem.unlockAchievement(firstAchievementId);
      if (typeof game.achievementSystem.updateStat === 'function') {
        game.achievementSystem.updateStat('maxCombo', 9, 'max');
        game.achievementSystem.updateStat('singleDamage', 48, 'max');
      }
    }
    if (typeof game.recordBossMemoryResult === 'function') game.recordBossMemoryResult('danZun', 'victory', 5);
    if (typeof game.recordRunPathBossSample === 'function' && typeof game.player?.getRunPathMeta === 'function') {
      game.recordRunPathBossSample(game.player.getRunPathMeta(), {
        id: 'danZun',
        name: '丹尊',
        icon: '🗿',
        realm: 6
      }, {
        characterId: 'linFeng',
        turns: 4,
        completedAt: Date.now() - 2000
      });
      game.recordRunPathBossSample(game.player.getRunPathMeta(), {
        id: 'heavenlyDao',
        name: '天道',
        icon: '☯',
        realm: 18
      }, {
        characterId: 'linFeng',
        turns: 8,
        completedAt: Date.now() - 1000
      });
    }
    if (typeof game.recordObservatoryArchiveEntry === 'function') {
      game.recordObservatoryArchiveEntry({
        id: 'audit-observatory-record',
        type: 'challenge',
        mode: 'daily',
        modeLabel: '今日天机',
        rotationKey: '2026-03-14',
        rotationLabel: '2026.03.14',
        seedSignature: 'D-030314-AUDT',
        title: '星镜试锋',
        note: '完成 · 得分 420',
        icon: '🔭',
        score: 420,
        completed: true,
        at: Date.now(),
        reason: 'goal_reached',
        rule: {
          id: 'audit_rule',
          name: '星镜试锋',
          goalRealm: 3,
          characterId: 'linFeng',
          runDestinyId: 'rebelScale',
          spiritCompanionId: 'emberCrow'
        }
      });
    }

    game.showCollection();
    if (typeof game.switchCollectionSection === 'function') game.switchCollectionSection('builds');
    const buildHeroText = (document.getElementById('build-snapshot-hero')?.textContent || '').replace(/\s+/g, ' ').trim();
    const buildMetricCount = document.querySelectorAll('#build-snapshot-metrics .build-metric-card').length;
    const buildNotesText = (document.getElementById('build-snapshot-notes')?.textContent || '').replace(/\s+/g, ' ').trim();

    if (typeof game.switchCollectionSection === 'function') game.switchCollectionSection('sanctum');
    const roomCards = document.querySelectorAll('#sanctum-room-grid .sanctum-room-card').length;
    const researchItems = document.querySelectorAll('#sanctum-research-list .sanctum-research-item').length;
    const goalItems = document.querySelectorAll('#sanctum-goal-list .sanctum-goal-item, #sanctum-goal-list .codex-empty-state').length;
    const unlockItems = document.querySelectorAll('#sanctum-unlock-feed .unlock-feed-item').length;
    const summaryText = (document.getElementById('sanctum-summary')?.textContent || '').replace(/\s+/g, ' ').trim();
    const progressText = (document.getElementById('sanctum-progress')?.textContent || '').replace(/\s+/g, ' ').trim();
    const roomText = (document.getElementById('sanctum-room-grid')?.textContent || '').replace(/\s+/g, ' ').trim();
    const researchText = (document.getElementById('sanctum-research-list')?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      ok:
        /构筑画像|攻势抢拍|法则编织|护阵拖线|混成试作/.test(buildHeroText) &&
        buildMetricCount >= 4 &&
        /当前优势/.test(buildNotesText) &&
        /主要缺口/.test(buildNotesText) &&
        /下一轮补位|补件优先级队列/.test(buildNotesText) &&
        /样本对照/.test(buildNotesText) &&
        /自动推荐摘要|推荐角色|推荐套装/.test(buildNotesText) &&
        /章节适配|场域拟合分/.test(buildNotesText) &&
        /下一章风险镜像|下一章高危|高危·/.test(buildNotesText) &&
        /丹尊/.test(buildNotesText) &&
        /天道/.test(buildNotesText) &&
        roomCards >= 5 &&
        researchItems >= 11 &&
        goalItems >= 1 &&
        unlockItems >= 2 &&
        /命盘档案室/.test(roomText) &&
        /远征命盘归档/.test(researchText) &&
        /实战样本对照榜/.test(researchText) &&
        /局外中枢进度/.test(summaryText) &&
        /观星留痕|炼器铭刻|三段套装/.test(summaryText) &&
        /样本对照/.test(summaryText) &&
        /法则：|法宝：|炼器研究：|套装共鸣：|炼器铭刻：|Boss 档案：|伏魔台记忆战：|样本对照：|观星留痕：/.test(progressText),
      buildHeroText,
      buildMetricCount,
      buildNotesText,
      roomCards,
      researchItems,
      goalItems,
      unlockItems,
      roomText,
      researchText,
      summaryText,
      progressText
    };
  });
  add(
    'build snapshot and sanctum tabs summarize deck identity, research goals, room overview and recent unlock history',
    !!buildAndSanctumProbe?.ok,
    JSON.stringify(buildAndSanctumProbe || null)
  );
  await page.evaluate(() => {
    document.querySelectorAll('.achievement-popup').forEach((el) => el.remove());
    document.querySelectorAll('.modal.active, .card-detail-overlay.active').forEach((el) => el.classList.remove('active'));
  });
  await safeAuditScreenshot(page, path.join(outDir, 'sanctum-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  const treasureCompendiumProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showTreasureCompendium !== 'function') return { ok: false, reason: 'no_compendium' };
    if (!game.player) {
      game.guestMode = true;
      game.startNewGame('linFeng');
    }
    game.showTreasureCompendium();
    const main = document.querySelector('.treasure-compendium-main');
    const side = document.querySelector('.treasure-compendium-side');
    const summary = document.getElementById('treasure-compendium-summary');
    const rarity = document.getElementById('treasure-compendium-rarity');
    const research = document.getElementById('treasure-compendium-research');
    const firstItem = document.querySelector('#treasure-compendium-grid .compendium-item');
    const toRect = (el) => {
      const rect = el.getBoundingClientRect();
      return { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) };
    };
    if (!main || !side || !summary || !rarity || !research || !firstItem) return { ok: false, reason: 'missing_compendium_nodes' };
    const mainRect = toRect(main);
    const sideRect = toRect(side);
    return {
      ok:
        mainRect.left < sideRect.left &&
        sideRect.width >= 280 &&
        /已收录/.test(summary.textContent || '') &&
        /凡品|灵品|神品|仙品/.test(rarity.textContent || '') &&
        /炼器研究|核心件|套装/.test(research.textContent || ''),
      mainRect,
      sideRect,
      summaryText: (summary.textContent || '').replace(/\s+/g, ' ').trim(),
      rarityText: (rarity.textContent || '').replace(/\s+/g, ' ').trim(),
      researchText: (research.textContent || '').replace(/\s+/g, ' ').trim()
    };
  });
  add(
    'treasure compendium uses reward-style main and side rails with collection breakdown',
    !!treasureCompendiumProbe?.ok,
    JSON.stringify(treasureCompendiumProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'treasure-compendium-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  const treasureFilterProbe = await page.evaluate(() => {
    if (!window.game || !game.player || typeof game.showTreasureCompendium !== 'function') return { ok: false, reason: 'no_game' };
    if (typeof game.player.addTreasure === 'function') {
      game.player.addTreasure('vitality_stone');
      game.player.addTreasure('soul_banner');
    }
    game.setTreasureCompendiumFilter('owned');
    game.treasureCompendiumSort = 'name_asc';
    if (typeof game.setTreasureCompendiumSearchQuery === 'function') game.setTreasureCompendiumSearchQuery('魂');
    game.showTreasureCompendium();
    const ownedCount = document.querySelectorAll('#treasure-compendium-grid .compendium-item').length;
    const firstOwnedName = (document.querySelector('#treasure-compendium-grid .compendium-name')?.textContent || '').trim();
    if (typeof game.toggleTreasureCompendiumFilterChip === 'function') {
      game.toggleTreasureCompendiumFilterChip('status', 'owned');
      game.toggleTreasureCompendiumFilterChip('rarity', 'rare');
      game.toggleTreasureCompendiumFilterChip('source', 'shop');
    }
    game.treasureCompendiumSort = 'realm_asc';
    if (typeof game.saveTreasureCompendiumPreset === 'function') game.saveTreasureCompendiumPreset(0);
    if (typeof game.clearTreasureCompendiumFilters === 'function') game.clearTreasureCompendiumFilters();
    if (typeof game.applyTreasureCompendiumPreset === 'function') game.applyTreasureCompendiumPreset(0);
    game.showTreasureCompendium();
    const comboCount = document.querySelectorAll('#treasure-compendium-grid .compendium-item').length;
    const summaryText = (document.getElementById('treasure-compendium-summary')?.textContent || '').replace(/\s+/g, ' ').trim();
    const activeChips = document.querySelectorAll('#treasure-compendium .compendium-chip.active').length;
    const presetText = (document.getElementById('treasure-preset-slot-0')?.textContent || '').trim();
    const searchValue = document.getElementById('treasure-search-input')?.value || '';
    return {
      ok:
        ownedCount >= 1 &&
        /魂/.test(firstOwnedName) &&
        comboCount >= 1 &&
        activeChips >= 2 &&
        /当前筛选结果/.test(summaryText) &&
        /灵品|商店/.test(summaryText) &&
        /关键词「魂」/.test(summaryText) &&
        /预设 1/.test(presetText) &&
        /搜「魂」/.test(presetText) &&
        searchValue === '魂',
      ownedCount,
      firstOwnedName,
      comboCount,
      activeChips,
      searchValue,
      presetText,
      summaryText
    };
  });
  add(
    'treasure compendium filter and sort controls reshape the visible archive list',
    !!treasureFilterProbe?.ok,
    JSON.stringify(treasureFilterProbe || null)
  );

  const treasureDetailProbe = await page.evaluate(() => {
    const modal = document.getElementById('treasure-detail-modal');
    const main = modal ? modal.querySelector('.treasure-detail-main') : null;
    const side = modal ? modal.querySelector('.treasure-detail-side') : null;
    const status = document.getElementById('detail-owned-state');
    const role = document.getElementById('detail-role-state');
    const infusion = document.getElementById('detail-infusion-state');
    const source = document.getElementById('detail-source');
    const setInfo = document.getElementById('detail-set');
    const buildFit = document.getElementById('detail-build-fit');
    const forgeStatus = document.getElementById('detail-forge-status');
    const firstOwned = (window.game && game.player)
      ? Object.values(TREASURES || {}).find((treasure) => game.player.hasTreasure(treasure.id)) || Object.values(TREASURES || {})[0]
      : null;
    if (firstOwned && window.game && typeof game.showTreasureDetail === 'function') {
      game.showTreasureDetail(firstOwned, !!(game.player && game.player.hasTreasure(firstOwned.id)));
    }
    const visibleMain = document.querySelector('#treasure-detail-modal.active .treasure-detail-main');
    const visibleSide = document.querySelector('#treasure-detail-modal.active .treasure-detail-side');
    const toRect = (el) => {
      const rect = el.getBoundingClientRect();
      return { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) };
    };
    if (!modal || !visibleMain || !visibleSide || !status || !role || !infusion || !source || !setInfo || !buildFit || !forgeStatus) return { ok: false, reason: 'missing_treasure_detail_nodes' };
    const mainRect = toRect(visibleMain);
    const sideRect = toRect(visibleSide);
    return {
      ok:
        modal.classList.contains('active') &&
        mainRect.left < sideRect.left &&
        /已收录|未收录/.test(status.textContent || '') &&
        (source.textContent || '').trim().length > 0 &&
        (role.textContent || '').trim().length > 0 &&
        /灌注|核心|基础/.test((infusion.textContent || '') + (role.textContent || '')) &&
        (setInfo.textContent || '').trim().length > 0 &&
        (buildFit.textContent || '').trim().length > 0 &&
        (forgeStatus.textContent || '').trim().length > 0,
      mainRect,
      sideRect,
      statusText: (status.textContent || '').trim(),
      roleText: (role.textContent || '').trim(),
      infusionText: (infusion.textContent || '').trim(),
      sourceText: (source.textContent || '').replace(/\s+/g, ' ').trim(),
      setText: (setInfo.textContent || '').replace(/\s+/g, ' ').trim(),
      buildFitText: (buildFit.textContent || '').replace(/\s+/g, ' ').trim(),
      forgeText: (forgeStatus.textContent || '').replace(/\s+/g, ' ').trim()
    };
  });
  add(
    'treasure detail modal follows the same main and side rail information hierarchy',
    !!treasureDetailProbe?.ok,
    JSON.stringify(treasureDetailProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'treasure-detail-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    if (!window.game) return;
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.startRealm(1, false);
    if (game.map) {
      game.map.getAccessibleNodes = () => [
        { id: 'elite_audit', row: 3, type: 'elite', accessible: true, completed: false },
        { id: 'rest_audit', row: 3, type: 'rest', accessible: true, completed: false }
      ];
    }
    game.showShop({ id: 'audit_shop_layout', type: 'shop', row: 2 });
  });
  await page.waitForTimeout(450);
  await page.click('#shop-cards .card', { force: true });
  await page.waitForTimeout(250);
  const shopDetailProbe = await page.evaluate(() => {
    const modal = document.getElementById('card-detail-modal');
    const main = modal ? modal.querySelector('.card-detail-main') : null;
    const side = modal ? modal.querySelector('.card-detail-side') : null;
    const summaryRows = modal ? modal.querySelectorAll('.cd-summary-row').length : 0;
    const badges = modal ? modal.querySelectorAll('.cd-badges .detail-status-chip').length : 0;
    const toRect = (el) => {
      const rect = el.getBoundingClientRect();
      return { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) };
    };
    if (!modal || window.getComputedStyle(modal).display === 'none' || !main || !side) return { ok: false, reason: 'missing_card_detail_nodes' };
    const mainRect = toRect(main);
    const sideRect = toRect(side);
    return {
      ok: mainRect.left < sideRect.left && summaryRows >= 5 && badges >= 2 && /商店详情/.test(modal.textContent || '') && /高适配|中适配|低适配/.test(modal.textContent || ''),
      mainRect,
      sideRect,
      summaryRows,
      badges,
      textSample: (modal.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160)
    };
  });
  add(
    'shop card detail modal uses the same main and side rail layout with pricing summary',
    !!shopDetailProbe?.ok,
    JSON.stringify(shopDetailProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'shop-card-detail-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  const shopAdviceProbe = await page.evaluate(() => {
    const summary = document.getElementById('shop-tab-summary');
    const adviceBadge = summary ? summary.querySelector('.shop-advice-badge') : null;
    const adviceText = summary ? summary.querySelector('.shop-advice-text') : null;
    const forecast = summary ? summary.querySelector('.shop-advice-forecast') : null;
    const economyChips = summary ? Array.from(summary.querySelectorAll('.shop-economy-chip')) : [];
    const economyNote = summary ? summary.querySelector('.shop-advice-note') : null;
    const serviceNote = document.querySelector('.service-fit-note');
    return {
      ok:
        !!summary &&
        !!adviceBadge &&
        !!adviceText &&
        !!forecast &&
        economyChips.length >= 3 &&
        !!economyNote &&
        /更适合买卡|更适合买服务|建议留钱/.test(adviceBadge.textContent || '') &&
        /下一批节点/.test(forecast.textContent || '') &&
        economyChips.some((chip) => /储备线/.test(chip.textContent || '')) &&
        economyChips.some((chip) => /建议单次/.test(chip.textContent || '')) &&
        (adviceText.textContent || '').trim().length > 0 &&
        /灵石|消费|预算/.test(economyNote.textContent || '') &&
        !!serviceNote &&
        (serviceNote.textContent || '').trim().length > 0,
      badgeText: (adviceBadge?.textContent || '').trim(),
      adviceText: (adviceText?.textContent || '').replace(/\s+/g, ' ').trim(),
      forecastText: (forecast?.textContent || '').replace(/\s+/g, ' ').trim(),
      economyText: economyChips.map((chip) => (chip.textContent || '').replace(/\s+/g, ' ').trim()),
      economyNote: (economyNote?.textContent || '').replace(/\s+/g, ' ').trim(),
      serviceNote: (serviceNote?.textContent || '').replace(/\s+/g, ' ').trim()
    };
  });
  add(
    'shop summary shows buy card or service guidance with economy reserve cues',
    !!shopAdviceProbe?.ok,
    JSON.stringify(shopAdviceProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'shop-strategy-advice-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  add('no console errors were emitted during meta-screen audit', consoleErrors.length === 0, JSON.stringify(consoleErrors));
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
