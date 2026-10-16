const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.SCULPY_PWA_TEST_BASE || 'http://localhost:4173/';
(async()=>{
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',args:['--no-sandbox']});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844}});
    const page = await context.newPage(), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>localStorage.setItem('memora-demo-language','zh'));
    await page.goto(base);await page.locator('#login-form').waitFor();
    assert.equal(await page.locator('.auth-content [data-pwa-open]').count(),1);
    const manifest = await page.evaluate(async()=>{
      const url=document.querySelector('link[rel=manifest]').href;
      return {url,data:await (await fetch(url)).json()};
    });
    assert.equal(new URL(manifest.data.start_url,manifest.url).searchParams.has('demo'),false);
    for (const size of [192,512]) assert(manifest.data.icons.some(icon=>icon.sizes===`${size}x${size}`));
    for (const icon of manifest.data.icons) {
      const dimensions=await page.evaluate(async url=>{const image=new Image();image.src=url;await image.decode();return [image.naturalWidth,image.naturalHeight];},new URL(icon.src,manifest.url).href);
      assert.equal(dimensions.join('x'),icon.sizes);
    }
    assert.equal(await page.locator('link[rel=apple-touch-icon]').getAttribute('sizes'),'180x180');
    await page.goto(new URL(manifest.data.start_url,manifest.url).href);await page.locator('#login-form').waitFor();
    // Inspect the actual parsed Chromium manifest, independently of JSON parsing.
    const cdp=await context.newCDPSession(page);
    const parsed=await cdp.send('Page.getAppManifest');assert.deepEqual(parsed.errors,[]);
    await page.goto(base+'?demo=1&lang=zh#settings');await page.locator('[data-pwa-card]').waitFor();
    const demoManifest = await page.evaluate(async()=>{const url=document.querySelector('link[rel=manifest]').href;return {url,data:await (await fetch(url)).json()};});
    assert.notEqual(demoManifest.data.id,manifest.data.id);
    const launch=new URL(demoManifest.data.start_url,demoManifest.url);
    assert.equal(launch.searchParams.get('demo'),'1');assert.equal(launch.hash,'#bookings');
    await page.goto(launch.href);await page.locator('[data-action=new-booking]').waitFor();
    // Only an explicit button action may invoke the retained browser prompt.
    await page.evaluate(()=>{
      window.installCalls=0;
      const event=new Event('beforeinstallprompt',{cancelable:true});
      event.prompt=async()=>{window.installCalls++;};event.userChoice=Promise.resolve({outcome:'dismissed'});
      window.dispatchEvent(event);window.installPrevented=event.defaultPrevented;
    });
    assert.equal(await page.evaluate(()=>window.installCalls),0);
    await page.locator('#menu').click();await page.locator('.sidebar-end [data-pwa-open]').click();
    await page.locator('.pwa-install-dialog').waitFor();
    assert.match(await page.locator('[data-pwa-intro]').innerText(),/演示/);
    await page.locator('[data-pwa-confirm]').click();
    await page.getByText('已取消安装，仍可继续使用网页版。',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.installCalls),1);
    assert.equal(await page.evaluate(()=>window.installPrevented),true);
    assert(await page.locator('.pwa-install-dialog').evaluate(el=>el.scrollWidth<=innerWidth));
    await page.screenshot({path:'qa-screens/pwa-guide-mobile.png'});
    await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));
    assert.equal(await page.locator('.pwa-install-dialog').evaluate(el=>el.open),false);
    assert.equal(await page.locator('.sidebar-end [data-pwa-open]').isVisible(),false);
    // A worker on a GitHub project subpath must only cache its data-free fallback.
    const scope=await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));return (await navigator.serviceWorker.getRegistration()).scope;});
    assert.equal(scope,base);
    await context.setOffline(true);await page.reload();
    await page.getByRole('heading',{name:'连接恢复后，继续工作。'}).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('demo'),'1');
    await page.screenshot({path:'qa-screens/pwa-offline-mobile.png'});
    await context.setOffline(false);await page.getByRole('button',{name:'重新连接 · Retry'}).click();
    await page.locator('[data-action=new-booking]').waitFor();
    const cached = await page.evaluate(async()=>{
      const entries=[];for(const key of await caches.keys())for(const request of await (await caches.open(key)).keys())entries.push(request.url);return entries;
    });
    assert.deepEqual(cached,[new URL('offline.html',base).href]);
    const ios=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
    const phone=await ios.newPage();await phone.addInitScript(()=>localStorage.setItem('memora-demo-language','zh'));
    await phone.goto(base+'?demo=1&lang=zh#settings');await phone.locator('[data-pwa-card] [data-pwa-open]').click();
    assert.match(await phone.locator('[data-pwa-steps]').innerText(),/分享[\s\S]*添加到主屏幕/);
    assert.equal(await phone.locator('[data-pwa-confirm]').isVisible(),false);
    await phone.screenshot({path:'qa-screens/pwa-ios-instructions.png'});
    await ios.close();
    // Simulate standalone detection, without claiming OS installation was automated.
    const standalone=await browser.newContext();await standalone.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
    const app=await standalone.newPage();await app.goto(base);await app.locator('#login-form').waitFor();
    assert.equal(await app.locator('[data-pwa-open]:visible').count(),0);await standalone.close();
    assert.deepEqual(errors,[]);await context.close();
    console.log('PWA: icons/parsed manifest, separate production/demo launches, user-triggered prompt/cancel, iPhone instructions, standalone detection, scoped worker, offline/reconnect and no business caches passed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
