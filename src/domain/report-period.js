// Calendar periods, anchored to the user's Toronto date, independent of fixture dates.
export function torontoMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Toronto',year:'numeric',month:'2-digit'}).formatToParts(now);
  return parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value;
}
const valid = m => /^20\d{2}-(0[1-9]|1[0-2])$/.test(m);
function shift(month, delta) {
  const [y,m]=month.split('-').map(Number);
  return new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);
}
function range(first,last) {
  const rows=[];
  for(let m=first;m<=last&&rows.length<13;m=shift(m,1))rows.push(m);
  return rows.length<=12&&rows.every(valid)?rows:[];
}
export function reportMonths(message, anchor=torontoMonth()) {
  if(!valid(anchor))throw RangeError('Invalid calendar anchor');
  const q=String(message||'');
  const explicit=[...q.matchAll(/20\d{2}-(?:0[1-9]|1[0-2])(?!\d)/g)].map(m=>m[0]);
  if(explicit.length) {
    const months=[...new Set(explicit)].sort();
    if(months.length===2&&/(?:至|到|~|–|—|\bto\b|through)/i.test(q))return range(months[0],months[1]);
    return months.slice(0,12);
  }
  const year=q.match(/(20\d{2})\s*年?/)?.[1]||anchor.slice(0,4);
  const numeric=[...q.matchAll(/(?:^|[^\d])([1-9]|1[0-2])\s*月/g)].map(m=>year+'-'+m[1].padStart(2,'0'));
  const names=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const named=names.flatMap((name,i)=>new RegExp('\\b'+name+'\\b','i').test(q)?[year+'-'+String(i+1).padStart(2,'0')]:[]);
  if(numeric.length||named.length)return [...new Set([...numeric,...named])].sort();
  if(/上(?:一)?个?月|last month|previous month/i.test(q))return [shift(anchor,-1)];
  if(/本月|这个月|当月|this month|current month/i.test(q))return [anchor];
  const countMatch=q.match(/(?:最近|过去|近|last|past)\s*([一二三四五六七八九十]|十二|十一|\d+)\s*(?:个)?(?:月|months?)/i);
  if(countMatch) {
    const n=Number(({一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,十一:11,十二:12})[countMatch[1]]||countMatch[1]);
    return n>=1&&n<=12?range(shift(anchor,1-n),anchor):[];
  }
  if(/全年|年度|一年|今年|去年|\byear\b|annual/i.test(q)) {
    const y=/去年|last year/i.test(q)?Number(anchor.slice(0,4))-1:Number(year);
    return range(y+'-01',y+'-12');
  }
  const quarter=q.match(/(?:第?([1-4一二三四])季度|Q([1-4]))/i);
  if(quarter||/季度|quarter/i.test(q)) {
    let base=anchor;
    if(/上(?:个)?季度|last quarter|previous quarter/i.test(q))base=shift(anchor,-3);
    const n=quarter?Number(({一:1,二:2,三:3,四:4})[quarter[1]]||quarter[1]||quarter[2]):Math.ceil(Number(base.slice(5))/3);
    const y=quarter?year:base.slice(0,4);
    const first=y+'-'+String(n*3-2).padStart(2,'0');
    return range(first,shift(first,2));
  }
  return range(shift(anchor,-2),anchor);
}
