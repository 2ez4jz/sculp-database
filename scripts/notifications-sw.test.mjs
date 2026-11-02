import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8'),id='35000000-0000-4000-8000-000000000201';
function worker(windows=[]){
 const listeners={},shown=[],opened=[],messages=[];
 const self={registration:{scope:'https://2ez4jz.github.io/sculp-database/',showNotification:async(title,options)=>shown.push({title,options})},
  addEventListener:(name,fn)=>listeners[name]=fn,clients:{matchAll:async()=>windows,openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(source,{self,URL,Response,Request});return {listeners,shown,opened,messages};
}
async function event(fn,data){let pending;fn({...data,waitUntil:p=>{pending=p;}});await pending;}
test('service worker uses generic lock-screen content, a stable tag, and a trusted login-protected notification route',async()=>{
 const w=worker();await event(w.listeners.push,{data:{json:()=>({id,kind:'new_enquiry',title:'PRIVATE CLIENT NAME',body:'PRIVATE ADDRESS AND MONEY',url:'https://evil.test'})}});
 assert.equal(w.shown[0].title,'收到新的官网询盘');assert.equal(w.shown[0].options.body,'请打开 Sculpy 查看。');assert.equal(w.shown[0].options.tag,id);assert.equal(w.shown[0].options.renotify,false);
 assert(!JSON.stringify(w.shown).includes('PRIVATE'));assert.deepEqual(Object.keys(w.shown[0].options.data),['id']);
 await event(w.listeners.notificationclick,{notification:{data:{id,url:'https://evil.test'},close(){}}});
 assert.equal(w.opened[0],`https://2ez4jz.github.io/sculp-database/?notification=${id}`);
 await event(w.listeners.push,{data:{json(){throw Error('malformed');}}});assert.equal(w.shown[1].title,'Sculpy 工作提醒');
});
test('existing app windows receive an ID instead of a forced navigation that could discard business drafts',async()=>{
 const messages=[];let focused=false;
 const w=worker([{url:'https://2ez4jz.github.io/sculp-database/?app=1',postMessage:x=>messages.push(x),focus:async()=>{focused=true;}}]);
 await event(w.listeners.notificationclick,{notification:{data:{id},close(){}}});
 assert(focused);assert.equal(w.opened.length,0);assert.equal(messages[0].type,'sculpy-open-notification');assert.equal(messages[0].id,id);
 const demo=worker([{url:'https://2ez4jz.github.io/sculp-database/?demo=1',postMessage(){throw Error('Demo must not receive business notice');}}]);
 await event(demo.listeners.notificationclick,{notification:{data:{id},close(){}}});assert.equal(demo.opened.length,1);
});
