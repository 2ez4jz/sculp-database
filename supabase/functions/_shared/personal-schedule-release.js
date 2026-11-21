// Production agenda, reminder worker and time switch verified on 2026-11-21.
export const personalScheduleFeature=[
 'Miranda｜个人行程仅正式有效 sculp_jz（operations）与 sculp_miranda（owner）账户可共同查看和编辑。打开即显示今天的清单，日期按钮展开月历，选日后收起。航班、酒店、工作、个人安排及待办在同一列表。',
 '2026 年 11 月 23 日北京时间 00:00 起，个人行程按北京时间归日，新安排默认北京时间。航班保留起降各自的当地时间，存在时差时显示折算时间。分配给 Miranda 的原工作待办按多伦多截止日期同列，点「处理」打开原任务核对并确认修改。',
 '请在页面填写标题、类型、日期及已知当地时间，再核对保存。个人安排支持新增、编辑、完成、确认删除和版本冲突保护。已知时间的安排默认在起飞前 3 小时、酒店入住和退房前 1 小时、其他安排开始前 30 分钟提醒，可逐项调整。',
 '按行程页时钟，早上 9 点前的安排可在前一晚 22:00 收到提醒。11 月 23 日早起行程的前夜提醒是 11 月 22 日北京时间 22:00。本人在设置开启设备推送和「Miranda 行程提醒」后，通知显示名称、时间和地点，点击后按当前登录权限定位。聊天仅可说明功能和入口。',
].join('');
export const personalSchedulePageAction={task:'维护 Miranda 每日个人行程与待办',where:'Miranda｜个人行程→今日清单，点击日期切换。单项通知在编辑表单的「推送提醒」调整，个人订阅在设置中开启',needs:['正式有效 sculp_jz（operations）或 sculp_miranda（owner）账户','标题、类型、日期及已知当地时间和时区','用户核对后保存，删除需再次确认','推送需要明确时间、活跃设备和本账号的行程提醒偏好'],completion:'以共享行程的服务器保存结果为准。推送服务接收和实体手机展示需分别核验。聊天仅说明功能和入口'};
export const personalScheduleReleaseFacts={
 knowledgeRevision:'2026-11-21-itinerary-push',
 notReleased:[],
 latestReleasedUpdate:{date:'2026-11-21',name:'Miranda 行程提醒与北京时间',revision:'itinerary-push-20261121',status:'deployed',evidence:'docs/MIRANDA_PERSONAL_SCHEDULE.md',scope:'JZ 和 Miranda 的个人行程页及各自开启提醒的设备。已核验生产页面、排程时区和通知函数，真实设备送达待验收',changes:['11 月 23 日 00:00 起按北京时间查看每天的个人行程，航班保留机场当地时间','关键时刻前和早起行程前一晚 22:00 推送名称、时间及地点','从推送验证权限后定位到对应行程']},
 latestBusinessRelease:{version:'SCULP OS 3.2 · Miranda个人行程',date:'2026-11-21',status:'deployed',acceptance:'pending_user_acceptance',evidence:'docs/MIRANDA_PERSONAL_SCHEDULE.md',scope:'个人行程页面、受限云端数据与设备推送。真实账号的跨设备操作及手机送达待验收',changes:['打开 Miranda 个人行程即见当天清单，日期按钮展开月历，原工作待办同列显示','个人安排由 JZ 和 Miranda 共同维护，支持版本冲突保护','自 11 月 23 日起用北京时间归日，支持关键时间前及早起行程前夜的详细推送']},
 includedBackendUpdate:{date:'2026-11-21',name:'个人行程功能说明',scope:'仅提供可信的产品能力、页面入口及已验证上线范围',changes:['说明日期切换、双账户权限、北京时间、提前及前夜提醒、设备订阅条件']},
};
