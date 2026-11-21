// Frontend and additive database verified on 2026-11-21; real-device acceptance remains pending.
export const personalScheduleFeature='Miranda｜个人行程：仅正式有效 sculp_jz（operations）与 sculp_miranda（owner）账户可共同查看和编辑。打开即显示今天的清单，航班、酒店、工作、个人安排及待办在同一列表。日期按钮展开月历，选中日期后收起。分配给 Miranda 且当天到期的工作待办按多伦多截止日期加入清单，点「处理」打开原任务，核对后确认修改。个人安排可新增、编辑、删除及勾选完成，支持当地时间/起止时区、跨日住宿、地点、航班号、预订编号及备注。保存到同一云端表，空闲可见页面每30秒及重新聚焦时刷新；未保存草稿不被刷新覆盖，旧版本修改被拒绝。需要在此页面填写标题、类型、日期，非全天安排需填写当地时间，点击保存；删除需再次确认。不读取邮箱或自动抓取航班酒店，不创建客户订单，不自动推送；聊天没有读取或写入个人行程的工具。';
export const personalSchedulePageAction={task:'维护 Miranda 每日个人行程与待办',where:'Miranda｜个人行程→今日清单；顶部日期按钮切换日期；新增或编辑个人安排，工作待办点「处理」',needs:['正式有效 sculp_jz（operations）或 sculp_miranda（owner）账户','标题、类型、明确日期；非全天安排须有当地时间和起止时区','用户核对后点击保存；删除需再次确认'],completion:'服务器返回保存结果并读取共享行程；冲突保留草稿并要求重新打开最新安排；聊天不能声称已读取或记录行程，两个真实账号及设备验收须单独进行'};
export const personalScheduleReleaseFacts={
 knowledgeRevision:'2026-11-21-daily-agenda',
 notReleased:[],
 latestReleasedUpdate:{date:'2026-11-21',name:'Miranda 行程首屏精简',revision:'daily-agenda-20261121',status:'deployed',evidence:'docs/MIRANDA_PERSONAL_SCHEDULE.md',scope:'JZ 和 Miranda 的个人行程页，线上页面与工作待办读取权限已验证。真实账户的浏览器操作待验收',changes:['打开即见今天的单一清单，日期按钮展开月历，选日即收起','当天个人行程与分配给 Miranda 的工作待办同列，点「处理」打开原任务','备注及预订编号可按需展开']},
 latestBusinessRelease:{version:'SCULP OS 3.2 · Miranda个人行程',date:'2026-11-21',status:'deployed',acceptance:'pending_user_acceptance',evidence:'docs/MIRANDA_PERSONAL_SCHEDULE.md',scope:'新增个人行程页面与受限云端数据；既有3.2业务流程保留。新模块隔离检查和生产资源验证完成，完整浏览器回归仍受既有邮件页面测试阻挡',changes:['打开 Miranda 个人行程即见当天清单，点击日期打开月历','同列显示个人行程、个人待办与分配给 Miranda 的当日工作待办，沿用原工作任务确认流程','个人安排可由 JZ 和 Miranda 共同维护，并有版本冲突保护']},
 includedBackendUpdate:{date:'2026-11-21',name:'个人行程功能说明',scope:'仅维护可信产品能力和页面入口说明，保留现网工具、长期记忆与诊断；聊天不能读取或修改个人行程',changes:['说明首屏清单、日期选择器、原工作任务处理入口及双账户权限']},
};
