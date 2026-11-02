// Shared release facts for main and the preserved, newer production chat runtime.
export const v24ReleaseFacts={
 knowledgeRevision:'2026-11-02-welcome-editor',
 latestBusinessRelease:{version:'V2.4.1',date:'2026-11-02',status:'deployed',evidence:'docs/V241_RELEASE.md',
  scope:'正式owner/operations工作台、账户角色与站内安装入口；沿用V2.4沟通流程，不扩大聊天工具权限',
  changes:['系统管理员可在账户管理旁编辑各账户的云端欢迎语、预览并保存；其他设备刷新生效',
   '系统管理员和负责人均以询盘为首个业务区，订单及经营看板依次往下排列',
   '统一桌面与手机的字体、字号、间距、表单和账户列表；sculp_miranda显示专属欢迎语并自适应换行',
   '取消所有站内添加到桌面或手机的按钮与提示，统一通过浏览器菜单手工添加',
   '普通admin不再可分配；负责人可查看看板及编辑业务，仅operations可新建账号、管理权限与重置密码',
   '保留V2.4云端沟通原文、作者时间、多张私有截图与语音，AI五项整理仍需人工确认',
   '询盘转订单保留来源、附件和摘要，正式日期、价格、签约及收退款沿用原人工核对流程']},
 latestReleasedUpdate:{date:'2026-11-02',name:'后台欢迎语编辑',revision:'welcome-editor-20261102',status:'deployed',evidence:'docs/WELCOME_EDITOR_2026-11-02.md',
  changes:['JZ系统管理员的账户管理旁新增编辑欢迎语：选择账户、输入、预览并保存到云端','保留Miranda原欢迎语；留空恢复默认，其他设备刷新或重新登录后生效','负责人及员工不能修改；保留审计、版本冲突与网络重试保护'],
  scope:'正式有效operations系统管理员后台；不新增聊天写入工具'},
 accountManagementAccess:'仅有效operations系统管理员可查看团队账户、新建账号、调整角色和启用状态、重置密码及编辑各账户欢迎语；owner工作室负责人可查看经营看板和编辑询盘、订单及沟通记录，不能管理登录账号。普通admin不可分配；员工及只读账户沿用既有范围。',
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
