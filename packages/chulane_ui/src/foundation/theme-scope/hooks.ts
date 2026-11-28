/** Shares the scoped DOM host and button layout with Chulane components. */
import { createContext, useContext } from "react";
import type { ButtonLayout } from "../button-group/types.js";

/** Holds the nearest scope's DOM node for use as a portal container. */
export const PortalHost = createContext<HTMLElement | null>(null);

/**
 * Read the DOM container used by themed overlays.
 * @returns The nearest scope's element, or null when none is mounted.
 * @example
 * const container = usePortalHost();
 */
export function usePortalHost() {
  return useContext(PortalHost);
}

/** Holds the nearest scope's button layout override. */
export const ButtonLayoutContext = createContext<ButtonLayout | undefined>(undefined);
