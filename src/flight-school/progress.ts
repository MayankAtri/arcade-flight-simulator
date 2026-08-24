import { FLIGHT_LESSONS } from "./lessons";

export const FLIGHT_SCHOOL_PROGRESS_KEY = "world-flight-sim.flight-school-progress";

const VALID_LESSON_IDS = new Set(FLIGHT_LESSONS.map((lesson) => lesson.id));

export type FlightSchoolProgress = {
  version: 1;
  completedLessonIds: string[];
};

export const EMPTY_FLIGHT_SCHOOL_PROGRESS: FlightSchoolProgress = {
  version: 1,
  completedLessonIds: [],
};

export const parseFlightSchoolProgress = (value: string | null): FlightSchoolProgress => {
  if (!value) return { ...EMPTY_FLIGHT_SCHOOL_PROGRESS };
  try {
    const parsed = JSON.parse(value) as Partial<FlightSchoolProgress>;
    if (parsed.version !== 1 || !Array.isArray(parsed.completedLessonIds)) {
      return { ...EMPTY_FLIGHT_SCHOOL_PROGRESS };
    }
    return {
      version: 1,
      completedLessonIds: [...new Set(parsed.completedLessonIds.filter((id): id is string => (
        typeof id === "string" && VALID_LESSON_IDS.has(id)
      )))],
    };
  } catch {
    return { ...EMPTY_FLIGHT_SCHOOL_PROGRESS };
  }
};

export const loadFlightSchoolProgress = (): FlightSchoolProgress => (
  typeof window === "undefined" ? { ...EMPTY_FLIGHT_SCHOOL_PROGRESS } : (() => {
    try {
      return parseFlightSchoolProgress(window.localStorage.getItem(FLIGHT_SCHOOL_PROGRESS_KEY));
    } catch {
      return { ...EMPTY_FLIGHT_SCHOOL_PROGRESS };
    }
  })()
);

export const saveFlightSchoolProgress = (progress: FlightSchoolProgress): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FLIGHT_SCHOOL_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Lesson completion remains valid for the current session when storage is unavailable.
  }
};

export const completeFlightLesson = (progress: FlightSchoolProgress, lessonId: string): FlightSchoolProgress => {
  if (!VALID_LESSON_IDS.has(lessonId) || progress.completedLessonIds.includes(lessonId)) return progress;
  return {
    version: 1,
    completedLessonIds: [...progress.completedLessonIds, lessonId],
  };
};

export const resetFlightSchoolProgress = (): FlightSchoolProgress => {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(FLIGHT_SCHOOL_PROGRESS_KEY);
    } catch {
      // Reset the in-memory state even when browser storage is unavailable.
    }
  }
  return { ...EMPTY_FLIGHT_SCHOOL_PROGRESS };
};
