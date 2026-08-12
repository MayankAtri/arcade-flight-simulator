import { describe, expect, it } from "vitest";
import { flightAudioMix } from "./AudioSystem";

const flight = {
  airspeedMetersPerSecond: 0,
  throttle: 0,
  grounded: false,
  crashed: false,
  landingStatus: "" as const,
};

describe("flight audio mix", () => {
  it("raises engine pitch and wind with throttle and airspeed", () => {
    const idle = flightAudioMix(flight, false, "chase");
    const fast = flightAudioMix({ ...flight, throttle: 1, airspeedMetersPerSecond: 80 }, false, "chase");
    expect(fast.engineFrequency).toBeGreaterThan(idle.engineFrequency + 70);
    expect(fast.engineGain).toBeGreaterThan(idle.engineGain);
    expect(fast.windGain).toBeGreaterThan(0.1);
  });

  it("adds ground rumble only while rolling on the ground", () => {
    const airborne = flightAudioMix({ ...flight, airspeedMetersPerSecond: 25 }, false, "chase");
    const rolling = flightAudioMix({ ...flight, airspeedMetersPerSecond: 25, grounded: true }, false, "chase");
    expect(airborne.groundGain).toBe(0);
    expect(rolling.groundGain).toBeGreaterThan(0.1);
  });

  it("cuts the engine after a crash and softens the paused mix", () => {
    const running = flightAudioMix({ ...flight, throttle: 1 }, false, "cockpit");
    const crashed = flightAudioMix({ ...flight, throttle: 1, crashed: true }, true, "cockpit");
    expect(running.engineGain).toBeGreaterThan(0);
    expect(crashed.engineGain).toBe(0);
    expect(crashed.masterGain).toBeLessThan(running.masterGain);
  });
});
