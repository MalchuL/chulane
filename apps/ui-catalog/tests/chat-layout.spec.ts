/** Checks focus, control spacing, and change review sizing in the rendered chat. */
import { expect, test } from "@playwright/test";

test("Agent header, transcript and composer share the panel gutter", async ({ page }) => {
  await page.goto("/components/agent-panel");
  const panel = page.locator(".cu-agent");
  const headerIcon = panel.locator(":scope > header > svg").first();
  const message = panel.getByText("Welcome to the research workspace.", { exact: true });
  const composer = panel.locator(".cu-composer");
  await expect(message).toBeVisible();

  const panelBox = (await panel.boundingBox())!;
  const composerBox = (await composer.boundingBox())!;
  expect((await message.boundingBox())!.x).toBe(composerBox.x);
  expect((await headerIcon.boundingBox())!.x).toBe(composerBox.x);
  expect(composerBox.x - panelBox.x).toBe(
    panelBox.x + panelBox.width - composerBox.x - composerBox.width,
  );
});

test("Composer focus stays on the message field and actions have room", async ({ page }) => {
  await page.goto("/examples/agent-review");
  const textbox = page.getByRole("textbox", { name: "Message", exact: true });
  const composer = textbox.locator("..");
  await expect(composer).toHaveCSS("border-top-style", "solid");
  await expect(composer).toHaveCSS("border-top-width", "1px");
  await expect(composer).toHaveCSS("box-shadow", "none");
  const borderColor = await composer.evaluate((element) => getComputedStyle(element).borderColor);

  await textbox.click();
  await expect(textbox).toBeFocused();
  await expect(textbox).toHaveCSS("outline-style", "none");
  await composer.evaluate(async (element) => {
    await new Promise(requestAnimationFrame);
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  await expect(composer).not.toHaveCSS("border-color", borderColor);
  await expect(composer).toHaveCSS("box-shadow", / 0px 0px 0px 3px$/);
  expect((await composer.boundingBox())!.height).toBeLessThan(160);

  const options = page.getByRole("group", { name: "Composer options" });
  await expect(options).toHaveCSS("column-gap", "4px");
  const add = (await options
    .getByRole("button", { name: "Add context" })
    .locator("svg")
    .boundingBox())!;
  const mode = options.getByRole("button", { name: "Agent mode: Suggest" });
  await expect(mode).toHaveText("Suggest");
  const modeIcons = mode.locator("svg");
  const modeIcon = (await modeIcons.first().boundingBox())!;
  const modeChevron = (await modeIcons.last().boundingBox())!;
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

test("Composer keeps context chips together and shows full labels at 125% root font size", async ({
  page,
}) => {
  await page.goto("/components/agent-composer");
  const composer = page.locator(".cu-composer");
  await composer.evaluate((element) => {
    document.documentElement.style.fontSize = "125%";
    element.style.inlineSize = "350px";
  });
  await composer.evaluate(async (element) => {
    await document.fonts.ready;
    await new Promise(requestAnimationFrame);
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished),
    );
  });

  const chips = composer.locator('[data-slot="attachment"]');
  await expect(chips).toHaveCount(2);
  const [first, second] = await chips.evaluateAll((items) =>
    items.map((item) => item.getBoundingClientRect().top),
  );
  expect(first).toBe(second);

  const labels = composer.locator(".cu-composer-option-label");
  await expect(labels).toHaveCount(2);
  expect(
    await labels.evaluateAll((items) =>
      items.every((item) => item.scrollWidth <= item.clientWidth),
    ),
  ).toBe(true);
});

test("Composer controls stay within 280px with 150% text, Verdana and larger icons", async ({
  page,
}) => {
  await page.goto("/components/agent-composer");
  const composer = page.locator(".cu-composer");
  await composer.evaluate(async (element) => {
    document.documentElement.style.fontSize = "150%";
    element.style.inlineSize = "280px";
    element.style.fontFamily = "Verdana, sans-serif";
    element.style.setProperty("--ui-icon", "1.375rem");
    await document.fonts.ready;
    await new Promise(requestAnimationFrame);
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished),
    );
  });
  const geometry = await composer.evaluate((element) => {
    const { left, right } = element.getBoundingClientRect();
    return {
      overflow: element.scrollWidth - element.clientWidth,
      roomForEllipsis: [...element.querySelectorAll(".cu-composer-option-label")].every(
        (label) => label.clientWidth >= parseFloat(getComputedStyle(label).fontSize),
      ),
      outside: [...element.querySelectorAll(".cu-toolbar button, [data-slot=attachment]")].filter(
        (control) => {
          const bounds = control.getBoundingClientRect();
          return bounds.left < left || bounds.right > right;
        },
      ).length,
    };
  });
  expect(geometry).toEqual({ overflow: 0, outside: 0, roomForEllipsis: true });
});
