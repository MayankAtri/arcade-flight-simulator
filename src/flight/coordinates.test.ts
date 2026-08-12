import { describe, expect, it } from "vitest";
import {
  degreesToRadians,
  ecefToGeodetic,
  geodeticToEcef,
  headingFromForward,
  levelBodyOrientation,
  radiansToDegrees,
} from "./coordinates";
import { multiplyQuat, quatFromRotationVector, rotateVec3 } from "./math";

describe("globe-safe aircraft transforms", () => {
  it.each([
    [25.252836, 55.364376, 13],
    [0, 179.999, 1_200],
    [-33.9461, 151.1772, 45],
  ])("round-trips geodetic coordinates at %s, %s", (latitude, longitude, height) => {
    const result = ecefToGeodetic(
      geodeticToEcef({
        latitude: degreesToRadians(latitude),
        longitude: degreesToRadians(longitude),
        height,
      }),
    );
    expect(radiansToDegrees(result.latitude)).toBeCloseTo(latitude, 6);
    expect(radiansToDegrees(result.longitude)).toBeCloseTo(longitude, 6);
    expect(result.height).toBeCloseTo(height, 3);
  });

  it("aligns the aircraft forward axis to the requested runway heading", () => {
    const position = {
      latitude: degreesToRadians(25.252836),
      longitude: degreesToRadians(55.364376),
      height: 5,
    };
    const orientation = levelBodyOrientation(position, degreesToRadians(121));
    const forward = rotateVec3(orientation, { x: 1, y: 0, z: 0 });
    expect(headingFromForward(position, forward)).toBeCloseTo(121, 6);
  });

  it.each(["roll", "pitch", "yaw"] as const)("supports a continuous 360-degree %s", (axis) => {
    const base = levelBodyOrientation(
      { latitude: degreesToRadians(25), longitude: degreesToRadians(55), height: 1_000 },
      degreesToRadians(90),
    );
    const rotation = { x: 0, y: 0, z: 0 };
    rotation[axis === "roll" ? "x" : axis === "pitch" ? "y" : "z"] = Math.PI * 2;
    const completed = multiplyQuat(base, quatFromRotationVector(rotation));
    const equivalence = Math.abs(
      base.x * completed.x + base.y * completed.y + base.z * completed.z + base.w * completed.w,
    );
    expect(equivalence).toBeCloseTo(1, 8);
  });
});
