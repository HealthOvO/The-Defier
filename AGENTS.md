# AGENTS

## Scope

本文件约束 The Defier 仓库内的默认协作方式。
后续在这个仓库继续开发时，默认允许并鼓励在合适的时候主动使用 subagent 提效；除非用户明确要求不要使用，或当前任务明显不适合并行。

## Default Collaboration Rule

- 对于非微小任务，不要等用户再次提醒才使用 subagent。
- 只要任务里存在至少一条不阻塞主线的并行支线，就应主动派出 1-3 个 subagent。
- 默认所有 subagent 一律使用 `gpt-5.5`。
- 若无特殊理由，优先保持 `gpt-5.5 + xhigh reasoning`；不要为了省成本切到 mini 或旧模型。
- 只有用户明确要求，或任务有非常特殊的工具/性能约束时，才偏离 `gpt-5.5`，并在汇报里注明原因。
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

## Production Deployment Rule

- 本项目正式线上环境是用户自己的服务器，不是 GitHub Pages；线上访问地址固定为 `https://080305.xyz/`。
- 服务器 SSH Host 为 `cloud119`，当前解析目标为 `119.91.252.137`，默认使用本机 `~/.ssh/config` 中的配置连接。
- 前端静态站点部署目录为远端 `/www/wwwroot`；后端 Node 服务目录为远端 `/www/server/the-defier-backend`。
- GitHub Pages 的 `CNAME` 和 `.site` 构建可以保留作为构建产物/备用发布配置，但不能把“已推 GitHub Pages”当作正式线上部署完成。
- 前端生产构建流程：
  - 先执行 `npm run build:pages` 生成 `.site`。
  - 再用 `rsync -az .site/ cloud119:/www/wwwroot/` 同步到服务器。
  - 不要随意对 `/www/wwwroot` 使用 `--delete`，除非已经确认远端历史目录可以删除并做好备份。
- 后端部署流程：
  - 用 `rsync -az --delete --exclude='node_modules/' --exclude='db/*.sqlite' --exclude='backend.log' server/ cloud119:/www/server/the-defier-backend/` 同步代码。
  - 不要覆盖或删除远端 `db/*.sqlite`、`backend.log`、`node_modules/`，避免丢线上数据或破坏 Linux 原生依赖。
  - 后端通过 systemd 服务 `the-defier-backend` 运行，端口为 `9000`。
  - 同步后使用 `ssh cloud119 'systemctl restart the-defier-backend'` 重启，并确认 `systemctl is-active the-defier-backend` 返回 `active`。
- Nginx 线上约束：
  - `080305.xyz` / `www.080305.xyz` 的静态 root 指向 `/www/wwwroot`。
  - `/api/` 必须反代到 `http://127.0.0.1:9000`，不要再加旧的 `/api` rewrite；后端真实路由就是 `/api/*`。
  - 修改 Nginx 后必须执行 `nginx -t`，通过后再 `systemctl reload nginx`。
- HTTPS 证书约束：
  - 当前使用 Let’s Encrypt，证书路径为 `/etc/letsencrypt/live/080305.xyz/fullchain.pem` 和 `/etc/letsencrypt/live/080305.xyz/privkey.pem`。
  - 续期后通过 `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` 自动 reload Nginx。
  - 若证书异常，优先检查 `certbot`、DNS 是否仍指向 `119.91.252.137`、以及 80/443 端口是否可访问。
- 生产 API 配置：
  - `js/config/bmob.config.js` 只在 `080305.xyz` / `www.080305.xyz` 下自动启用同源 API。
  - 本地开发默认仍可保持离线，不要把生产密钥或服务器私密配置写入前端 bundle。
  - 服务器侧 `JWT_SECRET`、`DEFIER_HMAC_SECRET` 应只存在于 systemd 环境或服务器私密配置中，不得提交到仓库。
- 每次声明“线上已部署”前必须验证：
  - `npm run build:pages`
  - `npm run test:node`
  - `curl -I https://080305.xyz/` 返回 `200 OK`
  - `curl -sS https://080305.xyz/api/health` 返回 `{ "status": "ok" ... }`
  - 真实 API smoke 至少覆盖注册、登录、存档、残影上传/拉取。
  - `ssh cloud119 'systemctl is-active the-defier-backend; nginx -t'` 均通过。
- 部署前默认先备份远端：
  - 静态站点备份到 `/www/backup/the-defier/wwwroot_*.tar.gz`。
  - 后端备份到 `/www/backup/the-defier/backend_*.tar.gz`，排除 `node_modules`、SQLite 数据库和日志。

## Final Rule

- 在 The Defier 仓库里，subagent 不是“用户额外提醒后才可用的特殊操作”，而是默认协作工具。
- 只要并行能减少主线程阻塞、且不会引入写冲突，就应主动使用。
