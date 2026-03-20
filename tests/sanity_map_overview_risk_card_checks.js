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
    title: '',
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const code = fs.readFileSync(path.join(root, 'js/core/map.js'), 'utf8');

  const elements = {
    'map-situation-overview': createElement('map-situation-overview'),
    'map-chapter-risk-card': createElement('map-chapter-risk-card'),
    'map-chapter-brief': createElement('map-chapter-brief')
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
    Utils: {
      showBattleLog: () => {}
    },
    inferDeckArchetype: (deck = []) => {
      if (!Array.isArray(deck) || deck.length === 0) return null;
      return deck[0]?.archetypeHint || null;
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  vm.runInContext(code, ctx, { filename: 'map.js' });
  const GameMap = vm.runInContext('GameMap', ctx);

  const game = {
    player: {
      realm: 4,
      gold: 118,
      currentHp: 77,
      maxHp: 120,
      deck: [{ id: 'probe_card', archetypeHint: 'entropy' }],
      fateRing: { path: 'convergence', exp: 0 }
    },
    getChapterDisplaySnapshot: () => ({
      icon: '☯️',
      name: '断星云海',
      fullName: '第4章·断星云海',
      stageLabel: '裂界 4-2',
      stageDesc: '潮汐与雷暴交错，节点压强抬升。',
      routePrompt: '优先踩功能节点，降低突发损耗。',
      bossPrompt: '主宰将触发高压连击。',
      focusTags: ['反击', '连锁', '护盾'],
      skyOmen: { name: '离火潮', desc: '敌方首轮更激进。' },
      leyline: { name: '逆潮脉', desc: '治疗效率下降。' },
      dangerProfile: {
        index: 82,
        tierId: 'high',
        tierLabel: '高压',
        summary: '敌方中后段会叠加多段打击。',
        counterplay: '先稳护盾与过牌，再找窗口反打。'
      },
      nemesis: {
        status: 'hunting',
        statusLabel: '追猎中',
        name: '灰烬猎誓',
        pressureIndex: 71,
        counterplay: '保留控制链打断其连携。',
        clueRevealed: true,
        clueLine: '事件节点有更高概率触发猎誓追击。'
      }
    }),
    getRealmBossInfo: () => ({
      bossName: '寂雷古尊'
    }),
    getExpeditionPayload: () => ({
      selectedBranchName: '熔光断层',
      bountyDraft: [
        { id: 'bounty_a', active: true },
        { id: 'bounty_b', active: false }
      ],
      activeBounties: [
        { id: 'bounty_a', name: '裂隙扫荡', progressText: '1/3', completed: false }
      ],
      factions: [
        { id: 'f1', name: '星占会', stance: 2 },
        { id: 'f2', name: '灰烬盟', stance: -2 },
        { id: 'f3', name: '商旅联会', stance: 1 }
      ],
      recentFactionLogs: [
        {
          id: 'log_1',
          factionId: 'f1',
          factionName: '星占会',
          delta: 1,
          stanceAfter: 2,
          stanceLabel: '结盟',
          reason: '你在「观星台」线上推进了一步，顺着他们认可的章法前进。',
          line: '星占会 ↑1 · 你在「观星台」线上推进了一步，顺着他们认可的章法前进。'
        }
      ],
      recentNemesisLogs: [
        {
          id: 'nemesis_log_1',
          status: 'allied',
          statusLabel: '投靠势力',
          severity: 'high',
          title: '灰烬猎誓 · 投靠势力',
          detail: '灰烬盟 开始为其提供掩护，后续合围节点会更危险。',
          line: '灰烬猎誓 · 投靠势力 · 灰烬盟 开始为其提供掩护，后续合围节点会更危险。'
        }
      ],
      bountyConflictWarnings: [
        {
          id: 'warn_1',
          bountyId: 'bounty_a',
          bountyName: '裂隙扫荡',
          severity: 'high',
          label: '势力牵制',
          detail: '灰烬盟 已在 敌阵 线加压，这条赏单更容易被拖慢。',
          line: '裂隙扫荡 · 势力牵制：灰烬盟 已在 敌阵 线加压，这条赏单更容易被拖慢。'
        }
      ],
      nemesisForecast: {
        status: 'allied',
        statusLabel: '投靠势力',
        pressureIndex: 77,
        pressureTier: 'high',
        pressureLabel: '高压',
        windowLabel: '下个 敌阵 / 事件 节点',
        line: '灰烬猎誓 · 下个 敌阵 / 事件 节点 · 灰烬盟 已在 敌阵 线加压。',
        counterplay: '先拆敌意路线或改走低压线。'
      }
    }),
    getStrategicEngineeringSnapshot: () => ({
      summary: '🔭 观星工程 II阶 · 观星、事件与裂隙联动抬升，常规战斗略降。 · 距 III阶还需 2 次观星台',
      posture: '主轴 观星工程 II阶 · 副轴 禁术工程 I阶',
      focusTrack: {
        trackId: 'observatory',
        name: '观星工程',
        icon: '🔭',
        tier: 2,
        tierLabel: 'II阶',
        progress: 2,
        nextTarget: 4,
        nextTierLabel: 'III阶',
        remaining: 2,
        nodeLabel: '观星台',
        effectSummary: '观星、事件与裂隙联动抬升，常规战斗略降。'
      },
      activeTracks: [
        {
          trackId: 'observatory',
          name: '观星工程',
          icon: '🔭',
          tier: 2,
          tierLabel: 'II阶',
          progress: 2,
          nextTarget: 4,
          nextTierLabel: 'III阶',
          remaining: 2,
          nodeLabel: '观星台',
          effectSummary: '观星、事件与裂隙联动抬升，常规战斗略降。'
        },
        {
          trackId: 'forbidden_altar',
          name: '禁术工程',
          icon: '🩸',
          tier: 1,
          tierLabel: 'I阶',
          progress: 1,
          nextTarget: 2,
          nextTierLabel: 'II阶',
          remaining: 1,
          nodeLabel: '禁术坛',
          effectSummary: '下重更偏向禁术与试炼节点，收益与代价会同步放大。'
        }
      ],
      allTracks: [
        {
          trackId: 'observatory',
          name: '观星工程',
          icon: '🔭',
          tier: 2,
          tierLabel: 'II阶',
          progress: 2,
          nextTarget: 4,
          nextTierLabel: 'III阶',
          remaining: 2,
          nodeLabel: '观星台',
          effectSummary: '观星、事件与裂隙联动抬升，常规战斗略降。'
        },
        {
          trackId: 'forbidden_altar',
          name: '禁术工程',
          icon: '🩸',
          tier: 1,
          tierLabel: 'I阶',
          progress: 1,
          nextTarget: 2,
          nextTierLabel: 'II阶',
          remaining: 1,
          nodeLabel: '禁术坛',
          effectSummary: '下重更偏向禁术与试炼节点，收益与代价会同步放大。'
        },
        {
          trackId: 'memory_rift',
          name: '裂隙工程',
          icon: '🪞',
          tier: 0,
          tierLabel: '未成形',
          progress: 0,
          nextTarget: 1,
          nextTierLabel: 'I阶',
          remaining: 1,
          nodeLabel: '记忆裂隙',
          effectSummary: '尚未形成稳定裂隙回响。'
        },
        {
          trackId: 'spirit_grotto',
          name: '灵契工程',
          icon: '🪷',
          tier: 0,
          tierLabel: '未成形',
          progress: 0,
          nextTarget: 1,
          nextTierLabel: 'I阶',
          remaining: 1,
          nodeLabel: '灵契窟',
          effectSummary: '尚未形成稳定护道链。'
        }
      ]
    })
  };

  const map = new GameMap(game);
  map.nodes = [
    [{ type: 'observatory', accessible: true, completed: false }],
    [{ type: 'trial', accessible: true, completed: false }],
    [{ type: 'enemy', accessible: true, completed: false }]
  ];

  map.updateChapterBriefPanel();

  const overview = elements['map-situation-overview'];
  const risk = elements['map-chapter-risk-card'];
  const brief = elements['map-chapter-brief'];
  const overviewText = overview.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const riskText = risk.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const tooltipText = map.buildNodeTooltipHtml(map.nodes[0][0], game.getChapterDisplaySnapshot()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  assert(overview.style.display === 'block', 'overview strip should be visible when chapter snapshot exists');
  assert(risk.style.display === 'block', 'risk card should be visible when chapter snapshot exists');
  assert(brief.style.display === 'block', 'chapter brief should remain visible');
  assert(overview.dataset.riskTier === 'high', `overview risk tier should be high, got ${overview.dataset.riskTier}`);
  assert(risk.dataset.riskTier === 'high', `risk card tier should be high, got ${risk.dataset.riskTier}`);
  assert(/核心标签/.test(overviewText), `overview should include core-tag label, got: ${overviewText}`);
  assert(/风险等级/.test(overviewText), `overview should include risk-level label, got: ${overviewText}`);
  assert(/前路主险/.test(overviewText), `overview should include frontier-risk label, got: ${overviewText}`);
  assert(/工程推进/.test(overviewText), `overview should include engineering-focus label, got: ${overviewText}`);
  assert(/悬赏进度/.test(overviewText), `overview should include bounty-progress label, got: ${overviewText}`);
  assert(/势力倾向/.test(overviewText), `overview should include faction-tendency label, got: ${overviewText}`);
  assert(/最近势力变化/.test(overviewText), `overview should include recent faction signal label, got: ${overviewText}`);
  assert(/追猎预判/.test(overviewText), `overview should include nemesis-forecast label, got: ${overviewText}`);
  assert(/观星工程/.test(overviewText) && /II阶/.test(overviewText), `overview should include concrete engineering content, got: ${overviewText}`);
  assert(/星占会/.test(overviewText) && /观星台/.test(overviewText), `overview should include concrete faction signal content, got: ${overviewText}`);
  assert(/灰烬猎誓/.test(overviewText) && /高压/.test(overviewText), `overview should include concrete nemesis forecast content, got: ${overviewText}`);
  assert(/高危机制/.test(riskText), `risk card should include high-risk mechanism, got: ${riskText}`);
  assert(/节点预警/.test(riskText), `risk card should include frontier node warning, got: ${riskText}`);
  assert(/悬赏冲突/.test(riskText), `risk card should include bounty-conflict label, got: ${riskText}`);
  assert(/追猎预判/.test(riskText), `risk card should include nemesis forecast label, got: ${riskText}`);
  assert(/工程态势/.test(riskText), `risk card should include engineering-status label, got: ${riskText}`);
  assert(/主轴 观星工程 II阶/.test(riskText), `risk card should include engineering posture content, got: ${riskText}`);
  assert(/裂隙扫荡/.test(riskText) && /势力牵制/.test(riskText), `risk card should include concrete bounty conflict content, got: ${riskText}`);
  assert(/灰烬猎誓/.test(riskText) && /敌阵/.test(riskText), `risk card should include concrete nemesis forecast content, got: ${riskText}`);
  assert(/防御策略/.test(riskText), `risk card should include defense strategy, got: ${riskText}`);
  assert(/资源预留/.test(riskText), `risk card should include reserve guidance, got: ${riskText}`);
  assert(/工程主轴/.test(brief.innerHTML), `chapter brief should expose engineering chip, got: ${brief.innerHTML}`);
  assert(/工程收益/.test(tooltipText) && /观星工程/.test(tooltipText), `node tooltip should expose engineering gain hint, got: ${tooltipText}`);
  assert(!/>\s*<\/span>/.test(overview.innerHTML), 'overview strip should not render empty value spans');
  assert(!/>\s*<\/span>/.test(risk.innerHTML), 'risk card should not render empty value spans');

  game.getChapterDisplaySnapshot = () => null;
  map.updateChapterBriefPanel();
  assert(overview.style.display === 'none', 'overview strip should hide when chapter snapshot is absent');
  assert(risk.style.display === 'none', 'risk card should hide when chapter snapshot is absent');
  assert(overview.innerHTML === '', 'overview strip html should clear when hidden');
  assert(risk.innerHTML === '', 'risk card html should clear when hidden');

  console.log('Map overview & risk card checks passed.');
})();
