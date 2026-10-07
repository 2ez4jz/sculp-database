const { chromium } = require("playwright");
const assert = require("node:assert/strict");
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
    const page = await browser.newPage({ permissions: ["microphone"] });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.__streams = [];
      const original = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      navigator.mediaDevices.getUserMedia = async (options) => {
        const stream = await original(options);
        window.__streams.push(stream);
        return stream;
      };
    });
    let pending = null,
      delayAction = null,
      lastCatalog = null,
      requests = 0;
    await page.route("**/functions/v1/sculpy-ai*", async (route) => {
      const action = new URL(route.request().url()).searchParams.get("action");
      requests++;
      if (action === "search")
        lastCatalog = route.request().postDataJSON().catalog;
      const body =
        action === "transcribe"
          ? { text: "OLD TRANSCRIPT", provider: "openai" }
          : action === "extract"
            ? {
                summary: "OLD DRAFT",
                preferences: [],
                opportunities: [],
                confidence: 0.9,
                provider: "openai",
              }
            : { answer: "回答", results: [], provider: "openai" };
      if (action === delayAction)
        await new Promise((resolve) => {
          pending = resolve;
        });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    const tick = () => page.waitForTimeout(100);
    const waitPending = async () => {
      for (let i = 0; i < 100 && !pending; i++) await tick();
      assert(pending, "Expected delayed AI request within 10 seconds");
    };
    await page.goto("http://localhost:4173/?demo=1#sculpy/b0");
    // A late extraction cannot populate a different booking page.
    delayAction = "extract";
    await page.locator("#sculpy-text").fill("工作记录");
    await page.locator('[data-action="prepare"]').click();
    await waitPending();
    await page.evaluate(() => (location.hash = "sculpy/b1"));
    await tick();
    pending();
    pending = null;
    await tick();
    assert.equal(await page.locator("#draft-summary").count(), 0);
    // Editing the target invalidates the draft even without navigation.
    delayAction = null;
    await page.locator("#sculpy-text").fill("新的记录");
    await page.locator('[data-action="prepare"]').click();
    await page.locator("#draft-summary").waitFor();
    await page.locator("#sculpy-booking").selectOption("b0");
    assert.equal(await page.locator("#draft-summary").count(), 0);
    // A pending transcript cannot land in a newly mounted input.
    delayAction = "transcribe";
    await page.locator("#voice-button").click();
    await page.getByRole("button", { name: "结束录音" }).waitFor();
    await page.locator("#voice-button").click();
    await waitPending();
    await page.evaluate(() => (location.hash = "sculpy/b2"));
    await tick();
    pending();
    pending = null;
    await tick();
    assert.equal(await page.locator("#sculpy-text").inputValue(), "");
    assert(
      await page.evaluate(() =>
        window.__streams.every((s) =>
          s.getTracks().every((t) => t.readyState === "ended"),
        ),
      ),
    );
    // Leaving while actively recording stops tracks without another AI request.
    delayAction = null;
    const before = requests;
    await page.locator("#voice-button").click();
    await page.getByRole("button", { name: "结束录音" }).waitFor();
    await page.evaluate(() => (location.hash = "bookings"));
    await tick();
    assert.equal(requests, before);
    assert(
      await page.evaluate(() =>
        window.__streams.every((s) =>
          s.getTracks().every((t) => t.readyState === "ended"),
        ),
      ),
    );
    // Reporting still renders crisp DOM values and labels.
    await page.evaluate(() => (location.hash = "sculpy"));
    await page.locator('[data-sculpy-query*="饼图"]').click();
    await page.locator(".pie-chart").waitFor();
    assert((await page.locator(".slice-label").count()) > 0);
    assert(
      (await page.locator(".chart-legend small").allTextContents()).every((x) =>
        /^\d+%$/.test(x),
      ),
    );
    // Employee requests are scoped; repeated navigation does not duplicate handlers.
    await page.selectOption("#role", "artist");
    await page.evaluate(() => (location.hash = "sculpy"));
    await tick();
    const employeeBefore = requests;
    await page.locator("#sculpy-search").fill("Mango");
    await page.locator('[data-action="sculpy-search"]').click();
    await page.locator(".search-answer").waitFor();
    assert.equal(requests, employeeBefore + 1);
    assert(
      lastCatalog.bookings.every(
        (b) => b.artistIds.includes("michelle") && !("price" in b),
      ),
    );
    assert(
      lastCatalog.notes.every((n) =>
        lastCatalog.bookings.some((b) => b.id === n.entityId),
      ),
    );
    assert(lastCatalog.artists.every((a) => a.id === "michelle"));
    assert.deepEqual(errors, []);
    console.log(
      "Sculpy stale requests, draft invalidation, recording cleanup, chart and scoped search verified",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
