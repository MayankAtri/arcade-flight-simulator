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

  it("caps automatic promotion at medium for an 8 GB device policy", () => {
    const controller = new AdaptiveQualityController("low", "medium");
    expect(controller.observe(60, 10)).toBe("medium");
    expect(controller.observe(60, 8)).toBeNull();
    expect(controller.observe(60, 10)).toBeNull();
    expect(controller.current()).toBe("medium");
  });

  it("allows larger-memory profiles to promote to high", () => {
    const controller = new AdaptiveQualityController("medium", "high");
    expect(controller.observe(60, 10)).toBe("high");
  });

  it("ignores invalid timing samples without poisoning later observations", () => {
    const controller = new AdaptiveQualityController("medium");
    expect(controller.observe(20, Number.NaN)).toBeNull();
    expect(controller.observe(20, Number.POSITIVE_INFINITY)).toBeNull();
    expect(controller.observe(Number.NaN, 2)).toBeNull();
    expect(controller.observe(20, 4)).toBe("low");
  });
});
