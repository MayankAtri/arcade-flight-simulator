import { describe, expect, it } from "vitest";
import { findAirport, searchAirports } from "./AirportService";

describe("global airport search", () => {
  it("finds airports by IATA, ICAO, name, and municipality", () => {
    expect(searchAirports("JFK", 1)[0]?.ident).toBe("KJFK");
    expect(searchAirports("EGLL", 1)[0]?.iata).toBe("LHR");
    expect(searchAirports("Heathrow", 1)[0]?.ident).toBe("EGLL");
    expect(searchAirports("Sydney", 5).some((airport) => airport.ident === "YSSY")).toBe(true);
  });

  it("prioritizes exact codes and suitable paved runways", () => {
    const result = searchAirports("DXB", 1)[0];
    expect(result?.ident).toBe("OMDB");
    expect(result?.paved).toBe(true);
    expect(result?.lengthFeet).toBeGreaterThan(10_000);
    expect(searchAirports("JFK", 1)[0]?.lengthFeet).toBeGreaterThan(14_000);
  });

  it("supports representative airports across continents", () => {
    for (const code of ["OMDB", "KJFK", "EGLL", "YSSY", "FAOR", "RJTT"]) {
      expect(findAirport(code), code).toBeDefined();
    }
  });
});
