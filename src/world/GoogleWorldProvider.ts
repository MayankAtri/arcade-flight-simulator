import {
  createGooglePhotorealistic3DTileset,
  createWorldTerrainAsync,
  Ion,
  ShadowMode,
  type Cesium3DTileset,
  type TerrainProvider,
  type Viewer,
} from "cesium";
import type { EnvironmentVisualState, WorldMemoryStats, WorldQuality, WorldVisualProvider } from "./types";
import { calculateEnvironmentVisualProfile } from "./DaylightSystem";

export const GOOGLE_PHOTOREALISTIC_TILESET_OPTIONS = {
  showCreditsOnScreen: true,
  enableCollision: false,
  shadows: ShadowMode.DISABLED,
  cacheBytes: 192 * 1_024 * 1_024,
  maximumCacheOverflowBytes: 96 * 1_024 * 1_024,
  maximumScreenSpaceError: 20,
  dynamicScreenSpaceError: true,
  foveatedScreenSpaceError: true,
  cullRequestsWhileMoving: true,
  preloadFlightDestinations: false,
  progressiveResolutionHeightFraction: 0.3,
} as const;

export class GoogleWorldProvider implements WorldVisualProvider {
  readonly label = "Google photorealistic · Cesium ion";
  terrainProvider: TerrainProvider | null = null;
  private viewer: Viewer | null = null;
  private tileset: Cesium3DTileset | null = null;
  private pendingTileRequests = 0;
  private processingTiles = 0;
  private removeLoadProgress: (() => void) | null = null;

  constructor(private readonly token: string) {}

  async initialize(viewer: Viewer): Promise<void> {
    if (this.token) Ion.defaultAccessToken = this.token;
    this.viewer = viewer;

    const [collisionTerrain, tileset] = await Promise.all([
      createWorldTerrainAsync({ requestVertexNormals: true, requestWaterMask: false }),
      createGooglePhotorealistic3DTileset(
        { onlyUsingWithGoogleGeocoder: true },
        GOOGLE_PHOTOREALISTIC_TILESET_OPTIONS,
      ),
    ]);

    this.terrainProvider = collisionTerrain;
    this.tileset = tileset;
    this.removeLoadProgress = tileset.loadProgress.addEventListener(
      (pendingRequests: number, processingTiles: number) => {
        this.pendingTileRequests = pendingRequests;
        this.processingTiles = processingTiles;
      },
    );
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

  setEnvironment(state: EnvironmentVisualState): void {
    if (!this.tileset) return;
    const profile = calculateEnvironmentVisualProfile(state);
    this.tileset.imageBasedLighting.imageBasedLightingFactor.x = profile.diffuseIbl;
    this.tileset.imageBasedLighting.imageBasedLightingFactor.y = profile.specularIbl;
    this.tileset.environmentMapManager.brightness = profile.environmentBrightness;
    this.tileset.environmentMapManager.saturation = profile.environmentSaturation;
    this.tileset.environmentMapManager.atmosphereScatteringIntensity = profile.atmosphereScatteringIntensity;
  }

  isBuildingPick(picked: unknown): boolean {
    if (!this.tileset || !picked || typeof picked !== "object") return false;
    const result = picked as {
      primitive?: unknown;
      tileset?: unknown;
      content?: { tileset?: unknown };
    };
    return result.primitive === this.tileset || result.tileset === this.tileset || result.content?.tileset === this.tileset;
  }

  memoryStats(): WorldMemoryStats {
    return {
      tileMemoryBytes: this.tileset?.totalMemoryUsageInBytes ?? null,
      tileCacheBytes: this.tileset?.cacheBytes ?? null,
      tileCacheOverflowBytes: this.tileset?.maximumCacheOverflowBytes ?? null,
      pendingTileRequests: this.pendingTileRequests,
      processingTiles: this.processingTiles,
      terrainTileQueueLength: 0,
      tilesLoaded: this.tileset?.tilesLoaded ?? true,
    };
  }

  releaseUnusedResources(): void {
    this.tileset?.trimLoadedTiles();
    this.viewer?.scene.requestRender();
  }

  destroy(): void {
    this.removeLoadProgress?.();
    this.removeLoadProgress = null;
    if (this.viewer && !this.viewer.isDestroyed() && this.tileset && !this.tileset.isDestroyed()) {
      this.viewer.scene.primitives.remove(this.tileset);
      this.viewer.scene.globe.show = true;
    }
    this.tileset = null;
    this.viewer = null;
    this.terrainProvider = null;
    this.pendingTileRequests = 0;
    this.processingTiles = 0;
  }
}
