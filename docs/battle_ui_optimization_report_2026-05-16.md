# 战斗界面全面检查与优化报告

日期：2026-05-16

说明：本文记录 2026-05-16 当日战斗 UI 专项快照；当前 release gate 布局审计规模以后续 `output/release-browser-audits-*/report.json` 为准。

## 结论

- 本轮已完成战斗界面角色显示、存档返回结果、战斗助手折叠/展开、桌面与移动端适配的专项优化。
- 本地构建、Node 全量检查、核心浏览器审计、功能审计、全页面布局审计、移动端专项审计均通过。
- 优化后未发现新增 console error，战斗交互、结束回合、战斗助手折叠/展开、保存写入与读取完整性均可验证。

## 优化前后对比

| 项目 | 优化前 | 优化后 | 结果 |
| --- | --- | --- | --- |
| 玩家角色模型 | `.player-avatar` 为 80x80，位于 `x=171.22`，靠近左侧指令面板 | 放大到 96x96，移动到 `x=354.25`，避开指令面板 | 角色模型更清晰，战斗主体更容易识别 |
| 玩家模型图片态 | 背景图可显示，但缺少明确图片态语义 | `#player-face-display` 增加 `.is-image`、`role="img"`、`aria-label="林风战斗模型"` | 显示状态更稳定，可访问性更好 |
| 敌人模型 | `.enemy-avatar` 可见，100x100 | `.enemy-avatar` 仍可见，100x100，无布局回退 | 敌人显示保持正常 |
| 战斗助手位置 | 展开态 `y=830.56`，在 768 高视口外，实际不可见 | 展开态 `y=195.56`，位于指令面板可见区域 | 助手展开后立即可读 |
| 战斗助手折叠 | 有按钮逻辑，但缺少完整 ARIA 状态 | 折叠后 `aria-expanded=false`、`aria-hidden=true`、高度约 40；展开后 `aria-expanded=true`、`aria-hidden=false`、高度 215 | 交互状态明确且可测 |
| 存档功能 | `saveGame()` 无明确返回值，UI/测试难以判断是否成功 | 返回 `{ success, local, cloud, slot, timestamp }`，本地写入成功后可直接验证 | 保存结果可观测，云端同步不阻塞本地保存 |
| console error | 0 | 0 | 未引入前端运行错误 |

截图产物：

- 优化前：`output/battle-ui-before/desktop.png`
- 优化后：`output/battle-ui-after/desktop.png`
- 优化前指标：`output/battle-ui-before/metrics.json`
- 优化后指标：`output/battle-ui-after/metrics.json`

## 修复问题清单

- 修复战斗助手展开内容位于指令面板滚动底部、首屏不可见的问题。
- 修复战斗助手按钮缺少 `aria-controls`、`aria-expanded` 状态同步不足的问题。
- 修复战斗助手容器缺少 `aria-hidden` 状态的问题。
- 优化玩家角色模型展示尺寸与位置，避免被左侧战斗指令面板压迫。
- 为玩家图片模型增加 `.is-image` 状态、图片角色语义和可访问性标签。
- 优化玩家角色区域视觉层级，增加玻璃拟态角色卡、底部投影和姓名标签。
- 修复存档入口不可观测的问题，`Game.saveGame()` 现在透传 `SaveManager.saveGame()` 的结构化结果。
- 增强云端保存失败容错，云同步失败时保留本地保存成功结果并返回错误信息。

## 性能与适配指标

| 指标 | 数据 |
| --- | --- |
| Vite production build | 通过，最终复跑耗时 232ms |
| 构建产物 CSS | `index-BZQ5mAT8.css`，691.86 kB，gzip 122.05 kB |
| 构建产物 JS | `index-Vj85gJkt.js`，3,765.41 kB，gzip 803.37 kB |
| 战斗助手动画 | `max-height 220ms ease`，折叠高度约 40，展开高度 215 |
| 桌面视口采样 | 1365x768，战斗界面关键元素均可见 |
| 移动端专项 | 390x844，战斗 HUD、助手展开、手牌、结束回合、敌人 lane 均通过 |
| 布局审计规模 | `browser_frontend_layout_audit` 当日覆盖桌面/移动共 117 项，失败 0；当前 final5 基线为 132 项 |
| console error | 浏览器审计与专项采样均为 0 |

## 验证结果

- `npm run build:pages`：通过，最终复跑通过。
- `npm run test:node`：通过，包含战斗 HUD 模块、头像资源、保存迁移等检查。
- `node tests/browser_feature_audit.mjs http://127.0.0.1:4176 output/battle-ui-feature`：通过。
- `node tests/browser_audit.mjs http://127.0.0.1:4176 output/battle-ui-core`：通过。
- `node tests/browser_audit.mjs http://127.0.0.1:4176 output/battle-ui-core-rerun`：模板级 ARIA 兜底补丁后复跑通过。
- `node tests/browser_frontend_layout_audit.mjs http://127.0.0.1:4176 output/battle-ui-layout`：通过，117 项失败 0（2026-05-16 当日基线）。
- `node tests/browser_mobile_layout_audit.mjs http://127.0.0.1:4176 output/battle-ui-mobile`：通过。
- 专项保存 probe：通过，`localStorage.theDefierSave` 写入成功，包含 `player`、`map`、`combatMeta.ruleVersion= combat-v2`，返回时间戳与存档时间戳一致。

## 残留风险

- 当前敌人模型包含图片和 emoji 两类呈现，本轮确认可见性与布局正常；若后续新增敌人图片资源，仍建议继续跑 `verify_assets` 和浏览器截图审计。
- 战斗助手折叠状态目前仍是运行时偏好，未持久化到独立 UI 偏好键；这是体验增强项，不影响本轮功能正确性。
