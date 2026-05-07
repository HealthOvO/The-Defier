# The Defier《逆命者》下一版本策划案 V9.1

## 0. 文档定位

本文是当前 `seasonBoard.frontier -> decree -> chronicle -> council` 四层反馈链上线后的下一版本策划。

当前版本已经解决了“玩家能不能读懂本周季盘”的问题。下一版本不应继续横向增加说明层，而应把这些只读反馈推进为一个可选择、可结算、可回看的长期战线循环。

实施进度补记：

1. Phase A 已完成 `seasonBoard.frontier.resolution` 只读投影、跨 payload 镜像与门禁。
2. Phase B 已完成 Sanctum 会审裁记面板内每周一次提交，支持 `hold_primary / rebalance_support / seal_dispute` 三选一、防重复、防非法 choice、提交后封记显示；该交互不进入 research / goal action，也不让 `frontier.resolution` 成为第二任务源。
3. Phase C 已完成会审裁记对普通 sampling 分线排序的轻量偏置：`rebalance_support` 只在无硬目标时前移副线，`hold_primary / seal_dispute` 不改排序，欠卷强目标、锁线承诺与定榜主验证不被覆盖。
4. Phase D 已完成战役史卷多周回看与谱系风格累计：`frontier.chronicleArchive` 由扁平 `frontier_resolution` 历史派生，Sanctum 可回看多周裁记，命盘谱系新增 `frontierTrack` 统计守线派 / 平衡派 / 归档派。

版本暂定名：

`V9.1《诸界战线：会审归卷》`

一句话目标：

> 让玩家在本周赛季天道盘结算后，基于诸界会审意见选择一条战线裁记，并把这条选择封进战役史卷，进而影响下周排班、谱系风格和长期回看。

## 1. 当前系统现状

### 1.1 已经完成的能力

当前代码已经具备以下基础：

1. `seasonBoard.lanes` 已经稳定承接训练线、远征线、验算线三条季盘任务。
2. `seasonBoard.nextTask / nextWeekGoal` 已经是奖励页、洞府与跨页行动的单一主 CTA 合同。
3. `seasonBoard.settlement / debtPack / verificationOrders / weekVerdictLedger` 已经承接押卷、欠卷、主/旁验证与下周占位。
4. `seasonBoard.laneRewards / claimedLaneRewards` 已经让三条分线拥有每周一次的结题赏。
5. `seasonBoard.frontier` 已经能派生主战线、压强、下一跳与三线态势。
6. `seasonBoard.frontier.decree` 已经把主战线压成本周约束、完成口径和风险线。
7. `seasonBoard.frontier.chronicle` 已经把本周推进压成只读战役史卷。
8. `seasonBoard.frontier.council` 已经把主线意见、副线保留口径和三线 `laneOpinions` 压成只读诸界会审。
9. `seasonBoard.frontier.resolution` 已经支持 Sanctum 每周一次会审裁记提交，并能投影为 reward / expedition / map 共用的只读封记结果。
10. `seasonBoard.frontier.chronicleArchive` 已经能从多周 `frontier_resolution` 历史派生史卷回看、风格计数和最新封记条目。
11. Reward / Expedition / Map / Sanctum 已经镜像同一份 `frontier` 子树，浏览器审计已经锁住“无第二主 CTA”和“council / resolution / chronicleArchive 不带 action 字段”。

### 1.2 当前仍然不够好玩的地方

Phase D 收口后，当前 V9.1 主循环已经从信息阅读推进到选择、封记、轻量排班塑形和长期回看。剩余更适合放到下一版本的缺口是更深的战役经营，而不是继续补本轮基础闭环：

1. `chronicle` 已经能告诉玩家“本周记录是什么”，`resolution` 也已经能把本周选择封成史卷事实，但还没有独立的完整史卷翻页页面。
2. `council` 已经能让玩家选择本周采用哪种裁记口径，但当前仍控制在三种安全口径内，暂不做复杂改判成本。
3. 分线奖励已经有领取闭环，会审意见也能轻量影响普通排班；下一版本可继续评估跨周补领策略、分线奖励变体和三周章目标。
4. `seasonVerificationState.records / history` 已经能记录扁平 `frontier_resolution` 裁记事实，并由 `weekVerdictLedger.current`、`frontier.resolution`、`frontier.chronicleArchive` 与命盘谱系共同消费。
5. 下一周普通排班已经能被“本周会审选择”轻量塑形，战役史卷多周回看与谱系风格累计也已落地为只读派生层。

