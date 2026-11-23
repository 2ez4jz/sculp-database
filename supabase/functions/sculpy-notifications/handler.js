const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const endpointHosts=/^(?:fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|(?:[a-z0-9-]+\.)*push\.apple\.com|(?:[a-z0-9-]+\.)*notify\.windows\.com)$/i;
export function validEndpoint(value){
 try{const u=new URL(value);return value.length<=2048&&u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.port&&endpointHosts.test(u.hostname)&&u.pathname.length>1;}catch{return false;}
}
function decode(value){const s=value.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(s.padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));}
export async function validateSubscription(sub){
 if(!sub||!validEndpoint(sub.endpoint)||!/^[A-Za-z0-9_-]{87}$/.test(sub.keys?.p256dh||'')||!/^[A-Za-z0-9_-]{22}$/.test(sub.keys?.auth||''))throw Error('subscription');
 const key=decode(sub.keys.p256dh);if(key.length!==65||key[0]!==4||decode(sub.keys.auth).length!==16)throw Error('subscription');
 await crypto.subtle.importKey('raw',key,{name:'ECDH',namedCurve:'P-256'},false,[]);
}
export async function readBody(request){
 const reader=request.body?.getReader();if(!reader)return {};
 const chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();throw Object.assign(Error('body'),{status:413});}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const x of chunks){bytes.set(x,offset);offset+=x.length;}
 try{const x=JSON.parse(new TextDecoder().decode(bytes)||'{}');if(!x||typeof x!=='object'||Array.isArray(x))throw Error();return x;}catch{throw Object.assign(Error('body'),{status:400});}
}
export function deliveryOutcome(status,retryAfter){
 const seconds=/^\d+$/.test(retryAfter||'')?Math.min(3600,Number(retryAfter)):0;
 return {result:status>=200&&status<300?'accepted':[404,410].includes(status)?'gone':status===0||status===408||status===429||status>=500?'retry':'failed',code:status?`http_${status}`:'network',retryAfter:seconds};
}
function pushText(value, length) {
 if (typeof value!=='string') return '';
 return Array.from(value.replace(/[\u0000-\u001f\u007f]/g,' ').trim()).slice(0,length).join('');
}
const zoneLabels={'Asia/Shanghai':'北京时间','America/Toronto':'多伦多时间','America/Vancouver':'温哥华时间'};
function itineraryPlace(detail) {
 if (typeof detail.place!=='string') return '';
 const [first]=detail.place.split(/[\r\n·；;]/,1);
 const airport=detail.category==='flight' && first.match(/\b([A-Z]{3})\b(?:[\s,，]+(T\d{1,2}[A-Z]?)\b)?/);
 if (airport) return [airport[1],airport[2]].filter(Boolean).join(' ');
 const [name]=first.trim().split(/[,，]/,1);
 if (/^\d+\s|(?:路|街|巷|道|弄)\s*\d/.test(name)) return '';
 return pushText(name,32);
}
function itineraryPayload(notice) {
 const detail=notice.itinerary;
 if (!detail || !UUID.test(notice.id) || !Number.isInteger(detail.ttl) || detail.ttl<1 || detail.ttl>300) return null;
 const title=pushText(detail.title,64), time=pushText(detail.time,20), zone=pushText(detail.zone,65);
 if (!title || !time || !zone) return null;
 const label=detail.category==='flight'?(detail.moment==='end'?'到达':'起飞'):
  detail.category==='hotel'?(detail.moment==='end'?'退房':'入住'):(detail.moment==='end'?'结束':'开始');
 const flight=detail.category==='flight' ? pushText(detail.flight,12) : '';
 const subject=flight&&!title.toUpperCase().includes(flight.toUpperCase()) ? `${flight} ${title}` : title;
 const place=itineraryPlace(detail);
 const body=[`${time} ${zoneLabels[zone]||zone}${label}`,place&&!subject.includes(place)?place:''].filter(Boolean).join(' · ');
 return {
  ttl:detail.ttl,
  payload:{id:notice.id,kind:'itinerary',title:`${detail.alert==='evening'?'前夜提醒':'行程提醒'} · ${subject}`,body},
 };
}

