import type { FlightControls } from "../flight/types";

type Action = "camera" | "flaps" | "respawn" | "pause" | "menu";

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

export class InputManager {
  private readonly pressed = new Set<string>();
  private readonly actions = new Set<Action>();

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  controls(): FlightControls {
    return flightControlsFromPressed(this.pressed);
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
  };
}
