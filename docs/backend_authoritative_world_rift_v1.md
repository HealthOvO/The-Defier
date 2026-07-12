# 异步协作世界裂隙 V1

## 目标

在实时 PVP 和个人权威榜之外，增加一个所有真实玩家共同推进、但不要求同时在线的服务端权威玩法。

正式产品名为“天穹裂隙”，后端领域名为 `world-rift`，权威 run 模式为 `world_rift`，协议版本为 `authoritative-world-rift-v1`。

V1 复用 `authoritative-runs` 的确定性战斗、动作日志、快照、恢复、完整重放和一次性结算。客户端只提交 run ID，不提交伤害、分数、阶段或奖励资格。世界状态、个人贡献、榜单和奖励全部由服务端回执投影。

## 玩家循环

1. 玩家在观星台查看本周裂隙、当前首领阶段、全服剩余生命、个人次数和真实贡献榜。
2. 每个账号每周有 5 次正式出征。第 N 次对所有账号使用相同的第 N 号服务端种子。
3. 每次出征进入现有权威战局。选路、出牌、结束回合和奖励选择全部由服务端执行并记录。
4. 通关后，权威战局完整重放并生成 `server_authoritative` 回执；裂隙服务从回执计算本次贡献。
5. 贡献在一个原子事务中写入个人结果、最佳三次榜单投影，并推进全服首领生命和阶段。
6. 首领被击破后进入“余响”状态。玩家仍能用剩余次数完成个人里程碑与榜单，但不会产生虚假的负生命或末刀奖励。
7. 个人里程碑和已解锁的全服阶段奖励均可领取 `renown` 外观货币。

这个循环同时提供：

- 能力感：统一命盘下优化路线，最佳三次计榜；
- 关联感：每次有效通关都会推进真实全服状态；
- 自主性：5 次机会中只有最佳 3 次计榜，允许 2 次试错；
- 长期目标：三阶段首领、个人贡献和全服里程碑形成一周节奏。

## V1 规则

### 周期和次数

- UTC 周一 00:00 开始，持续 7 天。
- 每账号每轮 5 次正式出征，发车即消耗；败退、放弃和过期不返还，避免探种子。
- 已在结束前发车的 run 可在结束后 2 小时内结算和投影。
- 宽限期内不能开始新 run，只能恢复、结算、投影和领奖。
- 宽限结束后世界状态和榜单只读；奖励领取窗口持续到 `endsAt + 7 天`。

### 统一命盘

- 每轮固定 5 个种子槽。
- 所有账号的第 N 次正式出征使用相同种子槽 N。
- 种子由 `DEFIER_WORLD_RIFT_SEED_SECRET`、轮换 ID、槽位和权威内容哈希通过 HMAC 派生。
- 未单独配置时可回退 `DEFIER_HMAC_SECRET`；生产环境不得使用开发默认值。
- 玩家接口、运营接口和数据库读模型只暴露 `seedFingerprint`，不暴露原始种子。
- 正式模式使用权威目录中的固定起始牌组和数值，不读取账号命环等级、法则加成或本地存档战力。

### 贡献公式

权威回执必须为完整通关。V1 贡献公式固定写入轮换快照：

```text
quality = summary.score
survivalBonus = min(remainingHp * 3, 180)
tempoBonus = min(max(18 - turns, 0) * 15, 120)
contribution = clamp(300 + quality * 2 + survivalBonus + tempoBonus, 300, 2400)
```

- 公式只读取权威回执字段。
- 失败、放弃或未完整重放的 run 贡献为 0，且不会进入榜单。
- 每次贡献上限固定，不能靠客户端溢出数值。
- 轮换中途不修改公式；快照哈希漂移时拒绝服务。

### 全服首领

V1 有三个连续阶段：

| 阶段 | 名称 | 生命 | 累计阈值 |
| --- | --- | ---: | ---: |
| 1 | 裂隙前锋 | 2,400 | 2,400 |
| 2 | 噬界核心 | 3,200 | 5,600 |
| 3 | 天穹灾主 | 4,400 | 10,000 |

- 有效贡献按顺序穿透阶段，溢出伤害自动进入下一阶段，不浪费结算。
- 单个结果保存 `contribution`、实际推进的 `appliedDamage`、提交前后阶段和状态版本。
- 全部阶段击破后 `appliedDamage` 可以为 0，但个人贡献和榜单仍正常记录。
- 没有末刀奖励、首杀奖励或按提交时间加成。
- 全服状态更新、结果插入和个人投影在同一 `BEGIN IMMEDIATE` 事务完成。

