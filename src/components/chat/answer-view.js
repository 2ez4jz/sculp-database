// Presentation only: never calls a model, changes a stored answer, or extracts financial facts from prose.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inline=v=>esc(v).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`\n]+)`/g,'<code>$1</code>');
const cells=line=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(s=>s.trim());
const divider=line=>{const c=cells(line);return c.length>1&&c.every(s=>/^:?-{3,}:?$/.test(s));};
export function answerBlocks(text){
 const lines=String(text||'').replace(/\r\n?/g,'\n').split('\n'),out=[];let i=0;
 while(i<lines.length){
  if(!lines[i].trim()){i++;continue;}
  if(i+1<lines.length&&lines[i].includes('|')&&divider(lines[i+1])){
   const headers=cells(lines[i]);i+=2;const rows=[];
   while(i<lines.length&&lines[i].trim()&&lines[i].includes('|')){const row=cells(lines[i++]);if(row.length===headers.length)rows.push(row);else {i--;break;}}
   out.push({type:'table',headers,rows});continue;
  }
  const heading=lines[i].match(/^#{1,6}\s+(.+)$/);if(heading){out.push({type:'heading',text:heading[1]});i++;continue;}
  if(/^\s*(?:[-*+]\s+|\d+(?:[.)]\s+|、\s*))/.test(lines[i])){
   const ordered=/^\s*\d+(?:[.)]\s+|、)/.test(lines[i]),items=[];
   while(i<lines.length&&/^\s*(?:[-*+]\s+|\d+(?:[.)]\s+|、\s*))/.test(lines[i]))items.push(lines[i++].replace(/^\s*(?:[-*+]\s+|\d+(?:[.)]\s+|、\s*))/,''));
   out.push({type:'list',ordered,items});continue;
  }
  const paragraph=[];
  while(i<lines.length&&lines[i].trim()){
   if(paragraph.length&&(/^#{1,6}\s+/.test(lines[i])||/^\s*(?:[-*+]\s+|\d+(?:[.)]\s+|、\s*))/.test(lines[i])||(i+1<lines.length&&lines[i].includes('|')&&divider(lines[i+1]))))break;
   paragraph.push(lines[i++]);
  }
  out.push({type:'paragraph',text:paragraph.join('\n')});
 }
 return out;
}
function table(headers,rows,label){
 return `<div class="response-table-scroll" role="region" aria-label="${esc(label)}" tabindex="0"><table class="response-table"><thead><tr>${headers.map(h=>`<th scope="col">${inline(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export function renderAnswerBlocks(blocks,en=false){return blocks.map(b=>b.type==='table'?table(b.headers,b.rows,en?'Analysis table':'分析表格'):b.type==='heading'?`<h4>${inline(b.text)}</h4>`:b.type==='list'?`<${b.ordered?'ol':'ul'}>${b.items.map(t=>`<li>${inline(t)}</li>`).join('')}</${b.ordered?'ol':'ul'}>`:`<p>${inline(b.text)}</p>`).join('');}
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const money=v=>'CAD '+(v/100).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2});
function verifiedReports(turn){
 const seen=new Set();return (turn.demoReportSources||[]).filter(r=>{
  if(r?.source!=='current_fictional_demo_full_catalog'||r.fictional!==true||!r.filters||!integer(r.completedAmountCents)||!integer(r.grossReceivedCents)||!integer(r.completed))return false;
  const {from,to,service,channelId,artistId,bookingId,status}=r.filters,key=JSON.stringify([from,to,service,channelId,artistId,bookingId,status]);
  if(seen.has(key))return false;seen.add(key);return true;
 });
}
function scope(r){const f=r.filters;return [f.from+' → '+f.to,...['service','channelId','artistId','bookingId','status'].map(k=>f[k]).filter(Boolean)].join(' · ');}
function facts(reports,en){
 if(!reports.length)return '';
 const labels=en?['Completed service value','Gross receipts','Completed orders']:['已做完订单的总价','实际收到的钱','做完的订单数'];
 const data=reports.length===1?`<div class="response-metrics">${[money(reports[0].completedAmountCents),money(reports[0].grossReceivedCents),String(reports[0].completed)].map((v,i)=>`<div class="response-metric"><span>${labels[i]}</span><strong>${esc(v)}</strong></div>`).join('')}</div>`:table([en?'Period / filter':'看的日期和范围',...labels],reports.map(r=>[scope(r),money(r.completedAmountCents),money(r.grossReceivedCents),String(r.completed)]),en?'Verified comparison':'已核验数据对比');
 const limits=[en?'Fictional data. Completed value uses service dates; receipts use payment dates before refunds. Neither is profit.':'以下是虚构测试数据。总价按服务日期统计，收款按实际到账日期统计。收到的钱还没扣退款和成本，不是利润。'];
 if(reports.some(r=>r.unpricedCompleted||r.nonCadCompleted))limits.push(en?'Missing prices or non-CAD amounts: totals are incomplete.':'有订单没填价格，或用了其他货币，金额合计不完整。');
 if(reports.some(r=>r.filters.to>r.asOfDate&&r.catalogQuality?.futureCompleted))limits.push(en?'Future-dated completed statuses require review.':'这里包含未来日期的订单，需检查是否误标成已完成，不能算作截至今天已经做完的业绩。');
 return `<section class="response-facts" aria-label="${en?'Verified figures':'已核验数字'}"><div class="response-section-label">${en?'KEY FIGURES':'关键数字'} <span>${en?'Fictional demo':'虚构测试'}</span></div>${reports.length===1?`<p class="response-scope">${esc(scope(reports[0]))}</p>`:''}${data}<p class="response-basis">${limits.map(esc).join(' ')}</p></section>`;
}
export function renderChatAnswer(turn,supplement='',{expanded=false,key=turn.id||''}={}){
 const text=String(turn.answer||''),en=!/\p{Script=Han}/u.test(text),blocks=answerBlocks(text);
 const complex=text.length>360||blocks.some(b=>b.type==='table')||blocks.length>3;
 if(!complex)return `<div class="chat-answer chat-response response-simple">${renderAnswerBlocks(blocks,en)}</div>${supplement}`;
 const reports=verifiedReports(turn),lead=blocks.find(b=>b.type==='paragraph'),suggestion=[...blocks].reverse().find(b=>b.type==='paragraph'&&b!==lead&&/建议|下一步|suggest|recommend|next step/i.test(b.text));
 const firstTable=blocks.find(b=>b.type==='table');
 const warnings=blocks.filter(b=>b.type==='paragraph'&&b!==lead&&b!==suggestion&&/^(?:注意|口径|限制|没有成本|缺少|缺乏|无法|不能|样本|数据不足|limitations|caution|without|missing|cannot|small sample)/i.test(b.text.replace(/^\*\*/,'')));
 const warning=warnings[0];
 const focused=/客单价|均价|平均成交|average|排名|排行|rank/i.test(String(turn.user||'')+' '+text);
 // Show the original reasoning directly, preserving its order and wording.
 // Only long supplementary detail stays in the complete-answer disclosure.
 const reasoning=blocks.filter(b=>b!==lead&&b!==firstTable&&b!==warning&&b!==suggestion).slice(0,8);
 return `<div class="chat-answer chat-response response-structured">${lead?`<div class="response-lead">${renderAnswerBlocks([lead],en)}</div>`:''}${focused?'':facts(reports,en)}${firstTable&&(focused||reports.length<2)?renderAnswerBlocks([firstTable],en):''}${supplement?`<div class="response-visual">${supplement}</div>`:''}${reasoning.length?`<section class="response-reasoning" aria-label="${en?'What this means':'这些数字意味着什么'}">${renderAnswerBlocks(reasoning,en)}</section>`:''}${warning?`<aside class="response-warning"><span>${en?'Important context':'理解这些结果时要注意'}</span>${renderAnswerBlocks([warning],en)}</aside>`:''}${suggestion?`<aside class="response-next"><span>${en?'What to do next':'接下来先做什么'}</span>${renderAnswerBlocks([suggestion],en)}</aside>`:''}<details class="response-details" data-response-id="${esc(key)}" ${expanded?'open':''}><summary>${en?'Full answer, reasoning and limitations':'查看完整回答、分析依据与限制'}</summary><div class="response-full">${renderAnswerBlocks(blocks,en)}</div></details></div>`;
}
