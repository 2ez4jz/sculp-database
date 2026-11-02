// Only a public, data-free offline page is cached. Business records, sessions,
// chat, photos and API responses always use their existing network/storage paths.
const CACHE = 'sculpy-install-offline-v1';
const offlineUrl = new URL('offline.html',self.registration.scope).href;
self.addEventListener('install',event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(new Request(offlineUrl,{cache:'reload'}))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('sculpy-install-offline-') && key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event => {
  if (event.request.method!=='GET' || event.request.mode!=='navigate' || new URL(event.request.url).origin!==self.location.origin) return;
  event.respondWith(fetch(event.request).catch(async()=> (await caches.open(CACHE)).match(offlineUrl).then(page=>page || new Response('Sculpy needs an internet connection. Please reconnect and reload.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}}))));
});

// Payloads and lock-screen text contain no customer or financial details.
const notificationIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 const id=notificationIdPattern.test(data.id||'')?data.id:null;
 const title=data.kind==='test'?'Sculpy 推送测试':data.kind==='overdue'?'有询盘等待跟进':data.kind==='new_enquiry'?(data.title==='收到新的婚礼询盘'?'收到新的婚礼询盘':'收到新的官网询盘'):'Sculpy 工作提醒';
 event.waitUntil(self.registration.showNotification(title,{body:'请打开 Sculpy 查看。',tag:id||'sculpy-work',renotify:false,
  icon:new URL('assets/sculpy-icon-192.png',self.registration.scope).href,data:{id}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const id=event.notification.data?.id;
 const url=new URL('./',self.registration.scope);if(notificationIdPattern.test(id||''))url.searchParams.set('notification',id);
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(c=>c.url.startsWith(self.registration.scope)&&new URL(c.url).searchParams.get('demo')!=='1');
  if(existing){existing.postMessage({type:'sculpy-open-notification',id});await existing.focus();}
  else await self.clients.openWindow(url.href);
 })());
});
self.addEventListener('pushsubscriptionchange',event=>{
 // Reconnection stays explicit; a worker never guesses the current signed-in user.
 event.waitUntil(self.clients.matchAll({type:'window'}).then(cs=>cs.forEach(c=>c.postMessage({type:'sculpy-push-reconnect'}))));
});
