import {
  Cartesian3,
  Cartographic,
  Color,
  DynamicAtmosphereLightingType,
  Ellipsoid,
  JulianDate,
  Matrix3,
  Simon1994PlanetaryPositions,
  SunLight,
  Transforms,
  type Viewer,
} from "cesium";
import type { DaylightState, EnvironmentVisualState, WeatherPreset } from "./types";

export const DAYLIGHT_START_HOUR = 6;
export const DAYLIGHT_END_HOUR = 17.5;
const DATE_ANCHOR = new Date(Date.UTC(2026, 7, 12));

const HORIZON_COLOR = Color.fromCssColorString("#ffd09a");
const DAY_COLOR = Color.fromCssColorString("#fffdf7");
const DAY_BACKGROUND = Color.fromCssColorString("#74add7");
const DAWN_BACKGROUND = Color.fromCssColorString("#91bdd4");
const DUSK_BACKGROUND = Color.fromCssColorString("#557a9c");
const CLOUDY_BACKGROUND = Color.fromCssColorString("#7f929f");
const DEGREES_TO_RADIANS = Math.PI / 180;

export type DaylightVisualProfile = {
  sunIntensity: number;
  sunWarmth: number;
  skyLightIntensity: number;
  skyHueShift: number;
  skySaturationShift: number;
  skyBrightnessShift: number;
  atmosphereLightIntensity: number;
  atmosphereSaturationShift: number;
  atmosphereBrightnessShift: number;
  fogMinimumBrightness: number;
  exposure: number;
  imageryBrightness: number;
  imageryContrast: number;
  imagerySaturation: number;
  imageryGamma: number;
  diffuseIbl: number;
  specularIbl: number;
  environmentBrightness: number;
  environmentSaturation: number;
  atmosphereScatteringIntensity: number;
  aircraftDirectIntensity: number;
  aircraftDiffuseIbl: number;
  aircraftSpecularIbl: number;
  aircraftEnvironmentBrightness: number;
};

type SolarCalculationScratch = {
  sunPositionInertial: Cartesian3;
  sunPositionFixed: Cartesian3;
  surfaceNormal: Cartesian3;
  inertialToFixed: Matrix3;
  cartographic: Cartographic;
};

const createSolarCalculationScratch = (): SolarCalculationScratch => ({
  sunPositionInertial: new Cartesian3(),
  sunPositionFixed: new Cartesian3(),
  surfaceNormal: new Cartesian3(),
  inertialToFixed: new Matrix3(),
  cartographic: new Cartographic(),
});

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
};

export const clampDaylightHour = (hour: number): number => {
  if (!Number.isFinite(hour)) return 12;
  return Math.min(DAYLIGHT_END_HOUR, Math.max(DAYLIGHT_START_HOUR, hour));
};

export const localDaylightJulianDate = (
  localHour: number,
  longitudeRadians: number,
  result?: JulianDate,
): JulianDate => {
  const longitudeDegrees = longitudeRadians * 180 / Math.PI;
  const utcHour = clampDaylightHour(localHour) - longitudeDegrees / 15;
  const date = new Date(DATE_ANCHOR.getTime() + utcHour * 60 * 60 * 1_000);
  return JulianDate.fromDate(date, result);
};

export const calculateSolarElevationRadians = (
  time: JulianDate,
  latitudeRadians: number,
  longitudeRadians: number,
  scratch = createSolarCalculationScratch(),
): number => {
  Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(time, scratch.sunPositionInertial);
  const transform = Transforms.computeIcrfToFixedMatrix(time, scratch.inertialToFixed)
    ?? Transforms.computeTemeToPseudoFixedMatrix(time, scratch.inertialToFixed);
  Matrix3.multiplyByVector(transform, scratch.sunPositionInertial, scratch.sunPositionFixed);
  Cartesian3.normalize(scratch.sunPositionFixed, scratch.sunPositionFixed);
  scratch.cartographic.longitude = longitudeRadians;
  scratch.cartographic.latitude = latitudeRadians;
  scratch.cartographic.height = 0;
  Ellipsoid.WGS84.geodeticSurfaceNormalCartographic(scratch.cartographic, scratch.surfaceNormal);
  return Math.asin(Math.min(1, Math.max(-1, Cartesian3.dot(scratch.surfaceNormal, scratch.sunPositionFixed))));
};

