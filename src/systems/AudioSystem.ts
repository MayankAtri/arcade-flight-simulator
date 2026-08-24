import { clamp } from "../flight/math";
import type { FlightTelemetry } from "../flight/types";

type AudioFlightState = Pick<FlightTelemetry, "airspeedMetersPerSecond" | "throttle" | "grounded" | "crashed" | "landingStatus">;

export type FlightAudioMix = {
  engineFrequency: number;
  engineGain: number;
  windGain: number;
  groundGain: number;
  masterGain: number;
};

export const flightAudioMix = (
  telemetry: AudioFlightState,
  paused: boolean,
  flightActive: boolean,
): FlightAudioMix => {
  const speed = clamp(telemetry.airspeedMetersPerSecond, 0, 95);
  const running = telemetry.crashed || !flightActive ? 0 : 1;
  return {
    engineFrequency: 38 + telemetry.throttle * 74 + speed * 0.12,
    engineGain: running * (0.055 + telemetry.throttle * 0.085) * 0.92,
    windGain: running * Math.pow(speed / 95, 1.55) * 0.17,
    groundGain: running * Number(telemetry.grounded) * clamp(speed / 32, 0, 1) * 0.16,
    masterGain: flightActive ? (paused ? 0.16 : 0.72) : 0,
  };
};

export class AudioSystem {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineFundamental: OscillatorNode | null = null;
  private engineHarmonic: OscillatorNode | null = null;
  private engineFundamentalGain: GainNode | null = null;
  private engineHarmonicGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private groundGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = true;
  private flightActive = false;
  private previousGrounded = false;
  private previousCrashed = false;

  async unlock(): Promise<boolean> {
    if (!this.enabled) return false;
    if (!this.context) this.initialize();
    if (!this.context) return false;
    if (this.context.state === "suspended") await this.context.resume();
    return this.context.state === "running";
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    if (!enabled || !this.flightActive) this.master.gain.setTargetAtTime(0, now, 0.035);
    if (enabled && this.flightActive && this.context.state === "suspended") void this.context.resume();
  }

