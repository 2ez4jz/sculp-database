const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('memora-demo-language','zh'));
  const go=async route=>{
   await page.goto('http://localhost:4173/?demo=1#'+route,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(r=>document.querySelector('#main')?.dataset.route==='#'+r,route);
  };
  const routes=['bookings','bookings/b0','clients','clients/c0','artists','artists/miranda','venues','venues/graydon','partners','partners/mango','channels','media','insights','dashboard','settings','sculpy'];
  for(const viewport of [{width:375,height:667},{width:390,height:844},{width:430,height:932}]){
   await page.setViewportSize(viewport);
   for(const route of routes){
    await go(route);
    if(route==='sculpy')await page.locator('#chat-input:not(:disabled)').waitFor();
    const layout=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,
     headings:[...document.querySelectorAll('#main h1')].map(h=>parseFloat(getComputedStyle(h).fontSize))}));
    assert(layout.width<=layout.viewport+1,route+' overflows at '+viewport.width);
    assert(layout.headings.every(n=>n<=28),route+' has oversized title');
    if(['bookings','clients','artists','venues','partners','channels','media','insights','dashboard','settings','sculpy'].includes(route))
     await page.screenshot({path:'qa-screens/compact-'+route+'-'+viewport.width+'.png'});
    if(route==='bookings'){
     const stats=await page.locator('.stats').boundingBox(),feature=await page.locator('.feature').boundingBox();
     const first=await page.locator('.booking-table tr').nth(1).boundingBox();
     console.log('Phone bookings',JSON.stringify({width:viewport.width,statsHeight:stats.height,featureHeight:feature.height,firstOrderTop:first.y}));
     assert(stats.height<95);assert(feature.height<145);assert(first.y<viewport.height,'first order should be reachable in the first screen');
     assert((await page.locator('.topbar').boundingBox()).height<65,'phone navigation should stay in one compact row');
     assert.equal(await page.locator('.today .memory-card').isVisible(),false);
     assert.equal(await page.locator('[data-filter=service]').isVisible(),false);
     await page.locator('[data-mobile-filters]').click();assert.equal(await page.locator('[data-filter=service]').isVisible(),true);
     await page.locator('[data-filter=service]').selectOption('Wedding');
     assert((await page.locator('.booking-table tbody tr').count())<300);
     await page.locator('[data-action=clear]').click();
     assert.equal(await page.locator('.booking-table tbody tr').count(),300);
     await page.locator('[data-view=calendar]').click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
     await page.locator('[data-view=list]').click();
     const number=await page.locator('.booking-number a').first().innerText();
     await page.locator('.booking-number a').first().click();await page.getByText('BOOKING / '+number,{exact:true}).waitFor();
    }
   }
  }
  // Desktop retains its normal table and visible filters.
  await page.setViewportSize({width:1440,height:1000});await go('bookings');
  assert.equal(await page.locator('.booking-table').evaluate(el=>getComputedStyle(el).display),'table');
  assert(await page.locator('[data-filter=service]').isVisible());assert.equal(await page.locator('[data-mobile-filters]').isVisible(),false);
  // Login is part of the phone review as well.
  await page.setViewportSize({width:390,height:844});await page.goto('http://localhost:4173/',{waitUntil:'domcontentloaded'});
  await page.locator('#login-form').waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:'qa-screens/compact-login-390.png'});
  assert.deepEqual(errors,[]);
  console.log('All workspace phone routes: compact sizing, order cards, filters, calendar, links, no overflow, login and desktop preservation passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
