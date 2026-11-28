/** Checks the rendered workspace selector in both navigation layouts. */
import { expect, test } from "@playwright/test";

test("Aligns the workspace name at the start of the full-width trigger", async ({ page }) => {
  await page.goto("/examples/knowledge-workspace");
  const navigation = page.getByRole("navigation", { name: "Workspace navigation" });
  const trigger = navigation.getByRole("button", { name: "Personal", exact: true });
  await expect(trigger).toBeVisible();

  const label = await trigger.locator("span").boundingBox();
  const projects = navigation.locator(".cu-nav-group-button").filter({ hasText: "Projects" });
  const labelStart = await projects.evaluate((button) => {
    const range = document.createRange();
    range.selectNodeContents(button.lastChild!);
    return range.getBoundingClientRect().left;
  });
  expect(label!.x).toBeCloseTo(labelStart, 0);
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
