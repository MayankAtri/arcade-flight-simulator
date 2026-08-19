import type { SpawnRequest } from "../flight/types";
import { findAirport } from "../services/AirportService";
import { spawnFromAirport } from "../services/SpawnUrlService";

export type ChallengeLegKind = "takeoff" | "waypoint" | "landing";

export type ChallengeLeg = {
  id: string;
  title: string;
  instruction: string;
  kind: ChallengeLegKind;
  latitude?: number;
  longitude?: number;
  radiusKilometers?: number;
};

export type FlightChallenge = {
  id: string;
  category: "Featured" | "Touring" | "Scenic" | "Precision" | "Advanced" | "Coastal";
  title: string;
  description: string;
  distanceNauticalMiles: number;
  originCode: string;
  originLabel: string;
  destinationCode: string;
  destinationLabel: string;
  runwayHeadingDegrees?: number;
  localHour: number;
  timeLabel: string;
  objectives: readonly string[];
  legs: readonly ChallengeLeg[];
  theme: "tagus" | "hudson" | "monaco" | "paris" | "madeira" | "bigsur";
};

export type ChallengeTelemetry = {
  latitudeDegrees: number;
  longitudeDegrees: number;
  altitudeAglMeters: number;
  airspeedMetersPerSecond: number;
  grounded: boolean;
  crashed: boolean;
};

