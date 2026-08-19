import { describe, expect, it } from "vitest";
import { greatCircleDistanceMeters, shouldReleaseWorldResources } from "./resourceEviction";

describe("world resource eviction distance", () => {
  it("keeps local airport changes and respawns cache-friendly", () => {
    expect(shouldReleaseWorldResources(
      { latitudeDegrees: 25.2528, longitudeDegrees: 55.3644 },
      { latitudeDegrees: 25.2048, longitudeDegrees: 55.2708 },
    )).toBe(false);
  });

  it("releases resources after a distant city transition", () => {
    expect(shouldReleaseWorldResources(
      { latitudeDegrees: 25.2528, longitudeDegrees: 55.3644 },
      { latitudeDegrees: 40.6413, longitudeDegrees: -73.7781 },
    )).toBe(true);
    expect(greatCircleDistanceMeters(
      { latitudeDegrees: 25.2528, longitudeDegrees: 55.3644 },
      { latitudeDegrees: 40.6413, longitudeDegrees: -73.7781 },
    )).toBeGreaterThan(10_000_000);
  });
});
