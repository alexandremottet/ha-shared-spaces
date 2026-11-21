import type { WeekDay } from "../types";
import { WEEK_DAYS } from "../types";
import { fromWall, wallTime } from "./tz";

export type StrategyPreset = "office_saver" | "lunch_room";
export type ScheduleRanges = Partial<Record<WeekDay, Array<[string, string]>>>;
export type StrategyResult = { off: true } | { target: number };
export interface StrategyEvaluation {
  result: StrategyResult;
  reason: string;
}
export interface StrategySegment extends StrategyEvaluation {
  start: number;
  end: number;
}

export interface OfficeSaverInputs {
  comfort_temp: number;
  setback_temp: number;
  preheat_hours: number;
  max_gap_hours: number;
}

export interface LunchRoomInputs {
  morning_start: string;
  morning_end: string;
  afternoon_start: string;
  afternoon_end: string;
  heat_start: string;
  heat_end: string;
  temperature: number;
  match: "all" | "any";
}

export type StrategyInputs = OfficeSaverInputs | LunchRoomInputs;

export const DEFAULT_OFFICE_SAVER: OfficeSaverInputs = { comfort_temp: 21, setback_temp: 16, preheat_hours: 6, max_gap_hours: 24 };
export const DEFAULT_LUNCH_ROOM: LunchRoomInputs = {
  morning_start: "11:00",
  morning_end: "12:00",
  afternoon_start: "13:00",
  afternoon_end: "14:00",
  heat_start: "11:00",
  heat_end: "14:00",
  temperature: 20,
  match: "all",
};

export const STRATEGY_LABELS: Record<StrategyPreset, string> = { office_saver: "Office saver", lunch_room: "Lunch room" };

export const defaultInputs = (preset: StrategyPreset): StrategyInputs =>
  preset === "office_saver" ? { ...DEFAULT_OFFICE_SAVER } : { ...DEFAULT_LUNCH_ROOM };

const SLOT_MS = 30 * 60000;
const SEARCH_SLOTS = 8 * 48;
const HOUR = 3600000;

export const toMinutes = (t: string): number => {
  const [h, m] = t.split(":", 2).map(Number);
  return h * 60 + m;
};

const slotStart = (ms: number, tz: string): number => {
  const w = wallTime(ms, tz);
  return Math.floor(ms / 60000) * 60000 - (w.minute % 30) * 60000;
};

interface Planner {
  tz: string;
  days: Record<WeekDay, Set<number>>;
}

const planners = new WeakMap<object, Map<string, Planner>>();

function plannerFor(schedule: ScheduleRanges, tz: string): Planner {
  let byTz = planners.get(schedule);
  if (!byTz) planners.set(schedule, (byTz = new Map()));
  let p = byTz.get(tz);
  if (!p) {
    const days = {} as Record<WeekDay, Set<number>>;
    for (const day of WEEK_DAYS) {
      const set = new Set<number>();
      for (const [a, b] of schedule[day] ?? []) {
        for (let s = Math.floor(toMinutes(a) / 30) * 30; s < toMinutes(b); s += 30) set.add(s);
      }
      days[day] = set;
    }
    byTz.set(tz, (p = { tz, days }));
  }
  return p;
}

function slotOn(p: Planner, ms: number): boolean {
  const w = wallTime(ms, p.tz);
  const key = Math.floor((w.hour * 60 + w.minute) / 30) * 30;
  const day = WEEK_DAYS[w.weekday];
  return p.days[day].has(key);
}

export function occupiedAt(schedule: ScheduleRanges, ms: number, tz: string): boolean {
  return slotOn(plannerFor(schedule, tz), slotStart(ms, tz));
}

export function nextOn(schedule: ScheduleRanges, ms: number, tz: string): number | null {
  const p = plannerFor(schedule, tz);
  let prev = slotOn(p, slotStart(ms, tz));
  for (let i = 1; i <= SEARCH_SLOTS; i++) {
    const t = slotStart(ms, tz) + i * SLOT_MS;
    const on = slotOn(p, t);
    if (on && !prev) return t;
    prev = on;
  }
  return null;
}

export function nextOff(schedule: ScheduleRanges, ms: number, tz: string): number | null {
  const p = plannerFor(schedule, tz);
  let prev = slotOn(p, slotStart(ms, tz));
  for (let i = 1; i <= SEARCH_SLOTS; i++) {
    const t = slotStart(ms, tz) + i * SLOT_MS;
    const on = slotOn(p, t);
    if (!on && prev) return t;
    prev = on;
  }
  return null;
}

export function previousOff(schedule: ScheduleRanges, ms: number, tz: string): number | null {
  const p = plannerFor(schedule, tz);
  for (let i = 0; i <= SEARCH_SLOTS; i++) {
    const t = slotStart(ms, tz) - i * SLOT_MS;
    if (!slotOn(p, t) && slotOn(p, t - SLOT_MS)) return t;
  }
  return null;
}

export function windowMatches(schedule: ScheduleRanges, day: WeekDay, start: string, end: string, tz = "UTC"): boolean {
  const slots = plannerFor(schedule, tz).days[day];
  const a = toMinutes(start);
  const b = toMinutes(end);
  for (const s of slots) if (s >= a && s < b) return true;
  return false;
}

function officeSaverRule(
  inputs: OfficeSaverInputs,
  now: number,
  occupied: boolean,
  nextOnAt: () => number | null,
  previousOffAt: () => number | null,
): StrategyEvaluation {
  if (occupied) return { result: { target: inputs.comfort_temp }, reason: "Occupied" };
  const on = nextOnAt();
  if (on !== null && now >= on - inputs.preheat_hours * HOUR) return { result: { target: inputs.comfort_temp }, reason: "Preheat" };
  const off = previousOffAt();
  const gap = inputs.max_gap_hours * HOUR;
  if (off !== null && now - off <= gap && on !== null && on - now <= gap) {
    return { result: { target: inputs.setback_temp }, reason: "Between working days" };
  }
  return { result: { off: true }, reason: "Away" };
}

