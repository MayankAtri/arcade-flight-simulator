import {
  Color,
  CustomShader,
  CustomShaderTranslucencyMode,
  createOsmBuildingsAsync,
  createWorldImageryAsync,
  createWorldTerrainAsync,
  Ion,
  LightingModel,
  ShadowMode,
  type Cesium3DTileset,
  type ImageryLayer,
  type TerrainProvider,
  type Viewer,
} from "cesium";
import type { DaylightState, WorldMemoryStats, WorldQuality, WorldVisualProvider } from "./types";

export const CESIUM_QUALITY_SETTINGS = {
  low: {
    resolution: 0.68,
    terrainError: 5,
    buildingsError: 40,
    terrainCache: 80,
    loadingDescendantLimit: 8,
    terrainLighting: true,
    waterEffect: false,
    fogDensity: 0.00034,
    fogVisualDensity: 0.09,
    fogTerrainError: 3.5,
    buildingCacheMb: 64,
    cacheOverflowMb: 16,
    dynamicDensity: 0.0018,
    dynamicFactor: 24,
    foveatedRelaxation: 20,
    cullMultiplier: 90,
    progressiveFraction: 0.4,
  },
  medium: {
    resolution: 0.9,
    terrainError: 1.75,
    buildingsError: 21,
    terrainCache: 140,
    loadingDescendantLimit: 18,
    terrainLighting: true,
    waterEffect: true,
    fogDensity: 0.00026,
    fogVisualDensity: 0.072,
    fogTerrainError: 2,
    buildingCacheMb: 96,
    cacheOverflowMb: 32,
    dynamicDensity: 0.001,
    dynamicFactor: 14,
    foveatedRelaxation: 10,
    cullMultiplier: 60,
    progressiveFraction: 0.3,
  },
  high: {
    resolution: 1,
    terrainError: 0.9,
    buildingsError: 13,
    terrainCache: 220,
    loadingDescendantLimit: 26,
    terrainLighting: true,
    waterEffect: true,
    fogDensity: 0.0002,
    fogVisualDensity: 0.056,
    fogTerrainError: 1.15,
    buildingCacheMb: 144,
    cacheOverflowMb: 48,
    dynamicDensity: 0.00065,
    dynamicFactor: 9,
    foveatedRelaxation: 5,
    cullMultiplier: 45,
    progressiveFraction: 0.24,
  },
} as const satisfies Record<WorldQuality, Record<string, number | boolean>>;

export class CesiumWorldProvider implements WorldVisualProvider {
  readonly label = "Cesium world";
  terrainProvider: TerrainProvider | null = null;
  private viewer: Viewer | null = null;
  private buildings: Cesium3DTileset | null = null;
  private imagery: ImageryLayer | null = null;
  private buildingShader: CustomShader | null = null;
  private pendingTileRequests = 0;
  private processingTiles = 0;
  private removeLoadProgress: (() => void) | null = null;
  private removeTerrainLoadProgress: (() => void) | null = null;
  private terrainTileQueueLength = 0;
  private quality: WorldQuality = "medium";
  private evictionGeneration = 0;
  private removeEvictionPostRender: (() => void) | null = null;

  constructor(private readonly token: string) {}

