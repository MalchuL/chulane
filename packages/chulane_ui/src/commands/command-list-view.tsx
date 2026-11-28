/** Shared searchable command list for palette and editor insertion. */
import { ScrollArea } from "../components/ui/scroll-area.js";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "../components/ui/command.js";
import { Kbd } from "../components/ui/kbd.js";
import type { Command as Entry } from "./types.js";
export function CommandListView({
  commands,
  label,
  onSelect,
  autoFocus = false,
}: {
  autoFocus?: boolean;
  commands: Entry[];
  label: string;
  onSelect: (c: Entry) => void;
}) {
  const groups = new Map<string, Entry[]>();
  for (const command of commands) {
    if (!command.disabled) {
      const name = command.group ?? "";
      const entries = groups.get(name) ?? [];
      entries.push(command);
      groups.set(name, entries);
    }
  }
  return (
    <Command label={label} loop>
      <CommandInput autoFocus={autoFocus} aria-label={label} placeholder={label} />
      <ScrollArea className="cu-scroll-overlay">
        <CommandList>
          <CommandEmpty>No matching commands</CommandEmpty>
          {Array.from(groups, ([name, entries]) => (
            <CommandGroup key={name} heading={name || undefined}>
              {entries.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  keywords={[c.label, c.group ?? ""]}
                  onSelect={() => onSelect(c)}
                >
                  {c.icon && <c.icon />}
                  {c.label}
                  {c.shortcut && (
                    <CommandShortcut>
                      <Kbd>{c.shortcut}</Kbd>
                    </CommandShortcut>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </ScrollArea>
    </Command>
  );
}
