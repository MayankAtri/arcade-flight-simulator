export type GeographicPointDegrees = {
  latitudeDegrees: number;
  longitudeDegrees: number;
};

export const DISTANT_TRANSITION_METERS = 500_000;

const EARTH_MEAN_RADIUS_METERS = 6_371_008.8;

export function greatCircleDistanceMeters(
  from: GeographicPointDegrees,
  to: GeographicPointDegrees,
): number {
  const toRadians = Math.PI / 180;
  const latitudeDelta = (to.latitudeDegrees - from.latitudeDegrees) * toRadians;
  const longitudeDelta = (to.longitudeDegrees - from.longitudeDegrees) * toRadians;
  const fromLatitude = from.latitudeDegrees * toRadians;
  const toLatitude = to.latitudeDegrees * toRadians;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_MEAN_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function shouldReleaseWorldResources(
  from: GeographicPointDegrees,
  to: GeographicPointDegrees,
): boolean {
  return greatCircleDistanceMeters(from, to) >= DISTANT_TRANSITION_METERS;
}
