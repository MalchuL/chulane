/** Checks the shared tab appearance and separate keyboard actions in the public catalog. */
import { expect, test } from "@playwright/test";

test("Document title and close control share the selected tab", async ({ page }) => {
  await page.goto("/components/document-tabs");
  const tabs = page.getByRole("navigation", { name: "Open documents" });
  const notes = tabs.getByRole("group", { name: "Field notes tab actions" });
  const atlas = tabs.getByRole("group", { name: "Research atlas tab actions" });
  const notesTitle = notes.getByRole("button", { name: "Field notes", exact: true });
  const atlasTitle = atlas.getByRole("button", { name: "Research atlas", exact: true });
  const closeAtlas = atlas.getByRole("button", { name: "Close Research atlas" });

  await expect(notes).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(notesTitle).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(atlas).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await atlasTitle.press("Enter");
  await expect(atlasTitle).toHaveAttribute("aria-pressed", "true");
  await expect(atlas).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.keyboard.press("Tab");
  await expect(closeAtlas).toBeFocused();
  await expect(page.getByRole("tooltip", { name: "Close Research atlas" })).toBeAttached();
  await page.keyboard.press("Enter");
  await expect(atlas).toHaveCount(0);
  await expect(notesTitle).toHaveAttribute("aria-pressed", "true");
});
