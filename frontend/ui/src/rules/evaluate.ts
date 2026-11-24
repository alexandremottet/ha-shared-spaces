import { WEEK_DAYS } from "../types";
import type { ScheduleRanges, StrategyEvaluation, StrategyResult } from "../heating/strategy-sim";
import { nextOn, occupiedAt, previousOff, toMinutes, windowMatches } from "../heating/strategy-sim";
import type { WallTime } from "../heating/tz";
import { wallTime } from "../heating/tz";
import type { Action, Condition, PersonPlannings, PresetTemps, RuleStrategy, TimeWindow } from "./types";
import { DEFAULT_PRESET_TEMPS } from "./types";
import { once } from "./once";
import type { EntityStates, SensorReadings } from "./value";
import { evalValue, temperatureOf, heatedKey } from "./value";

const HOUR = 3600000;

/** Lazily computed facts about one instant. */
export interface RuleFacts {
  now: number;
  schedule: ScheduleRanges;
  tz: string;
  readings?: SensorReadings;
  states?: EntityStates;
  plannings?: PersonPlannings;
  occupied(): boolean;
  nextOn(): number | null;
  previousOff(): number | null;
  wall(): WallTime;
}

export function factsAt(schedule: ScheduleRanges, now: number, tz: string, readings?: SensorReadings, states?: EntityStates, plannings?: PersonPlannings): RuleFacts {
  return {
    now,
    schedule,
    tz,
    readings,
    states,
    plannings,
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
      return on !== null && f.now >= on - Math.max(0, evalValue(c.hours, f.readings)) * HOUR;
    }
    case "between_days": {
      const off = f.previousOff();
      const on = f.nextOn();
      return !f.occupied() && off !== null && on !== null && on - off <= c.gap_hours * HOUR;
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
      // "anyone": one same person must match, each person's planning on its own
      const schedules = c.who === "anyone" ? Object.values(f.plannings ?? {}) : [f.schedule];
      return schedules.some((s) => {
        const hit = (w: TimeWindow) => windowMatches(s, day, w.start, w.end, f.tz);
        return c.match === "any" ? c.windows.some(hit) : c.windows.every(hit);
      });
    }
    case "sensor": {
      const r = f.readings?.[c.entity];
      if (r === undefined || !Number.isFinite(r)) return false;
      return c.op === "below" ? r < c.than : r > c.than;
    }
    case "state":
      return f.states?.[c.entity] === c.is;
    case "heated":
      return c.areas.some((a) => f.states?.[heatedKey(a)] === "on");
  }
}

export const conditionMatches = (c: Condition, f: RuleFacts): boolean => holds(c, f) !== !!c.negate;

export function actionResult(a: Action, temps: PresetTemps, readings?: SensorReadings): StrategyResult {
  switch (a.type) {
    case "off":
      return { off: true };
    case "temperature":
      return { target: temperatureOf(a.value, readings) };
    default:
      return { target: temps[a.type], preset: a.type };
  }
}

export function evaluateFacts(strategy: RuleStrategy, f: RuleFacts, temps: PresetTemps = DEFAULT_PRESET_TEMPS): StrategyEvaluation {
  for (const rule of strategy.rules) {
    if (rule.when.every((c) => conditionMatches(c, f))) return { result: actionResult(rule.then, temps, f.readings), reason: rule.label };
  }
  return { result: actionResult(strategy.fallback.then, temps, f.readings), reason: strategy.fallback.label };
}

/** First matching rule wins, else the fallback; reason is the label. */
export function evaluateRules(
  strategy: RuleStrategy,
  schedule: ScheduleRanges,
  now: number,
  tz: string,
  temps: PresetTemps = DEFAULT_PRESET_TEMPS,
  readings?: SensorReadings,
  states?: EntityStates,
  plannings?: PersonPlannings,
): StrategyEvaluation {
  return evaluateFacts(strategy, factsAt(schedule, now, tz, readings, states, plannings), temps);
}
