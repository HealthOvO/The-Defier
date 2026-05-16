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

> 安全说明：浏览器端不会持有服务端 HMAC 密钥。云存档和残影的可信度必须依赖服务端认证、服务端规则校验和反作弊约束；如需启用额外完整性签名，只能使用服务端私有的 `DEFIER_HMAC_SECRET`，不要把该密钥写入前端配置或源码。

### 后端安全配置

| 环境变量 | 必填条件 | 说明 |
| --- | --- | --- |
| `JWT_SECRET` | 生产环境必填 | 生产环境必须配置至少 32 字符的 JWT 私钥；开发环境未配置时仅使用本地默认值。 |
| `DEFIER_HMAC_SECRET` | `DEFIER_INTEGRITY_REQUIRED=1` 时必填 | 服务端私有 HMAC 密钥，至少 32 字符，只能保存在服务端环境变量中。 |
| `DEFIER_INTEGRITY_REQUIRED` | 可选 | 设为 `1`/`true`/`yes`/`on` 时，`/api/saves` 与 `/api/ghosts/current` 强制要求 `signature` 和 `salt` 并校验通过。 |

启动校验：

- 生产环境缺失合规 `JWT_SECRET` 时，服务会 fail-fast，不会继续启动。
- `DEFIER_INTEGRITY_REQUIRED=1` 但缺失合规 `DEFIER_HMAC_SECRET` 时，服务会 fail-fast，不会继续启动。

完整性签名规则：

- 签名算法：`HMAC-SHA256`。
- 签名输入：服务端使用版本化分段输入 `v1 + "\n" + salt + "\n" + JSON payload`，避免简单字符串拼接二义性。
- `signature` 必须是 64 位 hex 字符串。
- `salt` 必须是 8-128 位字符串，只允许字母、数字、`.`、`_`、`:`、`-`。
- 当 `DEFIER_INTEGRITY_REQUIRED` 未开启时，签名为兼容性可选字段；当它开启时，缺失签名返回 400，签名不匹配返回 403。
- 默认浏览器客户端不会发送 `salt`/`signature`。只有可信中间层、自建工具或服务端代理生成签名时才应携带这两个字段。
- 当请求显式携带 `salt` 或 `signature` 任一字段时，服务端会视为一次完整性签名尝试；两者必须同时存在且满足格式要求，否则返回 400，即使未开启强制模式。

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
- **Body**: `{ "slotIndex": 0, "saveData": { ... }, "saveTime": 1710000000000, "salt": "optional-nonce", "signature": "optional-hmac" }`
- **Note**: `salt` 和 `signature` 仅供可信调用方使用，默认浏览器客户端不发送。
- **Response**: `{ "success": true }`

#### 2.2 读取云存档 (多槽位)
- **GET** `/api/saves`
- **Auth**: Required
- **Response**: 
```json
{
    "success": true,
    "data": [
        { "slotIndex": 0, "saveData": { ... }, "saveTime": 1710000000000 },
        { "slotIndex": 1, "saveData": { ... }, "saveTime": 1710000000000 }
    ]
}
```

### 3. 全局数据模块 (Global Data)

#### 3.1 保存全局数据 (如成就)
- **POST** `/api/user/global`
- **Auth**: Required
- **Body**: `{ "globalData": { "achievements": [...] } }`
- **Response**: `{ "success": true }`

#### 3.2 读取全局数据
- **GET** `/api/user/global`
- **Auth**: Required
- **Response**: `{ "success": true, "data": { "achievements": [...] } }`

### 4. 异步 PVP 残影 (Ghosts)

#### 4.1 上传残影
- **POST** `/api/ghosts/current`
- **Auth**: Required
- **Body**: `{ "realm": 3, "ghostData": { "name": "xxx", "hp": 100, "deck": [...] }, "salt": "optional-nonce", "signature": "optional-hmac" }`
- **Note**: `salt` 和 `signature` 仅供可信调用方使用，默认浏览器客户端不发送。
- **Response**: `{ "success": true }`

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
- `created_at` (timestamp)

### game_saves
- `id` (PK)
- `user_id` (FK -> users.id)
- `slot_index` (int, 0-3)
- `save_data` (json)
- `save_time` (bigint)
- Unique Key: `(user_id, slot_index)`

### game_ghosts
- `id` (PK)
- `user_id` (FK -> users.id)
- `user_name` (string)
- `realm` (int)
- `ghost_data` (json)
- `upload_time` (bigint)
- Index on `realm`

## 第一阶段迁移提示

1. 当前仅将认证与云存档抽象为 `BackendClient`。
2. `PVPService` 中强依赖 Bmob `PlayerRank` 和 `GhostSnapshot` 的逻辑暂时未动。目前若关闭 Bmob 并启用 Server，PVP 将自动降级使用本地离线逻辑。
3. 后续阶段可以继续扩充 `BackendClient` 来支持 PVP 的 `PlayerRank` 同步与匹配接口。
