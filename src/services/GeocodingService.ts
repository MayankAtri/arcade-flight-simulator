export type GeocodingResult = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

const CACHE_KEY = "arcade-flight-geocoding-v1";
const MIN_INTERVAL_MS = 1_050;
let lastRequestAt = 0;

const readCache = (): Record<string, GeocodingResult[]> => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Record<string, GeocodingResult[]>;
  } catch {
    return {};
  }
};

const writeCache = (cache: Record<string, GeocodingResult[]>): void => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // A private browsing policy may make localStorage unavailable; search still works.
  }
};

export const searchCities = async (query: string): Promise<GeocodingResult[]> => {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized.length < 2) return [];
  const cache = readCache();
  if (cache[normalized]) return cache[normalized];

  const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt));
  if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait));
  lastRequestAt = Date.now();
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query.trim());
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "6");
  url.searchParams.set("addressdetails", "1");
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Location search failed (${response.status}).`);
  const payload = (await response.json()) as NominatimResult[];
  const results = payload.map((result) => ({
    id: String(result.place_id),
    label: result.display_name,
    latitude: Number(result.lat),
    longitude: Number(result.lon),
  }));
  cache[normalized] = results;
  writeCache(cache);
  return results;
};
