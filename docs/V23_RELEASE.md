# SCULPY V2.3 发布与验收记录

日期：2026-10-18（America/Toronto）
项目：SCULP Studio / SCULPY Database
PR：https://github.com/2ez4jz/sculp-database/pull/34

## 交付范围

- 真实询盘管理：官网自动保存、手动新增、服务分类、来源、报价、负责人、跟进、流失原因、关联已确认合同。
- 管理员确认签约：不要求定金，支持真实历史日期或明确未知日期。追加服务以合同总额变更记录，不新增签约场次。
- 追加式历史：保留原签约、改价、改期、取消和状态快照，历史同比不能被今天的状态覆盖。
- 同一 payments/invoices 模型内的定金、尾款、独立退款、重复请求保护、累计退款和币种校验。
- 管理看板：签约、未来婚礼、现金、询盘批次转化；明确三种时间口径、数据覆盖和未知金额。
- AI：管理员可调用新的确定性 SQL 工具；金额、均价、转化率、差额和同期比较均由数据库计算。保留现有对话、记忆审批、语音和演示能力。

## 部署记录

前端由本 PR 合并后沿用既有 GitHub Pages 工作流发布，网址：
https://2ez4jz.github.io/sculp-database/

Supabase 项目：lztzzdhqghwubygpzcbq。

| 正式迁移版本 | 内容 |
|---|---|
| 20261018191938 | website_enquiries_baseline |
| 20261018194113 | wedding_v23_01_schema |
| 20261018194119 | wedding_v23_02：历史及支付校验 |
| 20261018194149 | wedding_v23_03：受控经营命令 |
| 20261018194151 | wedding_v23_04：金额及历史进度辅助计算 |
| 20261018194154 | wedding_v23_05：经营分析 RPC |
| 20261018194156 | wedding_v23_06：合同及收款详情 |
| 20261018195509 | wedding_v23_07_website_and_compatibility |
| 20261018200620 | wedding_acceptance_isolation |
| 20261018201932 | wedding_v23_business_enquiry_read_scope |

生产主迁移按语句边界拆分，内容对应仓库合并迁移，不应在此项目再次全量重复运行。没有部署仓库内不相关的 V3 task migration。新建环境则按仓库顺序应用完整迁移。

官网 sculp-enquiry 已部署 v2；聊天 sculpy-chat 已部署 v38（婚礼经营工具）。JWT 设置沿用已有方式，受保护聊天仍在函数内验证 Auth 用户，再通过调用者 token 执行 RPC。

## 已验证

- 本地单元测试：93 项通过（最后的中文显示调整另行运行相同单元检查）。
- V2.3 隔离数据库及工具测试：签约无定金、跨年服务、跨月支付、部分退款、追加服务、取消、服务改期、重复询盘、主合同关联、未知签约日期、历史金额、权限与内部探针隔离。
- PostgreSQL CI：全迁移、真实连接并发编辑/幂等重放/累计退款、备份恢复检查通过；PGlite 本地不会冒充多连接测试。
- 浏览器 CI：使用真实 SQL 生成的虚构 fixture，核对桌面/390px 手机布局、金额、缺失历史提示、失联重试键、手动微信询盘及过期查询结果丢弃。完整套件已在提交 b13b10f 通过；后续候选版继续执行同一套件。
- 正式库 BEGIN/ROLLBACK 实际写入验证：签约2000、追加500、定金600、尾款1900、退款200；当前合同2500、累计净收2300、未收200；9月净收600、10月净收1700。所有合同/客户/支付/事件测试记录完整回滚。
- 真实 HTTP 官网接口返回200，并通过 SQL 确认已写入 website_enquiries、映射为 wedding。测试未调用邮件通知服务。
- 唯一内部 HTTP 验收记录保留技术追溯；专用 business view 和经营 SQL 明确排除其签名。正式业务询盘视图0条，count/open/won/lost/invalid等经营指标全部0。没有把该记录算成客户、订单、成交或收入。
- 正式数据库管理员角色可访问新报表；未知/无效用户被拒绝；匿名无新报表或提交 RPC 直连权限。

测试数据：scripts/fixtures/wedding-v23.json；可重建脚本：scripts/wedding-v23-fixture.mjs。
断言：scripts/wedding-intelligence*.test.mjs；浏览器：scripts/wedding-v23-browser.cjs。
生产回滚事务脚本：scripts/v23-production-smoke.sql（仅适用于此次已核实空业务库的断言基线）。

## 备份、权限与回滚

迁移前商业数据与函数导出 SHA-256：
`df11cb33c442befca6d6a43dfeeead487465fb08e770636c294bdd25163ed904`。

已在独立数据库重放33个旧函数定义、核对8张商业表原本为空，并验证事务回滚。归档保留聊天v36及询盘v1原始源文件；备份不在公开仓库。此为受影响商业数据/函数/策略/约束备份，不等于完整 Auth/Storage 项目备份。

现有10个公开角色/账户/记忆 SECURITY DEFINER 辅助函数告警及未启用泄露密码检测，在升级前已存在。本轮新增公开 RPC 为 SECURITY INVOKER；私有函数每次检查有效管理员。私有内部表启用RLS且无直接策略/授权，默认拒绝访问是设计行为。参考：
https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

回滚先恢复前端及归档的 Edge Function 源文件，保留新增真实业务记录及历史。不要为回滚删除支付或事件表。详情见 V23_ROLLBACK.md，错误处理见 V23_ERRORS_AND_FIXES.md，口径见 V23_DATA_DICTIONARY.md。

## 仍需真实账户人工验收

1. JZ/Miranda 使用自己的真实登录会话，在桌面和手机各看一次管理页；跨设备确认新增、跟进、签约、收款及刷新结果一致。
2. 用真实已获同意的客户询盘完成官网页面→数据库→管理员跟进→正式订单关联。HTTP API 入库已验；本次没有发送通知邮件，邮件投递未作为已验收项目。
3. 在管理员真实会话中向 Sculpy 提问并与看板核对；当前已验证工具权限和计算链，不能把模拟模型测试说成生产模型已逐题通过。
4. 明年预订历史不足时应看到无法准确同比。当前正式业务数据为空，不能据此判断工作室真实业务量。

下一阶段：先录入少量可核实的真实合同、询盘和收退款，再核对实际使用；不新增模块。

最后日期边界修正：管理员当天先确认合同、再补录同日首次询盘时，首次询盘使用本地日期起点，避免将录入操作的较晚时刻误认为联系晚于签约；已有精确首次联系时间保持不变。对应 migration：wedding_same_day_lead_dates，另有独立数据库断言。
