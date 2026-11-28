/** command toolbar presentation and interaction contract. */
import { ButtonGroup } from "../../foundation/button-group/button-group.js";

import type { CommandToolbarProps } from "./types.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import { Button } from "../../foundation/button/button.js";

export type { CommandToolbarProps } from "./types.js";
/**
 * Place frequently used commands in a compact row.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered CommandToolbar view.
 */
export function CommandToolbar({ label, commands, buttonLayout }: CommandToolbarProps) {
  return (
    <ButtonGroup label={label} buttonLayout={buttonLayout}>
      {commands.map((c) =>
        c.icon ? (
          <IconButton
            label={c.label}
            key={c.id}
            disabled={c.disabled}
            aria-pressed={c.checked}
            onClick={c.run}
          >
            <c.icon />
          </IconButton>
        ) : (
          <Button
            variant="ghost"
            key={c.id}
            disabled={c.disabled}
            aria-pressed={c.checked}
            onClick={c.run}
          >
            {c.label}
          </Button>
        ),
      )}
    </ButtonGroup>
  );
}
