import { useState } from "react";
import type { ReviewQueueItem } from "../api";

const REASON_LABEL: Record<string, string> = {
  missing_value: "Missing value",
  missing_attachment: "Missing attachment",
  wrong_doc_type: "Wrong document type",
  unreadable: "Attachment unreadable",
};

interface ReviewQueueViewProps {
  items: ReviewQueueItem[];
  onOpen: (emailId: string) => void;
  onResolve: (emailId: string, resolution: string) => Promise<void>;
}

export function ReviewQueueView({ items, onOpen, onResolve }: ReviewQueueViewProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const pending = items.filter((item) => !item.resolved);
  const resolved = items.filter((item) => item.resolved);

  const submit = async (emailId: string) => {
    const resolution = (drafts[emailId] ?? "").trim();
    if (!resolution) return;
    setSubmitting(emailId);
    try {
      await onResolve(emailId, resolution);
      setDrafts((prev) => ({ ...prev, [emailId]: "" }));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">
          <h2>Human review queue</h2>
          <p>
            {pending.length} awaiting review · {resolved.length} resolved
          </p>
        </div>
      </div>
      <div className="table-scroll">
        <table className="case-table">
          <thead>
            <tr>
              <th>Case</th>
              <th>Reason</th>
              <th style={{ width: "38%" }}>Resolution</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((item) => (
              <tr key={item.email_id} onClick={() => onOpen(item.email_id)}>
                <td>
                  <div className="sender-text">
                    <strong>{item.subject || item.email_id}</strong>
                    <span>{item.email_id}</span>
                  </div>
                </td>
                <td>
                  <span className="status review">
                    {REASON_LABEL[item.reason ?? ""] ?? item.reason ?? "Needs review"}
                  </span>
                </td>
                <td onClick={(event) => event.stopPropagation()}>
                  <div className="resolve-form">
                    <input
                      className="resolve-input"
                      placeholder="Resolution notes…"
                      value={drafts[item.email_id] ?? ""}
                      onChange={(event) =>
                        setDrafts((prev) => ({ ...prev, [item.email_id]: event.target.value }))
                      }
                    />
                    <button
                      className="resolve-button"
                      disabled={submitting === item.email_id || !(drafts[item.email_id] ?? "").trim()}
                      onClick={() => submit(item.email_id)}
                    >
                      {submitting === item.email_id ? "Saving…" : "Resolve"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {resolved.map((item) => (
              <tr key={item.email_id} onClick={() => onOpen(item.email_id)}>
                <td>
                  <div className="sender-text">
                    <strong>{item.subject || item.email_id}</strong>
                    <span>{item.email_id}</span>
                  </div>
                </td>
                <td>
                  <span className="status clear">Resolved</span>
                </td>
                <td>
                  <span className="resolution-note">{item.resolution}</span>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={3} style={{ textAlign: "center", color: "var(--muted)", padding: "28px" }}>
                  Nothing needs review right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
