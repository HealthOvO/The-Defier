# 账号安全与道友协作平台 V1

## 1. 产品目标

S105 同时补齐两个长期缺口：账号只有长效 JWT、无法撤销或改密，以及真人约战和世界裂隙缺少稳定的道友关系。

玩家体验目标遵循 MDA：

- 机制：持久会话、精确搜索、双向道友关系、有限在线状态、好友约战、四人裂隙小队。
- 动态：玩家可以从“认识道友”自然进入约战或每周协作，不需要复制邀请码，也不会因组队获得战力优势。
- 感受：账号状态可控、社交关系可靠、协作有归属感，但没有聊天骚扰、资源互刷或强制组队压力。

正式产品名为“道友录”，后端领域名为 `account-social`，协议版本为：

- `account-security-v1`
- `social-graph-v1`
- `world-rift-squad-v1`

全仓 schema 升级为 V9，迁移 ID 为 `0009_account_social_coop`。

## 2. 明确不做

V1 不提供：

- 自由文本聊天、语音、图片、动态或评论；
- 礼物、转账、交易、借用卡组或资源；
- 根据在线状态、好友数量或小队身份修改匹配分、伤害、血量、卡牌、正式次数；
- 未登录找回密码、邮箱/短信验证或公开管理员重置接口；
- 实时组队战斗、代打、共享操作或小队专属战力；
- 假在线、机器人道友、模拟小队成员或伪造贡献。

忘记密码仍由服主离线核验后人工处理。服务端不新增可被撞库利用的公开重置入口。

## 3. 账号规范与密码合同

### 3.1 用户名

- 新注册用户名先执行 Unicode NFKC、首尾去空白与小写规范化。
- 展示名保留注册时大小写，登录和精确搜索使用 `username_normalized`。
- 新用户名长度 3-24 个 Unicode code point。
- 仅允许字母、数字、下划线、连字符和中日韩文字；不允许控制字符、不可见空白、路径字符或换行。
- 现有账号不改显示名。V9 回填时，规范名唯一的账号直接绑定；历史碰撞账号保留精确原名兼容，并使用不可冲突的 legacy 规范键。
- 搜索只支持完整用户名，不提供前缀枚举、模糊匹配或全量列表。

### 3.2 密码

- 新注册和新密码长度 8-72 字节，至少包含两类：字母、数字、符号。
- 不能与规范化用户名相同，也不能是连续重复的单一字符。
- 现有短密码仍可登录，不在迁移时强制失效；修改密码时必须满足新策略。
- bcrypt cost 固定为 10；未知账号也执行 dummy bcrypt compare，避免明显时序差。
- 登录失败统一返回 `auth_failed`，不区分账号不存在和密码错误。

### 3.3 登录限频

- 使用 SQLite 持久桶，跨进程共享。
- 同一“规范用户名 + IP 前缀”15 分钟内最多 5 次失败，封禁 15 分钟。
- 同一 IP 前缀 15 分钟内最多 30 次失败，防止轮换用户名枚举。
- 桶键只保存 HMAC 摘要，不保存明文 IP。
- 成功登录清理对应用户名桶；过期桶保留不超过 7 天。
- 被限频时返回统一 `auth_rate_limited` 和粗粒度 `retryAfterSeconds`。

## 4. 服务端会话合同

### 4.1 新会话

注册和登录成功后创建 `auth_sessions` 行，并签发包含以下 claims 的 30 天 JWT：

- `id`
- `username`
- `sid`
- `av`：账号 auth version
- `iat/exp`

客户端提供稳定随机 `deviceId` 和受限 `deviceName`。服务端只保存 deviceId 哈希、设备名、粗粒度 IP 摘要和 User-Agent 摘要，不保存原始 IP 或完整 User-Agent。

### 4.2 每次认证

