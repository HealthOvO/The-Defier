const { RULE_VERSION, RULES } = require('../engine/rules');

const CONTENT_PACK_VERSION = 'pvp-live-v1-content-pack';

const ROLE_KEYS = Object.freeze([
    'openingActions',
    'defenseOrRecovery',
    'publicSetup',
    'finisher',
    'swapSlots'
]);

function pairDeck(ids) {
    return ids.flatMap(id => ([
        { id, upgraded: false },
        { id, upgraded: false }
    ]));
}

const BASELINE_BOT_POLICIES = Object.freeze([
    {
        id: 'aggro_pressure',
        label: '快攻压迫策略',
        priority: ['play_lethal_if_legal', 'spend_energy_on_best_damage', 'play_visible_setup', 'play_defense_if_energy_left', 'end_turn']
    },
    {
        id: 'tempo_mark',
        label: '节奏破绽策略',
        priority: ['play_visible_setup', 'play_payoff_after_setup', 'spend_energy_on_best_damage', 'play_defense_if_energy_left', 'end_turn']
    },
    {
        id: 'shield_counter',
        label: '守势反击策略',
        priority: ['prevent_death', 'play_defense_if_energy_left', 'play_lethal_if_legal', 'spend_energy_on_best_damage', 'end_turn']
    },
    {
        id: 'soft_control',
        label: '软控消耗策略',
        priority: ['play_visible_setup', 'prevent_death', 'play_defense_if_energy_left', 'spend_energy_on_best_damage', 'end_turn']
    },
    {
        id: 'low_hp_counter',
        label: '低血反击策略',
        priority: ['prevent_death', 'play_lethal_if_legal', 'spend_energy_on_best_damage', 'play_defense_if_energy_left', 'end_turn']
    },
    {
        id: 'vulnerable_combo',
        label: '易伤组合策略',
        priority: ['play_visible_setup', 'play_payoff_after_setup', 'play_lethal_if_legal', 'spend_energy_on_best_damage', 'end_turn']
    },
    {
        id: 'draw_midrange',
        label: '过牌中速策略',
        priority: ['play_defense_if_energy_left', 'spend_energy_on_best_damage', 'play_visible_setup', 'end_turn']
    },
    {
        id: 'healing_attrition',
        label: '回复消耗策略',
        priority: ['prevent_death', 'play_defense_if_energy_left', 'spend_energy_on_best_damage', 'end_turn']
    }
]);

