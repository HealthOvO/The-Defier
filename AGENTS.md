# AGENTS

## Scope

本文件约束 The Defier 仓库内的默认协作方式。
后续在这个仓库继续开发时，默认允许并鼓励在合适的时候主动使用 subagent 提效；除非用户明确要求不要使用，或当前任务明显不适合并行。

## Default Collaboration Rule

- 对于非微小任务，不要等用户再次提醒才使用 subagent。
- 只要任务里存在至少一条不阻塞主线的并行支线，就应主动派出 1-3 个 subagent。
- 默认所有 subagent 一律使用 `gpt-5.4`。
- 若无特殊理由，优先保持 `gpt-5.4 + medium/high reasoning`；不要为了省成本切到 mini 或旧模型。
- 只有用户明确要求，或任务有非常特殊的工具/性能约束时，才偏离 `gpt-5.4`，并在汇报里注明原因。
- 主线程始终负责：
  - 建立最小可执行计划
  - 抓关键路径
  - 集成代码
  - 最终验证与结论

## When To Use Subagents

- 当任务同时涉及 `js/` 运行时、`css/`/UI、`tests/`/浏览器门禁三条线时，默认并行。
- 当需要同时做“代码阅读 / 风险排查 / 测试补强 / 截图验收”时，默认并行。
- 当改动会影响地图、远征、奖励页、PVP、挑战、图鉴这类跨模块页面时，默认并行。
- 当需要阅读大量 `output/` 审计产物、`progress.md` 历史记录、以及最近 git 改动时，默认并行。
- 当主线程已经知道下一步要改什么，但还有 UI 漏项巡检、文案冲突检查、测试缺口扫描等侧翼任务时，必须把这些侧翼任务交给 subagent。
- 当准备封板、push 或声明“已完成”前，至少安排一个 subagent 做反向巡检，专门找残留问题。

## Recommended Split For This Repo

- 优先使用 `explorer` 做只读任务：
  - 扫 `js/game.js`、`js/core/*.js` 的行为链
  - 扫 `tests/` 是否已有覆盖
  - 扫 `output/` 截图与 `report.json`
  - 扫 `progress.md`、`game-intro.html`、版本介绍是否过时
- 仅在写入范围清晰且互不冲突时使用 `worker` 做代码改动：
  - 一个 worker 负责 `tests/` 或浏览器审计脚本
  - 一个 worker 负责 `js/core/` 某个独立模块
  - 一个 worker 负责 `css/` 或独立页面文案/布局
- `js/game.js`、`progress.md`、发布门禁脚本这类高耦合文件，默认由主线程集成；若必须委派，只能分配单一 owner，避免多个 agent 同时写。
- `tests/browser_audit.mjs` 也按单 owner 处理；它是发布门禁 chokepoint，不要让多个 worker 同时改。

## When Not To Use Subagents

- 任务很小，只改一个清晰的单文件点位时，不必开 agent。
- 当前下一步完全被某个结果阻塞，而且主线程马上就要用到这个结果时，优先本地处理，不要为了“形式上并行”反而卡主线。
- 无法清晰切分写入边界时，不要同时派多个 worker 改同一组文件。
- 不要让多个 agent 重复做同一份代码阅读或同一轮测试。

## Required Working Pattern

- 开始 substantial work 后，先决定：
  - 哪一步必须由主线程立刻处理
  - 哪些问题可以并行外包
- 常用并行模板：
  - 一个 agent 查 UI/交互漏项
  - 一个 agent 查测试覆盖和 release 输出
  - 主线程负责真正修复与集成
- 如果是大型回归：
  - 一个 agent 查运行时逻辑链
  - 一个 agent 查浏览器审计 / 截图证据
  - 一个 agent 查文档、版本说明、`progress.md` 残留
- 如果是浏览器门禁失败：
  - 一个 agent 查失败脚本和堆栈
  - 一个 agent 查本轮 `output/` 最新 fresh 目录的截图与 `report.json`
  - 一个 agent 查 `progress.md`、版本介绍、测试文案是否需要同步
- agent 返回后，主线程不要重复从头做一遍，只做：
  - 快速采纳
  - 交叉验证关键结论
  - 集成最终修改

## Verification Rule

- 任何非微小改动完成后，默认至少保留一条 subagent 支线做“挑战者”检查，而不是只做顺向自证。
- subagent 返回的结论默认是线索，不是事实；主线程必须复核关键结论、最新产物目录和最终行为后再集成。
- 宣称“已完成 / 可封板”前，优先让 subagent 检查：
  - 是否还有未实现 UI
  - 是否还有过时文案或版本说明
  - 是否还有缺失截图或未覆盖的关键回归
- 检查 `output/` 时，只认本轮最新 fresh 目录；旧目录只能作为历史参考，不能直接当最终结论。

## Project-Specific Priority

- 这个项目默认优先把 subagent 用在以下高收益位置：
  - 浏览器审计失败排查
  - `output/` 截图与报告人工复核
  - `map / expedition / reward / challenge / pvp` 联动链巡检
  - `progress.md` 与游戏内介绍同步
  - Node 测试补点与 release gate 收口

## Final Rule

- 在 The Defier 仓库里，subagent 不是“用户额外提醒后才可用的特殊操作”，而是默认协作工具。
- 只要并行能减少主线程阻塞、且不会引入写冲突，就应主动使用。
