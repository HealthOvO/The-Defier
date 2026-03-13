# The Defier 架构重构蓝图（2026-03）

## 目标

本轮重构不是重写玩法，而是把当前最影响后续迭代速度和 UI 稳定性的部分拆成**可持续维护的结构**：

1. **战斗 HUD 从业务逻辑中解耦**
2. **战斗层级与尺寸令牌统一**
3. **移动端 / 桌面端 HUD 行为统一**
4. **把重构成果接入自动化审计**

## 当前主要问题

### 1. 单文件过重

- `js/game.js` 约 `13k+` 行
- `js/core/battle.js` 约 `8k+` 行
- `css/style.css` 约 `15k+` 行

问题不是“文件大”本身，而是：

- 战斗状态、DOM 拼装、拖拽交互、样式假设混在一起
- 同一类规则散落在多个位置，后续改动容易漏
- UI 修复需要同时改 JS / CSS 多处，回归成本高

### 2. HUD 规则没有单一事实源

战斗助手、Boss 三幕面板、意图层级、结束回合按钮、手牌区域都依赖隐式样式约定：

- `z-index` 分散定义
- 桌面与移动端规则重复覆盖
- 移动端曾直接把助手 `display:none`，导致“收起/展开”失效

### 3. 可测试性不够强

虽然仓库已经有大量审计脚本，但战斗 HUD 的几个关键约束此前没有独立成“架构门禁”：

- 拖拽定位是否被正确约束
- 助手折叠/展开是否一致
- Boss 面板与敌方意图是否互不遮挡
- 移动端紧凑模式是否仍可展开助手

## 目标结构

本轮落地为一个低风险的 `V1` 架构：

### A. 领域层（保留现有）

- `js/data/*`
- `js/core/player.js`
- `js/core/map.js`
- `js/core/battle.js`

这些文件继续承载规则与玩法。

### B. 表现层（本轮新增）

- `js/ui/battle-hud.js`
- `js/ui/battle-feedback.js`

职责：

- 提供战斗 HUD 的纯函数能力
- 统一处理：
  - HTML escape
  - HUD 紧凑模式判定
  - 浮动面板位置钳制
  - Boss 三幕面板 HTML
  - 战术助手 / 指令面板 HTML
  - 战斗日志历史面板 HTML
  - 战后来源面板 HTML

这样 `battle.js` 不再自己维护大段模板字符串和布局基础规则。

### C. 设计系统层（本轮新增）

- `css/design-system.css`
- `css/battle-hud.css`
- `css/battle-feedback.css`

职责：

- 用 CSS 变量集中管理：
  - 战斗 HUD 间距
  - 面板背景 / 阴影
  - 手牌重叠量
  - 战斗层级 `z-index`
- 让战斗 HUD 的最终布局由专用文件收口，而不是继续在 `style.css` 与 `mobile.css` 中来回叠补丁

### D. 审计层（本轮增强）

- `tests/sanity_battle_hud_module_checks.js`
- `tests/browser_feature_audit.mjs`
- `tests/browser_mobile_layout_audit.mjs`
- `tests/browser_meta_screen_audit.mjs`

职责：

- 校验 HUD 纯函数模块
- 校验桌面端拖拽 / 折叠
- 校验移动端默认紧凑、可显式展开、且不破坏基础布局
- 校验战后来源面板与战斗日志历史面板的渲染稳定性

## 本轮已完成的重构内容

### 1. 抽离 `battle-hud` 表现模块

从 `battle.js` 抽离以下职责到 `js/ui/battle-hud.js`：

- `escapeHtml`
- `shouldUseCompactBattleHud`
- `clampFloatingPanelPosition`
- `buildBossActPanelMarkup`
- `buildBattleCommandPanelMarkup`

### 2. 建立战斗 HUD 设计令牌

新增 `css/design-system.css`，统一定义：

- HUD 尺寸
- 动画时长
- 战斗图层 `z-index`
- 手牌重叠与边距

### 3. 建立战斗 HUD 专属样式入口

新增 `css/battle-hud.css`，统一收口：

- 战术助手桌面浮动布局
- 移动端抽屉式助手
- Boss 三幕面板中心通道
- 敌方意图显示优先级
- 手牌尺寸与重叠一致性

### 4. 把移动端助手改成“可折叠抽屉”

替代旧的 `display:none` 方案：

- 默认保持紧凑
- 点击按钮可展开
- 保留统一的业务状态 `tacticalAdvisorCollapsed`
- 移动端不再出现“点击收起助手无效”的假象

### 5. 把重构接入门禁

新增 / 增强审计：

- HUD helper 纯函数校验
- 桌面拖拽与折叠校验
- 移动端默认紧凑 + 可展开校验

### 6. 延伸到战斗反馈层

继续把“战斗中反馈”从巨型逻辑文件里拆出来：

- `js/ui/battle-feedback.js`
  - 统一生成战斗日志历史面板骨架与条目
  - 统一生成战后来源面板
  - 默认对日志文案 / 来源文案做 HTML escape
- `css/battle-feedback.css`
  - 收口战斗日志浮层、历史面板、奖励来源芯片样式
  - 补足关闭按钮 / 筛选按钮的触控尺寸与 focus-visible

这样 `utils.js` 与 `game.js` 只保留状态流转和事件绑定，不再长期维护战斗反馈面板的模板字符串细节。

## 后续扩展建议

本轮完成的是 **HUD 架构收口**。下一步建议继续按这个方向做“分层，不爆改”：

### Phase 2

- 把 `battle.js` 中更多纯展示函数迁移到 `js/ui/`
- 把战斗日志、奖励页也拆成专用 presenter

### Phase 3

- 为 `game.js` 建立屏幕级 mixin / controller 分层
- 让主菜单、图鉴、奖励、传承各自拥有独立 UI 文件

### Phase 4

- 把超大 CSS 再按场景拆分：
  - `battle-hud.css`
  - `reward-layout.css`
  - `codex-layout.css`
  - `pvp-layout.css`

## 这轮重构的原则

- **先抽可复用、可测试、低耦合的部分**
- **不改玩法规则，只改表现层组织方式**
- **保持现有页面入口和部署方式不变**
- **每次重构都必须附带自动化验证**