const BASELINE_LOADOUTS = Object.freeze([
    {
        id: 'aggro_pressure',
        label: '快攻压迫',
        identitySlot: 'pvp_fate_starter_aggro',
        botPolicyId: 'aggro_pressure',
        expectedProfile: { speed: 'fast', burst: 'medium', defense: 'low', attrition: 'low', control: 'low' },
        deck: [
            ...pairDeck(['doubleStrike', 'battleCry', 'bloodlettingSlash', 'forkedNeedle', 'defend', 'surgeStep', 'innerPeace', 'tacticalExpose', 'counterStance']),
            { id: 'pvp_burst', upgraded: false },
            { id: 'quickSlash', upgraded: false }
        ]
    },
    {
        id: 'tempo_mark',
        label: '节奏破绽',
        identitySlot: 'pvp_fate_starter_tempo',
        botPolicyId: 'tempo_mark',
        expectedProfile: { speed: 'medium', burst: 'medium', defense: 'medium', attrition: 'low', control: 'medium' },
        deck: pairDeck(['punctureMark', 'exposedCircuit', 'forkedNeedle', 'pvp_strike', 'heavyStrike', 'thunderLattice', 'tacticalExpose', 'stormWard', 'surgeStep', 'pvp_guard'])
    },
    {
        id: 'shield_counter',
        label: '守势反击',
        identitySlot: 'pvp_fate_starter_shield',
        botPolicyId: 'shield_counter',
        expectedProfile: { speed: 'slow', burst: 'low', defense: 'high', attrition: 'medium', control: 'low' },
        deck: pairDeck(['shieldBash', 'quickSlash', 'doubleStrike', 'pvp_strike', 'battleCry', 'pvp_guard', 'defend', 'ironWill', 'counterStance', 'innerPeace'])
    },
    {
        id: 'soft_control',
        label: '软控消耗',
        identitySlot: 'pvp_fate_starter_control',
        botPolicyId: 'soft_control',
        expectedProfile: { speed: 'medium', burst: 'low', defense: 'medium', attrition: 'medium', control: 'high' },
        deck: pairDeck(['shieldBash', 'pvp_strike', 'bloodlettingSlash', 'battleCry', 'exposedCircuit', 'tacticalExpose', 'pvp_guard', 'stormWard', 'counterStance', 'defend'])
    },
    {
        id: 'low_hp_counter',
        label: '低血反击',
        identitySlot: 'pvp_fate_starter_counter',
        botPolicyId: 'low_hp_counter',
        expectedProfile: { speed: 'medium', burst: 'high', defense: 'medium', attrition: 'medium', control: 'low' },
        deck: pairDeck(['transfuseStrike', 'bloodlettingSlash', 'quickSlash', 'pvp_strike', 'exposedCircuit', 'mendThread', 'wardingHerb', 'innerPeace', 'pvp_guard', 'counterStance'])
    },
    {
        id: 'vulnerable_combo',
        label: '易伤组合',
        identitySlot: 'pvp_fate_starter_combo',
        botPolicyId: 'vulnerable_combo',
        expectedProfile: { speed: 'medium', burst: 'high', defense: 'low', attrition: 'low', control: 'medium' },
        deck: pairDeck(['exposedCircuit', 'battleCry', 'pvp_strike', 'transfuseStrike', 'doubleStrike', 'tacticalExpose', 'thunderLattice', 'stormWard', 'defend', 'wardingHerb'])
    },
    {
        id: 'draw_midrange',
        label: '过牌中速',
        identitySlot: 'pvp_fate_starter_midrange',
        botPolicyId: 'draw_midrange',
        expectedProfile: { speed: 'medium', burst: 'medium', defense: 'medium', attrition: 'medium', control: 'low' },
        deck: pairDeck(['surgeStep', 'forkedNeedle', 'shieldBash', 'pvp_strike', 'doubleStrike', 'exposedCircuit', 'thunderLattice', 'innerPeace', 'defend', 'counterStance'])
    },
    {
        id: 'healing_attrition',
        label: '回复消耗',
        identitySlot: 'pvp_fate_starter_healing',
        botPolicyId: 'healing_attrition',
        expectedProfile: { speed: 'slow', burst: 'low', defense: 'high', attrition: 'high', control: 'low' },
        deck: pairDeck(['transfuseStrike', 'shieldBash', 'doubleStrike', 'battleCry', 'punctureMark', 'mendThread', 'wardingHerb', 'ironWill', 'surgeStep', 'defend'])
    }
]);

