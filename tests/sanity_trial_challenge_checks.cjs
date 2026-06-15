const fs = require('fs');

const originalReadFileSync = fs.readFileSync;
fs.readFileSync = function(p, enc) {
    let c = originalReadFileSync(p, enc);
    if (enc === 'utf8' && p.endsWith('.js')) {
        c = c.replace(/^export\s+(const|let|var|class|function|default)/gm, '$1');
        c = c.replace(/^export\s+\{.*?\};?/gm, '');
        c = c.replace(/^import\s+.*?;/gm, '');
    }
    return c;
};

const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function loadFile(ctx, filePath) {
  let code = fs.readFileSync(filePath, 'utf8');
  code = code.replace(/^export\s+(const|let|var|class|function|default)/gm, '$1');
  code = code.replace(/^export\s+\{.*?\};?/gm, '');
  code = code.replace(/^import\s+.*?;/gm, '');
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
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    setTimeout: (fn) => {
      if (typeof fn === 'function') fn();
      return 0;
    },
    clearTimeout: () => {},
    Utils: {
      showBattleLog: () => {},
      shuffle: (arr) => arr.slice(),
      random: (min) => min
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
    LAWS: {
      mockLaw: { id: 'mockLaw', name: '试炼法则' }
    },
    getRandomCard: () => ({ id: 'trial_rare', name: '试炼稀有牌', rarity: 'rare', type: 'skill', cost: 1 }),
    createEliteEnemy: () => ({
      id: 'trial_elite',
      name: '试炼傀儡',
      hp: 100,
      maxHp: 100,
      ringExp: 20,
      block: 0,
      patterns: [{ type: 'attack', value: 10 }]
    }),
    getRandomEnemy: () => ({
      id: 'trial_enemy',
      name: '试炼散兵',
      hp: 80,
      maxHp: 80,
      ringExp: 16,
      block: 0,
      patterns: [{ type: 'attack', value: 8 }]
    })
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/managers/EventManager.js'));
    loadFile(ctx, path.join(root, 'js/managers/MetaProgressionManager.js'));
    loadFile(ctx, path.join(root, 'js/managers/EndlessManager.js'));
    loadFile(ctx, path.join(root, 'js/managers/RunManager.js'));
    loadFile(ctx, path.join(root, 'js/managers/SeasonBoardManager.js'));
    loadFile(ctx, path.join(root, 'js/managers/SanctumAgendaManager.js'));
    loadFile(ctx, path.join(root, 'js/managers/ShopManager.js'));
    loadFile(ctx, path.join(root, 'js/managers/SaveManager.js'));
    loadFile(ctx, path.join(root, 'js/core/player.js'));
    loadFile(ctx, path.join(root, 'js/core/events.js'));
    loadFile(ctx, path.join(root, 'js/core/achievements.js'));
    loadFile(ctx, path.join(root, 'js/core/fateRing.js'));
    loadFile(ctx, path.join(root, 'js/game.js'));
  loadFile(ctx, path.join(root, 'js/views/EventView.js'));
  loadFile(ctx, path.join(root, 'js/views/RewardView.js'));
  loadFile(ctx, path.join(root, 'js/core/map.js'));

  const Game = vm.runInContext('Game', ctx);
  const GameMap = vm.runInContext('GameMap', ctx);

  // 1) 试炼目录应提供多种自选挑战，并包含组合型条件
  {
    const host = { player: { realm: 6 } };
    host.getTrialChallengeCatalog = Game.prototype.getTrialChallengeCatalog;
    const catalog = host.getTrialChallengeCatalog();
    assert(Array.isArray(catalog) && catalog.length >= 3, `expected >=3 trial challenges, got ${catalog && catalog.length}`);
    assert(catalog.some((item) => item && item.id === 'speedKill'), 'trial catalog should include speedKill');
    assert(catalog.some((item) => item && item.id === 'noDamage'), 'trial catalog should include noDamage');
    assert(catalog.some((item) => item && item.conditions && item.conditions.noDamage && item.conditions.maxTurns > 0), 'trial catalog should include combined condition challenge');
    const cardLimit = catalog.find((item) => item && item.id === 'cardLimit');
    assert(cardLimit, 'trial catalog should include cardLimit');
    assert(cardLimit.conditions && cardLimit.conditions.maxCardsPlayed === 6, `cardLimit should require at most 6 cards played, got ${JSON.stringify(cardLimit.conditions)}`);
    const treasureHunt = catalog.find((item) => item && item.id === 'treasureHunt');
    assert(treasureHunt, 'trial catalog should include treasureHunt');
    assert(treasureHunt.reward === 'treasure', `treasureHunt should grant treasure reward, got ${treasureHunt.reward}`);
    assert(treasureHunt.conditions && treasureHunt.conditions.maxTurns === 6 && treasureHunt.conditions.maxCardsPlayed === 8, `treasureHunt should combine turn and card pressure, got ${JSON.stringify(treasureHunt.conditions)}`);
  }

  // 2) 挑战状态应统一写入 activeTrial / trialData / trialMode，并可正确判定成功失败
  {
    const host = {
      player: { realm: 6 },
      activeTrial: null,
      trialData: null,
      trialMode: null,
      battle: { turnNumber: 4, playerTookDamage: false }
    };
    host.armTrialChallenge = Game.prototype.armTrialChallenge;
    host.evaluateActiveTrialSuccess = Game.prototype.evaluateActiveTrialSuccess;

    const armed = host.armTrialChallenge({
      id: 'oathMirror',
      name: '双誓并压',
      conditions: { maxTurns: 5, noDamage: true, maxCardsPlayed: 6 },
      rewardMultiplier: 1.72,
      reward: 'law'
    });
    assert(armed && host.activeTrial === 'oathMirror', `expected activeTrial oathMirror, got ${host.activeTrial}`);
    assert(host.trialData && host.trialData.conditions.noDamage === true, 'trialData should persist noDamage condition');
    assert(host.trialData.conditions.maxCardsPlayed === 6, 'trialData should persist maxCardsPlayed condition');
    assert(host.trialMode && host.trialMode.type === 'oathMirror', 'trialMode should stay in sync for compatibility');
    assert(host.evaluateActiveTrialSuccess() === true, 'trial should succeed when both conditions hold');
    host.battle.playerTookDamage = true;
    assert(host.evaluateActiveTrialSuccess() === false, 'trial should fail when noDamage condition breaks');
    host.battle.playerTookDamage = false;
    host.battle.cardsPlayedThisBattle = 7;
    assert(host.evaluateActiveTrialSuccess() === false, 'trial should fail when maxCardsPlayed condition breaks');
    host.battle.cardsPlayedThisBattle = 6;
    assert(host.evaluateActiveTrialSuccess() === true, 'trial should succeed at the exact maxCardsPlayed limit');
  }

  // 3) 试炼奖励 helper 应能发放额外灵石与稀有卡奖励
  {
    const host = {
      player: {
        gold: 0,
        characterId: 'linFeng',
        deck: [],
        addCardToDeck(card) {
          this.deck.push(card);
        },
        collectLaw: () => true
      },
      achievementSystem: {
        count: 0,
        updateStat() {
          this.count += 1;
        }
      },
      trialData: {
        reward: 'rare_card',
        bonusGold: 40
      }
    };
    host.grantTrialChallengeReward = Game.prototype.grantTrialChallengeReward;
    const reward = host.grantTrialChallengeReward();
    assert(host.player.gold === 40, `trial reward should add bonus gold, got ${host.player.gold}`);
    assert(host.player.deck.length === 1, `trial reward should add rare card, got ${host.player.deck.length}`);
    assert(/额外灵石/.test(reward.rewardText) && /稀有卡/.test(reward.rewardText), `unexpected reward text: ${reward.rewardText}`);
  }

  // 3.5) 试炼奖励 helper 应能发放随机法宝，并在法宝耗尽时给出补偿
  {
    const host = {
      _treasurePool: [{ id: 'trial_treasure', name: '试炼古印' }],
      player: {
        gold: 0,
        collectedTreasures: [],
        addTreasure(id) {
          const treasure = host._treasurePool.find(item => item.id === id);
          if (!treasure) return false;
          this.collectedTreasures.push({ ...treasure });
          return true;
        }
      },
      trialData: {
        reward: 'treasure',
        bonusGold: 35
      },
      getWeightedRandomTreasure() {
        return this._treasurePool[0] || null;
      }
    };
    host.grantTrialChallengeReward = Game.prototype.grantTrialChallengeReward;
    const reward = host.grantTrialChallengeReward();
    assert(host.player.gold === 35, `treasure trial reward should keep bonus gold, got ${host.player.gold}`);
    assert(host.player.collectedTreasures.length === 1, `treasure trial reward should add one treasure, got ${host.player.collectedTreasures.length}`);
    assert(/法宝/.test(reward.rewardText) && /试炼古印/.test(reward.rewardText), `unexpected treasure reward text: ${reward.rewardText}`);

    host._treasurePool = [];
    host.trialData = { reward: 'treasure', bonusGold: 0 };
    const fallback = host.grantTrialChallengeReward();
    assert(host.player.gold === 155, `empty treasure pool should convert to exact compensation gold, got ${host.player.gold}`);
    assert(/法宝已尽/.test(fallback.rewardText), `empty treasure pool should explain compensation, got ${fallback.rewardText}`);
  }

  // 3.6) 法宝 helper 返回重复法宝时应按 addTreasure 失败语义转补偿，不能误报获得法宝或二次加钱
  {
    const host = {
      _treasurePool: [{ id: 'trial_treasure', name: '试炼古印' }],
      player: {
        gold: 0,
        collectedTreasures: [{ id: 'trial_treasure', name: '试炼古印' }],
        hasTreasure(id) {
          return this.collectedTreasures.some(item => item.id === id);
        },
        addTreasure() {
          this.gold += 50;
          return false;
        }
      },
      trialData: {
        reward: 'treasure',
        bonusGold: 0
      },
      getWeightedRandomTreasure() {
        return this._treasurePool[0] || null;
      }
    };
    host.grantTrialChallengeReward = Game.prototype.grantTrialChallengeReward;
    const duplicate = host.grantTrialChallengeReward();
    assert(host.player.collectedTreasures.length === 1, `duplicate treasure should not add another copy, got ${host.player.collectedTreasures.length}`);
    assert(host.player.gold === 50, `duplicate treasure should keep addTreasure compensation only once, got ${host.player.gold}`);
    assert(!/获得法宝/.test(duplicate.rewardText), `duplicate treasure should not report gained treasure: ${duplicate.rewardText}`);
    assert(/转化/.test(duplicate.rewardText), `duplicate treasure should explain conversion: ${duplicate.rewardText}`);
  }

  // 4) 地图试炼节点应先请求挑战选择；传入挑战后应按词缀强化敌人并开战
  {
    const state = {
      selectionShown: false,
      startedBattle: null,
      player: { realm: 6 },
      showTrialChallengeSelection() {
        this.selectionShown = true;
      },
      armTrialChallenge(config) {
        this.armedTrial = config;
        return config;
      },
      startBattle(enemies, node) {
        this.startedBattle = { enemies, node };
      }
    };
    const map = new GameMap(state);

    map.startTrialNode({ id: 7001, row: 3, type: 'trial' });
    assert(state.selectionShown === true, 'trial node should open challenge selection before battle');

    map.startTrialNode({ id: 7002, row: 3, type: 'trial' }, {
      id: 'speedKill',
      name: '逐光试斩',
      conditions: { maxTurns: 4 },
      enemyHpMul: 1.2,
      enemyAtkMul: 1.1,
      enemyOpeningBlock: 8,
      enemyDebuff: { type: 'weak', value: 1 }
    });

    assert(state.startedBattle && Array.isArray(state.startedBattle.enemies), 'trial node should start battle after picking challenge');
    const enemy = state.startedBattle.enemies[0];
    assert(enemy.name.includes('试炼'), `trial enemy should be marked, got ${enemy.name}`);
    assert(enemy.hp >= 160, `trial enemy hp should be scaled by base and challenge multipliers, got ${enemy.hp}`);
    assert(enemy.block >= 8, `trial challenge should grant opening block, got ${enemy.block}`);
    assert(enemy.patterns[0] && enemy.patterns[0].type === 'debuff', `trial challenge should inject debuff pattern, got ${JSON.stringify(enemy.patterns[0])}`);
    assert(enemy.patterns.some((pattern) => pattern.type === 'attack' && pattern.value >= 13), 'trial challenge should scale attack pattern damage');
  }

  console.log('Trial challenge checks passed.');
})();