### 个人榜

- 每个账号所有有效结果都保留。
- 正式榜分只计算贡献最高的 3 次，另外 2 次允许试错。
- 排序固定为：
  1. `rankedContribution DESC`，即最佳三次之和；
  2. `bestContribution DESC`；
  3. 最佳三次 `remainingHp` 合计 `DESC`；
  4. 最佳三次 `turns` 合计 `ASC`；
  5. 稳定 `entryId ASC`。
- 不使用提交时间作为并列字段，消除先到优势。
- 榜单只展示真实账号结果，不生成机器人名字或模拟分数。

### 奖励

奖励统一为 `renown`，`rewardImpact=cosmetic_only`。

个人里程碑按该轮全部有效贡献累计：

| ID | 目标 | 奖励 |
| --- | ---: | ---: |
| `personal-spark` | 1,500 | 40 |
| `personal-anchor` | 4,500 | 80 |
| `personal-vanguard` | 8,000 | 120 |

全服里程碑按首领阶段解锁：

| ID | 条件 | 奖励 |
| --- | --- | ---: |
| `global-phase-1` | 阶段 1 击破 | 50 |
| `global-phase-2` | 阶段 2 击破 | 90 |
| `global-phase-3` | 阶段 3 击破 | 140 |

- 全服奖励要求账号在该轮至少有 1 次有效贡献。
- 玩家晚于阶段击破时间加入，只要在结算宽限结束前完成一次有效贡献，也可以补领已解锁的全服奖励。
- 末刀玩家不获得额外奖励。
- 每个账号、轮换、里程碑只能领取一次。
- 所有里程碑可在该轮 `claimEndsAt=endsAt+7天` 前领取；下一轮 current 会继续暴露上一轮待领状态。
- claim、钱包、账本、领奖事实、mutation 回执和运营事件在同一事务提交。

## 公平与反作弊合同

正式结果必须同时满足：

- run 模式为 `world_rift`；
- run 由 world-rift 服务内部创建并绑定 attempt；
- run 在轮换结束前开始；
- receipt 在宽限结束前生成，且首次投影也发生在宽限结束前；
- `trustTier=server_authoritative`；
- `authorityLevel=server_replayed`；
- `integrity.fullReplayPassed=true`；
- receipt、run、attempt、用户、内容版本、内容哈希、stateHash、chainHead 全部一致；
- `summary.result=completed`。

玩家写接口使用 JWT、session/HMAC 签名、严格字段白名单和稳定 mutation ID。请求体禁止 `score`、`damage`、`phase`、`seed`、`reward` 等客户端权威字段。

## 状态机

attempt 状态：

```text
reserved -> active -> completed -> submitted
                    -> defeated
                    -> abandoned
                    -> expired
```

world 状态：

```text
phase_1 -> phase_2 -> phase_3 -> cleared/echo
```

- `reserved` 已原子占用额度；发车失败可用同一请求恢复。
- `current` 会同步 run 状态，并自动投影已结算但客户端未成功提交的结果。
- 世界状态只由首次成功投影改变；重复 submit/current 只返回既有事实。
- 状态版本每次首次有效贡献递增一次，供运营与客户端识别更新。

## 数据模型

迁移 `0008_authoritative_world_rift` 增加：

### `world_rift_rotations`

不可变轮换快照，包括协议/目录/规则版本、周期、结算宽限、领奖截止、次数、种子槽、贡献公式、阶段、里程碑和快照哈希。

### `world_rift_states`

每轮一行全服事实投影：

- `applied_damage`：最多等于总生命；
- `total_contribution`：包含击破后的余响贡献；
- `current_phase_index`、`cleared_at`；
- `state_version`、最后结果和更新时间。

### `world_rift_attempts`

保存账号、轮换、clientAttempt/mutation、序号、种子指纹、client run、权威 run、状态和时间。唯一约束覆盖 mutation、轮换内序号、clientAttempt 和 run。

### `world_rift_contributions`

不可变贡献事实：attempt/run/receipt 绑定、权威 summary、贡献值、实际世界伤害、阶段变化、世界状态版本和完整性摘要。

### `world_rift_entries`

每账号每轮一行可重建榜单投影：全部贡献、最佳三次计榜分、最佳单次、最佳三次回合/血量合计、完成次数和稳定 entry ID。

### `world_rift_reward_claims`

个人/全服里程碑的唯一领奖事实，绑定账本 entry。

### `world_rift_mutations`

保存 start/submit/claim 请求哈希和脱敏回执。相同 mutation 同业务体幂等返回，改参返回 `409 mutation_reused`。

