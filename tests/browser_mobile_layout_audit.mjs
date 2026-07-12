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
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
  const browser = await chromium.launch({
    executablePath,
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
    window.__ALLOW_DEBUG_EVENT_HOOKS__ = true;
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
    const overlaps = (a, b, margin = 0) => {
      if (!a || !b) return false;
      return !(
        a.right <= b.left + margin ||
        b.right <= a.left + margin ||
        a.bottom <= b.top + margin ||
        b.bottom <= a.top + margin
      );
    };
    const isVisible = (el) => {
      if (!el || el.hidden) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || '1') > 0
        && rect.width > 0
        && rect.height > 0;
    };

    const controlRail = document.querySelector('#battle-screen .battle-control-rail');
    const environment = document.getElementById('battle-environment');
    const command = document.getElementById('battle-command-panel');
    const commandList = command?.querySelector('.battle-command-list');
    const boss = document.getElementById('boss-act-panel');
    const hand = document.getElementById('hand-cards');
    const handArea = document.querySelector('#battle-screen .hand-area');
    const playerArea = document.querySelector('#battle-screen .player-area');
    const playerCharacter = document.querySelector('#battle-screen .player-character');
    const battleContainer = document.querySelector('#battle-screen .battle-container');
    const endTurn = document.getElementById('end-turn-btn');
    const enemy = document.querySelector('.enemy');
    const spiritChip = document.querySelector('#battle-command-panel .battle-command-spirit-chip');
    const spiritChipRect = rectObj(spiritChip);
    const advisor = document.querySelector('#battle-command-panel .battle-tactical-advisor');
    const toggleBtn = document.querySelector('#battle-command-panel .battle-advisor-toggle');
    const resources = document.querySelector('#battle-screen .resources-container');
    const energyDisplay = resources?.querySelector('.energy-display');
    const candyDisplay = resources?.querySelector('.candy-display, #candy-container');
    const energyOrbs = resources?.querySelector('#energy-orbs');
    const candyOrbs = resources?.querySelector('#candy-orbs');
    const battleLoopRail = document.querySelector('#battle-command-panel [data-core-loop-rail="battle"]');
    const battleLoopRailRect = rectObj(battleLoopRail);
    const battleLoopText = battleLoopRail?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const metaStrips = Array.from(document.querySelectorAll('.enemy .enemy-meta-strip'));
    const handCards = Array.from(document.querySelectorAll('#hand-cards .card')).slice(0, 3);
    const handCardRects = handCards.map((el) => rectObj(el));
    const bossVisible = !!boss && getComputedStyle(boss).display !== 'none' && boss.getBoundingClientRect().height > 0;
    const collapsedBossRect = rectObj(boss);
    const visibleRuleLines = Array.from(document.querySelectorAll('#boss-act-panel .boss-act-line')).filter((el) => getComputedStyle(el).display !== 'none').length;
    const enemyMetaHeight = metaStrips.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);
    const enemyGapToHand = enemy && hand ? hand.getBoundingClientRect().top - enemy.getBoundingClientRect().bottom : 0;
    const enemyGapToEndTurn = enemy && endTurn ? endTurn.getBoundingClientRect().top - enemy.getBoundingClientRect().bottom : 0;
    const endTurnGapToHand = endTurn && hand ? hand.getBoundingClientRect().top - endTurn.getBoundingClientRect().bottom : 0;
    const advisorCollapsedInitially = !!advisor && advisor.classList.contains('collapsed');
    const collapsedHeight = advisor ? advisor.getBoundingClientRect().height : 0;
    const collapsedCommandRect = rectObj(command);
    const environmentRect = rectObj(environment);
    const environmentFits = !!environment
      && environment.scrollWidth <= environment.clientWidth + 2
      && environment.scrollHeight <= environment.clientHeight + 2;
    const commandListHiddenCollapsed = !isVisible(commandList);
    const commandContentFitsCollapsed = !!command
      && command.scrollHeight <= command.clientHeight + 2;
    const resourcesRect = rectObj(resources);
    const energyRect = rectObj(energyDisplay);
    const candyRect = rectObj(candyDisplay);
    const resourceRowOk = !!resourcesRect
      && !!energyRect
      && !!candyRect
      && Math.abs((energyRect.top + energyRect.height / 2) - (candyRect.top + candyRect.height / 2)) <= 8
      && energyRect.left >= resourcesRect.left - 2
      && candyRect.right <= resourcesRect.right + 2
      && resourcesRect.left >= 0
      && resourcesRect.right <= window.innerWidth;
    const resourceOrbsNoWrap = !!energyOrbs
      && !!candyOrbs
      && getComputedStyle(energyOrbs).flexWrap === 'nowrap'
      && getComputedStyle(candyOrbs).flexWrap === 'nowrap';
    const controlRailRect = rectObj(controlRail);
    const visibleRailChildren = controlRail
      ? Array.from(controlRail.children).filter((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })
      : [];
    const railChildRects = visibleRailChildren.map((el) => ({ id: el.id, rect: rectObj(el) }));
    const railChildrenOverlap = railChildRects.some((entry, index) => railChildRects
      .slice(index + 1)
      .some((other) => overlaps(entry.rect, other.rect, 0)));
    const isTopHit = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
      const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === el || el.contains(hit));
    };
    const firstHandCard = handCards[0] || null;
    const semanticCards = Array.from(document.querySelectorAll('#hand-cards .card')).map((card) => ({
      index: Number(card.dataset.index),
      role: card.getAttribute('role') || '',
      tabIndex: card.tabIndex,
      ariaLabel: card.getAttribute('aria-label') || '',
      ariaDisabled: card.getAttribute('aria-disabled') || '',
    }));
    const firstPlayableCard = document.querySelector('#hand-cards .card[aria-disabled="false"]');
    let keyboardActivationIndex = null;
    let keyboardDefaultPrevented = false;
    if (firstPlayableCard && window.game?.battle) {
      const originalOnCardClick = game.battle.onCardClick;
      game.battle.onCardClick = (index) => {
        keyboardActivationIndex = index;
      };
      firstPlayableCard.focus();
      const keyboardEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });
      firstPlayableCard.dispatchEvent(keyboardEvent);
      keyboardDefaultPrevented = keyboardEvent.defaultPrevented;
      game.battle.onCardClick = originalOnCardClick;
    }
    const cardSemanticsOk = semanticCards.length > 0
      && semanticCards.every((card) => card.role === 'button'
        && card.ariaLabel.length >= 4
        && ['true', 'false'].includes(card.ariaDisabled)
        && (card.ariaDisabled === 'false' ? card.tabIndex === 0 : card.tabIndex === -1))
      && !!firstPlayableCard
      && keyboardActivationIndex === Number(firstPlayableCard.dataset.index)
      && keyboardDefaultPrevented;
    const toggleTopHit = isTopHit(toggleBtn);
    const firstHandCardTopHit = isTopHit(firstHandCard);
    let expandedHeight = collapsedHeight;
    let advisorExpandedAfterToggle = false;
    if (toggleBtn && typeof toggleBtn.click === 'function') {
      toggleBtn.click();
      if (window.game?.battle && typeof game.battle.updateBattleUI === 'function') game.battle.updateBattleUI();
      const advisorAfterToggle = document.querySelector('#battle-command-panel .battle-tactical-advisor');
      expandedHeight = advisorAfterToggle ? advisorAfterToggle.getBoundingClientRect().height : collapsedHeight;
      advisorExpandedAfterToggle = !!advisorAfterToggle && !advisorAfterToggle.classList.contains('collapsed');
    }
    const expandedRailRect = rectObj(controlRail);
    const expandedCommandRect = rectObj(command);
    const bossHiddenWhileAdvisorExpanded = !isVisible(boss);
    const restoreToggle = document.querySelector('#battle-command-panel .battle-advisor-toggle');
    if (restoreToggle && typeof restoreToggle.click === 'function') {
      restoreToggle.click();
      if (window.game?.battle && typeof game.battle.updateBattleUI === 'function') game.battle.updateBattleUI();
    }
    const advisorAfterRestore = document.querySelector('#battle-command-panel .battle-tactical-advisor');
    const advisorCollapsedAfterRestore = !!advisorAfterRestore && advisorAfterRestore.classList.contains('collapsed');
    const contextRestoredAfterCollapse = isVisible(environment) && (!bossVisible || isVisible(boss));

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      controlRail: controlRailRect,
      expandedRail: expandedRailRect,
      environment: environmentRect,
      environmentFits,
      collapsedCommand: collapsedCommandRect,
      expandedCommand: expandedCommandRect,
      commandListHiddenCollapsed,
      commandContentFitsCollapsed,
      resources: resourcesRect,
      energy: energyRect,
      candy: candyRect,
      resourceRowOk,
      resourceOrbsNoWrap,
      semanticCards,
      cardSemanticsOk,
      keyboardActivationIndex,
      keyboardDefaultPrevented,
      railChildRects,
      railChildrenOverlap,
      toggleTopHit,
      firstHandCardTopHit,
      command: expandedCommandRect,
      battleLoopRail: battleLoopRailRect,
      battleLoopText,
      boss: rectObj(boss),
      collapsedBoss: collapsedBossRect,
      bossVisible,
      bossHiddenWhileAdvisorExpanded,
      advisorCollapsedAfterRestore,
      contextRestoredAfterCollapse,
      hand: rectObj(hand),
      handArea: rectObj(handArea),
      playerArea: rectObj(playerArea),
      playerCharacter: rectObj(playerCharacter),
      playerHandOverlap: overlaps(rectObj(playerCharacter), rectObj(handArea), 0),
      playerEnemyOverlap: overlaps(rectObj(playerCharacter), rectObj(document.querySelector('.enemy') || enemy), 0),
      battleContainerScrollHeight: battleContainer?.scrollHeight || 0,
      battleContainerClientHeight: battleContainer?.clientHeight || 0,
      endTurn: rectObj(endTurn),
      enemy: rectObj(document.querySelector('.enemy') || enemy),
      spiritChip: spiritChipRect,
      handCardRects,
      metaStripCount: metaStrips.length,
      enemyMetaHeight,
      enemyGapToHand,
      enemyGapToEndTurn,
      endTurnGapToHand,
      advisorCollapsedInitially,
      advisorExpandedAfterToggle,
      collapsedHeight,
      expandedHeight,
      advisorVisible: !!advisor && getComputedStyle(advisor).display !== 'none',
      visibleRuleLines,
      ok: !!controlRail && !!controlRailRect && !!command && !!boss && !!hand && !!handArea && !!playerArea && !!playerCharacter && !!battleContainer && !!endTurn && !!enemy && !!spiritChipRect &&
        !!battleLoopRail &&
        !!battleLoopRailRect &&
        battleLoopRailRect.width > 0 &&
        battleLoopRailRect.height > 0 &&
        /胜利后进入战利结算，再回章节地图/.test(battleLoopText) &&
        controlRailRect.left >= 4 &&
        controlRailRect.right <= window.innerWidth - 4 &&
        controlRailRect.top <= 8 &&
        controlRailRect.bottom <= rectObj(document.querySelector('.enemy') || enemy).top - 12 &&
        !railChildrenOverlap &&
        railChildRects.every((entry) => entry.rect.left >= controlRailRect.left - 1 && entry.rect.right <= controlRailRect.right + 1) &&
        !!environmentRect &&
        environmentFits &&
        commandListHiddenCollapsed &&
        commandContentFitsCollapsed &&
        resourceRowOk &&
        resourceOrbsNoWrap &&
        cardSemanticsOk &&
        !!collapsedCommandRect &&
        collapsedCommandRect.height <= 78 &&
        collapsedCommandRect.top >= controlRailRect.top - 1 &&
        collapsedCommandRect.bottom <= controlRailRect.bottom + 1 &&
        !!expandedCommandRect &&
        expandedCommandRect.height <= 160 &&
        expandedCommandRect.bottom <= expandedRailRect.bottom + 1 &&
        battleLoopRailRect.left >= 0 &&
        battleLoopRailRect.right <= window.innerWidth &&
        battleLoopRailRect.bottom <= collapsedCommandRect.bottom + 2 &&
        !overlaps(battleLoopRailRect, rectObj(endTurn), 2) &&
        spiritChipRect.right <= window.innerWidth - 6 &&
        spiritChipRect.top >= rectObj(command).top - 2 &&
        (!bossVisible || (
          !!collapsedBossRect &&
          collapsedBossRect.height <= 52 &&
          collapsedBossRect.top >= controlRailRect.top - 1 &&
          collapsedBossRect.bottom <= controlRailRect.bottom + 1 &&
          bossHiddenWhileAdvisorExpanded
        )) &&
        rectObj(endTurn).top >= (collapsedBossRect?.top || 0) &&
        rectObj(endTurn).bottom <= rectObj(hand).top + 28 &&
        rectObj(document.querySelector('.enemy') || enemy).top > controlRailRect.bottom + 12 &&
        metaStrips.length >= 2 &&
        enemyMetaHeight <= 72 &&
        enemyGapToHand >= (bossVisible ? 68 : 108) &&
        enemyGapToEndTurn >= 10 &&
        endTurnGapToHand >= 12 &&
        !overlaps(rectObj(playerCharacter), rectObj(handArea), 0) &&
        !overlaps(rectObj(playerCharacter), rectObj(document.querySelector('.enemy') || enemy), 0) &&
        rectObj(playerCharacter).right <= rectObj(endTurn).left - 4 &&
        (battleContainer.scrollHeight || 0) <= (battleContainer.clientHeight || 0) + 2 &&
        handCardRects.length >= 2 &&
        handCardRects.every((rect) => !!rect && rect.width >= 86 && rect.bottom <= window.innerHeight - 6) &&
        handCardRects.every((rect) => rect.right <= rectObj(endTurn).left + 44 || rect.top >= rectObj(endTurn).bottom - 6) &&
        !!advisor &&
        advisorCollapsedInitially &&
        advisorExpandedAfterToggle &&
        advisorCollapsedAfterRestore &&
        contextRestoredAfterCollapse &&
        expandedHeight >= collapsedHeight + 20 &&
        !!expandedRailRect &&
        expandedRailRect.bottom <= rectObj(document.querySelector('.enemy') || enemy).top - 12 &&
        toggleTopHit &&
        firstHandCardTopHit &&
        visibleRuleLines <= 1
    };
  });

  add(
    'mobile battle HUD stays compact, keeps lanes separated, and still allows explicit advisor expansion',
    !!probe && !!probe.ok,
    JSON.stringify(probe || null)
  );

  add(
    'mobile battle loop rail stays visible without stealing end-turn or hand-card hit areas',
    !!probe?.battleLoopRail
      && /胜利后进入战利结算，再回章节地图/.test(probe.battleLoopText || '')
      && probe.battleLoopRail.left >= 0
      && probe.battleLoopRail.right <= probe.viewport.width
      && probe.endTurn
      && probe.handCardRects.every((rect) => rect && (rect.top >= probe.battleLoopRail.bottom || rect.left >= probe.battleLoopRail.right || rect.right <= probe.battleLoopRail.left)),
    JSON.stringify(probe || null)
  );

  add(
    'mobile battle folds secondary commands, keeps chapter context and resources contained, and supports keyboard cards',
    !!probe?.environmentFits
      && !!probe?.commandListHiddenCollapsed
      && !!probe?.commandContentFitsCollapsed
      && !!probe?.resourceRowOk
      && !!probe?.resourceOrbsNoWrap
      && !!probe?.cardSemanticsOk,
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
    if (typeof game.startRealm === 'function') {
      game.startRealm(game.player?.realm || 1, false);
    } else if (typeof game.showScreen === 'function') {
      game.showScreen('map-screen');
    }
    if (typeof game.initializeExpeditionForRealm === 'function') {
      game.initializeExpeditionForRealm(game.player?.realm || 1, true);
    }
    if (typeof game.renderExpeditionMapPanels === 'function') {
      game.renderExpeditionMapPanels();
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1000);

  const mobileMapDefaultProbe = await page.evaluate(() => {
    const shell = document.querySelector('#map-screen .map-screen-v3');
    const drawer = document.getElementById('map-intel-drawer');
    const scroller = document.getElementById('map-scroll-container');
    const currentRows = Array.from(document.querySelectorAll('#map-screen .node-row-v3[data-current-route="true"]'));
    const currentRow = currentRows[0] || null;
    const actionableNodes = currentRow
      ? Array.from(currentRow.querySelectorAll('.map-node-v3[aria-disabled="false"]'))
      : [];
    const scrollerRect = scroller?.getBoundingClientRect();
    const rowRect = currentRow?.getBoundingClientRect();
    const rowCenterVisible = !!scrollerRect
      && !!rowRect
      && rowRect.top + rowRect.height / 2 >= scrollerRect.top
      && rowRect.top + rowRect.height / 2 <= scrollerRect.bottom;
    const rowFullyVisible = !!scrollerRect
      && !!rowRect
      && rowRect.top >= scrollerRect.top + 8
      && rowRect.bottom <= scrollerRect.bottom - 8;
    const semanticsValid = actionableNodes.length > 0 && actionableNodes.every(node => node.getAttribute('role') === 'button'
      && node.getAttribute('aria-disabled') === 'false'
      && node.tabIndex === 0
      && (node.getAttribute('aria-label') || '').length >= 4
      && !node.hasAttribute('aria-current'));
    return {
      open: !!shell?.classList.contains('show-map-intel'),
      drawerHidden: drawer?.getAttribute('aria-hidden') === 'true',
      scrollerVisible: !!scrollerRect && scrollerRect.width > 0 && scrollerRect.height > 0,
      currentRowCount: currentRows.length,
      actionableNodeCount: actionableNodes.length,
      rowRect: rowRect ? {
        top: rowRect.top,
        bottom: rowRect.bottom,
        height: rowRect.height,
      } : null,
      scrollerRect: scrollerRect ? {
        top: scrollerRect.top,
        bottom: scrollerRect.bottom,
        height: scrollerRect.height,
      } : null,
      rowCenterVisible,
      rowFullyVisible,
      semanticsValid,
      scrollTop: scroller?.scrollTop || 0,
      ok: !!shell
        && !shell.classList.contains('show-map-intel')
        && drawer?.getAttribute('aria-hidden') === 'true'
        && !!scrollerRect
        && scrollerRect.width > 0
        && scrollerRect.height > 0
        && currentRows.length === 1
        && rowFullyVisible
        && semanticsValid,
    };
  });

  add(
    'mobile map starts with the route visible and keeps optional intel closed',
    !!mobileMapDefaultProbe?.ok,
    JSON.stringify(mobileMapDefaultProbe || null)
  );

  await page.evaluate(() => {
    const intelToggle = document.querySelector('#map-screen [data-map-action="toggle-map-intel"]');
    const shell = document.querySelector('#map-screen .map-screen-v3');
    if (shell && !shell.classList.contains('show-map-intel') && intelToggle && typeof intelToggle.click === 'function') {
      intelToggle.click();
    }
  });
  await page.waitForTimeout(250);

  await safeAuditScreenshot(page, path.join(outDir, 'mobile-expedition-panels.png'), 'browser_mobile_layout_audit', { timeout: 8000 });

  const expeditionPanelsProbe = await page.evaluate(() => {
    const panels = document.getElementById('map-expedition-panels');
    const drawer = document.getElementById('map-intel-drawer');
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
    const overlapArea = (a, b) => {
      if (!a || !b) return 0;
      const left = Math.max(a.left, b.left);
      const right = Math.min(a.right, b.right);
      const top = Math.max(a.top, b.top);
      const bottom = Math.min(a.bottom, b.bottom);
      return Math.max(0, right - left) * Math.max(0, bottom - top);
    };
    const visibleRatio = (rect) => {
      if (!rect || rect.width <= 0 || rect.height <= 0) return 0;
      const viewportRect = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      return overlapArea(rect, viewportRect) / (rect.width * rect.height);
    };
    const selectorFor = (el) => {
      if (!el) return '';
      if (el.id) return `#${el.id}`;
      const classes = Array.from(el.classList || []).slice(0, 3).join('.');
      return `${el.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
    };
    const isRectVisible = (rect) => !!rect
      && rect.top >= 0
      && rect.bottom <= window.innerHeight
      && rect.left >= 0
      && rect.right <= window.innerWidth;
    const safeBottomLimit = Math.min(
      window.innerHeight,
      Math.round((window.visualViewport?.height || window.innerHeight) - 12)
    );
    const isRectInSafeTapZone = (rect) => !!rect
      && rect.top >= 0
      && rect.bottom <= safeBottomLimit
      && rect.left >= 0
      && rect.right <= window.innerWidth
      && rect.height >= 40
      && rect.width >= 96;
    const isReachable = (el) => {
      if (!el) return { reachable: false, point: null, hit: '' };
      const rect = rectObj(el);
      if (!isRectVisible(rect)) return { reachable: false, point: null, hit: '', rect };
      const point = {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2)
      };
      const hit = document.elementFromPoint(point.x, point.y);
      return {
        reachable: !!hit && (hit === el || el.contains(hit) || hit.contains(el)),
        point,
        hit: selectorFor(hit),
        rect
      };
    };
    const getText = (selector) => {
      const el = panels?.querySelector(selector);
      return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
    };
    const cards = Array.from(panels?.querySelectorAll('.expedition-panel-card') || []);
    const visualCards = cards
      .map((card) => ({ card, selector: selectorFor(card), rect: rectObj(card) }))
      .filter((entry) => !!entry.rect)
      .sort((a, b) => a.rect.top - b.rect.top);
    const firstVisualCard = visualCards.find((entry) => entry.rect.bottom > 0 && entry.rect.top < window.innerHeight) || visualCards[0] || null;
    const initialPanelRect = visualCards.length > 0 ? {
      left: Math.min(...visualCards.map((entry) => entry.rect.left)),
      right: Math.max(...visualCards.map((entry) => entry.rect.right)),
      top: Math.min(...visualCards.map((entry) => entry.rect.top)),
      bottom: Math.max(...visualCards.map((entry) => entry.rect.bottom)),
      width: Math.max(...visualCards.map((entry) => entry.rect.right)) - Math.min(...visualCards.map((entry) => entry.rect.left)),
      height: Math.max(...visualCards.map((entry) => entry.rect.bottom)) - Math.min(...visualCards.map((entry) => entry.rect.top)),
    } : rectObj(panels);
    const panelVisible = visualCards.some((entry) => visibleRatio(entry.rect) > 0);
    const drawerRect = rectObj(drawer);
    const firstCardRect = firstVisualCard?.rect || null;
    const headerRect = rectObj(document.querySelector('#map-screen .map-v3-header'));
    const textReadabilityProbes = cards.slice(0, 4).flatMap((card) => {
      return Array.from(card.querySelectorAll('.expedition-card-title, .expedition-card-note, p, li')).slice(0, 6).map((node) => {
        const style = getComputedStyle(node);
        const fontSize = parseFloat(style.fontSize) || 0;
        const lineHeightRaw = parseFloat(style.lineHeight);
        const lineHeight = Number.isFinite(lineHeightRaw) ? lineHeightRaw : fontSize * 1.2;
        const nodeRect = rectObj(node);
        return {
          selector: selectorFor(node),
          text: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 64),
          fontSize: Number(fontSize.toFixed(1)),
          lineHeight: Number(lineHeight.toFixed(1)),
          lineHeightRatio: fontSize > 0 ? Number((lineHeight / fontSize).toFixed(2)) : 0,
          rect: nodeRect,
          ok:
            fontSize >= (node.classList.contains('expedition-card-title') ? 15 : 12) &&
            lineHeight / Math.max(fontSize, 1) >= 1.25 &&
            !!nodeRect &&
            nodeRect.width >= 120 &&
            nodeRect.height >= 15,
        };
      });
    });
    const initialVisibleCards = visualCards.map((entry) => ({
      selector: entry.selector,
      text: (entry.card.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      rect: entry.rect,
      visibleRatio: Number(visibleRatio(entry.rect).toFixed(3))
    })).filter((card) => card.visibleRatio >= 0.32);
    const buttons = Array.from(panels?.querySelectorAll('button') || []);
    const branchButtons = buttons.filter((btn) => /路线/.test(btn.textContent || ''));
    const bountyButtons = buttons.filter((btn) => /悬赏/.test(btn.textContent || ''));
    const initialPrimaryCtaProbes = [...branchButtons, ...bountyButtons].map((button) => {
      const rect = rectObj(button);
      return {
        text: (button.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48),
        action: button.dataset.expeditionAction || '',
        rect,
        safeBottomLimit,
        ok: isRectInSafeTapZone(rect)
      };
    });
    const initialSafeCtaCount = initialPrimaryCtaProbes.filter((probe) => probe.ok).length;
    const initialSafeBranchCtaCount = initialPrimaryCtaProbes.filter((probe) => probe.ok && probe.action === 'select-branch').length;
    const initialPrimaryCtaOk = initialSafeBranchCtaCount >= 1;
    const visibilityAfterScroll = (targetButtons) => {
      const target = targetButtons.find((btn) => isVisible(btn));
      const before = rectObj(target);
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
      const after = rectObj(target);
      const reach = isReachable(target);
      return {
        reachable: reach.reachable,
        before,
        after,
        point: reach.point,
        hit: reach.hit
      };
    };

    const branchReach = visibilityAfterScroll(branchButtons);
    const bountyReach = visibilityAfterScroll(bountyButtons);
    const actionSizeProbes = [...branchButtons, ...bountyButtons].filter(isVisible).map((button) => ({
      text: (button.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48),
      rect: rectObj(button),
      ok: !!rectObj(button) && rectObj(button).height >= 40 && rectObj(button).width >= 96,
    }));
    const viewportWidth = window.innerWidth;
    const scrolledPanelRect = rectObj(drawer);
    const initialPanelInViewport = !!drawerRect
      && drawerRect.top >= -4
      && drawerRect.bottom <= window.innerHeight + 4
      && drawerRect.left >= -4
      && drawerRect.right <= viewportWidth + 4;
    const firstCardReadable = visibleRatio(firstCardRect) >= 0.32;
    const firstCardHeaderOverlap = overlapArea(firstCardRect, headerRect);
    const shell = document.querySelector('#map-screen .map-screen-v3');
    const intelToggle = shell?.querySelector('[data-map-action="toggle-map-intel"]');
    const toolsToggle = shell?.querySelector('[data-map-action="toggle-map-tools"]');
    if (toolsToggle && typeof toolsToggle.click === 'function') toolsToggle.click();
    const toolsExclusive = !!shell?.classList.contains('show-map-tools')
      && !shell?.classList.contains('show-map-intel')
      && drawer?.getAttribute('aria-hidden') === 'true';
    if (intelToggle && typeof intelToggle.click === 'function') intelToggle.click();
    const intelExclusive = !!shell?.classList.contains('show-map-intel')
      && !shell?.classList.contains('show-map-tools')
      && drawer?.getAttribute('aria-hidden') === 'false';

    return {
      panelVisible,
      drawerVisible: isVisible(drawer),
      drawerRect,
      drawerScrollHeight: drawer?.scrollHeight || 0,
      drawerClientHeight: drawer?.clientHeight || 0,
      toolsExclusive,
      intelExclusive,
      initialPanelRect,
      scrolledPanelRect,
      firstVisualCardSelector: firstVisualCard?.selector || '',
      firstCardRect,
      headerRect,
      firstCardVisibleRatio: Number(visibleRatio(firstCardRect).toFixed(3)),
      firstCardHeaderOverlap: Math.round(firstCardHeaderOverlap),
      initialVisibleCards,
      panelCount: panels?.querySelectorAll('.expedition-panel-card').length || 0,
      overviewText: getText('.expedition-overview-card'),
      observatoryText: getText('.expedition-observatory-card'),
      signalsText: getText('.expedition-signals-card'),
      panelScrollWidth: drawer?.scrollWidth || 0,
      rootScrollWidth: root?.scrollWidth || 0,
      branchButtonCount: branchButtons.length,
      bountyButtonCount: bountyButtons.length,
      safeBottomLimit,
      initialPrimaryCtaProbes,
      initialSafeCtaCount,
      initialSafeBranchCtaCount,
      initialPrimaryCtaOk,
      branchReach,
      bountyReach,
      textReadabilityProbes,
      actionSizeProbes,
      ok:
        isVisible(drawer) &&
        panelVisible &&
        initialPanelInViewport &&
        overlapArea(drawerRect, headerRect) <= 12 &&
        (drawer?.scrollHeight || 0) > (drawer?.clientHeight || 0) &&
        (panels?.querySelectorAll('.expedition-panel-card').length || 0) >= 6 &&
        getText('.expedition-overview-card').length >= 30 &&
        getText('.expedition-observatory-card').length >= 30 &&
        getText('.expedition-signals-card').length >= 30 &&
        branchButtons.length >= 1 &&
        bountyButtons.length >= 1 &&
        initialPrimaryCtaOk &&
        firstCardReadable &&
        firstCardHeaderOverlap <= 12 &&
        branchReach.reachable &&
        bountyReach.reachable &&
        toolsExclusive &&
        intelExclusive &&
        textReadabilityProbes.length >= 8 &&
        textReadabilityProbes.every((probe) => probe.ok) &&
        actionSizeProbes.length >= 2 &&
        actionSizeProbes.every((probe) => probe.ok) &&
        (drawer?.scrollWidth || 0) <= viewportWidth + 8 &&
        (root?.scrollWidth || 0) <= viewportWidth + 8
    };
  });

  add(
    'mobile map keeps expedition content in one focused drawer with mutually exclusive tools and reachable actions',
    !!expeditionPanelsProbe && !!expeditionPanelsProbe.ok,
    JSON.stringify(expeditionPanelsProbe || null)
  );

  await safeAuditScreenshot(page, path.join(outDir, 'mobile-expedition-panels-scrolled-cta.png'), 'browser_mobile_layout_audit', { timeout: 8000 });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelector('#map-screen .map-scroll-container')?.scrollTo(0, 0);
    document.getElementById('map-intel-drawer')?.scrollTo(0, 0);
    document.getElementById('map-expedition-panels')?.scrollTo(0, 0);
  });
  const expeditionToastSetup = await page.evaluate(() => {
    const message = '移动端远征遮挡测试：非战斗反馈不应挡住情报卡片。';
    const log = document.getElementById('battle-log');
    const utilsAvailable = !!(window.Utils && typeof window.Utils.showBattleLog === 'function');
    if (window.Utils && typeof window.Utils.showBattleLog === 'function') {
      window.Utils.showBattleLog(message, { category: 'system', duration: 6000 });
    } else if (log) {
      log.textContent = message;
      log.classList.remove('log-damage', 'log-status', 'log-reward', 'log-warning');
      log.classList.add('log-system', 'show');
    }
    return {
      utilsAvailable,
      className: log?.className || '',
      text: (log?.textContent || '').replace(/\s+/g, ' ').trim(),
    };
  });
  await page.waitForFunction(() => {
    const log = document.getElementById('battle-log');
    if (!log) return false;
    const style = getComputedStyle(log);
    return log.classList.contains('show')
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity) > 0.01
      && log.getBoundingClientRect().width > 0
      && log.getBoundingClientRect().height > 0;
  }, null, { timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(250);
  const expeditionToastProbe = await page.evaluate((toastSetup) => {
    const log = document.getElementById('battle-log');
    const firstCard = Array.from(document.querySelectorAll('#map-expedition-panels .expedition-panel-card'))
      .filter((card) => {
        const style = getComputedStyle(card);
        const rect = card.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] || null;
    const headerButtons = Array.from(document.querySelectorAll('#map-screen .map-v3-header button, #map-screen .map-v3-header [role="button"]'));
    const style = log ? getComputedStyle(log) : null;
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
    const overlapArea = (a, b) => {
      if (!a || !b) return 0;
      const left = Math.max(a.left, b.left);
      const right = Math.min(a.right, b.right);
      const top = Math.max(a.top, b.top);
      const bottom = Math.min(a.bottom, b.bottom);
      return Math.max(0, right - left) * Math.max(0, bottom - top);
    };
    const isVisible = (el) => {
      if (!el) return false;
      const elementStyle = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return elementStyle.display !== 'none' && elementStyle.visibility !== 'hidden' && Number(elementStyle.opacity) > 0.01 && rect.width > 0 && rect.height > 0;
    };
    const logRect = rectObj(log);
    const firstCardRect = rectObj(firstCard);
    const buttonOverlaps = headerButtons.filter(isVisible).map((button) => ({
      text: (button.textContent || button.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(),
      rect: rectObj(button),
      overlap: Math.round(overlapArea(logRect, rectObj(button)))
    })).filter((entry) => entry.overlap > 12);
    const firstCardOverlap = Math.round(overlapArea(logRect, firstCardRect));
    return {
      toastSetup,
      logVisible: isVisible(log),
      logClassName: log?.className || '',
      logOpacity: style?.opacity || '',
      logText: (log?.textContent || '').replace(/\s+/g, ' ').trim(),
      logRect,
      firstCardRect,
      firstCardOverlap,
      buttonOverlaps,
      ok: isVisible(log) && firstCardOverlap <= 12 && buttonOverlaps.length === 0
    };
  }, expeditionToastSetup);
  add(
    'mobile expedition non-battle toast does not cover map header actions or first expedition card',
    !!expeditionToastProbe && !!expeditionToastProbe.ok,
    JSON.stringify(expeditionToastProbe || null)
  );

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
    const choiceTexts = choices.map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
    return {
      choiceCount: choices.length,
      hasCardLimit: choiceTexts.some((text) => text.includes('剑心限令')),
      hasTreasureHunt: choiceTexts.some((text) => text.includes('秘宝回响')),
      hasVitalSeal: choiceTexts.some((text) => text.includes('护心证道')),
      cardLimitConditionVisible: choiceTexts.some((text) => text.includes('最多打出 6 张牌')),
      treasureHuntConditionVisible: choiceTexts.some((text) => text.includes('6 回合内取胜') && text.includes('最多打出 8 张牌')),
      vitalSealConditionVisible: choiceTexts.some((text) => text.includes('胜利时生命') && text.includes('70%')),
      top: rect ? rect.top : null,
      bottom: rect ? rect.bottom : null,
      height: rect ? rect.height : null,
      ok: !!content &&
        !!rect &&
        rect.top >= 8 &&
        rect.bottom <= window.innerHeight - 8 &&
        rect.height <= window.innerHeight - 16 &&
        choices.length >= 6 &&
        choiceTexts.some((text) => text.includes('剑心限令')) &&
        choiceTexts.some((text) => text.includes('最多打出 6 张牌')) &&
        choiceTexts.some((text) => text.includes('秘宝回响')) &&
        choiceTexts.some((text) => text.includes('6 回合内取胜') && text.includes('最多打出 8 张牌')) &&
        choiceTexts.some((text) => text.includes('护心证道')) &&
        choiceTexts.some((text) => text.includes('胜利时生命') && text.includes('70%'))
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
