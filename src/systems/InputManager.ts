import type { FlightControls, TouchFlightControls } from "../flight/types";

type Action = "camera" | "flaps" | "respawn" | "pause" | "menu";

export const EMPTY_TOUCH_CONTROLS: TouchFlightControls = {
  pitch: 0,
  roll: 0,
  yaw: 0,
  throttleTarget: null,
  brake: false,
};

const clampAxis = (value: number): number => Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
const clampThrottle = (value: number | null): number | null => (
  value === null ? null : Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
);

export const updateTouchControls = (
  current: TouchFlightControls,
  next: Partial<TouchFlightControls>,
): TouchFlightControls => ({
  pitch: next.pitch === undefined ? current.pitch : clampAxis(next.pitch),
  roll: next.roll === undefined ? current.roll : clampAxis(next.roll),
  yaw: next.yaw === undefined ? current.yaw : clampAxis(next.yaw),
  throttleTarget: next.throttleTarget === undefined
    ? current.throttleTarget
    : clampThrottle(next.throttleTarget),
  brake: next.brake ?? current.brake,
});

export const releaseTouchMomentaryControls = (current: TouchFlightControls): TouchFlightControls => ({
  ...current,
  pitch: 0,
  roll: 0,
  yaw: 0,
  brake: false,
});

export const flightControlsFromPressed = (pressed: ReadonlySet<string>): FlightControls => ({
  pitch:
    Math.max(Number(pressed.has("KeyS")), Number(pressed.has("ArrowDown"))) -
    Math.max(Number(pressed.has("KeyW")), Number(pressed.has("ArrowUp"))),
  roll:
    Math.max(Number(pressed.has("KeyE")), Number(pressed.has("ArrowRight"))) -
    Math.max(Number(pressed.has("KeyQ")), Number(pressed.has("ArrowLeft"))),
  yaw: Number(pressed.has("KeyD")) - Number(pressed.has("KeyA")),
  throttleUp: pressed.has("Shift") || pressed.has("ShiftLeft") || pressed.has("ShiftRight"),
  throttleDown: pressed.has("Control") || pressed.has("ControlLeft") || pressed.has("ControlRight"),
  brake: pressed.has("KeyB"),
});

export const mergeFlightControls = (
  keyboard: FlightControls,
  touch: TouchFlightControls,
): FlightControls => ({
  pitch: keyboard.pitch !== 0 ? keyboard.pitch : touch.pitch,
  roll: keyboard.roll !== 0 ? keyboard.roll : touch.roll,
  yaw: keyboard.yaw !== 0 ? keyboard.yaw : touch.yaw,
  throttleUp: keyboard.throttleUp,
  throttleDown: keyboard.throttleDown,
  throttleTarget: keyboard.throttleUp || keyboard.throttleDown ? null : touch.throttleTarget,
  brake: keyboard.brake || touch.brake,
});

export class InputManager {
  private readonly pressed = new Set<string>();
  private readonly actions = new Set<Action>();
  private touchControls: TouchFlightControls = { ...EMPTY_TOUCH_CONTROLS };

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  controls(): FlightControls {
    return mergeFlightControls(flightControlsFromPressed(this.pressed), this.touchControls);
  }

  setTouchControls(next: Partial<TouchFlightControls>): void {
    this.touchControls = updateTouchControls(this.touchControls, next);
  }

  releaseTouchMomentaryControls(): void {
    this.touchControls = releaseTouchMomentaryControls(this.touchControls);
  }

  resetTouchControls(): void {
    this.touchControls = { ...EMPTY_TOUCH_CONTROLS };
  }

  consume(action: Action): boolean {
    const available = this.actions.has(action);
    this.actions.delete(action);
    return available;
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.resetTouchControls();
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
    if (event.repeat) {
      this.pressed.add(event.code);
      return;
    }
    if (event.code === "KeyV") this.actions.add("camera");
    if (event.code === "KeyF") this.actions.add("flaps");
    if (event.code === "KeyR") this.actions.add("respawn");
    if (event.code === "Escape") this.actions.add("pause");
    if (event.code === "KeyM") this.actions.add("menu");
    if (["KeyW", "KeyS", "KeyA", "KeyD", "KeyQ", "KeyE", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyB", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight"].includes(event.code)) {
      event.preventDefault();
    }
    this.pressed.add(event.code);
    if (event.key === "Shift" || event.key === "Control") this.pressed.add(event.key);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
    this.pressed.delete(event.code);
    if (event.key === "Shift" || event.key === "Control") this.pressed.delete(event.key);
  };

  private onBlur = (): void => {
    this.pressed.clear();
    this.releaseTouchMomentaryControls();
  };

  private onVisibilityChange = (): void => {
    if (!document.hidden) return;
    this.onBlur();
  };
}
