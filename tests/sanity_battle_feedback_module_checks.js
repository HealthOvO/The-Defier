const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(function run() {
  const feedback = require(path.resolve(__dirname, '../js/ui/battle-feedback.js'));

  assert(feedback && typeof feedback === 'object', 'battle feedback helper should export an object');
  assert(typeof feedback.escapeHtml === 'function', 'escapeHtml should exist');
  assert(typeof feedback.buildBattleLogPanelShellMarkup === 'function', 'buildBattleLogPanelShellMarkup should exist');
  assert(typeof feedback.buildBattleLogListMarkup === 'function', 'buildBattleLogListMarkup should exist');
  assert(typeof feedback.buildRewardBattleMetaMarkup === 'function', 'buildRewardBattleMetaMarkup should exist');

  const shellMarkup = feedback.buildBattleLogPanelShellMarkup('system');
  assert(/战斗记录/.test(shellMarkup), 'shell markup should include panel title');
  assert(/data-filter="reward"/.test(shellMarkup), 'shell markup should include reward filter');
  assert(/data-filter="system"/.test(shellMarkup), 'shell markup should include system filter');
  assert(/aria-label="关闭战斗记录"/.test(shellMarkup), 'shell markup should include close aria label');

  const listMarkup = feedback.buildBattleLogListMarkup([
    { ts: '2026-03-13T00:00:00.000Z', category: 'warning', message: '<危险>' },
    { ts: '2026-03-13T00:00:01.000Z', category: 'system', message: '新手提示：先展开助手。' }
  ], 'all');
  assert(/&lt;危险&gt;/.test(listMarkup), 'log list should escape message html');
  assert(/log-warning/.test(listMarkup), 'log list should include category class');
  assert(/新手提示/.test(listMarkup), 'log list should include normal text');

  const rewardMarkup = feedback.buildRewardBattleMetaMarkup({
    encounter: {
      themeName: '<反制晶格>',
      tierStage: 2,
      goldBonus: 18,
      ringExpBonus: 9
    },
    squad: {
      squadName: '咒织链阵',
      goldBonus: 14,
      ringExpBonus: 11,
      synergyThemeName: '轮段·反制晶格'
    }
  });
  assert(/本场战利来源/.test(rewardMarkup), 'reward markup should include title');
  assert(/&lt;反制晶格&gt;/.test(rewardMarkup), 'reward markup should escape encounter theme');
  assert(/轮段协同/.test(rewardMarkup), 'reward markup should include synergy chip');

  console.log('Battle feedback module checks passed.');
})();
