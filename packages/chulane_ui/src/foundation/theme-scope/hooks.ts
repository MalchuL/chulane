/** Shares the scoped DOM host with Radix portals, including nested submenus. */
import type { ButtonLayout } from "../button-group/types.js";
import { createContext, useContext } from "react";
export const PortalHost = createContext<HTMLElement | null>(null);
export function usePortalHost() {
  return useContext(PortalHost);
}

export const ButtonLayoutContext = createContext<ButtonLayout | undefined>(undefined);
