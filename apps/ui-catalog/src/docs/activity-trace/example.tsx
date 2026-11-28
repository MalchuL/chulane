/** Live ActivityTrace example for the reference page. */
import { ActivityTrace } from "chulane_ui";
export default function Example() {
  return (
    <ActivityTrace
      activity={[
        {
          id: "plan",
          kind: "plan",
          title: "Review the journal",
          detail: "Read the selected entry and check its revisions.",
        },
        {
          id: "read",
          kind: "tool",
          title: "Read entry",
          status: "complete",
          input: "November journal",
          output: "Mist gathered along the ridgeline.",
        },
        {
          id: "compare",
          kind: "reasoning",
          title: "Compared two revisions",
          detail: "The revised passage adds a location.",
        },
        { id: "review", kind: "task", title: "Awaiting approval", status: "pending" },
      ]}
    />
  );
}
