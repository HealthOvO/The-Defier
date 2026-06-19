# The Defier《逆命者》V10.0 真 PVP 首版内容包 V1

## 0. 文档定位

本文是 V10 真 PVP 的首版内容包，补齐“第一版到底开放哪些牌、哪些效果、哪些基准构筑、哪些仿真输入”。

阶段说明：本文冻结合法内容、构筑边界、仿真输入和体验门槛，不冻结具体源码文件、测试文件或目录落点。文中出现的 engine、validator、simulation、audit 等消费方只表示后续必须具备的能力，进入开发前仍需按最新仓库结构重新映射。

它不替代：

- `docs/designer_major_upgrade_planning_v8.md`
- `docs/designer_major_upgrade_requirements_v7.md`
- `docs/designer_major_upgrade_overall_plan_v1.md`

它只把主方案里的方向和合同细化为可被 `pvp-live-v1` engine、loadout validator、balance simulation、browser audit 直接消费的内容规格。

## 1. 当前卡池基线

基于当前 `js/data/cards.js`：

- 卡牌总数：217。
- 费用分布：`-1` 费 5 张，`0` 费 24 张，`1` 费 121 张，`2` 费 51 张，`3` 费 14 张，`4` 费 2 张。
- 当前效果类型已经包含 50+ 类，包括基础 `damage / block / draw / energy / heal`，也包括 PVP 高风险的 `discardHand / discardRandom / consumeAllEnergy / damagePerCard / drawCalculated / echoLastPlayedCard / createCard / randomCards / swapHpPercent`。
- 当前 buff 类型包含 `extraTurn / stun / dodge / dodgeChance / oathDebt / retainBlock / strength / vulnerable / weak / thorns / damageReduction` 等。

设计结论：

1. `pvp-live-v1` 不能直接开放全卡池。
2. 首版内容包不开放 0 费牌。需求文档里的“0 费上限”保留为 validator 框架能力，但首版 `pvp_legal_cards` 快照中 0 费合法牌数量为 0。
3. 首版先用 8 套基准斗法谱覆盖主要对局生态，等 engine、回放、仿真和 UI 全链路稳定后，再扩展合法牌池。
4. 当前 `GhostEnemy`、`PVPService` 残影演武和练习 AI 只能作为旧实现参考，不能作为 V10 排位结算来源。真 PVP 必须由新的服务端 reducer 对称结算，所有跨回合 buff、抽牌、能量、伤害预算和死亡判定都以服务端事件日志为准。

## 2. 首版设计目标

### 2.1 玩家体验目标

每一局都要满足：

- 起手能看懂对方大致方向。
- 双方首回合都有行动权。
- 高爆发必须先给公开 setup。
- 失败后能从复盘看出关键节点，而不是只看到“对方先手秒了我”。
- 每套构筑都有明确优势、短板和可被反制的窗口。

### 2.2 对局节奏目标

| 项 | 目标 |
| --- | --- |
| 平均回合数 | 6-9 整轮 |
| 快攻最快有效击杀 | 第 4 整轮后 |
| 控制最晚收束 | 第 14 整轮强制判定前 |
| 单回合决策点 | 2-4 个 |
| 首回合额外抽牌 | 0 |
| 首回合额外灵力 | 0 |
| 前两次行动窗口击杀保护 | 必须开启 |

### 2.3 构筑生态目标

首版不追求全职业、全流派、全 PVE 继承。首版只证明真人 PVP 的竞技骨架成立：

- 快攻能给压力，但不能一回合斩杀。
- 护盾和治疗能稳定对局，但不能无限拖。
- 控制能降低爆发，但不能让对方整回合无事可做。
- 连击能有爽点，但必须通过可见 setup 和预算限制。
- 低血反杀能制造戏剧性，但不能靠不可读乘区偷局。

### 2.4 构筑健康与复杂度预算

首版基准谱要避免两种相反问题：一是强度不平衡，二是所有谱都被少数泛用牌收束成同一种打法。

每套基准谱必须保留五类角色位：

| 角色位 | 目的 | 最低要求 |
| --- | --- | --- |
| 开局行动 | 起手有事可做，减少空过 | 至少 10 张 1 费牌 |
| 防御 / 恢复 | 让双方能活到互动回合 | 至少 4 张护盾、治疗、弱化或净化类牌 |
| 公开 setup | 让爆发可读、可反制 | 至少 2 张能产生破绽、易伤、虚弱、流血或其他公开信号的牌 |
| 收束手段 | 避免只拖不赢 | 至少 4 张能在第 4 整轮后推进终局的伤害或反击牌 |
| 调整空间 | 让复盘建议能落到换牌 | 至少 4 张可以被同风格替换的非核心牌 |

