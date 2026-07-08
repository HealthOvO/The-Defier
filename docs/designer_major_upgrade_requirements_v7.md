# The Defier《逆命者》V10.0 真正 PVP 可开发需求拆解 V7

## 0. 文档定位

本文是 `docs/designer_major_upgrade_planning_v8.md` 的开发拆解文档。

阶段说明：本文包含当时建议的目录、模块名、接口路径和测试文件名。当前阶段不把这些具体落点视为已冻结事实；若与 `docs/designer_major_upgrade_overall_plan_v1.md` 或开发时最新仓库结构冲突，以主方案的非文件级合同和后续重新生成的实施计划为准。

目标是把 `V10.0《天命对弈》` 从策划方向拆成可执行需求，覆盖：

1. 范围边界
2. 数据模型
3. REST API
4. WebSocket 消息
5. 服务端战斗引擎
6. PVP 规则矩阵
7. 前端状态机
8. 断线、超时、投降、无效局
9. 测试与发布门禁
10. 分阶段交付计划

本文不要求一次性实现所有后续扩展。首版只交付 `服务端权威真人回合制 PVP` 的最小闭环。

## 1. 总体范围

### 1.1 必须实现

1. 真人在线匹配。
2. live match 房间。
3. 服务端权威战斗状态。
4. WebSocket 状态同步。
5. 服务器校验行动。
6. 服务器结算胜负、段位、经济。
7. PVP 专属规则层。
8. 首轮反 OTK 护栏。
9. 断线重连。
10. 超时收口。
11. 投降。
12. 赛后复盘。
13. 事件日志回放基础。
14. 正式排位与练习残影模式拆分。

### 1.2 首版不做

1. 多实例分布式房间。
2. Redis 强依赖。
3. 观战。
4. 锦标赛。
5. ban/pick。
6. 全卡无禁限天梯。
7. 复杂聊天系统。
8. 公会战。
9. 生产自动扩容。

### 1.3 兼容要求

必须保留：

- 当前残影 / 镜像演武作为练习。
- 当前 PVP 排名、经济、商店、历史展示。
- 当前对手档案、DRI、约战单、赛后复盘的可复用表达。

必须改变：

- 正式 PVP 不再用 `GhostEnemy` 作为主要对手。
- 正式 PVP 不再由客户端上报 `didWin` 决定结算。
- 正式排位不再在无真人时自动切残影。

### 1.4 当前主方案增补范围

以下内容来自 `docs/designer_major_upgrade_overall_plan_v1.md` 的后续打磨，是当前 V10 真 PVP 的整体需求输入。即使本文早期章节没有逐项展开，进入开发前也必须纳入重新生成的实施计划和验收口径。

- 首战引导：首次进入真人排位时必须解释真人对手、正式积分和练习隔离；必须提供规则短卡、推荐斗法谱、可选的排位前演武，以及首败后的关键回合复盘入口。
- 赛季变更沟通：平衡数值、合法牌池、规则版本和赛季重置变化必须对玩家可见；已入队或已开局对局继续使用入队时的规则快照，旧回放必须能解释当时使用的规则版本。
- 对局手感：排队等待、扩圈、长等待选择、准备、行动提交、accepted、rejected、duplicate、`sync_required`、需要刷新、行动待确认、对手思考计时、弱网恢复和动画跳过都必须有明确状态。
- 低干扰社交：首版只允许预设表情、静音、限频、举报、拉黑、再战、好友约战和脱敏战报分享；不提供自由文本聊天和实时观战入口，社交动作不得影响正式积分、匹配评分或奖励。
- 娱乐性与再来一局：公平、可用之外，还必须证明局内有悬念、优势会变化、结算后有下一步行动入口，且不会用暗改匹配或数值补偿制造“爽感”。
- 流派探索：8 套基准谱必须有各自爽点、技能测试、公开弱点、替换卡位、练习课题和代表 replay；熟练度奖励只能提供表达，不提供排位强度。
- 先手与开局信息：先手 / 座位必须服务端锁定并可审计；排位对手信息按 `queueing / matched / setup / active / finished` 分层揭示，避免看标签 dodge。
- 模式奖励与 drill：排位、练习、好友约战、关键回合复现和战报分享必须有统一计数 / 奖励矩阵；复盘生成练习必须通过 `drillScenario` 合同脱敏，不还原对手隐藏答案。
- 复合终局与计时：双死、超时撞致死、断线发生在 settling、结算写入失败等边界必须按主方案终局优先级处理；ready、行动、grace、settling 等计时 SLA 必须进入 HUD 和争议字段。
- 赛季与留存：赛季奖励按快照、申诉窗口、`reward_hold` 和补发 / 撤销口径处理；`replay_self / replay_public / audit_safe / server_full` 必须有保留期和降级规则。
- 支撑文档漂移审计：主方案的玩法、公平、上线门槛优先级最高；内容包、UI 文案样例、fixture 和本文只能作为支撑合同。若与主方案或最新仓库结构冲突，开发前必须完成冲突裁定并重新生成实施计划。

## 2. 职责域映射示例

### 2.1 后端职责域示例

以下结构是早期按当时仓库状态推导的候选映射，不是当前冻结落点。进入开发前必须按主方案 `10.10 实施计划生成门禁` 重新确认。

```text
server/pvp-live/
  content/
    pvp-live-v1-cards.js
    pvp-live-v1-loadouts.js
    pvp-live-v1-identities.js
    pvp-live-v1-bots.js
  engine/
    rng.js
    state.js
    rules.js
    reducer.js
    state-view.js
    replay.js
  errors.js
  db.js
  loadout.js
  live-match-service.js
  live-queue-service.js
  live-presence-service.js
  live-settlement-service.js
  live-ws.js
```

职责域：

- `engine/`：纯战斗逻辑，不访问 Express、SQLite、WebSocket、DOM。
- `live-match-service.js`：创建、读取、推进、结束 match。
- `live-queue-service.js`：排队与匹配。
- `live-presence-service.js`：在线、心跳、断线、重连。
- `live-settlement-service.js`：段位、经济、历史、赛季任务结算。
- `live-ws.js`：WebSocket 连接、认证、room 广播。

### 2.2 前端职责域示例

以下结构只作为候选映射：

```text
js/services/pvp-live-service.js
js/scenes/pvp-live-scene.js
js/core/pvp-live-battle-adapter.js
```

职责域：

- `pvp-live-service.js`：REST + WebSocket 客户端。
- `pvp-live-scene.js`：匹配、准备、真人对局、重连、结算 UI 状态。
- `pvp-live-battle-adapter.js`：把服务端 `StateView` 映射到 live PVP UI 展示模型。

新增体验职责：

- 支持首战引导、规则短卡、推荐斗法谱、排位前演武和首败复盘的入口表达。
- 支持匹配等待扩圈、真人较少、继续等待、取消匹配和进入问道练习的状态表达；练习不得写入正式积分。
- 支持行动提交、裁定中、accepted、rejected、duplicate、`sync_required`、需要刷新、行动待确认和弱网恢复的可见反馈。
- 支持预设表情、静音、限频、举报、拉黑、再战、好友约战和脱敏战报分享；不得暴露自由文本聊天、实时观战或完整双方隐藏信息。
- 支持赛季补丁、合法牌池变化、规则版本变化和赛季重置的玩家可见提示。

### 2.3 现有模块复用

可复用：

- `server/routes/pvp.js` 的 rank/economy/shop/history 逻辑。
- `server/middleware/auth.js`。
- `js/services/backend-client.js` 的认证请求模式。
- `js/services/pvp-service.js` 的档案、DRI、经济、历史、商店逻辑。
- `js/scenes/pvp-scene.js` 的页面框架、tab、结果页入口。

需要隔离：

- `GhostEnemy` 只用于练习、托管、回放对照，不用于正式排位主对手。
- `js/core/battle.js` 不能直接作为服务端权威引擎，需要抽纯逻辑子集。

### 2.4 历史映射示例

本节是当时仓库结构下的映射示例，不是当前已冻结的开发文件清单。进入开发前必须先做文档漂移审计，再按最新 worktree 重新生成实施计划；不得把本节路径直接复制成任务拆分。

后端接入：

- 若开发时仍沿用 `server/app.js` 作为后端入口，应避免新增第二套启动入口。
- 若开发时仍沿用 Express 路由，可以把 live API 映射为独立路由并挂载到当前服务；具体路径需由实施计划重新确认。
- 旧排行榜、经济、商店、残影练习和历史展示应与 live ranked 权威链路隔离；具体承载文件由实施计划确认。
- WebSocket 应绑定到当前 HTTP server 或当时确认的实时通信入口；具体模块名不在本阶段冻结。
- 若沿用当前启动结构，实施计划应先确认 app/server 导出方式和现有 REST 测试兼容性；不能让 live PVP 引入第二套不可测启动链。
- 若沿用 WebSocket 实现，服务端依赖必须只存在于后端包管理范围；不能在前端 bundle 内引入服务端 WS 包。

前端接入：

- 若开发时仍沿用现有 PVP 页面，应保留主入口语义并新增或映射 `天命排位` live 入口；具体 scene / component 名称由实施计划确认。
- 现有残影匹配不能再作为正式排位超时 fallback；只能显示为 `问道练习` 或 `残影演武`。
- 旧 rank / economy / profile 与 live REST / WS 必须职责隔离；具体 service 名称由实施计划确认。
- 前端适配层只能把 `StateView` 映射成 UI 展示模型，不在客户端推进战斗逻辑。

测试接入：

- Node 门禁必须增加 live engine、rules、backend、WS 或等价验证命令。
- 浏览器门禁必须增加 live ranked 桌面 / 移动端审计；旧 PVP ghost 审计改名或标注为 practice ghost，不得继续代表正式 PVP。

## 3. 数据库设计

### 3.1 pvp_live_queue

用途：排位排队池。

字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `queue_id` | TEXT PRIMARY KEY | 入队记录 |
| `user_id` | TEXT NOT NULL | 用户 |
| `season_id` | TEXT NOT NULL | 赛季 |
| `mode` | TEXT NOT NULL | `ranked` / `casual` |
| `rating` | INTEGER NOT NULL | 入队时分数 |
| `division` | TEXT NOT NULL | 段位 |
| `loadout_hash` | TEXT NOT NULL | 斗法谱校验 hash |
| `loadout_snapshot_json` | TEXT NOT NULL | 入队时服务端归一化后的斗法谱快照 |
| `matchmaking_entry_snapshot_json` | TEXT NOT NULL | 入队快照：规则版本、赛季、构筑 hash、身份槽、评分、段位、样本量、连接健康、入队时间 |
| `status` | TEXT NOT NULL | `queued` / `matched` / `cancelled` / `expired` |
| `created_at` | INTEGER NOT NULL | 入队时间 |
| `updated_at` | INTEGER NOT NULL | 更新时间 |
| `expires_at` | INTEGER NOT NULL | 过期时间 |

索引：

- `(status, mode, rating, created_at)`
- `(user_id, status)`

### 3.2 pvp_live_matches

用途：live match 主记录。

字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `match_id` | TEXT PRIMARY KEY | 对局 ID |
| `season_id` | TEXT NOT NULL | 赛季 |
| `mode` | TEXT NOT NULL | `ranked` / `casual` / `friendly` |
| `rule_version` | TEXT NOT NULL | 例如 `pvp-live-v1` |
| `status` | TEXT NOT NULL | `created` / `ready` / `active` / `settling` / `finished` / `invalidated` |
| `player_a_id` | TEXT NOT NULL | A 方 |
| `player_b_id` | TEXT NOT NULL | B 方 |
| `first_player_id` | TEXT NOT NULL | 先手 |
| `current_player_id` | TEXT | 当前行动方 |
| `turn_number` | INTEGER NOT NULL | 当前回合数 |
| `server_revision` | INTEGER NOT NULL | 状态版本 |
| `rng_seed` | TEXT NOT NULL | 随机种子 |
| `state_json` | TEXT NOT NULL | 当前权威状态 |
| `matchmaking_pair_snapshot_json` | TEXT NOT NULL | 配对快照：评分差、扩圈阶段、候选池大小、重复匹配结果、连接健康分类、质量标签、宽跨度原因 |
| `settlement_explanation_snapshot_json` | TEXT | 结算解释快照：终局、匹配质量、评分差、定级状态、积分公式版本和积分变化原因 |
| `winner_user_id` | TEXT | 胜者 |
| `end_reason` | TEXT | `lethal` / `surrender` / `timeout` / `disconnect` / `invalid` |
| `created_at` | INTEGER NOT NULL | 创建时间 |
| `started_at` | INTEGER | 开始时间 |
| `finished_at` | INTEGER | 结束时间 |
| `updated_at` | INTEGER NOT NULL | 更新时间 |

