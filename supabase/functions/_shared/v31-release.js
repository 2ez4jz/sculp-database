// Frontend and database verified on 2026-11-16; no new chat write tools.
export const v31ReleaseFacts={
 knowledgeRevision:'2026-11-16-sculp-os-3-1',notReleased:[],
 latestBusinessRelease:{version:'SCULP OS 3.1',date:'2026-11-16',status:'deployed',acceptance:'pending_real_devices',evidence:'docs/V3.1_RELEASE.md',
  scope:'正式有效owner/operations的客户档案与跟进任务页面；数据库接口和前端已部署验证，真实账户跨设备和实体手机仍待验收。Gmail配置暂停，真实邮箱尚未连接',
  changes:['CRM客户档案显示联系方式、来源、城市、语言、婚礼日期、内部备注及分页订单历史，可打开原订单或创建关联任务',
   '客户搜索支持姓名、邮箱和电话，不按同名自动合并',
   '跟进任务支持完成、取消、改期、重新打开、状态筛选和分页；保留任务历史与审计',
   '修改需人工确认；版本冲突要求重新读取，未收到回执沿用同一请求重试；截止日期按多伦多日期处理']},
 latestReleasedUpdate:{date:'2026-11-16',name:'客户档案与跟进任务',revision:'os31-20261116',status:'deployed',evidence:'docs/V3.1_RELEASE.md',
  changes:['查看客户完整档案和关联订单历史','人工确认处理跟进任务，并保留重试及并发保护'],scope:'正式有效owner/operations页面；Demo及员工没有新增CRM或全局任务权限'},
 includedBackendUpdate:{date:'2026-11-16',name:'客户档案与任务接口及更新说明',changes:['新增受限客户详情与任务查询/修改接口','聊天同步已验证发布事实，保留现网长期记忆及既有工具'],scope:'页面操作需要人工确认；聊天没有直接创建客户或修改任务的工具'},
};
export const v31FeatureDescription='SCULP OS 3.1正式有效owner/operations可在CRM查看客户联系方式、来源、内部备注和分页订单历史；客户目录支持姓名/邮箱/电话搜索。日程与任务支持完成、取消、改期、重新打开、分页和状态筛选；修改需人工核对确认，冲突时重新读取，回执不明时重试同一请求。聊天不能直接修改这些任务。';
export const v31PageActions=[
 {task:'查看客户档案、联系方式和关联订单',where:'CRM→查看客户档案',needs:['正式有效owner/operations','在客户目录核对姓名、邮箱或电话以确定客户身份'],completion:'服务器读取客户及其关联订单；未填写的信息保持未填写，不推测联系方式或合并同名客户'},
 {task:'完成、取消、改期或重新打开跟进任务',where:'Calendar日程与任务→处理任务',needs:['正式有效owner/operations','最新任务版本与状态','改期需多伦多截止日期','人工勾选核对确认'],completion:'服务器回执及重新读取；版本冲突需重新选择任务，回执不明重试同一请求；聊天没有任务直接写入工具'},
];
