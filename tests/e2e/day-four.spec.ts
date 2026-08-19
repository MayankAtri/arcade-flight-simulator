import { expect, test } from "@playwright/test";

test("starts on a runway, exposes ground state, pauses, and respawns", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.getByLabel("Interactive 3D flight world").locator("canvas")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose the world" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Arcade Flight Simulator" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await expect(page.getByRole("button", { name: "Sound on" })).toBeVisible();
  await page.getByRole("button", { name: "Sound on" }).click();
  await expect(page.getByRole("button", { name: "Sound off" })).toBeVisible();
  await page.getByRole("button", { name: "Sound off" }).click();
  await expect(page.getByRole("button", { name: "Sound on" })).toBeVisible();

  await page.getByRole("button", { name: "World search" }).click();
  await page.getByRole("button", { name: "Dubai runway" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByLabel("Development flight telemetry")).toContainText("GROUND");
  await expect(page.locator(".hud-metric").filter({ hasText: "AGL" })).toContainText("0");
  await expect(page.locator(".hud-metric").filter({ hasText: "AGL" })).toContainText("FT");
  await expect(page.locator(".world-status")).toHaveCount(0);

  await page.getByRole("button", { name: "Next camera: External far" }).click();
  await expect(page.getByRole("button", { name: "Next camera: Flyby" })).toBeVisible();

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByLabel("Flight paused")).toBeVisible();
  await page.getByRole("button", { name: "Respawn" }).click();
  await expect(page.getByLabel("Flight paused")).not.toBeVisible();
  await expect(page.getByLabel("Development flight telemetry")).toContainText("GROUND");
});