const syntheticSolarElevation = (localHour: number): number => {
  const hour = clampDaylightHour(localHour);
  return Math.asin(clamp01(Math.sin(((hour - 6) / 24) * Math.PI * 2)));
};

export const calculateDaylightState = (
  localHour: number,
  solarElevationRadians = syntheticSolarElevation(localHour),
): DaylightState => {
  const hour = clampDaylightHour(localHour);
  const daylight = 0.28 + smoothstep(-6 * DEGREES_TO_RADIANS, 18 * DEGREES_TO_RADIANS, solarElevationRadians) * 0.72;
  const visibleSun = smoothstep(-8 * DEGREES_TO_RADIANS, 3 * DEGREES_TO_RADIANS, solarElevationRadians);
  const lowSun = 1 - smoothstep(7 * DEGREES_TO_RADIANS, 38 * DEGREES_TO_RADIANS, solarElevationRadians);
  const horizon = clamp01(lowSun * (0.35 + visibleSun * 0.65));
  const highSun = smoothstep(28 * DEGREES_TO_RADIANS, 65 * DEGREES_TO_RADIANS, solarElevationRadians);
  const phase = solarElevationRadians >= 18 * DEGREES_TO_RADIANS
    ? "day"
    : hour < 12
      ? "dawn"
      : "dusk";

  return { localHour: hour, solarElevationRadians, daylight, horizon, highSun, phase };
};

export const calculateDaylightVisualProfile = (state: DaylightState): DaylightVisualProfile => {
  const dawnSky = state.phase === "dawn" ? 1 : 0;
  const duskSky = state.phase === "dusk" ? 1 : 0;
  return {
    sunIntensity: 0.78 + state.daylight * 0.38 + state.highSun * 0.16,
    sunWarmth: state.horizon,
    skyLightIntensity: 26 + state.daylight * 5 + state.highSun * 4,
    skyHueShift: dawnSky * -0.035 + duskSky * 0.035,
    skySaturationShift: 0.04 + state.highSun * 0.055 + duskSky * 0.025 - dawnSky * 0.015,
    skyBrightnessShift: 0.02 + state.horizon * 0.045 + dawnSky * 0.055 + duskSky * 0.015 - state.highSun * 0.02,
    atmosphereLightIntensity: 10.5 + state.daylight * 3 + state.highSun * 1.5,
    atmosphereSaturationShift: 0.005 + state.highSun * 0.035 - state.horizon * 0.015,
    atmosphereBrightnessShift: state.daylight * 0.015 - state.highSun * 0.02,
    fogMinimumBrightness: 0.09 + state.daylight * 0.07,
    exposure: 0.98 + state.daylight * 0.03 - state.highSun * 0.015,
    imageryBrightness: 0.98 + state.daylight * 0.02 + state.highSun * 0.005,
    imageryContrast: 1.015 + state.highSun * 0.035,
    imagerySaturation: 0.82 + state.daylight * 0.05 + state.highSun * 0.03,
    imageryGamma: 1 + state.horizon * 0.018,
    diffuseIbl: 0.58 + state.daylight * 0.32 + state.highSun * 0.08,
    specularIbl: 0.35 + state.daylight * 0.25,
    environmentBrightness: 0.72 + state.daylight * 0.22,
    environmentSaturation: 0.93 + state.highSun * 0.04,
    atmosphereScatteringIntensity: 0.8 + state.daylight * 0.25,
    aircraftDirectIntensity: 1.05 + state.daylight * 0.3 + state.highSun * 0.15,
    aircraftDiffuseIbl: 0.82 + state.daylight * 0.18,
    aircraftSpecularIbl: 0.65 + state.daylight * 0.22,
    aircraftEnvironmentBrightness: 0.92 + state.daylight * 0.12,
  };
};

