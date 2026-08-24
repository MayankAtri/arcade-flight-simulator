import type { SpawnRequest } from "../flight/types";

export type LessonDifficulty = "Beginner" | "Intermediate" | "Advanced";

export type TrainingGate = {
  id: string;
  latitudeDegrees: number;
  longitudeDegrees: number;
  altitudeAglMeters: number;
  headingDegrees: number;
  flightPathAngleDegrees: number;
  radiusMeters: number;
};

export type LessonStep = {
  id: string;
  title: string;
  instruction: string;
  control: string;
  target: string;
  sustainSeconds: number;
  gateId?: string;
};

export type FlightLesson = {
  id: string;
  number: number;
  title: string;
  summary: string;
  difficulty: LessonDifficulty;
  estimatedMinutes: number;
  spawn: SpawnRequest;
  localHour: number;
  objectives: readonly string[];
  controls: readonly string[];
  steps: readonly LessonStep[];
  gates: readonly TrainingGate[];
  landingCheckpointStepId?: string;
  landingCheckpointSpawn?: SpawnRequest;
};

export type LessonTelemetry = {
  latitudeDegrees: number;
  longitudeDegrees: number;
  airspeedMetersPerSecond: number;
  altitudeAglMeters: number;
  headingDegrees: number;
  verticalSpeedMetersPerSecond: number;
  pitchDegrees: number;
  bankDegrees: number;
  throttle: number;
  brakes: number;
  flaps: number;
  grounded: boolean;
  crashed: boolean;
  landingStatus: "" | "smooth" | "hard" | "severe" | "crashed";
  stalled: boolean;
  paused: boolean;
  simulationTimeSeconds: number;
};
