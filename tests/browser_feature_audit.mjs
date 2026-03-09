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
  });
  const newCharacterProbe = await page.evaluate(() => {
    const card = document.querySelector('.character-card[data-id="moChen"]');
    const relic = card ? (card.querySelector('.relic-desc')?.textContent || '') : '';
    const card2 = document.querySelector('.character-card[data-id="ningXuan"]');
    const relic2 = card2 ? (card2.querySelector('.relic-desc')?.textContent || '') : '';
    return {
      exists: !!card,
      relic,
      exists2: !!card2,
      relic2
    };
  });
  add(
    'character selection includes newly expanded role moChen',
    !!newCharacterProbe && newCharacterProbe.exists && /首次打出技能牌/.test(newCharacterProbe.relic || ''),
    JSON.stringify(newCharacterProbe || null)
  );
  add(
    'character selection includes newly expanded role ningXuan',
    !!newCharacterProbe && newCharacterProbe.exists2 && /首次打出攻击牌/.test(newCharacterProbe.relic2 || ''),
    JSON.stringify(newCharacterProbe || null)
  );
  await page.evaluate(() => {
    if (!window.game) return;
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

  const encounterThemeProbe = await page.evaluate(() => {
    const env = document.getElementById('battle-environment');
    const chip = env ? env.querySelector('.encounter-theme-chip') : null;
    const enemyTag = document.querySelector('.enemy .enemy-encounter-tag');
    const envStyle = env ? getComputedStyle(env) : null;
    return {
      nodeType: game?.currentBattleNode?.type || '',
      envVisible: !!env && !!envStyle && envStyle.display !== 'none' && envStyle.visibility !== 'hidden',
      chipText: chip ? (chip.textContent || '').trim() : '',
      envTitle: env?.title || '',
      enemyTagText: enemyTag ? (enemyTag.textContent || '').trim() : ''
    };
  });
  add(
    'battle encounter theme chip is visible and synced to enemy encounter tags',
    !!encounterThemeProbe &&
      encounterThemeProbe.envVisible &&
      /遭遇/.test(encounterThemeProbe.chipText || '') &&
      /遭遇/.test(encounterThemeProbe.enemyTagText || '') &&
      /遭遇/.test(encounterThemeProbe.envTitle || '') &&
      /阶/.test(encounterThemeProbe.chipText || ''),
    JSON.stringify(encounterThemeProbe || null)
  );

  const battleCommandProbe = await page.evaluate(async () => {
    if (!window.game || !game.battle) return { ok: false, reason: 'no_battle' };
    game.battle.battleEnded = false;
    game.battle.currentTurn = 'player';
    game.battle.enemies = [
      {
        id: 'audit_command_alpha',
        name: '试作指令敌-甲',
        icon: '🧪',
        currentHp: 180,
        maxHp: 180,
        block: 8,
        buffs: {},
        patterns: [{ type: 'attack', value: 12, intent: '⚔️斩击' }],
        currentPatternIndex: 0
      },
      {
        id: 'audit_command_beta',
        name: '试作指令敌-乙',
        icon: '🧪',
        currentHp: 170,
        maxHp: 170,
        block: 5,
        buffs: {},
        patterns: [{ type: 'defend', value: 9, intent: '🛡️护阵' }],
        currentPatternIndex: 0
      }
    ];
    if (typeof game.battle.updateEnemiesUI === 'function') game.battle.updateEnemiesUI();

    const state = game.battle.commandState;
    if (!state || !state.enabled || !Array.isArray(state.commands) || state.commands.length < 1) {
      return { ok: false, reason: 'no_command_state' };
    }

    state.points = Math.max(8, Number(state.maxPoints) || 12);
    state.commands.forEach((command) => {
      if (!command) return;
      command.cooldownRemaining = 0;
    });
    if (typeof game.battle.markUIDirty === 'function') {
      game.battle.markUIDirty('command', 'player', 'enemies', 'hand', 'energy');
    }
    if (typeof game.battle.updateBattleUI === 'function') game.battle.updateBattleUI();

    let panel = document.getElementById('battle-command-panel');
    const title = panel ? (panel.querySelector('.battle-command-title')?.textContent || '').trim() : '';
    const buttons = panel ? panel.querySelectorAll('.battle-command-btn').length : 0;
    const advisor = panel ? panel.querySelector('#battle-tactical-advisor') : null;
    const advisorTitle = advisor ? (advisor.querySelector('.battle-advisor-title')?.textContent || '').trim() : '';
    const advisorRecommend = advisor ? (advisor.querySelector('.battle-advisor-recommend')?.textContent || '').trim() : '';
    const advisorReadiness = advisor ? (advisor.querySelector('.battle-advisor-readiness')?.textContent || '').trim() : '';
    const advisorThreatChips = advisor ? advisor.querySelectorAll('.battle-advisor-threat-chip').length : 0;
    let advisorCollapsedAfterToggle = false;
    const toggleBtn = panel ? panel.querySelector('.battle-advisor-toggle') : null;
    if (toggleBtn && typeof toggleBtn.click === 'function') {
      toggleBtn.click();
      if (typeof game.battle.updateBattleUI === 'function') game.battle.updateBattleUI();
      panel = document.getElementById('battle-command-panel');
      const advisorAfterToggle = panel ? panel.querySelector('#battle-tactical-advisor') : null;
      advisorCollapsedAfterToggle = !!(advisorAfterToggle && advisorAfterToggle.classList.contains('collapsed'));

      const toggleBackBtn = panel ? panel.querySelector('.battle-advisor-toggle') : null;
      if (toggleBackBtn && typeof toggleBackBtn.click === 'function') {
        toggleBackBtn.click();
        if (typeof game.battle.updateBattleUI === 'function') game.battle.updateBattleUI();
      }
      panel = document.getElementById('battle-command-panel');
    }

    const commandId = state.commands[0].id;
    const before = {
      points: state.points,
      enemyHp: game.battle.enemies.reduce((sum, enemy) => sum + (enemy.currentHp || 0), 0),
      enemyBlock: game.battle.enemies.reduce((sum, enemy) => sum + (enemy.block || 0), 0),
      enemyWeak: game.battle.enemies.reduce((sum, enemy) => sum + ((enemy.buffs && enemy.buffs.weak) || 0), 0),
      block: game.player?.block || 0,
      hand: game.player?.hand?.length || 0,
      energy: game.player?.currentEnergy || 0
    };

    const used = await game.battle.activateBattleCommand(commandId);
    const after = {
      points: state.points,
      enemyHp: game.battle.enemies.reduce((sum, enemy) => sum + (enemy.currentHp || 0), 0),
      enemyBlock: game.battle.enemies.reduce((sum, enemy) => sum + (enemy.block || 0), 0),
      enemyWeak: game.battle.enemies.reduce((sum, enemy) => sum + ((enemy.buffs && enemy.buffs.weak) || 0), 0),
      block: game.player?.block || 0,
      hand: game.player?.hand?.length || 0,
      energy: game.player?.currentEnergy || 0
    };

    return {
      ok:
        !!used &&
        after.points < before.points &&
        (
          after.enemyHp < before.enemyHp ||
          after.enemyBlock < before.enemyBlock ||
          after.enemyWeak > before.enemyWeak ||
          after.block > before.block ||
          after.hand > before.hand ||
          after.energy > before.energy
        ),
      title,
      buttons,
      advisorTitle,
      advisorRecommend,
      advisorReadiness,
      advisorThreatChips,
      advisorCollapsedAfterToggle,
      commandId,
      before,
      after,
      used
    };
  });
  add(
    'battle command panel renders and command activation changes battle state',
    !!battleCommandProbe &&
      !!battleCommandProbe.ok &&
      Number(battleCommandProbe.buttons || 0) >= 3 &&
      /战场指令/.test(battleCommandProbe.title || '') &&
      /战术助手/.test(battleCommandProbe.advisorTitle || '') &&
      /回路/.test(battleCommandProbe.advisorRecommend || '') &&
      Number(battleCommandProbe.advisorThreatChips || 0) >= 1 &&
      /建议|指令|回合|命环/.test(battleCommandProbe.advisorReadiness || '') &&
      !!battleCommandProbe.advisorCollapsedAfterToggle,
    JSON.stringify(battleCommandProbe || null)
  );

  const candyHudProbe = await page.evaluate(() => {
    if (!window.game || !game.player || !game.battle) return null;
    if (typeof game.showScreen === 'function') game.showScreen('battle-screen');
    game.player.maxMilkCandy = Math.max(8, Number(game.player.maxMilkCandy) || 0);
    game.player.milkCandy = 5;
    if (typeof game.battle.updateEnergyUI === 'function') game.battle.updateEnergyUI();
    const container = document.getElementById('candy-container');
    const textEl = document.getElementById('candy-text');
    const style = container ? getComputedStyle(container) : null;
    const text = (textEl?.textContent || '').trim();
    return {
      exists: !!container,
      visible: !!container && !!style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0',
      text,
      title: container?.title || '',
      iconCount: document.querySelectorAll('#candy-orbs .candy-orb').length
    };
  });
  add(
    'battle HUD keeps milk candy resource visible',
    !!candyHudProbe &&
      candyHudProbe.exists &&
      candyHudProbe.visible &&
      /^\d+\/\d+$/.test(candyHudProbe.text || '') &&
      Number(candyHudProbe.iconCount || 0) >= 1 &&
      /奶糖/.test(candyHudProbe.title || ''),
    JSON.stringify(candyHudProbe || null)
  );

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
    Number(missionProgressProbe?.mission?.progress || 0) >= 1 && /[1-3]\/3/.test(missionProgressProbe?.text || ''),
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

  const multiActionIntentProbe = await page.evaluate(() => {
    if (!window.game || !game.battle) return { ok: false, reason: 'no_battle' };
    const enemy = {
      id: 'audit_multi_action',
      name: '试作连锁敌',
      icon: '🧪',
      currentHp: 88,
      maxHp: 88,
      block: 0,
      buffs: {},
      patterns: [{
        type: 'multiAction',
        intent: '⚙️连锁',
        actions: [
          { type: 'debuff', buffType: 'weak', value: 1, intent: '🌀扰法' },
          { type: 'attack', value: 11, intent: '⚔️斩击' },
          { type: 'defend', value: 7, intent: '🛡️固守' }
        ]
      }],
      currentPatternIndex: 0,
      isElite: false
    };
    game.battle.enemies = [enemy];
    if (typeof game.battle.updateEnemiesUI === 'function') {
      game.battle.updateEnemiesUI();
    }
    const intent = document.querySelector('.enemy .enemy-intent');
    const tooltipBind = intent ? (intent.getAttribute('onmouseenter') || '') : '';
    return {
      ok: !!intent && /子行动/.test(tooltipBind) && /1\.施加减益/.test(tooltipBind) && /2\.攻击/.test(tooltipBind),
      className: intent ? intent.className : '',
      tooltipBind
    };
  });
  add(
    'multiAction intent tooltip lists chained sub-actions',
    !!multiActionIntentProbe?.ok,
    JSON.stringify(multiActionIntentProbe || null)
  );

  const enemyRoleTagProbe = await page.evaluate(() => {
    if (!window.game || !game.battle) return { ok: false, reason: 'no_battle' };
    const enemy = {
      id: 'audit_role_hexer',
      name: '试作控场敌',
      icon: '🧿',
      currentHp: 72,
      maxHp: 72,
      block: 0,
      buffs: {},
      patterns: [
        { type: 'debuff', buffType: 'weak', value: 1, intent: '🌀扰法' },
        { type: 'addStatus', cardId: 'heartDemon', count: 1, intent: '🕳️侵染' },
        { type: 'attack', value: 7, intent: '⚔️斩击' }
      ],
      currentPatternIndex: 0,
      isElite: false
    };
    game.battle.enemies = [enemy];
    if (typeof game.battle.updateEnemiesUI === 'function') {
      game.battle.updateEnemiesUI();
    }
    const roleTag = document.querySelector('.enemy .enemy-role-tag');
    const intent = document.querySelector('.enemy .enemy-intent');
    const tooltipBind = intent ? (intent.getAttribute('onmouseenter') || '') : '';
    return {
      ok: !!roleTag && /控场型/.test(roleTag.textContent || '') && roleTag.classList.contains('role-hexer') && /战术：控场型/.test(tooltipBind),
      text: roleTag ? (roleTag.textContent || '').trim() : '',
      className: roleTag ? roleTag.className : '',
      tooltipBind
    };
  });
  add(
    'enemy role tag reflects tactical archetype and tooltip summary',
    !!enemyRoleTagProbe?.ok,
    JSON.stringify(enemyRoleTagProbe || null)
  );

  const enemyPlanTagProbe = await page.evaluate(() => {
    if (!window.game || !game.battle) return { ok: false, reason: 'no_battle' };
    const enemy = {
      id: 'audit_plan_enemy',
      name: '试作节奏敌',
      icon: '🧠',
      currentHp: 95,
      maxHp: 95,
      block: 0,
      buffs: {},
      patterns: [
        { type: 'debuff', buffType: 'weak', value: 1, intent: '🌀扰法' },
        { type: 'attack', value: 10, intent: '⚔️斩击' },
        { type: 'defend', value: 8, intent: '🛡️固守' }
      ],
      currentPatternIndex: 0,
      isElite: false
    };
    if (typeof game.battle.refreshEnemyTacticalPlan === 'function') {
      game.battle.refreshEnemyTacticalPlan(enemy, true);
    }
    game.battle.enemies = [enemy];
    if (typeof game.battle.updateEnemiesUI === 'function') {
      game.battle.updateEnemiesUI();
    }
    const planTag = document.querySelector('.enemy .enemy-plan-tag');
    const intent = document.querySelector('.enemy .enemy-intent');
    const tooltipBind = intent ? (intent.getAttribute('onmouseenter') || '') : '';
    return {
      ok:
        !!planTag &&
        /节奏·/.test(planTag.textContent || '') &&
        /节奏：/.test(tooltipBind || ''),
      text: planTag ? (planTag.textContent || '').trim() : '',
      tooltipBind
    };
  });
  add(
    'enemy tactical plan tag renders and tooltip includes rhythm summary',
    !!enemyPlanTagProbe?.ok,
    JSON.stringify(enemyPlanTagProbe || null)
  );

  const enemyThreatTagProbe = await page.evaluate(() => {
    if (!window.game || !game.battle) return { ok: false, reason: 'no_battle' };
    const enemy = {
      id: 'audit_role_burst_hex',
      name: '试作威胁敌',
      icon: '🧨',
      currentHp: 96,
      maxHp: 96,
      block: 0,
      buffs: {},
      patterns: [
        { type: 'debuff', buffType: 'vulnerable', value: 1, intent: '🩸蚀甲' },
        { type: 'addStatus', cardId: 'heartDemon', count: 2, intent: '🕳️侵染' },
        { type: 'multiAttack', value: 7, count: 3, intent: '⚔️连斩' }
      ],
      currentPatternIndex: 0,
      isElite: false
    };
    game.battle.enemies = [enemy];
    if (typeof game.battle.updateEnemiesUI === 'function') {
      game.battle.updateEnemiesUI();
    }
    const tagMeta = Array.from(document.querySelectorAll('.enemy .enemy-threat-tag')).map((el) => ({
      text: (el.textContent || '').trim(),
      title: el.getAttribute('title') || '',
      highRisk: el.classList.contains('high-risk')
    }));
    const tags = tagMeta.map((item) => item.text);
    const intent = document.querySelector('.enemy .enemy-intent');
    const tooltipBind = intent ? (intent.getAttribute('onmouseenter') || '') : '';
    return {
      ok:
        tags.length >= 1 &&
        tags.some((t) => t.includes('状态压制') || t.includes('爆发斩杀')) &&
        /威胁：/.test(tooltipBind) &&
        tagMeta.some((item) => item.highRisk) &&
        tagMeta.every((item) => item.title.length >= 6),
      tags,
      tagMeta,
      tooltipBind
    };
  });
  add(
    'enemy threat tags show secondary danger profile and tooltip threat summary',
    !!enemyThreatTagProbe?.ok,
    JSON.stringify(enemyThreatTagProbe || null)
  );

  const enemyCounterHintProbe = await page.evaluate(() => {
    if (!window.game || !game.battle || !game.player) return { ok: false, reason: 'no_battle' };
    game.player.hand = [{
      id: 'audit_cleanse_card',
      name: '试作净化牌',
      type: 'skill',
      keywords: ['cleanse'],
      effects: [{ type: 'cleanse', value: 1, target: 'self' }]
    }];
    const enemy = {
      id: 'audit_counter_enemy',
      name: '试作压制敌',
      icon: '🧪',
      currentHp: 88,
      maxHp: 88,
      block: 4,
      buffs: {},
      patterns: [
        { type: 'debuff', buffType: 'weak', value: 1, intent: '🌀扰法' },
        { type: 'addStatus', cardId: 'heartDemon', count: 1, intent: '🕳️侵染' },
        { type: 'attack', value: 8, intent: '⚔️斩击' }
      ],
      currentPatternIndex: 0,
      isElite: false
    };
    game.battle.enemies = [enemy];
    if (typeof game.battle.updateEnemiesUI === 'function') {
      game.battle.updateEnemiesUI();
    }
    const counterTag = document.querySelector('.enemy .enemy-counter-tag');
    const intent = document.querySelector('.enemy .enemy-intent');
    const tooltipBind = intent ? (intent.getAttribute('onmouseenter') || '') : '';
    return {
      ok:
        !!counterTag &&
        /反制·/.test(counterTag.textContent || '') &&
        /反制：/.test(tooltipBind || '') &&
        /净化/.test(tooltipBind || ''),
      text: counterTag ? (counterTag.textContent || '').trim() : '',
      title: counterTag ? (counterTag.getAttribute('title') || '') : '',
      tooltipBind
    };
  });
  add(
    'enemy intent renders counter hint tag and tooltip mitigation advice',
    !!enemyCounterHintProbe?.ok,
    JSON.stringify(enemyCounterHintProbe || null)
  );

  const handCounterTagProbe = await page.evaluate(() => {
    if (!window.game || !game.battle || !game.player) return { ok: false, reason: 'no_battle' };
    game.player.currentEnergy = 3;
    game.player.maxMilkCandy = Math.max(3, Number(game.player.maxMilkCandy) || 0);
    game.player.milkCandy = 1;
    game.player.hand = [
      {
        id: 'audit_hand_cleanse',
        name: '净息回环',
        type: 'law',
        rarity: 'common',
        cost: 1,
        icon: '🫧',
        description: '净化并回复。',
        keywords: ['cleanse'],
        effects: [{ type: 'cleanse', value: 1, target: 'self' }]
      },
      {
        id: 'audit_hand_break',
        name: '穿甲震击',
        type: 'attack',
        rarity: 'common',
        cost: 1,
        icon: '🪓',
        description: '击碎护盾并造成伤害。',
        keywords: ['penetrate', 'burst'],
        effects: [{ type: 'removeBlock', value: 8, target: 'enemy' }, { type: 'damage', value: 11, target: 'enemy' }]
      }
    ];
    const enemy = {
      id: 'audit_counter_hand_enemy',
      name: '试作重压敌',
      icon: '🧱',
      currentHp: 100,
      maxHp: 100,
      block: 14,
      buffs: {},
      patterns: [
        { type: 'debuff', buffType: 'weak', value: 1, intent: '🌀扰法' },
        { type: 'addStatus', cardId: 'heartDemon', count: 1, intent: '🕳️侵染' },
        { type: 'multiAttack', value: 7, count: 3, intent: '⚔️连斩' }
      ],
      currentPatternIndex: 0,
      isElite: false
    };
    game.battle.enemies = [enemy];
    if (typeof game.battle.updateBattleUI === 'function') {
      game.battle.updateBattleUI();
    } else if (typeof game.battle.updateHandUI === 'function') {
      game.battle.updateHandUI();
    }
    const cards = Array.from(document.querySelectorAll('#hand-cards .card')).map((cardEl) => ({
      name: (cardEl.querySelector('.card-name')?.textContent || '').trim(),
      tags: Array.from(cardEl.querySelectorAll('.card-live-tag')).map((tagEl) => (tagEl.textContent || '').trim()),
      className: cardEl.className
    }));
    const hasCleanseTag = cards.some((card) => card.tags.includes('净化'));
    const hasBreakTag = cards.some((card) => card.tags.includes('破盾'));
    const hasPriorityGlow = cards.some((card) => /priority-play/.test(card.className || ''));
    return {
      ok: cards.length >= 2 && hasCleanseTag && hasBreakTag && hasPriorityGlow,
      cards
    };
  });
  add(
    'hand cards show dynamic counter tags for current enemy threat profile',
    !!handCounterTagProbe?.ok,
    JSON.stringify(handCounterTagProbe || null)
  );

  const resonanceMatrixProbe = await page.evaluate(async () => {
    if (!window.game || !game.battle || !game.player) return { ok: false, reason: 'no_battle' };
    const prevIsEndlessActive = game.isEndlessActive;
    const prevEnsureEndlessState = game.ensureEndlessState;
    const endlessMeta = {
      active: true,
      pressure: 7,
      currentCycle: 4
    };
    game.isEndlessActive = () => true;
    game.ensureEndlessState = () => endlessMeta;
    const hasCatalogEntry =
      typeof game.battle.getBattleCommandCatalog === 'function' &&
      game.battle.getBattleCommandCatalog().some((command) => command && command.id === 'resonance_matrix_order');
    game.player.fateRing = game.player.fateRing || {};
    game.player.fateRing.path = 'convergence';
    game.player.getPathDoctrineProfile = () => ({
      path: 'convergence',
      tier: 2,
      commandCostDiscount: 0,
      commandGainBonus: 0,
      lowBlockDamageBonus: 0
    });
    game.player.currentHp = 98;
    game.player.maxHp = 120;
    game.player.buffs = {};

    const enemy = {
      id: 'audit_matrix_break_enemy',
      name: '试作铁垒敌',
      icon: '🧱',
      currentHp: 160,
      maxHp: 160,
      block: 24,
      buffs: {},
      patterns: [
        { type: 'defend', value: 12, intent: '🛡️固守' },
        { type: 'attack', value: 9, intent: '⚔️斩击' }
      ],
      currentPatternIndex: 0,
      isElite: false
    };
    game.battle.enemies = [enemy];
    const before = {
      hp: enemy.currentHp || 0,
      block: enemy.block || 0,
      vulnerable: (enemy.buffs && enemy.buffs.vulnerable) || 0
    };
    const used = await game.battle.executeBattleCommandEffect({ id: 'resonance_matrix_order' });
    const after = {
      hp: enemy.currentHp || 0,
      block: enemy.block || 0,
      vulnerable: (enemy.buffs && enemy.buffs.vulnerable) || 0
    };
    if (typeof prevIsEndlessActive === 'function') game.isEndlessActive = prevIsEndlessActive;
    if (typeof prevEnsureEndlessState === 'function') game.ensureEndlessState = prevEnsureEndlessState;
    return {
      ok: !!hasCatalogEntry && !!used && after.block < before.block && after.vulnerable > before.vulnerable && after.hp < before.hp,
      hasCatalogEntry,
      used,
      before,
      after
    };
  });
  add(
    'endless resonance matrix command applies adaptive break branch against shield-heavy threat',
    !!resonanceMatrixProbe?.ok,
    JSON.stringify(resonanceMatrixProbe || null)
  );

  const resonanceMatrixStrategyProbe = await page.evaluate(async () => {
    if (!window.game || !game.battle || !game.player) return { ok: false, reason: 'no_battle' };
    const prevIsEndlessActive = game.isEndlessActive;
    const prevEnsureEndlessState = game.ensureEndlessState;
    const endlessMeta = { active: true, pressure: 8, currentCycle: 5 };
    game.isEndlessActive = () => true;
    game.ensureEndlessState = () => endlessMeta;

    game.player.fateRing = game.player.fateRing || {};
    game.player.fateRing.path = 'convergence';
    game.player.getPathDoctrineProfile = () => ({
      path: 'convergence',
      tier: 2,
      commandCostDiscount: 0,
      commandGainBonus: 0,
      lowBlockDamageBonus: 0
    });
    game.player.currentHp = 44;
    game.player.maxHp = 120;
    game.player.block = 0;
    game.player.buffs = {};

    const enemy = {
      id: 'audit_matrix_forced_break',
      name: '试作压阵敌',
      icon: '🧱',
      currentHp: 180,
      maxHp: 180,
      block: 26,
      buffs: {},
      patterns: [
        { type: 'multiAttack', value: 9, count: 3, intent: '⚔️连斩' },
        { type: 'attack', value: 12, intent: '⚔️斩击' }
      ],
      currentPatternIndex: 0
    };
    game.battle.enemies = [enemy];
    const before = {
      enemyBlock: enemy.block || 0,
      playerBlock: game.player.block || 0
    };
    const used = await game.battle.executeBattleCommandEffect({ id: 'resonance_matrix_order', strategy: 'break' });
    const after = {
      enemyBlock: enemy.block || 0,
      playerBlock: game.player.block || 0
    };

    if (typeof prevIsEndlessActive === 'function') game.isEndlessActive = prevIsEndlessActive;
    if (typeof prevEnsureEndlessState === 'function') game.ensureEndlessState = prevEnsureEndlessState;
    return {
      ok: !!used && after.enemyBlock < before.enemyBlock && after.playerBlock === before.playerBlock,
      used,
      before,
      after
    };
  });
  add(
    'resonance matrix supports forced strategy mode to override auto branch',
    !!resonanceMatrixStrategyProbe?.ok,
    JSON.stringify(resonanceMatrixStrategyProbe || null)
  );

  const resonanceMatrixPresetProbe = await page.evaluate(() => {
    if (!window.game || !game.battle || !game.player) return { ok: false, reason: 'no_battle' };
    const prevIsEndlessActive = game.isEndlessActive;
    const prevEnsureEndlessState = game.ensureEndlessState;
    const endlessMeta = { active: true, pressure: 7, currentCycle: 6 };
    game.isEndlessActive = () => true;
    game.ensureEndlessState = () => endlessMeta;

    game.player.fateRing = game.player.fateRing || {};
    game.player.fateRing.path = 'convergence';
    game.player.buffs = {};
    game.battle.currentTurn = 'player';
    game.battle.battleEnded = false;
    game.battle.isProcessingCard = false;
    game.battle.isTurnTransitioning = false;
    game.battle.enemies = [{
      id: 'audit_matrix_preset_enemy',
      name: '试作矩阵敌',
      icon: '🧪',
      currentHp: 160,
      maxHp: 160,
      block: 20,
      buffs: {},
      patterns: [
        { type: 'defend', value: 12, intent: '🛡️固守' },
        { type: 'attack', value: 10, intent: '⚔️斩击' }
      ],
      currentPatternIndex: 0
    }];

    if (typeof game.battle.initializeBattleCommandSystem === 'function') game.battle.initializeBattleCommandSystem();
    const state = game.battle.commandState;
    if (!state || !state.enabled || !Array.isArray(state.commands)) {
      if (typeof prevIsEndlessActive === 'function') game.isEndlessActive = prevIsEndlessActive;
      if (typeof prevEnsureEndlessState === 'function') game.ensureEndlessState = prevEnsureEndlessState;
      return { ok: false, reason: 'no_command_state' };
    }
    const matrix = state.commands.find((command) => command && command.id === 'resonance_matrix_order');
    if (!matrix) {
      if (typeof prevIsEndlessActive === 'function') game.isEndlessActive = prevIsEndlessActive;
      if (typeof prevEnsureEndlessState === 'function') game.ensureEndlessState = prevEnsureEndlessState;
      return { ok: false, reason: 'no_matrix_command' };
    }
    state.points = Math.max(8, Number(state.maxPoints) || 12);
    state.commands.forEach((command) => {
      if (!command) return;
      command.cooldownRemaining = 0;
    });

    if (typeof game.battle.setResonanceMatrixSignalMode === 'function') {
      game.battle.setResonanceMatrixSignalMode('break', { silent: true });
    }
    if (typeof game.battle.markUIDirty === 'function') game.battle.markUIDirty('command', 'enemies');
    if (typeof game.battle.updateBattleUI === 'function') game.battle.updateBattleUI();

    const panel = document.getElementById('battle-command-panel');
    const activeMode = panel?.querySelector('.battle-advisor-matrix-btn.active')?.getAttribute('data-mode') || '';
    const pendingText = (panel?.querySelector('.battle-advisor-pending-mode')?.textContent || '').trim();
    const queuedBefore = Number(game.player?.buffs?.matrixBreakSignal) || 0;
    const consumed = typeof game.battle.consumeResonanceMatrixSignalMode === 'function'
      ? game.battle.consumeResonanceMatrixSignalMode()
      : null;
    const queuedAfter = Number(game.player?.buffs?.matrixBreakSignal) || 0;

    if (typeof prevIsEndlessActive === 'function') game.isEndlessActive = prevIsEndlessActive;
    if (typeof prevEnsureEndlessState === 'function') game.ensureEndlessState = prevEnsureEndlessState;

    return {
      ok: queuedBefore > 0 && queuedAfter === 0 && activeMode === 'break' && /破阵/.test(pendingText) && consumed?.id === 'break',
      activeMode,
      pendingText,
      queuedBefore,
      queuedAfter,
      consumedId: consumed?.id || ''
    };
  });
  add(
    'resonance matrix tactical advisor preset can queue and consume selected mode',
    !!resonanceMatrixPresetProbe?.ok,
    JSON.stringify(resonanceMatrixPresetProbe || null)
  );

  const endlessAffixExtensionProbe = await page.evaluate(() => {
    if (!window.game || typeof game.applyEndlessCounterplayAffix !== 'function') return { ok: false, reason: 'no_game' };
    const state = game.ensureEndlessState ? game.ensureEndlessState() : null;
    if (!state || typeof state !== 'object') return { ok: false, reason: 'no_endless_state' };
    const prevHeat = Number(state.barterHeat) || 0;
    const prevCycle = Number(state.currentCycle) || 0;
    state.barterHeat = 8;
    state.currentCycle = 19;

    let picked = null;
    for (let i = 0; i < 24; i += 1) {
      const enemy = {
        id: `audit_affix_${i}`,
        name: `试作词缀敌-${i}`,
        currentHp: 120,
        maxHp: 120,
        block: 0,
        buffs: {},
        patterns: [{ type: 'attack', value: 10, intent: '⚔️' }]
      };
      game.applyEndlessCounterplayAffix(enemy, { pressure: 8 });
      if (
        Number(enemy.__endlessAntiEnergy) > 0 ||
        Number(enemy.__endlessAntiRefund) > 0 ||
        Number(enemy.__endlessAntiBurst) > 0
      ) {
        picked = enemy;
        break;
      }
    }

    state.barterHeat = prevHeat;
    state.currentCycle = prevCycle;
    const desc = String(picked?.encounterAffixDesc || '');
    return {
      ok: !!picked && /[\u4e00-\u9fa5]/.test(desc),
      pickedId: picked?.__endlessCounterAffixId || '',
      antiEnergy: Number(picked?.__endlessAntiEnergy) || 0,
      antiRefund: Number(picked?.__endlessAntiRefund) || 0,
      antiBurst: Number(picked?.__endlessAntiBurst) || 0,
      desc
    };
  });
  add(
    'endless counterplay affix expansion includes anti-energy/refund/burst with localized text',
    !!endlessAffixExtensionProbe?.ok,
    JSON.stringify(endlessAffixExtensionProbe || null)
  );

  await page.setViewportSize({ width: 900, height: 720 });
  await page.waitForTimeout(260);
  const compactHandViewportProbe = await page.evaluate(() => {
    if (!window.game || !game.battle || !game.player) return { ok: false, reason: 'no_battle' };
    if (typeof game.showScreen === 'function') game.showScreen('battle-screen');
    const makeCard = (id, name, type, cost, icon, desc) => ({
      id,
      name,
      type,
      rarity: 'common',
      cost,
      icon,
      description: desc,
      effects: [{ type: type === 'defense' ? 'block' : 'damage', value: type === 'defense' ? 7 : 8, target: type === 'defense' ? 'self' : 'enemy' }]
    });
    game.player.hand = [
      makeCard('audit_compact_1', '裂光斩', 'attack', 1, '⚔️', '造成伤害。'),
      makeCard('audit_compact_2', '归元护体', 'defense', 1, '🛡️', '获得护盾。'),
      makeCard('audit_compact_3', '破势连击', 'attack', 2, '🪓', '造成多段伤害。'),
      makeCard('audit_compact_4', '净息回环', 'law', 1, '🫧', '净化并回复。'),
      makeCard('audit_compact_5', '焚脉', 'attack', 1, '🔥', '附加灼烧。'),
      makeCard('audit_compact_6', '守心诀', 'defense', 1, '🧘', '强化防御。'),
      makeCard('audit_compact_7', '断流刺', 'attack', 2, '🗡️', '打击破绽。'),
      makeCard('audit_compact_8', '灵潮', 'law', 1, '🌊', '抽牌增益。')
    ];
    if (game.battle && game.battle.player) {
      game.battle.player.hand = game.player.hand;
    }
    game.player.currentEnergy = 3;
    if (typeof game.battle.updateHandUI === 'function') {
      game.battle.updateHandUI();
    } else if (typeof game.battle.updateBattleUI === 'function') {
      game.battle.updateBattleUI();
    }

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const calcVisibleRatio = (rect) => {
      if (!rect || rect.height <= 0 || viewportHeight <= 0) return 0;
      const visibleTop = Math.max(0, rect.top);
      const visibleBottom = Math.min(viewportHeight, rect.bottom);
      const visible = Math.max(0, visibleBottom - visibleTop);
      return Number((visible / rect.height).toFixed(3));
    };
    const cards = Array.from(document.querySelectorAll('#hand-cards .card')).map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        name: (el.querySelector('.card-name')?.textContent || '').trim(),
        top: Number(rect.top.toFixed(1)),
        bottom: Number(rect.bottom.toFixed(1)),
        height: Number(rect.height.toFixed(1)),
        visibleRatio: calcVisibleRatio(rect)
      };
    });
    const minVisibleRatio = cards.reduce((min, card) => Math.min(min, card.visibleRatio), 1);
    const handAreaRect = document.querySelector('.hand-area')?.getBoundingClientRect() || null;
    const deckRect = document.getElementById('deck-pile')?.getBoundingClientRect() || null;
    const discardRect = document.getElementById('discard-pile')?.getBoundingClientRect() || null;
    const pileVisible = !!deckRect && !!discardRect
      && deckRect.bottom <= viewportHeight + 1
      && discardRect.bottom <= viewportHeight + 1;
    return {
      ok: cards.length >= 6 && minVisibleRatio >= 0.72 && pileVisible,
      viewportHeight,
      minVisibleRatio,
      pileVisible,
      handBottom: handAreaRect ? Number(handAreaRect.bottom.toFixed(1)) : null,
      cards
    };
  });
  add(
    'compact viewport keeps battle hand cards and piles visible without bottom clipping',
    !!compactHandViewportProbe?.ok,
    JSON.stringify(compactHandViewportProbe || null)
  );
  await safeScreenshot(page, path.join(outDir, 'feature-audit-compact-hand.png'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(200);

  const encounterAffixProbe = await page.evaluate(() => {
    if (!window.game || !game.battle) return { ok: false, reason: 'no_battle' };
    const enemy = {
      id: 'audit_encounter_affix',
      name: '试作遭遇敌',
      icon: '⚙️',
      currentHp: 102,
      maxHp: 102,
      block: 9,
      buffs: {},
      patterns: [{ type: 'attack', value: 12, intent: '⚔️斩击' }],
      currentPatternIndex: 0,
      isElite: false,
      encounterThemeTag: '咒流',
      encounterThemeTier: 3,
      encounterThemeDesc: '敌方更容易打出易伤压制，需主动抢节奏。',
      encounterAffixTag: '咒潮',
      encounterAffixDesc: '每轮遭遇补充压制减益并可能塞入状态牌。'
    };
    game.battle.enemies = [enemy];
    if (typeof game.battle.updateEnemiesUI === 'function') {
      game.battle.updateEnemiesUI();
    }
    const themeTag = document.querySelector('.enemy .enemy-encounter-tag');
    const affixTag = document.querySelector('.enemy .enemy-encounter-affix');
    const intent = document.querySelector('.enemy .enemy-intent');
    const tooltipBind = intent ? (intent.getAttribute('onmouseenter') || '') : '';
    return {
      ok:
        !!themeTag &&
        !!affixTag &&
        /III阶/.test(themeTag.textContent || '') &&
        /词缀/.test(affixTag.textContent || '') &&
        /遭遇词缀：咒潮/.test(tooltipBind || ''),
      themeText: themeTag ? (themeTag.textContent || '').trim() : '',
      affixText: affixTag ? (affixTag.textContent || '').trim() : '',
      tooltipBind
    };
  });
  add(
    'encounter affix tag renders on enemy card and tooltip includes affix summary',
    !!encounterAffixProbe?.ok,
    JSON.stringify(encounterAffixProbe || null)
  );

  const shopExpandedProbe = await page.evaluate(() => {
    if (!window.game || !game.map) return null;
    const node = { id: 91001, row: 2, type: 'shop', completed: false, accessible: true };
    game.showShop(node);
    const names = Array.from(document.querySelectorAll('#shop-services-container .service-name')).map((el) => (el.textContent || '').trim());
    return {
      mode: game.currentScreen,
      hasScoutPack: names.includes('侦巡补给包'),
      hasCampRation: names.includes('行军口粮'),
      hasFateLedger: names.includes('命轨账簿'),
      hasPulseCatalyst: names.includes('灵息催化剂'),
      hasInsightIncense: names.includes('悟境香'),
      hasFieldMedic: names.includes('战地医师签约'),
      names
    };
  });
  add(
    'map shop renders newly expanded service set',
    !!shopExpandedProbe &&
      shopExpandedProbe.mode === 'shop-screen' &&
      shopExpandedProbe.hasScoutPack &&
      shopExpandedProbe.hasCampRation &&
      shopExpandedProbe.hasFateLedger &&
      shopExpandedProbe.hasPulseCatalyst &&
      shopExpandedProbe.hasInsightIncense &&
      shopExpandedProbe.hasFieldMedic,
    JSON.stringify(shopExpandedProbe || null)
  );

  const scoutPackLocalizationProbe = await page.evaluate(() => {
    if (!window.game || !Array.isArray(game.shopServices)) return null;
    game.player.gold = Math.max(Number(game.player.gold) || 0, 2000);
    const scout = game.shopServices.find((service) => service && service.id === 'scoutPack');
    if (!scout || typeof game.showShopCardDraft !== 'function') {
      return { hasScout: !!scout };
    }
    game.showShopCardDraft(scout);
    const modal = document.getElementById('event-modal');
    const icon = document.getElementById('event-icon');
    const iconStyle = icon ? getComputedStyle(icon) : null;
    const choiceTexts = Array.from(document.querySelectorAll('#event-choices .event-choice .choice-title')).map((el) =>
      (el.textContent || '').replace(/\s+/g, ' ').trim()
    );
    const rawChoiceText = choiceTexts.join(' | ');
    const hasEnglishRarity = /\b(common|uncommon|rare|epic|legendary)\b/i.test(rawChoiceText);
    const rarityBadgeCount = document.querySelectorAll('#event-choices .event-choice .choice-rarity').length;
    const iconWidth = iconStyle ? Number.parseFloat(iconStyle.width || '0') : 0;
    const iconHeight = iconStyle ? Number.parseFloat(iconStyle.height || '0') : 0;
    const iconCentered = !!iconStyle && iconStyle.display.includes('flex') && iconStyle.alignItems === 'center' && iconStyle.justifyContent === 'center';
    const result = {
      hasScout: true,
      modalActive: !!modal && modal.classList.contains('active'),
      choiceCount: choiceTexts.length,
      hasEnglishRarity,
      rarityBadgeCount,
      iconText: (icon?.textContent || '').trim(),
      iconWidth,
      iconHeight,
      iconCentered
    };
    if (typeof game.closeModal === 'function') game.closeModal();
    return result;
  });
  add(
    'scout pack draft uses localized rarity tags and stable icon layout',
    !!scoutPackLocalizationProbe &&
      scoutPackLocalizationProbe.hasScout &&
      scoutPackLocalizationProbe.modalActive &&
      Number(scoutPackLocalizationProbe.choiceCount || 0) >= 3 &&
      Number(scoutPackLocalizationProbe.rarityBadgeCount || 0) >= 3 &&
      !scoutPackLocalizationProbe.hasEnglishRarity &&
      scoutPackLocalizationProbe.iconText === '🎒' &&
      Number(scoutPackLocalizationProbe.iconWidth || 0) >= 60 &&
      Number(scoutPackLocalizationProbe.iconHeight || 0) >= 60 &&
      !!scoutPackLocalizationProbe.iconCentered,
    JSON.stringify(scoutPackLocalizationProbe || null)
  );

  const shopServiceEffectProbe = await page.evaluate(() => {
    if (!window.game || !Array.isArray(game.shopServices)) return null;
    game.player.currentHp = Math.max(1, Math.floor(game.player.maxHp * 0.5));
    game.player.gold = Math.max(game.player.gold || 0, 2000);
    const before = {
      hp: game.player.currentHp,
      gold: game.player.gold,
      ringExp: game.player.fateRing?.exp || 0,
      buffs: { ...(game.player.adventureBuffs || {}) }
    };

    const campIdx = game.shopServices.findIndex((s) => s && s.id === 'campRation');
    if (campIdx >= 0) game.buyItem('service', campIdx);
    const fateIdx = game.shopServices.findIndex((s) => s && s.id === 'fateLedger');
    if (fateIdx >= 0) game.buyItem('service', fateIdx);
    const pulseIdx = game.shopServices.findIndex((s) => s && s.id === 'pulseCatalyst');
    if (pulseIdx >= 0) game.buyItem('service', pulseIdx);
    const insightIdx = game.shopServices.findIndex((s) => s && s.id === 'insightIncense');
    if (insightIdx >= 0) game.buyItem('service', insightIdx);
    const medicIdx = game.shopServices.findIndex((s) => s && s.id === 'fieldMedic');
    if (medicIdx >= 0) game.buyItem('service', medicIdx);

    const after = {
      hp: game.player.currentHp,
      gold: game.player.gold,
      ringExp: game.player.fateRing?.exp || 0,
      buffs: { ...(game.player.adventureBuffs || {}) }
    };
    return { before, after };
  });
  add(
    'expanded shop services apply recovery and adventure buffs',
    !!shopServiceEffectProbe &&
      (shopServiceEffectProbe.after?.hp || 0) > (shopServiceEffectProbe.before?.hp || 0) &&
      (shopServiceEffectProbe.after?.ringExp || 0) >= (shopServiceEffectProbe.before?.ringExp || 0) &&
      (shopServiceEffectProbe.after?.buffs?.openingBlockBoostBattles || 0) > (shopServiceEffectProbe.before?.buffs?.openingBlockBoostBattles || 0) &&
      (shopServiceEffectProbe.after?.buffs?.victoryGoldBoostBattles || 0) > (shopServiceEffectProbe.before?.buffs?.victoryGoldBoostBattles || 0) &&
      (shopServiceEffectProbe.after?.buffs?.firstTurnEnergyBoostBattles || 0) > (shopServiceEffectProbe.before?.buffs?.firstTurnEnergyBoostBattles || 0) &&
      (shopServiceEffectProbe.after?.buffs?.ringExpBoostBattles || 0) > (shopServiceEffectProbe.before?.buffs?.ringExpBoostBattles || 0) &&
      (shopServiceEffectProbe.after?.buffs?.victoryHealBoostBattles || 0) > (shopServiceEffectProbe.before?.buffs?.victoryHealBoostBattles || 0),
    JSON.stringify(shopServiceEffectProbe || null)
  );

  await page.evaluate(() => {
    if (window.game && typeof game.closeShop === 'function') game.closeShop();
  });
  await page.waitForTimeout(250);

  const mapBuffPanelProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showScreen !== 'function') return null;
    game.showScreen('map-screen');
    const panel = document.getElementById('map-adventure-buffs');
    const chips = Array.from(document.querySelectorAll('#map-adventure-buffs .map-buff-chip')).map((el) =>
      (el.textContent || '').replace(/\s+/g, ' ').trim()
    );
    return {
      visible: !!panel && getComputedStyle(panel).display !== 'none',
      chipCount: chips.length,
      chips
    };
  });
  add(
    'map status renders adventure buff panel when buffs are active',
    !!mapBuffPanelProbe &&
      mapBuffPanelProbe.visible &&
      mapBuffPanelProbe.chipCount >= 3 &&
      mapBuffPanelProbe.chips.some((t) => t.includes('战后医护')),
    JSON.stringify(mapBuffPanelProbe || null)
  );

  const pathSynergyComboProbe = await page.evaluate(() => {
    if (!window.game || !game.map || !game.player) return null;
    game.player.fateRing = game.player.fateRing || {};
    game.player.fateRing.path = 'convergence';
    game.player.fateRing.exp = 0;
    game.player.pathSynergyState = null;

    if (typeof game.player.ensureAdventureBuffs === 'function') {
      game.player.ensureAdventureBuffs();
    } else {
      game.player.adventureBuffs = {
        firstTurnDrawBoostBattles: 0,
        openingBlockBoostBattles: 0,
        victoryGoldBoostBattles: 0,
        firstTurnEnergyBoostBattles: 0,
        ringExpBoostBattles: 0,
        victoryHealBoostBattles: 0
      };
    }
    Object.keys(game.player.adventureBuffs || {}).forEach((key) => {
      game.player.adventureBuffs[key] = 0;
    });

    if (typeof game.map.applyPathNodeSynergyReward !== 'function') return { missing: true };
    game.map.applyPathNodeSynergyReward({ type: 'event' });
    game.map.applyPathNodeSynergyReward({ type: 'event' });

    const state = game.player.pathSynergyState || null;
    return {
      ringExp: game.player.fateRing.exp || 0,
      drawBuff: game.player.adventureBuffs.firstTurnDrawBoostBattles || 0,
      energyBuff: game.player.adventureBuffs.firstTurnEnergyBoostBattles || 0,
      streak: state ? Number(state.streak || 0) : null
    };
  });
  add(
    'path synergy combo grants staged bonuses on repeated favored node hits',
    !!pathSynergyComboProbe &&
      !pathSynergyComboProbe.missing &&
      Number(pathSynergyComboProbe.ringExp || 0) >= 34 &&
      Number(pathSynergyComboProbe.drawBuff || 0) >= 1 &&
      Number(pathSynergyComboProbe.energyBuff || 0) >= 2,
    JSON.stringify(pathSynergyComboProbe || null)
  );

  const routeHintProbe = await page.evaluate(() => {
    if (!window.game || !game.map || typeof game.showScreen !== 'function') return null;
    game.showScreen('map-screen');
    game.map.nodes = [
      [
        { id: 910001, row: 0, type: 'enemy', completed: true, accessible: true },
        { id: 910002, row: 0, type: 'elite', completed: true, accessible: true }
      ],
      [
        { id: 910003, row: 1, type: 'enemy', completed: true, accessible: true },
        { id: 910004, row: 1, type: 'elite', completed: true, accessible: true }
      ],
      [
        { id: 910005, row: 2, type: 'enemy', completed: true, accessible: true }
      ],
      [
        { id: 910006, row: 3, type: 'enemy', completed: true, accessible: true }
      ],
      [
        { id: 910007, row: 4, type: 'trial', completed: false, accessible: true }
      ]
    ];
    if (typeof game.map.updateRouteHintPanel === 'function') game.map.updateRouteHintPanel();
    const panel = document.getElementById('map-route-hints');
    const chips = Array.from(document.querySelectorAll('#map-route-hints .map-route-chip')).map((el) =>
      (el.textContent || '').replace(/\s+/g, ' ').trim()
    );
    return {
      visible: !!panel && getComputedStyle(panel).display !== 'none',
      chipCount: chips.length,
      chips
    };
  });
  add(
    'map route hint panel exposes pity/density chips under homogeneous combat routes',
    !!routeHintProbe &&
      routeHintProbe.visible &&
      routeHintProbe.chipCount >= 2 &&
      routeHintProbe.chips.some((t) => t.includes('保底')) &&
      routeHintProbe.chips.some((t) => t.includes('补偿')),
    JSON.stringify(routeHintProbe || null)
  );

  const campExpandedProbe = await page.evaluate(() => {
    if (!window.game || !game.map) return null;
    game.showCampfire({ id: 91002, row: 2, type: 'rest', completed: false, accessible: true });
    const title = document.getElementById('event-title')?.textContent || '';
    const choices = Array.from(document.querySelectorAll('#event-choices .event-choice')).map((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim());
    return {
      title,
      hasDrill: choices.some((t) => t.includes('战术演练')),
      hasWard: choices.some((t) => t.includes('布设结界')),
      hasBounty: choices.some((t) => t.includes('悬赏部署')),
      hasPulse: choices.some((t) => t.includes('灵息调和')),
      hasMedic: choices.some((t) => t.includes('战地整备')),
      hasInsight: choices.some((t) => t.includes('逆炼冥想')),
      choiceCount: choices.length
    };
  });
  add(
    'campfire renders expanded strategic options',
    !!campExpandedProbe &&
      /野外营地/.test(campExpandedProbe.title) &&
      campExpandedProbe.hasDrill &&
      campExpandedProbe.hasWard &&
      campExpandedProbe.hasBounty &&
      campExpandedProbe.hasPulse &&
      campExpandedProbe.hasMedic &&
      campExpandedProbe.hasInsight &&
      campExpandedProbe.choiceCount >= 8,
    JSON.stringify(campExpandedProbe || null)
  );

  await page.evaluate(() => {
    if (!window.game || typeof getRandomEvent !== 'function') return;
    window.__debugEventQueue = ['floatingMarketRift'];
    const evt = getRandomEvent();
    if (!evt) return;
    game.showEventModal(evt, { id: 91003, row: 2, type: 'event', completed: false, accessible: true });
  });
  await page.waitForTimeout(120);
  const temporaryMarketBefore = await page.evaluate(() => ({
    gold: game.player?.gold || 0,
    buffs: { ...(game.player?.adventureBuffs || {}) }
  }));
  await page.click('#event-choices .event-choice:nth-child(1)', { timeout: 3000, force: true });
  await page.waitForTimeout(260);
  const marketTitle = await page.evaluate(() => document.getElementById('event-title')?.textContent || '');
  const offerCount = await page.evaluate(() => document.querySelectorAll('#event-choices .event-choice').length);
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('#event-choices .event-choice'));
    const buyBtn = buttons.find((btn) => {
      if (btn.classList.contains('disabled')) return false;
      const text = (btn.textContent || '').replace(/\s+/g, ' ');
      return !text.includes('不做交易') && !text.includes('继续前进');
    });
    if (buyBtn) {
      buyBtn.click();
      return;
    }
    const leaveBtn = buttons.find((btn) => (btn.textContent || '').includes('不做交易'));
    if (leaveBtn) leaveBtn.click();
  });
  await page.waitForTimeout(220);
  const continueVisible = await page.locator('#event-choices .event-choice').first().isVisible().catch(() => false);
  if (continueVisible) {
    await page.click('#event-choices .event-choice:nth-child(1)', { timeout: 3000, force: true });
  }
  await page.waitForTimeout(180);
  const temporaryMarketAfter = await page.evaluate(() => ({
    gold: game.player?.gold || 0,
    buffs: { ...(game.player?.adventureBuffs || {}) }
  }));
  const temporaryMarketProbe = {
    marketTitle,
    offerCount,
    before: temporaryMarketBefore,
    after: temporaryMarketAfter
  };
  add(
    'floating market event opens temporary shop and applies reward',
    !!temporaryMarketProbe &&
      /裂隙/.test(temporaryMarketProbe.marketTitle || '') &&
      Number(temporaryMarketProbe.offerCount || 0) >= 2 &&
      (
        (temporaryMarketProbe.after?.gold || 0) < (temporaryMarketProbe.before?.gold || 0) ||
        (temporaryMarketProbe.after?.buffs?.firstTurnDrawBoostBattles || 0) > (temporaryMarketProbe.before?.buffs?.firstTurnDrawBoostBattles || 0) ||
        (temporaryMarketProbe.after?.buffs?.openingBlockBoostBattles || 0) > (temporaryMarketProbe.before?.buffs?.openingBlockBoostBattles || 0) ||
        (temporaryMarketProbe.after?.buffs?.victoryGoldBoostBattles || 0) > (temporaryMarketProbe.before?.buffs?.victoryGoldBoostBattles || 0) ||
        (temporaryMarketProbe.after?.buffs?.firstTurnEnergyBoostBattles || 0) > (temporaryMarketProbe.before?.buffs?.firstTurnEnergyBoostBattles || 0) ||
        (temporaryMarketProbe.after?.buffs?.ringExpBoostBattles || 0) > (temporaryMarketProbe.before?.buffs?.ringExpBoostBattles || 0) ||
        (temporaryMarketProbe.after?.buffs?.victoryHealBoostBattles || 0) > (temporaryMarketProbe.before?.buffs?.victoryHealBoostBattles || 0)
      ),
    JSON.stringify(temporaryMarketProbe || null)
  );

  await page.evaluate(() => {
    if (!window.game || typeof getRandomEvent !== 'function') return;
    window.__debugEventQueue = ['emberCampSignal'];
    const evt = getRandomEvent();
    if (!evt) return;
    game.showEventModal(evt, { id: 91004, row: 2, type: 'event', completed: false, accessible: true });
  });
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('#event-choices .event-choice'));
    const entry = buttons.find((btn) => (btn.textContent || '').includes('响应营讯'));
    if (entry) {
      entry.click();
      return;
    }
    if (buttons[0]) buttons[0].click();
  });
  await page.waitForTimeout(260);
  const campSignalProbe = await page.evaluate(() => {
    const title = document.getElementById('event-title')?.textContent || '';
    const choices = Array.from(document.querySelectorAll('#event-choices .event-choice')).map((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim());
    return {
      title,
      count: choices.length
    };
  });
  add(
    'camp signal event can route into expanded campfire flow',
    !!campSignalProbe &&
      /野外营地/.test(campSignalProbe.title) &&
      campSignalProbe.count >= 5,
    JSON.stringify(campSignalProbe || null)
  );

  await page.evaluate(() => {
    if (!window.game || typeof getRandomEvent !== 'function') return;
    game.player.gold = 30;
    window.__debugEventQueue = ['riftAidConvoy'];
    const evt = getRandomEvent();
    if (!evt) return;
    game.showEventModal(evt, { id: 91005, row: 2, type: 'event', completed: false, accessible: true });
  });
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('#event-choices .event-choice'));
    const entry = buttons.find((btn) => (btn.textContent || '').includes('进入救援补给点'));
    if (entry) {
      entry.click();
      return;
    }
    if (buttons[0]) buttons[0].click();
  });
  await page.waitForTimeout(220);
  const convoyReliefProbe = await page.evaluate(() => {
    const title = document.getElementById('event-title')?.textContent || '';
    const choices = Array.from(document.querySelectorAll('#event-choices .event-choice')).map((el) =>
      (el.textContent || '').replace(/\s+/g, ' ').trim()
    );
    const hasLowPrice = choices.some((text) => {
      const match = text.match(/(\d+)\s*灵石/);
      return !!match && Number(match[1]) <= 45;
    });
    return {
      title,
      count: choices.length,
      hasReliefOffer: choices.some((t) => t.includes('应急补给券') || t.includes('补给')),
      hasLowPrice,
      choices
    };
  });
  add(
    'rift aid convoy temporary shop guarantees low-cost relief offer',
    !!convoyReliefProbe &&
      /补给点|车队|裂隙/.test(convoyReliefProbe.title) &&
      convoyReliefProbe.count >= 3 &&
      (convoyReliefProbe.hasReliefOffer || convoyReliefProbe.hasLowPrice),
    JSON.stringify(convoyReliefProbe || null)
  );
  await page.evaluate(() => {
    const leaveBtn = Array.from(document.querySelectorAll('#event-choices .event-choice'))
      .find((btn) => (btn.textContent || '').includes('不做交易'));
    if (leaveBtn) leaveBtn.click();
  });
  await page.waitForTimeout(180);
  const leaveContinueVisible = await page.locator('#event-choices .event-choice').first().isVisible().catch(() => false);
  if (leaveContinueVisible) {
    await page.click('#event-choices .event-choice:nth-child(1)', { timeout: 3000, force: true });
  }
  await page.waitForTimeout(180);

  const victoryHealFlowProbe = await page.evaluate(async () => {
    if (!window.game || !game.player || typeof game.onBattleWon !== 'function') return null;
    game.showScreen('map-screen');
    game.player.currentHp = Math.max(1, Math.floor((game.player.maxHp || 80) * 0.42));
    if (typeof game.player.grantAdventureBuff === 'function') {
      game.player.grantAdventureBuff('victoryHealBoostBattles', 1);
    }
    const before = {
      hp: game.player.currentHp,
      charges: game.player.adventureBuffs?.victoryHealBoostBattles || 0,
      mode: game.currentScreen
    };
    game.currentBattleNode = { id: 91006, row: 2, type: 'enemy', completed: false, accessible: true };
    await game.onBattleWon([{ id: 'audit_enemy', name: 'Audit Enemy', ringExp: 16, currentHp: 0, maxHp: 16, isBoss: false }]);
    const after = {
      hp: game.player.currentHp,
      charges: game.player.adventureBuffs?.victoryHealBoostBattles || 0,
      mode: game.currentScreen
    };
    if (typeof game.showScreen === 'function') game.showScreen('map-screen');
    return { before, after };
  });
  add(
    'victory-heal adventure buff restores hp and consumes one charge after battle win',
    !!victoryHealFlowProbe &&
      (victoryHealFlowProbe.after?.hp || 0) > (victoryHealFlowProbe.before?.hp || 0) &&
      (victoryHealFlowProbe.after?.charges || 0) === Math.max(0, (victoryHealFlowProbe.before?.charges || 0) - 1),
    JSON.stringify(victoryHealFlowProbe || null)
  );

  const endlessEntryProbe = await page.evaluate(() => {
    if (!window.game || typeof game.initRealmSelect !== 'function') return null;
    game.player.maxRealmReached = Math.max(game.player.maxRealmReached || 1, 8);
    game.unlockedRealms = Array.from(new Set([...(Array.isArray(game.unlockedRealms) ? game.unlockedRealms : []), 1, 2, 3, 4, 5, 6, 7, 8]));
    game.showScreen('realm-select-screen');
    game.initRealmSelect();
    const hasCard = !!document.querySelector('.realm-card[data-id="endless"]');
    if (typeof game.selectRealm === 'function') game.selectRealm('endless');
    const started = typeof game.startEndlessMode === 'function' ? game.startEndlessMode() : false;
    let textState = null;
    try {
      textState = JSON.parse(window.render_game_to_text());
    } catch {
      textState = null;
    }
    return {
      hasCard,
      started,
      screen: game.currentScreen,
      active: typeof game.isEndlessActive === 'function' ? game.isEndlessActive() : false,
      cycle: textState?.endless?.currentCycle ?? null,
      realm: game.player?.realm ?? null
    };
  });
  add(
    'realm select exposes endless mode entry and can start endless run',
    !!endlessEntryProbe &&
      endlessEntryProbe.hasCard &&
      endlessEntryProbe.started &&
      endlessEntryProbe.active &&
      endlessEntryProbe.screen === 'map-screen' &&
      Number.isFinite(endlessEntryProbe.realm),
    JSON.stringify(endlessEntryProbe || null)
  );

  const endlessPressurePanelProbe = await page.evaluate(() => {
    if (!window.game || !game.map || typeof game.ensureEndlessState !== 'function') return null;
    if (typeof game.isEndlessActive === 'function' && !game.isEndlessActive() && typeof game.startEndlessMode === 'function') {
      game.startEndlessMode();
    }
    if (typeof game.isEndlessActive !== 'function' || !game.isEndlessActive()) return null;

    const state = game.ensureEndlessState();
    state.pressure = 3;
    game.showScreen('map-screen');
    if (typeof game.map.updateEndlessPanel === 'function') game.map.updateEndlessPanel();

    const panel = document.getElementById('map-endless-panel');
    const beforeText = panel ? (panel.textContent || '').replace(/\s+/g, ' ').trim() : '';

    const nextState = game.ensureEndlessState();
    nextState.pressure = 8;
    if (typeof game.map.updateEndlessPanel === 'function') game.map.updateEndlessPanel();
    const afterText = panel ? (panel.textContent || '').replace(/\s+/g, ' ').trim() : '';

    return {
      visible: !!panel && getComputedStyle(panel).display !== 'none',
      hasBehaviorChip: !!panel?.querySelector('.endless-pressure-chip'),
      pulseUp: !!panel?.classList.contains('pressure-up'),
      dataPressure: panel?.dataset?.pressure || '',
      beforeText,
      afterText
    };
  });
  add(
    'endless panel shows pressure behavior hint and pulse feedback when pressure rises',
    !!endlessPressurePanelProbe &&
      endlessPressurePanelProbe.visible &&
      endlessPressurePanelProbe.hasBehaviorChip &&
      endlessPressurePanelProbe.pulseUp &&
      endlessPressurePanelProbe.dataPressure === '8' &&
      /敌方节奏/.test(endlessPressurePanelProbe.afterText || '') &&
      /重压|压制|连续/.test(endlessPressurePanelProbe.afterText || ''),
    JSON.stringify(endlessPressurePanelProbe || null)
  );

  const endlessShopPressureProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showShop !== 'function' || typeof game.buyItem !== 'function') return null;
    if (typeof game.isEndlessActive === 'function' && !game.isEndlessActive() && typeof game.startEndlessMode === 'function') {
      game.startEndlessMode();
    }
    if (typeof game.isEndlessActive !== 'function' || !game.isEndlessActive()) return null;

    const state = game.ensureEndlessState?.() || {};
    state.pressure = 7;
    game.player.currentHp = Math.max(1, Math.floor((game.player.maxHp || 80) * 0.55));
    game.player.gold = Math.max(game.player.gold || 0, 4000);

    game.showShop({ id: 91070, row: 2, type: 'shop', completed: false, accessible: true });
    const names = Array.from(document.querySelectorAll('#shop-services-container .service-name')).map((el) => (el.textContent || '').trim());
    const stabilizerIdx = (game.shopServices || []).findIndex((service) => service && service.id === 'endlessStabilizer');
    const before = {
      pressure: game.ensureEndlessState?.().pressure ?? null,
      hp: game.player.currentHp
    };
    if (stabilizerIdx >= 0) {
      game.buyItem('service', stabilizerIdx);
    }
    const after = {
      pressure: game.ensureEndlessState?.().pressure ?? null,
      hp: game.player.currentHp
    };
    return {
      hasStabilizer: names.includes('轮回稳压'),
      before,
      after
    };
  });
  add(
    'endless shop adds pressure stabilizer service and it reduces pressure',
    !!endlessShopPressureProbe &&
      endlessShopPressureProbe.hasStabilizer &&
      Number(endlessShopPressureProbe.after?.pressure ?? 99) < Number(endlessShopPressureProbe.before?.pressure ?? -1) &&
      Number(endlessShopPressureProbe.after?.hp ?? 0) >= Number(endlessShopPressureProbe.before?.hp ?? 0),
    JSON.stringify(endlessShopPressureProbe || null)
  );

  const endlessShopOverclockProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showShop !== 'function' || typeof game.buyItem !== 'function') return null;
    if (typeof game.isEndlessActive === 'function' && !game.isEndlessActive() && typeof game.startEndlessMode === 'function') {
      game.startEndlessMode();
    }
    if (typeof game.isEndlessActive !== 'function' || !game.isEndlessActive()) return null;

    const state = game.ensureEndlessState?.() || {};
    state.pressure = 2;
    game.player.gold = Math.max(game.player.gold || 0, 4000);
    const before = {
      pressure: state.pressure ?? null,
      boonHistory: Array.isArray(state.boonHistory) ? state.boonHistory.length : 0
    };
    game.showShop({ id: 91071, row: 2, type: 'shop', completed: false, accessible: true });
    const names = Array.from(document.querySelectorAll('#shop-services-container .service-name')).map((el) => (el.textContent || '').trim());
    const overclockIdx = (game.shopServices || []).findIndex((service) => service && service.id === 'endlessOverclock');
    if (overclockIdx >= 0) {
      game.buyItem('service', overclockIdx);
    }
    const afterState = game.ensureEndlessState?.() || {};
    const after = {
      pressure: afterState.pressure ?? null,
      boonHistory: Array.isArray(afterState.boonHistory) ? afterState.boonHistory.length : 0
    };
    return {
      hasOverclock: names.includes('轮回过载'),
      before,
      after
    };
  });
  add(
    'endless shop adds overclock service and it increases pressure with boon gain',
    !!endlessShopOverclockProbe &&
      endlessShopOverclockProbe.hasOverclock &&
      Number(endlessShopOverclockProbe.after?.pressure ?? -1) > Number(endlessShopOverclockProbe.before?.pressure ?? 99) &&
      Number(endlessShopOverclockProbe.after?.boonHistory ?? 0) === Number(endlessShopOverclockProbe.before?.boonHistory ?? 0) + 1,
    JSON.stringify(endlessShopOverclockProbe || null)
  );

  const endlessShopBlessingProbe = await page.evaluate(async () => {
    if (!window.game || typeof game.showShop !== 'function' || typeof game.buyItem !== 'function') return null;
    if (typeof game.isEndlessActive === 'function' && !game.isEndlessActive() && typeof game.startEndlessMode === 'function') {
      game.startEndlessMode();
    }
    if (typeof game.isEndlessActive !== 'function' || !game.isEndlessActive()) return null;

    game.closeModal?.();
    game.player.gold = Math.max(game.player.gold || 0, 4000);
    const state = game.ensureEndlessState?.() || {};
    const beforeGold = game.player.gold;
    const beforeHistory = Array.isArray(state.boonHistory) ? state.boonHistory.length : 0;
    const beforeStats = JSON.stringify(state.boonStats || {});

    game.showShop({ id: 91007, row: 2, type: 'shop', completed: false, accessible: true });
    const blessingIndex = (game.shopServices || []).findIndex((service) => service && service.id === 'endlessBlessing');
    const hasBlessingService = blessingIndex >= 0;
    if (blessingIndex >= 0) {
      game.buyItem('service', blessingIndex);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    const choiceButtons = Array.from(document.querySelectorAll('#event-choices .event-choice'));
    const draftButtons = choiceButtons.filter((btn) => {
      const text = (btn.textContent || '').replace(/\s+/g, ' ').trim();
      return text && !text.includes('取消祷告');
    });
    if (draftButtons[0]) {
      draftButtons[0].click();
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    const afterState = game.ensureEndlessState?.() || {};
    const afterGold = game.player.gold;
    const afterHistory = Array.isArray(afterState.boonHistory) ? afterState.boonHistory.length : 0;
    const afterStats = JSON.stringify(afterState.boonStats || {});
    const soldFlag = (game.shopServices || []).some((service) => service && service.id === 'endlessBlessing' && service.sold);
    game.closeModal?.();
    return {
      hasBlessingService,
      draftChoiceCount: draftButtons.length,
      beforeGold,
      afterGold,
      beforeHistory,
      afterHistory,
      boonStatsChanged: beforeStats !== afterStats,
      soldFlag
    };
  });
  add(
    'endless shop blessing uses two-choice draft and applies selected boon',
    !!endlessShopBlessingProbe &&
      endlessShopBlessingProbe.hasBlessingService &&
      endlessShopBlessingProbe.draftChoiceCount >= 2 &&
      endlessShopBlessingProbe.afterGold < endlessShopBlessingProbe.beforeGold &&
      (
        endlessShopBlessingProbe.afterHistory === endlessShopBlessingProbe.beforeHistory + 1 ||
        !!endlessShopBlessingProbe.boonStatsChanged
      ) &&
      endlessShopBlessingProbe.soldFlag,
    JSON.stringify(endlessShopBlessingProbe || null)
  );

  const endlessMutatorMarketProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showTemporaryEventShop !== 'function') return null;
    if (typeof game.isEndlessActive === 'function' && !game.isEndlessActive() && typeof game.startEndlessMode === 'function') {
      game.startEndlessMode();
    }
    if (typeof game.isEndlessActive !== 'function' || !game.isEndlessActive()) return null;

    const state = game.ensureEndlessState?.();
    if (state) state.activeMutators = ['war_market', 'void_tax', 'trial_inferno'];
    game.player.gold = Math.max(game.player.gold || 0, 1200);
    game.showTemporaryEventShop({
      title: '无尽联动审计',
      icon: '🧪',
      desc: '审计无尽词缀是否重写货架',
      offerCount: 3
    });

    const choiceTexts = Array.from(document.querySelectorAll('#event-choices .event-choice')).map((el) =>
      (el.textContent || '').replace(/\s+/g, ' ').trim()
    );
    const offerChoices = choiceTexts.filter((text) => !text.includes('不做交易'));
    const hasRelief = offerChoices.some((text) => text.includes('应急补给券'));
    const hasEndlessOffer = offerChoices.some((text) => text.includes('轮回重配包') || text.includes('轮回祷札'));

    const leaveBtn = Array.from(document.querySelectorAll('#event-choices .event-choice'))
      .find((btn) => (btn.textContent || '').includes('不做交易'));
    if (leaveBtn) leaveBtn.click();
    return {
      offerCount: offerChoices.length,
      hasRelief,
      hasEndlessOffer
    };
  });
  add(
    'endless mutators reshape temporary shop offers and keep relief fallback',
    !!endlessMutatorMarketProbe &&
      endlessMutatorMarketProbe.offerCount >= 4 &&
      endlessMutatorMarketProbe.hasRelief &&
      endlessMutatorMarketProbe.hasEndlessOffer,
    JSON.stringify(endlessMutatorMarketProbe || null)
  );

  const endlessAdvanceProbe = await page.evaluate(() => {
    if (!window.game || typeof game.handleEndlessRealmComplete !== 'function' || typeof game.ensureEndlessState !== 'function') return null;
    if (typeof game.isEndlessActive !== 'function' || !game.isEndlessActive()) return null;

    const before = game.ensureEndlessState().currentCycle;
    const originalPicker = game.showEndlessBoonSelection;
    game.showEndlessBoonSelection = (done) => {
      try {
        const choices = typeof game.getEndlessBoonChoices === 'function' ? game.getEndlessBoonChoices() : [];
        if (choices && choices[0] && typeof game.applyEndlessBoon === 'function') {
          game.applyEndlessBoon(choices[0].id);
        }
      } finally {
        if (typeof done === 'function') done();
      }
    };
    game.handleEndlessRealmComplete();
    game.showEndlessBoonSelection = originalPicker;
    const afterState = game.ensureEndlessState();
    return {
      before,
      after: afterState.currentCycle,
      active: typeof game.isEndlessActive === 'function' ? game.isEndlessActive() : false,
      bosses: afterState.totalBossDefeated
    };
  });
  add(
    'endless completion flow advances cycle and persists boss progress',
    !!endlessAdvanceProbe &&
      endlessAdvanceProbe.after === endlessAdvanceProbe.before + 1 &&
      endlessAdvanceProbe.active &&
      endlessAdvanceProbe.bosses >= 1,
    JSON.stringify(endlessAdvanceProbe || null)
  );

  const endlessBossFlowProbe = await page.evaluate(async () => {
    if (!window.game || typeof game.onBattleWon !== 'function' || typeof game.ensureEndlessState !== 'function') return null;
    if (typeof game.isEndlessActive === 'function' && !game.isEndlessActive()) {
      if (typeof game.startEndlessMode === 'function') game.startEndlessMode();
    }
    if (typeof game.isEndlessActive !== 'function' || !game.isEndlessActive()) return null;

    const before = game.ensureEndlessState().currentCycle;
    const originalPicker = game.showEndlessBoonSelection;
    game.showEndlessBoonSelection = (done) => {
      try {
        const choices = typeof game.getEndlessBoonChoices === 'function' ? game.getEndlessBoonChoices() : [];
        if (choices && choices[0] && typeof game.applyEndlessBoon === 'function') {
          game.applyEndlessBoon(choices[0].id);
        }
      } finally {
        if (typeof done === 'function') done();
      }
    };

    const bossNode = { id: 91099, row: 0, type: 'boss', completed: false, accessible: true };
    if (game.map) {
      game.map.nodes = [[bossNode]];
      game.map.completedNodes = [];
    }
    game.currentBattleNode = bossNode;
    await game.onBattleWon([{
      id: 'audit_endless_boss',
      name: '无尽审计天劫',
      isBoss: true,
      ringExp: 120,
      currentHp: 0,
      maxHp: 120,
      patterns: [{ type: 'attack', value: 1 }]
    }]);
    game.showEndlessBoonSelection = originalPicker;

    const after = game.ensureEndlessState();
    return {
      before,
      after: after.currentCycle,
      bosses: after.totalBossDefeated,
      active: typeof game.isEndlessActive === 'function' ? game.isEndlessActive() : false,
      mode: game.currentScreen
    };
  });
  add(
    'boss victory route advances endless cycle through onBattleWon chain',
    !!endlessBossFlowProbe &&
      endlessBossFlowProbe.after === endlessBossFlowProbe.before + 1 &&
      endlessBossFlowProbe.bosses >= 1 &&
      endlessBossFlowProbe.active &&
      endlessBossFlowProbe.mode === 'map-screen',
    JSON.stringify(endlessBossFlowProbe || null)
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
