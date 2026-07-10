# 全游戏可信结算 V1

## 范围与边界

本阶段为 PVE、挑战和远征增加账号绑定的 run ticket、固定内容版本、过期时间、服务端 nonce、战斗 checkpoint 和一次性结算。合格的长期进度事件使用原 `sourceRef` 从 `client_observed` 升级为 `server_verified`，不会新增第二条事件或重复累计目标。

本阶段的权威级别是 `verified_envelope`：服务端验证 run 的身份、上下文、顺序和结算生命周期，但没有重放客户端的每个战斗动作。因此它不得用于战力、排名、PVP 积分、可交易资源或正式胜负裁定，也不得标记为 `server_authoritative`。现有荣誉奖励继续保持 `cosmetic_only`。

## 生命周期

1. 已登录客户端先按旧链路记录 `client_observed` 事件，确保离线和旧客户端仍能推进非竞争荣誉目标。
2. 客户端为一个稳定 `clientRunId` 请求 ticket，并提交玩法、`verified-run-v1` 内容版本和固定上下文。
3. 服务端返回账号绑定的 `ticketId`、`expiresAt` 与 `settlementNonce`；数据库仅持久化 nonce 的 SHA-256 摘要。
4. 每次胜利用稳定 `sourceRef` 提交 `battle_won` checkpoint。服务端要求同账号、同事件类型和同来源的 `client_observed` 已存在，且其 `proof.runId` 等于 ticket 的 run id；随后在 `BEGIN IMMEDIATE` 中分配单调序号、写 checkpoint，并原位升级观察事件。
5. 完成玩法时提交 `outcome=completed`、同一 nonce、完成证明和稳定完成来源。服务端同样要求完成观察事件已存在，再校验模式条件，并在一个事务内写收据、升级完成事件和消费 ticket。
6. 同 ticket、同完成来源重试返回同一收据并标记 `idempotent=true`；不同完成来源返回 `409 run_already_settled`。

状态机只有 `active -> settled` 或 `active -> expired`。已结算或过期 ticket 不能再追加 checkpoint。

## API 契约

三个接口都要求 JWT 和强制 session/HMAC 签名。签名业务体是去掉 `salt/signature/signatureMode` 后的完整 JSON；checkpoint 与 settle 的 body `ticketId` 必须等于 URL 参数。

### 签发 ticket

`POST /api/progression/verified-runs/tickets`

```json
{
  "clientRunId": "run-local-0001",
  "mode": "pve",
  "contentVersion": "verified-run-v1",
  "context": {
    "saveSlot": 0,
    "realm": 3,
    "characterId": "Hero",
    "runPathId": "path-a",
    "runDestinyId": "destiny-a",
    "spiritCompanionId": "companion-a",
    "mapSnapshotHash": "map-0123456789abcdef"
  }
}
```

同账号、同 `clientRunId`、同上下文重复请求返回原 ticket；同 run id 改玩法、版本或上下文返回 `409 client_run_conflict`。TTL 为 PVE 24 小时、挑战 8 天、远征 48 小时。

固定上下文如下：

| mode | 必要上下文 |
| --- | --- |
| `pve` | `saveSlot/realm/characterId/runPathId/runDestinyId/spiritCompanionId/mapSnapshotHash`，其中地图哈希必填 |
| `challenge` | `saveSlot/challengeMode/rotationKey/ruleId/goalRealm/seedSignature` |
| `expedition` | `saveSlot/realm/chapterIndex` |

### 写入 checkpoint

`POST /api/progression/verified-runs/:ticketId/checkpoints`

```json
{
  "ticketId": "vrun-...",
  "sourceRef": "run-local-0001:r3:battle_won:boss",
  "eventType": "battle_won",
  "proof": {
    "nodeType": "boss",
    "realm": 3,
    "runId": "run-local-0001"
  }
}
```

每个 ticket 最多 64 个 checkpoint。同 ticket、同来源幂等；并发请求在事务中获得唯一且连续递增的序号。其他账号读取或写入统一返回 404，避免泄露 ticket 是否存在。

