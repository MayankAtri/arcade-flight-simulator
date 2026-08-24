import { describe, expect, it } from "vitest";
import { FLIGHT_LESSONS } from "../flight-school/lessons";
import { trainingGateRingPositions } from "./TrainingGateRenderer";

describe("training gate geometry", () => {
  it("builds a closed, finite ECEF ring for every Flight School gate", () => {
    for (const lesson of FLIGHT_LESSONS) {
      for (const gate of lesson.gates) {
        const positions = trainingGateRingPositions(gate, lesson.spawn.elevationMeters);
        expect(positions).toHaveLength(73);
        expect(positions.every((position) => (
          Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z)
        ))).toBe(true);
        expect(positions[0].equalsEpsilon(positions.at(-1)!, 1e-6)).toBe(true);
      }
    }
  });
});
