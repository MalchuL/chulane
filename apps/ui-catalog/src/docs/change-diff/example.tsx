/** Live ChangeDiff example for the reference page. */
import { ChangeDiff } from "@chulane/ui";

/**
 * Demonstrates the standard text-labeled diff trigger.
 * @returns A collapsed comparison of two passages.
 */
export default function Example() {
  return <ChangeDiff before="We took notes." after="We documented the trail conditions." />;
}
