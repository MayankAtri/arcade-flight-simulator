import { describe, expect, it } from "vitest";
import { RING_COURSES } from "./courses";
import {
  EMPTY_RING_RUN_PROGRESS,
  formatRunTime,
  medalForTime,
  parseRingRunProgress,
  recordRingRunTime,
} from "./progress";

describe("Ring Run progress", () => {
  it("falls back safely and removes invalid course times", () => {
    expect(parseRingRunProgress("bad-json")).toEqual(EMPTY_RING_RUN_PROGRESS);
    expect(parseRingRunProgress(JSON.stringify({
      version: 1,
      bestTimesSeconds: { "dubai-waterfront-sprint": 88.2, unknown: 5, "big-sur-coastal-line": -1 },
    }))).toEqual({ version: 1, bestTimesSeconds: { "dubai-waterfront-sprint": 88.2 } });
  });

  it("keeps only a faster valid personal best", () => {
    const first = recordRingRunTime(EMPTY_RING_RUN_PROGRESS, "dubai-waterfront-sprint", 100);
    expect(recordRingRunTime(first, "dubai-waterfront-sprint", 110)).toBe(first);
    expect(recordRingRunTime(first, "dubai-waterfront-sprint", 90).bestTimesSeconds["dubai-waterfront-sprint"]).toBe(90);
  });

  it("awards course medals and formats race time", () => {
    const course = RING_COURSES[0];
    expect(medalForTime(course, course.medalTimesSeconds.gold)).toBe("gold");
    expect(medalForTime(course, course.medalTimesSeconds.silver)).toBe("silver");
    expect(medalForTime(course, course.medalTimesSeconds.bronze + 1)).toBeNull();
    expect(formatRunTime(65.25)).toBe("1:05.3");
  });
});
