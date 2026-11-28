/** Keeps theme and token overrides available to descendants and their portaled overlays. */
import { cn } from "cn";
import { useContext, useState } from "react";
import { TooltipProvider } from "../tooltip/tooltip-provider.js";
import { ButtonLayoutContext, PortalHost } from "./hooks.js";
import type { ThemeScopeProps } from "./types.js";

/**
 * Apply local theme settings to a subtree and its overlays.
 *
 * The host provides palette, token and spacing overrides. The scope owns the
 * portal container so Radix overlays inherit the same CSS variables as their triggers.
 * Its tooltips share a timing window with the nearest provider.
 *
 * @param props Theme overrides, descendants and root div attributes.
 * @returns A themed div that also hosts its descendants' portals.
 * @example
 * <ThemeScope theme="dark" tokens={{ "--ui-icon": "1.375rem" }}>
 *   <button>Local action</button>
 * </ThemeScope>
 */
export function ThemeScope({
  theme,
  buttonLayout,
  tokens,
  children,
  className,
  style,
  ...rest
}: ThemeScopeProps) {
  const inherited = useContext(ButtonLayoutContext);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const surfaceClassName = "cu-surface";
  return (
    <div
      {...rest}
      ref={setHost}
      className={cn(surfaceClassName, className)}
      data-theme={theme}
      style={{ ...style, ...tokens }}
    >
      <PortalHost.Provider value={host}>
        <ButtonLayoutContext.Provider value={buttonLayout ?? inherited}>
          <TooltipProvider>{children}</TooltipProvider>
        </ButtonLayoutContext.Provider>
      </PortalHost.Provider>
    </div>
  );
}
