/** Filters block types and reports insertion or dismissal to the editor host. */
import { cn } from "cn";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "../../components/ui/command.js";
import { Kbd } from "../../components/ui/kbd.js";
import { ScrollArea } from "../../components/ui/scroll-area.js";
import type { SlashMenuOption, SlashMenuProps } from "./types.js";

/**
 * Collect available options under their supplied group names, in input order.
 * @param options All block types supplied by the host.
 * @returns The ordered entries for each visible group.
 */
function groupOptions(options: readonly SlashMenuOption[]) {
  const groups = new Map<string, SlashMenuOption[]>();
  for (const option of options) {
    if (option.disabled) {
      continue;
    }
    const group = option.group ?? "";
    const entries = groups.get(group) ?? [];
    entries.push(option);
    groups.set(group, entries);
  }
  return groups;
}

/**
 * Render the scrollable command results with labels and keyboard hints.
 * @param props The host's options and selection callback.
 * @returns The list of available block types.
 */
function SlashMenuResults({ options, onSelect }: Pick<SlashMenuProps, "options" | "onSelect">) {
  const scrollClassName = "cu-scroll-overlay";
  const rowClassName = "cu-list-row";
  return (
    <ScrollArea className={scrollClassName}>
      <CommandList>
        <CommandEmpty>No matching commands</CommandEmpty>
        {Array.from(groupOptions(options), ([group, entries]) => (
          <CommandGroup key={group} heading={group || undefined}>
            {entries.map(({ id, label, icon: Icon, shortcut }) => (
              <CommandItem
                key={id}
                className={rowClassName}
                value={id}
                keywords={[label, group]}
                onSelect={() => onSelect(id)}
              >
                {Icon && <Icon />}
                {label}
                {shortcut && (
                  <CommandShortcut>
                    <Kbd>{shortcut}</Kbd>
                  </CommandShortcut>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </ScrollArea>
  );
}

/**
 * Present a searchable, keyboard-navigable list of block types.
 *
 * The menu focuses its search input on mount and filters against the controlled query. The host
 * owns the query, insertion, dismissal and focus restoration.
 * @param props The options, controlled query, editor callbacks and section attributes.
 * @returns The inline block picker.
 * @example
 * <SlashMenu options={[{ id: "paragraph", label: "Paragraph" }]} query={query}
 *   onQueryChange={setQuery} onSelect={insertBlock} onClose={closeMenu} />
 */
export function SlashMenu({
  options,
  query,
  onQueryChange,
  onSelect,
  onClose,
  className,
  onKeyDown,
  ...rest
}: SlashMenuProps) {
  const menuClassName = "cu-menu cu-slash-menu";
  const searchLabel = "Find block type";
  return (
    <section
      aria-label="Insert a block"
      {...rest}
      className={cn(menuClassName, className)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <Command label={searchLabel} loop>
        <CommandInput
          autoFocus
          aria-label={searchLabel}
          placeholder={searchLabel}
          value={query}
          onValueChange={onQueryChange}
        />
        <SlashMenuResults options={options} onSelect={onSelect} />
      </Command>
    </section>
  );
}