const LOADOUT_EXPLORATION_PROFILES = Object.freeze({
    aggro_pressure: {
        id: 'aggro_pressure',
        label: '快攻压迫',
        primaryDecisionAxis: '前两手压血后，是继续抢节奏还是保留低费防御。',
        funHook: '用快速压迫制造紧张感，但必须证明优势来自连续公开窗口，而不是先手秒杀。',
        skillTest: '首动预算挡下爆发后，能否用第二段伤害和调息顺序继续收束。',
        publicWeakness: '第一波被护盾或回复挡住后，手牌续航和防守窗口都会变窄。',
        swapSlots: [
            { id: 'aggro_defense_pair', label: '低费防御位', detail: '把一组纯伤害换成防御或回复，测试被反打时的稳定性。' },
            { id: 'aggro_setup_pair', label: '公开 setup 位', detail: '补入可见铺垫，让对手能读到压力来源，同时保留后续转压。' },
            { id: 'aggro_finisher_pair', label: '终结密度位', detail: '减少一组终结牌可降低卡手，增加一组则提高长局收束。' }
        ],
        practiceTopic: {
            id: 'practice_after_budget_clamp',
            label: '首动预算后继续施压',
            detail: '练习爆发被压低后如何用下一手、调息和防御保持优势。'
        },
        masteryBoundary: '熟练徽章和高光收藏只记录荣誉，不改变生命、伤害、抽牌、灵力、起手或匹配。'
    },
    tempo_mark: {
        id: 'tempo_mark',
        label: '节奏破绽',
        primaryDecisionAxis: '先铺破绽还是先保留灵力，等待对手交出防御后再兑现。',
        funHook: '每回合都在制造可读威胁，双方围绕破绽触发点博弈。',
        skillTest: '能否让破绽 payoff 命中防御空窗，而不是把 setup 白送给对手。',
        publicWeakness: '节奏慢一拍时容易被快攻压低血线，且 payoff 被护盾挡住会亏节奏。',
        swapSlots: [
            { id: 'tempo_guard_pair', label: '护盾缓冲位', detail: '换入低费护盾，专门应对快攻前两手。' },
            { id: 'tempo_draw_pair', label: '调息续航位', detail: '提升中局找 payoff 的稳定性，但会降低即时压力。' },
            { id: 'tempo_pressure_pair', label: '破绽兑现位', detail: '增加兑现牌可提高终结速度，但会让起手更依赖 setup。' }
        ],
        practiceTopic: {
            id: 'practice_visible_setup_timing',
            label: '公开 setup 的兑现时机',
            detail: '练习在对手可读的情况下保存 payoff，等防御窗口错开。'
        },
        masteryBoundary: '熟练徽章和高光收藏只记录荣誉，不改变生命、伤害、抽牌、灵力、起手或匹配。'
    },
    shield_counter: {
        id: 'shield_counter',
        label: '守势反击',
        primaryDecisionAxis: '先把护盾转成反击，还是继续稳血拖到长局评分。',
        funHook: '被压迫时仍有反击目标，败方不只是被动挨打。',
        skillTest: '能否识别对手爆发后的空窗，把防御资源转成伤害。',
        publicWeakness: '收束慢，连续空防会让对手调息找到第二波压力。',
        swapSlots: [
            { id: 'shield_finisher_pair', label: '反击终结位', detail: '提高护盾后反打速度，避免只拖局。' },
            { id: 'shield_draw_pair', label: '续航位', detail: '提升长局稳定性，但降低前两手反压。' },
            { id: 'shield_setup_pair', label: '公开 setup 位', detail: '让护盾转攻有明确前兆，降低突然翻盘的不适感。' }
        ],
        practiceTopic: {
            id: 'practice_block_to_counter',
            label: '护盾转反击',
            detail: '练习在对手爆发后保留灵力，把防守窗口转成反压。'
        },
        masteryBoundary: '熟练徽章和高光收藏只记录荣誉，不改变生命、伤害、抽牌、灵力、起手或匹配。'
    },
    soft_control: {
        id: 'soft_control',
        label: '软控消耗',
        primaryDecisionAxis: '先限制对手节奏，还是先建立自己的公开消耗线。',
        funHook: '通过可读控制改变回合节奏，胜负不只看谁伤害更高。',
        skillTest: '能否把控制牌用于关键回合，而不是把灵力花在无收益拖延。',
        publicWeakness: '缺少爆发，面对回复或高护盾时容易进入无效拉扯。',
        swapSlots: [
            { id: 'control_finisher_pair', label: '终结补强位', detail: '补入稳定终结，防止控制后无法收束。' },
            { id: 'control_guard_pair', label: '生存位', detail: '增加前两手抗压能力，应对快攻。' },
            { id: 'control_setup_pair', label: '消耗标记位', detail: '让消耗来源更公开，方便双方判断节奏。' }
        ],
        practiceTopic: {
            id: 'practice_control_key_turn',
            label: '关键回合软控',
            detail: '练习把控制交给对手爆发前一手，而不是平均消耗。'
        },
        masteryBoundary: '熟练徽章和高光收藏只记录荣誉，不改变生命、伤害、抽牌、灵力、起手或匹配。'
    },
    low_hp_counter: {
        id: 'low_hp_counter',
        label: '低血反击',
        primaryDecisionAxis: '压低自身风险换爆发，还是提前止损稳住血线。',
        funHook: '低血线带来戏剧性反杀，但每次反击都有公开风险。',
        skillTest: '能否判断哪一回合可以卖血，哪一回合必须先防御。',
        publicWeakness: '被连续小伤害或超时拖住时，卖血窗口会变成失败窗口。',
        swapSlots: [
            { id: 'counter_heal_pair', label: '回复止损位', detail: '降低极端卖血风险，适合连续遇到快攻。' },
            { id: 'counter_burst_pair', label: '爆发兑现位', detail: '提高反杀速度，但更依赖手牌顺序。' },
            { id: 'counter_guard_pair', label: '护盾保底位', detail: '给低血回合留出一次可读防守。' }
        ],
        practiceTopic: {
            id: 'practice_low_hp_threshold',
            label: '低血阈值判断',
            detail: '练习在公开血线和灵力下判断该反击还是先稳血。'
        },
        masteryBoundary: '熟练徽章和高光收藏只记录荣誉，不改变生命、伤害、抽牌、灵力、起手或匹配。'
    },
    vulnerable_combo: {
        id: 'vulnerable_combo',
        label: '易伤组合',
        primaryDecisionAxis: '先挂易伤让对手有防守信息，还是等资源齐后一次兑现。',
        funHook: '组合成功有高光，但前兆公开，双方能围绕窗口互动。',
        skillTest: '能否在易伤被看见后骗出护盾，再用第二段兑现。',
        publicWeakness: '组合件被打断或调息找不到 payoff 时，防守能力偏低。',
        swapSlots: [
            { id: 'combo_guard_pair', label: '防守补位', detail: '牺牲少量上限，避免组合失败后被反杀。' },
            { id: 'combo_draw_pair', label: '找件位', detail: '提高组合完整度，但会暴露更多调息节奏。' },
            { id: 'combo_backup_pair', label: '备用终结位', detail: '让组合失败时仍有常规伤害路线。' }
        ],
        practiceTopic: {
            id: 'practice_combo_second_window',
            label: '组合第二窗口',
            detail: '练习易伤公开后等待下一手兑现，而不是同一窗口硬冲。'
        },
        masteryBoundary: '熟练徽章和高光收藏只记录荣誉，不改变生命、伤害、抽牌、灵力、起手或匹配。'
    },
    draw_midrange: {
        id: 'draw_midrange',
        label: '过牌中速',
        primaryDecisionAxis: '用调息找稳定路线，还是直接消耗资源换即时压力。',
        funHook: '每局都有不同资源路线，适合想持续优化手牌规划的玩家。',
        skillTest: '能否把过牌变成有效行动，而不是只让回合更慢。',
        publicWeakness: '爆发和防守都不极端，遇到专精谱时需要靠调度取胜。',
        swapSlots: [
            { id: 'midrange_burst_pair', label: '爆发补强位', detail: '提高终局速度，适合对抗回复消耗。' },
            { id: 'midrange_guard_pair', label: '稳血位', detail: '提高抗快攻能力，牺牲部分找牌速度。' },
            { id: 'midrange_setup_pair', label: '中局铺垫位', detail: '让过牌后的目标更明确。' }
        ],
        practiceTopic: {
            id: 'practice_draw_to_action',
            label: '过牌转行动',
            detail: '练习每次调息后都形成防御、setup 或伤害中的一个明确结果。'
        },
        masteryBoundary: '熟练徽章和高光收藏只记录荣誉，不改变生命、伤害、抽牌、灵力、起手或匹配。'
    },
    healing_attrition: {
        id: 'healing_attrition',
        label: '回复消耗',
        primaryDecisionAxis: '回复稳住长局，还是提前投入伤害避免资源耗尽。',
        funHook: '把濒危局面拉回可打状态，适合喜欢长线判断的玩家。',
        skillTest: '能否区分有效回复和拖慢失败，及时转入收束。',
        publicWeakness: '终结慢，若只回复不制造压力，会在长局评分或资源上落后。',
        swapSlots: [
            { id: 'healing_finisher_pair', label: '终结补强位', detail: '避免回复后无法结束对局。' },
            { id: 'healing_control_pair', label: '消耗控制位', detail: '减缓对手第二波压力。' },
            { id: 'healing_guard_pair', label: '前期稳血位', detail: '进一步降低快攻前两手风险。' }
        ],
        practiceTopic: {
            id: 'practice_heal_to_pressure',
            label: '回复后转压',
            detail: '练习在血线安全后立刻建立伤害或公开 setup。'
        },
        masteryBoundary: '熟练徽章和高光收藏只记录荣誉，不改变生命、伤害、抽牌、灵力、起手或匹配。'
    }
});

