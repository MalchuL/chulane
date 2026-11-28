/** Checks the rendered workspace selector in both navigation layouts. */
import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

test("Aligns the workspace switcher icon and label with the primary navigation columns", async ({
  page,
}) => {
  await page.goto("/examples/knowledge-workspace");
  const navigation = page.getByRole("navigation", { name: "Workspace navigation" });
  const trigger = navigation.getByRole("button", { name: "Personal", exact: true });
  await expect(trigger).toBeVisible();

  const destination = navigation.getByRole("button", { name: "All pages", exact: true });
  const workspaceIcon = await trigger.locator("svg").first().boundingBox();
  const destinationIcon = await destination.locator("svg").boundingBox();
  const workspaceLabel = await trigger.getByText("Personal", { exact: true }).boundingBox();
  const destinationLabelStart = await destination.evaluate((button) => {
    const range = document.createRange();
    range.selectNodeContents(button.lastChild!);
    return range.getBoundingClientRect().left;
  });
  expect(workspaceIcon!.x).toBeCloseTo(destinationIcon!.x, 0);
  expect(workspaceLabel!.x).toBeCloseTo(destinationLabelStart, 0);
  await expect(trigger).toHaveAccessibleDescription("Local workspace");
  await trigger.click();
  const cloud = page.getByRole("menuitemcheckbox", { name: "Research team Cloud workspace" });
  const local = page.getByRole("menuitemcheckbox", { name: "Personal Local workspace" });
  const localLabel = await local.locator(".cu-menu-label").boundingBox();
  const cloudLabel = await cloud.locator(".cu-menu-label").boundingBox();
  expect(localLabel!.x).toBeCloseTo(cloudLabel!.x, 0);
  await cloud.click();
  await expect(
    navigation.getByRole("button", { name: "Research team", exact: true }),
  ).toHaveAccessibleDescription("Cloud workspace");
});

test("Switches workspaces from the compact icon trigger", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/examples/knowledge-workspace");
  const navigation = page.getByRole("navigation", { name: "Workspace navigation" });
  const trigger = navigation.getByRole("button", { name: "Switch workspace", exact: true });
  await trigger.click();
  await page
    .getByRole("menuitemcheckbox", { name: "Research team Cloud workspace", exact: true })
    .click();
  await trigger.click();
  await expect(
    page.getByRole("menuitemcheckbox", { name: "Research team Cloud workspace", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(
    "Navigation icons and labels fit at large font and icon sizes in " + colorScheme,
    async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.addInitScript(() => {
        localStorage.setItem(
          "catalog.layout",
          JSON.stringify({
            navigation: true,
            agent: true,
            focus: false,
            split: false,
            navWidth: 280,
          }),
        );
      });
      await page.goto("/examples/knowledge-workspace");
      await page.addStyleTag({
        content: `
        html { font-size: 125%; }
        .cu-surface { --ui-font: Verdana, sans-serif !important; --ui-icon: 1.375rem; }
      `,
      });
      const navigation = page.getByRole("navigation", { name: "Workspace navigation" });
      await expect(navigation).toHaveCSS("width", "280px");
      const project = navigation
        .getByRole("button", { name: "Atlas research", exact: true })
        .and(navigation.locator("[aria-expanded]"));
      await project.click();
      const rows = navigation.locator(".cu-workspace-selector, .cu-destination, .cu-tree-button");
      await expect(rows.first()).toBeVisible();
      for (const scale of ["125%", "150%"]) {
        await page
          .locator("html")
          .evaluate((root, value) => root.style.setProperty("font-size", value), scale);
        await expectIconSpacing(rows, scale === "125%" ? 27.5 : 33);
        const viewport = navigation.locator(
          ".cu-sidebar-scroll > [data-slot=scroll-area-viewport]",
        );
        expect(await viewport.evaluate((node) => node.scrollWidth)).toBe(
          await viewport.evaluate((node) => node.clientWidth),
        );
      }
    },
  );
}

/**
 * Check that all visible row icons keep their token size and a gap before the label.
 * @param rows Visible workspace, destination and tree buttons.
 * @param iconWidth Expected icon width in CSS pixels.
 */
async function expectIconSpacing(rows: Locator, iconWidth: number) {
  const metrics = await rows.evaluateAll((buttons) =>
    buttons.map((button) => {
      const icon = button.querySelector('[data-slot="tree-icon"]') ?? button.querySelector("svg");
      const label = button.querySelector(
        ".cu-nav-label, .cu-tree-name, .cu-workspace-selector > span",
      );
      const iconBounds = icon!.getBoundingClientRect();
      const labelBounds = label!.getBoundingClientRect();
      return {
        name: label!.textContent,
        width: iconBounds.width,
        gap: labelBounds.left - iconBounds.right,
        available: button.getBoundingClientRect().right - labelBounds.right,
      };
    }),
  );
  for (const row of metrics) {
    expect(row.width, row.name ?? "").toBeCloseTo(iconWidth);
    expect(row.gap, row.name ?? "").toBeGreaterThan(0);
    expect(row.available, row.name ?? "").toBeGreaterThanOrEqual(0);
  }
}
