import { useRef, useState } from "react";
import { Icon } from "./IconSprite";
import type { CaseAttachment, EmailDetail } from "../api";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
import { printCaseReport } from "../lib/caseReport";

interface CaseModalProps {
  open: boolean;
  detail: EmailDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

const REVIEW_REASON_LABEL: Record<string, string> = {
  missing_value: "Missing value",
  missing_attachment: "Missing attachment",
  wrong_doc_type: "Wrong document type",
  unreadable: "Attachment unreadable",
};

function caseLabel(id: string): string {
  const match = id.match(/(\d+)\s*$/);
  return match ? `Case #${match[1]}` : id;
}

function flash(node: HTMLElement | null) {
  if (!node) return;
  node.scrollIntoView({ behavior: "smooth", block: "center" });
  node.animate(
    [{ backgroundColor: "#fff0ed" }, { backgroundColor: "#ffd7d1" }, { backgroundColor: "#fff0ed" }],
    { duration: 800 },
  );
}

export function CaseModal({ open, detail, loading, error, onClose }: CaseModalProps) {
  const [docTab, setDocTab] = useState<"si" | "bl">("bl");
  const [previewAttachment, setPreviewAttachment] = useState<CaseAttachment | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const paperRefs = useRef<Record<string, HTMLElement | null>>({});

  if (!open) return null;

  const mismatchCount = detail?.mismatches.length ?? 0;
  const isComparison = detail?.category === "BL_COMPARISON";
  const hasFieldData = detail?.fields.some((f) => f.si_value !== null || f.bl_value !== null) ?? false;
  const showComparison = isComparison && hasFieldData;

  const verdictClass = !detail
    ? ""
    : detail.report_type === "reviewed_escalation"
      ? "clear"
    : !isComparison
      ? "muted"
      : detail.status === "OK"
        ? "clear"
        : detail.status === "NEEDS_REVIEW"
          ? "review"
          : "";
  const verdictText = !detail
    ? ""
    : detail.report_type === "reviewed_escalation"
      ? "Resolved after review"
    : isComparison && !detail.status
      ? "Waiting for document comparison"
    : !isComparison
      ? "Not applicable"
      : detail.status === "OK"
        ? "No mismatches detected"
        : detail.status === "NEEDS_REVIEW"
          ? REVIEW_REASON_LABEL[detail.review_reason ?? ""] ?? "Needs review"
          : `${mismatchCount} mismatch${mismatchCount === 1 ? "" : "es"} detected`;
  const headline = !detail
    ? ""
    : detail.report_type === "reviewed_escalation"
      ? "Human review completed"
    : detail.workflow_status === "classification_failed"
      ? "Classification could not complete"
    : isComparison && !detail.status
      ? "Case received; comparison is pending"
    : !isComparison
      ? `Classified as ${detail.category.replace(/_/g, " ").toLowerCase()}`
      : detail.status === "OK"
        ? "Documents match"
        : detail.status === "NEEDS_REVIEW"
          ? "Comparison could not be completed"
        : "Booking documents require attention";

  const closeCase = () => {
    setPreviewAttachment(null);
    setExportError(null);
    onClose();
  };

  const exportReport = () => {
    if (!detail) return;
    setExportError(printCaseReport(detail) ? null : "Your browser blocked the report window. Allow popups and try again.");
  };

  return (
    <div className="modal-backdrop open" role="dialog" aria-modal="true" aria-label="Case details" onClick={(e) => { if (e.target === e.currentTarget) closeCase(); }}>
      <div className="modal">
        <header className="modal-header">
          <div className="modal-title-row">
            <button className="back-button" onClick={closeCase} aria-label="Close case">
              <Icon id="i-arrow" />
            </button>
            <div>
              <h2>{detail ? caseLabel(detail.id) : "Loading…"}</h2>
              <p>{detail ? `${detail.id} · ${detail.category.replace(/_/g, " ")} · ${detail.from}` : ""}</p>
            </div>
          </div>
          <div className="modal-actions">
            <button className="primary-button" disabled={!detail || loading} onClick={exportReport}>
              <Icon id="i-file" />
              <span>Export report</span>
            </button>
          </div>
        </header>

        {loading && <div style={{ padding: 40 }}>Loading comparison…</div>}
        {error && <div style={{ padding: 40, color: "var(--red)" }}>{error}</div>}

        {detail && !loading && !error && (
          <div className={`case-layout${showComparison ? "" : " single"}`}>
            <section className="panel case-summary">
              <div className="summary-top">
                <div>
                  <p className="eyebrow">{detail.subject}</p>
                  <h3>{headline}</h3>
                  <p>
                    {detail.from}
                    <br />
                    {isComparison
                      ? "Shipping instruction is used as the reference document for all comparisons."
                      : "Only BL comparison emails are checked against a shipping instruction."}
                  </p>
                </div>
                <div className={`verdict ${verdictClass}`}>
                  <span>Final verdict</span>
                  <strong>{verdictText}</strong>
                </div>
              </div>

              {detail.attachments.length > 0 && (
                <div className="case-attachments">
                  <strong>Attached files</strong>
                  <ul>{detail.attachments.map((attachment) => (
                    <li key={attachment.path}>
                      <button className="attachment-preview-button" onClick={() => setPreviewAttachment(attachment)}>
                        <Icon id="i-eye" />
                        {attachment.name}
                      </button>
                    </li>
                  ))}</ul>
                </div>
              )}

              {detail.review_history && detail.review_history.length > 0 && (
                <section className="review-history" aria-label="Reviewer history">
                  <h4>Reviewer history</h4>
                  <ol>
                    {detail.review_history.map((entry) => (
                      <li key={entry.id}>
                        <span className="review-history-dot"><Icon id="i-check" /></span>
                        <div>
                          <strong>{entry.reviewer_label}</strong>
                          <p>{entry.resolution}</p>
                          <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {exportError && <p className="form-error" role="alert">{exportError}</p>}

              {showComparison ? (
                <>
                  <div className="compare-head">
                    <span>Field</span>
                    <span>Shipping instruction</span>
                    <span>Bill of lading</span>
                    <span>Result</span>
                  </div>

                  {detail.fields.map((field) => (
                    <div key={field.field} className={`compare-row${field.status === "mismatch" ? " alert" : ""}`}>
                      <div className="field-name">{field.label}</div>
                      <div className="doc-value">
                        {field.si_value ?? "—"}
                        <button onClick={() => flash(paperRefs.current[field.field])} aria-label={`Focus ${field.label} in evidence`}>
                          <Icon id="i-eye" />
                        </button>
                      </div>
                      <div className="doc-value">
                        {field.status === "mismatch" ? (
                          <strong style={{ color: "var(--red)" }}>{field.bl_value ?? "—"}</strong>
                        ) : (
                          field.bl_value ?? "—"
                        )}
                        <button onClick={() => flash(paperRefs.current[field.field])} aria-label={`Focus ${field.label} in evidence`}>
                          <Icon id="i-eye" />
                        </button>
                      </div>
                      <span className={`result-badge ${field.status === "match" ? "match" : "diff"}`}>
                        {field.status === "match" ? "Match" : "Mismatch"}
                      </span>
                    </div>
                  ))}

                  <div className="explanation">
                    <Icon id="i-info" />
                    <div>
                      <strong>The model never decides the result.</strong> Fields are extracted from the
                      attachment text with regex label matching, then compared with deterministic
                      normalization rules (numeric for weight/count, text otherwise) — this verdict comes
                      from that comparison, not a language model.
                    </div>
                  </div>
                </>
              ) : (
                <div className="unavailable-panel">
                  <span className="metric-icon">
                    <Icon id="i-info" />
                  </span>
                  <strong>
                    {detail.workflow_status === "classification_failed"
                      ? "Case is saved; classification needs attention"
                      : isComparison
                        ? (detail.status ? "No attachment data available" : "Comparison not yet run")
                        : "No document comparison for this category"}
                  </strong>
                  <span>
                    {detail.workflow_status === "classification_failed"
                      ? detail.last_error ?? "The classifier could not process this case. Check provider secrets and function logs."
                      : isComparison
                      ? detail.status
                        ? "The SI/BL attachment pair for this email is missing or couldn't be read, so field-by-field comparison couldn't run."
                        : `Classification is ${detail.workflow_status.replace(/_/g, " ")}. Document comparison still needs to be connected to the hosted processing service.`
                      : "Only emails classified as BL comparison are checked field-by-field against a shipping instruction."}
                  </span>
                </div>
              )}
            </section>

            {showComparison && (
              <aside className="panel evidence-panel" id="evidencePanel">
                <div className="evidence-panel-body">
                  <div className="evidence-head">
                    <h3>Source evidence</h3>
                    <div className="doc-tabs">
                      <button className={`doc-tab${docTab === "si" ? " active" : ""}`} onClick={() => setDocTab("si")}>
                        SI
                      </button>
                      <button className={`doc-tab${docTab === "bl" ? " active" : ""}`} onClick={() => setDocTab("bl")}>
                        Bill of lading
                      </button>
                    </div>
                  </div>
                  <div className="document-stage">
                    <div className="paper">
                      <div className="paper-title">
                        {docTab === "si" ? "SHIPPING INSTRUCTION" : "BILL OF LADING"}
                      </div>
                      <div className="paper-sub">
                        {docTab === "si" ? "SHIPPER-SUBMITTED DOCUMENT" : "CARRIER-ISSUED DOCUMENT"}
                      </div>
                      <div className="paper-rule" />
                      <div className="paper-grid">
                        {detail.fields.map((field) => {
                          const value = docTab === "si" ? field.si_value : field.bl_value;
                          const isMismatch = field.status === "mismatch";
                          return (
                            <div
                              className="paper-cell"
                              key={field.field}
                              ref={(node) => {
                                paperRefs.current[field.field] = node;
                              }}
                            >
                              <span className="paper-label">{field.label}</span>
                              {isMismatch ? (
                                <span className="paper-highlight">
                                  <span className="highlight-tag">Mismatch evidence</span>
                                  {value ?? "—"}
                                </span>
                              ) : (
                                value ?? "—"
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="evidence-foot">
                    <span>Extracted from attachment text</span>
                    <span className="source-verified">
                      <Icon id="i-check" />
                      Regex-matched
                    </span>
                  </div>
                </div>
              </aside>
            )}
          </div>
        )}
      </div>
      {previewAttachment && detail && (
        <AttachmentPreviewModal
          key={previewAttachment.path}
          attachment={previewAttachment}
          attachments={detail.attachments}
          onClose={() => setPreviewAttachment(null)}
          onSelect={setPreviewAttachment}
        />
      )}
    </div>
  );
}
