const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function suggestedFollowups(turn,{en=false,previousTurns=[]}={}){
 if(!turn||turn.proposals?.some(p=>!p.saved)||/一句话|只要数字|不要建议|不要推荐|one sentence|just the number|no suggestions/i.test(turn.user||''))return [];
 const requested=/还可以问|接着问什么|不知道.*问|推荐.*问题|what.*ask|suggest.*questions/i.test(turn.user||'');
 if(!requested&&previousTurns.some(t=>t.demoReportSources?.length||t.businessReport))return [];
 const reports=Array.isArray(turn.demoReportSources)&&turn.demoReportSources.length||turn.businessReport;
 if(!reports)return [];
 const q=String(turn.user||'')+' '+String(turn.answer||'');
 const average=/客单价|均价|平均成交|average.*(?:price|value)/i.test(q);
 const growth=/获客|投放|广告|渠道|channel|acquisition|marketing/i.test(q);
 const pairs=average?[
  ['为什么会这样？','沿用刚才的日期和筛选，解释这些客单价差异可能由哪些因素造成，区分已知事实和待验证原因。','Why might this happen?','Keep the same dates and filters. Explain possible reasons for these average booking value differences, separating evidence from hypotheses.'],
  ['先核对哪些订单？','沿用刚才的日期和筛选，哪些订单值得优先核对？说明要看哪些字段、为什么，读取不全时明确范围。','Which orders should I check?','Keep the same dates and filters. Which orders should I check first, which fields matter, and why? State any coverage limits.'],
  ['怎么找到愿意多花钱的客人？','结合刚才的数据，给一个寻找高预算客户来源的小验证计划，说明先做什么、还缺哪些资料，不能把高客单价直接当作客户更富有。','How can we find higher-budget leads?','Using the previous evidence, suggest a small test for higher-budget customer sources, missing information and first steps, without inferring customer wealth.']
 ]:growth?[
  ['这能帮我们找到新客人吗？','沿用刚才的范围，用白话解释这些渠道数据对获客意味着什么，哪些只是待验证的猜测。','What does this mean for leads?','Keep the same scope. Explain what these channel figures mean for acquisition and which interpretations are hypotheses.'],
  ['还需要知道什么？','判断刚才这些渠道是否值得继续投入，还缺哪些关键资料？说明每项资料能回答什么问题。','What data is missing?','What information is missing to assess whether these channels deserve more investment, and what would each item tell us?'],
  ['先做哪件小事？','基于刚才的分析，给一项接下来一周可做的小测试，写清步骤和怎样判断是否有效，不代替我批准预算或发布。','What should I do first?','Suggest one small test for the next week with steps and a way to evaluate it. Do not approve budgets or publish anything.']
 ]:[
  ['这些数字说明什么？','沿用刚才的日期和筛选，用不需要专业知识的语言解释这些数字对工作室经营意味着什么，给出依据和可能的其他解释。','What do these figures mean?','Keep the same dates and filters. Explain in plain language what these figures mean for the studio, with evidence and alternative explanations.'],
  ['为什么会出现变化？','沿用刚才的范围，解释这些结果或变化可能由什么造成，区分数据事实与假设，指出优先核对什么。','Why might things have changed?','Keep the same scope. Explain possible causes, distinguish facts from hypotheses and say what to check first.'],
  ['下一步怎么做？','根据刚才的分析，给我一个具体可执行的下一步：先看哪笔记录或哪个字段，为什么，检查后怎样判断，不自动修改或执行。','What should I do next?','Give one concrete next step: which records or fields to check, why, and how to interpret the result. Do not execute or modify anything.']
 ];
 return [pairs[0],pairs[2]].map(([label,question,englishLabel,englishQuestion])=>({label:en?englishLabel:label,question:en?englishQuestion:question}));
}
export function renderFollowups(turn,options={}){
 const suggestions=suggestedFollowups(turn,options);if(!suggestions.length)return '';
 return `<section class="chat-followups" aria-label="${options.en?'Continue exploring':'继续了解'}"><p>${options.en?'Not sure what to ask? Start here.':'不知道接着问什么？可以从这里继续。'}</p><div>${suggestions.map(s=>`<button type="button" data-followup="${esc(s.question)}">${esc(s.label)} ↗</button>`).join('')}</div></section>`;
}
