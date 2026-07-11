# 全游戏赛季运营与权威经济平台 V1

本文件是开发期协议索引。完整玩法与安全设计见 `superpowers/specs/2026-07-11-season-ops-economy-design.md`，实施顺序见 `superpowers/plans/2026-07-11-season-ops-economy.md`。

## 稳定边界

- 正式排行只接收 live PVP 的 `server_authoritative` 结算。
- `client_observed` 与 `server_verified` 只能获得 `cosmetic_only` 荣誉和外观。
- 统一钱包使用 `progression_economy_balances/ledger`；余额、订单、权益和回执必须原子提交。
- 旧 PVP 钱包、旧商店和 `pvp_ranks` 保留兼容，但不是新平台的 canonical 数据源。
- 赛季规则、商品目录和定榜结果均版本化且不可变。
- 对局归属按服务端状态中的 `setup.battleStartedAt` 判定，并持久化为 `match_started_at`；历史数据缺失时才回退到房间创建时间。赛季结束一小时只是最短缓冲，且所有赛季内开战的正式对局必须已经结算或作废，两个条件同时满足后才可定榜。
- 每个正式结算先写 `pvp_season_ladder_results` 逐场日志，再更新赛季榜；旧结果重放只能返回原状态，不能回滚新榜。
- 最终 snapshot 生成后，迟到结算只追加 `post_snapshot_noop` 审计日志，不得修改正式榜；启动回放遵守同一冻结边界。
- `pvp_ranks` 继续保存旧客户端累计段位；正式赛季分从 1000 独立起算，两者在同一结算事务内分别投影。
- 人工补偿只能增加 `renown`，单次限额为 1-5000，必须使用原因白名单、目标账号重复确认和持久 mutation 回执。

## 协议版本

- 目录：`season-ops-catalog-v1`
- 玩家读模型：`season-ops-dashboard-v1`
- 购买：`season-ops-purchase-v1`
- 排行：`season-ops-leaderboard-v1`
- 定榜：`season-ops-snapshot-v1`
- 结算：`season-ops-settlement-v1`
- 补偿：`season-ops-compensation-v1`

购买签名业务体固定为：

```json
{
  "protocolVersion": "season-ops-v1",
  "seasonId": "s1-genesis",
  "offerId": "offer-genesis-badge",
  "mutationId": "season-mutation-unique-id"
}
```

同账号、同 mutationId、同请求返回原回执；改动任一业务字段返回 `409 mutation_reused`。新客户端不得在签名、余额或幂等校验失败后回退到旧 PVP 商店。

运营接口要求账号 JWT 与 `x-defier-ops-token` 双重鉴权。定榜、结算、对账和补偿事件持久化脱敏 actorRef 与 requestId，不在玩家或运营聚合响应中返回原始 user id。

人工补偿使用 `POST /api/season-ops/ops/compensations`，业务体包含 `protocolVersion/seasonId/targetUserId/confirmTargetUserId/mutationId/reasonCode/amount`。`targetUserId` 与 `confirmTargetUserId` 必须完全一致，`reasonCode` 仅允许 `service_incident`、`settlement_repair`、`support_resolution`。同一目标账号、同一 mutationId、同一业务体返回原回执；改参复用返回 `409 mutation_reused`。钱包、追加式 ledger、补偿记录、mutation 回执和审计事件在一个 `BEGIN IMMEDIATE` 事务内提交，响应只暴露不可逆 `recipientRef`。

## 发布边界

本阶段不执行生产部署、生产写入或服务器环境变量修改。
