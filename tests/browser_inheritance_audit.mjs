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

async function safeScreenshot(page, outPath) {
  try {
    await page.screenshot({ path: outPath, fullPage: true, timeout: 5000 });
  } catch (err) {
    console.warn(`[browser_inheritance_audit] screenshot skipped: ${err?.message || err}`);
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
  await safeScreenshot(page, path.join(outDir, '00-main-menu.png'));

  // Open inheritance screen
  await page.click('button[onclick="game.showLegacyScreen()"]', { timeout: 5000, force: true });
  await page.waitForTimeout(350);
  const inheritanceMode = await page.evaluate(() => JSON.parse(window.render_game_to_text()).mode);
  add('inheritance screen is reachable', inheritanceMode === 'inheritance-screen', `mode=${inheritanceMode}`);

  const entropyPresetVisible = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('.inheritance-preset-btn .name'));
    return buttons.some((el) => (el.textContent || '').includes('湮律流'));
  });
  add('entropy preset is visible on inheritance screen', entropyPresetVisible, '');
  const bulwarkPresetVisible = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('.inheritance-preset-btn .name'));
    return buttons.some((el) => (el.textContent || '').includes('玄甲流'));
  });
  add('bulwark preset is visible on inheritance screen', bulwarkPresetVisible, '');
  const stormcraftPresetVisible = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('.inheritance-preset-btn .name'));
    return buttons.some((el) => (el.textContent || '').includes('霆策流'));
  });
  add('stormcraft preset is visible on inheritance screen', stormcraftPresetVisible, '');
  const vitalweavePresetVisible = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('.inheritance-preset-btn .name'));
    return buttons.some((el) => (el.textContent || '').includes('回脉流'));
  });
  add('vitalweave preset is visible on inheritance screen', vitalweavePresetVisible, '');

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

  // Apply secondary preset via right-click (new dual-doctrine flow)
  await page.click('.inheritance-preset-btn:nth-child(3)', { timeout: 5000, force: true, button: 'right' });
  await page.waitForTimeout(250);
  const secondaryConfirmVisible = await page.locator('#generic-confirm-modal.active #generic-confirm-btn').isVisible().catch(() => false);
  add('secondary preset apply opens confirm modal on right-click', secondaryConfirmVisible, '');
  if (secondaryConfirmVisible) {
    await page.click('#generic-confirm-btn', { timeout: 3000, force: true });
    await page.waitForTimeout(450);
  }

  const afterSecondary = await page.evaluate(() => JSON.parse(window.render_game_to_text()).legacy);
  add('secondary preset persists after apply', afterSecondary?.secondaryPreset === 'tempo', JSON.stringify(afterSecondary || null));

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

  const entropyMissionProbe = await page.evaluate(() => {
    if (!window.game || typeof game.getLegacyMissionForPreset !== 'function') return null;
    return game.getLegacyMissionForPreset('entropy');
  });
  add(
    'entropy preset mission mapping is available',
    entropyMissionProbe?.eventType === 'entropyDiscardProc' && entropyMissionProbe?.target === 4,
    JSON.stringify(entropyMissionProbe || null)
  );
  const bulwarkMissionProbe = await page.evaluate(() => {
    if (!window.game || typeof game.getLegacyMissionForPreset !== 'function') return null;
    return game.getLegacyMissionForPreset('bulwark');
  });
  add(
    'bulwark preset mission mapping is available',
    bulwarkMissionProbe?.eventType === 'bulwarkBlockProc' && bulwarkMissionProbe?.target === 4,
    JSON.stringify(bulwarkMissionProbe || null)
  );
  const stormcraftMissionProbe = await page.evaluate(() => {
    if (!window.game || typeof game.getLegacyMissionForPreset !== 'function') return null;
    return game.getLegacyMissionForPreset('stormcraft');
  });
  add(
    'stormcraft preset mission mapping is available',
    stormcraftMissionProbe?.eventType === 'stormcraftVulnerableProc' && stormcraftMissionProbe?.target === 4,
    JSON.stringify(stormcraftMissionProbe || null)
  );
  const vitalweaveMissionProbe = await page.evaluate(() => {
    if (!window.game || typeof game.getLegacyMissionForPreset !== 'function') return null;
    return game.getLegacyMissionForPreset('vitalweave');
  });
  add(
    'vitalweave preset mission mapping is available',
    vitalweaveMissionProbe?.eventType === 'vitalweaveHealProc' && vitalweaveMissionProbe?.target === 4,
    JSON.stringify(vitalweaveMissionProbe || null)
  );

  await safeScreenshot(page, path.join(outDir, '01-inheritance-after-preset.png'));

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
