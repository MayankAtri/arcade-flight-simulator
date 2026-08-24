import { FLIGHT_TUNING } from "../flight/tuning";
import type { FlightLesson, LessonStep, LessonTelemetry, TrainingGate } from "./types";

const KNOTS_PER_METER_PER_SECOND = 1.94384;
const FEET_PER_METER = 3.28084;

export type LessonRunState = {
  lessonId: string;
  stepIndex: number;
  sustainedSeconds: number;
  previousSimulationTimeSeconds: number;
  lessonStartHeadingDegrees: number;
  lessonStartAltitudeMeters: number;
  stepStartHeadingDegrees: number;
  stepStartAltitudeMeters: number;
  completed: boolean;
  failed: boolean;
  checkpointRestartRequested: boolean;
  feedback: string;
};

export const beginLessonRun = (lesson: FlightLesson, telemetry: LessonTelemetry): LessonRunState => ({
  lessonId: lesson.id,
  stepIndex: 0,
  sustainedSeconds: 0,
  previousSimulationTimeSeconds: telemetry.simulationTimeSeconds,
  lessonStartHeadingDegrees: telemetry.headingDegrees,
  lessonStartAltitudeMeters: telemetry.altitudeAglMeters,
  stepStartHeadingDegrees: telemetry.headingDegrees,
  stepStartAltitudeMeters: telemetry.altitudeAglMeters,
  completed: false,
  failed: false,
  checkpointRestartRequested: false,
  feedback: "Follow the first instruction.",
});

