# The Defier 文档索引

`docs/` 根目录只保留当前仍应直接参考的文档。

## 当前方案入口

- `designer_major_upgrade_overall_plan_v1.md`: V10.0 真 PVP 大版本整体方案，包含玩法目标、真人 PVP 公平规则、匹配公平、先手与开局信息、状态映射、开局前结果、断线/托管计数、计时 SLA、对局手感、双方体验公平、娱乐性与再来一局、反脚本化资源节奏、流派探索、低干扰社交、赛季积分、模式奖励矩阵、drillScenario、反刷场奖励、首战引导、赛季变更沟通、回合结构、复合终局优先级、长局判定、行动意图与拒绝码、事件日志与回放受众、回放留存、反作弊与争议工单、可玩性循环、打磨迭代闭环、非文件级开发合同、可验收用户故事、Ready/Done 验收层、首版实施切片、验收证据模板、跨文档真值索引、支撑文档优先级、当前未冻结范围、实施计划生成门禁、上线灰度和生产验证合同；本阶段只冻结整体方案，不锁定具体修改文件。

## 支撑资料

以下文档保留为方案支撑和后续冻结依据，不代表当前已经锁定具体修改文件。进入开发前需要按最新仓库状态重新生成实施计划。

- `designer_major_upgrade_planning_v8.md`: V10.0 真 PVP 大版本总策划。
- `designer_major_upgrade_requirements_v7.md`: V10.0 真 PVP 可开发需求拆解，已同步首战引导、等待同步、低干扰社交、赛季沟通、状态映射、统一 intent envelope、终局 settling 时间线、开局前无效分支、匹配快照版本组、匹配质量报告、先手与信息揭示、模式奖励矩阵、drillScenario、回放受众、公开复盘推导、首战进度持久化、赛季循环 schema、娱乐性 / 流派探索审计和支撑文档漂移审计的非文件级合同、审计字段和完成定义。
- `designer_major_upgrade_pvp_content_pack_v1.md`: V10.0 真 PVP 首版合法牌池、基准斗法谱、身份槽、构筑健康、复杂度预算、泛用牌升级矩阵、构筑身份差异、生态克制图、双方体验公平与平衡仿真输入。
- `designer_major_upgrade_pvp_ui_copy_samples_v1.md`: V10.0 真 PVP 首版入口、首战引导、三模式差异、赛季变更沟通、赛季回访、对局手感、等待同步、低干扰社交、好友约战、争议结论、断线、结算与复盘文案样例。
- `designer_major_upgrade_pvp_balance_fixtures_v1.md`: V10.0 真 PVP 平衡仿真 fixture、golden replay、golden 覆盖矩阵、匹配质量报告、资源反脚本化报告、流派身份报告、隐藏信息审计、公开推导审计、体验公平审计与报告格式合同。
- `designer_major_upgrade_implementation_input_v1.md`: V10.0 真 PVP 实施输入包和当前旧 PVP 链路隔离口径；2026-06-17 已进入首个 live PVP 服务端权威切片，后续正式排位仍必须继续隔离残影、客户端胜负上报、本地结算和旧票据语义。

## 运行与安全资料

- `backend_progression_platform_v1.md`: 已实现的全游戏长期进度后端契约，包含跨玩法事件信任边界、周期目标、幂等奖励、荣誉账本、运营总览、迁移与下一阶段服务端权威化路径。
- `production_deploy.md`: 正式线上部署、备份、Nginx 与生产验证流程。
- `backend_migration_guide.md`: 后端迁移、API 与本地/生产切换说明。
- `code_review_hmac_fix_report_2026-05-15.md`: HMAC 安全边界修复记录。

## Archive

- `archive/implemented/`: 已落地功能的历史设计说明，可用于理解现有 `seasonBoard`、会审、债账、谱系等语义，但不作为当前大版本主策划。
- `archive/technical/`: 仍有解释价值的历史技术蓝图。

旧异步 PVP 方案、过期版本策划、失真的客户端 HMAC 路线图、过期 QA/UI 快照、过早锁定具体文件的开发计划已从当前文档集中清理。
