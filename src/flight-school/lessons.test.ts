import { describe, expect, it } from "vitest";
import { FLIGHT_LESSONS } from "./lessons";

describe("Flight School syllabus", () => {
  it("defines all five planned lessons with runnable spawns and objective steps", () => {
    expect(FLIGHT_LESSONS.map((lesson) => lesson.id)).toEqual([
      "first-flight",
      "straight-and-level",
      "controlled-turns",
      "stall-and-recovery",
      "approach-and-landing",
    ]);
    for (const lesson of FLIGHT_LESSONS) {
      expect(lesson.steps.length).toBeGreaterThan(3);
      expect(lesson.localHour).toBeGreaterThanOrEqual(6);
      expect(lesson.localHour).toBeLessThanOrEqual(17.5);
      expect(Number.isFinite(lesson.spawn.latitudeDegrees)).toBe(true);
    }
  });

  it("keeps every school gate connected to a lesson step", () => {
    for (const lesson of FLIGHT_LESSONS) {
      const stepGateIds = new Set(lesson.steps.flatMap((step) => step.gateId ? [step.gateId] : []));
      for (const gate of lesson.gates) {
        expect(stepGateIds.has(gate.id)).toBe(true);
        expect(gate.radiusMeters).toBeGreaterThan(30);
      }
    }
  });

  it("keeps First Flight's brake check and return alignment in the playable sequence", () => {
    const firstFlight = FLIGHT_LESSONS.find((lesson) => lesson.id === "first-flight")!;
    const stepIds = firstFlight.steps.map((step) => step.id);
    expect(stepIds.slice(0, 3)).toEqual(["brake-check", "release-brakes", "full-throttle"]);
    expect(stepIds.indexOf("return-to-airport")).toBe(stepIds.indexOf("gentle-right") + 1);
    expect(stepIds.indexOf("approach-1")).toBe(stepIds.indexOf("return-to-airport") + 1);
    expect(stepIds.indexOf("turn-final")).toBe(stepIds.indexOf("approach-1") + 1);
    expect(stepIds.indexOf("approach-2")).toBe(stepIds.indexOf("turn-final") + 1);
  });

  it("starts airborne lessons at full power without changing free-flight spawn tuning", () => {
    const runwayLesson = FLIGHT_LESSONS.find((lesson) => lesson.spawn.mode === "runway")!;
    const airborneLessons = FLIGHT_LESSONS.filter((lesson) => lesson.spawn.mode === "air");

    expect(runwayLesson.initialThrottle).toBe(0);
    expect(airborneLessons).toHaveLength(4);
    expect(airborneLessons.every((lesson) => lesson.initialThrottle === 1)).toBe(true);
  });

  it("places the First Flight departure gates beyond the takeoff and climb segment", () => {
    const firstFlight = FLIGHT_LESSONS.find((lesson) => lesson.id === "first-flight")!;
    const departureGates = firstFlight.gates.filter((gate) => gate.id.startsWith("departure-"));
    const distanceFromSpawn = (gate: (typeof departureGates)[number]) => {
      const latitudeMeters = (gate.latitudeDegrees - firstFlight.spawn.latitudeDegrees) * 111_320;
      const longitudeMeters = (gate.longitudeDegrees - firstFlight.spawn.longitudeDegrees)
        * 111_320
        * Math.cos(firstFlight.spawn.latitudeDegrees * Math.PI / 180);
      return Math.hypot(latitudeMeters, longitudeMeters);
    };
    const distances = departureGates.map(distanceFromSpawn);

    expect(distances[0]).toBeGreaterThan(1_500);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it("gives the descending approach gates a progressively forgiving capture radius", () => {
    const firstFlight = FLIGHT_LESSONS.find((lesson) => lesson.id === "first-flight")!;
    const radii = firstFlight.gates
      .filter((gate) => gate.id.startsWith("approach-"))
      .map((gate) => gate.radiusMeters);

    expect(radii).toEqual([70, 80, 100]);
  });
});
