const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--no-sandbox'],
  });
  try {
    const context = await browser.newContext({serviceWorkers: 'block'});
    await context.route('**/src/vendor/supabase.js', route => route.fulfill({
      contentType: 'text/javascript',
      body: fs.readFileSync('scripts/fixtures/communication-sdk.js', 'utf8'),
    }));
    const page = await context.newPage();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({width, height: 900});
      await page.goto('http://localhost:4173/');
      await page.locator('#manage-accounts').click();
      const devices = page.locator('[data-notification-devices]');
      const deviceToggle = devices.locator(':scope > summary');
      const createToggle = page.locator('#account-list summary').filter({hasText: '新建账户'});
      for (const control of [deviceToggle, createToggle]) {
        await control.scrollIntoViewIfNeeded();
        const reachable = await control.evaluate(el => {
          const box = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
        });
        assert(reachable, (await control.innerText()) + ' is covered at ' + width + 'px');
      }
      await deviceToggle.click();
      await devices.getByText('当前没有有效设备订阅。', {exact: true}).waitFor();
      await devices.getByRole('button', {name: '刷新'}).click();
      assert.equal(await page.evaluate(() => window.qaCalls.filter(c => c.name === 'sculpy_jz_notification_devices').length), 2);
      await deviceToggle.focus();
      await page.keyboard.press('Enter');
      assert.equal(await devices.evaluate(el => el.open), false);
      await createToggle.click();
      assert(await page.locator('#create-account').isVisible());
      assert.equal(await devices.evaluate(el => el.open), false);
    }
    console.log('Account device and create controls are independently clickable at 1440, 768, 390 and 320px.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