export const calculateEnvironmentVisualProfile = (
  state: EnvironmentVisualState,
): DaylightVisualProfile => {
  const clear = calculateDaylightVisualProfile(state.daylight);
  if (state.weatherPreset === "clear") return clear;
  if (state.weatherPreset === "scattered") {
    return {
      ...clear,
      sunIntensity: clear.sunIntensity * 0.94,
      skyLightIntensity: clear.skyLightIntensity * 0.985,
      skySaturationShift: clear.skySaturationShift - 0.012,
      atmosphereLightIntensity: clear.atmosphereLightIntensity * 0.985,
      atmosphereSaturationShift: clear.atmosphereSaturationShift - 0.01,
      fogMinimumBrightness: clear.fogMinimumBrightness + 0.008,
      exposure: clear.exposure * 0.995,
      imagerySaturation: clear.imagerySaturation * 0.985,
      diffuseIbl: clear.diffuseIbl * 0.97,
      specularIbl: clear.specularIbl * 0.96,
      environmentBrightness: clear.environmentBrightness * 0.985,
      environmentSaturation: clear.environmentSaturation * 0.985,
      atmosphereScatteringIntensity: clear.atmosphereScatteringIntensity * 1.04,
      aircraftDirectIntensity: clear.aircraftDirectIntensity * 0.94,
      aircraftDiffuseIbl: clear.aircraftDiffuseIbl * 0.98,
      aircraftSpecularIbl: clear.aircraftSpecularIbl * 0.96,
      aircraftEnvironmentBrightness: clear.aircraftEnvironmentBrightness * 0.985,
    };
  }
  return {
    ...clear,
    sunIntensity: clear.sunIntensity * 0.62,
    sunWarmth: clear.sunWarmth * 0.72,
    skyLightIntensity: clear.skyLightIntensity * 0.9,
    skyHueShift: clear.skyHueShift * 0.72 + 0.012,
    skySaturationShift: clear.skySaturationShift - 0.16,
    skyBrightnessShift: clear.skyBrightnessShift - 0.07,
    atmosphereLightIntensity: clear.atmosphereLightIntensity * 0.88,
    atmosphereSaturationShift: clear.atmosphereSaturationShift - 0.11,
    atmosphereBrightnessShift: clear.atmosphereBrightnessShift - 0.04,
    fogMinimumBrightness: Math.max(0.14, clear.fogMinimumBrightness + 0.035),
    exposure: clear.exposure * 0.95,
    imageryBrightness: clear.imageryBrightness * 0.92,
    imageryContrast: 1 + (clear.imageryContrast - 1) * 0.55,
    imagerySaturation: clear.imagerySaturation * 0.84,
    imageryGamma: clear.imageryGamma * 1.012,
    diffuseIbl: Math.max(0.62, clear.diffuseIbl * 0.82),
    specularIbl: clear.specularIbl * 0.72,
    environmentBrightness: Math.max(0.68, clear.environmentBrightness * 0.86),
    environmentSaturation: clear.environmentSaturation * 0.86,
    atmosphereScatteringIntensity: clear.atmosphereScatteringIntensity * 1.18,
    aircraftDirectIntensity: clear.aircraftDirectIntensity * 0.65,
    aircraftDiffuseIbl: Math.max(0.72, clear.aircraftDiffuseIbl * 0.84),
    aircraftSpecularIbl: clear.aircraftSpecularIbl * 0.76,
    aircraftEnvironmentBrightness: Math.max(0.78, clear.aircraftEnvironmentBrightness * 0.86),
  };
};

export class DaylightSystem {
  private localHour = 12;
  private readonly light = new SunLight({ color: Color.clone(DAY_COLOR), intensity: 1.14 });
  private readonly previousLight: Viewer["scene"]["light"];
  private readonly previousClockTime: JulianDate;
  private readonly previousClockAnimation: boolean;
  private readonly lightColor = new Color();
  private readonly backgroundColor = new Color();
  private readonly solarCalculationScratch = createSolarCalculationScratch();
  private state = calculateDaylightState(12, Math.PI / 2);
  private weatherPreset: WeatherPreset = "clear";
  private dirty = true;
  private lastLongitudeRadians = Number.NaN;

