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
 const labels=en?['Completed service value','Gross receipts','Completed orders']:['完成订单金额','到账原额','已完成订单'];
 const data=reports.length===1?`<div class="response-metrics">${[money(reports[0].completedAmountCents),money(reports[0].grossReceivedCents),String(reports[0].completed)].map((v,i)=>`<div class="response-metric"><span>${labels[i]}</span><strong>${esc(v)}</strong></div>`).join('')}</div>`:table([en?'Period / filter':'期间／筛选',...labels],reports.map(r=>[scope(r),money(r.completedAmountCents),money(r.grossReceivedCents),String(r.completed)]),en?'Verified comparison':'已核验数据对比');
 const limits=[en?'Fictional data. Completed value uses service dates; receipts use payment dates before refunds. Neither is profit.':'虚构数据。完成金额按服务日期；到账原额按收款日期、未扣退款。两者均非利润。'];
 if(reports.some(r=>r.unpricedCompleted||r.nonCadCompleted))limits.push(en?'Missing prices or non-CAD amounts: totals are incomplete.':'有缺价或非 CAD 订单，金额合计不完整。');
 if(reports.some(r=>r.filters.to>r.asOfDate&&r.catalogQuality?.futureCompleted))limits.push(en?'Future-dated completed statuses require review.':'含未来日期范围，完成状态需核对，不能作为截至今天业绩。');
 return `<section class="response-facts" aria-label="${en?'Verified figures':'已核验数字'}"><div class="response-section-label">${en?'KEY FIGURES':'关键数字'} <span>${en?'Fictional demo':'虚构测试'}</span></div>${reports.length===1?`<p class="response-scope">${esc(scope(reports[0]))}</p>`:''}${data}<p class="response-basis">${limits.map(esc).join(' ')}</p></section>`;
}
export function renderChatAnswer(turn,supplement='',{expanded=false,key=turn.id||''}={}){
 const text=String(turn.answer||''),en=!/\p{Script=Han}/u.test(text),blocks=answerBlocks(text);
 const complex=text.length>360||blocks.some(b=>b.type==='table')||blocks.length>3;
 if(!complex)return `<div class="chat-answer chat-response response-simple">${renderAnswerBlocks(blocks,en)}</div>${supplement}`;
 const reports=verifiedReports(turn),lead=blocks.find(b=>b.type==='paragraph'),suggestion=[...blocks].reverse().find(b=>b.type==='paragraph'&&b!==lead&&/建议|下一步|suggest|recommend|next step/i.test(b.text));
 const firstTable=blocks.find(b=>b.type==='table');
 const warnings=blocks.filter(b=>b.type==='paragraph'&&b!==lead&&b!==suggestion&&/无法|不能|不足|缺少|缺乏|不代表|cannot|not enough|missing|unknown/i.test(b.text));
 const warning=warnings.find(b=>/成本|缺少|缺乏|无法|不足|cannot|not enough|missing|unknown/i.test(b.text))||warnings[0];
 // Nothing is lost: the original complete answer remains available, including all caveats.
 return `<div class="chat-answer chat-response response-structured">${lead?`<div class="response-lead">${renderAnswerBlocks([lead],en)}</div>`:''}${facts(reports,en)}${firstTable&&reports.length<2?renderAnswerBlocks([firstTable],en):''}${supplement?`<div class="response-visual">${supplement}</div>`:''}${warning?`<aside class="response-warning"><span>${en?'Limitations':'注意口径'}</span>${renderAnswerBlocks([warning],en)}</aside>`:''}${suggestion?`<aside class="response-next"><span>${en?'Suggested check':'建议核查'}</span>${renderAnswerBlocks([suggestion],en)}</aside>`:''}<details class="response-details" data-response-id="${esc(key)}" ${expanded?'open':''}><summary>${en?'Full answer, reasoning and limitations':'查看完整回答、分析依据与限制'}</summary><div class="response-full">${renderAnswerBlocks(blocks,en)}</div></details></div>`;
}
