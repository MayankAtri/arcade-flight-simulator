import { describe, expect, it, vi } from "vitest";
import type { Scene } from "cesium";
import { cloudCountFor, generateCloudLayout, WeatherSystem } from "./WeatherSystem";

describe("WeatherSystem", () => {
  it("uses no clouds for Clear and quality-scaled counts for visual weather", () => {
    expect(generateCloudLayout("clear", "high", 40.7128, -74.006, 12)).toEqual([]);
    expect(cloudCountFor("scattered", "low")).toBeLessThan(cloudCountFor("scattered", "high"));
    expect(cloudCountFor("cloudy", "medium")).toBeGreaterThan(cloudCountFor("scattered", "medium"));
  });

  it("generates deterministic layouts that change after a major location move", () => {
    const first = generateCloudLayout("scattered", "medium", 40.7128, -74.006, 12);
    const repeated = generateCloudLayout("scattered", "medium", 40.7128, -74.006, 12);
    const moved = generateCloudLayout("scattered", "medium", 41.2, -74.006, 12);
    expect(repeated).toEqual(first);
    expect(moved).not.toEqual(first);
  });

  it("keeps procedural cloud altitude, coverage, slices, and families in bounds", () => {
    const scattered = generateCloudLayout("scattered", "high", 25.2048, 55.2708, 20);
    const cloudy = generateCloudLayout("cloudy", "high", 25.2048, 55.2708, 20);
    for (const cloud of [...scattered, ...cloudy]) {
      expect(cloud.altitudeAglMeters).toBeGreaterThanOrEqual(1_100);
      expect(cloud.altitudeAglMeters).toBeLessThanOrEqual(1_620);
      expect(cloud.distanceMeters).toBeLessThanOrEqual(25_000);
      expect(cloud.slice).toBeGreaterThanOrEqual(0.34);
      expect(cloud.slice).toBeLessThanOrEqual(0.58);
      expect(cloud.family).toBeGreaterThanOrEqual(0);
      expect(cloud.family).toBeLessThanOrEqual(2);
    }
    expect(Math.max(...cloudy.map((cloud) => cloud.scaleX))).toBeGreaterThan(
      Math.max(...scattered.map((cloud) => cloud.scaleX)),
    );
  });

  it("does not duplicate clouds and removes all native collections during teardown", () => {
    const collections: Array<{ destroy: () => void }> = [];
    const remove = vi.fn((collection: { destroy: () => void }) => {
      collection.destroy();
      return true;
    });
    const scene = {
      primitives: {
        add: <T extends { destroy: () => void }>(collection: T): T => {
          collections.push(collection);
          return collection;
        },
        remove,
      },
      requestRender: vi.fn(),
      isDestroyed: () => false,
    } as unknown as Scene;
    const weather = new WeatherSystem(scene);
    expect(collections).toHaveLength(0);
    weather.setPreset("scattered");
    weather.updateAnchor(40.7128, -74.006, 12, true);
    const initialCount = weather.cloudCount();
    weather.updateAnchor(40.713, -74.005, 12);
    expect(weather.cloudCount()).toBe(initialCount);
    weather.clear();
    expect(weather.cloudCount()).toBe(0);
    weather.destroy();
    expect(collections).toHaveLength(3);
    expect(remove).toHaveBeenCalledTimes(3);
  });
});
