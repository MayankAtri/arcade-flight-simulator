import {
  Credit,
  EllipsoidTerrainProvider,
  OpenStreetMapImageryProvider,
  type ImageryLayer,
  type TerrainProvider,
  type Viewer,
} from "cesium";
import type { EnvironmentVisualState, WorldMemoryStats, WorldQuality, WorldVisualProvider } from "./types";
import { calculateEnvironmentVisualProfile } from "./DaylightSystem";

export class BasicWorldProvider implements WorldVisualProvider {
  readonly label = "Basic world";
  readonly terrainProvider: TerrainProvider = new EllipsoidTerrainProvider();
  private viewer: Viewer | null = null;
  private imagery: ImageryLayer | null = null;

  async initialize(viewer: Viewer): Promise<void> {
    this.viewer = viewer;
    viewer.terrainProvider = this.terrainProvider;
    viewer.imageryLayers.removeAll();
    this.imagery = viewer.imageryLayers.addImageryProvider(
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

  setEnvironment(state: EnvironmentVisualState): void {
    if (!this.imagery) return;
    const profile = calculateEnvironmentVisualProfile(state);
    this.imagery.brightness = profile.imageryBrightness;
    this.imagery.contrast = profile.imageryContrast;
    this.imagery.saturation = profile.imagerySaturation;
    this.imagery.gamma = profile.imageryGamma;
    this.imagery.hue = 0;
  }

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
    this.imagery = null;
    this.viewer = null;
  }
}
