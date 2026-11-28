/** feedback presentation and interaction contract. */
import { Spinner } from "../../components/ui/spinner.js";

import { Empty } from "../../components/ui/empty.js";

import { Alert } from "../../components/ui/alert.js";

import type { FeedbackProps } from "./types.js";
import { Button } from "../button/button.js";

export type { FeedbackProps } from "./types.js";
/**
 * Present an empty, loading or failure state in place of content.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered Feedback view.
 */
export function Feedback({ state, message, onRetry }: FeedbackProps) {
  const feedbackClassName = "cu-feedback";
  const Surface = ({ error: Alert, empty: Empty, loading: "div" } as const)[state];
  return (
    <Surface className={feedbackClassName} role={state === "error" ? "alert" : "status"}>
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
