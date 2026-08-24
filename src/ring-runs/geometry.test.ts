import { describe, expect, it } from "vitest";
import { add, scale } from "../flight/math";
import { RING_COURSES } from "./courses";
import { crossesRingGate, resolveRingGate, ringGatePositions } from "./geometry";

const resolved = resolveRingGate(RING_COURSES[0].gates[0], 0);

describe("ring gate geometry", () => {
  it("creates closed finite ECEF rings for every course gate", () => {
    for (const course of RING_COURSES) {
      for (const gate of course.gates) {
        const points = ringGatePositions(resolveRingGate(gate, course.spawn.elevationMeters));
        expect(points).toHaveLength(73);
        expect(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z))).toBe(true);
        expect(points[0]).toEqual(points.at(-1));
      }
    }
  });

  it("counts a high-speed forward segment through the ring", () => {
    const before = add(resolved.centerECEF, scale(resolved.normalECEF, -500));
    const after = add(resolved.centerECEF, scale(resolved.normalECEF, 500));
    expect(crossesRingGate(before, after, resolved)).toBe(true);
  });

  it("rejects backward and outside-radius crossings", () => {
    const before = add(resolved.centerECEF, scale(resolved.normalECEF, -100));
    const after = add(resolved.centerECEF, scale(resolved.normalECEF, 100));
    expect(crossesRingGate(after, before, resolved)).toBe(false);
    expect(crossesRingGate(
      add(before, scale(resolved.rightECEF, resolved.gate.radiusMeters + 1)),
      add(after, scale(resolved.rightECEF, resolved.gate.radiusMeters + 1)),
      resolved,
    )).toBe(false);
  });
});