- JWT 签名、过期时间、用户存在性、`auth_version` 和会话撤销状态全部通过才放行。
- 会话 `last_seen_at` 最多每 5 分钟更新一次，避免每个请求争写。
- 新会话被撤销、到期或账号版本变化时统一返回 `session_revoked`。
- 旧 JWT 没有 `sid` 时，仅在账号 `auth_version=1` 且从未改密时兼容；它不能出现在设备会话列表中。
- 改密或全端退出会递增 `auth_version`，立即使全部旧 JWT 和 legacy JWT 失效。

### 4.3 玩家操作

- `GET /api/auth/security`：密码策略、当前会话、设备会话列表和最近安全事件。
- `POST /api/auth/password/change`：当前密码、新密码、mutationId；成功后撤销全部旧会话并签发当前设备的新会话。
- `POST /api/auth/sessions/:sessionId/revoke`：撤销指定其他设备或当前设备。
- `POST /api/auth/logout`：撤销当前持久会话；sid-less legacy JWT 通过递增账号 auth version 在服务端失效，并撤销该账号现有设备会话。
- `POST /api/auth/logout-all`：递增账号版本并撤销全部会话，当前客户端同时退出。

改密、撤销和全端退出使用 `session-v2` HMAC，签名同时绑定 HTTP method、实际 path、salt 与业务 payload，不能跨端点重放。mutationId 同请求返回原回执，改参复用返回 `409 mutation_reused`。

## 5. 道友关系合同

### 5.1 状态机

好友请求状态：

`pending -> accepted | declined | cancelled | expired | blocked`

规则：

- 只能通过完整用户名精确查找。
- 不能请求自己、已屏蔽对象或已有道友。
- 单账号最多 100 名道友、20 条发出 pending、50 条收到 pending。
- 请求 7 天过期；拒绝或取消后同一方向 24 小时冷却。
- A 请求 B 后，若 B 已有指向 A 的 pending，请求在同一事务自动转为 accepted 并创建唯一 friendship。
- 接受请求、创建 friendship、关闭双向 pending 和写 mutation 回执必须原子提交。
- 删除道友不自动屏蔽；再次请求需要经过 24 小时冷却。

### 5.2 屏蔽与静音

- 屏蔽为单向控制，但对双方可见关系产生对称效果：立即结束 friendship、关闭 pending、拒绝定向约战和小队邀请。
- 被屏蔽方不知道具体原因；搜索、请求和邀请统一表现为 `target_unavailable`。
- 静音不删除道友，只隐藏该道友的在线状态和定向邀请提示。
- 解除屏蔽不会自动恢复 friendship。

### 5.3 隐私

`social_profiles` 默认策略：

- `discovery=exact_only`
- `friendRequestPolicy=exact_only`
- `presenceVisibility=friends`
- `pvpInvitePolicy=friends`
- `squadInvitePolicy=friends`

玩家可关闭发现、好友请求、在线状态或邀请。公开响应只使用随机 `profileId`，不暴露内部 user id。

## 6. 有限在线状态

- 登录客户端在前台每 45 秒发送一次 heartbeat，TTL 为 120 秒。
- 活动枚举固定为 `menu/pve/pvp_queue/pvp_match/world_rift/away`。
- 活动值只用于展示，不参与匹配、奖励或权威结算。
- 对道友只暴露 `online/recent/offline` 和允许展示时的活动枚举，不返回精确 IP、设备、sessionId 或原始心跳时间。
- `recent` 表示 15 分钟内出现过；更旧统一为 offline。
- 页面关闭、网络中断或进程崩溃后必须依靠 TTL 自然离线，不保留假在线。

## 7. 好友约战接入

- 新客户端从道友列表提交 `targetProfileId`，服务端解析真实 user id。
- 创建定向 PVP 邀请前再次检查 friendship、双方 block、目标邀请策略与 host/target 当前状态。
- 通过后复用现有 `LivePvpStore.createInvite()`、invite inbox、setup、权威战斗和 friendly 结算；不新增第二套对战引擎。
- 好友约战继续固定 `mode=friendly`、`rankedImpact=none`、`rewardImpact=none`。
- 旧客户端的 `targetUsername` 只作为兼容输入；服务端仍要求有效 friendship，否则统一返回 `target_unavailable`。
- 无目标邀请码仍可线下分享加入，但不会绕过屏蔽关系。
- join 在消费邀请码前再次检查当前关系并校验来宾牌组；SQLite claim 使用 nonce 和 30 秒崩溃租约。
- `pvp_live_matches.source_invite_code` 与 `source_rematch_match_id` 使用部分唯一索引。进程在 match 保存和业务 fact 完成之间退出时，重启会恢复原 matchId，数据库禁止同一邀请或再战来源创建第二局。

