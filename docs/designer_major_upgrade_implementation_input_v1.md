# The Defier《逆命者》V10.0 真 PVP 实施计划输入包 V1

## 0. 文档定位

本文是从整体方案进入实施计划前的非文件级输入包。

本文只冻结体验切片、责任域、风险域、证据门禁、失败路径和回滚口径，不冻结具体源码文件、接口路径、数据库迁移、测试文件名、部署脚本或监控面板。

权威来源：

1. 玩法、公平底线、上线门槛和证据阻断口径以 `docs/designer_major_upgrade_overall_plan_v1.md` 为准。
2. 合法牌池、基准斗法谱、身份槽和仿真输入以内容包和 fixture 合同为素材，但不能突破主方案禁用机制。
3. UI 文案样例只冻结玩家可见口径，不冻结页面、组件或自动化脚本落点。
4. 进入文件级开发计划前，必须重新检查当前 worktree，再把本文映射成实际文件和任务。

## 1. 输入包结论

当前 V10 真 PVP 已从非文件级输入包进入文件级实现切片。2026-06-17 起，源码实现以“服务端权威 live PVP 最小闭环”为第一条开发主线，旧残影 / 快照 / 客户端回报链路只允许作为历史练习能力或迁移参照。

截至 2026-06-19，live PVP 已继续补到准备调息、先后手语义预算、开局护体、后手开局公开护盾、护体后反打缓冲、每回合抽牌、连接宽限、赛后复盘、练习承接、好友约战、Bo3 友谊再战、定向约战收件箱和公平保护可见化。`openingSafeguardReport` 已把首动伤害预算、后手 3 点公开护盾、开局护体保底血量、护体后首回合护盾缓冲、当前行动席位预算和公开状态投影给双方 UI；`server/pvp-live/content/pvp-live-v1-content.js` 已落 8 套 V10-S2 基准谱 / bot policy 单点事实源，`tests/sanity_pvp_live_balance_simulation_checks.cjs` 已接入 10,048 样本 quick gate，并实际执行 10,000 个 opening pressure probe。当前 S2-C 证据显示：quick gate 先手胜率 50.14%，8 类 opening 脚本各 1250 条，后手首行动前死亡、无行动线、不可读爆发和非游戏局为 0。

