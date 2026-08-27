import { describe, expect, it } from "vitest";
import type { WorldMemoryStats } from "./types";
import { hasRenderableWorld, hasSettledWorld } from "./sceneReadiness";

const worldStats = (overrides: Partial<WorldMemoryStats> = {}): WorldMemoryStats => ({
  tileMemoryBytes: 64 * 1_024 * 1_024,
  tileCacheBytes: 128 * 1_024 * 1_024,
  tileCacheOverflowBytes: 32 * 1_024 * 1_024,
  pendingTileRequests: 0,
  processingTiles: 0,
  terrainTileQueueLength: 0,
  tilesLoaded: true,
  ...overrides,
});

describe("scene readiness", () => {
  it("requires visible globe tiles or rendered 3D geometry before a Cesium flight starts", () => {
    expect(hasRenderableWorld({
      globeVisible: true,
      globeTilesLoaded: false,
      world: worldStats({ tileMemoryBytes: 0 }),
    })).toBe(false);
    expect(hasRenderableWorld({
      globeVisible: true,
      globeTilesLoaded: true,
      world: worldStats({ tileMemoryBytes: null }),
    })).toBe(true);
    expect(hasRenderableWorld({
      globeVisible: true,
      globeTilesLoaded: false,
      world: worldStats({ tileMemoryBytes: 1 }),
    })).toBe(true);
  });

  it("requires loaded tile geometry when the globe is hidden for photorealistic mode", () => {
    expect(hasRenderableWorld({
      globeVisible: false,
      globeTilesLoaded: true,
      world: worldStats({ tileMemoryBytes: 0 }),
    })).toBe(false);
    expect(hasRenderableWorld({
      globeVisible: false,
      globeTilesLoaded: true,
      world: worldStats({ tileMemoryBytes: 1 }),
    })).toBe(true);
  });

  it("does not consider the world settled while any tile work remains", () => {
    expect(hasSettledWorld({
      globeVisible: true,
      globeTilesLoaded: true,
      world: worldStats({ pendingTileRequests: 1 }),
    })).toBe(false);
    expect(hasSettledWorld({
      globeVisible: true,
      globeTilesLoaded: true,
      world: worldStats({ processingTiles: 1 }),
    })).toBe(false);
    expect(hasSettledWorld({
      globeVisible: true,
      globeTilesLoaded: true,
      world: worldStats({ terrainTileQueueLength: 1 }),
    })).toBe(false);
    expect(hasSettledWorld({
      globeVisible: true,
      globeTilesLoaded: true,
      world: worldStats(),
    })).toBe(true);
  });
});
