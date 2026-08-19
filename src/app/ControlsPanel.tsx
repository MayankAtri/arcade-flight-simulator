import { Keyboard, X } from "lucide-react";

type ControlsPanelProps = {
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

export function ControlsPanel({ onClose }: ControlsPanelProps) {
  return (
    <div className="controls-layer">
      <section className="controls-panel" role="dialog" aria-modal="true" aria-label="Plane controls">
        <header className="controls-panel__header">
          <div>
            <span><Keyboard size={13} aria-hidden="true" /> Keyboard</span>
            <h2>Plane controls</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close controls"><X size={18} aria-hidden="true" /></button>
        </header>

        <div className="controls-panel__body">
          <p className="controls-intro">These bindings apply to the active Cessna 172SP.</p>
          {CONTROL_GROUPS.map((group) => (
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