S2-B artifact foundation 已把 fixture 路径从“未冻结示例”推进到可提交、可读取的冻结合同：`server/pvp-live/fixtures/baseline_loadouts_v1.json`、`baseline_bot_policies_v1.json`、`opening_scripts_v1.jsonl`、`golden_replays_v1.jsonl` 已生成并被 `tests/sanity_pvp_live_balance_artifact_checks.cjs` 校验；`server/pvp-live/balance-artifacts.js` 负责构建 / 写入 artifact bundle，`runBalanceSimulationFullGate()` 固定 8x8x500 = 32,000 局 full 样本。S2-C full gate 已通过：32,000 局先手胜率 49.98%，8 套构筑胜率落在 49.73%-50.32%，pair first-seat 全部在 45%-55%，`archetypeSpread` 无 dominant / false archetype 风险，后手首行动前死亡、无行动线、不可读爆发、非游戏局均为 0。S2-D 已完成第一批 reducer-backed golden replay：9 条公开回放样本直接跑 reducer，校验 event sequence、稳定 replay/final hash、`replay_public` / `audit_safe` 可见性分支、字段路径隐藏扫描、双方 post-match review 不泄露、公开复盘可推导和重复 intent 幂等。S2-E 已继续把重连、首次 timeout 托管、严重 timeout 判负、setup ready timeout invalidated 推进为 store-backed golden replay。S2-F 已把第 14 整轮 runtime 结算接入 reducer：`round14_score` 按公开长局分差判胜负，`round14_draw` 不强造 loser、生成 draw review，并把 `golden-draw-round14-001` 从 simulation-only 升级为 reducer-backed golden replay；settlement 层已把 `round14_draw` 固定为 no-ranked-impact，不写正式积分、奖励、settlement gate 或历史，`round14_score` 已锁定正式 settlement / history / rating 写账门禁。S3A 已把 live ranked 公共队列从 FIFO / `mvp_open_pool` 展示占位推进到入队时评分快照：`pvp_live_queue_tickets` 保存 `rating_score / rating_bucket / rating_season_id / rating_provisional`，`joinQueue()` 会恢复完整候选池、用 `pvp_ranks` 默认 provider 读取分数、优先选择分差最近候选，双方均未定级时才保持 open pool；自动匹配只允许 `near_0_99` 和长等待后的 `fair_100_199`，`200+` 分差当前不自动匹配且不泄露精确 rating；饱和队列回归已覆盖第 34 条近分候选不能因重启恢复上限被漏掉。S4A 已把 active 回合倒计时从 `match.updatedAt` 中拆出为独立 `turnTiming`：合法出牌仍可更新 match 最近变更时间，但不会延长当前行动窗口；只有开战、换手和 timeout 托管换手会刷新下一行动席位的 deadline。S4B 已把前端 HTTP heartbeat 调度从硬编码 `5000ms` 改成消费 `stateView.connectionReport.heartbeatIntervalMs`，interval 变化时重建 timer，保证客户端节奏跟服务端连接 SLA 对齐。S5A 已补上最小赛后 replay API：参与者可在终局后拉取 `replay_self`、`replay_public`、`audit_safe`，active 对局返回 `replay_not_ready`，非参与者 404，公开层只暴露 `matchRef` / `replayHash` / 脱敏 public event timeline / `hiddenScan`，不返回 raw `matchId`、手牌、牌库、实例 id、原始 payload 或 RNG。S5B 已把 replay 真源从单一 `state_json.events` 推进到独立 append-only `pvp_live_match_events`：`saveMatch()` 统一幂等补写事件，回放 API 优先读取事件表并在旧局缺表记录时回退 `state.events`；持久化测试已覆盖清空 `state_json.events` 后仍能从事件表恢复 `battle_started` 和 `match_finished` 公开时间线。S6A 已接入单进程 WebSocket 权威同步最小闭环：`/api/pvp/live/ws` 使用 session token 鉴权，连接后返回 `connected` 与权威 heartbeat interval，`join_match` 返回 seat-scoped `state_sync` 并按 `lastSeenRevision` 补发公开 `events_replay`，`heartbeat` 返回 `presence`，`intent` 返回 `intent_result` 并广播双方最新 StateView；前端 session / scene 已在 heartbeat 生命周期内启动 WS 并保留 HTTP fallback。S7A 已先收正式赛季验证写回权限：`game.js` 只有显式 `formalSeasonVerification=true` 且来源为 live ranked 的服务端权威结果才允许写 `seasonVerificationState`，旧镜像演武、本地回执、降级回执、Bmob 旧在线和旧 `server_authoritative` 均不得污染正式赛季验证；实时论道首屏和 `game-intro.html` 已同步“正式真人入口 / 练习隔离 / 好友约战 / 镜像演武不是真人排位”的玩家可见口径。下一步仍需进入更广义正式赛季入口、多实例共享队列、跨进程 WS/队列共享、生产 smoke 和线上部署，不能把本地仿真、golden replay、评分快照、计时锚点、前端心跳调度、最小 replay API、事件表真源、单进程 WS 与 S7A 写回权限收口误写成线上封板。

S5B 事件源完整性补充：终局 replay 不能由“较长但不完整”的事件流拼出来。当前实现要求事件表或 `state.events` 至少有一个来源具备连续 sequence 覆盖并包含 `match_finished` / `match_invalidated`；两边都不完整时必须返回 `replay_not_ready`，防止 finished 回放缺终局事件。

可以进入下一阶段的原因：

- 真人排位、练习、约战、残影、赛季和奖励的边界已经有唯一口径。
- 服务端权威、intent envelope、终局 settling、结算幂等、隐藏信息和回放安全已有合同。
- 反先手秒杀不只靠生命预算，还补齐了座位分配、先手率审计、开局信息揭示、复合终局和计时 SLA。
- 提高可玩性和娱乐性不只停留在口号，已经落到娱乐性审计、流派探索、复盘下一步、drillScenario、friendlySeries 和反刷奖励矩阵。

