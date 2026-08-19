import { describe, expect, it } from "vitest";
import { TerrainSamplingSystem } from "./TerrainSamplingSystem";

const POSITION = { latitude: 0.4, longitude: 0.8, height: 12 };

describe("TerrainSamplingSystem lifecycle", () => {
  it("clears retained samples and becomes a safe no-op after destroy", async () => {
    const terrain = new TerrainSamplingSystem(null);
    await terrain.sampleHeight(POSITION);
    expect(terrain.memoryStats().cachedSamples).toBe(1);

    terrain.destroy();
    expect(terrain.memoryStats()).toEqual({ cachedSamples: 0, inFlightRequests: 0 });
    expect(await terrain.sampleHeight(POSITION)).toMatchObject({ reliable: false });
    expect(terrain.memoryStats()).toEqual({ cachedSamples: 0, inFlightRequests: 0 });
  });
});
