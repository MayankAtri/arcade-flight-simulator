export type Airport = {
  ident: string;
  iata: string;
  name: string;
  municipality: string;
  country: string;
  type: "large_airport" | "medium_airport" | "small_airport";
  latitude: number;
  longitude: number;
  elevationFeet: number;
  runway: string;
  heading: number;
  lengthFeet: number;
  surface: string;
  paved: boolean;
};