  constructor(private readonly viewer: Viewer) {
    this.previousLight = viewer.scene.light;
    this.previousClockTime = JulianDate.clone(viewer.clock.currentTime);
    this.previousClockAnimation = viewer.clock.shouldAnimate;
    viewer.clock.shouldAnimate = false;
    viewer.scene.light = this.light;
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.dynamicAtmosphereLighting = true;
    viewer.scene.globe.dynamicAtmosphereLightingFromSun = true;
    viewer.scene.atmosphere.dynamicLighting = DynamicAtmosphereLightingType.SUNLIGHT;
  }

  setHour(hour: number): DaylightState {
    this.localHour = clampDaylightHour(hour);
    this.state = { ...this.state, localHour: this.localHour };
    this.dirty = true;
    return this.current();
  }

  setWeatherPreset(preset: WeatherPreset): void {
    if (preset === this.weatherPreset) return;
    this.weatherPreset = preset;
    this.dirty = true;
  }

  update(latitudeRadians: number, longitudeRadians: number): DaylightState | null {
    const longitudeChanged = !Number.isFinite(this.lastLongitudeRadians)
      || Math.abs(longitudeRadians - this.lastLongitudeRadians) > 0.00001;
    if (!this.dirty && !longitudeChanged) return null;
    this.dirty = false;
    this.lastLongitudeRadians = longitudeRadians;
    this.viewer.clock.currentTime = localDaylightJulianDate(
      this.localHour,
      longitudeRadians,
      this.viewer.clock.currentTime,
    );
    const solarElevationRadians = calculateSolarElevationRadians(
      this.viewer.clock.currentTime,
      latitudeRadians,
      longitudeRadians,
      this.solarCalculationScratch,
    );
    const state = calculateDaylightState(this.localHour, solarElevationRadians);
    this.state = state;
    const profile = calculateEnvironmentVisualProfile({ daylight: state, weatherPreset: this.weatherPreset });

    const warmColor = Color.lerp(HORIZON_COLOR, DAY_COLOR, 1 - profile.sunWarmth * 0.72, this.lightColor);
    Color.clone(warmColor, this.light.color);
    this.light.intensity = profile.sunIntensity;
    const twilightBackground = state.phase === "dawn"
      ? DAWN_BACKGROUND
      : state.phase === "dusk"
        ? DUSK_BACKGROUND
        : DAY_BACKGROUND;
    const twilightBlend = state.phase === "day" ? 0 : 0.68 + state.horizon * 0.22;
    Color.lerp(DAY_BACKGROUND, twilightBackground, twilightBlend, this.backgroundColor);
    if (this.weatherPreset === "scattered") {
      Color.lerp(this.backgroundColor, CLOUDY_BACKGROUND, 0.08, this.backgroundColor);
    } else if (this.weatherPreset === "cloudy") {
      Color.lerp(this.backgroundColor, CLOUDY_BACKGROUND, 0.34, this.backgroundColor);
    }
    Color.clone(this.backgroundColor, this.viewer.scene.backgroundColor);

    const sky = this.viewer.scene.skyAtmosphere;
    if (sky) {
      sky.atmosphereLightIntensity = profile.skyLightIntensity;
      sky.hueShift = profile.skyHueShift;
      sky.saturationShift = profile.skySaturationShift;
      sky.brightnessShift = profile.skyBrightnessShift;
    }
    this.viewer.scene.atmosphere.lightIntensity = profile.atmosphereLightIntensity;
    this.viewer.scene.atmosphere.saturationShift = profile.atmosphereSaturationShift;
    this.viewer.scene.atmosphere.brightnessShift = profile.atmosphereBrightnessShift;
    this.viewer.scene.atmosphere.hueShift = 0;
    this.viewer.scene.fog.minimumBrightness = profile.fogMinimumBrightness;
    this.viewer.scene.postProcessStages.exposure = profile.exposure;
    this.viewer.scene.requestRender();
    return state;
  }

  current(): DaylightState {
    return this.state;
  }

  destroy(): void {
    if (!this.viewer.isDestroyed() && this.viewer.scene.light === this.light) {
      this.viewer.scene.light = this.previousLight;
      this.viewer.clock.currentTime = JulianDate.clone(this.previousClockTime, this.viewer.clock.currentTime);
      this.viewer.clock.shouldAnimate = this.previousClockAnimation;
    }
  }
}
