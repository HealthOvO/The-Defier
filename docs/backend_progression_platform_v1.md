# 全游戏长期进度平台 V1

## 目标

V1 将 PVE、挑战、远征和 live PVP 的活动收据汇入独立的账号进度域，提供：

- UTC 日/周周期目标与终身里程碑；
- 幂等奖励领取；
- append-only 经济流水和余额投影；
- 不暴露用户明细的运营总览；
- 明确的事件信任等级，避免把客户端自述误当成权威结算。

该平台不替代现有云存档、挑战面板、赛季盘或 PVP 经济，也不改变战斗数值。V1 奖励货币 `renown` 仅允许未来用于外观和账号展示，不得兑换战力、PVP 积分或现有 PVP 钱包资产。

## 信任模型

| 信任等级 | 当前来源 | 可用于 | 不可用于 |
| --- | --- | --- | --- |
| `server_authoritative` | live PVP 正式结算事务；PVE、挑战、远征的 Authoritative Trials V2 完整重放结算 | 正式任务进度、运营统计、荣誉奖励；未来竞争性非 PVP 投影的唯一合格输入 | 推断隐藏手牌或客户端私有状态；把旧本地 run 追认为权威 |
| `server_verified` | PVE、挑战、远征的 `verified_envelope` 结算 | 非竞争荣誉进度、采用率、可信度分层统计 | 战力、排名、PVP 积分、可交易资产、宣称战斗已由服务端复算 |
| `client_observed` | 已登录客户端的 PVE、挑战、远征收据 | 有日上限的非竞争荣誉进度、玩法采用率 | 战力、排名、PVP 积分、正式胜负认定 |

浏览器用 session token 生成的 HMAC 只能证明请求与当前登录态一致，不能证明客户端报告的战斗结果真实。服务端仅接受最多回溯 24 小时、最多超前 30 秒的 `occurredAt`，未来时间会收敛到服务端接收时间；周期归属和日上限使用校验后的发生时间，接收时间单独保留用于审计。

`server_verified` 比 `client_observed` 多验证账号绑定 ticket、固定内容版本与上下文、单调 checkpoint、过期时间、结算 nonce 和一次性消费，但仍不验证客户端每一步战斗演算。完整契约见 `backend_verified_runs_v1.md`。

Authoritative Trials V2 是独立的可玩服务端状态机。客户端只提交路线、出牌、结束回合、奖励和放弃命令；服务端拥有 seed、抽牌、敌方意图、生命、奖励、分数和终局。只有从序列 0 完整重放后与当前状态哈希及动作链头一致的 run，才直接铸造一条 `server_authoritative` 事件。它不会把旧 PVE、挑战或远征存档静默升级为权威。完整契约见 `backend_authoritative_runs_v2.md`。

## 事件契约

客户端入口为 `POST /api/progression/events`，每批最多 20 条，签名原文为 `JSON.stringify({ events })`。

| eventType | mode | 服务端派生指标 | 说明 |
| --- | --- | --- | --- |
| `battle_won` | `pve/challenge/expedition` | `battle_wins=1`；Boss 时 `boss_wins=1` | `client_observed`，每日每模式最多 20 条 |
| `activity_completed` | `pve/challenge/expedition` | `activity_completions=1` | `client_observed`，每日每模式最多 10 条 |
| `pvp_match_completed` | `pvp_live` | `activity_completions=1`、`pvp_matches=1`、胜者 `pvp_wins=1` | 只能由 live PVP 结算事务写入 |

事件以 `(user_id, event_id)` 和 `(user_id, event_type, source_ref)` 双重去重。客户端提交 `pvp_match_completed` 会被标记为 `server_only_event`，不会落库。

`proof_json` 只保存服务端白名单字段：节点类型、境界、run id、挑战轮转/规则标识、远征章节和 `realm_clear` 原因。客户端提交的奖励数值、任意扩展字段和私密标识不会持久化。

## 周期目标

周期以 UTC 为准。日周期从 00:00 开始，周周期从周一 00:00 开始。超过回溯窗口或未来偏差窗口的客户端事件会被拒绝，不能通过延迟上报把旧事件计入新周期。

V2 目录在保留 V1 日/周/终身目标的基础上加入赛季目标：

- 每日：3 场战斗、1 次活动收官、2 种玩法参与；
- 每周：5 次活动收官、3 次 Boss 胜利、3 种玩法参与；
- live PVP 权威周目标：3 场正式真人对局；
- 赛季可信目标：12 次可信收官、3 种可信玩法；
- 赛季权威目标：10 场正式真人对局、4 场正式胜利；
- 终身：首次收官、10 次收官、参与 3 种玩法。

每个目标在 API 中携带 `trustRequirement`。客户端观察目标与服务端权威目标不会混淆。

## API

### 玩家接口

- `GET /api/progression/status`
  - 通过只读 SQLite 快照返回当前周期、目标进度、信任要求、领取状态、余额和脱敏近期事件，不创建零进度投影或争用写锁。
- `POST /api/progression/events`
  - 批量写入客户端观察事件；返回 `accepted/duplicates/rejected`，支持安全重试。
- `POST /api/progression/rewards/:objectiveId/claim`
  - body 为 `{ objectiveId, cycleId, salt, signature, signatureMode }`，签名同时绑定目标和周期；同一账号、周期和目标只记一次奖励。
- `GET /api/progression/ledger?limit=20&cursor=...`
  - 返回当前账号的荣誉流水，不返回 user id；`cursor` 是由 `created_at` 和 `entry_id` 组成的复合游标，同毫秒流水不会漏页。

