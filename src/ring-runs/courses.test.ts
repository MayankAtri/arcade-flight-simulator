import { describe, expect, it } from "vitest";
import { RING_COURSES } from "./courses";

describe("Ring Run courses", () => {
  it("ships the planned Dubai, Big Sur, and Madeira progression", () => {
    expect(RING_COURSES.map((course) => [course.id, course.difficulty, course.gates.length])).toEqual([
      ["dubai-waterfront-sprint", "easy", 12],
      ["big-sur-coastal-line", "medium", 15],
      ["madeira-ridge-run", "hard", 18],
    ]);
  });

  it("uses unique gate ids, airborne spawns, and ordered medal thresholds", () => {
    const gateIds = RING_COURSES.flatMap((course) => course.gates.map((gate) => gate.id));
    expect(new Set(gateIds).size).toBe(gateIds.length);
    for (const course of RING_COURSES) {
      expect(course.spawn.mode).toBe("air");
      expect(course.spawn.airborneAltitudeMeters).toBeGreaterThan(0);
      expect(course.medalTimesSeconds.gold).toBeLessThan(course.medalTimesSeconds.silver);
      expect(course.medalTimesSeconds.silver).toBeLessThan(course.medalTimesSeconds.bronze);
    }
  });
});
