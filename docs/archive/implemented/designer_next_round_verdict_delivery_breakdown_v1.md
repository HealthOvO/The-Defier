# The Defier《逆命者》下一轮硬结算闭环开发拆解 V1

## 0. 文档定位

本文是 `docs/designer_next_round_verdict_execution_v1.md` 的配套开发拆解文档。

上一轮执行策划已经回答了：

> 下一轮最值得推进的，是把 `周结算 -> 押卷结果 -> 债账包 -> 主/旁验证状 -> 回写下周目标` 做成真正改变下一轮资源分配的硬结算闭环。

本文继续回答另一件事：

> 如果现在就要按模块进入开发，应该先做哪一刀、每一刀的 owner 是谁、最小字段怎么收、Node / 浏览器门禁要怎么接，才能避免下一轮又滑回“信息更厚、选择没更深”。

本文额外钉死两个前置约束：

1. `week verdict ledger` 只能是轻量快照，不能长成第二根长期状态机。
2. `正卷 / 险卷 / 欠卷` 必须只有一个最终 `commit edge`，不能出现“章节结算写一次、周切换再写一次”的双写 verdict。

---

## 1. 本轮只要闭合什么

下一轮不追求把所有结算后果一次性放大，而是先闭合一个最小可玩链：

1. 周末生成一条稳定的 `week verdict ledger`。
2. `欠卷` 会进入可追踪的 `debt pack` 生命周期。
3. 未清债账会真实占用 `heavenly mandate` 的一个强目标位。
4. 玩家能在 Reward / Sanctum / payload 三处一致看到：
   - 这周押成了什么
   - 当前欠着什么
   - 这笔账是否已经挤进下周安排
   - 现在该去主验证，还是先补旁验证
5. 主验证 / 旁验证结果能把状态回写到：
   - `seasonBoard`
   - `heavenlyMandate`
   - `lineage`

如果资源只够做一个最小闭环，应优先保留：

1. `week verdict ledger`
2. `debtPack.status + deferCount`
3. `heavenlyMandate` 单个强目标位占用
4. 主验证成功 / 拖延两条回写

这个最小闭环必须依赖一个单一收口点：

1. 只在本周最终结算 commit 时写入 `verdictResult`
2. Reward 页负责“这周发生了什么”
3. Sanctum / 周目标层负责“下周因此被改了什么”
4. `ledger` 只记录结果，不反向成为新的 runtime 判定 owner

可以后置到下一刀的内容：

1. 更厚的历史页
2. 更多验证入口包装
3. 更复杂的多债账并行排班
4. 更华丽的谱系奖励层

---

## 2. 这一轮真正的可玩性增量

下一轮的可玩性，不来自“看见更多解释”，而来自三个真实的资源冲突：

1. `冲榜` 和 `清债` 开始争夺同一周的强目标位。
2. `主验证` 和 `旁验证` 不再是两个说明按钮，而是两种不同强度的押注方式。
3. `拖延` 不再只是保留文案，而是会挤掉下周的自由成长机会。

因此本轮所有实现都要服务同一条 Dynamics：

> 让玩家开始判断“我这周先清账，还是继续押榜；我现在去打主验证，还是先补一张旁证；如果我继续拖，会不会把下周排班压死”。

---

## 3. 分阶段开发拆解

## 3.1 Phase A：周裁定账本 + 债账占位

### 目标

先把“结果会留下什么”做硬，而不是先做更多入口。

### 玩家可见收益

1. 本周裁定不再只存在于章节结算页，而会变成下一周仍然可见的一条账本记录。
2. `欠卷` 会明确显示为“已占用下周强目标位”，而不是只写一句提醒。
3. 玩家能立刻感受到：拖延真的会挤掉自己的自由目标。

### 最小交付

1. `week verdict ledger`
2. `debtPack.status`
   - `open`
   - `deferred`
   - `cleared`
3. `debtPack.deferCount`
4. `debtPack.carryIntoWeekTag`
5. `heavenlyMandate` 单个强目标位占用
6. Reward / Sanctum / payload 三处对同一占位事实口径一致

如果 A 阶段只做一个可发布最小包：

1. `verification_ready` 可以只保留字段，不强求首轮行为。
2. `degraded` 可以先作为保留字段或 Phase C 收口项，不必在第一刀就扩成完整状态流。

### 主要 owner

1. `agenda`
   - 只保留债账来源、责任与主题
2. `seasonBoard`
   - 负责生成 ledger
   - 负责更新 debt pack 生命周期
3. `heavenlyMandate`
   - 负责把未清债账投影成一个强目标位
