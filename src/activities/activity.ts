export type ActivitySession =
  | { mode: "free-flight"; phase: "idle" }
  | { mode: "challenge" | "lesson" | "ring-run"; activityId: string; phase: "active" | "paused" | "complete" | "failed" };

export const FREE_FLIGHT_ACTIVITY: ActivitySession = { mode: "free-flight", phase: "idle" };

export const startActivity = (
  mode: Exclude<ActivitySession["mode"], "free-flight">,
  activityId: string,
): ActivitySession => ({ mode, activityId, phase: "active" });

export const setActivityPhase = (
  activity: ActivitySession,
  phase: "active" | "paused" | "complete" | "failed",
): ActivitySession => activity.mode === "free-flight" ? activity : { ...activity, phase };

export const exitActivity = (): ActivitySession => FREE_FLIGHT_ACTIVITY;
