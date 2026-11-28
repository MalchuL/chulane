/** Subscribes theme controls to a shared preference and tracks the system palette. */
import { useEffect, useSyncExternalStore } from "react";
export type ThemePreference = "system" | "light" | "dark";
const preferences = new Map<string, ThemePreference>();
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("chulane-theme", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("chulane-theme", listener);
  };
}
export function useTheme(storageKey = "chulane.theme") {
  const preference = useSyncExternalStore(
    subscribe,
    () => {
      try {
        const saved = localStorage.getItem(storageKey);
        return saved === "dark" || saved === "light" ? saved : "system";
      } catch {
        return preferences.get(storageKey) ?? "system";
      }
    },
    () => "system" as ThemePreference,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const systemTheme = media.matches ? "dark" : "light";
      document.documentElement.dataset.theme = preference === "system" ? systemTheme : preference;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);
  function setPreference(value: ThemePreference) {
    preferences.set(storageKey, value);
    try {
      localStorage.setItem(storageKey, value);
    } catch {
      /* Keep the in-memory preference. */
    }
    window.dispatchEvent(new Event("chulane-theme"));
  }
  return { preference, setPreference };
}
