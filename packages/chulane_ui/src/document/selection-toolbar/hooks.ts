/** Measures the selection relative to its block, including native textarea selections. */
import { useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { Ref } from "react";

/**
 * Mirror the typography and width of a textarea to measure its native selection.
 * @param field The textarea with a non-collapsed selection.
 * @returns The first selected line's viewport rectangle, if laid out.
 */
function textareaRect(field: HTMLTextAreaElement) {
  const mirror = document.createElement("div");
  const style = getComputedStyle(field);
  for (const property of [
    "font",
    "line-height",
    "letter-spacing",
    "padding",
    "border",
    "box-sizing",
    "tab-size",
    "text-align",
    "direction",
  ]) {
    mirror.style.setProperty(property, style.getPropertyValue(property));
  }
  const bounds = field.getBoundingClientRect();
  Object.assign(mirror.style, {
    position: "fixed",
    visibility: "hidden",
    pointerEvents: "none",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    width: bounds.width + "px",
    left: bounds.left + "px",
    top: bounds.top - field.scrollTop + "px",
  });
  const span = document.createElement("span");
  span.textContent = field.value.slice(field.selectionStart, field.selectionEnd);
  mirror.append(
    field.value.slice(0, field.selectionStart),
    span,
    field.value.slice(field.selectionEnd),
  );
  document.body.append(mirror);
  const rect = span.getClientRects()[0];
  mirror.remove();
  return rect;
}

/**
 * Find the first selected line in a textarea or a DOM range inside the block.
 * @param owner The element that contains both the editor and toolbar.
 * @returns The first selected line's viewport rectangle, if available.
 */
function selectionRect(owner: HTMLElement) {
  const field = owner.querySelector("textarea");
  if (field && field.selectionEnd > field.selectionStart) {
    return textareaRect(field);
  }
  const selection = window.getSelection();
  if (selection?.rangeCount && !selection.isCollapsed && owner.contains(selection.anchorNode)) {
    return selection.getRangeAt(0).getClientRects()[0];
  }
}

/**
 * Intersect the visible window with the scrollports and clips that contain the toolbar.
 * @param owner The containing editing block.
 * @returns The vertical interval that can display the toolbar.
 */
function visibleInterval(owner: HTMLElement) {
  let top = 0;
  let bottom = document.documentElement.clientHeight;
  for (let node: HTMLElement | null = owner; node; node = node.parentElement) {
    if (getComputedStyle(node).overflowY === "visible") {
      continue;
    }
    const edge = node.getBoundingClientRect().top + node.clientTop;
    top = Math.max(top, edge);
    bottom = Math.min(bottom, edge + node.clientHeight);
  }
  return { top, bottom };
}

/**
 * Center the toolbar on the selected line, moving below it when the upper space is clipped.
 * @param bar The mounted toolbar.
 * @param owner The containing block that bounds horizontal movement.
 * @returns Left and top offsets in CSS pixels relative to the positioned ancestor.
 */
function measurePosition(bar: HTMLDivElement, owner: HTMLElement) {
  const selected = selectionRect(owner);
  const bounds = owner.getBoundingClientRect();
  const width = bar.offsetWidth;
  const height = bar.offsetHeight;
  const gap = parseFloat(getComputedStyle(bar).paddingBlockStart);
  let left = 0;
  if (selected) {
    const center = selected.left - bounds.left + (selected.width - width) / 2;
    left = Math.max(0, Math.min(center, bounds.width - width));
  }
  const visible = visibleInterval(owner);
  const above = (selected?.top ?? bounds.top) - gap;
  const below = (selected?.bottom ?? bounds.top) + gap;
  const spaceAbove = above - visible.top;
  const spaceBelow = visible.bottom - below;
  let top = above - height;
  if (spaceAbove < height && spaceBelow >= spaceAbove) {
    top = below;
  }
  top = Math.max(visible.top, Math.min(top, visible.bottom - height));
  const parent = bar.offsetParent;
  const origin = parent?.getBoundingClientRect();
  return {
    left:
      left +
      bounds.left -
      (origin?.left ?? 0) -
      (parent?.clientLeft ?? 0) +
      (parent?.scrollLeft ?? 0),
    top: top - (origin?.top ?? 0) - (parent?.clientTop ?? 0) + (parent?.scrollTop ?? 0),
  };
}

/**
 * Reposition the mounted toolbar on selection, resize and scroll, then release observers on unmount.
 * @param forwardedRef The host's optional ref to the same toolbar element.
 * @returns The toolbar ref and its most recently measured offsets.
 * @example
 * const { ref, position } = useSelectionPosition(forwardedRef);
 * return <div ref={ref} style={position} />;
 */
export function useSelectionPosition(forwardedRef?: Ref<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>();
  useImperativeHandle(forwardedRef, () => ref.current!, []);
  useLayoutEffect(() => {
    const bar = ref.current;
    const owner = bar?.parentElement;
    if (!owner) {
      return;
    }

    /** Update position only when either measured offset has changed. */
    const measure = () => {
      const next = measurePosition(bar, owner);
      setPosition((previous) =>
        previous?.left === next.left && previous.top === next.top ? previous : next,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(owner);
    observer.observe(bar);
    document.addEventListener("selectionchange", measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("selectionchange", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, []);
  return { ref, position };
}