export function evaluateOfficeSaver(inputs: OfficeSaverInputs, schedule: ScheduleRanges, now: number, tz: string): StrategyEvaluation {
  return officeSaverRule(
    inputs,
    now,
    occupiedAt(schedule, now, tz),
    () => nextOn(schedule, now, tz),
    () => previousOff(schedule, now, tz),
  );
}

export function evaluateLunchRoom(inputs: LunchRoomInputs, schedule: ScheduleRanges, now: number, tz: string): StrategyEvaluation {
  const w = wallTime(now, tz);
  const minute = w.hour * 60 + w.minute;
  if (minute < toMinutes(inputs.heat_start) || minute >= toMinutes(inputs.heat_end)) {
    return { result: { off: true }, reason: "Outside lunch hours" };
  }
  const day = WEEK_DAYS[w.weekday];
  const matches = [
    windowMatches(schedule, day, inputs.morning_start, inputs.morning_end, tz),
    windowMatches(schedule, day, inputs.afternoon_start, inputs.afternoon_end, tz),
  ];
  const occupied = inputs.match === "any" ? matches.some(Boolean) : matches.every(Boolean);
  return occupied
    ? { result: { target: inputs.temperature }, reason: "Lunch" }
    : { result: { off: true }, reason: "No lunch today" };
}

export function evaluate(
  preset: StrategyPreset,
  inputs: StrategyInputs,
  schedule: ScheduleRanges,
  now: number,
  tz: string,
): StrategyEvaluation {
  return preset === "office_saver"
    ? evaluateOfficeSaver(inputs as OfficeSaverInputs, schedule, now, tz)
    : evaluateLunchRoom(inputs as LunchRoomInputs, schedule, now, tz);
}

export const sameResult = (a: StrategyEvaluation, b: StrategyEvaluation): boolean =>
  a.reason === b.reason && ("off" in a.result ? "off" in b.result : "target" in b.result && a.result.target === b.result.target);

interface Timeline {
  cuts: number[];
  at(t: number): StrategyEvaluation;
}

// Occupancy facts from one pass over the slots; mirrors nextOn/previousOff search windows exactly.
function officeSaverTimeline(inputs: OfficeSaverInputs, schedule: ScheduleRanges, start: number, end: number, tz: string): Timeline {
  const p = plannerFor(schedule, tz);
  const t0 = slotStart(start, tz);
  const pad = SEARCH_SLOTS + 1;
  const first = t0 - pad * SLOT_MS;
  const n = Math.ceil((end - t0) / SLOT_MS) + 2 * pad;
  const on = Array.from({ length: n }, (_, k) => slotOn(p, first + k * SLOT_MS));
  const time = (k: number) => first + k * SLOT_MS;
  const cuts: number[] = [];
  for (let k = 1; k < n; k++) {
    if (on[k] === on[k - 1]) continue;
    const t = time(k);
    if (on[k]) cuts.push(t - inputs.preheat_hours * HOUR, t - inputs.max_gap_hours * HOUR);
    else cuts.push(t + inputs.max_gap_hours * HOUR);
  }
  for (let t = t0; t < end; t += SLOT_MS) cuts.push(t);
  return {
    cuts,
    at(t) {
      const idx = pad + Math.floor((t - t0) / SLOT_MS);
      const nextOnAt = () => {
        for (let j = idx + 1; j <= idx + SEARCH_SLOTS; j++) if (on[j] && !on[j - 1]) return time(j);
        return null;
      };
      const previousOffAt = () => {
        for (let j = idx; j >= idx - SEARCH_SLOTS; j--) if (!on[j] && on[j - 1]) return time(j);
        return null;
      };
      return officeSaverRule(inputs, t, on[idx], nextOnAt, previousOffAt);
    },
  };
}

function lunchRoomTimeline(inputs: LunchRoomInputs, schedule: ScheduleRanges, start: number, end: number, tz: string): Timeline {
  const cuts: number[] = [];
  const w = wallTime(start, tz);
  const days = Math.ceil((end - start) / (24 * HOUR)) + 1;
  for (let i = 0; i <= days; i++) {
    for (const hm of ["00:00", inputs.heat_start, inputs.heat_end]) {
      const m = toMinutes(hm);
      cuts.push(fromWall(tz, w.year, w.month, w.day + i, Math.floor(m / 60), m % 60));
    }
  }
  return { cuts, at: (t) => evaluateLunchRoom(inputs, schedule, t, tz) };
}

/** Exact strategy segments over [start, end): result is constant between schedule-derived breakpoints. */
export function strategyTimeline(
  preset: StrategyPreset,
  inputs: StrategyInputs,
  schedule: ScheduleRanges,
  start: number,
  end: number,
  tz: string,
): StrategySegment[] {
  const timeline =
    preset === "office_saver"
      ? officeSaverTimeline(inputs as OfficeSaverInputs, schedule, start, end, tz)
      : lunchRoomTimeline(inputs as LunchRoomInputs, schedule, start, end, tz);
  const bounds = [...new Set([start, end, ...timeline.cuts.filter((t) => t > start && t < end)])].sort((a, b) => a - b);
  const segments: StrategySegment[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const ev = timeline.at((bounds[i] + bounds[i + 1]) / 2);
    const last = segments[segments.length - 1];
    if (last && sameResult(last, ev)) last.end = bounds[i + 1];
    else segments.push({ start: bounds[i], end: bounds[i + 1], ...ev });
  }
  return segments;
}
