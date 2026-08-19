import { Cartographic, sampleTerrainMostDetailed, type TerrainProvider } from "cesium";
import { radiansToDegrees, type GeodeticPosition } from "../flight/coordinates";
import type { TerrainMemoryStats, TerrainSample, TerrainSampler } from "./types";

const CACHE_PRECISION = 4;
const MAX_CACHE_ENTRIES = 1_200;

export class TerrainSamplingSystem implements TerrainSampler {
  private readonly cache = new Map<string, TerrainSample>();
  private readonly inFlight = new Map<string, Promise<TerrainSample>>();
  private latest: TerrainSample = { height: 0, reliable: false, sampledAt: 0 };
  private pending = false;
  private lastRequestTime = 0;
  private generation = 0;
  private destroyed = false;

  constructor(private provider: TerrainProvider | null) {}

  reset(fallbackHeight: number, position?: GeodeticPosition): void {
    if (this.destroyed) return;
    this.generation += 1;
    this.latest = (position && this.cache.get(this.cacheKey(position))) ?? {
      height: fallbackHeight,
      reliable: false,
      sampledAt: performance.now(),
    };
    this.pending = false;
    this.lastRequestTime = 0;
  }

  current(): TerrainSample {
    return this.latest;
  }

  memoryStats(): TerrainMemoryStats {
    return {
      cachedSamples: this.cache.size,
      inFlightRequests: this.inFlight.size,
    };
  }

  update(position: GeodeticPosition, now: number): void {
    if (this.destroyed) return;
    if (this.pending || now - this.lastRequestTime < 220) return;
    this.lastRequestTime = now;
    const key = this.cacheKey(position);
    const cached = this.cache.get(key);
    if (cached) {
      this.latest = cached;
      return;
    }
    const generation = this.generation;
    this.pending = true;
    void this.sampleHeight(position)
      .then((sample) => {
        if (generation === this.generation) this.latest = sample;
      })
      .finally(() => {
        if (generation === this.generation) this.pending = false;
      });
  }

  async sampleHeight(position: GeodeticPosition): Promise<TerrainSample> {
    if (this.destroyed) return { ...this.latest, reliable: false, sampledAt: performance.now() };
    const key = this.cacheKey(position);
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    const inFlight = this.inFlight.get(key);
    if (inFlight) return inFlight;
    if (!this.provider || !this.provider.availability) {
      const fallback = { height: 0, reliable: false, sampledAt: performance.now() };
      this.remember(key, fallback);
      return fallback;
    }
    const generation = this.generation;
    const request = sampleTerrainMostDetailed(this.provider, [
      new Cartographic(position.longitude, position.latitude, position.height),
    ])
      .then(([sampled]) => {
        const result = {
          height: Number.isFinite(sampled.height) ? sampled.height : this.latest.height,
          reliable: Number.isFinite(sampled.height),
          sampledAt: performance.now(),
        };
        if (!this.destroyed && generation === this.generation) this.remember(key, result);
        return result;
      })
      .catch(() => ({ ...this.latest, reliable: false, sampledAt: performance.now() }))
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }

  prefetch(path: readonly GeodeticPosition[]): void {
    if (this.destroyed) return;
    for (const position of path.slice(0, 3)) {
      if (!this.cache.has(this.cacheKey(position))) void this.sampleHeight(position);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    this.cache.clear();
    this.inFlight.clear();
    this.pending = false;
    this.lastRequestTime = 0;
    this.provider = null;
  }

  private cacheKey(position: GeodeticPosition): string {
    return `${radiansToDegrees(position.latitude).toFixed(CACHE_PRECISION)}:${radiansToDegrees(position.longitude).toFixed(CACHE_PRECISION)}`;
  }

  private remember(key: string, sample: TerrainSample): void {
    this.cache.delete(key);
    this.cache.set(key, sample);
    while (this.cache.size > MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.cache.delete(oldest);
    }
  }
}
