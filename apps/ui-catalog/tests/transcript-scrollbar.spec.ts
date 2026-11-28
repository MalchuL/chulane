/** The transcript keeps its native scrollbar while following a sent message. */
import { expect, test } from "@playwright/test";

test("sending preserves the visible scrollbar while following the response", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.goto("/examples/knowledge-workspace");
  const viewport = page.locator('[data-slot="message-scroller-viewport"]');
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  await input.fill("Review this page");
  await expect(viewport).not.toHaveAttribute("data-autoscrolling", "");
  const idleColor = await viewport.evaluate((el) => getComputedStyle(el).scrollbarColor);

  await viewport.evaluate((el) => {
    const observer = new MutationObserver(() => {
      if (el.hasAttribute("data-autoscrolling") && el.scrollHeight > el.clientHeight) {
        observer.disconnect();
        el.setAttribute("data-observed-scrollbar", getComputedStyle(el).scrollbarColor);
      }
    });
    observer.observe(el, { attributes: true, attributeFilter: ["data-autoscrolling"] });
  });
  await input.press("Enter");
  await expect(viewport).toHaveAttribute("data-observed-scrollbar", idleColor);
});
