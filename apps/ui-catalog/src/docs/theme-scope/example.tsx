/** A locally dark surface keeps its palette when the popover opens. */
import { ThemeScope, Popover, Button } from "@chulane/ui";
export default function Example() {
  return (
    <ThemeScope theme="dark" tokens={{ "--ui-accent": "var(--ui-selected)" }}>
      <Popover label="Scoped appearance" trigger={<Button>Inspect appearance</Button>}>
        <p>This overlay inherits its surrounding theme.</p>
      </Popover>
    </ThemeScope>
  );
}
