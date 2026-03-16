const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
    SKILLS: {},
    STARTER_DECK: ['strike', 'strike', 'defend', 'defend', 'quickDraw', 'spiritBoost'],
    Utils: {
      shuffle: (arr) => arr.slice(),
      showBattleLog: () => {},
      deepClone: (value) => JSON.parse(JSON.stringify(value))
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  [
    'js/data/characters.js',
    'js/data/cards.js',
    'js/data/fate_ring.js',
    'js/data/run_destinies.js',
    'js/data/run_paths.js',
    'js/data/run_vows.js',
    'js/data/spirit_companions.js',
    'js/data/treasures.js',
    'js/data/enemies.js',
    'js/data/boss_mechanics.js',
    'js/core/fateRing.js',
    'js/core/player.js',
    'js/game.js',
    'js/core/battle.js'
  ].forEach((file) => loadFile(ctx, path.join(root, file)));

  const Game = vm.runInContext('Game', ctx);
  const Player = vm.runInContext('Player', ctx);
  const Battle = vm.runInContext('Battle', ctx);

  const game = Object.create(Game.prototype);
  const player = new Player('yanHan');
  player.game = game;
  player.setRunPath('insight');
  player.setRunDestiny('preceptSeal', 1);
  player.setRunVows([{ id: 'realmBreak', tier: 1 }, { id: 'heavenlyGaze', tier: 1 }]);
  player.setSpiritCompanion('artifactSoul', 1);
  player.realm = 18;
  player.fateRing.getSocketedLaws = () => ['law_a', 'law_b', 'law_c'];
  player.equippedTreasures = [
    { id: 'xj_1', name: '玄甲一式', setTag: 'xuanjia' },
    { id: 'xj_2', name: '玄甲二式', setTag: 'xuanjia' }
  ];
  player.treasures = player.equippedTreasures;
  game.player = player;
  game.currentBattleNode = { id: 'realm18-boss', type: 'boss' };

  const chapter = game.getChapterDisplaySnapshot(18);
  const heavenly = ctx.ENEMIES.heavenlyDao;
  const mechanic = ctx.BOSS_MECHANICS.heavenlyDao;

  const resolved = game.resolveRunPathBossMatchup(player.getRunPathMeta(), {
    enemy: heavenly,
    enemyId: heavenly.id,
    mechanic,
    mechanicType: mechanic.mechanics.type,
    memory: { key: 'echo_last_card', name: '天道映照' },
    memoryKey: 'echo_last_card',
    chapter
  });

  assert(resolved && resolved.fitLabel === '终章控尾', `boss-specific fit label should remain, got ${JSON.stringify(resolved)}`);
  assert(resolved && /终焉命庭/.test(resolved.chapterCue || ''), `chapter cue should expose final court, got ${JSON.stringify(resolved)}`);
  assert(resolved && /终焉命庭|终章/.test(resolved.chapterFocus || ''), `chapter focus should preserve chapter-specific guidance, got ${JSON.stringify(resolved)}`);
  assert(resolved && /多轴|法则|法宝/.test(resolved.chapterCounter || ''), `chapter counter should preserve environment solve, got ${JSON.stringify(resolved)}`);

  const battle = new Battle(game);
  battle.enemies = [JSON.parse(JSON.stringify(heavenly))];
  battle.enemies[0].currentHp = battle.enemies[0].maxHp;
  battle.initializeChapterBattlefieldRules();
  const state = battle.createBossThreeActState(battle.enemies[0]);

  assert(state && state.runPathCounterplay && /终焉命庭/.test(state.runPathCounterplay.chapterCue || ''), `boss three-act state should carry chapter cue, got ${JSON.stringify(state && state.runPathCounterplay)}`);
  assert(state && state.runPathCounterplay && /章节补题/.test([
    state.runPathCounterplay.chapterFocus ? `章节补题：${state.runPathCounterplay.chapterFocus}` : '',
    state.runPathCounterplay.chapterCounter ? `场域拆法：${state.runPathCounterplay.chapterCounter}` : ''
  ].join(' ')), `boss three-act state should preserve chapter environment guidance, got ${JSON.stringify(state && state.runPathCounterplay)}`);

  const chips = battle.resolveBossActCounterChips({
    state,
    act: state.acts[0]
  });
  assert(chips.some((chip) => /命途/.test(chip.label) && /终焉命庭|章节补题/.test(chip.tip || '')), `counter chips should include chapter-environment run path guidance, got ${JSON.stringify(chips)}`);

  console.log('Run path environment matchup checks passed.');
})();
