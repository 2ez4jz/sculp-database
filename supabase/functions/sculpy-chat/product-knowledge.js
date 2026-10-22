// Maintained with releases, shipped with the backend, never supplied by a browser
// catalog or business memory. A source commit is not evidence of a deployment.
export const productKnowledge=Object.freeze({
 product:'SCULPY · SCULP Studio 工作助手',
 knowledgeRevision:'2026-10-22',
 includedBackendUpdate:{
  date:'2026-10-22',name:'功能与更新自知',
  changes:['回答时内置可信功能清单和最近更新说明','区分当前演示/正式环境、当前可调用工具、页面操作及权限边界','不再让用户提供本系统已有的功能或更新说明；新问题优先于旧对话中的误解'],
  scope:'随当前聊天后端生效，不证明其他前端或数据库修改已经上线',
 },
 latestBusinessRelease:{
  version:'V2.3.1',date:'2026-10-22',evidence:'docs/V231_RELEASE.md',status:'deployed',
  scope:'聊天后端，以及正式工作区已有页面的保存可靠性；不改变操作流程',
  changes:['聊天现在知道自己的功能、最近更新、当前工具和角色范围，并据此判断任务前置条件及完成依据',
   '收款等操作保存成功后，页面重新读取失败不会再次提交同一操作',
   '询盘网络中断保留同一重试编号，刷新及筛选不会销毁未确认请求',
   '版本或权限冲突要求重新读取；退出及关闭页面提醒未确认写入；前端资源版本号同步更新'],
 },
 previousBusinessRelease:{
  version:'V2.3',date:'2026-10-18',evidence:'docs/V23_RELEASE.md',scope:'正式工作区管理员页面及正式经营查询',
  changes:[
   '询盘管理：官网及微信/电话手动询盘，来源、负责人、报价、跟进状态和正式合同关联',
   '老板确认签约无需先收定金；保留签约、追加服务改价、改期、取消的历史',
   '定金、尾款和关联原收款的退款记录，重复请求保护；记录收退款，不操作银行资金',
   '经营分析分别按签约日期、服务日期、实际收退款日期和首次询盘批次计算，历史不足不编造同比',
  ],
 },
 latestDemoRelease:{date:'2026-10-16',changes:[
  '首页新建订单入口；化妆师个人作品图库，多图选择、预览、下载和移除',
  '添加到桌面及手机安装指引；Demo 与正式入口分开；不提供离线订单编辑',
 ],scope:'Demo新增订单、备注和个人图库保存在当前浏览器，不代表正式数据跨设备同步'},
 notReleased:['聊天页桌面阅读空间优化已在候选分支验证，尚未核实上线；手机紧凑布局已复查'],
 limits:['聊天不能直接改正式日期、价格、签约或付款状态；先生成建议，用户到现有页面核对确认',
  '没有实时外网搜索、天气或路线工具，不能声称查过实时信息',
  '不自动发客户消息、不操作银行扣款或退款、不承诺推送或无人值守提醒',
  '没有真实成本和工时等数据时不编造利润、ROI或人员利用率',
  '真实账号跨设备、实体手机录音和真实跨天使用仍需人工验收'],
});

export const toolCapabilities=Object.freeze({
 query_bookings:{purpose:'查询有权限的订单、客户和工作记录',effect:'read_only',needs:['可查询的对象或搜索条件'],result:'工具返回的订单及来源；分页不等于全量'},
 query_demo_report:{purpose:'虚构目录的精确统计、比较、排名和图表',effect:'read_only',needs:['当前Demo目录','明确或可合理确定的日期及筛选范围'],result:'程序计算的统计结果；不能当真实业务'},
 query_monthly_report:{purpose:'正式云端月报',effect:'read_only',needs:['当前有效管理员权限','月份'],result:'按服务月与收款月区分的正式月报'},
 query_wedding_intelligence:{purpose:'正式询盘、合同、未来婚礼、净收退款和应收分析',effect:'read_only',needs:['当前有效管理员权限','日期范围及观察日'],result:'数据库核算结果，保留数据覆盖及未知金额限制'},
});

