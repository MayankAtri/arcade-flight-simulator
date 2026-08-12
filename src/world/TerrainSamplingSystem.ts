import { Cartographic, sampleTerrainMostDetailed, type TerrainProvider } from "cesium";
import { radiansToDegrees, type GeodeticPosition } from "../flight/coordinates";
import type { TerrainSample, TerrainSampler } from "./types";

const CACHE_PRECISION = 4;
const MAX_CACHE_ENTRIES = 1_200;

export class TerrainSamplingSystem implements TerrainSampler {
  private readonly cache = new Map<string, TerrainSample>();
  private readonly inFlight = new Map<string, Promise<TerrainSample>>();
  private latest: TerrainSample = { height: 0, reliable: false, sampledAt: 0 };
  private pending = false;
  private lastRequestTime = 0;
  private generation = 0;

  constructor(private readonly provider: TerrainProvider | null) {}

  reset(fallbackHeight: number, position?: GeodeticPosition): void {
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

  update(position: GeodeticPosition, now: number): void {
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
    const request = sampleTerrainMostDetailed(this.provider, [
      new Cartographic(position.longitude, position.latitude, position.height),
    ])
      .then(([sampled]) => {
        const result = {
          height: Number.isFinite(sampled.height) ? sampled.height : this.latest.height,
          reliable: Number.isFinite(sampled.height),
          sampledAt: performance.now(),
        };
        this.remember(key, result);
        return result;
      })
      .catch(() => ({ ...this.latest, reliable: false, sampledAt: performance.now() }))
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }

  prefetch(path: readonly GeodeticPosition[]): void {
    for (const position of path.slice(0, 3)) {
      if (!this.cache.has(this.cacheKey(position))) void this.sampleHeight(position);
    }
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
