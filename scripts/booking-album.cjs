const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXa0AAAAASUVORK5CYII=';
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}}), errors = [];
    page.on('pageerror',error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('memora-demo-language','zh'));
    await page.goto('http://localhost:4173/?demo=1#bookings');
    await page.locator('[data-action=new-booking]').click();
    await page.locator('#memory-new-date').fill('2026-12-10');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sculp-memory-demo-300-v2') || '{}').demoBookings?.length || 0),0);
    await page.locator('[data-memory-create-submit=booking]').click();
    await page.waitForURL(/#bookings\/demo-/);
    const created = await page.evaluate(() => JSON.parse(localStorage.getItem('sculp-memory-demo-300-v2')).demoBookings[0]);
    assert.equal(created.date,'2026-12-10');assert.match(created.orderNumber,/^6[012356789]{5}$/);
    await page.reload();await page.getByText('BOOKING / '+created.orderNumber,{exact:true}).waitFor();
    await page.goto('http://localhost:4173/?demo=1#bookings');
    await page.locator('[data-action=new-booking]').click();
    await page.getByRole('button',{name:'关闭记录面板'}).click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sculp-memory-demo-300-v2')).demoBookings.length),1);
    await page.goto('http://localhost:4173/?demo=1#artists/miranda');
    await page.locator('[data-album-files]').setInputFiles({name:'first.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.getByText('已保存 1 张作品到 Miranda 的个人图库，刷新后仍可查看。',{exact:true}).waitFor();
    const dataTransfer = await page.evaluateHandle(base64 => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(atob(base64),c => c.charCodeAt(0))],'dropped.png',{type:'image/png'}));
      return transfer;
    },png);
    await page.locator('[data-album-drop]').dispatchEvent('dragover',{dataTransfer});
    await page.locator('[data-album-drop]').dispatchEvent('drop',{dataTransfer});
    await page.waitForFunction(() => document.querySelectorAll('[data-album-view]').length === 2);
    await page.reload();await page.locator('[data-album-view]').nth(1).waitFor();
    await page.locator('[data-album-view]').first().click();
    assert(await page.locator('[data-album-preview]').evaluate(el => el.open));
    await page.waitForFunction(() => document.querySelector('[data-album-preview] img').naturalWidth > 0);
    await page.locator('[data-album-close]').click();
    assert.equal(await page.locator('[data-album-gallery] [download]').count(),2);
    // Two originals in one batch: removing one must keep the other intact.
    await page.locator('[data-album-files]').setInputFiles(['batch-a.png','batch-b.png'].map(name => ({name,mimeType:'image/png',buffer:Buffer.from(png,'base64')})));
    await page.waitForFunction(() => document.querySelectorAll('[data-album-view]').length === 4);
    page.once('dialog',dialog => dialog.accept());
    await page.locator('[data-album-remove]').nth(2).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-album-view]').length === 3);
    await page.reload();await page.locator('[data-album-view]').nth(2).waitFor();
    assert.equal(await page.locator('[data-album-view]').count(),3);
    // Invalid image bytes never create a gallery entry.
    await page.locator('[data-album-files]').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not an image')});
    await page.getByText('无法读取图片：broken.png。本次尚未保存。',{exact:true}).waitFor();
    assert.equal(await page.locator('[data-album-view]').count(),3);
    // Failed metadata writes roll back the archived original.
    const keyCount = () => page.evaluate(async () => {
      const {openAttachmentStore} = await import('/src/services/attachments.js');
      const db = await openAttachmentStore();
      try {return await new Promise((resolve,reject) => {const request=db.transaction('images').objectStore('images').count();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
      finally {db.close();}
    });
    const before = await keyCount();
    await page.evaluate(() => {window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='sculp-memory-demo-300-v2')throw Error('quota');return window.originalSetItem.call(this,key,value);};});
    await page.locator('[data-album-files]').setInputFiles({name:'quota.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.getByText('图片信息保存失败，请释放浏览器存储空间后重试。',{exact:true}).waitFor();
    assert.equal(await keyCount(),before);
    await page.evaluate(() => {Storage.prototype.setItem=window.originalSetItem;});
    await page.selectOption('#role','artist');
    await page.goto('http://localhost:4173/?demo=1#artists/michelle');await page.locator('[data-album-files]').waitFor({state:'attached'});
    assert.equal(await page.locator('[data-album-view]').count(),0);
    await page.goto('http://localhost:4173/?demo=1#artists/miranda');
    assert.equal(await page.locator('[data-album-files]').count(),0);
    await page.goto('http://localhost:4173/?demo=1#bookings');
    assert.equal(await page.locator('[data-action=new-booking]').count(),0);
    await page.selectOption('#role','miranda');
    await page.locator('[data-action=new-booking]').waitFor();
    await page.goto('http://localhost:4173/?demo=1#artists/miranda');
    await page.locator('[data-album-view]').nth(2).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({path:'qa-screens/artist-album-mobile.png',fullPage:true});
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:'qa-screens/artist-album-desktop.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('New booking and artist album: create/reload/cancel, file picker, actual drop, original preview/download, batch deletion, invalid bytes, quota rollback, role visibility and mobile passed');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exit(1);});
