# 同道远征 V1

## 1. 目标

同道远征把 S105 的道友关系与裂隙小队，从“关系、邀请和贡献汇总”推进为一条真正共享进度的异步协作玩法。

正式接力 run 使用不可变权威内容版本 `authoritative-trials-v2`；既有 `authoritative-trials-v1` 目录继续保留，仅用于旧 run 恢复与重放。

V1 的核心合同是：

> 共享战略态，不共享残局态。

队伍共享路线、章节、接力谱、完成度与回响；每位成员接棒时都进入服务端生成的标准化权威战局。上一位成员的残血、牌组、手牌、弃牌堆、临时状态和战斗 RNG 不会传给下一位。

正式产品名为“同道远征”，后端领域名为 `relay-expedition`，协议版本为 `relay-expedition-v1`。数据库 schema 升级为 V10，迁移 ID 为 `0010_relay_expedition`。当前不可变轮换使用 `relay-expedition-catalog-v2 / relay-expedition-rotation-v2`；已落盘且哈希完全匹配的 v1 周轮换只读保留，不会被新规则改写。

## 2. 玩家循环

1. 玩家先在道友录结成 2-4 人裂隙小队。
2. 队长以当前小队成员快照开启本周同道远征；开跑后不再依赖队长在线。
3. 一轮远征固定 4 棒，每棒是一条独立的服务端权威 `relay_expedition` run。
4. 当前优先成员在 6 小时内接棒；之后进入 18 小时开放窗口，任一合格成员都可接棒。
5. 接棒者从本棒允许的两到三种接力谱中选择一种，完成三战权威路线并结算。
6. 服务端从权威回执计算本棒得分、完成度与下一棒可用接力谱，再推进共享路线。
7. 第 4 棒处理完成后形成全队远征卷宗；有真实投影贡献的成员可领取外观用途荣誉。

四种体验目标：

- 自主性：接棒者选择当前允许的接力谱和权威路线。
- 能力感：每棒都有独立、完整、可恢复的三战构筑循环。
- 关联感：上一棒的权威表现决定下一棒能选择哪些标准化战术谱。
- 公平感：任何成员都不能把残局、脏牌组或永久负面状态交给队友。

## 3. 共享与隔离边界

共享战略态：

- 当前棒次与队伍顺位；
- 已完成、失败、超时和跳过的棒次；
- 每棒权威摘要与脱敏路线纪要；
- 下一棒允许的接力谱；
- 队伍路线分、成功棒数、参与成员数；
- 里程碑和领取状态。

绝不共享的残局态：

- 当前/最大生命、护盾、能量；
- 牌组、手牌、抽牌堆、弃牌堆；
- 临时 debuff、敌方当前生命和意图索引；
- 上一棒的 RNG 状态与未公开种子；
- 本地存档、命环、法则成长、PVP 配置和世界裂隙正式数据。

## 4. 标准化接力谱

所有接力谱只在同道远征中生效，不写入账号永久战力。

### `vanguard` 破阵谱

- 侧重主动进攻与较快收束；
- 使用固定 10 张破阵起始牌组；
- 路线和敌人仍由服务端种子决定；
- 不增加世界裂隙伤害或 PVP 数值。

### `bulwark` 守脉谱

- 侧重护盾、容错与稳定完成；
- 使用固定 10 张守脉起始牌组；
- 不继承上一棒生命或防御状态。

### `insight` 观星谱

- 侧重抽滤、节奏调整与路线选择；
- 使用固定 10 张观星起始牌组；
- 不读取账号已有卡牌收藏。

首棒允许三谱任选。后续棒次由上一棒权威摘要生成两个选项：

- 快速完成：`vanguard + insight`；
- 高生命完成：`bulwark + insight`；
- 其他完成：`vanguard + bulwark`；
- 败退、放弃、超时或跳过：`bulwark + insight`。

失败只会收窄为更稳的救援谱，不会制造负面开局。

## 5. 远征结果与奖励

每棒路线分只读取权威回执：

```text
completed:
  legScore = clamp(800 + authoritativeSummary.score, 800, 1600)

defeated / abandoned / expired:
  legScore = clamp(authoritativeSummary.encountersWon * 200, 0, 400)

skipped:
  legScore = 0
```

