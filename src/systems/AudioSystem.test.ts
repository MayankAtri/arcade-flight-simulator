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
    const idle = flightAudioMix(flight, false, "chase", true);
    const fast = flightAudioMix({ ...flight, throttle: 1, airspeedMetersPerSecond: 80 }, false, "chase", true);
    expect(fast.engineFrequency).toBeGreaterThan(idle.engineFrequency + 70);
    expect(fast.engineGain).toBeGreaterThan(idle.engineGain);
    expect(fast.windGain).toBeGreaterThan(0.1);
  });

  it("adds ground rumble only while rolling on the ground", () => {
    const airborne = flightAudioMix({ ...flight, airspeedMetersPerSecond: 25 }, false, "chase", true);
    const rolling = flightAudioMix({ ...flight, airspeedMetersPerSecond: 25, grounded: true }, false, "chase", true);
    expect(airborne.groundGain).toBe(0);
    expect(rolling.groundGain).toBeGreaterThan(0.1);
  });

  it("cuts the engine after a crash and softens the paused mix", () => {
    const running = flightAudioMix({ ...flight, throttle: 1 }, false, "cockpit", true);
    const crashed = flightAudioMix({ ...flight, throttle: 1, crashed: true }, true, "cockpit", true);
    expect(running.engineGain).toBeGreaterThan(0);
    expect(crashed.engineGain).toBe(0);
    expect(crashed.masterGain).toBeLessThan(running.masterGain);
  });

  it("fully mutes every flight sound while the main menu is active", () => {
    const menu = flightAudioMix(
      { ...flight, throttle: 1, airspeedMetersPerSecond: 80, grounded: true },
      true,
      "chase",
      false,
    );
    expect(menu.engineGain).toBe(0);
    expect(menu.windGain).toBe(0);
    expect(menu.groundGain).toBe(0);
    expect(menu.masterGain).toBe(0);
  });
});
