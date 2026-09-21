import type { EmailDetail } from "../api";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function text(value: string | null | undefined): string {
  return escapeHtml(value || "—");
}

function titleCase(value: string): string {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function verdict(detail: EmailDetail): string {
  if (detail.report_type === "reviewed_escalation") return "Resolved after review";
  if (detail.category !== "BL_COMPARISON") return "Not applicable";
  if (!detail.status) return "Comparison pending";
  if (detail.status === "OK") return "No mismatches detected";
  if (detail.status === "NEEDS_REVIEW") return titleCase(detail.review_reason ?? "Needs review");
  return `${detail.mismatches.length} mismatch${detail.mismatches.length === 1 ? "" : "es"} detected`;
}

export function buildCaseReport(detail: EmailDetail): string {
  const fields = detail.fields.length === 0
    ? ""
    : `<section><h2>Document comparison</h2><table><thead><tr><th>Field</th><th>Shipping instruction</th><th>Bill of lading</th><th>Result</th></tr></thead><tbody>${detail.fields.map((field) => `<tr class="${field.status === "mismatch" ? "mismatch" : ""}"><td>${escapeHtml(field.label)}</td><td>${text(field.si_value)}</td><td>${text(field.bl_value)}</td><td>${escapeHtml(titleCase(field.status))}</td></tr>`).join("")}</tbody></table></section>`;
  const attachments = detail.attachments.length === 0
    ? "<li>No attachments</li>"
    : detail.attachments.map((attachment) => `<li>${escapeHtml(attachment.name)}</li>`).join("");
  const history = !detail.review_history?.length
    ? ""
    : `<section><h2>Reviewer history</h2><ul>${detail.review_history.map((entry) => `<li><strong>${escapeHtml(entry.reviewer_label)}</strong> — ${escapeHtml(entry.resolution)} <span class="muted">(${escapeHtml(new Date(entry.created_at).toLocaleString())})</span></li>`).join("")}</ul></section>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>DocWise report — ${escapeHtml(detail.id)}</title><style>
    @page { margin: 18mm; } body { color: #172033; font: 14px/1.5 Arial, sans-serif; } header { border-bottom: 2px solid #2563eb; margin-bottom: 24px; padding-bottom: 14px; } h1 { margin: 0; font-size: 26px; } h2 { margin: 28px 0 10px; font-size: 17px; } .muted { color: #667895; } .meta { display: grid; grid-template-columns: 150px 1fr; gap: 6px 18px; } .verdict { margin-top: 18px; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; } table { width: 100%; border-collapse: collapse; } th, td { padding: 9px; border: 1px solid #cbd5e1; text-align: left; vertical-align: top; } th { background: #eff6ff; } .mismatch { background: #fff1f2; } footer { margin-top: 28px; color: #667895; font-size: 11px; } @media print { body { print-color-adjust: exact; } }
  </style></head><body><header><h1>DocWise case report</h1><div class="muted">Generated ${escapeHtml(new Date().toLocaleString())}</div></header><section class="meta"><strong>Case ID</strong><span>${escapeHtml(detail.id)}</span><strong>Subject</strong><span>${escapeHtml(detail.subject)}</span><strong>Sender</strong><span>${escapeHtml(detail.from)}</span><strong>Category</strong><span>${escapeHtml(titleCase(detail.category))}</span><strong>Workflow status</strong><span>${escapeHtml(titleCase(detail.workflow_status))}</span></section><section class="verdict"><strong>Final verdict</strong><br>${escapeHtml(verdict(detail))}</section><section><h2>Attached files</h2><ul>${attachments}</ul></section>${fields}${history}<footer>Comparison outcomes are produced by deterministic field normalization and comparison rules.</footer></body></html>`;
}

export function printCaseReport(detail: EmailDetail): boolean {
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) return false;
  reportWindow.document.write(buildCaseReport(detail));
  reportWindow.document.close();
  reportWindow.focus();
  window.setTimeout(() => reportWindow.print(), 150);
  return true;
}