当前实现仍不能宣称完成 V10 真 PVP 的原因：

- 当前旧 PVP / 残影 / 本地胜负路径已先收住 `game.js` 赛季验证写回和玩家可见文案口径，但奖励、历史、回放、正式入口与长期目标仍未完成全量隔离。
- 当前 live PVP 已覆盖 HTTP 撮合、入队评分锁定和近分优先候选选择、权威 reducer、seat-scoped StateView、intent 幂等、S2-C full gate、S2-B artifact foundation、S2-D reducer-backed golden replay、S2-E store-backed 重连 / timeout / invalidated golden replay、S2-F runtime round14 结算、S4A active 回合计时独立锚点、S4B 前端权威心跳调度、S5A 最小赛后 replay API、S5B append-only `pvp_live_match_events` 回放真源、S6A 单进程 WebSocket 权威同步与公开事件补发、持久化邀请 / 再战、重连宽限和关键 UI 审计，但不包含正式赛季积分全量入口、多实例共享队列、跨进程 WS/队列共享、生产 smoke 或线上部署。
- 浏览器、仿真、协议、生产 smoke 的最终封板证据仍需按新实现继续补齐。

## 2. 风险域字典

后续所有用户故事和切片都必须至少绑定一个风险域。

| 风险域 | 含义 | 典型阻断 |
| --- | --- | --- |
| `R-rule` | 规则真值、预算、回合、长局、禁用机制 | 多套规则并存、旧规则被复用 |
| `R-seat` | 先手、座位、开局信息揭示 | 刷先手、看构筑 dodge、先手率失衡 |
| `R-authority` | 服务端权威、intent、状态版本、幂等 | 客户端自报胜负、重复行动、状态分叉 |
| `R-hidden` | 隐藏信息、StateView、回放、分享 | 泄露对手手牌、牌库顺序或 RNG |
| `R-match` | 真人匹配、扩圈、低样本保护、连接健康 | 残影顶替真人、碾压匹配、弱网拖局 |
| `R-fairness` | 后手行动、反制窗口、非游戏局、控制锁死 | 先手秒杀、无有效行动线、不可读爆发 |
| `R-feel` | pending、拒绝、同步、计时、弱网、移动端手感 | 操作迟钝、反馈不清、移动端遮挡 |
| `R-reward` | 积分、段位、赛季、奖励、任务、反刷 | 刷失败、刷约战、练习污染正式收益 |
| `R-replay` | 复盘、drillScenario、失败建议、战报留存 | 复盘不可执行、建议引用隐藏答案 |
| `R-social` | 预设表情、静音、举报、拉黑、再战、约战 | 社交骚扰、战报泄露、绕过正式结算 |
| `R-abuse` | 篡改、重放、自动化、刷分、争议工单 | 异常局污染积分、弱信号误伤 |
| `R-release` | 文档漂移、生产 smoke、灰度、回滚 | 旧门禁绿灯误判、上线后无法停排 |

## 3. 实施切片输入矩阵

