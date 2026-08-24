import type { Quat, Vec3 } from "./math";

export type AircraftState = {
  positionECEF: Vec3;
  velocityECEF: Vec3;
  bodyToECEF: Quat;
  angularVelocityBody: Vec3;
  throttle: number;
  brakes: number;
  flaps: number;
  grounded: boolean;
  crashed: boolean;
};

export type FlightControls = {
  pitch: number;
  roll: number;
  yaw: number;
  throttleUp: boolean;
  throttleDown: boolean;
  throttleTarget?: number | null;
  brake: boolean;
};

export type TouchFlightControls = {
  pitch: number;
  roll: number;
  yaw: number;
  throttleTarget: number | null;
  brake: boolean;
};

export type FlightEnvironment = {
  groundHeight: number;
  terrainReliable: boolean;
  obstacleHeight?: number;
};

export type FlightTelemetry = {
  airspeedMetersPerSecond: number;
  altitudeMslMeters: number;
  altitudeAglMeters: number;
  headingDegrees: number;
  pitchDegrees: number;
  bankDegrees: number;
  verticalSpeedMetersPerSecond: number;
  throttle: number;
  brakes: number;
  flaps: number;
  grounded: boolean;
  crashed: boolean;
  crashReason: "" | "terrain" | "building";
  landingStatus: "" | "smooth" | "hard" | "severe" | "crashed";
  stalled: boolean;
};

export type SpawnRequest = {
  latitudeDegrees: number;
  longitudeDegrees: number;
  elevationMeters: number;
  headingDegrees: number;
  mode: "runway" | "air";
  airborneAltitudeMeters?: number;
};
