// Source candidate; deployment facts are updated only after production verification.
export const personalScheduleFeature='Miranda｜个人行程：仅正式有效 sculp_jz（operations）与 sculp_miranda（owner）账户可共同查看和编辑。月历选择日期，下方显示当天航班、酒店、工作、待办和个人安排；可新增、编辑、删除及勾选完成，支持当地时间/起止时区、跨日住宿、地点、航班号、预订编号及备注。保存到同一云端表，空闲可见页面每30秒及重新聚焦时刷新；未保存草稿不被刷新覆盖，旧版本修改被拒绝。需要在此页面填写标题、类型、日期，非全天安排需填写当地时间，点击保存；删除需再次确认。不读取邮箱或自动抓取航班酒店，不创建客户订单，不自动推送；聊天没有读取或写入个人行程的工具。';
export const personalSchedulePageAction={task:'维护 Miranda 每日个人行程与待办',where:'Miranda｜个人行程→选择日期→新增行程 / 待办或编辑',needs:['正式有效 sculp_jz（operations）或 sculp_miranda（owner）账户','标题、类型、明确日期；非全天安排须有当地时间和起止时区','用户核对后点击保存；删除需再次确认'],completion:'服务器返回保存结果并读取共享行程；冲突保留草稿并要求重新打开最新安排；聊天不能声称已读取或记录行程，两个真实账号及设备验收须单独进行'};
export const personalScheduleReleaseFacts={
 knowledgeRevision:'2026-11-21-personal-schedule',
 notReleased:[{name:'Miranda 个人行程',status:'database_deployed_frontend_pending',scope:'代码与隔离测试已完成；生产数据库已安装并只读验证；前端与聊天说明部署待验证'}],
};
