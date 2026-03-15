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

function getCardValueScore(card) {
  const effects = Array.isArray(card.effects) ? card.effects : [];
  let score = 0;
  effects.forEach((effect) => {
    if (!effect || typeof effect !== 'object') return;
    const value = Number(effect.value) || 0;
    if (effect.type === 'damage' || effect.type === 'damageAll' || effect.type === 'executeDamage') score += value;
    if (effect.type === 'heal') score += value * 0.9;
    if (effect.type === 'block') score += value * 0.7;
    if (effect.type === 'draw') score += value * 3;
    if (effect.type === 'energy') score += value * 3.5;
    if (effect.type === 'applyMark' || effect.type === 'debuff') score += value * 1.2;
    if (effect.type === 'conditionalDamage') score += (Number(effect.value) || 0) * 0.6;
  });
  return score;
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const ctx = vm.createContext({
    console,
    window: {},
    Math,
    JSON,
    Date
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/data/cards.js'));

  const CARDS = vm.runInContext('CARDS', ctx);
  const ARCHETYPE_PACKS = vm.runInContext('ARCHETYPE_PACKS', ctx);

  const targetArchetypes = ['stormcraft', 'vitalweave', 'cursebound', 'soulforge'];
  const forbiddenEffectTypes = new Set(['searchDeck', 'tutor', 'instantWin', 'killAll']);
  const seen = new Set();
  const cards = [];

  targetArchetypes.forEach((id) => {
    const pack = ARCHETYPE_PACKS[id];
    assert(pack && Array.isArray(pack.cards), `archetype pack missing: ${id}`);
    assert(pack.cards.length >= 15, `${id} should include >=15 cards`);
    pack.cards.forEach((cardId) => {
      if (seen.has(cardId)) return;
      seen.add(cardId);
      if (CARDS[cardId]) cards.push(CARDS[cardId]);
    });
  });

  cards.forEach((card) => {
    assert(card && card.id, 'card entry should be valid');
    const effects = Array.isArray(card.effects) ? card.effects : [];
    assert(effects.length > 0, `card ${card.id} should include effects`);

    const forbidden = effects.find((effect) => forbiddenEffectTypes.has(effect.type));
    assert(!forbidden, `card ${card.id} uses forbidden effect type: ${forbidden ? forbidden.type : 'unknown'}`);

    const hasDownside = effects.some((effect) =>
      effect.type === 'selfDamage' ||
      effect.type === 'discardRandom' ||
      effect.type === 'discardHand' ||
      effect.type === 'consumeAllEnergy'
    );
    const drawCount = effects
      .filter((effect) => effect.type === 'draw')
      .reduce((sum, effect) => sum + Math.max(0, Number(effect.value) || 0), 0);
    const energyCount = effects
      .filter((effect) => effect.type === 'energy')
      .reduce((sum, effect) => sum + Math.max(0, Number(effect.value) || 0), 0);

    if (Number(card.cost) === 0) {
      const valueScore = getCardValueScore(card);
      assert(
        valueScore <= 12 || hasDownside,
        `0-cost card ${card.id} is too efficient without downside: score=${valueScore.toFixed(2)}`
      );
      assert(
        !(drawCount >= 2 && energyCount >= 1 && !hasDownside),
        `0-cost card ${card.id} should not provide draw>=2 and energy>=1 without downside`
      );
    }

    assert(
      !(drawCount >= 3 && Number(card.cost) <= 1 && !hasDownside),
      `card ${card.id} draw engine should include cost/downside guardrail`
    );
  });

  console.log('Card design guardrail checks passed.');
})();