const angleDeltaDegrees = (heading: number, reference: number): number => {
  const wrapped = ((heading - reference + 540) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
};

const toRadians = (degrees: number): number => degrees * Math.PI / 180;

const distanceMeters = (gate: TrainingGate, telemetry: LessonTelemetry): number => {
  const latitudeDelta = toRadians(telemetry.latitudeDegrees - gate.latitudeDegrees);
  const longitudeDelta = toRadians(telemetry.longitudeDegrees - gate.longitudeDegrees);
  const latitudeA = toRadians(gate.latitudeDegrees);
  const latitudeB = toRadians(telemetry.latitudeDegrees);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  const horizontal = 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return Math.hypot(horizontal, telemetry.altitudeAglMeters - gate.altitudeAglMeters);
};

export const distanceToTrainingGate = (
  lesson: FlightLesson,
  step: LessonStep,
  telemetry: LessonTelemetry,
): number | null => {
  if (!step.gateId) return null;
  const gate = lesson.gates.find((candidate) => candidate.id === step.gateId);
  return gate ? distanceMeters(gate, telemetry) : null;
};

const isStepValid = (
  lesson: FlightLesson,
  step: LessonStep,
  state: LessonRunState,
  telemetry: LessonTelemetry,
): boolean => {
  const speedKnots = telemetry.airspeedMetersPerSecond * KNOTS_PER_METER_PER_SECOND;
  const altitudeDeltaFeet = (telemetry.altitudeAglMeters - state.lessonStartAltitudeMeters) * FEET_PER_METER;
  const stepHeadingDelta = angleDeltaDegrees(telemetry.headingDegrees, state.stepStartHeadingDegrees);
  const lessonHeadingDelta = angleDeltaDegrees(telemetry.headingDegrees, state.lessonStartHeadingDegrees);
  const gateDistance = distanceToTrainingGate(lesson, step, telemetry);

  if (gateDistance !== null) {
    const gate = lesson.gates.find((candidate) => candidate.id === step.gateId);
    return Boolean(gate && gateDistance <= gate.radiusMeters);
  }

  switch (step.id) {
    case "brake-check": return telemetry.brakes >= 0.5;
    case "release-brakes": return telemetry.brakes < 0.05;
    case "full-throttle": return telemetry.throttle >= 0.9;
    case "rotation-speed": return speedKnots >= 55;
    case "rotate": return !telemetry.grounded && telemetry.altitudeAglMeters > 2;
    case "climb-150": return !telemetry.grounded && telemetry.altitudeAglMeters >= 45.72;
    case "gentle-left": return telemetry.bankDegrees <= -20 && telemetry.bankDegrees >= -35 && stepHeadingDelta <= -45;
    case "gentle-right": return telemetry.bankDegrees >= 20 && telemetry.bankDegrees <= 35 && stepHeadingDelta >= 45;
    case "return-to-airport":
      return Math.abs(angleDeltaDegrees(telemetry.headingDegrees, 303)) <= 15
        && Math.abs(telemetry.bankDegrees) <= 10
        && speedKnots >= 65;
    case "turn-final":
      return Math.abs(angleDeltaDegrees(telemetry.headingDegrees, 121)) <= 15
        && Math.abs(telemetry.bankDegrees) <= 10
        && speedKnots >= 55;
    case "hold-altitude": return Math.abs(altitudeDeltaFeet) <= 100 && !telemetry.grounded;
    case "hold-heading": return Math.abs(lessonHeadingDelta) <= 10 && !telemetry.grounded;
    case "hold-speed": return speedKnots >= 80 && speedKnots <= 110 && !telemetry.grounded;
    case "reduce-power": return telemetry.throttle <= 0.7;
    case "restore-flight":
      return telemetry.throttle >= 0.85
        && Math.abs(altitudeDeltaFeet) <= 100
        && Math.abs(lessonHeadingDelta) <= 10
        && speedKnots >= 80
        && speedKnots <= 110;
    case "left-turn":
      return telemetry.bankDegrees <= -20
        && telemetry.bankDegrees >= -35
        && stepHeadingDelta <= -70
        && speedKnots >= 65
        && Math.abs(altitudeDeltaFeet) <= 200;
    case "level-left": return Math.abs(telemetry.bankDegrees) <= 5 && Math.abs(altitudeDeltaFeet) <= 200;
    case "right-turn":
      return telemetry.bankDegrees >= 20
        && telemetry.bankDegrees <= 35
        && stepHeadingDelta >= 70
        && speedKnots >= 65
        && Math.abs(altitudeDeltaFeet) <= 200;
    case "level-right":
      return Math.abs(telemetry.bankDegrees) <= 5
        && speedKnots >= 65
        && Math.abs(altitudeDeltaFeet) <= 200;
    case "enter-stall": return !telemetry.grounded && speedKnots <= 48 && telemetry.pitchDegrees >= 12;
    case "recognize-stall": return telemetry.stalled && !telemetry.grounded;
    case "lower-nose": return telemetry.pitchDegrees <= -5;
    case "apply-power": return telemetry.throttle >= 0.95;
    case "recover-speed": return speedKnots >= 65 && !telemetry.stalled;
    case "positive-climb":
      return telemetry.verticalSpeedMetersPerSecond >= 1
        && telemetry.pitchDegrees > 0
        && speedKnots >= 65
        && state.lessonStartAltitudeMeters - telemetry.altitudeAglMeters <= 300;
    case "landing-speed": return speedKnots >= 55 && speedKnots <= 80;
    case "set-flaps": return telemetry.flaps >= 0.5;
    case "controlled-descent":
      return telemetry.verticalSpeedMetersPerSecond <= -0.5
        && telemetry.verticalSpeedMetersPerSecond >= -3.6
        && !telemetry.grounded;
    case "touchdown":
      return telemetry.grounded && (telemetry.landingStatus === "smooth" || telemetry.landingStatus === "hard");
    case "full-stop": return telemetry.grounded && speedKnots < 5 && telemetry.brakes >= 0.5;
    default: return false;
  }
};

const checkpointStepIndex = (lesson: FlightLesson): number => (
  lesson.landingCheckpointStepId
    ? Math.max(0, lesson.steps.findIndex((step) => step.id === lesson.landingCheckpointStepId))
    : -1
);

export const restartLessonStep = (
  state: LessonRunState,
  telemetry: LessonTelemetry,
): LessonRunState => ({
  ...state,
  sustainedSeconds: 0,
  previousSimulationTimeSeconds: telemetry.simulationTimeSeconds,
  stepStartHeadingDegrees: telemetry.headingDegrees,
  stepStartAltitudeMeters: telemetry.altitudeAglMeters,
  failed: false,
  checkpointRestartRequested: false,
  feedback: "Step restarted.",
});

export const restartLessonAtCheckpoint = (
  lesson: FlightLesson,
  state: LessonRunState,
  telemetry: LessonTelemetry,
): LessonRunState => ({
  ...restartLessonStep(state, telemetry),
  stepIndex: checkpointStepIndex(lesson),
  lessonStartHeadingDegrees: lesson.landingCheckpointSpawn?.headingDegrees ?? telemetry.headingDegrees,
  lessonStartAltitudeMeters: lesson.landingCheckpointSpawn?.airborneAltitudeMeters ?? telemetry.altitudeAglMeters,
  feedback: "Approach checkpoint restored.",
});

export const evaluateLessonRun = (
  lesson: FlightLesson,
  state: LessonRunState,
  telemetry: LessonTelemetry,
): LessonRunState => {
  if (state.completed || state.failed || state.checkpointRestartRequested) return state;
  const currentStep = lesson.steps[state.stepIndex];
  if (!currentStep) return { ...state, completed: true, feedback: "Lesson complete." };

  const landingCheckpoint = checkpointStepIndex(lesson);
  const inLandingPhase = landingCheckpoint >= 0 && state.stepIndex >= landingCheckpoint;
  if (telemetry.crashed || telemetry.landingStatus === "severe" || telemetry.landingStatus === "crashed") {
    if (inLandingPhase && lesson.landingCheckpointSpawn) {
      return {
        ...state,
        previousSimulationTimeSeconds: telemetry.simulationTimeSeconds,
        checkpointRestartRequested: true,
        feedback: "Severe landing. Restarting from the approach checkpoint.",
      };
    }
    return {
      ...state,
      previousSimulationTimeSeconds: telemetry.simulationTimeSeconds,
      failed: true,
      feedback: "The aircraft was lost. Restart the lesson when ready.",
    };
  }

  if (lesson.id !== "first-flight" && lesson.id !== "approach-and-landing" && telemetry.grounded) {
    return {
      ...state,
      previousSimulationTimeSeconds: telemetry.simulationTimeSeconds,
      failed: true,
      feedback: "The lesson requires continuous flight. Restart and try again.",
    };
  }

  const deltaSeconds = telemetry.paused
    ? 0
    : Math.max(0, Math.min(0.25, telemetry.simulationTimeSeconds - state.previousSimulationTimeSeconds));
  const valid = isStepValid(lesson, currentStep, state, telemetry);
  const sustainedSeconds = valid ? state.sustainedSeconds + deltaSeconds : 0;
  if (sustainedSeconds + 1e-6 < currentStep.sustainSeconds) {
    return {
      ...state,
      sustainedSeconds,
      previousSimulationTimeSeconds: telemetry.simulationTimeSeconds,
      feedback: valid
        ? `Hold for ${Math.max(0, currentStep.sustainSeconds - sustainedSeconds).toFixed(1)} seconds.`
        : currentStep.target,
    };
  }

  const nextIndex = state.stepIndex + 1;
  if (nextIndex >= lesson.steps.length) {
    return {
      ...state,
      stepIndex: lesson.steps.length - 1,
      sustainedSeconds: currentStep.sustainSeconds,
      previousSimulationTimeSeconds: telemetry.simulationTimeSeconds,
      completed: true,
      feedback: "Lesson complete.",
    };
  }
  return {
    ...state,
    stepIndex: nextIndex,
    sustainedSeconds: 0,
    previousSimulationTimeSeconds: telemetry.simulationTimeSeconds,
    stepStartHeadingDegrees: telemetry.headingDegrees,
    stepStartAltitudeMeters: telemetry.altitudeAglMeters,
    feedback: "Objective complete. Continue to the next instruction.",
  };
};

export const lessonStepProgress = (lesson: FlightLesson, state: LessonRunState): number => {
  const step = lesson.steps[state.stepIndex];
  if (!step) return 1;
  const held = step.sustainSeconds > 0 ? Math.min(1, state.sustainedSeconds / step.sustainSeconds) : 0;
  return Math.min(1, (state.stepIndex + held) / lesson.steps.length);
};

export const stallThresholdKnots = FLIGHT_TUNING.stallSpeedMetersPerSecond * KNOTS_PER_METER_PER_SECOND;
