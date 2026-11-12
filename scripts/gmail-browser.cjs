const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/vendor/supabase.js',r=>r.fulfill({contentType:'text/javascript',body:"export {createClient} from '/scripts/fixtures/gmail-sdk.js';"}));
 await page.goto('http://localhost:4173/');await page.locator('[data-gmail-center] [data-mail]').waitFor();
 await page.locator('[data-os-nav=communications]').click();await page.locator('[data-gmail-center] [data-mail]').click();
 await page.locator('[data-gmail-center] [data-mail-draft]').waitFor();assert.equal(await page.locator('[data-gmail-center] script').count(),0);assert.equal(await page.evaluate(()=>window.bad),undefined);
 await page.locator('[data-gmail-center] [data-reply-type]').selectOption('request_details');
 await page.locator('[data-gmail-center] [data-ai=reply]').click();await page.waitForFunction(()=>document.querySelector('[data-gmail-center] [data-mail-draft]').value.startsWith('Thank you'));
 assert.equal(await page.evaluate(()=>window.gmailCalls.find(x=>x.action==='reply').replyType),'request_details');
 const draft=page.locator('[data-gmail-center] [data-mail-draft]');await draft.fill('Edited human draft');
 await page.locator('[data-gmail-center] [data-mail-search] input').fill('different search');assert.equal(await draft.inputValue(),'Edited human draft');
 await page.locator('[data-os-nav=orders]').click();await page.getByText('请先完成当前保存，再切换页面。',{exact:true}).waitFor();
 await page.locator('[data-gmail-center] [data-save-draft]').click();await page.locator('[data-gmail-center] [data-mail-status]').getByText('已保存。',{exact:true}).waitFor();
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);await page.screenshot({path:`qa-screens/gmail-${width}.png`,fullPage:true});}
 await page.locator('[data-os-nav=settings]').click();await page.locator('#gmail-settings [data-connect]').waitFor();assert.equal(await page.locator('#gmail-settings [data-connect]').isDisabled(),true);
 assert.deepEqual(errors,[]);assert(!(await page.evaluate(()=>JSON.stringify(window.gmailCalls))).includes('send'));console.log('Gmail UI: four widths, safe body, human draft, guarded navigation, settings, no send passed; fictional OAuth/API/model transport.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
