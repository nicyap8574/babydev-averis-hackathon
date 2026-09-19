import { Icon } from "./IconSprite";
import type { EmailListItem, ReviewQueueItem } from "../api";

interface MetricsRowProps {
  emails: EmailListItem[];
  reviewQueue: ReviewQueueItem[];
}

function pct(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

export function MetricsRow({ emails, reviewQueue }: MetricsRowProps) {
  const total = emails.length;
  const clean = emails.filter((e) => e.status === "OK").length;
  const mismatches = emails.filter((e) => e.status === "MISMATCH").length;
  const pending = reviewQueue.filter((item) => !item.resolved);

  const reasonCounts = pending.reduce<Record<string, number>>((acc, item) => {
    const key = item.reason ?? "unspecified";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="metrics">
      <article className="metric-card featured">
        <div className="metric-label">
          <span>Total processed</span>
          <span className="metric-icon"><Icon id="i-inbox" /></span>
        </div>
        <div className="metric-value">{total}</div>
        <div className="metric-note">
          <span>Classified emails in the shared inbox</span>
        </div>
      </article>

      <article className="metric-card">
        <div className="metric-label">
          <span>Clean documents</span>
          <span className="metric-icon"><Icon id="i-check" /></span>
        </div>
        <div className="metric-value">{clean}</div>
        <div className="metric-note">
          <span className="trend">{pct(clean, total)}</span>
          <span>no mismatch detected</span>
        </div>
      </article>

      <article className="metric-card">
        <div className="metric-label">
          <span>Mismatches found</span>
          <span className="metric-icon" style={{ color: "var(--red)", background: "var(--red-soft)" }}>
            <Icon id="i-alert" />
          </span>
        </div>
        <div className="metric-value">{mismatches}</div>
        <div className="metric-note">
          <span style={{ color: "var(--red)", fontWeight: 800 }}>{pct(mismatches, total)}</span>
          <span>require attention</span>
        </div>
      </article>

      <article className="metric-card">
        <div className="metric-label">
          <span>Awaiting review</span>
          <span className="metric-icon" style={{ color: "var(--amber)", background: "var(--amber-soft)" }}>
            <Icon id="i-clock" />
          </span>
        </div>
        <div className="metric-value">{pending.length}</div>
        <div className="metric-note">
          <span style={{ color: "var(--amber)", fontWeight: 800 }}>
            {topReason ? topReason[1] : 0}
          </span>
          <span>{topReason ? topReason[0].replace(/_/g, " ") : "in review queue"}</span>
        </div>
      </article>
    </div>
  );
}