复杂度预算：

- 新玩家推荐谱同屏只展示 3 个关键词：打法、优势、弱点。
- 首战推荐谱优先使用 1-2 个公开状态，不堆叠 3 个以上持续追踪机制。
- 单套基准谱不能依赖隐藏信息、随机闪避、随机造牌或不可复现检索作为核心爽点。
- 过牌和回灵只作为手感润滑，不得形成“抽牌 -> 回灵 -> 再抽牌”的循环引擎。

通用牌压力监控：

- 任一卡牌出现在 5 套或更多基准谱中，必须标记为 `staple_watch`，说明它是基础工具牌还是过强必带牌。
- 任一卡牌出现在 7 套或更多基准谱中，不能直接封板，必须给出替换方案或降低该牌泛用性。
- 当前基线中 `surgeStep` 出现在 5 套基准谱，应进入 `staple_watch`；`defend`、`shieldBash`、`tacticalExpose` 各出现在 4 套，暂不阻断，但仿真报告必须继续展示它们的使用面。

`staple_watch` 升级矩阵：

| 状态 | 进入条件 | 处理 |
| --- | --- | --- |
| `observe` | 出现在 4 套基准谱，且抽到胜率提升 `<0.02` | 继续展示使用面，不阻断 |
| `staple_watch` | 出现在 5-6 套基准谱，或抽到胜率提升 `>=0.02` | 必须给替换卡位、保留率和替换后胜率变化 |
| `block_release` | 出现在 7 套或更多基准谱，或抽到胜率提升 `>=0.04`，或替换后胜率下降 `>=0.03` | 不能封板，必须削弱、拆分功能或提高替换选择 |

元环境健康目标：

- 8 套构筑的综合胜率不能只靠压平数值达标；每套都必须有明确优势、弱点和复盘可解释的反制窗口。
- 任意单套综合胜率 >55% 或 <45% 都需要调参或替换卡位。
- 若某套构筑对 5 套或更多对手都保持 >53% 胜率，视为潜在主宰构筑，即使总先后手胜率达标也不能封板。
- 若某套构筑对 5 套或更多对手都低于 47% 胜率，视为假流派，不能作为新玩家推荐谱。
- 每套构筑至少要有 1 个公开可解释的优势对局和 1 个公开可解释的劣势对局；若定位为均衡锚点，必须说明它为什么不吞并其他谱。

构筑身份差异门槛：

| 指标 | 阻断阈值 | 说明 |
| --- | --- | --- |
| `primaryDecisionAxis` | 每套必须唯一或显著不同 | 不能只靠同质中立牌 + 小数值身份槽区分 |
| `mainDeckOverlapRate` | 任意两套主推谱重合度 `>0.60` 时必须降为同 archetype 分支或替换卡位 | 防止首发 8 套只是换标签 |
| `turnPlanSimilarity` | 任意泛用牌让 3 个或更多 archetype 前 3 轮计划趋同时阻断 | `staple_watch` 同时看强度和身份抹平风险 |
| `whyMainThisLoadout` | 每套必须有一句玩家可感知的主玩理由 | 回答“为什么我玩它而不是隔壁那套” |
| `swapSlotImpact` | 替换 2-4 张卡后必须能改变至少一个对局计划或弱点 | 防止复盘建议只是换皮 |

生态克制图合同：

| 字段 | 要求 |
| --- | --- |
| `pairWinRate` | 每个有序对至少 500 局样本；`>0.53` 记为优势边，`<0.47` 记为劣势边 |
| `publicInteractionAxis` | 优劣势必须能用公开机制解释，例如护盾、净化、易伤、公开 setup、拖局收束 |
| `representativeReplaySeed` | 每条核心优势 / 劣势边至少 1 个可复现 seed |
| `newPlayerRecommendation` | 新玩家推荐谱不能是无优势、无反制解释或对 5 套或更多对手低于 47% 的假流派 |

## 3. `pvp-live-v1` 效果白名单

### 3.1 首版直接支持

这些效果可以进入首版合法牌池：

