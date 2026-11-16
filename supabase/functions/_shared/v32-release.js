// Frontend and additive database increment verified on 2026-11-16.
import {v31ReleaseFacts} from './v31-release.js';
export const v32ReleaseFacts={
 knowledgeRevision:'2026-11-16-sculp-os-3-2',notReleased:[],
 previousBusinessRelease:{...v31ReleaseFacts.latestBusinessRelease,acceptance:'user_accepted',scope:'V3.1已于2026-11-16由JZ确认验收，是本轮基线'},
 latestBusinessRelease:{version:'SCULP OS 3.2',date:'2026-11-16',status:'deployed',acceptance:'pending_user_acceptance',evidence:'docs/V3.2_RELEASE.md',
  scope:'正式有效owner/operations的客户维护、任务负责人和CSV历史导入页面；前端与数据库已部署验证，本版真实账号跨设备与实体手机验收待完成。Gmail配置暂停',
  changes:['客户档案内编辑姓名、称呼、联系方式、来源、城市、语言、婚礼日期、标签与内部备注；先核对修改和可能重复客户，再人工确认',
   '任务可分配或改派给已有活跃owner/operations；我的/团队范围与状态筛选组合使用，保留任务历史和审计',
   'CRM内下载UTF-8 CSV客户/订单模板、映射字段、逐行查看原文件行号和数据；文件最多2 MiB/2000条，每次人工确认最多100条',
   '先导入客户再关联订单；重复客户人工匹配，重试与重复导入去重，批次失败完整回滚。未知价格留空，订单缺少具体时间阻止保存，不补造财务流水']},
 latestReleasedUpdate:{date:'2026-11-16',name:'客户维护与历史导入',revision:'os32-20261116',status:'deployed',evidence:'docs/V3.2_RELEASE.md',
  changes:['客户编辑及联系方式并发保护','任务负责人分配、改派和我的/团队筛选','CSV映射、逐行核对、匹配、去重和事务批次导入'],scope:'仅正式有效owner/operations页面；没有新增聊天直接写入工具或员工CRM权限'},
 includedBackendUpdate:{date:'2026-11-16',name:'客户编辑、任务分配与历史导入接口及更新说明',
  changes:['新增受限编辑、改派与导入接口及私有回执，沿用原有业务表','聊天同步已验证发布事实，保留现网长期记忆、诊断及既有工具'],scope:'所有页面写入需要人工核对确认；聊天不能直接编辑客户、改派任务或执行CSV导入'},
};
export const v32FeatureDescription='SCULP OS 3.2正式有效owner/operations可在CRM客户档案编辑资料，先核对差异及重复客户再人工确认；联系方式变化也会使旧预览失效。任务可选择或改派给已有活跃owner/operations，并按我的/团队及状态筛选。CRM内可用UTF-8 CSV分批导入历史客户/订单：最多2 MiB/2000条文件，每批最多100条；字段映射、原文件行号、逐行数据与匹配结果经人工核对后才保存。先导入客户再关联订单，未知金额留空，缺少订单开始时间阻止保存，不创建收退款或结算流水；回执不明重试原请求。聊天没有这些操作的直接写入工具。';
export const v32PageActions=[
 {task:'编辑客户资料',where:'CRM→客户档案→编辑客户资料',needs:['正式有效owner/operations','最新客户及联系方式版本','核对修改前后差异和可能重复客户','人工勾选确认'],completion:'服务器保存回执及重新读取；冲突保留草稿并重新读取，回执不明重试同一笔；不自动合并客户'},
 {task:'分配或改派任务负责人',where:'Calendar日程与任务→添加任务／处理任务',needs:['正式有效owner/operations','已有活跃owner/operations负责人','最新任务版本和人工确认'],completion:'保存回执及我的/团队范围重新读取；不发送外部消息或新增员工CRM权限'},
 {task:'导入历史客户与订单',where:'CRM→导入历史客户与订单',needs:['正式有效owner/operations','UTF-8 CSV，最多2 MiB/2000条','字段映射与逐行核对；先客户后订单','订单须核对服务、完整开始时间、状态和币种；未知价格留空','人工匹配重复客户、修正或排除错误行；每批最多100条并明确确认'],completion:'批次服务器回执与实际记录重新读取；失败完整回滚，回执不明重试原批次；不把预览当导入成功，不补造收退款或签约日期'},
];
