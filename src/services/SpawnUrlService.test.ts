import { describe, expect, it } from "vitest";
import { findAirport } from "./AirportService";
import { parseSpawnUrl } from "./SpawnUrlService";

describe("shareable spawn URLs", () => {
  it("parses coordinate, mode, heading, altitude, and elevation parameters", () => {
    const spawn = parseSpawnUrl("?lat=-33.9461&lon=151.1772&elevation=6&heading=160&altitude=610&mode=air", findAirport);
    expect(spawn).toEqual({
      latitudeDegrees: -33.9461,
      longitudeDegrees: 151.1772,
      elevationMeters: 6,
      headingDegrees: 160,
      mode: "air",
      airborneAltitudeMeters: 610,
    });
  });

  it("parses an airport runway spawn and honors heading overrides", () => {
    const spawn = parseSpawnUrl("?airport=EGLL&mode=runway&heading=270", findAirport);
    expect(spawn?.mode).toBe("runway");
    expect(spawn?.headingDegrees).toBe(270);
    expect(spawn?.latitudeDegrees).toBeCloseTo(findAirport("EGLL")!.latitude, 8);
  });

  it("keeps the default airborne altitude when the URL omits it", () => {
    const spawn = parseSpawnUrl("?airport=KJFK&mode=air", findAirport);
    expect(spawn?.airborneAltitudeMeters).toBe(304.8);
  });

  it("rejects invalid coordinates and unknown airports", () => {
    expect(parseSpawnUrl("", findAirport)).toBeNull();
    expect(parseSpawnUrl("?lat=120&lon=0", findAirport)).toBeNull();
    expect(parseSpawnUrl("?airport=NOPE", findAirport)).toBeNull();
  });
});
