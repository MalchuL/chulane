/** Contracts for scoped tooltip timing and trigger content. */
import type { ReactElement, ReactNode } from "react";

/** Timing overrides for a subtree of tooltips. */
export type TooltipProviderProps = {
  /** Time before the first pointer tooltip opens, in milliseconds. Defaults to 300. */
  delayDuration?: number;
  /** Time after closing when another tooltip can open immediately. Defaults to 300 ms. */
  skipDelayDuration?: number;
  /** Content that shares the timing window. */
  children: ReactNode;
};

/** Content and pointer behavior for a tooltip anchored to a control. */
export type TooltipProps = {
  /** Focusable element that accepts the trigger attributes and ref. */
  trigger: ReactElement;
  /** Text or formatted content that describes the trigger. */
  children: ReactNode;
  /** Preferred placement relative to the trigger. Defaults to "top". */
  side?: "top" | "bottom";
  /** Whether the pointer can enter the tooltip without closing it. Defaults to false. */
  hoverable?: boolean;
};
