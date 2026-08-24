import { describe, expect, it } from "vitest";
import {
  calculateDaylightState,
  calculateDaylightVisualProfile,
  calculateEnvironmentVisualProfile,
  calculateSolarElevationRadians,
  clampDaylightHour,
  localDaylightJulianDate,
} from "./DaylightSystem";

const radians = (degrees: number): number => degrees * Math.PI / 180;

describe("DaylightSystem", () => {
  it("keeps time inside the dawn-to-sunset range", () => {
    expect(clampDaylightHour(20)).toBe(17.5);
    expect(clampDaylightHour(2)).toBe(6);
    expect(clampDaylightHour(Number.NaN)).toBe(12);
  });

  it("classifies representative daylight times", () => {
    expect(calculateDaylightState(6.5, radians(8)).phase).toBe("dawn");
    expect(calculateDaylightState(12, radians(70)).phase).toBe("day");
    expect(calculateDaylightState(17.5, radians(8)).phase).toBe("dusk");
  });

  it("keeps low sun playable while separating it from clear high sun", () => {
    const belowHorizon = calculateDaylightState(6, radians(-15));
    const lowSun = calculateDaylightState(6.5, radians(8));
    const noon = calculateDaylightState(12, radians(70));
    expect(belowHorizon.daylight).toBeGreaterThanOrEqual(0.28);
    expect(lowSun.horizon).toBeGreaterThan(0.8);
    expect(noon.daylight).toBe(1);
    expect(noon.highSun).toBe(1);
    expect(noon.horizon).toBe(0);
  });

  it("uses actual geographic sun elevation for the fixed local clock", () => {
    const dubaiLatitude = radians(25.2532);
    const dubaiLongitude = radians(55.3657);
    const dawnElevation = calculateSolarElevationRadians(
      localDaylightJulianDate(6.5, dubaiLongitude),
      dubaiLatitude,
      dubaiLongitude,
    );
    const noonElevation = calculateSolarElevationRadians(
      localDaylightJulianDate(12, dubaiLongitude),
      dubaiLatitude,
      dubaiLongitude,
    );
    const lateDayElevation = calculateSolarElevationRadians(
      localDaylightJulianDate(17.5, dubaiLongitude),
      dubaiLatitude,
      dubaiLongitude,
    );
    expect(noonElevation).toBeGreaterThan(dawnElevation);
    expect(noonElevation).toBeGreaterThan(lateDayElevation);
    expect(noonElevation).toBeGreaterThan(radians(60));
  });

  it("uses natural imagery and atmosphere values instead of crushed noon contrast", () => {
    const lowSun = calculateDaylightVisualProfile(calculateDaylightState(6.5, radians(8)));
    const noon = calculateDaylightVisualProfile(calculateDaylightState(12, radians(70)));
    expect(noon.skySaturationShift).toBeGreaterThan(lowSun.skySaturationShift);
    expect(noon.imagerySaturation).toBeGreaterThan(lowSun.imagerySaturation);
    expect(noon.imageryContrast).toBeLessThanOrEqual(1.05);
    expect(noon.exposure).toBeLessThan(1.01);
    expect(lowSun.sunWarmth).toBeGreaterThan(0.8);
  });

  it("gives dawn and dusk distinct readable sky profiles", () => {
    const dawn = calculateDaylightVisualProfile(calculateDaylightState(6.5, radians(8)));
    const dusk = calculateDaylightVisualProfile(calculateDaylightState(17.5, radians(8)));
    expect(dawn.skyBrightnessShift).toBeGreaterThan(dusk.skyBrightnessShift);
    expect(dusk.skySaturationShift).toBeGreaterThan(dawn.skySaturationShift);
    expect(dawn.skyHueShift).toBeLessThan(0);
    expect(dusk.skyHueShift).toBeGreaterThan(0);
    expect(dusk.skyBrightnessShift).toBeGreaterThan(0.05);
  });

  it("preserves the approved Clear profile and orders weather attenuation", () => {
    const daylight = calculateDaylightState(12, radians(70));
    const clear = calculateDaylightVisualProfile(daylight);
    const environmentClear = calculateEnvironmentVisualProfile({ daylight, weatherPreset: "clear" });
    const scattered = calculateEnvironmentVisualProfile({ daylight, weatherPreset: "scattered" });
    const cloudy = calculateEnvironmentVisualProfile({ daylight, weatherPreset: "cloudy" });
    expect(environmentClear).toEqual(clear);
    expect(clear.sunIntensity).toBeGreaterThan(scattered.sunIntensity);
    expect(scattered.sunIntensity).toBeGreaterThan(cloudy.sunIntensity);
    expect(clear.imagerySaturation).toBeGreaterThan(scattered.imagerySaturation);
    expect(scattered.imagerySaturation).toBeGreaterThan(cloudy.imagerySaturation);
    expect(cloudy.fogMinimumBrightness).toBeGreaterThan(scattered.fogMinimumBrightness);
    expect(cloudy.aircraftDiffuseIbl).toBeGreaterThanOrEqual(0.72);
    expect(cloudy.aircraftEnvironmentBrightness).toBeGreaterThanOrEqual(0.78);
  });
});
