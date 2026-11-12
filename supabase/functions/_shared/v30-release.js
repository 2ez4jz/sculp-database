// Deployment facts verified against Pages assets, installed RPCs and Edge status.
// OAuth setup and real mailbox acceptance remain separate from code deployment.
export const v30ReleaseFacts={
 mobileWorkspaceNavigation:{status:'development_only',scope:'正式工作区760px及以下手机布局；待浏览器核验和发布',behavior:'仅横向菜单固定顶部，品牌标题随页面滚走；模块跳转为菜单留出空间',permissions:'沿用当前账号的导航与业务权限，不增加聊天工具或自动操作'},
 knowledgeRevision:'2026-11-12-sculp-os-3',
 latestBusinessRelease:{version:'SCULP OS 3.0',date:'2026-11-12',status:'deployed',acceptance:'pending_real_gmail_and_devices',evidence:'docs/V3.0_DEPLOYMENT_20261112.md',
  scope:'Phase 1工作台及Phase 2.5邮件基础前端、数据库接口和Gmail后端已部署。Google OAuth配置未就绪，尚未绑定或同步真实邮箱；实体设备和真实模型质量待验收',
  changes:['工作台读取真实询盘、任务、近期订单及已知CAD应收，九区导航复用原业务页面',
   '客户搜索和人工确认新增；客户/订单关联任务沿用服务器回执与重读确认',
   '系统设置新增Gmail Integration，沟通中心新增邮件页面及客户/订单邮件区域',
   '邮件代码支持只读授权、业务范围同步、人工关联、AI可选摘要与八类人工回复草稿、内部跟进任务；须先完成Google OAuth配置及真实邮箱授权才能工作',
   '保留既有订单、沟通、收退款、通知与聊天权限；没有自动对外发信能力']},
 latestReleasedUpdate:{date:'2026-11-12',name:'SCULP OS 3.0工作台与Gmail基础',revision:'sculp-os-3-20261112',status:'deployed',evidence:'docs/V3.0_DEPLOYMENT_20261112.md',
  changes:['新工作台、九区导航和客户/任务基础已上线','Gmail设置与邮件中心入口、数据库和服务端代码已上线，Google配置未就绪；不能声称邮箱已接通'],
  scope:'正式有效owner/operations页面；真实Gmail授权、同步及模型/实机验收仍待完成'},
 includedBackendUpdate:{date:'2026-11-12',name:'工作台与Gmail基础接口及更新说明',
  changes:['安装受限工作台RPC及私有邮件数据结构，部署Gmail只读服务','聊天更新说明保留线上既有能力，不新增邮箱读取、发信或任务写入工具'],
  scope:'现有业务角色不变；新Gmail功能需外部OAuth配置，不能把部署当成真实邮件验收'},
 gmailIntegration:{status:'deployed_setup_required',authorization:'仅正式有效owner/operations在设置发起Google只读授权；令牌只在服务端',
  ai:'账户显式opt-in；摘要为未确认信息，英文回复草稿由人工审核并在Gmail发送；自动摘要还需另开服务端配置',
  completion:'连接必须有服务端授权状态；同步必须有真实邮件回读；当前均未完成。聊天没有邮箱读取或发送工具',
  scheduler:'5分钟调度代码已提供，实际任务尚未启用；配置后单独验收'},
};
export const v30FeatureDescription='SCULP OS 3.0正式管理员页面新增日常工作台、九区导航、客户和关联任务基础；系统设置有Gmail Integration、沟通中心有邮件中心。Gmail代码已部署但Google配置未就绪，真实邮箱尚未连接；不能冒充已同步邮件或已完成AI业务分析';
export const v30PageActions=[
 {task:'查看工作台、搜索客户或创建客户/跟进任务',where:'Dashboard工作台；CRM；Calendar日程与任务',needs:['正式有效owner/operations','新增前核对客户身份、任务内容及关联订单；人工确认'],completion:'服务器回执及重新读取；聊天没有新增客户/任务的直接写入工具'},
 {task:'连接工作室Gmail或同步业务邮件',where:'系统设置→Gmail Integration；Communications→Email Center',needs:['正式有效owner/operations','管理员先在服务端配置Google OAuth和安全凭据','本人审核Google只读授权；不提供Gmail密码'],completion:'连接状态、最近同步时间和真实邮件回读均需验证；当前Google配置未就绪'},
 {task:'生成客户邮件摘要或英文回复草稿',where:'邮件详情→AI提取与摘要 / Generate AI Reply',needs:['Gmail已授权且业务邮件已同步','账户显式开启邮件AI；选择用途并核对价格、日期和规则','人工编辑审核；实际发信在Gmail完成'],completion:'摘要/草稿保存及回读；不写确认订单字段，不自动发送，也不代表客户已收到回复'},
];
