export type WorldMode = "cesium" | "photorealistic";

// CesiumJS ships an evaluation ion token for local development. The basic
// world is reserved for an actual ion/network failure, not a missing user token.
export const resolveWorldMode = (_cesiumIonToken: string): WorldMode => "cesium";

export const usesEvaluationToken = (cesiumIonToken: string): boolean => cesiumIonToken.trim().length === 0;

const evaluationEnabled = import.meta.env.VITE_ENABLE_PHOTOREALISTIC_EVALUATION === "true";

export const resolveRequestedWorldMode = (search: string, enabled = evaluationEnabled): WorldMode => {
  const requested = new URLSearchParams(search).get("world")?.toLocaleLowerCase();
  return enabled && requested === "photorealistic" ? "photorealistic" : "cesium";
};
