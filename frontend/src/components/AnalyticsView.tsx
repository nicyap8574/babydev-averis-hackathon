import { useEffect, useMemo, useState } from "react";
import { fetchDefectFieldCounts } from "../api";
import type { Category, EmailListItem, ReviewQueueItem } from "../api";
import { Icon } from "./IconSprite";
import { CategoryPill } from "./CategoryPill";

interface AnalyticsViewProps {
  emails: EmailListItem[];
  reviewQueue: ReviewQueueItem[];
}

const CATEGORIES: Category[] = ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"];

function pct(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

function tally<T extends string>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {});
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

interface BreakdownRowProps {
  label: React.ReactNode;
  count: number;
  max: number;
}

function BreakdownRow({ label, count, max }: BreakdownRowProps) {
  return (
    <div className="breakdown-row">
      <span className="breakdown-row-label">{label}</span>
      <span className="breakdown-bar">
        <i style={{ width: pct(count, max) }} />
      </span>
      <span className="breakdown-count">{count}</span>
    </div>
  );
}

export function AnalyticsView({ emails, reviewQueue }: AnalyticsViewProps) {
  const total = emails.length;

  const categoryCounts = useMemo(
    () => tally(emails.map((e) => e.classification)),
    [emails],
  );
  const maxCategoryCount = Math.max(1, ...CATEGORIES.map((c) => categoryCounts[c] ?? 0));

  const comparisonCount = categoryCounts["BL_COMPARISON"] ?? 0;
  const mismatchCount = emails.filter((e) => e.status === "MISMATCH").length;

  const reasonCounts = useMemo(
    () => tally(reviewQueue.map((item) => item.reason ?? "unspecified")),
    [reviewQueue],
  );
  const reasonEntries = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);
  const maxReasonCount = Math.max(1, ...reasonEntries.map(([, count]) => count));

  const [defectFieldCounts, setDefectFieldCounts] = useState<Record<string, number> | null>(null);
  const [defectFieldError, setDefectFieldError] = useState<string | null>(null);

  useEffect(() => {
    fetchDefectFieldCounts()
      .then(setDefectFieldCounts)
      .catch((error: Error) => setDefectFieldError(error.message));
  }, []);

  const defectFieldEntries = Object.entries(defectFieldCounts ?? {}).sort((a, b) => b[1] - a[1]);
  const maxDefectFieldCount = Math.max(1, ...defectFieldEntries.map(([, count]) => count));

  return (
    <section className="view active">
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
            <span>Comparison requests</span>
            <span className="metric-icon"><Icon id="i-file" /></span>
          </div>
          <div className="metric-value">{comparisonCount}</div>
          <div className="metric-note">
            <span className="trend">{pct(comparisonCount, total)}</span>
            <span>of the inbox</span>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-label">
            <span>Mismatch rate</span>
            <span className="metric-icon" style={{ color: "var(--red)", background: "var(--red-soft)" }}>
              <Icon id="i-alert" />
            </span>
          </div>
          <div className="metric-value">{pct(mismatchCount, comparisonCount)}</div>
          <div className="metric-note">
            <span style={{ color: "var(--red)", fontWeight: 800 }}>{mismatchCount}</span>
            <span>of comparisons mismatched</span>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-label">
            <span>Escalation rate</span>
            <span className="metric-icon" style={{ color: "var(--amber)", background: "var(--amber-soft)" }}>
              <Icon id="i-clock" />
            </span>
          </div>
          <div className="metric-value">{pct(reviewQueue.length, comparisonCount)}</div>
          <div className="metric-note">
            <span style={{ color: "var(--amber)", fontWeight: 800 }}>{reviewQueue.length}</span>
            <span>sent for human review</span>
          </div>
        </article>
      </div>

      <div className="analytics-grid">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">
              <h2>Classification breakdown</h2>
              <p>Emails by category</p>
            </div>
          </div>
          <div className="breakdown-list">
            {CATEGORIES.map((category) => (
              <BreakdownRow
                key={category}
                label={<CategoryPill category={category} />}
                count={categoryCounts[category] ?? 0}
                max={maxCategoryCount}
              />
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">
              <h2>Escalation reasons</h2>
              <p>Why cases needed human review</p>
            </div>
          </div>
          {reasonEntries.length === 0 ? (
            <div className="breakdown-empty">No escalations recorded.</div>
          ) : (
            <div className="breakdown-list">
              {reasonEntries.map(([reason, count]) => (
                <BreakdownRow
                  key={reason}
                  label={reason.replace(/_/g, " ")}
                  count={count}
                  max={maxReasonCount}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <h2>Top defect fields</h2>
            <p>Which SI/BL fields mismatch most often</p>
          </div>
        </div>
        {defectFieldError ? (
          <div className="unavailable-panel">
            <span className="metric-icon"><Icon id="i-info" /></span>
            <strong>Defect field data unavailable</strong>
            <span>{defectFieldError}</span>
          </div>
        ) : defectFieldCounts === null ? (
          <div className="breakdown-empty">Loading…</div>
        ) : defectFieldEntries.length === 0 ? (
          <div className="breakdown-empty">No mismatches recorded.</div>
        ) : (
          <div className="breakdown-list">
            {defectFieldEntries.map(([field, count]) => (
              <BreakdownRow
                key={field}
                label={fieldLabel(field)}
                count={count}
                max={maxDefectFieldCount}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
