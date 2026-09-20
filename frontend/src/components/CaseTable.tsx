import { useMemo, useState } from "react";
import type { Category, EmailListItem, EmailStatus } from "../api";
import { CategoryPill, categoryLabel } from "./CategoryPill";
import { Select, MultiSelect } from "./Select";

interface CaseTableProps {
  emails: EmailListItem[];
  onOpen: (emailId: string) => void;
  search: string;
  showFilter?: boolean;
  paginate?: boolean;
  pageSize?: number;
  onViewMore?: () => void;
}

const STATUS_STYLE: Record<EmailStatus, { className: string; label: string }> = {
  OK: { className: "clear", label: "No mismatch" },
  MISMATCH: { className: "mismatch", label: "Mismatch found" },
  NEEDS_REVIEW: { className: "review", label: "Needs review" },
};

const CATEGORIES: Category[] = ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"];

export function CaseTable({ emails, onOpen, search, showFilter = false, paginate = false, pageSize = 8, onViewMore }: CaseTableProps) {
  const [filter, setFilter] = useState<"all" | "mismatch" | "review">("all");
  const [categoryFilters, setCategoryFilters] = useState<Category[]>([]);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return emails.filter((email) => {
      if (showFilter) {
        if (filter === "mismatch" && email.status !== "MISMATCH") return false;
        if (filter === "review" && email.status !== "NEEDS_REVIEW") return false;
        if (categoryFilters.length > 0 && !categoryFilters.includes(email.classification)) return false;
      }
      if (!q) return true;
      return (
        email.subject.toLowerCase().includes(q) ||
        email.from.toLowerCase().includes(q) ||
        email.id.toLowerCase().includes(q)
      );
    });
  }, [emails, search, filter, categoryFilters, showFilter]);

  const pageCount = paginate ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  const currentPage = Math.min(page, pageCount);
  const visible = paginate
    ? filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : filtered.slice(0, pageSize);

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">
          <h2>{paginate ? "All cases" : "Recent cases"}</h2>
          <p>Document checks received across your shared inbox</p>
        </div>
        <div className="panel-head-controls">
          {showFilter && (
            <>
              <Select
                options={[
                  { value: "all", label: "All" },
                  { value: "mismatch", label: "Mismatch" },
                  { value: "review", label: "Review" },
                ]}
                value={filter}
                onChange={(next) => {
                  setFilter(next);
                  setPage(1);
                }}
                ariaLabel="Filter by status"
              />
              <MultiSelect
                options={CATEGORIES.map((category) => ({ value: category, label: categoryLabel(category) }))}
                values={categoryFilters}
                onChange={(next) => {
                  setCategoryFilters(next);
                  setPage(1);
                }}
                placeholder="All categories"
                ariaLabel="Filter by category"
              />
            </>
          )}
        </div>
      </div>
      <div className="table-scroll">
        <table className="case-table">
          <thead>
            <tr>
              <th>Sender / subject</th>
              <th>Case ID</th>
              <th>Category</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((email) => {
              const style = email.status
                ? STATUS_STYLE[email.status]
                : email.workflow_status === "classification_failed"
                  ? { className: "review", label: "Classification failed" }
                  : email.workflow_status === "classifying"
                    ? { className: "review", label: "Classifying" }
                    : email.classification === "BL_COMPARISON"
                      ? { className: "review", label: "Awaiting comparison" }
                      : { className: "muted", label: "Not compared" };
              return (
                <tr key={email.id} onClick={() => onOpen(email.id)}>
                  <td>
                    <div className="sender">
                      <div className="sender-text">
                        <strong>{email.from}</strong>
                        <span>{email.subject}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="case-id">{email.id}</span>
                  </td>
                  <td>
                    <CategoryPill category={email.classification} />
                  </td>
                  <td>
                    <span className={`status ${style.className}`}>{style.label}</span>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: "28px" }}>
                  {emails.length === 0 ? "No cases yet. Select New case to get started." : "No cases match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>
          Showing {visible.length} of {filtered.length} cases
        </span>
        {paginate ? (
          <div className="pagination">
            <button
              className="page"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹
            </button>
            {Array.from({ length: pageCount }, (_, i) => i + 1)
              .slice(Math.max(0, currentPage - 3), Math.max(0, currentPage - 3) + 5)
              .map((n) => (
                <button
                  key={n}
                  className={`page${n === currentPage ? " active" : ""}`}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ))}
            <button
              className="page"
              disabled={currentPage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              ›
            </button>
          </div>
        ) : (
          onViewMore && (
            <button className="text-button" onClick={onViewMore}>
              View all →
            </button>
          )
        )}
      </div>
    </section>
  );
}
