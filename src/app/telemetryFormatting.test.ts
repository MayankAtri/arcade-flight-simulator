import { describe, expect, it } from "vitest";
import { formatNonNegativeFeet } from "./telemetryFormatting";

describe("telemetry formatting", () => {
  it("never displays a negative height near the ground", () => {
    expect(formatNonNegativeFeet(-0.01)).toBe(0);
    expect(formatNonNegativeFeet(-1)).toBe(0);
    expect(Object.is(formatNonNegativeFeet(-0.01), -0)).toBe(false);
  });

  it("rounds positive heights to feet", () => {
    expect(formatNonNegativeFeet(1)).toBe(3);
    expect(formatNonNegativeFeet(10)).toBe(33);
  });

  it("falls back to zero for invalid telemetry", () => {
    expect(formatNonNegativeFeet(Number.NaN)).toBe(0);
    expect(formatNonNegativeFeet(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});