| 切片 | 体验目标 | 主责任域 | 必备主证据 | 失败回滚 |
| --- | --- | --- | --- | --- |
| V10-S0 合同冻结 | 冻结规则、合法池、状态机、文案、社交、安全、文档优先级 | `R-rule`, `R-hidden`, `R-release` | 规则快照报告、内容映射报告、文档漂移审计、Ready 检查 | 回到主方案和支撑合同，不进入开发 |
| V10-S1 权威战斗内核 | 单场对局由服务端权威推进，不接正式匹配奖励 | `R-authority`, `R-hidden`, `R-rule` | 协议一致性报告、隐藏信息审计、golden replay | 关闭 live ranked 入口，仅保留内部引擎验证 |
| V10-S2 后手公平仿真 | 证明没有先手秒杀、后手空过、不可读爆发和拖局 | `R-seat`, `R-fairness`, `R-rule` | 后手开局压测、全量平衡仿真、双方体验公平审计 | 禁用风险内容或回到 V10-S0 重冻规则 |
| V10-S3 真人匹配与准备 | 真人匹配、准备、调息、快照锁定、等待扩圈可用 | `R-match`, `R-seat`, `R-feel` | 匹配质量报告、首战引导报告、浏览器准备路径 | 关闭真人匹配，只保留练习入口 |
| V10-S4 重连、超时、结算与争议 | 处理弱网、超时、托管、唯一终局、争议证据包 | `R-authority`, `R-abuse`, `R-reward` | 双端弱网公平报告、协议一致性报告、风控争议审计 | 停止正式写分，进入测试赛季或无效局 |
| V10-S5 复盘与学习回路 | 输赢双方看懂关键回合并能进入下一步行动 | `R-replay`, `R-feel`, `R-fairness` | 复盘样本包、娱乐性审计、隐藏信息审计 | 只展示结算，不开放“失败可学习”宣称 |
| V10-S6 练习、约战和低干扰社交 | 练习、约战、再战、表情、举报、战报分享不污染排位 | `R-social`, `R-reward`, `R-hidden` | 模式隔离审计、社交安全审计、约战战报样本 | 关闭社交和约战写入，仅保留只读练习 |
| V10-S7 赛季奖励与长期目标 | 积分、段位、荣誉、回访和非强度奖励成立 | `R-reward`, `R-abuse`, `R-release` | 赛季积分审计、奖励边界审计、赛季循环审计 | 暂停赛季写入，只保留测试赛季 |
| V10-S8 移动端和封板验收 | 完成最终仿真、浏览器、移动端、生产 smoke 和灰度 | `R-release`, `R-feel`, `R-abuse` | 发布候选总报告、生产 smoke、上线灰度监控报告 | 停排、回退规则版本或只保留练习 / 战报 |

## 4. 用户故事覆盖矩阵

