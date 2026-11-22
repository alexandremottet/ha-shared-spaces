import { WEEK_DAYS } from "../types";
import type { ScheduleRanges, StrategyEvaluation, StrategyResult } from "../heating/strategy-sim";
import { nextOn, occupiedAt, previousOff, toMinutes, windowMatches } from "../heating/strategy-sim";
import type { WallTime } from "../heating/tz";
import { wallTime } from "../heating/tz";
import type { Action, Condition, PresetTemps, RuleStrategy, TimeWindow } from "./types";
import { DEFAULT_PRESET_TEMPS } from "./types";
import { once } from "./once";
import type { OutdoorTemps } from "./outdoor";
import { leadHours } from "./outdoor";

const HOUR = 3600000;

/** Lazily computed facts about one instant. */
export interface RuleFacts {
  now: number;
  schedule: ScheduleRanges;
  tz: string;
  outdoor?: OutdoorTemps;
  occupied(): boolean;
  nextOn(): number | null;
  previousOff(): number | null;
  wall(): WallTime;
}

export function factsAt(schedule: ScheduleRanges, now: number, tz: string, outdoor?: OutdoorTemps): RuleFacts {
  return {
    now,
    schedule,
    tz,
    outdoor,
    occupied: once(() => occupiedAt(schedule, now, tz)),
    nextOn: once(() => nextOn(schedule, now, tz)),
    previousOff: once(() => previousOff(schedule, now, tz)),
    wall: once(() => wallTime(now, tz)),
  };
}

function holds(c: Condition, f: RuleFacts): boolean {
  switch (c.type) {
    case "occupied":
      return f.occupied();
    case "occupied_within": {
      const on = f.nextOn();
      return on !== null && f.now >= on - leadHours(c.hours, f.outdoor) * HOUR;
    }
    case "between_days": {
      const gap = c.gap_hours * HOUR;
      const off = f.previousOff();
      if (off === null || f.now - off > gap) return false;
      const on = f.nextOn();
      return on !== null && on - f.now <= gap;
    }
    case "weekday":
      return c.days.includes(WEEK_DAYS[f.wall().weekday]);
    case "time": {
      const w = f.wall();
      const m = w.hour * 60 + w.minute;
      const a = toMinutes(c.start);
      const b = toMinutes(c.end);
      return a < b ? m >= a && m < b : m >= a || m < b;
    }
    case "planned": {
      const day = WEEK_DAYS[f.wall().weekday];
      const hit = (w: TimeWindow) => windowMatches(f.schedule, day, w.start, w.end, f.tz);
      return c.match === "any" ? c.windows.some(hit) : c.windows.every(hit);
    }
  }
}

export const conditionMatches = (c: Condition, f: RuleFacts): boolean => holds(c, f) !== !!c.negate;

export function actionResult(a: Action, temps: PresetTemps): StrategyResult {
  switch (a.type) {
    case "off":
      return { off: true };
    case "temperature":
      return { target: a.value };
    default:
      return { target: temps[a.type], preset: a.type };
  }
}

export function evaluateFacts(strategy: RuleStrategy, f: RuleFacts, temps: PresetTemps = DEFAULT_PRESET_TEMPS): StrategyEvaluation {
  for (const rule of strategy.rules) {
    if (rule.when.every((c) => conditionMatches(c, f))) return { result: actionResult(rule.then, temps), reason: rule.label };
  }
  return { result: actionResult(strategy.fallback.then, temps), reason: strategy.fallback.label };
}

/** First matching rule wins, else the fallback; reason is the label. */
export function evaluateRules(
  strategy: RuleStrategy,
  schedule: ScheduleRanges,
  now: number,
  tz: string,
  temps: PresetTemps = DEFAULT_PRESET_TEMPS,
  outdoor?: OutdoorTemps,
): StrategyEvaluation {
  return evaluateFacts(strategy, factsAt(schedule, now, tz, outdoor), temps);
}
