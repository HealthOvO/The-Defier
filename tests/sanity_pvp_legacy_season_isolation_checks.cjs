const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function readGameSource() {
  let code = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');
  code = code.replace(/^export\s+(const|let|var|class|function|default)/gm, '$1');
  code = code.replace(/^export\s+\{.*?\};?/gm, '');
  code = code.replace(/^import\s+.*?;/gm, '');
  return code;
}

const gameSource = readGameSource();
const ctx = vm.createContext({
  console,
  window: {},
  Math,
  JSON,
  Date
});
ctx.window = ctx;
ctx.global = ctx;

vm.runInContext(gameSource, ctx, { filename: 'game.js' });

const Game = vm.runInContext('Game', ctx);
assert.strictEqual(typeof Game, 'function', 'Game class should be available');
assert.strictEqual(
  typeof Game.prototype.shouldRecordPVPSeasonVerification,
  'function',
  'Game should expose a formal PVP season verification gate'
);

const harness = Object.create(Game.prototype);
[
  null,
  {},
  { rejected: true, formalSeasonVerification: true, settlementSource: 'live_ranked' },
  { settlementSource: 'local_practice', formalSeasonVerification: true },
  { settlementSource: 'local_authority_gate', formalSeasonVerification: true },
  { settlementSource: 'local_online_fallback', formalSeasonVerification: true },
  { settlementSource: 'bmob_online', formalSeasonVerification: true },
  { settlementSource: 'server_authoritative', formalSeasonVerification: true },
  { settlementSource: 'live_ranked' },
  { settlementSource: 'live_ranked', formalSeasonVerification: false }
].forEach((payload) => {
  assert.strictEqual(
    harness.shouldRecordPVPSeasonVerification(payload),
    false,
    `legacy or non-explicit PVP settlement should not write season verification: ${JSON.stringify(payload)}`
  );
});

assert.strictEqual(
  harness.shouldRecordPVPSeasonVerification({
    settlementSource: 'live_ranked',
    formalSeasonVerification: true
  }),
  true,
  'explicit live ranked settlement may write formal season verification'
);

const victoryStart = gameSource.indexOf('async handlePVPVictory()');
const defeatStart = gameSource.indexOf('async handlePVPDefeat()');
const closeStart = gameSource.indexOf('closePVPResult()', defeatStart);
assert.ok(victoryStart >= 0 && defeatStart > victoryStart && closeStart > defeatStart, 'PVP result handlers should be locatable');
const victoryBlock = gameSource.slice(victoryStart, defeatStart);
const defeatBlock = gameSource.slice(defeatStart, closeStart);
assert.ok(
  victoryBlock.includes('this.shouldRecordPVPSeasonVerification(result)'),
  'PVP victory handler should gate season verification behind formal live ranked eligibility'
);
assert.ok(
  defeatBlock.includes('this.shouldRecordPVPSeasonVerification(result)'),
  'PVP defeat handler should gate season verification behind formal live ranked eligibility'
);

console.log('sanity_pvp_legacy_season_isolation_checks passed');