| effect.type | 支持方式 |
| --- | --- |
| `damage` | 基础伤害，受预算、易伤、破绽和单效果上限 |
| `block` | 基础护盾，受单次护盾上限；首版排位不使用跨回合留盾牌 |
| `draw` | 额外抽牌，每回合额外抽牌上限 +3；首版合法牌中没有 0 费抽牌 |
| `energy` | 额外灵力，每回合额外灵力上限 +2；首版合法牌中没有 0 费回灵 |
| `heal` | 回复生命，单回合有效回复上限 12 |
| `selfDamage` | 自伤，不能在同一回合触发低血增伤乘区 |
| `applyMark` | 公开破绽，转为额外平伤 setup |
| `applyBleed` | 公开流血，持续伤害仍受回合预算 |
| `debuff:vulnerable` | 易伤，上限 2 |
| `debuff:weak` | 虚弱，可降低下一次伤害或作为费用税转写 |
| `debuff:poison` | 中毒，首版按公开持续伤害处理 |
| `buff:strength` | 只允许本回合临时力量，永久力量禁用 |
| `buff:thorns` | 荆棘，单次返伤上限 8 |
| `cleanse` | 净化负面状态，上限 2 层 |
| `penetrate` | 穿透，单效果玩家伤害上限 10 |
| `conditionalDamage` | 条件额外伤害，首版只允许公开 `marked` / `lowHp` setup，且必须由服务端 reducer 原生判断 |
| `executeDamage` | 处决伤害，阈值不低于 30%，受预算 |

### 3.2 首版转写支持

这些效果可以在 engine 中实现，但首版内容包只少量使用或不直接开放：

| effect.type / buffType | 转写 |
| --- | --- |
| `damageAll` | 首版没有召唤物，对玩家按单目标 `damage` 处理 |
| `removeBlock` | 可实现，但首版合法牌池不开放 |
| `blockBurst` | 可实现，但首版合法牌池不开放 |
| `percentDamage` | 转固定伤害，上限 10 |
| `lifeSteal` | 转 `damage + heal`，回复不超过造成伤害 30% |
| `conditionalDraw` | 转 `draw`，受额外抽牌上限 |
| `drawCalculated` | 转固定 `draw 1` 或禁用，首版合法牌池不开放 |
| `consumeAllEnergy` | 转每点灵力固定伤害，但首版合法牌池不开放 |
| `buff:nextTurnBlock` / `buff:retainBlock` | 只用于 engine 单测或后续赛季；首版排位不开放，避免沿用旧 Ghost 的非对称护盾生命周期 |
| `setStance` | 可转为公开 stance 状态；首版合法牌池不开放 |
| `burn` / `paralysis` | 转公开持续伤害或费用税，不跳过回合 |

### 3.3 首版禁用

这些效果不进入 `pvp_legal_cards`：

| 效果 | 禁用原因 |
| --- | --- |
| 0 费回灵 / 0 费抽牌 | 容易打破资源曲线，制造先手爆发 |
| `discardHand` | 整手牌否定会造成非游戏体验 |
| `discardRandom` 作用于对手 | 不可读且会破坏最低行动权 |
| `echoLastPlayedCard` | 复制链容易突破单卡预算 |
| `createCard` / `randomCards` | 首版会扩大规则面和 UI 复杂度 |
| `swapHpPercent` | 直接绕过正常攻防 |
| `extraTurn` | 完整回合剥夺 |
| `stun` | 首版禁用硬控，统一转弱化或费用税 |
| `dodge` / `dodgeChance` | 胜负不可读，复盘体验差 |
| `oathDebt` 无限清算 | 容易形成隐性蓄爆 |
| `matrixGuardSignal` / `matrixBreakSignal` / `matrixCleanseSignal` | 依赖专属信号消费链，首版不引入 |
| `ringExp` / `bonusGold` / `gainMerit` / `gainSin` | 战斗内不结算局外资源 |

## 4. 首版合法牌池

### 4.1 核心合法牌

首版 `pvp_legal_cards` 至少包含以下卡牌。所有牌均来自当前 `js/data/cards.js`。

| 角色 | card ids |
| --- | --- |
| 基础攻击 | `strike`, `quickSlash`, `doubleStrike`, `heavyStrike`, `shieldBash`, `battleCry`, `tripleSlash` |
| 基础防御 | `defend`, `ironWill`, `innerPeace`, `goldenBell`, `omenBarrier` |
| 破绽节奏 | `punctureMark`, `tacticalExpose`, `guardedRiposte`, `duetFeint`, `poisedCounter`, `razorFocus`, `focusBreak`, `verdictNeedle`, `chainArc`, `ionReserve`, `surgeStep`, `thunderLattice`, `skybreakerArray`, `starNeedle` |
| 流血压制 | `bloodlettingSlash`, `crimsonCascade`, `coagulatedGuard`, `sunderingNeedle` |
| 护盾反击 | `reboundingShell`, `aegisJudgement`, `artifactBolt`, `monkStrike`, `wardingHerb`, `ironBreath` |
| 控制弱化 | `lightningProbe`, `stormWard`, `iceFreeze`, `doubleEdge`, `poisonTouch`, `bloodBlessing`, `ironBreath`, `healingTouch` |
| 治疗消耗 | `mendThread`, `transfuseStrike`, `wardingHerb`, `renewalChord`, `rebirthSpiral`, `bloodBloom`, `reversalPulse`, `thornedRemedy`, `minorHeal` |
| 斩杀测试 | `swordBreaker`, `finishingBlow`, `defianceStrike` |

