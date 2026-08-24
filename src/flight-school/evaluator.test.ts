import { describe, expect, it } from "vitest";
import { FLIGHT_LESSONS } from "./lessons";
import {
  beginLessonRun,
  evaluateLessonRun,
  restartLessonAtCheckpoint,
  restartLessonStep,
  type LessonRunState,
} from "./evaluator";
import type { FlightLesson, LessonTelemetry } from "./types";

const KNOTS_PER_METER_PER_SECOND = 1.94384;

const telemetry = (overrides: Partial<LessonTelemetry> = {}): LessonTelemetry => ({
  latitudeDegrees: 25.252836,
  longitudeDegrees: 55.364376,
  airspeedMetersPerSecond: 45,
  altitudeAglMeters: 304.8,
  headingDegrees: 121,
  verticalSpeedMetersPerSecond: 0,
  pitchDegrees: 0,
  bankDegrees: 0,
  throttle: 1,
  brakes: 0,
  flaps: 0,
  grounded: false,
  crashed: false,
  landingStatus: "",
  stalled: false,
  paused: false,
  simulationTimeSeconds: 0,
  ...overrides,
});

const stateAtStep = (lessonId: string, stepIndex: number, overrides: Partial<LessonRunState> = {}): LessonRunState => {
  const lesson = FLIGHT_LESSONS.find((candidate) => candidate.id === lessonId)!;
  return {
    ...beginLessonRun(lesson, telemetry()),
    stepIndex,
    ...overrides,
  };
};

const speedAtKnots = (knots: number): number => knots / KNOTS_PER_METER_PER_SECOND;

const validTelemetryForCurrentStep = (
  lesson: FlightLesson,
  state: LessonRunState,
  simulationTimeSeconds: number,
): LessonTelemetry => {
  const currentStep = lesson.steps[state.stepIndex];
  const gate = currentStep.gateId
    ? lesson.gates.find((candidate) => candidate.id === currentStep.gateId)
    : null;
  if (gate) {
    return telemetry({
      latitudeDegrees: gate.latitudeDegrees,
      longitudeDegrees: gate.longitudeDegrees,
      altitudeAglMeters: gate.altitudeAglMeters,
      simulationTimeSeconds,
    });
  }

  const common = {
    altitudeAglMeters: state.lessonStartAltitudeMeters,
    headingDegrees: state.lessonStartHeadingDegrees,
    simulationTimeSeconds,
  };
  switch (currentStep.id) {
    case "brake-check": return telemetry({ ...common, grounded: true, brakes: 1 });
    case "release-brakes": return telemetry({ ...common, grounded: true, brakes: 0 });
    case "full-throttle": return telemetry({ ...common, grounded: true, throttle: 0.95 });
    case "rotation-speed": return telemetry({ ...common, grounded: true, airspeedMetersPerSecond: speedAtKnots(58) });
    case "rotate": return telemetry({ ...common, grounded: false, altitudeAglMeters: 3 });
    case "climb-150": return telemetry({ ...common, grounded: false, altitudeAglMeters: 46 });
    case "gentle-left":
      return telemetry({ ...common, bankDegrees: -25, headingDegrees: state.stepStartHeadingDegrees - 50 });
    case "gentle-right":
      return telemetry({ ...common, bankDegrees: 25, headingDegrees: state.stepStartHeadingDegrees + 50 });
    case "return-to-airport":
      return telemetry({ ...common, bankDegrees: 0, headingDegrees: 303, airspeedMetersPerSecond: speedAtKnots(80) });
    case "turn-final":
      return telemetry({ ...common, bankDegrees: 0, headingDegrees: 121, airspeedMetersPerSecond: speedAtKnots(70) });
    case "hold-altitude": return telemetry({ ...common, grounded: false });
    case "hold-heading": return telemetry({ ...common, grounded: false });
    case "hold-speed": return telemetry({ ...common, grounded: false, airspeedMetersPerSecond: speedAtKnots(95) });
    case "reduce-power": return telemetry({ ...common, throttle: 0.65 });
    case "restore-flight":
      return telemetry({ ...common, grounded: false, throttle: 0.9, airspeedMetersPerSecond: speedAtKnots(95) });
    case "left-turn":
      return telemetry({
        ...common,
        bankDegrees: -25,
        headingDegrees: state.stepStartHeadingDegrees - 75,
        airspeedMetersPerSecond: speedAtKnots(80),
      });
    case "level-left": return telemetry({ ...common, bankDegrees: 0, airspeedMetersPerSecond: speedAtKnots(80) });
    case "right-turn":
      return telemetry({
        ...common,
        bankDegrees: 25,
        headingDegrees: state.stepStartHeadingDegrees + 75,
        airspeedMetersPerSecond: speedAtKnots(80),
      });
    case "level-right": return telemetry({ ...common, bankDegrees: 0, airspeedMetersPerSecond: speedAtKnots(80) });
    case "enter-stall":
      return telemetry({ ...common, grounded: false, pitchDegrees: 15, airspeedMetersPerSecond: speedAtKnots(45) });
    case "recognize-stall": return telemetry({ ...common, grounded: false, stalled: true, airspeedMetersPerSecond: speedAtKnots(42) });
    case "lower-nose": return telemetry({ ...common, grounded: false, pitchDegrees: -8 });
    case "apply-power": return telemetry({ ...common, grounded: false, throttle: 1 });
    case "recover-speed":
      return telemetry({ ...common, grounded: false, stalled: false, airspeedMetersPerSecond: speedAtKnots(70) });
    case "positive-climb":
      return telemetry({
        ...common,
        grounded: false,
        pitchDegrees: 6,
        verticalSpeedMetersPerSecond: 2,
        airspeedMetersPerSecond: speedAtKnots(70),
      });
    case "landing-speed": return telemetry({ ...common, grounded: false, airspeedMetersPerSecond: speedAtKnots(65) });
    case "set-flaps": return telemetry({ ...common, grounded: false, flaps: 0.5 });
    case "controlled-descent": return telemetry({ ...common, grounded: false, verticalSpeedMetersPerSecond: -1.5 });
    case "touchdown": return telemetry({ ...common, grounded: true, landingStatus: "smooth" });
    case "full-stop": return telemetry({ ...common, grounded: true, airspeedMetersPerSecond: 0, brakes: 1 });
    default: throw new Error(`No deterministic telemetry for Flight School step: ${currentStep.id}`);
  }
};

