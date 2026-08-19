import type { Airport } from "../data/types";
import type { SpawnRequest } from "../flight/types";
import { FLIGHT_TUNING as T } from "../flight/tuning";

const optionalNumber = (value: string | null): number | undefined => {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const spawnFromAirport = (airport: Airport, mode: "runway" | "air"): SpawnRequest => ({
  latitudeDegrees: airport.latitude,
  longitudeDegrees: airport.longitude,
  elevationMeters: airport.elevationFeet * 0.3048,
  headingDegrees: airport.heading,
  mode,
  airborneAltitudeMeters: T.defaultAirborneSpawnAltitudeMeters,
});

export const parseSpawnUrl = (search: string, airportLookup: (code: string) => Airport | undefined): SpawnRequest | null => {
  const params = new URLSearchParams(search);
  const mode = params.get("mode") === "runway" ? "runway" : "air";
  const altitude = optionalNumber(params.get("altitude"));
  const heading = optionalNumber(params.get("heading"));
  const airportCode = params.get("airport");
  if (airportCode) {
    const airport = airportLookup(airportCode);
    if (!airport) return null;
    const spawn = spawnFromAirport(airport, mode);
    return {
      ...spawn,
      headingDegrees: heading ?? spawn.headingDegrees,
      airborneAltitudeMeters: altitude ?? spawn.airborneAltitudeMeters,
    };
  }
  const latitude = optionalNumber(params.get("lat"));
  const longitude = optionalNumber(params.get("lon"));
  if (latitude === undefined || longitude === undefined || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const elevation = optionalNumber(params.get("elevation"));
  return {
    latitudeDegrees: latitude,
    longitudeDegrees: longitude,
    elevationMeters: elevation ?? 0,
    headingDegrees: heading ?? 0,
    mode,
    airborneAltitudeMeters: altitude ?? T.defaultAirborneSpawnAltitudeMeters,
  };
};

export const updateSpawnUrl = (request: SpawnRequest, airportCode?: string): void => {
  const params = new URLSearchParams();
  if (new URLSearchParams(location.search).get("world") === "photorealistic") {
    params.set("world", "photorealistic");
  }
  if (airportCode) params.set("airport", airportCode);
  else {
    params.set("lat", request.latitudeDegrees.toFixed(5));
    params.set("lon", request.longitudeDegrees.toFixed(5));
    if (request.elevationMeters) params.set("elevation", Math.round(request.elevationMeters).toString());
  }
  params.set("heading", Math.round(request.headingDegrees).toString());
  if (request.mode === "air") {
    params.set("altitude", Math.round(request.airborneAltitudeMeters ?? T.defaultAirborneSpawnAltitudeMeters).toString());
  }
  params.set("mode", request.mode);
  history.replaceState(null, "", `${location.pathname}?${params}`);
};
