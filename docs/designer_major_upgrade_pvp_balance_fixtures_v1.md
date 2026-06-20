# The Defier《逆命者》V10.0 真 PVP 平衡 Fixture 合同 V1

## 0. 文档定位

本文定义 V10 真 PVP 首版平衡仿真的证据结构、JSON schema、golden case、报告字段和失败判定。

阶段说明：截至 2026-06-19，fixture 路径已随 S2-B artifact foundation 冻结。后续可以新增生成脚本或报告目录，但不得静默迁移下列四个输入 fixture 和主报告路径；如确需迁移，必须同步更新 artifact contract、测试和本文。

它与 `docs/designer_major_upgrade_pvp_content_pack_v1.md` 配套：

- 内容包定义合法牌池、基准斗法谱、身份槽和 bot 策略。
- 本文定义这些内容如何落成测试 fixture，并被 `tests/sanity_pvp_live_balance_artifact_checks.cjs` 消费；`tests/sanity_pvp_live_balance_simulation_checks.cjs` 继续负责内存 quick gate。

## 1. Fixture 证据结构

当前冻结输入 fixture 路径：

```text
server/pvp-live/fixtures/baseline_loadouts_v1.json
server/pvp-live/fixtures/baseline_bot_policies_v1.json
server/pvp-live/fixtures/opening_scripts_v1.jsonl
server/pvp-live/fixtures/golden_replays_v1.jsonl
```

当前冻结生成报告路径：

```text
output/pvp-live-balance/simulation_report_v1.json
output/pvp-live-balance/failing_replays/
```

## 2. `baseline_loadouts_v1.json`

### 2.1 Schema

```json
{
  "ruleVersion": "pvp-live-v1",
  "loadouts": [
    {
      "id": "aggro_pressure",
      "label": "快攻压迫",
      "identitySlot": "pvp_fate_starter_stable",
      "botPolicyId": "aggro_pressure",
      "deck": [
        { "id": "quickSlash", "upgraded": false }
      ],
      "expectedProfile": {
        "speed": "fast",
        "burst": "medium",
        "defense": "low",
        "attrition": "low",
        "control": "low"
      }
    }
  ]
}
```

### 2.2 校验规则

每个 loadout 必须满足：

- `deck.length === 20`
- `ruleVersion === "pvp-live-v1"`
- `identitySlot` 存在于身份槽白名单。
- `botPolicyId` 存在于 bot 策略白名单。
- 每张牌存在于 `pvp_legal_cards` 快照。
- 每张牌存在于当前 `js/data/cards.js`。
- 单卡复制数 `<= 2`。
- 0 费牌数量为 0。
- 1 费牌数量 `>= 10`。
- 直接伤害牌数量 `<= 10`。
- 非纯伤害交互牌数量 `>= 8`。

## 3. `baseline_bot_policies_v1.json`

### 3.1 Schema

```json
{
  "ruleVersion": "pvp-live-v1",
  "policies": [
    {
      "id": "aggro_pressure",
      "label": "快攻压迫策略",
      "priority": [
        "play_lethal_if_legal",
        "prevent_death",
        "play_visible_setup",
        "play_payoff_after_setup",
        "spend_energy_on_best_damage",
        "play_defense_if_energy_left",
        "end_turn"
      ]
    }
  ]
}
```

当前 v1 artifact policy 只冻结 `id / label / priority`。`mulligan`、`targeting`、`endTurnWhen` 属于 full S2 reducer-backed bot policy 扩展字段，不能假装已经存在于当前提交的 `baseline_bot_policies_v1.json`。

### 3.2 必须存在的 policy id

```text
aggro_pressure
tempo_mark
shield_counter
soft_control
low_hp_counter
vulnerable_combo
draw_midrange
healing_attrition
```

### 3.3 默认托管策略

断线托管不使用进攻最优解，避免玩家断线时系统替玩家打出关键爆发。

默认托管顺序：