索引：

- `(status, updated_at)`
- `(player_a_id, created_at)`
- `(player_b_id, created_at)`
- `(winner_user_id, finished_at)`

### 3.3 pvp_live_match_players

用途：记录每方 seat、ready、连接状态和 loadout。

字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | 主键 |
| `match_id` | TEXT NOT NULL | 对局 |
| `user_id` | TEXT NOT NULL | 用户 |
| `seat` | TEXT NOT NULL | `A` / `B` |
| `rating_before` | INTEGER NOT NULL | 赛前分 |
| `rating_after` | INTEGER | 赛后分 |
| `rating_delta` | INTEGER | 变化 |
| `loadout_json` | TEXT NOT NULL | 服务端确认后的斗法谱 |
| `mulligan_json` | TEXT | 调息换牌记录，未执行则为空 |
| `ready_at` | INTEGER | ready 时间 |
| `last_seen_at` | INTEGER | 最后心跳 |
| `disconnect_count` | INTEGER NOT NULL DEFAULT 0 | 断线次数 |
| `timeout_count` | INTEGER NOT NULL DEFAULT 0 | 超时次数 |
| `settlement_json` | TEXT | 结算明细 |

唯一约束：

- `(match_id, user_id)`
- `(match_id, seat)`

### 3.4 pvp_live_match_events

用途：事件日志和回放。

字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | 主键 |
| `match_id` | TEXT NOT NULL | 对局 |
| `seq` | INTEGER NOT NULL | 对局内递增序号 |
| `server_revision` | INTEGER NOT NULL | 事件后版本 |
| `event_type` | TEXT NOT NULL | 事件类型 |
| `actor_user_id` | TEXT | 行动者 |
| `client_action_id` | TEXT | 客户端行动幂等 ID |
| `visibility` | TEXT NOT NULL DEFAULT 'both' | `both` / `actor` / `opponent` / `server` |
| `payload_json` | TEXT NOT NULL | 事件 payload |
| `public_payload_json` | TEXT | 广播给非私有观察者的脱敏 payload |
| `created_at` | INTEGER NOT NULL | 事件时间 |

唯一约束：

- `(match_id, seq)`

索引：

- `(match_id, server_revision)`
- `(match_id, client_action_id)`
- `(event_type, created_at)`

### 3.5 pvp_live_rating_ledger

用途：正式排位积分流水。

字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | 主键 |
| `match_id` | TEXT NOT NULL | 对局 |
| `user_id` | TEXT NOT NULL | 用户 |
| `opponent_user_id` | TEXT NOT NULL | 对手 |
| `result` | TEXT NOT NULL | `win` / `loss` / `draw` / `invalid` |
| `rating_before` | INTEGER NOT NULL | 赛前分 |
| `rating_after` | INTEGER NOT NULL | 赛后分 |
| `rating_delta` | INTEGER NOT NULL | 变化 |
| `coins_awarded` | INTEGER NOT NULL | 天道币 |
| `reason` | TEXT NOT NULL | 结算原因 |
| `created_at` | INTEGER NOT NULL | 时间 |

唯一约束：

- `(match_id, user_id)`

### 3.6 迁移与清理步骤

上线 DDL 顺序：

1. 新增 `pvp_live_queue`。
2. 新增 `pvp_live_matches`。
3. 新增 `pvp_live_match_players`。
4. 新增 `pvp_live_match_events`。
5. 新增 `pvp_live_rating_ledger`。
6. 若后续给旧 `pvp_match_history` 增加 live 字段，必须保持旧查询兼容。

旧表共存：

- `pvp_ranks`、`pvp_economy`、`pvp_match_history` 继续作为正式段位、经济、历史展示表。
- `pvp_defense_snapshots` 继续用于残影练习和离线对照。
- `pvp_match_tickets` 只服务旧残影练习链路；live ranked 不再发行或消费该 ticket。
- `/api/pvp/match` 保留为 practice ghost；`/api/pvp/match/result` 继续默认拒绝客户端胜负上报。

清理任务：

- `pvp_live_queue` 中 `expired/cancelled` 记录保留 7 天。
- `pvp_live_matches.finished/invalidated` 保留完整赛季，赛季结束后可归档。
- `pvp_live_match_events` 是回放真源，不得在赛季内清理。
- 服务器启动时发现 `created/ready/active` 且 `updated_at` 超过 10 分钟的旧 live match，标记为 `invalidated`，写 `server_recovered_invalid_match` event，不改排位分。

回滚策略：

- 关闭 live tab 后，旧 PVP 排行榜、商店、残影练习仍可用。
- 回滚不得重新启用客户端胜负上报作为正式排位。

## 4. REST API

所有 API 均需要登录。

### 4.1 POST /api/pvp/live/enqueue

入队。

请求：

```json
{
  "mode": "ranked",
  "loadout": {
    "characterId": "linFeng",
    "deck": [{ "id": "strike", "upgraded": false }],
    "destinyId": "foldedEdge",
    "vowId": null,
    "skillId": "heavensDefiance"
  }
}
```

响应：

```json
{
  "success": true,
  "queueId": "pvpq-...",
  "status": "queued",
  "estimatedWaitMs": 30000,
  "ruleVersion": "pvp-live-v1"
}
```

校验：

- 用户不能已有 active live match。
- 用户不能重复排队。
- loadout 必须通过 PVP 合法性校验。
- ranked 不能使用练习专属卡或禁用效果。
- 服务端必须写入归一化后的 `loadout_snapshot_json`，后续 match 使用快照，不再信任客户端重新提交的斗法谱。

匹配参数以主方案为准，首版必须至少冻结并输出以下审计字段：

| 字段 | 首版要求 |
| --- | --- |
| `ratingDeltaBucket` | `near_0_99` 为严格近分，`fair_100_199` 为长等待扩圈 |
| `tooWideRejected` | 评分差 `>=200` 时当前首版不自动匹配，除非未来版本重新冻结显式接受合同 |
| `recentRematchWindow` | 10 分钟内同一对手默认降优先级 |
| `candidatePoolSize` | 低于 8 名候选时可放宽重复匹配，但必须解释 |
| `connectionHealth` | 最近 60 秒 heartbeat、重连次数和 RTT P95 的摘要 |
| `queueCooldown` | 高频取消、未 ready 或准备断线的递进冷却；不扣正式积分 |

matchmaking snapshot 必须能从一局样本追溯：

1. 入队时为什么允许该玩家进入真人排位。
2. 配对时为什么选择这个对手而不是继续等待。
3. 若触发宽跨度，玩家是否明确接受。
4. 结算时为什么产生该积分变化。

matchmaking snapshot 版本组必须至少包含：

| 字段 | 要求 |
| --- | --- |
| `ruleVersion` | 对局规则真值，例如 `pvp-live-v1` |
| `contentPackVersion` | 合法牌池、禁用项、身份槽和基准谱版本 |
| `legalPoolHash` | 服务端归一化后的合法池摘要 |
| `normalizationVersion` | 斗法谱归一化、拒绝码和禁用转写版本 |
| `ratingFormulaVersion` | 匹配评分和可见赛季积分公式版本 |
| `seasonRulesVersion` | 本赛季奖励、段位、周目标和回访规则版本 |
| `announcementVersion` | 玩家可见变更公告版本 |

匹配质量报告必须是独立证据，不能只埋在日志中。首版字段至少包括：

| 字段 | 要求 |
| --- | --- |
| `matchId` | 能关联入队、配对、ready、终局和结算解释 |
| `ratingDeltaBucket` | `near_0_99`、`fair_100_199`、`expanded_200_399` 或 `outside_400_plus`；当前自动匹配只允许前两档 |
| `expansionStage` | 触发的扩圈阶段和等待秒数 |
| `candidatePoolSize` | 配对时可用候选池大小 |
| `closestRatingCandidate` | 是否使用入队时评分快照选择最近候选，而不是 FIFO |
| `recentRematchSuppressed` | 10 分钟内重复匹配是否被降优先级 |
| `connectionHealthA` / `connectionHealthB` | 双方 heartbeat、重连、RTT P95 摘要 |
| `newPlayerProtectionApplied` | 是否触发新玩家保护，以及保护理由 |
| `wideGapAcceptedByBoth` | 宽跨度正式局必须显式记录双方是否确认 |
| `settlementExplanationId` | 结算页展示积分变化的解释快照 |

### 4.2 POST /api/pvp/live/cancel

取消排队。

请求：

```json
{
  "queueId": "pvpq-..."
}
```

响应：

```json
{
  "success": true,
  "status": "cancelled"
}
```

### 4.3 GET /api/pvp/live/matches/:matchId

拉取权威状态，支持刷新和重连。

响应：

```json
{
  "success": true,
  "match": {
    "matchId": "pvpm-...",
    "mode": "ranked",
    "status": "active",
    "ruleVersion": "pvp-live-v1",
    "serverRevision": 42,
    "seat": "A",
    "currentSeat": "B",
    "turnDeadlineAt": 1780000000000,
    "state": {}
  }
}
```

### 4.4 POST /api/pvp/live/matches/:matchId/ready

准备。

请求：

```json
{
  "clientRevision": 0
}
```

响应：

```json
{
  "success": true,
  "ready": true,
  "bothReady": false
}
```

### 4.4.1 POST /api/pvp/live/matches/:matchId/mulligan

准备阶段调息换牌。首版每名玩家最多执行一次，可以选择 0-2 张起手牌洗回牌库并补抽等量。

请求：

```json
{
  "intentId": "mulligan-local-1",
  "intentType": "mulligan",
  "matchId": "pvpm-...",
  "ruleVersion": "pvp-live-v1",
  "stateVersion": 2,
  "payload": {
    "cardInstanceIds": ["c-a-1", "c-a-4"]
  }
}
```

响应：

```json
{
  "result": "accepted",
  "intentId": "mulligan-local-1",
  "serverRevision": 3,
  "stateView": {}
}
```

校验：

- 仅 `ready` 前、`battle_started` 前可用。
- 只能选择自己的手牌。
- 张数范围为 0-2。
- 成功后写入 `mulligan_json`，再次请求返回 `mulligan_used`。

### 4.5 POST /api/pvp/live/matches/:matchId/action

HTTP fallback 行动提交。WebSocket 可用时优先走 WS。

请求：

```json
{
  "intentId": "act-local-1",
  "intentType": "play_card",
  "matchId": "pvpm-...",
  "ruleVersion": "pvp-live-v1",
  "stateVersion": 12,
  "payload": {
    "cardInstanceId": "c-a-3",
    "targetId": "player-b"
  }
}
```

响应：

```json
{
  "result": "accepted",
  "intentId": "act-local-1",
  "serverRevision": 13,
  "events": [],
  "stateView": {}
}
```

拒绝响应：

```json
{
  "result": "rejected",
  "intentId": "act-local-1",
  "reason": "not_your_turn",
  "stateView": {}
}
```

行动幂等：

- 同一 `matchId + userId + intentId` 只能被处理一次。
- 客户端重试同一个已接受 intent 时，服务端返回原 `serverRevision` 和同一组 seat-scoped events，不重复结算。
- 同一 `intentId` 携带不同 `intentType` 或 `payload` 时返回 `duplicate_action_conflict`。

### 4.6 POST /api/pvp/live/matches/:matchId/surrender

投降。

响应：

```json
{
  "success": true,
  "status": "finished",
  "endReason": "surrender"
}
```

### 4.7 GET /api/pvp/live/matches/:matchId/replay

拉取赛后回放事件。

查询参数：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `visibility` | `replay_self` | 只允许 `replay_self`、`replay_public`、`audit_safe`。`server_full` 不得通过浏览器 API 返回。 |

约束：

