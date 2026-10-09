const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 try {
 const page=await browser.newPage({permissions:['microphone'],reducedMotion:'reduce',viewport:{width:1440,height:1000}});
 await page.addInitScript(()=>localStorage.setItem('memora-demo-language','zh'));
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{ window.__streams=[]; const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia=async opts=>{const s=await original(opts);window.__streams.push(s);return s;}; });
 let pending, delayChat=false, delayVoice=false, calls=[];
 await page.route('**/functions/v1/sculpy-chat',async route=>{
 const b=route.request().postDataJSON();calls.push(b);
 if(delayChat)await new Promise(r=>pending=r);
 await route.fulfill({json:{turn:{id:b.requestId,user:b.message,answer:'已查看当前记录。',references:[],proposals:[],sourceIds:[]}}});
 });
 await page.route('**/functions/v1/sculpy-ai*',async route=>{assert.equal(new URL(route.request().url()).searchParams.get('action'),'transcribe');if(delayVoice)await new Promise(r=>pending=r);await route.fulfill({json:{text:'语音测试内容',provider:'openai'}});});
 const ready=async route=>{await page.evaluate(r=>location.hash=r,route);await page.waitForFunction(()=>document.querySelector('#main')?.dataset.route===location.hash);await page.locator('.chat-inline #chat-input:not(:disabled)').waitFor();};
 const waitPending=async()=>{await page.waitForFunction(()=>true);for(let i=0;i<100&&!pending;i++)await page.waitForTimeout(50);assert(pending);};
 await page.goto('http://localhost:4173/?demo=1#sculpy/b0');await page.locator('#chat-input:not(:disabled)').waitFor();
 assert.equal(await page.locator('#sculpy-search, #sculpy-text, [data-open-chat]').count(),0);
 assert.equal(await page.locator('.chat-launcher:visible, .memory-launcher:visible').count(),0);
 // Enter sends; shift-enter and IME confirmation never accidentally send.
 await page.locator('#chat-input').fill('第一行');await page.locator('#chat-input').press('Shift+Enter');assert.equal(calls.length,0);
 await page.locator('#chat-input').evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true})));assert.equal(calls.length,0);
 await page.locator('#chat-input').fill('这单要注意什么');await page.locator('#chat-input').press('Enter');await page.locator('.chat-assistant').waitFor();
 await page.locator('#chat-input').fill('接着上面说');await page.locator('#chat-input').press('Enter');await page.waitForFunction(()=>document.querySelectorAll('.chat-assistant').length===2&&!document.querySelector('#chat-input').disabled);assert.equal(calls[1].turns.length,1);
 await page.reload();await page.locator('#chat-input:not(:disabled)').waitFor();assert.equal(await page.locator('.chat-assistant').count(),2);
 // Changing order while a response is in flight must not display it in the new order.
 delayChat=true;await page.locator('#chat-input').fill('旧订单问题');await page.locator('#chat-input').press('Enter');await waitPending();await ready('sculpy/b1');pending();pending=null;delayChat=false;await page.waitForTimeout(150);assert.equal(await page.locator('.chat-assistant').count(),0);
 // Voice input uses the same composer and never auto-sends.
 let before=calls.length;await page.locator('#chat-voice').click();await page.getByRole('button',{name:'结束录音',exact:true}).waitFor();await page.locator('#chat-voice').click();await page.waitForFunction(()=>document.querySelector('#chat-input').value.includes('语音测试内容'));assert.equal(calls.length,before);
 await page.locator('#chat-input').fill('');delayVoice=true;await page.locator('#chat-voice').click();await page.getByRole('button',{name:'结束录音',exact:true}).waitFor();await page.locator('#chat-voice').click();await waitPending();await ready('sculpy/b2');pending();pending=null;delayVoice=false;await page.waitForTimeout(150);assert.equal(await page.locator('#chat-input').inputValue(),'');
 await page.locator('#chat-voice').click();await page.getByRole('button',{name:'结束录音',exact:true}).waitFor();await page.evaluate(()=>location.hash='bookings');await page.waitForTimeout(150);assert(await page.evaluate(()=>__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));
 // Existing deterministic demo chart stays in the same conversation.
 await ready('sculpy');await page.locator('#chat-input').fill('过去一个月服务收入饼图');await page.locator('#chat-input').press('Enter');await page.locator('.pie-chart').waitFor();assert((await page.locator('.slice-label').count())>0);
 await page.screenshot({path:'qa-screens/unified-chat-desktop.png'});
 await page.selectOption('#role','artist');await ready('sculpy');before=calls.length;await page.locator('#chat-input').fill('Mango');await page.locator('#chat-input').press('Enter');await page.locator('.chat-assistant:not(.chat-thinking)').waitFor();await page.locator('#chat-input:not(:disabled)').waitFor();assert.equal(calls.length,before+1);const catalog=calls.at(-1).catalog;assert(catalog.bookings.every(b=>b.artistIds.includes('michelle')&&!('price'in b)));
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);await page.screenshot({path:'qa-screens/unified-chat-mobile.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const box=await page.locator('[data-send]').boundingBox();assert(box.y+box.height<=844);
 assert.deepEqual(errors,[]);console.log('Unified chat: keyboard, IME, history, scoped requests, voice lifecycle, chart and mobile passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
