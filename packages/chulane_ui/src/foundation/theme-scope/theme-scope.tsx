/** Keeps local themes and token overrides available to portaled overlays. */
import { useState, useContext } from "react";
import { PortalHost, ButtonLayoutContext } from "./hooks.js";
import type { ThemeScopeProps, TokenStyle } from "./types.js";
export function ThemeScope({ theme, buttonLayout, tokens, children, className }: ThemeScopeProps) {
  const inherited = useContext(ButtonLayoutContext);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const surfaceClassName = "cu-surface";
  return (
    <div
      ref={setHost}
      className={[surfaceClassName, className].filter(Boolean).join(" ")}
      data-theme={theme}
      style={tokens as TokenStyle}
    >
      <PortalHost.Provider value={host}>
        <ButtonLayoutContext.Provider value={buttonLayout ?? inherited}>
          {children}
        </ButtonLayoutContext.Provider>
      </PortalHost.Provider>
    </div>
  );
}