checkpoint 来源在同一账号内只能属于一个 ticket。无对应观察事件返回 `409 observed_event_required`；观察事件 run id 不符或来源已被其他 ticket 使用时返回 `409 observed_event_run_mismatch/verified_source_replay`。服务端绝不通过可信接口新建 `progression_events`。

### 一次性结算

`POST /api/progression/verified-runs/:ticketId/settle`

```json
{
  "ticketId": "vrun-...",
  "sourceRef": "run-local-0001:r3:activity_completed",
  "outcome": "completed",
  "settlementNonce": "64-char-hex",
  "proof": {
    "realm": 3,
    "reason": "realm_clear",
    "runId": "run-local-0001"
  }
}
```

模式结算条件：

- PVE：至少一个战斗 checkpoint、至少一个 Boss checkpoint、`realm_clear`，且完成境界与 ticket 一致。
- 挑战：至少一个战斗 checkpoint，挑战模式、轮转、规则一致，完成境界达到目标境界。
- 远征：至少一个战斗 checkpoint、`realm_clear`，且章节与 ticket 一致。

## 客户端兼容与恢复

- 游客、离线、旧客户端或可信接口网络失败时，保留原 `client_observed` 路径，游戏主流程不因验证服务失败而阻塞。
- 验证操作按账号存储在 `theDefierVerifiedRunQueueV1`，登录账号变化时不发送、不串队列，并保留给原账号重试。
- 同账号会话刷新时，签名和 Bearer token 使用同一会话快照，避免签名期间换 token。
- 明确不可重试的版本、上下文、过期、nonce 或已结束错误会停止验证重试，但已提交的观察事件仍保留。
- 当前环境不能生成 session/HMAC 时，`verified_run_signature_required` 直接降级并移除验证操作，不形成永久重试。
- PVE 基础 run、挑战 run、远征 run 都持久化 `runId`、创建账号和槽位。跨账号加载同一存档时，普通 PVE 会为当前账号 fork 新 run；旧账号的挑战和远征状态不会恢复。远征恢复还会校验当前存档槽。

## 持久化与原子性

迁移 `0003_verified_runs` 增加：

- `progression_verified_runs`：ticket、账号、run、上下文哈希、nonce 哈希、状态和累计计数。
- `progression_verified_run_checkpoints`：ticket 内唯一序号，以及账号范围内不可跨 ticket 重放的唯一来源和白名单证明。
- `progression_verified_run_receipts`：每个 ticket 唯一的不可变结算收据。

checkpoint 与结算都使用独立 SQLite 连接和 `BEGIN IMMEDIATE`。收据、ticket 状态和 `progression_events` 信任升级在同一事务中提交；进程重启后重复签票或结算仍返回原对象。

## 运营与安全

`GET /api/progression/ops/overview` 的 `verifiedRuns` 只返回固定枚举聚合：玩法、状态、收据数、已到期仍标活跃数、内容版本和权威级别。它不返回 user id、ticket、nonce、source ref、proof 或收据内容。

主要防护包括账号所有权隔离、URL/body ticket 绑定、完整业务体签名、内容版本钉住、上下文哈希、checkpoint 数量上限、事务序号、nonce 常量时间比较、一次性收据和过期检查。nonce 不替代服务端战斗执行；获取客户端 session 的攻击者仍可伪造客户端战斗结果，这是下一阶段动作日志复算或服务端战斗引擎要解决的问题。

## 验收与发布边界

Node 门禁覆盖鉴权、强制签名、账号隔离、幂等签票、上下文冲突、无观察事件拒绝、跨 ticket 来源重放拒绝、观察事件原位升级、并发 checkpoint、错误 nonce、一次性结算、三种玩法、v2 到 v3 迁移、过期、进程重启、运营脱敏、客户端会话竞争、离线回退、终态降级、跨账号同槽恢复和存档桥接。后端 E2E 覆盖真实客户端签名的完整生命周期。

本阶段只进行本地开发、测试、合并和推送，不包含线上部署、生产读写验证或生产环境变量变更。
