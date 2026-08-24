import type { LessonTelemetry } from "./types";

const KNOTS_PER_METER_PER_SECOND = 1.94384;
const FEET_PER_METER = 3.28084;
const FEET_PER_MINUTE_PER_METER_PER_SECOND = 196.8504;

const speedKnots = (telemetry: LessonTelemetry): number => (
  Math.round(telemetry.airspeedMetersPerSecond * KNOTS_PER_METER_PER_SECOND)
);

const headingDegrees = (telemetry: LessonTelemetry): string => (
  Math.round(telemetry.headingDegrees).toString().padStart(3, "0")
);

export const lessonLiveReadout = (stepId: string, telemetry: LessonTelemetry): string => {
  switch (stepId) {
    case "brake-check":
    case "release-brakes":
    case "full-stop":
      return `Brakes ${telemetry.brakes >= 0.5 ? "ON" : "OFF"} · ${speedKnots(telemetry)} kt`;
    case "full-throttle":
    case "reduce-power":
    case "apply-power":
      return `Throttle ${Math.round(telemetry.throttle * 100)}% · ${speedKnots(telemetry)} kt`;
    case "gentle-left":
    case "gentle-right":
    case "left-turn":
    case "level-left":
    case "right-turn":
    case "level-right":
    case "return-to-airport":
    case "turn-final":
    case "hold-heading":
      return `Bank ${Math.round(telemetry.bankDegrees)}° · Heading ${headingDegrees(telemetry)}°`;
    case "enter-stall":
    case "recognize-stall":
    case "lower-nose":
    case "recover-speed":
      return `${speedKnots(telemetry)} kt · Pitch ${Math.round(telemetry.pitchDegrees)}°`;
    case "climb-150":
    case "hold-altitude":
    case "positive-climb":
    case "controlled-descent": {
      const altitudeFeet = Math.round(telemetry.altitudeAglMeters * FEET_PER_METER);
      const verticalSpeedFeetPerMinute = Math.round(
        telemetry.verticalSpeedMetersPerSecond * FEET_PER_MINUTE_PER_METER_PER_SECOND,
      );
      return `${altitudeFeet} ft AGL · ${verticalSpeedFeetPerMinute > 0 ? "+" : ""}${verticalSpeedFeetPerMinute} ft/min`;
    }
    case "set-flaps":
      return `Flaps ${Math.round(telemetry.flaps * 100)}% · ${speedKnots(telemetry)} kt`;
    case "touchdown":
    case "landing-speed":
      return `${speedKnots(telemetry)} kt · ${telemetry.grounded ? "Ground" : "Airborne"}`;
    default:
      return `${speedKnots(telemetry)} kt · ${Math.round(telemetry.altitudeAglMeters * FEET_PER_METER)} ft AGL`;
  }
};
