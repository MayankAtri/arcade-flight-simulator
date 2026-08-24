import { describe, expect, it } from "vitest";
import { CAMERA_MODES, CameraSystem, cameraModeLabel, nextCameraMode } from "./CameraSystem";

describe("CameraSystem modes", () => {
  it("cycles through the reference camera sequence", () => {
    const camera = new CameraSystem();

    expect(camera.mode).toBe("chase");
    expect(CAMERA_MODES.map(cameraModeLabel)).toEqual([
      "External",
      "External far",
      "Flyby",
      "Top down",
    ]);

    for (const expected of ["chase-far", "flyby", "top-down", "chase"] as const) {
      expect(camera.cycle()).toBe(expected);
    }
  });

  it("wraps the final mode back to external", () => {
    expect(nextCameraMode("top-down")).toBe("chase");
  });
});