全队路线分为四棒之和，理论上限 6400。V1 不做跨队排行榜，避免先组队、活跃时区和小样本带来的不公平。

里程碑：

| ID | 条件 | 奖励 |
| --- | --- | ---: |
| `relay-first-handoff` | 至少 1 棒成功投影 | 30 荣誉 |
| `relay-route-complete` | 4 棒均已处理 | 60 荣誉 |
| `relay-harmony` | 路线分达到 5000 | 100 荣誉 |

奖励合同：

- `currency=renown`；
- `rewardImpact=cosmetic_only`；
- `powerImpact=none`；
- 账号必须在该 session 至少有 1 棒真实投影才能领取；
- 不写 PVP 排名、PVP 钱包、世界裂隙贡献、正式次数或伤害；
- claim、统一钱包、经济账本、领奖事实和 mutation 回执同事务提交。

## 6. 队伍与资格

- session 从当前周的 active 世界裂隙小队快照创建；
- 只有队长可创建，创建时必须有 2-4 名 active 成员；
- session 创建后成员快照锁定，源小队后续变化不改历史 session；
- 每账号每轮只能属于一个同道远征 session；
- 同一账号同一 session 最多完成 2 棒；
- 只要存在其他可接棒成员，同一账号不能连续完成两棒；
- 队长只有创建权限，不控制运行期接棒、投影或领奖；
- 不生成机器人补位、假在线或模拟贡献。

## 7. 时间与防卡队合同

每个待处理棒次有三段时钟：

1. `priorityUntil`：6 小时，当前顺位成员优先接棒；
2. `openClaimUntil`：随后 18 小时，全队任一合格成员可接棒；
3. `activeLeaseUntil`：接棒后 2 小时，必须完成或恢复该权威 run。

规则：

- 优先成员可以主动“让棒”，立即把优先权交给下一位；
- `priorityUntil` 到期只开放接棒，不跳过本棒；
- `openClaimUntil` 到期仍无人接棒时，本棒记为 `skipped` 并自动推进；
- active lease 到期时，底层权威 run 过期，本棒记为 `expired` 并自动推进；
- 失败、放弃、超时和跳过都不会阻塞下一棒；
- 四棒都处理后 session 进入 `completed`，卷宗按实际结果展示，不伪造通关。
- 四棒完整理论窗口为 `4 * (6h + 18h + 2h) = 104h`；之后每个轮换独立保留 7 天领奖窗口，因此周初可能同时存在 N-1、N-2 两条仍可领奖历史卷宗。

所有截止判断必须在取得 SQLite 写锁后重新读取服务端时间。排队等待写锁不能跨过截止继续写入。

## 8. 状态机

Session：

```text
forming -> active -> completed
                  -> abandoned
                  -> expired
```

Leg：

```text
queued -> reserved -> active -> settled -> projected
   |          |          |          |
   |          |          |          -> reconciled/projected
   |          |          -> expired
   |          -> launch_recoverable
   -> skipped
```

约束：

- 一个 session 同时只能有一个 `reserved/active/settled` leg；
- `(session_id, leg_index)` 唯一；
- `run_id` 非空时全局唯一；
- route projection 每个 leg 只能应用一次；
- session 的 `state_version` 每次首次投影或跳过递增一次。

## 9. 权威 run 绑定

- 新增内部受限模式 `relay_expedition`；
- 公共 `/api/progression/authoritative-runs` 直接发车必须返回 403；
- relay 服务通过内部 binding、服务端种子和标准化接力谱发车；
- 每棒仍是一条 account-owned authoritative run，不把一条 run 改成多账号共同拥有；
- 动作、快照、完整重放、一次性 settlement 和账号越权继续复用现有权威引擎；
- relay submit 只接受 `runId + mutationId`，客户端不得上传分数、生命、路线结果、接力谱解锁或奖励。

权威内容目录增加三种 relay scenario。每种 scenario 都使用固定 max HP、能量、手牌数、三战路线和 10 张标准化牌组。目录版本与 hash 不可变，旧 catalog 继续保留用于历史重放。

## 10. 数据模型

迁移 `0010_relay_expedition` 新增：

