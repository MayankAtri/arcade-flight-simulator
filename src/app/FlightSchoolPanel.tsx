import { Check, Clock3, Gauge, GraduationCap, Keyboard, Play, RotateCcw, SlidersHorizontal } from "lucide-react";
import { FLIGHT_LESSONS } from "../flight-school/lessons";
import type { FlightSchoolProgress } from "../flight-school/progress";
import type { FlightLesson } from "../flight-school/types";
import { mobileControlLabel } from "./MobileFlightControls";

type FlightSchoolPanelProps = {
  selectedLesson: FlightLesson;
  progress: FlightSchoolProgress;
  busy: boolean;
  touchControls: boolean;
  onSelect: (lesson: FlightLesson) => void;
  onStart: (lesson: FlightLesson) => void;
};

export function FlightSchoolPanel({
  selectedLesson,
  progress,
  busy,
  touchControls,
  onSelect,
  onStart,
}: FlightSchoolPanelProps) {
  const completed = new Set(progress.completedLessonIds);
  const completedCount = FLIGHT_LESSONS.filter((lesson) => completed.has(lesson.id)).length;
  const nextLesson = FLIGHT_LESSONS.find((lesson) => !completed.has(lesson.id));

  return (
    <div className="flight-school-page">
      <header className="flight-school-hero">
        <div>
          <span className="flight-school-kicker"><GraduationCap size={16} aria-hidden="true" /> Cessna 172SP training</span>
          <h2>Learn to fly.<br />One skill at a time.</h2>
          <p>Five guided lessons use the simulator’s current {touchControls ? "touch controls" : "keyboard controls"} and flight model, from first takeoff to a complete landing.</p>
        </div>
        <div className="flight-school-progress" aria-label={`${completedCount} of ${FLIGHT_LESSONS.length} lessons complete`}>
          <strong>{completedCount}<span> / {FLIGHT_LESSONS.length}</span></strong>
          <small>Lessons complete</small>
          <div aria-hidden="true"><span style={{ width: `${completedCount / FLIGHT_LESSONS.length * 100}%` }} /></div>
          {nextLesson ? <p>Next: {nextLesson.title}</p> : <p>Flight School complete</p>}
        </div>
      </header>

      <div className="flight-school-layout">
        <main className="lesson-library" aria-label="Flight School lessons">
          <header><span>Course syllabus</span><small>Select a lesson to review its briefing.</small></header>
          <div className="lesson-list">
            {FLIGHT_LESSONS.map((lesson) => {
              const isComplete = completed.has(lesson.id);
              const selected = selectedLesson.id === lesson.id;
              return (
                <button
                  type="button"
                  key={lesson.id}
                  className={`lesson-row${selected ? " is-selected" : ""}${isComplete ? " is-complete" : ""}`}
                  aria-pressed={selected}
                  onClick={() => onSelect(lesson)}
                >
                  <span className="lesson-row__number">{lesson.number.toString().padStart(2, "0")}</span>
                  <span className="lesson-row__copy"><strong>{lesson.title}</strong><small>{lesson.summary}</small></span>
                  <span className="lesson-row__meta"><small>{lesson.difficulty}</small><small>{lesson.estimatedMinutes} min</small></span>
                  <span className="lesson-row__status">{isComplete ? <><Check size={15} aria-hidden="true" /> Complete</> : "Not completed"}</span>
                </button>
              );
            })}
          </div>
        </main>

        <aside className="lesson-briefing" aria-label={`${selectedLesson.title} briefing`}>
          <header>
            <span>Lesson {selectedLesson.number.toString().padStart(2, "0")}</span>
            {completed.has(selectedLesson.id) && <small><Check size={13} aria-hidden="true" /> Completed</small>}
            <h3>{selectedLesson.title}</h3>
            <p>{selectedLesson.summary}</p>
          </header>

          <dl className="lesson-facts">
            <div><dt><Gauge size={14} aria-hidden="true" /> Difficulty</dt><dd>{selectedLesson.difficulty}</dd></div>
            <div><dt><Clock3 size={14} aria-hidden="true" /> Duration</dt><dd>About {selectedLesson.estimatedMinutes} minutes</dd></div>
          </dl>

          <section className="lesson-briefing__section">
            <h4>Objectives</h4>
            <ol>
              {selectedLesson.objectives.map((objective, index) => (
                <li key={objective}><span>{(index + 1).toString().padStart(2, "0")}</span>{objective}</li>
              ))}
            </ol>
          </section>

          <section className="lesson-briefing__section">
            <h4>{touchControls ? <SlidersHorizontal size={14} aria-hidden="true" /> : <Keyboard size={14} aria-hidden="true" />} Controls used</h4>
            <div className="lesson-control-list">
              {selectedLesson.controls.map((control) => <kbd key={control}>{touchControls ? mobileControlLabel(control) : control}</kbd>)}
            </div>
          </section>

          <button type="button" className="lesson-start" disabled={busy} onClick={() => onStart(selectedLesson)}>
            {completed.has(selectedLesson.id) ? <RotateCcw size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
            {completed.has(selectedLesson.id) ? "Replay lesson" : "Start lesson"}
          </button>
        </aside>
      </div>
    </div>
  );
}
