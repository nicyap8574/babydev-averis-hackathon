import { useMemo, useState } from "react";
import type { Category, EmailListItem, EmailStatus } from "../api";
import { CategoryPill, categoryLabel } from "./CategoryPill";
import { Select, MultiSelect } from "./Select";
import { Icon } from "./IconSprite";

interface CaseTableProps {
  emails: EmailListItem[];
  onOpen: (emailId: string) => void;
  search: string;
  showFilter?: boolean;
  paginate?: boolean;
  pageSize?: number;
  onViewMore?: () => void;
  /** Present only on tables that support archiving; omit to keep a table read-only. */
  onArchive?: (emailIds: string[], archived: boolean) => void;
  /** True when `emails` are already-archived cases, so actions restore instead of archive. */
  archived?: boolean;
  heading?: string;
  description?: string;
  emptyMessage?: string;
}

const STATUS_STYLE: Record<EmailStatus, { className: string; label: string }> = {
  OK: { className: "clear", label: "No mismatch" },
  MISMATCH: { className: "mismatch", label: "Mismatch found" },
  NEEDS_REVIEW: { className: "review", label: "Needs review" },
};

const CATEGORIES: Category[] = ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"];

export function CaseTable({
  emails,
  onOpen,
  search,
  showFilter = false,
  paginate = false,
  pageSize = 8,
  onViewMore,
  onArchive,
  archived = false,
  heading,
  description = "Document checks received across your shared inbox",
  emptyMessage,
}: CaseTableProps) {
  const [filter, setFilter] = useState<"all" | "mismatch" | "review">("all");
  const [categoryFilters, setCategoryFilters] = useState<Category[]>([]);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Ids for cases removed from `emails` (e.g. just archived elsewhere) fall out
  // here instead of lingering as a phantom selection count.
  const selected = useMemo(() => {
    const ids = new Set(emails.map((email) => email.id));
    return new Set([...selectedIds].filter((id) => ids.has(id)));
  }, [selectedIds, emails]);

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

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleSelected = visible.length > 0 && visible.every((email) => selected.has(email.id));
  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((email) => next.delete(email.id));
      else visible.forEach((email) => next.add(email.id));
      return next;
    });
  };

  const handleBulkArchive = () => {
    if (!onArchive || selected.size === 0) return;
    onArchive(Array.from(selected), !archived);
    setSelectedIds(new Set());
  };

  const actionLabel = archived ? "Restore" : "Archive";

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">
          <h2>{heading ?? (paginate ? "All cases" : "Recent cases")}</h2>
          <p>{description}</p>
        </div>
        <div className="panel-head-controls">
          {onArchive && selected.size > 0 && (
            // Inline, in the same row as the filters, so selecting rows never
            // shifts the table down — a separate full-width bar used to do
            // exactly that.
            <div className="selection-chip">
              <span>{selected.size} selected</span>
              <button className="text-button" onClick={() => setSelectedIds(new Set())}>
                Clear
              </button>
              <button className="secondary-button selection-chip-action" onClick={handleBulkArchive}>
                <Icon id={archived ? "i-refresh" : "i-archive"} />
                {actionLabel}
              </button>
            </div>
          )}
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
        <table className={`case-table${onArchive ? " selectable" : ""}`}>
          <thead>
            <tr>
              {onArchive && (
                <th className="col-select">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label="Select all visible cases"
                  />
                </th>
              )}
              <th className="col-sender">Sender / subject</th>
              <th className="col-id">Case ID</th>
              <th className="col-category">Category</th>
              <th className="col-status">Status</th>
              {onArchive && <th className="col-actions" />}
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
                  {onArchive && (
                    <td className="col-select" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(email.id)}
                        onChange={() => toggleOne(email.id)}
                        aria-label={`Select case ${email.id}`}
                      />
                    </td>
                  )}
                  <td className="col-sender">
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
                  {onArchive && (
                    <td className="col-actions" onClick={(event) => event.stopPropagation()}>
                      <button
                        className="row-action-btn"
                        title={`${actionLabel} case`}
                        aria-label={`${actionLabel} case ${email.id}`}
                        onClick={() => onArchive([email.id], !archived)}
                      >
                        <Icon id={archived ? "i-refresh" : "i-archive"} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={onArchive ? 6 : 4} style={{ textAlign: "center", color: "var(--muted)", padding: "28px" }}>
                  {emails.length === 0
                    ? (emptyMessage ?? "No cases yet. Select New case to get started.")
                    : "No cases match your search."}
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
