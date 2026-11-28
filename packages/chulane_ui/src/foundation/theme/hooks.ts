/** Synchronizes a persisted theme choice with system preferences and the document root. */
import { useEffect, useSyncExternalStore } from "react";
import type { ResolvedTheme, ThemePreference, UseThemeResult } from "./types.js";

const preferences = new Map<string, ThemePreference>();
const themeChangedEvent = "chulane-theme";
const darkThemeQuery = "(prefers-color-scheme: dark)";

/**
 * Listen for preference changes in this window and other tabs.
 * @param listener Callback that asks React to read the current preference again.
 * @returns Cleanup for both listeners.
 */
function subscribePreference(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(themeChangedEvent, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(themeChangedEvent, listener);
  };
}

/**
 * Listen for operating system palette changes.
 * @param listener Callback that asks React to read the system palette again.
 * @returns Cleanup for the media-query listener.
 */
function subscribeSystemTheme(listener: () => void) {
  const media = window.matchMedia(darkThemeQuery);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

/**
 * Read the browser's current preference for the given storage key.
 * @param storageKey Local storage key shared by theme controls.
 * @returns The saved preference or its in-memory or system fallback.
 */
function readPreference(storageKey: string): ThemePreference {
  try {
    const saved = window.localStorage.getItem(storageKey);
    return saved === "dark" || saved === "light" ? saved : "system";
  } catch {
    return preferences.get(storageKey) ?? "system";
  }
}

/**
 * Read the system palette from the browser.
 * @returns The current light or dark palette.
 */
function readSystemTheme(): ResolvedTheme {
  return window.matchMedia(darkThemeQuery).matches ? "dark" : "light";
}

/**
 * Track a theme preference and apply its resolved palette to the document.
 *
 * The host chooses the palette and should share the same storage key across
 * controls that manage one document. The hook synchronizes tabs and responds
 * to system palette changes. It uses an in-memory preference if storage is blocked.
 *
 * @param storageKey Preference storage key. Defaults to "chulane.theme".
 * @returns The stored preference, current palette and preference setter.
 * @example
 * const { preference, resolved, setPreference } = useTheme();
 */
export function useTheme(storageKey = "chulane.theme"): UseThemeResult {
  const preference = useSyncExternalStore<ThemePreference>(
    subscribePreference,
    () => readPreference(storageKey),
    () => "system",
  );
  const systemTheme = useSyncExternalStore<ResolvedTheme>(
    subscribeSystemTheme,
    readSystemTheme,
    () => "light",
  );
  const resolved = preference === "system" ? systemTheme : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  /**
   * Store the next preference and notify subscribers in the current window.
   * @param value The next palette preference.
   */
  function setPreference(value: ThemePreference) {
    preferences.set(storageKey, value);
    try {
      window.localStorage.setItem(storageKey, value);
    } catch {
      // The in-memory preference remains available when storage is blocked.
    }
    window.dispatchEvent(new Event(themeChangedEvent));
  }

  return { preference, resolved, setPreference };
}
