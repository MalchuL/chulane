/** A bounded library scroll region with native keyboard navigation. */
import { ScrollArea } from "chulane_ui";
export default function Example() {
  const frame = "catalog-scroll-demo";
  return (
    <ScrollArea aria-label="Research notebook" className={frame}>
      {Array.from({ length: 24 }, (_, i) => (
        <p key={i}>Field note {i + 1}</p>
      ))}
    </ScrollArea>
  );
}
