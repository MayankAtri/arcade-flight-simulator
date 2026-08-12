import { describe, expect, it } from "vitest";
import { AdaptiveQualityController } from "./AdaptiveQualityController";

describe("AdaptiveQualityController", () => {
  it("only lowers quality after sustained sub-30 FPS rendering", () => {
    const controller = new AdaptiveQualityController("high");
    expect(controller.observe(25, 2)).toBeNull();
    expect(controller.observe(45, 2)).toBeNull();
    expect(controller.current()).toBe("high");
    expect(controller.observe(25, 2)).toBeNull();
    expect(controller.observe(25, 2)).toBe("medium");
  });

  it("requires a longer stable period before increasing quality", () => {
    const controller = new AdaptiveQualityController("low");
    expect(controller.observe(60, 8)).toBeNull();
    expect(controller.observe(60, 2)).toBe("medium");
  });

  it("uses a cooldown to prevent rapid quality oscillation", () => {
    const controller = new AdaptiveQualityController("medium");
    expect(controller.observe(20, 4)).toBe("low");
    expect(controller.observe(60, 8)).toBeNull();
    expect(controller.observe(60, 8)).toBeNull();
    expect(controller.observe(60, 2)).toBe("medium");
  });
});