function getCard(cardId) {
    return RULES.cards && RULES.cards[cardId] ? RULES.cards[cardId] : null;
}

function getTags(cardId) {
    const card = getCard(cardId);
    return Array.isArray(card && card.tags) ? card.tags : [];
}

function getRoles(cardId) {
    const card = getCard(cardId);
    return Array.isArray(card && card.pvpRoles) ? card.pvpRoles : [];
}

function hasInteraction(cardId) {
    const card = getCard(cardId);
    const tags = getTags(cardId);
    return !!(card && card.block > 0) || tags.some(tag => ['defense', 'guard', 'heal', 'setup', 'draw', 'control', 'counter'].includes(tag));
}

function getLoadoutCardIds(loadout) {
    return Array.isArray(loadout && loadout.deck)
        ? loadout.deck.map(entry => String(entry && entry.id || '')).filter(Boolean)
        : [];
}

function summarizeLoadout(loadout) {
    const ids = getLoadoutCardIds(loadout);
    const counts = new Map();
    ids.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
    const uniqueIds = Array.from(counts.keys());
    const costBuckets = { zeroCost: 0, oneCost: 0, twoCost: 0, threePlusCost: 0 };
    let totalCost = 0;
    let directDamageCards = 0;
    let interactionCards = 0;
    const roleCoverage = ROLE_KEYS.reduce((acc, key) => ({ ...acc, [key]: false }), {});
    ids.forEach(id => {
        const card = getCard(id);
        const cost = Math.max(0, Math.floor(Number(card && card.cost) || 0));
        totalCost += cost;
        if (cost <= 0) costBuckets.zeroCost += 1;
        else if (cost === 1) costBuckets.oneCost += 1;
        else if (cost === 2) costBuckets.twoCost += 1;
        else costBuckets.threePlusCost += 1;
        if (card && card.damage > 0) directDamageCards += 1;
        if (hasInteraction(id)) interactionCards += 1;
        getRoles(id).forEach(role => {
            if (Object.prototype.hasOwnProperty.call(roleCoverage, role)) roleCoverage[role] = true;
        });
    });
    return {
        id: loadout.id,
        deckSize: ids.length,
        uniqueCards: uniqueIds.length,
        maxCopies: Math.max(0, ...Array.from(counts.values())),
        ...costBuckets,
        averageCost: ids.length > 0 ? Number((totalCost / ids.length).toFixed(2)) : 0,
        directDamageCards,
        interactionCards,
        roleCoverage
    };
}

