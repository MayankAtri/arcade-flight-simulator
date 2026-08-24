import { afterEach, describe, expect, it, vi } from "vitest";
import { findAirport } from "./AirportService";
import { parseSpawnUrl, parseWeatherPreset, updateSpawnUrl } from "./SpawnUrlService";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("validates weather presets and defaults missing or invalid values to Clear", () => {
    expect(parseWeatherPreset("?weather=scattered")).toBe("scattered");
    expect(parseWeatherPreset("?weather=cloudy")).toBe("cloudy");
    expect(parseWeatherPreset("?weather=storm")).toBe("clear");
    expect(parseWeatherPreset("")).toBe("clear");
  });

  it("writes the selected weather into share URLs", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("location", { pathname: "/", search: "" });
    vi.stubGlobal("history", { replaceState });
    const spawn = parseSpawnUrl("?lat=40.71273&lon=-74.00602&mode=air", findAirport)!;
    updateSpawnUrl(spawn, undefined, "cloudy");
    expect(replaceState).toHaveBeenCalledOnce();
    const url = replaceState.mock.calls[0][2] as string;
    expect(parseWeatherPreset(url.slice(url.indexOf("?")))).toBe("cloudy");
  });
});