| 用户故事 | 切片 | 风险域 | 主证据 | 关键失败路径 | 回滚 / 隔离 |
| --- | --- | --- | --- | --- | --- |
| PVP-US-01 合法构筑入真人匹配 | S0 / S3 | `R-match`, `R-rule` | 构筑快照校验、匹配质量报告 | 非法构筑、快照失败、无真人 | 回到构筑确认或练习入口 |
| PVP-US-02 真人不足不塞残影 | S3 / S6 | `R-match`, `R-release` | 模式隔离审计、浏览器长等待截图 | 120 秒无真人、误入残影 | 继续等待、取消或问道练习 |
| PVP-US-03 入队前知道禁用牌 | S0 | `R-rule`, `R-feel` | 内容映射报告、禁用原因文案 | 0 费、复制、额外回合、硬控 | 阻断入队并解释禁用原因 |
| PVP-US-04 入队构筑锁定 | S0 / S3 | `R-authority`, `R-rule` | 构筑快照校验 | 入队后改谱、换身份、重复提交 | 拒绝变更并要求重新入队 |
| PVP-US-05 准备阶段调息 | S3 | `R-feel`, `R-authority` | 浏览器准备路径、协议一致性报告 | 重复调息、ready timeout、断线 | 无效局或回到匹配 |
| PVP-US-06 行动反馈 | S1 / S4 | `R-authority`, `R-feel` | 协议一致性报告、对局手感审计 | rejected、duplicate、sync_required | 清 pending，拉权威状态 |
| PVP-US-07 后手不死且不空过 | S2 | `R-seat`, `R-fairness` | 后手开局压测、双方体验公平审计 | 后手首行动前死亡、无行动线 | 禁用内容或回到规则冻结 |
| PVP-US-08 压迫不秒杀 | S1 / S2 | `R-rule`, `R-fairness` | 全量平衡仿真、预算事件回放 | 无 setup 爆发、预算绕过 | 写 `budget_clamped` 或禁用风险牌 |
| PVP-US-09 防守方理解爆发 | S5 | `R-replay`, `R-hidden` | 复盘样本包、隐藏信息审计 | 复盘泄密、预算解释缺失 | 降级为公开摘要，不开放分享 |
| PVP-US-10 不泄露隐藏信息 | S1 / S4 / S5 | `R-hidden` | 隐藏信息审计 | 对手手牌、牌库、RNG 泄露 | 停止公开视图，进入 `server_invalidated` |
| PVP-US-11 断线恢复 | S4 | `R-authority`, `R-feel` | 双端弱网公平报告 | pending 覆盖权威、missed events 丢失 | 重连同步或无效局 |
| PVP-US-12 对手断线不拖体验 | S4 | `R-feel`, `R-abuse` | 双端弱网公平报告、风控争议审计 | 多次断线、托管爆发、拖局 | 托管低风险动作或判负 |
| PVP-US-13 投降/超时结算一致 | S4 | `R-authority`, `R-reward` | 协议一致性报告、赛季积分审计 | 双端结果不同、重复终局 | 读取唯一结算，冻结重复写入 |
| PVP-US-14 正式结果只写一次 | S4 / S7 | `R-authority`, `R-reward` | 协议一致性报告、奖励 ledger 审计 | 重复发奖励、漏写历史 | 幂等重放或暂停写账 |
| PVP-US-15 复盘可进入下一步 | S5 | `R-replay`, `R-feel` | 复盘样本包、drillScenario 样本 | 建议无入口、建议引用隐藏答案 | 只给公开摘要，关闭 drill |
| PVP-US-16 练习不污染排位 | S6 | `R-reward`, `R-match` | 模式隔离审计 | 练习胜负写正式积分 | 回滚正式写入，保留练习记录 |
| PVP-US-17 好友约战低压力 | S6 | `R-social`, `R-reward` | 社交安全审计、friendlySeries 样本 | 约战刷正式收益、绕过合法池 | 关闭正式收益，保留脱敏战报 |
| PVP-US-18 赛季表达奖励 | S7 | `R-reward` | 奖励边界审计 | 奖励提供强度、失败刷奖励 | 暂停奖励或转为非强度补偿 |
| PVP-US-19 移动端完整路径 | S8 | `R-feel`, `R-release` | 移动端布局报告 | 遮挡手牌、按钮不可点、toast 覆盖 | 阻断移动端发布 |
| PVP-US-20 匹配跨度合理 | S3 / S8 | `R-match`, `R-seat` | 匹配质量报告 | 宽跨度过高、重复碾压 | 继续等待、取消、练习分流 |
| PVP-US-21 积分变化可读 | S7 | `R-reward`, `R-feel` | 赛季积分审计 | 无效局改分、宽跨度无解释 | 暂停写分，展示结算解释 |
| PVP-US-22 只在验证版本进入排位 | S8 | `R-release` | 发布候选总报告、生产 smoke | 测试赛季污染正式榜 | 关闭正式入口或停排 |
| PVP-US-23 异常局可争议 | S4 | `R-abuse`, `R-hidden` | 风控争议审计 | 证据包缺失、弱信号扣分 | reward hold 或无效局 |
| PVP-US-24 首战短引导 | S0 / S3 | `R-feel`, `R-match` | 首战引导报告 | 首战断线、120 秒无真人、宽跨度 | 回到入口、练习或继续等待 |
| PVP-US-25 赛季变更透明 | S7 | `R-release`, `R-reward` | 赛季变更公告审计 | 入队中途切规则、旧回放失真 | 保留旧快照，公告替换建议 |
| PVP-US-26 实时状态清楚 | S1 / S3 / S4 / S5 | `R-feel`, `R-authority` | 对局手感审计 | pending 卡死、弱网误导、旧状态覆盖 | 拉权威状态或刷新 |
| PVP-US-27 安全表达和战报 | S6 | `R-social`, `R-hidden` | 社交安全审计、隐藏信息审计 | 自由文本骚扰、战报泄密 | 静音、限频、撤销分享 |
| PVP-US-28 文档冲突可裁定 | S0 / S8 | `R-release` | 文档漂移审计 | 旧路径被当冻结实现 | 回到非文件级合同 |
| PVP-US-29 赛季回访不逼掉分 | S7 | `R-reward`, `R-feel` | 赛季循环审计 | 弱构筑强制排位、失败刷任务 | 调整任务或关闭提示 |
| PVP-US-30 双方体验公平 | S2 / S5 | `R-fairness`, `R-replay` | 双方体验公平审计、复盘样本包 | 控制锁死、无解释败因 | 调整内容池或回滚规则 |
| PVP-US-31 再来一局动机 | S5 / S6 | `R-replay`, `R-social` | 娱乐性审计 | 碾压局过多、下一步入口缺失 | 调整复盘入口或匹配节奏 |
| PVP-US-32 构筑探索 | S2 / S5 / S7 | `R-rule`, `R-reward` | 流派探索审计 | 必带牌模板化、熟练度给强度 | 调整内容包或奖励边界 |

