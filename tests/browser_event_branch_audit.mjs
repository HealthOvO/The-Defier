import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/web-event-branch-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

async function safeScreenshot(page, outPath) {
  try {
    await page.screenshot({ path: outPath, fullPage: true, timeout: 5000 });
  } catch (err) {
    console.warn(`[browser_event_branch_audit] screenshot skipped: ${err?.message || err}`);
  }
}

async function getSnapshot(page) {
  return page.evaluate(() => ({
    mode: window.game?.currentScreen || null,
    hp: window.game?.player?.currentHp ?? null,
    maxHp: window.game?.player?.maxHp ?? null,
    gold: window.game?.player?.gold ?? null,
    deck: Array.isArray(window.game?.player?.deck) ? window.game.player.deck.length : null
  }));
}

async function bootstrapRun(page) {
  await page.evaluate(() => {
    ['auth-modal', 'save-slots-modal', 'generic-confirm-modal', 'save-conflict-modal'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });
    if (window.game && typeof game.showScreen === 'function') game.showScreen('main-menu');
  });
  await page.waitForTimeout(250);

  await page.click('#new-game-btn', { timeout: 5000, force: true });
  await page.waitForTimeout(300);
  const hasGuestPrompt = await page.locator('#generic-confirm-modal.active #generic-cancel-btn').isVisible().catch(() => false);
  if (hasGuestPrompt) {
    await page.click('#generic-cancel-btn', { timeout: 3000, force: true });
  }

  await page.waitForTimeout(350);
  await page.evaluate(() => {
    if (!window.game) return;
    if (game.currentScreen !== 'character-selection-screen' && typeof game.showCharacterSelection === 'function') {
      game.showCharacterSelection();
    }
    if (typeof game.selectCharacter === 'function') game.selectCharacter('linFeng');
    if (typeof game.confirmCharacterSelection === 'function') game.confirmCharacterSelection();
  });
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    if (window.game && typeof game.startRealm === 'function') game.startRealm(1, false);
  });
  await page.waitForTimeout(700);

  await page.evaluate(() => {
    if (!window.game || !game.player) return;
    game.showScreen('map-screen');
    game.player.maxHp = Math.max(game.player.maxHp || 80, 120);
    game.player.currentHp = game.player.maxHp;
    game.player.gold = Math.max(game.player.gold || 0, 999);
  });
  await page.waitForTimeout(200);
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

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await bootstrapRun(page);

  const checks = [
    {
      eventId: 'bloodForgeCovenant',
      choiceIndex: 0,
      expect: (before, after) =>
        after.hp < before.hp &&
        after.deck >= before.deck + 2,
      detail: 'hp down and deck +2'
    },
    {
      eventId: 'mirrorNeedleDojo',
      choiceIndex: 0,
      expect: (before, after) =>
        after.deck >= before.deck + 2,
      detail: 'deck +2'
    },
    {
      eventId: 'shatteredCompass',
      choiceIndex: 1,
      expect: (before, after) =>
        after.hp < before.hp &&
        after.deck >= before.deck + 1,
      detail: 'hp down and deck +1'
    },
    {
      eventId: 'debtboundAnvil',
      choiceIndex: 1,
      expect: (before, after) =>
        after.hp < before.hp &&
        after.deck >= before.deck + 1,
      detail: 'hp down and deck +1'
    },
    {
      eventId: 'voidBookkeeper',
      choiceIndex: 0,
      expect: (before, after) =>
        after.deck >= before.deck + 2,
      detail: 'deck +2'
    },
    {
      eventId: 'ashLedgerTrial',
      choiceIndex: 1,
      expect: (before, after) =>
        after.deck >= before.deck + 2,
      detail: 'deck +2'
    },
    {
      eventId: 'convergenceRitual',
      choiceIndex: 1,
      expect: (before, after) =>
        after.gold > before.gold &&
        after.deck >= before.deck + 1,
      detail: 'gold up and deck +1'
    },
    {
      eventId: 'shieldRelayBeacon',
      choiceIndex: 0,
      expect: (before, after) =>
        after.hp < before.hp &&
        after.gold > before.gold,
      detail: 'hp down and gold up'
    },
    {
      eventId: 'ironCitadelPact',
      choiceIndex: 0,
      expect: (before, after) =>
        after.hp < before.hp &&
        after.deck >= before.deck + 2,
      detail: 'hp down and deck +2'
    },
    {
      eventId: 'aegisTribunal',
      choiceIndex: 0,
      expect: (before, after) =>
        after.gold < before.gold &&
        after.deck >= before.deck + 2,
      detail: 'gold down and deck +2'
    }
  ];

  for (let i = 0; i < checks.length; i += 1) {
    const check = checks[i];

    const forcedId = await page.evaluate(({ eventId, idx }) => {
      if (!window.game || typeof EVENTS === 'undefined') return null;
      window.__debugEventQueue = [eventId];
      const evt = typeof getRandomEvent === 'function' ? getRandomEvent() : null;
      if (!evt) return null;
      game.showEventModal(evt, { id: 9000 + idx, row: 2, type: 'event' });
      return evt.id;
    }, { eventId: check.eventId, idx: i });

    add(`forced event returns expected id (${check.eventId})`, forcedId === check.eventId, `got=${forcedId}`);

    await page.waitForTimeout(150);
    const before = await getSnapshot(page);

    const choiceSelector = `#event-choices .event-choice:nth-child(${check.choiceIndex + 1})`;
    await page.click(choiceSelector, { timeout: 3000, force: true });
    await page.waitForTimeout(350);

    const modalActive = await page.evaluate(() => !!document.getElementById('event-modal')?.classList.contains('active'));
    if (modalActive) {
      const continueBtnVisible = await page.locator('#event-choices .event-choice').first().isVisible().catch(() => false);
      if (continueBtnVisible) {
        await page.click('#event-choices .event-choice', { timeout: 3000, force: true });
        await page.waitForTimeout(350);
      }
    }

    // Guard: these audited branches should not interrupt into battle/deck-upgrade screens
    const mode = await page.evaluate(() => window.game?.currentScreen || null);
    add(`branch stays in non-interrupt flow (${check.eventId})`, mode !== 'battle-screen', `mode=${mode}`);

    const after = await getSnapshot(page);
    const pass = check.expect(before, after);
    add(`event branch effect check (${check.eventId})`, pass, `${check.detail}; before=${JSON.stringify(before)}, after=${JSON.stringify(after)}`);

    await page.evaluate(() => {
      if (window.game && typeof game.showScreen === 'function') game.showScreen('map-screen');
      const em = document.getElementById('event-modal');
      if (em) em.classList.remove('active');
    });
    await page.waitForTimeout(150);
  }

  await safeScreenshot(page, path.join(outDir, 'event-branch-audit.png'));

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