- 仅对局参与者可拉取；非参与者返回 404，避免确认战局存在。
- 仅 `finished` 或 `invalidated` 等终局状态可生成赛后回放；进行中对局返回 `409 replay_not_ready`。
- `replay_public` 和 `audit_safe` 不返回 raw `matchId`，只返回稳定 `matchRef`。
- `replay_self` 首版实现只包含本方 seat、公开事件和本方赛后复盘，不返回对手隐藏手牌历史。
- `audit_safe` 由 `replay_public` 派生，只返回字段路径、隐藏扫描和风险摘要，不返回原始隐藏状态。

响应：

```json
{
  "success": true,
  "replay": {
    "reportVersion": "pvp-live-replay-v1",
    "visibilityLayer": "replay_self",
    "matchRef": "e4a4d9e0b8f42a10",
    "ruleVersion": "pvp-live-v1",
    "status": "finished",
    "events": [],
    "replayHash": "6f0f0e0c1b8a7d55",
    "hiddenScan": {
      "forbiddenTokenCount": 0
    }
  }
}
```

### 4.8 Intent payload 合同

所有通道都必须提交统一 intent envelope：

```json
{
  "intentId": "act-local-1",
  "intentType": "play_card",
  "matchId": "pvpm-...",
  "ruleVersion": "pvp-live-v1",
  "stateVersion": 12,
  "payload": {}
}
```

按类型扩展：

| intentType | payload 必填字段 | payload 可选字段 | 说明 |
| --- | --- | --- | --- |
| `ready` | 无 | `clientReadyAt` | REST ready 和 WS ready 语义一致 |
| `mulligan` | `cardInstanceIds` | 无 | 仅 setup phase 可用，0-2 张 |
| `play_card` | `cardInstanceId` | `targetId`, `targetSeat`, `declaredMode` | 出牌 |
| `end_turn` | 无 | `clientEndedAt` | 当前玩家结束回合 |
| `surrender` | 无 | `reason` | 投降 |
| `emote` | `emoteId` | 无 | 非战斗逻辑，不推进 revision，频率限制 |

服务端校验顺序：

1. `matchId / userId / seat`。
2. `intentId` 幂等。
3. `stateVersion`。
4. match status 与 turn phase。
5. 当前行动权。
6. intent schema。
7. 卡牌位置、费用、目标。
8. PVP rule override。
9. effect queue 结算。

## 5. WebSocket 协议

当前 S6A 最小实现已接入单进程 WS 权威同步：`connected`、`join_match -> state_sync + events_replay`、`heartbeat -> presence`、`intent -> intent_result + state_sync broadcast` 已有服务端、前端桥和 Node 门禁。下列表格仍保留完整目标协议，其中 `match_found`、`ready_state`、`turn_change`、`match_finished`、`settlement_*` 等独立推送消息属于后续扩展；当前实现主要通过 seat-scoped `state_sync` 承载状态变化。

### 5.1 连接

路径：

```text
WS /api/pvp/live/ws?token=<sessionToken>
```

要求：

- token 复用当前 auth session。
- 服务端连接后发送 `connected`。
- 客户端按服务端 `connected/connectionReport.heartbeatIntervalMs` 发送 heartbeat；当前默认 5 秒，测试或部署环境可下发最小 1 秒间隔。

### 5.2 服务端消息

#### connected

```json
{
  "type": "connected",
  "connectionId": "ws-...",
  "serverTime": 1780000000000
}
```

#### match_found

```json
{
  "type": "match_found",
  "matchId": "pvpm-...",
  "mode": "ranked",
  "seat": "A",
  "opponent": {
    "userId": "u2",
    "username": "道友",
    "divisionBand": "潜龙榜"
  },
  "ruleVersion": "pvp-live-v1",
  "matchQuality": {
    "ratingDeltaBucket": "near_0_99",
    "expansionStage": "strict_rating",
    "candidatePoolSize": 18,
    "recentRematchSuppressed": false,
    "connectionHealth": "pass",
    "newPlayerProtectionApplied": true,
    "requiresWideAccept": false,
    "wideGapReason": null
  }
}
```

#### ready_state

```json
{
  "type": "ready_state",
  "matchId": "pvpm-...",
  "players": [
    { "seat": "A", "ready": true },
    { "seat": "B", "ready": false }
  ]
}
```

#### state_sync

```json
{
  "type": "state_sync",
  "matchId": "pvpm-...",
  "serverRevision": 10,
  "stateView": {}
}
```

`state_sync` 永远发送当前连接座位的脱敏视图，不能直接发送服务端完整 `BattleState`。

每个 seat 只能看到：

- 自己的完整手牌、弃牌堆、消耗堆、公开 buff。
- 对手生命、护盾、灵力、手牌数量、牌库数量、弃牌数量、公开 buff。
- 公开事件、预算剩余、回合倒计时、在线状态。

每个 seat 不能看到：

- 对手手牌明细。
- 对手抽牌堆顺序。
- 对手未公开随机结果。
- 服务端内部 `rngState`。

#### intent_result accepted

```json
{
  "type": "intent_result",
  "result": "accepted",
  "matchId": "pvpm-...",
  "intentId": "act-local-1",
  "serverRevision": 11,
  "events": []
}
```

#### intent_result rejected

```json
{
  "type": "intent_result",
  "result": "rejected",
  "matchId": "pvpm-...",
  "intentId": "act-local-1",
  "reason": "insufficient_energy",
  "stateView": {}
}
```

#### turn_change

```json
{
  "type": "turn_change",
  "matchId": "pvpm-...",
  "serverRevision": 12,
  "currentSeat": "B",
  "turnNumber": 2,
  "deadlineAt": 1780000000000
}
```

#### presence

```json
{
  "type": "presence",
  "matchId": "pvpm-...",
  "seat": "B",
  "status": "disconnected",
  "reconnectDeadlineAt": 1780000060000
}
```

#### match_finished

```json
{
  "type": "match_finished",
  "matchId": "pvpm-...",
  "serverRevision": 80,
  "winnerSeat": "A",
  "endReason": "lethal"
}
```

#### settlement_pending

```json
{
  "type": "settlement_pending",
  "matchId": "pvpm-...",
  "serverRevision": 80,
  "status": "settling"
}
```

#### settlement_written

```json
{
  "type": "settlement_written",
  "matchId": "pvpm-...",
  "serverRevision": 81,
  "status": "finished",
  "resultView": {}
}
```

### 5.3 客户端消息

#### heartbeat

```json
{
  "type": "heartbeat",
  "clientTime": 1780000000000
}
```

#### join_match

```json
{
  "type": "join_match",
  "matchId": "pvpm-...",
  "lastSeenRevision": 8
}
```

#### submit_intent

```json
{
  "type": "submit_intent",
  "matchId": "pvpm-...",
  "intent": {
    "intentId": "act-local-1",
    "intentType": "play_card",
    "ruleVersion": "pvp-live-v1",
    "stateVersion": 12,
    "payload": {}
  }
}
```

### 5.4 消息时序合同

入场：

1. 客户端连接 WS。
2. 服务端发送 `connected`。
3. 客户端发送 `join_match`。
4. 服务端发送 seat-scoped `state_sync`。
5. 若 match 仍在 setup，服务端随后广播 `ready_state`。

提交行动：

1. 客户端发送 `submit_intent`。
2. 服务端立即校验 intent schema、stateVersion、turn、费用、目标。
3. 拒绝时只发 `intent_result(rejected)`，不推进 `serverRevision`。
4. 接受时先写 event log，再推进 `serverRevision`。
5. 服务端向行动方发送 `intent_result(accepted)`，向双方发送 seat-scoped `state_sync`。
6. 若行动导致换回合，`state_sync` 后再广播 `turn_change`。

重连：

1. 客户端发送 `join_match(lastSeenRevision)`。
2. 服务端返回最新 `state_sync`。
3. 如果存在可公开补发的 missed events，再发送 `events_replay`。
4. 客户端必须以 `state_sync.serverRevision` 为准清理本地 pending actions。

## 6. 服务端战斗状态

### 6.1 BattleState

服务端内部权威结构。该结构只能存在于服务端内存、数据库 `state_json` 和重放测试中，不能原样广播给任一客户端。

```json
{
  "matchId": "pvpm-...",
  "ruleVersion": "pvp-live-v1",
  "serverRevision": 1,
  "roundNumber": 1,
  "turnNumber": 1,
  "turnPhase": "main",
  "currentSeat": "A",
  "rngState": "seed-state",
  "damageBudget": {
    "A": { "turn1Remaining": 18, "turn2Remaining": 28 },
    "B": { "turn1Remaining": 22, "turn2Remaining": 28 }
  },
  "players": {
    "A": {
      "userId": "u1",
      "hp": 50,
      "maxHp": 50,
      "block": 0,
      "energy": 3,
      "maxEnergy": 3,
      "hand": [],
      "drawPile": [],
      "discardPile": [],
      "exhaustPile": [],
      "buffs": {},
      "flags": {
        "hasTakenActionPhase": false,
        "mulliganUsed": false
      }
    },
    "B": {}
  },
  "effectQueue": []
}
```

### 6.1.1 StateView

客户端只接收按座位生成的 `StateView`。

```json
{
  "matchId": "pvpm-...",
  "seat": "A",
  "serverRevision": 12,
  "roundNumber": 1,
  "turnNumber": 2,
  "currentSeat": "B",
  "turnPhase": "main",
  "deadlineAt": 1780000000000,
  "self": {
    "hp": 42,
    "block": 6,
    "energy": 3,
    "hand": [],
    "drawPileCount": 12,
    "discardPile": [],
    "exhaustPile": [],
    "buffs": {}
  },
  "opponent": {
    "hp": 50,
    "block": 0,
    "energy": 3,
    "handCount": 5,
    "drawPileCount": 15,
    "discardPileCount": 0,
    "exhaustPileCount": 0,
    "buffs": {}
  },
  "publicRules": {
    "damageBudgetRemaining": 18,
    "ruleVersion": "pvp-live-v1"
  }
}
```

验收要求：

- `StateView.opponent` 不得包含 `hand`、`drawPile` 或任何可还原牌库顺序的字段。
- `rngState` 只能进入服务端日志和管理员调试，不得进入浏览器 payload。
- 玩家 replay API 对局结束后也不能返回完整双方手牌历史、牌库顺序或可还原 RNG 的字段。
- 完整双方手牌历史只允许存在于 `server_full` 或受控内部审计层；玩家自用回放使用 `replay_self`，分享战报使用 `replay_public`，争议公开摘要使用 `audit_safe`。

回放受众矩阵以主方案可见性合同为准：

| 受众 | 可用层级 | 允许 | 禁止 |
| --- | --- | --- | --- |
| 本人复盘 | `replay_self` | 本方当时可见信息、公开事件、预算拦截、复盘标记 | 对手当时隐藏手牌、牌库顺序、随机种子 |
| 分享战报 | `replay_public` | 公开时间线、公开 setup、终局类型、公开结算摘要 | 任一方隐藏手牌、未公开选择、内部 hash |
| 争议摘要 | `audit_safe` | 脱敏字段路径、可见性标签、泄露扫描结果、风险标签 | 可还原隐藏手牌、未来抽牌或 RNG 状态的原文 |
| 内部审计 | `server_full` | 完整状态、手牌、牌库、随机结果、事件 payload | 不能直接发给浏览器或分享链接 |

### 6.2 Action 类型

首版支持：

| action | 说明 |
| --- | --- |
| `ready` | 准备 |
| `mulligan` | 调息换牌 |
| `play_card` | 打出卡牌 |
| `end_turn` | 结束回合 |
| `surrender` | 投降 |
| `emote` | 表情，非战斗逻辑 |

### 6.3 Event 类型

首版至少记录：

| event | 说明 |
| --- | --- |
| `match_created` | 对局创建 |
| `player_ready` | 玩家准备 |
| `battle_started` | 战斗开始 |
| `mulligan_submitted` | 调息换牌 |
| `turn_started` | 回合开始 |
| `card_drawn` | 抽牌 |
| `card_played` | 出牌 |
| `energy_spent` | 支付灵力 |
| `effect_resolved` | 效果结算 |
| `damage_dealt` | 造成伤害 |
| `damage_prevented_by_budget` | 伤害预算截断 |
| `block_gained` | 获得护盾 |
| `buff_applied` | 状态施加 |
| `card_moved` | 卡牌移动 |
| `turn_ended` | 回合结束 |
| `timeout_applied` | 超时处理 |
| `player_disconnected` | 断线 |
| `player_reconnected` | 重连 |
| `match_finished` | 对局结束 |
| `settlement_written` | 结算写入 |

