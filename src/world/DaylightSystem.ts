import {
  Color,
  DynamicAtmosphereLightingType,
  JulianDate,
  SunLight,
  type Viewer,
} from "cesium";
import type { DaylightState } from "./types";

export const DAYLIGHT_START_HOUR = 6;
export const DAYLIGHT_END_HOUR = 17.5;
const DATE_ANCHOR = new Date(Date.UTC(2026, 7, 12));

const HORIZON_COLOR = Color.fromCssColorString("#ffd69a");
const DAY_COLOR = Color.fromCssColorString("#fffdf5");
const DAY_BACKGROUND = Color.fromCssColorString("#86bde5");
const HORIZON_BACKGROUND = Color.fromCssColorString("#a7c4d7");

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
};

export const clampDaylightHour = (hour: number): number => {
  if (!Number.isFinite(hour)) return 12;
  return Math.min(DAYLIGHT_END_HOUR, Math.max(DAYLIGHT_START_HOUR, hour));
};

export const calculateDaylightState = (localHour: number): DaylightState => {
  const hour = clampDaylightHour(localHour);
  const solarHeight = Math.sin(((hour - 6) / 24) * Math.PI * 2);
  const daylight = smoothstep(-0.12, 0.22, solarHeight);
  const horizon = (1 - smoothstep(0.08, 0.62, solarHeight)) * daylight;
  const phase = hour < 8
    ? "dawn"
    : hour >= 17
      ? "dusk"
      : "day";

  return { localHour: hour, daylight, horizon, phase };
};

export class DaylightSystem {
  private localHour = 12;
  private readonly light = new SunLight({ color: Color.clone(DAY_COLOR), intensity: 1.14 });
  private readonly previousLight: Viewer["scene"]["light"];
  private readonly previousClockTime: JulianDate;
  private readonly previousClockAnimation: boolean;
  private readonly lightColor = new Color();
  private readonly backgroundColor = new Color();
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
    this.dirty = true;
    return this.current();
  }

  update(_latitudeRadians: number, longitudeRadians: number): DaylightState | null {
    const state = this.current();
    const longitudeChanged = !Number.isFinite(this.lastLongitudeRadians)
      || Math.abs(longitudeRadians - this.lastLongitudeRadians) > 0.00001;
    if (!this.dirty && !longitudeChanged) return null;
    this.dirty = false;
    this.lastLongitudeRadians = longitudeRadians;
    const longitudeDegrees = longitudeRadians * 180 / Math.PI;
    const utcHour = state.localHour - longitudeDegrees / 15;
    const date = new Date(DATE_ANCHOR.getTime() + utcHour * 60 * 60 * 1_000);
    this.viewer.clock.currentTime = JulianDate.fromDate(date, this.viewer.clock.currentTime);

    const warmColor = Color.lerp(HORIZON_COLOR, DAY_COLOR, 1 - state.horizon * 0.55, this.lightColor);
    Color.clone(warmColor, this.light.color);
    this.light.intensity = 0.72 + state.daylight * 0.62;
    Color.lerp(DAY_BACKGROUND, HORIZON_BACKGROUND, state.horizon * 0.42, this.backgroundColor);
    Color.clone(this.backgroundColor, this.viewer.scene.backgroundColor);

    const sky = this.viewer.scene.skyAtmosphere;
    if (sky) {
      sky.atmosphereLightIntensity = 13 + state.daylight * 8;
      sky.saturationShift = 0.015 - state.horizon * 0.035;
      sky.brightnessShift = -0.015 + state.daylight * 0.115;
      sky.hueShift = 0;
    }
    this.viewer.scene.atmosphere.lightIntensity = 12 + state.daylight * 8;
    this.viewer.scene.atmosphere.saturationShift = -0.01 - state.horizon * 0.025;
    this.viewer.scene.atmosphere.brightnessShift = -0.02 + state.daylight * 0.12;
    this.viewer.scene.atmosphere.hueShift = 0;
    this.viewer.scene.fog.minimumBrightness = 0.075 + state.daylight * 0.15;
    this.viewer.scene.postProcessStages.exposure = 1.02 + state.daylight * 0.1;
    this.viewer.scene.requestRender();
    return state;
  }

  current(): DaylightState {
    return calculateDaylightState(this.localHour);
  }

  destroy(): void {
    if (!this.viewer.isDestroyed() && this.viewer.scene.light === this.light) {
      this.viewer.scene.light = this.previousLight;
      this.viewer.clock.currentTime = JulianDate.clone(this.previousClockTime, this.viewer.clock.currentTime);
      this.viewer.clock.shouldAnimate = this.previousClockAnimation;
    }
  }
}
