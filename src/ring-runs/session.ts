import type { Vec3 } from "../flight/math";
import { crossesRingGate, distanceToRingGate, type ResolvedRingGate } from "./geometry";
import type { RingCourse, RingRunSnapshot } from "./types";

const COUNTDOWN_SECONDS = 3;

export class RingRunSession {
  private phase: RingRunSnapshot["phase"] = "countdown";
  private activeGateIndex = 0;
  private countdownSeconds = COUNTDOWN_SECONDS;
  private elapsedSeconds = 0;
  private lastGateSplitSeconds: number | null = null;
  private distanceToActiveGateMeters = 0;

  constructor(
    readonly course: RingCourse,
    readonly gates: readonly ResolvedRingGate[],
    initialPositionECEF: Vec3,
  ) {
    this.distanceToActiveGateMeters = gates[0] ? distanceToRingGate(initialPositionECEF, gates[0]) : 0;
  }

  step(
    previousPositionECEF: Vec3,
    currentPositionECEF: Vec3,
    deltaSeconds: number,
    crashed: boolean,
  ): void {
    if (this.phase === "complete" || this.phase === "failed") return;
    if (crashed) {
      this.phase = "failed";
      return;
    }
    if (this.phase === "countdown") {
      this.countdownSeconds = Math.max(0, this.countdownSeconds - deltaSeconds);
      if (this.countdownSeconds <= 0) this.phase = "racing";
      this.updateDistance(currentPositionECEF);
      return;
    }

    this.elapsedSeconds += deltaSeconds;
    const activeGate = this.gates[this.activeGateIndex];
    if (activeGate && crossesRingGate(previousPositionECEF, currentPositionECEF, activeGate)) {
      this.lastGateSplitSeconds = this.elapsedSeconds;
      if (this.activeGateIndex >= this.gates.length - 1) {
        this.phase = "complete";
        this.distanceToActiveGateMeters = 0;
        return;
      }
      this.activeGateIndex += 1;
    }
    this.updateDistance(currentPositionECEF);
  }

  restart(initialPositionECEF: Vec3): void {
    this.phase = "countdown";
    this.activeGateIndex = 0;
    this.countdownSeconds = COUNTDOWN_SECONDS;
    this.elapsedSeconds = 0;
    this.lastGateSplitSeconds = null;
    this.updateDistance(initialPositionECEF);
  }

  snapshot(): RingRunSnapshot {
    return {
      courseId: this.course.id,
      phase: this.phase,
      activeGateIndex: this.activeGateIndex,
      totalGates: this.gates.length,
      countdownSeconds: this.countdownSeconds,
      elapsedSeconds: this.elapsedSeconds,
      distanceToActiveGateMeters: this.distanceToActiveGateMeters,
      lastGateSplitSeconds: this.lastGateSplitSeconds,
    };
  }

  private updateDistance(positionECEF: Vec3): void {
    const activeGate = this.gates[this.activeGateIndex];
    this.distanceToActiveGateMeters = activeGate ? distanceToRingGate(positionECEF, activeGate) : 0;
  }
}