核心 event payload：

| event | payload 必填字段 |
| --- | --- |
| `card_drawn` | `seat`, `count`, `cardInstanceIds` 仅 actor 可见，公开 payload 只给 `count` |
| `card_played` | `seat`, `cardInstanceId`, `cardId`, `costPaid`, `targets` |
| `effect_resolved` | `sourceCardInstanceId`, `effectType`, `resultSummary` |
| `damage_dealt` | `sourceSeat`, `targetSeat`, `amount`, `damageType`, `budgetApplied` |
| `damage_prevented_by_budget` | `sourceSeat`, `targetSeat`, `attempted`, `allowed`, `prevented`, `rule` |
| `buff_applied` | `sourceSeat`, `targetSeat`, `buffType`, `value`, `duration` |
| `mulligan_submitted` | `seat`, `returnedCount`, `drawnCount`，牌 ID 仅自己可见 |
| `match_finished` | `winnerSeat`, `endReason`, `finalRound`, `finalTurn` |

## 7. PVP 规则矩阵

### 7.1 基础规则

| 项 | 数值 |
| --- | --- |
| 生命 | 50 |
| 初始手牌 | 5 |
| 调息换牌 | 准备阶段 0-2 张，每名玩家最多一次 |
| 每回合抽牌 | 5 |
| 初始灵力 | 3 |
| 手牌上限 | 10 |
| 卡组数量 | 20 |
| 单卡复制上限 | 2 |
| 先手首回合伤害预算 | 18 |
| 后手首回合伤害预算 | 22 |
| 第二回合伤害预算 | 28 |
| 后手护印 | 6 不可转伤护盾 |

### 7.2 effect.type 覆写

原则：`pvp-live-v1` 使用白名单。没有列入白名单或转写表的效果，排位默认拒绝，不能按 PVE 原文兜底执行。

| effect.type | PVP 处理 |
| --- | --- |
| `damage` | 受回合伤害预算、易伤、破绽、力量等规则处理 |
| `damageAll` | 对玩家按 `damage` 处理；如果后续有召唤物再扩展 |
| `randomDamage` | 首版排位合法池不开放；engine 单测若覆盖，必须使用服务端 seeded RNG 并受预算 |
| `penetrate` | 单效果对玩家上限 10，受预算 |
| `executeDamage` | 可触发，但最终伤害受预算；阈值不低于 30% |
| `execute` | 转写为 `executeDamage`，受阈值和预算限制 |
| `percentDamage` | 单效果上限 10，且受预算；不能按最大生命无限放大 |
| `consumeAllEnergy` | 首版排位禁用；后续赛季如转写，必须固定每点伤害且受预算和单卡上限 |
| `block` | 可用，受 PVP 护盾上限规则 |
| `removeBlock` | 首版合法池不开放；engine 可实现为单效果最多移除 12 护盾，不能移除后手护印 |
| `blockBurst` | 首版合法池不开放；engine 可实现为消耗上限 10，ratio <= 1.0，不能消耗后手护印 |
| `blockFromStrength` / `blockFromLostHp` | 首版合法池不开放；engine 可实现为单效果护盾上限 12 |
| `draw` | 首回合额外抽牌总上限 0；第 2 回合起每回合额外抽牌硬上限 +3 |
| `conditionalDraw` / `drawCalculated` | 首版合法池不开放；engine 单测可转写为固定 `draw 1`，受每回合额外抽牌上限 |
| `energy` | 首回合额外灵力总上限 0；第 2 回合起每回合额外灵力硬上限 +2 |
| `energyLoss` | 对自己可用；对对手首版禁用 |
| `debuff` | `vulnerable` 上限 2；硬控改写 |
| `debuffAll` | 首版按单目标 `debuff` 处理；没有召唤物前不能扩大收益 |
| `buff` | 按 buffType 规则处理 |
| `heal` | 可用，溢疗转盾受限 |
| `lifeSteal` | 回复上限为造成伤害的 30%，单回合最多 10 |
| `swapHpPercent` | 禁用 |
| `discardHand` | 首版排位禁用，不能改写任一方整手牌 |
| `discardRandom` | 对自己可用；对对手首版禁用 |
| `damagePerCard` | 首版合法池不开放；后续必须计入单效果伤害上限与回合预算 |
| `conditionalDamage` | 首版只允许公开 `marked` / `lowHp` setup，计入单效果伤害上限与回合预算 |
| `applyMark` | 转为破绽层数，上限按 `markedBonusDamage` |
| `applyBleed` | 转为公开持续伤害，单回合总伤害仍受预算 |
| `cleanse` | 可用，清除负面状态数量上限 2 |
| `addStatus` | 首版排位禁用；不得向对手牌库、手牌或抽牌位注入状态牌 |
| `createCard` / `randomCards` | 首版排位禁用；不得生成不在入队快照内的牌 |
| `echoLastPlayedCard` | 首版禁用，后续只允许复制低影响牌且不能复制自己 |
| `reshuffleDiscard` | 首版合法池不开放；后续最多每局触发 1 次 |
| `selfDamage` | 可用，不触发低血增伤的同回合爆发 |
| `consumeOathDebt` | 首版禁用，不能按债层清算，也不做固定伤害转写 |
| `damagePerLaw` | 首版排位禁用，局外资源不参与战斗伤害 |
| `gainMerit` / `gainSin` / `ringExp` / `bonusGold` | 排位战斗中不结算局外资源；只可写复盘标签 |

### 7.3 buffType 覆写

| buffType | PVP 处理 |
| --- | --- |
| `strength` | 只允许本回合临时力量，单回合力量上限 4；永久力量排位内禁用 |
| `vulnerable` | 上限 2 |
| `weak` | 可用 |
| `stun` | 首版排位禁用；若某张牌要保留设计语义，必须先在内容包中预转写为 `weak` 或下一张牌费用 +1 后再进入合法池 |
| `extraTurn` | 首版排位禁用，不做临场转写 |
| `freeCard` | 首版排位禁用；任何费用降低都不能把牌降到 0 费 |
| `retainBlock` | 首版排位禁用，相关牌不进入 `pvp_legal_cards_v1` |
| `thorns` | 单次返伤上限 8 |
| `reflect` | 不免疫全部伤害，改为减伤 50% + 返伤上限 8 |
| `damageReduction` | 单次减伤上限 50% |
| `nextAttackBonus` | 计入首击/单回合加伤上限 |
| `energyOnVulnerable` | 首版合法池不开放；后续每回合最多触发 1 次 |
| `regen` | 首版合法池不开放；后续每回合回血上限 5 |
| `poison` | 首版按公开持续伤害处理，计入预算 |
| `burn` / `paralysis` | 首版合法池不开放；后续只能转为公开持续伤害或费用税，不能跳过整回合 |
| `dodge` / `dodgeChance` | 首版禁用随机闪避，避免胜负由不可读 RNG 决定 |
| `nextTurnBlock` / `regenBlock` | 首版排位禁用，相关牌不进入 `pvp_legal_cards_v1` |
| `blockOnAttack` | 首版合法池不开放；后续每回合最多触发 2 次 |
| `oathDebt` | 首版排位禁用，不记录可清算债层 |

首赛季 ranked 可见状态标签白名单：

| 标签 | 可见位置 | 说明 |
| --- | --- | --- |
| `marked` / 破绽 | HUD、回放、公开战报 | 公开 setup，显示层数和来源 |
| `vulnerable` / 易伤 | HUD、回放、公开战报 | 上限 2 |
| `weak` / 虚弱 | HUD、回放、公开战报 | 可降低下一次伤害或作为费用税转写 |
| `bleed` / 流血 | HUD、回放、公开战报 | 公开持续伤害，计入预算 |
| `poison` / 中毒 | HUD、回放、公开战报 | 首版按公开持续伤害处理 |
| `thorns` / 荆棘 | HUD、回放、公开战报 | 单次返伤上限 8 |
| `low_hp_ready` / `low_hp_cooldown` | HUD、回放 | 低血触发只显示就绪或冷却，不显示隐藏乘区 |

普通护盾显示为 HUD 数值，不是跨回合状态标签。`retainBlock`、`nextTurnBlock`、`regenBlock` 不得出现在首赛季 ranked HUD、replay、audit 或 UI 文案样例中。

### 7.4 命格 / 誓约 / 命途覆写

| 字段 | PVP 处理 |
| --- | --- |
| `firstAttackBonusPerBattle` | 只取最高来源，上限 +6 |
| `firstTurnDraw` | 首版排位禁用，首回合额外抽牌为 0 |
| `firstTurnEnergy` | 首版排位禁用，首回合额外灵力为 0 |
| `openingBlock` | 可用，但后手护印之外的总开场护盾上限 10 |
| `firstBlockGainBonusPct` | 只取最高来源，上限 30% |
| `blockGainMultiplier` | 上限 25% |
| `lowHpDamageBonusPct` | 只取最高来源，上限 25%，第 2 回合后生效 |
| `markedBonusDamage` | 计入破绽平伤上限 |
| `vulnerableBonusDamage` | 上限 +2 |
| `overhealToBlockRatio` | 上限 0.5 |

### 7.5 斗法谱合法性校验

`validatePvpLoadout(loadout, ruleVersion)` 必须在入队时执行，并保存服务端归一化快照。

首版规则：

- deck 必须正好 20 张。
- 单卡复制上限 2。
- 首版 `pvp_legal_cards_v1` 中 0 费牌数量为 0，入队斗法谱也必须 0 张 0 费牌。
- 至少 10 张 1 费牌。
- 直接伤害牌最多 10 张。
- 非纯伤害交互牌不少于 8 张。
- 纯防守或纯过牌牌最多 10 张。
- 任意 `pvpUnsupported === true`、包含禁用 effect、或不在 `pvp_legal_cards` 快照内的卡牌不能入队。

错误码：

- `invalid_deck_size`
- `too_many_copies`
- `too_many_zero_cost_cards`
- `curve_too_high`
- `too_many_damage_cards`
- `missing_interaction_cards`
- `card_disabled`
- `loadout_hash_mismatch`

高影响牌定义：

- 含 `penetrate`、`executeDamage`、`execute`、`consumeAllEnergy`、`blockBurst`、`damagePerCard`、`conditionalDamage`、`percentDamage` 的牌。
- 单卡基础玩家伤害大于 10 的牌。
- 能复制、回收或重新触发高影响牌的牌。

高影响牌在排位内最低费用始终为 1，不能被 `freeCard`、费用降低、临时复制或回能链降到 0。

### 7.6 局外身份槽

首版排位只开放 1 个 PVP 身份槽。

玩家在斗法谱中从以下三类中三选一：

- PVP 版命格标签。
- PVP 版誓约标签。
- PVP 版命途标签。

规则：

- 身份槽固定为 PVP 版 T1，不读取 PVE 中的真实养成 tier。
- 章节临时 buff、远征增益、法宝、法则、灵契、传承、地图事件 buff、洞府议程奖励全部不进入排位数值。
- 身份槽只提供一个明确风格，例如起手稳定、护盾偏向、低额反击、轻量过牌；不能同时提供首回合抽牌、首回合灵力、首击增伤和低血乘区。
- 身份槽效果同样受 `firstTurnDraw`、`firstTurnEnergy`、`firstAttackBonusPerBattle`、`openingBlock`、`lowHpDamageBonusPct` 上限约束。

### 7.7 非游戏防线合同

最低行动权：

- 在对手没有进入过自己的行动阶段前，任何伤害结算都不能把对手生命降到 0。
- 若伤害会击杀尚未行动过的对手，服务端将其生命最低保留到 1，并记录 `damage_prevented_by_budget`。
- 该保护不适用于投降、断线判负、超时判负。

护命窗口唯一时序：

