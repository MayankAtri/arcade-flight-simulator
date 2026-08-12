import { add, cross, dot, normalize, quatFromBasis, scale, type Quat, type Vec3 } from "./math";

export type GeodeticPosition = {
  latitude: number;
  longitude: number;
  height: number;
};

export type EnuBasis = {
  east: Vec3;
  north: Vec3;
  up: Vec3;
};

const WGS84_A = 6_378_137;
const WGS84_F = 1 / 298.257223563;
const WGS84_B = WGS84_A * (1 - WGS84_F);
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
const WGS84_EP2 = (WGS84_A ** 2 - WGS84_B ** 2) / WGS84_B ** 2;

export const degreesToRadians = (degrees: number): number => (degrees * Math.PI) / 180;
export const radiansToDegrees = (radians: number): number => (radians * 180) / Math.PI;

export const geodeticToEcef = (position: GeodeticPosition): Vec3 => {
  const sinLat = Math.sin(position.latitude);
  const cosLat = Math.cos(position.latitude);
  const sinLon = Math.sin(position.longitude);
  const cosLon = Math.cos(position.longitude);
  const primeVerticalRadius = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  return {
    x: (primeVerticalRadius + position.height) * cosLat * cosLon,
    y: (primeVerticalRadius + position.height) * cosLat * sinLon,
    z: (primeVerticalRadius * (1 - WGS84_E2) + position.height) * sinLat,
  };
};

export const ecefToGeodetic = (position: Vec3): GeodeticPosition => {
  const p = Math.hypot(position.x, position.y);
  if (p < 1e-6) {
    return {
      latitude: position.z >= 0 ? Math.PI / 2 : -Math.PI / 2,
      longitude: 0,
      height: Math.abs(position.z) - WGS84_B,
    };
  }
  const longitude = Math.atan2(position.y, position.x);
  const theta = Math.atan2(position.z * WGS84_A, p * WGS84_B);
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);
  const latitude = Math.atan2(
    position.z + WGS84_EP2 * WGS84_B * sinTheta ** 3,
    p - WGS84_E2 * WGS84_A * cosTheta ** 3,
  );
  const sinLat = Math.sin(latitude);
  const radius = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const height = p / Math.cos(latitude) - radius;
  return { latitude, longitude, height };
};

export const enuBasisAt = (position: GeodeticPosition): EnuBasis => {
  const sinLat = Math.sin(position.latitude);
  const cosLat = Math.cos(position.latitude);
  const sinLon = Math.sin(position.longitude);
  const cosLon = Math.cos(position.longitude);
  return {
    east: { x: -sinLon, y: cosLon, z: 0 },
    north: { x: -sinLat * cosLon, y: -sinLat * sinLon, z: cosLat },
    up: { x: cosLat * cosLon, y: cosLat * sinLon, z: sinLat },
  };
};

export const levelBodyOrientation = (position: GeodeticPosition, headingRadians: number): Quat => {
  const basis = enuBasisAt(position);
  const forward = normalize(add(scale(basis.north, Math.cos(headingRadians)), scale(basis.east, Math.sin(headingRadians))));
  const right = normalize(cross(scale(basis.up, -1), forward));
  const down = scale(basis.up, -1);
  return quatFromBasis(forward, right, down);
};

export const headingFromForward = (position: GeodeticPosition, forward: Vec3): number => {
  const basis = enuBasisAt(position);
  const heading = Math.atan2(dot(forward, basis.east), dot(forward, basis.north));
  return (radiansToDegrees(heading) + 360) % 360;
};

export const moveToHeight = (position: Vec3, targetHeight: number): Vec3 => {
  const geodetic = ecefToGeodetic(position);
  return geodeticToEcef({ ...geodetic, height: targetHeight });
};