function computeMaxMainDeckOverlapRate(loadouts = BASELINE_LOADOUTS) {
    let maxOverlap = 0;
    for (let i = 0; i < loadouts.length; i += 1) {
        const left = new Set(getLoadoutCardIds(loadouts[i]));
        for (let j = i + 1; j < loadouts.length; j += 1) {
            const right = new Set(getLoadoutCardIds(loadouts[j]));
            const overlap = Array.from(left).filter(id => right.has(id)).length;
            const denominator = Math.max(1, Math.min(left.size, right.size));
            maxOverlap = Math.max(maxOverlap, overlap / denominator);
        }
    }
    return Number(maxOverlap.toFixed(3));
}

function sanitizeProfile(profile) {
    const source = profile && typeof profile === 'object' ? profile : {};
    const swapSlots = Array.isArray(source.swapSlots) ? source.swapSlots : [];
    const practiceTopic = source.practiceTopic && typeof source.practiceTopic === 'object' ? source.practiceTopic : {};
    return {
        id: String(source.id || ''),
        label: String(source.label || ''),
        primaryDecisionAxis: String(source.primaryDecisionAxis || ''),
        funHook: String(source.funHook || ''),
        skillTest: String(source.skillTest || ''),
        publicWeakness: String(source.publicWeakness || ''),
        swapSlots: swapSlots.slice(0, 4).map(slot => ({
            id: String(slot && slot.id || ''),
            label: String(slot && slot.label || ''),
            detail: String(slot && slot.detail || '')
        })).filter(slot => slot.id && slot.label && slot.detail),
        practiceTopic: {
            id: String(practiceTopic.id || ''),
            label: String(practiceTopic.label || ''),
            detail: String(practiceTopic.detail || '')
        },
        masteryBoundary: String(source.masteryBoundary || '')
    };
}

