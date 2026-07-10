import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/browser-chapter-flow-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
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

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const probe = await page.evaluate(() => {
    if (!window.game) return { ok: false, reason: 'no_game' };
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.player.realm = 18;
    game.unlockedRealms = Array.from({ length: 18 }, (_, index) => index + 1);
    game.showCollection();
    game.switchCollectionSection('chapters');
    game.selectChapterCodexEntry('final_court');

    const detail = document.getElementById('chapter-codex-detail');
    const summary = document.getElementById('chapter-codex-summary');
    const text = (detail?.textContent || '').replace(/\s+/g, ' ').trim();
    const beatCards = detail?.querySelectorAll('.collection-mini-card').length || 0;
    const tags = detail?.querySelectorAll('.collection-tag').length || 0;
    const drillButton = detail?.querySelector('[data-collection-action="apply-chapter-drill-focus"]');
    const drillButtons = Array.from(detail?.querySelectorAll('[data-collection-action="apply-chapter-drill-focus"]') || []);
    const drillModes = drillButtons.map((button) => button.dataset.challengeMode || '');
    const drillButtonTexts = drillButtons.map((button) => button.textContent?.replace(/\s+/g, ' ').trim() || '');

    return {
      ok:
        !!detail &&
        !!summary &&
        /连续叙事线/.test(text) &&
        /终焉回收|终章总回收/.test(text) &&
        !!drillButton &&
        /章节演练|设为/.test(drillButton.textContent || '') &&
        drillButtons.length === 3 &&
        ['daily', 'weekly', 'global'].every((mode) => drillModes.includes(mode)) &&
        drillButtonTexts.some((line) => /今日天机/.test(line)) &&
        drillButtonTexts.some((line) => /七日劫数/.test(line)) &&
        drillButtonTexts.some((line) => /众生试炼/.test(line)) &&
        beatCards >= 3 &&
        tags >= 5,
      text,
      beatCards,
      tags,
      drillButtonText: drillButton?.textContent?.replace(/\s+/g, ' ').trim() || '',
      drillDataset: drillButton ? { ...drillButton.dataset } : null,
      drillModes,
      drillButtonTexts
    };
  });

  add(
    'chapter codex surfaces continuous narrative beats, final worldview recall, and a chapter drill CTA for chapter six',
    !!probe?.ok,
    JSON.stringify(probe || null)
  );

  const drillProbe = await page.evaluate(async () => {
    const gameRef = window.game;
    const detail = document.getElementById('chapter-codex-detail');
    const button = detail?.querySelector('[data-collection-action="apply-chapter-drill-focus"][data-challenge-mode="daily"]');
    if (!gameRef || !button) return { ok: false, reason: !gameRef ? 'missing_game' : 'missing_daily_drill_button' };
    const prototypeShowChallengeHub = Object.getPrototypeOf(gameRef)?.showChallengeHub;
    const originalEnsureChallengeHubLoaded = gameRef.ensureChallengeHubLoaded;
    let originalChallengeHub = gameRef.challengeHub;
    if (!originalChallengeHub && typeof originalEnsureChallengeHubLoaded === 'function') {
      originalChallengeHub = await originalEnsureChallengeHubLoaded.call(gameRef);
    }
    const originalShowChallengeHub = gameRef.showChallengeHub;
    if (typeof prototypeShowChallengeHub !== 'function'
      || typeof originalEnsureChallengeHubLoaded !== 'function'
      || !originalChallengeHub
      || typeof originalChallengeHub.showChallengeHub !== 'function') {
      return { ok: false, reason: 'cold_route_harness_unavailable' };
    }
    const before = {
      currentScreen: gameRef.currentScreen || '',
      section: gameRef.collectionHubState?.section || '',
      selectedChapter: gameRef.selectedChapterCodexId || '',
      dataset: { ...button.dataset },
      text: (button.textContent || '').replace(/\s+/g, ' ').trim()
    };
    let resolveChallengeHubLoad = null;
    const controlledLoad = new Promise(resolve => {
      resolveChallengeHubLoad = resolve;
    });
    gameRef.challengeHub = null;
    gameRef.showChallengeHub = (...args) => prototypeShowChallengeHub.apply(gameRef, args);
    gameRef.ensureChallengeHubLoaded = () => controlledLoad;
    try {
      const coldPrecondition = {
        challengeHubCleared: gameRef.challengeHub === null,
        loaderControlled: gameRef.ensureChallengeHubLoaded() === controlledLoad,
        usingPrototypeRoute: gameRef.showChallengeHub !== originalShowChallengeHub
      };
      button.click();
      const immediate = {
        currentScreen: gameRef.currentScreen || '',
        active: !!document.getElementById('challenge-screen')?.classList.contains('active'),
        loaderStillPending: gameRef.challengeHub === null
      };
      resolveChallengeHubLoad(originalChallengeHub);
      let payload = null;
      let focus = null;
      let focusText = '';
      for (let attempt = 0; attempt < 50; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
        payload = typeof window.render_game_to_text === 'function'
          ? JSON.parse(window.render_game_to_text())
          : null;
        focus = payload?.challenge?.trainingFocus || null;
        focusText = document.querySelector('[data-observatory-training-focus="true"]')?.textContent?.replace(/\s+/g, ' ').trim() || '';
        if (gameRef.currentScreen === 'challenge-screen'
          && gameRef.challengeHubState?.tab === 'daily'
          && focus?.sourceRunId === `chapter_codex:${before.selectedChapter}`
          && focusText.length > 0) {
          break;
        }
      }
      return {
        ok:
          coldPrecondition.challengeHubCleared
          && coldPrecondition.loaderControlled
          && coldPrecondition.usingPrototypeRoute
          && gameRef.currentScreen === 'challenge-screen'
          && gameRef.challengeHubState?.tab === 'daily'
          && immediate.currentScreen === 'challenge-screen'
          && immediate.active
          && immediate.loaderStillPending
          && focus?.sourceRunId === `chapter_codex:${before.selectedChapter}`
          && focus?.guideRecordId === `chapter_codex:${before.selectedChapter}`
          && /终焉|第六章|章节/.test(focus?.chapterName || '')
          && /章节演练|章节复盘|复盘/.test(focus?.trainingAdvice || '')
          && focusText.length > 0
          && /终庭|Boss|生态|天象|地脉/.test(focusText)
          && (focus?.trainingTags || []).length >= 3,
        before,
        coldPrecondition,
        immediate,
        after: {
          currentScreen: gameRef.currentScreen || '',
          tab: gameRef.challengeHubState?.tab || '',
          focus,
          focusText
        }
      };
    } finally {
      gameRef.ensureChallengeHubLoaded = originalEnsureChallengeHubLoaded;
      gameRef.showChallengeHub = originalShowChallengeHub;
      gameRef.challengeHub = originalChallengeHub;
    }
  });

  add(
    'chapter drill CTA stores a chapter training focus and opens daily challenge hub',
    !!drillProbe?.ok,
    JSON.stringify(drillProbe || null)
  );

  const laneProbe = await page.evaluate(async () => {
    if (!window.game) return { ok: false, reason: 'no_game' };
    const results = [];
    for (const mode of ['weekly', 'global']) {
      game.showCollection();
      game.switchCollectionSection('chapters');
      game.selectChapterCodexEntry('final_court');
      const detail = document.getElementById('chapter-codex-detail');
      const button = detail?.querySelector(`[data-collection-action="apply-chapter-drill-focus"][data-challenge-mode="${mode}"]`);
      if (!button) {
        results.push({ mode, ok: false, reason: 'missing_mode_button' });
        continue;
      }
      button.click();
      await new Promise(resolve => setTimeout(resolve, 450));
      const payload = typeof window.render_game_to_text === 'function'
        ? JSON.parse(window.render_game_to_text())
        : null;
      const focus = payload?.challenge?.trainingFocus || null;
      results.push({
        mode,
        ok:
          window.game?.currentScreen === 'challenge-screen'
          && window.game?.challengeHubState?.tab === mode
          && focus?.sourceRunId === 'chapter_codex:final_court'
          && focus?.guideRecordId === 'chapter_codex:final_court'
          && /章节演练|章节复盘|复盘/.test(focus?.trainingAdvice || ''),
        tab: window.game?.challengeHubState?.tab || '',
        focus,
        buttonText: button.textContent?.replace(/\s+/g, ' ').trim() || ''
      });
    }
    return {
      ok: results.length === 2 && results.every((entry) => entry.ok),
      results
    };
  });

  add(
    'chapter drill mode buttons can route the same chapter focus into weekly and global challenge hubs',
    !!laneProbe?.ok,
    JSON.stringify(laneProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'chapter-codex-final.png'), 'browser_chapter_flow_audit', { timeout: 8000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    if (!window.game) return;
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.player.realm = 18;
    game.unlockedRealms = Array.from({ length: 18 }, (_, index) => index + 1);
    game.showCollection();
    game.switchCollectionSection('chapters');
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.waitForTimeout(450);

  const mobileQuickActionProbe = await page.evaluate(() => {
    const text = (value) => (value?.textContent || '').replace(/\s+/g, ' ').trim();
    const rectOf = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    };
    const quickAction = document.getElementById('chapter-codex-quick-action');
    const buttons = Array.from(quickAction?.querySelectorAll('[data-chapter-quick-action="true"]') || []);
    const hitTests = buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
      const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
      const hit = document.elementFromPoint(x, y);
      return {
        label: text(button),
        rect: rectOf(button),
        ok: !!hit && (hit === button || button.contains(hit))
      };
    });
    return {
      currentScreen: window.game?.currentScreen || '',
      section: window.game?.collectionHubState?.section || '',
      selectedChapterId: window.game?.selectedChapterCodexId || '',
      quickActionText: text(quickAction),
      quickActionRect: rectOf(quickAction),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      buttons: hitTests
    };
  });

  add(
    'chapter mobile quick action stays in the first viewport and keeps all three drill buttons hit-testable',
    !!mobileQuickActionProbe &&
      mobileQuickActionProbe.currentScreen === 'collection' &&
      mobileQuickActionProbe.section === 'chapters' &&
      !!mobileQuickActionProbe.quickActionRect &&
      mobileQuickActionProbe.quickActionRect.top >= 0 &&
      mobileQuickActionProbe.quickActionRect.bottom <= mobileQuickActionProbe.viewport.height &&
      Array.isArray(mobileQuickActionProbe.buttons) &&
      mobileQuickActionProbe.buttons.length === 3 &&
      mobileQuickActionProbe.buttons.every((entry) => entry.ok),
    JSON.stringify(mobileQuickActionProbe || null)
  );

  const mobileSecondChapterProbe = await page.evaluate(async () => {
    const text = (value) => (value?.textContent || '').replace(/\s+/g, ' ').trim();
    const rectOf = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    };
    const cards = Array.from(document.querySelectorAll('#chapter-codex-grid [data-collection-target="chapter"]'));
    const secondCard = cards[1] || null;
    const secondChapterLabel = secondCard ? text(secondCard.querySelector('h4')) : '';
    if (!secondCard) {
      return { ok: false, reason: 'missing_second_chapter_card', cardCount: cards.length };
    }
    const scrollContainer = document.getElementById('collection');
    const scrollBefore = scrollContainer?.scrollTop || window.scrollY;
    secondCard.click();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const quickAction = document.getElementById('chapter-codex-quick-action');
    const todayButton = quickAction?.querySelector('[data-chapter-quick-action="true"][data-challenge-mode="daily"]') || null;
    const quickActionLabel = text(quickAction?.querySelector('strong'));
    return {
      ok:
        window.game?.selectedChapterCodexId === secondCard.dataset.entryId &&
        quickActionLabel === secondChapterLabel &&
        !!quickAction &&
        !!todayButton &&
        Math.abs((scrollContainer?.scrollTop || window.scrollY) - scrollBefore) <= 2 &&
        document.activeElement !== todayButton &&
        /今日天机/.test(text(todayButton)),
      selectedChapterId: window.game?.selectedChapterCodexId || '',
      expectedChapterId: secondCard.dataset.entryId || '',
      secondChapterLabel,
      quickActionLabel,
      quickActionRect: rectOf(quickAction),
      todayButtonText: text(todayButton),
      todayButtonRect: rectOf(todayButton),
      activeElementText: text(document.activeElement),
      scrollBefore,
      scrollAfter: scrollContainer?.scrollTop || window.scrollY,
      viewport: { width: window.innerWidth, height: window.innerHeight }
    };
  });

  add(
    'chapter mobile selection updates the quick action without stealing focus or changing scroll position',
    !!mobileSecondChapterProbe?.ok,
    JSON.stringify(mobileSecondChapterProbe || null)
  );

  await safeAuditScreenshot(page, path.join(outDir, 'chapter-codex-mobile-quick-action.png'), 'browser_chapter_flow_audit', { timeout: 8000 });

  await page.evaluate(() => {
    const quickAction = document.getElementById('chapter-codex-quick-action');
    const button = quickAction?.querySelector('[data-chapter-quick-action="true"][data-challenge-mode="daily"]');
    if (button instanceof HTMLElement) button.click();
  });
  await page.waitForFunction(() => {
    const dailyTab = document.querySelector('#challenge-screen [data-challenge-tab="daily"]');
    return window.game?.currentScreen === 'challenge-screen'
      && window.game?.challengeHubState?.tab === 'daily'
      && dailyTab?.classList.contains('active');
  }, { timeout: 8000 });

  const mobileDailyChallengeProbe = await page.evaluate(() => {
    const text = (value) => (value?.textContent || '').replace(/\s+/g, ' ').trim();
    const dailyTab = document.querySelector('#challenge-screen [data-challenge-tab="daily"]');
    return {
      currentScreen: window.game?.currentScreen || '',
      challengeTab: window.game?.challengeHubState?.tab || '',
      challengeScreenActive: document.getElementById('challenge-screen')?.classList.contains('active') || false,
      title: text(document.getElementById('challenge-hub-title')),
      dailyTabText: text(dailyTab),
      dailyTabActive: dailyTab?.classList.contains('active') || false
    };
  });

  add(
    'chapter mobile daily drill opens challenge screen with the daily tab active',
    !!mobileDailyChallengeProbe &&
      mobileDailyChallengeProbe.currentScreen === 'challenge-screen' &&
      mobileDailyChallengeProbe.challengeTab === 'daily' &&
      mobileDailyChallengeProbe.challengeScreenActive &&
      mobileDailyChallengeProbe.dailyTabActive &&
      /今日天机/.test(mobileDailyChallengeProbe.title || mobileDailyChallengeProbe.dailyTabText || ''),
    JSON.stringify(mobileDailyChallengeProbe || null)
  );

  await safeAuditScreenshot(page, path.join(outDir, 'chapter-codex-mobile-daily.png'), 'browser_chapter_flow_audit', { timeout: 8000 });

  add('no console errors were emitted during chapter flow audit', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  const failed = findings.filter((item) => !item.pass);
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ url, findings, consoleErrors }, null, 2));
  if (failed.length > 0) {
    failed.forEach((item) => console.error(`FAIL: ${item.name}\n${item.detail}`));
    process.exitCode = 1;
  } else {
    console.log('browser_chapter_flow_audit passed');
  }

  await browser.close();
})();
