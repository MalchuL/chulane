/** Verifies that the workspace main content fills its pane in compact and docked layouts. */
import { expect, test } from "@playwright/test";

for (const width of [1024, 1440]) {
  test(`Workspace main pane fills its height at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/examples/knowledge-workspace");

    const compact = width === 1024;
    const agentToggle = compact ? "Open agent" : "Toggle agent";
    await expect(page.getByRole("button", { name: agentToggle, exact: true })).toBeVisible();

    const body = page.locator(".cu-shell-body");
    const pane = body.locator(".cu-shell-main");
    const content = pane.locator('[data-slot="scroll-area-viewport"] > div > .cu-panel');
    await expect(content).toBeVisible();
    await expect
      .poll(async () => {
        const [bodyBox, paneBox, contentBox] = await Promise.all([
          body.boundingBox(),
          pane.boundingBox(),
          content.boundingBox(),
        ]);
        if (!bodyBox || !paneBox || !contentBox) {
          return Infinity;
        }
        return Math.max(
          Math.abs(paneBox.height - bodyBox.height),
          Math.abs(contentBox.height - paneBox.height),
        );
      })
      .toBeLessThanOrEqual(1);
  });
}
