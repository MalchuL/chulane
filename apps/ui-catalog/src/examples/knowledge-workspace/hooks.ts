/** Stores presentation preferences locally when the host enables persistence. */
import { useEffect, useState } from "react";
/**
 * Read and persist demo preferences, falling back to a local value when storage is unavailable.
 * @param key Browser storage key.
 * @param initial Default value.
 * @param accept Validator for previously stored values.
 * @returns The current value and its setter.
 */
export function useStoredPreference<T>(
  key: string,
  initial: T,
  accept: (input: unknown) => input is T,
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
      return accept(stored) ? stored : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* The UI continues with in-memory preferences. */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
