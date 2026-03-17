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

function buildEventContext() {
  const mathObj = Object.create(Math);
  const ctx = vm.createContext({
    console,
    Math: mathObj,
    JSON,
    Date,
    window: {},
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;
  return ctx;
}

function runComposerChecks(root) {
  const ctx = buildEventContext();
  loadFile(ctx, path.join(root, 'js/data/events.js'));

  const getComposedChapterEvent = vm.runInContext('getComposedChapterEvent', ctx);
  const getRandomEvent = vm.runInContext('getRandomEvent', ctx);

  const composed = getComposedChapterEvent({
    chapterIndex: 3,
    chapterName: '第3章',
    priorEntries: [],
    recentTags: ['观测'],
    composeChance: 1
  });
  assert(!!composed, 'composed chapter event should be generated');
  assert(composed.isComposedChapterEvent === true, 'composed event should expose isComposedChapterEvent flag');
  assert(Array.isArray(composed.choices) && composed.choices.length >= 3, 'composed event should provide at least 3 choices');
  const arcTypes = composed.choices
    .map((choice) => (choice && choice.fateLedger ? choice.fateLedger.arcType : ''))
    .filter(Boolean);
  assert(arcTypes.includes('short_gain_long_loss'), 'composed choices should include short_gain_long_loss arc');
  assert(arcTypes.includes('short_loss_long_gain'), 'composed choices should include short_loss_long_gain arc');
  composed.choices.slice(0, 2).forEach((choice, index) => {
    assert(typeof choice.text === 'string' && choice.text.length > 0, `choice[${index}] should include text`);
    assert(typeof choice.result === 'string' && choice.result.length > 0, `choice[${index}] should include result`);
    assert(Array.isArray(choice.effects), `choice[${index}] should include effects array`);
    assert(choice.fateLedger && typeof choice.fateLedger === 'object', `choice[${index}] should include fateLedger payload`);
  });

  const recallEvent = getComposedChapterEvent({
    chapterIndex: 5,
    chapterName: '第5章',
    priorEntries: [
      {
        id: 'ledger_prev_1',
        chapterIndex: 2,
        echoText: '你曾透支边线补给，债务回响仍在。',
        longTermText: '补给债务正在追缴。',
        tags: ['补给债务', '高压交易']
      }
    ],
    recentTags: ['补给债务'],
    composeChance: 1
  });
  assert(!!recallEvent, 'composed event with recall context should be generated');
  assert(
    typeof recallEvent.description === 'string' && recallEvent.description.includes('前章回响'),
    `composed event should surface recall text, got: ${recallEvent.description}`
  );
  assert(
    recallEvent.composerMeta && recallEvent.composerMeta.recallEntryId === 'ledger_prev_1',
    'composed event should preserve recall entry id in composerMeta'
  );

  ctx.window.game = {
    player: { realm: 7, deck: [] },
    getChapterEventComposerContext: () => ({
      chapterIndex: 3,
      chapterName: '第3章',
      priorEntries: [],
      recentTags: ['观测'],
      composeChance: 1
    })
  };
  ctx.Math.random = () => 0;
  const randomEvent = getRandomEvent();
  assert(randomEvent && randomEvent.isComposedChapterEvent === true, 'getRandomEvent should be able to output composed chapter event');
}

function runLedgerChecks(root) {
  const ctx = vm.createContext({
    console,
    Math,
    JSON,
    Date,
    window: {},
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    setTimeout: () => 0,
    clearTimeout: () => {}
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/game.js'));
  const Game = vm.runInContext('Game', ctx);

  const state = {
    chapterEventLedger: null,
    player: { realm: 7 },
    currentBattleNode: { id: 'event_node_1', type: 'event' },
    currentEventRuntimeMeta: { eventRuntimeId: 'runtime_evt_1', chapterIndex: 3, chapterName: '第3章' },
    getChapterDisplaySnapshot: () => ({ chapterIndex: 3, name: '第3章' })
  };
  state.createDefaultChapterEventLedger = Game.prototype.createDefaultChapterEventLedger;
  state.normalizeChapterEventLedger = Game.prototype.normalizeChapterEventLedger;
  state.ensureChapterEventLedger = Game.prototype.ensureChapterEventLedger;
  state.getChapterEventLedgerSnapshot = Game.prototype.getChapterEventLedgerSnapshot;
  state.recordChapterEventConsequence = Game.prototype.recordChapterEventConsequence;
  state.getChapterEventLedgerSaveState = Game.prototype.getChapterEventLedgerSaveState;
  state.applyChapterEventLedgerSaveState = Game.prototype.applyChapterEventLedgerSaveState;
  state.getChapterEventComposerContext = Game.prototype.getChapterEventComposerContext;

  state.ensureChapterEventLedger();

  const event = {
    id: 'chapterComposer_astral_archive_evt',
    name: '📚 星册登记台',
    isComposedChapterEvent: true
  };
  const choice = {
    text: '先做长期校对',
    result: '短期损失灵石，换取后续稳定情报',
    effects: [{ type: 'gold', value: -48 }],
    fateLedger: {
      arcType: 'short_loss_long_gain',
      immediateText: '你先投入预算，短期变现能力下降。',
      longTermText: '后续章节更容易触发稳健分支。',
      echoText: '你留下的校对记录正在引导稳健路径。',
      tags: ['校对档案', '稳健分支']
    }
  };

  const entry = state.recordChapterEventConsequence({
    event,
    choice,
    choiceIndex: 1,
    runtimeId: 'runtime_evt_1',
    chapterIndex: 3,
    chapterName: '第3章'
  });
  assert(!!entry, 'ledger should record chapter consequence entry');
  assert(entry.arcType === 'short_loss_long_gain', `ledger arcType mismatch, got ${entry.arcType}`);
  assert(Array.isArray(entry.tags) && entry.tags.includes('校对档案'), 'ledger tags should keep fate tags');

  const duplicate = state.recordChapterEventConsequence({
    event,
    choice,
    choiceIndex: 1,
    runtimeId: 'runtime_evt_1',
    chapterIndex: 3,
    chapterName: '第3章'
  });
  assert(duplicate && duplicate.id === entry.id, 'duplicate runtime+choice should not create a second ledger entry');

  const snapshot = state.getChapterEventLedgerSnapshot({ includeEntries: true, limit: 3 });
  assert(snapshot.totalEntries === 1, `ledger snapshot should report one entry, got ${snapshot.totalEntries}`);
  assert(Array.isArray(snapshot.entries) && snapshot.entries.length === 1, 'ledger snapshot should expose saved entry');

  const savedLedger = state.getChapterEventLedgerSaveState();
  const restoreState = {
    chapterEventLedger: null,
    createDefaultChapterEventLedger: Game.prototype.createDefaultChapterEventLedger,
    normalizeChapterEventLedger: Game.prototype.normalizeChapterEventLedger
  };
  restoreState.applyChapterEventLedgerSaveState = Game.prototype.applyChapterEventLedgerSaveState;
  const restored = restoreState.applyChapterEventLedgerSaveState(savedLedger);
  assert(Array.isArray(restored.entries) && restored.entries.length === 1, 'ledger save state should be restorable');

  state.player.realm = 10;
  state.getChapterDisplaySnapshot = () => ({ chapterIndex: 4, name: '第4章' });
  const composerContext = state.getChapterEventComposerContext();
  assert(composerContext.chapterIndex === 4, 'composer context should use current chapter');
  assert(Array.isArray(composerContext.priorEntries) && composerContext.priorEntries.length === 1, 'composer context should reference prior ledger entries');
  assert(Array.isArray(composerContext.recentTags) && composerContext.recentTags.includes('校对档案'), 'composer context should expose recent ledger tags');
}

(function run() {
  const root = path.resolve(__dirname, '..');
  runComposerChecks(root);
  runLedgerChecks(root);
  console.log('Chapter event composer + ledger checks passed.');
})();
