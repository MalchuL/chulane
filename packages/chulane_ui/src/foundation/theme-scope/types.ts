/** Theme and custom property overrides for one component subtree. */
import type { ButtonLayout } from "../button-group/types.js";
import type { CSSProperties, ReactNode } from "react";
export type ThemeScopeProps = {
  buttonLayout?: ButtonLayout;
  theme?: "light" | "dark";
  tokens?: Partial<Record<`--ui-${string}`, string>>;
  children: ReactNode;
  className?: string;
};
export type TokenStyle = CSSProperties & ThemeScopeProps["tokens"];