1. 若有可用防御牌，打出当前最高护盾牌。
2. 若生命低于 40% 且有治疗牌，打出治疗牌。
3. 若有 1 费弱化牌，打出弱化牌。
4. 若无可用防御 / 治疗 / 弱化，执行结束回合。

托管禁止：

- 打出处决牌。
- 打出低血反杀牌。
- 打出高影响爆发牌。
- 主动投降。

## 4. `opening_scripts_v1.jsonl`

### 4.1 单行 Schema

```json
{
  "id": "opening-aggro-vs-shield-0001",
  "seed": "pvp-live-v1-opening-0001",
  "firstSeat": "A",
  "loadoutA": "aggro_pressure",
  "loadoutB": "shield_counter",
  "forcedOpeningA": ["pvp_burst", "heavyStrike", "doubleStrike"],
  "forcedOpeningB": ["defend", "pvp_guard", "innerPeace"],
  "assertions": {
    "secondSeatActsBeforeDeath": true,
    "secondSeatHasActionLine": true,
    "allowBudgetPrevention": true,
    "maxDamageBeforeSeatBAction": 49
  }
}
```

### 4.2 必须覆盖的 opening 分类

| category | 覆盖目标 |
| --- | --- |
| `first_high_damage` | 先手 3 张伤害牌 |
| `first_setup_payoff` | 先手 2 张 setup + 1 张 payoff |
| `second_no_defense` | 后手无防御牌 |
| `second_high_curve` | 后手起手多张 2 费牌 |
| `both_defensive` | 双方均抽到护盾 / 治疗 |
| `low_hp_self_damage` | 低血反杀起手自伤过多 |
| `draw_chain` | 过牌中速起手 3 张过牌 |
| `soft_control_chain` | 控制弱化起手 2 张弱化 |

每个 category 至少 200 条，总计至少 10,000 条。

## 5. `golden_replays_v1.jsonl`

### 5.1 单行 Schema

```json
{
  "id": "golden-budget-prevent-001",
  "seed": "pvp-live-v1-golden-001",
  "loadoutA": "aggro_pressure",
  "loadoutB": "draw_midrange",
  "expectedWinner": "B",
  "expectedEndReason": "lethal",
  "expectedEvents": [
    "match_created",
    "battle_started",
    "card_played",
    "damage_prevented_by_budget",
    "turn_ended",
    "battle_finished"
  ],
  "expectedReview": {
    "hasBudgetPrevention": true,
    "hasDecisiveRound": true,
    "hasLoserAdvice": true
  }
}
```

### 5.2 必须存在的 golden case

| id | 目的 |
| --- | --- |
| `golden-budget-prevent-001` | 预算拦截后仍继续对局 |
| `golden-no-hand-leak-001` | StateView 不泄露对手手牌和牌库顺序 |
| `golden-idempotent-action-001` | 重复 action 不重复结算 |
| `golden-reconnect-resume-001` | 重连恢复同一 revision |
| `golden-soft-timeout-001` | 首次超时执行默认防御 |
| `golden-forfeit-timeout-001` | 多次超时结束对局 |
| `golden-draw-round14-001` | 第 14 整轮按规则终局 |
| `golden-invalid-match-001` | 异常局不写正式积分 |
| `golden-replay-public-redaction-001` | 分享战报只使用 `replay_public`，不泄露对手隐藏手牌、牌库顺序、未公开 RNG 或未公开行动意图 |
| `golden-audit-safe-scan-001` | `audit_safe` 视图输出可扫描字段路径，隐藏信息泄露数为 0 |
| `golden-public-derivation-001` | 分享标题、高光、失败建议和公开调谱建议都能从 `replay_public` 或 `audit_safe` 推导，不能暗含隐藏信息 |
| `golden-response-window-preserved-001` | setup 到 payoff 之间必须保留对手完整响应窗，不能中途爆发到无选择 |
| `golden-soft-lock-breakable-001` | 控制 / 防御循环不能连续锁死选择；失败方至少有可执行动作脱离低互动窗口 |
| `golden-public-loss-explanation-only-001` | 失败建议只使用公开事件、预算拦截、公开 setup 和结算摘要，不使用隐藏手牌或牌库顺序 |

