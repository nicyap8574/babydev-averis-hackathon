/** Captures the surfaces touched by the UI pass and asserts the measurable
 *  parts of them, so the screenshots are a review aid rather than the check.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

const SHOTS = "artifacts/ui";

const EMAILS = [
  {
    email_id: "email_001",
    subject: "TO CONFIRM DOCS _ 5RSG-00133 _ CALLAO_PERU _ MOORIM SP CO., LTD",
    sender: "aziztz@safqa.co.ke",
    category: "comparison_request",
    status: "OK",
    workflow_status: "classification_complete",
  },
  {
    email_id: "email_005",
    subject: "RE_ Draft BL INDO SUKSES 65 V.51NW1 SINGAPORE - amend BL 057",
    sender: "hanna_azhari@aprilasia.com",
    category: "comparison_request",
    status: "MISMATCH",
    workflow_status: "classification_complete",
  },
];

async function stub(page: Page) {
  const json = (route: Route, body: unknown) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

  await page.route("**/rest/v1/inbox_records**", (route) => json(route, EMAILS));
  await page.route("**/rest/v1/review_queue_items**", (route) => json(route, []));
  await page.route("**/rest/v1/**", (route) => json(route, []));
  await page.route("**/storage/v1/**", (route) => json(route, { Key: "ok" }));
  await page.route("**/functions/v1/**", (route) =>
    json(route, { category: "comparison_request", continue_to_extraction: true }));
  await page.route("**/api/compare", (route) => json(route, { status: "OK" }));
}

async function ready(page: Page) {
  await stub(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Test a case" })).toBeVisible();
  await page.waitForTimeout(300); // let the fade-in settle before capturing
}

const TABLE_EMAILS = Array.from({ length: 3 }, (_, index) => ({
  email_id: `email_${index + 1}`.padStart(9, "0"),
  subject: `Sample subject ${index + 1}`,
  sender: `sender${index + 1}@example.com`,
  category: "comparison_request",
  status: "OK",
  workflow_status: "classification_complete",
  archived: false,
}));

async function stubInbox(page: Page) {
  const json = (route: Route, body: unknown) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  // Playwright resolves the most-recently-registered matching route first, so
  // the catch-all must be added before the specific overrides, not after.
  await page.route("**/rest/v1/**", (route) => json(route, []));
  await page.route("**/rest/v1/inbox_records**", (route) => json(route, TABLE_EMAILS));
}

test("checkbox column sits close to the next column, and selecting rows does not shift the table", async ({ page }) => {
  await stubInbox(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Inbox" }).click();
  await expect(page.locator(".case-table tbody tr").first()).toBeVisible();
  await page.waitForTimeout(200); // let webfonts/layout settle before the baseline read

  const table = page.locator(".case-table");
  const tableTopBefore = (await table.boundingBox())!.y;

  const headerCheckboxCell = page.locator(".case-table th.col-select").first();
  const firstCheckboxCell = page.locator(".case-table td.col-select").first();
  for (const cell of [headerCheckboxCell, firstCheckboxCell]) {
    const cellBox = (await cell.boundingBox())!;
    const checkboxBox = (await cell.locator("input").boundingBox())!;
    const leftInset = checkboxBox.x - cellBox.x;
    const rightInset = cellBox.x + cellBox.width - (checkboxBox.x + checkboxBox.width);
    console.log("checkbox left/right inset (px)", leftInset, rightInset);
    // The checkbox is centered within its own column, not pinned to either edge.
    expect(Math.abs(leftInset - rightInset), "checkbox should be horizontally centered in its column").toBeLessThan(1);
    expect(leftInset, "the column itself should stay narrow, not a wide gutter").toBeLessThan(20);
  }

  await page.locator(".case-table tbody tr").first().locator('input[type="checkbox"]').click();
  const chip = page.locator(".selection-chip");
  await expect(chip).toBeVisible();
  await expect(chip).toContainText("1 selected"); // settled, not mid-transition

  const tableTopAfter = (await table.boundingBox())!.y;
  expect(
    Math.abs(tableTopAfter - tableTopBefore),
    "selecting a row must not shift the table down",
  ).toBeLessThan(1);

  await page.locator(".panel-head").screenshot({ path: `${SHOTS}/case-table-selection.png` });
  await page.locator(".case-table thead").screenshot({ path: `${SHOTS}/case-table-checkbox-header.png` });
  await page.locator(".panel").first().screenshot({ path: `${SHOTS}/case-table-full.png` });

  // Dark theme — same components, verify the checkbox/chip tokens still read correctly.
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await page.waitForTimeout(150);
  await page.locator(".panel").first().screenshot({ path: `${SHOTS}/case-table-full-dark.png` });
});

test("top action row controls share one height", async ({ page }) => {
  await ready(page);

  const heights: Record<string, number> = {};
  for (const [label, locator] of [
    ["search", page.locator(".search input")],
    ["uploadBatch", page.getByRole("button", { name: "Upload batch" })],
    ["testCase", page.getByRole("button", { name: "Test a case" })],
  ] as const) {
    heights[label] = (await locator.boundingBox())!.height;
  }

  await page.locator(".top-actions").screenshot({ path: `${SHOTS}/top-actions.png` });
  console.log("top-action heights", heights);

  const unique = new Set(Object.values(heights));
  expect(unique.size, `heights differ: ${JSON.stringify(heights)}`).toBe(1);
});

test("zoomed capture of the top action row", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 4 });
  const page = await context.newPage();
  await ready(page);
  await page.locator(".top-actions").screenshot({ path: `${SHOTS}/zoom-actions.png` });
  await context.close();
});

