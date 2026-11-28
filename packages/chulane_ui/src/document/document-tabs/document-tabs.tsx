/** Document navigation that groups each title and close control around host-owned actions. */
import { X } from "lucide-react";
import { ButtonGroup } from "../../components/ui/button-group.js";
import { Button } from "../../foundation/button/button.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import { ScrollArea } from "../../foundation/scroll-area/scroll-area.js";
import type { DocumentTabsProps } from "./types.js";

export type { DocumentTab, DocumentTabsProps } from "./types.js";

/**
 * Switch, reorder and close open documents.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered DocumentTabs view.
 */
export function DocumentTabs(props: DocumentTabsProps) {
  const { label = "Open documents", tabs, active, onSelect, onClose, onMove } = props;
  const tabsClassName = "cu-tabs";
  const tabClassName = "cu-document-tab";
  return (
    <ScrollArea orientation="horizontal">
      <nav aria-label={label} className={tabsClassName}>
        {tabs.map((t, i) => (
          <ButtonGroup
            key={t.id}
            className={tabClassName}
            orientation={null}
            aria-label={t.title + " tab actions"}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/chulane-tab", t.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("text/chulane-tab");
              if (tabs.some((t) => t.id === id)) {
                onMove(id, t.id);
              }
            }}
          >
            <Button
              variant="ghost"
              aria-pressed={t.id === active}
              aria-description={t.description}
              title={t.description}
              onClick={() => onSelect(t.id)}
              onKeyDown={(e) => {
                if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
                  const next = tabs[i + (e.key === "ArrowLeft" ? -1 : 1)];
                  if (next) {
                    e.preventDefault();
                    onMove(t.id, next.id);
                  }
                }
              }}
            >
              {t.icon && <t.icon aria-hidden />}
              {t.title}
            </Button>
            <IconButton label={"Close " + t.title} size="icon-xs" onClick={() => onClose(t.id)}>
              <X />
            </IconButton>
          </ButtonGroup>
        ))}
      </nav>
    </ScrollArea>
  );
}
