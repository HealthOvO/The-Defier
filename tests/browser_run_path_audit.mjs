import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/web-run-path-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

async function safeScreenshot(page, outPath) {
  try {
    await page.screenshot({ path: outPath, fullPage: true, timeout: 10000 });
  } catch (err) {
    console.warn(`[browser_run_path_audit] screenshot skipped: ${err?.message || err}`);
  }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(String(err));
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);

  await page.evaluate(() => {
    ['auth-modal', 'save-slots-modal', 'generic-confirm-modal', 'save-conflict-modal'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });
    if (window.game) {
      game.guestMode = true;
    }
    if (window.game && typeof game.showCharacterSelection === 'function') {
      game.showCharacterSelection();
    }
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    if (!window.game) return;
    game.selectCharacter?.('linFeng');
    game.selectRunPath?.('insight');
  });
  await page.waitForTimeout(300);

  const selectionProbe = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#run-path-selection .run-path-card'));
    const selected = document.querySelector('#run-path-selection .run-path-card.selected');
    return {
      count: cards.length,
      selectedId: selected?.dataset?.runPathId || '',
      summary: document.getElementById('run-path-summary')?.textContent || '',
      cardTexts: cards.map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
    };
  });

  add(
    'character selection shows run path draft and allows explicit selection',
    selectionProbe.count === 3 && selectionProbe.selectedId === 'insight' && /窥命流/.test(selectionProbe.summary),
    JSON.stringify(selectionProbe)
  );

  await safeScreenshot(page, path.join(outDir, 'run-path-selection.png'));

  await page.evaluate(() => {
    if (!window.game) return;
    game.startNewGame?.('linFeng', {
      runDestinyId: 'foldedEdge',
      spiritCompanionId: 'swordWraith',
      runPathId: 'insight'
    });
    game.startRealm?.(1, false);
  });
  await page.waitForTimeout(700);

  const mapProbe = await page.evaluate(() => {
    const tracker = document.getElementById('map-run-path-mission');
    return {
      visible: !!tracker && getComputedStyle(tracker).display !== 'none',
      text: tracker ? tracker.textContent.replace(/\s+/g, ' ').trim() : '',
      payload: typeof window.render_game_to_text === 'function'
        ? JSON.parse(window.render_game_to_text())
        : null
    };
  });

  add(
    'map screen shows run path tracker and render_game_to_text keeps run path state',
    !!mapProbe.visible && /窥命流/.test(mapProbe.text) && mapProbe.payload?.player?.runPath?.id === 'insight',
    JSON.stringify(mapProbe)
  );

  await safeScreenshot(page, path.join(outDir, 'run-path-map.png'));

  await page.evaluate(() => {
    if (!window.game || typeof game.showRunPathMutationSelection !== 'function') return;
    game.showRunPathMutationSelection(6);
  });
  await page.waitForTimeout(250);

  const mutationModalProbe = await page.evaluate(() => {
    const modal = document.getElementById('event-modal');
    const choices = Array.from(document.querySelectorAll('#event-choices .event-choice'));
    return {
      active: !!modal && modal.classList.contains('active'),
      title: document.getElementById('event-title')?.textContent?.trim() || '',
      desc: document.getElementById('event-desc')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      summary: document.getElementById('event-system-summary')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      choices: choices.map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
    };
  });

  add(
    'mid-run path mutation modal opens at chapter break and surfaces three split directions',
    mutationModalProbe.active
      && /命途裂变/.test(mutationModalProbe.title)
      && /极化|转修|献祭/.test(mutationModalProbe.choices.join(' '))
      && mutationModalProbe.choices.length === 3,
    JSON.stringify(mutationModalProbe)
  );

  await safeScreenshot(page, path.join(outDir, 'run-path-mutation-modal.png'));

  const mutationApplyProbe = await page.evaluate(() => {
    if (!window.game || typeof game.applyRunPathMutationSelection !== 'function') return { ok: false, reason: 'no_api' };
    const applied = game.applyRunPathMutationSelection('pivot', 6);
    document.getElementById('event-modal')?.classList.remove('active');
    document.getElementById('reward-modal')?.classList.remove('active');
    game.map?.updateLegacyMissionTracker?.();
    const trackerText = document.getElementById('map-run-path-mission')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    return {
      ok:
        applied?.meta?.name === '借势落子' &&
        /借势落子|落子已成/.test(trackerText) &&
        payload?.player?.runPath?.mutation?.name === '借势落子',
      applied,
      trackerText,
      payload
    };
  });

  add(
    'applying a path mutation rewrites tracker copy and render_game_to_text run path state',
    !!mutationApplyProbe?.ok,
    JSON.stringify(mutationApplyProbe)
  );

  await page.evaluate(() => {
    if (!window.game) return;
    game.showShop?.({ id: 'audit-shop', type: 'shop', row: 1 });
  });
  await page.waitForTimeout(500);

  const shopProbe = await page.evaluate(() => {
    const readServices = () => Array.from(document.querySelectorAll('#shop-services-container .shop-service .service-name'))
      .map((el) => (el.textContent || '').trim());
    const baseServices = readServices();
    window.game?.switchShopTab?.('rumor');
    const rumorServices = readServices();
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    return {
      mode: payload?.mode || '',
      baseServices,
      rumorServices,
      subtitle: document.getElementById('shop-header-subtitle')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      summary: document.getElementById('shop-tab-summary')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    };
  });

  add(
    'shop screen injects run path exclusive services and route rumors',
    shopProbe.mode === 'shop-screen'
      && shopProbe.baseServices.some((name) => /窥盘校谱/.test(name))
      && shopProbe.rumorServices.some((name) => /裂隙观测志/.test(name))
      && /命途/.test(shopProbe.summary || shopProbe.subtitle || ''),
    JSON.stringify(shopProbe)
  );

  await safeScreenshot(page, path.join(outDir, 'run-path-shop.png'));

  await page.evaluate(() => {
    if (!window.game) return;
    game.showTreasureCompendium?.();
  });
  await page.waitForTimeout(400);

  const treasureProbe = await page.evaluate(() => {
    return {
      mode: typeof window.render_game_to_text === 'function'
        ? JSON.parse(window.render_game_to_text()).mode
        : '',
      researchText: document.getElementById('treasure-compendium-research')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      summaryText: document.getElementById('treasure-compendium-summary')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    };
  });

  add(
    'treasure compendium surfaces current run path set recommendation',
    treasureProbe.mode === 'treasure-compendium'
      && /当前命途推荐/.test(treasureProbe.researchText)
      && /窥命流|星衡|五行/.test(treasureProbe.researchText),
    JSON.stringify(treasureProbe)
  );

  await safeScreenshot(page, path.join(outDir, 'run-path-treasure.png'));

  await page.evaluate(() => {
    if (!window.game) return;
    game.startDebugBattle?.(18, 'boss');
  });
  await page.waitForTimeout(800);

  const battleProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const stripItems = payload?.battle?.systemsHud?.stripItems || [];
    const runPathItem = stripItems.find((item) => item && item.id === 'runPath');
    const bossAct = payload?.battle?.bossAct || null;
    const bossPanel = document.getElementById('boss-act-panel');
    const counterChips = Array.from(bossPanel?.querySelectorAll('.boss-act-counter-chip') || []).map((chip) => (chip.textContent || '').trim());
    return {
      mode: payload?.mode || '',
      runPath: payload?.player?.runPath || null,
      runPathItem,
      bossAct,
      counterChips
    };
  });

  add(
    'battle state exposes run path strip item and boss counterplay hint',
    battleProbe.mode === 'battle-screen'
      && battleProbe.runPath?.id === 'insight'
      && battleProbe.runPathItem?.value === '窥命流'
      && /窥命流/.test(battleProbe.bossAct?.runPathCounterplay?.name || '')
      && /终章控尾/.test(battleProbe.bossAct?.runPathCounterplay?.fitLabel || '')
      && /终焉命庭/.test(battleProbe.bossAct?.runPathCounterplay?.chapterCue || '')
      && /多轴|终章/.test(battleProbe.bossAct?.runPathCounterplay?.chapterFocus || '')
      && battleProbe.counterChips.some((chip) => /命途/.test(chip)),
    JSON.stringify(battleProbe)
  );

  await safeScreenshot(page, path.join(outDir, 'run-path-battle.png'));

  const report = {
    url,
    findings,
    consoleErrors,
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  const failed = findings.filter((item) => !item.pass);
  await browser.close();
  if (consoleErrors.length > 0 || failed.length > 0) {
    process.exit(1);
  }
})();
