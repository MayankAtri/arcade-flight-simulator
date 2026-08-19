const METERS_TO_FEET = 3.28084;

export const formatNonNegativeFeet = (meters: number): number => {
  if (!Number.isFinite(meters)) return 0;
  return Math.max(0, Math.round(meters * METERS_TO_FEET));
};
