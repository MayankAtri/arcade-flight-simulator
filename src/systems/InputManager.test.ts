import { describe, expect, it } from "vitest";
import type { TouchFlightControls } from "../flight/types";
import {
  flightControlsFromPressed,
  mergeFlightControls,
  releaseTouchMomentaryControls,
  updateTouchControls,
} from "./InputManager";

const TOUCH: TouchFlightControls = {
  pitch: -0.4,
  roll: 0.6,
  yaw: -0.25,
  throttleTarget: 0.72,
  brake: true,
};

describe("flight keyboard controls", () => {
  it("uses W for nose down and S for pull up", () => {
    expect(flightControlsFromPressed(new Set(["KeyW"])).pitch).toBe(-1);
    expect(flightControlsFromPressed(new Set(["KeyS"])).pitch).toBe(1);
    expect(flightControlsFromPressed(new Set(["KeyW", "KeyS"])).pitch).toBe(0);
  });

  it("maps arrow keys to pitch and roll without doubling combined inputs", () => {
    expect(flightControlsFromPressed(new Set(["ArrowUp"])).pitch).toBe(-1);
    expect(flightControlsFromPressed(new Set(["ArrowDown"])).pitch).toBe(1);
    expect(flightControlsFromPressed(new Set(["ArrowLeft"])).roll).toBe(-1);
    expect(flightControlsFromPressed(new Set(["ArrowRight"])).roll).toBe(1);
    expect(flightControlsFromPressed(new Set(["KeyS", "ArrowDown"])).pitch).toBe(1);
  });

  it("uses Q and E for roll and A and D for yaw", () => {
    expect(flightControlsFromPressed(new Set(["KeyQ"])).roll).toBe(-1);
    expect(flightControlsFromPressed(new Set(["KeyE"])).roll).toBe(1);
    expect(flightControlsFromPressed(new Set(["KeyA"])).yaw).toBe(-1);
    expect(flightControlsFromPressed(new Set(["KeyD"])).yaw).toBe(1);
  });

  it("cancels opposing inputs and keeps simultaneous axes independent", () => {
    const controls = flightControlsFromPressed(new Set([
      "KeyW",
      "KeyS",
      "KeyQ",
      "KeyE",
      "KeyA",
      "KeyD",
      "ShiftLeft",
      "ControlLeft",
      "KeyB",
    ]));

    expect(controls.pitch).toBe(0);
    expect(controls.roll).toBe(0);
    expect(controls.yaw).toBe(0);
    expect(controls.throttleUp).toBe(true);
    expect(controls.throttleDown).toBe(true);
    expect(controls.brake).toBe(true);
  });

  it("uses touch axes unless a keyboard axis is active", () => {
    const keyboard = flightControlsFromPressed(new Set(["KeyS", "KeyA"]));
    const controls = mergeFlightControls(keyboard, TOUCH);

    expect(controls.pitch).toBe(1);
    expect(controls.roll).toBe(0.6);
    expect(controls.yaw).toBe(-1);
    expect(controls.brake).toBe(true);
    expect(controls.throttleTarget).toBe(0.72);
  });

  it("lets throttle keys temporarily override the sticky touch target", () => {
    const keyboard = flightControlsFromPressed(new Set(["ShiftLeft"]));
    const controls = mergeFlightControls(keyboard, TOUCH);

    expect(controls.throttleUp).toBe(true);
    expect(controls.throttleTarget).toBeNull();
  });

  it("clamps touch values and preserves a sticky throttle when momentary controls release", () => {
    const updated = updateTouchControls(TOUCH, {
      pitch: Number.NaN,
      roll: 3,
      yaw: -2,
      throttleTarget: 1.4,
      brake: true,
    });
    expect(updated).toEqual({ pitch: 0, roll: 1, yaw: -1, throttleTarget: 1, brake: true });

    expect(releaseTouchMomentaryControls(updated)).toEqual({
      pitch: 0,
      roll: 0,
      yaw: 0,
      throttleTarget: 1,
      brake: false,
    });
  });
});
