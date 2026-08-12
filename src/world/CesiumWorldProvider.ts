import {
  Cartesian3,
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
import type { WorldQuality, WorldVisualProvider } from "./types";

export class CesiumWorldProvider implements WorldVisualProvider {
  readonly label = "Cesium world";
  terrainProvider: TerrainProvider | null = null;
  private viewer: Viewer | null = null;
  private buildings: Cesium3DTileset | null = null;
  private imagery: ImageryLayer | null = null;
  private buildingShader: CustomShader | null = null;

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
    this.imagery.brightness = 1.035;
    this.imagery.contrast = 1.08;
    this.imagery.saturation = 1.08;
    this.imagery.gamma = 0.98;
    this.buildings = buildings;
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
          vec3 concrete = mix(vec3(0.69, 0.67, 0.62), vec3(0.82, 0.8, 0.75), variation * 0.45);
          vec3 roofColor = mix(concrete, vec3(0.72, 0.71, 0.68), 0.65);
          vec3 glass = mix(vec3(0.09, 0.17, 0.21), vec3(0.18, 0.3, 0.34), variation);

          material.diffuse = mix(mix(concrete, roofColor, roof), glass, windowMask * 0.9);
          material.roughness = mix(0.84, 0.32, windowMask);
          material.specular = mix(vec3(0.04), vec3(0.18), windowMask);
          material.alpha = 1.0;
        }
      `,
    });
    buildings.customShader = this.buildingShader;
    buildings.shadows = ShadowMode.DISABLED;
    buildings.enableCollision = false;
    buildings.outlineColor = Color.fromCssColorString("#454941").withAlpha(0.55);
    buildings.lightColor = new Cartesian3(1.12, 1.1, 1.06);
    buildings.skipLevelOfDetail = true;
    buildings.baseScreenSpaceError = 1_024;
    buildings.skipScreenSpaceErrorFactor = 16;
    buildings.skipLevels = 1;
    buildings.immediatelyLoadDesiredLevelOfDetail = false;
    buildings.loadSiblings = false;
    buildings.cullRequestsWhileMoving = true;
    buildings.preloadFlightDestinations = true;
    buildings.dynamicScreenSpaceError = true;
    buildings.foveatedScreenSpaceError = true;
    viewer.scene.primitives.add(buildings);
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.globe.preloadAncestors = true;
    viewer.scene.globe.preloadSiblings = false;
    viewer.scene.globe.loadingDescendantLimit = 12;
    this.setQuality("medium");
  }

  setQuality(level: WorldQuality): void {
    if (!this.viewer) return;
    const settings = {
      low: {
        resolution: 0.74,
        terrainError: 4.5,
        buildingsError: 34,
        terrainCache: 140,
        buildingCacheMb: 112,
        cacheOverflowMb: 48,
        dynamicDensity: 0.0015,
        dynamicFactor: 20,
        foveatedRelaxation: 16,
        cullMultiplier: 80,
        progressiveFraction: 0.36,
      },
      medium: {
        resolution: 0.9,
        terrainError: 2.5,
        buildingsError: 21,
        terrainCache: 210,
        buildingCacheMb: 176,
        cacheOverflowMb: 80,
        dynamicDensity: 0.001,
        dynamicFactor: 14,
        foveatedRelaxation: 10,
        cullMultiplier: 60,
        progressiveFraction: 0.3,
      },
      high: {
        resolution: 1,
        terrainError: 1.5,
        buildingsError: 13,
        terrainCache: 280,
        buildingCacheMb: 240,
        cacheOverflowMb: 112,
        dynamicDensity: 0.00065,
        dynamicFactor: 9,
        foveatedRelaxation: 5,
        cullMultiplier: 45,
        progressiveFraction: 0.24,
      },
    }[level];
    this.viewer.resolutionScale = settings.resolution;
    this.viewer.scene.globe.maximumScreenSpaceError = settings.terrainError;
    this.viewer.scene.globe.tileCacheSize = settings.terrainCache;
    if (this.buildings) {
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

  destroy(): void {
    if (this.viewer && this.buildings && !this.buildings.isDestroyed()) {
      this.viewer.scene.primitives.remove(this.buildings);
    }
    if (this.buildingShader && !this.buildingShader.isDestroyed()) this.buildingShader.destroy();
    this.buildings = null;
    this.imagery = null;
    this.buildingShader = null;
    this.viewer = null;
  }
}
