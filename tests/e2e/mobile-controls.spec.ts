import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 844, height: 390 },
  hasTouch: true,
  isMobile: true,
});

test("provides landscape touch flight controls and pauses safely in portrait", async ({ page }) => {
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?world=cesium&airport=OMDB&mode=air&heading=121&altitude=304.8");
  const controls = page.getByLabel("Touch flight controls");
  await expect(controls).toBeVisible({ timeout: 90_000 });
  await expect(page.getByLabel("Mobile flight telemetry")).toBeVisible();
  await expect(page.getByLabel("Development flight telemetry")).not.toBeVisible();
  await expect(page.getByLabel("Development flight telemetry")).toContainText("AIRBORNE");

  const controlsBox = await controls.boundingBox();
  expect(controlsBox).not.toBeNull();
  expect(controlsBox!.x).toBeGreaterThanOrEqual(0);
  expect(controlsBox!.y).toBeGreaterThanOrEqual(0);
  expect(controlsBox!.x + controlsBox!.width).toBeLessThanOrEqual(844);
  expect(controlsBox!.y + controlsBox!.height).toBeLessThanOrEqual(390);

  const joystick = page.getByRole("slider", { name: "Pitch and roll joystick" });
  const joystickBox = (await joystick.boundingBox())!;
  await page.mouse.move(joystickBox.x + joystickBox.width / 2, joystickBox.y + joystickBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(joystickBox.x + joystickBox.width / 2, joystickBox.y + 4);
  await expect(joystick).toHaveAttribute("aria-valuetext", /Pitch -9\d percent/);
  const pitch = page.locator(".hud-metric").filter({ hasText: "Pitch" }).locator("strong");
  await expect.poll(async () => Number(await pitch.innerText()), { timeout: 10_000 }).toBeLessThan(-2);
  await page.mouse.up();
  await expect(joystick).toHaveAttribute("aria-valuetext", "Pitch 0 percent, roll 0 percent");

  await page.mouse.move(joystickBox.x + joystickBox.width / 2, joystickBox.y + joystickBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(joystickBox.x + joystickBox.width - 4, joystickBox.y + joystickBox.height / 2);
  await expect(joystick).toHaveAttribute("aria-valuetext", /roll 9\d percent/);
  const bank = page.locator(".hud-metric").filter({ hasText: "Bank" }).locator("strong");
  await expect.poll(async () => Number(await bank.innerText()), { timeout: 10_000 }).toBeGreaterThan(2);
  await page.mouse.up();
  await expect(joystick).toHaveAttribute("aria-valuetext", "Pitch 0 percent, roll 0 percent");

  const yaw = page.getByRole("slider", { name: "Yaw slider" });
  const yawBox = (await yaw.boundingBox())!;
  await page.mouse.move(yawBox.x + yawBox.width / 2, yawBox.y + yawBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(yawBox.x + 2, yawBox.y + yawBox.height / 2);
  expect(Number(await yaw.getAttribute("aria-valuenow"))).toBeLessThanOrEqual(-95);
  await page.mouse.up();
  await expect(yaw).toHaveAttribute("aria-valuenow", "0");

  const throttle = page.getByRole("slider", { name: "Throttle slider" });
  const throttleBox = (await throttle.boundingBox())!;
  await page.mouse.move(throttleBox.x + throttleBox.width / 2, throttleBox.y + throttleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(throttleBox.x + throttleBox.width / 2, throttleBox.y + throttleBox.height - 2);
  await page.mouse.up();
  expect(Number(await throttle.getAttribute("aria-valuenow"))).toBeLessThanOrEqual(5);
  await page.waitForTimeout(250);
  expect(Number(await throttle.getAttribute("aria-valuenow"))).toBeLessThanOrEqual(5);
  const liveThrottle = page.getByLabel("Mobile flight telemetry").locator("div").filter({ hasText: "Throttle" }).locator("strong");
  await expect.poll(async () => Number(await liveThrottle.innerText()), { timeout: 10_000 }).toBeLessThan(90);
  await page.getByRole("button", { name: "Respawn" }).click();
  await expect(controls).not.toHaveClass(/is-disabled/);
  await expect(page.getByLabel("Development flight telemetry")).toContainText("AIRBORNE");
  await expect(throttle).toHaveAttribute("aria-valuenow", "42");
  await page.screenshot({ path: "output/playwright/mobile-controls-landscape.png" });

  const brake = page.getByRole("button", { name: "Hold wheel brakes" });
  await expect(brake).toHaveCSS("min-height", "54px");
  const brakeBox = (await brake.boundingBox())!;
  await page.mouse.move(brakeBox.x + brakeBox.width / 2, brakeBox.y + brakeBox.height / 2);
  await page.mouse.down();
  await expect(page.getByLabel("Development flight telemetry")).toContainText("ON", { timeout: 3_000 });
  await page.mouse.up();
  await expect(page.getByLabel("Development flight telemetry")).toContainText("OFF", { timeout: 3_000 });

  const flaps = page.getByRole("button", { name: "Cycle flaps" });
  await flaps.click();
  await expect(flaps).toContainText("50%");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Landscape orientation required")).toBeVisible();
  await page.screenshot({ path: "output/playwright/mobile-controls-portrait-lock.png" });
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByLabel("Landscape orientation required")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await expect(controls).toHaveClass(/is-disabled/);
  expect(pageErrors).toEqual([]);
});
