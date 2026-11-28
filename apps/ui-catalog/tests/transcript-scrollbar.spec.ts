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

test("The transcript fades clipped content below the conversation tabs", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto("/examples/agent-review");
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  await input.fill("Review the trail");
  await input.press("Enter");
  const viewport = page.locator('[data-slot="message-scroller-viewport"]');
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeGreaterThan(0);

  await expect(viewport).toContainText("trail observations are ready for review.");
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect
    .poll(() =>
      viewport.evaluate((element) => {
        const style = getComputedStyle(element);
        const fade = style.getPropertyValue("--scroll-fade-t").trim();
        return parseFloat(fade) > 0 && style.maskImage.includes(`rgb(0, 0, 0) ${fade},`);
      }),
    )
    .toBe(true);

  await viewport.hover();
  await page.mouse.wheel(0, -1000);
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(0);
  await expect
    .poll(() =>
      viewport.evaluate((element) =>
        parseFloat(getComputedStyle(element).getPropertyValue("--scroll-fade-t")),
      ),
    )
    .toBe(0);
});
