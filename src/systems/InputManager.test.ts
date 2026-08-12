import { describe, expect, it } from "vitest";
import { flightControlsFromPressed } from "./InputManager";

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
});
