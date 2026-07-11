# 全游戏赛季运营与权威经济平台 V1 实施计划

## 阶段 1：Schema 与目录

1. 新增 `server/season-ops/catalog.js`，固化赛季、契约、商品和排行奖励目录。
2. 新增 `server/season-ops/bootstrap.js`，以 `BEGIN IMMEDIATE` 建表、校验目录哈希并幂等回填已存在的 live PVP 参与者。
3. 将 schema version 提升到 5，并把新资源加入平台状态与迁移测试。

## 阶段 2：契约与经济

1. 扩展 progression cycle 与 objective catalog，加入赛季契约和严格 trust filter。
2. 新增 season ops service：dashboard、leaderboard、ledger、购买、mutation receipt。
3. 购买在一个事务内完成订单、余额扣减、ledger、entitlement 和回执，任何一步失败全部回滚。
4. 人工补偿使用 JWT + ops token、目标账号二次确认、原因白名单、1-5000 限额和 mutation 回执；钱包、ledger、补偿记录与审计同事务提交。

## 阶段 3：权威榜与结算

1. live PVP 结算同事务更新 `(season_id, user_id)` ladder。
2. 逐场追加 `(season_id, user_id, match_id)` 权威日志，优先以 `setup.battleStartedAt` 持久化的 `match_started_at` 归属赛季并阻止旧结果回滚新榜。
3. 保留旧 `pvp_ranks` 累计段位，正式赛季分从 1000 独立起算；两种投影同事务提交。
4. 赛季结束保留至少一小时边界结算缓冲，并确认赛季内开战的正式对局已全部结算或作废，再生成不可变 snapshot、奖励档位和幂等 settlement。
5. 实现 reconcile，恢复缺失 ledger/entitlement，不能重复加余额。
6. 最终 snapshot 后的迟到结算和启动回放只写 `post_snapshot_noop` 审计，禁止改变 ladder。

## 阶段 4：API 与客户端

1. 新增独立 `/api/season-ops` 路由，玩家写入复用 session/HMAC，运营操作使用 JWT + ops token 双重鉴权并记录脱敏 actorRef。
2. BackendClient 增加账号绑定的 dashboard、leaderboard、ledger 和购买方法。
3. 新增 SeasonOpsView 与主菜单入口，完成契约、商店、榜单、账本四个视图及移动端布局。

## 阶段 5：验证与集成

1. Node：schema、目录、周期、信任、经济并发、幂等、补偿、跨账号、榜单、结算、冻结恢复、ops。
2. E2E：注册登录、事件、领奖、购买、权益读回、live 结算入榜。
3. Browser：真实 UI、真实后端、账号切换、购买重试、焦点恢复、移动端无溢出。
4. 接入 release report 结构门禁，执行挑战者审查并修复。
5. 更新迁移/平台/进度文档，提交、合并 main、push；不部署线上。
