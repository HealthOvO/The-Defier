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
  const storage = new Map();
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
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key)
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    Utils: {
      shuffle: (arr) => arr.slice(),
      showBattleLog: () => {}
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  [
    'js/data/characters.js',
    'js/data/run_destinies.js',
    'js/data/run_paths.js',
    'js/data/spirit_companions.js',
    'js/data/run_vows.js',
    'js/data/narrative_templates.js',
    'js/game.js',
    'js/core/collection_hub.js'
  ].forEach((file) => loadFile(ctx, path.join(root, file)));

  const Game = vm.runInContext('Game', ctx);

  const game = Object.create(Game.prototype);
  game.player = {
    characterId: 'linFeng',
    realm: 6
  };
  game.unlockedRealms = [1, 2, 3, 4, 5, 6];
  game.achievementSystem = { stats: { realmCleared: 6 } };

  const insightBase = game.getRunPathMetaById('insight');
  const insightPivot = {
    ...insightBase,
    mutation: {
      mutationId: 'pivot',
      id: 'pivot',
      name: '借势落子',
      branchLabel: '转修'
    }
  };
  const bulwarkBase = game.getRunPathMetaById('bulwark');

  game.recordRunPathBossSample(insightBase, { id: 'danZun', name: '丹尊', icon: '🗿', realm: 6 }, {
    characterId: 'linFeng',
    turns: 4,
    completedAt: 1000
  });
  game.recordRunPathBossSample(insightPivot, { id: 'danZun', name: '丹尊', icon: '🗿', realm: 6 }, {
    characterId: 'yanHan',
    turns: 3,
    completedAt: 2000
  });
  game.recordRunPathBossSample(bulwarkBase, { id: 'heavenlyDao', name: '天道', icon: '☯', realm: 18 }, {
    characterId: 'linFeng',
    turns: 7,
    completedAt: 3000
  });

  const insightSamples = game.getRunPathBossSamples({ pathId: 'insight', limit: 10 });
  assert(insightSamples.length === 2, `insight should expose two boss samples, got ${JSON.stringify(insightSamples)}`);

  const danZunBest = game.getRunPathBossSamples({ bossId: 'danZun', sortBy: 'bestTurn', limit: 10 });
  assert(danZunBest.length === 2, `danZun should expose two samples, got ${JSON.stringify(danZunBest)}`);
  assert(danZunBest[0].turns === 3 && danZunBest[0].mutationName === '借势落子', `best-turn sort should prioritize pivot sample, got ${JSON.stringify(danZunBest[0])}`);

  const pivotBoard = game.buildRunPathBossSampleBoard({ pathId: 'insight', mutationId: 'pivot', limit: 3, sortBy: 'bestTurn' });
  assert(pivotBoard.count === 1, `pivot board should isolate pivot sample, got ${JSON.stringify(pivotBoard)}`);
  assert(pivotBoard.entries[0].headline.includes('严寒'), `pivot board should resolve character name, got ${JSON.stringify(pivotBoard.entries[0])}`);
  assert(pivotBoard.entries[0].tagLine.some((tag) => /转修|借势落子/.test(tag)), `pivot board should carry mutation tag, got ${JSON.stringify(pivotBoard.entries[0])}`);
  assert(pivotBoard.recommendation && pivotBoard.recommendation.mutation && /借势落子/.test(pivotBoard.recommendation.mutation.label || ''), `pivot board recommendation should expose mutation summary, got ${JSON.stringify(pivotBoard.recommendation)}`);
  assert(
    pivotBoard.recommendation && pivotBoard.recommendation.chapter && /炉海天阙|第2章/.test(pivotBoard.recommendation.chapter.name || ''),
    `pivot board recommendation should expose chapter guidance, got ${JSON.stringify(pivotBoard.recommendation)}`
  );
  assert(
    pivotBoard.recommendation && pivotBoard.recommendation.chapter && pivotBoard.recommendation.chapter.fitScore >= 80,
    `pivot board chapter fit score should stay high for matching chapter sample, got ${JSON.stringify(pivotBoard.recommendation)}`
  );

  const bossBoard = game.buildRunPathBossSampleBoard({ bossId: 'danZun', limit: 3, sortBy: 'bestTurn' });
  assert(bossBoard.count === 2, `boss board should count danZun samples, got ${JSON.stringify(bossBoard)}`);
  assert(bossBoard.uniqueCharacters === 2, `boss board should track unique characters, got ${JSON.stringify(bossBoard)}`);
  assert(bossBoard.bestTurn === 3, `boss board should report best turn, got ${JSON.stringify(bossBoard)}`);
  assert(bossBoard.recommendation && bossBoard.recommendation.character && /严寒|林枫/.test(bossBoard.recommendation.character.name || ''), `boss board recommendation should expose recommended character, got ${JSON.stringify(bossBoard.recommendation)}`);
  assert(
    bossBoard.recommendation && bossBoard.recommendation.chapter && bossBoard.recommendation.chapter.fitScore >= 70,
    `boss board recommendation should expose chapter fit score, got ${JSON.stringify(bossBoard.recommendation)}`
  );
  assert(
    bossBoard.recommendation && Array.isArray(bossBoard.recommendation.lines) && bossBoard.recommendation.lines.some((line) => /推荐角色/.test(line)) && bossBoard.recommendation.lines.some((line) => /推荐套装/.test(line)) && bossBoard.recommendation.lines.some((line) => /章节适配|场域拟合分/.test(line)),
    `boss board recommendation should expose role+set guidance lines, got ${JSON.stringify(bossBoard.recommendation)}`
  );

  const progress = game.getCollectionProgressSnapshot();
  assert(progress.runPathBossSampleCount === 3, `progress should expose total sample count, got ${JSON.stringify(progress)}`);
  assert(progress.sampledBosses === 2, `progress should expose sampled boss count, got ${JSON.stringify(progress)}`);
  assert(progress.sampledCharacters === 2, `progress should expose sampled character count, got ${JSON.stringify(progress)}`);

  const reloadedGame = Object.create(Game.prototype);
  reloadedGame.player = {
    characterId: 'linFeng',
    realm: 6
  };
  reloadedGame.unlockedRealms = [1, 2, 3, 4, 5, 6];
  reloadedGame.achievementSystem = { stats: { realmCleared: 6 } };
  const reloadedSamples = reloadedGame.getRunPathBossSamples({ limit: 10 });
  assert(reloadedSamples.length === 3, `reloaded game should restore persisted samples, got ${JSON.stringify(reloadedSamples)}`);

  console.log('Run path sample board checks passed.');
})();
