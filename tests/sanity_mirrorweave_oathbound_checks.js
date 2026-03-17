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

(async function run() {
  const root = path.resolve(__dirname, '..');
  let emittedCardPayload = null;
  const mathObj = Object.create(Math);
  mathObj.random = () => 0;

  const ctx = vm.createContext({
    console,
    window: {},
    document: {
      querySelector: () => null,
      getElementById: () => null,
      querySelectorAll: () => []
    },
    CHARACTERS: {
      linFeng: {
        stats: { maxHp: 90, gold: 100, energy: 3 },
        relic: null,
        deck: []
      }
    },
    SKILLS: {},
    STARTER_DECK: [],
    Utils: {
      shuffle: (arr) => arr.slice(),
      showBattleLog: () => {},
      random: (min) => min,
      sleep: () => Promise.resolve(),
      addShakeEffect: () => {},
      showFloatingNumber: () => {},
      createFloatingText: () => {},
      addFlashEffect: () => {},
      getCanonicalElement: (element) => String(element || 'none').toLowerCase(),
      getElementIcon: () => ''
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
    Math: mathObj,
    JSON,
    Date
  });

  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/data/cards.js'));
  loadFile(ctx, path.join(root, 'js/core/player.js'));
  loadFile(ctx, path.join(root, 'js/core/battle.js'));

  const Player = vm.runInContext('Player', ctx);
  const Battle = vm.runInContext('Battle', ctx);
  const CARDS = vm.runInContext('CARDS', ctx);
  const ARCHETYPE_PACKS = vm.runInContext('ARCHETYPE_PACKS', ctx);

  // 1) 新流派应可识别，且每回合首次触发标记可重置
  {
    const mirrorPlayer = new Player();
    mirrorPlayer.realm = 2;
    mirrorPlayer.fateRing = { ...(mirrorPlayer.fateRing || {}), path: '' };
    mirrorPlayer.deck = ARCHETYPE_PACKS.mirrorweave.cards.slice(0, 10).map((id) => ({ ...CARDS[id] }));
    mirrorPlayer.resolveArchetypeResonance();
    assert(
      mirrorPlayer.archetypeResonance && mirrorPlayer.archetypeResonance.id === 'mirrorweave',
      'mirrorweave resonance should resolve from core deck'
    );
    mirrorPlayer.archetypeResonance.procUsedThisTurn = true;
    mirrorPlayer.archetypeResonance.mirrorEchoProcUsedThisTurn = true;
    mirrorPlayer.startTurn();
    assert(mirrorPlayer.archetypeResonance.procUsedThisTurn === false, 'mirrorweave procUsedThisTurn should reset on startTurn');
    assert(
      mirrorPlayer.archetypeResonance.mirrorEchoProcUsedThisTurn === false,
      'mirrorweave mirrorEchoProcUsedThisTurn should reset on startTurn'
    );
  }

  {
    const oathPlayer = new Player();
    oathPlayer.realm = 2;
    oathPlayer.fateRing = { ...(oathPlayer.fateRing || {}), path: '' };
    oathPlayer.deck = ARCHETYPE_PACKS.oathbound.cards.slice(0, 10).map((id) => ({ ...CARDS[id] }));
    oathPlayer.resolveArchetypeResonance();
    assert(
      oathPlayer.archetypeResonance && oathPlayer.archetypeResonance.id === 'oathbound',
      'oathbound resonance should resolve from core deck'
    );
    oathPlayer.archetypeResonance.oathDebtGainProcUsedThisTurn = true;
    oathPlayer.archetypeResonance.oathDebtConsumeProcUsedThisTurn = true;
    oathPlayer.startTurn();
    assert(
      oathPlayer.archetypeResonance.oathDebtGainProcUsedThisTurn === false,
      'oathbound oathDebtGainProcUsedThisTurn should reset on startTurn'
    );
    assert(
      oathPlayer.archetypeResonance.oathDebtConsumeProcUsedThisTurn === false,
      'oathbound oathDebtConsumeProcUsedThisTurn should reset on startTurn'
    );
  }

  // 2) processEffect 应可结算 echoLastPlayedCard / consumeOathDebt，且支持嵌套结果
  {
    const player = new Player();
    const game = { player };
    const battle = new Battle(game);
    game.battle = battle;
    player.game = game;

    const target = {
      id: 'dummy_echo',
      name: '镜像木桩',
      maxHp: 40,
      currentHp: 40,
      block: 0,
      buffs: {}
    };
    battle.enemies = [target];

    await battle.processEffect({
      type: 'echoLastPlayedCard',
      triggered: true,
      cardName: '回响刃',
      results: [
        { type: 'damage', value: 7 }
      ]
    }, target, 0);
    assert(target.currentHp === 33, `echoLastPlayedCard nested damage should apply, got hp=${target.currentHp}`);

    await battle.processEffect({
      type: 'consumeOathDebt',
      triggered: true,
      consumed: 2,
      results: [
        { type: 'damage', value: 5 }
      ]
    }, target, 0);
    assert(target.currentHp === 28, `consumeOathDebt nested damage should apply, got hp=${target.currentHp}`);
  }

  // 2.1) player.executeEffect 应正确处理镜渊倍率/重复与誓债按层伤害
  {
    const mirrorPlayer = new Player();
    mirrorPlayer.realm = 2;
    mirrorPlayer.fateRing = { ...(mirrorPlayer.fateRing || {}), path: '' };
    mirrorPlayer.deck = ARCHETYPE_PACKS.mirrorweave.cards.slice(0, 10).map((id) => ({ ...CARDS[id] }));
    mirrorPlayer.resolveArchetypeResonance();
    mirrorPlayer.turnNumber = 1;
    mirrorPlayer.drawPile = [
      { ...CARDS.strike, instanceId: 'mirror_echo_draw_1' },
      { ...CARDS.defend, instanceId: 'mirror_echo_draw_2' }
    ];
    mirrorPlayer.hand = [];
    mirrorPlayer.block = 0;
    mirrorPlayer.rememberPlayedCardForEcho({
      id: 'mirror_source',
      name: '镜源试作',
      type: 'attack',
      effects: [
        { type: 'damage', value: 10, target: 'enemy' },
        { type: 'draw', value: 1, target: 'self' }
      ]
    });

    const mirrorGame = { player: mirrorPlayer };
    const mirrorBattle = new Battle(mirrorGame);
    mirrorGame.battle = mirrorBattle;
    mirrorPlayer.game = mirrorGame;
    const mirrorTarget = {
      id: 'mirror_scale_dummy',
      name: '镜渊标靶',
      maxHp: 40,
      currentHp: 40,
      block: 0,
      buffs: {}
    };
    mirrorBattle.enemies = [mirrorTarget];

    const echoResult = mirrorPlayer.executeEffect(
      { type: 'echoLastPlayedCard', value: 0.6, repeatCount: 2, target: 'enemy' },
      mirrorTarget,
      {}
    );
    const echoDamages = echoResult.results.filter((entry) => entry && entry.type === 'damage');
    assert(echoResult.echoed === true, 'mirrorweave echo should trigger with a remembered source');
    assert(echoDamages.length === 2, `mirrorweave echo should replay damage twice, got ${echoDamages.length}`);
    assert(echoDamages.every((entry) => entry.value === 6), `mirrorweave echo should scale 10 damage to 6, got ${echoDamages.map((entry) => entry.value).join(',')}`);
    assert(mirrorPlayer.hand.length === 2, `mirrorweave echo should replay draw twice, got hand=${mirrorPlayer.hand.length}`);
    assert(mirrorPlayer.block >= 4, `mirrorweave first echo proc should grant >=4 block, got ${mirrorPlayer.block}`);
    await mirrorBattle.processEffect(echoResult, mirrorTarget, 0);
    assert(mirrorTarget.currentHp === 28, `mirrorweave echo should deal 12 total damage, got hp=${mirrorTarget.currentHp}`);
  }

  {
    const oathPlayer = new Player();
    oathPlayer.realm = 2;
    oathPlayer.fateRing = { ...(oathPlayer.fateRing || {}), path: '' };
    oathPlayer.deck = ARCHETYPE_PACKS.oathbound.cards.slice(0, 10).map((id) => ({ ...CARDS[id] }));
    oathPlayer.resolveArchetypeResonance();
    oathPlayer.turnNumber = 1;
    oathPlayer.buffs = { oathDebt: 3 };
    oathPlayer.drawPile = [
      { ...CARDS.strike, instanceId: 'oath_consume_draw_1' }
    ];
    oathPlayer.hand = [];

    const oathGame = { player: oathPlayer };
    const oathBattle = new Battle(oathGame);
    oathGame.battle = oathBattle;
    oathPlayer.game = oathGame;
    const oathTarget = {
      id: 'oath_scale_dummy',
      name: '誓罚标靶',
      maxHp: 50,
      currentHp: 50,
      block: 0,
      buffs: {}
    };
    oathBattle.enemies = [oathTarget];

    const consumeResult = oathPlayer.executeEffect(
      { type: 'consumeOathDebt', value: 4, target: 'enemy' },
      oathTarget,
      {}
    );
    assert(consumeResult.consumed === 3, `consumeOathDebt should consume all 3 debt stacks, got ${consumeResult.consumed}`);
    assert(consumeResult.value === 12, `consumeOathDebt should deal 12 total damage, got ${consumeResult.value}`);
    assert(Array.isArray(consumeResult.results) && consumeResult.results.length === 1, 'consumeOathDebt should emit one nested damage result');
    assert(consumeResult.results[0].type === 'damage' && consumeResult.results[0].value === 12, 'consumeOathDebt nested result should be 12 damage');
    assert(!('oathDebt' in oathPlayer.buffs), 'consumeOathDebt should clear spent oathDebt stacks');
    assert(oathPlayer.hand.length === 1, `oathbound first consume proc should draw 1, got hand=${oathPlayer.hand.length}`);
    await oathBattle.processEffect(consumeResult, oathTarget, 0);
    assert(oathTarget.currentHp === 38, `oathbound consume should apply 12 damage, got hp=${oathTarget.currentHp}`);
  }

  // 3) 出牌成功后应记录快照并同步给 player 侧 echo 记忆钩子
  {
    const player = new Player();
    const game = { player };
    const battle = new Battle(game);
    game.battle = battle;
    player.game = game;
    battle.currentTurn = 'player';
    battle.battleEnded = false;
    battle.isProcessingCard = false;
    battle.cardsPlayedThisTurn = 0;
    player.collectedLaws = [];
    player.buffs = player.buffs || {};

    const rememberCalls = [];
    player.rememberPlayedCardForEcho = (current, previous) => {
      rememberCalls.push({ current, previous });
    };
    player.playCard = () => [];

    const card = {
      id: 'mirror_test_card',
      name: '镜渊试作',
      type: 'skill',
      cost: 1,
      baseCost: 1,
      keywords: ['mirror'],
      effects: [{ type: 'draw', value: 1 }]
    };
    player.hand = [card];
    battle.enemies = [{
      id: 'dummy_snapshot',
      name: '快照木桩',
      maxHp: 20,
      currentHp: 20,
      block: 0,
      buffs: {}
    }];
    battle.on('cardPlayed', (payload) => {
      emittedCardPayload = payload;
    });

    await battle.playCardOnTarget(0, 0);
    assert(battle.lastPlayerCardSnapshot && battle.lastPlayerCardSnapshot.id === 'mirror_test_card', 'battle should store lastPlayerCardSnapshot');
    assert(rememberCalls.length === 1, 'player.rememberPlayedCardForEcho should be called once');
    assert(rememberCalls[0].current && rememberCalls[0].current.id === 'mirror_test_card', 'echo memory current snapshot should match played card');
    assert(emittedCardPayload && emittedCardPayload.currentCardSnapshot && emittedCardPayload.currentCardSnapshot.id === 'mirror_test_card', 'cardPlayed payload should include currentCardSnapshot');
  }

  console.log('Mirrorweave & oathbound sanity checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
