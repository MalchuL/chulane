/** Measures the selection relative to its block, including native textarea selections. */
import { useLayoutEffect, useRef, useState } from "react";

/** A textarea has no DOM Range. Mirror its typography and wrap width to locate the selected line. */
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

export function useSelectionPosition(visible: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>();
  useLayoutEffect(() => {
    const bar = ref.current;
    const owner = bar?.parentElement;
    if (!visible || !owner || !bar) {
      return;
    }
    function measure() {
      if (!owner || !bar) {
        return;
      }
      const selection = window.getSelection();
      const field = owner.querySelector("textarea");
      let selected: DOMRect | undefined;
      if (field && field.selectionEnd > field.selectionStart) {
        selected = textareaRect(field);
      } else if (
        selection?.rangeCount &&
        !selection.isCollapsed &&
        owner.contains(selection.anchorNode)
      ) {
        selected = selection.getRangeAt(0).getClientRects()[0];
      }
      const bounds = owner.getBoundingClientRect();
      const left = selected
        ? Math.max(
            0,
            Math.min(
              selected.left - bounds.left + (selected.width - bar.offsetWidth) / 2,
              bounds.width - bar.offsetWidth,
            ),
          )
        : 0;
      const containingBlock = bar.offsetParent;
      const origin = containingBlock?.getBoundingClientRect();
      const x = left + bounds.left - (origin?.left ?? 0);
      const top = (selected?.top ?? bounds.top) - (origin?.top ?? 0);
      setPosition((old) => (old?.left === x && old.top === top ? old : { left: x, top }));
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(owner);
    document.addEventListener("selectionchange", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("selectionchange", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [visible]);
  return { ref, position };
}
