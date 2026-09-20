import { useEffect, useState } from "react";
import { fetchDefectFieldCounts } from "../api";
import type { EmailListItem, ReviewQueueItem } from "../api";

interface InsightsRailProps {
  emails: EmailListItem[];
  reviewQueue: ReviewQueueItem[];
}

const MINOR_WORDS = new Set(["of", "and"]);

function fieldLabel(field: string): string {
  return field
    .replace(/_/g, " ")
    .split(" ")
    .map((word, index) =>
      index > 0 && MINOR_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

function ratio(part: number, total: number): number {
  return total === 0 ? 0 : (part / total) * 100;
}

interface StatRowProps {
  label: string;
  value: string;
  percent: number;
  tone: "green" | "red" | "amber";
}

function StatRow({ label, value, percent, tone }: StatRowProps) {
  return (
    <div className="quick-stat-row">
      <div className="quick-stat-head">
        <span className="quick-stat-label">{label}</span>
        <span className="quick-stat-value">{value}</span>
      </div>
      <span className="quick-stat-bar">
        <i data-tone={tone} style={{ width: `${Math.min(100, percent).toFixed(1)}%` }} />
      </span>
    </div>
  );
}

export function InsightsRail({ emails, reviewQueue }: InsightsRailProps) {
  const total = emails.length;
  const comparisons = emails.filter((e) => e.classification === "BL_COMPARISON").length;
  const clean = emails.filter((e) => e.status === "OK").length;
  const mismatches = emails.filter((e) => e.status === "MISMATCH").length;
  const pending = reviewQueue.filter((item) => !item.resolved).length;

  const [defectFieldCounts, setDefectFieldCounts] = useState<Record<string, number> | null>(null);
  const [defectFieldError, setDefectFieldError] = useState<string | null>(null);

  useEffect(() => {
    fetchDefectFieldCounts()
      .then(setDefectFieldCounts)
      .catch((error: Error) => setDefectFieldError(error.message));
  }, []);

  const topDefects = Object.entries(defectFieldCounts ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="side-rail">
      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <h2>Quick stats</h2>
            <p>Across this pipeline run</p>
          </div>
        </div>
        <div className="quick-stats">
          <StatRow
            label="Clean rate"
            value={`${ratio(clean, total).toFixed(1)}%`}
            percent={ratio(clean, total)}
            tone="green"
          />
          <StatRow
            label="Mismatch rate"
            value={`${ratio(mismatches, comparisons).toFixed(1)}%`}
            percent={ratio(mismatches, comparisons)}
            tone="red"
          />
          <StatRow
            label="Escalated to review"
            value={`${ratio(pending, total).toFixed(1)}%`}
            percent={ratio(pending, total)}
            tone="amber"
          />
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <h2>Top defect fields</h2>
            <p>Most frequent SI/BL mismatches</p>
          </div>
        </div>
        {defectFieldError && <div className="breakdown-empty">Could not load defect fields.</div>}
        {!defectFieldError && defectFieldCounts === null && (
          <div className="breakdown-empty">Loading…</div>
        )}
        {!defectFieldError && defectFieldCounts !== null && topDefects.length === 0 && (
          <div className="breakdown-empty">No defects recorded in this run.</div>
        )}
        {topDefects.length > 0 && (
          <div className="top-list">
            {topDefects.map(([field, count]) => (
              <div className="top-list-row" key={field}>
                <span className="top-list-name">{fieldLabel(field)}</span>
                <span className="top-list-count">{count}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
