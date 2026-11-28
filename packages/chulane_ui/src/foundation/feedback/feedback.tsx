/** Presents content status using the shared alert, empty and spinner primitives. */
import { cn } from "cn";
import { Alert } from "../../components/ui/alert.js";
import { Empty } from "../../components/ui/empty.js";
import { Spinner } from "../../components/ui/spinner.js";
import { Button } from "../button/button.js";
import type { FeedbackProps } from "./types.js";

/**
 * Show an empty, loading or error message in place of content.
 *
 * The host owns the operation, status and retry callback. Feedback announces the
 * message and displays a retry action when one is available for an error.
 *
 * @param props Status, message, retry callback and root attributes.
 * @returns The status surface and its optional retry button.
 * @example
 * <Feedback state="error" message="Could not load pages" onRetry={reloadPages} />
 */
export function Feedback({ state, message, onRetry, className, ...rest }: FeedbackProps) {
  const feedbackClassName = "cu-feedback";
  const Surface = ({ error: Alert, empty: Empty, loading: "div" } as const)[state];
  return (
    <Surface
      {...rest}
      className={cn(feedbackClassName, className)}
      data-feedback={state}
      role={state === "error" ? "alert" : "status"}
    >
      {state === "loading" && <Spinner />}
      {message}{" "}
      {state === "error" && onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Surface>
  );
}
