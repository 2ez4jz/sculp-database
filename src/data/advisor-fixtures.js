// Entirely fictional, deterministic, browser/server-compatible test fixtures. Not production data.
export const FIXTURE_VERSION = 'sculp-300-v1';
const schedule = [2,2,4,6,12,16,19,18,12,5,2,2];
const serviceCounts = {bridal:100,occasion:110,lesson:60,commercial:30};
const artists = ['Miranda','Emily','Giselle','Elaine','Angelina','Michelle'];
const channels = ['Instagram','Google','Planner','Referral','Website'];
const pad = n=>String(n).padStart(2,'0');
export function generateAdvisorFixtures() {
  let state=271828;
  const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296};
  const results=[];
  let serial=0;
  function add(service,month,day,hour,extra={}) {
    const id=++serial;
    const artist=artists[Math.floor(random()*artists.length)];
    const channel=channels[Math.floor(random()*channels.length)];
    const status=id%19===0?'cancelled':id%11===0?'inquiry':id%7===0?'confirmed':'completed';
    const base={bridal:1650,occasion:425,lesson:180,commercial:700}[service];
    const amountCents= Math.round((base+(Math.floor(random()*5)-2)*40)*100);
    const start=`2026-${pad(month)}-${pad(day)}T${pad(hour)}:00:00-04:00`;
    results.push({id:`fixture-${pad(id)}`,clientId:`fictional-client-${pad(id)}`,service,artist,channel,status,startLocal:start,month:`2026-${pad(month)}`,amountCents:status==='cancelled'?0:amountCents,paidCents:status==='completed'&&id%5!==0?amountCents:0,fictional:true,...extra});
  }
  for(let m=1;m<=12;m++) for(let k=0;k<schedule[m-1];k++) add('bridal',m,1+((k*7+4)%28),8+(k%4));
  for(let k=0;k<110;k++) {const m=(k%12)+1;add('occasion',m,1+((k*9)%28),10+(k%8));}
  // 52 Wednesday evening weekly classes and 8 additional monthly second-Sunday classes.
  const wednesdays=[];
  for(let t=0;t<365;t++){const d=new Date(Date.UTC(2026,0,1+t));if(d.getUTCDay()===3)wednesdays.push([d.getUTCMonth()+1,d.getUTCDate()]);}
  for(const [m,d] of wednesdays) add('lesson',m,d,18,{classSchedule:'weekly-wednesday-18'});
  for(let m=1;m<=8;m++){const first=new Date(Date.UTC(2026,m-1,1)).getUTCDay();const secondSunday=1+((7-first)%7)+7;add('lesson',m,secondSunday,13,{classSchedule:'monthly-second-sunday-13'});}
  for(let k=0;k<30;k++)add('commercial',1+(k%12),1+((k*11)%28),9+(k%7));
  return results.sort((a,b)=>a.startLocal.localeCompare(b.startLocal)||a.id.localeCompare(b.id));
}
export function fixtureSummary(records) {
  const counts={bridal:0,occasion:0,lesson:0,commercial:0};
  const months=Array(12).fill(0),channelsSummary={};
  let completedCents=0,paidCents=0;
  for(const row of records){
    if(!Object.hasOwn(counts,row.service)||!/^2026-(0[1-9]|1[0-2])$/.test(row.month))throw Error('Invalid fictional fixture');
    counts[row.service]++;if(row.service==='bridal')months[Number(row.month.slice(5))-1]++;
    if(row.status==='completed')completedCents+=row.amountCents;
    paidCents+=row.paidCents;
    channelsSummary[row.channel]=(channelsSummary[row.channel]??0)+1;
  }
  return {total:records.length,counts,bridalByMonth:months,completedCents,paidCents,channelsSummary};
}
