import {
  Cartesian3,
  Cartesian2,
  Color,
  DistanceDisplayCondition,
  EasingFunction,
  EllipsoidTerrainProvider,
  HeightReference,
  IonGeocodeProviderType,
  LabelStyle,
  Math as CesiumMath,
  NearFarScalar,
  VerticalOrigin,
  Viewer,
  type Scene,
} from "cesium";
import type { Airport } from "../data/types";
import { degreesToRadians, ecefToGeodetic, type GeodeticPosition } from "../flight/coordinates";
import { FlightModel } from "../flight/FlightModel";
import { add, clamp, lerpVec3, scale, slerpQuat, type Quat, type Vec3 } from "../flight/math";
import { FLIGHT_TUNING as T } from "../flight/tuning";
import type { FlightTelemetry, SpawnRequest } from "../flight/types";
import { env } from "../config/env";
import { PhotorealisticGeocodingService } from "../services/PhotorealisticGeocodingService";
import type { GeocodingResult } from "../services/GeocodingService";
import { BasicWorldProvider } from "../world/BasicWorldProvider";
import { AdaptiveQualityController } from "../world/AdaptiveQualityController";
import { CesiumWorldProvider } from "../world/CesiumWorldProvider";
import { DaylightSystem } from "../world/DaylightSystem";
import { GoogleWorldProvider } from "../world/GoogleWorldProvider";
import { resolveRequestedWorldMode } from "../world/resolveWorldMode";
import { TerrainSamplingSystem } from "../world/TerrainSamplingSystem";
import type { DaylightState, WorldQuality, WorldVisualProvider } from "../world/types";
import { shouldReleaseWorldResources } from "../world/resourceEviction";
import { AircraftRenderer } from "./AircraftRenderer";
import { AudioSystem } from "./AudioSystem";
import { CameraSystem, type CameraMode } from "./CameraSystem";
import { InputManager } from "./InputManager";
import { SceneCollisionSystem } from "./SceneCollisionSystem";

export type RuntimeTelemetry = FlightTelemetry & {
  latitudeDegrees: number;
  longitudeDegrees: number;
  fps: number;
  paused: boolean;
  cameraMode: CameraMode;
  worldLabel: string;
  quality: WorldQuality;
  terrainReliable: boolean;
  daylight: DaylightState;
};

export type EngineStatus = {
  phase: "loading" | "ready" | "error";
  message: string;
  fallbackReason?: string;
};

export type RuntimeMemoryDiagnostics = {
  capturedAt: number;
  worldLabel: string;
  quality: WorldQuality;
  fps: number;
  transitions: number;
  respawns: number;
  resourceReleases: number;
  javascriptHeap: {
    usedBytes: number;
    totalBytes: number;
    limitBytes: number;
  } | null;
  world: ReturnType<WorldVisualProvider["memoryStats"]>;
  terrain: ReturnType<TerrainSamplingSystem["memoryStats"]>;
};

type MemoryPerformance = Performance & {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
};

type MemoryDebugApi = {
  snapshot: () => RuntimeMemoryDiagnostics | null;
  transitionTo: (request: SpawnRequest) => Promise<RuntimeMemoryDiagnostics | null>;
  respawn: () => RuntimeMemoryDiagnostics | null;
};

type MemoryDebugWindow = Window & {
  __flightSimulatorMemory?: MemoryDebugApi;
};

type DeviceMemoryNavigator = Navigator & { deviceMemory?: number };

const automaticQualityCeiling = (): WorldQuality => {
  if (typeof navigator === "undefined") return "high";
  const deviceMemory = (navigator as DeviceMemoryNavigator).deviceMemory;
  return typeof deviceMemory === "number" && deviceMemory <= 8 ? "medium" : "high";
};

type SimulationCallbacks = {
  onTelemetry: (telemetry: RuntimeTelemetry) => void;
  onStatus: (status: EngineStatus) => void;
  onMenuRequested: () => void;
};

type ViewContext = "flight" | "explore" | "transition";

export const DEFAULT_AIRBORNE_SPAWN: SpawnRequest = {
  latitudeDegrees: 25.252836227416992,
  longitudeDegrees: 55.364376068115234,
  elevationMeters: 3.35,
  headingDegrees: 121,
  mode: "air",
  airborneAltitudeMeters: T.defaultAirborneSpawnAltitudeMeters,
};