test("the logo has no drop shadow", async ({ page }) => {
  await ready(page);
  const shadow = await page.locator(".brand-mark").evaluate((node) => getComputedStyle(node).boxShadow);
  await page.locator(".brand-home").screenshot({ path: `${SHOTS}/brand.png` });
  expect(shadow).toBe("none");
});

test("not-allowed is reserved for unimplemented controls", async ({ page }) => {
  await stubInbox(page);
  // The case detail modal's own routing, independent of the list.
  await page.route("**/rest/v1/inbox_records**", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("email_id")?.includes("eq.")) {
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ ...TABLE_EMAILS[0], attachments: [], defect_fields: [], field_comparison: [] }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TABLE_EMAILS) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Inbox" }).click();
  await page.locator(".case-table tbody tr").first().click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByText("Audit trail")).toBeVisible();

  const cursorOf = (selector: string) =>
    page.locator(selector).first().evaluate((node) => getComputedStyle(node).cursor);

  // Unimplemented: Audit trail / Export report have no feature behind them yet.
  expect(await cursorOf(".not-implemented")).toBe("not-allowed");
  // Implemented, merely inapplicable on this view.
  expect(await cursorOf(".search input")).not.toBe("not-allowed");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Upload batch" }).click();
  const dialog = page.getByRole("dialog", { name: "Upload a batch" });
  // Start ingest is disabled only because no file is chosen yet.
  const start = dialog.getByRole("button", { name: "Start ingest" });
  await expect(start).toBeDisabled();
  expect(await start.evaluate((node) => getComputedStyle(node).cursor)).not.toBe("not-allowed");
  await page.locator(".modal").screenshot({ path: `${SHOTS}/batch-empty.png` });
});

test("start ingest is replaced by Done once a batch finishes", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Upload batch" }).click();
  const dialog = page.getByRole("dialog", { name: "Upload a batch" });

  const { zipSync } = await import("fflate");
  const encode = (value: string) => new TextEncoder().encode(value);
  await dialog.locator("input[type=file]").setInputFiles({
    name: "bundle.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync({
      "inbox/email_001.json": encode(JSON.stringify({
        email_id: "email_001", from: "a@b.com", subject: "S", body: "B",
        attachments: ["attachments/email_001_SI.txt"],
      })),
      "attachments/email_001_SI.txt": encode("SHIPPING INSTRUCTION"),
    })),
  });
  await dialog.getByRole("button", { name: "Start ingest" }).click();

  await expect(dialog.getByText("1 of 1 email ingested.")).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByRole("button", { name: "Start ingest" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Cancel" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Done" })).toBeVisible();
  await page.locator(".modal").screenshot({ path: `${SHOTS}/batch-done.png` });
});

test("picking files twice keeps both", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Test a case" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a case" });
  const input = dialog.locator("input[type=file]");

  await input.setInputFiles({ name: "email_001_SI.txt", mimeType: "text/plain", buffer: Buffer.from("SHIPPING INSTRUCTION") });
  await expect(dialog.locator(".picked-files li")).toHaveCount(1);

  await input.setInputFiles({ name: "email_001_BL.txt", mimeType: "text/plain", buffer: Buffer.from("BILL OF LADING") });
  await expect(dialog.locator(".picked-files li")).toHaveCount(2);
  await expect(dialog.getByText("2 files selected")).toBeVisible();

  // The same file picked again is not added twice.
  await input.setInputFiles({ name: "email_001_BL.txt", mimeType: "text/plain", buffer: Buffer.from("BILL OF LADING") });
  await expect(dialog.locator(".picked-files li")).toHaveCount(2);

  await page.locator(".modal").screenshot({ path: `${SHOTS}/new-case-files.png` });

  await dialog.getByRole("button", { name: "Remove email_001_SI.txt" }).click();
  await expect(dialog.locator(".picked-files li")).toHaveCount(1);
});