| 窗口 | 覆盖对象 | 预算值 | 结束条件 |
| --- | --- | --- | --- |
| 先手首行动窗口 | 先手第 1 次 `action` 阶段玩家生命伤害 | 18 | 先手结束第 1 次行动 |
| 后手首行动窗口 | 后手第 1 次 `action` 阶段玩家生命伤害 | 22 | 后手结束第 1 次行动 |
| 第二行动窗口 | 双方各自第 2 次 `action` 阶段玩家生命伤害 | 28 | 对应座位结束第 2 次行动 |
| 后手首次行动前保护 | 后手完成第 1 次真实行动前，先手不能造成致死结果 | 先手首行动预算 + 后手护印共同生效 | 后手第 1 次行动被 accepted 或主动结束回合 |

“首两整轮保护”只表示双方前两次行动都受预算和完整回合剥夺禁令约束，不表示前两整轮所有伤害都被无条件免死。

首回合控制预算：

- 在后手完成自己的第一个行动回合前，禁止对其施加 `discardRandom`、`discardHand`、`energyLoss`、不可打状态牌、抽牌位占用状态牌和硬 `stun`。
- 此阶段允许的控制只包括 `weak` 或公开的下一张牌费用 +1。
- 同一回合只能有一种控制对后手生效。

可读前兆：

- 第 3 回合后允许高爆发，但单回合超过 30 点玩家伤害时，必须在上一回合已经给出公开 setup：破绽层数、蓄势 buff、姿态、公开延迟牌、异常手牌数或可见身份槽触发。
- 没有公开 setup 的爆发仍受单效果封顶与回合预算保护。

长局收束：

- 以主方案 `4.4 长局强制判定` 为唯一真值。
- 第 14 整轮结束仍未分胜负时，使用公开多指标分数判定：剩余生命差、有效伤害、有效防守、公开 setup 转化、资源效率、预算拦截惩罚和托管惩罚。
- 分差大于等于 5 时进入 `round14_score`；分差小于 5 时进入 `round14_draw`。
- `round14_draw` 是已完成对局，不是无效局；当前首版只生成公开复盘，不写正式匹配评分、正式历史、赛季积分、主要奖励或任务进度。
- 不允许继续使用旧长局压力伤害、旧生命护盾简化公式或“按无效局 / 极小分差处理”的旧口径。

## 8. 前端状态机

### 8.1 PvpLiveService 状态

```text
idle
queued
match_found
ready_wait
loading_battle
active
settling
reconnecting
finished
cancelled
error
```

### 8.2 Live match UI 状态

| 状态 | UI |
| --- | --- |
| `queued` | 匹配中、等待时长、取消 |
| `match_found` | 对手卡片、准备按钮 |
| `ready_wait` | 双方准备进度 |
| `loading_battle` | 规则版本、初始化 |
| `active` | 对局 HUD |
| `settling` | 正在写入结算，禁用出牌、投降和调息，只允许等待结果 |
| `reconnecting` | 遮罩、重连倒计时 |
| `finished` | 结算、复盘、回放、再战 |
| `error` | 错误原因、返回、重试 |

### 8.3 客户端本地字段

```js
{
  liveMatchId,
  queueId,
  mode,
  seat,
  opponent,
  ruleVersion,
  serverRevision,
  lastAckSeq,
  authoritativeBattleState,
  pendingActions,
  opponentPresence,
  turnDeadlineAt,
  reconnectDeadlineAt,
  settlement
}
```

### 8.4 与现有 PVP 页关系

必须保留现有 PVP 主入口，并新增 tab：

- `天命排位`
- `问道练习`
- `好友约战`
- `战报回放`
- `天道商店`
- `防守残影`

当前 `防守残影` 不删除，但文案改为练习 / 展示 / 托管素材，不再暗示正式排位对手。

### 8.5 服务端状态机

match.status：

| 当前 | 事件 | 下一个 | 说明 |
| --- | --- | --- | --- |
| `created` | 双方进入 ready 房间 | `ready` | match 已创建但未开局 |
| `ready` | 双方 ready 且 mulligan 结束 | `active` | 写 `battle_started` |
| `ready` | ready deadline 超时 | `invalidated` | 不改排位分 |
| `active` | lethal / surrender / timeout / disconnect 判负 | `settling` | 进入结算写入窗口 |
| `active` | 双方长期断线 / 引擎不可恢复 / 服务端恢复旧局 | `invalidated` | 无效局 |
| `settling` | settlement 写入成功 | `finished` | 只允许幂等读取 |
| `settling` | 结算写入发现状态不可信 | `invalidated` | 不改排位分，写异常摘要 |
| `invalidated` | compensation 写入成功 | `invalidated` | 只允许幂等读取 |

状态映射总表以 `docs/designer_major_upgrade_overall_plan_v1.md` 为准。这里的 `created` / `ready` / `turn.phase` / `presence` 只是持久态和协议态的内部细分，不能覆盖主方案中的 `idle / queueing / matched / setup / active / settling / finished / invalidated` 语义。

终局时间线合同：

| 步骤 | 服务端事件 / 消息 | 持久态 | 客户端允许行为 |
| --- | --- | --- | --- |
| 终局被规则命中 | 写 `match_finished` event | `settling` | 清 pending，禁止出牌、调息、投降、结束回合 |
| 结算写入中 | 可发送 `settlement_pending` 或 `state_sync(settling)` | `settling` | 展示“正在结算”，只允许重连同步 |
| 正式结算成功 | 写 `settlement_written` event | `finished` | 展示结算、复盘、再战入口 |
| 无效局确认 | 写 `match_invalidated` event | `invalidated` | 展示无效原因、非强度补偿和返回入口 |
| 对外结果广播 | 发送 `battle_end` | `finished` / `invalidated` | 只读结果；重复消息必须幂等 |

`battle_end` 是对外消息，不是结算真源；结算真源是 `match_finished` + `settlement_written` 或 `match_invalidated` 的事件链。

player.presence：

| 状态 | 进入条件 | 离开条件 |
| --- | --- | --- |
| `online` | WS connected + joined match | heartbeat missed |
| `disconnected` | missed heartbeat 超过 20 秒 | grace 内 reconnect |
| `grace` | 当前行动方断线且仍有保护次数 | reconnect / grace timeout |
| `forfeited` | grace 用尽或断线次数超限 | 终局 |

turn.phase：

| phase | 说明 |
| --- | --- |
| `setup` | match_found 后、battle_started 前，可 mulligan / ready |
| `start` | 回合开始效果、抽牌、灵力刷新 |
| `main` | 当前玩家行动 |
| `resolving` | effectQueue 结算中，不接受新 action |
| `ending` | 回合结束、清理临时状态、检查长局判定 |
| `finished` | 对局结束 |

### 8.6 断线重连与恢复算法

heartbeat：

- 客户端不写死 10 秒；按服务端 `connectionReport.heartbeatIntervalMs` 发送 heartbeat，当前默认 5 秒，最小 1 秒。
- 服务端按 `heartbeatStaleMs` 判定断线；当前默认 15 秒未收到 heartbeat，标记 `disconnected`。
- 如果断线玩家是当前行动方，暂停当前 turn timer，进入服务端 `reconnectGraceMs` grace；当前默认 30 秒。
- 非当前行动方断线不暂停当前行动方倒计时，但 UI 必须显示对方重连中。

join_match 恢复：

- 客户端重连时发送 `join_match(matchId, lastSeenRevision)`。
- 服务端总是先返回最新 `StateView`。
- 如果 `lastSeenRevision` 仍在事件保留窗口内，额外返回 missed public events。
- 如果客户端有 pending intent 且服务端未见过该 `intentId`，客户端必须清掉 pending 并重新提交。
- 如果服务端已接受同一 `intentId`，返回原 `intent_result`，不重复结算。

服务端重启：

- 若可从 `pvp_live_matches.state_json` 和 event log 恢复 active match，则恢复并广播 `state_sync`。
- 若 state_json 缺失或 ruleVersion 不兼容，match 标记 `invalidated`，写 `server_recovered_invalid_match`，不改分，可给少量补偿。

## 9. 错误处理

### 9.1 action reject reason

拒绝码使用 `docs/designer_major_upgrade_overall_plan_v1.md` 的 machine contract。UI 文案可以本地化，但 wire code、测试 fixture、事件日志和浏览器审计不能各写一套别名。

| code | 含义 | 玩家口径 |
| --- | --- | --- |
| `not_in_match` | 玩家不属于该对局 | 当前对局已失效 |
| `match_not_active` | 对局状态不允许该动作 | 现在还不能这么做 |
| `not_your_turn` | 非当前行动方提交行动 | 还没轮到你 |
| `stale_state` | 客户端状态版本落后 | 局面已更新，正在同步 |
| `rule_version_mismatch` | 规则版本不一致 | 规则版本已更新，请刷新局面 |
| `snapshot_locked` | 入队后尝试改谱或换身份 | 排位快照已锁定 |
| `invalid_card` | 手牌 ID 不存在或不属于玩家 | 这张牌当前不可用 |
| `card_disabled` | 内容映射为禁用或仅测试 | 该内容不进入首版排位 |
| `insufficient_energy` | 灵力不足 | 灵力不足 |
| `invalid_target` | 目标不存在、隐藏或不合法 | 目标不可选 |
| `mulligan_used` | 重复调息或超出换牌数量 | 本局调息次数已用完 |
| `duplicate_action_conflict` | 同一 `intentId` 携带不同 `intentType` 或 `payload` | 行动编号冲突，请同步局面 |
| `loadout_illegal` | 入队斗法谱不合法 | 斗法谱未通过排位校验 |
| `state_view_forbidden_field` | 状态投影包含禁止字段，服务端应报警 | 状态同步异常，已停止公开 |
| `action_timeout` | 行动窗口已超时 | 已超时，系统进入托管或判定 |
| `terminal_already_settled` | 对局已终局或结算已写入 | 对局已经结束 |

旧文档或旧实现里的 `not_current_turn`、`stale_revision`、`effect_disabled_in_pvp`、`effect_unsupported_in_pvp`、`mulligan_already_used`、`mulligan_phase_closed`、`already_finished` 只能作为迁移期兼容别名，不能进入新的合同、fixture、浏览器断言或玩家文案映射。

预算命中不是 action reject。`play_card` 如果合法但超出回合伤害预算，服务端必须返回 `accepted`，推进 `serverRevision`，写公开事件 `budget_clamped`，只截断玩家生命伤害；不能清空整张牌效果，也不能返回任何旧版预算 reject code。

### 9.2 断线规则

配置：

- heartbeat interval：10 秒
- missed heartbeat 判定：20 秒
- reconnect grace：60 秒
- max disconnect grace count：2

处理：

1. 玩家断线，服务端广播 presence。
2. 当前玩家断线时暂停倒计时，进入 grace。
3. grace 内重连，恢复当前状态。
4. 超过 grace，第一次自动结束回合。
5. 多次断线或关键阶段断线，判负。

统一计数模型：

| 计数 | 增加条件 | 上限处理 |
| --- | --- | --- |
| `disconnectGraceUsed` | 当前行动方断线并进入 grace | 超过 2 次后不再冻结计时，按托管或判负处理 |
| `turnTimeoutCount` | 行动窗口自然超时 | 第 3 次超时判负 |
| `readyTimeoutCount` | 准备阶段未 ready | 高频触发进入短排队冷却，不改正式积分 |
| `automationActionCount` | 服务端执行托管动作 | 进入复盘风险标签，不能打决定性爆发 |

关键阶段：

- `setup` 阶段只允许无效局、重新匹配或练习分流，不允许写正式胜负。
- `active` 当前行动方断线进入 grace；grace 外先托管保底，再按次数判负。
- `active` 非当前行动方断线不冻结当前行动方倒计时。
- `settling` 只读结算和复盘，不恢复行动权。

### 9.3 超时规则

配置：

- turn duration：75 秒
- bonus duration：15 秒
- max timeout count：3

处理：

1. 第一次超时：自动结束回合。
2. 第二次超时：自动结束回合并警告。
3. 第三次超时：判负。

### 9.4 全局错误码

