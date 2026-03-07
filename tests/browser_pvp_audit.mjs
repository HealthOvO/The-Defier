import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/web-pvp-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

async function safeScreenshot(page, outputPath) {
  try {
    await page.screenshot({ path: outputPath, fullPage: true, timeout: 5000 });
  } catch (err) {
    console.warn(`[browser_pvp_audit] screenshot skipped: ${err?.message || err}`);
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
  await page.waitForTimeout(1200);

  const authActive = await page.evaluate(() => !!document.getElementById('auth-modal')?.classList.contains('active'));
  if (authActive) {
    await page.click('#auth-modal .modal-close', { timeout: 3000, force: true }).catch(() => {});
    await page.waitForTimeout(200);
  }

  await page.click('#pvp-btn', { timeout: 5000, force: true });
  await page.waitForTimeout(700);

  const pvpMode = await page.evaluate(() => JSON.parse(window.render_game_to_text()).mode);
  add('pvp screen is reachable', pvpMode === 'pvp-screen', `mode=${pvpMode}`);

  const rankingRows = await page.evaluate(() => document.querySelectorAll('#ranking-list .jade-slip-row').length);
  add('ranking list renders entries in guest/offline mode', rankingRows > 0, `rows=${rankingRows}`);

  await page.click('#tab-ranking .challenge-btn', { timeout: 5000, force: true });
  await page.waitForTimeout(1600);

  const battleProbe = await page.evaluate(() => {
    let mode = null;
    try {
      mode = JSON.parse(window.render_game_to_text()).mode;
    } catch {}
    const enemy = window.game?.battle?.enemies?.[0] || null;
    return {
      mode,
      gameMode: window.game?.mode || null,
      ticket: window.game?.pvpMatchTicket || null,
      isGhost: !!(enemy && enemy.isGhost),
      enemyHp: enemy ? enemy.currentHp : null
    };
  });
  add(
    'guest challenge starts pvp ghost battle',
    battleProbe.mode === 'battle-screen' && battleProbe.gameMode === 'pvp' && !!battleProbe.ticket && battleProbe.isGhost,
    JSON.stringify(battleProbe)
  );

  if (battleProbe.mode === 'battle-screen') {
    await page.evaluate(() => {
      if (!window.game || !game.battle || !Array.isArray(game.battle.enemies) || game.battle.enemies.length === 0) return;
      game.battle.enemies.forEach((e) => { e.currentHp = 0; });
      if (typeof game.battle.checkBattleEnd === 'function') game.battle.checkBattleEnd();
    });
  }

  await page.waitForTimeout(1300);
  const resultProbe = await page.evaluate(() => {
    const overlay = document.getElementById('pvp-result-overlay');
    const score = document.getElementById('pvp-current-score')?.textContent || '';
    const delta = document.getElementById('pvp-score-delta')?.textContent || '';
    return {
      visible: !!overlay && overlay.style.display !== 'none',
      className: overlay ? overlay.className : '',
      score,
      delta
    };
  });
  add(
    'pvp victory settlement overlay appears and shows rating change',
    resultProbe.visible && /victory/.test(resultProbe.className) && /\d/.test(resultProbe.score) && /[+-]?\d+/.test(resultProbe.delta),
    JSON.stringify(resultProbe)
  );

  if (resultProbe.visible) {
    await page.click('#pvp-result-overlay .result-actions .ink-btn-large', { timeout: 5000, force: true });
    await page.waitForTimeout(600);
  }

  const backToPvp = await page.evaluate(() => JSON.parse(window.render_game_to_text()).mode);
  add('closing pvp result returns to pvp screen', backToPvp === 'pvp-screen', `mode=${backToPvp}`);

  await page.click(".rune-tab[onclick*=\"'shop'\"]", { timeout: 5000, force: true });
  await page.waitForTimeout(600);
  const shopBefore = await page.evaluate(() => {
    const wallet = Number(document.getElementById('shop-wallet-amount')?.textContent || 0);
    const cardOverlay = document.querySelector('.talisman-card[data-item-id="secret_manual_2"] .buy-overlay');
    const titleOverlay = document.querySelector('.talisman-card[data-item-id="title_supreme"] .buy-overlay');
    return {
      wallet,
      cardState: cardOverlay?.dataset.state || null,
      titleState: titleOverlay?.dataset.state || null
    };
  });
  add('shop wallet renders current pvp coin balance', Number.isFinite(shopBefore.wallet) && shopBefore.wallet > 0, JSON.stringify(shopBefore));
  add('high-cost title is locked by insufficient coins', shopBefore.titleState === 'insufficient', JSON.stringify(shopBefore));

  const shopAfter = await page.evaluate(() => {
    if (window.PVPScene && typeof window.PVPScene.purchaseShopItem === 'function') {
      window.PVPScene.purchaseShopItem('secret_manual_2');
    }
    const wallet = Number(document.getElementById('shop-wallet-amount')?.textContent || 0);
    const cardOverlay = document.querySelector('.talisman-card[data-item-id="secret_manual_2"] .buy-overlay');
    return {
      wallet,
      cardState: cardOverlay?.dataset.state || null,
      buttonText: cardOverlay?.querySelector('.buy-btn-text')?.textContent || ''
    };
  });
  add(
    'shop purchase deducts coins and updates item ownership state',
    shopAfter.wallet < shopBefore.wallet && (shopAfter.cardState === 'owned' || /已拥有/.test(shopAfter.buttonText)),
    JSON.stringify({ shopBefore, shopAfter })
  );

  const shopMetaProbe = await page.evaluate(() => {
    const rewardText = document.getElementById('shop-reward-status')?.textContent || '';
    const logs = Array.from(document.querySelectorAll('#shop-activity-log .shop-log-item')).map((el) => el.textContent || '');
    return { rewardText, logs };
  });
  add(
    'shop reward preview and transaction log are visible',
    /赛季/.test(shopMetaProbe.rewardText) && /预估/.test(shopMetaProbe.rewardText) && shopMetaProbe.logs.length > 0,
    JSON.stringify(shopMetaProbe)
  );

  const cosmeticProbe = await page.evaluate(() => {
    if (!window.PVPService || !window.PVPScene) return { ok: false, reason: 'services_missing' };
    const snap = window.PVPService.getEconomySnapshot();
    window.PVPService.setEconomySnapshot({
      ...snap,
      coins: 9000,
      totalEarned: Math.max(9000, snap.totalEarned || 0)
    });
    window.PVPScene.loadShop();
    window.PVPScene.purchaseShopItem('skin_void_walker');
    window.PVPScene.purchaseShopItem('title_supreme');
    const titleOverlay = document.querySelector('.talisman-card[data-item-id="title_supreme"] .buy-overlay');
    const skinOverlay = document.querySelector('.talisman-card[data-item-id="skin_void_walker"] .buy-overlay');
    const cosmeticText = document.getElementById('shop-cosmetic-status')?.textContent || '';
    return {
      ok: true,
      state: titleOverlay?.dataset.state || null,
      text: titleOverlay?.querySelector('.buy-btn-text')?.textContent || '',
      skinState: skinOverlay?.dataset.state || null,
      skinText: skinOverlay?.querySelector('.buy-btn-text')?.textContent || '',
      cosmeticText
    };
  });
  add(
    'title cosmetic purchase auto-equips and updates status banner',
    cosmeticProbe.ok
      && (cosmeticProbe.state === 'equipped' || /已佩戴/.test(cosmeticProbe.text))
      && (cosmeticProbe.skinState === 'equipped' || /已佩戴/.test(cosmeticProbe.skinText))
      && /独断万古/.test(cosmeticProbe.cosmeticText)
      && /虚空行者/.test(cosmeticProbe.cosmeticText),
    JSON.stringify(cosmeticProbe)
  );

  const characterTitleProbe = await page.evaluate(() => {
    if (!window.game || typeof window.game.showPlayerInfo !== 'function') return { ok: false, reason: 'game_unavailable' };
    window.game.showPlayerInfo();
    const mode = JSON.parse(window.render_game_to_text()).mode;
    const titleText = document.getElementById('info-char-title')?.textContent || '';
    return { ok: true, mode, titleText };
  });
  add(
    'equipped pvp title is reflected in character info panel',
    characterTitleProbe.ok && characterTitleProbe.mode === 'character-select' && /独断万古/.test(characterTitleProbe.titleText),
    JSON.stringify(characterTitleProbe)
  );

  await page.click('#character-select .back-btn', { timeout: 5000, force: true }).catch(() => {});
  await page.click('#pvp-btn', { timeout: 5000, force: true });
  await page.waitForTimeout(300);

  await page.click(".rune-tab[onclick*=\"'ranking'\"]", { timeout: 5000, force: true });
  await page.waitForTimeout(300);
  await page.click('#tab-ranking .challenge-btn', { timeout: 5000, force: true });
  await page.waitForTimeout(1200);
  const skinBattleProbe = await page.evaluate(() => {
    let mode = null;
    try { mode = JSON.parse(window.render_game_to_text()).mode; } catch {}
    const badgeText = document.querySelector('.player-avatar .player-skin-badge')?.textContent || '';
    const faceClasses = document.getElementById('player-face-display')?.className || '';
    return { mode, badgeText, faceClasses };
  });
  add(
    'equipped skin is visible on battle avatar',
    skinBattleProbe.mode === 'battle-screen' && /虚空行者/.test(skinBattleProbe.badgeText) && /skin-equipped/.test(skinBattleProbe.faceClasses),
    JSON.stringify(skinBattleProbe)
  );
  if (skinBattleProbe.mode === 'battle-screen') {
    await page.evaluate(() => {
      if (!window.game || !game.battle || !Array.isArray(game.battle.enemies)) return;
      game.battle.enemies.forEach((e) => { e.currentHp = 0; });
      if (typeof game.battle.checkBattleEnd === 'function') game.battle.checkBattleEnd();
    });
    await page.waitForTimeout(900);
    await page.click('#pvp-result-overlay .result-actions .ink-btn-large', { timeout: 5000, force: true }).catch(() => {});
    await page.waitForTimeout(350);
  }

  await page.click(".rune-tab[onclick*=\"'defense'\"]", { timeout: 5000, force: true });
  await page.waitForTimeout(500);
  await page.click('#tab-defense .ink-btn-large', { timeout: 5000, force: true });
  await page.waitForTimeout(700);
  const defenseProbe = await page.evaluate(() => {
    const time = document.getElementById('def-time')?.textContent || '';
    const power = document.getElementById('def-power-val')?.textContent || '';
    return { time, power };
  });
  add(
    'defense upload succeeds in offline fallback mode',
    !/无记录/.test(defenseProbe.time) && /\d/.test(defenseProbe.power),
    JSON.stringify(defenseProbe)
  );

  await safeScreenshot(page, path.join(outDir, 'pvp-audit.png'));

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
