import { parse } from "yaml";

export type ThemeMode = "light" | "dark";
type Vars = Record<string, string>;
type HaTheme = Vars & { modes?: Partial<Record<ThemeMode, Vars>> };

/** Parses an HA themes YAML (`frontend: themes:` format) into one CSS rule per theme + mode. */
export function haThemesToCss(yamlText: string): { names: string[]; css: string } {
  const themes = parse(yamlText) as Record<string, HaTheme>;
  const rules: string[] = [];
  for (const [name, { modes, ...base }] of Object.entries(themes)) {
    for (const mode of ["light", "dark"] as const) {
      const vars = { ...base, ...modes?.[mode] };
      // card-mod keys are CSS for the card-mod plugin, not variables
      const body = Object.entries(vars)
        .filter(([k]) => !k.startsWith("card-mod-"))
        .map(([k, v]) => `  --${k}: ${v};`);
      rules.push(`html[data-theme=${JSON.stringify(name)}][data-mode="${mode}"] {\n  color-scheme: ${mode};\n${body.join("\n")}\n}`);
    }
  }
  return { names: Object.keys(themes), css: rules.join("\n\n") };
}