## 5. 证据门禁矩阵

| 证据 | 最早需要 | 必须覆盖 | 不能替代它的东西 |
| --- | --- | --- | --- |
| 规则快照报告 | S0 | 生命、卡组、起手、抽牌、灵力、预算、长局、禁用机制 | README、口头说明 |
| 内容映射报告 | S0 | legal / disabled / translated / future_candidate 全量分类 | 单个构筑样例 |
| 文档漂移审计 | S0 | 主方案、需求拆解、内容包、UI 文案、fixture 的冲突裁定 | `rg` 未命中旧词 |
| 协议一致性报告 | S1 | intent 幂等、stateVersion、重连补发、唯一终局 | 单场手动对局 |
| 后手开局压测 | S2 | 全基准对阵、先后手、开局脚本、无有效行动线 | 总胜率 |
| 全量平衡仿真 | S2 | 胜率、时长、14 轮收束、爆发、拖局、流派 spread | 设计者主观判断 |
| 匹配质量报告 | S3 | 真人、扩圈、宽跨度、重复匹配、低样本保护 | 匹到一次真人 |
| 双端弱网公平报告 | S4 | 当前行动方断线、非行动方断线、accepted intent 重放、grace 外重连 | 单端截图 |
| 复盘样本包 | S5 | 败因、关键事件、预算、setup、下一步入口、drillScenario | 战斗日志 raw dump |
| 模式隔离审计 | S6 | 排位、练习、约战、残影、商店、赛季收益隔离 | 文案区分 |
| 赛季积分审计 | S7 | 终局、积分、奖励、无效局、宽跨度、申诉暂挂 | 排行榜变化 |
| 生产 smoke 报告 | S8 | 正式域名、API、登录、存档、测试赛季真人 PVP、正式积分隔离 | 本地 dev server |

## 6. 当前仓库状态摘要要求

文件级实施计划生成前，必须先产出当前仓库状态摘要。摘要不需要在本文锁定具体文件，但必须回答以下旧链路是否仍存在、要替换还是隔离：

| 旧链路 / 风险 | V10 处置口径 | 摘要必须证明 |
| --- | --- | --- |
| 镜像 / 残影 fallback 被当正式排位 | 必须从正式排位链路移除，只能进入问道练习、托管、回放对照或测试 | 没有“无真人自动打残影并写正式积分”的路径 |
| 客户端本地胜负上报 | 不能写正式积分、段位、奖励或正式历史 | 正式结算只来自服务端事件链 |
| 旧 match ticket / 旧练习票据 | 不能被 live ranked 消费 | live ranked 使用独立规则版本、构筑快照和匹配快照 |
| GhostEnemy / practice opponent | 不能作为正式排位主对手 | 只用于练习、托管、回放对照或 engine 单测 |
| 旧排行榜 / 商店 / 经济 | 可保留展示和兑换能力，但不能接受练习胜负写正式收益 | 正式收益来源可追溯到 live settlement |
| 旧 PVP 浏览器审计 | 只能证明旧练习 / ghost 路径可用 | live ranked 必须有独立桌面和移动端审计 |
| 旧文案里的“真实 PVP / 镜像兜底” | 必须标注为历史或改成练习口径 | 玩家不会把残影误认为真人排位 |

### 6.1 2026-06-17 旧 PVP 链路只读巡检结论

当前仓库里的 PVP 可玩能力不能被误认为 V10 真 PVP 半成品。实施时必须按以下边界隔离：

