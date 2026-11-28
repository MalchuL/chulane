/** Shares Radix tooltip timing across a subtree, including nested theme scopes. */
import { createContext, useContext } from "react";
import { TooltipProvider as RegistryTooltipProvider } from "../../components/ui/tooltip.js";
import type { TooltipProviderProps } from "./types.js";

const TooltipScope = createContext(false);
const defaultDelayDuration = 300;
const defaultSkipDelayDuration = 300;

/**
 * Share hover delays among descendants. A nested provider inherits timing unless it
 * supplies an override, which starts a fresh timing window.
 * @param props Descendants and optional timing overrides in milliseconds.
 * @returns The descendants under the inherited or newly configured provider.
 */
export function TooltipProvider({
  children,
  delayDuration,
  skipDelayDuration,
}: TooltipProviderProps) {
  const hasProvider = useContext(TooltipScope);
  if (hasProvider && delayDuration === undefined && skipDelayDuration === undefined) {
    return children;
  }

  return (
    <TooltipScope.Provider value={true}>
      <RegistryTooltipProvider
        delayDuration={delayDuration ?? defaultDelayDuration}
        skipDelayDuration={skipDelayDuration ?? defaultSkipDelayDuration}
      >
        {children}
      </RegistryTooltipProvider>
    </TooltipScope.Provider>
  );
}
