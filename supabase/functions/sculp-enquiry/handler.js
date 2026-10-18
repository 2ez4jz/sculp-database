const origins=new Set(['https://sculpstudio.ca','https://www.sculpstudio.ca']);
export function makeEnquiryHandler(submit){return async req=>{
 const origin=req.headers.get('origin')||'',headers={'Content-Type':'application/json','Access-Control-Allow-Origin':origins.has(origin)?origin:'https://sculpstudio.ca','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'content-type','Vary':'Origin','Cache-Control':'no-store'};
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(!origins.has(origin))return reply({error:'origin_not_allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
 try{
  const reader=req.body?.getReader();if(!reader)return reply({error:'invalid_json'},400);
  let bytes=0,parts=[];while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>18000){await reader.cancel();return reply({error:'too_large'},413);}parts.push(value);}
  const raw=new Uint8Array(bytes);let offset=0;for(const p of parts){raw.set(p,offset);offset+=p.length;}
  let b;try{b=JSON.parse(new TextDecoder().decode(raw));}catch{return reply({error:'invalid_json'},400);}
  if(!b||typeof b!=='object'||Array.isArray(b))return reply({error:'invalid_data'},400);
  if(b._honey)return reply({ok:true});
  const cap=(v,n=300)=>typeof v==='string'?v.trim().slice(0,n):'';
  const name=cap(b.name,160),email=cap(b.email,254).toLowerCase(),service=cap(b.service,120),date=cap(b.date,10),location=cap(b.location,240);
  if(!name||!service||!location||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.submission_id||''))return reply({error:'invalid_fields'},400);
  if(date&&(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))return reply({error:'invalid_date'},400);
  const party=Number(b.party),row={submission_id:b.submission_id,name,email,service,contact:cap(b.contact,240),contact_method:cap(b.contact_method,50),artist:cap(b.artist,120),event_date:date||null,location,party_size:Number.isInteger(party)&&party>=1&&party<=1000?party:null,timing:cap(b.timing,200),details:cap(b.details,4500),utm_source:cap(b.utm_source,150),utm_medium:cap(b.utm_medium,150),utm_campaign:cap(b.utm_campaign,150),landing_referrer:cap(b.referrer,400)};
  const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip));
  const bucket=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  return reply(await submit(row,bucket));
 }catch(e){const code=e?.code;console.error('enquiry rejected',code||'transport');return reply({error:code==='P0429'?'rate_limited':code==='23505'?'submission_conflict':'save_failed'},code==='P0429'?429:code==='23505'?409:503);}
};}
