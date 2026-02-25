import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/web-inheritance-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
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

  await page.addInitScript(() => {
    try {
      localStorage.setItem('theDefierLegacyV1', JSON.stringify({
        essence: 40,
        spent: 0,
        upgrades: {},
        lastPreset: null
      }));
    } catch {}
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, '00-main-menu.png'), fullPage: true });

  // Open inheritance screen
  await page.click('button[onclick="game.showLegacyScreen()"]', { timeout: 5000, force: true });
  await page.waitForTimeout(350);
  const inheritanceMode = await page.evaluate(() => JSON.parse(window.render_game_to_text()).mode);
  add('inheritance screen is reachable', inheritanceMode === 'inheritance-screen', `mode=${inheritanceMode}`);

  const before = await page.evaluate(() => JSON.parse(window.render_game_to_text()).legacy);
  add('legacy starts with unspent essence', (before?.unspent || 0) >= 40, JSON.stringify(before));

  // Apply smith preset
  await page.click('.inheritance-preset-btn:nth-child(2)', { timeout: 5000, force: true });
  await page.waitForTimeout(250);
  const confirmVisible = await page.locator('#generic-confirm-modal.active #generic-confirm-btn').isVisible().catch(() => false);
  add('preset apply opens confirm modal', confirmVisible, '');
  if (confirmVisible) {
    await page.click('#generic-confirm-btn', { timeout: 3000, force: true });
    await page.waitForTimeout(450);
  }

  const after = await page.evaluate(() => JSON.parse(window.render_game_to_text()).legacy);
  add('preset spends essence', (after?.unspent || 0) < (before?.unspent || 0), `before=${before?.unspent}, after=${after?.unspent}`);
  add('preset allocates upgrades', Object.values(after?.upgrades || {}).some((v) => Number(v) > 0), JSON.stringify(after?.upgrades || {}));

  const localPresetState = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('theDefierLegacyV1');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  add('preset id persisted to local storage', localPresetState?.lastPreset === 'smith', JSON.stringify(localPresetState));

  // Start a new game and verify bonuses are applied to player runtime state
  const newRun = await page.evaluate(() => {
    if (!window.game) return null;
    game.guestMode = true; // never block on auth in automated checks
    game.startNewGame('linFeng');
    const baseForge = 55 + game.player.realm * 9;
    const discount = Math.min(0.35, game.player.legacyBonuses?.forgeCostDiscount || 0);
    const discountedForge = Math.max(20, Math.floor(baseForge * (1 - discount)));
    return {
      mode: game.currentScreen,
      hp: game.player.currentHp,
      maxHp: game.player.maxHp,
      gold: game.player.gold,
      legacyBonuses: game.player.legacyBonuses,
      baseForge,
      discountedForge
    };
  });
  add('new run starts after preset allocation', newRun?.mode === 'realm-select-screen', JSON.stringify(newRun));
  add('new run receives legacy gold bonus', (newRun?.gold || 0) > 100, `gold=${newRun?.gold}`);
  add('new run receives legacy hp bonus', (newRun?.maxHp || 0) > 80, `maxHp=${newRun?.maxHp}`);
  add('forge discount is active in runtime', (newRun?.discountedForge || 999) < (newRun?.baseForge || 0), `base=${newRun?.baseForge}, discount=${newRun?.discountedForge}`);

  // Enter map and verify mission tracker is visible outside battle
  const mapProbe = await page.evaluate(() => {
    if (!window.game || typeof game.startRealm !== 'function') return null;
    game.startRealm(1, false);
    const panel = document.getElementById('map-legacy-mission');
    const desc = panel ? (panel.querySelector('.mission-desc')?.textContent || '') : '';
    return {
      mode: game.currentScreen,
      visible: !!panel && panel.style.display !== 'none',
      desc
    };
  });
  add('map screen shows legacy mission tracker', mapProbe?.mode === 'map-screen' && !!mapProbe?.visible, JSON.stringify(mapProbe || null));
  add('smith mission description is shown on map tracker', /锻炉/.test(mapProbe?.desc || ''), mapProbe?.desc || '');

  // Verify run mission wiring + reward payout
  const missionProbe = await page.evaluate(() => {
    if (!window.game) return null;
    const beforeEssence = game.legacyProgress?.essence || 0;
    const missionBefore = game.player?.legacyRunMission || null;
    if (typeof game.handleLegacyMissionProgress === 'function') {
      game.handleLegacyMissionProgress('forgeComplete', 1);
    }
    const afterEssence = game.legacyProgress?.essence || 0;
    const missionAfter = game.player?.legacyRunMission || null;
    return { beforeEssence, afterEssence, missionBefore, missionAfter };
  });
  add(
    'preset mission exists on new run',
    !!missionProbe?.missionBefore && missionProbe.missionBefore.eventType === 'forgeComplete',
    JSON.stringify(missionProbe?.missionBefore || null)
  );
  add(
    'preset mission can complete and grant essence',
    (missionProbe?.afterEssence || 0) > (missionProbe?.beforeEssence || 0) && !!missionProbe?.missionAfter?.completed,
    JSON.stringify(missionProbe || null)
  );

  await page.screenshot({ path: path.join(outDir, '01-inheritance-after-preset.png'), fullPage: true });

  const report = {
    url,
    findings,
    consoleErrors,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
})();
