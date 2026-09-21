import { useEffect, useState } from "react";
import { fetchReports, type ReportListItem } from "../api";
import { Icon } from "./IconSprite";

interface ReportsViewProps {
  search: string;
  onOpen: (emailId: string) => void;
}

const PAGE_SIZE = 12;
type CompletedAtSort = "ascending" | "descending";

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function outcome(item: ReportListItem): string {
  return item.report_type === "reviewed_escalation" ? "Reviewed escalation" : "Mismatch found";
}

export function ReportsView({ search, onOpen }: ReportsViewProps) {
  const [items, setItems] = useState<ReportListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [completedAtSort, setCompletedAtSort] = useState<CompletedAtSort>("descending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      fetchReports({ search, page, pageSize: PAGE_SIZE, completedAtAscending: completedAtSort === "ascending" })
        .then((result) => {
          setItems(result.items);
          setTotal(result.total);
        })
        .catch((reason: Error) => setError(reason.message))
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, page, completedAtSort]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const toggleCompletedAtSort = () => {
    setCompletedAtSort((value) => value === "ascending" ? "descending" : "ascending");
    setPage(1);
  };

  if (loading) {
    return <section className="panel workspace-state" role="status"><span className="metric-icon"><Icon id="i-file" /></span><strong>Loading reports</strong><span>Retrieving completed discrepancy reports…</span></section>;
  }

  if (error) {
    return <section className="panel workspace-state" role="alert"><span className="metric-icon"><Icon id="i-alert" /></span><strong>Couldn’t load reports</strong><span>{error}</span></section>;
  }

  return (
    <section className="panel reports-view">
      <div className="panel-head">
        <div className="panel-title">
          <h2>Verification reports</h2>
          <p>{total} completed discrepancy report{total === 1 ? "" : "s"}</p>
        </div>
      </div>
      <div className="table-scroll">
        <table className="case-table">
          <thead><tr><th>Sender / subject</th><th>Outcome</th><th>Mismatch fields</th><th><button type="button" className="table-sort-button" onClick={toggleCompletedAtSort} aria-label={`Sort by completed time ${completedAtSort === "ascending" ? "descending" : "ascending"}`} aria-sort={completedAtSort}>Completed <span aria-hidden="true" className="sort-indicator">{completedAtSort === "ascending" ? "↑" : "↓"}</span></button></th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.email_id} onClick={() => onOpen(item.email_id)}>
                <td><div className="sender-text"><strong>{item.sender}</strong><span>{item.subject || item.email_id}</span></div></td>
                <td><span className={`status ${item.report_type === "reviewed_escalation" ? "clear" : "mismatch"}`}>{outcome(item)}</span>{item.latest_resolution && <span className="report-resolution">{item.latest_resolution}</span>}</td>
                <td>{item.mismatch_count > 0 ? `${item.mismatch_count} field${item.mismatch_count === 1 ? "" : "s"}` : "—"}</td>
                <td className="report-date">{formatDate(item.completed_at)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={4} className="report-empty">
                <Icon id="i-file" />
                <strong>{search.trim() ? "No reports match your search" : "No completed discrepancy reports yet"}</strong>
                <span>{search.trim() ? "Try a different sender or case subject." : "Mismatches and resolved escalations will appear here."}</span>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {total > PAGE_SIZE && <div className="table-footer"><span>Showing {items.length} of {total} reports</span><div className="pagination"><button className="page" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>‹</button><span>{page} / {pageCount}</span><button className="page" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>›</button></div></div>}
    </section>
  );
}
