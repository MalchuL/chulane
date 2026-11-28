/** panel presentation and interaction contract. */
import { InTranscript } from "../panel/context.js";
import { ButtonGroup } from "../../foundation/button-group/button-group.js";

import type { AgentPanelProps } from "./types.js";
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerButton,
} from "../../components/ui/message-scroller.js";
import { Plus, MoreHorizontal, X, Sparkles } from "lucide-react";
import { ActionMenu } from "../../commands/action-menu/action-menu.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";

export type { AgentPanelProps } from "./types.js";

/**
 * Keep the conversation scrollable and its composer anchored.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered AgentPanel view.
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
}: AgentPanelProps) {
  const agentSurfaceClassName = "cu-agent cu-surface";
  const toolbarClassName = "cu-toolbar";
  const spacerClassName = "cu-spacer";
  const logClassName = "cu-log";
  return (
    <section className={agentSurfaceClassName}>
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
      {selector}
      <MessageScrollerProvider autoScroll>
        <MessageScroller className={logClassName}>
          <MessageScrollerViewport>
            <MessageScrollerContent className="justify-end" aria-label="Conversation">
              <InTranscript.Provider value>{children}</InTranscript.Provider>
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton aria-label="Jump to latest message" />
        </MessageScroller>
      </MessageScrollerProvider>
      {queue}
      {composer}
    </section>
  );
}