| code | HTTP/WS | 可重试 | 处理 |
| --- | --- | --- | --- |
| `already_queued` | 409 / error | 否 | 回到当前 queue 状态 |
| `already_in_match` | 409 / match_found | 否 | 跳转 active match |
| `match_not_found` | 404 / error | 否 | 返回 PVP 首页 |
| `join_forbidden` | 403 / error | 否 | 用户不是该 match 玩家 |
| `ws_auth_failed` | 401 / close | 是 | 刷新登录态后重连 |
| `ready_deadline_expired` | 409 / match_invalidated | 否 | match invalidated |
| `reconnect_window_expired` | 409 / match_finished | 否 | 按断线规则结算 |
| `engine_unavailable` | 503 / error | 是 | UI 显示服务异常，不扣分 |
| `loadout_version_mismatch` | 409 / error | 否 | 重新生成斗法谱 |
| `duplicate_action` | 200 / intent_result | 是 | 返回原结果，不重复结算 |
| `duplicate_action_conflict` | 409 / intent_result | 否 | 清空 pending intent |
| `stale_state` | 409 / state_sync | 是 | 拉全量 StateView |
| `rule_version_mismatch` | 409 / state_sync | 是 | 拉全量 StateView 并展示规则版本变化 |

## 10. 结算规则

### 10.1 排位结算

终局写账口径：

| 终局 | 匹配评分 | 赛季积分 | 主要奖励 | 历史 / 回放 |
| --- | --- | --- | --- | --- |
| `lethal` / `surrender` / `timeout_forfeit` / `disconnect_forfeit` / `round14_score` | 按胜负写入 | 按胜负写入 | 按胜负写入 | 写入 |
| `round14_draw` | 不变 | 0 | 0 | 不写正式历史；保留本局公开复盘 |
| `ready_timeout` / `server_invalidated` / 开局前无效分支 | 不变 | 0 | 0，可给非强度补偿 | 只写异常摘要 |

服务端在 `match_finished` 后执行：

1. 锁定 match。
2. 计算 Elo。
3. 写 `pvp_ranks`。
4. 写 `pvp_economy`。
5. 写 `pvp_match_history`。
6. 写 `pvp_live_rating_ledger`。
7. 写 `settlement_written` event。
8. 广播 `settlement_written` 和对外只读结果消息；若保留 `battle_end` 兼容展示，不得携带结算写入源数据。

### 10.2 无效局

下列情况可判无效：

- 服务端重启导致状态丢失。
- 对局未开始前有玩家未 ready。
- 匹配成功后任一方未 join、准备阶段取消、准备阶段投降、规则版本或快照校验失败。
- 双方都长期断线。
- 引擎出现不可恢复异常。

无效局：

- 不改排位分。
- 不发主要奖励。
- 可发少量补偿。
- 记录原因。

开局前无效分支必须按主方案“开局前结果矩阵”处理：未进入 `active` 的异常不能给任一方刷胜场、刷任务或刷正式奖励；高频未 join、取消、ready timeout 或准备阶段断线只能进入冷却、轻量异常记录或非强度补偿。

### 10.3 练习结算

问道练习：

- 不改正式排位。
- 可写本地或轻量服务端练习历史。
- 可给每日上限内少量天道币。
- 赛后复盘照常给。

## 11. 回放与复盘

### 11.1 回放数据

回放只依赖：

- `ruleVersion`
- `rngSeed`
- 初始 loadout
- `pvp_live_match_events`

当前 S5B 实现已新增 `pvp_live_match_events`，并让 replay API 优先读取该事件表；旧局或本地迁移数据没有事件表记录时，才回退 `state.events`。终局 replay 只允许使用连续 sequence 覆盖且包含 `match_finished` / `match_invalidated` 的完整事件源；如果事件表和 `state.events` 都不完整，API 必须拒绝生成回放，而不是返回截断时间线。持久化门禁已覆盖清空 `pvp_live_matches.state_json.events` 后仍能从事件表恢复 `battle_started` / `match_finished` 公开时间线，回放门禁也覆盖非空但不完整的事件表不能生成截断 replay。

不依赖：

- 客户端录屏
- 客户端本地状态
- 当前卡牌数据的未锁版本

### 11.2 复盘指标

赛后至少产出：

- 最大单回合伤害
- 最大单卡伤害
- 首两回合伤害预算命中情况
- 关键斩杀回合
- 护盾转伤贡献
- 破绽 / 易伤贡献
- 超时 / 断线记录
- 胜者主轴标签
- 败者可改进建议

公开战报和分享复盘必须额外产出推导审计：

| 字段 | 要求 |
| --- | --- |
| `outputField` | 分享标题、高光回合、公开失败建议、公开调谱建议或争议摘要 |
| `sourceVisibility` | 只能是 `replay_public` 或 `audit_safe` |
| `sourceEventIds` | 能证明该建议的公开事件 ID 列表 |
| `derivationTags` | 例如 `setup_ignored`、`budget_clamped`、`curve_too_high` |
| `usesHiddenInformation` | 必须为 `false` |

如果某条建议只能依赖 `server_full`、对手隐藏手牌、牌库顺序、RNG 或未公开行动意图解释，它不能进入公开战报，只能进入内部审计。

### 11.3 训练建议

根据败因推荐：

- 打问道练习残影
- 查看对手回放关键回合
- 调整卡组曲线
- 增加解控 / 护盾 / 过牌 / 低费牌
- 降低高费卡比例

## 12. 测试清单

### 12.1 Node 单元测试

新增：

```text
tests/sanity_pvp_live_engine_checks.cjs
tests/sanity_pvp_live_rules_checks.cjs
tests/sanity_pvp_live_replay_checks.cjs
```

覆盖：

- 初始状态生成
- 洗牌 seed 可复现
- 出牌费用校验
- 非当前回合拒绝
- intentId 幂等
- 目标校验
- 伤害预算
- 预算溢出写 `budget_clamped`
- 首击加成上限
- 低血加成延迟
- 破绽上限
- 易伤上限
- 护盾转伤上限
- 调息换牌只能执行一次
- 对手手牌 / 牌库顺序不进入 StateView
- 禁用 extraTurn / swapHpPercent / stun
- 未支持 effect 默认拒绝
- 旧长局压力伤害口径不得出现在首版回放、结算或伤害触发测试中
- 胜负判定
- 事件重放一致

### 12.2 后端集成测试

新增：

```text
tests/pvp_live_backend_e2e.cjs
```

覆盖：

- 两用户注册 / 登录
- 两用户入队
- 非法斗法谱拒绝入队
- loadout hash 不匹配拒绝
- 匹配创建
- ready
- mulligan
- action 推进
- 重复 action 重试不重复结算
- 投降
- 超时
- 断线重连
- 服务端结算
- rank/economy/history 写入
- 客户端胜负上报无法影响 live match

### 12.3 WebSocket 测试

新增：

```text
tests/pvp_live_ws_checks.cjs
```

覆盖：

- token 认证
- join match
- heartbeat
- state sync
- state view redaction
- action ack
- action reject
- duplicate action replay
- reconnect resume
- battle end

### 12.4 浏览器测试

新增：

```text
tests/browser_pvp_live_audit.mjs
tests/browser_pvp_live_mobile_audit.mjs
```

覆盖：

- 排位入口
- 匹配中状态
- 找到对手
- 准备状态
- 对局 HUD
- 出牌 pending / ack
- reject 提示
- 调息换牌 UI
- 伤害预算剩余与预算拦截提示
- 对手断线提示
- 重连遮罩
- 结算页
- 回放入口
- 移动端不溢出

### 12.5 旧测试更新

需要更新：

- `tests/sanity_pvp_service_checks.cjs`
- `tests/backend_security_checks.cjs`
- `tests/test_e2e_backend.cjs`
- `tests/browser_pvp_audit.mjs`
- `tests/browser_pvp_mobile_audit.mjs`
- `tests/browser_pvp_mobile_result_audit.mjs`
- `tests/sanity_intro_progress_sync_checks.cjs`
- `tests/sanity_release_gate_coverage_checks.cjs`
- `tests/run_node_checks.sh`
- `tests/run_browser_release_checks.sh`

### 12.6 Release marker

新增 marker：

- `pvp live server-authoritative match`
- `pvp live action reject`
- `pvp live anti-otk budget`
- `pvp live state redaction`
- `pvp live idempotent action`
- `pvp live mulligan`
- `pvp live loadout legality`
- `pvp live reconnect`
- `pvp live replay log`
- `pvp live mobile layout`
- `pvp practice ghost no ranked settlement`

### 12.7 平衡仿真硬门槛

新增：

```text
tests/sanity_pvp_live_content_pack_checks.cjs
tests/sanity_pvp_live_balance_simulation_checks.cjs
```

最低样本：

- 8 套基准斗法谱：快攻、节奏、护盾反击、控制、低血反杀、易伤连击、过牌中速、治疗消耗。
- 8 套基准斗法谱的具体 card id、身份槽和 bot 策略以 `docs/designer_major_upgrade_pvp_content_pack_v1.md` 为准。
- fixture 文件、opening scripts、golden replays、simulation report 和失败报告格式以 `docs/designer_major_upgrade_pvp_balance_fixtures_v1.md` 为准。
- 每个对阵对至少 500 局，整体不少于 10,000 局。
- 额外生成 10,000 组开局脚本，专门压测先手前两回合。

通过标准：

- 先手总胜率必须落在 47%-53%。
- 任意基准对阵对先手胜率不得超出 45%-55%。
- 0 次出现“后手第一次行动前死亡”。
- 0 次出现“后手第一次行动开始时没有任何可行动线”：无可打牌、无可用防御、无可结束回合收益且生命已低于 20%。
- 对局时长 P95 <= 12 分钟，P99 <= 15 分钟。
- 第 14 整轮后仍未结束的对局数量为 0。
- 任一单套基准构筑综合胜率不得 >55%。
- 至少 6 套基准构筑综合胜率落在 48%-52%。
- 每套构筑镜像局都必须输出先后手胜率差和代表 replay，差值绝对值不得超过 5%。
- 调息后首个真实行动窗口有效行动率不得低于 95%。
- 身份槽引入的先后手偏差绝对值不得超过 3%。
- 中高爆发和致命 / 准致命 setup 必须至少给对手一个完整应对窗口；无应对窗口样本为 0。
- 连续低自主回合、仅防御 / 结束回合窗口和控制镜像低交互链必须进入报告；控制锁死窗口为 0。
- 重复开局簇占比不得超过 12%，避免 draw-5 环境把对局压成脚本化 opening。
- 败因解释覆盖率必须为 100%，复盘建议只能引用公开事件、本方当时可见信息或脱敏审计字段。

### 12.8 与现有门禁脚本映射

| 当前文件 | V10 处理 |
| --- | --- |
| `tests/run_node_checks.sh` | 增加 live engine / rules / replay / backend / WS / balance simulation |
| `tests/run_browser_release_checks.sh` | 增加 live ranked desktop/mobile 审计 |
| `tests/browser_pvp_audit.mjs` | 保留为 practice ghost 或拆出旧残影审计，不再代表正式排位 |
| `tests/browser_pvp_mobile_audit.mjs` | 拆成 practice ghost mobile 与 live ranked mobile |
| `tests/browser_pvp_mobile_result_audit.mjs` | 增加 live settlement / replay 结果页检查 |
| `tests/sanity_release_gate_coverage_checks.cjs` | 增加 12.6 marker 全覆盖 |
| `tests/backend_security_checks.cjs` | 增加 live action 不能伪造胜负、不能越权 join match |
| `tests/test_e2e_backend.cjs` | 增加两个真实用户 live match smoke |

## 13. 文档和文案同步

### 13.1 必须同步文件

开发进入文案阶段后必须同步：

- `game-intro.html`
- `progress.md`
- `docs/backend_migration_guide.md`
- `docs/production_deploy.md`
- `docs/designer_major_upgrade_pvp_content_pack_v1.md`
- `docs/designer_major_upgrade_pvp_ui_copy_samples_v1.md`
- `docs/designer_major_upgrade_pvp_balance_fixtures_v1.md`
- 旧大版本策划中关于“避免实时 PVP”的段落，需要标注被 V10 覆盖

### 13.2 玩家文案新口径

推荐口径：

- `天命排位`：真人同场，服务端权威，正式榜单。
- `问道练习`：残影与镜像练习，不影响正式排位。
- `好友约战`：真人房间，不默认计分。
- `战局回放`：服务端日志复盘。

