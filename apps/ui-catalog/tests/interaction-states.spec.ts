/** Checks the visual affordances exposed through the public component catalog. */
import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test("Selection and keyboard focus remain distinct in " + colorScheme, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("/components/segmented-control");
    const selected = page.getByRole("radio", { name: "Standard", exact: true });
    const unselected = page.getByRole("radio", { name: "Compact", exact: true });
    await expect(selected).toBeChecked();
    const background = await selected.evaluate((node) => getComputedStyle(node).backgroundColor);
    await unselected.hover();
    await expect.soft(unselected).not.toHaveCSS("background-color", background);
    await selected.hover();
    await expect.soft(selected).not.toHaveCSS("background-color", background);
    await page.keyboard.press("Tab");
    await selected.focus();
    await expect(selected).toBeFocused();
    await expect(selected).toHaveCSS("outline-style", "solid");
    await expect.soft(selected).toBeChecked();

    await page.goto("/components/document-tabs");
    const close = page.getByRole("button", { name: "Close Field notes" });
    const title = page.getByRole("button", { name: "Field notes", exact: true });
    await title.press("Tab");
    await expect(close).toBeFocused();
    await expect(close).toHaveCSS("outline-style", "solid");
    const box = await close.boundingBox();
    expect.soft(box?.width).toBeGreaterThanOrEqual(28);
    expect.soft(box?.height).toBeGreaterThanOrEqual(28);

    await page.goto("/components/page-browser");
    const row = page.getByRole("button", { name: /^Field notes/ });
    await row.click();
    await expect(row).toHaveAttribute("aria-pressed", "true");
    await expect.soft(row).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  });
}