### `world_rift_ops_events/counters`

只保存脱敏 `accountRef`、事件、结果码、有限数值和有限详情；不记录 JWT、HMAC、原始种子、动作 payload 或完整战局状态。

## API

### `GET /api/world-rift/current`

返回当前轮换、世界阶段/血量/进度、次数、可恢复 attempt、个人累计和榜单、个人/全服里程碑、本人名次，以及领奖窗口内的上一轮待领信息。

读取会自动补投影当前账号已经结算但尚未投影的绑定 run。

### `POST /api/world-rift/attempts`

业务体仅允许：

```json
{
  "protocolVersion": "authoritative-world-rift-v1",
  "rotationId": "rift-2026-w28",
  "clientAttemptId": "rift-attempt-...",
  "mutationId": "rift-start-..."
}
```

服务内部创建 `world_rift` 权威 run。普通 authoritative-runs start 接口直接请求该模式必须返回 403。

### `POST /api/world-rift/contributions`

业务体仅允许 `protocolVersion/runId/mutationId`。服务端读取并验证权威回执，计算和原子应用贡献。

### `POST /api/world-rift/rewards/:milestoneId/claim`

业务体绑定 `protocolVersion/rotationId/milestoneId/mutationId`。

### `GET /api/world-rift/ops/overview`

要求 JWT actor 与 `x-defier-ops-token`。返回轮换、世界状态、attempt 终态、玩家、贡献、领奖和错误聚合，不返回账号 ID 或秘密字段。

## 客户端体验

- 观星台增加“天穹裂隙”页签，直接展示真实全服状态、当前阶段、全服进度、个人次数、贡献榜和奖励。
- 未登录、加载、错误、进行中、已击破余响、宽限和结档状态都有明确界面；读取失败不回退到伪数据。
- 正式入口跳转权威试炼面板并自动选中 `world_rift`。
- `AuthoritativeRunPanel` 增加第五种模式。发车走 world-rift 服务；权威结算后自动提交贡献并刷新世界状态。
- 网络中断保留稳定 start/submit/claim ID；切换账号后旧响应不得覆盖新账号。
- 世界页不提供会被误解为正式结果的本地模拟首领或本地奖励。
- 轮换击破后仍可继续“余响出征”，并明确说明只增加个人贡献和榜单，不再扣减生命。

## 运维与恢复

- 启动时创建当前和上一轮快照与世界状态；相同轮换 ID 的快照漂移直接失败。
- SQLite 使用 WAL、busy timeout 和 `BEGIN IMMEDIATE`；多进程同时提交不同贡献时，每个 receipt 只应用一次。
- `entries`、`ops_counters` 可从事实表重建；contributions、claims、ledger 和 authoritative receipt 是事实源。
- ops 概览必须脱敏，并能看见 attempt 状态、贡献总量、实际伤害、余响贡献、阶段和失败码。
- V1 使用轮询刷新，不引入 WebSocket；所有进程直接读取同一数据库事实，因此没有进程内缓存一致性问题。

## 验收

必须覆盖：

- V7 数据库升级到 V8、重复启动、当前/上一轮生成和目录漂移；
- UTC 周边界、结束边界和 2 小时宽限；
- 5 个统一种子槽、直接创建 `world_rift` run 被拒绝；
- 并发 start 不重复扣次数；失败/放弃消耗、同请求恢复；
- 伪造贡献/阶段/seed 字段被拒绝；
- 完整重放回执贡献公式、上下限和非通关拒绝；
- 两个进程同时提交不同结果时，世界伤害、状态版本和个人结果不丢不重；
- 单次贡献跨阶段溢出、击破后余响、无负生命、无末刀奖励；
- 最佳三次计榜、全部结果计个人累计、并列不依赖时间；
- current 自动补投影掉线后的已结算 run；
- 个人/全服奖励资格、迟到补领、跨轮宽限和多进程并发 claim；
- 钱包、ledger、claim 原子一致，奖励只为 cosmetic renown；
- ops/JWT/HMAC/账号隔离与脱敏；
- 客户端切号抑制、稳定重试 ID、正式发车/结算/领奖恢复；
- 真实浏览器完成登录、出征、完整战斗、贡献推进、榜单刷新、奖励展示和移动端检查。

## 非目标

- 不实现实时多人同场、房间、聊天、公会或好友系统；
- 不允许客户端自定义牌组或客户端分数进入正式贡献；
- 不按榜单名次发战力奖励；
- 不伪造全服参与人数或 NPC 贡献；
- 不部署线上，不修改生产数据库，不合并 `main`。
