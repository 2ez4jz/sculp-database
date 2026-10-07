const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    args: [
      "--no-sandbox",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      permissions: ["microphone"],
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/functions/v1/sculpy-ai*", async (route) => {
      const action = new URL(route.request().url()).searchParams.get("action");
      if (action === "transcribe")
        return route.fulfill({
          json: {
            text: "客户喜欢轻薄底妆，下周问晚宴日期。",
            provider: "openai",
          },
        });
      const body = route.request().postDataJSON(),
        context = body.pageContext,
        entity = context.entity;
      const client = context.related.find((e) => e.type === "client");
      await route.fulfill({
        json: {
          summary: "本次服务满意，喜欢轻薄底妆。",
          items: [
            ...(client
              ? [
                  {
                    kind: "preference",
                    entityType: "client",
                    entityId: client.id,
                    text: "轻薄底妆",
                  },
                ]
              : []),
            {
              kind: "task",
              entityType: entity.type,
              entityId: entity.id,
              text: "下周跟进晚宴日期",
            },
          ],
          warnings: [],
          provider: "openai",
        },
      });
    });
    await page.goto("http://localhost:4173/?demo=1#bookings/b0");
    await page.locator("#context-memories [data-memory-open]").click();
    const dialog = page.locator(".memory-dialog");
    assert.equal(
      await page.locator("#memory-target").inputValue(),
      "booking:b0",
    );
    await page.locator("#memory-voice").click();
    await page.getByRole("button", { name: "结束录音", exact: true }).click();
    await page.waitForFunction(() =>
      document.querySelector("#memory-text").value.includes("底妆"),
    );
    await page.locator("[data-memory-prepare]").click();
    await page.locator(".memory-card-review").first().waitFor();
    assert.equal(await page.locator(".memory-card-review").count(), 3);
    assert.equal(await page.locator('[data-field="dueDate"]').inputValue(), "");
    await page.locator('[data-field="assigneeId"]').selectOption("michelle");
    await page.screenshot({ path: "qa-screens/context-memory-desktop.png" });
    await page.locator("[data-memory-save]").click();
    await page.locator(".memory-success").waitFor();
    assert((await dialog.innerText()).includes("此浏览器"));
    await page.getByRole("button", { name: "完成", exact: true }).click();
    assert(
      (await page.locator("#context-memories").innerText()).includes(
        "跟进晚宴",
      ),
    );
    await page.reload();
    assert(
      (await page.locator("#context-memories").innerText()).includes(
        "跟进晚宴",
      ),
    );
    await page.goto("http://localhost:4173/?demo=1#clients/c0");
    assert(
      (await page.locator("#context-memories").innerText()).includes(
        "轻薄底妆",
      ),
    );
    for (const route of [
      "artists/michelle",
      "venues/graydon",
      "partners/mango",
    ]) {
      await page.goto("http://localhost:4173/?demo=1#" + route);
      await page.locator("#context-memories [data-memory-open]").click();
      assert.equal(
        await page.locator("#memory-target").inputValue(),
        route
          .replace("artists/", "artist:")
          .replace("venues/", "venue:")
          .replace("partners/", "partner:"),
      );
      await page.locator("#memory-text").fill("这里的现场经验");
      await page.locator("[data-memory-prepare]").click();
      await page.locator(".memory-card-review").first().waitFor();
      await page.locator("[data-memory-save]").click();
      await page.locator(".memory-success").waitFor();
      await page.getByRole("button", { name: "完成", exact: true }).click();
      assert(
        (await page.locator("#context-memories").innerText()).includes(
          "本次服务满意",
        ),
      );
    }
    // Every list page has one floating chat entry on desktop and mobile.
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of ["bookings", "clients", "artists", "venues", "partners"]) {
        await page.goto("http://localhost:4173/?demo=1#" + route);
        await page.locator(".chat-launcher").waitFor();
        assert.equal(await page.locator(".chat-launcher:visible, .memory-launcher:visible").count(), 1);
        assert.equal(await page.locator(".memory-launcher").count(), 0);
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    // Explicit attribution is required after clearing the detail target; closing preserves drafts.
    await page.goto("http://localhost:4173/?demo=1#bookings/b0");
    await page.locator("#context-memories [data-memory-open]").click();
    await page.locator("#memory-target").selectOption("");
    assert.equal(await page.locator("#memory-target").inputValue(), "");
    await page.locator("#memory-text").fill("未选择对象");
    await page.locator("[data-memory-prepare]").click();
    assert(
      (await page.locator("#memory-message").innerText()).includes("先选择"),
    );
    await page.locator("#memory-target").selectOption("booking:b0");
    await page.locator("#memory-text").fill("未保存草稿");
    await page.getByRole("button", { name: "关闭记录面板" }).click();
    await page.goto("http://localhost:4173/?demo=1#bookings/b0");
    await page.locator("#context-memories [data-memory-open]").click();
    assert.equal(await page.locator("#memory-text").inputValue(), "未保存草稿");
    await page.getByRole("button", { name: "关闭记录面板" }).click();
    // Employee gets own bookings, no customer profile access, and review-only preferences.
    await page.selectOption("#role", "artist");
    await page.goto("http://localhost:4173/?demo=1#bookings/b0");
    await page.locator("#context-memories [data-memory-open]").click();
    assert.equal(
      await page.locator('#memory-target option[value="booking:b1"]').count(),
      0,
    );
    assert.equal(
      await page.locator('#memory-target option[value="client:c0"]').count(),
      0,
    );
    await page.locator("#memory-text").fill("轻薄底妆");
    await page.locator("[data-memory-prepare]").click();
    await page.locator(".memory-card-review").first().waitFor();
    assert((await dialog.innerText()).includes("提交管理员确认"));
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert(await dialog.evaluate((el) => el.scrollWidth <= innerWidth));
    await page.screenshot({ path: "qa-screens/context-memory-mobile.png" });
    await page.locator("[data-memory-save]").click();
    await page.locator(".memory-success").waitFor();
    await page.getByRole("button", { name: "完成", exact: true }).click();
    await page.goto("http://localhost:4173/?demo=1#bookings/b1");
    assert.equal(await page.locator(".memory-launcher").isVisible(), false);
    assert.deepEqual(errors, []);
    console.log(
      "Context memory: voice, multi-target persistence, profiles, single launcher, explicit attribution, draft retention, employee scope and mobile passed",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
