// Light by day, dark at night. A guest can pin light or dark instead; the
// choice is remembered on this phone. <html class="dark"> switches the palette
// (see styles.css).

export type ThemePreference = "auto" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "hearth:theme";
/** Local time the light theme starts and ends in auto mode: 06:00–18:00. */
export const DAY_STARTS_AT = 6;
export const NIGHT_STARTS_AT = 18;

/** The browser bar colour, matching --background. */
const THEME_COLOR: Record<Theme, string> = { light: "#f4f5f7", dark: "#0d1116" };

export function themeForTime(date = new Date()): Theme {
  const hour = date.getHours();
  return hour >= DAY_STARTS_AT && hour < NIGHT_STARTS_AT ? "light" : "dark";
}

export function resolveTheme(preference: ThemePreference, date = new Date()): Theme {
  return preference === "auto" ? themeForTime(date) : preference;
}

export function readThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "auto";
  } catch {
    return "auto";
  }
}

export function writeThemePreference(preference: ThemePreference) {
  try {
    if (preference === "auto") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* private mode: the choice lasts until the page closes */
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

/** Runs in <head> before the page paints, so it never flashes the wrong theme. */
export const THEME_BOOT_SCRIPT = `(function(){var p;try{p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})}catch(e){}var h=new Date().getHours();var t=p==="light"||p==="dark"?p:h>=${DAY_STARTS_AT}&&h<${NIGHT_STARTS_AT}?"light":"dark";var r=document.documentElement;r.classList.toggle("dark",t==="dark");r.style.colorScheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="dark"?${JSON.stringify(
  THEME_COLOR.dark,
)}:${JSON.stringify(THEME_COLOR.light)})})();`;
