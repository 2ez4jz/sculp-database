import {config} from '../config.js';
const storageKey='sculpy-production-push-device-v25';
export function pushSupport(){
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 if(ios&&!standalone)return {supported:false,message:'请从 iPhone 主屏幕打开 Sculpy，再开启通知。'};
 if(!isSecureContext||!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))return {supported:false,message:'当前浏览器暂不支持推送，请使用支持 Web Push 的浏览器。'};
 return {supported:true,message:'由你主动开启，锁屏只显示通用工作提醒。'};
}
export async function notificationApi(supabase,action,data={}){
 const result=await supabase.auth.getSession();const token=result.data?.session?.access_token;
 if(!token)throw Error('请重新登录后设置通知。');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch(`${config.supabaseUrl}/functions/v1/sculpy-notifications`,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:config.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({action,data}),signal:controller.signal});
  const value=await response.json();if(!response.ok)throw Error(value.error||'通知操作暂未完成，请稍后重试。');return value;
 }catch(error){if(error.name==='AbortError')throw Error('通知连接超时，请稍后重试。');if(error instanceof TypeError||error instanceof SyntaxError)throw Error('通知连接暂时不可用，请稍后重试。');throw error;}finally{clearTimeout(timer);}
}
export function currentDeviceId(userId){try{const x=JSON.parse(localStorage.getItem(storageKey)||'null');return x?.userId===userId?x.deviceId:null;}catch{return null;}}
export async function preparePush(){
 if(!pushSupport().supported)return null;
 let timer;
 try{return await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('通知组件尚未就绪，请稍后重新打开设置。')),8000);})]);}finally{clearTimeout(timer);}
}
function publicKeyBytes(key){const s=key.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(s.padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));}
export async function enableDevice({registration,subscription,publicKey,supabase,profile}){
 if(!registration||!publicKey)throw Error('通知组件尚未就绪，请稍后重试。');
 // subscribe runs before the first await, directly in the user's click handler.
 const pending=subscription||registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKeyBytes(publicKey)});
 const sub=await pending;
 const result=await notificationApi(supabase,'subscribe',{subscription:sub.toJSON(),label:/iPhone|iPad/.test(navigator.userAgent)?'iPhone / iPad':'桌面或浏览器设备'});
 try{localStorage.setItem(storageKey,JSON.stringify({userId:profile.id,deviceId:result.deviceId}));}catch{}
 return sub;
}
export async function localPushCleanup(){
 try{localStorage.removeItem(storageKey);}catch{}
 try{const r=await navigator.serviceWorker?.getRegistration();await r?.pushManager?.getSubscription().then(s=>s?.unsubscribe());const notices=await r?.getNotifications();notices?.forEach(n=>n.close());}catch{}
}
export async function disableDevice(supabase,profile){
 const id=currentDeviceId(profile.id);let error;
 try{if(id)await notificationApi(supabase,'unsubscribe',{deviceId:id});else {const sub=await (await navigator.serviceWorker?.getRegistration())?.pushManager?.getSubscription();await notificationApi(supabase,'logout',{endpoint:sub?.endpoint});}}catch(e){error=e;}
 await localPushCleanup();if(error)throw Error('本机已尝试关闭，云端状态暂未确认，请稍后重新检查。');
}
export async function logoutPush(supabase,profile){
 let timer;
 try{
  await Promise.race([(async()=>{
   let endpoint;try{endpoint=(await (await navigator.serviceWorker?.getRegistration())?.pushManager?.getSubscription())?.endpoint;}catch{}
   await notificationApi(supabase,'logout',{deviceId:currentDeviceId(profile.id),endpoint});
  })(),new Promise(resolve=>{timer=setTimeout(resolve,2500);})]);
 }catch{}finally{clearTimeout(timer);void localPushCleanup();}
}
