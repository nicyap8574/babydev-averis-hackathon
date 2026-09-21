import { expect, test } from "@playwright/test";

const report = {
  email_id: "email-report-1",
  subject: "Draft BL verification — Northwind",
  sender: "ops@example.com",
  report_type: "reviewed_escalation",
  verdict: "RESOLVED_AFTER_REVIEW",
  mismatches: [],
  status: "NEEDS_REVIEW",
  review_reason: "unreadable",
  field_comparison: [],
  attachments: [],
  completed_at: "2026-09-21T04:30:00.000Z",
};

test("opens a completed report and shows its reviewer history", async ({ page }, testInfo) => {
  await page.route(/\/rest\/v1\//, async (route) => {
    const url = route.request().url();
    const data = url.includes("verification_reports")
      ? (url.includes("email_id=eq.") ? report : [report])
      : url.includes("review_resolutions")
        ? [{ id: "resolution-1", email_id: report.email_id, resolution: "Confirmed after carrier follow-up", created_at: report.completed_at }]
        : [];
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "content-range": "0-0/1", "access-control-expose-headers": "content-range" },
      body: JSON.stringify(data),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Reports" }).click();
  await expect(page.getByRole("heading", { name: "Verification reports" })).toBeVisible();
  await expect(page.getByText("Draft BL verification — Northwind")).toBeVisible();
  await page.getByText("Draft BL verification — Northwind").click();
  await expect(page.getByRole("heading", { name: "Reviewer history" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Case details" }).getByText("Confirmed after carrier follow-up")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("reports-review-history.png"), fullPage: true });
});

test("sorts reports by completed time", async ({ page }, testInfo) => {
  const reports = [
    { ...report, email_id: "email-report-new", subject: "Newest report", completed_at: "2026-09-21T04:30:00.000Z" },
    { ...report, email_id: "email-report-old", subject: "Oldest report", completed_at: "2026-09-20T04:30:00.000Z" },
  ];
  await page.route(/\/rest\/v1\//, async (route) => {
    const url = route.request().url();
    const data = url.includes("verification_reports")
      ? (url.includes("order=completed_at.asc") ? [...reports].reverse() : reports)
      : [];
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "content-range": "0-1/2", "access-control-expose-headers": "content-range" },
      body: JSON.stringify(data),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Reports" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Newest report" })).toBeVisible();
  await page.getByRole("button", { name: "Sort by completed time ascending" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Oldest report" })).toHaveCount(1);
  await expect(page.locator("tbody tr").first()).toContainText("Oldest report");
  await expect(page.getByRole("button", { name: "Sort by completed time descending" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("reports-completed-sort.png"), fullPage: true });
});
