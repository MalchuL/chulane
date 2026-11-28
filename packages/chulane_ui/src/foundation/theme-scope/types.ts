/** Defines scoped theme and token overrides for a component subtree. */
import type { ComponentPropsWithoutRef } from "react";
import type { ButtonLayout } from "../button-group/types.js";
import type { ResolvedTheme } from "../theme/types.js";

/** Custom properties for Chulane UI, keyed by their CSS variable names. */
export type ThemeTokens = Partial<Record<`--ui-${string}`, string>>;

/** Root attributes and local theme overrides for ThemeScope. */
export type ThemeScopeProps = ComponentPropsWithoutRef<"div"> & {
  /** Button spacing inside the scope. Defaults to the inherited layout. */
  buttonLayout?: ButtonLayout;
  /** Palette inside the scope. Defaults to the inherited palette. */
  theme?: ResolvedTheme;
  /** Local CSS variable overrides. Defaults to the inherited tokens. */
  tokens?: ThemeTokens;
};