const completeCurrentStep = (
  lesson: FlightLesson,
  initialState: LessonRunState,
  initialTime: number,
): { state: LessonRunState; time: number } => {
  const startingIndex = initialState.stepIndex;
  let state = initialState;
  let time = initialTime;
  for (let sample = 0; sample < 30 && state.stepIndex === startingIndex && !state.completed; sample += 1) {
    time += 0.25;
    state = evaluateLessonRun(lesson, state, validTelemetryForCurrentStep(lesson, state, time));
  }
  expect(state.failed, `${lesson.id} failed at ${lesson.steps[startingIndex].id}`).toBe(false);
  expect(state.checkpointRestartRequested, `${lesson.id} requested a checkpoint at ${lesson.steps[startingIndex].id}`).toBe(false);
  expect(
    state.completed || state.stepIndex === startingIndex + 1,
    `${lesson.id} did not advance from ${lesson.steps[startingIndex].id}`,
  ).toBe(true);
  return { state, time };
};

describe("flight school evaluator", () => {
  it("requires a condition to remain valid for its sustained duration", () => {
    const lesson = FLIGHT_LESSONS.find((candidate) => candidate.id === "straight-and-level")!;
    let state = beginLessonRun(lesson, telemetry());
    for (let sample = 1; sample < 50; sample += 1) {
      state = evaluateLessonRun(lesson, state, telemetry({ simulationTimeSeconds: sample / 10 }));
      expect(state.stepIndex).toBe(0);
    }
    state = evaluateLessonRun(lesson, state, telemetry({ simulationTimeSeconds: 5 }));
    expect(state.stepIndex).toBe(1);
  });

  it("resets sustained progress after an invalid sample", () => {
    const lesson = FLIGHT_LESSONS.find((candidate) => candidate.id === "straight-and-level")!;
    let state = beginLessonRun(lesson, telemetry());
    state = evaluateLessonRun(lesson, state, telemetry({ simulationTimeSeconds: 2 }));
    state = evaluateLessonRun(lesson, state, telemetry({ simulationTimeSeconds: 2.1, altitudeAglMeters: 400 }));
    expect(state.sustainedSeconds).toBe(0);
  });

  it("does not accumulate hold time while paused", () => {
    const lesson = FLIGHT_LESSONS.find((candidate) => candidate.id === "straight-and-level")!;
    const state = beginLessonRun(lesson, telemetry());
    const next = evaluateLessonRun(lesson, state, telemetry({ simulationTimeSeconds: 10, paused: true }));
    expect(next.sustainedSeconds).toBe(0);
  });

  it("accepts only the active training gate center", () => {
    const lesson = FLIGHT_LESSONS[0];
    const gateStepIndex = lesson.steps.findIndex((candidate) => candidate.id === "departure-1");
    const gate = lesson.gates.find((candidate) => candidate.id === "departure-1")!;
    const state = stateAtStep(lesson.id, gateStepIndex);
    const next = evaluateLessonRun(lesson, state, telemetry({
      latitudeDegrees: gate.latitudeDegrees,
      longitudeDegrees: gate.longitudeDegrees,
      altitudeAglMeters: gate.altitudeAglMeters,
      simulationTimeSeconds: 0.25,
    }));
    expect(next.stepIndex).toBe(gateStepIndex + 1);
  });

  it("requests a landing checkpoint restart after a severe approach impact", () => {
    const lesson = FLIGHT_LESSONS[0];
    const checkpointIndex = lesson.steps.findIndex((candidate) => candidate.id === lesson.landingCheckpointStepId);
    const state = stateAtStep(lesson.id, checkpointIndex);
    const failed = evaluateLessonRun(lesson, state, telemetry({ grounded: true, landingStatus: "severe" }));
    expect(failed.checkpointRestartRequested).toBe(true);
    const restarted = restartLessonAtCheckpoint(lesson, failed, telemetry({ simulationTimeSeconds: 2 }));
    expect(restarted.stepIndex).toBe(checkpointIndex);
    expect(restarted.checkpointRestartRequested).toBe(false);
  });

  it("fails an airborne lesson after a crash", () => {
    const lesson = FLIGHT_LESSONS.find((candidate) => candidate.id === "controlled-turns")!;
    const state = beginLessonRun(lesson, telemetry());
    expect(evaluateLessonRun(lesson, state, telemetry({ crashed: true })).failed).toBe(true);
  });

  it.each(FLIGHT_LESSONS.map((lesson) => [lesson.title, lesson] as const))(
    "completes every authored step in %s with valid sustained telemetry",
    (_title, lesson) => {
      let time = 0;
      let state = beginLessonRun(lesson, telemetry({
        altitudeAglMeters: lesson.spawn.mode === "air" ? lesson.spawn.airborneAltitudeMeters ?? 304.8 : 0,
        headingDegrees: lesson.spawn.headingDegrees,
        grounded: lesson.spawn.mode === "runway",
      }));
      for (let stepIndex = 0; stepIndex < lesson.steps.length; stepIndex += 1) {
        expect(state.stepIndex).toBe(stepIndex);
        ({ state, time } = completeCurrentStep(lesson, state, time));
      }
      expect(state.completed).toBe(true);
      expect(state.stepIndex).toBe(lesson.steps.length - 1);
    },
  );

  it("fails First Flight crashes before approach and restores approach crashes from its checkpoint", () => {
    const lesson = FLIGHT_LESSONS[0];
    const departureState = stateAtStep(lesson.id, lesson.steps.findIndex((step) => step.id === "departure-2"));
    expect(evaluateLessonRun(lesson, departureState, telemetry({ crashed: true })).failed).toBe(true);

    const checkpointIndex = lesson.steps.findIndex((step) => step.id === lesson.landingCheckpointStepId);
    const approachState = stateAtStep(lesson.id, checkpointIndex + 1);
    const interrupted = evaluateLessonRun(lesson, approachState, telemetry({ landingStatus: "crashed", grounded: true }));
    const restored = restartLessonAtCheckpoint(lesson, interrupted, telemetry({
      altitudeAglMeters: lesson.landingCheckpointSpawn!.airborneAltitudeMeters,
      headingDegrees: lesson.landingCheckpointSpawn!.headingDegrees,
      simulationTimeSeconds: 4,
    }));
    expect(restored.stepIndex).toBe(checkpointIndex);
    expect(restored.lessonStartAltitudeMeters).toBe(lesson.landingCheckpointSpawn!.airborneAltitudeMeters);
    expect(restored.lessonStartHeadingDegrees).toBe(lesson.landingCheckpointSpawn!.headingDegrees);
  });

  it("requires an actual brake check before First Flight can release the brakes", () => {
    const lesson = FLIGHT_LESSONS[0];
    let state = beginLessonRun(lesson, telemetry({ grounded: true, brakes: 0 }));
    state = evaluateLessonRun(lesson, state, telemetry({ grounded: true, brakes: 0, simulationTimeSeconds: 1 }));
    expect(lesson.steps[state.stepIndex].id).toBe("brake-check");
    state = evaluateLessonRun(lesson, state, telemetry({ grounded: true, brakes: 1, simulationTimeSeconds: 1.25 }));
    state = evaluateLessonRun(lesson, state, telemetry({ grounded: true, brakes: 1, simulationTimeSeconds: 1.5 }));
    state = evaluateLessonRun(lesson, state, telemetry({ grounded: true, brakes: 1, simulationTimeSeconds: 1.75 }));
    expect(lesson.steps[state.stepIndex].id).toBe("release-brakes");
  });

  it("restarts a step with fresh sustain, heading, altitude, and time baselines", () => {
    const lesson = FLIGHT_LESSONS.find((candidate) => candidate.id === "controlled-turns")!;
    const state = stateAtStep(lesson.id, 2, { sustainedSeconds: 0.75, failed: true });
    const restarted = restartLessonStep(state, telemetry({
      altitudeAglMeters: 350,
      headingDegrees: 42,
      simulationTimeSeconds: 12,
    }));
    expect(restarted).toMatchObject({
      sustainedSeconds: 0,
      previousSimulationTimeSeconds: 12,
      stepStartHeadingDegrees: 42,
      stepStartAltitudeMeters: 350,
      failed: false,
      checkpointRestartRequested: false,
    });
  });
});
