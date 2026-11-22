import "./theme.css";
import { defineHaStubs } from "./ha-elements";
import { installLoadCardHelpers } from "./load-card-helpers";
import { haThemesToCss } from "./ha-themes";
import type { ThemeMode } from "./ha-themes";
import themesYaml from "share-space-themes/share_space.yaml?raw";

export type { ThemeMode };
export type ThemeName = string;
const haThemes = haThemesToCss(themesYaml);
export const THEMES: ThemeName[] = ["default", ...haThemes.names];
export const MODES: ThemeMode[] = ["light", "dark"];
export interface ThemeChoice {
  theme: ThemeName;
  mode: ThemeMode;
}

export function installStubs(): void {
  const style = document.createElement("style");
  style.textContent = haThemes.css;
  document.head.append(style);
  defineHaStubs();
  installLoadCardHelpers();
}

/** Like HA: a theme plus a light / dark mode (`modes:` in theme YAML). */
export function applyTheme({ theme, mode }: ThemeChoice): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.mode = mode;
  try {
    localStorage.setItem("playground-theme", JSON.stringify({ theme, mode }));
  } catch {}
}

export function initialTheme(): ThemeChoice {
  try {
    const raw = localStorage.getItem("playground-theme") ?? "";
    // older single value: "light" / "dark"
    if (raw === "light" || raw === "dark") return { theme: "default", mode: raw };
    const v = JSON.parse(raw) as Partial<ThemeChoice>;
    if (v.theme && THEMES.includes(v.theme) && v.mode && MODES.includes(v.mode)) return { theme: v.theme, mode: v.mode };
  } catch {}
  return { theme: "default", mode: "light" };
}

export { createCardElement } from "./load-card-helpers";
