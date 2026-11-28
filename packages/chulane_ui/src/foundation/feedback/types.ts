/** Defines the view states that hosts can present with Feedback. */
import type { ComponentProps } from "react";

/** The status displayed while content is empty, loading, or unavailable. */
export type FeedbackStatus = "empty" | "loading" | "error";

/** Visible status, message and optional recovery action. */
export type FeedbackProps = Omit<ComponentProps<"div">, "children"> & {
  /** Chooses the visual treatment and live-region role. */
  state: FeedbackStatus;
  /** Text that explains the current state. */
  message: string;
  /** Offers a retry action in the error state. Defaults to no action. */
  onRetry?: () => void;
};
