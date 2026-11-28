/** composer presentation and interaction contract. */
import { useContext } from "react";
import { ButtonGroup } from "../../foundation/button-group/button-group.js";
import { ButtonLayoutContext } from "../../foundation/theme-scope/hooks.js";

import {
  Attachment,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentAction,
} from "../../components/ui/attachment.js";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "../../components/ui/input-group.js";

import type { AgentComposerProps } from "./types.js";
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
  Folder,
  Paperclip,
  X,
} from "lucide-react";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import { ActionMenu } from "../../commands/action-menu/action-menu.js";

export type { ContextItem, AgentDraft, AgentComposerProps, ModelOption } from "./types.js";
const contextIcons = { page: FileText, project: Folder, attachment: Paperclip };
const modeInfo = {
  Ask: [MessageCircle, "Read-only answers", "Ask about your workspace…"],
  Suggest: [WandSparkles, "Review proposed changes", "What would you like to improve?"],
  Edit: [Pencil, "Direct document edits", "Describe your changes…"],
  Agent: [Bot, "Multi-step tasks", "Give your agent a task…"],
} as const;
function modeDetails(name: string) {
  return Object.hasOwn(modeInfo, name) ? modeInfo[name as keyof typeof modeInfo] : undefined;
}

/**
 * Compose a multiline request with context, an explicit mode and model.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered AgentComposer view.
 */
export function AgentComposer({
  draft: d,
  onChange,
  availableContext,
  models,
  modes,
  streaming,
  onSend,
  onStop,
  onQueue,
  onAttach,
}: AgentComposerProps) {
  const buttonLayout = useContext(ButtonLayoutContext) ?? "separate";
  const composerClassName = "cu-composer";
  const toolbarClassName = "cu-toolbar";
  const spacerClassName = "cu-spacer";
  const [ModeIcon, , prompt] = modeDetails(d.mode) ?? [Bot, "", "Ask your workspace…"];
  const modelItems = models.map((model) => {
    const label = typeof model === "string" ? model : model.label;
    const icon =
      typeof model === "string"
        ? Cpu
        : { device: Monitor, local: Cpu, cloud: Cloud }[model.location];
    return {
      id: label,
      label,
      icon,
      checked: label === d.model,
      run: () => onChange({ ...d, model: label }),
    };
  });
  const ModelIcon = modelItems.find((model) => model.checked)?.icon ?? Cpu;
  function chooseFiles() {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.multiple = true;
    picker.onchange = () => {
      if (picker.files?.length) {
        onAttach?.(Array.from(picker.files));
      }
    };
    picker.click();
  }
  const send = streaming ? onQueue : onSend;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (d.text.trim()) {
          send?.();
        }
      }}
    >
      <InputGroup className={composerClassName}>
        {d.context.length > 0 && (
          <InputGroupAddon align="block-start" className={toolbarClassName}>
            {d.context.map((c) => {
              const Icon = contextIcons[c.kind ?? "page"];
              return (
                <Attachment key={c.id} size="xs">
                  <AttachmentMedia>
                    <Icon />
                  </AttachmentMedia>
                  <AttachmentTitle>{c.label}</AttachmentTitle>
                  <AttachmentAction
                    type="button"
                    aria-label={"Remove " + c.label}
                    onClick={() =>
                      onChange({
                        ...d,
                        context: d.context.filter((x) => x.id !== c.id),
                      })
                    }
                  >
                    <X />
                  </AttachmentAction>
                </Attachment>
              );
            })}
          </InputGroupAddon>
        )}
        <InputGroupTextarea
          aria-label="Message"
          rows={2}
          placeholder={prompt}
          value={d.text}
          onChange={(e) => onChange({ ...d, text: e.target.value })}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.ctrlKey &&
              !e.altKey &&
              !e.metaKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              if (d.text.trim()) {
                send?.();
              }
            }
          }}
        />
        <InputGroupAddon align="block-end" className={toolbarClassName}>
          <ButtonGroup label="Composer options" buttonLayout={buttonLayout}>
            <ActionMenu
              label="Add context"
              trigger={
                <IconButton label="Add context">
                  <Plus />
                </IconButton>
              }
              items={[
                ...availableContext.map((c) => ({
                  id: c.id,
                  label: c.label,
                  icon: contextIcons[c.kind ?? "page"],
                  disabled: d.context.some((x) => x.id === c.id),
                  run: () => onChange({ ...d, context: [...d.context, c] }),
                })),
                ...(onAttach
                  ? [
                      {
                        id: "attach-file",
                        label: "Attachment",
                        icon: Paperclip,
                        run: chooseFiles,
                      },
                    ]
                  : []),
              ]}
            />
            <ActionMenu
              label="Agent mode"
              trigger={
                <IconButton label={"Agent mode: " + d.mode}>
                  <ModeIcon />
                  <ChevronDown />
                </IconButton>
              }
              items={modes.map((mode) => ({
                id: mode,
                label: mode,
                icon: modeDetails(mode)?.[0],
                description: modeDetails(mode)?.[1],
                checked: mode === d.mode,
                run: () => onChange({ ...d, mode }),
              }))}
            />
            <ActionMenu
              label="Agent model"
              trigger={
                <IconButton label={"Agent model: " + d.model}>
                  <ModelIcon />
                  <ChevronDown />
                </IconButton>
              }
              items={modelItems}
            />
          </ButtonGroup>
          <span className={spacerClassName} />
          <ButtonGroup label="Message delivery" buttonLayout={buttonLayout}>
            {streaming && (
              <IconButton label="Stop generation" onClick={onStop}>
                <Square />
              </IconButton>
            )}
            {send && (
              <IconButton
                label={streaming ? "Queue message" : "Send message"}
                variant="default"
                type="submit"
                disabled={!d.text.trim()}
              >
                <ArrowUp />
              </IconButton>
            )}
          </ButtonGroup>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
