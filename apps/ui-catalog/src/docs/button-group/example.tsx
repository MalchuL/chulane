/** Live ButtonGroup usage, also displayed as source in the catalog. */
import { useState } from "react";
import { Button, ButtonGroup, SelectField, type ButtonLayout } from "@chulane/ui";

export default function Example() {
  const [layout, setLayout] = useState<ButtonLayout>("grouped");
  const [zoom, setZoom] = useState(100);
  return (
    <>
      <SelectField
        label="Button layout"
        value={layout}
        options={["grouped", "separate"]}
        onValueChange={(value) => setLayout(value === "grouped" ? "grouped" : "separate")}
      />
      <ButtonGroup label="Zoom" buttonLayout={layout}>
        <Button onClick={() => setZoom(zoom - 10)}>−</Button>
        <output>{zoom}%</output>
        <Button onClick={() => setZoom(zoom + 10)}>+</Button>
      </ButtonGroup>
    </>
  );
}
