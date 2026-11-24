import { t } from "../../i18n";
import type { Action, ActionType, Condition, ConditionType, CurveValue, Rule, RuleStrategy, Value } from "../types";
import type { RuleError } from "../validate";
import { OUTDOOR } from "../value";

export const CONDITION_TYPES: ConditionType[] = ["occupied", "occupied_within", "between_days", "weekday", "time", "planned", "sensor", "state", "heated"];
export const ACTION_TYPES: ActionType[] = ["comfort", "eco", "off", "temperature"];

/** Beginner-facing names, in the order of the type select. */
export const conditionLabel = (type: ConditionType): string =>
  ({
    occupied: t("Area occupied"),
    occupied_within: t("Occupied again within"),
    between_days: t("Between working days"),
    weekday: t("Day of week"),
    time: t("Time between"),
    planned: t("Planned during"),
    sensor: t("Outdoor temperature"),
    state: t("Entity state"),
    heated: t("Another area heated"),
  })[type];

export const actionLabel = (type: ActionType): string =>
  ({ comfort: t("Comfort"), eco: t("Eco"), off: t("Off"), temperature: t("Temperature") })[type];

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
const shortEntity = (id: string) => (id === OUTDOOR ? t("outdoor") : id ? id.split(".").pop()!.replace(/_/g, " ") : t("sensor"));
const DAY_SHORT: Record<string, () => string> = {
  mon: () => t("mon"),
  tue: () => t("tue"),
  wed: () => t("wed"),
  thu: () => t("thu"),
  fri: () => t("fri"),
  sat: () => t("sat"),
  sun: () => t("sun"),
};

/** "3 h", or "9 → 1 h (outdoor temp)" for a curve. */
export function describeValue(v: Value, unit: ValueUnit): string {
  if (typeof v === "number") return `${fmt(v)} ${unit}`;
  const vals = v.points.map((p) => p.value);
  return `${fmt(vals[0])} → ${fmt(vals[vals.length - 1])} ${unit} (${shortEntity(v.entity)})`;
}

/** One-line node text for the graph. */
export function describeCondition(c: Condition, areaNames: Record<string, string> = {}): string {
  const text = describePositive(c, areaNames);
  return c.negate ? t("not {text}", { text }) : text;
}

function describePositive(c: Condition, areaNames: Record<string, string>): string {
  switch (c.type) {
    case "occupied":
      return t("occupied");
    case "occupied_within":
      return t("occupied within {value}", { value: describeValue(c.hours, "h") });
    case "between_days":
      return t("between days (≤ {hours} h)", { hours: fmt(c.gap_hours) });
    case "weekday":
      return c.days.length === 7 ? t("every day") : c.days.map((d) => DAY_SHORT[d.slice(0, 3)]()).join(", ");
    case "time":
      return `${c.start}–${c.end}`;
    case "planned": {
      const windows = c.windows.map((w) => `${w.start}–${w.end}`).join(c.match === "any" ? ` ${t("or")} ` : ` ${t("and")} `);
      return c.who === "anyone" ? t("someone planned {windows}", { windows }) : t("planned {windows}", { windows });
    }
    case "sensor":
      return `${c.entity === OUTDOOR ? t("outdoor") : shortEntity(c.entity)} ${c.op === "below" ? "<" : ">"} ${fmt(c.than)}`;
    case "state":
      return t("{entity} is {state}", { entity: shortEntity(c.entity), state: c.is });
    case "heated":
      return t("{areas} heated", { areas: c.areas.map((a) => areaNames[a] ?? a.replace(/_/g, " ")).join(` ${t("or")} `) || t("an area") });
  }
}

export function describeAction(a: Action): string {
  return a.type === "temperature" ? describeValue(a.value, "°C") : actionLabel(a.type);
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
  return { label: t("New rule"), when: [defaultCondition("occupied")], then: { type: "comfort" } };
}

export const withRules = (s: RuleStrategy, rules: Rule[]): RuleStrategy => ({ ...s, rules });
