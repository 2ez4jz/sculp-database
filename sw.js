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
