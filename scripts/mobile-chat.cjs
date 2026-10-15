const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 try{
  const context=await browser.newContext({permissions:['microphone']});
  const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('memora-demo-language','zh'));
  await page.route('**/functions/v1/sculpy-chat',async route=>{
   const body=route.request().postDataJSON();requests.push(body);
   const answer='你可以先看看这几笔订单。\n\n'+Array.from({length:7},(_,i)=>`第${i+1}点：把同类服务放在一起看，确认成交价和实际收到的钱有什么区别。`).join('\n\n')+'\n\n| 场地 | 平均成交价 | 已完成订单 | 参考说明 |\n|---|---:|---:|---|\n| Graydon Hall Manor | CAD 2,000.00 | 8 | 只比较同类服务 |\n| Four Seasons Toronto | CAD 1,000.00 | 6 | 不代表利润 |';
   await route.fulfill({json:{turn:{id:body.requestId,user:body.message,answer,references:[],proposals:[],sourceIds:[],modelProfile:{model:'mobile-test-model'},engine:'sdk'}}});
  });
  await page.route('**/functions/v1/sculpy-ai*',route=>route.fulfill({json:{text:'手机录音转写测试',provider:'openai'}}));
  for(const viewport of [{width:375,height:667},{width:390,height:844},{width:430,height:932}]){
   await page.setViewportSize(viewport);await page.goto('http://localhost:4173/?demo=1&mobile_layout_test='+viewport.width+'#sculpy');
   await page.locator('#chat-input:not(:disabled)').waitFor();
   const layout=await page.evaluate(()=>{
    const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,width:r.width};};
    return {dialog:box('.chat-dialog'),messages:box('.chat-messages'),composer:box('.chat-composer'),header:box('.chat-header'),focused:document.activeElement.id,overflow:document.documentElement.scrollWidth>innerWidth};
   });
   console.log('Mobile layout',viewport.width,JSON.stringify(layout));
   assert.equal(layout.focused==='chat-input',false,'opening the page must not summon the phone keyboard');
   assert.equal(layout.overflow,false);assert(layout.dialog.bottom<=viewport.height+1);
   assert(layout.messages.height>viewport.height*.55,'the transcript should occupy most of the screen');
   assert(layout.composer.height<125,'the idle input area should stay compact');
   assert(layout.header.height<90);assert.equal(await page.locator('.chat-preferences:visible').count(),0);
   await page.locator('[data-chat-menu]').click();assert.equal(await page.locator('[data-chat-menu]').getAttribute('aria-expanded'),'true');
   assert(await page.locator('[data-verbosity]').isVisible());await page.locator('[data-chat-menu]').click();
   await page.locator('#chat-input').fill('请用手机上容易读的方式解释');await page.locator('[data-send]').click();
   await page.locator('#chat-input:not(:disabled)').waitFor();
   assert(await page.locator('.chat-assistant').count()>0);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.locator('#chat-input').fill('第一行\n第二行\n第三行\n第四行');
   assert((await page.locator('#chat-input').boundingBox()).height<=128);
   await page.locator('#chat-input').fill('');
   const before=requests.length;await page.locator('#chat-voice').click();
   await page.getByRole('button',{name:'结束录音',exact:true}).waitFor();
   assert.equal(await page.locator('#chat-voice').getAttribute('aria-pressed'),'true');
   await page.locator('#chat-voice').click();await page.waitForFunction(()=>document.querySelector('#chat-input').value.includes('手机录音转写测试'));
   assert.equal(requests.length,before,'recording transcribes without sending');
   await page.locator('#chat-input').fill('');
   await page.screenshot({path:'qa-screens/mobile-chat-'+viewport.width+'.png'});
  }
  // A visualViewport test exercises keyboard resize/pan events without claiming
  // to reproduce a physical iPhone keyboard or its browser chrome.
  await page.addInitScript(()=>{
   const viewport=new EventTarget();Object.assign(viewport,{height:innerHeight,width:innerWidth,offsetTop:0,offsetLeft:0,scale:1});
   Object.defineProperty(window,'visualViewport',{value:viewport,configurable:true});
   window.testKeyboard=(height,offsetTop)=>{Object.assign(viewport,{height,offsetTop});viewport.dispatchEvent(new Event('resize'));};
  });
  await page.setViewportSize({width:390,height:844});await page.reload();await page.locator('#chat-input:not(:disabled)').waitFor();
  await page.evaluate(()=>window.testKeyboard(420,48));
  await page.waitForFunction(()=>Math.round(document.querySelector('.chat-dialog').getBoundingClientRect().height)===420);
  const keyboard=await page.locator('.chat-composer').boundingBox();assert(keyboard.y+keyboard.height<=468);
  assert(await page.locator('[data-send]').isVisible());await page.screenshot({path:'qa-screens/mobile-chat-keyboard-simulation.png'});
  await page.evaluate(()=>window.testKeyboard(844,0));
  await page.locator('#menu').click();await page.locator('#nav a[href="#bookings"]').click();
  await page.locator('#booking-results').waitFor();assert(await page.locator('#role').isVisible());
  assert.deepEqual(errors,[]);
  console.log('Mobile chat: compact header/input, transcript space, settings menu, long answers/tables, voice review, viewport resize, navigation and no overflow passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