## 8. 世界裂隙协作小队

### 8.1 建队与成员

- 每轮裂隙每个账号最多属于一个 active 小队，小队上限 4 人。
- 玩家可单人建队；队长只能邀请当前道友，邀请 48 小时或轮换结束时过期。
- 接受邀请时再次检查 friendship、block、隐私、容量和当前成员归属。
- 成员在本轮尚无小队贡献时可以退出；已有一条贡献链接后，成员资格锁定到该轮领取窗口结束，避免一份正式次数帮助多个小队。
- 队长在无人贡献时可退出；系统把队长转给最早加入成员，空队删除。已有贡献后队长不能解散或踢出锁定成员。

### 8.2 贡献快照

- 个人仍使用原有每周 5 次、同槽位同种子、最佳 3 次个人榜。
- 权威贡献首次投影时，在同一 SQLite 写事务读取 active squad membership，并写不可变 `world_rift_squad_contributions` 链接。
- 一条 contribution 只能链接一个 squad；后续退出、改队或重试不能移动历史贡献。
- 只有 `contribution > 0` 才会写小队事实、锁定成员或取得领奖资格；历史 0 分脏行在投影和退出判断中同样按无贡献处理。
- 小队不会增加全服 `appliedDamage`、个人 contribution、正式次数或种子槽。

### 8.3 小队计分

小队协作分只取每名成员最佳一次贡献：

`cooperativeScore = sum(max(contribution) per contributing member)`

因此 4 人小队理论上限为 9600。额外正式次数仍可改善个人榜，但不会让单人重复刷满小队榜。

并列顺序：

1. cooperativeScore 降序；
2. contributingMembers 降序；
3. 最佳一次剩余生命总和降序；
4. 最佳一次回合总和升序；
5. squadId 字典序。

不使用提交时间，不设末刀、首杀或击破归属。

### 8.4 小队里程碑

| 协作分 | 奖励 |
| --- | --- |
| 2000 | 30 荣誉 |
| 5000 | 60 荣誉 |
| 8000 | 100 荣誉 |

- 奖励全部 `cosmetic_only`，不影响战斗数值。
- 只有向该小队贡献过至少一条权威 contribution 的成员可领取。
- 每账号、轮换、小队、milestone 只领取一次。
- claim、余额、ledger、claim fact 与 mutation 回执在同一事务提交。
- 上一轮小队奖励沿用世界裂隙 7 天领取窗口。

## 9. 玩家 API

### 9.1 道友录

- `GET /api/social/dashboard`
- `GET /api/social/search?username=<exact>`
- `POST /api/social/requests`
- `POST /api/social/requests/:requestId/accept`
- `POST /api/social/requests/:requestId/decline`
- `POST /api/social/requests/:requestId/cancel`
- `POST /api/social/friends/:profileId/remove`
- `POST /api/social/controls/:profileId/block`
- `POST /api/social/controls/:profileId/unblock`
- `POST /api/social/controls/:profileId/mute`
- `POST /api/social/controls/:profileId/unmute`
- `POST /api/social/preferences`
- `POST /api/social/presence/heartbeat`

所有写请求包含 `protocolVersion` 与 `mutationId`，并强制绑定 method/path 的 `session-v2` HMAC。

### 9.2 裂隙小队

- `POST /api/social/rift-squads`
- `POST /api/social/rift-squads/invites`
- `POST /api/social/rift-squads/invites/:inviteId/accept`
- `POST /api/social/rift-squads/invites/:inviteId/decline`
- `POST /api/social/rift-squads/leave`
- `POST /api/social/rift-squads/rewards/:milestoneId/claim`

