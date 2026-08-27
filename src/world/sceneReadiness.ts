import type { WorldMemoryStats } from "./types";

export type SceneReadinessSnapshot = {
  globeVisible: boolean;
  globeTilesLoaded: boolean;
  world: WorldMemoryStats;
};

export const hasRenderableWorld = ({ globeVisible, globeTilesLoaded, world }: SceneReadinessSnapshot): boolean => {
  const hasRenderedTileGeometry = world.tileMemoryBytes !== null && world.tileMemoryBytes > 0;
  if (globeVisible) return globeTilesLoaded || hasRenderedTileGeometry;
  return hasRenderedTileGeometry;
};

export const hasSettledWorld = (snapshot: SceneReadinessSnapshot): boolean => (
  hasRenderableWorld(snapshot)
  && snapshot.world.tilesLoaded
  && snapshot.world.pendingTileRequests === 0
  && snapshot.world.processingTiles === 0
  && snapshot.world.terrainTileQueueLength === 0
);