4. `aftereffect`
   - 只补压力文案和偏置，不定义债账状态

### 建议代码切入

1. `js/game.js`
   - 优先从 `buildSeasonBoardSettlementState()`
   - `getSeasonBoardSnapshot()`
   - 再落到 `normalizeSeasonBoardSettlement()`
   - `normalizeSeasonBoardDebtPack()`
   - `getSeasonBoardSignalSnapshot()`
   - `syncHeavenlyMandateState()`
   这一条主链切入
2. `js/core/collection_hub.js`
   - 只消费 ledger / debt occupation / next task，不定义规则
3. `tests/sanity_season_board_system_checks.js`
4. `tests/sanity_heavenly_mandate_system_checks.js`
5. `tests/browser_meta_screen_audit.mjs`

### 验收点

1. `debt_sheet` 生成后，能稳定产出一条 ledger 记录。
2. 同一笔债账第一次拖延后，下周恰好占用 `1` 个强目标位。
3. `sampling / lockline` 仍保留 verification backlog，但不能提前把验证动作抢成主舞台。
4. 若本阶段启用 `degraded`，连续 `2` 次拖延后才允许进入，且不能无限扩大占位。

### 本阶段绝对不做

1. 不新增 Challenge 独立页面
2. 不重做 PVP / Endless 大 UI
3. 不把 `heavenlyMandate` 改成全新四线任务系统
4. 不做多于 `1` 个强目标位的债账占位

---

## 3.2 Phase B：主验证 / 旁验证结果回写

### 目标

让现有验证入口真正改变结算后果，而不是只做“去哪里试一把”的路由提示。

### 玩家可见收益

1. 主验证成功会真的清债或升级结论。
2. 旁验证成功会增强证明质量和下周推荐，而不是伪装成第二个主验证。
3. 失手和拖延不再合并成一句失败摘要，而会留下不同的回写结果。

### 最小交付

1. 主验证成功
   - `debtPack.status -> cleared`
   - 释放占用的强目标位
   - `settlement` 可从 `risky / debt` 升到更稳定结论
2. 主验证失手
   - 保留 debt pack
   - 回写一条高质量反例样本
   - 下一周建议更保守
3. 旁验证成功
   - 不改 debt source owner
   - 只提升证明质量、推荐权重、谱系证明质量
4. 主验证 / 旁验证拖延
   - 只由 `seasonBoard` 更新 lifecycle
   - 只由 `heavenlyMandate` 消费占位结果

如果只做最小闭环：

1. 先保 `primary verification`
2. `side verification` 可先退化为不拥有状态的补强项
3. 明确不进入 `逆押验证`

### 主要 owner

1. `seasonBoard`
   - 组织 `verificationOrders`
   - 解释验证成功 / 失手 / 拖延的结算含义
2. `heavenlyMandate`
   - 只根据回写后的 debt lifecycle 决定是否继续占位
3. `lineage`
   - 只记录“这次你是怎么处理的”

### 建议代码切入

1. `js/game.js`
   - 在 `verificationOrders` 的 normalize / projection 附近补 `resultStatus`、`writebackMode`
   - 让 reward / expedition / payload 三端吃到同一回写结果
2. `js/core/collection_hub.js`
   - 只接 CTA 与状态展示
3. `tests/sanity_season_board_system_checks.js`
   - 成功 / 失手 / 拖延三路闭环
4. `tests/browser_meta_screen_audit.mjs`
   - 点进 CTA 后看 Sanctum / Reward / Challenge hub 口径是否一致

### 验收点

1. 主验证成功后，Reward / Sanctum / payload 三处都显示“已清账”，且 mandate 占位消失。
2. 主验证失手后，玩家能看到“仍欠账但推荐更保守”，而不是只剩一个失败字样。
3. 旁验证成功后，能看到 proof quality 提升，但不会错误清空 debt source。
4. `positive / risky / debt` 三种裁定都能正确决定主验证与旁验证谁先露出。

### 本阶段绝对不做

1. 不新增第三种验证 owner
2. 不让 `aftereffect` 直接决定验证成功与否
3. 不做跨所有模式的终局结算重写

---

## 3.3 Phase C：谱系最小记录 + 降级收口

### 目标

只补“长期风格被记住”的最小层，不把谱系做成新的重数值系统。

### 玩家可见收益

1. 玩家会开始看到自己是偏 `debt_recovery`、`risky_push` 还是 `deferred_cleanup`。
2. 拖延不再只是短期惩罚，而会沉淀成一种长期风格标签。

### 最小交付

1. 谱系新增三类最小风格记录：
   - `debt_recovery`
   - `risky_push`
   - `deferred_cleanup`
