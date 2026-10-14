# SCULPY Agents SDK pilot (2026-10-14)

这是明确 opt-in 的 **虚构 Demo 经营分析试用**。正式账户继续使用现有认证、角色过滤与人工确认流程。

- 入口：`?demo=1&agent=sdk#sculpy`。默认 Demo 不加该参数就走原路径。
- 后端要求：`mode=demo`、`agentMode=sdk`、全局对话、有隔离 Demo 管理报表、经营分析意图，且 `SCULPY_AGENT_DEMO_ENABLED != false`。flag=false 可关闭试用。
- 普通问答、订单详情讨论、记备注/待办和保存请求仍走原流程，避免只有报表工具的 SDK 接管记录操作。SDK 异常或未读取有效报表时回退原路径。
- 固定 SDK 0.20.0 / Zod 4.6.7；沿用试用模型 gpt-4.1-mini。默认路径沿用 gpt-6-luna。
- 单个 `query_demo_report` 只读精确汇总工具；最多6次调用、7轮、55秒执行超时；输出限制5000 token。不提供 SQL、任意网络/账号权限或自主写入。
- 每轮读取精确服务/收款口径；回复偏好传入；tracing关闭、响应store=false。只返回紧凑来源摘要，避免完整样本在历史中反复增长。
- 正式账户从不接受浏览器虚构汇总代替正式报表。Demo 身份下拉只是模拟视角，不是生产授权。
- `npm test` 检查确定性逻辑；`node scripts/review-live.mjs` 是显式、会调用线上模型的虚构验收，不自动加入CI。
- v20已实测 SDK 双月报表、英文偏好、明确截至日期，以及订单/普通问答路由隔离。详见 [完整review](SCULPY_REVIEW_2026-10-14.md)。不能据此宣称正式SDK全面验收或长期成本已验证。
- Markdown Skill文件仅提供设计规则，不会自动加载为SDK工具；自动长期记忆、获客后台、成本/退款、工时工具仍须单独实现并验收。
