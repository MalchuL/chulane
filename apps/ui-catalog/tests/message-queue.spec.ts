/** Covers queue edit teardown and keyboard focus against the built component library. */
import { expect, test } from "@playwright/test";

test("Host removal and unmount release the queue edit and discard unsaved text", async ({
  page,
}) => {
  await page.goto("/components/message-queue");
  const queue = page.getByRole("list", { name: "Queued messages" });
  const edit = queue.getByRole("button", { name: "Edit queued message" });
  const editor = queue.getByRole("textbox", { name: "Edit queued message" });
  const status = page.getByRole("status").filter({ hasText: "Delivery" });

  await edit.click();
  await editor.fill("Unsaved edit");
  await expect(status).toHaveText("Delivery paused while editing");
  await page.getByRole("button", { name: "Clear queue" }).click();
  await expect(queue).toBeEmpty();
  await expect(status).toHaveText("Delivery ready");
  await page.getByRole("button", { name: "Restore sample" }).click();
  await edit.click();
  await expect(editor).toHaveValue("Compare the two revisions.");

  await editor.fill("Another unsaved edit");
  await page.getByRole("button", { name: "Hide queue" }).click();
  await expect(queue).toHaveCount(0);
  await expect(status).toHaveText("Delivery ready");
  await page.getByRole("button", { name: "Show queue" }).click();
  await edit.click();
  await expect(editor).toHaveValue("Compare the two revisions.");
});

test("Queue edits move keyboard focus into the editor and back to the row", async ({ page }) => {
  await page.goto("/components/message-queue");
  const queue = page.getByRole("list", { name: "Queued messages" });
  const edit = queue.getByRole("button", { name: "Edit queued message" });
  const editor = queue.getByRole("textbox", { name: "Edit queued message" });

  await edit.focus();
  await page.keyboard.press("Enter");
  await expect(editor).toBeFocused();
  await editor.fill("Discard this change");
  await page.keyboard.press("Tab");
  await expect(queue.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(edit).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(editor).toHaveValue("Compare the two revisions.");
  await editor.fill("Compare all revisions.");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(queue.getByRole("button", { name: "Save" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(edit).toBeFocused();
  await expect(queue).toContainText("Compare all revisions.");
});

test("Delivery waits for a queue edit and leaves the independent composer caret alone", async ({
  page,
}) => {
  await page.goto("/examples/agent-review");
  const draft = page.getByRole("textbox", { name: "Message", exact: true });
  const queue = page.getByRole("list", { name: "Queued messages" });
  const transcript = page.getByRole("log", { name: "Conversation" });
  await draft.fill("First request");
  await draft.press("Enter");
  await draft.fill("Queued follow-up");
  await page.getByRole("button", { name: "Queue message" }).click();
  await draft.fill("Independent draft");
  await draft.evaluate((field: HTMLTextAreaElement) => field.setSelectionRange(3, 3));

  await queue.getByRole("button", { name: "Edit queued message" }).click();
  await queue.getByRole("textbox", { name: "Edit queued message" }).fill("Edited follow-up");
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
  await expect(queue.getByRole("textbox")).toHaveValue("Edited follow-up");
  await expect(transcript).not.toContainText("Queued follow-up");
  await expect(transcript).not.toContainText("Edited follow-up");

  await queue.getByRole("button", { name: "Save" }).click();
  await expect(transcript).toContainText("Edited follow-up");
  await expect(queue).toBeEmpty();
  await expect(draft).toHaveValue("Independent draft");
  await expect(draft).toHaveJSProperty("selectionStart", 3);
  await expect(draft).toHaveJSProperty("selectionEnd", 3);
  await expect(page.getByRole("button", { name: "Remove Opening paragraph" })).toBeVisible();
});
