import { expect, test, type Page } from "@playwright/test";

// The classifier lab now lives as a tab inside the dashboard (frontend/)
// rather than being the page loaded at "/", so every test opens it first.
async function openClassifierLab(page: Page) {
  const menuButton = page.locator(".mobile-menu");
  if (await menuButton.isVisible()) {
    await menuButton.click();
  }
  await page.getByRole("button", { name: "Classifier lab" }).click();
}

test("A6 request stays comparison intent without attachments", async ({ page }) => {
  await page.goto("/");
  await openClassifierLab(page);

  await expect(page.getByRole("heading", { name: "Choose a test case" })).toBeVisible();
  await expect(page.getByText("No attachments · intent classification still runs")).toBeVisible();
  await page.getByRole("button", { name: "Run classifier" }).click();

  await expect(page.locator(".lab-verdict strong", { hasText: "Comparison request" })).toBeVisible();
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
  await openClassifierLab(page);

  await page.getByRole("tab", { name: /R18 · misleading subject/ }).click();
  await page.getByRole("button", { name: "Run classifier" }).click();

  await expect(page.locator(".lab-verdict strong", { hasText: "Comparison request" })).toBeVisible();
  await expect(page.getByText("continue_to_extraction: true")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.screenshot({
    path: "artifacts/playwright/react-classifier-r18-mobile.png",
    fullPage: true,
  });
});
