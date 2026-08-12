import {
  Cartesian3,
  Cartesian2,
  Color,
  DistanceDisplayCondition,
  EllipsoidTerrainProvider,
  HeightReference,
  IonGeocodeProviderType,
  LabelStyle,
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
import { BasicWorldProvider } from "../world/BasicWorldProvider";
import { AdaptiveQualityController } from "../world/AdaptiveQualityController";
import { CesiumWorldProvider } from "../world/CesiumWorldProvider";
import { GoogleWorldProvider } from "../world/GoogleWorldProvider";
import { resolveRequestedWorldMode } from "../world/resolveWorldMode";
import { TerrainSamplingSystem } from "../world/TerrainSamplingSystem";
import type { WorldQuality, WorldVisualProvider } from "../world/types";
import { AircraftRenderer } from "./AircraftRenderer";
import { AudioSystem } from "./AudioSystem";
import { CameraSystem, type CameraMode } from "./CameraSystem";
import { InputManager } from "./InputManager";

export type RuntimeTelemetry = FlightTelemetry & {
  fps: number;
  paused: boolean;
  cameraMode: CameraMode;
  worldLabel: string;
  quality: WorldQuality;
  terrainReliable: boolean;
};

export type EngineStatus = {
  phase: "loading" | "ready" | "error";
  message: string;
  fallbackReason?: string;
};

type SimulationCallbacks = {
  onTelemetry: (telemetry: RuntimeTelemetry) => void;
  onStatus: (status: EngineStatus) => void;
  onMenuRequested: () => void;
};

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
  private readonly qualityController = new AdaptiveQualityController("medium");
  private lastTerrainPrefetchTime = 0;
  private removePreUpdate: (() => void) | null = null;
  private airportMarkerIds: string[] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: SimulationCallbacks,
  ) {}

  async initialize(): Promise<void> {
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
        this.world = photorealisticWorld;
        this.terrain = new TerrainSamplingSystem(photorealisticWorld.terrainProvider);
      } catch (error) {
        fallbackReason = `Photorealistic test unavailable: ${error instanceof Error ? error.message : "unknown error"}`;
        photorealisticWorld.destroy();
      }
    }

    if (!this.world) {
      const cesiumWorld = new CesiumWorldProvider(env.cesiumIonToken);
      try {
        await cesiumWorld.initialize(viewer);
        this.world = cesiumWorld;
        this.terrain = new TerrainSamplingSystem(cesiumWorld.terrainProvider);
      } catch (error) {
        fallbackReason = error instanceof Error ? error.message : "The Cesium world could not be loaded.";
        cesiumWorld.destroy();
      }
    }

    if (!this.world) {
      const basicWorld = new BasicWorldProvider();
      await basicWorld.initialize(viewer);
      this.world = basicWorld;
      this.terrain = new TerrainSamplingSystem(null);
      this.quality = "high";
      this.qualityController.reset("high");
    }

    if (!this.terrain) throw new Error("Terrain sampling could not be initialized.");
    const defaultSpawnPosition = this.spawnGeodetic(DEFAULT_SPAWN);
    await this.terrain.sampleHeight(defaultSpawnPosition);
    this.terrain.reset(DEFAULT_SPAWN.elevationMeters, defaultSpawnPosition);
    try {
      await this.aircraft.initialize(viewer.scene);
    } catch (error) {
      this.destroy();
      throw new Error(`Aircraft model failed to load: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    this.aircraft.update(this.flight.state.positionECEF, this.flight.state.bodyToECEF);
    this.camera.update(viewer.camera, this.flight.state.positionECEF, this.flight.state.bodyToECEF, 0, 1);
    this.lastFrameTime = performance.now();
    this.fpsWindowStart = this.lastFrameTime;
    this.removePreUpdate = viewer.scene.preUpdate.addEventListener(this.onFrame);
    this.callbacks.onStatus({
      phase: "ready",
      message: `${this.world.label} ready`,
      fallbackReason,
    });
    this.emitTelemetry(this.lastFrameTime);
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
    this.accumulator = 0;
    this.paused = false;
  }

  async spawnAt(request: SpawnRequest): Promise<void> {
    if (!this.terrain) {
      this.spawn(request);
      return;
    }
    const spawnPosition = this.spawnGeodetic(request);
    const terrainSample = await this.terrain.sampleHeight(spawnPosition);
    this.terrain.reset(request.elevationMeters, spawnPosition);
    this.spawn(terrainSample.reliable ? { ...request, elevationMeters: terrainSample.height } : request);
  }

  respawn(): void {
    this.spawn(this.lastSpawn);
  }

  async unlockAudio(): Promise<boolean> {
    return this.audio.unlock();
  }

  setSoundEnabled(enabled: boolean): void {
    this.audio.setEnabled(enabled);
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

  destroy(): void {
    this.removePreUpdate?.();
    this.removePreUpdate = null;
    this.input.destroy();
    this.audio.destroy();
    if (this.viewer && !this.viewer.isDestroyed()) {
      this.aircraft.destroy(this.viewer.scene);
      this.world?.destroy();
      this.viewer.destroy();
    }
    this.viewer = null;
  }

  private onFrame = (_scene: Scene): void => {
    if (!this.viewer || !this.terrain || !this.world) return;
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
      this.setPaused(true);
      this.callbacks.onMenuRequested();
    }

    const geodetic = ecefToGeodetic(this.flight.state.positionECEF);
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

    if (!this.paused) {
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

    const telemetry = this.flight.telemetry(environment);
    this.audio.update(telemetry, this.paused, this.camera.mode);
    const interpolation = this.paused ? 1 : clamp(this.accumulator / T.fixedStepSeconds, 0, 1);
    const renderPosition = lerpVec3(this.previousPositionECEF, this.flight.state.positionECEF, interpolation);
    const renderOrientation = slerpQuat(this.previousBodyToECEF, this.flight.state.bodyToECEF, interpolation);
    this.aircraft.update(renderPosition, renderOrientation);
    this.camera.update(
      this.viewer.camera,
      renderPosition,
      renderOrientation,
      telemetry.airspeedMetersPerSecond,
      frameSeconds,
    );

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
    this.callbacks.onTelemetry({
      ...this.flight.telemetry({ groundHeight: sample.height, terrainReliable: sample.reliable }),
      fps: this.fps,
      paused: this.paused,
      cameraMode: this.camera.mode,
      worldLabel: this.world.label,
      quality: this.quality,
      terrainReliable: sample.reliable,
    });
    this.lastTelemetryTime = now;
  }

  private spawnGeodetic(request: SpawnRequest): GeodeticPosition {
    return {
      latitude: degreesToRadians(request.latitudeDegrees),
      longitude: degreesToRadians(request.longitudeDegrees),
      height: request.elevationMeters,
    };
  }
}