function getLoadoutExplorationProfile(id) {
    return sanitizeProfile(LOADOUT_EXPLORATION_PROFILES[id] || null);
}

function buildLoadoutExplorationReport({ selectedLoadoutIds = [], limit = 4 } = {}) {
    const ids = Array.isArray(selectedLoadoutIds) && selectedLoadoutIds.length > 0
        ? selectedLoadoutIds
        : ['aggro_pressure', 'tempo_mark', 'shield_counter', 'soft_control'];
    const seen = new Set();
    const profiles = ids
        .map(id => String(id || ''))
        .filter(Boolean)
        .filter(id => {
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        })
        .map(getLoadoutExplorationProfile)
        .filter(profile => profile.id && profile.label)
        .slice(0, Math.max(1, Math.min(8, Math.floor(Number(limit) || 4))));
    return {
        reportVersion: 'pvp-live-loadout-exploration-v1',
        contentPackVersion: CONTENT_PACK_VERSION,
        sourceVisibility: 'public_content',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        title: '谱系探索',
        summary: '每套谱都给出公开弱点、替换方向和练习课题，鼓励下一局有目标地调整。',
        progressionBoundary: '熟练徽章与高光收藏只记录荣誉，不改变生命、伤害、抽牌、灵力、起手或匹配。',
        profiles
    };
}

