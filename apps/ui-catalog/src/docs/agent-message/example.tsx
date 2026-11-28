/** Live AgentMessage usage, also displayed as source in the catalog. */
import { AgentMessage } from "chulane_ui";
const reference = { id: "field", label: "Field notes", href: "#field-notes" };

export default function Example() {
  return (
    <AgentMessage
      author="Workspace agent"
      references={[reference]}
      activity={["Read Field notes", "Compared revisions"]}
    >
      <p>
        I found <strong>two observations</strong> about the northern trail.
      </p>
    </AgentMessage>
  );
}
