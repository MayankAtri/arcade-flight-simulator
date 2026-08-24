import { RING_COURSES } from "./courses";
import type { RingCourse, RingRunMedal } from "./types";

export const RING_RUN_PROGRESS_KEY = "world-flight-sim.ring-run-progress";
const VALID_COURSE_IDS = new Set(RING_COURSES.map((course) => course.id));

export type RingRunProgress = {
  version: 1;
  bestTimesSeconds: Record<string, number>;
};

export const EMPTY_RING_RUN_PROGRESS: RingRunProgress = { version: 1, bestTimesSeconds: {} };

export const parseRingRunProgress = (value: string | null): RingRunProgress => {
  if (!value) return { version: 1, bestTimesSeconds: {} };
  try {
    const parsed = JSON.parse(value) as Partial<RingRunProgress>;
    if (parsed.version !== 1 || !parsed.bestTimesSeconds || typeof parsed.bestTimesSeconds !== "object") {
      return { version: 1, bestTimesSeconds: {} };
    }
    const bestTimesSeconds = Object.fromEntries(
      Object.entries(parsed.bestTimesSeconds).filter(([courseId, time]) => (
        VALID_COURSE_IDS.has(courseId) && typeof time === "number" && Number.isFinite(time) && time > 0
      )),
    );
    return { version: 1, bestTimesSeconds };
  } catch {
    return { version: 1, bestTimesSeconds: {} };
  }
};

export const loadRingRunProgress = (): RingRunProgress => {
  if (typeof window === "undefined") return { version: 1, bestTimesSeconds: {} };
  try {
    return parseRingRunProgress(window.localStorage.getItem(RING_RUN_PROGRESS_KEY));
  } catch {
    return { version: 1, bestTimesSeconds: {} };
  }
};

export const saveRingRunProgress = (progress: RingRunProgress): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RING_RUN_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // The completed result remains available for the current session.
  }
};

export const recordRingRunTime = (progress: RingRunProgress, courseId: string, seconds: number): RingRunProgress => {
  if (!VALID_COURSE_IDS.has(courseId) || !Number.isFinite(seconds) || seconds <= 0) return progress;
  const existing = progress.bestTimesSeconds[courseId];
  if (existing !== undefined && existing <= seconds) return progress;
  return {
    version: 1,
    bestTimesSeconds: { ...progress.bestTimesSeconds, [courseId]: seconds },
  };
};

export const resetRingRunProgress = (): RingRunProgress => {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(RING_RUN_PROGRESS_KEY);
    } catch {
      // Reset in-memory progress even when storage is unavailable.
    }
  }
  return { version: 1, bestTimesSeconds: {} };
};

export const medalForTime = (course: RingCourse, seconds: number): RingRunMedal | null => {
  if (seconds <= course.medalTimesSeconds.gold) return "gold";
  if (seconds <= course.medalTimesSeconds.silver) return "silver";
  if (seconds <= course.medalTimesSeconds.bronze) return "bronze";
  return null;
};

export const formatRunTime = (seconds: number): string => {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds - minutes * 60;
  return `${minutes}:${remainder.toFixed(1).padStart(4, "0")}`;
};
