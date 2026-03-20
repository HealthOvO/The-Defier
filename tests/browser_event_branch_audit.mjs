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

async function clickEventChoice(page, selector) {
  try {
    await page.click(selector, { timeout: 3000, force: true });
    return 'playwright-force-click';
  } catch (err) {
    const fallback = await page.evaluate((targetSelector) => {
      const btn = document.querySelector(targetSelector);
      if (!btn) return { ok: false, reason: 'missing' };
      btn.click();
      return { ok: true };
    }, selector).catch(() => ({ ok: false, reason: 'evaluate-failed' }));
    if (fallback?.ok) return 'dom-click-fallback';
    throw err;
  }
}

async function getSnapshot(page) {
  return page.evaluate(() => ({
    mode: window.game?.currentScreen || null,
    hp: window.game?.player?.currentHp ?? null,
    maxHp: window.game?.player?.maxHp ?? null,
    gold: window.game?.player?.gold ?? null,
    insight: window.game?.player?.heavenlyInsight ?? null,
    deck: Array.isArray(window.game?.player?.deck) ? window.game.player.deck.length : null,
    ringExp: window.game?.player?.fateRing?.exp ?? null,
    adventureBuffs: window.game?.player?.adventureBuffs
      ? { ...window.game.player.adventureBuffs }
      : null
  }));
}

async function getEventModalSnapshot(page) {
  return page.evaluate(() => {
    const currentEvent = window.game?.currentEvent || null;
    const textPayload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : {};
    const choiceTexts = Array.from(document.querySelectorAll('#event-choices .event-choice')).map((el) =>
      (el.textContent || '').replace(/\s+/g, ' ').trim()
    );
    return {
      eventId: currentEvent?.id || null,
      summary: textPayload?.eventModal?.summary || '',
      engineeringMeta: currentEvent?.engineeringEventMeta || null,
      firstChoice: currentEvent?.choices?.[0] || null,
      secondChoice: currentEvent?.choices?.[1] || null,
      choiceTexts
    };
  });
}

const INTERNAL_EFFECT_LABEL_PATTERN = /\b(openTemporaryShop|openCampfire|removeCardType|permaBuff|runPathProgress|heavenlyInsight|ringExp|endlessPressure|maxHp)\b/;