### 4.2 首版不开放但保留实现测试的牌

这些牌可用于 engine 单测或后续赛季，但不进入首版排位合法快照：

- `spiritBoost`
- `meditation`
- `hunterSeal`
- `bloodDebt`
- `recklessMulligan`
- `recirculation`
- `calculatedRuin`
- `oblivionSpiral`
- `finalConvergence`
- `fortuneWheel`
- `timeStasis`
- `reverberantEdge`
- `mirroredRecital`
- `echoVault`
- `abyssalReflection`
- `debtTribunal`
- `sentenceOfPenance`
- `mirrorWall`
- `guardianMantra`
- `ironSkin`

原因：它们覆盖 0 费资源、整手牌改写、弃牌、复制、随机生成、额外回合、债账清算、跨回合留盾等高风险机制。engine 可以提前有转写或拒绝能力，但排位内容不先开放。

### 4.3 首发内容包边界

首发只开放以下 5 个内容流派与 3 套系统基准：

- `hemorrhage`：流血压制。
- `precision`：破绽节奏。
- `stormcraft-lite`：雷策轻量连击。
- `vitalweave-lite`：治疗消耗与低血反打。
- `bulwark-lite`：护盾反击。
- `aggro_pressure` / `draw_midrange` / `soft_control`：系统基准构筑。

以下流派不进入首发排位合法池，只能做后续赛季或 engine 单测：

- `entropy`：弃牌、换手和资源重排过多。
- `mirrorweave`：回响复制链尚未进入服务端白名单。
- `cursebound`：状态牌注入会扩大规则面和 UI 负担。
- `oathbound`：誓债清算存在隐性蓄爆。
- `soulforge`：造牌体系会破坏首版可复现仿真。

## 5. 8 套基准斗法谱

通用规则：

- 每套正好 20 张。
- 单卡最多 2 张。
- 0 费牌 0 张。
- 至少 10 张 1 费牌。
- 直接伤害牌最多 10 张。
- 至少 8 张防御、治疗、过牌、弱化、破绽或其他非纯伤害交互牌。
- 每套只使用 1 个 PVP 身份槽。

### 5.1 快攻压迫 `aggro_pressure`

体验目标：连续小伤害制造压力，但必须依靠多回合推进，不能首回合秒杀。

```json
{
  "id": "aggro_pressure",
  "label": "快攻压迫",
  "identitySlot": "pvp_fate_starter_stable",
  "deck": [
    "quickSlash", "quickSlash",
    "doubleStrike", "doubleStrike",
    "strike", "strike",
    "shieldBash", "shieldBash",
    "battleCry", "battleCry",
    "defend", "defend",
    "innerPeace", "innerPeace",
    "surgeStep", "surgeStep",
    "ionReserve", "ionReserve",
    "omenBarrier", "omenBarrier"
  ]
}
```

优势：起手顺、行动多、对慢速构筑有压力。
弱点：单卡伤害低，遇到护盾和治疗会被拖入资源战。
仿真观察：不能在后手首次行动前造成致死；对治疗消耗胜率不得高于 55%。

### 5.2 节奏破绽 `tempo_mark`

体验目标：通过破绽 setup 获得节奏优势，让爆发有可见前兆。

```json
{
  "id": "tempo_mark",
  "label": "节奏破绽",
  "identitySlot": "pvp_path_mark_reader",
  "deck": [
    "chainArc", "chainArc",
    "duetFeint", "duetFeint",
    "focusBreak", "focusBreak",
    "lightningProbe", "lightningProbe",
    "skybreakerArray", "skybreakerArray",
    "surgeStep", "surgeStep",
    "stormWard", "stormWard",
    "tacticalExpose", "tacticalExpose",
    "razorFocus", "razorFocus",
    "defend", "defend"
  ]
}
```

优势：可通过破绽把小伤害转成中段爆发。
弱点：破绽被净化或无法接上 payoff 时，输出低于快攻。
仿真观察：高伤害必须发生在破绽公开后的下一行动窗口。

### 5.3 护盾反击 `shield_counter`

体验目标：防守不是纯拖延，而是用护盾和小反击创造反打窗口。

