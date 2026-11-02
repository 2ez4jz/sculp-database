// Shared release facts for main and the preserved, newer production chat runtime.
export const v24ReleaseFacts={
 pendingCommunicationDrop:{status:'not_published',evidence:'docs/COMMUNICATION_DROP_2026-11-02.md',scope:'正式owner/operations的Lead与Booking沟通记录支持多文件拖入；沿用现有附件校验、人工保存、私有云端存储和重试保护；聊天不能拖入或保存附件'},
 knowledgeRevision:'2026-11-02-web-push-v25',
 latestBusinessRelease:{version:'V2.5',date:'2026-11-02',status:'deployed',acceptance:'pending_real_iphone',evidence:'docs/V25_RELEASE.md',
  scope:'正式账号P0通知基础设施、个人设置、新官网询盘与24小时未处理提醒；真实iPhone送达尚未验收，P1未实施',
  changes:['设置→通知设置由本人主动开启设备推送；首页没有通知开关，不自动申请权限',
   '新官网询盘通知已开启通知的有效系统管理员与负责人；24小时未处理提醒按负责人及现有业务权限发送',
   '默认每条询盘仅提醒一次；阈值与重复间隔由系统管理员配置；按用户要求没有免打扰时段',
   '锁屏只显示通用提醒；点击后重新验证身份和权限，再打开现有询盘详情',
   '服务端保留通知历史与错误状态，提供重复保护、失败重试、过期订阅清理、退出及停用后的权限校验',
   '保留V2.4.1账户、欢迎语、询盘优先布局、云端沟通、附件、AI人工确认及合同收退款流程']},
 previousBusinessRelease:{version:'V2.4.1',date:'2026-11-02',status:'deployed',evidence:'docs/V241_RELEASE.md',scope:'询盘优先的手机与桌面工作台、简化角色、账户与云端欢迎语管理、手动安装及V2.4沟通流程'},
 latestReleasedUpdate:{date:'2026-11-02',name:'P0手机推送与询盘工作提醒',revision:'web-push-v25-20261102',status:'deployed',acceptance:'pending_real_iphone',evidence:'docs/V25_RELEASE.md',
  changes:['个人通知设置、设备主动订阅、测试通知与通知记录','新官网询盘和默认24小时未处理询盘提醒；没有免打扰时段','前端、数据库、服务端及定时任务已发布并回读验证；真实iPhone关闭App后的送达与点击尚未验收'],
  scope:'正式账号且本人主动授权的设备；尚未替真实用户开启通知，不代表手机已收到推送'},
 pushNotifications:{phase:'P0',status:'deployed',acceptance:'pending_real_iphone',optIn:'本人在设置主动开启设备权限和订阅；不能由聊天代开',privacy:'锁屏无客户隐私或财务信息；点击按当前账号权限解析',delivery:'服务接收不等于实体手机收到；不能承诺即时送达',quietHours:false,internalMessages:'P1未实施，须待P0真实手机验收后开发'},
 pendingV25P1:{status:'not_implemented',scope:'员工间内部工作通知；待P0真实iPhone验收通过后实施'},
 accountManagementAccess:'仅有效operations系统管理员可查看团队账户、新建账号、调整角色和启用状态、重置密码及编辑各账户欢迎语；owner工作室负责人可查看经营看板和编辑询盘、订单及沟通记录，不能管理登录账号。普通admin不可分配；员工及只读账户沿用既有范围。',
 workspaceDisplayBehavior:'账户管理仅有效operations可用；同按钮展开/收起并显示选中颜色，收起保留当前表单。询盘小标签仅标记已存储的pending状态，状态更新后随列表重读刷新；小标签仍仅为界面提示；V2.5自动推送单独由个人通知设置控制。',
 manualInstallation:'全站没有添加到桌面或手机的站内按钮、弹窗或自动安装提示；需要时由使用者通过浏览器菜单手工添加。无离线订单编辑。',
 communicationRecordAccess:'沟通原文与私有附件仅有效owner/operations可读写。通过详情页专属接口整理；现有query_bookings聊天工具不自动读取这些新表，也没有沟通原文写入或摘要确认工具。',
};
export const v24FeatureDescription='V2.4详情页支持云端沟通记录、多图与语音、选定来源的AI整理和人工确认归档；管理员可在待整理列表打开客户；正式字段沿用原审核表单';
export const v24PageAction={task:'记录、整理客户沟通或由询盘建立订单',where:'待整理沟通；客户询盘或订单详情→沟通记录',
 needs:['正式有效owner/operations身份','明确Lead或Booking','选择本次原文、截图或语音','摘要逐项核对确认；转订单核对客户匹配与日期服务'],
 completion:'原文保存/摘要确认/转订单必须收到服务器成功回执并重新读取；AI摘要不修改正式日期、价格、收款，聊天不能代替页面执行'};
export const v241AccountPageAction={task:'新建团队账号、调整权限或重置密码',where:'业务工作台→账户管理',
 needs:['正式有效operations系统管理员身份','明确目标账号、姓名与角色；新建或重置需输入符合规则的新密码','本人及最后一个系统管理员保护；人工核对后提交'],
 completion:'账户服务返回成功并重新读取账户列表；聊天没有账号创建、角色修改或密码重置工具'};

export const welcomeEditorPageAction={task:'修改账户登录欢迎语',where:'业务工作台顶部→账户管理旁的编辑欢迎语',
 needs:['正式有效operations系统管理员身份','选择目标账户，输入最多160字的欢迎语（留空恢复默认）','预览核对后点击保存；版本冲突时保留草稿，读取最新内容后重新核对'],
 completion:'服务器保存成功并重新读取；当前账号立即更新，其他设备刷新或重新登录后生效。聊天没有欢迎语修改工具'};

export const v25FeatureDescription='V2.5正式设置页提供主动订阅的设备推送、个人偏好、测试与通知历史；新官网询盘和默认24小时未处理提醒已部署。没有免打扰；真实iPhone送达尚未验收，内部工作通知P1未实施';
export const v25NotificationPageAction={task:'开启、关闭或测试本人设备通知',where:'正式工作台顶部→设置→通知设置',needs:['本人有效正式账号与当前登录会话','支持Web Push的浏览器；iPhone从手工添加的主屏幕App打开','本人主动点击开启并授权；全局提醒规则仅operations可配置'],completion:'云端登记并重新读取设备状态；测试排队或服务接收不代表真实手机送达，关闭App后的实机接收与点击需人工核验。聊天没有订阅、发送或任意提醒工具'};
