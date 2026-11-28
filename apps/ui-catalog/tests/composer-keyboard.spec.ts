/** Exercises composer delivery with real keyboard input and browser composition events. */
import { expect, test } from "@playwright/test";

test("Composer respects Enter canceled during form capture", async ({ page }) => {
  await page.goto("/components/agent-composer");
  const message = page.getByRole("textbox", { name: "Message", exact: true });
  const draft = "Keep this draft";
  const welcome = page.getByText("How can I help with your workspace?", { exact: true });
  await message.fill(draft);

  await message.evaluate((element: HTMLTextAreaElement) => {
    element.form!.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
        }
      },
      { capture: true, once: true },
    );
  });

  await message.press("Enter");
  await expect(message).toHaveValue(draft);
  await expect(welcome).toBeVisible();

  await message.press("Enter");
  await expect(message).toBeEmpty();
  await expect(page.getByText(draft, { exact: true })).toBeVisible();
});

test("Composer keeps Enter available during IME composition", async ({
  browserName,
  page,
  context,
}) => {
  test.skip(browserName !== "chromium", "Chromium CDP drives browser composition.");
  await page.goto("/components/agent-composer");
  const message = page.getByRole("textbox", { name: "Message", exact: true });
  const draft = "日本語";
  const welcome = page.getByText("How can I help with your workspace?", { exact: true });
  await message.focus();

  const session = await context.newCDPSession(page);
  await session.send("Input.imeSetComposition", {
    text: draft,
    selectionStart: draft.length,
    selectionEnd: draft.length,
  });
  await expect(message).toHaveValue(draft);
  await message.press("Enter");
  await expect(welcome).toBeVisible();
  // CDP sends Enter to the textarea directly while the composition is active.
  await expect(message).toHaveValue(draft + "\n");
  await session.send("Input.insertText", { text: draft });

  await message.press("Enter");
  await expect(message).toBeEmpty();
  await expect(page.getByText(draft, { exact: true })).toBeVisible();
});
