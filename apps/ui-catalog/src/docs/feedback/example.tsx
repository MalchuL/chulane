/** Live Feedback usage, also displayed as source in the catalog. */
import { useState } from "react";
import { SelectField, Feedback } from "chulane_ui";

export default function Example() {
  const stackClassName = "cu-stack";
  const [state, setState] = useState<"error" | "empty" | "loading">("error");
  return (
    <div className={stackClassName}>
      <SelectField
        label="State"
        options={["empty", "loading", "error"]}
        value={state}
        onChange={(s) => setState(s as typeof state)}
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
