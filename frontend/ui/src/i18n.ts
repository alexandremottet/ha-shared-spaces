/**
 * Interface text in the user's Home Assistant language. Source strings are the English text,
 * passed to `t`; each language registers a dictionary keyed by that English text. Languages
 * other than English fall back to French, Share Space's default.
 */
export type Translations = Record<string, string>;

const dictionaries: Record<string, Translations> = {};
const SUPPORTED = ["en", "fr"];
const DEFAULT_LANGUAGE = "fr";
let current = DEFAULT_LANGUAGE;

export function registerTranslations(language: string, translations: Translations): void {
  dictionaries[language] = { ...dictionaries[language], ...translations };
}

/** Language to show for an HA language tag ("fr", "en-GB"...): supported ones as is, else French. */
export function resolveLanguage(tag?: string | null): string {
  const base = (tag ?? "").toLowerCase().split(/[-_]/)[0];
  return SUPPORTED.includes(base) ? base : DEFAULT_LANGUAGE;
}

/** Follows the signed-in user's HA language; returns true when it changed. */
export function setLanguage(tag?: string | null): boolean {
  const next = resolveLanguage(tag);
  if (next === current) return false;
  current = next;
  return true;
}

export function language(): string {
  return current;
}

/** `text` in the current language; `{name}` placeholders take `vars[name]`. */
export function t(text: string, vars?: Record<string, string | number>): string {
  const out = current === "en" ? text : dictionaries[current]?.[text] ?? text;
  return vars ? out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : out;
}