  async initialize(viewer: Viewer): Promise<void> {
    // When no user token is supplied, retain CesiumJS's built-in evaluation
    // token. It is suitable for this local checkpoint, not production.
    if (this.token) Ion.defaultAccessToken = this.token;
    this.viewer = viewer;
    const [terrain, imagery, buildings] = await Promise.all([
      createWorldTerrainAsync({ requestVertexNormals: true, requestWaterMask: true }),
      createWorldImageryAsync(),
      createOsmBuildingsAsync({
        defaultColor: Color.fromCssColorString("#d8d2c7"),
        enableShowOutline: true,
        showOutline: true,
      }),
    ]);
    this.terrainProvider = terrain;
    viewer.terrainProvider = terrain;
    viewer.imageryLayers.removeAll();
    this.imagery = viewer.imageryLayers.addImageryProvider(imagery);
    this.imagery.brightness = 1.04;
    this.imagery.contrast = 1.12;
    this.imagery.saturation = 0.72;
    this.imagery.gamma = 1;
    this.buildings = buildings;
    this.removeLoadProgress = buildings.loadProgress.addEventListener(
      (pendingRequests: number, processingTiles: number) => {
        this.pendingTileRequests = pendingRequests;
        this.processingTiles = processingTiles;
      },
    );
    buildings.style = undefined;
    this.buildingShader = new CustomShader({
      lightingModel: LightingModel.PBR,
      translucencyMode: CustomShaderTranslucencyMode.OPAQUE,
      fragmentShaderText: `
        void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
          vec3 positionWC = fsInput.attributes.positionWC;
          vec3 upWC = normalize(positionWC);
          vec3 normalEC = normalize(fsInput.attributes.normalEC);
          vec3 upEC = normalize(czm_viewRotation * upWC);
          vec3 normalWC = normalize(czm_inverseViewRotation * normalEC);

          float roof = smoothstep(0.68, 0.9, dot(normalEC, upEC));
          float radius = length(positionWC);
          float latitude = asin(clamp(positionWC.z / radius, -1.0, 1.0));
          float longitude = atan(positionWC.y, positionWC.x);
          float eastMeters = longitude * 6378137.0 * max(cos(latitude), 0.1);
          float northMeters = latitude * 6378137.0;

          vec3 eastWC = normalize(vec3(-upWC.y, upWC.x, 0.0));
          vec3 northWC = normalize(cross(upWC, eastWC));
          float eastFacing = abs(dot(normalWC, eastWC));
          float northFacing = abs(dot(normalWC, northWC));
          float facadeMeters = mix(northMeters, eastMeters, step(eastFacing, northFacing));

          float column = fract(facadeMeters / 4.4);
          float floorBand = fract(radius / 3.25);
          float windowColumn = smoothstep(0.12, 0.2, column) * (1.0 - smoothstep(0.8, 0.88, column));
          float windowRow = smoothstep(0.2, 0.28, floorBand) * (1.0 - smoothstep(0.72, 0.8, floorBand));
          float facade = 1.0 - roof;
          float windowMask = windowColumn * windowRow * facade;

          float variation = 0.5 + 0.5 * sin(longitude * 19000.0 + latitude * 23000.0);
          vec3 concrete = mix(vec3(0.52, 0.51, 0.49), vec3(0.7, 0.69, 0.66), variation * 0.45);
          vec3 roofColor = mix(concrete, vec3(0.63, 0.63, 0.61), 0.65);
          vec3 glass = mix(vec3(0.075, 0.13, 0.16), vec3(0.14, 0.23, 0.27), variation);

          material.diffuse = mix(mix(concrete, roofColor, roof), glass, windowMask * 0.9);
          material.roughness = mix(0.84, 0.32, windowMask);
          material.specular = mix(vec3(0.04), vec3(0.18), windowMask);
          material.alpha = 1.0;
        }
      `,
    });
    buildings.customShader = this.buildingShader;
    buildings.shadows = ShadowMode.RECEIVE_ONLY;
    buildings.enableCollision = false;
    buildings.outlineColor = Color.fromCssColorString("#454941").withAlpha(0.55);
    buildings.skipLevelOfDetail = true;
    buildings.baseScreenSpaceError = 1_024;
    buildings.skipScreenSpaceErrorFactor = 16;
    buildings.skipLevels = 1;
    buildings.immediatelyLoadDesiredLevelOfDetail = false;
    buildings.loadSiblings = false;
    buildings.cullRequestsWhileMoving = true;
    buildings.preloadFlightDestinations = false;
    buildings.dynamicScreenSpaceError = true;
    buildings.foveatedScreenSpaceError = true;
    viewer.scene.primitives.add(buildings);
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.globe.preloadAncestors = true;
    viewer.scene.globe.preloadSiblings = false;
    viewer.scene.globe.loadingDescendantLimit = 12;
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.dynamicAtmosphereLighting = true;
    viewer.scene.globe.dynamicAtmosphereLightingFromSun = true;
    viewer.scene.globe.lambertDiffuseMultiplier = 0.84;
    viewer.scene.globe.vertexShadowDarkness = 0.3;
    viewer.scene.globe.showWaterEffect = true;
    viewer.scene.globe.showSkirts = true;
    viewer.scene.globe.atmosphereSaturationShift = -0.025;
    viewer.scene.globe.atmosphereBrightnessShift = 0.025;
    this.removeTerrainLoadProgress = viewer.scene.globe.tileLoadProgressEvent.addEventListener((queueLength: number) => {
      this.terrainTileQueueLength = queueLength;
    });
    this.setQuality("medium");
  }

  setQuality(level: WorldQuality): void {
    if (!this.viewer) return;
    this.quality = level;
    const settings = CESIUM_QUALITY_SETTINGS[level];
    this.viewer.resolutionScale = settings.resolution;
    this.viewer.scene.globe.maximumScreenSpaceError = settings.terrainError;
    if (!this.removeEvictionPostRender) this.viewer.scene.globe.tileCacheSize = settings.terrainCache;
    this.viewer.scene.globe.loadingDescendantLimit = settings.loadingDescendantLimit;
    this.viewer.scene.globe.preloadSiblings = false;
    this.viewer.scene.globe.enableLighting = settings.terrainLighting;
    this.viewer.scene.globe.showWaterEffect = settings.waterEffect;
    this.viewer.scene.fog.density = settings.fogDensity;
    this.viewer.scene.fog.visualDensityScalar = settings.fogVisualDensity;
    this.viewer.scene.fog.screenSpaceErrorFactor = settings.fogTerrainError;
    if (this.viewer.scene.skyAtmosphere) {
      this.viewer.scene.skyAtmosphere.perFragmentAtmosphere = level === "high";
    }
    if (this.buildings) {
      this.buildings.shadows = ShadowMode.RECEIVE_ONLY;
      this.buildings.maximumScreenSpaceError = settings.buildingsError;
      this.buildings.dynamicScreenSpaceError = true;
      this.buildings.dynamicScreenSpaceErrorDensity = settings.dynamicDensity;
      this.buildings.dynamicScreenSpaceErrorFactor = settings.dynamicFactor;
      this.buildings.dynamicScreenSpaceErrorHeightFalloff = 0.25;
      this.buildings.skipLevelOfDetail = true;
      this.buildings.cullRequestsWhileMoving = true;
      this.buildings.cullRequestsWhileMovingMultiplier = settings.cullMultiplier;
      this.buildings.progressiveResolutionHeightFraction = settings.progressiveFraction;
      this.buildings.foveatedScreenSpaceError = true;
      this.buildings.foveatedConeSize = 0.18;
      this.buildings.foveatedMinimumScreenSpaceErrorRelaxation = settings.foveatedRelaxation;
      this.buildings.foveatedTimeDelay = 0.12;
      this.buildings.cacheBytes = settings.buildingCacheMb * 1_024 * 1_024;
      this.buildings.maximumCacheOverflowBytes = settings.cacheOverflowMb * 1_024 * 1_024;
    }
  }

