import type { Action, ActionType, Condition, ConditionType, OutdoorHours, Rule, RuleStrategy } from "../types";
import type { RuleError } from "../validate";

/** Beginner-facing names, in the order of the type select. */
export const CONDITION_LABELS: Record<ConditionType, string> = {
  occupied: "Area occupied",
  occupied_within: "Occupied again within",
  between_days: "Between working days",
  weekday: "Day of week",
  time: "Time between",
  planned: "Planned during",
};

export const ACTION_LABELS: Record<ActionType, string> = {
  comfort: "Comfort",
  eco: "Eco",
  off: "Off",
  temperature: "Temperature",
};

export const DEFAULT_TEMPERATURE = 20;

export function defaultCondition(type: ConditionType): Condition {
  switch (type) {
    case "occupied":
      return { type };
    case "occupied_within":
      return { type, hours: 2 };
    case "between_days":
      return { type, gap_hours: 14 };
    case "weekday":
      return { type, days: ["monday", "tuesday", "wednesday", "thursday", "friday"] };
    case "time":
      return { type, start: "08:00", end: "18:00" };
    case "planned":
      return { type, windows: [{ start: "08:00", end: "12:00" }], match: "any" };
  }
}

/** Starting point when a lead time switches to outdoor-based: 6 h at 10 °C down to 1 h at 20 °C. */
export function defaultOutdoorHours(sensor = ""): OutdoorHours {
  return { sensor, cold: { temp: 10, hours: 6 }, warm: { temp: 20, hours: 1 } };
}

export function defaultAction(type: ActionType): Action {
  return type === "temperature" ? { type, value: DEFAULT_TEMPERATURE } : { type };
}

/** Same type keeps the fields (and negate); a new type starts from its defaults. */
export function changeConditionType(c: Condition, type: ConditionType): Condition {
  if (c.type === type) return c;
  const next = defaultCondition(type);
  return c.negate ? { ...next, negate: true } : next;
}

export function changeActionType(a: Action, type: ActionType): Action {
  return a.type === type ? a : defaultAction(type);
}

export const replaceAt = <T>(list: readonly T[], index: number, item: T): T[] => list.map((x, i) => (i === index ? item : x));

export const removeAt = <T>(list: readonly T[], index: number): T[] => list.filter((_, i) => i !== index);

/** Moves one item; out-of-range targets are clamped, no-ops return the same list. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return [...list];
  const target = Math.max(0, Math.min(list.length - 1, to));
  if (target === from) return [...list];
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(target, 0, item);
  return out;
}

export const toggleDay = <D extends string>(days: readonly D[], day: D, order: readonly D[]): D[] => {
  const set = new Set(days);
  if (set.has(day)) set.delete(day);
  else set.add(day);
  return order.filter((d) => set.has(d));
};

/** Parses the text of a number field; empty / invalid gives null. */
export function parseNumber(text: string): number | null {
  if (!text.trim()) return null;
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Errors under `prefix` (e.g. "$.rules[1]") with the prefix stripped: ".label", ".when[0].hours". */
export function scopeErrors(errors: readonly RuleError[], prefix: string): RuleError[] {
  return errors
    .filter((e) => e.path === prefix || e.path.startsWith(`${prefix}.`) || e.path.startsWith(`${prefix}[`))
    .map((e) => ({ ...e, path: e.path.slice(prefix.length) }));
}

export function blankRule(): Rule {
  return { label: "New rule", when: [defaultCondition("occupied")], then: { type: "comfort" } };
}

export const withRules = (s: RuleStrategy, rules: Rule[]): RuleStrategy => ({ ...s, rules });
