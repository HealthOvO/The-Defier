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
  const mainMenuProbe = await page.evaluate(() => {
    const shell = document.querySelector('#main-menu .menu-content');
    const cards = document.querySelectorAll('#main-menu .menu-oracle-card');
    const utilities = document.querySelectorAll('#main-menu .util-btn-wrapper');
    if (!shell || cards.length < 3 || utilities.length < 6) return { ok: false, reason: 'missing_main_menu_nodes' };
    const rect = shell.getBoundingClientRect();
    return {
      ok:
        rect.left >= 12 &&
        rect.right <= window.innerWidth - 12 &&
        rect.top >= 8 &&
        rect.bottom <= window.innerHeight - 8 &&
        document.documentElement.scrollWidth <= window.innerWidth + 2,
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
    };
  });
  add('main menu shell stays centered and keeps overview cards visible', !!mainMenuProbe?.ok, JSON.stringify(mainMenuProbe || null));
  await captureScreenshot(page, '01-main-menu.png');

  await boot(page);
  const characterProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showCharacterSelection !== 'function') return { ok: false, reason: 'no_game' };
    game.guestMode = true;
    game.showCharacterSelection();
    const container = document.getElementById('character-selection-container');
    const cards = document.querySelectorAll('.character-card');
    const destiny = document.getElementById('run-destiny-selection');
    if (!container || cards.length < 4 || !destiny) return { ok: false, reason: 'missing_character_nodes' };
    const rect = container.getBoundingClientRect();
    return {
      ok:
        rect.left >= 8 &&
        rect.right <= window.innerWidth - 8 &&
        rect.bottom <= window.innerHeight - 8 &&
        document.documentElement.scrollWidth <= window.innerWidth + 2,
      cardCount: cards.length,
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
  add('character selection fits inside a single readable shell', !!characterProbe?.ok, JSON.stringify(characterProbe || null));
  await captureScreenshot(page, '02-character-selection.png');

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
    if (!shell || !main || !side) return { ok: false, reason: 'missing_collection_nodes' };
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
  add('law codex sits inside a unified dual-column shell', !!collectionProbe?.ok, JSON.stringify(collectionProbe || null));
  await captureScreenshot(page, '05-law-codex.png');

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

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
