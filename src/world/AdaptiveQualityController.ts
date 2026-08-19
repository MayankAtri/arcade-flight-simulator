import type { WorldQuality } from "./types";

const LOWER_FPS = 30;
const UPPER_FPS = 52;
const DOWNGRADE_SECONDS = 4;
const UPGRADE_SECONDS = 10;
const CHANGE_COOLDOWN_SECONDS = 8;

const QUALITY_RANK: Record<WorldQuality, number> = { low: 0, medium: 1, high: 2 };

const LOWER_QUALITY: Record<WorldQuality, WorldQuality> = {
  high: "medium",
  medium: "low",
  low: "low",
};

const HIGHER_QUALITY: Record<WorldQuality, WorldQuality> = {
  high: "high",
  medium: "high",
  low: "medium",
};

export class AdaptiveQualityController {
  private lowFpsSeconds = 0;
  private highFpsSeconds = 0;
  private cooldownSeconds = 0;

  constructor(
    private quality: WorldQuality = "medium",
    private readonly maximumAutomaticQuality: WorldQuality = "high",
  ) {}

  current(): WorldQuality {
    return this.quality;
  }

  reset(quality: WorldQuality): void {
    this.quality = quality;
    this.lowFpsSeconds = 0;
    this.highFpsSeconds = 0;
    this.cooldownSeconds = 0;
  }

  observe(fps: number, elapsedSeconds: number): WorldQuality | null {
    if (!Number.isFinite(fps) || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return null;
    if (this.cooldownSeconds > 0) {
      this.cooldownSeconds = Math.max(0, this.cooldownSeconds - elapsedSeconds);
      this.lowFpsSeconds = 0;
      this.highFpsSeconds = 0;
      return null;
    }

    if (fps < LOWER_FPS) {
      this.lowFpsSeconds += elapsedSeconds;
      this.highFpsSeconds = 0;
    } else if (fps > UPPER_FPS) {
      this.highFpsSeconds += elapsedSeconds;
      this.lowFpsSeconds = 0;
    } else {
      this.lowFpsSeconds = 0;
      this.highFpsSeconds = 0;
    }

    if (this.lowFpsSeconds >= DOWNGRADE_SECONDS) {
      const next = LOWER_QUALITY[this.quality];
      this.lowFpsSeconds = 0;
      if (next !== this.quality) return this.changeTo(next);
    }

    if (this.highFpsSeconds >= UPGRADE_SECONDS) {
      const candidate = HIGHER_QUALITY[this.quality];
      const next = QUALITY_RANK[candidate] > QUALITY_RANK[this.maximumAutomaticQuality]
        ? this.maximumAutomaticQuality
        : candidate;
      this.highFpsSeconds = 0;
      if (next !== this.quality) return this.changeTo(next);
    }

    return null;
  }

  private changeTo(next: WorldQuality): WorldQuality {
    this.quality = next;
    this.lowFpsSeconds = 0;
    this.highFpsSeconds = 0;
    this.cooldownSeconds = CHANGE_COOLDOWN_SECONDS;
    return next;
  }
}
