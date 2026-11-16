import {v31ReleaseFacts} from './v31-release.js';
export const v32ReleaseFacts={
 latestBusinessRelease:{...v31ReleaseFacts.latestBusinessRelease,acceptance:'user_accepted',scope:'V3.1正式页面与数据库已部署；JZ于2026-11-16确认当前版本验收完成。Gmail配置仍暂停。'},
 notReleased:[{version:'SCULP OS 3.2',status:'candidate',date:'2026-11-16',changes:['客户资料编辑、核对、并发保护和审计','任务负责人分配、改派和我的/团队筛选','CSV客户/订单导入、逐行预览、匹配与批次去重'],scope:'仅正式有效owner/operations；新功能尚未部署，不增加聊天直接写入工具'}],
};
export const v32FeatureDescription='V3.2客户编辑、任务改派和CSV导入仍是未发布候选；不得把这些新页面操作宣传为当前线上能力。';
export const v32PageActions=[];
