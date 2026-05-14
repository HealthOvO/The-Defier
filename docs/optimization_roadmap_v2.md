# The Defier 工程化优化与防作弊改造路线图 (Phase 1-5)

根据最新的架构审查和性能瓶颈分析，项目在保持了极高游戏性与测试覆盖率的同时，面临着严重的工程化基建滞后问题。为了彻底消除“上帝对象”带来的维护灾难、Vite 打包受限引发的安全风险，以及客户端权威（Client-Authoritative）带来的排行榜作弊漏洞，特制定以下渐进式重构路线图。

本路线图作为 `docs/architecture_refactor_blueprint.md` 的延续，着重于**模块化演进**与**安全防线建设**。

---

## Phase 1: 拥抱现代模块化 (ESM Migration)

**当前痛点**：全盘依赖 `index.html` 的 `<script src="...">` 顺序加载，全局 `window` 作用域污染严重，导致构建时无法开启变量混淆（Mangle）与死代码消除（Tree-shaking），代码极易被反编译。
**目标**：彻底消除全局变量依赖，接入 Vite 的现代构建能力。

### 执行步骤：
1. **构建工具升级**：在 `vite.config.js` 中开启 `build.minify: 'terser'` 和 `terserOptions.mangle: true`。
2. **ESM 改造**：将 `js/core/*.js`、`js/data/*.js` 升级为标准的 ES Modules。
   - 使用 `export const xxx = ...` 暴露接口。
   - 使用 `import { xxx } from './xxx.js'` 替代隐式的全局变量调用。
3. **入口收口**：在 `index.html` 中仅保留一个 `<script type="module" src="js/main.js"></script>`。
4. **Code Splitting (代码分割)**：
   - 配置 Vite 对庞大的模块（如 `collection_hub.js`、`pvp-scene.js`）实施懒加载（Dynamic Import: `import('./js/core/collection_hub.js')`）。
   - 显著降低首屏加载时间。

---

## Phase 2: 拆解 `game.js` 巨石应用

**当前痛点**：`js/game.js` 超过 3 万行，成为名副其实的“上帝对象”，轻微改动极易引发回归 Bug。
**目标**：职责分离，降低心智负担。

### 执行步骤：
1. **数据层剥离 (Managers)**：
   - 提取 `js/managers/SaveManager.js`：专职处理 `localStorage`、数据序列化与版本迁移。
   - 提取 `js/managers/InventoryManager.js`：专职处理法宝、道具的增删改查。
   - 提取 `js/managers/CodexManager.js`：专职处理图鉴解锁逻辑。
2. **视图层剥离 (Presenters/Views)**：
   - 将各个 Screen 的生命周期与 DOM 绑定抽离到独立的 View 类中。
   - 例如：建立 `js/views/ShopView.js`、`js/views/RealmSelectView.js`。
   - `game.js` 降级为单纯的全局事件总线（Event Bus）和场景路由器（Router）。

---

## Phase 3: 引入轻量级数据绑定方案

**当前痛点**：大量复杂的 `innerHTML` 字符串拼接（如生成几十张卡牌的列表）导致频繁销毁与重建 DOM，引发强制重排（Layout Thrashing）与内存泄漏。
**目标**：实现数据驱动的局部更新。

### 执行步骤：
1. **引入轻量级库**：不推荐使用重型的 React/Vue 彻底推翻项目，推荐引入 **lit-html** 或 **Alpine.js**。
2. **渐进式替换**：
   - 优先对变化最频繁的模块（如战斗手牌区、商店商品列表、图鉴展示区）使用模板字面量渲染引擎。
   - 将命令式的 `element.innerHTML = buildString()` 替换为声明式的响应式渲染，利用虚拟 DOM 或细粒度更新实现高性能的差量渲染（Diff Patch）。

---

## Phase 4: CSS 现代化与层级收敛

**当前痛点**：`style.css` 达 2 万行，移动端与 PC 端的媒体查询交织，`z-index` 覆盖混乱。
**目标**：样式组件化，彻底根治层级冲突。

### 执行步骤：
1. **贯彻 Design System**：继续深化 `css/design-system.css` 中的 CSS 变量（Token）设计。
2. **样式拆分**：将 `style.css` 按组件完全拆解为：
   - `css/components/button.css`
   - `css/components/card.css`
   - `css/components/hud.css`
   - `css/components/modal.css`
3. **引入现代规范**：在构建流程中启用 PostCSS 支持最新的 **CSS Nesting (嵌套)** 规范，提升 CSS 的可读性与维护性。

---

## Phase 5: 后端数据校验基线 (反作弊与天梯防卫)

**当前痛点**：当前服务端（Node + SQLite）本质上是一个 BaaS，客户端拥有绝对权威，玩家可轻易篡改本地内存或抓包上传伪造的超模数据，严重威胁 PVP 天道榜的生态。
**目标**：建立“不信任客户端”的服务端校验机制。

### 执行步骤：
1. **防篡改签名机制 (HMAC)**：
   - 客户端在生成存档或幽灵数据时，引入本地代码混淆保护的盐值（Salt），对核心数据生成 HMAC 签名（如 SHA-256）。
   - 服务端在 `/saves` 接口接收数据时，重新计算签名，如果不匹配则拒绝存档。
2. **PVP 幽灵数据合法性校验**：
   - 在服务端实现轻量级的规则引擎校验 `server/validators/ghostValidator.js`。
   - **数值上限检查**：校验玩家上传的属性点（血量、攻击力）是否超过了当前境界/阶层的理论最大值。
   - **装备合法性检查**：校验携带的卡牌、法宝是否存在于游戏配置表中，是否符合解锁规则。
   - 阻断任何携带超模数据、未实装道具的幽灵进入天道榜匹配池。

---

## 总结

当前的首要矛盾是 **工程化基建落后于庞大的业务代码量**。
**行动建议**：建议立刻暂缓新玩法的开发，集中火力攻坚 **Phase 1 (ESM 改造)** 与 **Phase 5 (防作弊校验)**。打通现代打包构建与服务端校验后，游戏的安全性与加载性能将得到质的飞跃，随后再逐步推进 Phase 2 ~ Phase 4 的代码拆解。