## 2. 版本主目标

### 2.1 玩法目标

把当前四层只读反馈升级成一条新闭环：

`读战线 -> 看法旨 -> 查史卷 -> 听会审 -> 选裁记 -> 封史卷 -> 改下周排班`

玩家每周至少面对一次有意义的问题：

> 我是继续守住当前主战线，还是把本周资源切给副线补证，或者先封存争议、等下一周再定？

### 2.2 工程目标

新版本必须复用现有真源，不新增第二套任务系统：

1. 任务真源仍是 `seasonBoard.lanes / nextTask / nextWeekGoal`。
2. 周裁定展示投影仍是 `weekVerdictLedger.current`。
3. 验证记录与会审裁记的持久真源仍是 `seasonVerificationState.records / history`，会审裁记只能以扁平 `recordKind: frontier_resolution` 记录落盘。
4. 奖励领取真源仍是 `claimedLaneRewards`。
5. `frontier.decree / chronicle / council` 继续保持派生展示层。

## 3. 设计支柱

### 支柱 A：会审给选择，不给第二任务源

`frontier.council` 继续只输出意见、裁语和三线态势。真正的玩家选择不写进 `frontier.council`，也不让 council 生成 `actionType / actionValue / ctaLabel`。

选择应通过一个明确的结算函数提交到 `seasonVerificationState.records / history`，再由 `getSeasonBoardSnapshot()` 合入 `weekVerdictLedger.current`，最后由 `frontier.council / resolution` 重新派生展示“当前采用的会审口径”。

### 支柱 B：史卷负责回看，不负责发奖

`frontier.chronicle` 的升级方向是“封记”和“回看”，不是新增经济领取。

分线结题赏已经负责小额奖励，史卷不应该再开一套领取账本。它最多改变：

1. 下周推荐顺序。
2. 谱系风格记录。
3. `weekVerdictLedger` 的裁记文本。
4. 洞府和地图中的回看摘要。

### 支柱 C：选择必须影响下周，但不能压垮排班

会审裁记只能轻量影响下周排班，不能覆盖欠卷强目标位、主验证状和 `nextWeekGoal` 的优先级。

优先级建议：

1. 欠卷强目标位。
2. 主验证状。
3. 当前 `nextTask`。
4. 会审裁记导致的分线偏置。
5. 普通分线补样。

### 支柱 D：一次选择，三处反馈

玩家完成会审裁记后，应在三处看到同一个事实：

1. Sanctum：可操作的会审裁记与史卷封记状态。
2. Reward：只读显示本周已采用的裁记，不新增第二主 CTA。
3. Map：章节简报只读显示史卷封记和下周偏置，不提供行动按钮。

## 4. 核心玩法模块

## 4.1 诸界会审裁记

### 功能描述

在洞府季盘区域新增一个“会审裁记”轻交互。它基于 `frontier.council.laneOpinions` 派生 2-3 个可选裁记口径，玩家每周只能提交一次。

### 首发裁记选项

建议首发控制在三种：

1. `hold_primary`
   继续守主战线。下周保持当前 `primaryFrontId` 对应分线优先。
2. `rebalance_support`
   给副线补证。下周在不抢欠卷/主验证强目标位的前提下，提高一个副线任务的排序。
3. `seal_dispute`
   封存争议。当前周只写史卷，不改变下周排序，用于玩家不想被系统强行改排班的情况。

### 玩家体验

玩家看到的不应是三个机械按钮，而是三条会审意见：

1. 主战线继续推进。
2. 副线保留证据。
3. 争议暂封史卷。

每条意见都要显示：

1. 会审理由。
2. 影响范围。
3. 是否会改写下周推荐。
4. 是否会留下谱系风格。

### 反目标

1. 不在 `frontier.council` 上新增 `actionType / actionValue / ctaLabel`。
2. 不在 reward 页新增第二个主行动按钮。
3. 不让会审裁记直接发资源。
4. 不允许同周重复提交覆盖历史，除非明确设计“改判”成本。

## 4.2 战役史卷封记

### 功能描述

当玩家提交会审裁记后，系统把当前 `chronicle` 作为“本周史卷条目”封记。封记后的史卷承担长期回看和文案证据，不承担规则判定真源。

### 首发字段建议

推荐把最小字段投影到 `weekVerdictLedger.current` 或由 `seasonVerificationState.records` 中的记录镜像出来：

