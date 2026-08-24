import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";

const COMPASS_TICK_DEGREES = 5;
const COMPASS_PIXELS_PER_DEGREE = 4;
const COMPASS_TICKS_EACH_SIDE = 24;

export const normalizeHeadingDegrees = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return ((value % 360) + 360) % 360;
};

export const shortestAngularDeltaDegrees = (from: number, to: number): number => {
  const normalizedFrom = normalizeHeadingDegrees(from);
  const normalizedTo = normalizeHeadingDegrees(to);
  return ((normalizedTo - normalizedFrom + 540) % 360) - 180;
};

export const unwrapHeadingDegrees = (previousUnwrapped: number, nextHeading: number): number => (
  previousUnwrapped + shortestAngularDeltaDegrees(previousUnwrapped, nextHeading)
);

export const formatCompassHeading = (value: number): string => (
  Math.round(normalizeHeadingDegrees(value)).toString().padStart(3, "0")
);

const compassCardinal = (value: number): string => {
  const normalized = Math.round(normalizeHeadingDegrees(value));
  if (normalized === 0 || normalized === 360) return "N";
  if (normalized === 90) return "E";
  if (normalized === 180) return "S";
  if (normalized === 270) return "W";
  return "";
};

type CompassTapeProps = {
  headingDegrees: number;
};

export function CompassTape({ headingDegrees }: CompassTapeProps) {
  const initialHeading = normalizeHeadingDegrees(headingDegrees);
  const unwrappedHeadingRef = useRef(initialHeading);
  const normalizedHeading = normalizeHeadingDegrees(headingDegrees);

  unwrappedHeadingRef.current = unwrapHeadingDegrees(unwrappedHeadingRef.current, normalizedHeading);

  const unwrappedHeading = unwrappedHeadingRef.current;
  const centerTickIndex = Math.round(unwrappedHeading / COMPASS_TICK_DEGREES);
  const tickIndexes = Array.from(
    { length: COMPASS_TICKS_EACH_SIDE * 2 + 1 },
    (_, index) => centerTickIndex - COMPASS_TICKS_EACH_SIDE + index,
  );

  return (
    <div className="heading-tape" aria-label={`Heading ${formatCompassHeading(headingDegrees)} degrees`}>
      <div className="heading-tape__viewport" aria-hidden="true">
        <div
          className="heading-tape__track"
          style={{ transform: `translate3d(${-unwrappedHeading * COMPASS_PIXELS_PER_DEGREE}px, 0, 0)` }}
        >
          {tickIndexes.map((tickIndex) => {
            const degrees = tickIndex * COMPASS_TICK_DEGREES;
            const normalizedDegrees = normalizeHeadingDegrees(degrees);
            const isMajor = Math.round(normalizedDegrees) % 10 === 0;
            const cardinal = isMajor ? compassCardinal(normalizedDegrees) : "";
            const label = isMajor ? formatCompassHeading(normalizedDegrees) : "";

            return (
              <span
                className={`heading-tape__tick${isMajor ? " is-major" : ""}`}
                key={tickIndex}
                style={{ left: `${degrees * COMPASS_PIXELS_PER_DEGREE}px` }}
              >
                {isMajor && <b>{label}{cardinal ? ` ${cardinal}` : ""}</b>}
              </span>
            );
          })}
        </div>
      </div>
      <span className="heading-tape__active-line" aria-hidden="true" />
      <ChevronDown className="heading-tape__pointer" size={16} aria-hidden="true" />
    </div>
  );
}

type AttitudeIndicatorProps = {
  bankDegrees: number;
  pitchDegrees: number;
};

type AttitudeState = {
  bankDegrees: number;
  pitchDegrees: number;
};

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.min(maximum, Math.max(minimum, value))
);