  setFlightActive(active: boolean): void {
    this.flightActive = active;
    if (!this.context || !this.master) return;
    if (!active) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0, now, 0.025);
    } else if (this.enabled && this.context.state === "suspended") {
      void this.context.resume();
    }
  }

  update(telemetry: FlightTelemetry, paused: boolean): void {
    if (!this.context || !this.master || !this.enabled) {
      this.previousGrounded = telemetry.grounded;
      this.previousCrashed = telemetry.crashed;
      return;
    }

    const now = this.context.currentTime;
    const mix = flightAudioMix(telemetry, paused, this.flightActive);
    this.setSmooth(this.master.gain, mix.masterGain, now, 0.08);
    this.setSmooth(this.engineFundamental?.frequency, mix.engineFrequency, now, 0.045);
    this.setSmooth(this.engineHarmonic?.frequency, mix.engineFrequency * 2.02, now, 0.045);
    this.setSmooth(this.engineFundamentalGain?.gain, mix.engineGain, now, 0.06);
    this.setSmooth(this.engineHarmonicGain?.gain, mix.engineGain * 0.31, now, 0.06);
    this.setSmooth(this.windGain?.gain, mix.windGain, now, 0.11);
    this.setSmooth(this.groundGain?.gain, mix.groundGain, now, 0.045);

    if (this.flightActive && !this.previousCrashed && telemetry.crashed) this.playImpact(1);
    else if (this.flightActive && !this.previousGrounded && telemetry.grounded) {
      const strength = telemetry.landingStatus === "severe" ? 0.78 : telemetry.landingStatus === "hard" ? 0.5 : 0.28;
      this.playImpact(strength);
    }
    this.previousGrounded = telemetry.grounded;
    this.previousCrashed = telemetry.crashed;
  }

  reset(telemetry: FlightTelemetry): void {
    this.previousGrounded = telemetry.grounded;
    this.previousCrashed = telemetry.crashed;
  }

  playCue(cue: "start" | "success" | "failure" | "complete"): void {
    if (!this.context || !this.master || !this.enabled || !this.flightActive) return;
    const context = this.context;
    const master = this.master;
    const now = context.currentTime;
    const notes = cue === "start"
      ? [440, 554, 659]
      : cue === "success"
        ? [659, 880]
        : cue === "complete"
          ? [523, 659, 784, 1047]
          : [220, 174];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startsAt = now + index * (cue === "complete" ? 0.1 : 0.12);
      const duration = cue === "failure" ? 0.18 : 0.11;
      oscillator.type = cue === "failure" ? "sawtooth" : "sine";
      oscillator.frequency.setValueAtTime(frequency, startsAt);
      gain.gain.setValueAtTime(0.0001, startsAt);
      gain.gain.exponentialRampToValueAtTime(cue === "failure" ? 0.08 : 0.055, startsAt + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
      oscillator.connect(gain).connect(master);
      oscillator.start(startsAt);
      oscillator.stop(startsAt + duration + 0.02);
    });
  }

  destroy(): void {
    const context = this.context;
    this.context = null;
    this.master = null;
    this.engineFundamental = null;
    this.engineHarmonic = null;
    this.engineFundamentalGain = null;
    this.engineHarmonicGain = null;
    this.windGain = null;
    this.groundGain = null;
    this.noiseBuffer = null;
    if (context && context.state !== "closed") void context.close();
  }

  private initialize(): void {
    if (!window.AudioContext) return;
    const context = new AudioContext({ latencyHint: "interactive" });
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 14;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.18;
    master.gain.value = 0;
    master.connect(compressor).connect(context.destination);

    const engineFilter = context.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 680;
    engineFilter.Q.value = 0.65;
    engineFilter.connect(master);

    const fundamental = context.createOscillator();
    const fundamentalGain = context.createGain();
    fundamental.type = "sawtooth";
    fundamental.frequency.value = 42;
    fundamentalGain.gain.value = 0;
    fundamental.connect(fundamentalGain).connect(engineFilter);
    fundamental.start();

    const harmonic = context.createOscillator();
    const harmonicGain = context.createGain();
    harmonic.type = "triangle";
    harmonic.frequency.value = 84;
    harmonicGain.gain.value = 0;
    harmonic.connect(harmonicGain).connect(engineFilter);
    harmonic.start();

    this.noiseBuffer = this.createNoiseBuffer(context, 2);
    const windSource = context.createBufferSource();
    const windFilter = context.createBiquadFilter();
    const windGain = context.createGain();
    windSource.buffer = this.noiseBuffer;
    windSource.loop = true;
    windFilter.type = "bandpass";
    windFilter.frequency.value = 1_150;
    windFilter.Q.value = 0.55;
    windGain.gain.value = 0;
    windSource.connect(windFilter).connect(windGain).connect(master);
    windSource.start();

    const groundSource = context.createBufferSource();
    const groundFilter = context.createBiquadFilter();
    const groundGain = context.createGain();
    groundSource.buffer = this.noiseBuffer;
    groundSource.loop = true;
    groundFilter.type = "lowpass";
    groundFilter.frequency.value = 145;
    groundFilter.Q.value = 1.4;
    groundGain.gain.value = 0;
    groundSource.connect(groundFilter).connect(groundGain).connect(master);
    groundSource.start();

    this.context = context;
    this.master = master;
    this.engineFundamental = fundamental;
    this.engineHarmonic = harmonic;
    this.engineFundamentalGain = fundamentalGain;
    this.engineHarmonicGain = harmonicGain;
    this.windGain = windGain;
    this.groundGain = groundGain;
  }

  private playImpact(strength: number): void {
    if (!this.context || !this.master || !this.noiseBuffer || !this.enabled) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(520 + strength * 420, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + 0.42);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.32 * strength, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
    source.stop(now + 0.5);
  }

  private createNoiseBuffer(context: AudioContext, durationSeconds: number): AudioBuffer {
    const buffer = context.createBuffer(1, context.sampleRate * durationSeconds, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.72 + white * 0.28;
      samples[index] = previous;
    }
    return buffer;
  }

  private setSmooth(parameter: AudioParam | undefined, value: number, now: number, timeConstant: number): void {
    if (!parameter || !Number.isFinite(value)) return;
    parameter.cancelScheduledValues(now);
    parameter.setTargetAtTime(value, now, timeConstant);
  }
}