禁用口径：

- 不要把残影称为正式排位对手。
- 不要说“无真人时自动切镜像保证排位打通”。
- 不要把本地回执写成服务端权威。
- 入口、toast、断线、超时、结算、复盘文案以 `docs/designer_major_upgrade_pvp_ui_copy_samples_v1.md` 为首版真值。

### 13.3 首战引导合同

首战引导只降低理解成本，不提供隐藏强度补偿。

| 环节 | 必须说明 | 允许 | 禁止 | release gate 证据 |
| --- | --- | --- | --- | --- |
| 排位入口确认 | 真人、正式积分、练习隔离 | 首次点击展示短确认卡，可跳过，之后可回看 | 把练习伪装成排位，隐藏积分影响 | 首次入口截图、跳过后回看入口 |
| 规则短卡 | 生命、起手、抽牌、灵力、伤害预算、后手保护、禁用机制 | 3-5 张短卡，可折叠 | 长篇说明墙阻断首战 | 规则短卡截图、行数抽检 |
| 推荐斗法谱 | 攻击、中速、防守三类低复杂度起步选择 | 每类 3 个关键词和明确弱点 | 推荐 0 费、免费释放、无限递归、额外回合、硬控、随机闪避或复杂检索构筑 | 推荐谱清单、合法池校验 |
| 排位前演武 | 调息、预算拦截、公开 setup、结束回合、复盘入口 | 可选 1 局短练习，可跳过，不写正式积分 | 用演武结果代替真人排位，发排位强度奖励 | 演武结果、积分不变证据 |
| 首败复盘 | 下一局可执行调整 | 1-2 条建议，链接练习和斗法谱调整 | 羞辱玩家，泄露对手隐藏手牌、牌库顺序或 RNG 状态 | 首败复盘截图、隐藏信息脱敏检查 |

复杂度预算：

- 首次排位入口同屏最多解释 3 个概念：真人、正式积分、练习隔离。
- 每张规则短卡最多 4 行；超过时必须拆到可回看的规则详情。
- 推荐谱不能绕过合法池，不能含隐藏数值加成。
- 首战引导奖励只能是外观、称号、练习徽章或非强度货币，不能影响生命、伤害、抽牌、灵力、起手或匹配评分。

首战异常分支矩阵：

| 场景 | 必须反馈 | 验收证据 |
| --- | --- | --- |
| 120 秒无真人 | 当前真人较少，可继续等待、取消或进入问道练习；练习不写正式积分 | 长等待截图、练习积分不变证据 |
| 宽跨度匹配 | 这是宽跨度真人匹配，结算会解释匹配跨度和积分变化 | 宽跨度提示、结算解释截图 |
| 找到对手后断线 | 对手正在重连，准备超时前不写正式积分 | 双端准备房间截图、无积分写入证据 |
| ready timeout | 本局未开始，不写正式积分，可重新匹配或练习 | timeout 结果页、正式积分不变证据 |
| `refresh_required` | 需要刷新权威局面，不能用本地旧状态继续排位 | 刷新提示、刷新后 StateView 证据 |

首败复盘必须给至少三个下一步动作入口：

- 带推荐谱进入问道练习。
- 打开斗法谱调整，并预选 2-4 张建议替换位。
- 继续排位。
- 发起好友约战复现本局关键场景。

首战有限状态机必须覆盖：

| 状态 | 验收口径 |
| --- | --- |
| `first_entry_unseen` | 本赛季首次点击真人排位时出现确认卡和三模式差异 |
| `intro_seen` | 可以继续排位、问道练习、好友约战、规则短卡或跳过 |
| `rule_cards_seen` | 规则短卡可回看，不能用长文阻断首战 |
| `practice_offered` | 排位前演武或首败练习不写正式积分 |
| `first_ranked_queueing` | 长等待、宽跨度、对手断线、ready timeout 和 `refresh_required` 都有分支 |
| `first_ranked_finished` | 第一局结束后进入复盘和下一步动作 |
| `first_loss_reviewed` | 首败复盘建议可追溯，能进入练习、调谱、继续排位或好友复现 |
| `season_dismissed` | 跳过只关闭本赛季引导，不关闭规则回看和复盘 |

首战进度持久化合同：

| 字段 | 要求 |
| --- | --- |
| `accountId` | 登录用户以服务端进度为准；游客只允许本地临时缓存 |
| `seasonId` | 首战引导按赛季隔离，新赛季可以重新出现精简提示 |
| `state` | 只允许使用上表状态，不得用散落布尔值重复表达 |
| `updatedAt` | 用于断线、刷新、多端切换后的最新状态仲裁 |
| `dismissedUntilSeason` | 跳过只对当前赛季生效，不能永久关闭规则回看 |
| `lastFirstMatchId` | 记录首局真人排位，首败复盘和异常恢复都从该 match 派生 |
| `lastReviewAction` | 记录玩家从复盘进入练习、调谱、继续排位或好友复现的选择 |

恢复优先级：

1. 登录用户优先读取服务端首战进度。
2. 服务端缺失时可以读取本地缓存，但必须在下一次联网后回写。
3. 本地缓存和服务端冲突时，以 `updatedAt` 新且状态链合法的一方为准。
4. 规则版本或赛季主版本变化时，允许回到 `intro_seen`，但不能抹掉历史对局、回放和首败建议。

引导、公告和回访关闭状态必须分域：

| 持久化域 | 作用 | 关闭范围 | 不能影响 |
| --- | --- | --- | --- |
| `first_battle_progress` | 首战确认卡、规则短卡、首败复盘路径 | 当前赛季首战引导提示 | 赛季公告、周目标、规则回看、复盘入口 |
| `season_change_announcement_ack` | 补丁、合法池变化、规则版本和赛季重置确认 | 某个公告版本的已读状态 | 首战引导、回访目标、旧回放说明 |
| `season_loop_dismiss_state` | 今日课题、周目标、失败参与奖励提示 | 本日、本周或本赛季的回访提示 | 首战引导、规则变更公告、正式排位入口 |

展示优先级：规则 / 合法池变更公告最高；首战引导只在首次真人排位路径展示；赛季回访只能用轻提示，不得阻断排位、练习、约战或回放入口。

### 13.4 赛季变更公告字段

任何影响正式排位胜负、构筑合法性、赛季积分或奖励边界的变化，都必须有玩家可见公告。

| 字段 | 要求 |
| --- | --- |
| `changeType` | 文案修正、平衡数值、合法池变化、规则版本变化或赛季重置 |
| `reason` | 为什么改，优先说明公平、可读性、拖局、异常局或生态风险 |
| `beforeAfter` | 改动前后差异，数值变化必须写明旧值和新值 |
| `affectedLoadouts` | 受影响斗法谱、身份槽、卡牌或策略标签 |
| `replacementSuggestion` | 旧斗法谱不合法时给出替换入口或替代建议，不能只报错 |
| `effectiveAt` | 生效时间；已入队或已开局对局继续使用入队快照 |
| `snapshotCompatibility` | 说明旧规则快照、旧回放、旧战报如何显示 |
| `rollbackPolicy` | 若触发阻断条件，回退到哪个规则版本、合法池或停排状态 |

赛季变更底线：

- 不能中途改变已匹配或已开局对局的规则。
- 旧回放必须显示旧规则版本，不能用新规则重新解释历史胜负。
- 合法池变化必须解释新增、禁用、转写或解禁原因。
- 赛季重置只影响赛季积分和荣誉，不清除玩家可读战报。

赛季循环 schema 必须包含：

| 字段 | 要求 |
| --- | --- |
| `cycleType` | `daily_topic`、`weekly_goal` 或 `season_goal` |
| `source` | 复盘主题、推荐练习、好友约战、排位表现或赛季公告，不能引用隐藏信息 |
| `recommendedMode` | 真人排位、问道练习、好友约战或复盘 |
| `completionCondition` | 不强迫玩家用弱构筑打正式排位 |
| `rewardType` | 只允许荣誉、徽章、展示、称号或非强度货币 |
| `dailyCap` / `weeklyCap` | 防止失败奖励或约战互刷 |
| `dismissState` | 支持本日、本周或本赛季关闭提示 |
| `auditTags` | 进入赛季循环审计，证明不影响战斗强度或匹配评分 |

赛季循环必须拆成四类数据，避免公告、任务、奖励和玩家进度互相覆盖：

| 数据 | 关键字段 | 禁止 |
| --- | --- | --- |
| `season_loop_definition` | `seasonId`、`cycleType`、`source`、`recommendedMode`、`completionCondition`、`rewardType`、`auditTags` | 直接读取隐藏手牌、牌库顺序、未公开 RNG |
| `season_loop_player_progress` | `accountId`、`seasonId`、`definitionId`、`progress`、`completedAt`、`dismissState` | 用失败次数逼玩家继续掉分 |
| `season_loop_reward_claim_ledger` | `claimId`、`definitionId`、`rewardType`、`claimedAt`、`antiFarmTags` | 发放生命、伤害、抽牌、灵力、起手等强度奖励 |
| `season_loop_reset_policy` | 日重置、周重置、赛季重置、补丁重置和公告版本 | 静默清空玩家已获得荣誉或已保存战报 |

赛季循环审计必须证明：玩家可以关闭提示；失败回访不强迫继续排位；好友约战和练习不会刷正式赛季积分；奖励只影响表达、荣誉或非强度资源。

### 13.5 对局手感状态证据矩阵

每个实时状态都必须有玩家可见反馈和可复查证据。不能只在日志里存在。

| 状态 / 拒绝码 | 玩家可见反馈 | 必要证据 |
| --- | --- | --- |
| `queued` | 正常匹配中、等待时长、可取消 | 匹配入口截图 |
| `queue_expanding` | 正在扩大搜索范围，展示当前跨度原因 | 扩圈阶段截图或录屏 |
| `long_wait` | 真人较少，提供继续等待、取消匹配、进入问道练习 | 长等待三选一截图，练习不写积分证据 |
| `pending` | 行动已提交，裁定中，按钮防重复提交 | pending 截图或录屏 |
| `accepted` / `intent_result(accepted)` | 行动已确认，局面推进到新 revision | accepted 后 revision 变化证据 |
| `rejected` / `intent_result(rejected)` | 展示具体原因，例如灵力不足、目标非法、非当前回合 | reject toast 和状态不推进证据 |
| `duplicate_action` | 上一操作已处理，不重复结算 | 重试返回原结果、奖励不重复证据 |
| `duplicate_action_conflict` | 重复行动内容冲突，需要清理 pending | conflict toast、pending 清理证据 |
| `sync_required` / `stale_state` | 正在同步权威状态，必要时提示刷新 | state_sync 录屏、刷新入口截图 |
| `action_pending` | 上一操作待确认，请勿重复提交 | 连点防抖录屏 |
| `reconnecting` | 正在重连，展示 grace 倒计时 | 重连遮罩截图 |
| `opponent_presence` | 对手重连中或已返回 | presence toast / HUD 证据 |
| `last_10s` | 最后 10 秒明显提示，但不遮挡手牌和行动按钮 | 桌面和移动端倒计时截图 |
| `mobile_confirm` | 移动端关键行动有确认，误触可取消 | 小屏确认层截图 |
| `refresh_required` | 连接恢复失败，需要刷新以获取权威局面 | 刷新提示截图、刷新后 StateView 证据 |

浏览器审计必须覆盖桌面和移动端。移动端截图必须证明倒计时、toast、确认层和弱网状态不遮挡关键手牌、行动按钮、投降确认或结算入口。

双端弱网公平验收必须覆盖：

- A 在自己行动回合断线：A 的行动计时冻结并进入 grace，B 看到对方重连中。
- B 在 A 行动回合断线：A 的行动计时不被冻结，B 重连后收到权威 StateView。
- 断线前已 accepted 的 intent：重连后按原 `serverRevision` 重放，不重复结算。
- grace 外重连：不能恢复已被判负或托管终局的行动权。
- 重连后重复提交同一 action：返回 duplicate 或原 ack，不重复扣资源、播动画或发奖励。

每条验收都必须产出双方 HUD 时间线和服务端事件序列，不能只用单端截图证明。