export function AttitudeIndicator({ bankDegrees, pitchDegrees }: AttitudeIndicatorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetRef = useRef<AttitudeState>({ bankDegrees, pitchDegrees });
  const displayRef = useRef<AttitudeState>({ bankDegrees, pitchDegrees });

  useEffect(() => {
    targetRef.current = {
      bankDegrees: Number.isFinite(bankDegrees) ? bankDegrees : 0,
      pitchDegrees: Number.isFinite(pitchDegrees) ? pitchDegrees : 0,
    };
  }, [bankDegrees, pitchDegrees]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext("2d");
    if (!context) return undefined;

    let animationFrame = 0;
    let previousTime = performance.now();

    const draw = (time: number) => {
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width < 4 || bounds.height < 4) {
        animationFrame = requestAnimationFrame(draw);
        return;
      }
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      const density = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.round(width * density);
      const pixelHeight = Math.round(height * density);

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      context.setTransform(density, 0, 0, density, 0, 0);
      context.clearRect(0, 0, width, height);

      const elapsedSeconds = Math.min(0.1, Math.max(0, (time - previousTime) / 1_000));
      previousTime = time;
      const smoothing = 1 - Math.exp(-elapsedSeconds * 12);
      const target = targetRef.current;
      const display = displayRef.current;
      display.pitchDegrees += (target.pitchDegrees - display.pitchDegrees) * smoothing;
      display.bankDegrees += shortestAngularDeltaDegrees(display.bankDegrees, target.bankDegrees) * smoothing;

      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.47;
      const pitchPixelsPerDegree = radius / 31;
      const displayedPitch = clamp(display.pitchDegrees, -45, 45);

      context.save();
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.clip();

      context.save();
      context.translate(centerX, centerY);
      context.rotate((-display.bankDegrees * Math.PI) / 180);
      context.translate(0, displayedPitch * pitchPixelsPerDegree);

      context.fillStyle = "#3496cc";
      context.fillRect(-radius * 2, -radius * 2, radius * 4, radius * 2);
      context.fillStyle = "#c89b60";
      context.fillRect(-radius * 2, 0, radius * 4, radius * 2);

      context.fillStyle = "rgba(255, 255, 255, 0.96)";
      context.fillRect(-radius * 2, -radius * 0.035, radius * 4, radius * 0.07);
      context.fillStyle = "#f4b941";
      context.fillRect(-radius * 2, radius * 0.025, radius * 4, radius * 0.025);

      context.strokeStyle = "rgba(255, 255, 255, 0.96)";
      context.fillStyle = "rgba(255, 255, 255, 0.98)";
      context.lineWidth = Math.max(1.5, radius * 0.018);
      context.lineCap = "round";
      context.font = `700 ${Math.max(8, radius * 0.11)}px Rajdhani, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";

      for (let mark = -30; mark <= 30; mark += 10) {
        if (mark === 0) continue;
        const y = -mark * pitchPixelsPerDegree;
        const lineHalfWidth = mark % 20 === 0 ? radius * 0.24 : radius * 0.16;
        context.beginPath();
        context.moveTo(-lineHalfWidth, y);
        context.lineTo(lineHalfWidth, y);
        context.stroke();
        context.fillText(String(Math.abs(mark)), -lineHalfWidth - radius * 0.12, y);
        context.fillText(String(Math.abs(mark)), lineHalfWidth + radius * 0.12, y);
      }

      context.restore();

      context.strokeStyle = "rgba(31, 72, 94, 0.9)";
      context.lineWidth = Math.max(2, radius * 0.025);
      context.beginPath();
      context.arc(centerX, centerY, radius - context.lineWidth / 2, 0, Math.PI * 2);
      context.stroke();

      context.strokeStyle = "rgba(255, 255, 255, 0.96)";
      context.lineWidth = Math.max(2, radius * 0.035);
      context.lineCap = "round";
      for (const mark of [-30, -20, -10, 0, 10, 20, 30]) {
        const angle = ((mark - 90) * Math.PI) / 180;
        const outer = radius * 0.82;
        const inner = mark === 0 ? radius * 0.61 : radius * 0.68;
        context.beginPath();
        context.moveTo(centerX + Math.cos(angle) * inner, centerY + Math.sin(angle) * inner);
        context.lineTo(centerX + Math.cos(angle) * outer, centerY + Math.sin(angle) * outer);
        context.stroke();
      }

      context.fillStyle = "#ffb43b";
      context.beginPath();
      context.moveTo(centerX, centerY - radius * 0.54);
      context.lineTo(centerX - radius * 0.13, centerY - radius * 0.29);
      context.lineTo(centerX + radius * 0.13, centerY - radius * 0.29);
      context.closePath();
      context.fill();

      context.fillStyle = "rgba(255, 255, 255, 0.98)";
      context.fillRect(centerX - radius * 0.58, centerY - radius * 0.035, radius * 0.38, radius * 0.07);
      context.fillRect(centerX + radius * 0.2, centerY - radius * 0.035, radius * 0.38, radius * 0.07);
      context.fillStyle = "#ffb43b";
      context.beginPath();
      context.arc(centerX, centerY, radius * 0.055, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "rgba(255, 255, 255, 0.96)";
      context.font = `700 ${Math.max(10, radius * 0.17)}px JetBrains Mono, monospace`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("ATT", centerX, centerY + radius * 0.72);
      context.restore();

      animationFrame = requestAnimationFrame(draw);
    };

    animationFrame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const roundedPitch = Math.round(pitchDegrees);
  const roundedBank = Math.round(bankDegrees);

  return (
    <figure
      className="attitude-indicator"
      aria-label={`Attitude indicator: pitch ${roundedPitch} degrees, bank ${roundedBank} degrees`}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <figcaption className="sr-only">Pitch {roundedPitch} degrees. Bank {roundedBank} degrees.</figcaption>
    </figure>
  );
}