golden 覆盖矩阵：

| 风险 | 必须覆盖的 golden | 阻断条件 |
| --- | --- | --- |
| 后手被秒杀 | `golden-budget-prevent-001`、`golden-response-window-preserved-001` | 后手行动前死亡或中高爆发无完整响应窗 |
| 隐藏信息泄露 | `golden-no-hand-leak-001`、`golden-replay-public-redaction-001`、`golden-audit-safe-scan-001` | StateView、公开战报或安全审计泄露隐藏手牌、牌库顺序、未公开 RNG |
| 结算分叉 | `golden-idempotent-action-001`、`golden-reconnect-resume-001` | 重复行动、断线恢复或重复终局导致奖励、积分或 revision 分叉 |
| 非游戏局 | `golden-soft-timeout-001`、`golden-forfeit-timeout-001`、`golden-invalid-match-001` | 未开局扣分、ready timeout 写正式积分、弱网误判正式失败 |
| 长局拖死 | `golden-draw-round14-001`、`golden-soft-lock-breakable-001` | 第 14 整轮后继续拖局，或长局平局被当作无效局 |
| 公开复盘可信 | `golden-public-derivation-001`、`golden-public-loss-explanation-only-001` | 公开建议无法追溯到公开事件或安全视图 |

## 6. `simulation_report_v1.json`

### 6.1 Schema

当前 `output/pvp-live-balance/simulation_report_v1.json` 由 artifact generator 写出 quick report，作为可审计的本地报告快照；full gate 使用同一 schema，由 `runBalanceSimulationFullGate()` 生成 32,000 局报告并通过 `validateSimulationReport(..., { mode: 'full' })`。截至 2026-06-19 的 S2-C full gate 已通过：先手胜率 49.98%，8 套构筑胜率全部在 45%-55%，pair first-seat 全部在 45%-55%，`archetypeSpread` 无 dominant / false archetype 风险；quick report 不能单独替代 full gate，但 full helper 已是当前正向封板证据。

