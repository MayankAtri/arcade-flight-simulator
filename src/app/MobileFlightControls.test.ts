import { describe, expect, it } from "vitest";
import {
  horizontalSliderValue,
  joystickAxesFromPoint,
  mobileControlLabel,
  mobileInstructionText,
  verticalThrottleValue,
} from "./MobileFlightControls";

const BOUNDS = { left: 100, top: 50, width: 200, height: 200 };

describe("mobile flight control geometry", () => {
  it("maps joystick up to nose down and right to positive roll", () => {
    const up = joystickAxesFromPoint(200, 50, BOUNDS);
    const right = joystickAxesFromPoint(300, 150, BOUNDS);
    expect(up.pitch).toBeCloseTo(-1, 6);
    expect(up.roll).toBeCloseTo(0, 6);
    expect(right.roll).toBeCloseTo(1, 6);
    expect(right.pitch).toBeCloseTo(0, 6);
  });

  it("applies the radial dead zone and clamps diagonal travel", () => {
    expect(joystickAxesFromPoint(204, 153, BOUNDS)).toEqual({ pitch: 0, roll: 0 });
    const diagonal = joystickAxesFromPoint(400, 350, BOUNDS);
    expect(Math.hypot(diagonal.pitch, diagonal.roll)).toBeCloseTo(1, 6);
  });

  it("maps yaw left/right and throttle bottom/top", () => {
    expect(horizontalSliderValue(100, BOUNDS)).toBe(-1);
    expect(horizontalSliderValue(200, BOUNDS)).toBe(0);
    expect(horizontalSliderValue(300, BOUNDS)).toBe(1);
    expect(verticalThrottleValue(50, BOUNDS)).toBe(1);
    expect(verticalThrottleValue(250, BOUNDS)).toBe(0);
  });

  it("translates keyboard-only lesson hints into touch control names", () => {
    expect(mobileControlLabel("Shift / Control")).toBe("Throttle slider");
    expect(mobileControlLabel("Q + A, then W / S")).toBe("Joystick left + yaw left, then adjust pitch");
    expect(mobileControlLabel("Hold B")).toBe("Hold Brake");
    expect(mobileControlLabel("F")).toBe("Flaps button");
    expect(mobileInstructionText("Hold B briefly to check the brakes.")).toBe("Hold Brake briefly to check the brakes.");
    expect(mobileInstructionText("Hold Shift until the throttle passes 90%.")).toBe("Move the throttle slider up until the throttle passes 90%.");
  });
});
