# Code Review 修复报告：后端配置与 HMAC 边界

## 1. 报告范围

- 审查范围：最近三次提交累计变更。
- 主要提交：
  - `c5ef68a Refactor hub events and harden release checks`
  - `54025e9 Remove local artifacts from repository`
  - `a1aa477 Harden backend config and E2E checks`
- 本轮追加修复提交：
  - `6a1ef29 Remove client-side HMAC secret`

## 2. 审查结论

本次 Code Review 重点检查了配置安全、后端 API、E2E 门禁和运行时安全边界。最终确认 1 个需要修复的问题：

- 浏览器端仍保留与服务端 fallback 相同的 HMAC 密钥。
- 服务端 `DEFIER_HMAC_SECRET` 缺失时会回退到公开硬编码密钥。
- 云存档和残影上传路径把该 HMAC 当作防篡改机制，但客户端可读取同一密钥并伪造签名。
- 该问题经两个独立验证支线确认，严重级别评估为 `Medium`；如果线上 PVP、排行榜或云存档强依赖该签名作为反作弊边界，可上调为 `High`。

## 3. 问题详情

### 3.1 客户端可见 HMAC 密钥

原实现中，`js/services/backend-client.js` 在浏览器包内生成 HMAC 签名，并包含固定密钥：

- 客户端可从前端资源中读取密钥。
- 攻击者可对任意存档或残影 payload 重新计算合法签名。
- 该签名不能证明数据来自可信游戏流程。

### 3.2 服务端 fallback 密钥与客户端一致

原实现中，`server/utils/hmac.js` 在未配置 `DEFIER_HMAC_SECRET` 时使用同一个硬编码 fallback：

- 未配置环境变量的部署会接受客户端公开密钥生成的签名。
- 这使 HMAC 只能提供格式一致性，不能提供真实防篡改保证。

### 3.3 上传接口的安全边界不清晰

存档和残影接口原逻辑会在缺少签名时只打印告警并继续写入：

- 这进一步说明 HMAC 不是强制安全边界。
- 如果继续保留“Anti-Cheat”语义，容易造成误判和安全假象。

## 4. 已完成修复

### 4.1 移除浏览器端 HMAC 密钥

已修改 `js/services/backend-client.js`：

- 不再在浏览器端保存服务端 HMAC 密钥。
- 不再为云存档和残影上传构造空签名字段。
- 保留接口行为，上传仍由服务端认证和服务端规则校验保护。

### 4.2 移除服务端硬编码 fallback

已修改 `server/utils/hmac.js`：

- 移除 `the_defier_secret_key_2026` fallback。
- 新增 `isSignatureConfigured()`。
- `DEFIER_HMAC_SECRET` 未配置时，签名校验不会通过。
- `generateSignature()` 在缺少服务端私钥时会抛出明确错误。
- 签名比较改用 `crypto.timingSafeEqual()`，避免普通字符串比较。

### 4.3 调整存档和残影路由语义

已修改：

- `server/routes/saves.js`
- `server/routes/ghosts.js`

修复内容：

- HMAC 仅在服务端配置了私有 `DEFIER_HMAC_SECRET` 且请求提供签名时启用。
- 移除“缺少 HMAC 即 Anti-Cheat 告警”的误导性语义。
- 明确说明存档和残影安全仍依赖服务端认证、服务端数据校验和规则约束。

### 4.4 增加回归测试

新增 `tests/sanity_backend_hmac_checks.cjs`，并接入 `tests/run_node_checks.sh`。

覆盖内容：

- 未配置 `DEFIER_HMAC_SECRET` 时，HMAC 不应被视为启用。
- 未配置密钥时，签名校验必须失败。
- 未配置密钥时，生成签名必须抛错。
- 配置测试密钥后，合法签名通过、篡改 payload 失败。

### 4.5 更新文档说明

已修改 `docs/backend_migration_guide.md`：

- 明确浏览器端不持有服务端 HMAC 密钥。
- 明确云存档和残影可信度应依赖服务端规则校验。
- 明确如需启用额外完整性签名，只能使用服务端私有 `DEFIER_HMAC_SECRET`。

## 5. 验证结果

已完成以下验证：

- `node tests/sanity_backend_hmac_checks.cjs`：通过
- `npm run build:pages`：通过
- `npm run test:node`：通过
- `node server/test-api.js && node tests/test_e2e_backend.cjs`：通过
- 残留 grep 检查：通过

残留 grep 已确认未发现：

- `the_defier_secret_key_2026`
- `DEFIER_HMAC_SECRET ||`
- `Anti-Cheat.*without HMAC`
- 过时的客户端 HMAC 注释

## 6. 当前 Git 状态

- 本地最新提交：`6a1ef29 Remove client-side HMAC secret`
- 当前分支状态：`main...origin/main [ahead 1]`
- 推送状态：尚未成功推送。
- 原因：两次执行 `git push origin main` 均因无法连接 GitHub 失败。
- 错误摘要：`Failed to connect to github.com port 443`

## 7. 后续动作

建议网络恢复后执行：

```bash
git push origin main
```

如果线上曾使用已暴露的旧 Bmob 或后端凭据，还需要在对应平台完成凭据轮换。代码提交只能移除仓库内泄露内容，不能自动使已暴露凭据失效。

## 8. 风险说明

本轮修复移除了“客户端共享密钥”这一伪安全边界，但并不等价于完整反作弊系统。

后续如果需要提高云存档或 PVP 残影可信度，应优先考虑：

- 服务端权威结算关键数值。
- 服务端校验卡牌、法宝、境界、血量、奖励来源是否合法。
- 对关键战斗过程保存 replay 或事件日志，由服务端重放或抽样校验。
- 对 PVP 残影进入匹配池前增加更严格的结构和数值约束。

## 9. 本轮追加硬化

在后续质量报告的回归缺口基础上，本轮继续完成以下硬化：

- `server/utils/hmac.js`
  - HMAC 输入改为版本化分段拼接：`v1 + "\n" + salt + "\n" + payload`，避免简单 `payload + salt` 的二义性。
  - 新增签名格式校验：`signature` 必须是 64 位 hex。
  - 新增 `salt` 格式校验：8-128 位，只允许字母、数字、`.`、`_`、`:`、`-`。
  - 新增 `DEFIER_INTEGRITY_REQUIRED` 强制模式；开启后缺签名返回 400，签名不匹配返回 403。
  - 明确“只携带 salt 或只携带 signature”也会被视为格式错误并返回 400。
- `server/middleware/auth.js` 与 `server/app.js`
  - 生产环境启动时要求 `JWT_SECRET` 至少 32 字符。
  - `DEFIER_INTEGRITY_REQUIRED=1` 时启动期校验 `DEFIER_HMAC_SECRET` 至少 32 字符，不满足即 fail-fast。
- `server/routes/saves.js` 与 `server/routes/ghosts.js`
  - 统一通过 `verifyRequestIntegrity()` 处理签名校验与错误返回。
  - 残影上传对字符串 payload 增加 JSON 解析错误处理，非法 JSON 返回 400。
- 测试补强
  - 扩展 `tests/sanity_backend_hmac_checks.cjs` 覆盖强制模式、格式校验和缺签名行为。
  - 新增 `tests/backend_security_checks.cjs` 覆盖接口层 HMAC、401/400/403 错误语义、强制模式缺密钥启动失败和 10 并发写入。
  - 接入 `tests/run_node_checks.sh`，将后端异常与并发检查纳入固定门禁。
