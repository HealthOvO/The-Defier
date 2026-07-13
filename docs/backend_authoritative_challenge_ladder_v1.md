# 众生试炼权威赛道 V1

## 目标

把挑战观察站中由本地固定名字与哈希分数生成的“众生榜”，替换为真实的服务端权威赛道。

本阶段复用 `authoritative-runs` 的确定性战斗、动作日志、快照、完整重放和一次性结算，不再接受客户端上报的挑战分数。玩家获得一个可重复练习、有限次正式冲榜、可恢复、可复盘的非 PVP 多人竞争循环。

正式产品名为“众生试炼”，后端域名使用 `challenge-ladder`，协议版本为 `authoritative-challenge-ladder-v1`。

## 玩家循环

1. 玩家在挑战观察站查看本周权威轮换、剩余正式次数、个人最佳和真实榜单。
2. 每个账号每周有 3 次正式尝试。第 1/2/3 次分别绑定全服一致的种子槽，不能通过换账号存档或刷新重抽。
3. 正式尝试进入服务端权威试炼面板。所有选路、出牌、结束回合和奖励选择继续由现有 `authoritative-runs` 执行。
4. 通关后先由权威跑局完整重放并生成 `server_authoritative` 回执，再由赛道服务读取回执计算正式分。
5. 榜单只保留每个账号的最佳成绩。低分尝试仍保留为个人历史，但不会覆盖更高分。
6. 玩家可以继续进行不限次数的本地挑战练习；练习成绩明确标记为 `offline_practice`，不进入正式榜、不发权威奖励。

这个循环同时覆盖三类动机：

- 成就：有限次数内优化路线和分数；
- 探索：每周轮换不同计分侧重；
- 社交比较：真实榜单、个人名次和统一规则。

## 公平合同

### 权威来源

正式结果必须同时满足：

- run 模式为 `challenge_ladder`；
- run 由赛道服务创建并绑定当前轮换和尝试序号；
- 回执 `trustTier=server_authoritative`；
- 回执 `authorityLevel=server_replayed`；
- `integrity.fullReplayPassed=true`；
- run、attempt、receipt、账号、轮换完全一致；
- run 在轮换结束前开始，并在结算宽限结束前完成结算。

客户端提交的 `score/turns/hp/grade/seed` 一律不进入业务体，也不作为正式结果来源。

### 统一种子

- 每周轮换固定 3 个种子槽。
- 同一轮换的第 N 次正式尝试对所有账号使用相同种子槽 N。
- 种子由服务端 secret、轮换 ID、槽位和内容哈希通过 HMAC 派生。
- API、榜单、运营聚合和数据库公开读模型只暴露不可逆 `seedFingerprint`，不返回原始种子。
- 生产环境优先读取 `DEFIER_CHALLENGE_LADDER_SEED_SECRET`，未配置时回退到 `DEFIER_HMAC_SECRET`；生产环境不得使用内置开发 secret。

### 尝试额度

- 每个账号、每个轮换最多 3 次正式尝试。
- 已发车的败退、放弃和过期均消耗一次，避免重抽开局。
- 同一 `clientAttemptId` 与相同业务体重试返回原尝试，不重复消耗。
- 同一 `mutationId` 改参复用返回 `409 mutation_reused`。
- 正在进行的正式尝试优先恢复，不允许并发开启第二条同模式 run。

### 排名与并列

排序固定为：

1. `officialScore DESC`；
2. `turns ASC`；
3. `remainingHp DESC`；
4. `submittedAt ASC`；
5. `resultId ASC`。

同一账号只展示最佳结果。新结果只有严格优于现有最佳时才替换榜单投影。

### 计分轮换

权威跑局回执中的 `summary.score` 为基础分。每周从版本化目录中轮换一种侧重：

- `balanced`：正式分等于基础分；
- `tempo`：在基础分上加入有上限的低回合奖励；
- `survival`：在基础分上加入有上限的剩余生命奖励。

所有公式、上限、标题、说明和奖励门槛都写入不可变轮换快照。服务端不在轮换中途修改公式。

## 时间边界

