import airportsJson from "../data/airports.json";
import type { Airport } from "../data/types";

const airports = airportsJson as Airport[];

const normalize = (value: string): string => value.trim().toLocaleLowerCase();

export const searchAirports = (query: string, limit = 12): Airport[] => {
  const term = normalize(query);
  if (!term) return airports.slice(0, limit);
  return airports
    .map((airport) => {
      const ident = normalize(airport.ident);
      const iata = normalize(airport.iata);
      const name = normalize(airport.name);
      const municipality = normalize(airport.municipality);
      let score = 99;
      if (ident === term || iata === term) score = 0;
      else if (ident.startsWith(term) || iata.startsWith(term)) score = 1;
      else if (name.startsWith(term) || municipality.startsWith(term)) score = 2;
      else if (name.includes(term) || municipality.includes(term)) score = 3;
      return { airport, score };
    })
    .filter(({ score }) => score < 99)
    .sort((a, b) => a.score - b.score || Number(b.airport.paved) - Number(a.airport.paved) || b.airport.lengthFeet - a.airport.lengthFeet)
    .slice(0, limit)
    .map(({ airport }) => airport);
};

export const findAirport = (code: string): Airport | undefined => {
  const term = normalize(code);
  return airports.find((airport) => normalize(airport.ident) === term || normalize(airport.iata) === term);
};
