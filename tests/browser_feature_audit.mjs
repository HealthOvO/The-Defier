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

  const mapChapterProbe = await page.evaluate(() => {
    const panel = document.getElementById('map-chapter-brief');
    const panelText = (panel?.textContent || '').replace(/\s+/g, ' ').trim();
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    return {
      panelText,
      chapter: payload?.map?.chapter || null
    };
  });
  add(
    'map chapter card exposes chapter name plus omen and leyline before first battle',
    !!mapChapterProbe &&
      /章节世界规则/.test(mapChapterProbe.panelText || '') &&
      /天象/.test(mapChapterProbe.panelText || '') &&
      /地脉/.test(mapChapterProbe.panelText || '') &&
      /风险|DRI/.test(mapChapterProbe.panelText || '') &&
      /宿敌|追猎/.test(mapChapterProbe.panelText || '') &&
      /碎誓外域/.test(mapChapterProbe.panelText || '') &&
      mapChapterProbe.chapter?.name === '碎誓外域' &&
      typeof mapChapterProbe.chapter?.dangerProfile?.index === 'number' &&
      !!mapChapterProbe.chapter?.dangerProfile?.tierLabel &&
      !!mapChapterProbe.chapter?.nemesis?.name &&
      !!mapChapterProbe.chapter?.nemesis?.statusLabel &&
      typeof mapChapterProbe.chapter?.nemesis?.pressureIndex === 'number' &&
      !!mapChapterProbe.chapter?.skyOmen?.name &&
      !!mapChapterProbe.chapter?.leyline?.name,
    JSON.stringify(mapChapterProbe || null)
  );

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

  const cardTypeTemplateProbe = await page.evaluate(() => {
    if (typeof Utils === 'undefined' || typeof Utils.createCardElement !== 'function') {
      return { ok: false, reason: 'card_api_unavailable' };
    }

    const samples = {
      skill: {
        id: 'audit_skill',
        name: '试阵步',
        type: 'skill',
        cost: 1,
        icon: '✨',
        description: '抽 1 张牌并获得 4 点护盾。',
        rarity: 'common'
      },
      power: {
        id: 'audit_power',
        name: '自然生长',
        type: 'power',
        cost: 1,
        icon: '🌱',
        description: '每回合结束时，获得 3 点护盾。',
        rarity: 'uncommon'
      },
      status: {
        id: 'audit_status',
        name: '心魔·疑心',
        type: 'status',
        cost: 0,
        icon: '👿',
        description: '无法打出。保留。占据抽牌位。',
        rarity: 'special',
        unplayable: true
      }
    };

    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-9999px;top:-9999px;display:flex;gap:12px;';
    document.body.appendChild(host);

    const inspectType = (type) => {
      const card = samples[type];
      if (!card) return null;
      const el = Utils.createCardElement(card, 0, false);
      host.appendChild(el);
      const footer = el.querySelector('.card-type');
      const styles = window.getComputedStyle(el);
      return {
        name: card.name,
        footerText: footer ? (footer.textContent || '').trim() : '',
        borderColor: styles.borderColor,
        backgroundImage: styles.backgroundImage
      };
    };

    const result = {
      skill: inspectType('skill'),
      power: inspectType('power'),
      status: inspectType('status')
    };

    host.remove();

    const entries = Object.values(result).filter(Boolean);
    return {
      ok: entries.length === 3
        && entries.every((entry) => entry.footerText && !/未知/.test(entry.footerText))
        && entries.every((entry) => entry.borderColor && entry.borderColor !== 'rgba(0, 0, 0, 0)')
        && entries.every((entry) => entry.backgroundImage && entry.backgroundImage !== 'none'),
      result
    };
  });
  add(
    'card templates keep skill power and status cards on the same labeled skin system',
    !!cardTypeTemplateProbe && !!cardTypeTemplateProbe.ok,
    JSON.stringify(cardTypeTemplateProbe || null)
  );

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

  const battleChapterProbe = await page.evaluate(() => {
    const env = document.getElementById('battle-environment');
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    return {
      text: (env?.textContent || '').replace(/\s+/g, ' ').trim(),
      title: env?.title || '',
      chapterRules: payload?.battle?.chapterRules || null
    };
  });
  add(
    'battle environment bar now carries chapter world rules with chapter, omen, and leyline chips',
    !!battleChapterProbe &&
      /碎誓外域/.test(battleChapterProbe.text || '') &&
      /天象/.test(battleChapterProbe.text || '') &&
      /地脉/.test(battleChapterProbe.text || '') &&
      /章节：/.test(battleChapterProbe.title || '') &&
      battleChapterProbe.chapterRules?.name === '碎誓外域' &&
      !!battleChapterProbe.chapterRules?.nemesis?.name &&
      !!battleChapterProbe.chapterRules?.nemesis?.statusLabel &&
      !!battleChapterProbe.chapterRules?.skyOmen?.name &&
      !!battleChapterProbe.chapterRules?.leyline?.name,
    JSON.stringify(battleChapterProbe || null)
  );

  const chapterBattlefieldProbe = await page.evaluate(() => {
    if (!window.game || !game.battle || !game.player) return { ok: false, reason: 'no_battle' };

    game.battle.battleEnded = false;
    game.battle.currentTurn = 'player';
    game.battle.isProcessingCard = false;
    game.battle.isTurnTransitioning = false;
    game.player.realm = 8;
    game.player.turnNumber = 1;
    game.player.block = 0;
    game.player.currentEnergy = game.player.baseEnergy || 3;

    game.battle.enemies = [
      {
        id: 'chapter_probe_striker',
        name: '沉星锋',
        icon: '⚔️',
        currentHp: 52,
        maxHp: 52,
        block: 0,
        buffs: {},
        patterns: [{ type: 'attack', value: 12, intent: '⚔️试击' }],
        currentPatternIndex: 0
      },
      {
        id: 'chapter_probe_anchor',
        name: '沉星核',
        icon: '🧿',
        currentHp: 48,
        maxHp: 48,
        block: 0,
        buffs: {},
        patterns: [
          { type: 'defend', value: 8, intent: '🛡️回护' },
          { type: 'debuff', buffType: 'weak', value: 1, intent: '🌀牵制' }
        ],
        currentPatternIndex: 0
      },
      {
        id: 'chapter_probe_tail',
        name: '沉星尾',
        icon: '✦',
        currentHp: 46,
        maxHp: 46,
        block: 0,
        buffs: {},
        patterns: [{ type: 'attack', value: 9, intent: '⚔️试击' }],
        currentPatternIndex: 0
      }
    ];

    if (typeof game.battle.applyEnemySquadEcology === 'function') {
      game.battle.applyEnemySquadEcology();
    }
    if (typeof game.battle.initializeChapterBattlefieldRules === 'function') {
      game.battle.initializeChapterBattlefieldRules();
    }
    if (typeof game.battle.updateBattleUI === 'function') {
      game.battle.updateBattleUI();
    }

    const env = document.getElementById('battle-environment');
    const formationChip = env ? env.querySelector('.chapter-formation-chip') : null;
    const enemyFormationTag = document.querySelector('.enemy .enemy-formation-tag');
    let payload = null;
    try {
      payload = JSON.parse(window.render_game_to_text());
    } catch {}

    const result = {
      ok:
        !!formationChip &&
        /阵面/.test(formationChip.textContent || '') &&
        /伏星蓄势/.test(env?.textContent || '') &&
        /三连成势/.test(env?.textContent || '') &&
        /沉星链阵/.test(env?.textContent || '') &&
        /阵面/.test(enemyFormationTag?.textContent || '') &&
        payload?.battle?.chapterBattlefield?.chapterIndex === 3 &&
        payload?.battle?.chapterBattlefield?.omen?.phaseLabel === '伏星蓄势' &&
        payload?.battle?.chapterBattlefield?.formation?.name === '沉星链阵',
      envText: (env?.textContent || '').replace(/\s+/g, ' ').trim(),
      envTitle: env?.title || '',
      formationChip: formationChip ? (formationChip.textContent || '').trim() : '',
      enemyFormationTag: enemyFormationTag ? (enemyFormationTag.textContent || '').trim() : '',
      chapterBattlefield: payload?.battle?.chapterBattlefield || null
    };

    game.battle.activeChapterBattlefield = null;
    if (typeof game.battle.updateBattleUI === 'function') {
      game.battle.updateBattleUI();
    }

    return result;
  });
  add(
    'chapter battlefield runtime exposes omen phase, leyline focus, and formation tags together',
    !!chapterBattlefieldProbe && !!chapterBattlefieldProbe.ok,
    JSON.stringify(chapterBattlefieldProbe || null)
  );

  const chapterBattlefieldFinalProbe = await page.evaluate(() => {
    if (!window.game || !game.battle || !game.player) return { ok: false, reason: 'no_battle' };

    const originalRealm = game.player.realm;
    const originalTurnNumber = game.player.turnNumber;
    const originalEquippedTreasures = Array.isArray(game.player.equippedTreasures)
      ? game.player.equippedTreasures.slice()
      : [];
    const originalTreasures = Array.isArray(game.player.treasures)
      ? game.player.treasures.slice()
      : [];
    const originalRunVows = Array.isArray(game.player.runVows)
      ? game.player.runVows.map((entry) => ({ ...(entry || {}) }))
      : [];
    const originalRunDestiny = game.player.runDestiny && typeof game.player.runDestiny === 'object'
      ? { ...(game.player.runDestiny || {}) }
      : game.player.runDestiny;
    const originalGetSocketedLaws = game.player.fateRing && typeof game.player.fateRing.getSocketedLaws === 'function'
      ? game.player.fateRing.getSocketedLaws.bind(game.player.fateRing)
      : null;

    game.battle.battleEnded = false;
    game.battle.currentTurn = 'player';
    game.battle.isProcessingCard = false;
    game.battle.isTurnTransitioning = false;
    game.player.realm = 18;
    game.player.turnNumber = 1;
    game.player.block = 0;
    game.player.currentEnergy = game.player.baseEnergy || 3;

    if (typeof game.player.setRunDestiny === 'function') {
      game.player.setRunDestiny('preceptSeal', 1);
    } else {
      game.player.runDestiny = { id: 'preceptSeal', tier: 1 };
    }
    if (typeof game.player.setRunVows === 'function') {
      game.player.setRunVows([{ id: 'realmBreak', tier: 1 }, { id: 'heavenlyGaze', tier: 1 }]);
    } else {
      game.player.runVows = [{ id: 'realmBreak', tier: 1 }, { id: 'heavenlyGaze', tier: 1 }];
    }
    if (typeof game.player.setSpiritCompanion === 'function') {
      game.player.setSpiritCompanion('artifactSoul', 1);
    }
    game.player.equippedTreasures = [
      { id: 'probe_xj_1', name: '玄甲一式', setTag: 'xuanjia' },
      { id: 'probe_xj_2', name: '玄甲二式', setTag: 'xuanjia' }
    ];
    game.player.treasures = game.player.equippedTreasures;
    if (game.player.fateRing) {
      game.player.fateRing.getSocketedLaws = () => ['law_a', 'law_b', 'law_c'];
    }

    game.battle.enemies = [
      {
        id: 'final_probe_judge',
        name: '终审司',
        icon: '☯️',
        currentHp: 66,
        maxHp: 66,
        block: 0,
        buffs: {},
        patterns: [
          { type: 'defend', value: 9, intent: '🛡️终律' },
          { type: 'debuff', buffType: 'weak', value: 1, intent: '🌀追问' }
        ],
        currentPatternIndex: 0
      },
      {
        id: 'final_probe_guard',
        name: '律从甲',
        icon: '⚔️',
        currentHp: 50,
        maxHp: 50,
        block: 0,
        buffs: {},
        patterns: [{ type: 'attack', value: 12, intent: '⚔️裁击' }],
        currentPatternIndex: 0
      },
      {
        id: 'final_probe_tail',
        name: '律从乙',
        icon: '✦',
        currentHp: 48,
        maxHp: 48,
        block: 0,
        buffs: {},
        patterns: [{ type: 'attack', value: 9, intent: '⚔️裁击' }],
        currentPatternIndex: 0
      }
    ];

    if (typeof game.battle.initializeChapterBattlefieldRules === 'function') {
      game.battle.initializeChapterBattlefieldRules();
    }
    if (typeof game.battle.updateBattleUI === 'function') {
      game.battle.updateBattleUI();
    }

    const env = document.getElementById('battle-environment');
    const formationChip = env ? env.querySelector('.chapter-formation-chip') : null;
    const enemyFormationTag = document.querySelector('.enemy .enemy-formation-tag');
    let payload = null;
    try {
      payload = JSON.parse(window.render_game_to_text());
    } catch {}

    const result = {
      ok:
        !!formationChip &&
        /终章合式·5轴/.test(env?.textContent || '') &&
        /万象同判/.test(env?.textContent || '') &&
        /终律衡阵/.test(env?.textContent || '') &&
        /阵面/.test(enemyFormationTag?.textContent || '') &&
        payload?.battle?.chapterBattlefield?.chapterIndex === 6 &&
        payload?.battle?.chapterBattlefield?.omen?.phaseLabel === '万象同判' &&
        payload?.battle?.chapterBattlefield?.leyline?.activeLabel === '终章合式·5轴' &&
        payload?.battle?.chapterBattlefield?.synergy?.axes === 5 &&
        payload?.battle?.chapterBattlefield?.formation?.name === '终律衡阵',
      envText: (env?.textContent || '').replace(/\s+/g, ' ').trim(),
      envTitle: env?.title || '',
      formationChip: formationChip ? (formationChip.textContent || '').trim() : '',
      enemyFormationTag: enemyFormationTag ? (enemyFormationTag.textContent || '').trim() : '',
      chapterBattlefield: payload?.battle?.chapterBattlefield || null
    };

    game.player.realm = originalRealm;
    game.player.turnNumber = originalTurnNumber;
    game.player.equippedTreasures = originalEquippedTreasures;
    game.player.treasures = originalTreasures;
    game.player.runVows = originalRunVows;
    game.player.runDestiny = originalRunDestiny;
    if (game.player.fateRing) {
      if (originalGetSocketedLaws) {
        game.player.fateRing.getSocketedLaws = originalGetSocketedLaws;
      } else {
        delete game.player.fateRing.getSocketedLaws;
      }
    }
    game.battle.activeChapterBattlefield = null;
    if (typeof game.battle.updateBattleUI === 'function') {
      game.battle.updateBattleUI();
    }

    return result;
  });
  add(
    'chapter battlefield final chapter surfaces multi-axis synergy in UI and render_game_to_text',
    !!chapterBattlefieldFinalProbe && !!chapterBattlefieldFinalProbe.ok,
    JSON.stringify(chapterBattlefieldFinalProbe || null)
  );

  const spiritCompanionProbe = await page.evaluate(() => {
    if (!window.game || !game.battle || !game.player) return { ok: false, reason: 'no_battle' };

    game.battle.battleEnded = false;
    game.battle.currentTurn = 'player';
    game.battle.isProcessingCard = false;
    game.battle.isTurnTransitioning = false;
    game.player.realm = 2;
    game.player.block = 0;
    game.player.buffs = {};

    if (typeof game.player.setSpiritCompanion === 'function') {
      game.player.setSpiritCompanion('frostChi', 1);
    }
    if (typeof game.player.resetSpiritCompanionBattleState === 'function') {
      game.player.resetSpiritCompanionBattleState();
    }

    game.battle.enemies = [
      {
        id: 'spirit_probe_alpha',
        name: '霜试敌-甲',
        icon: '🧪',
        currentHp: 80,
        maxHp: 80,
        block: 0,
        buffs: {},
        patterns: [{ type: 'attack', value: 10, intent: '⚔️试击' }],
        currentPatternIndex: 0
      },
      {
        id: 'spirit_probe_beta',
        name: '霜试敌-乙',
        icon: '🧪',
        currentHp: 76,
        maxHp: 76,
        block: 0,
        buffs: {},
        patterns: [{ type: 'attack', value: 9, intent: '⚔️试击' }],
        currentPatternIndex: 0
      }
    ];

    if (typeof game.battle.applySpiritCompanionBattleStart === 'function') {
      game.battle.applySpiritCompanionBattleStart();
    }
    if (typeof game.player.gainSpiritCharge === 'function') {
      game.player.gainSpiritCharge(5);
    }
    if (typeof game.battle.markUIDirty === 'function') {
      game.battle.markUIDirty('command', 'player', 'enemies', 'hand', 'energy');
    }
    if (typeof game.battle.updateBattleUI === 'function') {
      game.battle.updateBattleUI();
    }

    const chipBefore = document.querySelector('#battle-command-panel .battle-command-spirit-chip');
    const buttonBefore = document.querySelector('#battle-command-panel .battle-advisor-spirit-btn');
    const beforeWeak = game.battle.enemies.reduce((sum, enemy) => sum + ((enemy.buffs && enemy.buffs.weak) || 0), 0);
    const beforeBlock = game.player.block || 0;
    const beforeCharge = game.player.spiritCompanionBattleState?.charge || 0;

    const used = typeof game.battle.activateSpiritCompanion === 'function'
      ? game.battle.activateSpiritCompanion()
      : false;

    let payload = null;
    try {
      payload = JSON.parse(window.render_game_to_text());
    } catch {}

    const chipAfter = document.querySelector('#battle-command-panel .battle-command-spirit-chip');
    const buttonAfter = document.querySelector('#battle-command-panel .battle-advisor-spirit-btn');
    const afterWeak = game.battle.enemies.reduce((sum, enemy) => sum + ((enemy.buffs && enemy.buffs.weak) || 0), 0);
    const afterBlock = game.player.block || 0;
    const afterCharge = game.player.spiritCompanionBattleState?.charge || 0;

    return {
      ok:
        !!used &&
        beforeWeak === 2 &&
        beforeCharge === 5 &&
        afterWeak === 6 &&
        afterBlock >= beforeBlock + 8 &&
        afterCharge === 0 &&
        /霜螭/.test(chipBefore?.textContent || '') &&
        /5\/5/.test(chipBefore?.textContent || '') &&
        !buttonBefore?.disabled &&
        /释放/.test(buttonBefore?.textContent || '') &&
        /0\/5/.test(chipAfter?.textContent || '') &&
        !!buttonAfter?.disabled &&
        !!(payload?.player?.spiritCompanion && payload.player.spiritCompanion.id === 'frostChi') &&
        !!(payload?.player?.spiritCharge && payload.player.spiritCharge.charge === 0 && payload.player.spiritCharge.max === 5),
      beforeWeak,
      afterWeak,
      beforeBlock,
      afterBlock,
      beforeCharge,
      afterCharge,
      chipBefore: chipBefore ? (chipBefore.textContent || '').trim() : '',
      chipAfter: chipAfter ? (chipAfter.textContent || '').trim() : '',
      buttonBefore: buttonBefore ? (buttonBefore.textContent || '').trim() : '',
      buttonAfter: buttonAfter ? (buttonAfter.textContent || '').trim() : '',
      payload
    };
  });
  add(
    'spirit companion passive and active both render in HUD and resolve into battle state',
    !!spiritCompanionProbe && !!spiritCompanionProbe.ok,
    JSON.stringify(spiritCompanionProbe || null)
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
    if (typeof game.battle.applyEnemySquadEcology === 'function') {
      game.battle.applyEnemySquadEcology();
    }
    if (typeof game.battle.updateEnemiesUI === 'function') game.battle.updateEnemiesUI();
    if (typeof game.battle.updateEnvironmentUI === 'function') game.battle.updateEnvironmentUI();

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
    const systemStrip = panel ? panel.querySelector('.battle-system-strip') : null;
    const systemChipCount = systemStrip ? systemStrip.querySelectorAll('.battle-system-chip').length : 0;
    const systemIds = systemStrip
      ? Array.from(systemStrip.querySelectorAll('.battle-system-chip')).map((el) => String(el.getAttribute('data-system-id') || ''))
      : [];
    const systemValueText = systemStrip
      ? Array.from(systemStrip.querySelectorAll('.battle-system-chip')).map((el) => (el.textContent || '').trim()).join(' | ')
      : '';
    const advisor = panel ? panel.querySelector('#battle-tactical-advisor') : null;
    const advisorTitle = advisor ? (advisor.querySelector('.battle-advisor-title')?.textContent || '').trim() : '';
    const advisorRecommend = advisor ? (advisor.querySelector('.battle-advisor-recommend')?.textContent || '').trim() : '';
    const advisorReadiness = advisor ? (advisor.querySelector('.battle-advisor-readiness')?.textContent || '').trim() : '';
    const advisorFormation = advisor ? (advisor.querySelector('.battle-advisor-formation')?.textContent || '').trim() : '';
    const advisorCardPlan = advisor ? (advisor.querySelector('.battle-advisor-cardplan')?.textContent || '').trim() : '';
    const advisorTempoSegments = advisor ? advisor.querySelectorAll('.battle-advisor-tempo-segment').length : 0;
    const advisorActiveTempo = advisor ? (advisor.querySelector('.battle-advisor-tempo-segment.active .battle-advisor-tempo-label')?.textContent || '').trim() : '';
    const advisorStatusChips = advisor ? advisor.querySelectorAll('.battle-advisor-status-chip').length : 0;
    const systemCards = advisor ? advisor.querySelectorAll('.battle-system-card').length : 0;
    const advisorChain = advisor ? advisor.querySelector('.battle-advisor-chain') : null;
    const advisorChainTitle = advisorChain ? (advisorChain.querySelector('.battle-advisor-chain-title')?.textContent || '').trim() : '';
    const advisorChainKicker = advisorChain ? (advisorChain.querySelector('.battle-advisor-section-title')?.textContent || '').trim() : '';
    const advisorChainSteps = advisorChain ? advisorChain.querySelectorAll('.battle-advisor-chain-step').length : 0;
    const advisorChainTags = advisorChain ? advisorChain.querySelectorAll('.battle-advisor-chain-tag').length : 0;
    const advisorChainCardIndex = advisorChain ? String(advisorChain.getAttribute('data-card-index') || '') : '';
    const advisorCardSteps = advisor ? Array.from(advisor.querySelectorAll('.battle-advisor-cardstep-btn')) : [];
    const advisorCardStepCount = advisorCardSteps.length;
    let advisorFocusApplied = false;
    let advisorPreviewApplied = false;
    let advisorTargetingPreview = false;
    let advisorFocusedIndex = '';
    if (advisorCardSteps.length > 0 && typeof advisorCardSteps[0].click === 'function') {
      advisorFocusedIndex = String(advisorCardSteps[0].getAttribute('data-card-index') || '');
      advisorCardSteps[0].click();
      const focusedCard = document.querySelector('#hand-cards .card.advisor-focus');
      const focusedIndex = focusedCard ? String(focusedCard.getAttribute('data-index') || '') : '';
      const selectedCard = document.querySelector('#hand-cards .card.selected');
      advisorFocusApplied = !!focusedCard && focusedIndex === advisorFocusedIndex;
      advisorPreviewApplied = !!selectedCard && String(selectedCard.getAttribute('data-index') || '') === advisorFocusedIndex;
      advisorTargetingPreview = !!document.querySelector('#hand-cards.targeting-active');
    }
    let advisorChainChangesOnHover = false;
    let advisorHoverChainCardIndex = advisorChainCardIndex;
    const hoverProbeCard = Array.from(document.querySelectorAll('#hand-cards .card')).find((card) => String(card.getAttribute('data-index') || '') !== advisorChainCardIndex);
    if (hoverProbeCard) {
      hoverProbeCard.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      const hoverChain = document.querySelector('#battle-tactical-advisor .battle-advisor-chain');
      const hoverKicker = hoverChain ? (hoverChain.querySelector('.battle-advisor-section-title')?.textContent || '').trim() : '';
      advisorHoverChainCardIndex = hoverChain ? String(hoverChain.getAttribute('data-card-index') || '') : advisorChainCardIndex;
      advisorChainChangesOnHover = !!hoverChain && advisorHoverChainCardIndex !== advisorChainCardIndex && /悬停预判/.test(hoverKicker);
      hoverProbeCard.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    }
    const advisorThreatChips = advisor ? advisor.querySelectorAll('.battle-advisor-threat-chip').length : 0;
    const helperLoaded = !!window.DefierBattleHud
      && typeof window.DefierBattleHud.buildBattleCommandPanelMarkup === 'function'
      && typeof window.DefierBattleHud.buildBattleSystemsStripMarkup === 'function'
      && typeof window.DefierBattleHud.clampFloatingPanelPosition === 'function';
    let systemsHud = null;
    try {
      const payload = JSON.parse(window.render_game_to_text ? window.render_game_to_text() : '{}');
      systemsHud = payload?.battle?.systemsHud || null;
    } catch (error) {
      systemsHud = { parseError: String(error && error.message || error) };
    }
    let advisorCollapsedAfterToggle = false;
    let advisorStaysCollapsedWhileHovered = false;
    let advisorDragged = false;
    let advisorDragDelta = { x: 0, y: 0 };
    const toggleBtn = panel ? panel.querySelector('.battle-advisor-toggle') : null;
    if (toggleBtn && typeof toggleBtn.click === 'function') {
      toggleBtn.click();
      if (typeof game.battle.updateBattleUI === 'function') game.battle.updateBattleUI();
      panel = document.getElementById('battle-command-panel');
      const advisorAfterToggle = panel ? panel.querySelector('#battle-tactical-advisor') : null;
      advisorCollapsedAfterToggle = !!(advisorAfterToggle && advisorAfterToggle.classList.contains('collapsed'));
      if (advisorAfterToggle) {
        advisorAfterToggle.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        advisorStaysCollapsedWhileHovered = advisorAfterToggle.classList.contains('collapsed');
        advisorAfterToggle.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      }

      const toggleBackBtn = panel ? panel.querySelector('.battle-advisor-toggle') : null;
      if (toggleBackBtn && typeof toggleBackBtn.click === 'function') {
        toggleBackBtn.click();
        if (typeof game.battle.updateBattleUI === 'function') game.battle.updateBattleUI();
      }
      panel = document.getElementById('battle-command-panel');
    }

    const dragHandle = panel ? panel.querySelector('.battle-advisor-drag-handle') : null;
    if (panel && dragHandle && typeof PointerEvent !== 'undefined') {
      const beforeRect = panel.getBoundingClientRect();
      const startX = Math.round(beforeRect.left + 12);
      const startY = Math.round(beforeRect.top + 12);
      dragHandle.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: startX,
        clientY: startY,
        pointerId: 1,
        isPrimary: true
      }));
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: startX + 72,
        clientY: startY + 36,
        pointerId: 1,
        isPrimary: true
      }));
      window.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 0,
        clientX: startX + 72,
        clientY: startY + 36,
        pointerId: 1,
        isPrimary: true
      }));
      panel = document.getElementById('battle-command-panel');
      const afterRect = panel ? panel.getBoundingClientRect() : beforeRect;
      advisorDragDelta = {
        x: Math.round(afterRect.left - beforeRect.left),
        y: Math.round(afterRect.top - beforeRect.top)
      };
      advisorDragged = Math.abs(advisorDragDelta.x) >= 40 && Math.abs(advisorDragDelta.y) >= 16;
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
      advisorFormation,
      advisorCardPlan,
      advisorTempoSegments,
      advisorActiveTempo,
      advisorStatusChips,
      systemChipCount,
      systemIds,
      systemValueText,
      systemCards,
      systemsHud,
      advisorChainTitle,
      advisorChainKicker,
      advisorChainSteps,
      advisorChainTags,
      advisorChainCardIndex,
      advisorChainChangesOnHover,
      advisorHoverChainCardIndex,
      advisorCardStepCount,
      advisorFocusApplied,
      advisorPreviewApplied,
      advisorTargetingPreview,
      advisorFocusedIndex,
      advisorThreatChips,
      helperLoaded,
      advisorCollapsedAfterToggle,
      advisorStaysCollapsedWhileHovered,
      advisorDragged,
      advisorDragDelta,
      commandId,
      before,
      after,
      used
    };
  });
  add(
    'battle command panel renders through shared HUD module and command activation changes battle state',
    !!battleCommandProbe &&
      !!battleCommandProbe.ok &&
      !!battleCommandProbe.helperLoaded &&
      Number(battleCommandProbe.buttons || 0) >= 3 &&
      /战场指令/.test(battleCommandProbe.title || '') &&
      /战术助手/.test(battleCommandProbe.advisorTitle || '') &&
      /回路/.test(battleCommandProbe.advisorRecommend || '') &&
      Number(battleCommandProbe.systemChipCount || 0) >= 6 &&
      Number(battleCommandProbe.systemCards || 0) >= 6 &&
      ['destiny', 'vows', 'spirit', 'chapter', 'laws', 'treasures'].every((id) => (battleCommandProbe.systemIds || []).includes(id)) &&
      /命格/.test(battleCommandProbe.systemValueText || '') &&
      /誓约/.test(battleCommandProbe.systemValueText || '') &&
      /灵契/.test(battleCommandProbe.systemValueText || '') &&
      /天象 \/ 地脉/.test(battleCommandProbe.systemValueText || '') &&
      /法则编织/.test(battleCommandProbe.systemValueText || '') &&
      /法宝套装/.test(battleCommandProbe.systemValueText || '') &&
      Number(battleCommandProbe.advisorThreatChips || 0) >= 1 &&
      Number(battleCommandProbe.advisorTempoSegments || 0) >= 4 &&
      /守势|破阵|净域|歼灭/.test(battleCommandProbe.advisorActiveTempo || '') &&
      Number(battleCommandProbe.advisorStatusChips || 0) >= 3 &&
      !!battleCommandProbe.systemsHud &&
      Array.isArray(battleCommandProbe.systemsHud.stripItems) &&
      battleCommandProbe.systemsHud.stripItems.length >= 6 &&
      battleCommandProbe.systemsHud.lawWeave &&
      battleCommandProbe.systemsHud.treasureSets &&
      /执行链：/.test(battleCommandProbe.advisorChainTitle || '') &&
      /建议|当前预选|悬停预判|默认巡检/.test(battleCommandProbe.advisorChainKicker || '') &&
      Number(battleCommandProbe.advisorChainSteps || 0) >= 2 &&
      Number(battleCommandProbe.advisorChainTags || 0) >= 0 &&
      !!battleCommandProbe.advisorChainChangesOnHover &&
      /建议|指令|回合|命环/.test(battleCommandProbe.advisorReadiness || '') &&
      /敌阵画像|轮段研判/.test(battleCommandProbe.advisorFormation || '') &&
      /手牌执行|优先打|先打/.test(battleCommandProbe.advisorCardPlan || '') &&
      Number(battleCommandProbe.advisorCardStepCount || 0) >= 1 &&
      !!battleCommandProbe.advisorFocusApplied &&
      (!!battleCommandProbe.advisorPreviewApplied || !!battleCommandProbe.advisorTargetingPreview) &&
      !!battleCommandProbe.advisorCollapsedAfterToggle &&
      !!battleCommandProbe.advisorStaysCollapsedWhileHovered &&
      !!battleCommandProbe.advisorDragged,
    JSON.stringify(battleCommandProbe || null)
  );

  const advisorTurnReviewProbe = await page.evaluate(async () => {
    if (!window.game || !game.battle) return { ok: false, reason: 'no_battle' };
    const battle = game.battle;
    battle.battleEnded = false;
    battle.currentTurn = 'player';
    battle.isProcessingCard = false;
    battle.isTurnTransitioning = false;
    battle.turnNumber = Math.max(1, Number(battle.turnNumber) || 1);
    battle.enemyTurn = async () => {};
    battle.enemies = [
      {
        id: 'audit_review_alpha',
        name: '复盘试作敌',
        icon: '🧪',
        currentHp: 120,
        maxHp: 120,
        block: 14,
        buffs: {},
        patterns: [{ type: 'attack', value: 14, intent: '⚔️压制' }],
        currentPatternIndex: 0
      }
    ];
    if (game.player) {
      game.player.currentEnergy = 3;
      game.player.milkCandy = 3;
      game.player.block = 0;
      game.player.buffs = game.player.buffs || {};
      game.player.buffs.extraTurn = 0;
      game.player.hand = [
        {
          id: 'audit_review_strike',
          name: '裂光斩',
          type: 'attack',
          cost: 1,
          damage: 8,
          effects: []
        },
        {
          id: 'audit_review_break',
          name: '穿甲震击',
          type: 'attack',
          cost: 2,
          damage: 6,
          effects: [{ type: 'removeBlock', value: 12 }]
        },
        {
          id: 'audit_review_guard',
          name: '归元护体',
          type: 'defense',
          cost: 1,
          block: 8,
          effects: [{ type: 'block', value: 8 }]
        }
      ];
    }
    if (typeof battle.resetTurnAdvisorTelemetry === 'function') {
      battle.resetTurnAdvisorTelemetry();
    }
    if (typeof battle.updateBattleUI === 'function') battle.updateBattleUI();

    const panel = document.getElementById('battle-command-panel');
    const button = panel ? panel.querySelector('.battle-advisor-cardstep-btn') : null;
    if (!button || typeof button.click !== 'function') {
      return { ok: false, reason: 'no_advisor_step_button' };
    }

    const beforeLogCount = Array.isArray(Utils._battleLogHistory) ? Utils._battleLogHistory.length : 0;
    button.click();
    const selectedCard = document.querySelector('#hand-cards .card.selected');
    const targetingActive = !!document.querySelector('#hand-cards.targeting-active');

    await battle.endTurn();

    const logTexts = Array.isArray(Utils._battleLogHistory)
      ? Utils._battleLogHistory.map((item) => String(item?.message || '').trim())
      : [];
    const reviewEntry = [...logTexts].reverse().find((text) => /回合复盘：/.test(text)) || '';
    const afterLogCount = logTexts.length;
    return {
      ok: (targetingActive || !!selectedCard) && /回合复盘：/.test(reviewEntry),
      selectedCardIndex: selectedCard ? String(selectedCard.getAttribute('data-index') || '') : '',
      targetingActive,
      beforeLogCount,
      afterLogCount,
      reviewEntry
    };
  });
  add(
    'advisor preview enters selection state and end turn writes review log',
    !!advisorTurnReviewProbe &&
      !!advisorTurnReviewProbe.ok &&
      Number(advisorTurnReviewProbe.afterLogCount || 0) > Number(advisorTurnReviewProbe.beforeLogCount || 0) &&
      /回合复盘：/.test(advisorTurnReviewProbe.reviewEntry || '') &&
      (/已预选建议牌但未执行|错过破盾窗口|未按/.test(advisorTurnReviewProbe.reviewEntry || '')),
    JSON.stringify(advisorTurnReviewProbe || null)
  );

  const squadEcologyProbe = await page.evaluate(() => {
    if (!window.game || !game.battle) return { ok: false, reason: 'no_battle' };
    const battle = game.battle;
    if (typeof battle.applyEnemySquadEcology !== 'function') return { ok: false, reason: 'no_squad_ecology_method' };

    battle.enemies = [
      {
        id: 'audit_squad_alpha',
        name: '试作敌阵甲',
        icon: '🧪',
        currentHp: 150,
        maxHp: 150,
        block: 0,
        buffs: {},
        patterns: [{ type: 'attack', value: 12, intent: '⚔️斩击' }],
        currentPatternIndex: 0
      },
      {
        id: 'audit_squad_beta',
        name: '试作敌阵乙',
        icon: '🧪',
        currentHp: 145,
        maxHp: 145,
        block: 0,
        buffs: {},
        patterns: [{ type: 'defend', value: 9, intent: '🛡️护阵' }, { type: 'attack', value: 9, intent: '⚔️反斩' }],
        currentPatternIndex: 0
      },
      {
        id: 'audit_squad_gamma',
        name: '试作敌阵丙',
        icon: '🧪',
        currentHp: 140,
        maxHp: 140,
        block: 0,
        buffs: {},
        patterns: [{ type: 'debuff', buffType: 'weak', value: 1, intent: '🌀缠压' }, { type: 'attack', value: 8, intent: '⚔️刺击' }],
        currentPatternIndex: 0
      }
    ];
    battle.applyEnemySquadEcology();
    if (typeof battle.updateEnemiesUI === 'function') battle.updateEnemiesUI();
    if (typeof battle.updateEnvironmentUI === 'function') battle.updateEnvironmentUI();

    const squadTags = Array.from(document.querySelectorAll('.enemy .enemy-squad-tag')).map((el) => (el.textContent || '').trim());
    const envChip = document.querySelector('#battle-environment .squad-formation-chip');
    const roleLabels = battle.enemies.map((enemy) => enemy?.enemySquadRoleLabel || '');
    const enrichedPattern = battle.enemies.some((enemy) => Array.isArray(enemy?.patterns) && enemy.patterns.length >= 3);
    return {
      ok: !!battle.activeSquadEcology && squadTags.length >= 2 && roleLabels.some((label) => label === '阵核') && !!envChip,
      formation: battle.activeSquadEcology?.id || '',
      squadTags,
      envChipText: envChip ? (envChip.textContent || '').trim() : '',
      roleLabels,
      enrichedPattern
    };
  });
  add(
    'battle enemy squad ecology applies formation tags and role-differentiated behavior',
    !!squadEcologyProbe &&
      !!squadEcologyProbe.ok &&
      /编队/.test((squadEcologyProbe.squadTags || []).join(' ')) &&
      /敌阵/.test(squadEcologyProbe.envChipText || '') &&
      !!squadEcologyProbe.enrichedPattern,
    JSON.stringify(squadEcologyProbe || null)
  );

  const rewardMetaProbe = await page.evaluate(() => {
    if (!window.game || typeof game.renderRewardBattleMeta !== 'function') return { ok: false, reason: 'no_render_method' };

    game.lastBattleRewardMeta = {
      encounter: {
        themeId: 'theme_counter_lattice',
        themeName: '轮段·反制晶格',
        tierStage: 2,
        goldBonus: 18,
        ringExpBonus: 9
      },
      squad: {
        squadId: 'squad_hex_weave',
        squadName: '咒织链阵',
        goldBonus: 14,
        ringExpBonus: 11,
        synergyThemeName: '轮段·反制晶格'
      }
    };
    game.renderRewardBattleMeta();

    const panel = document.getElementById('reward-battle-meta');
    const chips = Array.from(panel?.querySelectorAll('.reward-meta-chip') || []);
    const texts = chips.map((chip) => (chip.textContent || '').trim());
    const style = panel ? getComputedStyle(panel) : null;
    const panelVisible = !!panel && !!style && style.display !== 'none' && style.visibility !== 'hidden';
    const title = panel ? (panel.querySelector('.reward-meta-title')?.textContent || '').trim() : '';

    game.lastBattleRewardMeta = null;
    game.renderRewardBattleMeta();
    const clearedDisplay = panel ? panel.style.display : '';
    const clearedHtml = panel ? panel.innerHTML.trim() : '';

    return {
      ok:
        panelVisible &&
        texts.length >= 6 &&
        texts.some((text) => /遭遇战利/.test(text)) &&
        texts.some((text) => /敌阵战利/.test(text)) &&
        texts.some((text) => /轮段协同/.test(text)),
      renderer: panel?.dataset?.renderer || '',
      title,
      chipCount: texts.length,
      texts,
      clearedDisplay,
      clearedHtmlLength: clearedHtml.length
    };
  });
  add(
    'reward screen meta panel shows localized encounter/squad sources and clears stale content',
    !!rewardMetaProbe &&
      !!rewardMetaProbe.ok &&
      rewardMetaProbe.renderer === 'battle-feedback' &&
      /战利来源/.test(rewardMetaProbe.title || '') &&
      rewardMetaProbe.clearedDisplay === 'none' &&
      Number(rewardMetaProbe.clearedHtmlLength ?? -1) === 0,
    JSON.stringify(rewardMetaProbe || null)
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
    const closeBtn = document.getElementById('battle-log-panel-close');
    return {
      active: !!panel && panel.classList.contains('active'),
      renderer: panel?.dataset?.renderer || '',
      closeAria: closeBtn?.getAttribute('aria-label') || ''
    };
  });
  add(
    'battle log panel opens with L hotkey',
    !!panelOpen?.active && panelOpen.renderer === 'battle-feedback' && /关闭战斗记录/.test(panelOpen.closeAria || ''),
    JSON.stringify(panelOpen || null)
  );

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

  const handCardConsistencyProbe = await page.evaluate(() => {
    if (!window.game || !game.battle || !game.player) return { ok: false, reason: 'no_battle' };
    const customHand = [
      { id: 'audit_long_law', name: '业火焚天', type: 'law', cost: 3, description: '造成 8 点伤害 3 次，每次附加 1 层灼烧。', icon: '🔥', rarity: 'rare' },
      { id: 'audit_break', name: '罗汉拳', type: 'attack', cost: 1, description: '造成 6 点伤害，获得 4 点护盾。', icon: '👊', rarity: 'common' },
      { id: 'audit_void', name: '虚空拥抱+', type: 'law', cost: 2, description: '造成敌人已损失生命 20% 的伤害。', icon: '🕳️', rarity: 'rare' },
      { id: 'audit_pause', name: '时间静止+', type: 'law', cost: 2, description: '敌人跳过下一回合。', icon: '⏱️', rarity: 'rare' },
      { id: 'audit_relay', name: '灵力激涌', type: 'energy', cost: 0, description: '获得 2 点灵力。', icon: '✨', rarity: 'common' },
      { id: 'audit_draw', name: '冥想', type: 'energy', cost: 1, description: '消耗 1 奶糖。抽 2 张牌。', icon: '🧘', rarity: 'common', consumeCandy: true }
    ];
    game.player.hand = customHand.map((card) => ({ ...card }));
    game.battle.player.hand = game.player.hand;
    game.player.currentEnergy = 10;
    game.player.milkCandy = 3;
    if (typeof game.battle.updateHandUI === 'function') game.battle.updateHandUI();

    const cards = Array.from(document.querySelectorAll('#hand-cards .card')).map((el) => {
      const rect = el.getBoundingClientRect();
      const imageRect = el.querySelector('.card-image, .card-art')?.getBoundingClientRect();
      const headerRect = el.querySelector('.card-header')?.getBoundingClientRect();
      const nameRect = el.querySelector('.card-name, .card-title')?.getBoundingClientRect();
      const descRect = el.querySelector('.card-desc')?.getBoundingClientRect();
      return {
        name: (el.querySelector('.card-name, .card-title')?.textContent || '').trim(),
        top: Math.round(rect.top),
        height: Math.round(rect.height),
        imageHeight: Math.round(imageRect?.height || 0),
        headerHeight: Math.round(headerRect?.height || 0),
        nameHeight: Math.round(nameRect?.height || 0),
        descHeight: Math.round(descRect?.height || 0)
      };
    });
    const topSpread = cards.length > 0 ? Math.max(...cards.map((card) => card.top)) - Math.min(...cards.map((card) => card.top)) : 999;
    const heightSpread = cards.length > 0 ? Math.max(...cards.map((card) => card.height)) - Math.min(...cards.map((card) => card.height)) : 999;
    return {
      ok:
        cards.length >= 6 &&
        topSpread <= 2 &&
        heightSpread <= 2 &&
        cards.every((card) => card.imageHeight >= 28 && card.headerHeight >= 18 && card.nameHeight >= 12 && card.descHeight >= 18),
      topSpread,
      heightSpread,
      cards
    };
  });
  add(
    'battle hand cards keep consistent header, art and description geometry',
    !!handCardConsistencyProbe?.ok,
    JSON.stringify(handCardConsistencyProbe || null)
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
    let matrix = state.commands.find((command) => command && command.id === 'resonance_matrix_order');
    if (!matrix && typeof game.battle.getBattleCommandCatalog === 'function') {
      const matrixTemplate = game.battle.getBattleCommandCatalog().find((command) => command && command.id === 'resonance_matrix_order');
      if (matrixTemplate) {
        state.commands.push({
          ...matrixTemplate,
          cooldownRemaining: 0,
          timesUsed: 0
        });
        matrix = state.commands.find((command) => command && command.id === 'resonance_matrix_order') || null;
      }
    }
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

    let panel = document.getElementById('battle-command-panel');
    const activeMode = panel?.querySelector('.battle-advisor-matrix-btn.active')?.getAttribute('data-mode') || '';
    const pendingText = (panel?.querySelector('.battle-advisor-pending-mode')?.textContent || '').trim();
    const queuedBefore = Number(game.player?.buffs?.matrixBreakSignal) || 0;
    const hotkeyEvent = new KeyboardEvent('keydown', { key: '2', bubbles: true });
    document.dispatchEvent(hotkeyEvent);
    panel = document.getElementById('battle-command-panel');
    const activeModeAfterHotkey = panel?.querySelector('.battle-advisor-matrix-btn.active')?.getAttribute('data-mode') || '';
    const pendingAfterHotkey = (panel?.querySelector('.battle-advisor-pending-mode')?.textContent || '').trim();
    const queuedGuardBeforeConsume = Number(game.player?.buffs?.matrixGuardSignal) || 0;
    const consumed = typeof game.battle.consumeResonanceMatrixSignalMode === 'function'
      ? game.battle.consumeResonanceMatrixSignalMode()
      : null;
    const queuedAfter = Number(game.player?.buffs?.matrixBreakSignal) || 0;
    const queuedGuardAfter = Number(game.player?.buffs?.matrixGuardSignal) || 0;
    const hotkeyHint = (panel?.querySelector('.battle-advisor-hotkey')?.textContent || '').trim();

    if (typeof prevIsEndlessActive === 'function') game.isEndlessActive = prevIsEndlessActive;
    if (typeof prevEnsureEndlessState === 'function') game.ensureEndlessState = prevEnsureEndlessState;

    return {
      ok:
        queuedBefore > 0
        && activeMode === 'break'
        && /破阵/.test(pendingText)
        && activeModeAfterHotkey === 'guard'
        && /守势/.test(pendingAfterHotkey)
        && queuedGuardBeforeConsume > 0
        && queuedAfter === 0
        && queuedGuardAfter === 0
        && consumed?.id === 'guard'
        && /1自适应/.test(hotkeyHint),
      activeMode,
      pendingText,
      activeModeAfterHotkey,
      pendingAfterHotkey,
      queuedBefore,
      queuedAfter,
      queuedGuardBeforeConsume,
      queuedGuardAfter,
      hotkeyHint,
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

  const observatoryProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showObservatoryNode !== 'function') return null;
    game.player.heavenlyInsight = 0;
    game.player.shopRumors = typeof game.normalizeShopRumors === 'function'
      ? game.normalizeShopRumors(null)
      : { rewardRareCharges: 0, rewardRareBonus: 0, treasureCharges: 0, treasureChanceBonus: 0, nextRealmMapShift: null, nextRealmLabel: '', nextRealmTarget: null, history: [] };
    game.showObservatoryNode({ id: 91008, row: 2, type: 'observatory', completed: false, accessible: true });
    const title = document.getElementById('event-title')?.textContent || '';
    const desc = (document.getElementById('event-desc')?.textContent || '').replace(/\s+/g, ' ').trim();
    const choices = Array.from(document.querySelectorAll('#event-choices .event-choice')).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
    const forecastBtn = Array.from(document.querySelectorAll('#event-choices .event-choice')).find((el) => (el.textContent || '').includes('福缘星轨'));
    if (forecastBtn) forecastBtn.click();
    return {
      title,
      desc,
      choiceCount: choices.length,
      hasUtility: choices.some((t) => t.includes('福缘星轨')),
      hasAssault: choices.some((t) => t.includes('锋芒星轨')),
      hasReward: choices.some((t) => t.includes('校准星图战利')),
      nextRealmLabel: game.player?.shopRumors?.nextRealmLabel || '',
      insight: Number(game.player?.heavenlyInsight || 0)
    };
  });
  add(
    'observatory node previews future realm and can lock a route forecast',
    !!observatoryProbe &&
      /观星台/.test(observatoryProbe.title) &&
      observatoryProbe.hasUtility &&
      observatoryProbe.hasAssault &&
      observatoryProbe.hasReward &&
      observatoryProbe.choiceCount >= 4 &&
      /天象|Boss/.test(observatoryProbe.desc) &&
      /机缘补给线/.test(observatoryProbe.nextRealmLabel) &&
      observatoryProbe.insight >= 1,
    JSON.stringify(observatoryProbe || null)
  );
  await page.evaluate(() => {
    document.getElementById('reward-modal')?.classList.remove('active');
    document.getElementById('event-modal')?.classList.remove('active');
  });

  const forbiddenAltarProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showForbiddenAltarNode !== 'function') return null;
    const startingTreasureCount = Array.isArray(game.player?.collectedTreasures) ? game.player.collectedTreasures.length : 0;
    const baseDeck = Array.isArray(game.player?.deck) ? game.player.deck.filter((card) => card && card.id !== 'demonDoubt') : [];
    game.player.deck = baseDeck.slice();
    game.showForbiddenAltarNode({ id: 91009, row: 2, type: 'forbidden_altar', completed: false, accessible: true });
    const title = document.getElementById('event-title')?.textContent || '';
    const choices = Array.from(document.querySelectorAll('#event-choices .event-choice')).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
    const doomBtn = Array.from(document.querySelectorAll('#event-choices .event-choice')).find((el) => (el.textContent || '').includes('灾像供契'));
    if (doomBtn) doomBtn.click();
    return {
      title,
      hasBloodDraft: choices.some((t) => t.includes('血契夺卷')),
      hasVowDraft: choices.some((t) => t.includes('裂誓献祭')),
      hasDoomTrade: choices.some((t) => t.includes('灾像供契')),
      hasCurse: Array.isArray(game.player?.deck) && game.player.deck.some((card) => card && card.id === 'demonDoubt'),
      treasureCount: Array.isArray(game.player?.collectedTreasures) ? game.player.collectedTreasures.length : 0,
      startingTreasureCount,
      karma: Number(game.player?.karma || 0)
    };
  });
  add(
    'forbidden altar offers high-risk options and doom trade applies curse plus treasure value',
    !!forbiddenAltarProbe &&
      /禁术坛/.test(forbiddenAltarProbe.title) &&
      forbiddenAltarProbe.hasBloodDraft &&
      forbiddenAltarProbe.hasVowDraft &&
      forbiddenAltarProbe.hasDoomTrade &&
      forbiddenAltarProbe.hasCurse &&
      forbiddenAltarProbe.treasureCount > forbiddenAltarProbe.startingTreasureCount,
    JSON.stringify(forbiddenAltarProbe || null)
  );
  await page.evaluate(() => {
    document.getElementById('reward-modal')?.classList.remove('active');
    document.getElementById('event-modal')?.classList.remove('active');
  });

  const memoryRiftProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showMemoryRiftNode !== 'function') return null;
    const destinyId = game.player?.runDestiny?.id || game.getRunDestinyCatalog?.()?.[0]?.id || null;
    if (destinyId && typeof game.player?.setRunDestiny === 'function') {
      game.player.setRunDestiny(destinyId, 1);
    }
    const beforeTier = Number(game.player?.runDestiny?.tier || 1);
    game.showMemoryRiftNode({ id: 91010, row: 2, type: 'memory_rift', completed: false, accessible: true });
    const title = document.getElementById('event-title')?.textContent || '';
    const choices = Array.from(document.querySelectorAll('#event-choices .event-choice')).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
    const upgradeBtn = Array.from(document.querySelectorAll('#event-choices .event-choice')).find((el) => (el.textContent || '').includes('追忆命格'));
    if (upgradeBtn) upgradeBtn.click();
    return {
      title,
      hasUpgrade: choices.some((t) => t.includes('追忆命格')),
      hasDraft: choices.some((t) => t.includes('撕取残章')),
      hasRewrite: choices.some((t) => t.includes('逆写路标')),
      beforeTier,
      afterTier: Number(game.player?.runDestiny?.tier || 0)
    };
  });
  add(
    'memory rift can upgrade run destiny and exposes rewrite choices',
    !!memoryRiftProbe &&
      /记忆裂隙/.test(memoryRiftProbe.title) &&
      memoryRiftProbe.hasUpgrade &&
      memoryRiftProbe.hasDraft &&
      memoryRiftProbe.hasRewrite &&
      memoryRiftProbe.afterTier > memoryRiftProbe.beforeTier,
    JSON.stringify(memoryRiftProbe || null)
  );
  await page.evaluate(() => {
    document.getElementById('reward-modal')?.classList.remove('active');
    document.getElementById('event-modal')?.classList.remove('active');
  });

  const spiritGrottoProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showSpiritGrottoNode !== 'function') return null;
    if (typeof game.player?.setSpiritCompanion === 'function') {
      game.player.setSpiritCompanion('frostChi', 1);
    }
    const beforeTier = Number(game.player?.spiritCompanion?.tier || 1);
    game.showSpiritGrottoNode({ id: 91011, row: 2, type: 'spirit_grotto', completed: false, accessible: true });
    const title = document.getElementById('event-title')?.textContent || '';
    const choices = Array.from(document.querySelectorAll('#event-choices .event-choice')).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
    const upgradeBtn = Array.from(document.querySelectorAll('#event-choices .event-choice')).find((el) => (el.textContent || '').includes('灵契升阶'));
    if (upgradeBtn) upgradeBtn.click();
    return {
      title,
      hasDraft: choices.some((t) => t.includes('契引新灵')),
      hasUpgrade: choices.some((t) => t.includes('灵契升阶')),
      hasTrace: choices.some((t) => t.includes('追索灵痕')),
      beforeTier,
      afterTier: Number(game.player?.spiritCompanion?.tier || 0),
      insight: Number(game.player?.heavenlyInsight || 0)
    };
  });
  add(
    'spirit grotto can upgrade spirit companion and exposes reroll / trace choices',
    !!spiritGrottoProbe &&
      /灵契窟/.test(spiritGrottoProbe.title) &&
      spiritGrottoProbe.hasDraft &&
      spiritGrottoProbe.hasUpgrade &&
      spiritGrottoProbe.hasTrace &&
      spiritGrottoProbe.afterTier > spiritGrottoProbe.beforeTier &&
      spiritGrottoProbe.insight >= 1,
    JSON.stringify(spiritGrottoProbe || null)
  );
  await page.evaluate(() => {
    document.getElementById('reward-modal')?.classList.remove('active');
    document.getElementById('event-modal')?.classList.remove('active');
  });

  const forgeWorkshopProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showForgeChoiceModal !== 'function') return null;
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

    game.showForgeChoiceModal({ id: 91012, row: 2, type: 'forge', completed: false, accessible: true }, {
      forgeCost: 50,
      premiumCost: 110,
      temperCost: 30
    });

    const title = document.getElementById('event-title')?.textContent || '';
    const choices = Array.from(document.querySelectorAll('#event-choices .event-choice')).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
    const reforgeBtn = Array.from(document.querySelectorAll('#event-choices .event-choice')).find((el) => (el.textContent || '').includes('法宝重铸'));
    if (reforgeBtn) reforgeBtn.click();
    const reforgeChoices = Array.from(document.querySelectorAll('#event-choices .event-choice')).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
    const pickBtn = Array.from(document.querySelectorAll('#event-choices .event-choice')).find((el) => (el.textContent || '').includes('铁壁符'));
    if (pickBtn) pickBtn.click();

    const treasureWorkshop = typeof game.player?.getTreasureWorkshopSnapshot === 'function'
      ? game.player.getTreasureWorkshopSnapshot('equipped')
      : [];
    return {
      title,
      hasCardBranch: choices.some((t) => t.includes('锻牌方案')),
      hasReforge: choices.some((t) => t.includes('法宝重铸')),
      hasInfusion: choices.some((t) => t.includes('器灵灌注')),
      hasCalibration: choices.some((t) => t.includes('套装修正')),
      reforgeChoiceCount: reforgeChoices.length,
      reforgeApplied: treasureWorkshop.some((entry) => entry && entry.reforge && entry.reforge.mode === 'bulwark'),
      workshopTags: treasureWorkshop
    };
  });
  add(
    'forge node upgrades into workshop menu with card, reforge, infusion, and calibration branches',
    !!forgeWorkshopProbe &&
      /炼器坊/.test(forgeWorkshopProbe.title) &&
      forgeWorkshopProbe.hasCardBranch &&
      forgeWorkshopProbe.hasReforge &&
      forgeWorkshopProbe.hasInfusion &&
      forgeWorkshopProbe.hasCalibration &&
      forgeWorkshopProbe.reforgeChoiceCount >= 2 &&
      forgeWorkshopProbe.reforgeApplied,
    JSON.stringify(forgeWorkshopProbe || null)
  );
  await page.evaluate(() => {
    document.getElementById('reward-modal')?.classList.remove('active');
    document.getElementById('event-modal')?.classList.remove('active');
  });

  const trialChallengeProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showTrialChallengeSelection !== 'function') return null;
    game.showTrialChallengeSelection({ id: 91013, row: 2, type: 'trial', completed: false, accessible: true });
    const title = document.getElementById('event-title')?.textContent || '';
    const choices = Array.from(document.querySelectorAll('#event-choices .event-choice')).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
    const dualBtn = Array.from(document.querySelectorAll('#event-choices .event-choice')).find((el) => (el.textContent || '').includes('双誓并压'));
    if (dualBtn) dualBtn.click();
    const trialPayload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    return {
      title,
      choiceCount: choices.length,
      hasSpeed: choices.some((t) => t.includes('逐光试斩')),
      hasNoDamage: choices.some((t) => t.includes('无伤镜湖')),
      hasDual: choices.some((t) => t.includes('双誓并压')),
      activeTrial: game.activeTrial,
      trialName: game.trialData?.name || null,
      trialChallenge: trialPayload?.battle?.trialChallenge || null,
      currentScreen: game.currentScreen,
      enemyName: game.battle?.enemies?.[0]?.name || '',
      enemyHasTrialDebuff: Array.isArray(game.battle?.enemies?.[0]?.patterns)
        && game.battle.enemies[0].patterns.some((pattern) => pattern?.type === 'debuff' && pattern?.buffType === 'vulnerable' && Number(pattern?.value || 0) >= 1),
      trialReward: game.trialData?.reward || null
    };
  });
  add(
    'trial node upgrades into selectable challenge碑 and chosen affix package enters battle state',
    !!trialChallengeProbe &&
      /试炼碑/.test(trialChallengeProbe.title) &&
      trialChallengeProbe.choiceCount >= 4 &&
      trialChallengeProbe.hasSpeed &&
      trialChallengeProbe.hasNoDamage &&
      trialChallengeProbe.hasDual &&
      trialChallengeProbe.activeTrial === 'oathMirror' &&
      trialChallengeProbe.trialName === '双誓并压' &&
      trialChallengeProbe.trialChallenge?.conditions?.noDamage === true &&
      Number(trialChallengeProbe.trialChallenge?.conditions?.maxTurns || 0) === 5 &&
      trialChallengeProbe.trialReward === 'law' &&
      trialChallengeProbe.currentScreen === 'battle-screen' &&
      /试炼/.test(trialChallengeProbe.enemyName) &&
      trialChallengeProbe.enemyHasTrialDebuff,
    JSON.stringify(trialChallengeProbe || null)
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
    if (typeof game.createDefaultStrategicEngineeringState === 'function') {
      game.player.strategicEngineering = game.createDefaultStrategicEngineeringState();
      game.player.strategicEngineering.lastAdvancedTrackId = 'memory_rift';
      if (game.player.strategicEngineering.tracks?.memory_rift) {
        game.player.strategicEngineering.tracks.memory_rift.progress = 2;
        game.player.strategicEngineering.tracks.memory_rift.tier = 2;
        game.player.strategicEngineering.tracks.memory_rift.lastRealm = game.player?.realm || 1;
      }
    }
    window.__debugEventQueue = ['ashLedgerTrial'];
    const evt = getRandomEvent();
    if (!evt) return;
    game.showEventModal(evt, { id: 91002, row: 2, type: 'event', completed: false, accessible: true });
  });
  await page.waitForTimeout(120);
  const engineeringEventProbe = await page.evaluate(() => {
    const summary = (document.getElementById('event-system-summary')?.textContent || '').replace(/\s+/g, ' ').trim();
    const choices = Array.from(document.querySelectorAll('#event-choices .event-choice')).map((el) =>
      (el.textContent || '').replace(/\s+/g, ' ').trim()
    );
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    return {
      summary,
      choices,
      eventMeta: payload?.eventModal?.engineeringEventMeta || null,
      biasProfile: payload?.map?.chapter?.engineeringEventBias || null
    };
  });
  add(
    'memory-rift engineering event surfaces meta in modal and render_game_to_text',
    !!engineeringEventProbe &&
      /工程/.test(engineeringEventProbe.summary || '') &&
      /裂隙工程/.test(engineeringEventProbe.summary || '') &&
      engineeringEventProbe.choices.some((text) => text.includes('裂隙页边注追加') || text.includes('裂隙校对补偿')) &&
      engineeringEventProbe.eventMeta?.trackId === 'memory_rift' &&
      engineeringEventProbe.eventMeta?.selectedByEngineeringBias === false &&
      engineeringEventProbe.biasProfile?.trackId === 'memory_rift' &&
      Array.isArray(engineeringEventProbe.biasProfile?.eventIds) &&
      engineeringEventProbe.biasProfile.eventIds.includes('ashLedgerTrial'),
    JSON.stringify(engineeringEventProbe || null)
  );
  await page.evaluate(() => {
    const em = document.getElementById('event-modal');
    if (em) em.classList.remove('active');
  });
  await page.waitForTimeout(120);

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

    const collectDangerUi = (panel) => {
      const dangerBand = panel?.querySelector(
        '.endless-danger-band, .endless-dri-band, .endless-danger-panel, [data-endless-danger-band]'
      ) || null;
      const dangerHead = dangerBand?.querySelector(
        '.endless-danger-head, .endless-dri-head, .challenge-danger-head, [data-endless-danger-head]'
      ) || null;
      const dangerSummary = dangerBand?.querySelector(
        '.endless-danger-summary, .endless-dri-summary, .challenge-danger-summary, [data-endless-danger-summary]'
      ) || null;
      const dangerFoot = dangerBand?.querySelector(
        '.endless-danger-foot, .endless-dri-foot, .challenge-danger-foot, [data-endless-danger-foot]'
      ) || null;
      const dangerChips = Array.from(dangerBand?.querySelectorAll(
        '.endless-danger-chip, .endless-dri-chip, .challenge-danger-chip, [data-endless-danger-chip]'
      ) || []);
      const counterplayEl = panel?.querySelector(
        '.endless-danger-counterplay, [data-endless-counterplay], .endless-directive-note'
      ) || null;
      const reserveEl = panel?.querySelector(
        '.endless-danger-reserve, [data-endless-reserve], .endless-danger-note'
      ) || null;
      return {
        bandVisible: !!dangerBand,
        chipCount: dangerChips.length,
        headText: (dangerHead?.textContent || '').replace(/\s+/g, ' ').trim(),
        summaryText: (dangerSummary?.textContent || '').replace(/\s+/g, ' ').trim(),
        footText: (dangerFoot?.textContent || '').replace(/\s+/g, ' ').trim(),
        counterplayText: (counterplayEl?.textContent || '').replace(/\s+/g, ' ').trim(),
        reserveText: (reserveEl?.textContent || '').replace(/\s+/g, ' ').trim()
      };
    };

    const readTextState = () => {
      try {
        return typeof window.render_game_to_text === 'function'
          ? JSON.parse(window.render_game_to_text())
          : null;
      } catch {
        return null;
      }
    };

    const readDangerPayload = () => {
      const textState = readTextState();
      if (textState?.endlessDangerProfile) {
        return textState.endlessDangerProfile;
      }
      if (typeof game.getEndlessDangerProfile === 'function') {
        try {
          return game.getEndlessDangerProfile();
        } catch {
          return null;
        }
      }
      return null;
    };

    const state = game.ensureEndlessState();
    state.pressure = 3;
    state.currentCycle = 5;
    state.seasonCycleClears = 2;
    state.seasonBossDefeated = 1;
    state.seasonScore = 280;
    state.seasonBestCycle = Math.max(6, Number(state.seasonBestCycle) || 0);
    state.seasonCollapseStats = { pressure_overload: 2, sustain_break: 1 };
    state.lastSeasonCollapse = {
      id: 'pressure_overload',
      label: '压力失控',
      desc: '轮回压力已到高危区间，敌方连续压迫节奏将战线击穿。',
      cycle: 5,
      pressure: 8,
      directiveId: null,
      recordedAt: Date.now()
    };
    game.showScreen('map-screen');
    if (typeof game.map.updateEndlessPanel === 'function') game.map.updateEndlessPanel();

    const panel = document.getElementById('map-endless-panel');
    const beforeDangerUi = collectDangerUi(panel);
    const beforeDangerPayload = readDangerPayload();
    const beforeText = panel ? (panel.textContent || '').replace(/\s+/g, ' ').trim() : '';
    const beforeThemeText = panel?.querySelector('.endless-theme-chip')?.textContent?.trim() || '';
    const beforeThemeDesc = panel?.querySelector('.endless-theme-desc')?.textContent?.trim() || '';
    const beforeSeasonText = panel?.querySelector('.endless-season-chip')?.textContent?.trim() || '';
    const beforeDirectiveText = panel?.querySelector('.endless-directive-chip')?.textContent?.trim() || '';
    const beforeSeasonDesc = panel?.querySelector('.endless-season-desc')?.textContent?.trim() || '';
    const beforeSeasonLedger = panel?.querySelector('.endless-season-ledger')?.textContent?.trim() || '';
    const directiveOptionCount = panel?.querySelectorAll('.endless-directive-option')?.length || 0;
    const goalCardCount = panel?.querySelectorAll('.endless-season-goal')?.length || 0;
    const collapseChipCount = panel?.querySelectorAll('.endless-collapse-chip')?.length || 0;

    const nextState = game.ensureEndlessState();
    nextState.pressure = 8;
    nextState.currentCycle = 6;
    if (typeof game.map.updateEndlessPanel === 'function') game.map.updateEndlessPanel();
    const afterPressureDangerUi = collectDangerUi(panel);
    const afterPressureDangerPayload = readDangerPayload();
    const afterText = panel ? (panel.textContent || '').replace(/\s+/g, ' ').trim() : '';
    const afterThemeText = panel?.querySelector('.endless-theme-chip')?.textContent?.trim() || '';
    const afterThemeDesc = panel?.querySelector('.endless-theme-desc')?.textContent?.trim() || '';
    const afterSeasonText = panel?.querySelector('.endless-season-chip')?.textContent?.trim() || '';
    const afterDirectiveText = panel?.querySelector('.endless-directive-chip')?.textContent?.trim() || '';
    const afterSeasonDesc = panel?.querySelector('.endless-season-desc')?.textContent?.trim() || '';
    const afterSeasonLedger = panel?.querySelector('.endless-season-ledger')?.textContent?.trim() || '';
    const pulseUpBeforeClick = !!panel?.classList.contains('pressure-up');
    const directiveNoteBeforeClick = panel?.querySelector('.endless-directive-note')?.textContent?.trim() || '';
    const volatileDirectiveBtn = Array.from(panel?.querySelectorAll('.endless-directive-option.risk-volatile') || [])[0] || null;
    if (volatileDirectiveBtn) volatileDirectiveBtn.click();
    const directiveNoteAfterClick = panel?.querySelector('.endless-directive-note')?.textContent?.trim() || '';
    const afterDirectiveDangerUi = collectDangerUi(panel);
    const afterDirectiveDangerPayload = readDangerPayload();
    const collapseNote = panel?.querySelector('.endless-collapse-note')?.textContent?.trim() || '';
    const textState = readTextState();

    return {
      visible: !!panel && getComputedStyle(panel).display !== 'none',
      hasBehaviorChip: !!panel?.querySelector('.endless-pressure-chip'),
      hasThemeChip: !!panel?.querySelector('.endless-theme-chip'),
      hasSeasonChip: !!panel?.querySelector('.endless-season-chip'),
      hasDirectiveChip: !!panel?.querySelector('.endless-directive-chip'),
      hasSeasonDesc: !!panel?.querySelector('.endless-season-desc'),
      hasSeasonLedger: !!panel?.querySelector('.endless-season-ledger'),
      hasDirectiveControls: !!panel?.querySelector('.endless-directive-controls'),
      hasGoalGrid: !!panel?.querySelector('.endless-season-goal-grid'),
      hasCollapseLedger: !!panel?.querySelector('.endless-collapse-ledger'),
      hasDangerBand: beforeDangerUi.bandVisible || afterPressureDangerUi.bandVisible || afterDirectiveDangerUi.bandVisible,
      dangerChipCount: Math.max(beforeDangerUi.chipCount, afterPressureDangerUi.chipCount, afterDirectiveDangerUi.chipCount),
      beforeDangerHead: beforeDangerUi.headText,
      afterPressureDangerHead: afterPressureDangerUi.headText,
      afterDirectiveDangerHead: afterDirectiveDangerUi.headText,
      beforeDangerSummary: beforeDangerUi.summaryText,
      afterPressureDangerSummary: afterPressureDangerUi.summaryText,
      afterDirectiveDangerSummary: afterDirectiveDangerUi.summaryText,
      afterDirectiveDangerFoot: afterDirectiveDangerUi.footText,
      afterPressureCounterplay: afterPressureDangerUi.counterplayText,
      afterDirectiveCounterplay: afterDirectiveDangerUi.counterplayText,
      afterDirectiveReserve: afterDirectiveDangerUi.reserveText,
      beforeDangerPayload,
      afterPressureDangerPayload,
      afterDirectiveDangerPayload,
      pulseUpBeforeClick,
      pulseUp: !!panel?.classList.contains('pressure-up'),
      dataPressure: panel?.dataset?.pressure || '',
      directiveOptionCount,
      goalCardCount,
      collapseChipCount,
      beforeText,
      afterText,
      beforeThemeText,
      afterThemeText,
      beforeThemeDesc,
      afterThemeDesc,
      beforeSeasonText,
      afterSeasonText,
      beforeDirectiveText,
      afterDirectiveText,
      beforeSeasonDesc,
      afterSeasonDesc,
      beforeSeasonLedger,
      afterSeasonLedger,
      directiveNoteBeforeClick,
      directiveNoteAfterClick,
      collapseNote,
      dangerPayload: textState?.endlessDangerProfile || afterDirectiveDangerPayload || null,
      seasonPayload: textState?.endlessSeason || null
    };
  });
  add(
    'endless panel shows pressure/theme/season hints, DRI danger profile, and pulse feedback when pressure rises',
    !!endlessPressurePanelProbe &&
      endlessPressurePanelProbe.visible &&
      endlessPressurePanelProbe.hasBehaviorChip &&
      endlessPressurePanelProbe.hasThemeChip &&
      endlessPressurePanelProbe.hasSeasonChip &&
      endlessPressurePanelProbe.hasDirectiveChip &&
      endlessPressurePanelProbe.hasSeasonDesc &&
      endlessPressurePanelProbe.hasSeasonLedger &&
      endlessPressurePanelProbe.hasDirectiveControls &&
      endlessPressurePanelProbe.hasGoalGrid &&
      endlessPressurePanelProbe.hasCollapseLedger &&
      endlessPressurePanelProbe.hasDangerBand &&
      endlessPressurePanelProbe.dangerChipCount >= 4 &&
      endlessPressurePanelProbe.pulseUpBeforeClick &&
      endlessPressurePanelProbe.dataPressure === '8' &&
      endlessPressurePanelProbe.directiveOptionCount >= 4 &&
      endlessPressurePanelProbe.goalCardCount >= 3 &&
      endlessPressurePanelProbe.collapseChipCount >= 1 &&
      endlessPressurePanelProbe.beforeThemeText !== endlessPressurePanelProbe.afterThemeText &&
      /轮段/.test(endlessPressurePanelProbe.afterThemeText || '') &&
      /敌方|战场|轮段/.test(endlessPressurePanelProbe.afterThemeDesc || '') &&
      /赛季：/.test(endlessPressurePanelProbe.afterSeasonText || '') &&
      /季签：/.test(endlessPressurePanelProbe.afterDirectiveText || '') &&
      /季签/.test(endlessPressurePanelProbe.afterSeasonDesc || '') &&
      /赛季战绩|赛季积分/.test(endlessPressurePanelProbe.afterSeasonLedger || '') &&
      /DRI/.test(endlessPressurePanelProbe.afterPressureDangerHead || endlessPressurePanelProbe.afterDirectiveDangerHead || '') &&
      /主轴|对策/.test(endlessPressurePanelProbe.afterDirectiveDangerFoot || '') &&
      (endlessPressurePanelProbe.afterDirectiveDangerSummary || '').length > 0 &&
      /对策|当前：/.test(endlessPressurePanelProbe.afterDirectiveCounterplay || '') &&
      (endlessPressurePanelProbe.afterDirectiveReserve || '').length > 0 &&
      /当前：/.test(endlessPressurePanelProbe.directiveNoteBeforeClick || '') &&
      /激进|玩家钦定/.test(endlessPressurePanelProbe.directiveNoteAfterClick || '') &&
      (
        endlessPressurePanelProbe.afterDirectiveDangerHead !== endlessPressurePanelProbe.afterPressureDangerHead ||
        endlessPressurePanelProbe.afterDirectiveDangerSummary !== endlessPressurePanelProbe.afterPressureDangerSummary ||
        endlessPressurePanelProbe.afterDirectiveCounterplay !== endlessPressurePanelProbe.afterPressureCounterplay ||
        endlessPressurePanelProbe.directiveNoteAfterClick !== endlessPressurePanelProbe.directiveNoteBeforeClick
      ) &&
      !!endlessPressurePanelProbe.dangerPayload &&
      Number.isFinite(Number(endlessPressurePanelProbe.dangerPayload.index)) &&
      typeof endlessPressurePanelProbe.dangerPayload.tierId === 'string' &&
      typeof endlessPressurePanelProbe.dangerPayload.dominantAxisId === 'string' &&
      typeof endlessPressurePanelProbe.dangerPayload.summary === 'string' &&
      typeof endlessPressurePanelProbe.dangerPayload.counterplay === 'string' &&
      typeof endlessPressurePanelProbe.dangerPayload.reserveGuidance === 'string' &&
      Array.isArray(endlessPressurePanelProbe.dangerPayload.axes) &&
      endlessPressurePanelProbe.dangerPayload.axes.length === 4 &&
      (
        Number(endlessPressurePanelProbe.afterPressureDangerPayload?.index || 0) >= Number(endlessPressurePanelProbe.beforeDangerPayload?.index || 0)
      ) &&
      /最近一次|崩盘/.test(endlessPressurePanelProbe.collapseNote || '') &&
      /敌方节奏/.test(endlessPressurePanelProbe.afterText || '') &&
      /重压|压制|连续/.test(endlessPressurePanelProbe.afterText || '') &&
      !!endlessPressurePanelProbe.seasonPayload &&
      typeof endlessPressurePanelProbe.seasonPayload.id === 'string' &&
      typeof endlessPressurePanelProbe.seasonPayload.directiveId === 'string' &&
      typeof endlessPressurePanelProbe.seasonPayload.weekTag === 'string' &&
      Array.isArray(endlessPressurePanelProbe.seasonPayload.goals) &&
      endlessPressurePanelProbe.seasonPayload.goals.length === 3 &&
      Array.isArray(endlessPressurePanelProbe.seasonPayload.directiveChoices) &&
      endlessPressurePanelProbe.seasonPayload.directiveChoices.length >= 3 &&
      typeof endlessPressurePanelProbe.seasonPayload.activeDirectiveSource === 'string' &&
      !!endlessPressurePanelProbe.seasonPayload.collapseStats,
    JSON.stringify(endlessPressurePanelProbe || null)
  );

  const endlessParanoiaProbe = await page.evaluate(async () => {
    if (!window.game || typeof game.ensureEndlessState !== 'function') return null;
    if (typeof game.isEndlessActive === 'function' && !game.isEndlessActive() && typeof game.startEndlessMode === 'function') {
      game.startEndlessMode();
    }
    if (typeof game.isEndlessActive !== 'function' || !game.isEndlessActive()) return null;

    const state = game.ensureEndlessState();
    state.currentCycle = 12;
    state.activeParanoiaBurdens = ['withered_mend'];
    state.activeParanoiaBoons = ['rare_surge'];
    state.paranoiaLevel = 1;
    state.paranoiaHistory = [{ burdenId: 'withered_mend', boonId: 'rare_surge', cycle: 13 }];
    game.showScreen('map-screen');
    if (typeof game.map?.updateEndlessPanel === 'function') game.map.updateEndlessPanel();

    const panel = document.getElementById('map-endless-panel');
    const chipText = panel?.querySelector('.endless-paranoia-chip')?.textContent?.trim() || '';
    const summaryText = panel?.querySelector('.endless-paranoia-summary')?.textContent?.trim() || '';
    const effectTexts = Array.from(panel?.querySelectorAll('.endless-paranoia-effect') || []).map((el) => (el.textContent || '').trim());

    let choiceCount = 0;
    let beforeHistory = Array.isArray(state.paranoiaHistory) ? state.paranoiaHistory.length : 0;
    let afterHistory = beforeHistory;
    let afterSummary = summaryText;
    let modalOpened = false;
    if (typeof game.showEndlessParanoiaSelection === 'function') {
      game.showEndlessParanoiaSelection(26);
      await new Promise((resolve) => setTimeout(resolve, 80));
      modalOpened = !!document.getElementById('event-modal')?.classList.contains('active');
      const buttons = Array.from(document.querySelectorAll('#event-choices .event-choice'));
      choiceCount = buttons.length;
      if (buttons[0]) {
        buttons[0].click();
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      const latestState = game.ensureEndlessState();
      afterHistory = Array.isArray(latestState.paranoiaHistory) ? latestState.paranoiaHistory.length : 0;
      if (typeof game.map?.updateEndlessPanel === 'function') game.map.updateEndlessPanel();
      afterSummary = panel?.querySelector('.endless-paranoia-summary')?.textContent?.trim() || '';
    }

    return {
      visible: !!panel && getComputedStyle(panel).display !== 'none',
      chipText,
      summaryText,
      effectTexts,
      modalOpened,
      choiceCount,
      beforeHistory,
      afterHistory,
      afterSummary
    };
  });
  add(
    'endless paranoia panel and selection flow are visible and actionable',
    !!endlessParanoiaProbe &&
      endlessParanoiaProbe.visible &&
      /轮回偏执/.test(endlessParanoiaProbe.chipText || '') &&
      /偏执/.test(endlessParanoiaProbe.summaryText || '') &&
      endlessParanoiaProbe.effectTexts.length >= 1 &&
      endlessParanoiaProbe.modalOpened &&
      Number(endlessParanoiaProbe.choiceCount || 0) >= 3 &&
      Number(endlessParanoiaProbe.afterHistory || 0) > Number(endlessParanoiaProbe.beforeHistory || 0) &&
      /偏执/.test(endlessParanoiaProbe.afterSummary || ''),
    JSON.stringify(endlessParanoiaProbe || null)
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
    const battleLogText = (document.getElementById('battle-log')?.textContent || '').replace(/\s+/g, ' ').trim();
    game.closeModal?.();
    return {
      hasBlessingService,
      draftChoiceCount: draftButtons.length,
      beforeGold,
      afterGold,
      beforeHistory,
      afterHistory,
      boonStatsChanged: beforeStats !== afterStats,
      soldFlag,
      logApplied: /轮回祷告：获得赐福/.test(battleLogText)
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
        !!endlessShopBlessingProbe.boonStatsChanged ||
        !!endlessShopBlessingProbe.logApplied
      ) &&
      endlessShopBlessingProbe.soldFlag,
    JSON.stringify(endlessShopBlessingProbe || null)
  );

  const strategicShopProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showShop !== 'function' || typeof game.buyItem !== 'function') return null;
    if (typeof game.isEndlessActive === 'function' && game.isEndlessActive() && typeof game.handleEndlessModeExit === 'function') {
      game.handleEndlessModeExit();
    }
    game.player.gold = Math.max(game.player.gold || 0, 4000);
    game.player.heavenlyInsight = 4;
    game.player.karma = 8;
    game.player.shopRumors = game.normalizeShopRumors ? game.normalizeShopRumors(null) : {
      rewardRareCharges: 0,
      rewardRareBonus: 0,
      treasureCharges: 0,
      treasureChanceBonus: 0,
      nextRealmMapShift: null,
      nextRealmLabel: '',
      nextRealmTarget: null,
      history: []
    };

    game.showShop({ id: 92001, row: 2, type: 'shop', completed: false, accessible: true });
    const tabTexts = Array.from(document.querySelectorAll('#shop-tab-bar .shop-tab-btn')).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
    const displayBefore = {
      gold: Number(document.getElementById('shop-gold-display')?.textContent || 0),
      insight: Number(document.getElementById('shop-insight-display')?.textContent || 0),
      karma: Number(document.getElementById('shop-karma-display')?.textContent || 0)
    };

    game.switchShopTab?.('rumor');
    const rumorPriceTexts = Array.from(document.querySelectorAll('#shop-services-container .buy-btn .price')).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
    const rumorIdx = (game.shopServices || []).findIndex((service) => service && service.id === 'rumorRareDraft');
    const beforeInsight = game.player.heavenlyInsight;
    if (rumorIdx >= 0) game.buyItem('service', rumorIdx);
    const rumorState = game.ensureShopRumors ? game.ensureShopRumors() : (game.player.shopRumors || {});

    game.switchShopTab?.('contract');
    const contractPriceTexts = Array.from(document.querySelectorAll('#shop-services-container .buy-btn .price')).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
    const beforeKarma = game.player.karma;
    const beforeDeckSize = Array.isArray(game.player.deck) ? game.player.deck.length : 0;
    const beforeTreasureCount = Array.isArray(game.player.collectedTreasures) ? game.player.collectedTreasures.length : 0;
    const doomIdx = (game.shopServices || []).findIndex((service) => service && service.id === 'doomIdol');
    if (doomIdx >= 0) game.buyItem('service', doomIdx);

    return {
      tabTexts,
      displayBefore,
      rumorPriceTexts,
      contractPriceTexts,
      rumorRareCharges: Number(rumorState.rewardRareCharges || 0),
      rumorInsightSpent: game.player.heavenlyInsight < beforeInsight,
      doomSpentKarma: game.player.karma < beforeKarma,
      doomAddedCurse: (game.player.deck || []).slice(beforeDeckSize).some((card) => card && card.id === 'demonDoubt'),
      doomAddedTreasure: Number((game.player.collectedTreasures || []).length) > beforeTreasureCount
    };
  });
  add(
    'shop supports base contract rumor tabs with multi-currency strategic purchases',
    !!strategicShopProbe &&
      Array.isArray(strategicShopProbe.tabTexts) &&
      strategicShopProbe.tabTexts.some((text) => text.includes('基础页')) &&
      strategicShopProbe.tabTexts.some((text) => text.includes('契约页')) &&
      strategicShopProbe.tabTexts.some((text) => text.includes('传闻页')) &&
      Number(strategicShopProbe.displayBefore?.insight || 0) >= 4 &&
      Number(strategicShopProbe.displayBefore?.karma || 0) >= 3 &&
      strategicShopProbe.rumorPriceTexts.some((text) => /天机|🔮/.test(text)) &&
      strategicShopProbe.contractPriceTexts.some((text) => /业果|🜂/.test(text)) &&
      Number(strategicShopProbe.rumorRareCharges || 0) >= 2 &&
      strategicShopProbe.rumorInsightSpent &&
      strategicShopProbe.doomSpentKarma &&
      strategicShopProbe.doomAddedCurse,
    JSON.stringify(strategicShopProbe || null)
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
    const originalParanoiaPicker = game.showEndlessParanoiaSelection;
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
    game.showEndlessParanoiaSelection = (cycle, done) => {
      try {
        const choices = typeof game.getEndlessParanoiaChoices === 'function' ? game.getEndlessParanoiaChoices() : [];
        if (choices && choices[0] && typeof game.applyEndlessParanoiaChoice === 'function') {
          game.applyEndlessParanoiaChoice(choices[0], cycle);
        }
      } finally {
        if (typeof done === 'function') done();
      }
    };
    game.handleEndlessRealmComplete();
    game.showEndlessBoonSelection = originalPicker;
    game.showEndlessParanoiaSelection = originalParanoiaPicker;
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
    const originalParanoiaPicker = game.showEndlessParanoiaSelection;
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
    game.showEndlessParanoiaSelection = (cycle, done) => {
      try {
        const choices = typeof game.getEndlessParanoiaChoices === 'function' ? game.getEndlessParanoiaChoices() : [];
        if (choices && choices[0] && typeof game.applyEndlessParanoiaChoice === 'function') {
          game.applyEndlessParanoiaChoice(choices[0], cycle);
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
    game.showEndlessParanoiaSelection = originalParanoiaPicker;

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

  const bossThreeActProbe = await page.evaluate(() => {
    if (!window.game || !game.battle || typeof game.startDebugBattle !== 'function') {
      return { ok: false, reason: 'no_debug_battle' };
    }

    game.startDebugBattle(1, 'boss');
    const battle = game.battle;
    const boss = Array.isArray(battle?.enemies) ? battle.enemies.find((enemy) => enemy && enemy.isBoss) : null;
    if (!boss || !boss.bossActState || typeof battle.checkPhaseChange !== 'function') {
      return { ok: false, reason: 'no_boss_three_act_state' };
    }

    const snapshot = () => {
      if (typeof battle.updateBattleUI === 'function') battle.updateBattleUI();
      const panel = document.getElementById('boss-act-panel');
      const style = panel ? getComputedStyle(panel) : null;
      return {
        visible: !!panel && !!style && style.display !== 'none' && style.visibility !== 'hidden',
        title: panel ? (panel.querySelector('.boss-act-title')?.textContent || '').trim() : '',
        subtitle: panel ? (panel.querySelector('.boss-act-subtitle')?.textContent || '').trim() : '',
        chips: Array.from(panel?.querySelectorAll('.boss-act-chip') || []).map((chip) => (chip.textContent || '').trim()),
        counterChips: Array.from(panel?.querySelectorAll('.boss-act-counter-chip') || []).map((chip) => (chip.textContent || '').trim()),
        activeChip: (panel?.querySelector('.boss-act-chip.active')?.textContent || '').trim(),
        failLine: (panel?.querySelector('.boss-act-line.fail .value')?.textContent || '').trim()
      };
    };

    const initial = snapshot();
    const actTwoThreshold = Number(boss.bossActState.acts?.[1]?.threshold) || 0.68;
    boss.currentHp = Math.max(1, Math.floor(boss.maxHp * Math.max(0.05, actTwoThreshold - 0.05)));
    battle.checkPhaseChange(boss);
    const actTwo = snapshot();

    const actThreeThreshold = Number(boss.bossActState.acts?.[2]?.threshold) || 0.34;
    boss.currentHp = Math.max(1, Math.floor(boss.maxHp * Math.max(0.03, actThreeThreshold - 0.05)));
    battle.checkPhaseChange(boss);
    const actThree = snapshot();

    return {
      ok:
        initial.visible &&
        initial.chips.length === 3 &&
        initial.counterChips.length >= 2 &&
        /宣告/.test(initial.subtitle || '') &&
        actTwo.counterChips.length >= 2 &&
        /对抗/.test(actTwo.subtitle || '') &&
        actThree.counterChips.length >= 2 &&
        /逆转/.test(actThree.subtitle || '') &&
        /失败|节奏|拖延/.test(actThree.failLine || ''),
      bossId: boss.id || '',
      initial,
      actTwo,
      actThree,
      sealedCards: Array.isArray(game.player?.hand) ? game.player.hand.filter((card) => card && card.__bossSealed).length : 0
    };
  });
  add(
    'boss three-act panel renders and updates across declaration confrontation reversal',
    !!bossThreeActProbe &&
      !!bossThreeActProbe.ok &&
      Number(bossThreeActProbe.sealedCards || 0) >= 0 &&
      /三幕式/.test(bossThreeActProbe.initial?.title || ''),
    JSON.stringify(bossThreeActProbe || null)
  );

  await safeScreenshot(page, path.join(outDir, 'boss-three-act-panel.png'));

  const battleOverlayLayoutProbe = await page.evaluate(() => {
    if (!window.game || !game.battle || typeof game.startDebugBattle !== 'function') {
      return { ok: false, reason: 'no_debug_battle' };
    }
    game.startDebugBattle(1, 'boss');
    const battle = game.battle;
    if (battle) {
      battle.tacticalAdvisorCollapsed = false;
      if (typeof battle.updateBattleUI === 'function') battle.updateBattleUI();
    }

    const bossPanel = document.getElementById('boss-act-panel');
    const commandPanel = document.getElementById('battle-command-panel');
    const missionPanel = document.getElementById('legacy-mission-tracker');
    const enemyArea = document.querySelector('.enemy-area');
    const enemyIntent = document.querySelector('.enemy .enemy-intent');
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

    const rectToObj = (rect) => rect ? ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, centerX: rect.left + rect.width / 2 }) : null;

    const bossRect = bossPanel ? rectToObj(bossPanel.getBoundingClientRect()) : null;
    const commandRect = commandPanel ? rectToObj(commandPanel.getBoundingClientRect()) : null;
    const missionRect = missionPanel ? rectToObj(missionPanel.getBoundingClientRect()) : null;
    const enemyRect = enemyArea ? rectToObj(enemyArea.getBoundingClientRect()) : null;
    const enemyIntentRect = enemyIntent ? rectToObj(enemyIntent.getBoundingClientRect()) : null;

    const commandOnLeftRail = !!commandRect && commandRect.centerX < viewportWidth * 0.34;
    const missionOnRightRail = !!missionRect && missionRect.centerX > viewportWidth * 0.72;
    const bossCentered = !!bossRect && Math.abs(bossRect.centerX - viewportWidth / 2) < viewportWidth * 0.12;
    const commandAvoidsCore = !!commandRect && (!enemyRect || commandRect.right <= enemyRect.left + enemyRect.width * 0.38);
    const commandCompact = !!commandRect
      && commandRect.width <= Math.min(320, viewportWidth * 0.23)
      && commandRect.height <= Math.min(420, viewportHeight * 0.5);
    const bossCompact = !!bossRect && bossRect.width < viewportWidth * 0.72;
    const bossAvoidsEnemyIntent = !bossRect || !enemyIntentRect
      || bossRect.right <= enemyIntentRect.left - 12
      || bossRect.bottom <= enemyIntentRect.top - 10
      || bossRect.left >= enemyIntentRect.right + 12;

    return {
      ok: commandOnLeftRail && missionOnRightRail && bossCentered && commandAvoidsCore && commandCompact && bossCompact && bossAvoidsEnemyIntent,
      viewportWidth,
      viewportHeight,
      commandOnLeftRail,
      missionOnRightRail,
      bossCentered,
      commandAvoidsCore,
      commandCompact,
      bossCompact,
      bossAvoidsEnemyIntent,
      bossRect,
      commandRect,
      missionRect,
      enemyRect,
      enemyIntentRect
    };
  });
  add(
    'battle overlay layout keeps boss info centered without covering enemy intent lane',
    !!battleOverlayLayoutProbe && !!battleOverlayLayoutProbe.ok,
    JSON.stringify(battleOverlayLayoutProbe || null)
  );

  const advisorHierarchyProbe = await page.evaluate(async () => {
    if (!window.game || typeof game.startDebugBattle !== 'function') return { ok: false, reason: 'no_debug_battle' };
    game.startDebugBattle(1, 'boss');
    const battle = game.battle;
    if (!battle || typeof battle.updateBattleUI !== 'function') return { ok: false, reason: 'no_battle' };
    battle.tacticalAdvisorCollapsed = true;
    battle.tacticalAdvisorHoverExpanded = false;
    battle.tacticalAdvisorHoverLocked = true;
    battle.updateBattleUI();
    const panel = document.getElementById('battle-command-panel');
    const advisor = document.getElementById('battle-tactical-advisor');
    const collapsedHeight = advisor ? advisor.getBoundingClientRect().height : 0;
    if (advisor) advisor.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const hoverHeight = advisor ? advisor.getBoundingClientRect().height : 0;
    battle.handleTacticalAdvisorHotkey('h');
    await new Promise((resolve) => setTimeout(resolve, 260));
    const advisorAfterHotkey = document.getElementById('battle-tactical-advisor');
    const bodyAfterHotkey = advisorAfterHotkey ? advisorAfterHotkey.querySelector('.battle-advisor-body') : null;
    const hotkeyHeight = advisorAfterHotkey ? advisorAfterHotkey.getBoundingClientRect().height : 0;
    const hotkeyMaxHeight = advisorAfterHotkey ? parseFloat(advisorAfterHotkey.style.maxHeight || getComputedStyle(advisorAfterHotkey).maxHeight || '0') : 0;
    return {
      ok: !!panel
        && !!advisor
        && !!advisorAfterHotkey
        && hoverHeight <= collapsedHeight + 1
        && (
          hotkeyHeight >= collapsedHeight + 20
          || (hotkeyMaxHeight >= collapsedHeight + 20 && !!bodyAfterHotkey && bodyAfterHotkey.hidden === false)
        ),
      collapsedHeight,
      hoverHeight,
      hotkeyHeight,
      hotkeyMaxHeight,
      collapsed: battle.tacticalAdvisorCollapsed,
      hoverExpanded: battle.tacticalAdvisorHoverExpanded,
    };
  });
  add(
    'battle advisor stays collapsed until explicit reopen and H hotkey restores it on desktop',
    !!advisorHierarchyProbe && !!advisorHierarchyProbe.ok,
    JSON.stringify(advisorHierarchyProbe || null)
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
  const failed = findings.filter((item) => !item.pass);
  if (failed.length > 0 || consoleErrors.length > 0) {
    failed.forEach((item) => console.error(`FAIL: ${item.name}\n${item.detail}`));
    process.exitCode = 1;
  }

  await browser.close();
})();
