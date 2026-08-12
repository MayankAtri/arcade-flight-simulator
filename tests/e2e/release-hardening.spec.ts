import { expect, test } from "@playwright/test";

test("keeps photorealistic tiles locked off and tolerates repeated control resets", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?world=photorealistic&airport=VABB&mode=air&heading=270&altitude=304.8");
  await expect(page.getByRole("heading", { name: "Arcade Flight Simulator" })).toBeVisible();
  await expect(page.getByText("Cesium world", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Google photorealistic", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Development flight telemetry")).toContainText("AIRBORNE");
  for (let cycle = 0; cycle < 5; cycle += 1) {
    await page.keyboard.down("Shift");
    await page.keyboard.down("s");
    await page.keyboard.down("e");
    await page.waitForTimeout(80);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.keyboard.up("Shift");
    await page.keyboard.up("s");
    await page.keyboard.up("e");
    await page.getByRole("button", { name: "Respawn" }).click();
  }

  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Flight paused")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Flight paused")).not.toBeVisible();
  await expect(page.getByLabel("Development flight telemetry")).toContainText("AIRBORNE");
  expect(pageErrors).toEqual([]);
});

test("falls back to the basic world when Cesium ion assets fail", async ({ page }) => {
  await page.route("**/*", async (route) => {
    const hostname = new URL(route.request().url()).hostname;
    if (hostname.endsWith("cesium.com")) await route.abort();
    else await route.continue();
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Arcade Flight Simulator" })).toBeVisible();
  await expect(page.getByText("Basic world", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Choose the world" })).toBeVisible();
});