export const FLIGHT_CHALLENGES: readonly FlightChallenge[] = [
  {
    id: "tagus-river-arrival",
    category: "Featured",
    title: "Tagus River Arrival",
    description: "Lift from Cascais, arc around the Atlantic coast, then trace the Tagus east for Lisbon.",
    distanceNauticalMiles: 23,
    originCode: "LPCS",
    originLabel: "Cascais",
    destinationCode: "LPPT",
    destinationLabel: "Lisbon Humberto Delgado",
    runwayHeadingDegrees: 344,
    localHour: 17.5,
    timeLabel: "17:30 Golden hour",
    objectives: [
      "Depart Cascais from runway 35",
      "Round the coast at Guincho",
      "Follow the Tagus through central Lisbon",
      "Land and stop at Lisbon",
    ],
    legs: [
      { id: "tagus-climb", title: "Positive climb", instruction: "Climb through 150 ft AGL and keep the runway heading.", kind: "takeoff" },
      { id: "tagus-guincho", title: "Guincho coast", instruction: "Turn west for the Atlantic shoreline, then level into a shallow coastal climb.", kind: "waypoint", latitude: 38.7307, longitude: -9.4732, radiusKilometers: 3.2 },
      { id: "tagus-belem", title: "Belém Tower", instruction: "Turn east and follow the north bank of the Tagus toward Belém.", kind: "waypoint", latitude: 38.6916, longitude: -9.216, radiusKilometers: 2.4 },
      { id: "tagus-commerce", title: "Commerce Square", instruction: "Continue upriver and begin a measured descent over central Lisbon.", kind: "waypoint", latitude: 38.7075, longitude: -9.1366, radiusKilometers: 2.2 },
      { id: "tagus-final", title: "Lisbon final", instruction: "Turn north, reduce speed, and establish a stable approach.", kind: "waypoint", latitude: 38.728, longitude: -9.151, radiusKilometers: 2.8 },
      { id: "tagus-touchdown", title: "Lisbon touchdown", instruction: "Land at Lisbon and slow below 45 knots.", kind: "landing", latitude: 38.765678, longitude: -9.144302, radiusKilometers: 4.2 },
    ],
    theme: "tagus",
  },
  {
    id: "hudson-river-commuter",
    category: "Touring",
    title: "Hudson River Commuter",
    description: "Depart JFK, cross the harbour, and run the Hudson north before turning into Teterboro.",
    distanceNauticalMiles: 31,
    originCode: "KJFK",
    originLabel: "John F. Kennedy",
    destinationCode: "KTEB",
    destinationLabel: "Teterboro",
    localHour: 8.5,
    timeLabel: "08:30",
    objectives: [
      "Depart JFK",
      "Cross New York Harbor",
      "Track the Hudson northbound",
      "Land and stop at Teterboro",
    ],
    legs: [
      { id: "hudson-climb", title: "JFK climbout", instruction: "Climb through 150 ft AGL before turning toward the harbour.", kind: "takeoff" },
      { id: "hudson-rockaway", title: "Rockaway turn", instruction: "Clear the shoreline and set up for the harbour crossing.", kind: "waypoint", latitude: 40.582, longitude: -73.885, radiusKilometers: 3.6 },
      { id: "hudson-verrazzano", title: "Verrazzano Bridge", instruction: "Cross the Narrows with a steady altitude and the bridge ahead.", kind: "waypoint", latitude: 40.6066, longitude: -74.0447, radiusKilometers: 3.4 },
      { id: "hudson-midtown", title: "Midtown Hudson", instruction: "Follow the river north with Manhattan off the right wing.", kind: "waypoint", latitude: 40.758, longitude: -74.012, radiusKilometers: 3.2 },
      { id: "hudson-george", title: "George Washington Bridge", instruction: "Pass the bridge and prepare for the westbound turn.", kind: "waypoint", latitude: 40.8517, longitude: -73.9527, radiusKilometers: 3.2 },
      { id: "hudson-base", title: "Teterboro base", instruction: "Turn toward Teterboro, reduce speed, and begin a shallow descent.", kind: "waypoint", latitude: 40.831, longitude: -74.018, radiusKilometers: 3.2 },
      { id: "hudson-touchdown", title: "Teterboro touchdown", instruction: "Land at Teterboro and slow below 45 knots.", kind: "landing", latitude: 40.838687, longitude: -74.060376, radiusKilometers: 4.2 },
    ],
    theme: "hudson",
  },
  {
    id: "monaco-coastal-return",
    category: "Scenic",
    title: "Monaco Coastal Return",
    description: "Leave Nice over the water, reach Monaco harbour, then reverse course for a coastal return.",
    distanceNauticalMiles: 28,
    originCode: "LFMN",
    originLabel: "Nice Côte d’Azur",
    destinationCode: "LFMN",
    destinationLabel: "Nice Côte d’Azur",
    localHour: 17.5,
    timeLabel: "17:30 Sunset",
    objectives: [
      "Depart Nice over the water",
      "Follow the Riviera eastbound",
      "Turn over Monaco harbour",
      "Return, land, and stop at Nice",
    ],
    legs: [
      { id: "monaco-climb", title: "Nice departure", instruction: "Climb through 150 ft AGL, then turn east along the coast.", kind: "takeoff" },
      { id: "monaco-villefranche", title: "Villefranche Bay", instruction: "Keep the coast off the left wing while holding altitude.", kind: "waypoint", latitude: 43.704, longitude: 7.312, radiusKilometers: 2.6 },
      { id: "monaco-harbour", title: "Monaco harbour", instruction: "Cross the harbour, then begin a gentle turn back toward Nice.", kind: "waypoint", latitude: 43.7384, longitude: 7.4246, radiusKilometers: 2.6 },
      { id: "monaco-ferrat", title: "Cap Ferrat return", instruction: "Track west over the water and start reducing speed.", kind: "waypoint", latitude: 43.687, longitude: 7.33, radiusKilometers: 2.7 },
      { id: "monaco-final", title: "Nice final", instruction: "Align along the coast and stabilize for the arrival.", kind: "waypoint", latitude: 43.635, longitude: 7.245, radiusKilometers: 2.8 },
      { id: "monaco-touchdown", title: "Nice touchdown", instruction: "Land at Nice and slow below 45 knots.", kind: "landing", latitude: 43.646702, longitude: 7.20249, radiusKilometers: 4.2 },
    ],
    theme: "monaco",
  },
  {
    id: "paris-left-bank-visual",
    category: "Precision",
    title: "Paris Left Bank Visual",
    description: "Launch from Le Bourget, cross central Paris, and shape a disciplined visual arrival into Orly.",
    distanceNauticalMiles: 24,
    originCode: "LFPB",
    originLabel: "Paris Le Bourget",
    destinationCode: "LFPO",
    destinationLabel: "Paris Orly",
    runwayHeadingDegrees: 249,
    localHour: 16,
    timeLabel: "16:00",
    objectives: [
      "Depart Le Bourget from runway 27",
      "Cross central Paris along the Seine",
      "Descend south of the Left Bank",
      "Land and stop at Orly",
    ],
    legs: [
      { id: "paris-climb", title: "Le Bourget climb", instruction: "Climb through 150 ft AGL and turn toward the city.", kind: "takeoff" },
      { id: "paris-montmartre", title: "Montmartre", instruction: "Track toward Montmartre with central Paris ahead.", kind: "waypoint", latitude: 48.8867, longitude: 2.3431, radiusKilometers: 2.2 },
      { id: "paris-louvre", title: "Louvre crossing", instruction: "Cross the Seine near the Louvre and prepare to descend.", kind: "waypoint", latitude: 48.8606, longitude: 2.3376, radiusKilometers: 2.2 },
      { id: "paris-montparnasse", title: "Montparnasse descent", instruction: "Turn south and configure for the Orly approach.", kind: "waypoint", latitude: 48.8422, longitude: 2.3219, radiusKilometers: 2.2 },
      { id: "paris-final", title: "Orly final", instruction: "Settle onto final with a stable speed and descent rate.", kind: "waypoint", latitude: 48.78, longitude: 2.34, radiusKilometers: 3 },
      { id: "paris-touchdown", title: "Orly touchdown", instruction: "Land at Orly and slow below 45 knots.", kind: "landing", latitude: 48.720001, longitude: 2.31692, radiusKilometers: 4.5 },
    ],
    theme: "paris",
  },
  {
    id: "madeira-ridge-arrival",
    category: "Advanced",
    title: "Madeira Ridge Arrival",
    description: "Climb from Madeira, cross the island’s high ground, then descend to the shoreline for the return.",
    distanceNauticalMiles: 27,
    originCode: "LPMA",
    originLabel: "Madeira Cristiano Ronaldo",
    destinationCode: "LPMA",
    destinationLabel: "Madeira Cristiano Ronaldo",
    localHour: 10,
    timeLabel: "10:00",
    objectives: [
      "Depart Madeira from runway 05",
      "Cross the island ridge with energy in hand",
      "Descend past Funchal",
      "Return, land, and stop at Madeira",
    ],
    legs: [
      { id: "madeira-climb", title: "Madeira climb", instruction: "Climb through 150 ft AGL over the water before turning inland.", kind: "takeoff" },
      { id: "madeira-ridge", title: "North ridge", instruction: "Cross the ridge in a steady climb and protect your airspeed.", kind: "waypoint", latitude: 32.75, longitude: -16.83, radiusKilometers: 3 },
      { id: "madeira-plateau", title: "Paul da Serra", instruction: "Level over the plateau and prepare for the long descent.", kind: "waypoint", latitude: 32.75, longitude: -17.04, radiusKilometers: 3.5 },
      { id: "madeira-funchal", title: "Funchal descent", instruction: "Descend toward Funchal without diving toward the runway.", kind: "waypoint", latitude: 32.65, longitude: -16.91, radiusKilometers: 3.3 },
      { id: "madeira-final", title: "Madeira final", instruction: "Turn east along the coast and stabilize for landing.", kind: "waypoint", latitude: 32.68, longitude: -16.81, radiusKilometers: 3.2 },
      { id: "madeira-touchdown", title: "Madeira touchdown", instruction: "Land at Madeira and slow below 45 knots.", kind: "landing", latitude: 32.688999, longitude: -16.7848, radiusKilometers: 4.2 },
    ],
    theme: "madeira",
  },
  {
    id: "big-sur-coastal-checkride",
    category: "Coastal",
    title: "Big Sur Coastal Checkride",
    description: "Fly a conservative out-and-back from Monterey, using the coastline and rising terrain as your guide.",
    distanceNauticalMiles: 34,
    originCode: "KMRY",
    originLabel: "Monterey Regional",
    destinationCode: "KMRY",
    destinationLabel: "Monterey Regional",
    localHour: 15,
    timeLabel: "15:00",
    objectives: [
      "Depart Monterey from runway 10R",
      "Track the coast southbound",
      "Reverse course before the terrain closes in",
      "Return, land, and stop at Monterey",
    ],
    legs: [
      { id: "bigsur-climb", title: "Monterey departure", instruction: "Climb through 150 ft AGL and turn toward Carmel.", kind: "takeoff" },
      { id: "bigsur-carmel", title: "Carmel coast", instruction: "Follow the shoreline south with generous terrain clearance.", kind: "waypoint", latitude: 36.555, longitude: -121.923, radiusKilometers: 3 },
      { id: "bigsur-bixby", title: "Bixby Bridge", instruction: "Continue down the coast without committing to a steep descent.", kind: "waypoint", latitude: 36.3714, longitude: -121.9018, radiusKilometers: 3.4 },
      { id: "bigsur-turnback", title: "Big Sur turnback", instruction: "Reverse course north before the terrain narrows your options.", kind: "waypoint", latitude: 36.2704, longitude: -121.808, radiusKilometers: 4 },
      { id: "bigsur-base", title: "Monterey base", instruction: "Descend gently toward Monterey and keep the airport in sight.", kind: "waypoint", latitude: 36.55, longitude: -121.88, radiusKilometers: 3.5 },
      { id: "bigsur-touchdown", title: "Monterey touchdown", instruction: "Land at Monterey and slow below 45 knots.", kind: "landing", latitude: 36.591202, longitude: -121.857002, radiusKilometers: 4.2 },
    ],
    theme: "bigsur",
  },
] as const;

