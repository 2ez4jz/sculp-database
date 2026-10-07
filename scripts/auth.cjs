const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:4173/#bookings/b0");
  await page.getByRole("heading", { name: "欢迎回到工作室" }).waitFor();
  assert.equal(await page.locator("#main").count(), 0);
  await page.locator("#email").fill("test@example.test");
  await page.locator("#password").fill("test-password");
  await page.getByRole("button", { name: "显示密码" }).click();
  assert.equal(await page.locator("#password").getAttribute("type"), "text");
  await page.getByRole("button", { name: "登录工作空间" }).click();
  await page
    .getByText("登录服务尚未配置，请联系 Jz。", { exact: true })
    .waitFor();
  await page.screenshot({ path: "qa-screens/login-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: "qa-screens/login-mobile.png" });
  await page.getByRole("link", { name: "先浏览演示空间" }).click();
  await page.locator("#main h1").waitFor();
  await page.getByRole("link", { name: "返回登录" }).click();
  await page.locator("#login-form").waitFor();
  // Mock the SDK boundary. SQL tests independently verify the real authorization boundary.
  await page.addInitScript(() => {
    globalThis.SCULPY_CONFIG = { supabasePublishableKey: "test-key" };
  });
  await page.route("**/src/vendor/supabase.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `let signed=false;export function createClient(){return {auth:{getSession:async()=>({data:{session:null}}),signInWithPassword:async({password})=>{signed=password==='correct';return {error:signed?null:{message:'invalid'}}},getUser:async()=>({data:{user:signed?{id:'jz'}:null}}),signOut:async()=>{signed=false;return {}},onAuthStateChange:()=>({data:{subscription:{}}})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id:'jz',display_name:'Jz',role:'operations',active:true}})})})}),rpc:async(name,args)=>name==='list_managed_accounts'?{data:[{id:'staff',display_name:'Employee',email:'employee@example.test',role:'artist',active:true}]}:{error:null}}}`,
    }),
  );
  await page.reload();
  await page.locator("#email").fill("jz@example.test");
  await page.locator("#password").fill("wrong");
  await page.locator("#login-submit").click();
  await page.getByText("登录失败，请检查邮箱和密码，或稍后重试。").waitFor();
  await page.locator("#password").fill("correct");
  await page.locator("#login-submit").click();
  await page.getByRole("heading", { name: "你好，Jz" }).waitFor();
  await page.getByRole("button", { name: "账户管理" }).click();
  await page.locator("[name=displayName]").fill("Updated");
  await page.getByRole("button", { name: "保存修改" }).click();
  await page.getByText("已保存", { exact: true }).waitFor();
  await page.screenshot({ path: "qa-screens/accounts-mobile.png" });
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.locator("#login-form").waitFor();
  assert.deepEqual(errors, []);
  await browser.close();
  console.log("login, account management, demo separation and mobile passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
