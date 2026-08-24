import { CircleCheck, Flag, Medal, RotateCcw, Route, Trophy, X } from "lucide-react";
import { formatRunTime, medalForTime } from "../ring-runs/progress";
import type { RingCourse, RingRunSnapshot } from "../ring-runs/types";

type RingRunTrackerProps = {
  course: RingCourse;
  snapshot: RingRunSnapshot;
  bestTimeSeconds?: number;
  newPersonalBest: boolean;
  onRestart: () => void;
  onExit: () => void;
};

export function RingRunTracker({
  course,
  snapshot,
  bestTimeSeconds,
  newPersonalBest,
  onRestart,
  onExit,
}: RingRunTrackerProps) {
  const currentGate = course.gates[Math.min(snapshot.activeGateIndex, course.gates.length - 1)];
  const completedGates = snapshot.phase === "complete" ? snapshot.totalGates : snapshot.activeGateIndex;
  const predictedTime = completedGates > 0 ? snapshot.elapsedSeconds / (completedGates / snapshot.totalGates) : 0;
  const paceMedal = predictedTime > 0 ? medalForTime(course, predictedTime) : "gold";
  const resultMedal = snapshot.phase === "complete" ? medalForTime(course, snapshot.elapsedSeconds) : null;
  const targetAltitudeFeet = Math.round(currentGate.altitudeAglMeters * 3.28084);
  const distance = snapshot.distanceToActiveGateMeters < 1_000
    ? `${Math.round(snapshot.distanceToActiveGateMeters)} m`
    : `${(snapshot.distanceToActiveGateMeters / 1_000).toFixed(1)} km`;

  return (
    <>
      <aside className="ring-run-timer" aria-label={`Ring ${Math.min(snapshot.activeGateIndex + 1, snapshot.totalGates)} of ${snapshot.totalGates}`}>
        <strong>{formatRunTime(snapshot.elapsedSeconds)}</strong>
        <span>Ring {Math.min(snapshot.activeGateIndex + 1, snapshot.totalGates)} / {snapshot.totalGates}</span>
      </aside>

      {snapshot.phase === "countdown" && (
        <div className="ring-run-countdown" role="status" aria-live="assertive">
          <span>Ring Run</span>
          <strong>{Math.max(1, Math.ceil(snapshot.countdownSeconds))}</strong>
          <small>{course.title}</small>
        </div>
      )}

      <aside className="ring-run-control" aria-label="Ring Run guidance">
        <header><div><Route size={13} aria-hidden="true" /><span>Race control</span></div><button type="button" onClick={onExit} aria-label="Exit Ring Run"><X size={15} aria-hidden="true" /></button></header>
        <div className="ring-run-control__course"><strong>{course.title}</strong><small>{course.location}</small></div>
        {snapshot.phase === "racing" || snapshot.phase === "countdown" ? (
          <>
            <div className="ring-run-control__grid">
              <div><span>Clearance</span><strong>Gate {snapshot.activeGateIndex + 1} / {distance}</strong></div>
              <div><span>Pace</span><strong>{paceMedal ? `${paceMedal} target` : "Finish clean"}</strong></div>
              <div><span>Target</span><strong>{currentGate.label}</strong></div>
              <div><span>Altitude</span><strong>{targetAltitudeFeet.toLocaleString()} ft AGL</strong></div>
            </div>
            <footer><button type="button" onClick={onRestart}><RotateCcw size={13} aria-hidden="true" /> Restart run</button><span>{bestTimeSeconds === undefined ? "No personal best" : `PB ${formatRunTime(bestTimeSeconds)}`}</span></footer>
          </>
        ) : (
          <div className={`ring-run-result ring-run-result--${snapshot.phase}`}>
            {snapshot.phase === "complete" ? <CircleCheck size={30} aria-hidden="true" /> : <Flag size={28} aria-hidden="true" />}
            <div>
              <span>{snapshot.phase === "complete" ? "Course complete" : "Run interrupted"}</span>
              <strong>{snapshot.phase === "complete" ? formatRunTime(snapshot.elapsedSeconds) : "Aircraft crashed"}</strong>
              <small>{snapshot.phase === "complete" ? (resultMedal ? `${resultMedal} medal${newPersonalBest ? " · new personal best" : ""}` : (newPersonalBest ? "New personal best" : "Clean finish")) : "Restart from the course spawn and try again."}</small>
            </div>
            {resultMedal ? <Medal className={`ring-run-result__medal is-${resultMedal}`} aria-label={`${resultMedal} medal`} /> : snapshot.phase === "complete" ? <Trophy className="ring-run-result__medal" aria-hidden="true" /> : null}
            <button type="button" onClick={onRestart}><RotateCcw size={14} aria-hidden="true" /> Retry course</button>
            <button type="button" onClick={onExit}>Course selection</button>
          </div>
        )}
      </aside>
    </>
  );
}