1. `frontierResolutionId`
2. `frontierResolutionLabel`
3. `frontierResolutionStance`
4. `frontierResolutionLaneId`
5. `frontierResolutionSupportLaneId`
6. `chronicleSealStatus`
7. `chronicleSealLine`
8. `councilResolutionLine`
9. `resolutionSubmittedAt`

这些字段属于“周裁定上下文”，不属于 `frontier.council` 的行动合同。

### 回看规则

首发只做轻量回看：

1. Sanctum 显示当前周封记。
2. Reward 显示本周封记摘要。
3. Map 显示章节简报里的史卷封记行。
4. 文本 payload 暴露同一份封记对象。

不做独立历史页面，不做多周翻页，不做复杂筛选。

## 4.3 下周排班偏置

### 功能描述

会审裁记提交后，对下周 `seasonBoard` 的分线排序产生轻量偏置。

### 规则建议

1. `hold_primary`
   保持 `primaryFrontId` 对应分线优先。若当前主线已经完成，则优先同线未完成任务。
2. `rebalance_support`
   从 `laneOpinions` 中选一个非主线且未完成任务最多的 lane 作为 `supportLaneId`，在普通任务排序中前移。
3. `seal_dispute`
   不改排序，只在史卷与谱系记录“争议封存”。

### 优先级边界

会审偏置不能覆盖：

1. `debtPack.status in open/deferred` 的强目标位。
2. `verificationOrders[0]` 的主验证任务。
3. 已显式存在的 `nextWeekGoal` 强路由。

换句话说，会审只影响“普通任务排序”，不影响硬结算强目标。

## 4.4 谱系风格记录

### 功能描述

会审裁记应留下轻量长期身份记录，让玩家逐步形成“我是怎么处理战线分歧的”风格。

### 首发风格

建议只做三类：

1. `frontier_loyalist`
   长期守主线。
2. `support_balancer`
   经常给副线补证。
3. `dispute_archivist`
   倾向封存争议、保留回看。

### 边界

首发只记录和展示，不给重数值奖励。后续再决定是否把风格接入称号、外观或轻量便利。

## 5. 字段与真源边界

### 5.1 推荐写入位置

最小实现建议：

1. 玩家提交裁记时，调用一个单一函数，例如 `commitSeasonBoardFrontierResolution(choiceId)`。
2. 该函数读取当前 `seasonBoard.frontier.council / chronicle / weekVerdictLedger.current`。
3. 该函数生成一条规范化裁记记录。
4. 裁记记录应写入 `seasonVerificationState.records/history`，并把当前 `weekVerdictLedger.current` 的裁记字段派生出来。
5. `frontier.chronicle / frontier.council` 下一次 normalize 时读取周裁定上下文，显示“已采用裁记”，但仍不保存自身。

### 5.2 不推荐写入位置

以下位置不应作为真源：

1. 不新增顶层 `seasonBoard.council`。
2. 不把 `frontier.council` 写进 `seasonVerificationState`。
3. 不新增 `seasonVerificationState.frontier` 或 `seasonVerificationState.council` 这类容易和派生层混淆的 key。
4. 不把裁记写进 `claimedLaneRewards`。
5. 不让 reward payload 自己重算一份不同结果。

### 5.3 最小数据合同

建议新增一个派生展示对象：

```js
seasonBoard.frontier.resolution = {
  available: true,
  submitted: true,
  id: 'frontier_resolution_2026-W17_hold_primary',
  weekTag: '2026-W17',
  choiceId: 'hold_primary',
  choiceLabel: '守主战线',
  laneId: 'verification',
  supportLaneId: '',
  stanceId: 'frontier_loyalist',
  summaryLine: '本周会审采用守主战线，验算线继续保留主优先。',
  chronicleSealLine: '战役史卷已封记：验算线为本周主战线。',
  councilResolutionLine: '诸界会审裁定：副线保留证据，不抢主线行动。',
  source: 'week_verdict_ledger',
  sourceId: 'season_verdict_...'
}
```

注意：这个对象是派生投影，不是新的持久根。

## 6. UI 设计

## 6.1 Sanctum

Sanctum 是首发唯一交互面。

新增区域建议放在季盘 summary 附近：

1. 未提交时显示 2-3 个会审裁记选项。
2. 已提交时显示“已封记”状态和本周史卷摘要。
3. 按钮使用独立钩子，例如 `data-season-board-frontier-resolution-choice`。
4. 提交后更新 season board summary、guide、chip 和 payload。

## 6.2 Reward