2. `degraded` 债账会写一条“拖延后收口”的研究记录
3. `aftereffect` 只保留持续压力与剩余章数，不承担谱系 owner

### 主要 owner

1. `lineage`
   - 记录风格标签和本周处理方式
2. `aftereffect`
   - 只提供“这笔事还在持续施压”的读题材料

### 建议代码切入

1. `js/game.js`
   - 复用现有 `lineage` snapshot 入口补最小事件写回
2. `tests/sanity_fate_lineage_system_checks.js`
3. `tests/sanity_fate_aftereffect_system_checks.js`

### 验收点

1. 清债、险押、拖延三类行为都能写成一条风格记录。
2. `aftereffect` 能展示“还有压力”，但不能改写“你欠了什么”。
3. 浏览器层只需要确认 Sanctum / Reward 可见新的风格摘要，不新增谱系独立大页。

### 本阶段绝对不做

1. 不做谱系奖励膨胀
2. 不做新外观或大数值回报
3. 不让谱系反过来驱动当前周的 debt owner

---

## 4. 最小数据合同建议

## 4.1 `weekVerdictLedger`

建议做成轻量数组或快照缓冲，不做新模式级状态机。

最小字段建议：

1. `ledgerId`
2. `weekTag`
3. `weekLabel`
4. `phaseId`
5. `sourceRunId`
6. `settlementOutcomeId`
7. `settlementOutcomeLabel`
8. `debtPackId`
9. `primaryVerificationOrderId`
10. `sideVerificationOrderId`
11. `carryoverStatus`
12. `carryIntoNextWeek`
13. `resolvedAt`

规则建议：

1. 只保留最近 `6` 条
2. 一周只保留一条主 ledger
3. `seasonBoard` 负责写，其他系统只读
4. `ledger` 只能做回看和 UI 快照，不能反向作为 runtime 判定源

## 4.2 `settlement` 显式周裁定投影

当前 `settlement` 已能表达 outcome，但下一轮建议补 4 个轻量字段，避免 consumer 反复从外层推断“这是本周最终判词”：

1. `settlementWeekTag`
2. `settlementPhaseId`
3. `settlementSource`
4. `resolutionTier`

## 4.3 `debtPack` 增量字段

当前 `debtPack` 已经有主题、说明、窗口、推荐入口等展示字段，下一轮只补生命周期字段：

1. `status`
2. `deferCount`
3. `openedWeekTag`
4. `carryIntoWeekTag`
5. `degradedAtWeekTag`
6. `occupiedMandateTaskId`
7. `clearedByVerificationOrderId`

规则建议：

1. `agenda` 生成来源字段后不再回头改解释
2. `seasonBoard` 负责 `status / deferCount / carryIntoWeekTag`
3. `heavenlyMandate` 只消费 `occupiedMandateTaskId`

## 4.4 `verificationOrder` 增量字段

最小建议：

1. `role`
   - `primary`
   - `side`
2. `resultStatus`
   - `pending`
   - `verified`
   - `failed`
   - `deferred`
3. `writebackMode`
   - `clear_debt`
   - `stabilize_sheet`
   - `boost_recommendation`
4. `resolvedRunId`

规则建议：

1. 不再依赖数组顺序猜测谁是主验证、谁是旁验证
2. `role` 比 `[0] / [1]` 更适合作为长期 consumer 合同

## 4.5 `heavenlyMandate task` 增量字段

为了避免重做整套敕令结构，建议直接在现有 task 上补最少标记：

1. `priority`
   - `forced`
   - `normal`
2. `sourceType`
   - `debt_pack`
   - `weekly_goal`
3. `sourceId`
4. `occupiesStrongSlot`

规则建议：

1. 首发只允许 `1` 个 `occupiesStrongSlot = true`
2. 默认占用 `expedition` 主线中的一个强目标，不额外新增第四玩法线
3. 如果 debt cleared，任务立即释放回普通目标密度

## 4.6 `nextTask / nextWeekGoal` 最小来源投影

下一轮的关键不是“还有一条建议”，而是玩家能明确知道：这个建议到底是由哪种结算结果推出来的。

建议最少补一层来源字段：

1. `nextTask.source`
   - `settlement`
   - `debt_pack`
   - `verification`
   - `lane`
2. 若需要更稳定的跨页复用，可补结构化投影：
   - `nextWeekGoal.title`
   - `nextWeekGoal.note`
   - `nextWeekGoal.action`
   - `nextWeekGoal.value`
   - `nextWeekGoal.source`

## 4.7 `lineage` 最小回写字段

只补最小事件，不扩展示页：

