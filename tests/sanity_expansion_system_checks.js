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
    Math,
    Date,
    JSON,
    window: {},
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} })
    },
    Utils: {
      showBattleLog: () => {},
      random: (min, max) => min,
      shuffle: (arr) => arr.slice(),
      getCanonicalElement: (e) => e,
      getElementIcon: () => '',
      createFloatingText: () => {},
      showFloatingNumber: () => {},
      addShakeEffect: () => {},
      renderBuffs: () => '',
      sleep: async () => {},
      createCardElement: () => ({ style: {}, remove() {} }),
      createEnemyElement: () => ({ addEventListener() {}, dataset: {}, classList: { add() {}, remove() {} } })
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/data/cards.js'));
  loadFile(ctx, path.join(root, 'js/data/characters.js'));
  loadFile(ctx, path.join(root, 'js/data/skills.js'));
  loadFile(ctx, path.join(root, 'js/data/fate_ring.js'));
  loadFile(ctx, path.join(root, 'js/data/treasures.js'));
  loadFile(ctx, path.join(root, 'js/data/enemies.js'));
  loadFile(ctx, path.join(root, 'js/core/fateRing.js'));
  loadFile(ctx, path.join(root, 'js/core/player.js'));

  const Player = vm.runInContext('Player', ctx);
  const CHARACTERS = vm.runInContext('CHARACTERS', ctx);
  const SKILLS = vm.runInContext('SKILLS', ctx);
  const CARDS = vm.runInContext('CARDS', ctx);
  const CARD_POOL = vm.runInContext('CARD_POOL', ctx);
  const TREASURES = vm.runInContext('TREASURES', ctx);
  const FATE_RING = vm.runInContext('FATE_RING', ctx);
  const ENEMIES = vm.runInContext('ENEMIES', ctx);
  const getEnemiesForRealm = vm.runInContext('getEnemiesForRealm', ctx);

  assert(!!CHARACTERS.moChen, 'moChen character should exist');
  assert(CHARACTERS.moChen.activeSkillId === 'starOath', 'moChen should use starOath skill');
  assert(Array.isArray(CHARACTERS.moChen.deck) && CHARACTERS.moChen.deck.includes('ringCatalyst'), 'moChen starter deck should include ringCatalyst');
  assert(!!CHARACTERS.ningXuan, 'ningXuan character should exist');
  assert(CHARACTERS.ningXuan.activeSkillId === 'artifactOverdrive', 'ningXuan should use artifactOverdrive skill');
  assert(Array.isArray(CHARACTERS.ningXuan.deck) && CHARACTERS.ningXuan.deck.includes('ringInfusion'), 'ningXuan starter deck should include ringInfusion');

  assert(!!SKILLS.starOath, 'starOath skill should be defined');
  assert(!!SKILLS.artifactOverdrive, 'artifactOverdrive skill should be defined');
  assert(CARD_POOL.common.includes('starNeedle'), 'starNeedle should be in common card pool');
  assert(CARD_POOL.uncommon.includes('omenBarrier'), 'omenBarrier should be in uncommon card pool');
  assert(CARD_POOL.rare.includes('ringCatalyst'), 'ringCatalyst should be in rare card pool');
  assert(CARD_POOL.common.includes('artifactBolt'), 'artifactBolt should be in common card pool');
  assert(CARD_POOL.uncommon.includes('echoWard'), 'echoWard should be in uncommon card pool');
  assert(CARD_POOL.rare.includes('ringInfusion'), 'ringInfusion should be in rare card pool');
  assert(CARD_POOL.uncommon.includes('matrixGuardProtocol'), 'matrixGuardProtocol should be in uncommon card pool');
  assert(CARD_POOL.uncommon.includes('matrixShatterVector'), 'matrixShatterVector should be in uncommon card pool');
  assert(CARD_POOL.rare.includes('matrixPurgeLoop'), 'matrixPurgeLoop should be in rare card pool');

  assert(!!FATE_RING.paths.resonance, 'resonance fate path should exist');
  assert(!!FATE_RING.paths.convergence, 'convergence fate path should exist');
  assert(Array.isArray(FATE_RING.paths.defiance.requires) && FATE_RING.paths.defiance.requires.includes('resonance'), 'defiance path should accept resonance branch');
  assert(Array.isArray(FATE_RING.paths.defiance.requires) && FATE_RING.paths.defiance.requires.includes('convergence'), 'defiance path should accept convergence branch');

  const mo = new Player();
  mo.reset('moChen');
  assert(mo.relic && mo.relic.id === 'starsealCompass', 'moChen relic should be starsealCompass');

  // Skill behavior
  mo.skillLevel = 3;
  mo.activeSkill = SKILLS.starOath;
  mo.currentEnergy = 1;
  mo.block = 0;
  mo.drawPile = [
    { ...CARDS.strike, instanceId: 'draw1' },
    { ...CARDS.defend, instanceId: 'draw2' }
  ];
  mo.hand = [];
  mo.fateRing.getSocketedLaws = () => ['thunderLaw', 'earthShield'];
  const skillOk = SKILLS.starOath.effect(mo, null);
  assert(skillOk === true, 'starOath should return true');
  assert(mo.block >= 12, `starOath should grant scalable block, got ${mo.block}`);
  assert(mo.currentEnergy >= 2, `starOath should grant energy, got ${mo.currentEnergy}`);

  // Fate path + relic rhythm effects
  mo.fateRing.path = 'resonance';
  mo.maxMilkCandy = 3;
  mo.prepareBattle();
  assert(mo.milkCandy >= 4, `resonance/relic should grant overcap candy at battle start, got ${mo.milkCandy}`);

  mo.drawPile = [
    { ...CARDS.strike, instanceId: 'd1' },
    { ...CARDS.defend, instanceId: 'd2' },
    { ...CARDS.spiritBoost, instanceId: 'd3' }
  ];
  mo.hand = [{
    id: 'test_skill_trigger',
    name: '测试技能牌',
    type: 'skill',
    cost: 0,
    effects: [{ type: 'draw', value: 0, target: 'self' }],
    instanceId: 's1'
  }];
  mo.currentEnergy = 3;
  const playRes = mo.playCard(0, null);
  assert(!!playRes, 'playCard should succeed for test skill card');
  assert(mo.hand.length >= 2, `first skill of turn should draw via path+relic, hand=${mo.hand.length}`);
  assert(mo.ringResonanceSkillDrawUsedThisTurn === true, 'resonance draw flag should be consumed');
  assert(mo.relicSkillDrawUsedThisTurn === true, 'relic draw flag should be consumed');

  mo.drawCount = 0;
  mo.startTurn();
  assert(mo.ringResonanceSkillDrawUsedThisTurn === false, 'resonance draw flag should reset each turn');
  assert(mo.relicSkillDrawUsedThisTurn === false, 'relic draw flag should reset each turn');

  // New character runtime + skill + relic checks
  const nx = new Player();
  nx.reset('ningXuan');
  nx.realm = 2;
  assert(nx.relic && nx.relic.id === 'artifactPulse', 'ningXuan relic should be artifactPulse');
  nx.skillLevel = 3;
  nx.activeSkill = SKILLS.artifactOverdrive;
  nx.currentEnergy = 1;
  nx.block = 0;
  nx.buffs = {};
  nx.drawPile = [
    { ...CARDS.strike, instanceId: 'nx_d1' },
    { ...CARDS.defend, instanceId: 'nx_d2' }
  ];
  nx.hand = [];
  const nxSkillOk = SKILLS.artifactOverdrive.effect(nx, null);
  assert(nxSkillOk === true, 'artifactOverdrive should return true');
  assert(nx.block >= 14, `artifactOverdrive should grant scalable block, got ${nx.block}`);
  assert(nx.currentEnergy >= 2, `artifactOverdrive should grant energy, got ${nx.currentEnergy}`);
  assert((nx.buffs.strength || 0) >= 1, 'artifactOverdrive should grant strength at level 3');

  nx.prepareBattle();
  assert(nx.block >= 6, `artifactPulse should grant opening block in realm 2, got ${nx.block}`);
  nx.hand = [
    { id: 'nx_atk_1', name: '测试攻击1', type: 'attack', cost: 1, effects: [{ type: 'damage', value: 5, target: 'enemy' }], instanceId: 'nxa1' },
    { id: 'nx_atk_2', name: '测试攻击2', type: 'attack', cost: 1, effects: [{ type: 'damage', value: 5, target: 'enemy' }], instanceId: 'nxa2' }
  ];
  nx.currentEnergy = 3;
  nx.playCard(0, null);
  assert(nx.currentEnergy === 3, `artifactPulse first attack should refund energy once, got ${nx.currentEnergy}`);
  nx.playCard(0, null);
  assert(nx.currentEnergy === 2, `artifactPulse should only refund once per turn, got ${nx.currentEnergy}`);
  nx.startTurn();
  assert(nx.relicAttackEnergyUsedThisTurn === false, 'artifactPulse refund flag should reset each turn');

  // New path runtime: convergence should boost first attack each turn
  const cv = new Player();
  cv.reset('linFeng');
  cv.realm = 2;
  cv.fateRing.path = 'convergence';
  cv.currentEnergy = 3;
  cv.prepareBattle();
  assert(cv.currentEnergy >= cv.baseEnergy + 1, `convergence path should grant opening energy, got ${cv.currentEnergy}`);
  cv.hand = [
    { id: 'cv_attack_a', name: '汇流测试A', type: 'attack', cost: 0, effects: [{ type: 'damage', value: 6, target: 'enemy' }], instanceId: 'cva' },
    { id: 'cv_attack_b', name: '汇流测试B', type: 'attack', cost: 0, effects: [{ type: 'damage', value: 6, target: 'enemy' }], instanceId: 'cvb' }
  ];
  cv.drawPile = [];
  cv.discardPile = [];
  const cvResA = cv.playCard(0, null);
  const firstDamage = Array.isArray(cvResA) ? cvResA.find((r) => r && r.type === 'damage') : null;
  assert(firstDamage && firstDamage.value >= 10, `convergence first attack should gain +4 damage, got ${firstDamage ? firstDamage.value : 'null'}`);
  const cvResB = cv.playCard(0, null);
  const secondDamage = Array.isArray(cvResB) ? cvResB.find((r) => r && r.type === 'damage') : null;
  assert(secondDamage && secondDamage.value === 6, `convergence second attack should not gain bonus in same turn, got ${secondDamage ? secondDamage.value : 'null'}`);
  cv.startTurn();
  assert(cv.ringConvergenceAttackBoostUsedThisTurn === false, 'convergence flag should reset each turn');

  // New treasures
  const tPlayer = new Player();
  tPlayer.reset('linFeng');
  tPlayer.maxMilkCandy = 3;
  tPlayer.milkCandy = 3;
  tPlayer.fateRing.level = 4;
  tPlayer.drawPile = [{ ...CARDS.strike, instanceId: 'tx1' }];
  tPlayer.hand = [];

  assert(!!TREASURES.ring_echo_compass, 'ring_echo_compass should exist');
  assert(!!TREASURES.astral_forge_core, 'astral_forge_core should exist');
  assert(!!TREASURES.fate_lotus_seal, 'fate_lotus_seal should exist');
  assert(!!TREASURES.moonblade_sheath, 'moonblade_sheath should exist');
  assert(!!TREASURES.ringweaver_anvil, 'ringweaver_anvil should exist');
  assert(!!TREASURES.hunter_contract, 'hunter_contract should exist');
  assert(!!TREASURES.matrix_resonator, 'matrix_resonator should exist');
  assert(!!TREASURES.tactical_relay_spindle, 'tactical_relay_spindle should exist');

  tPlayer.addTreasure('ring_echo_compass');
  tPlayer.triggerTreasureEffect('onBattleStart');
  assert(tPlayer.milkCandy >= 4, `ring_echo_compass should add candy over cap, got ${tPlayer.milkCandy}`);

  tPlayer.addTreasure('astral_forge_core');
  tPlayer.currentEnergy = 1;
  tPlayer.block = 0;
  tPlayer.triggerTreasureEffect('onBattleStart');
  const skillCard = { id: 'skill_probe', name: '技', type: 'skill', cost: 1, effects: [] };
  tPlayer.triggerTreasureEffect('onCardPlay', skillCard, {});
  tPlayer.triggerTreasureEffect('onCardPlay', skillCard, {});
  assert(tPlayer.currentEnergy >= 2, `astral_forge_core should recover energy after 2 skills, got ${tPlayer.currentEnergy}`);
  assert(tPlayer.block >= 3, `astral_forge_core should grant block, got ${tPlayer.block}`);

  tPlayer.realm = 10;
  tPlayer.maxRealmReached = 10;
  tPlayer.addTreasure('fate_lotus_seal');
  tPlayer.currentHp = Math.max(1, tPlayer.maxHp - 5);
  const beforeExp = tPlayer.fateRing.exp;
  const beforeHp = tPlayer.currentHp;
  tPlayer.triggerTreasureEffect('onKill', { id: 'dummy_enemy' });
  assert(tPlayer.fateRing.exp > beforeExp, 'fate_lotus_seal should grant ring exp on kill');
  assert(tPlayer.currentHp > beforeHp, 'fate_lotus_seal should heal on kill');

  const t2 = new Player();
  t2.reset('linFeng');
  t2.realm = 2;
  t2.currentEnergy = 3;
  t2.addTreasure('moonblade_sheath');
  t2.triggerTreasureEffect('onBattleStart');
  t2.triggerTreasureEffect('onTurnStart');
  t2.hand = [
    { id: 'mbs_atk', name: '月刃测试', type: 'attack', cost: 0, effects: [{ type: 'damage', value: 4, target: 'enemy' }], instanceId: 'mbs1' }
  ];
  t2.drawPile = [{ ...CARDS.strike, instanceId: 'mbs_draw' }];
  const beforeBlock = t2.block;
  const beforeHand = t2.hand.length;
  t2.playCard(0, null);
  assert(t2.block > beforeBlock, 'moonblade_sheath should grant block on first attack each turn');
  assert(t2.hand.length >= beforeHand, 'moonblade_sheath should draw one card on first attack');

  const t3 = new Player();
  t3.reset('linFeng');
  t3.maxMilkCandy = 3;
  t3.milkCandy = 2;
  t3.addTreasure('ringweaver_anvil');
  const anvilBeforeExp = t3.fateRing.exp;
  t3.triggerTreasureEffect('onCardPlay', { id: 'law_probe', type: 'law' }, {});
  assert(t3.fateRing.exp >= anvilBeforeExp + 10, 'ringweaver_anvil should grant ring exp on law card play');
  assert(t3.milkCandy >= 3, 'ringweaver_anvil should recover candy on law card play');

  const t4 = new Player();
  t4.reset('linFeng');
  t4.realm = 2;
  t4.drawPile = [{ ...CARDS.defend, instanceId: 'hc1' }];
  t4.hand = [];
  const goldBefore = t4.gold;
  t4.addTreasure('hunter_contract');
  t4.triggerTreasureEffect('onBattleStart');
  assert((t4.buffs.strength || 0) >= 1, 'hunter_contract should grant opening strength');
  t4.triggerTreasureEffect('onKill', { id: 'dummy_enemy_2' });
  assert(t4.gold >= goldBefore + 10, 'hunter_contract should grant gold on kill');
  assert(t4.hand.length >= 1, 'hunter_contract should draw on kill');

  const t5 = new Player();
  t5.reset('linFeng');
  t5.currentEnergy = 1;
  t5.hand = [];
  t5.drawPile = [{ ...CARDS.defend, instanceId: 'mr_draw_1' }];
  t5.game = {
    battle: {
      commandState: {
        enabled: true,
        points: 0,
        maxPoints: 8,
        totalCommandsUsed: 0,
        lastCommandId: '',
        lastResonanceMatrixMode: 'auto'
      },
      gainBattleCommandPoints(amount) {
        const val = Math.max(0, Math.floor(Number(amount) || 0));
        this.commandState.points = Math.min(this.commandState.maxPoints, this.commandState.points + val);
      }
    }
  };
  t5.addTreasure('matrix_resonator');
  t5.triggerTreasureEffect('onBattleStart');
  assert(t5.game.battle.commandState.points >= 1, 'matrix_resonator should grant opening command points');
  t5.triggerTreasureEffect('onCardPlay', { id: 'matrixShatterVector', type: 'attack' }, {});
  assert((t5.buffs.matrixBreakSignal || 0) >= 1, 'matrix_resonator should add break signal on matrix card play');

  t5.addTreasure('tactical_relay_spindle');
  t5.game.battle.commandState.totalCommandsUsed = 2;
  t5.game.battle.commandState.lastCommandId = 'resonance_matrix_order';
  t5.game.battle.commandState.lastResonanceMatrixMode = 'break';
  const relayEnergyBefore = t5.currentEnergy;
  const relayHandBefore = t5.hand.length;
  t5.triggerTreasureEffect('onTurnStart');
  assert(t5.currentEnergy >= relayEnergyBefore + 1, 'tactical_relay_spindle should grant energy after resonance matrix');
  assert(t5.hand.length >= relayHandBefore + 1, 'tactical_relay_spindle should draw when last mode was manual');

  // New enemy roster coverage
  assert(ENEMIES.runeSentinel && ENEMIES.runeSentinel.realm === 6, 'runeSentinel should exist in realm 6');
  assert(ENEMIES.frostArrowHerald && ENEMIES.frostArrowHerald.realm === 8, 'frostArrowHerald should exist in realm 8');
  assert(ENEMIES.abyssCantor && ENEMIES.abyssCantor.realm === 12, 'abyssCantor should exist in realm 12');
  assert(ENEMIES.warDrummer && ENEMIES.warDrummer.realm === 14, 'warDrummer should exist in realm 14');
  assert(ENEMIES.emberPhysician && ENEMIES.emberPhysician.realm === 4, 'emberPhysician should exist in realm 4');
  assert(ENEMIES.starChainWarden && ENEMIES.starChainWarden.realm === 7, 'starChainWarden should exist in realm 7');
  assert(ENEMIES.basaltArcanist && ENEMIES.basaltArcanist.realm === 10, 'basaltArcanist should exist in realm 10');
  assert(ENEMIES.oracleSilencer && ENEMIES.oracleSilencer.realm === 13, 'oracleSilencer should exist in realm 13');
  assert(ENEMIES.voidTaxCollector && ENEMIES.voidTaxCollector.realm === 15, 'voidTaxCollector should exist in realm 15');
  assert(ENEMIES.ashenArchivist && ENEMIES.ashenArchivist.realm === 17, 'ashenArchivist should exist in realm 17');
  assert(ENEMIES.graveRaven && ENEMIES.graveRaven.realm === 1, 'graveRaven should exist in realm 1');
  assert(ENEMIES.soulLanternMonk && ENEMIES.soulLanternMonk.realm === 5, 'soulLanternMonk should exist in realm 5');
  assert(ENEMIES.verdictPriest && ENEMIES.verdictPriest.realm === 9, 'verdictPriest should exist in realm 9');
  assert(ENEMIES.stormScribe && ENEMIES.stormScribe.realm === 11, 'stormScribe should exist in realm 11');
  assert(ENEMIES.prismLocust && ENEMIES.prismLocust.realm === 16, 'prismLocust should exist in realm 16');
  assert(ENEMIES.doomsdayHerald && ENEMIES.doomsdayHerald.realm === 18, 'doomsdayHerald should exist in realm 18');
  assert((ENEMIES.emberPhysician.patterns || []).some((p) => p.type === 'multiAction'), 'emberPhysician should have multiAction pattern');
  assert((ENEMIES.starChainWarden.patterns || []).some((p) => p.type === 'addStatus'), 'starChainWarden should have addStatus pattern');

  const realm1 = getEnemiesForRealm(1).map((e) => e.id);
  const realm6 = getEnemiesForRealm(6).map((e) => e.id);
  const realm4 = getEnemiesForRealm(4).map((e) => e.id);
  const realm5 = getEnemiesForRealm(5).map((e) => e.id);
  const realm7 = getEnemiesForRealm(7).map((e) => e.id);
  const realm9 = getEnemiesForRealm(9).map((e) => e.id);
  const realm10 = getEnemiesForRealm(10).map((e) => e.id);
  const realm11 = getEnemiesForRealm(11).map((e) => e.id);
  const realm13 = getEnemiesForRealm(13).map((e) => e.id);
  const realm12 = getEnemiesForRealm(12).map((e) => e.id);
  const realm15 = getEnemiesForRealm(15).map((e) => e.id);
  const realm16 = getEnemiesForRealm(16).map((e) => e.id);
  const realm17 = getEnemiesForRealm(17).map((e) => e.id);
  const realm18 = getEnemiesForRealm(18).map((e) => e.id);
  assert(realm1.includes('graveRaven'), 'realm 1 pool should include graveRaven');
  assert(realm4.includes('emberPhysician'), 'realm 4 pool should include emberPhysician');
  assert(realm5.includes('soulLanternMonk'), 'realm 5 pool should include soulLanternMonk');
  assert(realm6.includes('runeSentinel'), 'realm 6 pool should include runeSentinel');
  assert(realm7.includes('starChainWarden'), 'realm 7 pool should include starChainWarden');
  assert(realm9.includes('verdictPriest'), 'realm 9 pool should include verdictPriest');
  assert(realm10.includes('basaltArcanist'), 'realm 10 pool should include basaltArcanist');
  assert(realm11.includes('stormScribe'), 'realm 11 pool should include stormScribe');
  assert(realm12.includes('abyssCantor'), 'realm 12 pool should include abyssCantor');
  assert(realm13.includes('oracleSilencer'), 'realm 13 pool should include oracleSilencer');
  assert(realm15.includes('voidTaxCollector'), 'realm 15 pool should include voidTaxCollector');
  assert(realm16.includes('prismLocust'), 'realm 16 pool should include prismLocust');
  assert(realm17.includes('ashenArchivist'), 'realm 17 pool should include ashenArchivist');
  assert(realm18.includes('doomsdayHerald'), 'realm 18 pool should include doomsdayHerald');

  console.log('Expansion system checks passed.');
})();
