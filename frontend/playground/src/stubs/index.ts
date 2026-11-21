import "./theme.css";
import { defineHaStubs } from "./ha-elements";
import { installLoadCardHelpers } from "./load-card-helpers";

export type ThemeName = "light" | "dark" | "frosted";
export const THEMES: ThemeName[] = ["light", "dark", "frosted"];

export function installStubs(): void {
  defineHaStubs();
  installLoadCardHelpers();
}

export function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("playground-theme", theme);
  } catch {}
}

export function initialTheme(): ThemeName {
  try {
    const t = localStorage.getItem("playground-theme") as ThemeName | null;
    if (t && THEMES.includes(t)) return t;
  } catch {}
  return "light";
}

export { createCardElement } from "./load-card-helpers";
