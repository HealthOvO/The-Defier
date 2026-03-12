import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/web-mobile-layout-audit';
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
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(String(err));
  });

  await page.addInitScript(() => {
    try {
      localStorage.setItem('theDefierDebug', 'true');
      localStorage.setItem('theDefierLegacyV1', JSON.stringify({ essence: 40, spent: 0, upgrades: {}, lastPreset: 'tempo' }));
    } catch {}
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const probe = await page.evaluate(() => {
    ['auth-modal', 'save-slots-modal', 'generic-confirm-modal', 'save-conflict-modal', 'reward-modal', 'endless-boon-modal'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('active');
      el.style.display = 'none';
      el.style.visibility = 'hidden';
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
    });
    document.querySelectorAll('.modal, .auth-modal, .overlay, .modal-backdrop').forEach((el) => {
      el.style.display = 'none';
      el.style.visibility = 'hidden';
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
    });

    if (window.game && typeof game.selectCharacter === 'function') game.selectCharacter('linFeng');
    if (window.game && typeof game.confirmCharacterSelection === 'function') game.confirmCharacterSelection();
    if (window.game && typeof game.startDebugBattle === 'function') game.startDebugBattle(1, 'boss');
    if (window.game && game.battle) {
      if (typeof game.battle.updateBattleUI === 'function') game.battle.updateBattleUI();
    }

    const rectObj = (el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };

    const command = document.getElementById('battle-command-panel');
    const boss = document.getElementById('boss-act-panel');
    const hand = document.getElementById('hand-cards');
    const endTurn = document.getElementById('end-turn-btn');
    const enemy = document.querySelector('.enemy');
    const advisor = document.querySelector('#battle-command-panel .battle-tactical-advisor');
    const handCards = Array.from(document.querySelectorAll('#hand-cards .card')).slice(0, 3);
    const handCardRects = handCards.map((el) => rectObj(el));
    const visibleRuleLines = Array.from(document.querySelectorAll('#boss-act-panel .boss-act-line')).filter((el) => getComputedStyle(el).display !== 'none').length;

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      command: rectObj(command),
      boss: rectObj(boss),
      hand: rectObj(hand),
      endTurn: rectObj(endTurn),
      enemy: rectObj(enemy),
      handCardRects,
      advisorVisible: !!advisor && getComputedStyle(advisor).display !== 'none',
      visibleRuleLines,
      ok: !!command && !!boss && !!hand && !!endTurn && !!enemy &&
        rectObj(command).height <= 130 &&
        rectObj(command).top <= 80 &&
        rectObj(boss).height <= 116 &&
        rectObj(boss).top >= 160 &&
        rectObj(boss).bottom < rectObj(hand).top &&
        rectObj(endTurn).top >= rectObj(boss).top &&
        rectObj(endTurn).bottom <= rectObj(hand).top + 28 &&
        rectObj(enemy).top > rectObj(boss).bottom - 6 &&
        handCardRects.length >= 2 &&
        handCardRects.every((rect) => !!rect && rect.width >= 86 && rect.bottom <= window.innerHeight - 6) &&
        handCardRects.every((rect) => rect.right <= rectObj(endTurn).left + 44 || rect.top >= rectObj(endTurn).bottom - 6) &&
        !((!!advisor && getComputedStyle(advisor).display !== 'none')) &&
        visibleRuleLines <= 1
    };
  });

  add(
    'mobile battle HUD stays compact and keeps command panel, boss panel, hand area separated',
    !!probe && !!probe.ok,
    JSON.stringify(probe || null)
  );

  await page.screenshot({ path: path.join(outDir, 'mobile-battle-layout.png') });

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
