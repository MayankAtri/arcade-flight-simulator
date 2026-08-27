import { expect, test } from "@playwright/test";

test("keeps the explicit Cesium override and tolerates repeated control resets", async ({ page }) => {
  test.setTimeout(240_000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?world=cesium&airport=VABB&mode=air&heading=270&altitude=304.8");
  await expect(page.getByLabel("Development flight telemetry")).toContainText("AIRBORNE", { timeout: 90_000 });
  await expect(page.getByText("Cessna 172SP · OSM scenery", { exact: true })).toBeVisible();
  await expect(page.getByText("Google photorealistic", { exact: true })).toHaveCount(0);
  const respawn = page.getByRole("button", { name: "Respawn" });
  await expect(respawn).toBeEnabled();
  for (let cycle = 0; cycle < 5; cycle += 1) {
    await page.keyboard.down("Shift");
    await page.keyboard.down("s");
    await page.keyboard.down("e");
    await page.waitForTimeout(80);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.keyboard.up("Shift");
    await page.keyboard.up("s");
    await page.keyboard.up("e");
    await respawn.click({ force: true });
  }

  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Flight paused")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Flight paused")).not.toBeVisible();
  await expect(page.getByLabel("Development flight telemetry")).toContainText("AIRBORNE");
  expect(pageErrors).toEqual([]);
});

test("falls back to the basic world when Cesium ion assets fail", async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("**/*", async (route) => {
    const hostname = new URL(route.request().url()).hostname;
    if (hostname.endsWith("cesium.com")) await route.abort();
    else await route.continue();
  });

  await page.goto("/?world=cesium");
  await expect(page.getByRole("heading", { name: "World Flight Sim" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Basic world", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Choose the world" })).toBeVisible();
});

test("stops at streamed OSM building geometry and recovers at a safe spawn", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/?world=cesium&lat=25.1972&lon=55.2744&elevation=4&mode=air&heading=90&altitude=8");
  const pause = page.getByRole("button", { name: "Pause" });
  await expect(pause).toBeEnabled({ timeout: 60_000 });
  await pause.click({ force: true });
  const resume = page.getByRole("button", { name: "Resume" });
  await expect(resume).toBeEnabled();
  await expect(page.getByLabel("Flight paused")).toBeVisible();

  // The test starts inside the Burj Khalifa footprint. Let its OSM tile reach
  // the scene before advancing the fixed-step simulation.
  await page.waitForTimeout(10_000);
  await resume.click({ force: true });
  await expect(page.getByRole("heading", { name: "Building collision" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Development flight telemetry")).toContainText("CRASHED");

  await page.goto("/?world=cesium&airport=OMDB&mode=air&heading=121&altitude=304.8");
  await expect(page.getByRole("heading", { name: "Building collision" })).not.toBeVisible();
  await expect(page.getByLabel("Development flight telemetry")).toContainText("AIRBORNE", { timeout: 60_000 });
});