// Dependencies keep credentials out of tests and let the transport use fetch on Edge.
export function notificationHandler({admin,callerFor,allowedOrigins,generateKeys,sendPush}){
 const server=async(action,data={})=>{const r=await admin.rpc('sculpy_push_server',{p_action:action,p_data:data});if(r.error)throw r.error;return r.data;};
 async function identity(){let value=await server('identity');if(!value.publicKey)value=await server('identity',generateKeys());if(!value.publicKey||!value.privateKey)throw Error('identity');return value;}
 async function dispatch(){
  const tick=await server('tick');if(!tick.enabled)return {paused:true,claimed:0};
  const keys=await identity(),batch=await server('claim');let offset=0,accepted=0;
  async function lane(){while(offset<batch.items.length){const item=batch.items[offset++];
   const prepared=await server('prepare',item);if(!prepared.notification)continue;
   let outcome;
   try{
    if(!validEndpoint(prepared.subscription?.endpoint))outcome={result:'failed',code:'invalid_endpoint'};
    else{
     const n=prepared.notification;
     // Only an opted-in itinerary carries details. Business notices stay generic.
     const title=n.kind==='test'?'Sculpy 推送测试':n.kind==='marketing_mention'?'有新的社媒任务留言':n.kind==='agenda_mention'?'有人在日程留言中 @ 你':n.kind==='overdue'?'有询盘等待跟进':n.title==='收到新的婚礼询盘'?'收到新的婚礼询盘':'收到新的官网询盘';
     // Older installed workers display full text for itinerary payloads.
     const systemNotice=n.kind==='system_notice' && UUID.test(n.id) && Number.isInteger(n.ttl) && n.ttl>0;
     const message=n.kind==='system_notice'
      ? systemNotice && {ttl:Math.min(n.ttl,43200),payload:{id:n.id,kind:'itinerary',systemNotice:true,title:n.title,body:n.body,expiresAt:n.expiresAt}}
      : n.kind==='itinerary'?itineraryPayload(n):{payload:{id:n.id,kind:n.kind,title,body:'请打开 Sculpy 查看。'}};
     if (!message) outcome={result:'failed',code:n.kind==='system_notice'?'notice_expired':'itinerary_unavailable'};
     else {
      const response=await sendPush({subscription:prepared.subscription,...message,keys,topic:n.id.replace(/-/g,'')});
      outcome=deliveryOutcome(response.status,response.retryAfter);
     }
    }
   }catch(error){outcome=error?.kind==='encoding'?{result:'failed',code:'encoding_failed'}:deliveryOutcome(0);}
   await server('finish',{...item,...outcome});if(outcome.result==='accepted')accepted++;
  }}
  await Promise.all(Array.from({length:Math.min(3,batch.items.length)},lane));return {claimed:batch.items.length,accepted};
 }
 return async request=>{
  const worker=new URL(request.url).searchParams.get('worker')==='1',origin=request.headers.get('origin')||'';
  const headers={'Content-Type':'application/json','Cache-Control':'no-store',Vary:'Origin',...(allowedOrigins.has(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'}:{})};
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(!worker&&!allowedOrigins.has(origin))return reply({error:'Origin not allowed'},403);
  if(!worker&&request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  try{
   if(worker){
    const key=request.headers.get('x-sculpy-worker-key')||'';
    if(!/^[a-f0-9]{64}$/.test(key)||!(await server('authorize_worker',{key})).authorized)return reply({error:'Unauthorized'},401);
    return reply(await dispatch());
   }
   const auth=request.headers.get('authorization')||'';if(!auth.startsWith('Bearer '))return reply({error:'请重新登录。'},401);
   const caller=callerFor(auth),userResult=await caller.auth.getUser();const user=userResult.data?.user;
   if(userResult.error||!user)return reply({error:'请重新登录。'},401);
   let session;try{session=JSON.parse(new TextDecoder().decode(decode(auth.slice(7).split('.')[1]))).session_id;}catch{}
   if(!UUID.test(session||''))return reply({error:'请重新登录后设置通知。'},401);
   const body=await readBody(request);
   if(Object.keys(body).some(k=>!['action','data'].includes(k))||!['state','preferences','subscribe','unsubscribe','logout','history','open','test','global','diagnostics'].includes(body.action))return reply({error:'请求格式错误。'},400);
   const data=body.data??{};if(!data||typeof data!=='object'||Array.isArray(data))return reply({error:'请求格式错误。'},400);
   if(body.action==='subscribe'){try{await validateSubscription(data.subscription);}catch{return reply({error:'设备订阅无效，请重新开启推送。'},400);}}
   if(['open','test','unsubscribe'].includes(body.action)&&!UUID.test(data[body.action==='open'?'id':'deviceId']||''))return reply({error:'通知或设备编号无效。'},400);
   if(body.action==='logout'){data.deviceId=UUID.test(data.deviceId||'')?data.deviceId:null;data.endpoint=validEndpoint(data.endpoint)?data.endpoint:null;}
   if(body.action==='open'){
     const marketing=await admin.rpc('sculpy_marketing_open_notification',{p_id:data.id,p_actor:user.id});
     if(marketing.error)return reply({error:'通知操作失败，请稍后重试。'},503);
     if(marketing.data)return reply(marketing.data);
   }
   const result=await admin.rpc('sculpy_push_api',{p_action:body.action,p_actor:user.id,p_session:session,p_data:data});
   if(result.error){const code=result.error.code;return reply({error:code==='42501'?'当前账号或会话无权执行此操作。':code==='P0429'?'请稍等一分钟再测试。':code==='55000'?'通知服务暂未就绪。':'通知操作失败，请检查内容或稍后重试。'},code==='42501'?403:code==='P0429'?429:code==='55000'?503:400);}
   if(body.action==='state')result.data.publicKey=(await identity()).publicKey;
   return reply(result.data);
  }catch(error){const status=[400,413].includes(error?.status)?error.status:503;return reply({error:status===413?'请求过大。':status===400?'请求格式错误。':'通知服务暂时不可用，请稍后重试。'},status);}
 };
}
