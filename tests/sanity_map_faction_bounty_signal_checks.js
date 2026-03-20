const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function createElement(id) {
  return {
    id,
    style: { display: '' },
    dataset: {},
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const code = fs.readFileSync(path.join(root, 'js/core/map.js'), 'utf8');

  const elements = {
    'map-situation-overview': createElement('map-situation-overview'),
    'map-chapter-risk-card': createElement('map-chapter-risk-card')
  };

  const ctx = vm.createContext({
    console,
    Math,
    JSON,
    Date,
    window: {},
    document: {
      getElementById: (id) => elements[id] || null,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    Utils: { showBattleLog: () => {} },
    inferDeckArchetype: () => 'entropy'
  });
  ctx.window = ctx;
  ctx.global = ctx;

  vm.runInContext(code, ctx, { filename: 'map.js' });
  const GameMap = vm.runInContext('GameMap', ctx);

  const expeditionPayload = {
    activeBounties: [{ id: 'omen_route', name: '观测先机', progressText: '0/1', completed: false }],
    recentFactionLogs: [
      {
        id: 'log_1',
        factionId: 'star_seers',
        factionName: '观星会',
        delta: 1,
        stanceAfter: 2,
        stanceLabel: '结盟',
        reason: '你在「观星台」线上推进了一步，顺着他们认可的章法前进。',
        line: '观星会 ↑1 · 你在「观星台」线上推进了一步，顺着他们认可的章法前进。'
      }
    ],
    bountyConflictWarnings: [
      {
        id: 'warn_1',
        bountyId: 'omen_route',
        bountyName: '观测先机',
        severity: 'high',
        label: '势力牵制',
        detail: '灰烬盟 已在 观星台 线加压，这条赏单更容易被拖慢。',
        suggestion: '尽量在资源充足时推进，避免被压制节奏反咬。',
        line: '观测先机 · 势力牵制：灰烬盟 已在 观星台 线加压，这条赏单更容易被拖慢。'
      }
    ],
    nemesisForecast: {
      status: 'allied',
      statusLabel: '投靠势力',
      pressureIndex: 73,
      pressureTier: 'high',
      pressureLabel: '高压',
      windowLabel: '下个 观星台 / 敌阵 节点',
      line: '灰烬猎誓 · 下个 观星台 / 敌阵 节点 · 灰烬盟 已在 观星台 线加压。',
      counterplay: '先拆敌意路线或改走低压线。'
    }
  };

  const game = {
    player: {
      realm: 3,
      maxHp: 120,
      currentHp: 84,
      deck: [{ id: 'probe_card', archetypeHint: 'entropy' }],
      fateRing: { path: 'convergence' }
    },
    getExpeditionPayload: () => expeditionPayload
  };

  const map = new GameMap(game);
  map.nodes = [
    [{ type: 'observatory', accessible: true, completed: false }],
    [{ type: 'enemy', accessible: true, completed: false }]
  ];

  const chapter = {
    icon: '☯️',
    name: '断星云海',
    fullName: '第4章·断星云海',
    focusTags: ['法则', '观测'],
    dangerProfile: {
      index: 79,
      tierId: 'high',
      tierLabel: '高压',
      summary: '关键节点会把中盘压力继续抬高。',
      counterplay: '优先确保防御链不断。'
    },
    nemesis: {
      status: 'hunting',
      counterplay: '保留控制链打断追猎连携。'
    }
  };

  const overviewModel = map.getMapSituationOverviewModel(chapter);
  assert(
    /观星会/.test(overviewModel.recentFactionSignal || '') && /观星台/.test(overviewModel.recentFactionSignal || ''),
    `overview model should surface recent faction signal, got ${overviewModel.recentFactionSignal}`
  );
  assert(
    /灰烬猎誓/.test(overviewModel.nemesisForecast || '') && /高压/.test(overviewModel.nemesisForecast || ''),
    `overview model should surface nemesis forecast signal, got ${overviewModel.nemesisForecast}`
  );

  map.updateChapterRiskCardPanel(chapter, ['观星台异象']);
  const riskText = elements['map-chapter-risk-card'].innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  assert(/悬赏冲突/.test(riskText), `risk card should render bounty-conflict label, got ${riskText}`);
  assert(/追猎预判/.test(riskText), `risk card should render nemesis-forecast label, got ${riskText}`);
  assert(/观测先机/.test(riskText), `risk card should include bounty name in conflict line, got ${riskText}`);
  assert(/势力牵制/.test(riskText), `risk card should include conflict type, got ${riskText}`);
  assert(/灰烬猎誓/.test(riskText), `risk card should include nemesis forecast line, got ${riskText}`);

  assert(
    map.resolveRecentFactionSignal({ recentFactionLogs: [] }) === '暂无新波动，当前势力还在试探你的路线。',
    'recent faction signal should fall back to explicit empty-state text'
  );
  assert(
    map.resolveBountyConflictSignal({ activeBounties: [] }) === '尚未承接悬赏，暂无冲突压力。',
    'bounty conflict signal should fall back to explicit empty-state text'
  );
  assert(
    map.resolveNemesisForecastSignal({}) === '当前仇敌追猎线尚未形成明确压制窗口。',
    'nemesis forecast signal should fall back to explicit empty-state text'
  );

  console.log('Map faction & bounty signal checks passed.');
})();
