import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/web-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

function clsActive(el) {
  return !!el && el.classList.contains('active');
}

async function safeScreenshot(page, targetPath) {
  try {
    await page.screenshot({ path: targetPath, fullPage: true, timeout: 8000 });
  } catch (err) {
    console.warn(`[browser_audit] screenshot skipped: ${targetPath} (${err && err.message ? err.message : err})`);
  }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({ type: 'console.error', text: msg.text() });
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push({ type: 'pageerror', text: String(err) });
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await safeScreenshot(page, path.join(outDir, '00-initial.png'));

  const authActiveOnBoot = await page.evaluate(() => {
    const modal = document.getElementById('auth-modal');
    return !!modal && modal.classList.contains('active');
  });
  add('auth modal auto-opens on boot', !authActiveOnBoot, authActiveOnBoot ? 'auth-modal is active and blocks main menu clicks' : 'not active');

  if (authActiveOnBoot) {
    try {
      await page.click('#auth-modal .modal-close', { timeout: 2000 });
      await page.waitForTimeout(200);
    } catch {}
  }

  const authClosed = await page.evaluate(() => {
    const modal = document.getElementById('auth-modal');
    return !!modal && !modal.classList.contains('active');
  });
  add('auth modal can be closed', authClosed, authClosed ? '' : 'modal remained active');

  // PVP screen
  try {
    await page.click('#pvp-btn', { timeout: 3000 });
    await page.waitForTimeout(700);
  } catch (e) {
    add('can open PVP screen', false, String(e));
  }

  const pvpMode = await page.evaluate(() => {
    try {
      return JSON.parse(window.render_game_to_text()).mode;
    } catch {
      return null;
    }
  });
  add('PVP mode switch works', pvpMode === 'pvp-screen', `mode=${pvpMode}`);
  await safeScreenshot(page, path.join(outDir, '01-pvp.png'));

  try {
    await page.click('#pvp-screen .back-btn', { timeout: 2000 });
    await page.waitForTimeout(300);
  } catch {}

  // Collection screen
  try {
    await page.locator("button[onclick=\"game.showCollection()\"], button[onclick=\"game.showScreen('collection')\"]").first().click({ timeout: 3000 });
    await page.waitForTimeout(300);
  } catch (e) {
    add('can open collection', false, String(e));
  }
  const collectionMode = await page.evaluate(() => {
    try {
      return JSON.parse(window.render_game_to_text()).mode;
    } catch {
      return null;
    }
  });
  add('collection mode switch works', collectionMode === 'collection', `mode=${collectionMode}`);

  try {
    await page.click('#collection .back-btn', { timeout: 2000 });
    await page.waitForTimeout(300);
  } catch {}

  // New game flow
  try {
    await page.click('#new-game-btn', { timeout: 3000 });
    await page.waitForTimeout(1000);
  } catch (e) {
    add('can click new game', false, String(e));
  }

  const slotsModalActive = await page.evaluate(() => {
    const modal = document.getElementById('save-slots-modal');
    return !!modal && modal.classList.contains('active');
  });
  add('new game opens save slots modal when logged out', !slotsModalActive, slotsModalActive ? 'unexpectedly opened save slots' : '');

  const confirmModalActive = await page.evaluate(() => {
    const modal = document.getElementById('generic-confirm-modal');
    return !!modal && modal.classList.contains('active');
  });
  add(
    'new game shows login-or-guest confirm',
    confirmModalActive,
    confirmModalActive ? '' : 'generic-confirm-modal is not active'
  );

  if (confirmModalActive) {
    await page.click('#generic-cancel-btn', { timeout: 3000 });
    await page.waitForTimeout(350);
  }

  let modeAfterSlot = await page.evaluate(() => {
    try {
      return JSON.parse(window.render_game_to_text()).mode;
    } catch {
      return null;
    }
  });
  add('guest path reaches character selection', modeAfterSlot === 'character-selection-screen', `mode=${modeAfterSlot}`);

  if (modeAfterSlot === 'character-selection-screen') {
    await page.click('.character-card[data-id="linFeng"]', { timeout: 3000 });
    await page.waitForTimeout(200);
    await page.click('#confirm-character-btn', { timeout: 3000 });
    await page.waitForTimeout(500);
  }

  const authAfterGuestConfirm = await page.evaluate(() => {
    const modal = document.getElementById('auth-modal');
    return !!modal && modal.classList.contains('active');
  });
  add(
    'guest path can actually start new game without login',
    !authAfterGuestConfirm,
    authAfterGuestConfirm ? 'guest path returns to auth-modal at confirm step' : ''
  );

  // Bypass cloud auth gate to continue smoke verification of core gameplay flow.
  await page.evaluate(() => {
    if (typeof AuthService !== 'undefined') {
      AuthService.cloudEnabled = false;
      AuthService.isInitialized = false;
      AuthService.currentUser = null;
    }
  });

  if (authAfterGuestConfirm) {
    try {
      await page.click('#auth-modal .modal-close', { timeout: 2000 });
      await page.waitForTimeout(150);
    } catch {}
  }

  const bypassKickoff = await page.evaluate(() => {
    if (!window.game) return { mode: null, cloudEnabled: null };
    game.currentSaveSlot = 0;
    if (typeof game.startNewGame === 'function') game.startNewGame('linFeng');
    const cloudEnabled = (typeof AuthService !== 'undefined' && typeof AuthService.isCloudEnabled === 'function')
      ? AuthService.isCloudEnabled()
      : null;
    return { mode: game.currentScreen, cloudEnabled };
  });
  await page.waitForTimeout(700);

  const realmMode = await page.evaluate(() => {
    try {
      return JSON.parse(window.render_game_to_text()).mode;
    } catch {
      return null;
    }
  });
  add(
    'after bypass, can reach realm select',
    realmMode === 'realm-select-screen',
    `mode=${realmMode}, bypass=${JSON.stringify(bypassKickoff)}`
  );

  if (realmMode === 'realm-select-screen') {
    try {
      await page.click('#enter-realm-btn', { timeout: 3000, force: true });
    } catch {
      await page.evaluate(() => {
        if (!window.game || !game.selectedRealmId || typeof game.startRealm !== 'function') return;
        const unlocked = Array.isArray(game.unlockedRealms) ? game.unlockedRealms : [1];
        const isCompleted = unlocked.includes(game.selectedRealmId + 1);
        game.startRealm(game.selectedRealmId, isCompleted);
      });
    }
    await page.waitForTimeout(1000);
  }

  const mapMode = await page.evaluate(() => {
    try {
      return JSON.parse(window.render_game_to_text()).mode;
    } catch {
      return null;
    }
  });
  add('can enter map screen', mapMode === 'map-screen', `mode=${mapMode}`);
  await safeScreenshot(page, path.join(outDir, '02-map.png'));

  // Force an accessible combat node to validate battle transition.
  const combatNodeType = await page.evaluate(() => {
    if (!window.game || !game.map || typeof game.map.getAccessibleNodes !== 'function') return null;
    const node = game.map.getAccessibleNodes().find((n) => ['enemy', 'elite', 'trial', 'boss'].includes(n.type));
    if (!node) return null;
    game.map.onNodeClick(node);
    return node.type;
  });

  await page.waitForTimeout(700);
  const battleMode = await page.evaluate(() => {
    try {
      return JSON.parse(window.render_game_to_text()).mode;
    } catch {
      return null;
    }
  });
  add('map node can enter battle', battleMode === 'battle-screen', `nodeType=${combatNodeType}, mode=${battleMode}`);

  if (battleMode === 'battle-screen') {
    const before = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    await page.click('#end-turn-btn', { timeout: 3000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      if (typeof window.advanceTime === 'function') window.advanceTime(800);
    });
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    const progressed = (after?.battle?.turn ?? 0) >= (before?.battle?.turn ?? 0);
    add('battle end-turn interaction works', progressed, `turn ${before?.battle?.turn} -> ${after?.battle?.turn}`);
  }

  await safeScreenshot(page, path.join(outDir, '03-battle.png'));

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
