/** Checks focus, control spacing, and change review sizing in the rendered chat. */
import { expect, test } from "@playwright/test";

test("Composer focus stays on the message field and actions have room", async ({ page }) => {
  await page.goto("/examples/agent-review");
  const textbox = page.getByRole("textbox", { name: "Message", exact: true });
  const composer = textbox.locator("..");
  const borderColor = await composer.evaluate((element) => getComputedStyle(element).borderColor);

  await textbox.click();
  await expect(textbox).toBeFocused();
  await expect(textbox).toHaveCSS("outline-style", "solid");
  await composer.evaluate(async (element) => {
    await new Promise(requestAnimationFrame);
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  await expect(composer).toHaveCSS("border-color", borderColor);
  await expect(composer).toHaveCSS("box-shadow", "none");
  expect((await composer.boundingBox())!.height).toBeLessThan(160);

  const options = page.getByRole("group", { name: "Composer options" });
  await expect(options).toHaveCSS("column-gap", "4px");
  const add = (await options
    .getByRole("button", { name: "Add context" })
    .locator("svg")
    .boundingBox())!;
  const mode = options.getByRole("button", { name: /^Agent mode:/ }).locator("svg");
  const modeIcon = (await mode.first().boundingBox())!;
  const modeChevron = (await mode.last().boundingBox())!;
  const model = (await options
    .getByRole("button", { name: /^Agent model:/ })
    .locator("svg")
    .first()
    .boundingBox())!;
  expect(modeIcon.x - add.x - add.width).toBeGreaterThanOrEqual(12);
  expect(model.x - modeChevron.x - modeChevron.width).toBeGreaterThanOrEqual(12);
});

test("Change review uses the full response width with diffs still available", async ({ page }) => {
  await page.goto("/examples/agent-review");
  const message = page.getByRole("article", { name: "Workspace agent message" });
  const content = message.locator('[data-slot="message-content"]');
  const review = message.getByRole("region", { name: "Change review" });
  const contentBox = (await content.boundingBox())!;
  const reviewBox = (await review.boundingBox())!;
  expect(contentBox.width - reviewBox.width).toBeLessThanOrEqual(2);

  const proposal = review.getByRole("article").first();
  await proposal.getByRole("button", { name: "View diff" }).click();
  await expect(proposal.locator(".cu-add")).toContainText("field team");
});