```json
{
  "id": "shield_counter",
  "label": "护盾反击",
  "identitySlot": "pvp_vow_guardian_oath",
  "deck": [
    "shieldBash", "shieldBash",
    "reboundingShell", "reboundingShell",
    "artifactBolt", "artifactBolt",
    "aegisJudgement", "aegisJudgement",
    "monkStrike", "monkStrike",
    "defend", "defend",
    "ironWill", "ironWill",
    "goldenBell", "goldenBell",
    "wardingHerb", "wardingHerb",
    "ironBreath", "ironBreath"
  ]
}
```

优势：抗快攻、行动线稳定。
弱点：缺少直接收束，遇到治疗消耗和控制时容易进入第 14 整轮公开多指标判定。
仿真观察：第 14 整轮后仍未结束必须为 0。

### 5.4 控制弱化 `soft_control`

体验目标：控制表现为弱化、净化、阻滞和可读费用压力，不出现整回合剥夺。

```json
{
  "id": "soft_control",
  "label": "控制弱化",
  "identitySlot": "pvp_path_soft_lock",
  "deck": [
    "lightningProbe", "lightningProbe",
    "iceFreeze", "iceFreeze",
    "poisonTouch", "poisonTouch",
    "stormWard", "stormWard",
    "ironBreath", "ironBreath",
    "healingTouch", "healingTouch",
    "bloodBlessing", "bloodBlessing",
    "surgeStep", "surgeStep",
    "tacticalExpose", "tacticalExpose",
    "omenBarrier", "omenBarrier"
  ]
}
```

优势：能压制爆发和低血反杀。
弱点：伤害密度低，对护盾反击收束慢。
仿真观察：不能出现后手首行动开始时无可行动线。

### 5.5 低血反杀 `low_hp_counter`

体验目标：制造“残血反打”的戏剧性，但所有低血收益必须延迟到第 2 回合后。

```json
{
  "id": "low_hp_counter",
  "label": "低血反杀",
  "identitySlot": "pvp_fate_last_breath",
  "deck": [
    "defianceStrike", "defianceStrike",
    "bloodBloom", "bloodBloom",
    "transfuseStrike", "transfuseStrike",
    "reversalPulse", "reversalPulse",
    "doubleEdge", "doubleEdge",
    "wardingHerb", "wardingHerb",
    "renewalChord", "renewalChord",
    "mendThread", "mendThread",
    "innerPeace", "innerPeace",
    "ironBreath", "ironBreath"
  ]
}
```

优势：中后段能从低血状态反打。
弱点：前两回合被预算限制，且自伤会给对手收束机会。
仿真观察：低血增伤不能在自伤同回合直接触发高爆发。

### 5.6 易伤连击 `vulnerable_combo`

体验目标：让连击玩家能通过易伤和破绽规划爆发，但每次爆发都可被对手看见。

```json
{
  "id": "vulnerable_combo",
  "label": "易伤连击",
  "identitySlot": "pvp_path_stormcraft_t1",
  "deck": [
    "lightningProbe", "lightningProbe",
    "doubleEdge", "doubleEdge",
    "focusBreak", "focusBreak",
    "verdictNeedle", "verdictNeedle",
    "chainArc", "chainArc",
    "stormWard", "stormWard",
    "surgeStep", "surgeStep",
    "tacticalExpose", "tacticalExpose",
    "razorFocus", "razorFocus",
    "defend", "defend"
  ]
}
```

优势：对慢速牌组有强中期爆发。
弱点：需要先铺易伤 / 破绽，且被弱化、净化、护盾克制。
仿真观察：单回合超过 30 点玩家伤害前，上一行动窗口必须已有公开 setup。

### 5.7 过牌中速 `draw_midrange`

体验目标：用 1 费过牌和中等伤害保持手牌质量，但不形成 0 费循环。

```json
{
  "id": "draw_midrange",
  "label": "过牌中速",
  "identitySlot": "pvp_fate_hand_sculpt",
  "deck": [
    "chainArc", "chainArc",
    "skybreakerArray", "skybreakerArray",
    "doubleStrike", "doubleStrike",
    "heavyStrike", "heavyStrike",
    "shieldBash", "shieldBash",
    "tacticalExpose", "tacticalExpose",
    "surgeStep", "surgeStep",
    "thunderLattice", "thunderLattice",
    "renewalChord", "renewalChord",
    "omenBarrier", "omenBarrier"
  ]
}
```

优势：手牌稳定，不容易空过。
弱点：爆发不如易伤连击，防御不如护盾反击。
仿真观察：额外抽牌每回合不得超过 +3，且不能出现无限循环。