1. `researchStyleId`
2. `researchStyleLabel`
3. `sourceWeekTag`
4. `sourceOutcomeId`
5. `sourceDebtPackId`

---

## 5. Owner / Precedence 收口

这一轮最容易出错的不是字段不够，而是 owner 打架。

必须继续保持：

1. `agenda`
   - 负责“债账从哪里来”
2. `seasonBoard`
   - 负责“现在押成什么、该怎么验证、债账现在处于什么生命周期”
3. `heavenlyMandate`
   - 负责“这笔未清事项是否挤进下周强目标位”
4. `aftereffect`
   - 负责“它还在持续施压多久”
5. `lineage`
   - 负责“你是怎么处理这类账的”

绝对禁止：

1. `aftereffect` 改写 debt status
2. `lineage` 改写验证建议优先级
3. `heavenlyMandate` 解释债账来源
4. `collection_hub` 和 Reward UI 自行推导 owner

单一 `commit edge` 也必须在这里写清：

1. `seasonBoard` 只在一处最终结算流程里写 `verdictResult`
2. Reward 页展示 commit 结果，但不再二次生成 verdict
3. 周切换只消费 verdict，不再重新解释 verdict

---

## 6. 测试与门禁拆解

## 6.1 Node 合同优先级

优先扩现有 chokepoint，而不是急着新开很多测试文件。

第一优先：

1. `tests/sanity_season_board_system_checks.js`
   - `weekVerdictLedger` 生成
   - debt pack 生命周期迁移
   - primary / side verification 回写
2. `tests/sanity_heavenly_mandate_system_checks.js`
   - 强目标位占用
   - 释放与降级
3. `tests/sanity_fate_lineage_system_checks.js`
   - 风格记录写回
4. `tests/sanity_fate_aftereffect_system_checks.js`
   - aftereffect 不抢 debt owner

建议新增断言：

1. `debt_sheet -> deferred -> degraded -> cleared`
2. `risky_sheet + side verification success`
3. `positive_sheet + primary verification success`
4. `lockline` 保留 backlog 但不抢主行动
5. save migration 不丢 ledger / mandate occupation 标记
6. `verificationOrders[0/1]` 不再只靠顺序，必须能读出 `role`
7. `nextTask` 或 `nextWeekGoal` 必须能读出来源类型

## 6.2 浏览器门禁优先级

第一阶段先继续用 `tests/browser_meta_screen_audit.mjs` 收口，不急着拆新脚本。

必须覆盖：

1. Reward 页看到：
   - 本周裁定
   - 债账状态
   - 占位提示
   - 主 / 旁验证状
2. Sanctum 看到：
   - 被占用的强目标位
   - 当前推荐动作
3. payload / text render / UI 三处口径一致
4. 锁线期不提前冒“结业验证”
5. 清债成功后，占位消失且文案同步变化
6. Sanctum 首个 season-board goal / research 行动，必须与 payload 第一行动来源一致

---

## 7. 本轮最该避免的伪深度

1. 再给观察站补筛面、收藏预设或更多历史层
2. 再给 PVP / Endless 档案页补字段，但不改变本周资源分配
3. 额外新开“债账总览页”或“验证大厅页”
4. 一口气做多笔债账并行排班，导致 mandate 结构重写
5. 让 `aftereffect / lineage / mandate` 同时解释“现在先干什么”
6. 把 `逆押验证` 提前拉进下一轮，导致“结果回写层”膨胀成新子系统

判断标准只有一个：

> 这项新增，是否真的改变了玩家下周能做什么，还是只是让玩家知道得更多。

如果只是后者，就不应进入这一轮。

---

## 8. 第一刀开发建议

如果下一轮立刻转开发，建议先做：

## `A1：week verdict ledger + debtPack.deferCount + heavenlyMandate 单强目标位占用`

原因：

1. 这是最小但最真实的可玩性提升。
2. 它已经能让玩家感到“拖延有成本”。
3. 它对 `challenge / pvp / endless` 的依赖最小，不会把第一刀做成跨模块大爆炸。
4. 它能直接复用当前已有的：
   - `seasonBoard settlement`
   - `debtPack`
   - `heavenlyMandateState`
   - `collection / reward / payload` 投影链

这一刀的完成标准应是：

1. 欠卷能稳定生成 ledger。
2. 欠卷第一次拖延会占用一个强目标位。
3. 玩家能在 Reward / Sanctum / payload 同时看到这件事。
4. Node / browser 门禁都能稳定证明这件事。

只要这一刀成立，下一轮再继续补主/旁验证结果回写，节奏才是稳的。