- 周期以 UTC 周一 00:00 开始，持续 7 天。
- 新尝试只能在 `[startsAt, endsAt)` 内创建。
- 已开始的尝试可在 `endsAt` 后 2 小时内完成权威结算与榜单投影。
- 归属以赛道 attempt 的 `startedAt` 为准，不使用客户端时间。
- 宽限结束后不再接受新结果；历史榜和个人回执保持只读。

## 状态机

attempt 状态：

```text
reserved -> active -> completed -> submitted
                    -> defeated
                    -> abandoned
                    -> expired
```

- `reserved`：额度已原子占用，正在创建绑定的权威 run；同请求可恢复发车。
- `active/completed`：跟随权威 run 状态。
- `submitted`：权威回执已投影为不可变赛道结果。
- `defeated/abandoned/expired`：终态保留尝试证据，不生成正式分。

网络中断不能创建额外次数。若权威 run 已结算但客户端未成功提交榜单，下一次读取当前赛道时由服务端自动补投影。

## 数据模型

迁移 `0007_authoritative_challenge_ladder` 增加：

### `challenge_ladder_rotations`

保存按周生成的不可变轮换快照：

- `rotation_id`、目录/协议/规则版本；
- 起止时间和结算宽限；
- 尝试上限、计分模式、计分参数；
- 里程碑与展示文案；
- 内容哈希和创建时间。

同一 `rotation_id` 的内容哈希变化视为 catalog drift，启动或请求应失败，不静默覆盖。

### `challenge_ladder_attempts`

保存账号绑定的正式尝试：

- `attempt_id`、`user_id`、`rotation_id`；
- `client_attempt_id`、`mutation_id`、请求哈希；
- `attempt_index`、`seed_slot`、`seed_fingerprint`；
- `client_run_id`、`run_id`；
- 状态和各阶段时间。

唯一约束覆盖账号/轮换/尝试序号、账号/轮换/clientAttemptId、run ID。

### `challenge_ladder_results`

保存每次成功正式结算的不可变结果：

- attempt/run/receipt/account/rotation 绑定；
- 基础分、正式分、计分加成；
- grade、turns、remainingHp、damageTaken；
- stateHash、chainHead、提交时间。

结果不保存原始动作 payload、服务端种子或完整状态。

### `challenge_ladder_entries`

每账号每轮换一行最佳成绩投影，保存最佳 result、分数、并列字段、正式完成次数和更新时间。该表可从 results 重建，不是结算证据源。

### `challenge_ladder_reward_claims`

保存个人里程碑的唯一领奖记录。奖励固定为统一钱包中的 `renown`，`rewardImpact=cosmetic_only`。

### `challenge_ladder_mutations`

保存 start/submit/claim 的 mutation 类型、请求哈希和脱敏响应回执。相同 mutation 和相同请求幂等返回，改参复用冲突。

### `challenge_ladder_ops_events/counters`

保存脱敏运行事件与聚合计数。账号只记录不可逆 `accountRef`；不记录原始 seed、JWT、HMAC、动作 payload 或完整状态。

## API

所有玩家写接口要求 JWT 与 session/HMAC 签名。

### `GET /api/challenge-ladder/current`

返回：

- 当前轮换及状态；
- 尝试上限、已用/剩余次数；
- 当前可恢复尝试；
- 个人最佳、里程碑和领取状态；
- 若上一轮仍在领奖宽限期，返回上一轮个人最佳与可领取里程碑；
- 前 20 名真实榜单和本人名次；
- 公平、离线练习和结算宽限说明。

读取会自动补投影已结算但未提交的绑定 run。首次投影必须发生在该轮 `graceEndsAt` 之前；宽限结束后只允许读取已经落库的幂等结果，不能再改变正式榜。

### `POST /api/challenge-ladder/attempts`

业务体：

```json
{
  "protocolVersion": "authoritative-challenge-ladder-v1",
  "rotationId": "acl-2026-w28",
  "clientAttemptId": "acl-client-attempt-...",
  "mutationId": "acl-start-..."
}
```

返回 attempt 与绑定的 authoritative run。服务端直接调用内部权威发车能力，客户端不能通过普通 `authoritative-runs` start 接口创建 `challenge_ladder` 模式。

### `POST /api/challenge-ladder/results`

业务体只包含 `protocolVersion/runId/mutationId`。服务端读取 attempt 和权威回执计算分数。

