type Props = { reason: string; basic: boolean; onRetry: () => void };

export function WorldSceneryNotice({ reason, basic, onRetry }: Props) {
  return (
    <aside className="scenery-notice" role="status" aria-label="Scenery unavailable">
      <div>
        <strong>{basic ? "3D scenery unavailable" : "Selected scenery unavailable"}</strong>
        <p>{basic ? "Only a flat map is available; terrain and 3D buildings are missing. " : "Using Cesium scenery. "}{reason}</p>
      </div>
      <button type="button" className="primary-button" onClick={onRetry}>Retry scenery</button>
    </aside>
  );
}
