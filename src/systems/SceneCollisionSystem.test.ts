import { describe, expect, it } from "vitest";
import { isBuildingProbeHit } from "./SceneCollisionSystem";

describe("scene collision probes", () => {
  it("accepts visible building hits inside the aircraft probe envelope", () => {
    expect(isBuildingProbeHit(0, 28)).toBe(true);
    expect(isBuildingProbeHit(27.9, 28)).toBe(true);
  });

  it("rejects distant, invalid, and behind-probe results", () => {
    expect(isBuildingProbeHit(28.1, 28)).toBe(false);
    expect(isBuildingProbeHit(-1, 28)).toBe(false);
    expect(isBuildingProbeHit(Number.NaN, 28)).toBe(false);
  });
});
