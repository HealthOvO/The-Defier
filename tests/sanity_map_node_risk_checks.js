const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const code = fs.readFileSync(path.join(root, 'js/core/map.js'), 'utf8');

  const ctx = vm.createContext({
    console,
    Math,
    JSON,
    Date,
    window: {},
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    Utils: {
      showBattleLog: () => {}
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  vm.runInContext(code, ctx, { filename: 'map.js' });
  const GameMap = vm.runInContext('GameMap', ctx);

  const chapter = {
    dangerProfile: {
      index: 84,
      tierId: 'high',
      tierLabel: '高压',
      dominantRisk: 'tax',
      dominantLabel: '资源税负',
      counterplay: '优先保留灵石与低费周转，避免高费链路断在中盘。'
    },
    nemesis: {
      status: 'hunting',
      name: '灰烬猎誓',
      triggerNodeTypes: ['forbidden_altar', 'trial'],
      counterplay: '在其现身节点保留打断手段与一次爆发窗口。'
    }
  };

  const game = {
    player: {
      realm: 6,
      currentHp: 74,
      maxHp: 120
    },
    getExpeditionPayload: () => ({
      activeBounties: [
        { id: 'bounty_1', name: '裂誓追缴', progressText: '1/3' }
      ],
      factions: [
        { id: 'star', stance: 2 },
        { id: 'caravan', stance: 2 },
        { id: 'ash', stance: -2 },
        { id: 'hunt', stance: -2 }
      ]
    })
  };

  const map = new GameMap(game);
  map.nodes = [
    [
      { id: 'altar', row: 0, type: 'forbidden_altar', icon: '🩸', accessible: true, completed: false, polluted: true },
      { id: 'rest', row: 0, type: 'rest', icon: '🏕️', accessible: true, completed: false }
    ],
    [
      { id: 'trial', row: 1, type: 'trial', icon: '⚖️', accessible: true, completed: false },
      { id: 'shop', row: 1, type: 'shop', icon: '🏪', accessible: true, completed: false }
    ],
    [
      { id: 'boss', row: 2, type: 'boss', icon: '👹', accessible: false, completed: false }
    ]
  ];

  const altarRisk = map.resolveNodeRiskProfile(map.nodes[0][0], chapter);
  const restRisk = map.resolveNodeRiskProfile(map.nodes[0][1], chapter);
  const trialRisk = map.resolveNodeRiskProfile(map.nodes[1][0], chapter);
  const forecast = map.getAccessibleNodeRiskForecast(chapter);
  const tooltipHtml = map.buildNodeTooltipHtml(map.nodes[0][0], chapter).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  assert(altarRisk && altarRisk.index >= 88, `polluted altar should be very dangerous, got ${altarRisk ? altarRisk.index : 'null'}`);
  assert(['high', 'extreme'].includes(altarRisk.tierId), `polluted altar should be high/extreme tier, got ${altarRisk.tierId}`);
  assert(/打断手段/.test(altarRisk.counterplay), `altar counterplay should include nemesis-specific guidance, got ${altarRisk.counterplay}`);
  assert(/裂誓追缴/.test(altarRisk.reserveGuidance), `altar reserve guidance should mention active bounty pacing, got ${altarRisk.reserveGuidance}`);
  assert(restRisk && restRisk.index < altarRisk.index, `rest node should stay safer than altar, got rest=${restRisk?.index} altar=${altarRisk?.index}`);
  assert(trialRisk && trialRisk.index > restRisk.index, `trial should be riskier than rest, got trial=${trialRisk?.index} rest=${restRisk?.index}`);
  assert(forecast.topRisk && forecast.topRisk.type === 'forbidden_altar', `forecast should prioritize altar risk, got ${forecast.topRisk ? forecast.topRisk.type : 'null'}`);
  assert(/前路主险/.test(tooltipHtml), `tooltip should include frontier-risk line, got ${tooltipHtml}`);
  assert(/对策/.test(tooltipHtml), `tooltip should include counterplay line, got ${tooltipHtml}`);
  assert(/预留/.test(tooltipHtml), `tooltip should include reserve line, got ${tooltipHtml}`);

  console.log('Map node risk checks passed.');
})();
