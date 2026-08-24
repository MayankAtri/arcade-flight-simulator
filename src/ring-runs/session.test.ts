import { describe, expect, it } from "vitest";
import { add, scale } from "../flight/math";
import { RING_COURSES } from "./courses";
import { resolveRingGate } from "./geometry";
import { RingRunSession } from "./session";

const course = { ...RING_COURSES[0], gates: RING_COURSES[0].gates.slice(0, 2) };
const gates = course.gates.map((gate) => resolveRingGate(gate, 0));

const cross = (session: RingRunSession, gateIndex: number) => {
  const gate = gates[gateIndex];
  session.step(
    add(gate.centerECEF, scale(gate.normalECEF, -200)),
    add(gate.centerECEF, scale(gate.normalECEF, 200)),
    0.5,
    false,
  );
};

describe("RingRunSession", () => {
  it("freezes the timer during countdown and advances only the ordered active gate", () => {
    const session = new RingRunSession(course, gates, gates[0].centerECEF);
    session.step(gates[0].centerECEF, gates[0].centerECEF, 3, false);
    expect(session.snapshot().phase).toBe("racing");
    expect(session.snapshot().elapsedSeconds).toBe(0);
    cross(session, 1);
    expect(session.snapshot().activeGateIndex).toBe(0);
    cross(session, 0);
    expect(session.snapshot().activeGateIndex).toBe(1);
  });

  it("completes the final gate and can restart with a clean timer", () => {
    const session = new RingRunSession(course, gates, gates[0].centerECEF);
    session.step(gates[0].centerECEF, gates[0].centerECEF, 3, false);
    cross(session, 0);
    cross(session, 1);
    expect(session.snapshot().phase).toBe("complete");
    expect(session.snapshot().elapsedSeconds).toBe(1);
    session.restart(gates[0].centerECEF);
    expect(session.snapshot()).toMatchObject({ phase: "countdown", activeGateIndex: 0, elapsedSeconds: 0 });
  });

  it("fails on a crash", () => {
    const session = new RingRunSession(course, gates, gates[0].centerECEF);
    session.step(gates[0].centerECEF, gates[0].centerECEF, 0.1, true);
    expect(session.snapshot().phase).toBe("failed");
  });
});
