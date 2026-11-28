import { THEMES, type Theme } from "./db/schema";

const THEME_LABELS: Record<Theme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/** The FormData the theme buttons submit: `theme`. Null unless it's a known theme. */
export function parseTheme(formData: FormData): Theme | null {
  const theme = formData.get("theme");
  if (typeof theme !== "string") return null;
  return THEMES.find((t) => t === theme) ?? null;
}

/**
 * The `data-theme` value for the root element. `system` returns undefined so
 * the attribute is omitted and the OS preference applies (app/globals.css).
 */
export function themeAttribute(theme: Theme): "light" | "dark" | undefined {
  return theme === "system" ? undefined : theme;
}

export interface ThemeOption {
  value: Theme;
  label: string;
  selected: boolean;
}

export function settingsView(theme: Theme): ThemeOption[] {
  return THEMES.map((value) => ({
    value,
    label: THEME_LABELS[value],
    selected: value === theme,
  }));
}
