# The Defier 全面质量检查与测试报告

## 1. 测试概述

- 测试日期：2026-05-15
- 快照说明：本文是 2026-05-15 当日质量快照；当前 release gate 基线以后续 `output/release-browser-audits-*/report.json` 和 `tests/run_browser_release_checks.sh` 为准。
- 测试范围：前端渲染、后端接口、卡牌系统、游戏流程、兼容性、存档与进度保存
- 测试环境：
  - macOS 本地环境
  - Node/Vite 本地构建与预览
  - 前端预览地址：http://127.0.0.1:4176/
  - 后端 API 地址：http://127.0.0.1:9000/
- 主要产物：
  - 本轮浏览器审计输出：`output/qa-full-release-2026-05-15/`
  - 说明：该路径为本轮命令显式指定的自定义输出目录，不是 `run_browser_release_checks.sh` 的默认目录。
  - 本轮浏览器主跑报告数量：23 个 `report.json`（2026-05-15 当日基线；当前 release gate 已扩展到 24 组报告）
  - 本轮截图/报告文件数量：158 个

## 2. 执行结论

| 分类 | 结论 | 说明 |
| --- | --- | --- |
| 构建 | 通过 | `npm run build` 成功，Vite 产物生成正常 |
| Node 规则校验 | 通过 | `npm run test:node` 全量 sanity 通过 |
| 前端渲染审计 | 通过 | 23 个 Playwright 发布审计脚本全部通过；当前 release gate 基线为 24 组报告 |
| 移动端兼容 | 通过 | release 审计包含 mobile、reward-mobile、pvp-mobile、challenge-mobile-flow |
| 后端 API 功能 | 通过 | 注册、登录、存档、读取、残影上传、随机残影均通过 |
| 后端异常处理 | 通过 | 未授权读取存档返回 401，错误登录返回 401 |
| 后端并发稳定性 | 通过 | 10 并发注册/存档/读取全成功，失败数 0 |
| 卡牌与流程 | 通过现有门禁 | 卡牌设计守卫、战斗机制、地图、PVP、存档迁移等 sanity 通过 |
| 覆盖缺口 | 存在 | 尚缺真实多浏览器矩阵、强压测、卡牌战斗状态迁移专项、刷新恢复专项 |

## 3. 实际执行命令与结果

| 命令 | 结果 | 关键证据 |
| --- | --- | --- |
| `bytedcli aitest --help` | 通过 | 确认可用 QA skill 分类 |
| `bytedcli aitest skill list` | 通过 | 可用能力：requirement-analysis、data-entity-extra、testcase-generation |
| `npm run build` | 通过 | 主 JS gzip 约 803.99 KB，CSS gzip 约 120.17 KB |
| `npm run test:node` | 通过 | 输出 `All node checks passed.` |
| `npx vite preview --host 127.0.0.1 --port 4173` | 通过 | 4173-4175 被占用后自动使用 4176 |
| `npm start` in `server/` | 通过 | 后端启动于 `http://127.0.0.1:9000` |
| `npm run test:browser:release -- http://127.0.0.1:4176 output/qa-full-release-2026-05-15` | 通过 | 输出 `All browser release audits passed.` |
| `node tests/test_e2e_backend.cjs` | 通过 | 前端服务层到 Node API 全链路成功 |
| `node server/test-api.js` | 通过 | 后端 API 冒烟成功 |
| 临时自定义 10 并发 API 流 | 通过 | 10/10 成功，平均 81 ms，最大 129 ms；该检查为本轮临时命令，尚未固化为仓库脚本 |

## 4. 测试用例文档

### 4.1 前端渲染检查

| 用例 ID | 测试点 | 步骤 | 预期结果 | 实际结果 | 状态 |
| --- | --- | --- | --- | --- | --- |
| FE-001 | 主流程渲染 | 打开预览地址，执行 `browser_audit.mjs` | 主菜单、PVP、图鉴、选角、地图、战斗正常渲染 | 审计通过，无 consoleErrors | 通过 |
| FE-002 | UI 图鉴 | 执行 `browser_ui_gallery_audit.mjs` | 核心 UI 组件可见且无关键遮挡 | 审计通过 | 通过 |
| FE-003 | 地图风险总览 | 执行 `browser_map_overview_risk_audit.mjs` | 地图节点、风险卡、提示信息渲染正常 | 审计通过 | 通过 |
| FE-004 | 奖励页移动端 | 执行 `browser_reward_meta_mobile_audit.mjs` | 奖励页在移动视口下无横向溢出，CTA 可达 | 审计通过 | 通过 |
| FE-005 | PVP 移动端 | 执行 `browser_pvp_mobile_audit.mjs` 和 `browser_pvp_mobile_result_audit.mjs` | PVP 榜单、结算页在移动端布局稳定 | 审计通过 | 通过 |
| FE-006 | 挑战移动端流程 | 执行 `browser_challenge_mobile_flow_audit.mjs` | 挑战流程在移动端可操作 | 审计通过 | 通过 |

