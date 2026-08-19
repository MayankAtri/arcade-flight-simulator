import { expect, test } from "@playwright/test";

test("keeps photorealistic tiles locked off and tolerates repeated control resets", async ({ page }) => {
  test.setTimeout(180_000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?world=photorealistic&airport=VABB&mode=air&heading=270&altitude=304.8");
  await expect(page.getByLabel("Development flight telemetry")).toContainText("AIRBORNE", { timeout: 90_000 });
  await expect(page.getByText("Cessna 172SP · OSM scenery", { exact: true })).toBeVisible();
  await expect(page.getByText("Google photorealistic", { exact: true })).toHaveCount(0);
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

test("stops at streamed OSM building geometry and recovers at a safe spawn", async ({ page }) => {
  await page.goto("/?lat=25.1972&lon=55.2744&elevation=4&mode=air&heading=90&altitude=8");
  await expect(page.getByRole("button", { name: "Pause" })).toBeEnabled({ timeout: 60_000 });
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeEnabled();
  await expect(page.getByLabel("Flight paused")).toBeVisible();

  // The test starts inside the Burj Khalifa footprint. Let its OSM tile reach
  // the scene before advancing the fixed-step simulation.
  await page.waitForTimeout(10_000);
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("heading", { name: "Building collision" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Development flight telemetry")).toContainText("CRASHED");

  await page.getByRole("button", { name: "World search" }).click();
  await page.getByRole("button", { name: "Dubai airborne" }).click();
  await expect(page.getByRole("heading", { name: "Building collision" })).not.toBeVisible();
  await expect(page.getByLabel("Development flight telemetry")).toContainText("AIRBORNE", { timeout: 60_000 });
});
