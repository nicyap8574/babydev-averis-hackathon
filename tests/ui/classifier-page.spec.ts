import { expect, test } from "@playwright/test";

test("A6 request stays comparison intent without attachments", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /Know what the email wants/ })).toBeVisible();
  await expect(page.getByText("No attachments · intent classification still runs")).toBeVisible();
  await page.getByRole("button", { name: "Run classifier" }).click();

  await expect(page.getByRole("heading", { name: "Comparison request" })).toBeVisible();
  await expect(page.getByText("continue_to_extraction: true")).toBeVisible();
  await expect(page.getByText("Resolved on the free rule path")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.screenshot({
    path: "artifacts/playwright/react-classifier-a6-desktop.png",
    fullPage: true,
  });
});

test("misleading subject is overridden by comparison body on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("tab", { name: /R18 · misleading subject/ }).click();
  await page.getByRole("button", { name: "Run classifier" }).click();

  await expect(page.getByRole("heading", { name: "Comparison request" })).toBeVisible();
  await expect(page.getByText("continue_to_extraction: true")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.screenshot({
    path: "artifacts/playwright/react-classifier-r18-mobile.png",
    fullPage: true,
  });
});