### 4.2 后端接口测试

| 用例 ID | 测试点 | 步骤 | 预期结果 | 实际结果 | 状态 |
| --- | --- | --- | --- | --- | --- |
| BE-001 | 健康检查 | GET `/health` | 返回 200 | 200，耗时 28 ms | 通过 |
| BE-002 | 注册 | POST `/api/auth/register` | 返回用户与 token | 成功 | 通过 |
| BE-003 | 登录 | POST `/api/auth/login` | 返回用户与 token | 成功 | 通过 |
| BE-004 | 上传存档 | POST `/api/saves` | 返回 success | 成功 | 通过 |
| BE-005 | 读取存档 | GET `/api/saves` | 返回槽位数据 | 成功读取 `{ level: 10, hp: 100 }` | 通过 |
| BE-006 | 上传残影 | POST `/api/ghosts/current` | 返回 success | 成功 | 通过 |
| BE-007 | 随机残影 | GET `/api/ghosts/random?realm=3` | 返回可用残影 | 成功 | 通过 |
| BE-008 | 未授权存档读取 | 不带 token 请求 GET `/api/saves` | 返回 401 和错误信息 | 401，`未提供认证Token` | 通过 |
| BE-009 | 错误登录 | 使用不存在账号登录 | 返回 401 和错误信息 | 401，`用户名或密码错误` | 通过 |
| BE-010 | 10 并发注册/存档/读取 | 同时执行 10 条用户链路 | 全部成功，无 5xx | 10/10 成功，最大 129 ms | 通过 |

备注：BE-008、BE-009、BE-010 来自本轮临时 Node 命令验证，当前尚未纳入 `tests/` 或 `server/test-api.js` 的固定自动化脚本。

### 4.3 卡牌系统专项检查

| 用例 ID | 测试点 | 步骤 | 预期结果 | 实际结果 | 状态 |
| --- | --- | --- | --- | --- | --- |
| CARD-001 | 卡牌设计守卫 | 执行 `sanity_card_design_guardrail_checks.cjs` | 卡牌数据符合设计约束 | Node 门禁通过 | 通过 |
| CARD-002 | 战斗指令 | 执行 `sanity_battle_command_checks.cjs` | 战斗指令数据与结算规则正确 | Node 门禁通过 | 通过 |
| CARD-003 | 战斗协同 | 执行 `sanity_battle_command_synergy_checks.cjs` | 协同关系符合规则 | Node 门禁通过 | 通过 |
| CARD-004 | 污染/减益/破防 | 执行相关 battle sanity | 状态效果规则稳定 | Node 门禁通过 | 通过 |
| CARD-005 | 卡牌展示 | 执行 UI/Reward/Inventory 相关审计 | 卡牌/奖励展示正常 | 现有审计通过 | 通过 |
| CARD-006 | 抽牌-出牌-弃牌-洗牌状态迁移 | 构造最小战斗状态并逐步断言牌堆变化 | hand/drawPile/discardPile 精确变化 | 尚无专项自动化 | 待补充 |

### 4.4 游戏流程测试

| 用例 ID | 测试点 | 步骤 | 预期结果 | 实际结果 | 状态 |
| --- | --- | --- | --- | --- | --- |
| FLOW-001 | 新开局流程 | 浏览器审计执行主菜单到战斗链路 | 场景跳转正确 | 审计通过 | 通过 |
| FLOW-002 | 地图到战斗 | 选择地图节点进入战斗 | 状态切换到 battle-screen | 审计通过 | 通过 |
| FLOW-003 | 战斗结算到奖励 | 执行战斗并进入奖励页 | 奖励页展示正常 | 审计通过 | 通过 |
| FLOW-004 | 命途/誓约/章节流 | 执行 run-path、vow、chapter 审计 | 章节与命途状态正确 | 审计通过 | 通过 |
| FLOW-005 | PVP 结算 | 执行 PVP 审计 | PVP 对局与结算页正常 | 审计通过 | 通过 |
| FLOW-006 | 云存档链路 | 注册、登录、上传、读取 | 存档数据一致 | E2E 通过 | 通过 |
| FLOW-007 | 本地保存后刷新恢复 | 保存游戏，刷新页面，重建状态 | 进度、玩家、地图一致 | 尚无专项浏览器自动化 | 待补充 |

### 4.5 兼容性与性能测试

| 用例 ID | 测试点 | 步骤 | 预期结果 | 实际结果 | 状态 |
| --- | --- | --- | --- | --- | --- |
| COMP-001 | 桌面布局 | 发布审计桌面视口 | 无遮挡、无关键溢出 | 通过 | 通过 |
| COMP-002 | 移动端布局 | 发布审计移动视口 | 单列布局稳定，操作可达 | 通过 | 通过 |
| COMP-003 | PVP 移动结果页 | 移动端 PVP 结果审计 | 结算内容与按钮可见 | 通过 | 通过 |
| COMP-004 | 后端基础性能 | 10 并发 API 流 | 无失败，延迟可接受 | 平均 81 ms，最大 129 ms | 通过 |
| COMP-005 | 网络错误处理 | 未授权/错误登录请求 | 返回结构化错误 | 通过 | 通过 |
| COMP-006 | 多浏览器矩阵 | Chromium/Firefox/WebKit 全矩阵 | 主流程均稳定 | 当前未执行全矩阵 | 待补充 |
| COMP-007 | 长时运行内存 | 长时间游玩并采集内存 | 无持续泄漏 | 当前未执行长稳测试 | 待补充 |

