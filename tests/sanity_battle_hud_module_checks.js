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
  assert(typeof hud.buildBossActPanelMarkup === 'function', 'buildBossActPanelMarkup should exist');
  assert(typeof hud.buildBattleCommandPanelMarkup === 'function', 'buildBattleCommandPanelMarkup should exist');

  assert(hud.escapeHtml('<boss>') === '&lt;boss&gt;', 'escapeHtml should encode angle brackets');
  assert(hud.shouldUseCompactBattleHud(768) === true, '768px should use compact HUD');
  assert(hud.shouldUseCompactBattleHud(769) === false, '769px should not use compact HUD');

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
      cardPlanSteps: [{ index: 0, name: '玄甲诀', reason: '先挂盾' }]
    }
  });
  assert(/战场指令/.test(panelMarkup), 'panel markup should include panel title');
  assert(/战术助手/.test(panelMarkup), 'panel markup should include advisor title');
  assert(/玄甲诀/.test(panelMarkup), 'panel markup should include card plan step');

  console.log('Battle HUD module checks passed.');
})();
