/** Private composer controls share icon mappings and read the current controlled draft. */
import { useContext } from "react";
import type { ComponentType } from "react";
import {
  ArrowUp,
  Square,
  Plus,
  Cpu,
  Monitor,
  Cloud,
  ChevronDown,
  WandSparkles,
  Bot,
  Pencil,
  MessageCircle,
  FileText,
  Pilcrow,
  FolderKanban,
  Paperclip,
  X,
} from "lucide-react";
import { ActionMenu } from "../../commands/action-menu/action-menu.js";
import type { MenuEntry } from "../../commands/types.js";
import { Attachment, AttachmentMedia, AttachmentTitle } from "../../components/ui/attachment.js";
import { InputGroupAddon } from "../../components/ui/input-group.js";
import type { ButtonLayout } from "../../foundation/button-group/types.js";
import { ButtonGroup } from "../../foundation/button-group/button-group.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import { ButtonLayoutContext } from "../../foundation/theme-scope/hooks.js";
import type {
  AgentComposerProps,
  AgentDraft,
  ContextItem,
  ContextItemKind,
  ModelOption,
} from "./types.js";

const contextIcons = {
  page: FileText,
  block: Pilcrow,
  project: FolderKanban,
  attachment: Paperclip,
} satisfies Record<ContextItemKind, ComponentType<{ className?: string }>>;
const modelIcons = { device: Monitor, local: Cpu, cloud: Cloud };
const modePresentation = {
  Ask: {
    icon: MessageCircle,
    description: "Read-only answers",
    prompt: "Ask about your workspace…",
  },
  Suggest: {
    icon: WandSparkles,
    description: "Review proposed changes",
    prompt: "What would you like to improve?",
  },
  Edit: { icon: Pencil, description: "Direct document edits", prompt: "Describe your changes…" },
  Agent: { icon: Bot, description: "Multi-step tasks", prompt: "Give your agent a task…" },
} as const;
const toolbarClassName = "cu-toolbar";

type ContextChipsProps = {
  context: readonly ContextItem[];
  onRemove: (id: string) => void;
};
type ToolbarProps = Pick<
  AgentComposerProps,
  "draft" | "availableContext" | "models" | "modes" | "streaming" | "onStop" | "onAttach"
> & {
  onDraftUpdate: (change: Partial<AgentDraft>) => void;
  deliveryAvailable: boolean;
  canDeliver: boolean;
};
type AddContextMenuProps = {
  selected: readonly ContextItem[];
  options: readonly ContextItem[];
  onAdd: (item: ContextItem) => void;
  onAttach?: AgentComposerProps["onAttach"];
};
type DeliveryControlsProps = Pick<
  ToolbarProps,
  "streaming" | "onStop" | "deliveryAvailable" | "canDeliver"
> & {
  layout: ButtonLayout;
};
type OptionMenuProps<Option> = {
  value: string;
  options: readonly Option[];
  onValueChange: (value: string) => void;
};
type OptionTriggerProps = {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
};

/** Look up the built-in presentation for a mode. Custom mode names use generic presentation. */
export function modeDetails(name: string) {
  return Object.hasOwn(modePresentation, name)
    ? modePresentation[name as keyof typeof modePresentation]
    : undefined;
}

/** Show removable chips for selected context. Omit the row while the draft has no context. */
export function ContextChips({ context, onRemove }: ContextChipsProps) {
  const removeClassName = "cu-composer-remove-context";
  if (!context.length) {
    return null;
  }
  return (
    <InputGroupAddon align="block-start" className={toolbarClassName}>
      {context.map((item) => {
        const Icon = contextIcons[item.kind ?? "page"];
        return (
          <Attachment key={item.id} size="xs" title={item.label}>
            <AttachmentMedia>
              <Icon aria-hidden />
            </AttachmentMedia>
            <AttachmentTitle>{item.label}</AttachmentTitle>
            <IconButton
              className={removeClassName}
              size="icon-xs"
              label={"Remove " + item.label}
              onClick={() => onRemove(item.id)}
            >
              <X />
            </IconButton>
          </Attachment>
        );
      })}
    </InputGroupAddon>
  );
}

