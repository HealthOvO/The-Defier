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

async function safeScreenshot(page, outPath) {
  try {
    await page.screenshot({ path: outPath, fullPage: true, timeout: 5000 });
  } catch (err) {
    console.warn(`[browser_mobile_layout_audit] screenshot skipped: ${err?.message || err}`);
  }
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

  await safeScreenshot(page, path.join(outDir, 'mobile-battle-layout.png'));

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

  await safeScreenshot(page, path.join(outDir, 'mobile-observatory-modal.png'));

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

  await safeScreenshot(page, path.join(outDir, 'mobile-forge-workshop-modal.png'));

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

  await safeScreenshot(page, path.join(outDir, 'mobile-trial-challenge-modal.png'));

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
