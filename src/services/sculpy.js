import {config,apiUrl} from '../config.js';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const example='今天 Sarah 整体挺满意的，她最喜欢轻薄底妆，不过第一次睫毛有点重，后来换轻了。她说十二月份公司有晚宴。摄影是 Mango。';

async function request(action,options={}){
 const response=await fetch(apiUrl(action),options);
 if(!response.ok){const body=await response.json().catch(()=>null);throw new Error(body?.error||`Request failed: ${response.status}`)}
 return response.json();
}

export async function transcribeAudio(blob){
 if(config.aiMode==='mock'){
  await wait(450);
  return {text:example,provider:'mock',durationEstimate:null};
 }
 const form=new FormData();
 form.append('audio',blob,`sculpy-${Date.now()}.webm`);
 return request('transcribe',{method:'POST',body:form});
}

export async function extractMemory(payload){
 if(config.aiMode==='mock'){
  await wait(350);
  const raw=payload.rawText||'';
  const isExample=/Sarah|轻薄底妆|Mango/i.test(raw);
  return {
   summary:isExample?'喜欢轻薄底妆；更换轻量睫毛后满意。摄影合作方为 Mango Studios。':'已保留完整原话，等待员工确认摘要。',
   preferences:isExample?['喜欢轻薄底妆','不喜欢厚重睫毛']:[],
   opportunities:isExample?['提到十二月公司晚宴，待确认日期。']:[],
   confidence:isExample?.94:.55,
   provider:'mock'
  };
 }
 return request('extract',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
}

export async function searchMemory(query,catalog){
 if(config.aiMode!=='mock')return request('search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,catalog})});
 await wait(250);
 const terms=query.toLowerCase().split(/\s+/).filter(Boolean);
 const results=[];
 for(const b of catalog.bookings){
  const hay=`${b.label} ${b.searchText}`.toLowerCase();
  if(terms.some(term=>hay.includes(term)))results.push({kind:'booking',id:b.id,label:b.label,reason:'相关场次'});
 }
 for(const p of catalog.partners)if(terms.some(term=>`${p.name} ${p.type}`.toLowerCase().includes(term)))results.push({kind:'partner',id:p.id,label:p.name,reason:`${p.type} · 合作档案`});
 for(const a of catalog.artists)if(terms.some(term=>`${a.name} ${a.level} ${(a.specialties||[]).join(' ')}`.toLowerCase().includes(term)))results.push({kind:'artist',id:a.id,label:a.name,reason:a.level});
 if(terms.some(term=>/十二月|晚宴|轻薄|睫毛/.test(term)))for(const n of catalog.notes.filter(n=>terms.some(term=>`${n.rawText} ${n.aiSummary}`.toLowerCase().includes(term))).slice(0,4))results.push({kind:'booking',id:n.entityId,label:'相关工作记录',reason:'原话或摘要匹配'});
 return {answer:results.length?`找到 ${results.length} 条相关记录。当前为受控 Mock 搜索，正式版将由服务端权限过滤后查询。`:'暂时没有找到直接匹配的记录。可以尝试客户姓名、合作方、化妆师或“未完成日志”。',results:results.slice(0,8),provider:'mock'};
}

export {example as sculpyExample};

// Existing deployments still return the compatible summary/preferences/opportunities shape.
export async function extractContextMemory({rawText,entity,related}) {
 if(config.aiMode==='mock')return {summary:rawText,preferences:[],opportunities:[],provider:'mock',warnings:['Mock 模式保留原话，请手动添加需要关联的保存项。']};
 return request('extract',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rawText,bookingId:entity.type==='booking'?entity.id:null,pageContext:{mode:'context_memory',entity,related}})});
}
