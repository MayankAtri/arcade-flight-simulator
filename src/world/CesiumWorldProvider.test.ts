import { describe, expect, it } from "vitest";
import { CESIUM_QUALITY_SETTINGS } from "./CesiumWorldProvider";

describe("Cesium memory quality budgets", () => {
  it("keeps terrain and building cache ceilings conservative and ordered", () => {
    expect(CESIUM_QUALITY_SETTINGS.low.terrainCache).toBe(80);
    expect(CESIUM_QUALITY_SETTINGS.medium.terrainCache).toBe(140);
    expect(CESIUM_QUALITY_SETTINGS.high.terrainCache).toBe(220);
    expect(CESIUM_QUALITY_SETTINGS.low.buildingCacheMb).toBe(64);
    expect(CESIUM_QUALITY_SETTINGS.medium.buildingCacheMb).toBe(96);
    expect(CESIUM_QUALITY_SETTINGS.high.buildingCacheMb).toBe(144);
    expect(CESIUM_QUALITY_SETTINGS.low.cacheOverflowMb).toBe(16);
    expect(CESIUM_QUALITY_SETTINGS.medium.cacheOverflowMb).toBe(32);
    expect(CESIUM_QUALITY_SETTINGS.high.cacheOverflowMb).toBe(48);
  });
});
