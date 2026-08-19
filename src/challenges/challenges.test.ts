import { describe, expect, it } from "vitest";
import {
  FLIGHT_CHALLENGES,
  challengeDistanceKilometers,
  challengeSpawnRequest,
  isChallengeLegComplete,
  type ChallengeTelemetry,
} from "./challenges";

const telemetry = (overrides: Partial<ChallengeTelemetry> = {}): ChallengeTelemetry => ({
  latitudeDegrees: 38.731125,
  longitudeDegrees: -9.357399,
  altitudeAglMeters: 0,
  airspeedMetersPerSecond: 0,
  grounded: true,
  crashed: false,
  ...overrides,
});

describe("flight challenges", () => {
  it("defines six runnable routes with available origin airports", () => {
    expect(FLIGHT_CHALLENGES).toHaveLength(6);
    for (const challenge of FLIGHT_CHALLENGES) {
      const spawn = challengeSpawnRequest(challenge);
      expect(spawn.mode).toBe("runway");
      expect(Number.isFinite(spawn.latitudeDegrees)).toBe(true);
      expect(challenge.legs.at(-1)?.kind).toBe("landing");
    }
  });

  it("advances the departure only after a positive climb", () => {
    const departure = FLIGHT_CHALLENGES[0].legs[0];
    expect(isChallengeLegComplete(departure, telemetry())).toBe(false);
    expect(isChallengeLegComplete(departure, telemetry({ grounded: false, altitudeAglMeters: 46 }))).toBe(true);
  });

  it("uses route proximity for waypoint legs", () => {
    const waypoint = FLIGHT_CHALLENGES[0].legs[1];
    expect(isChallengeLegComplete(waypoint, telemetry({
      latitudeDegrees: waypoint.latitude,
      longitudeDegrees: waypoint.longitude,
      grounded: false,
      altitudeAglMeters: 300,
    }))).toBe(true);
    expect(challengeDistanceKilometers(38.73, -9.47, 38.73, -9.47)).toBeCloseTo(0);
  });

  it("requires a safe stopped landing inside the destination radius", () => {
    const landing = FLIGHT_CHALLENGES[0].legs.at(-1)!;
    expect(isChallengeLegComplete(landing, telemetry({
      latitudeDegrees: landing.latitude,
      longitudeDegrees: landing.longitude,
      grounded: true,
      airspeedMetersPerSecond: 30,
    }))).toBe(false);
    expect(isChallengeLegComplete(landing, telemetry({
      latitudeDegrees: landing.latitude,
      longitudeDegrees: landing.longitude,
      grounded: true,
      airspeedMetersPerSecond: 10,
    }))).toBe(true);
  });
});
