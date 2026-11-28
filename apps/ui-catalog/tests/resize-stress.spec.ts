/** Exercises the public component previews under larger type, icons and narrower layouts. */
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { registry } from "../src/docs/registry";

const scenarios = [
  { name: "125% root font", width: 640, root: 125 },
  { name: "150% root font", width: 480, root: 150 },
  { name: "wide type and larger icons", width: 360, root: 150, wide: true },
] as const;

/**
 * Apply root scaling and resize the mounted example through its observers.
 * @param page The catalog page.
 * @param scenario The test width and token overrides.
 */
async function resize(page: Page, scenario: (typeof scenarios)[number]) {
  const wide = "wide" in scenario;
  await page.addStyleTag({
    content: `
      html { font-size: ${scenario.root}%; }
      ${
        wide
          ? ":root { --ui-font: 'DejaVu Sans Mono', monospace; --ui-icon: 1.375rem; --ui-icon-sm: 1rem; }"
          : ""
      }
    `,
  });
  await page.setViewportSize({ width: scenario.width, height: 900 });
  await expect(page.locator(".catalog")).toHaveAttribute("data-narrow", "true");
  await expect(page.locator("html")).toHaveCSS("font-size", `${(16 * scenario.root) / 100}px`);
  if (wide) {
    await expect(page.locator("body")).toHaveCSS("font-family", '"DejaVu Sans Mono", monospace');
    await expect(page.getByRole("button", { name: "Open directory" }).locator("svg")).toHaveCSS(
      "width",
      "33px",
    );
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(requestAnimationFrame);
    await Promise.allSettled(
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished),
    );
  });
}

const actionSelector =
  ':is(button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="option"], [role^="menuitem"], [role="radio"], [role="checkbox"]):not([inert], [inert] *):visible';

/**
 * Find controls that do not fit inside the window and their clipping ancestors.
 * @param actions The mounted, visible and active controls to inspect.
 * @param axis The dimension to inspect.
 * @returns Labels and clipping ancestors of controls that cannot scroll fully into view.
 */
function clippedOnAxis(actions: Locator, axis: "x" | "y") {
  return actions.evaluateAll((elements: HTMLElement[], axis) => {
    const horizontal = axis === "x";
    const problems: string[] = [];
    for (const action of elements) {
      const label =
        action.getAttribute("aria-label") || action.textContent?.trim() || action.tagName;
      const { left, top, width, height } = action.getBoundingClientRect();
      const length = horizontal ? width : height;
      let start = horizontal ? left : top;
      for (let parent = action.parentElement; parent; parent = parent.parentElement) {
        const styles = getComputedStyle(parent);
        const overflow = horizontal ? styles.overflowX : styles.overflowY;
        if (overflow === "visible") {
          continue;
        }
        const bounds = parent.getBoundingClientRect();
        const edge = horizontal ? bounds.left + parent.clientLeft : bounds.top + parent.clientTop;
        const size = horizontal ? parent.clientWidth : parent.clientHeight;
        if (start >= edge - 1 && start + length <= edge + size + 1) {
          continue;
        }
        const scrollStart = edge - (horizontal ? parent.scrollLeft : parent.scrollTop);
        const scrollLength = horizontal ? parent.scrollWidth : parent.scrollHeight;
        if (
          !["auto", "scroll"].includes(overflow) ||
          length > size + 1 ||
          start < scrollStart - 1 ||
          start + length > scrollStart + scrollLength + 1
        ) {
          problems.push(`${label} clips on ${axis} inside ${parent.className || parent.tagName}`);
          break;
        }
        // Bring the span into the nested scrollport before checking the outer clipping bounds.
        start = Math.max(edge, Math.min(start, edge + size - length));
      }
      if (horizontal && (start < -1 || start + length > innerWidth + 1)) {
        problems.push(`${label} extends beyond the window`);
      }
    }
    return problems;
  }, axis);
}

/**
 * Inspect control and icon geometry within the preview, header or open overlay.
 * @param region The region to inspect.
 * @returns Controls or icons that cannot fit their box or a reachable scroll position.
 */
async function clippedActions(region: Locator) {
  const actions = region.locator(actionSelector);
  const problems = await Promise.all([
    clippedOnAxis(actions, "x"),
    clippedOnAxis(actions, "y"),
    actions.evaluateAll((elements) => {
      const problems: string[] = [];
      for (const action of elements) {
        const rect = action.getBoundingClientRect();
        for (const icon of action.querySelectorAll("svg")) {
          const bounds = icon.getBoundingClientRect();
          if (
            getComputedStyle(icon).visibility === "visible" &&
            bounds.width &&
            (bounds.left < rect.left - 1 ||
              bounds.right > rect.right + 1 ||
              bounds.top < rect.top - 1 ||
              bounds.bottom > rect.bottom + 1)
          ) {
            const label =
              action.getAttribute("aria-label") || action.textContent?.trim() || action.tagName;
            problems.push(`${label} icon extends outside its control`);
          }
        }
      }
      return problems;
    }),
  ]);
  return problems.flat();
}