/** Render selection and delivery controls with independent space for the delivery actions. */
export function ComposerToolbar({
  draft,
  availableContext,
  models,
  modes,
  streaming,
  onStop,
  onAttach,
  onDraftUpdate,
  deliveryAvailable,
  canDeliver,
}: ToolbarProps) {
  const layout = useContext(ButtonLayoutContext) ?? "separate";
  return (
    <InputGroupAddon align="block-end" className={toolbarClassName}>
      <ButtonGroup label="Composer options" buttonLayout={layout}>
        <AddContextMenu
          selected={draft.context}
          options={availableContext}
          onAdd={(item) => onDraftUpdate({ context: [...draft.context, item] })}
          onAttach={onAttach}
        />
        <ModeMenu
          value={draft.mode}
          options={modes}
          onValueChange={(mode) => onDraftUpdate({ mode })}
        />
        <ModelMenu
          value={draft.model}
          options={models}
          onValueChange={(model) => onDraftUpdate({ model })}
        />
      </ButtonGroup>
      <DeliveryControls {...{ layout, streaming, onStop, deliveryAvailable, canDeliver }} />
    </InputGroupAddon>
  );
}

/** Offer context that is not attached yet and open the file picker on request. */
function AddContextMenu({ selected, options, onAdd, onAttach }: AddContextMenuProps) {
  const contextItems: MenuEntry[] = options.map((item) => ({
    id: item.id,
    label: item.label,
    icon: contextIcons[item.kind ?? "page"],
    disabled: selected.some((entry) => entry.id === item.id),
    onSelect: () => onAdd(item),
  }));
  if (onAttach) {
    contextItems.push({
      id: "attach-file",
      label: "Attachment",
      icon: contextIcons.attachment,
      onSelect: () => chooseFiles(onAttach),
    });
  }
  return (
    <ActionMenu
      label="Add context"
      items={contextItems}
      trigger={
        <IconButton label="Add context">
          <Plus />
        </IconButton>
      }
    />
  );
}

/** Route stop and delivery intents through the composer form and host callbacks. */
function DeliveryControls({
  layout,
  streaming,
  onStop,
  deliveryAvailable,
  canDeliver,
}: DeliveryControlsProps) {
  return (
    <ButtonGroup label="Message delivery" buttonLayout={layout}>
      {streaming && (
        <IconButton label="Stop generation" onClick={onStop}>
          <Square />
        </IconButton>
      )}
      {deliveryAvailable && (
        <IconButton
          label={streaming ? "Queue message" : "Send message"}
          variant={canDeliver ? "default" : "secondary"}
          type="submit"
          disabled={!canDeliver}
        >
          <ArrowUp />
        </IconButton>
      )}
    </ButtonGroup>
  );
}

/** Show the current mode and offer all host-provided modes. */
function ModeMenu({ value, options, onValueChange }: OptionMenuProps<string>) {
  const label = "Agent mode";
  return (
    <ActionMenu
      label={label}
      trigger={optionTrigger({ label, value, icon: modeDetails(value)?.icon ?? Bot })}
      items={options.map((mode) => {
        const details = modeDetails(mode);
        return {
          id: mode,
          label: mode,
          icon: details?.icon,
          description: details?.description,
          checked: mode === value,
          onSelect: () => onValueChange(mode),
        };
      })}
    />
  );
}

/** Show the selected model and identify each option by its execution location. */
function ModelMenu({ value, options, onValueChange }: OptionMenuProps<ModelOption>) {
  const label = "Agent model";
  const selected = options.find((model) => model.label === value);
  return (
    <ActionMenu
      label={label}
      trigger={optionTrigger({
        label,
        value,
        icon: selected ? modelIcons[selected.location] : Cpu,
      })}
      items={options.map(({ label, location }) => ({
        id: label,
        label,
        icon: modelIcons[location],
        checked: label === value,
        onSelect: () => onValueChange(label),
      }))}
    />
  );
}

/** Build a menu trigger whose full accessible label survives visual truncation. */
function optionTrigger({ label, value, icon: Icon }: OptionTriggerProps) {
  const optionClassName = "cu-composer-option";
  const labelClassName = "cu-composer-option-label";
  return (
    <IconButton label={label + ": " + value} className={optionClassName}>
      <Icon />
      <span className={labelClassName}>{value}</span>
      <ChevronDown />
    </IconButton>
  );
}

/** Open the native file picker and give its nonempty selection to the host. */
function chooseFiles(onAttach: NonNullable<AgentComposerProps["onAttach"]>) {
  const picker = document.createElement("input");
  picker.type = "file";
  picker.multiple = true;
  picker.onchange = () => {
    if (picker.files?.length) {
      onAttach(Array.from(picker.files));
    }
  };
  picker.click();
}
