import {
  degreesToRadians,
  enuBasisAt,
  geodeticToEcef,
  type GeodeticPosition,
} from "../flight/coordinates";
import {
  add,
  dot,
  magnitude,
  normalize,
  scale,
  subtract,
  type Vec3,
} from "../flight/math";
import type { RingGate } from "./types";

export type ResolvedRingGate = {
  gate: RingGate;
  groundElevationMeters: number;
  centerECEF: Vec3;
  normalECEF: Vec3;
  rightECEF: Vec3;
  verticalECEF: Vec3;
};

export const resolveRingGate = (gate: RingGate, groundElevationMeters: number): ResolvedRingGate => {
  const position: GeodeticPosition = {
    latitude: degreesToRadians(gate.latitudeDegrees),
    longitude: degreesToRadians(gate.longitudeDegrees),
    height: groundElevationMeters + gate.altitudeAglMeters,
  };
  const basis = enuBasisAt(position);
  const heading = degreesToRadians(gate.headingDegrees);
  const pathAngle = degreesToRadians(gate.flightPathAngleDegrees);
  const horizontal = normalize(add(
    scale(basis.north, Math.cos(heading)),
    scale(basis.east, Math.sin(heading)),
  ));
  const normalECEF = normalize(add(
    scale(horizontal, Math.cos(pathAngle)),
    scale(basis.up, Math.sin(pathAngle)),
  ));
  const rightECEF = normalize(add(
    scale(basis.east, Math.cos(heading)),
    scale(basis.north, -Math.sin(heading)),
  ));
  const verticalECEF = normalize(add(
    scale(basis.up, Math.cos(pathAngle)),
    scale(horizontal, -Math.sin(pathAngle)),
  ));
  return {
    gate,
    groundElevationMeters,
    centerECEF: geodeticToEcef(position),
    normalECEF,
    rightECEF,
    verticalECEF,
  };
};

export const ringGatePositions = (resolved: ResolvedRingGate, segments = 72): Vec3[] => {
  const positions: Vec3[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    positions.push(add(
      resolved.centerECEF,
      add(
        scale(resolved.rightECEF, Math.cos(angle) * resolved.gate.radiusMeters),
        scale(resolved.verticalECEF, Math.sin(angle) * resolved.gate.radiusMeters),
      ),
    ));
  }
  positions[segments] = { ...positions[0] };
  return positions;
};

export const distanceToRingGate = (positionECEF: Vec3, resolved: ResolvedRingGate): number => (
  magnitude(subtract(positionECEF, resolved.centerECEF))
);

export const crossesRingGate = (
  previousPositionECEF: Vec3,
  currentPositionECEF: Vec3,
  resolved: ResolvedRingGate,
): boolean => {
  const previousOffset = subtract(previousPositionECEF, resolved.centerECEF);
  const currentOffset = subtract(currentPositionECEF, resolved.centerECEF);
  const previousPlaneDistance = dot(previousOffset, resolved.normalECEF);
  const currentPlaneDistance = dot(currentOffset, resolved.normalECEF);
  const travelThroughPlane = currentPlaneDistance - previousPlaneDistance;
  if (previousPlaneDistance > 0 || currentPlaneDistance < 0 || travelThroughPlane <= 1e-6) return false;

  const intersectionFraction = -previousPlaneDistance / travelThroughPlane;
  if (intersectionFraction < 0 || intersectionFraction > 1) return false;
  const intersection = add(
    previousPositionECEF,
    scale(subtract(currentPositionECEF, previousPositionECEF), intersectionFraction),
  );
  const radialOffset = subtract(intersection, resolved.centerECEF);
  const radialDistance = Math.hypot(
    dot(radialOffset, resolved.rightECEF),
    dot(radialOffset, resolved.verticalECEF),
  );
  return radialDistance <= resolved.gate.radiusMeters;
};