### `relay_expedition_rotations`

保存周轮换、起止/宽限/领奖时间、棒次数、窗口、接力谱、公式、里程碑、内容版本和不可变快照 hash。

### `relay_expedition_sessions`

保存 session、轮换、源裂隙小队、队长快照、状态、当前棒次、active leg、路线分、成功/已处理棒数、参与人数、共享路线 JSON/hash、state version 和终态时间。

### `relay_expedition_members`

保存 session 成员快照、账号、profile、显示名、seat、状态、已接/已投影棒数、最近棒次和锁定时间。

### `relay_expedition_legs`

保存 session/leg index、优先成员、runner、接力谱、client leg/run id、run/receipt、状态、请求 hash、种子 fingerprint、权威摘要、路线分、handoff options 和各阶段时间。

### `relay_expedition_reward_claims`

保存账号、session、milestone、金额、账本 entry 和领取时间。唯一约束覆盖账号/session/milestone。

### `relay_expedition_mutations`

保存 create/claim/pass/project/claim_reward 的请求 hash 与脱敏回执。相同 mutation 同请求返回原回执，改参复用返回 `409 mutation_reused`。

### `relay_expedition_ops_events/counters`

只保存脱敏 account/session/run 引用、事件、结果码和有限数值，不记录 JWT、HMAC、原始 seed、完整动作 payload、牌序或内部用户 ID。

## 11. API

所有写接口要求 JWT 与绑定 method/path 的 `session-v2` HMAC。

### `GET /api/relay-expeditions/current`

返回当前轮 session、仍在各自领奖窗口内的全部历史 session、成员、棒次、优先/开放/active lease、允许接力谱、可恢复 run、路线分、卷宗与里程碑。`previousSession` 保留为最新历史兼容别名，`previousSessions` 是完整有序列表；仍在进行的历史 session 可作为主操作面板继续接棒。读取会执行以下恢复：

- reserved 但未 bind run：按稳定 clientRunId 重试发车；
- run 已终态但 leg 未同步：同步 leg 状态；
- receipt 已存在但未投影：自动补投影；
- 时间窗口已过：首次写入 skip/expire 并推进下一棒。

### `POST /api/relay-expeditions/sessions`

业务体：`protocolVersion/rotationId/sourceSquadId/clientSessionId/mutationId`。

### `POST /api/relay-expeditions/legs/claim`

业务体：`protocolVersion/sessionId/legIndex/tacticId/clientLegId/mutationId`。服务端预留 leg 后在事务外发车，再回写 run binding。

### `POST /api/relay-expeditions/baton/pass`

业务体：`protocolVersion/sessionId/legIndex/mutationId`。仅当前 priority member 可让棒，不能作用于已 reserved/active leg。

### `POST /api/relay-expeditions/legs/:legId/project`

业务体：`protocolVersion/sessionId/legId/runId/mutationId`。服务端读取 run 与权威 receipt 计算路线投影。

### `POST /api/relay-expeditions/rewards/:milestoneId/claim`

业务体：`protocolVersion/sessionId/rotationId/milestoneId/mutationId`。服务端会先恢复目标历史 session 的迟到权威终态/receipt，再判断真实贡献和里程碑；不能依赖玩家先打开 current 页面。

### `GET /api/relay-expeditions/ops/overview`

要求 JWT actor 后再校验 ops token，只返回聚合和脱敏引用。

## 12. 事务与崩溃恢复

### 创建 session

同一 `BEGIN IMMEDIATE` 内复核源小队、成员数量、账号唯一 session 约束，写 session、成员快照、四条 queued leg、mutation 和 ops event。

### 接棒发车

1. 写事务内校验窗口、顺位、接力谱和唯一 active leg，预留 runner/clientRunId；
2. 事务外调用内部 `issueAuthoritativeRun`；
3. 第二个写事务重新校验 reserved row 后绑定唯一 runId。

进程在 1/2/3 任一窗口退出时，`current` 使用稳定 clientRunId 收敛到同一 run。若调用已明确失败或绑定时租约已过，补偿事务会同时释放 reservation、回滚成员 claimed 计数并把已创建但未绑定的权威 run 标记为 expired；相同过期 clientLegId 不得重新绑定，新的领取标识可以正常发车。

