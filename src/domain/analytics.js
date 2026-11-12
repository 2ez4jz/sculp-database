// Pure calculation: callers supply only records they may report on.
const torontoToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const validDate=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export function serviceRevenue(records,serviceNames,{today=torontoToday(),anchorToLatest=false}={}){
 const completed=records.filter(b=>b.status==='Completed'&&validDate(b.date)).sort((a,b)=>b.date.localeCompare(a.date));
 const end=new Date((anchorToLatest?completed[0]?.date||today:today)+'T12:00:00Z');
 const start=new Date(end);start.setUTCDate(start.getUTCDate()-29);
 const sums={};let unpriced=0;
 for(const b of completed){
  const date=new Date(b.date+'T12:00:00Z');if(date<start||date>end)continue;
  const cents=typeof b.price==='number'?Math.round(b.price*100):null;
  if(!Number.isSafeInteger(cents)||cents<0||Math.abs(b.price*100-cents)>1e-6||b.currency&&b.currency!=='CAD'){unpriced++;continue;}
  sums[b.service]=(sums[b.service]||0)+cents;
 }
 const rows=Object.entries(sums).map(([service,cents])=>({label:serviceNames[service]||service,value:cents/100})).sort((a,b)=>b.value-a.value);
 const total=Object.values(sums).reduce((a,b)=>a+b,0)/100;
 return {rows,total,start,end,unpriced};
}
