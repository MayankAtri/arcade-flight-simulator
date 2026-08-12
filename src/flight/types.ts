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
  brake: boolean;
};

export type FlightEnvironment = {
  groundHeight: number;
  terrainReliable: boolean;
};

export type FlightTelemetry = {
  airspeedMetersPerSecond: number;
  altitudeMslMeters: number;
  altitudeAglMeters: number;
  headingDegrees: number;
  verticalSpeedMetersPerSecond: number;
  throttle: number;
  brakes: number;
  flaps: number;
  grounded: boolean;
  crashed: boolean;
  landingStatus: "" | "smooth" | "hard" | "severe" | "crashed";
};

export type SpawnRequest = {
  latitudeDegrees: number;
  longitudeDegrees: number;
  elevationMeters: number;
  headingDegrees: number;
  mode: "runway" | "air";
  airborneAltitudeMeters?: number;
};
