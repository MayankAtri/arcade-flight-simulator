import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

const JOYSTICK_DEAD_ZONE = 0.1;
const KEYBOARD_STEP = 0.1;

type PointBounds = Pick<DOMRect, "left" | "top" | "width" | "height">;

export type TouchAxes = {
  pitch: number;
  roll: number;
};

type MobileFlightControlsProps = {
  speedKnots: number;
  altitudeFeet: number;
  headingDegrees: number;
  throttle: number;
  flaps: number;
  paused: boolean;
  crashed: boolean;
  resetKey: number;
  onAxesChange: (pitch: number, roll: number) => void;
  onYawChange: (yaw: number) => void;
  onThrottleChange: (throttle: number) => void;
  onBrakeChange: (pressed: boolean) => void;
  onCycleFlaps: () => void;
  onReleaseMomentary: () => void;
};

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum))
);

export function joystickAxesFromPoint(
  clientX: number,
  clientY: number,
  bounds: PointBounds,
  deadZone = JOYSTICK_DEAD_ZONE,
): TouchAxes {
  const radius = Math.max(1, Math.min(bounds.width, bounds.height) / 2);
  const rawRoll = (clientX - (bounds.left + bounds.width / 2)) / radius;
  const rawPitch = (clientY - (bounds.top + bounds.height / 2)) / radius;
  const magnitude = Math.hypot(rawRoll, rawPitch);
  const safeDeadZone = clamp(deadZone, 0, 0.95);
  if (magnitude <= safeDeadZone) return { pitch: 0, roll: 0 };
  const clampedMagnitude = Math.min(1, magnitude);
  const normalizedMagnitude = (clampedMagnitude - safeDeadZone) / (1 - safeDeadZone);
  const directionScale = normalizedMagnitude / magnitude;
  return {
    pitch: clamp(rawPitch * directionScale, -1, 1),
    roll: clamp(rawRoll * directionScale, -1, 1),
  };
}

export function horizontalSliderValue(clientX: number, bounds: PointBounds): number {
  return clamp(((clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1, -1, 1);
}

export function verticalThrottleValue(clientY: number, bounds: PointBounds): number {
  return clamp(1 - (clientY - bounds.top) / Math.max(1, bounds.height), 0, 1);
}

const TOUCH_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Pitch, roll and Control/i, "Joystick + throttle slider"],
  [/Q \+ A, then W \/ S/i, "Joystick left + yaw left, then adjust pitch"],
  [/E \+ D, then W \/ S/i, "Joystick right + yaw right, then adjust pitch"],
  [/D \+ E, then level/i, "Yaw right + joystick right, then center"],
  [/D \/ E, then level/i, "Yaw or joystick right, then center"],
  [/Q \/ E and A \/ D/i, "Joystick roll + yaw slider"],
  [/Q \/ E with A \/ D/i, "Joystick + yaw slider"],
  [/Shift, W \/ S, Q \/ E/i, "Throttle slider + joystick"],
  [/S, then Control/i, "Pull joystick back, then lower throttle"],
  [/S, then ease off/i, "Pull joystick back, then center"],
  [/E briefly, then release/i, "Joystick right briefly, then center"],
  [/Q briefly, then release/i, "Joystick left briefly, then center"],
  [/Ease W as speed returns/i, "Ease joystick forward as speed returns"],
  [/Release S/i, "Center the joystick"],
  [/Release B/i, "Release Brake"],
  [/Hold B/i, "Hold Brake"],
  [/A \/ D to steer/i, "Yaw slider"],
  [/S \/ Arrow Down/i, "Pull joystick back"],
  [/W \/ Arrow Up/i, "Push joystick forward"],
  [/S gently/i, "Pull joystick back gently"],
  [/Shift \/ Control/i, "Throttle slider"],
  [/Control \/ Shift/i, "Throttle slider"],
  [/Hold Shift/i, "Throttle slider to full"],
  [/\bShift\b/i, "Throttle slider up"],
  [/\bControl\b/i, "Throttle slider down"],
  [/W \/ S/i, "Joystick pitch"],
  [/S \/ W/i, "Joystick pitch"],
  [/Q \/ E/i, "Joystick roll"],
  [/A \/ D/i, "Yaw slider"],
  [/F for flaps/i, "Flaps button"],
  [/^F$/i, "Flaps button"],
  [/^B$/i, "Brake button"],
  [/Pitch and roll/i, "Joystick"],
];

export function mobileControlLabel(label: string): string {
  for (const [pattern, replacement] of TOUCH_LABELS) {
    if (pattern.test(label)) return replacement;
  }
  return label;
}

export function mobileInstructionText(instruction: string): string {
  return instruction
    .replace("Hold B briefly", "Hold Brake briefly")
    .replace("Hold Shift until", "Move the throttle slider up until");
}