```json
{
  "ruleVersion": "pvp-live-v1",
  "generatedAt": "2026-06-17T00:00:00.000Z",
  "totalMatches": 32000,
  "totalOpeningScripts": 10000,
  "firstSeatWinRate": 0.501,
  "pairWinRates": {
    "aggro_pressure__shield_counter": {
      "matches": 500,
      "firstSeatWinRate": 0.49,
      "aWinRate": 0.48,
      "bWinRate": 0.52
    }
  },
  "archetypeWinRates": {
    "aggro_pressure": 0.51
  },
  "archetypeSpread": {
    "aggro_pressure": {
      "favoredMatchups": 2,
      "unfavoredMatchups": 2,
      "dominantRisk": false,
      "falseArchetypeRisk": false
    }
  },
  "costCurveByLoadout": {
    "aggro_pressure": {
      "zeroCost": 0,
      "oneCost": 20,
      "twoCost": 0,
      "threePlusCost": 0,
      "averageCost": 1.0
    }
  },
  "roleCoverageByLoadout": {
    "aggro_pressure": {
      "openingActions": true,
      "defenseOrRecovery": true,
      "publicSetup": true,
      "finisher": true,
      "swapSlots": true
    }
  },
  "staplePressure": [
    {
      "cardId": "surgeStep",
      "loadoutCount": 5,
      "keepRate": 0.42,
      "drawnWinRateUplift": 0.018,
      "replacementWinRateDelta": -0.011,
      "mirrorAppearanceRate": 0.5,
      "status": "staple_watch",
      "reason": "出现在 5 套基准谱中，需要确认是基础润滑牌而不是必带强牌"
    }
  ],
  "stapleWatchEscalation": {
    "observeCards": ["defend", "shieldBash"],
    "watchCards": ["surgeStep"],
    "blockedCards": []
  },
  "complexityBudgetViolations": [],
  "playDrawQualityByLoadout": {
    "aggro_pressure": {
      "mirrorPlayDrawDelta": 0.026,
      "postMulliganFirstActionEffectiveRate": 0.98,
      "identitySlotPlayDrawDelta": 0.011,
      "representativeMirrorReplaySeed": "pvp-live-v1-mirror-aggro-001"
    }
  },
  "burstCounterplay": {
    "largestTwoTurnBurstSeed": "pvp-live-v1-burst-002",
    "setupToPayoffAfterOpponentResponseRate": 1.0,
    "midBurstWithoutResponseWindowCount": 0,
    "lethalWithoutFullResponseWindowCount": 0
  },
  "softLockPressure": {
    "controlLockWindowCount": 0,
    "maxConsecutiveLowAgencyTurns": 1,
    "defenseOnlyWindowCount": 0,
    "controlMirrorLongestLowInteractionSeed": "pvp-live-v1-control-mirror-004"
  },
  "resourceConsistency": {
    "averageHandSize": 5.7,
    "drawCappedRate": 0.03,
    "deckEmptyRoundP50": 5,
    "averagePlayableActionsPerTurn": 2.8,
    "repeatedOpeningClusterRate": 0.08
  },
  "antiScriptPacing": {
    "earlyPublicStateRepeatRate": 0.14,
    "mirrorBranchEntropyP50": 1.7,
    "mirrorBranchEntropyP10": 0.9,
    "coreDeckExposureByRound5": 0.78,
    "highRepeatRouteRate": 0.08,
    "functionSlotDiversityMin": 2
  },
  "resourceConsistencyByLoadout": {
    "aggro_pressure": {
      "averageHandSize": 5.2,
      "drawCappedRate": 0.02,
      "deckEmptyRoundP50": 5,
      "averagePlayableActionsPerTurn": 2.6,
      "deadHandRate": 0.04
    }
  },
  "metagamePredatorPrey": {
    "aggro_pressure": {
      "prey": ["draw_midrange", "vulnerable_combo"],
      "predators": ["shield_counter", "healing_attrition"],
      "publicInteractionAxis": ["shield", "weak", "public_setup"],
      "representativeSeeds": ["pvp-live-v1-aggro-prey-001", "pvp-live-v1-aggro-predator-001"]
    }
  },
  "metagameGraphContract": {
    "minimumSamplesPerOrderedPair": 500,
    "dominantEdges": [
      {
        "from": "aggro_pressure",
        "to": "draw_midrange",
        "pairWinRate": 0.536,
        "edgeType": "prey",
        "publicInteractionAxis": ["early_pressure", "budget_clamp"],
        "representativeReplaySeed": "pvp-live-v1-aggro-prey-001"
      }
    ],
    "isolatedArchetypes": []
  },
  "actualComplexityLoad": {
    "averagePlayableBranchCount": 2.8,
    "p95PublicStateNodes": 4,
    "rejectCodeComprehensionIssues": 0,
    "firstLossReviewCognitiveLoad": "pass"
  },
  "actualComplexityLoadByLoadout": {
    "aggro_pressure": {
      "keywordCount": 3,
      "majorPublicStateCount": 2,
      "averagePlayableBranchCount": 2.7,
      "p95PublicStateNodes": 4,
      "firstLossReviewCognitiveLoad": "pass"
    }
  },
  "archetypeIdentity": {
    "maxMainDeckOverlapRate": 0.56,
    "turnPlanSimilarityBlockedCount": 0,
    "loadouts": {
      "aggro_pressure": {
        "primaryDecisionAxis": "early_pressure_vs_resource_hold",
        "whyMainThisLoadout": "用低费连续压迫逼对手提前交防守",
        "skillTest": "何时保留伤害牌等待公开 setup",
        "publicWeakness": ["shield", "healing", "weak"],
        "swapSlotCount": 4,
        "swapSlotImpact": "curve_or_defense_profile_changes",
        "practiceTopic": "防守预算后继续施压"
      }
    }
  },
  "experienceFairness": {
    "nonGameLossCount": 0,
    "unreadableBurstCount": 0,
    "lossExplanationCoverage": 1.0,
    "seatAgencyP05": {
      "firstSeat": 2,
      "secondSeat": 2
    },
    "responseWindowP05": 1,
    "negativeExperienceTags": []
  },
  "duration": {
    "p50Minutes": 7.2,
    "p95Minutes": 11.4,
    "p99Minutes": 14.1
  },
  "safety": {
    "secondSeatDeathBeforeActionCount": 0,
    "secondSeatDeadActionLineCount": 0,
    "matchesAfterRound14": 0,
    "damagePreventedByBudgetCount": 128
  },
  "topRejectedActionReasons": [
    { "code": "insufficient_energy", "count": 43 }
  ],
  "evidenceSeeds": {
    "longestReplaySeed": "pvp-live-v1-sim-12345",
    "largestBurstReplaySeed": "pvp-live-v1-sim-23456",
    "mostBudgetPreventedSeed": "pvp-live-v1-sim-34567"
  },
  "pass": true
}
```