### 5.8 治疗消耗 `healing_attrition`

体验目标：提供慢速消耗和恢复体验，但通过第 14 整轮公开多指标判定防止无限拖局。

```json
{
  "id": "healing_attrition",
  "label": "治疗消耗",
  "identitySlot": "pvp_vow_lifebound_t1",
  "deck": [
    "rebirthSpiral", "rebirthSpiral",
    "transfuseStrike", "transfuseStrike",
    "thornedRemedy", "thornedRemedy",
    "shieldBash", "shieldBash",
    "monkStrike", "monkStrike",
    "healingTouch", "healingTouch",
    "bloodBlessing", "bloodBlessing",
    "renewalChord", "renewalChord",
    "wardingHerb", "wardingHerb",
    "minorHeal", "minorHeal"
  ]
}
```

优势：对快攻和低血反杀有较好耐受。
弱点：爆发弱，遇到破绽节奏会被逐步压低。
仿真观察：P95 对局时长必须 <= 12 分钟，P99 必须 <= 15 分钟。

## 6. 首版 PVP 身份槽

身份槽只提供风格，不提供局外数值碾压。首版每套构筑只能选择一个。

| id | 名称 | 效果 | 限制 |
| --- | --- | --- | --- |
| `pvp_fate_starter_stable` | 稳手命格 | 调息换牌时可多看 1 张候选牌，但仍最多换回 2 张 | 不额外抽牌 |
| `pvp_path_mark_reader` | 观破命途 | 每回合第一次施加破绽时，额外 +1 破绽 | 单回合最多触发 1 次 |
| `pvp_vow_guardian_oath` | 守誓 | 开场获得 4 普通护盾 | 不可与后手护印合并转伤 |
| `pvp_path_soft_lock` | 制衡命途 | 每局第一次施加虚弱时，额外 +1 虚弱 | 不跳过回合 |
| `pvp_fate_last_breath` | 残息命格 | 第 2 回合后，首次低于 40% 生命时获得 6 护盾 | 不加伤害 |
| `pvp_path_stormcraft_t1` | 雷策命途 | 每回合第一次命中易伤目标时伤害 +1 | 计入伤害预算 |
| `pvp_fate_hand_sculpt` | 整序命格 | 每局第一次回合结束时若手牌为 0，抽 1 | 每局 1 次 |
| `pvp_vow_lifebound_t1` | 生誓 | 每回合第一次治疗时额外 +1 生命 | 单回合最多 +1 |

这些身份槽的共同约束：

- 不能提供首回合额外灵力。
- 不能提供首回合额外抽牌。
- 不能提供首击大额增伤。
- 不能提供额外回合。
- 不能读取 PVE 真实 tier。

## 7. Bot 策略基线

平衡仿真不需要复杂 AI，首版使用确定性策略，保证可复现。

### 7.1 通用优先级

每个 bot 在自己的行动阶段按以下顺序评估：

1. 如果存在服务端可验证的致胜行动，且不违反伤害预算，执行致胜行动。
2. 如果本回合结束后预计会被击杀，优先打出防御、治疗、虚弱或护盾牌。
3. 如果手牌有公开 setup 和 payoff，先打 setup，再打 payoff。
4. 如果灵力不足以打出关键牌，优先打出合法回灵牌。
5. 如果手牌会溢出或行动线不足，优先打出 1 费过牌 / 护盾牌。
6. 如果无法获得收益，结束回合。

### 7.2 Archetype 个性

| botPolicy | 偏好 |
| --- | --- |
| `aggro_pressure` | 优先伤害，其次 1 费护盾，低保留 |
| `tempo_mark` | 先破绽，后 `conditionalDamage` |
| `shield_counter` | 生命低于 70% 时优先护盾，保留反击牌到对手有 setup |
| `soft_control` | 优先弱化 / 净化高爆发 setup |
| `low_hp_counter` | 第 2 回合前不主动压低自身生命到 40% 以下 |
| `vulnerable_combo` | 易伤和破绽同时存在时才打高影响牌 |
| `draw_midrange` | 保持手牌 3-6 张，避免空手 |
| `healing_attrition` | 生命低于 65% 时优先治疗，否则打中等伤害 |

## 8. 平衡仿真输入

### 8.1 固定对阵矩阵

8 套构筑两两对阵，每个有序对至少 500 局：

```text
8 archetypes * 8 archetypes * 500 = 32,000 matches
```

这高于需求文档的 10,000 局最低线，作为首版本地门禁目标。若运行时间过长，开发中可用 10,000 局 quick gate，封板前必须跑 32,000 局 full gate。