| 当前链路 | 只读结论 | V10 处置 |
| --- | --- | --- |
| `天道榜 -> 论道切磋` 单入口 | 当前入口混合旧榜单、残影匹配和练习兜底，不是 live ranked queue | 新排位入口必须单独标识真人排位，旧入口改为练习 / 历史口径 |
| `/api/pvp/match` | 后端从 `pvp_defense_snapshots` 选对手并返回 `ghost` / `battleData`，前端仍进入 `GhostEnemy` | 只能作为 legacy snapshot duel，不得接正式积分 |
| `/api/pvp/match/result` | 仍接收客户端 `didWin`，只做票据 / 签名校验后写榜 | 不能作为正式结算真源，正式结果只能来自服务端事件链 |
| `PVPService.reportMatchResult()` 本地回执 | `local_practice`、`local_online_fallback`、`bmob_online` 等旧回执仍会走本地 rank / coins / history 逻辑 | 练习、降级、旧在线回执必须禁止写正式段位、奖励和正式历史 |
| `pvp_match_tickets` | 旧 ticket 只绑定快照结算 TTL 和消费态，没有 live room、stateVersion、event sequence、幂等 settlement 语义 | 新 live ranked 使用独立 match id、intent id、stateVersion 和规则版本 |
| `game.js` 赛季验证写回 | S7A 已通过 `shouldRecordPVPSeasonVerification()` 收口，只有显式 live ranked 服务端权威结果可写 season verification | 继续保持练习 / 降级 / 旧回执不得污染赛季验证，并补正式赛季奖励与长期目标合同 |
| `game-intro.html` 和历史 `progress.md` 文案 | S7A 已把玩家可见口径改成实时论道正式入口、镜像演武练习隔离 | 后续新增入口时继续同步说明，不得暗示残影是真人 |
| 旧 PVP 测试 | 现有绿灯主要证明 ghost practice、local fallback、server_authoritative 旧快照链路可用 | live ranked 必须有独立 engine、route、browser、生产 smoke 证据 |

一句话隔离口径：当前仓库里允许保留的旧能力只有练习、残影、防守快照、回放对照、商店展示和历史 UI；凡是正式排位、正式积分、正式赛季记录、正式奖励、正式复盘真源，都不能继续复用 `GhostEnemy`、残影快照、客户端 `didWin`、本地结算、Bmob 旧在线链路或 `pvp_match_tickets` 的旧语义。

## 7. 回滚和隔离口径

| 失败类型 | 默认处置 | 玩家可见口径 |
| --- | --- | --- |
| 规则真值冲突 | 停止进入下一切片，回到 S0 重冻合同 | 规则版本正在确认，暂不开放正式排位 |
| 隐藏信息泄露 | 停止公开视图和分享，相关局进入 `server_invalidated` 或争议复查 | 状态同步异常，本局不影响正式积分 |
| 后手首行动前死亡 | 禁用相关内容或规则回滚 | 当前规则需调整，正式排位暂缓 |
| 重复结算 / 重复奖励 | 冻结写账，按 ledger 审计补正 | 奖励正在复核，不会重复领取 |
| 匹配质量失控 | 收紧扩圈或只提供继续等待 / 练习 | 真人较少，可继续等待或先练习 |
| 练习污染排位 | 回滚正式写入，保留练习记录 | 练习不会影响正式积分 |
| 社交或战报泄露 | 撤销分享、停用相关入口 | 战报分享暂时关闭 |
| 生产 smoke 失败 | 不开放正式入口或停排 | 正式排位维护中，练习和战报保留 |

## 8. 下一阶段输出格式

后续阶段继续按切片输出实施计划，每个切片至少包含：

- 切片目标。
- 责任域。
- 开工前输入。
- 主路径。
- 失败路径。
- 证据门禁。
- 回滚口径。
- 可并行支线。
- 暂不锁定的文件级事项。

已经锁定并完成的切片必须反向同步到本文、`progress.md` 和对应 sanity 测试；未启动切片仍不得提前宣称文件、接口、测试和部署均已完成。
