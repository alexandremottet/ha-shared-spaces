import type { WeekDay } from "../types";

/** "HH:MM" local wall time; "24:00" allowed as an end. */
export type HHMM = string;

interface ConditionBase {
  negate?: boolean;
}

export interface OccupiedCondition extends ConditionBase {
  type: "occupied";
}

/** Lead time at one outdoor temperature. */
export interface OutdoorPoint {
  temp: number;
  hours: number;
}

/** Lead time interpolated linearly between cold and warm (clamped); cold hours when the sensor has no number. */
export interface OutdoorHours {
  sensor: string;
  cold: OutdoorPoint;
  warm: OutdoorPoint;
}

/** next_on exists and now >= next_on - hours (fixed, or from the outdoor temperature). */
export interface OccupiedWithinCondition extends ConditionBase {
  type: "occupied_within";
  hours: number | OutdoorHours;
}

/** previous_off at most gap_hours ago and next_on at most gap_hours ahead. */
export interface BetweenDaysCondition extends ConditionBase {
  type: "between_days";
  gap_hours: number;
}

export interface WeekdayCondition extends ConditionBase {
  type: "weekday";
  days: WeekDay[];
}

/** start <= now < end (local); wraps past midnight when start > end. */
export interface TimeCondition extends ConditionBase {
  type: "time";
  start: HHMM;
  end: HHMM;
}

export interface TimeWindow {
  start: HHMM;
  end: HHMM;
}

/** Today's planning has an ON slot starting in every (all) or some (any) window. */
export interface PlannedCondition extends ConditionBase {
  type: "planned";
  windows: TimeWindow[];
  match: "all" | "any";
}

export type Condition =
  | OccupiedCondition
  | OccupiedWithinCondition
  | BetweenDaysCondition
  | WeekdayCondition
  | TimeCondition
  | PlannedCondition;

export type ConditionType = Condition["type"];

export type Action = { type: "comfort" } | { type: "eco" } | { type: "off" } | { type: "temperature"; value: number };

export type ActionType = Action["type"];

export interface Rule {
  label: string;
  when: Condition[];
  then: Action;
}

export interface Fallback {
  label: string;
  then: Action;
}

export interface RuleStrategy {
  version: 1;
  rules: Rule[];
  fallback: Fallback;
}

/** Zone preset temperatures used to preview comfort / eco actions. */
export interface PresetTemps {
  comfort: number;
  eco: number;
}

export const DEFAULT_PRESET_TEMPS: PresetTemps = { comfort: 21, eco: 17 };
