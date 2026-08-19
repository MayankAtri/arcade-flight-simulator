import type { TerrainProvider, Viewer } from "cesium";
import type { GeodeticPosition } from "../flight/coordinates";

export type WorldQuality = "low" | "medium" | "high";

export type DaylightPhase = "dawn" | "day" | "dusk";

export type DaylightState = {
  localHour: number;
  daylight: number;
  horizon: number;
  phase: DaylightPhase;
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
  setDaylight(state: DaylightState): void;
  isBuildingPick(picked: unknown): boolean;
  memoryStats(): WorldMemoryStats;
  releaseUnusedResources(): void;
  destroy(): void;
}

export interface TerrainSampler {
  sampleHeight(position: GeodeticPosition): Promise<TerrainSample>;
  prefetch(path: readonly GeodeticPosition[]): void;
}
