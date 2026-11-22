import { useState } from "react";
import { MODES, THEMES, applyTheme, initialTheme } from "./stubs";
import type { ThemeChoice, ThemeMode, ThemeName } from "./stubs";

// Theme + light/dark mode selects, like HA's profile theme settings.
export function ThemePicker() {
  const [choice, setChoice] = useState<ThemeChoice>(initialTheme);
  const set = (next: ThemeChoice) => {
    setChoice(next);
    applyTheme(next);
  };
  return (
    <>
      <label>
        Theme
        <select value={choice.theme} onChange={(e) => set({ ...choice, theme: e.target.value as ThemeName })}>
          {THEMES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        Mode
        <select value={choice.mode} onChange={(e) => set({ ...choice, mode: e.target.value as ThemeMode })}>
          {MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
