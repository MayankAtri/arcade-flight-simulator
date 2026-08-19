import { describe, expect, it } from "vitest";
import { calculateDaylightState, clampDaylightHour } from "./DaylightSystem";

describe("DaylightSystem", () => {
  it("keeps time inside the dawn-to-sunset range", () => {
    expect(clampDaylightHour(20)).toBe(17.5);
    expect(clampDaylightHour(2)).toBe(6);
    expect(clampDaylightHour(Number.NaN)).toBe(12);
  });

  it("classifies representative daylight times", () => {
    expect(calculateDaylightState(6.5).phase).toBe("dawn");
    expect(calculateDaylightState(12).phase).toBe("day");
    expect(calculateDaylightState(17.5).phase).toBe("dusk");
  });

  it("provides more illumination at noon than at dawn", () => {
    const noon = calculateDaylightState(12);
    const dawn = calculateDaylightState(6);
    expect(noon.daylight).toBeGreaterThan(0.99);
    expect(dawn.daylight).toBeLessThan(noon.daylight);
  });
});
