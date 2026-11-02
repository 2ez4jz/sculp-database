// Shared release facts for main and the preserved, newer production chat runtime.
export const v24ReleaseFacts={
 knowledgeRevision:'2026-11-02-v24',
 pendingInterfaceUpdate:{revision:'roles-manual-install-20261102',status:'not_published',evidence:'docs/V241_RELEASE.md',changes:['普通管理员不再可分配；负责人保留全量业务编辑，只有系统管理员管理账号与密码','移除所有桌面和手机站内安装入口，统一通过浏览器菜单手工添加']},
 latestBusinessRelease:{version:'V2.4',date:'2026-11-02',status:'deployed',evidence:'docs/V24_RELEASE.md',
  scope:'正式owner/operations页面与专属摘要接口；不扩大聊天工具权限',
  changes:['Lead和Booking共用云端沟通记录，保存原文、作者、时间、多张截图与语音',
   '选中原文与私有附件后AI生成五项摘要，人工修改确认后单独归档；新增消息仍待整理',
   '询盘转订单沿用客户匹配和去重，原始来源、附件与摘要保留，签约和成交仍需原流程确认',
   '桌面登录后使用宽屏工作台、紧凑侧栏和原文摘要对照；平板与手机使用独立断点布局']},
 latestReleasedUpdate:{date:'2026-11-02',name:'智能沟通记录与宽屏工作台',revision:'v24-20261102',status:'deployed',evidence:'docs/V24_RELEASE.md',
  changes:['手机随手记录客户沟通，电脑对照原文审核AI摘要','桌面不再使用登录页窄栏；完成桌面、平板和手机适配回归'],
  scope:'正式管理员工作区；截图、转写、模型质量及实体多设备仍需人工业务验收'},
 communicationRecordAccess:'沟通原文与私有附件仅有效owner/operations可读写。通过详情页专属接口整理；现有query_bookings聊天工具不自动读取这些新表，也没有沟通原文写入或摘要确认工具。',
};
export const v24FeatureDescription='V2.4详情页支持云端沟通记录、多图与语音、选定来源的AI整理和人工确认归档；管理员可在待整理列表打开客户；正式字段沿用原审核表单';
export const v24PageAction={task:'记录、整理客户沟通或由询盘建立订单',where:'待整理沟通；客户询盘或订单详情→沟通记录',
 needs:['正式有效owner/operations身份','明确Lead或Booking','选择本次原文、截图或语音','摘要逐项核对确认；转订单核对客户匹配与日期服务'],
 completion:'原文保存/摘要确认/转订单必须收到服务器成功回执并重新读取；AI摘要不修改正式日期、价格、收款，聊天不能代替页面执行'};