`GET /api/world-rift/current` 增加当前/上一轮 squad 投影与小队榜，不改变已有字段语义。

## 10. V9 持久化

### 10.1 users additive columns

- `username_normalized`
- `auth_version`
- `password_changed_at`
- `disabled_at`

### 10.2 新表

账号安全：

- `auth_sessions`
- `auth_login_limits`
- `auth_security_mutations`
- `auth_security_events`
- `auth_security_counters`

道友关系：

- `social_profiles`
- `social_friend_requests`
- `social_friendships`
- `social_relationship_controls`
- `social_presence`
- `social_mutations`
- `social_ops_events`
- `social_ops_counters`

裂隙小队：

- `world_rift_squads`
- `world_rift_squad_members`
- `world_rift_squad_invites`
- `world_rift_squad_contributions`
- `world_rift_squad_entries`
- `world_rift_squad_reward_claims`
- `world_rift_squad_mutations`

## 11. 事务和并发要求

- 全部写路径使用独立连接和 `BEGIN IMMEDIATE`。
- 双进程同时接受同一好友请求，只能创建一个 friendship。
- 双进程同时加入最后一个小队席位，只能一个成功，member_count 不得超过 4。
- 贡献投影和 squad link/entry 更新同事务；任一步失败必须全部回滚。
- 双设备领取同一小队奖励，只写一条 claim 和一条经济 ledger。
- block 与 accept、leave 与 contribution、改密与普通请求的竞态必须有确定结果，不能形成半关系或失效会话继续写入。

## 12. 客户端体验

主菜单增加“道友录”入口，首屏是可操作的四页工具，不做营销页：

- 道友：好友列表、有限在线状态、约战与裂隙邀请。
- 信笺：收到/发出的请求和小队邀请。
- 裂隙小队：成员、锁定状态、协作分、里程碑与榜单。
- 账号安全：修改密码、当前设备、其他会话、撤销和全端退出。

约束：

- 搜索输入只接受完整用户名，结果不展示内部 ID。
- block、remove friend、leave locked squad、revoke current session 和 logout-all 需要明确确认。
- 账号切换后立即清空旧道友、会话和小队状态；旧异步响应不得回灌。
- 390px 移动端无横向溢出，所有按钮至少 40px 触控高度。
- loading/empty/error/offline/rate-limited/session-revoked 状态均有明确可恢复操作。

## 13. 运维与隐私

- `GET /api/social/ops/overview` 和账号安全 ops 需要 JWT 后再校验 `x-defier-ops-token`，避免 token validity oracle。
- 运维响应只返回哈希化 account/profile/session/squad 引用。
- 不返回密码哈希、JWT、deviceId、IP、User-Agent、完整 request body、内部 user id 或 presence 原始时间线。
- 原始安全/社交事件保留 30 天，聚合计数长期保留；presence 最多保留 24 小时。

## 14. 验收门禁

必须覆盖：

- V8 数据库保留旧用户、旧存档、旧权威 run、世界裂隙贡献并升级到 V9；
- 新注册策略、规范名碰撞、未知账号 dummy compare 和双桶限频；
- 新会话、指定撤销、改密换签、全端退出和 legacy JWT 兼容/失效边界；
- 好友请求全部状态、反向自动接受、上限、过期、block/accept 竞态和双进程唯一关系；
- presence TTL、隐私、静音和账号切换抑制；
- 好友 PVP 邀请复用原权威 friendly 对局且正式积分不变；
- 小队容量竞态、贡献不可移动、最佳一人一次计分、跨进程 claim 幂等；
- 真实浏览器完成注册登录、道友互加、好友约战入口、小队邀请/加入、权威裂隙贡献、协作分刷新、改密和旧会话失效；
- 桌面和 390px 移动截图、0 console error、release report 结构完整。

## 15. 发布边界

S105 只在独立 worktree 和开发分支完成设计、开发、验证、提交与推送。未经单独指令，不执行线上部署、生产数据库迁移、systemd/Nginx 操作或 `main` 合并。
