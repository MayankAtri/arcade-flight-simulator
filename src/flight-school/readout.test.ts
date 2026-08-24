import { describe, expect, it } from "vitest";
import { lessonLiveReadout } from "./readout";
import type { LessonTelemetry } from "./types";

const telemetry = (overrides: Partial<LessonTelemetry> = {}): LessonTelemetry => ({
  airspeedMetersPerSecond: 50,
  altitudeAglMeters: 304.8,
  headingDegrees: 121,
  pitchDegrees: 0,
  bankDegrees: 0,
  verticalSpeedMetersPerSecond: 0,
  throttle: 1,
  brakes: 0,
  flaps: 0,
  grounded: false,
  crashed: false,
  stalled: false,
  landingStatus: "",
  latitudeDegrees: 25.25,
  longitudeDegrees: 55.36,
  paused: false,
  simulationTimeSeconds: 0,
  ...overrides,
});

describe("Flight School live readout", () => {
  it("shows bank and heading for turn objectives", () => {
    expect(lessonLiveReadout("left-turn", telemetry({ bankDegrees: -27.6, headingDegrees: 42.4 })))
      .toBe("Bank -28° · Heading 042°");
  });

  it("shows pitch and speed for stall objectives", () => {
    expect(lessonLiveReadout("enter-stall", telemetry({ airspeedMetersPerSecond: 23, pitchDegrees: 14.2 })))
      .toBe("45 kt · Pitch 14°");
  });

  it("shows altitude and vertical speed for vertical-flight objectives", () => {
    expect(lessonLiveReadout("controlled-descent", telemetry({ altitudeAglMeters: 100, verticalSpeedMetersPerSecond: -2 })))
      .toBe("328 ft AGL · -394 ft/min");
  });
});
