/** Mounts the browser catalog against the built package and compiled theme. */
import { createRoot } from "react-dom/client";
import "chulane_ui/globals.css";
import "./catalog.css";
import { Catalog } from "./catalog";
createRoot(document.getElementById("root")!).render(<Catalog />);