### 6.2 通过判定

必须全部满足：

- `totalMatches >= 10000`
- full gate 中 `totalMatches >= 32000`
- `firstSeatWinRate >= 0.47`
- `firstSeatWinRate <= 0.53`
- 任意有序对先手胜率在 `0.45-0.55`
- `secondSeatDeathBeforeActionCount === 0`
- `secondSeatDeadActionLineCount === 0`
- `duration.p95Minutes <= 12`
- `duration.p99Minutes <= 15`
- `matchesAfterRound14 === 0`
- 任一 archetype 综合胜率 `<= 0.55`
- 任一 archetype 综合胜率 `>= 0.45`
- 至少 6 套 archetype 综合胜率在 `0.48-0.52`
- 任一 archetype 不能对 5 套或更多对手保持 `>0.53` 胜率。
- 任一 archetype 不能对 5 套或更多对手低于 `0.47` 胜率。
- 任一 loadout 的 `zeroCost === 0` 且 `oneCost >= 10`。
- 任一 loadout 的五类角色位必须全部为 `true`。
- `staplePressure` 中 `loadoutCount >= 7` 的卡牌数量必须为 0。
- `stapleWatchEscalation.blockedCards.length === 0`。
- `staple_watch` 卡牌若 `drawnWinRateUplift >= 0.04` 或 `replacementWinRateDelta <= -0.03`，必须进入 `blockedCards`。
- `complexityBudgetViolations.length === 0`。
- 每套构筑都必须输出 `mirrorPlayDrawDelta` 和代表镜像 replay seed；绝对值超过 `0.05` 时不能封板。
- `postMulliganFirstActionEffectiveRate >= 0.95`。
- `identitySlotPlayDrawDelta` 绝对值不得超过 `0.03`。
- `setupToPayoffAfterOpponentResponseRate === 1.0`，且 `midBurstWithoutResponseWindowCount === 0`。
- `lethalWithoutFullResponseWindowCount === 0`。
- `softLockPressure.controlLockWindowCount === 0`，且 `maxConsecutiveLowAgencyTurns <= 1`。
- `experienceFairness.nonGameLossCount === 0`。
- `experienceFairness.unreadableBurstCount === 0`。
- `experienceFairness.lossExplanationCoverage === 1.0`。
- `experienceFairness.seatAgencyP05.firstSeat >= 2` 且 `experienceFairness.seatAgencyP05.secondSeat >= 2`。
- `experienceFairness.responseWindowP05 >= 1`。
- `resourceConsistency.averageHandSize` 必须在 `3-8` 之间，避免长期空手或爆手脚本化。
- `resourceConsistency.drawCappedRate <= 0.08`。
- `resourceConsistency.averagePlayableActionsPerTurn` 必须在 `1.5-4.5` 之间。
- `resourceConsistency.repeatedOpeningClusterRate <= 0.12`，防止开局过度脚本化。
- `antiScriptPacing.earlyPublicStateRepeatRate <= 0.18`。
- `antiScriptPacing.mirrorBranchEntropyP50 >= 1.4` 且 `mirrorBranchEntropyP10 >= 0.8`。
- `antiScriptPacing.coreDeckExposureByRound5 <= 0.85`。
- `antiScriptPacing.highRepeatRouteRate <= 0.12`。
- `antiScriptPacing.functionSlotDiversityMin >= 2`。
- `actualComplexityLoad.p95PublicStateNodes <= 5`，且 `rejectCodeComprehensionIssues === 0`。
- 任一 `actualComplexityLoadByLoadout[*].keywordCount <= 3`。
- 任一 `actualComplexityLoadByLoadout[*].majorPublicStateCount <= 2`。
- 任一 `actualComplexityLoadByLoadout[*].averagePlayableBranchCount <= 4`。
- `staplePressure` 中进入 `staple_watch` 的卡牌必须输出留牌率、抽到胜率提升、替换后胜率变化和镜像出现率。
- `metagameGraphContract.minimumSamplesPerOrderedPair >= 500`。
- 每套非均衡锚点 archetype 至少有 1 条 `prey` 边和 1 条 `predator` 边，且都必须有公开克制轴和代表 replay seed。
- `archetypeIdentity.maxMainDeckOverlapRate <= 0.60`；超过时必须降级为同 archetype 分支，不能作为两套首发主推谱。
- `archetypeIdentity.turnPlanSimilarityBlockedCount === 0`。
- 任一 `archetypeIdentity.loadouts[*]` 必须包含 `primaryDecisionAxis`、`whyMainThisLoadout`、`skillTest`、`publicWeakness`、`swapSlotCount >= 2`、`swapSlotImpact` 和 `practiceTopic`。

