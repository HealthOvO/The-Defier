# The Defier Backend Migration Guide

## 概述

The Defier 客户端现已支持通过配置切换后端服务（`Bmob` 或自建 `Server`）。
本文档定义了迁移到自建服务器时，服务器需要实现的 API 接口列表与建议的表结构。

## 前端配置切换

默认配置位于 `js/config/bmob.config.js`，仓库只保留脱敏默认值。真实后端地址或私有 Bmob 凭据不要提交到 Git。

本地调试推荐使用 `localStorage.theDefierServerConfig` 覆盖服务端地址；仓库也提供了脱敏模板 `js/config/bmob.config.example.js` 供私有部署脚本参考。

```javascript
localStorage.setItem('theDefierServerConfig', JSON.stringify({
    baseUrl: 'https://api.your-server.com',
    authPathPrefix: '/api/auth',
    savePathPrefix: '/api/saves',
    userPathPrefix: '/api/user',
    ghostPathPrefix: '/api/ghosts'
}));
```

## 后端 API 规范

所有请求默认接收和返回 `application/json`，且对于需要认证的接口，请求头需带上 `Authorization: Bearer <sessionToken>`。

> 安全说明：浏览器端不会持有服务端 HMAC 密钥。云存档和残影的可信度必须依赖服务端认证、服务端规则校验和反作弊约束；浏览器链路只使用会话级签名，服务端私有的 `DEFIER_HMAC_SECRET` 不得写入前端配置或源码。

### 后端安全配置

| 环境变量 | 必填条件 | 说明 |
| --- | --- | --- |
| `JWT_SECRET` | 生产环境必填 | 生产环境必须配置至少 32 字符的 JWT 私钥；开发环境未配置时仅使用本地默认值。 |
| `DEFIER_HMAC_SECRET` | `DEFIER_INTEGRITY_REQUIRED=1` 时必填 | 服务端私有 HMAC 密钥，至少 32 字符，只能保存在服务端环境变量中。 |
| `DEFIER_INTEGRITY_REQUIRED` | 可选 | 设为 `1`/`true`/`yes`/`on` 时，`/api/saves`、`/api/user/global` 与 `/api/ghosts/current` 强制要求 `signature` 和 `salt` 并校验通过。 |

启动校验：

- 生产环境缺失合规 `JWT_SECRET` 时，服务会 fail-fast，不会继续启动。
- `DEFIER_INTEGRITY_REQUIRED=1` 但缺失合规 `DEFIER_HMAC_SECRET` 时，服务会 fail-fast，不会继续启动。

完整性签名规则：

- 签名算法：`HMAC-SHA256`。
- 签名输入：服务端使用版本化分段输入 `v1 + "\n" + salt + "\n" + JSON payload`，避免简单字符串拼接二义性。
- `signature` 必须是 64 位 hex 字符串。
- `salt` 必须是 8-128 位字符串，只允许字母、数字、`.`、`_`、`:`、`-`。
- 当 `DEFIER_INTEGRITY_REQUIRED` 未开启时，签名为兼容性可选字段；当它开启时，缺失签名返回 400，签名不匹配返回 403。
- 默认浏览器客户端不会持有服务端 HMAC secret。生产浏览器链路使用 `signatureMode: "session"`，以当前登录 token 作为会话级 HMAC key，签名输入为 `session-v1 + "\n" + salt + "\n" + JSON payload`。
- 可信中间层、自建工具或服务端代理仍可使用服务端私有 HMAC secret 的 `v1` 签名模式。
- 当请求显式携带 `salt` 或 `signature` 任一字段时，服务端会视为一次完整性签名尝试；两者必须同时存在且满足格式要求，否则返回 400，即使未开启强制模式。
- 存档、全局数据和残影写入会对客户端时间戳做归一化：只接受有限、非负、不过分超前的毫秒时间；异常值会回退到服务端当前时间，避免旧客户端或恶意请求把数据永久锁成未来版本。
- 云状态 V2 强制签名完整业务体，并以服务端 revision/CAS 处理并发；详细合同见 `docs/backend_cloud_state_v2.md`。旧 blob-only 签名只作为客户端升级期间的兼容路径。

### 1. 认证模块 (Auth)

#### 1.1 注册
- **POST** `/api/auth/register`
- **Body**: `{ "username": "xxx", "password": "xxx" }`
- **Response**: `{ "success": true, "user": { "objectId": "uid", "username": "xxx", "sessionToken": "token123" } }`

#### 1.2 登录
- **POST** `/api/auth/login`
- **Body**: `{ "username": "xxx", "password": "xxx" }`
- **Response**: `{ "success": true, "user": { "objectId": "uid", "username": "xxx", "sessionToken": "token123" } }`

### 2. 云存档模块 (Saves)

#### 2.1 保存存档
- **POST** `/api/saves`
- **Auth**: Required
- **Body (V2)**: `{ "protocolVersion": "cloud-state-v2", "slotIndex": 0, "baseRevisionId": null, "mutationId": "...", "saveData": { ... }, "saveTime": 1710000000000, "salt": "nonce", "signature": "hmac", "signatureMode": "session" }`
- **Note**: V2 必须签名全部业务字段。`baseRevisionId` 与当前 head 不同时返回 `409 save_conflict`，不会静默覆盖。未带 `protocolVersion` 的旧客户端仍按 `saveTime` 兼容写入。
- **Response**: `{ "success": true, "revisionId": "...", "revisionNumber": 1, "contentHash": "...", "headUpdatedAt": 1710000000000 }`

