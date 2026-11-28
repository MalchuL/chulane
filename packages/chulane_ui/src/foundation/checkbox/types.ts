/** Public data and callback contracts for checkbox. */
import type { Checkbox } from "../../components/ui/checkbox.js";

import type { ComponentProps } from "react";
export type CheckboxProps = ComponentProps<typeof Checkbox> & { label: string };
