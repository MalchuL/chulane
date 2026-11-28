/** Public slots and host actions for the agent conversation panel. */
import type { ComponentProps, ReactNode } from "react";
import type { MenuEntry } from "../../commands/types.js";

/** Host-authored transcript, controls and section attributes. */
export type AgentPanelProps = Omit<ComponentProps<"section">, "onClose"> & {
  /** Visible conversation panel heading. */
  title: string;
  /** Messages rendered in chronological order. */
  children: ReactNode;
  /** Request editor anchored below the transcript and queue. */
  composer: ReactNode;
  /** Optional host-supplied conversation picker or related controls. */
  selector?: ReactNode;
  /** Optional queued requests shown above the composer. */
  queue?: ReactNode;
  /** Actions in the panel options menu. */
  menu: MenuEntry[];
  /** Creates a conversation when requested. */
  onNew: () => void;
  /** Closes the panel when supplied and enables the close button. */
  onClose?: () => void;
};
