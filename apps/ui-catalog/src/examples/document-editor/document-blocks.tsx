/** Composes editable paragraphs with insert, reorder and delete requests handled by the local document. */
import { EditableBlock, type TextBlock } from "./editable-block";
export function DocumentBlocks({
  blocks: documentBlocks,
  onChange: update,
}: {
  blocks: TextBlock[];
  onChange: (blocks: TextBlock[]) => void;
}) {
  return documentBlocks.map((block, i) => (
    <EditableBlock
      key={block.id}
      block={block}
      first={i === 0}
      last={i === documentBlocks.length - 1}
      onText={(value) =>
        update(documentBlocks.map((b) => (b.id === block.id ? { ...b, text: value } : b)))
      }
      onInsert={(value) =>
        update([
          ...documentBlocks.slice(0, i + 1),
          { id: crypto.randomUUID(), text: value },
          ...documentBlocks.slice(i + 1),
        ])
      }
      onDelete={() =>
        update(
          documentBlocks.length === 1
            ? [{ ...block, text: "" }]
            : documentBlocks.filter((b) => b.id !== block.id),
        )
      }
      onMove={(direction) => {
        const next = [...documentBlocks];
        next.splice(i + direction, 0, ...next.splice(i, 1));
        update(next);
      }}
      onDropBlock={(id) => {
        const moving = documentBlocks.find((b) => b.id === id);
        if (!moving || moving === block) {
          return;
        }
        const next = documentBlocks.filter((b) => b !== moving);
        next.splice(i, 0, moving);
        update(next);
      }}
    />
  ));
}
