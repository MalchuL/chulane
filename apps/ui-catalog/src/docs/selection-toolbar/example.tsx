/** Select text or hover over a paragraph to reveal editing actions in their original context. */
import { useState } from "react";
import { DocumentBlocks } from "../../examples/document-editor/document-blocks";
export default function Example() {
  const frame = "catalog-selection-demo";
  const [blocks, setBlocks] = useState([
    {
      id: "senses",
      text: "Cats see well in dim light, hear high-pitched sounds, and use scent to investigate and mark familiar places.",
    },
    { id: "whiskers", text: "Their whiskers detect nearby surfaces and air movement." },
  ]);
  return (
    <section className={frame}>
      <h3>Senses and behavior</h3>
      <DocumentBlocks blocks={blocks} onChange={setBlocks} />
    </section>
  );
}
