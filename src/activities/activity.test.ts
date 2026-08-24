import { describe, expect, it } from "vitest";
import { exitActivity, FREE_FLIGHT_ACTIVITY, setActivityPhase, startActivity } from "./activity";

describe("activity sessions", () => {
  it("replaces the current structured mode instead of overlapping it", () => {
    const lesson = startActivity("lesson", "first-flight");
    const challenge = startActivity("challenge", "tagus-river-arrival");
    const ringRun = startActivity("ring-run", "dubai-waterfront-sprint");
    expect(lesson).toEqual({ mode: "lesson", activityId: "first-flight", phase: "active" });
    expect(challenge).toEqual({ mode: "challenge", activityId: "tagus-river-arrival", phase: "active" });
    expect(ringRun).toEqual({ mode: "ring-run", activityId: "dubai-waterfront-sprint", phase: "active" });
  });

  it("supports lifecycle phases and a clean free-flight exit", () => {
    const lesson = startActivity("lesson", "straight-and-level");
    expect(setActivityPhase(lesson, "paused").phase).toBe("paused");
    expect(setActivityPhase(lesson, "complete").phase).toBe("complete");
    expect(exitActivity()).toEqual(FREE_FLIGHT_ACTIVITY);
  });
});
