import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/web-mobile-layout-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];
const INTERNAL_EFFECT_LABEL_PATTERN = /\b(openTemporaryShop|openCampfire|removeCardType|permaBuff|runPathProgress|heavenlyInsight|ringExp|endlessPressure|maxHp)\b/i;

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
      const targetEnemy = Array.isArray(game.battle.enemies)
        ? game.battle.enemies.find((enemy) => enemy && enemy.currentHp > 0)
        : null;
      if (targetEnemy) {
        targetEnemy.enemyVariantRole = 'hexer';
        targetEnemy.tacticalPlanLabel = '先稳破绽';
        targetEnemy.encounterThemeTag = '快雾术场';
        targetEnemy.encounterThemeDesc = '浓雾会放大控场与减益节奏。';
        targetEnemy.encounterThemeTier = 1;
        targetEnemy.encounterAffixTag = '裂雾';
        targetEnemy.encounterAffixDesc = '高阶遭遇词缀会提升压制频率。';
        targetEnemy.enemySquadTag = '锁雾';
        targetEnemy.enemySquadRoleLabel = '先手控场';
        targetEnemy.enemySquadDesc = '敌方编队会优先铺减益并建立先手。';
        targetEnemy.patterns = [{ type: 'debuff', buffType: 'weak', value: 3, intent: '🕯️诵调' }];
        targetEnemy.currentPatternIndex = 0;
      }
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
    const spiritChip = document.querySelector('#battle-command-panel .battle-command-spirit-chip');
    const spiritChipRect = rectObj(spiritChip);
    const advisor = document.querySelector('#battle-command-panel .battle-tactical-advisor');
    const toggleBtn = document.querySelector('#battle-command-panel .battle-advisor-toggle');
    const metaStrips = Array.from(document.querySelectorAll('.enemy .enemy-meta-strip'));
    const handCards = Array.from(document.querySelectorAll('#hand-cards .card')).slice(0, 3);
    const handCardRects = handCards.map((el) => rectObj(el));
    const visibleRuleLines = Array.from(document.querySelectorAll('#boss-act-panel .boss-act-line')).filter((el) => getComputedStyle(el).display !== 'none').length;
    const enemyMetaHeight = metaStrips.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);
    const enemyGapToHand = enemy && hand ? hand.getBoundingClientRect().top - enemy.getBoundingClientRect().bottom : 0;
    const advisorCollapsedInitially = !!advisor && advisor.classList.contains('collapsed');
    const collapsedHeight = advisor ? advisor.getBoundingClientRect().height : 0;
    let expandedHeight = collapsedHeight;
    let advisorExpandedAfterToggle = false;
    if (toggleBtn && typeof toggleBtn.click === 'function') {
      toggleBtn.click();
      if (window.game?.battle && typeof game.battle.updateBattleUI === 'function') game.battle.updateBattleUI();
      const advisorAfterToggle = document.querySelector('#battle-command-panel .battle-tactical-advisor');
      expandedHeight = advisorAfterToggle ? advisorAfterToggle.getBoundingClientRect().height : collapsedHeight;
      advisorExpandedAfterToggle = !!advisorAfterToggle && !advisorAfterToggle.classList.contains('collapsed');
    }

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      command: rectObj(command),
      boss: rectObj(boss),
      hand: rectObj(hand),
      endTurn: rectObj(endTurn),
      enemy: rectObj(document.querySelector('.enemy') || enemy),
      spiritChip: spiritChipRect,
      handCardRects,
      metaStripCount: metaStrips.length,
      enemyMetaHeight,
      enemyGapToHand,
      advisorCollapsedInitially,
      advisorExpandedAfterToggle,
      collapsedHeight,
      expandedHeight,
      advisorVisible: !!advisor && getComputedStyle(advisor).display !== 'none',
      visibleRuleLines,
      ok: !!command && !!boss && !!hand && !!endTurn && !!enemy && !!spiritChipRect &&
        rectObj(command).height <= 130 &&
        rectObj(command).top <= 80 &&
        spiritChipRect.right <= window.innerWidth - 6 &&
        spiritChipRect.top >= rectObj(command).top - 2 &&
        rectObj(boss).height <= 116 &&
        rectObj(boss).top >= 160 &&
        rectObj(boss).bottom < rectObj(hand).top &&
        rectObj(endTurn).top >= rectObj(boss).top &&
        rectObj(endTurn).bottom <= rectObj(hand).top + 28 &&
        rectObj(document.querySelector('.enemy') || enemy).top > rectObj(boss).bottom - 6 &&
        metaStrips.length >= 2 &&
        enemyMetaHeight <= 72 &&
        enemyGapToHand >= 108 &&
        handCardRects.length >= 2 &&
        handCardRects.every((rect) => !!rect && rect.width >= 86 && rect.bottom <= window.innerHeight - 6) &&
        handCardRects.every((rect) => rect.right <= rectObj(endTurn).left + 44 || rect.top >= rectObj(endTurn).bottom - 6) &&
        !!advisor &&
        advisorCollapsedInitially &&
        advisorExpandedAfterToggle &&
        expandedHeight >= collapsedHeight + 20 &&
        visibleRuleLines <= 1
    };
  });

  add(
    'mobile battle HUD stays compact, keeps lanes separated, and still allows explicit advisor expansion',
    !!probe && !!probe.ok,
    JSON.stringify(probe || null)
  );

  await safeAuditScreenshot(page, path.join(outDir, 'mobile-battle-layout.png'), 'browser_mobile_layout_audit', { timeout: 8000 });

  const spiritReadyProbe = await page.evaluate(() => {
    if (!window.game || !game.battle || !game.player) return { ok: false, reason: 'no_battle' };

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
    const absoluteRect = (el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        left: rect.left + window.scrollX,
        right: rect.right + window.scrollX,
        top: rect.top + window.scrollY,
        bottom: rect.bottom + window.scrollY,
        width: rect.width,
        height: rect.height,
      };
    };
    const overlaps = (a, b, margin = 0) => {
      if (!a || !b) return false;
      return !(
        a.right <= b.left + margin ||
        b.right <= a.left + margin ||
        a.bottom <= b.top + margin ||
        b.bottom <= a.top + margin
      );
    };

    if (typeof game.player.setSpiritCompanion === 'function') {
      game.player.setSpiritCompanion('frostChi', 1);
    }
    if (typeof game.battle.applySpiritCompanionBattleStart === 'function') {
      game.battle.applySpiritCompanionBattleStart();
    }
    if (typeof game.player.gainSpiritCharge === 'function') {
      game.player.gainSpiritCharge(5);
    } else if (game.player.spiritCompanionBattleState) {
      game.player.spiritCompanionBattleState.charge = game.player.spiritCompanionBattleState.maxCharge || 5;
    }
    if (typeof game.battle.markUIDirty === 'function') {
      game.battle.markUIDirty('command', 'player', 'enemies', 'hand', 'energy');
    }
    if (typeof game.battle.updateBattleUI === 'function') {
      game.battle.updateBattleUI();
    }

    const toggleBtn = document.querySelector('#battle-command-panel .battle-advisor-toggle');
    const advisor = document.querySelector('#battle-command-panel .battle-tactical-advisor');
    if (advisor?.classList.contains('collapsed') && typeof toggleBtn?.click === 'function') {
      toggleBtn.click();
      if (typeof game.battle.updateBattleUI === 'function') {
        game.battle.updateBattleUI();
      }
    }

    const chip = document.querySelector('#battle-command-panel .battle-command-spirit-chip');
    const button = document.querySelector('#battle-command-panel .battle-advisor-spirit-btn');
    const endTurn = document.getElementById('end-turn-btn');
    const hand = document.getElementById('hand-cards');
    const handCard = hand?.querySelector('.card');
    const chipRect = rectObj(chip);
    const buttonDocRectBeforeScroll = absoluteRect(button);
    const endTurnDocRect = absoluteRect(endTurn);
    const handDocRect = absoluteRect(hand);
    const handCardDocRect = absoluteRect(handCard);
    if (button && typeof button.scrollIntoView === 'function') {
      button.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
    const buttonRect = rectObj(button);
    let payload = null;
    try {
      payload = JSON.parse(window.render_game_to_text());
    } catch {}

    return {
      chipText: chip ? (chip.textContent || '').replace(/\s+/g, ' ').trim() : '',
      buttonText: button ? (button.textContent || '').replace(/\s+/g, ' ').trim() : '',
      chipRect,
      buttonRect,
      buttonDocRectBeforeScroll,
      endTurnDocRect,
      handDocRect,
      handCardDocRect,
      payloadSpiritCharge: payload?.player?.spiritCharge || null,
      payloadSpirit: payload?.player?.spiritCompanion || null,
      ok:
        !!chip &&
        !!button &&
        !!buttonRect &&
        !!chipRect &&
        !!endTurnDocRect &&
        !!handDocRect &&
        chip.classList.contains('ready') &&
        !button.disabled &&
        /释放/.test(button.textContent || '') &&
        /5\/5/.test(chip.textContent || '') &&
        buttonRect.top >= 0 &&
        buttonRect.right <= window.innerWidth - 6 &&
        buttonRect.left >= 6 &&
        buttonRect.bottom <= window.innerHeight - 6 &&
        !overlaps(buttonDocRectBeforeScroll, endTurnDocRect, 6) &&
        !overlaps(buttonDocRectBeforeScroll, handDocRect, 6) &&
        !overlaps(buttonDocRectBeforeScroll, handCardDocRect, 6) &&
        !!(payload?.player?.spiritCompanion?.id === 'frostChi') &&
        !!(payload?.player?.spiritCharge?.charge === 5 && payload?.player?.spiritCharge?.max === 5)
    };
  });

  add(
    'mobile battle spirit ready state keeps release CTA visible and separated from end-turn and hand lanes',
    !!spiritReadyProbe && !!spiritReadyProbe.ok,
    JSON.stringify(spiritReadyProbe || null)
  );

  await safeAuditScreenshot(page, path.join(outDir, 'mobile-battle-spirit-ready.png'), 'browser_mobile_layout_audit', { timeout: 8000 });

  await page.evaluate(() => {
    ['auth-modal', 'save-slots-modal', 'generic-confirm-modal', 'save-conflict-modal'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });
    if (!window.game) return;
    game.guestMode = true;
    game.startNewGame('linFeng');
    const bundle = typeof game.buildChallengeBundle === 'function' ? game.buildChallengeBundle('daily') : null;
    if (bundle && typeof game.applyChallengeRunStart === 'function') {
      game.applyChallengeRunStart(bundle);
      if (game.activeChallengeRun) {
        game.activeChallengeRun.progress.battleWins = 3;
        game.activeChallengeRun.progress.eliteWins = 1;
        game.activeChallengeRun.progress.realmClears = 1;
      }
      if (game.player) {
        game.player.currentHp = Math.min(game.player.maxHp || 80, 72);
      }
      if (typeof game.finalizeActiveChallengeRun === 'function') {
        game.finalizeActiveChallengeRun({ completed: true, reason: 'goal_reached' });
      }
    }
    if (typeof game.initializeExpeditionForRealm === 'function') {
      game.initializeExpeditionForRealm(game.player?.realm || 1, true);
    }
    if (typeof game.showScreen === 'function') {
      game.showScreen('map-screen');
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1000);

  const expeditionPanelsProbe = await page.evaluate(() => {
    const panels = document.getElementById('map-expedition-panels');
    const root = document.documentElement;
    const isVisible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
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
    const isRectVisible = (rect) => !!rect
      && rect.top >= 0
      && rect.bottom <= window.innerHeight
      && rect.left >= 0
      && rect.right <= window.innerWidth;
    const getText = (selector) => {
      const el = panels?.querySelector(selector);
      return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
    };
    const buttons = Array.from(panels?.querySelectorAll('button') || []);
    const branchButtons = buttons.filter((btn) => /路线/.test(btn.textContent || ''));
    const bountyButtons = buttons.filter((btn) => /悬赏/.test(btn.textContent || ''));
    const visibilityAfterScroll = (targetButtons) => {
      const target = targetButtons.find((btn) => isVisible(btn));
      const before = rectObj(target);
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
      const after = rectObj(target);
      return {
        reachable: isRectVisible(after),
        before,
        after
      };
    };

    const branchReach = visibilityAfterScroll(branchButtons);
    const bountyReach = visibilityAfterScroll(bountyButtons);
    const viewportWidth = window.innerWidth;
    const panelRect = rectObj(panels);
    window.scrollTo(0, 0);

    return {
      panelVisible: isVisible(panels),
      panelRect,
      panelCount: panels?.querySelectorAll('.expedition-panel-card').length || 0,
      overviewText: getText('.expedition-overview-card'),
      observatoryText: getText('.expedition-observatory-card'),
      signalsText: getText('.expedition-signals-card'),
      panelScrollWidth: panels?.scrollWidth || 0,
      rootScrollWidth: root?.scrollWidth || 0,
      branchButtonCount: branchButtons.length,
      bountyButtonCount: bountyButtons.length,
      branchReach,
      bountyReach,
      ok:
        isVisible(panels) &&
        (panels?.querySelectorAll('.expedition-panel-card').length || 0) >= 6 &&
        getText('.expedition-overview-card').length >= 30 &&
        getText('.expedition-observatory-card').length >= 30 &&
        getText('.expedition-signals-card').length >= 30 &&
        branchButtons.length >= 1 &&
        bountyButtons.length >= 1 &&
        branchReach.reachable &&
        bountyReach.reachable &&
        (panels?.scrollWidth || 0) <= viewportWidth + 8 &&
        (root?.scrollWidth || 0) <= viewportWidth + 8
    };
  });

  add(
    'mobile expedition panels keep overview, observatory, and signal cards readable without horizontal overflow',
    !!expeditionPanelsProbe && !!expeditionPanelsProbe.ok,
    JSON.stringify(expeditionPanelsProbe || null)
  );

  await safeAuditScreenshot(page, path.join(outDir, 'mobile-expedition-panels.png'), 'browser_mobile_layout_audit', { timeout: 8000 });

  const strategicModalProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showObservatoryNode !== 'function') return null;
    if (typeof game.showScreen === 'function') game.showScreen('map-screen');
    game.showObservatoryNode({ id: 93001, row: 2, type: 'observatory', completed: false, accessible: true });
    const modal = document.getElementById('event-modal');
    const content = modal ? modal.querySelector('.modal-content') : null;
    const rect = content ? content.getBoundingClientRect() : null;
    const choices = Array.from(document.querySelectorAll('#event-choices .event-choice'));
    return {
      choiceCount: choices.length,
      top: rect ? rect.top : null,
      bottom: rect ? rect.bottom : null,
      height: rect ? rect.height : null,
      ok: !!content &&
        !!rect &&
        rect.top >= 8 &&
        rect.bottom <= window.innerHeight - 8 &&
        rect.height <= window.innerHeight - 16 &&
        choices.length >= 4
    };
  });

  add(
    'mobile observatory modal stays within viewport and keeps all choices reachable',
    !!strategicModalProbe && !!strategicModalProbe.ok,
    JSON.stringify(strategicModalProbe || null)
  );

  await safeAuditScreenshot(page, path.join(outDir, 'mobile-observatory-modal.png'), 'browser_mobile_layout_audit', { timeout: 8000 });

  const forgeWorkshopProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showForgeChoiceModal !== 'function') return null;
    if (typeof game.showScreen === 'function') game.showScreen('map-screen');
    if (game.player) {
      game.player.collectedTreasures = [];
      game.player.equippedTreasures = [];
      game.player.treasures = game.player.equippedTreasures;
      if (typeof game.player.addTreasure === 'function') {
        game.player.addTreasure('iron_talisman');
        game.player.addTreasure('ring_echo_compass');
      }
      if (typeof game.player.setSpiritCompanion === 'function') {
        game.player.setSpiritCompanion('frostChi', 1);
      }
    }
    game.showForgeChoiceModal({ id: 93002, row: 2, type: 'forge', completed: false, accessible: true }, {
      forgeCost: 50,
      premiumCost: 110,
      temperCost: 30
    });
    const modal = document.getElementById('event-modal');
    const content = modal ? modal.querySelector('.modal-content') : null;
    const rect = content ? content.getBoundingClientRect() : null;
    const choices = Array.from(document.querySelectorAll('#event-choices .event-choice'));
    return {
      choiceCount: choices.length,
      top: rect ? rect.top : null,
      bottom: rect ? rect.bottom : null,
      height: rect ? rect.height : null,
      ok: !!content &&
        !!rect &&
        rect.top >= 8 &&
        rect.bottom <= window.innerHeight - 8 &&
        rect.height <= window.innerHeight - 16 &&
        choices.length >= 5
    };
  });

  add(
    'mobile forge workshop modal stays within viewport and keeps all workshop branches reachable',
    !!forgeWorkshopProbe && !!forgeWorkshopProbe.ok,
    JSON.stringify(forgeWorkshopProbe || null)
  );

  await safeAuditScreenshot(page, path.join(outDir, 'mobile-forge-workshop-modal.png'), 'browser_mobile_layout_audit', { timeout: 8000 });

  const trialChallengeProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showTrialChallengeSelection !== 'function') return null;
    if (typeof game.showScreen === 'function') game.showScreen('map-screen');
    game.showTrialChallengeSelection({ id: 93003, row: 2, type: 'trial', completed: false, accessible: true });
    const modal = document.getElementById('event-modal');
    const content = modal ? modal.querySelector('.modal-content') : null;
    const rect = content ? content.getBoundingClientRect() : null;
    const choices = Array.from(document.querySelectorAll('#event-choices .event-choice'));
    return {
      choiceCount: choices.length,
      top: rect ? rect.top : null,
      bottom: rect ? rect.bottom : null,
      height: rect ? rect.height : null,
      ok: !!content &&
        !!rect &&
        rect.top >= 8 &&
        rect.bottom <= window.innerHeight - 8 &&
        rect.height <= window.innerHeight - 16 &&
        choices.length >= 4
    };
  });

  add(
    'mobile trial challenge modal stays within viewport and keeps all challenge packages reachable',
    !!trialChallengeProbe && !!trialChallengeProbe.ok,
    JSON.stringify(trialChallengeProbe || null)
  );

  await safeAuditScreenshot(page, path.join(outDir, 'mobile-trial-challenge-modal.png'), 'browser_mobile_layout_audit', { timeout: 8000 });

  const observatoryEngineeringModalProbe = await page.evaluate((patternSource) => {
    if (!window.game || typeof getRandomEvent !== 'function') return { ok: false, reason: 'event_api_unavailable' };

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
    const regex = new RegExp(patternSource, 'i');

    window.__testStrategicEngineeringSnapshot = {
      focusTrack: {
        trackId: 'observatory',
        tier: 2,
        tierLabel: 'T2',
        progress: 2,
        nextTarget: 3,
        remaining: 1,
        nodeLabel: '观星工程',
        name: '观星工程',
        icon: '🔭',
        effectSummary: '观测网已经锁定此地灵流'
      },
      activeTracks: [],
      allTracks: [],
      summary: '观星工程 T2'
    };
    window.__testStrategicEngineeringSnapshot.activeTracks = [{ ...window.__testStrategicEngineeringSnapshot.focusTrack }];
    window.__testStrategicEngineeringSnapshot.allTracks = [{ ...window.__testStrategicEngineeringSnapshot.focusTrack }];
    game.getStrategicEngineeringSnapshot = () => window.__testStrategicEngineeringSnapshot;
    if (typeof game.showScreen === 'function') game.showScreen('map-screen');
    window.__debugEventQueue = ['artifactConfluxBazaar'];
    const evt = getRandomEvent();
    if (!evt) return { ok: false, reason: 'no_event' };
    game.showEventModal(evt, { id: 'mobile-engineering-observatory', row: 2, type: 'event' });

    const modalContent = document.querySelector('#event-modal .modal-content');
    const summary = document.getElementById('event-system-summary');
    const choices = Array.from(document.querySelectorAll('#event-choices .event-choice'));
    const choiceTexts = choices.map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
    const rect = rectObj(modalContent);

    return {
      eventId: evt.id,
      summaryText: summary ? (summary.textContent || '').replace(/\s+/g, ' ').trim() : '',
      choiceCount: choices.length,
      choiceTexts,
      rect,
      ok:
        evt.id === 'artifactConfluxBazaar' &&
        !!rect &&
        rect.top >= 8 &&
        rect.bottom <= window.innerHeight - 8 &&
        rect.height <= window.innerHeight - 16 &&
        (summary?.textContent || '').trim().length > 0 &&
        choices.length >= 2 &&
        choiceTexts.every((text) => !regex.test(text))
    };
  }, INTERNAL_EFFECT_LABEL_PATTERN.source);

  add(
    'mobile observatory engineering event modal stays within viewport and keeps player-facing choice summaries clean',
    !!observatoryEngineeringModalProbe && !!observatoryEngineeringModalProbe.ok,
    JSON.stringify(observatoryEngineeringModalProbe || null)
  );

  await safeAuditScreenshot(page, path.join(outDir, 'mobile-engineering-observatory-event.png'), 'browser_mobile_layout_audit', { timeout: 8000 });

  const memoryRiftEngineeringModalProbe = await page.evaluate((patternSource) => {
    if (!window.game || typeof getRandomEvent !== 'function') return { ok: false, reason: 'event_api_unavailable' };

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
    const regex = new RegExp(patternSource, 'i');

    window.__testStrategicEngineeringSnapshot = {
      focusTrack: {
        trackId: 'memory_rift',
        tier: 2,
        tierLabel: 'T2',
        progress: 2,
        nextTarget: 3,
        remaining: 1,
        nodeLabel: '裂隙工程',
        name: '裂隙工程',
        icon: '🪞',
        effectSummary: '裂隙工程已经与当前路线并轨'
      },
      activeTracks: [],
      allTracks: [],
      summary: '裂隙工程 T2'
    };
    window.__testStrategicEngineeringSnapshot.activeTracks = [{ ...window.__testStrategicEngineeringSnapshot.focusTrack }];
    window.__testStrategicEngineeringSnapshot.allTracks = [{ ...window.__testStrategicEngineeringSnapshot.focusTrack }];
    game.getStrategicEngineeringSnapshot = () => window.__testStrategicEngineeringSnapshot;
    if (typeof game.showScreen === 'function') game.showScreen('map-screen');
    window.__debugEventQueue = ['floatingMarketRift'];
    const evt = getRandomEvent();
    if (!evt) return { ok: false, reason: 'no_event' };
    game.showEventModal(evt, { id: 'mobile-engineering-rift', row: 2, type: 'event' });

    const modalContent = document.querySelector('#event-modal .modal-content');
    const summary = document.getElementById('event-system-summary');
    const choices = Array.from(document.querySelectorAll('#event-choices .event-choice'));
    const choiceTexts = choices.map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
    const rect = rectObj(modalContent);

    return {
      eventId: evt.id,
      summaryText: summary ? (summary.textContent || '').replace(/\s+/g, ' ').trim() : '',
      choiceCount: choices.length,
      choiceTexts,
      rect,
      ok:
        evt.id === 'floatingMarketRift' &&
        !!rect &&
        rect.top >= 8 &&
        rect.bottom <= window.innerHeight - 8 &&
        rect.height <= window.innerHeight - 16 &&
        (summary?.textContent || '').trim().length > 0 &&
        choices.length >= 2 &&
        choiceTexts.every((text) => !regex.test(text))
    };
  }, INTERNAL_EFFECT_LABEL_PATTERN.source);

  add(
    'mobile memory-rift engineering event modal stays within viewport and keeps internal effect ids hidden',
    !!memoryRiftEngineeringModalProbe && !!memoryRiftEngineeringModalProbe.ok,
    JSON.stringify(memoryRiftEngineeringModalProbe || null)
  );

  await safeAuditScreenshot(page, path.join(outDir, 'mobile-engineering-memory-rift-event.png'), 'browser_mobile_layout_audit', { timeout: 8000 });

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
