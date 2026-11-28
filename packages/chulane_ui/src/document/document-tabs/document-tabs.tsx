/** Document navigation that pairs each selectable title with its close control. */
import { X } from "lucide-react";
import { ButtonGroup } from "../../components/ui/button-group.js";
import { Button } from "../../foundation/button/button.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import { ScrollArea } from "../../foundation/scroll-area/scroll-area.js";
import type { DocumentTab, DocumentTabsProps } from "./types.js";

const tabDragType = "text/chulane-tab";

/**
 * Switch, reorder and close open documents.
 *
 * The host owns the open tabs, their order and the active id. The component
 * forwards pointer and keyboard interactions as requests to update those values.
 *
 * @param props Controlled navigation and attributes for the scroll container.
 * @returns The horizontally scrollable document navigation.
 * @example
 * <DocumentTabs tabs={tabs} value={activeId} onValueChange={setActiveId} onClose={closeTab} onMove={moveTab} />
 */
export function DocumentTabs({
  label = "Open documents",
  tabs,
  value,
  onValueChange,
  onClose,
  onMove,
  ...rest
}: DocumentTabsProps) {
  const tabsClassName = "cu-tabs";
  return (
    <ScrollArea {...rest} orientation="horizontal">
      <nav aria-label={label} className={tabsClassName}>
        {tabs.map((tab, index) => (
          <DocumentTabItem
            key={tab.id}
            tab={tab}
            selected={tab.id === value}
            previousId={tabs[index - 1]?.id}
            nextId={tabs[index + 1]?.id}
            onSelect={() => onValueChange(tab.id)}
            onClose={() => onClose(tab.id)}
            onMove={onMove}
            onDrop={(id) => {
              if (tabs.some((candidate) => candidate.id === id)) {
                onMove(id, tab.id);
              }
            }}
          />
        ))}
      </nav>
    </ScrollArea>
  );
}

type DocumentTabItemProps = {
  tab: DocumentTab;
  selected: boolean;
  previousId?: string;
  nextId?: string;
  onSelect: () => void;
  onClose: () => void;
  onMove: DocumentTabsProps["onMove"];
  onDrop: (id: string) => void;
};

/**
 * Render an independently selectable, closable and draggable document tab.
 * @param props The document, adjacent ids and callbacks for tab interactions.
 * @returns A tab action group containing its title and close button.
 */
function DocumentTabItem(props: DocumentTabItemProps) {
  const { tab, selected, previousId, nextId, onSelect, onClose, onMove, onDrop } = props;
  const tabClassName = "cu-document-tab";
  const Icon = tab.icon;
  return (
    <ButtonGroup
      className={tabClassName}
      orientation={null}
      aria-label={tab.title + " tab actions"}
      draggable
      onDragStart={(event) => event.dataTransfer.setData(tabDragType, tab.id)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onDrop(event.dataTransfer.getData(tabDragType))}
    >
      <Button
        variant="ghost"
        aria-pressed={selected}
        aria-description={tab.description}
        title={tab.description}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) {
            return;
          }
          const targetId = event.key === "ArrowLeft" ? previousId : nextId;
          if (targetId !== undefined) {
            event.preventDefault();
            onMove(tab.id, targetId);
          }
        }}
      >
        {Icon && <Icon aria-hidden />}
        {tab.title}
      </Button>
      <IconButton label={"Close " + tab.title} size="icon-xs" onClick={onClose}>
        <X />
      </IconButton>
    </ButtonGroup>
  );
}
