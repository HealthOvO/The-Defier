const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function loadFile(ctx, filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, ctx, { filename: filePath });
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const ctx = vm.createContext({
    console,
    window: {},
    Math,
    JSON,
    Date,
    setTimeout,
    clearTimeout,
    document: {
      querySelector: () => null,
      getElementById: () => null,
      querySelectorAll: () => []
    },
    Utils: {
      showBattleLog: () => {},
      sleep: () => Promise.resolve(),
      addShakeEffect: () => {},
      showFloatingNumber: () => {},
      createFloatingText: () => {}
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/core/battle.js'));
  const Battle = vm.runInContext('Battle', ctx);
  assert(typeof Battle === 'function', 'Battle class should be defined');

  const game = {
    player: {
      realm: 12,
      hand: [],
      currentHp: 80,
      currentEnergy: 3,
      milkCandy: 3,
      buffs: {},
      activeResonances: [],
      collectedLaws: []
    }
  };
  const battle = new Battle(game);

  battle.enemies = [
    {
      id: 'advisor_guardian_probe',
      name: '护阵试作体',
      currentHp: 120,
      maxHp: 120,
      block: 18,
      buffs: {},
      patterns: [
        { type: 'defend', value: 12, intent: '🛡️固阵' },
        { type: 'attack', value: 8, intent: '⚔️反击' }
      ]
    }
  ];
  battle.player.hand = [
    {
      id: 'advisor_strike',
      name: '裂光斩',
      type: 'attack',
      cost: 1,
      damage: 8,
      effects: []
    },
    {
      id: 'advisor_break',
      name: '穿甲震击',
      type: 'attack',
      cost: 2,
      damage: 6,
      effects: [{ type: 'removeBlock', value: 10 }]
    },
    {
      id: 'advisor_guard',
      name: '归元护体',
      type: 'defense',
      cost: 1,
      block: 8,
      effects: [{ type: 'block', value: 8 }]
    }
  ];

  const breakProfile = battle.resolveCounterplayThreatProfile();
  const breakRecommendation = { id: 'break', label: '破阵回路', shortLabel: '破阵' };

  // 1) 破阵态势下，优先推荐破盾卡
  const breakPlan = battle.resolveBattleTacticalCardPlan(breakProfile, breakRecommendation);
  assert(/手牌执行/.test(breakPlan), `plan should contain tactical prefix, got: ${breakPlan}`);
  assert(/穿甲震击/.test(breakPlan), `break plan should prefer break card, got: ${breakPlan}`);
  const breakMeta = battle.resolveBattleTacticalCardPlanMeta(breakProfile, breakRecommendation);
  assert(!!breakMeta && typeof breakMeta.text === 'string', 'plan meta should include text');
  assert(Array.isArray(breakMeta.steps) && breakMeta.steps.length >= 1, 'plan meta should include at least one suggested step');
  assert(
    Number(breakMeta.steps[0]?.index) === 1,
    `first suggested step should point to break card index 1, got ${breakMeta.steps[0]?.index}`
  );

  // 2) 无可打牌时应给出攒能过渡建议
  battle.player.currentEnergy = 0;
  battle.player.milkCandy = 0;
  const starvedPlan = battle.resolveBattleTacticalCardPlan(breakProfile, { id: 'guard' });
  assert(
    /攒灵力|过渡/.test(starvedPlan),
    `starved plan should suggest resource recovery, got: ${starvedPlan}`
  );

  // 3) 执行快照应包含 cardPlanHint 字段，并记录建议步骤 key
  battle.player.currentEnergy = 3;
  battle.player.milkCandy = 3;
  battle.resetTurnAdvisorTelemetry();
  const snapshot = battle.resolveBattleTacticalAdvisorSnapshot(
    {
      enabled: true,
      points: 6,
      maxPoints: 12,
      commands: []
    },
    breakProfile
  );
  assert(snapshot && typeof snapshot === 'object', 'snapshot should be object');
  assert(
    typeof snapshot.cardPlanHint === 'string' && snapshot.cardPlanHint.length > 0,
    'snapshot should expose tactical card plan hint'
  );
  assert(
    snapshot.tempoRail && Array.isArray(snapshot.tempoRail.segments) && snapshot.tempoRail.segments.length === 4,
    'snapshot should expose tempo rail with four tactical lanes'
  );
  assert(
    Array.isArray(snapshot.statusIslands) && snapshot.statusIslands.length >= 3,
    'snapshot should expose battle status islands'
  );
  assert(
    snapshot.executionChain && Number(snapshot.executionChain.index) === 1 && /穿甲震击/.test(snapshot.executionChain.title || ''),
    `execution chain should default to suggested break card, got ${JSON.stringify(snapshot.executionChain)}`
  );
  const telemetryAfterSnapshot = battle.ensureTurnAdvisorTelemetry();
  assert(
    Array.isArray(telemetryAfterSnapshot.suggestedStepKeys) && telemetryAfterSnapshot.suggestedStepKeys.length >= 1,
    'snapshot should persist suggested step keys for review'
  );

  // 3b) 悬停其他手牌时，执行链应切换到对应卡牌
  battle.hoveredBattleCardIndex = 2;
  const hoverSnapshot = battle.resolveBattleTacticalAdvisorSnapshot(
    {
      enabled: true,
      points: 6,
      maxPoints: 12,
      commands: []
    },
    breakProfile
  );
  assert(
    hoverSnapshot.executionChain && Number(hoverSnapshot.executionChain.index) === 2 && /归元护体/.test(hoverSnapshot.executionChain.title || ''),
    `hover execution chain should follow hovered card, got ${JSON.stringify(hoverSnapshot.executionChain)}`
  );
  battle.hoveredBattleCardIndex = -1;

  // 4) 本回合未按建议出牌时，应给出对应复盘文案
  battle.resetTurnAdvisorTelemetry();
  battle.resolveBattleTacticalAdvisorSnapshot(
    {
      enabled: true,
      points: 6,
      maxPoints: 12,
      commands: []
    },
    breakProfile
  );
  battle.recordTurnAdvisorCardUsage(battle.player.hand[2], breakProfile);
  const missedBreakReview = battle.resolveTurnAdvisorReviewSummary(breakProfile, breakRecommendation);
  assert(
    /错过破盾窗口/.test(missedBreakReview),
    `review should mention missed break window, got: ${missedBreakReview}`
  );

  // 5) 若已按建议执行关键牌，则不再输出复盘提示
  battle.resetTurnAdvisorTelemetry();
  battle.resolveBattleTacticalAdvisorSnapshot(
    {
      enabled: true,
      points: 6,
      maxPoints: 12,
      commands: []
    },
    breakProfile
  );
  battle.recordTurnAdvisorCardUsage(battle.player.hand[1], breakProfile);
  const followedReview = battle.resolveTurnAdvisorReviewSummary(breakProfile, breakRecommendation);
  assert(followedReview === '', `review should be empty after following suggestion, got: ${followedReview}`);

  console.log('Battle advisor plan checks passed.');
})();
