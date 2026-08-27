import { ShadowMode } from "cesium";
import { describe, expect, it } from "vitest";
import { GOOGLE_PHOTOREALISTIC_TILESET_OPTIONS } from "./GoogleWorldProvider";

describe("Google photorealistic tileset rendering", () => {
  it("uses baked photography shadows without an unstable dynamic shadow pass", () => {
    expect(GOOGLE_PHOTOREALISTIC_TILESET_OPTIONS.shadows).toBe(ShadowMode.DISABLED);
  });
});