Reward 只做只读镜像：

1. 显示已采用的会审裁记。
2. 显示史卷封记行。
3. 保持 `data-season-board-handoff-cta="true"` 数量为 1。
4. 不新增 `frontier resolution` 的第二主按钮。

如果玩家尚未提交裁记，Reward 只提示“回洞府封记会审”，并复用既有 `nextWeekGoal` 或 handoff 路由，不单独加第二 CTA。

## 6.3 Map

Map 只做章节简报：

1. 显示史卷封记状态。
2. 显示会审裁记对下周普通分线排序的影响。
3. 不新增地图页行动按钮。
4. 继续保持 `data-season-board-frontier-action` 计数为 0。

## 7. 开发切片

## Phase A：字段与纯派生层

目标：先让 `frontier.resolution` 可被 normalize 和 payload 镜像，但不加交互。

交付：

1. `normalizeSeasonBoardFrontierResolution()`。
2. `buildSeasonBoardFrontierResolution()`。
3. `serializeSeasonBoardFrontier()` 白名单补入 resolution。
4. Expedition / Map clone 补入 resolution。
5. Node 测试锁住 reward / expedition / map 镜像一致。

验收：

1. 未提交裁记时 `submitted === false`。
2. 已有模拟 ledger 记录时 `submitted === true`。
3. resolution 不进入 `claimedLaneRewards`。
4. `frontier.council` 仍无 action 字段。

## Phase B：Sanctum 会审裁记交互

目标：玩家能在洞府提交一次裁记。

交付：

1. `commitSeasonBoardFrontierResolution(choiceId)`。
2. 每周一次提交防重。
3. `seasonVerificationState.records/history` 写入裁记记录。
4. Sanctum 显示未提交/已提交两态。
5. 提交后刷新 reward header、sanctum overview 和文本 payload。

验收：

1. 同周二次提交不会重复写 history。
2. 非法 choiceId 返回稳定错误。
3. 提交不会发放资源。
4. 提交不会改写 `claimedLaneRewards`。

## Phase C：下周排班偏置

目标：让会审裁记轻量影响普通分线排序。

交付：

1. `resolveSeasonBoardFrontierResolutionBias()`。
2. `rebalance_support` 能选择一个 support lane。
3. `hold_primary` 能保持主线优先。
4. `seal_dispute` 不改排序，只记史卷。
5. 欠卷强目标和主验证仍然优先。

验收：

1. 有欠卷时，会审偏置不能抢 `debt_pack` nextTask。
2. 无欠卷时，support lane 可以前移。
3. `nextWeekGoal.source` 仍来自 `debt_pack / verification / settlement / lane`，不新增 council source。

## Phase D：战役史卷多周回看与谱系风格累计

目标：把已提交的多周会审裁记从“本周封记事实”推进成可回看、可统计、可沉淀身份的长期战役证据，同时继续锁住“只读派生层，不做第二奖励系统”的边界。

交付：

1. `js/game.js` 新增 `getSeasonBoardFrontierResolutionArchiveRecords()`、`buildSeasonBoardFrontierChronicleArchive()` 与 `normalizeSeasonBoardFrontierChronicleArchive()`，从扁平 `frontier_resolution` 记录派生 `frontier.chronicleArchive`。
2. `js/core/collection_hub.js` 在 Sanctum season board summary 增加“战役史卷回看”卡片、chip、guide 与 entry 列表，并在命盘谱系中新增 `frontierTrack`。
3. `js/core/expedition_hub.js` 与 reward 文本 payload 同步保留 `chronicleArchive`，确保 reward / expedition / map / Sanctum 读取同一份只读投影。
4. `tests/sanity_season_board_system_checks.js`、`tests/sanity_fate_lineage_system_checks.js` 与 `tests/browser_meta_screen_audit.mjs` 覆盖多周记录、风格计数、谱系 track、浏览器回看面板与不污染验证归档。
5. `game-intro.html` 与 `progress.md` 同步当前版本说明和封板验证。

验收：

1. `frontier.chronicleArchive.available === true` 时可以读到总记录数、三类 choice 计数、dominant stance、latest entry 和最近 entries。
2. `frontier_resolution` 仍不进入 `getSeasonVerificationSnapshot()`、`verificationArchive`、主验证状、旁验证状或 latest verification surfaces。
3. 命盘谱系 `tracks` 包含 `frontier`，并统计守线派 / 平衡派 / 归档派，但不和清账 / 押榜 / 拖延等验证风格混合。
4. Reward 主 CTA 仍为 1，Map frontier action 仍为 0，`frontier.council / resolution / chronicleArchive` 均无 action 字段。
5. Node sanity、Browser meta audit 与 `git diff --check` 全绿。

