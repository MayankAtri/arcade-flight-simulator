import type { TerrainProvider, Viewer } from "cesium";
import type { GeodeticPosition } from "../flight/coordinates";

export type WorldQuality = "low" | "medium" | "high";

export type TerrainSample = {
  height: number;
  reliable: boolean;
  sampledAt: number;
};

export interface WorldVisualProvider {
  readonly label: string;
  readonly terrainProvider: TerrainProvider | null;
  initialize(viewer: Viewer): Promise<void>;
  setQuality(level: WorldQuality): void;
  destroy(): void;
}

export interface TerrainSampler {
  sampleHeight(position: GeodeticPosition): Promise<TerrainSample>;
  prefetch(path: readonly GeodeticPosition[]): void;
}