### 13.6 社交安全底线

首版社交只服务表达、复盘和再战，不参与正式排位数值。

- 预设表情、静音、限频、举报、拉黑、再战、好友约战和脱敏战报分享不得改变正式积分、匹配评分、奖励、隐藏牌序或结算。
- 拉黑不保证在低在线池中永远不再匹配；若因池子过小仍匹配，必须向玩家解释原因，并保留举报与静音入口。
- 再战必须明确模式归属：好友约战或练习可以不计分；正式排位再匹配必须重新入队，不能绕过匹配评分。
- 脱敏战报只能展示公开事件、终局类型、公开 setup、预算拦截、积分变化原因和复盘建议；不能展示对手隐藏手牌、抽牌堆顺序、未公开 RNG 状态或未公开行动意图。
- 首版不提供自由文本聊天、实时观战、完整公开双方手牌、观众弹幕或局外赠礼影响对局。
- 表情必须限频，静音必须本地立即生效；举报必须绑定 match、ruleVersion、事件日志、状态 hash 和结算记录。

社交安全审计必须证明：社交动作不影响积分、匹配评分或奖励；战报已脱敏；实时观战入口不存在；拉黑后仍匹配时有解释；表情限频和静音可用。

### 13.7 娱乐性与流派探索审计

进入开发前，娱乐性不能只用“有 PVP、有奖励、有复盘”代替。首版必须能产出娱乐性审计，证明每局有悬念、可学习和再来一局动机。

娱乐性审计字段：

| 字段 | 要求 |
| --- | --- |
| `stompRate` | 非投降、非严重断线局中，一方第 2 整轮后全程无反击窗口的比例 |
| `closeGameRate` | 终局前两整轮内双方都仍有有效行动线的样本比例 |
| `leadChangeOrThreatShiftRate` | 优势方、最大威胁或长局分数领先发生变化的样本比例 |
| `postGameActionCoverage` | 常见败因是否都有继续排位、练习、调谱、好友复现或收藏高光入口 |
| `deckEditFollowThroughRate` | 玩家从复盘进入调谱、练习或好友复现的路径是否可记录 |
| `rematchIntentRate` | 继续排位、再战或好友约战点击趋势；只用于灰度观察，不用于暗中操控匹配 |

流派探索审计字段：

| 字段 | 要求 |
| --- | --- |
| `loadoutFunHook` | 每套基准谱的一句话爽点 |
| `skillTest` | 每套谱最重要的技能测试，例如防守时机、净化时机、蓄势时机或资源保留 |
| `publicWeakness` | 每套谱可公开解释的弱点和被克制轴 |
| `swapSlots` | 每套谱至少 2-4 张非核心替换卡位 |
| `practiceTopic` | 每套谱至少一个可进入问道练习或好友复现的课题 |
| `masteryRewardBoundary` | 熟练度、徽章和高光收藏不影响生命、伤害、抽牌、灵力、起手或匹配评分 |

若娱乐性不足，只能按以下顺序处理：

1. 优先改善结算后下一步入口、复盘建议和练习课题。
2. 再调整基准谱的公开弱点、替换卡位和克制关系。
3. 再调整赛季课题和推荐练习。
4. 最后才调整战斗规则真值，并重跑全部平衡、隐藏信息和体验公平证据。

### 13.8 文档漂移审计清单

进入开发、冻结实施计划、封板或宣称上线前，必须完成文档漂移审计。

真值顺序：

| 冲突类型 | 裁定顺序 |
| --- | --- |
| 玩法目标、公平底线、上线门槛 | `docs/designer_major_upgrade_overall_plan_v1.md` 优先 |
| 合法牌池、禁用内容、基准斗法谱、身份槽 | 内容包优先，但不得突破主方案禁用机制 |
| 玩家可见文案、toast、按钮、页面短句 | UI 文案样例优先，但不得改变规则、积分和奖励边界 |
| 仿真 fixture、golden replay、报告字段 | fixture 合同优先，但失败阻断以主方案证据模板和本文完成定义为准 |
| 旧开发路径、模块名、接口草案、测试文件名 | 只能作为素材，必须按开发时最新仓库结构重生成实施计划 |

审计必须列出：

- 当前使用的主方案、内容包、需求拆解、UI 文案样例和 fixture 合同版本。
- 每个支撑文档中出现的具体文件路径、模块名、接口路径或测试文件名。
- 这些路径是否仍符合当前仓库结构；不符合时只保留语义合同，重生成实施路径。
- 规则数字是否冲突：生命、卡组、起手、抽牌、灵力、伤害预算、后手保护、长局判定。
- 范围是否冲突：某支撑文档是否开放了主方案禁用机制，例如自由文本聊天、实时观战、0 费排位、客户端胜负上报。
- 验收是否冲突：旧 PVP、残影、practice ghost 或 GitHub Pages 绿灯是否被误当作正式真人排位门禁。
- 最终开发依据：哪些条目被保留、哪些被替换、哪些必须重新冻结。
- 是否需要重新生成实施计划；如果需要，旧路径和旧测试名不得进入任务拆分。
- 高风险体验点是否能映射到主方案 `10.5.1 高风险体验证据索引` 中的唯一主证据；没有主证据的体验不能进入封板结论。

审计输出至少包含：文档版本、引用入口、冲突项、优先级裁定、已废弃路径、保留素材、最终开发依据和是否阻断下一阶段。

## 14. 分阶段开发计划

本节的文件和测试名是阶段责任映射示例，不是冻结落点。真正开工前必须按最新仓库结构重生成实施计划，并以非文件级合同、用户故事和证据产物为准。

### Phase 0：文档与合同

文件：

- `docs/designer_major_upgrade_planning_v8.md`
- `docs/designer_major_upgrade_requirements_v7.md`

验收：

- 无未决条目。
- 规则矩阵明确。
- 数据表明确。
- API/WS 合同明确。
- 测试清单明确。
- 已完成主方案、内容包、本文、UI 文案样例和 fixture 的漂移审计；冲突项有明确裁定。
- 开发前实施计划按最新仓库结构重新生成，不能直接把本文早期建议路径当成冻结落点。

### Phase 1：PVP Engine MVP

责任范围示例：

- `server/pvp-live/engine/*`
- `tests/sanity_pvp_live_engine_checks.cjs`
- `tests/sanity_pvp_live_rules_checks.cjs`
- `tests/sanity_pvp_live_replay_checks.cjs`

验收：

- Node 中双人模拟可完成。
- 事件重放一致。
- 反 OTK 测试通过。

### Phase 2：Live Match Backend

责任范围示例：

- `server/db/database.js`
- `server/routes/pvp-live.js`
- `server/pvp-live/*`
- `server/app.js`
- `tests/pvp_live_backend_e2e.cjs`
- `tests/pvp_live_ws_checks.cjs`

验收：

- 两用户可匹配。
- WebSocket 可同步。
- 投降、超时、断线可收口。
- 服务端可结算。

### Phase 3：Frontend Live PVP

责任范围示例：

- `js/services/backend-client.js`
- `js/services/pvp-live-service.js`
- `js/scenes/pvp-live-scene.js`
- `js/scenes/pvp-scene.js`
- `js/core/pvp-live-battle-adapter.js`
- CSS 对应 PVP live UI

验收：

- 浏览器可完成一场真人 PVP。
- pending/ack/reject 状态清晰。
- 移动端可用。
- 首次进入真人排位时能看到真人、正式积分、练习隔离、规则短卡和推荐斗法谱。
- 匹配等待扩圈、真人较少、继续等待、取消匹配、进入问道练习均有清晰状态，练习不会写入正式积分。
- 行动提交、重复提交、过期同步、`sync_required`、需要刷新、行动待确认、对手思考计时和弱网恢复均可感知。
- 移动端确认、倒计时和弱网状态不能遮挡关键手牌、行动按钮或结算入口。

### Phase 4：Replay / Review / Season

责任范围示例：

- 回放 API
- 回放 UI
- 赛后复盘
- 赛季天道盘接入
- 训练残影推荐

验收：

- 能从 event log 回放。
- 赛后能跳关键回合。
- 排位结果能进入赛季验证线。
- 首败后能进入关键回合复盘，并能解释本局失败的主要公开原因。
- 脱敏战报分享不泄露对手隐藏手牌、牌库顺序、RNG 状态或未公开行动。
- 举报和争议入口能关联对局、规则版本、事件日志和结算记录。
- 赛季补丁、合法牌池变化、规则版本变化和赛季重置公告可追溯；旧回放能解释当时规则。

### Phase 5：Docs / Release Gate / Production

责任范围示例：

- 文案同步文件
- release gate
- prod smoke
- production deploy docs

验收：

- `npm run build:pages`
- `npm run test:node`
- `npm run test:browser:release`
- 生产 smoke 新增 live PVP 最小链路
- UI 文案样例覆盖首战引导、等待扩圈、行动同步、弱网恢复、低干扰社交和脱敏战报。
- release gate 覆盖 `PVP-US-01` 至 `PVP-US-32` 的关键阻断项。
- 发布候选报告包含文档漂移审计结论，确认未把过期路径、过期规则或过期文案当成当前事实。

## 15. 开发注意事项

### 15.1 文件 owner

以下 owner 清单只说明高耦合风险，不代表当前要修改这些文件。若最新仓库结构已经变化，以开发前重生成的实施计划为准。

高耦合文件必须单 owner：

- `js/game.js`
- `js/core/battle.js`
- `js/core/player.js`
- `js/scenes/pvp-scene.js`
- `js/services/pvp-service.js`
- `tests/run_browser_release_checks.sh`
- `tests/sanity_release_gate_coverage_checks.cjs`
- `progress.md`

### 15.2 不要破坏 PVE

PVP 规则必须通过 `ruleVersion` 或 `mode` 生效。

不能直接全局削弱：

- 卡牌数据
- PVE 战斗效果
- 命格 / 誓约 / 命途的 PVE 表现

### 15.3 不要恢复客户端胜负上报

现有服务端默认拒绝客户端上报胜负是正确方向。

V10 不允许为了快速做排位，把 `DEFIER_PVP_ALLOW_CLIENT_REPORTED_RESULT` 作为正式能力。

### 15.4 先做小规则子集

首版 engine 不需要支持全 PVE 卡池。

可以先支持：

- 基础伤害
- 护盾
- 抽牌
- 回灵
- 易伤
- 破绽
- 穿透
- 斩杀
- 护盾转伤
- 治疗
- 弱化

复杂 PVE 专属效果先禁用或转写。

## 16. 完成定义

V10 首版可宣称完成，必须同时满足：

1. 两个真实登录用户能完成一场 live PVP。
2. 胜负完全由服务端事件日志推导。
3. 客户端不能伪造胜负。
4. 首回合 OTK 测试通过。
5. 对手手牌、牌库顺序、rngState 不会泄露到客户端 StateView。
6. action 幂等和重复提交不会造成重复结算。
7. 断线、重连、超时、投降全部有收口。
8. 排位、经济、历史由服务端写入。
9. 残影练习不影响正式排位。
10. 玩家文案明确区分真人排位与练习残影。
11. Node、后端、WebSocket、浏览器、移动端、release gate 均覆盖。
12. 生产部署文档和 smoke 覆盖新链路。
13. 首战引导、规则短卡、推荐斗法谱、排位前演武和首败复盘可用。
14. 匹配等待扩圈、长等待选择和问道练习分流可见，且练习不写入正式积分。
15. 行动提交、accepted、rejected、duplicate、`sync_required`、需要刷新、行动待确认、对手计时和弱网恢复都有清晰反馈。
16. 预设表情、静音、限频、举报、拉黑、再战、好友约战和脱敏战报分享可用；社交动作不影响正式积分、匹配评分或奖励；自由文本聊天和实时观战入口不存在。
17. 赛季补丁、合法牌池、规则版本和赛季重置变化可见，旧回放和已开局对局能解释其规则快照。
18. 文档漂移审计完成，开发计划按最新仓库结构重生成，未把过期文件路径或过期测试名当成冻结事实。
19. 首战异常分支、复盘下一步动作、双端弱网公平和赛季回访循环都有可复查证据。

只有以上全部满足，才能把 V10 称为“真正 PVP”。
