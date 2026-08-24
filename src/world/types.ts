import type { TerrainProvider, Viewer } from "cesium";
import type { GeodeticPosition } from "../flight/coordinates";

export type WorldQuality = "low" | "medium" | "high";

export type WeatherPreset = "clear" | "scattered" | "cloudy";

export type DaylightPhase = "dawn" | "day" | "dusk";

export type DaylightState = {
  localHour: number;
  solarElevationRadians: number;
  daylight: number;
  horizon: number;
  highSun: number;
  phase: DaylightPhase;
};

export type EnvironmentVisualState = {
  daylight: DaylightState;
  weatherPreset: WeatherPreset;
};

export type TerrainSample = {
  height: number;
  reliable: boolean;
  sampledAt: number;
};

export type WorldMemoryStats = {
  tileMemoryBytes: number | null;
  tileCacheBytes: number | null;
  tileCacheOverflowBytes: number | null;
  pendingTileRequests: number;
  processingTiles: number;
  terrainTileQueueLength: number;
  tilesLoaded: boolean;
};

export type TerrainMemoryStats = {
  cachedSamples: number;
  inFlightRequests: number;
};

export interface WorldVisualProvider {
  readonly label: string;
  readonly terrainProvider: TerrainProvider | null;
  initialize(viewer: Viewer): Promise<void>;
  setQuality(level: WorldQuality): void;
  setEnvironment(state: EnvironmentVisualState): void;
  isBuildingPick(picked: unknown): boolean;
  memoryStats(): WorldMemoryStats;
  releaseUnusedResources(): void;
  destroy(): void;
}

export interface TerrainSampler {
  sampleHeight(position: GeodeticPosition): Promise<TerrainSample>;
  prefetch(path: readonly GeodeticPosition[]): void;
}