export const DEFAULT_RUNWAY_SPAWN: SpawnRequest = {
  ...DEFAULT_AIRBORNE_SPAWN,
  mode: "runway",
  airborneAltitudeMeters: undefined,
};

export const DEFAULT_SPAWN = DEFAULT_AIRBORNE_SPAWN;

export class SimulationEngine {
  private viewer: Viewer | null = null;
  private world: WorldVisualProvider | null = null;
  private terrain: TerrainSamplingSystem | null = null;
  private readonly flight = new FlightModel(DEFAULT_SPAWN);
  private readonly input = new InputManager();
  private readonly aircraft = new AircraftRenderer();
  private readonly audio = new AudioSystem();
  private readonly camera = new CameraSystem();
  private previousPositionECEF: Vec3 = { ...this.flight.state.positionECEF };
  private previousBodyToECEF: Quat = { ...this.flight.state.bodyToECEF };
  private lastSpawn = DEFAULT_SPAWN;
  private paused = true;
  private accumulator = 0;
  private lastFrameTime = 0;
  private lastTelemetryTime = 0;
  private fps = 60;
  private fpsWindowStart = 0;
  private fpsFrames = 0;
  private quality: WorldQuality = "medium";
  private readonly qualityController = new AdaptiveQualityController("medium", automaticQualityCeiling());
  private lastTerrainPrefetchTime = 0;
  private removePreUpdate: (() => void) | null = null;
  private airportMarkerIds: string[] = [];
  private photorealisticGeocoder: PhotorealisticGeocodingService | null = null;
  private sceneCollision: SceneCollisionSystem | null = null;
  private daylight: DaylightSystem | null = null;
  private viewContext: ViewContext = "flight";
  private exploreLongitudeDegrees = DEFAULT_SPAWN.longitudeDegrees;
  private exploreLatitudeDegrees = DEFAULT_SPAWN.latitudeDegrees;
  private transitionCount = 0;
  private respawnCount = 0;
  private memoryDebugApi: MemoryDebugApi | null = null;
  private pendingDistantTransition = false;
  private resourceReleaseCount = 0;
  private destroyed = false;
  private lifecycleGeneration = 0;
  private sceneReadinessFrameId: number | null = null;
  private resolveSceneReadiness: (() => void) | null = null;
  private removeDestinationPostRender: (() => void) | null = null;
  private resolveDestinationPostRender: (() => void) | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: SimulationCallbacks,
  ) {}

  async initialize(): Promise<void> {
    const generation = ++this.lifecycleGeneration;
    this.callbacks.onStatus({ phase: "loading", message: "Loading the Cesium world…" });
    const requestedWorld = resolveRequestedWorldMode(window.location.search);
    const viewer = new Viewer(this.container, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: requestedWorld === "photorealistic" ? IonGeocodeProviderType.GOOGLE : false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      baseLayer: false,
      terrainProvider: new EllipsoidTerrainProvider(),
      requestRenderMode: false,
      msaaSamples: 2,
      contextOptions: {
        webgl: {
          alpha: false,
          antialias: true,
          powerPreference: "high-performance",
        },
      },
    });
    this.viewer = viewer;
    viewer.scene.backgroundColor = Color.fromCssColorString("#dfe9ef");
    viewer.scene.globe.baseColor = Color.fromCssColorString("#dbe3e7");
    viewer.scene.screenSpaceCameraController.enableInputs = false;
    viewer.scene.fog.enabled = true;
    viewer.scene.fog.density = 0.00048;
    viewer.scene.fog.visualDensityScalar = 0.14;
    viewer.scene.fog.screenSpaceErrorFactor = 3;
    viewer.scene.fog.minimumBrightness = 0.22;
    viewer.scene.fog.heightFalloff = 0.5;
    viewer.scene.highDynamicRange = true;
    viewer.scene.postProcessStages.fxaa.enabled = true;
    viewer.scene.globe.showGroundAtmosphere = true;
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.saturationShift = -0.04;
      viewer.scene.skyAtmosphere.brightnessShift = 0.03;
    }

    let fallbackReason: string | undefined;
    if (requestedWorld === "photorealistic") {
      const photorealisticWorld = new GoogleWorldProvider(env.cesiumIonToken);
      try {
        await photorealisticWorld.initialize(viewer);
        if (!this.isActive(viewer, generation)) {
          photorealisticWorld.destroy();
          return;
        }
        this.world = photorealisticWorld;
        this.terrain = new TerrainSamplingSystem(photorealisticWorld.terrainProvider);
        this.photorealisticGeocoder = new PhotorealisticGeocodingService(viewer.scene, env.cesiumIonToken);
      } catch (error) {
        if (!this.isActive(viewer, generation)) {
          photorealisticWorld.destroy();
          return;
        }
        fallbackReason = `Photorealistic test unavailable: ${error instanceof Error ? error.message : "unknown error"}`;
        photorealisticWorld.destroy();
      }
    }

    if (!this.world) {
      const cesiumWorld = new CesiumWorldProvider(env.cesiumIonToken);
      try {
        await cesiumWorld.initialize(viewer);
        if (!this.isActive(viewer, generation)) {
          cesiumWorld.destroy();
          return;
        }
        this.world = cesiumWorld;
        this.terrain = new TerrainSamplingSystem(cesiumWorld.terrainProvider);
      } catch (error) {
        if (!this.isActive(viewer, generation)) {
          cesiumWorld.destroy();
          return;
        }
        fallbackReason = error instanceof Error ? error.message : "The Cesium world could not be loaded.";
        cesiumWorld.destroy();
      }
    }

    if (!this.world) {
      const basicWorld = new BasicWorldProvider();
      await basicWorld.initialize(viewer);
      if (!this.isActive(viewer, generation)) {
        basicWorld.destroy();
        return;
      }
      this.world = basicWorld;
      this.terrain = new TerrainSamplingSystem(null);
      this.quality = "high";
      this.qualityController.reset("high");
    }

    if (!this.terrain) throw new Error("Terrain sampling could not be initialized.");
    this.daylight = new DaylightSystem(viewer);
    const initialDaylight = this.daylight.update(
      degreesToRadians(DEFAULT_SPAWN.latitudeDegrees),
      degreesToRadians(DEFAULT_SPAWN.longitudeDegrees),
    ) ?? this.daylight.current();
    this.world.setDaylight(initialDaylight);
    const defaultSpawnPosition = this.spawnGeodetic(DEFAULT_SPAWN);
    await this.terrain.sampleHeight(defaultSpawnPosition);
    if (!this.isActive(viewer, generation)) return;
    this.terrain.reset(DEFAULT_SPAWN.elevationMeters, defaultSpawnPosition);
    try {
      await this.aircraft.initialize(viewer.scene);
      if (!this.isActive(viewer, generation)) {
        this.aircraft.destroy(viewer.scene);
        return;
      }
    } catch (error) {
      if (!this.isActive(viewer, generation)) {
        this.aircraft.destroy(null);
        return;
      }
      this.destroy();
      throw new Error(`Aircraft model failed to load: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    this.aircraft.setDaylight(initialDaylight);
    this.aircraft.update(this.flight.state.positionECEF, this.flight.state.bodyToECEF);
    this.sceneCollision = new SceneCollisionSystem(viewer.scene, (picked) => this.world?.isBuildingPick(picked) ?? false);
    this.enterExploreMode();
    this.lastFrameTime = performance.now();
    this.fpsWindowStart = this.lastFrameTime;
    this.removePreUpdate = viewer.scene.preUpdate.addEventListener(this.onFrame);
    this.callbacks.onStatus({
      phase: "ready",
      message: `${this.world.label} ready`,
      fallbackReason,
    });
    this.emitTelemetry(this.lastFrameTime);
    this.installMemoryDebugApi();
  }

  spawn(request: SpawnRequest): void {
    this.lastSpawn = request;
    const spawnPosition = this.spawnGeodetic(request);
    this.terrain?.reset(request.elevationMeters, spawnPosition);
    const terrainSample = this.terrain?.current();
    const effectiveRequest = terrainSample?.reliable
      ? { ...request, elevationMeters: terrainSample.height }
      : request;
    this.flight.spawn(effectiveRequest);
    this.audio.reset(this.flight.telemetry({
      groundHeight: terrainSample?.height ?? request.elevationMeters,
      terrainReliable: terrainSample?.reliable ?? false,
    }));
    this.previousPositionECEF = { ...this.flight.state.positionECEF };
    this.previousBodyToECEF = { ...this.flight.state.bodyToECEF };
    this.camera.reset();
    this.sceneCollision?.reset();
    this.accumulator = 0;
    this.paused = false;
  }

  async spawnAt(request: SpawnRequest): Promise<void> {
    const terrain = this.terrain;
    if (!terrain) {
      if (this.destroyed) return;
      this.spawn(request);
      return;
    }
    const spawnPosition = this.spawnGeodetic(request);
    const terrainSample = await terrain.sampleHeight(spawnPosition);
    if (this.destroyed || this.terrain !== terrain) return;
    terrain.reset(request.elevationMeters, spawnPosition);
    this.spawn(terrainSample.reliable ? { ...request, elevationMeters: terrainSample.height } : request);
  }

  enterExploreMode(): void {
    if (!this.viewer) return;
    this.viewContext = "explore";
    this.audio.setFlightActive(false);
    this.setPaused(true);
    this.aircraft.setVisible(false);
    this.viewer.camera.cancelFlight();
    const position = ecefToGeodetic(this.flight.state.positionECEF);
    this.exploreLongitudeDegrees = CesiumMath.toDegrees(position.longitude);
    this.exploreLatitudeDegrees = clamp(CesiumMath.toDegrees(position.latitude) * 0.32, -18, 18);
    this.setExploreCamera();
  }

  async flyExploreTo(request: SpawnRequest): Promise<void> {
    const viewer = this.viewer;
    if (!viewer) return;
    this.transitionCount += 1;
    const currentPosition = ecefToGeodetic(this.flight.state.positionECEF);
    this.pendingDistantTransition = shouldReleaseWorldResources(
      {
        latitudeDegrees: CesiumMath.toDegrees(currentPosition.latitude),
        longitudeDegrees: CesiumMath.toDegrees(currentPosition.longitude),
      },
      request,
    );
    this.viewContext = "transition";
    this.audio.setFlightActive(false);
    this.setPaused(true);
    this.aircraft.setVisible(false);
    this.clearAirportMarkers();
    viewer.camera.cancelFlight();
    await new Promise<void>((resolve) => {
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(
          request.longitudeDegrees,
          request.latitudeDegrees,
          request.mode === "runway" ? 1_150_000 : 1_650_000,
        ),
        orientation: {
          heading: CesiumMath.toRadians(request.headingDegrees),
          pitch: CesiumMath.toRadians(-89.5),
          roll: 0,
        },
        duration: 2.6,
        easingFunction: EasingFunction.CUBIC_IN_OUT,
        complete: resolve,
        cancel: resolve,
      });
    });
  }

  async prepareFlight(request: SpawnRequest): Promise<void> {
    await Promise.all([
      this.spawnAt(request).then(() => this.setPaused(true)),
      this.waitForSceneTiles(),
    ]);
    if (this.destroyed) return;
    if (this.pendingDistantTransition) {
      await this.waitForDestinationRender();
      if (!this.destroyed) {
        this.world?.releaseUnusedResources();
        this.resourceReleaseCount += 1;
      }
    }
    this.pendingDistantTransition = false;
  }

  enterFlightMode(resume = true): void {
    if (!this.viewer) return;
    this.viewContext = "flight";
    this.audio.setFlightActive(true);
    this.aircraft.setVisible(true);
    this.camera.reset();
    this.camera.update(
      this.viewer.camera,
      this.flight.state.positionECEF,
      this.flight.state.bodyToECEF,
      this.flight.telemetry({
        groundHeight: this.terrain?.current().height ?? this.lastSpawn.elevationMeters,
        terrainReliable: this.terrain?.current().reliable ?? false,
      }).airspeedMetersPerSecond,
      1,
    );
    this.setPaused(!resume);
  }

  respawn(): void {
    this.respawnCount += 1;
    this.spawn(this.lastSpawn);
  }

  memoryDiagnostics(): RuntimeMemoryDiagnostics | null {
    if (!this.world || !this.terrain) return null;
    const heap = (performance as MemoryPerformance).memory;
    return {
      capturedAt: Date.now(),
      worldLabel: this.world.label,
      quality: this.quality,
      fps: this.fps,
      transitions: this.transitionCount,
      respawns: this.respawnCount,
      resourceReleases: this.resourceReleaseCount,
      javascriptHeap: heap
        ? {
            usedBytes: heap.usedJSHeapSize,
            totalBytes: heap.totalJSHeapSize,
            limitBytes: heap.jsHeapSizeLimit,
          }
        : null,
      world: this.world.memoryStats(),
      terrain: this.terrain.memoryStats(),
    };
  }

  async unlockAudio(): Promise<boolean> {
    return this.audio.unlock();
  }

  setSoundEnabled(enabled: boolean): void {
    this.audio.setEnabled(enabled);
  }

  setDaylightHour(hour: number): void {
    if (!this.daylight) return;
    this.daylight.setHour(hour);
    const position = ecefToGeodetic(this.flight.state.positionECEF);
    const state = this.daylight.update(position.latitude, position.longitude) ?? this.daylight.current();
    this.applyDaylight(state);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.accumulator = 0;
  }

  isPaused(): boolean {
    return this.paused;
  }

  cycleCamera(): CameraMode {
    return this.camera.cycle();
  }

  showAirportMarkers(airports: readonly Airport[]): void {
    if (!this.viewer) return;
    this.clearAirportMarkers();
    for (const airport of airports.slice(0, 12)) {
      const id = `airport-${airport.ident}`;
      this.airportMarkerIds.push(id);
      this.viewer.entities.add({
        id,
        position: Cartesian3.fromDegrees(airport.longitude, airport.latitude, airport.elevationFeet * 0.3048),
        point: {
          color: Color.fromCssColorString("#e4002b"),
          outlineColor: Color.WHITE,
          outlineWidth: 2,
          pixelSize: airport.type === "large_airport" ? 12 : 9,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(2_000, 1, 2_000_000, 0.55),
        },
        label: {
          text: airport.iata || airport.ident,
          font: "600 13px Helvetica Neue",
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -13),
          heightReference: HeightReference.CLAMP_TO_GROUND,
          distanceDisplayCondition: new DistanceDisplayCondition(0, 350_000),
        },
      });
    }
  }

  clearAirportMarkers(): void {
    if (!this.viewer) return;
    for (const id of this.airportMarkerIds) this.viewer.entities.removeById(id);
    this.airportMarkerIds = [];
  }

  async searchPhotorealisticCities(query: string): Promise<GeocodingResult[]> {
    if (!this.photorealisticGeocoder) {
      throw new Error("Google city search is available only while the photorealistic world is active.");
    }
    return this.photorealisticGeocoder.search(query);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.lifecycleGeneration += 1;
    const debugWindow = window as MemoryDebugWindow;
    if (this.memoryDebugApi && debugWindow.__flightSimulatorMemory === this.memoryDebugApi) {
      delete debugWindow.__flightSimulatorMemory;
    }
    this.memoryDebugApi = null;
    this.cancelSceneReadinessWait();
    this.cancelDestinationRenderWait();
    this.removePreUpdate?.();
    this.removePreUpdate = null;
    this.input.destroy();
    this.audio.destroy();
    this.viewer?.camera.cancelFlight();
    this.terrain?.destroy();
    if (this.viewer && !this.viewer.isDestroyed()) {
      this.aircraft.destroy(this.viewer.scene);
      this.world?.destroy();
      this.daylight?.destroy();
      this.viewer.destroy();
    }
    this.viewer = null;
    this.world = null;
    this.terrain = null;
    this.photorealisticGeocoder = null;
    this.sceneCollision = null;
    this.daylight = null;
  }

  private onFrame = (_scene: Scene): void => {
    if (!this.viewer || !this.terrain || !this.world || !this.daylight) return;
    const now = performance.now();
    let frameSeconds = (now - this.lastFrameTime) / 1_000;
    this.lastFrameTime = now;
    if (!Number.isFinite(frameSeconds) || frameSeconds > 1) {
      frameSeconds = 0;
      this.accumulator = 0;
    }
    frameSeconds = Math.min(frameSeconds, 0.1);
    this.trackFps(now);

    if (this.input.consume("camera")) this.camera.cycle();
    if (this.input.consume("flaps")) this.flight.setFlaps((this.flight.state.flaps + 0.5) % 1.5);
    if (this.input.consume("respawn")) this.respawn();
    if (this.input.consume("pause")) this.setPaused(!this.paused);
    if (this.input.consume("menu")) {
      this.enterExploreMode();
      this.callbacks.onMenuRequested();
    }

    const geodetic = ecefToGeodetic(this.flight.state.positionECEF);
    const daylightState = this.daylight.update(geodetic.latitude, geodetic.longitude);
    if (daylightState) this.applyDaylight(daylightState);
    this.terrain.update(geodetic, now);
    if (now - this.lastTerrainPrefetchTime >= 1_000) {
      this.lastTerrainPrefetchTime = now;
      const velocity = this.flight.state.velocityECEF;
      this.terrain.prefetch(
        [3, 7, 12].map((seconds) => ecefToGeodetic(add(this.flight.state.positionECEF, scale(velocity, seconds)))),
      );
    }
    const terrainSample = this.terrain.current();
    const environment = { groundHeight: terrainSample.height, terrainReliable: terrainSample.reliable };

    if (!this.paused && this.viewContext === "flight") {
      this.accumulator += frameSeconds;
      const controls = this.input.controls();
      let steps = 0;
      while (this.accumulator >= T.fixedStepSeconds && steps < 8) {
        this.previousPositionECEF = { ...this.flight.state.positionECEF };
        this.previousBodyToECEF = { ...this.flight.state.bodyToECEF };
        this.flight.step(controls, environment, T.fixedStepSeconds);
        this.accumulator -= T.fixedStepSeconds;
        steps += 1;
      }
      if (steps === 8) this.accumulator = 0;
    }

    const buildingSurface = this.sceneCollision?.sampleBuilding(
      this.flight.state.positionECEF,
      this.flight.state.bodyToECEF,
      now,
    );
    if (buildingSurface) this.flight.reconcileSceneSurface(buildingSurface.height, "building");

    const telemetry = this.flight.telemetry(environment);
    this.audio.update(telemetry, this.paused, this.camera.mode);
    const interpolation = this.paused ? 1 : clamp(this.accumulator / T.fixedStepSeconds, 0, 1);
    const renderPosition = lerpVec3(this.previousPositionECEF, this.flight.state.positionECEF, interpolation);
    const renderOrientation = slerpQuat(this.previousBodyToECEF, this.flight.state.bodyToECEF, interpolation);
    this.aircraft.update(renderPosition, renderOrientation);
    if (this.viewContext === "explore") {
      this.exploreLongitudeDegrees = CesiumMath.zeroToTwoPi(
        CesiumMath.toRadians(this.exploreLongitudeDegrees + frameSeconds * 1.25),
      ) * CesiumMath.DEGREES_PER_RADIAN;
      this.setExploreCamera();
    } else if (this.viewContext === "flight") {
      this.camera.update(
        this.viewer.camera,
        renderPosition,
        renderOrientation,
        telemetry.airspeedMetersPerSecond,
        frameSeconds,
      );
    }

    if (now - this.lastTelemetryTime >= 100) this.emitTelemetry(now);
  };

  private trackFps(now: number): void {
    this.fpsFrames += 1;
    const elapsed = now - this.fpsWindowStart;
    if (elapsed < 2_000) return;
    this.fps = (this.fpsFrames * 1_000) / elapsed;
    this.fpsFrames = 0;
    this.fpsWindowStart = now;

    const nextQuality = this.qualityController.observe(this.fps, elapsed / 1_000);
    if (nextQuality && nextQuality !== this.quality) {
      this.quality = nextQuality;
      this.world?.setQuality(nextQuality);
    }
  }

  private emitTelemetry(now: number): void {
    if (!this.terrain || !this.world) return;
    const sample = this.terrain.current();
    const position = ecefToGeodetic(this.flight.state.positionECEF);
    this.callbacks.onTelemetry({
      ...this.flight.telemetry({ groundHeight: sample.height, terrainReliable: sample.reliable }),
      latitudeDegrees: CesiumMath.toDegrees(position.latitude),
      longitudeDegrees: CesiumMath.toDegrees(position.longitude),
      fps: this.fps,
      paused: this.paused,
      cameraMode: this.camera.mode,
      worldLabel: this.world.label,
      quality: this.quality,
      terrainReliable: sample.reliable,
      daylight: this.daylight?.current() ?? {
        localHour: 12,
        daylight: 1,
        horizon: 0,
        phase: "day",
      },
    });
    this.lastTelemetryTime = now;
  }

  private applyDaylight(state: DaylightState): void {
    this.world?.setDaylight(state);
    this.aircraft.setDaylight(state);
  }

  private setExploreCamera(): void {
    if (!this.viewer) return;
    const frustum = this.viewer.camera.frustum as { fov?: number };
    if (typeof frustum.fov === "number") frustum.fov = CesiumMath.toRadians(52);
    this.viewer.camera.setView({
      destination: Cartesian3.fromDegrees(
        this.exploreLongitudeDegrees,
        this.exploreLatitudeDegrees,
        27_500_000,
      ),
      orientation: {
        heading: 0,
        pitch: CesiumMath.toRadians(-90),
        roll: 0,
      },
    });
  }

  private async waitForSceneTiles(): Promise<void> {
    this.cancelSceneReadinessWait();
    const startedAt = performance.now();
    const minimumDelayMs = 1_600;
    const maximumDelayMs = 4_200;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (this.sceneReadinessFrameId !== null) cancelAnimationFrame(this.sceneReadinessFrameId);
        this.sceneReadinessFrameId = null;
        this.resolveSceneReadiness = null;
        resolve();
      };
      this.resolveSceneReadiness = finish;
      const inspect = () => {
        const elapsed = performance.now() - startedAt;
        const viewer = this.viewer;
        if (!viewer || viewer.isDestroyed()) {
          finish();
          return;
        }
        const globeReady = !viewer.scene.globe.show || viewer.scene.globe.tilesLoaded;
        if ((elapsed >= minimumDelayMs && globeReady) || elapsed >= maximumDelayMs) {
          finish();
          return;
        }
        this.sceneReadinessFrameId = requestAnimationFrame(inspect);
      };
      inspect();
    });
  }

  private waitForDestinationRender(): Promise<void> {
    this.cancelDestinationRenderWait();
    const viewer = this.viewer;
    if (!viewer || viewer.isDestroyed()) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        this.removeDestinationPostRender?.();
        this.removeDestinationPostRender = null;
        this.resolveDestinationPostRender = null;
        resolve();
      };
      this.resolveDestinationPostRender = finish;
      this.removeDestinationPostRender = viewer.scene.postRender.addEventListener(finish);
      viewer.scene.requestRender();
    });
  }

  private cancelSceneReadinessWait(): void {
    if (this.sceneReadinessFrameId !== null) cancelAnimationFrame(this.sceneReadinessFrameId);
    this.sceneReadinessFrameId = null;
    const resolve = this.resolveSceneReadiness;
    this.resolveSceneReadiness = null;
    resolve?.();
  }

  private cancelDestinationRenderWait(): void {
    this.removeDestinationPostRender?.();
    this.removeDestinationPostRender = null;
    const resolve = this.resolveDestinationPostRender;
    this.resolveDestinationPostRender = null;
    resolve?.();
  }

  private isActive(viewer: Viewer, generation: number): boolean {
    return !this.destroyed
      && this.lifecycleGeneration === generation
      && this.viewer === viewer
      && !viewer.isDestroyed();
  }

  private spawnGeodetic(request: SpawnRequest): GeodeticPosition {
    return {
      latitude: degreesToRadians(request.latitudeDegrees),
      longitude: degreesToRadians(request.longitudeDegrees),
      height: request.elevationMeters,
    };
  }

  private installMemoryDebugApi(): void {
    if (new URLSearchParams(window.location.search).get("debugMemory") !== "1") return;
    const api: MemoryDebugApi = {
      snapshot: () => this.memoryDiagnostics(),
      transitionTo: async (request) => {
        await this.flyExploreTo(request);
        await this.prepareFlight(request);
        this.enterFlightMode(false);
        return this.memoryDiagnostics();
      },
      respawn: () => {
        this.respawn();
        this.setPaused(true);
        return this.memoryDiagnostics();
      },
    };
    this.memoryDebugApi = api;
    (window as MemoryDebugWindow).__flightSimulatorMemory = api;
  }
}
