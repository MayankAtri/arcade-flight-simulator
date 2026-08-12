import { mkdir, writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";

const DATA_BASE = "https://davidmegginson.github.io/ourairports-data";
const OUTPUT = new URL("../src/data/airports.json", import.meta.url);

const fetchCsv = async (name) => {
  const response = await fetch(`${DATA_BASE}/${name}.csv`);
  if (!response.ok) throw new Error(`Failed to download ${name}.csv (${response.status})`);
  return parse(await response.text(), { columns: true, skip_empty_lines: true });
};

const isPaved = (surface = "") => /ASP|CON|BIT|PAV|PEM|SEALED|TARMAC/i.test(surface);
const numberOr = (value, fallback = 0) => {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const [airports, runways] = await Promise.all([fetchCsv("airports"), fetchCsv("runways")]);
const airportByIdent = new Map(
  airports
    .filter((airport) => !["closed", "heliport", "seaplane_base", "balloonport"].includes(airport.type))
    .map((airport) => [airport.ident, airport]),
);

const bestRunwayByAirport = new Map();
for (const runway of runways) {
  if (runway.closed === "1" || !airportByIdent.has(runway.airport_ident)) continue;
  const length = numberOr(runway.length_ft);
  const score = length + (isPaved(runway.surface) ? 30_000 : 0) + (runway.lighted === "1" ? 2_000 : 0);
  const existing = bestRunwayByAirport.get(runway.airport_ident);
  if (!existing || score > existing.score) bestRunwayByAirport.set(runway.airport_ident, { runway, score });
}

const compact = [];
for (const [ident, airport] of airportByIdent) {
  const selected = bestRunwayByAirport.get(ident)?.runway;
  if (!selected) continue;
  const heading = numberOr(selected.le_heading_degT, numberOr(selected.he_heading_degT, 0));
  const latitude = numberOr(selected.le_latitude_deg, numberOr(airport.latitude_deg));
  const longitude = numberOr(selected.le_longitude_deg, numberOr(airport.longitude_deg));
  const elevationFeet = numberOr(selected.le_elevation_ft, numberOr(airport.elevation_ft));
  const lengthFeet = numberOr(selected.length_ft);
  const airportIsUseful =
    airport.type !== "small_airport" ||
    airport.scheduled_service === "yes" ||
    Boolean(airport.iata_code) ||
    (isPaved(selected.surface) && lengthFeet >= 2_500);
  if (!airportIsUseful || !Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) continue;
  compact.push({
    ident,
    iata: airport.iata_code || "",
    name: airport.name,
    municipality: airport.municipality || "",
    country: airport.iso_country || "",
    type: airport.type,
    latitude,
    longitude,
    elevationFeet,
    runway: selected.le_ident || selected.he_ident || "",
    heading,
    lengthFeet,
    surface: selected.surface || "",
    paved: isPaved(selected.surface),
  });
}

compact.sort((a, b) => {
  const typeScore = { large_airport: 0, medium_airport: 1, small_airport: 2 };
  return (typeScore[a.type] ?? 3) - (typeScore[b.type] ?? 3) || b.lengthFeet - a.lengthFeet;
});

await mkdir(new URL("../src/data/", import.meta.url), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(compact)}\n`);
console.log(`Wrote ${compact.length.toLocaleString()} airports to ${OUTPUT.pathname}`);
