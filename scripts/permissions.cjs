const {chromium}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
 await page.goto('http://localhost:4173/#artists');
 assert.equal(await page.locator('.profile-card').count(),9);
 assert.equal(await page.getByText('Jz',{exact:true}).count(),1);
 await page.goto('http://localhost:4173/#artists/yuki');
 assert.equal(await page.locator('[data-official="true"]').count(),13);
 await page.goto('http://localhost:4173/#artists/michelle');
 assert.equal(await page.locator('[data-official="true"]').count(),1);
 await page.goto('http://localhost:4173/#artists/miranda');
 assert((await page.locator('[data-official="true"]').count())>80);
 const officialSources=await page.locator('[data-official="true"] img').evaluateAll(images=>images.map(image=>image.getAttribute('src')));
 assert(officialSources.every(source=>!source.includes('studio-')&&!source.includes('garden-room')));

 await page.goto('http://localhost:4173/#insights');
 assert.equal(await page.locator('.technical-panel').count(),1);
 assert.equal(await page.getByText('仅 Jz 可见',{exact:true}).count(),1);

 await page.selectOption('#role','miranda');
 await page.goto('http://localhost:4173/#insights');
 assert.equal(await page.locator('.technical-panel').count(),0);
 assert.equal(await page.getByText('已完成订单总额 · CAD',{exact:true}).count(),1);
 await page.goto('http://localhost:4173/#settings');
 assert.equal(await page.getByText('Miranda 的全局业务管理空间。',{exact:true}).count(),1);

 await page.selectOption('#role','artist');
 await page.selectOption('#artistIdentity','michelle');
 await page.goto('http://localhost:4173/#clients/c0');
 assert.equal(await page.locator('.restriction').count(),1);
 await page.goto('http://localhost:4173/#settings');
 assert.equal(await page.getByText('EMPLOYEE',{exact:true}).count(),1);

 await page.selectOption('#role','jz');
 await page.goto('http://localhost:4173/#settings');
 assert.equal(await page.getByText('SYSTEM ADMIN',{exact:true}).count(),1);
 await page.goto('http://localhost:4173/#sculpy');
 assert.equal(await page.locator('.sculpy-fab').count(),0);
 assert.equal(await page.locator('main.sculpy-reveal').count(),1);
 console.log('role permissions and Sculpy reveal verified');
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
