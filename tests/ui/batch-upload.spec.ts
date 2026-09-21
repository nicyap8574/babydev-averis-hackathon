/** Drives the batch upload modal against a stubbed backend.
 *
 * Every Supabase and /api/compare call is intercepted, so this exercises the
 * wiring unit tests cannot reach — file input to progress bar to summary to
 * dashboard refresh — without writing to a real workspace.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FIXTURE = path.join(ROOT, "testing-sdoc-hackathon-bundle");

/** Two emails is enough to prove the loop: one .txt pair and one .xlsx pair.
 *  Running the full corpus through these specs buys nothing. */
const EMAILS = ["email_001", "email_005"];

function bundleZip(): Buffer {
  const files: Record<string, Uint8Array> = {};
  for (const folder of ["inbox", "attachments"]) {
    for (const name of fs.readdirSync(path.join(FIXTURE, folder))) {
      if (!EMAILS.some((id) => name.startsWith(id))) continue;
      files[`testing-sdoc-hackathon-bundle/${folder}/${name}`] =
        new Uint8Array(fs.readFileSync(path.join(FIXTURE, folder, name)));
    }
  }
  return Buffer.from(zipSync(files));
}

interface Calls {
  uploads: string[];
  classify: Array<Record<string, unknown>>;
  compare: string[];
}

async function stubBackend(page: Page): Promise<Calls> {
  const calls: Calls = { uploads: [], classify: [], compare: [] };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

  await page.route("**/storage/v1/object/case-attachments/**", async (route) => {
    calls.uploads.push(decodeURIComponent(new URL(route.request().url()).pathname.split("case-attachments/")[1]));
    await json(route, { Key: "ok" });
  });

  await page.route("**/functions/v1/identify-document-request", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    calls.classify.push(body);
    await json(route, { category: "comparison_request", continue_to_extraction: true });
  });

  await page.route("**/api/compare", async (route) => {
    calls.compare.push((route.request().postDataJSON() as { email_id: string }).email_id);
    await json(route, { status: "OK" });
  });

  // Dashboard reads. Empty is fine; the batch flow does not depend on them.
  await page.route("**/rest/v1/**", (route) => json(route, []));

  return calls;
}

test("ingests a bundle and reports per-phase progress", async ({ page }) => {
  const calls = await stubBackend(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Upload batch" }).click();
  const dialog = page.getByRole("dialog", { name: "Upload a batch" });
  await expect(dialog).toBeVisible();

  const start = dialog.getByRole("button", { name: "Start ingest" });
  await expect(start).toBeDisabled();

  await dialog.locator("input[type=file]").setInputFiles({
    name: "testing-sdoc-hackathon-bundle.zip",
    mimeType: "application/zip",
    buffer: bundleZip(),
  });
  await expect(dialog.getByText("testing-sdoc-hackathon-bundle.zip")).toBeVisible();
  await expect(start).toBeEnabled();

  await start.click();
  await expect(dialog.getByText("2 of 2 emails ingested.")).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByText("2 of 2 comparisons completed.")).toBeVisible();

  // 2 emails x 2 attachments, at the deterministic storage key.
  expect(calls.uploads.sort()).toEqual([
    "email_001/email_001_BL.txt", "email_001/email_001_SI.txt",
    "email_005/email_005_BL.xlsx", "email_005/email_005_SI.xlsx",
  ]);
  expect(calls.classify).toHaveLength(2);
  expect(calls.compare.sort()).toEqual(["email_001", "email_005"]);

  // The trap: attachments must reach the Edge Function as objects with a
  // storage path, never as bare strings.
  const attachments = calls.classify[0].attachments as Array<Record<string, unknown>>;
  expect(Array.isArray(attachments)).toBe(true);
  expect(typeof attachments[0]).toBe("object");
  expect(attachments[0]).toMatchObject({ name: expect.any(String), path: expect.stringContaining("/") });
  expect(calls.classify[0].metadata).toMatchObject({ source: "batch_zip" });

  await expect(page.getByText("2 of 2 cases ingested")).toBeVisible();
});

test("reports a failing email without aborting the rest", async ({ page }) => {
  const calls = await stubBackend(page);
  await page.unroute("**/functions/v1/identify-document-request");
  await page.route("**/functions/v1/identify-document-request", async (route) => {
    const body = route.request().postDataJSON() as { email_id: string };
    calls.classify.push(body);
    if (body.email_id === "email_005") {
      await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "provider exhausted" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ category: "comparison_request", continue_to_extraction: true }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Upload batch" }).click();
  const dialog = page.getByRole("dialog", { name: "Upload a batch" });
  await dialog.locator("input[type=file]").setInputFiles({
    name: "bundle.zip",
    mimeType: "application/zip",
    buffer: bundleZip(),
  });
  await dialog.getByRole("button", { name: "Start ingest" }).click();

  await expect(dialog.getByText("1 of 2 emails ingested.")).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole("button", { name: "Show details" }).click();
  await expect(dialog.getByText("email_005")).toBeVisible();
  expect(calls.compare).toHaveLength(1);
});

test("a failed comparison still counts the case as ingested", async ({ page }) => {
  // What an unreachable /api/compare looks like: the rows are in the
  // workspace and classified, only the verdict is missing. Reporting those
  // as wholly failed would contradict the inbox.
  await stubBackend(page);
  await page.unroute("**/api/compare");
  await page.route("**/api/compare", (route) => route.abort("connectionrefused"));

  await page.goto("/");
  await page.getByRole("button", { name: "Upload batch" }).click();
  const dialog = page.getByRole("dialog", { name: "Upload a batch" });
  await dialog.locator("input[type=file]").setInputFiles({
    name: "bundle.zip",
    mimeType: "application/zip",
    buffer: bundleZip(),
  });
  await dialog.getByRole("button", { name: "Start ingest" }).click();

  await expect(dialog.getByText("2 of 2 emails ingested.")).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByRole("alert")).toContainText("0 of 2 comparisons completed");
  await expect(dialog.getByRole("alert")).toContainText("awaiting comparison");

  await dialog.getByRole("button", { name: "Show details" }).click();
  await expect(dialog.getByText(/comparison service is unreachable/).first()).toBeVisible();
});

test("rejects an archive that is not a bundle", async ({ page }) => {
  await stubBackend(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Upload batch" }).click();
  const dialog = page.getByRole("dialog", { name: "Upload a batch" });

  await dialog.locator("input[type=file]").setInputFiles({
    name: "empty.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync({ "readme.txt": new TextEncoder().encode("hello") })),
  });
  await dialog.getByRole("button", { name: "Start ingest" }).click();

  await expect(dialog.getByRole("alert")).toContainText("No inbox/email_*.json files found");
});

test("rejects a file that is not a ZIP at all", async ({ page }) => {
  await stubBackend(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Upload batch" }).click();
  const dialog = page.getByRole("dialog", { name: "Upload a batch" });

  await dialog.locator("input[type=file]").setInputFiles({
    name: "notes.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("this is not a zip archive"),
  });
  await dialog.getByRole("button", { name: "Start ingest" }).click();

  await expect(dialog.getByRole("alert")).toContainText("Could not read notes.zip as a ZIP archive.");
});
