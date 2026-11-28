/** separator presentation and interaction contract. */
import { Separator as Divider } from "../../components/ui/separator.js";

/**
 * Separate groups inside a menu or panel.
 * @returns The rendered Separator view.
 */
export function Separator() {
  const separatorClassName = "cu-separator";
  return <Divider className={separatorClassName} />;
}
