import type { ReactNode } from "react";
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

interface MetricCardProps {
  accent: "blue" | "green" | "red" | "amber";
  icon: string;
  label: string;
  value: number;
  children: ReactNode;
}

function MetricCard({ accent, icon, label, value, children }: MetricCardProps) {
  return (
    <article className="metric-card" data-accent={accent}>
      <div className="metric-top">
        <span className="metric-icon">
          <Icon id={icon} />
        </span>
      </div>
      <span className="metric-label">{label}</span>
      <div className="metric-value">{value.toLocaleString()}</div>
      <div className="metric-note">{children}</div>
    </article>
  );
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
      <MetricCard accent="blue" icon="i-inbox" label="Total processed" value={total}>
        <span>Classified emails in the shared inbox</span>
      </MetricCard>

      <MetricCard accent="green" icon="i-check" label="Clean documents" value={clean}>
        <span className="trend">{pct(clean, total)}</span>
        <span>no mismatch detected</span>
      </MetricCard>

      <MetricCard accent="red" icon="i-alert" label="Mismatches found" value={mismatches}>
        <span className="warn">{pct(mismatches, total)}</span>
        <span>require attention</span>
      </MetricCard>

      <MetricCard accent="amber" icon="i-clock" label="Awaiting review" value={pending.length}>
        <span className="hold">{topReason ? topReason[1] : 0}</span>
        <span>{topReason ? topReason[0].replace(/_/g, " ") : "in review queue"}</span>
      </MetricCard>
    </div>
  );
}
