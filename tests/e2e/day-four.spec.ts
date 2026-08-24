import { expect, test } from "@playwright/test";

test("starts on a runway, exposes ground state, pauses, and respawns", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/?airport=OMDB&mode=runway");
  await expect(page.getByLabel("Interactive 3D flight world").locator("canvas")).toBeVisible();
  await expect(page.getByLabel("Development flight telemetry")).toContainText("GROUND", { timeout: 60_000 });

  await expect(page.getByRole("button", { name: "Sound on" })).toBeVisible();
  await page.getByRole("button", { name: "Sound on" }).click();
  await expect(page.getByRole("button", { name: "Sound off" })).toBeVisible();
  await page.getByRole("button", { name: "Sound off" }).click();
  await expect(page.getByRole("button", { name: "Sound on" })).toBeVisible();

  await expect(page.getByRole("button", { name: "Pause" })).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByLabel("Development flight telemetry")).toContainText("GROUND");
  await expect(page.locator(".hud-metric").filter({ hasText: "AGL" })).toContainText("0");
  await expect(page.locator(".hud-metric").filter({ hasText: "AGL" })).toContainText("FT");
  await expect(page.locator(".world-status")).toHaveCount(0);

  await page.getByRole("button", { name: "Next camera: External far" }).click();
  await expect(page.getByRole("button", { name: "Next camera: Flyby" })).toBeVisible();
  await page.getByRole("button", { name: "Next camera: Flyby" }).click();
  await expect(page.getByRole("button", { name: "Next camera: Top down" })).toBeVisible();
  await page.getByRole("button", { name: "Next camera: Top down" }).click();
  await expect(page.getByRole("button", { name: "Next camera: External" })).toBeVisible();
  await page.getByRole("button", { name: "Next camera: External" }).click();
  await expect(page.getByRole("button", { name: "Next camera: External far" })).toBeVisible();
  await expect(page.getByLabel("Current camera: External")).toBeVisible();

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByLabel("Flight paused")).toBeVisible();
  await page.getByRole("button", { name: "Respawn" }).click();
  await expect(page.getByLabel("Flight paused")).not.toBeVisible();
  await expect(page.getByLabel("Development flight telemetry")).toContainText("GROUND");
});