### 8.2 Opening Script 压测

额外生成 10,000 组开局脚本，覆盖：

- 先手抽到 3 张以上攻击牌。
- 先手抽到 2 张 setup + 1 张 payoff。
- 后手没有防御牌。
- 后手只有 2 费牌。
- 双方都抽到治疗 / 护盾。
- 低血反杀牌组起手自伤过多。
- 过牌中速起手 3 张过牌。
- 控制弱化起手 2 张弱化。

每组脚本必须记录：

```json
{
  "seed": "pvp-live-v1-opening-00001",
  "firstSeat": "A",
  "loadoutA": "aggro_pressure",
  "loadoutB": "shield_counter",
  "forcedOpeningA": ["quickSlash", "doubleStrike", "battleCry", "defend", "surgeStep"],
  "forcedOpeningB": ["innerPeace", "defend", "ironWill", "stormWard", "omenBarrier"],
  "expected": {
    "secondSeatActsBeforeDeath": true,
    "noDeadActionLine": true,
    "damagePreventedByBudgetAllowed": true
  }
}
```

### 8.3 必须输出的报告字段

`tests/sanity_pvp_live_balance_simulation_checks.cjs` 至少输出：

| 字段 | 说明 |
| --- | --- |
| `totalMatches` | 总局数 |
| `firstSeatWinRate` | 先手胜率 |
| `pairWinRates` | 每个有序对胜率 |
| `archetypeWinRates` | 每套综合胜率 |
| `secondSeatDeathBeforeActionCount` | 后手首次行动前死亡次数 |
| `secondSeatDeadActionLineCount` | 后手首次行动无行动线次数 |
| `damagePreventedByBudgetCount` | 预算拦截次数 |
| `p95DurationMinutes` | P95 时长 |
| `p99DurationMinutes` | P99 时长 |
| `matchesAfterRound14` | 第 14 整轮后仍未结束局数 |
| `topRejectedActionReasons` | 高频 reject 原因 |
| `costCurveByLoadout` | 每套构筑的 0/1/2/3+ 费用分布和平均费用 |
| `roleCoverageByLoadout` | 每套构筑的开局、防御、公开 setup、收束、调整空间覆盖情况 |
| `staplePressure` | 出现在多套构筑中的泛用牌、使用面和是否进入 `staple_watch` |
| `archetypeSpread` | 每套构筑的优势对局数、劣势对局数和是否主宰或假流派 |
| `complexityBudgetViolations` | 推荐谱关键词、公开状态数量、循环引擎等复杂度违规 |
| `playDrawQualityByLoadout` | 每套构筑镜像局先后手胜率差、调息后首个真实行动窗口的有效行动率、身份槽对先后手偏差 |
| `burstCounterplay` | 中高爆发、两回合爆发、setup 到 payoff 之间是否经过对手完整应对窗口 |
| `softLockPressure` | 连续低自主回合、仅剩防御 / 结束回合窗口数、控制镜像最长低交互链 |
| `resourceConsistency` | 平均手牌数、`draw_capped` 频率、牌库抽空回合、每回合可行动作数、重复开局簇占比 |
| `metagamePredatorPrey` | 每套基准谱的优势 / 劣势对局、公开克制轴和代表 replay seed |
| `stapleUplift` | `staple_watch` 卡牌的留牌率、抽到胜率提升、替换后胜率变化和镜像出现率 |
| `actualComplexityLoad` | 平均可打分支数、P95 公开状态节点数、拒绝码理解成本和首败复盘认知负荷 |
| `experienceFairness` | 非游戏局、控制锁死、不可读爆发、有效选择低分位和败因解释覆盖率 |
| `longestReplaySeed` | 最长局 seed |
| `largestBurstReplaySeed` | 最大爆发局 seed |

## 9. 首版 UI 体验样例

### 9.1 匹配卡片

玩家在 `天命排位` tab 看到：

- 当前使用的斗法谱名称。
- 8 套基准风格之一或自定义斗法谱标签。
- 规则版本 `pvp-live-v1`。
- “真人排位，服务端裁定”标记。
- “残影演武为练习，不进入排位”标记。

### 9.2 对局 HUD

必须显示：

- 我方生命 / 护盾 / 灵力 / 手牌 / 抽牌堆 / 弃牌堆。
- 对方生命 / 护盾 / 灵力 / 手牌数 / 抽牌堆数量 / 弃牌堆数量。
- 当前回合归属。
- 伤害预算状态：双方前两次行动窗口显示“护命预算生效”。
- 公开 setup：破绽、易伤、虚弱、流血、低血触发冷却。
- 最近 5 条公开事件。

