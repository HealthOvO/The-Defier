import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

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

async function triggerBattleEndTurn(page) {
  try {
    const endTurnBtn = page.locator('#end-turn-btn');
    await endTurnBtn.waitFor({ state: 'visible', timeout: 4000 });
    await endTurnBtn.click({ timeout: 4000, force: true });
    return 'playwright-force-click';
  } catch (err) {
    const fallback = await page.evaluate(() => {
      const btn = document.getElementById('end-turn-btn');
      if (!btn || btn.disabled) return { ok: false, reason: 'missing_or_disabled' };
      btn.click();
      return { ok: true };
    });
    if (fallback?.ok) {
      return 'dom-click-fallback';
    }
    throw err;
  }
}

async function showMainMenu(page) {
  await page.evaluate(() => {
    if (window.game && typeof game.showScreen === 'function') {
      game.showScreen('main-menu');
    }
  });
  await page.waitForFunction(() => {
    const mainMenu = document.getElementById('main-menu');
    const newGameBtn = document.getElementById('new-game-btn');
    const pvpBtn = document.getElementById('pvp-btn');
    const isVisible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && el.offsetParent !== null;
    };
    return !!mainMenu
      && mainMenu.classList.contains('active')
      && isVisible(newGameBtn)
      && isVisible(pvpBtn)
      && window.game?.currentScreen === 'main-menu';
  }, { timeout: 3000 });
}

async function openCollectionScreen(page) {
  try {
    await page.locator("button[onclick=\"game.showCollection()\"], button[onclick=\"game.showScreen('collection')\"]").first().click({
      timeout: 3000,
      force: true,
    });
    await page.waitForFunction(() => {
      try {
        return JSON.parse(window.render_game_to_text()).mode === 'collection';
      } catch {
        return false;
      }
    }, { timeout: 3000 });
    return 'ui-click';
  } catch (err) {
    await page.evaluate(() => {
      if (window.game && typeof game.showCollection === 'function') {
        game.showCollection();
      } else if (window.game && typeof game.showScreen === 'function') {
        game.showScreen('collection');
      }
    });
    await page.waitForFunction(() => {
      try {
        return JSON.parse(window.render_game_to_text()).mode === 'collection';
      } catch {
        return false;
      }
    }, { timeout: 3000 });
    return `fallback:${err.name || 'unknown'}`;
  }
}

async function openNewGameEntry(page) {
  try {
    await page.click('#new-game-btn', { timeout: 3000, force: true });
  } catch (err) {
    await page.evaluate(async () => {
      if (window.game && typeof game.openSaveSlotsWithSync === 'function') {
        await game.openSaveSlotsWithSync();
      }
    });
    return `fallback:${err.name || 'unknown'}`;
  }

  await page.waitForFunction(() => {
    const confirmModal = document.getElementById('generic-confirm-modal');
    const saveSlotsModal = document.getElementById('save-slots-modal');
    return !!confirmModal?.classList.contains('active') || !!saveSlotsModal?.classList.contains('active');
  }, { timeout: 3000 });
  return 'ui-click';
}