## 5. 发现的问题与风险分类

### 5.1 阻断问题

| 编号 | 问题 | 影响 | 当前状态 |
| --- | --- | --- | --- |
| BLOCKER-001 | 未发现 | 无 | 无 |

### 5.2 高风险问题

| 编号 | 问题 | 影响 | 复现步骤 | 预期/实际 | 修复建议 |
| --- | --- | --- | --- | --- | --- |
| HIGH-001 | 未发现自动化失败 | 无 | 不适用 | 不适用 | 不适用 |

### 5.3 中低风险与覆盖缺口

| 编号 | 问题/缺口 | 影响 | 复现步骤 | 预期/实际 | 修复建议 |
| --- | --- | --- | --- | --- | --- |
| GAP-001 | 缺少卡牌战斗状态迁移专项 | 抽牌、出牌、弃牌、洗牌链路若回归，现有门禁不一定精准定位 | 构造最小战斗并执行一回合 | 预期应断言 hand/drawPile/discardPile；实际暂无专项 | 新增 `tests/sanity_card_state_transition_checks.cjs` |
| GAP-002 | 缺少本地存档刷新恢复专项 | 本地存档损坏或字段迁移失败可能延迟发现 | 保存游戏后刷新页面并重建 game | 预期关键字段一致；实际暂无专项 | 新增浏览器或 VM 存档恢复脚本 |
| GAP-003 | 缺少真实多浏览器矩阵 | Chromium 通过不等于 Firefox/WebKit 均稳定 | 使用 Playwright 多 browserName 执行主流程 | 预期三内核通过；实际未执行全矩阵 | 在 CI 增加 Chromium/Firefox/WebKit 矩阵 |
| GAP-004 | 缺少长时间内存与动画性能采样 | 粒子、动画、频繁切屏可能存在长时累积风险 | 连续切屏/战斗 30-60 分钟并采集内存 | 预期内存趋稳；实际未采集 | 增加长稳脚本与性能预算 |
| GAP-005 | 后端仅做 10 并发轻量验证 | 不能代表高峰流量稳定性 | 执行 10 并发 API 流 | 预期轻量稳定；实际通过，但未覆盖高并发 | 增加 100/500 并发阶梯压测与 p95/p99 统计 |
| GAP-006 | 后端异常与并发检查尚未固化 | 后续回归可能漏跑本轮临时验证项 | 执行本轮临时 Node 命令 | 预期进入固定测试脚本；实际仅本轮手动执行 | 新增 `tests/api_negative_and_perf_checks.cjs` 或扩展 `server/test-api.js` |

## 6. 回归测试结论

- 当前未进行代码修复，因此回归验证以现有工作区为基线。
- 已执行并通过：
  - 构建回归：`npm run build`
  - Node 全量规则回归：`npm run test:node`
  - 浏览器发布回归：`npm run test:browser:release -- http://127.0.0.1:4176 output/qa-full-release-2026-05-15`
  - 后端 E2E 回归：`node tests/test_e2e_backend.cjs`
  - 后端 API 冒烟回归：`node server/test-api.js`
  - 后端并发/异常回归：临时自定义 10 并发 API 流

## 7. 建议优先级

1. 新增卡牌状态迁移专项测试，覆盖抽牌、出牌、弃牌、洗牌、持续效果与诅咒牌。
2. 新增本地存档刷新恢复专项，覆盖保存、刷新、加载、迁移、云端失败回退。
3. 增加 Playwright 多浏览器矩阵，至少覆盖 Chromium、Firefox、WebKit。
4. 增加后端阶梯压测脚本，记录 QPS、平均延迟、p95、p99、错误率。
5. 增加长稳与内存采样，重点覆盖粒子动画、战斗 HUD、频繁切屏、PVP 结算页。

## 8. 修复跟进

- `GAP-006` 已补充固定脚本：新增 `tests/backend_security_checks.cjs`，并接入 `tests/run_node_checks.sh`。
- 新增固定覆盖：
  - HMAC 可选模式与强制模式的接口层行为。
  - 未授权、错误登录、签名缺失、签名格式错误、签名不匹配等 401/400/403 语义。
  - 10 并发存档写入的轻量稳定性验证。
- 仍建议后续继续补齐：
  - 100/500 并发阶梯压测与 p95/p99 指标。
  - 卡牌状态迁移、本地存档刷新恢复、多浏览器矩阵和长稳内存采样。
