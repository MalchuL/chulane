/** Internal searchable result list for the command palette. */
import { ScrollArea } from "../../components/ui/scroll-area.js";
import {
  Command as CommandRoot,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "../../components/ui/command.js";
import { Kbd } from "../../components/ui/kbd.js";
import type { Command } from "../types.js";

/**
 * Render searchable commands without owning execution or the enclosing surface's lifetime.
 * @param props Commands, input label, and selection callback.
 * @returns A command input and scrollable result list.
 */
export function CommandListView({
  commands,
  label,
  onSelect,
}: {
  commands: readonly Command[];
  label: string;
  onSelect: (command: Command) => void;
}) {
  const scrollClassName = "cu-scroll-overlay";
  const groups = groupEnabledCommands(commands);
  return (
    <CommandRoot label={label} loop>
      <CommandInput aria-label={label} placeholder={label} />
      <ScrollArea className={scrollClassName}>
        <CommandList>
          <CommandEmpty>No matching commands</CommandEmpty>
          {Array.from(groups, ([name, entries]) => (
            <CommandGroup key={name} heading={name || undefined}>
              {entries.map((command) => (
                <CommandResult key={command.id} command={command} onSelect={onSelect} />
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </ScrollArea>
    </CommandRoot>
  );
}

/**
 * Collect enabled commands by heading, preserving the host's display order.
 * @param commands Commands supplied by the host.
 * @returns Groups indexed by heading, including the unnamed group when present.
 */
function groupEnabledCommands(commands: readonly Command[]) {
  const groups = new Map<string, Command[]>();
  for (const command of commands) {
    if (!command.disabled) {
      const name = command.group ?? "";
      const entries = groups.get(name) ?? [];
      entries.push(command);
      groups.set(name, entries);
    }
  }
  return groups;
}

/**
 * Render a search result with a stable command id and searchable display text.
 * @param props The command record and selection callback owned by the surface.
 * @returns A result row that reports its original command when selected.
 */
function CommandResult({
  command,
  onSelect,
}: {
  command: Command;
  onSelect: (command: Command) => void;
}) {
  const rowClassName = "cu-list-row";
  const labelClassName = "min-w-0 flex-1 wrap-anywhere";
  const shortcutClassName = "shrink-0";
  const { id, label, group, icon: Icon, shortcut } = command;
  return (
    <CommandItem
      className={rowClassName}
      value={id}
      keywords={[label, group ?? ""]}
      onSelect={() => onSelect(command)}
    >
      {Icon && <Icon aria-hidden />}
      <span className={labelClassName}>{label}</span>
      {shortcut && (
        <CommandShortcut className={shortcutClassName}>
          <Kbd>{shortcut}</Kbd>
        </CommandShortcut>
      )}
    </CommandItem>
  );
}