所有玩家接口都要求 JWT。两个 POST 接口即使全局完整性校验处于可选模式，也仍强制要求 session/HMAC 签名。

### 运营接口

- `GET /api/progression/ops/overview`
- 请求头：`x-defier-ops-token`
- 服务端私密环境变量：`DEFIER_OPS_TOKEN`

未配置或未提供 token 时返回 404，错误 token 返回 403。响应包含固定枚举聚合，以及权威 run 的哈希化 run/account 引用和脱敏事件摘要；不包含原始 user id、event id、source ref、proof、seed、动作 payload 或规范状态。

## 持久化与迁移

该阶段落地时的全仓 Schema 版本为 `8`。以下列表是本切片的历史迁移边界，不代表仓库当前最新版本：

1. `0001_startup_schema`
2. `0002_progression_platform`
3. `0003_verified_runs`
4. `0004_cloud_state_v2`
5. `0005_season_ops_economy`
6. `0006_authoritative_runs_v2`
7. `0007_authoritative_challenge_ladder`
8. `0008_authoritative_world_rift`

新增表：

- `progression_events`
- `progression_objective_progress`
- `progression_reward_claims`
- `progression_economy_balances`
- `progression_economy_ledger`
- `progression_verified_runs`
- `progression_verified_run_checkpoints`
- `progression_verified_run_receipts`
- `cloud_state_revisions`
- `cloud_state_heads`
- `cloud_state_mutations`
- `cloud_state_ops_events`
- `cloud_state_ops_counters`
- `season_ops_seasons`
- `season_ops_offers`
- `season_ops_mutations`
- `season_ops_purchases`
- `season_ops_compensations`
- `season_ops_entitlements`
- `pvp_season_ladders`
- `pvp_season_ladder_results`
- `season_ops_leaderboard_snapshots`
- `season_ops_leaderboard_entries`
- `season_ops_settlements`
- `season_ops_ops_events`
- `season_ops_ops_counters`
- `progression_authoritative_run_catalogs`
- `progression_authoritative_runs`
- `progression_authoritative_run_actions`
- `progression_authoritative_run_snapshots`
- `progression_authoritative_run_receipts`
- `progression_authoritative_run_ops_events`
- `progression_authoritative_run_ops_counters`
- `challenge_ladder_rotations`
- `challenge_ladder_attempts`
- `challenge_ladder_results`
- `challenge_ladder_entries`
- `challenge_ladder_reward_claims`
- `challenge_ladder_mutations`
- `challenge_ladder_ops_events`
- `challenge_ladder_ops_counters`
- `world_rift_rotations`
- `world_rift_states`
- `world_rift_attempts`
- `world_rift_contributions`
- `world_rift_entries`
- `world_rift_reward_claims`
- `world_rift_mutations`
- `world_rift_ops_events`
- `world_rift_ops_counters`

长期进度迁移只做 additive 的建表、加列、索引和 `occurred_at` 审计字段回填，不从 `game_saves/global_data` 解释或发放长期进度奖励。`0004_cloud_state_v2` 仅把旧 blob 作为 `legacy_import` 云状态 revision 回填，仍不得据此直接发奖；`0005_season_ops_economy` 只回放赛季时间窗内的 live PVP 正式结算，不接受旧异步 PVP 或客户端自述。每个云状态 scope 保留 20 个窗口 revision 和至多 20 个被引用来源，mutation 和原始运维事件保留 30 天，累计运维计数独立保存。

## 原子性与恢复

- 玩家领奖使用独立 SQLite 连接和 `BEGIN IMMEDIATE`；claim、余额和 ledger 在同一事务提交。
- 并发双击或双设备领取时，一个请求创建正式 claim，其他请求返回 `alreadyClaimed=true`，余额只增加一次。
- live PVP 的两条权威进度事件与正式积分/奖励结算在同一事务写入。
- live PVP 的逐场权威结果、正式赛季榜和兼容累计段位与原结算同事务提交；正式榜不读取旧 `pvp_ranks` 作为排名真值，旧结果重放也不能回滚新榜。
- live PVP 的赛季归属优先使用 `setup.battleStartedAt`；最终 snapshot 后的迟到结算与启动回放只能追加 `post_snapshot_noop` 审计，不能改变定榜。
- 人工补偿在独立写事务中原子提交钱包、ledger、补偿记录和 mutation 回执；目标账号需重复确认，原因、金额与协议版本均进入幂等请求哈希。
- 旧结算记录被重新读取时，会以 `INSERT OR IGNORE` 补齐缺失的权威进度事件，且不会重复推进。
- 目标投影可从 append-only 事件重算；状态查询使用只读快照，运营总览直接基于事件统计，不依赖玩家是否打开过进度页面。

## 当前可信结算阶段

PVE、挑战和远征已经接入服务端签发的 run ticket、内容版本、结算 nonce、checkpoint 与一次性原子结算。合格事件会使用相同 `sourceRef` 从 `client_observed` 原位升级为 `server_verified`，不会重复推进目标；旧客户端、游客和网络失败仍保留观察事件路径。

该阶段仍不声称 PVE 已经服务端权威。后续优先级为：

1. 将可确定的地图、规则与战斗输入移到共享确定性模块；
2. 增加带哈希链的动作日志或服务端战斗执行；
3. 服务端复算并核对最终状态后，才可提升到 `server_authoritative`；
4. 只有权威复算完成的事件才能进入竞争性奖励或排行榜。

本版本只完成本地开发、测试、合并和推送，不包含线上部署或生产环境变量变更。
