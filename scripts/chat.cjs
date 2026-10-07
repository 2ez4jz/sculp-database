const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
fs.mkdirSync("qa-screens", { recursive: true });
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let bodies = [];
  await page.route("**/functions/v1/sculpy-chat", async (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    await route.fulfill({
      json: {
        turn: {
          id: body.requestId,
          user: body.message,
          answer:
            "**已经核对当前订单。**\n\n客户偏好可以继续确认。\n\n这条备注尚未保存，请核对下方卡片。",
          references: [{ id: "b0", label: "Sarah · 婚礼" }],
          proposals: [
            {
              id: "40000000-0000-0000-0000-000000000001",
              bookingId: "b0",
              kind: "note",
              text: "客户喜欢轻薄底妆",
              label: "Sarah · 婚礼",
            },
          ],
          sourceIds: ["b0"],
        },
      },
    });
  });
  await page.goto("http://localhost:4173/?demo=1#bookings/b0");
  await page.getByRole("button", { name: "与 Sculpy 连续聊天" }).click();
  await page.locator("#chat-input").fill("帮我记录，客户喜欢轻薄底妆。");
  await page.locator("[data-send]").click();
  await page.locator(".chat-proposal").waitFor();
  assert.equal(bodies[0].bookingId, "b0");
  await page.locator("[data-save]").click();
  await page.waitForFunction(
    () => document.querySelector("[data-save]").textContent === "已保存",
  );
  await page.locator("#chat-input").fill("她上一次呢？");
  await page.locator("[data-send]").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".chat-assistant").length === 2,
  );
  assert.equal(bodies[1].turns.length, 1);
  assert(
    bodies[1].catalog.notes.some((n) => n.aiSummary === "客户喜欢轻薄底妆"),
  );
  await page.locator(".chat-preferences summary").click();
  await page.locator("[data-verbosity]").selectOption("brief");
  await page.locator("[data-instructions]").fill("先说结论");
  await page.locator("[data-save-preferences]").click();
  await page.waitForFunction(() =>
    document
      .querySelector(".chat-status")
      .textContent.includes("已保存你的回复偏好"),
  );
  await page.locator(".chat-preferences summary").click();
  await page.screenshot({ path: "qa-screens/chat-desktop.png" });
  await page.getByRole("button", { name: "关闭聊天", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "与 Sculpy 连续聊天" }).click();
  await page.locator(".chat-assistant").first().waitFor();
  assert.equal(await page.locator(".chat-assistant").count(), 2);
  assert.equal(await page.locator("[data-verbosity]").inputValue(), "brief");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "qa-screens/chat-mobile.png" });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.getByRole("button", { name: "关闭聊天", exact: true }).click();
  await page.selectOption("#role", "artist");
  await page.selectOption("#artistIdentity", "michelle");
  await page.goto("http://localhost:4173/?demo=1#sculpy");
  await page.locator("[data-open-chat]").click();
  await page.locator(".chat-welcome").waitFor();
  assert.equal(await page.locator(".chat-assistant").count(), 0);
  assert.equal(await page.locator("[data-verbosity]").inputValue(), "detailed");
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "chat: follow-up, save, persistence, identity isolation and mobile layout passed",
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