### 9.3 行动反馈

每次行动都要有三类反馈：

1. 本地 pending：按钮进入等待态，不允许重复点击。
2. 服务端 ack：展示消耗、伤害、抽牌、状态变化。
3. 服务端 reject：展示明确原因，例如 `insufficient_energy`、`invalid_target`、`not_your_turn`。
4. 预算命中：行动仍为 ack，展示公开 `budget_clamped` 事件、原始伤害、实际伤害和截断原因。

### 9.4 赛后复盘

复盘必须至少回答：

- 谁在第几回合建立优势。
- 哪一次预算拦截防止了非游戏击杀。
- 哪个公开 setup 导致了最大伤害。
- 失败方下一局可调整的方向：补防御、降低曲线、减少自伤、增加净化、减少纯伤害牌。

## 10. 实施映射建议

### 10.1 数据责任

本文只冻结数据责任，不冻结具体保存位置。若后续实施计划沿用当前建议结构，可以映射为：

```text
server/pvp-live/content/pvp-live-v1-cards.js
server/pvp-live/content/pvp-live-v1-loadouts.js
server/pvp-live/content/pvp-live-v1-identities.js
server/pvp-live/content/pvp-live-v1-bots.js
```

无论最终文件名如何变化，都必须保留以下四类内容责任：

- 合法牌快照、禁用原因、转写策略。
- 8 套基准斗法谱和校验工具。
- 8 个 T1 身份槽。
- 仿真 bot priority 策略。

### 10.2 测试责任

本文只冻结测试责任，不冻结具体测试文件名。若后续实施计划沿用当前建议结构，可以映射为：

```text
tests/sanity_pvp_live_content_pack_checks.cjs
tests/sanity_pvp_live_balance_simulation_checks.cjs
tests/sanity_pvp_live_rules_checks.cjs
```

内容包校验必须覆盖：

- 8 套 loadout 都正好 20 张。
- 所有卡牌存在于当前 `CARDS`。
- 单卡复制不超过 2。
- 每套 0 费牌数量为 0。
- 每套直接伤害牌数量不超过 10。
- 每套非纯伤害交互牌数量不少于 8。
- 每套至少 10 张 1 费牌。
- 每套角色位覆盖开局行动、防御 / 恢复、公开 setup、收束手段和调整空间。
- 任一卡牌出现在 5 套或更多基准谱时输出 `staple_watch`，出现在 7 套或更多时阻断封板。
- 推荐谱复杂度不超过 3 个关键词和 2 个主要公开状态。
- 每套只绑定 1 个身份槽。
- 所有身份槽不提供首回合额外抽牌、首回合额外灵力、额外回合或大额首击增伤。
- 每套必须进入生态克制图，并提供至少 1 条优势边、1 条劣势边或明确的均衡锚点说明。
- `staple_watch` 卡牌必须输出留牌率、抽到胜率提升、替换后胜率变化和镜像出现率。
- 任意两套主推谱主牌重合度超过 `0.60` 时，必须降级为同 archetype 分支或重做其中一套。
- 每套必须有 `primaryDecisionAxis`、`whyMainThisLoadout`、`swapSlotImpact` 和 `practiceTopic`。
- `staple_watch` 卡牌如果抹平 3 个或更多 archetype 的前 3 轮回合计划，也必须阻断封板。

## 11. 内容包完成定义

首版内容包可进入实现，必须同时满足：

1. `pvp_legal_cards` 快照只包含本文开放牌。
2. 8 套基准斗法谱可被 `validatePvpLoadout` 全部接受。
3. 被禁用牌进入排位时返回 machine contract 中的 `card_disabled`。
4. 所有 0 费牌在首版排位中被拒绝。
5. 8 套构筑两两仿真满足先手胜率、对局时长、后手行动权和无第 14 整轮残留要求。
6. 8 套构筑都通过角色位覆盖、复杂度预算和通用牌压力监控。
7. 没有主宰构筑、假流派或必须携带的过强泛用牌。
8. UI 能显示斗法谱标签、身份槽、规则版本、预算拦截和复盘建议。
9. 旧残影练习不读取本文 loadout 作为正式排位结算来源。
10. 体验公平报告证明没有非游戏局、软锁死、不可读爆发或无解释败因；每套镜像局都有先后手差异和代表 replay。
11. 资源节奏报告证明前 3 轮不脚本化，同构筑镜像仍有足够分支熵。
12. 流派探索审计证明 8 套主推谱不是同一骨架换标签，且每套都有主玩理由、技能测试和替换卡位。
