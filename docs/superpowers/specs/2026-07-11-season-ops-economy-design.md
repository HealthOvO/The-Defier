# 全游戏赛季运营与权威经济平台 V1 设计

## 目标体验

玩家每次进入游戏都能在一个入口看到三件事：本周期值得完成什么、已经获得多少可支配荣誉、赛季竞争结果是否可信。系统服务于自主选择和长期掌握，不以连续登录、随机付费或战力出售制造压力。

MDA 对应关系：

- Mechanics：跨模式契约、只增事件、权威钱包、外观商店、live PVP 排行、赛季快照。
- Dynamics：玩家可在 PVE、挑战、远征和 PVP 间换路完成目标；高强度竞争只影响荣誉与外观。
- Aesthetics：短期有明确收获，长期有赛季身份，失败不会导致已获进度倒退，竞技结果能解释且可追溯。

## 权威边界

| 数据来源 | 信任级别 | 可推进契约 | 可发放内容 | 可进入正式排行 |
| --- | --- | --- | --- | --- |
| 客户端观察事件 | `client_observed` | 日常、周常基础目标 | 非战力荣誉 | 否 |
| 可信 run envelope | `server_verified` | 赛季历练目标 | 非战力荣誉、外观 | 否 |
| live PVP 服务端结算 | `server_authoritative` | 正式 PVP 契约 | 非战力荣誉、外观 | 是 |

严禁把卡牌、属性、起手、匹配优先级、战斗资源或隐藏胜率加成作为契约、商店、排行奖励。旧客户端结果和镜像练习不得写正式 ladder。

## 周期与契约

全部周期以 UTC 为准。日周期在 00:00 切换，周周期在周一 00:00 切换；标准赛季为 6 周有效期加 1 周结算展示期，由版本化目录给出 `startsAt/endsAt/graceEndsAt`。赛季结束后契约不再推进，宽限期只允许领取已完成奖励。

| 契约 | 周期 | 指标 | 目标 | 信任要求 | 荣誉 |
| --- | --- | --- | ---: | --- | ---: |
| 三战热身 | 日 | 战斗胜利 | 3 | client observed | 30 |
| 今日收官 | 日 | 玩法收官 | 1 | client observed | 20 |
| 换一种打法 | 日 | 不同玩法 | 2 | client observed | 40 |
| 七日历练 | 周 | 玩法收官 | 5 | client observed | 100 |
| 破关问道 | 周 | Boss 胜利 | 3 | client observed | 100 |
| 诸途并进 | 周 | 不同玩法 | 3 | client observed | 120 |
| 真人论道 | 周 | 正式真人对局 | 3 | server authoritative | 80 |
| 可信行脚 | 赛季 | 可信玩法收官 | 12 | server verified | 240 |
| 三途验卷 | 赛季 | 可信不同玩法 | 3 | server verified | 300 |
| 天道应战 | 赛季 | 正式真人对局 | 10 | server authoritative | 260 |
| 天道胜场 | 赛季 | 正式真人胜利 | 4 | server authoritative | 320 |

日常完整完成约 90 荣誉，周常约 400 荣誉，赛季目标共 1120 荣誉。玩家不需要每天清空任务；赛季目标提供追赶空间，失败对局仍计入参战契约。

## 经济模型

V1 只保留一种平台货币 `renown`，中文显示为“荣誉”。它复用 `progression_economy_balances` 和追加式 `progression_economy_ledger`。

水龙头：契约领取、正式赛季结算、人工补偿。回收口：固定价格外观商店。余额不得为负，任意领取、购买、结算或补偿必须在 `BEGIN IMMEDIATE` 中同时提交余额、ledger 和业务回执。

人工补偿不是自由输入的余额修改：只允许 1-5000 荣誉，原因必须是 `service_incident`、`settlement_repair` 或 `support_resolution`，请求必须同时携带并匹配 `targetUserId/confirmTargetUserId`。同一目标账号与 mutationId 的同业务体重试返回原回执，改动原因、金额或赛季后复用 mutationId 返回 409；审计只保存不可逆 actorRef/recipientRef。

| 商品 | 类型 | 价格 | 限购 | 权益 |
| --- | --- | ---: | --- | --- |
| 开天见证徽记 | badge | 180 | 永久 1 | `badge.genesis_witness` |
| 诸途行者称号 | title | 360 | 永久 1 | `title.path_walker` |
| 星痕卡背 | card back | 620 | 永久 1 | `card_back.star_trace` |
| 问道边框 | frame | 900 | 永久 1 | `frame.dao_seeker` |
| 逆命旌旗 | banner | 1400 | 永久 1 | `banner.defier` |

禁止随机箱、每日过期折扣、付费货币和可重复消耗品。商品目录与赛季规则都要有不可变版本和内容哈希。

## 正式排行与结算

正式榜只读取 `pvp_season_ladders`，主键为 `(season_id, user_id)`。live PVP 权威结算按服务端 `setup.battleStartedAt` 归属赛季，并把该时间持久化为 `match_started_at`；历史记录缺失时才回退到房间创建时间。同一事务先追加 `pvp_season_ladder_results`、再更新 ladder；逐场主键 `(season_id, user_id, match_id)` 阻止任意历史重放回滚新榜。旧 `/api/pvp/match/result`、镜像练习和友谊赛不得写入。

