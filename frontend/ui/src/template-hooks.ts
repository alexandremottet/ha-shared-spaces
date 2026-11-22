export interface TemplateVariable {
  name: string;
  description: string;
}

export interface TemplateSnippet {
  label: string;
  code: string;
}

export interface TemplateHook {
  title: string;
  returns: string;
  defaultText: string;
  variables: TemplateVariable[];
  snippets: TemplateSnippet[];
}

export interface TemplateEntity {
  entity_id: string;
  name: string;
}

export interface TemplateResult {
  value?: string;
  error?: string;
}

/** The "Zone target" hook of share_space_heating. */
export const ZONE_TARGET_HOOK: TemplateHook = {
  title: "Zone target",
  returns: "A temperature between 5 and 35, or comfort, eco, off. Empty or none keeps the zone's normal behaviour.",
  defaultText: "the zone's mode (simple or strategy)",
  variables: [
    { name: "zone", description: "entity id of the zone sensor" },
    { name: "comfort", description: "the zone's comfort temperature" },
    { name: "eco", description: "the zone's eco temperature" },
    { name: "base", description: "target the zone would use without the template (number or none)" },
  ],
  snippets: [
    { label: "Comfort when a sensor is on", code: "{{ 'comfort' if is_state('binary_sensor.x', 'on') else 'eco' }}" },
    { label: "Off on weekends", code: "{{ 'off' if now().weekday() >= 5 else 'none' }}" },
    { label: "Temperature from a sensor", code: "{{ states('sensor.x') | float(0) }}" },
    { label: "Keep the default target", code: "{{ base }}" },
  ],
};

/** Insert `snippet` over [start, end) of `text`; returns the new text and cursor position. */
export function insertSnippet(text: string, snippet: string, start?: number, end?: number): { value: string; cursor: number } {
  const s = start === undefined ? text.length : Math.max(0, Math.min(start, text.length));
  const e = end === undefined ? s : Math.max(s, Math.min(end, text.length));
  return { value: text.slice(0, s) + snippet + text.slice(e), cursor: s + snippet.length };
}

export const entityRef = (id: string): string => `states('${id}')`;

/** Debounce with cancel; the last call wins. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): ((...args: A) => void) & { cancel(): void } {
  let t: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: A): void => {
    if (t !== undefined) clearTimeout(t);
    t = setTimeout(() => {
      t = undefined;
      fn(...args);
    }, ms);
  };
  wrapped.cancel = (): void => {
    if (t !== undefined) clearTimeout(t);
    t = undefined;
  };
  return wrapped;
}
