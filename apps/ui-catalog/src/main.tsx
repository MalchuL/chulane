/** Mounts the browser catalog against the built package and compiled theme. */
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@chulane/ui";
import "@chulane/ui/styles.css";
import "./catalog.css";
import { Catalog } from "./catalog";

createRoot(document.getElementById("root")!).render(
  <TooltipProvider>
    <Catalog />
  </TooltipProvider>,
);
