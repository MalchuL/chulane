/** Live Separator usage, also displayed as source in the catalog. */
import { Separator } from "chulane_ui";

export default function Example() {
  const stackClassName = "cu-stack";
  return (
    <div className={stackClassName}>
      <span>Workspace</span>
      <Separator />
      <span>Personal settings</span>
    </div>
  );
}
