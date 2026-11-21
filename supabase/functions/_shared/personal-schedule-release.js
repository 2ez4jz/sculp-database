// Frontend and additive database verified on 2026-11-21; real-device acceptance remains pending.
export const personalScheduleFeature='Miranda｜个人行程：仅正式有效 sculp_jz（operations）与 sculp_miranda（owner）账户可共同查看和编辑。打开即显示今天的清单，航班、酒店、工作、个人安排及待办在同一列表。日期按钮展开月历，选中日期后收起。分配给 Miranda 且当天到期的工作待办按多伦多截止日期加入清单，点「处理」打开原任务，核对后确认修改。个人安排可新增、编辑、删除及勾选完成，支持当地时间/起止时区、跨日住宿、地点、航班号、预订编号及备注。保存到同一云端表，空闲可见页面每30秒及重新聚焦时刷新；未保存草稿不被刷新覆盖，旧版本修改被拒绝。需要在此页面填写标题、类型、日期，非全天安排需填写当地时间，点击保存；删除需再次确认。不读取邮箱或自动抓取航班酒店，不创建客户订单，不自动推送；聊天没有读取或写入个人行程的工具。';
export const personalSchedulePageAction={task:'维护 Miranda 每日个人行程与待办',where:'Miranda｜个人行程→今日清单；顶部日期按钮切换日期；新增或编辑个人安排，工作待办点「处理」',needs:['正式有效 sculp_jz（operations）或 sculp_miranda（owner）账户','标题、类型、明确日期；非全天安排须有当地时间和起止时区','用户核对后点击保存；删除需再次确认'],completion:'服务器返回保存结果并读取共享行程；冲突保留草稿并要求重新打开最新安排；聊天不能声称已读取或记录行程，两个真实账号及设备验收须单独进行'};
export const personalScheduleReleaseFacts={
 knowledgeRevision:'2026-11-21-personal-schedule',
 notReleased:[{name:'Miranda 每日清单首屏',status:'pending',scope:'日期按钮展开月历，以及同一天的个人安排和分配给 Miranda 的工作待办。待验证发布。'}],
 latestReleasedUpdate:{date:'2026-11-21',name:'Miranda 每日个人行程与待办',revision:'personal-20261121',status:'deployed',evidence:'docs/MIRANDA_PERSONAL_SCHEDULE.md',scope:'正式有效JZ/Miranda专用页面与云端数据；真实双账号和实体设备体验待验收',changes:['独立月历选择日期，查看航班、酒店、工作、待办和个人安排','新增编辑删除、完成勾选、起止当地时间及时区、跨日住宿、预订信息与备注','两个现有账户共享并保留草稿和版本冲突保护；不自动抓取邮件/航班，不新增聊天读写工具']},
 latestBusinessRelease:{version:'SCULP OS 3.2 · Miranda个人行程',date:'2026-11-21',status:'deployed',acceptance:'pending_user_acceptance',evidence:'docs/MIRANDA_PERSONAL_SCHEDULE.md',scope:'新增个人行程页面与受限云端数据；既有3.2业务流程保留。新模块隔离检查和生产资源验证完成，完整浏览器回归仍受既有邮件页面测试阻挡',changes:['Miranda个人月历、每日安排和待办','航班/酒店/工作/个人安排手动维护，云端共享和旧版本覆盖保护']},
 includedBackendUpdate:{date:'2026-11-21',name:'个人行程功能说明',scope:'仅维护可信产品能力和页面入口说明，保留现网工具、长期记忆与诊断；聊天不能读取或修改个人行程',changes:['说明现有JZ/Miranda账户的个人行程页面、必填信息、保存依据与权限边界']},
};