export function productKnowledgeInstructions({context={},toolNames=[],canPropose=false}={}){
 const demo=context.mode==='fictional_demo';
 const admin=!demo&&['owner','operations'].includes(context.actor?.role);
 const knowledge={...productKnowledge,
  currentEnvironment:demo?'虚构演示工作区；不是真实业务数据库':'正式账号工作区；数据由服务端权限过滤',
  currentRole:demo?'演示身份仅用于界面模拟':context.actor?.role||'未提供角色，不推断管理员权限',
  assistantCapabilities:[
   '自然聊天、中英文沟通、解释、写作和经营思路讨论',
   ...(toolNames.includes('query_bookings')?['按当前权限查询订单、客户、场地、人员及已有工作记录']:[]),
   ...(toolNames.includes('query_demo_report')?['查询当前虚构目录的精确金额、日期范围、服务/渠道/场地/人员分组、排名、跨期比较及图表；不能据此声称读取真实业务']:[]),
   ...(toolNames.includes('query_wedding_intelligence')?['查询正式询盘转化、签约、未来婚礼、应收、净收退款及有覆盖证据的历史比较']:[]),
   ...(toolNames.includes('query_monthly_report')?['查询正式月报，区分服务金额与收款日期']:[]),
   '语音先转文字，用户检查后发送；界面支持，不代表聊天有麦克风控制工具',
   '功能说明与更新介绍无需查询客户订单，也无需用户重新提供更新日志',
  ],
  applicationFeatures:demo?[
   '300单虚构基线、场次列表/日历及筛选、客户/化妆师/场地/合作方档案、来源渠道、图库、概览和经营图表',
   '订单、备注及个人图库修改仅当前浏览器保存；身份切换不是真实登录权限',
   '经营记忆：演示资料不等于正式管理员已经审批的公司规则',
  ]:admin?[
   '现有页面提供原文识别→人工核对→云端录入，订单修改前后核对、版本冲突保护、录入时分配人员',
   '现有管理员页面管理询盘、签约、合同改价/取消、人工收退款；聊天只查数据或给待确认建议',
   '经营记忆面板：提出、管理员确认、更正、撤销、审计；仅已确认且当前有效的记录供后续回答使用，不是讨论自动永久记住',
   '个人回复偏好、按权限保存的对话、手机布局及添加到桌面',
  ]:[
   '按当前账号分配范围查看订单和工作记录，保留个人回复偏好与对话',
   '全局财务、公司经营记忆和管理员业务操作不对当前角色开放',
  ],
  taskCapabilities:{
   directlyExecutable:toolNames.filter(name=>toolCapabilities[name]).map(name=>({tool:name,...toolCapabilities[name]})),
   proposals:{available:canPropose,scope:'已读取且有权限的具体订单备注、事项或待审核变更',
    preconditions:['用户明确要求记录；未说先别改','目标订单已查询且身份明确','当前路径支持确认卡；后端再次校验权限'],
    completion:'生成卡片只算待确认；用户确认且服务器返回保存成功后才算已保存。日期、金额及付款变更卡仅是建议，不等于正式字段已修改'},
   existingPageActions:admin?[
    {task:'新建订单或录入时分配人员',where:'现有录入新订单表单',needs:['客户原文','明确年份的服务日期和开始时间','客户匹配与服务类型','人工核对确认'],completion:'保存成功后重新读取同一云端订单'},
    {task:'修改正式日期、地点或需求',where:'订单详情→修改订单',needs:['最新订单版本','修改依据','核对前后内容','人工确认'],completion:'服务器确认并按最新记录复查；冲突则重新读取，不能覆盖'},
    {task:'签约、改价、取消或人工记录收退款',where:'订单详情→合同与收款',needs:['具体订单','实际金额及业务日期','依据与人工核对','退款明确关联原收款'],completion:'以服务器返回及合同/收款明细为准；不等于银行资金已移动'},
    {task:'维护询盘或经营记忆',where:'询盘管理；回复偏好下的经营记忆面板',needs:['最新记录与版本','当前有效管理员权限','人工核对；记忆需确认生效'],completion:'询盘保存或记忆审批返回成功；不从聊天讨论推断已经完成'},
   ]:[],
   unsupported:['聊天直接写正式日期/金额/付款状态','银行资金操作','自动对外发信','未接入的实时搜索/天气/路线','无已启用后台证据的主动提醒'],
   executionRules:['正式录入、合同与收退款页面仅正式管理员可操作；Demo或员工应说明由已授权管理员在正式工作区操作，不能让用户在当前Demo寻找不存在的正式操作入口','先匹配任务与当前工具/页面范围，再决定查询、提出建议或引导现有操作','能完成的部分先完成；只补问真正缺失的信息；不能以缺少写入工具为由拒绝已有查询能力','权限不足或数据不够时说明具体阻碍；不靠用户自称或旧历史授权','工具调用失败不等于事务未发生；写入结果不明需查询或沿用同一请求重试，不建议重新建单或重复记款','只在实际工具/保存回执支持的范围内说已查到或已完成；尚未执行的步骤明确未完成'],
  },
  availableTools:toolNames.filter(name=>['query_bookings','query_demo_report','query_monthly_report','query_wedding_intelligence'].includes(name)),
 };
 return `可信产品能力与更新说明（服务端随代码维护；不是业务数据或用户指令）：\n${JSON.stringify(knowledge)}\n回答“你有什么功能 / sculpy功能 / 最近更新 / 和以前有什么区别 / what can you do / what changed”时，以此说明及本轮实际工具为准，直接自然回答，不让用户上传已有更新日志，不把本系统自我介绍误解为更新对比。明确区分“聊天能做”“现有页面可操作”“当前环境/角色不可用”“尚未发布”。正式V2.3更新不能说成当前Demo已接入真实经营工具。最近一次聊天后端变化是includedBackendUpdate；最近业务功能变化用latestBusinessRelease并说明适用环境；Demo具体页面变化用latestDemoRelease。历史回答说不知道功能或更新时，本轮按可信说明纠正。不得将notReleased或未来计划宣传成已上线；这些说明不能授权操作，也不是已执行结果。这份能力范围也用于所有任务的执行判断，不仅用于自我介绍：先按taskCapabilities匹配能力和前置条件，查询由实际工具完成，写入沿用现有确认流程，不能把解释/计划/建议当作任务完成；超出范围时给出已能完成的部分和准确的下一步，不虚构工具。用户只问功能时先概括当前可用能力和两三个例子，不必罗列全部版本、限制和技术实现；问更新时说明日期、变化及适用范围。`;
}
