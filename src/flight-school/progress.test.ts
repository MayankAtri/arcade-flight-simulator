import { describe, expect, it } from "vitest";
import { completeFlightLesson, EMPTY_FLIGHT_SCHOOL_PROGRESS, parseFlightSchoolProgress } from "./progress";
import { FLIGHT_LESSONS } from "./lessons";

describe("flight school progress", () => {
  it("falls back safely for invalid or outdated storage", () => {
    expect(parseFlightSchoolProgress("not-json")).toEqual(EMPTY_FLIGHT_SCHOOL_PROGRESS);
    expect(parseFlightSchoolProgress(JSON.stringify({ version: 2, completedLessonIds: ["first-flight"] })))
      .toEqual(EMPTY_FLIGHT_SCHOOL_PROGRESS);
  });

  it("stores unique lesson completions", () => {
    const first = completeFlightLesson(EMPTY_FLIGHT_SCHOOL_PROGRESS, "first-flight");
    const replay = completeFlightLesson(first, "first-flight");
    expect(replay.completedLessonIds).toEqual(["first-flight"]);
  });

  it("round-trips completion for the complete five-lesson syllabus", () => {
    const completed = FLIGHT_LESSONS.reduce(
      (progress, lesson) => completeFlightLesson(progress, lesson.id),
      EMPTY_FLIGHT_SCHOOL_PROGRESS,
    );
    expect(parseFlightSchoolProgress(JSON.stringify(completed)).completedLessonIds)
      .toEqual(FLIGHT_LESSONS.map((lesson) => lesson.id));
  });

  it("drops unknown stored lesson ids and ignores unknown completions", () => {
    expect(parseFlightSchoolProgress(JSON.stringify({
      version: 1,
      completedLessonIds: ["first-flight", "unknown-lesson", "first-flight"],
    })).completedLessonIds).toEqual(["first-flight"]);
    expect(completeFlightLesson(EMPTY_FLIGHT_SCHOOL_PROGRESS, "unknown-lesson"))
      .toBe(EMPTY_FLIGHT_SCHOOL_PROGRESS);
  });
});
