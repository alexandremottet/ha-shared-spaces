import { WEEK_DAYS } from "../types";
import type { WeekDay } from "../types";
import type { Condition, RuleStrategy } from "./types";

export type RuleErrorCode =
  | "type"
  | "required"
  | "unknown_field"
  | "unknown_kind"
  | "time_format"
  | "time_order"
  | "range"
  | "empty"
  | "duplicate";

export interface RuleError {
  path: string;
  code: RuleErrorCode;
  message: string;
}

export type ValidationResult = { ok: true; strategy: RuleStrategy } | { ok: false; errors: RuleError[] };

export const TEMP_RANGE: [number, number] = [5, 35];
const LABEL_MAX = 60;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

const FIELDS: Record<string, string[]> = {
  occupied: [],
  occupied_within: ["hours"],
  between_days: ["gap_hours"],
  weekday: ["days"],
  time: ["start", "end"],
  planned: ["windows", "match"],
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

class Checker {
  errors: RuleError[] = [];

  err(path: string, code: RuleErrorCode, message: string): false {
    this.errors.push({ path, code, message });
    return false;
  }

  obj(v: unknown, path: string, allowed: string[]): v is Obj {
    if (!isObj(v)) return this.err(path, "type", "must be an object");
    for (const k of Object.keys(v)) if (!allowed.includes(k)) this.err(`${path}.${k}`, "unknown_field", `unknown field "${k}"`);
    return true;
  }

  has(o: Obj, key: string, path: string): boolean {
    return key in o || this.err(`${path}.${key}`, "required", `"${key}" is required`);
  }

  label(o: Obj, path: string): void {
    if (!this.has(o, "label", path)) return;
    const v = o.label;
    if (typeof v !== "string") this.err(`${path}.label`, "type", "must be a string");
    else if (!v.trim()) this.err(`${path}.label`, "empty", "must not be empty");
    else if (v.length > LABEL_MAX) this.err(`${path}.label`, "range", `at most ${LABEL_MAX} characters`);
  }

  number(v: unknown, path: string, min: number, max = Infinity): void {
    if (typeof v !== "number" || !Number.isFinite(v)) this.err(path, "type", "must be a number");
    else if (v < min || v > max) this.err(path, "range", max === Infinity ? `must be >= ${min}` : `must be between ${min} and ${max}`);
  }

  time(v: unknown, path: string, end = false): v is string {
    if (typeof v !== "string" || !TIME_RE.test(v)) return this.err(path, "time_format", 'must be "HH:MM"');
    if (v === "24:00" && !end) return this.err(path, "time_format", '"24:00" is only allowed as an end');
    return true;
  }

  window(o: Obj, path: string, wrap: boolean): void {
    const okStart = this.has(o, "start", path) && this.time(o.start, `${path}.start`);
    const okEnd = this.has(o, "end", path) && this.time(o.end, `${path}.end`, true);
    if (!okStart || !okEnd) return;
    const [a, b] = [minutes(o.start as string), minutes(o.end as string)];
    if (wrap ? a === b : a >= b) this.err(`${path}.end`, "time_order", wrap ? "start and end must differ" : "end must be after start");
  }

  action(v: unknown, path: string): void {
    if (!isObj(v)) return void this.err(path, "type", "must be an object");
    const kind = v.type;
    if (kind === "temperature") {
      this.obj(v, path, ["type", "value"]);
      if (this.has(v, "value", path)) this.number(v.value, `${path}.value`, ...TEMP_RANGE);
    } else if (kind === "comfort" || kind === "eco" || kind === "off") {
      this.obj(v, path, ["type"]);
    } else if (this.has(v, "type", path)) {
      this.err(`${path}.type`, "unknown_kind", `unknown action "${String(kind)}"`);
    }
  }

  condition(v: unknown, path: string): void {
    if (!isObj(v)) return void this.err(path, "type", "must be an object");
    const kind = v.type;
    if (typeof kind !== "string" || !(kind in FIELDS)) {
      if (this.has(v, "type", path)) this.err(`${path}.type`, "unknown_kind", `unknown condition "${String(kind)}"`);
      return;
    }
    this.obj(v, path, ["type", "negate", ...FIELDS[kind]]);
    if ("negate" in v && typeof v.negate !== "boolean") this.err(`${path}.negate`, "type", "must be a boolean");
    for (const f of FIELDS[kind]) if (!this.has(v, f, path)) return;
    switch (kind as Condition["type"]) {
      case "occupied_within":
        return this.number(v.hours, `${path}.hours`, 0);
      case "between_days":
        return this.number(v.gap_hours, `${path}.gap_hours`, 0);
      case "weekday":
        return this.days(v.days, `${path}.days`);
      case "time":
        return this.window(v, path, true);
      case "planned":
        if (v.match !== "all" && v.match !== "any") this.err(`${path}.match`, "unknown_kind", 'must be "all" or "any"');
        if (!Array.isArray(v.windows)) return void this.err(`${path}.windows`, "type", "must be a list");
        if (!v.windows.length) this.err(`${path}.windows`, "empty", "needs at least one window");
        v.windows.forEach((w, i) => {
          const p = `${path}.windows[${i}]`;
          if (this.obj(w, p, ["start", "end"])) this.window(w, p, false);
        });
    }
  }

  days(v: unknown, path: string): void {
    if (!Array.isArray(v)) return void this.err(path, "type", "must be a list");
    if (!v.length) this.err(path, "empty", "needs at least one day");
    const seen = new Set<unknown>();
    v.forEach((d, i) => {
      if (!WEEK_DAYS.includes(d as WeekDay)) this.err(`${path}[${i}]`, "unknown_kind", `unknown day "${String(d)}"`);
      else if (seen.has(d)) this.err(`${path}[${i}]`, "duplicate", `"${d}" listed twice`);
      seen.add(d);
    });
  }
}

/** Checks untrusted JSON against the rule strategy shape; returns every error found. */
export function validateStrategy(json: unknown): ValidationResult {
  const c = new Checker();
  if (c.obj(json, "$", ["version", "rules", "fallback"])) {
    if (c.has(json, "version", "$") && json.version !== 1) c.err("$.version", "unknown_kind", "unsupported version");
    if (c.has(json, "rules", "$")) {
      if (!Array.isArray(json.rules)) c.err("$.rules", "type", "must be a list");
      else
        json.rules.forEach((r, i) => {
          const p = `$.rules[${i}]`;
          if (!c.obj(r, p, ["label", "when", "then"])) return;
          c.label(r, p);
          if (c.has(r, "when", p)) {
            if (!Array.isArray(r.when)) c.err(`${p}.when`, "type", "must be a list");
            else r.when.forEach((cond, j) => c.condition(cond, `${p}.when[${j}]`));
          }
          if (c.has(r, "then", p)) c.action(r.then, `${p}.then`);
        });
    }
    if (c.has(json, "fallback", "$") && c.obj(json.fallback, "$.fallback", ["label", "then"])) {
      c.label(json.fallback, "$.fallback");
      if (c.has(json.fallback, "then", "$.fallback")) c.action(json.fallback.then, "$.fallback.then");
    }
  }
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, strategy: json as unknown as RuleStrategy };
}