旧客户端继续从 `pvp_ranks` 读取累计段位，因此 live 结算同时维护累计段位和从 1000 独立起算的正式赛季分，两种口径不得互相覆盖。赛季结束后保留至少一小时边界结算缓冲，期间允许赛季内已开局的对局落账；超过一小时后仍必须确认所有赛季内开战的正式对局均已结算或作废，不能只靠墙钟时间生成最终 snapshot。定榜后保持不可变，迟到结算和启动恢复只追加 `post_snapshot_noop` 日志，不改变 ladder 或 snapshot。

赛季结束后生成不可变 snapshot，排序键为 `score DESC, wins DESC, updated_at ASC, user_id ASC`。奖励档位：

| 档位 | 条件 | 荣誉 | 外观权益 |
| --- | --- | ---: | --- |
| 冠首 | 第 1 名 | 1200 | `title.season_champion` |
| 前 10% | 至少第 2 名，向上取整 | 700 | `frame.season_top_10` |
| 前 25% | 向上取整 | 400 | `badge.season_top_25` |
| 参赛 | 至少 1 场正式结算 | 200 | `banner.season_participant` |

结算以 `(season_id, user_id)` 幂等。重复结算返回原结果；对账任务只修复缺失 ledger 或 entitlement，不重复加余额。

## 数据模型

迁移 `0005_season_ops_economy` 新增：

- `season_ops_seasons`：版本化赛季规则快照与哈希。
- `season_ops_offers`：不可变商品目录。
- `season_ops_mutations`：玩家写操作的 request hash 和持久回执。
- `season_ops_purchases`：购买订单与 ledger 关联。
- `season_ops_compensations`：人工补偿回执、白名单原因、目标账号、关联 ledger 和脱敏操作者引用。
- `season_ops_entitlements`：账号级永久外观权益。
- `pvp_season_ladders`：按赛季隔离的权威 PVP 排名。
- `pvp_season_ladder_results`：按玩家和战局追加的权威投影日志，记录赛季分前后值、胜负、发生时间和投影状态。
- `season_ops_leaderboard_snapshots` / `season_ops_leaderboard_entries`：不可变定榜。
- `season_ops_settlements`：赛季奖励结算与恢复状态。
- `season_ops_ops_events` / `season_ops_ops_counters`：脱敏运维事实与累计计数。

不把 `pvp_economy.coins`、本地灵石、天机、业果或旧存档数值兑换为荣誉；这会把旧的非权威状态升级成平台货币。旧 PVP 钱包只作为历史展示兼容，不再新增跨模式来源；旧商店中的卡牌、洗点和战力商品不得进入正式赛季入口。挑战和远征也不得再直接发放天道币或 PVP 道具。

## API

玩家接口全部要求 JWT；写接口还要求 session/HMAC 完整业务体签名。

- `GET /api/season-ops/current`：赛季、契约、钱包、权益、商店、个人排名、前榜和近期流水。
- `GET /api/season-ops/leaderboard?limit=...`：当前权威 live PVP 榜。
- `GET /api/season-ops/ledger?limit=...&cursor=...`：平台荣誉流水。
- `POST /api/season-ops/store/purchases`：`seasonId/offerId/mutationId` 幂等购买。

运营接口要求账号 JWT 与 `x-defier-ops-token` 双重鉴权；写操作审计保存不可逆 actorRef 与 requestId：

- `GET /api/season-ops/ops/overview`
- `POST /api/season-ops/ops/compensations`
- `POST /api/season-ops/ops/seasons/:seasonId/snapshot`
- `POST /api/season-ops/ops/seasons/:seasonId/settle`
- `POST /api/season-ops/ops/seasons/:seasonId/reconcile`

运营响应只返回固定枚举聚合，不暴露 user id、mutation id、ledger source、请求哈希或权益明细。

## 客户端体验

主菜单增加“赛季司”入口。界面使用四个 tab：契约、商店、天道榜、账本。未登录显示账号入口；加载、空态、错误态和重试均在页内完成。

- 契约按日/周/赛季分组，显示信任级别、进度和领取状态。
- 商店先显示余额和已拥有状态，购买必须二次确认，网络重试复用 mutationId。
- 榜单明确标注只统计真人正式结算；玩家自己的名次即使不在前榜也可见。
- 账本展示正负 delta、原因、余额和时间，不展示内部 source id。
- 异步请求绑定发起账号；切号后的旧响应不得更新界面、余额或触发购买结果。

## 验收

必须覆盖：全新迁移、旧库迁移、并发启动、目录哈希漂移、周期边界、`battleStartedAt` 跨边界对局、超过最短缓冲的边界对局延迟结算、unresolved match 阻止定榜、最终 snapshot 后迟到结算 no-op、逐场重放防回滚、旧累计段位兼容、信任过滤、重复领奖、重复 mutation、mutation 改参、余额不足、并发双购、补偿目标确认/限额/原因白名单/幂等、跨账号隔离、旧 PVP 不污染 ladder、live 结算同事务写榜、定榜排序、重复结算、漏发对账、运营双重鉴权与脱敏 actor 审计、客户端切号与旧读竞态、真实浏览器领取/购买/焦点恢复/移动端布局、完整 Node 与 release gate。

本阶段只开发、测试、合并和 push，不部署线上。
