// The pilot has report tools only. Recording and order discussions stay on the
// existing conversation path, which can query orders and propose saved notes.
export function isAnalystQuestion(message, turns = []) {
 const q=String(message||'');
 if(/记一下|记录|保存|修改|更改|备注|待办|提醒|录入|\b(save|record|update|change|note|remind)\b/i.test(q))return false;
 if(/分析|统计|经营|日报|月报|季度|收入|营收|金额|收款|到账|渠道|获客|财务|利润|占比|图表|饼图|柱状|趋势|对比|比较|订单数|多少.*订单|analysis|analy[sz]e|report|revenue|receipt|financial|profit|channel|chart|graph|compare|comparison|order count/i.test(q))return true;
 return /用图|画图|继续|原因|建议|为什么|怎么办|\b(visuali[sz]e|continue|why|suggestion)\b/i.test(q)&&Array.isArray(turns)&&turns.at(-1)?.demoReportSources?.length>0;
}
