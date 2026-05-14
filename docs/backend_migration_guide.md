# The Defier Backend Migration Guide

## 概述

The Defier 客户端现已支持通过配置切换后端服务（`Bmob` 或自建 `Server`）。
本文档定义了迁移到自建服务器时，服务器需要实现的 API 接口列表与建议的表结构。

## 前端配置切换

在 `js/config/bmob.config.local.js` 中配置后端选项：

```javascript
window.__THE_DEFIER_CONFIG__.backend = {
    provider: 'server' // 或 'bmob'
};

window.__THE_DEFIER_CONFIG__.server = {
    baseUrl: 'https://api.your-server.com',
    authPathPrefix: '/auth',
    savePathPrefix: '/saves',
    userPathPrefix: '/user',
    ghostPathPrefix: '/ghosts'
};
```

## 后端 API 规范

所有请求默认接收和返回 `application/json`，且对于需要认证的接口，请求头需带上 `Authorization: Bearer <sessionToken>`。

### 1. 认证模块 (Auth)

#### 1.1 注册
- **POST** `/auth/register`
- **Body**: `{ "username": "xxx", "password": "xxx" }`
- **Response**: `{ "success": true, "user": { "objectId": "uid", "username": "xxx", "sessionToken": "token123" } }`

#### 1.2 登录
- **POST** `/auth/login`
- **Body**: `{ "username": "xxx", "password": "xxx" }`
- **Response**: `{ "success": true, "user": { "objectId": "uid", "username": "xxx", "sessionToken": "token123" } }`

### 2. 云存档模块 (Saves)

#### 2.1 保存存档
- **POST** `/saves`
- **Auth**: Required
- **Body**: `{ "slotIndex": 0, "saveData": { ... }, "saveTime": 1710000000000 }`
- **Response**: `{ "success": true }`

#### 2.2 读取云存档 (多槽位)
- **GET** `/saves`
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
- **POST** `/user/global`
- **Auth**: Required
- **Body**: `{ "globalData": { "achievements": [...] } }`
- **Response**: `{ "success": true }`

#### 3.2 读取全局数据
- **GET** `/user/global`
- **Auth**: Required
- **Response**: `{ "success": true, "data": { "achievements": [...] } }`

### 4. 异步 PVP 残影 (Ghosts)

#### 4.1 上传残影
- **POST** `/ghosts/current`
- **Auth**: Required
- **Body**: `{ "realm": 3, "ghostData": { "name": "xxx", "hp": 100, "deck": [...] } }`
- **Response**: `{ "success": true }`

#### 4.2 随机拉取对手残影
- **GET** `/ghosts/random?realm=3`
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