const toRadians = (degrees: number): number => degrees * Math.PI / 180;

export const challengeDistanceKilometers = (
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number => {
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const firstLatitude = toRadians(latitudeA);
  const secondLatitude = toRadians(latitudeB);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

export const distanceToChallengeLeg = (leg: ChallengeLeg, telemetry: ChallengeTelemetry): number | null => {
  if (leg.latitude === undefined || leg.longitude === undefined) return null;
  return challengeDistanceKilometers(
    telemetry.latitudeDegrees,
    telemetry.longitudeDegrees,
    leg.latitude,
    leg.longitude,
  );
};

export const isChallengeLegComplete = (leg: ChallengeLeg, telemetry: ChallengeTelemetry): boolean => {
  if (telemetry.crashed) return false;
  if (leg.kind === "takeoff") return !telemetry.grounded && telemetry.altitudeAglMeters >= 45;
  const distance = distanceToChallengeLeg(leg, telemetry);
  if (distance === null || distance > (leg.radiusKilometers ?? 3)) return false;
  if (leg.kind === "landing") return telemetry.grounded && telemetry.airspeedMetersPerSecond <= 23.2;
  return !telemetry.grounded;
};

export const challengeSpawnRequest = (challenge: FlightChallenge): SpawnRequest => {
  const airport = findAirport(challenge.originCode);
  if (!airport) throw new Error(`Challenge airport ${challenge.originCode} is unavailable.`);
  const spawn = spawnFromAirport(airport, "runway");
  return {
    ...spawn,
    headingDegrees: challenge.runwayHeadingDegrees ?? spawn.headingDegrees,
    airborneAltitudeMeters: undefined,
  };
};
