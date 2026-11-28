/** Covers shared row states and aligned document and review geometry. */
import { expect, test } from "@playwright/test";

test("Workspace rows show pointer and keyboard states in both themes", async ({ page }) => {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/examples/knowledge-workspace");
    const navigation = page.getByRole("navigation", { name: "Workspace navigation" });
    const selected = navigation.getByRole("button", { name: "All pages" });
    const journal = navigation.getByRole("button", { name: "Journal", exact: true });
    const clear = "rgba(0, 0, 0, 0)";
    await expect(selected).toHaveCSS("height", "32px");
    await expect(selected).not.toHaveCSS("background-color", clear);
    await expect(journal).toHaveCSS("background-color", clear);
    await journal.hover();
    await expect(journal).not.toHaveCSS("background-color", clear);
    await page.keyboard.press("Tab");
    await selected.focus();
    await expect(selected).toHaveCSS("outline-width", "2px");
    await expect(selected).toHaveCSS("box-shadow", "none");

    const pane = page.locator(".cu-shell-main");
    const panel = pane.locator(".cu-panel");
    const rows = pane.locator(".cu-page-row");
    await expect(rows.first()).toHaveCSS("height", "56px");
    const actions = rows.getByRole("button", { name: /^Actions for / });
    expect((await actions.first().boundingBox())!.x).toBe((await actions.nth(1).boundingBox())!.x);
    expect((await panel.boundingBox())!.height).toBe((await pane.boundingBox())!.height);
    await pane
      .getByRole("button", { name: /^Field notes/ })
      .first()
      .click();
    expect((await panel.boundingBox())!.height).toBe((await pane.boundingBox())!.height);
    const options = pane.getByRole("button", { name: "Page options" });
    expect((await options.boundingBox())!.width).toBeLessThan((await panel.boundingBox())!.width);
  }
});

test("Page previews retain their content when switching from list to grid", async ({ page }) => {
  await page.goto("/components/page-browser");
  const row = page.getByRole("button", { name: /^Field notes/ });
  await row.click();
  const previews = page.locator(".cu-page-preview");
  const image = previews.nth(0).locator("img");
  await expect(image).toHaveJSProperty("complete", true);
  expect(await image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
  await expect(image).toHaveCSS("object-fit", "cover");
  await expect(previews.nth(0)).toHaveCSS("width", "40px");
  await expect(previews.nth(0)).toHaveCSS("height", "40px");
  await expect(previews.nth(1)).toHaveText("🧭");
  await expect(previews.nth(2).locator("svg.lucide-file-text")).toBeVisible();
  await page.getByRole("button", { name: "Grid view" }).click();
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await expect(previews.nth(0)).toHaveCSS("aspect-ratio", "16 / 9");
  const preview = (await previews.first().boundingBox())!;
  expect(preview.width / preview.height).toBeCloseTo(16 / 9, 2);
});

test("Page browser search shrinks before toolbar actions wrap", async ({ page }) => {
  await page.goto("/components/page-browser");
  const toolbar = page.locator(".cu-page-browser-toolbar");
  await toolbar.evaluate((header) => {
    document.documentElement.style.fontSize = "125%";
    header.style.width = "440px";
  });
  const search = page.getByRole("searchbox", { name: "Search pages" });
  const actions = page.getByRole("group", { name: "Page browser actions" });
  const searchBox = (await search.boundingBox())!;
  const actionBox = (await actions.boundingBox())!;
  expect(actionBox.y).toBeLessThan(searchBox.y + searchBox.height);
  expect(actionBox.x).toBeGreaterThanOrEqual(searchBox.x + searchBox.width);
  await search.fill("northern trail");
  await expect(page.getByRole("button", { name: /^Field notes/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Research atlas/ })).toHaveCount(0);

  await toolbar.evaluate((header) => header.style.removeProperty("width"));
  const browser = toolbar.locator("..");
  await browser.evaluate((section) => {
    document.documentElement.style.fontSize = "150%";
    section.style.width = "280px";
    section.style.fontFamily = "Verdana, sans-serif";
    section.style.setProperty("--ui-icon", "1.375rem");
  });
  expect(await browser.evaluate((section) => section.scrollWidth)).toBeLessThanOrEqual(280);
  await expect(actions).toBeVisible();
  const open = (await page.getByRole("button", { name: /^Field notes/ }).boundingBox())!;
  const date = (await browser.getByText("2026-11-24", { exact: true }).boundingBox())!;
  expect(date.y).toBeGreaterThanOrEqual(open.y + open.height);
});

test("Document blocks align with the title and reserve tab close space", async ({ page }) => {
  await page.goto("/examples/document-editor");
  const article = page.locator(".cu-document");
  const titleX = (await article.getByRole("heading", { level: 1 }).boundingBox())!.x;
  expect((await article.getByRole("textbox", { name: "Document body" }).boundingBox())!.x).toBe(
    titleX,
  );
  expect((await article.getByRole("img").boundingBox())!.x).toBe(titleX);
  const values = await article.locator(".cu-properties dd").all();
  expect((await values[1]!.locator("[data-slot=badge]").boundingBox())!.x).toBe(
    (await values[0]!.boundingBox())!.x,
  );
  const inactive = page.getByRole("group", { name: "Research atlas tab actions" });
  const close = inactive.getByRole("button", { name: "Close Research atlas" });
  const width = (await inactive.boundingBox())!.width;
  await expect(close).toHaveCSS("opacity", "0");
  await inactive.hover();
  await expect(close).toHaveCSS("opacity", "1");
  expect((await inactive.boundingBox())!.width).toBe(width);
});

test("Review actions stay aligned and their tooltips clear the header and diff trigger", async ({
  page,
}) => {
  await page.goto("/components/change-review");
  const review = page.getByRole("region", { name: "Change review" }).first();
  const apply = review.getByRole("button", { name: "Apply change" }).first();
  const undo = review.getByRole("button", { name: "Undo" }).first();
  const diffs = review.getByRole("button", { name: "View diff" });
  const diff = (await diffs.first().boundingBox())!;
  expect(diff.x).toBe((await diffs.nth(1).boundingBox())!.x);
  expect((await apply.boundingBox())!.x).toBe((await undo.boundingBox())!.x);
  await apply.hover();
  const tooltip = page.getByRole("tooltip", { name: "Apply change" });
  await expect(tooltip).toBeVisible();
  const bubble = page.locator('[data-slot="tooltip-content"]').filter({ hasText: "Apply change" });
  const tip = (await bubble.boundingBox())!;
  const count = (await review.getByText("2/3 reviewed", { exact: true }).boundingBox())!;
  expect(tip.y).toBeGreaterThanOrEqual(count.y + count.height);
  expect(tip.y).toBeGreaterThanOrEqual(diff.y + diff.height);
});
