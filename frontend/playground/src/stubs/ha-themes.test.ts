import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { haThemesToCss } from "./ha-themes";

const yamlText = readFileSync(createRequire(import.meta.url).resolve("share-space-themes/share_space.yaml"), "utf8");

describe("share-space-themes YAML", () => {
  it("is valid HA theme shape: string vars plus light and dark modes", () => {
    const themes = parse(yamlText) as Record<string, Record<string, unknown>>;
    for (const [name, theme] of Object.entries(themes)) {
      expect(theme["card-mod-theme"]).toBe(name);
      const { modes, ...base } = theme as { modes: Record<string, Record<string, unknown>> };
      expect(Object.keys(modes).sort()).toEqual(["dark", "light"]);
      for (const vars of [base, modes.light, modes.dark]) {
        for (const [k, v] of Object.entries(vars)) {
          expect(typeof v, k).toBe("string");
          expect(k.startsWith("--"), k).toBe(false);
        }
      }
    }
  });

  it("builds one CSS rule per theme and mode, mode vars over base", () => {
    const { names, css } = haThemesToCss(yamlText);
    expect(names).toContain("Le Portemine");
    expect(css).toContain('html[data-theme="Le Portemine"][data-mode="dark"]');
    expect(css).toContain("--ha-card-backdrop-filter: blur(18px) saturate(1.5);");
    expect(css).toContain("--primary-color: #6f95f5;");
    expect(css).not.toContain("card-mod");
  });
});