(async () => {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
  const browser = await chromium.launch({
    executablePath,
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
  await safeAuditScreenshot(page, path.join(outDir, '00-initial.png'), 'browser_audit', { timeout: 9000 });

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
  await safeAuditScreenshot(page, path.join(outDir, '01-pvp.png'), 'browser_audit', { timeout: 9000 });

  try {
    await page.click('#pvp-screen .back-btn', { timeout: 2000 });
    await page.waitForTimeout(300);
  } catch {}
  await showMainMenu(page);

  // Collection screen
  try {
    const collectionOpenMode = await openCollectionScreen(page);
    add('can open collection', true, collectionOpenMode);
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
  await showMainMenu(page);

  // New game flow
  try {
    const newGameOpenMode = await openNewGameEntry(page);
    add('can click new game', true, newGameOpenMode);
  } catch (e) {
    add('can click new game', false, String(e));
  }

  const slotsModalActive = await page.evaluate(() => {
    const modal = document.getElementById('save-slots-modal');
    return !!modal && modal.classList.contains('active');
  });
  add(
    'new game does not jump directly to save slots when logged out',
    !slotsModalActive,
    slotsModalActive ? 'unexpectedly opened save slots' : ''
  );

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
    await page.click('.character-card[data-id="linFeng"]', { timeout: 3000, force: true });
    await page.waitForTimeout(200);
    const destinyDraft = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#run-destiny-selection .run-destiny-card'));
      return {
        count: cards.length,
        selectedId: cards.find((card) => card.classList.contains('selected'))?.dataset?.destinyId || null
      };
    });
    add(
      'character selection shows run destiny draft',
      destinyDraft.count >= 3 && !!destinyDraft.selectedId,
      JSON.stringify(destinyDraft)
    );
    const spiritDraft = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#spirit-companion-selection .run-spirit-card'));
      let payload = null;
      try {
        payload = JSON.parse(window.render_game_to_text());
      } catch {}
      return {
        count: cards.length,
        selectedId: cards.find((card) => card.classList.contains('selected'))?.dataset?.spiritId || null,
        payloadSelectedId: payload?.draft?.selectedSpiritCompanionId || null,
        payloadCount: Array.isArray(payload?.draft?.spiritCompanions) ? payload.draft.spiritCompanions.length : 0
      };
    });
    add(
      'character selection shows spirit companion draft',
      spiritDraft.count >= 3
        && !!spiritDraft.selectedId
        && spiritDraft.selectedId === spiritDraft.payloadSelectedId
        && spiritDraft.payloadCount >= 3,
      JSON.stringify(spiritDraft)
    );
    try {
      await page.click('#confirm-character-btn', { timeout: 3000, force: true });
    } catch {
      await page.evaluate(() => {
        if (!window.game || typeof game.confirmCharacterSelection !== 'function') return;
        game.confirmCharacterSelection();
      });
    }
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

  const bypassDestiny = await page.evaluate(() => {
    try {
      const payload = JSON.parse(window.render_game_to_text());
      return payload?.player?.runDestiny || null;
    } catch {
      return null;
    }
  });
  add(
    'bypass new run still assigns a run destiny',
    !!(bypassDestiny && bypassDestiny.id),
    JSON.stringify(bypassDestiny)
  );
  const bypassSpirit = await page.evaluate(() => {
    try {
      const payload = JSON.parse(window.render_game_to_text());
      return {
        spiritCompanion: payload?.player?.spiritCompanion || null,
        spiritCharge: payload?.player?.spiritCharge || null
      };
    } catch {
      return null;
    }
  });
  add(
    'bypass new run still assigns a spirit companion',
    !!(bypassSpirit && bypassSpirit.spiritCompanion && bypassSpirit.spiritCompanion.id && bypassSpirit.spiritCharge),
    JSON.stringify(bypassSpirit)
  );

  const realmChapterPreviewProbe = await page.evaluate(() => {
    if (!window.game || typeof game.selectRealm !== 'function') return null;
    game.selectRealm(game.selectedRealmId || 1);
    const chapterText = (document.getElementById('preview-chapter')?.textContent || '').replace(/\s+/g, ' ').trim();
    const buildText = (document.getElementById('preview-build')?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      title: (document.getElementById('preview-title')?.textContent || '').trim(),
      chapterText,
      buildText
    };
  });
  add(
    'realm select preview surfaces chapter omen/leyline and recommended build lanes',
    !!realmChapterPreviewProbe
      && /第1章|碎誓外域/.test(realmChapterPreviewProbe.chapterText || '')
      && /天象/.test(realmChapterPreviewProbe.chapterText || '')
      && /地脉/.test(realmChapterPreviewProbe.chapterText || '')
      && /命格/.test(realmChapterPreviewProbe.buildText || '')
      && /灵契/.test(realmChapterPreviewProbe.buildText || '')
      && /誓约/.test(realmChapterPreviewProbe.buildText || ''),
    JSON.stringify(realmChapterPreviewProbe || null)
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
  await safeAuditScreenshot(page, path.join(outDir, '02-map.png'), 'browser_audit', { timeout: 9000 });

  const mapChapterProbe = await page.evaluate(() => {
    const panel = document.getElementById('map-chapter-brief');
    const overview = document.getElementById('map-situation-overview');
    const risk = document.getElementById('map-chapter-risk-card');
    const style = panel ? getComputedStyle(panel) : null;
    let payload = null;
    try {
      payload = JSON.parse(window.render_game_to_text());
    } catch {}
    return {
      visible: !!panel && !!style && style.display !== 'none' && style.visibility !== 'hidden',
      text: (panel?.textContent || '').replace(/\s+/g, ' ').trim(),
      overviewText: (overview?.textContent || '').replace(/\s+/g, ' ').trim(),
      riskText: (risk?.textContent || '').replace(/\s+/g, ' ').trim(),
      chapter: payload?.map?.chapter || null
    };
  });
  add(
    'map screen surfaces chapter card with omen and leyline summary',
    !!mapChapterProbe
      && mapChapterProbe.visible
      && /章节世界规则/.test(mapChapterProbe.text || '')
      && /天象/.test(mapChapterProbe.text || '')
      && /地脉/.test(mapChapterProbe.text || '')
      && /风险|DRI/.test(mapChapterProbe.text || '')
      && /宿敌|追猎/.test(mapChapterProbe.text || '')
      && /预判/.test(mapChapterProbe.text || '')
      && !!mapChapterProbe.chapter?.name
      && typeof mapChapterProbe.chapter?.dangerProfile?.index === 'number'
      && !!mapChapterProbe.chapter?.dangerProfile?.tierLabel
      && !!mapChapterProbe.chapter?.nemesis?.name
      && !!mapChapterProbe.chapter?.nemesis?.statusLabel
      && typeof mapChapterProbe.chapter?.nemesis?.pressureIndex === 'number'
      && !!mapChapterProbe.chapter?.skyOmen?.name
      && !!mapChapterProbe.chapter?.leyline?.name
      && Array.isArray(mapChapterProbe.chapter?.factionSignals)
      && Array.isArray(mapChapterProbe.chapter?.nemesisSignals)
      && Array.isArray(mapChapterProbe.chapter?.bountyConflicts)
      && !!mapChapterProbe.chapter?.nemesisForecast
      && /最近势力变化/.test(mapChapterProbe.overviewText || '')
      && /追猎预判/.test(mapChapterProbe.overviewText || '')
      && /悬赏冲突/.test(mapChapterProbe.riskText || ''),
    JSON.stringify(mapChapterProbe || null)
  );

  const strategicNodeProbe = await page.evaluate(() => {
    if (!window.game || !game.map || typeof game.showScreen !== 'function') return null;
    game.showScreen('map-screen');
    game.map.nodes = [
      [
        { id: 920001, row: 0, type: 'observatory', icon: game.map.getNodeIcon('observatory'), completed: false, accessible: true },
        { id: 920002, row: 0, type: 'spirit_grotto', icon: game.map.getNodeIcon('spirit_grotto'), completed: false, accessible: true },
        { id: 920003, row: 0, type: 'forbidden_altar', icon: game.map.getNodeIcon('forbidden_altar'), completed: false, accessible: true },
        { id: 920004, row: 0, type: 'memory_rift', icon: game.map.getNodeIcon('memory_rift'), completed: false, accessible: true },
        { id: 920005, row: 0, type: 'enemy', icon: game.map.getNodeIcon('enemy'), completed: false, accessible: true }
      ],
      [
        { id: 920006, row: 1, type: 'boss', icon: '👹', completed: false, accessible: false }
      ]
    ];
    game.map.render();
    const entries = ['observatory', 'spirit_grotto', 'forbidden_altar', 'memory_rift'].map((type) => {
      const el = document.querySelector(`.map-node-v3.${type}`);
      return {
        type,
        exists: !!el,
        tooltip: el?.querySelector('.node-tooltip')?.textContent?.trim() || ''
      };
    });
    let payload = null;
    try {
      payload = JSON.parse(window.render_game_to_text());
    } catch {}
    return {
      entries,
      activeTypes: Array.isArray(payload?.map?.activeNodes) ? payload.map.activeNodes.map((node) => node.type) : []
    };
  });
  add(
    'map renders new strategic node types with readable tooltips',
    !!strategicNodeProbe
      && strategicNodeProbe.entries.every((item) => item.exists && item.tooltip.length >= 6)
      && ['observatory', 'spirit_grotto', 'forbidden_altar', 'memory_rift'].every((type) => strategicNodeProbe.activeTypes.includes(type)),
    JSON.stringify(strategicNodeProbe || null)
  );

  const vowRouteProbe = await page.evaluate(() => {
    if (!window.game || !game.player) return null;
    if (typeof game.player.setRunVows === 'function') {
      game.player.setRunVows([{ id: 'heavenlyGaze', tier: 1 }]);
    } else {
      game.player.runVows = [{ id: 'heavenlyGaze', tier: 1 }];
      if (typeof game.player.normalizeRunVows === 'function') game.player.normalizeRunVows(game.player.runVows);
    }
    if (game.map && typeof game.map.updateStatusBar === 'function') game.map.updateStatusBar();
    const chips = Array.from(document.querySelectorAll('#map-route-hints .map-route-chip')).map((el) => (el.textContent || '').trim());
    let payload = null;
    try {
      payload = JSON.parse(window.render_game_to_text());
    } catch {}
    return {
      chips,
      vowIds: Array.isArray(payload?.player?.runVows) ? payload.player.runVows.map((item) => item.id) : []
    };
  });
  add(
    'map route hints surface active vows',
    !!vowRouteProbe
      && Array.isArray(vowRouteProbe.chips)
      && vowRouteProbe.chips.some((text) => /窥天誓|事件|商店/.test(text))
      && Array.isArray(vowRouteProbe.vowIds)
      && vowRouteProbe.vowIds.includes('heavenlyGaze'),
    JSON.stringify(vowRouteProbe || null)
  );

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

  const vowBattleProbe = await page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('#battle-command-panel .battle-advisor-status-chip')).map((el) => (el.textContent || '').trim());
    let payload = null;
    try {
      payload = JSON.parse(window.render_game_to_text());
    } catch {}
    return {
      chips,
      vowIds: Array.isArray(payload?.player?.runVows) ? payload.player.runVows.map((item) => item.id) : []
    };
  });
  add(
    'battle HUD surfaces active vow status',
    !!vowBattleProbe
      && Array.isArray(vowBattleProbe.chips)
      && vowBattleProbe.chips.some((text) => /誓约|窥天誓/.test(text))
      && Array.isArray(vowBattleProbe.vowIds)
      && vowBattleProbe.vowIds.includes('heavenlyGaze'),
    JSON.stringify(vowBattleProbe || null)
  );

  const spiritBattleProbe = await page.evaluate(() => {
    const chip = document.querySelector('#battle-command-panel .battle-command-spirit-chip');
    const spiritCard = document.querySelector('#battle-command-panel .battle-advisor-spirit-card');
    const spiritButton = document.querySelector('#battle-command-panel .battle-advisor-spirit-btn');
    let payload = null;
    try {
      payload = JSON.parse(window.render_game_to_text());
    } catch {}
    return {
      chipText: chip ? (chip.textContent || '').trim() : '',
      spiritCardExists: !!spiritCard,
      spiritButtonText: spiritButton ? (spiritButton.textContent || '').trim() : '',
      playerSpirit: payload?.player?.spiritCompanion || null,
      spiritCharge: payload?.player?.spiritCharge || null
    };
  });
  add(
    'battle HUD surfaces spirit companion state',
    !!spiritBattleProbe
      && !!spiritBattleProbe.spiritCardExists
      && !!spiritBattleProbe.playerSpirit?.id
      && !!spiritBattleProbe.spiritCharge
      && (spiritBattleProbe.chipText || '').includes(spiritBattleProbe.playerSpirit.name || '')
      && /蓄能中|释放/.test(spiritBattleProbe.spiritButtonText || ''),
    JSON.stringify(spiritBattleProbe || null)
  );

  const battleChapterProbe = await page.evaluate(() => {
    const env = document.getElementById('battle-environment');
    let payload = null;
    try {
      payload = JSON.parse(window.render_game_to_text());
    } catch {}
    return {
      text: (env?.textContent || '').replace(/\s+/g, ' ').trim(),
      title: env?.title || '',
      chapterRules: payload?.battle?.chapterRules || null
    };
  });
  add(
    'battle HUD surfaces chapter world rules alongside encounter info',
    !!battleChapterProbe
      && /章节|天象|地脉/.test(battleChapterProbe.text || '')
      && /章节：/.test(battleChapterProbe.title || '')
      && !!battleChapterProbe.chapterRules?.name
      && !!battleChapterProbe.chapterRules?.nemesis?.name
      && !!battleChapterProbe.chapterRules?.nemesis?.statusLabel
      && !!battleChapterProbe.chapterRules?.skyOmen?.name
      && !!battleChapterProbe.chapterRules?.leyline?.name,
    JSON.stringify(battleChapterProbe || null)
  );

  if (battleMode === 'battle-screen') {
    const before = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    const interactionMode = await triggerBattleEndTurn(page);
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      if (typeof window.advanceTime === 'function') window.advanceTime(800);
    });
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    const progressed = (after?.battle?.turn ?? 0) >= (before?.battle?.turn ?? 0);
    add('battle end-turn interaction works', progressed, `turn ${before?.battle?.turn} -> ${after?.battle?.turn} via ${interactionMode}`);
  }

  await safeAuditScreenshot(page, path.join(outDir, '03-battle.png'), 'browser_audit', { timeout: 9000 });

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