### 6.3 `match_quality_report_v1.json`

匹配质量报告不评价卡牌强度，但它是 PVP 双方体验封板证据的一部分。报告 schema 必须能回答“为什么这两个人应该匹配”以及“输赢后积分为什么这样变”。

```json
{
  "generatedAt": "2026-06-17T00:00:00.000Z",
  "sampleMatches": 500,
  "ratingDiffBuckets": {
    "good": 0.72,
    "expanded": 0.23,
    "wide_but_accepted": 0.05,
    "rejected_too_wide": 0
  },
  "wideButAcceptedRatio": 0.05,
  "recentRematchSuppressedCount": 18,
  "connectionHealthBlockedCount": 3,
  "newPlayerProtectionHitRate": 0.31,
  "settlementExplanationCoverage": 1.0,
  "entrySnapshotsMissing": 0,
  "pairSnapshotsMissing": 0,
  "acceptSnapshotsMissing": 0,
  "settlementExplanationMissing": 0,
  "pass": true
}
```

通过判定：

- `wideButAcceptedRatio <= 0.15`。
- `ratingDiffBuckets.rejected_too_wide === 0`。
- `settlementExplanationCoverage === 1.0`。
- 所有 snapshot missing 计数必须为 0。
- 高风险连接不能进入正式排位；若进入，报告必须失败。

## 7. 失败报告格式

失败时必须写出最小复现：

```json
{
  "failureId": "first-seat-winrate-out-of-range",
  "message": "先手总胜率超过上限",
  "actual": 0.561,
  "expected": "0.47 <= firstSeatWinRate <= 0.53",
  "sampleSeeds": [
    "pvp-live-v1-sim-00081",
    "pvp-live-v1-sim-02419"
  ],
  "suggestedInvestigation": [
    "检查 aggro_pressure 起手伤害",
    "检查后手护印是否不可转伤",
    "检查首回合额外抽牌和额外灵力是否为 0"
  ]
}
```

