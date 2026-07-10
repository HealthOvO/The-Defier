# 全游戏版本化云状态 V2

## 目标

云状态 V2 解决多设备同时保存时的静默覆盖问题，并为误操作和坏存档提供可恢复历史。它覆盖四个游戏存档槽和账号全局数据，但不接管 PVP 钱包、长期进度账本或可信运行结算等独立服务端业务域。

核心保证：

- 新客户端使用服务端 revision 做 compare-and-swap（CAS），不会仅凭客户端时间戳覆盖未知的新版本。
- 一次业务写入使用稳定 `mutationId`；网络重试返回同一结果，复用该 id 修改请求则被拒绝。
- 每次成功写入或恢复都生成不可变 revision。恢复旧版本会创建新的 head，不修改历史记录。
- V2 签名覆盖槽位、基准 revision、mutation、内容和客户端时间，不允许把已签名内容移动到其他槽位或修改时间。
- 所有存档、历史和恢复接口都按 JWT 账号隔离；运营接口只返回无标识聚合数据。

## 协议

V2 写请求必须带 `protocolVersion: "cloud-state-v2"` 和有效 session/HMAC 签名。浏览器以当前 Bearer token 作为 session HMAC key；不能生成签名时写入直接失败，不降级为旧协议。

槽位保存使用 `POST /api/saves`，签名业务体固定为：

```json
{
  "protocolVersion": "cloud-state-v2",
  "slotIndex": 0,
  "baseRevisionId": "rev-current-or-null",
  "mutationId": "mutation-unique-id",
  "saveData": {},
  "saveTime": 1710000000000
}
```

全局数据保存使用 `POST /api/user/global`，签名业务体固定为：

```json
{
  "protocolVersion": "cloud-state-v2",
  "baseRevisionId": "rev-current-or-null",
  "mutationId": "mutation-unique-id",
  "globalData": {},
  "globalUpdatedAt": 1710000000000
}
```

`baseRevisionId` 必须是客户端最后读取或成功写入的 head。当前无 head 时传 JSON `null`。服务端 head 已变化时返回 HTTP 409、稳定 `reason` 和最新 `current` 数据；客户端更新 revision 缓存并让玩家选择，不自动覆盖。

读取接口保留原 `saveData/saveTime/globalData/globalUpdatedAt` 字段，并增加：

- `revisionId`
- `revisionNumber`
- `contentHash`
- `headUpdatedAt`

## 历史与恢复

| 操作 | 接口 |
| --- | --- |
| 槽位历史 | `GET /api/saves/slots/:slotIndex/history?limit=20` |
| 槽位恢复 | `POST /api/saves/slots/:slotIndex/restore` |
| 全局历史 | `GET /api/user/global/history?limit=20` |
| 全局恢复 | `POST /api/user/global/restore` |

恢复请求同样要求完整签名、`baseRevisionId` 和 `mutationId`。`sourceRevisionId` 必须属于当前账号和目标 scope。成功恢复后，服务端复制来源内容并追加 `operation=restore` 的新 revision；不会原地改写来源或原 head 对应的 revision。

历史接口最多返回最近 20 个版本。服务端保留每个 scope 最近 20 个 revision，并额外保留这些 revision 中 `restore` 记录仍引用的来源版本；因此物理上限为 40 个 revision。当引用它的恢复记录退出保留窗口后，来源才可被清理。槽位新写入上限 256 KiB，全局新写入上限 128 KiB；超限请求在进入事务前拒绝。

## 兼容路径

旧客户端未带 `protocolVersion=cloud-state-v2` 时仍按现有时间戳 last-write-wins 规则运行，旧签名仍只覆盖数据 blob。兼容写入被接受后也会追加 revision，因此升级后的客户端可以看到连续历史。

兼容路径只用于平滑升级，不是推荐安全协议。新客户端不得在 V2 签名或 CAS 失败时回退旧写入，否则会重新引入静默覆盖。

启动迁移 `0004_cloud_state_v2` 会在 `BEGIN IMMEDIATE` 事务中把已有 `game_saves` 和 `users.global_data` 幂等回填为 `legacy_import` revision 与 head，不改变原数据投影，旧客户端仍能读取。多个进程同时启动时会串行完成回填，不会重复 revision 或运营计数。历史数据即使超过新写入体积上限也可迁移；上限只约束迁移后的新请求。

## 客户端行为

- revision 缓存按账号隔离并持久化；切号、退出和重新登录不会串用其他账号的 head。每个异步请求绑定发起账号，切号后到达的旧回包会返回 `cloud_state_account_changed`，不会写入新账号缓存或驱动本地恢复。
- 每个槽位继续使用串行保存队列，单次请求及其网络重试复用一个 mutationId。
- CAS 冲突进入本地/云端选择。玩家明确选择本地后，客户端才基于刚读取的最新 head 重新提交。
- 存档位中的“云端历史”可查看最近版本。恢复成功后客户端重新读取 head、写入本地存档并载入。
- 全局成就是累计数据；发生冲突时先合并最新云端集合和统计，再基于新 head 重试，不能盲目覆盖。

## 运维与安全

`GET /api/saves/ops/overview` 仅在配置 `DEFIER_OPS_TOKEN` 后开放。报告读取累计计数器，只包含操作数量、聚合字节和存储总量，不返回 user id、revision id、mutation id、content hash 或存档内容。原始运维事件和 mutation 幂等回执保留 30 天；累计计数不随明细清理而回退。

主要防护包括：JWT 账号隔离、完整业务体签名、payload 上限、CAS、事务写 head、mutation 幂等、revision 内容哈希、历史归属校验和恢复追加语义。会话签名用于防止传输字段被局部篡改，但不能把浏览器存档内容提升为服务端权威战斗结果。

## 验收边界

本阶段门禁覆盖旧数据回填、旧客户端兼容、完整签名防篡改、双设备竞争写、mutation 重试和复用、账号隔离、槽位与全局历史、非破坏恢复、payload 上限、运营脱敏、客户端切号缓存、冲突选择、真实浏览器历史恢复，以及完整 Node 和发布检查。

本阶段只开发、测试、合并和推送，不部署线上，也不执行生产写入验证。