#### 2.2 读取云存档 (多槽位)
- **GET** `/api/saves`
- **Auth**: Required
- **Response**: 
```json
{
    "success": true,
    "data": [
        { "slotIndex": 0, "saveData": { ... }, "saveTime": 1710000000000, "revisionId": "...", "revisionNumber": 3 },
        { "slotIndex": 1, "saveData": { ... }, "saveTime": 1710000000000, "revisionId": "...", "revisionNumber": 1 }
    ]
}
```

#### 2.3 历史与恢复

- **GET** `/api/saves/slots/:slotIndex/history?limit=20`
- **POST** `/api/saves/slots/:slotIndex/restore`
- 恢复请求带 `baseRevisionId/sourceRevisionId/mutationId` 并签名完整业务体；恢复通过追加 revision 生成新 head，不会原地修改历史。

### 3. 全局数据模块 (Global Data)

#### 3.1 保存全局数据 (如成就)
- **POST** `/api/user/global`
- **Auth**: Required
- **Body (V2)**: `{ "protocolVersion": "cloud-state-v2", "baseRevisionId": null, "mutationId": "...", "globalData": { "achievements": [...] }, "globalUpdatedAt": 1710000000000, "salt": "nonce", "signature": "hmac", "signatureMode": "session" }`
- **Note**: `globalData` 必须是对象；数组、字符串和空值会返回 400。V2 使用 revision/CAS，旧客户端继续按时间戳兼容。
- **Response**: `{ "success": true, "globalUpdatedAt": 1710000000000, "revisionId": "...", "revisionNumber": 2 }`

#### 3.2 读取全局数据
- **GET** `/api/user/global`
- **Auth**: Required
- **Response**: `{ "success": true, "data": { "achievements": [...] }, "globalUpdatedAt": 1710000000000, "revisionId": "...", "revisionNumber": 2 }`

#### 3.3 历史与恢复

- **GET** `/api/user/global/history?limit=20`
- **POST** `/api/user/global/restore`

### 4. 异步 PVP 残影 (Ghosts)

#### 4.1 上传残影
- **POST** `/api/ghosts/current`
- **Auth**: Required
- **Body**: `{ "realm": 3, "ghostData": { "name": "xxx", "hp": 100, "maxHp": 100, "deck": [...], "updatedAt": 1710000000000 }, "uploadTime": 1710000000000, "salt": "optional-nonce", "signature": "optional-hmac", "signatureMode": "session" }`
- **Note**: 每个用户只保留一条当前残影；`uploadTime` 较旧时不会覆盖已有新残影。
- **Response**: `{ "success": true, "skipped": false, "uploadTime": 1710000000000 }`

#### 4.2 随机拉取对手残影
- **GET** `/api/ghosts/random?realm=3`
- **Auth**: Optional (如果不带 Token，则不排除自身数据；如果带 Token，需在查询时排除当前用户)
- **Response**: `{ "success": true, "data": { "userName": "对手名", "realm": 3, "ghostData": { ... } } }`

## 建议的表结构 (关系型数据库示例)

### users
- `id` (PK, string/uuid)
- `username` (unique, string)
- `password_hash` (string)
- `global_data` (json)
- `global_updated_at` (bigint)
- `created_at` (timestamp)

### game_saves
- `id` (PK)
- `user_id` (FK -> users.id)
- `slot_index` (int, 0-3)
- `save_data` (json)
- `save_time` (bigint)
- Unique Key: `(user_id, slot_index)`

### cloud_state_heads / cloud_state_revisions
- `cloud_state_heads` 保存每个账号、每个 scope 的当前 revision 与内容哈希。
- `cloud_state_revisions` 保存不可变版本、父版本、恢复来源、规范化内容和客户端时间。
- 每个 scope 保留最近 20 个版本，并保留该窗口内恢复记录仍引用的来源版本，物理上限为 40 个 revision。

### cloud_state_mutations / cloud_state_ops_*
- `cloud_state_mutations` 保存 V2 mutation 幂等回执，保留 30 天。
- `cloud_state_ops_events` 保存 30 天脱敏事件明细；`cloud_state_ops_counters` 保存不回退的累计聚合。

### game_ghosts
- `id` (PK)
- `user_id` (FK -> users.id)
- `user_name` (string)
- `realm` (int)
- `ghost_data` (json)
- `upload_time` (bigint)
- Index on `realm`
- Unique Key: `(user_id)`

## 当前迁移提示

1. `0004_cloud_state_v2` 以事务方式幂等回填旧槽位和账号全局数据；旧数据不会因超过 V2 新写入上限而阻断启动。
2. 旧客户端继续使用时间戳兼容写入，新客户端必须使用完整业务体签名、revision/CAS 和 mutationId，失败时不得降级旧协议。
3. 云状态只管理四个存档槽和账号全局数据；PVP、长期进度、可信运行与经济账本继续由各自服务端域负责。