export function useCoarsePointer(): boolean {
  const [matches, setMatches] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(hover: none) and (pointer: coarse)").matches
  ));

  useEffect(() => {
    const query = window.matchMedia("(hover: none) and (pointer: coarse)");
    const update = () => setMatches(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return matches;
}

export function usePortraitOrientation(): boolean {
  const [matches, setMatches] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(orientation: portrait)").matches
  ));

  useEffect(() => {
    const query = window.matchMedia("(orientation: portrait)");
    const update = () => setMatches(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return matches;
}

const capturePointer = (event: ReactPointerEvent<HTMLElement>): void => {
  event.preventDefault();
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // Synthetic browser tests do not create an active platform pointer, while real touches do.
  }
};

export function MobileFlightControls({
  speedKnots,
  altitudeFeet,
  headingDegrees,
  throttle,
  flaps,
  paused,
  crashed,
  resetKey,
  onAxesChange,
  onYawChange,
  onThrottleChange,
  onBrakeChange,
  onCycleFlaps,
  onReleaseMomentary,
}: MobileFlightControlsProps) {
  const [axes, setAxes] = useState<TouchAxes>({ pitch: 0, roll: 0 });
  const [yaw, setYaw] = useState(0);
  const [throttleTarget, setThrottleTarget] = useState(() => clamp(throttle, 0, 1));
  const joystickPointer = useRef<number | null>(null);
  const yawPointer = useRef<number | null>(null);
  const throttlePointer = useRef<number | null>(null);
  const throttleEngaged = useRef(false);
  const interactive = !paused && !crashed;

  const releaseAxes = () => {
    joystickPointer.current = null;
    setAxes({ pitch: 0, roll: 0 });
    onAxesChange(0, 0);
  };

  const releaseYaw = () => {
    yawPointer.current = null;
    setYaw(0);
    onYawChange(0);
  };

  useEffect(() => {
    throttleEngaged.current = false;
    setThrottleTarget(clamp(throttle, 0, 1));
    releaseAxes();
    releaseYaw();
    onBrakeChange(false);
    onReleaseMomentary();
    // resetKey intentionally represents a new spawn/respawn control session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    if (!throttleEngaged.current) setThrottleTarget(clamp(throttle, 0, 1));
  }, [resetKey, throttle]);

  useEffect(() => {
    if (interactive) return;
    releaseAxes();
    releaseYaw();
    onBrakeChange(false);
    onReleaseMomentary();
    // Callback identities are stable App closures around the current engine ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  useEffect(() => () => {
    onAxesChange(0, 0);
    onYawChange(0);
    onBrakeChange(false);
    onReleaseMomentary();
  }, [onAxesChange, onBrakeChange, onReleaseMomentary, onYawChange]);

  const updateJoystick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || joystickPointer.current !== event.pointerId) return;
    const next = joystickAxesFromPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
    setAxes(next);
    onAxesChange(next.pitch, next.roll);
  };

  const updateYaw = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || yawPointer.current !== event.pointerId) return;
    const next = horizontalSliderValue(event.clientX, event.currentTarget.getBoundingClientRect());
    setYaw(next);
    onYawChange(next);
  };

  const updateThrottle = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || throttlePointer.current !== event.pointerId) return;
    const next = verticalThrottleValue(event.clientY, event.currentTarget.getBoundingClientRect());
    throttleEngaged.current = true;
    setThrottleTarget(next);
    onThrottleChange(next);
  };

  const onJoystickKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || !event.key.startsWith("Arrow")) return;
    event.preventDefault();
    const next = {
      pitch: clamp(axes.pitch + (event.key === "ArrowDown" ? KEYBOARD_STEP : event.key === "ArrowUp" ? -KEYBOARD_STEP : 0), -1, 1),
      roll: clamp(axes.roll + (event.key === "ArrowRight" ? KEYBOARD_STEP : event.key === "ArrowLeft" ? -KEYBOARD_STEP : 0), -1, 1),
    };
    setAxes(next);
    onAxesChange(next.pitch, next.roll);
  };

  const onYawKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || !event.key.startsWith("Arrow")) return;
    event.preventDefault();
    const next = clamp(yaw + (event.key === "ArrowRight" ? KEYBOARD_STEP : event.key === "ArrowLeft" ? -KEYBOARD_STEP : 0), -1, 1);
    setYaw(next);
    onYawChange(next);
  };

  const onThrottleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || !event.key.startsWith("Arrow")) return;
    event.preventDefault();
    const next = clamp(throttleTarget + (event.key === "ArrowUp" ? KEYBOARD_STEP : event.key === "ArrowDown" ? -KEYBOARD_STEP : 0), 0, 1);
    throttleEngaged.current = true;
    setThrottleTarget(next);
    onThrottleChange(next);
  };

  const joystickStyle = {
    "--joystick-x": `${axes.roll * 42}px`,
    "--joystick-y": `${axes.pitch * 42}px`,
  } as CSSProperties;

  return (
    <section className={`mobile-flight-controls${interactive ? "" : " is-disabled"}`} aria-label="Touch flight controls">
      <div className="mobile-flight-readouts" aria-label="Mobile flight telemetry">
        <div><span>Speed</span><strong>{speedKnots}</strong><small>KT</small></div>
        <div><span>Altitude</span><strong>{altitudeFeet}</strong><small>FT</small></div>
        <div><span>Heading</span><strong>{Math.round(headingDegrees).toString().padStart(3, "0")}</strong><small>°</small></div>
        <div><span>Throttle</span><strong>{Math.round(throttle * 100)}</strong><small>%</small></div>
      </div>

      <div className="mobile-stick-group">
        <span className="mobile-control-label">Pitch / Roll</span>
        <div
          className="mobile-joystick"
          role="slider"
          tabIndex={0}
          aria-label="Pitch and roll joystick"
          aria-valuetext={`Pitch ${Math.round(axes.pitch * 100)} percent, roll ${Math.round(axes.roll * 100)} percent`}
          aria-disabled={!interactive}
          onKeyDown={onJoystickKeyDown}
          onKeyUp={releaseAxes}
          onBlur={releaseAxes}
          onPointerDown={(event) => {
            if (!interactive || joystickPointer.current !== null) return;
            joystickPointer.current = event.pointerId;
            capturePointer(event);
            updateJoystick(event);
          }}
          onPointerMove={updateJoystick}
          onPointerUp={releaseAxes}
          onPointerCancel={releaseAxes}
          onLostPointerCapture={releaseAxes}
        >
          <span className="mobile-joystick__crosshair" aria-hidden="true" />
          <span className="mobile-joystick__thumb" style={joystickStyle} aria-hidden="true" />
        </div>
      </div>

      <div className="mobile-right-controls">
        <div className="mobile-yaw-group">
          <div className="mobile-control-label"><span>Yaw</span><strong>{Math.round(yaw * 100)}</strong></div>
          <div
            className="mobile-yaw-slider"
            role="slider"
            tabIndex={0}
            aria-label="Yaw slider"
            aria-valuemin={-100}
            aria-valuemax={100}
            aria-valuenow={Math.round(yaw * 100)}
            aria-disabled={!interactive}
            onKeyDown={onYawKeyDown}
            onKeyUp={releaseYaw}
            onBlur={releaseYaw}
            onPointerDown={(event) => {
              if (!interactive || yawPointer.current !== null) return;
              yawPointer.current = event.pointerId;
              capturePointer(event);
              updateYaw(event);
            }}
            onPointerMove={updateYaw}
            onPointerUp={releaseYaw}
            onPointerCancel={releaseYaw}
            onLostPointerCapture={releaseYaw}
          >
            <span className="mobile-yaw-slider__center" aria-hidden="true" />
            <span className="mobile-yaw-slider__thumb" style={{ left: `${(yaw + 1) * 50}%` }} aria-hidden="true" />
          </div>
        </div>

        <div className="mobile-surface-buttons">
          <button
            type="button"
            className="mobile-brake-button"
            disabled={!interactive}
            aria-label="Hold wheel brakes"
            onPointerDown={(event) => {
              capturePointer(event);
              onBrakeChange(true);
            }}
            onPointerUp={() => onBrakeChange(false)}
            onPointerCancel={() => onBrakeChange(false)}
            onLostPointerCapture={() => onBrakeChange(false)}
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter") onBrakeChange(true);
            }}
            onKeyUp={() => onBrakeChange(false)}
            onBlur={() => onBrakeChange(false)}
          >
            Brake
          </button>
          <button type="button" disabled={!interactive} onClick={onCycleFlaps} aria-label="Cycle flaps">
            <span>Flaps</span><strong>{Math.round(flaps * 100)}%</strong>
          </button>
        </div>

        <div className="mobile-throttle-group">
          <div className="mobile-control-label"><span>Throttle</span><strong>{Math.round(throttleTarget * 100)}</strong></div>
          <div
            className="mobile-throttle-slider"
            role="slider"
            tabIndex={0}
            aria-label="Throttle slider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(throttleTarget * 100)}
            aria-disabled={!interactive}
            onKeyDown={onThrottleKeyDown}
            onPointerDown={(event) => {
              if (!interactive || throttlePointer.current !== null) return;
              throttlePointer.current = event.pointerId;
              capturePointer(event);
              updateThrottle(event);
            }}
            onPointerMove={updateThrottle}
            onPointerUp={() => { throttlePointer.current = null; }}
            onPointerCancel={() => { throttlePointer.current = null; }}
            onLostPointerCapture={() => { throttlePointer.current = null; }}
          >
            <span className="mobile-throttle-slider__fill" style={{ height: `${throttleTarget * 100}%` }} aria-hidden="true" />
            <span className="mobile-throttle-slider__thumb" style={{ bottom: `${throttleTarget * 100}%` }} aria-hidden="true" />
          </div>
        </div>
      </div>
    </section>
  );
}
