# The Defier Production Deployment

本文档记录当前正式线上环境。GitHub Pages、`CNAME` 和 `.site` 构建产物可以保留作为构建产物或备用配置，但不能把“已推 GitHub Pages”当作正式线上部署完成。

## 线上环境

- 正式地址：`https://080305.xyz/`
- SSH Host：`cloud119`
- 当前解析目标：`119.91.252.137`
- 前端静态目录：`/www/wwwroot`
- 后端服务目录：`/www/server/the-defier-backend`
- 后端 systemd 服务：`the-defier-backend`
- 后端监听端口：`9000`

Nginx 约束：

- `080305.xyz` / `www.080305.xyz` 的静态 root 指向 `/www/wwwroot`。
- `/api/` 反代到 `http://127.0.0.1:9000`。
- 不要再加旧的 `/api` rewrite；后端真实路由就是 `/api/*`。
- 修改 Nginx 后必须先执行 `nginx -t`，通过后再 `systemctl reload nginx`。

HTTPS 证书：

- 当前使用 Let's Encrypt。
- 证书路径：`/etc/letsencrypt/live/080305.xyz/fullchain.pem`
- 私钥路径：`/etc/letsencrypt/live/080305.xyz/privkey.pem`
- 续期后通过 `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` 自动 reload Nginx。

## 部署前备份

下面的备份用于保护本次要同步的静态站点和后端代码，不是完整数据级灾备。后端备份会排除 `node_modules`、`db/*.sqlite`、`db/*.sqlite-*` 和 `backend.log`；这些线上文件也不会被部署 rsync 覆盖或删除。若上线前需要可恢复的线上存档数据快照，必须另走数据库专用备份流程，不能把下面的后端代码包当作 SQLite 回滚包。

前端备份：

```bash
ssh cloud119 'mkdir -p /www/backup/the-defier && tar -C /www -czf /www/backup/the-defier/wwwroot_$(date +%Y%m%d_%H%M%S).tar.gz wwwroot'
```

后端备份：

```bash
ssh cloud119 'mkdir -p /www/backup/the-defier && tar --exclude="node_modules" --exclude="db/*.sqlite" --exclude="db/*.sqlite-*" --exclude="backend.log" -C /www/server -czf /www/backup/the-defier/backend_$(date +%Y%m%d_%H%M%S).tar.gz the-defier-backend'
```

## 前端部署

```bash
npm run build:pages
rsync -az .site/ cloud119:/www/wwwroot/
```

不要随意对 `/www/wwwroot` 使用 `--delete`，除非已经确认远端历史目录可以删除并做好备份。

## 后端部署

```bash
rsync -az --delete \
  --exclude='node_modules/' \
  --exclude='db/*.sqlite' \
  --exclude='db/*.sqlite-*' \
  --exclude='backend.log' \
  server/ cloud119:/www/server/the-defier-backend/

ssh cloud119 'systemctl restart the-defier-backend && systemctl is-active the-defier-backend'
```

不要覆盖或删除远端 `db/*.sqlite`、`db/*.sqlite-*`、`backend.log`、`node_modules/`，避免丢线上数据或破坏 Linux 原生依赖。

服务器侧 `JWT_SECRET`、`DEFIER_HMAC_SECRET` 只能存在于 systemd 环境或服务器私密配置中，不得提交到仓库。
正式线上必须设置 `NODE_ENV=production`、`JWT_SECRET` 至少 32 字符、`DEFIER_HMAC_SECRET` 至少 32 字符、`DEFIER_INTEGRITY_REQUIRED=1`。`npm run test:prod:env` 会通过远端运行中进程的环境变量做只读检查，只输出是否满足条件，不回显密钥值。
生产 smoke 会验证未签名的存档、全局数据和残影写入均返回拒绝，避免在完整性校验未强制开启时误判上线通过。

## 上线验证

声明“线上已部署”前必须全部通过：

