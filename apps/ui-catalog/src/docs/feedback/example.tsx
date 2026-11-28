/** Live Feedback usage, also displayed as source in the catalog. */
import { useState } from "react";
import { SelectField, Feedback } from "@chulane/ui";
import type { FeedbackStatus } from "@chulane/ui";

/** Lets the reader preview each feedback status and retry a failed operation. */
export default function Example() {
  const stackClassName = "cu-stack";
  const [state, setState] = useState<FeedbackStatus>("error");
  return (
    <div className={stackClassName}>
      <SelectField
        label="State"
        options={["empty", "loading", "error"]}
        value={state}
        onValueChange={(value) => {
          if (value === "empty" || value === "loading" || value === "error") {
            setState(value);
          }
        }}
      />
      <Feedback
        state={state}
        message={
          {
            error: "Could not load pages",
            loading: "Loading pages…",
            empty: "No pages yet",
          }[state]
        }
        onRetry={() => setState("empty")}
      />
    </div>
  );
}