test("a non-comparison category is explained, not reported as success", async ({ page }) => {
  // Correct behaviour: the classifier reads intent from the text, so an email
  // that does not read as a comparison request gets no verdict. The modal has
  // to say so — closing on a success toast is what made this look broken.
  await ready(page);
  let compared = false;
  await page.unroute("**/functions/v1/**");
  await page.unroute("**/api/compare");
  await page.route("**/functions/v1/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ category: "general_message", continue_to_extraction: false }),
    }));
  await page.route("**/api/compare", (route) => {
    compared = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.getByRole("button", { name: "Test a case" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a case" });
  await dialog.getByLabel("Subject").fill("test");
  await dialog.getByLabel("Sender").fill("ops@example.com");
  await dialog.getByLabel("Email message").fill("please check");
  await dialog.locator("input[type=file]").setInputFiles([
    { name: "email_001_SI.txt", mimeType: "text/plain", buffer: Buffer.from("SHIPPING INSTRUCTION") },
    { name: "email_001_BL.txt", mimeType: "text/plain", buffer: Buffer.from("BILL OF LADING") },
  ]);
  await dialog.getByRole("button", { name: "Create case" }).click();

  const notice = dialog.locator(".form-notice");
  await expect(notice).toBeVisible({ timeout: 15_000 });
  await expect(notice).toContainText("classified as General");
  await expect(dialog).toBeVisible();          // stays open so the notice is readable
  await expect(page.locator(".toast.show")).toHaveCount(0);
  // The case exists now, so the create action must not be offered again.
  await expect(dialog.getByRole("button", { name: "Create case" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Done" })).toBeVisible();
  expect(compared, "/api/compare must not be called for a non-comparison case").toBe(false);

  await page.locator(".modal").screenshot({ path: `${SHOTS}/new-case-not-comparison.png` });
});

test("reopening a modal starts from a blank form", async ({ page }) => {
  await ready(page);

  await page.getByRole("button", { name: "Test a case" }).click();
  let dialog = page.getByRole("dialog", { name: "Create a case" });
  await dialog.getByLabel("Subject").fill("abu");
  await dialog.locator("input[type=file]").setInputFiles({
    name: "email_044_SI.txt", mimeType: "text/plain", buffer: Buffer.from("SHIPPING INSTRUCTION"),
  });
  await expect(dialog.locator(".picked-files li")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Test a case" }).click();
  dialog = page.getByRole("dialog", { name: "Create a case" });
  await expect(dialog.getByLabel("Subject")).toHaveValue("");
  await expect(dialog.locator(".picked-files li")).toHaveCount(0);
  await expect(dialog.getByText("No files selected")).toBeVisible();

  // Same for the batch modal's chosen archive.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Upload batch" }).click();
  let batch = page.getByRole("dialog", { name: "Upload a batch" });
  await batch.locator("input[type=file]").setInputFiles({
    name: "bundle.zip", mimeType: "application/zip", buffer: Buffer.from("x"),
  });
  await expect(batch.getByText("bundle.zip")).toBeVisible();
  await batch.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Upload batch" }).click();
  batch = page.getByRole("dialog", { name: "Upload a batch" });
  await expect(batch.getByText("No archive selected")).toBeVisible();
});

test("the sample email fills fields the classifier reads as a comparison", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Test a case" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a case" });

  await dialog.getByRole("button", { name: "Use a sample comparison email" }).click();
  await expect(dialog.getByLabel("Subject")).toHaveValue(/draft BL check/);
  await expect(dialog.getByLabel("Email message")).toHaveValue(/compare the SI against the draft BL/);
  await page.locator(".modal").screenshot({ path: `${SHOTS}/new-case-sample.png` });
});

test("a manual case classifies and compares without extra steps", async ({ page }) => {
  await ready(page);
  const calls: string[] = [];
  await page.unroute("**/functions/v1/**");
  await page.unroute("**/api/compare");
  await page.route("**/functions/v1/**", (route) => {
    calls.push("classify");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ category: "comparison_request", continue_to_extraction: true }),
    });
  });
  await page.route("**/api/compare", (route) => {
    calls.push("compare");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "OK" }) });
  });

  await page.getByRole("button", { name: "Test a case" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a case" });
  await dialog.getByLabel("Subject").fill("Please confirm the draft BL against the SI");
  await dialog.getByLabel("Sender").fill("ops@example.com");
  await dialog.getByLabel("Email message").fill("Attached are the SI and draft BL for checking.");
  await dialog.locator("input[type=file]").setInputFiles([
    { name: "email_001_SI.txt", mimeType: "text/plain", buffer: Buffer.from("SHIPPING INSTRUCTION") },
    { name: "email_001_BL.txt", mimeType: "text/plain", buffer: Buffer.from("BILL OF LADING") },
  ]);
  await dialog.getByRole("button", { name: "Create case" }).click();

  // The modal closes only on a fully successful create, and the toast element
  // is always mounted — `.show` is what actually signals success.
  await expect(page.locator(".toast.show")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".toast.show")).toContainText("comparison complete");
  await expect(dialog).toHaveCount(0);
  expect(calls).toEqual(["classify", "compare"]);
});
