/** Verifies pointer and keyboard tooltip behavior through the public catalog. */
import { expect, test } from "@playwright/test";

test("An icon tooltip closes and clears the button highlight when the pointer leaves", async ({
  page,
}) => {
  await page.goto("/components/icon-button");
  const button = page.getByRole("button", { name: "Favorite page" });
  const tooltip = page.getByRole("tooltip", { name: "Favorite page" });
  const bubble = page.locator('[data-slot="tooltip-content"]').filter({ hasText: "Favorite page" });
  const background = await button.evaluate((element) => getComputedStyle(element).backgroundColor);

  await button.hover();
  await expect(button).not.toHaveCSS("background-color", background);
  await expect(tooltip).toBeAttached();
  await expect(bubble).toBeVisible();
  const bounds = (await bubble.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { steps: 5 });
  await expect(tooltip).toHaveCount(0);
  await expect(button).toHaveCSS("background-color", background);

  await page.getByRole("button", { name: "Copy example" }).focus();
  await page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  await expect(tooltip).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
  await expect(button).toBeFocused();
});

test("Scoped tooltips share the delay window and allow explicit content hover", async ({
  page,
}) => {
  await page.goto("/components/tooltip-provider");
  const time = Date.now();
  await page.clock.install({ time });
  await page.clock.pauseAt(time + 1000);
  const favorite = page.getByRole("button", { name: "Favorite page" });
  const pin = page.getByRole("button", { name: "Pin page" });
  const preview = page.getByRole("group", { name: "Page actions" }).locator("..");
  const favoriteTip = preview.getByRole("tooltip", { name: "Favorite page" });
  const pinTip = preview.getByRole("tooltip", { name: "Pin page" });
  const pinBubble = preview
    .locator('[data-slot="tooltip-content"]')
    .filter({ hasText: "Pin page" });
  const favoriteBounds = (await favorite.boundingBox())!;
  const pinBounds = (await pin.boundingBox())!;
  const favoriteX = favoriteBounds.x + favoriteBounds.width / 2;
  const favoriteY = favoriteBounds.y + favoriteBounds.height / 2;

  await page.mouse.move(favoriteX, favoriteY);
  await page.clock.runFor(599);
  await expect(favoriteTip).toHaveCount(0);
  await page.clock.runFor(1);
  await expect(favoriteTip).toBeAttached();
  await expect(favorite).toHaveAttribute("data-state", "delayed-open");

  await page.mouse.move(pinBounds.x + pinBounds.width / 2, pinBounds.y + pinBounds.height / 2);
  await expect(favoriteTip).toHaveCount(0);
  await expect(pinTip).toBeAttached();
  await expect(pin).toHaveAttribute("data-state", "instant-open");
  const bubble = (await pinBubble.boundingBox())!;
  await page.mouse.move(bubble.x + bubble.width / 2, bubble.y + bubble.height / 2, { steps: 5 });
  await page.clock.runFor(600);
  await expect(pinTip).toBeAttached();
  expect(await pinBubble.evaluate((element) => element.matches(":hover"))).toBe(true);

  await page.mouse.move(bubble.x + bubble.width + 80, bubble.y + bubble.height / 2, { steps: 5 });
  await expect(pinTip).toHaveCount(0);
  await page.clock.runFor(500);
  await page.mouse.move(favoriteX, favoriteY);
  await page.clock.runFor(599);
  await expect(favoriteTip).toHaveCount(0);
  await page.clock.runFor(1);
  await expect(favoriteTip).toBeAttached();
});