### `POST /api/challenge-ladder/rewards/:milestoneId/claim`

业务体绑定 `protocolVersion/rotationId/milestoneId/mutationId`。claim、统一钱包余额、追加式 ledger、mutation 回执和 ops event 在同一 `BEGIN IMMEDIATE` 事务提交。

### `GET /api/challenge-ladder/ops/overview`

要求 JWT actor 与 `x-defier-ops-token`。只返回轮换/尝试/终态/结果/玩家/领奖聚合和错误计数，不返回账号 ID、seed 或动作内容。

## 客户端接入

- `BackendClient` 增加 challenge-ladder 路径和四个玩家接口。
- 新增账号绑定的 `ChallengeLadderService`，防止切号后旧响应覆盖新账号。
- `AuthoritativeRunPanel` 增加“众生试炼”模式；发车必须走 challenge-ladder start，普通模式仍走原接口。
- 权威结算成功后自动提交赛道结果；网络失败时保留回执，后续 current 自动恢复。
- 挑战观察站的 `global` 页不再生成假名字或假分数：
  - 已登录：显示服务端榜、本人名次、次数和轮换规则；
  - 未登录/离线：显示“离线练习，不计正式榜”，榜单为空；
  - 读取失败：保留重试入口，不回退到伪榜。
- 正式入口与离线练习并列展示，玩家不会因后端暂时不可用而失去本地玩法。
- 登录后的 `global` 主摘要、规则、次数、榜单与奖励只读取服务端 rotation/current；旧本地 global 规则仅用于明确标注的离线练习和离线档案，不再渲染或发放旧 `claim-milestone` 奖励。

## 奖励边界

- 里程碑奖励只发 `renown`，只用于外观和账号展示。
- 不发卡牌、属性、开局资源、匹配优势、PVP 积分或可交易资产。
- 排名本身 V1 不直接发奖励，避免小样本榜和结算窗口造成挫败；奖励来自可达成的个人里程碑。
- 每个里程碑每账号每轮换只能领取一次。

## 安全与恢复

- 所有请求使用严格字段白名单和 payload 大小限制。
- 账号越权读取 attempt/run/result 统一返回 404。
- start、submit、claim 都有稳定 mutation 和请求哈希。
- 轮换内容哈希不可变；目录漂移拒绝服务而不是改写历史。
- entries 是可重建投影；results 和 authoritative receipt 是事实源。
- 服务启动、current 读取和 ops reconcile 都能修复“run 已结算、result 未投影”。
- SQLite 写路径使用 `BEGIN IMMEDIATE`，并发发车、提交和领奖不能重复扣次数或发奖励。

## 兼容边界

- 旧本地 daily/weekly/global challenge 存档继续读取。
- 旧 `global` 分数不迁入正式榜，因为没有权威回执。
- `client_observed` 和 `server_verified` 结果只能用于本地档案或非竞争进度，不能升级为正式榜结果。
- 本阶段不改 live PVP 排位、PVP 赛季榜、旧 PVP 钱包或主线存档格式。

## 验收

必须覆盖：

- V6 旧数据库升级到 V7；重复启动和目录漂移；
- UTC 周边界与 2 小时结算宽限；
- 三账号共享种子槽、公平排序和本人名次；
- 并发发车、同 clientAttempt/mutation 重试、改参复用；
- 直接创建 `challenge_ladder` 权威 run 被拒绝；
- 失败/放弃消耗次数，网络重试不重复消耗；
- 完整重放回执投影、伪造客户端分数字段拒绝；
- 低分不覆盖最佳、高分替换、并列规则稳定；
- 结算后掉线的 current 自动补投影；
- 并发领奖只发一次，钱包与 ledger 原子一致；
- 账号隔离、ops 脱敏、seed/secret/payload 不泄露；
- Challenge Hub 未登录、加载、失败、正式榜和离线练习状态；
- 真实后端浏览器完成发车、战斗、结算、上榜和刷新恢复。

## 非目标

- 不把完整主线地图迁移到服务端权威执行；
- 不实现公会、聊天、好友关系或实时合作；
- 不允许自定义牌组进入正式众生榜；
- 不为榜单排名发战力奖励；
- 不部署线上，不修改生产数据库或服务器环境变量。