for (const scenario of scenarios) {
  for (const family of new Set(registry.map((item) => item.family))) {
    test(`${family} previews at ${scenario.width}px with ${scenario.name}`, async ({ page }) => {
      test.setTimeout(60_000);
      for (const item of registry.filter((entry) => entry.family === family)) {
        await test.step(item.name, async () => {
          await page.setViewportSize({ width: 1440, height: 900 });
          await page.goto(`/components/${item.slug}`);
          const preview = page.locator(".catalog-preview > [data-slot=scroll-area-viewport]");
          await expect(preview.locator("> div > :not(style)").first()).toBeVisible();
          await resize(page, scenario);
          const overflow = await preview.evaluate(
            (viewport) => viewport.scrollWidth - viewport.clientWidth,
          );
          expect.soft(overflow, `${item.name} preview horizontal overflow`).toBeLessThanOrEqual(1);
          expect.soft(await clippedActions(preview), item.name).toEqual([]);
          expect
            .soft(await clippedActions(page.locator(".catalog-header")), "Catalog header")
            .toEqual([]);
          expect
            .soft(
              await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
              `${item.name} document horizontal overflow`,
            )
            .toBeLessThanOrEqual(1);
        });
      }
    });
  }
}

test("Narrow modal and menu actions accept pointer input with enlarged type and icons", async ({
  page,
}) => {
  await page.goto("/components/confirm-action");
  await resize(page, scenarios[2]);
  const directory = page.getByRole("button", { name: "Open directory" });
  await directory.click();
  const browse = page.getByRole("dialog", { name: "Browse components" });
  await expect(browse).toBeVisible();
  expect(await clippedActions(browse)).toEqual([]);
  await browse.getByRole("button", { name: "Close", exact: true }).click();
  await expect(directory).toBeFocused();

  await page.getByRole("button", { name: "Remove attachment" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Remove attachment?" });
  await expect(confirm).toBeVisible();
  expect(await clippedActions(confirm)).toEqual([]);
  await confirm.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByRole("button", { name: "Undo removal" })).toBeVisible();

  await page.goto("/components/command-palette");
  await resize(page, scenarios[2]);
  await page.getByRole("button", { name: "Find a command" }).click();
  const palette = page.getByRole("dialog");
  await expect(palette).toBeVisible();
  expect(await clippedActions(palette)).toEqual([]);
  await palette.getByRole("option", { name: "Create page", exact: true }).click();
  await expect(page.locator("output")).toHaveText("Create page");
});

test("Gutter and floating formatting actions work under combined stress", async ({ page }) => {
  await page.goto("/components/selection-toolbar");
  await resize(page, scenarios[2]);
  const preview = page.locator(".catalog-preview");
  const block = preview.getByRole("textbox").first();
  await block.hover();
  const insert = preview.getByRole("button", { name: "Insert block", exact: true }).first();
  await expect(insert).toBeInViewport({ ratio: 1 });
  await insert.click();
  const slash = page.getByRole("combobox", { name: "Find block type" });
  await expect(slash).toBeFocused();
  await page.getByRole("option", { name: "Heading", exact: true }).click();
  await expect(preview.getByRole("textbox")).toHaveCount(3);

  const viewport = preview.locator("> [data-slot=scroll-area-viewport]");
  await viewport.evaluate((element) => {
    element.style.blockSize = "420px";
    element.style.overflowY = "auto";
  });
  await viewport.scrollIntoViewIfNeeded();
  await block.focus();
  await viewport.evaluate((element) => {
    const field = element.querySelector("textarea")!;
    element.scrollTop +=
      field.getBoundingClientRect().top - element.getBoundingClientRect().top - 20;
  });
  await block.press("ControlOrMeta+a");
  const toolbar = preview.locator(".cu-selection-toolbar");
  await expect(toolbar).toBeInViewport({ ratio: 1 });
  const fieldBox = (await block.boundingBox())!;
  const viewportBox = (await viewport.boundingBox())!;
  const toolbarBox = (await toolbar.boundingBox())!;
  expect(fieldBox.y - viewportBox.y).toBeLessThan(toolbarBox.height);
  expect(toolbarBox.y).toBeGreaterThan(fieldBox.y);
  expect(await clippedActions(toolbar)).toEqual([]);
  await toolbar.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(block).toHaveValue(/^\*\*Cats/);
});

test("Formatting stays above the selected line when there is room", async ({ page }) => {
  await page.goto("/components/selection-toolbar");
  const preview = page.locator(".catalog-preview");
  const block = preview.getByRole("textbox").last();
  await block.press("ControlOrMeta+a");
  const toolbar = preview.locator(".cu-selection-toolbar");
  await expect(toolbar).toBeInViewport({ ratio: 1 });
  const bar = (await toolbar.boundingBox())!;
  expect(bar.y + bar.height).toBeLessThan((await block.boundingBox())!.y + 1);
  await toolbar.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(block).toHaveValue(/^\*\*Their/);
});

test("Composer can change mode and send at the narrowest stress width", async ({ page }) => {
  await page.goto("/components/agent-composer");
  await resize(page, scenarios[2]);
  const preview = page.locator(".catalog-preview");
  const mode = preview.getByRole("button", { name: /Suggest/ });
  await mode.click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  expect(await clippedActions(menu)).toEqual([]);
  await menu.getByRole("menuitemcheckbox", { name: /^Ask / }).click();
  await preview.getByRole("textbox", { name: "Message", exact: true }).fill("Check the trail");
  await preview.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(preview.getByText("Check the trail", { exact: true })).toBeVisible();
});
