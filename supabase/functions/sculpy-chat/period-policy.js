const validDate=value=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
export function catalogHistoryFrom(bookings,localDate){
 if(!validDate(localDate))return null;
 const days=bookings.flatMap(b=>[b.date,b.paidDate]).filter(d=>validDate(d)&&d<=localDate).sort();
 return days[0]||localDate.slice(0,4)+'-01-01';
}
export function analysisPeriods(message,turns=[],localDate,historyFrom){
 if(!validDate(localDate)||!validDate(historyFrom)||historyFrom>localDate)return null;
 const q=String(message||''),last=turns.at(-1);
 const hasHistory=Boolean(last?.demoReportSources?.length)||/客单价|均价|排名|最高|最多|average|ranking|highest/i.test(last?.user||'');
 const metric=/客单价|均价|平均|收入|营收|金额|收款|到账|订单|场地|化妆师|渠道|服务|venue|artist|channel|revenue|receipt|booking|average/i.test(q);
 const ranking=/最高|最低|最多|最少|排名|排行|哪个|哪些|对比|比较|top|highest|lowest|most|least|rank|compar/i.test(q);
 const longTerm=/长期|长远|拉长时间|long.?term|over the long run|broader history/i.test(q);
 const both=/(?:今年|this year).*(?:全部|所有|历史|all.?time|history)|(?:全部|所有|历史|all.?time|history).*(?:今年|this year)/i.test(q);
 const explicit=/20\d{2}|\d{1,2}\s*月|今年|去年|本月|上月|这个月|今天|昨天|截至|最近|过去|近\s*(?:\d|[一二三四五六七八九十])|所有历史|全部历史|有史以来|all.?time|all history|this year|last year|this month|last month|today|yesterday|last\s+\d|past\s+\d|as of/i.test(q);
 if(!both&&explicit)return null;
 if(!both&&!(longTerm&&(hasHistory||metric))&&!(metric&&ranking&&!hasHistory))return null;
 return {year:{from:localDate.slice(0,4)+'-01-01',to:localDate},history:{from:historyFrom,to:localDate}};
}
export function analysisPeriodInstructions(message,turns,context){
 const periods=analysisPeriods(message,turns,context.localDate,context.historyFrom);
 if(!periods)return '';
 return '本轮默认比较范围（服务端根据完整授权目录生成，优先于旧对话里的时间范围）：'+JSON.stringify(periods)+
 '。直接给出“今年至今”和“全部已记录历史”两组结果，不询问用户想看今年还是历史。分别查询这两个范围；范围完全相同时允许复用一份查询。只替换时间，沿用上一轮明确的服务类型、指标和其他筛选，不能把客单价换成最高单价或营收。全部历史截至localDate，不混入未来预约。简短并列表格展示每个范围的结果、金额与有效样本数，并注明起止日期；两组相同也明确写两组，并解释当前历史数据仅覆盖这一年。没有记录直接写无有效样本，不追问选择范围，不假称覆盖系统之外的业务历史。';
}