  setDaylight(state: DaylightState): void {
    if (!this.buildings) return;
    if (this.imagery) {
      this.imagery.brightness = 0.96 + state.daylight * 0.09;
      this.imagery.contrast = 1.08 + state.daylight * 0.04;
      this.imagery.saturation = 0.68 + state.daylight * 0.06;
      this.imagery.gamma = 1 + state.horizon * 0.025;
      this.imagery.hue = 0;
    }
    this.buildings.imageBasedLighting.imageBasedLightingFactor.x = 0.44 + state.daylight * 0.43;
    this.buildings.imageBasedLighting.imageBasedLightingFactor.y = 0.28 + state.daylight * 0.34;
    this.buildings.environmentMapManager.brightness = 0.58 + state.daylight * 0.42;
    this.buildings.environmentMapManager.saturation = 0.9 + state.daylight * 0.05;
    this.buildings.environmentMapManager.atmosphereScatteringIntensity = 0.72 + state.daylight * 0.58;
  }

  isBuildingPick(picked: unknown): boolean {
    if (!this.buildings || !picked || typeof picked !== "object") return false;
    const result = picked as {
      primitive?: unknown;
      tileset?: unknown;
      content?: { tileset?: unknown };
    };
    return result.primitive === this.buildings || result.tileset === this.buildings || result.content?.tileset === this.buildings;
  }

  memoryStats(): WorldMemoryStats {
    return {
      tileMemoryBytes: this.buildings?.totalMemoryUsageInBytes ?? null,
      tileCacheBytes: this.buildings?.cacheBytes ?? null,
      tileCacheOverflowBytes: this.buildings?.maximumCacheOverflowBytes ?? null,
      pendingTileRequests: this.pendingTileRequests,
      processingTiles: this.processingTiles,
      terrainTileQueueLength: this.terrainTileQueueLength,
      tilesLoaded: (this.buildings?.tilesLoaded ?? true) && (this.viewer?.scene.globe.tilesLoaded ?? true),
    };
  }

  releaseUnusedResources(): void {
    if (!this.viewer || !this.buildings) return;
    this.evictionGeneration += 1;
    const generation = this.evictionGeneration;
    this.removeEvictionPostRender?.();
    this.removeEvictionPostRender = null;
    this.buildings.trimLoadedTiles();
    this.viewer.scene.globe.tileCacheSize = Math.min(32, CESIUM_QUALITY_SETTINGS[this.quality].terrainCache);
    let renderedFrames = 0;
    this.removeEvictionPostRender = this.viewer.scene.postRender.addEventListener(() => {
      if (generation !== this.evictionGeneration || !this.viewer) return;
      renderedFrames += 1;
      if (renderedFrames < 2) return;
      this.removeEvictionPostRender?.();
      this.removeEvictionPostRender = null;
      this.viewer.scene.globe.tileCacheSize = CESIUM_QUALITY_SETTINGS[this.quality].terrainCache;
    });
    this.viewer.scene.requestRender();
  }

  destroy(): void {
    this.evictionGeneration += 1;
    this.removeEvictionPostRender?.();
    this.removeEvictionPostRender = null;
    this.removeLoadProgress?.();
    this.removeLoadProgress = null;
    this.removeTerrainLoadProgress?.();
    this.removeTerrainLoadProgress = null;
    if (this.viewer && !this.viewer.isDestroyed() && this.buildings && !this.buildings.isDestroyed()) {
      this.viewer.scene.primitives.remove(this.buildings);
    }
    if (this.buildingShader && !this.buildingShader.isDestroyed()) this.buildingShader.destroy();
    this.buildings = null;
    this.imagery = null;
    this.buildingShader = null;
    this.viewer = null;
    this.pendingTileRequests = 0;
    this.processingTiles = 0;
    this.terrainTileQueueLength = 0;
  }
}
