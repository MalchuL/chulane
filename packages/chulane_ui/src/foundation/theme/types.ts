/** Defines the requested and effective color themes. */

/** The concrete palette applied to a document or theme scope. */
export type ResolvedTheme = "light" | "dark";

/** The host's palette choice, which can follow the operating system. */
export type ThemePreference = "system" | ResolvedTheme;

/** The current theme selection and the operation for changing it. */
export type UseThemeResult = {
  /** Stored palette choice, which defaults to "system". */
  preference: ThemePreference;
  /** Effective palette. On the server, "system" resolves to "light". */
  resolved: ResolvedTheme;
  /** Saves the next palette choice and notifies other theme controls. */
  setPreference: (preference: ThemePreference) => void;
};
