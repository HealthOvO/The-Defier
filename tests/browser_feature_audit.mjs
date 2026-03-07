import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/web-feature-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

async function safeScreenshot(page, outPath) {
  try {
    await page.screenshot({ path: outPath, fullPage: true, timeout: 5000 });
  } catch (err) {
    console.warn(`[browser_feature_audit] screenshot skipped: ${err?.message || err}`);
  }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(String(err));
  });

  await page.addInitScript(() => {
    try {
      localStorage.removeItem('theDefierGuideStateV1');
      localStorage.setItem('theDefierLegacyV1', JSON.stringify({
        essence: 40,
        spent: 0,
        upgrades: {},
        lastPreset: 'tempo'
      }));
    } catch {}
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);

  await page.evaluate(() => {
    ['auth-modal', 'save-slots-modal', 'generic-confirm-modal', 'save-conflict-modal'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });
    if (window.game && typeof game.showScreen === 'function') game.showScreen('main-menu');
  });
  await page.waitForTimeout(250);

  const mainHint = await page.evaluate(() => {
    const el = document.getElementById('battle-log');
    return el ? (el.textContent || '') : '';
  });
  add('main menu onboarding hint appears on first load', /新手提示/.test(mainHint), mainHint);

  // New game guest path to battle
  await page.click('#new-game-btn', { timeout: 5000, force: true });
  await page.waitForTimeout(300);
  const canCancelGuestPrompt = await page.locator('#generic-confirm-modal.active #generic-cancel-btn').isVisible().catch(() => false);
  if (canCancelGuestPrompt) {
    await page.click('#generic-cancel-btn', { timeout: 3000, force: true });
  }
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    if (!window.game) return;
    if (game.currentScreen !== 'character-selection-screen' && typeof game.showCharacterSelection === 'function') {
      game.showCharacterSelection();
    }
    if (typeof game.selectCharacter === 'function') game.selectCharacter('linFeng');
    if (typeof game.confirmCharacterSelection === 'function') game.confirmCharacterSelection();
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    if (window.game && typeof game.startRealm === 'function') {
      game.startRealm(1, false);
    }
  });
  await page.waitForTimeout(800);

  await page.evaluate(() => {
    const node = game?.map?.getAccessibleNodes?.().find((n) => ['enemy', 'elite', 'trial', 'boss'].includes(n.type));
    if (node) game.map.onNodeClick(node);
  });
  await page.waitForTimeout(1000);

  const battleMode = await page.evaluate(() => {
    try {
      return JSON.parse(window.render_game_to_text()).mode;
    } catch {
      return null;
    }
  });
  add('battle is reachable for guide validation', battleMode === 'battle-screen', `mode=${battleMode}`);

  const battleHint = await page.evaluate(() => {
    const el = document.getElementById('battle-log');
    return el ? (el.textContent || '') : '';
  });
  const battleGuideFlag = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('theDefierGuideStateV1');
      const parsed = raw ? JSON.parse(raw) : {};
      return !!parsed.firstBattleGuideSeen;
    } catch {
      return false;
    }
  });
  add('first battle guide flow executed', battleGuideFlag, battleHint);

  const missionPanelVisible = await page.evaluate(() => {
    const panel = document.getElementById('legacy-mission-tracker');
    if (!panel || panel.style.display === 'none') return false;
    const title = document.getElementById('legacy-mission-title');
    return !!title && (title.textContent || '').includes('疾势试炼');
  });
  add('legacy mission panel is visible in battle', missionPanelVisible, missionPanelVisible ? '' : 'mission panel missing');

  const missionProgressProbe = await page.evaluate(() => {
    if (!window.game || typeof game.handleLegacyMissionProgress !== 'function') return null;
    game.handleLegacyMissionProgress('tempoFirstStrike', 1);
    const mission = game.player?.legacyRunMission || null;
    const text = (document.getElementById('legacy-mission-progress-text')?.textContent || '').trim();
    return {
      mission,
      text
    };
  });
  add(
    'legacy mission progress updates on runtime event',
    Number(missionProgressProbe?.mission?.progress || 0) >= 1 && /1\/3/.test(missionProgressProbe?.text || ''),
    JSON.stringify(missionProgressProbe || null)
  );

  // Toggle panel with hotkey
  await page.keyboard.press('KeyL');
  await page.waitForTimeout(250);

  const panelOpen = await page.evaluate(() => {
    const panel = document.getElementById('battle-log-panel');
    return !!panel && panel.classList.contains('active');
  });
  add('battle log panel opens with L hotkey', panelOpen, panelOpen ? '' : 'panel not active');

  const panelHasEntries = await page.evaluate(() => {
    return document.querySelectorAll('#battle-log-panel-list .battle-log-item').length > 0;
  });
  add('log history panel contains entries', panelHasEntries, panelHasEntries ? '' : 'no history items');

  const hasGuideEntry = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#battle-log-panel-list .battle-log-item-text')).some((el) =>
      (el.textContent || '').includes('新手提示')
    );
  });
  add('log history keeps onboarding tips', hasGuideEntry, hasGuideEntry ? '' : 'guide text not found in history');

  await page.click('.log-filter-btn[data-filter=\"system\"]', { timeout: 3000, force: true });
  await page.waitForTimeout(200);
  const systemFilterApplied = await page.evaluate(() => {
    const active = document.querySelector('.log-filter-btn.active');
    return active ? active.dataset.filter : '';
  });
  add('log filter switch works', systemFilterApplied === 'system', `active=${systemFilterApplied}`);

  const guardBreakIntentVisible = await page.evaluate(() => {
    if (!window.game || !game.battle) return { ok: false, reason: 'no_battle' };
    if (game.player) game.player.block = 0;
    const enemy = {
      id: 'audit_sunder',
      name: '试作破盾精英',
      icon: '🪓',
      currentHp: 66,
      maxHp: 66,
      block: 0,
      buffs: { guardBreak: 1 },
      patterns: [{ type: 'attack', value: 9, intent: '⚔️' }],
      currentPatternIndex: 0,
      isElite: true,
      eliteType: 'sunder'
    };
    game.battle.enemies = [enemy];
    if (typeof game.battle.updateEnemiesUI === 'function') {
      game.battle.updateEnemiesUI();
    }
    const tag = document.querySelector('.enemy .enemy-intent .intent-tag.breaker');
    const intent = document.querySelector('.enemy .enemy-intent');
    const tooltipBind = intent ? (intent.getAttribute('onmouseenter') || '') : '';
    return {
      ok: !!tag && /破盾/.test(tag.textContent || '') && !!intent && intent.classList.contains('breaker'),
      tagText: tag ? (tag.textContent || '').trim() : '',
      className: intent ? intent.className : '',
      tooltipBind
    };
  });
  add(
    'sunder elite intent shows guardbreak tag',
    !!guardBreakIntentVisible?.ok,
    JSON.stringify(guardBreakIntentVisible || null)
  );
  add(
    'sunder guardbreak tooltip includes shatter preview',
    /预计击碎 0 护盾/.test(guardBreakIntentVisible?.tooltipBind || '') &&
      /追加 0 伤害/.test(guardBreakIntentVisible?.tooltipBind || ''),
    guardBreakIntentVisible?.tooltipBind || ''
  );

  await safeScreenshot(page, path.join(outDir, 'feature-audit.png'));

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
