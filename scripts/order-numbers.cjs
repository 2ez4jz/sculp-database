const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try {
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});
   await page.goto('http://localhost:4173/?demo=1#bookings');
   const row=page.locator('#booking-results tbody tr').first();
   const number=await row.locator('td').nth(0).innerText();
   assert.match(number,/^6[01235678][012356789]{4}$/);
   assert.equal(await row.locator('td').nth(1).locator('a').count(),0);
   assert.match(await row.locator('td').nth(1).innerText(),/2026/);
   await row.locator('td').nth(0).locator('a').click();
   await page.getByText('BOOKING / '+number,{exact:true}).waitFor();
   await page.reload();await page.getByText('BOOKING / '+number,{exact:true}).waitFor();
   await page.goto('http://localhost:4173/?demo=1#bookings');
   await page.locator('#search').fill(number);await page.locator('#search').dispatchEvent('change');
   assert.equal(await page.locator('#booking-results tbody tr').count(),1);
   assert.equal(await page.locator('#booking-results tbody tr td').first().innerText(),number);
   await page.screenshot({path:'qa-screens/order-numbers-'+width+'.png'});
  }
  // Upgrade a browser-saved older demo booking, without changing its ID or links.
  await page.evaluate(async()=>{
   const {bookings}=await import('/src/data/demo.js?v=order-numbers-20261015');
   const state=JSON.parse(localStorage.getItem('sculp-memory-demo-300-v2')||'{}');
   const legacy={...bookings[0],id:'demo-legacy'};delete legacy.orderNumber;
   state.demoBookings=[legacy];localStorage.setItem('sculp-memory-demo-300-v2',JSON.stringify(state));
  });
  await page.goto('http://localhost:4173/?demo=1#bookings/demo-legacy');await page.reload();await page.locator('.detail-head').waitFor();
  const upgraded=await page.locator('.detail-head .eyebrow').innerText();
  assert.match(upgraded,/BOOKING \/ 6[01235678][012356789]{4}$/);
  await page.reload();await page.getByText(upgraded,{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sculp-memory-demo-300-v2')).demoBookings[0].id),'demo-legacy');
  assert.deepEqual(errors,[]);
  console.log('Order references: clickable number replaces date link, desktop/mobile, search, reload, legacy upgrade and stable internal IDs passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