function validateContentPack({ ruleVersion = RULE_VERSION } = {}) {
    const failures = [];
    const policyIds = new Set(BASELINE_BOT_POLICIES.map(policy => policy.id));
    const loadoutIds = new Set();
    const summaries = {};
    const roleCoverageByLoadout = {};
    BASELINE_LOADOUTS.forEach(loadout => {
        if (loadoutIds.has(loadout.id)) failures.push(`duplicate_loadout:${loadout.id}`);
        loadoutIds.add(loadout.id);
        if (!policyIds.has(loadout.botPolicyId)) failures.push(`missing_policy:${loadout.id}:${loadout.botPolicyId}`);
        const ids = getLoadoutCardIds(loadout);
        if (ids.length !== 20) failures.push(`invalid_deck_size:${loadout.id}:${ids.length}`);
        ids.forEach(id => {
            const card = getCard(id);
            if (!card) failures.push(`unknown_card:${loadout.id}:${id}`);
            if (card && Math.floor(Number(card.cost) || 0) <= 0) failures.push(`zero_cost_card:${loadout.id}:${id}`);
        });
        const summary = summarizeLoadout(loadout);
        summaries[loadout.id] = summary;
        roleCoverageByLoadout[loadout.id] = summary.roleCoverage;
        if (summary.maxCopies > 2) failures.push(`too_many_copies:${loadout.id}:${summary.maxCopies}`);
        if (summary.oneCost < 10) failures.push(`too_few_one_cost:${loadout.id}:${summary.oneCost}`);
        if (summary.directDamageCards > 10) failures.push(`too_many_direct_damage:${loadout.id}:${summary.directDamageCards}`);
        if (summary.interactionCards < 8) failures.push(`too_few_interaction:${loadout.id}:${summary.interactionCards}`);
        ROLE_KEYS.forEach(role => {
            if (!summary.roleCoverage[role]) failures.push(`missing_role:${loadout.id}:${role}`);
        });
        const profile = getLoadoutExplorationProfile(loadout.id);
        if (!profile.id) failures.push(`missing_exploration_profile:${loadout.id}`);
        if (!profile.primaryDecisionAxis) failures.push(`missing_primary_decision_axis:${loadout.id}`);
        if (!profile.funHook) failures.push(`missing_fun_hook:${loadout.id}`);
        if (!profile.skillTest) failures.push(`missing_skill_test:${loadout.id}`);
        if (!profile.publicWeakness) failures.push(`missing_public_weakness:${loadout.id}`);
        if (profile.swapSlots.length < 2 || profile.swapSlots.length > 4) failures.push(`invalid_swap_slots:${loadout.id}:${profile.swapSlots.length}`);
        if (!profile.practiceTopic.id || !profile.practiceTopic.label || !profile.practiceTopic.detail) failures.push(`missing_practice_topic:${loadout.id}`);
        if (!profile.masteryBoundary || /生命.*改变|伤害.*改变|抽牌.*改变|灵力.*改变|起手.*改变/.test(profile.masteryBoundary)) {
            failures.push(`invalid_mastery_boundary:${loadout.id}`);
        }
    });
    if (BASELINE_LOADOUTS.length !== 8) failures.push(`invalid_loadout_count:${BASELINE_LOADOUTS.length}`);
    if (BASELINE_BOT_POLICIES.length !== 8) failures.push(`invalid_policy_count:${BASELINE_BOT_POLICIES.length}`);
    const maxMainDeckOverlapRate = computeMaxMainDeckOverlapRate();
    if (maxMainDeckOverlapRate > 0.6) failures.push(`main_deck_overlap:${maxMainDeckOverlapRate}`);
    const summaryList = Object.values(summaries);
    return {
        reportVersion: 'pvp-live-content-pack-validation-v1',
        contentPackVersion: CONTENT_PACK_VERSION,
        ruleVersion,
        pass: failures.length === 0,
        failures,
        loadoutCount: BASELINE_LOADOUTS.length,
        policyCount: BASELINE_BOT_POLICIES.length,
        zeroCostCardCount: summaryList.reduce((sum, item) => sum + item.zeroCost, 0),
        maxSingleCardCopies: Math.max(0, ...summaryList.map(item => item.maxCopies)),
        minOneCostCards: Math.min(...summaryList.map(item => item.oneCost)),
        minInteractionCards: Math.min(...summaryList.map(item => item.interactionCards)),
        maxDirectDamageCards: Math.max(...summaryList.map(item => item.directDamageCards)),
        maxMainDeckOverlapRate,
        explorationProfileCount: BASELINE_LOADOUTS.filter(loadout => getLoadoutExplorationProfile(loadout.id).id).length,
        costCurveByLoadout: summaries,
        roleCoverageByLoadout
    };
}

function getBaselineLoadout(id) {
    return BASELINE_LOADOUTS.find(loadout => loadout.id === id) || null;
}

function getBaselinePolicy(id) {
    return BASELINE_BOT_POLICIES.find(policy => policy.id === id) || null;
}

function makeLoadoutCandidate(id) {
    const loadout = getBaselineLoadout(id);
    if (!loadout) return null;
    return {
        identitySlot: loadout.identitySlot,
        label: loadout.label,
        deck: loadout.deck.map(entry => ({ id: entry.id, upgraded: !!entry.upgraded }))
    };
}

module.exports = {
    CONTENT_PACK_VERSION,
    ROLE_KEYS,
    BASELINE_LOADOUTS,
    BASELINE_BOT_POLICIES,
    LOADOUT_EXPLORATION_PROFILES,
    getBaselineLoadout,
    getBaselinePolicy,
    getLoadoutExplorationProfile,
    getTags,
    getRoles,
    summarizeLoadout,
    validateContentPack,
    computeMaxMainDeckOverlapRate,
    buildLoadoutExplorationReport,
    makeLoadoutCandidate
};
