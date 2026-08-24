import { describe, expect, it } from "vitest";
import {
  formatCompassHeading,
  normalizeHeadingDegrees,
  shortestAngularDeltaDegrees,
  unwrapHeadingDegrees,
} from "./HudInstruments";

describe("HUD instruments", () => {
  it("normalizes compass headings across the 0 and 360 boundary", () => {
    expect(normalizeHeadingDegrees(-1)).toBe(359);
    expect(normalizeHeadingDegrees(360)).toBe(0);
    expect(normalizeHeadingDegrees(721)).toBe(1);
  });

  it("uses the shortest direction when the compass crosses north", () => {
    expect(shortestAngularDeltaDegrees(359, 1)).toBe(2);
    expect(shortestAngularDeltaDegrees(1, 359)).toBe(-2);
    expect(unwrapHeadingDegrees(359, 1)).toBe(361);
    expect(unwrapHeadingDegrees(1, 359)).toBe(-1);
  });

  it("formats every heading as a three-digit aviation label", () => {
    expect(formatCompassHeading(0)).toBe("000");
    expect(formatCompassHeading(9.6)).toBe("010");
    expect(formatCompassHeading(121.4)).toBe("121");
    expect(formatCompassHeading(359.6)).toBe("360");
  });

  it("provides the complete 10-degree compass number sequence", () => {
    const labels = Array.from({ length: 36 }, (_, index) => formatCompassHeading(index * 10));
    expect(labels).toHaveLength(36);
    expect(new Set(labels).size).toBe(36);
    expect(labels[0]).toBe("000");
    expect(labels[35]).toBe("350");
  });
});