async function armEngineeringSnapshot(page, trackId, tier = 2) {
  await page.evaluate(({ trackId, tier }) => {
    if (!window.game) return;
    const catalog = {
      observatory: {
        name: '观星工程',
        icon: '🔭',
        effectSummary: '观测网已经锁定此地灵流'
      },
      memory_rift: {
        name: '裂隙工程',
        icon: '🪞',
        effectSummary: '裂隙工程已经与当前路线并轨'
      }
    };
    const meta = catalog[trackId] || {
      name: trackId,
      icon: '🧭',
      effectSummary: '工程联动测试态'
    };
    const trackState = {
      trackId,
      tier,
      tierLabel: `T${tier}`,
      progress: tier,
      nextTarget: tier >= 3 ? null : tier + 1,
      remaining: tier >= 3 ? 0 : 1,
      nodeLabel: meta.name,
      ...meta
    };
    window.__testStrategicEngineeringSnapshot = {
      focusTrack: { ...trackState },
      activeTracks: [{ ...trackState }],
      allTracks: [{ ...trackState }],
      summary: `${meta.name} T${tier}`
    };
    game.getStrategicEngineeringSnapshot = () => window.__testStrategicEngineeringSnapshot;
  }, { trackId, tier });
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
      eventId: 'convergenceRelay',
      choiceIndex: 0,
      expect: (before, after) =>
        after.ringExp > before.ringExp &&
        (after.adventureBuffs?.firstTurnEnergyBoostBattles || 0) > (before.adventureBuffs?.firstTurnEnergyBoostBattles || 0),
      detail: 'ringExp up and first-turn energy buff up'
    },
    {
      eventId: 'harmonicAnvil',
      choiceIndex: 1,
      expect: (before, after) =>
        after.hp < before.hp &&
        after.deck >= before.deck + 2,
      detail: 'hp down and deck +2'
    },
    {
      eventId: 'artifactConfluxBazaar',
      choiceIndex: 1,
      expect: (before, after) =>
        after.gold > before.gold &&
        after.ringExp > before.ringExp,
      detail: 'gold up and ringExp up'
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
    },
    {
      eventId: 'caravanQuartermaster',
      choiceIndex: 0,
      expect: (before, after) =>
        after.gold < before.gold &&
        (after.adventureBuffs?.firstTurnDrawBoostBattles || 0) > (before.adventureBuffs?.firstTurnDrawBoostBattles || 0),
      detail: 'gold down and first-turn draw buff up'
    },
    {
      eventId: 'nightWatchCamp',
      choiceIndex: 0,
      expect: (before, after) =>
        after.hp < before.hp &&
        (after.adventureBuffs?.openingBlockBoostBattles || 0) > (before.adventureBuffs?.openingBlockBoostBattles || 0),
      detail: 'hp down and opening-block buff up'
    },
    {
      eventId: 'frontierContractBoard',
      choiceIndex: 0,
      expect: (before, after) =>
        (after.adventureBuffs?.victoryGoldBoostBattles || 0) > (before.adventureBuffs?.victoryGoldBoostBattles || 0),
      detail: 'victory-gold buff up'
    },
    {
      eventId: 'floatingMarketRift',
      choiceIndex: 1,
      expect: (before, after) =>
        after.gold > before.gold,
      detail: 'gold up'
    },
    {
      eventId: 'emberCampSignal',
      choiceIndex: 1,
      expect: (before, after) =>
        after.ringExp > before.ringExp,
      detail: 'ringExp up'
    },
    {
      eventId: 'leylineConfluence',
      choiceIndex: 1,
      expect: (before, after) =>
        after.hp < before.hp &&
        (after.adventureBuffs?.ringExpBoostBattles || 0) > (before.adventureBuffs?.ringExpBoostBattles || 0),
      detail: 'hp down and ringExp buff up'
    },
    {
      eventId: 'astralSupplyDepot',
      choiceIndex: 1,
      expect: (before, after) =>
        after.gold > before.gold &&
        after.ringExp > before.ringExp,
      detail: 'gold up and ringExp up'
    },
    {
      eventId: 'medicRelayPost',
      choiceIndex: 0,
      expect: (before, after) =>
        after.gold < before.gold &&
        (after.adventureBuffs?.victoryHealBoostBattles || 0) > (before.adventureBuffs?.victoryHealBoostBattles || 0),
      detail: 'gold down and victory-heal buff up'
    },
    {
      eventId: 'starlitFieldHospital',
      choiceIndex: 0,
      expect: (before, after) =>
        (after.adventureBuffs?.victoryHealBoostBattles || 0) > (before.adventureBuffs?.victoryHealBoostBattles || 0) &&
        (after.adventureBuffs?.openingBlockBoostBattles || 0) > (before.adventureBuffs?.openingBlockBoostBattles || 0),
      detail: 'victory-heal and opening-block buffs up'
    },
    {
      eventId: 'riftAidConvoy',
      choiceIndex: 1,
      expect: (before, after) =>
        after.gold > before.gold &&
        after.hp >= before.hp,
      detail: 'gold up and hp not lower'
    },
    {
      eventId: 'endlessChronicleBroker',
      choiceIndex: 0,
      expect: (before, after) =>
        after.gold < before.gold &&
        after.ringExp > before.ringExp &&
        (after.adventureBuffs?.firstTurnDrawBoostBattles || 0) > (before.adventureBuffs?.firstTurnDrawBoostBattles || 0) &&
        (after.adventureBuffs?.firstTurnEnergyBoostBattles || 0) > (before.adventureBuffs?.firstTurnEnergyBoostBattles || 0),
      detail: 'gold down, ringExp up, draw+energy buffs up'
    },
    {
      eventId: 'endlessStormSanctum',
      choiceIndex: 0,
      expect: (before, after) =>
        (after.adventureBuffs?.openingBlockBoostBattles || 0) > (before.adventureBuffs?.openingBlockBoostBattles || 0),
      detail: 'opening-block buff up'
    },
    {
      eventId: 'endlessMutatorWorkshop',
      choiceIndex: 1,
      expect: (before, after) =>
        after.gold > before.gold &&
        (after.adventureBuffs?.victoryGoldBoostBattles || 0) > (before.adventureBuffs?.victoryGoldBoostBattles || 0),
      detail: 'gold up and victory-gold buff up'
    },
    {
      eventId: 'endlessMemoryVault',
      choiceIndex: 0,
      expect: (before, after) =>
        after.ringExp > before.ringExp &&
        (after.adventureBuffs?.victoryHealBoostBattles || 0) > (before.adventureBuffs?.victoryHealBoostBattles || 0),
      detail: 'ringExp up and victory-heal buff up'
    },
    {
      eventId: 'endlessPressureValve',
      choiceIndex: 1,
      expect: (before, after) =>
        after.gold > before.gold &&
        after.ringExp > before.ringExp,
      detail: 'gold up and ringExp up'
    },
    {
      eventId: 'endlessFaultLine',
      choiceIndex: 0,
      expect: (before, after) =>
        (after.adventureBuffs?.openingBlockBoostBattles || 0) > (before.adventureBuffs?.openingBlockBoostBattles || 0),
      detail: 'opening-block buff up'
    },
    {
      eventId: 'endlessOverclockAltar',
      choiceIndex: 0,
      expect: (before, after) =>
        after.gold > before.gold &&
        (after.adventureBuffs?.firstTurnEnergyBoostBattles || 0) > (before.adventureBuffs?.firstTurnEnergyBoostBattles || 0),
      detail: 'gold up and first-turn-energy buff up'
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
    await clickEventChoice(page, choiceSelector);
    await page.waitForTimeout(350);

    const modalActive = await page.evaluate(() => !!document.getElementById('event-modal')?.classList.contains('active'));
    if (modalActive) {
      const continueBtnVisible = await page.locator('#event-choices .event-choice').first().isVisible().catch(() => false);
      if (continueBtnVisible) {
        await clickEventChoice(page, '#event-choices .event-choice');
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

  const engineeringChecks = [
    {
      name: 'observatory engineering event overlay + reward uplift',
      trackId: 'observatory',
      eventId: 'artifactConfluxBazaar',
      choiceIndex: 1,
      screenshot: 'engineering-observatory-event.png',
      expectModal: (modal) =>
        modal.eventId === 'artifactConfluxBazaar' &&
        modal.engineeringMeta?.trackId === 'observatory' &&
        /工程联动/.test(modal.summary || '') &&
        Array.isArray(modal.firstChoice?.effects) &&
        modal.firstChoice.effects.some((effect) => effect.type === 'openTemporaryShop' && Number(effect.offerCount) >= 5 && Number(effect.priceMultiplier) < 1) &&
        Array.isArray(modal.secondChoice?.effects) &&
        modal.secondChoice.effects.some((effect) => effect.type === 'heavenlyInsight') &&
        Array.isArray(modal.choiceTexts) &&
        modal.choiceTexts.length >= 2 &&
        modal.choiceTexts.every((text) => !INTERNAL_EFFECT_LABEL_PATTERN.test(text)),
      expectResult: (before, after) =>
        after.gold > before.gold &&
        after.ringExp > before.ringExp + 20 &&
        after.insight > before.insight,
      detail: 'summary shows engineering linkage, bazaar choice gets shop discount + insight, payout is uplifted, and no raw effect ids leak into UI'
    },
    {
      name: 'memory-rift engineering event overlay + reward uplift',
      trackId: 'memory_rift',
      eventId: 'floatingMarketRift',
      choiceIndex: 1,
      screenshot: 'engineering-memory-rift-event.png',
      expectModal: (modal) =>
        modal.eventId === 'floatingMarketRift' &&
        modal.engineeringMeta?.trackId === 'memory_rift' &&
        /工程联动/.test(modal.summary || '') &&
        Array.isArray(modal.firstChoice?.effects) &&
        modal.firstChoice.effects.some((effect) => effect.type === 'openTemporaryShop' && Number(effect.offerCount) >= 4 && Number(effect.priceMultiplier) < 1) &&
        Array.isArray(modal.secondChoice?.effects) &&
        modal.secondChoice.effects.some((effect) => effect.type === 'ringExp') &&
        Array.isArray(modal.choiceTexts) &&
        modal.choiceTexts.length >= 2 &&
        modal.choiceTexts.every((text) => !INTERNAL_EFFECT_LABEL_PATTERN.test(text)),
      expectResult: (before, after) =>
        after.gold > before.gold + 28 &&
        after.ringExp > before.ringExp,
      detail: 'summary shows engineering linkage, rift market choice gets shop discount, bypass payout gains extra gold + ringExp, and no raw effect ids leak into UI'
    }
  ];

  for (const check of engineeringChecks) {
    await armEngineeringSnapshot(page, check.trackId, 2);
    const forcedId = await page.evaluate(({ eventId }) => {
      if (!window.game || typeof EVENTS === 'undefined') return null;
      window.__debugEventQueue = [eventId];
      const evt = typeof getRandomEvent === 'function' ? getRandomEvent() : null;
      if (!evt) return null;
      game.showEventModal(evt, { id: `engineering-${eventId}`, row: 2, type: 'event' });
      return evt.id;
    }, { eventId: check.eventId });
    add(`engineering forced event returns expected id (${check.trackId})`, forcedId === check.eventId, `got=${forcedId}`);

    await page.waitForTimeout(150);
    const modalSnapshot = await getEventModalSnapshot(page);
    add(`engineering modal metadata check (${check.trackId})`, check.expectModal(modalSnapshot), JSON.stringify(modalSnapshot));
    await safeScreenshot(page, path.join(outDir, check.screenshot));

    const before = await getSnapshot(page);
    const choiceSelector = `#event-choices .event-choice:nth-child(${check.choiceIndex + 1})`;
    await clickEventChoice(page, choiceSelector);
    await page.waitForTimeout(350);

    const continueBtnVisible = await page.locator('#event-choices .event-choice').first().isVisible().catch(() => false);
    if (continueBtnVisible) {
      await clickEventChoice(page, '#event-choices .event-choice');
      await page.waitForTimeout(350);
    }

    const after = await getSnapshot(page);
    add(`engineering reward check (${check.trackId})`, check.expectResult(before, after), `${check.detail}; before=${JSON.stringify(before)}, after=${JSON.stringify(after)}`);

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
  const failed = findings.filter((item) => !item.pass);
  if (failed.length > 0 || consoleErrors.length > 0) {
    failed.forEach((item) => console.error(`FAIL: ${item.name}\n${item.detail}`));
    process.exitCode = 1;
  }

  await browser.close();
})();
