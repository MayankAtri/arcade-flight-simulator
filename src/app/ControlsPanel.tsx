import { Gamepad2, Keyboard, X } from "lucide-react";

type ControlsPanelProps = {
  touchControls: boolean;
  onClose: () => void;
};

const CONTROL_GROUPS = [
  {
    label: "Primary flight",
    controls: [
      ["Pitch up", "Pull the nose up", "S / Arrow Down"],
      ["Pitch down", "Push the nose down", "W / Arrow Up"],
      ["Roll left", "Bank left", "Q / Arrow Left"],
      ["Roll right", "Bank right", "E / Arrow Right"],
      ["Yaw left", "Left rudder / nosewheel steering", "A"],
      ["Yaw right", "Right rudder / nosewheel steering", "D"],
    ],
  },
  {
    label: "Power and surfaces",
    controls: [
      ["Throttle up", "Increase engine power", "Shift"],
      ["Throttle down", "Decrease engine power", "Control"],
      ["Flaps", "Cycle flap position", "F"],
      ["Brake", "Apply wheel brakes on the ground", "B"],
    ],
  },
  {
    label: "View and session",
    controls: [
      ["View", "Cycle camera view", "V"],
      ["Pause", "Pause or resume the flight", "Esc"],
      ["World search", "Open flight setup", "M"],
      ["Respawn", "Restart at the selected location", "R"],
    ],
  },
] as const;

const TOUCH_CONTROL_GROUPS = [
  {
    label: "Primary flight",
    controls: [
      ["Pitch and roll", "Push up for nose down, pull back for nose up, and move sideways to bank", "Left joystick"],
      ["Yaw", "Control rudder or nosewheel steering; it returns to center", "Yaw slider"],
    ],
  },
  {
    label: "Power and surfaces",
    controls: [
      ["Throttle", "Set engine power; the selected position remains set", "Throttle slider"],
      ["Flaps", "Cycle through 0%, 50%, and 100%", "Flaps button"],
      ["Brake", "Hold while braking on the ground", "Hold Brake"],
    ],
  },
  {
    label: "View and session",
    controls: [
      ["View", "Cycle camera view", "Top action"],
      ["Pause", "Pause or resume the flight", "Top action"],
      ["World search", "Open flight setup", "Top action"],
      ["Respawn", "Restart at the selected location", "Top action"],
    ],
  },
] as const;

export function ControlsPanel({ touchControls, onClose }: ControlsPanelProps) {
  const groups = touchControls ? TOUCH_CONTROL_GROUPS : CONTROL_GROUPS;
  return (
    <div className="controls-layer">
      <section className="controls-panel" role="dialog" aria-modal="true" aria-label="Plane controls">
        <header className="controls-panel__header">
          <div>
            <span>{touchControls ? <Gamepad2 size={13} aria-hidden="true" /> : <Keyboard size={13} aria-hidden="true" />} {touchControls ? "Touch" : "Keyboard"}</span>
            <h2>Plane controls</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close controls"><X size={18} aria-hidden="true" /></button>
        </header>

        <div className="controls-panel__body">
          <p className="controls-intro">{touchControls ? "Touch flight controls are available in landscape orientation." : "These bindings apply to the active Cessna 172SP."}</p>
          {groups.map((group) => (
            <section className="control-section" key={group.label}>
              <h3>{group.label}</h3>
              <div className="control-rows">
                {group.controls.map(([name, description, keys]) => (
                  <div className="control-row" key={name}>
                    <div>
                      <strong>{name}</strong>
                      <span>{description}</span>
                    </div>
                    <kbd>{keys}</kbd>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
