import { Icon } from "./IconSprite";

export function ActivityPanel() {
  return (
    <aside className="panel activity-panel">
      <div className="panel-head">
        <div className="panel-title">
          <h2>Live activity</h2>
          <p>Pipeline events, as they happen</p>
        </div>
        <button className="text-button" disabled title="No live event stream in this build">
          Refresh
        </button>
      </div>
      <div className="unavailable-panel">
        <span className="metric-icon">
          <Icon id="i-refresh" />
        </span>
        <strong>Live telemetry not connected</strong>
        <span>
          This build serves a single completed pipeline run. There's no streaming event source to
          show here yet.
        </span>
      </div>
    </aside>
  );
}