## 7.1 隐藏信息审计报告

回放、分享和争议审计必须额外输出隐藏信息审计报告。该报告可以独立保存，也可以作为 release report 的一个 section；本文只冻结字段语义，不冻结保存位置。

```json
{
  "ruleVersion": "pvp-live-v1",
  "matchId": "pvpm-golden-redaction-001",
  "visibilityLayer": "replay_public",
  "sharePayloadHash": "sha256:...",
  "leakedFieldCount": 0,
  "leakedPaths": [],
  "forbiddenFieldsChecked": [
    "opponent.hand",
    "opponent.drawPile",
    "rngState",
    "privatePayloadJson",
    "unrevealedIntent"
  ],
  "publicFieldsAllowed": [
    "publicEventSummary",
    "turnNumber",
    "roundNumber",
    "damageBudgetSummary",
    "settlementSummary"
  ],
  "publicDerivationAudit": [
    {
      "outputField": "loserAdvicePublicSummary",
      "sourceVisibility": "replay_public",
      "sourceEventIds": ["evt-012", "evt-019"],
      "sourcePayloadHash": "sha256-public-events-012-019",
      "derivationTags": ["setup_ignored", "budget_clamped"],
      "derivationHash": "sha256-public-advice-001",
      "forbiddenSourceLayers": ["server_full", "opponent_hidden_hand", "deck_order", "unrevealed_rng"],
      "usesHiddenInformation": false
    }
  ],
  "pass": true
}
```

必须全部满足：

- `visibilityLayer` 至少覆盖 `replay_public` 和 `audit_safe`。
- `leakedFieldCount === 0`。
- `leakedPaths.length === 0`。
- `sharePayloadHash` 必须稳定，同一 golden replay 重跑不漂移。
- `replay_public` 只能包含公开事件、终局类型、公开 setup、预算拦截和结算摘要。
- `audit_safe` 可以包含风险标签和字段路径，但不能包含可还原隐藏手牌、牌库顺序或 RNG 状态的原文。
- `publicDerivationAudit` 必须覆盖分享标题、高光回合、公开失败建议、公开调谱建议和争议摘要。
- `publicDerivationAudit[*].usesHiddenInformation` 必须全部为 `false`。
- `publicDerivationAudit[*].sourcePayloadHash` 和 `derivationHash` 必须稳定，同一 replay 重跑不漂移。
- `publicDerivationAudit[*].forbiddenSourceLayers` 必须显式列出不可用于公开建议的来源层。
- 任一公开建议如果无法追溯到 `replay_public` 或 `audit_safe`，该 golden replay 不能作为封板证据。

每个失败报告至少包含：

- `failureId`
- `message`
- `actual`
- `expected`
- `sampleSeeds`
- `suggestedInvestigation`

## 8. 与测试脚本的关系

`tests/sanity_pvp_live_balance_simulation_checks.cjs` 负责 S2-A 内容包与 quick gate 检查：

- 内容包 schema。
- card id 存在。
- copy count。
- 0 费限制。
- 曲线限制。
- 身份槽限制。

`tests/sanity_pvp_live_balance_artifact_checks.cjs` 负责 S2-B artifact foundation 和 S2-C full helper 合同检查：

- 冻结路径。
- `baseline_loadouts_v1.json` / `baseline_bot_policies_v1.json` 可读取。
- `opening_scripts_v1.jsonl` 恰好 10,000 条。
- `golden_replays_v1.jsonl` 覆盖全部必备 case。
- 提交内 fixture 必须与 deterministic artifact generator 输出一致，防止大文件漂移。
- full gate helper 必须运行 32,000 局样本，并通过 S2-C full-mode validation；即使调用方请求 quick validation，也不能把 full 报告降级成 quick 门槛。

`tests/sanity_pvp_live_golden_replay_checks.cjs` 负责 S2-D / S2-E / S2-F golden replay 一致性检查：

