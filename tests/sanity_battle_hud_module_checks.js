const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(function run() {
  const hud = require(path.resolve(__dirname, '../js/ui/battle-hud.js'));

  assert(hud && typeof hud === 'object', 'battle hud helper should export an object');
  assert(typeof hud.escapeHtml === 'function', 'escapeHtml should exist');
  assert(typeof hud.shouldUseCompactBattleHud === 'function', 'shouldUseCompactBattleHud should exist');
  assert(typeof hud.clampFloatingPanelPosition === 'function', 'clampFloatingPanelPosition should exist');
  assert(typeof hud.truncateBattleLabel === 'function', 'truncateBattleLabel should exist');
  assert(typeof hud.resolveEnemyIntentDisplay === 'function', 'resolveEnemyIntentDisplay should exist');
  assert(typeof hud.buildEnemyIntentMarkup === 'function', 'buildEnemyIntentMarkup should exist');
  assert(typeof hud.buildEnemyMetaStripMarkup === 'function', 'buildEnemyMetaStripMarkup should exist');
  assert(typeof hud.buildBossActPanelMarkup === 'function', 'buildBossActPanelMarkup should exist');
  assert(typeof hud.buildBattleSystemsStripMarkup === 'function', 'buildBattleSystemsStripMarkup should exist');
  assert(typeof hud.buildBattleSystemsDetailMarkup === 'function', 'buildBattleSystemsDetailMarkup should exist');
  assert(typeof hud.buildBattleCommandPanelMarkup === 'function', 'buildBattleCommandPanelMarkup should exist');

  assert(hud.escapeHtml('<boss>') === '&lt;boss&gt;', 'escapeHtml should encode angle brackets');
  assert(hud.shouldUseCompactBattleHud(768) === true, '768px should use compact HUD');
  assert(hud.shouldUseCompactBattleHud(769) === false, '769px should not use compact HUD');
  assert(hud.truncateBattleLabel('焰脉诊断终式', 4) === '焰脉诊断…', 'truncateBattleLabel should clamp long labels');

  const iconOnlyIntent = hud.resolveEnemyIntentDisplay({ type: 'attack', intent: '⚔️' });
  assert(iconOnlyIntent.icon === '⚔️', 'icon-only intent should preserve icon');
  assert(iconOnlyIntent.hasLabel === false, 'icon-only intent should not create a text label');

  const labeledIntent = hud.resolveEnemyIntentDisplay({ type: 'debuff', intent: '🕯️诵调' });
  assert(labeledIntent.icon === '🕯️', 'labeled intent should split the leading icon');
  assert(labeledIntent.label === '诵调', 'labeled intent should keep short text label');

  const textOnlyIntent = hud.resolveEnemyIntentDisplay({ type: 'attack', intent: '残影绝学' });
  assert(textOnlyIntent.icon === '⚔️', 'text-only intent should receive a fallback icon');
  assert(textOnlyIntent.label === '残影绝学', 'text-only intent should remain readable');

  const intentMarkup = hud.buildEnemyIntentMarkup({
    type: 'debuff',
    icon: labeledIntent.icon,
    label: labeledIntent.label,
    value: '3',
    tooltipSafe: '意图：施加减益',
    ariaLabel: '敌方意图：诵调，数值 3',
    isGuardBreaker: true
  });
  assert(/enemy-intent-label/.test(intentMarkup), 'enemy intent markup should include label container');
  assert(/诵调/.test(intentMarkup), 'enemy intent markup should include split text label');
  assert(/intent-value/.test(intentMarkup), 'enemy intent markup should include value pill');
  assert(/破盾/.test(intentMarkup), 'enemy intent markup should include breaker chip');

  const metaMarkup = hud.buildEnemyMetaStripMarkup({
    stripClass: 'enemy-meta-strip enemy-meta-primary',
    items: [
      { className: 'enemy-role-tag role-hexer', text: '控场型' },
      { className: 'enemy-counter-tag', text: '反制·净化优先', title: '你手里有净化资源，可优先解控。' }
    ]
  });
  assert(/enemy-meta-primary/.test(metaMarkup), 'enemy meta strip should include custom strip class');
  assert(/控场型/.test(metaMarkup), 'enemy meta strip should render chip text');
  assert(/反制·净化优先/.test(metaMarkup), 'enemy meta strip should render multiple chips');

  const clamped = hud.clampFloatingPanelPosition({
    left: -40,
    top: 999,
    width: 320,
    height: 160,
    viewportWidth: 390,
    viewportHeight: 844,
    gutter: 8
  });
  assert(clamped.left === 8, `left should clamp to gutter, got ${clamped.left}`);
  assert(clamped.top <= 844 - 160 - 8, 'top should clamp inside viewport');

  const bossMarkup = hud.buildBossActPanelMarkup({
    bossName: '天道镜魔',
    hpPercent: 52,
    currentActName: '逆转',
    currentIndex: 1,
    acts: [{ name: '宣告' }, { name: '逆转' }, { name: '终局' }],
    counterChips: [{ id: 'burst', label: '抓爆发', tip: '立即抢线' }],
    lines: [
      { id: 'signal', label: '明确信号', value: '即将复制上回合终末牌。' }
    ]
  });
  assert(/天道镜魔 · 三幕式/.test(bossMarkup), 'boss markup should include title');
  assert(/抓爆发/.test(bossMarkup), 'boss markup should include counter chips');

  const panelMarkup = hud.buildBattleCommandPanelMarkup({
    points: 8,
    maxPoints: 12,
    progress: 66,
    commands: [
      {
        id: 'resonance_matrix_order',
        icon: '✦',
        name: '命环矩阵',
        desc: '重排节奏',
        cost: 6,
        statusText: '可发动',
        classes: 'battle-command-btn ready',
        disabled: false
      }
    ],
    advisorExpanded: true,
    advisor: {
      recommendation: { label: '守势', desc: '先稳后打' },
      readiness: '当前可用指令 1 项。',
      threatChips: [{ id: 'defend', label: '高爆发压制', tip: '先留护盾。' }],
      statusIslands: [{ tone: 'guard', label: '护盾', value: '12' }],
      cardPlanSteps: [{ index: 0, name: '玄甲诀', reason: '先挂盾' }],
      spirit: {
        icon: '🐉',
        name: '霜螭',
        chargeText: '5/5',
        ready: true,
        summary: '先控场再稳住护盾。',
        passiveLabel: '霜鳞凝息',
        passiveDesc: '战斗开始时，全体敌人获得 1 层虚弱。',
        activeLabel: '寒潮护道',
        activeDesc: '蓄能满后：全体敌人虚弱 +2，自身获得 8 护盾。',
        progress: 100
      }
    },
    systems: {
      stripItems: [
        { id: 'destiny', label: '命格', icon: '✦', value: '先天卦印', meta: '第二阶 · 构筑修正', detail: '首击获得额外爆发。', tone: 'fate' },
        { id: 'vows', label: '誓约', icon: '✧', value: '破界誓', meta: '1/2 条进行中', detail: '以风险换高压收益。', tone: 'oath' },
        { id: 'spirit', label: '灵契', icon: '🐉', value: '霜螭', meta: '5/5 · 可释放', detail: '被动护道稳定控场。', tone: 'spirit' },
        { id: 'chapter', label: '天象 / 地脉', icon: '☯️', value: '万象同判', meta: '终章合式·5轴', detail: '阵面：终律衡阵。', tone: 'chapter' },
        { id: 'laws', label: '法则编织', icon: '⌘', value: '雷火崩坏', meta: '2 法则在位 · 回响之环', detail: '共鸣已成形。', tone: 'resonance' },
        { id: 'treasures', label: '法宝套装', icon: '🛡️', value: '2 组激活', meta: '玄甲2 / 星衡2', detail: '套装共鸣已进入战斗。', tone: 'treasure' }
      ]
    }
  });
  assert(/战场指令/.test(panelMarkup), 'panel markup should include panel title');
  assert(/战术助手/.test(panelMarkup), 'panel markup should include advisor title');
  assert(/玄甲诀/.test(panelMarkup), 'panel markup should include card plan step');
  assert(/battle-command-spirit-chip/.test(panelMarkup), 'panel markup should include spirit header chip');
  assert(/霜螭/.test(panelMarkup), 'panel markup should include spirit name');
  assert(/灵契护道/.test(panelMarkup), 'panel markup should include spirit panel title');
  assert(/释放 寒潮护道/.test(panelMarkup), 'panel markup should include ready spirit activation button');
  assert(/battle-system-strip/.test(panelMarkup), 'panel markup should include persistent system strip');
  assert(/中层系统状态/.test(panelMarkup), 'panel markup should include detailed system state block');
  assert(/万象同判/.test(panelMarkup), 'panel markup should include chapter omen label');
  assert(/雷火崩坏/.test(panelMarkup), 'panel markup should include law weave summary');
  assert(/2 组激活/.test(panelMarkup), 'panel markup should include treasure set summary');

  console.log('Battle HUD module checks passed.');
})();
