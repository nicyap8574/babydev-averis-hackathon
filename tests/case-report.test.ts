import assert from "node:assert/strict";
import test from "node:test";
import { buildCaseReport } from "../frontend/src/lib/caseReport.ts";

test("case report includes comparison data and escapes user-controlled text", () => {
  const report = buildCaseReport({
    id: "case-7",
    subject: "<script>alert('unsafe')</script>",
    from: "sender@example.com",
    category: "BL_COMPARISON",
    status: "MISMATCH",
    workflow_status: "classification_complete",
    last_error: null,
    attachments: [{ name: "draft <BL>.pdf", path: "case-7/draft.pdf", content_type: "application/pdf", size_bytes: 1024 }],
    review_reason: null,
    fields: [{ field: "consignee", label: "Consignee", si_value: "Northwind", bl_value: "<incorrect>", status: "mismatch" }],
    mismatches: ["consignee"],
  });

  assert.match(report, /DocWise case report/);
  assert.match(report, /1 mismatch detected/);
  assert.match(report, /draft &lt;BL&gt;\.pdf/);
  assert.match(report, /&lt;script&gt;alert\(&#39;unsafe&#39;\)&lt;\/script&gt;/);
  assert.match(report, /&lt;incorrect&gt;/);
  assert.doesNotMatch(report, /<script>alert\('unsafe'\)<\/script>/);
});

test("case report omits comparison table for a non-comparison case", () => {
  const report = buildCaseReport({
    id: "case-8",
    subject: "General update",
    from: "sender@example.com",
    category: "GENERAL",
    status: null,
    workflow_status: "classification_complete",
    last_error: null,
    attachments: [],
    review_reason: null,
    fields: [],
    mismatches: [],
  });

  assert.match(report, /Not applicable/);
  assert.doesNotMatch(report, /Document comparison/);
});

test("case report includes and escapes reviewer history", () => {
  const report = buildCaseReport({
    id: "case-9",
    subject: "Escalated case",
    from: "sender@example.com",
    category: "BL_COMPARISON",
    status: "NEEDS_REVIEW",
    workflow_status: "report_completed",
    last_error: null,
    attachments: [],
    review_reason: "unreadable",
    report_type: "reviewed_escalation",
    fields: [],
    mismatches: [],
    review_history: [{
      id: "resolution-1",
      reviewer_label: "Human reviewer",
      resolution: "Confirmed & <approved>",
      created_at: "2026-09-21T04:30:00.000Z",
    }],
  });

  assert.match(report, /Reviewer history/);
  assert.match(report, /Resolved after review/);
  assert.match(report, /Confirmed &amp; &lt;approved&gt;/);
  assert.doesNotMatch(report, /Confirmed & <approved>/);
});