## 8. 测试门禁蓝图

### 8.1 Node 合同测试

必须覆盖：

1. `frontier.resolution` 默认未提交状态。
2. 提交 `hold_primary` 后，resolution 指向 primary lane。
3. 提交 `rebalance_support` 后，resolution 拥有 support lane，但不覆盖欠卷强目标。
4. 提交 `seal_dispute` 后，不改变普通 lane 排序。
5. 裁记记录进入 `seasonVerificationState.history`，但不出现 `frontier / council / chronicle` 持久化污染。
6. `reward / expedition / map` 的 `frontier.resolution` JSON 一致。
7. `frontier.council` 继续没有 `actionType / actionValue / ctaLabel`。
8. 多周 `frontier_resolution` 记录会派生 `frontier.chronicleArchive`，且三种 choice 都能累计到风格计数。
9. `frontier_resolution` 不污染 `verificationArchive` 和主/旁验证状 surfaces。
10. 命盘谱系新增 `frontierTrack`，但会审风格不混入验证风格。

### 8.2 Browser audit

必须覆盖：

1. Sanctum 未提交状态显示 2-3 个裁记选项。
2. 点击裁记后，Sanctum 显示“已封记”。
3. Sanctum 显示“战役史卷回看”面板，并能读到至少一条 `data-season-board-frontier-chronicle-archive-entry`。
4. Reward 显示裁记结果和史卷回看 chip，但 handoff CTA 仍只有 1 个。
5. Map 显示史卷封记和回看摘要，但没有 frontier action。
6. 文本 payload 中 reward / expedition / map 三端 resolution 与 chronicleArchive 镜像一致。
7. 页面无 console error。

## 9. 风险与反目标

### 9.1 高风险点

1. 把会审做成第二套任务源，导致 `nextTask` 与 council 同时给行动。
2. 把史卷做成第二套奖励系统，和分线结题赏争夺账本。
3. 把 resolution 直接持久化在 `frontier` 子树里，破坏当前派生层边界。
4. Reward 页新增第二主 CTA，破坏现有浏览器门禁。
5. Map 页新增行动按钮，让章节简报从只读提示变成路由入口。

### 9.2 明确不做

首发不做：

1. 独立会审历史页面。
2. 完整多周史卷翻页页面。
3. 新经济奖励。
4. PVP / Endless 新 UI。
5. 新任务系统。
6. 多人或排行相关会审。
7. 复杂改判成本。

## 10. 版本验收标准

本版本可封板的最低标准：

1. 玩家可以在 Sanctum 选择一次本周会审裁记。
2. 选择后，战役史卷显示已封记。
3. 选择结果进入周裁定上下文和轻量历史记录。
4. Reward / Sanctum / Map / payload 看到同一份裁记结果。
5. 下周普通分线排序能被裁记轻量影响，但欠卷和主验证优先级不变。
6. 多周裁记能在 `frontier.chronicleArchive` 与 Sanctum 史卷回看面板中累计展示。
7. 命盘谱系能以 `frontierTrack` 展示守线派 / 平衡派 / 归档派的长期倾向。
8. 不新增第二主 CTA。
9. 不污染 `frontier.council / frontier.resolution / frontier.chronicleArchive` 行动字段。
10. 不新增奖励领取账本。
11. Node 和 Browser 门禁全绿。

## 11. 推荐下一刀

V9.1 已完成 Phase A-D。下一轮建议进入 V9.2：

> 把当前“三线季盘 + 会审裁记 + 史卷回看”推进为“三周一章”的战役经营层，让连续三周的守线、补证、封存选择形成章目标、章末评语和更明确的补救窗口。

原因：

1. V9.1 已经完成读盘、选择、封记、轻量排班塑形和多周回看，继续补同层 UI 的收益开始下降。
2. 当前最大剩余玩法缺口是“连续多周选择能否形成一个战役章目标”，也就是玩家能否围绕三周节奏做计划、救火和复盘。
3. V9.2 仍应复用 `seasonBoard`、`seasonVerificationState` 与现有谱系，不应新增第二任务系统。
4. 三周章可以继续验证“战役史卷是长期身份证据，不是第二奖励账本”的红线，同时给后续分线奖励变体留下空间。
