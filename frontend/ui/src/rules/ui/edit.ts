import type { Action, ActionType, Condition, ConditionType, CurveValue, Rule, RuleStrategy, Value } from "../types";
import type { RuleError } from "../validate";
import { OUTDOOR } from "../value";

/** Beginner-facing names, in the order of the type select. */
export const CONDITION_LABELS: Record<ConditionType, string> = {
  occupied: "Area occupied",
  occupied_within: "Occupied again within",
  between_days: "Between working days",
  weekday: "Day of week",
  time: "Time between",
  planned: "Planned during",
  sensor: "Outdoor temperature",
  state: "Entity state",
  heated: "Another area heated",
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
    case "sensor":
      return { type, entity: OUTDOOR, op: "below", than: 5 };
    case "state":
      return { type, entity: "", is: "on" };
    case "heated":
      return { type, areas: [] };
  }
}

export type ValueUnit = "h" | "°C";

/** Starting curve when a value switches to "Follow outdoor temperature", around the current fixed value. */
export function defaultCurve(unit: ValueUnit, fixed: number): CurveValue {
  const points =
    unit === "h"
      ? [{ at: 0, value: Math.max(fixed, 1) * 2 }, { at: 15, value: Math.max(fixed, 1) }]
      : [{ at: -5, value: Math.min(fixed + 2, 35) }, { at: 15, value: fixed }];
  return { type: "curve", entity: OUTDOOR, default: 10, points };
}

/** Value back to a fixed number: the curve's last point. */
export const fixedOf = (v: Value): number => (typeof v === "number" ? v : v.points[v.points.length - 1]?.value ?? 0);

const fmt = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 10) / 10) : "?");
const shortEntity = (id: string) => (id === OUTDOOR ? "outdoor" : id ? id.split(".").pop()!.replace(/_/g, " ") : "sensor");

/** "3 h", or "9 → 1 h (outdoor temp)" for a curve. */
export function describeValue(v: Value, unit: ValueUnit): string {
  if (typeof v === "number") return `${fmt(v)} ${unit}`;
  const vals = v.points.map((p) => p.value);
  return `${fmt(vals[0])} → ${fmt(vals[vals.length - 1])} ${unit} (${shortEntity(v.entity)})`;
}

/** One-line node text for the graph. */
export function describeCondition(c: Condition, areaNames: Record<string, string> = {}): string {
  const not = c.negate ? "not " : "";
  switch (c.type) {
    case "occupied":
      return `${not}occupied`;
    case "occupied_within":
      return `${not}occupied within ${describeValue(c.hours, "h")}`;
    case "between_days":
      return `${not}between days (≤ ${fmt(c.gap_hours)} h)`;
    case "weekday":
      return `${not}${c.days.length === 7 ? "every day" : c.days.map((d) => d.slice(0, 3)).join(", ")}`;
    case "time":
      return `${not}${c.start}–${c.end}`;
    case "planned":
      return `${not}planned ${c.windows.map((w) => `${w.start}–${w.end}`).join(c.match === "any" ? " or " : " and ")}`;
    case "sensor":
      return `${not}${c.entity === OUTDOOR ? "outdoor" : shortEntity(c.entity)} ${c.op === "below" ? "<" : ">"} ${fmt(c.than)}`;
    case "state":
      return `${not}${shortEntity(c.entity)} is ${c.is}`;
    case "heated":
      return `${not}${c.areas.map((a) => areaNames[a] ?? a.replace(/_/g, " ")).join(" or ") || "an area"} heated`;
  }
}

export function describeAction(a: Action): string {
  return a.type === "temperature" ? describeValue(a.value, "°C") : ACTION_LABELS[a.type];
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