```bash
npm run build:pages
npm run test:node
curl -I https://080305.xyz/
curl -sS https://080305.xyz/api/health
npm run test:prod:read -- cloud119 https://080305.xyz
npm run test:prod:env -- cloud119
CONFIRM_PROD=1 npm run test:prod:api -- https://080305.xyz
BASE_URL=https://080305.xyz npm run test:browser:release -- https://080305.xyz output/release-browser-audits-prod
ssh cloud119 'set -e; systemctl is-active the-defier-backend; nginx -t'
```

期望：

- `curl -I https://080305.xyz/` 返回 `200 OK`。
- `curl -sS https://080305.xyz/api/health` 返回 `{"status":"ok", ...}`。
- `npm run test:prod:read -- cloud119 https://080305.xyz` 只做只读巡检：公网首页/API health、后端服务 active、`nginx -t`、远端静态/后端文件时间戳，以及是否包含当前后端迁移/完整性校验关键字。该命令不读取密钥、不创建 smoke 用户、不写生产数据。
- `npm run test:prod:env -- cloud119` 返回 `NODE_ENV=production`、`JWT_SECRET length >= 32`、`DEFIER_HMAC_SECRET length >= 32`、`DEFIER_INTEGRITY_REQUIRED enabled`，且不打印密钥值。
- `CONFIRM_PROD=1 npm run test:prod:api -- https://080305.xyz` 覆盖注册、登录、坏 JWT 必须 401、存档、全局数据、残影上传和残影拉取；同时验证未签名写入会被拒绝、非法/未来时间戳不会锁死记录，旧时间/同时间写入不会覆盖新记录。该命令会创建 `smoke_*` 测试用户，并写入测试存档、全局数据和残影。
- `BASE_URL=https://080305.xyz npm run test:browser:release -- https://080305.xyz output/release-browser-audits-prod` 在正式域名下跑浏览器 release 审计并把截图/报告写到本地 `output/release-browser-audits-prod/`；其中 `backend-client`、`auth-ui-cloud` 和 `pvp-live-real` 类 smoke 会使用脚本启动的本地临时 API，不写生产后端，生产写入只由上面的 `CONFIRM_PROD=1` API smoke 覆盖。
- `systemctl is-active the-defier-backend` 返回 `active`。
- `nginx -t` 返回配置通过。

只读生产巡检可以随时运行：

```bash
npm run test:prod:read -- cloud119 https://080305.xyz
```

它只能证明当前线上可访问、服务活着、配置语法有效，并提示远端文件是否像当前版本；它不能替代生产环境变量检查，也不能替代会写入生产测试数据的 API smoke。

本地预发布门禁可以运行：

```bash
npm run test:release:local
```

该命令只验证本地构建、本地 Node 门禁和本地浏览器 release 审计，不代表正式线上已部署。

## 一键部署脚本

也可以使用带确认阀的部署脚本：

```bash
CONFIRM_PROD_DEPLOY=1 CONFIRM_PROD=1 npm run deploy:prod
```

该脚本会按顺序执行：

1. `npm run test:release:local`
2. 远端前端和后端备份
3. `rsync -az .site/ cloud119:/www/wwwroot/`
4. `rsync -az --delete --exclude='node_modules/' --exclude='db/*.sqlite' --exclude='db/*.sqlite-*' --exclude='backend.log' server/ cloud119:/www/server/the-defier-backend/`
5. `systemctl restart the-defier-backend`
6. `npm run test:prod:read -- cloud119 https://080305.xyz`
7. `npm run test:prod:env -- cloud119`
8. `CONFIRM_PROD=1 npm run test:prod:api -- https://080305.xyz`
9. `BASE_URL=https://080305.xyz npm run test:browser:release -- https://080305.xyz output/release-browser-audits-prod`

不设置 `CONFIRM_PROD_DEPLOY=1` 时脚本会拒绝部署；不设置 `CONFIRM_PROD=1` 时脚本会拒绝运行会写生产数据的 API smoke。
