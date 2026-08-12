import {
  createGooglePhotorealistic3DTileset,
  createWorldTerrainAsync,
  Ion,
  type Cesium3DTileset,
  type TerrainProvider,
  type Viewer,
} from "cesium";
import type { WorldQuality, WorldVisualProvider } from "./types";

export class GoogleWorldProvider implements WorldVisualProvider {
  readonly label = "Google photorealistic · Cesium ion";
  terrainProvider: TerrainProvider | null = null;
  private viewer: Viewer | null = null;
  private tileset: Cesium3DTileset | null = null;

  constructor(private readonly token: string) {}

  async initialize(viewer: Viewer): Promise<void> {
    if (this.token) Ion.defaultAccessToken = this.token;
    this.viewer = viewer;

    const [collisionTerrain, tileset] = await Promise.all([
      createWorldTerrainAsync({ requestVertexNormals: true, requestWaterMask: false }),
      createGooglePhotorealistic3DTileset(
        { onlyUsingWithGoogleGeocoder: true },
        {
          showCreditsOnScreen: true,
          enableCollision: false,
          cacheBytes: 192 * 1_024 * 1_024,
          maximumCacheOverflowBytes: 96 * 1_024 * 1_024,
          maximumScreenSpaceError: 20,
          dynamicScreenSpaceError: true,
          foveatedScreenSpaceError: true,
          cullRequestsWhileMoving: true,
          preloadFlightDestinations: true,
          progressiveResolutionHeightFraction: 0.3,
        },
      ),
    ]);

    this.terrainProvider = collisionTerrain;
    this.tileset = tileset;
    viewer.imageryLayers.removeAll();
    viewer.scene.globe.show = false;
    viewer.scene.primitives.add(tileset);
    this.setQuality("medium");
  }

  setQuality(level: WorldQuality): void {
    if (!this.viewer || !this.tileset) return;
    const settings = {
      low: { resolution: 0.68, error: 32, cacheMb: 128, overflowMb: 48 },
      medium: { resolution: 0.82, error: 22, cacheMb: 192, overflowMb: 96 },
      high: { resolution: 0.95, error: 16, cacheMb: 256, overflowMb: 128 },
    }[level];
    this.viewer.resolutionScale = settings.resolution;
    this.tileset.maximumScreenSpaceError = settings.error;
    this.tileset.cacheBytes = settings.cacheMb * 1_024 * 1_024;
    this.tileset.maximumCacheOverflowBytes = settings.overflowMb * 1_024 * 1_024;
    this.tileset.dynamicScreenSpaceError = true;
    this.tileset.dynamicScreenSpaceErrorDensity = level === "low" ? 0.0018 : level === "medium" ? 0.0012 : 0.0008;
    this.tileset.dynamicScreenSpaceErrorFactor = level === "low" ? 20 : level === "medium" ? 14 : 9;
    this.tileset.foveatedScreenSpaceError = true;
    this.tileset.foveatedConeSize = 0.22;
    this.tileset.foveatedTimeDelay = 0.12;
  }

  destroy(): void {
    if (this.viewer && this.tileset && !this.tileset.isDestroyed()) {
      this.viewer.scene.primitives.remove(this.tileset);
      this.viewer.scene.globe.show = true;
    }
    this.tileset = null;
    this.viewer = null;
    this.terrainProvider = null;
  }
}
