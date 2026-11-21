// Production agenda, reminder worker and time switch verified on 2026-11-21.
export const personalScheduleFeature=[
 'Miranda｜个人行程仅正式有效 sculp_jz（operations）与 sculp_miranda（owner）账户可共同查看和编辑，入口排在导航首位、工作台之前。打开即显示今天的清单，日期左右按钮可单击切换前一天或后一天，点击日期展开月历选日。航班、酒店、工作、个人安排及待办在同一列表。定时事项按当天时刻排列，全天及仅有截止日期的事项居后。航班起飞、抵达及酒店入住、退房当天有醒目标注。入住与退房同日会同时标明，续住日使用普通酒店标签。',
 '每日行程自动读取当前设备时区，无法识别时使用多伦多。今天、定时安排归日及留言时间按本机显示，新安排默认本机时区，可在表单选择实际地点的时区。机票保留机场当地日期和时间，跨时区时附本机换算。仅填日期的酒店住宿按预订地日期显示。JZ 和 Miranda 的工作待办按原多伦多截止日期同列，Marketing 排期按原计划日期加入。两位账户可直接勾选任务完成，结果云端共享，Marketing 与原营销日历使用同一完成状态。未完成任务顺延到下一日并显示原定日期，已完成任务从后续待办移除。点「处理」可打开原工作任务，Marketing 点「查看」打开内容。',
 '仅录入用户明确提供的具体个人安排。待当地安排或待补充的事项无需建占位待办。每日清单下方的留言属于所选日期，两位账户可输入正文并点发送，也可输入或点选对方的 @ 名称。被提及者在行程页可跳转到相应日期并标为已读，发送成功以服务器回执为准。',
 '请在页面填写标题、类型、日期及已知当地时间，再核对保存。个人安排支持新增、编辑、完成、确认删除和版本冲突保护。已知时间的安排默认在起飞前 3 小时、酒店入住和退房前 1 小时、其他安排开始前 30 分钟提醒，可逐项调整。',
 '按行程提醒时区（2026 年 11 月 23 日起为北京时间），早上 9 点前的安排可在前一晚 22:00 收到提醒。11 月 23 日早起行程的前夜提醒是 11 月 22 日北京时间 22:00。本人在设置开启设备推送和「Miranda 行程提醒」后，通知显示行程名称、相关当地时间和地点简称，航班优先显示机场代码及航站楼。点击后按当前登录权限定位到完整详情。聊天仅可说明功能和入口。',
].join('');
export const personalSchedulePageAction={task:'维护 Miranda 每日个人行程与待办',where:'导航第一项「Miranda｜个人行程」打开今日清单，点击日期切换。单项通知在编辑表单的「推送提醒」调整，个人订阅在设置中开启',needs:['正式有效 sculp_jz（operations）或 sculp_miranda（owner）账户','标题、类型、日期及已知当地时间和时区','用户核对后保存，删除需再次确认','推送需要明确时间、活跃设备和本账号的行程提醒偏好'],completion:'以共享行程的服务器保存结果为准。推送服务接收和实体手机展示需分别核验。聊天仅说明功能和入口'};
export const personalScheduleReleaseFacts={
 knowledgeRevision:'2026-11-21-agenda-order',
 notReleased:[],
 latestReleasedUpdate:{date:'2026-11-21',name:'Miranda 行程时间排序',revision:'agenda-order-20261121',status:'deployed',evidence:'docs/MIRANDA_PERSONAL_SCHEDULE.md',scope:'JZ 和 Miranda 的个人行程入口与每日清单。已核验生产页面及桌面和手机宽度预览',changes:['个人行程移到导航首位，工作台位于第二','定时事项按当天时刻排列，航班起飞、抵达和酒店入住当天有醒目标注']},
 latestBusinessRelease:{version:'SCULP OS 3.2 · Miranda个人行程',date:'2026-11-21',status:'deployed',acceptance:'pending_user_acceptance',evidence:'docs/MIRANDA_PERSONAL_SCHEDULE.md',scope:'个人行程页面、受限云端数据与设备推送。真实账号的跨设备操作及手机送达待验收',changes:['从导航首位打开 Miranda 个人行程的当天清单，按时刻查看安排，原工作待办同列显示','个人安排由 JZ 和 Miranda 共同维护，支持版本冲突保护','自 11 月 23 日起用北京时间归日，关键时刻前及早起前夜推送行程名称、当地时间和简短地点']},
 includedBackendUpdate:{date:'2026-11-21',name:'个人行程功能说明',scope:'仅提供可信的产品能力、页面入口及已验证上线范围',changes:['说明导航入口、按时排序与重要事项标注、双账户权限、日期切换与北京时间、设备订阅及简版提醒']},
};
