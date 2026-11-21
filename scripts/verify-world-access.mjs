import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadEnv } from "vite";

export async function verifyWorldAccess(config, fetcher = fetch) {
  const token = config.VITE_CESIUM_ION_TOKEN?.trim();
  if (!token) throw new Error("Set VITE_CESIUM_ION_TOKEN before deploying. Cesium evaluation access is not a production configuration.");
  const origin = new URL(config.WORLD_CHECK_ORIGIN || `https://${config.VERCEL_PROJECT_PRODUCTION_URL || "arcade-flight-simulator.vercel.app"}`).origin;
  // Verify the production scenery and the Cesium fallback assets.
  const assets = [[1, "World Terrain"], [2, "World Imagery"], [96188, "OSM Buildings"], [2275207, "Google 3D Tiles"]];
  const results = await Promise.all(assets.map(async ([id, name]) => {
    try {
      const response = await fetcher(`https://api.cesium.com/v1/assets/${id}/endpoint?access_token=${encodeURIComponent(token)}`, {
        headers: { Referer: `${origin}/` }, signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return `${name} (${id}): HTTP ${response.status}. Check token validity, asset access, allowed URLs, and service quota.`;
      const endpoint = await response.json();
      if (!endpoint.url && !endpoint.options?.url) return `${name} (${id}): no usable asset endpoint returned.`;
      return null;
    } catch {
      // Do not print request objects or exception messages containing credentials.
      return `${name} (${id}): service could not be reached or returned an invalid response.`;
    }
  }));
  const failures = results.filter(Boolean);
  if (failures.length) throw new Error(`3D world access check failed for ${origin}:\n${failures.join("\n")}`);
  return `3D world access verified for ${origin}: terrain, imagery, OSM buildings, and Google tiles.`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const config = { ...loadEnv("production", process.cwd(), ""), ...process.env };
    console.log(await verifyWorldAccess(config));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
