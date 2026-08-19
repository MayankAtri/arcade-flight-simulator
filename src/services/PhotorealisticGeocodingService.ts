import {
  Cartesian3,
  Cartographic,
  GeocodeType,
  IonGeocodeProviderType,
  IonGeocoderService,
  Rectangle,
  type Scene,
} from "cesium";
import { radiansToDegrees } from "../flight/coordinates";
import type { GeocodingResult } from "./GeocodingService";

export class PhotorealisticGeocodingService {
  private readonly geocoder: IonGeocoderService;

  constructor(scene: Scene, accessToken: string) {
    this.geocoder = new IonGeocoderService({
      scene,
      accessToken: accessToken || undefined,
      geocodeProviderType: IonGeocodeProviderType.GOOGLE,
    });
  }

  async search(query: string): Promise<GeocodingResult[]> {
    const normalized = query.trim();
    if (normalized.length < 2) return [];
    const results = await this.geocoder.geocode(normalized, GeocodeType.SEARCH);
    return results.slice(0, 6).flatMap((result, index) => {
      const destination = result.destination;
      const cartographic = destination instanceof Cartesian3
        ? Cartographic.fromCartesian(destination)
        : Rectangle.center(destination, new Cartographic());
      if (!cartographic) return [];
      const latitude = radiansToDegrees(cartographic.latitude);
      const longitude = radiansToDegrees(cartographic.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      return [{
        id: `google-${index}-${latitude.toFixed(5)}-${longitude.toFixed(5)}`,
        label: result.displayName,
        latitude,
        longitude,
      }];
    });
  }
}
