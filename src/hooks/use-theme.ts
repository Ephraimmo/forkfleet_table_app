import { useSyncExternalStore } from "react";
import {
  applyTheme,
  readThemePreference,
  resolveTheme,
  writeThemePreference,
  type Theme,
  type ThemePreference,
} from "@/lib/theme";

interface ThemeState {
  preference: ThemePreference;
  theme: Theme;
}

// One shared store, so every useTheme() sees the same theme and only one
// timer watches the clock.
let state: ThemeState | null = null;
const listeners = new Set<() => void>();
let timer: number | undefined;

function read(): ThemeState {
  const preference = readThemePreference();
  return { preference, theme: resolveTheme(preference) };
}

function refresh() {
  const next = read();
  if (state && next.preference === state.preference && next.theme === state.theme) return;
  state = next;
  applyTheme(next.theme);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    refresh();
    // Auto mode flips at 06:00 and 18:00: check every minute, and as soon as
    // the guest comes back to the tab.
    timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("storage", refresh);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", refresh);
    window.removeEventListener("storage", refresh);
  };
}

const getSnapshot = () => (state ??= read());
const SERVER_STATE: ThemeState = { preference: "auto", theme: "dark" };
const getServerSnapshot = () => SERVER_STATE;

export function useTheme() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    ...current,
    setPreference(preference: ThemePreference) {
      writeThemePreference(preference);
      refresh();
    },
  };
}
