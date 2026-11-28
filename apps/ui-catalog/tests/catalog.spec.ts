/** Verifies each documented public component, scoped theme tokens and integrated behavior. */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { registry } from "../src/docs/registry";
for (const family of [...new Set(registry.map((i) => i.family))]) {
  test(family + " component routes", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const item of registry.filter((i) => i.family === family)) {
      await page.goto("/components/" + item.slug);
      await expect(page.getByRole("heading", { name: item.name, exact: true })).toBeVisible();
      await expect(
        page
          .locator('.catalog-preview > [data-slot="scroll-area-viewport"] > div > :not(style)')
          .first(),
      ).toBeVisible();
      await page.getByRole("radio", { name: "Code", exact: true }).click();
      await expect(page.locator(".catalog-code")).toContainText("export default function Example");
      await expect(page.getByRole("heading", { name: "Props", exact: true })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}
test("Theme persistence, OS changes and scoped overrides", async ({ page }) => {
  await page.goto("/components/button");
  const theme = page.getByRole("button", { name: "Color theme" });
  await theme.click();
  await page.getByRole("menuitemcheckbox", { name: "Dark", exact: true }).click();
  await page.reload();
  await expect(theme).toHaveText("Dark");
  await theme.click();
  await page.getByRole("menuitemcheckbox", { name: "System", exact: true }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .locator(".catalog-preview")
    .evaluate((e) => (e as HTMLElement).style.setProperty("--ui-accent", "rgb(24, 55, 66)"));
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCSS(
    "background-color",
    "rgb(24, 55, 66)",
  );
});
for (const width of [1024, 1280, 1440, 1920, 2560]) {
  test("Workspace at " + width, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/examples/knowledge-workspace");
    await expect(
      page.getByRole("heading", { name: "Knowledge workspace", exact: true }),
    ).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
    if (width === 1024) {
      await page.getByRole("button", { name: "Open agent", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
    } else {
      const grip = page.getByRole("separator", { name: "Navigation width" });
      await grip.focus();
      const before = Number(await grip.getAttribute("aria-valuenow"));
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(async () => Number(await grip.getAttribute("aria-valuenow")))
        .toBeGreaterThan(before);
    }
    await page.screenshot({ path: info.outputPath("workspace-" + width + ".png") });
  });
}
test("Section preferences survive reopening the catalog", async ({ page }) => {
  await page.goto("/examples/knowledge-workspace");
  await page.getByRole("button", { name: "Customize sidebar" }).click();
  await page.getByRole("menuitem", { name: "Visible sections" }).focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("menuitemcheckbox", { name: "Favorites", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Favorites", exact: true })).toHaveCount(0);
});
test("Palette keyboard search restores focus", async ({ page }) => {
  await page.goto("/components/command-palette");
  const trigger = page.getByRole("button", { name: "Find a command" });
  await trigger.click();
  const search = page.getByRole("combobox", { name: "Search commands" });
  await expect(search).toBeFocused();
  await expect(search).toHaveCSS("border-top-width", "0px");
  await expect(search).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await search.fill("archive");
  await expect(page.getByText("No matching commands")).toBeVisible();
  await search.press("Enter");
  await expect(search).toBeFocused();
  await search.fill("create");
  await search.press("Enter");
  await expect(page.locator("output")).toHaveText("Create page");
  await expect(trigger).toBeFocused();
});

test("Command toolbar selects checked actions with the keyboard", async ({ page }) => {
  await page.goto("/components/command-toolbar");
  const favorite = page.getByRole("group", { name: "Page actions" }).getByRole("button", {
    name: "Favorite",
  });
  await expect(favorite).toHaveAttribute("aria-pressed", "false");
  await favorite.focus();
  await favorite.press("Enter");
  await expect(favorite).toHaveAttribute("aria-pressed", "true");
  await favorite.press("Space");
  await expect(favorite).toHaveAttribute("aria-pressed", "false");
});

test("Draft survives queued edits and operations reflect host approval", async ({ page }) => {
  await page.goto("/examples/agent-review");
  const proposal = page.locator(".cu-change").first();
  await proposal.getByLabel("View diff").click();
  await expect(proposal.locator(".cu-add")).toContainText("field team");
  await page.getByRole("button", { name: "Agent options" }).click();
  await page.getByRole("menuitem", { name: "Agent settings" }).click();
  await page.getByLabel("Fail next approval").check();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Apply change" }).click();
  await expect(page.getByRole("alert")).toContainText("Review and retry");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(proposal.getByRole("button", { name: "Undo" })).toBeVisible();
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  await input.fill("Summarize the trail");
  await input.press("Enter");
  await input.fill("Compare revisions");
  await input.press("Enter");
  await input.fill("Independent draft");
  await page.getByRole("button", { name: "Edit queued message" }).click();
  await page.getByRole("textbox", { name: "Edit queued message" }).fill("Compare all revisions");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(input).toHaveValue("Independent draft");
  await expect(page.getByText("Compare all revisions", { exact: true })).toBeVisible();
});
test("Document selection and slash insertion", async ({ page }) => {
  await page.goto("/examples/document-editor");
  const body = page.getByRole("textbox", { name: "Document body" });
  await body.fill("Field notes");
  await body.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(body).toHaveValue("**Field notes**");
  await body.focus();
  await body.press("End");
  await body.press("/");
  const search = page.getByRole("combobox", { name: "Find block type" });
  await expect(search).toBeFocused();
  await page.keyboard.type("Checklist");
  await expect(search).toHaveValue("Checklist");
  await expect(page.getByRole("option", { name: "Paragraph" })).toBeHidden();
  await search.press("Escape");
  await expect(body).toBeFocused();
  await expect(body).toHaveValue("**Field notes**");
  await body.press("/");
  await expect(search).toHaveValue("");
  await search.fill("Checklist");
  await search.press("Enter");
  await expect(body).toBeFocused();
  await expect(body).toHaveValue(/- \[ \]/);
});
for (const theme of ["Light", "Dark"]) {
  test("Accessibility in " + theme, async ({ page }, info) => {
    for (const path of [
      "/components",
      "/components/button",
      "/examples/knowledge-workspace",
      "/examples/document-editor",
      "/examples/agent-review",
    ]) {
      await page.goto(path);
      await page.getByRole("button", { name: "Color theme" }).click();
      await page.getByRole("menuitemcheckbox", { name: theme, exact: true }).click();
      // Contrast belongs to the selected theme after its color transitions settle.
      await page.evaluate(async () => {
        await new Promise(requestAnimationFrame);
        await Promise.allSettled(
          document
            .getAnimations()
            .filter((animation) => animation instanceof CSSTransition)
            .map((animation) => animation.finished),
        );
      });
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect
        .soft(
          result.violations.map((v) => [v.id, v.nodes.map((n) => [n.target, n.failureSummary])]),
          path,
        )
        .toEqual([]);
      await page.screenshot({
        path: info.outputPath(theme + path.replaceAll("/", "-") + ".png"),
      });
    }
  });
}

test("A locally themed portal retains the trigger's token scope", async ({ page }) => {
  await page.goto("/components/theme-scope");
  await page.getByRole("button", { name: "Color theme" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Light", exact: true }).click();
  const scope = page.locator(".catalog-preview [data-theme=dark]");
  await scope.getByRole("button", { name: "Inspect appearance" }).click();
  const overlay = scope.getByRole("dialog", { name: "Scoped appearance" });
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveCSS("background-color", "rgb(45, 42, 56)");
  await page.keyboard.press("Escape");
  await expect(scope.getByRole("button", { name: "Inspect appearance" })).toBeFocused();
});

test("Nested context commands and tab reordering are keyboard accessible", async ({ page }) => {
  await page.goto("/examples/document-editor");
  const target = page.getByRole("group", { name: "Block context menu" }).first();
  await target.focus();
  await page.keyboard.press("Shift+F10");
  const turnInto = page.getByRole("menuitem", { name: "Turn into" });
  await turnInto.focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("menuitem", { name: "Heading", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Document body" })).toHaveValue(/## /);
  await expect(target).toBeFocused();
  const tabs = page.getByRole("navigation", { name: "Open documents" });
  await tabs.getByRole("button", { name: "Field notes", exact: true }).press("Alt+ArrowRight");
  await expect(tabs.getByRole("button").first()).toHaveText("Research atlas");
});

test("Sidebar reorder, mode and defaults persist across reloads", async ({ page }) => {
  await page.goto("/examples/knowledge-workspace");
  const customize = page.getByRole("button", { name: "Customize sidebar" });
  await customize.click();
  await page.getByRole("menuitem", { name: "Reorder sections" }).focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("menuitem", { name: "Move Projects up" }).click();
  await expect(page.locator(".cu-nav-section").first()).toContainText("Projects");
  await customize.click();
  await page.getByRole("menuitem", { name: "Navigation mode" }).focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("menuitemcheckbox", { name: "expanded" }).click();
  await page.reload();
  await expect(page.locator(".cu-sidebar")).toHaveAttribute("data-mode", "expanded");
  await customize.click();
  await page.getByRole("menuitem", { name: "Restore defaults" }).click();
  await expect(page.locator(".cu-sidebar")).toHaveAttribute("data-mode", "standard");
  await expect(page.locator(".cu-nav-section").first()).toContainText("Favorites");
});

test("Drafts belong to their conversation and stop preserves partial output", async ({ page }) => {
  await page.goto("/examples/agent-review");
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  await input.fill("Hold this draft");
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(input).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Conversation", exact: true })).toHaveCount(0);
  const conversation = page.getByRole("button", { name: "Conversation 2", exact: true });
  await expect(conversation).toHaveAccessibleDescription("Idle conversation");
  await input.fill("Read my journal");
  await input.press("Enter");
  await expect(conversation).toHaveAccessibleDescription("Generating a response");
  await page.getByRole("button", { name: "Stop generation" }).click();
  await expect(conversation).toHaveAccessibleDescription("Idle conversation");
  await expect(page.getByRole("log")).toContainText("cancelled");
  await page
    .getByRole("navigation", { name: "Open conversations" })
    .getByRole("button", { name: "Trail review", exact: true })
    .click();
  await expect(input).toHaveValue("Hold this draft");
});

test("Workspace links resolve and imported notes stay in their workspace", async ({ page }) => {
  await page.goto("/examples/knowledge-workspace#atlas");
  await expect(page.getByRole("heading", { name: "Atlas research" })).toBeVisible();
  await page.getByRole("button", { name: "Workspace menus" }).click();
  await page.getByRole("menuitem", { name: "Create", exact: true }).press("ArrowRight");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Import text or Markdown" }).click();
  await (
    await chooser
  ).setFiles({
    name: "Imported.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("Field observations"),
  });
  await page.getByRole("button", { name: "Save title" }).click();
  await expect(page.getByRole("heading", { name: "Imported.md" })).toBeVisible();
  await page.getByRole("button", { name: "Personal", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Research team" }).click();
  await expect(page.getByRole("heading", { name: "All pages 1", exact: true })).toBeVisible();
  await expect(page.getByText("Imported.md", { exact: true })).toHaveCount(0);
});

test("A queued follow-up runs after the active response", async ({ page }) => {
  await page.goto("/examples/agent-review");
  const message = page.getByRole("textbox", { name: "Message", exact: true });
  await message.fill("First request");
  await message.press("Enter");
  await message.fill("Queued follow-up");
  await page.getByRole("button", { name: "Queue message" }).click();
  await expect(page.getByRole("log")).toContainText("Queued follow-up");
  await expect(page.getByRole("list", { name: "Queued messages" })).toBeEmpty();
});

test("Design menus use compact icon rows and update workspace appearance", async ({ page }) => {
  await page.goto("/components/action-menu");
  const panels = page.locator(".catalog-menu-panels");
  await expect(panels.getByRole("heading")).toHaveCount(4);
  const row = panels.getByRole("button", { name: "Rename" });
  await expect(row).toHaveCSS("min-height", "32px");
  await expect(row.locator("kbd")).toHaveText("F2");
  await panels.getByRole("button", { name: "Typography" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Monospace" }).click();
  await expect(panels).toHaveCSS("font-family", /monospace/);
});
test("Mode, model and context stay inside the composer", async ({ page }) => {
  await page.goto("/components/agent-composer");
  await page.getByRole("button", { name: "Agent mode: Suggest" }).click();
  await page.getByRole("menuitemcheckbox", { name: /Edit Direct document edits/ }).click();
  await expect(page.getByLabel("Message", { exact: true })).toHaveAttribute(
    "placeholder",
    "Describe your changes…",
  );
  await page.getByRole("button", { name: "Agent model: Device default" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Cloud model" }).click();
  await expect(page.getByRole("button", { name: "Agent model: Cloud model" })).toBeVisible();
  await expect(page.locator(".cu-composer")).not.toContainText("Mode:");
  await page.getByRole("button", { name: "Add context" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Attachment" }).click();
  await (
    await chooser
  ).setFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Notes") });
  const removeAttachment = page.getByRole("button", { name: "Remove notes.txt" });
  await expect(removeAttachment).toHaveCSS("opacity", "1");
  await removeAttachment.click();
  await expect(removeAttachment).toHaveCount(0);

  const composer = page.locator(".cu-composer");
  await composer.evaluate((element) => {
    element.style.inlineSize = "190px";
  });
  const labels = composer.locator(".cu-composer-option-label");
  await labels.evaluateAll((elements) => {
    for (const label of elements) {
      label.textContent += " with a long workspace-specific name";
    }
  });
  await expect(labels.last()).toHaveCSS("text-overflow", "ellipsis");
  expect(
    await labels
      .last()
      .evaluate((label) => label.clientWidth > 0 && label.scrollWidth > label.clientWidth),
  ).toBe(true);
  expect(
    await composer.evaluate((element) => {
      const { left, right } = element.getBoundingClientRect();
      return Array.from(
        element.querySelectorAll(".cu-toolbar button, [data-slot=attachment]"),
      ).every((control) => {
        const bounds = control.getBoundingClientRect();
        return bounds.left >= left && bounds.right <= right;
      });
    }),
  ).toBe(true);
});
test("Change summaries collapse on apply and preserve undo per row", async ({ page }) => {
  await page.goto("/components/change-review");
  const review = page.getByRole("region", { name: "Change review" });
  const first = review.getByRole("article").first();
  const toggle = review.getByRole("button", { name: "Changes" });
  await expect(review).toContainText("2/3 reviewed");
  await first.getByLabel("View diff").click();
  await expect(first.locator(".cu-add")).toBeVisible();
  await first.getByRole("button", { name: "Apply change" }).click();
  await expect(first.locator(".cu-add")).toBeHidden();
  await expect(review).toContainText("3/3 reviewed");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(review.getByRole("article")).toHaveCount(0);
  await toggle.click();
  await first.getByRole("button", { name: "Undo" }).click();
  await expect(review).toContainText("2/3 reviewed");
  // Dismissal resolves a change too, so the counter still reaches completion.
  await first.getByRole("button", { name: "Dismiss" }).click();
  await expect(review).toContainText("3/3 reviewed");
});
test("Selection floats outside the text flow and block actions move paragraphs", async ({
  page,
}) => {
  await page.goto("/examples/document-editor");
  const field = page.getByRole("textbox", { name: "Document body" });
  const before = await field.boundingBox();
  await field.press("ControlOrMeta+a");
  const strip = page.locator(".cu-selection-toolbar");
  await expect(strip).toBeVisible();
  expect((await strip.boundingBox())!.y).toBeLessThan(before!.y);
  expect((await field.boundingBox())!.y).toBe(before!.y);
  await field.press("ArrowLeft");
  await expect(strip).toHaveCount(0);
  await field.hover();
  await page.getByRole("button", { name: "More block actions" }).first().click();
  await page.getByRole("menuitem", { name: "Move", exact: true }).press("ArrowRight");
  await page.getByRole("menuitem", { name: "Move down" }).click();
  await expect(field).toHaveValue(/At dusk/);
});

test("Block controls center on the first text line", async ({ page }) => {
  await page.goto("/components/block-controls");
  const block = page.locator(".cu-block").first();
  await block.hover();
  const grip = block.getByRole("button", { name: "Block actions", exact: true });
  await grip.press("Enter");
  await expect(page.getByRole("menu", { name: "Block actions", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(grip).toBeFocused();
  const controls = await block.locator(".cu-block-controls").boundingBox();
  const more = await block.locator(".cu-block-more").boundingBox();
  const firstLine = await block.evaluate((el) => {
    const top = el.getBoundingClientRect().top + parseFloat(getComputedStyle(el).paddingTop);
    return top + parseFloat(getComputedStyle(el).lineHeight) / 2;
  });
  // One pixel of tolerance absorbs subpixel rounding of 1lh.
  expect(Math.abs(controls!.y + controls!.height / 2 - firstLine)).toBeLessThanOrEqual(1);
  expect(Math.abs(more!.y + more!.height / 2 - firstLine)).toBeLessThanOrEqual(1);
});

test("Checkbox supports mixed state, keyboard and disabled state", async ({ page }) => {
  await page.goto("/components/checkbox");
  const control = page.getByRole("checkbox", { name: "Show recent pages" });
  await expect(control).toHaveAttribute("aria-checked", "mixed");
  await control.focus();
  await page.keyboard.press("Space");
  await expect(control).toBeChecked();
  const disabled = page.getByRole("checkbox", { name: "Read-only preference" });
  await expect(disabled).toBeDisabled();
  await expect(disabled).toBeChecked();
});

test("Foundation fields report values and feedback offers recovery", async ({ page }) => {
  await page.goto("/components/search-field");
  await page.getByRole("searchbox", { name: "Search documents" }).fill("atlas");
  await expect(page.getByText("Research atlas", { exact: true })).toBeVisible();

  await page.goto("/components/text-area");
  const draft = page.getByRole("textbox", { name: "Journal entry" });
  await draft.fill("Field notes\nSecond line");
  await expect(draft).toHaveValue("Field notes\nSecond line");

  await page.goto("/components/feedback");
  const preview = page.locator(".catalog-preview");
  const status = page.getByRole("combobox", { name: "State" });
  await status.selectOption("loading");
  await expect(preview.getByRole("status").filter({ hasText: "Loading pages" })).toBeVisible();
  await status.selectOption("error");
  await expect(preview.getByRole("alert")).toContainText("Could not load pages");
  await preview.getByRole("button", { name: "Retry" }).click();
  await expect(preview.getByRole("status")).toContainText("No pages yet");
});

test("Foundation overlays focus their contents and restore the trigger", async ({ page }) => {
  await page.goto("/components/dialog");
  const trigger = page.getByRole("button", { name: "Show properties" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Page properties" });
  await expect(dialog.getByRole("heading")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.goto("/components/confirm-action");
  const remove = page.getByRole("button", { name: "Remove attachment" });
  const confirmation = page.getByRole("alertdialog", { name: "Remove attachment?" });
  await remove.click();
  const cancel = confirmation.getByRole("button", { name: "Cancel" });
  await expect(cancel).toBeFocused();
  await cancel.click();
  await expect(remove).toBeFocused();
  await remove.click();
  await confirmation.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByRole("button", { name: "Undo removal" })).toBeVisible();
});

test("Closing a project preserves collection expansion and page selection", async ({ page }) => {
  await page.goto("/components/file-tree");
  const leaf = page.getByRole("button", { name: "Field notes", exact: true });
  await leaf.click();
  const project = page.getByRole("button", { name: "Research atlas", exact: true });
  await expect(project).toHaveAttribute("aria-expanded", "true");
  const names = page.locator(".catalog-file-tree-preview .cu-tree-name");
  const [root, collection, file, sibling] = await names.evaluateAll((labels) =>
    labels.map((label) => label.getBoundingClientRect().left),
  );
  expect(root).toBe(sibling);
  expect(collection).toBeGreaterThan(root);
  expect(file - collection).toBeCloseTo(collection - root);
  await project.press("Space");
  await expect(leaf).toHaveCount(0);
  await project.press("Enter");
  await expect(leaf).toHaveAttribute("aria-current", "true");
  await page.getByRole("button", { name: "Research atlas actions", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Open Research atlas", exact: true }).click();
  await expect(project).toHaveAttribute("aria-current", "true");
});

test("Button group switches spacing without resetting its actions", async ({ page }) => {
  await page.goto("/components/button-group");
  const group = page.getByRole("group", { name: "Zoom" });
  await group.getByText("+", { exact: true }).click();
  await page.getByLabel("Button layout").selectOption("separate");
  await expect(group).toHaveAttribute("data-layout", "separate");
  await expect(group).toContainText("110%");
});

test("Segmented control keeps a selection and accepts keyboard changes", async ({ page }) => {
  await page.goto("/components/segmented-control");
  const control = page.getByRole("radiogroup", { name: "Navigation mode" });
  const standard = control.getByRole("radio", { name: "Standard" });
  const expanded = control.getByRole("radio", { name: "Expanded" });
  await standard.click();
  await expect(standard).toBeChecked();
  await standard.press("ArrowRight");
  await expect(expanded).toBeFocused();
  await expanded.press("Space");
  await expect(expanded).toBeChecked();
});

test("Foundation controls size normal and compact icons from their tokens", async ({ page }) => {
  await page.goto("/components/chip");
  await page.addStyleTag({
    content: ":root { font-size: 20px; --ui-icon: 1.375rem; --ui-icon-sm: 0.75rem; }",
  });
  const copyIcon = page.getByRole("button", { name: "Copy example" }).locator("svg");
  const remove = page.getByRole("button", { name: "Remove Field notes" });
  await expect(copyIcon).toHaveCSS("width", "27.5px");
  await expect(copyIcon).toHaveCSS("stroke-width", "1.7px");
  await expect(remove.locator("svg")).toHaveCSS("width", "15px");
  await remove.click();
  await expect(page.getByRole("button", { name: "Attach Field notes" })).toBeVisible();
});

test("Sent messages share one scroll viewport and support return to latest", async ({ page }) => {
  await page.goto("/components/agent-panel");
  const viewport = page.locator('[data-slot="message-scroller-viewport"]');
  for (let i = 0; i < 9; i++) {
    await page.getByRole("textbox", { name: "Message" }).fill("Research note " + i);
    await page.getByRole("button", { name: "Send message", exact: true }).click();
  }
  await expect(viewport.locator('[data-slot="message-scroller-item"]')).toHaveCount(10);
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect
    .poll(() =>
      viewport.evaluate((el) => {
        const last = el.querySelectorAll('[data-slot="message-scroller-item"]');
        return Math.abs(
          el.getBoundingClientRect().bottom - last[last.length - 1].getBoundingClientRect().bottom,
        );
      }),
    )
    .toBeLessThanOrEqual(1);
  await viewport.hover();
  await page.mouse.wheel(0, -3000);
  const jump = page.getByRole("button", { name: "Jump to latest message" });
  await expect(jump).toHaveAttribute("data-active", "true");
  await jump.click();
  await expect(viewport.getByText("Research note 8")).toBeInViewport();
});

test("Demo navigation width persists after a keyboard resize", async ({ page }) => {
  await page.goto("/examples/knowledge-workspace");
  const handle = page.getByRole("separator", { name: "Navigation width" });
  const pane = page.locator('[data-panel][id="navigation"]');
  const width = () => pane.evaluate((el) => Math.round(el.getBoundingClientRect().width));
  const initial = await width();
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(width).toBeGreaterThan(initial);
  const resized = await width();
  await page.reload();
  await expect.poll(width).toBe(resized);
});

test("Long dialog content scrolls while the close control remains visible", async ({ page }) => {
  await page.goto("/components/dialog");
  await page.locator(".catalog-preview button").first().click();
  const dialog = page.getByRole("dialog");
  const viewport = dialog.locator('[data-slot="scroll-area-viewport"]');
  const offset = await viewport.evaluate((el) => {
    // Simulate host content arriving after the dialog has opened.
    const content = el.firstElementChild!;
    for (let i = 0; i < 100; i++) {
      content.append(document.createElement("br"));
    }
    el.scrollTop = el.scrollHeight;
    return el.scrollTop;
  });
  expect(offset).toBeGreaterThan(0);
  await expect(dialog.getByRole("button", { name: "Close" })).toBeInViewport();
});

test("The transcript follows the growing response to its actual bottom", async ({ page }) => {
  await page.goto("/examples/agent-review");
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  await input.fill("Review the trail");
  await input.press("Enter");
  const viewport = page.locator('[data-slot="message-scroller-viewport"]').first();
  const response = viewport.locator('[data-slot="message-scroller-item"]').last();
  await expect(response).toContainText("trail observations are ready for review.");
  await expect
    .poll(() => viewport.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
    .toBeLessThanOrEqual(1);
});

test("Reading earlier messages during streaming preserves scroll position", async ({ page }) => {
  await page.goto("/examples/agent-review");
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  await input.fill("Check the trail");
  await input.press("Enter");
  const viewport = page.locator('[data-slot="message-scroller-viewport"]').first();
  await viewport.hover();
  await page.mouse.wheel(0, -5000);
  await expect(page.getByLabel("Jump to latest message")).toHaveAttribute("data-active", "true");
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(viewport).toContainText("trail observations are ready for review.");
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBe(0);
});

test("Workspace footer controls sit on one line near the panel edges", async ({ page }) => {
  await page.goto("/examples/knowledge-workspace");
  const sidebar = page.getByRole("navigation", { name: "Workspace navigation" });
  const label = await sidebar.getByText("Local workspace").boundingBox();
  const button = await sidebar.getByRole("button", { name: "Customize sidebar" }).boundingBox();
  expect(
    Math.abs(label!.y + label!.height / 2 - button!.y - button!.height / 2),
  ).toBeLessThanOrEqual(1);
  for (const [panel, control] of [
    [".cu-sidebar", '[aria-label="Customize sidebar"]'],
    [".cu-agent", ".cu-composer"],
  ]) {
    const gap = await page.locator(panel).evaluate(
      (el, selector) => ({
        actual:
          el.getBoundingClientRect().bottom -
          el.querySelector(selector)!.getBoundingClientRect().bottom,
        expected: parseFloat(getComputedStyle(document.documentElement).fontSize) / 4,
      }),
      control,
    );
    if (control === ".cu-composer") {
      const gutter = await page
        .locator(panel)
        .evaluate((el) => getComputedStyle(el).getPropertyValue("--ui-panel-gutter"));
      expect(gap.actual).toBe(parseFloat(gutter));
    } else {
      expect(gap.actual).toBeLessThanOrEqual(gap.expected + 1);
    }
  }
});

test("Resizing the workspace keeps scrolling inside the sidebar and transcript", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2480, height: 1280 });
  await page.goto("/examples/knowledge-workspace");
  await page.getByRole("button", { name: "Color theme" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Dark", exact: true }).click();
  for (const size of [
    { width: 2480, height: 1280 },
    { width: 1440, height: 720 },
  ]) {
    await page.setViewportSize(size);
    await page.getByRole("separator", { name: "Agent width" }).press("ArrowLeft");
    await expect
      .poll(() =>
        page.locator("[data-panel]").evaluateAll((panels) =>
          panels.every((panel) => {
            const content = panel.firstElementChild;
            if (!(content instanceof HTMLElement)) {
              return false;
            }
            return (
              content.scrollHeight <= content.clientHeight + 1 &&
              content.scrollWidth <= content.clientWidth + 1 &&
              Math.abs(
                content.getBoundingClientRect().height -
                  (content.firstElementChild?.getBoundingClientRect().height ?? 0),
              ) <= 1
            );
          }),
        ),
      )
      .toBe(true);
    await expect(page.getByRole("button", { name: "Send message" })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: "Customize sidebar" })).toBeInViewport({
      ratio: 1,
    });
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      size.height + 1,
    );
  }
});

test("Workspace palette and page context menu use the same confirmation flow", async ({ page }) => {
  await page.goto("/examples/knowledge-workspace#atlas");
  await page.keyboard.press("ControlOrMeta+k");
  const search = page.getByRole("combobox", { name: "Search commands" });
  await search.fill("Move to trash");
  await search.press("Enter");
  const alert = page.getByRole("alertdialog", { name: "Move to trash?" });
  await expect(alert).toContainText("Atlas research");
  await alert.getByRole("button", { name: "Cancel" }).click();
  const nav = page.getByRole("navigation", { name: "Workspace navigation" });
  const row = nav.getByRole("button", { name: "Atlas research", exact: true }).first();
  await row.focus();
  await row.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await alert.getByRole("button", { name: "Move to trash" }).click();
  await nav.getByRole("button", { name: "Trash", exact: true }).click();
  await expect(page.locator(".cu-page-row").filter({ hasText: "Atlas research" })).toBeVisible();
});

test("Compact navigation reaches a nested project page", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/examples/knowledge-workspace");
  const nav = page.getByRole("navigation", { name: "Workspace navigation" });
  await nav
    .locator(".cu-nav-section")
    .getByRole("button", { name: "Projects", exact: true })
    .click();
  const popup = page.getByRole("dialog", { name: "Projects", exact: true });
  await popup.getByRole("button", { name: "Atlas research", exact: true }).click();
  await popup.getByRole("button", { name: "Field notes", exact: true }).click();
  await expect(popup).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Field notes", exact: true })).toBeVisible();
});

for (const theme of ["Dark", "Light"]) {
  test("Review diff and host tool output in " + theme, async ({ page }) => {
    await page.goto("/components/change-review");
    await page.getByRole("button", { name: "Color theme" }).click();
    await page.getByRole("menuitemcheckbox", { name: theme, exact: true }).click();
    await page.getByRole("button", { name: "View diff" }).first().click();
    await expect(page.locator(".cu-add").first()).toBeVisible();
    await page.goto("/components/change-diff");
    const diffTrigger = page.getByRole("button", { name: "View diff" });
    await diffTrigger.press("Enter");
    await expect(page.getByText("− We took notes.", { exact: true })).toBeVisible();
    await expect(
      page.getByText("+ We documented the trail conditions.", { exact: true }),
    ).toBeVisible();
    await page.goto("/components/activity-trace");
    await page.getByRole("button", { name: "Activity (4)" }).click();
    await page.getByRole("button", { name: /Read entry/ }).click();
    await expect(
      page.getByText("Mist gathered along the ridgeline.", { exact: true }),
    ).toBeVisible();
    await page.goto("/components/inline-citation");
    const citation = page.getByRole("link", { name: "Field notes", exact: true });
    await expect(citation).toHaveAttribute("href", "/examples/document-editor");
    await citation.focus();
    await expect(page.getByText("Observations from the northern trail.")).toBeVisible();
  });
}

test("Document history belongs to its tab and closes with one Escape", async ({ page }) => {
  await page.goto("/examples/document-editor");
  await page.getByRole("textbox", { name: "Document body" }).fill("Updated trail notes");
  const trigger = page.getByRole("button", { name: "History", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Recent versions" });
  await expect(dialog).toContainText("The northern trail");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(
    page.getByRole("img", { name: "Elevation profile of the north ridge" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Open documents" })
    .getByRole("button", { name: "Research atlas", exact: true })
    .click();
  await trigger.click();
  await expect(dialog).toContainText("No edits yet");
});
