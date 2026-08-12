import { expect, test } from "@playwright/test";

test("starts on a runway, exposes ground state, pauses, and respawns", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Arcade Flight Simulator" })).toBeVisible();
  await expect(page.getByLabel("Interactive 3D flight world").locator("canvas")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose the world" })).toBeVisible({ timeout: 30_000 });

  await expect(page.getByRole("button", { name: "Sound on" })).toBeVisible();
  await page.getByRole("button", { name: "Sound on" }).click();
  await expect(page.getByRole("button", { name: "Sound off" })).toBeVisible();
  await page.getByRole("button", { name: "Sound off" }).click();
  await expect(page.getByRole("button", { name: "Sound on" })).toBeVisible();

  await page.getByRole("button", { name: "Dubai runway" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeEnabled();
  await expect(page.getByLabel("Development flight telemetry")).toContainText("GROUND");

  await page.getByRole("button", { name: "Cockpit view" }).click();
  await expect(page.getByRole("button", { name: "Chase view" })).toBeVisible();

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByLabel("Flight paused")).toBeVisible();
  await page.getByRole("button", { name: "Respawn" }).click();
  await expect(page.getByLabel("Flight paused")).not.toBeVisible();
  await expect(page.getByLabel("Development flight telemetry")).toContainText("GROUND");
});