### 投影

单个 `BEGIN IMMEDIATE` 内完成：

- 验证 leg/session/runner/run/receipt/content/state hash；
- 计算 leg score 和 handoff options；
- 写 leg 不可变摘要；
- 更新 session route state 与计数；
- 更新成员参与计数；
- 开放下一棒或完成 session；
- 写 mutation 与 ops event。

### 领奖

恢复后的 session、claim fact、统一钱包、追加式 ledger、mutation 和 ops event 同事务提交；多个仍在窗口内的历史 session 各自按 rotationId/sessionId 领取，客户端按钮不得误用当前 session。

## 13. 客户端体验

道友录“裂隙小队”页增加同道远征工作区：

- 尚未满足 2 人时显示缺少成员，不生成假成员；
- 队长可开启本周远征；
- 显示 4 棒路线、当前优先人、倒计时、开放接棒和 active lease；
- 接棒前以接力谱单选控件展示标准化牌组方向；
- 接棒后复用权威试炼面板完成三战；
- 结算后自动 project 并回到共享路线；
- 每棒显示脱敏摘要，不显示他人手牌、抽牌序或隐藏 seed；
- 明确展示“共享路线，不共享残血与牌组”；
- 账号切换立即清空 relay 状态，旧响应不得回灌；
- 桌面、390px 移动端无横向溢出，loading/empty/error/expired/recoverable 都有可执行动作。

## 14. 运维与保留

- 启动时生成当前/上一轮不可变轮换；snapshot hash、snapshot JSON 与所有运行时标量/JSON 列必须逐项一致，任一 drift 都 fail closed；
- SQLite 使用 WAL、busy timeout 和 `BEGIN IMMEDIATE`；
- session/leg/claim 是事实，聚合 counters 可重建；
- completed/expired session 保留 90 天，原始 ops events 保留 30 天，聚合计数长期保留；
- 不在运维响应或日志中输出 token、seed、牌序、完整 state 或动作 payload。

## 15. 验收门禁

- V9 升 V10、重复启动、旧用户/存档/PVP/裂隙/社交数据保留；
- 2/3/4 人创建成功，1 人/5 人/非队长/跨小队创建拒绝；
- 同账号同轮唯一 session，session 启动后 roster 快照不可漂移；
- priority/open/active lease 三段边界和写锁跨截止重检；
- 并发 claim 只能产生一个 runner 和一个 authoritative run；
- reserve->launch、launch->bind、settle->project 三个崩溃窗口可恢复；
- launch->bind 跨租约失败会释放棒次、回滚成员计数并作废孤儿 run，旧 clientLegId 不会重新绑定 terminal run；
- 公共 API 直接发 `relay_expedition` 被拒绝；
- 伪造 score/hp/reward/handoff 字段被拒绝；
- 三种接力谱均为标准化满血/固定牌组，不继承上一棒残局；
- 败退、放弃、超时、跳过都会推进且不会卡队；
- 非连续接棒、每人最多两棒和主动让棒规则；
- 重复 project/claim reward 幂等，改参 mutation 冲突；
- 跨周迟到 receipt 可在直接领奖时恢复，N-1/N-2 多条有效领奖窗口同时可见且按各自 session 领取；
- 钱包/账本/claim 原子一致且只为 cosmetic renown；
- PVP 与 world-rift 正式数据在完整 relay 流程前后保持不变；
- 客户端切号抑制、断线恢复、稳定重试 ID；
- 真实浏览器覆盖两账号组队、开跑、第一棒完整战斗、第二账号接棒、投影、领奖与刷新恢复；
- 桌面和 390px 截图、0 console error、release report 结构完整。

## 16. 非目标

- 不做实时多人同场、共享操作或共享残局；
- 不做聊天、语音、表情、观战或公开动态；
- 不做交易、赠礼、借牌、借角色或资源转移；
- 不做机器人补位、AI 代打或模拟贡献；
- 不做跨队排行榜和排名战力奖励；
- 不修改 live PVP 战斗、排位或匹配规则；
- 不把 relay 业务塞进 world-rift、social squad 或 authoritative-runs 服务；
- 不允许客户端结果成为路线事实源。
