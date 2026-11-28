/** Composes the agent header, scrolling transcript and anchored host controls. */
import { cn } from "cn";
import { Plus, MoreHorizontal, X, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { ActionMenu } from "../../commands/action-menu/action-menu.js";
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerButton,
} from "../../components/ui/message-scroller.js";
import { ButtonGroup } from "../../foundation/button-group/button-group.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import { InTranscript } from "./context.js";
import type { AgentPanelProps } from "./types.js";

type PanelHeaderProps = Pick<AgentPanelProps, "title" | "menu" | "onNew" | "onClose">;

/**
 * Keep an agent transcript scrollable and its composer anchored.
 *
 * The host supplies conversation data and actions. The panel owns scroll placement and follow behavior.
 * @param props Transcript, slots, section attributes and host actions.
 * @returns The agent conversation section.
 * @example
 * <AgentPanel title="Workspace agent" composer={composer} menu={[]} onNew={create}>
 *   {messages}
 * </AgentPanel>
 */
export function AgentPanel({
  title,
  children,
  composer,
  selector,
  queue,
  menu,
  onNew,
  onClose,
  className,
  ...rest
}: AgentPanelProps) {
  const panelClassName = "cu-agent cu-surface";
  return (
    <section {...rest} className={cn(panelClassName, className)}>
      <PanelHeader title={title} menu={menu} onNew={onNew} onClose={onClose} />
      {selector}
      <Transcript>{children}</Transcript>
      {queue}
      {composer}
    </section>
  );
}

/** Render the panel heading and forward header actions to the host. */
function PanelHeader({ title, menu, onNew, onClose }: PanelHeaderProps) {
  const toolbarClassName = "cu-toolbar";
  const spacerClassName = "cu-spacer";
  return (
    <header className={toolbarClassName}>
      <Sparkles aria-hidden />
      <strong>{title}</strong>
      <span className={spacerClassName} />
      <ButtonGroup label="Conversation actions">
        <IconButton label="New conversation" onClick={onNew}>
          <Plus />
        </IconButton>
        <ActionMenu
          label="Agent options"
          items={menu}
          trigger={
            <IconButton label="Agent options">
              <MoreHorizontal />
            </IconButton>
          }
        />
        {onClose && (
          <IconButton label="Close agent" onClick={onClose}>
            <X />
          </IconButton>
        )}
      </ButtonGroup>
    </header>
  );
}

/** Register message rows with the scroll provider and offer a jump to the latest message. */
function Transcript({ children }: { children: ReactNode }) {
  const logClassName = "cu-log";
  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className={logClassName}>
        <MessageScrollerViewport>
          <MessageScrollerContent aria-label="Conversation">
            <InTranscript.Provider value>{children}</InTranscript.Provider>
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton aria-label="Jump to latest message" />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
