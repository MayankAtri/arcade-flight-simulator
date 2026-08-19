import {
  Credit,
  EllipsoidTerrainProvider,
  OpenStreetMapImageryProvider,
  type TerrainProvider,
  type Viewer,
} from "cesium";
import type { DaylightState, WorldMemoryStats, WorldQuality, WorldVisualProvider } from "./types";

export class BasicWorldProvider implements WorldVisualProvider {
  readonly label = "Basic world";
  readonly terrainProvider: TerrainProvider = new EllipsoidTerrainProvider();
  private viewer: Viewer | null = null;

  async initialize(viewer: Viewer): Promise<void> {
    this.viewer = viewer;
    viewer.terrainProvider = this.terrainProvider;
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(
      new OpenStreetMapImageryProvider({
        url: "https://tile.openstreetmap.org/",
        maximumLevel: 18,
        credit: new Credit("© OpenStreetMap contributors"),
      }),
    );
    viewer.scene.globe.depthTestAgainstTerrain = true;
    this.setQuality("high");
  }

  setQuality(level: WorldQuality): void {
    if (!this.viewer) return;
    this.viewer.resolutionScale = level === "low" ? 0.75 : level === "medium" ? 0.9 : 1;
    this.viewer.scene.globe.maximumScreenSpaceError = level === "low" ? 4 : level === "medium" ? 2 : 1.25;
  }

  setDaylight(_state: DaylightState): void {}

  isBuildingPick(_picked: unknown): boolean {
    return false;
  }

  memoryStats(): WorldMemoryStats {
    return {
      tileMemoryBytes: null,
      tileCacheBytes: null,
      tileCacheOverflowBytes: null,
      pendingTileRequests: 0,
      processingTiles: 0,
      terrainTileQueueLength: 0,
      tilesLoaded: true,
    };
  }

  releaseUnusedResources(): void {}

  destroy(): void {
    this.viewer = null;
  }
}