- 从提交内 `golden_replays_v1.jsonl` 读取 fixture，不重新合成测试数据。
- 下列 10 条 golden 已声明 `executionLayer: "reducer"` 并通过 reducer runner：`golden-budget-prevent-001`、`golden-no-hand-leak-001`、`golden-idempotent-action-001`、`golden-draw-round14-001`、`golden-replay-public-redaction-001`、`golden-audit-safe-scan-001`、`golden-public-derivation-001`、`golden-response-window-preserved-001`、`golden-soft-lock-breakable-001`、`golden-public-loss-explanation-only-001`。
- 预算保护类固定 A 首动爆发与 B 防御起手，必须公开产生 `budget_clamped` 且最终进入 lethal 终局；非预算类固定双方都有进攻线，必须在不触发预算保护的情况下进入 lethal 终局。
- runner 必须证明 event sequence 连续、`replayHash` / `finalStateHash` 稳定、终局 reason / winner 与 fixture 一致、重复 intent 返回 duplicate 且不追加事件。
- `golden-replay-public-redaction-001` 必须执行 `replay_public` 分支，`golden-audit-safe-scan-001` 必须执行 `audit_safe` 分支；两层 payload 都必须输出稳定 hash，并通过字段路径 / 禁用 key / 实例 id 字符串扫描。
- StateView、`replay_public`、`audit_safe` 和双方 post-match review 不得泄露 opponent hand、deck order、cardId、instanceId、cardInstanceId、loadoutSnapshot、rngSeed、randomSeed 或 raw payload。
- review 的预算保护标记必须能从公开事件或公开复盘引用推导，不能靠隐藏状态。
- S2-E 已把 4 条非 reducer golden 推进为 `executionLayer: "store"`：`golden-reconnect-resume-001` 验证重连恢复不推进 `stateVersion` 且不产生终局 review；`golden-soft-timeout-001` 验证首次 timeout 走低风险托管并保持 active；`golden-forfeit-timeout-001` 验证重复 / 严重 timeout 终局判负并产生 review；`golden-invalid-match-001` 验证 setup ready timeout 进入 invalidated、无 winner、无终局 review。
- S2-F 已把 `golden-draw-round14-001` 升级为 reducer-backed runtime evidence：第 14 整轮后由 reducer 追加 `match_finished(round14_draw)`，公开 `scoreA / scoreB / scoreDelta / scoreThreshold / roundIndex`，StateView 生成 draw review，且不强造 loser advice。`SIMULATION_BACKED_GOLDEN_REPLAY_IDS` 当前为空；settlement 层把 `round14_draw` 作为 no-ranked-impact 终局处理，不写 ranked settlement gate、历史或奖励。

`tests/sanity_pvp_live_balance_simulation_checks.cjs` 继续负责动态 quick gate 检查：

- bot policy 执行。
- opening pressure probes。
- quick simulation report。
- pass/fail 阈值。

后续 replay 扩展仍需继续覆盖：

- 更广义正式赛季入口、多实例队列、`round14_score` / `round14_draw` 生产 smoke 和线上域名浏览器回归。SQLite-backed 跨进程 WS `state_sync` fanout 已由 S8S 覆盖，surrender 终局跨进程 fanout smoke 已由 S8W 覆盖，但不能替代 Redis / 多实例强一致或生产域名 smoke。
- 正式赛季积分、多实例队列、生产 API smoke、线上域名浏览器回归，以及 S6A 单进程 WS 之外的共享房间 / 灰度监控。

## 9. 封板证据要求

V10 真 PVP 内容包封板时，最终汇报必须列出：

- `baseline_loadouts_v1.json` 校验通过。
- `baseline_bot_policies_v1.json` 校验通过。
- `opening_scripts_v1.jsonl` 覆盖 10,000 条。
- `golden_replays_v1.jsonl` 覆盖本文列出的全部必备 case。
- `simulation_report_v1.json` 的 `pass === true`。
- `output/pvp-live-balance/failing_replays/` 为空。
