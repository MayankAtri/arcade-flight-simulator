import type { SpawnRequest } from "../flight/types";

export type RingRunDifficulty = "easy" | "medium" | "hard";
export type RingRunMedal = "gold" | "silver" | "bronze";

export type RingGate = {
  id: string;
  label: string;
  latitudeDegrees: number;
  longitudeDegrees: number;
  altitudeAglMeters: number;
  headingDegrees: number;
  flightPathAngleDegrees: number;
  radiusMeters: number;
};

export type RingCourse = {
  id: string;
  title: string;
  location: string;
  summary: string;
  difficulty: RingRunDifficulty;
  distanceKilometers: number;
  spawn: SpawnRequest;
  localHour: number;
  gates: readonly RingGate[];
  medalTimesSeconds: {
    bronze: number;
    silver: number;
    gold: number;
  };
};

export type RingRunPhase = "countdown" | "racing" | "complete" | "failed";

export type RingRunSnapshot = {
  courseId: string;
  phase: RingRunPhase;
  activeGateIndex: number;
  totalGates: number;
  countdownSeconds: number;
  elapsedSeconds: number;
  distanceToActiveGateMeters: number;
  lastGateSplitSeconds: number | null;
};
